/**
 * Subjective Ally/Foe labeling for the local viewer.
 */

/**
 * @param {string|null|undefined} viewerTeam 'player' | 'enemy' | null
 * @param {string} unitTeam
 * @returns {'Ally'|'Foe'}
 */
export function teamLabelForViewer(viewerTeam, unitTeam) {
  if (viewerTeam === 'player' || viewerTeam === 'enemy') {
    return unitTeam === viewerTeam ? 'Ally' : 'Foe';
  }
  // Fallback (no viewer context): player side Ally
  return unitTeam === 'player' ? 'Ally' : 'Foe';
}

/**
 * @param {string|null|undefined} viewerTeam
 * @param {string} unitTeam
 */
export function isAllyOfViewer(viewerTeam, unitTeam) {
  return teamLabelForViewer(viewerTeam, unitTeam) === 'Ally';
}
