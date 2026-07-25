/**
 * Attack/spell range + AoE preview tiles (pure, testable).
 */
import { abilityRangeTiles, aoeTiles } from './grid.js';
import { getAbility } from '../content/abilities.js';

/**
 * Valid target cells for an ability from a unit origin.
 * @param {import('./grid.js').GridMap} map
 * @param {{x:number,y:number}} origin
 * @param {string|object} abilityOrId
 * @returns {{x:number,y:number}[]}
 */
export function previewRangeTiles(map, origin, abilityOrId) {
  const ab = typeof abilityOrId === 'string' ? getAbility(abilityOrId) : abilityOrId;
  if (!ab) return [];
  if (ab.maxRange === 0 && ab.minRange === 0) return [{ x: origin.x, y: origin.y }];
  let tiles = abilityRangeTiles(map, origin, ab.minRange, ab.maxRange);
  if (ab.minRange === 0) {
    const self = { x: origin.x, y: origin.y };
    if (!tiles.some((t) => t.x === self.x && t.y === self.y)) tiles = [...tiles, self];
  }
  return tiles;
}

/**
 * AoE cells if ability is centered on target.
 * @param {import('./grid.js').GridMap} map
 * @param {{x:number,y:number}} origin caster
 * @param {{x:number,y:number}} target
 * @param {string|object} abilityOrId
 * @returns {{x:number,y:number}[]}
 */
export function previewAoeTiles(map, origin, target, abilityOrId) {
  const ab = typeof abilityOrId === 'string' ? getAbility(abilityOrId) : abilityOrId;
  if (!ab || !target) return [];
  return aoeTiles(ab.aoe || 'single', target, origin, ab.aoeSize || 0, map);
}

/**
 * Combined preview: range tiles + optional hover AoE.
 * @returns {{ range: {x:number,y:number}[], aoe: {x:number,y:number}[] }}
 */
export function previewRangeAndAoe(map, origin, abilityOrId, hoverTarget = null) {
  const range = previewRangeTiles(map, origin, abilityOrId);
  const aoe =
    hoverTarget && range.some((t) => t.x === hoverTarget.x && t.y === hoverTarget.y)
      ? previewAoeTiles(map, origin, hoverTarget, abilityOrId)
      : [];
  return { range, aoe };
}
