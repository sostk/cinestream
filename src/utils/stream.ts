import { Platform } from 'react-native';
import Constants from 'expo-constants';
import type { OmssSource, OmssStreamType } from '@/api/types/omss';
import { getOmssBaseUrl } from '@/api/runtimeConfig';
import { playbackLogger } from '@/player/playbackLogger';
import {
  headersFromOmssProxyPayload,
  isOmssProxyUrl,
  omssUpstreamUrl,
  parseOmssProxyData,
} from '@/utils/omssProxy';

const QUALITY_RANK: Record<string, number> = {
  unknown: 0,
  '144p': 1,
  '240p': 2,
  '360p': 3,
  '480p': 4,
  '720p': 5,
  '1080p': 6,
  '1440p': 7,
  '2160p': 8,
};

export function rankQuality(q: string): number {
  const key = q.toLowerCase().trim();
  if (QUALITY_RANK[key] != null) return QUALITY_RANK[key];
  const digits = key.replace(/[^0-9]/g, '');
  if (digits) {
    const mapped = `${digits}p`;
    if (QUALITY_RANK[mapped] != null) return QUALITY_RANK[mapped];
  }
  return 5;
}

/** Higher = preferred when auto-selecting / ordering the source list. */
const PLAYBACK_TYPE_PRIORITY: Record<OmssStreamType, number> = {
  mp4: 5,
  http: 4,
  hls: 3,
  dash: 2,
  webm: 1,
  mkv: 1,
};

export function compareSourcesForPlayback(a: OmssSource, b: OmssSource): number {
  const typeDiff =
    (PLAYBACK_TYPE_PRIORITY[b.type] ?? 0) - (PLAYBACK_TYPE_PRIORITY[a.type] ?? 0);
  if (typeDiff !== 0) return typeDiff;
  return rankQuality(b.quality) - rankQuality(a.quality);
}

/** MP4 (highest quality first), then other types by the same quality order. */
export function sortSourcesForPlayback(sources: OmssSource[]): OmssSource[] {
  return [...sources].sort(compareSourcesForPlayback);
}

/** @deprecated Prefer {@link sortSourcesForPlayback}. */
export function sortSourcesByQualityDesc(sources: OmssSource[]): OmssSource[] {
  return sortSourcesForPlayback(sources);
}

