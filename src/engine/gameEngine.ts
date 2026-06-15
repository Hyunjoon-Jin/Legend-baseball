import type { BatterAttributes, PitcherAttributes } from '../types/player.js';
import type { BallparkFactors, WeatherConditions } from '../types/situation.js';
import type { DefensiveTeamRatings } from '../types/baserunning.js';
import type { GameResult, HalfInningResult, Lineup, SubstitutionEvent } from '../types/game.js';
import { simulateHalfInning } from './inningEngine.js';

export interface TeamSetup {
  name: string;
  lineup: Lineup;
  /** Available pinch hitters/runners. Defaults to none. */
  bench?: readonly BatterAttributes[];
  pitcher: PitcherAttributes;
  /** Available relief pitchers. Defaults to none. */
  bullpen?: readonly PitcherAttributes[];
  defense: DefensiveTeamRatings;
  /** Pitcher's daily condition modifier, 0-100 (50 = normal). Defaults to 50. */
  pitcherCondition?: number;
  /** Batting team's daily condition modifier, 0-100 (50 = normal). Defaults to 50. */
  batterCondition?: number;
}

export interface GameOptions {
  weather?: WeatherConditions;
  ballpark?: BallparkFactors;
  /** Number of regulation innings before walk-off/early-end rules apply. Defaults to 9. */
  regulationInnings?: number;
  /** Hard cap on total innings (KBO ends tied extra-inning games at 12). Defaults to 12. */
  maxInnings?: number;
}

/**
 * Simulates a full game inning-by-inning: the away team bats in the top
 * half against the home pitcher/defense, then the home team bats in the
 * bottom half against the away pitcher/defense. Baserunners reset each
 * half-inning, but each team's batting order position, pitching staff
 * (current pitcher + bullpen), bench, and each pitcher's cumulative pitch
 * count (and therefore fatigue) carry forward across innings. Pitching
 * changes, pinch hitters, and pinch runners made during a half-inning
 * (see `simulateHalfInning`) persist for the rest of the game.
 *
 * From `regulationInnings` onward (default 9th inning):
 *  - if the home team is already leading after the top half, the bottom
 *    half is skipped and the game ends immediately;
 *  - the bottom half ends the instant the home team takes the lead
 *    (walk-off), even with fewer than 3 outs;
 *  - if still tied after a full inning, play continues into extra innings
 *    up to `maxInnings`, after which the game ends in a tie.
 */
export function simulateGame(
  away: TeamSetup,
  home: TeamSetup,
  options: GameOptions = {},
  rng: () => number = Math.random,
): GameResult {
  const regulationInnings = options.regulationInnings ?? 9;
  const maxInnings = options.maxInnings ?? 12;

  const halfInnings: HalfInningResult[] = [];
  const lineScore = { away: [] as number[], home: [] as number[] };
  const substitutions: SubstitutionEvent[] = [];

  let awayScore = 0;
  let homeScore = 0;
  let awayBatterIndex = 0;
  let homeBatterIndex = 0;
  let awayPitchCount = 0;
  let homePitchCount = 0;

  let awayLineup: Lineup = away.lineup;
  let homeLineup: Lineup = home.lineup;
  let awayBench: readonly BatterAttributes[] = away.bench ?? [];
  let homeBench: readonly BatterAttributes[] = home.bench ?? [];
  let awayPitcher = away.pitcher;
  let homePitcher = home.pitcher;
  let awayBullpen: readonly PitcherAttributes[] = away.bullpen ?? [];
  let homeBullpen: readonly PitcherAttributes[] = home.bullpen ?? [];

  for (let inning = 1; inning <= maxInnings; inning++) {
    const top = simulateHalfInning(
      {
        inning,
        half: 'top',
        lineup: awayLineup,
        bench: awayBench,
        startingBatterIndex: awayBatterIndex,
        pitcher: homePitcher,
        bullpen: homeBullpen,
        pitcherPitchCountStart: homePitchCount,
        pitcherCondition: home.pitcherCondition,
        batterCondition: away.batterCondition,
        defense: home.defense,
        weather: options.weather,
        ballpark: options.ballpark,
        startingScoreDiff: awayScore - homeScore,
      },
      rng,
    );
    halfInnings.push(top);
    substitutions.push(...top.substitutions);
    awayScore += top.runsScored;
    awayBatterIndex = top.nextBatterIndex;
    awayLineup = top.lineup;
    awayBench = top.bench;
    homePitcher = top.pitcher;
    homeBullpen = top.bullpen;
    homePitchCount = top.pitcherPitchCount;
    lineScore.away.push(top.runsScored);

    // From regulation onward, the home team doesn't need to bat if it's
    // already ahead.
    if (inning >= regulationInnings && homeScore > awayScore) break;

    const isWalkOffInning = inning >= regulationInnings;
    const bottom = simulateHalfInning(
      {
        inning,
        half: 'bottom',
        lineup: homeLineup,
        bench: homeBench,
        startingBatterIndex: homeBatterIndex,
        pitcher: awayPitcher,
        bullpen: awayBullpen,
        pitcherPitchCountStart: awayPitchCount,
        pitcherCondition: away.pitcherCondition,
        batterCondition: home.batterCondition,
        defense: away.defense,
        weather: options.weather,
        ballpark: options.ballpark,
        startingScoreDiff: homeScore - awayScore,
        isGameOver: isWalkOffInning ? (scoreDiff) => scoreDiff > 0 : undefined,
      },
      rng,
    );
    halfInnings.push(bottom);
    substitutions.push(...bottom.substitutions);
    homeScore += bottom.runsScored;
    homeBatterIndex = bottom.nextBatterIndex;
    homeLineup = bottom.lineup;
    homeBench = bottom.bench;
    awayPitcher = bottom.pitcher;
    awayBullpen = bottom.bullpen;
    awayPitchCount = bottom.pitcherPitchCount;
    lineScore.home.push(bottom.runsScored);

    if (inning >= regulationInnings && awayScore !== homeScore) break;
  }

  const winner: GameResult['winner'] = awayScore > homeScore ? 'away' : homeScore > awayScore ? 'home' : 'tie';

  return {
    halfInnings,
    lineScore,
    finalScore: { away: awayScore, home: homeScore },
    totalInnings: lineScore.away.length,
    winner,
    substitutions,
  };
}
