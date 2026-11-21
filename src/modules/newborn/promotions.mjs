/**
 * src/modules/newborn/promotions.mjs
 *
 * Multi-Destination Promotion Services for Newborn Candidates & Rookie Creators:
 * - `normalizeCandidateForMasterIngest`
 * - `promoteNewbornCandidates` (universal_master_pins + pins_daily_metrics + newborn_daily_anchors + optional folder/keyword/seeds)
 * - `promoteNewbornRookies` (competitor_profiles + competitor_history_snapshots + optional folder link)
 */

import { sanitizeForJsonb } from '../../utils.mjs';
import {
  invalidateEdgeCache,
  isValidPinId
} from '../../http/security-and-response.mjs';
import { ingestPinsBatch } from '../pins/repository.mjs';
import { addKeyword } from '../keywords/settings.mjs';
import { invalidateFolderCache } from '../keywords/folders-crossover.mjs';
import { bulkCreateClusterSeedsService } from '../cluster/service.mjs';
import { invalidateGlobalPulseCache } from '../pulse/service.mjs';
import { normalizePinterestUsername } from '../creators/competitors-crud.mjs';

export function normalizeCandidateForMasterIngest(cand) {
  const annotations = Array.isArray(cand.visual_annotations)
    ? cand.visual_annotations.map((a) => (typeof a === 'string' ? a : (a?.name || ''))).filter(Boolean)
    : [];
  const hasSaves = cand.save_count !== null && cand.save_count !== undefined;

  return {
    pin_id: String(cand.pin_id),
    creator_username: cand.effective_creator_username || cand.origin_creator_username || cand.pinner_username || null,
    board_id: cand.board_id || null,
    board_name: cand.board_name || null,
    title: cand.title || cand.crossover_blueprint?.recommended_pin_title || '',
    domain: cand.clean_domain || null,
    clean_domain: cand.clean_domain || null,
    destination_url: cand.destination_url || null,
    image_url: cand.image_url || '',
    description: cand.description || '',
    alt_text: cand.alt_text || '',
    dominant_color: cand.dominant_color || '#888888',
    visual_annotations: annotations,
    created_at_pinterest: cand.created_at_pinterest || null,
    save_count: hasSaves ? Number(cand.save_count) : null,
    has_explicit_saves: hasSaves,
    repin_count: cand.repin_count != null ? Number(cand.repin_count) : null,
    has_explicit_repins: cand.repin_count != null,
    comment_count: cand.comment_count != null ? Number(cand.comment_count) : null,
    share_count: cand.share_count != null ? Number(cand.share_count) : null,
    reaction_count: cand.reaction_count != null ? Number(cand.reaction_count) : null,
    // Strictly preserve [INVARIANT: UNHYDRATED-SAVES-NULL] & [INVARIANT: ANTI-HYDRATION-SPIKE]:
    // Never mark hydrated without explicit save_count, and NEVER inject lifetime save_per_day
    // into Day-1 daily_save_velocity (keep Day-1 velocity at 0 until 01:00 UTC Day-2 delta!).
    is_hydrated: hasSaves,
    daily_save_velocity: 0,
    daily_repin_velocity: 0,
    is_product: Boolean(cand.is_product),
    is_video: Boolean(cand.is_video),
    creation_method: cand.raw_creation_method || cand.upload_provenance?.toLowerCase() || 'pinterest_platform',
    image_signature: cand.image_signature || null,
    was_live_scraped: true,
    metadata: {
      newborn_promoted: true,
      newborn_golden_score: Number(cand.golden_score || 0),
      newborn_lifetime_save_per_day: cand.save_per_day != null ? Number(cand.save_per_day) : null,
      newborn_lifetime_repin_per_day: cand.repin_per_day != null ? Number(cand.repin_per_day) : null,
      upload_provenance: cand.upload_provenance || 'UNKNOWN',
      origin_creator_username: cand.origin_creator_username || null,
      pinner_username: cand.pinner_username || null
    }
  };
}

