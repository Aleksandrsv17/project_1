import { AppTheme } from '../ThemeContext';

export const conceptCarTheme: AppTheme = {
  name: 'Concept Car',
  colors: {
    primary: '#2C2A26',       // Dark warm charcoal (car body shadow)
    secondary: '#3D3A34',     // Slightly lighter
    accent: '#C8BFA8',        // Warm sand/beige (car body highlight)
    accentLight: '#D9D0BC',   // Lighter sand
    background: '#E8E2D8',    // Warm light beige (floor)
    surface: '#F0EBE3',       // Warm white surface
    surfaceBorder: '#D4CFC5', // Subtle warm border
    textPrimary: '#2C2A26',   // Dark charcoal
    textSecondary: '#8A8379', // Warm gray
    textOnPrimary: '#F0EBE3', // Light on dark
    textOnAccent: '#2C2A26',  // Dark on sand
    success: '#5C6B54',       // Muted olive green
    error: '#8B4A4A',         // Muted rust red
    warning: '#9E8A5C',       // Muted gold
    info: '#5A6B7A',          // Steel blue
    gray: '#9E9890',          // Warm gray
    grayLight: '#EDE8E0',     // Light warm
    grayDark: '#5C574F',      // Dark warm gray
    border: '#D4CFC5',        // Warm border
    disabled: '#C4BFB5',      // Muted sand
    disabledText: '#9E9890',  // Warm gray
  },
  button: {
    borderRadius: 2,          // Almost sharp — very subtle bevel
    paddingVertical: 16,
    paddingHorizontal: 32,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 3,          // Wide tracking like concept car badge
    textTransform: 'uppercase',
    shineEffect: true,         // Edge light sweep
  },
  card: {
    borderRadius: 2,           // Barely rounded — geometric
    borderWidth: 1,
    shadowOpacity: 0.06,       // Very subtle shadow
  },
  input: {
    borderRadius: 2,
    borderWidth: 1,
    fontSize: 14,
  },
  tab: {
    borderRadius: 2,
    activeBackground: '#2C2A26',
    activeText: '#C8BFA8',
    inactiveBackground: '#EDE8E0',
    inactiveText: '#5C574F',
  },
  toggle: {
    borderRadius: 99,
    activeBackground: '#2C2A26',
    inactiveBackground: '#D4CFC5',
  },
  typography: {
    fontFamily: 'System',
    headerSize: 22,
    headerWeight: '700',
    headerLetterSpacing: 2,
    bodySize: 14,
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },
};
