import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seasonWeather } from './weather.js';

function mulberry32(seed: number) {
  return function rng() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function averageTemperature(progress: number, samples: number, rng: () => number): number {
  let total = 0;
  for (let i = 0; i < samples; i++) total += seasonWeather(progress, rng).temperatureC;
  return total / samples;
}

test('midseason games are warmer on average than opening day or the season finale', () => {
  const rng = mulberry32(1);
  const opening = averageTemperature(0, 500, rng);
  const midseason = averageTemperature(0.5, 500, rng);
  const finale = averageTemperature(1, 500, rng);

  assert.ok(midseason > opening);
  assert.ok(midseason > finale);
});

test('weather values stay within plausible ranges across the season', () => {
  const rng = mulberry32(2);
  for (let i = 0; i <= 100; i++) {
    const w = seasonWeather(i / 100, rng);
    assert.ok(w.temperatureC >= -10 && w.temperatureC <= 45);
    assert.ok(w.humidity >= 0 && w.humidity <= 100);
    assert.ok(w.windSpeedKmh >= 0 && w.windSpeedKmh <= 20);
    assert.ok(['in', 'out', 'crosswind', 'none'].includes(w.windDirection));
    if (w.windSpeedKmh === 0) assert.equal(w.windDirection, 'none');
  }
});
