/**
 * URL Global Saves Sub-Router & Rate-Limit / Same-Origin Guards
 * Extracted from src/routes/keywords.mjs
 *
 * Handles `/api/urls/global-saves` and `/api/urls/batch-global-saves` and owns
 * the single process-local `batchGlobalSavesRateStore` Map singleton.
 */

import { escapeSqlWildcards, chunkArray } from '../utils.mjs';
import { sanitizeDestinationUrl, fetchUrlGlobalSaves } from '../core/pinterest/index.mjs';

const BATCH_GLOBAL_SAVES_WINDOW_MS = 60_000;
const BATCH_GLOBAL_SAVES_MAX_REQUESTS = 20;
export const BATCH_GLOBAL_SAVES_MAX_KEYS = 2000;
const batchGlobalSavesRateStore = new Map();

export function _resetBatchGlobalSavesRateLimit() {
  batchGlobalSavesRateStore.clear();
}

export function _getBatchGlobalSavesRateStoreStats() {
  let maxBucketLength = 0;
  for (const timestamps of batchGlobalSavesRateStore.values()) {
    if (Array.isArray(timestamps) && timestamps.length > maxBucketLength) {
      maxBucketLength = timestamps.length;
    }
  }
  return {
    size: batchGlobalSavesRateStore.size,
    maxKeys: BATCH_GLOBAL_SAVES_MAX_KEYS,
    maxTimestampsPerKey: BATCH_GLOBAL_SAVES_MAX_REQUESTS,
    maxBucketLength
  };
}

export function verifySameOriginBrowserOrApiRequest(request, env = {}) {
  const getHdr = (name) => {
    if (!request?.headers) return '';
    if (typeof request.headers.get === 'function') {
      return request.headers.get(name) || '';
    }
    return request.headers[name.toLowerCase()] || request.headers[name] || '';
  };

  const originHeader = String(getHdr('Origin')).trim();
  const secFetchSite = String(getHdr('Sec-Fetch-Site')).trim().toLowerCase();
  if (secFetchSite && secFetchSite !== 'same-origin') {
    return { allowed: false, reason: 'Cross-site requests to batch-global-saves are forbidden.' };
  }

  if (originHeader) {
    try {
      const rawReqUrl = request.fullUrl || request.url || '';
      const reqOrigin = new URL(rawReqUrl, 'http://localhost').origin.toLowerCase();
      const callerOrigin = new URL(originHeader).origin.toLowerCase();
      const allowedList = String(env?.ALLOWED_ORIGINS || '')
        .split(',')
        .map(s => s.trim().toLowerCase())
        .filter(Boolean);
      if (callerOrigin !== reqOrigin && !allowedList.includes(callerOrigin)) {
        return { allowed: false, reason: `Origin mismatch (${callerOrigin} !== ${reqOrigin}).` };
      }
      return { allowed: true };
    } catch (_) {
      return { allowed: false, reason: 'Malformed Origin header.' };
    }
  }

  if (secFetchSite === 'same-origin') {
    return { allowed: true };
  }

  const apiKey = String(getHdr('x-api-key')).trim();
  const authHeader = String(getHdr('Authorization') || getHdr('authorization')).trim();
  if (apiKey || authHeader.toLowerCase().startsWith('bearer ')) {
    return { allowed: true };
  }

  return { allowed: false, reason: 'Same-origin Origin header or valid API credentials required.' };
}

