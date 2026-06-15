import type { PlayerProfile } from '../types/roster.js';
import type { KboSeasonResult } from '../season/leagueSim.js';

/** Where a franchise sits within the annual season cycle (see `docs/player-operations-plan.md` §1). */
export type FranchisePhase = 'preseason' | 'regularSeason' | 'postseason' | 'offseason';

/** One team's full player pool (1군+2군+부상자, up to `TOTAL_SQUAD_SIZE`) plus its display name. */
export interface TeamFranchiseState {
  teamId: string;
  name: string;
  roster: PlayerProfile[];
}

/** Kinds of roster moves recorded in `FranchiseState.transactionLog` for UI display. */
export type TransactionType = 'retirement';

/** A single logged roster move (trade/signing/release/retirement/...), for UI display. */
export interface TransactionRecord {
  year: number;
  type: TransactionType;
  teamId?: string;
  playerIds: readonly string[];
  description: string;
}

/** Persistent multi-season state for one franchise (all 10 teams). */
export interface FranchiseState {
  /** Season year (e.g. 2025). */
  year: number;
  phase: FranchisePhase;
  teams: TeamFranchiseState[];
  /** Prospect pool for next year's rookie draft. */
  draftPoolNextYear: PlayerProfile[];
  /** Domestic free-agent market. */
  domesticFreeAgents: PlayerProfile[];
  /** Foreign-player market. */
  foreignFreeAgents: PlayerProfile[];
  /** Asia-quota market. */
  asiaQuotaFreeAgents: PlayerProfile[];
  /** Archive of retired players (`rosterStatus === '은퇴'`), removed from their team's roster. */
  retiredPlayers: PlayerProfile[];
  transactionLog: TransactionRecord[];
  /** Stats/standings/postseason from the most recently completed season, if any. */
  lastSeasonResult?: KboSeasonResult;
}
