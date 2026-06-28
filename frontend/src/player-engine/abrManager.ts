import shaka from 'shaka-player/dist/shaka-player.ui';

function seedBandwidthEstimate(): number {
  const conn = (navigator as Navigator & { connection?: { downlink?: number; effectiveType?: string } }).connection;
  if (conn && typeof conn.downlink === 'number' && conn.downlink > 0 && conn.downlink < 100) {
    return Math.min(Math.round(conn.downlink * 1_000_000), 5_000_000);
  }
  return 1_000_000;
}

export function configureAbr(player: shaka.Player): void {
  player.configure({
    abr: {
      enabled: true,
      defaultBandwidthEstimate: seedBandwidthEstimate(),
      switchInterval: 10,
      bandwidthUpgradeTarget: 0.65,
      bandwidthDowngradeTarget: 0.85,
    }
  });
}

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
