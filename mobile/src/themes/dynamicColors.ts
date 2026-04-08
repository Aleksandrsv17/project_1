/**
 * Dynamic color proxy that reads from the current theme.
 *
 * Instead of importing COLORS from constants (which is static),
 * screens can import getColors() which always returns current theme colors.
 *
 * For screens that use StyleSheet.create at module level with COLORS,
 * the ThemeProvider mutates COLORS directly + forces a remount via key change,
 * which causes React to re-mount all components. Since StyleSheet.create
 * evaluates lazily on first access in React Native, the new COLORS values
 * are picked up on remount.
 */

// Re-export from constants — these are mutated by ThemeProvider
export { COLORS, BORDER_RADIUS, SPACING } from '../utils/constants';
