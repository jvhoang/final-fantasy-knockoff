/**
 * Height-aware tactical grid: pathfinding, ranges, fordable water (FFT-like).
 */

/**
 * @typedef {{
 *   x: number,
 *   y: number,
 *   height: number,
 *   walkable: boolean,
 *   terrain?: string,
 *   depth?: number,
 * }} Tile
 * @typedef {{ width: number, height: number, tiles: Tile[][], name?: string }} GridMap
 */

/**
 * @param {GridMap} map
 * @param {number} x
 * @param {number} y
 * @returns {Tile | null}
 */
export function getTile(map, x, y) {
  if (y < 0 || y >= map.height || x < 0 || x >= map.width) return null;
  return map.tiles[y][x];
}

/**
 * Move cost to enter a tile (FFT-like: water is fordable but expensive).
 * Land/bridge/ramp = 1 (+ climb). Shallow water = 2. Deep water = 3.
 * @param {Tile | null} from
 * @param {Tile | null} to
 */
export function stepMoveCost(from, to) {
  if (!to) return Infinity;
  let cost = 1;
  if (to.terrain === 'water') {
    const depth = to.depth ?? 1;
    cost = depth >= 2 ? 3 : 2;
    // water has no climb surcharge (surface ford)
    return cost;
  }
  if (to.terrain === 'bridge') {
    // Bridges are the cheap preferred path (flat 1 Move)
    return 1;
  }
  if (from) {
    const climb = Math.max(0, to.height - from.height);
    if (climb > 0) cost += 1;
  }
  return cost;
}

/**
 * Whether unit may enter tile (water fordable; deep water needs jump ≥ 2).
 * @param {GridMap} map
 * @param {{x:number,y:number}} a
 * @param {{x:number,y:number}} b
 * @param {number} [maxClimb=3]
 * @param {number} [jump=3]
 */
export function canStep(map, a, b, maxClimb = 3, jump = 3) {
  const ta = getTile(map, a.x, a.y);
  const tb = getTile(map, b.x, b.y);
  if (!ta || !tb || !tb.walkable) return false;
  const delta = tb.height - ta.height;
  if (delta > maxClimb) return false;
  if (tb.terrain === 'water') {
    const depth = tb.depth ?? 1;
    // Deep fords require jump ≥ 2 (FFT-ish depth limitation)
    if (depth >= 2 && jump < 2) return false;
  }
  return true;
}

const DIRS = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

/**
 * BFS movement range with height + water ford costs.
 * @param {GridMap} map
 * @param {{x:number,y:number}} start
 * @param {number} movePoints
 * @param {Set<string>} [blocked]
 * @param {number} [jump=3]
 * @returns {Map<string, {x:number,y:number,cost:number,path:{x:number,y:number}[]}>}
 */
export function movementRange(map, start, movePoints, blocked = new Set(), jump = 3) {
  /** @type {Map<string, {x:number,y:number,cost:number,path:{x:number,y:number}[]}>} */
  const reach = new Map();
  const key = (p) => `${p.x},${p.y}`;
  const queue = [{ x: start.x, y: start.y, cost: 0, path: [{ x: start.x, y: start.y }] }];
  reach.set(key(start), queue[0]);

  while (queue.length) {
    queue.sort((a, b) => a.cost - b.cost);
    const cur = queue.shift();
    if (!cur) break;
    if (cur.cost >= movePoints) continue;

    for (const d of DIRS) {
      const nx = cur.x + d.x;
      const ny = cur.y + d.y;
      const nk = `${nx},${ny}`;
      if (!canStep(map, cur, { x: nx, y: ny }, jump, jump)) continue;
      if (blocked.has(nk) && !(nx === start.x && ny === start.y)) continue;

      const ta = getTile(map, cur.x, cur.y);
      const tb = getTile(map, nx, ny);
      const stepCost = stepMoveCost(ta, tb);
      const nextCost = cur.cost + stepCost;
      if (nextCost > movePoints) continue;

      const prev = reach.get(nk);
      if (prev && prev.cost <= nextCost) continue;

      const node = {
        x: nx,
        y: ny,
        cost: nextCost,
        path: [...cur.path, { x: nx, y: ny }],
      };
      reach.set(nk, node);
      queue.push(node);
    }
  }

  return reach;
}

/**
 * @param {GridMap} map
 * @param {{x:number,y:number}} origin
 * @param {number} minRange
 * @param {number} maxRange
 * @param {number} [maxHeightDiff=3]
 */
export function abilityRangeTiles(map, origin, minRange, maxRange, maxHeightDiff = 3) {
  const out = [];
  const ot = getTile(map, origin.x, origin.y);
  if (!ot) return out;
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const dist = Math.abs(x - origin.x) + Math.abs(y - origin.y);
      if (dist < minRange || dist > maxRange) continue;
      const t = getTile(map, x, y);
      if (!t) continue;
      if (Math.abs(t.height - ot.height) > maxHeightDiff) continue;
      out.push({ x, y });
    }
  }
  return out;
}

/**
 * @param {'single'|'cross'|'diamond'|'line'} pattern
 * @param {{x:number,y:number}} center
 * @param {{x:number,y:number}} origin
 * @param {number} size
 * @param {GridMap} map
 */
export function aoeTiles(pattern, center, origin, size, map) {
  const tiles = [{ x: center.x, y: center.y }];
  if (pattern === 'single') return tiles.filter((p) => getTile(map, p.x, p.y));

  if (pattern === 'cross') {
    for (const d of DIRS) {
      for (let i = 1; i <= size; i++) {
        tiles.push({ x: center.x + d.x * i, y: center.y + d.y * i });
      }
    }
  } else if (pattern === 'diamond') {
    for (let dy = -size; dy <= size; dy++) {
      for (let dx = -size; dx <= size; dx++) {
        if (Math.abs(dx) + Math.abs(dy) <= size && !(dx === 0 && dy === 0)) {
          tiles.push({ x: center.x + dx, y: center.y + dy });
        }
      }
    }
  } else if (pattern === 'line') {
    const dx = Math.sign(center.x - origin.x);
    const dy = Math.sign(center.y - origin.y);
    for (let i = 1; i <= size; i++) {
      tiles.push({ x: origin.x + dx * i, y: origin.y + dy * i });
    }
  }

  return tiles.filter((p) => getTile(map, p.x, p.y));
}

/** @returns {import('./constants.js').Facing} */
export function facingToward(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? 'E' : 'W';
  }
  return dy >= 0 ? 'S' : 'N';
}

/**
 * @param {import('./constants.js').Facing} defenderFacing
 * @param {{x:number,y:number}} attacker
 * @param {{x:number,y:number}} defender
 * @returns {'front'|'side'|'back'}
 */
export function attackAspect(defenderFacing, attacker, defender) {
  const fromDir = facingToward(defender, attacker);
  const order = ['N', 'E', 'S', 'W'];
  const fi = order.indexOf(defenderFacing);
  const ai = order.indexOf(fromDir);
  const diff = (ai - fi + 4) % 4;
  if (diff === 0) return 'front';
  if (diff === 2) return 'back';
  return 'side';
}
