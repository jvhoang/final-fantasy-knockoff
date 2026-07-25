/**
 * Multiplayer endpoint resolution + peer id helpers (shipped pure paths).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveMultiplayerEndpoint,
  isStaticPagesHost,
  normalizeWsUrl,
  peerIdForRoom,
  hasMultiplayerHttpServer,
  formatMpError,
} from '../src/net/ws-config.js';
import { RoomManager } from '../src/net/room-manager.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('multiplayer endpoint resolution', () => {
  it('detects GitHub Pages as static (no same-origin WS)', () => {
    assert.equal(isStaticPagesHost('jvhoang.github.io'), true);
    const ep = resolveMultiplayerEndpoint({
      protocol: 'https:',
      host: 'jvhoang.github.io',
      search: '',
      href: 'https://jvhoang.github.io/final-fantasy-knockoff/',
    });
    assert.equal(ep.mode, 'pages');
    assert.equal(ep.url, null);
  });

  it('uses same-origin ws for localhost server', () => {
    const ep = resolveMultiplayerEndpoint({
      protocol: 'http:',
      host: '127.0.0.1:8787',
      search: '',
      href: 'http://127.0.0.1:8787/',
    });
    assert.equal(ep.mode, 'ws');
    assert.equal(ep.url, 'ws://127.0.0.1:8787');
  });

  it('honors ?ws= override', () => {
    const ep = resolveMultiplayerEndpoint({
      protocol: 'https:',
      host: 'jvhoang.github.io',
      search: '?ws=wss://example.com/mp',
      href: 'https://jvhoang.github.io/x/',
    });
    assert.equal(ep.mode, 'custom');
    assert.equal(ep.url, 'wss://example.com/mp');
  });

  it('normalizeWsUrl upgrades http(s)', () => {
    assert.equal(normalizeWsUrl('https://x.com'), 'wss://x.com');
    assert.equal(normalizeWsUrl('http://x.com'), 'ws://x.com');
  });

  it('peerIdForRoom is stable lowercase alphanumeric', () => {
    assert.equal(peerIdForRoom('AB12CD'), 'ffkab12cd');
    assert.equal(peerIdForRoom('ab12cd'), 'ffkab12cd');
  });

  it('formatMpError handles PeerJS-like objects', () => {
    assert.equal(formatMpError(new Error('boom')), 'boom');
    assert.equal(formatMpError({ type: 'network', message: 'net' }), 'net');
    assert.equal(formatMpError({ type: 'unavailable-id' }), 'P2P error: unavailable-id');
    assert.equal(formatMpError(null), 'Multiplayer failed');
  });

  it('hasMultiplayerHttpServer uses health endpoint', async () => {
    const ok = await hasMultiplayerHttpServer({
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({ ok: true, name: 'Final Fantasy Knockoff' }),
      }),
    });
    assert.equal(ok, true);
    const bad = await hasMultiplayerHttpServer({
      fetchImpl: async () => {
        throw new Error('network');
      },
    });
    assert.equal(bad, false);
    const notOk = await hasMultiplayerHttpServer({
      fetchImpl: async () => ({ ok: false, json: async () => ({}) }),
    });
    assert.equal(notOk, false);
  });
});

describe('RoomManager preferred code (P2P)', () => {
  it('create with preferredCode uses that room code', () => {
    const m = new RoomManager();
    const r = m.create('host-1', 'Host', 'XYZ789');
    assert.equal(r.ok, true);
    assert.equal(r.room.code, 'XYZ789');
    const j = m.join('guest-1', 'xyz789', 'Guest');
    assert.equal(j.ok, true);
    assert.equal(j.room.seats.filter((s) => s.id).length, 2);
  });
});

describe('game-app multiplayer uses MultiplayerClient (not raw WS-only toast)', () => {
  it('shipped sources wire mp-client + WS→P2P fallback (no bare WS failed only path)', () => {
    const app = fs.readFileSync(path.join(root, 'src/client/game-app.js'), 'utf8');
    const client = fs.readFileSync(path.join(root, 'src/net/mp-client.js'), 'utf8');
    assert.ok(app.includes('MultiplayerClient'));
    assert.ok(app.includes('onlineCreate'));
    assert.ok(app.includes('hasMultiplayerHttpServer'));
    assert.ok(app.includes('formatMpError'));
    assert.ok(!app.includes("toast('WS failed')"));
    assert.ok(client.includes('ws-fallback-p2p'));
    assert.ok(client.includes('hasMultiplayerHttpServer'));
    assert.ok(client.includes('_createP2pHost'));
    assert.ok(fs.existsSync(path.join(root, 'src/net/mp-client.js')));
    assert.ok(fs.existsSync(path.join(root, 'src/net/ws-config.js')));
  });
});
