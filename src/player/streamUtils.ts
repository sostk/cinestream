import type { OmssSource, OmssSourceResponse } from '@/api/types/omss';
import type { OnVideoErrorData } from 'react-native-video';
import { Platform } from 'react-native';
import { normalizeOmssSources } from '@/utils/stream';
import { omssUpstreamUrl, parseOmssProxyData } from '@/utils/omssProxy';

/** Stable id for persisting user's last manual source choice per title. */
export function sourceSignature(source: OmssSource): string {
  const id = source.id?.trim();
  if (id) return id;
  const tail = source.url.slice(-48);
  return `${source.provider.id}|${source.quality}|${source.type}|${tail}`;
}

export function parseExpiresAtMs(iso: string | undefined): number | null {
  if (!iso?.trim()) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

export function sniffDrmHint(url: string): boolean {
  const u = url.toLowerCase();
  return (
    u.includes('widevine') ||
    u.includes('playready') ||
    u.includes('fairplay') ||
    u.includes('/drm') ||
    u.includes('drm=')
  );
}

export function loggableSourceSummary(s: OmssSource, extra?: Record<string, unknown>) {
  const upstream = omssUpstreamUrl(s.url);
  let upstreamHost: string | undefined;
  try {
    upstreamHost = new URL(upstream).hostname;
  } catch {
    upstreamHost = undefined;
  }
  return {
    quality: s.quality,
    type: s.type,
    provider: s.provider.name,
    drmHint: sniffDrmHint(s.url),
    urlLength: s.url.length,
    isProxy: !!parseOmssProxyData(s.url),
    upstreamHost,
    upstreamHasExtension: /\.(m3u8|mpd|mp4|m4v|mkv|webm)(\?|#|$)/i.test(upstream),
    audioTracksMeta: s.audioTracks?.length ?? 0,
    ...extra,
  };
}

export function loggablePlaybackRequest(
  s: OmssSource,
  req: { via: 'upstream' | 'proxy'; uri: string }
) {
  let playbackUriHost: string | undefined;
  try {
    playbackUriHost = new URL(req.uri).hostname;
  } catch {
    playbackUriHost = undefined;
  }
  return loggableSourceSummary(s, { playbackVia: req.via, playbackUriHost });
}

export function summarizeOmssResponse(data: OmssSourceResponse) {
  const normalized = normalizeOmssSources(data.sources);
  const typeCounts: Record<string, number> = {};
  let proxyCount = 0;
  for (const s of data.sources) {
    typeCounts[s.type] = (typeCounts[s.type] ?? 0) + 1;
    if (parseOmssProxyData(s.url)) proxyCount += 1;
  }
  return {
    responseId: data.responseId,
    expiresAt: data.expiresAt,
    totalSources: data.sources.length,
    playableSources: normalized.length,
    proxySources: proxyCount,
    types: typeCounts,
    subtitles: data.subtitles?.length ?? 0,
    diagnostics: data.diagnostics,
  };
}

export type RetryablePlaybackError = {
  code?: string | number;
  localizedDescription?: string;
  domain?: string;
};

export type PlaybackErrorDetails = {
  code: string;
  summary: string;
  errorString?: string;
  errorException?: string;
  localizedDescription?: string;
  domain?: string;
};

function readNativeVideoError(ev: OnVideoErrorData): Record<string, unknown> {
  const err = ev.error;
  if (err != null && typeof err === 'object') return err as Record<string, unknown>;
  return {};
}

/** Flatten react-native-video `onError` payload for logs and UI. */
export function formatPlaybackError(ev: OnVideoErrorData): PlaybackErrorDetails {
  const o = readNativeVideoError(ev);
  const code = String(o.errorCode ?? o.code ?? '');
  const errorString = typeof o.errorString === 'string' ? o.errorString : undefined;
  const errorException = typeof o.errorException === 'string' ? o.errorException : undefined;
  const localizedDescription =
    typeof o.localizedDescription === 'string' ? o.localizedDescription : undefined;
  const domain = typeof o.domain === 'string' ? o.domain : undefined;

  const summary =
    localizedDescription ||
    errorString ||
    errorException ||
    (typeof o.error === 'string' ? o.error : undefined) ||
    (code ? `Playback failed (code ${code})` : 'Playback failed');

  return {
    code,
    summary,
    errorString,
    errorException,
    localizedDescription,
    domain,
  };
}

function androidExoErrorBlob(ev: OnVideoErrorData): { code: string; blob: string } {
  const o = readNativeVideoError(ev);
  const code = String(o.errorCode ?? o.code ?? '');
  const blob = [
    o.errorString,
    o.errorException,
    o.errorStackTrace,
    o.localizedDescription,
    o.localizedFailureReason,
    o.error,
  ]
    .filter((x) => typeof x === 'string' && x.length > 0)
    .join(' ');
  const cause = (ev as { cause?: unknown }).cause;
  if (cause && typeof cause === 'object') {
    const c = cause as Record<string, unknown>;
    return {
      code,
      blob: `${blob} ${c.message ?? ''} ${c.name ?? ''}`.trim(),
    };
  }
  return { code, blob };
}

/** Network / HTTP failures — format override will not help. */
export function isAndroidExoNetworkOrSourceError(ev: OnVideoErrorData): boolean {
  if (Platform.OS !== 'android') return false;
  const { code, blob } = androidExoErrorBlob(ev);
  const n = Number(code);
  if (n >= 2000 && n < 3000) return true;
  if (/BAD_HTTP_STATUS|HTTP_STATUS|NETWORK|IO_|SSL|CLEARTEXT|403|404|401|timeout/i.test(blob)) {
    return true;
  }
  return false;
}

/**
 * ExoPlayer could not parse the stream with the current container hint — try HLS/DASH/progressive overrides.
 * @see androidx.media3.exoplayer.source.UnrecognizedInputFormatException
 */
export function isAndroidExoFormatMismatch(ev: OnVideoErrorData): boolean {
  if (Platform.OS !== 'android') return false;
  if (isAndroidExoNetworkOrSourceError(ev)) return false;
  const { code, blob } = androidExoErrorBlob(ev);
  if (code === '23003' || blob.includes('PARSING_CONTAINER_UNSUPPORTED')) return true;
  if (blob.includes('UnrecognizedInputFormatException')) return true;
  if (blob.includes('ParserException') && blob.includes('Input')) return true;
  return false;
}

/** @deprecated Use {@link isAndroidExoFormatMismatch}. */
export const isAndroidExoProgressiveContainerMismatch = isAndroidExoFormatMismatch;

/**
 * Device decoder cannot play this codec — try another stream source (Exo cannot software-decode without FFmpeg ext).
 * Media3: ERROR_CODE_DECODING_FORMAT_UNSUPPORTED (4001), ERROR_CODE_DECODER_INIT_FAILED (4002).
 */
export function isAndroidExoDecoderUnsupported(ev: OnVideoErrorData): boolean {
  if (Platform.OS !== 'android') return false;
  const { code, blob } = androidExoErrorBlob(ev);
  if (code === '4001' || code === '4002' || code === '24003' || code === '24004') return true;
  if (blob.includes('DECODING_FORMAT_UNSUPPORTED')) return true;
  if (blob.includes('DECODER_INIT_FAILED')) return true;
  if (blob.includes('MediaCodec') && blob.includes('codec')) return true;
  if (blob.includes('OMX.') && /error|failed|unsupported/i.test(blob)) return true;
  return false;
}

export function isAndroidExoRetriablePlaybackError(ev: OnVideoErrorData): boolean {
  return isAndroidExoFormatMismatch(ev) || isAndroidExoDecoderUnsupported(ev);
}

/**
 * Benign Exo/HLS errors during seek, segment swap, or brief rebuffer — not a reason to change sources.
 */
export function isLikelyTransientPlaybackError(ev: OnVideoErrorData): boolean {
  const { code, blob } = androidExoErrorBlob(ev);
  const lower = blob.toLowerCase();
  if (/cancelled|canceled|operation was cancelled|behind live window/i.test(blob)) return true;
  if (/seek| discontinuity|playliststuck|stuck behind/i.test(lower)) return true;
  if (code === '22001' || code === '22002' || code === '22003') return true;
  if (lower.includes('loading finished before preparation')) return true;
  return false;
}
