/**
 * src/modules/newborn/service.mjs
 *
 * Domain Service Orchestrator for `/newborn` Studio:
 * - Multi-Surface Discovery (`runNewbornDiscovery`) & Snowball (`runNewbornSnowball`)
 * - Staged Watchlist Polling & Consecutive-Day Qualification (`pollNewbornWatchlist`)
 * - Schedule-Driven Autonomous Cycle (`runNewbornAutoCycle`)
 * - Multi-Destination Promotion (`promoteNewbornCandidates`, `promoteNewbornRookies`)
 *   with Standalone 01:00 UTC Daily Velocity Continuity (`newborn_daily_anchors`)
 * - Read/Query & Management Services (`getNewbornOverview`, `listNewbornCandidates`,
 *   `getNewbornCandidateDossier`, `listNewbornRookies`, `getNewbornCrossoverReport`, etc.)
 */

import { escapeSqlWildcards, sanitizeForJsonb } from '../../utils.mjs';
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

import {
  SURFACES_CATALOG,
  VALID_UPLOAD_PROVENANCE,
  OFFICIAL_L1_INTERESTS,
  SUPPORTED_TREND_TYPES,
  SUPPORTED_TREND_COUNTRIES,
  getNewbornSettings,
  updateNewbornSettings,
  patchNewbornSettings,
  resetNewbornSettings,
  evaluateAutomationSchedule,
  stampAutomationRunTimestamp,
  listNewbornRuleProfiles,
  getNewbornRuleProfile,
  createNewbornRuleProfile,
  updateNewbornRuleProfile,
  deleteNewbornRuleProfile,
  resolveEffectiveNewbornSettings,
  resolveNewbornRawCookie,
  getNewbornCookieStatus,
  saveNewbornCookie,
  clearNewbornCookie
} from './settings.mjs';
import { NewbornCookieRouter } from './cookie-router.mjs';
import {
  parseSmartHuntInput,
  mergeCandidatePinRecords,
  harvestGrowingTrendsSurface,
  harvestZeroQueryPopularSurface,
  pretriageCandidatesWithPidgets,
  hydratePinZeroCookie,
  hydrateUserZeroCookie
} from './surfaces.mjs';
import {
  scoreNewbornCandidate,
  evaluatePinAutoRules,
  scoreRookieCreator,
  evaluateRookieAutoRules,
  synthesizeNewbornCrossoverBlueprint,
  buildNewbornCrossoverMatrix
} from './intelligence.mjs';
import {
  upsertStagedCandidatesBatch,
  upsertStagedRookiesBatch,
  executeNewbornHarvestPipeline
} from './harvester.mjs';

export {
  SURFACES_CATALOG,
  VALID_UPLOAD_PROVENANCE,
  OFFICIAL_L1_INTERESTS,
  SUPPORTED_TREND_TYPES,
  SUPPORTED_TREND_COUNTRIES,
  parseSmartHuntInput,
  getNewbornSettings,
  updateNewbornSettings,
  patchNewbornSettings,
  resetNewbornSettings,
  evaluateAutomationSchedule,
  listNewbornRuleProfiles,
  getNewbornRuleProfile,
  createNewbornRuleProfile,
  updateNewbornRuleProfile,
  deleteNewbornRuleProfile,
  resolveEffectiveNewbornSettings,
  getNewbornCookieStatus,
  saveNewbornCookie,
  clearNewbornCookie
};

function normalizeCandidateForMasterIngest(cand) {
  const annotations = Array.isArray(cand.visual_annotations)
    ? cand.visual_annotations.map((a) => (typeof a === 'string' ? a : (a?.name || ''))).filter(Boolean)
    : [];

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
    save_count: cand.save_count != null ? Number(cand.save_count) : null,
    has_explicit_saves: cand.save_count != null,
    repin_count: cand.repin_count != null ? Number(cand.repin_count) : null,
    has_explicit_repins: cand.repin_count != null,
    comment_count: cand.comment_count != null ? Number(cand.comment_count) : null,
    share_count: cand.share_count != null ? Number(cand.share_count) : null,
    reaction_count: cand.reaction_count != null ? Number(cand.reaction_count) : null,
    is_hydrated: Boolean(cand.is_hydrated || cand.save_count != null),
    daily_save_velocity: cand.save_per_day != null ? Number(cand.save_per_day) : null,
    daily_repin_velocity: cand.repin_per_day != null ? Number(cand.repin_per_day) : null,
    is_product: Boolean(cand.is_product),
    is_video: Boolean(cand.is_video),
    creation_method: cand.raw_creation_method || cand.upload_provenance?.toLowerCase() || 'pinterest_platform',
    image_signature: cand.image_signature || null,
    was_live_scraped: true,
    metadata: {
      newborn_promoted: true,
      newborn_golden_score: Number(cand.golden_score || 0),
      upload_provenance: cand.upload_provenance || 'UNKNOWN',
      origin_creator_username: cand.origin_creator_username || null,
      pinner_username: cand.pinner_username || null
    }
  };
}

