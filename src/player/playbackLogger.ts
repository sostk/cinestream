/**
 * Centralized playback / stream diagnostics. Enable verbose logs with
 * globalThis.__CINESTREAM_PLAYBACK_DEBUG__ = true in dev tools.
 */
const TAG = '[Playback]';

function debugEnabled(): boolean {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return false;
  return (globalThis as { __CINESTREAM_PLAYBACK_DEBUG__?: boolean }).__CINESTREAM_PLAYBACK_DEBUG__ === true;
}

export const playbackLogger = {
  debug(message: string, extra?: Record<string, unknown>) {
    if (!debugEnabled()) return;
    if (extra) console.log(TAG, message, extra);
    else console.log(TAG, message);
  },
  info(message: string, extra?: Record<string, unknown>) {
    if (extra) console.info(TAG, message, extra);
    else console.info(TAG, message);
  },
  warn(message: string, extra?: unknown) {
    if (extra !== undefined) console.warn(TAG, message, extra);
    else console.warn(TAG, message);
  },
  error(message: string, extra?: unknown) {
    if (extra !== undefined) console.error(TAG, message, extra);
    else console.error(TAG, message);
  },
};
