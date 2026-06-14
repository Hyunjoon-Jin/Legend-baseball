import express from 'express';
import { generateSampleLeague, TEAM_NAMES, TEAM_STRENGTH } from '../data/sampleLeague.js';
import { simulateGame, type GameOptions } from '../engine/gameEngine.js';
import { simulateKboSeason } from '../season/leagueSim.js';
import { computeBattingLeaders, computePitchingLeaders } from '../season/leaderboards.js';
import type { LeagueTeam } from '../types/season.js';
import type { WeatherConditions } from '../types/situation.js';

function mulberry32(seed: number) {
  return function rng() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const app = express();
app.use(express.json({ limit: '10mb' }));

interface LeagueRequestBody {
  seed?: number;
  teamStrengths?: number[];
}

/** Generates a 10-team league, optionally with custom per-team strength multipliers. */
app.post('/api/league', (req, res) => {
  const { seed, teamStrengths } = req.body as LeagueRequestBody;
  const teams = generateSampleLeague(mulberry32(seed ?? Date.now()), teamStrengths);
  res.json({ teams, teamNames: TEAM_NAMES, defaultStrengths: TEAM_STRENGTH });
});

interface GameRequestBody {
  league?: LeagueTeam[];
  homeTeamId?: string;
  awayTeamId?: string;
  seed?: number;
  weather?: WeatherConditions;
}

/** Simulates a single game between two teams from a previously generated league. */
app.post('/api/game', (req, res) => {
  const { league, homeTeamId, awayTeamId, seed, weather } = req.body as GameRequestBody;
  if (!league || !homeTeamId || !awayTeamId) {
    res.status(400).json({ error: 'league, homeTeamId, awayTeamId가 필요합니다.' });
    return;
  }

  const home = league.find((t) => t.id === homeTeamId);
  const away = league.find((t) => t.id === awayTeamId);
  if (!home || !away) {
    res.status(400).json({ error: '존재하지 않는 팀 id입니다.' });
    return;
  }

  const options: GameOptions = weather ? { weather } : {};
  const result = simulateGame(away.setup, home.setup, options, mulberry32(seed ?? Date.now()));
  res.json(result);
});

interface SeasonRequestBody {
  league?: LeagueTeam[];
  seed?: number;
}

/** Simulates a full 144-game KBO-style season + postseason for a previously generated league. */
app.post('/api/season', (req, res) => {
  const { league, seed } = req.body as SeasonRequestBody;
  if (!league) {
    res.status(400).json({ error: 'league가 필요합니다.' });
    return;
  }

  const result = simulateKboSeason(league, {}, mulberry32(seed ?? Date.now()));
  res.json({
    standings: result.standings,
    postseason: result.postseason,
    battingLeaders: computeBattingLeaders(result.battingStats, result.playerNames),
    pitchingLeaders: computePitchingLeaders(result.pitchingStats, result.playerNames),
  });
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
app.listen(PORT, () => {
  console.log(`Legend Baseball API server listening on http://localhost:${PORT}`);
});
