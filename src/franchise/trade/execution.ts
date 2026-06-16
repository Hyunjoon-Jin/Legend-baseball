import type { PlayerProfile } from '../../types/roster.js';
import type { FranchiseState, TransactionRecord } from '../types.js';
import type { TradeProposal } from './types.js';
import { TRADE_DEADLINE_GAME_INDEX } from '../../roster/constants.js';

/**
 * Swaps the named players between the two rosters, setting all incoming
 * players to `'2군'` so they wait for depth-chart re-assignment. Returns
 * the updated rosters as a `[newRosterA, newRosterB]` tuple.
 */
export function buildPostTradeRosters(
  proposal: TradeProposal,
  rosterA: readonly PlayerProfile[],
  rosterB: readonly PlayerProfile[],
): [PlayerProfile[], PlayerProfile[]] {
  const setA = new Set(proposal.playersFromA);
  const setB = new Set(proposal.playersFromB);

  const newA = [
    ...rosterA.filter((p) => !setA.has(p.playerId)),
    ...rosterB.filter((p) => setB.has(p.playerId)).map((p) => ({ ...p, rosterStatus: '2군' as const })),
  ];
  const newB = [
    ...rosterB.filter((p) => !setB.has(p.playerId)),
    ...rosterA.filter((p) => setA.has(p.playerId)).map((p) => ({ ...p, rosterStatus: '2군' as const })),
  ];

  return [newA, newB];
}

/**
 * Executes `proposal` against `state`, returning a new `FranchiseState` with
 * the players swapped and a `'trade'` record appended to `transactionLog`.
 * Returns `state` unchanged — and no transaction is logged — if `gamesPlayed`
 * is past `TRADE_DEADLINE_GAME_INDEX`.
 */
export function executeTrade(proposal: TradeProposal, state: FranchiseState, gamesPlayed: number): FranchiseState {
  if (gamesPlayed > TRADE_DEADLINE_GAME_INDEX) return state;

  const idxA = state.teams.findIndex((t) => t.teamId === proposal.teamAId);
  const idxB = state.teams.findIndex((t) => t.teamId === proposal.teamBId);
  if (idxA === -1 || idxB === -1) return state;

  const [newRosterA, newRosterB] = buildPostTradeRosters(
    proposal,
    state.teams[idxA].roster,
    state.teams[idxB].roster,
  );

  const teams = state.teams.map((t, i) => {
    if (i === idxA) return { ...t, roster: newRosterA };
    if (i === idxB) return { ...t, roster: newRosterB };
    return t;
  });

  const record: TransactionRecord = {
    year: state.year,
    type: 'trade',
    playerIds: [...proposal.playersFromA, ...proposal.playersFromB],
    description: `트레이드: ${proposal.teamAId} ↔ ${proposal.teamBId} (${proposal.playersFromA.length}:${proposal.playersFromB.length})`,
  };

  return { ...state, teams, transactionLog: [...state.transactionLog, record] };
}
