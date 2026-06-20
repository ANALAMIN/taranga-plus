import { ChannelFinal } from '../types';

/**
 * The catalog stores stream URLs exactly as upstream serves them, which means a
 * large fraction are plain `http://`. Under `webSecurity: true` (correctly
 * re-enabled after the v1 audit) the renderer blocks mixed-content: a secure
 * Electron origin cannot load an `http://` media resource. The Worker exposes a
 * `/proxy/stream?url=...` endpoint that fetches the upstream server-side and
 * re-serves it over HTTPS, which is what makes those channels playable.
 *
 * `applyStreamProxy` rewrites each channel's `streamUrl` so playback routes
 * through the proxy when (and only when) the source is insecure. `https://`
 * sources are left untouched — they play directly and avoid the extra hop.
 */
const WORKER_BASE =
  import.meta.env.VITE_CLOUDFLARE_URL || 'http://localhost:8787';
const PROXY_ENDPOINT = `${WORKER_BASE.replace(/\/$/, '')}/proxy/stream`;

export function proxyStreamUrl(rawUrl: string): string {
  if (/^https:\/\//i.test(rawUrl)) return rawUrl;
  if (/^http:\/\//i.test(rawUrl)) {
    return `${PROXY_ENDPOINT}?url=${encodeURIComponent(rawUrl)}`;
  }
  return rawUrl;
}

export function applyStreamProxy(channels: ChannelFinal[]): ChannelFinal[] {
  return channels.map((c) =>
    c.streamUrl && c.streamUrl.startsWith('http://')
      ? { ...c, streamUrl: proxyStreamUrl(c.streamUrl) }
      : c
  );
}
