import type { PitcherPitchStats } from '../pitchStats';
import { PITCH_TYPE_LABEL_KO } from '../labels';
import { StrikeZoneGrid } from './StrikeZoneGrid';

function formatPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function PitchStatsPanel({ title, stats }: { title: string; stats: PitcherPitchStats[] }) {
  return (
    <div>
      <h4>{title}</h4>
      {stats.map((s) => (
        <div key={s.playerId} className="pitch-stats-row">
          <div className="pitch-stats-summary">
            <strong>{s.name}</strong> — 총 {s.totalPitches}구 · 스트라이크 {formatPct(s.strikePct)} · 존 적중률 {formatPct(s.zonePct)} · 헛스윙률{' '}
            {formatPct(s.whiffPct)}
          </div>
          <div className="pitch-stats-body">
            <StrikeZoneGrid heat={s.zoneHeat} size={140} />
            <table className="table pitch-type-table">
              <thead>
                <tr>
                  <th>구종</th>
                  <th>개수</th>
                  <th>비율</th>
                  <th>평균 구속</th>
                  <th>스트라이크%</th>
                  <th>헛스윙%</th>
                </tr>
              </thead>
              <tbody>
                {s.byType.map((t) => (
                  <tr key={t.pitchType}>
                    <td>{PITCH_TYPE_LABEL_KO[t.pitchType]}</td>
                    <td>{t.count}</td>
                    <td>{formatPct(t.usagePct)}</td>
                    <td>{t.avgVelocity.toFixed(1)}</td>
                    <td>{formatPct(t.strikePct)}</td>
                    <td>{formatPct(t.whiffPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
