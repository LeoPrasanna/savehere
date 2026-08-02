import { View, StyleSheet } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Pressable } from './Pressable';
import { Icon } from './Icon';
import * as haptics from '../services/haptics';
import { markEnteredLibrary, clearEnteredLibrary, hasEnteredLibrary } from '../services/sessionFlags';
import { emitUi } from '../services/uiBus';
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

/** Routes that own their whole surface and must not be overlaid. */
const HIDE_ON = ['/save', '/pro', '/workout/session'];

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

  if (HIDE_ON.some(p => pathname.startsWith(p))) return null;

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
      <View style={styles.bar}>
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
              {/* The active tab is a filled disc behind the glyph — the same
                  inversion the primary button uses, just round. Nothing else
                  marks state: no labels, no underline, no colour. */}
              <View style={[styles.slot, on && styles.slotOn]}>
                <Icon
                  name={t.icon}
                  size={19}
                  color={on ? colors.background : colors.textSecondary}
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
  /**
   * A floating PILL that hugs its contents rather than spanning the width —
   * owner direction, matching the reference app's tab bar.
   *
   * ⚠️ Uses `radius.circle`, the system's one sanctioned round form (see
   * constants/theme.ts). Everything that is not a tab bar, a category bubble or
   * an auth button is still 0.
   *
   * The fill is a translucent ink wash rather than solid canvas, so the grid
   * scrolling underneath stays faintly visible — that is what makes it read as
   * floating above the content instead of a bar welded to the bottom.
   */
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    borderRadius: radius.circle,
    backgroundColor: colors.tabBar,
    borderWidth: 1,
    borderColor: colors.ghostLine,
    paddingHorizontal: 6,
    paddingVertical: 6,
    gap: 2,
  },
  tab: { alignItems: 'center', justifyContent: 'center' },
  slot: {
    width: 42, height: 42,
    borderRadius: radius.circle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotOn: { backgroundColor: colors.textPrimary },
}));
