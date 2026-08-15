import { useState } from 'react';
import { View, StyleSheet, LayoutChangeEvent } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from './Icon';
import { coverStyle } from './coverStyle';

/**
 * A drawn cover for a tile that will never have a photograph.
 *
 * ⚠️ WHY THIS IS NOT AN ERROR STATE. Two failure modes put a tile here, and
 * both are permanent from the client's side (measured 2026-08-15):
 *   - extraction never produced a thumbnail (~17% of saves), and
 *   - Instagram CDN links are SIGNED and die ~5 days after the save — every
 *     Instagram save eventually stops rendering, and the repair we fetch is
 *     itself only good for another ~5 days.
 * The tile used to show one small grey glyph on a flat panel, which reads as
 * "broken". This reads as a cover the app chose to make. Same information,
 * opposite feeling, and it is the honest one: there IS no picture, and there
 * never will be.
 *
 * ⚠️ NO NETWORK, NO AI, NO ASSETS. Everything here is one gradient, one glyph
 * and arithmetic — the owner's constraint was explicitly "without using AI
 * usage". It also means a cold grid of 24 broken tiles costs nothing at all.
 *
 * ⚠️ ON COLOUR, because the system is achromatic on purpose (see the reference
 * lock in constants/theme.ts): the chrome spends no colour because "the saved
 * content is the only colour on screen". This IS the content slot, not chrome —
 * it stands exactly where a photograph would, inside the tile bounds, under the
 * same scrim. Nothing outside a tile gains a hue. If that reading is ever
 * rejected, `RAMPS` is the one place to neutralise.
 *
 * Deterministic: the same reel always draws the same cover. A library that
 * reshuffled its own covers between launches would feel broken in a way a
 * static one never does.
 */

/** The gradient stops. The deep stop lands at 0.72 so the bottom ~28% of every
 *  tile is near-black — not decoration: the card's title and category sit there
 *  under the existing scrim, and a ramp still bright at the bottom would put
 *  white text on a mid-tone. */
const LOCATIONS = [0, 0.4, 0.72] as const;

/**
 * The glyph is drawn LARGER THAN THE TILE and cropped by it — a watermark, not
 * an icon. At icon size it looked like a missing-image placeholder, which is
 * the exact impression this component exists to avoid.
 */
const GLYPH_SCALE = 1.05;
const GLYPH_OPACITY = 0.13;

export function GeneratedCover({ id, category }: { id: string; category?: string | null }) {
  // The glyph is sized from the tile, and a tile's width is only known once it
  // is laid out (columns vary with device width). One measurement, no library.
  const [box, setBox] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox(prev => (prev.w === width && prev.h === height ? prev : { w: width, h: height }));
  };

  const { ramp, direction, anchor } = coverStyle(id);

  // min(w,h) rather than w: every grid ratio here is portrait, so this is a
  // no-op in practice — it only stops a landscape tile drawing a glyph taller
  // than the frame.
  const g = GLYPH_SCALE * Math.min(box.w, box.h);

  return (
    <View style={styles.fill} onLayout={onLayout}>
      <LinearGradient
        colors={ramp as unknown as readonly [string, string, string]}
        locations={LOCATIONS as unknown as readonly [number, number, number]}
        start={direction.start}
        end={direction.end}
        style={styles.fill}
      />
      {g > 0 && (
        <View
          pointerEvents="none"
          style={[
            styles.glyph,
            { left: anchor.x * box.w - g / 2, top: anchor.y * box.h - g / 2 },
          ]}
        >
          {/* strokeWidth is pinned: Icon scales stroke with size by default, and
              at ~200px that produces a slab the tile cannot carry. */}
          <Icon name={category || 'other'} size={g} color="#FFFFFF" strokeWidth={1.1} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Not `themed()` — these values are fixed by the ramps above and must not
  // follow the light/dark palette. A cover is a stand-in for a photograph, and
  // photographs do not invert with the theme.
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  glyph: { position: 'absolute', opacity: GLYPH_OPACITY },
});
