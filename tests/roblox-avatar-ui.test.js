/**
 * Confirm FAB, panel target, face zoom, Roblox avatar kit contracts.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolvePanelTarget, useInspectHighlightStyle } from '../src/client/panel-target.js';
import { ZOOM_MIN, ZOOM_MIN_PRIOR, ZOOM_FACE } from '../src/client/arena.js';
import { ZOOM_MIN_REF, ZOOM_MIN_PRIOR_REF, isValidTurnFocusZoom, TURN_FOCUS_ZOOM } from '../src/client/battle-ui.js';
import {
  resolveAvatarKit,
  avatarFingerprint,
  FACE_EXPRESSIONS,
  resolveExpression,
} from '../src/content/avatar-kit.js';
import { buildUnitMesh } from '../src/client/unit-mesh.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('bottom panel target resolution', () => {
  it('defaults to active unit; inspect overrides; clears on turn change', () => {
    const a = resolvePanelTarget({ activeUnitId: 'u1', inspectId: null });
    assert.equal(a.panelUnitId, 'u1');
    assert.equal(a.inspectOverride, false);

    const b = resolvePanelTarget({ activeUnitId: 'u1', inspectId: 'u2' });
    assert.equal(b.panelUnitId, 'u2');
    assert.equal(b.inspectOverride, true);
    assert.equal(useInspectHighlightStyle('u2', 'u1'), true);

    // Turn change clears inspect of previous unit
    const c = resolvePanelTarget(
      { activeUnitId: 'u3', inspectId: 'u2', clearInspectOnTurnChange: true },
      'u1'
    );
    assert.equal(c.panelUnitId, 'u3');
    assert.equal(c.nextInspectId, null);
  });
});

describe('face-close zoom floor', () => {
  it('ZOOM_MIN is below prior 2.5 and enables face framing', () => {
    assert.equal(ZOOM_MIN, ZOOM_MIN_REF);
    assert.ok(ZOOM_MIN < ZOOM_MIN_PRIOR);
    assert.ok(ZOOM_MIN < ZOOM_MIN_PRIOR_REF);
    assert.ok(ZOOM_FACE >= ZOOM_MIN);
    assert.ok(ZOOM_FACE < 2);
    assert.ok(isValidTurnFocusZoom(TURN_FOCUS_ZOOM));
  });
});

describe('Roblox-style avatar kit + mesh', () => {
  it('resolveAvatarKit exposes parts, expression, fingerprint changes with gear', () => {
    const a = resolveAvatarKit({
      id: 'p1',
      jobId: 'ironward',
      weaponId: 'sword',
      armorId: 'leather',
      gender: 'm',
    });
    assert.equal(a.style, 'roblox-blocky');
    assert.ok(a.parts.includes('head'));
    assert.ok(a.parts.includes('face'));
    assert.ok(a.parts.includes('weapon'));
    assert.ok(FACE_EXPRESSIONS.includes(a.expression));

    const b = resolveAvatarKit({
      id: 'p1',
      jobId: 'ironward',
      weaponId: 'blood_sword',
      armorId: 'plate',
      gender: 'm',
    });
    assert.notEqual(a.fingerprint, b.fingerprint);
    assert.notEqual(avatarFingerprint({ weaponId: 'sword' }), avatarFingerprint({ weaponId: 'blood_sword' }));
  });

  it('buildUnitMesh creates named head/face/limbs/weapon (Three.js)', () => {
    const mesh = buildUnitMesh(
      {
        id: 't1',
        jobId: 'squireling',
        weaponId: 'longsword',
        armorId: 'leather',
        accessoryId: 'power_glove',
        gender: 'm',
      },
      'player'
    );
    assert.equal(mesh.userData.style, 'roblox-blocky');
    assert.ok(mesh.getObjectByName('head'));
    assert.ok(mesh.getObjectByName('face'));
    assert.ok(mesh.getObjectByName('torso'));
    assert.ok(mesh.getObjectByName('legL'));
    assert.ok(mesh.getObjectByName('armR'));
    assert.ok(mesh.getObjectByName('weapon'));
    assert.ok(mesh.userData.fingerprint);
    assert.ok(FACE_EXPRESSIONS.includes(mesh.userData.expression));
    // Equip change → different fingerprint
    const mesh2 = buildUnitMesh(
      {
        id: 't1',
        jobId: 'squireling',
        weaponId: 'blood_sword',
        armorId: 'plate',
        accessoryId: 'none',
        gender: 'm',
      },
      'player'
    );
    assert.notEqual(mesh.userData.fingerprint, mesh2.userData.fingerprint);
  });

  it('expression is stable for same unit identity', () => {
    const u = { id: 'x', jobId: 'bowmark', gender: 'f' };
    assert.equal(resolveExpression(u), resolveExpression(u));
  });
});

describe('confirm FAB + panel highlight structure', () => {
  it('game-app and CSS include confirm-fab lower-left and roblox chrome', () => {
    const app = fs.readFileSync(path.join(root, 'src/client/game-app.js'), 'utf8');
    const css = fs.readFileSync(path.join(root, 'public/styles.css'), 'utf8');
    assert.ok(app.includes('confirm-fab'));
    assert.ok(app.includes('btn-confirm-fab'));
    assert.ok(app.includes('resolvePanelTarget'));
    assert.ok(app.includes('useInspectHighlightStyle') || app.includes("mode: 'inspect'"));
    assert.ok(css.includes('confirm-fab'));
    assert.ok(css.includes('left:') || css.includes('left :'));
    assert.ok(css.includes('roblox-panel') || css.includes('roblox-btn'));
    assert.ok(css.includes('materia-lifestream') || true); // bg in body
    assert.ok(fs.readFileSync(path.join(root, 'public/styles.css'), 'utf8').includes('materia-lifestream-bg'));
  });

  it('arena exposes face zoom and inspect highlight mode', () => {
    const arena = fs.readFileSync(path.join(root, 'src/client/arena.js'), 'utf8');
    assert.ok(arena.includes('ZOOM_FACE'));
    assert.ok(arena.includes('focusOnUnitFace') || arena.includes('ZOOM_MIN = 0.65'));
    assert.ok(arena.includes("mode === 'inspect'") || arena.includes("mode: 'inspect'"));
  });
});
