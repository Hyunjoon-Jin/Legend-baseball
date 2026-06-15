import type { PlayerProfile } from '../types/roster.js';
import { ACTIVE_ROSTER_SIZE, EXPANDED_ROSTER_SIZE } from './constants.js';
import { overallRating } from './rating.js';

/** Maximum players promoted from 2군 to 1군 when the expanded roster takes effect. */
const MAX_CALL_UPS = EXPANDED_ROSTER_SIZE - ACTIVE_ROSTER_SIZE;

export interface RosterExpansionResult {
  /** Roster with up to `MAX_CALL_UPS` 2군 players promoted to 1군. */
  roster: PlayerProfile[];
  /** `playerId`s promoted by this call, for `revertRosterExpansion` at season end. */
  calledUpIds: readonly string[];
}

/** Absolute difference between a batter:total ratio and `targetRatio`. */
function ratioDiff(batters: number, pitchers: number, targetRatio: number): number {
  return Math.abs(batters / (batters + pitchers) - targetRatio);
}

/**
 * Greedily fills `slots` call-up picks from the front of `reserveBatters` and
 * `reservePitchers` (both pre-sorted by `overallRating` descending), choosing
 * whichever kind keeps the active roster's batter:pitcher ratio closest to
 * `startingBatters : startingPitchers`.
 */
function selectCallUps(
  reserveBatters: readonly PlayerProfile[],
  reservePitchers: readonly PlayerProfile[],
  startingBatters: number,
  startingPitchers: number,
  slots: number,
): string[] {
  const targetRatio = startingBatters / Math.max(1, startingBatters + startingPitchers);
  const picks: string[] = [];
  let batters = startingBatters;
  let pitchers = startingPitchers;
  let bIdx = 0;
  let pIdx = 0;

  for (let i = 0; i < slots; i++) {
    const batterAvailable = bIdx < reserveBatters.length;
    const pitcherAvailable = pIdx < reservePitchers.length;
    if (!batterAvailable && !pitcherAvailable) break;

    const pickBatter =
      !pitcherAvailable ||
      (batterAvailable && ratioDiff(batters + 1, pitchers, targetRatio) <= ratioDiff(batters, pitchers + 1, targetRatio));

    if (pickBatter) {
      picks.push(reserveBatters[bIdx++].playerId);
      batters++;
    } else {
      picks.push(reservePitchers[pIdx++].playerId);
      pitchers++;
    }
  }

  return picks;
}

/**
 * Promotes up to `MAX_CALL_UPS` (2) 2군 players to 1군 for the September
 * roster expansion (`EXPANDED_ROSTER_SIZE`). Candidates are ranked by
 * `overallRating` regardless of position, but batter/pitcher call-ups are
 * balanced via simple ratio-matching so the active roster's batter:pitcher
 * split stays close to its pre-expansion value.
 */
export function applyRosterExpansion(roster: readonly PlayerProfile[]): RosterExpansionResult {
  const active = roster.filter((p) => p.rosterStatus === '1군');
  const activeBatters = active.filter((p) => p.kind === 'batter').length;
  const activePitchers = active.filter((p) => p.kind === 'pitcher').length;

  const reserveBatters = roster
    .filter((p) => p.rosterStatus === '2군' && p.kind === 'batter')
    .sort((a, b) => overallRating(b) - overallRating(a));
  const reservePitchers = roster
    .filter((p) => p.rosterStatus === '2군' && p.kind === 'pitcher')
    .sort((a, b) => overallRating(b) - overallRating(a));

  const slots = Math.min(MAX_CALL_UPS, Math.max(0, EXPANDED_ROSTER_SIZE - active.length));
  const calledUpIds = selectCallUps(reserveBatters, reservePitchers, activeBatters, activePitchers, slots);

  const calledUpSet = new Set(calledUpIds);
  const updatedRoster = roster.map((p) => (calledUpSet.has(p.playerId) ? { ...p, rosterStatus: '1군' as const } : p));

  return { roster: updatedRoster, calledUpIds };
}

/** Reverts September call-ups (`calledUpIds` from `applyRosterExpansion`) back to 2군 at season end. */
export function revertRosterExpansion(roster: readonly PlayerProfile[], calledUpIds: readonly string[]): PlayerProfile[] {
  const calledUpSet = new Set(calledUpIds);
  return roster.map((p) => (calledUpSet.has(p.playerId) ? { ...p, rosterStatus: '2군' as const } : p));
}
