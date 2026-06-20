import shaka from 'shaka-player/dist/shaka-player.ui';

/**
 * Adaptive Bitrate (ABR) configuration for Shaka.
 * If internet speed drops suddenly:
 *   - Player will NOT buffer. It will drop quality instead.
 *   - Goes from 1080p -> 720p -> 480p -> 360p automatically.
 *   - When speed recovers, it upgrades quality silently.
 */

/**
 * Seed the initial bandwidth estimate from the Network Information API when
 * available, otherwise fall back to a conservative 1.5 Mbps. A previous
 * hardcoded 5 Mbps caused the first variant selection to jump straight to
 * 1080p, triggering an immediate rebuffer on slow links.
 */
function seedBandwidthEstimate(): number {
  const conn = (navigator as Navigator & { connection?: { downlink?: number } }).connection;
  // `downlink` is in Mbps per the spec; convert to bps. Reject implausible
  // values so a misbehaving browser hint can't push us to 1080p on cold start.
  if (conn && typeof conn.downlink === 'number' && conn.downlink > 0 && conn.downlink < 100) {
    return Math.round(conn.downlink * 1_000_000);
  }
  return 1_500_000;
}

export function configureAbr(player: shaka.Player): void {
  player.configure({
    abr: {
      enabled: true,
      defaultBandwidthEstimate: seedBandwidthEstimate(),
      // The previous explicit restrictions (minBandwidth: 0 / maxBandwidth:
      // Infinity) were no-ops identical to the defaults and added nothing.
      switchInterval: 8,   // Don't switch quality too rapidly
    }
  });
}
