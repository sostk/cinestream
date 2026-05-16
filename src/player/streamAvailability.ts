import type { UseQueryResult } from '@tanstack/react-query';
import type { OmssSourceResponse } from '@/api/types/omss';
import { OmssHttpError } from '@/api/types/omss';
import { normalizeOmssSources } from '@/utils/stream';

export type StreamReadyState =
  | { status: 'no_core'; title: string; message: string }
  | { status: 'loading'; title: string; message: string }
  | { status: 'error'; title: string; message: string }
  | { status: 'empty'; title: string; message: string }
  | { status: 'ready'; playableCount: number };

type SourceQuerySlice = Pick<
  UseQueryResult<OmssSourceResponse, Error>,
  'isPending' | 'isFetching' | 'isError' | 'error' | 'data'
>;

export function countPlayableSources(data?: OmssSourceResponse): number {
  return normalizeOmssSources(data?.sources ?? []).length;
}

export function describeOmssError(err: Error | null | undefined): string {
  if (!err) return 'Something went wrong while contacting your Core server.';
  if (err instanceof OmssHttpError) {
    const code = err.body?.error?.code;
    if (err.status === 400 && err.message.includes('Configure your CinePro')) {
      return err.message;
    }
    if (code === 'NO_SOURCES_AVAILABLE' || err.status === 404) {
      return 'Core could not find any streams for this title. Try again later or pick another episode.';
    }
    if (code === 'INVALID_TMDB_ID') {
      return 'This title is not recognized by your Core server.';
    }
    if (code === 'INVALID_SEASON' || code === 'INVALID_EPISODE') {
      return 'That season or episode is not available on your Core server yet.';
    }
    if (err.status >= 500) {
      return 'Core server error — make sure CinePro is running and reachable, then try again.';
    }
    return err.body?.error?.message ?? err.message;
  }
  if (/network|fetch|failed/i.test(err.message)) {
    return 'Could not reach your Core server. Check Wi‑Fi and the URL in Settings.';
  }
  return err.message;
}

export function resolveStreamReadyState(
  coreConfigured: boolean,
  query: SourceQuerySlice
): StreamReadyState {
  if (!coreConfigured) {
    return {
      status: 'no_core',
      title: 'Core server not configured',
      message: 'Add your CinePro Core URL in Settings to load streaming links.',
    };
  }

  const waiting = query.isPending || (query.isFetching && !query.data);
  if (waiting) {
    return {
      status: 'loading',
      title: 'Finding streams…',
      message:
        'Your CinePro Core server is resolving playable links. This usually takes a few seconds.',
    };
  }

  if (query.isError) {
    return {
      status: 'error',
      title: 'Could not load streams',
      message: describeOmssError(query.error),
    };
  }

  const playableCount = countPlayableSources(query.data);
  if (playableCount === 0) {
    const rawCount = query.data?.sources.length ?? 0;
    const sampleTypes = [...new Set((query.data?.sources ?? []).map((s) => s.type))].slice(0, 6);
    return {
      status: 'empty',
      title: 'No playable streams',
      message:
        rawCount > 0
          ? `Core returned ${rawCount} link(s) but none matched a playable type${sampleTypes.length ? ` (e.g. ${sampleTypes.join(', ')})` : ''}. Check Core logs or try another title.`
          : 'Core has no streams for this title right now. Try again in a moment.',
    };
  }

  return { status: 'ready', playableCount };
}

export function streamAvailabilityDetailLine(
  state: StreamReadyState,
  expiresAt?: string
): string {
  switch (state.status) {
    case 'no_core':
      return 'Set your Core URL in Settings to prefetch streams.';
    case 'loading':
      return 'Connecting to CinePro Core…';
    case 'error':
      return state.message;
    case 'empty':
      return state.message;
    case 'ready': {
      const exp =
        expiresAt &&
        !Number.isNaN(Date.parse(expiresAt)) &&
        new Date(expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `${state.playableCount} stream${state.playableCount === 1 ? '' : 's'} ready${
        exp ? ` · refresh before ${exp}` : ''
      }`;
    }
  }
}
