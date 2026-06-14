import type { BatterAttributes, PitcherAttributes, PitcherRole } from '../types/player.js';
import type { GameSituation } from '../types/situation.js';
import type { RunnerOnBase } from '../types/baserunning.js';
import { fatigueFactor } from './pitchSelection.js';
import { clamp } from '../utils/math.js';

/**
 * Leverage index in [0, 1]: how much the current moment matters to the
 * outcome of the game. Combines how late the game is, how close the
 * score is, and whether there's a runner in scoring position. Used both
 * to drive managerial decisions (pinch hitters/runners, pitching changes)
 * and to scale clutch/composure effects on player performance.
 */
export function calculateLeverage(situation: GameSituation): number {
  const lateness = clamp((situation.inning - 5) / 4, 0, 1);
  const closeness = clamp(1 - Math.abs(situation.scoreDiff) / 4, 0, 1);
  const risp = clamp((situation.runners.second ? 0.5 : 0) + (situation.runners.third ? 0.5 : 0), 0, 1);

  return clamp(lateness * 0.4 + closeness * 0.4 + risp * 0.2, 0, 1);
}

/**
 * Decides whether the defense brings in a relief pitcher before the next
 * batter. A starter who is gassed (high fatigue) is pulled more readily
 * in high-leverage spots ("quick hook"), while a fresh arm is left in
 * even late in lopsided games. A non-closer protecting a save situation
 * in the 9th or later is also likely to be lifted for a fresh closer.
 */
export function decidePitchingChange(
  pitcher: PitcherAttributes,
  pitchCount: number,
  hasBullpenAvailable: boolean,
  situation: GameSituation,
  rng: () => number = Math.random,
): boolean {
  if (!hasBullpenAvailable) return false;

  // Hard cap: an exhausted starter comes out essentially every time.
  if (pitchCount >= 120) return true;

  const leverage = calculateLeverage(situation);

  const isSaveSituation =
    situation.inning >= 9 && situation.scoreDiff > 0 && situation.scoreDiff <= 3 && pitcher.role !== 'closer';
  if (isSaveSituation && rng() < 0.6) return true;

  const fatigue = fatigueFactor({ ...situation, pitcherPitchCount: pitchCount }, pitcher);
  if (fatigue <= 0) return false;

  const hookThreshold = clamp(0.75 - leverage * 0.35, 0.25, 0.75);
  return fatigue >= hookThreshold && rng() < 0.35 + fatigue * 0.5;
}

/**
 * Picks the best available reliever for the situation: closers protect a
 * late, narrow lead, setup men cover the 7th-8th, and long relief covers
 * everything else. Falls back to the best remaining arm by `stuff` if no
 * role match is available.
 */
export function selectReliever(
  bullpen: readonly PitcherAttributes[],
  situation: GameSituation,
): PitcherAttributes | undefined {
  if (bullpen.length === 0) return undefined;

  const byRole = (role: PitcherRole) => bullpen.find((p) => p.role === role);

  const isSaveSituation = situation.inning >= 9 && situation.scoreDiff > 0 && situation.scoreDiff <= 3;
  const isSetupSpot = situation.inning >= 7;

  const preferred = isSaveSituation
    ? byRole('closer') ?? byRole('setup')
    : isSetupSpot
      ? byRole('setup') ?? byRole('closer')
      : byRole('longRelief');

  if (preferred) return preferred;

  return [...bullpen].sort((a, b) => b.stuff - a.stuff)[0];
}

/**
 * Decides whether to send up a pinch hitter for the due-up batter. Looks
 * for a bench bat with a meaningfully better platoon matchup against this
 * pitcher's throwing hand, weighted by leverage - pinch-hitting is rare
 * early in the game or in lopsided scores.
 */
export function decidePinchHitter(
  batter: BatterAttributes,
  bench: readonly BatterAttributes[],
  pitcher: PitcherAttributes,
  situation: GameSituation,
  rng: () => number = Math.random,
): BatterAttributes | undefined {
  if (bench.length === 0 || situation.inning < 6) return undefined;

  const leverage = calculateLeverage(situation);
  if (leverage < 0.3) return undefined;

  const contactFor = (b: BatterAttributes) => (pitcher.throwingHand === 'R' ? b.contactVsRight : b.contactVsLeft);
  const currentContact = contactFor(batter);

  let best: BatterAttributes | undefined;
  let bestGain = 0;
  for (const candidate of bench) {
    const gain = contactFor(candidate) - currentContact;
    if (gain > bestGain) {
      bestGain = gain;
      best = candidate;
    }
  }

  if (!best || bestGain < 8) return undefined;

  const prob = clamp((bestGain - 8) / 20, 0, 1) * leverage;
  return rng() < prob ? best : undefined;
}

/**
 * Decides whether to replace a baserunner with a faster pinch runner.
 * Only worth burning a bench player late in a close game, and only when
 * the speed upgrade is significant.
 */
export function decidePinchRunner(
  runner: RunnerOnBase,
  bench: readonly BatterAttributes[],
  situation: GameSituation,
  rng: () => number = Math.random,
): BatterAttributes | undefined {
  if (bench.length === 0 || situation.inning < 7) return undefined;

  const leverage = calculateLeverage(situation);
  if (leverage < 0.4) return undefined;

  let best: BatterAttributes | undefined;
  let bestGain = 0;
  for (const candidate of bench) {
    const gain = candidate.speed - runner.speed;
    if (gain > bestGain) {
      bestGain = gain;
      best = candidate;
    }
  }

  if (!best || bestGain < 15) return undefined;

  const prob = clamp((bestGain - 15) / 30, 0, 1) * leverage;
  return rng() < prob ? best : undefined;
}
