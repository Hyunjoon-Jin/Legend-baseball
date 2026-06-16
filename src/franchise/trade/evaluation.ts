import type { PlayerProfile } from '../../types/roster.js';
import type { FranchiseState } from '../types.js';
import type { TradeProposal } from './types.js';
import { overallRating } from '../../roster/rating.js';
import { PEAK_AGE_BATTER, PEAK_AGE_PITCHER } from '../../roster/constants.js';

/** Multiplier that scales unrealized potential into additional trade value for pre-peak players. */
const POTENTIAL_SCALE = 2.0;

/** Trade value contributed per remaining contract year (more control = more value). */
const CONTRACT_YEARS_VALUE = 2;

/** Default points a team is willing to lose on a trade before declining. */
const DEFAULT_TOLERANCE = 10;

/**
 * Single-number trade valuation for one player: current overall rating,
 * plus a premium for unrealized potential (weighted by years left until peak),
 * plus a bonus for years of remaining contract control.
 */
export function playerValue(profile: PlayerProfile): number {
  const overall = overallRating(profile);
  const peakAge = profile.kind === 'batter' ? PEAK_AGE_BATTER : PEAK_AGE_PITCHER;

  const potentialBonus =
    profile.age < peakAge
      ? (profile.potential - overall) * ((peakAge - profile.age) / peakAge) * POTENTIAL_SCALE
      : 0;

  const contractBonus = profile.contract.yearsRemaining * CONTRACT_YEARS_VALUE;

  return Math.max(0, Math.round(overall + potentialBonus + contractBonus));
}

/**
 * Calculates the net value each side gains from `proposal`.
 * Positive `aGain` means team A comes out ahead; negative means they give up value.
 */
export function evaluateTrade(
  proposal: TradeProposal,
  state: FranchiseState,
): { aGain: number; bGain: number } {
  const teamA = state.teams.find((t) => t.teamId === proposal.teamAId);
  const teamB = state.teams.find((t) => t.teamId === proposal.teamBId);
  if (!teamA || !teamB) return { aGain: 0, bGain: 0 };

  const lookup = new Map<string, PlayerProfile>();
  for (const p of teamA.roster) lookup.set(p.playerId, p);
  for (const p of teamB.roster) lookup.set(p.playerId, p);

  const valueFromA = proposal.playersFromA.reduce((sum, id) => sum + (lookup.has(id) ? playerValue(lookup.get(id)!) : 0), 0);
  const valueFromB = proposal.playersFromB.reduce((sum, id) => sum + (lookup.has(id) ? playerValue(lookup.get(id)!) : 0), 0);

  return { aGain: valueFromB - valueFromA, bGain: valueFromA - valueFromB };
}

/**
 * Returns whether `teamId` would accept `proposal` under the given `evaluation`.
 * Acceptance requires both:
 *  - The team's gain >= -`tolerance` (they don't give up too much value).
 *  - No 1군 batter position that currently has exactly one starter is stripped
 *    entirely of active coverage by what the team is sending away.
 */
export function willAccept(
  teamId: string,
  proposal: TradeProposal,
  state: FranchiseState,
  evaluation: { aGain: number; bGain: number },
  tolerance = DEFAULT_TOLERANCE,
): boolean {
  const gain = teamId === proposal.teamAId ? evaluation.aGain : evaluation.bGain;
  if (gain < -tolerance) return false;

  const team = state.teams.find((t) => t.teamId === teamId);
  if (!team) return false;

  const outgoing = new Set(teamId === proposal.teamAId ? proposal.playersFromA : proposal.playersFromB);

  const active1B = new Map<string, number>();
  for (const p of team.roster) {
    if (p.rosterStatus === '1군' && p.kind === 'batter' && p.position) {
      active1B.set(p.position, (active1B.get(p.position) ?? 0) + 1);
    }
  }

  for (const p of team.roster) {
    if (outgoing.has(p.playerId) && p.rosterStatus === '1군' && p.kind === 'batter' && p.position) {
      if ((active1B.get(p.position) ?? 0) <= 1) return false;
    }
  }

  return true;
}
