export const API_BASE_URL = 'http://localhost:3000/api';

export const SOCKET_URL = 'http://localhost:3000';

export const STRIPE_PUBLISHABLE_KEY = 'pk_test_your_stripe_publishable_key_here';

export const DEFAULT_REGION = {
  latitude: 25.2048,
  longitude: 55.2708,
  latitudeDelta: 0.0922,
  longitudeDelta: 0.0421,
};

export const VEHICLE_CATEGORIES = [
  { label: 'All', value: 'all' },
  { label: 'Sedan', value: 'sedan' },
  { label: 'SUV', value: 'suv' },
  { label: 'Luxury', value: 'luxury' },
  { label: 'Sports', value: 'sports' },
  { label: 'Van', value: 'van' },
];

export const BOOKING_MODES = [
  { label: 'Self Drive', value: 'self_drive' },
  { label: 'With Chauffeur', value: 'chauffeur' },
];

export const BOOKING_STATUS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const;

export const USER_ROLES = {
  CUSTOMER: 'customer',
  OWNER: 'owner',
  ADMIN: 'admin',
} as const;

export const SECURE_STORE_KEYS = {
  ACCESS_TOKEN: 'access_token',
  REFRESH_TOKEN: 'refresh_token',
  USER_DATA: 'user_data',
};

export const COLORS = {
  primary: '#1a1a2e',
  secondary: '#16213e',
  accent: '#c9a84c',
  accentLight: '#e8c97a',
  white: '#ffffff',
  black: '#000000',
  gray: '#9ca3af',
  grayLight: '#f3f4f6',
  grayDark: '#4b5563',
  success: '#10b981',
  error: '#ef4444',
  warning: '#f59e0b',
  info: '#3b82f6',
  border: '#e5e7eb',
  background: '#f9fafb',
  cardBackground: '#ffffff',
  textPrimary: '#111827',
  textSecondary: '#6b7280',
};

export const FONTS = {
  regular: 'System',
  medium: 'System',
  bold: 'System',
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const BORDER_RADIUS = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  xxl: 24,
  full: 9999,
};
