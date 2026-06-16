import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playerValue, evaluateTrade, willAccept } from './evaluation.js';
import { executeTrade, buildPostTradeRosters } from './execution.js';
import { sampleBatter, samplePitcher } from '../../data/samplePlayers.js';
import { TRADE_DEADLINE_GAME_INDEX, PEAK_AGE_BATTER } from '../../roster/constants.js';
import type { PlayerProfile } from '../../types/roster.js';
import type { FranchiseState } from '../types.js';
import type { TradeProposal } from './types.js';

/** Returns a profile where every overallRating-affecting attribute equals `val`. */
function makeBatter(
  id: string,
  val: number,
  age: number,
  potential: number,
  yearsRemaining = 3,
  rosterStatus: PlayerProfile['rosterStatus'] = '2군',
  position: PlayerProfile['position'] = 'LF',
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
    age,
    potential,
    rosterStatus,
    origin: 'domestic',
    contract: { yearsRemaining, annualSalary: 10000, faEligible: false },
    serviceTimeYears: 3,
  };
}

function makePitcher(
  id: string,
  val: number,
  age: number,
  potential: number,
  rosterStatus: PlayerProfile['rosterStatus'] = '2군',
): PlayerProfile {
  return {
    playerId: id,
    kind: 'pitcher',
    attributes: {
      ...samplePitcher,
      id,
      stuff: val,
      control: val,
      stamina: val,
      mentalStrength: val,
      sequencingSkill: val,
    },
    age,
    potential,
    rosterStatus,
    origin: 'domestic',
    contract: { yearsRemaining: 3, annualSalary: 10000, faEligible: false },
    serviceTimeYears: 3,
  };
}

function makeState(teamsData: Array<{ id: string; roster: PlayerProfile[] }>): FranchiseState {
  return {
    year: 2025,
    phase: 'regularSeason',
    teams: teamsData.map(({ id, roster }) => ({ teamId: id, name: id, roster })),
    draftPoolNextYear: [],
    domesticFreeAgents: [],
    foreignFreeAgents: [],
    asiaQuotaFreeAgents: [],
    retiredPlayers: [],
    transactionLog: [],
  };
}

// --- playerValue ---

test('playerValue adds a potential premium for young pre-peak players', () => {
  const young = makeBatter('B-young', 70, PEAK_AGE_BATTER - 3, 90);
  const prime = makeBatter('B-prime', 70, PEAK_AGE_BATTER + 3, 90);

  assert.ok(playerValue(young) > playerValue(prime));
});

test('playerValue increases with more years remaining on contract', () => {
  const longDeal = makeBatter('B-long', 70, 30, 80, 4);
  const shortDeal = makeBatter('B-short', 70, 30, 80, 1);

  assert.ok(playerValue(longDeal) > playerValue(shortDeal));
  assert.equal(playerValue(longDeal) - playerValue(shortDeal), (4 - 1) * 2);
});

test('playerValue computes the expected number for a known batter profile', () => {
  // overallRating = 70 (uniform fields), age=24 < peakAge=27, potential=90, yearsRemaining=3
  // potentialBonus = (90-70)*((27-24)/27)*2 = 20*(3/27)*2 ≈ 4
  // contractBonus = 3*2 = 6
  // total ≈ 80
  const batter = makeBatter('B', 70, 24, 90, 3);
  assert.equal(playerValue(batter), 80);
});

// --- evaluateTrade ---

test('evaluateTrade returns symmetric gains summing to zero', () => {
  const pA = makeBatter('A1', 70, 24, 90, 3);
  const pB = makeBatter('B1', 70, 30, 80, 3);
  const state = makeState([
    { id: 'TA', roster: [pA] },
    { id: 'TB', roster: [pB] },
  ]);

  const proposal: TradeProposal = { teamAId: 'TA', teamBId: 'TB', playersFromA: ['A1'], playersFromB: ['B1'] };
  const { aGain, bGain } = evaluateTrade(proposal, state);

  assert.equal(aGain + bGain, 0);
});

test('evaluateTrade correctly identifies the team receiving more value', () => {
  const cheap = makeBatter('A1', 50, 30, 60, 1);
  const valuable = makeBatter('B1', 70, 24, 90, 3);
  const state = makeState([
    { id: 'TA', roster: [cheap] },
    { id: 'TB', roster: [valuable] },
  ]);

  const proposal: TradeProposal = { teamAId: 'TA', teamBId: 'TB', playersFromA: ['A1'], playersFromB: ['B1'] };
  const { aGain } = evaluateTrade(proposal, state);

  assert.ok(aGain > 0, 'team A receives the more valuable player and should show positive gain');
});

// --- willAccept ---

test('willAccept returns true when gain exceeds -tolerance', () => {
  const pA = makeBatter('A1', 70, 24, 90, 3);  // value 80
  const pB = makeBatter('B1', 70, 30, 80, 3);  // lower value (no potential bonus)
  const state = makeState([
    { id: 'TA', roster: [pA] },
    { id: 'TB', roster: [pB] },
  ]);

  const proposal: TradeProposal = { teamAId: 'TA', teamBId: 'TB', playersFromA: ['A1'], playersFromB: ['B1'] };
  const evaluation = evaluateTrade(proposal, state);

  // Team B loses value (bGain is negative) but should still accept within tolerance=20.
  assert.ok(willAccept('TB', proposal, state, evaluation, 20));
  // With zero tolerance, the losing team rejects.
  assert.equal(willAccept('TB', proposal, state, evaluation, 0), evaluation.bGain >= 0);
});

