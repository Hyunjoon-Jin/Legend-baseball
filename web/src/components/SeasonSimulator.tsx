import { useState } from 'react';
import { fetchSeason, randomSeed } from '../api/client';
import type { LeagueResponse, SeasonResponse } from '../api/types';
import { ROUND_LABEL_KO } from '../labels';

interface Props {
  league: LeagueResponse;
}

export function SeasonSimulator({ league }: Props) {
  const [seed, setSeed] = useState(() => randomSeed());
  const [result, setResult] = useState<SeasonResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const teamName = new Map(league.teams.map((t) => [t.id, t.setup.name]));

  async function handleSimulate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchSeason(league.teams, seed);
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="panel">
      <h2>시즌 시뮬레이션</h2>
      <p className="description">144경기 정규시즌과 KBO 방식 포스트시즌(와일드카드 ~ 한국시리즈)을 한 번에 시뮬레이션합니다.</p>

      <div className="field-row">
        <label>
          시드
          <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value))} />
        </label>
        <button type="button" onClick={() => setSeed(randomSeed())}>
          랜덤 시드
        </button>
        <button type="button" onClick={handleSimulate} disabled={loading}>
          {loading ? '시뮬레이션 중... (몇 초 정도 걸려요)' : '시즌 시뮬레이션'}
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      {result && (
        <>
          <h3>정규시즌 최종 순위</h3>
          <table className="table">
            <thead>
              <tr>
                <th>순위</th>
                <th>팀</th>
                <th>경기</th>
                <th>승</th>
                <th>패</th>
                <th>무</th>
                <th>승률</th>
                <th>득점</th>
                <th>실점</th>
                <th>득실차</th>
                <th>GB</th>
              </tr>
            </thead>
            <tbody>
              {result.standings.map((row, i) => {
                const games = row.wins + row.losses + row.ties;
                const diff = row.runsScored - row.runsAllowed;
                return (
                  <tr key={row.teamId}>
                    <td>{i + 1}</td>
                    <td>{teamName.get(row.teamId) ?? row.teamId}</td>
                    <td>{games}</td>
                    <td>{row.wins}</td>
                    <td>{row.losses}</td>
                    <td>{row.ties}</td>
                    <td>{row.winPct.toFixed(3)}</td>
                    <td>{row.runsScored}</td>
                    <td>{row.runsAllowed}</td>
                    <td>{diff >= 0 ? `+${diff}` : diff}</td>
                    <td>{row.gamesBehind.toFixed(1)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <h3>포스트시즌</h3>
          {result.postseason.series.map((series) => (
            <div key={series.round} className="postseason-series">
              <h4>
                [{ROUND_LABEL_KO[series.round]}] {teamName.get(series.higherSeedId)} vs {teamName.get(series.lowerSeedId)}
              </h4>
              <ul>
                {series.games.map((game) => {
                  const outcome =
                    game.winner === 'tie'
                      ? '무승부'
                      : game.winner === 'home'
                        ? `${teamName.get(game.homeTeamId)} 승`
                        : `${teamName.get(game.awayTeamId)} 승`;
                  return (
                    <li key={game.gameNumber}>
                      {game.gameNumber}차전: {teamName.get(game.awayTeamId)} {game.awayRuns} : {game.homeRuns} {teamName.get(game.homeTeamId)}{' '}
                      ({outcome})
                    </li>
                  );
                })}
              </ul>
              <p>
                → {teamName.get(series.winnerId)} {series.round === 'koreanSeries' ? '우승' : '진출'}
              </p>
            </div>
          ))}
          <p className="champion">한국시리즈 우승: {teamName.get(result.postseason.championId)}</p>

          <h3>개인 타격 순위 (최소 300타석)</h3>
          <div className="leaders-grid">
            <LeaderTable title="타율 (AVG)" entries={result.battingLeaders.avg} format={(v) => v.toFixed(3)} />
            <LeaderTable title="홈런 (HR)" entries={result.battingLeaders.homeRuns} format={(v) => `${v}`} />
            <LeaderTable title="타점 (RBI)" entries={result.battingLeaders.rbi} format={(v) => `${v}`} />
            <LeaderTable title="OPS" entries={result.battingLeaders.ops} format={(v) => v.toFixed(3)} />
          </div>

          <h3>개인 투구 순위 (최소 100이닝)</h3>
          <div className="leaders-grid">
            <LeaderTable title="평균자책점 (ERA)" entries={result.pitchingLeaders.era} format={(v) => v.toFixed(2)} />
            <LeaderTable title="탈삼진 (K)" entries={result.pitchingLeaders.strikeouts} format={(v) => `${v}`} />
            <LeaderTable title="WHIP" entries={result.pitchingLeaders.whip} format={(v) => v.toFixed(2)} />
          </div>
        </>
      )}
    </section>
  );
}

function LeaderTable({
  title,
  entries,
  format,
}: {
  title: string;
  entries: { playerId: string; name: string; value: number }[];
  format: (value: number) => string;
}) {
  return (
    <div>
      <h4>{title}</h4>
      <table className="table">
        <tbody>
          {entries.map((entry, i) => (
            <tr key={entry.playerId}>
              <td>{i + 1}</td>
              <td>{entry.name}</td>
              <td>{format(entry.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