export function enforceBatchGlobalSavesRateLimit(
  request,
  nowMs = Date.now(),
  maxRequests = BATCH_GLOBAL_SAVES_MAX_REQUESTS,
  maxKeys = BATCH_GLOBAL_SAVES_MAX_KEYS
) {
  const safeMaxRequests = Math.max(1, Math.floor(Number(maxRequests) || BATCH_GLOBAL_SAVES_MAX_REQUESTS));
  const safeMaxKeys = Math.max(1, Math.floor(Number(maxKeys) || BATCH_GLOBAL_SAVES_MAX_KEYS));
  const rawIp =
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0] ||
    request.headers.get('x-real-ip') ||
    'unknown';
  const clientKey = String(rawIp).trim() || 'unknown';

  const existing = batchGlobalSavesRateStore.get(clientKey) || [];
  const recent = existing
    .filter(ts => nowMs - ts < BATCH_GLOBAL_SAVES_WINDOW_MS)
    .slice(-safeMaxRequests);

  const touchLru = (timestamps) => {
    if (batchGlobalSavesRateStore.has(clientKey)) {
      batchGlobalSavesRateStore.delete(clientKey);
    } else if (batchGlobalSavesRateStore.size >= safeMaxKeys) {
      // First purge expired entries
      for (const [key, list] of batchGlobalSavesRateStore.entries()) {
        const active = list.filter(ts => nowMs - ts < BATCH_GLOBAL_SAVES_WINDOW_MS);
        if (active.length === 0) batchGlobalSavesRateStore.delete(key);
        else batchGlobalSavesRateStore.set(key, active.slice(-safeMaxRequests));
      }
      // Hard LRU eviction if still at or above capacity
      while (batchGlobalSavesRateStore.size >= safeMaxKeys) {
        const oldestKey = batchGlobalSavesRateStore.keys().next().value;
        if (oldestKey === undefined) break;
        batchGlobalSavesRateStore.delete(oldestKey);
      }
    }
    batchGlobalSavesRateStore.set(clientKey, timestamps.slice(-safeMaxRequests));
  };

  if (recent.length >= safeMaxRequests) {
    touchLru(recent);
    const oldest = recent[0];
    const retryAfterSec = Math.max(1, Math.ceil((BATCH_GLOBAL_SAVES_WINDOW_MS - (nowMs - oldest)) / 1000));
    return { limited: true, retryAfterSec };
  }

  recent.push(nowMs);
  touchLru(recent);
  return { limited: false, remaining: Math.max(0, safeMaxRequests - recent.length) };
}

/**
 * Handles `/api/urls/global-saves` and `/api/urls/batch-global-saves` routes.
 * Returns null if pathname does not match.
 */
