import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSegmentUrl, testSegment } from '../segmentTest.mjs';

const MASTER = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720
720p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360
360p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1500000,RESOLUTION=854x480
480p.m3u8
`;

const MEDIA = `#EXTM3U
#EXT-X-TARGETDURATION:6
#EXTINF:6.0,
segment_1.ts
#EXTINF:6.0,
segment_2.ts
#EXT-X-ENDLIST
`;

test('master playlist: picks lowest-bandwidth variant', () => {
  const seg = resolveSegmentUrl(MASTER, 'https://cdn.example.com/live/master.m3u8');
  assert.equal(seg, 'https://cdn.example.com/live/360p.m3u8');
});

test('media playlist: returns first segment URL', () => {
  const seg = resolveSegmentUrl(MEDIA, 'https://cdn.example.com/live/360p.m3u8');
  assert.equal(seg, 'https://cdn.example.com/live/segment_1.ts');
});

test('media playlist with absolute segment URL passes through', () => {
  const media = '#EXTM3U\n#EXTINF:6.0,\nhttps://other.cdn/seg.ts\n';
  const seg = resolveSegmentUrl(media, 'https://cdn.example.com/x.m3u8');
  assert.equal(seg, 'https://other.cdn/seg.ts');
});

test('non-M3U3 content returns null', () => {
  assert.equal(resolveSegmentUrl('<html>not a playlist</html>', 'https://x/'), null);
  assert.equal(resolveSegmentUrl('', 'https://x/'), null);
});

// A fetcher that returns scripted responses per-URL. Lets us drive the
// master→media→segment chain without the network.
function makeFakeFetcher(routes) {
  return async (url, opts) => {
    const r = routes[url];
    if (!r) {
      const err = new Error('not found: ' + url);
      err.status = 404;
      throw err;
    }
    return {
      ok: (r.status >= 200 && r.status < 300) || r.status === 206,
      status: r.status,
      headers: { get: (k) => (k.toLowerCase() === 'content-type' ? r.contentType : null) },
      text: async () => r.body,
    };
  };
}

test('testSegment: happy path through master→media→segment', async () => {
  const master = 'https://cdn/live.m3u8';
  const media = 'https://cdn/360p.m3u8';
  const seg = 'https://cdn/segment_1.ts';
  const fetcher = makeFakeFetcher({
    [master]: { status: 200, contentType: 'application/vnd.apple.mpegurl', body: MASTER },
    [media]: { status: 200, contentType: 'application/vnd.apple.mpegurl', body: MEDIA },
    [seg]:    { status: 206, contentType: 'video/mp2t', body: '\x00\x00\x01' },
  });
  const result = await testSegment(master, fetcher);
  assert.equal(result.ok, true);
  assert.ok(result.latencyMs >= 0);
});

test('testSegment: dead segment (404) fails', async () => {
  const media = 'https://cdn/x.m3u8';
  const fetcher = makeFakeFetcher({
    [media]: { status: 200, contentType: 'application/vnd.apple.mpegurl', body: MEDIA },
    // segment_1.ts → not in routes → 404
  });
  const result = await testSegment(media, fetcher);
  assert.equal(result.ok, false);
  assert.match(result.reason, /segment/i);
});

test('testSegment: manifest 403 fails fast', async () => {
  const fetcher = makeFakeFetcher({
    'https://cdn/x.m3u8': { status: 403, contentType: 'text/html', body: 'forbidden' },
  });
  const result = await testSegment('https://cdn/x.m3u8', fetcher);
  assert.equal(result.ok, false);
  assert.match(result.reason, /status/i);
});
