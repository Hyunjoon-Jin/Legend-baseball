/**
 * Plate-location grid. 5x5 cells covering the strike zone plus the
 * surrounding "shadow"/chase area.
 *
 *   row 0       = high (above the letters)
 *   row 1-3     = strike zone vertical band
 *   row 4       = low (below the knees)
 *   col 0       = far outside edge (away)
 *   col 1-3     = strike zone horizontal band
 *   col 4       = far inside edge
 *
 * The inner 3x3 (rows 1-3, cols 1-3) is the rulebook strike zone,
 * matching the classic 9-zone "Gameday" grid. The outer ring of 16
 * cells represents pitches that are close but out of the zone
 * ("shadow zone") used for chase/whiff modeling.
 */
export interface ZoneLocation {
  row: 0 | 1 | 2 | 3 | 4;
  col: 0 | 1 | 2 | 3 | 4;
}

export function isInStrikeZone(zone: ZoneLocation): boolean {
  return zone.row >= 1 && zone.row <= 3 && zone.col >= 1 && zone.col <= 3;
}

/**
 * Distance (in grid cells, Chebyshev distance) from the center of the
 * strike zone (row 2, col 2). Used to scale "how good/bad" a location is.
 */
export function distanceFromCenter(zone: ZoneLocation): number {
  return Math.max(Math.abs(zone.row - 2), Math.abs(zone.col - 2));
}

/**
 * The outermost ring of the grid (distance 2 from center) - pitches
 * far enough off the plate to be effectively "waste" pitches.
 */
export function isWastePitch(zone: ZoneLocation): boolean {
  return distanceFromCenter(zone) >= 2;
}

export const ALL_ZONES: ZoneLocation[] = (() => {
  const zones: ZoneLocation[] = [];
  for (let row = 0 as ZoneLocation['row']; row <= 4; row++) {
    for (let col = 0 as ZoneLocation['col']; col <= 4; col++) {
      zones.push({ row, col } as ZoneLocation);
    }
  }
  return zones;
})();
