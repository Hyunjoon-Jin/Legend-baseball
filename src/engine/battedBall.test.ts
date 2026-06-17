import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateBattedBall } from './battedBall.js';
import { sampleBatter, samplePitcher, sampleSituation } from '../data/samplePlayers.js';
import { zoneIndex, type ZoneLocation } from '../types/zone.js';
import type { SelectedPitch } from './pitchSelection.js';

function mulberry32(seed: number) {
  return function rng() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pitchAt(zone: ZoneLocation): SelectedPitch {
  return { pitchType: 'fourSeam', entry: samplePitcher.repertoire[0], zone, velocity: 145, effectiveControl: 60 };
}

test('a hot zone produces higher exit velocity than a cold zone on the same pitch, all else equal', () => {
  const zone: ZoneLocation = { row: 2, col: 2 };
  const index = zoneIndex(zone);

  const hotProfile = new Array(25).fill(0);
  hotProfile[index] = 10;
  const hotBatter = { ...sampleBatter, zoneProfile: hotProfile };

  const coldProfile = new Array(25).fill(0);
  coldProfile[index] = -10;
  const coldBatter = { ...sampleBatter, zoneProfile: coldProfile };

  // Same seed for both calls: the rng draws consumed before/around exit
  // velocity are identical, so any difference is exactly the zone bonus.
  const hotResult = generateBattedBall(hotBatter, samplePitcher, pitchAt(zone), sampleSituation, mulberry32(1));
  const coldResult = generateBattedBall(coldBatter, samplePitcher, pitchAt(zone), sampleSituation, mulberry32(1));

  assert.ok(
    hotResult.exitVelocity > coldResult.exitVelocity,
    `expected hot-zone exit velocity (${hotResult.exitVelocity}) > cold-zone (${coldResult.exitVelocity})`,
  );
  // (10 - (-10)) * 0.6 = 12, modulo floating-point noise from summing in a different order.
  assert.ok(Math.abs(hotResult.exitVelocity - coldResult.exitVelocity - 12) < 1e-9);
});

test('an undefined zoneProfile behaves identically to an all-zero profile', () => {
  const zone: ZoneLocation = { row: 1, col: 3 };
  const zeroProfile = new Array(25).fill(0);
  const batterWithZeroProfile = { ...sampleBatter, zoneProfile: zeroProfile };

  const withProfile = generateBattedBall(batterWithZeroProfile, samplePitcher, pitchAt(zone), sampleSituation, mulberry32(2));
  const withoutProfile = generateBattedBall(sampleBatter, samplePitcher, pitchAt(zone), sampleSituation, mulberry32(2));

  assert.deepEqual(withProfile, withoutProfile);
});
