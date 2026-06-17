import { zoneIndex } from '../../../src/types/zone.js';
import type { PitchEvent, PitchResult } from '../api/types';
import { PITCH_RESULT_LABEL_KO } from '../labels';

const GRID_CELLS = 5;

const PITCH_RESULT_COLOR: Record<PitchResult, string> = {
  ball: '#5b8fd1',
  calledStrike: '#c0392b',
  swingingStrike: '#e67e22',
  foulTip: '#d35400',
  foulBall: '#e8c32a',
  inPlay: '#27ae60',
  hitByPitch: '#8e44ad',
};

// Deterministic offsets so multiple pitches landing in the same cell fan out
// instead of fully overlapping.
const JITTER_OFFSETS: Array<[number, number]> = [
  [0, 0],
  [-0.22, -0.22],
  [0.22, 0.22],
  [-0.22, 0.22],
  [0.22, -0.22],
  [0, -0.3],
  [0, 0.3],
  [-0.3, 0],
  [0.3, 0],
];

interface StrikeZoneGridProps {
  /** Sequence mode: renders numbered, color-coded markers for each pitch in order. */
  pitches?: PitchEvent[];
  /** Heatmap mode: 25-entry frequency array (indexed by `zoneIndex`), 0..1 normalized. */
  heat?: number[];
  /** Overall rendered size in pixels (square). Defaults to 220. */
  size?: number;
}

/**
 * Renders the 5x5 plate-location grid (catcher's-eye view: row 0 = high,
 * row 4 = low, col 0 = left, col 4 = right) with the rulebook strike zone
 * (inner 3x3) highlighted. Pass `pitches` to plot a single at-bat's pitch
 * sequence, or `heat` to shade cells by aggregate frequency.
 */
export function StrikeZoneGrid({ pitches, heat, size = 220 }: StrikeZoneGridProps) {
  const cell = size / GRID_CELLS;
  const cellOccurrence = new Map<number, number>();

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="투구 위치 분포">
      {Array.from({ length: GRID_CELLS * GRID_CELLS }, (_, idx) => {
        const row = Math.floor(idx / GRID_CELLS);
        const col = idx % GRID_CELLS;
        const heatValue = heat?.[idx] ?? 0;
        return (
          <rect
            key={idx}
            x={col * cell}
            y={row * cell}
            width={cell}
            height={cell}
            fill="#e74c3c"
            fillOpacity={heatValue * 0.85}
            stroke="var(--border)"
            strokeWidth={1}
          />
        );
      })}

      {/* Rulebook strike zone (inner 3x3) */}
      <rect x={cell} y={cell} width={cell * 3} height={cell * 3} fill="none" stroke="var(--accent)" strokeWidth={2} />

      {pitches?.map((pitch, i) => {
        const idx = zoneIndex(pitch.zone);
        const occurrence = cellOccurrence.get(idx) ?? 0;
        cellOccurrence.set(idx, occurrence + 1);
        const [jx, jy] = JITTER_OFFSETS[occurrence % JITTER_OFFSETS.length];

        const cx = (pitch.zone.col + 0.5 + jx) * cell;
        const cy = (pitch.zone.row + 0.5 + jy) * cell;
        const radius = Math.max(7, cell * 0.16);

        return (
          <g key={i}>
            <circle cx={cx} cy={cy} r={radius} fill={PITCH_RESULT_COLOR[pitch.result]} stroke="#fff" strokeWidth={1}>
              <title>
                {pitch.pitchNumber}구 - {PITCH_RESULT_LABEL_KO[pitch.result]}
              </title>
            </circle>
            <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={radius} fill="#fff" fontWeight={600}>
              {pitch.pitchNumber}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Legend mapping each pitch result color to its Korean label, for use alongside a sequence-mode grid. */
export function StrikeZoneLegend({ results }: { results: PitchResult[] }) {
  const unique = [...new Set(results)];
  return (
    <ul className="zone-legend">
      {unique.map((result) => (
        <li key={result}>
          <span className="zone-legend-dot" style={{ background: PITCH_RESULT_COLOR[result] }} />
          {PITCH_RESULT_LABEL_KO[result]}
        </li>
      ))}
    </ul>
  );
}
