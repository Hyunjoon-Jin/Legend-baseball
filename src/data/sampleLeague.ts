import type { BatterAttributes, PitcherAttributes } from '../types/player.js';
import type { DefensiveTeamRatings } from '../types/baserunning.js';
import { defaultDefense } from '../types/baserunning.js';
import type { TeamSetup } from '../engine/gameEngine.js';
import type { LeagueTeam } from '../types/season.js';
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
  'contactVsRight',
  'contactVsLeft',
  'power',
  'plateDiscipline',
  'badBallHitting',
  'speed',
  'stealRating',
  'baserunningAggressiveness',
  'pullTendency',
  'clutch',
];

const PITCHER_SCALABLE_FIELDS: readonly PitcherScalableField[] = [
  'control',
  'stuff',
  'stamina',
  'mentalStrength',
  'recovery',
  'groundBallTendency',
  'sequencingSkill',
  'holdRunnerRating',
];

/** Clamps a 0-100 style rating to a safe, still-meaningful range after scaling/jitter. */
function clampRating(value: number): number {
  return Math.max(1, Math.min(99, Math.round(value)));
}

/** Clamps a pitch velocity (km/h) to a plausible range after scaling/jitter. */
function clampVelocity(value: number): number {
  return Math.max(100, Math.min(170, Math.round(value)));
}

/** Small symmetric random noise in `[-spread, spread]`, so teams of equal strength still vary player-to-player. */
function jitter(rng: () => number, spread: number): number {
  return (rng() * 2 - 1) * spread;
}

function scaleBatter(template: BatterAttributes, id: string, name: string, strength: number, rng: () => number): BatterAttributes {
  const overrides = {} as Record<BatterScalableField, number>;
  for (const field of BATTER_SCALABLE_FIELDS) {
    overrides[field] = clampRating(template[field] * strength + jitter(rng, 4));
  }
  return { ...template, id, name, ...overrides };
}

function scalePitcher(template: PitcherAttributes, id: string, name: string, strength: number, rng: () => number): PitcherAttributes {
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
  return { ...template, id, name, ...overrides, repertoire };
}

function scaleDefense(template: DefensiveTeamRatings, strength: number, rng: () => number): DefensiveTeamRatings {
  return {
    catcherArm: clampRating(template.catcherArm * strength + jitter(rng, 4)),
    infieldDefense: clampRating(template.infieldDefense * strength + jitter(rng, 4)),
    outfieldDefense: clampRating(template.outfieldDefense * strength + jitter(rng, 4)),
    outfieldArm: clampRating(template.outfieldArm * strength + jitter(rng, 4)),
  };
}

interface TeamTemplate {
  lineup: readonly BatterAttributes[];
  bench: readonly BatterAttributes[];
  pitcher: PitcherAttributes;
  bullpen: readonly PitcherAttributes[];
}

/** The two hand-authored rosters, reused as templates for the full 10-team league. */
const TEMPLATES: readonly TeamTemplate[] = [
  { lineup: sampleLineupA, bench: sampleBenchA, pitcher: samplePitcher, bullpen: sampleBullpenA },
  { lineup: sampleLineupB, bench: sampleBenchB, pitcher: samplePitcherB, bullpen: sampleBullpenB },
];

/** Ten fictional KBO-style club names, distinct from any real-life KBO team. */
export const TEAM_NAMES: readonly string[] = [
  '서울 드래곤즈',
  '부산 파이오니어스',
  '대구 라이온하츠',
  '인천 코메츠',
  '광주 선더스',
  '대전 그리폰스',
  '수원 로얄스',
  '창원 스파르탄스',
  '제주 볼케이노스',
  '울산 타이탄스',
];

/** Per-team overall strength multiplier applied to every scalable rating, spreading the league from contenders to cellar-dwellers. */
export const TEAM_STRENGTH: readonly number[] = [1.06, 1.045, 1.03, 1.015, 1.0, 0.985, 0.97, 0.955, 0.94, 0.925];

/** Relative strength of each rotation slot (ace down to back-end starter), applied on top of team strength. */
const ROTATION_STRENGTH: readonly number[] = [1.05, 1.02, 1.0, 0.97, 0.94];

/** Builds a 5-man starting rotation by scaling a team's ace template at each rotation slot's relative strength. */
function buildRotation(ace: PitcherAttributes, name: string, prefix: string, teamStrength: number, rng: () => number): PitcherAttributes[] {
  return ROTATION_STRENGTH.map((rotationFactor, i) =>
    scalePitcher(ace, `${prefix}-${ace.id}-rot${i + 1}`, `${name} ${ace.name}${i + 1}`, teamStrength * rotationFactor, rng),
  );
}

/**
 * Generates a full 10-team league by scaling the two hand-authored sample
 * rosters with a per-team strength multiplier (plus small jitter), so every
 * team has a distinct but internally consistent talent level for a
 * season-long simulation.
 *
 * `teamStrengths` overrides the default per-team strength multipliers
 * (`TEAM_STRENGTH`) when it has exactly one entry per team; otherwise the
 * defaults are used.
 */
export function generateSampleLeague(rng: () => number, teamStrengths?: readonly number[]): LeagueTeam[] {
  const strengths = teamStrengths?.length === TEAM_NAMES.length ? teamStrengths : TEAM_STRENGTH;

  return TEAM_NAMES.map((name, i) => {
    const template = TEMPLATES[i % TEMPLATES.length];
    const strength = strengths[i];
    const prefix = `T${i + 1}`;

    const lineup = template.lineup.map((b) => scaleBatter(b, `${prefix}-${b.id}`, `${name} ${b.name}`, strength, rng));
    const bench = template.bench.map((b) => scaleBatter(b, `${prefix}-${b.id}`, `${name} ${b.name}`, strength, rng));
    const rotation = buildRotation(template.pitcher, name, prefix, strength, rng);
    const bullpen = template.bullpen.map((p) => scalePitcher(p, `${prefix}-${p.id}`, `${name} ${p.name}`, strength, rng));

    const setup: TeamSetup = {
      name,
      lineup,
      bench,
      pitcher: rotation[0],
      bullpen,
      defense: scaleDefense(defaultDefense, strength, rng),
    };

    return { id: prefix, setup, rotation };
  });
}
