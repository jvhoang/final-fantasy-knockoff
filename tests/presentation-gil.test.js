/**
 * Gil budget, walk path events, CT cast resolve, inspect — shipped paths.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validatePartyBudget,
  defaultPlayerLoadouts,
  defaultEnemyLoadouts,
  previewLoadout,
  partyGilCost,
  TEAM_GIL_BUDGET,
  JOBS,
  buildParty,
} from '../src/core/loadout.js';
import {
  createMatch,
  applyAction,
  getUnit,
  getUnitInspect,
  getMoveRange,
  applyAbilityEffect,
} from '../src/core/match.js';
import { SPAWNS } from '../src/content/map-castle.js';
import { listWeapons, listArmor, listAccessories } from '../src/content/items.js';
import { tickCharges, beginCharge, advanceUntilTurn } from '../src/core/ct.js';
import { pushEvent } from '../src/core/battle-events.js';
import { getAbility } from '../src/content/abilities.js';

describe('gil budget formation (shipped)', () => {
  it('default parties fit budget; overspend rejected', () => {
    const p = defaultPlayerLoadouts();
    const e = defaultEnemyLoadouts();
    const pb = validatePartyBudget(p);
    const eb = validatePartyBudget(e);
    assert.equal(pb.ok, true, pb.error);
    assert.equal(eb.ok, true, eb.error);
    assert.ok(pb.spent > 0);
    assert.ok(pb.spent <= TEAM_GIL_BUDGET);
    assert.equal(partyGilCost(p), pb.spent);

    const rich = p.map((s) => ({
      ...s,
      weaponId: 'diamond_sword',
      armorId: 'diamond_armor',
      accessoryId: 'angel_ring',
    }));
    const bad = validatePartyBudget(rich);
    assert.equal(bad.ok, false);
    assert.ok(bad.spent > TEAM_GIL_BUDGET);
    assert.throws(() => buildParty(rich, 'player', SPAWNS.player));
  });

  it('catalog is deep: dancer/calculator/samurai/ninja/monk + priced gear icons', () => {
    const ids = Object.keys(JOBS);
    assert.ok(ids.length >= 14);
    for (const need of ['dancer', 'calculator', 'samurai', 'ninja', 'fistway', 'summoner']) {
      assert.ok(JOBS[need], `missing job ${need}`);
    }
    assert.ok(listWeapons().length >= 20);
    assert.ok(listArmor().length >= 10);
    assert.ok(listAccessories().length >= 8);
    for (const w of listWeapons()) {
      assert.ok(typeof w.gilCost === 'number');
      assert.ok(w.icon);
      assert.ok(w.description);
    }
    const prev = previewLoadout(defaultPlayerLoadouts()[0]);
    assert.ok(prev.gilCost > 0);
    assert.ok(prev.icons.weapon.startsWith('data:image/svg'));
  });
});

describe('walk path + CT cast resolve (shipped)', () => {
  it('move returns multi-step path (not teleport-only)', () => {
    const m = createMatch({ mode: 'ai' });
    for (const u of m.units) u.ct = 0;
    const hero = m.units.find((u) => u.team === 'player');
    hero.ct = 100;
    m.activeUnitId = hero.id;
    m.turn = { moved: false, acted: false };
    const range = getMoveRange(m, hero);
    const dest = [...range.values()].find((n) => n.path && n.path.length >= 3);
    assert.ok(dest, 'need a multi-step destination');
    const r = applyAction(m, { type: 'move', unitId: hero.id, x: dest.x, y: dest.y });
    assert.equal(r.ok, true, r.error);
    assert.ok(r.presentation?.path?.length >= 3);
    const moveEv = (m.events || []).find((e) => e.kind === 'move' && e.unitId === hero.id);
    assert.ok(moveEv?.path?.length >= 3);
  });

  it('charged firaga damages on resolve clock, not at cast start', () => {
    const m = createMatch({ mode: 'ai' });
    for (const u of m.units) {
      u.ct = 0;
      u.charging = null;
    }
    const mage = m.units.find((u) => u.team === 'player');
    mage.ma = 25;
    mage.mp = 99;
    const foe = m.units.find((u) => u.team === 'enemy');
    foe.x = mage.x + 2;
    foe.y = mage.y;
    foe.hp = 120;
    foe.maxHp = 120;
    const hpAtStart = foe.hp;

    // Pure charge clock (same tickCharges + applyAbilityEffect used by match resolveCharge)
    beginCharge(mage, 'firaga', { x: foe.x, y: foe.y }, 5);
    assert.ok(mage.charging);
    assert.equal(foe.hp, hpAtStart, 'no damage while charging');

    let resolved = false;
    for (let i = 0; i < 8; i++) {
      tickCharges(m.units, (c, charge) => {
        resolved = true;
        assert.equal(charge.abilityId, 'firaga');
        applyAbilityEffect(m, c, charge.abilityId, charge.target, true);
      });
      if (resolved) break;
      assert.equal(foe.hp, hpAtStart, `still no damage mid-charge tick ${i}`);
    }
    assert.equal(resolved, true);
    assert.ok(foe.hp < hpAtStart, `damage applies on resolve (${hpAtStart}→${foe.hp})`);
    assert.ok(
      (m.events || []).some((e) => e.kind === 'hp' && e.fromCharge && e.amount < 0),
      'fromCharge floater'
    );

    // applyAction path: cast_start precedes any fromCharge damage event
    const m2 = createMatch({ mode: 'ai' });
    for (const u of m2.units) {
      u.ct = 0;
      u.charging = null;
    }
    const mage2 = m2.units.find((u) => u.team === 'player');
    if (!mage2.abilities.includes('firaga')) mage2.abilities.push('firaga');
    mage2.mp = 99;
    mage2.ct = 100;
    m2.activeUnitId = mage2.id;
    m2.turn = { moved: false, acted: false };
    const foe2 = m2.units.find((u) => u.team === 'enemy');
    foe2.x = mage2.x + 2;
    foe2.y = mage2.y;
    const r = applyAction(m2, {
      type: 'act',
      unitId: mage2.id,
      abilityId: 'firaga',
      target: { x: foe2.x, y: foe2.y },
    });
    assert.equal(r.ok, true, r.error);
    const ev = m2.events || [];
    const startIdx = ev.findIndex((e) => e.kind === 'cast_start' && e.abilityId === 'firaga');
    assert.ok(startIdx >= 0, 'cast_start emitted');
    const dmgIdx = ev.findIndex((e) => e.kind === 'hp' && e.fromCharge);
    if (dmgIdx >= 0) assert.ok(dmgIdx > startIdx, 'resolve damage after cast_start');
  });

  it('inspectUnit works for ally and foe', () => {
    const m = createMatch({ mode: 'ai' });
    const ally = m.units.find((u) => u.team === 'player');
    const foe = m.units.find((u) => u.team === 'enemy');
    const a = getUnitInspect(m, ally.id);
    const f = getUnitInspect(m, foe.id);
    assert.equal(a.teamLabel, 'Ally');
    assert.equal(f.teamLabel, 'Foe');
    assert.ok(a.hp > 0 && a.maxHp >= a.hp);
    assert.ok(a.abilities.length >= 1);
    assert.ok(a.weaponId);
    assert.ok(a.jobName);
  });

  it('wait with facing sets unit facing', () => {
    const m = createMatch({ mode: 'ai' });
    for (const u of m.units) u.ct = 0;
    const hero = m.units.find((u) => u.team === 'player');
    hero.ct = 100;
    hero.facing = 'N';
    m.activeUnitId = hero.id;
    m.turn = { moved: false, acted: false };
    const r = applyAction(m, { type: 'wait', unitId: hero.id, facing: 'E' });
    assert.equal(r.ok, true, r.error);
    assert.equal(hero.facing, 'E');
  });
});

// silence unused imports when tree-shaken poorly
void beginCharge;
void advanceUntilTurn;
void pushEvent;
void getAbility;
