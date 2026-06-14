// Runs the simulation engine directly in the browser (no backend server
// required). Results are passed through a JSON round-trip so callers
// receive the same plain, JSON-serializable shapes the engine's types
// describe.
import { generateSampleLeague, TEAM_NAMES, TEAM_STRENGTH } from '../../../src/data/sampleLeague.js';
import { simulateGame, type GameOptions } from '../../../src/engine/gameEngine.js';
import { simulateKboSeason } from '../../../src/season/leagueSim.js';
import { computeBattingLeaders, computePitchingLeaders } from '../../../src/season/leaderboards.js';
import type { LeagueTeam } from '../../../src/types/season.js';
import type { WeatherConditions } from '../../../src/types/situation.js';
import type { GameResult, LeagueResponse, SeasonResponse } from './types';

function mulberry32(seed: number) {
  return function rng() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function toJson<T>(value: unknown): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Generates a 10-team league, optionally with custom per-team strength multipliers. */
export async function fetchLeague(seed: number, teamStrengths?: number[]): Promise<LeagueResponse> {
  const teams = generateSampleLeague(mulberry32(seed), teamStrengths);
  return toJson({ teams, teamNames: TEAM_NAMES, defaultStrengths: TEAM_STRENGTH });
}

/** Simulates a single game between two teams from a previously generated league. */
export async function fetchGame(
  league: LeagueTeam[],
  homeTeamId: string,
  awayTeamId: string,
  seed: number,
  weather?: WeatherConditions,
): Promise<GameResult> {
  const home = league.find((t) => t.id === homeTeamId);
  const away = league.find((t) => t.id === awayTeamId);
  if (!home || !away) {
    throw new Error('존재하지 않는 팀 id입니다.');
  }

  const options: GameOptions = weather ? { weather } : {};
  const result = simulateGame(away.setup, home.setup, options, mulberry32(seed));
  return toJson(result);
}

/** Simulates a full 144-game KBO-style season + postseason for a previously generated league. */
export async function fetchSeason(league: LeagueTeam[], seed: number): Promise<SeasonResponse> {
  const result = simulateKboSeason(league, {}, mulberry32(seed));
  return toJson({
    standings: result.standings,
    postseason: result.postseason,
    battingLeaders: computeBattingLeaders(result.battingStats, result.playerNames),
    pitchingLeaders: computePitchingLeaders(result.pitchingStats, result.playerNames),
  });
}

/** Generates a random 32-bit seed for the deterministic simulation RNG. */
export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}
