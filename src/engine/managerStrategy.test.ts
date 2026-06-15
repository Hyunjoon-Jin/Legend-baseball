import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateLeverage,
  decidePitchingChange,
  selectReliever,
  decidePinchHitter,
  decidePinchRunner,
} from './managerStrategy.js';
import { sampleSituation, samplePitcher, sampleBullpenA, sampleBenchA, sampleLineupA } from '../data/samplePlayers.js';
import type { GameSituation } from '../types/situation.js';
import type { BatterAttributes } from '../types/player.js';
import type { RunnerOnBase } from '../types/baserunning.js';

function mulberry32(seed: number) {
  return function rng() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function situation(overrides: Partial<GameSituation> = {}): GameSituation {
  return { ...sampleSituation, ...overrides };
}

const runnerOn = (speed: number): RunnerOnBase => ({ runnerId: 'r', speed, stealRating: speed, baserunningAggressiveness: speed });

// ---------------------------------------------------------------------------
// calculateLeverage
// ---------------------------------------------------------------------------

test('calculateLeverage is low early in a lopsided game with no RISP', () => {
  const leverage = calculateLeverage(situation({ inning: 1, scoreDiff: 8, runners: {} }));
  assert.ok(leverage < 0.2);
});

test('calculateLeverage is high late in a close game with a runner in scoring position', () => {
  const leverage = calculateLeverage(situation({ inning: 9, scoreDiff: 1, runners: { second: runnerOn(50) } }));
  assert.ok(leverage > 0.7);
});

test('calculateLeverage stays within [0, 1] across a wide range of situations', () => {
  for (let inning = 1; inning <= 15; inning++) {
    for (const scoreDiff of [-10, -3, 0, 3, 10]) {
      for (const runners of [{}, { second: runnerOn(50) }, { second: runnerOn(50), third: runnerOn(50) }]) {
        const leverage = calculateLeverage(situation({ inning, scoreDiff, runners }));
        assert.ok(leverage >= 0 && leverage <= 1);
      }
    }
  }
});

// ---------------------------------------------------------------------------
// decidePitchingChange
// ---------------------------------------------------------------------------

test('decidePitchingChange never pulls the pitcher when no bullpen is available', () => {
  const rng = mulberry32(1);
  for (let i = 0; i < 20; i++) {
    assert.equal(decidePitchingChange(samplePitcher, 130, false, situation({ inning: 9, scoreDiff: 1 }), rng), false);
  }
});

test('decidePitchingChange always pulls an exhausted starter once a bullpen is available', () => {
  const rng = mulberry32(2);
  for (let i = 0; i < 20; i++) {
    assert.equal(decidePitchingChange(samplePitcher, 120, true, situation({ inning: 6, scoreDiff: 0 }), rng), true);
  }
});

test('decidePitchingChange leaves a fresh starter in during an early, low-pitch-count spot', () => {
  const rng = mulberry32(3);
  for (let i = 0; i < 20; i++) {
    assert.equal(decidePitchingChange(samplePitcher, 20, true, situation({ inning: 1, scoreDiff: 0 }), rng), false);
  }
});

test('decidePitchingChange frequently lifts a non-closer for a fresh arm in a 9th-inning save situation', () => {
  const rng = mulberry32(4);
  const trials = 200;
  let changes = 0;
  for (let i = 0; i < trials; i++) {
    if (decidePitchingChange(samplePitcher, 50, true, situation({ inning: 9, scoreDiff: 2 }), rng)) changes++;
  }
  // The save-situation quick hook fires with ~60% probability per attempt.
  assert.ok(changes > trials * 0.4, `expected >40% quick hooks, got ${changes}/${trials}`);
});

// ---------------------------------------------------------------------------
// selectReliever
// ---------------------------------------------------------------------------

test('selectReliever returns undefined for an empty bullpen', () => {
  assert.equal(selectReliever([], situation({ inning: 9, scoreDiff: 1, runners: {} })), undefined);
});

test('selectReliever prefers the closer in a save situation', () => {
  const reliever = selectReliever(sampleBullpenA, situation({ inning: 9, scoreDiff: 2, runners: {} }));
  assert.equal(reliever?.role, 'closer');
});

test('selectReliever prefers the setup man in the 7th/8th when it is not a save situation', () => {
  const reliever = selectReliever(sampleBullpenA, situation({ inning: 7, scoreDiff: 5, runners: {} }));
  assert.equal(reliever?.role, 'setup');
});

test('selectReliever falls back to long relief earlier in the game', () => {
  const reliever = selectReliever(sampleBullpenA, situation({ inning: 4, scoreDiff: 0, runners: {} }));
  assert.equal(reliever?.role, 'longRelief');
});

test('selectReliever falls back to the highest-stuff arm when no role matches', () => {
  const bullpenWithoutRoles = sampleBullpenA.map(({ role, ...rest }) => rest);
  const reliever = selectReliever(bullpenWithoutRoles, situation({ inning: 9, scoreDiff: 2, runners: {} }));
  const best = [...bullpenWithoutRoles].sort((a, b) => b.stuff - a.stuff)[0];
  assert.equal(reliever?.id, best.id);
});

// ---------------------------------------------------------------------------
// decidePinchHitter
// ---------------------------------------------------------------------------

test('decidePinchHitter does nothing before the 6th inning, even with a strong platoon edge', () => {
  const rng = mulberry32(5);
  const batter = sampleLineupA[6]; // contactVsRight 52 vs samplePitcher (R); sampleBenchA[0] offers +26
  const sit = situation({ inning: 5, scoreDiff: 1, runners: { second: runnerOn(50), third: runnerOn(50) } });
  for (let i = 0; i < 20; i++) {
    assert.equal(decidePinchHitter(batter, sampleBenchA, samplePitcher, sit, rng), undefined);
  }
});

test('decidePinchHitter does nothing when leverage is too low, even with a platoon edge', () => {
  const rng = mulberry32(6);
  const batter = sampleLineupA[6];
  const sit = situation({ inning: 6, scoreDiff: 10, runners: {} });
  for (let i = 0; i < 20; i++) {
    assert.equal(decidePinchHitter(batter, sampleBenchA, samplePitcher, sit, rng), undefined);
  }
});

test('decidePinchHitter does nothing when no bench bat offers a meaningful platoon gain', () => {
  const rng = mulberry32(7);
  const batter: BatterAttributes = { ...sampleLineupA[1], contactVsRight: 75 }; // gain to sampleBenchA[0] (78) is only 3
  const sit = situation({ inning: 8, scoreDiff: 1, runners: { second: runnerOn(50) } });
  for (let i = 0; i < 20; i++) {
    assert.equal(decidePinchHitter(batter, sampleBenchA, samplePitcher, sit, rng), undefined);
  }
});

test('decidePinchHitter sends up the platoon bat in high-leverage spots with a large contact gain', () => {
  const rng = mulberry32(8);
  const batter = sampleLineupA[6]; // contactVsRight 52, sampleBenchA[0] offers +26
  const sit = situation({
    inning: 9,
    scoreDiff: 1,
    runners: { second: runnerOn(50), third: runnerOn(50) },
  });

  let pinchHits = 0;
  for (let i = 0; i < 200; i++) {
    const result = decidePinchHitter(batter, sampleBenchA, samplePitcher, sit, rng);
    if (result) {
      assert.equal(result.id, sampleBenchA[0].id);
      pinchHits++;
    }
  }
  assert.ok(pinchHits > 0, 'expected at least one pinch hitter across 200 high-leverage attempts');
});

// ---------------------------------------------------------------------------
// decidePinchRunner
// ---------------------------------------------------------------------------

test('decidePinchRunner does nothing before the 7th inning', () => {
  const rng = mulberry32(9);
  const runner = runnerOn(50);
  const sit = situation({ inning: 6, scoreDiff: 1, runners: { first: runner } });
  for (let i = 0; i < 20; i++) {
    assert.equal(decidePinchRunner(runner, sampleBenchA, sit, rng), undefined);
  }
});

test('decidePinchRunner does nothing when leverage is too low', () => {
  const rng = mulberry32(10);
  const runner = runnerOn(50);
  const sit = situation({ inning: 7, scoreDiff: 10, runners: { first: runner } });
  for (let i = 0; i < 20; i++) {
    assert.equal(decidePinchRunner(runner, sampleBenchA, sit, rng), undefined);
  }
});

test('decidePinchRunner does nothing when no bench runner offers a meaningful speed gain', () => {
  const rng = mulberry32(11);
  const runner = runnerOn(80); // sampleBenchA's fastest (speed 90) only offers +10
  const sit = situation({ inning: 8, scoreDiff: 1, runners: { first: runner, second: runnerOn(50) } });
  for (let i = 0; i < 20; i++) {
    assert.equal(decidePinchRunner(runner, sampleBenchA, sit, rng), undefined);
  }
});

test('decidePinchRunner sends up the speedster in high-leverage spots with a large speed gain', () => {
  const rng = mulberry32(12);
  const runner = runnerOn(50); // sampleBenchA[1] (speed 90) offers +40
  const sit = situation({
    inning: 9,
    scoreDiff: 1,
    runners: { first: runner, second: runnerOn(50), third: runnerOn(50) },
  });

  let pinchRuns = 0;
  for (let i = 0; i < 200; i++) {
    const result = decidePinchRunner(runner, sampleBenchA, sit, rng);
    if (result) {
      assert.equal(result.id, sampleBenchA[1].id);
      pinchRuns++;
    }
  }
  assert.ok(pinchRuns > 0, 'expected at least one pinch runner across 200 high-leverage attempts');
});
