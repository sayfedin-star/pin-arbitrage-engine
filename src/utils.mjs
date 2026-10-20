/**
 * Shared Utilities for Cloudflare Workers & Node.js Engine
 */

export function formatPinterestCookie(rawCookie) {
  if (!rawCookie || typeof rawCookie !== 'string') return '';
  let cookie = rawCookie.trim();
  if (cookie.startsWith('"') && cookie.endsWith('"')) {
    cookie = cookie.slice(1, -1).trim();
  }
  // [INVARIANT: GUEST-SCRAPING-ONLY] Never send _auth=1 to avoid zeroing aggregate counters
  cookie = cookie.replace(/_auth="?[^;"]+"?;?\s*/g, '').trim();
  if (!cookie.includes('=') || cookie.startsWith('TWc9') || cookie.startsWith('Mg==')) {
    return `_pinterest_sess="${cookie.replace(/"/g, '')}"; _auth=0;`;
  }
  cookie = cookie.replace(/_pinterest_sess=([^;\s"]+)/, '_pinterest_sess="$1"');
  if (!cookie.includes('_auth=')) {
    cookie = `${cookie.replace(/;$/, '')}; _auth=0;`;
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

/**
 * Escapes SQL LIKE / ILIKE wildcard characters (%, _, \) to prevent full table scans
 * and ensure literal string matching when constructing dynamic pattern queries.
 */
export function escapeSqlWildcards(input) {
  if (!input || typeof input !== 'string') return '';
  return input.replace(/[\\%_]/g, '\\$&');
}

/**
 * Safely masks database credentials in PostgreSQL connection strings
 * using WHATWG URL parser with regex fallback.
 */
export function maskDatabaseUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  try {
    const u = new URL(trimmed);
    if (u.password || u.username) {
      u.password = '••••••••';
      return decodeURIComponent(u.toString());
    }
    return u.toString();
  } catch (_) {
    const masked = trimmed.replace(/(:\/\/[^:/?#\s]+:)([\s\S]*?)(@[^@/?#\s]+)/, '$1••••••••$3');
    if (masked.includes('••••••••')) return masked;
    if (trimmed.includes('@')) {
      return trimmed.replace(/\/\/[\s\S]*?@/, '//••••••••@');
    }
    return '[REDACTED_DATABASE_URL]';
  }
}

/**
 * Culinary Color Name Mapper
 */
export function getCulinaryColorName(hex) {
  if (!hex || typeof hex !== 'string') return 'Culinary Accent';
  const cleanHex = hex.replace('#', '').toLowerCase();
  if (cleanHex.length < 6) return 'Culinary Accent';

  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);

  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const delta = max - min;
  const l = (max + min) / 2;
  let h = 0;

  if (delta !== 0) {
    if (max === r / 255) h = ((g / 255 - b / 255) / delta) % 6;
    else if (max === g / 255) h = (b / 255 - r / 255) / delta + 2;
    else h = (r / 255 - g / 255) / delta + 4;
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }

  // Refined Culinary & Dessert/Bakery Boundaries
  if (l >= 0.82) return 'Whipped Vanilla / Glaze Cream';
  if (l <= 0.18) return 'Charred Espresso / Dark Truffle';
  if (h >= 345 || h <= 10) return 'Cranberry Glaze / Red Reduction';
  if (h > 10 && h <= 30 && l < 0.38) return 'Toasted Cinnamon / Dutch Cocoa';
  if (h > 10 && h <= 32 && l >= 0.38 && l < 0.55) return 'Roasted Pumpkin / Warm Amber';
  if (h > 32 && h <= 55 && l >= 0.40) return 'Golden Brioche / Honey Glaze';
  if (h > 10 && h <= 45 && l < 0.45) return 'Caramelized Pecan / Spice Crumble';
  if (h > 55 && h <= 165) return 'Fresh Herb / Sage Infusion';
  if (h > 165 && h <= 260) return 'Nordic Sea Salt / Steel Cookware';
  
  return 'Artisan Blend / Culinary Accent';
}

/**
 * Human-readable age formatter
 */
export function formatAge(days) {
  const d = Number(days || 1);
  if (d < 30) return `${d}d ago`;
  if (d < 365) return `${Math.floor(d / 30)}mo ago`;
  return `${(d / 365).toFixed(1)}y ago`;
}
