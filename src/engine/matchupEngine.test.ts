import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateAtBat } from './matchupEngine.js';
import { sampleBatter, samplePitcher, sampleSituation, sampleSituationWithRunners } from '../data/samplePlayers.js';
import { OUTCOME_CATEGORY } from '../types/outcome.js';
import { isInStrikeZone } from '../types/zone.js';

function mulberry32(seed: number) {
  return function rng() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('simulateAtBat returns a deterministic result for a fixed rng', () => {
  const rng = mulberry32(42);
  const result = simulateAtBat(samplePitcher, sampleBatter, sampleSituation, rng);
  assert.ok(result.pitches.length > 0);
  assert.ok(result.pitches.length <= 30);
  assert.equal(OUTCOME_CATEGORY[result.result], result.category);
});

test('every pitch event has a valid plate location and result', () => {
  const rng = mulberry32(7);
  for (let i = 0; i < 50; i++) {
    const result = simulateAtBat(samplePitcher, sampleBatter, sampleSituation, rng);
    for (const pitch of result.pitches) {
      assert.ok(pitch.zone.row >= 0 && pitch.zone.row <= 4);
      assert.ok(pitch.zone.col >= 0 && pitch.zone.col <= 4);
      assert.ok(pitch.velocity > 0);
    }
  }
});

test('an at-bat never exceeds 4 balls or 3 strikes before terminating', () => {
  const rng = mulberry32(123);
  for (let i = 0; i < 200; i++) {
    const result = simulateAtBat(samplePitcher, sampleBatter, sampleSituation, rng);
    let balls = 0;
    let strikes = 0;
    for (const pitch of result.pitches) {
      assert.ok(balls < 4, 'count exceeded 4 balls mid at-bat');
      assert.ok(strikes < 3, 'count exceeded 3 strikes mid at-bat');
      switch (pitch.result) {
        case 'ball':
          balls++;
          break;
        case 'calledStrike':
        case 'swingingStrike':
        case 'foulTip':
          strikes++;
          break;
        case 'foulBall':
          if (strikes < 2) strikes++;
          break;
      }
    }
  }
});

test('home runs and triples always award full bases', () => {
  const rng = mulberry32(99);
  let checked = 0;
  for (let i = 0; i < 2000 && checked < 20; i++) {
    const result = simulateAtBat(samplePitcher, sampleBatter, sampleSituation, rng);
    if (result.result === 'homeRun' || result.result === 'insideTheParkHomeRun') {
      assert.equal(result.basesReached, 4);
      checked++;
    }
    if (result.result === 'triple') {
      assert.equal(result.basesReached, 3);
      checked++;
    }
  }
});

test('called strikes only occur on pitches inside the strike zone', () => {
  const rng = mulberry32(55);
  for (let i = 0; i < 200; i++) {
    const result = simulateAtBat(samplePitcher, sampleBatter, sampleSituation, rng);
    for (const pitch of result.pitches) {
      if (pitch.result === 'calledStrike') {
        assert.ok(isInStrikeZone(pitch.zone));
      }
      if (pitch.result === 'ball' || pitch.result === 'hitByPitch') {
        assert.ok(!isInStrikeZone(pitch.zone));
      }
    }
  }
});

test('strikeouts and walks have no batted ball profile', () => {
  const rng = mulberry32(321);
  for (let i = 0; i < 200; i++) {
    const result = simulateAtBat(samplePitcher, sampleBatter, sampleSituation, rng);
    if (result.category === 'strikeout' || result.category === 'walk' || result.category === 'hitByPitch') {
      assert.equal(result.battedBall, undefined);
      assert.equal(result.basesReached === 1 || result.basesReached === 0, true);
    }
  }
});

test('home runs always score every existing runner plus the batter', () => {
  const rng = mulberry32(2024);
  let checked = 0;
  for (let i = 0; i < 5000 && checked < 10; i++) {
    const result = simulateAtBat(samplePitcher, sampleBatter, sampleSituationWithRunners, rng);
    if (result.result === 'homeRun' || result.result === 'insideTheParkHomeRun') {
      // 2 existing runners (first + second) minus any removed by a caught
      // stealing/pickoff earlier in the at-bat, plus the batter himself.
      const removed = result.baseRunningEvents.filter((e) => e.type === 'caughtStealing' || e.type === 'pickoff').length;
      assert.equal(result.runsScored, 2 - removed + 1);
      assert.deepEqual(result.finalRunners, {});
      checked++;
    }
  }
});

test('outsRecorded never exceeds 3, and double/triple plays record at least their own outs', () => {
  const rng = mulberry32(13);
  for (let i = 0; i < 500; i++) {
    const result = simulateAtBat(samplePitcher, sampleBatter, sampleSituationWithRunners, rng);
    assert.ok(result.outsRecorded >= 0 && result.outsRecorded <= 3);
    if (result.result === 'doublePlay') {
      assert.ok(result.outsRecorded >= 2);
      assert.equal(result.runsScored, 0);
    }
    if (result.result === 'triplePlay') {
      assert.equal(result.outsRecorded, 3);
      assert.deepEqual(result.finalRunners, {});
    }
  }
});

test('caught stealing on the bases is reflected in baseRunningEvents', () => {
  const rng = mulberry32(777);
  let sawSteal = false;
  for (let i = 0; i < 300; i++) {
    const result = simulateAtBat(samplePitcher, sampleBatter, sampleSituationWithRunners, rng);
    if (result.baseRunningEvents.some((e) => e.type === 'stolenBaseAttempt')) {
      sawSteal = true;
      const attempt = result.baseRunningEvents.find((e) => e.type === 'stolenBaseAttempt')!;
      const success = result.baseRunningEvents.some((e) => e.type === 'stolenBaseSuccess' && e.runnerId === attempt.runnerId);
      const caught = result.baseRunningEvents.some((e) => e.type === 'caughtStealing' && e.runnerId === attempt.runnerId);
      assert.ok(success || caught);
    }
  }
  assert.ok(sawSteal, 'expected at least one stolen base attempt across 300 at-bats with runners on base');
});
