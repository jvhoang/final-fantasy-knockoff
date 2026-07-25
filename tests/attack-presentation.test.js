/**
 * Attacker act/attack events before target hp; playOneEvent holds ATTACK_HOLD_MS.
 * Drives shipped match.js + battle-presentation.js.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, applyAction, getUnit } from '../src/core/match.js';
import { BattlePresentation } from '../src/client/battle-presentation.js';
import { ATTACK_HOLD_MS, HIT_HOLD_MS } from '../src/client/presentation-timing.js';

before(() => {
  if (typeof globalThis.requestAnimationFrame !== 'function') {
    globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
  }
  if (typeof globalThis.document === 'undefined') {
    globalThis.document = {
      createElement() {
        return { className: '', textContent: '', style: {}, classList: { add() {} } };
      },
    };
  }
});

function placeAdjacent(attacker, defender) {
  defender.x = attacker.x + 1;
  defender.y = attacker.y;
}

describe('attack presentation events (shipped)', () => {
  it('physical strike emits attack event before target hp damage', () => {
    const m = createMatch({ mode: 'ai', mapId: 'castle_river' });
    for (const u of m.units) {
      u.ct = 0;
      u.charging = null;
    }
    const hero = m.units.find((u) => u.team === 'player');
    // Ensure strike
    if (!hero.abilities.includes('strike')) hero.abilities.push('strike');
    hero.ct = 100;
    hero.pa = 20;
    m.activeUnitId = hero.id;
    m.turn = { moved: false, acted: false };
    const foe = m.units.find((u) => u.team === 'enemy');
    placeAdjacent(hero, foe);
    // Clear other units from that tile
    for (const u of m.units) {
      if (u.id !== foe.id && u.x === foe.x && u.y === foe.y) {
        u.x = 0;
        u.y = 0;
        u.alive = false;
      }
    }
    const hp0 = foe.hp;
    const ev0 = m.events?.length || 0;
    const r = applyAction(m, {
      type: 'act',
      unitId: hero.id,
      abilityId: 'strike',
      target: { x: foe.x, y: foe.y },
    });
    assert.equal(r.ok, true, r.error);
    assert.ok(foe.hp < hp0 || (m.events || []).some((e) => e.kind === 'hp'));
    const fresh = (m.events || []).slice(ev0);
    const kinds = fresh.map((e) => e.kind);
    const attackIdx = kinds.findIndex((k) => k === 'attack' || k === 'act');
    const hpIdx = kinds.findIndex((k) => k === 'hp' && fresh[kinds.indexOf(k)]?.amount < 0);
    // find first hp with negative amount
    let dmgIdx = -1;
    for (let i = 0; i < fresh.length; i++) {
      if (fresh[i].kind === 'hp' && fresh[i].amount < 0) {
        dmgIdx = i;
        break;
      }
    }
    assert.ok(attackIdx >= 0, `expected attack/act event, got ${kinds.join(',')}`);
    assert.ok(dmgIdx >= 0, `expected hp damage, got ${kinds.join(',')}`);
    assert.ok(attackIdx < dmgIdx, `attack must precede hp (${attackIdx} < ${dmgIdx}): ${kinds.join(',')}`);
    assert.equal(fresh[attackIdx].unitId, hero.id);
    assert.equal(fresh[attackIdx].abilityId, 'strike');
    assert.ok(fresh[attackIdx].target);
    assert.equal(fresh[dmgIdx].unitId, foe.id);
  });

  it('playOneEvent(attack) awaits ATTACK_HOLD_MS and animates caster not only target', async () => {
    const calls = [];
    const mockArena = {
      playAnim(id, anim, ms) {
        calls.push({ type: 'playAnim', id, anim, ms });
      },
      spawnHitFx(id) {
        calls.push({ type: 'spawnHitFx', id });
      },
      spawnCastFx() {},
      spawnSpellBurst() {},
      spawnSpellBurstAtTile() {},
      animateUnitStep() {
        return Promise.resolve();
      },
      playAshKo() {
        return Promise.resolve();
      },
      getUnitScreenPos() {
        return { x: 10, y: 10 };
      },
    };
    const floatLayer = {
      appendChild(el) {
        calls.push({ type: 'floater', text: el.textContent });
      },
    };
    // Stub document for floater if needed
    if (typeof globalThis.document === 'undefined') {
      globalThis.document = {
        createElement() {
          return { className: '', textContent: '', style: {}, classList: { add() {} } };
        },
      };
    }
    const pres = new BattlePresentation(mockArena, floatLayer);
    const t0 = Date.now();
    await pres.playOneEvent(
      {
        kind: 'attack',
        unitId: 'player-0',
        abilityId: 'strike',
        target: { x: 5, y: 5 },
        text: 'Strike',
      },
      { map: { tiles: [] }, units: [] }
    );
    const elapsed = Date.now() - t0;
    assert.ok(
      elapsed >= ATTACK_HOLD_MS - 50,
      `playOneEvent(attack) must hold ~ATTACK_HOLD_MS (${ATTACK_HOLD_MS}), got ${elapsed}ms`
    );
    const swing = calls.find((c) => c.type === 'playAnim' && c.id === 'player-0' && c.anim === 'attack');
    assert.ok(swing, `expected caster attack anim, calls=${JSON.stringify(calls)}`);
    assert.ok(swing.ms >= ATTACK_HOLD_MS * 0.9);
    // No hit spark on attacker during attack event
    assert.ok(!calls.some((c) => c.type === 'spawnHitFx' && c.id === 'player-0'));
  });

  it('playOneEvent(hp damage) hits target after attack sequence', async () => {
    const calls = [];
    const mockArena = {
      playAnim(id, anim, ms) {
        calls.push({ type: 'playAnim', id, anim, ms });
      },
      spawnHitFx(id) {
        calls.push({ type: 'spawnHitFx', id });
      },
      spawnCastFx() {},
      spawnSpellBurst() {},
      spawnSpellBurstAtTile() {},
      getUnitScreenPos() {
        return { x: 1, y: 1 };
      },
    };
    if (typeof globalThis.document === 'undefined') {
      globalThis.document = {
        createElement() {
          return { className: '', textContent: '', style: {}, classList: { add() {} } };
        },
      };
    }
    const pres = new BattlePresentation(mockArena, {
      appendChild(el) {
        calls.push({ type: 'floater', text: el.textContent });
      },
    });
    await pres.playOneEvent(
      { kind: 'attack', unitId: 'a', abilityId: 'strike', target: { x: 1, y: 1 } },
      { units: [], map: {} }
    );
    await pres.playOneEvent(
      { kind: 'hp', unitId: 'b', amount: -12, text: '-12 HP', color: '#ff4444' },
      { units: [], map: {} }
    );
    const order = calls.map((c) => `${c.type}:${c.id || ''}:${c.anim || c.text || ''}`);
    const atk = order.findIndex((s) => s.includes('playAnim:a:attack'));
    const hit = order.findIndex((s) => s.includes('spawnHitFx:b'));
    assert.ok(atk >= 0);
    assert.ok(hit >= 0);
    assert.ok(atk < hit, `caster swing before target hit: ${order.join(' | ')}`);
  });

  it('ashed KO stays hidden: syncUnits respects userData.ashed', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(new URL('../src/client/arena.js', import.meta.url), 'utf8');
    assert.ok(src.includes('userData.ashed'));
    assert.ok(src.includes('mesh.visible = false'));
    // After ashed, must continue (skip scale reset that would show body)
    const ashedBlock = src.slice(src.indexOf('if (mesh.userData.ashed)'));
    assert.ok(ashedBlock.includes('continue') || ashedBlock.includes('visible = false'));
  });
});

void getUnit;
void HIT_HOLD_MS;
