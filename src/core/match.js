/**
 * 4v4 CT match state machine — authoritative reduce for AI and multiplayer.
 */
import { PARTY_SIZE, TEAMS, STATUS } from './constants.js';
import {
  advanceUntilTurn,
  endTurn,
  beginCharge,
  readyUnits,
  tickCharges,
  tickCt,
} from './ct.js';
import {
  movementRange,
  abilityRangeTiles,
  aoeTiles,
  facingToward,
  getTile,
} from './grid.js';
import {
  computeDamage,
  applyDamage,
  applyHeal,
  applyStatus,
  applyHeightBonus,
  tickStatusesOnTurnEnd,
  isSilenced,
  isAsleep,
} from './combat.js';
import { getAbility } from '../content/abilities.js';
import { resolveAbilityCastTime } from '../content/calculator.js';
import { getWeapon } from '../content/items.js';
import { buildParty, defaultPlayerLoadouts, defaultEnemyLoadouts } from './loadout.js';
import { createRandomMap, createMapById } from '../content/map-castle.js';
import { pushEvent, inspectUnit } from './battle-events.js';
import { JOBS } from '../content/jobs.js';

/**
 * @typedef {{
 *   type: 'move',
 *   unitId: string,
 *   x: number,
 *   y: number,
 * } | {
 *   type: 'act',
 *   unitId: string,
 *   abilityId: string,
 *   target: { x: number, y: number },
 * } | {
 *   type: 'wait',
 *   unitId: string,
 *   facing?: import('./constants.js').Facing,
 * } | {
 *   type: 'end_turn',
 *   unitId: string,
 * }} Action
 */

/**
 * @typedef {{
 *   id: string,
 *   map: import('./grid.js').GridMap,
 *   units: import('./ct.js').Unit[],
 *   phase: 'lobby'|'battle'|'victory'|'defeat',
 *   winner: string | null,
 *   activeUnitId: string | null,
 *   turn: { moved: boolean, acted: boolean },
 *   clockTicks: number,
 *   log: string[],
 *   mode: 'ai'|'online',
 *   events: import('./battle-events.js').BattleEvent[],
 *   lastPresentation: null | object,
 * }} MatchState
 */

/**
 * @param {object} [opts]
 * @param {import('./loadout.js').LoadoutSlot[]} [opts.playerLoadouts]
 * @param {import('./loadout.js').LoadoutSlot[]} [opts.enemyLoadouts]
 * @param {'ai'|'online'} [opts.mode]
 * @param {string} [opts.id]
 * @returns {MatchState}
 */
export function createMatch(opts = {}) {
  const picked =
    opts.mapId != null
      ? createMapById(opts.mapId)
      : createRandomMap(opts.mapSeed ?? Date.now() ^ (Math.random() * 1e9));
  const map = picked.map;
  const spawns = picked.spawns;
  const playerLoadouts = opts.playerLoadouts ?? defaultPlayerLoadouts();
  const enemyLoadouts = opts.enemyLoadouts ?? defaultEnemyLoadouts();

  if (playerLoadouts.length !== PARTY_SIZE || enemyLoadouts.length !== PARTY_SIZE) {
    throw new Error('4v4 only: both sides need exactly 4 loadouts');
  }

  const players = buildParty(playerLoadouts, TEAMS.PLAYER, spawns.player);
  const enemies = buildParty(enemyLoadouts, TEAMS.ENEMY, spawns.enemy);

  /** @type {MatchState} */
  const state = {
    id: opts.id ?? `match-${Date.now()}`,
    map,
    mapId: picked.id,
    mapName: picked.name,
    mapTheme: picked.theme,
    units: [...players, ...enemies],
    phase: 'battle',
    winner: null,
    activeUnitId: null,
    turn: { moved: false, acted: false },
    clockTicks: 0,
    log: [`Battle start — ${picked.name} — Final Fantasy Knockoff`],
    mode: opts.mode ?? 'ai',
    events: [],
    lastPresentation: null,
  };

  advanceClock(state);
  return state;
}

/**
 * @param {MatchState} state
 */
