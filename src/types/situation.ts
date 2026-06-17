import type { BaseRunners, DefensiveTeamRatings } from './baserunning.js';

export type WindDirection = 'in' | 'out' | 'crosswind' | 'none';

export interface WeatherConditions {
  /** Temperature in Celsius. Warmer air -> ball carries further. */
  temperatureC: number;
  /** Wind speed in km/h. */
  windSpeedKmh: number;
  /** Wind direction relative to the outfield (blowing in/out/crosswind). */
  windDirection: WindDirection;
  /** Relative humidity, 0-100. Higher humidity -> slightly less carry. */
  humidity: number;
  /** Altitude in meters above sea level. Higher -> ball carries further. */
  altitude: number;
}

export interface BallparkFactors {
  name: string;
  /** Multiplier applied to home run probability (1.0 = neutral). */
  parkFactorHR: number;
  /** Multiplier applied to overall hit probability (1.0 = neutral). */
  parkFactorHits: number;
  /** Distance to center field fence in meters. */
  fenceDistanceCenter: number;
  /** Distance to the foul lines in meters. */
  fenceDistanceLine: number;
  /** Foul territory size, affects foul-out chances. */
  foulTerritory: 'small' | 'average' | 'large';
}

export interface GameSituation {
  inning: number;
  half: 'top' | 'bottom';
  outs: 0 | 1 | 2;
  balls: 0 | 1 | 2 | 3;
  strikes: 0 | 1 | 2;
  /** Score differential from the batting team's perspective. */
  scoreDiff: number;
  runners: BaseRunners;
  /** Pitches thrown so far this game by the pitcher. */
  pitcherPitchCount: number;
  /** Daily condition modifier for the pitcher, 0-100 (50 = normal). */
  pitcherCondition: number;
  /** Daily condition modifier for the batter, 0-100 (50 = normal). */
  batterCondition: number;
  weather: WeatherConditions;
  ballpark: BallparkFactors;
  /** Fielding team's defensive ratings (catcher arm, infield/outfield range and arm). */
  defense: DefensiveTeamRatings;
  /**
   * Threat level (1-99) of the on-deck batter, used for "lineup protection":
   * pitchers nibble more against the current batter when the on-deck hitter
   * is weak, and challenge the zone more when he's equally dangerous.
   * Defaults to 50 (neutral) when omitted.
   */
  onDeckThreat?: number;
  /**
   * Runs the current pitcher has allowed so far in this half-inning, reset
   * to 0 whenever a new pitcher enters mid-inning. Used to trigger a
   * "disaster start" pitching change when a pitcher is getting shelled,
   * independent of his pitch count/fatigue. Defaults to 0 when omitted.
   */
  runsAllowedThisInning?: number;
}

export const defaultWeather: WeatherConditions = {
  temperatureC: 22,
  windSpeedKmh: 0,
  windDirection: 'none',
  humidity: 50,
  altitude: 50,
};

export const defaultBallpark: BallparkFactors = {
  name: 'Neutral Park',
  parkFactorHR: 1.0,
  parkFactorHits: 1.0,
  fenceDistanceCenter: 122,
  fenceDistanceLine: 100,
  foulTerritory: 'average',
};
