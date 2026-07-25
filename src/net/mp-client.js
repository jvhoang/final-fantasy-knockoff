/**
 * Multiplayer client: WebSocket (Node server) or P2P host/guest (static Pages).
 * Host is authoritative via RoomManager in both modes when using P2P.
 *
 * Strategy:
 *  - pages / no URL → PeerJS P2P immediately
 *  - same-origin ws → health-check /api/health; if missing, P2P (avoids "WS failed")
 *  - WS connect fail → automatic P2P fallback (except forced ?ws= custom, which still tries P2P after error message)
 */
import { RoomManager, MSG } from './room-manager.js';
import { makeRoomCode } from './protocol.js';
import {
  resolveMultiplayerEndpoint,
  peerIdForRoom,
  hasMultiplayerHttpServer,
  formatMpError,
} from './ws-config.js';

const PEERJS_CDN = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
const PEERJS_CDN_FALLBACK = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';

/**
 * Load PeerJS from CDN once (GitHub Pages path).
 * @returns {Promise<any>}
 */
export function loadPeerJs(doc = typeof document !== 'undefined' ? document : null) {
  if (typeof window !== 'undefined' && window.Peer) return Promise.resolve(window.Peer);
  if (!doc) return Promise.reject(new Error('No document for PeerJS'));
  return new Promise((resolve, reject) => {
    const existing = doc.querySelector('script[data-ffk-peerjs]');
    if (existing) {
      existing.addEventListener('load', () => {
        if (window.Peer) resolve(window.Peer);
        else reject(new Error('PeerJS missing after load'));
      });
      existing.addEventListener('error', () => reject(new Error('PeerJS load failed')));
      if (window.Peer) resolve(window.Peer);
      return;
    }
    const trySrc = (src, isLast) => {
      const s = doc.createElement('script');
      s.src = src;
      s.async = true;
      s.dataset.ffkPeerjs = '1';
      s.onload = () => {
        if (window.Peer) resolve(window.Peer);
        else if (isLast) reject(new Error('PeerJS missing after load'));
        else {
          s.remove();
          trySrc(PEERJS_CDN_FALLBACK, true);
        }
      };
      s.onerror = () => {
        s.remove();
        if (isLast) reject(new Error('Failed to load PeerJS (network/CDN)'));
        else trySrc(PEERJS_CDN_FALLBACK, true);
      };
      doc.head.appendChild(s);
    };
    trySrc(PEERJS_CDN, false);
  });
}

/**
 * @typedef {{
 *   onMessage: (msg: any) => void,
 *   onStatus?: (s: string) => void,
 * }} MpHandlers
 */

export class MultiplayerClient {
  /**
   * @param {MpHandlers} handlers
   */
  constructor(handlers) {
    this.handlers = handlers;
    /** @type {WebSocket|null} */
    this.ws = null;
    /** @type {any} */
    this.peer = null;
    /** @type {any} */
    this.conn = null;
    this.clientId = null;
    this.role = null; // 'host' | 'guest' | 'ws'
    this.transport = null; // 'ws' | 'p2p'
    /** @type {RoomManager|null} */
    this.localManager = null;
    this._destroyed = false;
  }

  /**
   * Connect for host create. Returns transport info.
   * Prefer same-origin WS when the Node server is up; otherwise PeerJS P2P.
   * Never hard-fails with bare "WS failed" when P2P can recover.
   * @param {string} name
   */
  async createRoom(name = 'Host') {
    const ep = resolveMultiplayerEndpoint();
    if (ep.url) {
      const useWs = ep.mode === 'custom' || (await hasMultiplayerHttpServer());
      if (useWs) {
        try {
          await this._connectWs(ep.url);
          this.transport = 'ws';
          this.role = 'ws';
          this.send({ type: MSG.CREATE_ROOM, name });
          return { transport: 'ws', endpoint: ep.url };
        } catch (wsErr) {
          this._resetWsSocket();
          if (ep.mode === 'custom') {
            // Still try P2P so Create Room works without a dedicated server
            this.handlers.onStatus?.('ws-fallback-p2p');
          } else {
            this.handlers.onStatus?.('ws-fallback-p2p');
          }
          // fall through to P2P
          void wsErr;
        }
      } else {
        this.handlers.onStatus?.('ws-fallback-p2p');
      }
    }
    // P2P host with local RoomManager authority
    return this._createP2pHost(name);
  }

