/**
 * HTTP Response Compression Hook (src/http/compression.mjs)
 *
 * Zero-dependency Fastify v5 `onSend` compression using built-in `node:zlib`:
 * - Supports Brotli (`br`, quality 5, text mode) and Gzip (`gzip`, level 6)
 * - Strictly enforces `> 1024` byte threshold and compressible MIME allowlist
 *   (`text/html`, `application/javascript`, `application/json`, `text/css`)
 * - Appends `Vary: Accept-Encoding` without clobbering existing `Vary` tokens (`Cookie`, `Origin`)
 * - Serves pre-compressed static in-memory Buffers via WeakMap with zero per-request CPU
 */

import zlib from 'node:zlib';
import { promisify } from 'node:util';

const brotliCompressAsync = promisify(zlib.brotliCompress);
const gzipAsync = promisify(zlib.gzip);

export const COMPRESSION_THRESHOLD_BYTES = 1024;

const COMPRESSIBLE_MIME_SET = new Set([
  'text/html',
  'application/javascript',
  'text/javascript',
  'application/json',
  'text/css'
]);

const precompressedStaticCache = new WeakMap();

/**
 * Registers pre-compressed `br` and `gzip` Buffers for a static in-memory Buffer singleton.
 * Keyed via WeakMap by Buffer reference so zero memory leaks can ever occur.
 */
export function registerPrecompressedBuffer(rawBuf, compressed = {}) {
  if (!Buffer.isBuffer(rawBuf)) return;
  precompressedStaticCache.set(rawBuf, {
    br: Buffer.isBuffer(compressed.br) ? compressed.br : null,
    gzip: Buffer.isBuffer(compressed.gzip) ? compressed.gzip : null
  });
}

/**
 * Synchronously pre-compresses a static in-memory Buffer (startup/lazy-init only).
 */
export function precompressStaticBuffer(rawBuf) {
  if (!Buffer.isBuffer(rawBuf) || rawBuf.length <= COMPRESSION_THRESHOLD_BYTES) {
    return { br: null, gzip: null };
  }
  const br = zlib.brotliCompressSync(rawBuf, {
    params: {
      [zlib.constants.BROTLI_PARAM_QUALITY]: 6,
      [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
      [zlib.constants.BROTLI_PARAM_SIZE_HINT]: rawBuf.length
    }
  });
  const gzip = zlib.gzipSync(rawBuf, { level: 6 });
  const entry = {
    br: br.length < rawBuf.length ? br : null,
    gzip: gzip.length < rawBuf.length ? gzip : null
  };
  registerPrecompressedBuffer(rawBuf, entry);
  return entry;
}

/**
 * Extracts normalized MIME type without charset/parameters and checks allowlist.
 */
export function isCompressibleContentType(contentTypeHeader) {
  if (!contentTypeHeader || typeof contentTypeHeader !== 'string') return false;
  const semiIdx = contentTypeHeader.indexOf(';');
  const mime = (semiIdx === -1 ? contentTypeHeader : contentTypeHeader.slice(0, semiIdx))
    .trim()
    .toLowerCase();
  if (COMPRESSIBLE_MIME_SET.has(mime)) return true;
  if (mime.endsWith('+json')) return true;
  return false;
}

/**
 * RFC 9110 §12.5.3 Accept-Encoding negotiation supporting `br` and `gzip` with q-values.
 * Prefers `br` over `gzip` on equal quality weights and respects `q=0` exclusions.
 */
export function negotiateEncoding(acceptEncodingHeader) {
  if (!acceptEncodingHeader || typeof acceptEncodingHeader !== 'string') return null;

  let brQ = null;
  let gzipQ = null;
  let wildcardQ = null;

  const parts = acceptEncodingHeader.split(',');
  for (const rawPart of parts) {
    const part = rawPart.trim();
    if (!part) continue;
    const segments = part.split(';');
    const token = segments[0].trim().toLowerCase();
    let q = 1.0;

    for (let i = 1; i < segments.length; i++) {
      const param = segments[i].trim().toLowerCase();
      if (param.startsWith('q=')) {
        const parsed = Number.parseFloat(param.slice(2));
        if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) {
          q = parsed;
        } else {
          q = 0;
        }
      }
    }

    if (token === 'br') {
      brQ = brQ === null ? q : Math.max(brQ, q);
    } else if (token === 'gzip' || token === 'x-gzip') {
      gzipQ = gzipQ === null ? q : Math.max(gzipQ, q);
    } else if (token === '*') {
      wildcardQ = wildcardQ === null ? q : Math.max(wildcardQ, q);
    }
  }

  const effectiveBr = brQ !== null ? brQ : 0;
  const effectiveGzip = gzipQ !== null ? gzipQ : (wildcardQ !== null ? wildcardQ : 0);

  if (effectiveBr <= 0 && effectiveGzip <= 0) return null;
  if (effectiveBr >= effectiveGzip && effectiveBr > 0) return 'br';
  if (effectiveGzip > 0) return 'gzip';
  return null;
}

