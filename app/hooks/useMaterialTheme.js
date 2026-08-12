import { useMemo } from 'react';
import { MD3LightTheme, MD3DarkTheme } from 'react-native-paper';
import { useThemeConfig } from '../contexts/ThemeConfigContext';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { BORDER_RADIUS } from '../styles/designTokens';

/**
 * Bridges this app's palette onto React Native Paper's Material 3 tokens, so a
 * Paper component and a hand-rolled one sitting next to it agree on colour.
 */
export function useMaterialTheme() {
  const { colorScheme } = useThemeConfig();
  const { colors } = useThemeColors();

  return useMemo(() => {
    const baseTheme = colorScheme === 'dark' ? MD3DarkTheme : MD3LightTheme;
    const isDark = colorScheme === 'dark';

    return {
      ...baseTheme,
      colors: {
        ...baseTheme.colors,

        primary: colors.primary,
        onPrimary: colors.onPrimary,
        primaryContainer: colors.selected,
        onPrimaryContainer: isDark ? '#dbe2ff' : '#1a2a6b',

        secondary: colors.secondary,
        onSecondary: colors.text,
        secondaryContainer: colors.secondary,
        onSecondaryContainer: colors.text,

        background: colors.background,
        onBackground: colors.text,
        surface: colors.surface,
        onSurface: colors.text,
        surfaceVariant: colors.card,
        onSurfaceVariant: colors.mutedText,

        elevation: {
          level0: 'transparent',
          level1: colors.surface,
          level2: colors.card,
          level3: colors.card,
          level4: colors.card,
          level5: colors.card,
        },

        error: colors.error,
        onError: '#ffffff',
        errorContainer: isDark ? '#93000a' : '#ffdad6',
        onErrorContainer: isDark ? '#ffdad6' : '#410002',

        outline: colors.border,
        outlineVariant: colors.inputBorder,

        surfaceDisabled: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)',
        onSurfaceDisabled: isDark ? 'rgba(255,255,255,0.38)' : 'rgba(0,0,0,0.38)',

        backdrop: colors.modalBackground,
      },
      roundness: BORDER_RADIUS.md,
    };
  }, [colorScheme, colors]);
}
