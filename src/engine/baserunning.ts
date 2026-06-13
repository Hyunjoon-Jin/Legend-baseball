import type { PitcherAttributes } from '../types/player.js';
import type { GameSituation } from '../types/situation.js';
import type { PlateAppearanceResult, BattedBallProfile } from '../types/outcome.js';
import type {
  BaseName,
  BaseRunners,
  BaseRunningEvent,
  BaseRunningResult,
  RunnerOnBase,
} from '../types/baserunning.js';
import { clamp, sigmoid } from '../utils/math.js';

/** Removes a runner from the given base, returning the updated runner set. */
function withRunnerRemoved(runners: BaseRunners, base: BaseName): BaseRunners {
  const next = { ...runners };
  delete next[base];
  return next;
}

/** Moves a runner from one base to another (or off the bases if `to` is 'home'). */
function withRunnerMoved(runners: BaseRunners, from: BaseName, to: BaseName | 'home'): BaseRunners {
  const next = withRunnerRemoved(runners, from);
  if (to !== 'home') {
    next[to] = runners[from];
  }
  return next;
}

// ---------------------------------------------------------------------------
// Stolen bases & pickoffs (resolved once per pitch, before the pitch result)
// ---------------------------------------------------------------------------

export interface StolenBaseAttempt {
  runner: RunnerOnBase;
  from: BaseName;
  to: BaseName;
}

/**
 * Decides whether a runner attempts to steal on this pitch. At most one
 * attempt is considered per pitch, with the lead runner (closer to home)
 * given priority. Returns `null` if no attempt is made.
 */
export function decideStolenBaseAttempt(
  runners: BaseRunners,
  pitcher: PitcherAttributes,
  situation: GameSituation,
  rng: () => number = Math.random,
): StolenBaseAttempt | null {
  // Blowouts suppress aggressive baserunning.
  const blowoutFactor = Math.abs(situation.scoreDiff) >= 5 ? 0.3 : 1;

  const candidates: { runner: RunnerOnBase; from: BaseName; to: BaseName }[] = [];
  if (runners.second && !runners.third) candidates.push({ runner: runners.second, from: 'second', to: 'third' });
  if (runners.first && !runners.second) candidates.push({ runner: runners.first, from: 'first', to: 'second' });

  for (const candidate of candidates) {
    const attemptProb = clamp(
      0.12 +
        ((candidate.runner.stealRating - 50) / 100) * 0.15 +
        ((candidate.runner.baserunningAggressiveness - 50) / 100) * 0.1 -
        ((pitcher.holdRunnerRating - 50) / 100) * 0.08,
      0.01,
      0.5,
    ) * blowoutFactor;

    if (rng() < attemptProb) return candidate;
  }

  return null;
}

/**
 * Resolves a stolen base attempt against the catcher's arm and the
 * pitcher's ability to hold runners.
 */
export function resolveStolenBaseAttempt(
  attempt: StolenBaseAttempt,
  pitcher: PitcherAttributes,
  situation: GameSituation,
  rng: () => number = Math.random,
): 'success' | 'caughtStealing' {
  const defenseRating = situation.defense.catcherArm * 0.6 + pitcher.holdRunnerRating * 0.4;
  const successProb = clamp(sigmoid(attempt.runner.stealRating - defenseRating, 18) + 0.15, 0.3, 0.97);
  return rng() < successProb ? 'success' : 'caughtStealing';
}

/**
 * Small per-pitch chance that a lead runner is picked off, independent of
 * any steal attempt. Driven by the pitcher's hold/pickoff rating.
 */
export function checkPickoff(
  runners: BaseRunners,
  pitcher: PitcherAttributes,
  rng: () => number = Math.random,
): { runner: RunnerOnBase; from: BaseName } | null {
  const candidates: { runner: RunnerOnBase; from: BaseName }[] = [];
  if (runners.first) candidates.push({ runner: runners.first, from: 'first' });
  if (runners.second) candidates.push({ runner: runners.second, from: 'second' });
  if (runners.third) candidates.push({ runner: runners.third, from: 'third' });

  for (const candidate of candidates) {
    const pickoffProb = clamp(((pitcher.holdRunnerRating - 50) / 100) * 0.01, 0, 0.01);
    if (rng() < pickoffProb) return candidate;
  }
  return null;
}

/**
 * Applies a resolved steal/pickoff to the runner state, returning the
 * updated runners and the corresponding event(s).
 */
