/**
 * Edge-First & Sharded TTL-Backed Visual Lens Cache Service
 *
 * Tier 1: Cloudflare Edge KV (`PIN_ENGINE_KV` with key `visual:pin:${pinId}`, 7-day TTL = 604800s)
 * Tier 2: Persistent PostgreSQL storage (`pin_visual_search_cache` table, 7-day TTL)
 *
 * Features:
 * - Sub-5ms Edge KV reads across all Cloudflare PoPs without waking Neon compute
 * - 7-day automatic TTL expiration
 * - Zero loss on server restarts
 * - In-flight promise deduplication to coalesce simultaneous requests
 */

const inflightRequests = new Map();
const VISUAL_KV_TTL_SECONDS = 7 * 24 * 60 * 60; // 604,800s (7 days)

export async function getCachedVisualSearchMatches(sql, pinId, env = null) {
  const cleanPin = String(pinId || '').trim();
  if (!cleanPin) return null;

  // 1. Tier 1: Cloudflare Edge KV (`PIN_ENGINE_KV`)
  if (env?.PIN_ENGINE_KV) {
    try {
      const kvData = await env.PIN_ENGINE_KV.get(`visual:pin:${cleanPin}`, { type: 'json', cacheTtl: 3600 });
      if (kvData && Array.isArray(kvData.matches) && kvData.matches.length > 0) {
        return {
          cached: true,
          source: 'kv_edge',
          matches: kvData.matches,
          seed_pin: kvData.seed_pin || null,
          cached_at: kvData.cached_at || null,
          expires_at: kvData.expires_at || null
        };
      }
    } catch (_) {}
  }

  // 2. Tier 2: PostgreSQL `pin_visual_search_cache` fallback
  if (!sql) return null;
  try {
    const [row] = await sql`
      SELECT matches, created_at, expires_at
      FROM pin_visual_search_cache
      WHERE pin_id = ${cleanPin}
        AND expires_at > NOW()
      LIMIT 1;
    `;

    if (row && Array.isArray(row.matches) && row.matches.length > 0) {
      // Backfill Edge KV if available
      if (env?.PIN_ENGINE_KV) {
        env.PIN_ENGINE_KV.put(
          `visual:pin:${cleanPin}`,
          JSON.stringify({
            matches: row.matches,
            cached_at: row.created_at,
            expires_at: row.expires_at
          }),
          { expirationTtl: VISUAL_KV_TTL_SECONDS }
        ).catch(() => {});
      }
      return {
        cached: true,
        source: 'postgres_hub',
        matches: row.matches,
        cached_at: row.created_at,
        expires_at: row.expires_at
      };
    }
  } catch (err) {
    console.warn(`[visual-lens-cache] Cache lookup error for pin ${cleanPin}:`, err.message);
  }

  return null;
}

/**
 * Purge Expired Visual Search Cache Records
 * Executes opportunistically (2% probability on write) or via scheduled pulse
 */
export async function purgeExpiredVisualCache(sql, batchLimit = 500) {
  if (!sql) return 0;
  try {
    const res = await sql`
      WITH expired_rows AS (
        SELECT pin_id
        FROM pin_visual_search_cache
        WHERE expires_at <= NOW()
        ORDER BY pin_id ASC
        LIMIT ${batchLimit}
        FOR UPDATE SKIP LOCKED
      )
      DELETE FROM pin_visual_search_cache
      WHERE pin_id IN (SELECT pin_id FROM expired_rows)
      RETURNING pin_id;
    `;
    return res.length;
  } catch (err) {
    console.warn(`[visual-lens-cache] Eviction purge warning:`, err.message);
    return 0;
  }
}

export async function setCachedVisualSearchMatches(sql, pinId, matches, ttlDays = 7, env = null, seedPin = null) {
  const cleanPin = String(pinId || '').trim();
  if (!cleanPin || !Array.isArray(matches) || matches.length === 0) return false;

  const ttlSeconds = Math.max(3600, Math.round(Number(ttlDays || 7) * 86400));

  // 1. Write to Cloudflare Edge KV (`PIN_ENGINE_KV`)
  if (env?.PIN_ENGINE_KV) {
    try {
      await env.PIN_ENGINE_KV.put(
        `visual:pin:${cleanPin}`,
        JSON.stringify({
          matches,
          seed_pin: seedPin || null,
          cached_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString()
        }),
        { expirationTtl: ttlSeconds }
      );
    } catch (kvErr) {
      console.warn(`[visual-lens-cache] Edge KV write warning for pin ${cleanPin}:`, kvErr.message);
    }
  }

  // 2. Write to Postgres fallback
  if (!sql) return true;
  try {
    await sql`
      INSERT INTO pin_visual_search_cache (pin_id, matches, created_at, expires_at)
      VALUES (
        ${cleanPin},
        ${JSON.stringify(matches)}::jsonb,
        NOW(),
        NOW() + (${ttlDays} || ' days')::interval
      )
      ON CONFLICT (pin_id) DO UPDATE SET
        matches = CASE 
          WHEN jsonb_typeof(EXCLUDED.matches) = 'array' AND jsonb_array_length(EXCLUDED.matches) > 0 
          THEN EXCLUDED.matches 
          ELSE pin_visual_search_cache.matches 
        END,
        created_at = NOW(),
        expires_at = NOW() + (${ttlDays} || ' days')::interval;
    `;

    // Opportunistic cleanup: 2% probability on write
    if (Math.random() < 0.02) {
      purgeExpiredVisualCache(sql).catch((err) => {
        console.warn(`[visual-lens-cache] Opportunistic purge error:`, err.message);
      });
    }

    return true;
  } catch (err) {
    console.warn(`[visual-lens-cache] Cache write error for pin ${cleanPin}:`, err.message);
    return false;
  }
}

/**
 * Coalesced fetch helper: checks Edge KV + DB cache, executes fetcher if miss, and writes back.
 */
export async function getOrFetchVisualSearchMatches(sql, pinId, fetcherFn, env = null) {
  const cleanPin = String(pinId || '').trim();
  if (!cleanPin) throw new Error('pinId is required');

  // 1. Check Edge KV & persistent database cache
  const cached = await getCachedVisualSearchMatches(sql, cleanPin, env);
  if (cached) {
    return {
      success: true,
      pin_id: cleanPin,
      matches: cached.matches,
      seed_pin: cached.seed_pin || null,
      cached: true,
      source: cached.source || 'cache',
      expires_at: cached.expires_at
    };
  }

  // 2. Coalesce concurrent in-flight requests for the same pin
  if (inflightRequests.has(cleanPin)) {
    return await inflightRequests.get(cleanPin);
  }

  // Safety bound against memory growth
  if (inflightRequests.size > 500) {
    const oldestKey = inflightRequests.keys().next().value;
    if (oldestKey) inflightRequests.delete(oldestKey);
  }

  const fetchPromise = (async () => {
    try {
      const result = await fetcherFn(cleanPin);
      if (result?.success && Array.isArray(result.matches) && result.matches.length > 0) {
        await setCachedVisualSearchMatches(sql, cleanPin, result.matches, 7, env, result.seed_pin || null);
      }
      return result;
    } finally {
      inflightRequests.delete(cleanPin);
    }
  })();

  inflightRequests.set(cleanPin, fetchPromise);
  return await fetchPromise;
}