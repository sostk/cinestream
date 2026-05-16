#!/usr/bin/env node
/**
 * Fetch OMSS movie sources and print how stream URLs are structured.
 * Usage: node scripts/inspect-omss-movie.mjs [baseUrl] [tmdbId]
 * Example: node scripts/inspect-omss-movie.mjs http://localhost:3000 1007757
 */

const base = (process.argv[2] ?? 'http://localhost:3000').replace(/\/+$/, '');
const tmdbId = process.argv[3] ?? '1007757';
const url = `${base}/v1/movies/${encodeURIComponent(tmdbId)}`;

function parseProxyData(proxyUrl) {
  try {
    const u = new URL(proxyUrl);
    const raw = u.searchParams.get('data');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const res = await fetch(url, { headers: { Accept: 'application/json' } });
const text = await res.text();
if (!res.ok) {
  console.error(`HTTP ${res.status}\n${text.slice(0, 500)}`);
  process.exit(1);
}

const data = JSON.parse(text);
console.log(`GET ${url}`);
console.log(`responseId: ${data.responseId}`);
console.log(`expiresAt: ${data.expiresAt}`);
console.log(`sources: ${data.sources?.length ?? 0}\n`);

for (const [i, s] of (data.sources ?? []).slice(0, 5).entries()) {
  const payload = parseProxyData(s.url);
  const upstream = payload?.url ?? s.url;
  let host = upstream;
  try {
    host = new URL(upstream).hostname;
  } catch {
    /* ignore */
  }
  console.log(`[${i}] ${s.quality} ${s.type} · ${s.provider?.name ?? '?'}`);
  console.log(`    proxy: ${s.url.slice(0, 72)}…`);
  console.log(`    upstream: ${upstream.slice(0, 96)}${upstream.length > 96 ? '…' : ''}`);
  console.log(`    host: ${host}`);
  if (payload?.headers) {
    const keys = Object.keys(payload.headers);
    console.log(`    embedded headers: ${keys.join(', ')}`);
  }
  console.log('');
}

if ((data.sources?.length ?? 0) > 5) {
  console.log(`… and ${data.sources.length - 5} more sources`);
}

console.log(
  'Note: Open the *proxy* URL in the app player, not the raw upstream CDN link.\n' +
    'Browsers often fail on raw links (missing Referer/signatures) or when the CDN serves\n' +
    'attachment/octet-stream without Range support; saving the file still works because\n' +
    'the bytes are a valid MP4 once fully downloaded.'
);
