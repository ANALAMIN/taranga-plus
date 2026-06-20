import { test } from 'node:test';
import assert from 'node:assert/strict';
import { looksLikeSecretUrl } from '../secrets.mjs';

test('rejects JWT-shaped query value', () => {
  const url = 'https://cdn.example.com/s.m3u8?token=eyJhbGciOi.eyJzdWIiOiIx.SflKxwRJ';
  assert.equal(looksLikeSecretUrl(url), true);
});

test('rejects akes/token/key/sig query keys', () => {
  assert.equal(looksLikeSecretUrl('https://x/s.m3u8?akes=abc'), true);
  assert.equal(looksLikeSecretUrl('https://x/s.m3u8?mytoken=abc'), true);
  assert.equal(looksLikeSecretUrl('https://x/s.m3u8?apikey=abc'), true);
  assert.equal(looksLikeSecretUrl('https://x/s.m3u8?sig=abc'), true);
});

test('allows a clean URL with no secrets', () => {
  assert.equal(looksLikeSecretUrl('https://cdn.example.com/sony.m3u8'), false);
  assert.equal(looksLikeSecretUrl('http://103.205.133.14:8080/live/1.m3u8'), false);
});

test('allows non-secret query params', () => {
  assert.equal(looksLikeSecretUrl('https://x/s.m3u8?quality=720p&cdn=us'), false);
});

test('returns false on invalid URL strings', () => {
  assert.equal(looksLikeSecretUrl('not-a-url'), false);
});
