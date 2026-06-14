import { generateSampleLeague } from './data/sampleLeague.js';
import { simulateKboSeason } from './season/leagueSim.js';
import type { PostseasonRoundName } from './types/season.js';
import type { BatterStatLine, PitcherStatLine } from './stats/types.js';

function mulberry32(seed: number) {
  return function rng() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ROUND_LABEL_KO: Record<PostseasonRoundName, string> = {
  wildCard: '와일드카드',
  semiPlayoff: '준플레이오프',
  playoff: '플레이오프',
  koreanSeries: '한국시리즈',
};

const BATTER_QUALIFY_PA = 300;
const PITCHER_QUALIFY_IP = 100;
const LEADER_COUNT = 5;

/** Prints the top `count` qualifying players for one stat category, ranked ascending or descending. */
function printLeaders<T>(
  title: string,
  stats: ReadonlyMap<string, T>,
  playerNames: ReadonlyMap<string, string>,
  qualify: (line: T) => boolean,
  getValue: (line: T) => number,
  format: (value: number) => string,
  order: 'asc' | 'desc',
  count: number,
): void {
  const ranked = [...stats.entries()]
    .filter(([, line]) => qualify(line))
    .sort((a, b) => (order === 'asc' ? getValue(a[1]) - getValue(b[1]) : getValue(b[1]) - getValue(a[1])))
    .slice(0, count);

  console.log(`\n${title}`);
  ranked.forEach(([playerId, line], i) => {
    const name = playerNames.get(playerId) ?? playerId;
    console.log(`  ${String(i + 1).padStart(2)}위  ${name.padEnd(14)}  ${format(getValue(line))}`);
  });
}

// ---------------------------------------------------------------------------
// Generate a 10-team league and simulate a full KBO-style season: a 144-game
// regular season followed by the Wild Card / Semi-PO / PO / Korean Series
// bracket seeded by the final standings.
// ---------------------------------------------------------------------------

const teams = generateSampleLeague(mulberry32(7));
const teamName = new Map(teams.map((t) => [t.id, t.setup.name]));

console.log('Legend Baseball - KBO 144경기 시즌 시뮬레이션\n');
console.log(`${teams.length}개 구단 / 팀당 144경기 (상대 팀별 16경기: 8홈 8어웨이)\n`);

const start = Date.now();
const result = simulateKboSeason(teams, {}, mulberry32(2025));
const elapsedSec = ((Date.now() - start) / 1000).toFixed(1);

console.log(`=== 정규시즌 최종 순위 (${result.games.length}경기 시뮬레이션, ${elapsedSec}초) ===`);
console.log('순위  팀            경기   승   패   무    승률    득점   실점  득실차    GB');
result.standings.forEach((row, i) => {
  const games = row.wins + row.losses + row.ties;
  const diff = row.runsScored - row.runsAllowed;
  const diffStr = diff >= 0 ? `+${diff}` : `${diff}`;
  console.log(
    `${String(i + 1).padStart(2)}    ${teamName.get(row.teamId)!.padEnd(12)} ` +
      `${String(games).padStart(4)} ${String(row.wins).padStart(4)} ${String(row.losses).padStart(4)} ${String(row.ties).padStart(3)}  ` +
      `${row.winPct.toFixed(3).padStart(6)}  ${String(row.runsScored).padStart(5)}  ${String(row.runsAllowed).padStart(5)}  ` +
      `${diffStr.padStart(5)}  ${row.gamesBehind.toFixed(1).padStart(4)}`,
  );
});

console.log('\n=== 포스트시즌 (KBO 방식: 와일드카드 -> 준PO -> PO -> 한국시리즈) ===');

const seeds = result.standings.slice(0, 5).map((row) => row.teamId);
const seedNumber = new Map(seeds.map((teamId, i) => [teamId, i + 1]));

for (const series of result.postseason.series) {
  const higherName = teamName.get(series.higherSeedId)!;
  const lowerName = teamName.get(series.lowerSeedId)!;
  console.log(
    `\n[${ROUND_LABEL_KO[series.round]}] ${seedNumber.get(series.higherSeedId)}위 ${higherName} ` +
      `vs ${seedNumber.get(series.lowerSeedId)}위 ${lowerName}`,
  );

  for (const game of series.games) {
    const homeName = teamName.get(game.homeTeamId)!;
    const awayName = teamName.get(game.awayTeamId)!;
    const outcomeLabel = game.winner === 'tie' ? '무승부' : game.winner === 'home' ? `${homeName} 승` : `${awayName} 승`;
    console.log(`  ${game.gameNumber}차전  ${awayName} ${game.awayRuns} : ${game.homeRuns} ${homeName}  (${outcomeLabel})`);
  }

  const winnerName = teamName.get(series.winnerId)!;
  const advanceLabel = series.round === 'koreanSeries' ? '우승' : '진출';
  console.log(`  -> ${winnerName} ${advanceLabel}`);
}

console.log(`\n*** 한국시리즈 우승: ${teamName.get(result.postseason.championId)!} ***`);

console.log('\n\n=== 개인 타격 순위 (최소 300타석) ===');
printLeaders<BatterStatLine>(
  '-- 타율 (AVG) --', result.battingStats, result.playerNames,
  (l) => l.plateAppearances >= BATTER_QUALIFY_PA, (l) => l.avg, (v) => v.toFixed(3), 'desc', LEADER_COUNT,
);
printLeaders<BatterStatLine>(
  '-- 홈런 (HR) --', result.battingStats, result.playerNames,
  (l) => l.plateAppearances >= BATTER_QUALIFY_PA, (l) => l.homeRuns, (v) => `${v}`, 'desc', LEADER_COUNT,
);
printLeaders<BatterStatLine>(
  '-- 타점 (RBI) --', result.battingStats, result.playerNames,
  (l) => l.plateAppearances >= BATTER_QUALIFY_PA, (l) => l.rbi, (v) => `${v}`, 'desc', LEADER_COUNT,
);
printLeaders<BatterStatLine>(
  '-- OPS --', result.battingStats, result.playerNames,
  (l) => l.plateAppearances >= BATTER_QUALIFY_PA, (l) => l.ops, (v) => v.toFixed(3), 'desc', LEADER_COUNT,
);

console.log('\n=== 개인 투구 순위 (최소 100이닝) ===');
printLeaders<PitcherStatLine>(
  '-- 평균자책점 (ERA) --', result.pitchingStats, result.playerNames,
  (l) => l.inningsPitched >= PITCHER_QUALIFY_IP, (l) => l.era, (v) => v.toFixed(2), 'asc', LEADER_COUNT,
);
printLeaders<PitcherStatLine>(
  '-- 탈삼진 (K) --', result.pitchingStats, result.playerNames,
  (l) => l.inningsPitched >= PITCHER_QUALIFY_IP, (l) => l.strikeouts, (v) => `${v}`, 'desc', LEADER_COUNT,
);
printLeaders<PitcherStatLine>(
  '-- WHIP --', result.pitchingStats, result.playerNames,
  (l) => l.inningsPitched >= PITCHER_QUALIFY_IP, (l) => l.whip, (v) => v.toFixed(2), 'asc', LEADER_COUNT,
);
