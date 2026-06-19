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
  { id: 'iptv-org-bd', url: 'https://iptv-org.github.io/iptv/countries/bd.m3u' },
  { id: 'iptv-org-sports', url: 'https://iptv-org.github.io/iptv/categories/sports.m3u' },
  { id: 'free-iptv-bd', url: 'https://raw.githubusercontent.com/Free-IPTV/Countries/master/BD.m3u' },
];

const TIMEOUT_MS = 4000;
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

// ── Validate Channels (HEAD request) ─────────────────────
async function testStream(channel) {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(channel.url, {
      method: 'HEAD',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });
    clearTimeout(timeout);
    if (res.ok) {
      return { ...channel, isAlive: true, latencyMs: Date.now() - start };
    }
  } catch {}
  return { ...channel, isAlive: false, latencyMs: TIMEOUT_MS };
}

async function validateChannels(channels) {
  const valid = [];
  for (let i = 0; i < channels.length; i += BATCH_SIZE) {
    const batch = channels.slice(i, i + BATCH_SIZE);
    console.log(`  Testing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(channels.length / BATCH_SIZE)} (${batch.length} channels)...`);
    const results = await Promise.all(batch.map(testStream));
    valid.push(...results.filter((c) => c.isAlive));
    console.log(`  ✓ ${valid.length} alive so far`);
  }
  return valid;
}

// ── Deduplicate & Pick Best Route ────────────────────────
function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/\b(hd|fhd|4k|tv)\b/g, '')
    .replace(/[^a-z0-9]/g, '');
}

async function generateId(normalizedName) {
  const msgUint8 = new TextEncoder().encode(normalizedName);
  const hashBuffer = await crypto.subtle.digest('SHA-1', msgUint8);
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
  if (c.includes('movie') || c.includes('cinema')) return 'movies';
  if (c.includes('music')) return 'music';
  if (c.includes('kid') || c.includes('child') || c.includes('cartoon')) return 'kids';
  if (c.includes('doc')) return 'documentary';
  if (c.includes('entertain') || c.includes('general')) return 'entertainment';
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
      logoUrl: ch.logo || '',
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
