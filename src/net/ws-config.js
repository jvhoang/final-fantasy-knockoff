/**
 * Resolve multiplayer WebSocket URL + detect static (GitHub Pages) hosts.
 */

/**
 * @param {{ protocol?: string, host?: string, search?: string, href?: string }|null} loc
 * @param {{ storageGet?: (k: string) => string|null, envWs?: string|null }} [opts]
 * @returns {{ url: string|null, mode: 'ws'|'pages'|'custom', reason: string }}
 */
export function resolveMultiplayerEndpoint(loc = null, opts = {}) {
  const locationLike = loc || (typeof location !== 'undefined' ? location : { protocol: 'http:', host: 'localhost', search: '' });
  const protocol = locationLike.protocol || 'http:';
  const host = locationLike.host || 'localhost';
  const search = locationLike.search || '';

  // Explicit override: ?ws=wss://host:port or localStorage
  try {
    const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
    const q = params.get('ws') || params.get('wsUrl');
    if (q) {
      return { url: normalizeWsUrl(q), mode: 'custom', reason: 'query' };
    }
  } catch {
    /* ignore */
  }

  const stored =
    opts.storageGet?.('ffk_ws_url') ||
    (typeof localStorage !== 'undefined' ? localStorage.getItem('ffk_ws_url') : null);
  if (stored) {
    return { url: normalizeWsUrl(stored), mode: 'custom', reason: 'localStorage' };
  }

  if (opts.envWs) {
    return { url: normalizeWsUrl(opts.envWs), mode: 'custom', reason: 'env' };
  }

  // GitHub Pages / pure static — no same-origin WS server
  if (isStaticPagesHost(host, locationLike.href || '')) {
    return {
      url: null,
      mode: 'pages',
      reason: 'Static host (e.g. GitHub Pages) has no WebSocket multiplayer server',
    };
  }

  // Local / self-hosted Node server (npm start)
  const wsProto = protocol === 'https:' ? 'wss:' : 'ws:';
  return {
    url: `${wsProto}//${host}`,
    mode: 'ws',
    reason: 'same-origin',
  };
}

/**
 * Probe whether the Node multiplayer server is available (`GET /api/health`).
 * Used to skip a doomed WebSocket attempt on pure static hosts (e.g. `npx serve`).
 * @param {{ fetchImpl?: typeof fetch, url?: string, timeoutMs?: number }} [opts]
 * @returns {Promise<boolean>}
 */
export async function hasMultiplayerHttpServer(opts = {}) {
  const fetchImpl = opts.fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
  if (!fetchImpl) return false;
  const url = opts.url || '/api/health';
  const timeoutMs = opts.timeoutMs ?? 1500;
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  try {
    const res = await fetchImpl(url, {
      method: 'GET',
      signal: ctrl?.signal,
      cache: 'no-store',
    });
    if (!res.ok) return false;
    const data = await res.json().catch(() => null);
    return !!(data && data.ok);
  } catch {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * @param {string} host
 * @param {string} [href]
 */
export function isStaticPagesHost(host, href = '') {
  const h = String(host || '').toLowerCase();
  if (h.endsWith('github.io')) return true;
  if (h.endsWith('gitlab.io')) return true;
  if (h.endsWith('netlify.app')) return true;
  if (h.endsWith('pages.dev')) return true;
  if (h.endsWith('vercel.app')) return true;
  if (typeof window !== 'undefined' && window.FFK?.pages) return true;
  if (/github\.io/i.test(href)) return true;
  return false;
}

/**
 * @param {string} raw
 */
export function normalizeWsUrl(raw) {
  let u = String(raw || '').trim();
  if (!u) return u;
  if (u.startsWith('http://')) u = 'ws://' + u.slice(7);
  if (u.startsWith('https://')) u = 'wss://' + u.slice(8);
  return u;
}

/**
 * Peer id for P2P rooms (PeerJS-compatible: lowercase alphanumeric).
 * @param {string} code 6-char room code
 */
export function peerIdForRoom(code) {
  const c = String(code || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return ('ffk' + c).toLowerCase();
}

/**
 * Human-readable error for multiplayer failures (PeerJS errors are objects).
 * @param {unknown} err
 */
export function formatMpError(err) {
  if (err == null) return 'Multiplayer failed';
  if (typeof err === 'string') return err;
  if (err instanceof Error && err.message) return err.message;
  const e = /** @type {{ message?: string, type?: string, toString?: () => string }} */ (err);
  if (e.message) return e.message;
  if (e.type) return `P2P error: ${e.type}`;
  try {
    return String(err);
  } catch {
    return 'Multiplayer failed';
  }
}
