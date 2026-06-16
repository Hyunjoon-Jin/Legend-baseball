import type { PlayerProfile, FranchiseState, BatterStatLine, PitcherStatLine, SeasonStatsSnapshot } from '../api/franchiseClient';
import type { BatterAttributes, PitcherAttributes } from '../../../src/types/player';
import { overallRating } from '../api/franchiseClient';

// ── helpers ──────────────────────────────────────────────────────────────────

function potentialGrade(p: number): string {
  if (p >= 80) return 'A';
  if (p >= 65) return 'B';
  if (p >= 50) return 'C';
  return 'D';
}

function formatSalary(n: number): string {
  const eok = n / 10000;
  return `${eok.toFixed(1)}억`;
}

function formatIP(ip: number): string {
  const full = Math.floor(ip);
  const partial = Math.round((ip - full) * 3);
  return `${full}.${partial}`;
}

function pct(n: number): string {
  return (n * 100).toFixed(1) + '%';
}

function avg3(n: number): string {
  return n.toFixed(3).replace(/^0/, '');
}

const PITCH_LABEL: Record<string, string> = {
  fourSeam: '포심', twoSeam: '투심', sinker: '싱커', cutter: '커터',
  slider: '슬라이더', curve: '커브', changeup: '체인지업', splitter: '스플리터',
  knuckleCurve: '너클커브',
};

const ORIGIN_LABEL: Record<string, string> = {
  domestic: '국내', foreign: '외국인', asiaQuota: '쿼터',
  draft: '드래프트', secondaryDraft: '2차드래프트',
};

const STATUS_LABEL: Record<string, string> = {
  '1군': '1군', '2군': '2군', '부상자명단': 'IL', '은퇴': '은퇴',
};

// ── rating bar ────────────────────────────────────────────────────────────────

function ratingColor(v: number): string {
  if (v >= 80) return 'var(--accent)';
  if (v >= 65) return '#4a9eff';
  if (v >= 50) return '#f0c040';
  return '#cc5555';
}

function RatingBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="pm-rating-row">
      <span className="pm-rating-label">{label}</span>
      <div className="pm-rating-bar-bg">
        <div
          className="pm-rating-bar-fill"
          style={{ width: `${value}%`, background: ratingColor(value) }}
        />
      </div>
      <span className="pm-rating-value" style={{ color: ratingColor(value) }}>{value}</span>
    </div>
  );
}

// ── batter attributes panel ───────────────────────────────────────────────────

function BatterAttrsPanel({ attrs }: { attrs: BatterAttributes }) {
  return (
    <div className="pm-attrs-grid">
      <RatingBar label="컨택(우)" value={attrs.contactVsRight} />
      <RatingBar label="컨택(좌)" value={attrs.contactVsLeft} />
      <RatingBar label="파워" value={attrs.power} />
      <RatingBar label="선구안" value={attrs.plateDiscipline} />
      <RatingBar label="헛스윙 저항" value={attrs.badBallHitting} />
      <RatingBar label="스피드" value={attrs.speed} />
      <RatingBar label="도루" value={attrs.stealRating} />
      <RatingBar label="주루" value={attrs.baserunningAggressiveness} />
      <RatingBar label="클러치" value={attrs.clutch} />
      <RatingBar label="풀 경향" value={attrs.pullTendency} />
    </div>
  );
}

// ── pitcher attributes panel ──────────────────────────────────────────────────

