import { PLAYER_UA } from './playerConfig';

export interface StreamNetworkingConfig {
  userAgent?: string;
  referer?: string;
  origin?: string;
  headers?: Record<string, string>;
  useProxy?: boolean;
  proxyBaseUrl?: string;
}

let _netConfig: StreamNetworkingConfig = {};

export function setStreamNetworkingConfig(config: StreamNetworkingConfig): void {
  _netConfig = config;
}

export function getNetworkConfig(): StreamNetworkingConfig {
  return _netConfig;
}

export function buildXhrSetup(netConfig: StreamNetworkingConfig) {
  return (xhr: XMLHttpRequest, url: string) => {
    xhr.setRequestHeader('User-Agent', netConfig.userAgent || PLAYER_UA);

    if (netConfig.referer) {
      xhr.setRequestHeader('Referer', netConfig.referer);
    }
    if (netConfig.origin) {
      xhr.setRequestHeader('Origin', netConfig.origin);
    }
    if (netConfig.headers) {
      for (const [key, val] of Object.entries(netConfig.headers)) {
        xhr.setRequestHeader(key, val);
      }
    }

    if (netConfig.useProxy && netConfig.proxyBaseUrl && url.startsWith('http')) {
      const originalUrl = url;
      try {
        xhr.open('GET', `${netConfig.proxyBaseUrl}${encodeURIComponent(originalUrl)}`);
        xhr.setRequestHeader('X-Proxy-Target-Headers', JSON.stringify({
          'User-Agent': netConfig.userAgent || PLAYER_UA,
          'Referer': netConfig.referer || '',
          'Origin': netConfig.origin || '',
        }));
      } catch {
      }
    }

    xhr.withCredentials = false;
  };
}
