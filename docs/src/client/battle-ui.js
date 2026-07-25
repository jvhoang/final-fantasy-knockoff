/**
 * Pure battle UI helpers (mobile chrome, auto Wait/Face, turn focus zoom).
 * ZOOM_MIN mirrored from arena (avoid importing Three.js here).
 */

/** Must match arena.ZOOM_MIN (face-close capable) */
export const ZOOM_MIN_REF = 0.65;
/** Prior zoom floor before face-close polish */
export const ZOOM_MIN_PRIOR_REF = 2.5;

/** Prior turn-focus orthographic zoom (too far on phone). */
export const PRIOR_TURN_FOCUS_ZOOM = 6.5;

/**
 * Closer than prior 6.5, but not max-close (ZOOM_MIN).
 * Midpoint-ish of (ZOOM_MIN, PRIOR) → readable close-up without extreme clip.
 */
export const TURN_FOCUS_ZOOM = 4.2;

/**
 * Validate turn-focus zoom band for tests + focusOnUnit default.
 * @param {number} [z=TURN_FOCUS_ZOOM]
 */
export function isValidTurnFocusZoom(z = TURN_FOCUS_ZOOM) {
  return z < PRIOR_TURN_FOCUS_ZOOM && z > ZOOM_MIN_REF;
}

/**
 * Auto-open Wait/Face only when both Move and Act are done (only Wait left).
 * Act-first (acted, !moved) must NOT auto-open — player still needs Move.
 * @param {{ moved?: boolean, acted?: boolean }|null|undefined} turn
 * @param {{ canControl?: boolean, phase?: string, busy?: boolean }} [ctx]
 */
export function shouldAutoOpenWaitFace(turn, ctx = {}) {
  if (!turn) return false;
  if (ctx.busy) return false;
  if (ctx.phase && ctx.phase !== 'battle') return false;
  if (ctx.canControl === false) return false;
  // Only Wait remains after Move + Act (Act-second / moved already)
  return !!turn.acted && !!turn.moved;
}

/**
 * Player turn still has Move available.
 */
export function canStillMove(turn) {
  return turn && !turn.moved;
}

/**
 * Player turn still has Act available.
 */
export function canStillAct(turn) {
  return turn && !turn.acted;
}

/**
 * UI mode after a successful player Act on the real click→submit path.
 * - Act-first (moved false): 'idle' so Move stays available
 * - Act-second (moved true): 'wait-face' auto-open
 *
 * @param {{ acted?: boolean, moved?: boolean }|null} turn after applyAction
 * @param {{ canControl?: boolean, phase?: string, unitEnded?: boolean }} ctx
 * @returns {'wait-face'|'idle'}
 */
export function uiModeAfterSuccessfulAct(turn, ctx = {}) {
  if (ctx.unitEnded) return 'idle';
  if (shouldAutoOpenWaitFace(turn, { canControl: ctx.canControl !== false, phase: ctx.phase || 'battle', busy: false })) {
    return 'wait-face';
  }
  return 'idle';
}

/**
 * Post-submit UI mode on the real ability tile-confirm path (onArenaClick → submitAction).
 * Must NOT force idle after submit sets wait-face.
 *
 * @param {'wait-face'|'idle'|string} uiModeAfterSubmit
 * @returns {'wait-face'|'idle'|string}
 */
export function uiModeAfterActClickPath(uiModeAfterSubmit) {
  // Historical bug: onArenaClick set uiMode='idle' after await submitAction(action).
  // Correct path preserves submitAction's wait-face.
  return uiModeAfterSubmit;
}

/**
 * Whether the stationary action chrome should be visible.
 * Hidden during presentation playback; shown only when local player must act.
 *
 * @param {{
 *   busy?: boolean,
 *   canControl?: boolean,
 *   phase?: string,
 *   uiMode?: string,
 * }} ctx
 */
export function shouldShowActionChrome(ctx = {}) {
  if (ctx.busy) return false;
  if (ctx.phase && ctx.phase !== 'battle') return false;
  if (ctx.canControl === false) return false;
  if (!ctx.canControl) return false;
  // Controllable turn and not mid-anim → show Move/Ability/Wait (+ Wait/Face)
  return true;
}
