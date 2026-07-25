/**
 * FFT-inspired shop catalog: weapons, armor, accessories with gilCost + icons.
 * Pricing balances around TEAM_GIL_BUDGET / 4 ≈ 3000 average kit.
 */
import { resolveIcon } from './icons.js';

/** @typedef {{
 *   id: string, name: string, type: string, atk: number, wp: number,
 *   rangeMin: number, rangeMax: number, description: string,
 *   gilCost: number, icon: string
 * }} WeaponDef */
/** @typedef {{
 *   id: string, name: string, type: string, def: number, hpBonus: number,
 *   mpBonus: number, description: string, gilCost: number, icon: string
 * }} ArmorDef */
/** @typedef {{
 *   id: string, name: string, speedBonus: number, paBonus: number, maBonus: number,
 *   moveBonus?: number, jumpBonus?: number, description: string,
 *   gilCost: number, icon: string
 * }} AccessoryDef */

function W(p) {
  return { rangeMin: 1, rangeMax: 1, wp: 1, icon: 'wpn-sword', ...p };
}
function A(p) {
  return { icon: 'arm-leather', ...p };
}
function X(p) {
  return { speedBonus: 0, paBonus: 0, maBonus: 0, icon: 'acc-ring', gilCost: 0, ...p };
}

/** @type {Record<string, WeaponDef>} */
export const WEAPONS = {
  // Knives
  knife: W({ id: 'knife', name: 'Knife', type: 'knife', atk: 3, gilCost: 50, icon: 'wpn-knife', description: 'WP 3. Cheap starter blade.' }),
  dagger: W({ id: 'dagger', name: 'Dagger', type: 'knife', atk: 4, gilCost: 200, icon: 'wpn-knife', description: 'WP 4. Light and quick.' }),
  main_gauche: W({ id: 'main_gauche', name: 'Main Gauche', type: 'knife', atk: 5, gilCost: 400, icon: 'wpn-knife', description: 'WP 5. Parrying dagger.' }),
  orichalcum: W({ id: 'orichalcum', name: 'Orichalcum', type: 'knife', atk: 8, gilCost: 1200, icon: 'wpn-knife', description: 'WP 8. Rare knife.' }),
  // Swords
  sword: W({ id: 'sword', name: 'Broad Sword', type: 'sword', atk: 4, gilCost: 200, icon: 'wpn-sword', description: 'WP 4. Basic sword.' }),
  longsword: W({ id: 'longsword', name: 'Long Sword', type: 'sword', atk: 6, gilCost: 500, icon: 'wpn-sword', description: 'WP 6. Reliable iron.' }),
  mythril_sword: W({ id: 'mythril_sword', name: 'Mythril Sword', type: 'sword', atk: 9, gilCost: 1000, icon: 'wpn-sword', description: 'WP 9. Fine mythril.' }),
  blood_sword: W({ id: 'blood_sword', name: 'Blood Sword', type: 'sword', atk: 8, gilCost: 1500, icon: 'wpn-sword', description: 'WP 8. Cursed edge.' }),
  coral_sword: W({ id: 'coral_sword', name: 'Coral Sword', type: 'sword', atk: 10, gilCost: 1800, icon: 'wpn-sword', description: 'WP 10. Elegant blade.' }),
  diamond_sword: W({ id: 'diamond_sword', name: 'Diamond Sword', type: 'sword', atk: 12, gilCost: 2500, icon: 'wpn-sword', description: 'WP 12. Elite sword.' }),
  // Axes
  axe: W({ id: 'axe', name: 'Battle Axe', type: 'axe', atk: 8, gilCost: 600, icon: 'wpn-axe', description: 'WP 8. Heavy cleaver.' }),
  war_axe: W({ id: 'war_axe', name: 'Giant Axe', type: 'axe', atk: 12, gilCost: 1600, icon: 'wpn-axe', description: 'WP 12. Brutal power.' }),
  // Bows
  bow: W({ id: 'bow', name: 'Longbow', type: 'bow', atk: 5, rangeMin: 2, rangeMax: 5, gilCost: 500, icon: 'wpn-bow', description: 'WP 5. Range 2–5.' }),
  crossbow: W({ id: 'crossbow', name: 'Crossbow', type: 'bow', atk: 7, rangeMin: 2, rangeMax: 4, gilCost: 900, icon: 'wpn-bow', description: 'WP 7. Range 2–4.' }),
  mythril_bow: W({ id: 'mythril_bow', name: 'Mythril Bow', type: 'bow', atk: 9, rangeMin: 2, rangeMax: 5, gilCost: 1600, icon: 'wpn-bow', description: 'WP 9. Range 2–5.' }),
  // Staves / rods
  staff: W({ id: 'staff', name: 'Oak Staff', type: 'staff', atk: 2, gilCost: 200, icon: 'wpn-staff', description: 'WP 2. Mage focus.' }),
  mythril_staff: W({ id: 'mythril_staff', name: 'Mythril Staff', type: 'staff', atk: 4, gilCost: 800, icon: 'wpn-staff', description: 'WP 4. Conductive.' }),
  wizard_staff: W({ id: 'wizard_staff', name: 'Wizard Staff', type: 'staff', atk: 5, gilCost: 1400, icon: 'wpn-staff', description: 'WP 5. Arcane wood.' }),
  rod: W({ id: 'rod', name: 'Flame Rod', type: 'rod', atk: 2, gilCost: 300, icon: 'wpn-rod', description: 'WP 2. Fire aspect.' }),
  ice_rod: W({ id: 'ice_rod', name: 'Ice Rod', type: 'rod', atk: 3, gilCost: 500, icon: 'wpn-rod', description: 'WP 3. Ice aspect.' }),
  thunder_rod: W({ id: 'thunder_rod', name: 'Thunder Rod', type: 'rod', atk: 4, gilCost: 900, icon: 'wpn-rod', description: 'WP 4. Lightning.' }),
  // Fist / pole / special
  fist: W({ id: 'fist', name: 'Iron Knuckles', type: 'fist', atk: 4, gilCost: 300, icon: 'wpn-fist', description: 'WP 4. Monk gear.' }),
  mythril_claws: W({ id: 'mythril_claws', name: 'Mythril Claws', type: 'fist', atk: 7, gilCost: 1100, icon: 'wpn-fist', description: 'WP 7. Sharp claws.' }),
  partisan: W({ id: 'partisan', name: 'Partisan', type: 'spear', atk: 7, rangeMax: 2, gilCost: 800, icon: 'wpn-spear', description: 'WP 7. Range 1–2.' }),
  javelin: W({ id: 'javelin', name: 'Javelin', type: 'spear', atk: 9, rangeMax: 2, gilCost: 1400, icon: 'wpn-spear', description: 'WP 9. Range 1–2.' }),
  katana: W({ id: 'katana', name: 'Asura Knife', type: 'katana', atk: 8, gilCost: 1000, icon: 'wpn-katana', description: 'WP 8. Samurai steel.' }),
  kikuichimonji: W({ id: 'kikuichimonji', name: 'Kiku-ichimonji', type: 'katana', atk: 12, gilCost: 2200, icon: 'wpn-katana', description: 'WP 12. Master katana.' }),
  ninja_blade: W({ id: 'ninja_blade', name: 'Ninja Blade', type: 'knife', atk: 7, gilCost: 900, icon: 'wpn-shuriken', description: 'WP 7. Shadow steel.' }),
  spellbook: W({ id: 'spellbook', name: 'Battle Book', type: 'book', atk: 3, gilCost: 600, icon: 'wpn-book', description: 'WP 3. Calculator focus.' }),
  battle_fan: W({ id: 'battle_fan', name: 'War Fan', type: 'fan', atk: 5, gilCost: 700, icon: 'wpn-fan', description: 'WP 5. Dancer tool.' }),
};

