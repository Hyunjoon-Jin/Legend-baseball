import { test } from 'node:test';
import assert from 'node:assert/strict';
import { batterStatsToAttributes, pitcherStatsToAttributes } from './statsToAttributes.js';

test('a league-average pitcher maps to ratings near 50', () => {
  const attrs = pitcherStatsToAttributes({
    id: 'p100',
    name: '평균투수',
    throwingHand: 'R',
    era: 4.5,
    whip: 1.45,
    kPer9: 7.5,
    bbPer9: 4.0,
    hrPer9: 0.9,
    groundBallRate: 0.45,
    avgFastballVelocityKmh: 145,
    inningsPerAppearance: 5.5,
  });

  assert.ok(Math.abs(attrs.control - 50) <= 5);
  assert.ok(Math.abs(attrs.stuff - 50) <= 5);
  assert.ok(Math.abs(attrs.groundBallTendency - 50) <= 1);
  assert.equal(attrs.repertoire.length, 3);
  const totalUsage = attrs.repertoire.reduce((sum, e) => sum + e.usageRate, 0);
  assert.ok(Math.abs(totalUsage - 1) < 1e-9);
});

test('an ace pitcher (low ERA/BB9, high K9/velo) rates well above average', () => {
  const attrs = pitcherStatsToAttributes({
    id: 'p101',
    name: '에이스',
    throwingHand: 'R',
    era: 2.5,
    whip: 1.05,
    kPer9: 11.0,
    bbPer9: 2.0,
    hrPer9: 0.4,
    groundBallRate: 0.5,
    avgFastballVelocityKmh: 155,
  });

  assert.ok(attrs.control > 60);
  assert.ok(attrs.stuff > 65);
});

test('a high-power, low-contact batter maps to high power / lower contact ratings', () => {
  const attrs = batterStatsToAttributes({
    id: 'b100',
    name: '슬러거',
    battingSide: 'R',
    avg: 0.27,
    obp: 0.36,
    slg: 0.58,
    kRate: 0.3,
    bbRate: 0.1,
    stolenBases: 2,
    caughtStealing: 1,
    plateAppearances: 600,
  });

  assert.ok(attrs.power > 65);
  // Right-handed batter should have a platoon edge vs LHP.
  assert.ok(attrs.contactVsLeft > attrs.contactVsRight);
});

test('switch hitters get a contact bonus on both sides', () => {
  const attrs = batterStatsToAttributes({
    id: 'b101',
    name: '스위치히터',
    battingSide: 'S',
    avg: 0.28,
    obp: 0.36,
    slg: 0.43,
    kRate: 0.2,
    bbRate: 0.09,
    stolenBases: 0,
    caughtStealing: 0,
    plateAppearances: 600,
  });

  assert.equal(attrs.contactVsLeft, attrs.contactVsRight);
  assert.ok(attrs.contactVsLeft > 50);
});

test('a high stolen-base success rate yields a high steal rating', () => {
  const attrs = batterStatsToAttributes({
    id: 'b102',
    name: '도루왕',
    battingSide: 'L',
    avg: 0.29,
    obp: 0.37,
    slg: 0.4,
    kRate: 0.15,
    bbRate: 0.08,
    stolenBases: 40,
    caughtStealing: 5,
    plateAppearances: 650,
  });

  assert.ok(attrs.stealRating > 60);
  assert.ok(attrs.baserunningAggressiveness > 50);
});