/**
 * Promotes staged Newborn candidate pins into selected SSOT destinations:
 * - `universal_master_pins` + `pins_daily_metrics` + `newborn_daily_anchors` (01:00 UTC Daily Velocity Continuity!)
 * - Optional Campaign Folder (`keyword_folders` / `keyword_folder_items` / `keyword_serp_positions`)
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

  // 1. Ingest into universal_master_pins + pins_daily_metrics + newborn_daily_anchors
  if (promoteToDailySsot || numericFolderId !== null || promoteKeyword) {
    const masterBatch = candidateRows.map(normalizeCandidateForMasterIngest);
    await ingestPinsBatch(sql, masterBatch, { pillar: 'newborn' });
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
    await sql`
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
      const kwRow = await addKeyword(sql, { keyword: kwTerm, category: 'Newborn Breakout' });
      if (kwRow && kwRow.id) {
        createdKeywords.push({ id: Number(kwRow.id), keyword: kwRow.keyword || kwTerm });

        if (numericFolderId !== null) {
          await sql`
            INSERT INTO keyword_folder_items (folder_id, keyword_id, notes, added_at)
            VALUES (${numericFolderId}, ${Number(kwRow.id)}, 'Promoted from Newborn Studio', NOW())
            ON CONFLICT (folder_id, keyword_id) DO NOTHING;
          `;
        }

        const serpRows = pinsForKw.map((c, idx) => ({
          pin_id: String(c.pin_id),
          rank_position: idx + 1
        }));
        await sql`
          INSERT INTO keyword_serp_positions (
            keyword_id, pin_id, rank_position, is_displaced, last_known_rank, crawled_at, updated_at
          )
          SELECT
            ${Number(kwRow.id)},
            s.pin_id,
            s.rank_position,
            FALSE,
            s.rank_position,
            NOW(),
            NOW()
          FROM jsonb_to_recordset(${JSON.stringify(serpRows)}::jsonb) AS s(pin_id text, rank_position int)
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
    const createdSeeds = await bulkCreateClusterSeedsService(sql, seedsPayload);
    clusterSeedsCreated = Array.isArray(createdSeeds) ? createdSeeds.length : seedsPayload.length;
    appliedDestinations.push('cluster_seeds');
  }

  // 4. Mark staging rows as promoted
  const promotedIds = candidateRows.map((c) => String(c.pin_id));
  await sql`
    UPDATE newborn_candidates
    SET
      stage = 'promoted',
      promoted_at = COALESCE(promoted_at, NOW()),
      promoted_destinations = ${JSON.stringify(appliedDestinations)}::jsonb,
      updated_at = NOW()
    WHERE pin_id = ANY(${promotedIds}::text[]);
  `;

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
 * Promotes staged Rookie Creators from `newborn_rookie_accounts` into `/accounts` (`competitor_profiles`),
 * recording an opening `competitor_history_snapshots` row and optionally linking to a Campaign Folder.
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

  for (const r of rookieRows) {
    const [comp] = await sql`
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

      await sql`
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
        await sql`
          INSERT INTO folder_competitor_items (folder_id, competitor_id, source, added_at)
          VALUES (${numericFolderId}, ${Number(comp.id)}, ${String(source || 'newborn').slice(0, 32)}, NOW())
          ON CONFLICT (folder_id, competitor_id) DO NOTHING;
        `;
      }

      await sql`
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

/**
 * Runs the 8-Surface Newborn Discovery pipeline + autonomous rule evaluation.
 */
export async function runNewbornDiscovery(sql, options = {}) {
  const res = await executeNewbornHarvestPipeline(sql, {
    ...options,
    runType: options.runType || 'discovery',
    onAutoPromotePins: async (pinIds, settings) => {
      return await promoteNewbornCandidates(sql, {
        pinIds,
        destinations: settings.automation.pin_promotion_rules.destinations,
        source: 'auto_rule',
        env: options.env,
        ctx: options.ctx
      });
    },
    onAutoPromoteRookies: async (usernames, settings) => {
      const rRules = settings.automation.rookie_promotion_rules;
      return await promoteNewbornRookies(sql, {
        usernames,
        trackingMode: rRules.destination_tracking_mode,
        folderId: rRules.destination_folder_id,
        source: 'auto_rule',
        env: options.env,
        ctx: options.ctx
      });
    }
  });

  await invalidateEdgeCache('newborn');
  return res;
}

/**
 * Runs targeted Multi-Hop `RelatedModulesResource/get` Snowball expansion on explicit pin IDs
 * or the top staged Golden Pins in `newborn_candidates`.
 */
export async function runNewbornSnowball(sql, options = {}) {
  let seedPinIds = Array.isArray(options.seedPinIds)
    ? options.seedPinIds.map((id) => String(id || '').trim()).filter(isValidPinId)
    : [];

  if (seedPinIds.length === 0 && sql && typeof sql === 'function') {
    const { settings } = await resolveEffectiveNewbornSettings(sql, {
      profileId: options.profileId,
      overrides: options.settingsOverrides
    });
    const cap = settings.discovery.snowball.seed_cap || 10;
    const rows = await sql`
      SELECT pin_id
      FROM newborn_candidates
      WHERE stage IN ('discovered', 'watchlist')
        AND is_golden_pin = TRUE
      ORDER BY golden_score DESC, first_seen_at DESC
      LIMIT ${cap};
    `;
    seedPinIds = (rows || []).map((r) => String(r.pin_id));
  }

  return await runNewbornDiscovery(sql, {
    ...options,
    seedPinIds,
    snowballOnly: true,
    runType: 'snowball'
  });
}

/**
 * Polls staged `watchlist` pins & rookie accounts via strict zero-cookie hydrators,
 * records daily staging snapshots, advances `consecutive_qualifying_days`, and
 * auto-promotes winners meeting `promote_thresholds`.
 */
