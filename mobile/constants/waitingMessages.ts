/**
 * Rotating "we're working on it" copy for the AI action buttons.
 *
 * WHY: an AI action takes 3-10s and a bare "Planning…" reads as a hang. Rotating
 * lines make the wait feel intentional and give the user something to read while
 * the model works.
 *
 * TONE RULES — keep these if you add lines:
 *  - Self-deprecating about the WAIT, never about the user.
 *  - No jokes about the user's body, diet, cooking, money, or travel budget —
 *    these attach to fitness, recipe and trip features where that lands badly.
 *  - Nothing that overpromises accuracy ("perfecting every detail" implies a
 *    guarantee the model can't make).
 *  - Short enough for one line on a 375px screen.
 */

import { useEffect, useState } from 'react';

export type WaitingKind = 'itinerary' | 'recipe' | 'tasks' | 'workout';

const SHARED = [
  'Yes, this takes a moment — it is AI, the wait is worth it 😉',
  'Thinking properly, not just quickly…',
  'Doing the boring part so you do not have to…',
];

const BY_KIND: Record<WaitingKind, string[]> = {
  itinerary: [
    'Plotting a route that does not zig-zag across the city…',
    'Arguing with itself about which day gets the temple…',
    'Working out what is actually worth your morning…',
    ...SHARED,
  ],
  recipe: [
    'Reading the recipe twice so you only cook it once…',
    'Putting the steps in an order that actually works…',
    'Checking nothing goes in the pan before it should…',
    ...SHARED,
  ],
  tasks: [
    'Turning "I should do this someday" into actual steps…',
    'Finding the bit you will actually act on…',
    'Trimming the fluff, keeping the useful part…',
    ...SHARED,
  ],
  workout: [
    'Counting sets so you do not have to…',
    'Deciding how sore is reasonable…',
    'Putting the hard exercise first, sorry…',
    ...SHARED,
  ],
};

const ROTATE_MS = 3200;

/**
 * Rotating message while `active`, else null.
 *
 * Starts at a random index so retrying an action does not replay the same line
 * in the same order. The timer only runs while active, so an idle screen has no
 * interval ticking.
 */
export function useWaitingMessage(active: boolean, kind: WaitingKind): string | null {
  const lines = BY_KIND[kind];
  const [index, setIndex] = useState(() => Math.floor(Math.random() * lines.length));

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % lines.length), ROTATE_MS);
    return () => clearInterval(id);
  }, [active, lines.length]);

  return active ? lines[index] : null;
}
