import type { BatterAttributes, PitcherAttributes } from '../types/player.js';
import type { GameSituation } from '../types/situation.js';
import type { BattedBallDirection, BattedBallProfile, BattedBallType } from '../types/outcome.js';
import { clamp, sampleNormal } from '../utils/math.js';
import type { SelectedPitch } from './pitchSelection.js';
import {
  BASE_FLYBALL_DISTANCE_AT_PEAK,
  BATTED_BALL_DIRECTIONS,
  DISTANCE_PER_EXIT_VELO,
  PITCH_TYPE_GROUNDBALL_PULL,
} from '../data/constants.js';

function classifyBattedBallType(launchAngle: number): BattedBallType {
  if (launchAngle < 10) return 'groundBall';
  if (launchAngle < 25) return 'lineDrive';
  if (launchAngle < 50) return 'flyBall';
  return 'popUp';
}

/**
 * Exit velocity in km/h, driven by batter power vs. pitcher stuff with
 * natural contact-quality variance.
 */
function generateExitVelocity(batter: BatterAttributes, pitcher: PitcherAttributes, rng: () => number): number {
  const base = 110 + (batter.power - 50) * 0.6;
  const pitcherSuppression = (pitcher.stuff - 50) * 0.15;
  const noise = sampleNormal(0, 12, rng);
  return clamp(base - pitcherSuppression + noise, 40, 195);
}

/**
 * Launch angle in degrees, driven by swing type, pitch location, and
 * the pitch's natural ground-ball tendency.
 */
function generateLaunchAngle(batter: BatterAttributes, pitch: SelectedPitch, rng: () => number): number {
  const swingBase = batter.swingType === 'upper' ? 18 : batter.swingType === 'down' ? 2 : 10;

  // Pitches up in the zone produce higher launch angles; low pitches produce grounders.
  const locationAdjust = (2 - pitch.zone.row) * 4;

  // Sinkers/splitters etc. push launch angle down even on good contact.
  const groundBallPull = ((PITCH_TYPE_GROUNDBALL_PULL[pitch.pitchType] - 50) / 50) * 8;

  const noise = sampleNormal(0, 16, rng);
  return clamp(swingBase + locationAdjust - groundBallPull + noise, -45, 75);
}

/**
 * Horizontal direction bucket. Pull tendency and pitch location
 * (inside pitches are pulled more, outside pitches are hit the other
 * way) combine into a "pull score" that shifts the distribution across
 * the five direction buckets.
 */
function generateDirection(batter: BatterAttributes, pitcher: PitcherAttributes, pitch: SelectedPitch, rng: () => number): BattedBallDirection {
  // Treat switch hitters as batting from the side opposite the pitcher's hand.
  const effectiveSide = batter.battingSide === 'S' ? (pitcher.throwingHand === 'R' ? 'L' : 'R') : batter.battingSide;

  // col 4 = inside to the batter, col 0 = away. For a right-handed
  // batter, inside pitches are pulled (positive pull score); for a
  // left-handed batter the relationship is mirrored.
  const colOffset = pitch.zone.col - 2; // -2..+2
  const locationPull = effectiveSide === 'R' ? colOffset : -colOffset;

  const tendencyScore = ((batter.pullTendency - 50) / 50) * 2; // -2..+2

  const pullScore = tendencyScore + locationPull * 0.5;

  // Index 0 = pullLine, 4 = oppoLine. Higher pull score shifts toward 0.
  const index = clamp(Math.round(2 - pullScore + sampleNormal(0, 0.8, rng)), 0, 4);
  return BATTED_BALL_DIRECTIONS[index];
}

/**
 * Estimated travel distance in meters, accounting for exit velocity,
 * launch angle (optimal around 28deg), and environmental factors:
 * temperature, humidity, altitude, wind, and ballpark carry.
 */
function generateDistance(exitVelocity: number, launchAngle: number, situation: GameSituation): number {
  const veloDistance = BASE_FLYBALL_DISTANCE_AT_PEAK + (exitVelocity - 145) * DISTANCE_PER_EXIT_VELO;

  // Optimal launch angle for carry is ~28 degrees; falls off on either side.
  const angleFactor = Math.max(0, 1 - Math.pow((launchAngle - 28) / 35, 2));

  let distance = veloDistance * angleFactor;

  const { weather, ballpark } = situation;

  const tempFactor = 1 + (weather.temperatureC - 20) * 0.0015;
  const altitudeFactor = 1 + weather.altitude * 0.00012;
  const humidityFactor = 1 - (weather.humidity - 50) * 0.0005;

  let windFactor = 1;
  if (weather.windDirection === 'out') windFactor = 1 + weather.windSpeedKmh * 0.002;
  else if (weather.windDirection === 'in') windFactor = 1 - weather.windSpeedKmh * 0.002;

  const parkFactor = clamp(ballpark.parkFactorHR, 0.85, 1.15);

  distance *= tempFactor * altitudeFactor * humidityFactor * windFactor * parkFactor;

  return Math.max(0, distance);
}

/**
 * Generates a full physical profile for a ball put in play.
 */
export function generateBattedBall(
  batter: BatterAttributes,
  pitcher: PitcherAttributes,
  pitch: SelectedPitch,
  situation: GameSituation,
  rng: () => number = Math.random,
): BattedBallProfile {
  const exitVelocity = generateExitVelocity(batter, pitcher, rng);
  const launchAngle = generateLaunchAngle(batter, pitch, rng);
  const direction = generateDirection(batter, pitcher, pitch, rng);
  const type = classifyBattedBallType(launchAngle);
  const distance = generateDistance(exitVelocity, launchAngle, situation);

  return { exitVelocity, launchAngle, direction, type, distance };
}
