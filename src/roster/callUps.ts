import type { PitcherAttributes } from '../types/player.js';
import type { PlayerProfile } from '../types/roster.js';
import { overallRating } from './rating.js';

export interface CallUpEvent {
  /** Player who left the 1군 roster (e.g. due to injury). */
  outPlayerId: string;
  /** 2군 replacement promoted to 1군. */
  inPlayerId: string;
}

/**
 * For each player in `outgoingPlayerIds`, promotes the best available 2군
 * player of the same `kind` to 1군 — preferring the same `position` for
 * batters or the same pitching `role` for pitchers, and falling back to the
 * best overall 2군 player of that kind if no exact match exists. An outgoing
 * player with no 2군 replacement of the same kind is simply left unreplaced.
 */
export function fillRosterGaps(roster: readonly PlayerProfile[], outgoingPlayerIds: readonly string[]): { roster: PlayerProfile[]; events: CallUpEvent[] } {
  let current = [...roster];
  const events: CallUpEvent[] = [];

  for (const outId of outgoingPlayerIds) {
    const outgoing = current.find((p) => p.playerId === outId);
    if (!outgoing) continue;

    const reserves = current.filter((p) => p.rosterStatus === '2군' && p.kind === outgoing.kind);
    if (reserves.length === 0) continue;

    const matching =
      outgoing.kind === 'batter'
        ? reserves.filter((p) => p.position === outgoing.position)
        : reserves.filter((p) => (p.attributes as PitcherAttributes).role === (outgoing.attributes as PitcherAttributes).role);

    const pool = matching.length > 0 ? matching : reserves;
    const best = [...pool].sort((a, b) => overallRating(b) - overallRating(a))[0];

    current = current.map((p) => (p.playerId === best.playerId ? { ...p, rosterStatus: '1군' as const } : p));
    events.push({ outPlayerId: outId, inPlayerId: best.playerId });
  }

  return { roster: current, events };
}
