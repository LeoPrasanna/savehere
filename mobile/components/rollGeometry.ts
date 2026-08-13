/**
 * How far a rolling line may travel without being clipped.
 *
 * Extracted from RollingTagline purely so it can be tested — this arithmetic
 * has been the cause of the same reported bug twice ("the Slate lines are cut
 * off"), and both times the fix went into the copy rather than the geometry.
 *
 * THE INVARIANT: the roll happens inside a fixed-height viewport with
 * `overflow: hidden`, and the text is vertically centred in it. So the slack
 * above and below the text is `(viewportH - textH) / 2`, and a translation
 * larger than that slack pushes the text past the clip edge WHILE IT IS STILL
 * PARTLY OPAQUE — which reads as a line sliced through the middle, not as a
 * line rolling away.
 *
 * Travel is therefore never more than the slack. Two consequences worth
 * knowing rather than rediscovering:
 *
 *  - Zero slack degrades to a pure crossfade (travel 0). That is the correct
 *    behaviour when there is no room to move; it is not a failure case.
 *  - Raising `numberOfLines` shrinks the roll unless the viewport grows to
 *    match. Two 18px lines need a 60px viewport to keep a 12px roll.
 *
 * `MAX_TRAVEL` is the design ceiling — the roll should not become a slide just
 * because a viewport is enormous.
 */
export const MAX_TRAVEL = 22;

export function rollTravel(viewportH: number, lineHeight: number, lines: number): number {
  const slack = (viewportH - lineHeight * lines) / 2;
  return Math.max(0, Math.min(MAX_TRAVEL, slack));
}