export function checkWin(state) {
  const playersAlive = state.units.some((u) => u.team === TEAMS.PLAYER && u.alive);
  const enemiesAlive = state.units.some((u) => u.team === TEAMS.ENEMY && u.alive);
  if (!enemiesAlive && playersAlive) {
    state.phase = 'victory';
    state.winner = TEAMS.PLAYER;
    state.activeUnitId = null;
    state.log.push('Victory! All foes defeated.');
    return true;
  }
  if (!playersAlive && enemiesAlive) {
    state.phase = 'defeat';
    state.winner = TEAMS.ENEMY;
    state.activeUnitId = null;
    state.log.push('Defeat...');
    return true;
  }
  return false;
}

/**
 * @param {MatchState} state
 */
function resolveCharge(state, caster, charge) {
  pushEvent(state, {
    kind: 'cast_resolve',
    unitId: caster.id,
    abilityId: charge.abilityId,
    target: charge.target ? { x: charge.target.x, y: charge.target.y } : null,
    fromCharge: true,
    text: getAbility(charge.abilityId).name,
  });
  applyAbilityEffect(state, caster, charge.abilityId, charge.target, true);
}

/**
 * Advance CT until an active unit or battle ended.
 * @param {MatchState} state
 */
export function advanceClock(state) {
  if (state.phase !== 'battle') return;

  const { ticks, active } = advanceUntilTurn(state.units, (caster, charge) => {
    resolveCharge(state, caster, charge);
    checkWin(state);
  });

  state.clockTicks += ticks;
  if (state.phase !== 'battle') return;

  if (!active) {
    state.log.push('Clock stalled');
    return;
  }

  // Sleep skips turn
  if (isAsleep(active)) {
    state.log.push(`${active.name} is asleep and loses the turn.`);
    endTurn(active, { moved: false, acted: false });
    tickStatusesOnTurnEnd(active);
    state.activeUnitId = null;
    state.turn = { moved: false, acted: false };
    advanceClock(state);
    return;
  }

  state.activeUnitId = active.id;
  state.turn = { moved: false, acted: false };
  state.log.push(`${active.name}'s turn (CT ${active.ct})`);
}

/**
 * @param {MatchState} state
 * @param {string} unitId
 */
export function getUnit(state, unitId) {
  return state.units.find((u) => u.id === unitId) ?? null;
}

/**
 * Occupied tile keys excluding self.
 * @param {MatchState} state
 * @param {string} selfId
 */
export function blockedTiles(state, selfId) {
  const set = new Set();
  for (const u of state.units) {
    if (!u.alive || u.id === selfId) continue;
    set.add(`${u.x},${u.y}`);
  }
  return set;
}

/**
 * @param {MatchState} state
 * @param {import('./ct.js').Unit} unit
 */
export function getMoveRange(state, unit) {
  return movementRange(
    state.map,
    unit,
    unit.move,
    blockedTiles(state, unit.id),
    unit.jump ?? 3
  );
}

/**
 * Apply a validated player/AI action.
 * @param {MatchState} state
 * @param {Action} action
 * @returns {{ ok: boolean, error?: string, state: MatchState }}
 */