  /**
   * @param {string} code
   * @param {string} name
   */
  async joinRoom(code, name = 'Guest') {
    const ep = resolveMultiplayerEndpoint();
    if (ep.url) {
      const useWs = ep.mode === 'custom' || (await hasMultiplayerHttpServer());
      if (useWs) {
        try {
          await this._connectWs(ep.url);
          this.transport = 'ws';
          this.role = 'ws';
          this.send({ type: MSG.JOIN_ROOM, code, name });
          return { transport: 'ws', endpoint: ep.url };
        } catch (wsErr) {
          this._resetWsSocket();
          this.handlers.onStatus?.('ws-fallback-p2p');
          void wsErr;
        }
      } else {
        this.handlers.onStatus?.('ws-fallback-p2p');
      }
    }
    return this._joinP2pGuest(code, name);
  }

  _resetWsSocket() {
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.ws = null;
    if (this.transport === 'ws') {
      this.transport = null;
      this.role = null;
    }
  }

  /**
   * Send protocol message (guest → host, or client → WS server).
   * @param {object} msg
   */
  send(msg) {
    if (this.transport === 'ws' && this.ws?.readyState === 1) {
      this.ws.send(JSON.stringify(msg));
      return;
    }
    if (this.role === 'guest' && this.conn?.open) {
      this.conn.send(JSON.stringify(msg));
      return;
    }
    if (this.role === 'host' && this.localManager) {
      // Host can also drive local manager for own actions
      this._hostHandle(msg, this.clientId);
      return;
    }
    throw new Error('Multiplayer not connected');
  }

  close() {
    this._destroyed = true;
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    try {
      this.conn?.close();
    } catch {
      /* ignore */
    }
    try {
      this.peer?.destroy();
    } catch {
      /* ignore */
    }
    this.ws = null;
    this.conn = null;
    this.peer = null;
  }

  // --- WebSocket ---

