import { View, Text, StyleSheet } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Pressable } from './Pressable';
import { Icon } from './Icon';
import * as haptics from '../services/haptics';
import { markEnteredLibrary, clearEnteredLibrary, hasEnteredLibrary } from '../services/sessionFlags';
import { emitUi } from '../services/uiBus';
import { colors, spacing, font, tracking, typeface, themed } from '../constants/theme';

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
  /** The center action is the system's one inversion — filled, not outlined. */
  primary?: boolean;
}

const TABS: Tab[] = [
  { key: 'home',    icon: 'home',     label: 'Home' },
  { key: 'library', icon: 'layers',   label: 'Library' },
  { key: 'save',    icon: 'add',      label: 'Save', primary: true },
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
              style={[styles.tab, t.primary && styles.tabPrimary]}
              onPress={() => go(t.key)}
              accessibilityRole="button"
              accessibilityLabel={t.label}
            >
              <Icon
                name={t.icon}
                size={t.primary ? 20 : 18}
                color={t.primary ? colors.background : on ? colors.textPrimary : colors.textTertiary}
                emphasis={on}
              />
              {!t.primary && (
                <Text style={[styles.label, on && styles.labelOn]}>{t.label.toUpperCase()}</Text>
              )}
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
  // Floating: it sits clear of the bottom edge with canvas visible beneath, and
  // carries a hairline rather than a shadow — this system has no elevation.
  bar: {
    flexDirection: 'row',
    alignItems: 'stretch',
    alignSelf: 'stretch',
    maxWidth: 460,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  // The one inversion, same grammar as the primary button everywhere else.
  tabPrimary: { backgroundColor: colors.textPrimary },
  label: {
    color: colors.textTertiary,
    fontFamily: typeface.label,
    fontSize: 8,
    letterSpacing: tracking.label,
  },
  labelOn: { color: colors.textPrimary },
}));
