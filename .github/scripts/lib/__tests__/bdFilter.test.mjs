import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isLikelyGeoBlockedFromBd } from '../bdFilter.mjs';

test('global-CDN channels are kept regardless of declared country', () => {
  assert.equal(isLikelyGeoBlockedFromBd({ url: 'https://x.akamaihd.net/s.m3u8', country: 'US' }), false);
  assert.equal(isLikelyGeoBlockedFromBd({ url: 'https://d.cloudfront.net/s.m3u8', country: 'FR' }), false);
});

test('BD/IN/SAARC countries are kept', () => {
  assert.equal(isLikelyGeoBlockedFromBd({ url: 'http://103.1.2.3/s.m3u8', country: 'BD' }), false);
  assert.equal(isLikelyGeoBlockedFromBd({ url: 'http://x/s.m3u8', country: 'IN' }), false);
  assert.equal(isLikelyGeoBlockedFromBd({ url: 'http://x/s.m3u8', country: 'PK' }), false);
});

test('unknown non-target country on non-CDN host → blocked', () => {
  assert.equal(isLikelyGeoBlockedFromBd({ url: 'http://some-fr-local-affiliate.com/s.m3u8', country: 'FR' }), true);
  assert.equal(isLikelyGeoBlockedFromBd({ url: 'http://eu-regional.tv/s.m3u8', country: 'DE' }), true);
});

test('missing country → kept (conservative)', () => {
  assert.equal(isLikelyGeoBlockedFromBd({ url: 'http://x/s.m3u8', country: undefined }), false);
});
