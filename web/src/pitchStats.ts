import { isInStrikeZone, zoneIndex } from '../../src/types/zone.js';
import type { HalfInningResult, PitchEvent, PitchResult, PitchType } from './api/types';

const ALL_PITCH_TYPES: PitchType[] = ['fourSeam', 'twoSeam', 'sinker', 'cutter', 'slider', 'curve', 'changeup', 'splitter', 'knuckleCurve'];

const NO_SWING_RESULTS = new Set<PitchResult>(['ball', 'calledStrike', 'hitByPitch']);
const STRIKE_RESULTS = new Set<PitchResult>(['calledStrike', 'swingingStrike', 'foulTip', 'foulBall', 'inPlay']);

export interface PitchTypeStatRow {
  pitchType: PitchType;
  count: number;
  usagePct: number;
  avgVelocity: number;
  strikePct: number;
  whiffPct: number;
}

export interface PitcherPitchStats {
  playerId: string;
  name: string;
  totalPitches: number;
  strikePct: number;
  zonePct: number;
  whiffPct: number;
  byType: PitchTypeStatRow[];
  /** 25-entry frequency array (indexed by `zoneIndex`), normalized 0..1 against this pitcher's own max. */
  zoneHeat: number[];
}

function summarize(pitches: PitchEvent[]): { strikes: number; swings: number; whiffs: number } {
  let strikes = 0;
  let swings = 0;
  let whiffs = 0;
  for (const p of pitches) {
    if (STRIKE_RESULTS.has(p.result)) strikes++;
    if (!NO_SWING_RESULTS.has(p.result)) swings++;
    if (p.result === 'swingingStrike') whiffs++;
  }
  return { strikes, swings, whiffs };
}

/** Builds per-pitcher pitch-level stats (usage/velocity/strike%/whiff% by pitch type, plus a zone heatmap) for one team's half-innings. */
export function buildPitcherPitchStats(halfInnings: HalfInningResult[], half: 'top' | 'bottom'): PitcherPitchStats[] {
  const byPitcher = new Map<string, { name: string; pitches: PitchEvent[] }>();
  const order: string[] = [];

  for (const h of halfInnings) {
    if (h.half !== half) continue;
    for (const pa of h.plateAppearances) {
      if (pa.atBat.pitches.length === 0) continue;

      let entry = byPitcher.get(pa.pitcher.id);
      if (!entry) {
        entry = { name: pa.pitcher.name, pitches: [] };
        byPitcher.set(pa.pitcher.id, entry);
        order.push(pa.pitcher.id);
      }
      entry.pitches.push(...pa.atBat.pitches);
    }
  }

  return order.map((playerId) => {
    const { name, pitches } = byPitcher.get(playerId)!;
    const total = pitches.length;

    const zoneCounts = new Array(25).fill(0);
    for (const p of pitches) zoneCounts[zoneIndex(p.zone)] += 1;
    const maxCount = Math.max(1, ...zoneCounts);
    const zoneHeat = zoneCounts.map((c) => c / maxCount);

    const inZone = pitches.filter((p) => isInStrikeZone(p.zone)).length;
    const { strikes, swings, whiffs } = summarize(pitches);

    const byType: PitchTypeStatRow[] = ALL_PITCH_TYPES.filter((t) => pitches.some((p) => p.pitchType === t))
      .map((pitchType) => {
        const typePitches = pitches.filter((p) => p.pitchType === pitchType);
        const typeSummary = summarize(typePitches);
        return {
          pitchType,
          count: typePitches.length,
          usagePct: typePitches.length / total,
          avgVelocity: typePitches.reduce((sum, p) => sum + p.velocity, 0) / typePitches.length,
          strikePct: typeSummary.strikes / typePitches.length,
          whiffPct: typeSummary.swings > 0 ? typeSummary.whiffs / typeSummary.swings : 0,
        };
      })
      .sort((a, b) => b.count - a.count);

    return {
      playerId,
      name,
      totalPitches: total,
      strikePct: total > 0 ? strikes / total : 0,
      zonePct: total > 0 ? inZone / total : 0,
      whiffPct: swings > 0 ? whiffs / swings : 0,
      byType,
      zoneHeat,
    };
  });
}
