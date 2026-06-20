#!/usr/bin/env node
/**
 * Taranga+ Tier-1 Channel Validation
 * Runs on GitHub Actions twice hourly.
 *
 * Pipeline: fetch sources → parse → filter (secret/lang/geo) → validate
 * (segment-level, retry×3) → multi-URL dedup → write channels.json.
 */

import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { SOURCES, classifyHost } from './lib/sources.mjs';
import { parseM3U } from './lib/m3u.mjs';
import { looksLikeSecretUrl } from './lib/secrets.mjs';
import { detectLanguage, isLanguageAllowed } from './lib/language.mjs';
import { isLikelyGeoBlockedFromBd } from './lib/bdFilter.mjs';
import { testSegment } from './lib/segmentTest.mjs';
import { pickBestRoutes } from './lib/dedupe.mjs';
import { buildReport } from './lib/report.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const BATCH_SIZE = 50;
const MAX_RETRIES = 3;

function normalizeLogoUrl(logo) {
  if (!logo) return '';
  return logo.replace(/^https?:\/\/imgur\.com\/([A-Za-z0-9]+)\/?$/, 'https://i.imgur.com/$1.png');
}

async function fetchAllSources() {
  const results = await Promise.all(
    SOURCES.map(async (src) => {
      try {
        console.log(`  Fetching: ${src.id} ...`);
        const res = await fetch(src.url, {
          signal: AbortSignal.timeout(20000),
          headers: { 'User-Agent': 'Mozilla/5.0 TarangaPlus/2.0' },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        const parsed = parseM3U(text, src.id);
        console.log(`  ✓ ${src.id}: ${parsed.length} channels parsed`);
        return parsed;
      } catch (e) {
        console.error(`  ✗ ${src.id} failed: ${e.message}`);
        return [];
      }
    })
  );
  return results.flat();
}

/** testSegment with retry×3 on transient failures. */
async function testWithRetry(url) {
  let last;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    last = await testSegment(url);
    if (last.ok) return last;
    // Only retry on transient-looking reasons (network/timeout/5xx). Status
    // 403/404 etc. won't change, so fail fast.
    if (/status (40[039]|41[0-5]|42[0-9])/.test(last.reason || '')) return last;
    const base = 400 * Math.pow(2, attempt - 1);
    await new Promise((r) => setTimeout(r, base + Math.floor(Math.random() * base)));
  }
  return last;
}

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  Taranga+ Tier-1 Validation');
  console.log('═══════════════════════════════════════\n');

  const start = Date.now();

  console.log('📡 Fetching sources...');
  const raw = await fetchAllSources();
  console.log(`\n  Total raw: ${raw.length} channels\n`);

  const stats = { raw: raw.length, secretRejected: 0, languageRejected: 0, geoFiltered: 0, dead: {}, alive: 0, final: 0 };

  // ── Filter stage ──────────────────────────────────────────────
  const candidates = [];
  for (const ch of raw) {
    if (looksLikeSecretUrl(ch.url)) { stats.secretRejected++; continue; }
    const lang = detectLanguage(ch);
    if (!isLanguageAllowed(lang)) { stats.languageRejected++; continue; }
    // Geo filter applies only to Tier-1 (global) channels. BDIX channels
    // are included unvalidated here and health-checked in-app (Phase 2.5).
    const tier = classifyHost(ch.url);
    if (tier === 'global' && isLikelyGeoBlockedFromBd(ch)) { stats.geoFiltered++; continue; }
    candidates.push({ ...ch, language: lang, tier });
  }

  console.log(`🔍 Validating ${candidates.length} candidates (segment-level, retry×${MAX_RETRIES})...`);

  // Split: only global-tier candidates are network-validated here. BDIX
  // candidates are passed through unvalidated (Tier-2 handles them in-app).
  const toValidate = candidates.filter((c) => c.tier === 'global');
  const bdixPassThrough = candidates.filter((c) => c.tier === 'bdix');

  const alive = [];
  for (let i = 0; i < toValidate.length; i += BATCH_SIZE) {
    const batch = toValidate.slice(i, i + BATCH_SIZE);
    console.log(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(toValidate.length / BATCH_SIZE)} (${batch.length})...`);
    const results = await Promise.all(batch.map(async (ch) => {
      const r = await testWithRetry(ch.url);
      if (!r.ok) {
        const key = r.reason || 'unknown';
        stats.dead[key] = (stats.dead[key] || 0) + 1;
        return null;
      }
      return { ...ch, latencyMs: r.latencyMs };
    }));
    for (const r of results) if (r) alive.push(r);
    console.log(`    alive so far: ${alive.length}`);
  }

  // BDIX pass-through: keep all (unvalidated); in-app prefetch will prune.
  for (const ch of bdixPassThrough) {
    alive.push({ ...ch, latencyMs: 0 });
  }

  stats.alive = alive.length;
  console.log(`\n🧹 Deduplicating (multi-URL)...`);
  const final = await pickBestRoutes(alive);
  stats.final = final.length;

  console.log('\n' + buildReport(stats));

  const outPath = join(ROOT, 'data', 'channels.json');
  writeFileSync(outPath, JSON.stringify(final, null, 2));

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n✅ Saved ${final.length} channels to data/channels.json (${elapsed}s)`);
  console.log('═══════════════════════════════════════');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
