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
 * in the 9th or later is also likely to be lifted for a fresh closer. A
 * pitcher getting shelled for several runs within the current inning is
 * pulled to stop the bleeding regardless of pitch count or fatigue - the
 * classic "he doesn't have it today" hook.
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

  // Disaster inning: once a pitcher has allowed 4+ runs in this inning
  // alone, the odds of being pulled climb sharply with every additional
  // run, reaching near-certainty by 7-8 - a starter doesn't get to give
  // up 8 in a single frame without the bullpen phone ringing first.
  const runsAllowedThisInning = situation.runsAllowedThisInning ?? 0;
  if (runsAllowedThisInning >= 4) {
    const disasterProb = clamp(0.4 + (runsAllowedThisInning - 4) * 0.2, 0.4, 0.95);
    if (rng() < disasterProb) return true;
  }

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
 * Engine-local estimate (1-99) of how dangerous a batter is, used to decide
 * intentional walks and lineup-protection pitch selection. Mirrors
 * `roster/rating.ts`'s `batterOverallRating` formula but is kept
 * self-contained here since `engine/` does not depend on the `roster/`
 * layer.
 */
export function batterThreatLevel(batter: BatterAttributes): number {
  const contact = (batter.contactVsRight + batter.contactVsLeft) / 2;
  const value =
    contact * 0.3 +
    batter.power * 0.25 +
    batter.plateDiscipline * 0.15 +
    batter.speed * 0.1 +
    batter.badBallHitting * 0.1 +
    batter.clutch * 0.1;
  return clamp(Math.round(value), 1, 99);
}

/**
 * Decides whether the defense intentionally walks the batter to instead
 * face the on-deck hitter - classic "lineup protection". Only considered
 * with first base open and a runner in scoring position (the standard
 * percentage-baseball precondition), and only worth it when the batter at
 * the plate is a real threat and the on-deck hitter is enough of a
 * downgrade to make the trade worthwhile. Scaled by leverage so it stays a
 * late/close-game tactic rather than a routine one.
 */
export function decideIntentionalWalk(
  batter: BatterAttributes,
  onDeck: BatterAttributes | undefined,
  situation: GameSituation,
  rng: () => number = Math.random,
): boolean {
  if (situation.runners.first || !(situation.runners.second || situation.runners.third)) return false;
  if (!onDeck) return false;

  const leverage = calculateLeverage(situation);
  if (leverage < 0.5) return false;

  const batterThreat = batterThreatLevel(batter);
  const threatGap = batterThreat - batterThreatLevel(onDeck);
  if (batterThreat < 70 || threatGap < 15) return false;

  const prob = clamp((threatGap - 15) / 40, 0, 1) * leverage * 0.5;
  return rng() < prob;
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
