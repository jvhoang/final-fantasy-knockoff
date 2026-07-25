/**
 * Camera click-suppression + attack facing — shipped helpers (no WebGL required).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  consumeClickSuppression,
  markClickSuppressed,
} from '../src/client/arena.js';
import {
  attackYawOffset,
  setUnitFacing,
  resetUnitAnimPose,
  tickUnitAnim,
} from '../src/client/unit-mesh.js';

describe('camera click suppression (shipped)', () => {
  it('mark + consume: first pick ignored after drag, second pick allowed', () => {
    const state = { _clickSuppressed: false };
    assert.equal(consumeClickSuppression(state), false);
    markClickSuppressed(state);
    assert.equal(state._clickSuppressed, true);
    // pointerup may clear _drag; pick still sees durable flag
    assert.equal(consumeClickSuppression(state), true);
    assert.equal(state._clickSuppressed, false);
    // next genuine click works
    assert.equal(consumeClickSuppression(state), false);
  });

  it('double mark still only suppresses one pick', () => {
    const state = {};
    markClickSuppressed(state);
    markClickSuppressed(state);
    assert.equal(consumeClickSuppression(state), true);
    assert.equal(consumeClickSuppression(state), false);
  });
});

describe('attack anim facing (shipped)', () => {
  function mockMesh(facing = 'N') {
    const weapon = {
      name: 'weapon',
      rotation: { x: 0, y: 0, z: 0 },
    };
    const mesh = {
      rotation: { x: 0, y: 0, z: 0 },
      position: { x: 0, y: 0, z: 0 },
      scale: { setScalar(v) { this._s = v; }, _s: 1 },
      userData: { baseY: 0.5 },
      children: [weapon],
      getObjectByName(n) {
        return n === 'weapon' ? weapon : null;
      },
    };
    setUnitFacing(mesh, facing, { applyNow: true });
    return mesh;
  }

  it('attackYawOffset is temporary and returns toward base over cycle', () => {
    const base = Math.PI; // N
    const mid = attackYawOffset(base, 0.2);
    assert.notEqual(mid, base);
    // at t=0 offset is 0
    assert.equal(attackYawOffset(base, 0), base);
  });

  it('tickUnitAnim attack does not permanently accumulate yaw across frames', () => {
    const mesh = mockMesh('E');
    const base = mesh.userData.baseFacingY;
    assert.equal(mesh.rotation.y, base);

    // Simulate many attack frames (old bug: rotation.y += dt*0.5 each frame)
    for (let i = 0; i < 40; i++) {
      tickUnitAnim(mesh, 'attack', 0.05);
    }
    // Still within a swing envelope of base, not spun by ~1.0 rad
    const delta = Math.abs(mesh.rotation.y - base);
    assert.ok(delta < 0.5, `yaw drifted too far: ${delta}`);

    // After reset + idle, facing exact
    resetUnitAnimPose(mesh);
    tickUnitAnim(mesh, 'idle', 0.016);
    assert.equal(mesh.rotation.y, base);
    assert.equal(mesh.getObjectByName('weapon').rotation.z, 0);
  });

  it('setUnitFacing updates baseFacingY used after attack ends', () => {
    const mesh = mockMesh('N');
    tickUnitAnim(mesh, 'attack', 0.1);
    setUnitFacing(mesh, 'S', { applyNow: false });
    resetUnitAnimPose(mesh);
    assert.equal(mesh.rotation.y, 0); // S
    tickUnitAnim(mesh, 'idle', 0.01);
    assert.equal(mesh.rotation.y, 0);
  });
});
