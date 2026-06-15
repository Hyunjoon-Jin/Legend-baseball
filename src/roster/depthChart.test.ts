import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDepthChart, buildTeamSetup, buildLeagueTeam } from './depthChart.js';
import { generateTeamPlayerPool } from '../data/playerPoolGenerator.js';
import { simulateGame } from '../engine/gameEngine.js';
import type { PitcherAttributes } from '../types/player.js';
import type { Position } from '../types/roster.js';

function mulberry32(seed: number) {
  return function rng() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ALL_POSITIONS: readonly Position[] = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];

test('buildDepthChart produces a 9-man lineup, 4-man bench, 5-man rotation, and 8-man bullpen', () => {
  const pool = generateTeamPlayerPool(0, 1.0, mulberry32(10));
  const chart = buildDepthChart(pool);

  assert.equal(chart.lineup.length, 9);
  assert.equal(chart.bench.length, 4);
  assert.equal(chart.rotation.length, 5);
  assert.equal(chart.bullpen.length, 8);
});

test('the lineup covers all 9 positions using only active (1군) batters', () => {
  const pool = generateTeamPlayerPool(1, 1.0, mulberry32(11));
  const chart = buildDepthChart(pool);
  const byId = new Map(pool.map((p) => [p.playerId, p]));

  const positions = chart.lineup.map((b) => byId.get(b.id)?.position);
  assert.deepEqual(new Set(positions), new Set(ALL_POSITIONS));

  for (const b of [...chart.lineup, ...chart.bench]) {
    assert.equal(byId.get(b.id)?.rosterStatus, '1군');
  }
});

test('the rotation leads with a starter and bullpen/rotation together cover all active pitchers', () => {
  const pool = generateTeamPlayerPool(2, 1.0, mulberry32(12));
  const chart = buildDepthChart(pool);

  assert.equal((chart.rotation[0] as PitcherAttributes).role, 'starter');

  const staffIds = new Set([...chart.rotation, ...chart.bullpen].map((p) => p.id));
  assert.equal(staffIds.size, 13);
  const activePitcherIds = new Set(pool.filter((p) => p.kind === 'pitcher' && p.rosterStatus === '1군').map((p) => p.playerId));
  assert.deepEqual(staffIds, activePitcherIds);
});

test('lineup batting order has no duplicate batters and matches the active starters exactly', () => {
  const pool = generateTeamPlayerPool(3, 1.0, mulberry32(13));
  const chart = buildDepthChart(pool);
  const byId = new Map(pool.map((p) => [p.playerId, p]));

  const lineupIds = chart.lineup.map((b) => b.id);
  assert.equal(new Set(lineupIds).size, 9);
  for (const id of lineupIds) {
    assert.equal(byId.get(id)?.rosterStatus, '1군');
    assert.equal(byId.get(id)?.kind, 'batter');
  }
});

test('buildTeamSetup/buildLeagueTeam output plugs directly into the existing game engine', () => {
  const poolA = generateTeamPlayerPool(0, 1.0, mulberry32(20));
  const poolB = generateTeamPlayerPool(1, 1.0, mulberry32(21));

  const away = buildLeagueTeam('T1', '어웨이팀', poolA);
  const home = buildTeamSetup('홈팀', poolB);

  assert.equal(away.rotation.length, 5);
  assert.equal(away.setup.lineup.length, 9);

  const result = simulateGame(away.setup, home, {}, mulberry32(22));
  assert.ok(Number.isFinite(result.finalScore.away));
  assert.ok(Number.isFinite(result.finalScore.home));
});
