import type { AtBatResult, PlateAppearanceResult } from '../types/outcome.js';
import { isInStrikeZone } from '../types/zone.js';
import type { BatterStatLine, PitcherStatLine } from './types.js';

/** Pitch results that count as a swing by the batter. */
const SWING_RESULTS = new Set(['swingingStrike', 'foulBall', 'foulTip', 'inPlay']);
/** Pitch results that count as a whiff (swing and miss). */
const WHIFF_RESULTS = new Set(['swingingStrike', 'foulTip']);
/** Pitch results that count toward the pitcher's "strike" total. */
const STRIKE_RESULTS = new Set(['calledStrike', 'swingingStrike', 'foulBall', 'foulTip', 'inPlay']);

const HARD_HIT_EXIT_VELO = 152;
const BARREL_EXIT_VELO = 158;
const BARREL_MIN_LAUNCH_ANGLE = 8;
const BARREL_MAX_LAUNCH_ANGLE = 32;

function safeDiv(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

function isPull(direction: string): boolean {
  return direction === 'pullLine' || direction === 'pullGap';
}

function isOppo(direction: string): boolean {
  return direction === 'oppoGap' || direction === 'oppoLine';
}

/**
 * Accumulates plate-appearance results for a single batter and produces a
 * fully detailed `BatterStatLine` on demand.
 */
export class BatterStatsAggregator {
  private plateAppearances = 0;
  private atBats = 0;
  private hits = 0;
  private singles = 0;
  private doubles = 0;
  private triples = 0;
  private homeRuns = 0;
  private walks = 0;
  private intentionalWalks = 0;
  private hitByPitch = 0;
  private strikeouts = 0;
  private strikeoutsSwinging = 0;
  private strikeoutsLooking = 0;
  private sacrificeFlies = 0;
  private sacrificeBunts = 0;
  private groundOuts = 0;
  private flyOuts = 0;
  private lineOuts = 0;
  private popOuts = 0;
  private groundIntoDoublePlay = 0;
  private fieldersChoice = 0;
  private reachedOnError = 0;
  private rbi = 0;
  private stolenBases = 0;
  private caughtStealing = 0;
  private pickedOff = 0;

  private pitchesSeen = 0;
  private swings = 0;
  private whiffs = 0;
  private contacts = 0;
  private zonePitches = 0;
  private zoneSwings = 0;
  private chasePitches = 0;
  private chaseSwings = 0;
  private firstPitches = 0;
  private firstPitchSwings = 0;

  private battedBalls = 0;
  private groundBalls = 0;
  private lineDrives = 0;
  private flyBalls = 0;
  private popUps = 0;
  private pulls = 0;
  private centers = 0;
  private oppos = 0;
  private exitVelocitySum = 0;
  private launchAngleSum = 0;
  private distanceSum = 0;
  private hardHitBalls = 0;
  private barrels = 0;

  private readonly playerId: string;

  constructor(playerId: string) {
    this.playerId = playerId;
  }

  /** Records one plate appearance for this batter. */
  addPlateAppearance(atBat: AtBatResult): void {
    this.recordPitches(atBat);

    if (atBat.result === 'inningEndingCaughtStealing') {
      // The half-inning ended before this plate appearance completed; the
      // batter's count/at-bat resumes next time, so no PA is recorded.
      return;
    }

    this.plateAppearances += 1;
    this.recordResult(atBat.result);
    this.recordBattedBall(atBat);
    this.recordBaseRunning(atBat);

    if (atBat.result !== 'reachedOnError') {
      this.rbi += atBat.runsScored;
    }
  }

  private recordResult(result: PlateAppearanceResult): void {
    switch (result) {
      case 'strikeoutSwinging':
        this.atBats += 1;
        this.strikeouts += 1;
        this.strikeoutsSwinging += 1;
        break;
      case 'strikeoutLooking':
        this.atBats += 1;
        this.strikeouts += 1;
        this.strikeoutsLooking += 1;
        break;
      case 'walk':
        this.walks += 1;
        break;
      case 'intentionalWalk':
        this.walks += 1;
        this.intentionalWalks += 1;
        break;
      case 'hitByPitch':
        this.hitByPitch += 1;
        break;
      case 'single':
      case 'infieldSingle':
        this.atBats += 1;
        this.hits += 1;
        this.singles += 1;
        break;
      case 'double':
        this.atBats += 1;
        this.hits += 1;
        this.doubles += 1;
        break;
      case 'triple':
        this.atBats += 1;
        this.hits += 1;
        this.triples += 1;
        break;
      case 'homeRun':
      case 'insideTheParkHomeRun':
        this.atBats += 1;
        this.hits += 1;
        this.homeRuns += 1;
        break;
      case 'groundOut':
        this.atBats += 1;
        this.groundOuts += 1;
        break;
      case 'flyOut':
        this.atBats += 1;
        this.flyOuts += 1;
        break;
      case 'lineOut':
        this.atBats += 1;
        this.lineOuts += 1;
        break;
      case 'popOut':
        this.atBats += 1;
        this.popOuts += 1;
        break;
      case 'doublePlay':
        this.atBats += 1;
        this.groundOuts += 1;
        this.groundIntoDoublePlay += 1;
        break;
      case 'triplePlay':
        this.atBats += 1;
        this.groundOuts += 1;
        break;
      case 'sacrificeFly':
        this.sacrificeFlies += 1;
        break;
      case 'sacrificeBunt':
        this.sacrificeBunts += 1;
        break;
      case 'fieldersChoice':
        this.atBats += 1;
        this.fieldersChoice += 1;
        break;
      case 'reachedOnError':
        this.atBats += 1;
        this.reachedOnError += 1;
        break;
      case 'catcherInterference':
      case 'inningEndingCaughtStealing':
        break;
    }
  }

  private recordPitches(atBat: AtBatResult): void {
    for (const pitch of atBat.pitches) {
      this.pitchesSeen += 1;
      const inZone = isInStrikeZone(pitch.zone);
      const isFirstPitch = pitch.countBefore.balls === 0 && pitch.countBefore.strikes === 0;

      if (inZone) {
        this.zonePitches += 1;
      } else {
        this.chasePitches += 1;
      }
      if (isFirstPitch) {
        this.firstPitches += 1;
      }

      if (SWING_RESULTS.has(pitch.result)) {
        this.swings += 1;
        if (inZone) {
          this.zoneSwings += 1;
        } else {
          this.chaseSwings += 1;
        }
        if (isFirstPitch) {
          this.firstPitchSwings += 1;
        }
        if (WHIFF_RESULTS.has(pitch.result)) {
          this.whiffs += 1;
        } else {
          this.contacts += 1;
        }
      }
    }
  }

  private recordBattedBall(atBat: AtBatResult): void {
    const bb = atBat.battedBall;
    if (!bb) return;

    this.battedBalls += 1;
    switch (bb.type) {
      case 'groundBall':
        this.groundBalls += 1;
        break;
      case 'lineDrive':
        this.lineDrives += 1;
        break;
      case 'flyBall':
        this.flyBalls += 1;
        break;
      case 'popUp':
        this.popUps += 1;
        break;
    }

    if (isPull(bb.direction)) {
      this.pulls += 1;
    } else if (isOppo(bb.direction)) {
      this.oppos += 1;
    } else {
      this.centers += 1;
    }

    this.exitVelocitySum += bb.exitVelocity;
    this.launchAngleSum += bb.launchAngle;
    this.distanceSum += bb.distance;

    if (bb.exitVelocity >= HARD_HIT_EXIT_VELO) {
      this.hardHitBalls += 1;
    }
    if (
      bb.exitVelocity >= BARREL_EXIT_VELO &&
      bb.launchAngle >= BARREL_MIN_LAUNCH_ANGLE &&
      bb.launchAngle <= BARREL_MAX_LAUNCH_ANGLE
    ) {
      this.barrels += 1;
    }
  }

  private recordBaseRunning(atBat: AtBatResult): void {
    for (const event of atBat.baseRunningEvents) {
      if (event.runnerId !== this.playerId) continue;
      switch (event.type) {
        case 'stolenBaseSuccess':
          this.stolenBases += 1;
          break;
        case 'caughtStealing':
          this.caughtStealing += 1;
          break;
        case 'pickoff':
          this.pickedOff += 1;
          break;
      }
    }
  }

  /** Computes the full counting + rate stat line from accumulated plate appearances. */
  getStatLine(): BatterStatLine {
    const totalBases = this.singles + this.doubles * 2 + this.triples * 3 + this.homeRuns * 4;
    const avg = safeDiv(this.hits, this.atBats);
    const obp = safeDiv(
      this.hits + this.walks + this.hitByPitch,
      this.atBats + this.walks + this.hitByPitch + this.sacrificeFlies,
    );
    const slg = safeDiv(totalBases, this.atBats);
    const babip = safeDiv(
      this.hits - this.homeRuns,
      this.atBats - this.strikeouts - this.homeRuns + this.sacrificeFlies,
    );

    return {
      plateAppearances: this.plateAppearances,
      atBats: this.atBats,
      hits: this.hits,
      singles: this.singles,
      doubles: this.doubles,
      triples: this.triples,
      homeRuns: this.homeRuns,
      totalBases,
      walks: this.walks,
      intentionalWalks: this.intentionalWalks,
      hitByPitch: this.hitByPitch,
      strikeouts: this.strikeouts,
      strikeoutsSwinging: this.strikeoutsSwinging,
      strikeoutsLooking: this.strikeoutsLooking,
      sacrificeFlies: this.sacrificeFlies,
      sacrificeBunts: this.sacrificeBunts,
      groundOuts: this.groundOuts,
      flyOuts: this.flyOuts,
      lineOuts: this.lineOuts,
      popOuts: this.popOuts,
      groundIntoDoublePlay: this.groundIntoDoublePlay,
      fieldersChoice: this.fieldersChoice,
      reachedOnError: this.reachedOnError,
      rbi: this.rbi,
      stolenBases: this.stolenBases,
      caughtStealing: this.caughtStealing,
      pickedOff: this.pickedOff,

      avg,
      obp,
      slg,
      ops: obp + slg,
      iso: slg - avg,
      babip,
      kRate: safeDiv(this.strikeouts, this.plateAppearances),
      bbRate: safeDiv(this.walks, this.plateAppearances),

      pitchesSeen: this.pitchesSeen,
      pitchesPerPlateAppearance: safeDiv(this.pitchesSeen, this.plateAppearances),
      swings: this.swings,
      swingRate: safeDiv(this.swings, this.pitchesSeen),
      contactRate: safeDiv(this.contacts, this.swings),
      whiffRate: safeDiv(this.whiffs, this.swings),
      zonePitches: this.zonePitches,
      zoneSwingRate: safeDiv(this.zoneSwings, this.zonePitches),
      chasePitches: this.chasePitches,
      chaseRate: safeDiv(this.chaseSwings, this.chasePitches),
      firstPitchSwingRate: safeDiv(this.firstPitchSwings, this.firstPitches),

      battedBalls: this.battedBalls,
      groundBallRate: safeDiv(this.groundBalls, this.battedBalls),
      lineDriveRate: safeDiv(this.lineDrives, this.battedBalls),
      flyBallRate: safeDiv(this.flyBalls, this.battedBalls),
      popUpRate: safeDiv(this.popUps, this.battedBalls),
      pullRate: safeDiv(this.pulls, this.battedBalls),
      centerRate: safeDiv(this.centers, this.battedBalls),
      oppoRate: safeDiv(this.oppos, this.battedBalls),
      avgExitVelocity: safeDiv(this.exitVelocitySum, this.battedBalls),
      avgLaunchAngle: safeDiv(this.launchAngleSum, this.battedBalls),
      avgDistance: safeDiv(this.distanceSum, this.battedBalls),
      hardHitRate: safeDiv(this.hardHitBalls, this.battedBalls),
      barrelRate: safeDiv(this.barrels, this.battedBalls),
    };
  }
}

/**
 * Accumulates plate-appearance results faced by a single pitcher and
 * produces a fully detailed `PitcherStatLine` on demand.
 */
export class PitcherStatsAggregator {
  private battersFaced = 0;
  private outs = 0;
  private hits = 0;
  private singles = 0;
  private doubles = 0;
  private triples = 0;
  private homeRuns = 0;
  private runs = 0;
  private earnedRuns = 0;
  private walks = 0;
  private intentionalWalks = 0;
  private hitByPitch = 0;
  private strikeouts = 0;
  private strikeoutsSwinging = 0;
  private strikeoutsLooking = 0;

  private pitchesThrown = 0;
  private strikes = 0;
  private balls = 0;
  private firstPitches = 0;
  private firstPitchStrikes = 0;
  private swingingStrikes = 0;
  private calledStrikes = 0;

  private battedBalls = 0;
  private groundBalls = 0;
  private lineDrives = 0;
  private flyBalls = 0;
  private popUps = 0;

  private stolenBasesAllowed = 0;
  private caughtStealing = 0;
  private pickoffs = 0;

  /** Records the result of one plate appearance against this pitcher. */
  addPlateAppearance(atBat: AtBatResult): void {
    this.recordPitches(atBat);
    this.recordBaseRunning(atBat);

    if (atBat.result === 'inningEndingCaughtStealing') {
      // The half-inning ended on the bases before this batter completed his
      // plate appearance; he is not counted as a batter faced yet.
      return;
    }

    this.battersFaced += 1;
    this.outs += atBat.outsRecorded;
    this.runs += atBat.runsScored;
    if (atBat.result !== 'reachedOnError') {
      this.earnedRuns += atBat.runsScored;
    }
    this.recordResult(atBat.result);
    this.recordBattedBall(atBat);
  }

  private recordResult(result: PlateAppearanceResult): void {
    switch (result) {
      case 'strikeoutSwinging':
        this.strikeouts += 1;
        this.strikeoutsSwinging += 1;
        break;
      case 'strikeoutLooking':
        this.strikeouts += 1;
        this.strikeoutsLooking += 1;
        break;
      case 'walk':
        this.walks += 1;
        break;
      case 'intentionalWalk':
        this.walks += 1;
        this.intentionalWalks += 1;
        break;
      case 'hitByPitch':
        this.hitByPitch += 1;
        break;
      case 'single':
      case 'infieldSingle':
        this.hits += 1;
        this.singles += 1;
        break;
      case 'double':
        this.hits += 1;
        this.doubles += 1;
        break;
      case 'triple':
        this.hits += 1;
        this.triples += 1;
        break;
      case 'homeRun':
      case 'insideTheParkHomeRun':
        this.hits += 1;
        this.homeRuns += 1;
        break;
      default:
        break;
    }
  }

  private recordPitches(atBat: AtBatResult): void {
    for (const pitch of atBat.pitches) {
      this.pitchesThrown += 1;
      const isFirstPitch = pitch.countBefore.balls === 0 && pitch.countBefore.strikes === 0;
      const isStrike = STRIKE_RESULTS.has(pitch.result);

      if (isStrike) {
        this.strikes += 1;
      } else {
        this.balls += 1;
      }
      if (isFirstPitch) {
        this.firstPitches += 1;
        if (isStrike) {
          this.firstPitchStrikes += 1;
        }
      }
      if (pitch.result === 'swingingStrike') {
        this.swingingStrikes += 1;
      } else if (pitch.result === 'calledStrike') {
        this.calledStrikes += 1;
      }
    }
  }

  private recordBattedBall(atBat: AtBatResult): void {
    const bb = atBat.battedBall;
    if (!bb) return;

    this.battedBalls += 1;
    switch (bb.type) {
      case 'groundBall':
        this.groundBalls += 1;
        break;
      case 'lineDrive':
        this.lineDrives += 1;
        break;
      case 'flyBall':
        this.flyBalls += 1;
        break;
      case 'popUp':
        this.popUps += 1;
        break;
    }
  }

  private recordBaseRunning(atBat: AtBatResult): void {
    for (const event of atBat.baseRunningEvents) {
      switch (event.type) {
        case 'stolenBaseSuccess':
          this.stolenBasesAllowed += 1;
          break;
        case 'caughtStealing':
          this.caughtStealing += 1;
          break;
        case 'pickoff':
          this.pickoffs += 1;
          break;
      }
    }
  }

  /** Computes the full counting + rate stat line from accumulated batters faced. */
  getStatLine(): PitcherStatLine {
    const inningsPitched = this.outs / 3;

    return {
      battersFaced: this.battersFaced,
      outs: this.outs,
      inningsPitched,
      hits: this.hits,
      singles: this.singles,
      doubles: this.doubles,
      triples: this.triples,
      homeRuns: this.homeRuns,
      runs: this.runs,
      earnedRuns: this.earnedRuns,
      walks: this.walks,
      intentionalWalks: this.intentionalWalks,
      hitByPitch: this.hitByPitch,
      strikeouts: this.strikeouts,
      strikeoutsSwinging: this.strikeoutsSwinging,
      strikeoutsLooking: this.strikeoutsLooking,

      era: safeDiv(this.earnedRuns * 9, inningsPitched),
      whip: safeDiv(this.walks + this.hits, inningsPitched),
      kPer9: safeDiv(this.strikeouts * 9, inningsPitched),
      bbPer9: safeDiv(this.walks * 9, inningsPitched),
      hrPer9: safeDiv(this.homeRuns * 9, inningsPitched),
      kMinusBbRate: safeDiv(this.strikeouts, this.battersFaced) - safeDiv(this.walks, this.battersFaced),

      pitchesThrown: this.pitchesThrown,
      strikes: this.strikes,
      balls: this.balls,
      strikePercentage: safeDiv(this.strikes, this.pitchesThrown),
      firstPitchStrikePercentage: safeDiv(this.firstPitchStrikes, this.firstPitches),
      swingingStrikeRate: safeDiv(this.swingingStrikes, this.pitchesThrown),
      calledStrikeRate: safeDiv(this.calledStrikes, this.pitchesThrown),

      groundBallRate: safeDiv(this.groundBalls, this.battedBalls),
      lineDriveRate: safeDiv(this.lineDrives, this.battedBalls),
      flyBallRate: safeDiv(this.flyBalls, this.battedBalls),
      popUpRate: safeDiv(this.popUps, this.battedBalls),

      stolenBasesAllowed: this.stolenBasesAllowed,
      caughtStealing: this.caughtStealing,
      pickoffs: this.pickoffs,
    };
  }
}
