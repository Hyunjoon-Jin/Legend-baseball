import type { PlayGameFn, PostseasonGame, PostseasonResult, PostseasonRoundName, PostseasonSeries } from '../types/season.js';

const SEMI_PLAYOFF_WINS = 3;
const PLAYOFF_WINS = 3;
const KOREAN_SERIES_WINS = 4;

/** Safety cap on games played in a best-of-series, guarding against runaway tie-replay loops. */
const MAX_GAMES_PER_SERIES = 20;

function playGameAndRecord(
  round: PostseasonRoundName,
  gameNumber: number,
  homeTeamId: string,
  awayTeamId: string,
  playGame: PlayGameFn,
): PostseasonGame {
  return { round, gameNumber, homeTeamId, awayTeamId, ...playGame(homeTeamId, awayTeamId) };
}

/**
 * Plays the Wild Card round: the 4th-place team hosts a best-of-2 series
 * against the 5th-place team, with the 4th-place team's KBO advantage built
 * in. The 4th-place team advances immediately if it wins or ties Game 1.
 * Otherwise, Game 2 is sudden-death for the 5th-place team — it must win
 * outright to advance, while a tie or a 4th-place win sends the 4th-place
 * team through instead.
 */
export function playWildCardSeries(fourthSeedId: string, fifthSeedId: string, playGame: PlayGameFn): PostseasonSeries {
  const games: PostseasonGame[] = [];

  const game1 = playGameAndRecord('wildCard', 1, fourthSeedId, fifthSeedId, playGame);
  games.push(game1);
  if (game1.winner !== 'away') {
    return { round: 'wildCard', higherSeedId: fourthSeedId, lowerSeedId: fifthSeedId, games, winnerId: fourthSeedId };
  }

  const game2 = playGameAndRecord('wildCard', 2, fourthSeedId, fifthSeedId, playGame);
  games.push(game2);
  const winnerId = game2.winner === 'away' ? fifthSeedId : fourthSeedId;
  return { round: 'wildCard', higherSeedId: fourthSeedId, lowerSeedId: fifthSeedId, games, winnerId };
}

/**
 * Plays a best-of-series where the higher seed hosts every game, as in the
 * Semi-Playoff, Playoff, and Korean Series. Tied games don't count toward
 * either side's win total, so the series simply continues with another game.
 */
export function playBestOfSeries(
  round: PostseasonRoundName,
  higherSeedId: string,
  lowerSeedId: string,
  winsNeeded: number,
  playGame: PlayGameFn,
): PostseasonSeries {
  const games: PostseasonGame[] = [];
  let higherWins = 0;
  let lowerWins = 0;

  while (higherWins < winsNeeded && lowerWins < winsNeeded) {
    if (games.length >= MAX_GAMES_PER_SERIES) {
      throw new Error(`${round} series did not resolve within ${MAX_GAMES_PER_SERIES} games`);
    }
    const game = playGameAndRecord(round, games.length + 1, higherSeedId, lowerSeedId, playGame);
    games.push(game);
    if (game.winner === 'home') higherWins++;
    else if (game.winner === 'away') lowerWins++;
  }

  const winnerId = higherWins >= winsNeeded ? higherSeedId : lowerSeedId;
  return { round, higherSeedId, lowerSeedId, games, winnerId };
}

/**
 * Runs the full KBO postseason bracket from regular-season seeds (1st
 * through 5th place; lower seeds are accepted but unused). The Wild Card
 * winner faces the 3rd seed in the Semi-Playoff, that winner faces the 2nd
 * seed in the Playoff, and that winner faces the 1st seed in the Korean
 * Series. Every round is hosted entirely by the higher seed.
 */
export function runKboPostseason(seeds: readonly string[], playGame: PlayGameFn): PostseasonResult {
  if (seeds.length < 5) {
    throw new Error('runKboPostseason requires at least 5 seeds (1st through 5th place)');
  }
  const [first, second, third, fourth, fifth] = seeds;

  const wildCard = playWildCardSeries(fourth, fifth, playGame);
  const semiPlayoff = playBestOfSeries('semiPlayoff', third, wildCard.winnerId, SEMI_PLAYOFF_WINS, playGame);
  const playoff = playBestOfSeries('playoff', second, semiPlayoff.winnerId, PLAYOFF_WINS, playGame);
  const koreanSeries = playBestOfSeries('koreanSeries', first, playoff.winnerId, KOREAN_SERIES_WINS, playGame);

  return {
    series: [wildCard, semiPlayoff, playoff, koreanSeries],
    championId: koreanSeries.winnerId,
  };
}
