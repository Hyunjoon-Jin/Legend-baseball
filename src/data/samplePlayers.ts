import type { BatterAttributes, PitcherAttributes } from '../types/player.js';
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
  swingType: 'upper',
  pullTendency: 62,
  clutch: 55,
}

export const sampleSituation: GameSituation = {
  inning: 5,
  half: 'top',
  outs: 0,
  balls: 0,
  strikes: 0,
  scoreDiff: 0,
  runners: { first: false, second: false, third: false },
  pitcherPitchCount: 45,
  pitcherCondition: 55,
  batterCondition: 50,
  weather: defaultWeather,
  ballpark: defaultBallpark,
};
