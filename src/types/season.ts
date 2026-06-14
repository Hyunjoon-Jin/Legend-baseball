import type { TeamSetup } from '../engine/gameEngine.js';
import type { PitcherAttributes } from './player.js';

/** A team competing in the league, identified by a stable id for scheduling/standings. */
export interface LeagueTeam {
  id: string;
  setup: TeamSetup;
  /** Starting rotation (5 pitchers), used in turn for each of this team's games. */
  rotation: readonly PitcherAttributes[];
}

/** A group of consecutive games between the same two teams at the same site. */
export interface ScheduledSeries {
  seriesIndex: number;
  homeTeamId: string;
  awayTeamId: string;
  gameCount: number;
}

/** One game on the regular-season schedule, before it's been played. */
export interface ScheduledGame {
  seriesIndex: number;
  gameNumber: number;
  homeTeamId: string;
  awayTeamId: string;
}

/** The outcome of one played game. */
export interface GameOutcome {
  winner: 'home' | 'away' | 'tie';
  homeRuns: number;
  awayRuns: number;
}

/** A played regular-season game, with the teams involved. */
export interface PlayedGame extends GameOutcome {
  homeTeamId: string;
  awayTeamId: string;
}

/** A team's position in the standings table. */
export interface StandingsRow {
  teamId: string;
  wins: number;
  losses: number;
  ties: number;
  runsScored: number;
  runsAllowed: number;
  winPct: number;
  gamesBehind: number;
}

export type PostseasonRoundName = 'wildCard' | 'semiPlayoff' | 'playoff' | 'koreanSeries';

/** A played postseason game, tagged with its round and position in the series. */
export interface PostseasonGame extends GameOutcome {
  round: PostseasonRoundName;
  gameNumber: number;
  homeTeamId: string;
  awayTeamId: string;
}

/** The result of one postseason series (Wild Card / Semi-PO / PO / Korean Series). */
export interface PostseasonSeries {
  round: PostseasonRoundName;
  higherSeedId: string;
  lowerSeedId: string;
  games: PostseasonGame[];
  winnerId: string;
}

export interface PostseasonResult {
  series: PostseasonSeries[];
  championId: string;
}

/** Simulates one postseason game; `homeTeamId` is always the higher seed. */
export type PlayGameFn = (homeTeamId: string, awayTeamId: string) => GameOutcome;
