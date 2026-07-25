/**
 * Multiplayer protocol constants and pure room state helpers.
 */

export const MSG = {
  CREATE_ROOM: 'create_room',
  JOIN_ROOM: 'join_room',
  ROOM_STATE: 'room_state',
  SET_LOADOUT: 'set_loadout',
  READY: 'ready',
  START: 'start',
  ACTION: 'action',
  MATCH_STATE: 'match_state',
  ERROR: 'error',
  CHAT: 'chat',
};

/**
 * @typedef {{
 *   code: string,
 *   hostId: string,
 *   seats: { id: string, name: string, team: 'player'|'enemy', ready: boolean, loadouts: any[] | null }[],
 *   phase: 'lobby'|'battle'|'done',
 *   match: import('../core/match.js').MatchState | null,
 * }} Room
 */

/**
 * Generate short room code.
 */
export function makeRoomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

/**
 * Create a new room with two seats (player team host, enemy team joiner).
 * @param {string} hostId
 * @param {string} [hostName]
 * @returns {Room}
 */
export function createRoom(hostId, hostName = 'Host') {
  return {
    code: makeRoomCode(),
    hostId,
    seats: [
      {
        id: hostId,
        name: hostName,
        team: 'player',
        ready: false,
        loadouts: null,
      },
      {
        id: '',
        name: 'Waiting...',
        team: 'enemy',
        ready: false,
        loadouts: null,
      },
    ],
    phase: 'lobby',
    match: null,
  };
}

/**
 * @param {Room} room
 * @param {string} clientId
 * @param {string} [name]
 */
export function joinRoom(room, clientId, name = 'Guest') {
  if (room.phase !== 'lobby') return { ok: false, error: 'Room not in lobby' };
  const seat = room.seats.find((s) => !s.id);
  if (!seat) return { ok: false, error: 'Room full' };
  if (room.seats.some((s) => s.id === clientId)) {
    return { ok: true, room };
  }
  seat.id = clientId;
  seat.name = name;
  return { ok: true, room };
}

/**
 * @param {Room} room
 * @param {string} clientId
 * @param {boolean} ready
 */
export function setReady(room, clientId, ready) {
  const seat = room.seats.find((s) => s.id === clientId);
  if (!seat) return { ok: false, error: 'Not in room' };
  seat.ready = !!ready;
  return { ok: true, room };
}

/**
 * @param {Room} room
 * @param {string} clientId
 * @param {any[]} loadouts
 */
export function setLoadouts(room, clientId, loadouts) {
  const seat = room.seats.find((s) => s.id === clientId);
  if (!seat) return { ok: false, error: 'Not in room' };
  if (!Array.isArray(loadouts) || loadouts.length !== 4) {
    return { ok: false, error: 'Need exactly 4 loadouts' };
  }
  seat.loadouts = loadouts;
  return { ok: true, room };
}

/**
 * Both seats filled + ready → can start.
 * @param {Room} room
 */
export function canStart(room) {
  return (
    room.phase === 'lobby' &&
    room.seats.every((s) => s.id && s.ready && s.loadouts && s.loadouts.length === 4)
  );
}

/**
 * Public snapshot without internal refs.
 * @param {Room} room
 */
export function publicRoom(room) {
  return {
    code: room.code,
    phase: room.phase,
    seats: room.seats.map((s) => ({
      id: s.id,
      name: s.name,
      team: s.team,
      ready: s.ready,
      hasLoadout: !!s.loadouts,
    })),
    match: room.match,
  };
}
