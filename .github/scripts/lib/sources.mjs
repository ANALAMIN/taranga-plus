/**
 * Source registry (spec §4.1) and host classifier (spec §4.2).
 *
 * All sources are 'global' tier — validated by the US GitHub runner.
 * BDIX-only (BD-ISP) sources have been removed: they cannot be reached from
 * GitHub Actions (US) and we no longer run in-app health checks.
 */

export const SOURCES = [
  { id: 'iptv-org-bd',           tier: 'global', url: 'https://iptv-org.github.io/iptv/countries/bd.m3u' },
  { id: 'iptv-org-india',        tier: 'global', url: 'https://iptv-org.github.io/iptv/countries/in.m3u' },
  { id: 'iptv-org-sports',       tier: 'global', url: 'https://iptv-org.github.io/iptv/categories/sports.m3u' },
  { id: 'iptv-org-movies',       tier: 'global', url: 'https://iptv-org.github.io/iptv/categories/movies.m3u' },
  { id: 'iptv-org-documentary',  tier: 'global', url: 'https://iptv-org.github.io/iptv/categories/documentary.m3u' },
  { id: 'iptv-org-music',        tier: 'global', url: 'https://iptv-org.github.io/iptv/categories/music.m3u' },
  { id: 'iptv-org-kids',         tier: 'global', url: 'https://iptv-org.github.io/iptv/categories/kids.m3u' },
  { id: 'free-tv',               tier: 'global', url: 'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlists/playlist.m3u8' },
  // BD channels on global CDN (gpcdn.net / cloudfront / amagi) — fully Tier-1 validatable.
  // Aggregates ~50 Akash Digital BD channels (BTV, NTV, Somoy, Jamuna, Deepto, etc.).
  { id: 'mrgify-bd',             tier: 'global', url: 'https://raw.githubusercontent.com/abusaeeidx/Mrgify-BDIX-IPTV/main/playlist.m3u' },
  // Additional curated BD + global channels (cloudfront, akamaized, amagi CDN URLs).
  { id: 'imshakil-tvlink',       tier: 'global', url: 'https://raw.githubusercontent.com/imShakil/tvlink/refs/heads/main/iptv.m3u8' },
];

// Hostnames known to be on global CDNs (reachable from anywhere).
const GLOBAL_HOST_PATTERNS = [
  /\.akamaized\.net$/i,
  /\.akamaihd\.net$/i,
  /\.cloudfront\.net$/i,
  /\.llnwi\.net$/i,           // Limelight
  /\.amagi\.tv$/i,            // Amagi FAST channels (Enter10 Bangla, News18 Bangla etc.)
  /\.gpcdn\.net$/i,           // GlobalPort CDN — hosts Akash Digital BD channels
  /^jiocgehub\.jio\.ril\.com$/i,
  /^iptv-org\.github\.io$/i,
  /^raw\.githubusercontent\.com$/i,
  /\.google\.com$/i,          // dai.google.com etc.
  /\.pluto\.tv$/i,
];

// Hostnames known to be BD-only (BDIX / BD ISP IPs).
const BDIX_HOST_PATTERNS = [
  /digijadoo\.net$/i,
  /kitv\.live$/i,
  /jagobd\.com$/i,
  /colorsbd\.com$/i,
  /telelivebd\.com$/i,
];

// BDIX-looking raw IP ranges (BD ISP blocks). Conservative: only the
// well-known BDIX prefixes.
const BDIX_IP_PATTERNS = [
  /^103\./,   // APNIC, heavy BD ISP use
  /^45\.(249|126|58)\./,
  /^182\.48\./,
  /^202\.(51|134|84)\./,
  /^118\.179\./,
  /^123\.108\./,
];

export function isGlobalCdnHost(url) {
  try {
    const host = new URL(url).hostname;
    for (const p of GLOBAL_HOST_PATTERNS) {
      if (p.test(host)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Classify a stream URL as 'global' or 'bdix'.
 * Global URLs are validated by Tier 1. BDIX URLs are deferred to Tier 2.
 *
 * @param {string} url
 * @returns {'global'|'bdix'}
 */
export function classifyHost(url) {
  try {
    const u = new URL(url);
    const host = u.hostname;

    // 1. Explicit global CDNs
    for (const p of GLOBAL_HOST_PATTERNS) {
      if (p.test(host)) return 'global';
    }

    // 2. Explicit BDIX domains
    for (const p of BDIX_HOST_PATTERNS) {
      if (p.test(host)) return 'bdix';
    }

    // 3. Raw BDIX IPs
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
      for (const p of BDIX_IP_PATTERNS) {
        if (p.test(host)) return 'bdix';
      }
    }

    // Default to global (conservative: if we don't know it's BDIX, we attempt
    // to validate it on Tier 1. If it times out, it naturally fails validation).
    return 'global';
  } catch {
    return 'global'; // malformed URL will fail validation anyway
  }
}
