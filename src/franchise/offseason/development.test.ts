import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ageOnePlayer, developRoster } from './development.js';
import { sampleBatter, samplePitcher } from '../../data/samplePlayers.js';
import { RETIREMENT_SOFT_AGE, RETIREMENT_HARD_AGE, GAMES_PER_SERVICE_YEAR } from '../../roster/constants.js';
import type { PlayerProfile } from '../../types/roster.js';

/** Shorthand for "registered on 1군 the full season" in tests that don't care about service time. */
const FULL_SEASON = GAMES_PER_SERVICE_YEAR;

function makeBatter(
  id: string,
  age: number,
  potential: number,
  overrides: Partial<PlayerProfile['attributes']> = {},
  rosterStatus: PlayerProfile['rosterStatus'] = '1군',
): PlayerProfile {
  return {
    playerId: id,
    kind: 'batter',
    attributes: { ...sampleBatter, id, ...overrides },
    position: 'LF',
    age,
    potential,
    rosterStatus,
    origin: 'domestic',
    contract: { yearsRemaining: 3, annualSalary: 10000, faEligible: false },
    serviceTimeYears: 3,
  };
}

function makePitcher(
  id: string,
  age: number,
  potential: number,
  overrides: Partial<PlayerProfile['attributes']> = {},
  rosterStatus: PlayerProfile['rosterStatus'] = '1군',
): PlayerProfile {
  return {
    playerId: id,
    kind: 'pitcher',
    attributes: { ...samplePitcher, id, ...overrides },
    age,
    potential,
    rosterStatus,
    origin: 'domestic',
    contract: { yearsRemaining: 3, annualSalary: 10000, faEligible: false },
    serviceTimeYears: 3,
  };
}

test('ageOnePlayer grows a young batter\'s attributes toward potential', () => {
  const player = makeBatter('B-young', 20, 90, { contactVsRight: 50 });
  const result = ageOnePlayer(player, FULL_SEASON, () => 0.5);

  assert.equal(result.age, 21);
  assert.equal(result.serviceTimeYears, 4);
  // peakAge(27) - newAge(21) = 6; growthRate = 6 * 0.4 = 2.4; 50 + 2.4 -> 52
  assert.equal((result.attributes as typeof sampleBatter).contactVsRight, 52);
  assert.equal(result.potential, 90);
});

test('ageOnePlayer grows a young pitcher\'s attributes toward potential', () => {
  const player = makePitcher('P-young', 20, 90, { stuff: 50 });
  const result = ageOnePlayer(player, FULL_SEASON, () => 0.5);

  // peakAge(28) - newAge(21) = 7; growthRate = 7 * 0.4 = 2.8; 50 + 2.8 -> 53
  assert.equal((result.attributes as typeof samplePitcher).stuff, 53);
});

test('ageOnePlayer declines a veteran batter\'s attributes past peak age', () => {
  const player = makeBatter('B-veteran', 35, 70, { contactVsRight: 70 });
  const result = ageOnePlayer(player, FULL_SEASON, () => 0.5);

  assert.equal(result.age, 36);
  // newAge(36) - peakAge(27) = 9; declineRate = 9 * 0.3 = 2.7, accelerated (>33) -> 4.05; jitter(0.5) = 0
  assert.equal((result.attributes as typeof sampleBatter).contactVsRight, 66);
});

test('ageOnePlayer never grows or shrinks potential itself', () => {
  const young = ageOnePlayer(makeBatter('B-1', 20, 90), FULL_SEASON, () => 0.5);
  const veteran = ageOnePlayer(makeBatter('B-2', 35, 70), FULL_SEASON, () => 0.5);

  assert.equal(young.potential, 90);
  assert.equal(veteran.potential, 70);
});

test('ageOnePlayer forces retirement at RETIREMENT_HARD_AGE regardless of rng', () => {
  const player = makeBatter('B-old', RETIREMENT_HARD_AGE - 1, 60);
  const result = ageOnePlayer(player, FULL_SEASON, () => 0.99);

  assert.equal(result.age, RETIREMENT_HARD_AGE);
  assert.equal(result.rosterStatus, '은퇴');
  assert.equal(result.potential, 60);
});

test('ageOnePlayer does not consider retirement below RETIREMENT_SOFT_AGE', () => {
  const player = makeBatter('B-prime', RETIREMENT_SOFT_AGE - 2, 70, {}, '1군');
  const result = ageOnePlayer(player, FULL_SEASON, () => 0);

  assert.equal(result.age, RETIREMENT_SOFT_AGE - 1);
  assert.equal(result.rosterStatus, '1군');
});

