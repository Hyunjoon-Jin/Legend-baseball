import { simulateAtBat } from './engine/matchupEngine.js';
import { sampleBatter, samplePitcher, sampleSituation, sampleSituationWithRunners } from './data/samplePlayers.js';
import type { PlateAppearanceResult } from './types/outcome.js';
import { batterStatsToAttributes, pitcherStatsToAttributes } from './mapper/statsToAttributes.js';

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
