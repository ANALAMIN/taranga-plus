import shaka from 'shaka-player/dist/shaka-player.ui';

/**
 * Adaptive Bitrate (ABR) configuration for Shaka.
 * If internet speed drops suddenly:
 *   - Player will NOT buffer. It will drop quality instead.
 *   - Goes from 1080p -> 720p -> 480p -> 360p automatically.
 *   - When speed recovers, it upgrades quality silently.
 */
export function configureAbr(player: shaka.Player): void {
  player.configure({
    abr: {
      enabled: true,
      defaultBandwidthEstimate: 5000000, // Start assuming 5 Mbps
      restrictions: {
        minBandwidth: 0,
        maxBandwidth: Infinity
      },
      switchInterval: 8   // Don't switch quality too rapidly
    }
  });
}