test('ageOnePlayer with zero retirement probability never retires at the soft age', () => {
  const player = makeBatter('B-soft', RETIREMENT_SOFT_AGE - 1, 90, {}, '1군');
  const result = ageOnePlayer(player, FULL_SEASON, () => 0);

  // age -> RETIREMENT_SOFT_AGE, overallRating(sampleBatter) >= 40, rosterStatus '1군' -> retireProb = 0
  assert.equal(result.age, RETIREMENT_SOFT_AGE);
  assert.equal(result.rosterStatus, '1군');
});

test('ageOnePlayer rolls a probabilistic retirement for an aging, low-rated 2군 player', () => {
  const lowAttrs = {
    contactVsRight: 30, contactVsLeft: 30, power: 30, plateDiscipline: 30,
    badBallHitting: 30, speed: 30, clutch: 30,
  };
  const player = makeBatter('B-fringe', RETIREMENT_SOFT_AGE, 60, lowAttrs, '2군');

  // retireProb = (37-36)*0.08 + 0.15 (rating<40) + 0.1 (2군) = 0.33
  const retired = ageOnePlayer(player, 0, () => 0.1);
  assert.equal(retired.rosterStatus, '은퇴');

  const survived = ageOnePlayer(player, 0, () => 0.9);
  assert.equal(survived.rosterStatus, '2군');
});

test('developRoster splits forced retirees out of the roster', () => {
  const young = makeBatter('B-young', 20, 80);
  const old = makePitcher('P-old', RETIREMENT_HARD_AGE - 1, 60);

  const registeredGames = new Map([['B-young', FULL_SEASON], ['P-old', FULL_SEASON]]);
  const { roster, retired } = developRoster([young, old], registeredGames, () => 0.5);

  assert.deepEqual(roster.map((p) => p.playerId), ['B-young']);
  assert.deepEqual(retired.map((p) => p.playerId), ['P-old']);
  assert.equal(retired[0].rosterStatus, '은퇴');
  assert.equal(retired[0].age, RETIREMENT_HARD_AGE);
  assert.equal(roster[0].age, 21);
});

// --- service-time accrual (registered-days based) ---

test('ageOnePlayer grants no service-time credit for a player who never left 2군', () => {
  const player = makeBatter('B-bench', 25, 60, {}, '2군');
  const result = ageOnePlayer(player, 0, () => 0.5);

  assert.equal(result.serviceTimeYears, 3, 'no games registered this season -> no year earned');
  assert.equal(result.registeredDaysCarry ?? 0, 0);
});

test('ageOnePlayer credits a full service year for a player registered the whole season', () => {
  const player = makeBatter('B-everyday', 25, 60);
  const result = ageOnePlayer(player, FULL_SEASON, () => 0.5);

  assert.equal(result.serviceTimeYears, 4);
  assert.equal(result.registeredDaysCarry ?? 0, 0);
});

test('ageOnePlayer carries a partial season\'s registered games forward without granting a year', () => {
  const player = makeBatter('B-callup', 25, 60);
  const halfSeason = Math.floor(FULL_SEASON / 2);
  const result = ageOnePlayer(player, halfSeason, () => 0.5);

  assert.equal(result.serviceTimeYears, 3, 'partial season alone should not earn a year');
  assert.equal(result.registeredDaysCarry, halfSeason);
});

test('ageOnePlayer combines carried-over days with a new season to earn a year once the threshold is crossed', () => {
  const halfSeason = Math.floor(FULL_SEASON / 2);
  const withCarry: PlayerProfile = { ...makeBatter('B-carry', 26, 60), registeredDaysCarry: halfSeason };
  const result = ageOnePlayer(withCarry, halfSeason, () => 0.5);

  assert.equal(result.serviceTimeYears, 4, 'two half-seasons together cross the threshold');
  assert.equal(result.registeredDaysCarry, halfSeason * 2 - FULL_SEASON);
});

test('developRoster treats a missing entry in registeredGames as zero games', () => {
  const bench = makeBatter('B-untracked', 25, 60, {}, '2군');
  const { roster } = developRoster([bench], new Map(), () => 0.5);

  assert.equal(roster[0].serviceTimeYears, 3);
});
