import { writeFileSync, mkdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import { connect } from 'net';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const SOURCES = [
  { id: 'iptv-org-ben',         url: 'https://iptv-org.github.io/iptv/languages/ben.m3u' },
  { id: 'iptv-org-hin',         url: 'https://iptv-org.github.io/iptv/languages/hin.m3u' },
  { id: 'iptv-org-eng',         url: 'https://iptv-org.github.io/iptv/languages/eng.m3u' },
  { id: 'mrgify-bd',            url: 'https://raw.githubusercontent.com/abusaeeidx/Mrgify-BDIX-IPTV/main/playlist.m3u' },
  { id: 'imshakil-tvlink',      url: 'https://raw.githubusercontent.com/imShakil/tvlink/refs/heads/main/iptv.m3u8' },
  { id: 'toffee',               url: 'https://raw.githubusercontent.com/johirxofficial/Toffee-Auto-Playlist/main/toffee_playlist.m3u' },
];

const CATEGORY_MAP = {
  sports: { keywords: ['sport', 'espn', 'sky sport', 'cricket', 'football', 'wwe'] },
  movies: { keywords: ['movie', 'cinema', 'film', 'star gold', 'sony max', 'hbo'] },
  music:  { keywords: ['music', 'mtv', 'vh1', '9xm', 'zoom', 'b4u'] },
  kids:   { keywords: ['kid', 'cartoon', 'nick', 'disney', 'pogo', 'duronto', 'hungama', 'animation'] },
  documentary: { keywords: ['discovery', 'natgeo', 'national geographic', 'animal planet', 'docu', 'history', 'science', 'nature', 'education'] },
  news:   { keywords: ['news', 'weather', 'somoy', 'bbc', 'cnn', 'al jazeera', 'abp', 'aaj tak', 'ndtv'] },
  entertainment: { keywords: ['entertain', 'general', 'star plus', 'sony tv', 'zee', 'colors', 'jalsha', 'nativ', 'comedy', 'lifestyle'] },
};

function classify(name, groupTitle) {
  const gt = (groupTitle || '').toLowerCase();
  const n = (name || '').toLowerCase();

  // 1. Try matching by group-title first (most accurate for iptv-org)
  if (gt) {
    for (const [cat, rules] of Object.entries(CATEGORY_MAP)) {
      for (const kw of rules.keywords) {
        if (gt.includes(kw)) return cat;
      }
    }
  }

  // 2. Fallback to channel name
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
          category: classify(name, groupMatch?.[1]),
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

const FETCH_TIMEOUT = 3000;
const SEGMENT_SIZE = 8192;

async function fetchText(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'TarangaPlus/2.0' } });
    if (!res.ok) return null;
    return await res.text();
  } catch { return null; } finally { clearTimeout(t); }
}

function tcpReachable(url) {
  return new Promise(resolve => {
    try {
      const u = new URL(url);
      const host = u.hostname;
      const port = u.port ? parseInt(u.port, 10) : (u.protocol === 'https:' ? 443 : 80);
      const sock = connect(port, host);
      sock.setTimeout(1000);
      sock.once('connect', () => { sock.destroy(); resolve(true); });
      sock.once('timeout', () => { sock.destroy(); resolve(false); });
      sock.once('error', () => { sock.destroy(); resolve(false); });
    } catch { resolve(false); }
  });
}

