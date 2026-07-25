import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  movementRange,
  abilityRangeTiles,
  attackAspect,
  facingToward,
  canStep,
} from '../src/core/grid.js';
import { computeDamage, applyDamage, applyHeightBonus } from '../src/core/combat.js';
import { createCastleMap, SPAWNS } from '../src/content/map-castle.js';
import { FACING_BONUS } from '../src/core/constants.js';
import { createMatch } from '../src/core/match.js';
// Stable map for spawn tests

describe('height grid pathing (shipped)', () => {
  it('castle map has river, bridges, elevations', () => {
    const map = createCastleMap();
    assert.ok(map.width >= 16);
    assert.ok(map.height >= 14);
    let water = 0;
    let bridge = 0;
    let elevated = 0;
    for (const row of map.tiles) {
      for (const t of row) {
        if (t.terrain === 'water') water++;
        if (t.terrain === 'bridge') bridge++;
        if (t.height >= 2 && t.walkable) elevated++;
      }
    }
    assert.ok(water > 10, 'has river water');
    assert.ok(bridge >= 4, 'has bridges');
    assert.ok(elevated > 5, 'has multi-height');
  });

  it('default SPAWNS and createMatch place all 8 units on walkable tiles', () => {
    const map = createCastleMap();
    for (const side of ['player', 'enemy']) {
      assert.equal(SPAWNS[side].length, 4);
      for (const s of SPAWNS[side]) {
        const t = map.tiles[s.y][s.x];
        assert.ok(t, `${side} spawn (${s.x},${s.y}) in bounds`);
        assert.equal(
          t.walkable,
          true,
          `${side} spawn (${s.x},${s.y}) terrain=${t.terrain} must be walkable`
        );
        assert.notEqual(t.terrain, 'water', `${side} spawn must not be in river`);
      }
    }
    const m = createMatch({ mode: 'ai', mapId: 'castle_river' });
    assert.equal(m.units.length, 8);
    for (const u of m.units) {
      const t = m.map.tiles[u.y][u.x];
      assert.equal(t.walkable, true, `${u.name} at (${u.x},${u.y}) walkable`);
      assert.notEqual(t.terrain, 'water', `${u.name} not in water`);
    }
  });

  it('movement respects height climb limit', () => {
    const map = createCastleMap();
    const start = { x: 5, y: 10 };
    const range = movementRange(map, start, 4, new Set());
    assert.ok(range.size >= 1);
    // Climb: height 0 floor cannot climb +4 in one step with maxClimb 2
    // Find a walkable height-0 tile and a height-4 neighbor if any; else use synthetic check
    // canStep blocks upward climb beyond maxClimb; drops are allowed
    const low = { x: 8, y: 4 }; // floor ~0
    const high = { x: 2, y: 1 }; // elevated ~1 on map edge area
    const tLow = map.tiles[low.y][low.x];
    const tHigh = map.tiles[high.y][high.x];
    assert.ok(tLow && tHigh);
    // Direct climb of more than maxClimb=1 should fail when delta > 1
    if (tHigh.height - tLow.height > 1) {
      assert.equal(canStep(map, low, high, 1), false);
    }
    // Explicit: cannot climb +5 with maxClimb 2
    const fakeMap = {
      width: 2,
      height: 1,
      tiles: [[{ x: 0, y: 0, height: 0, walkable: true }, { x: 1, y: 0, height: 5, walkable: true }]],
    };
    assert.equal(canStep(fakeMap, { x: 0, y: 0 }, { x: 1, y: 0 }, 2), false);
    assert.equal(canStep(fakeMap, { x: 0, y: 0 }, { x: 1, y: 0 }, 5), true);
    // Drop always ok
    assert.equal(canStep(fakeMap, { x: 1, y: 0 }, { x: 0, y: 0 }, 2), true);
  });

  it('ability range uses manhattan distance', () => {
    const map = createCastleMap();
    const tiles = abilityRangeTiles(map, { x: 5, y: 5 }, 1, 2);
    assert.ok(tiles.every((t) => {
      const d = Math.abs(t.x - 5) + Math.abs(t.y - 5);
      return d >= 1 && d <= 2;
    }));
    assert.ok(tiles.length > 0);
  });
});

describe('facing damage (shipped)', () => {
  it('back attack uses 1.5x, side 1.25x, front 1.0x', () => {
    assert.equal(FACING_BONUS.back, 1.5);
    assert.equal(FACING_BONUS.side, 1.25);
    assert.equal(FACING_BONUS.front, 1.0);

    // Defender faces N (looking toward -y). Front = attacker from North (y-1).
    assert.equal(attackAspect('N', { x: 0, y: -1 }, { x: 0, y: 0 }), 'front');
    // Attacker from South (behind) = back
    assert.equal(attackAspect('N', { x: 0, y: 1 }, { x: 0, y: 0 }), 'back');
    // Attacker from East = side
    assert.equal(attackAspect('N', { x: 1, y: 0 }, { x: 0, y: 0 }), 'side');

    const attacker = {
      pa: 10,
      ma: 5,
      x: 0,
      y: 1,
      statuses: [],
    };
    const defender = {
      facing: 'N',
      x: 0,
      y: 0,
      statuses: [],
      hp: 100,
      alive: true,
    };
    const back = computeDamage(attacker, defender, { power: 2, kind: 'physical' }, { atk: 0 });
    assert.equal(back.aspect, 'back');
    assert.equal(back.damage, Math.floor(10 * 2 * 1.5));

    const frontAtk = { ...attacker, y: -1 };
    const front = computeDamage(frontAtk, defender, { power: 2, kind: 'physical' }, { atk: 0 });
    assert.equal(front.aspect, 'front');
    assert.ok(back.damage > front.damage);
  });

  it('height bonus increases physical damage', () => {
    const d = applyHeightBonus(3, 0, 100, 'physical');
    assert.ok(d > 100);
  });

  it('applyDamage KOs at 0 hp', () => {
    const u = { hp: 10, maxHp: 10, alive: true, charging: null, ct: 50 };
    applyDamage(u, 15);
    assert.equal(u.alive, false);
    assert.equal(u.hp, 0);
  });

  it('facingToward picks cardinal', () => {
    assert.equal(facingToward({ x: 0, y: 0 }, { x: 2, y: 0 }), 'E');
    assert.equal(facingToward({ x: 0, y: 0 }, { x: 0, y: 3 }), 'S');
  });
});
