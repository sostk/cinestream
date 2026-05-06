import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

type SettingsState = {
  cineproBaseUrl: string;
  tmdbApiKey: string;
  hasCompletedOnboarding: boolean;
  autoQuality: boolean;
  defaultPlaybackRate: number;
  setCineproBaseUrl: (url: string) => void;
  setTmdbApiKey: (key: string) => void;
  completeOnboarding: (payload: { tmdbApiKey: string; cineproBaseUrl: string }) => void;
  reopenOnboarding: () => void;
  setAutoQuality: (v: boolean) => void;
  setDefaultPlaybackRate: (r: number) => void;
};

const SETTINGS_VERSION = 2;

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      cineproBaseUrl: '',
      tmdbApiKey: '',
      hasCompletedOnboarding: false,
      autoQuality: true,
      defaultPlaybackRate: 1,

      setCineproBaseUrl: (url) => set({ cineproBaseUrl: url.trim().replace(/\/$/, '') }),

      setTmdbApiKey: (key) => set({ tmdbApiKey: key.trim() }),

      completeOnboarding: ({ tmdbApiKey, cineproBaseUrl }) =>
        set({
          tmdbApiKey: tmdbApiKey.trim(),
          cineproBaseUrl: cineproBaseUrl.trim().replace(/\/$/, ''),
          hasCompletedOnboarding: true,
        }),

      reopenOnboarding: () => set({ hasCompletedOnboarding: false }),

      setAutoQuality: (v) => set({ autoQuality: v }),
      setDefaultPlaybackRate: (r) => set({ defaultPlaybackRate: r }),
    }),
    {
      name: 'cinestream-settings',
      version: SETTINGS_VERSION,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        cineproBaseUrl: s.cineproBaseUrl,
        tmdbApiKey: s.tmdbApiKey,
        hasCompletedOnboarding: s.hasCompletedOnboarding,
        autoQuality: s.autoQuality,
        defaultPlaybackRate: s.defaultPlaybackRate,
      }),
      migrate: (persistedState, version) => {
        const p = persistedState as Partial<{
          cineproBaseUrl: string;
          autoQuality: boolean;
          defaultPlaybackRate: number;
          tmdbApiKey: string;
        }>;

        if (version < SETTINGS_VERSION) {
          return {
            cineproBaseUrl: typeof p.cineproBaseUrl === 'string' ? p.cineproBaseUrl : '',
            autoQuality: typeof p.autoQuality === 'boolean' ? p.autoQuality : true,
            defaultPlaybackRate: typeof p.defaultPlaybackRate === 'number' ? p.defaultPlaybackRate : 1,
            tmdbApiKey: typeof p.tmdbApiKey === 'string' ? p.tmdbApiKey : '',
            hasCompletedOnboarding: true,
          };
        }

        return persistedState as {
          cineproBaseUrl: string;
          autoQuality: boolean;
          defaultPlaybackRate: number;
          tmdbApiKey: string;
          hasCompletedOnboarding: boolean;
        };
      },
    }
  )
);
