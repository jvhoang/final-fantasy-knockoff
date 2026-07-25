/**
 * Battle presentation pacing — deliberately slow for readability (FFT-like).
 * Holds are longer than the prior polish pass for swing / hurt / spectacle.
 */

/** ms per tile when walking a path */
export const WALK_MS_PER_STEP = 650;

/** Pause after each event before the next */
export const EVENT_GAP_MS = 500;

/** Physical attack wind-up + swing hold (longer, readable sword swing) */
export const ATTACK_HOLD_MS = 1600;

/** Bow draw + flight window */
export const BOW_HOLD_MS = 1800;

/** Target hit reaction (hurt pose) */
export const HIT_HOLD_MS = 1100;

/** Cast-start pose hold (charged spells) */
export const CAST_START_HOLD_MS = 1600;

/** Cast resolve / impact spectacle */
export const CAST_RESOLVE_HOLD_MS = 2800;

/** Summon spectacle hold */
export const SUMMON_HOLD_MS = 3800;

/** Protect / support flash */
export const SUPPORT_HOLD_MS = 900;

/** Floater on-screen duration */
export const FLOATER_MS = 2400;

/** KO ash dissolve duration */
export const KO_ASH_MS = 1600;

/** Post-walk beat before next action */
export const POST_WALK_GAP_MS = 400;

/** Battle begins intro (wide shot → focus first actor) */
export const BATTLE_INTRO_MS = 4200;

/**
 * Magic spectacle scale from MP cost (higher cost = grander / arena-wide).
 * @param {number} mpCost
 * @returns {{ intensity: number, arenaWide: boolean, holdMs: number, rings: number }}
 */
export function magicSpectacleFromMp(mpCost = 0) {
  const cost = Math.max(0, Number(mpCost) || 0);
  const intensity = Math.min(3.2, 0.85 + cost / 12);
  const arenaWide = cost >= 18;
  const rings = arenaWide ? 6 : cost >= 12 ? 4 : cost >= 6 ? 3 : 2;
  const holdMs = arenaWide
    ? SUMMON_HOLD_MS
    : cost >= 12
      ? CAST_RESOLVE_HOLD_MS + 400
      : CAST_RESOLVE_HOLD_MS;
  return { intensity, arenaWide, holdMs, rings, mpCost: cost };
}

/**
 * All timing defaults as a plain object (for tests).
 */
export function getPresentationTiming() {
  return {
    WALK_MS_PER_STEP,
    EVENT_GAP_MS,
    ATTACK_HOLD_MS,
    BOW_HOLD_MS,
    HIT_HOLD_MS,
    CAST_START_HOLD_MS,
    CAST_RESOLVE_HOLD_MS,
    SUMMON_HOLD_MS,
    SUPPORT_HOLD_MS,
    FLOATER_MS,
    KO_ASH_MS,
    POST_WALK_GAP_MS,
    BATTLE_INTRO_MS,
  };
}

/** Prior walk baseline (~200–280ms). New walk must be ≥ 2× 280. */
export const PRIOR_WALK_MS_MAX = 280;

/** Prior attack hold floor from earlier polish (~900). New must be longer. */
export const PRIOR_ATTACK_HOLD_MS = 900;

/**
 * @param {number} ms
 */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
