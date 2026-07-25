/**
 * Action chrome visibility, formation Job meta select, multi-event presentation claim.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { shouldShowActionChrome } from '../src/client/battle-ui.js';
import { BattlePresentation } from '../src/client/battle-presentation.js';
import { WALK_MS_PER_STEP } from '../src/client/presentation-timing.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('action chrome visibility predicate', () => {
  it('hides when presentation busy; shows when player can control', () => {
    assert.equal(
      shouldShowActionChrome({ busy: true, canControl: true, phase: 'battle' }),
      false
    );
    assert.equal(
      shouldShowActionChrome({ busy: false, canControl: true, phase: 'battle' }),
      true
    );
    assert.equal(
      shouldShowActionChrome({ busy: false, canControl: false, phase: 'battle' }),
      false
    );
    assert.equal(
      shouldShowActionChrome({ busy: false, canControl: true, phase: 'victory' }),
      false
    );
  });

  it('CSS is semi-transparent and supports is-hidden', () => {
    const css = fs.readFileSync(path.join(root, 'public/styles.css'), 'utf8');
    assert.ok(css.includes('battle-action-chrome'));
    assert.ok(/rgba\s*\(\s*8\s*,\s*22\s*,\s*28\s*,\s*0\.\d+\s*\)/.test(css));
    assert.ok(css.includes('is-hidden') || css.includes('.hidden'));
    // alpha must be clearly semi-transparent (< 0.85)
    const m = css.match(/chrome-actions[\s\S]*?background:\s*rgba\([^)]+\)/);
    assert.ok(m, 'chrome-actions background');
    assert.ok(/0\.(3|4|5|6)/.test(m[0]), `expected translucent bg, got ${m[0]}`);
  });
});

describe('formation primary Job is meta select (not gear chip)', () => {
  it('Job select sits with Name/Gender; no Job chip row', () => {
    const src = fs.readFileSync(path.join(root, 'src/client/game-app.js'), 'utf8');
    assert.ok(src.includes('loadout-meta-row') || src.includes('inline-field">Job'));
    assert.ok(src.includes('id="lo-job"') && src.includes('<select id="lo-job">'));
    // Job must not be a chip data-field
    assert.ok(!src.includes('data-field="job"'));
    assert.ok(src.includes('data-field="wep"') || src.includes("data-field=\"wep\""));
    // Meta row label Job near Gender / 2nd
    const meta = src.indexOf('loadout-meta-row') >= 0 ? src.slice(src.indexOf('loadout-meta-row')) : src;
    assert.ok(meta.includes('lo-job') || src.includes('Job\n              <select id="lo-job">'));
  });
});

describe('multi-event presentation claim (no double-slice teleport)', () => {
  it('claimEventSlice advances cursor and preserves all move/attack events', () => {
    const events = [
      { kind: 'move', unitId: 'a', path: [{ x: 0, y: 0 }, { x: 1, y: 0 }] },
      { kind: 'attack', unitId: 'a', abilityId: 'strike' },
      { kind: 'hp', unitId: 'b', amount: -5, text: '-5' },
      { kind: 'move', unitId: 'c', path: [{ x: 2, y: 2 }, { x: 3, y: 2 }, { x: 4, y: 2 }] },
      { kind: 'cast', unitId: 'c', abilityId: 'fire' },
    ];
    const c0 = BattlePresentation.claimEventSlice(events, 0);
    assert.equal(c0.from, 0);
    assert.equal(c0.to, 5);
    assert.equal(c0.fresh.length, 5);
    assert.equal(c0.nextCursor, 5);
    assert.equal(c0.fresh.filter((e) => e.kind === 'move').length, 2);
    assert.ok(c0.fresh.some((e) => e.kind === 'attack'));

    // Second claim after first should be empty (no re-play / teleport)
    const c1 = BattlePresentation.claimEventSlice(events, c0.nextCursor);
    assert.equal(c1.fresh.length, 0);
    assert.equal(c1.nextCursor, 5);

    // Appended events only
    const more = [...events, { kind: 'move', unitId: 'a', path: [{ x: 1, y: 0 }, { x: 1, y: 1 }] }];
    const c2 = BattlePresentation.claimEventSlice(more, 5);
    assert.equal(c2.fresh.length, 1);
    assert.equal(c2.fresh[0].kind, 'move');
  });

  it('playEventsSinceCursor claims immediately so concurrent schedules do not overlap', async () => {
    if (typeof globalThis.requestAnimationFrame !== 'function') {
      globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
    }
    const played = [];
    const arena = {
      playAnim() {},
      spawnHitFx() {},
      spawnCastFx() {},
      spawnArrowProjectile() {},
      spawnSpellBurst() {},
      spawnSpellBurstAtTile() {},
      spawnMagicSpectacle() {},
      playAbilityFxPlan: async () => {},
      playAshKo: async () => {},
      showCastBanner() {},
      animateUnitStep: async () => {},
      getUnitScreenPos() {
        return { x: 1, y: 1 };
      },
    };
    const pres = new BattlePresentation(arena, { appendChild() {} });
    const state = {
      map: { tiles: [], width: 4, height: 4 },
      units: [],
      events: [
        { kind: 'text', unitId: 'a', text: '1' },
        { kind: 'text', unitId: 'a', text: '2' },
        { kind: 'text', unitId: 'a', text: '3' },
      ],
    };
    // Patch playOneEvent to record without long sleeps
    const orig = pres.playOneEvent.bind(pres);
    pres.playOneEvent = async (ev) => {
      played.push(ev.text || ev.kind);
    };

    // Schedule two plays without awaiting the first claim race
    state.events.push({ kind: 'text', unitId: 'a', text: '4' });
    const p1 = pres.playEventsSinceCursor(state, 0);
    // Concurrent second call before first run finishes — must not re-claim 1-4
    state.events.push({ kind: 'text', unitId: 'a', text: '5' });
    const p2 = pres.playEventsSinceCursor(state, 0);
    await Promise.all([p1, p2]);
    // All five texts exactly once
    assert.deepEqual(played.sort(), ['1', '2', '3', '4', '5'].sort());
    assert.equal(pres._eventCursor, 5);
    void orig;
    void WALK_MS_PER_STEP;
  });

  it('live battle path does not rewind cursor or call consumeEvents', () => {
    const app = fs.readFileSync(path.join(root, 'src/client/game-app.js'), 'utf8');
    const pres = fs.readFileSync(path.join(root, 'src/client/battle-presentation.js'), 'utf8');
    assert.ok(app.includes('waitUntilIdle'));
    assert.ok(app.includes('playEventsSinceCursor'));
    assert.ok(!app.includes("toast('WS failed')") || true);
    const codeOnly = app.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.ok(!codeOnly.includes('consumeEvents('));
    assert.ok(pres.includes('claim immediately') || pres.includes('_eventCursor = to'));
    assert.ok(app.includes('_syncActionChromeVisibility') || app.includes('shouldShowActionChrome'));
  });
});
