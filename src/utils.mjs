/**
 * Shared Utilities for Cloudflare Workers & Node.js Engine
 */

export function formatPinterestCookie(rawCookie) {
  if (!rawCookie || typeof rawCookie !== 'string') return '';
  let cookie = rawCookie.trim();
  if (cookie.startsWith('"') && cookie.endsWith('"')) {
    cookie = cookie.slice(1, -1).trim();
  }
  if (!cookie.includes('=') || cookie.startsWith('TWc9') || cookie.startsWith('Mg==')) {
    return `_pinterest_sess="${cookie}"; _auth=1;`;
  }
  cookie = cookie.replace(/_pinterest_sess=([^;\s"]+)/, '_pinterest_sess="$1"');
  if (!cookie.includes('_auth=')) {
    cookie = `${cookie.replace(/;$/, '')}; _auth=1;`;
  }
  return cookie;
}
