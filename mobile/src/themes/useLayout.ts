import { useTheme } from './ThemeContext';

/**
 * Returns layout flags from the current theme.
 * All flags default to true if not set — so only sandbox needs to specify false.
 */
export function useLayout() {
  const { theme } = useTheme();
  const l = theme.layout ?? {};
  return {
    // Home
    showNearbySection: l.showNearbySection !== false,
    showGreetingBar: l.showGreetingBar !== false,
    showSearchBar: l.showSearchBar !== false,
    showQuickActions: l.showQuickActions !== false,
    showVehicleMarkers: l.showVehicleMarkers !== false,
    // Profile
    showKycBadge: l.showKycBadge !== false,
    showModeSwitch: l.showModeSwitch !== false,
    showProfilePhoto: l.showProfilePhoto !== false,
    // Browse
    showCategoryDropdown: l.showCategoryDropdown !== false,
    showChauffeurToggle: l.showChauffeurToggle !== false,
    // Vehicle detail
    showMiniMap: l.showMiniMap !== false,
    showSpecsGrid: l.showSpecsGrid !== false,
    // Booking
    showRouteInfo: l.showRouteInfo !== false,
  };
}