export async function handleUrlGlobalSavesRoutes({
  pathname,
  method,
  request,
  searchParams,
  env,
  ctx,
  sql,
  jsonResponse,
  methodNotAllowedResponse,
  safeWaitUntil
}) {
  // 0A. GET /api/urls/global-saves?url=...
  if (pathname === '/api/urls/global-saves') {
    if (method !== 'GET') {
      return methodNotAllowedResponse('GET, OPTIONS');
    }
    const rawUrl = searchParams.get('url') || searchParams.get('destination_url') || '';
    if (!rawUrl) {
      return jsonResponse({ ok: false, error: 'BAD_REQUEST', message: 'Missing url query parameter' }, 400);
    }
    const cleanUrl = sanitizeDestinationUrl(rawUrl);
    if (!cleanUrl) {
      return jsonResponse({ ok: false, error: 'BAD_REQUEST', message: 'Invalid destination url' }, 400);
    }

    try {
      const fetchRes = await fetchUrlGlobalSaves(cleanUrl);
      const count = Number(fetchRes?.count || 0);
      if (fetchRes && fetchRes.ok) {
        if (sql && count > 0) {
          const escapedCleanUrl = escapeSqlWildcards(cleanUrl);
          safeWaitUntil(ctx, async () => {
            await sql`
              UPDATE universal_master_pins
              SET url_global_saves = GREATEST(COALESCE(url_global_saves, 0), ${count}::bigint)
              WHERE destination_url IS NOT NULL
                AND destination_url <> ''
                AND (
                  (md5(destination_url) = md5(${cleanUrl}) AND destination_url = ${cleanUrl})
                  OR (md5(destination_url) = md5(${cleanUrl + '/'}) AND destination_url = ${cleanUrl + '/'})
                  OR LEFT(destination_url, 1024) LIKE ${escapedCleanUrl.slice(0, 1000) + '?%'} ESCAPE '\\'
                );
            `;
          }, 'write_back_single_url_global_saves');
        }
        return jsonResponse({
          ok: true,
          url: cleanUrl,
          count,
          global_saves: count
        }, 200, 86400);
      }
      return jsonResponse({
        ok: false,
        url: cleanUrl,
        count: 0,
        global_saves: 0,
        error: fetchRes?.error || 'FETCH_FAILED'
      }, 502);
    } catch (err) {
      return jsonResponse({ ok: false, url: cleanUrl, count: 0, global_saves: 0, error: err.message }, 500);
    }
  }

  // 0B. POST /api/urls/batch-global-saves
  if (pathname === '/api/urls/batch-global-saves') {
    if (method !== 'POST') {
      return methodNotAllowedResponse('POST, OPTIONS');
    }
    const originCheck = verifySameOriginBrowserOrApiRequest(request, env);
    if (!originCheck.allowed) {
      return jsonResponse({
        ok: false,
        success: false,
        error: 'FORBIDDEN',
        message: originCheck.reason || 'Cross-origin request rejected.'
      }, 403);
    }
    const rateLimit = enforceBatchGlobalSavesRateLimit(request);
    if (rateLimit.limited) {
      const res = jsonResponse({
        ok: false,
        success: false,
        error: 'RATE_LIMITED',
        message: 'Too many batch-global-saves requests. Please retry shortly.',
        retry_after_seconds: rateLimit.retryAfterSec
      }, 429, 0, { 'Retry-After': String(rateLimit.retryAfterSec) });
      if (res?.headers?.set) {
        res.headers.set('Retry-After', String(rateLimit.retryAfterSec));
      }
      return res;
    }
    let body = {};
    try {
      body = await request.json();
    } catch (_) {
      body = {};
    }
    const rawList = Array.isArray(body?.urls) ? body.urls : (Array.isArray(body?.destination_urls) ? body.destination_urls : []);
    const cleanUrls = Array.from(new Set(rawList.map(u => sanitizeDestinationUrl(u)).filter(Boolean))).slice(0, 15);

    if (cleanUrls.length === 0) {
      return jsonResponse({ ok: true, results: {}, counts: {}, total: 0 });
    }

    const results = {};
    const uncached = [];

    uncached.push(...cleanUrls);

    const writeBackEntries = [];
    if (uncached.length > 0) {
      const URL_FETCH_CONCURRENCY = 8;
      const fetchResults = [];
      for (const chunk of chunkArray(uncached, URL_FETCH_CONCURRENCY)) {
        const chunkRes = await Promise.allSettled(chunk.map(u => fetchUrlGlobalSaves(u)));
        fetchResults.push(...chunkRes);
      }

      for (let i = 0; i < uncached.length; i++) {
        const targetUrl = uncached[i];
        const res = fetchResults[i];
        if (res.status === 'fulfilled' && res.value?.ok) {
          const count = Number(res.value.count || 0);
          results[targetUrl] = count;
          writeBackEntries.push({ url: targetUrl, count });
        } else {
          results[targetUrl] = 0;
        }
      }
    }

    // Write-Back UPDATE to universal_master_pins.url_global_saves via safeWaitUntil
    if (sql && writeBackEntries.length > 0) {
      safeWaitUntil(ctx, async () => {
        const validEntries = writeBackEntries
          .filter(e => e.count > 0 && e.url)
          .map(e => ({ url: e.url, escaped_url: escapeSqlWildcards(e.url), count: e.count }));
        if (validEntries.length === 0) return;
        validEntries.sort((a, b) => a.url.localeCompare(b.url));
        const payloadJson = JSON.stringify(validEntries);
        await sql`
          WITH input_urls AS (
            SELECT url, escaped_url, count
            FROM jsonb_to_recordset(${payloadJson}::jsonb) AS x(url text, escaped_url text, count bigint)
          ),
          matched_pins AS (
            SELECT ump.pin_id, iu.count
            FROM input_urls iu
            JOIN universal_master_pins ump
              ON ump.destination_url IS NOT NULL
             AND ump.destination_url <> ''
             AND md5(ump.destination_url) = md5(iu.url)
             AND ump.destination_url = iu.url
            UNION ALL
            SELECT ump.pin_id, iu.count
            FROM input_urls iu
            JOIN universal_master_pins ump
              ON ump.destination_url IS NOT NULL
             AND ump.destination_url <> ''
             AND md5(ump.destination_url) = md5(iu.url || '/')
             AND ump.destination_url = (iu.url || '/')
            UNION ALL
            SELECT ump.pin_id, iu.count
            FROM input_urls iu
            JOIN universal_master_pins ump
              ON ump.destination_url IS NOT NULL
             AND ump.destination_url <> ''
             AND LEFT(ump.destination_url, 1024) ~>=~ (LEFT(iu.url, 1020) || '?')
             AND LEFT(ump.destination_url, 1024) ~<~ (LEFT(iu.url, 1020) || '@')
             AND LEFT(ump.destination_url, 1024) LIKE (LEFT(iu.escaped_url, 1020) || '?%') ESCAPE '\\'
          ),
          dedup_matches AS (
            SELECT pin_id, MAX(count)::bigint AS max_count
            FROM matched_pins
            GROUP BY pin_id
          )
          UPDATE universal_master_pins ump
          SET url_global_saves = GREATEST(COALESCE(ump.url_global_saves, 0), dm.max_count)
          FROM dedup_matches dm
          WHERE ump.pin_id = dm.pin_id;
        `;
      }, 'write_back_batch_global_saves');
    }

    return jsonResponse({
      ok: true,
      results,
      counts: results,
      total: Object.keys(results).length
    });
  }

  return null;
}
