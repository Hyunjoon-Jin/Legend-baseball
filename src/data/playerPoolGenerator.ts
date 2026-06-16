import type { BatterAttributes, PitcherAttributes, PitchType, PitchRepertoireEntry, PitcherRole } from '../types/player.js';
import type { PlayerProfile, Position } from '../types/roster.js';
import {
  samplePitcher,
  samplePitcherB,
  sampleLineupA,
  sampleLineupB,
  sampleBenchA,
  sampleBenchB,
  sampleBullpenA,
  sampleBullpenB,
} from './samplePlayers.js';
import { PITCH_TYPE_GROUNDBALL_PULL } from './constants.js';
import {
  generateKoreanName,
  generateForeignName,
  generateAsiaQuotaName,
  FOREIGN_NATIONALITIES,
  ASIA_QUOTA_NATIONALITIES,
} from './nameGenerator.js';
import { batterOverallRating, pitcherOverallRating } from '../roster/rating.js';
import { ACTIVE_ROSTER_SIZE, FA_ELIGIBILITY_YEARS } from '../roster/constants.js';
import { clamp, sampleNormal } from '../utils/math.js';

/**
 * Generates a full 65-player pool (33 batters + 32 pitchers) per team, with
 * positions, ages, growth potential, and globally-unique player IDs. This is
 * the foundation for the 1군/2군 roster system; `sampleLeague.ts`'s 19-player
 * generation remains untouched and will be migrated separately.
 */

const POSITIONS: readonly Position[] = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];

/** Roster depth (player count) per position. Sums to 33 (6*4 + 3*3). */
const POSITION_DEPTH: Record<Position, number> = {
  C: 4, '1B': 4, '2B': 4, '3B': 4, SS: 4,
  LF: 4, CF: 3, RF: 3, DH: 3,
};

/** Position assigned to each batter in `sampleLineupA`, in order. */
const TEMPLATE_A_LINEUP_POSITIONS: readonly Position[] = ['CF', 'SS', 'LF', '1B', 'DH', '3B', 'C', '2B', 'RF'];

/** Position assigned to each batter in `sampleLineupB`, in order. */
const TEMPLATE_B_LINEUP_POSITIONS: readonly Position[] = ['CF', 'SS', 'LF', '1B', 'DH', '3B', '2B', 'C', 'RF'];

/** Position assigned to each bench batter (both templates): first bench player -> LF depth, second -> CF depth. */
const TEMPLATE_BENCH_POSITIONS: readonly Position[] = ['LF', 'CF'];

/** Relative strength of each rotation slot (ace down to back-end starter), applied on top of team strength. */
const ROTATION_STRENGTH: readonly number[] = [1.05, 1.02, 1.0, 0.97, 0.94];

interface TeamTemplate {
  lineup: readonly BatterAttributes[];
  lineupPositions: readonly Position[];
  bench: readonly BatterAttributes[];
  benchPositions: readonly Position[];
  ace: PitcherAttributes;
  bullpen: readonly PitcherAttributes[];
}

const TEMPLATES: readonly TeamTemplate[] = [
  {
    lineup: sampleLineupA,
    lineupPositions: TEMPLATE_A_LINEUP_POSITIONS,
    bench: sampleBenchA,
    benchPositions: TEMPLATE_BENCH_POSITIONS,
    ace: samplePitcher,
    bullpen: sampleBullpenA,
  },
  {
    lineup: sampleLineupB,
    lineupPositions: TEMPLATE_B_LINEUP_POSITIONS,
    bench: sampleBenchB,
    benchPositions: TEMPLATE_BENCH_POSITIONS,
    ace: samplePitcherB,
    bullpen: sampleBullpenB,
  },
];

type BatterScalableField =
  | 'contactVsRight'
  | 'contactVsLeft'
  | 'power'
  | 'plateDiscipline'
  | 'badBallHitting'
  | 'speed'
  | 'stealRating'
  | 'baserunningAggressiveness'
  | 'pullTendency'
  | 'clutch';

