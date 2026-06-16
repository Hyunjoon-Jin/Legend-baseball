import type { PlayerProfile, Position } from '../../types/roster.js';
import type { TeamFranchiseState } from '../types.js';
import type { KboSeasonResult } from '../../season/leagueSim.js';
import { sampleBatter, samplePitcher } from '../../data/samplePlayers.js';
import { generateKoreanName } from '../../data/nameGenerator.js';
import { clamp } from '../../utils/math.js';
import { DRAFT_ROUNDS, TOTAL_SQUAD_SIZE } from '../../roster/constants.js';

const POSITIONS: readonly Position[] = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];
const DRAFT_BATTER_FRACTION = 0.55;

/** A single draft pick result. */
export interface DraftPick {
  round: number;
  teamId: string;
  playerId: string;
  playerName: string;
}

function clampRating(v: number): number {
  return clamp(Math.round(v), 1, 99);
}

function makeDraftBatter(id: string, rng: () => number): PlayerProfile {
  const val = clampRating(20 + rng() * 30);
  const position = POSITIONS[Math.floor(rng() * POSITIONS.length)];
  const age = 18 + Math.floor(rng() * 4);
  const potential = clamp(Math.round(30 + rng() * 65), 30, 95);
  const name = generateKoreanName(rng);
  return {
    playerId: id,
    kind: 'batter',
    attributes: {
      ...sampleBatter,
      id,
      name,
      contactVsRight: val,
      contactVsLeft: val,
      power: clampRating(val + (rng() * 10 - 5)),
      plateDiscipline: clampRating(val + (rng() * 10 - 5)),
      badBallHitting: clampRating(val + (rng() * 10 - 5)),
      speed: clampRating(val + (rng() * 10 - 5)),
      clutch: clampRating(val + (rng() * 10 - 5)),
    },
    position,
    age,
    potential,
    rosterStatus: '2군',
    origin: 'draft',
    contract: {
      yearsRemaining: 4 + Math.floor(rng() * 3),
      annualSalary: 3000 + Math.floor(rng() * 2000),
      faEligible: false,
    },
    serviceTimeYears: 0,
  };
}

function makeDraftPitcher(id: string, rng: () => number): PlayerProfile {
  const val = clampRating(20 + rng() * 30);
  const age = 18 + Math.floor(rng() * 4);
  const potential = clamp(Math.round(30 + rng() * 65), 30, 95);
  const name = generateKoreanName(rng);
  return {
    playerId: id,
    kind: 'pitcher',
    attributes: {
      ...samplePitcher,
      id,
      name,
      stuff: val,
      control: clampRating(val + (rng() * 10 - 5)),
      stamina: clampRating(val + (rng() * 10 - 5)),
      mentalStrength: clampRating(val + (rng() * 10 - 5)),
      sequencingSkill: clampRating(val + (rng() * 10 - 5)),
    },
    age,
    potential,
    rosterStatus: '2군',
    origin: 'draft',
    contract: {
      yearsRemaining: 4 + Math.floor(rng() * 3),
      annualSalary: 3000 + Math.floor(rng() * 2000),
      faEligible: false,
    },
    serviceTimeYears: 0,
  };
}

/**
 * Generates a rookie draft class of `size` prospects: ages 18-21, low current
 * attributes (20-50), wide potential distribution (30-95), ~55% batters.
 * Player IDs follow `DFT-{year}-{seq}`.
 */
export function generateDraftClass(year: number, size: number, rng: () => number): PlayerProfile[] {
  return Array.from({ length: size }, (_, i) => {
    const id = `DFT-${year}-${String(i + 1).padStart(3, '0')}`;
    return rng() < DRAFT_BATTER_FRACTION ? makeDraftBatter(id, rng) : makeDraftPitcher(id, rng);
  });
}

/** Reverse-standings draft order (worst team picks first). Random order if no prior season. */
function draftOrder(teams: readonly TeamFranchiseState[], lastSeasonResult: KboSeasonResult | undefined): string[] {
  if (!lastSeasonResult) return teams.map((t) => t.teamId);
  return [...lastSeasonResult.standings]
    .sort((a, b) => a.winPct - b.winPct)
    .map((row) => row.teamId);
}

/**
 * Returns the `depth` map: how many total players a team has at each position
 * (for batters) and in total for pitchers.
 */
function positionDepth(roster: readonly PlayerProfile[]): Map<string, number> {
  const depth = new Map<string, number>();
  for (const pos of POSITIONS) depth.set(pos, 0);
  depth.set('pitcher', 0);
  for (const p of roster) {
    if (p.kind === 'batter' && p.position) {
      depth.set(p.position, (depth.get(p.position) ?? 0) + 1);
    } else if (p.kind === 'pitcher') {
      depth.set('pitcher', (depth.get('pitcher') ?? 0) + 1);
    }
  }
  return depth;
}

/**
 * Picks the highest-potential prospect from `available` that best addresses
 * the team's shallowest depth slot. Falls back to highest potential overall
 * if no matching position prospect is found.
 */
function pickBestProspect(available: readonly PlayerProfile[], roster: readonly PlayerProfile[]): PlayerProfile | null {
  if (available.length === 0) return null;

  const depth = positionDepth(roster);
  let lowestCount = Infinity;
  let targetKind: 'batter' | 'pitcher' = 'batter';
  let targetPosition: string | null = null;

  for (const [key, count] of depth) {
    if (count < lowestCount) {
      lowestCount = count;
      if (key === 'pitcher') {
        targetKind = 'pitcher';
        targetPosition = null;
      } else {
        targetKind = 'batter';
        targetPosition = key;
      }
    }
  }

  const matching = available.filter((p) =>
    targetKind === 'pitcher' ? p.kind === 'pitcher' : p.kind === 'batter' && p.position === targetPosition,
  );

  const pool = matching.length > 0 ? matching : [...available];
  return pool.reduce((best, p) => (p.potential > best.potential ? p : best));
}

/**
 * Runs the rookie draft: `DRAFT_ROUNDS` rounds in reverse-standings order.
 * Each team selects the highest-potential prospect addressing their shallowest
 * depth, provided they are under `TOTAL_SQUAD_SIZE`. Drafted players are set
 * to `origin: 'draft'` and `rosterStatus: '2군'`.
 */
export function runDraft(
  teams: readonly TeamFranchiseState[],
  draftClass: readonly PlayerProfile[],
  lastSeasonResult: KboSeasonResult | undefined,
  rng: () => number,
): { teams: TeamFranchiseState[]; picks: DraftPick[]; undrafted: PlayerProfile[] } {
  const rosters = new Map(teams.map((t) => [t.teamId, [...t.roster]]));
  const available = [...draftClass];
  const picks: DraftPick[] = [];
  const order = draftOrder(teams, lastSeasonResult);

  for (let round = 1; round <= DRAFT_ROUNDS; round++) {
    for (const teamId of order) {
      if (available.length === 0) break;
      const roster = rosters.get(teamId)!;
      if (roster.length >= TOTAL_SQUAD_SIZE) continue;

      const pick = pickBestProspect(available, roster);
      if (!pick) break;

      available.splice(available.indexOf(pick), 1);
      roster.push({ ...pick, rosterStatus: '2군' as const });
      picks.push({ round, teamId, playerId: pick.playerId, playerName: pick.attributes.name });
    }
  }

  const updatedTeams = teams.map((t) => ({ ...t, roster: rosters.get(t.teamId)! }));
  return { teams: updatedTeams, picks, undrafted: available };
}
