import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rollInjuries, advanceInjuries } from './injuries.js';
import { sampleBatter, samplePitcher } from '../data/samplePlayers.js';
import type { PlayerProfile } from '../types/roster.js';

/** Returns the same fixed value every call, cycling through `values`. */
function sequenceRng(values: readonly number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

function makeBatter(id: string, age: number, rosterStatus: PlayerProfile['rosterStatus'] = '1군'): PlayerProfile {
  return {
    playerId: id,
    kind: 'batter',
    attributes: { ...sampleBatter, id },
    position: 'LF',
    age,
    potential: 70,
    rosterStatus,
    origin: 'domestic',
    contract: { yearsRemaining: 3, annualSalary: 10000, faEligible: false },
    serviceTimeYears: 3,
  };
}

function makePitcher(id: string, age: number, rosterStatus: PlayerProfile['rosterStatus'] = '1군'): PlayerProfile {
  return {
    playerId: id,
    kind: 'pitcher',
    attributes: { ...samplePitcher, id },
    age,
    potential: 70,
    rosterStatus,
    origin: 'domestic',
    contract: { yearsRemaining: 3, annualSalary: 10000, faEligible: false },
    serviceTimeYears: 3,
  };
}

test('rollInjuries leaves the roster unchanged when rng never beats the injury probability', () => {
  const roster = [makeBatter('B1', 27), makePitcher('P1', 27)];
  const result = rollInjuries(roster, new Map(), () => 0.5);

  assert.equal(result.events.length, 0);
  assert.deepEqual(result.roster, roster);
});

test('rollInjuries is more likely to injure an older player than a young one', () => {
  const young = makeBatter('B-young', 27);
  const old = makeBatter('B-old', 38);
  const rng = sequenceRng([0.002]);

  const result = rollInjuries([young, old], new Map(), rng);

  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].playerId, 'B-old');
  assert.equal(result.events[0].daysRemaining, 5);
  assert.equal(result.events[0].description, '햄스트링 부상');

  const byId = new Map(result.roster.map((p) => [p.playerId, p]));
  assert.equal(byId.get('B-young')?.rosterStatus, '1군');
  assert.equal(byId.get('B-old')?.rosterStatus, '부상자명단');
  assert.deepEqual(byId.get('B-old')?.injury, { description: '햄스트링 부상', daysRemaining: 5 });
});

test('rollInjuries is more likely to injure a fatigued pitcher than a fresh one', () => {
  const fresh = makePitcher('P-fresh', 27);
  const tired = makePitcher('P-tired', 27);
  const fatigue = new Map([['P-tired', 100]]);
  const rng = sequenceRng([0.003]);

  const result = rollInjuries([fresh, tired], fatigue, rng);

  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].playerId, 'P-tired');

  const byId = new Map(result.roster.map((p) => [p.playerId, p]));
  assert.equal(byId.get('P-fresh')?.rosterStatus, '1군');
  assert.equal(byId.get('P-tired')?.rosterStatus, '부상자명단');
});

test('rollInjuries only rolls for 1군 players', () => {
  const reserve = makeBatter('B-reserve', 40, '2군');
  const result = rollInjuries([reserve], new Map(), () => 0);

  assert.equal(result.events.length, 0);
  assert.deepEqual(result.roster, [reserve]);
});

test('advanceInjuries decrements daysRemaining without recovering yet', () => {
  const hurt: PlayerProfile = { ...makeBatter('B-hurt', 27, '부상자명단'), injury: { description: '옆구리 부상', daysRemaining: 2 } };
  const [updated] = advanceInjuries([hurt], 26);

  assert.equal(updated.rosterStatus, '부상자명단');
  assert.deepEqual(updated.injury, { description: '옆구리 부상', daysRemaining: 1 });
});

test('advanceInjuries returns a recovered player to 1군 when there is room', () => {
  const hurt: PlayerProfile = { ...makeBatter('B-hurt', 27, '부상자명단'), injury: { description: '옆구리 부상', daysRemaining: 1 } };
  const active = makeBatter('B-active', 27, '1군');

  const [updatedActive, updatedHurt] = advanceInjuries([active, hurt], 26);

  assert.equal(updatedActive.rosterStatus, '1군');
  assert.equal(updatedHurt.rosterStatus, '1군');
  assert.equal(updatedHurt.injury, undefined);
});

test('advanceInjuries sends a recovered player to 2군 when the active roster is already full', () => {
  const hurt: PlayerProfile = { ...makeBatter('B-hurt', 27, '부상자명단'), injury: { description: '옆구리 부상', daysRemaining: 1 } };
  const active = makeBatter('B-active', 27, '1군');

  const [, updatedHurt] = advanceInjuries([active, hurt], 1);

  assert.equal(updatedHurt.rosterStatus, '2군');
  assert.equal(updatedHurt.injury, undefined);
});