type PitcherScalableField =
  | 'control'
  | 'stuff'
  | 'stamina'
  | 'mentalStrength'
  | 'recovery'
  | 'groundBallTendency'
  | 'sequencingSkill'
  | 'holdRunnerRating';

const BATTER_SCALABLE_FIELDS: readonly BatterScalableField[] = [
  'contactVsRight', 'contactVsLeft', 'power', 'plateDiscipline', 'badBallHitting',
  'speed', 'stealRating', 'baserunningAggressiveness', 'pullTendency', 'clutch',
];

const PITCHER_SCALABLE_FIELDS: readonly PitcherScalableField[] = [
  'control', 'stuff', 'stamina', 'mentalStrength', 'recovery',
  'groundBallTendency', 'sequencingSkill', 'holdRunnerRating',
];

/** Extra pitch types procedural pitchers may add on top of a guaranteed four-seam. */
const PITCH_POOL: readonly PitchType[] = ['slider', 'changeup', 'curve', 'sinker', 'twoSeam', 'cutter', 'splitter', 'knuckleCurve'];

const FASTBALL_TYPES: readonly PitchType[] = ['fourSeam', 'twoSeam', 'sinker', 'cutter'];

function clampRating(value: number): number {
  return clamp(Math.round(value), 1, 99);
}

function clampVelocity(value: number): number {
  return clamp(Math.round(value), 100, 170);
}

function jitter(rng: () => number, spread: number): number {
  return (rng() * 2 - 1) * spread;
}

function scaleBatterAttributes(template: BatterAttributes, id: string, name: string, strength: number, rng: () => number): BatterAttributes {
  const overrides = {} as Record<BatterScalableField, number>;
  for (const field of BATTER_SCALABLE_FIELDS) {
    overrides[field] = clampRating(template[field] * strength + jitter(rng, 4));
  }
  return { ...template, id, name, ...overrides };
}

function scalePitcherAttributes(template: PitcherAttributes, id: string, name: string, strength: number, rng: () => number, role?: PitcherRole): PitcherAttributes {
  const overrides = {} as Record<PitcherScalableField, number>;
  for (const field of PITCHER_SCALABLE_FIELDS) {
    overrides[field] = clampRating(template[field] * strength + jitter(rng, 4));
  }
  const repertoire = template.repertoire.map((pitch) => ({
    ...pitch,
    velocity: clampVelocity(pitch.velocity * strength + jitter(rng, 2)),
    movement: clampRating(pitch.movement * strength + jitter(rng, 4)),
    control: clampRating(pitch.control * strength + jitter(rng, 4)),
  }));
  return { ...template, id, name, ...overrides, repertoire, role: role ?? template.role };
}

/** Builds a 2-4 pitch repertoire (always including a four-seam) for a procedurally generated pitcher. */
function randomRepertoire(baseline: number, strength: number, rng: () => number): PitchRepertoireEntry[] {
  const count = 2 + Math.floor(rng() * 3); // 2-4 pitches
  const pool = [...PITCH_POOL];
  const types: PitchType[] = ['fourSeam'];
  while (types.length < count && pool.length > 0) {
    types.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  }
  const rawWeights = types.map(() => 0.3 + rng());
  const total = rawWeights.reduce((sum, w) => sum + w, 0);
  return types.map((type, i) => ({
    type,
    velocity: clampVelocity((FASTBALL_TYPES.includes(type) ? 148 : 132) * strength + jitter(rng, 4)),
    movement: clampRating(baseline * strength + jitter(rng, 8)),
    control: clampRating(baseline * strength + jitter(rng, 8)),
    usageRate: Math.round((rawWeights[i] / total) * 100) / 100,
    groundBallTendency: PITCH_TYPE_GROUNDBALL_PULL[type],
  }));
}

