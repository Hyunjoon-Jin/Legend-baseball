import { useEffect, useState } from 'react';
import { fetchLeague, randomSeed } from '../api/client';
import type { LeagueResponse } from '../api/types';

interface Props {
  league: LeagueResponse | null;
  onLeagueChange: (league: LeagueResponse) => void;
}

export function LeagueSetup({ league, onLeagueChange }: Props) {
  const [seed, setSeed] = useState(() => randomSeed());
  const [strengths, setStrengths] = useState<number[]>([]);
  const [teamNames, setTeamNames] = useState<string[]>(league?.teamNames ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (league) return;
    void generate(seed, undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function generate(useSeed: number, useStrengths: number[] | undefined) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchLeague(useSeed, useStrengths);
      setTeamNames(res.teamNames);
      setStrengths(useStrengths ?? res.defaultStrengths);
      onLeagueChange(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function handleStrengthChange(index: number, value: number) {
    setStrengths((prev) => prev.map((v, i) => (i === index ? value : v)));
  }

  return (
    <section className="panel">
      <h2>리그 설정</h2>
      <p className="description">
        10개 구단의 전력을 조정하고 시드를 설정해 리그를 생성하세요. 생성된 리그는 단일 경기/시즌 시뮬레이션에서 그대로 사용됩니다.
      </p>

      <div className="field-row">
        <label>
          시드
          <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value))} />
        </label>
        <button type="button" onClick={() => setSeed(randomSeed())}>
          랜덤 시드
        </button>
        <button type="button" onClick={() => generate(seed, strengths.length ? strengths : undefined)} disabled={loading}>
          {loading ? '생성 중...' : '리그 생성'}
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      {teamNames.length > 0 && (
        <div className="strength-grid">
          {teamNames.map((name, i) => (
            <label key={name} className="strength-slider">
              <span>{name}</span>
              <input
                type="range"
                min={0.85}
                max={1.15}
                step={0.005}
                value={strengths[i] ?? 1}
                onChange={(e) => handleStrengthChange(i, Number(e.target.value))}
              />
              <span className="strength-value">{(strengths[i] ?? 1).toFixed(3)}</span>
            </label>
          ))}
        </div>
      )}

      {league && (
        <table className="table">
          <thead>
            <tr>
              <th>팀명</th>
              <th>전력</th>
              <th>1선발</th>
              <th>1번 타자</th>
            </tr>
          </thead>
          <tbody>
            {league.teams.map((team, i) => (
              <tr key={team.id}>
                <td>{team.setup.name}</td>
                <td>{(strengths[i] ?? 1).toFixed(3)}</td>
                <td>{team.rotation[0]?.name}</td>
                <td>{team.setup.lineup[0]?.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
