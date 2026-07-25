/**
 * Slow presentation timing, 20+ maps, icon distinctness — shipped paths.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getPresentationTiming,
  WALK_MS_PER_STEP,
  PRIOR_WALK_MS_MAX,
  EVENT_GAP_MS,
  CAST_START_HOLD_MS,
  CAST_RESOLVE_HOLD_MS,
  FLOATER_MS,
  KO_ASH_MS,
} from '../src/client/presentation-timing.js';
import {
  listMaps,
  mapPoolCount,
  createMapById,
  pickRandomMapId,
  createRandomMap,
} from '../src/content/maps-pool.js';
import { createMatch } from '../src/core/match.js';
import { itemIconUrl, listWeapons } from '../src/content/items.js';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

describe('slow presentation timing (shipped)', () => {
  it('walk step is ≥2× prior baseline (~200–280ms)', () => {
    const t = getPresentationTiming();
    assert.equal(t.WALK_MS_PER_STEP, WALK_MS_PER_STEP);
    assert.ok(WALK_MS_PER_STEP >= PRIOR_WALK_MS_MAX * 2, `${WALK_MS_PER_STEP} vs ${PRIOR_WALK_MS_MAX * 2}`);
    assert.ok(EVENT_GAP_MS >= 300);
    assert.ok(CAST_START_HOLD_MS >= 1000);
    assert.ok(CAST_RESOLVE_HOLD_MS >= 1200);
    assert.ok(FLOATER_MS >= 2000);
    assert.ok(KO_ASH_MS >= 1200);
  });

  it('battle-presentation defaults to slow walk constant', () => {
    const src = fs.readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/client/battle-presentation.js'),
      'utf8'
    );
    assert.ok(src.includes('WALK_MS_PER_STEP'));
    assert.ok(src.includes('EVENT_GAP_MS'));
    assert.ok(src.includes('playAshKo') || src.includes('KO_ASH'));
  });
});

describe('map pool ≥20 FFT-inspired (shipped)', () => {
  it('has at least 20 distinct maps with themes and valid spawns', () => {
    assert.ok(mapPoolCount() >= 20, `pool size ${mapPoolCount()}`);
    const list = listMaps();
    assert.equal(list.length, mapPoolCount());
    const ids = new Set(list.map((m) => m.id));
    assert.equal(ids.size, list.length);

    for (const meta of list) {
      const { map, spawns, id, name } = createMapById(meta.id);
      assert.equal(id, meta.id);
      assert.ok(name);
      assert.ok(map.width >= 10 && map.height >= 10);
      assert.equal(spawns.player.length, 4);
      assert.equal(spawns.enemy.length, 4);
      for (const side of ['player', 'enemy']) {
        for (const s of spawns[side]) {
          const t = map.tiles[s.y][s.x];
          assert.ok(t?.walkable, `${id} ${side} spawn (${s.x},${s.y}) walkable`);
          assert.notEqual(t.terrain, 'wall');
        }
      }
    }
  });

  it('pickRandomMapId varies across seeds; createMatch uses mapId', () => {
    const seen = new Set();
    for (let i = 0; i < 40; i++) {
      seen.add(pickRandomMapId(i * 97 + 3));
    }
    assert.ok(seen.size >= 8, `expected variety, got ${seen.size}`);

    const a = createMatch({ mode: 'ai', mapId: 'castle_river' });
    const b = createMatch({ mode: 'ai', mapId: 'swamp_mire' });
    assert.equal(a.mapId, 'castle_river');
    assert.equal(b.mapId, 'swamp_mire');
    assert.notEqual(a.mapName, b.mapName);
    assert.equal(a.units.length, 8);

    const r = createRandomMap(42);
    assert.ok(r.id);
    assert.ok(r.map.tiles.length > 0);
  });
});

describe('distinct item icons (shipped)', () => {
  it('blood_sword and diamond_sword icons differ', () => {
    const blood = itemIconUrl({ id: 'blood_sword', icon: 'blood_sword', name: 'Blood' });
    const diamond = itemIconUrl({ id: 'diamond_sword', icon: 'diamond_sword', name: 'Diamond' });
    assert.ok(blood.startsWith('data:image/svg'));
    assert.ok(diamond.startsWith('data:image/svg'));
    assert.notEqual(blood, diamond);
    // Spot color fingerprints in decoded SVG
    assert.ok(decodeURIComponent(blood).includes('7a1010') || decodeURIComponent(blood).toLowerCase().includes('ff2244'));
    assert.ok(decodeURIComponent(diamond).includes('b8f0ff') || decodeURIComponent(diamond).includes('glow'));
  });

  it('many weapons have unique icon urls', () => {
    const urls = listWeapons().map((w) => itemIconUrl(w));
    const unique = new Set(urls);
    assert.ok(unique.size >= 15, `expected many unique icons, got ${unique.size}`);
  });
});

describe('bottom panel + sticky loadout DOM (shipped source)', () => {
  it('game-app defines bottom-unit-panel and loadout-sticky-top', () => {
    const src = fs.readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/client/game-app.js'),
      'utf8'
    );
    assert.ok(src.includes('bottom-unit-panel'));
    assert.ok(src.includes('_renderBottomUnitPanel'));
    assert.ok(src.includes('loadout-sticky-top'));
    assert.ok(src.includes('loadout-scroll-body'));
    assert.ok(src.includes('unit-portrait') || src.includes('portraitIcon'));
  });

  it('materia theme asset and CSS exist', () => {
    const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
    assert.ok(fs.existsSync(path.join(root, 'public/assets/materia-lifestream-bg.jpg')));
    const css = fs.readFileSync(path.join(root, 'public/styles.css'), 'utf8');
    assert.ok(css.includes('materia-lifestream-bg.jpg'));
    assert.ok(css.includes('bottom-unit-panel'));
    assert.ok(css.includes('loadout-sticky-top'));
  });
});