export function applyStolenBaseAttempt(
  runners: BaseRunners,
  attempt: StolenBaseAttempt,
  outcome: 'success' | 'caughtStealing',
  pitchNumber: number,
): { runners: BaseRunners; events: BaseRunningEvent[] } {
  const events: BaseRunningEvent[] = [{ type: 'stolenBaseAttempt', runnerId: attempt.runner.runnerId, from: attempt.from, to: attempt.to, pitchNumber }];

  if (outcome === 'success') {
    events.push({ type: 'stolenBaseSuccess', runnerId: attempt.runner.runnerId, from: attempt.from, to: attempt.to, pitchNumber });
    return { runners: withRunnerMoved(runners, attempt.from, attempt.to), events };
  }

  events.push({ type: 'caughtStealing', runnerId: attempt.runner.runnerId, from: attempt.from, to: attempt.to, pitchNumber });
  return { runners: withRunnerRemoved(runners, attempt.from), events };
}

export function applyPickoff(
  runners: BaseRunners,
  pickoff: { runner: RunnerOnBase; from: BaseName },
  pitchNumber: number,
): { runners: BaseRunners; events: BaseRunningEvent[] } {
  return {
    runners: withRunnerRemoved(runners, pickoff.from),
    events: [{ type: 'pickoff', runnerId: pickoff.runner.runnerId, from: pickoff.from, pitchNumber }],
  };
}

// ---------------------------------------------------------------------------
// Runner advancement on the batted ball / walk / HBP
// ---------------------------------------------------------------------------

/**
 * Probability that a runner takes an extra base / scores from a
 * non-guaranteed situation, blending runner speed and aggressiveness
 * against the relevant defensive rating.
 */
function extraAdvanceProbability(base: number, runner: RunnerOnBase, outs: number, defenseRating: number): number {
  let p = base;
  p += ((runner.speed - 50) / 100) * 0.3;
  p += ((runner.baserunningAggressiveness - 50) / 100) * 0.15;
  if (outs === 2) p += 0.15;
  p -= ((defenseRating - 50) / 100) * 0.2;
  return clamp(p, 0.02, 0.97);
}

/**
 * Force-advances runners on a walk/HBP: the batter takes first, pushing
 * any runner already on first to second, and so on down the chain.
 */
function forceAdvance(runners: BaseRunners, batterRunner: RunnerOnBase): BaseRunningResult {
  const events: BaseRunningEvent[] = [];
  let runsScored = 0;
  let next: BaseRunners = { ...runners };

  if (runners.first) {
    if (runners.second) {
      if (runners.third) {
        runsScored += 1;
        events.push({ type: 'runnerScored', runnerId: runners.third.runnerId, from: 'third', to: 'home' });
      }
      next.third = runners.second;
      events.push({ type: 'runnerAdvance', runnerId: runners.second.runnerId, from: 'second', to: 'third' });
    }
    next.second = runners.first;
    events.push({ type: 'runnerAdvance', runnerId: runners.first.runnerId, from: 'first', to: 'second' });
  }
  next.first = batterRunner;

  return { finalRunners: next, runsScored, outsOnBases: 0, events };
}

function resolveSingle(
  runners: BaseRunners,
  batterRunner: RunnerOnBase,
  battedBall: BattedBallProfile,
  situation: GameSituation,
  rng: () => number,
): BaseRunningResult {
  const events: BaseRunningEvent[] = [];
  let runsScored = 0;
  const next: BaseRunners = {};

  if (runners.third) {
    runsScored += 1;
    events.push({ type: 'runnerScored', runnerId: runners.third.runnerId, from: 'third', to: 'home' });
  }

  if (runners.second) {
    const base = battedBall.type === 'groundBall' ? 0.35 : battedBall.type === 'lineDrive' ? 0.55 : 0.5;
    const prob = extraAdvanceProbability(base, runners.second, situation.outs, situation.defense.outfieldArm);
    if (rng() < prob) {
      runsScored += 1;
      events.push({ type: 'runnerScored', runnerId: runners.second.runnerId, from: 'second', to: 'home' });
    } else {
      next.third = runners.second;
      events.push({ type: 'runnerAdvance', runnerId: runners.second.runnerId, from: 'second', to: 'third' });
    }
  }

  if (runners.first) {
    const prob = extraAdvanceProbability(0.28, runners.first, situation.outs, situation.defense.outfieldArm);
    if (rng() < prob) {
      next.third = runners.first;
      events.push({ type: 'runnerAdvance', runnerId: runners.first.runnerId, from: 'first', to: 'third' });
    } else {
      next.second = runners.first;
      events.push({ type: 'runnerAdvance', runnerId: runners.first.runnerId, from: 'first', to: 'second' });
    }
  }

  next.first = batterRunner;
  return { finalRunners: next, runsScored, outsOnBases: 0, events };
}

function resolveInfieldSingle(runners: BaseRunners, batterRunner: RunnerOnBase): BaseRunningResult {
  // The ball never reaches the outfield, so runners advance only one base.
  return forceLikeAdvanceOneBase(runners, batterRunner);
}