export async function pollNewbornWatchlist(sql, options = {}) {
  const {
    profileId = null,
    settingsOverrides = null,
    rawCookieOverride = null,
    routerOptions = {},
    workerIndex = 0,
    workerTotal = 1,
    nowMs = Date.now(),
    autoPromote = null,
    env = null,
    ctx = null
  } = options;

  const { settings, profile } = await resolveEffectiveNewbornSettings(sql, {
    profileId,
    overrides: settingsOverrides
  });

  const resolvedCookie = rawCookieOverride !== null && rawCookieOverride !== undefined
    ? { rawCookie: String(rawCookieOverride).trim() }
    : await resolveNewbornRawCookie(sql, env || routerOptions.env || {});

  const router = new NewbornCookieRouter({
    rawCookie: resolvedCookie.rawCookie,
    ...routerOptions
  });

  const wTotal = Math.max(1, Number(workerTotal) || 1);
  const wIdx = Math.max(0, Math.min(wTotal - 1, Number(workerIndex) || 0));

  const watchlistPins = wTotal === 20
    ? await sql`
        SELECT *
        FROM newborn_candidates
        WHERE stage = 'watchlist'
          AND (ABS(hashtext(pin_id::text)::bigint) % 20) = ${wIdx}
        ORDER BY pin_id ASC;
      `
    : (wTotal > 1
        ? await sql`
            SELECT *
            FROM newborn_candidates
            WHERE stage = 'watchlist'
              AND (ABS(hashtext(pin_id::text)::bigint) % ${wTotal}) = ${wIdx}
            ORDER BY pin_id ASC;
          `
        : await sql`
            SELECT *
            FROM newborn_candidates
            WHERE stage = 'watchlist'
            ORDER BY pin_id ASC;
          `);

  const watchlistRookies = wIdx === 0
    ? await sql`
        SELECT *
        FROM newborn_rookie_accounts
        WHERE stage = 'watchlist'
        ORDER BY username ASC;
      `
    : [];

  let runRowId = null;
  try {
    const [rRow] = await sql`
      INSERT INTO newborn_runs (run_type, status, profile_id, cookie_mode, started_at)
      VALUES ('watchlist_poll', 'running', ${profile?.id ?? null}, 'zero_cookie', NOW())
      RETURNING id;
    `;
    runRowId = rRow?.id ? Number(rRow.id) : null;
  } catch (_) {}

  const pinIds = (watchlistPins || []).map((p) => String(p.pin_id));
  const pidgetsMap = pinIds.length > 0
    ? await pretriageCandidatesWithPidgets(pinIds, router)
    : new Map();

  const refreshedCandidates = [];
  for (const row of (watchlistPins || [])) {
    let merged = { ...row };
    const pInfo = pidgetsMap.get(String(row.pin_id));
    if (pInfo) {
      merged = mergeCandidatePinRecords(merged, pInfo);
    }

    const hyd = await hydratePinZeroCookie(String(row.pin_id), router);
    if (hyd.ok && hyd.pin) {
      merged = mergeCandidatePinRecords(merged, hyd.pin);
    }

    const scored = scoreNewbornCandidate(merged, settings, { nowMs });
    scored.stage = 'watchlist';
    scored.crossover_blueprint = synthesizeNewbornCrossoverBlueprint(scored, watchlistPins);
    refreshedCandidates.push(scored);
  }

  let persistedPins = [];
  if (refreshedCandidates.length > 0) {
    const upRes = await upsertStagedCandidatesBatch(sql, refreshedCandidates, {
      profileId: profile?.id ?? null,
      nowMs,
      isWatchlistPoll: true
    });
    persistedPins = upRes.rows;
  }

  const refreshedRookies = [];
  for (const rkRow of (watchlistRookies || [])) {
    const uRes = await hydrateUserZeroCookie(rkRow.username, router);
    if (uRes.ok && uRes.user) {
      const assocPins = persistedPins.filter((p) => p.effective_creator_username === rkRow.username);
      const scoredRk = scoreRookieCreator(uRes.user, assocPins, settings);
      scoredRk.stage = 'watchlist';
      scoredRk.golden_pins_count = Math.max(Number(rkRow.golden_pins_count || 0), scoredRk.golden_pins_count);
      refreshedRookies.push(scoredRk);
    }
  }

  let persistedRookies = [];
  if (refreshedRookies.length > 0) {
    const rkUpRes = await upsertStagedRookiesBatch(sql, refreshedRookies, {
      nowMs,
      isWatchlistPoll: true
    });
    persistedRookies = rkUpRes.rows;
  }

  const shouldAutoPromote = autoPromote !== null
    ? Boolean(autoPromote)
    : Boolean(settings.automation.auto_track_enabled);

  let promotedPinsResult = { promoted_count: 0, pin_ids: [] };
  let promotedRookiesResult = { promoted_count: 0, competitors: [] };

  if (shouldAutoPromote) {
    const winningPinIds = persistedPins
      .filter((c) => evaluatePinAutoRules(c, settings).meets_promotion)
      .map((c) => c.pin_id);

    if (winningPinIds.length > 0) {
      promotedPinsResult = await promoteNewbornCandidates(sql, {
        pinIds: winningPinIds,
        destinations: settings.automation.pin_promotion_rules.destinations,
        source: 'watchlist_auto_rule',
        env,
        ctx
      });
    }

    const winningRookies = persistedRookies
      .filter((r) => evaluateRookieAutoRules(r, settings).meets_promotion)
      .map((r) => r.username);

    if (winningRookies.length > 0) {
      const rRules = settings.automation.rookie_promotion_rules;
      promotedRookiesResult = await promoteNewbornRookies(sql, {
        usernames: winningRookies,
        trackingMode: rRules.destination_tracking_mode,
        folderId: rRules.destination_folder_id,
        source: 'watchlist_auto_rule',
        env,
        ctx
      });
    }
  }

  await stampAutomationRunTimestamp(sql, 'watchlist_poll', new Date(nowMs).toISOString()).catch(() => {});

  const totalAutoPromoted = Number(promotedPinsResult.promoted_count || 0) + Number(promotedRookiesResult.promoted_count || 0);
  if (runRowId !== null) {
    await sql`
      UPDATE newborn_runs
      SET
        status = 'completed',
        candidates_discovered = ${persistedPins.length},
        candidates_qualified = ${persistedPins.filter((c) => c.qualified !== false).length},
        golden_pins_count = ${persistedPins.filter((c) => c.is_golden_pin).length},
        rookie_creators_count = ${persistedRookies.length},
        auto_promoted_count = ${totalAutoPromoted},
        telemetry = ${JSON.stringify(sanitizeForJsonb({
          router: router.getRedactedTelemetry(),
          promoted_pin_ids: promotedPinsResult.pin_ids || []
        }))}::jsonb,
        completed_at = NOW()
      WHERE id = ${runRowId};
    `.catch(() => {});
  }

  await invalidateEdgeCache('newborn');

  return {
    ok: true,
    run_id: runRowId,
    polled_pins_count: persistedPins.length,
    polled_rookies_count: persistedRookies.length,
    auto_promoted_pins: promotedPinsResult.pin_ids || [],
    auto_promoted_rookies: (promotedRookiesResult.competitors || []).map((c) => c.username),
    candidates: persistedPins,
    rookies: persistedRookies
  };
}

