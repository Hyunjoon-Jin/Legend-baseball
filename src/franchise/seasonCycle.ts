import type { GameOptions } from '../engine/gameEngine.js';
import { simulateKboSeason, type SeasonHooks } from '../season/leagueSim.js';
import { buildLeagueTeam } from '../roster/depthChart.js';
import { applyRosterExpansion, revertRosterExpansion } from '../roster/expansion.js';
import { advanceInjuries, rollInjuries } from '../roster/injuries.js';
import { fillRosterGaps } from '../roster/callUps.js';
import { overallRating } from '../roster/rating.js';
import { developRoster } from './offseason/development.js';
import { ACTIVE_ROSTER_SIZE, EXPANDED_ROSTER_SIZE, EXPANSION_GAME_INDEX } from '../roster/constants.js';
import { playerValue } from './trade/evaluation.js';
import { buildPostTradeRosters } from './trade/execution.js';
import type { FranchiseState, TeamFranchiseState, TransactionRecord } from './types.js';
import type { PlayerProfile } from '../types/roster.js';

/** Game index at which AI teams make their one mid-season trade attempt (well before the deadline). */
const TRADE_MARKET_GAME = 30;

/**
 * Pairs teams randomly and proposes a "best bench-for-bench" swap for each
 * pair — executing the trade (via `buildPostTradeRosters`) when both sides'
 * top 2군 players are within 10 value points of each other. Mutates `rosters`
 * in-place and appends records to `transactionLog`.
 */
function runAiTradeMarket(
  teamIds: readonly string[],
  rosters: Map<string, PlayerProfile[]>,
  year: number,
  transactionLog: TransactionRecord[],
  rng: () => number,
): void {
  const shuffled = [...teamIds].sort(() => rng() - 0.5);
  const traded = new Set<string>();
  const TOLERANCE = 10;

  for (let i = 0; i + 1 < shuffled.length; i += 2) {
    const idA = shuffled[i];
    const idB = shuffled[i + 1];
    if (traded.has(idA) || traded.has(idB)) continue;

    const rA = rosters.get(idA)!;
    const rB = rosters.get(idB)!;

    const bestA = [...rA.filter((p) => p.rosterStatus === '2군')].sort((a, b) => playerValue(b) - playerValue(a))[0];
    const bestB = [...rB.filter((p) => p.rosterStatus === '2군')].sort((a, b) => playerValue(b) - playerValue(a))[0];
    if (!bestA || !bestB) continue;

    if (Math.abs(playerValue(bestA) - playerValue(bestB)) > TOLERANCE) continue;

    const [newA, newB] = buildPostTradeRosters(
      { teamAId: idA, teamBId: idB, playersFromA: [bestA.playerId], playersFromB: [bestB.playerId] },
      rA,
      rB,
    );
    rosters.set(idA, newA);
    rosters.set(idB, newB);
    traded.add(idA);
    traded.add(idB);

    transactionLog.push({
      year,
      type: 'trade',
      playerIds: [bestA.playerId, bestB.playerId],
      description: `트레이드: ${idA} ↔ ${idB}`,
    });
  }
}

/**
 * Demotes the lowest-`overallRating` excess `1군` players to `2군` so the
 * active roster fits within `maxActive`. A safety net for the end of the
 * season: in-season call-ups that filled gaps left by other expansion
 * call-ups aren't tracked by `revertRosterExpansion`, so the active roster
 * can otherwise still be over `ACTIVE_ROSTER_SIZE` once expansion ends.
 */
function capActiveRoster(roster: readonly PlayerProfile[], maxActive: number): PlayerProfile[] {
  const active = roster.filter((p) => p.rosterStatus === '1군');
  if (active.length <= maxActive) return [...roster];

  const demoted = new Set(
    [...active].sort((a, b) => overallRating(a) - overallRating(b)).slice(0, active.length - maxActive).map((p) => p.playerId),
  );
  return roster.map((p) => (demoted.has(p.playerId) ? { ...p, rosterStatus: '2군' as const } : p));
}