/** Every occupied base advances exactly one base (used for infield singles / errors on a force). */
function forceLikeAdvanceOneBase(runners: BaseRunners, batterRunner: RunnerOnBase): BaseRunningResult {
  const events: BaseRunningEvent[] = [];
  let runsScored = 0;
  const next: BaseRunners = {};

  if (runners.third) {
    runsScored += 1;
    events.push({ type: 'runnerScored', runnerId: runners.third.runnerId, from: 'third', to: 'home' });
  }
  if (runners.second) {
    next.third = runners.second;
    events.push({ type: 'runnerAdvance', runnerId: runners.second.runnerId, from: 'second', to: 'third' });
  }
  if (runners.first) {
    next.second = runners.first;
    events.push({ type: 'runnerAdvance', runnerId: runners.first.runnerId, from: 'first', to: 'second' });
  }
  next.first = batterRunner;
  return { finalRunners: next, runsScored, outsOnBases: 0, events };
}

function resolveDouble(
  runners: BaseRunners,
  batterRunner: RunnerOnBase,
  situation: GameSituation,
  rng: () => number,
): BaseRunningResult {
  const events: BaseRunningEvent[] = [];
  let runsScored = 0;
  const next: BaseRunners = {};

  if (runners.third) {
    runsScored += 1;
    events.push({ type: 'runnerScored', runnerId: runners.third.runnerId, from: 'third', to: 'home' });
  }
  if (runners.second) {
    runsScored += 1;
    events.push({ type: 'runnerScored', runnerId: runners.second.runnerId, from: 'second', to: 'home' });
  }
  if (runners.first) {
    const prob = extraAdvanceProbability(0.35, runners.first, situation.outs, situation.defense.outfieldArm);
    if (rng() < prob) {
      runsScored += 1;
      events.push({ type: 'runnerScored', runnerId: runners.first.runnerId, from: 'first', to: 'home' });
    } else {
      next.third = runners.first;
      events.push({ type: 'runnerAdvance', runnerId: runners.first.runnerId, from: 'first', to: 'third' });
    }
  }

  next.second = batterRunner;
  return { finalRunners: next, runsScored, outsOnBases: 0, events };
}

/** Triple / home run / inside-the-park home run: every existing runner scores. */
function resolveClearTheBases(runners: BaseRunners, batterRunner: RunnerOnBase | null): BaseRunningResult {
  const events: BaseRunningEvent[] = [];
  let runsScored = 0;
  for (const base of ['first', 'second', 'third'] as BaseName[]) {
    const runner = runners[base];
    if (runner) {
      runsScored += 1;
      events.push({ type: 'runnerScored', runnerId: runner.runnerId, from: base, to: 'home' });
    }
  }
  const next: BaseRunners = batterRunner ? { third: batterRunner } : {};
  return { finalRunners: next, runsScored, outsOnBases: 0, events };
}

function resolveSacrificeFly(runners: BaseRunners, situation: GameSituation, rng: () => number): BaseRunningResult {
  const events: BaseRunningEvent[] = [];
  let runsScored = 0;
  const next: BaseRunners = {};

  if (runners.third) {
    runsScored += 1;
    events.push({ type: 'runnerScored', runnerId: runners.third.runnerId, from: 'third', to: 'home' });
  }
  if (runners.second) {
    const prob = extraAdvanceProbability(0.45, runners.second, situation.outs, situation.defense.outfieldDefense);
    if (rng() < prob) {
      next.third = runners.second;
      events.push({ type: 'runnerAdvance', runnerId: runners.second.runnerId, from: 'second', to: 'third' });
    } else {
      next.second = runners.second;
      events.push({ type: 'runnerHeld', runnerId: runners.second.runnerId, from: 'second' });
    }
  }
  if (runners.first) {
    const prob = extraAdvanceProbability(0.1, runners.first, situation.outs, situation.defense.outfieldDefense);
    if (rng() < prob) {
      next.second = runners.first;
      events.push({ type: 'runnerAdvance', runnerId: runners.first.runnerId, from: 'first', to: 'second' });
    } else {
      next.first = runners.first;
      events.push({ type: 'runnerHeld', runnerId: runners.first.runnerId, from: 'first' });
    }
  }

  return { finalRunners: next, runsScored, outsOnBases: 0, events };
}

function resolveProductiveGroundOut(runners: BaseRunners, situation: GameSituation, rng: () => number): BaseRunningResult {
  const events: BaseRunningEvent[] = [];
  let runsScored = 0;
  const next: BaseRunners = { ...runners };

  if (runners.third && situation.outs < 2) {
    const prob = extraAdvanceProbability(0.4, runners.third, situation.outs, situation.defense.infieldDefense);
    if (rng() < prob) {
      runsScored += 1;
      delete next.third;
      events.push({ type: 'runnerScored', runnerId: runners.third.runnerId, from: 'third', to: 'home' });
    } else {
      events.push({ type: 'runnerHeld', runnerId: runners.third.runnerId, from: 'third' });
    }
  }

  return { finalRunners: next, runsScored, outsOnBases: 0, events };
}

