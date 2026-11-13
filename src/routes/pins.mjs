/**
 * Universal Pin Intelligence & Multi-Tier Routing Sub-Router
 * 
 * Handles:
 * - GET /api/pins/:pin_id (Universal 4-Pillar Dossier - Single Unified PostgreSQL)
 * - POST /api/pins/:pin_id/sync (Live Pinterest Deep Sync with 48 Algorithmic Fields)
 * - DELETE /api/pins/:pin_id/snapshots/:snapshot_id (Cascade delete across base tables)
 * - DELETE /api/pins/:pin_id/serp-positions
 * - DELETE /api/pins/:pin_id/daily-metrics/:date
 */

import {
  fetchUniversalPinDossier,
  getPinDossier,
  syncPinAcrossAllFourPillars
} from '../modules/pins/repository.mjs';

import { fetchPinFromPinterest, resolvePinterestShortlink } from '../core/pinterest/index.mjs';

// [INVARIANT: DUAL-PILLAR-TOMBSTONE] Record deleted date in universal_master_pins and keyword_serp_current
async function recordDeletedSnapshotTombstone({ sql, pinId, targetDate }) {
  if (!sql || !targetDate) return;
  const masterP = sql`
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
  `.catch((err) => { console.error(`[PinsRoute.tombstone] Master tombstone write failed for pin ${pinId}:`, err?.message || err); });

  const serpP = sql`
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
  `.catch((err) => { console.error(`[PinsRoute.tombstone] SERP tombstone write failed for pin ${pinId}:`, err?.message || err); });

  await Promise.all([masterP, serpP]);
}

/**
 * Reconciles a pin's bridged daily_save_velocity and save_count across pins_daily_metrics,
 * universal_master_pins, keyword_serp_current, and keyword_displaced_index after any snapshot deletion.
 */
