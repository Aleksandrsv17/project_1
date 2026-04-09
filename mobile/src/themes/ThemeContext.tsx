import React, { createContext, useContext, useState } from 'react';
import { defaultTheme } from './default/theme';
import { luxuryFlatTheme } from './luxury-flat/theme';
import { conceptCarTheme } from './concept-car/theme';
import { sandboxTheme } from './sandbox/theme';
import { COLORS, BORDER_RADIUS } from '../utils/constants';

export interface AppTheme {
  name: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    accentLight: string;
    background: string;
    surface: string;
    surfaceBorder: string;
    textPrimary: string;
    textSecondary: string;
    textOnPrimary: string;
    textOnAccent: string;
    success: string;
    error: string;
    warning: string;
    info: string;
    gray: string;
    grayLight: string;
    grayDark: string;
    border: string;
    disabled: string;
    disabledText: string;
  };
  button: {
    borderRadius: number;
    paddingVertical: number;
    paddingHorizontal: number;
    fontSize: number;
    fontWeight: 'normal' | 'bold' | '500' | '600' | '700' | '800';
    letterSpacing: number;
    textTransform: 'none' | 'uppercase' | 'capitalize';
    shineEffect: boolean;
  };
  card: {
    borderRadius: number;
    borderWidth: number;
    shadowOpacity: number;
  };
  input: {
    borderRadius: number;
    borderWidth: number;
    fontSize: number;
  };
  tab: {
    borderRadius: number;
    activeBackground: string;
    activeText: string;
    inactiveBackground: string;
    inactiveText: string;
  };
  toggle: {
    borderRadius: number;
    activeBackground: string;
    inactiveBackground: string;
  };
  typography: {
    fontFamily: string;
    headerSize: number;
    headerWeight: 'normal' | 'bold' | '700' | '800';
    headerLetterSpacing: number;
    bodySize: number;
  };
  spacing: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
  };
}

const THEMES: Record<string, AppTheme> = {
  default: defaultTheme,
  'luxury-flat': luxuryFlatTheme,
  'concept-car': conceptCarTheme,
  'sandbox': sandboxTheme,
};

interface ThemeContextType {
  theme: AppTheme;
  themeName: string;
  setThemeName: (name: string) => void;
  availableThemes: string[];
}

const ThemeContext = createContext<ThemeContextType>({
  theme: defaultTheme,
  themeName: 'default',
  setThemeName: () => {},
  availableThemes: Object.keys(THEMES),
});

function applyThemeToGlobals(theme: AppTheme) {
  // Patch the mutable COLORS object so all screens using it get themed
  COLORS.primary = theme.colors.primary;
  COLORS.secondary = theme.colors.secondary;
  COLORS.accent = theme.colors.accent;
  COLORS.accentLight = theme.colors.accentLight;
  COLORS.white = theme.colors.surface;
  COLORS.gray = theme.colors.gray;
  COLORS.grayLight = theme.colors.grayLight;
  COLORS.grayDark = theme.colors.grayDark;
  COLORS.success = theme.colors.success;
  COLORS.error = theme.colors.error;
  COLORS.warning = theme.colors.warning;
  COLORS.info = theme.colors.info;
  COLORS.border = theme.colors.border;
  COLORS.background = theme.colors.background;
  COLORS.cardBackground = theme.colors.surface;
  COLORS.textPrimary = theme.colors.textPrimary;
  COLORS.textSecondary = theme.colors.textSecondary;

  // Patch border radius
  const r = theme.card.borderRadius > 0;
  BORDER_RADIUS.sm = r ? 4 : 0;
  BORDER_RADIUS.md = r ? 8 : 0;
  BORDER_RADIUS.lg = r ? 12 : 0;
  BORDER_RADIUS.xl = r ? 16 : 0;
  BORDER_RADIUS.xxl = r ? 24 : 0;
  BORDER_RADIUS.full = r ? 9999 : 0;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeName, setThemeName] = useState('default');

  const theme = THEMES[themeName] ?? defaultTheme;

  // Apply SYNCHRONOUSLY before render so getStyles() picks up new values
  applyThemeToGlobals(theme);

  return (
    <ThemeContext.Provider value={{
      theme,
      themeName,
      setThemeName,
      availableThemes: Object.keys(THEMES),
    }}>
      <React.Fragment key={themeName}>
        {children}
      </React.Fragment>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
