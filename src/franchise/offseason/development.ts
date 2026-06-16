import type { PlayerProfile } from '../../types/roster.js';
import type { BatterAttributes, PitcherAttributes } from '../../types/player.js';
import { overallRating } from '../../roster/rating.js';
import { clamp } from '../../utils/math.js';
import { PEAK_AGE_BATTER, PEAK_AGE_PITCHER, GAMES_PER_SERVICE_YEAR, RETIREMENT_HARD_AGE } from '../../roster/constants.js';

/** Numeric 0-100 batter attributes that grow toward `potential` before peak age and decline after. */
type BatterScalableField =
  | 'contactVsRight' | 'contactVsLeft' | 'power' | 'plateDiscipline' | 'badBallHitting'
  | 'speed' | 'stealRating' | 'baserunningAggressiveness' | 'pullTendency' | 'clutch';

/** Numeric 0-100 pitcher attributes that grow toward `potential` before peak age and decline after. */
type PitcherScalableField =
  | 'control' | 'stuff' | 'stamina' | 'mentalStrength' | 'recovery'
  | 'groundBallTendency' | 'sequencingSkill' | 'holdRunnerRating';

const BATTER_SCALABLE_FIELDS: readonly BatterScalableField[] = [
  'contactVsRight', 'contactVsLeft', 'power', 'plateDiscipline', 'badBallHitting',
  'speed', 'stealRating', 'baserunningAggressiveness', 'pullTendency', 'clutch',
];

const PITCHER_SCALABLE_FIELDS: readonly PitcherScalableField[] = [
  'control', 'stuff', 'stamina', 'mentalStrength', 'recovery',
  'groundBallTendency', 'sequencingSkill', 'holdRunnerRating',
];

/** Per year-of-distance-from-peak, how far a below-peak attribute moves toward `potential`. */
const GROWTH_RATE_PER_YEAR = 0.4;

/** Per year past peak age, how far an attribute declines. */
const DECLINE_RATE_PER_YEAR = 0.3;

/** Age past which decline accelerates. */
const ACCELERATED_DECLINE_AGE = 33;

const ACCELERATED_DECLINE_MULTIPLIER = 1.5;

/** Random +/- spread applied to each attribute's decline. */
const DECLINE_JITTER_SPREAD = 1.5;

function jitter(rng: () => number, spread: number): number {
  return (rng() * 2 - 1) * spread;
}

/**
 * Moves a single 0-100 attribute by one year: below `peakAge`, grows toward
 * `potential` (capped so it never overshoots), at a rate proportional to how
 * many years remain until peak. At or past `peakAge`, declines at a rate
 * proportional to years past peak (accelerated past `ACCELERATED_DECLINE_AGE`),
 * with a small random spread.
 */
function developValue(value: number, potential: number, age: number, peakAge: number, rng: () => number): number {
  if (age < peakAge) {
    const growthRate = (peakAge - age) * GROWTH_RATE_PER_YEAR;
    const gap = potential - value;
    const delta = gap > 0 ? Math.min(growthRate, gap) : 0;
    return clamp(Math.round(value + delta), 1, 99);
  }

  let declineRate = (age - peakAge) * DECLINE_RATE_PER_YEAR;
  if (age > ACCELERATED_DECLINE_AGE) declineRate *= ACCELERATED_DECLINE_MULTIPLIER;
  return clamp(Math.round(value - declineRate - jitter(rng, DECLINE_JITTER_SPREAD)), 1, 99);
}

function developBatterAttributes(attrs: BatterAttributes, potential: number, age: number, rng: () => number): BatterAttributes {
  const updated = { ...attrs };
  for (const field of BATTER_SCALABLE_FIELDS) {
    updated[field] = developValue(attrs[field], potential, age, PEAK_AGE_BATTER, rng);
  }
  return updated;
}

function developPitcherAttributes(attrs: PitcherAttributes, potential: number, age: number, rng: () => number): PitcherAttributes {
  const updated = { ...attrs };
  for (const field of PITCHER_SCALABLE_FIELDS) {
    updated[field] = developValue(attrs[field], potential, age, PEAK_AGE_PITCHER, rng);
  }
  return updated;
}

