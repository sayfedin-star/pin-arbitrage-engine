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
  syncPinAcrossAllFourPillars
} from '../modules/pins/repository.mjs';

import { fetchPinFromPinterest, fetchPinFromPinResource, resolvePinterestShortlink } from '../core/pinterest/index.mjs';
import { ignoreAndRemoveSerpPin } from '../modules/keywords/service.mjs';
import { detectHydrationJump, isRepinHydrationJump, calculateDailyVelocity } from '../lib/math.mjs';
import { fetchPinAnnotationsIntel } from '../modules/pins/annotations-intel.mjs';

// Record deleted date in universal_master_pins
export async function recordDeletedSnapshotTombstone({ sql, pinId, targetDate }) {
  if (!sql || !targetDate) return;
  await sql`
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
  `;
}

/**
 * Reconciles a pin's bridged daily_save_velocity, daily_repin_velocity, save_count, and repin_count across
 * pins_daily_metrics and universal_master_pins after any snapshot deletion.
 */
export async function reconcilePinMetricsAfterSnapshotDelete({ sql, pinId }) {
  if (!sql || !pinId) return;
  const remainingRows = await sql`
    SELECT recorded_date, save_count, repin_count, comment_count, share_count, daily_save_velocity, daily_repin_velocity
    FROM pins_daily_metrics
    WHERE pin_id = ${pinId}
    ORDER BY recorded_date DESC
    LIMIT 30;
  `;

  if (!Array.isArray(remainingRows) || remainingRows.length === 0) {
    await sql`
      UPDATE universal_master_pins
      SET
        is_hydrated = FALSE,
        save_count = NULL,
        repin_count = NULL,
        daily_save_velocity = NULL,
        daily_repin_velocity = NULL,
        delta_saves_24h = NULL,
        delta_repins_24h = NULL,
        updated_at = NOW()
      WHERE pin_id = ${pinId};
    `;
    return;
  }

  // Chronological order (oldest -> newest) to recalculate bridged velocities
  const toDateKey = (val) => (val instanceof Date ? val.toISOString().slice(0, 10) : String(val || '').slice(0, 10));
  const chrono = [...remainingRows].sort((a, b) => toDateKey(a.recorded_date).localeCompare(toDateKey(b.recorded_date)));
  const updateBatch = [];
  for (let i = 0; i < chrono.length; i++) {
    const curr = chrono[i];
    const currDateStr = curr.recorded_date instanceof Date
      ? curr.recorded_date.toISOString().slice(0, 10)
      : String(curr.recorded_date).slice(0, 10);
    let newSaveVel = null;
    let newRepinVel = null;
    if (i > 0) {
      let prev = null;
      for (let j = i - 1; j >= 0; j--) {
        if (chrono[j].save_count !== null) {
          prev = chrono[j];
          break;
        }
      }
      if (prev) {
        const prevDateStr = prev.recorded_date instanceof Date
          ? prev.recorded_date.toISOString().slice(0, 10)
          : String(prev.recorded_date).slice(0, 10);
        const daysDiff = Math.max(1, Math.round((new Date(currDateStr) - new Date(prevDateStr)) / 86400000));
        const isSaveJump = curr.save_count !== null && detectHydrationJump(prev, curr);
        if (curr.save_count !== null) {
          newSaveVel = isSaveJump
            ? 0
            : calculateDailyVelocity({
                currentSaves: Number(curr.save_count),
                baselineSaves: Number(prev.save_count),
                currentRepins: Number(curr.repin_count ?? 0),
                baselineRepins: Number(prev.repin_count ?? 0),
                currentDate: currDateStr,
                baselineDate: prevDateStr,
                maxCap: 25000
              });
        }
        if (curr.repin_count !== null && prev.repin_count !== null) {
          if (isSaveJump || isRepinHydrationJump(prev, curr)) {
            newRepinVel = 0;
          } else {
            const repinsDiff = Math.max(0, Number(curr.repin_count) - Number(prev.repin_count));
            newRepinVel = Math.min(25000, Math.round((repinsDiff / daysDiff) * 10) / 10);
          }
        }
      }
    }
    curr.recomputed_save_velocity = newSaveVel;
    curr.recomputed_repin_velocity = newRepinVel;
    updateBatch.push({
      recorded_date: currDateStr,
      daily_save_velocity: newSaveVel,
      daily_repin_velocity: newRepinVel
    });
  }

  if (updateBatch.length > 0) {
    await sql`
      UPDATE pins_daily_metrics pdm
      SET
        daily_save_velocity = u.daily_save_velocity,
        daily_repin_velocity = u.daily_repin_velocity
      FROM jsonb_to_recordset(${JSON.stringify(updateBatch)}::jsonb) AS u(
        recorded_date date,
        daily_save_velocity numeric,
        daily_repin_velocity numeric
      )
      WHERE pdm.pin_id = ${pinId} AND pdm.recorded_date = u.recorded_date;
    `;
  }

  const latest = chrono[chrono.length - 1];
  const latestSaves = latest.save_count !== null ? Number(latest.save_count) : null;
  const latestRepins = latest.repin_count !== null ? Number(latest.repin_count) : null;
  const latestSaveVel = latest.recomputed_save_velocity;
  const latestRepinVel = latest.recomputed_repin_velocity;
  const latestDeltaSaves = latestSaveVel !== null ? Math.round(latestSaveVel) : null;
  const latestDeltaRepins = latestRepinVel !== null ? Math.round(latestRepinVel) : null;

  await sql`
    UPDATE universal_master_pins
    SET
      save_count = ${latestSaves},
      repin_count = ${latestRepins},
      daily_save_velocity = ${latestSaveVel},
      daily_repin_velocity = ${latestRepinVel},
      delta_saves_24h = ${latestDeltaSaves},
      delta_repins_24h = ${latestDeltaRepins},
      updated_at = NOW()
    WHERE pin_id = ${pinId};
  `;
}

