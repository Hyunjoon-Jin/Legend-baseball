/**
 * League-average baselines (mean/standard deviation) used to convert raw
 * season statistics into 0-100 ratings via z-score normalization.
 *
 * Defaults are calibrated to a roughly KBO-like offensive environment.
 * Pass a custom `LeagueBaselines` object to `pitcherStatsToAttributes` /
 * `batterStatsToAttributes` to recalibrate for a different league/era.
 */
export interface StatBaseline {
  mean: number;
  sd: number;
}

export interface PitcherLeagueBaselines {
  era: StatBaseline;
  whip: StatBaseline;
  kPer9: StatBaseline;
  bbPer9: StatBaseline;
  hrPer9: StatBaseline;
  groundBallRate: StatBaseline;
  fastballVelocityKmh: StatBaseline;
  inningsPerAppearance: StatBaseline;
}

export interface BatterLeagueBaselines {
  avg: StatBaseline;
  obp: StatBaseline;
  slg: StatBaseline;
  iso: StatBaseline;
  kRate: StatBaseline;
  bbRate: StatBaseline;
  sprintSpeedFtPerSec: StatBaseline;
  stolenBaseAttemptRatePerPA: StatBaseline;
  pullFlyBallRate: StatBaseline;
  clutchOpsDiff: StatBaseline;
}

export interface LeagueBaselines {
  pitcher: PitcherLeagueBaselines;
  batter: BatterLeagueBaselines;
}

export const defaultLeagueBaselines: LeagueBaselines = {
  pitcher: {
    era: { mean: 4.5, sd: 1.1 },
    whip: { mean: 1.45, sd: 0.18 },
    kPer9: { mean: 7.5, sd: 1.8 },
    bbPer9: { mean: 4.0, sd: 1.2 },
    hrPer9: { mean: 0.9, sd: 0.35 },
    groundBallRate: { mean: 0.45, sd: 0.08 },
    fastballVelocityKmh: { mean: 145, sd: 4.5 },
    inningsPerAppearance: { mean: 5.5, sd: 1.5 },
  },
  batter: {
    avg: { mean: 0.28, sd: 0.025 },
    obp: { mean: 0.36, sd: 0.035 },
    slg: { mean: 0.43, sd: 0.06 },
    iso: { mean: 0.15, sd: 0.045 },
    kRate: { mean: 0.2, sd: 0.06 },
    bbRate: { mean: 0.09, sd: 0.03 },
    sprintSpeedFtPerSec: { mean: 27, sd: 1.5 },
    stolenBaseAttemptRatePerPA: { mean: 0.02, sd: 0.025 },
    pullFlyBallRate: { mean: 0.35, sd: 0.1 },
    clutchOpsDiff: { mean: 0, sd: 0.08 },
  },
};

/**
 * Converts a raw value to a 0-100 rating via a z-score against the given
 * baseline. `invert: true` flips the sign (use for stats where a *lower*
 * raw value is better, e.g. ERA, BB/9).
 */
export function ratingFromStat(value: number, baseline: StatBaseline, invert = false): number {
  const z = (value - baseline.mean) / baseline.sd;
  const signed = invert ? -z : z;
  return Math.min(99, Math.max(1, Math.round(50 + signed * 10)));
}
