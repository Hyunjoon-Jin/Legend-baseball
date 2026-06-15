import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playWildCardSeries, playBestOfSeries, runKboPostseason } from './postseason.js';
import type { GameOutcome, PlayGameFn } from '../types/season.js';

function outcome(winner: 'home' | 'away' | 'tie'): GameOutcome {
  if (winner === 'home') return { winner, homeRuns: 5, awayRuns: 2 };
  if (winner === 'away') return { winner, homeRuns: 2, awayRuns: 5 };
  return { winner, homeRuns: 3, awayRuns: 3 };
}

function scripted(outcomes: readonly GameOutcome[]): PlayGameFn {
  let i = 0;
  return () => {
    const result = outcomes[Math.min(i, outcomes.length - 1)];
    i++;
    return result;
  };
}

test('Wild Card: the 4th-place team advances immediately on a Game 1 win', () => {
  const series = playWildCardSeries('4th', '5th', scripted([outcome('home')]));
  assert.equal(series.games.length, 1);
  assert.equal(series.winnerId, '4th');
  assert.equal(series.games[0].homeTeamId, '4th');
  assert.equal(series.games[0].awayTeamId, '5th');
  assert.equal(series.games[0].round, 'wildCard');
});

test('Wild Card: the 4th-place team advances immediately on a Game 1 tie', () => {
  const series = playWildCardSeries('4th', '5th', scripted([outcome('tie')]));
  assert.equal(series.games.length, 1);
  assert.equal(series.winnerId, '4th');
});

test('Wild Card: if the 5th-place team wins Game 1, it must also win Game 2 to advance', () => {
  const series = playWildCardSeries('4th', '5th', scripted([outcome('away'), outcome('away')]));
  assert.equal(series.games.length, 2);
  assert.equal(series.winnerId, '5th');
});

test('Wild Card: after a Game 1 loss, a Game 2 win or tie sends the 4th-place team through', () => {
  const win = playWildCardSeries('4th', '5th', scripted([outcome('away'), outcome('home')]));
  assert.equal(win.games.length, 2);
  assert.equal(win.winnerId, '4th');

  const tie = playWildCardSeries('4th', '5th', scripted([outcome('away'), outcome('tie')]));
  assert.equal(tie.games.length, 2);
  assert.equal(tie.winnerId, '4th');
});

test('Wild Card: every game is hosted by the 4th-place team', () => {
  const series = playWildCardSeries('4th', '5th', scripted([outcome('away'), outcome('away')]));
  for (const g of series.games) {
    assert.equal(g.homeTeamId, '4th');
    assert.equal(g.awayTeamId, '5th');
    assert.equal(g.round, 'wildCard');
  }
});

test('a best-of-5 series ends in a sweep when the higher seed wins 3 straight', () => {
  const series = playBestOfSeries('semiPlayoff', 'A', 'B', 3, scripted([outcome('home'), outcome('home'), outcome('home')]));
  assert.equal(series.games.length, 3);
  assert.equal(series.winnerId, 'A');
  assert.equal(series.higherSeedId, 'A');
  assert.equal(series.lowerSeedId, 'B');
});

test('a best-of-5 series goes the full 5 games when split evenly until the decider', () => {
  const series = playBestOfSeries(
    'semiPlayoff',
    'A',
    'B',
    3,
    scripted([outcome('home'), outcome('away'), outcome('home'), outcome('away'), outcome('home')]),
  );
  assert.equal(series.games.length, 5);
  assert.equal(series.winnerId, 'A');
});

test('the lower seed can win a best-of-series', () => {
  const series = playBestOfSeries('playoff', 'A', 'B', 3, scripted([outcome('away'), outcome('away'), outcome('away')]));
  assert.equal(series.games.length, 3);
  assert.equal(series.winnerId, 'B');
});

test("tied games do not count toward either side's win total, and an extra game is played", () => {
  const series = playBestOfSeries(
    'koreanSeries',
    'A',
    'B',
    4,
    scripted([outcome('home'), outcome('home'), outcome('tie'), outcome('home'), outcome('home')]),
  );
  assert.equal(series.games.length, 5);
  assert.equal(series.winnerId, 'A');
  assert.equal(series.games[2].winner, 'tie');
});

test('the higher seed hosts every game in a best-of-series', () => {
  const series = playBestOfSeries(
    'playoff',
    'A',
    'B',
    3,
    scripted([outcome('home'), outcome('away'), outcome('home'), outcome('away'), outcome('home')]),
  );
  for (const g of series.games) {
    assert.equal(g.homeTeamId, 'A');
    assert.equal(g.awayTeamId, 'B');
  }
});

test('runKboPostseason chains the Wild Card through the Korean Series with correct seeding', () => {
  const seeds = ['1st', '2nd', '3rd', '4th', '5th'];

  // 5th upsets its way through the Wild Card, then loses every subsequent
  // series; the higher seed wins every other game in the bracket.
  const playGame: PlayGameFn = (homeTeamId) => (homeTeamId === '4th' ? outcome('away') : outcome('home'));

  const result = runKboPostseason(seeds, playGame);
  assert.equal(result.series.length, 4);

  const [wildCard, semiPlayoff, playoff, koreanSeries] = result.series;

  assert.equal(wildCard.round, 'wildCard');
  assert.equal(wildCard.higherSeedId, '4th');
  assert.equal(wildCard.lowerSeedId, '5th');
  assert.equal(wildCard.winnerId, '5th');

  assert.equal(semiPlayoff.round, 'semiPlayoff');
  assert.equal(semiPlayoff.higherSeedId, '3rd');
  assert.equal(semiPlayoff.lowerSeedId, '5th');
  assert.equal(semiPlayoff.winnerId, '3rd');

  assert.equal(playoff.round, 'playoff');
  assert.equal(playoff.higherSeedId, '2nd');
  assert.equal(playoff.lowerSeedId, '3rd');
  assert.equal(playoff.winnerId, '2nd');

  assert.equal(koreanSeries.round, 'koreanSeries');
  assert.equal(koreanSeries.higherSeedId, '1st');
  assert.equal(koreanSeries.lowerSeedId, '2nd');
  assert.equal(koreanSeries.winnerId, '1st');

  assert.equal(result.championId, '1st');
});

test('runKboPostseason throws with fewer than 5 seeds', () => {
  assert.throws(() => runKboPostseason(['1st', '2nd', '3rd', '4th'], scripted([outcome('home')])));
});
