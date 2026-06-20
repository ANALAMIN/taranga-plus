#!/usr/bin/env node
/**
 * Taranga+ Channel Validation Script
 * Runs on GitHub Actions hourly.
 * Scrapes M3U sources → validates with HEAD → deduplicates → saves channels.json
 */

import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

// ── Sources ──────────────────────────────────────────────
const SOURCES = [
  // Bangladesh specific (primary)
  { id: 'iptv-org-bd', url: 'https://iptv-org.github.io/iptv/countries/bd.m3u' },
  { id: 'iptv-org-sports', url: 'https://iptv-org.github.io/iptv/categories/sports.m3u' },
  { id: 'sacuar-bangla', url: 'https://raw.githubusercontent.com/sacuar/MyIPTV/main/bangla.m3u' },
  // India (for cricket, Bollywood - secondary)
  { id: 'iptv-org-india', url: 'https://iptv-org.github.io/iptv/countries/in.m3u' },
];

const TIMEOUT_MS = 3000;
const BATCH_SIZE = 50;
const VALID_CATEGORIES = ['all', 'sports', 'movies', 'music', 'entertainment', 'kids', 'documentary'];

// ── M3U Parser ───────────────────────────────────────────
function parseM3U(content, sourceId) {
  const lines = content.split('\n');
  const channels = [];
  let current = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith('#EXTINF:')) {
      current = { sourceId };
      const logoMatch = line.match(/tvg-logo="([^"]+)"/);
      if (logoMatch) current.logo = logoMatch[1];
      const groupMatch = line.match(/group-title="([^"]+)"/);
      if (groupMatch) current.category = groupMatch[1];
      const nameIdx = line.lastIndexOf(',');
      if (nameIdx !== -1) current.name = line.substring(nameIdx + 1).trim();
    } else if (line.startsWith('http') && current?.name) {
      current.url = line;
      channels.push(current);
      current = null;
    }
  }
  return channels;
}

/**
 * Reject URLs that carry committed secrets in the query string. Catches the
 * `?akes=eyJ...` (JWT bearer) pattern and JWT-shaped query values generally,
 * so a leaked signed token can never be baked back into the catalog by the
 * auto-merge bot. Never silently strip — reject, so the source of the leak
 * surfaces during validation.
 */
