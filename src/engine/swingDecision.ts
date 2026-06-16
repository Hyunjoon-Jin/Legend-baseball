import type { BatterAttributes } from '../types/player.js';
import type { GameSituation } from '../types/situation.js';
import { isInStrikeZone } from '../types/zone.js';
import type { SelectedPitch } from './pitchSelection.js';
import { centered, clamp, sigmoid } from '../utils/math.js';
import { COUNT_CHASE_BONUS, PITCH_TYPE_DECEPTION } from '../data/constants.js';

function countKey(situation: GameSituation): string {
  return `${situation.balls}-${situation.strikes}`;
}

/**
 * Probability that the batter offers at a given pitch, accounting for
 * zone location, plate discipline, pitch deception, count leverage and
 * the batter's daily condition.
 */
export function swingProbability(
  batter: BatterAttributes,
  pitch: SelectedPitch,
  situation: GameSituation,
): number {
  const inZone = isInStrikeZone(pitch.zone);
  const disciplineScore = sigmoid(centered(batter.plateDiscipline), 25); // 0..1

  let prob: number;

  if (inZone) {
    const base = 0.72;
    // A disciplined hitter recognizes a strike and swings at it slightly more often.
    prob = base + (disciplineScore - 0.5) * 0.25;

    // Two-strike protection: batters expand their effective zone.
    if (situation.strikes === 2) prob += 0.12;

    // 3-0 "automatic take" tendency.
    if (situation.balls === 3 && situation.strikes === 0) prob -= 0.35;
  } else {
    // All out-of-zone cells have Chebyshev distance ≥ 2 from centre —
    // there is no "shadow zone" between in-zone and waste in this grid.
    const base = 0.07;

    // Disciplined hitters chase out-of-zone pitches far less often.
    prob = base * (1 - disciplineScore * 0.7);

    // Deceptive pitches generate extra chase swings.
    prob += (PITCH_TYPE_DECEPTION[pitch.pitchType] / 100) * 0.15;

    // Two-strike protection increases chase rate on close pitches.
    prob += COUNT_CHASE_BONUS[countKey(situation)] ?? 0;

    // 3-0/3-1: even disciplined hitters rarely chase.
    if (situation.balls === 3 && situation.strikes <= 1) prob -= 0.05;
  }

  // Daily condition: a poor-condition hitter is slightly more erratic
  // (more chases, fewer aggressive strikes taken).
  const conditionDelta = (50 - situation.batterCondition) / 50; // >0 when below normal
  prob += conditionDelta * 0.04;

  return clamp(prob, 0.02, 0.97);
}

export function decideSwing(
  batter: BatterAttributes,
  pitch: SelectedPitch,
  situation: GameSituation,
  rng: () => number = Math.random,
): boolean {
  return rng() < swingProbability(batter, pitch, situation);
}
