import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { tvEpisodeSourcesQueryOptions } from '@/player/playbackSourceQuery';

/** Prefetch OMSS manifests for a batch of episodes (e.g. when a season is opened). */
export function usePrefetchEpisodeSources(
  tmdbShowId: number,
  season: number,
  episodeNumbers: number[],
  enabled: boolean
) {
  const uniqueEpisodes = useMemo(
    () => [...new Set(episodeNumbers.filter((n) => n > 0))].sort((a, b) => a - b),
    [episodeNumbers]
  );

  return useQueries({
    queries: uniqueEpisodes.map((episode) =>
      tvEpisodeSourcesQueryOptions(tmdbShowId, season, episode, enabled)
    ),
  });
}
