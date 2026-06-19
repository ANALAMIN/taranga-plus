export type Category = 'all' | 'sports' | 'movies' | 'music' | 'entertainment' | 'kids' | 'documentary';

export interface ChannelRaw {
  name: string;
  url: string;
  logo?: string;
  category?: string;
  country?: string;
  sourceId: string;
}

export interface ChannelValidated extends ChannelRaw {
  latencyMs: number;
  isAlive: boolean;
}

export interface ChannelFinal {
  id: string; // Generated: MD5/Hash of channel name
  name: string;
  logoUrl: string;
  streamUrl: string; // Proxied through Cloudflare
  category: Category;
  latencyMs: number;
}

export interface Env {
  TARANGA_KV: KVNamespace;
  // Cloudflare worker environments/secrets
  IPTV_ORG_BD_URL?: string;
  IPTV_ORG_SPORTS_URL?: string;
  FREE_IPTV_BD_URL?: string;
}
