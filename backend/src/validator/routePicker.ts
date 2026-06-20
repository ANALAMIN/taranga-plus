import { Category, ChannelFinal, ChannelValidated } from '../types';

/**
 * Normalizes channel names for deduplication (removes extra spaces, HD tags, etc.)
 *
 * Preserve Unicode letters (\p{L}) and numbers (\p{N}) so Bengali / Devanagari
 * channel names are not collapsed to empty strings and silently dropped. The
 * previous `[^a-z0-9\s-]` filter stripped every Bangla codepoint, which made
 * `if (!normalized) continue` discard all Bangla-named channels.
 */
function normalizeName(name: string): string {
  return name.toLowerCase()
    .replace(/\b(hd|fhd|4k|tv)\b/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Creates a deterministic ID based on the normalized channel name
 */
async function generateId(normalizedName: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(normalizedName);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
}

/**
 * Maps raw categories to our defined Category enum
 */
function mapCategory(rawCategory: string | undefined, sourceId: string): Category {
  if (sourceId === 'iptv-org-sports') return 'sports';
  if (!rawCategory) return 'all';

  const lowerCat = rawCategory.toLowerCase();
  if (lowerCat.includes('sport')) return 'sports';
  if (lowerCat.includes('movie') || lowerCat.includes('cinema')) return 'movies';
  if (lowerCat.includes('music')) return 'music';
  if (lowerCat.includes('kid') || lowerCat.includes('child') || lowerCat.includes('cartoon')) return 'kids';
  if (lowerCat.includes('doc')) return 'documentary';
  if (lowerCat.includes('entertain') || lowerCat.includes('general')) return 'entertainment';

  return 'all';
}

/**
 * Deduplicates channels and selects the fastest link (lowest latency ping).
 * Returns the final mapped array for the frontend.
 */
export async function pickBestRoutes(validatedChannels: ChannelValidated[]): Promise<ChannelFinal[]> {
  const channelMap = new Map<string, ChannelValidated>();

  // Deduplicate and keep the one with the lowest latency
  for (const channel of validatedChannels) {
    const normalized = normalizeName(channel.name);
    if (!normalized) continue;

    const existing = channelMap.get(normalized);
    if (!existing || channel.latencyMs < existing.latencyMs) {
      channelMap.set(normalized, channel);
    }
  }

  // Convert to final format
  const finalChannels: ChannelFinal[] = [];
  
  for (const [normalized, channel] of channelMap.entries()) {
    const id = await generateId(normalized);
    
    finalChannels.push({
      id,
      name: channel.name,
      logoUrl: channel.logo || '',
      streamUrl: channel.url,
      category: mapCategory(channel.category, channel.sourceId),
      latencyMs: channel.latencyMs
    });
  }

  // Sort alphabetically
  return finalChannels.sort((a, b) => a.name.localeCompare(b.name));
}
