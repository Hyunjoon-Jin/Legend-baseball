import type { PlayerProfile } from '../../types/roster.js';
import type { TeamFranchiseState } from '../types.js';
import { overallRating } from '../../roster/rating.js';
import { playerValue } from '../trade/evaluation.js';
import { FA_ELIGIBILITY_YEARS, TOTAL_SQUAD_SIZE } from '../../roster/constants.js';

/** Fraction of eligible players who actually declare FA each offseason. */
const FA_DECLARE_PROBABILITY = 0.15;

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
 * For every domestic player whose contract just expired and who has earned
 * FA eligibility, rolls a declaration probability. Declaring players are
 * removed from their team's roster and returned as `newFreeAgents` with
 * `faEligible: true`. Non-domestic and under-contract players are untouched.
 */
export function processFADeclarations(
  teams: readonly TeamFranchiseState[],
  rng: () => number,
): { teams: TeamFranchiseState[]; newFreeAgents: PlayerProfile[] } {
  const newFreeAgents: PlayerProfile[] = [];

  const updatedTeams = teams.map((team) => {
    const remaining: PlayerProfile[] = [];
    for (const p of team.roster) {
      const eligible =
        p.origin === 'domestic' &&
        p.contract.yearsRemaining <= 0 &&
        p.serviceTimeYears >= FA_ELIGIBILITY_YEARS;

      if (eligible && rng() < FA_DECLARE_PROBABILITY) {
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
 * Distributes free agents across teams using a need-based greedy auction:
 * - FAs are processed in descending `playerValue` order.
 * - Each FA signs with the team that has the fewest players at the FA's
 *   position (batters) or the fewest total pitchers (pitchers), provided
 *   the team has room under `TOTAL_SQUAD_SIZE`.
 * - If no team can accept the player, they remain unsigned.
 * - Signed players receive a new 2-4-year contract and are set to `'2군'`.
 */
export function runDomesticFAMarket(
  teams: readonly TeamFranchiseState[],
  freeAgents: readonly PlayerProfile[],
  rng: () => number,
): { teams: TeamFranchiseState[]; signed: PlayerProfile[]; unsigned: PlayerProfile[] } {
  const rosters = new Map<string, PlayerProfile[]>(teams.map((t) => [t.teamId, [...t.roster]]));
  const signingsPerTeam = new Map<string, number>(teams.map((t) => [t.teamId, 0]));
  const signed: PlayerProfile[] = [];
  const unsigned: PlayerProfile[] = [];

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

    const newContract = {
      yearsRemaining: 2 + Math.floor(rng() * 3),
      annualSalary: Math.round(overallRating(fa) * 1000),
      faEligible: false,
    };
    const signedPlayer: PlayerProfile = { ...fa, rosterStatus: '2군' as const, contract: newContract };
    rosters.get(bestTeam)!.push(signedPlayer);
    signingsPerTeam.set(bestTeam, (signingsPerTeam.get(bestTeam) ?? 0) + 1);
    signed.push(signedPlayer);
  }

  const updatedTeams = teams.map((t) => ({ ...t, roster: rosters.get(t.teamId)! }));
  return { teams: updatedTeams, signed, unsigned };
}
