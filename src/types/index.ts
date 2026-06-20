// NOTE: This type module mirrors backend/src/types/index.ts. Keep the two in
// sync (a shared package is the long-term fix; for now they are hand-aligned).

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
  id: string; // Generated: SHA-256 of normalized channel name (first 16 hex chars)
  name: string;
  logoUrl: string;
  // As stored, this is the raw upstream URL. At playback time the renderer
  // rewrites http:// sources to route through the Worker /proxy/stream endpoint
  // to avoid mixed-content blocks under webSecurity:true.
  streamUrl: string;
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
