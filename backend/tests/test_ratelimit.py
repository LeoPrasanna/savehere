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


def test_x_forwarded_for_is_used_when_present():
    dep = rate_limit(1, 60, "t_xff")
    dep(_Req(host="127.0.0.1", xff="203.0.113.5, 10.0.0.1"))
    with pytest.raises(HTTPException):
        # Same forwarded client IP → counted together despite proxy host.
        dep(_Req(host="127.0.0.1", xff="203.0.113.5"))
