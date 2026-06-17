import { useState } from 'react';
import { fetchGame, randomSeed } from '../api/client';
import type { GameResult, InningPlateAppearance, LeagueResponse, WeatherConditions } from '../api/types';
import { buildBattingBoxScore, buildPitchingBoxScore, formatAvg, type BattingBoxScoreRow, type PitchingBoxScoreRow } from '../boxscore';
import { buildPitcherPitchStats } from '../pitchStats';
import { PITCH_RESULT_LABEL_KO, PITCH_TYPE_LABEL_KO, RESULT_LABEL_KO, SUBSTITUTION_LABEL_KO, WIND_DIRECTION_LABEL_KO } from '../labels';
import { StrikeZoneGrid, StrikeZoneLegend } from './StrikeZoneGrid';
import { PitchStatsPanel } from './PitchStatsPanel';

interface Props {
  league: LeagueResponse;
}

const DEFAULT_WEATHER: WeatherConditions = { temperatureC: 22, windSpeedKmh: 0, windDirection: 'none', humidity: 50, altitude: 50 };

export function GameSimulator({ league }: Props) {
  const [awayTeamId, setAwayTeamId] = useState(league.teams[0].id);
  const [homeTeamId, setHomeTeamId] = useState(league.teams[1]?.id ?? league.teams[0].id);
  const [seed, setSeed] = useState(() => randomSeed());
  const [useCustomWeather, setUseCustomWeather] = useState(false);
  const [weather, setWeather] = useState<WeatherConditions>(DEFAULT_WEATHER);
  const [result, setResult] = useState<GameResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const homeName = league.teams.find((t) => t.id === homeTeamId)?.setup.name ?? homeTeamId;
  const awayName = league.teams.find((t) => t.id === awayTeamId)?.setup.name ?? awayTeamId;
  const sameTeam = homeTeamId === awayTeamId;

  async function handleSimulate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchGame(league.teams, homeTeamId, awayTeamId, seed, useCustomWeather ? weather : undefined);
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="panel">
      <h2>단일 경기 시뮬레이션</h2>

      <div className="field-row">
        <label>
          어웨이팀
          <select value={awayTeamId} onChange={(e) => setAwayTeamId(e.target.value)}>
            {league.teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.setup.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          홈팀
          <select value={homeTeamId} onChange={(e) => setHomeTeamId(e.target.value)}>
            {league.teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.setup.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          시드
          <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value))} />
        </label>
        <button type="button" onClick={() => setSeed(randomSeed())}>
          랜덤 시드
        </button>
      </div>

      <div className="field-row">
        <label className="checkbox">
          <input type="checkbox" checked={useCustomWeather} onChange={(e) => setUseCustomWeather(e.target.checked)} />
          날씨 직접 설정
        </label>
        {useCustomWeather && (
          <>
            <label>
              온도 (°C)
              <input
                type="number"
                value={weather.temperatureC}
                onChange={(e) => setWeather({ ...weather, temperatureC: Number(e.target.value) })}
              />
            </label>
            <label>
              풍속 (km/h)
              <input
                type="number"
                min={0}
                value={weather.windSpeedKmh}
                onChange={(e) => setWeather({ ...weather, windSpeedKmh: Number(e.target.value) })}
              />
            </label>
            <label>
              풍향
              <select
                value={weather.windDirection}
                onChange={(e) => setWeather({ ...weather, windDirection: e.target.value as WeatherConditions['windDirection'] })}
              >
                {Object.entries(WIND_DIRECTION_LABEL_KO).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              습도 (%)
              <input
                type="number"
                min={0}
                max={100}
                value={weather.humidity}
                onChange={(e) => setWeather({ ...weather, humidity: Number(e.target.value) })}
              />
            </label>
          </>
        )}
      </div>

      <button type="button" onClick={handleSimulate} disabled={loading || sameTeam}>
        {loading ? '시뮬레이션 중...' : '경기 시뮬레이션'}
      </button>
      {sameTeam && <p className="error">홈팀과 어웨이팀은 서로 달라야 합니다.</p>}
      {error && <p className="error">{error}</p>}

      {result && <GameResultView result={result} homeName={homeName} awayName={awayName} />}
    </section>
  );
}

