import { useSettingsStore } from '@/store/settingsStore';
import { TMDB_ENV_API_KEY } from '@/utils/env';

/** TMDB key from Settings / onboarding, else optional `EXPO_PUBLIC_TMDB_API_KEY` for local dev. */
export function getEffectiveTmdbApiKey(): string {
  const fromStore = useSettingsStore.getState().tmdbApiKey?.trim() ?? '';
  return fromStore || TMDB_ENV_API_KEY;
}

/** Non-reactive check (e.g. imperative code). Prefer `useHasConfiguredTmdbKey` in components so queries update when the key changes. */
export function hasConfiguredTmdbKey(): boolean {
  return !!getEffectiveTmdbApiKey();
}

export function useHasConfiguredTmdbKey(): boolean {
  const userKey = useSettingsStore((s) => s.tmdbApiKey);
  return !!(userKey.trim() || TMDB_ENV_API_KEY);
}
