import { mapCategory } from './category.mjs';

/**
 * Normalize a channel name for deduplication (spec §5.3, §4.3).
 * Preserve Unicode letters (\p{L}) and numbers (\p{N}) so Bengali / Hindi
 * names are not collapsed to empty strings.
 */
export function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/\b(hd|fhd|4k|tv)\b/g, '')
    .replace(/[^\p{L}\p{M}\p{N}\s-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function sha256Hex16(input) {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .substring(0, 16);
}

/**
 * Deduplicate validated channels: one entry per normalized name, with ALL
 * passing URLs kept in `sources[]` sorted by latency (fastest first).
 * `streamUrl` is the fastest URL.
 *
 * @param {Array} validated  each has {name, url, latencyMs, language, tier, sourceId, category, logo}
 * @param {() => string} [nowIso]  injectable clock for tests
 * @returns {Promise<Array>} final ChannelFinal-shaped entries
 */
export async function pickBestRoutes(validated, nowIso = () => new Date().toISOString()) {
  const groups = new Map();

  for (const ch of validated) {
    const norm = normalizeName(ch.name);
    if (!norm) continue;
    if (!groups.has(norm)) groups.set(norm, []);
    groups.get(norm).push(ch);
  }

  const final = [];
  for (const [norm, group] of groups.entries()) {
    // Sort each group by latency (fastest first), dedupe identical URLs.
    const byLatency = [...group].sort((a, b) => a.latencyMs - b.latencyMs);
    const seen = new Set();
    const sources = [];
    for (const ch of byLatency) {
      if (!seen.has(ch.url)) {
        seen.add(ch.url);
        sources.push(ch.url);
      }
    }
    const primary = byLatency[0];
    const id = await sha256Hex16(norm);

    final.push({
      id,
      name: primary.name,
      logoUrl: primary.logo || '',
      streamUrl: primary.url,
      category: mapCategory(primary.category, primary.sourceId, primary.name),
      latencyMs: primary.latencyMs,
      language: primary.language,
      tier: primary.tier,
      sources,
      lastValidated: nowIso(),
    });
  }

  return final.sort((a, b) => a.name.localeCompare(b.name));
}
