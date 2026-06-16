import type { PitchType } from '../types/player.js';
import type { BattedBallDirection } from '../types/outcome.js';

/**
 * Intrinsic "deception" of each pitch type - how much it suppresses
 * contact quality independent of the pitcher's raw stuff rating.
 * 0-100, higher = harder to square up.
 */
export const PITCH_TYPE_DECEPTION: Record<PitchType, number> = {
  fourSeam: 45,
  twoSeam: 50,
  sinker: 55,
  cutter: 58,
  slider: 65,
  curve: 62,
  changeup: 68,
  splitter: 72,
  knuckleCurve: 70,
};

/**
 * Intrinsic ground-ball pull (how much each pitch type lowers the
 * batter's launch angle when contact is made), 0-100.
 */
export const PITCH_TYPE_GROUNDBALL_PULL: Record<PitchType, number> = {
  fourSeam: 35,
  twoSeam: 55,
  sinker: 70,
  cutter: 50,
  slider: 45,
  curve: 50,
  changeup: 60,
  splitter: 75,
  knuckleCurve: 55,
};

/**
 * Relative weight applied to direction buckets, indexed the same as
 * BATTED_BALL_DIRECTIONS, used as a neutral baseline before pull-tendency
 * and pitch-location adjustments are applied.
 */
export const BATTED_BALL_DIRECTIONS: BattedBallDirection[] = [
  'pullLine',
  'pullGap',
  'center',
  'oppoGap',
  'oppoLine',
];

/**
 * Count "leverage" - how much the pitcher favors throwing a strike
 * (positive) vs. trying to induce a chase outside the zone (negative).
 * Indexed by `${balls}-${strikes}`. Range roughly -1 (pure chase) to
 * +1 (must throw a strike).
 */
export const COUNT_STRIKE_PRESSURE: Record<string, number> = {
  '0-0': 0.15,
  '0-1': -0.1,
  '0-2': -0.35,
  '1-0': 0.2,
  '1-1': 0.0,
  '1-2': -0.35,
  '2-0': 0.45,
  '2-1': 0.15,
  '2-2': -0.25,
  '3-0': 0.85,
  '3-1': 0.6,
  '3-2': 0.1,
};

/**
 * Additional batter "chase" tendency added when the count has two
 * strikes (protecting the plate), indexed by `${balls}-${strikes}`.
 */
export const COUNT_CHASE_BONUS: Record<string, number> = {
  '0-0': 0,
  '0-1': 0.03,
  '0-2': 0.08,
  '1-0': 0,
  '1-1': 0.03,
  '1-2': 0.08,
  '2-0': 0,
  '2-1': 0.03,
  '2-2': 0.08,
  '3-0': -0.05,
  '3-1': 0,
  '3-2': 0.05,
};

/** Average travel distance (meters) for a "barreled" ball at sea level, no wind. */
export const BASE_FLYBALL_DISTANCE_AT_PEAK = 130;

/** km/h -> distance scaling: extra meters per km/h of exit velocity above 145 km/h baseline. */
export const DISTANCE_PER_EXIT_VELO = 1.1;
