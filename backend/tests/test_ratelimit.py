"""Tests for the per-IP rate limiter guarding the billable AI endpoints."""
import pytest
from fastapi import HTTPException

from app.ratelimit import rate_limit


class _Client:
    def __init__(self, host):
        self.host = host


class _Req:
    def __init__(self, host="1.1.1.1", xff=None):
        self.headers = {"x-forwarded-for": xff} if xff else {}
        self.client = _Client(host)


def test_allows_up_to_limit_then_blocks():
    dep = rate_limit(2, 60, "t_block")
    req = _Req()
    dep(req)   # 1
    dep(req)   # 2
    with pytest.raises(HTTPException) as exc:
        dep(req)  # 3 — over the limit
    assert exc.value.status_code == 429
    assert "Retry-After" in exc.value.headers


def test_separate_ips_have_separate_budgets():
    dep = rate_limit(1, 60, "t_ip")
    dep(_Req(host="10.0.0.1"))
    # Different IP should not be blocked by the first IP's usage.
    dep(_Req(host="10.0.0.2"))
    with pytest.raises(HTTPException):
        dep(_Req(host="10.0.0.1"))  # first IP is now over its limit


def test_x_forwarded_for_identifies_the_client_behind_a_proxy():
    dep = rate_limit(1, 60, "t_xff")
    # One trusted hop: our proxy APPENDS the real peer, so it is the last entry.
    dep(_Req(host="127.0.0.1", xff="203.0.113.5, 10.0.0.1"))
    with pytest.raises(HTTPException):
        # Same real client (10.0.0.1) → counted together despite the proxy host
        # and despite a different forged prefix.
        dep(_Req(host="127.0.0.1", xff="198.51.100.9, 10.0.0.1"))


def test_forged_x_forwarded_for_cannot_buy_a_fresh_bucket():
    """The security property: a caller who makes up X-Forwarded-For values must
    NOT escape their limit. Our proxy appends the real peer on the right, so
    everything the client invented to the left of it is ignored."""
    dep = rate_limit(1, 60, "t_xff_spoof")
    dep(_Req(host="127.0.0.1", xff="1.2.3.4, 10.0.0.7"))
    with pytest.raises(HTTPException):
        # Same real client, brand-new invented prefix — must still be blocked.
        dep(_Req(host="127.0.0.1", xff="9.9.9.9, 10.0.0.7"))


def test_untrusted_entries_never_shadow_the_real_peer():
    """Two genuinely different clients must keep separate budgets even when both
    forge the same leading value."""
    dep = rate_limit(1, 60, "t_xff_distinct")
    dep(_Req(host="127.0.0.1", xff="203.0.113.5, 10.0.0.1"))
    # Different real client (right-most differs) → its own budget.
    dep(_Req(host="127.0.0.1", xff="203.0.113.5, 10.0.0.2"))