export function applyAction(state, action) {
  if (state.phase !== 'battle') {
    return { ok: false, error: 'Battle not active', state };
  }
  if (!state.activeUnitId) {
    advanceClock(state);
  }
  const unit = getUnit(state, action.unitId);
  if (!unit || !unit.alive) {
    return { ok: false, error: 'Invalid unit', state };
  }
  if (unit.id !== state.activeUnitId) {
    return { ok: false, error: 'Not this unit turn', state };
  }

  if (action.type === 'move') {
    if (state.turn.moved) return { ok: false, error: 'Already moved', state };
    const range = getMoveRange(state, unit);
    const key = `${action.x},${action.y}`;
    if (!range.has(key)) return { ok: false, error: 'Tile not in move range', state };
    const node = range.get(key);
    const path = node?.path ? node.path.map((p) => ({ x: p.x, y: p.y })) : [{ x: unit.x, y: unit.y }, { x: action.x, y: action.y }];
    unit.x = action.x;
    unit.y = action.y;
    // Face along last step if path longer than 1
    if (path.length >= 2) {
      const prev = path[path.length - 2];
      unit.facing = facingToward(prev, { x: unit.x, y: unit.y });
    }
    state.turn.moved = true;
    state.log.push(`${unit.name} moves to (${action.x},${action.y})`);
    pushEvent(state, { kind: 'move', unitId: unit.id, path });
    state.lastPresentation = { type: 'walk', unitId: unit.id, path };
    return { ok: true, state, presentation: state.lastPresentation };
  }

  if (action.type === 'act') {
    if (state.turn.acted) return { ok: false, error: 'Already acted', state };
    if (!unit.abilities.includes(action.abilityId)) {
      return { ok: false, error: 'Ability not equipped', state };
    }
    const ability = getAbility(action.abilityId);
    if (ability.mpCost > unit.mp) return { ok: false, error: 'Not enough MP', state };
    if (isSilenced(unit) && ability.kind === 'magical') {
      return { ok: false, error: 'Silenced', state };
    }

    // Self-range 0 abilities
    const origin = { x: unit.x, y: unit.y };
    const maxR = ability.maxRange;
    const minR = ability.minRange;
    const tiles = abilityRangeTiles(state.map, origin, minR, maxR);
    // allow self for range 0
    if (ability.maxRange === 0 && ability.minRange === 0) {
      if (action.target.x !== unit.x || action.target.y !== unit.y) {
        return { ok: false, error: 'Self-only ability', state };
      }
    } else {
      const okTile = tiles.some((t) => t.x === action.target.x && t.y === action.target.y);
      // also allow targeting self if in range (min 0)
      const selfOk =
        ability.minRange === 0 &&
        action.target.x === unit.x &&
        action.target.y === unit.y;
      if (!okTile && !selfOk) return { ok: false, error: 'Target out of range', state };
    }

    if (ability.mpCost > 0) {
      unit.mp -= ability.mpCost;
      pushEvent(state, {
        kind: 'mp',
        unitId: unit.id,
        amount: -ability.mpCost,
        text: `-${ability.mpCost} MP`,
        color: '#e8e8ff',
      });
    }
    unit.facing = facingToward(unit, action.target);

    // Calculator: allow CT number override (2–6) instead of only ability default 3
    const castTime = resolveAbilityCastTime(ability, action.ctNumber);
    if (castTime > 0) {
      beginCharge(unit, action.abilityId, action.target, castTime);
      state.turn.acted = true;
      state.log.push(`${unit.name} begins casting ${ability.name} (CT ${castTime})...`);
      pushEvent(state, {
        kind: 'cast_start',
        unitId: unit.id,
        abilityId: action.abilityId,
        target: { x: action.target.x, y: action.target.y },
        text: ability.name,
        color: '#66ccff',
        castTime,
      });
      state.lastPresentation = {
        type: 'cast_start',
        unitId: unit.id,
        abilityId: action.abilityId,
        presentation: ability.presentation || 'cast',
        castTime,
      };
      // Charging ends the turn immediately (FFT-like)
      return finishTurn(state, unit);
    }

    // Instant act: emit attacker action BEFORE damage so AI/online playback shows swing
    const presentation =
      ability.presentation ||
      (ability.kind === 'physical' ? 'melee' : ability.kind === 'magical' ? 'cast' : 'support');
    const actKind =
      presentation === 'melee' || presentation === 'ranged' || ability.kind === 'physical'
        ? 'attack'
        : presentation === 'summon'
          ? 'summon'
          : presentation === 'cast' || ability.kind === 'magical'
            ? 'cast'
            : 'act';
    pushEvent(state, {
      kind: actKind,
      unitId: unit.id,
      abilityId: action.abilityId,
      target: { x: action.target.x, y: action.target.y },
      text: ability.name,
      color: '#ffee88',
    });

    applyAbilityEffect(state, unit, action.abilityId, action.target, false);
    state.turn.acted = true;
    state.lastPresentation = {
      type: 'act',
      unitId: unit.id,
      abilityId: action.abilityId,
      presentation,
      target: { x: action.target.x, y: action.target.y },
    };
    if (checkWin(state)) return { ok: true, state };
    return { ok: true, state, presentation: state.lastPresentation };
  }

  if (action.type === 'wait' || action.type === 'end_turn') {
    if (action.facing) {
      unit.facing = action.facing;
    }
    pushEvent(state, {
      kind: 'text',
      unitId: unit.id,
      text: `Face ${unit.facing}`,
      color: '#cccccc',
    });
    return finishTurn(state, unit);
  }

  return { ok: false, error: 'Unknown action', state };
}

