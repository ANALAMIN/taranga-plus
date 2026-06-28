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

async function checkStream(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const start = performance.now();
    const res = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      headers: { 'User-Agent': 'TarangaPlus/2.0' },
    });
    const latency = Math.round(performance.now() - start);
    clearTimeout(timeout);
    if (res.ok || res.status === 206) return { ok: true, latency };
    return { ok: false, latency, reason: `HTTP ${res.status}` };
  } catch (e) {
    clearTimeout(timeout);
    return { ok: false, latency: 0, reason: e.message };
  }
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