/**
 * Evaluates the dynamic automation schedule (`evaluateAutomationSchedule`) and executes
 * due watchlist polling and/or multi-surface discovery.
 */
export async function runNewbornAutoCycle(sql, options = {}) {
  const {
    nowMs = Date.now(),
    force = false,
    forceDiscovery = false,
    forceWatchlist = false,
    seedQueries = [],
    profileId = null,
    routerOptions = {},
    env = null,
    ctx = null
  } = options;

  const { settings } = await resolveEffectiveNewbornSettings(sql, { profileId });
  const schedule = evaluateAutomationSchedule(settings, new Date(nowMs));

  if (!force && !forceDiscovery && !forceWatchlist && !schedule.auto_track_enabled) {
    return {
      ok: true,
      executed: false,
      reason: 'auto_track_disabled',
      schedule
    };
  }

  const results = {
    ok: true,
    executed: false,
    schedule,
    watchlist_poll: null,
    discovery: null
  };

  if (force || forceWatchlist || schedule.watchlist_poll_due) {
    results.watchlist_poll = await pollNewbornWatchlist(sql, {
      profileId,
      routerOptions,
      nowMs,
      env,
      ctx
    });
    results.executed = true;
  }

  if (force || forceDiscovery || schedule.discovery_due) {
    results.discovery = await runNewbornDiscovery(sql, {
      seedQueries,
      profileId,
      routerOptions,
      runType: 'auto_cycle',
      nowMs,
      env,
      ctx
    });
    results.executed = true;
  }

  if (!results.executed) {
    results.reason = schedule.cooldown_active
      ? 'cooldown_active'
      : (!schedule.in_target_window ? 'outside_target_utc_window' : 'interval_not_elapsed');
  }

  return results;
}

/**
 * Single-pass Executive Overview for `/api/newborn/overview`.
 */
export async function getNewbornOverview(sql, env = {}) {
  const [settings, cookieStatus, statsRows, recentRuns, topCandidates] = await Promise.all([
    getNewbornSettings(sql),
    getNewbornCookieStatus(sql, env),
    sql`
      SELECT
        COUNT(*)::int AS total_candidates,
        COUNT(*) FILTER (WHERE stage = 'discovered')::int AS discovered_count,
        COUNT(*) FILTER (WHERE stage = 'watchlist')::int AS watchlist_count,
        COUNT(*) FILTER (WHERE stage = 'promoted')::int AS promoted_count,
        COUNT(*) FILTER (WHERE stage = 'discarded')::int AS discarded_count,
        COUNT(*) FILTER (WHERE is_golden_pin = TRUE AND stage <> 'discarded')::int AS golden_pins_count,
        COUNT(*) FILTER (WHERE is_linkless = TRUE AND stage <> 'discarded')::int AS linkless_vacuum_count,
        COUNT(*) FILTER (WHERE is_rookie_outlier = TRUE AND stage <> 'discarded')::int AS rookie_outliers_count,
        COALESCE(ROUND(AVG(golden_score) FILTER (WHERE stage <> 'discarded')::numeric, 2), 0)::double precision AS avg_golden_score,
        (SELECT COUNT(*)::int FROM newborn_rookie_accounts WHERE stage <> 'discarded') AS rookie_accounts_count,
        (SELECT COUNT(*)::int FROM newborn_rookie_accounts WHERE stage = 'watchlist') AS rookie_watchlist_count,
        (SELECT COUNT(*)::int FROM newborn_rookie_accounts WHERE stage = 'promoted') AS rookie_promoted_count,
        (SELECT COUNT(*)::int FROM newborn_daily_anchors WHERE is_active = TRUE) AS active_daily_anchors_count,
        (SELECT COUNT(*)::int FROM newborn_rule_profiles WHERE is_active = TRUE) AS active_profiles_count
      FROM newborn_candidates;
    `,
    sql`
      SELECT id, run_type, status, cookie_mode, candidates_discovered, candidates_qualified,
             golden_pins_count, rookie_creators_count, auto_watchlisted_count, auto_promoted_count,
             snowball_hops_executed, started_at, completed_at
      FROM newborn_runs
      ORDER BY started_at DESC
      LIMIT 8;
    `,
    sql`
      SELECT pin_id, title, board_name, is_golden_pin, is_linkless, golden_score, repin_per_day, visual_annotations
      FROM newborn_candidates
      WHERE stage IN ('discovered', 'watchlist', 'promoted')
      ORDER BY golden_score DESC, first_seen_at DESC
      LIMIT 100;
    `
  ]);

  const counts = statsRows?.[0] || {};
  const schedule = evaluateAutomationSchedule(settings);
  const crossoverHighlights = buildNewbornCrossoverMatrix(topCandidates || [], { limit: 10 });

  return {
    success: true,
    counts: {
      total_candidates: Number(counts.total_candidates || 0),
      discovered_count: Number(counts.discovered_count || 0),
      watchlist_count: Number(counts.watchlist_count || 0),
      promoted_count: Number(counts.promoted_count || 0),
      discarded_count: Number(counts.discarded_count || 0),
      golden_pins_count: Number(counts.golden_pins_count || 0),
      linkless_vacuum_count: Number(counts.linkless_vacuum_count || 0),
      rookie_outliers_count: Number(counts.rookie_outliers_count || 0),
      avg_golden_score: Number(counts.avg_golden_score || 0),
      rookie_accounts_count: Number(counts.rookie_accounts_count || 0),
      rookie_watchlist_count: Number(counts.rookie_watchlist_count || 0),
      rookie_promoted_count: Number(counts.rookie_promoted_count || 0),
      active_daily_anchors_count: Number(counts.active_daily_anchors_count || 0),
      active_profiles_count: Number(counts.active_profiles_count || 0)
    },
    cookie_status: cookieStatus,
    automation_schedule: schedule,
    surfaces_catalog: SURFACES_CATALOG,
    l1_interests_catalog: OFFICIAL_L1_INTERESTS,
    crossover_highlights: crossoverHighlights,
    recent_runs: recentRuns || []
  };
}

