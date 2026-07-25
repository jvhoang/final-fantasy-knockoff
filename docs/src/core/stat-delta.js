/**
 * Formation equip change → signed stat deltas for UI feedback.
 */

/** Stats shown next to formation attributes */
export const DELTA_STAT_KEYS = ['hp', 'mp', 'speed', 'move', 'jump', 'def', 'pa', 'ma', 'weaponAtk'];

/**
 * @param {Record<string, number|string>} before
 * @param {Record<string, number|string>} after
 * @returns {{ key: string, before: number, after: number, delta: number }[]}
 */
export function computeStatDeltas(before, after) {
  const out = [];
  if (!before || !after) return out;
  for (const key of DELTA_STAT_KEYS) {
    const b = Number(before[key]);
    const a = Number(after[key]);
    if (!Number.isFinite(b) || !Number.isFinite(a)) continue;
    const delta = a - b;
    if (delta !== 0) out.push({ key, before: b, after: a, delta });
  }
  return out;
}

/**
 * Format for UI: green +1 / red -1
 * @param {number} delta
 */
export function formatStatDelta(delta) {
  if (delta > 0) return `+${delta}`;
  if (delta < 0) return `${delta}`;
  return '0';
}
