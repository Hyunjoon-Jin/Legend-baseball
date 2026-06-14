import { simulateGame, type GameOptions } from '../engine/gameEngine.js';
import { generateRegularSeasonSeries, expandToGames } from './schedule.js';
import { computeStandings } from './standings.js';
import { runKboPostseason } from './postseason.js';
import type { LeagueTeam, PlayedGame, PostseasonResult, StandingsRow } from '../types/season.js';

/** Postseason games get extra innings to work with before settling for a tie (regular season uses the 12-inning default). */
const POSTSEASON_MAX_INNINGS = 15;

export interface KboSeasonResult {
  games: PlayedGame[];
  standings: StandingsRow[];
  postseason: PostseasonResult;
}

/**
 * Simulates a full KBO-style season for the given teams: a 144-game
 * round-robin regular season (16 games per opponent, 8 home/8 away),
 * followed by the Wild Card / Semi-Playoff / Playoff / Korean Series
 * bracket seeded by the resulting standings (top 5 teams).
 */
export function simulateKboSeason(teams: readonly LeagueTeam[], options: GameOptions, rng: () => number): KboSeasonResult {
  const teamsById = new Map(teams.map((t) => [t.id, t]));
  const teamIds = teams.map((t) => t.id);

  const scheduledGames = expandToGames(generateRegularSeasonSeries(teamIds));

  const games: PlayedGame[] = [];
  for (const scheduled of scheduledGames) {
    const home = teamsById.get(scheduled.homeTeamId)!;
    const away = teamsById.get(scheduled.awayTeamId)!;
    const result = simulateGame(away.setup, home.setup, options, rng);
    games.push({
      homeTeamId: scheduled.homeTeamId,
      awayTeamId: scheduled.awayTeamId,
      winner: result.winner,
      homeRuns: result.finalScore.home,
      awayRuns: result.finalScore.away,
    });
  }

  const standings = computeStandings(teamIds, games);
  const seeds = standings.slice(0, 5).map((row) => row.teamId);

  const postseasonOptions: GameOptions = { ...options, maxInnings: POSTSEASON_MAX_INNINGS };
  const postseason = runKboPostseason(seeds, (homeTeamId, awayTeamId) => {
    const home = teamsById.get(homeTeamId)!;
    const away = teamsById.get(awayTeamId)!;
    const result = simulateGame(away.setup, home.setup, postseasonOptions, rng);
    return { winner: result.winner, homeRuns: result.finalScore.home, awayRuns: result.finalScore.away };
  });

  return { games, standings, postseason };
}
