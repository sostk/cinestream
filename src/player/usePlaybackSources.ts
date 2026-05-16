import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CineProApi } from '@/api/cineproClient';
import { OmssHttpError } from '@/api/types/omss';
import {
  movieSourcesQueryOptions,
  tvEpisodeSourcesQueryOptions,
} from '@/player/playbackSourceQuery';
import { normalizeOmssSources, sortSourcesForPlayback } from '@/utils/stream';
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

  const queryOptions =
    mediaType === 'movie'
      ? movieSourcesQueryOptions(tmdbId, enabled)
      : tvEpisodeSourcesQueryOptions(tmdbId, season ?? 1, episode ?? 1, enabled);

  const omss = useQuery(queryOptions);

  useEffect(() => {
    if (!omss.data) return;
    playbackLogger.info('Stream manifest fetched', summarizeOmssResponse(omss.data));
    for (const d of omss.data.diagnostics ?? []) {
      playbackLogger.info(`OMSS diagnostic [${d.severity}] ${d.code}`, { message: d.message, field: d.field });
    }
    const normalized = normalizeOmssSources(omss.data.sources);
    if (omss.data.sources.length !== normalized.length) {
      const skipped = omss.data.sources
        .filter((s) => !normalized.some((n) => n.url === s.url))
        .map((s) => s.type)
        .slice(0, 8);
      playbackLogger.warn('Some OMSS sources skipped (unknown type or missing URL)', {
        total: omss.data.sources.length,
        playable: normalized.length,
        sampleTypes: skipped,
      });
    }
    const top = sortSourcesForPlayback(normalized)[0];
    if (top) {
      playbackLogger.debug('Top priority source (MP4 / highest quality first)', loggableSourceSummary(top));
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
    return sortSourcesForPlayback(normalizeOmssSources(omss.data?.sources ?? []));
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
          await queryClient.invalidateQueries({ queryKey: queryOptions.queryKey });
        } catch (e) {
          playbackLogger.warn('OMSS refresh failed; sources may expire', e);
        }
      })();
    }, delay);

    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [omss.data?.responseId, omss.data?.expiresAt, queryClient, queryOptions.queryKey]);

  const [sourceIndex, setSourceIndex] = useState(0);
  const prevSortedKeyRef = useRef('');

  useEffect(() => {
    if (!sorted.length) {
      setSourceIndex(0);
      prevSortedKeyRef.current = sortedKey;
      return;
    }
    if (sortedKey !== prevSortedKeyRef.current) {
      prevSortedKeyRef.current = sortedKey;
      setSourceIndex(0);
    }
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
