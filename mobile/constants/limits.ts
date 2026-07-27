// Product thresholds shared across screens. Single source so the Landing progress
// ladder, the Profile "Ask" entry, and the Ask screen's own guard never disagree.

/** Ask-your-library unlocks once the user has this many saved reels to draw on.
 *  Below it, the entry points show a "save N more to unlock" progress state
 *  instead of activating. (If the backend later hard-enforces this, keep it in
 *  sync with that value.) */
export const ASK_MIN_REELS = 5;
