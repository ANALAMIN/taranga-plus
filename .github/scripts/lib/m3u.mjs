/**
 * Parse an M3U playlist into ChannelRaw objects.
 *
 * Supports tvg-logo, group-title, tvg-language, tvg-country attributes. A
 * stream URL must follow a #EXTINF line to be included (orphan URLs are
 * dropped). Uses regex on each EXTINF line (cheap, no full M3U parser dep).
 *
 * @param {string} content
 * @param {string} sourceId
 * @returns {Array<{sourceId:string, logo?:string, category?:string, language?:string, country?:string, name:string, url:string}>}
 */
export function parseM3U(content, sourceId) {
  const lines = content.split('\n');
  const channels = [];
  let current = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith('#EXTINF:')) {
      current = { sourceId };
      const logoMatch = line.match(/tvg-logo="([^"]+)"/);
      if (logoMatch) current.logo = logoMatch[1];
      const groupMatch = line.match(/group-title="([^"]+)"/);
      if (groupMatch) current.category = groupMatch[1];
      const langMatch = line.match(/tvg-language="([^"]+)"/);
      if (langMatch) current.language = langMatch[1];
      const countryMatch = line.match(/tvg-country="([^"]+)"/);
      if (countryMatch) current.country = countryMatch[1];
      const nameIdx = line.lastIndexOf(',');
      if (nameIdx !== -1) current.name = line.substring(nameIdx + 1).trim();
    } else if (line.startsWith('http') && current?.name) {
      current.url = line;
      channels.push(current);
      current = null;
    }
  }
  return channels;
}
