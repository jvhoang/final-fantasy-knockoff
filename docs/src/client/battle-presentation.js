/**
 * Slow sequential battle presentation — one event at a time, long holds.
 */
import {
  WALK_MS_PER_STEP,
  EVENT_GAP_MS,
  ATTACK_HOLD_MS,
  BOW_HOLD_MS,
  HIT_HOLD_MS,
  CAST_START_HOLD_MS,
  CAST_RESOLVE_HOLD_MS,
  SUMMON_HOLD_MS,
  SUPPORT_HOLD_MS,
  FLOATER_MS,
  KO_ASH_MS,
  POST_WALK_GAP_MS,
  magicSpectacleFromMp,
  sleep,
} from './presentation-timing.js';
import { getAbility } from '../content/abilities.js';
import { audio } from './audio.js';
import { planAbilityFx } from './fx-plan.js';
import { aoeTiles } from '../core/grid.js';
import { claimEventsAfterSeq } from '../core/battle-events.js';

/**
 * Whether a combat floater should be suppressed (MP cost deductions).
 * @param {{ kind?: string, amount?: number, text?: string }} ev
 */
export function shouldSuppressFloater(ev) {
  if (!ev) return false;
  if (ev.kind === 'mp' && (ev.amount ?? 0) < 0) return true;
  if (ev.kind === 'mp' && /MP/i.test(String(ev.text || '')) && /^-/.test(String(ev.text || '').trim())) {
    return true;
  }
  return false;
}

/**
 * Infer bow-style attack from ability / weapon presentation.
 * @param {object} ev
 * @param {object} [state]
 */
