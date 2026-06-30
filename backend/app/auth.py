"""Supabase JWT verification — the single auth primitive the routes depend on.

Supabase signs access tokens with an asymmetric ECC (P-256 / ES256) key. We verify
each request's `Authorization: Bearer <jwt>` against the project's public JWKS
(fetched once and cached), so there is NO shared secret on the server. A valid token
yields the user's id (the `sub` claim); anything else is a clean 401.
"""
from dataclasses import dataclass, field

import jwt
from jwt import PyJWKClient
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.config import settings

# Supabase stamps this audience on user access tokens.
_AUDIENCE = "authenticated"
# ECC P-256 is what Supabase's new signing key uses; allow RS256 too in case a
# project is on the older asymmetric RSA option.
_ALGORITHMS = ["ES256", "RS256"]

_UNAUTHENTICATED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Not authenticated",
    headers={"WWW-Authenticate": "Bearer"},
)

# auto_error=False so a missing/!Bearer header yields our own 401 (not FastAPI's 403).
_bearer = HTTPBearer(auto_error=False)

# PyJWKClient caches keys in-process and refreshes on an unknown `kid`.
_jwk_client: PyJWKClient | None = None


def _get_jwk_client() -> PyJWKClient:
    global _jwk_client
    if _jwk_client is None:
        if not settings.SUPABASE_JWKS_URL:
            raise RuntimeError("SUPABASE_JWKS_URL is not configured")
        _jwk_client = PyJWKClient(settings.SUPABASE_JWKS_URL)
    return _jwk_client


def _signing_key_for(token: str):
    """Public key that signed this token, resolved by `kid` from the JWKS.
    Isolated so tests can inject a key without a network round-trip."""
    return _get_jwk_client().get_signing_key_from_jwt(token).key


@dataclass
class AuthUser:
    id: str                       # Supabase user UUID (the JWT `sub` claim)
    email: str | None = None
    claims: dict = field(default_factory=dict)


def verify_token(token: str) -> AuthUser:
    """Verify signature + expiry + audience and return the user. Raises 401 on any
    failure. Kept separate from the FastAPI dependency so it's unit-testable."""
    try:
        key = _signing_key_for(token)
        claims = jwt.decode(
            token,
            key,
            algorithms=_ALGORITHMS,
            audience=_AUDIENCE,
            options={"require": ["exp", "sub"]},
        )
    except jwt.PyJWTError:
        raise _UNAUTHENTICATED
    except Exception:
        # JWKS fetch / unexpected key errors must not leak as a 500.
        raise _UNAUTHENTICATED

    sub = claims.get("sub")
    if not sub:
        raise _UNAUTHENTICATED
    return AuthUser(id=sub, email=claims.get("email"), claims=claims)


def get_current_user(
    cred: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> AuthUser:
    """FastAPI dependency: the authenticated user, or 401. Add to a route with
    `user: AuthUser = Depends(get_current_user)`."""
    if cred is None or not cred.credentials:
        raise _UNAUTHENTICATED
    return verify_token(cred.credentials)
