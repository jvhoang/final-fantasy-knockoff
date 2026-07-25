/**
 * Ghibli-inspired stylized portraits (soft painted SVG) keyed by job + gender.
 * Face-close for HUD; hero mode for full-screen overlay. Not licensed Ghibli IP.
 */
import { JOBS } from './jobs.js';

/** Soft palette seeds by job archetype */
const JOB_PALETTE = {
  squireling: { cloth: '#4a7ab5', accent: '#c9a227', hairM: '#3a2a1a', hairF: '#5c3a28' },
  ironward: { cloth: '#6b7280', accent: '#d4af37', hairM: '#2a2a2a', hairF: '#4a3020' },
  bowmark: { cloth: '#5a8f4a', accent: '#8b5a2b', hairM: '#3d2817', hairF: '#c47a3a' },
  flamecaller: { cloth: '#4a2a6a', accent: '#e85d04', hairM: '#1a1020', hairF: '#6b2d8b' },
  lightmender: { cloth: '#f0ebe3', accent: '#f4d35e', hairM: '#f5e6c8', hairF: '#fff8e7' },
  shadowstep: { cloth: '#2d3436', accent: '#636e72', hairM: '#111', hairF: '#2c1810' },
  fistway: { cloth: '#d4a574', accent: '#c0392b', hairM: '#1a1a1a', hairF: '#3b2314' },
  clockbinder: { cloth: '#5b4b8a', accent: '#f0c040', hairM: '#2a2040', hairF: '#8e7cc3' },
  summoner: { cloth: '#8b3a62', accent: '#ff6b6b', hairM: '#2b1a24', hairF: '#a0527a' },
  ninja: { cloth: '#1a1a2e', accent: '#e94560', hairM: '#0d0d0d', hairF: '#1a0a0a' },
  samurai: { cloth: '#2c3e50', accent: '#c0392b', hairM: '#1c1c1c', hairF: '#3e2723' },
  dancer: { cloth: '#e8a0bf', accent: '#f7c948', hairM: '#4a2c0a', hairF: '#d4a017' },
  calculator: { cloth: '#5d6d7e', accent: '#85c1e9', hairM: '#34495e', hairF: '#7f8c8d' },
  geomancer: { cloth: '#6b8e23', accent: '#daa520', hairM: '#3e2723', hairF: '#8d6e63' },
  orator: { cloth: '#7d5a50', accent: '#f5cba7', hairM: '#4e342e', hairF: '#a1887f' },
  lancer: { cloth: '#546e7a', accent: '#90a4ae', hairM: '#263238', hairF: '#5d4037' },
  chemist: { cloth: '#80cbc4', accent: '#26a69a', hairM: '#37474f', hairF: '#bf360c' },
  mystic: { cloth: '#6c3483', accent: '#bb8fce', hairM: '#1a0a24', hairF: '#7d3c98' },
};

const DEFAULT_PAL = { cloth: '#5a7a9a', accent: '#e8c547', hairM: '#2a2a2a', hairF: '#4a3020' };

/**
 * Stable portrait identity key.
 * @param {{ jobId?: string, gender?: string, team?: string }} unit
 * @returns {string}
 */
export function portraitKey(unit) {
  const job = String(unit?.jobId || 'squireling').toLowerCase();
  const gender = unit?.gender === 'f' ? 'f' : 'm';
  const team = unit?.team === 'enemy' ? 'enemy' : 'player';
  return `${job}_${gender}_${team}`;
}

/**
 * Resolve display meta for overlay / tests.
 * @param {{ jobId?: string, gender?: string, team?: string, name?: string }} unit
 */
export function resolvePortraitIdentity(unit) {
  const jobId = unit?.jobId || 'squireling';
  const job = JOBS[jobId] || JOBS.squireling;
  const gender = unit?.gender === 'f' ? 'f' : 'm';
  const team = unit?.team === 'enemy' ? 'enemy' : 'player';
  return {
    key: portraitKey({ jobId, gender, team }),
    jobId,
    jobName: job?.name || jobId,
    gender,
    genderLabel: gender === 'f' ? 'Female' : 'Male',
    team,
    style: 'ghibli-soft',
    name: unit?.name || job?.name || 'Tactician',
  };
}

