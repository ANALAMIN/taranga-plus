export type Category = 'all' | 'favorites' | 'sports' | 'movies' | 'music' | 'entertainment' | 'kids' | 'documentary';

export interface ChannelRaw {
  name: string;
  url: string;
  logo?: string;
  category?: string;
  country?: string;
}

export interface ChannelValidated extends ChannelRaw {
  latencyMs: number;
  isAlive: boolean;
  sourceId: string;
}

export interface ChannelFinal {
  id: string; // Generated: MD5 of channel name
  name: string;
  logoUrl: string;
  streamUrl: string; // Proxied through Cloudflare
  category: Category;
  latencyMs: number;
}

export interface AppSettings {
  theme: 'dark' | 'light' | 'system';
  accentColor: string;
}

export interface HealthStatus {
  status: string;
  channelCount: number;
  timestamp: string;
}
