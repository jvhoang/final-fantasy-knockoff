/**
 * CT clock unit tests — drives shipped src/core/ct.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  tickCt,
  readyUnits,
  advanceUntilTurn,
  endTurn,
  ctCostForEconomy,
  effectiveSpeed,
  beginCharge,
  tickCharges,
  CT_THRESHOLD,
  CT_COST_MOVE_ACT,
  CT_COST_PARTIAL,
  CT_COST_WAIT,
} from '../src/core/ct.js';
import { STATUS } from '../src/core/constants.js';

function makeUnit(overrides = {}) {
  return {
    id: 'u1',
    name: 'Test',
    team: 'player',
    hp: 100,
    maxHp: 100,
    mp: 50,
    maxMp: 50,
    speed: 10,
    ct: 0,
    move: 4,
    jump: 3,
    pa: 5,
    ma: 5,
    x: 0,
    y: 0,
    facing: 'N',
    statuses: [],
    alive: true,
    charging: null,
    jobId: 'squireling',
    abilities: ['strike'],
    weaponId: 'sword',
    armorId: 'leather',
    ...overrides,
  };
}

describe('CT system (shipped)', () => {
  it('each tick adds effective Speed to CT', () => {
    const u = makeUnit({ speed: 8, ct: 0 });
    tickCt([u]);
    assert.equal(u.ct, 8);
    tickCt([u]);
    assert.equal(u.ct, 16);
  });

  it('unit becomes ready when CT >= 100', () => {
    const u = makeUnit({ speed: 25, ct: 0 });
    let ticks = 0;
    while (readyUnits([u]).length === 0 && ticks < 20) {
      tickCt([u]);
      ticks += 1;
    }
    assert.ok(u.ct >= CT_THRESHOLD);
    assert.equal(readyUnits([u])[0].id, 'u1');
    assert.equal(ticks, 4); // 25*4 = 100
  });

  it('advanceUntilTurn returns highest CT unit', () => {
    const a = makeUnit({ id: 'a', speed: 10, ct: 0 });
    const b = makeUnit({ id: 'b', speed: 20, ct: 0 });
    const { active, ticks } = advanceUntilTurn([a, b]);
    assert.ok(active);
    assert.equal(active.id, 'b');
    assert.ok(ticks >= 5);
    assert.ok(b.ct >= CT_THRESHOLD);
  });

  it('Move+Act costs 100 CT residual economy', () => {
    assert.equal(ctCostForEconomy({ moved: true, acted: true }), CT_COST_MOVE_ACT);
    const u = makeUnit({ ct: 120 });
    endTurn(u, { moved: true, acted: true });
    assert.equal(u.ct, 20);
  });

  it('Move-only or Act-only costs 80; Wait-only costs 60', () => {
    assert.equal(ctCostForEconomy({ moved: true, acted: false }), CT_COST_PARTIAL);
    assert.equal(ctCostForEconomy({ moved: false, acted: true }), CT_COST_PARTIAL);
    assert.equal(ctCostForEconomy({ moved: false, acted: false }), CT_COST_WAIT);

    const m = makeUnit({ ct: 100 });
    endTurn(m, { moved: true, acted: false });
    assert.equal(m.ct, 20);

    const w = makeUnit({ ct: 100 });
    endTurn(w, { moved: false, acted: false });
    assert.equal(w.ct, 40);
  });

  it('spending less keeps you sooner (Wait residual higher than Move+Act)', () => {
    const full = makeUnit({ id: 'full', ct: 100, speed: 10 });
    const wait = makeUnit({ id: 'wait', ct: 100, speed: 10 });
    endTurn(full, { moved: true, acted: true });
    endTurn(wait, { moved: false, acted: false });
    // wait has 40 CT, full has 0 — wait will act sooner
    assert.ok(wait.ct > full.ct);
    const units = [full, wait];
    const { active } = advanceUntilTurn(units);
    assert.equal(active.id, 'wait');
  });

  it('Haste multiplies CT gain; Slow halves it', () => {
    const haste = makeUnit({ id: 'h', speed: 10, statuses: [{ id: STATUS.HASTE, duration: 3 }] });
    const slow = makeUnit({ id: 's', speed: 10, statuses: [{ id: STATUS.SLOW, duration: 3 }] });
    assert.equal(effectiveSpeed(haste), 15);
    assert.equal(effectiveSpeed(slow), 5);
    tickCt([haste, slow]);
    assert.equal(haste.ct, 15);
    assert.equal(slow.ct, 5);
  });

  it('charged ability freezes unit CT and resolves on charge clock', () => {
    const u = makeUnit({ speed: 10, ct: 50 });
    beginCharge(u, 'fire', { x: 1, y: 1 }, 3);
    assert.ok(u.charging);
    tickCt([u]);
    assert.equal(u.ct, 50); // frozen while charging
    let resolved = false;
    tickCharges([u], () => {
      resolved = true;
    });
    assert.equal(u.charging.chargeLeft, 2);
    tickCharges([u], () => {});
    tickCharges([u], (caster, charge) => {
      resolved = true;
      assert.equal(charge.abilityId, 'fire');
      assert.equal(caster.id, 'u1');
    });
    assert.equal(resolved, true);
    assert.equal(u.charging, null);
  });
});
