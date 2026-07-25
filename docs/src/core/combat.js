/**
 * Damage, facing, status application — pure combat math.
 */
import { FACING_BONUS, STATUS } from './constants.js';
import { attackAspect } from './grid.js';

/**
 * @param {import('./ct.js').Unit} attacker
 * @param {import('./ct.js').Unit} defender
 * @param {{ power: number, kind: 'physical'|'magical', element?: string }} ability
 * @param {import('./content/items.js').WeaponDef | null} [weapon]
 */
export function computeDamage(attacker, defender, ability, weapon = null) {
  const aspect = attackAspect(defender.facing, attacker, defender);
  let facingMult = ability.kind === 'physical' ? FACING_BONUS[aspect] : 1.0;

  let base =
    ability.kind === 'physical'
      ? attacker.pa * ability.power + (weapon?.atk ?? 0)
      : attacker.ma * ability.power;

  if (ability.kind === 'physical' && defender.statuses.some((s) => s.id === STATUS.PROTECT)) {
    base *= 0.66;
  }
  if (ability.kind === 'magical' && defender.statuses.some((s) => s.id === STATUS.SHELL)) {
    base *= 0.66;
  }
  if (ability.kind === 'physical' && attacker.statuses.some((s) => s.id === STATUS.BLIND)) {
    // 50% miss represented as 0 damage chance — caller may roll; we use expected half
    base *= 0.5;
  }

  // Height advantage
  const heightDiff = (attacker.y !== undefined ? 0 : 0); // height applied by match layer
  void heightDiff;

  const dmg = Math.max(1, Math.floor(base * facingMult));
  return { damage: dmg, aspect, facingMult };
}

/**
 * Height-aware damage bonus: +1 height ≈ +10% physical.
 * @param {number} attackerHeight
 * @param {number} defenderHeight
 * @param {number} damage
 * @param {'physical'|'magical'} kind
 */
export function applyHeightBonus(attackerHeight, defenderHeight, damage, kind) {
  if (kind !== 'physical') return damage;
  const diff = attackerHeight - defenderHeight;
  if (diff <= 0) return damage;
  return Math.max(1, Math.floor(damage * (1 + 0.1 * Math.min(diff, 3))));
}

/**
 * @param {import('./ct.js').Unit} unit
 * @param {number} amount
 */
export function applyDamage(unit, amount) {
  if (!unit.alive) return 0;
  const dealt = Math.min(unit.hp, Math.max(0, amount));
  unit.hp -= dealt;
  if (unit.hp <= 0) {
    unit.hp = 0;
    unit.alive = false;
    unit.charging = null;
    unit.ct = 0;
  }
  return dealt;
}

/**
 * @param {import('./ct.js').Unit} unit
 * @param {number} amount
 */
export function applyHeal(unit, amount) {
  if (!unit.alive) return 0;
  const before = unit.hp;
  unit.hp = Math.min(unit.maxHp, unit.hp + Math.max(0, amount));
  return unit.hp - before;
}

/**
 * @param {import('./ct.js').Unit} unit
 * @param {string} statusId
 * @param {number} duration
 */
export function applyStatus(unit, statusId, duration) {
  if (!unit.alive) return;
  const existing = unit.statuses.find((s) => s.id === statusId);
  if (existing) {
    existing.duration = Math.max(existing.duration, duration);
  } else {
    unit.statuses.push({ id: statusId, duration });
  }
}

/**
 * Tick status durations at end of a unit's turn; poison damage.
 * @param {import('./ct.js').Unit} unit
 */
export function tickStatusesOnTurnEnd(unit) {
  if (!unit.alive) return;
  if (unit.statuses.some((s) => s.id === STATUS.POISON)) {
    applyDamage(unit, Math.max(1, Math.floor(unit.maxHp * 0.05)));
  }
  unit.statuses = unit.statuses
    .map((s) => ({ ...s, duration: s.duration - 1 }))
    .filter((s) => s.duration > 0);
}

export function isSilenced(unit) {
  return unit.statuses.some((s) => s.id === STATUS.SILENCE);
}

export function isAsleep(unit) {
  return unit.statuses.some((s) => s.id === STATUS.SLEEP);
}