/**
 * Merges a header token (e.g. `Accept-Encoding`) into Fastify reply's `Vary` header
 * without duplicating or clobbering existing tokens (`Cookie`, `Origin`).
 */
export function appendVaryHeader(reply, token) {
  if (!reply || !token) return;
  const existing = reply.getHeader('vary');
  const existingList = Array.isArray(existing)
    ? existing.flatMap((v) => String(v).split(','))
    : (existing ? String(existing).split(',') : []);

  const normalized = [];
  const seen = new Set();
  for (const raw of existingList) {
    const clean = raw.trim();
    if (!clean) continue;
    const lower = clean.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      normalized.push(clean);
    }
  }

  if (seen.has('*')) return;
  if (!seen.has(token.toLowerCase())) {
    normalized.push(token);
  }

  if (normalized.length > 0) {
    reply.header('Vary', normalized.join(', '));
  }
}

/**
 * Compresses a Buffer asynchronously on the libuv threadpool using `br` or `gzip`.
 */
export async function compressBuffer(buf, encoding) {
  if (encoding === 'br') {
    return await brotliCompressAsync(buf, {
      params: {
        [zlib.constants.BROTLI_PARAM_QUALITY]: 5,
        [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
        [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buf.length
      }
    });
  }
  if (encoding === 'gzip') {
    return await gzipAsync(buf, { level: 6 });
  }
  return buf;
}

/**
 * Registers the Fastify `onSend` HTTP compression hook on the given Fastify instance.
 */
export function registerCompressionHook(app, { threshold = COMPRESSION_THRESHOLD_BYTES } = {}) {
  app.addHook('onSend', async (request, reply, payload) => {
    if (payload === null || payload === undefined || payload === '') {
      return payload;
    }

    const method = (request.method || 'GET').toUpperCase();
    const status = reply.statusCode;
    if (method === 'HEAD' || status < 200 || status === 204 || status === 304) {
      return payload;
    }

    if (reply.getHeader('content-encoding')) {
      return payload;
    }

    const contentType = reply.getHeader('content-type');
    if (!isCompressibleContentType(typeof contentType === 'string' ? contentType : String(contentType || ''))) {
      return payload;
    }

    let rawBuf;
    if (Buffer.isBuffer(payload)) {
      rawBuf = payload;
    } else if (typeof payload === 'string') {
      rawBuf = Buffer.from(payload, 'utf8');
    } else if (payload instanceof Uint8Array) {
      rawBuf = Buffer.from(payload.buffer, payload.byteOffset, payload.byteLength);
    } else {
      return payload;
    }

    if (rawBuf.length <= threshold) {
      return payload;
    }

    // Response is eligible for encoding negotiation -> always advertise Vary: Accept-Encoding
    appendVaryHeader(reply, 'Accept-Encoding');

    const encoding = negotiateEncoding(request.headers?.['accept-encoding']);
    if (!encoding) {
      return payload;
    }

    // Zero-CPU fast path for pre-compressed static in-memory Buffers
    const staticEntry = precompressedStaticCache.get(rawBuf);
    let compressed;
    if (staticEntry && staticEntry[encoding]) {
      compressed = staticEntry[encoding];
    } else {
      compressed = await compressBuffer(rawBuf, encoding);
    }

    if (!compressed || compressed.length >= rawBuf.length) {
      return payload;
    }

    reply.header('Content-Encoding', encoding);
    reply.header('Content-Length', String(compressed.length));
    return compressed;
  });
}
