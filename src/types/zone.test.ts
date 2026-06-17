import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_ZONES, zoneIndex, zoneModifier } from './zone.js';

test('zoneIndex maps row-major and stays unique across all 25 zones', () => {
  const indices = ALL_ZONES.map(zoneIndex);
  assert.equal(new Set(indices).size, 25);
  assert.ok(indices.every((i) => i >= 0 && i <= 24));
  assert.equal(zoneIndex({ row: 0, col: 0 }), 0);
  assert.equal(zoneIndex({ row: 2, col: 2 }), 12);
  assert.equal(zoneIndex({ row: 4, col: 4 }), 24);
});

test('zoneModifier returns 0 for an undefined profile', () => {
  assert.equal(zoneModifier(undefined, { row: 2, col: 2 }), 0);
});

test('zoneModifier looks up the entry at the zone\'s flat index', () => {
  const profile = ALL_ZONES.map((_, i) => i);
  assert.equal(zoneModifier(profile, { row: 0, col: 0 }), 0);
  assert.equal(zoneModifier(profile, { row: 2, col: 2 }), 12);
  assert.equal(zoneModifier(profile, { row: 4, col: 4 }), 24);
});

test('zoneModifier defaults to 0 for an out-of-range profile', () => {
  assert.equal(zoneModifier([], { row: 2, col: 2 }), 0);
});
