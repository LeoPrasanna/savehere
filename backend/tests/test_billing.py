"""RevenueCat webhook -> Supabase tier stamp.

This endpoint mints revenue entitlements, so the behavior is locked here before
it's wired into main.py. The Supabase admin PUT is mocked — no network, no real
tier writes. Each test asserts on whether (and with what tier) that PUT fires.

Mounts the billing router on a throwaway FastAPI app so the test is independent
of whether main.py has registered it yet.
"""
import pytest
from unittest.mock import MagicMock
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.config import settings
from app.routes import billing

TOKEN = "test-webhook-secret"
USER = "supabase-user-123"


@pytest.fixture
def client(monkeypatch):
    # Fail-closed unless configured: give the webhook a token and fake Supabase
    # admin creds so `_set_tier`'s guard passes.
    monkeypatch.setattr(settings, "REVENUECAT_WEBHOOK_TOKEN", TOKEN)
    monkeypatch.setattr(settings, "SUPABASE_URL", "https://proj.supabase.co")
    monkeypatch.setattr(settings, "SUPABASE_SERVICE_ROLE_KEY", "service-role-key")

    # Mock the admin PUT so nothing hits the network; capture calls for assertions.
    put_mock = MagicMock(return_value=MagicMock(raise_for_status=lambda: None))
    monkeypatch.setattr(billing.httpx, "put", put_mock)

    app = FastAPI()
    app.include_router(billing.router)
    client = TestClient(app)
    client.put_mock = put_mock  # tests read this to inspect the admin call
    return client


def _post(client, event_type, *, user_id=USER, token=TOKEN):
    headers = {"Authorization": token} if token is not None else {}
    return client.post(
        "/api/billing/revenuecat",
        json={"event": {"type": event_type, "app_user_id": user_id}},
        headers=headers,
    )


def _tier_written(put_mock):
    """The tier value from the last admin PUT, or None if none was made."""
    if not put_mock.called:
        return None
    _, kwargs = put_mock.call_args
    return kwargs["json"]["app_metadata"]["tier"]


class TestRevenueCatWebhook:
    @pytest.mark.parametrize("event_type", [
        "INITIAL_PURCHASE", "RENEWAL", "UNCANCELLATION",
        "NON_RENEWING_PURCHASE", "PRODUCT_CHANGE",
    ])
    def test_grant_events_set_pro(self, client, event_type):
        res = _post(client, event_type)
        assert res.status_code == 200
        assert _tier_written(client.put_mock) == "pro"
        # The PUT targets the right user.
        assert USER in client.put_mock.call_args[0][0]

    def test_expiration_sets_free(self, client):
        res = _post(client, "EXPIRATION")
        assert res.status_code == 200
        assert _tier_written(client.put_mock) == "free"

    def test_cancellation_does_not_change_tier(self, client):
        # CANCELLATION = auto-renew off; the user keeps pro until EXPIRATION.
        # Writing free here would yank a paying customer's access mid-cycle.
        res = _post(client, "CANCELLATION")
        assert res.status_code == 200
        assert not client.put_mock.called

    @pytest.mark.parametrize("event_type", ["BILLING_ISSUE", "TRANSFER", "TEST"])
    def test_non_entitlement_events_are_noops(self, client, event_type):
        res = _post(client, event_type)
        assert res.status_code == 200
        assert not client.put_mock.called

    def test_bad_token_rejected_and_touches_no_tier(self, client):
        res = _post(client, "INITIAL_PURCHASE", token="wrong-secret")
        assert res.status_code == 401
        assert not client.put_mock.called

    def test_missing_token_rejected(self, client):
        res = _post(client, "INITIAL_PURCHASE", token=None)
        assert res.status_code == 401
        assert not client.put_mock.called

    def test_unset_server_token_is_fail_closed(self, client, monkeypatch):
        # Even a caller sending an empty Authorization must not match an unset
        # server token — otherwise an unconfigured deploy would accept anyone.
        monkeypatch.setattr(settings, "REVENUECAT_WEBHOOK_TOKEN", "")
        res = _post(client, "INITIAL_PURCHASE", token="")
        assert res.status_code == 401
        assert not client.put_mock.called

    def test_anonymous_user_is_ignored_not_charged(self, client):
        # App didn't call Purchases.logIn(supabaseUserId): 200 so RevenueCat
        # stops retrying, but no tier write (there's no user to map to).
        res = _post(client, "INITIAL_PURCHASE", user_id="$RCAnonymousID:abc123")
        assert res.status_code == 200
        assert res.json()["status"] == "ignored"
        assert not client.put_mock.called

    def test_missing_user_id_is_ignored(self, client):
        res = client.post(
            "/api/billing/revenuecat",
            json={"event": {"type": "INITIAL_PURCHASE"}},  # no app_user_id
            headers={"Authorization": TOKEN},
        )
        assert res.status_code == 200
        assert not client.put_mock.called
