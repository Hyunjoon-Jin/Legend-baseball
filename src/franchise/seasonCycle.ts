import type { GameOptions } from '../engine/gameEngine.js';
import { simulateKboSeason, type SeasonHooks } from '../season/leagueSim.js';
import { buildLeagueTeam } from '../roster/depthChart.js';
import { applyRosterExpansion, revertRosterExpansion } from '../roster/expansion.js';
import { advanceInjuries, rollInjuries } from '../roster/injuries.js';
import { fillRosterGaps } from '../roster/callUps.js';
import { overallRating } from '../roster/rating.js';
import { developRoster } from './offseason/development.js';
import { ACTIVE_ROSTER_SIZE, EXPANDED_ROSTER_SIZE, EXPANSION_GAME_INDEX } from '../roster/constants.js';
import type { FranchiseState, TeamFranchiseState } from './types.js';
import type { PlayerProfile } from '../types/roster.js';

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

  const leagueTeams = state.teams.map((team) => {
    rosters.set(team.teamId, team.roster);
    return buildLeagueTeam(team.teamId, team.name, team.roster);
  });

  const hooks: SeasonHooks = {
    onBeforeGame: (gamesPlayed, teamId, team, fatigue) => {
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

  const transactionLog = [...state.transactionLog];
  const retiredPlayers = [...state.retiredPlayers];

  const teams: TeamFranchiseState[] = state.teams.map((team) => {
    let roster = rosters.get(team.teamId)!;

    const calledUpIds = calledUpByTeam.get(team.teamId);
    if (calledUpIds) roster = revertRosterExpansion(roster, calledUpIds);

    // Offseason: any remaining injuries heal up before next season.
    roster = roster.map((p) => (p.rosterStatus === '부상자명단' ? { ...p, rosterStatus: '2군' as const, injury: undefined } : p));
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