  /**
   * @param {string} url
   */
  _connectWs(url) {
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState === 1) {
        resolve(this.ws);
        return;
      }
      let settled = false;
      let intentionalClose = false;
      const ws = new WebSocket(url);
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        intentionalClose = true;
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        reject(new Error(`WebSocket timeout: ${url}`));
      }, 5000);
      ws.onopen = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.ws = ws;
        this.handlers.onStatus?.('ws-open');
        resolve(ws);
      };
      ws.onerror = () => {
        if (settled) return;
        settled = true;
        intentionalClose = true;
        clearTimeout(timer);
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        reject(new Error(`WebSocket failed: ${url}`));
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data));
          if (msg.type === 'welcome') this.clientId = msg.clientId;
          this.handlers.onMessage(msg);
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        // Do not toast "Disconnected" during failed connect / P2P fallback / destroy
        if (intentionalClose || settled === false || this._destroyed || this.transport !== 'ws') return;
        this.handlers.onStatus?.('ws-close');
      };
    });
  }

  // --- P2P Host ---

  async _createP2pHost(name) {
    this.handlers.onStatus?.('p2p-loading');
    const Peer = await loadPeerJs();
    // Retry a few room codes if peer id is taken on the broker
    let lastErr = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const code = makeRoomCode();
      const peerId = peerIdForRoom(code);
      this.localManager = new RoomManager();
      this.clientId = `host-${code}`;
      this.role = 'host';
      this.transport = 'p2p';
      try {
        await this._openPeerHost(Peer, peerId, code);
        // Create room locally with same code as PeerJS id mapping
        this.handlers.onMessage({
          type: 'welcome',
          clientId: this.clientId,
          brand: 'Final Fantasy Knockoff',
          transport: 'p2p',
        });
        const result = this.localManager.create(this.clientId, name, code);
        if (!result.ok) throw new Error(result.error || 'Failed to create room');
        this._emitRoom(result);
        return { transport: 'p2p', code, peerId };
      } catch (e) {
        lastErr = e;
        try {
          this.peer?.destroy();
        } catch {
          /* ignore */
        }
        this.peer = null;
        this.localManager = null;
        this.role = null;
        this.transport = null;
        const msg = formatMpError(e);
        if (/busy|unavailable-id/i.test(msg) && attempt < 2) continue;
        throw new Error(msg);
      }
    }
    throw new Error(formatMpError(lastErr) || 'P2P host failed');
  }

  /**
   * @param {any} Peer
   * @param {string} peerId
   * @param {string} code
   */
  _openPeerHost(Peer, peerId, code) {
    return new Promise((resolve, reject) => {
      const peer = new Peer(peerId, {
        debug: 0,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' },
          ],
        },
      });
      this.peer = peer;
      const t = setTimeout(() => reject(new Error('P2P host timeout (PeerJS broker)')), 15000);
      peer.on('open', () => {
        clearTimeout(t);
        this.handlers.onStatus?.('p2p-host-open');
        resolve();
      });
      peer.on('error', (err) => {
        clearTimeout(t);
        if (err?.type === 'unavailable-id') {
          reject(new Error('Room code busy, try again'));
          return;
        }
        reject(new Error(formatMpError(err) || 'P2P error'));
      });
      peer.on('connection', (conn) => {
        this.conn = conn;
        conn.on('open', () => {
          this.handlers.onStatus?.('p2p-guest-connected');
        });
        conn.on('data', (raw) => {
          try {
            const msg = typeof raw === 'string' ? JSON.parse(raw) : raw;
            const guestId = conn.metadata?.clientId || `guest-${code}`;
            this._hostHandle(msg, guestId);
          } catch (e) {
            this._sendToPeer(conn, { type: MSG.ERROR, error: formatMpError(e) });
          }
        });
      });
    });
  }

  /**
   * @param {object} msg
   * @param {string} fromId
   */
  _hostHandle(msg, fromId) {
    if (!this.localManager) return;
    let result;
    switch (msg.type) {
      case MSG.CREATE_ROOM:
        result = this.localManager.create(fromId, msg.name);
        break;
      case MSG.JOIN_ROOM:
        result = this.localManager.join(fromId, msg.code, msg.name);
        break;
      case MSG.SET_LOADOUT:
        result = this.localManager.setLoadout(fromId, msg.loadouts);
        break;
      case MSG.READY:
        result = this.localManager.ready(fromId, msg.ready !== false);
        break;
      case MSG.START:
        result = this.localManager.start(fromId);
        break;
      case MSG.ACTION:
        result = this.localManager.action(fromId, msg.action);
        break;
      default:
        result = { ok: false, error: `Unknown type ${msg.type}` };
    }
    if (!result.ok) {
      // Reply error to requester; host also toasts via onMessage if self
      const err = { type: MSG.ERROR, error: result.error };
      if (fromId === this.clientId) this.handlers.onMessage(err);
      else if (this.conn) this._sendToPeer(this.conn, err);
      return;
    }
    this._emitRoom(result);
  }

  _emitRoom(result) {
    const payload = {
      type: result.room?.phase === 'battle' || result.room?.match ? MSG.MATCH_STATE : MSG.ROOM_STATE,
      ok: true,
      room: result.room,
      canStart: result.canStart,
      transport: 'p2p',
    };
    this.handlers.onMessage(payload);
    if (this.conn?.open) this._sendToPeer(this.conn, payload);
  }

  _sendToPeer(conn, msg) {
    try {
      conn.send(JSON.stringify(msg));
    } catch {
      /* ignore */
    }
  }

  // --- P2P Guest ---

  async _joinP2pGuest(code, name) {
    this.handlers.onStatus?.('p2p-loading');
    const Peer = await loadPeerJs();
    const peerId = peerIdForRoom(code);
    this.clientId = `guest-${code}-${Math.random().toString(36).slice(2, 7)}`;
    this.role = 'guest';
    this.transport = 'p2p';

    await new Promise((resolve, reject) => {
      const peer = new Peer({
        debug: 0,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' },
          ],
        },
      });
      this.peer = peer;
      const t = setTimeout(() => reject(new Error('P2P guest timeout — is the host online with this code?')), 15000);
      peer.on('open', () => {
        const conn = peer.connect(peerId, {
          reliable: true,
          metadata: { clientId: this.clientId, name },
        });
        this.conn = conn;
        conn.on('open', () => {
          clearTimeout(t);
          this.handlers.onStatus?.('p2p-connected');
          this.handlers.onMessage({ type: 'welcome', clientId: this.clientId, transport: 'p2p' });
          // Join room on host
          conn.send(JSON.stringify({ type: MSG.JOIN_ROOM, code: String(code).toUpperCase(), name }));
          resolve();
        });
        conn.on('data', (raw) => {
          try {
            const msg = typeof raw === 'string' ? JSON.parse(raw) : raw;
            this.handlers.onMessage(msg);
          } catch {
            /* ignore */
          }
        });
        conn.on('error', (e) => {
          clearTimeout(t);
          reject(new Error(formatMpError(e) || 'P2P connection error'));
        });
      });
      peer.on('error', (err) => {
        clearTimeout(t);
        reject(new Error(formatMpError(err) || 'P2P peer error'));
      });
    });
    return { transport: 'p2p', code: String(code).toUpperCase(), peerId };
  }
}
