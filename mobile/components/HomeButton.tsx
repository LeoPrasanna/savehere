import { StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Icon } from './Icon';
import { Pressable } from './Pressable';
import { clearEnteredLibrary } from '../services/sessionFlags';
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

/** Home icon for the stack header (headerRight). */
export function HeaderHomeButton() {
  return (
    <Pressable onPress={goHome} hitSlop={12} style={styles.header} accessibilityLabel="Home">
      <Icon name="home" size={18} color={colors.textPrimary} />
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
