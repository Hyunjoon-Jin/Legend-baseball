import type { BatterAttributes, PitcherAttributes } from '../types/player.js';
import type { BallparkFactors, GameSituation, WeatherConditions } from '../types/situation.js';
import { defaultBallpark, defaultWeather } from '../types/situation.js';
import type { BaseRunners, DefensiveTeamRatings } from '../types/baserunning.js';
import type { HalfInningResult, InningPlateAppearance, Lineup, SubstitutionEvent } from '../types/game.js';
import { OUTCOME_CATEGORY } from '../types/outcome.js';
import { batterToRunner, resolveIntentionalWalk, simulateAtBat } from './matchupEngine.js';
import { batterThreatLevel, decideIntentionalWalk, decidePinchHitter, decidePinchRunner, decidePitchingChange, selectReliever } from './managerStrategy.js';

/** Safety guard against pathological loops (e.g. endless walks/errors). */
const MAX_PLATE_APPEARANCES_PER_HALF_INNING = 60;

/** Maps a batter's `basesReached` (1-3) to the base he ends up occupying. */
const BASE_FOR_BASES_REACHED: Record<1 | 2 | 3, keyof BaseRunners> = {
  1: 'first',
  2: 'second',
  3: 'third',
};

export interface HalfInningContext {
  inning: number;
  half: 'top' | 'bottom';
  /** Batting team's lineup, in order. */
  lineup: Lineup;
  /** Batting team's available bench (pinch hitters/runners). Defaults to none. */
  bench?: readonly BatterAttributes[];
  /** Lineup index (0-based) of the first batter due up. Defaults to 0. */
  startingBatterIndex?: number;
  /** Defending team's current pitcher. */
  pitcher: PitcherAttributes;
  /** Defending team's available relief pitchers. Defaults to none. */
  bullpen?: readonly PitcherAttributes[];
  /** Current pitcher's cumulative pitch count entering this half-inning. Defaults to 0. */
  pitcherPitchCountStart?: number;
  /** Pitcher's daily condition modifier, 0-100 (50 = normal). Defaults to 50. */
  pitcherCondition?: number;
  /** Batting team's daily condition modifier, 0-100 (50 = normal). Defaults to 50. */
  batterCondition?: number;
  /** Defending team's fielding ratings. */
  defense: DefensiveTeamRatings;
  weather?: WeatherConditions;
  ballpark?: BallparkFactors;
  /** Score differential from the batting team's perspective at the start of the half-inning. Defaults to 0. */
  startingScoreDiff?: number;
  /** Outs already recorded at the start of the half-inning. Defaults to 0. */
  startingOuts?: 0 | 1 | 2;
  /** Runners already on base at the start of the half-inning. Defaults to empty. */
  startingRunners?: BaseRunners;
  /**
   * Checked after each completed plate appearance with the updated score
   * differential (batting team's perspective). If it returns true, the
   * half-inning ends immediately - used for walk-off conditions in the
   * bottom of the 9th or later.
   */
  isGameOver?: (scoreDiff: number) => boolean;
}

/**
 * Simulates one half-inning (top or bottom) by repeatedly calling
 * `simulateAtBat`, rotating through the batting order, carrying baserunners
 * and the score differential from one plate appearance to the next, and
 * accumulating the pitcher's pitch count for fatigue modeling on subsequent
 * half-innings.
 *
 * Before each plate appearance, the defense may bring in a relief pitcher
 * (based on fatigue and leverage) and the offense may send up a pinch
 * hitter (based on platoon advantage and leverage). Immediately after a
 * batter reaches base, the offense may replace him with a faster pinch
 * runner. Any substitution permanently replaces that player in the lineup
 * /pitching staff for the rest of the game - see `SubstitutionEvent`s in
 * the returned result.
 *
 * The half-inning normally ends once 3 outs are recorded. If `isGameOver`
 * is supplied and returns true after a play (e.g. a walk-off run), the
 * half-inning ends immediately even with fewer than 3 outs.
 *
 * A batter whose plate appearance is interrupted by an inning-ending caught
 * stealing/pickoff (`inningEndingCaughtStealing`) remains "due up" - the
 * returned `nextBatterIndex` will point back at him so his at-bat resumes
 * fresh next time this team bats.
 */
