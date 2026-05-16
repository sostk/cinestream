import { useCallback, useMemo } from 'react';
import { Alert } from 'react-native';
import { useAppNavigation } from '@/navigation/useAppNavigation';
import { useLibraryStore, mediaStorageKey } from '@/store/libraryStore';
import { useSettingsStore } from '@/store/settingsStore';
import { buildTvPlayerParams } from '@/player/playerEpisodeNav';
import { usePrefetchEpisodeSources } from '@/player/usePrefetchEpisodeSources';
import { resolveStreamReadyState } from '@/player/streamAvailability';
import type { TmdbEpisode } from '@/api/types/tmdb';

type ShowMeta = {
  tmdbId: number;
  seasonNumber: number;
  showTitle: string;
  posterPath?: string | null;
  backdropPath?: string | null;
};

export function usePlayTvEpisode({
  tmdbId,
  seasonNumber,
  episodes,
  showTitle,
  posterPath,
  backdropPath,
  prefetchEnabled = true,
}: ShowMeta & {
  episodes: TmdbEpisode[];
  prefetchEnabled?: boolean;
}) {
  const navigation = useAppNavigation();
  const cineproBaseUrl = useSettingsStore((s) => s.cineproBaseUrl);
  const coreConfigured = !!cineproBaseUrl.trim();
  const continueWatching = useLibraryStore((s) => s.continueWatching);

  const episodeNumbers = useMemo(
    () => episodes.map((e) => e.episode_number),
    [episodes]
  );

  const prefetchQueries = usePrefetchEpisodeSources(
    tmdbId,
    seasonNumber,
    episodeNumbers,
    prefetchEnabled && coreConfigured && episodeNumbers.length > 0
  );

  const episodeQueryByNumber = useMemo(() => {
    const map = new Map<number, (typeof prefetchQueries)[number]>();
    episodeNumbers.forEach((num, idx) => {
      map.set(num, prefetchQueries[idx]);
    });
    return map;
  }, [episodeNumbers, prefetchQueries]);

  const readyCount = useMemo(
    () =>
      prefetchQueries.filter(
        (q) => resolveStreamReadyState(coreConfigured, q).status === 'ready'
      ).length,
    [coreConfigured, prefetchQueries]
  );

  const resumeForEp = useCallback(
    (episodeNumber: number) => {
      const key = mediaStorageKey({
        mediaType: 'tv',
        tmdbId,
        season: seasonNumber,
        episode: episodeNumber,
      });
      return continueWatching.find((c) => c.mediaKey === key)?.positionSec;
    },
    [continueWatching, seasonNumber, tmdbId]
  );

  const playEpisode = useCallback(
    (episodeNumber: number, episodeTitle: string) => {
      const q = episodeQueryByNumber.get(episodeNumber);
      const streamState = resolveStreamReadyState(
        coreConfigured,
        q ?? { isPending: true, isFetching: true, isError: false, error: null, data: undefined }
      );

      const go = () => {
        navigation.navigate(
          'Player',
          buildTvPlayerParams({
            tmdbId,
            seasonNumber,
            episodeNumber,
            episodeTitle,
            showTitle,
            episodes,
            posterPath,
            backdropPath,
            resumeSec: resumeForEp(episodeNumber),
          })
        );
      };

      if (streamState.status === 'ready') {
        go();
        return;
      }
      if (streamState.status === 'loading') {
        Alert.alert(streamState.title, streamState.message, [
          { text: 'Wait', style: 'cancel' },
          { text: 'Open player', onPress: go },
        ]);
        return;
      }
      Alert.alert(streamState.title, streamState.message);
    },
    [
      backdropPath,
      coreConfigured,
      episodeQueryByNumber,
      episodes,
      navigation,
      posterPath,
      resumeForEp,
      seasonNumber,
      showTitle,
      tmdbId,
    ]
  );

  return { playEpisode, episodeQueryByNumber, readyCount, coreConfigured };
}
