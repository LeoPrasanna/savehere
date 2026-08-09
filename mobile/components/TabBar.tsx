import { useEffect, useReducer } from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Pressable } from './Pressable';
import { Icon } from './Icon';
import * as haptics from '../services/haptics';
import { markEnteredLibrary, clearEnteredLibrary, hasEnteredLibrary } from '../services/sessionFlags';
import { emitUi, onUi } from '../services/uiBus';
import { colors, spacing, radius, themed } from '../constants/theme';

/**
 * The app's primary navigation: five tabs, floating clear of the bottom edge.
 *
 * Rendered ONCE at the root (see app/_layout.tsx) rather than per-screen, so it
 * is identical everywhere and cannot drift between routes. It replaces the
 * per-screen header buttons that used to duplicate this — the library header
 * alone carried home/save/menu, all three of which now live here or in the
 * global hamburger.
 *
 * ⚠️ HIDDEN ON /save AND THE FULL-SCREEN PLAYERS. `/save` is a focused modal
 * task with its own primary button; a floating nav over it would compete with
 * the thing the screen exists to do, and tapping a tab mid-save would lose the
 * pasted link. The workout session player is full-bleed by design. Everywhere
 * else it stays put (owner direction: "consistent on all pages").
 */

/** Routes that own their whole surface and must not be overlaid.
 *  Matched with `startsWith`, so `/workout/` covers both the plan screen and
 *  the session — the plan screen pins its own "Start Workout" CTA to the
 *  bottom, which the floating bar sat directly on top of. */
const HIDE_ON = ['/save', '/pro', '/workout/'];

/**
 * How much room the bar occupies ABOVE the safe-area inset — pill height
 * (42 slot + 6+6 padding + 2 border = 56) plus the gap it floats by.
 *
 * ⚠️ EVERY SCREEN WITH ITS OWN BOTTOM CHROME MUST ADD THIS. The bar is
 * `position: absolute` at the root, so it silently covers anything a screen
 * pins to the bottom — which is exactly what happened to the to-do screen's
 * "New task" button and its Undo bar. Undo looked broken because the button was
 * underneath the tab bar, not because the logic failed.
 *
 * Use as `paddingBottom: insets.bottom + TAB_BAR_CLEARANCE`.
 */
export const TAB_BAR_CLEARANCE = 72;

interface Tab {
  key: string;
  icon: string;
  label: string;
}

const TABS: Tab[] = [
  { key: 'home',    icon: 'home',     label: 'Home' },
  { key: 'library', icon: 'layers',   label: 'Library' },
  { key: 'save',    icon: 'add',      label: 'Save' },
  { key: 'slate',   icon: 'checkbox', label: 'Slate' },
  { key: 'ask',     icon: 'ask',      label: 'Ask' },
];

export function TabBar() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  // Home and Library share the route `/` and are told apart by a session flag,
  // NOT by the pathname — so `usePathname()` never changes between them and
  // nothing re-rendered this bar when the flag flipped. That, not a prefix
  // matcher, is why the indicator stuck on Home: the bar emitted `libraryState`
  // for the route to consume but never listened to it itself.
  const [, bumpActive] = useReducer((n: number) => n + 1, 0);
  useEffect(() => onUi('libraryState', bumpActive), []);

  // `/` is matched EXACTLY — a prefix test would make every route a "hide"
  // route. The rest stay prefix matches so `/workout/<id>` and `/workout/session`
  // are both covered by the one `/workout/` entry.
  if (HIDE_ON.some(p => (p === '/' ? pathname === '/' : pathname.startsWith(p)))) return null;

  // "Which tab am I on" is not purely the pathname: `/` renders EITHER the
  // landing or the library depending on a session flag, so Home and Library
  // share a route and are told apart by that flag.
  const onRoot = pathname === '/' || pathname === '/index';
  const active =
    onRoot ? (hasEnteredLibrary() ? 'library' : 'home')
    : pathname.startsWith('/todos') ? 'slate'
    : pathname.startsWith('/ask') ? 'ask'
    : null;

  const go = (key: string) => {
    haptics.tap();
    switch (key) {
      case 'home':
        clearEnteredLibrary();
        emitUi('libraryState');          // tell the mounted route to re-read
        if (!onRoot) router.replace('/');
        break;
      case 'library':
        markEnteredLibrary();
        emitUi('libraryState');
        if (!onRoot) router.replace('/');
        break;
      case 'save':  router.push('/save'); break;
      case 'slate': router.push('/todos'); break;
      case 'ask':   router.push('/ask'); break;
    }
  };

  return (
    <View
      style={[styles.wrap, { paddingBottom: insets.bottom + spacing.sm }]}
      pointerEvents="box-none"
    >
      {/* Content dissolves into the canvas behind the bar, rather than running
          under a hard edge. Sits below the pill in the stack. */}
      <LinearGradient
        colors={['transparent', colors.background]}
        style={[styles.fade, { pointerEvents: 'none' }]}
      />

      <View style={styles.bar}>
        {/* The pill's own fill is a gradient, not a flat wash: a slightly lifted
            top edge is what gives it shape against a dark page. A flat fill
            reads as a hole punched in the canvas. */}
        <LinearGradient
          colors={[colors.tabBarTop, colors.tabBarBottom]}
          style={[styles.barFill, { pointerEvents: 'none' }]}
        />
        {/* ⚠️ EVERY TAB IS IDENTICAL. Save was briefly larger, filled and
            pulsing; the owner asked for uniformity, and they were right — a
            permanently animating, permanently highlighted control in a row of
            five reads as an alert, not a destination. Emphasis in a tab bar
            should mean "you are here", nothing else. */}
        {TABS.map(t => {
          const on = active === t.key;
          return (
            <Pressable
              key={t.key}
              style={styles.tab}
              onPress={() => go(t.key)}
              accessibilityRole="button"
              accessibilityLabel={t.label}
            >
              {/* The active tab is an OUTLINED disc, not a filled one (owner).
                  A filled white circle was the brightest thing on the screen
                  and read as a button you had not pressed yet; a ring marks
                  position without shouting. */}
              <View style={[styles.slot, on && styles.slotOn]}>
                <Icon
                  name={t.icon}
                  size={19}
                  color={on ? colors.textPrimary : colors.textSecondary}
                  emphasis={on}
                />
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  // box-none on the wrap so the screen keeps scrolling behind the bar; only the
  // bar itself takes touches.
  wrap: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  // The dissolve behind the bar. Tall enough that content is already fading
  // before it reaches the pill.
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 132 },
  /**
   * A floating PILL that hugs its contents rather than spanning the width —
   * owner direction, matching the reference app's tab bar.
   *
   * ⚠️ Uses `radius.circle`, one of the system's three sanctioned round forms
   * (see constants/theme.ts). Everything else is still 0.
   *
   * The fill is translucent so content stays faintly visible through it — that
   * is what makes it read as floating above the page rather than welded to the
   * bottom edge.
   */
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    borderRadius: radius.circle,
    borderWidth: 1,
    borderColor: colors.ghostLine,
    paddingHorizontal: 6,
    paddingVertical: 6,
    gap: 2,
    // overflow:hidden clips the gradient fill to the pill's radius. Without it
    // the LinearGradient paints a square behind the rounded border.
    overflow: 'hidden',
  },
  barFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  tab: { alignItems: 'center', justifyContent: 'center' },
  slot: {
    width: 42, height: 42,
    borderRadius: radius.circle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotOn: { borderWidth: 1.5, borderColor: colors.textPrimary },
}));
