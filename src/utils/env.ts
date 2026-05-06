function stripTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

/** Optional dev default from `.env`; user-configured URL from onboarding/settings overrides at runtime. */
export const CINEPRO_ENV_BASE_URL = stripTrailingSlash(
  process.env.EXPO_PUBLIC_CINEPRO_BASE_URL ?? ''
);

/** Optional dev default from `.env`; user key from onboarding/settings overrides at runtime. */
export const TMDB_ENV_API_KEY = process.env.EXPO_PUBLIC_TMDB_API_KEY ?? '';

export const TMDB_API_BASE = 'https://api.themoviedb.org/3';

export const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';
