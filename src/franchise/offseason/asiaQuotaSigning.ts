import type { PlayerProfile } from '../../types/roster.js';
import type { TeamFranchiseState } from '../types.js';
import { overallRating } from '../../roster/rating.js';
import { ASIA_QUOTA_SLOTS, TOTAL_SQUAD_SIZE } from '../../roster/constants.js';

/** Base probability that an expiring Asia-quota player renews. */
const RENEWAL_BASE_PROBABILITY = 0.5;
/** Additional renewal probability for players rated 70+. */
const RENEWAL_RATING_BONUS = 0.2;

/**
 * Processes Asia-quota player contracts for the offseason:
 * 1. Players with > 0 years remaining are automatically retained.
 * 2. Players at 0 years roll for renewal (70% chance if rating ≥ 70, else 50%).
 *    Renewed players get a 1-2-year extension; others are released.
 * 3. Vacant `ASIA_QUOTA_SLOTS` are filled from `pool` in descending rating
 *    order, respecting `TOTAL_SQUAD_SIZE`.
 *
 * Returns the updated team array and any pool players not placed.
 */
export function runAsiaQuotaSigningMarket(
  teams: readonly TeamFranchiseState[],
  pool: readonly PlayerProfile[],
  rng: () => number,
): { teams: TeamFranchiseState[]; unused: PlayerProfile[] } {
  const poolQueue = [...pool].sort((a, b) => overallRating(b) - overallRating(a));
  let poolIndex = 0;

  const updatedTeams = teams.map((team) => {
    const nonAsiaQuota = team.roster.filter((p) => p.origin !== 'asiaQuota');
    const asiaQuotaPlayers = team.roster.filter((p) => p.origin === 'asiaQuota');

    const renewed: PlayerProfile[] = [];
    for (const p of asiaQuotaPlayers) {
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
    const slotsToFill = ASIA_QUOTA_SLOTS - renewed.length;
    for (let i = 0; i < slotsToFill && poolIndex < poolQueue.length; i++) {
      if (nonAsiaQuota.length + renewed.length + newSignings.length < TOTAL_SQUAD_SIZE) {
        newSignings.push({ ...poolQueue[poolIndex++], rosterStatus: '2군' as const });
      }
    }

    return { ...team, roster: [...nonAsiaQuota, ...renewed, ...newSignings] };
  });

  return { teams: updatedTeams, unused: poolQueue.slice(poolIndex) };
}
