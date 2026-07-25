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
 * @param {string} host
 * @param {string} [href]
 */
export function isStaticPagesHost(host, href = '') {
  const h = String(host || '').toLowerCase();
  if (h.endsWith('github.io')) return true;
  if (h.endsWith('gitlab.io')) return true;
  if (h.endsWith('netlify.app')) return true;
  if (h.endsWith('pages.dev')) return true;
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
