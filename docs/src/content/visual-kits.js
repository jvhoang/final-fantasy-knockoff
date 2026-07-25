/**
 * Job / equipment → 3D visual kit ids (data-driven for tests + renderer).
 * Original kits only — no SE assets.
 */

/** @typedef {{
 *   kitId: string,
 *   bodyStyle: 'heavy'|'medium'|'light'|'robe'|'mystic',
 *   primaryColor: number,
 *   secondaryColor: number,
 *   helmet: boolean,
 *   cape: boolean,
 *   weaponAttach: 'sword'|'axe'|'bow'|'staff'|'rod'|'knife'|'fist'|'none',
 *   silhouette: string,
 * }} VisualKit */

/** @type {Record<string, VisualKit>} */
export const JOB_KITS = {
  squireling: {
    kitId: 'squireling',
    bodyStyle: 'medium',
    primaryColor: 0x4a7c59,
    secondaryColor: 0xc4a35a,
    helmet: false,
    cape: false,
    weaponAttach: 'sword',
    silhouette: 'squire',
  },
  ironward: {
    kitId: 'ironward',
    bodyStyle: 'heavy',
    primaryColor: 0x6b7280,
    secondaryColor: 0x94a3b8,
    helmet: true,
    cape: true,
    weaponAttach: 'sword',
    silhouette: 'knight',
  },
  bowmark: {
    kitId: 'bowmark',
    bodyStyle: 'light',
    primaryColor: 0x3d5a40,
    secondaryColor: 0x8b5a2b,
    helmet: false,
    cape: false,
    weaponAttach: 'bow',
    silhouette: 'archer',
  },
  flamecaller: {
    kitId: 'flamecaller',
    bodyStyle: 'robe',
    primaryColor: 0x5b21b6,
    secondaryColor: 0xef4444,
    helmet: false,
    cape: true,
    weaponAttach: 'rod',
    silhouette: 'black_mage',
  },
  lightmender: {
    kitId: 'lightmender',
    bodyStyle: 'robe',
    primaryColor: 0xf5f5f4,
    secondaryColor: 0xfbbf24,
    helmet: false,
    cape: true,
    weaponAttach: 'staff',
    silhouette: 'white_mage',
  },
  shadowstep: {
    kitId: 'shadowstep',
    bodyStyle: 'light',
    primaryColor: 0x1e293b,
    secondaryColor: 0x64748b,
    helmet: false,
    cape: false,
    weaponAttach: 'knife',
    silhouette: 'thief',
  },
  fistway: {
    kitId: 'fistway',
    bodyStyle: 'medium',
    primaryColor: 0xb45309,
    secondaryColor: 0xfcd34d,
    helmet: false,
    cape: false,
    weaponAttach: 'fist',
    silhouette: 'monk',
  },
  clockbinder: {
    kitId: 'clockbinder',
    bodyStyle: 'mystic',
    primaryColor: 0x0e7490,
    secondaryColor: 0x67e8f9,
    helmet: false,
    cape: true,
    weaponAttach: 'staff',
    silhouette: 'time_mage',
  },
  summoner: {
    kitId: 'summoner',
    bodyStyle: 'robe',
    primaryColor: 0x7c3aed,
    secondaryColor: 0xf472b6,
    helmet: false,
    cape: true,
    weaponAttach: 'staff',
    silhouette: 'summoner',
  },
  ninja: {
    kitId: 'ninja',
    bodyStyle: 'light',
    primaryColor: 0x111827,
    secondaryColor: 0xdc2626,
    helmet: false,
    cape: false,
    weaponAttach: 'knife',
    silhouette: 'ninja',
  },
  samurai: {
    kitId: 'samurai',
    bodyStyle: 'heavy',
    primaryColor: 0x7f1d1d,
    secondaryColor: 0xfbbf24,
    helmet: true,
    cape: false,
    weaponAttach: 'sword',
    silhouette: 'samurai',
  },
  dancer: {
    kitId: 'dancer',
    bodyStyle: 'light',
    primaryColor: 0xdb2777,
    secondaryColor: 0xfce7f3,
    helmet: false,
    cape: false,
    weaponAttach: 'knife',
    silhouette: 'dancer',
  },
  calculator: {
    kitId: 'calculator',
    bodyStyle: 'robe',
    primaryColor: 0x1e3a5f,
    secondaryColor: 0x93c5fd,
    helmet: false,
    cape: false,
    weaponAttach: 'staff',
    silhouette: 'calculator',
  },
  geomancer: {
    kitId: 'geomancer',
    bodyStyle: 'medium',
    primaryColor: 0x365314,
    secondaryColor: 0xa3e635,
    helmet: false,
    cape: false,
    weaponAttach: 'sword',
    silhouette: 'geomancer',
  },
  orator: {
    kitId: 'orator',
    bodyStyle: 'medium',
    primaryColor: 0x713f12,
    secondaryColor: 0xfde68a,
    helmet: false,
    cape: false,
    weaponAttach: 'knife',
    silhouette: 'orator',
  },
  lancer: {
    kitId: 'lancer',
    bodyStyle: 'heavy',
    primaryColor: 0x334155,
    secondaryColor: 0x38bdf8,
    helmet: true,
    cape: true,
    weaponAttach: 'spear',
    silhouette: 'lancer',
  },
  chemist: {
    kitId: 'chemist',
    bodyStyle: 'medium',
    primaryColor: 0xfafafa,
    secondaryColor: 0x22c55e,
    helmet: false,
    cape: false,
    weaponAttach: 'knife',
    silhouette: 'chemist',
  },
  mystic: {
    kitId: 'mystic',
    bodyStyle: 'mystic',
    primaryColor: 0x4c1d95,
    secondaryColor: 0xc4b5fd,
    helmet: false,
    cape: true,
    weaponAttach: 'staff',
    silhouette: 'mystic',
  },
};

