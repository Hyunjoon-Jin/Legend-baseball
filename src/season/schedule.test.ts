import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateRegularSeasonSeries, expandToGames, gamesPerTeam } from './schedule.js';

const TEAM_IDS = Array.from({ length: 10 }, (_, i) => `T${i + 1}`);

test('every team plays exactly 144 games, 16 against each opponent (8 home / 8 away)', () => {
  const series = generateRegularSeasonSeries(TEAM_IDS);
  const games = expandToGames(series);

  for (const teamId of TEAM_IDS) {
    const teamGames = games.filter((g) => g.homeTeamId === teamId || g.awayTeamId === teamId);
    assert.equal(teamGames.length, gamesPerTeam(TEAM_IDS.length));
    assert.equal(teamGames.length, 144);

    for (const opponentId of TEAM_IDS) {
      if (opponentId === teamId) continue;
      const home = teamGames.filter((g) => g.homeTeamId === teamId && g.awayTeamId === opponentId).length;
      const away = teamGames.filter((g) => g.awayTeamId === teamId && g.homeTeamId === opponentId).length;
      assert.equal(home, 8, `${teamId} home games vs ${opponentId}`);
      assert.equal(away, 8, `${teamId} away games vs ${opponentId}`);
    }
  }
});

test('no team is ever scheduled against itself', () => {
  const series = generateRegularSeasonSeries(TEAM_IDS);
  for (const s of series) {
    assert.notEqual(s.homeTeamId, s.awayTeamId);
  }
});

test('each round pairs up every team with no idle teams', () => {
  const series = generateRegularSeasonSeries(TEAM_IDS);
  const roundsTotal = 4 * (TEAM_IDS.length - 1); // CYCLES * (n - 1)
  const seriesPerRound = TEAM_IDS.length / 2;
  assert.equal(series.length, roundsTotal * seriesPerRound);

  for (let round = 0; round < roundsTotal; round++) {
    const roundSeries = series.slice(round * seriesPerRound, (round + 1) * seriesPerRound);
    const teamsInRound = roundSeries.flatMap((s) => [s.homeTeamId, s.awayTeamId]);
    assert.equal(new Set(teamsInRound).size, TEAM_IDS.length);
  }
});

test('throws for an odd number of teams', () => {
  assert.throws(() => generateRegularSeasonSeries(['A', 'B', 'C']));
});

test('expandToGames produces 720 total games for a 10-team league', () => {
  const series = generateRegularSeasonSeries(TEAM_IDS);
  const games = expandToGames(series);
  assert.equal(games.length, 720);
  for (const s of series) {
    assert.equal(games.filter((g) => g.seriesIndex === s.seriesIndex).length, s.gameCount);
  }
});
