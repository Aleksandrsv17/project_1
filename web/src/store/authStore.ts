import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '../api/client';

interface User { id: string; email: string; first_name: string; last_name: string; role: string; }

interface AuthState {
  token: string | null;
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  register: (data: any) => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      login: async (email, password) => {
        const { data } = await api.post('/auth/login', { email, password });
        set({ token: data.data.accessToken, user: data.data.user });
      },
      register: async (formData) => {
        const { data } = await api.post('/auth/register', formData);
        set({ token: data.data.accessToken, user: data.data.user });
      },
      logout: () => set({ token: null, user: null }),
    }),
    { name: 'vip-web-auth' }
  )
);
