/**
 * Battle presentation pacing — deliberately slow for readability (FFT-like).
 * Prior baseline was ~200–280ms per walk step; new defaults are ≥2× slower.
 */

/** ms per tile when walking a path (was ~200–280) */
export const WALK_MS_PER_STEP = 650;

/** Pause after each event before the next (sequential AI readability) */
export const EVENT_GAP_MS = 450;

/** Physical attack wind-up hold */
export const ATTACK_HOLD_MS = 900;

/** Target hit reaction */
export const HIT_HOLD_MS = 700;

/** Cast-start pose hold (charged spells) */
export const CAST_START_HOLD_MS = 1400;

/** Cast resolve / impact spectacle */
export const CAST_RESOLVE_HOLD_MS = 1600;

/** Summon spectacle hold */
export const SUMMON_HOLD_MS = 2200;

/** Protect / support flash */
export const SUPPORT_HOLD_MS = 800;

/** Floater on-screen duration */
export const FLOATER_MS = 2400;

/** KO ash dissolve duration */
export const KO_ASH_MS = 1600;

/** Post-walk beat before next action */
export const POST_WALK_GAP_MS = 350;

/**
 * All timing defaults as a plain object (for tests).
 */
export function getPresentationTiming() {
  return {
    WALK_MS_PER_STEP,
    EVENT_GAP_MS,
    ATTACK_HOLD_MS,
    HIT_HOLD_MS,
    CAST_START_HOLD_MS,
    CAST_RESOLVE_HOLD_MS,
    SUMMON_HOLD_MS,
    SUPPORT_HOLD_MS,
    FLOATER_MS,
    KO_ASH_MS,
    POST_WALK_GAP_MS,
  };
}

/**
 * Prior baseline (~200–280ms). New walk must be ≥ 2× 280.
 */
export const PRIOR_WALK_MS_MAX = 280;

/**
 * @param {number} ms
 */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
