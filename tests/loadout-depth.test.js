/**
 * FFT-depth loadout preview + visual kits — shipped paths.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  previewLoadout,
  unitFromLoadout,
  equipOptionsForJob,
  defaultPlayerLoadouts,
} from '../src/core/loadout.js';
import { formatAbilityDetail, listAbilities, ABILITIES } from '../src/content/abilities.js';
import { listWeapons, listArmor, listAccessories } from '../src/content/items.js';
import { resolveUnitVisual, allJobKitIds, JOB_KITS } from '../src/content/visual-kits.js';
import { JOBS } from '../src/content/jobs.js';

describe('FFT-depth loadout (shipped)', () => {
  it('previewLoadout exposes multi-attribute stats and ability details', () => {
    const slot = {
      name: 'Test Mage',
      jobId: 'flamecaller',
      secondaryJobId: 'lightmender',
      weaponId: 'rod',
      armorId: 'black_robe',
      accessoryId: 'wizard_ring',
    };
    const p = previewLoadout(slot);
    assert.ok(p.jobName === 'Flamecaller' || p.jobName === 'Black Mage');
    assert.ok(p.jobDescription.length > 10);
    assert.ok(p.stats.hp > 0);
    assert.ok(p.stats.mp > 0);
    assert.ok(p.stats.speed > 0);
    assert.ok(p.stats.move > 0);
    assert.ok(p.stats.jump > 0);
    assert.ok(p.stats.pa > 0);
    assert.ok(p.stats.ma > JOBS.flamecaller.base.ma); // wizard ring
    assert.ok(typeof p.stats.def === 'number');
    assert.ok(p.abilities.length >= 4);
    for (const ab of p.abilities) {
      assert.ok(ab.name);
      assert.ok(ab.description);
      assert.ok('mpCost' in ab);
      assert.ok('minRange' in ab);
      assert.ok('maxRange' in ab);
      assert.ok('castTime' in ab);
      assert.ok(ab.summary.includes('MP'));
    }
    assert.ok(p.equipmentNotes.weapon.length > 5);
    assert.ok(p.equipmentNotes.armor.length > 5);
  });

  it('loadout changes alter stats and ability list', () => {
    const base = previewLoadout({
      name: 'A',
      jobId: 'squireling',
      weaponId: 'sword',
      armorId: 'cloth',
      accessoryId: 'none',
    });
    const geared = previewLoadout({
      name: 'A',
      jobId: 'squireling',
      secondaryJobId: 'ironward',
      weaponId: 'mythril_sword',
      armorId: 'plate',
      accessoryId: 'power_glove',
    });
    assert.ok(geared.stats.hp > base.stats.hp);
    assert.ok(geared.stats.pa > base.stats.pa);
    assert.ok(geared.stats.weaponAtk > base.stats.weaponAtk);
    assert.ok(geared.abilities.length >= base.abilities.length);
    assert.ok(geared.abilityIds.includes('power_slash') || geared.abilityIds.includes('guard_stance'));
  });

  it('expanded catalog has many weapons/armor/accessories with descriptions', () => {
    assert.ok(listWeapons().length >= 10);
    assert.ok(listArmor().length >= 6);
    assert.ok(listAccessories().length >= 6);
    for (const w of listWeapons()) {
      assert.ok(w.description && w.description.length > 5, w.id);
    }
    for (const a of listArmor()) {
      assert.ok(a.description && a.description.length > 5, a.id);
    }
  });

  it('formatAbilityDetail works for all abilities including summons', () => {
    const all = listAbilities();
    assert.ok(all.length >= 15);
    assert.ok(ABILITIES.summon_ifrit);
    const ifrit = formatAbilityDetail('summon_ifrit');
    assert.equal(ifrit.presentation, 'summon');
    assert.ok(ifrit.description.toLowerCase().includes('ifrit') || ifrit.castTime >= 4);
  });

  it('equipOptionsForJob returns job-filtered gear', () => {
    const knight = equipOptionsForJob('ironward');
    assert.ok(knight.weapons.some((w) => w.type === 'sword' || w.type === 'axe'));
    assert.ok(knight.armor.some((a) => a.type === 'plate' || a.id === 'plate'));
    const mage = equipOptionsForJob('flamecaller');
    assert.ok(mage.weapons.every((w) => ['staff', 'rod'].includes(w.type)));
  });

  it('unitFromLoadout carries visual kit id from job', () => {
    const u = unitFromLoadout(
      defaultPlayerLoadouts()[0],
      'p0',
      'player',
      { x: 1, y: 1, facing: 'N' }
    );
    assert.ok(u.visualKitId);
    assert.ok(JOB_KITS[u.jobId] || u.visualKitId === u.jobId);
  });
});

describe('job visual kits (shipped)', () => {
  it('each job has unique kit mapping and gear affects weapon attach', () => {
    const ids = allJobKitIds();
    assert.ok(ids.length >= 8);
    const silhouettes = new Set();
    for (const id of ids) {
      const v = resolveUnitVisual(id, 'sword', 'leather');
      assert.equal(v.kitId, id);
      assert.ok(v.bodyStyle);
      assert.ok(v.silhouette);
      silhouettes.add(v.silhouette);
    }
    assert.ok(silhouettes.size >= 6, 'distinct silhouettes');

    const knight = resolveUnitVisual('ironward', 'war_axe', 'plate');
    assert.equal(knight.weaponAttach, 'axe');
    assert.equal(knight.armorType, 'plate');
    assert.equal(knight.bodyStyle, 'heavy');

    const archer = resolveUnitVisual('bowmark', 'bow', 'leather');
    assert.equal(archer.weaponAttach, 'bow');

    const mage = resolveUnitVisual('flamecaller', 'rod', 'black_robe');
    assert.ok(mage.bodyStyle === 'robe' || mage.armorType.includes('robe'));
    assert.equal(mage.weaponAttach, 'rod');
  });
});
