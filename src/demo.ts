import { simulateAtBat } from './engine/matchupEngine.js';
import { simulateHalfInning } from './engine/inningEngine.js';
import { simulateGame } from './engine/gameEngine.js';
import {
  sampleBatter,
  samplePitcher,
  samplePitcherB,
  sampleSituation,
  sampleSituationWithRunners,
  sampleLineupA,
  sampleLineupB,
} from './data/samplePlayers.js';
import type { PlateAppearanceResult } from './types/outcome.js';
import type { GameResult, HalfInningResult, InningPlateAppearance } from './types/game.js';
import { defaultDefense } from './types/baserunning.js';
import { batterStatsToAttributes, pitcherStatsToAttributes } from './mapper/statsToAttributes.js';
import { BatterStatsAggregator, PitcherStatsAggregator } from './stats/aggregator.js';

const N = 20000;
const tally = new Map<PlateAppearanceResult, number>();

for (let i = 0; i < N; i++) {
  const result = simulateAtBat(samplePitcher, sampleBatter, sampleSituation);
  tally.set(result.result, (tally.get(result.result) ?? 0) + 1);
}

console.log(`${samplePitcher.name} (P) vs ${sampleBatter.name} (B) - ${N} 타석 시뮬레이션\n`);

const sorted = [...tally.entries()].sort((a, b) => b[1] - a[1]);
for (const [result, count] of sorted) {
  const pct = ((count / N) * 100).toFixed(2);
  console.log(`${result.padEnd(22)} ${count.toString().padStart(6)}  (${pct}%)`);
}

// Show a single sample at-bat in full pitch-by-pitch detail.
console.log('\n--- 샘플 1타석 상세 ---');
const sample = simulateAtBat(samplePitcher, sampleBatter, sampleSituation);
for (const pitch of sample.pitches) {
  console.log(
    `#${pitch.pitchNumber} ${pitch.pitchType.padEnd(11)} ${pitch.velocity.toFixed(1)}km/h ` +
      `zone(${pitch.zone.row},${pitch.zone.col}) count(${pitch.countBefore.balls}-${pitch.countBefore.strikes}) -> ${pitch.result}`,
  );
}
console.log(`결과: ${sample.result} | 진루: ${sample.basesReached} | 득점: ${sample.runsScored} | 아웃: ${sample.outsRecorded}`);
if (sample.battedBall) {
  const bb = sample.battedBall;
  console.log(
    `타구: ${bb.type} / ${bb.direction} / EV ${bb.exitVelocity.toFixed(1)}km/h / LA ${bb.launchAngle.toFixed(1)}deg / ${bb.distance.toFixed(1)}m`,
  );
}

// Sample at-bat with runners on base, showing stolen base / baserunning detail.
console.log('\n--- 주자 1,2루 상황 샘플 1타석 ---');
const sampleWithRunners = simulateAtBat(samplePitcher, sampleBatter, sampleSituationWithRunners);
for (const pitch of sampleWithRunners.pitches) {
  console.log(
    `#${pitch.pitchNumber} ${pitch.pitchType.padEnd(11)} ${pitch.velocity.toFixed(1)}km/h ` +
      `zone(${pitch.zone.row},${pitch.zone.col}) count(${pitch.countBefore.balls}-${pitch.countBefore.strikes}) -> ${pitch.result}`,
  );
}
console.log(`결과: ${sampleWithRunners.result} | 진루: ${sampleWithRunners.basesReached} | 득점: ${sampleWithRunners.runsScored} | 아웃: ${sampleWithRunners.outsRecorded}`);
console.log('주루 이벤트:', sampleWithRunners.baseRunningEvents);
console.log('최종 주자 상태:', sampleWithRunners.finalRunners);

// Stats mapper: convert real season stat lines into engine ratings.
console.log('\n--- 실제 스탯 -> 능력치 매핑 예시 ---');
const acePitcher = pitcherStatsToAttributes({
  id: 'p999',
  name: '실존투수예시',
  throwingHand: 'L',
  era: 2.98,
  whip: 1.12,
  kPer9: 10.2,
  bbPer9: 2.4,
  hrPer9: 0.6,
  groundBallRate: 0.48,
  avgFastballVelocityKmh: 150,
  inningsPerAppearance: 6.1,
});
console.log(`${acePitcher.name}: control=${acePitcher.control} stuff=${acePitcher.stuff} stamina=${acePitcher.stamina} GB%=${acePitcher.groundBallTendency}`);
console.log('repertoire:', acePitcher.repertoire.map((p) => `${p.type} ${p.velocity}km/h (usage ${(p.usageRate * 100).toFixed(0)}%)`));

