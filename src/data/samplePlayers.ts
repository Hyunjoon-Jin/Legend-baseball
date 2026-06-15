import type { BatterAttributes, PitcherAttributes } from '../types/player.js';
import { defaultDefense } from '../types/baserunning.js';
import { defaultBallpark, defaultWeather, type GameSituation } from '../types/situation.js';

export const samplePitcher: PitcherAttributes = {
  id: 'p001',
  name: '김선두',
  throwingHand: 'R',
  control: 62,
  stuff: 70,
  stamina: 65,
  mentalStrength: 60,
  recovery: 60,
  groundBallTendency: 55,
  sequencingSkill: 58,
  holdRunnerRating: 55,
  role: 'starter',
  repertoire: [
    { type: 'fourSeam', velocity: 152, movement: 55, control: 65, usageRate: 0.4, groundBallTendency: 35 },
    { type: 'slider', velocity: 134, movement: 70, control: 60, usageRate: 0.25, groundBallTendency: 45 },
    { type: 'changeup', velocity: 138, movement: 65, control: 58, usageRate: 0.15, groundBallTendency: 60 },
    { type: 'curve', velocity: 122, movement: 68, control: 55, usageRate: 0.1, groundBallTendency: 50 },
    { type: 'sinker', velocity: 148, movement: 60, control: 60, usageRate: 0.1, groundBallTendency: 70 },
  ],
};

export const sampleBatter: BatterAttributes = {
  id: 'b001',
  name: '이강타',
  battingSide: 'L',
  contactVsRight: 68,
  contactVsLeft: 60,
  power: 72,
  plateDiscipline: 58,
  badBallHitting: 50,
  speed: 60,
  stealRating: 58,
  baserunningAggressiveness: 55,
  swingType: 'upper',
  pullTendency: 62,
  clutch: 55,
};

export const sampleSituation: GameSituation = {
  inning: 5,
  half: 'top',
  outs: 0,
  balls: 0,
  strikes: 0,
  scoreDiff: 0,
  runners: {},
  pitcherPitchCount: 45,
  pitcherCondition: 55,
  batterCondition: 50,
  weather: defaultWeather,
  ballpark: defaultBallpark,
  defense: defaultDefense,
};

/** A situation with runners on first and second, no outs - useful for testing baserunning. */
export const sampleSituationWithRunners: GameSituation = {
  ...sampleSituation,
  runners: {
    first: { runnerId: 'r001', speed: 65, stealRating: 60, baserunningAggressiveness: 55 },
    second: { runnerId: 'r002', speed: 50, stealRating: 45, baserunningAggressiveness: 50 },
  },
};

/** A second starter with a contrasting (lefty, finesse/control) profile, for two-team simulations. */
export const samplePitcherB: PitcherAttributes = {
  id: 'p002',
  name: '박제구',
  throwingHand: 'L',
  control: 70,
  stuff: 58,
  stamina: 72,
  mentalStrength: 65,
  recovery: 55,
  groundBallTendency: 50,
  sequencingSkill: 64,
  holdRunnerRating: 60,
  role: 'starter',
  repertoire: [
    { type: 'twoSeam', velocity: 142, movement: 50, control: 70, usageRate: 0.35, groundBallTendency: 55 },
    { type: 'slider', velocity: 128, movement: 62, control: 65, usageRate: 0.2, groundBallTendency: 45 },
    { type: 'changeup', velocity: 130, movement: 70, control: 62, usageRate: 0.25, groundBallTendency: 65 },
    { type: 'curve', velocity: 115, movement: 65, control: 60, usageRate: 0.2, groundBallTendency: 50 },
  ],
};

