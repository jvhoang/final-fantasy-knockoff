/**
 * Ghibli portraits, action timeline, arena haze constants.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
import {
  recentActionStatus,
  recentLogEntries,
  buildActionTimeline,
  ticksUntilTurn,
  timelineHint,
} from '../src/core/action-timeline.js';
import {
  portraitKey,
  resolvePortraitIdentity,
  ghibliPortraitUrl,
  buildGhibliSvg,
  buildFunStats,
} from '../src/content/ghibli-portrait.js';
import {
  FOG_DENSITY,
  FOG_DENSITY_PRIOR,
  TONE_EXPOSURE,
  TONE_EXPOSURE_PRIOR,
} from '../src/client/arena.js';
import { createMatch } from '../src/core/match.js';
import { defaultPlayerLoadouts, defaultEnemyLoadouts } from '../src/core/loadout.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('arena haze is less dense / more vibrant than prior', () => {
  it('FOG_DENSITY below prior baseline; exposure higher', () => {
    assert.ok(FOG_DENSITY < FOG_DENSITY_PRIOR);
    assert.ok(FOG_DENSITY <= 0.008);
    assert.ok(TONE_EXPOSURE > TONE_EXPOSURE_PRIOR);
  });
});

describe('action status + CT timeline (shipped pure paths)', () => {
  it('recentActionStatus reads last log line', () => {
    assert.equal(recentActionStatus(null).empty, true);
    assert.equal(recentActionStatus({ log: [] }).empty, true);
    const s = recentActionStatus({ log: ['a moved', 'b cast Fire'] });
    assert.equal(s.empty, false);
    assert.equal(s.text, 'b cast Fire');
  });

  it('recentLogEntries returns tail of log', () => {
    const m = { log: ['1', '2', '3', '4', '5'] };
    assert.deepEqual(recentLogEntries(m, 3), ['3', '4', '5']);
  });

  it('ticksUntilTurn and buildActionTimeline from real match', () => {
    const match = createMatch({
      mode: 'ai',
      playerLoadouts: defaultPlayerLoadouts(),
      enemyLoadouts: defaultEnemyLoadouts(),
    });
    assert.ok(match.units.length >= 4);
    const u = match.units.find((x) => x.alive);
    assert.ok(u);
    const ticks = ticksUntilTurn(u);
    assert.ok(ticks == null || ticks >= 0);

    // Inject charge on one unit for cast ETA
    const caster = match.units.find((x) => x.alive);
    caster.charging = { abilityId: 'fire', chargeLeft: 3, castTime: 4 };

    const tl = buildActionTimeline(match);
    assert.ok(tl.upcoming.length >= 1);
    assert.ok(tl.upcoming.some((row) => row.unitId === match.activeUnitId || row.ticksUntil >= 0));
    assert.ok(tl.charges.length >= 1);
    assert.equal(tl.charges[0].abilityId, 'fire');
    assert.equal(tl.charges[0].chargeLeft, 3);
    assert.ok(String(timelineHint(tl)).includes('Cast') || String(timelineHint(tl)).includes('fire'));

    // Log path used by status bar
    match.log.push('Knight used Power Slash');
    assert.equal(recentActionStatus(match).text, 'Knight used Power Slash');
  });
});

describe('Ghibli portrait identity + art', () => {
  it('portraitKey and resolvePortraitIdentity by job+gender+team', () => {
    const a = resolvePortraitIdentity({ jobId: 'ironward', gender: 'm', team: 'player', name: 'A' });
    assert.equal(a.style, 'ghibli-soft');
    assert.equal(a.jobName, 'Knight');
    assert.equal(a.genderLabel, 'Male');
    assert.equal(a.key, portraitKey({ jobId: 'ironward', gender: 'm', team: 'player' }));
    const b = resolvePortraitIdentity({ jobId: 'lightmender', gender: 'f', team: 'enemy' });
    assert.equal(b.genderLabel, 'Female');
    assert.equal(b.jobName, 'White Mage');
    assert.notEqual(a.key, b.key);
  });

  it('ghibliPortraitUrl returns SVG data URL; face and hero differ', () => {
    const face = ghibliPortraitUrl('flamecaller', 'f', 'player', { mode: 'face', size: 128 });
    const hero = ghibliPortraitUrl('flamecaller', 'f', 'player', { mode: 'hero', size: 256 });
    assert.ok(face.startsWith('data:image/svg+xml,'));
    assert.ok(hero.startsWith('data:image/svg+xml,'));
    assert.notEqual(face, hero);
    const svg = buildGhibliSvg('bowmark', 'm', 'player', 64, 'face');
    assert.ok(svg.includes('<svg'));
    assert.ok(svg.includes('radialGradient') || svg.includes('linearGradient'));
  });

  it('buildFunStats yields bravery/faith style lines from inspect data', () => {
    const fun = buildFunStats(
      { hp: 80, maxHp: 100, mp: 40, maxMp: 80, speed: 8, pa: 10, ma: 6, def: 5, alive: true },
      { speed: 8 }
    );
    assert.ok(fun.bravery > 0 && fun.bravery <= 100);
    assert.ok(fun.faith > 0);
    assert.ok(fun.lines.length >= 4);
    assert.ok(fun.lines.every((l) => l.label && l.value != null));
  });
});

describe('game-app wires status bar, ghibli portrait, character overlay', () => {
  it('shipped sources include dock, status panel, overlay, ghibli portrait', () => {
    const app = fs.readFileSync(path.join(root, 'src/client/game-app.js'), 'utf8');
    const css = fs.readFileSync(path.join(root, 'public/styles.css'), 'utf8');
    assert.ok(app.includes('ghibliPortraitUrl'));
    assert.ok(app.includes('action-status-bar'));
    assert.ok(app.includes('_renderActionStatus'));
    assert.ok(app.includes('buildActionTimeline'));
    assert.ok(app.includes('openCharOverlay'));
    assert.ok(app.includes('char-detail-overlay'));
    assert.ok(app.includes('mode: \'hero\'') || app.includes('mode: "hero"'));
    assert.ok(css.includes('action-status-bar'));
    assert.ok(css.includes('ll-action-dock'));
    assert.ok(css.includes('char-detail-overlay'));
    assert.ok(css.includes('char-hero-portrait'));
    const arena = fs.readFileSync(path.join(root, 'src/client/arena.js'), 'utf8');
    assert.ok(arena.includes('FOG_DENSITY'));
    assert.ok(arena.includes('FOG_DENSITY_PRIOR'));
  });
});
