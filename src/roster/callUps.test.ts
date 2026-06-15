import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fillRosterGaps } from './callUps.js';
import { rollInjuries, advanceInjuries } from './injuries.js';
import { buildDepthChart, buildLeagueTeam } from './depthChart.js';
import { ACTIVE_ROSTER_SIZE } from './constants.js';
import { generateLeaguePlayerPools } from '../data/playerPoolGenerator.js';
import { simulateKboSeason, type SeasonHooks } from '../season/leagueSim.js';
import { sampleBatter, samplePitcher } from '../data/samplePlayers.js';
import type { PlayerProfile, Position } from '../types/roster.js';
import type { PitcherRole } from '../types/player.js';
import type { LeagueTeam } from '../types/season.js';

function mulberry32(seed: number) {
  return function rng() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeBatter(id: string, position: Position, power: number, rosterStatus: PlayerProfile['rosterStatus'] = '2군'): PlayerProfile {
  return {
    playerId: id,
    kind: 'batter',
    attributes: { ...sampleBatter, id, power },
    position,
    age: 27,
    potential: 70,
    rosterStatus,
    origin: 'domestic',
    contract: { yearsRemaining: 3, annualSalary: 10000, faEligible: false },
    serviceTimeYears: 3,
  };
}

function makePitcher(id: string, role: PitcherRole | undefined, stuff: number, rosterStatus: PlayerProfile['rosterStatus'] = '2군'): PlayerProfile {
  return {
    playerId: id,
    kind: 'pitcher',
    attributes: { ...samplePitcher, id, stuff, role },
    age: 27,
    potential: 70,
    rosterStatus,
    origin: 'domestic',
    contract: { yearsRemaining: 3, annualSalary: 10000, faEligible: false },
    serviceTimeYears: 3,
  };
}

test('fillRosterGaps promotes the best 2군 batter at the same position over a higher-rated batter at another position', () => {
  const outgoing = makeBatter('CF-out', 'CF', 70, '부상자명단');
  const cfLow = makeBatter('CF-low', 'CF', 52);
  const cfHigh = makeBatter('CF-high', 'CF', 92);
  const firstBaseHigher = makeBatter('1B-higher', '1B', 100);

  const result = fillRosterGaps([outgoing, cfLow, cfHigh, firstBaseHigher], ['CF-out']);

  assert.equal(result.events.length, 1);
  assert.deepEqual(result.events[0], { outPlayerId: 'CF-out', inPlayerId: 'CF-high' });

  const byId = new Map(result.roster.map((p) => [p.playerId, p]));
  assert.equal(byId.get('CF-high')?.rosterStatus, '1군');
  assert.equal(byId.get('CF-low')?.rosterStatus, '2군');
  assert.equal(byId.get('1B-higher')?.rosterStatus, '2군');
});

test('fillRosterGaps falls back to the best overall 2군 batter of the same kind when no position match exists', () => {
  const outgoing = makeBatter('C-out', 'C', 70, '부상자명단');
  const firstBase = makeBatter('1B', '1B', 80);
  const thirdBase = makeBatter('3B', '3B', 90);

  const result = fillRosterGaps([outgoing, firstBase, thirdBase], ['C-out']);

  assert.equal(result.events.length, 1);
  assert.deepEqual(result.events[0], { outPlayerId: 'C-out', inPlayerId: '3B' });
});

test('fillRosterGaps prefers a pitcher with the same role over a higher-rated pitcher with a different role', () => {
  const outgoing = makePitcher('CL-out', 'closer', 70, '부상자명단');
  const setup = makePitcher('setup', 'setup', 90);
  const closer = makePitcher('closer', 'closer', 75);

  const result = fillRosterGaps([outgoing, setup, closer], ['CL-out']);

  assert.equal(result.events.length, 1);
  assert.deepEqual(result.events[0], { outPlayerId: 'CL-out', inPlayerId: 'closer' });
});

test('fillRosterGaps leaves an outgoing player unreplaced when no 2군 player of the same kind is available', () => {
  const outgoing = makePitcher('P-out', 'starter', 70, '부상자명단');
  const reserveBatter = makeBatter('B-reserve', 'LF', 80);

  const result = fillRosterGaps([outgoing, reserveBatter], ['P-out']);

  assert.equal(result.events.length, 0);
  assert.deepEqual(result.roster, [outgoing, reserveBatter]);
});

test('fillRosterGaps does not promote the same 2군 player twice for multiple outgoing players', () => {
  const out1 = makeBatter('CF-out1', 'CF', 70, '부상자명단');
  const out2 = makeBatter('CF-out2', 'CF', 70, '부상자명단');
  const cfReserve = makeBatter('CF-reserve', 'CF', 92);
  const firstBaseReserve = makeBatter('1B-reserve', '1B', 80);

  const result = fillRosterGaps([out1, out2, cfReserve, firstBaseReserve], ['CF-out1', 'CF-out2']);

  assert.equal(result.events.length, 2);
  assert.deepEqual(result.events, [
    { outPlayerId: 'CF-out1', inPlayerId: 'CF-reserve' },
    { outPlayerId: 'CF-out2', inPlayerId: '1B-reserve' },
  ]);
});

test('simulateKboSeason wires advanceInjuries -> rollInjuries -> fillRosterGaps -> buildLeagueTeam via onBeforeGame', () => {
  const strengths = Array.from({ length: 10 }, () => 1.0);
  const pools = generateLeaguePlayerPools(strengths, mulberry32(50));

  const rosters = new Map<string, PlayerProfile[]>();
  const teams: LeagueTeam[] = pools.map((pool, i) => {
    const id = `T${i + 1}`;
    rosters.set(id, pool);
    return buildLeagueTeam(id, `팀${i + 1}`, pool);
  });

  const injuryRng = mulberry32(51);
  let totalInjuries = 0;
  let totalCallUps = 0;

  const hooks: SeasonHooks = {
    onBeforeGame: (_gamesPlayed, teamId, team, fatigue) => {
      const advanced = advanceInjuries(rosters.get(teamId)!, ACTIVE_ROSTER_SIZE);
      const { roster: afterInjury, events: injuryEvents } = rollInjuries(advanced, fatigue, injuryRng);
      totalInjuries += injuryEvents.length;

      const { roster: afterCallUp, events: callUpEvents } = fillRosterGaps(afterInjury, injuryEvents.map((e) => e.playerId));
      totalCallUps += callUpEvents.length;

      rosters.set(teamId, afterCallUp);

      if (injuryEvents.length === 0 && callUpEvents.length === 0) return undefined;
      return buildLeagueTeam(teamId, team.setup.name, afterCallUp);
    },
  };

  const result = simulateKboSeason(teams, {}, mulberry32(52), hooks);

  assert.ok(totalInjuries > 0, 'expected at least one injury over a full season across 10 teams');
  assert.ok(totalCallUps > 0, 'expected at least one call-up over a full season across 10 teams');
  assert.ok(totalCallUps <= totalInjuries);
  assert.ok(Number.isFinite(result.standings[0].winPct));

  for (const team of teams) {
    const roster = rosters.get(team.id)!;
    assert.ok(roster.filter((p) => p.rosterStatus === '1군').length <= ACTIVE_ROSTER_SIZE);

    const chart = buildDepthChart(roster);
    assert.equal(chart.lineup.length, 9);
    assert.equal(chart.rotation.length, 5);
  }
});
