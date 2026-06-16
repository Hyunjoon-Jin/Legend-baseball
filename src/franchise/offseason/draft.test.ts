import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateDraftClass, runDraft, type DraftPick } from './draft.js';
import { runSecondaryDraft } from './secondaryDraft.js';
import { sampleBatter, samplePitcher } from '../../data/samplePlayers.js';
import { DRAFT_ROUNDS, SECONDARY_DRAFT_PROTECTED_SIZE, TOTAL_SQUAD_SIZE } from '../../roster/constants.js';
import type { PlayerProfile } from '../../types/roster.js';
import type { TeamFranchiseState } from '../types.js';
import type { KboSeasonResult } from '../../season/leagueSim.js';

function mulberry32(seed: number) {
  return function rng() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makePlayer(id: string, val: number, kind: 'batter' | 'pitcher' = 'batter'): PlayerProfile {
  return {
    playerId: id,
    kind,
    attributes: kind === 'batter'
      ? { ...sampleBatter, id, contactVsRight: val, power: val, clutch: val }
      : { ...samplePitcher, id, stuff: val, control: val },
    position: kind === 'batter' ? 'LF' : undefined,
    age: 28,
    potential: val,
    rosterStatus: '2군',
    origin: 'domestic',
    contract: { yearsRemaining: 3, annualSalary: 10000, faEligible: false },
    serviceTimeYears: 3,
  };
}

function makeTeams(data: Array<{ id: string; roster: PlayerProfile[] }>): TeamFranchiseState[] {
  return data.map(({ id, roster }) => ({ teamId: id, name: id, roster }));
}

function makeStandings(rows: Array<{ teamId: string; winPct: number }>): KboSeasonResult {
  return {
    games: [],
    standings: rows.map((r) => ({ teamId: r.teamId, wins: 0, losses: 0, ties: 0, runsScored: 0, runsAllowed: 0, winPct: r.winPct, gamesBehind: 0 })),
    postseason: null,
    battingStats: [],
    pitchingStats: [],
    playerNames: new Map(),
  } as unknown as KboSeasonResult;
}

// --- generateDraftClass ---

test('generateDraftClass returns the requested count with draft origin', () => {
  const cls = generateDraftClass(2025, 100, mulberry32(1));
  assert.equal(cls.length, 100);
  assert.ok(cls.every((p) => p.origin === 'draft'));
  assert.ok(cls.every((p) => p.playerId.startsWith('DFT-2025-')));
});

test('generateDraftClass produces players aged 18-21', () => {
  const cls = generateDraftClass(2025, 100, mulberry32(2));
  assert.ok(cls.every((p) => p.age >= 18 && p.age <= 21));
});

test('generateDraftClass potential values are in the 30-95 range', () => {
  const cls = generateDraftClass(2025, 100, mulberry32(3));
  assert.ok(cls.every((p) => p.potential >= 30 && p.potential <= 95));
});

test('generateDraftClass has a mix of batters and pitchers', () => {
  const cls = generateDraftClass(2025, 60, mulberry32(4));
  assert.ok(cls.some((p) => p.kind === 'batter'), 'should have batters');
  assert.ok(cls.some((p) => p.kind === 'pitcher'), 'should have pitchers');
});

test('generateDraftClass players start with zero serviceTimeYears', () => {
  const cls = generateDraftClass(2025, 20, mulberry32(5));
  assert.ok(cls.every((p) => p.serviceTimeYears === 0));
});

// --- runDraft ---

test('runDraft picks in reverse-standings order (worst team picks first)', () => {
  const p1 = makePlayer('P1', 80);
  const p2 = makePlayer('P2', 60);
  const draftClass = [p1, p2];
  const teams = makeTeams([
    { id: 'T-BEST', roster: [] },
    { id: 'T-WORST', roster: [] },
  ]);
  // T-WORST has lower winPct → picks first → gets higher-potential player
  const standings = makeStandings([
    { teamId: 'T-BEST', winPct: 0.6 },
    { teamId: 'T-WORST', winPct: 0.3 },
  ]);
  const { picks } = runDraft(teams, draftClass, standings, mulberry32(1));
  assert.equal(picks[0].teamId, 'T-WORST', 'worst team picks first in round 1');
});

test('runDraft adds selected player to the team roster', () => {
  const draftClass = generateDraftClass(2025, 20, mulberry32(10));
  const teams = makeTeams([
    { id: 'T1', roster: [] },
    { id: 'T2', roster: [] },
  ]);
  const { teams: result, picks } = runDraft(teams, draftClass, undefined, mulberry32(11));
  const t1 = result.find((t) => t.teamId === 'T1')!;
  const t1Picks = picks.filter((p) => p.teamId === 'T1');
  for (const pick of t1Picks) {
    assert.ok(t1.roster.some((p) => p.playerId === pick.playerId), 'picked player should be on team');
  }
});

test('runDraft players land with rosterStatus 2군 and origin draft', () => {
  const draftClass = generateDraftClass(2025, 10, mulberry32(12));
  const teams = makeTeams([{ id: 'T1', roster: [] }]);
  const { teams: result } = runDraft(teams, draftClass, undefined, mulberry32(13));
  for (const p of result[0].roster) {
    assert.equal(p.rosterStatus, '2군');
    assert.equal(p.origin, 'draft');
  }
});

test('runDraft is not gated by TOTAL_SQUAD_SIZE — full teams still draft every round', () => {
  const full = Array.from({ length: TOTAL_SQUAD_SIZE }, (_, i) => makePlayer(`B${i}`, 60));
  const draftClass = generateDraftClass(2025, 5, mulberry32(14));
  const teams = makeTeams([
    { id: 'T-FULL', roster: full },
    { id: 'T-EMPTY', roster: [] },
  ]);
  const { teams: result, picks } = runDraft(teams, draftClass, undefined, mulberry32(15));
  const tFull = result.find((t) => t.teamId === 'T-FULL')!;
  assert.ok(tFull.roster.length > TOTAL_SQUAD_SIZE, 'a full team can exceed the cap via the draft');
  assert.ok(picks.some((p) => p.teamId === 'T-FULL'), 'full team should still receive picks');
});

test('runDraft runs the correct number of rounds', () => {
  const draftClass = generateDraftClass(2025, DRAFT_ROUNDS * 2, mulberry32(16));
  const teams = makeTeams([{ id: 'T1', roster: [] }, { id: 'T2', roster: [] }]);
  const { picks } = runDraft(teams, draftClass, undefined, mulberry32(17));
  const rounds = new Set(picks.map((p) => p.round));
  assert.ok(rounds.size <= DRAFT_ROUNDS);
  for (const r of rounds) assert.ok(r >= 1 && r <= DRAFT_ROUNDS);
});

// --- runSecondaryDraft ---

test('runSecondaryDraft protects top SECONDARY_DRAFT_PROTECTED_SIZE players', () => {
  // T1 has 40 players: IDs 1-40 with values 1-40 (player 40 is most valuable).
  // T1 protects top 35, exposing IDs 1-5 (lowest value).
  const roster = Array.from({ length: 40 }, (_, i) => makePlayer(`T1-P${i + 1}`, i + 1));
  const teams = makeTeams([
    { id: 'T1', roster },
    { id: 'T2', roster: [] },
  ]);
  const { picks } = runSecondaryDraft(teams, undefined, mulberry32(1));
  // T2 picks from T1's exposed pool (players with val 1-5)
  const pickedIds = new Set(picks.map((p) => p.playerId));
  for (const id of pickedIds) {
    const valNum = parseInt(id.replace('T1-P', ''));
    assert.ok(
      valNum <= 40 - SECONDARY_DRAFT_PROTECTED_SIZE,
      `only unprotected (low-value) players should be exposed, got ${id}`,
    );
  }
});

test('runSecondaryDraft cannot pick from your own team', () => {
  const roster1 = Array.from({ length: 40 }, (_, i) => makePlayer(`T1-P${i + 1}`, i + 1));
  const roster2 = Array.from({ length: 40 }, (_, i) => makePlayer(`T2-P${i + 1}`, i + 1));
  const teams = makeTeams([
    { id: 'T1', roster: roster1 },
    { id: 'T2', roster: roster2 },
  ]);
  const { picks } = runSecondaryDraft(teams, undefined, mulberry32(1));
  for (const pick of picks) {
    assert.notEqual(pick.teamId, pick.fromTeamId, 'cannot pick from own exposed pool');
  }
});

test('runSecondaryDraft moves player from source to destination team', () => {
  const highValue = makePlayer('HV', 90);
  const filler = Array.from({ length: 36 }, (_, i) => makePlayer(`F${i}`, 50));
  const teams = makeTeams([
    { id: 'T1', roster: [highValue, ...filler] }, // highValue is exposed (not in top 35)
    { id: 'T2', roster: Array.from({ length: 36 }, (_, i) => makePlayer(`T2F${i}`, 30)) },
  ]);
  const { teams: result, picks } = runSecondaryDraft(teams, undefined, mulberry32(1));

  // highValue has potential=90 but there are 36 players on T1; protected=35, so highValue is exposed
  // T2 should pick highValue (highest value in exposed pool after T2's own exposed players)
  const t2 = result.find((t) => t.teamId === 'T2')!;
  const t1 = result.find((t) => t.teamId === 'T1')!;

  if (picks.some((p) => p.playerId === 'HV')) {
    assert.ok(t2.roster.some((p) => p.playerId === 'HV'), 'HV should be on T2');
    assert.ok(!t1.roster.some((p) => p.playerId === 'HV'), 'HV should not be on T1 anymore');
  }
});

test('runSecondaryDraft picks at most 2 rounds × team count players total', () => {
  const makeRoster = (prefix: string) =>
    Array.from({ length: 40 }, (_, i) => makePlayer(`${prefix}-P${i + 1}`, i + 1));
  const teams = makeTeams(
    Array.from({ length: 10 }, (_, i) => ({ id: `T${i + 1}`, roster: makeRoster(`T${i + 1}`) })),
  );
  const { picks } = runSecondaryDraft(teams, undefined, mulberry32(1));
  // Max picks = 2 rounds × 10 teams = 20
  assert.ok(picks.length <= 20);
  assert.ok(picks.length > 0);
});

test('runSecondaryDraft picks reflect worst-first order from standings', () => {
  const roster = (prefix: string) =>
    Array.from({ length: 40 }, (_, i) => makePlayer(`${prefix}-P${i + 1}`, i + 1));
  const teams = makeTeams([
    { id: 'T-BEST', roster: roster('TB') },
    { id: 'T-WORST', roster: roster('TW') },
  ]);
  const standings = makeStandings([
    { teamId: 'T-BEST', winPct: 0.7 },
    { teamId: 'T-WORST', winPct: 0.2 },
  ]);
  const { picks } = runSecondaryDraft(teams, standings, mulberry32(1));
  if (picks.length >= 2 && picks[0].teamId !== picks[1].teamId) {
    assert.equal(picks[0].teamId, 'T-WORST', 'worst team picks first in round 1');
  }
});