const sluggerBatter = batterStatsToAttributes({
  id: 'b999',
  name: '실존타자예시',
  battingSide: 'R',
  avg: 0.301,
  obp: 0.385,
  slg: 0.55,
  kRate: 0.18,
  bbRate: 0.11,
  stolenBases: 12,
  caughtStealing: 3,
  plateAppearances: 620,
});
console.log(
  `${sluggerBatter.name}: power=${sluggerBatter.power} contactVsR=${sluggerBatter.contactVsRight} contactVsL=${sluggerBatter.contactVsLeft} ` +
    `discipline=${sluggerBatter.plateDiscipline} speed=${sluggerBatter.speed} stealRating=${sluggerBatter.stealRating}`,
);

// Stats aggregation: simulate many plate appearances and produce full stat lines.
console.log('\n--- 시즌 누적 스탯 집계 예시 (시뮬레이션 N 타석) ---');
const batterStats = new BatterStatsAggregator(sampleBatter.id);
const pitcherStats = new PitcherStatsAggregator();
for (let i = 0; i < N; i++) {
  const result = simulateAtBat(samplePitcher, sampleBatter, sampleSituation);
  batterStats.addPlateAppearance(result);
  pitcherStats.addPlateAppearance(result);
}

const bLine = batterStats.getStatLine();
console.log(`${sampleBatter.name} (B) - ${bLine.plateAppearances} PA`);
console.log(
  `AVG/OBP/SLG/OPS: ${bLine.avg.toFixed(3)}/${bLine.obp.toFixed(3)}/${bLine.slg.toFixed(3)}/${bLine.ops.toFixed(3)} ` +
    `ISO ${bLine.iso.toFixed(3)} BABIP ${bLine.babip.toFixed(3)}`,
);
console.log(
  `1B ${bLine.singles} 2B ${bLine.doubles} 3B ${bLine.triples} HR ${bLine.homeRuns} ` +
    `BB ${bLine.walks} HBP ${bLine.hitByPitch} K ${bLine.strikeouts} (swing ${bLine.strikeoutsSwinging}/look ${bLine.strikeoutsLooking})`,
);
console.log(
  `K% ${(bLine.kRate * 100).toFixed(1)}% BB% ${(bLine.bbRate * 100).toFixed(1)}% ` +
    `Swing% ${(bLine.swingRate * 100).toFixed(1)}% Contact% ${(bLine.contactRate * 100).toFixed(1)}% ` +
    `Whiff% ${(bLine.whiffRate * 100).toFixed(1)}% Chase% ${(bLine.chaseRate * 100).toFixed(1)}%`,
);
console.log(
  `GB% ${(bLine.groundBallRate * 100).toFixed(1)}% LD% ${(bLine.lineDriveRate * 100).toFixed(1)}% ` +
    `FB% ${(bLine.flyBallRate * 100).toFixed(1)}% PU% ${(bLine.popUpRate * 100).toFixed(1)}% ` +
    `Pull% ${(bLine.pullRate * 100).toFixed(1)}% Cen% ${(bLine.centerRate * 100).toFixed(1)}% Oppo% ${(bLine.oppoRate * 100).toFixed(1)}% ` +
    `HardHit% ${(bLine.hardHitRate * 100).toFixed(1)}% Barrel% ${(bLine.barrelRate * 100).toFixed(1)}%`,
);

const pLine = pitcherStats.getStatLine();
console.log(`\n${samplePitcher.name} (P) - ${pLine.battersFaced} BF, ${pLine.inningsPitched.toFixed(3)} IP`);
console.log(
  `ERA ${pLine.era.toFixed(2)} WHIP ${pLine.whip.toFixed(2)} K/9 ${pLine.kPer9.toFixed(2)} ` +
    `BB/9 ${pLine.bbPer9.toFixed(2)} HR/9 ${pLine.hrPer9.toFixed(2)} K-BB% ${(pLine.kMinusBbRate * 100).toFixed(1)}%`,
);
console.log(
  `Pitches ${pLine.pitchesThrown} Strike% ${(pLine.strikePercentage * 100).toFixed(1)}% ` +
    `F-Strike% ${(pLine.firstPitchStrikePercentage * 100).toFixed(1)}% SwStr% ${(pLine.swingingStrikeRate * 100).toFixed(1)}% ` +
    `CStr% ${(pLine.calledStrikeRate * 100).toFixed(1)}%`,
);
console.log(
  `GB% ${(pLine.groundBallRate * 100).toFixed(1)}% LD% ${(pLine.lineDriveRate * 100).toFixed(1)}% ` +
    `FB% ${(pLine.flyBallRate * 100).toFixed(1)}% PU% ${(pLine.popUpRate * 100).toFixed(1)}%`,
);