/**
 * @param {MatchState} state
 * @param {import('./ct.js').Unit} unit
 */
function finishTurn(state, unit) {
  const cost = endTurn(unit, state.turn);
  tickStatusesOnTurnEnd(unit);
  state.log.push(`${unit.name} ends turn (CT -${cost} → ${unit.ct})`);
  state.activeUnitId = null;
  state.turn = { moved: false, acted: false };
  if (checkWin(state)) return { ok: true, state };
  advanceClock(state);
  return { ok: true, state };
}

/**
 * @param {MatchState} state
 * @param {import('./ct.js').Unit} caster
 * @param {string} abilityId
 * @param {{x:number,y:number}} target
 * @param {boolean} fromCharge
 */
export function applyAbilityEffect(state, caster, abilityId, target, fromCharge) {
  const ability = getAbility(abilityId);
  const weapon = getWeapon(caster.weaponId);
  const prefix = fromCharge ? '(cast) ' : '';

  // Self-buffs (must not require the heal/AoE branch)
  if (ability.id === 'guard_stance') {
    applyStatus(caster, STATUS.PROTECT, 3);
    state.log.push(`${prefix}${caster.name} guards (Protect)`);
    pushEvent(state, {
      kind: 'protect',
      unitId: caster.id,
      text: 'Protect',
      color: '#88aaff',
    });
    return;
  }
  if (ability.id === 'focus' || ability.id === 'accumulate') {
    caster.pa += 1;
    state.log.push(`${prefix}${caster.name} focuses (+PA)`);
    pushEvent(state, {
      kind: 'text',
      unitId: caster.id,
      text: '+1 PA',
      color: '#ffcc66',
    });
    return;
  }
  if (ability.id === 'smoke_bomb' || ability.id === 'blade_grasp') {
    applyStatus(caster, STATUS.PROTECT, 3);
    pushEvent(state, {
      kind: 'protect',
      unitId: caster.id,
      text: 'Protect',
      color: '#88aaff',
    });
    state.log.push(`${prefix}${caster.name} takes a defensive stance`);
    return;
  }

  if (ability.effect === 'heal' || ability.id === 'chakra') {
    const targets = aoeTiles(ability.aoe, target, caster, ability.aoeSize, state.map);
    for (const t of targets) {
      const unitsHere = state.units.filter((x) => x.alive && x.x === t.x && x.y === t.y);
      for (const u of unitsHere) {
        if (u.team !== caster.team && ability.id !== 'chakra') continue; // heal allies
        const amount = Math.floor(caster.ma * ability.power + 10);
        const healed = applyHeal(u, amount);
        state.log.push(`${prefix}${caster.name} heals ${u.name} for ${healed}`);
        if (healed > 0) {
          pushEvent(state, {
            kind: 'hp',
            unitId: u.id,
            amount: healed,
            text: `+${healed} HP`,
            color: '#44ff88',
            abilityId,
            fromCharge,
          });
        }
      }
    }
    if (ability.id === 'chakra') {
      const amount = Math.floor(caster.pa * ability.power + 8);
      const healed = applyHeal(caster, amount);
      state.log.push(`${prefix}${caster.name} uses Chakra`);
      pushEvent(state, {
        kind: 'hp',
        unitId: caster.id,
        amount: healed,
        text: `+${healed} HP`,
        color: '#44ff88',
      });
    }
    return;
  }

  if (ability.effect === 'haste') {
    const u = state.units.find((x) => x.alive && x.x === target.x && x.y === target.y);
    if (u) {
      applyStatus(u, STATUS.HASTE, 4);
      state.log.push(`${prefix}${caster.name} casts Haste on ${u.name}`);
      pushEvent(state, { kind: 'status', unitId: u.id, text: 'Haste', color: '#ffee88' });
    }
    return;
  }
  if (ability.effect === 'slow') {
    const u = state.units.find((x) => x.alive && x.x === target.x && x.y === target.y);
    if (u) {
      applyStatus(u, STATUS.SLOW, 4);
      state.log.push(`${prefix}${caster.name} casts Slow on ${u.name}`);
      pushEvent(state, { kind: 'status', unitId: u.id, text: 'Slow', color: '#aaaaff' });
    }
    return;
  }
  if (ability.effect === 'protect') {
    const u = state.units.find((x) => x.alive && x.x === target.x && x.y === target.y);
    if (u) {
      applyStatus(u, STATUS.PROTECT, 4);
      state.log.push(`${prefix}${caster.name} casts Protect on ${u.name}`);
      pushEvent(state, {
        kind: 'protect',
        unitId: u.id,
        text: 'Protect',
        color: '#88aaff',
      });
    }
    return;
  }
  if (ability.effect === 'shell') {
    const u = state.units.find((x) => x.alive && x.x === target.x && x.y === target.y);
    if (u) {
      applyStatus(u, STATUS.SHELL, 4);
      state.log.push(`${prefix}${caster.name} casts Shell on ${u.name}`);
      pushEvent(state, { kind: 'status', unitId: u.id, text: 'Shell', color: '#cc88ff' });
    }
    return;
  }

  // damage — all living foes on each AoE tile (not find-first which can hit an ally sharing the cell)
  const tiles = aoeTiles(ability.aoe, target, caster, ability.aoeSize, state.map);
  const at = getTile(state.map, caster.x, caster.y);
  for (const t of tiles) {
    const unitsHere = state.units.filter((x) => x.alive && x.x === t.x && x.y === t.y);
    for (const u of unitsHere) {
      if (u.team === caster.team) continue;
      const { damage, aspect } = computeDamage(
        caster,
        u,
        {
          power: ability.power,
          kind: ability.kind === 'support' ? 'physical' : ability.kind,
        },
        weapon
      );
      const dt = getTile(state.map, u.x, u.y);
      const finalDmg = applyHeightBonus(
        at?.height ?? 0,
        dt?.height ?? 0,
        damage - (u.def ?? 0) * 0.5,
        ability.kind === 'magical' ? 'magical' : 'physical'
      );
      const dealt = applyDamage(u, Math.max(1, Math.floor(finalDmg)));
      state.log.push(
        `${prefix}${caster.name} hits ${u.name} for ${dealt} (${aspect}) with ${ability.name}`
      );
      pushEvent(state, {
        kind: 'hp',
        unitId: u.id,
        amount: -dealt,
        text: `-${dealt} HP`,
        color: '#ff4444',
        abilityId,
        fromCharge,
      });
      if (!u.alive) {
        pushEvent(state, {
          kind: 'ko',
          unitId: u.id,
          text: 'KO',
          color: '#ffffff',
        });
      }
    }
  }
}

