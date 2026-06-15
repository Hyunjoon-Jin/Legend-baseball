// Type-only re-exports of the simulation engine's result shapes (see
// ../../../src/types and ../../../src/season). The simulation now runs
// directly in the browser (see ./client.ts), so the frontend depends on the
// engine's TS sources directly instead of duplicating these shapes.

import type { GameResult, HalfInningResult, SubstitutionType } from '../../../src/types/game.js';
import type { PlateAppearanceResult } from '../../../src/types/outcome.js';
import type { LeagueTeam, PostseasonResult, PostseasonRoundName, StandingsRow } from '../../../src/types/season.js';
import type { WeatherConditions } from '../../../src/types/situation.js';
import type { BattingLeaders, LeaderEntry, PitchingLeaders } from '../../../src/season/leaderboards.js';

export type {
  GameResult,
  HalfInningResult,
  SubstitutionType,
  PlateAppearanceResult,
  PostseasonRoundName,
  WeatherConditions,
  LeaderEntry,
  BattingLeaders,
  PitchingLeaders,
};

export interface LeagueResponse {
  teams: LeagueTeam[];
  teamNames: string[];
  defaultStrengths: number[];
}

export interface SeasonResponse {
  standings: StandingsRow[];
  postseason: PostseasonResult;
  battingLeaders: BattingLeaders;
  pitchingLeaders: PitchingLeaders;
}