/** Map CinePro / provider type strings to a normalized OMSS stream type. */
export function normalizeStreamType(raw: unknown, url?: string): OmssStreamType | null {
  const key = String(raw ?? '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '');

  const aliases: Record<string, OmssStreamType> = {
    hls: 'hls',
    m3u8: 'hls',
    mpegurl: 'hls',
    'application/x-mpegurl': 'hls',
    'application/vnd.apple.mpegurl': 'hls',
    'application/mpegurl': 'hls',
    dash: 'dash',
    mpd: 'dash',
    'application/dash+xml': 'dash',
    mp4: 'mp4',
    progressive: 'mp4',
    http: 'http',
    https: 'http',
    webm: 'webm',
    mkv: 'mkv',
    video: 'http',
    stream: 'http',
  };

  if (aliases[key]) return aliases[key];

  const u = url?.trim() ?? '';
  if (u) {
    const upstream = omssUpstreamUrl(u);
    const sniffTarget = upstream.startsWith('http')
      ? upstream
      : `http://placeholder.local${upstream.startsWith('/') ? upstream : `/${upstream}`}`;
    const sniffed = sniffUrlPlaybackContentType(sniffTarget);
    if (sniffed === 'application/x-mpegURL') return 'hls';
    if (sniffed === 'application/dash+xml') return 'dash';
    if (sniffed === 'video/mp4' || sniffed === 'video/webm' || sniffed === 'video/x-matroska') {
      return sniffed === 'video/webm' ? 'webm' : sniffed === 'video/x-matroska' ? 'mkv' : 'mp4';
    }
    const lower = upstream.toLowerCase();
    if (lower.includes('.m3u8') || lower.includes('m3u8')) return 'hls';
    if (lower.includes('.mpd')) return 'dash';
    if (lower.includes('.webm')) return 'webm';
    if (lower.includes('.mkv')) return 'mkv';
    if (lower.includes('.mp4') || lower.includes('.m4v')) return 'mp4';
  }

  return null;
}

export function normalizeOmssSource(source: OmssSource): OmssSource | null {
  const url = source.url?.trim();
  if (!url) return null;
  const type = normalizeStreamType(source.type, url);
  if (!type) return null;
  return { ...source, type, url };
}

export function normalizeOmssSources(sources: OmssSource[]): OmssSource[] {
  return sources.map((s) => normalizeOmssSource(s)).filter((s): s is OmssSource => s != null);
}

/** Best default stream: highest-quality MP4, else next-best type/quality. */
export function pickAutoSource(sources: OmssSource[]): OmssSource | undefined {
  const playable = normalizeOmssSources(sources);
  if (!playable.length) return undefined;
  return sortSourcesForPlayback(playable)[0];
}

/** True when the type (or URL) can be played after normalization. */
export function isPlayableType(type: OmssStreamType | string, url?: string): boolean {
  return normalizeStreamType(type, url) != null;
}

/**
 * Progressive MIME hint when the URL path/extension is explicit.
 * Opaque proxy URLs must stay `undefined` so Exo can probe extractors (or Android format-retry runs).
 */
export function videoSourceContentType(
  streamType: OmssStreamType,
  resolvedUrl?: string
): string | undefined {
  switch (streamType) {
    case 'hls':
      return 'application/x-mpegURL';
    case 'dash':
      return 'application/dash+xml';
    case 'webm':
      return resolvedUrl && /\.webm(\?|#|$)/i.test(resolvedUrl) ? 'video/webm' : undefined;
    case 'mkv':
      return resolvedUrl && /\.mkv(\?|#|$)/i.test(resolvedUrl) ? 'video/x-matroska' : undefined;
    case 'mp4':
    case 'http':
      return resolvedUrl && /\.(mp4|m4v)(\?|#|$)/i.test(resolvedUrl) ? 'video/mp4' : undefined;
    default:
      return undefined;
  }
}

/**
 * Infer HLS/DASH from URL shape when OMSS `type` is wrong (e.g. `mp4` but proxy serves m3u8).
 * Opaque `/v1/proxy?...` URLs cannot be sniffed and rely on declared type + Android retry-as-HLS.
 */
export type SniffedPlaybackMime =
  | 'application/x-mpegURL'
  | 'application/dash+xml'
  | 'application/vnd.ms-sstr+xml'
  | 'video/mp4'
  | 'video/webm'
  | 'video/x-matroska'
  | 'video/mp2t';

export function sniffUrlPlaybackContentType(resolvedUrl: string): SniffedPlaybackMime | undefined {
  try {
    const u = new URL(resolvedUrl);
    const path = u.pathname.toLowerCase();
    const t = u.searchParams.get('type')?.toLowerCase();
    const fmt = u.searchParams.get('format')?.toLowerCase();
    const container = u.searchParams.get('container')?.toLowerCase();

    if (
      path.endsWith('.m3u8') ||
      path.includes('.m3u8') ||
      t === 'hls' ||
      t === 'm3u8' ||
      fmt === 'hls' ||
      fmt === 'm3u8' ||
      container === 'hls'
    ) {
      return 'application/x-mpegURL';
    }
    if (
      path.endsWith('.mpd') ||
      path.includes('.mpd') ||
      t === 'dash' ||
      fmt === 'dash' ||
      fmt === 'mpd' ||
      container === 'dash'
    ) {
      return 'application/dash+xml';
    }
    if (
      path.endsWith('.ism') ||
      path.includes('.ism') ||
      t === 'ism' ||
      fmt === 'ism' ||
      fmt === 'smoothstreaming' ||
      container === 'ism'
    ) {
      return 'application/vnd.ms-sstr+xml';
    }
    if (path.endsWith('.webm') || path.includes('.webm') || fmt === 'webm' || container === 'webm') {
      return 'video/webm';
    }
    if (path.endsWith('.mkv') || path.includes('.mkv') || fmt === 'mkv' || container === 'mkv') {
      return 'video/x-matroska';
    }
    if (
      path.endsWith('.mp4') ||
      path.endsWith('.m4v') ||
      path.includes('.mp4') ||
      fmt === 'mp4' ||
      container === 'mp4'
    ) {
      return 'video/mp4';
    }
    if (path.endsWith('.ts') && !path.includes('.m3u8')) {
      return 'video/mp2t';
    }
  } catch {
    /* invalid URL */
  }
  return undefined;
}

/** Final ExoPlayer `source.type`: declared OMSS type wins for hls/dash; otherwise URL sniff, else progressive MIME. */
export function videoSourceContentTypeForPlayback(
  streamType: OmssStreamType,
  resolvedUrl: string
): string | undefined {
  if (streamType === 'hls') return 'application/x-mpegURL';
  if (streamType === 'dash') return 'application/dash+xml';
  const upstream = omssUpstreamUrl(resolvedUrl);
  const sniffed = sniffUrlPlaybackContentType(upstream);
  if (sniffed) return sniffed;
  return videoSourceContentType(streamType, upstream);
}

/**
 * OMSS-style signed proxy (`/v1/proxy?...`). Native players often send a non-browser User-Agent;
 * many proxies return HTTP 400 unless the request looks like a normal browser fetch.
 */
export function isOmssProxyPlaybackUrl(resolvedUrl: string): boolean {
  return isOmssProxyUrl(resolvedUrl);
}

/**
 * Chrome-like UA only (no Referer/Origin): signed OMSS payloads often treat extra identity headers as invalid.
 */
const CHROME_LIKE_MOBILE_PLAYBACK_UA =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';

/** Headers for OMSS proxy playback (native Exo/AVPlayer and web `<video>`). */
export function getPlaybackHeadersForProxyUrl(
  resolvedUrl: string
): Record<string, string> | undefined {
  if (!isOmssProxyPlaybackUrl(resolvedUrl)) return undefined;
  return {
    'User-Agent': CHROME_LIKE_MOBILE_PLAYBACK_UA,
    Accept:
      'application/vnd.apple.mpegurl, application/x-mpegURL, application/dash+xml, video/mp4, video/*, */*',
  };
}

/** @deprecated Use {@link getPlaybackHeadersForProxyUrl}. */
export const getNativePlaybackHeadersForProxyUrl = getPlaybackHeadersForProxyUrl;

export type PlaybackRequest = {
  uri: string;
  headers?: Record<string, string>;
  /** `upstream` = CDN URL + OMSS headers; `proxy` = Core `/v1/proxy`. */
  via: 'upstream' | 'proxy';
};

/**
 * Prefer direct CDN URL with Referer/Origin from the signed proxy payload.
 * Core HTTPS proxies often return HTTP 400 to ExoPlayer; native can hit the CDN directly.
 */
export function buildPlaybackRequest(
  sourceUrl: string,
  options?: { forceProxy?: boolean }
): PlaybackRequest {
  const payload = parseOmssProxyData(sourceUrl);
  const upstream = payload?.url?.trim();

  if (!options?.forceProxy && upstream?.startsWith('http')) {
    const embedded = headersFromOmssProxyPayload(payload?.headers);
    const headers: Record<string, string> = {
      Accept: 'video/mp4, video/*, */*',
      ...embedded,
    };
    if (!headers['User-Agent']) {
      headers['User-Agent'] = CHROME_LIKE_MOBILE_PLAYBACK_UA;
    }
    return { uri: upstream, headers, via: 'upstream' };
  }

  const proxyUri = resolveProxyUrl(sourceUrl);
  return {
    uri: proxyUri,
    headers: getPlaybackHeadersForProxyUrl(proxyUri),
    via: 'proxy',
  };
}

export { parseOmssProxyData, omssUpstreamUrl } from '@/utils/omssProxy';

function isLoopbackHttpHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '[::1]';
}

function collapseSlashes(path: string): string {
  if (!path) return '/';
  const collapsed = path.replace(/\/{2,}/g, '/');
  return collapsed.startsWith('/') ? collapsed : `/${collapsed}`;
}

/**
 * Parsed Settings base: origin (scheme + host + port) and optional mount path (no trailing slash).
 */
function parseConfiguredCore(base: string): { origin: string; pathPrefix: string; configUrl: URL } | null {
  const trimmed = base.trim();
  if (!trimmed) return null;
  try {
    const configUrl = new URL(trimmed.includes('://') ? trimmed : `http://${trimmed}`);
    let pathPrefix = configUrl.pathname;
    if (pathPrefix === '/') pathPrefix = '';
    else if (pathPrefix.endsWith('/')) pathPrefix = pathPrefix.slice(0, -1);
    return { origin: configUrl.origin, pathPrefix, configUrl };
  } catch {
    return null;
  }
}

function segmentLooksLikeOmssVersion(segment: string): boolean {
  return segment === 'v1' || segment === 'v2';
}

/**
 * Path looks like OMSS HTTP API (proxy, media endpoints). Used to decide if we may rewrite host to Settings.
 */
function isCoreApiStylePath(pathname: string, pathPrefix: string): boolean {
  const p = pathname.toLowerCase();
  const parts = p.split('/').filter(Boolean);
  const pref = pathPrefix.replace(/\/$/, '').toLowerCase();

  if (parts[0] === 'v1' || (parts[0] === 'api' && parts[1] && segmentLooksLikeOmssVersion(parts[1]))) {
    return true;
  }
  if (!pref) return false;
  const rest = p.startsWith(pref + '/') ? p.slice(pref.length + 1) : '';
  if (!rest) return false;
  const restParts = rest.split('/').filter(Boolean);
  if (restParts[0] === 'v1') return true;
  if (restParts[0] === 'api' && restParts[1] && segmentLooksLikeOmssVersion(restParts[1])) return true;
  return false;
}

/**
 * Web and native use the same OMSS URL string from the API, but:
 * - Browsers resolve `localhost` as the machine running the browser (your PC).
 * - Android emulator resolves `localhost` as the emulator itself — Core on the PC is unreachable → ExoPlayer buffers forever.
 * On **emulator only** (`Constants.isDevice === false`), remap loopback to `10.0.2.2` (host loopback from AVD).
 * Physical devices: unchanged (use your PC’s LAN IP in Settings, not localhost).
 */
function rewriteAndroidEmulatorLoopback(href: string): string {
  if (Platform.OS !== 'android' || Platform.isTV) return href;
  if (Constants.isDevice) return href;
  try {
    const u = new URL(href);
    const h = u.hostname.toLowerCase();
    if (h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '[::1]') {
      u.hostname = '10.0.2.2';
      playbackLogger.info('Android emulator: remapped loopback host to 10.0.2.2 (host machine)', {
        hadHost: h,
      });
    }
    return u.href;
  } catch {
    return href;
  }
}

/** Combine configured mount path with path from a (wrong-origin) Core URL. */
function mergeMountPath(pathPrefix: string, targetPathname: string): string {
  const pref = pathPrefix.replace(/\/$/, '');
  const tp = targetPathname.startsWith('/') ? targetPathname : `/${targetPathname}`;
  const prefLower = pref.toLowerCase();
  const tpLower = tp.toLowerCase();
  if (pref && (tpLower === prefLower || tpLower.startsWith(`${prefLower}/`))) {
    return collapseSlashes(tp);
  }
  if (pref) return collapseSlashes(`${pref}${tp}`);
  return collapseSlashes(tp);
}

/**
 * OMSS may return stream/proxy URLs that point at the server’s own hostname, Docker network name, or LAN IP.
 * The app can only reach the Core at the URL the user saved in Settings — rewrite those API paths to match.
 *
 * Previously only `localhost` was rewritten; everything else was left as-is, which causes endless buffering
 * when e.g. Core returns `http://192.168.0.5:3000/v1/proxy?...` but the phone uses `http://192.168.0.12:3000`.
 */
export function resolveProxyUrl(proxyPathOrUrl: string): string {
  const raw = proxyPathOrUrl.trim();
  const baseStr = getOmssBaseUrl().trim();
  if (!raw) return raw;

  if (!raw.startsWith('http')) {
    const path = raw.startsWith('/') ? raw : `/${raw}`;
    const base = baseStr.replace(/\/+$/, '');
    return rewriteAndroidEmulatorLoopback(`${base}${path}`);
  }

  try {
    const target = new URL(raw);
    const cfg = parseConfiguredCore(baseStr);
    if (!cfg) return rewriteAndroidEmulatorLoopback(raw);

    if (target.origin === cfg.origin) {
      return rewriteAndroidEmulatorLoopback(raw);
    }

    const loopback = isLoopbackHttpHost(target.hostname);
    const apiStyle = isCoreApiStylePath(target.pathname, cfg.pathPrefix);

    if (!loopback && !apiStyle) {
      return rewriteAndroidEmulatorLoopback(raw);
    }

    const pathname = mergeMountPath(cfg.pathPrefix, target.pathname);
    const origin = cfg.configUrl.origin.replace(/\/$/, '');
    const href = `${origin}${pathname}${target.search}${target.hash}`;

    if (href !== raw) {
      playbackLogger.debug('Rewrote media URL to match Core base', {
        fromHost: target.hostname,
        toHost: cfg.configUrl.hostname,
        scheme: cfg.configUrl.protocol.replace(/:$/, '') || '(from Settings)',
        toOrigin: cfg.configUrl.origin,
        path: pathname,
      });
    }
    return rewriteAndroidEmulatorLoopback(href);
  } catch {
    return rewriteAndroidEmulatorLoopback(raw);
  }
}
