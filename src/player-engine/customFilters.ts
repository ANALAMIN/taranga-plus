import shaka from 'shaka-player/dist/shaka-player.ui';

/**
 * Shaka Player network request/response filters.
 * Used to dynamically inject HTTP headers before each
 * stream request (e.g., User-Agent spoofing, Referer headers,
 * auth tokens for premium channels).
 */
export function registerNetworkFilters(player: shaka.Player): void {
  const netEngine = player.getNetworkingEngine();
  if (!netEngine) return;

  netEngine.registerRequestFilter((type, request) => {
    // Inject custom headers on every manifest and segment request
    if (type === shaka.net.NetworkingEngine.RequestType.MANIFEST || 
        type === shaka.net.NetworkingEngine.RequestType.SEGMENT) {
      
      // In a raw Electron environment (webSecurity: false), this User-Agent spoofing works perfectly
      // and helps bypass basic restrictions from raw m3u8 hosts.
      request.headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
      
      // We can also inject Referer tokens here if required by specific streams
      // request.headers['Referer'] = 'https://trusted-source.com/';
    }
  });
}
