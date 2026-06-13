import type { BatterAttributes, PitchRepertoireEntry, PitchType, PitcherAttributes } from '../types/player.js';
import { clamp } from '../utils/math.js';
import { PITCH_TYPE_GROUNDBALL_PULL } from '../data/constants.js';
import { defaultLeagueBaselines, ratingFromStat, type LeagueBaselines } from './leagueBaselines.js';

/** Raw season pitching statistics used as mapper input. */
export interface PitcherSeasonStats {
  id: string;
  name: string;
  throwingHand: 'L' | 'R';
  era: number;
  whip: number;
  /** Strikeouts per 9 innings. */
  kPer9: number;
  /** Walks per 9 innings. */
  bbPer9: number;
  /** Home runs allowed per 9 innings. */
  hrPer9: number;
  /** Ground balls / total batted balls allowed, 0-1. */
  groundBallRate: number;
  /** Average four-seam/primary fastball velocity in km/h. */
  avgFastballVelocityKmh: number;
  /** Average innings pitched per appearance (used as a stamina proxy). */
  inningsPerAppearance?: number;
  /** Pitch usage rates (should sum to ~1). If omitted, a default 3-pitch mix is used. */
  pitchUsage?: Partial<Record<PitchType, number>>;
  /** Optional manual overrides for traits not derivable from box-score stats (0-100). */
  mentalStrength?: number;
  sequencingSkill?: number;
  holdRunnerRating?: number;
}

/** Raw season batting statistics used as mapper input. */
export interface BatterSeasonStats {
  id: string;
  name: string;
  battingSide: 'L' | 'R' | 'S';
  avg: number;
  obp: number;
  slg: number;
  /** Strikeout rate, 0-1. */
  kRate: number;
  /** Walk rate, 0-1. */
  bbRate: number;
  /** Stolen base attempts (SB + CS) over the season. */
  stolenBases: number;
  caughtStealing: number;
  /** Plate appearances, used to rate-ify stolen base attempts. */
  plateAppearances: number;
  /** Statcast-style sprint speed in ft/s, if available. */
  sprintSpeedFtPerSec?: number;
  /** Fraction of fly balls pulled, 0-1, if available. */
  pullFlyBallRate?: number;
  /** OPS in high-leverage/clutch situations minus overall OPS, if available. */
  clutchOpsDiff?: number;
  swingType?: 'upper' | 'level' | 'down';
  /** Optional manual override for badBallHitting (0-100). */
  badBallHitting?: number;
}

/** km/h offset from the pitcher's primary fastball velocity for each pitch type. */
const PITCH_TYPE_VELOCITY_OFFSET: Record<PitchType, number> = {
  fourSeam: 0,
  twoSeam: -2,
  sinker: -3,
  cutter: -5,
  slider: -16,
  curve: -26,
  changeup: -14,
  splitter: -15,
  knuckleCurve: -24,
};

const DEFAULT_PITCH_USAGE: Partial<Record<PitchType, number>> = {
  fourSeam: 0.55,
  slider: 0.25,
  changeup: 0.2,
};

/**
 * Builds a pitch repertoire from usage rates, deriving each pitch's
 * velocity (from the fastball baseline + a type-specific offset),
 * movement, and command from the pitcher's overall stuff/control ratings.
 */
function buildRepertoire(
  pitchUsage: Partial<Record<PitchType, number>>,
  fastballVelocityKmh: number,
  stuff: number,
  control: number,
): PitchRepertoireEntry[] {
  const entries = Object.entries(pitchUsage) as [PitchType, number][];
  const total = entries.reduce((sum, [, usage]) => sum + usage, 0) || 1;

  return entries.map(([type, usage]) => ({
    type,
    velocity: fastballVelocityKmh + PITCH_TYPE_VELOCITY_OFFSET[type],
    movement: clamp(stuff + (type === 'fourSeam' ? -5 : 5), 1, 99),
    control: clamp(control + (type === 'fourSeam' ? 5 : -5), 1, 99),
    usageRate: usage / total,
    groundBallTendency: PITCH_TYPE_GROUNDBALL_PULL[type],
  }));
}

/**
 * Converts raw season pitching stats into the 0-100 attribute ratings
 * used by the matchup engine.
 */