function GameResultView({ result, homeName, awayName }: { result: GameResult; homeName: string; awayName: string }) {
  const innings = Math.max(result.lineScore.away.length, result.lineScore.home.length);
  const winnerLabel = result.winner === 'tie' ? '무승부' : result.winner === 'home' ? `${homeName} 승` : `${awayName} 승`;

  const awayBatting = buildBattingBoxScore(result.halfInnings, 'top');
  const homeBatting = buildBattingBoxScore(result.halfInnings, 'bottom');
  const homePitching = buildPitchingBoxScore(result.halfInnings, 'top');
  const awayPitching = buildPitchingBoxScore(result.halfInnings, 'bottom');
  const homePitchStats = buildPitcherPitchStats(result.halfInnings, 'top');
  const awayPitchStats = buildPitcherPitchStats(result.halfInnings, 'bottom');

  return (
    <div className="result">
      <h3>
        {awayName} {result.finalScore.away} : {result.finalScore.home} {homeName} ({winnerLabel})
      </h3>

      <table className="table line-score">
        <thead>
          <tr>
            <th>팀</th>
            {Array.from({ length: innings }, (_, i) => (
              <th key={i}>{i + 1}</th>
            ))}
            <th>R</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{awayName}</td>
            {Array.from({ length: innings }, (_, i) => (
              <td key={i}>{result.lineScore.away[i] ?? ''}</td>
            ))}
            <td>{result.finalScore.away}</td>
          </tr>
          <tr>
            <td>{homeName}</td>
            {Array.from({ length: innings }, (_, i) => (
              <td key={i}>{result.lineScore.home[i] ?? ''}</td>
            ))}
            <td>{result.finalScore.home}</td>
          </tr>
        </tbody>
      </table>

      <div className="boxscore-grid">
        <BattingBoxScoreTable title={`${awayName} 타격`} rows={awayBatting} />
        <BattingBoxScoreTable title={`${homeName} 타격`} rows={homeBatting} />
        <PitchingBoxScoreTable title={`${homeName} 투구`} rows={homePitching} />
        <PitchingBoxScoreTable title={`${awayName} 투구`} rows={awayPitching} />
      </div>

      <div className="pitch-stats-grid">
        <PitchStatsPanel title={`${homeName} 투구 분석`} stats={homePitchStats} />
        <PitchStatsPanel title={`${awayName} 투구 분석`} stats={awayPitchStats} />
      </div>

      {result.substitutions.length > 0 && (
        <div className="substitutions">
          <h4>선수 교체</h4>
          <ul>
            {result.substitutions.map((sub, i) => (
              <li key={i}>
                {sub.inning}회{sub.half === 'top' ? '초' : '말'} - {SUBSTITUTION_LABEL_KO[sub.type]}: {sub.outgoing.name} → {sub.incoming.name} (
                {sub.reason})
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="play-by-play">
        <h4>이닝별 플레이 로그</h4>
        {result.halfInnings.map((half, i) => (
          <details key={i}>
            <summary>
              {half.inning}회{half.half === 'top' ? '초' : '말'} ({half.half === 'top' ? awayName : homeName}) - {half.runsScored}점{' '}
              {half.hits}안타
            </summary>
            <ul>
              {half.plateAppearances.map((pa, j) => (
                <li key={j}>
                  <PlateAppearanceDetail pa={pa} />
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </div>
  );
}

function PlateAppearanceDetail({ pa }: { pa: InningPlateAppearance }) {
  const pitches = pa.atBat.pitches;
  const summaryText = `${pa.batter.name} vs ${pa.pitcher.name}: ${RESULT_LABEL_KO[pa.atBat.result]}${
    pa.atBat.runsScored > 0 ? ` (${pa.atBat.runsScored}점 득점)` : ''
  }`;

  if (pitches.length === 0) {
    return <span>{summaryText}</span>;
  }

  return (
    <details className="pa-detail">
      <summary>{summaryText}</summary>
      <div className="pa-detail-body">
        <StrikeZoneGrid pitches={pitches} size={160} />
        <div>
          <StrikeZoneLegend results={pitches.map((p) => p.result)} />
          <ol className="pitch-sequence-list">
            {pitches.map((p) => (
              <li key={p.pitchNumber}>
                {p.countBefore.balls}-{p.countBefore.strikes} {PITCH_TYPE_LABEL_KO[p.pitchType]} {p.velocity.toFixed(0)}km/h -{' '}
                {PITCH_RESULT_LABEL_KO[p.result]}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </details>
  );
}

function BattingBoxScoreTable({ title, rows }: { title: string; rows: BattingBoxScoreRow[] }) {
  return (
    <div>
      <h4>{title}</h4>
      <table className="table">
        <thead>
          <tr>
            <th>선수</th>
            <th>PA</th>
            <th>AB</th>
            <th>H</th>
            <th>HR</th>
            <th>RBI</th>
            <th>BB</th>
            <th>K</th>
            <th>AVG</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.playerId}>
              <td>{r.name}</td>
              <td>{r.pa}</td>
              <td>{r.ab}</td>
              <td>{r.h}</td>
              <td>{r.hr}</td>
              <td>{r.rbi}</td>
              <td>{r.bb}</td>
              <td>{r.k}</td>
              <td>{formatAvg(r.avg)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PitchingBoxScoreTable({ title, rows }: { title: string; rows: PitchingBoxScoreRow[] }) {
  return (
    <div>
      <h4>{title}</h4>
      <table className="table">
        <thead>
          <tr>
            <th>투수</th>
            <th>IP</th>
            <th>H</th>
            <th>R</th>
            <th>BB</th>
            <th>K</th>
            <th>HR</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.playerId}>
              <td>{r.name}</td>
              <td>{r.ip.toFixed(1)}</td>
              <td>{r.h}</td>
              <td>{r.r}</td>
              <td>{r.bb}</td>
              <td>{r.k}</td>
              <td>{r.hr}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
