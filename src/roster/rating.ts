import type { PlayerProfile } from '../types/roster.js';
import type { BatterAttributes, PitcherAttributes } from '../types/player.js';
import { clamp } from '../utils/math.js';

/**
 * Single-number summary (1-99) of a batter's overall ability, used for
 * depth-chart ordering, trade valuation, and draft pick selection.
 */
export function batterOverallRating(attrs: BatterAttributes): number {
  const contact = (attrs.contactVsRight + attrs.contactVsLeft) / 2;
  const value =
    contact * 0.3 +
    attrs.power * 0.25 +
    attrs.plateDiscipline * 0.15 +
    attrs.speed * 0.1 +
    attrs.badBallHitting * 0.1 +
    attrs.clutch * 0.1;
  return clamp(Math.round(value), 1, 99);
}

/**
 * Single-number summary (1-99) of a pitcher's overall ability, used for
 * depth-chart ordering, trade valuation, and draft pick selection.
 */
export function pitcherOverallRating(attrs: PitcherAttributes): number {
  const value =
    attrs.stuff * 0.35 +
    attrs.control * 0.3 +
    attrs.stamina * 0.15 +
    attrs.mentalStrength * 0.1 +
    attrs.sequencingSkill * 0.1;
  return clamp(Math.round(value), 1, 99);
}

/** Overall rating (1-99) for either a batter or pitcher profile. */
export function overallRating(profile: PlayerProfile): number {
  return profile.kind === 'batter'
    ? batterOverallRating(profile.attributes as BatterAttributes)
    : pitcherOverallRating(profile.attributes as PitcherAttributes);
}
