/**
 * FFT-inspired job roster (homage names) with wider attribute ranges.
 */

/** @typedef {{
 *   id: string, name: string, description: string,
 *   base: { hp: number, mp: number, speed: number, move: number, jump: number, pa: number, ma: number },
 *   primaryAbilities: string[],
 *   canEquip: { weapons: string[], armor: string[] },
 *   icon?: string,
 * }} JobDef */

/** @type {Record<string, JobDef>} */
export const JOBS = {
  squireling: {
    id: 'squireling', name: 'Squire', icon: 'job-knight',
    description: 'Foundation fighter. Strike, Throw Stone, Focus.',
    base: { hp: 140, mp: 30, speed: 8, move: 4, jump: 3, pa: 7, ma: 4 },
    primaryAbilities: ['strike', 'throw_stone', 'focus', 'accumulate'],
    canEquip: { weapons: ['sword', 'knife'], armor: ['leather', 'cloth', 'chain'] },
  },
  ironward: {
    id: 'ironward', name: 'Knight', icon: 'job-knight',
    description: 'Heavy armor and Power Slash / Guard Stance.',
    base: { hp: 200, mp: 15, speed: 6, move: 3, jump: 2, pa: 11, ma: 3 },
    primaryAbilities: ['strike', 'power_slash', 'guard_stance', 'armor_break'],
    canEquip: { weapons: ['sword', 'axe', 'spear'], armor: ['plate', 'leather', 'chain'] },
  },
  bowmark: {
    id: 'bowmark', name: 'Archer', icon: 'wpn-bow',
    description: 'Ranged specialist. Aimed Shot, Rain of Arrows.',
    base: { hp: 120, mp: 25, speed: 10, move: 4, jump: 3, pa: 9, ma: 4 },
    primaryAbilities: ['aimed_shot', 'rain_of_arrows', 'charge_shot'],
    canEquip: { weapons: ['bow'], armor: ['leather', 'cloth'] },
  },
  flamecaller: {
    id: 'flamecaller', name: 'Black Mage', icon: 'job-mage',
    description: 'Destructive magic: Fire through Firaga.',
    base: { hp: 100, mp: 100, speed: 7, move: 3, jump: 2, pa: 4, ma: 13 },
    primaryAbilities: ['fire', 'ice', 'bolt', 'firaga', 'thundara'],
    canEquip: { weapons: ['staff', 'rod'], armor: ['cloth', 'robe', 'mage_robe'] },
  },
  lightmender: {
    id: 'lightmender', name: 'White Mage', icon: 'fx-holy',
    description: 'Cure, Protect, Shell, Raise-style support.',
    base: { hp: 115, mp: 90, speed: 7, move: 3, jump: 2, pa: 4, ma: 12 },
    primaryAbilities: ['cure', 'cura', 'protect', 'shell', 'esuna'],
    canEquip: { weapons: ['staff'], armor: ['cloth', 'robe'] },
  },
  shadowstep: {
    id: 'shadowstep', name: 'Thief', icon: 'wpn-knife',
    description: 'High Move/Speed. Steal and Backstab.',
    base: { hp: 110, mp: 35, speed: 12, move: 5, jump: 4, pa: 8, ma: 4 },
    primaryAbilities: ['strike', 'steal_gil', 'backstab', 'steal_heart'],
    canEquip: { weapons: ['knife'], armor: ['leather', 'cloth'] },
  },
  fistway: {
    id: 'fistway', name: 'Monk', icon: 'wpn-fist',
    description: 'Chakra, Spin Kick, Earth Slash.',
    base: { hp: 160, mp: 40, speed: 9, move: 4, jump: 4, pa: 10, ma: 5 },
    primaryAbilities: ['strike', 'chakra', 'spin_kick', 'earth_slash'],
    canEquip: { weapons: ['fist'], armor: ['cloth', 'leather'] },
  },
  clockbinder: {
    id: 'clockbinder', name: 'Time Mage', icon: 'job-mage',
    description: 'Haste, Slow, Stop — CT control.',
    base: { hp: 105, mp: 85, speed: 8, move: 3, jump: 2, pa: 4, ma: 12 },
    primaryAbilities: ['haste', 'slow', 'stop_tick', 'float_step'],
    canEquip: { weapons: ['staff', 'rod'], armor: ['cloth', 'robe', 'mage_robe'] },
  },
  summoner: {
    id: 'summoner', name: 'Summoner', icon: 'fx-fire',
    description: 'Call espers: Moogle heal, Ifrit fire, Shiva ice.',
    base: { hp: 95, mp: 110, speed: 6, move: 3, jump: 2, pa: 3, ma: 14 },
    primaryAbilities: ['summon_moogle', 'summon_ifrit', 'summon_shiva', 'cure'],
    canEquip: { weapons: ['staff', 'rod'], armor: ['cloth', 'robe', 'mage_robe'] },
  },
  // Expanded FFT-inspired jobs
  ninja: {
    id: 'ninja', name: 'Ninja', icon: 'wpn-shuriken',
    description: 'Dual-speed striker. Throw and Water Walk flavor skills.',
    base: { hp: 115, mp: 45, speed: 13, move: 5, jump: 4, pa: 9, ma: 5 },
    primaryAbilities: ['strike', 'shuriken_throw', 'smoke_bomb', 'backstab'],
    canEquip: { weapons: ['knife', 'katana'], armor: ['leather', 'cloth'] },
  },
  samurai: {
    id: 'samurai', name: 'Samurai', icon: 'wpn-katana',
    description: 'Iaido arts and heavy katana strikes.',
    base: { hp: 150, mp: 50, speed: 8, move: 3, jump: 3, pa: 11, ma: 6 },
    primaryAbilities: ['strike', 'iaido_slash', 'blade_grasp', 'power_slash'],
    canEquip: { weapons: ['katana', 'sword'], armor: ['plate', 'leather', 'chain'] },
  },
  dancer: {
    id: 'dancer', name: 'Dancer', icon: 'wpn-fan',
    description: 'Debuff dances: Witch Hunt, Slow Dance, Nameless Dance.',
    base: { hp: 110, mp: 55, speed: 11, move: 4, jump: 3, pa: 6, ma: 8 },
    primaryAbilities: ['strike', 'witch_hunt', 'slow_dance', 'nameless_dance'],
    canEquip: { weapons: ['knife', 'fan'], armor: ['cloth', 'leather'] },
  },
  calculator: {
    id: 'calculator', name: 'Calculator', icon: 'wpn-book',
    description: 'Math magic: CT-based AoE firaga/cure via arithmetic.',
    base: { hp: 100, mp: 80, speed: 6, move: 3, jump: 2, pa: 4, ma: 11 },
    primaryAbilities: ['math_fire', 'math_cure', 'math_bolt', 'focus'],
    canEquip: { weapons: ['book', 'staff', 'rod'], armor: ['robe', 'cloth', 'mage_robe'] },
  },
  geomancer: {
    id: 'geomancer', name: 'Geomancer', icon: 'fx-holy',
    description: 'Terrain magick: Sinkhole, Magma Surge, Wind Blast.',
    base: { hp: 125, mp: 70, speed: 8, move: 4, jump: 3, pa: 7, ma: 10 },
    primaryAbilities: ['strike', 'sinkhole', 'magma_surge', 'wind_blast'],
    canEquip: { weapons: ['sword', 'staff'], armor: ['leather', 'robe', 'cloth'] },
  },
  orator: {
    id: 'orator', name: 'Orator', icon: 'job-mage',
    description: 'Speechcraft: Praise, Intimidate, Steal Heart.',
    base: { hp: 120, mp: 60, speed: 8, move: 3, jump: 2, pa: 6, ma: 9 },
    primaryAbilities: ['strike', 'praise', 'intimidate', 'steal_heart'],
    canEquip: { weapons: ['knife', 'gun' /* fallthrough knife */, 'staff'], armor: ['cloth', 'leather'] },
  },
  lancer: {
    id: 'lancer', name: 'Lancer', icon: 'wpn-spear',
    description: 'Jump and spear mastery.',
    base: { hp: 145, mp: 30, speed: 8, move: 3, jump: 5, pa: 10, ma: 4 },
    primaryAbilities: ['strike', 'jump_attack', 'power_slash'],
    canEquip: { weapons: ['spear', 'sword'], armor: ['plate', 'chain', 'leather'] },
  },
  chemist: {
    id: 'chemist', name: 'Chemist', icon: 'fx-holy',
    description: 'Item lore and potions as skills (Potion, Hi-Potion, Phoenix).',
    base: { hp: 125, mp: 50, speed: 8, move: 4, jump: 3, pa: 6, ma: 7 },
    primaryAbilities: ['strike', 'potion', 'hi_potion', 'phoenix_down'],
    canEquip: { weapons: ['knife', 'staff'], armor: ['cloth', 'leather', 'robe'] },
  },
  mystic: {
    id: 'mystic', name: 'Mystic', icon: 'job-mage',
    description: 'Debuff magick: Blind, Silence, Sleep, Poison.',
    base: { hp: 105, mp: 85, speed: 7, move: 3, jump: 2, pa: 4, ma: 12 },
    primaryAbilities: ['blind', 'silence_spell', 'sleep_spell', 'poison_spell'],
    canEquip: { weapons: ['staff', 'rod'], armor: ['robe', 'cloth', 'mage_robe'] },
  },
};

export const JOB_LIST = Object.values(JOBS);