function looksLikeSecretUrl(url) {
  try {
    const u = new URL(url);
    for (const [key, value] of u.searchParams.entries()) {
      const lk = key.toLowerCase();
      if (lk === 'akes' || lk.includes('token') || lk.includes('key') || lk.includes('sig')) {
        return true;
      }
      // Three base64url chunks separated by dots = JWT (eyJ...).eyJ....
      if (/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Rewrite a bare imgur.com page URL (the HTML page) to the direct image URL,
 * so logos render instead of downloading an HTML document. Only rewrites the
 * page form; already-direct `i.imgur.com/...` URLs are left alone.
 */
function normalizeLogoUrl(logo) {
  if (!logo) return '';
  return logo.replace(/^https?:\/\/imgur\.com\/([A-Za-z0-9]+)\/?$/, 'https://i.imgur.com/$1.png');
}

// ── Fetch All Sources ────────────────────────────────────
async function fetchAllSources() {
  const results = await Promise.all(
    SOURCES.map(async (src) => {
      try {
        console.log(`  Fetching: ${src.id} ...`);
        const res = await fetch(src.url, {
          signal: AbortSignal.timeout(15000),
          headers: { 'User-Agent': 'Mozilla/5.0 TarangaPlus/2.0' },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        const parsed = parseM3U(text, src.id);
        console.log(`  ✓ ${src.id}: ${parsed.length} channels found`);
        return parsed;
      } catch (e) {
        console.error(`  ✗ ${src.id} failed: ${e.message}`);
        return [];
      }
    })
  );
  return results.flat();
}

// ── Validate Channels (Smart Check) ─────────────────────
// A channel is "alive" only if it returns a 2xx/206 *and* serves a real media
// signature: either a HLS/MPEG-DASH manifest (body starts with `#EXTM3U` or an
// XML doctype) or a recognized binary media content-type. Previously, matching
// `application/*` and short-circuiting on `|| ok` let "channel offline" HTML
// pages served as 200 through as alive — the root cause of dead catalog entries.
async function testStream(channel) {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    // Partial GET avoids 405/403 from CDNs that reject HEAD, and gives us body
    // bytes to inspect without downloading the whole segment.
    const res = await fetch(channel.url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Range': 'bytes=0-1023',
      },
    });
    clearTimeout(timeout);

    const okStatus = res.ok || res.status === 206;
    if (!okStatus) {
      return { ...channel, isAlive: false, latencyMs: Date.now() - start };
    }

    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    const isMediaContentType =
      contentType.includes('mpegurl') ||
      contentType.includes('x-mpegurl') ||
      contentType.includes('apple') ||
      contentType.includes('video/') ||
      contentType.includes('octet-stream') ||
      contentType.includes('dash') ||
      contentType.includes('xml');

    if (!isMediaContentType) {
      // Not a recognized media type — e.g. a 200 HTML "channel offline" page.
      return { ...channel, isAlive: false, latencyMs: Date.now() - start };
    }

    // For HLS specifically, require the manifest magic header in the body so a
    // content-type lie can't smuggle through an error page.
    if (contentType.includes('mpegurl') || contentType.includes('x-mpegurl') || channel.url.includes('.m3u8')) {
      const sample = await res.text();
      const head = sample.trimStart().slice(0, 7).toUpperCase();
      if (!head.startsWith('#EXTM3U')) {
        return { ...channel, isAlive: false, latencyMs: Date.now() - start };
      }
    }

    return { ...channel, isAlive: true, latencyMs: Date.now() - start };
  } catch (err) {
    console.warn(`  Test failed for ${channel.name}: ${err.message}`);
    return { ...channel, isAlive: false, latencyMs: TIMEOUT_MS };
  }
}

async function validateChannels(channels) {
  // Drop any stream URL that carries a committed secret (JWT bearer / `?akes=`).
  // Reject loudly so a leaked credential can never re-enter the catalog.
  const safe = channels.filter((c) => {
    if (looksLikeSecretUrl(c.url)) {
      console.warn(`  ✗ Rejected secret-bearing URL for ${c.name}: ${c.url}`);
      return false;
    }
    return true;
  });

  const valid = [];
  for (let i = 0; i < safe.length; i += BATCH_SIZE) {
    const batch = safe.slice(i, i + BATCH_SIZE);
    console.log(`  Testing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(safe.length / BATCH_SIZE)} (${batch.length} channels)...`);
    const results = await Promise.all(batch.map(testStream));
    valid.push(...results.filter((c) => c.isAlive));
    console.log(`  ✓ ${valid.length} alive so far`);
  }
  return valid;
}

// ── Deduplicate & Pick Best Route ────────────────────────
// Preserve Unicode letters (\p{L}) and numbers (\p{N}) so Bengali/Devanagari
// channel names are not collapsed to empty strings and silently dropped. The
// previous `[^a-z0-9\s-]` filter stripped every Bangla codepoint.
function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/\b(hd|fhd|4k|tv)\b/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function generateId(normalizedName) {
  const msgUint8 = new TextEncoder().encode(normalizedName);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .substring(0, 16);
}

function mapCategory(rawCategory, sourceId) {
  if (sourceId === 'iptv-org-sports') return 'sports';
  if (!rawCategory) return 'all';
  const c = rawCategory.toLowerCase();
  if (c.includes('sport')) return 'sports';
  if (c.includes('movie') || c.includes('cinema') || c.includes('film')) return 'movies';
  if (c.includes('music') || c.includes('gaan')) return 'music';
  if (c.includes('kid') || c.includes('child') || c.includes('cartoon') || c.includes('duronto')) return 'kids';
  if (c.includes('doc') || c.includes('nature')) return 'documentary';
  if (c.includes('entertain') || c.includes('general') || c.includes('natore')) return 'entertainment';
  if (c.includes('news') || c.includes('bangla')) return 'all';
  return 'all';
}

async function pickBestRoutes(validated) {
  const map = new Map();
  for (const ch of validated) {
    const norm = normalizeName(ch.name);
    if (!norm) continue;
    const existing = map.get(norm);
    if (!existing || ch.latencyMs < existing.latencyMs) {
      map.set(norm, ch);
    }
  }

  const final = [];
  for (const [, ch] of map.entries()) {
    const id = await generateId(normalizeName(ch.name));
    final.push({
      id,
      name: ch.name,
      logoUrl: normalizeLogoUrl(ch.logo || ''),
      streamUrl: ch.url,
      category: mapCategory(ch.category, ch.sourceId),
      latencyMs: ch.latencyMs,
    });
  }
  return final.sort((a, b) => a.name.localeCompare(b.name));
}

// ── Main ─────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  Taranga+ Channel Validation');
  console.log('═══════════════════════════════════════');

  const start = Date.now();

  console.log('\n📡 Fetching sources...');
  const raw = await fetchAllSources();
  console.log(`\n  Total raw: ${raw.length} channels`);

  console.log('\n🔍 Validating streams...');
  const valid = await validateChannels(raw);
  console.log(`\n  Alive: ${valid.length} channels`);

  console.log('\n🧹 Deduplicating & picking best routes...');
  const final = await pickBestRoutes(valid);
  console.log(`\n  Final lineup: ${final.length} channels`);

  const outPath = join(ROOT, 'data', 'channels.json');
  writeFileSync(outPath, JSON.stringify(final, null, 2));

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n✅ Saved to data/channels.json (${elapsed}s)`);
  console.log('═══════════════════════════════════════');
}

main().catch((e) => {
  console.error('❌ Fatal error:', e);
  process.exit(1);
});
