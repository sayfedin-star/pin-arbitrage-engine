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

/**
 * Deep Null-Byte & Serialization Sanitizer
 * - Recursively strips PostgreSQL-incompatible null bytes (\u0000) from objects, keys, arrays, and strings.
 * - Safely converts BigInt to Number (or string if exceeding MAX_SAFE_INTEGER) preventing JSON.stringify TypeError.
 * - Safely converts Date instances to ISO 8601 strings.
 * - Guards against circular/cyclic references using WeakSet.
 */
export function sanitizeForJsonb(input, seen = new WeakSet()) {
  if (input === null || input === undefined) {
    return input;
  }
  if (typeof input === 'string') {
    return input.replace(/\u0000/g, '').replace(/\\u0000/g, '');
  }
  if (typeof input === 'bigint') {
    return (input <= BigInt(Number.MAX_SAFE_INTEGER) && input >= BigInt(Number.MIN_SAFE_INTEGER))
      ? Number(input)
      : input.toString();
  }
  if (typeof input === 'number' || typeof input === 'boolean') {
    return input;
  }
  if (input instanceof Date) {
    return isNaN(input.getTime()) ? null : input.toISOString();
  }
  if (typeof input === 'object') {
    if (seen.has(input)) {
      return '[Circular]';
    }
    seen.add(input);

    if (Array.isArray(input)) {
      return input.map(item => sanitizeForJsonb(item, seen));
    }

    if (input instanceof Set) {
      return Array.from(input).map(item => sanitizeForJsonb(item, seen));
    }

    if (input instanceof Map) {
      const cleaned = {};
      for (const [key, value] of input.entries()) {
        const sanitizedKey = typeof key === 'string' ? key.replace(/\u0000/g, '').replace(/\\u0000/g, '') : String(key);
        cleaned[sanitizedKey] = sanitizeForJsonb(value, seen);
      }
      return cleaned;
    }

    const cleaned = {};
    for (const [key, value] of Object.entries(input)) {
      const sanitizedKey = typeof key === 'string' ? key.replace(/\u0000/g, '').replace(/\\u0000/g, '') : key;
      cleaned[sanitizedKey] = sanitizeForJsonb(value, seen);
    }
    return cleaned;
  }
  return input;
}
