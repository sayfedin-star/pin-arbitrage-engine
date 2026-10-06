/**
 * Sharded TTL-Backed Visual Lens Cache Service
 * 
 * Replaces vulnerable in-memory RAM caching (`Map`) with persistent database storage
 * in `pin_visual_search_cache` table.
 * 
 * Features:
 * - 7-day automatic TTL expiration
 * - Zero loss on server restarts
 * - In-flight promise deduplication to coalesce simultaneous requests
 */

const inflightRequests = new Map();

export async function getCachedVisualSearchMatches(sql, pinId) {
  const cleanPin = String(pinId || '').trim();
  if (!cleanPin) return null;

  try {
    const [row] = await sql`
      SELECT matches, created_at, expires_at
      FROM pin_visual_search_cache
      WHERE pin_id = ${cleanPin}
        AND expires_at > NOW()
      LIMIT 1;
    `;

    if (row && Array.isArray(row.matches) && row.matches.length > 0) {
      return {
        cached: true,
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

export async function setCachedVisualSearchMatches(sql, pinId, matches, ttlDays = 7) {
  const cleanPin = String(pinId || '').trim();
  if (!cleanPin || !Array.isArray(matches) || matches.length === 0) return false;

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
        matches = EXCLUDED.matches,
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
 * Coalesced fetch helper: checks DB cache, executes fetcher if miss, and writes back.
 */
export async function getOrFetchVisualSearchMatches(sql, pinId, fetcherFn) {
  const cleanPin = String(pinId || '').trim();
  if (!cleanPin) throw new Error('pinId is required');

  // 1. Check persistent database cache
  const cached = await getCachedVisualSearchMatches(sql, cleanPin);
  if (cached) {
    return {
      success: true,
      pin_id: cleanPin,
      matches: cached.matches,
      cached: true,
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
        await setCachedVisualSearchMatches(sql, cleanPin, result.matches);
      }
      return result;
    } finally {
      inflightRequests.delete(cleanPin);
    }
  })();

  inflightRequests.set(cleanPin, fetchPromise);
  return await fetchPromise;
}
