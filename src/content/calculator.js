/**
 * Calculator / Arithmeticks: CT number choices beyond a single fixed 3.
 */

/** Distinct CT charge numbers the player can pick for math abilities */
export const CALCULATOR_CT_NUMBERS = [2, 3, 4, 5, 6];

/** Ability ids that accept a Calculator CT override */
export const MATH_ABILITY_IDS = ['math_fire', 'math_cure', 'math_bolt'];

/**
 * @param {string} abilityId
 */
export function isMathAbility(abilityId) {
  return MATH_ABILITY_IDS.includes(String(abilityId || ''));
}

/**
 * Resolve cast time for an ability, applying Calculator CT number when provided.
 * @param {{ castTime?: number, id?: string }} ability
 * @param {number} [ctNumber]
 */
export function resolveAbilityCastTime(ability, ctNumber) {
  if (ability && isMathAbility(ability.id) && ctNumber != null) {
    const n = Number(ctNumber);
    if (CALCULATOR_CT_NUMBERS.includes(n)) return n;
  }
  return ability?.castTime ?? 0;
}

/**
 * @returns {number[]} copy of allowed CT numbers (≥3 distinct)
 */
export function listCalculatorCtNumbers() {
  return [...CALCULATOR_CT_NUMBERS];
}
