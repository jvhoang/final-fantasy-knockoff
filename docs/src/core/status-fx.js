/**
 * Status effect presentation: attribute deltas + aura style.
 */
import { STATUS } from './constants.js';

/** @type {Record<string, { label: string, deltas: { attr: string, text: string }[], color: number, ring: string }>} */
export const STATUS_PRESENTATION = {
  [STATUS.HASTE]: {
    label: 'Haste',
    deltas: [{ attr: 'Speed', text: '+50% CT gain' }],
    color: 0xffee66,
    ring: '#ffee66',
  },
  [STATUS.SLOW]: {
    label: 'Slow',
    deltas: [{ attr: 'Speed', text: '−50% CT gain' }],
    color: 0x8888ff,
    ring: '#8888ff',
  },
  [STATUS.PROTECT]: {
    label: 'Protect',
    deltas: [{ attr: 'Phys Def', text: '−33% physical dmg taken' }],
    color: 0x88aaff,
    ring: '#88aaff',
  },
  [STATUS.SHELL]: {
    label: 'Shell',
    deltas: [{ attr: 'Mag Def', text: '−33% magical dmg taken' }],
    color: 0xcc88ff,
    ring: '#cc88ff',
  },
  [STATUS.POISON]: {
    label: 'Poison',
    deltas: [{ attr: 'HP', text: '−5% max HP / turn' }],
    color: 0x66ff44,
    ring: '#66ff44',
  },
  [STATUS.BLIND]: {
    label: 'Blind',
    deltas: [{ attr: 'Hit', text: '−50% physical accuracy' }],
    color: 0x444444,
    ring: '#aaaaaa',
  },
  [STATUS.SILENCE]: {
    label: 'Silence',
    deltas: [{ attr: 'Magic', text: 'Cannot cast magic' }],
    color: 0xdddddd,
    ring: '#cccccc',
  },
  [STATUS.SLEEP]: {
    label: 'Sleep',
    deltas: [{ attr: 'Act', text: 'Skip turns' }],
    color: 0xaaccff,
    ring: '#aaccff',
  },
};

/**
 * Floater text for a status apply, including attribute deltas.
 * @param {string} statusId
 */
export function formatStatusApplyText(statusId) {
  const p = STATUS_PRESENTATION[statusId];
  if (!p) return statusId;
  const deltaStr = p.deltas.map((d) => `${d.attr} ${d.text}`).join(' · ');
  return `${p.label}: ${deltaStr}`;
}

/**
 * @param {string} statusId
 */
export function statusAuraStyle(statusId) {
  const p = STATUS_PRESENTATION[statusId];
  if (!p) return { color: 0xffffff, ring: '#ffffff', label: statusId };
  return { color: p.color, ring: p.ring, label: p.label, deltas: p.deltas };
}

/**
 * Resolve charge impact tile, following the target unit if they moved.
 * @param {{ units?: { id: string, x: number, y: number, alive?: boolean }[] }} state
 * @param {{ target?: {x:number,y:number}|null, targetUnitId?: string|null }} charge
 * @returns {{ x: number, y: number, unitId?: string|null }|null}
 */
export function resolveChargeTarget(state, charge) {
  if (!charge) return null;
  if (charge.targetUnitId && state?.units) {
    const u = state.units.find((x) => x.id === charge.targetUnitId && x.alive !== false);
    if (u) return { x: u.x, y: u.y, unitId: u.id };
  }
  if (charge.target && typeof charge.target.x === 'number') {
    return { x: charge.target.x, y: charge.target.y, unitId: charge.targetUnitId || null };
  }
  return null;
}

/**
 * Pick target unit id at a tile when beginning a charge.
 * @param {{ units?: { id: string, x: number, y: number, alive?: boolean }[] }} state
 * @param {{x:number,y:number}} target
 */
export function pickTargetUnitIdAt(state, target) {
  if (!target || !state?.units) return null;
  const u = state.units.find((x) => x.alive !== false && x.x === target.x && x.y === target.y);
  return u?.id || null;
}
