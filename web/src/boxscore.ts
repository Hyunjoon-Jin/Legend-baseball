import type { HalfInningResult, PlateAppearanceResult } from './api/types';

export interface BattingBoxScoreRow {
  playerId: string;
  name: string;
  pa: number;
  ab: number;
  h: number;
  hr: number;
  rbi: number;
  bb: number;
  k: number;
  avg: number;
}

export interface PitchingBoxScoreRow {
  playerId: string;
  name: string;
  outs: number;
  ip: number;
  h: number;
  r: number;
  bb: number;
  k: number;
  hr: number;
}

const NO_AT_BAT_RESULTS = new Set<PlateAppearanceResult>([
  'walk',
  'intentionalWalk',
  'hitByPitch',
  'sacrificeFly',
  'sacrificeBunt',
  'catcherInterference',
  'inningEndingCaughtStealing',
]);

const HIT_RESULTS = new Set<PlateAppearanceResult>(['single', 'infieldSingle', 'double', 'triple', 'homeRun', 'insideTheParkHomeRun']);
const HOME_RUN_RESULTS = new Set<PlateAppearanceResult>(['homeRun', 'insideTheParkHomeRun']);
const WALK_RESULTS = new Set<PlateAppearanceResult>(['walk', 'intentionalWalk']);
const STRIKEOUT_RESULTS = new Set<PlateAppearanceResult>(['strikeoutSwinging', 'strikeoutLooking']);

/** Builds a per-batter box score (PA/AB/H/HR/RBI/BB/K/AVG) for one team's half-innings. */
export function buildBattingBoxScore(halfInnings: HalfInningResult[], half: 'top' | 'bottom'): BattingBoxScoreRow[] {
  const rows = new Map<string, BattingBoxScoreRow>();
  const order: string[] = [];

  for (const h of halfInnings) {
    if (h.half !== half) continue;
    for (const pa of h.plateAppearances) {
      if (pa.atBat.result === 'inningEndingCaughtStealing') continue;

      let row = rows.get(pa.batter.id);
      if (!row) {
        row = { playerId: pa.batter.id, name: pa.batter.name, pa: 0, ab: 0, h: 0, hr: 0, rbi: 0, bb: 0, k: 0, avg: 0 };
        rows.set(pa.batter.id, row);
        order.push(pa.batter.id);
      }

      row.pa += 1;
      if (!NO_AT_BAT_RESULTS.has(pa.atBat.result)) row.ab += 1;
      if (HIT_RESULTS.has(pa.atBat.result)) row.h += 1;
      if (HOME_RUN_RESULTS.has(pa.atBat.result)) row.hr += 1;
      if (WALK_RESULTS.has(pa.atBat.result)) row.bb += 1;
      if (STRIKEOUT_RESULTS.has(pa.atBat.result)) row.k += 1;
      if (pa.atBat.result !== 'reachedOnError') row.rbi += pa.atBat.runsScored;
    }
  }

  return order.map((id) => {
    const row = rows.get(id)!;
    row.avg = row.ab > 0 ? row.h / row.ab : 0;
    return row;
  });
}

/** Builds a per-pitcher box score (IP/H/R/BB/K/HR) for the team defending in the given half. */
export function buildPitchingBoxScore(halfInnings: HalfInningResult[], half: 'top' | 'bottom'): PitchingBoxScoreRow[] {
  const rows = new Map<string, PitchingBoxScoreRow>();
  const order: string[] = [];

  for (const h of halfInnings) {
    if (h.half !== half) continue;
    for (const pa of h.plateAppearances) {
      if (pa.atBat.result === 'inningEndingCaughtStealing') continue;

      let row = rows.get(pa.pitcher.id);
      if (!row) {
        row = { playerId: pa.pitcher.id, name: pa.pitcher.name, outs: 0, ip: 0, h: 0, r: 0, bb: 0, k: 0, hr: 0 };
        rows.set(pa.pitcher.id, row);
        order.push(pa.pitcher.id);
      }

      row.outs += pa.atBat.outsRecorded;
      if (HIT_RESULTS.has(pa.atBat.result)) row.h += 1;
      if (HOME_RUN_RESULTS.has(pa.atBat.result)) row.hr += 1;
      if (WALK_RESULTS.has(pa.atBat.result)) row.bb += 1;
      if (STRIKEOUT_RESULTS.has(pa.atBat.result)) row.k += 1;
      row.r += pa.atBat.runsScored;
    }
  }

  return order.map((id) => {
    const row = rows.get(id)!;
    row.ip = Math.floor(row.outs / 3) + (row.outs % 3) / 10;
    return row;
  });
}

export function formatAvg(value: number): string {
  return value.toFixed(3).replace(/^0\./, '.');
}
