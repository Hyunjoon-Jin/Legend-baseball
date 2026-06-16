import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decrementContracts, processFADeclarations, runDomesticFAMarket } from './freeAgency.js';
import { runForeignSigningMarket } from './foreignSigning.js';
import { runAsiaQuotaSigningMarket } from './asiaQuotaSigning.js';
import { generateForeignFreeAgentPool, generateAsiaQuotaFreeAgentPool } from '../../data/playerPoolGenerator.js';
import { sampleBatter, samplePitcher } from '../../data/samplePlayers.js';
import { FA_ELIGIBILITY_YEARS, TOTAL_SQUAD_SIZE } from '../../roster/constants.js';
import type { PlayerProfile, Position } from '../../types/roster.js';
import type { TeamFranchiseState } from '../types.js';

function mulberry32(seed: number) {
  return function rng() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeDomesticBatter(
  id: string,
  val: number,
  yearsRemaining: number,
  serviceTimeYears: number,
  position: Position = 'LF',
  rosterStatus: PlayerProfile['rosterStatus'] = '2군',
): PlayerProfile {
  return {
    playerId: id,
    kind: 'batter',
    attributes: {
      ...sampleBatter,
      id,
      contactVsRight: val,
      contactVsLeft: val,
      power: val,
      plateDiscipline: val,
      badBallHitting: val,
      speed: val,
      clutch: val,
    },
    position,
    age: 32,
    potential: 75,
    rosterStatus,
    origin: 'domestic',
    contract: { yearsRemaining, annualSalary: 10000, faEligible: serviceTimeYears >= FA_ELIGIBILITY_YEARS },
    serviceTimeYears,
  };
}

function makeForeignPitcher(id: string, yearsRemaining: number, stuffRating = 65): PlayerProfile {
  return {
    playerId: id,
    kind: 'pitcher',
    attributes: { ...samplePitcher, id, stuff: stuffRating, control: stuffRating, stamina: stuffRating, mentalStrength: stuffRating },
    age: 30,
    potential: 75,
    rosterStatus: '2군',
    origin: 'foreign',
    nationality: 'Dominican Republic',
    contract: { yearsRemaining, annualSalary: 100000, faEligible: false },
    serviceTimeYears: 1,
  };
}

function makeAsiaQuotaBatter(id: string, yearsRemaining: number, position: Position = 'SS'): PlayerProfile {
  return {
    playerId: id,
    kind: 'batter',
    attributes: { ...sampleBatter, id },
    position,
    age: 28,
    potential: 70,
    rosterStatus: '2군',
    origin: 'asiaQuota',
    nationality: 'Japan',
    contract: { yearsRemaining, annualSalary: 80000, faEligible: false },
    serviceTimeYears: 1,
  };
}

function makeTeams(data: Array<{ id: string; roster: PlayerProfile[] }>): TeamFranchiseState[] {
  return data.map(({ id, roster }) => ({ teamId: id, name: id, roster }));
}

// --- decrementContracts ---

test('decrementContracts reduces yearsRemaining by 1', () => {
  const p1 = makeDomesticBatter('B1', 70, 3, 5);
  const p2 = makeDomesticBatter('B2', 70, 1, 5);
  const result = decrementContracts([p1, p2]);
  assert.equal(result[0].contract.yearsRemaining, 2);
  assert.equal(result[1].contract.yearsRemaining, 0);
  assert.equal(result[0].playerId, 'B1');
});

test('decrementContracts clamps yearsRemaining at 0', () => {
  const p = makeDomesticBatter('B1', 70, 0, 5);
  const result = decrementContracts([p]);
  assert.equal(result[0].contract.yearsRemaining, 0);
});

// --- processFADeclarations ---

test('processFADeclarations removes eligible player automatically', () => {
  const fa = makeDomesticBatter('FA1', 70, 0, FA_ELIGIBILITY_YEARS);
  const teams = makeTeams([{ id: 'T1', roster: [fa] }]);
  const { teams: result, newFreeAgents } = processFADeclarations(teams);
  assert.equal(result[0].roster.length, 0);
  assert.equal(newFreeAgents.length, 1);
  assert.equal(newFreeAgents[0].playerId, 'FA1');
  assert.equal(newFreeAgents[0].contract.faEligible, true);
});

test('processFADeclarations keeps player with years remaining on contract', () => {
  const locked = makeDomesticBatter('B1', 70, 1, FA_ELIGIBILITY_YEARS);
  const teams = makeTeams([{ id: 'T1', roster: [locked] }]);
  const { teams: result, newFreeAgents } = processFADeclarations(teams);
  assert.equal(result[0].roster.length, 1);
  assert.equal(newFreeAgents.length, 0);
});

test('processFADeclarations keeps player with insufficient service time', () => {
  const notEligible = makeDomesticBatter('B1', 70, 0, FA_ELIGIBILITY_YEARS - 1);
  const teams = makeTeams([{ id: 'T1', roster: [notEligible] }]);
  const { teams: result, newFreeAgents } = processFADeclarations(teams);
  assert.equal(result[0].roster.length, 1);
  assert.equal(newFreeAgents.length, 0);
});

test('processFADeclarations ignores non-domestic players regardless of service time', () => {
  const foreigner = makeForeignPitcher('F1', 0);
  const asiaPlayer = makeAsiaQuotaBatter('AQ1', 0);
  const teams = makeTeams([{ id: 'T1', roster: [foreigner, asiaPlayer] }]);
  const { teams: result, newFreeAgents } = processFADeclarations(teams);
  assert.equal(result[0].roster.length, 2);
  assert.equal(newFreeAgents.length, 0);
});

// --- runDomesticFAMarket ---

test('runDomesticFAMarket signs FA to team with fewest players at that position', () => {
  const fa = makeDomesticBatter('FA1', 70, 0, FA_ELIGIBILITY_YEARS, 'LF');
  const p1 = makeDomesticBatter('B1', 70, 3, 3, 'LF');
  const p2 = makeDomesticBatter('B2', 70, 3, 3, 'LF');
  const p3 = makeDomesticBatter('B3', 70, 3, 3, 'LF');
  const teams = makeTeams([
    { id: 'T1', roster: [p1] },       // 1 LF
    { id: 'T2', roster: [p2, p3] },   // 2 LF — less need
  ]);
  const { teams: result, signed, unsigned } = runDomesticFAMarket(teams, [fa], mulberry32(1));
  assert.equal(signed.length, 1);
  assert.equal(unsigned.length, 0);
  const t1 = result.find((t) => t.teamId === 'T1')!;
  assert.ok(t1.roster.some((p) => p.playerId === 'FA1'), 'FA should sign with T1 (fewer LF)');
  assert.equal(t1.roster.find((p) => p.playerId === 'FA1')!.rosterStatus, '2군');
});

test('runDomesticFAMarket leaves FA unsigned when all teams are at capacity', () => {
  const fa = makeDomesticBatter('FA1', 70, 0, FA_ELIGIBILITY_YEARS, 'LF');
  const full = Array.from({ length: TOTAL_SQUAD_SIZE }, (_, i) =>
    makeDomesticBatter(`B${i}`, 70, 3, 3, 'LF'),
  );
  const teams = makeTeams([{ id: 'T1', roster: full }]);
  const { signed, unsigned } = runDomesticFAMarket(teams, [fa], mulberry32(1));
  assert.equal(signed.length, 0);
  assert.equal(unsigned.length, 1);
  assert.equal(unsigned[0].playerId, 'FA1');
});

test('runDomesticFAMarket grants signed player a new multi-year contract', () => {
  const fa = makeDomesticBatter('FA1', 70, 0, FA_ELIGIBILITY_YEARS, 'LF');
  const teams = makeTeams([{ id: 'T1', roster: [] }]);
  const { signed } = runDomesticFAMarket(teams, [fa], mulberry32(1));
  assert.equal(signed.length, 1);
  assert.ok(signed[0].contract.yearsRemaining >= 2);
  assert.equal(signed[0].contract.faEligible, false);
});

// --- runForeignSigningMarket ---

test('runForeignSigningMarket retains foreign player with years remaining', () => {
  const p = makeForeignPitcher('F1', 2);
  const teams = makeTeams([{ id: 'T1', roster: [p] }]);
  const { teams: result } = runForeignSigningMarket(teams, [], mulberry32(1));
  assert.equal(result[0].roster.length, 1);
  assert.equal(result[0].roster[0].contract.yearsRemaining, 2);
});

test('runForeignSigningMarket fills vacant slot from pool when player is released', () => {
  const p = makeForeignPitcher('F1', 0);
  const poolPlayer = makeForeignPitcher('POOL1', 1);
  const teams = makeTeams([{ id: 'T1', roster: [p] }]);
  // rng = 1 (>= renewal prob) → F1 is released
  const { teams: result } = runForeignSigningMarket(teams, [poolPlayer], () => 1);
  assert.ok(!result[0].roster.some((r) => r.playerId === 'F1'), 'released player should be gone');
  assert.ok(result[0].roster.some((r) => r.playerId === 'POOL1'), 'pool player should be added');
});

test('runForeignSigningMarket high-rated player has 70% renewal chance vs 50% for low-rated', () => {
  const highRated: PlayerProfile = {
    playerId: 'FHigh',
    kind: 'pitcher',
    attributes: { ...samplePitcher, id: 'FHigh', stuff: 75, control: 75, stamina: 75, mentalStrength: 75 },
    age: 30, potential: 80, rosterStatus: '2군',
    origin: 'foreign',
    contract: { yearsRemaining: 0, annualSalary: 100000, faEligible: false },
    serviceTimeYears: 1,
  };
  const lowRated: PlayerProfile = {
    playerId: 'FLow',
    kind: 'pitcher',
    attributes: { ...samplePitcher, id: 'FLow', stuff: 40, control: 40, stamina: 40, mentalStrength: 40 },
    age: 30, potential: 50, rosterStatus: '2군',
    origin: 'foreign',
    contract: { yearsRemaining: 0, annualSalary: 100000, faEligible: false },
    serviceTimeYears: 1,
  };
  const teamsHigh = makeTeams([{ id: 'T1', roster: [highRated] }]);
  const teamsLow = makeTeams([{ id: 'T1', roster: [lowRated] }]);
  // rng = 0.65: < 0.7 (high renews) but >= 0.5 (low released)
  const highResult = runForeignSigningMarket(teamsHigh, [], () => 0.65);
  const lowResult = runForeignSigningMarket(teamsLow, [], () => 0.65);
  assert.ok(highResult.teams[0].roster.some((p) => p.playerId === 'FHigh'), 'high-rated should renew');
  assert.equal(lowResult.teams[0].roster.length, 0, 'low-rated should be released');
});

test('runForeignSigningMarket returns unused pool players', () => {
  const teams = makeTeams([{ id: 'T1', roster: [makeForeignPitcher('F1', 2), makeForeignPitcher('F2', 2), makeForeignPitcher('F3', 2)] }]);
  const poolPlayer = makeForeignPitcher('POOL1', 1);
  const { unused } = runForeignSigningMarket(teams, [poolPlayer], mulberry32(1));
  assert.equal(unused.length, 1);
  assert.equal(unused[0].playerId, 'POOL1');
});

// --- runAsiaQuotaSigningMarket ---

test('runAsiaQuotaSigningMarket fills vacant slot from pool', () => {
  const teams = makeTeams([{ id: 'T1', roster: [] }]);
  const pool = [makeAsiaQuotaBatter('AQ1', 1)];
  const { teams: result, unused } = runAsiaQuotaSigningMarket(teams, pool, mulberry32(1));
  assert.ok(result[0].roster.some((p) => p.playerId === 'AQ1'));
  assert.equal(unused.length, 0);
});

test('runAsiaQuotaSigningMarket does not exceed ASIA_QUOTA_SLOTS when slot is filled', () => {
  const existing = makeAsiaQuotaBatter('AQ1', 2);
  const teams = makeTeams([{ id: 'T1', roster: [existing] }]);
  const extra = makeAsiaQuotaBatter('AQ2', 1);
  const { teams: result, unused } = runAsiaQuotaSigningMarket(teams, [extra], mulberry32(1));
  assert.equal(result[0].roster.filter((p) => p.origin === 'asiaQuota').length, 1, 'only 1 Asia-quota slot');
  assert.equal(unused.length, 1, 'extra pool player should be unused');
});

// --- generateForeignFreeAgentPool ---

test('generateForeignFreeAgentPool returns the requested count with foreign origin', () => {
  const pool = generateForeignFreeAgentPool(2025, 15, mulberry32(99));
  assert.equal(pool.length, 15);
  assert.ok(pool.every((p) => p.origin === 'foreign'));
  assert.ok(pool.every((p) => p.playerId.startsWith('FGN-2025-')));
});

test('generateForeignFreeAgentPool produces both batters and pitchers', () => {
  const pool = generateForeignFreeAgentPool(2025, 30, mulberry32(42));
  assert.ok(pool.some((p) => p.kind === 'pitcher'), 'should have pitchers');
  assert.ok(pool.some((p) => p.kind === 'batter'), 'should have batters');
});

// --- generateAsiaQuotaFreeAgentPool ---

test('generateAsiaQuotaFreeAgentPool returns the requested count as batters with asiaQuota origin', () => {
  const pool = generateAsiaQuotaFreeAgentPool(2025, 10, mulberry32(77));
  assert.equal(pool.length, 10);
  assert.ok(pool.every((p) => p.origin === 'asiaQuota'));
  assert.ok(pool.every((p) => p.playerId.startsWith('AQT-2025-')));
  assert.ok(pool.every((p) => p.kind === 'batter'));
});
