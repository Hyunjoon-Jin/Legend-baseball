/**
 * Roster-size and career-cycle constants for the player operations system.
 * Centralized here so they can later be exposed as difficulty/mode settings.
 */

/** Maximum players with `rosterStatus === '1군'` during the regular season. */
export const ACTIVE_ROSTER_SIZE = 26;

/** Active roster cap once the September expansion roster kicks in. */
export const EXPANDED_ROSTER_SIZE = 28;

/** Zero-based game index (out of 144) at which the expanded roster takes effect. */
export const EXPANSION_GAME_INDEX = 120;

/** Zero-based game index (out of 144) after which trades are no longer allowed. */
export const TRADE_DEADLINE_GAME_INDEX = 110;

/** Total players an organization may hold across 1군/2군/injured list. */
export const TOTAL_SQUAD_SIZE = 65;

/** Maximum foreign players (`origin === 'foreign'`) an organization may hold. */
export const FOREIGN_SLOTS = 3;

/** Maximum Asia-quota players (`origin === 'asiaQuota'`) an organization may hold. */
export const ASIA_QUOTA_SLOTS = 1;

/** Number of rounds in the annual rookie draft. */
export const DRAFT_ROUNDS = 3;

/** How often (in years) the secondary draft occurs. */
export const SECONDARY_DRAFT_CYCLE_YEARS = 3;

/** Number of players each team protects from the secondary draft. */
export const SECONDARY_DRAFT_PROTECTED_SIZE = 35;

/**
 * Years of KBO 1군 service time required for domestic free agency.
 * KBO rule: 고졸 9년, 대졸 8년. Most pros are 고졸, so 9 is the standard threshold.
 */
export const FA_ELIGIBILITY_YEARS = 9;

/** Age at which retirement probability starts becoming meaningful. */
export const RETIREMENT_SOFT_AGE = 36;

/** Age at which a player is forced to retire. */
export const RETIREMENT_HARD_AGE = 43;

/** Age at which batter ratings peak before decline begins. */
export const PEAK_AGE_BATTER = 27;

/** Age at which pitcher ratings peak before decline begins. */
export const PEAK_AGE_PITCHER = 28;

/** Base per-game probability that an active (1군) player suffers a new injury. */
export const INJURY_BASE_PROBABILITY = 0.0015;

/** Age above which injury risk increases for each additional year. */
export const INJURY_AGE_RISK_THRESHOLD = 33;
