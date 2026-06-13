import type { BatterAttributes } from './player.js';
import type { AtBatResult } from './outcome.js';

/** A team's batting order, in lineup order (typically 9 batters). */
export type Lineup = readonly BatterAttributes[];

/** One plate appearance within a half-inning, with lineup/game context. */
export interface InningPlateAppearance {
  /** Index into the lineup (0-based) of the batter who came to the plate. */
  lineupIndex: number;
  batter: BatterAttributes;
  atBat: AtBatResult;
  /** Total outs in the half-inning immediately after this play (0-3). */
  outsAfter: 0 | 1 | 2 | 3;
  /** Cumulative runs scored in this half-inning through this play. */
  runsAfter: number;
  /** Score differential from the batting team's perspective after this play. */
  scoreDiffAfter: number;
}

/** Full result of simulating a single half-inning (top or bottom). */
export interface HalfInningResult {
  inning: number;
  half: 'top' | 'bottom';
  plateAppearances: InningPlateAppearance[];
  runsScored: number;
  hits: number;
  walks: number;
  strikeouts: number;
  /** Runners left on base when the half-inning ended. */
  leftOnBase: 0 | 1 | 2 | 3;
  /** Pitches thrown by the defending pitcher during this half-inning. */
  pitchesThrown: number;
  /** Lineup index this team's next half-inning at bat should start from. */
  nextBatterIndex: number;
  /** Defending pitcher's cumulative pitch count after this half-inning. */
  pitcherPitchCount: number;
  /** True if the half-inning ended before 3 outs (walk-off win). */
  endedByWalkOff: boolean;
}

/** Final result of simulating a full game (regulation + any extra innings). */
export interface GameResult {
  halfInnings: HalfInningResult[];
  /** Runs scored by each team per inning. */
  lineScore: { away: number[]; home: number[] };
  finalScore: { away: number; home: number };
  /** Number of innings completed (by the away team's at-bats). */
  totalInnings: number;
  winner: 'away' | 'home' | 'tie';
}