/**
 * Queries staged `newborn_candidates` with wildcard-escaped search, multi-facet filters, and deterministic sorting.
 */
export async function listNewbornCandidates(sql, filters = {}) {
  const stage = filters.stage && ['discovered', 'watchlist', 'promoted', 'discarded'].includes(String(filters.stage).toLowerCase())
    ? String(filters.stage).toLowerCase()
    : null;
  const surface = filters.surface ? String(filters.surface).trim().toLowerCase() : null;
  const provenance = filters.provenance ? String(filters.provenance).trim().toUpperCase() : null;
  const goldenOnly = filters.golden_only === true || filters.golden_only === 'true';
  const rookieOnly = filters.rookie_only === true || filters.rookie_only === 'true';
  const linklessOnly = filters.linkless_only === true || filters.linkless_only === 'true';
  const minGoldenScore = filters.min_golden_score != null && filters.min_golden_score !== ''
    ? Number(filters.min_golden_score)
    : null;
  const maxAgeDays = filters.max_age_days != null && filters.max_age_days !== ''
    ? Number(filters.max_age_days)
    : null;

  const rawSearch = String(filters.search || filters.q || '').trim().toLowerCase();
  const searchPattern = rawSearch ? `%${escapeSqlWildcards(rawSearch)}%` : null;

  const sort = String(filters.sort || 'golden_score').trim().toLowerCase();
  const limit = Math.min(500, Math.max(1, Number(filters.limit) || 50));
  const offset = Math.max(0, Number(filters.offset) || 0);

  const whereCond = sql`
    (${stage}::text IS NULL OR nc.stage = ${stage})
    AND (${stage !== null}::boolean = TRUE OR nc.stage <> 'discarded')
    AND (${surface}::text IS NULL OR nc.first_surface = ${surface} OR nc.discovered_surfaces ? ${surface || ''})
    AND (${provenance}::text IS NULL OR nc.upload_provenance = ${provenance})
    AND (${goldenOnly}::boolean = FALSE OR nc.is_golden_pin = TRUE)
    AND (${rookieOnly}::boolean = FALSE OR nc.is_rookie_outlier = TRUE)
    AND (${linklessOnly}::boolean = FALSE OR nc.is_linkless = TRUE)
    AND (${minGoldenScore}::double precision IS NULL OR nc.golden_score >= ${minGoldenScore})
    AND (${maxAgeDays}::double precision IS NULL OR nc.age_days <= ${maxAgeDays})
    AND (
      ${searchPattern}::text IS NULL
      OR LOWER(nc.title) LIKE ${searchPattern} ESCAPE '\\'
      OR LOWER(COALESCE(nc.board_name, '')) LIKE ${searchPattern} ESCAPE '\\'
      OR LOWER(COALESCE(nc.effective_creator_username, '')) LIKE ${searchPattern} ESCAPE '\\'
      OR LOWER(COALESCE(nc.clean_domain, '')) LIKE ${searchPattern} ESCAPE '\\'
      OR LOWER(COALESCE(nc.seed_query, '')) LIKE ${searchPattern} ESCAPE '\\'
      OR nc.pin_id LIKE ${searchPattern} ESCAPE '\\'
    )
  `;

  const [rows, countRows] = await Promise.all([
    sort === 'repin_velocity' || sort === 'repin_per_day'
      ? sql`
          SELECT nc.* FROM newborn_candidates nc
          WHERE ${whereCond}
          ORDER BY nc.repin_per_day DESC NULLS LAST, nc.golden_score DESC, nc.pin_id ASC
          LIMIT ${limit} OFFSET ${offset};
        `
      : sort === 'save_velocity' || sort === 'save_per_day'
      ? sql`
          SELECT nc.* FROM newborn_candidates nc
          WHERE ${whereCond}
          ORDER BY nc.save_per_day DESC NULLS LAST, nc.golden_score DESC, nc.pin_id ASC
          LIMIT ${limit} OFFSET ${offset};
        `
      : sort === 'repins' || sort === 'repin_count'
      ? sql`
          SELECT nc.* FROM newborn_candidates nc
          WHERE ${whereCond}
          ORDER BY nc.repin_count DESC NULLS LAST, nc.golden_score DESC, nc.pin_id ASC
          LIMIT ${limit} OFFSET ${offset};
        `
      : sort === 'fresh' || sort === 'age_days'
      ? sql`
          SELECT nc.* FROM newborn_candidates nc
          WHERE ${whereCond}
          ORDER BY nc.age_days ASC NULLS LAST, nc.golden_score DESC, nc.pin_id ASC
          LIMIT ${limit} OFFSET ${offset};
        `
      : sort === 'recent'
      ? sql`
          SELECT nc.* FROM newborn_candidates nc
          WHERE ${whereCond}
          ORDER BY nc.first_seen_at DESC, nc.pin_id ASC
          LIMIT ${limit} OFFSET ${offset};
        `
      : sql`
          SELECT nc.* FROM newborn_candidates nc
          WHERE ${whereCond}
          ORDER BY nc.golden_score DESC, nc.repin_per_day DESC NULLS LAST, nc.pin_id ASC
          LIMIT ${limit} OFFSET ${offset};
        `,
    sql`
      SELECT COUNT(*)::int AS total
      FROM newborn_candidates nc
      WHERE ${whereCond};
    `
  ]);

  const enrichBoardMeta = (row) => {
    if (!row || typeof row !== 'object') return row;
    const meta = (row.metadata && typeof row.metadata === 'object') ? row.metadata : {};
    return {
      ...row,
      board_pin_count: row.board_pin_count ?? meta.board_pin_count ?? null,
      board_follower_count: row.board_follower_count ?? meta.board_follower_count ?? null
    };
  };

  return {
    total: Number(countRows?.[0]?.total || 0),
    limit,
    offset,
    candidates: (rows || []).map(enrichBoardMeta)
  };
}

