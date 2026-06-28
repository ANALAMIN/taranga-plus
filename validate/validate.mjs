import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const SOURCES = [
  { id: 'iptv-org-bd',          url: 'https://iptv-org.github.io/iptv/countries/bd.m3u' },
  { id: 'iptv-org-india',       url: 'https://iptv-org.github.io/iptv/countries/in.m3u' },
  { id: 'iptv-org-sports',      url: 'https://iptv-org.github.io/iptv/categories/sports.m3u' },
  { id: 'iptv-org-movies',      url: 'https://iptv-org.github.io/iptv/categories/movies.m3u' },
  { id: 'iptv-org-documentary', url: 'https://iptv-org.github.io/iptv/categories/documentary.m3u' },
  { id: 'iptv-org-music',       url: 'https://iptv-org.github.io/iptv/categories/music.m3u' },
  { id: 'iptv-org-kids',        url: 'https://iptv-org.github.io/iptv/categories/kids.m3u' },
  { id: 'free-tv',              url: 'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlists/playlist.m3u8' },
  { id: 'mrgify-bd',            url: 'https://raw.githubusercontent.com/abusaeeidx/Mrgify-BDIX-IPTV/main/playlist.m3u' },
  { id: 'imshakil-tvlink',      url: 'https://raw.githubusercontent.com/imShakil/tvlink/refs/heads/main/iptv.m3u8' },
];

const CATEGORY_MAP = {
  sports: { sources: ['iptv-org-sports'], keywords: ['sport', 'espn', 'sky sport'] },
  movies: { keywords: ['movie', 'cinema', 'film', 'star gold', 'sony max'] },
  music:  { keywords: ['music', 'mtv', 'vh1', '9xm', 'zoom'] },
  kids:   { keywords: ['kid', 'cartoon', 'nick', 'disney', 'pogo', 'duronto', 'hungama'] },
  documentary: { keywords: ['discovery', 'natgeo', 'national geographic', 'animal planet', 'docu'] },
  entertainment: { keywords: ['entertain', 'general', 'star plus', 'sony tv', 'zee'] },
};

function classify(name, sourceId) {
  if (sourceId === 'iptv-org-sports') return 'sports';
  const n = name.toLowerCase();
  for (const [cat, rules] of Object.entries(CATEGORY_MAP)) {
    for (const kw of rules.keywords) {
      if (n.includes(kw)) return cat;
    }
  }
  return 'all';
}

function parseM3U(text, sourceId) {
  const lines = text.split('\n');
  const entries = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith('#EXTINF')) continue;
    const commaIdx = line.lastIndexOf(',');
    if (commaIdx === -1) continue;
    const name = line.slice(commaIdx + 1).trim();
    if (!name) continue;
    const logoMatch = line.match(/tvg-logo="([^"]*)"/);
    const groupMatch = line.match(/group-title="([^"]*)"/);
    for (let j = i + 1; j < lines.length; j++) {
      const url = lines[j].trim();
      if (url && !url.startsWith('#')) {
        entries.push({
          name, url,
          logo: logoMatch?.[1] || '',
          category: classify(name, sourceId),
          sourceId,
        });
        break;
      }
    }
  }
  return entries;
}

function resolveUrl(ref, base) {
  try { return new URL(ref, base).href; } catch { return ref; }
}

async function fetchText(url, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'TarangaPlus/2.0' } });
    if (!res.ok) return null;
    return await res.text();
  } catch { return null; } finally { clearTimeout(t); }
}

