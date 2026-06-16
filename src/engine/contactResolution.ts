import type { BatterAttributes, PitcherAttributes } from '../types/player.js';
import type { GameSituation } from '../types/situation.js';
import type { PitchResult } from '../types/outcome.js';
import { distanceFromCenter, isInStrikeZone } from '../types/zone.js';
import type { SelectedPitch } from './pitchSelection.js';
import { clamp, sigmoid } from '../utils/math.js';
import { PITCH_TYPE_DECEPTION } from '../data/constants.js';

/**
 * Picks the batter's contact rating against this pitcher's handedness.
 */
function contactRatingFor(batter: BatterAttributes, pitcher: PitcherAttributes): number {
  return pitcher.throwingHand === 'R' ? batter.contactVsRight : batter.contactVsLeft;
}

/**
 * Probability of making any contact (fair or foul) once the batter
 * commits to a swing.
 */
export function contactProbability(
  batter: BatterAttributes,
  pitcher: PitcherAttributes,
  pitch: SelectedPitch,
): number {
  const contactRating = contactRatingFor(batter, pitcher);

  const effectiveStuff =
    pitcher.stuff * 0.4 + pitch.entry.movement * 0.35 + PITCH_TYPE_DECEPTION[pitch.pitchType] * 0.25;

  // Faster pitches are harder to square up; 140 km/h is the baseline.
  const velocityPenalty = (pitch.velocity - 140) * 0.3;

  // Pitches away from the center of the zone are harder to make
  // contact with; bad-ball hitting partially offsets this.
  const zoneDist = distanceFromCenter(pitch.zone); // 0, 1, or 2
  const rawZonePenalty = zoneDist * 15;
  const badBallRelief = (batter.badBallHitting / 100) * rawZonePenalty * 0.7;
  const zonePenalty = rawZonePenalty - badBallRelief;

  const diff = contactRating - effectiveStuff - velocityPenalty - zonePenalty;

  // Offset of +50 calibrates the curve so an average matchup on a
  // middle-middle pitch yields ~90% contact rate (KBO target K% ~19-20%).
  return clamp(sigmoid(diff + 50, 20), 0.05, 0.98);
}

/**
 * Probability that contact results in a foul ball rather than a fair
 * ball in play, given that contact was made.
 */
export function foulProbability(
  batter: BatterAttributes,
  pitcher: PitcherAttributes,
  pitch: SelectedPitch,
): number {
  const contactRating = contactRatingFor(batter, pitcher);
  const effectiveStuff =
    pitcher.stuff * 0.4 + pitch.entry.movement * 0.35 + PITCH_TYPE_DECEPTION[pitch.pitchType] * 0.25;
  const diff = contactRating - effectiveStuff;
  const zoneDist = distanceFromCenter(pitch.zone);

  return clamp(0.5 - diff / 200 + zoneDist * 0.06, 0.15, 0.70);
}

/**
 * Chance of being hit by a pitch on a take, based on how far inside
 * and how poorly commanded the pitch is.
 */
function hitByPitchProbability(pitch: SelectedPitch): number {
  // Only the most extreme inside corner (col 4, top/bottom row) carries
  // meaningful HBP risk, and only when command is poor.
  const isExtremeInsideCorner = pitch.zone.col === 4 && (pitch.zone.row === 0 || pitch.zone.row === 4);
  if (!isExtremeInsideCorner) return 0;
  return 0.05 * (1 - pitch.effectiveControl / 100);
}

/**
 * Resolves the result of a single pitch: ball/strike for takes, or
 * whiff/foul/in-play for swings.
 */
export function resolvePitch(
  batter: BatterAttributes,
  pitcher: PitcherAttributes,
  pitch: SelectedPitch,
  swung: boolean,
  situation: GameSituation,
  rng: () => number = Math.random,
): PitchResult {
  if (!swung) {
    if (rng() < hitByPitchProbability(pitch)) return 'hitByPitch';
    return isInStrikeZone(pitch.zone) ? 'calledStrike' : 'ball';
  }

  const contactProb = contactProbability(batter, pitcher, pitch);
  if (rng() >= contactProb) {
    // Rare "foul tip" flavor on close pitches with two strikes;
    // gameplay-equivalent to a swinging strike.
    const zoneDist = distanceFromCenter(pitch.zone);
    if (situation.strikes === 2 && zoneDist <= 1 && rng() < 0.08) return 'foulTip';
    return 'swingingStrike';
  }

  const foulProb = foulProbability(batter, pitcher, pitch);
  return rng() < foulProb ? 'foulBall' : 'inPlay';
}
