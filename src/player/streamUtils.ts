import type { OmssSource, OmssSourceResponse } from '@/api/types/omss';
import { isPlayableType } from '@/utils/stream';

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

export function loggableSourceSummary(s: OmssSource) {
  return {
    quality: s.quality,
    type: s.type,
    provider: s.provider.name,
    drmHint: sniffDrmHint(s.url),
    urlLength: s.url.length,
    audioTracksMeta: s.audioTracks?.length ?? 0,
  };
}

export function summarizeOmssResponse(data: OmssSourceResponse) {
  const playable = data.sources.filter((s) => isPlayableType(s.type));
  return {
    responseId: data.responseId,
    expiresAt: data.expiresAt,
    totalSources: data.sources.length,
    playableSources: playable.length,
    subtitles: data.subtitles?.length ?? 0,
    diagnostics: data.diagnostics,
  };
}

export type RetryablePlaybackError = {
  code?: string | number;
  localizedDescription?: string;
  domain?: string;
};
