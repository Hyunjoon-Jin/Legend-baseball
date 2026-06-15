import { simulateGame, type GameOptions, type TeamSetup } from '../engine/gameEngine.js';
import { generateRegularSeasonSeries, expandToGames } from './schedule.js';
import { computeStandings } from './standings.js';
import { runKboPostseason } from './postseason.js';
import { seasonWeather } from './weather.js';
import { updateFatigue, conditionFromFatigue, type FatigueState } from './fatigue.js';
import { BatterStatsAggregator, PitcherStatsAggregator } from '../stats/aggregator.js';
import type { BatterStatLine, PitcherStatLine } from '../stats/types.js';
import type { HalfInningResult } from '../types/game.js';
import type { PitcherAttributes } from '../types/player.js';
import type { GameOutcome, LeagueTeam, PlayedGame, PostseasonResult, StandingsRow } from '../types/season.js';

/** Postseason games get extra innings to work with before settling for a tie (regular season uses the 12-inning default). */
const POSTSEASON_MAX_INNINGS = 15;

/** Number of starters in each team's rotation; the active slot advances by one every time a team plays. */
const ROTATION_SIZE = 5;

/** Weight given to the starting pitcher's condition vs. the bullpen's average condition when deriving `TeamSetup.pitcherCondition`. */
const STARTER_CONDITION_WEIGHT = 0.7;

export interface KboSeasonResult {
  games: PlayedGame[];
  standings: StandingsRow[];
  postseason: PostseasonResult;
  /** Aggregated batting stat lines for every player with a plate appearance, keyed by player id. */
  battingStats: ReadonlyMap<string, BatterStatLine>;
  /** Aggregated pitching stat lines for every pitcher who faced a batter, keyed by player id. */
  pitchingStats: ReadonlyMap<string, PitcherStatLine>;
  /** Display names for every player appearing in `battingStats`/`pitchingStats`. */
  playerNames: ReadonlyMap<string, string>;
}

/** Per-team in-season state carried across games: pitching-staff fatigue and the active rotation slot. */
interface TeamSeasonState {
  team: LeagueTeam;
  fatigue: FatigueState;
  rotationSlot: number;
}

/** A team's full pitching staff (rotation + bullpen), for fatigue tracking. */
function fullRoster(team: LeagueTeam): readonly PitcherAttributes[] {
  return [...team.rotation, ...(team.setup.bullpen ?? [])];
}

/**
 * Derives the single `pitcherCondition` value `simulateGame` expects from a
 * team's per-pitcher fatigue: mostly the starter's condition, blended with
 * the bullpen's average condition so a worn-down bullpen still matters once
 * relievers take over.
 */
function teamPitcherCondition(fatigue: FatigueState, starter: PitcherAttributes, bullpen: readonly PitcherAttributes[]): number {
  const starterCondition = conditionFromFatigue(fatigue.get(starter.id) ?? 0);
  if (bullpen.length === 0) return starterCondition;

  const bullpenAvg = bullpen.reduce((sum, p) => sum + conditionFromFatigue(fatigue.get(p.id) ?? 0), 0) / bullpen.length;
  return Math.round(starterCondition * STARTER_CONDITION_WEIGHT + bullpenAvg * (1 - STARTER_CONDITION_WEIGHT));
}

/** Sums pitches thrown by each defending pitcher in the given half ('top' = home pitching, 'bottom' = away pitching). */
function pitchesByPitcher(halfInnings: readonly HalfInningResult[], half: 'top' | 'bottom'): Map<string, number> {
  const pitches = new Map<string, number>();
  for (const h of halfInnings) {
    if (h.half !== half) continue;
    for (const pa of h.plateAppearances) {
      pitches.set(pa.pitcher.id, (pitches.get(pa.pitcher.id) ?? 0) + pa.atBat.pitches.length);
    }
  }
  return pitches;
}

/** Feeds every plate appearance in a half-inning into its batter's and pitcher's running stat aggregators. */
function recordPlateAppearances(
  half: HalfInningResult,
  battingStats: Map<string, BatterStatsAggregator>,
  pitchingStats: Map<string, PitcherStatsAggregator>,
  playerNames: Map<string, string>,
): void {
  for (const pa of half.plateAppearances) {
    playerNames.set(pa.batter.id, pa.batter.name);
    playerNames.set(pa.pitcher.id, pa.pitcher.name);

    let batter = battingStats.get(pa.batter.id);
    if (!batter) {
      batter = new BatterStatsAggregator(pa.batter.id);
      battingStats.set(pa.batter.id, batter);
    }
    batter.addPlateAppearance(pa.atBat);

    let pitcher = pitchingStats.get(pa.pitcher.id);
    if (!pitcher) {
      pitcher = new PitcherStatsAggregator();
      pitchingStats.set(pa.pitcher.id, pitcher);
    }
    pitcher.addPlateAppearance(pa.atBat);
  }
}