/** A full 9-batter lineup ("away" team), built around `sampleBatter` hitting 3rd. */
export const sampleLineupA: BatterAttributes[] = [
  {
    id: 'a01', name: '박준수', battingSide: 'S', contactVsRight: 66, contactVsLeft: 64, power: 40,
    plateDiscipline: 62, badBallHitting: 52, speed: 82, stealRating: 78, baserunningAggressiveness: 72,
    swingType: 'level', pullTendency: 48, clutch: 52,
  },
  {
    id: 'a02', name: '김도영', battingSide: 'R', contactVsRight: 70, contactVsLeft: 66, power: 50,
    plateDiscipline: 65, badBallHitting: 55, speed: 65, stealRating: 60, baserunningAggressiveness: 58,
    swingType: 'level', pullTendency: 52, clutch: 55,
  },
  sampleBatter,
  {
    id: 'a04', name: '최강산', battingSide: 'R', contactVsRight: 64, contactVsLeft: 60, power: 82,
    plateDiscipline: 55, badBallHitting: 48, speed: 45, stealRating: 35, baserunningAggressiveness: 45,
    swingType: 'upper', pullTendency: 68, clutch: 60,
  },
  {
    id: 'a05', name: '오태양', battingSide: 'R', contactVsRight: 60, contactVsLeft: 58, power: 74,
    plateDiscipline: 50, badBallHitting: 45, speed: 50, stealRating: 40, baserunningAggressiveness: 48,
    swingType: 'upper', pullTendency: 60, clutch: 58,
  },
  {
    id: 'a06', name: '정민호', battingSide: 'L', contactVsRight: 58, contactVsLeft: 52, power: 55,
    plateDiscipline: 50, badBallHitting: 50, speed: 55, stealRating: 50, baserunningAggressiveness: 50,
    swingType: 'level', pullTendency: 50, clutch: 50,
  },
  {
    id: 'a07', name: '한승우', battingSide: 'R', contactVsRight: 52, contactVsLeft: 50, power: 58,
    plateDiscipline: 45, badBallHitting: 42, speed: 40, stealRating: 35, baserunningAggressiveness: 40,
    swingType: 'upper', pullTendency: 58, clutch: 48,
  },
  {
    id: 'a08', name: '윤서준', battingSide: 'R', contactVsRight: 48, contactVsLeft: 46, power: 38,
    plateDiscipline: 42, badBallHitting: 40, speed: 60, stealRating: 55, baserunningAggressiveness: 52,
    swingType: 'level', pullTendency: 50, clutch: 45,
  },
  {
    id: 'a09', name: '강지훈', battingSide: 'L', contactVsRight: 54, contactVsLeft: 50, power: 35,
    plateDiscipline: 48, badBallHitting: 45, speed: 80, stealRating: 75, baserunningAggressiveness: 70,
    swingType: 'level', pullTendency: 45, clutch: 45,
  },
];

/** A full 9-batter lineup ("home" team), for two-team game simulations. */
export const sampleLineupB: BatterAttributes[] = [
  {
    id: 'b01', name: '서동현', battingSide: 'R', contactVsRight: 64, contactVsLeft: 68, power: 42,
    plateDiscipline: 58, badBallHitting: 50, speed: 78, stealRating: 74, baserunningAggressiveness: 68,
    swingType: 'level', pullTendency: 50, clutch: 50,
  },
  {
    id: 'b02', name: '황민재', battingSide: 'L', contactVsRight: 68, contactVsLeft: 64, power: 48,
    plateDiscipline: 60, badBallHitting: 54, speed: 60, stealRating: 55, baserunningAggressiveness: 55,
    swingType: 'level', pullTendency: 48, clutch: 52,
  },
  {
    id: 'b03', name: '배진우', battingSide: 'L', contactVsRight: 66, contactVsLeft: 58, power: 78,
    plateDiscipline: 60, badBallHitting: 55, speed: 55, stealRating: 45, baserunningAggressiveness: 50,
    swingType: 'upper', pullTendency: 64, clutch: 62,
  },
  {
    id: 'b04', name: '노현수', battingSide: 'R', contactVsRight: 62, contactVsLeft: 58, power: 85,
    plateDiscipline: 52, badBallHitting: 46, speed: 42, stealRating: 32, baserunningAggressiveness: 42,
    swingType: 'upper', pullTendency: 70, clutch: 58,
  },
  {
    id: 'b05', name: '임태호', battingSide: 'R', contactVsRight: 58, contactVsLeft: 56, power: 72,
    plateDiscipline: 48, badBallHitting: 44, speed: 48, stealRating: 38, baserunningAggressiveness: 45,
    swingType: 'upper', pullTendency: 58, clutch: 55,
  },
  {
    id: 'b06', name: '신우진', battingSide: 'S', contactVsRight: 58, contactVsLeft: 58, power: 52,
    plateDiscipline: 52, badBallHitting: 50, speed: 58, stealRating: 52, baserunningAggressiveness: 50,
    swingType: 'level', pullTendency: 50, clutch: 50,
  },
  {
    id: 'b07', name: '류성민', battingSide: 'L', contactVsRight: 56, contactVsLeft: 50, power: 50,
    plateDiscipline: 50, badBallHitting: 48, speed: 52, stealRating: 45, baserunningAggressiveness: 45,
    swingType: 'level', pullTendency: 46, clutch: 48,
  },
  {
    id: 'b08', name: '곽지성', battingSide: 'R', contactVsRight: 46, contactVsLeft: 48, power: 40,
    plateDiscipline: 40, badBallHitting: 38, speed: 50, stealRating: 42, baserunningAggressiveness: 45,
    swingType: 'down', pullTendency: 52, clutch: 42,
  },
  {
    id: 'b09', name: '백승호', battingSide: 'R', contactVsRight: 50, contactVsLeft: 52, power: 36,
    plateDiscipline: 45, badBallHitting: 42, speed: 76, stealRating: 70, baserunningAggressiveness: 65,
    swingType: 'level', pullTendency: 48, clutch: 46,
  },
];

