/**
 * Universal Pin Intelligence & Multi-Tier Routing Sub-Router
 * 
 * Handles:
 * - GET /api/pins/:pin_id (Universal 4-Pillar Dossier via fleet-router - Zero-Blocking)
 * - POST /api/pins/:pin_id/sync (Live Pinterest Deep Sync with 48 Algorithmic Fields)
 * - DELETE /api/pins/:pin_id/snapshots/:snapshot_id (Cascade delete across Shard base tables)
 * - DELETE /api/pins/:pin_id/serp-positions
 * - DELETE /api/pins/:pin_id/daily-metrics/:date
 */

import {
  fetchUniversalPinDossier,
  getFastEdgeDossier,
  getPinShardId,
  resolveShardConnection,
  syncPinAcrossAllFourPillars
} from '../modules/sharding/fleet-router.mjs';

import { fetchPinFromPinterest } from '../../scripts/lib/pinterest.mjs';

// [INVARIANT: DUAL-PILLAR-TOMBSTONE] Record deleted date in BOTH Shard masterRecord and Central Hub keyword_serp_current (NL-04)
async function recordDeletedSnapshotTombstone({ shardSql, hubSql, pinId, targetDate }) {
  if (!targetDate) return;
  const shardP = shardSql ? shardSql`
    INSERT INTO universal_master_pins (pin_id, metadata, updated_at)
    VALUES (${pinId}, jsonb_build_object('deleted_snapshot_dates', jsonb_build_array(${targetDate})), NOW())
    ON CONFLICT (pin_id) DO UPDATE
    SET metadata = jsonb_set(
      COALESCE(universal_master_pins.metadata, '{}'::jsonb),
      '{deleted_snapshot_dates}',
      (
        SELECT jsonb_agg(DISTINCT elem)
        FROM jsonb_array_elements_text(COALESCE(universal_master_pins.metadata->'deleted_snapshot_dates', '[]'::jsonb) || to_jsonb(${targetDate}::text)) AS elem
      )
    ),
    updated_at = NOW();
  `.catch(() => {}) : Promise.resolve();

  const hubP = hubSql ? hubSql`
    UPDATE keyword_serp_current
    SET metadata = jsonb_set(
      COALESCE(metadata, '{}'::jsonb),
      '{deleted_snapshot_dates}',
      (
        SELECT jsonb_agg(DISTINCT elem)
        FROM jsonb_array_elements_text(COALESCE(metadata->'deleted_snapshot_dates', '[]'::jsonb) || to_jsonb(${targetDate}::text)) AS elem
      )
    )
    WHERE pin_id = ${pinId};
  `.catch(() => {}) : Promise.resolve();

  await Promise.all([shardP, hubP]);
}


/**
 * Fast URI discriminator for Pins routes
 */
export function isPinsRoute(pathname) {
  return pathname.startsWith('/api/pins/');
}

/**
 * Main pins routes handler
 */
