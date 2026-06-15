import { simulateGame, type TeamSetup, type GameOptions } from './engine/gameEngine.js';
import {
  samplePitcher,
  samplePitcherB,
  sampleLineupA,
  sampleLineupB,
  sampleBenchA,
  sampleBenchB,
  sampleBullpenA,
  sampleBullpenB,
} from './data/samplePlayers.js';
import { defaultDefense } from './types/baserunning.js';
import { defaultWeather, type WeatherConditions } from './types/situation.js';
import type { SubstitutionType } from './types/game.js';
import { BatterStatsAggregator, PitcherStatsAggregator } from './stats/aggregator.js';
import { defaultLeagueBaselines, type StatBaseline } from './mapper/leagueBaselines.js';

function mulberry32(seed: number) {
  return function rng() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const away: TeamSetup = {
  name: '어웨이',
  lineup: sampleLineupA,
  bench: sampleBenchA,
  pitcher: samplePitcherB,
  bullpen: sampleBullpenB,
  defense: defaultDefense,
};
const home: TeamSetup = {
  name: '홈',
  lineup: sampleLineupB,
  bench: sampleBenchB,
  pitcher: samplePitcher,
  bullpen: sampleBullpenA,
  defense: defaultDefense,
};

interface SeasonSummary {
  games: number;
  awayWins: number;
  homeWins: number;
  ties: number;
  totalAwayRuns: number;
  totalHomeRuns: number;
  extraInningGames: number;
  walkOffGames: number;
  totalInnings: number;
  substitutions: Record<SubstitutionType, number>;
  lateSubstitutions: Record<SubstitutionType, number>;
  batting: BatterStatsAggregator;
  pitching: PitcherStatsAggregator;
}

/**
 * Simulates many full games back-to-back and accumulates league-wide
 * batting/pitching stat lines plus game-flow and substitution counts, so
 * the simulation's overall behavior can be checked against realistic
 * baselines rather than judged from a single game.
 */
function simulateSeason(games: number, options: GameOptions, rng: () => number): SeasonSummary {
  const regulationInnings = options.regulationInnings ?? 9;
  const summary: SeasonSummary = {
    games,
    awayWins: 0,
    homeWins: 0,
    ties: 0,
    totalAwayRuns: 0,
    totalHomeRuns: 0,
    extraInningGames: 0,
    walkOffGames: 0,
    totalInnings: 0,
    substitutions: { pitchingChange: 0, pinchHitter: 0, pinchRunner: 0 },
    lateSubstitutions: { pitchingChange: 0, pinchHitter: 0, pinchRunner: 0 },
    batting: new BatterStatsAggregator('league'),
    pitching: new PitcherStatsAggregator(),
  };

  for (let i = 0; i < games; i++) {
    const result = simulateGame(away, home, options, rng);

    if (result.winner === 'away') summary.awayWins++;
    else if (result.winner === 'home') summary.homeWins++;
    else summary.ties++;

    summary.totalAwayRuns += result.finalScore.away;
    summary.totalHomeRuns += result.finalScore.home;
    summary.totalInnings += result.totalInnings;
    if (result.totalInnings > regulationInnings) summary.extraInningGames++;

    const lastHalf = result.halfInnings[result.halfInnings.length - 1];
    if (lastHalf.endedByWalkOff) summary.walkOffGames++;

    for (const half of result.halfInnings) {
      for (const pa of half.plateAppearances) {
        summary.batting.addPlateAppearance(pa.atBat);
        summary.pitching.addPlateAppearance(pa.atBat);
      }
    }

    for (const sub of result.substitutions) {
      summary.substitutions[sub.type] += 1;
      if (sub.inning >= 7) summary.lateSubstitutions[sub.type] += 1;
    }
  }

  return summary;
}

const SUB_LABEL_KO: Record<SubstitutionType, string> = {
  pitchingChange: '투수교체',
  pinchHitter: '대타',
  pinchRunner: '대주자',
};

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function compareLine(
  label: string,
  sim: number,
  baseline: StatBaseline,
  opts: { digits?: number; percent?: boolean } = {},
): string {
  const { digits = 3, percent = false } = opts;
  const fmt = (v: number) => (percent ? pct(v) : v.toFixed(digits));
  const z = (sim - baseline.mean) / baseline.sd;
  const zStr = `${z >= 0 ? '+' : ''}${z.toFixed(2)}`;
  return `  ${label.padEnd(6)} 시뮬 ${fmt(sim).padStart(7)}  KBO평균 ${fmt(baseline.mean).padStart(7)}  (z ${zStr})`;
}

function printGameFlowReport(summary: SeasonSummary): void {
  const { games } = summary;
  console.log(`\n=== 경기 흐름 (${games}경기) ===`);
  console.log(
    `전적        어웨이 ${summary.awayWins}승 / 홈 ${summary.homeWins}승 / 무승부 ${summary.ties} ` +
      `(어웨이 승률 ${pct(summary.awayWins / games)}, 홈 승률 ${pct(summary.homeWins / games)})`,
  );
  console.log(
    `평균 득점   어웨이 ${(summary.totalAwayRuns / games).toFixed(2)} / 홈 ${(summary.totalHomeRuns / games).toFixed(2)} ` +
      `/ 합계 ${((summary.totalAwayRuns + summary.totalHomeRuns) / games).toFixed(2)}`,
  );
  console.log(
    `평균 이닝   ${(summary.totalInnings / games).toFixed(2)} ` +
      `/ 연장 ${summary.extraInningGames}경기 (${pct(summary.extraInningGames / games)}) ` +
      `/ 끝내기 ${summary.walkOffGames}경기 (${pct(summary.walkOffGames / games)})`,
  );
}

function printBattingReport(summary: SeasonSummary): void {
  const line = summary.batting.getStatLine();
  const b = defaultLeagueBaselines.batter;
  const opsBaseline: StatBaseline = {
    mean: b.obp.mean + b.slg.mean,
    sd: Math.sqrt(b.obp.sd ** 2 + b.slg.sd ** 2),
  };

  console.log('\n=== 타격 (시뮬레이션 vs KBO 평균) ===');
  console.log(
    `표본       PA ${line.plateAppearances} / AB ${line.atBats} / H ${line.hits} / HR ${line.homeRuns} ` +
      `/ BB ${line.walks} / K ${line.strikeouts}`,
  );
  console.log(compareLine('AVG', line.avg, b.avg));
  console.log(compareLine('OBP', line.obp, b.obp));
  console.log(compareLine('SLG', line.slg, b.slg));
  console.log(compareLine('OPS', line.ops, opsBaseline));
  console.log(compareLine('ISO', line.iso, b.iso));
  console.log(compareLine('K%', line.kRate, b.kRate, { percent: true }));
  console.log(compareLine('BB%', line.bbRate, b.bbRate, { percent: true }));
}

function printPitchingReport(summary: SeasonSummary): void {
  const line = summary.pitching.getStatLine();
  const p = defaultLeagueBaselines.pitcher;

  console.log('\n=== 투구 (시뮬레이션 vs KBO 평균) ===');
  console.log(
    `표본       BF ${line.battersFaced} / IP ${line.inningsPitched.toFixed(1)} / H ${line.hits} / HR ${line.homeRuns} ` +
      `/ BB ${line.walks} / K ${line.strikeouts} / ER ${line.earnedRuns}`,
  );
  console.log(compareLine('ERA', line.era, p.era, { digits: 2 }));
  console.log(compareLine('WHIP', line.whip, p.whip, { digits: 2 }));
  console.log(compareLine('K/9', line.kPer9, p.kPer9, { digits: 2 }));
  console.log(compareLine('BB/9', line.bbPer9, p.bbPer9, { digits: 2 }));
  console.log(compareLine('HR/9', line.hrPer9, p.hrPer9, { digits: 2 }));
  console.log(compareLine('GB%', line.groundBallRate, p.groundBallRate, { percent: true }));
}

function printSubstitutionReport(summary: SeasonSummary): void {
  console.log('\n=== 선수 교체 (경기당 평균) ===');
  for (const type of Object.keys(SUB_LABEL_KO) as SubstitutionType[]) {
    const total = summary.substitutions[type];
    const late = summary.lateSubstitutions[type];
    const latePct = total > 0 ? pct(late / total) : '-';
    console.log(
      `  ${SUB_LABEL_KO[type].padEnd(6)} 경기당 ${(total / summary.games).toFixed(2)}회 ` +
        `/ 7회 이후 비중 ${latePct} (${late}/${total})`,
    );
  }
}

function printWeatherSensitivity(gamesPerBatch: number, rng: () => number): void {
  console.log(`\n=== 날씨별 민감도 비교 (배치당 ${gamesPerBatch}경기) ===`);

  const scenarios: { label: string; weather: WeatherConditions }[] = [
    { label: '한파(2C)', weather: { ...defaultWeather, temperatureC: 2 } },
    { label: '평년(22C)', weather: { ...defaultWeather, temperatureC: 22 } },
    { label: '폭염(35C)', weather: { ...defaultWeather, temperatureC: 35 } },
  ];

  for (const { label, weather } of scenarios) {
    const summary = simulateSeason(gamesPerBatch, { weather }, rng);
    const battingLine = summary.batting.getStatLine();
    const pitchingLine = summary.pitching.getStatLine();
    const runsPerGame = (summary.totalAwayRuns + summary.totalHomeRuns) / summary.games;
    const hrPerGame = battingLine.homeRuns / summary.games;
    const changesPerGame = summary.substitutions.pitchingChange / summary.games;
    console.log(
      `  ${label.padEnd(10)} 경기당 득점 ${runsPerGame.toFixed(2)} / 경기당 HR ${hrPerGame.toFixed(2)} ` +
        `/ 경기당 투수교체 ${changesPerGame.toFixed(2)} / ERA ${pitchingLine.era.toFixed(2)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Run the season simulation and print all reports.
// ---------------------------------------------------------------------------

const SEASON_GAMES = 100;
const WEATHER_BATCH_GAMES = 40;

console.log('Legend Baseball - 시즌 시뮬레이션 정교함 검증\n');
console.log('=== 팀 구성 ===');
console.log(
  `어웨이: 선발 ${away.pitcher.name} / 라인업 ${away.lineup.length}명 / 벤치 ${away.bench?.length ?? 0}명 / 불펜 ${away.bullpen?.length ?? 0}명`,
);
console.log(
  `홈    : 선발 ${home.pitcher.name} / 라인업 ${home.lineup.length}명 / 벤치 ${home.bench?.length ?? 0}명 / 불펜 ${home.bullpen?.length ?? 0}명`,
);

const seasonRng = mulberry32(2024);
const seasonSummary = simulateSeason(SEASON_GAMES, {}, seasonRng);

printGameFlowReport(seasonSummary);
printBattingReport(seasonSummary);
printPitchingReport(seasonSummary);
printSubstitutionReport(seasonSummary);

const weatherRng = mulberry32(99);
printWeatherSensitivity(WEATHER_BATCH_GAMES, weatherRng);
