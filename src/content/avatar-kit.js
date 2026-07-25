/**
 * Roblox-style avatar kit resolution — expressions + modular equip fingerprint.
 */
import { resolveUnitVisual, weaponTypeFromId } from './visual-kits.js';
import { getAccessory } from './items.js';

/** Facial expression variants (blocky Roblox-like faces) */
export const FACE_EXPRESSIONS = ['neutral', 'smile', 'determined', 'wink', 'cool'];

/**
 * Pick expression from unit identity (stable per unit id + job).
 * @param {{ id?: string, jobId?: string, gender?: string }} unit
 */
export function resolveExpression(unit = {}) {
  const key = `${unit.id || ''}:${unit.jobId || ''}:${unit.gender || 'm'}`;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return FACE_EXPRESSIONS[h % FACE_EXPRESSIONS.length];
}

/**
 * Full avatar kit for mesh builder + tests.
 * @param {{ id?: string, jobId?: string, weaponId?: string, armorId?: string, accessoryId?: string, gender?: string }} unit
 * @param {string} [team]
 */
export function resolveAvatarKit(unit = {}, team = 'player') {
  const vis = resolveUnitVisual(unit.jobId, unit.weaponId, unit.armorId, unit.gender || 'm');
  const acc = getAccessory(unit.accessoryId || 'none');
  const expression = resolveExpression(unit);
  const weaponType = weaponTypeFromId(unit.weaponId || 'sword');
  return {
    style: 'roblox-blocky',
    kitId: vis.kitId,
    expression,
    expressions: [...FACE_EXPRESSIONS],
    parts: ['head', 'face', 'torso', 'armL', 'armR', 'legL', 'legR', 'weapon', 'accessory'],
    jobId: unit.jobId,
    weaponId: unit.weaponId,
    armorId: unit.armorId,
    accessoryId: unit.accessoryId || 'none',
    weaponType,
    weaponAttach: vis.weaponAttach,
    weaponVisual: vis.weaponVisual,
    armorType: vis.armorType,
    armorVisual: vis.armorVisual,
    primaryColor: vis.primaryColor,
    secondaryColor: vis.secondaryColor,
    helmet: !!vis.helmet,
    cape: !!vis.cape,
    gender: vis.gender,
    team,
    accessoryTint: acc?.id && acc.id !== 'none' ? 0xfbbf24 : null,
    fingerprint: avatarFingerprint(unit, expression),
  };
}

/**
 * Stable string fingerprint — changes when equip/job/expression/gender change.
 * @param {object} unit
 * @param {string} [expression]
 */
export function avatarFingerprint(unit = {}, expression = null) {
  const exp = expression || resolveExpression(unit);
  return [
    unit.jobId || '',
    unit.weaponId || '',
    unit.armorId || '',
    unit.accessoryId || 'none',
    unit.gender || 'm',
    exp,
  ].join('|');
}
