/**
 * HTTP static server + WebSocket multiplayer for Final Fantasy Knockoff.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { RoomManager, MSG } from './room-manager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const PUBLIC = path.join(ROOT, 'public');
const SRC = path.join(ROOT, 'src');

const PORT = Number(process.env.PORT || 8787);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.ico': 'image/x-icon',
};

function send(res, status, body, type = 'text/plain') {
  res.writeHead(status, {
    'Content-Type': type,
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

function safeJoin(root, reqPath) {
  const decoded = decodeURIComponent(reqPath.split('?')[0]);
  const cleaned = path.normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  const full = path.join(root, cleaned);
  if (!full.startsWith(root)) return null;
  return full;
}

const manager = new RoomManager();
/** @type {Map<import('ws').WebSocket, string>} */
const socketIds = new Map();
let nextId = 1;

const server = http.createServer((req, res) => {
  const url = req.url || '/';

  // REST helpers for tests / simple join
  if (url.startsWith('/api/health')) {
    return send(res, 200, JSON.stringify({ ok: true, name: 'Final Fantasy Knockoff' }), 'application/json');
  }
  if (url === '/api/rooms' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try {
        const data = body ? JSON.parse(body) : {};
        const clientId = data.clientId || `rest-${nextId++}`;
        const result = manager.create(clientId, data.name || 'Host');
        send(res, 200, JSON.stringify(result), 'application/json');
      } catch (e) {
        send(res, 400, JSON.stringify({ ok: false, error: String(e) }), 'application/json');
      }
    });
    return;
  }
  if (url.startsWith('/api/rooms/') && req.method === 'GET') {
    const code = url.split('/')[3];
    const result = manager.getRoomByCode(code);
    return send(res, result.ok ? 200 : 404, JSON.stringify(result), 'application/json');
  }
  if (url.startsWith('/api/rooms/') && url.endsWith('/join') && req.method === 'POST') {
    const code = url.split('/')[3];
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try {
        const data = body ? JSON.parse(body) : {};
        const clientId = data.clientId || `rest-${nextId++}`;
        const result = manager.join(clientId, code, data.name || 'Guest');
        send(res, result.ok ? 200 : 400, JSON.stringify(result), 'application/json');
      } catch (e) {
        send(res, 400, JSON.stringify({ ok: false, error: String(e) }), 'application/json');
      }
    });
    return;
  }

  // Static: /src/* for ES modules
  if (url.startsWith('/src/')) {
    const file = safeJoin(SRC, url.slice(4));
    if (file && fs.existsSync(file) && fs.statSync(file).isFile()) {
      const ext = path.extname(file);
      return send(res, 200, fs.readFileSync(file), MIME[ext] || 'application/octet-stream');
    }
    return send(res, 404, 'Not found');
  }

  // node_modules three
  if (url.startsWith('/node_modules/')) {
    const file = safeJoin(path.join(ROOT, 'node_modules'), url.slice('/node_modules'.length));
    if (file && fs.existsSync(file) && fs.statSync(file).isFile()) {
      const ext = path.extname(file);
      return send(res, 200, fs.readFileSync(file), MIME[ext] || 'application/octet-stream');
    }
    return send(res, 404, 'Not found');
  }

  let rel = url === '/' ? '/index.html' : url.split('?')[0];
  const file = safeJoin(PUBLIC, rel);
  if (file && fs.existsSync(file) && fs.statSync(file).isFile()) {
    const ext = path.extname(file);
    return send(res, 200, fs.readFileSync(file), MIME[ext] || 'application/octet-stream');
  }
  // SPA fallback
  const index = path.join(PUBLIC, 'index.html');
  if (fs.existsSync(index)) {
    return send(res, 200, fs.readFileSync(index), MIME['.html']);
  }
  send(res, 404, 'Not found');
});

const wss = new WebSocketServer({ server });

function broadcastRoom(code, payload) {
  const data = JSON.stringify(payload);
  for (const [ws, id] of socketIds) {
    const r = manager.clientRoom.get(id);
    if (r === code && ws.readyState === 1) ws.send(data);
  }
}

wss.on('connection', (ws) => {
  const clientId = `ws-${nextId++}`;
  socketIds.set(ws, clientId);
  ws.send(JSON.stringify({ type: 'welcome', clientId, brand: 'Final Fantasy Knockoff' }));

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      ws.send(JSON.stringify({ type: MSG.ERROR, error: 'Invalid JSON' }));
      return;
    }

    const type = msg.type;
    let result;

    switch (type) {
      case MSG.CREATE_ROOM:
        result = manager.create(clientId, msg.name);
        break;
      case MSG.JOIN_ROOM:
        result = manager.join(clientId, msg.code, msg.name);
        break;
      case MSG.SET_LOADOUT:
        result = manager.setLoadout(clientId, msg.loadouts);
        break;
      case MSG.READY:
        result = manager.ready(clientId, msg.ready !== false);
        break;
      case MSG.START:
        result = manager.start(clientId);
        break;
      case MSG.ACTION:
        result = manager.action(clientId, msg.action);
        break;
      default:
        result = { ok: false, error: `Unknown type ${type}` };
    }

    if (!result.ok) {
      ws.send(JSON.stringify({ type: MSG.ERROR, error: result.error }));
      return;
    }

    const code = result.room?.code;
    const payload = {
      type: result.room?.phase === 'battle' || result.room?.match ? MSG.MATCH_STATE : MSG.ROOM_STATE,
      ...result,
    };
    if (code) broadcastRoom(code, payload);
    else ws.send(JSON.stringify(payload));
  });

  ws.on('close', () => {
    socketIds.delete(ws);
  });
});

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  server.listen(PORT, () => {
    console.log(`Final Fantasy Knockoff listening on http://localhost:${PORT}`);
  });
}

export { server, manager, PORT };
