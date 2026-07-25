import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { server } from '../src/net/server.js';

function listen(srv) {
  return new Promise((resolve) => {
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      resolve(port);
    });
  });
}

function request(port, method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: data
          ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
          : {},
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          resolve({ status: res.statusCode, body: raw, headers: res.headers });
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

describe('HTTP server (shipped)', () => {
  let port;
  before(async () => {
    port = await listen(server);
  });
  after(async () => {
    await new Promise((r) => server.close(r));
  });

  it('health and index brand', async () => {
    const health = await request(port, 'GET', '/api/health');
    assert.equal(health.status, 200);
    const hj = JSON.parse(health.body);
    assert.equal(hj.name, 'Final Fantasy Knockoff');

    const index = await request(port, 'GET', '/');
    assert.equal(index.status, 200);
    assert.ok(index.body.includes('Final Fantasy Knockoff'));
    assert.ok(index.body.includes('main.js'));
  });

  it('REST create + join room', async () => {
    const created = await request(port, 'POST', '/api/rooms', {
      clientId: 'rest-host',
      name: 'Host',
    });
    assert.equal(created.status, 200);
    const cj = JSON.parse(created.body);
    assert.equal(cj.ok, true);
    assert.ok(cj.room.code);

    const joined = await request(port, 'POST', `/api/rooms/${cj.room.code}/join`, {
      clientId: 'rest-guest',
      name: 'Guest',
    });
    assert.equal(joined.status, 200);
    const jj = JSON.parse(joined.body);
    assert.equal(jj.ok, true);
    assert.equal(jj.room.seats.filter((s) => s.id).length, 2);

    const get = await request(port, 'GET', `/api/rooms/${cj.room.code}`);
    assert.equal(get.status, 200);
    const gj = JSON.parse(get.body);
    assert.equal(gj.ok, true);
    assert.equal(gj.room.code, cj.room.code);
  });

  it('serves client module graph', async () => {
    const main = await request(port, 'GET', '/main.js');
    assert.equal(main.status, 200);
    assert.ok(main.body.includes('GameApp') || main.body.includes('getBrand'));

    const core = await request(port, 'GET', '/src/core/ct.js');
    assert.equal(core.status, 200);
    assert.ok(core.body.includes('tickCt'));
  });
});
