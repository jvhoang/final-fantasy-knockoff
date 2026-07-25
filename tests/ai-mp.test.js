import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, applyAction, getUnit } from '../src/core/match.js';
import { chooseAiAction, playEnemyTurns, simulateFullBattle } from '../src/core/ai.js';
import { RoomManager } from '../src/net/room-manager.js';
import { defaultPlayerLoadouts, defaultEnemyLoadouts } from '../src/core/loadout.js';
import { TEAMS } from '../src/core/constants.js';

describe('AI legal CT actions (shipped)', () => {
  it('chooseAiAction returns a legal action for active unit', () => {
    const m = createMatch({ mode: 'ai' });
    // ensure an enemy is active
    for (const u of m.units) u.ct = 0;
    const foe = m.units.find((u) => u.team === TEAMS.ENEMY);
    foe.ct = 100;
    m.activeUnitId = foe.id;
    m.turn = { moved: false, acted: false };

    const action = chooseAiAction(m, 'normal');
    assert.ok(action);
    assert.equal(action.unitId, foe.id);
    assert.ok(['move', 'act', 'wait', 'end_turn'].includes(action.type));

    const r = applyAction(m, action);
    assert.equal(r.ok, true, r.error);
  });

  it('playEnemyTurns yields control when player unit is active', () => {
    const m = createMatch({ mode: 'ai' });
    playEnemyTurns(m, 'normal', 50);
    if (m.phase === 'battle') {
      const active = getUnit(m, m.activeUnitId);
      assert.ok(active);
      assert.equal(active.team, TEAMS.PLAYER);
    } else {
      assert.ok(['victory', 'defeat'].includes(m.phase));
    }
  });

  it('simulateFullBattle reaches a win condition (KO all)', () => {
    const m = createMatch({ mode: 'ai' });
    // Faster resolution: low HP, high damage stats, place teams adjacent
    const players = m.units.filter((u) => u.team === TEAMS.PLAYER);
    const enemies = m.units.filter((u) => u.team === TEAMS.ENEMY);
    players.forEach((u, i) => {
      u.x = 8;
      u.y = 8 + i;
      u.hp = 40;
      u.maxHp = 40;
      u.pa = 20;
      u.ma = 20;
      u.speed = 10 + i;
    });
    enemies.forEach((u, i) => {
      u.x = 9;
      u.y = 8 + i;
      u.hp = 25;
      u.maxHp = 25;
      u.pa = 15;
      u.ma = 15;
      u.speed = 9 + i;
    });
    // Reset CT and re-advance so someone is active
    for (const u of m.units) u.ct = 0;
    m.activeUnitId = null;
    m.phase = 'battle';
    m.winner = null;
    // import advance via apply wait path — force first active
    players[0].ct = 100;
    m.activeUnitId = players[0].id;
    m.turn = { moved: false, acted: false };

    simulateFullBattle(m, 400);
    assert.ok(
      m.phase === 'victory' || m.phase === 'defeat',
      `expected end phase, got ${m.phase} after battle log: ${m.log.slice(-8).join(' | ')}`
    );
    const playersAlive = m.units.filter((u) => u.team === TEAMS.PLAYER && u.alive).length;
    const enemiesAlive = m.units.filter((u) => u.team === TEAMS.ENEMY && u.alive).length;
    assert.ok(playersAlive === 0 || enemiesAlive === 0);
  });
});

describe('multiplayer room create/join + shared CT state (shipped)', () => {
  it('create room, join second seat, loadouts, ready, start, action sync', () => {
    const mgr = new RoomManager();
    const host = 'host-1';
    const guest = 'guest-1';

    const created = mgr.create(host, 'Host');
    assert.equal(created.ok, true);
    assert.ok(created.room.code);
    assert.equal(created.room.seats.filter((s) => s.id).length, 1);

    const joined = mgr.join(guest, created.room.code, 'Guest');
    assert.equal(joined.ok, true);
    assert.equal(joined.room.seats.every((s) => s.id), true);

    const loH = mgr.setLoadout(host, defaultPlayerLoadouts());
    assert.equal(loH.ok, true);
    const loG = mgr.setLoadout(guest, defaultEnemyLoadouts());
    assert.equal(loG.ok, true);

    assert.equal(mgr.ready(host, true).ok, true);
    assert.equal(mgr.ready(guest, true).ok, true);

    const started = mgr.start(host);
    assert.equal(started.ok, true);
    assert.equal(started.room.phase, 'battle');
    assert.ok(started.room.match);
    assert.equal(started.room.match.units.length, 8);
    assert.ok(started.room.match.activeUnitId);

    const match = started.room.match;
    const active = getUnit(match, match.activeUnitId);
    assert.ok(active);

    // Only the seat matching team may act
    const controller = active.team === 'player' ? host : guest;
    const wrong = active.team === 'player' ? guest : host;
    const bad = mgr.action(wrong, { type: 'wait', unitId: active.id });
    assert.equal(bad.ok, false);

    const good = mgr.action(controller, { type: 'wait', unitId: active.id });
    assert.equal(good.ok, true, good.error);
    assert.ok(good.room.match);
    // state advanced: either new active unit or same match progressed
    assert.ok(good.room.match.clockTicks >= 0);
    assert.ok(good.room.match.log.length > match.log.length || good.room.match.activeUnitId !== active.id || good.room.match.units.find(u => u.id === active.id).ct < 100);
  });

  it('join missing room fails', () => {
    const mgr = new RoomManager();
    const r = mgr.join('x', 'ZZZZZZ', 'N');
    assert.equal(r.ok, false);
  });
});