async function reconcilePinMetricsAfterSnapshotDelete({ sql, pinId }) {
  if (!sql || !pinId) return;
  try {
    const remainingRows = await sql`
      SELECT snapshot_date, save_count, repin_count, comment_count, share_count, daily_save_velocity
      FROM pins_daily_metrics
      WHERE pin_id = ${pinId}
      ORDER BY snapshot_date DESC
      LIMIT 30;
    `.catch(() => []);

    if (!Array.isArray(remainingRows) || remainingRows.length === 0) return;

    // Chronological order (oldest -> newest) to recalculate bridged velocities
    const chrono = [...remainingRows].reverse();
    for (let i = 0; i < chrono.length; i++) {
      const curr = chrono[i];
      const currDateStr = curr.snapshot_date instanceof Date
        ? curr.snapshot_date.toISOString().slice(0, 10)
        : String(curr.snapshot_date).slice(0, 10);
      let newVel = 0;
      if (i > 0) {
        const prev = chrono[i - 1];
        const prevDateStr = prev.snapshot_date instanceof Date
          ? prev.snapshot_date.toISOString().slice(0, 10)
          : String(prev.snapshot_date).slice(0, 10);
        const daysDiff = Math.max(1, Math.round((new Date(currDateStr) - new Date(prevDateStr)) / 86400000));
        const savesDiff = Math.max(0, Number(curr.save_count || 0) - Number(prev.save_count || 0));
        if (Number(prev.save_count || 0) > 0 && savesDiff > 0) {
          newVel = Math.round((savesDiff / daysDiff) * 10) / 10;
        }
      }
      curr.recomputed_velocity = newVel;
      if (Math.abs(Number(curr.daily_save_velocity || 0) - newVel) > 0.05) {
        await sql`
          UPDATE pins_daily_metrics
          SET daily_save_velocity = ${newVel}
          WHERE pin_id = ${pinId} AND snapshot_date = ${currDateStr}::date;
        `.catch((err) => { console.error(`[PinsRoute.reconcile] Failed updating velocity for pin ${pinId}:`, err?.message || err); });
      }
    }

    const latest = chrono[chrono.length - 1];
    const prev = chrono.length >= 2 ? chrono[chrono.length - 2] : null;
    const latestSaves = Number(latest.save_count || 0);
    const latestRepins = Number(latest.repin_count || 0);
    const latestVel = Number(latest.recomputed_velocity || 0);
    const latestDeltaSaves = Math.round(latestVel);
    let latestDeltaRepins = 0;
    if (prev && Number(prev.repin_count || 0) > 0 && latestRepins > Number(prev.repin_count || 0)) {
      const currDateStr = latest.snapshot_date instanceof Date ? latest.snapshot_date.toISOString().slice(0, 10) : String(latest.snapshot_date).slice(0, 10);
      const prevDateStr = prev.snapshot_date instanceof Date ? prev.snapshot_date.toISOString().slice(0, 10) : String(prev.snapshot_date).slice(0, 10);
      const daysDiff = Math.max(1, Math.round((new Date(currDateStr) - new Date(prevDateStr)) / 86400000));
      latestDeltaRepins = Math.round((latestRepins - Number(prev.repin_count || 0)) / daysDiff);
    }

    await Promise.all([
      sql`
        UPDATE universal_master_pins
        SET
          save_count = ${latestSaves},
          repin_count = ${latestRepins},
          daily_save_velocity = ${latestVel},
          delta_saves_24h = ${latestDeltaSaves},
          delta_repins_24h = ${latestDeltaRepins},
          updated_at = NOW()
        WHERE pin_id = ${pinId};
      `.catch((err) => { console.error(`[PinsRoute.reconcile] Failed updating universal_master_pins for pin ${pinId}:`, err?.message || err); }),
      sql`
        UPDATE keyword_serp_current
        SET
          save_count = ${latestSaves},
          repin_count = ${latestRepins},
          daily_save_velocity = ${latestVel},
          delta_repins_24h = ${latestDeltaRepins},
          updated_at = NOW()
        WHERE pin_id = ${pinId};
      `.catch((err) => { console.error(`[PinsRoute.reconcile] Failed updating keyword_serp_current for pin ${pinId}:`, err?.message || err); }),
      sql`
        UPDATE keyword_displaced_index
        SET
          save_count = ${latestSaves},
          repin_count = ${latestRepins},
          daily_save_velocity = ${latestVel},
          delta_repins_24h = ${latestDeltaRepins},
          updated_at = NOW()
        WHERE pin_id = ${pinId};
      `.catch((err) => { console.error(`[PinsRoute.reconcile] Failed updating keyword_displaced_index for pin ${pinId}:`, err?.message || err); })
    ]);
  } catch (err) {
    console.error(`[PinsRoute.reconcile] Snapshot delete reconciliation failed for pin ${pinId}:`, err?.message || err);
  }
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
  jsonResponse,
  methodNotAllowedResponse,
  buildCanonicalCacheKey,
  getCachedOrFetch,
  invalidateEdgeCache,
  safeWaitUntil,
  isValidPinId,
  redactSecrets
}) {
  const parts = pathname.slice('/api/pins/'.length).split('/').filter(Boolean);
  const pinId = parts[0];

  // 0. GET /api/pins/resolve-shortlink?url=...
  if (pinId === 'resolve-shortlink') {
    if (method !== 'GET') {
      return methodNotAllowedResponse('GET, OPTIONS');
    }
    const rawUrl = searchParams.get('url') || searchParams.get('shortlink') || searchParams.get('slug') || '';
    if (!rawUrl) {
      return jsonResponse({ ok: false, error: 'BAD_REQUEST', message: 'Missing url query parameter' }, 400);
    }
    const slugMatch = String(rawUrl).match(/pin\.it\/([a-zA-Z0-9_-]+)/i);
    const cleanSlug = slugMatch ? slugMatch[1] : String(rawUrl).replace(/^https?:\/\//i, '').replace(/^pin\.it\//i, '').split('/')[0].split('?')[0].trim();
    const kvKey = `shortlink:${cleanSlug || rawUrl}`;

    try {
      const res = await resolvePinterestShortlink(rawUrl);
      if (res && res.ok && res.pin_id) {
        return jsonResponse({
          ok: true,
          pin_id: res.pin_id,
          resolved_url: res.resolved_url
        }, 200, 2592000);
      }
      return jsonResponse({
        ok: false,
        pin_id: null,
        resolved_url: res?.resolved_url || '',
        error: res?.error || 'SHORTLINK_RESOLUTION_FAILED',
        message: 'Unable to resolve Pinterest shortlink'
      }, 404);
    } catch (err) {
      return jsonResponse({ ok: false, pin_id: null, error: err.message }, 500);
    }
  }

  // 1. DELETE /api/pins/:pin_id/snapshots/:snapshot_id
  if (parts[1] === 'snapshots') {
    if (method !== 'DELETE') {
      return methodNotAllowedResponse('DELETE, OPTIONS');
    }
    const rawSnapshotParam = decodeURIComponent(String(parts[2] || '').trim());
    const isDateParam = /^\d{4}-\d{2}-\d{2}$/.test(rawSnapshotParam);
    const isIntradayParam = rawSnapshotParam.startsWith('intra_');
    // [INVARIANT: 60-BIT-SNOWFLAKE-SAFE] Never cast 60-bit view IDs via Number() (exceeds 53-bit MAX_SAFE_INTEGER)
    const isNumericSnapshotId = /^[1-9]\d{0,19}$/.test(rawSnapshotParam);
    if (!isDateParam && !isNumericSnapshotId && !isIntradayParam) {
      return jsonResponse({
        success: false,
        error: 'BAD_REQUEST',
        message: 'Valid numeric snapshot_id, intraday checkpoint ID, or date (YYYY-MM-DD) is required'
      }, 400);
    }
    if (!pinId || !isValidPinId(pinId)) {
      return jsonResponse({
        success: false,
        error: 'INVALID_PIN_ID',
        message: 'Pin ID must be a valid identifier (numeric Snowflake, 10-30 digits)'
      }, 400);
    }
    if (isIntradayParam && sql) {
      await sql`
        UPDATE universal_master_pins
        SET metadata = jsonb_set(
          COALESCE(metadata, '{}'::jsonb),
          '{intraday_snapshots}',
          COALESCE((
            SELECT jsonb_agg(elem)
            FROM jsonb_array_elements(
              CASE WHEN jsonb_typeof(metadata->'intraday_snapshots') = 'array' THEN metadata->'intraday_snapshots' ELSE '[]'::jsonb END
            ) AS elem
            WHERE COALESCE(elem->>'id', '') <> ${rawSnapshotParam}
          ), '[]'::jsonb)
        ),
        updated_at = NOW()
        WHERE pin_id = ${pinId};
      `.catch((err) => { console.error(`[PinsRoute.DELETE snapshots] Intraday update failed for pin ${pinId}:`, err?.message || err); });
      await recordDeletedSnapshotTombstone({ sql, pinId, targetDate: rawSnapshotParam });
      await reconcilePinMetricsAfterSnapshotDelete({ sql, pinId });
      await invalidateEdgeCache(`pin:dossier?pin_id=${pinId}`);
      await invalidateEdgeCache(buildCanonicalCacheKey('pin:dossier', { pin_id: pinId }));
      await invalidateEdgeCache('keywords:pin-dossier');
      return jsonResponse({ success: true, deleted_snapshot: rawSnapshotParam, pin_id: pinId });
    }

    let targetDate = isDateParam ? rawSnapshotParam : null;
    let targetKwId = null;

    // 1. If numeric ID passed, resolve date and keyword from view
    if (!targetDate && sql) {
      const [snapRow] = await sql`
        SELECT snapshot_date, keyword_id FROM pins_daily_snapshots WHERE id = ${rawSnapshotParam}::bigint LIMIT 1;
      `.catch((err) => { console.error(`[PinsRoute.DELETE snapshots] Lookup failed for snapshot ${rawSnapshotParam}:`, err?.message || err); return []; });
      targetDate = snapRow?.snapshot_date ? new Date(snapRow.snapshot_date).toISOString().slice(0, 10) : null;
      targetKwId = snapRow?.keyword_id || null;
    }

    // Delete from base tables pin_serp_positions & pins_daily_metrics, NOT view
    if (targetDate && sql) {
      if (targetKwId) {
        await sql`
          DELETE FROM pin_serp_positions
          WHERE pin_id = ${pinId} AND snapshot_date = ${targetDate}::date AND keyword_id = ${targetKwId};
        `.catch((err) => { console.error(`[PinsRoute.DELETE snapshots] pin_serp_positions delete failed for pin ${pinId}:`, err?.message || err); });
        // [INVARIANT: PRESERVE-METRICS-IF-POSITIONS-REMAIN] Only prune metrics if zero positions remain (L-05)
        const [remaining] = await sql`
          SELECT COUNT(*)::int AS count FROM pin_serp_positions
          WHERE pin_id = ${pinId} AND snapshot_date = ${targetDate}::date;
        `.catch(() => [{ count: 0 }]);
        if (!remaining || remaining.count === 0) {
          await sql`
            DELETE FROM pins_daily_metrics
            WHERE pin_id = ${pinId} AND snapshot_date = ${targetDate}::date;
          `.catch((err) => { console.error(`[PinsRoute.DELETE snapshots] pins_daily_metrics delete failed for pin ${pinId}:`, err?.message || err); });
          await recordDeletedSnapshotTombstone({ sql, pinId, targetDate });
        }
      } else {
        await sql`
          DELETE FROM pin_serp_positions
          WHERE pin_id = ${pinId} AND snapshot_date = ${targetDate}::date;
        `.catch((err) => { console.error(`[PinsRoute.DELETE snapshots] Bulk pin_serp_positions delete failed for pin ${pinId}:`, err?.message || err); });
        await sql`
          DELETE FROM pins_daily_metrics
          WHERE pin_id = ${pinId} AND snapshot_date = ${targetDate}::date;
        `.catch((err) => { console.error(`[PinsRoute.DELETE snapshots] Bulk pins_daily_metrics delete failed for pin ${pinId}:`, err?.message || err); });
        await recordDeletedSnapshotTombstone({ sql, pinId, targetDate });
      }
      await reconcilePinMetricsAfterSnapshotDelete({ sql, pinId });
    }

    await invalidateEdgeCache(`pin:dossier?pin_id=${pinId}`);
    await invalidateEdgeCache(buildCanonicalCacheKey('pin:dossier', { pin_id: pinId }));
    await invalidateEdgeCache('keywords:pin-dossier');

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

    // Delete from positions table
    await sql`
      DELETE FROM pin_serp_positions
      WHERE pin_id = ${pinId} AND snapshot_date = ${snapshotDate}::date AND keyword_id = ${kwId};
    `.catch((err) => { console.error(`[PinsRoute.DELETE serp-positions] Failed deleting position for pin ${pinId}:`, err?.message || err); });

    // [INVARIANT: PRESERVE-METRICS-IF-POSITIONS-REMAIN] Only prune metrics if zero positions remain (L-05)
    const [remaining] = await sql`
      SELECT COUNT(*)::int AS count FROM pin_serp_positions
      WHERE pin_id = ${pinId} AND snapshot_date = ${snapshotDate}::date;
    `.catch(() => [{ count: 0 }]);
    if (!remaining || remaining.count === 0) {
      await sql`
        DELETE FROM pins_daily_metrics
        WHERE pin_id = ${pinId} AND snapshot_date = ${snapshotDate}::date;
      `.catch((err) => { console.error(`[PinsRoute.DELETE serp-positions] Failed pruning metrics for pin ${pinId}:`, err?.message || err); });
      await recordDeletedSnapshotTombstone({ sql, pinId, targetDate: snapshotDate });
      await reconcilePinMetricsAfterSnapshotDelete({ sql, pinId });
    }

    await invalidateEdgeCache(`pin:dossier?pin_id=${pinId}`);
    await invalidateEdgeCache(buildCanonicalCacheKey('pin:dossier', { pin_id: pinId }));
    await invalidateEdgeCache('keywords:pin-dossier');

    return jsonResponse({
      success: true,
      pin_id: pinId,
      keyword_id: kwId,
      snapshot_date: snapshotDate
    });
  }

  // 1B. DELETE /api/pins/:pin_id/daily-metrics/:date (Delete entire day's metrics or specific intraday checkpoint)
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
    const rawTarget = decodeURIComponent(String(parts[2] || searchParams.get('snapshot_date') || '').trim());
    const isIntradayTarget = rawTarget.startsWith('intra_');
    const isDateTarget = /^\d{4}-\d{2}-\d{2}$/.test(rawTarget);
    if (!isDateTarget && !isIntradayTarget) {
      return jsonResponse({
        success: false,
        error: 'BAD_REQUEST',
        message: 'Valid YYYY-MM-DD snapshot_date or intraday checkpoint ID is required in path (/api/pins/:pinId/daily-metrics/:target)'
      }, 400);
    }

    if (isIntradayTarget) {
      await sql`
        UPDATE universal_master_pins
        SET metadata = jsonb_set(
          COALESCE(metadata, '{}'::jsonb),
          '{intraday_snapshots}',
          COALESCE((
            SELECT jsonb_agg(elem)
            FROM jsonb_array_elements(
              CASE WHEN jsonb_typeof(metadata->'intraday_snapshots') = 'array' THEN metadata->'intraday_snapshots' ELSE '[]'::jsonb END
            ) AS elem
            WHERE COALESCE(elem->>'id', '') <> ${rawTarget}
          ), '[]'::jsonb)
        ),
        updated_at = NOW()
        WHERE pin_id = ${pinId};
      `.catch((err) => { console.error(`[PinsRoute.DELETE daily-metrics] Intraday update failed for pin ${pinId}:`, err?.message || err); });
      await recordDeletedSnapshotTombstone({ sql, pinId, targetDate: rawTarget });
      await reconcilePinMetricsAfterSnapshotDelete({ sql, pinId });
    } else {
      const snapshotDate = rawTarget;
      // Check if an earlier intraday checkpoint exists for this same date; if so, promote the latest intraday checkpoint into pins_daily_metrics
      const [umpRow] = await sql`
        SELECT metadata FROM universal_master_pins WHERE pin_id = ${pinId} LIMIT 1;
      `.catch(() => []);
      const intraArr = Array.isArray(umpRow?.metadata?.intraday_snapshots)
        ? umpRow.metadata.intraday_snapshots.filter(x => x && String(x.snapshot_date || '').slice(0, 10) === snapshotDate)
        : [];

      if (intraArr.length > 0) {
        // Sort descending by recorded_at and promote the latest intraday checkpoint
        intraArr.sort((a, b) => String(b.recorded_at || '').localeCompare(String(a.recorded_at || '')));
        const promoted = intraArr[0];
        const promotedId = String(promoted.id || '');
        await sql`
          UPDATE pins_daily_metrics
          SET
            save_count = ${Number(promoted.save_count || 0)},
            repin_count = ${Number(promoted.repin_count || 0)},
            comment_count = ${Number(promoted.comment_count || 0)},
            share_count = ${Number(promoted.share_count || 0)},
            updated_at = COALESCE(NULLIF(${String(promoted.recorded_at || '')}, '')::timestamptz, NOW())
          WHERE pin_id = ${pinId} AND snapshot_date = ${snapshotDate}::date;
        `.catch((err) => { console.error(`[PinsRoute.DELETE daily-metrics] Intraday promotion failed for pin ${pinId}:`, err?.message || err); });
        await sql`
          UPDATE universal_master_pins
          SET metadata = jsonb_set(
            COALESCE(metadata, '{}'::jsonb),
            '{intraday_snapshots}',
            COALESCE((
              SELECT jsonb_agg(elem)
              FROM jsonb_array_elements(
                CASE WHEN jsonb_typeof(metadata->'intraday_snapshots') = 'array' THEN metadata->'intraday_snapshots' ELSE '[]'::jsonb END
              ) AS elem
              WHERE COALESCE(elem->>'id', '') <> ${promotedId}
            ), '[]'::jsonb)
          ),
          updated_at = NOW()
          WHERE pin_id = ${pinId};
        `.catch((err) => { console.error(`[PinsRoute.DELETE daily-metrics] Intraday metadata prune failed for pin ${pinId}:`, err?.message || err); });
        await reconcilePinMetricsAfterSnapshotDelete({ sql, pinId });
      } else {
        // Delete metrics and positions for the entire date
        await sql`
          DELETE FROM pins_daily_metrics
          WHERE pin_id = ${pinId} AND snapshot_date = ${snapshotDate}::date;
        `.catch((err) => { console.error(`[PinsRoute.DELETE daily-metrics] pins_daily_metrics delete failed for pin ${pinId}:`, err?.message || err); });

        await sql`
          DELETE FROM pin_serp_positions
          WHERE pin_id = ${pinId} AND snapshot_date = ${snapshotDate}::date;
        `.catch((err) => { console.error(`[PinsRoute.DELETE daily-metrics] pin_serp_positions delete failed for pin ${pinId}:`, err?.message || err); });

        await recordDeletedSnapshotTombstone({ sql, pinId, targetDate: snapshotDate });
        await reconcilePinMetricsAfterSnapshotDelete({ sql, pinId });
      }
    }

    await invalidateEdgeCache(`pin:dossier?pin_id=${pinId}`);
    await invalidateEdgeCache(buildCanonicalCacheKey('pin:dossier', { pin_id: pinId }));
    await invalidateEdgeCache('keywords:pin-dossier');

    return jsonResponse({
      success: true,
      pin_id: pinId,
      snapshot_date: rawTarget
    });
  }

  // 2. POST /api/pins/:pin_id/sync (Live Pinterest Deep Sync with 48 Algorithmic Fields)
  if (parts[1] === 'sync') {
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
        sql,
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
      // Cascade delete across unified PostgreSQL tables
      await sql`DELETE FROM universal_master_pins WHERE pin_id = ${pinId};`.catch((err) => { console.error(`[PinsRoute.DELETE pin] universal_master_pins delete failed for ${pinId}:`, err?.message || err); });
      await sql`DELETE FROM pins_daily_metrics WHERE pin_id = ${pinId};`.catch((err) => { console.error(`[PinsRoute.DELETE pin] pins_daily_metrics delete failed for ${pinId}:`, err?.message || err); });
      await sql`DELETE FROM pin_serp_positions WHERE pin_id = ${pinId};`.catch((err) => { console.error(`[PinsRoute.DELETE pin] pin_serp_positions delete failed for ${pinId}:`, err?.message || err); });
      await sql`DELETE FROM keyword_serp_current WHERE pin_id = ${pinId};`.catch((err) => { console.error(`[PinsRoute.DELETE pin] keyword_serp_current delete failed for ${pinId}:`, err?.message || err); });
      await sql`DELETE FROM keyword_displaced_index WHERE pin_id = ${pinId};`.catch((err) => { console.error(`[PinsRoute.DELETE pin] keyword_displaced_index delete failed for ${pinId}:`, err?.message || err); });
      await sql`DELETE FROM competitor_pins WHERE pin_id = ${pinId};`.catch((err) => { console.error(`[PinsRoute.DELETE pin] competitor_pins delete failed for ${pinId}:`, err?.message || err); });
      await sql`DELETE FROM pa_pins WHERE pin_id = ${pinId};`.catch((err) => { console.error(`[PinsRoute.DELETE pin] pa_pins delete failed for ${pinId}:`, err?.message || err); });

      // Invalidate Edge Caches synchronously
      await invalidateEdgeCache(`pin:dossier?pin_id=${pinId}`);
      await invalidateEdgeCache(buildCanonicalCacheKey('pin:dossier', { pin_id: pinId }));
      await invalidateEdgeCache(`pin:trajectory?pin_id=${pinId}`);
      await invalidateEdgeCache('keywords:pin-dossier');

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
      const forceRefresh = searchParams.get('refresh') === 'true';
      const dossierCacheKey = buildCanonicalCacheKey('pin:dossier', { pin_id: pinId });
      if (forceRefresh) {
        await invalidateEdgeCache(dossierCacheKey);
      }

      // [INVARIANT: DIRECT-POSTGRES-READ] Always fetch live PostgreSQL data directly (pure read-only SSOT)
      const dossier = await fetchUniversalPinDossier({ sql, pinId, ctx, env, bypassEdgeCache: true });
      if (dossier && !dossier.first_saved_at && dossier.creative) {
        dossier.first_saved_at = dossier.creative.first_saved_at || dossier.creative.first_discovered_at || null;
        dossier.last_resaved_at = dossier.creative.last_resaved_at || dossier.creative.updated_at || null;
      } else if (!dossier?.creative && searchParams.get('repo_fallback') === 'true') {
        const repoReadDossier = await getPinDossier(sql, pinId).catch(() => null);
        if (dossier && repoReadDossier?.creative) {
          dossier.first_saved_at = repoReadDossier.creative.first_saved_at || null;
          dossier.last_resaved_at = repoReadDossier.creative.last_resaved_at || null;
        }
      }

      // Cache poisoning guard: If dossier failed, has 0 snapshots, or is degraded, invalidate cache
      if (
        !dossier?.success ||
        (!dossier?.daily_trajectory?.length && !dossier?.snapshots?.length) ||
        dossier?.is_degraded
      ) {
        invalidateEdgeCache(dossierCacheKey);
      }

      // [INVARIANT: SCALE-TO-ZERO & NO-BACKGROUND-HOVER-SCRAPE]
      // Background live Pinterest scrape (bgEnrichPromise) is strictly removed from simple GET reads.
      // Live scraping & DB writes are isolated to explicit POST /api/pins/:id/sync or refresh=true.

      if (!dossier || !dossier.pin_id || !dossier.success) {
        invalidateEdgeCache(dossierCacheKey);
        const isUnavailable = dossier?.error === 'DB_UNAVAILABLE' || dossier?.circuit_broken || dossier?.is_degraded;
        return jsonResponse({
          success: false,
          error: isUnavailable ? 'DB_UNAVAILABLE' : 'NOT_FOUND',
          message: dossier?.message || (isUnavailable ? 'Pin database is temporarily unavailable. Please retry.' : `Pin dossier not found for pin_id: ${pinId}`)
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
