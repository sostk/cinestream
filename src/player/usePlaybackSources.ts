import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CineProApi } from '@/api/cineproClient';
import { qk } from '@/api/queryKeys';
import type { OmssSourceResponse } from '@/api/types/omss';
import { OmssHttpError } from '@/api/types/omss';
import {
  sortSourcesByQualityDesc,
  isPlayableType,
} from '@/utils/stream';
import { playbackLogger } from '@/player/playbackLogger';
import { loggableSourceSummary, parseExpiresAtMs, sourceSignature, summarizeOmssResponse } from '@/player/streamUtils';

type Args = {
  enabled: boolean;
  mediaType: 'movie' | 'tv';
  tmdbId: number;
  season?: number;
  episode?: number;
};

export function usePlaybackSources(params: Args) {
  const { enabled, mediaType, tmdbId, season, episode } = params;
  const queryClient = useQueryClient();

  const queryKey =
    mediaType === 'movie'
      ? qk.movieSources(tmdbId)
      : qk.tvSources(tmdbId, season ?? 1, episode ?? 1);

  const omss = useQuery<OmssSourceResponse, Error>({
    queryKey,
    queryFn: () =>
      mediaType === 'movie'
        ? CineProApi.movieSources(tmdbId)
        : CineProApi.tvEpisodeSources({
            tmdbShowId: tmdbId,
            season: season ?? 1,
            episode: episode ?? 1,
          }),
    enabled,
    retry: (c, err) => {
      const status = err instanceof OmssHttpError ? err.status : undefined;
      if (status === 404) return false;
      return c < 2;
    },
  });

  useEffect(() => {
    if (!omss.data) return;
    playbackLogger.info('Stream manifest fetched', summarizeOmssResponse(omss.data));
    for (const d of omss.data.diagnostics ?? []) {
      playbackLogger.info(`OMSS diagnostic [${d.severity}] ${d.code}`, { message: d.message, field: d.field });
    }
    const playable = omss.data.sources.filter((s) => isPlayableType(s.type));
    if (playable[0]) {
      playbackLogger.debug('Top priority source after sort would be used when auto', loggableSourceSummary(playable[0]));
    }
  }, [omss.data]);

  useEffect(() => {
    if (omss.error) {
      playbackLogger.error('Stream fetch failed', {
        message: omss.error.message,
        ...(omss.error instanceof OmssHttpError ? { status: omss.error.status } : {}),
      });
    }
  }, [omss.error]);

  const sorted = useMemo(() => {
    const list = omss.data?.sources ?? [];
    return sortSourcesByQualityDesc(list.filter((s) => isPlayableType(s.type)));
  }, [omss.data?.sources]);

  const sortedKey = useMemo(() => sorted.map((s) => sourceSignature(s)).join('|'), [sorted]);

  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
    const id = omss.data?.responseId;
    const exp = parseExpiresAtMs(omss.data?.expiresAt);
    if (!id || !exp) return;

    const leadMs = 90_000;
    const delay = Math.max(5_000, exp - Date.now() - leadMs);
    refreshTimerRef.current = setTimeout(() => {
      void (async () => {
        try {
          await CineProApi.refresh(id);
          playbackLogger.info('OMSS session refreshed before expiry', { responseId: id });
          await queryClient.invalidateQueries({ queryKey });
        } catch (e) {
          playbackLogger.warn('OMSS refresh failed; sources may expire', e);
        }
      })();
    }, delay);

    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [omss.data?.responseId, omss.data?.expiresAt, queryClient, queryKey]);

  const [sourceIndex, setSourceIndex] = useState(0);

  useEffect(() => {
    if (!sorted.length) {
      setSourceIndex(0);
      return;
    }
    setSourceIndex((i) => Math.min(Math.max(0, i), sorted.length - 1));
  }, [sortedKey, sorted.length]);

  const activeSource = sorted[sourceIndex];

  useEffect(() => {
    if (activeSource) {
      playbackLogger.info('Active stream source', loggableSourceSummary(activeSource));
    }
  }, [activeSource]);

  return {
    omss,
    sorted,
    sourceIndex,
    setSourceIndex,
    activeSource,
    sortedKey,
  };
}
