import { Platform } from 'react-native';
import Constants from 'expo-constants';
import type { OmssSource, OmssStreamType } from '@/api/types/omss';
import { getOmssBaseUrl } from '@/api/runtimeConfig';
import { playbackLogger } from '@/player/playbackLogger';

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
  const key = q.toLowerCase();
  return QUALITY_RANK[key] ?? 5;
}

export function sortSourcesByQualityDesc(sources: OmssSource[]): OmssSource[] {
  return [...sources].sort((a, b) => rankQuality(b.quality) - rankQuality(a.quality));
}

export function pickAutoSource(sources: OmssSource[]): OmssSource | undefined {
  const playable = sources.filter((s) => isPlayableType(s.type));
  if (!playable.length) return undefined;
  const hlsFirst = playable.sort((a, b) => {
    const typeScore = (t: OmssStreamType) =>
      t === 'hls' ? 3 : t === 'dash' ? 2 : t === 'mp4' ? 1 : 0;
    const td = typeScore(b.type) - typeScore(a.type);
    if (td !== 0) return td;
    return rankQuality(b.quality) - rankQuality(a.quality);
  });
  return hlsFirst[0];
}

export function isPlayableType(type: OmssStreamType): boolean {
  return type === 'hls' || type === 'dash' || type === 'http' || type === 'mp4' || type === 'webm';
}

/** Hint for react-native-video / ExoPlayer when the URI alone is ambiguous. */
export function videoSourceContentType(streamType: OmssStreamType): string | undefined {
  switch (streamType) {
    case 'hls':
      return 'application/x-mpegURL';
    case 'dash':
      return 'application/dash+xml';
    default:
      return undefined;
  }
}

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
    // Build from Settings `origin` + path — never mutate the API URL-derived object, or the old port
    // (e.g. :3000 on localhost) can stick when only hostname/protocol are assigned on some engines.
    const pathQueryHash = `${pathname}${target.search}${target.hash}`;
    const out = new URL(pathQueryHash, cfg.configUrl.origin);

    if (out.href !== raw) {
      playbackLogger.info('Rewrote media URL to match Core base', {
        fromHost: target.hostname,
        toHost: cfg.configUrl.hostname,
        scheme: cfg.configUrl.protocol.replace(/:$/, '') || '(from Settings)',
        toOrigin: cfg.configUrl.origin,
        path: pathname,
      });
    }
    return rewriteAndroidEmulatorLoopback(out.href);
  } catch {
    return rewriteAndroidEmulatorLoopback(raw);
  }
}
