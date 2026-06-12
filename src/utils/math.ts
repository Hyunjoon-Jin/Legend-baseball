/**
 * Shared math helpers used across the matchup engine.
 * All "rating" inputs are expected on a 0-100 scale unless noted otherwise.
 */

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Logistic curve mapping a rating difference to a probability in (0, 1).
 * `scale` controls how sharply the difference affects the probability;
 * larger scale = gentler curve (a given rating gap matters less).
 */
export function sigmoid(diff: number, scale = 20): number {
  return 1 / (1 + Math.exp(-diff / scale));
}

/**
 * Converts a 0-100 rating into a centered value (-50..50) for use in
 * sigmoid-based comparisons.
 */
export function centered(rating: number): number {
  return rating - 50;
}

/**
 * Standard normal random sample via Box-Muller transform.
 */
export function sampleNormal(mean: number, stdDev: number, rng: () => number = Math.random): number {
  const u1 = Math.max(rng(), Number.EPSILON);
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stdDev;
}

/**
 * Picks an index from a list of non-negative weights, proportional to weight.
 * Falls back to the last index if floating point error leaves a remainder.
 */
export function weightedChoice(weights: number[], rng: () => number = Math.random): number {
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total <= 0) return Math.floor(rng() * weights.length);
  let roll = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return i;
  }
  return weights.length - 1;
}

/**
 * Normalizes a record of weights so its values sum to 1.
 */
export function normalize<K extends string>(weights: Record<K, number>): Record<K, number> {
  const total = Object.values(weights as Record<string, number>).reduce((sum: number, w: number) => sum + w, 0);
  const result = {} as Record<K, number>;
  for (const key of Object.keys(weights) as K[]) {
    result[key] = total > 0 ? weights[key] / total : 0;
  }
  return result;
}

/**
 * Linear interpolation.
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1);
}