/**
 * Unified snapshot/checkpoint deletion helper across /api/pins/* and /api/creators/pin-snapshot.
 * Handles both intraday checkpoints (intra_ / intraday_ IDs) and YYYY-MM-DD daily snapshots
 * with intraday promotion, deleted_snapshot_dates tombstones, and metric reconciliation.
 */
export async function deletePinSnapshotByTarget({
  sql,
  pinId,
  rawTarget,
  fallbackDate = null,
  throwOnError = false,
  deleteDailyMetricsRow = null
}) {
  const target = decodeURIComponent(String(rawTarget || '').trim());
  if (!target) {
    return {
      ok: false,
      status: 400,
      error: 'BAD_REQUEST',
      message: 'Valid YYYY-MM-DD snapshot date or intraday checkpoint ID is required'
    };
  }

  const runInTx = async (fn) => (typeof sql?.begin === 'function' ? sql.begin(fn) : fn(sql));
  const isIntradayTarget = target.startsWith('intra_') || target.startsWith('intraday_');
  if (isIntradayTarget) {
    if (sql) {
      try {
        await runInTx(async (tx) => {
          await tx`
            UPDATE universal_master_pins
            SET metadata = jsonb_set(
              COALESCE(metadata, '{}'::jsonb),
              '{intraday_snapshots}',
              COALESCE((
                SELECT jsonb_agg(elem)
                FROM jsonb_array_elements(
                  CASE WHEN jsonb_typeof(metadata->'intraday_snapshots') = 'array' THEN metadata->'intraday_snapshots' ELSE '[]'::jsonb END
                ) AS elem
                WHERE COALESCE(elem->>'id', '') <> ${target}
              ), '[]'::jsonb)
            ),
            updated_at = NOW()
            WHERE pin_id = ${pinId};
          `;
          await recordDeletedSnapshotTombstone({ sql: tx, pinId, targetDate: target });
          await reconcilePinMetricsAfterSnapshotDelete({ sql: tx, pinId });
        });
      } catch (err) {
        console.error(`[PinsRoute.deleteSnapshot] Intraday delete failed for pin ${pinId}:`, err?.message || err);
        if (throwOnError) throw err;
      }
    }
    return { ok: true, mode: 'intraday', deletedTarget: target, deletedDate: null };
  }

  const dateCandidate = /^\d{4}-\d{2}-\d{2}$/.test(target)
    ? target
    : (fallbackDate && /^\d{4}-\d{2}-\d{2}$/.test(String(fallbackDate).trim()) ? String(fallbackDate).trim() : null);

  if (!dateCandidate) {
    return {
      ok: false,
      status: 400,
      error: 'BAD_REQUEST',
      message: 'Valid YYYY-MM-DD snapshot_date or intraday checkpoint ID is required'
    };
  }

  const parsedDate = new Date(`${dateCandidate}T00:00:00.000Z`);
  if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== dateCandidate) {
    return {
      ok: false,
      status: 400,
      error: 'BAD_REQUEST',
      message: 'Valid YYYY-MM-DD snapshot date is required'
    };
  }

  if (sql) {
    try {
      await runInTx(async (tx) => {
        const [umpRow] = await tx`
          SELECT metadata FROM universal_master_pins WHERE pin_id = ${pinId} LIMIT 1;
        `;
        const intraArr = Array.isArray(umpRow?.metadata?.intraday_snapshots)
          ? umpRow.metadata.intraday_snapshots.filter(x => x && String(x.snapshot_date || '').slice(0, 10) === dateCandidate)
          : [];

        if (intraArr.length > 0) {
          intraArr.sort((a, b) => String(b.recorded_at || '').localeCompare(String(a.recorded_at || '')));
          const promoted = intraArr[0];
          const promotedId = String(promoted.id || '');
          const parseNullablePromoMetric = (val) => {
            if (val === null || val === undefined || val === '') return null;
            const n = Number(val);
            return Number.isFinite(n) ? Math.max(0, n) : null;
          };
          const promoSaves = parseNullablePromoMetric(promoted.save_count);
          const promoRepins = parseNullablePromoMetric(promoted.repin_count);
          const promoComments = parseNullablePromoMetric(promoted.comment_count);
          const promoShares = parseNullablePromoMetric(promoted.share_count);
          await tx`
            UPDATE pins_daily_metrics
            SET
              save_count = ${promoSaves},
              repin_count = ${promoRepins},
              comment_count = ${promoComments},
              share_count = ${promoShares},
              updated_at = COALESCE(NULLIF(${String(promoted.recorded_at || '')}, '')::timestamptz, NOW())
            WHERE pin_id = ${pinId} AND recorded_date = ${dateCandidate}::date;
          `;
          await tx`
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
          `;
          await reconcilePinMetricsAfterSnapshotDelete({ sql: tx, pinId });
        } else {
          if (typeof deleteDailyMetricsRow === 'function') {
            await deleteDailyMetricsRow(tx);
          } else {
            await tx`
              DELETE FROM pins_daily_metrics
              WHERE pin_id = ${pinId} AND recorded_date = ${dateCandidate}::date;
            `;
          }
          await recordDeletedSnapshotTombstone({ sql: tx, pinId, targetDate: dateCandidate });
          await reconcilePinMetricsAfterSnapshotDelete({ sql: tx, pinId });
        }
      });
    } catch (err) {
      console.error(`[PinsRoute.deleteSnapshot] Daily delete failed for pin ${pinId}:`, err?.message || err);
      if (throwOnError) throw err;
    }
  }

  return { ok: true, mode: 'daily', deletedTarget: target, deletedDate: dateCandidate };
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
    const isIntradayParam = rawSnapshotParam.startsWith('intra_') || rawSnapshotParam.startsWith('intraday_');
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
    if (isIntradayParam) {
      await deletePinSnapshotByTarget({ sql, pinId, rawTarget: rawSnapshotParam });
      await invalidateEdgeCache(`pin:dossier?pin_id=${pinId}`);
      await invalidateEdgeCache(buildCanonicalCacheKey('pin:dossier', { pin_id: pinId }));
      await invalidateEdgeCache('keywords:pin-dossier');
      return jsonResponse({ success: true, deleted_snapshot: rawSnapshotParam, pin_id: pinId });
    }

    const queryDate = searchParams?.get('date');
    const targetDate = isDateParam ? rawSnapshotParam : (queryDate && /^\d{4}-\d{2}-\d{2}$/.test(queryDate) ? queryDate : null);

    if (!targetDate) {
      return jsonResponse({
        success: false,
        error: 'BAD_REQUEST',
        message: 'Could not resolve snapshot date. When snapshot_id is numeric, pass ?date=YYYY-MM-DD or provide snapshot_id as YYYY-MM-DD.'
      }, 400);
    }

    const delRes = await deletePinSnapshotByTarget({
      sql,
      pinId,
      rawTarget: targetDate,
      deleteDailyMetricsRow: async (txSql = sql) => {
        await txSql`
          DELETE FROM pins_daily_metrics
          WHERE pin_id = ${pinId} AND recorded_date = ${targetDate}::date;
        `;
      }
    });
    if (!delRes.ok) {
      return jsonResponse({ success: false, error: delRes.error, message: delRes.message }, delRes.status || 400);
    }

    await invalidateEdgeCache(`pin:dossier?pin_id=${pinId}`);
    await invalidateEdgeCache(buildCanonicalCacheKey('pin:dossier', { pin_id: pinId }));
    await invalidateEdgeCache('keywords:pin-dossier');

    return jsonResponse({ success: true, deleted_snapshot: rawSnapshotParam, pin_id: pinId });
  }

  // 1A. DELETE /api/pins/:pin_id/serp-positions (Delete specific SERP position for a keyword)
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

    if (!kwId || isNaN(kwId)) {
      return jsonResponse({
        success: false,
        error: 'BAD_REQUEST',
        message: 'Valid numeric keyword_id is required'
      }, 400);
    }

    // Tombstone in keyword_ignored_pins and delete from keyword_serp_positions
    await ignoreAndRemoveSerpPin(sql, {
      keywordId: kwId,
      pinId,
      reason: 'manual_user_deletion'
    }).catch((err) => { console.error(`[PinsRoute.DELETE serp-positions] Failed deleting position for pin ${pinId}:`, err?.message || err); });

    await invalidateEdgeCache(`pin:dossier?pin_id=${pinId}`);
    await invalidateEdgeCache(buildCanonicalCacheKey('pin:dossier', { pin_id: pinId }));
    await invalidateEdgeCache('keywords:pin-dossier');
    await invalidateEdgeCache('keywords');
    await invalidateEdgeCache('folders');

    return jsonResponse({
      success: true,
      pin_id: pinId,
      keyword_id: kwId
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
    const delRes = await deletePinSnapshotByTarget({ sql, pinId, rawTarget });
    if (!delRes.ok) {
      return jsonResponse({
        success: false,
        error: 'BAD_REQUEST',
        message: 'Valid YYYY-MM-DD snapshot_date or intraday checkpoint ID is required in path (/api/pins/:pinId/daily-metrics/:target)'
      }, 400);
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
      // If SSR HTML omitted pin_join.annotations_with_links, pull detailed PinResource (~90ms) so Live Deep Sync captures linked /ideas/ annotations
      if (!pinResult.pin.has_linked_annotations && /^\d{10,25}$/.test(pinId)) {
        try {
          const resourcePin = await fetchPinFromPinResource(pinId);
          if (resourcePin && Array.isArray(resourcePin.annotations) && resourcePin.annotations.length > 0 && (resourcePin.has_linked_annotations || !Array.isArray(pinResult.pin.annotations) || pinResult.pin.annotations.length === 0)) {
            pinResult.pin.annotations = resourcePin.annotations;
            pinResult.pin.tags = resourcePin.tags || resourcePin.annotations.map(a => a?.name).filter(Boolean);
            pinResult.pin.annotations_with_links = resourcePin.annotations_with_links || [];
            pinResult.pin.has_linked_annotations = Boolean(resourcePin.has_linked_annotations);
          }
        } catch (_) {}
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

  // 2B. GET /api/pins/:pin_id/annotations-intel (Lazy-Loaded On-Demand Annotations Volume & Taxonomy)
  if (parts[1] === 'annotations-intel' && parts.length === 2) {
    if (method !== 'GET') {
      return methodNotAllowedResponse('GET, OPTIONS');
    }
    if (!pinId || !isValidPinId(pinId)) {
      return jsonResponse({
        success: false,
        error: 'INVALID_PIN_ID',
        message: 'Pin ID must be a valid identifier (numeric Snowflake, 10-30 digits)'
      }, 400, 0);
    }
    try {
      const force = searchParams.get('refresh') === 'true' || searchParams.get('force') === 'true';
      const result = await fetchPinAnnotationsIntel({
        sql,
        pinId,
        force,
        concurrency: 4,
        maxItems: 15,
        ...(typeof env?.FETCH_INTEREST_VOLUME === 'function' ? { fetchInterestFn: env.FETCH_INTEREST_VOLUME } : {})
      });
      if (!result.found) {
        return jsonResponse({
          success: false,
          error: 'NOT_FOUND',
          message: `Pin not found for pin_id: ${pinId}`,
          pin_id: pinId
        }, 404, 0);
      }
      return jsonResponse(result.payload, 200, 0);
    } catch (err) {
      return jsonResponse({
        success: false,
        error: 'ANNOTATIONS_INTEL_ERROR',
        message: redactSecrets ? redactSecrets(err.message) : err.message,
        pin_id: pinId
      }, 500, 0);
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
      // Cascade delete across unified PostgreSQL tables atomically
      const runInTx = async (fn) => (typeof sql?.begin === 'function' ? sql.begin(fn) : fn(sql));
      try {
        await runInTx(async (tx) => {
          await tx`DELETE FROM universal_master_pins WHERE pin_id = ${pinId};`;
          await tx`DELETE FROM pins_daily_metrics WHERE pin_id = ${pinId};`;
          await tx`DELETE FROM keyword_serp_positions WHERE pin_id = ${pinId};`;
          await tx`DELETE FROM competitor_board_pins WHERE pin_id = ${pinId};`;
          await tx`DELETE FROM keyword_ignored_pins WHERE pin_id = ${pinId};`;
          await tx`DELETE FROM candidate_graph_nodes WHERE candidate_pin_id = ${pinId} OR seed_pin_id = ${pinId};`;
          await tx`DELETE FROM competitor_related_nodes WHERE candidate_pin_id = ${pinId} OR seed_pin_id = ${pinId};`;
          await tx`DELETE FROM competitor_seed_pins WHERE pin_id = ${pinId};`;
          await tx`DELETE FROM cluster_seeds WHERE pin_id = ${pinId};`;
        });
      } catch (err) {
        console.error(`[PinsRoute.DELETE pin] atomic cascade delete failed for ${pinId}:`, err?.message || err);
        return jsonResponse({
          success: false,
          error: 'PIN_DELETE_FAILED',
          message: redactSecrets ? redactSecrets(err?.message || String(err)) : (err?.message || String(err))
        }, 500);
      }

      // Invalidate Edge Caches synchronously
      await invalidateEdgeCache(`pin:dossier?pin_id=${pinId}`);
      await invalidateEdgeCache(buildCanonicalCacheKey('pin:dossier', { pin_id: pinId }));
      await invalidateEdgeCache(`pin:trajectory?pin_id=${pinId}`);
      await invalidateEdgeCache('keywords:pin-dossier');
      await invalidateEdgeCache('keywords');
      await invalidateEdgeCache('folders');
      await invalidateEdgeCache('domains:leaderboard');
      await invalidateEdgeCache('creators');
      await invalidateEdgeCache('competitors');

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
