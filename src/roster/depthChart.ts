import type { BatterAttributes, PitcherAttributes } from '../types/player.js';
import type { Lineup } from '../types/game.js';
import type { TeamSetup } from '../engine/gameEngine.js';
import type { LeagueTeam } from '../types/season.js';
import type { PlayerProfile, Position } from '../types/roster.js';
import type { DefensiveTeamRatings } from '../types/baserunning.js';
import { defaultDefense } from '../types/baserunning.js';
import { overallRating } from './rating.js';

const POSITIONS: readonly Position[] = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];

const ROTATION_SIZE = 5;

/** Lineup/rotation/bullpen automatically assembled from a team's player pool. */
export interface DepthChart {
  lineup: Lineup;
  bench: readonly BatterAttributes[];
  /** 5-man starting rotation, ace first. */
  rotation: readonly PitcherAttributes[];
  bullpen: readonly PitcherAttributes[];
}

function tableSetterScore(attrs: BatterAttributes): number {
  const contact = (attrs.contactVsRight + attrs.contactVsLeft) / 2;
  return attrs.speed * 0.5 + attrs.plateDiscipline * 0.3 + contact * 0.2;
}

function powerScore(attrs: BatterAttributes): number {
  const contact = (attrs.contactVsRight + attrs.contactVsLeft) / 2;
  return attrs.power * 0.5 + contact * 0.3 + attrs.clutch * 0.2;
}

/** Removes and returns the top `count` players from `pool` (mutates `pool`), ranked by `score` descending. */
function takeTop(pool: PlayerProfile[], count: number, score: (p: PlayerProfile) => number): PlayerProfile[] {
  pool.sort((a, b) => score(b) - score(a));
  return pool.splice(0, count);
}

/**
 * Orders 9 position starters into a batting order: speed/plate-discipline
 * table-setters lead off (1-2), power bats hit in the middle (3-5), and the
 * rest follow by overall rating (6-9).
 */
function orderLineup(starters: readonly PlayerProfile[]): Lineup {
  const remaining = [...starters];
  const tableSetters = takeTop(remaining, 2, (p) => tableSetterScore(p.attributes as BatterAttributes));
  const middleOrder = takeTop(remaining, 3, (p) => powerScore(p.attributes as BatterAttributes));
  const rest = remaining.sort((a, b) => overallRating(b) - overallRating(a));

  return [...tableSetters, ...middleOrder, ...rest].map((p) => p.attributes as BatterAttributes);
}

/**
 * Picks one starter per position (best 1군 batter, falling back to the best
 * overall batter on the roster if a position has no active player), then
 * fills the bench with the remaining active batters by overall rating.
 */
function buildLineupAndBench(activeBatters: readonly PlayerProfile[], fullRoster: readonly PlayerProfile[]): { lineup: Lineup; bench: readonly BatterAttributes[] } {
  const usedIds = new Set<string>();
  const starters: PlayerProfile[] = [];

  for (const pos of POSITIONS) {
    const pools = [activeBatters, fullRoster];
    let starter: PlayerProfile | undefined;
    for (const pool of pools) {
      starter = pool
        .filter((p) => p.kind === 'batter' && p.position === pos && !usedIds.has(p.playerId))
        .sort((a, b) => overallRating(b) - overallRating(a))[0];
      if (starter) break;
    }
    if (starter) {
      starters.push(starter);
      usedIds.add(starter.playerId);
    }
  }

  const bench = activeBatters
    .filter((p) => !usedIds.has(p.playerId))
    .sort((a, b) => overallRating(b) - overallRating(a))
    .map((p) => p.attributes as BatterAttributes);

  return { lineup: orderLineup(starters), bench };
}

/**
 * Builds a 5-man rotation (preferring `role === 'starter'` pitchers, best
 * overall first) and sends everyone else to the bullpen. Falls back to the
 * full roster's pitchers if the active roster has none.
 */
function buildPitchingStaff(activePitchers: readonly PlayerProfile[], fullRoster: readonly PlayerProfile[]): { rotation: readonly PitcherAttributes[]; bullpen: readonly PitcherAttributes[] } {
  const pool = activePitchers.length > 0 ? activePitchers : fullRoster.filter((p) => p.kind === 'pitcher');
  const sorted = [...pool].sort((a, b) => overallRating(b) - overallRating(a));
  const starters = sorted.filter((p) => (p.attributes as PitcherAttributes).role === 'starter');

  const rotation: PlayerProfile[] = [];
  const rotationIds = new Set<string>();
  for (const p of [...starters, ...sorted]) {
    if (rotation.length >= ROTATION_SIZE) break;
    if (rotationIds.has(p.playerId)) continue;
    rotation.push(p);
    rotationIds.add(p.playerId);
  }

  const bullpen = sorted.filter((p) => !rotationIds.has(p.playerId));

  return {
    rotation: rotation.map((p) => p.attributes as PitcherAttributes),
    bullpen: bullpen.map((p) => p.attributes as PitcherAttributes),
  };
}

/**
 * Builds a lineup/bench/rotation/bullpen from a team's 65-player pool,
 * using only `rosterStatus === '1군'` players (with a same-team fallback to
 * the full roster if a position or the pitching staff is left empty).
 */
export function buildDepthChart(roster: readonly PlayerProfile[]): DepthChart {
  const active = roster.filter((p) => p.rosterStatus === '1군');
  const activeBatters = active.filter((p) => p.kind === 'batter');
  const activePitchers = active.filter((p) => p.kind === 'pitcher');

  const { lineup, bench } = buildLineupAndBench(activeBatters, roster);
  const { rotation, bullpen } = buildPitchingStaff(activePitchers, roster);

  return { lineup, bench, rotation, bullpen };
}

/** Converts a player pool into the existing `TeamSetup` shape, ready for `simulateKboSeason`. */
export function buildTeamSetup(name: string, roster: readonly PlayerProfile[], defense: DefensiveTeamRatings = defaultDefense): TeamSetup {
  const { lineup, bench, rotation, bullpen } = buildDepthChart(roster);
  return { name, lineup, bench, pitcher: rotation[0], bullpen, defense };
}

/** Converts a player pool into a full `LeagueTeam` (including the 5-man rotation), ready for `simulateKboSeason`. */
export function buildLeagueTeam(id: string, name: string, roster: readonly PlayerProfile[], defense: DefensiveTeamRatings = defaultDefense): LeagueTeam {
  const { lineup, bench, rotation, bullpen } = buildDepthChart(roster);
  return { id, setup: { name, lineup, bench, pitcher: rotation[0], bullpen, defense }, rotation };
}