/**
 * @param {MatchState} state
 * @param {string} unitId
 */
export function getUnitInspect(state, unitId) {
  const u = getUnit(state, unitId);
  if (!u) return null;
  return inspectUnit(u, JOBS[u.jobId] || null);
}

/**
 * Serializable snapshot for network.
 * @param {MatchState} state
 */
export function serializeMatch(state) {
  return JSON.parse(JSON.stringify(state));
}

/**
 * Deep clone for AI simulation.
 * @param {MatchState} state
 */
export function cloneMatch(state) {
  return serializeMatch(state);
}

/**
 * Run many AI actions until player turn or end (for auto-battle).
 * @param {MatchState} state
 * @param {(s: MatchState) => Action | null} aiFn
 * @param {number} [maxSteps=200]
 */
export function runUntilPlayerTurn(state, aiFn, maxSteps = 200) {
  let steps = 0;
  while (state.phase === 'battle' && steps < maxSteps) {
    if (!state.activeUnitId) advanceClock(state);
    const active = getUnit(state, state.activeUnitId);
    if (!active) break;
    if (active.team === TEAMS.PLAYER) break;
    const action = aiFn(state);
    if (!action) {
      applyAction(state, { type: 'wait', unitId: active.id });
    } else {
      const r = applyAction(state, action);
      if (!r.ok) {
        applyAction(state, { type: 'wait', unitId: active.id });
      }
    }
    steps += 1;
  }
  return state;
}

export { PARTY_SIZE, TEAMS, readyUnits, tickCt, tickCharges };
