import { isGlobalCdnHost } from './sources.mjs';

// Countries whose channels we keep (target audience + SAARC + Urdu markets).
const KEEP_COUNTRIES = new Set(['BD', 'IN', 'PK', 'LK', 'NP', 'BT', 'MV', 'AF', 'AE', 'SA', 'GB', 'US']);

/**
 * Heuristic: would this channel likely be geo-blocked when viewed from BD?
 *
 * Rules (spec §5.2):
 *   - global-CDN host  → never blocked (CDNs don't bind to the declared country)
 *   - declared country in our keep set → not blocked
 *   - declared country NOT in keep set AND non-CDN host → likely blocked
 *   - missing country → keep (conservative; let validation/Tier-2 decide)
 *
 * @param {{url: string, country?: string}} channel
 * @returns {boolean} true = drop it (likely BD-blocked)
 */
export function isLikelyGeoBlockedFromBd({ url, country }) {
  if (isGlobalCdnHost(url)) return false;
  if (!country) return false; // conservative
  return !KEEP_COUNTRIES.has(country.toUpperCase());
}
