import { useState } from 'react';
import {
  createFranchiseState,
  advanceSeason,
  randomSeed,
  KBO_TEAMS,
  type FranchiseState,
} from '../api/franchiseClient';
import { RosterView, TransactionLog } from './franchise/RosterView';
import type { StandingsRow } from '../../../src/types/season';

type SubTab = 'roster' | 'season' | 'transactions';

const PHASE_LABEL: Record<string, string> = {
  preseason: '프리시즌',
  regularSeason: '정규시즌',
  postseason: '포스트시즌',
  offseason: '오프시즌',
};

const ROUND_LABEL: Record<string, string> = {
  wildCard: '와일드카드',
  semiPlayoff: '준플레이오프',
  playoff: '플레이오프',
  koreanSeries: '한국시리즈',
};

function SeasonResultView({ franchise }: { franchise: FranchiseState }) {
  const result = franchise.lastSeasonResult;
  if (!result) {
    return <p className="description">아직 시즌 결과가 없습니다. 시즌을 진행해 주세요.</p>;
  }

  const teamName = (id: string) => franchise.teams.find((t) => t.teamId === id)?.name ?? id;

  return (
    <div>
      <div className="panel">
        <h3 style={{ marginTop: 0 }}>{franchise.year - 1}시즌 정규시즌 최종 순위</h3>
        <table className="table">
          <thead>
            <tr>
              <th>순위</th>
              <th style={{ textAlign: 'left' }}>팀</th>
              <th>승</th>
              <th>패</th>
              <th>무</th>
              <th>승률</th>
              <th>득점</th>
              <th>실점</th>
              <th>GB</th>
            </tr>
          </thead>
          <tbody>
            {(result.standings as StandingsRow[]).map((row, i) => (
              <tr key={row.teamId} className={i < 5 ? 'playoffs-team' : ''}>
                <td>{i + 1}</td>
                <td style={{ textAlign: 'left' }}>{teamName(row.teamId)}</td>
                <td>{row.wins}</td>
                <td>{row.losses}</td>
                <td>{row.ties}</td>
                <td>{row.winPct.toFixed(3).replace('0.', '.')}</td>
                <td>{row.runsScored}</td>
                <td>{row.runsAllowed}</td>
                <td>{row.gamesBehind === 0 ? '-' : row.gamesBehind.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {result.postseason && (
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>포스트시즌</h3>
          {Object.entries(result.postseason).map(([round, series]: [string, unknown]) => {
            if (!series || !Array.isArray((series as { games?: unknown[] }).games)) return null;
            const s = series as { teamA: string; teamB: string; winner: string; games: unknown[] };
            return (
              <div key={round} className="postseason-series">
                <span className="series-round">{ROUND_LABEL[round] ?? round}</span>
                <span className="series-teams">
                  {teamName(s.teamA)} vs {teamName(s.teamB)}
                </span>
                <span className="series-winner">우승 → {teamName(s.winner)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface SetupFormProps {
  onStart: (seed: number) => void;
}

function SetupForm({ onStart }: SetupFormProps) {
  const [seed, setSeed] = useState(randomSeed());

  return (
    <div className="panel" style={{ maxWidth: 480 }}>
      <h2 style={{ marginTop: 0 }}>프랜차이즈 시작</h2>
      <p className="description">
        10개 KBO 팀으로 구성된 프랜차이즈를 시작합니다. 팀별 65인 로스터가 자동 생성되며,
        시즌을 반복 진행하며 선수 성장·은퇴·FA·드래프트를 관리합니다.
      </p>
      <div className="field-row">
        <label>
          시드
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="number"
              value={seed}
              onChange={(e) => setSeed(Number(e.target.value))}
              style={{ width: 140 }}
            />
            <button type="button" className="btn-secondary" onClick={() => setSeed(randomSeed())}>
              랜덤
            </button>
          </div>
        </label>
      </div>

      <div style={{ marginTop: 12, marginBottom: 16 }}>
        <p className="description" style={{ marginBottom: 8 }}>참가 팀</p>
        <div className="team-list-preview">
          {KBO_TEAMS.map((t) => (
            <span key={t.id} className="team-chip">{t.name}</span>
          ))}
        </div>
      </div>

      <button type="button" className="btn-primary" onClick={() => onStart(seed)}>
        프랜차이즈 시작
      </button>
    </div>
  );
}

export function FranchiseMode() {
  const [franchise, setFranchise] = useState<FranchiseState | null>(null);
  const [subTab, setSubTab] = useState<SubTab>('roster');
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStart = (seed: number) => {
    try {
      const state = createFranchiseState(seed);
      setFranchise(state);
      setSelectedTeamId(state.teams[0]?.teamId ?? '');
      setSubTab('roster');
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  };

  const handleAdvanceSeason = () => {
    if (!franchise) return;
    setLoading(true);
    setError(null);
    setTimeout(() => {
      try {
        const next = advanceSeason(franchise, randomSeed());
        setFranchise(next);
        setSubTab('season');
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    }, 0);
  };

  if (!franchise) {
    return <SetupForm onStart={handleStart} />;
  }

  const txCounts = {
    retirement: franchise.transactionLog.filter((r) => r.type === 'retirement').length,
    draft: franchise.transactionLog.filter((r) => r.type === 'draft').length,
    signing: franchise.transactionLog.filter((r) => r.type === 'signing').length,
  };

  return (
    <div>
      {/* Franchise header */}
      <div className="franchise-header">
        <div className="franchise-status">
          <span className="franchise-year">{franchise.year}시즌</span>
          <span className="franchise-phase">{PHASE_LABEL[franchise.phase] ?? franchise.phase}</span>
          <span className="franchise-stats">
            은퇴 {franchise.retiredPlayers.length}명 · FA {franchise.domesticFreeAgents.length}명
          </span>
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={handleAdvanceSeason}
          disabled={loading}
        >
          {loading ? '시즌 진행 중…' : `${franchise.year}시즌 진행`}
        </button>
      </div>

      {error && <div className="error-msg">{error}</div>}

      {/* Sub-tabs */}
      <nav className="sub-tabs">
        {(
          [
            { id: 'roster', label: '로스터' },
            { id: 'season', label: `시즌 결과${franchise.lastSeasonResult ? ` (${franchise.year - 1})` : ''}` },
            { id: 'transactions', label: `트랜잭션 (${franchise.transactionLog.length})` },
          ] as { id: SubTab; label: string }[]
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            className={subTab === t.id ? 'sub-tab active' : 'sub-tab'}
            onClick={() => setSubTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* Content */}
      {subTab === 'roster' && <RosterView franchise={franchise} selectedTeamId={selectedTeamId} onTeamChange={setSelectedTeamId} />}
      {subTab === 'season' && <SeasonResultView franchise={franchise} />}
      {subTab === 'transactions' && <TransactionLog franchise={franchise} selectedTeamId={selectedTeamId} />}

      {/* Offseason summary cards */}
      {subTab === 'season' && franchise.lastSeasonResult && (
        <div className="summary-cards">
          <div className="summary-card">
            <div className="summary-num">{franchise.retiredPlayers.length}</div>
            <div className="summary-label">누적 은퇴 선수</div>
          </div>
          <div className="summary-card">
            <div className="summary-num">{txCounts.draft}</div>
            <div className="summary-label">드래프트 픽</div>
          </div>
          <div className="summary-card">
            <div className="summary-num">{txCounts.signing}</div>
            <div className="summary-label">FA 영입</div>
          </div>
          <div className="summary-card">
            <div className="summary-num">{franchise.domesticFreeAgents.length}</div>
            <div className="summary-label">미계약 FA</div>
          </div>
        </div>
      )}
    </div>
  );
}
