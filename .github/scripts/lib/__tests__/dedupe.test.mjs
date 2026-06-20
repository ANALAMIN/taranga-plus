import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeName, pickBestRoutes } from '../dedupe.mjs';

test('normalizeName lowercases and strips HD/FHD/4K/TV tags', () => {
  assert.equal(normalizeName('Sony Ten 1 HD'), 'sony ten 1');
  assert.equal(normalizeName('STAR PLUS FHD'), 'star plus');
  assert.equal(normalizeName('ATN News 4K TV'), 'atn news');
});

test('normalizeName preserves Bengali Unicode', () => {
  assert.equal(normalizeName('এটিএন নিউজ'), 'এটিএন নিউজ');
});

test('pickBestRoutes: one entry per name, sources sorted by latency', async () => {
  const validated = [
    { name: 'Sony Ten 1', url: 'https://a/s.m3u8', latencyMs: 500, language: 'en', tier: 'global', sourceId: 's1', category: 'sports', logo: 'l1' },
    { name: 'Sony Ten 1 HD', url: 'https://b/s.m3u8', latencyMs: 200, language: 'en', tier: 'global', sourceId: 's2', category: 'sports', logo: 'l2' },
    { name: 'Sony Ten 1', url: 'https://c/s.m3u8', latencyMs: 800, language: 'en', tier: 'global', sourceId: 's3', category: 'sports', logo: 'l3' },
  ];
  const result = await pickBestRoutes(validated);
  assert.equal(result.length, 1);
  const [entry] = result;
  assert.equal(entry.name, 'Sony Ten 1 HD');         // fastest source's display name kept
  assert.equal(entry.streamUrl, 'https://b/s.m3u8'); // fastest URL is primary
  assert.deepEqual(entry.sources, ['https://b/s.m3u8', 'https://a/s.m3u8', 'https://c/s.m3u8']);
  assert.equal(entry.latencyMs, 200);             // primary's latency
});

test('pickBestRoutes: dedupes identical URLs across sources', async () => {
  const validated = [
    { name: 'GTV', url: 'https://x/g.m3u8', latencyMs: 300, language: 'bn', tier: 'global', sourceId: 's1', category: 'sports', logo: '' },
    { name: 'GTV', url: 'https://x/g.m3u8', latencyMs: 300, language: 'bn', tier: 'global', sourceId: 's2', category: 'sports', logo: '' },
  ];
  const [entry] = await pickBestRoutes(validated);
  assert.deepEqual(entry.sources, ['https://x/g.m3u8']); // no duplicate
});

test('pickBestRoutes: stamps lastValidated as ISO string', async () => {
  const validated = [{ name: 'BBC', url: 'https://b/m.m3u8', latencyMs: 100, language: 'en', tier: 'global', sourceId: 's', category: 'all', logo: '' }];
  const [entry] = await pickBestRoutes(validated);
  assert.equal(typeof entry.lastValidated, 'string');
  assert.ok(!isNaN(Date.parse(entry.lastValidated)), 'lastValidated is a valid date');
});
