import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PlayerAspectMode, PlayerResizeMode } from '@/player/playerDisplay';

type SettingsState = {
  cineproBaseUrl: string;
  tmdbApiKey: string;
  hasCompletedOnboarding: boolean;
  autoQuality: boolean;
  defaultPlaybackRate: number;
  autoplayNextEpisode: boolean;
  /** Android player: how video is scaled inside its view. */
  playerResizeMode: PlayerResizeMode;
  /** Android player: letterbox target frame; auto uses full screen. */
  playerAspectMode: PlayerAspectMode;
  setCineproBaseUrl: (url: string) => void;
  setTmdbApiKey: (key: string) => void;
  completeOnboarding: (payload: { tmdbApiKey: string; cineproBaseUrl: string }) => void;
  reopenOnboarding: () => void;
  setAutoQuality: (v: boolean) => void;
  setDefaultPlaybackRate: (r: number) => void;
  setAutoplayNextEpisode: (v: boolean) => void;
  setPlayerResizeMode: (mode: PlayerResizeMode) => void;
  setPlayerAspectMode: (mode: PlayerAspectMode) => void;
};

const SETTINGS_VERSION = 4;

const RESIZE_MODES = new Set<PlayerResizeMode>(['contain', 'cover', 'stretch', 'none']);
const ASPECT_MODES = new Set<PlayerAspectMode>(['auto', '16:9', '4:3', '21:9']);

function coerceResizeMode(v: unknown): PlayerResizeMode {
  return typeof v === 'string' && RESIZE_MODES.has(v as PlayerResizeMode) ? (v as PlayerResizeMode) : 'cover';
}

function coerceAspectMode(v: unknown): PlayerAspectMode {
  return typeof v === 'string' && ASPECT_MODES.has(v as PlayerAspectMode) ? (v as PlayerAspectMode) : 'auto';
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      cineproBaseUrl: '',
      tmdbApiKey: '',
      hasCompletedOnboarding: false,
      autoQuality: true,
      defaultPlaybackRate: 1,
      autoplayNextEpisode: true,
      playerResizeMode: 'cover',
      playerAspectMode: 'auto',

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
      setAutoplayNextEpisode: (v) => set({ autoplayNextEpisode: v }),
      setPlayerResizeMode: (mode) => set({ playerResizeMode: mode }),
      setPlayerAspectMode: (mode) => set({ playerAspectMode: mode }),
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
        autoplayNextEpisode: s.autoplayNextEpisode,
        playerResizeMode: s.playerResizeMode,
        playerAspectMode: s.playerAspectMode,
      }),
      migrate: (persistedState, version) => {
        const p = persistedState as Partial<{
          cineproBaseUrl: string;
          autoQuality: boolean;
          defaultPlaybackRate: number;
          tmdbApiKey: string;
          autoplayNextEpisode: boolean;
          playerResizeMode: PlayerResizeMode;
          playerAspectMode: PlayerAspectMode;
        }>;

        if (version < SETTINGS_VERSION) {
          return {
            cineproBaseUrl: typeof p.cineproBaseUrl === 'string' ? p.cineproBaseUrl : '',
            autoQuality: typeof p.autoQuality === 'boolean' ? p.autoQuality : true,
            defaultPlaybackRate: typeof p.defaultPlaybackRate === 'number' ? p.defaultPlaybackRate : 1,
            tmdbApiKey: typeof p.tmdbApiKey === 'string' ? p.tmdbApiKey : '',
            hasCompletedOnboarding: true,
            autoplayNextEpisode: typeof p.autoplayNextEpisode === 'boolean' ? p.autoplayNextEpisode : true,
            playerResizeMode: coerceResizeMode(p.playerResizeMode),
            playerAspectMode: coerceAspectMode(p.playerAspectMode),
          };
        }

        return persistedState as {
          cineproBaseUrl: string;
          autoQuality: boolean;
          defaultPlaybackRate: number;
          tmdbApiKey: string;
          hasCompletedOnboarding: boolean;
          autoplayNextEpisode: boolean;
          playerResizeMode: PlayerResizeMode;
          playerAspectMode: PlayerAspectMode;
        };
      },
    }
  )
);
