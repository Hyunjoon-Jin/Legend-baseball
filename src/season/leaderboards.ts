import type { BatterStatLine, PitcherStatLine } from '../stats/types.js';

/** Minimum plate appearances for a batter to qualify for leaderboard rankings. */
export const BATTER_QUALIFY_PA = 300;

/** Minimum innings pitched for a pitcher to qualify for leaderboard rankings. */
export const PITCHER_QUALIFY_IP = 100;

/** Number of players shown per leaderboard category. */
export const LEADER_COUNT = 5;

/** One ranked entry in a leaderboard. */
export interface LeaderEntry {
  playerId: string;
  name: string;
  value: number;
}

export interface BattingLeaders {
  avg: LeaderEntry[];
  homeRuns: LeaderEntry[];
  rbi: LeaderEntry[];
  ops: LeaderEntry[];
}

export interface PitchingLeaders {
  era: LeaderEntry[];
  strikeouts: LeaderEntry[];
  whip: LeaderEntry[];
}

/** Ranks qualifying players by a stat value, returning the top `count` entries. */
export function rankPlayers<T>(
  stats: ReadonlyMap<string, T>,
  playerNames: ReadonlyMap<string, string>,
  qualify: (line: T) => boolean,
  getValue: (line: T) => number,
  order: 'asc' | 'desc',
  count: number,
): LeaderEntry[] {
  return [...stats.entries()]
    .filter(([, line]) => qualify(line))
    .sort((a, b) => (order === 'asc' ? getValue(a[1]) - getValue(b[1]) : getValue(b[1]) - getValue(a[1])))
    .slice(0, count)
    .map(([playerId, line]) => ({ playerId, name: playerNames.get(playerId) ?? playerId, value: getValue(line) }));
}

/** Builds the standard batting leaderboards (AVG/HR/RBI/OPS) among qualified hitters. */
export function computeBattingLeaders(
  battingStats: ReadonlyMap<string, BatterStatLine>,
  playerNames: ReadonlyMap<string, string>,
): BattingLeaders {
  const qualify = (line: BatterStatLine) => line.plateAppearances >= BATTER_QUALIFY_PA;
  return {
    avg: rankPlayers(battingStats, playerNames, qualify, (l) => l.avg, 'desc', LEADER_COUNT),
    homeRuns: rankPlayers(battingStats, playerNames, qualify, (l) => l.homeRuns, 'desc', LEADER_COUNT),
    rbi: rankPlayers(battingStats, playerNames, qualify, (l) => l.rbi, 'desc', LEADER_COUNT),
    ops: rankPlayers(battingStats, playerNames, qualify, (l) => l.ops, 'desc', LEADER_COUNT),
  };
}

/** Builds the standard pitching leaderboards (ERA/K/WHIP) among qualified pitchers. */
export function computePitchingLeaders(
  pitchingStats: ReadonlyMap<string, PitcherStatLine>,
  playerNames: ReadonlyMap<string, string>,
): PitchingLeaders {
  const qualify = (line: PitcherStatLine) => line.inningsPitched >= PITCHER_QUALIFY_IP;
  return {
    era: rankPlayers(pitchingStats, playerNames, qualify, (l) => l.era, 'asc', LEADER_COUNT),
    strikeouts: rankPlayers(pitchingStats, playerNames, qualify, (l) => l.strikeouts, 'desc', LEADER_COUNT),
    whip: rankPlayers(pitchingStats, playerNames, qualify, (l) => l.whip, 'asc', LEADER_COUNT),
  };
}
