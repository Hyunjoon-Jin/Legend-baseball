import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateAtBat } from '../engine/matchupEngine.js';
import { sampleBatter, samplePitcher, sampleSituation } from '../data/samplePlayers.js';
import { BatterStatsAggregator, PitcherStatsAggregator } from './aggregator.js';
import type { AtBatResult } from '../types/outcome.js';

function makeAtBat(overrides: Partial<AtBatResult>): AtBatResult {
  return {
    pitches: [],
    result: 'groundOut',
    category: 'out',
    basesReached: 0,
    runsScored: 0,
    finalRunners: {},
    baseRunningEvents: [],
    outsRecorded: 1,
    ...overrides,
  };
}

test('a single PA produces consistent counting and rate stats', () => {
  const batter = new BatterStatsAggregator('b1');
  const pitcher = new PitcherStatsAggregator();

  const homeRun = makeAtBat({
    pitches: [
      { pitchNumber: 1, pitchType: 'fourSeam', zone: { row: 2, col: 2 }, velocity: 145, result: 'inPlay', countBefore: { balls: 0, strikes: 0 } },
    ],
    result: 'homeRun',
    category: 'hit',
    basesReached: 4,
    runsScored: 1,
    outsRecorded: 0,
    battedBall: { exitVelocity: 165, launchAngle: 28, direction: 'pullGap', type: 'flyBall', distance: 125 },
  });

  batter.addPlateAppearance(homeRun);
  pitcher.addPlateAppearance(homeRun);

  const batterLine = batter.getStatLine();
  assert.equal(batterLine.plateAppearances, 1);
  assert.equal(batterLine.atBats, 1);
  assert.equal(batterLine.hits, 1);
  assert.equal(batterLine.homeRuns, 1);
  assert.equal(batterLine.totalBases, 4);
  assert.equal(batterLine.avg, 1);
  assert.equal(batterLine.slg, 4);
  assert.equal(batterLine.rbi, 1);
  assert.equal(batterLine.battedBalls, 1);
  assert.equal(batterLine.hardHitRate, 1);
  assert.equal(batterLine.barrelRate, 1);

  const pitcherLine = pitcher.getStatLine();
  assert.equal(pitcherLine.battersFaced, 1);
  assert.equal(pitcherLine.homeRuns, 1);
  assert.equal(pitcherLine.earnedRuns, 1);
  assert.equal(pitcherLine.outs, 0);
  assert.equal(pitcherLine.inningsPitched, 0);
  // ERA is undefined (0 IP) so we expect the safe-division fallback of 0.
  assert.equal(pitcherLine.era, 0);
});

test('an inningEndingCaughtStealing result does not count as a plate appearance', () => {
  const batter = new BatterStatsAggregator('b1');
  const pitcher = new PitcherStatsAggregator();

  const csOut = makeAtBat({
    result: 'inningEndingCaughtStealing',
    category: 'other',
    outsRecorded: 0,
    baseRunningEvents: [{ type: 'caughtStealing', runnerId: 'r2', from: 'first', to: 'second', pitchNumber: 1 }],
  });

  batter.addPlateAppearance(csOut);
  pitcher.addPlateAppearance(csOut);

  assert.equal(batter.getStatLine().plateAppearances, 0);
  assert.equal(pitcher.getStatLine().battersFaced, 0);
  assert.equal(pitcher.getStatLine().caughtStealing, 1);
});

test('stolen base events for the tracked runner update the batter stat line', () => {
  const batter = new BatterStatsAggregator('b1');

  const sbEvent = makeAtBat({
    result: 'groundOut',
    category: 'out',
    baseRunningEvents: [{ type: 'stolenBaseSuccess', runnerId: 'b1', from: 'first', to: 'second', pitchNumber: 1 }],
  });

  batter.addPlateAppearance(sbEvent);
  assert.equal(batter.getStatLine().stolenBases, 1);
});

test('aggregating thousands of simulated at-bats produces sane, bounded rate stats', () => {
  const batter = new BatterStatsAggregator(sampleBatter.id);
  const pitcher = new PitcherStatsAggregator();

  const N = 2000;
  for (let i = 0; i < N; i++) {
    const result = simulateAtBat(samplePitcher, sampleBatter, sampleSituation);
    batter.addPlateAppearance(result);
    pitcher.addPlateAppearance(result);
  }

  const batterLine = batter.getStatLine();
  const pitcherLine = pitcher.getStatLine();

  assert.ok(batterLine.plateAppearances > 0);
  assert.ok(batterLine.avg >= 0 && batterLine.avg <= 1);
  assert.ok(batterLine.obp >= 0 && batterLine.obp <= 1);
  assert.ok(batterLine.slg >= 0 && batterLine.slg <= 4);
  assert.ok(batterLine.kRate >= 0 && batterLine.kRate <= 1);
  assert.ok(batterLine.bbRate >= 0 && batterLine.bbRate <= 1);
  assert.ok(batterLine.swingRate >= 0 && batterLine.swingRate <= 1);
  assert.ok(batterLine.contactRate >= 0 && batterLine.contactRate <= 1);
  assert.ok(batterLine.zoneSwingRate >= 0 && batterLine.zoneSwingRate <= 1);
  assert.ok(batterLine.chaseRate >= 0 && batterLine.chaseRate <= 1);
  assert.ok(batterLine.hardHitRate >= 0 && batterLine.hardHitRate <= 1);
  assert.ok(batterLine.barrelRate >= 0 && batterLine.barrelRate <= 1);

  assert.equal(pitcherLine.battersFaced, batterLine.plateAppearances);
  assert.ok(pitcherLine.inningsPitched > 0);
  assert.ok(pitcherLine.era >= 0);
  assert.ok(pitcherLine.whip >= 0);
  assert.ok(pitcherLine.strikePercentage > 0 && pitcherLine.strikePercentage <= 1);
});
