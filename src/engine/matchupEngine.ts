import type { BatterAttributes, PitcherAttributes } from '../types/player.js';
import type { GameSituation } from '../types/situation.js';
import type { AtBatResult, PitchEvent, PlateAppearanceResult } from '../types/outcome.js';
import { BATTER_OUTS, OUTCOME_CATEGORY } from '../types/outcome.js';
import type { BaseRunningEvent, BaseRunners, RunnerOnBase } from '../types/baserunning.js';
import { selectPitch } from './pitchSelection.js';
import { decideSwing } from './swingDecision.js';
import { resolvePitch } from './contactResolution.js';
import { generateBattedBall } from './battedBall.js';
import { mapBattedBallToOutcome } from './outcomeMapper.js';
import {
  advanceRunnersOnPlay,
  applyPickoff,
  applyStolenBaseAttempt,
  checkPickoff,
  decideStolenBaseAttempt,
  resolveStolenBaseAttempt,
} from './baserunning.js';
import { clamp } from '../utils/math.js';

const MAX_PITCHES_PER_AT_BAT = 30; // safety guard against pathological loops

function batterToRunner(batter: BatterAttributes): RunnerOnBase {
  return {
    runnerId: batter.id,
    speed: batter.speed,
    stealRating: batter.stealRating,
    baserunningAggressiveness: batter.baserunningAggressiveness,
  };
}

function buildResult(
  pitches: PitchEvent[],
  result: PlateAppearanceResult,
  basesReached: 0 | 1 | 2 | 3 | 4,
  runsScored: number,
  finalRunners: BaseRunners,
  baseRunningEvents: BaseRunningEvent[],
  outsRecorded: number,
  battedBall?: AtBatResult['battedBall'],
): AtBatResult {
  return {
    pitches,
    result,
    category: OUTCOME_CATEGORY[result],
    battedBall,
    basesReached,
    runsScored,
    finalRunners,
    baseRunningEvents,
    outsRecorded: clamp(outsRecorded, 0, 3) as 0 | 1 | 2 | 3,
  };
}

/**
 * Simulates a full plate appearance pitch-by-pitch, returning a fully
 * detailed result: every pitch thrown, stolen-base/pickoff attempts on
 * the bases, the final outcome classification, the batted-ball profile
 * (if any), bases reached, baserunner advancement, and total outs/runs
 * produced by the play.
 *
 * The input `situation` is treated as the count/state *at the start* of
 * the at-bat; `situation.balls`/`situation.strikes` are typically 0/0
 * but can be non-zero to resume from mid-count. `situation.runners`
 * reflects the base state at the start of the at-bat.
 */
