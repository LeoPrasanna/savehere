"""A backend that cannot reach its database must die LOUDLY.

Regression test for the 2026-09-07 → 09-09 staging outage: the savehere-dev
Supabase project hit the free tier's 7-day idle pause, `alembic upgrade head`
raised OperationalError, uvicorn exited with status 3, and Render crash-looped
serving nothing — with no line anywhere saying why. Two days invisible.

These lock BOTH halves of the fix: the error still propagates (the app must not
come up half-alive and answer requests without a database), and it is now
diagnosable from the Render log alone.
"""
import logging

import pytest
from sqlalchemy.exc import OperationalError

from app import database


def _boom(msg):
    def _raise(*_a, **_kw):
        raise OperationalError("select 1", {}, Exception(msg))
    return _raise


class TestStartupDbFailureIsLoud:
    def test_paused_project_is_named_in_the_log(self, monkeypatch, caplog):
        """The message must point at the actual cause. '(ENOTFOUND) tenant/user'
        is what a PAUSED Supabase project returns, and nothing in the raw error
        says 'paused' — which is exactly why it cost two days."""
        from alembic import command
        monkeypatch.setattr(command, "upgrade",
                            _boom("(ENOTFOUND) tenant/user postgres.abc not found"))

        with caplog.at_level(logging.CRITICAL):
            with pytest.raises(OperationalError):
                database.create_tables()

        text = caplog.text
        assert "DATABASE UNREACHABLE" in text
        # The specific diagnosis, not the generic checklist line (which always
        # mentions pausing and would pass this assertion by accident).
        assert "PAUSED or DELETED Supabase project" in text

    def test_other_db_errors_still_raise_and_log(self, monkeypatch, caplog):
        """A non-pause failure must not be mislabelled as a pause, but must
        still be loud and still propagate."""
        from alembic import command
        monkeypatch.setattr(command, "upgrade", _boom("connection refused"))

        with caplog.at_level(logging.CRITICAL):
            with pytest.raises(OperationalError):
                database.create_tables()

        assert "DATABASE UNREACHABLE" in caplog.text
        assert "PAUSED or DELETED Supabase project" not in caplog.text
        assert "refused or dropped the connection" in caplog.text

    def test_success_path_is_untouched(self, monkeypatch, caplog):
        """The guard must add nothing when the database is fine."""
        from alembic import command
        called = {"n": 0}
        monkeypatch.setattr(command, "upgrade",
                            lambda *a, **kw: called.__setitem__("n", called["n"] + 1))

        with caplog.at_level(logging.CRITICAL):
            database.create_tables()

        assert called["n"] == 1
        assert "DATABASE UNREACHABLE" not in caplog.text
