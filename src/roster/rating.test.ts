import { test } from 'node:test';
import assert from 'node:assert/strict';
import { batterOverallRating, pitcherOverallRating, overallRating } from './rating.js';
import { sampleBatter, samplePitcher } from '../data/samplePlayers.js';
import type { PlayerProfile } from '../types/roster.js';

test('batterOverallRating weighs contact, power, discipline, speed, badBallHitting, and clutch', () => {
  // contact = (68+60)/2 = 64
  // 64*0.3 + 72*0.25 + 58*0.15 + 60*0.1 + 50*0.1 + 55*0.1 = 62.4 -> 62
  assert.equal(batterOverallRating(sampleBatter), 62);
});

test('pitcherOverallRating weighs stuff, control, stamina, mentalStrength, and sequencingSkill', () => {
  // 70*0.35 + 62*0.3 + 65*0.15 + 60*0.1 + 58*0.1 = 64.65 -> 65
  assert.equal(pitcherOverallRating(samplePitcher), 65);
});

test('overallRating dispatches on PlayerProfile.kind', () => {
  const batterProfile: PlayerProfile = {
    playerId: 'P00-001',
    kind: 'batter',
    attributes: sampleBatter,
    position: 'LF',
    age: 27,
    potential: 70,
    rosterStatus: '1군',
    origin: 'domestic',
    contract: { yearsRemaining: 3, annualSalary: 10000, faEligible: false },
    serviceTimeYears: 5,
  };
  const pitcherProfile: PlayerProfile = {
    ...batterProfile,
    playerId: 'P00-002',
    kind: 'pitcher',
    attributes: samplePitcher,
    position: undefined,
  };

  assert.equal(overallRating(batterProfile), batterOverallRating(sampleBatter));
  assert.equal(overallRating(pitcherProfile), pitcherOverallRating(samplePitcher));
});

test('ratings stay within the 1-99 range for extreme inputs', () => {
  const maxBatter = { ...sampleBatter, contactVsRight: 100, contactVsLeft: 100, power: 100, plateDiscipline: 100, badBallHitting: 100, speed: 100, clutch: 100 };
  const minBatter = { ...sampleBatter, contactVsRight: 0, contactVsLeft: 0, power: 0, plateDiscipline: 0, badBallHitting: 0, speed: 0, clutch: 0 };
  assert.ok(batterOverallRating(maxBatter) <= 99);
  assert.ok(batterOverallRating(minBatter) >= 1);
});
