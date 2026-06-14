import type { PitcherAttributes } from '../types/player.js';

/** Tracks each pitcher's accumulated in-season fatigue, keyed by pitcher id (0 = fully fresh, 100 = exhausted). */
export type FatigueState = Map<string, number>;

const MAX_FATIGUE = 100;
const FATIGUE_PER_PITCH = 0.5;
const RECOVERY_RATE = 0.15;

/**
 * Updates fatigue for every pitcher on a roster after a game: pitchers who
 * threw pitches accumulate fatigue proportional to their workload, while
 * everyone else recovers at a rate scaled by their `recovery` rating.
 */
export function updateFatigue(state: FatigueState, pitchesThrown: ReadonlyMap<string, number>, roster: readonly PitcherAttributes[]): void {
  for (const pitcher of roster) {
    const pitches = pitchesThrown.get(pitcher.id) ?? 0;
    const current = state.get(pitcher.id) ?? 0;
    const next = pitches > 0 ? current + pitches * FATIGUE_PER_PITCH : current - pitcher.recovery * RECOVERY_RATE;
    state.set(pitcher.id, Math.max(0, Math.min(MAX_FATIGUE, next)));
  }
}

/** Maps accumulated fatigue to a `pitcherCondition` value (50 = fully rested, as low as 10 when exhausted). */
export function conditionFromFatigue(fatigue: number): number {
  return Math.max(10, Math.min(50, Math.round(50 - fatigue * 0.4)));
}
