import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contactProbability } from './contactResolution.js';
import { sampleBatter, samplePitcher } from '../data/samplePlayers.js';
import type { SelectedPitch } from './pitchSelection.js';
import { zoneIndex } from '../types/zone.js';

function pitchAt(zone: SelectedPitch['zone']): SelectedPitch {
  return { pitchType: 'fourSeam', entry: samplePitcher.repertoire[0], zone, velocity: 145, effectiveControl: 60 };
}

test('a hot zone raises contact probability and a cold zone lowers it relative to neutral', () => {
  const zone = { row: 2, col: 2 } as const;
  const index = zoneIndex(zone);

  const neutral = contactProbability(sampleBatter, samplePitcher, pitchAt(zone));

  const hotProfile = new Array(25).fill(0);
  hotProfile[index] = 10;
  const hotBatter = { ...sampleBatter, zoneProfile: hotProfile };

  const coldProfile = new Array(25).fill(0);
  coldProfile[index] = -10;
  const coldBatter = { ...sampleBatter, zoneProfile: coldProfile };

  const hot = contactProbability(hotBatter, samplePitcher, pitchAt(zone));
  const cold = contactProbability(coldBatter, samplePitcher, pitchAt(zone));

  assert.ok(hot > neutral, `expected hot-zone contact (${hot}) > neutral (${neutral})`);
  assert.ok(cold < neutral, `expected cold-zone contact (${cold}) < neutral (${neutral})`);
});

test('a batter zoneProfile only affects the specific zone it covers', () => {
  const targetZone = { row: 1, col: 1 } as const;
  const otherZone = { row: 3, col: 3 } as const;

  const profile = new Array(25).fill(0);
  profile[zoneIndex(targetZone)] = 10;
  const batter = { ...sampleBatter, zoneProfile: profile };

  const withProfile = contactProbability(batter, samplePitcher, pitchAt(otherZone));
  const withoutProfile = contactProbability(sampleBatter, samplePitcher, pitchAt(otherZone));

  assert.equal(withProfile, withoutProfile);
});
