import type { GameOptions } from '../engine/gameEngine.js';
import { simulateKboSeason, type SeasonHooks } from '../season/leagueSim.js';
import { buildLeagueTeam } from '../roster/depthChart.js';
import { applyRosterExpansion, revertRosterExpansion } from '../roster/expansion.js';
import { advanceInjuries, rollInjuries } from '../roster/injuries.js';
import { fillRosterGaps } from '../roster/callUps.js';
import { overallRating } from '../roster/rating.js';
import { developRoster } from './offseason/development.js';
import { decrementContracts, processFADeclarations, runDomesticFAMarket } from './offseason/freeAgency.js';
import { runForeignSigningMarket } from './offseason/foreignSigning.js';
import { runAsiaQuotaSigningMarket } from './offseason/asiaQuotaSigning.js';
import { generateForeignFreeAgentPool, generateAsiaQuotaFreeAgentPool } from '../data/playerPoolGenerator.js';
import { generateDraftClass, runDraft } from './offseason/draft.js';
import { runSecondaryDraft } from './offseason/secondaryDraft.js';
import { ACTIVE_ROSTER_SIZE, EXPANDED_ROSTER_SIZE, EXPANSION_GAME_INDEX, SECONDARY_DRAFT_CYCLE_YEARS } from '../roster/constants.js';
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
  const MAX_TRADES = 2;

  for (let i = 0; i + 1 < shuffled.length; i += 2) {
    if (traded.size / 2 >= MAX_TRADES) break;
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
 * Promotes the highest-`overallRating` `2군` players to `1군` until the
 * active roster reaches `targetActive`. Called at the end of the offseason
 * after FA departures may have left vacancies in the active roster.
 */
function replenishActiveRoster(roster: readonly PlayerProfile[], targetActive: number): PlayerProfile[] {
  const activeCount = roster.filter((p) => p.rosterStatus === '1군').length;
  if (activeCount >= targetActive) return [...roster];

  const toPromote = [...roster.filter((p) => p.rosterStatus === '2군')]
    .sort((a, b) => overallRating(b) - overallRating(a))
    .slice(0, targetActive - activeCount);

  const promoteSet = new Set(toPromote.map((p) => p.playerId));
  return roster.map((p) => (promoteSet.has(p.playerId) ? { ...p, rosterStatus: '1군' as const } : p));
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

  // --- offseason markets ---
  let afterDecrement = teams.map((t) => ({ ...t, roster: decrementContracts(t.roster) }));

  // Secondary draft: runs every SECONDARY_DRAFT_CYCLE_YEARS seasons.
  if (state.year % SECONDARY_DRAFT_CYCLE_YEARS === 0) {
    const { teams: afterSD, picks: sdPicks } = runSecondaryDraft(afterDecrement, result, rng);
    afterDecrement = afterSD;
    for (const pick of sdPicks) {
      transactionLog.push({
        year: state.year,
        type: 'secondaryDraft',
        teamId: pick.teamId,
        playerIds: [pick.playerId],
        description: `2차 드래프트 ${pick.round}라운드: ${pick.playerName} (${pick.fromTeamId} → ${pick.teamId})`,
      });
    }
  }

  const foreignPool = generateForeignFreeAgentPool(state.year + 1, 20, rng);
  const asiaPool = generateAsiaQuotaFreeAgentPool(state.year + 1, 10, rng);
  const { teams: afterForeign } = runForeignSigningMarket(afterDecrement, foreignPool, rng);
  const { teams: afterAsiaQuota } = runAsiaQuotaSigningMarket(afterForeign, asiaPool, rng);

  const { teams: afterFADecl, newFreeAgents } = processFADeclarations(afterAsiaQuota, rng);
  const allFAs = [...state.domesticFreeAgents, ...newFreeAgents];
  const { teams: afterSigning, signed, unsigned } = runDomesticFAMarket(afterFADecl, allFAs, rng);

  // FA departures may have left 1군 vacancies; promote best 2군 players to fill them.
  const afterReplenish = afterSigning.map((t) => ({
    ...t,
    roster: replenishActiveRoster(t.roster, ACTIVE_ROSTER_SIZE),
  }));

  // Rookie draft: fills each team's 2군 with new prospects.
  const draftClass = generateDraftClass(state.year + 1, 100, rng);
  const { teams: finalTeams, picks: draftPicks } = runDraft(afterReplenish, draftClass, result, rng);
  for (const pick of draftPicks) {
    transactionLog.push({
      year: state.year,
      type: 'draft',
      teamId: pick.teamId,
      playerIds: [pick.playerId],
      description: `드래프트 ${pick.round}라운드: ${pick.playerName} → ${pick.teamId}`,
    });
  }

  for (const fa of newFreeAgents) {
    transactionLog.push({
      year: state.year,
      type: 'fa-declaration',
      playerIds: [fa.playerId],
      description: `FA 선언: ${fa.attributes.name} (${fa.age}세)`,
    });
  }
  for (const p of signed) {
    transactionLog.push({
      year: state.year,
      type: 'signing',
      playerIds: [p.playerId],
      description: `FA 영입: ${p.attributes.name}`,
    });
  }

  return {
    ...state,
    year: state.year + 1,
    phase: 'preseason',
    teams: finalTeams,
    retiredPlayers,
    transactionLog,
    domesticFreeAgents: unsigned,
    foreignFreeAgents: [],
    asiaQuotaFreeAgents: [],
    draftPoolNextYear: [],
    lastSeasonResult: result,
  };
}
