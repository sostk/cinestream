/** Decoded OMSS `/v1/proxy?data=…` payload (upstream CDN URL + required request headers). */
export type OmssProxyPayload = {
  url: string;
  headers?: Record<string, string>;
};

/**
 * Parse the signed `data` query param on OMSS proxy URLs.
 * Core returns playback links like `http://core:3000/v1/proxy?data={"url":"https://…/file.mp4",…}`.
 */
export function parseOmssProxyData(proxyOrUrl: string): OmssProxyPayload | null {
  const raw = proxyOrUrl.trim();
  if (!raw) return null;

  try {
    let dataParam: string | null = null;
    if (raw.startsWith('http')) {
      const u = new URL(raw);
      dataParam = u.searchParams.get('data');
    } else if (raw.startsWith('{')) {
      dataParam = raw;
    } else {
      dataParam = decodeURIComponent(raw);
    }

    if (!dataParam) return null;

    const parsed = JSON.parse(dataParam) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;

    const obj = parsed as Record<string, unknown>;
    const upstream = typeof obj.url === 'string' ? obj.url.trim() : '';
    if (!upstream) return null;

    let headers: Record<string, string> | undefined;
    if (obj.headers && typeof obj.headers === 'object' && !Array.isArray(obj.headers)) {
      headers = {};
      for (const [k, v] of Object.entries(obj.headers as Record<string, unknown>)) {
        if (typeof v === 'string' && v.length > 0) headers[k] = v;
      }
      if (!Object.keys(headers).length) headers = undefined;
    }

    return { url: upstream, headers };
  } catch {
    return null;
  }
}

/** Upstream CDN URL when `url` is an OMSS proxy; otherwise the original string. */
export function omssUpstreamUrl(url: string): string {
  return parseOmssProxyData(url)?.url ?? url;
}

const UPSTREAM_HEADER_CANONICAL: Record<string, string> = {
  'user-agent': 'User-Agent',
  referer: 'Referer',
  origin: 'Origin',
  accept: 'Accept',
  'accept-language': 'Accept-Language',
};

/**
 * Headers CDNs expect (from OMSS proxy payload). Omits sec-fetch-* / cache-control noise.
 */
export function headersFromOmssProxyPayload(
  raw?: Record<string, string>
): Record<string, string> | undefined {
  if (!raw) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!v) continue;
    const canonical = UPSTREAM_HEADER_CANONICAL[k.toLowerCase()];
    if (canonical) out[canonical] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

export function isOmssProxyUrl(url: string): boolean {
  try {
    const u = new URL(url.trim());
    const p = u.pathname.toLowerCase();
    if ((p.includes('/v1/proxy') || p.includes('/v2/proxy')) && u.searchParams.has('data')) {
      return true;
    }
    if (p.includes('proxy') && u.searchParams.has('data')) return true;
    return false;
  } catch {
    return false;
  }
}
