import type { BatterAttributes, PitcherAttributes } from '../types/player.js';
import type { GameSituation } from '../types/situation.js';
import type { AtBatResult, PitchEvent, PlateAppearanceResult } from '../types/outcome.js';
import { OUTCOME_CATEGORY } from '../types/outcome.js';
import { selectPitch } from './pitchSelection.js';
import { decideSwing } from './swingDecision.js';
import { resolvePitch } from './contactResolution.js';
import { generateBattedBall } from './battedBall.js';
import { mapBattedBallToOutcome } from './outcomeMapper.js';

const MAX_PITCHES_PER_AT_BAT = 30; // safety guard against pathological loops

function forcedWalkRuns(situation: GameSituation): number {
  return situation.runners.first && situation.runners.second && situation.runners.third ? 1 : 0;
}

function buildResult(
  pitches: PitchEvent[],
  result: PlateAppearanceResult,
  basesReached: 0 | 1 | 2 | 3 | 4,
  runsScoredEstimate: number,
  battedBall?: AtBatResult['battedBall'],
): AtBatResult {
  return {
    pitches,
    result,
    category: OUTCOME_CATEGORY[result],
    battedBall,
    basesReached,
    runsScoredEstimate,
  };
}

/**
 * Simulates a full plate appearance pitch-by-pitch, returning a fully
 * detailed result: every pitch thrown, the final outcome classification,
 * the batted-ball profile (if any), bases reached, and an estimate of
 * runs scored on the play.
 *
 * The input `situation` is treated as the count/state *at the start* of
 * the at-bat; `situation.balls`/`situation.strikes` are typically 0/0
 * but can be non-zero to resume from mid-count.
 */
export function simulateAtBat(
  pitcher: PitcherAttributes,
  batter: BatterAttributes,
  situation: GameSituation,
  rng: () => number = Math.random,
): AtBatResult {
  const pitches: PitchEvent[] = [];

  let balls = situation.balls;
  let strikes = situation.strikes;
  let pitchCount = situation.pitcherPitchCount;

  for (let i = 0; i < MAX_PITCHES_PER_AT_BAT; i++) {
    const current: GameSituation = {
      ...situation,
      balls: balls as GameSituation['balls'],
      strikes: strikes as GameSituation['strikes'],
      pitcherPitchCount: pitchCount,
    };

    const pitch = selectPitch(pitcher, current, rng);
    const swung = decideSwing(batter, pitch, current, rng);
    const pitchResult = resolvePitch(batter, pitcher, pitch, swung, current, rng);

    pitches.push({
      pitchNumber: pitchCount + 1,
      pitchType: pitch.pitchType,
      zone: pitch.zone,
      velocity: pitch.velocity,
      result: pitchResult,
      countBefore: { balls, strikes },
    });
    pitchCount++;

    switch (pitchResult) {
      case 'hitByPitch':
        return buildResult(pitches, 'hitByPitch', 1, forcedWalkRuns(current));

      case 'ball':
        balls++;
        if (balls >= 4) {
          return buildResult(pitches, 'walk', 1, forcedWalkRuns(current));
        }
        continue;

      case 'calledStrike':
        strikes++;
        if (strikes >= 3) {
          return buildResult(pitches, 'strikeoutLooking', 0, 0);
        }
        continue;

      case 'swingingStrike':
      case 'foulTip':
        strikes++;
        if (strikes >= 3) {
          return buildResult(pitches, 'strikeoutSwinging', 0, 0);
        }
        continue;

      case 'foulBall':
        if (strikes < 2) strikes++;
        continue;

      case 'inPlay': {
        const battedBall = generateBattedBall(batter, pitcher, pitch, current, rng);
        const outcome = mapBattedBallToOutcome(battedBall, batter, pitcher, current, rng);
        return buildResult(pitches, outcome.result, outcome.basesReached, outcome.runsScoredEstimate, battedBall);
      }
    }
  }

  // Should be unreachable in practice; fall back to a foul-out-equivalent.
  return buildResult(pitches, 'strikeoutLooking', 0, 0);
}

/**
 * Simulates a single pitch without advancing a full at-bat. Useful for
 * pitch-by-pitch UIs that want to drive the count externally.
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
