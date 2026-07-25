/**
 * Combat presentation events emitted by match apply (floaters, walk paths, casts).
 */

/**
 * @typedef {{
 *   kind: 'hp'|'mp'|'status'|'ko'|'cast_start'|'cast_resolve'|'move'|'protect'|'text',
 *   unitId: string,
 *   amount?: number,
 *   text?: string,
 *   color?: string,
 *   abilityId?: string,
 *   path?: {x:number,y:number}[],
 *   fromCharge?: boolean,
 * }} BattleEvent
 */

/**
 * @param {import('./match.js').MatchState} state
 * @param {BattleEvent} ev
 */
export function pushEvent(state, ev) {
  if (!state.events) state.events = [];
  state.events.push({ ...ev, id: `ev-${state.events.length}-${Date.now()}` });
  // Keep last N for clients
  if (state.events.length > 80) state.events.splice(0, state.events.length - 80);
}

/**
 * Drain events since last client consume (or all recent).
 * @param {import('./match.js').MatchState} state
 * @param {number} [fromIndex=0]
 */
export function eventsSince(state, fromIndex = 0) {
  const list = state.events || [];
  return list.slice(fromIndex);
}

/**
 * FFT-like unit inspect snapshot (any ally/foe).
 * @param {import('./ct.js').Unit} unit
 * @param {import('../content/jobs.js').JobDef | null} job
 */
export function inspectUnit(unit, job = null) {
  return {
    id: unit.id,
    name: unit.name,
    team: unit.team,
    teamLabel: unit.team === 'player' ? 'Ally' : 'Foe',
    jobId: unit.jobId,
    jobName: job?.name || unit.jobId,
    hp: unit.hp,
    maxHp: unit.maxHp,
    mp: unit.mp,
    maxMp: unit.maxMp,
    speed: unit.speed,
    move: unit.move,
    jump: unit.jump,
    pa: unit.pa,
    ma: unit.ma,
    def: unit.def ?? 0,
    ct: unit.ct,
    facing: unit.facing,
    alive: unit.alive,
    charging: unit.charging
      ? {
          abilityId: unit.charging.abilityId,
          chargeLeft: unit.charging.chargeLeft,
          castTime: unit.charging.castTime,
        }
      : null,
    weaponId: unit.weaponId,
    armorId: unit.armorId,
    accessoryId: unit.accessoryId,
    abilities: [...(unit.abilities || [])],
    statuses: (unit.statuses || []).map((s) => ({ id: s.id, duration: s.duration })),
  };
}
