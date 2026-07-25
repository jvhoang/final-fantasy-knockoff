/**
 * Bottom unit panel target: active turn default vs explicit inspect override.
 */

/**
 * @param {{ activeUnitId?: string|null, inspectId?: string|null, clearInspectOnTurnChange?: boolean }} opts
 * @param {string|null} [prevActiveId] previous active unit (to clear stale inspect on turn change)
 * @returns {{ panelUnitId: string|null, highlightUnitId: string|null, inspectOverride: boolean, nextInspectId: string|null }}
 */
export function resolvePanelTarget(opts = {}, prevActiveId = null) {
  const active = opts.activeUnitId || null;
  let inspect = opts.inspectId || null;
  // When turn changes, drop inspect so panel follows new active unit
  if (opts.clearInspectOnTurnChange !== false && active && prevActiveId && active !== prevActiveId) {
    if (inspect && inspect !== active) {
      // keep inspect only if user just selected mid-turn; clear when turn switches
      inspect = null;
    }
  }
  const inspectOverride = !!(inspect && inspect !== active);
  const panelUnitId = inspect || active || null;
  // Highlight inspect when override; otherwise highlight active
  const highlightUnitId = inspect || active || null;
  return {
    panelUnitId,
    highlightUnitId,
    inspectOverride,
    nextInspectId: inspect,
  };
}

/**
 * Whether inspect highlight should use a distinct style from active-turn ring.
 * @param {string|null} inspectId
 * @param {string|null} activeId
 */
export function useInspectHighlightStyle(inspectId, activeId) {
  return !!(inspectId && activeId && inspectId !== activeId);
}
