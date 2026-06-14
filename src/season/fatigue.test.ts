import { test } from 'node:test';
import assert from 'node:assert/strict';
import { updateFatigue, conditionFromFatigue, type FatigueState } from './fatigue.js';
import type { PitcherAttributes } from '../types/player.js';

function pitcher(id: string, recovery: number): PitcherAttributes {
  return {
    id,
    name: id,
    throwingHand: 'R',
    control: 50,
    stuff: 50,
    stamina: 50,
    mentalStrength: 50,
    recovery,
    groundBallTendency: 50,
    sequencingSkill: 50,
    holdRunnerRating: 50,
    repertoire: [{ type: 'fourSeam', velocity: 140, movement: 50, control: 50, usageRate: 1, groundBallTendency: 50 }],
  };
}

test('conditionFromFatigue is 50 when fully rested and decreases as fatigue rises', () => {
  assert.equal(conditionFromFatigue(0), 50);
  assert.ok(conditionFromFatigue(50) < conditionFromFatigue(0));
  assert.ok(conditionFromFatigue(100) < conditionFromFatigue(50));
});

test('a pitcher who throws pitches accumulates fatigue', () => {
  const state: FatigueState = new Map();
  updateFatigue(state, new Map([['p1', 100]]), [pitcher('p1', 60)]);
  assert.ok((state.get('p1') ?? 0) > 0);
});

test('a pitcher who does not pitch recovers fatigue, faster with a higher recovery rating', () => {
  const state: FatigueState = new Map([
    ['fast', 50],
    ['slow', 50],
  ]);
  updateFatigue(state, new Map(), [pitcher('fast', 90), pitcher('slow', 30)]);

  assert.ok(state.get('fast')! < 50);
  assert.ok(state.get('slow')! < 50);
  assert.ok(state.get('fast')! < state.get('slow')!);
});

test('fatigue never drops below 0 or rises above 100', () => {
  const rested: FatigueState = new Map([['p1', 0]]);
  updateFatigue(rested, new Map(), [pitcher('p1', 100)]);
  assert.ok(rested.get('p1')! >= 0);

  const exhausted: FatigueState = new Map([['p2', 100]]);
  updateFatigue(exhausted, new Map([['p2', 500]]), [pitcher('p2', 50)]);
  assert.ok(exhausted.get('p2')! <= 100);
});

test('an unrecognized pitcher id in the roster starts from zero fatigue', () => {
  const state: FatigueState = new Map();
  updateFatigue(state, new Map([['new', 80]]), [pitcher('new', 60)]);
  assert.ok(state.get('new')! > 0);
});
