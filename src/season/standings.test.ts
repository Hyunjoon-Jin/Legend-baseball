import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStandings } from './standings.js';
import type { PlayedGame } from '../types/season.js';

function game(homeTeamId: string, awayTeamId: string, winner: 'home' | 'away' | 'tie', homeRuns: number, awayRuns: number): PlayedGame {
  return { homeTeamId, awayTeamId, winner, homeRuns, awayRuns };
}

test('wins, losses, ties, and winPct are tallied correctly (ties excluded from winPct)', () => {
  const games: PlayedGame[] = [
    game('A', 'B', 'home', 5, 2),
    game('B', 'A', 'away', 1, 3),
    game('A', 'B', 'tie', 2, 2),
  ];
  const standings = computeStandings(['A', 'B'], games);
  const a = standings.find((s) => s.teamId === 'A')!;
  const b = standings.find((s) => s.teamId === 'B')!;

  assert.equal(a.wins, 2);
  assert.equal(a.losses, 0);
  assert.equal(a.ties, 1);
  assert.equal(a.winPct, 1);

  assert.equal(b.wins, 0);
  assert.equal(b.losses, 2);
  assert.equal(b.ties, 1);
  assert.equal(b.winPct, 0);

  assert.equal(a.runsScored, 5 + 3 + 2);
  assert.equal(a.runsAllowed, 2 + 1 + 2);
});

test('teams are ranked by winning percentage, with games behind computed relative to the leader', () => {
  const games: PlayedGame[] = [];
  for (let i = 0; i < 3; i++) games.push(game('A', 'C', 'home', 4, 1));
  games.push(game('A', 'C', 'away', 1, 4));
  for (let i = 0; i < 2; i++) games.push(game('B', 'C', 'home', 3, 2));
  for (let i = 0; i < 2; i++) games.push(game('B', 'C', 'away', 2, 3));

  const standings = computeStandings(['A', 'B', 'C'], games);
  assert.equal(standings[0].teamId, 'A');
  assert.equal(standings[0].wins, 3);
  assert.equal(standings[0].losses, 1);
  assert.equal(standings[0].gamesBehind, 0);
  assert.ok(standings[1].gamesBehind > 0);
});

test('a winning percentage tie is broken by head-to-head record', () => {
  const games: PlayedGame[] = [
    // A and B both go 1-1 against C, so their win% is equal.
    game('A', 'C', 'home', 3, 1),
    game('C', 'A', 'home', 3, 1),
    game('B', 'C', 'home', 3, 1),
    game('C', 'B', 'home', 3, 1),
    // Head-to-head: A beat B twice.
    game('A', 'B', 'home', 5, 1),
    game('B', 'A', 'home', 1, 5),
  ];

  const standings = computeStandings(['A', 'B', 'C'], games);
  const a = standings.find((s) => s.teamId === 'A')!;
  const b = standings.find((s) => s.teamId === 'B')!;
  assert.equal(a.winPct, b.winPct);
  assert.ok(standings.indexOf(a) < standings.indexOf(b));
});

test('a winning percentage and head-to-head tie is broken by run differential', () => {
  const games: PlayedGame[] = [
    // A: 2-2, with big blowout wins and narrow losses (run diff +16).
    game('A', 'C', 'home', 10, 1),
    game('A', 'D', 'home', 10, 1),
    game('C', 'A', 'home', 10, 9),
    game('D', 'A', 'home', 10, 9),
    // B: 2-2, with narrow wins and big blowout losses (run diff -16).
    game('B', 'C', 'home', 2, 1),
    game('B', 'D', 'home', 2, 1),
    game('C', 'B', 'home', 10, 1),
    game('D', 'B', 'home', 10, 1),
  ];

  const standings = computeStandings(['A', 'B', 'C', 'D'], games);
  const a = standings.find((s) => s.teamId === 'A')!;
  const b = standings.find((s) => s.teamId === 'B')!;
  assert.equal(a.winPct, b.winPct);
  assert.ok(a.runsScored - a.runsAllowed > b.runsScored - b.runsAllowed);
  assert.ok(standings.indexOf(a) < standings.indexOf(b));
});
