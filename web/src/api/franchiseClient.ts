import { generateLeaguePlayerPools } from '../../../src/data/playerPoolGenerator.js';
import { buildDepthChart as _buildDepthChart } from '../../../src/roster/depthChart.js';
import { playFranchiseSeason } from '../../../src/franchise/seasonCycle.js';
import { overallRating } from '../../../src/roster/rating.js';
import type { FranchiseState } from '../../../src/franchise/types.js';
import type { PlayerProfile } from '../../../src/types/roster.js';

export type { FranchiseState };
export type { TeamFranchiseState, TransactionRecord, TransactionType, SeasonStatsSnapshot } from '../../../src/franchise/types.js';
export type { PlayerProfile };
export type { DepthChart } from '../../../src/roster/depthChart.js';
export type { BatterStatLine, PitcherStatLine } from '../../../src/stats/types.js';

function mulberry32(seed: number) {
  return function rng() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const KBO_TEAMS: { id: string; name: string }[] = [
  { id: 'T1', name: 'KIA 타이거즈' },
  { id: 'T2', name: '삼성 라이온즈' },
  { id: 'T3', name: 'LG 트윈스' },
  { id: 'T4', name: '두산 베어스' },
  { id: 'T5', name: 'KT 위즈' },
  { id: 'T6', name: 'SSG 랜더스' },
  { id: 'T7', name: '롯데 자이언츠' },
  { id: 'T8', name: '한화 이글스' },
  { id: 'T9', name: 'NC 다이노스' },
  { id: 'T10', name: '키움 히어로즈' },
];

export function randomSeed(): number {
  return Math.floor(Math.random() * 0x80000000);
}

export function createFranchiseState(seed: number): FranchiseState {
  const rng = mulberry32(seed);
  const strengths = Array.from({ length: 10 }, () => 1.0);
  const pools = generateLeaguePlayerPools(strengths, rng);

  const teams = KBO_TEAMS.map(({ id, name }, i) => ({
    teamId: id,
    name,
    roster: pools[i],
  }));

  return {
    year: 2025,
    phase: 'preseason',
    teams,
    draftPoolNextYear: [],
    domesticFreeAgents: [],
    foreignFreeAgents: [],
    asiaQuotaFreeAgents: [],
    retiredPlayers: [],
    transactionLog: [],
    seasonStats: [],
  };
}

export function advanceSeason(state: FranchiseState, seed: number): FranchiseState {
  return playFranchiseSeason(state, mulberry32(seed));
}

export function buildDepthChart(roster: PlayerProfile[]) {
  return _buildDepthChart(roster);
}

export { overallRating };
