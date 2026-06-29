import shaka from 'shaka-player/dist/shaka-player.ui';

export function registerNetworkFilters(player: shaka.Player): void {
  const netEngine = player.getNetworkingEngine();
  if (!netEngine) return;

  netEngine.registerRequestFilter((type, request) => {
  });
}