/** @type {Record<string, ArmorDef>} */
export const ARMOR = {
  cloth: A({ id: 'cloth', name: 'Clothes', type: 'cloth', def: 1, hpBonus: 0, mpBonus: 5, gilCost: 50, icon: 'arm-cloth', description: 'Def 1, +5 MP.' }),
  leather: A({ id: 'leather', name: 'Leather Outfit', type: 'leather', def: 3, hpBonus: 10, mpBonus: 0, gilCost: 300, icon: 'arm-leather', description: 'Def 3, +10 HP.' }),
  hard_leather: A({ id: 'hard_leather', name: 'Hard Leather', type: 'leather', def: 4, hpBonus: 15, mpBonus: 0, gilCost: 500, icon: 'arm-leather', description: 'Def 4, +15 HP.' }),
  chain: A({ id: 'chain', name: 'Chain Mail', type: 'chain', def: 5, hpBonus: 18, mpBonus: 0, gilCost: 800, icon: 'arm-plate', description: 'Def 5, +18 HP.' }),
  plate: A({ id: 'plate', name: 'Plate Mail', type: 'plate', def: 6, hpBonus: 25, mpBonus: 0, gilCost: 1200, icon: 'arm-plate', description: 'Def 6, +25 HP.' }),
  carapace: A({ id: 'carapace', name: 'Carapace Armor', type: 'plate', def: 7, hpBonus: 30, mpBonus: 0, gilCost: 1600, icon: 'arm-plate', description: 'Def 7, +30 HP.' }),
  diamond_armor: A({ id: 'diamond_armor', name: 'Diamond Armor', type: 'plate', def: 9, hpBonus: 40, mpBonus: 0, gilCost: 2500, icon: 'arm-plate', description: 'Def 9, +40 HP.' }),
  robe: A({ id: 'robe', name: 'Linen Robe', type: 'robe', def: 2, hpBonus: 5, mpBonus: 15, gilCost: 400, icon: 'arm-robe', description: 'Def 2, +15 MP.' }),
  silk_robe: A({ id: 'silk_robe', name: 'Silk Robe', type: 'robe', def: 2, hpBonus: 6, mpBonus: 22, gilCost: 700, icon: 'arm-robe', description: 'Def 2, +22 MP.' }),
  white_robe: A({ id: 'white_robe', name: 'White Robe', type: 'robe', def: 3, hpBonus: 8, mpBonus: 28, gilCost: 1100, icon: 'arm-robe', description: 'Def 3, +28 MP.' }),
  black_robe: A({ id: 'black_robe', name: 'Black Robe', type: 'mage_robe', def: 2, hpBonus: 4, mpBonus: 32, gilCost: 1100, icon: 'arm-robe', description: 'Def 2, +32 MP.' }),
  wizard_robe: A({ id: 'wizard_robe', name: 'Wizard Outfit', type: 'mage_robe', def: 3, hpBonus: 6, mpBonus: 40, gilCost: 1800, icon: 'arm-robe', description: 'Def 3, +40 MP.' }),
  ninja_gear: A({ id: 'ninja_gear', name: 'Ninja Gear', type: 'leather', def: 4, hpBonus: 12, mpBonus: 8, gilCost: 1000, icon: 'arm-leather', description: 'Def 4, +12 HP, +8 MP.' }),
  power_sleeve: A({ id: 'power_sleeve', name: 'Power Sleeve', type: 'cloth', def: 3, hpBonus: 20, mpBonus: 0, gilCost: 900, icon: 'arm-cloth', description: 'Def 3, +20 HP. Monk wear.' }),
};