function randomBatterAttributes(id: string, name: string, baseline: number, strength: number, rng: () => number): BatterAttributes {
  const overrides = {} as Record<BatterScalableField, number>;
  for (const field of BATTER_SCALABLE_FIELDS) {
    overrides[field] = clampRating(sampleNormal(baseline, 10, rng) * strength);
  }
  const battingSide = (['L', 'R', 'S'] as const)[Math.floor(rng() * 3)];
  const swingType = (['upper', 'level', 'down'] as const)[Math.floor(rng() * 3)];
  return { id, name, battingSide, swingType, ...overrides };
}

function randomPitcherAttributes(id: string, name: string, baseline: number, strength: number, rng: () => number, role?: PitcherRole): PitcherAttributes {
  const overrides = {} as Record<PitcherScalableField, number>;
  for (const field of PITCHER_SCALABLE_FIELDS) {
    overrides[field] = clampRating(sampleNormal(baseline, 10, rng) * strength);
  }
  const throwingHand = (['L', 'R'] as const)[Math.floor(rng() * 2)];
  return { id, name, throwingHand, role, repertoire: randomRepertoire(baseline, strength, rng), ...overrides };
}

/** Roster-construction tier, controlling the age/potential distribution for a generated player. */
type SlotTier = 'core' | 'depth1' | 'depth2';

/** Approximate years of top-level service time implied by a player's age. */
function serviceTimeFromAge(age: number): number {
  return clamp(age - 19, 0, 20);
}

function buildContract(serviceTimeYears: number, overall: number, rng: () => number) {
  // FA-eligible veterans would already be on a multi-year FA deal; give them
  // longer contracts so the league doesn't flood with FA declarations year 1.
  const yearsRemaining =
    serviceTimeYears >= FA_ELIGIBILITY_YEARS
      ? 2 + Math.floor(rng() * 4) // 2-5 years remaining on FA contract
      : 1 + Math.floor(rng() * 4); // 1-4 years (team-controlled)
  return {
    yearsRemaining,
    annualSalary: Math.round(clamp((overall - 30) * 1200 + jitter(rng, 2000), 3000, 250000)),
    faEligible: serviceTimeYears >= FA_ELIGIBILITY_YEARS,
  };
}

/** Assigns an age and growth potential appropriate for the given roster tier. */
function assignAgePotential(overall: number, tier: SlotTier, rng: () => number): { age: number; potential: number } {
  let age: number;
  if (tier === 'core') {
    age = 26 + Math.floor(rng() * 6); // 26-31
  } else if (tier === 'depth1') {
    age = 24 + Math.floor(rng() * 11); // 24-34
  } else {
    age = 19 + Math.floor(rng() * rng() * 19); // skewed young, 19-37
  }

  let potential: number;
  if (tier === 'core') {
    potential = overall + Math.floor(rng() * 9); // +0..8
  } else if (age < 23) {
    potential = overall + 10 + Math.floor(rng() * 31); // +10..40, prospects
  } else if (age > 32) {
    potential = overall; // no more growth left
  } else {
    potential = overall + Math.floor(rng() * 16); // +0..15
  }

  return { age, potential: clamp(potential, overall, 99) };
}

function makeBatterProfile(attrs: BatterAttributes, position: Position, tier: SlotTier, rng: () => number): PlayerProfile {
  const overall = batterOverallRating(attrs);
  const { age, potential } = assignAgePotential(overall, tier, rng);
  const serviceTimeYears = serviceTimeFromAge(age);
  return {
    playerId: attrs.id,
    kind: 'batter',
    attributes: attrs,
    position,
    age,
    potential,
    rosterStatus: '2군',
    origin: 'domestic',
    contract: buildContract(serviceTimeYears, overall, rng),
    serviceTimeYears,
  };
}

