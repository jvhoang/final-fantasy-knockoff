/**
 * Back-compat: castle map + re-exports of multi-map pool.
 */
import {
  createMapById,
  createRandomMap,
  listMaps,
  mapPoolCount,
  pickRandomMapId,
  parseRawMap,
} from './maps-pool.js';

/** @deprecated use createRandomMap / createMapById */
export function createCastleMap() {
  return createMapById('castle_river').map;
}

export const SPAWNS = createMapById('castle_river').spawns;

export const WATER_RULES = {
  shallowCost: 2,
  deepCost: 3,
  landCost: 1,
  bridgeCost: 1,
  deepMinJump: 2,
  description:
    'Water is fordable like FFT: shallow costs 2 Move, deep costs 3 Move and needs Jump ≥ 2. Bridges cost 1.',
};

export {
  createMapById,
  createRandomMap,
  listMaps,
  mapPoolCount,
  pickRandomMapId,
  parseRawMap,
};
