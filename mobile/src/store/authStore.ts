import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { login as apiLogin, logout as apiLogout, getProfile } from '../api/auth';
import { SECURE_STORE_KEYS } from '../utils/constants';

export interface User {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  role: 'customer' | 'owner' | 'admin';
  avatarUrl?: string;
  kycVerified: boolean;
  createdAt: string;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;

  // Actions
  initialize: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setTokens: (access: string, refresh: string) => Promise<void>;
  setUser: (user: User) => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  isLoading: false,
  isInitialized: false,
  error: null,

  /**
   * Called at app startup to restore session from SecureStore
   */
  initialize: async () => {
    set({ isLoading: true });
    try {
      const token = await SecureStore.getItemAsync(SECURE_STORE_KEYS.ACCESS_TOKEN);
      const userJson = await SecureStore.getItemAsync(SECURE_STORE_KEYS.USER_DATA);

      if (token && userJson) {
        const user = JSON.parse(userJson) as User;
        set({ accessToken: token, user, isInitialized: true, isLoading: false });
      } else {
        set({ isInitialized: true, isLoading: false });
      }
    } catch {
      // If anything fails, just start fresh
      set({ isInitialized: true, isLoading: false });
    }
  },

  /**
   * Login with email + password, stores tokens + user in SecureStore
   */
  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await apiLogin({ email, password });
      const { user, accessToken, refreshToken } = response;

      await SecureStore.setItemAsync(SECURE_STORE_KEYS.ACCESS_TOKEN, accessToken);
      await SecureStore.setItemAsync(SECURE_STORE_KEYS.REFRESH_TOKEN, refreshToken);
      await SecureStore.setItemAsync(SECURE_STORE_KEYS.USER_DATA, JSON.stringify(user));

      set({ user, accessToken, isLoading: false, error: null });
    } catch (err: unknown) {
      const message = extractErrorMessage(err, 'Login failed. Please check your credentials.');
      set({ isLoading: false, error: message });
      throw new Error(message);
    }
  },

  /**
   * Logout: calls API, clears SecureStore, resets state
   */
  logout: async () => {
    set({ isLoading: true });
    try {
      const refreshToken = await SecureStore.getItemAsync(SECURE_STORE_KEYS.REFRESH_TOKEN);
      if (refreshToken) {
        await apiLogout(refreshToken).catch(() => {
          // Ignore API errors on logout - still clear local state
        });
      }
    } finally {
      await SecureStore.deleteItemAsync(SECURE_STORE_KEYS.ACCESS_TOKEN);
      await SecureStore.deleteItemAsync(SECURE_STORE_KEYS.REFRESH_TOKEN);
      await SecureStore.deleteItemAsync(SECURE_STORE_KEYS.USER_DATA);
      set({ user: null, accessToken: null, isLoading: false, error: null });
    }
  },

  /**
   * Store new tokens (called after OAuth or token refresh from outside)
   */
  setTokens: async (access: string, refresh: string) => {
    await SecureStore.setItemAsync(SECURE_STORE_KEYS.ACCESS_TOKEN, access);
    await SecureStore.setItemAsync(SECURE_STORE_KEYS.REFRESH_TOKEN, refresh);
    set({ accessToken: access });

    // Optionally refresh user profile
    try {
      const user = await getProfile();
      await SecureStore.setItemAsync(SECURE_STORE_KEYS.USER_DATA, JSON.stringify(user));
      set({ user });
    } catch {
      // Non-critical
    }
  },

  setUser: (user: User) => {
    set({ user });
    SecureStore.setItemAsync(SECURE_STORE_KEYS.USER_DATA, JSON.stringify(user)).catch(() => {});
  },

  clearError: () => set({ error: null }),
}));

function extractErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object') {
    const axiosErr = err as {
      response?: { data?: { message?: string } };
      message?: string;
    };
    return axiosErr.response?.data?.message ?? axiosErr.message ?? fallback;
  }
  return fallback;
}