/** Relief corps backing up `samplePitcher` (home staff): long relief, setup man, and closer. */
export const sampleBullpenA: PitcherAttributes[] = [
  {
    id: 'p011', name: '홍성호', throwingHand: 'R', control: 58, stuff: 60, stamina: 70,
    mentalStrength: 55, recovery: 65, groundBallTendency: 50, sequencingSkill: 50, holdRunnerRating: 50,
    role: 'longRelief',
    repertoire: [
      { type: 'fourSeam', velocity: 148, movement: 50, control: 60, usageRate: 0.55, groundBallTendency: 35 },
      { type: 'slider', velocity: 132, movement: 60, control: 55, usageRate: 0.45, groundBallTendency: 45 },
    ],
  },
  {
    id: 'p012', name: '이재현', throwingHand: 'L', control: 60, stuff: 68, stamina: 40,
    mentalStrength: 65, recovery: 55, groundBallTendency: 55, sequencingSkill: 55, holdRunnerRating: 55,
    role: 'setup',
    repertoire: [
      { type: 'sinker', velocity: 145, movement: 58, control: 60, usageRate: 0.5, groundBallTendency: 68 },
      { type: 'slider', velocity: 130, movement: 65, control: 58, usageRate: 0.5, groundBallTendency: 48 },
    ],
  },
  {
    id: 'p013', name: '차도진', throwingHand: 'R', control: 64, stuff: 78, stamina: 35,
    mentalStrength: 78, recovery: 50, groundBallTendency: 45, sequencingSkill: 58, holdRunnerRating: 60,
    role: 'closer',
    repertoire: [
      { type: 'fourSeam', velocity: 156, movement: 55, control: 64, usageRate: 0.6, groundBallTendency: 32 },
      { type: 'splitter', velocity: 140, movement: 72, control: 58, usageRate: 0.4, groundBallTendency: 62 },
    ],
  },
];

/** Relief corps backing up `samplePitcherB` (away staff): long relief, setup man, and closer. */
export const sampleBullpenB: PitcherAttributes[] = [
  {
    id: 'p021', name: '신동엽', throwingHand: 'R', control: 60, stuff: 58, stamina: 68,
    mentalStrength: 52, recovery: 62, groundBallTendency: 52, sequencingSkill: 52, holdRunnerRating: 52,
    role: 'longRelief',
    repertoire: [
      { type: 'twoSeam', velocity: 140, movement: 52, control: 62, usageRate: 0.5, groundBallTendency: 58 },
      { type: 'curve', velocity: 118, movement: 64, control: 56, usageRate: 0.5, groundBallTendency: 50 },
    ],
  },
  {
    id: 'p022', name: '곽민기', throwingHand: 'L', control: 62, stuff: 66, stamina: 42,
    mentalStrength: 62, recovery: 55, groundBallTendency: 50, sequencingSkill: 56, holdRunnerRating: 58,
    role: 'setup',
    repertoire: [
      { type: 'fourSeam', velocity: 147, movement: 52, control: 62, usageRate: 0.55, groundBallTendency: 36 },
      { type: 'changeup', velocity: 128, movement: 66, control: 58, usageRate: 0.45, groundBallTendency: 60 },
    ],
  },
  {
    id: 'p023', name: '백건우', throwingHand: 'L', control: 65, stuff: 76, stamina: 38,
    mentalStrength: 76, recovery: 52, groundBallTendency: 48, sequencingSkill: 60, holdRunnerRating: 62,
    role: 'closer',
    repertoire: [
      { type: 'fourSeam', velocity: 153, movement: 54, control: 65, usageRate: 0.6, groundBallTendency: 34 },
      { type: 'slider', velocity: 134, movement: 68, control: 60, usageRate: 0.4, groundBallTendency: 46 },
    ],
  },
];

/** Bench for `sampleLineupA`: a contact bat with a platoon edge vs RHP, and a pinch-running speedster. */
export const sampleBenchA: BatterAttributes[] = [
  {
    id: 'a10', name: '송지훈', battingSide: 'L', contactVsRight: 78, contactVsLeft: 55, power: 45,
    plateDiscipline: 60, badBallHitting: 52, speed: 55, stealRating: 50, baserunningAggressiveness: 50,
    swingType: 'level', pullTendency: 50, clutch: 58,
  },
  {
    id: 'a11', name: '유광민', battingSide: 'S', contactVsRight: 50, contactVsLeft: 48, power: 30,
    plateDiscipline: 45, badBallHitting: 40, speed: 90, stealRating: 85, baserunningAggressiveness: 80,
    swingType: 'level', pullTendency: 48, clutch: 48,
  },
];

/** Bench for `sampleLineupB`: a contact bat with a platoon edge vs LHP, and a pinch-running speedster. */
export const sampleBenchB: BatterAttributes[] = [
  {
    id: 'b10', name: '권혁진', battingSide: 'R', contactVsRight: 55, contactVsLeft: 80, power: 48,
    plateDiscipline: 58, badBallHitting: 50, speed: 50, stealRating: 45, baserunningAggressiveness: 48,
    swingType: 'level', pullTendency: 52, clutch: 56,
  },
  {
    id: 'b11', name: '장도윤', battingSide: 'L', contactVsRight: 48, contactVsLeft: 50, power: 32,
    plateDiscipline: 44, badBallHitting: 40, speed: 88, stealRating: 82, baserunningAggressiveness: 78,
    swingType: 'level', pullTendency: 48, clutch: 46,
  },
];
