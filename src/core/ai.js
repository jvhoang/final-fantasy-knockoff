/**
 * CT-aware AI: pick legal Move/Act/Wait for the active unit.
 */
import { TEAMS } from './constants.js';
import { getAbility } from '../content/abilities.js';
import {
  applyAction,
  getMoveRange,
  getUnit,
  blockedTiles,
} from './match.js';
import { abilityRangeTiles, aoeTiles, getTile } from './grid.js';
import { computeDamage } from './combat.js';
import { getWeapon } from '../content/items.js';

/**
 * Manhattan distance.
 */
function dist(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/**
 * Choose a legal action for the current active unit.
 * @param {import('./match.js').MatchState} state
 * @param {'easy'|'normal'|'hard'} [difficulty='normal']
 * @returns {import('./match.js').Action | null}
 */
export function chooseAiAction(state, difficulty = 'normal') {
  const active = getUnit(state, state.activeUnitId);
  if (!active || !active.alive) return null;

  const enemies = state.units.filter((u) => u.alive && u.team !== active.team);
  const allies = state.units.filter((u) => u.alive && u.team === active.team);
  if (!enemies.length) return { type: 'wait', unitId: active.id };

  const aggressiveness = difficulty === 'easy' ? 0.5 : difficulty === 'hard' ? 1.2 : 1.0;

  // Prefer heal if low HP ally and has heal
  if (!state.turn.acted) {
    const healId = active.abilities.find((id) => {
      const a = getAbility(id);
      return a.effect === 'heal' && a.mpCost <= active.mp;
    });
    if (healId) {
      const hurt = allies
        .filter((a) => a.hp < a.maxHp * 0.55)
        .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
      if (hurt) {
        const ab = getAbility(healId);
        const tiles = abilityRangeTiles(state.map, active, ab.minRange, ab.maxRange);
        const can =
          (ab.minRange === 0 && hurt.id === active.id) ||
          tiles.some((t) => t.x === hurt.x && t.y === hurt.y) ||
          (hurt.x === active.x && hurt.y === active.y && ab.minRange === 0);
        if (can || (hurt.x === active.x && hurt.y === active.y)) {
          return {
            type: 'act',
            unitId: active.id,
            abilityId: healId,
            target: { x: hurt.x, y: hurt.y },
          };
        }
      }
    }
  }

  // Best attack from current tile
  if (!state.turn.acted) {
    const attack = bestAttack(state, active, enemies, aggressiveness);
    if (attack) return attack;
  }

  // Move toward best attack position if not moved
  if (!state.turn.moved) {
    const moveTarget = bestMove(state, active, enemies, aggressiveness);
    if (moveTarget && (moveTarget.x !== active.x || moveTarget.y !== active.y)) {
      return { type: 'move', unitId: active.id, x: moveTarget.x, y: moveTarget.y };
    }
  }

  // After move, try attack again
  if (!state.turn.acted) {
    const attack = bestAttack(state, active, enemies, aggressiveness);
    if (attack) return attack;
  }

  // Support: haste self or slow enemy
  if (!state.turn.acted) {
    if (active.abilities.includes('haste') && getAbility('haste').mpCost <= active.mp) {
      if (!active.statuses.some((s) => s.id === 'haste')) {
        return {
          type: 'act',
          unitId: active.id,
          abilityId: 'haste',
          target: { x: active.x, y: active.y },
        };
      }
    }
    if (active.abilities.includes('slow') && getAbility('slow').mpCost <= active.mp) {
      const foe = enemies.slice().sort((a, b) => dist(active, a) - dist(active, b))[0];
      const ab = getAbility('slow');
      const tiles = abilityRangeTiles(state.map, active, ab.minRange, ab.maxRange);
      if (tiles.some((t) => t.x === foe.x && t.y === foe.y)) {
        return {
          type: 'act',
          unitId: active.id,
          abilityId: 'slow',
          target: { x: foe.x, y: foe.y },
        };
      }
    }
  }

  return { type: 'wait', unitId: active.id, facing: faceNearest(active, enemies) };
}

/**
 * @param {import('./match.js').MatchState} state
 * @param {import('./ct.js').Unit} active
 * @param {import('./ct.js').Unit[]} enemies
 * @param {number} agr
 */
function bestAttack(state, active, enemies, agr) {
  /** @type {{ score: number, action: import('./match.js').Action } | null} */
  let best = null;
  const weapon = getWeapon(active.weaponId);

  for (const abilityId of active.abilities) {
    const ab = getAbility(abilityId);
    if (ab.mpCost > active.mp) continue;
    if (ab.effect === 'heal' || ab.effect === 'haste' || ab.effect === 'protect' || ab.effect === 'shell') {
      continue;
    }
    if (!ab.effect && ab.power === 0) continue;

    const tiles =
      ab.maxRange === 0
        ? [{ x: active.x, y: active.y }]
        : abilityRangeTiles(state.map, active, ab.minRange, ab.maxRange);

    for (const foe of enemies) {
      const inRange =
        (ab.minRange === 0 && foe.x === active.x && foe.y === active.y) ||
        tiles.some((t) => t.x === foe.x && t.y === foe.y);
      // AoE: target a tile that hits foe
      let target = { x: foe.x, y: foe.y };
      if (!inRange && ab.aoe !== 'single') {
        // try foe tile still
        continue;
      }
      if (!inRange) continue;

      const aoe = aoeTiles(ab.aoe, target, active, ab.aoeSize, state.map);
      let score = 0;
      for (const t of aoe) {
        const u = enemies.find((e) => e.x === t.x && e.y === t.y);
        if (!u) continue;
        const { damage } = computeDamage(
          active,
          u,
          { power: ab.power || 1, kind: ab.kind === 'magical' ? 'magical' : 'physical' },
          weapon
        );
        score += damage * agr;
        if (damage >= u.hp) score += 50;
      }
      // Prefer instant over long cast on easy
      if (ab.castTime > 0) score -= ab.castTime * 2;

      if (!best || score > best.score) {
        best = {
          score,
          action: {
            type: 'act',
            unitId: active.id,
            abilityId,
            target,
          },
        };
      }
    }
  }
  return best && best.score > 0 ? best.action : null;
}

/**
 * @param {import('./match.js').MatchState} state
 * @param {import('./ct.js').Unit} active
 * @param {import('./ct.js').Unit[]} enemies
 * @param {number} agr
 */
function bestMove(state, active, enemies, agr) {
  const range = getMoveRange(state, active);
  let best = { x: active.x, y: active.y, score: -Infinity };

  for (const [, node] of range) {
    // Simulate position
    const ghost = { ...active, x: node.x, y: node.y };
    let score = 0;
    // Closer to weakest enemy
    const nearest = enemies.slice().sort((a, b) => dist(ghost, a) - dist(ghost, b))[0];
    score -= dist(ghost, nearest) * 3;

    // Prefer height
    const tile = getTile(state.map, node.x, node.y);
    score += (tile?.height ?? 0) * 2 * agr;

    // Can attack from here?
    for (const abilityId of active.abilities) {
      const ab = getAbility(abilityId);
      if (ab.power <= 0 || ab.mpCost > active.mp) continue;
      const tiles = abilityRangeTiles(state.map, ghost, ab.minRange, ab.maxRange);
      for (const e of enemies) {
        if (tiles.some((t) => t.x === e.x && t.y === e.y)) {
          score += 20 * agr;
        }
      }
    }

    // Avoid clustering on same tile as... already blocked
    if (score > best.score) best = { x: node.x, y: node.y, score };
  }
  return best;
}

function faceNearest(active, enemies) {
  const n = enemies.slice().sort((a, b) => dist(active, a) - dist(active, b))[0];
  if (!n) return active.facing;
  const dx = n.x - active.x;
  const dy = n.y - active.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'E' : 'W';
  return dy >= 0 ? 'S' : 'N';
}

/**
 * Play full AI vs AI or enemy turns until player turn / end.
 * @param {import('./match.js').MatchState} state
 * @param {'easy'|'normal'|'hard'} [difficulty]
 * @param {number} [maxSteps]
 */
export function playEnemyTurns(state, difficulty = 'normal', maxSteps = 100) {
  let steps = 0;
  while (state.phase === 'battle' && steps < maxSteps) {
    const active = getUnit(state, state.activeUnitId);
    if (!active) break;
    if (active.team === TEAMS.PLAYER) break;

    const uid = active.id;
    if (!state.turn.moved) {
      const action = chooseAiAction(state, difficulty);
      if (action && action.type === 'move') applyAction(state, action);
    }
    if (state.phase === 'battle' && state.activeUnitId === uid && !state.turn.acted) {
      const action = chooseAiAction(state, difficulty);
      if (action && action.type === 'act') applyAction(state, action);
    }
    if (state.phase === 'battle' && state.activeUnitId === uid) {
      applyAction(state, { type: 'wait', unitId: uid });
    }
    steps += 1;
  }
  return state;
}

/**
 * Simulate an entire AI-vs-AI match for testing win condition.
 * @param {import('./match.js').MatchState} state
 * @param {number} [maxSteps=500]
 */
export function simulateFullBattle(state, maxSteps = 500) {
  let steps = 0;
  while (state.phase === 'battle' && steps < maxSteps) {
    const active = getUnit(state, state.activeUnitId);
    if (!active) break;
    const uid = active.id;
    // Move phase
    if (!state.turn.moved) {
      const action = chooseAiAction(state, 'hard');
      if (action && action.type === 'move') {
        const r = applyAction(state, action);
        if (!r.ok) {
          /* fall through */
        }
      }
    }
    // Act phase
    if (state.phase === 'battle' && state.activeUnitId === uid && !state.turn.acted) {
      const action = chooseAiAction(state, 'hard');
      if (action && action.type === 'act') {
        applyAction(state, action);
      }
    }
    // End turn
    if (state.phase === 'battle' && state.activeUnitId === uid) {
      applyAction(state, { type: 'wait', unitId: uid });
    }
    steps += 1;
  }
  return state;
}

// silence unused import lint
void blockedTiles;
