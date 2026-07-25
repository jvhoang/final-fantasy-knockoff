/**
 * Loadout-only party builder: gil budget shop, FFT-depth stats, skill details.
 */
import { PARTY_SIZE, TEAMS, TEAM_GIL_BUDGET } from './constants.js';
import { JOBS } from '../content/jobs.js';
import { ABILITIES, formatAbilityDetail } from '../content/abilities.js';
import {
  getWeapon,
  getArmor,
  getAccessory,
  WEAPONS,
  ARMOR,
  ACCESSORIES,
  loadoutSlotCost,
  partyGilCost,
  itemIconUrl,
} from '../content/items.js';
import { resolveUnitVisual } from '../content/visual-kits.js';

/**
 * @typedef {{
 *   name: string,
 *   jobId: string,
 *   secondaryJobId?: string | null,
 *   weaponId: string,
 *   armorId: string,
 *   accessoryId?: string,
 *   extraAbilityIds?: string[],
 *   gender?: 'm'|'f',
 * }} LoadoutSlot
 */

/**
 * @param {LoadoutSlot} slot
 */
export function previewLoadout(slot) {
  const job = JOBS[slot.jobId];
  if (!job) throw new Error(`Unknown job: ${slot.jobId}`);
  const weapon = getWeapon(slot.weaponId);
  const armor = getArmor(slot.armorId);
  const acc = getAccessory(slot.accessoryId ?? 'none');
  const secondary = slot.secondaryJobId ? JOBS[slot.secondaryJobId] : null;

  /** @type {string[]} */
  let abilityIds = [...job.primaryAbilities];
  if (secondary) {
    for (const a of secondary.primaryAbilities.slice(0, 4)) {
      if (!abilityIds.includes(a)) abilityIds.push(a);
    }
  }
  if (slot.extraAbilityIds) {
    for (const a of slot.extraAbilityIds) {
      if (ABILITIES[a] && !abilityIds.includes(a)) abilityIds.push(a);
    }
  }

  const stats = {
    hp: job.base.hp + (armor?.hpBonus ?? 0),
    mp: job.base.mp + (armor?.mpBonus ?? 0),
    speed: job.base.speed + (acc?.speedBonus ?? 0),
    move: job.base.move + (acc?.moveBonus ?? 0),
    jump: job.base.jump + (acc?.jumpBonus ?? 0),
    pa: job.base.pa + (acc?.paBonus ?? 0),
    ma: job.base.ma + (acc?.maBonus ?? 0),
    def: armor?.def ?? 0,
    weaponAtk: weapon?.atk ?? 0,
    weaponRange: weapon ? `${weapon.rangeMin}–${weapon.rangeMax}` : '—',
  };

  const gilCost = loadoutSlotCost(slot);
  const abilities = abilityIds.map((id) => formatAbilityDetail(id)).filter(Boolean);
  const visual = resolveUnitVisual(slot.jobId, slot.weaponId, slot.armorId, slot.gender);

  return {
    name: slot.name || job.name,
    jobId: job.id,
    jobName: job.name,
    jobDescription: job.description || '',
    secondaryJobId: secondary?.id || null,
    secondaryJobName: secondary?.name || null,
    weapon,
    armor,
    accessory: acc,
    stats,
    abilities,
    abilityIds,
    visual,
    gilCost,
    icons: {
      weapon: itemIconUrl(weapon),
      armor: itemIconUrl(armor),
      accessory: itemIconUrl(acc),
      job: job.icon || 'job-knight',
    },
    equipmentNotes: {
      weapon: weapon?.description || '',
      armor: armor?.description || '',
      accessory: acc?.description || '',
    },
  };
}

/**
 * @param {LoadoutSlot[]} loadouts
 * @param {number} [budget=TEAM_GIL_BUDGET]
 */
export function validatePartyBudget(loadouts, budget = TEAM_GIL_BUDGET) {
  const spent = partyGilCost(loadouts);
  return {
    ok: spent <= budget,
    spent,
    budget,
    remaining: budget - spent,
    error: spent > budget ? `Over budget by ${spent - budget} gil` : null,
  };
}

/**
 * @param {LoadoutSlot} slot
 * @param {string} id
 * @param {string} team
 * @param {{x:number,y:number,facing:string}} spawn
 */
