import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyHost, SOURCES } from '../sources.mjs';

test('global CDN hosts classify as global', () => {
  assert.equal(classifyHost('https://z5amshls.akamaized.net/x.m3u8'), 'global');
  assert.equal(classifyHost('https://d1fi19tywmn14b.cloudfront.net/x.m3u8'), 'global');
  assert.equal(classifyHost('https://nicls1-lh.akamaihd.net/x.m3u8'), 'global');
  assert.equal(classifyHost('https://jiocgehub.jio.ril.com/x.m3u8'), 'global');
  assert.equal(classifyHost('https://iptv-org.github.io/x.m3u'), 'global');
  // BD-specific global CDNs
  assert.equal(classifyHost('https://owrcovcrpy.gpcdn.net/bpk-tv/1701/output/index.m3u8'), 'global');
  assert.equal(classifyHost('https://amg01448-samsungin-news18bangla-samsungin-ad-qy.amagi.tv/playlist.m3u8'), 'global');
});

test('BDIX hosts classify as bdix', () => {
  assert.equal(classifyHost('http://itpolly.iptv.digijadoo.net/x.m3u8'), 'bdix');
  assert.equal(classifyHost('http://iptv.kitv.live/x.m3u8'), 'bdix');
  assert.equal(classifyHost('http://appcdn.jagobd.com/x.m3u8'), 'bdix');
  assert.equal(classifyHost('http://103.205.133.14:8080/x.m3u8'), 'bdix');
});

test('unknown public domain defaults to global (conservative — let validation decide)', () => {
  assert.equal(classifyHost('https://some-unknown-cdn.com/x.m3u8'), 'global');
});

test('SOURCES registry: all entries are global tier with ids+urls', () => {
  assert.ok(SOURCES.length >= 10, 'expected at least 10 sources');
  for (const s of SOURCES) {
    assert.ok(s.id, 'source missing id');
    assert.ok(s.url, `source ${s.id} missing url`);
    assert.ok(s.tier === 'global' || s.tier === 'bdix', `source ${s.id} bad tier`);
  }
  const globalCount = SOURCES.filter(s => s.tier === 'global').length;
  assert.ok(globalCount >= 10, 'expected ≥10 global sources');
  // BD-focused sources present
  assert.ok(SOURCES.find(s => s.id === 'mrgify-bd'), 'mrgify-bd source missing');
  assert.ok(SOURCES.find(s => s.id === 'imshakil-tvlink'), 'imshakil-tvlink source missing');
});