export function pitcherStatsToAttributes(
  stats: PitcherSeasonStats,
  baselines: LeagueBaselines = defaultLeagueBaselines,
): PitcherAttributes {
  const b = baselines.pitcher;

  const control = ratingFromStat(stats.bbPer9, b.bbPer9, true);
  const stuffFromK = ratingFromStat(stats.kPer9, b.kPer9, false);
  const stuffFromVelo = ratingFromStat(stats.avgFastballVelocityKmh, b.fastballVelocityKmh, false);
  const stuff = clamp(Math.round(stuffFromK * 0.6 + stuffFromVelo * 0.4), 1, 99);

  const stamina = ratingFromStat(stats.inningsPerAppearance ?? b.inningsPerAppearance.mean, b.inningsPerAppearance, false);
  const groundBallTendency = ratingFromStat(stats.groundBallRate, b.groundBallRate, false);

  // ERA/WHIP capture overall run prevention beyond K/BB/HR alone; fold a
  // small amount of that signal into stuff and control as "everything else".
  const overall = ratingFromStat(stats.era, b.era, true) * 0.5 + ratingFromStat(stats.whip, b.whip, true) * 0.5;
  const stuffAdjusted = clamp(Math.round(stuff * 0.85 + overall * 0.15), 1, 99);
  const controlAdjusted = clamp(Math.round(control * 0.85 + overall * 0.15), 1, 99);

  const pitchUsage = stats.pitchUsage ?? DEFAULT_PITCH_USAGE;

  return {
    id: stats.id,
    name: stats.name,
    throwingHand: stats.throwingHand,
    control: controlAdjusted,
    stuff: stuffAdjusted,
    stamina,
    mentalStrength: stats.mentalStrength ?? 50,
    recovery: 50,
    groundBallTendency,
    sequencingSkill: stats.sequencingSkill ?? 50,
    holdRunnerRating: stats.holdRunnerRating ?? 50,
    repertoire: buildRepertoire(pitchUsage, stats.avgFastballVelocityKmh, stuffAdjusted, controlAdjusted),
  };
}

/**
 * Converts raw season batting stats into the 0-100 attribute ratings
 * used by the matchup engine, including baserunning/stealing ratings.
 */
export function batterStatsToAttributes(
  stats: BatterSeasonStats,
  baselines: LeagueBaselines = defaultLeagueBaselines,
): BatterAttributes {
  const b = baselines.batter;
  const iso = stats.slg - stats.avg;

  const power = ratingFromStat(iso, b.iso, false);

  // Base contact rating from strikeout rate (lower K% = better contact),
  // then split by handedness to reflect the natural platoon advantage of
  // facing an opposite-handed pitcher.
  const baseContact = ratingFromStat(stats.kRate, b.kRate, true);
  let contactVsRight = baseContact;
  let contactVsLeft = baseContact;
  if (stats.battingSide === 'R') {
    contactVsRight = clamp(baseContact - 3, 1, 99);
    contactVsLeft = clamp(baseContact + 4, 1, 99);
  } else if (stats.battingSide === 'L') {
    contactVsLeft = clamp(baseContact - 3, 1, 99);
    contactVsRight = clamp(baseContact + 4, 1, 99);
  } else {
    // Switch hitters always get the platoon advantage.
    contactVsRight = clamp(baseContact + 2, 1, 99);
    contactVsLeft = clamp(baseContact + 2, 1, 99);
  }

  const plateDiscipline = clamp(
    Math.round(ratingFromStat(stats.bbRate, b.bbRate, false) * 0.6 + ratingFromStat(stats.kRate, b.kRate, true) * 0.4),
    1,
    99,
  );

  // Bad-ball hitting: how much of the batter's average is "extra" beyond
  // what power and discipline alone would predict - a rough proxy for
  // making productive contact on pitches outside the zone.
  const expectedAvgRating = clamp(Math.round(power * 0.3 + plateDiscipline * 0.3 + 50 * 0.4), 1, 99);
  const actualAvgRating = ratingFromStat(stats.avg, b.avg, false);
  const badBallHitting = stats.badBallHitting ?? clamp(50 + (actualAvgRating - expectedAvgRating), 1, 99);

  const attempts = stats.stolenBases + stats.caughtStealing;
  const attemptRate = stats.plateAppearances > 0 ? attempts / stats.plateAppearances : 0;
  const successRate = attempts > 0 ? stats.stolenBases / attempts : 0.7; // league-average-ish default

  const speed =
    stats.sprintSpeedFtPerSec !== undefined
      ? ratingFromStat(stats.sprintSpeedFtPerSec, b.sprintSpeedFtPerSec, false)
      : clamp(Math.round(50 + (attemptRate - b.stolenBaseAttemptRatePerPA.mean) / b.stolenBaseAttemptRatePerPA.sd * 10), 1, 99);

  const stealRating = clamp(Math.round(50 + (successRate - 0.7) / 0.15 * 10), 1, 99);
  const baserunningAggressiveness = ratingFromStat(attemptRate, b.stolenBaseAttemptRatePerPA, false);

  const pullTendency = stats.pullFlyBallRate !== undefined ? ratingFromStat(stats.pullFlyBallRate, b.pullFlyBallRate, false) : 50;

  const clutch = stats.clutchOpsDiff !== undefined ? ratingFromStat(stats.clutchOpsDiff, b.clutchOpsDiff, false) : 50;

  const swingType = stats.swingType ?? (iso >= b.iso.mean + b.iso.sd ? 'upper' : iso <= b.iso.mean - b.iso.sd ? 'down' : 'level');

  return {
    id: stats.id,
    name: stats.name,
    battingSide: stats.battingSide,
    contactVsRight,
    contactVsLeft,
    power,
    plateDiscipline,
    badBallHitting,
    speed,
    stealRating,
    baserunningAggressiveness,
    swingType,
    pullTendency,
    clutch,
  };
}
