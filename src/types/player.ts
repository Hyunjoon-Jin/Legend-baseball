/** Pitch types modeled in the engine. */
export type PitchType =
  | 'fourSeam'
  | 'twoSeam'
  | 'sinker'
  | 'cutter'
  | 'slider'
  | 'curve'
  | 'changeup'
  | 'splitter'
  | 'knuckleCurve';

/** A single pitch in a pitcher's repertoire. */
export interface PitchRepertoireEntry {
  type: PitchType;
  /** Average velocity in km/h. */
  velocity: number;
  /** Movement/break magnitude, 0-100. Higher = more deceptive break. */
  movement: number;
  /** Command of this specific pitch, 0-100. */
  control: number;
  /** Base selection weight (0-1) before situational adjustments. */
  usageRate: number;
  /**
   * Ground-ball tendency multiplier for this pitch, 0-100.
   * Sinkers/splitters trend high; four-seams/sliders trend low.
   */
  groundBallTendency: number;
}

/** A pitcher's role within the pitching staff, used for bullpen usage decisions. */
export type PitcherRole = 'starter' | 'longRelief' | 'setup' | 'closer';

export interface PitcherAttributes {
  id: string;
  name: string;
  throwingHand: 'L' | 'R';
  repertoire: PitchRepertoireEntry[];
  /** Overall command/control, 0-100. */
  control: number;
  /** Overall "stuff"/quality of pitches, 0-100. */
  stuff: number;
  /** Stamina, 0-100. Higher = slower fatigue accumulation. */
  stamina: number;
  /** Mental strength / composure under pressure, 0-100. */
  mentalStrength: number;
  /** Recovery rate between outings (used outside single at-bat sim). */
  recovery: number;
  /** General ground-ball induction tendency, 0-100. */
  groundBallTendency: number;
  /** How well the pitcher mixes/sequences pitches to avoid predictability, 0-100. */
  sequencingSkill: number;
  /** Pickoff move quality / quickness to the plate, 0-100. Suppresses opposing steal attempts and success. */
  holdRunnerRating: number;
  /** Bullpen role, used when selecting a reliever for a given situation. Unset = general reliever. */
  role?: PitcherRole;
}

export interface BatterAttributes {
  id: string;
  name: string;
  battingSide: 'L' | 'R' | 'S';
  /** Contact rating vs right-handed pitchers, 0-100. */
  contactVsRight: number;
  /** Contact rating vs left-handed pitchers, 0-100. */
  contactVsLeft: number;
  /** Raw power, 0-100. Drives exit velocity ceiling. */
  power: number;
  /** Plate discipline / zone recognition, 0-100. */
  plateDiscipline: number;
  /** Ability to make quality contact on pitches outside the zone, 0-100. */
  badBallHitting: number;
  /** Sprint speed, 0-100. Used for infield-hit / extra-base / DP avoidance. */
  speed: number;
  /** Pure stolen-base skill (jump, slide, technique), 0-100. */
  stealRating: number;
  /** Baserunning IQ / aggressiveness on extra-base advancement and steal decisions, 0-100. */
  baserunningAggressiveness: number;
  swingType: 'upper' | 'level' | 'down';
  /** Tendency to pull the ball, 0-100 (50 = balanced). */
  pullTendency: number;
  /** Performance stability under pressure (clutch), 0-100. */
  clutch: number;
  /**
   * Optional per-zone hot/cold modifier: 25 entries indexed by `zoneIndex`
   * (see `types/zone.ts`), each roughly -10..+10. Positive = batter makes
   * better contact and hits the ball harder on pitches in that zone;
   * negative = worse. Undefined = perfectly neutral across the zone.
   */
  zoneProfile?: number[];
}
