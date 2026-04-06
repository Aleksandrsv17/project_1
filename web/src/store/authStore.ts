import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '../api/client';

interface User { id: string; email: string; first_name: string; last_name: string; role: string; }

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  register: (data: any) => Promise<void>;
  setTokens: (accessToken: string, refreshToken: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      refreshToken: null,
      user: null,
      login: async (email, password) => {
        const { data } = await api.post('/auth/login', { email, password });
        set({
          token: data.data.tokens.access_token,
          refreshToken: data.data.tokens.refresh_token,
          user: data.data.user,
        });
      },
      register: async (formData) => {
        const { data } = await api.post('/auth/register', formData);
        set({
          token: data.data.tokens.access_token,
          refreshToken: data.data.tokens.refresh_token,
          user: data.data.user,
        });
      },
      setTokens: (accessToken, refreshToken) => set({ token: accessToken, refreshToken }),
      logout: () => set({ token: null, refreshToken: null, user: null }),
    }),
    { name: 'vip-web-auth' }
  )
);