/** @type {Record<string, AccessoryDef>} */
export const ACCESSORIES = {
  none: X({ id: 'none', name: 'None', gilCost: 0, description: 'Empty slot.' }),
  speed_ring: X({ id: 'speed_ring', name: 'Speed Ring', speedBonus: 2, gilCost: 800, description: '+2 Speed.' }),
  power_glove: X({ id: 'power_glove', name: 'Power Gauntlet', paBonus: 2, gilCost: 700, description: '+2 PA.' }),
  mage_hat: X({ id: 'mage_hat', name: 'Wizard Hat', maBonus: 2, gilCost: 700, icon: 'acc-hat', description: '+2 MA.' }),
  battle_boots: X({ id: 'battle_boots', name: 'Battle Boots', speedBonus: 1, moveBonus: 1, gilCost: 900, icon: 'acc-boots', description: '+1 Speed, +1 Move.' }),
  germinas_boots: X({ id: 'germinas_boots', name: 'Germinas Boots', jumpBonus: 2, gilCost: 1000, icon: 'acc-boots', description: '+2 Jump.' }),
  bracer: X({ id: 'bracer', name: 'Bracer', paBonus: 3, gilCost: 1200, description: '+3 PA.' }),
  wizard_ring: X({ id: 'wizard_ring', name: 'Magic Ring', maBonus: 3, gilCost: 1200, description: '+3 MA.' }),
  reflex: X({ id: 'reflex', name: 'Sprint Shoes', speedBonus: 3, gilCost: 1500, icon: 'acc-boots', description: '+3 Speed.' }),
  defense_ring: X({ id: 'defense_ring', name: 'Defense Ring', gilCost: 600, description: 'Protective charm (flavor).' }),
  angel_ring: X({ id: 'angel_ring', name: 'Angel Ring', gilCost: 1800, description: 'Holy ring (flavor).' }),
  feather_boots: X({ id: 'feather_boots', name: 'Feather Boots', moveBonus: 1, jumpBonus: 1, gilCost: 1100, icon: 'acc-boots', description: '+1 Move, +1 Jump.' }),
  mana_band: X({ id: 'mana_band', name: 'Mana Band', maBonus: 1, speedBonus: 1, gilCost: 1000, description: '+1 MA, +1 Speed.' }),
};

export function getWeapon(id) {
  return WEAPONS[id] ?? null;
}
export function getArmor(id) {
  return ARMOR[id] ?? null;
}
export function getAccessory(id) {
  return ACCESSORIES[id] ?? ACCESSORIES.none;
}

export function listWeapons() {
  return Object.values(WEAPONS);
}
export function listArmor() {
  return Object.values(ARMOR);
}
export function listAccessories() {
  return Object.values(ACCESSORIES);
}

export function itemIconUrl(item) {
  if (!item) return resolveIcon('default');
  // Prefer unique art per item id (blood_sword vs diamond_sword, etc.)
  return resolveIcon(item.icon || item.id, item.id);
}

/** Total gil of a loadout slot */
export function loadoutSlotCost(slot) {
  const w = getWeapon(slot.weaponId);
  const a = getArmor(slot.armorId);
  const x = getAccessory(slot.accessoryId ?? 'none');
  return (w?.gilCost ?? 0) + (a?.gilCost ?? 0) + (x?.gilCost ?? 0);
}

/** Total gil for up to 4 slots */
export function partyGilCost(loadouts) {
  return (loadouts || []).reduce((sum, s) => sum + loadoutSlotCost(s), 0);
}
