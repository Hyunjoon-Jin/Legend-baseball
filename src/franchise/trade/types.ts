/** A proposed exchange of players between two teams. */
export interface TradeProposal {
  teamAId: string;
  teamBId: string;
  /** Player IDs moving from team A to team B. */
  playersFromA: readonly string[];
  /** Player IDs moving from team B to team A. */
  playersFromB: readonly string[];
}
