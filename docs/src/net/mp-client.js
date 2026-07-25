/**
 * Multiplayer client: WebSocket (Node server) or P2P host/guest (static Pages).
 * Host is authoritative via RoomManager in both modes when using P2P.
 */
import { RoomManager, MSG } from './room-manager.js';
import { makeRoomCode } from './protocol.js';
import { resolveMultiplayerEndpoint, peerIdForRoom } from './ws-config.js';

const PEERJS_CDN = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';

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
      existing.addEventListener('load', () => resolve(window.Peer));
      existing.addEventListener('error', () => reject(new Error('PeerJS load failed')));
      if (window.Peer) resolve(window.Peer);
      return;
    }
    const s = doc.createElement('script');
    s.src = PEERJS_CDN;
    s.async = true;
    s.dataset.ffkPeerjs = '1';
    s.onload = () => {
      if (window.Peer) resolve(window.Peer);
      else reject(new Error('PeerJS missing after load'));
    };
    s.onerror = () => reject(new Error('Failed to load PeerJS (network/CDN)'));
    doc.head.appendChild(s);
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
   * @param {string} name
   */
  async createRoom(name = 'Host') {
    const ep = resolveMultiplayerEndpoint();
    if (ep.url) {
      await this._connectWs(ep.url);
      this.transport = 'ws';
      this.role = 'ws';
      this.send({ type: MSG.CREATE_ROOM, name });
      return { transport: 'ws', endpoint: ep.url };
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
      await this._connectWs(ep.url);
      this.transport = 'ws';
      this.role = 'ws';
      this.send({ type: MSG.JOIN_ROOM, code, name });
      return { transport: 'ws', endpoint: ep.url };
    }
    return this._joinP2pGuest(code, name);
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
      const ws = new WebSocket(url);
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        reject(new Error(`WebSocket timeout: ${url}`));
      }, 8000);
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
        clearTimeout(timer);
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
        this.handlers.onStatus?.('ws-close');
      };
    });
  }

  // --- P2P Host ---

  async _createP2pHost(name) {
    this.handlers.onStatus?.('p2p-loading');
    const Peer = await loadPeerJs();
    const code = makeRoomCode();
    const peerId = peerIdForRoom(code);
    this.localManager = new RoomManager();
    this.clientId = `host-${code}`;
    this.role = 'host';
    this.transport = 'p2p';

    await new Promise((resolve, reject) => {
      const peer = new Peer(peerId, {
        debug: 0,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' },
          ],
        },
      });
      this.peer = peer;
      const t = setTimeout(() => reject(new Error('P2P host timeout (PeerJS)')), 15000);
      peer.on('open', () => {
        clearTimeout(t);
        this.handlers.onStatus?.('p2p-host-open');
        resolve();
      });
      peer.on('error', (err) => {
        clearTimeout(t);
        // ID taken — regenerate once
        reject(err?.type === 'unavailable-id' ? new Error('Room code busy, try again') : err || new Error('P2P error'));
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
            this._sendToPeer(conn, { type: MSG.ERROR, error: String(e.message || e) });
          }
        });
      });
    });

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
            { urls: 'stun:global.stun.twilio.com:3478' },
          ],
        },
      });
      this.peer = peer;
      const t = setTimeout(() => reject(new Error('P2P guest timeout')), 15000);
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
          reject(e || new Error('P2P connection error'));
        });
      });
      peer.on('error', (err) => {
        clearTimeout(t);
        reject(err || new Error('P2P peer error'));
      });
    });
    return { transport: 'p2p', code: String(code).toUpperCase(), peerId };
  }
}