/**
 * Plays one game between two teams using their current rotation starters and
 * fatigue-derived pitching conditions, then records every plate appearance
 * into the running stat aggregators, updates both pitching staffs' fatigue,
 * and advances each team's rotation by one slot.
 */
function playSeasonGame(
  homeState: TeamSeasonState,
  awayState: TeamSeasonState,
  options: GameOptions,
  battingStats: Map<string, BatterStatsAggregator>,
  pitchingStats: Map<string, PitcherStatsAggregator>,
  playerNames: Map<string, string>,
  rng: () => number,
): GameOutcome {
  const homeStarter = homeState.team.rotation[homeState.rotationSlot];
  const awayStarter = awayState.team.rotation[awayState.rotationSlot];
  const homeBullpen = homeState.team.setup.bullpen ?? [];
  const awayBullpen = awayState.team.setup.bullpen ?? [];

  const home: TeamSetup = {
    ...homeState.team.setup,
    pitcher: homeStarter,
    pitcherCondition: teamPitcherCondition(homeState.fatigue, homeStarter, homeBullpen),
  };
  const away: TeamSetup = {
    ...awayState.team.setup,
    pitcher: awayStarter,
    pitcherCondition: teamPitcherCondition(awayState.fatigue, awayStarter, awayBullpen),
  };

  const result = simulateGame(away, home, options, rng);

  for (const half of result.halfInnings) {
    recordPlateAppearances(half, battingStats, pitchingStats, playerNames);
  }

  updateFatigue(homeState.fatigue, pitchesByPitcher(result.halfInnings, 'top'), fullRoster(homeState.team));
  updateFatigue(awayState.fatigue, pitchesByPitcher(result.halfInnings, 'bottom'), fullRoster(awayState.team));

  homeState.rotationSlot = (homeState.rotationSlot + 1) % ROTATION_SIZE;
  awayState.rotationSlot = (awayState.rotationSlot + 1) % ROTATION_SIZE;

  return { winner: result.winner, homeRuns: result.finalScore.home, awayRuns: result.finalScore.away };
}

/**
 * Simulates a full KBO-style season for the given teams: a 144-game
 * round-robin regular season (16 games per opponent, 8 home/8 away),
 * followed by the Wild Card / Semi-Playoff / Playoff / Korean Series
 * bracket seeded by the resulting standings (top 5 teams).
 *
 * Each team works through its 5-man rotation start by start, and every
 * pitcher's workload-driven fatigue (and recovery between outings) carries
 * over via `TeamSetup.pitcherCondition`. Weather follows a spring-to-fall
 * seasonal arc during the regular season and late-season conditions during
 * the postseason. Every plate appearance is folded into per-player batting
 * and pitching stat lines.
 */
export function simulateKboSeason(teams: readonly LeagueTeam[], options: GameOptions, rng: () => number): KboSeasonResult {
  const teamIds = teams.map((t) => t.id);
  const scheduledGames = expandToGames(generateRegularSeasonSeries(teamIds));

  const states = new Map<string, TeamSeasonState>();
  for (const team of teams) {
    states.set(team.id, { team, fatigue: new Map(), rotationSlot: 0 });
  }

  const battingStats = new Map<string, BatterStatsAggregator>();
  const pitchingStats = new Map<string, PitcherStatsAggregator>();
  const playerNames = new Map<string, string>();

  const lastGameIndex = Math.max(1, scheduledGames.length - 1);
  const games: PlayedGame[] = scheduledGames.map((scheduled, index) => {
    const homeState = states.get(scheduled.homeTeamId)!;
    const awayState = states.get(scheduled.awayTeamId)!;
    const weather = seasonWeather(index / lastGameIndex, rng);
    const gameOptions: GameOptions = { ...options, weather };

    const outcome = playSeasonGame(homeState, awayState, gameOptions, battingStats, pitchingStats, playerNames, rng);
    return { homeTeamId: scheduled.homeTeamId, awayTeamId: scheduled.awayTeamId, ...outcome };
  });

  const standings = computeStandings(teamIds, games);
  const seeds = standings.slice(0, 5).map((row) => row.teamId);

  const postseasonOptions: GameOptions = { ...options, maxInnings: POSTSEASON_MAX_INNINGS };
  const postseason = runKboPostseason(seeds, (homeTeamId, awayTeamId) => {
    const homeState = states.get(homeTeamId)!;
    const awayState = states.get(awayTeamId)!;
    const gameOptions: GameOptions = { ...postseasonOptions, weather: seasonWeather(1, rng) };
    return playSeasonGame(homeState, awayState, gameOptions, battingStats, pitchingStats, playerNames, rng);
  });

  const battingLines = new Map<string, BatterStatLine>();
  for (const [id, agg] of battingStats) battingLines.set(id, agg.getStatLine());

  const pitchingLines = new Map<string, PitcherStatLine>();
  for (const [id, agg] of pitchingStats) pitchingLines.set(id, agg.getStatLine());

  return { games, standings, postseason, battingStats: battingLines, pitchingStats: pitchingLines, playerNames };
}
