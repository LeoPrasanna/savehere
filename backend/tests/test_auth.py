"""Tests for the Supabase JWT verification primitive. A throwaway EC P-256 keypair
is generated locally and the public key is injected into auth._signing_key_for, so
these run fully offline (no Supabase / JWKS network call) — safe for CI."""
import time
import pytest
import jwt
from cryptography.hazmat.primitives.asymmetric import ec

from app import auth
from app.auth import verify_token, get_current_user, AuthUser, _UNAUTHENTICATED
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials


# ── keypairs ────────────────────────────────────────────────
_PRIV = ec.generate_private_key(ec.SECP256R1())
_OTHER_PRIV = ec.generate_private_key(ec.SECP256R1())   # for the wrong-signature case


def _make_token(priv=_PRIV, **overrides) -> str:
    now = int(time.time())
    claims = {
        "sub": "user-uuid-123",
        "email": "test@example.com",
        "aud": "authenticated",
        "role": "authenticated",
        "iat": now,
        "exp": now + 3600,
    }
    claims.update(overrides)
    return jwt.encode(claims, priv, algorithm="ES256")


@pytest.fixture(autouse=True)
def inject_public_key(monkeypatch):
    # Every test verifies against _PRIV's public key, regardless of what signed the token.
    monkeypatch.setattr(auth, "_signing_key_for", lambda token: _PRIV.public_key())


class TestVerifyToken:
    def test_valid_token_returns_user(self):
        user = verify_token(_make_token())
        assert isinstance(user, AuthUser)
        assert user.id == "user-uuid-123"
        assert user.email == "test@example.com"
        assert user.claims["role"] == "authenticated"

    def test_expired_token_is_401(self):
        with pytest.raises(HTTPException) as e:
            verify_token(_make_token(exp=int(time.time()) - 10))
        assert e.value.status_code == 401

    def test_wrong_audience_is_401(self):
        with pytest.raises(HTTPException) as e:
            verify_token(_make_token(aud="anon"))
        assert e.value.status_code == 401

    def test_missing_sub_is_401(self):
        # require: ["exp", "sub"] — a token with no sub must fail.
        with pytest.raises(HTTPException) as e:
            verify_token(_make_token(sub=None))
        assert e.value.status_code == 401

    def test_signature_from_other_key_is_401(self):
        # Signed by a different private key than the injected public key → invalid.
        with pytest.raises(HTTPException) as e:
            verify_token(_make_token(priv=_OTHER_PRIV))
        assert e.value.status_code == 401

    def test_garbage_token_is_401(self):
        with pytest.raises(HTTPException) as e:
            verify_token("not.a.jwt")
        assert e.value.status_code == 401


class TestGetCurrentUser:
    def test_no_credentials_is_401(self):
        with pytest.raises(HTTPException) as e:
            get_current_user(cred=None)
        assert e.value.status_code == 401

    def test_empty_credentials_is_401(self):
        cred = HTTPAuthorizationCredentials(scheme="Bearer", credentials="")
        with pytest.raises(HTTPException):
            get_current_user(cred=cred)

    def test_valid_bearer_returns_user(self):
        cred = HTTPAuthorizationCredentials(scheme="Bearer", credentials=_make_token())
        user = get_current_user(cred=cred)
        assert user.id == "user-uuid-123"
