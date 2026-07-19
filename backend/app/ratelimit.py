"""
Lightweight per-IP rate limiting (in-memory sliding window).

Used as a FastAPI dependency on cost-sensitive endpoints. It's process-local —
fine for a single uvicorn instance. For multiple instances/workers in production,
swap the store for Redis (the dependency interface stays the same).
"""
import os
import time
import threading
from fastapi import Request, HTTPException

_store: dict[str, list[float]] = {}
_lock = threading.Lock()

# How many trusted reverse proxies sit in front of the app.
#   0 = no proxy (local dev, or the app is exposed directly) — never trust XFF.
#   1 = one platform load balancer (Render / Railway) — the default.
#   2 = e.g. Cloudflare in front of the platform LB.
# Anything a CLIENT puts in X-Forwarded-For is appended to from the left, so only
# the entries our own proxies appended (counted from the RIGHT) can be trusted.
_TRUSTED_PROXY_HOPS = int(os.getenv("TRUSTED_PROXY_HOPS", "1"))


def _client_ip(request: Request) -> str:
    """The caller's IP, resolved so a client can't forge it.

    X-Forwarded-For is a client-appendable list: each proxy APPENDS the peer it
    received the connection from, so the header looks like
    `<anything the client made up>, <real client>, <proxy1>, ...`.
    Taking the leftmost entry (the old behavior) let any caller send
    `X-Forwarded-For: <random>` and land in a fresh rate-limit bucket on every
    request, nullifying the limiter. We instead index from the right, past the
    hops we actually trust — that entry was written by our own proxy and cannot
    be spoofed. Falls back to the socket peer whenever the header is absent,
    shorter than expected (a forged short list can't gain anything), or when no
    proxy is configured.
    """
    if _TRUSTED_PROXY_HOPS > 0:
        xff = request.headers.get("x-forwarded-for")
        if xff:
            parts = [p.strip() for p in xff.split(",") if p.strip()]
            if len(parts) >= _TRUSTED_PROXY_HOPS:
                return parts[-_TRUSTED_PROXY_HOPS]
    return request.client.host if request.client else "unknown"


# Keep keys alive long enough for the longest window we use (a 24h daily cap).
_MAX_RETENTION = 86400


def _cleanup(now: float) -> None:
    # Best-effort: drop keys whose last hit is older than the longest window.
    for k in list(_store.keys()):
        hits = _store.get(k)
        if not hits or hits[-1] < now - _MAX_RETENTION:
            _store.pop(k, None)


def rate_limit(limit: int, window: int, name: str, message: str | None = None):
    """Allow at most `limit` requests per `window` seconds per IP for this `name`.

    `message` overrides the default 429 detail — use it for long windows (e.g. a
    daily cap) where "wait Ns" would be nonsensical. Stack multiple rate_limit
    dependencies on one route to combine a burst guard with a daily budget.
    """
    def dependency(request: Request) -> None:
        ip = _client_ip(request)
        key = f"{name}:{ip}"
        now = time.time()
        cutoff = now - window
        with _lock:
            hits = [t for t in _store.get(key, []) if t > cutoff]
            if len(hits) >= limit:
                retry = max(1, int(window - (now - hits[0])) + 1)
                _store[key] = hits
                raise HTTPException(
                    status_code=429,
                    detail=message or f"You're going a bit fast — please wait {retry}s and try again.",
                    headers={"Retry-After": str(retry)},
                )
            hits.append(now)
            _store[key] = hits
            if len(_store) > 5000:
                _cleanup(now)
    return dependency