function makePitcherProfile(attrs: PitcherAttributes, tier: SlotTier, rng: () => number): PlayerProfile {
  const overall = pitcherOverallRating(attrs);
  const { age, potential } = assignAgePotential(overall, tier, rng);
  const serviceTimeYears = serviceTimeFromAge(age);
  return {
    playerId: attrs.id,
    kind: 'pitcher',
    attributes: attrs,
    age,
    potential,
    rosterStatus: '2군',
    origin: 'domestic',
    contract: buildContract(serviceTimeYears, overall, rng),
    serviceTimeYears,
  };
}

/** Age/potential/contract treatment shared by foreign and Asia-quota signings. */
function importAgePotential(overall: number, rng: () => number): { age: number; potential: number } {
  const age = 27 + Math.floor(rng() * 7); // 27-33
  const potential = age > 32 ? overall : clamp(overall + Math.floor(rng() * 6), overall, 99);
  return { age, potential };
}

function importContract(rng: () => number) {
  return {
    yearsRemaining: 1 + Math.floor(rng() * 2), // 1-2
    annualSalary: Math.round(90000 + rng() * 100000),
    faEligible: false,
  };
}

function makeImportBatter(id: string, position: Position, origin: 'foreign' | 'asiaQuota', strength: number, rng: () => number): PlayerProfile {
  const nationalityPool = origin === 'foreign' ? FOREIGN_NATIONALITIES : ASIA_QUOTA_NATIONALITIES;
  const nationality = nationalityPool[Math.floor(rng() * nationalityPool.length)];
  const name = origin === 'foreign' ? generateForeignName(nationality, rng) : generateAsiaQuotaName(nationality, rng);
  const baselineMax = origin === 'foreign' ? 80 : 75;
  const baseline = 65 + rng() * (baselineMax - 65);
  const attrs = randomBatterAttributes(id, name, baseline, strength, rng);
  const overall = batterOverallRating(attrs);
  const { age, potential } = importAgePotential(overall, rng);
  return {
    playerId: attrs.id,
    kind: 'batter',
    attributes: attrs,
    position,
    age,
    potential,
    rosterStatus: '2군',
    origin,
    nationality,
    contract: importContract(rng),
    serviceTimeYears: Math.floor(rng() * 3),
  };
}

function makeImportPitcher(id: string, strength: number, rng: () => number): PlayerProfile {
  const nationality = FOREIGN_NATIONALITIES[Math.floor(rng() * FOREIGN_NATIONALITIES.length)];
  const name = generateForeignName(nationality, rng);
  const baseline = 65 + rng() * 15;
  const attrs = randomPitcherAttributes(id, name, baseline, strength, rng, 'starter');
  const overall = pitcherOverallRating(attrs);
  const { age, potential } = importAgePotential(overall, rng);
  return {
    playerId: attrs.id,
    kind: 'pitcher',
    attributes: attrs,
    age,
    potential,
    rosterStatus: '2군',
    origin: 'foreign',
    nationality,
    contract: importContract(rng),
    serviceTimeYears: Math.floor(rng() * 3),
  };
}

/**
 * Picks the initial 1군 (active) roster: the best player at each of the 9
 * positions, then the next-best batters up to 13, then the best 13 pitchers
 * overall - 26 total. The remaining 39 players start on the 2군.
 */
function splitActiveRoster(batters: PlayerProfile[], pitchers: PlayerProfile[]): void {
  const active = new Set<string>();

  for (const pos of POSITIONS) {
    const best = batters
      .filter((p) => p.position === pos)
      .sort((a, b) => batterOverallRating(b.attributes as BatterAttributes) - batterOverallRating(a.attributes as BatterAttributes))[0];
    if (best) active.add(best.playerId);
  }

  const remainingBatters = [...batters]
    .filter((p) => !active.has(p.playerId))
    .sort((a, b) => batterOverallRating(b.attributes as BatterAttributes) - batterOverallRating(a.attributes as BatterAttributes));
  const activeBatterTarget = POSITIONS.length + 4; // 9 position-best + 4 extra bench bats = 13
  for (const p of remainingBatters) {
    if (active.size >= activeBatterTarget) break;
    active.add(p.playerId);
  }

  const topPitchers = [...pitchers].sort(
    (a, b) => pitcherOverallRating(b.attributes as PitcherAttributes) - pitcherOverallRating(a.attributes as PitcherAttributes),
  );
  for (const p of topPitchers.slice(0, ACTIVE_ROSTER_SIZE - active.size)) {
    active.add(p.playerId);
  }

  for (const p of [...batters, ...pitchers]) {
    p.rosterStatus = active.has(p.playerId) ? '1군' : '2군';
  }
}

