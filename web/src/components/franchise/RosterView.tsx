import { useState } from 'react';
import type { FranchiseState, PlayerProfile } from '../../api/franchiseClient';
import { buildDepthChart, overallRating } from '../../api/franchiseClient';
import type { BatterAttributes, PitcherAttributes } from '../../../../src/types/player';

const STATUS_LABEL: Record<string, string> = {
  '1군': '1군',
  '2군': '2군',
  '부상자명단': 'IL',
  '은퇴': '은퇴',
};

const STATUS_CLASS: Record<string, string> = {
  '1군': 'status-active',
  '2군': 'status-minor',
  '부상자명단': 'status-il',
  '은퇴': '',
};

const ORIGIN_LABEL: Record<string, string> = {
  domestic: '국내',
  foreign: '외국인',
  asiaQuota: '쿼터',
  draft: '드래프트',
  secondaryDraft: '2차드래프트',
};

const TYPE_LABEL: Record<string, string> = {
  retirement: '은퇴',
  trade: '트레이드',
  'fa-declaration': 'FA선언',
  signing: 'FA영입',
  draft: '드래프트',
  secondaryDraft: '2차드래프트',
};

function playerPosition(p: PlayerProfile): string {
  if (p.kind === 'batter') return p.position ?? '-';
  const role = (p.attributes as PitcherAttributes).role;
  if (role === 'starter') return '선발';
  if (role === 'setup') return '셋업';
  if (role === 'closer') return '마무리';
  return '불펜';
}

interface Props {
  franchise: FranchiseState;
}

export function RosterView({ franchise }: Props) {
  const [teamId, setTeamId] = useState(franchise.teams[0]?.teamId ?? '');

  const team = franchise.teams.find((t) => t.teamId === teamId);
  if (!team) return null;

  const sorted = [...team.roster].sort((a, b) => {
    const order = { '1군': 0, '2군': 1, '부상자명단': 2, '은퇴': 3 };
    const sd = (order[a.rosterStatus] ?? 4) - (order[b.rosterStatus] ?? 4);
    if (sd !== 0) return sd;
    if (a.kind !== b.kind) return a.kind === 'batter' ? -1 : 1;
    return overallRating(b) - overallRating(a);
  });

  const chart = buildDepthChart(team.roster);
  const lineupPlayerIds = new Set(chart.lineup.map((b: BatterAttributes) => b.id));
  const rotationPlayerIds = new Set(chart.rotation.map((p: PitcherAttributes) => p.id));

  const activeCount = team.roster.filter((p) => p.rosterStatus === '1군').length;
  const ilCount = team.roster.filter((p) => p.rosterStatus === '부상자명단').length;

  return (
    <div>
      {/* Team selector */}
      <div className="field-row" style={{ marginBottom: 16 }}>
        <label>
          팀 선택
          <select value={teamId} onChange={(e) => setTeamId(e.target.value)} className="select-input">
            {franchise.teams.map((t) => (
              <option key={t.teamId} value={t.teamId}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <span className="roster-meta">
          전체 {team.roster.length}명 · 1군 {activeCount}명
          {ilCount > 0 && ` · IL ${ilCount}명`}
        </span>
      </div>

      {/* Depth chart */}
      <div className="depth-chart-grid">
        <div className="depth-section">
          <h3 className="depth-title">라인업</h3>
          <ol className="lineup-list">
            {chart.lineup.map((b: BatterAttributes, i: number) => {
              const p = team.roster.find((r) => r.attributes.id === b.id);
              return (
                <li key={b.id} className="lineup-item">
                  <span className="lineup-num">{i + 1}</span>
                  <span className="lineup-pos">{p?.position ?? '?'}</span>
                  <span className="lineup-name">{b.name}</span>
                  <span className="lineup-ovr">{p ? overallRating(p) : '-'}</span>
                </li>
              );
            })}
          </ol>
        </div>
        <div className="depth-section">
          <h3 className="depth-title">로테이션</h3>
          <ol className="lineup-list">
            {chart.rotation.map((p: PitcherAttributes, i: number) => {
              const prof = team.roster.find((r) => r.attributes.id === p.id);
              return (
                <li key={p.id} className="lineup-item">
                  <span className="lineup-num">{i + 1}</span>
                  <span className="lineup-pos">선발</span>
                  <span className="lineup-name">{p.name}</span>
                  <span className="lineup-ovr">{prof ? overallRating(prof) : '-'}</span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      {/* Full roster table */}
      <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="table roster-table">
          <thead>
            <tr>
              <th>구분</th>
              <th>포지션</th>
              <th>선수명</th>
              <th>나이</th>
              <th>OVR</th>
              <th>잠재력</th>
              <th>계약</th>
              <th>출신</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => {
              const inLineup = lineupPlayerIds.has(p.playerId);
              const inRotation = rotationPlayerIds.has(p.playerId);
              const isStarter = inLineup || inRotation;
              return (
                <tr key={p.playerId} className={`roster-row ${STATUS_CLASS[p.rosterStatus] ?? ''} ${isStarter ? 'is-starter' : ''}`}>
                  <td>
                    <span className={`status-badge ${STATUS_CLASS[p.rosterStatus] ?? ''}`}>
                      {STATUS_LABEL[p.rosterStatus] ?? p.rosterStatus}
                    </span>
                  </td>
                  <td>{playerPosition(p)}</td>
                  <td className="player-name">{p.attributes.name}</td>
                  <td>{p.age}</td>
                  <td className="ovr-cell">{overallRating(p)}</td>
                  <td className="pot-cell">{p.potential}</td>
                  <td>{p.contract.yearsRemaining}년</td>
                  <td>{ORIGIN_LABEL[p.origin] ?? p.origin}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface TransactionLogProps {
  franchise: FranchiseState;
}

export function TransactionLog({ franchise }: TransactionLogProps) {
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [yearFilter, setYearFilter] = useState<string>('all');

  const years = [...new Set(franchise.transactionLog.map((r) => r.year))].sort((a, b) => b - a);
  const types = [...new Set(franchise.transactionLog.map((r) => r.type))];

  const filtered = [...franchise.transactionLog]
    .reverse()
    .filter((r) => (typeFilter === 'all' || r.type === typeFilter) && (yearFilter === 'all' || r.year === Number(yearFilter)));

  if (franchise.transactionLog.length === 0) {
    return <p className="description">아직 트랜잭션 기록이 없습니다. 시즌을 진행하면 기록이 쌓입니다.</p>;
  }

  return (
    <div>
      <div className="field-row" style={{ marginBottom: 16 }}>
        <label>
          유형
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="select-input">
            <option value="all">전체</option>
            {types.map((t) => (
              <option key={t} value={t}>{TYPE_LABEL[t] ?? t}</option>
            ))}
          </select>
        </label>
        <label>
          연도
          <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} className="select-input">
            <option value="all">전체</option>
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </label>
        <span className="roster-meta">{filtered.length}건</span>
      </div>

      <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="table">
          <thead>
            <tr>
              <th>연도</th>
              <th>유형</th>
              <th>내용</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr key={i} className={`tx-row tx-${r.type}`}>
                <td style={{ whiteSpace: 'nowrap' }}>{r.year}</td>
                <td>
                  <span className={`tx-badge tx-${r.type}`}>{TYPE_LABEL[r.type] ?? r.type}</span>
                </td>
                <td className="tx-desc">{r.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
