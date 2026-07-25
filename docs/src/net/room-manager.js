/**
 * In-memory room manager + match reduce (shared by server and tests).
 */
import {
  createRoom,
  joinRoom,
  setReady,
  setLoadouts,
  canStart,
  publicRoom,
  MSG,
} from './protocol.js';
import { createMatch, applyAction, getUnit } from '../core/match.js';
import { defaultPlayerLoadouts, defaultEnemyLoadouts } from '../core/loadout.js';

export class RoomManager {
  constructor() {
    /** @type {Map<string, import('./protocol.js').Room>} */
    this.rooms = new Map();
    /** @type {Map<string, string>} clientId -> room code */
    this.clientRoom = new Map();
  }

  /**
   * @param {string} clientId
   * @param {string} [name]
   */
  create(clientId, name) {
    const room = createRoom(clientId, name);
    // ensure unique code
    while (this.rooms.has(room.code)) {
      room.code = createRoom(clientId, name).code;
    }
    this.rooms.set(room.code, room);
    this.clientRoom.set(clientId, room.code);
    return { ok: true, room: publicRoom(room) };
  }

  /**
   * @param {string} clientId
   * @param {string} code
   * @param {string} [name]
   */
  join(clientId, code, name) {
    const room = this.rooms.get(String(code).toUpperCase());
    if (!room) return { ok: false, error: 'Room not found' };
    const r = joinRoom(room, clientId, name);
    if (!r.ok) return r;
    this.clientRoom.set(clientId, room.code);
    return { ok: true, room: publicRoom(room) };
  }

  /**
   * @param {string} clientId
   * @param {any[]} loadouts
   */
  setLoadout(clientId, loadouts) {
    const room = this._roomFor(clientId);
    if (!room) return { ok: false, error: 'Not in room' };
    const r = setLoadouts(room, clientId, loadouts);
    if (!r.ok) return r;
    return { ok: true, room: publicRoom(room) };
  }

  /**
   * @param {string} clientId
   * @param {boolean} ready
   */
  ready(clientId, ready) {
    const room = this._roomFor(clientId);
    if (!room) return { ok: false, error: 'Not in room' };
    const r = setReady(room, clientId, ready);
    if (!r.ok) return r;
    return { ok: true, room: publicRoom(room), canStart: canStart(room) };
  }

  /**
   * Start battle if both ready.
   * @param {string} clientId
   */
  start(clientId) {
    const room = this._roomFor(clientId);
    if (!room) return { ok: false, error: 'Not in room' };
    if (!canStart(room)) return { ok: false, error: 'Not ready to start' };

    const playerSeat = room.seats.find((s) => s.team === 'player');
    const enemySeat = room.seats.find((s) => s.team === 'enemy');
    const match = createMatch({
      id: `mp-${room.code}`,
      mode: 'online',
      playerLoadouts: playerSeat?.loadouts ?? defaultPlayerLoadouts(),
      enemyLoadouts: enemySeat?.loadouts ?? defaultEnemyLoadouts(),
    });
    room.match = match;
    room.phase = 'battle';
    return { ok: true, room: publicRoom(room) };
  }

  /**
   * Apply action if it's this client's unit team turn.
   * @param {string} clientId
   * @param {import('../core/match.js').Action} action
   */
  action(clientId, action) {
    const room = this._roomFor(clientId);
    if (!room || !room.match) return { ok: false, error: 'No active match' };
    if (room.phase !== 'battle') return { ok: false, error: 'Not in battle' };

    const seat = room.seats.find((s) => s.id === clientId);
    if (!seat) return { ok: false, error: 'Not in room' };

    const unit = getUnit(room.match, action.unitId);
    if (!unit) return { ok: false, error: 'Bad unit' };
    if (unit.team !== seat.team) {
      return { ok: false, error: 'Not your team' };
    }

    const result = applyAction(room.match, action);
    if (!result.ok) return { ok: false, error: result.error };

    if (room.match.phase === 'victory' || room.match.phase === 'defeat') {
      room.phase = 'done';
    }
    return { ok: true, room: publicRoom(room) };
  }

  /**
   * @param {string} clientId
   */
  getRoom(clientId) {
    const room = this._roomFor(clientId);
    if (!room) return { ok: false, error: 'Not in room' };
    return { ok: true, room: publicRoom(room) };
  }

  /**
   * @param {string} code
   */
  getRoomByCode(code) {
    const room = this.rooms.get(String(code).toUpperCase());
    if (!room) return { ok: false, error: 'Room not found' };
    return { ok: true, room: publicRoom(room) };
  }

  _roomFor(clientId) {
    const code = this.clientRoom.get(clientId);
    if (!code) return null;
    return this.rooms.get(code) ?? null;
  }
}

export { MSG, publicRoom, canStart };
