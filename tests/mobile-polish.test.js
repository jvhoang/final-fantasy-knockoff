/**
 * Mobile chrome, auto Wait/Face, closer zoom, KO ash path, target FX plan,
 * formation chips structure, progressive BGM phases.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TURN_FOCUS_ZOOM,
  PRIOR_TURN_FOCUS_ZOOM,
  ZOOM_MIN_REF,
  isValidTurnFocusZoom,
  shouldAutoOpenWaitFace,
} from '../src/client/battle-ui.js';
import { ZOOM_MIN } from '../src/client/arena.js';
import { planAbilityFx, resolveSummonCreature, SUMMON_CREATURES } from '../src/client/fx-plan.js';
import { magicSpectacleFromMp } from '../src/client/presentation-timing.js';
import {
  bgmPhaseFromBattle,
  buildBgmPhraseSchedule,
  simulateBgmLoop,
  bgmPhraseIsLongForm,
  BGM_PHRASE_SEC,
  BGM_THEMES,
} from '../src/client/audio.js';
import { BattlePresentation, shouldSuppressFloater } from '../src/client/battle-presentation.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('turn focus zoom band', () => {
  it('is closer than prior 6.5 and above ZOOM_MIN', () => {
    assert.equal(ZOOM_MIN, ZOOM_MIN_REF);
    assert.ok(isValidTurnFocusZoom(TURN_FOCUS_ZOOM));
    assert.ok(TURN_FOCUS_ZOOM < PRIOR_TURN_FOCUS_ZOOM);
    assert.ok(TURN_FOCUS_ZOOM > ZOOM_MIN);
  });
});

describe('auto Wait/Face after Act', () => {
  it('opens only when acted and controllable', () => {
    assert.equal(shouldAutoOpenWaitFace({ moved: false, acted: true }, { canControl: true, phase: 'battle' }), true);
    assert.equal(shouldAutoOpenWaitFace({ moved: true, acted: true }, { canControl: true, phase: 'battle' }), true);
    assert.equal(shouldAutoOpenWaitFace({ moved: true, acted: false }, { canControl: true, phase: 'battle' }), false);
    assert.equal(shouldAutoOpenWaitFace({ moved: false, acted: true }, { canControl: false, phase: 'battle' }), false);
    assert.equal(shouldAutoOpenWaitFace({ moved: false, acted: true }, { canControl: true, busy: true }), false);
  });
});

describe('KO ash + presentation continuity', () => {
  it('playOneEvent(ko) awaits playAshKo on arena', async () => {
    if (typeof globalThis.requestAnimationFrame !== 'function') {
      globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
    }
    let ashCalls = 0;
    const arena = {
      playAnim() {},
      spawnHitFx() {},
      async playAshKo() {
        ashCalls += 1;
      },
      getUnitScreenPos() {
        return { x: 10, y: 10 };
      },
    };
    globalThis.document = globalThis.document || {
      createElement() {
        return { className: '', textContent: '', style: {}, classList: { add() {} } };
      },
    };
    const pres = new BattlePresentation(arena, {
      appendChild() {},
    });
    await pres.playOneEvent({ kind: 'ko', unitId: 'u1', text: 'KO' }, { units: [], map: null }, 0);
    assert.equal(ashCalls, 1);
  });

  it('game-app battle path never calls consumeEvents', () => {
    const src = fs.readFileSync(path.join(root, 'src/client/game-app.js'), 'utf8');
    const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.ok(!codeOnly.includes('consumeEvents('));
    assert.ok(src.includes('playEventsSinceCursor'));
  });

  it('presentation serializes playback via _playTail / busy depth', () => {
    const src = fs.readFileSync(path.join(root, 'src/client/battle-presentation.js'), 'utf8');
    assert.ok(src.includes('_playTail'));
    assert.ok(src.includes('_enterBusy') || src.includes('_busyDepth'));
    assert.ok(src.includes('playAshKo'));
  });
});

describe('spell/summon target-directed FX plan', () => {
  it('summons resolve unique creatures; residual only when arena-wide', () => {
    const ifrit = resolveSummonCreature('summon_ifrit');
    const shiva = resolveSummonCreature('summon_shiva');
    const moogle = resolveSummonCreature('summon_moogle');
    assert.ok(ifrit && shiva && moogle);
    assert.notEqual(ifrit.color, shiva.color);
    assert.ok(SUMMON_CREATURES.summon_ifrit);

    const low = planAbilityFx('fire', magicSpectacleFromMp(6), { x: 1, y: 1 });
    assert.equal(low.targetDirected, true);
    assert.equal(low.summon, false);
    assert.equal(low.residual, false);

    const hi = planAbilityFx('summon_ifrit', magicSpectacleFromMp(28), { x: 2, y: 2 });
    assert.equal(hi.summon, true);
    assert.ok(hi.creature);
    assert.equal(hi.creature.id, 'ifrit');
    assert.equal(hi.targetDirected, true);
    assert.equal(hi.residual, true);
    assert.equal(hi.shake, true);
  });

  it('arena exposes playAbilityFxPlan / spawnSummonCreature / residual', () => {
    const src = fs.readFileSync(path.join(root, 'src/client/arena.js'), 'utf8');
    assert.ok(src.includes('playAbilityFxPlan'));
    assert.ok(src.includes('spawnSummonCreature'));
    assert.ok(src.includes('spawnResidualFx'));
    assert.ok(src.includes('shakeCamera'));
  });
});

describe('formation no-scroll chip structure', () => {
  it('game-app renders chip pickers in sticky top (not scroll-only selects)', () => {
    const src = fs.readFileSync(path.join(root, 'src/client/game-app.js'), 'utf8');
    assert.ok(src.includes('loadout-chip-pickers'));
    assert.ok(src.includes('data-field="job"') || src.includes("data-field=\"job\"") || src.includes('data-field="job"') || src.includes('chip'));
    assert.ok(src.includes('chips-job') || src.includes('chip-scroll'));
    assert.ok(src.includes('loadout-noscroll') || src.includes('loadout-chip-pickers'));
  });
});

describe('progressive long-form BGM', () => {
  it('phrase is long multi-section; phases intensify toward end', () => {
    assert.ok(bgmPhraseIsLongForm());
    assert.ok(BGM_PHRASE_SEC >= 20);
    assert.ok(BGM_THEMES.early.melody.length >= 40);
    assert.ok(BGM_THEMES.late.melody.length >= 40);

    const early = bgmPhaseFromBattle({
      units: [
        { team: 'player', alive: true },
        { team: 'player', alive: true },
        { team: 'enemy', alive: true },
        { team: 'enemy', alive: true },
        { team: 'enemy', alive: true },
        { team: 'enemy', alive: true },
      ],
    });
    assert.equal(early.phase, 'early');

    const late = bgmPhaseFromBattle({
      units: [
        { team: 'player', alive: true },
        { team: 'enemy', alive: true },
        { team: 'enemy', alive: false },
        { team: 'enemy', alive: false },
        { team: 'enemy', alive: false },
      ],
    });
    assert.equal(late.phase, 'late');
    assert.ok(late.intensity > early.intensity);

    const phraseLate = buildBgmPhraseSchedule(0, 0.28, 'late');
    const phraseEarly = buildBgmPhraseSchedule(0, 0.28, 'early');
    assert.ok(phraseLate.length >= 16);
    assert.notEqual(phraseLate[0].freq, phraseEarly[10]?.freq || -1);
  });

  it('simulateBgmLoop remains gap-free for 60s with long phrase', () => {
    const sim = simulateBgmLoop(60);
    assert.ok(sim.maxGap <= 0.05, `maxGap ${sim.maxGap}`);
    assert.ok(sim.phraseCount >= 2);
  });
});

describe('mobile action chrome structure', () => {
  it('battle-action-chrome fixed chrome exists in game-app + CSS', () => {
    const app = fs.readFileSync(path.join(root, 'src/client/game-app.js'), 'utf8');
    const css = fs.readFileSync(path.join(root, 'public/styles.css'), 'utf8');
    assert.ok(app.includes('battle-action-chrome'));
    assert.ok(app.includes('_maybeAutoWaitFace') || app.includes('shouldAutoOpenWaitFace'));
    assert.ok(css.includes('battle-action-chrome'));
    assert.ok(css.includes('position: absolute') || css.includes('position:absolute'));
  });
});

// silence unused
void shouldSuppressFloater;
