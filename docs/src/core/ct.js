/**
 * FFT-style Charge Time (CT) clock — shipped combat timing.
 */
import {
  CT_THRESHOLD,
  CT_COST_MOVE_ACT,
  CT_COST_PARTIAL,
  CT_COST_WAIT,
  STATUS,
  HASTE_SPEED_MULT,
  SLOW_SPEED_MULT,
} from './constants.js';

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   team: string,
 *   hp: number,
 *   maxHp: number,
 *   mp: number,
 *   maxMp: number,
 *   speed: number,
 *   ct: number,
 *   move: number,
 *   jump: number,
 *   pa: number,
 *   ma: number,
 *   x: number,
 *   y: number,
 *   facing: import('./constants.js').Facing,
 *   statuses: { id: string, duration: number }[],
 *   alive: boolean,
 *   charging: null | { abilityId: string, target: {x:number,y:number}, chargeLeft: number, castTime: number },
 *   jobId: string,
 *   abilities: string[],
 *   weaponId: string,
 *   armorId: string,
 *   accessoryId?: string,
 * }} Unit
 */

/**
 * Effective speed after Haste/Slow.
 * @param {Unit} unit
 */
export function effectiveSpeed(unit) {
  let mult = 1;
  for (const s of unit.statuses) {
    if (s.id === STATUS.HASTE) mult *= HASTE_SPEED_MULT;
    if (s.id === STATUS.SLOW) mult *= SLOW_SPEED_MULT;
  }
  return Math.max(1, Math.floor(unit.speed * mult));
}

/**
 * One CT clock tick: all living non-charging units gain effective Speed CT.
 * Charging units still gain CT for their personal turn clock? In FFT, charging units
 * freeze for their own turn but charge clock ticks separately. We tick charge clocks
 * in resolveCharges; CT for turn still accumulates for non-charging units only.
 * @param {Unit[]} units
 */
export function tickCt(units) {
  for (const u of units) {
    if (!u.alive) continue;
    if (u.charging) continue; // frozen while casting (FFT-like)
    u.ct += effectiveSpeed(u);
  }
}

/**
 * Units ready for a turn (CT >= threshold), highest CT first, then speed, then id.
 * @param {Unit[]} units
 * @returns {Unit[]}
 */
export function readyUnits(units) {
  return units
    .filter((u) => u.alive && !u.charging && u.ct >= CT_THRESHOLD)
    .sort((a, b) => b.ct - a.ct || b.speed - a.speed || a.id.localeCompare(b.id));
}

/**
 * Tick all charge clocks; resolve any that hit 0.
 * @param {Unit[]} units
 * @param {(caster: Unit, charge: NonNullable<Unit['charging']>) => void} onResolve
 */
export function tickCharges(units, onResolve) {
  for (const u of units) {
    if (!u.alive || !u.charging) continue;
    u.charging.chargeLeft -= 1;
    if (u.charging.chargeLeft <= 0) {
      const charge = u.charging;
      u.charging = null;
      onResolve(u, charge);
    }
  }
}

/**
 * Advance clock until someone is ready or maxTicks.
 * Also ticks charge resolutions each step before checking ready units.
 * @param {Unit[]} units
 * @param {(caster: Unit, charge: NonNullable<Unit['charging']>) => void} [onResolve]
 * @param {number} [maxTicks=10000]
 * @returns {{ ticks: number, active: Unit | null }}
 */
export function advanceUntilTurn(units, onResolve = () => {}, maxTicks = 10000) {
  let ticks = 0;
  while (ticks < maxTicks) {
    const ready = readyUnits(units);
    if (ready.length) return { ticks, active: ready[0] };

    // charges tick each "subframe" with CT
    tickCharges(units, onResolve);
    // after charge resolve someone might still not be ready
    const readyAfterCharge = readyUnits(units);
    if (readyAfterCharge.length) return { ticks, active: readyAfterCharge[0] };

    tickCt(units);
    ticks += 1;
  }
  return { ticks, active: null };
}

/**
 * CT residual after turn based on Move/Act/Wait economy.
 * @param {{ moved: boolean, acted: boolean }} economy
 */
export function ctCostForEconomy(economy) {
  if (economy.moved && economy.acted) return CT_COST_MOVE_ACT;
  if (economy.moved || economy.acted) return CT_COST_PARTIAL;
  return CT_COST_WAIT;
}

/**
 * End active unit turn: subtract CT cost, clamp to >= 0.
 * @param {Unit} unit
 * @param {{ moved: boolean, acted: boolean }} economy
 */
export function endTurn(unit, economy) {
  const cost = ctCostForEconomy(economy);
  unit.ct = Math.max(0, unit.ct - cost);
  return cost;
}

/**
 * Start a charged ability: unit freezes until chargeLeft hits 0.
 * @param {Unit} unit
 * @param {string} abilityId
 * @param {{x:number,y:number}} target
 * @param {number} castTime ticks until resolve
 * @param {string|null} [targetUnitId] follow this unit if they move before resolve
 */
export function beginCharge(unit, abilityId, target, castTime, targetUnitId = null) {
  unit.charging = {
    abilityId,
    target: { x: target.x, y: target.y },
    targetUnitId: targetUnitId || null,
    chargeLeft: castTime,
    castTime,
  };
}

export { CT_THRESHOLD, CT_COST_MOVE_ACT, CT_COST_PARTIAL, CT_COST_WAIT };