/** Double play: removes the most relevant lead runner; other runners hold and do not score. */
function resolveDoublePlay(runners: BaseRunners): BaseRunningResult {
  const events: BaseRunningEvent[] = [];
  const next: BaseRunners = { ...runners };

  const removedBase: BaseName | null = runners.first ? 'first' : runners.second ? 'second' : runners.third ? 'third' : null;
  if (removedBase) {
    const runner = runners[removedBase]!;
    delete next[removedBase];
    events.push({ type: 'runnerOutOnBases', runnerId: runner.runnerId, from: removedBase });
  }

  for (const base of ['first', 'second', 'third'] as BaseName[]) {
    if (base !== removedBase && next[base]) {
      events.push({ type: 'runnerHeld', runnerId: next[base]!.runnerId, from: base });
    }
  }

  return { finalRunners: next, runsScored: 0, outsOnBases: 0, events };
}

/** Triple play: clears all baserunners (all three are out). */
function resolveTriplePlay(runners: BaseRunners): BaseRunningResult {
  const events: BaseRunningEvent[] = [];
  for (const base of ['first', 'second', 'third'] as BaseName[]) {
    const runner = runners[base];
    if (runner) events.push({ type: 'runnerOutOnBases', runnerId: runner.runnerId, from: base });
  }
  return { finalRunners: {}, runsScored: 0, outsOnBases: 0, events };
}

/** Fielder's choice: the lead runner is forced out, the batter reaches first. */
function resolveFieldersChoice(runners: BaseRunners, batterRunner: RunnerOnBase): BaseRunningResult {
  const events: BaseRunningEvent[] = [];
  const next: BaseRunners = { ...runners };

  const outBase: BaseName | null = runners.first ? 'first' : runners.second ? 'second' : runners.third ? 'third' : null;
  if (outBase) {
    const runner = runners[outBase]!;
    delete next[outBase];
    events.push({ type: 'runnerOutOnBases', runnerId: runner.runnerId, from: outBase });
  }

  for (const base of ['first', 'second', 'third'] as BaseName[]) {
    if (base !== outBase && next[base]) {
      events.push({ type: 'runnerHeld', runnerId: next[base]!.runnerId, from: base });
    }
  }

  next.first = batterRunner;
  return { finalRunners: next, runsScored: 0, outsOnBases: 0, events };
}

function noAdvancement(runners: BaseRunners): BaseRunningResult {
  const events: BaseRunningEvent[] = [];
  for (const base of ['first', 'second', 'third'] as BaseName[]) {
    const runner = runners[base];
    if (runner) events.push({ type: 'runnerHeld', runnerId: runner.runnerId, from: base });
  }
  return { finalRunners: { ...runners }, runsScored: 0, outsOnBases: 0, events };
}

/**
 * Resolves baserunner advancement (and runs scored) for a completed
 * plate appearance. `batterRunner` should be `null` for results where
 * the batter does not become a baserunner (outs, strikeouts, etc.).
 */
export function advanceRunnersOnPlay(
  result: PlateAppearanceResult,
  battedBall: BattedBallProfile | undefined,
  runners: BaseRunners,
  batterRunner: RunnerOnBase,
  situation: GameSituation,
  rng: () => number = Math.random,
): BaseRunningResult {
  switch (result) {
    case 'walk':
    case 'intentionalWalk':
    case 'hitByPitch':
      return forceAdvance(runners, batterRunner);

    case 'single':
    case 'reachedOnError':
      return battedBall ? resolveSingle(runners, batterRunner, battedBall, situation, rng) : resolveInfieldSingle(runners, batterRunner);

    case 'infieldSingle':
      return resolveInfieldSingle(runners, batterRunner);

    case 'double':
      return resolveDouble(runners, batterRunner, situation, rng);

    case 'triple':
      return resolveClearTheBases(runners, batterRunner);

    case 'homeRun':
    case 'insideTheParkHomeRun':
      return resolveClearTheBases(runners, null);

    case 'sacrificeFly':
      return resolveSacrificeFly(runners, situation, rng);

    case 'groundOut':
      return resolveProductiveGroundOut(runners, situation, rng);

    case 'doublePlay':
      return resolveDoublePlay(runners);

    case 'triplePlay':
      return resolveTriplePlay(runners);

    case 'fieldersChoice':
    case 'sacrificeBunt':
      return resolveFieldersChoice(runners, batterRunner);

    // Fly/line/pop outs and strikeouts: no baserunner movement.
    default:
      return noAdvancement(runners);
  }
}
