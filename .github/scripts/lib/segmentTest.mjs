/**
 * Segment integrity test (spec §5.1 step 6).
 *
 * `resolveSegmentUrl` is pure and fully unit-tested. `testSegment` performs
 * the network fetch and is testable via an injected fetcher.
 */

const MEDIA_SEG_RE = /^#EXTINF:.*,\s*$/m;

/**
 * Given a manifest body and its base URL, return the URL of the segment to
 * actually fetch for the integrity test.
 *
 * - If the manifest is a master playlist (has #EXT-X-STREAM-INF), resolve the
 *   LOWEST-bandwidth variant URL (deterministic, cheapest).
 *   NOTE: that variant URL is a *media playlist*, not a segment. The caller
 *   must fetch it and call resolveSegmentUrl again. This function returns the
 *   next URL to fetch; if it's a media playlist the caller recurses once.
 * - If the manifest is a media playlist, return the first #EXTINF segment URL.
 * - Returns null if the content is not a valid playlist.
 *
 * @param {string} manifest
 * @param {string} baseUrl
 * @returns {string|null}
 */
export function resolveSegmentUrl(manifest, baseUrl) {
  if (!manifest || !manifest.trimStart().startsWith('#EXTM3U')) return null;

  // Master playlist?
  if (manifest.includes('#EXT-X-STREAM-INF')) {
    const lines = manifest.split('\n');
    let best = null; // {bandwidth, url}
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('#EXT-X-STREAM-INF:')) {
        const bwMatch = line.match(/BANDWIDTH=(\d+)/);
        const bandwidth = bwMatch ? parseInt(bwMatch[1], 10) : Infinity;
        // The next non-empty, non-comment line is the variant URL.
        const next = (lines[i + 1] || '').trim();
        if (next && !next.startsWith('#')) {
          if (!best || bandwidth < best.bandwidth) {
            best = { bandwidth, url: next };
          }
        }
      }
    }
    return best ? resolveUrl(best.url, baseUrl) : null;
  }

  // Media playlist: first segment after an #EXTINF.
  const lines = manifest.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('#EXTINF')) {
      const next = (lines[i + 1] || '').trim();
      if (next && !next.startsWith('#')) {
        return resolveUrl(next, baseUrl);
      }
    }
  }
  return null;
}

/** Resolve a possibly-relative URL against a base. Returns null on bad input. */
function resolveUrl(maybeRelative, base) {
  try {
    return new URL(maybeRelative, base).href;
  } catch {
    return null;
  }
}

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
// Per-request timeout (manifest / media-playlist / segment individually).
const SEGMENT_TIMEOUT_MS = 6000;
// Hard ceiling for the entire testSegment call (3 fetches × 6s + slack).
const TOTAL_TIMEOUT_MS = 20000;

const MEDIA_CONTENT_TYPES = ['mpegurl', 'x-mpegurl', 'apple', 'video/', 'octet-stream', 'dash', 'xml'];

/** Safely extract an error message from any thrown value, including DOMException. */
function errMsg(e) {
  if (e && typeof e.message === 'string') return e.message;
  if (e && typeof e.name === 'string') return e.name;
  return String(e);
}

/**
 * Fetch the manifest, then if it's a master playlist recurse one level into
 * the lowest-bandwidth media playlist, then fetch the first segment and verify
 * it returns media bytes.
 *
 * A single AbortController with a hard total-timeout guards the whole call so
 * no individual fetch can stall indefinitely even if AbortSignal.timeout()
 * fails to fire (observed DOMException TimeoutError escaping inner catch in
 * some Node 22 builds).
 *
 * @param {string} manifestUrl
 * @param {(url: string, opts?: object) => Promise<{ok, status, headers:{get}, text}>} [fetcher]
 *        Defaults to global fetch. Injected in tests.
 * @returns {Promise<{ok: boolean, latencyMs: number, reason?: string}>}
 */
export async function testSegment(manifestUrl, fetcher = globalThis.fetch) {
  const start = Date.now();
  const controller = new AbortController();
  const killTimer = setTimeout(() => controller.abort('total-timeout'), TOTAL_TIMEOUT_MS);

  /** Merge a per-step AbortSignal with the global controller. */
  function makeSignal() {
    return AbortSignal.any
      ? AbortSignal.any([controller.signal, AbortSignal.timeout(SEGMENT_TIMEOUT_MS)])
      : controller.signal;
  }

  try {
    // ── Step 1: fetch manifest ────────────────────────────────────
    let res;
    try {
      res = await fetcher(manifestUrl, {
        method: 'GET',
        headers: { 'User-Agent': BROWSER_UA, 'Range': 'bytes=0-4095' },
        signal: makeSignal(),
      });
    } catch (e) {
      return { ok: false, latencyMs: Date.now() - start, reason: `manifest fetch error: ${errMsg(e)}` };
    }

    if (!res.ok) {
      return { ok: false, latencyMs: Date.now() - start, reason: `manifest status ${res.status}` };
    }

    let manifestBody;
    try { manifestBody = await res.text(); } catch (e) {
      return { ok: false, latencyMs: Date.now() - start, reason: `manifest read error: ${errMsg(e)}` };
    }

    let segmentUrl = resolveSegmentUrl(manifestBody, manifestUrl);

    // ── Step 2: master → media playlist ──────────────────────────
    if (manifestBody.includes('#EXT-X-STREAM-INF') && segmentUrl) {
      let mediaRes;
      try {
        mediaRes = await fetcher(segmentUrl, {
          method: 'GET',
          headers: { 'User-Agent': BROWSER_UA, 'Range': 'bytes=0-4095' },
          signal: makeSignal(),
        });
      } catch (e) {
        return { ok: false, latencyMs: Date.now() - start, reason: `media playlist fetch error: ${errMsg(e)}` };
      }
      if (!mediaRes.ok) {
        return { ok: false, latencyMs: Date.now() - start, reason: `media playlist status ${mediaRes.status}` };
      }
      let mediaBody;
      try { mediaBody = await mediaRes.text(); } catch (e) {
        return { ok: false, latencyMs: Date.now() - start, reason: `media playlist read error: ${errMsg(e)}` };
      }
      segmentUrl = resolveSegmentUrl(mediaBody, segmentUrl);
    }

    if (!segmentUrl) {
      return { ok: false, latencyMs: Date.now() - start, reason: 'no segment URL resolvable' };
    }

    // ── Step 3: segment bytes ─────────────────────────────────────
    let segRes;
    try {
      segRes = await fetcher(segmentUrl, {
        method: 'GET',
        headers: { 'User-Agent': BROWSER_UA, 'Range': 'bytes=0-65535' },
        signal: makeSignal(),
      });
    } catch (e) {
      return { ok: false, latencyMs: Date.now() - start, reason: `segment fetch error: ${errMsg(e)}` };
    }

    if (!segRes.ok) {
      return { ok: false, latencyMs: Date.now() - start, reason: `segment status ${segRes.status}` };
    }
    const ct = (segRes.headers.get('content-type') || '').toLowerCase();
    const isMedia = MEDIA_CONTENT_TYPES.some((t) => ct.includes(t));
    if (!isMedia) {
      return { ok: false, latencyMs: Date.now() - start, reason: `segment content-type ${ct || '(none)'}` };
    }

    return { ok: true, latencyMs: Date.now() - start };

  } catch (e) {
    // Last-resort catch — should never be needed but prevents process crash.
    return { ok: false, latencyMs: Date.now() - start, reason: `unexpected: ${errMsg(e)}` };
  } finally {
    clearTimeout(killTimer);
    controller.abort(); // release the controller; no-op if already aborted
  }
}