test('willAccept rejects if sending away the last 1군 starter at a position', () => {
  const sole1B = makeBatter('A-sole-1B', 70, 30, 70, 3, '1군', '1B');
  const other = makeBatter('B1', 60, 30, 70);
  const state = makeState([
    { id: 'TA', roster: [sole1B] },
    { id: 'TB', roster: [other] },
  ]);

  const proposal: TradeProposal = { teamAId: 'TA', teamBId: 'TB', playersFromA: ['A-sole-1B'], playersFromB: ['B1'] };
  const evaluation = evaluateTrade(proposal, state);

  // Even if the gain would be positive (team A receives a player back), depth check blocks this.
  assert.equal(willAccept('TA', proposal, state, evaluation, 100), false);
});

test('willAccept allows sending a 1군 player if another covers the same position', () => {
  const p1 = makeBatter('A1', 70, 30, 70, 3, '1군', '1B');
  const p2 = makeBatter('A2', 60, 30, 70, 3, '1군', '1B');  // second 1B
  const pB = makeBatter('B1', 70, 30, 70);
  const state = makeState([
    { id: 'TA', roster: [p1, p2] },
    { id: 'TB', roster: [pB] },
  ]);

  const proposal: TradeProposal = { teamAId: 'TA', teamBId: 'TB', playersFromA: ['A1'], playersFromB: ['B1'] };
  const evaluation = evaluateTrade(proposal, state);

  assert.ok(willAccept('TA', proposal, state, evaluation, 10));
});

// --- executeTrade / buildPostTradeRosters ---

test('executeTrade moves players to the correct teams and logs a transaction', () => {
  const pA = makeBatter('A1', 70, 24, 90);
  const pB = makeBatter('B1', 65, 30, 80);
  const state = makeState([
    { id: 'TA', roster: [pA] },
    { id: 'TB', roster: [pB] },
  ]);

  const proposal: TradeProposal = { teamAId: 'TA', teamBId: 'TB', playersFromA: ['A1'], playersFromB: ['B1'] };
  const result = executeTrade(proposal, state, 50);

  const teamA = result.teams.find((t) => t.teamId === 'TA')!;
  const teamB = result.teams.find((t) => t.teamId === 'TB')!;

  assert.ok(teamA.roster.some((p) => p.playerId === 'B1'), 'B1 should now be on team A');
  assert.ok(teamB.roster.some((p) => p.playerId === 'A1'), 'A1 should now be on team B');
  assert.ok(!teamA.roster.some((p) => p.playerId === 'A1'));
  assert.ok(!teamB.roster.some((p) => p.playerId === 'B1'));

  assert.equal(result.transactionLog.length, 1);
  assert.equal(result.transactionLog[0].type, 'trade');
  assert.deepEqual([...result.transactionLog[0].playerIds].sort(), ['A1', 'B1'].sort());
});

test('incoming players are set to 2군 regardless of their prior status', () => {
  const pA = makeBatter('A1', 70, 28, 75, 3, '1군');
  const pB = makeBatter('B1', 65, 28, 75, 3, '1군');
  const state = makeState([
    { id: 'TA', roster: [pA] },
    { id: 'TB', roster: [pB] },
  ]);

  const proposal: TradeProposal = { teamAId: 'TA', teamBId: 'TB', playersFromA: ['A1'], playersFromB: ['B1'] };
  const result = executeTrade(proposal, state, 0);

  const teamA = result.teams.find((t) => t.teamId === 'TA')!;
  const teamB = result.teams.find((t) => t.teamId === 'TB')!;

  assert.equal(teamA.roster.find((p) => p.playerId === 'B1')!.rosterStatus, '2군');
  assert.equal(teamB.roster.find((p) => p.playerId === 'A1')!.rosterStatus, '2군');
});

test('executeTrade at or before the deadline succeeds; past the deadline is a no-op', () => {
  const pA = makePitcher('PA', 65, 27, 75);
  const pB = makePitcher('PB', 65, 27, 75);
  const state = makeState([
    { id: 'TA', roster: [pA] },
    { id: 'TB', roster: [pB] },
  ]);

  const proposal: TradeProposal = { teamAId: 'TA', teamBId: 'TB', playersFromA: ['PA'], playersFromB: ['PB'] };

  const atDeadline = executeTrade(proposal, state, TRADE_DEADLINE_GAME_INDEX);
  assert.notEqual(atDeadline, state);
  assert.equal(atDeadline.transactionLog.length, 1);

  const pastDeadline = executeTrade(proposal, state, TRADE_DEADLINE_GAME_INDEX + 1);
  assert.equal(pastDeadline, state);
  assert.equal(pastDeadline.transactionLog.length, 0);
});

test('buildPostTradeRosters preserves total player count', () => {
  const teamA = [makeBatter('A1', 70, 27, 80), makeBatter('A2', 65, 27, 75)];
  const teamB = [makeBatter('B1', 68, 27, 82), makePitcher('B2', 72, 27, 85)];

  const proposal: TradeProposal = { teamAId: 'TA', teamBId: 'TB', playersFromA: ['A1'], playersFromB: ['B1', 'B2'] };
  const [newA, newB] = buildPostTradeRosters(proposal, teamA, teamB);

  assert.equal(newA.length + newB.length, teamA.length + teamB.length);
  assert.ok(newA.some((p) => p.playerId === 'B1'));
  assert.ok(newA.some((p) => p.playerId === 'B2'));
  assert.ok(newA.some((p) => p.playerId === 'A2'));
  assert.ok(newB.some((p) => p.playerId === 'A1'));
});