/**
 * Plays one full season for `state`: builds each team's `LeagueTeam` from its
 * current roster, runs `simulateKboSeason` (regular season + postseason) with
 * hooks that apply the September roster expansion and roll injuries/call-ups
 * before each game, then runs the offseason — reverting expansion call-ups,
 * recovering anyone still on the injury list, aging every player a year
 * (growth/decline/retirement via `developRoster`) — and returns the
 * `FranchiseState` for the next year (`year + 1`, `phase: 'preseason'`).
 */
export function playFranchiseSeason(state: FranchiseState, rng: () => number, options: GameOptions = {}): FranchiseState {
  const rosters = new Map<string, PlayerProfile[]>();
  const calledUpByTeam = new Map<string, readonly string[]>();
  const transactionLog: TransactionRecord[] = [...state.transactionLog];
  const teamIds = state.teams.map((t) => t.teamId);
  let tradeMarketDone = false;

  const leagueTeams = state.teams.map((team) => {
    rosters.set(team.teamId, team.roster);
    return buildLeagueTeam(team.teamId, team.name, team.roster);
  });

  const hooks: SeasonHooks = {
    onBeforeGame: (gamesPlayed, teamId, team, fatigue) => {
      if (!tradeMarketDone && gamesPlayed === TRADE_MARKET_GAME) {
        tradeMarketDone = true;
        runAiTradeMarket(teamIds, rosters, state.year, transactionLog, rng);
      }

      let roster = rosters.get(teamId)!;
      let changed = false;

      if (gamesPlayed === EXPANSION_GAME_INDEX) {
        const expansion = applyRosterExpansion(roster);
        roster = expansion.roster;
        calledUpByTeam.set(teamId, expansion.calledUpIds);
        changed = true;
      }

      const targetActiveSize = gamesPlayed >= EXPANSION_GAME_INDEX ? EXPANDED_ROSTER_SIZE : ACTIVE_ROSTER_SIZE;
      const advanced = advanceInjuries(roster, targetActiveSize);
      const { roster: afterInjury, events: injuryEvents } = rollInjuries(advanced, fatigue, rng);
      const { roster: afterCallUp, events: callUpEvents } = fillRosterGaps(afterInjury, injuryEvents.map((e) => e.playerId));
      roster = afterCallUp;
      if (injuryEvents.length > 0 || callUpEvents.length > 0) changed = true;

      rosters.set(teamId, roster);
      return changed ? buildLeagueTeam(teamId, team.setup.name, roster) : undefined;
    },
  };

  const result = simulateKboSeason(leagueTeams, options, rng, hooks);

  const retiredPlayers = [...state.retiredPlayers];

  const teams: TeamFranchiseState[] = state.teams.map((team) => {
    let roster = rosters.get(team.teamId)!;

    const calledUpIds = calledUpByTeam.get(team.teamId);
    if (calledUpIds) roster = revertRosterExpansion(roster, calledUpIds);

    // Offseason: all remaining injuries heal. '부상자명단' players return to '2군';
    // any player carrying a stale injury field (e.g. from expansion revert) also clears it.
    roster = roster.map((p) => {
      if (p.rosterStatus === '부상자명단') return { ...p, rosterStatus: '2군' as const, injury: undefined };
      if (p.injury) return { ...p, injury: undefined };
      return p;
    });
    roster = capActiveRoster(roster, ACTIVE_ROSTER_SIZE);

    const { roster: developed, retired } = developRoster(roster, rng);
    for (const player of retired) {
      retiredPlayers.push(player);
      transactionLog.push({
        year: state.year,
        type: 'retirement',
        teamId: team.teamId,
        playerIds: [player.playerId],
        description: `${player.attributes.name} 은퇴 (만 ${player.age}세)`,
      });
    }

    return { ...team, roster: developed };
  });

  return {
    ...state,
    year: state.year + 1,
    phase: 'preseason',
    teams,
    retiredPlayers,
    transactionLog,
    lastSeasonResult: result,
  };
}
