import type { BatterAttributes, PitcherAttributes } from './player.js';

/** Fielding position for a batter on the 65-man squad. */
export type Position = 'C' | '1B' | '2B' | '3B' | 'SS' | 'LF' | 'CF' | 'RF' | 'DH';

/** Where a player currently sits within a team's overall player pool. */
export type RosterStatus = '1군' | '2군' | '부상자명단' | '은퇴';

/** How a player joined the organization. */
export type PlayerOrigin = 'domestic' | 'foreign' | 'asiaQuota' | 'draft' | 'secondaryDraft';

/** Contract terms, used for FA eligibility and display purposes. */
export interface ContractInfo {
  yearsRemaining: number;
  /** Annual salary, in units of 만원 (10,000 KRW). Display-only. */
  annualSalary: number;
  faEligible: boolean;
}

/** Active injury, if any. */
export interface InjuryStatus {
  description: string;
  /** Remaining games before the player can return from the injury list. */
  daysRemaining: number;
}

/**
 * Player-operations metadata wrapping the existing `BatterAttributes` /
 * `PitcherAttributes`. `playerId` is globally unique and stable across
 * trades/drafts, so stat history and roster references survive team changes.
 */
export interface PlayerProfile {
  playerId: string;
  kind: 'batter' | 'pitcher';
  attributes: BatterAttributes | PitcherAttributes;
  /** Primary fielding position. Batters only. */
  position?: Position;
  age: number;
  /** 0-100 ceiling that growth moves a player's ratings toward. */
  potential: number;
  rosterStatus: RosterStatus;
  origin: PlayerOrigin;
  contract: ContractInfo;
  /** Years of top-level service time, used for FA eligibility. */
  serviceTimeYears: number;
  /** Nationality flavor for foreign / Asia-quota players. */
  nationality?: string;
  injury?: InjuryStatus;
}