/**
 * Pure read-only dossier for a single Newborn candidate pin, combining staging snapshots
 * and SSOT `pins_daily_metrics` + `newborn_daily_anchors` if promoted.
 */
export async function getNewbornCandidateDossier(sql, pinId) {
  const cleanId = String(pinId || '').trim();
  if (!isValidPinId(cleanId)) return null;

  const [candRows, snapRows, anchorRows, ssotMetrics] = await Promise.all([
    sql`SELECT * FROM newborn_candidates WHERE pin_id = ${cleanId} LIMIT 1;`,
    sql`
      SELECT recorded_date::text AS recorded_date, save_count, repin_count, comment_count,
             share_count, reaction_count, repin_per_day, save_per_day, golden_score, qualified
      FROM newborn_candidate_snapshots
      WHERE pin_id = ${cleanId}
      ORDER BY recorded_date ASC;
    `,
    sql`SELECT * FROM newborn_daily_anchors WHERE pin_id = ${cleanId} LIMIT 1;`,
    sql`
      SELECT recorded_date::text AS recorded_date, save_count, repin_count,
             daily_save_velocity, daily_repin_velocity
      FROM pins_daily_metrics
      WHERE pin_id = ${cleanId}
      ORDER BY recorded_date ASC;
    `
  ]);

  if (!candRows || candRows.length === 0) return null;

  const rawCand = candRows[0];
  const candMeta = (rawCand?.metadata && typeof rawCand.metadata === 'object') ? rawCand.metadata : {};

  return {
    candidate: {
      ...rawCand,
      board_pin_count: rawCand.board_pin_count ?? candMeta.board_pin_count ?? null,
      board_follower_count: rawCand.board_follower_count ?? candMeta.board_follower_count ?? null
    },
    staging_trajectory: snapRows || [],
    daily_anchor: anchorRows?.[0] || null,
    ssot_trajectory: ssotMetrics || []
  };
}

/**
 * Updates the staging lifecycle stage (`discovered`, `watchlist`, `discarded`) of one or more candidates.
 */
export async function updateNewbornCandidateStage(sql, pinIds, nextStage) {
  const validStages = new Set(['discovered', 'watchlist', 'discarded']);
  const cleanStage = String(nextStage || '').trim().toLowerCase();
  if (!validStages.has(cleanStage)) {
    const err = new Error(`Invalid stage "${nextStage}". Expected discovered, watchlist, or discarded.`);
    err.status = 400;
    throw err;
  }

  const cleanIds = Array.from(new Set(
    (Array.isArray(pinIds) ? pinIds : [pinIds])
      .map((id) => String(id || '').trim())
      .filter(isValidPinId)
  ));
  if (cleanIds.length === 0) return { updated: 0, pin_ids: [] };

  const updated = await sql`
    UPDATE newborn_candidates
    SET
      stage = ${cleanStage},
      watchlist_added_at = CASE
        WHEN ${cleanStage} = 'watchlist' THEN COALESCE(watchlist_added_at, NOW())
        ELSE watchlist_added_at
      END,
      updated_at = NOW()
    WHERE pin_id = ANY(${cleanIds}::text[])
    RETURNING pin_id, stage;
  `;

  await invalidateEdgeCache('newborn');
  return {
    updated: Array.isArray(updated) ? updated.length : 0,
    pin_ids: (updated || []).map((r) => r.pin_id),
    stage: cleanStage
  };
}

/**
 * Deletes candidate(s) from `newborn_candidates` staging store.
 */
export async function deleteNewbornCandidate(sql, pinIds) {
  const cleanIds = Array.from(new Set(
    (Array.isArray(pinIds) ? pinIds : [pinIds])
      .map((id) => String(id || '').trim())
      .filter(isValidPinId)
  ));
  if (cleanIds.length === 0) return { deleted: 0 };

  const res = await sql`
    DELETE FROM newborn_candidates
    WHERE pin_id = ANY(${cleanIds}::text[])
    RETURNING pin_id;
  `;
  await invalidateEdgeCache('newborn');
  return { deleted: Array.isArray(res) ? res.length : 0 };
}

/**
 * Lists Rookie / Rising Accounts from `newborn_rookie_accounts`.
 */
