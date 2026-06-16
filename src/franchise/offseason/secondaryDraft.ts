import type { PlayerProfile } from '../../types/roster.js';
import type { TeamFranchiseState } from '../types.js';
import type { KboSeasonResult } from '../../season/leagueSim.js';
import { playerValue } from '../trade/evaluation.js';
import { SECONDARY_DRAFT_PROTECTED_SIZE, TOTAL_SQUAD_SIZE } from '../../roster/constants.js';

const SECONDARY_DRAFT_ROUNDS = 2;

/** A single secondary-draft pick result. */
export interface SecondaryDraftPick {
  round: number;
  teamId: string;
  fromTeamId: string;
  playerId: string;
  playerName: string;
}

/** Reverse-standings draft order (worst team picks first). Random order if no prior season. */
function draftOrder(teams: readonly TeamFranchiseState[], lastSeasonResult: KboSeasonResult | undefined): string[] {
  if (!lastSeasonResult) return teams.map((t) => t.teamId);
  return [...lastSeasonResult.standings]
    .sort((a, b) => a.winPct - b.winPct)
    .map((row) => row.teamId);
}

/**
 * Runs the secondary draft (2차 드래프트):
 * 1. Each team protects its top `SECONDARY_DRAFT_PROTECTED_SIZE` players by
 *    `playerValue`. The rest are exposed.
 * 2. Teams pick in reverse-standings order for `SECONDARY_DRAFT_ROUNDS` rounds
 *    (1 pick per team per round).
 * 3. Picked players join the selecting team at `rosterStatus: '2군'` with
 *    `origin: 'secondaryDraft'`. A team cannot pick from its own exposed pool.
 * 4. Picking respects `TOTAL_SQUAD_SIZE` — full teams skip their pick.
 */
export function runSecondaryDraft(
  teams: readonly TeamFranchiseState[],
  lastSeasonResult: KboSeasonResult | undefined,
  _rng: () => number,
): { teams: TeamFranchiseState[]; picks: SecondaryDraftPick[] } {
  const rosters = new Map(teams.map((t) => [t.teamId, [...t.roster]]));

  // Build the exposed pool from each team's unprotected players.
  const exposed: Array<{ player: PlayerProfile; fromTeamId: string }> = [];
  for (const team of teams) {
    const sorted = [...team.roster].sort((a, b) => playerValue(b) - playerValue(a));
    const protectedIds = new Set(
      sorted.slice(0, SECONDARY_DRAFT_PROTECTED_SIZE).map((p) => p.playerId),
    );
    for (const p of team.roster) {
      if (!protectedIds.has(p.playerId)) {
        exposed.push({ player: p, fromTeamId: team.teamId });
      }
    }
  }

  const picks: SecondaryDraftPick[] = [];
  const selectedIds = new Set<string>();
  const order = draftOrder(teams, lastSeasonResult);

  for (let round = 1; round <= SECONDARY_DRAFT_ROUNDS; round++) {
    for (const teamId of order) {
      const candidates = exposed.filter(
        (e) => e.fromTeamId !== teamId && !selectedIds.has(e.player.playerId),
      );
      if (candidates.length === 0) break;

      const newRoster = rosters.get(teamId)!;
      if (newRoster.length >= TOTAL_SQUAD_SIZE) continue;

      const best = candidates.reduce((a, b) =>
        playerValue(b.player) > playerValue(a.player) ? b : a,
      );

      selectedIds.add(best.player.playerId);

      // Remove from original team's mutable roster.
      const oldRoster = rosters.get(best.fromTeamId)!;
      const idx = oldRoster.findIndex((p) => p.playerId === best.player.playerId);
      if (idx !== -1) oldRoster.splice(idx, 1);

      newRoster.push({ ...best.player, origin: 'secondaryDraft', rosterStatus: '2군' as const });

      picks.push({
        round,
        teamId,
        fromTeamId: best.fromTeamId,
        playerId: best.player.playerId,
        playerName: best.player.attributes.name,
      });
    }
  }

  const updatedTeams = teams.map((t) => ({ ...t, roster: rosters.get(t.teamId)! }));
  return { teams: updatedTeams, picks };
}
