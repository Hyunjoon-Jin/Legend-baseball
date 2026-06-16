import type { PlayerProfile } from '../../types/roster.js';
import type { TeamFranchiseState } from '../types.js';
import { overallRating } from '../../roster/rating.js';
import { FOREIGN_SLOTS, TOTAL_SQUAD_SIZE } from '../../roster/constants.js';

/** Base probability that an expiring foreign player renews. */
const RENEWAL_BASE_PROBABILITY = 0.5;
/** Additional renewal probability for players rated 70+. */
const RENEWAL_RATING_BONUS = 0.2;

/**
 * Processes foreign-player contracts for the offseason:
 * 1. Players with > 0 years remaining are automatically retained.
 * 2. Players at 0 years roll for renewal (70% chance if rating ≥ 70, else 50%).
 *    Renewed players get a 1-2-year extension; others are released.
 * 3. Vacant `FOREIGN_SLOTS` are filled from `pool` in descending rating order,
 *    respecting `TOTAL_SQUAD_SIZE`. Teams process in array order; the best
 *    available pool player goes to the first team with a vacancy.
 *
 * Returns the updated team array and any pool players not placed.
 */
export function runForeignSigningMarket(
  teams: readonly TeamFranchiseState[],
  pool: readonly PlayerProfile[],
  rng: () => number,
): { teams: TeamFranchiseState[]; unused: PlayerProfile[] } {
  const poolQueue = [...pool].sort((a, b) => overallRating(b) - overallRating(a));
  let poolIndex = 0;

  const updatedTeams = teams.map((team) => {
    const nonForeign = team.roster.filter((p) => p.origin !== 'foreign');
    const foreignPlayers = team.roster.filter((p) => p.origin === 'foreign');

    const renewed: PlayerProfile[] = [];
    for (const p of foreignPlayers) {
      if (p.contract.yearsRemaining > 0) {
        renewed.push(p);
        continue;
      }
      const rating = overallRating(p);
      const renewalProb = RENEWAL_BASE_PROBABILITY + (rating >= 70 ? RENEWAL_RATING_BONUS : 0);
      if (rng() < renewalProb) {
        const newYears = 1 + Math.floor(rng() * 2);
        renewed.push({ ...p, contract: { ...p.contract, yearsRemaining: newYears } });
      }
    }

    const newSignings: PlayerProfile[] = [];
    const slotsToFill = FOREIGN_SLOTS - renewed.length;
    for (let i = 0; i < slotsToFill && poolIndex < poolQueue.length; i++) {
      if (nonForeign.length + renewed.length + newSignings.length < TOTAL_SQUAD_SIZE) {
        newSignings.push({ ...poolQueue[poolIndex++], rosterStatus: '2군' as const });
      }
    }

    return { ...team, roster: [...nonForeign, ...renewed, ...newSignings] };
  });

  return { teams: updatedTeams, unused: poolQueue.slice(poolIndex) };
}