export function isBowAttack(ev, state) {
  const ab = ev?.abilityId || '';
  if (/bow|arrow|charge_shot|snipe|aim/i.test(ab)) return true;
  const unit = state?.units?.find((u) => u.id === ev?.unitId);
  if (unit?.weaponId && /bow|crossbow/i.test(unit.weaponId)) return true;
  try {
    const a = ev?.abilityId ? getAbility(ev.abilityId) : null;
    if (a?.presentation === 'ranged' || a?.maxRange >= 3 && a?.kind === 'physical' && a?.minRange >= 2) {
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

export class BattlePresentation {
  /**
   * @param {import('./arena.js').ArenaRenderer} arena
   * @param {HTMLElement} floatLayer
   */
  constructor(arena, floatLayer) {
    this.arena = arena;
    this.floatLayer = floatLayer;
    /** @type {{ el: HTMLElement, unitId: string, until: number }[]} */
    this.floaters = [];
    this.busy = false;
    this._busyDepth = 0;
    /** @deprecated index cursor — kept in sync for diagnostics; playback uses _lastPlayedSeq */
    this._eventCursor = 0;
    /** Monotonic seq of last claimed/played event (survives event-log prune) */
    this._lastPlayedSeq = 0;
    /** Serialize concurrent playEventsSinceCursor so late-game anims never skip */
    this._playTail = Promise.resolve();
  }

  resetEvents(state) {
    const list = state?.events || [];
    this._eventCursor = list.length;
    // Highest seq already present is "played" for a fresh viewer of current buffer only;
    // full reset (new battle) should pass empty events.
    let maxSeq = 0;
    for (const e of list) {
      if (e.seq != null && e.seq > maxSeq) maxSeq = e.seq;
    }
    this._lastPlayedSeq = maxSeq;
  }

  _enterBusy() {
    this._busyDepth = (this._busyDepth || 0) + 1;
    this.busy = true;
  }

  _leaveBusy() {
    this._busyDepth = Math.max(0, (this._busyDepth || 1) - 1);
    this.busy = this._busyDepth > 0;
  }

  /**
   * @param {import('../core/battle-events.js').BattleEvent} ev
   * @param {import('../core/match.js').MatchState} state
   * @param {number} [walkMs]
   */
  async playOneEvent(ev, state, walkMs = WALK_MS_PER_STEP) {
    if (!ev) return;
    if (ev.kind === 'move' && ev.path && ev.path.length >= 2) {
      audio.sfx('move');
      await this.walkPath(ev.unitId, ev.path, state.map, walkMs);
      await sleep(POST_WALK_GAP_MS);
      return;
    }
    // Attacker swing / bow / cast / summon BEFORE damage floaters
    if (ev.kind === 'attack' || ev.kind === 'act' || ev.kind === 'cast' || ev.kind === 'summon') {
      const abId = ev.abilityId || '';
      let ability = null;
      try {
        ability = abId ? getAbility(abId) : null;
      } catch {
        ability = null;
      }
      const summon =
        ev.kind === 'summon' ||
        abId.startsWith('summon_') ||
        abId.includes('ifrit') ||
        abId.includes('shiva') ||
        abId.includes('moogle');
      const bow = isBowAttack(ev, state);
      const melee = (ev.kind === 'attack' || ev.kind === 'act') && !bow;
      const mpCost = ability?.mpCost ?? 0;
      const spectacle = magicSpectacleFromMp(summon ? Math.max(mpCost, 24) : mpCost);

      let hold = CAST_START_HOLD_MS;
      let anim = 'cast';
      if (summon) {
        hold = spectacle.holdMs;
        anim = 'summon';
        audio.sfx('summon', { intensity: spectacle.intensity });
      } else if (bow) {
        hold = BOW_HOLD_MS;
        anim = 'attack';
        audio.sfx('bow');
      } else if (melee) {
        hold = ATTACK_HOLD_MS;
        anim = 'attack';
        audio.sfx('melee');
      } else {
        hold = spectacle.holdMs > CAST_RESOLVE_HOLD_MS ? CAST_START_HOLD_MS + 200 : CAST_START_HOLD_MS;
        anim = 'cast';
        audio.sfx('magic', { intensity: spectacle.intensity });
      }

      this.arena.playAnim(ev.unitId, anim, hold);
      if (bow && ev.target) {
        this.arena.spawnArrowProjectile(ev.unitId, ev.target, state.map, hold * 0.85);
      } else if (!melee) {
        this.arena.spawnCastFx(ev.unitId, summon || spectacle.arenaWide);
        const fxPlan = planAbilityFx(abId, spectacle, ev.target || null);
        const impacts = this._impactUnitIds(state, ev);
        // Direct hits + unique summon creature; residual only if arena-wide
        await this.arena.playAbilityFxPlan(fxPlan, ev.unitId, ev.target, state.map, impacts);
      }
      // Ability name label (not MP)
      if (ev.text) this.spawnFloater(ev.unitId, ev.text, ev.color || '#ffee88');
      // Full hold for melee/bow readability; magic already spent time on FX plan
      await sleep(melee || bow ? hold : Math.max(hold * 0.55, 600));
      return;
    }
    if (ev.kind === 'hp' || ev.kind === 'mp' || ev.kind === 'status' || ev.kind === 'protect' || ev.kind === 'text') {
      if (shouldSuppressFloater(ev)) {
        await sleep(EVENT_GAP_MS * 0.35);
        return;
      }
      this.spawnFloater(ev.unitId, ev.text || '', ev.color || '#fff');
      if (ev.kind === 'hp' && ev.amount < 0) {
        audio.sfx('hit');
        this.arena.playAnim(ev.unitId, 'hit', HIT_HOLD_MS);
        this.arena.spawnHitFx(ev.unitId);
        await sleep(HIT_HOLD_MS);
      } else if (ev.kind === 'hp' && ev.amount > 0) {
        this.arena.playAnim(ev.unitId, 'cast', SUPPORT_HOLD_MS);
        await sleep(SUPPORT_HOLD_MS);
      } else if (ev.kind === 'protect' || ev.kind === 'status') {
        this.arena.playAnim(ev.unitId, 'cast', SUPPORT_HOLD_MS);
        await sleep(SUPPORT_HOLD_MS);
      } else {
        await sleep(EVENT_GAP_MS);
      }
      return;
    }
    if (ev.kind === 'ko') {
      this.spawnFloater(ev.unitId, ev.text || 'KO', ev.color || '#fff');
      this.arena.playAnim(ev.unitId, 'hit', 400);
      // Always ash dissolve — never skip to instant hide
      await this.arena.playAshKo(ev.unitId, KO_ASH_MS);
      await sleep(EVENT_GAP_MS);
      return;
    }
    if (ev.kind === 'cast_start') {
      const name = ev.text || this._abilityName(ev.abilityId) || 'Casting…';
      audio.sfx('magic', { intensity: 0.9 });
      this.arena.playAnim(ev.unitId, 'cast', CAST_START_HOLD_MS);
      this.arena.spawnCastFx(ev.unitId, false);
      this.spawnFloater(ev.unitId, name, '#66ccff');
      await sleep(CAST_START_HOLD_MS);
      return;
    }
    if (ev.kind === 'cast_resolve') {
      const abId = ev.abilityId || '';
      let ability = null;
      try {
        ability = abId ? getAbility(abId) : null;
      } catch {
        ability = null;
      }
      const summon =
        abId.startsWith('summon_') ||
        abId.includes('ifrit') ||
        abId.includes('shiva') ||
        abId.includes('moogle');
      const mpCost = ability?.mpCost ?? (summon ? 28 : 12);
      const spectacle = magicSpectacleFromMp(summon ? Math.max(mpCost, 24) : mpCost);
      const hold = summon ? SUMMON_HOLD_MS : spectacle.holdMs;
      const name = ev.text || ability?.name || this._abilityName(abId) || 'Spell';
      // Follow charged target unit if they moved (target already resolved in match)
      let target = ev.target || null;
      if (ev.targetUnitId && state?.units) {
        const tu = state.units.find((u) => u.id === ev.targetUnitId && u.alive);
        if (tu) target = { x: tu.x, y: tu.y };
      }
      audio.sfx(summon ? 'summon' : 'magic', { intensity: spectacle.intensity });
      this.arena.playAnim(ev.unitId, summon ? 'summon' : 'cast', hold);
      this.spawnFloater(ev.unitId, name, summon ? '#ffaa44' : '#aaddff');
      this.arena.showCastBanner?.(name, hold);
      const impactEv = { ...ev, target };
      const impactIds = this._aoeImpactUnitIds(state, impactEv, ability);
      const fxPlan = planAbilityFx(abId, spectacle, target || null);
      await this.arena.playAbilityFxPlan(fxPlan, ev.unitId, target, state.map, impactIds);
      await sleep(hold);
      return;
    }
    if ((ev.kind === 'status' || ev.kind === 'protect') && ev.statusId) {
      // Persistent aura already via syncStatusAuras; floater has attribute deltas
      this.spawnFloater(ev.unitId, ev.text || ev.statusId, ev.color || '#aaddff');
      this.arena.playAnim(ev.unitId, 'cast', SUPPORT_HOLD_MS);
      this.arena.syncStatusAuras?.(state.units || []);
      await sleep(SUPPORT_HOLD_MS);
      return;
    }
    if (ev.kind === 'protect') {
      this.arena.playAnim(ev.unitId, 'cast', SUPPORT_HOLD_MS);
      this.spawnFloater(ev.unitId, ev.text || 'Protect', ev.color || '#88aaff');
      await sleep(SUPPORT_HOLD_MS);
    }
  }

  _abilityName(id) {
    if (!id) return '';
    try {
      return getAbility(id).name;
    } catch {
      return String(id);
    }
  }

  _impactUnitIds(state, ev) {
    if (!ev.target || !state?.units) return [];
    return state.units
      .filter((u) => u.x === ev.target.x && u.y === ev.target.y)
      .map((u) => u.id);
  }

  /** Expand impact units by ability AoE so multi-tile hits show per-target FX */
  _aoeImpactUnitIds(state, ev, ability) {
    if (!ev.target || !state?.units) return [];
    if (!ability || !state.map) return this._impactUnitIds(state, ev);
    const caster = state.units.find((u) => u.id === ev.unitId) || ev.target;
    let tiles;
    try {
      tiles = aoeTiles(ability.aoe || 'single', ev.target, caster, ability.aoeSize || 0, state.map);
    } catch {
      tiles = [ev.target];
    }
    const set = new Set(tiles.map((t) => `${t.x},${t.y}`));
    return state.units.filter((u) => set.has(`${u.x},${u.y}`)).map((u) => u.id);
  }

  /**
   * Wait until all queued presentation finishes (busy depth 0).
   */
  waitUntilIdle() {
    if (!this.busy && this._busyDepth === 0) {
      return this._playTail.catch(() => {});
    }
    return this._playTail.catch(() => {});
  }

  /**
   * Sequential playback. Claims by monotonic event.seq (not array index) so
   * pushEvent log prune cannot leave the cursor past the end of the buffer.
   * @param {import('../core/match.js').MatchState} state
   * @param {number} [walkMs]
   */
  playEventsSinceCursor(state, walkMs = WALK_MS_PER_STEP) {
    const list = state.events || [];
    const claim = claimEventsAfterSeq(list, this._lastPlayedSeq);
    const fresh = claim.fresh;
    // Claim immediately at schedule time (before async gap)
    this._lastPlayedSeq = claim.nextSeq;
    this._eventCursor = list.length;

    const run = async () => {
      if (!fresh.length) return;
      this._enterBusy();
      this.onBusyChange?.(true);
      try {
        for (const ev of fresh) {
          await this.playOneEvent(ev, state, walkMs);
          await sleep(EVENT_GAP_MS);
        }
      } finally {
        this._leaveBusy();
        this.onBusyChange?.(this.busy);
      }
    };
    const next = this._playTail.then(run, run);
    this._playTail = next.catch((err) => {
      if (err) console.error('[presentation]', err);
    });
    return next;
  }

  /**
   * Pure helper for tests: which events a claim would play (seq-aware).
   * @param {object[]} events
   * @param {number} lastPlayedSeqOrCursor
   */
  static claimEventSlice(events, lastPlayedSeqOrCursor = 0) {
    const claim = claimEventsAfterSeq(events, lastPlayedSeqOrCursor);
    return {
      from: lastPlayedSeqOrCursor,
      to: claim.nextSeq,
      fresh: claim.fresh,
      nextCursor: claim.nextSeq,
      nextSeq: claim.nextSeq,
      mode: claim.mode,
    };
  }

  /**
   * @deprecated skips walks — MUST NOT be used on the live battle path.
   * Retained only for legacy tests; production uses playEventsSinceCursor exclusively.
   */
  consumeEvents(state) {
    // Intentionally empty of walk-skipping side effects on battle UI:
    // still advances cursor without playing (tests that assert deprecation path).
    const list = state.events || [];
    this._eventCursor = list.length;
    let maxSeq = this._lastPlayedSeq || 0;
    for (const e of list) {
      if (e.seq != null && e.seq > maxSeq) maxSeq = e.seq;
    }
    this._lastPlayedSeq = maxSeq;
  }

  async walkPath(unitId, path, map, msPerStep = WALK_MS_PER_STEP) {
    if (!path || path.length < 2) return;
    // Do not toggle busy here — parent playEventsSinceCursor owns busy depth
    this.arena.playAnim(unitId, 'move', path.length * msPerStep);
    for (let i = 1; i < path.length; i++) {
      await this.arena.animateUnitStep(unitId, path[i - 1], path[i], map, msPerStep);
    }
  }

  spawnFloater(unitId, text, color) {
    if (!text) return;
    const pos = this.arena.getUnitScreenPos(unitId);
    if (!pos) return;
    const el = document.createElement('div');
    el.className = 'combat-floater';
    el.textContent = text;
    el.style.color = color;
    el.style.left = `${pos.x}px`;
    el.style.top = `${pos.y}px`;
    this.floatLayer.appendChild(el);
    const until = performance.now() + FLOATER_MS;
    this.floaters.push({ el, unitId, until });
    requestAnimationFrame(() => el.classList.add('show'));
  }

  tick() {
    const now = performance.now();
    this.floaters = this.floaters.filter((f) => {
      if (now >= f.until) {
        f.el.remove();
        return false;
      }
      const pos = this.arena.getUnitScreenPos(f.unitId);
      if (pos) {
        const age = 1 - (f.until - now) / FLOATER_MS;
        f.el.style.left = `${pos.x}px`;
        f.el.style.top = `${pos.y - age * 48}px`;
        f.el.style.opacity = String(1 - age * 0.85);
      }
      return true;
    });
  }
}

export function presentationOrder(events) {
  return events.map((e) => e.kind);
}

export {
  WALK_MS_PER_STEP,
  EVENT_GAP_MS,
  ATTACK_HOLD_MS,
  BOW_HOLD_MS,
  CAST_START_HOLD_MS,
  CAST_RESOLVE_HOLD_MS,
  FLOATER_MS,
  KO_ASH_MS,
  magicSpectacleFromMp,
};
