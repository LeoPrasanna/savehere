import { StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Icon } from './Icon';
import { Pressable } from './Pressable';
import { clearEnteredLibrary } from '../services/sessionFlags';
import { emitUi } from '../services/uiBus';
import * as haptics from '../services/haptics';
import { colors, spacing, onImage, themed } from '../constants/theme';

/**
 * Navigate home reliably — even on a hard reload of a deep link where there's
 * no back history (the Stack back arrow won't render in that case).
 *
 * `clearEnteredLibrary()` is the load-bearing line. The `/` route renders EITHER
 * the landing page or the library, decided by that session flag — so without
 * clearing it, a house icon dropped you back in the library for the rest of the
 * session. sessionFlags.ts has always documented that Home must clear it; the
 * call was simply missing.
 */
export function goHome() {
  clearEnteredLibrary();
  if (router.canGoBack()) router.dismissAll();
  else router.replace('/');
}

/**
 * Hamburger for the stack header (headerRight).
 *
 * ⚠️ This used to be a HOME icon. Home is a tab now (see components/TabBar), so
 * a home button in the header was a second way to do the same thing. The
 * hamburger is what every screen actually needs and did not have — the owner's
 * requirement is that it is reachable from ALL pages, and the header is the one
 * surface every stack route already shares.
 *
 * It opens the profile panel, which is rendered once at the root; the bus is
 * how a header reaches it (see services/uiBus).
 */
export function HeaderMenuButton() {
  return (
    <Pressable
      onPress={() => { haptics.tap(); emitUi('openProfile'); }}
      hitSlop={12}
      style={styles.header}
      accessibilityRole="button"
      accessibilityLabel="Menu"
    >
      <Icon name="menu" size={19} color={colors.textPrimary} />
    </Pressable>
  );
}

/** Floating home button for full-screen (headerless) screens. */
export function FloatingHomeButton({ top }: { top: number }) {
  return (
    <Pressable onPress={goHome} hitSlop={10} style={[styles.floating, { top }]} accessibilityLabel="Home">
      {/* Sits on a scrim over a photograph, so it stays light in BOTH schemes —
          the image underneath doesn't invert. */}
      <Icon name="home" size={17} color={onImage.primary} />
    </Pressable>
  );
}

// themed(): this sheet bakes in token values, and every one of them inverts
// between light and dark.
const styles = themed(() => StyleSheet.create({
  header: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  floating: {
    position: 'absolute',
    left: spacing.md,
    width: 36,
    height: 36,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(248,248,248,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
}));
