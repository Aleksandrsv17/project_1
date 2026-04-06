import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '../api/client';

interface Admin { id: string; email: string; role: string; first_name: string; last_name: string; }

interface AuthState {
  token: string | null;
  admin: Admin | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      admin: null,
      login: async (email, password) => {
        const { data } = await api.post('/auth/login', { email, password });
        if (data.data?.user?.role !== 'admin') throw new Error('Admin access required');
        set({ token: data.data.accessToken, admin: data.data.user });
      },
      logout: () => set({ token: null, admin: null }),
    }),
    { name: 'vip-admin-auth' }
  )
);
