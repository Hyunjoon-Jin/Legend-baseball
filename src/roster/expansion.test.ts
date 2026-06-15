import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyRosterExpansion, revertRosterExpansion } from './expansion.js';
import { buildLeagueTeam } from './depthChart.js';
import { overallRating } from './rating.js';
import { ACTIVE_ROSTER_SIZE, EXPANDED_ROSTER_SIZE, EXPANSION_GAME_INDEX } from './constants.js';
import { generateTeamPlayerPool, generateLeaguePlayerPools } from '../data/playerPoolGenerator.js';
import { simulateKboSeason, type SeasonHooks } from '../season/leagueSim.js';
import { sampleBatter, samplePitcher } from '../data/samplePlayers.js';
import type { PlayerProfile } from '../types/roster.js';
import type { LeagueTeam } from '../types/season.js';

function mulberry32(seed: number) {
  return function rng() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('applyRosterExpansion calls up the two highest-rated 2군 players, balancing batter/pitcher with the existing 1군 ratio', () => {
  const pool = generateTeamPlayerPool(0, 1.0, mulberry32(30));
  const result = applyRosterExpansion(pool);

  assert.equal(result.calledUpIds.length, 2);

  const byId = new Map(result.roster.map((p) => [p.playerId, p]));
  for (const id of result.calledUpIds) {
    assert.equal(byId.get(id)?.rosterStatus, '1군');
  }

  const active = result.roster.filter((p) => p.rosterStatus === '1군');
  assert.equal(active.length, ACTIVE_ROSTER_SIZE + 2);
  assert.equal(active.filter((p) => p.kind === 'batter').length, 14);
  assert.equal(active.filter((p) => p.kind === 'pitcher').length, 14);

  const reserveBatters = pool.filter((p) => p.rosterStatus === '2군' && p.kind === 'batter').sort((a, b) => overallRating(b) - overallRating(a));
  const reservePitchers = pool.filter((p) => p.rosterStatus === '2군' && p.kind === 'pitcher').sort((a, b) => overallRating(b) - overallRating(a));
  assert.deepEqual(new Set(result.calledUpIds), new Set([reserveBatters[0].playerId, reservePitchers[0].playerId]));
});

test('revertRosterExpansion restores the original roster', () => {
  const pool = generateTeamPlayerPool(1, 1.0, mulberry32(31));
  const { roster: expanded, calledUpIds } = applyRosterExpansion(pool);

  const reverted = revertRosterExpansion(expanded, calledUpIds);
  assert.deepEqual(reverted, pool);
});

test('applyRosterExpansion calls up only as many players as 2군 has available', () => {
  const makeBatter = (id: string, status: PlayerProfile['rosterStatus']): PlayerProfile => ({
    playerId: id,
    kind: 'batter',
    attributes: { ...sampleBatter, id },
    position: 'LF',
    age: 25,
    potential: 70,
    rosterStatus: status,
    origin: 'domestic',
    contract: { yearsRemaining: 3, annualSalary: 10000, faEligible: false },
    serviceTimeYears: 3,
  });
  const makePitcher = (id: string, status: PlayerProfile['rosterStatus']): PlayerProfile => ({
    playerId: id,
    kind: 'pitcher',
    attributes: { ...samplePitcher, id },
    age: 25,
    potential: 70,
    rosterStatus: status,
    origin: 'domestic',
    contract: { yearsRemaining: 3, annualSalary: 10000, faEligible: false },
    serviceTimeYears: 3,
  });

  const active: PlayerProfile[] = [];
  for (let i = 0; i < 13; i++) active.push(makeBatter(`B${i}`, '1군'));
  for (let i = 0; i < 13; i++) active.push(makePitcher(`P${i}`, '1군'));

  const roster = [...active, makeBatter('B-reserve', '2군')];
  const result = applyRosterExpansion(roster);

  assert.equal(result.calledUpIds.length, 1);
  assert.deepEqual(result.calledUpIds, ['B-reserve']);
  assert.equal(result.roster.find((p) => p.playerId === 'B-reserve')?.rosterStatus, '1군');
});

test('applyRosterExpansion is a no-op once the active roster already reached EXPANDED_ROSTER_SIZE', () => {
  const pool = generateTeamPlayerPool(2, 1.0, mulberry32(32));
  const { roster: expanded } = applyRosterExpansion(pool);

  const result = applyRosterExpansion(expanded);
  assert.equal(result.calledUpIds.length, 0);
  assert.deepEqual(result.roster, expanded);
});

test('simulateKboSeason applies the roster expansion via onBeforeGame at EXPANSION_GAME_INDEX', () => {
  const strengths = Array.from({ length: 10 }, () => 1.0);
  const pools = generateLeaguePlayerPools(strengths, mulberry32(33));

  const rosters = new Map<string, PlayerProfile[]>();
  const teams: LeagueTeam[] = pools.map((pool, i) => {
    const id = `T${i + 1}`;
    rosters.set(id, pool);
    return buildLeagueTeam(id, `팀${i + 1}`, pool);
  });

  const expandedAt = new Map<string, number>();
  const hooks: SeasonHooks = {
    onBeforeGame: (gamesPlayed, teamId, team) => {
      if (gamesPlayed !== EXPANSION_GAME_INDEX) return undefined;
      const roster = rosters.get(teamId)!;
      const { roster: expanded, calledUpIds } = applyRosterExpansion(roster);
      rosters.set(teamId, expanded);
      expandedAt.set(teamId, calledUpIds.length);
      return buildLeagueTeam(teamId, team.setup.name, expanded);
    },
  };

  simulateKboSeason(teams, {}, mulberry32(34), hooks);

  assert.equal(expandedAt.size, teams.length);
  for (const team of teams) {
    const roster = rosters.get(team.id)!;
    const active = roster.filter((p) => p.rosterStatus === '1군');
    assert.equal(active.length, EXPANDED_ROSTER_SIZE);
    assert.equal(active.length - ACTIVE_ROSTER_SIZE, expandedAt.get(team.id));
  }
});