// ---------------------------------------------------------------------------
// Inning / game level simulation
// ---------------------------------------------------------------------------

const RESULT_LABEL_KO: Record<PlateAppearanceResult, string> = {
  strikeoutSwinging: '삼진(스윙)',
  strikeoutLooking: '삼진(루킹)',
  walk: '볼넷',
  intentionalWalk: '고의4구',
  hitByPitch: '몸에 맞는 볼',
  single: '안타',
  infieldSingle: '내야안타',
  double: '2루타',
  triple: '3루타',
  homeRun: '홈런',
  insideTheParkHomeRun: '인사이드파크 홈런',
  groundOut: '땅볼 아웃',
  flyOut: '뜬공 아웃',
  lineOut: '직선타 아웃',
  popOut: '인필드 플라이',
  doublePlay: '병살타',
  triplePlay: '삼중살',
  sacrificeFly: '희생플라이',
  sacrificeBunt: '희생번트',
  fieldersChoice: '야수선택',
  reachedOnError: '실책으로 출루',
  catcherInterference: '포수 방해',
  inningEndingCaughtStealing: '도루 실패 (이닝 종료)',
};

function formatPlateAppearance(pa: InningPlateAppearance): string {
  const label = RESULT_LABEL_KO[pa.atBat.result];
  const runsNote = pa.atBat.runsScored > 0 ? `, ${pa.atBat.runsScored}득점` : '';
  return `  ${pa.lineupIndex + 1}번 ${pa.batter.name.padEnd(4)} : ${label}${runsNote} (${pa.outsAfter}아웃, 누적 ${pa.runsAfter}점)`;
}

function printHalfInning(result: HalfInningResult, teamLabel: string, detailed: boolean): void {
  const header = `${result.inning}회 ${result.half === 'top' ? '초' : '말'} (${teamLabel})`;
  if (detailed) {
    console.log(`\n--- ${header} ---`);
    for (const pa of result.plateAppearances) {
      console.log(formatPlateAppearance(pa));
    }
  }
  const walkOffNote = result.endedByWalkOff ? ' / 끝내기!' : '';
  console.log(
    `${detailed ? '=>' : header + ':'} ${result.runsScored}득점 ${result.hits}안타 ${result.walks}볼넷 ` +
      `${result.strikeouts}삼진 / 잔루 ${result.leftOnBase} / 투구수 ${result.pitchesThrown}${walkOffNote}`,
  );
}

console.log('\n--- 이닝 단위 시뮬레이션: 1회 초 상세 ---');
const firstInning = simulateHalfInning({
  inning: 1,
  half: 'top',
  lineup: sampleLineupA,
  pitcher: samplePitcherB,
  defense: defaultDefense,
});
printHalfInning(firstInning, '어웨이 공격', true);

function printLineScore(game: GameResult): void {
  const innings = game.lineScore.away.length;
  const inningHeader = Array.from({ length: innings }, (_, i) => `${i + 1}`.padStart(3)).join('');
  console.log(`\n       ${inningHeader}   R`);
  const awayRow = game.lineScore.away.map((r) => `${r}`.padStart(3)).join('');
  const homeCells = game.lineScore.home.map((r) => `${r}`.padStart(3));
  while (homeCells.length < innings) homeCells.push('  X');
  console.log(`어웨이 ${awayRow}  ${`${game.finalScore.away}`.padStart(2)}`);
  console.log(`홈     ${homeCells.join('')}  ${`${game.finalScore.home}`.padStart(2)}`);
}

console.log('\n\n--- 9이닝 경기 시뮬레이션 (이닝별 요약 + 라인스코어) ---');
const game = simulateGame(
  { name: '어웨이', lineup: sampleLineupA, pitcher: samplePitcherB, defense: defaultDefense },
  { name: '홈', lineup: sampleLineupB, pitcher: samplePitcher, defense: defaultDefense },
);

for (const half of game.halfInnings) {
  printHalfInning(half, half.half === 'top' ? '어웨이 공격' : '홈 공격', false);
}

printLineScore(game);

const winnerLabel = game.winner === 'away' ? '어웨이 승리' : game.winner === 'home' ? '홈 승리' : '무승부';
const lastHalf = game.halfInnings[game.halfInnings.length - 1];
console.log(
  `\n최종 스코어: 어웨이 ${game.finalScore.away} : 홈 ${game.finalScore.home} (${winnerLabel}` +
    `${lastHalf.endedByWalkOff ? ', 끝내기' : ''}) - 총 ${game.totalInnings}이닝`,
);
