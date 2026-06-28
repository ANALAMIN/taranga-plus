import shaka from 'shaka-player/dist/shaka-player.ui';

/**
 * Shaka Player network request/response filters.
 *
 * A previous version spoofed the User-Agent here and referenced an
 * `webSecurity: false` Electron mode that has since been correctly removed.
 * Same-origin / CORS is now enforced, so UA spoofing would not bypass origin
 * checks anyway — it would only mask the true client identity from origin
 * servers (breaking analytics/geo and tripping bot-detection WAFs). We let
 * Shaka / Electron send the real User-Agent.
 *
 * The request filter is kept as a no-op seam so per-channel header injection
 * (e.g. a Referer a specific origin requires) can be added explicitly and
 * auditably in the future, rather than blanket-spoofed.
 */
export function registerNetworkFilters(player: shaka.Player): void {
  const netEngine = player.getNetworkingEngine();
  if (!netEngine) return;

  netEngine.registerRequestFilter((_type, _request) => {
    // Intentional no-op for now. Add per-channel header overrides here when
    // a concrete upstream requirement is documented.
  });
}
