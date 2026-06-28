import shaka from 'shaka-player/dist/shaka-player.ui';

/**
 * Adaptive Bitrate (ABR) configuration for Shaka.
 *
 * Tuning rationale (spec §6.2):
 *   switchInterval  8→10                    — less quality thrashing on spiky networks
 *   defaultBandwidth 1.5Mbps→1Mbps          — more conservative cold start (avoid
 *                                             jumping to 1080p and immediately rebuffering)
 *   bandwidthUpgradeTarget   0.85           — only upgrade when we have headroom
 *   bandwidthDowngradeTarget 0.95           — downgrade quickly on congestion
 *
 * Network-change re-seeding: re-configure ABR estimate when the browser reports
 * a connection-type change (2G/3G/4G/WiFi) so the player re-selects quality
 * immediately instead of waiting for the EWMA to converge over several segments.
 */

function seedBandwidthEstimate(): number {
  const conn = (navigator as Navigator & { connection?: { downlink?: number; effectiveType?: string } }).connection;
  if (conn && typeof conn.downlink === 'number' && conn.downlink > 0 && conn.downlink < 100) {
    // Convert Mbps → bps. Cap at 5 Mbps to prevent a bogus hint pushing us to 4K.
    return Math.min(Math.round(conn.downlink * 1_000_000), 5_000_000);
  }
  return 1_000_000; // 1 Mbps conservative default
}

export function configureAbr(player: shaka.Player): void {
  player.configure({
    abr: {
      enabled: true,
      defaultBandwidthEstimate: seedBandwidthEstimate(),
      switchInterval: 2,               // fast adaptation — re-evaluate every 2s
      bandwidthUpgradeTarget: 0.6,     // upgrade sooner when headroom available
      bandwidthDowngradeTarget: 0.8,   // downgrade quickly on congestion
    }
  });
}

/**
 * Listen for Network Information API connection-change events and re-seed the
 * ABR bandwidth estimate so the player selects an appropriate quality tier
 * immediately on a detected up/down network shift.
 *
 * Returns a cleanup function to remove the listener.
 */
export function watchNetworkChanges(player: shaka.Player): () => void {
  const conn = (navigator as Navigator & { connection?: EventTarget & { downlink?: number } }).connection;
  if (!conn) return () => {};

  const onchange = () => {
    const estimate = seedBandwidthEstimate();
    try {
      player.configure({ abr: { defaultBandwidthEstimate: estimate } });
      console.log(`[Taranga+] Network change detected. ABR re-seeded to ${(estimate / 1_000_000).toFixed(2)} Mbps`);
    } catch {
      // Player may have been destroyed; silently ignore.
    }
  };

  conn.addEventListener('change', onchange);
  return () => conn.removeEventListener('change', onchange);
}
