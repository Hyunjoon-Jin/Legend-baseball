/**
 * Fully detailed counting + rate statistics derived from a sequence of
 * plate appearances, from the batter's perspective.
 */
export interface BatterStatLine {
  // --- Counting stats ---
  plateAppearances: number;
  atBats: number;
  hits: number;
  singles: number;
  doubles: number;
  triples: number;
  homeRuns: number;
  totalBases: number;
  walks: number;
  intentionalWalks: number;
  hitByPitch: number;
  strikeouts: number;
  strikeoutsSwinging: number;
  strikeoutsLooking: number;
  sacrificeFlies: number;
  sacrificeBunts: number;
  groundOuts: number;
  flyOuts: number;
  lineOuts: number;
  popOuts: number;
  groundIntoDoublePlay: number;
  fieldersChoice: number;
  reachedOnError: number;
  rbi: number;
  stolenBases: number;
  caughtStealing: number;
  pickedOff: number;

  // --- Rate stats ---
  avg: number;
  obp: number;
  slg: number;
  ops: number;
  iso: number;
  /** Batting average on balls in play. */
  babip: number;
  kRate: number;
  bbRate: number;

  // --- Plate discipline ---
  pitchesSeen: number;
  pitchesPerPlateAppearance: number;
  swings: number;
  swingRate: number;
  /** Contact rate on swings (1 - whiff rate). */
  contactRate: number;
  whiffRate: number;
  zonePitches: number;
  zoneSwingRate: number;
  chasePitches: number;
  /** Swing rate on pitches outside the strike zone. */
  chaseRate: number;
  firstPitchSwingRate: number;

  // --- Batted ball profile ---
  battedBalls: number;
  groundBallRate: number;
  lineDriveRate: number;
  flyBallRate: number;
  popUpRate: number;
  pullRate: number;
  centerRate: number;
  oppoRate: number;
  avgExitVelocity: number;
  avgLaunchAngle: number;
  avgDistance: number;
  hardHitRate: number;
  barrelRate: number;
}

/**
 * Fully detailed counting + rate statistics derived from a sequence of
 * plate appearances, from the opposing pitcher's perspective.
 */
export interface PitcherStatLine {
  battersFaced: number;
  outs: number;
  /** Innings pitched, expressed as outs/3 (e.g. 5.667 = 5 2/3 IP). */
  inningsPitched: number;
  hits: number;
  singles: number;
  doubles: number;
  triples: number;
  homeRuns: number;
  runs: number;
  earnedRuns: number;
  walks: number;
  intentionalWalks: number;
  hitByPitch: number;
  strikeouts: number;
  strikeoutsSwinging: number;
  strikeoutsLooking: number;

  era: number;
  whip: number;
  kPer9: number;
  bbPer9: number;
  hrPer9: number;
  /** Strikeout rate minus walk rate, both per batter faced (K%-BB%). */
  kMinusBbRate: number;

  pitchesThrown: number;
  strikes: number;
  balls: number;
  strikePercentage: number;
  firstPitchStrikePercentage: number;
  swingingStrikeRate: number;
  calledStrikeRate: number;

  groundBallRate: number;
  lineDriveRate: number;
  flyBallRate: number;
  popUpRate: number;

  stolenBasesAllowed: number;
  caughtStealing: number;
  pickoffs: number;
}