/**
 * Promotes staged Newborn candidate pins into selected SSOT destinations inside a single
 * atomic PostgreSQL transaction (`sql.begin()`):
 * - `universal_master_pins` + `pins_daily_metrics` + `newborn_daily_anchors` (01:00 UTC Daily Velocity Continuity!)
 * - Optional Campaign Folder (`keyword_folders` / `keyword_folder_items` / `keyword_serp_positions` with NULL rank)
 * - Optional Tracked Keyword (`tracked_keywords` from top visual annotation / crossover keyword)
 * - Optional Discovery Cluster Seeds (`cluster_seeds`)
 *
 * Invalidates ONLY real existing caches (`invalidateEdgeCache`, `invalidateGlobalPulseCache`, `invalidateFolderCache`).
 */
export async function promoteNewbornCandidates(sql, options = {}) {
  const {
    pinIds = [],
    destinations = {},
    source = 'manual',
    notes = '',
    env = null,
    ctx = null
  } = options;

  const cleanPinIds = Array.from(new Set(
    (Array.isArray(pinIds) ? pinIds : [pinIds])
      .map((id) => String(id || '').trim())
      .filter(isValidPinId)
  )).sort((a, b) => a.localeCompare(b));

  if (cleanPinIds.length === 0) {
    return {
      ok: true,
      promoted_count: 0,
      pin_ids: [],
      anchors_created: 0,
      keywords_created: [],
      cluster_seeds_created: 0
    };
  }

  const candidateRows = await sql`
    SELECT *
    FROM newborn_candidates
    WHERE pin_id = ANY(${cleanPinIds}::text[])
    ORDER BY pin_id ASC;
  `;

  if (!Array.isArray(candidateRows) || candidateRows.length === 0) {
    return {
      ok: false,
      status: 404,
      promoted_count: 0,
      pin_ids: [],
      message: 'No matching Newborn candidates found in staging.'
    };
  }

  const promoteToDailySsot = destinations.promote_to_daily_ssot !== false;
  const folderId = destinations.promote_to_campaign_folder_id ?? destinations.folder_id ?? null;
  const numericFolderId = folderId !== null && folderId !== '' && Number(folderId) > 0 ? Number(folderId) : null;
  const promoteKeyword = Boolean(destinations.promote_top_annotation_as_keyword || destinations.keyword);
  const explicitKeyword = typeof destinations.keyword === 'string' ? destinations.keyword.trim().toLowerCase() : '';
  const promoteClusterSeeds = Boolean(destinations.promote_to_cluster_seeds);

  const appliedDestinations = [];
  let anchorsCreated = 0;
  const createdKeywords = [];
  let clusterSeedsCreated = 0;
  const promotedIds = candidateRows.map((c) => String(c.pin_id)).sort((a, b) => a.localeCompare(b));

  const runInTx = async (fn) => (typeof sql.begin === 'function' ? sql.begin(fn) : fn(sql));

  await runInTx(async (tx) => {
    // 1. Ingest into universal_master_pins + pins_daily_metrics + newborn_daily_anchors
    if (promoteToDailySsot || numericFolderId !== null || promoteKeyword) {
      const masterBatch = candidateRows.map(normalizeCandidateForMasterIngest);
      await ingestPinsBatch(tx, masterBatch, { pillar: 'newborn', inTransaction: true });
      appliedDestinations.push('daily_ssot');

      const anchorRecords = candidateRows.map((c) => ({
        pin_id: String(c.pin_id),
        source: String(source || 'manual').slice(0, 32),
        is_active: true,
        folder_id: numericFolderId,
        seed_query: c.seed_query || c.crossover_blueprint?.primary_keyword || null,
        notes: String(notes || '').slice(0, 500)
      }));

      const anchorsJson = JSON.stringify(sanitizeForJsonb(anchorRecords));
      await tx`
        INSERT INTO newborn_daily_anchors (
          pin_id, source, is_active, folder_id, seed_query, notes, promoted_at, updated_at
        )
        SELECT
          u.pin_id,
          u.source,
          u.is_active,
          u.folder_id,
          u.seed_query,
          u.notes,
          NOW(),
          NOW()
        FROM jsonb_to_recordset(${anchorsJson}::jsonb) AS u(
          pin_id text,
          source text,
          is_active boolean,
          folder_id int,
          seed_query text,
          notes text
        )
        ORDER BY u.pin_id ASC
        ON CONFLICT (pin_id) DO UPDATE SET
          is_active = TRUE,
          source = EXCLUDED.source,
          folder_id = COALESCE(EXCLUDED.folder_id, newborn_daily_anchors.folder_id),
          seed_query = COALESCE(EXCLUDED.seed_query, newborn_daily_anchors.seed_query),
          notes = CASE WHEN EXCLUDED.notes <> '' THEN EXCLUDED.notes ELSE newborn_daily_anchors.notes END,
          updated_at = NOW();
      `;
      anchorsCreated = anchorRecords.length;
    }

    // 2. Optional Keyword + Campaign Folder linking
    if (promoteKeyword || numericFolderId !== null) {
      const keywordToPinsMap = new Map();
      for (const c of candidateRows) {
        const derivedKw = explicitKeyword ||
          c.crossover_blueprint?.primary_keyword ||
          (Array.isArray(c.visual_annotations) && c.visual_annotations[0]
            ? String(typeof c.visual_annotations[0] === 'string' ? c.visual_annotations[0] : (c.visual_annotations[0]?.name || '')).trim().toLowerCase()
            : '') ||
          String(c.seed_query || '').trim().toLowerCase();

        if (derivedKw && (promoteKeyword || numericFolderId !== null)) {
          if (!keywordToPinsMap.has(derivedKw)) keywordToPinsMap.set(derivedKw, []);
          keywordToPinsMap.get(derivedKw).push(c);
        }
      }

      for (const [kwTerm, pinsForKw] of keywordToPinsMap.entries()) {
        const kwRow = await addKeyword(tx, { keyword: kwTerm, category: 'Newborn Breakout' });
        if (kwRow && kwRow.id) {
          createdKeywords.push({ id: Number(kwRow.id), keyword: kwRow.keyword || kwTerm });

          if (numericFolderId !== null) {
            await tx`
              INSERT INTO keyword_folder_items (folder_id, keyword_id, notes, added_at)
              VALUES (${numericFolderId}, ${Number(kwRow.id)}, 'Promoted from Newborn Studio', NOW())
              ON CONFLICT (folder_id, keyword_id) DO NOTHING;
            `;
          }

          // NEVER fabricate fake SERP rank positions (1, 2, 3) for non-SERP promoted pins!
          // Use rank_position = NULL, is_displaced = TRUE, last_known_rank = NULL until a real SERP crawl ranks them.
          const serpRows = pinsForKw
            .map((c) => ({ pin_id: String(c.pin_id) }))
            .sort((a, b) => a.pin_id.localeCompare(b.pin_id));
          await tx`
            INSERT INTO keyword_serp_positions (
              keyword_id, pin_id, rank_position, is_displaced, last_known_rank, crawled_at, updated_at
            )
            SELECT
              ${Number(kwRow.id)},
              s.pin_id,
              NULL::int,
              TRUE,
              NULL::int,
              NOW(),
              NOW()
            FROM jsonb_to_recordset(${JSON.stringify(serpRows)}::jsonb) AS s(pin_id text)
            ORDER BY s.pin_id ASC
            ON CONFLICT (keyword_id, pin_id) DO NOTHING;
          `;
        }
      }

      if (promoteKeyword && createdKeywords.length > 0) appliedDestinations.push('tracked_keywords');
      if (numericFolderId !== null) appliedDestinations.push(`campaign_folder:${numericFolderId}`);
    }

    // 3. Optional /discovery Cluster Seeds promotion
    if (promoteClusterSeeds) {
      const seedsPayload = candidateRows.map((c) => ({
        pin_id: String(c.pin_id),
        label: String(c.title || c.crossover_blueprint?.primary_keyword || `Newborn ${c.pin_id}`).slice(0, 250),
        is_competitor: true
      }));
      const createdSeeds = await bulkCreateClusterSeedsService(tx, seedsPayload);
      clusterSeedsCreated = Array.isArray(createdSeeds) ? createdSeeds.length : seedsPayload.length;
      appliedDestinations.push('cluster_seeds');
    }

    // 4. Mark staging rows as promoted (sorted pin_ids for deterministic lock order)
    await tx`
      UPDATE newborn_candidates
      SET
        stage = 'promoted',
        promoted_at = COALESCE(promoted_at, NOW()),
        promoted_destinations = ${JSON.stringify(appliedDestinations)}::jsonb,
        updated_at = NOW()
      WHERE pin_id = ANY(${promotedIds}::text[]);
    `;
  });

  // 5. Real Cache Invalidations
  const edgePrefixes = ['newborn', 'pins', 'api:overview'];
  if (createdKeywords.length > 0) edgePrefixes.push('keywords');
  if (numericFolderId !== null) {
    edgePrefixes.push('folders');
    invalidateFolderCache(numericFolderId);
  }
  if (promoteClusterSeeds) {
    edgePrefixes.push('api:seeds');
  }
  await invalidateEdgeCache(...edgePrefixes);
  await invalidateGlobalPulseCache(env, ctx).catch(() => {});

  return {
    ok: true,
    promoted_count: promotedIds.length,
    pin_ids: promotedIds,
    destinations_applied: appliedDestinations,
    anchors_created: anchorsCreated,
    keywords_created: createdKeywords,
    cluster_seeds_created: clusterSeedsCreated
  };
}