/**
 * Generates a 65-player pool (33 batters + 32 pitchers) for one team:
 * - 9 lineup + 2 bench batters scaled from the hand-authored templates, plus
 *   22 procedural depth batters, covering all 9 positions at depth 3-4.
 * - 5 rotation + 3 bullpen pitchers scaled from the templates, plus 24
 *   procedural depth pitchers (11 starters / 21 relievers total).
 * - 3 foreign players (2 pitchers + 1 batter) and 1 Asia-quota batter.
 * - Player IDs follow `P{teamNum}-{seq}` (e.g. `P01-001`..`P01-065`), globally
 *   unique and stable across trades.
 *
 * `teamIndex` is 0-based (team 1 = index 0); `strength` is the same overall
 * multiplier used by `sampleLeague.ts`'s `TEAM_STRENGTH`.
 */
export function generateTeamPlayerPool(teamIndex: number, strength: number, rng: () => number): PlayerProfile[] {
  const template = TEMPLATES[teamIndex % TEMPLATES.length];
  const prefix = `P${String(teamIndex + 1).padStart(2, '0')}`;
  let seq = 0;
  const nextId = () => `${prefix}-${String(++seq).padStart(3, '0')}`;

  const batters: PlayerProfile[] = [];
  const pitchers: PlayerProfile[] = [];

  // Slot 0 at every position is filled by the lineup template below;
  // bumped to 2 for LF/CF once the bench template fills their slot 1.
  const nextSlot: Record<Position, number> = { C: 1, '1B': 1, '2B': 1, '3B': 1, SS: 1, LF: 1, CF: 1, RF: 1, DH: 1 };

  template.lineup.forEach((b, i) => {
    const pos = template.lineupPositions[i];
    const attrs = scaleBatterAttributes(b, nextId(), generateKoreanName(rng), strength, rng);
    batters.push(makeBatterProfile(attrs, pos, 'core', rng));
  });

  template.bench.forEach((b, i) => {
    const pos = template.benchPositions[i];
    const attrs = scaleBatterAttributes(b, nextId(), generateKoreanName(rng), strength, rng);
    batters.push(makeBatterProfile(attrs, pos, 'depth1', rng));
    nextSlot[pos] = 2;
  });

  for (const pos of POSITIONS) {
    const depth = POSITION_DEPTH[pos];
    for (let slot = nextSlot[pos]; slot < depth; slot++) {
      const tier: SlotTier = slot === 1 ? 'depth1' : 'depth2';
      const id = nextId();
      if (pos === 'LF' && slot === depth - 1) {
        batters.push(makeImportBatter(id, pos, 'foreign', strength, rng));
        continue;
      }
      if (pos === 'SS' && slot === depth - 1) {
        batters.push(makeImportBatter(id, pos, 'asiaQuota', strength, rng));
        continue;
      }
      const baseline = tier === 'depth1' ? 58 : 48;
      const attrs = randomBatterAttributes(id, generateKoreanName(rng), baseline, strength, rng);
      batters.push(makeBatterProfile(attrs, pos, tier, rng));
    }
  }

  ROTATION_STRENGTH.forEach((factor) => {
    const attrs = scalePitcherAttributes(template.ace, nextId(), generateKoreanName(rng), strength * factor, rng, 'starter');
    pitchers.push(makePitcherProfile(attrs, 'core', rng));
  });

  template.bullpen.forEach((p) => {
    const attrs = scalePitcherAttributes(p, nextId(), generateKoreanName(rng), strength, rng, p.role);
    pitchers.push(makePitcherProfile(attrs, 'core', rng));
  });

  // 6 additional starters (the last becomes a foreign import).
  for (let i = 0; i < 6; i++) {
    const id = nextId();
    if (i === 5) {
      pitchers.push(makeImportPitcher(id, strength, rng));
      continue;
    }
    const attrs = randomPitcherAttributes(id, generateKoreanName(rng), 55, strength, rng, 'starter');
    pitchers.push(makePitcherProfile(attrs, 'depth1', rng));
  }

  // 18 additional relievers (the last becomes a foreign import, registered as a starter).
  for (let i = 0; i < 18; i++) {
    const tier: SlotTier = i < 5 ? 'depth1' : 'depth2';
    const id = nextId();
    if (i === 17) {
      pitchers.push(makeImportPitcher(id, strength, rng));
      continue;
    }
    const baseline = tier === 'depth1' ? 55 : 45;
    const role: PitcherRole | undefined = i % 6 === 0 ? 'setup' : i % 6 === 3 ? 'longRelief' : undefined;
    const attrs = randomPitcherAttributes(id, generateKoreanName(rng), baseline, strength, rng, role);
    pitchers.push(makePitcherProfile(attrs, tier, rng));
  }

  splitActiveRoster(batters, pitchers);

  return [...batters, ...pitchers];
}

