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
  resolveShardConnection
} from '../modules/sharding/fleet-router.mjs';

import { fetchPinFromPinterest } from '../../scripts/lib/pinterest.mjs';
import { calculateDailyVelocity } from '../lib/math.mjs';

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
    const snapshotId = Number(rawSnapshotParam);
    if (!isDateParam && (!snapshotId || isNaN(snapshotId))) {
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
        SELECT snapshot_date, keyword_id FROM pins_daily_snapshots WHERE id = ${snapshotId} LIMIT 1;
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
      } else {
        await shardSql`
          DELETE FROM pin_serp_positions
          WHERE pin_id = ${pinId} AND snapshot_date = ${targetDate}::date;
        `.catch(() => {});
      }
      await shardSql`
        DELETE FROM pins_daily_metrics
        WHERE pin_id = ${pinId} AND snapshot_date = ${targetDate}::date;
      `.catch(() => {});
    }

    await invalidateEdgeCache(`pin:dossier?pin_id=${pinId}`);
    await invalidateEdgeCache(buildCanonicalCacheKey('pin:dossier', { pin_id: pinId }));
    if (env?.PIN_ENGINE_KV) {
      const evictions = getPinKvKeysToEvict(pinId, targetKwId ? [targetKwId] : []).map(k => env.PIN_ENGINE_KV.delete(k).catch(() => {}));
      safeWaitUntil(ctx, Promise.all(evictions), `kv_delete_snapshot_${rawSnapshotParam}`);
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

    invalidateEdgeCache(`pin:dossier?pin_id=${pinId}`);
    if (env?.PIN_ENGINE_KV) {
      const evictions = getPinKvKeysToEvict(pinId, [kwId]).map(k => env.PIN_ENGINE_KV.delete(k).catch(() => {}));
      safeWaitUntil(ctx, Promise.all(evictions), `kv_delete_serp_${pinId}_${kwId}`);
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

    invalidateEdgeCache(`pin:dossier?pin_id=${pinId}`);
    if (env?.PIN_ENGINE_KV) {
      const evictions = getPinKvKeysToEvict(pinId).map(k => env.PIN_ENGINE_KV.delete(k).catch(() => {}));
      safeWaitUntil(ctx, Promise.all(evictions), `kv_delete_daily_metrics_${pinId}`);
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
      const pin = pinResult.pin;
      const shardId = getPinShardId(pinId, 99);
      const shardSql = await resolveShardConnection({ hubSql: sql, shardId, env }).catch(() => targetSql);

      const rawMetaToStore = {
        alt_text: pin.alt_text || pin.seo_title || '',
        description: pin.description || '',
        board_name: pin.board_name || '',
        creation_method: pin.creation_method || pin.method || 'pinterest_platform',
        created_at_pinterest: pin.created_at_pinterest || pin.created_at || '',
        is_repin: Boolean(pin.is_repin),
        origin_pinner: pin.origin_pinner || null,
        domain_official_user: pin.domain_official_user || null,
        creator_is_verified_merchant: Boolean(pin.creator_is_verified_merchant),
        has_affiliate_redirect: Boolean(pin.has_affiliate_redirect || pin.affiliate_link || pin.is_affiliate),
        affiliate_networks: Array.isArray(pin.affiliate_networks) ? pin.affiliate_networks : [],
        utm_source: pin.utm_source || null,
        utm_medium: pin.utm_medium || null,
        utm_campaign: pin.utm_campaign || null,
        utm_content: pin.utm_content || null,
        is_fresh_angle: Boolean(pin.is_fresh_angle),
        closeupUnifiedAttribution: pin.closeupUnifiedAttribution || null,
        closeup_attribution: pin.closeup_attribution || null,
        link_domain: pin.link_domain || null,
        shopping_flags: Array.isArray(pin.shopping_flags) ? pin.shopping_flags : []
      };

      const metaToStore = {};
      for (const [k, v] of Object.entries(rawMetaToStore)) {
        if (v === null || v === undefined || v === '') continue;
        if (Array.isArray(v) && v.length === 0) continue;
        if (typeof v === 'object' && Object.keys(v).length === 0) continue;
        metaToStore[k] = v;
      }

      const cleanCreatedAtIso = (() => {
        const rawDate = pin.created_at_pinterest || pin.created_at;
        if (!rawDate) return null;
        const d = new Date(rawDate);
        return isNaN(d.getTime()) ? null : d.toISOString();
      })();

      const newSaves = Number(pin.saves || 0);

      // A. Master pin record on target shard (universal_master_pins)
      await shardSql`
        INSERT INTO universal_master_pins (
          pin_id, creator_username, board_name, title, domain, destination_url,
          image_url, description, alt_text, dominant_color, visual_annotations,
          created_at_pinterest, metadata,
          first_discovered_pillar, first_discovered_at, updated_at
        ) VALUES (
          ${pinId},
          ${pin.creator_username || pin.pinner_username || ''},
          ${pin.board_name || ''},
          ${pin.title || ''},
          ${pin.domain || ''},
          ${pin.link || ''},
          ${pin.image_url || ''},
          ${pin.description || ''},
          ${pin.alt_text || pin.seo_title || ''},
          ${pin.dominant_color || '#888888'},
          ${JSON.stringify(pin.annotations?.map(a => a.name) || pin.visual_style_tags || [])}::jsonb,
          ${cleanCreatedAtIso}::timestamptz,
          ${JSON.stringify(metaToStore)}::jsonb,
          'live_sync',
          NOW(),
          NOW()
        )
        ON CONFLICT (pin_id) DO UPDATE SET
          creator_username = COALESCE(NULLIF(EXCLUDED.creator_username, ''), universal_master_pins.creator_username),
          board_name = COALESCE(NULLIF(EXCLUDED.board_name, ''), universal_master_pins.board_name),
          title = COALESCE(NULLIF(EXCLUDED.title, ''), universal_master_pins.title),
          domain = COALESCE(NULLIF(EXCLUDED.domain, ''), universal_master_pins.domain),
          destination_url = COALESCE(NULLIF(EXCLUDED.destination_url, ''), universal_master_pins.destination_url),
          image_url = COALESCE(NULLIF(EXCLUDED.image_url, ''), universal_master_pins.image_url),
          description = COALESCE(NULLIF(EXCLUDED.description, ''), universal_master_pins.description),
          alt_text = COALESCE(NULLIF(EXCLUDED.alt_text, ''), universal_master_pins.alt_text),
          dominant_color = COALESCE(NULLIF(EXCLUDED.dominant_color, ''), universal_master_pins.dominant_color),
          visual_annotations = CASE 
            WHEN jsonb_typeof(EXCLUDED.visual_annotations) = 'array' AND jsonb_array_length(EXCLUDED.visual_annotations) > 0 
            THEN EXCLUDED.visual_annotations 
            ELSE universal_master_pins.visual_annotations 
          END,
          created_at_pinterest = COALESCE(EXCLUDED.created_at_pinterest, universal_master_pins.created_at_pinterest),
          metadata = universal_master_pins.metadata || EXCLUDED.metadata,
          updated_at = NOW();
      `;

      // B. Update Central Hub (Active SERP rankings in keyword_serp_current)
      const targetRows = await sql`
        SELECT keyword_id, rank_position, catalog_rank, is_displaced, saves as current_saves, crawled_at, pin_created_at
        FROM keyword_serp_current
        WHERE pin_id = ${pinId};
      `;

      const pinCreatedAtVal = targetRows[0]?.pin_created_at || pin.created_at_pinterest || pin.created_at || null;
      const syncVelocity = calculateDailyVelocity(newSaves, pinCreatedAtVal);

      if (targetRows.length > 0) {
        await sql`
          UPDATE keyword_serp_current
          SET
            title = ${pin.title || ''},
            description = ${pin.description || ''},
            link = ${pin.link || ''},
            domain = ${pin.domain || ''},
            image_url = ${pin.image_url || ''},
            saves = GREATEST(saves, ${newSaves}),
            repins = GREATEST(repins, ${Number(pin.repins || 0)}),
            comments = GREATEST(comments, ${Number(pin.comments || 0)}),
            is_product = ${Boolean(pin.is_product)},
            price_value = ${pin.price_value != null ? Number(pin.price_value) : null},
            price_currency = ${pin.price_currency || null},
            pinner_username = ${pin.pinner_username || null},
            pinner_follower_count = ${pin.pinner_follower_count != null ? Number(pin.pinner_follower_count) : null},
            alt_text = ${pin.alt_text || ''},
            raw_metadata = ${JSON.stringify(rawMetaToStore)}::jsonb,
            daily_save_velocity = ${syncVelocity},
            crawled_at = NOW()
          WHERE pin_id = ${pinId};
        `;
      }

      // C. Update Competitor Profile Pins & PinArchive on Central Hub if present
      await sql`
        UPDATE competitor_pins
        SET
          title = ${pin.title || ''},
          domain = ${pin.domain || ''},
          saves = GREATEST(saves, ${newSaves}),
          repins = GREATEST(repins, ${Number(pin.repins || 0)}),
          comments = GREATEST(comments, ${Number(pin.comments || 0)}),
          image_url = ${pin.image_url || ''},
          raw_metadata = ${JSON.stringify(rawMetaToStore)}::jsonb,
          updated_at = NOW()
        WHERE pin_id = ${pinId};
      `.catch(() => {});

      await sql`
        UPDATE pa_pins
        SET
          title = ${pin.title || ''},
          domain = ${pin.domain || ''},
          saves = GREATEST(saves, ${newSaves}),
          repins = GREATEST(repins, ${Number(pin.repins || 0)}),
          comments = GREATEST(comments, ${Number(pin.comments || 0)}),
          image_url = ${pin.image_url || ''},
          metadata = ${JSON.stringify(rawMetaToStore)}::jsonb,
          last_crawled_at = NOW()
        WHERE pin_id = ${pinId};
      `.catch(() => {});

      // [INVARIANT: TWO-TIER-MODERN-SHARDING] Update pin_serp_positions
      if (targetRows.length > 0) {
        for (const row of targetRows) {
          const shardKid = row.keyword_id;
          if (shardKid != null) {
            await shardSql`
              INSERT INTO pin_serp_positions (
                pin_id, snapshot_date, keyword_id, rank_position, is_displaced, last_known_rank, catalog_rank, updated_at
              ) VALUES (
                ${pinId}, (NOW() AT TIME ZONE 'UTC')::date, ${shardKid},
                ${row.is_displaced ? null : row.rank_position},
                ${Boolean(row.is_displaced)}, ${row.rank_position || row.catalog_rank || null},
                ${row.catalog_rank || null}, NOW()
              )
              ON CONFLICT (pin_id, snapshot_date, keyword_id) DO UPDATE SET
                rank_position = CASE WHEN EXCLUDED.is_displaced = TRUE THEN NULL ELSE EXCLUDED.rank_position END,
                is_displaced = COALESCE(EXCLUDED.is_displaced, FALSE),
                last_known_rank = COALESCE(EXCLUDED.last_known_rank, pin_serp_positions.last_known_rank),
                catalog_rank = COALESCE(EXCLUDED.catalog_rank, pin_serp_positions.catalog_rank),
                updated_at = NOW();
            `.catch(() => {});
          }
        }
      }

      const totalReactions = Number(
        pin.total_reaction_count ??
        (pin.reactions && typeof pin.reactions === 'object'
          ? Object.values(pin.reactions).reduce((acc, v) => acc + (Number(v) || 0), 0)
          : 0)
      );

      // Update two-tier modern shard tables (pins_daily_metrics)
      await shardSql`
        INSERT INTO pins_daily_metrics (
          pin_id, snapshot_date, save_count, repin_count, comment_count, share_count, reaction_count, daily_save_velocity, updated_at
        ) VALUES (
          ${pinId}, (NOW() AT TIME ZONE 'UTC')::date, ${newSaves}, ${Number(pin.repins || 0)},
          ${Number(pin.comments || 0)}, ${Number(pin.share_count || 0)}, ${totalReactions}, ${syncVelocity}, NOW()
        )
        ON CONFLICT (pin_id, snapshot_date) DO UPDATE SET
          save_count = GREATEST(pins_daily_metrics.save_count, EXCLUDED.save_count),
          repin_count = GREATEST(pins_daily_metrics.repin_count, EXCLUDED.repin_count),
          comment_count = GREATEST(pins_daily_metrics.comment_count, EXCLUDED.comment_count),
          share_count = GREATEST(pins_daily_metrics.share_count, EXCLUDED.share_count),
          reaction_count = GREATEST(pins_daily_metrics.reaction_count, EXCLUDED.reaction_count),
          daily_save_velocity = GREATEST(pins_daily_metrics.daily_save_velocity, EXCLUDED.daily_save_velocity),
          updated_at = NOW();
      `.catch(() => {});

      // Refreshed dossier
      const refreshedDossier = await fetchUniversalPinDossier({ hubSql: sql, pinId, ctx, env, bypassEdgeCache: true });
      invalidateEdgeCache(`pin:dossier?pin_id=${pinId}`);
      // [INVARIANT: EDGE-EVICTION-TANDEM] Immediate await prevents stale ghosting on subsequent reads
      if (env?.PIN_D1_DB) {
        await env.PIN_D1_DB.prepare('DELETE FROM edge_pins_metadata WHERE pin_id = ?').bind(pinId).run().catch(() => {});
      }
      if (env?.PIN_ENGINE_KV) {
        const associatedKids = [...new Set(targetRows.map(r => r.keyword_id).filter(Boolean))];
        const serpKeys = associatedKids.map(kid => `serp:comp:${kid}`);
        const evictions = [
          ...getPinKvKeysToEvict(pinId, associatedKids),
          ...serpKeys
        ].map(k => env.PIN_ENGINE_KV.delete(k).catch(() => {}));
        await Promise.all(evictions).catch(() => {});
      }

      return jsonResponse({
        success: true,
        synced: true,
        pin_id: pinId,
        pin,
        dossier: refreshedDossier
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

  // 3. GET /api/pins/:pin_id (Universal 4-Pillar Dossier via fleet-router - Zero-Blocking)
  if (parts.length === 1) {
    if (method !== 'GET') {
      return methodNotAllowedResponse('GET, OPTIONS');
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
        return jsonResponse(edgeFast, edgeFast.success ? 200 : 404, 300);
      }

      const forceRefresh = searchParams.get('refresh') === 'true';
      const dossierCacheKey = buildCanonicalCacheKey('pin:dossier', { pin_id: pinId });
      if (forceRefresh) {
        await invalidateEdgeCache(dossierCacheKey);
      }

      const dossier = await getCachedOrFetch(dossierCacheKey, async () => {
        return await fetchUniversalPinDossier({ hubSql: sql, pinId, ctx, env, bypassEdgeCache: forceRefresh });
      }, 30000, 120000, { forceRefresh });

      // Edge cache poisoning guard: If dossier has 0 snapshots or failed, invalidate cache so future calls re-fetch
      if (!dossier?.success || (!dossier?.daily_trajectory?.length && !dossier?.snapshots?.length)) {
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
