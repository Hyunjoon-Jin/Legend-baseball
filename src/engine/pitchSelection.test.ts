import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectPitchLocation } from './pitchSelection.js';
import { samplePitcher, sampleSituation } from '../data/samplePlayers.js';
import { distanceFromCenter } from '../types/zone.js';
import type { GameSituation } from '../types/situation.js';

function mulberry32(seed: number) {
  return function rng() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('selectPitchLocation nibbles further from center when the on-deck batter is weak than when he is dangerous', () => {
  const entry = samplePitcher.repertoire[0];
  // balls=1/strikes=1 has zero strike pressure, isolating the "lineup protection" effect.
  const weakOnDeckSituation: GameSituation = { ...sampleSituation, balls: 1, strikes: 1, onDeckThreat: 10 };
  const strongOnDeckSituation: GameSituation = { ...sampleSituation, balls: 1, strikes: 1, onDeckThreat: 90 };

  const rngWeak = mulberry32(1);
  const rngStrong = mulberry32(1);

  let weakTotal = 0;
  let strongTotal = 0;
  const trials = 500;
  for (let i = 0; i < trials; i++) {
    weakTotal += distanceFromCenter(selectPitchLocation(samplePitcher, entry, weakOnDeckSituation, rngWeak).zone);
    strongTotal += distanceFromCenter(selectPitchLocation(samplePitcher, entry, strongOnDeckSituation, rngStrong).zone);
  }

  const weakAvg = weakTotal / trials;
  const strongAvg = strongTotal / trials;
  assert.ok(weakAvg > strongAvg, `expected weak on-deck avg distance (${weakAvg}) > strong on-deck avg distance (${strongAvg})`);
});

test('omitting onDeckThreat behaves identically to passing the neutral default of 50', () => {
  const entry = samplePitcher.repertoire[0];
  const omitted: GameSituation = { ...sampleSituation, balls: 1, strikes: 1 };
  const explicitNeutral: GameSituation = { ...sampleSituation, balls: 1, strikes: 1, onDeckThreat: 50 };

  const withDefault = selectPitchLocation(samplePitcher, entry, omitted, mulberry32(2));
  const withExplicitNeutral = selectPitchLocation(samplePitcher, entry, explicitNeutral, mulberry32(2));
  assert.deepEqual(withDefault, withExplicitNeutral);
});