export function simulateAtBat(
  pitcher: PitcherAttributes,
  batter: BatterAttributes,
  situation: GameSituation,
  rng: () => number = Math.random,
): AtBatResult {
  const pitches: PitchEvent[] = [];
  const baseRunningEvents: BaseRunningEvent[] = [];

  let balls = situation.balls;
  let strikes = situation.strikes;
  let pitchCount = situation.pitcherPitchCount;
  let runners: BaseRunners = { ...situation.runners };
  let outsOnBases = 0;

  const outsAvailable = () => 3 - situation.outs - outsOnBases;

  for (let i = 0; i < MAX_PITCHES_PER_AT_BAT; i++) {
    const pitchNumber = pitchCount + 1;

    // Pickoff attempt, resolved before the pitch is thrown.
    if (outsAvailable() > 0) {
      const pickoff = checkPickoff(runners, pitcher, rng);
      if (pickoff) {
        const applied = applyPickoff(runners, pickoff, pitchNumber);
        runners = applied.runners;
        baseRunningEvents.push(...applied.events);
        outsOnBases++;
        if (outsAvailable() <= 0) {
          return buildResult(pitches, 'inningEndingCaughtStealing', 0, 0, runners, baseRunningEvents, 3);
        }
      }
    }

    // Stolen base attempt, resolved as the pitch is delivered.
    if (outsAvailable() > 0) {
      const attempt = decideStolenBaseAttempt(runners, pitcher, { ...situation, runners }, rng);
      if (attempt) {
        const outcome = resolveStolenBaseAttempt(attempt, pitcher, { ...situation, runners }, rng);
        const applied = applyStolenBaseAttempt(runners, attempt, outcome, pitchNumber);
        runners = applied.runners;
        baseRunningEvents.push(...applied.events);
        if (outcome === 'caughtStealing') {
          outsOnBases++;
          if (outsAvailable() <= 0) {
            return buildResult(pitches, 'inningEndingCaughtStealing', 0, 0, runners, baseRunningEvents, 3);
          }
        }
      }
    }

    const current: GameSituation = {
      ...situation,
      balls: balls as GameSituation['balls'],
      strikes: strikes as GameSituation['strikes'],
      pitcherPitchCount: pitchCount,
      runners,
    };

    const pitch = selectPitch(pitcher, current, rng);
    const swung = decideSwing(batter, pitch, current, rng);
    const pitchResult = resolvePitch(batter, pitcher, pitch, swung, current, rng);

    pitches.push({
      pitchNumber,
      pitchType: pitch.pitchType,
      zone: pitch.zone,
      velocity: pitch.velocity,
      result: pitchResult,
      countBefore: { balls, strikes },
    });
    pitchCount++;

    switch (pitchResult) {
      case 'hitByPitch': {
        const br = advanceRunnersOnPlay('hitByPitch', undefined, runners, batterToRunner(batter), current, rng);
        return buildResult(
          pitches,
          'hitByPitch',
          1,
          br.runsScored,
          br.finalRunners,
          [...baseRunningEvents, ...br.events],
          BATTER_OUTS.hitByPitch + outsOnBases,
        );
      }

      case 'ball':
        balls++;
        if (balls >= 4) {
          const br = advanceRunnersOnPlay('walk', undefined, runners, batterToRunner(batter), current, rng);
          return buildResult(
            pitches,
            'walk',
            1,
            br.runsScored,
            br.finalRunners,
            [...baseRunningEvents, ...br.events],
            BATTER_OUTS.walk + outsOnBases,
          );
        }
        continue;

      case 'calledStrike':
        strikes++;
        if (strikes >= 3) {
          return buildResult(pitches, 'strikeoutLooking', 0, 0, runners, baseRunningEvents, BATTER_OUTS.strikeoutLooking + outsOnBases);
        }
        continue;

      case 'swingingStrike':
      case 'foulTip':
        strikes++;
        if (strikes >= 3) {
          return buildResult(pitches, 'strikeoutSwinging', 0, 0, runners, baseRunningEvents, BATTER_OUTS.strikeoutSwinging + outsOnBases);
        }
        continue;

      case 'foulBall':
        if (strikes < 2) strikes++;
        continue;

      case 'inPlay': {
        const battedBall = generateBattedBall(batter, pitcher, pitch, current, rng);
        const outcome = mapBattedBallToOutcome(battedBall, batter, pitcher, current, rng);
        const br = advanceRunnersOnPlay(outcome.result, battedBall, runners, batterToRunner(batter), current, rng);
        const homeRunBonus = outcome.result === 'homeRun' || outcome.result === 'insideTheParkHomeRun' ? 1 : 0;
        return buildResult(
          pitches,
          outcome.result,
          outcome.basesReached,
          br.runsScored + homeRunBonus,
          br.finalRunners,
          [...baseRunningEvents, ...br.events],
          BATTER_OUTS[outcome.result] + outsOnBases,
          battedBall,
        );
      }
    }
  }

  // Should be unreachable in practice; fall back to a strikeout-equivalent.
  return buildResult(pitches, 'strikeoutLooking', 0, 0, runners, baseRunningEvents, BATTER_OUTS.strikeoutLooking + outsOnBases);
}

/**
 * Simulates a single pitch without advancing a full at-bat. Useful for
 * pitch-by-pitch UIs that want to drive the count externally. Does not
 * resolve stolen bases/pickoffs - use `simulateAtBat` for full fidelity.
 */
export function simulateSinglePitch(
  pitcher: PitcherAttributes,
  batter: BatterAttributes,
  situation: GameSituation,
  rng: () => number = Math.random,
): { pitch: ReturnType<typeof selectPitch>; swung: boolean; result: PitchEvent['result']; battedBall?: AtBatResult['battedBall']; outcome?: PlateAppearanceResult } {
  const pitch = selectPitch(pitcher, situation, rng);
  const swung = decideSwing(batter, pitch, situation, rng);
  const result = resolvePitch(batter, pitcher, pitch, swung, situation, rng);

  if (result === 'inPlay') {
    const battedBall = generateBattedBall(batter, pitcher, pitch, situation, rng);
    const outcome = mapBattedBallToOutcome(battedBall, batter, pitcher, situation, rng);
    return { pitch, swung, result, battedBall, outcome: outcome.result };
  }

  return { pitch, swung, result };
}
