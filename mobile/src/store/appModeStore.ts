import { create } from 'zustand';

export type AppMode = 'customer' | 'owner';

interface AppModeState {
  mode: AppMode;
  setMode: (mode: AppMode) => void;
  toggleMode: () => void;
}

export const useAppModeStore = create<AppModeState>((set, get) => ({
  mode: 'customer',
  setMode: (mode) => set({ mode }),
  toggleMode: () => set({ mode: get().mode === 'customer' ? 'owner' : 'customer' }),
}));
