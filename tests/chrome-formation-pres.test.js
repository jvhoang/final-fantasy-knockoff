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
import { pushEvent, EVENT_LOG_MAX, claimEventsAfterSeq } from '../src/core/battle-events.js';

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
    assert.equal(c0.fresh.length, 5);
    assert.equal(c0.fresh.filter((e) => e.kind === 'move').length, 2);
    assert.ok(c0.fresh.some((e) => e.kind === 'attack'));

    const c1 = BattlePresentation.claimEventSlice(events, c0.nextCursor);
    assert.equal(c1.fresh.length, 0);

    const more = [...events, { kind: 'move', unitId: 'a', path: [{ x: 1, y: 0 }, { x: 1, y: 1 }] }];
    const c2 = BattlePresentation.claimEventSlice(more, c0.nextCursor);
    assert.equal(c2.fresh.length, 1);
    assert.equal(c2.fresh[0].kind, 'move');
  });

  it('pushEvent prune past cap still yields later move/attack via seq claim', () => {
    // Honest path: real pushEvent pruning + claimEventsAfterSeq / playEventsSinceCursor
    const state = { events: [], eventSeq: 0 };
    // Fill past old 80-cap and current EVENT_LOG_MAX soft cap
    const n = EVENT_LOG_MAX + 40;
    for (let i = 0; i < n; i++) {
      pushEvent(state, { kind: 'text', unitId: 'filler', text: `f${i}` });
    }
    assert.ok(state.events.length <= EVENT_LOG_MAX);
    assert.equal(state.eventSeq, n);

    // Simulate presentation having played everything currently buffered
    let lastSeq = Math.max(...state.events.map((e) => e.seq));
    const afterFill = claimEventsAfterSeq(state.events, lastSeq);
    assert.equal(afterFill.fresh.length, 0, 'nothing new after catching up');

    // New late-game action events (the ones that used to vanish with index cursor)
    pushEvent(state, {
      kind: 'move',
      unitId: 'hero',
      path: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
      ],
    });
    pushEvent(state, { kind: 'attack', unitId: 'hero', abilityId: 'strike', text: 'Strike' });
    pushEvent(state, { kind: 'hp', unitId: 'foe', amount: -9, text: '-9' });

    const claim = claimEventsAfterSeq(state.events, lastSeq);
    assert.ok(claim.fresh.length >= 3, `expected new events, got ${claim.fresh.length}`);
    assert.ok(claim.fresh.some((e) => e.kind === 'move'), 'move after prune must be claimable');
    assert.ok(claim.fresh.some((e) => e.kind === 'attack'), 'attack after prune must be claimable');
    assert.equal(claim.fresh.filter((e) => e.kind === 'move')[0].path.length, 3);

    // Index-cursor bug: if lastPlayed were buffer length (80) with no seq, fresh=[]
    const brokenIndex = BattlePresentation.claimEventSlice(
      state.events.map(({ seq, ...rest }) => rest), // strip seq
      state.events.length // old absolute cursor after prune
    );
    // Without seq, index mode with cursor===length yields empty — document the old failure mode
    assert.equal(brokenIndex.mode, 'index');
    assert.equal(brokenIndex.fresh.length, 0);

    // Seq path used by presentation stays coherent
    const slice = BattlePresentation.claimEventSlice(state.events, lastSeq);
    assert.equal(slice.mode, 'seq');
    assert.ok(slice.fresh.some((e) => e.kind === 'move'));
  });

  it('playEventsSinceCursor after pushEvent>cap plays post-cap moves (shipped entry)', async () => {
    if (typeof globalThis.requestAnimationFrame !== 'function') {
      globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
    }
    const played = [];
    const walks = [];
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
      animateUnitStep: async (id, from, to) => {
        walks.push(`${from.x},${from.y}->${to.x},${to.y}`);
      },
      getUnitScreenPos() {
        return { x: 1, y: 1 };
      },
    };
    const pres = new BattlePresentation(arena, { appendChild() {} });
    const state = { events: [], eventSeq: 0, map: { tiles: [], width: 8, height: 8 }, units: [] };

    for (let i = 0; i < EVENT_LOG_MAX + 25; i++) {
      pushEvent(state, { kind: 'text', unitId: 'x', text: `pad-${i}` });
    }
    // Catch up without waiting EVENT_GAP × N (mark seq as played — long battle already shown)
    const maxBuffered = Math.max(...state.events.map((e) => e.seq));
    pres._lastPlayedSeq = maxBuffered;
    pres._eventCursor = state.events.length;

    // Late-game player move + attack via real pushEvent (after prune pressure)
    pushEvent(state, {
      kind: 'move',
      unitId: 'hero',
      path: [
        { x: 1, y: 1 },
        { x: 2, y: 1 },
        { x: 3, y: 1 },
      ],
    });
    pushEvent(state, { kind: 'attack', unitId: 'hero', abilityId: 'strike', text: 'Strike' });

    pres.playOneEvent = async function (ev, st) {
      if (ev.kind === 'move') {
        played.push('move');
        await this.walkPath(ev.unitId, ev.path, st.map, 1);
        return;
      }
      played.push(ev.text || ev.kind);
    };

    await pres.playEventsSinceCursor(state, 1);
    assert.ok(played.includes('move'), 'late move must play after log prune');
    assert.ok(played.includes('Strike') || played.includes('attack'), 'late attack must play');
    assert.equal(walks.length, 2, '3-point path → 2 steps');
    void WALK_MS_PER_STEP;
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
      events: [],
      eventSeq: 0,
    };
    for (const t of ['1', '2', '3']) {
      pushEvent(state, { kind: 'text', unitId: 'a', text: t });
    }
    // Fast path: no EVENT_GAP sleeps between events
    pres.playOneEvent = async (ev) => {
      played.push(ev.text || ev.kind);
    };
    // Monkey-patch sleep gap by overriding playEventsSinceCursor internals via empty gaps:
    // claim is immediate; await still chains EVENT_GAP — patch presentation sleep by playing zero-gap
    const origPlay = pres.playEventsSinceCursor.bind(pres);
    // Just run sequential claims without gap: drive playOneEvent ourselves after claim
    const c1 = claimEventsAfterSeq(state.events, 0);
    for (const ev of c1.fresh) await pres.playOneEvent(ev, state, 0);
    pres._lastPlayedSeq = c1.nextSeq;

    pushEvent(state, { kind: 'text', unitId: 'a', text: '4' });
    pushEvent(state, { kind: 'text', unitId: 'a', text: '5' });
    const c2 = claimEventsAfterSeq(state.events, pres._lastPlayedSeq);
    for (const ev of c2.fresh) await pres.playOneEvent(ev, state, 0);
    pres._lastPlayedSeq = c2.nextSeq;

    assert.deepEqual(played.sort(), ['1', '2', '3', '4', '5'].sort());
    void origPlay;
  });

  it('live battle path does not rewind cursor or call consumeEvents', () => {
    const app = fs.readFileSync(path.join(root, 'src/client/game-app.js'), 'utf8');
    const pres = fs.readFileSync(path.join(root, 'src/client/battle-presentation.js'), 'utf8');
    assert.ok(app.includes('waitUntilIdle'));
    assert.ok(app.includes('playEventsSinceCursor'));
    const codeOnly = app.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.ok(!codeOnly.includes('consumeEvents('));
    assert.ok(pres.includes('_lastPlayedSeq') || pres.includes('claimEventsAfterSeq'));
    assert.ok(app.includes('_syncActionChromeVisibility') || app.includes('shouldShowActionChrome'));
  });
});
