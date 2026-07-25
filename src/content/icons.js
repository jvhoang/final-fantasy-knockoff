/**
 * Detailed procedural item/job icons — tier-distinct (blood vs diamond sword, etc.).
 */

const PAL = {
  steel: '#c5cdd6',
  silver: '#e8eef5',
  gold: '#e0b83a',
  wood: '#8b5a2b',
  cloth: '#e8e0d0',
  red: '#c0392b',
  blood: '#7a1010',
  crimson: '#ff2244',
  blue: '#2980b9',
  teal: '#1a9b8e',
  green: '#27ae60',
  purple: '#8e44ad',
  violet: '#6b3fa0',
  black: '#1a1a22',
  white: '#f0f4f8',
  leather: '#6d4c41',
  diamond: '#b8f0ff',
  mythril: '#a8c8e8',
  iron: '#8a9099',
  coral: '#ff7a9a',
  ash: '#9a9a9a',
};

function svgWrap(inner, bg = '#0d1520') {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1a3040"/><stop offset="100%" stop-color="${bg}"/>
    </linearGradient>
    <filter id="glow"><feGaussianBlur stdDeviation="1.2" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <rect width="48" height="48" rx="6" fill="url(#g)" stroke="#3d5a6a" stroke-width="1.5"/>
  ${inner}
  </svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** Distinct weapon silhouettes by id */
const WEAPON_DRAW = {
  knife: () =>
    svgWrap(
      `<rect x="22" y="10" width="4" height="22" fill="${PAL.steel}"/><rect x="18" y="30" width="12" height="3" fill="${PAL.wood}"/><polygon points="22,8 26,8 24,4" fill="${PAL.steel}"/>`
    ),
  dagger: () =>
    svgWrap(
      `<rect x="22" y="12" width="4" height="18" fill="${PAL.silver}"/><rect x="17" y="28" width="14" height="3" fill="${PAL.gold}"/><polygon points="22,10 26,10 24,5" fill="${PAL.silver}"/>`
    ),
  main_gauche: () =>
    svgWrap(
      `<rect x="22" y="12" width="4" height="18" fill="${PAL.steel}"/><path d="M16 28 Q24 22 32 28" stroke="${PAL.gold}" fill="none" stroke-width="2"/><rect x="18" y="30" width="12" height="3" fill="${PAL.wood}"/>`
    ),
  orichalcum: () =>
    svgWrap(
      `<rect x="22" y="10" width="4" height="22" fill="${PAL.gold}" filter="url(#glow)"/><rect x="18" y="30" width="12" height="3" fill="${PAL.violet}"/><circle cx="24" cy="8" r="3" fill="${PAL.crimson}"/>`
    ),
  sword: () =>
    svgWrap(
      `<rect x="21" y="6" width="6" height="26" fill="${PAL.iron}"/><rect x="14" y="30" width="20" height="4" fill="${PAL.wood}"/><rect x="22" y="34" width="4" height="8" fill="${PAL.wood}"/>`
    ),
  longsword: () =>
    svgWrap(
      `<rect x="21" y="4" width="6" height="28" fill="${PAL.steel}"/><rect x="13" y="30" width="22" height="4" fill="${PAL.gold}"/><rect x="22" y="34" width="4" height="8" fill="${PAL.wood}"/>`
    ),
  mythril_sword: () =>
    svgWrap(
      `<rect x="21" y="4" width="6" height="28" fill="${PAL.mythril}" filter="url(#glow)"/><rect x="13" y="30" width="22" height="4" fill="${PAL.teal}"/><polygon points="21,4 27,4 24,1" fill="${PAL.white}"/>`
    ),
  blood_sword: () =>
    svgWrap(
      `<rect x="21" y="4" width="6" height="28" fill="${PAL.blood}"/><rect x="13" y="30" width="22" height="4" fill="${PAL.crimson}"/><path d="M24 8 Q20 16 24 24 Q28 16 24 8" fill="${PAL.crimson}" opacity="0.7"/><rect x="22" y="34" width="4" height="8" fill="${PAL.black}"/>`,
      '#1a0508'
    ),
  coral_sword: () =>
    svgWrap(
      `<rect x="21" y="4" width="6" height="28" fill="${PAL.coral}"/><rect x="13" y="30" width="22" height="4" fill="${PAL.white}"/><circle cx="24" cy="12" r="2" fill="${PAL.white}"/>`
    ),
  diamond_sword: () =>
    svgWrap(
      `<rect x="21" y="4" width="6" height="28" fill="${PAL.diamond}" filter="url(#glow)"/><rect x="13" y="30" width="22" height="4" fill="${PAL.white}"/><polygon points="24,2 28,10 24,8 20,10" fill="${PAL.white}"/><polygon points="18,18 24,14 30,18 24,22" fill="${PAL.diamond}" opacity="0.8"/>`,
      '#0a1820'
    ),
  axe: () =>
    svgWrap(
      `<rect x="22" y="10" width="4" height="26" fill="${PAL.wood}"/><path d="M12 10 L26 8 L26 20 L12 18 Z" fill="${PAL.iron}"/>`
    ),
  war_axe: () =>
    svgWrap(
      `<rect x="22" y="8" width="4" height="28" fill="${PAL.wood}"/><path d="M8 8 L28 6 L28 22 L8 20 Z" fill="${PAL.steel}"/><path d="M28 6 L36 14 L28 22" fill="${PAL.iron}"/>`
    ),
  bow: () =>
    svgWrap(
      `<path d="M14 8 Q8 24 14 40" stroke="${PAL.wood}" fill="none" stroke-width="3"/><line x1="14" y1="8" x2="14" y2="40" stroke="${PAL.gold}" stroke-width="1.5"/>`
    ),
  crossbow: () =>
    svgWrap(
      `<rect x="10" y="20" width="28" height="4" fill="${PAL.wood}"/><rect x="22" y="12" width="4" height="20" fill="${PAL.iron}"/><path d="M10 20 Q24 12 38 20" stroke="${PAL.steel}" fill="none" stroke-width="2"/>`
    ),
  mythril_bow: () =>
    svgWrap(
      `<path d="M14 8 Q6 24 14 40" stroke="${PAL.mythril}" fill="none" stroke-width="3" filter="url(#glow)"/><line x1="14" y1="8" x2="14" y2="40" stroke="${PAL.teal}" stroke-width="1.5"/>`
    ),
  staff: () =>
    svgWrap(
      `<rect x="22" y="10" width="4" height="30" fill="${PAL.wood}"/><circle cx="24" cy="8" r="6" fill="${PAL.green}" opacity="0.9"/>`
    ),
  mythril_staff: () =>
    svgWrap(
      `<rect x="22" y="10" width="4" height="30" fill="${PAL.mythril}"/><circle cx="24" cy="8" r="7" fill="${PAL.teal}" filter="url(#glow)"/>`
    ),
  wizard_staff: () =>
    svgWrap(
      `<rect x="22" y="12" width="4" height="28" fill="${PAL.violet}"/><circle cx="24" cy="8" r="7" fill="${PAL.purple}" filter="url(#glow)"/><circle cx="24" cy="8" r="3" fill="${PAL.white}"/>`
    ),
  rod: () =>
    svgWrap(
      `<rect x="22" y="12" width="4" height="28" fill="${PAL.purple}"/><circle cx="24" cy="8" r="7" fill="${PAL.red}" filter="url(#glow)"/>`
    ),
  ice_rod: () =>
    svgWrap(
      `<rect x="22" y="12" width="4" height="28" fill="${PAL.blue}"/><polygon points="24,2 30,12 24,10 18,12" fill="${PAL.diamond}" filter="url(#glow)"/>`
    ),
  thunder_rod: () =>
    svgWrap(
      `<rect x="22" y="12" width="4" height="28" fill="${PAL.gold}"/><path d="M26 4 L20 14 L24 14 L18 26 L30 12 L24 12 Z" fill="${PAL.gold}" filter="url(#glow)"/>`
    ),
  fist: () =>
    svgWrap(`<rect x="12" y="14" width="24" height="18" rx="3" fill="${PAL.leather}"/><rect x="14" y="10" width="5" height="8" fill="${PAL.cloth}"/>`),
  mythril_claws: () =>
    svgWrap(
      `<rect x="12" y="18" width="24" height="14" rx="2" fill="${PAL.mythril}"/><path d="M16 18 L14 6 M24 18 L24 4 M32 18 L34 6" stroke="${PAL.silver}" stroke-width="2"/>`
    ),
  partisan: () =>
    svgWrap(
      `<rect x="22" y="8" width="4" height="32" fill="${PAL.wood}"/><polygon points="18,8 24,2 30,8" fill="${PAL.steel}"/>`
    ),
  javelin: () =>
    svgWrap(
      `<rect x="22" y="6" width="4" height="34" fill="${PAL.wood}"/><polygon points="18,6 24,0 30,6" fill="${PAL.silver}"/><rect x="20" y="20" width="8" height="2" fill="${PAL.gold}"/>`
    ),
  katana: () =>
    svgWrap(
      `<path d="M8 28 L36 12" stroke="${PAL.steel}" stroke-width="4"/><path d="M30 14 L38 18" stroke="${PAL.gold}" stroke-width="3"/><circle cx="34" cy="16" r="2" fill="${PAL.crimson}"/>`
    ),
  kikuichimonji: () =>
    svgWrap(
      `<path d="M6 30 L40 10" stroke="${PAL.silver}" stroke-width="4" filter="url(#glow)"/><path d="M32 12 L40 18" stroke="${PAL.gold}" stroke-width="3"/><circle cx="12" cy="28" r="3" fill="${PAL.gold}"/>`,
      '#101018'
    ),
  ninja_blade: () =>
    svgWrap(
      `<path d="M10 32 L34 10" stroke="${PAL.black}" stroke-width="3"/><path d="M10 32 L34 10" stroke="${PAL.crimson}" stroke-width="1.5"/><rect x="8" y="30" width="8" height="4" fill="${PAL.black}"/>`,
      '#0a0a12'
    ),
  spellbook: () =>
    svgWrap(
      `<rect x="10" y="8" width="28" height="32" rx="2" fill="${PAL.blue}"/><line x1="24" y1="8" x2="24" y2="40" stroke="${PAL.gold}" stroke-width="2"/><circle cx="24" cy="24" r="5" fill="${PAL.violet}" opacity="0.8"/>`
    ),
  battle_fan: () =>
    svgWrap(
      `<path d="M24 36 L8 12 Q24 18 40 12 Z" fill="${PAL.crimson}" stroke="${PAL.gold}" stroke-width="1.5"/><rect x="22" y="34" width="4" height="8" fill="${PAL.wood}"/>`
    ),
};

const ARMOR_DRAW = {
  cloth: () => svgWrap(`<path d="M14 12 L24 8 L34 12 L36 40 L12 40 Z" fill="${PAL.cloth}"/>`),
  leather: () => svgWrap(`<path d="M14 12 L24 8 L34 12 L36 40 L12 40 Z" fill="${PAL.leather}"/><rect x="18" y="20" width="12" height="8" fill="${PAL.wood}"/>`),
  hard_leather: () => svgWrap(`<path d="M14 12 L24 8 L34 12 L36 40 L12 40 Z" fill="#5a3a2a"/><path d="M16 16 L32 16 L30 36 L18 36 Z" fill="${PAL.leather}"/>`),
  chain: () => svgWrap(`<path d="M14 12 L24 8 L34 12 L36 40 L12 40 Z" fill="${PAL.iron}"/><circle cx="20" cy="22" r="3" fill="none" stroke="${PAL.steel}"/><circle cx="28" cy="22" r="3" fill="none" stroke="${PAL.steel}"/>`),
  plate: () => svgWrap(`<path d="M12 14 L24 8 L36 14 L36 36 L24 42 L12 36 Z" fill="${PAL.steel}"/><path d="M18 18 L30 18 L28 32 L20 32 Z" fill="${PAL.iron}"/>`),
  carapace: () => svgWrap(`<path d="M12 14 L24 8 L36 14 L36 36 L24 42 L12 36 Z" fill="#6a8070"/><ellipse cx="24" cy="24" rx="8" ry="10" fill="#8a9a80"/>`),
  diamond_armor: () => svgWrap(`<path d="M12 14 L24 8 L36 14 L36 36 L24 42 L12 36 Z" fill="${PAL.diamond}" filter="url(#glow)"/><polygon points="24,14 30,24 24,34 18,24" fill="${PAL.white}" opacity="0.7"/>`, '#0a1820'),
  robe: () => svgWrap(`<path d="M14 10 L24 6 L34 10 L38 42 L10 42 Z" fill="${PAL.purple}"/>`),
  silk_robe: () => svgWrap(`<path d="M14 10 L24 6 L34 10 L38 42 L10 42 Z" fill="#c8a0d8"/><path d="M18 16 Q24 20 30 16" stroke="${PAL.white}" fill="none"/>`),
  white_robe: () => svgWrap(`<path d="M14 10 L24 6 L34 10 L38 42 L10 42 Z" fill="${PAL.white}"/><circle cx="24" cy="20" r="4" fill="${PAL.gold}"/>`),
  black_robe: () => svgWrap(`<path d="M14 10 L24 6 L34 10 L38 42 L10 42 Z" fill="${PAL.black}"/><circle cx="24" cy="20" r="4" fill="${PAL.red}"/>`, '#0a0610'),
  wizard_robe: () => svgWrap(`<path d="M14 10 L24 6 L34 10 L38 42 L10 42 Z" fill="${PAL.violet}" filter="url(#glow)"/><circle cx="24" cy="18" r="5" fill="${PAL.teal}"/>`),
  ninja_gear: () => svgWrap(`<path d="M14 12 L24 8 L34 12 L36 40 L12 40 Z" fill="${PAL.black}"/><path d="M16 18 L32 18" stroke="${PAL.crimson}" stroke-width="2"/>`, '#0a0a12'),
  power_sleeve: () => svgWrap(`<rect x="12" y="14" width="24" height="26" rx="4" fill="${PAL.cloth}"/><rect x="16" y="10" width="16" height="10" fill="${PAL.leather}"/>`),
};

const ACC_DRAW = {
  none: () => svgWrap(`<text x="24" y="28" text-anchor="middle" fill="#556" font-size="10">—</text>`),
  speed_ring: () => svgWrap(`<circle cx="24" cy="24" r="12" fill="none" stroke="${PAL.gold}" stroke-width="4"/><circle cx="24" cy="24" r="5" fill="${PAL.teal}"/>`),
  power_glove: () => svgWrap(`<rect x="12" y="14" width="24" height="20" rx="3" fill="${PAL.leather}"/><rect x="14" y="10" width="6" height="8" fill="${PAL.iron}"/>`),
  mage_hat: () => svgWrap(`<ellipse cx="24" cy="28" rx="14" ry="6" fill="${PAL.blue}"/><path d="M16 28 L24 8 L32 28" fill="${PAL.violet}"/>`),
  battle_boots: () => svgWrap(`<path d="M12 18 h16 v16 h-8 l-4-6 h-4 z" fill="${PAL.leather}"/><rect x="14" y="30" width="14" height="4" fill="${PAL.iron}"/>`),
  germinas_boots: () => svgWrap(`<path d="M12 18 h16 v16 h-8 l-4-6 h-4 z" fill="#4a6741"/><circle cx="28" cy="22" r="3" fill="${PAL.green}"/>`),
  bracer: () => svgWrap(`<rect x="10" y="16" width="28" height="16" rx="3" fill="${PAL.iron}"/><rect x="14" y="20" width="20" height="8" fill="${PAL.steel}"/>`),
  wizard_ring: () => svgWrap(`<circle cx="24" cy="24" r="12" fill="none" stroke="${PAL.purple}" stroke-width="4"/><circle cx="24" cy="24" r="5" fill="${PAL.violet}" filter="url(#glow)"/>`),
  reflex: () => svgWrap(`<path d="M12 18 h16 v16 h-8 l-4-6 h-4 z" fill="${PAL.teal}"/><path d="M20 12 L28 20 L22 20 L30 32" stroke="${PAL.gold}" fill="none" stroke-width="2"/>`),
  defense_ring: () => svgWrap(`<circle cx="24" cy="24" r="12" fill="none" stroke="${PAL.steel}" stroke-width="4"/><path d="M24 16 L28 24 L24 32 L20 24 Z" fill="${PAL.iron}"/>`),
  angel_ring: () => svgWrap(`<circle cx="24" cy="24" r="12" fill="none" stroke="${PAL.white}" stroke-width="3" filter="url(#glow)"/><circle cx="24" cy="24" r="4" fill="${PAL.gold}"/>`),
  feather_boots: () => svgWrap(`<path d="M12 18 h16 v16 h-8 l-4-6 h-4 z" fill="${PAL.white}"/><path d="M28 14 Q36 20 28 28" fill="${PAL.cloth}"/>`),
  mana_band: () => svgWrap(`<rect x="10" y="18" width="28" height="12" rx="6" fill="${PAL.blue}"/><circle cx="24" cy="24" r="4" fill="${PAL.teal}" filter="url(#glow)"/>`),
};

export function iconSvg(kind, accent = PAL.gold) {
  void accent;
  if (WEAPON_DRAW[kind]) return WEAPON_DRAW[kind]();
  if (ARMOR_DRAW[kind]) return ARMOR_DRAW[kind]();
  if (ACC_DRAW[kind]) return ACC_DRAW[kind]();
  const shapes = {
    sword: WEAPON_DRAW.sword,
    fire: () => svgWrap(`<path d="M24 40 Q12 28 20 16 Q24 22 28 12 Q36 24 24 40" fill="${PAL.red}" filter="url(#glow)"/>`),
    ice: () => svgWrap(`<polygon points="24,6 30,20 24,18 18,20" fill="${PAL.diamond}"/><polygon points="24,42 18,28 24,30 30,28" fill="${PAL.blue}"/>`),
    holy: () => svgWrap(`<circle cx="24" cy="24" r="12" fill="${PAL.white}" filter="url(#glow)"/><path d="M24 12 v24 M12 24 h24" stroke="${PAL.gold}" stroke-width="3"/>`),
    knight: () => svgWrap(`<circle cx="24" cy="14" r="7" fill="${PAL.steel}"/><rect x="14" y="20" width="20" height="18" fill="${PAL.steel}"/>`),
    mage: () => svgWrap(`<path d="M14 12 L24 6 L34 12 L38 40 L10 40 Z" fill="${PAL.purple}"/>`),
    default: () => svgWrap(`<text x="24" y="28" text-anchor="middle" fill="#6a8" font-size="14">?</text>`),
  };
  return (shapes[kind] || shapes.default)();
}

/**
 * Resolve icon from item id or icon field — prefers unique per-item art.
 * @param {string} iconId
 * @param {string} [itemId]
 */
export function resolveIcon(iconId, itemId) {
  if (iconId && iconId.startsWith('data:')) return iconId;
  // Prefer drawing by concrete item id
  if (itemId && (WEAPON_DRAW[itemId] || ARMOR_DRAW[itemId] || ACC_DRAW[itemId])) {
    return iconSvg(itemId);
  }
  if (iconId && (WEAPON_DRAW[iconId] || ARMOR_DRAW[iconId] || ACC_DRAW[iconId])) {
    return iconSvg(iconId);
  }
  // Legacy category icons
  const map = {
    'wpn-sword': 'sword',
    'wpn-axe': 'axe',
    'wpn-bow': 'bow',
    'wpn-staff': 'staff',
    'wpn-rod': 'rod',
    'wpn-knife': 'knife',
    'wpn-fist': 'fist',
    'wpn-spear': 'partisan',
    'wpn-katana': 'katana',
    'wpn-fan': 'battle_fan',
    'wpn-book': 'spellbook',
    'wpn-shuriken': 'ninja_blade',
    'arm-plate': 'plate',
    'arm-leather': 'leather',
    'arm-robe': 'robe',
    'arm-cloth': 'cloth',
    'acc-ring': 'speed_ring',
    'acc-boots': 'battle_boots',
    'acc-hat': 'mage_hat',
    'fx-fire': 'fire',
    'fx-ice': 'ice',
    'fx-holy': 'holy',
    'job-knight': 'knight',
    'job-mage': 'mage',
  };
  const key = map[iconId] || iconId || 'default';
  return iconSvg(key);
}

/** Portrait placeholder by job + gender */
export function portraitIcon(jobId, gender = 'm', team = 'player') {
  const skin = gender === 'f' ? '#f0c8b0' : '#e0b898';
  const hair = gender === 'f' ? '#4a3728' : '#2a2a2a';
  const trim = team === 'player' ? '#3b82f6' : '#ef4444';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
    <rect width="64" height="64" rx="8" fill="#0d1520" stroke="${trim}" stroke-width="2"/>
    <circle cx="32" cy="26" r="12" fill="${skin}"/>
    <ellipse cx="32" cy="20" rx="13" ry="8" fill="${hair}"/>
    <path d="M18 52 Q32 40 46 52" fill="${trim}"/>
    <text x="32" y="60" text-anchor="middle" fill="#8ab" font-size="7">${(jobId || '?').slice(0, 8)}</text>
  </svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
