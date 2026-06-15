import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateTeamPlayerPool, generateLeaguePlayerPools } from './playerPoolGenerator.js';
import { overallRating } from '../roster/rating.js';
import type { BatterAttributes, PitcherAttributes } from '../types/player.js';
import type { PlayerProfile, Position } from '../types/roster.js';

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

test('generates exactly 65 players (33 batters + 32 pitchers) per team', () => {
  for (const teamIndex of [0, 1, 2, 9]) {
    const pool = generateTeamPlayerPool(teamIndex, 1.0, mulberry32(1));
    assert.equal(pool.length, 65);
    assert.equal(pool.filter((p) => p.kind === 'batter').length, 33);
    assert.equal(pool.filter((p) => p.kind === 'pitcher').length, 32);
  }
});

test('player IDs follow P{team}-{seq} and are globally unique across teams', () => {
  const pools = generateLeaguePlayerPools([1.0, 1.0, 0.95], mulberry32(2));
  const allIds = pools.flatMap((pool) => pool.map((p) => p.playerId));
  assert.equal(new Set(allIds).size, allIds.length);

  assert.ok(pools[0].every((p) => p.playerId.startsWith('P01-')));
  assert.ok(pools[1].every((p) => p.playerId.startsWith('P02-')));
  assert.ok(pools[2].every((p) => p.playerId.startsWith('P03-')));
  // attributes.id mirrors the global playerId so stat history follows the player across trades.
  assert.ok(pools[0].every((p) => p.attributes.id === p.playerId));
});

test('every position has at least one batter, and the pool covers depth at every position', () => {
  const pool = generateTeamPlayerPool(0, 1.0, mulberry32(3));
  const batters = pool.filter((p): p is PlayerProfile & { position: Position } => p.kind === 'batter' && p.position !== undefined);

  for (const pos of ALL_POSITIONS) {
    const atPosition = batters.filter((p) => p.position === pos);
    assert.ok(atPosition.length >= 3, `expected depth at ${pos}, got ${atPosition.length}`);
  }
});

test('pitcher pool includes at least 5 starters', () => {
  const pool = generateTeamPlayerPool(1, 1.0, mulberry32(4));
  const starters = pool.filter((p) => p.kind === 'pitcher' && (p.attributes as PitcherAttributes).role === 'starter');
  assert.ok(starters.length >= 5, `expected >= 5 starters, got ${starters.length}`);
});

test('initial roster split is 26 active (1군) and 39 reserve (2군)', () => {
  const pool = generateTeamPlayerPool(2, 1.0, mulberry32(5));
  assert.equal(pool.filter((p) => p.rosterStatus === '1군').length, 26);
  assert.equal(pool.filter((p) => p.rosterStatus === '2군').length, 39);
  assert.equal(pool.filter((p) => p.rosterStatus === '부상자명단' || p.rosterStatus === '은퇴').length, 0);
});

test('every player has an age in 18-43 and a potential in 1-99 at or above their overall rating', () => {
  const pool = generateTeamPlayerPool(3, 1.0, mulberry32(6));
  for (const p of pool) {
    assert.ok(p.age >= 18 && p.age <= 43, `age ${p.age} out of range for ${p.playerId}`);
    assert.ok(p.potential >= 1 && p.potential <= 99, `potential ${p.potential} out of range for ${p.playerId}`);
    assert.ok(p.potential >= overallRating(p), `potential ${p.potential} below overall for ${p.playerId}`);
  }
});

test('each team has exactly 3 foreign players (2 pitchers + 1 batter) and 1 Asia-quota batter', () => {
  const pool = generateTeamPlayerPool(4, 1.0, mulberry32(7));
  const foreign = pool.filter((p) => p.origin === 'foreign');
  const asiaQuota = pool.filter((p) => p.origin === 'asiaQuota');

  assert.equal(foreign.length, 3);
  assert.equal(foreign.filter((p) => p.kind === 'pitcher').length, 2);
  assert.equal(foreign.filter((p) => p.kind === 'batter').length, 1);
  assert.equal(asiaQuota.length, 1);
  assert.equal(asiaQuota[0].kind, 'batter');
  assert.ok(foreign.every((p) => typeof p.nationality === 'string'));
  assert.ok(asiaQuota.every((p) => typeof p.nationality === 'string'));
});

test('generation is deterministic for a given seed', () => {
  const poolA = generateTeamPlayerPool(5, 1.0, mulberry32(42));
  const poolB = generateTeamPlayerPool(5, 1.0, mulberry32(42));
  assert.deepEqual(poolA, poolB);
});

test('batter attribute ratings stay within 1-99 even with team-strength scaling', () => {
  const pool = generateTeamPlayerPool(0, 1.06, mulberry32(8));
  for (const p of pool.filter((x) => x.kind === 'batter')) {
    const attrs = p.attributes as BatterAttributes;
    for (const field of ['contactVsRight', 'contactVsLeft', 'power', 'plateDiscipline', 'badBallHitting', 'speed', 'stealRating', 'baserunningAggressiveness', 'pullTendency', 'clutch'] as const) {
      assert.ok(attrs[field] >= 1 && attrs[field] <= 99, `${field}=${attrs[field]} out of range for ${p.playerId}`);
    }
  }
});
