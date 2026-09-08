"""Share key — the credential the Android no-display share Activity carries.

⚠️ WHY THIS EXISTS AT ALL, because it looks like a second auth system and a
second auth system always deserves suspicion.

Android Phase B makes sharing invisible: a translucent no-display Activity
receives `ACTION_SEND`, saves the link and finishes, so the user never leaves
Instagram. That Activity runs **outside the JS runtime** — there is no React
Native context, no supabase-js — so it cannot use the Supabase session the way
every other request does. Two obvious routes were considered and rejected:

  Read the stored access token.  A Supabase access token lives ~1 h and only
      auto-refreshes while the app is open. Someone who opens Findable at
      breakfast and shares a reel at lunch has a four-hour-old token, so the
      silent save 401s. That is the MAJORITY case, not an edge case.

  Refresh the token from native code.  Supabase rotates refresh tokens, so a
      native refresh revokes the refresh token the app is still holding — and
      the next app launch signs the user out. Trading "a 1 s flash" for
      "randomly logged out" is a bad trade.

So the app mints a long-lived, **save-scoped** key while it holds a valid JWT,
and the Activity carries that instead.

SCOPE IS ENFORCED BY WHERE THIS IS ACCEPTED, NOT BY A CLAIM INSIDE THE KEY.
`user_for_share` is wired into exactly one route, `POST /api/reels/share-save`,
which is a three-line delegation to the normal save handler. Every other route
in the app still takes `get_current_user`. That is deliberately checkable by
reading the routing table: a stolen key can create a saved link and nothing
else — no read, no delete, no AI action, no account access. Giving it its own
URL rather than teaching `/save` to accept either credential is what keeps that
property a fact instead of a claim about a branch.

Stored as SHA-256, never in the clear — a database leak must not yield working
credentials. Revoked on sign-out, and it dies with the account automatically
because it lives on the profile row that account deletion already removes.

ONE KEY PER USER (latest device wins). Minting from a second device silently
supersedes the first, which then falls back to the visible launch path rather
than failing — acceptable while Android is the only platform with the Activity
(iOS is blocked on the Apple Developer account). If multi-device silent sharing
matters later this becomes its own table keyed by hash; nothing else changes.
"""
import hashlib
import secrets
from datetime import datetime

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import AuthUser
from app.database import ProfileDB, get_db
# The private helper on purpose: it also inherits the trial grant for a
# re-signed-up email. Creating a profile row without that would hand the user a
# fresh trial, which is the exact hole entitlements.py exists to close.
from app.entitlements import _get_or_create_profile, tier_for
from app.quota import quota_subject

#: Prefix so a leaked string is identifiable on sight in a log or bug report.
_PREFIX = "shk_"

#: The header the Activity sends. Deliberately NOT `Authorization` — a scheme
#: this narrow should not be mistakable for a session token by anything reading
#: a log or a proxy config.
SHARE_KEY_HEADER = "X-Share-Key"

_UNAUTHENTICATED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Not authenticated",
    headers={"WWW-Authenticate": "Bearer"},
)


def _hash(key: str) -> str:
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def mint_share_key(db: Session, user: AuthUser) -> str:
    """Issue a fresh share key for `user`, replacing any previous one.

    Only ever called from a JWT-authenticated request, so the two snapshots
    below are taken from a VERIFIED token and never from client input.

    ⚠️ The snapshots are the whole reason this is more than one column. A
    share-key request carries no JWT, so:
      * `tier_for()` would find no `app_metadata` and read the caller as free —
        a paying Pro user's silent share would hit the free save cap;
      * `quota_subject()` would fall back to `user_id` instead of the
        normalized-email hash, charging a DIFFERENT daily AI bucket than the
        same person's normal saves. That is a quota hole, not a cosmetic one.

    They go stale between mints. The app re-mints on every launch, so the lag is
    the same class as the ~1 h JWT staleness the tier system already documents.
    """
    profile = _get_or_create_profile(db, user, now=datetime.utcnow())
    key = _PREFIX + secrets.token_urlsafe(32)
    profile.share_key_hash = _hash(key)
    profile.share_key_tier = tier_for(user)
    profile.share_key_subject = quota_subject(user)
    db.commit()
    return key


def revoke_share_key(db: Session, user: AuthUser) -> None:
    """Drop the user's share key (sign-out). Idempotent — a user who never
    minted one is not an error."""
    profile = db.query(ProfileDB).filter(ProfileDB.user_id == user.id).first()
    if profile is None or profile.share_key_hash is None:
        return
    profile.share_key_hash = None
    profile.share_key_tier = None
    profile.share_key_subject = None
    db.commit()


def resolve_share_key(db: Session, key: str) -> AuthUser | None:
    """The user this key belongs to, or None. Never raises."""
    if not key or not key.startswith(_PREFIX):
        return None
    profile = (
        db.query(ProfileDB).filter(ProfileDB.share_key_hash == _hash(key)).first()
    )
    if profile is None:
        return None
    # Rebuild the parts of the token the rest of the app reads. `email` stays
    # None deliberately — nothing downstream needs the address once `subject`
    # carries the identity the quota is charged against, and not storing it is
    # one less copy of a real email address at rest.
    return AuthUser(
        id=profile.user_id,
        email=None,
        claims={"app_metadata": {"tier": profile.share_key_tier or "free"}},
        subject=profile.share_key_subject,
    )


def user_for_share(
    share_key: str | None = Header(None, alias=SHARE_KEY_HEADER),
    db: Session = Depends(get_db),
) -> AuthUser:
    """The share-key caller, or 401. The ONLY dependency that accepts this
    credential, and it is attached to exactly one route."""
    user = resolve_share_key(db, share_key) if share_key else None
    if user is None:
        raise _UNAUTHENTICATED
    return user