/** Generates a 65-player pool for every team in the league, in `strengths` order. */
export function generateLeaguePlayerPools(strengths: readonly number[], rng: () => number): PlayerProfile[][] {
  return strengths.map((strength, teamIndex) => generateTeamPlayerPool(teamIndex, strength, rng));
}

const FOREIGN_BATTER_POSITIONS: readonly Position[] = ['LF', 'RF', 'CF', 'DH', '1B'];
const ASIA_QUOTA_BATTER_POSITIONS: readonly Position[] = ['SS', 'CF', '2B', '3B', '1B'];

/**
 * Generates a pool of foreign free-agent candidates for the offseason market.
 * Roughly 2/3 are pitchers and 1/3 are batters, with higher strength variance
 * than domestic players (0.8–1.3) to simulate "boom-or-bust" foreign signings.
 * Player IDs follow `FGN-{year}-{seq}` to ensure cross-season uniqueness.
 */
export function generateForeignFreeAgentPool(year: number, count: number, rng: () => number): PlayerProfile[] {
  return Array.from({ length: count }, (_, i) => {
    const id = `FGN-${year}-${String(i + 1).padStart(3, '0')}`;
    const strength = 0.8 + rng() * 0.5;
    if (rng() < 2 / 3) {
      return makeImportPitcher(id, strength, rng);
    }
    const position = FOREIGN_BATTER_POSITIONS[Math.floor(rng() * FOREIGN_BATTER_POSITIONS.length)];
    return makeImportBatter(id, position, 'foreign', strength, rng);
  });
}

/**
 * Generates a pool of Asia-quota free-agent candidates (all batters) for the
 * offseason market. Strength variance is moderate (0.85–1.2). Player IDs
 * follow `AQT-{year}-{seq}`.
 */
export function generateAsiaQuotaFreeAgentPool(year: number, count: number, rng: () => number): PlayerProfile[] {
  return Array.from({ length: count }, (_, i) => {
    const id = `AQT-${year}-${String(i + 1).padStart(3, '0')}`;
    const strength = 0.85 + rng() * 0.35;
    const position = ASIA_QUOTA_BATTER_POSITIONS[Math.floor(rng() * ASIA_QUOTA_BATTER_POSITIONS.length)];
    return makeImportBatter(id, position, 'asiaQuota', strength, rng);
  });
}
