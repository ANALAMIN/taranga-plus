import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReport } from '../report.mjs';

test('buildReport renders counts and per-reason dead breakdown', () => {
  const stats = {
    raw: 4000,
    secretRejected: 5,
    languageRejected: 300,
    geoFiltered: 200,
    dead: { 'segment status 404': 150, 'manifest status 403': 80, 'timeout': 40 },
    alive: 3225,
    final: 280,
  };
  const out = buildReport(stats);
  assert.match(out, /Raw channels:\s+4000/);
  assert.match(out, /Secret URLs rejected:\s+5/);
  assert.match(out, /Language-filtered:\s+300/);
  assert.match(out, /Geo-filtered:\s+200/);
  assert.match(out, /Alive:\s+3225/);
  assert.match(out, /Final after dedup:\s+280/);
  assert.match(out, /segment status 404: 150/);
  assert.match(out, /timeout: 40/);
});
