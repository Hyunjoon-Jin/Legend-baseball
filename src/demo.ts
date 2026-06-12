import { simulateAtBat } from './engine/matchupEngine.js';
import { sampleBatter, samplePitcher, sampleSituation } from './data/samplePlayers.js';
import type { PlateAppearanceResult } from './types/outcome.js';

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
console.log(`결과: ${sample.result} | 진루: ${sample.basesReached} | 추정 득점: ${sample.runsScoredEstimate}`);
if (sample.battedBall) {
  const bb = sample.battedBall;
  console.log(
    `타구: ${bb.type} / ${bb.direction} / EV ${bb.exitVelocity.toFixed(1)}km/h / LA ${bb.launchAngle.toFixed(1)}deg / ${bb.distance.toFixed(1)}m`,
  );
}