async function checkStream(url) {
  const start = performance.now();
  if (!await tcpReachable(url)) return { ok: false, latency: 0, reason: 'tcp dead' };

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
          const init = await fetchBytes(initUrl, SEGMENT_SIZE);
          if (!init || init.length < 32) return { ok: false, latency: 0, reason: 'empty init' };
        }
      }
    }

    // Get the first .ts or .m4s segment URL
    const segUrlLine = media.split('\n').find(l => l.trim() && !l.startsWith('#'));
    const segUrl = segUrlLine ? resolveUrl(segUrlLine.trim(), mediaUrl) : null;
    if (!segUrl) return { ok: false, latency: 0, reason: 'no segment' };

    const seg = await fetchBytes(segUrl, SEGMENT_SIZE);
    if (!seg) return { ok: false, latency: 0, reason: 'segment unreachable' };
    if (!isVideoContent(seg)) return { ok: false, latency: 0, reason: 'non-video' };

    return { ok: true, latency: Math.round(performance.now() - start) };
  }

  // Non-HLS stream — download first chunk and verify
  const chunk = await fetchBytes(url, SEGMENT_SIZE);
  if (!chunk) return { ok: false, latency: 0, reason: 'unreachable' };
  if (!isVideoContent(chunk)) return { ok: false, latency: 0, reason: 'non-video' };

  return { ok: true, latency: Math.round(performance.now() - start) };
}

function isVideoContent(buf) {
  if (buf.length < 64) return false;
  const head = new TextDecoder().decode(buf.slice(0, Math.min(256, buf.length))).toLowerCase();
  if (head.includes('<!doctype') || head.includes('<html') || head.includes('<?xml') || head.includes('{"error"') || head.includes('"status":') || head.includes('access denied') || head.includes('404 not found') || head.includes('<error') || head.includes('not found')) return false;

  // Known video container signatures only — no fuzzy binary heuristic
  if (buf[0] === 0x47) return true;                         // MPEG-TS
  if (buf[0] === 0x1a && buf[1] === 0x45) return true;      // WebM/Matroska
  if (head.includes('ftyp') || head.includes('moov') || head.includes('moof') || head.includes('mdat')) return true;  // fMP4/MP4/ISOBMFF

  return false;  // Removed the 15% binary heuristic
}

async function fetchBytes(url, maxBytes) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'TarangaPlus/2.0', Range: `bytes=0-${maxBytes - 1}` },
    });
    if (!res.ok && res.status !== 206) return null;
    const contentType = res.headers.get('content-type') || '';
    if (contentType.startsWith('text/html') || contentType.startsWith('application/json') || contentType.startsWith('text/xml') || contentType.includes('javascript')) return null;
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

const TOTAL_CHUNKS = parseInt(process.env.TOTAL_CHUNKS || '1', 10);
const CHUNK_INDEX = parseInt(process.env.CHUNK_INDEX || '0', 10);
const DATA_DIR = join(ROOT, 'data');

function ensureDir() { mkdirSync(DATA_DIR, { recursive: true }); }

async function dumpSources() {
  console.log('=== Dump Sources ===\n');
  const all = [];
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
  console.log(`\nTotal: ${all.length}`);
  ensureDir();
  writeFileSync(join(DATA_DIR, 'all-channels.json'), JSON.stringify(all));
  console.log('Saved all-channels.json');
}

async function checkChunk() {
  console.log(`=== Check Chunk ${CHUNK_INDEX}/${TOTAL_CHUNKS} ===\n`);
  const raw = readFileSync(join(DATA_DIR, 'all-channels.json'), 'utf-8');
  const all = JSON.parse(raw);
  const size = Math.ceil(all.length / TOTAL_CHUNKS);
  const chunk = all.slice(CHUNK_INDEX * size, (CHUNK_INDEX + 1) * size);
  console.log(`Chunk size: ${chunk.length}`);

  const valid = [];
  const CONCURRENCY = 30;
  for (let i = 0; i < chunk.length; i += CONCURRENCY) {
    const batch = chunk.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(ch => checkStream(ch.url)));
    for (let j = 0; j < results.length; j++) {
      if (results[j].ok) valid.push({ ...batch[j], latencyMs: results[j].latency });
    }
  }
  console.log(`Alive in chunk: ${valid.length}`);
  ensureDir();
  writeFileSync(join(DATA_DIR, `valid-chunk-${CHUNK_INDEX}.json`), JSON.stringify(valid));
  console.log(`Saved valid-chunk-${CHUNK_INDEX}.json`);
}

