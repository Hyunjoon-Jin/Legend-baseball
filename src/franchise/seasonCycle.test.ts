import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playFranchiseSeason } from './seasonCycle.js';
import type { FranchiseState, TeamFranchiseState } from './types.js';
import { generateLeaguePlayerPools } from '../data/playerPoolGenerator.js';
import { buildDepthChart } from '../roster/depthChart.js';
import { ACTIVE_ROSTER_SIZE, RETIREMENT_SOFT_AGE } from '../roster/constants.js';

function mulberry32(seed: number) {
  return function rng() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function initialFranchiseState(seed: number): FranchiseState {
  const strengths = Array.from({ length: 10 }, () => 1.0);
  const pools = generateLeaguePlayerPools(strengths, mulberry32(seed));

  const teams: TeamFranchiseState[] = pools.map((roster, i) => ({
    teamId: `T${i + 1}`,
    name: `팀${i + 1}`,
    roster,
  }));

  return {
    year: 2025,
    phase: 'preseason',
    teams,
    draftPoolNextYear: [],
    domesticFreeAgents: [],
    foreignFreeAgents: [],
    asiaQuotaFreeAgents: [],
    retiredPlayers: [],
    transactionLog: [],
  };
}

test('playFranchiseSeason advances the year, ages every surviving player, and archives retirees', () => {
  const state = initialFranchiseState(60);

  const agesById = new Map<string, number>();
  for (const team of state.teams) {
    for (const p of team.roster) agesById.set(p.playerId, p.age);
  }

  const result = playFranchiseSeason(state, mulberry32(61));

  assert.equal(result.year, state.year + 1);
  assert.equal(result.phase, 'preseason');
  assert.ok(result.lastSeasonResult);
  assert.ok(Number.isFinite(result.lastSeasonResult!.standings[0].winPct));

  for (const team of result.teams) {
    assert.ok(team.roster.filter((p) => p.rosterStatus === '1군').length <= ACTIVE_ROSTER_SIZE);

    for (const p of team.roster) {
      assert.equal(p.age, agesById.get(p.playerId)! + 1);
      assert.notEqual(p.rosterStatus, '은퇴');
      assert.equal(p.injury, undefined);
    }

    const chart = buildDepthChart(team.roster);
    assert.equal(chart.lineup.length, 9);
    assert.equal(chart.rotation.length, 5);
  }

  for (const p of result.retiredPlayers) {
    assert.equal(p.rosterStatus, '은퇴');
    assert.equal(p.age, agesById.get(p.playerId)! + 1);
    assert.ok(p.age >= RETIREMENT_SOFT_AGE);
  }

  assert.equal(result.transactionLog.length, result.retiredPlayers.length);
  for (const record of result.transactionLog) {
    assert.equal(record.type, 'retirement');
    assert.equal(record.year, state.year);
  }

  const rosterCount = result.teams.reduce((sum, t) => sum + t.roster.length, 0);
  assert.equal(rosterCount + result.retiredPlayers.length, 650);
});

test('playFranchiseSeason can be chained across multiple seasons', () => {
  const state0 = initialFranchiseState(70);
  const rng = mulberry32(71);

  const state1 = playFranchiseSeason(state0, rng);
  const state2 = playFranchiseSeason(state1, rng);

  assert.equal(state1.year, state0.year + 1);
  assert.equal(state2.year, state0.year + 2);
  assert.ok(state2.transactionLog.length >= state1.transactionLog.length);
  assert.notEqual(state2.lastSeasonResult, state1.lastSeasonResult);

  for (const team of state2.teams) {
    const chart = buildDepthChart(team.roster);
    assert.equal(chart.lineup.length, 9);
    assert.equal(chart.rotation.length, 5);
    assert.ok(team.roster.filter((p) => p.rosterStatus === '1군').length <= ACTIVE_ROSTER_SIZE);
  }
});
