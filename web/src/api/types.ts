// Minimal mirrors of the server's JSON shapes (see ../../../src/types and
// ../../../src/season). Kept independent of the engine's TS project so the
// frontend can be built/typechecked standalone.

export interface PitchRepertoireEntry {
  type: string;
  velocity: number;
  movement: number;
  control: number;
  usageRate: number;
  groundBallTendency: number;
}

export interface PitcherAttributes {
  id: string;
  name: string;
  throwingHand: 'L' | 'R';
  repertoire: PitchRepertoireEntry[];
  control: number;
  stuff: number;
  stamina: number;
  mentalStrength: number;
  recovery: number;
  groundBallTendency: number;
  sequencingSkill: number;
  holdRunnerRating: number;
  role?: string;
}

export interface BatterAttributes {
  id: string;
  name: string;
  battingSide: 'L' | 'R' | 'S';
  contactVsRight: number;
  contactVsLeft: number;
  power: number;
  plateDiscipline: number;
  badBallHitting: number;
  speed: number;
  stealRating: number;
  baserunningAggressiveness: number;
  swingType: 'upper' | 'level' | 'down';
  pullTendency: number;
  clutch: number;
}

export interface DefensiveTeamRatings {
  catcherArm: number;
  infieldDefense: number;
  outfieldDefense: number;
  outfieldArm: number;
}

export interface TeamSetup {
  name: string;
  lineup: BatterAttributes[];
  bench?: BatterAttributes[];
  pitcher: PitcherAttributes;
  bullpen?: PitcherAttributes[];
  defense: DefensiveTeamRatings;
  pitcherCondition?: number;
  batterCondition?: number;
}

export interface LeagueTeam {
  id: string;
  setup: TeamSetup;
  rotation: PitcherAttributes[];
}

export interface LeagueResponse {
  teams: LeagueTeam[];
  teamNames: string[];
  defaultStrengths: number[];
}

export interface WeatherConditions {
  temperatureC: number;
  windSpeedKmh: number;
  windDirection: 'in' | 'out' | 'crosswind' | 'none';
  humidity: number;
  altitude: number;
}

// --- Single game ---

export type PlateAppearanceResult =
  | 'strikeoutSwinging'
  | 'strikeoutLooking'
  | 'walk'
  | 'intentionalWalk'
  | 'hitByPitch'
  | 'single'
  | 'infieldSingle'
  | 'double'
  | 'triple'
  | 'homeRun'
  | 'insideTheParkHomeRun'
  | 'groundOut'
  | 'flyOut'
  | 'lineOut'
  | 'popOut'
  | 'doublePlay'
  | 'triplePlay'
  | 'sacrificeFly'
  | 'sacrificeBunt'
  | 'fieldersChoice'
  | 'reachedOnError'
  | 'catcherInterference'
  | 'inningEndingCaughtStealing';

export type OutcomeCategory = 'hit' | 'out' | 'walk' | 'strikeout' | 'hitByPitch' | 'other';

export interface AtBatResult {
  result: PlateAppearanceResult;
  category: OutcomeCategory;
  basesReached: 0 | 1 | 2 | 3 | 4;
  runsScored: number;
  outsRecorded: 0 | 1 | 2 | 3;
}

export interface InningPlateAppearance {
  lineupIndex: number;
  batter: { id: string; name: string };
  pitcher: { id: string; name: string };
  atBat: AtBatResult;
  outsAfter: 0 | 1 | 2 | 3;
  runsAfter: number;
  scoreDiffAfter: number;
}

export type SubstitutionType = 'pitchingChange' | 'pinchHitter' | 'pinchRunner';

export interface SubstitutionEvent {
  inning: number;
  half: 'top' | 'bottom';
  type: SubstitutionType;
  lineupIndex?: number;
  outgoing: { id: string; name: string };
  incoming: { id: string; name: string };
  reason: string;
}

export interface HalfInningResult {
  inning: number;
  half: 'top' | 'bottom';
  plateAppearances: InningPlateAppearance[];
  runsScored: number;
  hits: number;
  walks: number;
  strikeouts: number;
  leftOnBase: 0 | 1 | 2 | 3;
  endedByWalkOff: boolean;
  substitutions: SubstitutionEvent[];
}

export interface GameResult {
  halfInnings: HalfInningResult[];
  lineScore: { away: number[]; home: number[] };
  finalScore: { away: number; home: number };
  totalInnings: number;
  winner: 'away' | 'home' | 'tie';
  substitutions: SubstitutionEvent[];
}

// --- Season ---

export interface StandingsRow {
  teamId: string;
  wins: number;
  losses: number;
  ties: number;
  runsScored: number;
  runsAllowed: number;
  winPct: number;
  gamesBehind: number;
}

export type PostseasonRoundName = 'wildCard' | 'semiPlayoff' | 'playoff' | 'koreanSeries';

export interface PostseasonGame {
  round: PostseasonRoundName;
  gameNumber: number;
  homeTeamId: string;
  awayTeamId: string;
  winner: 'home' | 'away' | 'tie';
  homeRuns: number;
  awayRuns: number;
}

export interface PostseasonSeries {
  round: PostseasonRoundName;
  higherSeedId: string;
  lowerSeedId: string;
  games: PostseasonGame[];
  winnerId: string;
}

export interface PostseasonResult {
  series: PostseasonSeries[];
  championId: string;
}

export interface LeaderEntry {
  playerId: string;
  name: string;
  value: number;
}

export interface BattingLeaders {
  avg: LeaderEntry[];
  homeRuns: LeaderEntry[];
  rbi: LeaderEntry[];
  ops: LeaderEntry[];
}

export interface PitchingLeaders {
  era: LeaderEntry[];
  strikeouts: LeaderEntry[];
  whip: LeaderEntry[];
}

export interface SeasonResponse {
  standings: StandingsRow[];
  postseason: PostseasonResult;
  battingLeaders: BattingLeaders;
  pitchingLeaders: PitchingLeaders;
}
