/**
 * Combat presentation events emitted by match apply (floaters, walk paths, casts).
 */

/**
 * Soft cap on retained event objects (memory). Playback uses monotonic `seq`,
 * not array index, so prune never desyncs the presentation cursor.
 */
export const EVENT_LOG_MAX = 200;

/**
 * @typedef {{
 *   kind: 'hp'|'mp'|'status'|'ko'|'cast_start'|'cast_resolve'|'move'|'protect'|'text'|'attack'|'act'|'cast'|'summon',
 *   unitId: string,
 *   amount?: number,
 *   text?: string,
 *   color?: string,
 *   abilityId?: string,
 *   path?: {x:number,y:number}[],
 *   fromCharge?: boolean,
 *   seq?: number,
 *   id?: string,
 * }} BattleEvent
 */

/**
 * @param {import('./match.js').MatchState} state
 * @param {BattleEvent} ev
 */
export function pushEvent(state, ev) {
  if (!state.events) state.events = [];
  if (typeof state.eventSeq !== 'number') state.eventSeq = 0;
  state.eventSeq += 1;
  const seq = state.eventSeq;
  state.events.push({
    ...ev,
    seq,
    id: `ev-${seq}`,
  });
  // Keep last N for memory — presentation tracks by seq, not index
  if (state.events.length > EVENT_LOG_MAX) {
    state.events.splice(0, state.events.length - EVENT_LOG_MAX);
  }
}

/**
 * Events with seq strictly greater than afterSeq (presentation claim helper).
 * @param {import('./match.js').MatchState|{ events?: BattleEvent[] }} state
 * @param {number} afterSeq
 * @returns {BattleEvent[]}
 */
export function eventsAfterSeq(state, afterSeq = 0) {
  const list = state.events || [];
  const min = Number(afterSeq) || 0;
  return list.filter((e) => (e.seq ?? 0) > min);
}

/**
 * Pure claim: which events to play + next lastPlayedSeq.
 * @param {BattleEvent[]} events
 * @param {number} lastPlayedSeq
 */
export function claimEventsAfterSeq(events, lastPlayedSeq = 0) {
  const list = events || [];
  const min = Number(lastPlayedSeq) || 0;
  const hasSeq = list.some((e) => e.seq != null);
  if (hasSeq) {
    const fresh = list.filter((e) => (e.seq ?? 0) > min);
    const nextSeq = fresh.length
      ? Math.max(min, ...fresh.map((e) => e.seq ?? min))
      : min;
    return { fresh, nextSeq, mode: 'seq' };
  }
  // Index fallback for synthetic tests that skip pushEvent
  const from = Math.min(Math.max(0, min), list.length);
  const fresh = list.slice(from);
  return { fresh, nextSeq: list.length, mode: 'index' };
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
