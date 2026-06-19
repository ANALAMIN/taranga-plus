import { ChannelRaw, Env } from '../types';

const DEFAULT_SOURCES = {
  bd_primary: 'https://iptv-org.github.io/iptv/countries/bd.m3u',
  sports: 'https://iptv-org.github.io/iptv/categories/sports.m3u',
  bd_fallback: 'https://raw.githubusercontent.com/Free-IPTV/Countries/master/BD.m3u'
};

/**
 * Parses an M3U playlist into structured ChannelRaw array
 */
function parseM3U(m3uContent: string, sourceId: string): ChannelRaw[] {
  const lines = m3uContent.split('\n');
  const channels: ChannelRaw[] = [];
  let currentChannel: Partial<ChannelRaw> | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith('#EXTINF:')) {
      currentChannel = { sourceId };

      // Extract logo URL
      const logoMatch = line.match(/tvg-logo="([^"]+)"/);
      if (logoMatch) currentChannel.logo = logoMatch[1];

      // Extract category/group
      const groupMatch = line.match(/group-title="([^"]+)"/);
      if (groupMatch) currentChannel.category = groupMatch[1];

      // Extract channel name (everything after the last comma)
      const nameIndex = line.lastIndexOf(',');
      if (nameIndex !== -1) {
        currentChannel.name = line.substring(nameIndex + 1).trim();
      }
    } else if (line.startsWith('http') && currentChannel && currentChannel.name) {
      currentChannel.url = line;
      channels.push(currentChannel as ChannelRaw);
      currentChannel = null;
    }
  }

  return channels;
}

/**
 * Fetches raw M3U8 channel lists from ALL sources simultaneously.
 * Parses M3U8 format into structured ChannelRaw[]
 */
export async function fetchAllSources(env: Env): Promise<ChannelRaw[]> {
  const sources = [
    { id: 'iptv-org-bd', url: env.IPTV_ORG_BD_URL || DEFAULT_SOURCES.bd_primary },
    { id: 'iptv-org-sports', url: env.IPTV_ORG_SPORTS_URL || DEFAULT_SOURCES.sports },
    { id: 'free-iptv-bd', url: env.FREE_IPTV_BD_URL || DEFAULT_SOURCES.bd_fallback }
  ];

  const fetchPromises = sources.map(async (source) => {
    try {
      const response = await fetch(source.url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const text = await response.text();
      return parseM3U(text, source.id);
    } catch (error) {
      console.error(`Failed to fetch from ${source.id}:`, error);
      return []; // Return empty array so Promise.all succeeds for working sources
    }
  });

  const results = await Promise.all(fetchPromises);
  return results.flat(); // Merge all parsed channels into a single array
}
