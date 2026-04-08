import { useTheme } from './ThemeContext';

/**
 * Returns theme colors mapped to the same shape as the old COLORS constant.
 * Drop-in replacement: just import useThemeColors() instead of COLORS.
 */
export function useThemeColors() {
  const { theme } = useTheme();
  return {
    primary: theme.colors.primary,
    secondary: theme.colors.secondary,
    accent: theme.colors.accent,
    accentLight: theme.colors.accentLight,
    white: theme.colors.surface,
    black: '#000000',
    gray: theme.colors.gray,
    grayLight: theme.colors.grayLight,
    grayDark: theme.colors.grayDark,
    success: theme.colors.success,
    error: theme.colors.error,
    warning: theme.colors.warning,
    info: theme.colors.info,
    border: theme.colors.border,
    background: theme.colors.background,
    cardBackground: theme.colors.surface,
    textPrimary: theme.colors.textPrimary,
    textSecondary: theme.colors.textSecondary,
  };
}

export function useThemeStyles() {
  const { theme } = useTheme();
  return {
    borderRadius: {
      sm: theme.card.borderRadius > 0 ? 4 : 0,
      md: theme.card.borderRadius > 0 ? 8 : 0,
      lg: theme.card.borderRadius > 0 ? 12 : 0,
      xl: theme.card.borderRadius > 0 ? 16 : 0,
      xxl: theme.card.borderRadius > 0 ? 24 : 0,
      full: theme.card.borderRadius > 0 ? 9999 : 0,
    },
    button: theme.button,
    typography: theme.typography,
  };
}
