import type { OnVideoErrorData } from 'react-native-video';
import { playbackLogger } from '@/player/playbackLogger';
import {
  formatPlaybackError,
  isAndroidExoNetworkOrSourceError,
  isLikelyTransientPlaybackError,
} from '@/player/streamUtils';

export type PlaybackPhase = 'idle' | 'playing' | 'buffering' | 'seeking' | 'error';

export type PlaybackFallbackContext = {
  sourceIndex: number;
  sourceCount: number;
  uri: string;
  sourceType?: string;
};

export type PlaybackFallbackCallbacks = {
  getContext: () => PlaybackFallbackContext;
  onRetrySameSource: () => void;
  onSwitchSource: (reason: string) => void;
  onExhausted: () => void;
};

const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_SEEK_COOLDOWN_MS = 4_000;
/** Ignore spurious Exo errors that fire in the first moments of a buffer/seek. */
const DEFAULT_ERROR_GRACE_MS = 4_000;

export type PlaybackFallbackController = ReturnType<typeof createPlaybackFallbackController>;

export function createPlaybackFallbackController(
  callbacks: PlaybackFallbackCallbacks,
  options?: {
    maxRetriesPerSource?: number;
    seekCooldownMs?: number;
    errorGraceDuringBufferMs?: number;
  }
) {
  const maxRetries = options?.maxRetriesPerSource ?? DEFAULT_MAX_RETRIES;
  const seekCooldownMs = options?.seekCooldownMs ?? DEFAULT_SEEK_COOLDOWN_MS;
  const errorGraceMs = options?.errorGraceDuringBufferMs ?? DEFAULT_ERROR_GRACE_MS;

  let phase: PlaybackPhase = 'idle';
  let seeking = false;
  let seekCooldownUntil = 0;
  let bufferingSince: number | null = null;
  let retries = 0;

  const logFields = () => {
    const ctx = callbacks.getContext();
    return {
      phase,
      seeking,
      retries,
      sourceIndex: ctx.sourceIndex,
      sourceCount: ctx.sourceCount,
      sourceType: ctx.sourceType,
      uriTail: ctx.uri ? ctx.uri.slice(-72) : undefined,
    };
  };

  const blockReason = (): string | null => {
    if (seeking) return 'seeking';
    if (Date.now() < seekCooldownUntil) return 'seek_cooldown';
    return null;
  };

  const requestRetryOrSwitch = (reason: string) => {
    const blocked = blockReason();
    if (blocked) {
      playbackLogger.info('Fallback blocked', { reason, blocked, ...logFields() });
      return;
    }

    if (retries < maxRetries) {
      retries += 1;
      phase = 'buffering';
      playbackLogger.warn(`Retrying same source (${retries}/${maxRetries})`, {
        reason,
        ...logFields(),
      });
      callbacks.onRetrySameSource();
      return;
    }

    retries = 0;
    const ctx = callbacks.getContext();
    if (ctx.sourceIndex >= ctx.sourceCount - 1) {
      playbackLogger.warn('Fallback exhausted — no sources left', { reason, ...logFields() });
      callbacks.onExhausted();
      return;
    }

    playbackLogger.info('Fallback triggered: switching source', { reason, ...logFields() });
    callbacks.onSwitchSource(reason);
  };

  return {
    getPhase: () => phase,

    resetForUri() {
      phase = 'idle';
      seeking = false;
      seekCooldownUntil = 0;
      bufferingSince = null;
      retries = 0;
      playbackLogger.info('Playback fallback reset for new URI', logFields());
    },

    onPlaying() {
      phase = 'playing';
      seeking = false;
      bufferingSince = null;
      retries = 0;
      playbackLogger.info('Playback playing', logFields());
    },

    onSeekStart() {
      seeking = true;
      phase = 'seeking';
      playbackLogger.info('Seek started → fallback blocked', logFields());
    },

    onSeekEnd() {
      seeking = false;
      seekCooldownUntil = Date.now() + seekCooldownMs;
      phase = bufferingSince != null ? 'buffering' : 'playing';
      playbackLogger.info('Seek ended → fallback cooldown active', {
        cooldownMs: seekCooldownMs,
        ...logFields(),
      });
    },

    onBuffer(isBuffering: boolean) {
      if (isBuffering) {
        if (bufferingSince == null) {
          bufferingSince = Date.now();
          playbackLogger.info('Buffering started', {
            at: bufferingSince,
            ...logFields(),
          });
        }
        if (!seeking) {
          phase = 'buffering';
        }
        return;
      }

      if (bufferingSince != null) {
        playbackLogger.info('Buffering ended', {
          durationMs: Date.now() - bufferingSince,
          ...logFields(),
        });
      }
      bufferingSince = null;
      if (!seeking) {
        phase = 'playing';
      }
    },

    onPlaybackError(ev: OnVideoErrorData) {
      const details = formatPlaybackError(ev);
      const blocked = blockReason();
      if (blocked) {
        playbackLogger.info('Playback error ignored', {
          blocked,
          summary: details.summary,
          code: details.code || undefined,
          ...logFields(),
        });
        return;
      }

      const networkOrHttp = isAndroidExoNetworkOrSourceError(ev);

      if (
        !networkOrHttp &&
        bufferingSince != null &&
        Date.now() - bufferingSince < errorGraceMs
      ) {
        playbackLogger.info('Playback error ignored (buffering grace period)', {
          graceMs: errorGraceMs,
          summary: details.summary,
          ...logFields(),
        });
        return;
      }

      if (isLikelyTransientPlaybackError(ev)) {
        playbackLogger.info('Playback error ignored (transient)', {
          summary: details.summary,
          code: details.code || undefined,
          ...logFields(),
        });
        return;
      }

      phase = 'error';
      if (networkOrHttp) {
        retries = maxRetries;
        playbackLogger.warn('HTTP/network playback error — switching stream', {
          summary: details.summary,
          code: details.code || undefined,
          ...logFields(),
        });
      } else {
        playbackLogger.warn('Playback error — evaluating retry/switch', {
          summary: details.summary,
          code: details.code || undefined,
          errorString: details.errorString,
          ...logFields(),
        });
      }
      requestRetryOrSwitch(`playback_error:${details.code || 'unknown'}`);
    },

    onSourceSwitched() {
      retries = 0;
      phase = 'idle';
      bufferingSince = null;
      playbackLogger.info('Source switched — retry counter reset', logFields());
    },

    dispose() {},
  };
}
