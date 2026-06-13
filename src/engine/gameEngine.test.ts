import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateGame, type TeamSetup } from './gameEngine.js';
import { samplePitcher, samplePitcherB, sampleLineupA, sampleLineupB } from '../data/samplePlayers.js';
import { defaultDefense } from '../types/baserunning.js';

function mulberry32(seed: number) {
  return function rng() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const away: TeamSetup = { name: '어웨이', lineup: sampleLineupA, pitcher: samplePitcherB, defense: defaultDefense };
const home: TeamSetup = { name: '홈', lineup: sampleLineupB, pitcher: samplePitcher, defense: defaultDefense };

test('a full game is at least 9 innings and never exceeds maxInnings', () => {
  const rng = mulberry32(10);
  for (let i = 0; i < 20; i++) {
    const result = simulateGame(away, home, {}, rng);
    assert.ok(result.totalInnings >= 9);
    assert.ok(result.totalInnings <= 12);
    assert.equal(result.lineScore.away.length, result.totalInnings);
    assert.ok(
      result.lineScore.home.length === result.totalInnings || result.lineScore.home.length === result.totalInnings - 1,
    );
  }
});

test('the line score sums to the final score', () => {
  const rng = mulberry32(11);
  for (let i = 0; i < 20; i++) {
    const result = simulateGame(away, home, {}, rng);
    const awaySum = result.lineScore.away.reduce((a, b) => a + b, 0);
    const homeSum = result.lineScore.home.reduce((a, b) => a + b, 0);
    assert.equal(awaySum, result.finalScore.away);
    assert.equal(homeSum, result.finalScore.home);
  }
});

test('winner is consistent with the final score', () => {
  const rng = mulberry32(12);
  for (let i = 0; i < 20; i++) {
    const result = simulateGame(away, home, {}, rng);
    if (result.finalScore.away > result.finalScore.home) assert.equal(result.winner, 'away');
    else if (result.finalScore.home > result.finalScore.away) assert.equal(result.winner, 'home');
    else assert.equal(result.winner, 'tie');
  }
});

test('the bottom half is only skipped (in regulation or later) when the home team is already ahead', () => {
  const rng = mulberry32(13);
  for (let i = 0; i < 20; i++) {
    const result = simulateGame(away, home, {}, rng);
    if (result.lineScore.home.length === result.lineScore.away.length - 1) {
      assert.ok(result.totalInnings >= 9);
      assert.ok(result.finalScore.home > result.finalScore.away);
    }
  }
});

test('a walk-off ends the bottom half immediately with fewer than 3 outs', () => {
  const rng = mulberry32(14);
  let sawWalkOff = false;

  for (let i = 0; i < 60; i++) {
    const result = simulateGame(away, home, {}, rng);
    const last = result.halfInnings[result.halfInnings.length - 1];
    if (last.half === 'bottom' && last.endedByWalkOff) {
      sawWalkOff = true;
      assert.ok(last.inning >= 9);
      assert.ok(result.finalScore.home > result.finalScore.away);
      assert.equal(result.lineScore.home.length, result.lineScore.away.length);
      const totalOuts = last.plateAppearances.reduce((sum, pa) => sum + pa.atBat.outsRecorded, 0);
      assert.ok(totalOuts < 3);
    }
  }

  assert.ok(sawWalkOff, 'expected at least one walk-off across 60 simulated games');
});

test('each pitcher\'s pitch count carries forward and increases across his half-innings', () => {
  const rng = mulberry32(15);
  const result = simulateGame(away, home, {}, rng);

  const homePitcherHalfInnings = result.halfInnings.filter((h) => h.half === 'top');
  const awayPitcherHalfInnings = result.halfInnings.filter((h) => h.half === 'bottom');

  for (let i = 1; i < homePitcherHalfInnings.length; i++) {
    assert.ok(homePitcherHalfInnings[i].pitcherPitchCount > homePitcherHalfInnings[i - 1].pitcherPitchCount);
  }
  for (let i = 1; i < awayPitcherHalfInnings.length; i++) {
    assert.ok(awayPitcherHalfInnings[i].pitcherPitchCount > awayPitcherHalfInnings[i - 1].pitcherPitchCount);
  }
});

test('the batting order chains correctly across a team\'s consecutive half-innings', () => {
  const rng = mulberry32(16);
  const result = simulateGame(away, home, {}, rng);

  const awayHalfInnings = result.halfInnings.filter((h) => h.half === 'top');
  const homeHalfInnings = result.halfInnings.filter((h) => h.half === 'bottom');

  for (let i = 1; i < awayHalfInnings.length; i++) {
    const expectedStart = awayHalfInnings[i - 1].nextBatterIndex;
    assert.equal(awayHalfInnings[i].plateAppearances[0].lineupIndex, expectedStart);
  }
  for (let i = 1; i < homeHalfInnings.length; i++) {
    const expectedStart = homeHalfInnings[i - 1].nextBatterIndex;
    assert.equal(homeHalfInnings[i].plateAppearances[0].lineupIndex, expectedStart);
  }
});
