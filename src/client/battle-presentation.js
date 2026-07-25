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
    this._eventCursor = 0;
  }

  resetEvents(state) {
    this._eventCursor = state?.events?.length || 0;
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
      if (!melee && !bow) {
        this.arena.spawnCastFx(ev.unitId, summon || spectacle.arenaWide);
        this.arena.spawnMagicSpectacle(ev.unitId, abId, spectacle, state.map, ev.target);
      }
      if (bow && ev.target) {
        this.arena.spawnArrowProjectile(ev.unitId, ev.target, state.map, hold * 0.85);
      }
      // Ability name label (not MP)
      if (ev.text) this.spawnFloater(ev.unitId, ev.text, ev.color || '#ffee88');
      if (ev.target && !melee && !bow) {
        this.arena.spawnSpellBurstAtTile(ev.target.x, ev.target.y, abId, state.map, spectacle);
      }
      await sleep(hold);
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
      audio.sfx(summon ? 'summon' : 'magic', { intensity: spectacle.intensity });
      this.arena.playAnim(ev.unitId, summon ? 'summon' : 'cast', hold);
      // Show what is being cast with words
      this.spawnFloater(ev.unitId, name, summon ? '#ffaa44' : '#aaddff');
      this.arena.showCastBanner?.(name, hold);
      const impactIds = this._impactUnitIds(state, ev);
      for (const id of impactIds) {
        this.arena.spawnSpellBurst(id, abId, spectacle);
        this.arena.spawnCastFx(id, summon || spectacle.arenaWide);
      }
      if (ev.target) {
        this.arena.spawnSpellBurstAtTile(ev.target.x, ev.target.y, abId, state.map, spectacle);
        this.arena.spawnMagicSpectacle(ev.unitId, abId, spectacle, state.map, ev.target);
      }
      await sleep(hold);
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

  /**
   * Sequential playback with slow defaults.
   * @param {import('../core/match.js').MatchState} state
   * @param {number} [walkMs]
   */
  async playEventsSinceCursor(state, walkMs = WALK_MS_PER_STEP) {
    const list = state.events || [];
    const fresh = list.slice(this._eventCursor);
    this._eventCursor = list.length;
    this.busy = true;
    try {
      for (const ev of fresh) {
        await this.playOneEvent(ev, state, walkMs);
        await sleep(EVENT_GAP_MS);
      }
    } finally {
      this.busy = false;
    }
  }

  /** @deprecated skips walks — avoid in production battle path */
  consumeEvents(state) {
    const list = state.events || [];
    const fresh = list.slice(this._eventCursor);
    this._eventCursor = list.length;
    for (const ev of fresh) {
      if (ev.kind === 'move') continue;
      void this.playOneEvent(ev, state, 0);
    }
  }

  async walkPath(unitId, path, map, msPerStep = WALK_MS_PER_STEP) {
    if (!path || path.length < 2) return;
    this.busy = true;
    this.arena.playAnim(unitId, 'move', path.length * msPerStep);
    for (let i = 1; i < path.length; i++) {
      await this.arena.animateUnitStep(unitId, path[i - 1], path[i], map, msPerStep);
    }
    this.busy = false;
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