export function unitFromLoadout(slot, id, team, spawn) {
  const preview = previewLoadout(slot);
  const s = preview.stats;

  return {
    id,
    name: preview.name,
    team,
    hp: s.hp,
    maxHp: s.hp,
    mp: s.mp,
    maxMp: s.mp,
    speed: s.speed,
    ct: 0,
    move: s.move,
    jump: s.jump,
    pa: s.pa,
    ma: s.ma,
    x: spawn.x,
    y: spawn.y,
    facing: /** @type {any} */ (spawn.facing || 'N'),
    statuses: [],
    alive: true,
    charging: null,
    jobId: preview.jobId,
    abilities: preview.abilityIds,
    weaponId: slot.weaponId,
    armorId: slot.armorId,
    accessoryId: slot.accessoryId ?? 'none',
    def: s.def,
    visualKitId: preview.visual.kitId,
    gender: slot.gender || 'm',
    gilSpent: preview.gilCost,
  };
}

export function buildParty(loadouts, team, spawns) {
  if (!Array.isArray(loadouts) || loadouts.length !== PARTY_SIZE) {
    throw new Error(`Party must be exactly ${PARTY_SIZE} units (4v4 only)`);
  }
  const budget = validatePartyBudget(loadouts);
  if (!budget.ok) {
    throw new Error(budget.error || 'Party over gil budget');
  }
  if (spawns.length < PARTY_SIZE) {
    throw new Error('Not enough spawn points');
  }
  return loadouts.map((slot, i) => unitFromLoadout(slot, `${team}-${i}`, team, spawns[i]));
}

export function defaultPlayerLoadouts() {
  return [
    {
      name: 'Ramza',
      jobId: 'squireling',
      secondaryJobId: 'ironward',
      weaponId: 'longsword',
      armorId: 'hard_leather',
      accessoryId: 'power_glove',
      gender: 'm',
    },
    {
      name: 'Agrias-ish',
      jobId: 'ironward',
      secondaryJobId: 'squireling',
      weaponId: 'mythril_sword',
      armorId: 'plate',
      accessoryId: 'bracer',
      gender: 'f',
    },
    {
      name: 'Black Mage',
      jobId: 'flamecaller',
      secondaryJobId: 'clockbinder',
      weaponId: 'rod',
      armorId: 'black_robe',
      accessoryId: 'mage_hat',
      gender: 'm',
    },
    {
      name: 'White Mage',
      jobId: 'lightmender',
      secondaryJobId: 'chemist',
      weaponId: 'staff',
      armorId: 'white_robe',
      accessoryId: 'speed_ring',
      gender: 'f',
    },
  ];
}

export function defaultEnemyLoadouts() {
  // Keep under budget with average-ish kits
  return [
    {
      name: 'Foe Knight',
      jobId: 'ironward',
      weaponId: 'axe',
      armorId: 'plate',
      accessoryId: 'none',
      gender: 'm',
    },
    {
      name: 'Foe Archer',
      jobId: 'bowmark',
      weaponId: 'bow',
      armorId: 'leather',
      accessoryId: 'speed_ring',
      gender: 'f',
    },
    {
      name: 'Foe Mage',
      jobId: 'flamecaller',
      weaponId: 'rod',
      armorId: 'cloth',
      accessoryId: 'mage_hat',
      gender: 'm',
    },
    {
      name: 'Foe Ninja',
      jobId: 'ninja',
      weaponId: 'ninja_blade',
      armorId: 'ninja_gear',
      accessoryId: 'none',
      gender: 'm',
    },
  ];
}

export function equipOptionsForJob(jobId) {
  const job = JOBS[jobId];
  if (!job) return { weapons: [], armor: [], accessories: Object.values(ACCESSORIES) };
  const wTypes = new Set(job.canEquip.weapons);
  const aTypes = new Set(job.canEquip.armor);
  const weapons = Object.values(WEAPONS).filter(
    (w) => wTypes.has(w.type) || wTypes.has(w.id) || job.canEquip.weapons.includes(w.id)
  );
  const armor = Object.values(ARMOR).filter(
    (a) => aTypes.has(a.type) || aTypes.has(a.id) || job.canEquip.armor.includes(a.id)
  );
  return {
    weapons: weapons.length ? weapons : Object.values(WEAPONS).filter((w) => wTypes.has(w.type)),
    armor: armor.length ? armor : Object.values(ARMOR).filter((a) => aTypes.has(a.type)),
    accessories: Object.values(ACCESSORIES),
  };
}

export {
  PARTY_SIZE,
  TEAMS,
  TEAM_GIL_BUDGET,
  JOBS,
  ABILITIES,
  formatAbilityDetail,
  partyGilCost,
  loadoutSlotCost,
  itemIconUrl,
};
