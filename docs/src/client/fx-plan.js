/**
 * Spell/summon FX routing — target-directed hits + optional residual arena FX.
 */
import { magicSpectacleFromMp } from './presentation-timing.js';

/** Distinct procedural creature kits per summon id */
export const SUMMON_CREATURES = {
  summon_ifrit: {
    id: 'ifrit',
    name: 'Ifrit',
    color: 0xff4400,
    secondary: 0xffaa00,
    silhouette: 'beast',
    height: 1.8,
  },
  summon_shiva: {
    id: 'shiva',
    name: 'Shiva',
    color: 0x88ddff,
    secondary: 0xffffff,
    silhouette: 'humanoid',
    height: 1.7,
  },
  summon_moogle: {
    id: 'moogle',
    name: 'Moogle',
    color: 0xffe4b5,
    secondary: 0xff69b4,
    silhouette: 'cute',
    height: 1.1,
  },
};

/**
 * @param {string} abilityId
 */
export function resolveSummonCreature(abilityId) {
  const id = String(abilityId || '');
  if (SUMMON_CREATURES[id]) return SUMMON_CREATURES[id];
  if (id.includes('ifrit')) return SUMMON_CREATURES.summon_ifrit;
  if (id.includes('shiva')) return SUMMON_CREATURES.summon_shiva;
  if (id.includes('moogle')) return SUMMON_CREATURES.summon_moogle;
  if (id.startsWith('summon_') || id.includes('summon')) {
    return {
      id: 'esper',
      name: 'Esper',
      color: 0xaa66ff,
      secondary: 0xffee88,
      silhouette: 'ethereal',
      height: 1.6,
    };
  }
  return null;
}

/**
 * Plan FX for a spell/summon resolve or instant cast.
 * Always target-directed when a target exists; residual only when arena-wide.
 *
 * @param {string} abilityId
 * @param {{ intensity?: number, arenaWide?: boolean, rings?: number, mpCost?: number }|null} [spectacle]
 * @param {{x:number,y:number}|null} [target]
 * @returns {{
 *   abilityId: string,
 *   summon: boolean,
 *   creature: object|null,
 *   targetDirected: boolean,
 *   residual: boolean,
 *   shake: boolean,
 *   projectile: boolean,
 *   color: number,
 * }}
 */
export function planAbilityFx(abilityId, spectacle = null, target = null) {
  const id = String(abilityId || '');
  const creature = resolveSummonCreature(id);
  const summon = !!creature || id.startsWith('summon_');
  const spec = spectacle || magicSpectacleFromMp(summon ? 28 : 10);
  let color = 0x66ccff;
  if (id.includes('fire') || id.includes('ifrit') || id.includes('firaga') || id.includes('magma')) color = 0xff4400;
  if (id.includes('ice') || id.includes('shiva')) color = 0x88ddff;
  if (id.includes('bolt') || id.includes('thund')) color = 0xffee44;
  if (id.includes('cure') || id.includes('moogle') || id.includes('holy')) color = 0xeeffaa;
  if (creature) color = creature.color;

  const residual = !!(spec.arenaWide || (spec.intensity ?? 0) >= 2.2);
  return {
    abilityId: id,
    summon,
    creature,
    targetDirected: !!target || true, // always mark direct impact path
    residual,
    shake: residual || (spec.intensity ?? 0) >= 1.8,
    projectile: !summon && !id.includes('cure') && !id.includes('protect'),
    color,
    intensity: spec.intensity ?? 1,
    arenaWide: !!spec.arenaWide,
  };
}

/**
 * Units at target tile (for multi-hit AoE, expand via caller with aoe tiles).
 * @param {{ units?: {id:string,x:number,y:number,alive?:boolean}[] }} state
 * @param {{x:number,y:number}|null} target
 */
export function unitsAtTile(state, target) {
  if (!target || !state?.units) return [];
  return state.units.filter((u) => u.x === target.x && u.y === target.y && u.alive !== false);
}
