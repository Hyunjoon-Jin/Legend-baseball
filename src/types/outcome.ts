import type { PitchType } from './player.js';
import type { ZoneLocation } from './zone.js';
import type { BaseRunningEvent, BaseRunners } from './baserunning.js';

/** Result of a single pitch. */
export type PitchResult =
  | 'calledStrike'
  | 'swingingStrike'
  | 'foulBall'
  | 'foulTip'
  | 'ball'
  | 'hitByPitch'
  | 'inPlay';

/** Shape of the batted ball trajectory. */
export type BattedBallType = 'groundBall' | 'lineDrive' | 'flyBall' | 'popUp';

/** Horizontal direction of the batted ball from the batter's box. */
export type BattedBallDirection = 'pullLine' | 'pullGap' | 'center' | 'oppoGap' | 'oppoLine';

/** Fully detailed final result of a plate appearance. */
export type PlateAppearanceResult =
  | 'strikeoutSwinging'
  | 'strikeoutLooking'
  | 'walk'
  | 'intentionalWalk'
  | 'hitByPitch'
  | 'single'
  | 'infieldSingle'
  | 'double'
  | 'triple'
  | 'homeRun'
  | 'insideTheParkHomeRun'
  | 'groundOut'
  | 'flyOut'
  | 'lineOut'
  | 'popOut'
  | 'doublePlay'
  | 'triplePlay'
  | 'sacrificeFly'
  | 'sacrificeBunt'
  | 'fieldersChoice'
  | 'reachedOnError'
  | 'catcherInterference'
  /**
   * The half-inning ended on a caught-stealing or pickoff before this
   * plate appearance was completed. The batter's count/at-bat should be
   * resumed at the start of his next plate appearance.
   */
  | 'inningEndingCaughtStealing';

/** Coarse category used for stat aggregation / display grouping. */
export type OutcomeCategory = 'hit' | 'out' | 'walk' | 'strikeout' | 'hitByPitch' | 'other';

export const OUTCOME_CATEGORY: Record<PlateAppearanceResult, OutcomeCategory> = {
  strikeoutSwinging: 'strikeout',
  strikeoutLooking: 'strikeout',
  walk: 'walk',
  intentionalWalk: 'walk',
  hitByPitch: 'hitByPitch',
  single: 'hit',
  infieldSingle: 'hit',
  double: 'hit',
  triple: 'hit',
  homeRun: 'hit',
  insideTheParkHomeRun: 'hit',
  groundOut: 'out',
  flyOut: 'out',
  lineOut: 'out',
  popOut: 'out',
  doublePlay: 'out',
  triplePlay: 'out',
  sacrificeFly: 'out',
  sacrificeBunt: 'out',
  fieldersChoice: 'out',
  reachedOnError: 'other',
  catcherInterference: 'other',
  inningEndingCaughtStealing: 'other',
};

/**
 * Number of outs the batter's own result contributes (independent of
 * any additional baserunning outs from caught-stealing/pickoffs/DPs
 * that are tracked separately in `outsOnBases`).
 */
export const BATTER_OUTS: Record<PlateAppearanceResult, number> = {
  strikeoutSwinging: 1,
  strikeoutLooking: 1,
  walk: 0,
  intentionalWalk: 0,
  hitByPitch: 0,
  single: 0,
  infieldSingle: 0,
  double: 0,
  triple: 0,
  homeRun: 0,
  insideTheParkHomeRun: 0,
  groundOut: 1,
  flyOut: 1,
  lineOut: 1,
  popOut: 1,
  doublePlay: 2,
  triplePlay: 3,
  sacrificeFly: 1,
  sacrificeBunt: 1,
  fieldersChoice: 1,
  reachedOnError: 0,
  catcherInterference: 0,
  inningEndingCaughtStealing: 0,
};

/** Detail record for a single pitch thrown during the at-bat. */
export interface PitchEvent {
  pitchNumber: number;
  pitchType: PitchType;
  zone: ZoneLocation;
  velocity: number;
  result: PitchResult;
  /** Count *before* this pitch was thrown. */
  countBefore: { balls: number; strikes: number };
}

/** Detailed physical profile of a batted ball. */
export interface BattedBallProfile {
  /** Exit velocity in km/h. */
  exitVelocity: number;
  /** Launch angle in degrees (negative = into the ground). */
  launchAngle: number;
  direction: BattedBallDirection;
  type: BattedBallType;
  /** Estimated travel distance in meters. */
  distance: number;
}

/** Full result of one plate appearance. */
export interface AtBatResult {
  pitches: PitchEvent[];
  result: PlateAppearanceResult;
  category: OutcomeCategory;
  battedBall?: BattedBallProfile;
  /** Number of bases the batter reached (0-4, 4 = home run). */
  basesReached: 0 | 1 | 2 | 3 | 4;
  /** Total runs that scored on this play, including the batter himself on a home run. */
  runsScored: number;
  /** Runner occupancy after this play resolves (does not include the batter unless he reached base). */
  finalRunners: BaseRunners;
  /** Detailed log of stolen base attempts, pickoffs, and baserunner advancement. */
  baseRunningEvents: BaseRunningEvent[];
  /**
   * Total outs recorded on this play, including the batter's own out (if
   * any) and any additional outs on the bases (caught stealing, pickoffs,
   * double/triple plays). Ranges 0-3.
   */
  outsRecorded: 0 | 1 | 2 | 3;
}