export async function listNewbornRookies(sql, filters = {}) {
  const stage = filters.stage && ['discovered', 'watchlist', 'promoted', 'discarded'].includes(String(filters.stage).toLowerCase())
    ? String(filters.stage).toLowerCase()
    : null;
  const rawSearch = String(filters.search || filters.q || '').trim().toLowerCase();
  const searchPattern = rawSearch ? `%${escapeSqlWildcards(rawSearch)}%` : null;
  const limit = Math.min(200, Math.max(1, Number(filters.limit) || 50));
  const offset = Math.max(0, Number(filters.offset) || 0);

  const whereCond = sql`
    (${stage}::text IS NULL OR nra.stage = ${stage})
    AND (${stage !== null}::boolean = TRUE OR nra.stage <> 'discarded')
    AND (
      ${searchPattern}::text IS NULL
      OR LOWER(nra.username) LIKE ${searchPattern} ESCAPE '\\'
      OR LOWER(COALESCE(nra.display_name, '')) LIKE ${searchPattern} ESCAPE '\\'
      OR LOWER(COALESCE(nra.clean_domain, '')) LIKE ${searchPattern} ESCAPE '\\'
    )
  `;

  const [rows, countRows] = await Promise.all([
    sql`
      SELECT nra.*
      FROM newborn_rookie_accounts nra
      WHERE ${whereCond}
      ORDER BY nra.rookie_score DESC, nra.outlier_multiplier DESC NULLS LAST, nra.username ASC
      LIMIT ${limit} OFFSET ${offset};
    `,
    sql`
      SELECT COUNT(*)::int AS total
      FROM newborn_rookie_accounts nra
      WHERE ${whereCond};
    `
  ]);

  return {
    total: Number(countRows?.[0]?.total || 0),
    limit,
    offset,
    rookies: rows || []
  };
}

/**
 * Lists recent execution runs from `newborn_runs`.
 */
export async function listNewbornRuns(sql, { limit = 30 } = {}) {
  const clamped = Math.min(100, Math.max(1, Number(limit) || 30));
  const rows = await sql`
    SELECT *
    FROM newborn_runs
    ORDER BY started_at DESC
    LIMIT ${clamped};
  `;
  return rows || [];
}

/**
 * Lists standalone daily velocity crawler anchors (`newborn_daily_anchors`).
 */
export async function listNewbornDailyAnchors(sql, { activeOnly = true, limit = 100, offset = 0 } = {}) {
  const lim = Math.min(500, Math.max(1, Number(limit) || 100));
  const off = Math.max(0, Number(offset) || 0);

  const rows = await sql`
    SELECT
      nda.*,
      ump.title,
      ump.image_url,
      ump.clean_domain,
      ump.save_count,
      ump.repin_count,
      ump.daily_save_velocity,
      ump.daily_repin_velocity,
      ump.last_scraped_at
    FROM newborn_daily_anchors nda
    JOIN universal_master_pins ump ON ump.pin_id = nda.pin_id
    WHERE (${Boolean(activeOnly)}::boolean = FALSE OR nda.is_active = TRUE)
    ORDER BY nda.promoted_at DESC, nda.pin_id ASC
    LIMIT ${lim} OFFSET ${off};
  `;
  return rows || [];
}

/**
 * Builds the Annotation + Board-Title Crossover matrix across staged Newborn candidates.
 */
export async function getNewbornCrossoverReport(sql, { stage = null, goldenOnly = false, limit = 30 } = {}) {
  const cleanStage = stage && ['discovered', 'watchlist', 'promoted'].includes(String(stage).toLowerCase())
    ? String(stage).toLowerCase()
    : null;
  const rows = await sql`
    SELECT pin_id, title, board_name, is_golden_pin, is_linkless, golden_score, repin_per_day, visual_annotations
    FROM newborn_candidates
    WHERE (${cleanStage}::text IS NULL OR stage = ${cleanStage})
      AND stage <> 'discarded'
      AND (${Boolean(goldenOnly)}::boolean = FALSE OR is_golden_pin = TRUE)
    ORDER BY golden_score DESC
    LIMIT 1000;
  `;
  return {
    analyzed_pins: (rows || []).length,
    clusters: buildNewbornCrossoverMatrix(rows || [], { limit })
  };
}

const LAUNCHPAD_CACHE_KEY = 'newborn_launchpad_cache';

/**
 * Pure read-only Trends & Zero-Query Launchpad feed (`GET /api/newborn/launchpad`).
 * Safe even when `sql` is null / offline.
 */
