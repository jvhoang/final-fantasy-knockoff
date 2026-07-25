import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  unitFromLoadout,
  buildParty,
  defaultPlayerLoadouts,
  defaultEnemyLoadouts,
  PARTY_SIZE,
} from '../src/core/loadout.js';
import { createMatch, applyAction, getUnit, getMoveRange, applyAbilityEffect } from '../src/core/match.js';
import { SPAWNS } from '../src/content/map-castle.js';
import { JOBS } from '../src/content/jobs.js';
import { STATUS } from '../src/core/constants.js';

describe('loadout builder (shipped)', () => {
  it('builds unit stats from job + equipment + secondary skills', () => {
    const unit = unitFromLoadout(
      {
        name: 'Hero',
        jobId: 'flamecaller',
        secondaryJobId: 'lightmender',
        weaponId: 'rod',
        armorId: 'robe',
        accessoryId: 'mage_hat',
      },
      'p0',
      'player',
      { x: 1, y: 1, facing: 'N' }
    );
    assert.equal(unit.name, 'Hero');
    assert.equal(unit.jobId, 'flamecaller');
    assert.ok(unit.maxHp > JOBS.flamecaller.base.hp); // robe hp bonus
    assert.ok(unit.maxMp > JOBS.flamecaller.base.mp);
    assert.ok(unit.ma > JOBS.flamecaller.base.ma); // mage hat
    assert.ok(unit.abilities.includes('fire'));
    assert.ok(unit.abilities.includes('cure')); // from secondary
    assert.equal(unit.weaponId, 'rod');
    assert.equal(unit.armorId, 'robe');
  });

  it('enforces exactly 4 party members', () => {
    assert.equal(PARTY_SIZE, 4);
    assert.equal(defaultPlayerLoadouts().length, 4);
    assert.equal(defaultEnemyLoadouts().length, 4);
    const party = buildParty(defaultPlayerLoadouts(), 'player', SPAWNS.player);
    assert.equal(party.length, 4);
    assert.throws(() => buildParty(defaultPlayerLoadouts().slice(0, 3), 'player', SPAWNS.player));
  });

  it('createMatch is 4v4 with CT active unit', () => {
    const m = createMatch({ mode: 'ai' });
    assert.equal(m.units.length, 8);
    assert.equal(m.units.filter((u) => u.team === 'player').length, 4);
    assert.equal(m.units.filter((u) => u.team === 'enemy').length, 4);
    assert.equal(m.phase, 'battle');
    assert.ok(m.activeUnitId);
    const active = getUnit(m, m.activeUnitId);
    assert.ok(active.ct >= 100);
  });

  it('move then wait applies CT residual partial economy', () => {
    const m = createMatch();
    for (const u of m.units) {
      u.ct = 0;
    }
    const hero = m.units.find((u) => u.team === 'player');
    hero.ct = 100;
    m.activeUnitId = hero.id;
    m.turn = { moved: false, acted: false };

    const range = getMoveRange(m, hero);
    const dest = [...range.values()].find((n) => n.x !== hero.x || n.y !== hero.y);
    assert.ok(dest, 'should have a move tile');
    let r = applyAction(m, { type: 'move', unitId: hero.id, x: dest.x, y: dest.y });
    assert.equal(r.ok, true);
    assert.equal(m.turn.moved, true);
    // endTurn is what subtracts CT — call via wait; clock may advance afterward
    const ctBeforeEnd = hero.ct;
    assert.equal(ctBeforeEnd, 100);
    r = applyAction(m, { type: 'wait', unitId: hero.id });
    assert.equal(r.ok, true);
    // Log must record partial economy (-80)
    assert.ok(
      m.log.some((line) => line.includes(hero.name) && line.includes('CT -80')),
      `expected CT -80 log, got: ${m.log.slice(-5).join(' | ')}`
    );
  });

  it('guard_stance applies Protect via shipped applyAction path', () => {
    const m = createMatch({
      mode: 'ai',
      playerLoadouts: [
        {
          name: 'Guard',
          jobId: 'ironward',
          secondaryJobId: null,
          weaponId: 'sword',
          armorId: 'plate',
          accessoryId: 'none',
        },
        ...defaultPlayerLoadouts().slice(1),
      ],
    });
    for (const u of m.units) u.ct = 0;
    const knight = m.units.find((u) => u.name === 'Guard');
    assert.ok(knight.abilities.includes('guard_stance'));
    knight.ct = 100;
    m.activeUnitId = knight.id;
    m.turn = { moved: false, acted: false };
    m.phase = 'battle';

    const before = knight.statuses.some((s) => s.id === STATUS.PROTECT);
    assert.equal(before, false);

    const r = applyAction(m, {
      type: 'act',
      unitId: knight.id,
      abilityId: 'guard_stance',
      target: { x: knight.x, y: knight.y },
    });
    assert.equal(r.ok, true, r.error);
    assert.ok(
      knight.statuses.some((s) => s.id === STATUS.PROTECT && s.duration > 0),
      `expected Protect status, got ${JSON.stringify(knight.statuses)}; log=${m.log.slice(-4).join(' | ')}`
    );
    assert.ok(m.log.some((l) => l.toLowerCase().includes('guard')));
  });

  it('applyAbilityEffect guard_stance sets Protect on caster', () => {
    const m = createMatch();
    const u = m.units.find((x) => x.team === 'player');
    u.statuses = [];
    applyAbilityEffect(m, u, 'guard_stance', { x: u.x, y: u.y }, false);
    assert.ok(u.statuses.some((s) => s.id === STATUS.PROTECT));
  });
});

