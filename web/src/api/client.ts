import type { GameResult, LeagueResponse, LeagueTeam, SeasonResponse, WeatherConditions } from './types';

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const message = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${message}`);
  }
  return (await res.json()) as T;
}

export function fetchLeague(seed: number, teamStrengths?: number[]): Promise<LeagueResponse> {
  return postJson<LeagueResponse>('/api/league', { seed, teamStrengths });
}

export function fetchGame(
  league: LeagueTeam[],
  homeTeamId: string,
  awayTeamId: string,
  seed: number,
  weather?: WeatherConditions,
): Promise<GameResult> {
  return postJson<GameResult>('/api/game', { league, homeTeamId, awayTeamId, seed, weather });
}

export function fetchSeason(league: LeagueTeam[], seed: number): Promise<SeasonResponse> {
  return postJson<SeasonResponse>('/api/season', { league, seed });
}

/** Generates a random 32-bit seed for the deterministic simulation RNG. */
export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}
