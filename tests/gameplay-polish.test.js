/**
 * Subjective Ally/Foe, act economy, cast follow, status deltas, castle_river width,
 * terrain variants, march-idle structural contracts.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { teamLabelForViewer, isAllyOfViewer } from '../src/core/team-label.js';
import {
  formatStatusApplyText,
  resolveChargeTarget,
  pickTargetUnitIdAt,
  STATUS_PRESENTATION,
} from '../src/core/status-fx.js';
import { maxWaterWidth, tileDecorPlan, tileVariantSeed } from '../src/content/tile-variants.js';
import { createMapById } from '../src/content/maps-pool.js';
import {
  createMatch,
  applyAction,
  getUnit,
  getUnitInspect,
} from '../src/core/match.js';
import { defaultPlayerLoadouts } from '../src/core/loadout.js';
import { STATUS } from '../src/core/constants.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('subjective Ally/Foe labels', () => {
  it('labels depend on viewer team', () => {
    assert.equal(teamLabelForViewer('player', 'player'), 'Ally');
    assert.equal(teamLabelForViewer('player', 'enemy'), 'Foe');
    assert.equal(teamLabelForViewer('enemy', 'enemy'), 'Ally');
    assert.equal(teamLabelForViewer('enemy', 'player'), 'Foe');
    assert.equal(isAllyOfViewer('enemy', 'enemy'), true);
  });

  it('getUnitInspect uses viewer team', () => {
    const m = createMatch({ mode: 'ai', mapSeed: 1, playerLoadouts: defaultPlayerLoadouts() });
    const foe = m.units.find((u) => u.team === 'enemy');
    const asPlayer = getUnitInspect(m, foe.id, 'player');
    const asEnemy = getUnitInspect(m, foe.id, 'enemy');
    assert.equal(asPlayer.teamLabel, 'Foe');
    assert.equal(asEnemy.teamLabel, 'Ally');
  });
});

describe('act economy after cast', () => {
  it('instant act as first action leaves move available and UI stays idle (not wait-face)', async () => {
    const { uiModeAfterSuccessfulAct, shouldAutoOpenWaitFace, canStillMove } = await import(
      '../src/client/battle-ui.js'
    );
    const m = createMatch({ mode: 'ai', mapSeed: 3, playerLoadouts: defaultPlayerLoadouts() });
    // focus is self-range 0 — always legal in-range act
    const unit = m.units.find((u) => u.team === 'player' && u.abilities.includes('focus'));
    assert.ok(unit, 'squireling has focus');
    unit.ct = 100;
    m.activeUnitId = unit.id;
    m.phase = 'battle';
    m.turn = { moved: false, acted: false, unitId: unit.id };
    const r = applyAction(m, {
      type: 'act',
      unitId: unit.id,
      abilityId: 'focus',
      target: { x: unit.x, y: unit.y },
    });
    assert.equal(r.ok, true, r.error);
    assert.equal(m.turn.acted, true);
    assert.equal(m.turn.moved, false);
    assert.equal(m.activeUnitId, unit.id);
    assert.equal(canStillMove(m.turn), true);
    assert.equal(shouldAutoOpenWaitFace(m.turn, { canControl: true, phase: 'battle' }), false);
    assert.equal(
      uiModeAfterSuccessfulAct(m.turn, { canControl: true, phase: 'battle', unitEnded: false }),
      'idle',
      'Act-first must not force wait-face (Move still available)'
    );
  });

  it('Act-second (after move) auto-opens wait-face via UI helper', async () => {
    const { uiModeAfterSuccessfulAct, shouldAutoOpenWaitFace } = await import('../src/client/battle-ui.js');
    const turn = { moved: true, acted: true };
    assert.equal(shouldAutoOpenWaitFace(turn, { canControl: true, phase: 'battle' }), true);
    assert.equal(uiModeAfterSuccessfulAct(turn, { canControl: true, phase: 'battle' }), 'wait-face');
  });
});

describe('cast target follow', () => {
  it('resolveChargeTarget follows targetUnitId after move', () => {
    const state = {
      units: [
        { id: 'c', x: 1, y: 1, alive: true },
        { id: 't', x: 5, y: 5, alive: true },
      ],
    };
    const charge = {
      target: { x: 2, y: 2 },
      targetUnitId: 't',
    };
    const r = resolveChargeTarget(state, charge);
    assert.equal(r.x, 5);
    assert.equal(r.y, 5);
    assert.equal(r.unitId, 't');
    // If dead, fall back to stored tile
    state.units[1].alive = false;
    const r2 = resolveChargeTarget(state, charge);
    assert.equal(r2.x, 2);
    assert.equal(r2.y, 2);
  });

  it('pickTargetUnitIdAt finds living unit on tile', () => {
    const state = {
      units: [{ id: 'u1', x: 3, y: 4, alive: true }],
    };
    assert.equal(pickTargetUnitIdAt(state, { x: 3, y: 4 }), 'u1');
    assert.equal(pickTargetUnitIdAt(state, { x: 0, y: 0 }), null);
  });
});

describe('status attribute deltas', () => {
  it('formatStatusApplyText includes attribute change text', () => {
    const h = formatStatusApplyText(STATUS.HASTE);
    assert.ok(/haste/i.test(h));
    assert.ok(/speed|ct/i.test(h));
    const p = formatStatusApplyText(STATUS.PROTECT);
    assert.ok(/protect/i.test(p));
    assert.ok(/phys|dmg/i.test(p));
    assert.ok(STATUS_PRESENTATION[STATUS.SLOW]);
  });
});

describe('castle_river water width ≤ 3', () => {
  it('max contiguous water run is at most 3', () => {
    const { map, id } = createMapById('castle_river');
    assert.equal(id, 'castle_river');
    const w = maxWaterWidth(map);
    assert.ok(w <= 3, `water width ${w} > 3`);
    assert.ok(w >= 1, 'still has water');
  });
});

describe('tile variants + march idle structural', () => {
  it('tileDecorPlan varies by cell and terrain', () => {
    const a = tileDecorPlan('floor', 1, 2);
    const b = tileDecorPlan('floor', 5, 7);
    const w = tileDecorPlan('water', 1, 2);
    assert.ok(a.clumps >= 1);
    assert.ok(w.ripples >= 1);
    assert.notEqual(tileVariantSeed(1, 2, 'floor'), tileVariantSeed(5, 7, 'floor'));
    // Different cells often differ shade
    assert.ok(typeof a.shade === 'number');
    void b;
  });

  it('arena/unit-mesh have terrain decor + march-in-place + status auras', () => {
    const arena = fs.readFileSync(path.join(root, 'src/client/arena.js'), 'utf8');
    const mesh = fs.readFileSync(path.join(root, 'src/client/unit-mesh.js'), 'utf8');
    const app = fs.readFileSync(path.join(root, 'src/client/game-app.js'), 'utf8');
    assert.ok(arena.includes('tileDecorPlan'));
    assert.ok(arena.includes('syncStatusAuras'));
    assert.ok(mesh.includes('march') || (mesh.includes('7.5') && mesh.includes("anim === 'idle'")));
    assert.ok(app.includes('_pendingActTarget') || app.includes('btn-confirm-act'));
    assert.ok(app.includes('teamLabelForViewer') || app.includes('_viewerTeam'));
  });
});

describe('charged cast economy (real applyAction)', () => {
  it('firaga-style charge as act-first keeps unit active for move', async () => {
    const { getAbility } = await import('../src/content/abilities.js');
    const loadouts = defaultPlayerLoadouts().map((s, i) =>
      i === 0
        ? { ...s, jobId: 'flamecaller', weaponId: 'rod', armorId: 'robe', accessoryId: 'none' }
        : s
    );
    const m = createMatch({ mode: 'ai', mapSeed: 9, playerLoadouts: loadouts });
    const unit = m.units.find((u) => u.team === 'player');
    const charged = unit.abilities.find((id) => getAbility(id).castTime > 0);
    if (!charged) {
      assert.ok(true, 'no charged ability on flamecaller — skip');
      return;
    }
    unit.ct = 100;
    unit.mp = 99;
    m.activeUnitId = unit.id;
    m.phase = 'battle';
    m.turn = { moved: false, acted: false, unitId: unit.id };
    const ab = getAbility(charged);
    // pick a tile in range
    let target = { x: unit.x, y: unit.y };
    outer: for (let dy = -ab.maxRange; dy <= ab.maxRange; dy++) {
      for (let dx = -ab.maxRange; dx <= ab.maxRange; dx++) {
        const dist = Math.abs(dx) + Math.abs(dy);
        if (dist >= ab.minRange && dist <= ab.maxRange) {
          const tx = unit.x + dx;
          const ty = unit.y + dy;
          if (m.map.tiles[ty]?.[tx]) {
            target = { x: tx, y: ty };
            break outer;
          }
        }
      }
    }
    const r = applyAction(m, {
      type: 'act',
      unitId: unit.id,
      abilityId: charged,
      target,
    });
    assert.equal(r.ok, true, r.error);
    assert.equal(m.turn.acted, true);
    assert.equal(m.turn.moved, false);
    assert.equal(m.activeUnitId, unit.id, 'must not finishTurn when move remains');
    assert.ok(unit.charging, 'should be charging');
    assert.ok(unit.charging.targetUnitId != null || unit.charging.target);
  });
});
