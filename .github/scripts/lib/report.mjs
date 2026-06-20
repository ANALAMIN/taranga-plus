/**
 * Build the human-readable validation summary printed to the workflow log
 * (and visible in the PR body context).
 *
 * @param {{raw:number, secretRejected:number, languageRejected:number, geoFiltered:number, dead:Object<string,number>, alive:number, final:number}} stats
 * @returns {string}
 */
export function buildReport(stats) {
  const deadLines = Object.entries(stats.dead || {})
    .sort((a, b) => b[1] - a[1])
    .map(([reason, n]) => `    ${reason}: ${n}`)
    .join('\n');

  return [
    'Validation Report',
    '─────────────────',
    `Raw channels:            ${stats.raw}`,
    `Secret URLs rejected:    ${stats.secretRejected}`,
    `Language-filtered:       ${stats.languageRejected}`,
    `Geo-filtered:            ${stats.geoFiltered}`,
    `Dead:`,
    deadLines,
    `Alive:                   ${stats.alive}`,
    `Final after dedup:       ${stats.final}`,
  ].filter(Boolean).join('\n');
}