/**
 * Promotes staged Rookie Creators from `newborn_rookie_accounts` into `/accounts` (`competitor_profiles`)
 * inside a single atomic transaction (`sql.begin()`), recording an opening `competitor_history_snapshots`
 * row and optionally linking to a Campaign Folder.
 */
export async function promoteNewbornRookies(sql, options = {}) {
  const {
    usernames = [],
    trackingMode = 'pulse_only',
    folderId = null,
    source = 'manual',
    env = null,
    ctx = null
  } = options;

  const cleanUsernames = Array.from(new Set(
    (Array.isArray(usernames) ? usernames : [usernames])
      .map((u) => normalizePinterestUsername(u))
      .filter(Boolean)
  )).sort((a, b) => a.localeCompare(b));

  if (cleanUsernames.length === 0) {
    return { ok: true, promoted_count: 0, competitors: [] };
  }

  const rookieRows = await sql`
    SELECT *
    FROM newborn_rookie_accounts
    WHERE username = ANY(${cleanUsernames}::text[])
    ORDER BY username ASC;
  `;

  if (!Array.isArray(rookieRows) || rookieRows.length === 0) {
    return { ok: false, status: 404, promoted_count: 0, competitors: [], message: 'No matching rookie accounts found in staging.' };
  }

  const mode = trackingMode === 'full' ? 'full' : 'pulse_only';
  const numericFolderId = folderId !== null && folderId !== '' && Number(folderId) > 0 ? Number(folderId) : null;
  const promotedCompetitors = [];
  const runInTx = async (fn) => (typeof sql.begin === 'function' ? sql.begin(fn) : fn(sql));

  await runInTx(async (tx) => {
    for (const r of rookieRows) {
      const [comp] = await tx`
        INSERT INTO competitor_profiles (
          username, display_name, avatar_url, website_url,
          monthly_reach, profile_views, total_pins, total_boards, follower_count,
          tracking_mode, source_folder_id, tags, is_active, last_synced_at, created_at, updated_at
        )
        VALUES (
          ${r.username},
          ${r.display_name || r.username},
          ${r.avatar_url || null},
          ${r.website_url || null},
          ${Number(r.monthly_reach ?? 0)},
          ${Number(r.profile_views ?? 0)},
          ${Number(r.pin_count ?? 0)},
          ${Number(r.board_count ?? 0)},
          ${Number(r.follower_count ?? 0)},
          ${mode},
          ${numericFolderId},
          ARRAY['newborn_rookie']::text[],
          TRUE,
          NOW(),
          NOW(),
          NOW()
        )
        ON CONFLICT (username) DO UPDATE SET
          display_name = COALESCE(NULLIF(EXCLUDED.display_name, ''), competitor_profiles.display_name),
          avatar_url = COALESCE(EXCLUDED.avatar_url, competitor_profiles.avatar_url),
          website_url = COALESCE(EXCLUDED.website_url, competitor_profiles.website_url),
          monthly_reach = GREATEST(COALESCE(competitor_profiles.monthly_reach, 0), EXCLUDED.monthly_reach),
          profile_views = GREATEST(COALESCE(competitor_profiles.profile_views, 0), EXCLUDED.profile_views),
          follower_count = GREATEST(COALESCE(competitor_profiles.follower_count, 0), EXCLUDED.follower_count),
          is_active = TRUE,
          updated_at = NOW()
        RETURNING id, username, tracking_mode;
      `;

      if (comp?.id) {
        promotedCompetitors.push({
          competitor_id: Number(comp.id),
          username: comp.username,
          tracking_mode: comp.tracking_mode
        });

        await tx`
          INSERT INTO competitor_history_snapshots (
            competitor_id, monthly_reach, profile_views, follower_count, total_pins, total_boards, recorded_date
          )
          VALUES (
            ${Number(comp.id)},
            ${Number(r.monthly_reach ?? 0)},
            ${Number(r.profile_views ?? 0)},
            ${Number(r.follower_count ?? 0)},
            ${Number(r.pin_count ?? 0)},
            ${Number(r.board_count ?? 0)},
            (NOW() AT TIME ZONE 'UTC')::date
          )
          ON CONFLICT (competitor_id, recorded_date) DO UPDATE SET
            monthly_reach = GREATEST(competitor_history_snapshots.monthly_reach, EXCLUDED.monthly_reach),
            profile_views = GREATEST(competitor_history_snapshots.profile_views, EXCLUDED.profile_views),
            follower_count = GREATEST(competitor_history_snapshots.follower_count, EXCLUDED.follower_count);
        `;

        if (numericFolderId !== null) {
          await tx`
            INSERT INTO folder_competitor_items (folder_id, competitor_id, source, added_at)
            VALUES (${numericFolderId}, ${Number(comp.id)}, ${String(source || 'newborn').slice(0, 32)}, NOW())
            ON CONFLICT (folder_id, competitor_id) DO NOTHING;
          `;
        }

        await tx`
          UPDATE newborn_rookie_accounts
          SET
            stage = 'promoted',
            promoted_competitor_id = ${Number(comp.id)},
            promoted_at = COALESCE(promoted_at, NOW()),
            updated_at = NOW()
          WHERE username = ${r.username};
        `;
      }
    }
  });

  const edgePrefixes = ['newborn', 'creators'];
  if (numericFolderId !== null) {
    edgePrefixes.push('folders');
    invalidateFolderCache(numericFolderId);
  }
  await invalidateEdgeCache(...edgePrefixes);
  await invalidateGlobalPulseCache(env, ctx).catch(() => {});

  return {
    ok: true,
    promoted_count: promotedCompetitors.length,
    competitors: promotedCompetitors
  };
}
