import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectLanguage, isLanguageAllowed } from '../language.mjs';

test('tvg-language attribute wins when present', () => {
  assert.equal(detectLanguage({ language: 'ben', name: 'Foo' }), 'bn');
  assert.equal(detectLanguage({ language: 'hin', name: 'Foo' }), 'hi');
  assert.equal(detectLanguage({ language: 'eng', name: 'Foo' }), 'en');
  assert.equal(detectLanguage({ language: 'urd', name: 'Foo' }), 'ur');
});

test('tvg-language attribute with multi-value prefers first allowed', () => {
  assert.equal(detectLanguage({ language: 'ben;eng', name: 'ATN' }), 'bn');
});

test('Bengali Unicode name → bn', () => {
  assert.equal(detectLanguage({ name: 'এটিএন নিউজ' }), 'bn');
});

test('Tamil Unicode name → rejected language', () => {
  // Tamil U+0B80-U+0BFF
  assert.equal(detectLanguage({ name: 'சன் டிவி' }), 'tam');
});

test('Telugu/Malayalam Unicode names → rejected', () => {
  assert.equal(detectLanguage({ name: 'జెమిని' }), 'tel'); // Telugu U+0C00-U+0C7F
  assert.equal(detectLanguage({ name: 'ഏഷ്യനെറ്റ്' }), 'mal'); // Malayalam U+0D00-U+0D7F
});

test('Latin keywords map correctly', () => {
  assert.equal(detectLanguage({ name: 'DD National' }), 'hi');
  assert.equal(detectLanguage({ name: 'BBC World News' }), 'en');
  assert.equal(detectLanguage({ name: 'Geo News' }), 'ur');
  assert.equal(detectLanguage({ name: 'ARY Digital' }), 'ur');
});

test('isLanguageAllowed keeps bn/hi/en/ur, drops others', () => {
  assert.equal(isLanguageAllowed('bn'), true);
  assert.equal(isLanguageAllowed('hi'), true);
  assert.equal(isLanguageAllowed('en'), true);
  assert.equal(isLanguageAllowed('ur'), true);
  assert.equal(isLanguageAllowed('tam'), false);
  assert.equal(isLanguageAllowed('tel'), false);
  assert.equal(isLanguageAllowed('mal'), false);
});