/**
 * Retirement probability driven by performance, not age:
 * - Good players (OVR ≥ 50) face little or no retirement pressure at any age.
 * - Below OVR 50 the probability rises sharply — no team wants a 35-OVR player.
 * - Age adds a small additional weight, but only for already-declining players
 *   (OVR < 60). Stars see zero age penalty, so they keep playing as long as
 *   the aging curve keeps their OVR above the threshold.
 */
function retirementProbability(profile: PlayerProfile): number {
  const overall = overallRating(profile);
  const age = profile.age;

  // Players under 28 never retire — they're still developing regardless of
  // current rating. Retirement pressure only builds as OVR declines with age.
  if (age < 28) return 0;

  const perfFactor = Math.max(0, (50 - overall) * 0.025);
  const ageFactor = Math.max(0, age - 37) * Math.max(0, (60 - overall) / 600);

  return Math.min(perfFactor + ageFactor, 0.90);
}

/**
 * Converts this season's 1군-registered team-games (plus any carried-over
 * partial-year credit) into a `serviceTimeYears` increment and a new carry
 * remainder, mirroring KBO's cumulative 등록일수 system: a player needs
 * `GAMES_PER_SERVICE_YEAR` total registered games to earn a full year, and
 * a season that falls short simply rolls its days into next year's total
 * rather than granting credit outright.
 */
function accrueServiceTime(profile: PlayerProfile, registeredGames: number): { serviceTimeYears: number; registeredDaysCarry: number } {
  const totalDays = (profile.registeredDaysCarry ?? 0) + registeredGames;
  const yearsEarned = Math.floor(totalDays / GAMES_PER_SERVICE_YEAR);
  return {
    serviceTimeYears: profile.serviceTimeYears + yearsEarned,
    registeredDaysCarry: totalDays % GAMES_PER_SERVICE_YEAR,
  };
}

/**
 * Ages one player by a year: increments `age`, grows or declines scalable
 * attributes, and credits service time only for `registeredGames` — the
 * number of this team's games the player actually spent on the 1군 active
 * roster this season (0 for a player who stayed on 2군/IL all year).
 * Retirement is driven by performance: a player whose OVR drops below ~50
 * due to the aging curve will face increasing retirement probability, while
 * a still-elite player at 40 will almost never retire. Hard cap at age 50
 * (physical impossibility).
 */
export function ageOnePlayer(profile: PlayerProfile, registeredGames: number, rng: () => number): PlayerProfile {
  const age = profile.age + 1;
  const attributes = profile.kind === 'batter'
    ? developBatterAttributes(profile.attributes as BatterAttributes, profile.potential, age, rng)
    : developPitcherAttributes(profile.attributes as PitcherAttributes, profile.potential, age, rng);

  const { serviceTimeYears, registeredDaysCarry } = accrueServiceTime(profile, registeredGames);
  const aged: PlayerProfile = { ...profile, age, serviceTimeYears, registeredDaysCarry, attributes };

  const retires = age >= RETIREMENT_HARD_AGE || rng() < retirementProbability(aged);
  return retires ? { ...aged, rosterStatus: '은퇴' as const } : aged;
}

/**
 * Ages every player in `roster` by one year via `ageOnePlayer`, splitting out
 * anyone who retired this offseason into a separate list. `registeredGames`
 * maps `playerId` to the number of this team's games they spent on the 1군
 * active roster this season (missing entries count as 0).
 */
export function developRoster(
  roster: readonly PlayerProfile[],
  registeredGames: ReadonlyMap<string, number>,
  rng: () => number,
): { roster: PlayerProfile[]; retired: PlayerProfile[] } {
  const remaining: PlayerProfile[] = [];
  const retired: PlayerProfile[] = [];

  for (const profile of roster) {
    const aged = ageOnePlayer(profile, registeredGames.get(profile.playerId) ?? 0, rng);
    (aged.rosterStatus === '은퇴' ? retired : remaining).push(aged);
  }

  return { roster: remaining, retired };
}