/** Weapon type → mesh style */
export const WEAPON_VISUAL = {
  sword: { mesh: 'blade', length: 0.55, color: 0xc0c0c0 },
  axe: { mesh: 'axe', length: 0.5, color: 0x9ca3af },
  bow: { mesh: 'bow', length: 0.45, color: 0x8b5a2b },
  staff: { mesh: 'staff', length: 0.7, color: 0x92400e },
  rod: { mesh: 'rod', length: 0.55, color: 0x7c3aed },
  knife: { mesh: 'dagger', length: 0.28, color: 0xd1d5db },
  fist: { mesh: 'knuckle', length: 0.15, color: 0x78716c },
  spear: { mesh: 'spear', length: 0.75, color: 0xa8a29e },
};

/** Armor type → body bulk / plate accents */
export const ARMOR_VISUAL = {
  cloth: { bulk: 0.9, plate: false, sheen: 0.1 },
  leather: { bulk: 1.0, plate: false, sheen: 0.15 },
  plate: { bulk: 1.15, plate: true, sheen: 0.45 },
  robe: { bulk: 1.05, plate: false, sheen: 0.2, skirt: true },
  mage_robe: { bulk: 1.05, plate: false, sheen: 0.25, skirt: true },
  chain: { bulk: 1.08, plate: true, sheen: 0.35 },
};

/**
 * Resolve visual kit from job + equipment ids.
 * @param {string} jobId
 * @param {string} [weaponId]
 * @param {string} [armorId]
 * @param {'m'|'f'} [gender='m']
 */
export function resolveUnitVisual(jobId, weaponId = 'sword', armorId = 'leather', gender = 'm') {
  const job = JOB_KITS[jobId] || JOB_KITS.squireling;
  const weaponType = weaponTypeFromId(weaponId);
  const armorType = armorTypeFromId(armorId);
  return {
    ...job,
    weaponId,
    armorId,
    gender: gender === 'f' ? 'f' : 'm',
    weaponType,
    armorType,
    weaponVisual: WEAPON_VISUAL[weaponType] || WEAPON_VISUAL.sword,
    armorVisual: ARMOR_VISUAL[armorType] || ARMOR_VISUAL.leather,
    // Prefer weapon attach from equipped weapon type
    weaponAttach:
      weaponType === 'fist'
        ? 'fist'
        : weaponType === 'katana'
          ? 'sword'
          : weaponType === 'fan'
            ? 'knife'
            : weaponType === 'book'
              ? 'staff'
              : weaponType,
  };
}

/** @param {string} weaponId */
export function weaponTypeFromId(weaponId) {
  const id = String(weaponId || '');
  if (id.includes('bow') || id === 'longbow' || id === 'crossbow' || id === 'mythril_bow') return 'bow';
  if (id.includes('axe') || id === 'battle_axe' || id === 'war_axe') return 'axe';
  if (id.includes('staff') || id === 'oak_staff' || id === 'mythril_staff' || id === 'wizard_staff') return 'staff';
  if (id.includes('rod') || id === 'flame_rod' || id === 'ice_rod' || id === 'thunder_rod') return 'rod';
  if (id.includes('knife') || id.includes('dagger') || id === 'main_gauche' || id === 'orichalcum' || id === 'ninja_blade') return 'knife';
  if (id.includes('fist') || id.includes('knuckle') || id.includes('claw')) return 'fist';
  if (id.includes('spear') || id === 'partisan' || id === 'javelin') return 'spear';
  if (id.includes('katana') || id === 'kikuichimonji' || id.includes('asura')) return 'katana';
  if (id.includes('fan')) return 'fan';
  if (id.includes('book') || id === 'spellbook') return 'book';
  return 'sword';
}

/** @param {string} armorId */
export function armorTypeFromId(armorId) {
  const id = String(armorId || '');
  if (id.includes('plate') || id === 'carapace' || id === 'diamond_armor') return 'plate';
  if (id.includes('robe') || id === 'wizard_robe' || id === 'white_robe') return 'robe';
  if (id.includes('mage')) return 'mage_robe';
  if (id.includes('chain') || id === 'ring_mail') return 'chain';
  if (id.includes('cloth') || id === 'tunic') return 'cloth';
  return 'leather';
}

/**
 * Distinct kit ids for all known jobs (for structural tests).
 */
export function allJobKitIds() {
  return Object.keys(JOB_KITS);
}