async function checkStream(url) {
  const start = performance.now();

  // HLS (.m3u8) — download a real segment and verify content
  if (url.includes('.m3u8')) {
    const master = await fetchText(url);
    if (!master) return { ok: false, latency: 0, reason: 'unreachable' };

    // Find the highest-bandwidth variant
    const bwRe = /#EXT-X-STREAM-INF[^]*?BANDWIDTH=(\d+)[\s\S]*?\n([^\n]+)/g;
    let match, bestUrl = null;
    while ((match = bwRe.exec(master)) !== null) {
      const variantUrl = resolveUrl(match[2].trim(), url);
      if (variantUrl) bestUrl = variantUrl;
    }

    // Fallback: treat the URL itself as a media playlist
    const mediaUrl = bestUrl || url;

    // Fetch media playlist to get segment URLs
    const media = await fetchText(mediaUrl);
    if (!media) return { ok: false, latency: 0, reason: 'media unreachable' };
    if (media.includes('#EXT-X-MAP')) {
      // fMP4 — GET the init segment
      const mapMatch = media.match(/EXT-X-MAP:URI="([^"]+)"/);
      if (mapMatch) {
        const initUrl = resolveUrl(mapMatch[1], mediaUrl);
        if (initUrl) {
          const init = await fetchBytes(initUrl, 65536);
          if (!init || init.length < 32) return { ok: false, latency: 0, reason: 'empty init' };
        }
      }
    }

    // Get the first .ts or .m4s segment URL
    const segLine = media.split('\n').find(l => l.trim() && !l.startsWith('#') && !l.startsWith('http'));
    const segUrlLine = media.split('\n').find(l => l.trim() && !l.startsWith('#'));
    const segUrl = segUrlLine ? resolveUrl(segUrlLine.trim(), mediaUrl) : null;
    if (!segUrl) return { ok: false, latency: 0, reason: 'no segment' };

    const seg = await fetchBytes(segUrl, 65536);
    if (!seg) return { ok: false, latency: 0, reason: 'segment unreachable' };

    // Verify it's real video data (not HTML, not empty)
    if (seg.length < 256) return { ok: false, latency: 0, reason: 'segment too small' };
    const text = new TextDecoder().decode(seg.slice(0, 64));
    if (text.includes('<!DOCTYPE') || text.includes('<html') || text.includes('{') || text.includes('"error"') || text.includes('Access Denied')) {
      return { ok: false, latency: 0, reason: 'non-video response' };
    }

    return { ok: true, latency: Math.round(performance.now() - start) };
  }

  // Non-HLS stream — download first 64KB and verify content
  const seg = await fetchBytes(url, 65536);
  if (!seg) return { ok: false, latency: 0, reason: 'unreachable' };
  if (seg.length < 256) return { ok: false, latency: 0, reason: 'too small' };
  const text = new TextDecoder().decode(seg.slice(0, 64));
  if (text.includes('<!DOCTYPE') || text.includes('<html') || text.includes('{') || text.includes('"error"') || text.includes('Access Denied')) {
    return { ok: false, latency: 0, reason: 'non-video response' };
  }

  return { ok: true, latency: Math.round(performance.now() - start) };
}

async function fetchBytes(url, maxBytes) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'TarangaPlus/2.0', Range: `bytes=0-${maxBytes - 1}` },
    });
    if (!res.ok && res.status !== 206) return null;
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  } catch { return null; } finally { clearTimeout(t); }
}

function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/[(\[](hd|fhd|4k|tv)[)\]]/gi, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function hash(str) {
  return createHash('sha256').update(str).digest('hex').slice(0, 16);
}

async function main() {
  console.log('=== Taranga+ Validator ===\n');

  const all = [];

  // Fetch & parse M3U sources
  for (const src of SOURCES) {
    try {
      const res = await fetch(src.url, { headers: { 'User-Agent': 'TarangaPlus/2.0' } });
      if (!res.ok) { console.log(`  ✗ ${src.id}: HTTP ${res.status}`); continue; }
      const text = await res.text();
      const channels = parseM3U(text, src.id);
      console.log(`  ✓ ${src.id}: ${channels.length} channels`);
      all.push(...channels);
    } catch (e) {
      console.log(`  ✗ ${src.id}: ${e.message}`);
    }
  }

  console.log(`\nTotal raw: ${all.length}`);

  // Validate streams in parallel
  const valid = [];
  const CONCURRENCY = 30;
  for (let i = 0; i < all.length; i += CONCURRENCY) {
    const batch = all.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(ch => checkStream(ch.url)));
    for (let j = 0; j < results.length; j++) {
      if (results[j].ok) {
        valid.push({ ...batch[j], latencyMs: results[j].latency });
      }
    }
    if ((i + CONCURRENCY) % 300 === 0 || i + CONCURRENCY >= all.length) {
      console.log(`  Validated ${Math.min(i + CONCURRENCY, all.length)}/${all.length}...`);
    }
  }

  console.log(`Alive: ${valid.length}\n`);

  // Deduplicate by name → pick lowest latency
  const groups = {};
  for (const ch of valid) {
    const key = normalizeName(ch.name);
    if (!key) continue;
    if (!groups[key]) groups[key] = [];
    groups[key].push(ch);
  }

  const final = Object.values(groups)
    .map(group => {
      group.sort((a, b) => a.latencyMs - b.latencyMs);
      const best = group[0];
      const sources = [...new Set(group.map(c => c.url))];
      return {
        id: hash(normalizeName(best.name)),
        name: best.name,
        logoUrl: best.logo,
        streamUrl: best.url,
        category: best.category,
        latencyMs: best.latencyMs,
        tier: 'global',
        sources,
        lastValidated: new Date().toISOString(),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  console.log(`Final: ${final.length} unique channels\n`);

  // Write output
  const outPath = join(ROOT, 'data', 'channels.json');
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(final, null, 2));
  console.log(`Saved to ${outPath}`);
}

main().catch(console.error);
