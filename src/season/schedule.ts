import type { ScheduledGame, ScheduledSeries } from '../types/season.js';

const GAMES_PER_SERIES = 4;
const CYCLES = 4;

/**
 * Generates a KBO-style regular-season schedule: every team plays every
 * other team `GAMES_PER_SERIES * CYCLES` times (16, for the 10-team/144-game
 * format), split into `CYCLES` four-game series that alternate which side
 * hosts so each matchup ends up evenly split home/away.
 *
 * Built from `CYCLES` repetitions of a standard circle-method round robin:
 * within each cycle, `teamIds.length - 1` rounds each pair up every team
 * with a distinct opponent (no idle teams, since the league size is even).
 * The same pairing recurs once per cycle; host assignment alternates by
 * cycle so each side ends up hosting half of the cycles' series.
 */
export function generateRegularSeasonSeries(teamIds: readonly string[]): ScheduledSeries[] {
  const n = teamIds.length;
  if (n < 2 || n % 2 !== 0) {
    throw new Error('generateRegularSeasonSeries requires an even number of teams');
  }

  const series: ScheduledSeries[] = [];
  let seriesIndex = 0;

  for (let cycle = 0; cycle < CYCLES; cycle++) {
    let order = [...teamIds];
    for (let round = 0; round < n - 1; round++) {
      for (let i = 0; i < n / 2; i++) {
        const a = order[i];
        const b = order[n - 1 - i];
        const [homeTeamId, awayTeamId] = cycle % 2 === 0 ? [a, b] : [b, a];
        series.push({ seriesIndex: seriesIndex++, homeTeamId, awayTeamId, gameCount: GAMES_PER_SERIES });
      }
      // Standard circle-method rotation: keep order[0] fixed, cycle the rest.
      order = [order[0], order[n - 1], ...order.slice(1, n - 1)];
    }
  }

  return series;
}

/** Expands a series schedule into individual games, in series order. */
export function expandToGames(series: readonly ScheduledSeries[]): ScheduledGame[] {
  const games: ScheduledGame[] = [];
  for (const s of series) {
    for (let gameNumber = 1; gameNumber <= s.gameCount; gameNumber++) {
      games.push({ seriesIndex: s.seriesIndex, gameNumber, homeTeamId: s.homeTeamId, awayTeamId: s.awayTeamId });
    }
  }
  return games;
}

/** Total regular-season games per team for a league of this size (144 for 10 teams). */
export function gamesPerTeam(teamCount: number): number {
  return (teamCount - 1) * GAMES_PER_SERIES * CYCLES;
}
