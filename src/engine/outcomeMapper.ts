import type { BatterAttributes, PitcherAttributes } from '../types/player.js';
import type { BallparkFactors, GameSituation } from '../types/situation.js';
import type { BattedBallProfile, PlateAppearanceResult } from '../types/outcome.js';
import { clamp, lerp } from '../utils/math.js';

export interface BattedBallOutcome {
  result: PlateAppearanceResult;
  basesReached: 0 | 1 | 2 | 3 | 4;
}

function fenceDistanceFor(direction: BattedBallProfile['direction'], ballpark: BallparkFactors): number {
  switch (direction) {
    case 'pullLine':
    case 'oppoLine':
      return ballpark.fenceDistanceLine;
    case 'center':
      return ballpark.fenceDistanceCenter;
    default: // gaps
      return lerp(ballpark.fenceDistanceLine, ballpark.fenceDistanceCenter, 0.65);
  }
}

function countRunners(situation: GameSituation): number {
  const { first, second, third } = situation.runners;
  return Number(!!first) + Number(!!second) + Number(!!third);
}

function resolveGroundBall(
  profile: BattedBallProfile,
  batter: BatterAttributes,
  pitcher: PitcherAttributes,
  situation: GameSituation,
  rng: () => number,
): BattedBallOutcome {
  const speedBonus = ((batter.speed - 50) / 50) * 0.08;
  const hardHitBonus = ((profile.exitVelocity - 95) / 100) * 0.1;
  const hitProb = clamp(0.18 + speedBonus + hardHitBonus, 0.05, 0.45);

  if (rng() < hitProb) {
    const infield = profile.exitVelocity < 100 && batter.speed > 70 && rng() < 0.5;
    const result: PlateAppearanceResult = infield ? 'infieldSingle' : 'single';
    return { result, basesReached: 1 };
  }

  const { runners, outs } = situation;

  // Double / triple play potential with a runner on first and < 2 outs.
  if (runners.first && outs < 2) {
    const dpBase = 0.35;
    const gbTendencyFactor = 0.5 + (pitcher.groundBallTendency / 100) * 0.5;
    const speedRelief = (batter.speed - 50) / 200;
    const dpProb = clamp(dpBase * gbTendencyFactor - speedRelief, 0.05, 0.6);

    if (runners.second && outs === 0 && rng() < dpProb * 0.05) {
      return { result: 'triplePlay', basesReached: 0 };
    }
    if (rng() < dpProb) {
      return { result: 'doublePlay', basesReached: 0 };
    }
  }

  // Fielder's choice: a runner is forced out elsewhere, batter reaches.
  if (countRunners(situation) > 0 && outs < 2 && rng() < 0.08) {
    return { result: 'fieldersChoice', basesReached: 1 };
  }

  // Hard-hit grounders occasionally squeak through on a fielding error.
  if (profile.exitVelocity > 100 && rng() < 0.03) {
    return { result: 'reachedOnError', basesReached: 1 };
  }

  return { result: 'groundOut', basesReached: 0 };
}

function resolveLineDrive(
  profile: BattedBallProfile,
  batter: BatterAttributes,
  situation: GameSituation,
  rng: () => number,
): BattedBallOutcome {
  const hitProb = clamp(0.55 + ((profile.exitVelocity - 100) / 100) * 0.3, 0.3, 0.9);

  if (rng() < hitProb) {
    const fenceDistance = fenceDistanceFor(profile.direction, situation.ballpark);
    const isGap = profile.direction === 'pullGap' || profile.direction === 'oppoGap';

    if (profile.distance >= fenceDistance && profile.exitVelocity >= 140) {
      return { result: 'homeRun', basesReached: 4 };
    }
    if (profile.distance >= fenceDistance * 0.85) {
      const triple = isGap && batter.speed > 65 && rng() < 0.35;
      return { result: triple ? 'triple' : 'double', basesReached: triple ? 3 : 2 };
    }

    return { result: 'single', basesReached: 1 };
  }

  // Line drive double play: caught with a runner off the bag.
  const { runners, outs } = situation;
  if ((runners.first || runners.second || runners.third) && outs < 2 && rng() < 0.05) {
    return { result: 'doublePlay', basesReached: 0 };
  }

  return { result: 'lineOut', basesReached: 0 };
}

function resolveFlyBall(
  profile: BattedBallProfile,
  batter: BatterAttributes,
  situation: GameSituation,
  rng: () => number,
): BattedBallOutcome {
  const fenceDistance = fenceDistanceFor(profile.direction, situation.ballpark);
  const isGap = profile.direction === 'pullGap' || profile.direction === 'oppoGap';
  const ratio = profile.distance / fenceDistance;

  if (ratio >= 1) {
    return { result: 'homeRun', basesReached: 4 };
  }

  // Very deep, well-placed fly ball that doesn't clear the fence:
  // chance of an inside-the-park home run for a fast runner into a gap.
  if (ratio >= 0.95 && isGap && batter.speed > 80 && rng() < 0.15) {
    return { result: 'insideTheParkHomeRun', basesReached: 4 };
  }

  if (ratio >= 0.85) {
    const triple = isGap && batter.speed > 70 && rng() < 0.3;
    return { result: triple ? 'triple' : 'double', basesReached: triple ? 3 : 2 };
  }

  // Sacrifice fly: deep enough fly ball with a runner on third and < 2 outs.
  if (situation.runners.third && situation.outs < 2 && ratio >= 0.55) {
    return { result: 'sacrificeFly', basesReached: 0 };
  }

  return { result: 'flyOut', basesReached: 0 };
}

function resolvePopUp(_profile: BattedBallProfile, situation: GameSituation, rng: () => number): BattedBallOutcome {
  // Larger foul territory gives infielders/catchers more room to make
  // the play, marginally raising the pop-out rate.
  const foulTerritoryBonus = situation.ballpark.foulTerritory === 'large' ? 0.01 : 0;
  const errorProb = clamp(0.02 - foulTerritoryBonus, 0, 0.02);

  if (rng() < errorProb) {
    return { result: 'reachedOnError', basesReached: 1 };
  }
  return { result: 'popOut', basesReached: 0 };
}

/**
 * Resolves a batted-ball profile into a fully detailed plate appearance
 * result (hit type, out type, double play, sacrifice fly, etc.) and the
 * number of bases the batter reaches. Baserunner advancement and runs
 * scored are resolved separately by the baserunning engine.
 */
export function mapBattedBallToOutcome(
  profile: BattedBallProfile,
  batter: BatterAttributes,
  pitcher: PitcherAttributes,
  situation: GameSituation,
  rng: () => number = Math.random,
): BattedBallOutcome {
  switch (profile.type) {
    case 'groundBall':
      return resolveGroundBall(profile, batter, pitcher, situation, rng);
    case 'lineDrive':
      return resolveLineDrive(profile, batter, situation, rng);
    case 'flyBall':
      return resolveFlyBall(profile, batter, situation, rng);
    case 'popUp':
      return resolvePopUp(profile, situation, rng);
  }
}