function PitcherAttrsPanel({ attrs }: { attrs: PitcherAttributes }) {
  return (
    <>
      <div className="pm-attrs-grid">
        <RatingBar label="컨트롤" value={attrs.control} />
        <RatingBar label="구위" value={attrs.stuff} />
        <RatingBar label="스태미너" value={attrs.stamina} />
        <RatingBar label="정신력" value={attrs.mentalStrength} />
        <RatingBar label="회복력" value={attrs.recovery} />
        <RatingBar label="땅볼 경향" value={attrs.groundBallTendency} />
        <RatingBar label="구질 배합" value={attrs.sequencingSkill} />
        <RatingBar label="견제" value={attrs.holdRunnerRating} />
      </div>
      {attrs.repertoire.length > 0 && (
        <table className="table pm-pitch-table">
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>구종</th>
              <th>구속(km)</th>
              <th>무브먼트</th>
              <th>커맨드</th>
              <th>비율</th>
            </tr>
          </thead>
          <tbody>
            {[...attrs.repertoire]
              .sort((a, b) => b.usageRate - a.usageRate)
              .map((p) => (
                <tr key={p.type}>
                  <td style={{ textAlign: 'left' }}>{PITCH_LABEL[p.type] ?? p.type}</td>
                  <td>{p.velocity}</td>
                  <td>{p.movement}</td>
                  <td>{p.control}</td>
                  <td>{pct(p.usageRate)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      )}
    </>
  );
}

// ── season stats row ──────────────────────────────────────────────────────────

function BatterStatsCells({ stats }: { stats: BatterStatLine }) {
  return (
    <>
      <td>{stats.plateAppearances}</td>
      <td>{avg3(stats.avg)}</td>
      <td>{avg3(stats.obp)}</td>
      <td>{avg3(stats.slg)}</td>
      <td className="pm-highlight">{avg3(stats.ops)}</td>
      <td>{stats.homeRuns}</td>
      <td>{stats.rbi}</td>
      <td>{stats.stolenBases}</td>
      <td>{pct(stats.bbRate)}</td>
      <td>{pct(stats.kRate)}</td>
    </>
  );
}

function PitcherStatsCells({ stats }: { stats: PitcherStatLine }) {
  return (
    <>
      <td className="pm-highlight">{stats.era.toFixed(2)}</td>
      <td>{stats.whip.toFixed(2)}</td>
      <td>{formatIP(stats.inningsPitched)}</td>
      <td>{stats.strikeouts}</td>
      <td>{stats.walks}</td>
      <td>{stats.kPer9.toFixed(1)}</td>
      <td>{stats.bbPer9.toFixed(1)}</td>
      <td>{pct(stats.swingingStrikeRate)}</td>
    </>
  );
}

// ── team name lookup ──────────────────────────────────────────────────────────

function teamNameFromId(franchise: FranchiseState, teamId: string | undefined): string {
  if (!teamId) return '—';
  return franchise.teams.find((t) => t.teamId === teamId)?.name ?? teamId;
}

// ── career stats for this player ─────────────────────────────────────────────

function CareerBattingTable({
  playerId,
  seasonStats,
  franchise,
}: {
  playerId: string;
  seasonStats: SeasonStatsSnapshot[];
  franchise: FranchiseState;
}) {
  const rows = seasonStats
    .filter((s) => s.batting.has(playerId))
    .map((s) => ({ year: s.year, teamId: s.playerTeams.get(playerId), stats: s.batting.get(playerId)! }));

  if (rows.length === 0) return null;

  return (
    <div className="pm-section">
      <h4 className="pm-section-title">역대 타격 기록</h4>
      <div style={{ overflowX: 'auto' }}>
        <table className="table pm-stats-table">
          <thead>
            <tr>
              <th>연도</th>
              <th style={{ textAlign: 'left' }}>팀</th>
              <th>PA</th>
              <th>AVG</th>
              <th>OBP</th>
              <th>SLG</th>
              <th>OPS</th>
              <th>HR</th>
              <th>타점</th>
              <th>도루</th>
              <th>BB%</th>
              <th>K%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ year, teamId, stats }) => (
              <tr key={year}>
                <td>{year}</td>
                <td style={{ textAlign: 'left' }}>{teamNameFromId(franchise, teamId)}</td>
                <BatterStatsCells stats={stats} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CareerPitchingTable({
  playerId,
  seasonStats,
  franchise,
}: {
  playerId: string;
  seasonStats: SeasonStatsSnapshot[];
  franchise: FranchiseState;
}) {
  const rows = seasonStats
    .filter((s) => s.pitching.has(playerId))
    .map((s) => ({ year: s.year, teamId: s.playerTeams.get(playerId), stats: s.pitching.get(playerId)! }));

  if (rows.length === 0) return null;

  return (
    <div className="pm-section">
      <h4 className="pm-section-title">역대 투구 기록</h4>
      <div style={{ overflowX: 'auto' }}>
        <table className="table pm-stats-table">
          <thead>
            <tr>
              <th>연도</th>
              <th style={{ textAlign: 'left' }}>팀</th>
              <th>ERA</th>
              <th>WHIP</th>
              <th>IP</th>
              <th>K</th>
              <th>BB</th>
              <th>K/9</th>
              <th>BB/9</th>
              <th>헛스윙%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ year, teamId, stats }) => (
              <tr key={year}>
                <td>{year}</td>
                <td style={{ textAlign: 'left' }}>{teamNameFromId(franchise, teamId)}</td>
                <PitcherStatsCells stats={stats} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── main modal ────────────────────────────────────────────────────────────────

export interface PlayerModalProps {
  profile: PlayerProfile;
  teamName?: string;
  franchise?: FranchiseState;
  /** Direct stats override — used when no franchise context (e.g. season simulator). */
  overrideSeasonStats?: { year: number; batting?: BatterStatLine; pitching?: PitcherStatLine };
  onClose: () => void;
}

export function PlayerModal({ profile, teamName, franchise, overrideSeasonStats, onClose }: PlayerModalProps) {
  const ovr = overallRating(profile);
  const isBatter = profile.kind === 'batter';
  const attrs = profile.attributes;
  const playerId = profile.playerId;
  const hasProfile = profile.age > 0;

  // Stats: prefer direct override (season sim), fall back to franchise career lookup
  const franchiseLastSeason = !overrideSeasonStats
    ? franchise?.seasonStats.slice().reverse().find((s) => s.batting.has(playerId) || s.pitching.has(playerId))
    : undefined;
  const lastSeasonYear = overrideSeasonStats?.year ?? franchiseLastSeason?.year;
  const lastBatting: BatterStatLine | undefined = overrideSeasonStats?.batting ?? franchiseLastSeason?.batting.get(playerId);
  const lastPitching: PitcherStatLine | undefined = overrideSeasonStats?.pitching ?? franchiseLastSeason?.pitching.get(playerId);

  return (
    <div className="pm-backdrop" onClick={onClose}>
      <div className="pm-modal" onClick={(e) => e.stopPropagation()}>
        {/* close */}
        <button type="button" className="pm-close" onClick={onClose} aria-label="닫기">✕</button>

        {/* header */}
        <div className="pm-header">
          <div className="pm-name-row">
            <span className="pm-name">{attrs.name}</span>
            <span className={`status-badge ${profile.rosterStatus === '1군' ? 'status-active' : profile.rosterStatus === '부상자명단' ? 'status-il' : 'status-minor'}`}>
              {STATUS_LABEL[profile.rosterStatus] ?? profile.rosterStatus}
            </span>
          </div>
          <div className="pm-meta">
            {teamName && <span className="pm-team">{teamName}</span>}
            <span>{isBatter ? (profile.position ?? '?') : (attrs as PitcherAttributes).role === 'starter' ? '선발' : (attrs as PitcherAttributes).role === 'closer' ? '마무리' : (attrs as PitcherAttributes).role === 'setup' ? '셋업' : '불펜'}</span>
            <span>{'throwingHand' in attrs ? (attrs as PitcherAttributes).throwingHand + '투' : ('battingSide' in attrs ? (attrs as BatterAttributes).battingSide + '타' : '')}</span>
          </div>
        </div>

        {/* info chips */}
        <div className="pm-chips">
          <div className="pm-chip">
            <span className="pm-chip-label">OVR</span>
            <span className="pm-chip-value" style={{ color: ratingColor(ovr) }}>{ovr}</span>
          </div>
          {hasProfile && (
            <>
              <div className="pm-chip">
                <span className="pm-chip-label">잠재력</span>
                <span className="pm-chip-value">{potentialGrade(profile.potential)} ({profile.potential})</span>
              </div>
              <div className="pm-chip">
                <span className="pm-chip-label">나이</span>
                <span className="pm-chip-value">{profile.age}세</span>
              </div>
              <div className="pm-chip">
                <span className="pm-chip-label">서비스타임</span>
                <span className="pm-chip-value">{profile.serviceTimeYears}년</span>
              </div>
              <div className="pm-chip">
                <span className="pm-chip-label">계약</span>
                <span className="pm-chip-value">{profile.contract.yearsRemaining}년 / {formatSalary(profile.contract.annualSalary)}</span>
              </div>
              <div className="pm-chip">
                <span className="pm-chip-label">출신</span>
                <span className="pm-chip-value">{ORIGIN_LABEL[profile.origin] ?? profile.origin}</span>
              </div>
            </>
          )}
        </div>

        {/* attributes */}
        <div className="pm-section">
          <h4 className="pm-section-title">능력치</h4>
          {isBatter
            ? <BatterAttrsPanel attrs={attrs as BatterAttributes} />
            : <PitcherAttrsPanel attrs={attrs as PitcherAttributes} />}
        </div>

        {/* latest season stats */}
        {(lastBatting || lastPitching) && (
          <div className="pm-section">
            <h4 className="pm-section-title">{lastSeasonYear ? `${lastSeasonYear}시즌 기록` : '시즌 기록'}</h4>
            {lastBatting && (
              <div style={{ overflowX: 'auto' }}>
                <table className="table pm-stats-table">
                  <thead>
                    <tr>
                      <th>PA</th><th>AVG</th><th>OBP</th><th>SLG</th><th>OPS</th>
                      <th>HR</th><th>타점</th><th>도루</th><th>BB%</th><th>K%</th>
                    </tr>
                  </thead>
                  <tbody><tr><BatterStatsCells stats={lastBatting} /></tr></tbody>
                </table>
              </div>
            )}
            {lastPitching && (
              <div style={{ overflowX: 'auto' }}>
                <table className="table pm-stats-table">
                  <thead>
                    <tr>
                      <th>ERA</th><th>WHIP</th><th>IP</th><th>K</th>
                      <th>BB</th><th>K/9</th><th>BB/9</th><th>헛스윙%</th>
                    </tr>
                  </thead>
                  <tbody><tr><PitcherStatsCells stats={lastPitching} /></tr></tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* career stats */}
        {franchise && franchise.seasonStats.length > 0 && (
          <>
            {isBatter
              ? <CareerBattingTable playerId={playerId} seasonStats={franchise.seasonStats} franchise={franchise} />
              : <CareerPitchingTable playerId={playerId} seasonStats={franchise.seasonStats} franchise={franchise} />}
          </>
        )}

        {franchise && franchise.seasonStats.length === 0 && (
          <p className="description" style={{ marginTop: 16 }}>시즌을 진행하면 기록이 쌓입니다.</p>
        )}
      </div>
    </div>
  );
}
