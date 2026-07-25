/**
 * Procedural tile decoration seeds — pure, testable without WebGL.
 */

/**
 * Deterministic hash for cell decoration.
 * @param {number} x
 * @param {number} y
 * @param {string} [extra]
 */
export function tileVariantSeed(x, y, extra = '') {
  let h = 2166136261;
  const s = `${x},${y},${extra}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * @param {number} seed
 * @param {number} [n=1]
 */
export function seedUnit(seed, n = 1) {
  // 0..1 from seed + salt
  const x = Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Decoration for a terrain type at (x,y).
 * @param {string} terrain
 * @param {number} x
 * @param {number} y
 * @returns {{ shade: number, rocks: number, clumps: number, ripples: number, cracks: number, moss: number, variant: number }}
 */
export function tileDecorPlan(terrain, x, y) {
  const seed = tileVariantSeed(x, y, terrain);
  const u = (n) => seedUnit(seed, n);
  const base = {
    shade: 0.85 + u(1) * 0.3,
    rocks: 0,
    clumps: 0,
    ripples: 0,
    cracks: 0,
    moss: 0,
    variant: Math.floor(u(2) * 4),
    seed,
  };
  if (terrain === 'floor' || terrain === 'elevated' || terrain === 'ramp') {
    base.rocks = u(3) > 0.72 ? 1 + Math.floor(u(4) * 2) : 0;
    base.clumps = 1 + Math.floor(u(5) * 3);
    base.shade = 0.75 + u(6) * 0.45;
  } else if (terrain === 'water') {
    base.ripples = 1 + Math.floor(u(3) * 3);
    base.shade = 0.7 + u(4) * 0.4;
  } else if (terrain === 'bridge') {
    base.cracks = u(3) > 0.5 ? 1 : 0;
    base.shade = 0.85 + u(4) * 0.2;
  } else if (terrain === 'wall' || terrain === 'tower') {
    base.cracks = 1 + Math.floor(u(3) * 2);
    base.moss = u(4) > 0.55 ? 1 : 0;
    base.shade = 0.8 + u(5) * 0.3;
  }
  return base;
}

/**
 * Max contiguous water width (horizontal run) on a map.
 * @param {{ width: number, height: number, tiles: { terrain: string }[][] }} map
 */
export function maxWaterWidth(map) {
  if (!map?.tiles) return 0;
  let max = 0;
  for (let y = 0; y < map.height; y++) {
    let run = 0;
    for (let x = 0; x < map.width; x++) {
      if (map.tiles[y][x]?.terrain === 'water') {
        run += 1;
        if (run > max) max = run;
      } else {
        run = 0;
      }
    }
  }
  return max;
}

/**
 * Max contiguous water height (vertical run).
 * @param {{ width: number, height: number, tiles: { terrain: string }[][] }} map
 */
export function maxWaterHeight(map) {
  if (!map?.tiles) return 0;
  let max = 0;
  for (let x = 0; x < map.width; x++) {
    let run = 0;
    for (let y = 0; y < map.height; y++) {
      if (map.tiles[y][x]?.terrain === 'water') {
        run += 1;
        if (run > max) max = run;
      } else {
        run = 0;
      }
    }
  }
  return max;
}
