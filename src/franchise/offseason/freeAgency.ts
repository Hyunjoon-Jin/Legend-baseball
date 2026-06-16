import type { PlayerProfile } from '../../types/roster.js';
import type { TeamFranchiseState } from '../types.js';
import { overallRating } from '../../roster/rating.js';
import { playerValue } from '../trade/evaluation.js';
import { FA_ELIGIBILITY_YEARS, TOTAL_SQUAD_SIZE } from '../../roster/constants.js';

/** Maximum FA signings a single team may make per offseason (KBO teams rarely sign more than 3). */
const MAX_FA_SIGNINGS_PER_TEAM = 3;

/** Decrements each player's contract by one year (minimum 0). */
export function decrementContracts(roster: readonly PlayerProfile[]): PlayerProfile[] {
  return roster.map((p) => ({
    ...p,
    contract: { ...p.contract, yearsRemaining: Math.max(0, p.contract.yearsRemaining - 1) },
  }));
}

/**
 * Every domestic player whose contract has expired and who has 8+ years of
 * service time declares FA automatically (KBO rule: eligibility is earned,
 * not rolled). They are removed from their team's roster and returned as
 * `newFreeAgents` with `faEligible: true`.
 */
export function processFADeclarations(
  teams: readonly TeamFranchiseState[],
): { teams: TeamFranchiseState[]; newFreeAgents: PlayerProfile[] } {
  const newFreeAgents: PlayerProfile[] = [];

  const updatedTeams = teams.map((team) => {
    const remaining: PlayerProfile[] = [];
    for (const p of team.roster) {
      const eligible =
        p.origin === 'domestic' &&
        p.contract.yearsRemaining <= 0 &&
        p.serviceTimeYears >= FA_ELIGIBILITY_YEARS;

      if (eligible) {
        newFreeAgents.push({ ...p, contract: { ...p.contract, faEligible: true } });
      } else {
        remaining.push(p);
      }
    }
    return { ...team, roster: remaining };
  });

  return { teams: updatedTeams, newFreeAgents };
}

/**
 * Returns the FA contract length appropriate for a player's overall rating.
 * Stars earn longer guaranteed years; below-average players sign short deals.
 */
function faContractYears(overall: number, rng: () => number): number {
  if (overall >= 75) return 3 + Math.floor(rng() * 3); // 3-5 years (star)
  if (overall >= 65) return 2 + Math.floor(rng() * 3); // 2-4 years (solid)
  if (overall >= 55) return 1 + Math.floor(rng() * 3); // 1-3 years (average)
  return 1 + Math.floor(rng() * 2);                    // 1-2 years (fringe)
}

/**
 * Distributes free agents across teams using a need-based greedy auction:
 * - FAs are processed in descending `playerValue` order.
 * - Each FA signs with the team that has the fewest players at the FA's
 *   position (batters) or the fewest total pitchers (pitchers), provided
 *   the team has room under `TOTAL_SQUAD_SIZE` and hasn't hit the per-team cap.
 * - If no team can accept the player, they remain unsigned.
 * - Contract length scales with player quality (stars get 3-5 years,
 *   fringe players get 1-2 years). Salary scales with overall rating.
 */
export function runDomesticFAMarket(
  teams: readonly TeamFranchiseState[],
  freeAgents: readonly PlayerProfile[],
  rng: () => number,
): { teams: TeamFranchiseState[]; signed: PlayerProfile[]; unsigned: PlayerProfile[]; signingTeams: Map<string, string> } {
  const rosters = new Map<string, PlayerProfile[]>(teams.map((t) => [t.teamId, [...t.roster]]));
  const signingsPerTeam = new Map<string, number>(teams.map((t) => [t.teamId, 0]));
  const signed: PlayerProfile[] = [];
  const unsigned: PlayerProfile[] = [];
  const signingTeams = new Map<string, string>();

  const sorted = [...freeAgents].sort((a, b) => playerValue(b) - playerValue(a));

  for (const fa of sorted) {
    let bestTeam: string | null = null;
    let lowestCount = Infinity;

    for (const [teamId, roster] of rosters) {
      if (roster.length >= TOTAL_SQUAD_SIZE) continue;
      if ((signingsPerTeam.get(teamId) ?? 0) >= MAX_FA_SIGNINGS_PER_TEAM) continue;
      const count =
        fa.kind === 'batter'
          ? roster.filter((p) => p.kind === 'batter' && p.position === fa.position).length
          : roster.filter((p) => p.kind === 'pitcher').length;
      if (count < lowestCount) {
        lowestCount = count;
        bestTeam = teamId;
      }
    }

    if (bestTeam === null) {
      unsigned.push(fa);
      continue;
    }

    const overall = overallRating(fa);
    const newContract = {
      yearsRemaining: faContractYears(overall, rng),
      annualSalary: Math.round(overall * overall * 40),
      faEligible: false,
    };
    const signedPlayer: PlayerProfile = { ...fa, rosterStatus: '2군' as const, contract: newContract };
    rosters.get(bestTeam)!.push(signedPlayer);
    signingsPerTeam.set(bestTeam, (signingsPerTeam.get(bestTeam) ?? 0) + 1);
    signed.push(signedPlayer);
    signingTeams.set(signedPlayer.playerId, bestTeam);
  }

  const updatedTeams = teams.map((t) => ({ ...t, roster: rosters.get(t.teamId)! }));
  return { teams: updatedTeams, signed, unsigned, signingTeams };
}