/**
 * Face-close Ghibli-style portrait data URL (soft painted SVG).
 * @param {string} jobId
 * @param {string} [gender]
 * @param {string} [team]
 * @param {{ size?: number, mode?: 'face'|'hero' }} [opts]
 * @returns {string} data:image/svg+xml URL
 */
export function ghibliPortraitUrl(jobId, gender = 'm', team = 'player', opts = {}) {
  const mode = opts.mode === 'hero' ? 'hero' : 'face';
  const size = opts.size || (mode === 'hero' ? 512 : 128);
  const svg = buildGhibliSvg(jobId, gender, team, size, mode);
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * @param {string} jobId
 * @param {string} gender
 * @param {string} team
 * @param {number} size
 * @param {'face'|'hero'} mode
 */
export function buildGhibliSvg(jobId, gender = 'm', team = 'player', size = 128, mode = 'face') {
  const g = gender === 'f' ? 'f' : 'm';
  const pal = JOB_PALETTE[jobId] || DEFAULT_PAL;
  const hair = g === 'f' ? pal.hairF : pal.hairM;
  const skin = g === 'f' ? '#f5d0b5' : '#e8c4a8';
  const skinShade = g === 'f' ? '#e8b898' : '#d4a888';
  const trim = team === 'enemy' ? '#c0392b' : '#2980b9';
  const eyeWhite = '#fffef8';
  const iris = jobId === 'shadowstep' || jobId === 'ninja' ? '#2c3e50' : jobId === 'flamecaller' ? '#8e44ad' : '#3d5a40';
  const job = JOBS[jobId] || JOBS.squireling;
  const title = (job?.name || jobId).slice(0, 14);

  // Soft painted sky / wash background
  const bg1 = team === 'enemy' ? '#f5d0c8' : '#d6eaf8';
  const bg2 = team === 'enemy' ? '#e8a090' : '#a9cce3';
  const bg3 = team === 'enemy' ? '#c0392b22' : '#5dade222';

  const w = size;
  const h = size;
  // Face-close: head fills ~70% ; hero: more upper body + dramatic crop
  const cx = w / 2;
  const faceCy = mode === 'hero' ? h * 0.38 : h * 0.42;
  const faceR = mode === 'hero' ? w * 0.22 : w * 0.32;
  const hairY = faceCy - faceR * 0.55;

  const hat = jobHat(jobId, cx, faceCy, faceR, pal, g);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${bg1}"/>
      <stop offset="70%" stop-color="${bg2}"/>
      <stop offset="100%" stop-color="${bg3}"/>
    </linearGradient>
    <radialGradient id="skinG" cx="40%" cy="35%" r="65%">
      <stop offset="0%" stop-color="${skin}"/>
      <stop offset="100%" stop-color="${skinShade}"/>
    </radialGradient>
    <radialGradient id="cheek" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#f5a9a9" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="#f5a9a9" stop-opacity="0"/>
    </radialGradient>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="${Math.max(0.4, size * 0.004)}"/>
    </filter>
    <linearGradient id="clothG" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${pal.cloth}"/>
      <stop offset="100%" stop-color="${shadeHex(pal.cloth, 0.7)}"/>
    </linearGradient>
  </defs>
  <!-- Soft painted backdrop -->
  <rect width="${w}" height="${h}" fill="url(#sky)"/>
  <ellipse cx="${cx}" cy="${h * 0.92}" rx="${w * 0.55}" ry="${h * 0.18}" fill="${pal.cloth}" opacity="0.25" filter="url(#soft)"/>
  <!-- Shoulders / cloth -->
  <ellipse cx="${cx}" cy="${faceCy + faceR * 1.55}" rx="${faceR * 1.55}" ry="${faceR * 0.85}" fill="url(#clothG)"/>
  <path d="M${cx - faceR * 1.2} ${faceCy + faceR * 1.1} Q${cx} ${faceCy + faceR * 1.85} ${cx + faceR * 1.2} ${faceCy + faceR * 1.1}" fill="${pal.accent}" opacity="0.55"/>
  <!-- Neck -->
  <rect x="${cx - faceR * 0.22}" y="${faceCy + faceR * 0.75}" width="${faceR * 0.44}" height="${faceR * 0.45}" rx="${faceR * 0.08}" fill="url(#skinG)"/>
  <!-- Hair back -->
  <ellipse cx="${cx}" cy="${hairY + faceR * 0.15}" rx="${faceR * 1.15}" ry="${faceR * 1.05}" fill="${hair}"/>
  <!-- Face -->
  <ellipse cx="${cx}" cy="${faceCy}" rx="${faceR * 0.92}" ry="${faceR * 1.02}" fill="url(#skinG)"/>
  <!-- Soft cheeks -->
  <ellipse cx="${cx - faceR * 0.42}" cy="${faceCy + faceR * 0.2}" rx="${faceR * 0.22}" ry="${faceR * 0.14}" fill="url(#cheek)"/>
  <ellipse cx="${cx + faceR * 0.42}" cy="${faceCy + faceR * 0.2}" rx="${faceR * 0.22}" ry="${faceR * 0.14}" fill="url(#cheek)"/>
  <!-- Eyes (large Ghibli-like) -->
  <ellipse cx="${cx - faceR * 0.32}" cy="${faceCy - faceR * 0.05}" rx="${faceR * 0.22}" ry="${faceR * 0.26}" fill="${eyeWhite}"/>
  <ellipse cx="${cx + faceR * 0.32}" cy="${faceCy - faceR * 0.05}" rx="${faceR * 0.22}" ry="${faceR * 0.26}" fill="${eyeWhite}"/>
  <ellipse cx="${cx - faceR * 0.28}" cy="${faceCy - faceR * 0.02}" rx="${faceR * 0.12}" ry="${faceR * 0.15}" fill="${iris}"/>
  <ellipse cx="${cx + faceR * 0.36}" cy="${faceCy - faceR * 0.02}" rx="${faceR * 0.12}" ry="${faceR * 0.15}" fill="${iris}"/>
  <circle cx="${cx - faceR * 0.24}" cy="${faceCy - faceR * 0.08}" r="${faceR * 0.045}" fill="#fff"/>
  <circle cx="${cx + faceR * 0.4}" cy="${faceCy - faceR * 0.08}" r="${faceR * 0.045}" fill="#fff"/>
  <!-- Soft brows -->
  <path d="M${cx - faceR * 0.52} ${faceCy - faceR * 0.32} Q${cx - faceR * 0.32} ${faceCy - faceR * 0.42} ${cx - faceR * 0.12} ${faceCy - faceR * 0.3}" stroke="${hair}" stroke-width="${Math.max(1.2, size * 0.012)}" fill="none" stroke-linecap="round"/>
  <path d="M${cx + faceR * 0.12} ${faceCy - faceR * 0.3} Q${cx + faceR * 0.32} ${faceCy - faceR * 0.42} ${cx + faceR * 0.52} ${faceCy - faceR * 0.32}" stroke="${hair}" stroke-width="${Math.max(1.2, size * 0.012)}" fill="none" stroke-linecap="round"/>
  <!-- Nose / mouth (subtle) -->
  <path d="M${cx} ${faceCy + faceR * 0.08} L${cx - faceR * 0.06} ${faceCy + faceR * 0.22}" stroke="${skinShade}" stroke-width="${Math.max(1, size * 0.008)}" fill="none" stroke-linecap="round"/>
  <path d="M${cx - faceR * 0.14} ${faceCy + faceR * 0.4} Q${cx} ${faceCy + faceR * 0.48} ${cx + faceR * 0.14} ${faceCy + faceR * 0.4}" stroke="#c47a6a" stroke-width="${Math.max(1.2, size * 0.01)}" fill="none" stroke-linecap="round"/>
  <!-- Hair fringe -->
  ${g === 'f'
    ? `<path d="M${cx - faceR * 0.95} ${faceCy - faceR * 0.2} Q${cx - faceR * 0.5} ${faceCy + faceR * 0.9} ${cx - faceR * 0.85} ${faceCy + faceR * 1.3}" fill="${hair}"/>
       <path d="M${cx + faceR * 0.95} ${faceCy - faceR * 0.2} Q${cx + faceR * 0.5} ${faceCy + faceR * 0.9} ${cx + faceR * 0.85} ${faceCy + faceR * 1.3}" fill="${hair}"/>
       <ellipse cx="${cx}" cy="${hairY}" rx="${faceR * 1.05}" ry="${faceR * 0.55}" fill="${hair}"/>
       <path d="M${cx - faceR * 0.7} ${faceCy - faceR * 0.35} Q${cx - faceR * 0.2} ${faceCy - faceR * 0.05} ${cx - faceR * 0.15} ${faceCy + faceR * 0.15}" fill="${hair}"/>
       <path d="M${cx + faceR * 0.7} ${faceCy - faceR * 0.35} Q${cx + faceR * 0.2} ${faceCy - faceR * 0.05} ${cx + faceR * 0.15} ${faceCy + faceR * 0.15}" fill="${hair}"/>`
    : `<ellipse cx="${cx}" cy="${hairY}" rx="${faceR * 1.02}" ry="${faceR * 0.5}" fill="${hair}"/>
       <path d="M${cx - faceR * 0.75} ${faceCy - faceR * 0.4} Q${cx - faceR * 0.25} ${faceCy - faceR * 0.1} ${cx - faceR * 0.2} ${faceCy + faceR * 0.05}" fill="${hair}"/>
       <path d="M${cx + faceR * 0.75} ${faceCy - faceR * 0.4} Q${cx + faceR * 0.25} ${faceCy - faceR * 0.1} ${cx + faceR * 0.2} ${faceCy + faceR * 0.05}" fill="${hair}"/>`}
  ${hat}
  <!-- Soft vignette frame -->
  <rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="${size * 0.08}" fill="none" stroke="${trim}" stroke-width="${Math.max(2, size * 0.02)}" opacity="0.85"/>
  ${mode === 'hero'
    ? `<text x="${cx}" y="${h * 0.94}" text-anchor="middle" fill="${trim}" font-family="Georgia, serif" font-size="${Math.max(10, size * 0.055)}" font-weight="700" letter-spacing="0.06em">${escapeXml(title)}</text>
       <text x="${cx}" y="${h * 0.985}" text-anchor="middle" fill="#445" font-family="system-ui,sans-serif" font-size="${Math.max(8, size * 0.035)}" opacity="0.75">${g === 'f' ? 'Female' : 'Male'}</text>`
    : ''}
</svg>`;
}

/**
 * Job-flavored hat / gear silhouette above the face.
 */
function jobHat(jobId, cx, faceCy, faceR, pal, gender) {
  const y = faceCy - faceR * 0.95;
  switch (jobId) {
    case 'ironward':
    case 'lancer':
      return `<path d="M${cx - faceR * 0.85} ${y + faceR * 0.15} L${cx} ${y - faceR * 0.45} L${cx + faceR * 0.85} ${y + faceR * 0.15} Z" fill="${pal.cloth}" stroke="${pal.accent}" stroke-width="1.5"/>
        <rect x="${cx - faceR * 0.12}" y="${y - faceR * 0.55}" width="${faceR * 0.24}" height="${faceR * 0.2}" fill="${pal.accent}"/>`;
    case 'flamecaller':
    case 'clockbinder':
    case 'summoner':
      return `<ellipse cx="${cx}" cy="${y}" rx="${faceR * 0.95}" ry="${faceR * 0.35}" fill="${pal.cloth}"/>
        <circle cx="${cx}" cy="${y - faceR * 0.15}" r="${faceR * 0.18}" fill="${pal.accent}" opacity="0.9"/>`;
    case 'lightmender':
      return `<ellipse cx="${cx}" cy="${y + faceR * 0.05}" rx="${faceR * 0.9}" ry="${faceR * 0.28}" fill="#f8f4e8"/>
        <circle cx="${cx}" cy="${y - faceR * 0.2}" r="${faceR * 0.12}" fill="${pal.accent}"/>`;
    case 'bowmark':
      return `<path d="M${cx - faceR * 0.7} ${y + faceR * 0.2} Q${cx} ${y - faceR * 0.35} ${cx + faceR * 0.7} ${y + faceR * 0.2}" fill="${pal.cloth}"/>`;
    case 'ninja':
    case 'shadowstep':
      return `<rect x="${cx - faceR * 0.75}" y="${faceCy - faceR * 0.15}" width="${faceR * 1.5}" height="${faceR * 0.28}" rx="2" fill="#1a1a1a" opacity="0.85"/>`;
    case 'samurai':
      return `<ellipse cx="${cx}" cy="${y + faceR * 0.1}" rx="${faceR * 0.88}" ry="${faceR * 0.22}" fill="#1a1a1a"/>
        <path d="M${cx - faceR * 0.3} ${y - faceR * 0.1} L${cx} ${y - faceR * 0.55} L${cx + faceR * 0.3} ${y - faceR * 0.1}" fill="${pal.accent}"/>`;
    case 'dancer':
      return gender === 'f'
        ? `<circle cx="${cx - faceR * 0.55}" cy="${y + faceR * 0.1}" r="${faceR * 0.12}" fill="${pal.accent}"/>
           <circle cx="${cx + faceR * 0.55}" cy="${y + faceR * 0.1}" r="${faceR * 0.12}" fill="${pal.accent}"/>`
        : `<ellipse cx="${cx}" cy="${y}" rx="${faceR * 0.7}" ry="${faceR * 0.2}" fill="${pal.cloth}"/>`;
    case 'chemist':
      return `<ellipse cx="${cx}" cy="${y}" rx="${faceR * 0.75}" ry="${faceR * 0.25}" fill="${pal.cloth}"/>
        <rect x="${cx + faceR * 0.35}" y="${y - faceR * 0.35}" width="${faceR * 0.22}" height="${faceR * 0.35}" rx="2" fill="${pal.accent}" opacity="0.8"/>`;
    default:
      return gender === 'f'
        ? `<ellipse cx="${cx}" cy="${y + faceR * 0.05}" rx="${faceR * 0.6}" ry="${faceR * 0.15}" fill="${pal.cloth}" opacity="0.5"/>`
        : '';
  }
}

/** @param {string} hex @param {number} f */
function shadeHex(hex, f) {
  const h = String(hex || '#888').replace('#', '');
  if (h.length < 6) return hex;
  const r = Math.round(parseInt(h.slice(0, 2), 16) * f);
  const g = Math.round(parseInt(h.slice(2, 4), 16) * f);
  const b = Math.round(parseInt(h.slice(4, 6), 16) * f);
  return `#${[r, g, b].map((n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0')).join('')}`;
}

/** @param {string} s */
function escapeXml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Fun / expanded stats for character overlay (pure).
 * @param {object} data unit inspect-like
 * @param {object} [unit] live unit
 */
export function buildFunStats(data, unit = null) {
  const hp = data?.hp ?? 0;
  const maxHp = data?.maxHp || 1;
  const mp = data?.mp ?? 0;
  const maxMp = data?.maxMp || 1;
  const speed = data?.speed ?? unit?.speed ?? 0;
  const pa = data?.pa ?? 0;
  const ma = data?.ma ?? 0;
  const def = data?.def ?? 0;
  const bravery = Math.min(100, Math.round(40 + pa * 4 + (data?.alive === false ? 0 : 10)));
  const faith = Math.min(100, Math.round(35 + ma * 4 + (maxMp > 50 ? 8 : 0)));
  const grit = Math.min(100, Math.round((hp / maxHp) * 50 + def * 3));
  const spark = Math.min(100, Math.round(speed * 6 + (mp / maxMp) * 20));
  return {
    bravery,
    faith,
    grit,
    spark,
    threat: Math.round(pa * 1.4 + ma * 1.1 + speed * 0.5),
    manaWell: maxMp,
    steel: def,
    lines: [
      { label: 'Bravery', value: bravery, hint: 'Physical resolve' },
      { label: 'Faith', value: faith, hint: 'Magical attunement' },
      { label: 'Grit', value: grit, hint: 'Staying power' },
      { label: 'Spark', value: spark, hint: 'Tempo & flair' },
      { label: 'Threat', value: Math.round(pa * 1.4 + ma * 1.1 + speed * 0.5), hint: 'Field pressure' },
    ],
  };
}
