/**
 * Battle polish: BGM loop contract, longer holds, Calculator CT set,
 * equip stat deltas, range/AoE preview, MP floater suppress, zoom floor.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildBgmPhraseSchedule,
  bgmArmsNeededForDuration,
  bgmLoopCoversMinutes,
  planBgmRearm,
  simulateBgmLoop,
  BGM_MELODY_HZ,
  BGM_RESCHEDULE_MS,
  BGM_PHRASE_SEC,
} from '../src/client/audio.js';
import {
  getPresentationTiming,
  ATTACK_HOLD_MS,
  CAST_RESOLVE_HOLD_MS,
  SUMMON_HOLD_MS,
  BOW_HOLD_MS,
  HIT_HOLD_MS,
  BATTLE_INTRO_MS,
  PRIOR_ATTACK_HOLD_MS,
  magicSpectacleFromMp,
} from '../src/client/presentation-timing.js';
import { shouldSuppressFloater, isBowAttack } from '../src/client/battle-presentation.js';
import {
  CALCULATOR_CT_NUMBERS,
  listCalculatorCtNumbers,
  resolveAbilityCastTime,
  isMathAbility,
} from '../src/content/calculator.js';
import { computeStatDeltas, formatStatDelta } from '../src/core/stat-delta.js';
import { previewRangeTiles, previewAoeTiles, previewRangeAndAoe } from '../src/core/range-preview.js';
import { createMatch, applyAction, getUnit } from '../src/core/match.js';
import { getAbility } from '../src/content/abilities.js';
import { previewLoadout, defaultPlayerLoadouts } from '../src/core/loadout.js';
import { resolveUnitVisual, WEAPON_ID_VISUAL } from '../src/content/visual-kits.js';
import { ZOOM_MIN } from '../src/client/arena.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('BGM loop contract (shipped pure schedule)', () => {
  it('builds multi-note melodic phrase (not empty one-shot)', () => {
    const phrase = buildBgmPhraseSchedule(0);
    assert.ok(phrase.length >= 16, `phrase notes ${phrase.length}`);
    assert.equal(phrase[0].freq, BGM_MELODY_HZ[0]);
    assert.ok(phrase.every((e) => e.freq > 0 && e.dur > 0));
  });

  it('multi-minute play requires continuous re-arms (melody never dies after intro)', () => {
    const five = bgmLoopCoversMinutes(5);
    assert.ok(five.ok, JSON.stringify(five));
    assert.ok(five.arms >= 20, `arms ${five.arms}`);
    assert.ok(BGM_RESCHEDULE_MS <= BGM_PHRASE_SEC * 1000, 'tick ≤ phrase so re-arms cannot skip');
    assert.ok(BGM_PHRASE_SEC >= 4);
    const armsFor3min = bgmArmsNeededForDuration(180);
    assert.ok(armsFor3min > 5, `3min arms ${armsFor3min}`);
  });

  it('planBgmRearm keeps ≥1 phrase ahead (fixes pad-only silence at mid-phrase ticks)', () => {
    // Skeptic case: now=14, nextPhraseAt=16.85, phrase=8.4 → old look-ahead skipped arm
    const mid = planBgmRearm(14, 16.85, 8.4);
    assert.ok(mid.starts.length >= 1, 'must arm while next is still in the future');
    assert.ok(Math.abs(mid.starts[0] - 16.85) < 1e-9, `seamless at next, got ${mid.starts[0]}`);
    assert.ok(mid.nextPhraseAt >= 14 + 8.4, 'horizon ≥ now+phrase');

    // Already fully covered: next far ahead → no extra arms
    const covered = planBgmRearm(10, 25, 8.4);
    assert.equal(covered.starts.length, 0);
    assert.equal(covered.nextPhraseAt, 25);
  });

  it('simulateBgmLoop: no multi-second melody gaps over 60s and 180s of play', () => {
    for (const dur of [60, 180]) {
      const sim = simulateBgmLoop(dur);
      assert.ok(sim.phraseCount >= Math.floor(dur / BGM_PHRASE_SEC), `phrases ${sim.phraseCount} for ${dur}s`);
      // Seamless chain: next start equals previous end (gap ≈ 0); allow tiny float noise only
      assert.ok(
        sim.maxGap <= 0.05,
        `${dur}s maxGap=${sim.maxGap} gaps=${JSON.stringify(sim.gaps.slice(0, 8))}… (must not pad-only silence)`
      );
      // Coverage reaches past duration
      const lastStart = sim.starts[sim.starts.length - 1];
      assert.ok(lastStart + sim.phraseSec >= dur, `coverage ends ${lastStart + sim.phraseSec} < ${dur}`);
      // Uses shipped tick constant path
      assert.equal(sim.tickSec, BGM_RESCHEDULE_MS / 1000);
    }
  });

  it('audio.js wires planBgmRearm into _onBgmTick + interval', () => {
    const src = fs.readFileSync(path.join(root, 'src/client/audio.js'), 'utf8');
    assert.ok(src.includes('_scheduleMelodyPhrase'));
    assert.ok(src.includes('planBgmRearm'));
    assert.ok(src.includes('_onBgmTick'));
    assert.ok(src.includes('setInterval'));
    assert.ok(src.includes('buildBgmPhraseSchedule'));
    assert.match(src, /sfx\s*\(/);
    assert.ok(src.includes("'melee'") || src.includes('melee'));
    assert.ok(src.includes("'bow'") || src.includes('bow'));
    assert.ok(src.includes("'magic'") || src.includes('magic'));
  });
});

describe('presentation timing floors (longer than prior)', () => {
  it('attack/cast/summon holds exceed prior polish floors', () => {
    const t = getPresentationTiming();
    assert.ok(t.ATTACK_HOLD_MS > PRIOR_ATTACK_HOLD_MS, `${t.ATTACK_HOLD_MS} vs ${PRIOR_ATTACK_HOLD_MS}`);
    assert.ok(ATTACK_HOLD_MS >= 1400);
    assert.ok(HIT_HOLD_MS >= 1000);
    assert.ok(BOW_HOLD_MS >= 1500);
    assert.ok(CAST_RESOLVE_HOLD_MS >= 2200);
    assert.ok(SUMMON_HOLD_MS >= 3000);
    assert.ok(BATTLE_INTRO_MS >= 3500);
  });

  it('magicSpectacleFromMp scales with cost (arena-wide for high MP)', () => {
    const low = magicSpectacleFromMp(4);
    const high = magicSpectacleFromMp(28);
    assert.ok(high.intensity > low.intensity);
    assert.equal(high.arenaWide, true);
    assert.equal(low.arenaWide, false);
    assert.ok(high.rings >= low.rings);
  });
});

describe('Calculator CT numbers (not only 3)', () => {
  it('exposes ≥3 distinct CT numbers including values other than 3', () => {
    const nums = listCalculatorCtNumbers();
    assert.ok(nums.length >= 3);
    assert.deepEqual(nums, CALCULATOR_CT_NUMBERS);
    assert.ok(nums.includes(2));
    assert.ok(nums.includes(4));
    assert.ok(nums.includes(5));
    assert.ok(new Set(nums).size >= 3);
  });

  it('resolveAbilityCastTime applies override for math abilities', () => {
    const ab = getAbility('math_fire');
    assert.equal(resolveAbilityCastTime(ab, 5), 5);
    assert.equal(resolveAbilityCastTime(ab, 2), 2);
    assert.equal(resolveAbilityCastTime(ab, 99), ab.castTime);
    assert.equal(isMathAbility('math_fire'), true);
  });

  it('match applyAction accepts ctNumber for Calculator math_fire', () => {
    const loadouts = defaultPlayerLoadouts().map((s, i) =>
      i === 0 ? { ...s, jobId: 'calculator', weaponId: 'spellbook', armorId: 'robe' } : s
    );
    const match = createMatch({
      mode: 'ai',
      playerLoadouts: loadouts,
      mapSeed: 42,
    });
    // Force player unit active with math ability
    const unit = match.units.find((u) => u.team === 'player' && u.abilities.includes('math_fire'));
    assert.ok(unit, 'calculator with math_fire');
    unit.ct = 100;
    unit.charging = null;
    match.activeUnitId = unit.id;
    match.phase = 'battle';
    match.turn = { unitId: unit.id, moved: false, acted: false };
    const ab = getAbility('math_fire');
    const tiles = previewRangeTiles(match.map, unit, ab);
    assert.ok(tiles.length > 0, 'need in-range tile');
    const target = tiles[0];
    const r = applyAction(match, {
      type: 'act',
      unitId: unit.id,
      abilityId: 'math_fire',
      target: { x: target.x, y: target.y },
      ctNumber: 5,
    });
    assert.equal(r.ok, true, r.error);
    const u = getUnit(match, unit.id);
    assert.ok(u.charging, 'should be charging');
    assert.equal(u.charging.castTime, 5);
    assert.equal(u.charging.chargeLeft, 5);
  });
});

describe('equip stat deltas (formation)', () => {
  it('computeStatDeltas returns signed PA/ATK diffs', () => {
    const a = previewLoadout({
      name: 'A',
      jobId: 'ironward',
      weaponId: 'sword',
      armorId: 'leather',
      accessoryId: 'none',
    }).stats;
    const b = previewLoadout({
      name: 'A',
      jobId: 'ironward',
      weaponId: 'blood_sword',
      armorId: 'leather',
      accessoryId: 'none',
    }).stats;
    const deltas = computeStatDeltas(a, b);
    const watk = deltas.find((d) => d.key === 'weaponAtk');
    assert.ok(watk, JSON.stringify(deltas));
    assert.ok(watk.delta !== 0);
    assert.ok(formatStatDelta(1).startsWith('+'));
    assert.ok(formatStatDelta(-2).startsWith('-'));
  });

  it('Blood Sword has distinct visual color override on mesh kit', () => {
    assert.ok(WEAPON_ID_VISUAL.blood_sword);
    const vis = resolveUnitVisual('ironward', 'blood_sword', 'plate', 'm');
    assert.equal(vis.weaponId, 'blood_sword');
    assert.equal(vis.weaponVisual.color, WEAPON_ID_VISUAL.blood_sword.color);
    assert.notEqual(vis.weaponVisual.color, 0xc0c0c0);
  });
});

describe('range + AoE preview tiles', () => {
  it('previewRangeAndAoe returns range and diamond AoE for sample ability', () => {
    const match = createMatch({ mode: 'ai', seed: 7 });
    const unit = match.units.find((u) => u.team === 'player');
    const ab = getAbility('fire');
    const range = previewRangeTiles(match.map, unit, ab);
    assert.ok(range.length > 0);
    const center = range[Math.floor(range.length / 2)] || { x: unit.x + 1, y: unit.y };
    const aoe = previewAoeTiles(match.map, unit, center, ab);
    assert.ok(aoe.length >= 1);
    const both = previewRangeAndAoe(match.map, unit, 'fire', center);
    assert.ok(both.range.length > 0);
    assert.ok(both.aoe.length >= 1);
  });
});

describe('MP cost floaters suppressed; cast name present', () => {
  it('shouldSuppressFloater hides negative MP cost events', () => {
    assert.equal(shouldSuppressFloater({ kind: 'mp', amount: -10, text: '-10 MP' }), true);
    assert.equal(shouldSuppressFloater({ kind: 'hp', amount: -12, text: '-12' }), false);
    assert.equal(shouldSuppressFloater({ kind: 'text', text: 'Firaga' }), false);
  });

  it('isBowAttack detects bow weapon / ability', () => {
    assert.equal(isBowAttack({ abilityId: 'charge_shot' }, null), true);
    assert.equal(
      isBowAttack({ abilityId: 'attack', unitId: 'u1' }, { units: [{ id: 'u1', weaponId: 'mythril_bow' }] }),
      true
    );
  });
});

describe('camera zoom + structural battle polish', () => {
  it('zoom min is below prior floor of 5', () => {
    assert.ok(ZOOM_MIN < 5, `ZOOM_MIN ${ZOOM_MIN}`);
  });

  it('shipped client sources contain highlight, intro, range, cast name, command bar', () => {
    const arena = fs.readFileSync(path.join(root, 'src/client/arena.js'), 'utf8');
    const app = fs.readFileSync(path.join(root, 'src/client/game-app.js'), 'utf8');
    const pres = fs.readFileSync(path.join(root, 'src/client/battle-presentation.js'), 'utf8');
    assert.ok(arena.includes('setActiveHighlight'));
    assert.ok(arena.includes('playBattleIntro') || arena.includes('focusOnUnit'));
    assert.ok(arena.includes('spawnArrowProjectile'));
    assert.ok(arena.includes('showRangeAndAoe'));
    assert.ok(arena.includes('ZOOM_MIN'));
    assert.ok(app.includes('Battle begins') || app.includes('_playBattleBeginsIntro'));
    assert.ok(app.includes('_renderCommandBar'));
    assert.ok(app.includes('stat-delta') || app.includes('computeStatDeltas'));
    assert.ok(app.includes('listCalculatorCtNumbers') || app.includes('CALCULATOR_CT'));
    assert.ok(pres.includes('shouldSuppressFloater') || pres.includes("kind === 'mp'"));
    assert.ok(pres.includes('cast_resolve'));
  });
});