export async function getNewbornLaunchpadFeed(sql, { country = null, trendType = 'growing', l1Interest = 'all' } = {}) {
  const settings = await getNewbornSettings(sql);
  const resolvedCountry = /^[A-Z]{2}$/.test(String(country || '').toUpperCase())
    ? String(country).toUpperCase()
    : (settings.discovery?.country || 'US');
  const resolvedType = SUPPORTED_TREND_TYPES.includes(String(trendType || '').toLowerCase())
    ? String(trendType).toLowerCase()
    : 'growing';
  const resolvedInterest = String(l1Interest || settings.discovery?.default_l1_interest || 'all').toLowerCase();

  let cached = null;
  let recentSeeds = [];

  if (sql && typeof sql === 'function') {
    const [cacheRows, seedRows] = await Promise.all([
      sql`SELECT value, updated_at FROM app_settings WHERE key = ${LAUNCHPAD_CACHE_KEY} LIMIT 1;`,
      sql`
        SELECT seed_query, COUNT(*)::int AS pin_count, MAX(golden_score)::double precision AS max_score
        FROM newborn_candidates
        WHERE seed_query IS NOT NULL AND seed_query <> '' AND stage <> 'discarded'
        GROUP BY seed_query
        ORDER BY max_score DESC NULLS LAST, pin_count DESC
        LIMIT 16;
      `
    ]);

    if (cacheRows?.[0]?.value) {
      cached = typeof cacheRows[0].value === 'string' ? JSON.parse(cacheRows[0].value) : cacheRows[0].value;
    }
    recentSeeds = (seedRows || []).map((r) => ({
      term: r.seed_query,
      pin_count: Number(r.pin_count || 0),
      max_golden_score: Number(r.max_score || 0)
    }));
  }

  const bucketKey = `${resolvedCountry}:${resolvedType}:${resolvedInterest}`;
  const bucket = cached?.buckets?.[bucketKey] || null;

  return {
    country: resolvedCountry,
    trend_type: resolvedType,
    l1_interest: resolvedInterest,
    trends: Array.isArray(bucket?.trends) ? bucket.trends : [],
    popular_terms: Array.isArray(cached?.zero_query?.popular_terms) ? cached.zero_query.popular_terms : [],
    ideas_for_you_terms: Array.isArray(cached?.zero_query?.ideas_for_you_terms) ? cached.zero_query.ideas_for_you_terms : [],
    zero_query_used_guest_fallback: Boolean(cached?.zero_query?.used_guest_fallback),
    recent_seeds: recentSeeds,
    l1_interests_catalog: OFFICIAL_L1_INTERESTS,
    supported_trend_types: SUPPORTED_TREND_TYPES,
    supported_countries: SUPPORTED_TREND_COUNTRIES,
    cached_at: bucket?.fetched_at || cached?.updated_at || null
  };
}

/**
 * Live Trends & Zero-Query Launchpad refresh (`POST /api/newborn/launchpad`).
 * Fetches live `Growing` / `Seasonal` / `Monthly` / `Yearly` trends + 90d `Predicted Peaks`
 * and `Zero-Query` (`Popular on Pinterest` + `Ideas for you`) via `NewbornCookieRouter`.
 */
export async function refreshNewbornLaunchpadFeed(sql, options = {}) {
  const {
    country = null,
    trendType = 'growing',
    l1Interest = 'all',
    limit = 25,
    routerOptions = {},
    env = null
  } = options;

  const settings = await getNewbornSettings(sql);
  const resolvedCountry = /^[A-Z]{2}$/.test(String(country || '').toUpperCase())
    ? String(country).toUpperCase()
    : (settings.discovery?.country || 'US');
  const resolvedType = SUPPORTED_TREND_TYPES.includes(String(trendType || '').toLowerCase())
    ? String(trendType).toLowerCase()
    : 'growing';
  const resolvedInterest = String(l1Interest || settings.discovery?.default_l1_interest || 'all').toLowerCase();

  const resolvedCookie = await resolveNewbornRawCookie(sql, env || routerOptions.env || {});
  const router = new NewbornCookieRouter({
    rawCookie: resolvedCookie.rawCookie,
    ...routerOptions
  });

  const [trendsRes, zeroQueryRes] = await Promise.all([
    harvestGrowingTrendsSurface(router, {
      country: resolvedCountry,
      trendType: resolvedType,
      l1Interest: resolvedInterest,
      limit: Math.max(5, Math.min(60, Number(limit) || 25)),
      fetch90dForecast: true
    }),
    harvestZeroQueryPopularSurface(router, { country: resolvedCountry })
  ]);

  const nowIso = new Date().toISOString();
  const bucketKey = `${resolvedCountry}:${resolvedType}:${resolvedInterest}`;

  if (sql && typeof sql === 'function') {
    let existingCache = { buckets: {}, zero_query: {} };
    const prevRows = await sql`SELECT value FROM app_settings WHERE key = ${LAUNCHPAD_CACHE_KEY} LIMIT 1;`;
    if (prevRows?.[0]?.value) {
      const parsed = typeof prevRows[0].value === 'string' ? JSON.parse(prevRows[0].value) : prevRows[0].value;
      if (parsed && typeof parsed === 'object') {
        existingCache = {
          buckets: (parsed.buckets && typeof parsed.buckets === 'object') ? parsed.buckets : {},
          zero_query: (parsed.zero_query && typeof parsed.zero_query === 'object') ? parsed.zero_query : {}
        };
      }
    }

    const bucketKeys = Object.keys(existingCache.buckets);
    if (bucketKeys.length >= 24 && !existingCache.buckets[bucketKey]) {
      delete existingCache.buckets[bucketKeys[0]];
    }

    existingCache.buckets[bucketKey] = {
      trends: trendsRes.trends || [],
      fetched_at: nowIso
    };
    existingCache.zero_query = {
      popular_terms: zeroQueryRes.popular_terms || zeroQueryRes.terms || [],
      ideas_for_you_terms: zeroQueryRes.ideas_for_you_terms || [],
      used_guest_fallback: Boolean(zeroQueryRes.used_guest_fallback),
      fetched_at: nowIso
    };
    existingCache.updated_at = nowIso;

    await sql`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (${LAUNCHPAD_CACHE_KEY}, ${JSON.stringify(sanitizeForJsonb(existingCache))}::jsonb, NOW())
      ON CONFLICT (key) DO UPDATE SET
        value = EXCLUDED.value,
        updated_at = NOW();
    `;
  }

  await invalidateEdgeCache('newborn:launchpad');

  return {
    ok: Boolean(trendsRes.ok || zeroQueryRes.ok),
    country: resolvedCountry,
    trend_type: resolvedType,
    l1_interest: resolvedInterest,
    trends: trendsRes.trends || [],
    popular_terms: zeroQueryRes.popular_terms || zeroQueryRes.terms || [],
    ideas_for_you_terms: zeroQueryRes.ideas_for_you_terms || [],
    zero_query_used_guest_fallback: Boolean(zeroQueryRes.used_guest_fallback),
    router_telemetry: router.getRedactedTelemetry(),
    cached_at: nowIso
  };
}
