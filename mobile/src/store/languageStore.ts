import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

export type Language = 'en' | 'ru' | 'de';

const STORAGE_KEY = 'app_language';

interface LanguageState {
  language: Language;
  setLanguage: (lang: Language) => void;
  hydrate: () => Promise<void>;
}

export const LANGUAGE_LABELS: Record<Language, string> = {
  en: 'English',
  ru: 'Русский',
  de: 'Deutsch',
};

export const useLanguageStore = create<LanguageState>((set) => ({
  language: 'en',
  setLanguage: (language) => {
    set({ language });
    SecureStore.setItemAsync(STORAGE_KEY, language).catch(() => {});
  },
  hydrate: async () => {
    try {
      const saved = await SecureStore.getItemAsync(STORAGE_KEY);
      if (saved === 'en' || saved === 'ru' || saved === 'de') {
        set({ language: saved });
      }
    } catch {}
  },
}));