export async function handlePinsRoutes({
  pathname,
  method,
  request,
  searchParams,
  env,
  ctx,
  sql,
  targetSql,
  jsonResponse,
  methodNotAllowedResponse,
  buildCanonicalCacheKey,
  getCachedOrFetch,
  invalidateEdgeCache,
  safeWaitUntil,
  getPinKvKeysToEvict,
  isValidPinId,
  redactSecrets
}) {
  const parts = pathname.slice('/api/pins/'.length).split('/').filter(Boolean);
  const pinId = parts[0];

  // 1. DELETE /api/pins/:pin_id/snapshots/:snapshot_id
  if (parts[1] === 'snapshots') {
    if (method !== 'DELETE') {
      return methodNotAllowedResponse('DELETE, OPTIONS');
    }
    const rawSnapshotParam = String(parts[2] || '').trim();
    const isDateParam = /^\d{4}-\d{2}-\d{2}$/.test(rawSnapshotParam);
    // [INVARIANT: 60-BIT-SNOWFLAKE-SAFE] Never cast 60-bit view IDs via Number() (exceeds 53-bit MAX_SAFE_INTEGER)
    const isNumericSnapshotId = /^[1-9]\d{0,19}$/.test(rawSnapshotParam);
    if (!isDateParam && !isNumericSnapshotId) {
      return jsonResponse({
        success: false,
        error: 'BAD_REQUEST',
        message: 'Valid numeric snapshot_id or date (YYYY-MM-DD) is required'
      }, 400);
    }
    if (!pinId || !isValidPinId(pinId)) {
      return jsonResponse({
        success: false,
        error: 'INVALID_PIN_ID',
        message: 'Pin ID must be a valid identifier (numeric Snowflake, 10-30 digits)'
      }, 400);
    }
    const shardId = getPinShardId(pinId, 99);
    const shardSql = await resolveShardConnection({ hubSql: sql, shardId, env }).catch(() => targetSql);

    let targetDate = isDateParam ? rawSnapshotParam : null;
    let targetKwId = null;

    // 1. If numeric ID passed, resolve date and keyword from shard view
    if (!targetDate && shardSql) {
      const [shardSnap] = await shardSql`
        SELECT snapshot_date, keyword_id FROM pins_daily_snapshots WHERE id = ${rawSnapshotParam}::bigint LIMIT 1;
      `.catch(() => []);
      targetDate = shardSnap?.snapshot_date ? new Date(shardSnap.snapshot_date).toISOString().slice(0, 10) : null;
      targetKwId = shardSnap?.keyword_id || null;
    }

    // [INVARIANT: ZERO-HUB-SNAPSHOTS] Never touch Hub for snapshots
    // [INVARIANT: SHARD-TABLES-DIRECT] Delete from base tables pin_serp_positions & pins_daily_metrics, NOT view
    if (targetDate && shardSql) {
      if (targetKwId) {
        await shardSql`
          DELETE FROM pin_serp_positions
          WHERE pin_id = ${pinId} AND snapshot_date = ${targetDate}::date AND keyword_id = ${targetKwId};
        `.catch(() => {});
        // [INVARIANT: PRESERVE-METRICS-IF-POSITIONS-REMAIN] Only prune metrics if zero positions remain (L-05)
        const [remaining] = await shardSql`
          SELECT COUNT(*)::int AS count FROM pin_serp_positions
          WHERE pin_id = ${pinId} AND snapshot_date = ${targetDate}::date;
        `.catch(() => [{ count: 0 }]);
        if (!remaining || remaining.count === 0) {
          await shardSql`
            DELETE FROM pins_daily_metrics
            WHERE pin_id = ${pinId} AND snapshot_date = ${targetDate}::date;
          `.catch(() => {});
          // [INVARIANT: DUAL-PILLAR-TOMBSTONE] Record deleted date in BOTH Shard and Central Hub (NL-04)
          await recordDeletedSnapshotTombstone({ shardSql, hubSql: sql, pinId, targetDate });
        }
      } else {
        await shardSql`
          DELETE FROM pin_serp_positions
          WHERE pin_id = ${pinId} AND snapshot_date = ${targetDate}::date;
        `.catch(() => {});
        await shardSql`
          DELETE FROM pins_daily_metrics
          WHERE pin_id = ${pinId} AND snapshot_date = ${targetDate}::date;
        `.catch(() => {});
        // [INVARIANT: DUAL-PILLAR-TOMBSTONE] Record deleted date in BOTH Shard and Central Hub (NL-04)
        await recordDeletedSnapshotTombstone({ shardSql, hubSql: sql, pinId, targetDate });
      }
    }

    await invalidateEdgeCache(`pin:dossier?pin_id=${pinId}`);
    await invalidateEdgeCache(buildCanonicalCacheKey('pin:dossier', { pin_id: pinId }));
    await invalidateEdgeCache('keywords:pin-dossier');
    if (env?.PIN_D1_DB) {
      await env.PIN_D1_DB.prepare('DELETE FROM edge_pins_metadata WHERE pin_id = ?').bind(pinId).run().catch(() => {});
    }
    if (env?.PIN_ENGINE_KV) {
      // [INVARIANT: AWAIT-MUTATION-EVICTIONS] Await KV key evictions synchronously on mutation (L-12)
      const evictions = getPinKvKeysToEvict(pinId, targetKwId ? [targetKwId] : []).map(k => env.PIN_ENGINE_KV.delete(k).catch(() => {}));
      await Promise.all(evictions);
    }
    return jsonResponse({ success: true, deleted_snapshot: rawSnapshotParam, pin_id: pinId });
  }

  // 1A. DELETE /api/pins/:pin_id/serp-positions (Delete specific SERP position for a keyword on a date)
  if (parts[1] === 'serp-positions') {
    if (method !== 'DELETE') {
      return methodNotAllowedResponse('DELETE, OPTIONS');
    }
    if (!pinId || !isValidPinId(pinId)) {
      return jsonResponse({
        success: false,
        error: 'INVALID_PIN_ID',
        message: 'Pin ID must be a valid identifier (alphanumeric, 10-128 chars)'
      }, 400);
    }

    let body = {};
    if (request.headers.get('content-type')?.includes('application/json')) {
      try { body = await request.json(); } catch (_) {}
    }
    const kwId = Number(body.keyword_id || searchParams.get('keyword_id'));
    const snapshotDate = String(body.snapshot_date || searchParams.get('snapshot_date') || '').trim();

    if (!kwId || isNaN(kwId) || !/^\d{4}-\d{2}-\d{2}$/.test(snapshotDate)) {
      return jsonResponse({
        success: false,
        error: 'BAD_REQUEST',
        message: 'Valid numeric keyword_id and YYYY-MM-DD snapshot_date are required'
      }, 400);
    }

    const shardId = getPinShardId(pinId, 99);
    const shardSql = await resolveShardConnection({ hubSql: sql, shardId, env }).catch(() => targetSql);

    // Delete from Two-Tier positions table on shard
    await shardSql`
      DELETE FROM pin_serp_positions
      WHERE pin_id = ${pinId} AND snapshot_date = ${snapshotDate}::date AND keyword_id = ${kwId};
    `.catch(() => {});

    // [INVARIANT: PRESERVE-METRICS-IF-POSITIONS-REMAIN] Only prune metrics if zero positions remain (L-05)
    const [remaining] = await shardSql`
      SELECT COUNT(*)::int AS count FROM pin_serp_positions
      WHERE pin_id = ${pinId} AND snapshot_date = ${snapshotDate}::date;
    `.catch(() => [{ count: 0 }]);
    if (!remaining || remaining.count === 0) {
      await shardSql`
        DELETE FROM pins_daily_metrics
        WHERE pin_id = ${pinId} AND snapshot_date = ${snapshotDate}::date;
      `.catch(() => {});
      // [INVARIANT: DUAL-PILLAR-TOMBSTONE] Record deleted date in BOTH Shard and Central Hub (NL-04)
      await recordDeletedSnapshotTombstone({ shardSql, hubSql: sql, pinId, targetDate: snapshotDate });
    }

    await invalidateEdgeCache(`pin:dossier?pin_id=${pinId}`);
    await invalidateEdgeCache(buildCanonicalCacheKey('pin:dossier', { pin_id: pinId }));
    await invalidateEdgeCache('keywords:pin-dossier');
    if (env?.PIN_D1_DB) {
      await env.PIN_D1_DB.prepare('DELETE FROM edge_pins_metadata WHERE pin_id = ?').bind(pinId).run().catch(() => {});
    }
    if (env?.PIN_ENGINE_KV) {
      // [INVARIANT: AWAIT-MUTATION-EVICTIONS] Await KV key evictions synchronously on mutation
      const evictions = getPinKvKeysToEvict(pinId, [kwId]).map(k => env.PIN_ENGINE_KV.delete(k).catch(() => {}));
      await Promise.all(evictions);
    }
    return jsonResponse({
      success: true,
      pin_id: pinId,
      keyword_id: kwId,
      snapshot_date: snapshotDate
    });
  }

  // 1B. DELETE /api/pins/:pin_id/daily-metrics/:date (Delete entire day's metrics and all ranks)
  if (parts[1] === 'daily-metrics') {
    if (method !== 'DELETE') {
      return methodNotAllowedResponse('DELETE, OPTIONS');
    }
    if (!pinId || !isValidPinId(pinId)) {
      return jsonResponse({
        success: false,
        error: 'INVALID_PIN_ID',
        message: 'Pin ID must be a valid identifier (alphanumeric, 10-128 chars)'
      }, 400);
    }
    const snapshotDate = String(parts[2] || searchParams.get('snapshot_date') || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshotDate)) {
      return jsonResponse({
        success: false,
        error: 'BAD_REQUEST',
        message: 'Valid YYYY-MM-DD snapshot_date is required in path (/api/pins/:pinId/daily-metrics/YYYY-MM-DD)'
      }, 400);
    }

    const shardId = getPinShardId(pinId, 99);
    const shardSql = await resolveShardConnection({ hubSql: sql, shardId, env }).catch(() => targetSql);

    // Delete metrics and positions from shard
    await shardSql`
      DELETE FROM pins_daily_metrics
      WHERE pin_id = ${pinId} AND snapshot_date = ${snapshotDate}::date;
    `.catch(() => {});

    await shardSql`
      DELETE FROM pin_serp_positions
      WHERE pin_id = ${pinId} AND snapshot_date = ${snapshotDate}::date;
    `.catch(() => {});

    // [INVARIANT: DUAL-PILLAR-TOMBSTONE] Record deleted date in BOTH Shard and Central Hub (NL-04)
    await recordDeletedSnapshotTombstone({ shardSql, hubSql: sql, pinId, targetDate: snapshotDate });

    await invalidateEdgeCache(`pin:dossier?pin_id=${pinId}`);
    await invalidateEdgeCache(buildCanonicalCacheKey('pin:dossier', { pin_id: pinId }));
    await invalidateEdgeCache('keywords:pin-dossier');
    if (env?.PIN_D1_DB) {
      await env.PIN_D1_DB.prepare('DELETE FROM edge_pins_metadata WHERE pin_id = ?').bind(pinId).run().catch(() => {});
    }
    if (env?.PIN_ENGINE_KV) {
      // [INVARIANT: AWAIT-MUTATION-EVICTIONS] Await KV key evictions synchronously on mutation
      const evictions = getPinKvKeysToEvict(pinId).map(k => env.PIN_ENGINE_KV.delete(k).catch(() => {}));
      await Promise.all(evictions);
    }
    return jsonResponse({
      success: true,
      pin_id: pinId,
      snapshot_date: snapshotDate
    });
  }

  // 2. POST /api/pins/:pin_id/sync (Live Pinterest Deep Sync with 48 Algorithmic Fields)
  if (parts[1] === 'sync') {
    // [INVARIANT: ZERO-HUB-SNAPSHOTS] Central Hub snapshots are purged from sync; strictly offloaded to Shards
    if (method !== 'POST') {
      return methodNotAllowedResponse('POST, OPTIONS');
    }
    if (!pinId || !isValidPinId(pinId)) {
      return jsonResponse({
        success: false,
        error: 'INVALID_PIN_ID',
        message: 'Pin ID must be a valid identifier (alphanumeric, 10-128 chars)'
      }, 400);
    }
    try {
      const pinResult = await fetchPinFromPinterest(pinId);
      if (!pinResult?.ok || !pinResult.pin) {
        return jsonResponse({
          success: false,
          error: 'SCRAPE_FAILED',
          message: pinResult?.error || 'Failed to fetch live telemetry from Pinterest. Pin may be private or rate limited.',
          pin_id: pinId
        }, 502);
      }
      const syncResult = await syncPinAcrossAllFourPillars({
        hubSql: sql,
        pinId,
        scrapedPin: pinResult.pin,
        env,
        ctx
      });

      // [INVARIANT: POST-SYNC-EVICTION] Invalidate L0/L1 AFTER database commits succeed
      await invalidateEdgeCache(`pin:dossier?pin_id=${pinId}`);
      await invalidateEdgeCache(buildCanonicalCacheKey('pin:dossier', { pin_id: pinId }));
      await invalidateEdgeCache(`pin:trajectory?pin_id=${pinId}`);
      await invalidateEdgeCache('keywords:pin-dossier');

      return jsonResponse({
        success: true,
        synced: true,
        pin_id: pinId,
        shard_id: syncResult.shard_id,
        pin: pinResult.pin,
        velocity: syncResult.syncVelocity,
        dossier: syncResult.dossier
      }, 200, 0);
    } catch (err) {
      return jsonResponse({
        success: false,
        error: 'SYNC_ERROR',
        message: redactSecrets ? redactSecrets(err.message) : err.message,
        pin_id: pinId
      }, 500);
    }
  }

  // 3. GET/DELETE /api/pins/:pin_id (Universal 4-Pillar Dossier & Complete Pin Purge)
  if (parts.length === 1) {
    if (method === 'DELETE') {
      if (!pinId || !isValidPinId(pinId)) {
        return jsonResponse({
          success: false,
          error: 'INVALID_PIN_ID',
          message: 'Pin ID must be a valid identifier (alphanumeric, 10-128 chars)'
        }, 400);
      }
      const shardId = getPinShardId(pinId, 99);
      const shardSql = await resolveShardConnection({ hubSql: sql, shardId, env }).catch(() => targetSql);
      
      // Cascade delete on target Shard
      await shardSql`DELETE FROM universal_master_pins WHERE pin_id = ${pinId};`.catch(() => {});
      await shardSql`DELETE FROM pins_daily_metrics WHERE pin_id = ${pinId};`.catch(() => {});
      await shardSql`DELETE FROM pin_serp_positions WHERE pin_id = ${pinId};`.catch(() => {});

      // Delete from Central Hub operational tables
      await sql`DELETE FROM keyword_serp_current WHERE pin_id = ${pinId};`.catch(() => {});
      await sql`DELETE FROM keyword_displaced_index WHERE pin_id = ${pinId};`.catch(() => {});
      await sql`DELETE FROM competitor_pins WHERE pin_id = ${pinId};`.catch(() => {});
      await sql`DELETE FROM pa_pins WHERE pin_id = ${pinId};`.catch(() => {});

      // Invalidate Edge Caches synchronously
      await invalidateEdgeCache(`pin:dossier?pin_id=${pinId}`);
      await invalidateEdgeCache(buildCanonicalCacheKey('pin:dossier', { pin_id: pinId }));
      await invalidateEdgeCache(`pin:trajectory?pin_id=${pinId}`);
      await invalidateEdgeCache('keywords:pin-dossier');
      if (env?.PIN_D1_DB) {
        await env.PIN_D1_DB.prepare('DELETE FROM edge_pins_metadata WHERE pin_id = ?').bind(pinId).run().catch(() => {});
      }
      if (env?.PIN_ENGINE_KV) {
        const evictions = getPinKvKeysToEvict(pinId).map(k => env.PIN_ENGINE_KV.delete(k).catch(() => {}));
        await Promise.all(evictions);
      }
      return jsonResponse({ success: true, purged: true, pin_id: pinId });
    }

    if (method !== 'GET') {
      return methodNotAllowedResponse('GET, DELETE, OPTIONS');
    }
    if (!pinId || !isValidPinId(pinId)) {
      return jsonResponse({
        success: false,
        error: 'INVALID_PIN_ID',
        message: 'Pin ID must be a valid identifier (numeric Snowflake, 10-30 digits)'
      }, 400);
    }
    try {
      if (searchParams.get('prefetch') === 'true') {
        // [INVARIANT: SAFE-PREFETCH-EDGE-ONLY]
        // 1. Return immediately from Cloudflare D1 or KV edge cache (< 3ms)
        // 2. NEVER trigger live Pinterest scraping (bgEnrichPromise)
        // 3. NEVER wake up sleeping Shard databases
        const edgeFast = await getFastEdgeDossier(pinId, env);
        if (!edgeFast || !edgeFast.success) {
          return jsonResponse({ success: false, not_cached: true, status: 'cache_miss' }, 200, 0);
        }
        return jsonResponse(edgeFast, 200, 300);
      }

      const forceRefresh = searchParams.get('refresh') === 'true';
      const dossierCacheKey = buildCanonicalCacheKey('pin:dossier', { pin_id: pinId });
      if (forceRefresh) {
        await invalidateEdgeCache(dossierCacheKey);
      }

      const dossier = await getCachedOrFetch(dossierCacheKey, async () => {
        return await fetchUniversalPinDossier({ hubSql: sql, pinId, ctx, env, bypassEdgeCache: forceRefresh });
      }, 30000, 120000, { forceRefresh });

      // Edge cache poisoning guard: If dossier failed, has 0 snapshots, is degraded, or has an unverified fallback (<= 2 days while having rankings),
      // invalidate cache so subsequent page loads can immediately fetch full history once shard is warm.
      if (
        !dossier?.success ||
        (!dossier?.daily_trajectory?.length && !dossier?.snapshots?.length) ||
        dossier?.is_degraded ||
        (dossier?.daily_trajectory?.length <= 2 && (dossier?.pillar_2_keywords_context?.ranking_keywords?.length || 0) > 1 && !dossier?.from_shard_snapshots)
      ) {
        invalidateEdgeCache(dossierCacheKey);
      }

      // [INVARIANT: SCALE-TO-ZERO & NO-BACKGROUND-HOVER-SCRAPE]
      // Background live Pinterest scrape (bgEnrichPromise) is strictly removed from simple GET reads.
      // Live scraping & DB writes are isolated to explicit POST /api/pins/:id/sync or refresh=true.

      if (!dossier || !dossier.pin_id || !dossier.success) {
        invalidateEdgeCache(dossierCacheKey);
        const isUnavailable = dossier?.error === 'SHARD_UNAVAILABLE' || dossier?.circuit_broken || dossier?.is_degraded;
        return jsonResponse({
          success: false,
          error: isUnavailable ? 'SHARD_UNAVAILABLE' : 'NOT_FOUND',
          message: dossier?.message || (isUnavailable ? `Pin storage shard is currently cold/unavailable. Please retry.` : `Pin dossier not found for pin_id: ${pinId}`)
        }, isUnavailable ? 503 : 404);
      }
      return jsonResponse(dossier, 200, 15);
    } catch (err) {
      return jsonResponse({
        success: false,
        error: 'INTERNAL_ERROR',
        message: redactSecrets ? redactSecrets(err.message) : err.message,
        pin_id: pinId
      }, 500);
    }
  }

  return null;
}
