import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseM3U } from '../m3u.mjs';

const SAMPLE = `#EXTM3U
#EXTINF:-1 tvg-logo="https://img/x.png" group-title="Sports",Sony Ten 1
http://example.com/sony.m3u8
#EXTINF:-1 tvg-logo="https://img/y.png" group-title="News",Somoy TV
https://cdn.example.com/somoy.m3u8
#EXTINF:-1 tvg-language="ben" tvg-country="BD",ATN News
http://bdix/113.m3u8
`;

test('parseM3U extracts name, url, logo, category, language, country', () => {
  const channels = parseM3U(SAMPLE, 'src1');
  assert.equal(channels.length, 3);

  // Channel 0: logo + category set, no language/country keys (parser only
  // sets a key when the attribute is present).
  assert.equal(channels[0].sourceId, 'src1');
  assert.equal(channels[0].logo, 'https://img/x.png');
  assert.equal(channels[0].category, 'Sports');
  assert.equal(channels[0].language, undefined);
  assert.equal(channels[0].country, undefined);
  assert.equal(channels[0].name, 'Sony Ten 1');
  assert.equal(channels[0].url, 'http://example.com/sony.m3u8');

  // Channel 2: tvg-language and tvg-country attributes parsed.
  assert.equal(channels[2].language, 'ben');
  assert.equal(channels[2].country, 'BD');
  assert.equal(channels[2].name, 'ATN News');
});

test('parseM3U skips URL lines without a preceding EXTINF', () => {
  const noExtInf = '#EXTM3U\nhttp://orphan.m3u8\n';
  assert.deepEqual(parseM3U(noExtInf, 's'), []);
});

test('parseM3U handles missing logo and category gracefully', () => {
  const minimal = '#EXTINF:-1,Bare Channel\nhttp://x/y.m3u8\n';
  const [ch] = parseM3U(minimal, 's');
  assert.equal(ch.logo, undefined);
  assert.equal(ch.category, undefined);
  assert.equal(ch.name, 'Bare Channel');
});
