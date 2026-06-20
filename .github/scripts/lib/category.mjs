/**
 * Map a raw channel to one of our Category values (spec §4.4).
 *
 * Order matters: documentary keywords are checked BEFORE the generic group
 * so Discovery/NatGeo land in `documentary` even if the upstream group-title
 * says "Entertainment".
 *
 * @param {string|undefined} rawCategory  group-title from M3U
 * @param {string} sourceId
 * @param {string} name  channel display name
 * @returns {'all'|'sports'|'movies'|'music'|'entertainment'|'kids'|'documentary'}
 */
export function mapCategory(rawCategory, sourceId, name) {
  if (sourceId === 'iptv-org-sports') return 'sports';

  const n = (name || '').toLowerCase();

  // Documentary keywords take precedence (populate an otherwise empty bucket).
  if (/(discovery|natgeo|national geographic|animal planet|wild|nature|science|docu)/.test(n)) {
    return 'documentary';
  }

  if (!rawCategory) {
    // Name-only heuristics when no group-title.
    if (/(movie|cinema|film)/.test(n)) return 'movies';
    if (/(music|gaan)/.test(n)) return 'music';
    if (/(kid|child|cartoon|duronto)/.test(n)) return 'kids';
    if (/(entertain|general)/.test(n)) return 'entertainment';
    return 'all';
  }

  const c = rawCategory.toLowerCase();
  if (c.includes('sport')) return 'sports';
  if (c.includes('movie') || c.includes('cinema') || c.includes('film')) return 'movies';
  if (c.includes('music') || c.includes('gaan')) return 'music';
  if (c.includes('kid') || c.includes('child') || c.includes('cartoon')) return 'kids';
  if (c.includes('entertain') || c.includes('general')) return 'entertainment';
  // News and anything else → all.
  return 'all';
}