export function simulateHalfInning(ctx: HalfInningContext, rng: () => number = Math.random): HalfInningResult {
  const lineup = [...ctx.lineup];
  if (lineup.length === 0) throw new Error('lineup must contain at least one batter');
  let bench = [...(ctx.bench ?? [])];

  let pitcher = ctx.pitcher;
  let pitcherPitchCount = ctx.pitcherPitchCountStart ?? 0;
  let bullpen = [...(ctx.bullpen ?? [])];

  let batterIndex = ctx.startingBatterIndex ?? 0;
  let outs: number = ctx.startingOuts ?? 0;
  let runners: BaseRunners = ctx.startingRunners ?? {};
  let scoreDiff = ctx.startingScoreDiff ?? 0;

  const weather = ctx.weather ?? defaultWeather;
  const ballpark = ctx.ballpark ?? defaultBallpark;
  const pitcherCondition = ctx.pitcherCondition ?? 50;
  const batterCondition = ctx.batterCondition ?? 50;

  const plateAppearances: InningPlateAppearance[] = [];
  const substitutions: SubstitutionEvent[] = [];
  let runsScored = 0;
  let hits = 0;
  let walks = 0;
  let strikeouts = 0;
  let pitchesThisHalfInning = 0;
  let endedByWalkOff = false;

  for (let i = 0; i < MAX_PLATE_APPEARANCES_PER_HALF_INNING && outs < 3; i++) {
    const lineupIndex = batterIndex % lineup.length;
    const onDeckBatter = lineup[(lineupIndex + 1) % lineup.length];

    const lookahead: GameSituation = {
      inning: ctx.inning,
      half: ctx.half,
      outs: outs as 0 | 1 | 2,
      balls: 0,
      strikes: 0,
      scoreDiff,
      runners,
      pitcherPitchCount,
      pitcherCondition,
      batterCondition,
      weather,
      ballpark,
      defense: ctx.defense,
      onDeckThreat: batterThreatLevel(onDeckBatter),
    };

    // Pinch hitter, decided before the at-bat begins.
    const pinchHitter = decidePinchHitter(lineup[lineupIndex], bench, pitcher, lookahead, rng);
    if (pinchHitter) {
      substitutions.push({
        inning: ctx.inning,
        half: ctx.half,
        type: 'pinchHitter',
        lineupIndex,
        outgoing: { id: lineup[lineupIndex].id, name: lineup[lineupIndex].name },
        incoming: { id: pinchHitter.id, name: pinchHitter.name },
        reason: '플래툰 우위 대타',
      });
      bench = bench.filter((b) => b.id !== pinchHitter.id);
      lineup[lineupIndex] = pinchHitter;
    }

    // Pitching change, decided before the at-bat begins.
    if (decidePitchingChange(pitcher, pitcherPitchCount, bullpen.length > 0, lookahead, rng)) {
      const reliever = selectReliever(bullpen, lookahead);
      if (reliever) {
        substitutions.push({
          inning: ctx.inning,
          half: ctx.half,
          type: 'pitchingChange',
          outgoing: { id: pitcher.id, name: pitcher.name },
          incoming: { id: reliever.id, name: reliever.name },
          reason: '투수 교체',
        });
        bullpen = bullpen.filter((p) => p.id !== reliever.id);
        pitcher = reliever;
        pitcherPitchCount = 0;
      }
    }

    const batter = lineup[lineupIndex];
    const situation: GameSituation = { ...lookahead, pitcherPitchCount };

    const atBat = decideIntentionalWalk(batter, onDeckBatter, situation, rng)
      ? resolveIntentionalWalk(batter, runners, situation, rng)
      : simulateAtBat(pitcher, batter, situation, rng);

    pitcherPitchCount += atBat.pitches.length;
    pitchesThisHalfInning += atBat.pitches.length;
    outs = Math.min(3, outs + atBat.outsRecorded);
    runners = atBat.finalRunners;
    runsScored += atBat.runsScored;
    scoreDiff += atBat.runsScored;

    const category = OUTCOME_CATEGORY[atBat.result];
    if (category === 'hit') hits++;
    else if (category === 'walk') walks++;
    else if (category === 'strikeout') strikeouts++;

    // Pinch runner, decided right after the batter reaches base.
    if (atBat.basesReached >= 1 && atBat.basesReached <= 3) {
      const baseKey = BASE_FOR_BASES_REACHED[atBat.basesReached as 1 | 2 | 3];
      const newRunner = runners[baseKey];
      if (newRunner && newRunner.runnerId === batter.id) {
        const pinchRunner = decidePinchRunner(newRunner, bench, { ...situation, runners }, rng);
        if (pinchRunner) {
          substitutions.push({
            inning: ctx.inning,
            half: ctx.half,
            type: 'pinchRunner',
            lineupIndex,
            outgoing: { id: batter.id, name: batter.name },
            incoming: { id: pinchRunner.id, name: pinchRunner.name },
            reason: '주력 강화 대주자',
          });
          bench = bench.filter((b) => b.id !== pinchRunner.id);
          runners = { ...runners, [baseKey]: batterToRunner(pinchRunner) };
          lineup[lineupIndex] = pinchRunner;
        }
      }
    }

    plateAppearances.push({
      lineupIndex,
      batter,
      pitcher,
      atBat,
      outsAfter: outs as 0 | 1 | 2 | 3,
      runsAfter: runsScored,
      scoreDiffAfter: scoreDiff,
    });

    // A caught-stealing/pickoff that ends the inning mid-at-bat leaves this
    // batter still due up; everyone else advances normally.
    if (atBat.result !== 'inningEndingCaughtStealing') {
      batterIndex++;
    }

    if (ctx.isGameOver?.(scoreDiff)) {
      endedByWalkOff = true;
      break;
    }
  }

  const leftOnBase = (Number(!!runners.first) + Number(!!runners.second) + Number(!!runners.third)) as 0 | 1 | 2 | 3;

  return {
    inning: ctx.inning,
    half: ctx.half,
    plateAppearances,
    runsScored,
    hits,
    walks,
    strikeouts,
    leftOnBase,
    pitchesThrown: pitchesThisHalfInning,
    nextBatterIndex: batterIndex % lineup.length,
    pitcherPitchCount,
    endedByWalkOff,
    lineup,
    bench,
    pitcher,
    bullpen,
    substitutions,
  };
}
