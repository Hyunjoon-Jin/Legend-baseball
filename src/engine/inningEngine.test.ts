import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateHalfInning } from './inningEngine.js';
import { samplePitcher, sampleLineupA, sampleBenchA, sampleBullpenA } from '../data/samplePlayers.js';
import { defaultDefense } from '../types/baserunning.js';
import type { BatterAttributes } from '../types/player.js';

const dangerousBatter: BatterAttributes = {
  id: 'ie-danger', name: '강타자', battingSide: 'R', contactVsRight: 95, contactVsLeft: 95, power: 99,
  plateDiscipline: 90, badBallHitting: 85, speed: 80, stealRating: 70, baserunningAggressiveness: 70,
  swingType: 'level', pullTendency: 60, clutch: 90,
};

const weakOnDeck: BatterAttributes = {
  id: 'ie-weak', name: '약한타자', battingSide: 'R', contactVsRight: 30, contactVsLeft: 30, power: 20,
  plateDiscipline: 25, badBallHitting: 25, speed: 30, stealRating: 25, baserunningAggressiveness: 25,
  swingType: 'level', pullTendency: 50, clutch: 30,
};

function mulberry32(seed: number) {
  return function rng() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function baseContext(overrides: Partial<Parameters<typeof simulateHalfInning>[0]> = {}) {
  return {
    inning: 1,
    half: 'top' as const,
    lineup: sampleLineupA,
    pitcher: samplePitcher,
    defense: defaultDefense,
    ...overrides,
  };
}

test('a half-inning without a walk-off condition always ends with exactly 3 outs', () => {
  const rng = mulberry32(1);
  for (let i = 0; i < 50; i++) {
    const result = simulateHalfInning(baseContext(), rng);
    const totalOuts = result.plateAppearances.reduce((sum, pa) => sum + pa.atBat.outsRecorded, 0);
    assert.equal(totalOuts, 3);
    assert.equal(result.endedByWalkOff, false);
    assert.ok(result.plateAppearances.length > 0);
  }
});

test('runs/hits/walks/strikeouts and pitch counts are consistent with the play log', () => {
  const rng = mulberry32(2);
  for (let i = 0; i < 50; i++) {
    const result = simulateHalfInning(baseContext({ pitcherPitchCountStart: 30 }), rng);

    const totalRuns = result.plateAppearances.reduce((sum, pa) => sum + pa.atBat.runsScored, 0);
    assert.equal(totalRuns, result.runsScored);
    if (result.plateAppearances.length > 0) {
      assert.equal(result.plateAppearances[result.plateAppearances.length - 1].runsAfter, result.runsScored);
    }

    const totalPitches = result.plateAppearances.reduce((sum, pa) => sum + pa.atBat.pitches.length, 0);
    assert.equal(totalPitches, result.pitchesThrown);
    assert.equal(result.pitcherPitchCount, 30 + result.pitchesThrown);

    assert.ok(result.hits <= result.plateAppearances.length);
    assert.ok(result.walks <= result.plateAppearances.length);
    assert.ok(result.strikeouts <= result.plateAppearances.length);
    assert.ok(result.leftOnBase >= 0 && result.leftOnBase <= 3);
  }
});

test('the batting order rotates through the lineup and wraps with modulo', () => {
  const rng = mulberry32(3);
  for (let i = 0; i < 50; i++) {
    const startIndex = i % sampleLineupA.length;
    const result = simulateHalfInning(baseContext({ startingBatterIndex: startIndex }), rng);

    assert.ok(result.nextBatterIndex >= 0 && result.nextBatterIndex < sampleLineupA.length);

    // Each consecutive plate appearance should advance through the lineup
    // by exactly one slot, unless the at-bat was an inning-ending caught
    // stealing (in which case the same batter is due up again).
    let expected = startIndex;
    for (const pa of result.plateAppearances) {
      assert.equal(pa.lineupIndex, expected % sampleLineupA.length);
      if (pa.atBat.result !== 'inningEndingCaughtStealing') {
        expected++;
      }
    }
    assert.equal(result.nextBatterIndex, expected % sampleLineupA.length);
  }
});

test('an inning-ending caught stealing leaves the same batter due up next time', () => {
  const rng = mulberry32(4);
  let sawInterruptedAtBat = false;

  for (let i = 0; i < 300; i++) {
    // Start with 2 outs and a runner on so a caught-stealing can end the inning.
    const result = simulateHalfInning(
      baseContext({
        startingBatterIndex: i % sampleLineupA.length,
        startingOuts: 2,
        startingRunners: { first: { runnerId: 'r1', speed: 70, stealRating: 70, baserunningAggressiveness: 70 } },
      }),
      rng,
    );

    const last = result.plateAppearances[result.plateAppearances.length - 1];
    if (last.atBat.result === 'inningEndingCaughtStealing') {
      sawInterruptedAtBat = true;
      assert.equal(result.nextBatterIndex, last.lineupIndex);
    }
  }

  assert.ok(sawInterruptedAtBat, 'expected at least one inning-ending caught stealing across 300 half-innings');
});

test('isGameOver ends the half-inning immediately once the condition is met (walk-off)', () => {
  const rng = mulberry32(5);
  let sawEarlyEnd = false;

  for (let i = 0; i < 100; i++) {
    const result = simulateHalfInning(
      baseContext({
        half: 'bottom',
        startingScoreDiff: -1,
        isGameOver: (scoreDiff) => scoreDiff > 0,
      }),
      rng,
    );

    const totalOuts = result.plateAppearances.reduce((sum, pa) => sum + pa.atBat.outsRecorded, 0);
    if (result.endedByWalkOff) {
      sawEarlyEnd = true;
      assert.ok(totalOuts < 3);
      const last = result.plateAppearances[result.plateAppearances.length - 1];
      assert.ok(last.scoreDiffAfter > 0);
    } else {
      assert.equal(totalOuts, 3);
    }
  }

  assert.ok(sawEarlyEnd, 'expected at least one walk-off ending across 100 bottom-of-the-9th half-innings');
});

test('starting mid-inning with existing outs/runners is respected', () => {
  const rng = mulberry32(6);
  const result = simulateHalfInning(
    baseContext({
      startingOuts: 2,
      startingRunners: { second: { runnerId: 'r2', speed: 50, stealRating: 50, baserunningAggressiveness: 50 } },
    }),
    rng,
  );

  const totalOuts = result.plateAppearances.reduce((sum, pa) => sum + pa.atBat.outsRecorded, 0);
  // Only 1 more out is needed to end the inning (started at 2).
  assert.equal(totalOuts, 1);
});

test('an exhausted starter is replaced by a reliever, and every plate appearance after the change faces the new pitcher', () => {
  const rng = mulberry32(20);
  const result = simulateHalfInning(
    baseContext({
      pitcherPitchCountStart: 120,
      bullpen: sampleBullpenA,
    }),
    rng,
  );

  const changes = result.substitutions.filter((s) => s.type === 'pitchingChange');
  assert.equal(changes.length, 1);
  const change = changes[0];
  assert.equal(change.outgoing.id, samplePitcher.id);
  assert.equal(result.pitcher.id, change.incoming.id);
  assert.ok(!result.bullpen.some((p) => p.id === change.incoming.id));

  const changeIndex = result.plateAppearances.findIndex((pa) => pa.pitcher.id === change.incoming.id);
  assert.equal(changeIndex, 0, 'the hard pitch-count cap should trigger the change before the first plate appearance');
  for (const pa of result.plateAppearances) {
    assert.equal(pa.pitcher.id, change.incoming.id);
  }
});

test('a bench bat with a platoon edge can pinch-hit late in a close game, and the substitution is recorded', () => {
  const rng = mulberry32(21);
  let sawPinchHitter = false;

  for (let i = 0; i < 100 && !sawPinchHitter; i++) {
    const result = simulateHalfInning(
      baseContext({
        inning: 9,
        startingScoreDiff: 1,
        startingRunners: {
          second: { runnerId: 'r2', speed: 50, stealRating: 50, baserunningAggressiveness: 50 },
          third: { runnerId: 'r3', speed: 50, stealRating: 50, baserunningAggressiveness: 50 },
        },
        bench: sampleBenchA,
      }),
      rng,
    );

    const ph = result.substitutions.find((s) => s.type === 'pinchHitter');
    if (ph) {
      sawPinchHitter = true;
      assert.equal(ph.incoming.id, sampleBenchA[0].id);
      assert.ok(!result.bench.some((b) => b.id === ph.incoming.id));
      assert.ok(result.lineup.some((b) => b.id === ph.incoming.id));
    }
  }

  assert.ok(sawPinchHitter, 'expected at least one pinch hitter across 100 high-leverage half-innings');
});

test('a bench speedster can pinch-run late in a close game, and the substitution is recorded', () => {
  const rng = mulberry32(22);
  let sawPinchRunner = false;

  for (let i = 0; i < 200 && !sawPinchRunner; i++) {
    const result = simulateHalfInning(
      baseContext({
        inning: 9,
        startingScoreDiff: 1,
        bench: sampleBenchA,
      }),
      rng,
    );

    const pr = result.substitutions.find((s) => s.type === 'pinchRunner');
    if (pr) {
      sawPinchRunner = true;
      assert.equal(pr.incoming.id, sampleBenchA[1].id);
      assert.ok(!result.bench.some((b) => b.id === pr.incoming.id));
      assert.ok(result.lineup.some((b) => b.id === pr.incoming.id));
    }
  }

  assert.ok(sawPinchRunner, 'expected at least one pinch runner across 200 high-leverage half-innings');
});

test('a dangerous batter can be intentionally walked ahead of a weak on-deck hitter, with zero pitches thrown', () => {
  const rng = mulberry32(30);
  let sawIntentionalWalk = false;

  for (let i = 0; i < 100 && !sawIntentionalWalk; i++) {
    const result = simulateHalfInning(
      baseContext({
        lineup: [dangerousBatter, weakOnDeck],
        inning: 9,
        startingScoreDiff: 1,
        startingRunners: {
          second: { runnerId: 'r2', speed: 50, stealRating: 50, baserunningAggressiveness: 50 },
        },
      }),
      rng,
    );

    const ibb = result.plateAppearances.find((pa) => pa.atBat.result === 'intentionalWalk');
    if (ibb) {
      sawIntentionalWalk = true;
      assert.equal(ibb.atBat.pitches.length, 0);
      assert.equal(ibb.atBat.basesReached, 1);
      assert.equal(ibb.batter.id, dangerousBatter.id);
    }
  }

  assert.ok(sawIntentionalWalk, 'expected at least one intentional walk across 100 high-leverage half-innings');
});
