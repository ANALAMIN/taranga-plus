// NOTE: This type module mirrors backend/src/types/index.ts. Keep the two in
// sync (a shared package is the long-term fix; for now they are hand-aligned).

export type Category = 'all' | 'favorites' | 'sports' | 'movies' | 'music' | 'entertainment' | 'kids' | 'documentary';

export type Language = 'bn' | 'hi' | 'en' | 'ur' | 'other';
export type Tier = 'global' | 'bdix';   // which validation tier owns it

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
  id: string;
  name: string;
  logoUrl: string;
  streamUrl: string;
  category: Category;
  latencyMs: number;
  language: Language;
  tier: Tier;
  sources: string[];
  lastValidated: string;
}

export interface AppSettings {
  theme: 'dark' | 'light' | 'system';
  accentColor: string;
}
