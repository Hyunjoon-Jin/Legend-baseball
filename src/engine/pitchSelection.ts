import type { PitcherAttributes, PitchRepertoireEntry, PitchType } from '../types/player.js';
import type { GameSituation } from '../types/situation.js';
import type { ZoneLocation } from '../types/zone.js';
import { clamp, sampleNormal, weightedChoice } from '../utils/math.js';
import { COUNT_STRIKE_PRESSURE, PITCH_TYPE_DECEPTION } from '../data/constants.js';

export interface SelectedPitch {
  pitchType: PitchType;
  entry: PitchRepertoireEntry;
  zone: ZoneLocation;
  /** Effective velocity in km/h after fatigue/condition adjustments. */
  velocity: number;
  /** Effective command (0-100) used for the location roll, after fatigue/condition. */
  effectiveControl: number;
}

function countKey(situation: GameSituation): string {
  return `${situation.balls}-${situation.strikes}`;
}

/**
 * Fatigue ramps up once the pitcher passes ~75 pitches, scaling to full
 * effect by ~125 pitches. Hot weather accelerates fatigue accumulation.
 */
export function fatigueFactor(situation: GameSituation, pitcher: PitcherAttributes): number {
  const raw = (situation.pitcherPitchCount - 75) / 50;
  const staminaRelief = pitcher.stamina / 200; // up to 0.5 extra pitches "tolerance" in the ramp
  const heatPenalty = Math.max(0, situation.weather.temperatureC - 28) * 0.01;
  return clamp(raw - staminaRelief + heatPenalty, 0, 1);
}

/**
 * Selects which pitch to throw, weighting the repertoire by base usage,
 * the count's strike-pressure (favoring well-commanded pitches when a
 * strike is needed, and higher-deception pitches when trying to induce
 * a chase), and the pitcher's sequencing skill (adds noise to avoid
 * a single dominant pitch being thrown every time).
 */
export function selectPitchType(
  pitcher: PitcherAttributes,
  situation: GameSituation,
  rng: () => number = Math.random,
): { pitchType: PitchType; entry: PitchRepertoireEntry } {
  const strikePressure = COUNT_STRIKE_PRESSURE[countKey(situation)] ?? 0;

  const weights = pitcher.repertoire.map((entry) => {
    let weight = entry.usageRate;

    if (strikePressure > 0) {
      // Must-strike counts: favor well-commanded pitches.
      weight *= 1 + (entry.control / 100) * strikePressure;
    } else if (strikePressure < 0) {
      // Chase counts: favor deceptive, hard-to-square-up pitches.
      const deception = PITCH_TYPE_DECEPTION[entry.type];
      weight *= 1 + (deception / 100) * -strikePressure;
    }

    // Sequencing skill adds a little randomness so a single pitch
    // doesn't dominate every selection deterministically.
    const noise = 1 + ((rng() - 0.5) * (1 - pitcher.sequencingSkill / 150));
    weight *= Math.max(noise, 0.1);

    return Math.max(weight, 0.001);
  });

  const idx = weightedChoice(weights, rng);
  const entry = pitcher.repertoire[idx];
  return { pitchType: entry.type, entry };
}

/**
 * Determines the plate location and effective velocity/command for a
 * given pitch selection, applying fatigue and daily condition modifiers.
 */
export function selectPitchLocation(
  pitcher: PitcherAttributes,
  entry: PitchRepertoireEntry,
  situation: GameSituation,
  rng: () => number = Math.random,
): { zone: ZoneLocation; velocity: number; effectiveControl: number } {
  const strikePressure = COUNT_STRIKE_PRESSURE[countKey(situation)] ?? 0;
  const fatigue = fatigueFactor(situation, pitcher);
  const conditionAdjust = ((situation.pitcherCondition - 50) / 50) * 10;

  // Cold weather stiffens the grip, costing a bit of fine command.
  const coldPenalty = Math.max(0, 10 - situation.weather.temperatureC) * 0.3;

  // Effective command blends the pitch-specific command with the
  // pitcher's overall control, then applies fatigue/condition/weather.
  const baseControl = entry.control * 0.6 + pitcher.control * 0.4;
  const effectiveControl = clamp(baseControl + conditionAdjust - fatigue * 15 - coldPenalty, 5, 100);

  // Effective velocity degrades slightly with fatigue and bad condition.
  const velocity = entry.velocity + conditionAdjust * 0.1 - fatigue * 3;

  // How far from the center of the zone the pitcher is *aiming*.
  // 0 = dead center, up to 1.85 = beyond the zone edge on chase counts.
  const aimOffset = clamp((0.7 - strikePressure) / 1.2, 0, 1) * 1.85;

  // Random direction for the aim offset (each axis independently).
  const aimRow = 2 + (rng() < 0.5 ? -1 : 1) * aimOffset * (0.5 + rng() * 0.5);
  const aimCol = 2 + (rng() < 0.5 ? -1 : 1) * aimOffset * (0.5 + rng() * 0.5);

  // Location noise: better effective control = tighter grouping.
  const locationStdDev = 1.8 - (effectiveControl / 100) * 1.4; // ranges ~0.4 to 1.8

  const row = clamp(Math.round(sampleNormal(aimRow, locationStdDev, rng)), 0, 4) as ZoneLocation['row'];
  const col = clamp(Math.round(sampleNormal(aimCol, locationStdDev, rng)), 0, 4) as ZoneLocation['col'];

  return { zone: { row, col }, velocity, effectiveControl };
}

/**
 * Convenience wrapper: selects both pitch type and location in one call.
 */
export function selectPitch(
  pitcher: PitcherAttributes,
  situation: GameSituation,
  rng: () => number = Math.random,
): SelectedPitch {
  const { pitchType, entry } = selectPitchType(pitcher, situation, rng);
  const { zone, velocity, effectiveControl } = selectPitchLocation(pitcher, entry, situation, rng);
  return { pitchType, entry, zone, velocity, effectiveControl };
}
