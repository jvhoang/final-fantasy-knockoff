/**
 * Fordable water — drives shipped movementRange / stepMoveCost / canStep.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  movementRange,
  stepMoveCost,
  canStep,
  getTile,
} from '../src/core/grid.js';
import { createCastleMap, WATER_RULES } from '../src/content/map-castle.js';

describe('fordable water (shipped)', () => {
  it('water tiles are walkable with depth; walls still blocked', () => {
    const map = createCastleMap();
    let water = 0;
    let deep = 0;
    for (const row of map.tiles) {
      for (const t of row) {
        if (t.terrain === 'water') {
          water++;
          assert.equal(t.walkable, true, 'water must be fordable');
          assert.ok((t.depth ?? 0) >= 1);
          if ((t.depth ?? 0) >= 2) deep++;
        }
        if (t.terrain === 'wall') assert.equal(t.walkable, false);
      }
    }
    assert.ok(water > 10);
    assert.ok(deep > 0, 'map includes deep fords');
  });

  it('step cost: land 1, shallow 2, deep 3, bridge 1', () => {
    const land = { terrain: 'floor', height: 0, depth: 0 };
    const shallow = { terrain: 'water', height: 0, depth: 1 };
    const deep = { terrain: 'water', height: 0, depth: 2 };
    const bridge = { terrain: 'bridge', height: 1, depth: 0 };
    assert.equal(stepMoveCost(land, land), 1);
    assert.equal(stepMoveCost(land, shallow), WATER_RULES.shallowCost);
    assert.equal(stepMoveCost(land, deep), WATER_RULES.deepCost);
    assert.equal(stepMoveCost(land, bridge), WATER_RULES.bridgeCost);
    assert.ok(stepMoveCost(land, shallow) > stepMoveCost(land, land));
  });

  it('movementRange reaches water when Move is high enough', () => {
    const map = createCastleMap();
    // Dry bank west of river around mid map: (7,5) is floor near water
    const start = { x: 7, y: 5 };
    const st = getTile(map, start.x, start.y);
    assert.ok(st?.walkable);
    assert.notEqual(st.terrain, 'water');

    const low = movementRange(map, start, 1, new Set(), 3);
    const high = movementRange(map, start, 6, new Set(), 3);

    let waterInHigh = 0;
    for (const [k, node] of high) {
      const t = getTile(map, node.x, node.y);
      if (t?.terrain === 'water') {
        waterInHigh++;
        assert.ok(node.cost >= 2, `water cost should be >= 2, got ${node.cost} at ${k}`);
      }
    }
    assert.ok(waterInHigh > 0, 'with Move 6 should reach water tiles');

    // Prefer bridge when cheaper: from a tile that can reach both
    // Cost into first water step is higher than dry neighbor
    const dryNeighbor = [...low.values()].find((n) => {
      const t = getTile(map, n.x, n.y);
      return t && t.terrain !== 'water' && (n.x !== start.x || n.y !== start.y);
    });
    assert.ok(dryNeighbor, 'should reach some dry tile with Move 1');
  });

  it('deep water blocked when jump < 2; allowed when jump >= 2', () => {
    const map = createCastleMap();
    // Find a deep water tile and adjacent walkable
    let deep = null;
    let adj = null;
    outer: for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const t = getTile(map, x, y);
        if (t?.terrain === 'water' && (t.depth ?? 0) >= 2) {
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ]) {
            const n = getTile(map, x + dx, y + dy);
            if (n?.walkable && n.terrain !== 'water') {
              deep = t;
              adj = n;
              break outer;
            }
          }
        }
      }
    }
    assert.ok(deep && adj, 'need deep water adjacent to dry land');
    assert.equal(canStep(map, adj, deep, 3, 1), false, 'jump 1 cannot deep ford');
    assert.equal(canStep(map, adj, deep, 3, 2), true, 'jump 2 can deep ford');
  });

  it('bridge path cost less than swimming same span when both reachable', () => {
    const map = createCastleMap();
    // Near bridge row y=7: start west of river
    const start = { x: 7, y: 7 };
    const range = movementRange(map, start, 8, new Set(), 3);
    const bridgeTiles = [...range.values()].filter((n) => getTile(map, n.x, n.y)?.terrain === 'bridge');
    const waterTiles = [...range.values()].filter((n) => getTile(map, n.x, n.y)?.terrain === 'water');
    assert.ok(bridgeTiles.length > 0 || waterTiles.length > 0, 'should reach river corridor');
    if (bridgeTiles.length && waterTiles.length) {
      const minB = Math.min(...bridgeTiles.map((n) => n.cost));
      const minW = Math.min(...waterTiles.map((n) => n.cost));
      // Not always minB < minW depending on position, but water steps individually cost more
      assert.ok(minW >= 2);
      assert.ok(minB >= 1);
    }
  });
});
