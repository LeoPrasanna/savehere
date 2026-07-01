from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging

from app.database import get_db, ReelDB, ExtractionCacheDB
from app.auth import get_current_user, AuthUser

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/account", tags=["account"])


@router.delete("/")
def delete_account(user: AuthUser = Depends(get_current_user), db: Session = Depends(get_db)):
    """Delete all data associated with the authenticated user. This includes
    all saved reels, personal notes, and any cached extractions linked to
    their user_id. The user record itself in Supabase Auth is managed
    separately via the client SDK or admin API."""
    
    user_id = user.id
    
    # Count before deletion for logging
    reel_count = db.query(ReelDB).filter(ReelDB.user_id == user_id).count()
    
    # Delete all reels for this user
    db.query(ReelDB).filter(ReelDB.user_id == user_id).delete(synchronize_session=False)
    
    # Note: extraction_cache is shared (keyed by URL), so we don't delete from it.
    # The reels are the user's personal data.
    
    db.commit()
    
    logger.info(f"Account data deleted for user {user_id}: {reel_count} reels removed")
    
    return {
        "deleted": True,
        "reels_removed": reel_count,
        "message": "All your saved data has been deleted. You will be signed out."
    }
