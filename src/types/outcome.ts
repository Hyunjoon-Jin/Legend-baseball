import type { PitchType } from './player.js';
import type { ZoneLocation } from './zone.js';

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
  | 'catcherInterference';

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
  /** Runs scored on this play (not counting the batter, unless inside-the-park HR etc). */
  runsScoredEstimate: number;
}
