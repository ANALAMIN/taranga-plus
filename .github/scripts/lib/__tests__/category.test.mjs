import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapCategory } from '../category.mjs';

test('sports source is always sports', () => {
  assert.equal(mapCategory(undefined, 'iptv-org-sports'), 'sports');
});

test('group-title with sport → sports', () => {
  assert.equal(mapCategory('Sports', 'src'), 'sports');
});

test('Discovery / NatGeo keywords → documentary', () => {
  assert.equal(mapCategory('Entertainment', 'src', 'Discovery Channel'), 'documentary');
  assert.equal(mapCategory('Entertainment', 'src', 'NatGeo Wild'), 'documentary');
  assert.equal(mapCategory(undefined, 'src', 'National Geographic HD'), 'documentary');
  assert.equal(mapCategory(undefined, 'src', 'Animal Planet'), 'documentary');
});

test('movie/cinema/film → movies', () => {
  assert.equal(mapCategory('Movies', 'src', 'HBO'), 'movies');
  assert.equal(mapCategory('Cinema', 'src', 'Sony Pix'), 'movies');
});

test('music/gaan → music', () => {
  assert.equal(mapCategory('Music', 'src', 'MTV'), 'music');
  assert.equal(mapCategory(undefined, 'src', 'Gaan Bangla'), 'music');
});

test('kids keywords → kids', () => {
  assert.equal(mapCategory('Kids', 'src', 'Cartoon Network'), 'kids');
  assert.equal(mapCategory(undefined, 'src', 'Duronto TV'), 'kids');
});

test('entertainment/general → entertainment', () => {
  assert.equal(mapCategory('Entertainment', 'src', 'Star Plus'), 'entertainment');
});

test('news/bangla with no other signal → all', () => {
  assert.equal(mapCategory('News', 'src', 'Somoy News'), 'all');
});

test('unknown → all', () => {
  assert.equal(mapCategory(undefined, 'src', 'Mystery Channel'), 'all');
});
