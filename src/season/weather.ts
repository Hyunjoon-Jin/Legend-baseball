import { defaultWeather, type WeatherConditions } from '../types/situation.js';

const WIND_DIRECTIONS: readonly WeatherConditions['windDirection'][] = ['in', 'out', 'crosswind'];

/**
 * Generates weather for a single game based on how far through the season
 * it falls (`progress`: 0 = opening day, 1 = season finale). Models a
 * KBO-style spring-to-fall arc: cool at the edges of the season, hottest
 * and most humid in midsummer, with day-to-day random variation layered on
 * top.
 */
export function seasonWeather(progress: number, rng: () => number): WeatherConditions {
  const seasonalTemp = 12 + 18 * Math.sin(Math.PI * progress);
  const temperatureC = Math.round(seasonalTemp + (rng() * 2 - 1) * 5);

  const seasonalHumidity = 45 + 25 * Math.sin(Math.PI * progress);
  const humidity = Math.round(Math.max(20, Math.min(95, seasonalHumidity + (rng() * 2 - 1) * 10)));

  const windSpeedKmh = Math.round(rng() * 15);
  const windDirection = windSpeedKmh === 0 ? 'none' : WIND_DIRECTIONS[Math.floor(rng() * WIND_DIRECTIONS.length)];

  return { ...defaultWeather, temperatureC, humidity, windSpeedKmh, windDirection };
}