async function logoToDataUri(url, maxBytes = 32768) {
  if (!url) return null;
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!resp.ok) return null;
    const contentType = resp.headers.get('content-type') || 'image/png';
    const buf = await resp.arrayBuffer();
    if (buf.byteLength > maxBytes || buf.byteLength === 0) return null;
    const b64 = Buffer.from(buf).toString('base64');
    return `data:${contentType};base64,${b64}`;
  } catch { return null; }
}

async function mergeChunks() {
  console.log('=== Merge Chunks ===\n');
  const valid = [];
  for (let i = 0; i < TOTAL_CHUNKS; i++) {
    const f = join(DATA_DIR, `valid-chunk-${i}.json`);
    try {
      const raw = readFileSync(f, 'utf-8');
      const chunk = JSON.parse(raw);
      valid.push(...chunk);
      console.log(`  ✓ chunk ${i}: ${chunk.length} channels`);
    } catch { console.log(`  ✗ chunk ${i}: not found`); }
  }
  console.log(`\nTotal alive: ${valid.length}`);

  const groups = {};
  for (const ch of valid) {
    const key = normalizeName(ch.name);
    if (!key) continue;
    if (!groups[key]) groups[key] = [];
    groups[key].push(ch);
  }

  let final = Object.values(groups)
    .map(group => {
      group.sort((a, b) => a.latencyMs - b.latencyMs);
      const best = group[0];
      return {
        id: hash(normalizeName(best.name)),
        name: best.name,
        logoUrl: best.logo,
        streamUrl: best.url,
        category: best.category,
        latencyMs: best.latencyMs,
        tier: 'global',
        sources: [...new Set(group.map(c => c.url))],
        lastValidated: new Date().toISOString(),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  console.log(`\nDownloading logos as data URIs...`);
  let cached = 0;
  const BATCH = 50;
  for (let i = 0; i < final.length; i += BATCH) {
    const batch = final.slice(i, i + BATCH);
    const dataUris = await Promise.all(batch.map(ch => logoToDataUri(ch.logoUrl)));
    for (let j = 0; j < batch.length; j++) {
      if (dataUris[j]) { batch[j].logoUrl = dataUris[j]; cached++; }
    }
    console.log(`  Logos: ${cached}/${Math.min(i + BATCH, final.length)} cached`);
  }
  console.log(`  Total: ${cached}/${final.length} logos embedded`);

  console.log(`\nFinal unique: ${final.length}`);
  const outPath = join(ROOT, 'data', 'channels.json');
  writeFileSync(outPath, JSON.stringify(final, null, 2));
  console.log(`Saved ${outPath}`);
}

async function full() {
  await dumpSources();
  const raw = readFileSync(join(DATA_DIR, 'all-channels.json'), 'utf-8');
  const all = JSON.parse(raw);
  const TOTAL_CHUNKS = 1, CHUNK_INDEX = 0;
  const size = all.length;
  const chunk = all.slice(0, size);
  const valid = [];
  const CONCURRENCY = 30;
  for (let i = 0; i < chunk.length; i += CONCURRENCY) {
    const batch = chunk.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(ch => checkStream(ch.url)));
    for (let j = 0; j < results.length; j++) {
      if (results[j].ok) valid.push({ ...batch[j], latencyMs: results[j].latency });
    }
    if ((i + CONCURRENCY) % 600 === 0 || i + CONCURRENCY >= chunk.length) {
      console.log(`  Validated ${Math.min(i + CONCURRENCY, chunk.length)}/${chunk.length}...`);
    }
  }
  writeFileSync(join(DATA_DIR, 'valid-chunk-0.json'), JSON.stringify(valid));
  console.log(`Alive: ${valid.length}`);
  await mergeChunks();
}

const MODE = process.argv[2] || 'full';
if (MODE === 'dump-sources') dumpSources().catch(console.error);
else if (MODE === 'check-chunk') checkChunk().catch(console.error);
else if (MODE === 'merge') mergeChunks().catch(console.error);
else full().catch(console.error);
