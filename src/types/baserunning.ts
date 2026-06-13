export type BaseName = 'first' | 'second' | 'third';

/**
 * A runner currently occupying a base. Carries the subset of the
 * batter's attributes relevant to baserunning decisions.
 */
export interface RunnerOnBase {
  runnerId: string;
  /** Sprint speed, 0-100. */
  speed: number;
  /** Pure stolen-base skill (jump, slide, technique), 0-100. */
  stealRating: number;
  /** Baserunning IQ / aggressiveness on extra-base advancement decisions, 0-100. */
  baserunningAggressiveness: number;
}

/** Occupancy of first/second/third base, each either empty or a runner. */
export interface BaseRunners {
  first?: RunnerOnBase;
  second?: RunnerOnBase;
  third?: RunnerOnBase;
}

/**
 * Defensive ratings of the fielding team, used for baserunning and
 * error-rate calculations.
 */
export interface DefensiveTeamRatings {
  /** Catcher's arm strength/accuracy for throwing out base stealers, 0-100. */
  catcherArm: number;
  /** Infield range/sure-handedness, affects double plays and errors, 0-100. */
  infieldDefense: number;
  /** Outfield range, affects extra-base hits, 0-100. */
  outfieldDefense: number;
  /** Outfield arm strength, suppresses extra-base advancement, 0-100. */
  outfieldArm: number;
}

export const defaultDefense: DefensiveTeamRatings = {
  catcherArm: 50,
  infieldDefense: 50,
  outfieldDefense: 50,
  outfieldArm: 50,
};

/** A single baserunning event during a play, for detailed play-by-play logs. */
export type BaseRunningEventType =
  | 'stolenBaseAttempt'
  | 'stolenBaseSuccess'
  | 'caughtStealing'
  | 'pickoff'
  | 'runnerAdvance'
  | 'runnerHeld'
  | 'runnerScored'
  | 'runnerOutOnBases';

export interface BaseRunningEvent {
  type: BaseRunningEventType;
  runnerId: string;
  from?: BaseName | 'home';
  to?: BaseName | 'home';
  /** Pitch number (1-indexed) on which this event occurred, if applicable. */
  pitchNumber?: number;
}

/** Result of resolving baserunning for a completed play. */
export interface BaseRunningResult {
  finalRunners: BaseRunners;
  /** Runs scored by existing runners (does NOT include the batter). */
  runsScored: number;
  /** Additional outs recorded on the bases (beyond the batter's own out, if any). */
  outsOnBases: number;
  events: BaseRunningEvent[];
}
