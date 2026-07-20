import Hls from 'hls.js';
import { HLS_CONFIG, PLAYER_UA } from './playerConfig';
import { getNetworkConfig, buildXhrSetup } from './customFilters';

export function createHlsInstance(videoElement: HTMLVideoElement): Hls {
  const netConfig = getNetworkConfig();
  const config: Partial<import('hls.js').HlsConfig> = {
    ...HLS_CONFIG,
    xhrSetup: buildXhrSetup(netConfig),
  };

  if (netConfig.userAgent) {
    config.xhrSetup = buildXhrSetup(netConfig);
  }

  const hls = new Hls(config);
  hls.attachMedia(videoElement);

  return hls;
}
