/** @typedef {'N'|'E'|'S'|'W'} Facing */

export const PARTY_SIZE = 4;
export const CT_THRESHOLD = 100;

/** CT spent when ending turn with both Move and Act used */
export const CT_COST_MOVE_ACT = 100;
/** CT spent when only Move or only Act (then Wait) */
export const CT_COST_PARTIAL = 80;
/** CT spent when Wait-only (no move, no act) */
export const CT_COST_WAIT = 60;

export const FACING_BONUS = {
  front: 1.0,
  side: 1.25,
  back: 1.5,
};

export const STATUS = {
  HASTE: 'haste',
  SLOW: 'slow',
  POISON: 'poison',
  BLIND: 'blind',
  SILENCE: 'silence',
  PROTECT: 'protect',
  SHELL: 'shell',
  SLEEP: 'sleep',
};

export const HASTE_SPEED_MULT = 1.5;
export const SLOW_SPEED_MULT = 0.5;

export const TEAMS = {
  PLAYER: 'player',
  ENEMY: 'enemy',
};

/**
 * Gil budget per team for 4-unit formation (shop-style).
 * Priced so average weapon+armor+accessory ≈ budget/4 per unit.
 */
export const TEAM_GIL_BUDGET = 12000;
/** Rough average full kit per unit */
export const AVG_UNIT_KIT_GIL = 3000;
