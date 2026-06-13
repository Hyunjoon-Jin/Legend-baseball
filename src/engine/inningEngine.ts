import type { PitcherAttributes } from '../types/player.js';
import type { BallparkFactors, GameSituation, WeatherConditions } from '../types/situation.js';
import { defaultBallpark, defaultWeather } from '../types/situation.js';
import type { BaseRunners, DefensiveTeamRatings } from '../types/baserunning.js';
import type { HalfInningResult, InningPlateAppearance, Lineup } from '../types/game.js';
import { OUTCOME_CATEGORY } from '../types/outcome.js';
import { simulateAtBat } from './matchupEngine.js';

/** Safety guard against pathological loops (e.g. endless walks/errors). */
const MAX_PLATE_APPEARANCES_PER_HALF_INNING = 60;

export interface HalfInningContext {
  inning: number;
  half: 'top' | 'bottom';
  /** Batting team's lineup, in order. */
  lineup: Lineup;
  /** Lineup index (0-based) of the first batter due up. Defaults to 0. */
  startingBatterIndex?: number;
  /** Defending team's pitcher. */
  pitcher: PitcherAttributes;
  /** Pitcher's cumulative pitch count entering this half-inning. Defaults to 0. */
  pitcherPitchCountStart?: number;
  /** Pitcher's daily condition modifier, 0-100 (50 = normal). Defaults to 50. */
  pitcherCondition?: number;
  /** Batting team's daily condition modifier, 0-100 (50 = normal). Defaults to 50. */
  batterCondition?: number;
  /** Defending team's fielding ratings. */
  defense: DefensiveTeamRatings;
  weather?: WeatherConditions;
  ballpark?: BallparkFactors;
  /** Score differential from the batting team's perspective at the start of the half-inning. Defaults to 0. */
  startingScoreDiff?: number;
  /** Outs already recorded at the start of the half-inning. Defaults to 0. */
  startingOuts?: 0 | 1 | 2;
  /** Runners already on base at the start of the half-inning. Defaults to empty. */
  startingRunners?: BaseRunners;
  /**
   * Checked after each completed plate appearance with the updated score
   * differential (batting team's perspective). If it returns true, the
   * half-inning ends immediately - used for walk-off conditions in the
   * bottom of the 9th or later.
   */
  isGameOver?: (scoreDiff: number) => boolean;
}

/**
 * Simulates one half-inning (top or bottom) by repeatedly calling
 * `simulateAtBat`, rotating through the batting order, carrying baserunners
 * and the score differential from one plate appearance to the next, and
 * accumulating the pitcher's pitch count for fatigue modeling on subsequent
 * half-innings.
 *
 * The half-inning normally ends once 3 outs are recorded. If `isGameOver`
 * is supplied and returns true after a play (e.g. a walk-off run), the
 * half-inning ends immediately even with fewer than 3 outs.
 *
 * A batter whose plate appearance is interrupted by an inning-ending caught
 * stealing/pickoff (`inningEndingCaughtStealing`) remains "due up" - the
 * returned `nextBatterIndex` will point back at him so his at-bat resumes
 * fresh next time this team bats.
 */
export function simulateHalfInning(ctx: HalfInningContext, rng: () => number = Math.random): HalfInningResult {
  const { lineup } = ctx;
  if (lineup.length === 0) throw new Error('lineup must contain at least one batter');

  let batterIndex = ctx.startingBatterIndex ?? 0;
  let outs: number = ctx.startingOuts ?? 0;
  let runners: BaseRunners = ctx.startingRunners ?? {};
  let pitchCount = ctx.pitcherPitchCountStart ?? 0;
  let scoreDiff = ctx.startingScoreDiff ?? 0;

  const weather = ctx.weather ?? defaultWeather;
  const ballpark = ctx.ballpark ?? defaultBallpark;
  const pitcherCondition = ctx.pitcherCondition ?? 50;
  const batterCondition = ctx.batterCondition ?? 50;

  const plateAppearances: InningPlateAppearance[] = [];
  let runsScored = 0;
  let hits = 0;
  let walks = 0;
  let strikeouts = 0;
  let endedByWalkOff = false;

  for (let i = 0; i < MAX_PLATE_APPEARANCES_PER_HALF_INNING && outs < 3; i++) {
    const lineupIndex = batterIndex % lineup.length;
    const batter = lineup[lineupIndex];

    const situation: GameSituation = {
      inning: ctx.inning,
      half: ctx.half,
      outs: outs as 0 | 1 | 2,
      balls: 0,
      strikes: 0,
      scoreDiff,
      runners,
      pitcherPitchCount: pitchCount,
      pitcherCondition,
      batterCondition,
      weather,
      ballpark,
      defense: ctx.defense,
    };

    const atBat = simulateAtBat(ctx.pitcher, batter, situation, rng);

    pitchCount += atBat.pitches.length;
    outs = Math.min(3, outs + atBat.outsRecorded);
    runners = atBat.finalRunners;
    runsScored += atBat.runsScored;
    scoreDiff += atBat.runsScored;

    const category = OUTCOME_CATEGORY[atBat.result];
    if (category === 'hit') hits++;
    else if (category === 'walk') walks++;
    else if (category === 'strikeout') strikeouts++;

    plateAppearances.push({
      lineupIndex,
      batter,
      atBat,
      outsAfter: outs as 0 | 1 | 2 | 3,
      runsAfter: runsScored,
      scoreDiffAfter: scoreDiff,
    });

    // A caught-stealing/pickoff that ends the inning mid-at-bat leaves this
    // batter still due up; everyone else advances normally.
    if (atBat.result !== 'inningEndingCaughtStealing') {
      batterIndex++;
    }

    if (ctx.isGameOver?.(scoreDiff)) {
      endedByWalkOff = true;
      break;
    }
  }

  const leftOnBase = (Number(!!runners.first) + Number(!!runners.second) + Number(!!runners.third)) as 0 | 1 | 2 | 3;

  return {
    inning: ctx.inning,
    half: ctx.half,
    plateAppearances,
    runsScored,
    hits,
    walks,
    strikeouts,
    leftOnBase,
    pitchesThrown: pitchCount - (ctx.pitcherPitchCountStart ?? 0),
    nextBatterIndex: batterIndex % lineup.length,
    pitcherPitchCount: pitchCount,
    endedByWalkOff,
  };
}
