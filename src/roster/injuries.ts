import type { PlayerProfile } from '../types/roster.js';
import { INJURY_AGE_RISK_THRESHOLD, INJURY_BASE_PROBABILITY } from './constants.js';
import { weightedChoice } from '../utils/math.js';

/** Extra injury probability per year of age above `INJURY_AGE_RISK_THRESHOLD`. */
const AGE_RISK_PER_YEAR = 0.0004;

/** Extra injury probability at maximum (100) accumulated pitcher fatigue. */
const FATIGUE_RISK_FACTOR = 0.003;

/** Injury severity tiers (경상/중상/대형 부상), as inclusive [minDays, maxDays] ranges. */
const SEVERITY_TIERS: ReadonlyArray<{ minDays: number; maxDays: number }> = [
  { minDays: 5, maxDays: 14 },
  { minDays: 15, maxDays: 35 },
  { minDays: 36, maxDays: 60 },
];

/** Selection weights for `SEVERITY_TIERS`: mostly minor, occasionally severe. */
const SEVERITY_WEIGHTS: readonly number[] = [0.65, 0.25, 0.1];

const INJURY_DESCRIPTIONS: readonly string[] = [
  '햄스트링 부상', '어깨 부상', '손목 부상', '발목 부상', '옆구리 부상', '무릎 부상', '팔꿈치 부상', '등 부상',
];

export interface InjuryEvent {
  playerId: string;
  description: string;
  daysRemaining: number;
}

/** Per-game injury probability: base rate, plus age and accumulated-fatigue risk. */
function injuryProbability(player: PlayerProfile, fatigue: ReadonlyMap<string, number>): number {
  let p = INJURY_BASE_PROBABILITY;
  if (player.age > INJURY_AGE_RISK_THRESHOLD) {
    p += (player.age - INJURY_AGE_RISK_THRESHOLD) * AGE_RISK_PER_YEAR;
  }
  p += ((fatigue.get(player.playerId) ?? 0) / 100) * FATIGUE_RISK_FACTOR;
  return p;
}

/**
 * Rolls a per-game injury chance for each 1군 player (base rate, increased
 * by age past `INJURY_AGE_RISK_THRESHOLD` and by accumulated pitcher
 * fatigue). Injured players move to `'부상자명단'` with a randomly-sized
 * `injury` (5-60 games, weighted toward shorter absences).
 */
export function rollInjuries(roster: readonly PlayerProfile[], fatigue: ReadonlyMap<string, number>, rng: () => number): { roster: PlayerProfile[]; events: InjuryEvent[] } {
  const events: InjuryEvent[] = [];

  const updatedRoster = roster.map((p) => {
    if (p.rosterStatus !== '1군' || rng() >= injuryProbability(p, fatigue)) return p;

    const tier = SEVERITY_TIERS[weightedChoice([...SEVERITY_WEIGHTS], rng)];
    const daysRemaining = tier.minDays + Math.floor(rng() * (tier.maxDays - tier.minDays + 1));
    const description = INJURY_DESCRIPTIONS[Math.floor(rng() * INJURY_DESCRIPTIONS.length)];

    events.push({ playerId: p.playerId, description, daysRemaining });
    return { ...p, rosterStatus: '부상자명단' as const, injury: { description, daysRemaining } };
  });

  return { roster: updatedRoster, events };
}

/**
 * Advances every `'부상자명단'` player's `injury.daysRemaining` by one game.
 * Players reaching 0 recover: back to `'1군'` if there's room under
 * `targetActiveSize`, otherwise `'2군'` to await the next opening.
 */
export function advanceInjuries(roster: readonly PlayerProfile[], targetActiveSize: number): PlayerProfile[] {
  let activeCount = roster.filter((p) => p.rosterStatus === '1군').length;

  return roster.map((p) => {
    if (p.rosterStatus !== '부상자명단' || !p.injury) return p;

    const daysRemaining = p.injury.daysRemaining - 1;
    if (daysRemaining > 0) {
      return { ...p, injury: { ...p.injury, daysRemaining } };
    }

    if (activeCount < targetActiveSize) {
      activeCount++;
      return { ...p, rosterStatus: '1군' as const, injury: undefined };
    }
    return { ...p, rosterStatus: '2군' as const, injury: undefined };
  });
}
