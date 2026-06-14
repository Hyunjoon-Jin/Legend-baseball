import type { PlayedGame, StandingsRow } from '../types/season.js';

function safeDiv(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

function headToHeadWinPct(teamId: string, opponentId: string, games: readonly PlayedGame[]): number {
  let wins = 0;
  let losses = 0;
  for (const g of games) {
    if (g.homeTeamId === teamId && g.awayTeamId === opponentId) {
      if (g.winner === 'home') wins++;
      else if (g.winner === 'away') losses++;
    } else if (g.awayTeamId === teamId && g.homeTeamId === opponentId) {
      if (g.winner === 'away') wins++;
      else if (g.winner === 'home') losses++;
    }
  }
  return safeDiv(wins, wins + losses);
}

/**
 * Ranks teams by winning percentage (ties are recorded but excluded from
 * the win% denominator, as in KBO). A win% tie is broken by head-to-head
 * record, then by run differential, then by team id for full determinism.
 * `gamesBehind` is computed relative to the leader using the standard
 * `((leaderW - W) + (L - leaderL)) / 2` formula.
 */
export function computeStandings(teamIds: readonly string[], games: readonly PlayedGame[]): StandingsRow[] {
  const rows = new Map<string, StandingsRow>();
  for (const teamId of teamIds) {
    rows.set(teamId, { teamId, wins: 0, losses: 0, ties: 0, runsScored: 0, runsAllowed: 0, winPct: 0, gamesBehind: 0 });
  }

  for (const g of games) {
    const home = rows.get(g.homeTeamId);
    const away = rows.get(g.awayTeamId);
    if (!home || !away) continue;

    home.runsScored += g.homeRuns;
    home.runsAllowed += g.awayRuns;
    away.runsScored += g.awayRuns;
    away.runsAllowed += g.homeRuns;

    if (g.winner === 'home') {
      home.wins++;
      away.losses++;
    } else if (g.winner === 'away') {
      away.wins++;
      home.losses++;
    } else {
      home.ties++;
      away.ties++;
    }
  }

  for (const row of rows.values()) {
    row.winPct = safeDiv(row.wins, row.wins + row.losses);
  }

  const sorted = [...rows.values()].sort((a, b) => {
    if (a.winPct !== b.winPct) return b.winPct - a.winPct;

    const aH2H = headToHeadWinPct(a.teamId, b.teamId, games);
    const bH2H = headToHeadWinPct(b.teamId, a.teamId, games);
    if (aH2H !== bH2H) return bH2H - aH2H;

    const aDiff = a.runsScored - a.runsAllowed;
    const bDiff = b.runsScored - b.runsAllowed;
    if (aDiff !== bDiff) return bDiff - aDiff;

    return a.teamId.localeCompare(b.teamId);
  });

  const leader = sorted[0];
  for (const row of sorted) {
    row.gamesBehind = (leader.wins - row.wins + (row.losses - leader.losses)) / 2;
  }

  return sorted;
}
