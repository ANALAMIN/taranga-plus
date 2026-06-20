// NOTE: This type module mirrors src/types/index.ts. The renderer's copy adds
// the synthetic 'favorites' pseudo-category (a UI-only filter, not assigned by
// the validator) — keep the union in sync here when it changes.

export type Category = 'all' | 'favorites' | 'sports' | 'movies' | 'music' | 'entertainment' | 'kids' | 'documentary';

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
  id: string; // Generated: SHA-256 of normalized channel name (first 16 hex chars)
  name: string;
  logoUrl: string;
  // Rewritten at runtime by the renderer to route through the Worker's
  // /proxy/stream endpoint for http:// sources (mixed-content avoidance).
  streamUrl: string;
  category: Category;
  latencyMs: number;
}

export interface Env {
  TARANGA_KV: KVNamespace;
  // Cloudflare worker environments/secrets
  IPTV_ORG_BD_URL?: string;
  IPTV_ORG_SPORTS_URL?: string;
  FREE_IPTV_BD_URL?: string;
  // Shared secret required by the /trigger-sync admin endpoint. Set via
  // `wrangler secret put ADMIN_TOKEN`. When unset, /trigger-sync 401s.
  ADMIN_TOKEN?: string;
}
