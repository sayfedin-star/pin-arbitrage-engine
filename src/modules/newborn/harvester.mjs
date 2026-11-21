/**
 * src/modules/newborn/harvester.mjs
 *
 * 8-Surface Newborn Discovery Harvester, 50x Pidgets Pre-Triage,
 * Zero-Cookie Pin/User Hydration, Multi-Hop Golden Pin Snowball,
 * and Strictly Isolated Staging Persistence (`newborn_candidates`,
 * `newborn_candidate_snapshots`, `newborn_rookie_accounts`, `newborn_runs`).
 *
 * [INVARIANT: ZERO-POLLUTION-STAGING]
 * Discovery and watchlist polling NEVER write to `universal_master_pins` or `competitor_profiles`.
 */

import { Semaphore, sanitizeForJsonb } from '../../utils.mjs';
import { redactSecrets } from '../../http/security-and-response.mjs';
import { NewbornCookieRouter } from './cookie-router.mjs';
import {
  resolveEffectiveNewbornSettings,
  resolveNewbornRawCookie,
  stampAutomationRunTimestamp
} from './settings.mjs';
import {
  formatPinterestBoardUrl,
  mergeCandidatePinRecords,
  resolveIdeaPageIntelligence,
  harvestGrowingTrendsSurface,
  harvestZeroQueryPopularSurface,
  harvestPinSerpWithCapsulesSurface,
  harvestFreshBoardsSurface,
  harvestBoardFeedSurface,
  harvestBoardMoreIdeasSurface,
  harvestIdeasHubSurface,
  harvestHomeFeedSurface,
  harvestRelatedPinSnowballSurface,
  pretriageCandidatesWithPidgets,
  hydratePinZeroCookie,
  hydrateUserZeroCookie
} from './surfaces.mjs';
import {
  scoreNewbornCandidate,
  evaluatePinAutoRules,
  scoreRookieCreator,
  evaluateRookieAutoRules,
  buildPeerAnnotationCounts,
  synthesizeNewbornCrossoverBlueprint,
  buildNewbornCrossoverMatrix
} from './intelligence.mjs';

function toIsoDateUtc(ms = Date.now()) {
  return new Date(ms).toISOString().slice(0, 10);
}

function computeNextConsecutiveDays(prevDays, prevDateVal, todayDateStr, qualified) {
  if (!qualified) {
    return {
      consecutive_qualifying_days: 0,
      last_qualified_date: prevDateVal ? String(prevDateVal).slice(0, 10) : null
    };
  }
  const prevStr = prevDateVal
    ? (prevDateVal instanceof Date ? prevDateVal.toISOString().slice(0, 10) : String(prevDateVal).slice(0, 10))
    : null;

  if (prevStr === todayDateStr) {
    return {
      consecutive_qualifying_days: Math.max(1, Number(prevDays || 0)),
      last_qualified_date: todayDateStr
    };
  }

  if (prevStr) {
    const prevMs = Date.parse(`${prevStr}T00:00:00Z`);
    const todayMs = Date.parse(`${todayDateStr}T00:00:00Z`);
    const diffDays = Math.round((todayMs - prevMs) / 86_400_000);
    if (diffDays === 1) {
      return {
        consecutive_qualifying_days: Math.max(0, Number(prevDays || 0)) + 1,
        last_qualified_date: todayDateStr
      };
    }
  }

  return {
    consecutive_qualifying_days: 1,
    last_qualified_date: todayDateStr
  };
}

/**
 * Atomically upserts staged Newborn candidates + daily staging snapshots into
 * `newborn_candidates` and `newborn_candidate_snapshots` (zero pollution of SSOT tables).
 */
export async function upsertStagedCandidatesBatch(
  sql,
  candidates = [],
  { profileId = null, runId = null, folderId = null, nowMs = Date.now(), isWatchlistPoll = false } = {}
) {
  if (!sql || typeof sql !== 'function' || !Array.isArray(candidates) || candidates.length === 0) {
    return { upserted: 0, rows: [] };
  }

  const todayDate = toIsoDateUtc(nowMs);
  const nowIso = new Date(nowMs).toISOString();
  const numericRunId = runId !== null && runId !== undefined && Number(runId) > 0 ? Number(runId) : null;
  const numericFolderId = folderId !== null && folderId !== undefined && Number(folderId) > 0 ? Number(folderId) : null;

  // Deduplicate by pin_id before SQL
  const dedupMap = new Map();
  for (const c of candidates) {
    const pid = String(c?.pin_id || '').trim();
    if (!pid) continue;
    dedupMap.set(pid, c);
  }
  const pinIds = Array.from(dedupMap.keys()).sort((a, b) => a.localeCompare(b));
  if (pinIds.length === 0) return { upserted: 0, rows: [] };

  // Fetch existing staging state to preserve promoted/discarded stages and compute consecutive_qualifying_days
  const existingRows = await sql`
    SELECT
      pin_id,
      stage,
      discovered_surfaces,
      repin_count,
      save_count,
      consecutive_qualifying_days,
      last_qualified_date,
      watchlist_added_at,
      promoted_at,
      promoted_destinations
    FROM newborn_candidates
    WHERE pin_id = ANY(${pinIds}::text[]);
  `;

  const existingMap = new Map();
  for (const r of (existingRows || [])) {
    existingMap.set(String(r.pin_id), r);
  }

  const preparedRecords = [];
  const snapshotRecords = [];

  for (const pid of pinIds) {
    const c = dedupMap.get(pid);
    const prev = existingMap.get(pid) || null;

    const mergedSurfaces = Array.from(new Set([
      ...(Array.isArray(prev?.discovered_surfaces) ? prev.discovered_surfaces : []),
      ...(Array.isArray(c.discovered_surfaces) ? c.discovered_surfaces : [c.first_surface || 'pin_serp_capsules'])
    ]));

    // Stage preservation: never downgrade promoted or discarded candidates on re-discovery
    let nextStage = c.stage || prev?.stage || 'discovered';
    if (prev?.stage === 'promoted' || prev?.stage === 'discarded') {
      nextStage = prev.stage;
    } else if (prev?.stage === 'watchlist' && nextStage === 'discovered') {
      nextStage = 'watchlist';
    }

    const consec = computeNextConsecutiveDays(
      prev?.consecutive_qualifying_days ?? c.consecutive_qualifying_days ?? 0,
      prev?.last_qualified_date ?? c.last_qualified_date ?? null,
      todayDate,
      c.qualified !== false
    );

    const prevRepins = prev?.repin_count != null ? Number(prev.repin_count) : null;
    const prevSaves = prev?.save_count != null ? Number(prev.save_count) : null;
    const dailyRepinDelta = (c.repin_count != null && prevRepins != null)
      ? Math.max(0, Number(c.repin_count) - prevRepins)
      : (c.daily_repin_delta ?? null);
    const dailySaveDelta = (c.save_count != null && prevSaves != null)
      ? Math.max(0, Number(c.save_count) - prevSaves)
      : (c.daily_save_delta ?? null);

    const watchlistAddedAt = nextStage === 'watchlist'
      ? (prev?.watchlist_added_at ? new Date(prev.watchlist_added_at).toISOString() : nowIso)
      : (prev?.watchlist_added_at ? new Date(prev.watchlist_added_at).toISOString() : null);

    const record = {
      pin_id: pid,
      stage: nextStage,
      first_surface: c.first_surface || 'pin_serp_capsules',
      discovered_surfaces: mergedSurfaces,
      seed_query: c.seed_query || null,
      snowball_parent_pin_id: c.snowball_parent_pin_id || null,
      snowball_hop: Number(c.snowball_hop ?? 0),
      title: String(c.title || ''),
      description: String(c.description || ''),
      alt_text: String(c.alt_text || ''),
      image_url: c.image_url || null,
      image_signature: c.image_signature || null,
      dominant_color: c.dominant_color || '#888888',
      destination_url: c.destination_url || null,
      clean_domain: c.clean_domain || null,
      is_linkless: Boolean(c.is_linkless),
      pinner_username: c.pinner_username || null,
      pinner_full_name: c.pinner_full_name || null,
      pinner_followers: c.pinner_followers != null ? Math.round(Number(c.pinner_followers)) : null,
      origin_creator_username: c.origin_creator_username || null,
      origin_creator_full_name: c.origin_creator_full_name || null,
      origin_creator_followers: c.origin_creator_followers != null ? Math.round(Number(c.origin_creator_followers)) : null,
      effective_creator_username: c.effective_creator_username || null,
      effective_creator_followers: c.effective_creator_followers != null ? Math.round(Number(c.effective_creator_followers)) : null,
      creator_monthly_reach: c.creator_monthly_reach != null ? Math.round(Number(c.creator_monthly_reach)) : null,
      creator_profile_views: c.creator_profile_views != null ? Math.round(Number(c.creator_profile_views)) : null,
      creator_pin_count: c.creator_pin_count != null ? Math.round(Number(c.creator_pin_count)) : null,
      is_repin: Boolean(c.is_repin),
      board_id: c.board_id || null,
      board_name: c.board_name || null,
      board_url: formatPinterestBoardUrl(c.board_url || ''),
      board_order_modified_at: c.board_order_modified_at || null,
      upload_provenance: c.upload_provenance || 'UNKNOWN',
      raw_creation_method: c.raw_creation_method || null,
      has_ai_disclosure: Boolean(c.has_ai_disclosure),
      is_video: Boolean(c.is_video),
      is_carousel: Boolean(c.is_carousel),
      is_product: Boolean(c.is_product),
      created_at_pinterest: c.created_at_pinterest || null,
      age_days: c.age_days != null ? Number(c.age_days) : null,
      save_count: c.save_count != null ? Math.round(Number(c.save_count)) : null,
      repin_count: c.repin_count != null ? Math.round(Number(c.repin_count)) : null,
      comment_count: c.comment_count != null ? Math.round(Number(c.comment_count)) : null,
      share_count: c.share_count != null ? Math.round(Number(c.share_count)) : null,
      reaction_count: c.reaction_count != null ? Math.round(Number(c.reaction_count)) : null,
      is_hydrated: Boolean(c.is_hydrated),
      repin_per_day: c.repin_per_day != null ? Number(c.repin_per_day) : null,
      save_per_day: c.save_per_day != null ? Number(c.save_per_day) : null,
      daily_repin_delta: dailyRepinDelta,
      daily_save_delta: dailySaveDelta,
      golden_score: Number(c.golden_score ?? 0),
      is_golden_pin: Boolean(c.is_golden_pin),
      is_rookie_outlier: Boolean(c.is_rookie_outlier),
      outlier_ratio: c.outlier_ratio != null ? Number(c.outlier_ratio) : null,
      visual_annotations: Array.isArray(c.visual_annotations) ? c.visual_annotations : [],
      guided_capsules: Array.isArray(c.guided_capsules) ? c.guided_capsules : [],
      crossover_blueprint: c.crossover_blueprint && typeof c.crossover_blueprint === 'object' ? c.crossover_blueprint : {},
      consecutive_qualifying_days: consec.consecutive_qualifying_days,
      last_qualified_date: consec.last_qualified_date,
      watchlist_added_at: watchlistAddedAt,
      last_polled_at: isWatchlistPoll ? nowIso : null,
      profile_id: profileId != null ? Number(profileId) : null,
      first_run_id: numericRunId,
      last_run_id: numericRunId,
      folder_id: numericFolderId,
      metadata: sanitizeForJsonb({
        disqualification_reasons: c.disqualification_reasons || [],
        qualified: c.qualified !== false,
        root_pin_id: c.root_pin_id || c.canonical_pin_id || pid,
        root_age_verified: c.root_age_verified !== false,
        board_pin_count: c.board_pin_count != null ? Math.round(Number(c.board_pin_count)) : (c.metadata?.board_pin_count ?? null),
        board_follower_count: c.board_follower_count != null ? Math.round(Number(c.board_follower_count)) : (c.metadata?.board_follower_count ?? null)
      }),
      board_pin_count: c.board_pin_count != null ? Math.round(Number(c.board_pin_count)) : (c.metadata?.board_pin_count ?? null),
      board_follower_count: c.board_follower_count != null ? Math.round(Number(c.board_follower_count)) : (c.metadata?.board_follower_count ?? null),
      matched_queries: Array.from(new Set([
        ...(Array.isArray(c.matched_queries) ? c.matched_queries : []),
        ...(c.seed_query ? [c.seed_query] : [])
      ].map((q) => String(q || '').trim().toLowerCase()).filter(Boolean))),
      qualified: c.qualified !== false
    };

    preparedRecords.push(record);
    snapshotRecords.push({
      pin_id: pid,
      recorded_date: todayDate,
      save_count: record.save_count,
      repin_count: record.repin_count,
      comment_count: record.comment_count,
      share_count: record.share_count,
      reaction_count: record.reaction_count,
      repin_per_day: record.repin_per_day,
      save_per_day: record.save_per_day,
      golden_score: record.golden_score,
      qualified: record.qualified
    });
  }

  const candidatesJson = JSON.stringify(sanitizeForJsonb(preparedRecords));
  const snapshotsJson = JSON.stringify(sanitizeForJsonb(snapshotRecords));
  const runCandidatesRecords = numericRunId !== null
    ? preparedRecords.map((r) => ({
        run_id: numericRunId,
        pin_id: r.pin_id,
        seed_query: r.seed_query || null,
        matched_queries: Array.isArray(r.matched_queries) ? r.matched_queries : [],
        surface: r.first_surface || 'pin_serp_capsules',
        qualified_in_run: Boolean(r.qualified),
        golden_score_in_run: Number(r.golden_score ?? 0)
      }))
    : [];
  const runCandidatesJson = runCandidatesRecords.length > 0
    ? JSON.stringify(sanitizeForJsonb(runCandidatesRecords))
    : null;
  const runInTx = async (fn) => (typeof sql.begin === 'function' ? sql.begin(fn) : fn(sql));

  await runInTx(async (tx) => {
    await tx`
      INSERT INTO newborn_candidates (
        pin_id, stage, qualified, first_run_id, last_run_id, folder_id,
        first_surface, discovered_surfaces, seed_query,
        snowball_parent_pin_id, snowball_hop, title, description, alt_text,
        image_url, image_signature, dominant_color, destination_url, clean_domain, is_linkless,
        pinner_username, pinner_full_name, pinner_followers,
        origin_creator_username, origin_creator_full_name, origin_creator_followers,
        effective_creator_username, effective_creator_followers,
        creator_monthly_reach, creator_profile_views, creator_pin_count, is_repin,
        board_id, board_name, board_url, board_order_modified_at,
        upload_provenance, raw_creation_method, has_ai_disclosure,
        is_video, is_carousel, is_product,
        created_at_pinterest, age_days,
        save_count, repin_count, comment_count, share_count, reaction_count, is_hydrated,
        repin_per_day, save_per_day, daily_repin_delta, daily_save_delta,
        golden_score, is_golden_pin, is_rookie_outlier, outlier_ratio,
        visual_annotations, guided_capsules, crossover_blueprint,
        consecutive_qualifying_days, last_qualified_date,
        watchlist_added_at, last_polled_at, profile_id, metadata,
        first_seen_at, last_seen_at, updated_at
      )
      SELECT
        u.pin_id, u.stage, u.qualified, u.first_run_id, u.last_run_id, u.folder_id,
        u.first_surface, u.discovered_surfaces, u.seed_query,
        u.snowball_parent_pin_id, u.snowball_hop, u.title, u.description, u.alt_text,
        u.image_url, u.image_signature, u.dominant_color, u.destination_url, u.clean_domain, u.is_linkless,
        u.pinner_username, u.pinner_full_name, u.pinner_followers,
        u.origin_creator_username, u.origin_creator_full_name, u.origin_creator_followers,
        u.effective_creator_username, u.effective_creator_followers,
        u.creator_monthly_reach, u.creator_profile_views, u.creator_pin_count, u.is_repin,
        u.board_id, u.board_name, u.board_url, NULLIF(u.board_order_modified_at, '')::timestamptz,
        u.upload_provenance, u.raw_creation_method, u.has_ai_disclosure,
        u.is_video, u.is_carousel, u.is_product,
        NULLIF(u.created_at_pinterest, '')::timestamptz, u.age_days,
        u.save_count, u.repin_count, u.comment_count, u.share_count, u.reaction_count, u.is_hydrated,
        u.repin_per_day, u.save_per_day, u.daily_repin_delta, u.daily_save_delta,
        u.golden_score, u.is_golden_pin, u.is_rookie_outlier, u.outlier_ratio,
        u.visual_annotations, u.guided_capsules, u.crossover_blueprint,
        u.consecutive_qualifying_days, NULLIF(u.last_qualified_date, '')::date,
        NULLIF(u.watchlist_added_at, '')::timestamptz,
        NULLIF(u.last_polled_at, '')::timestamptz,
        u.profile_id, u.metadata,
        NOW(), NOW(), NOW()
      FROM jsonb_to_recordset(${candidatesJson}::jsonb) AS u(
        pin_id text, stage text, qualified boolean, first_run_id bigint, last_run_id bigint, folder_id int,
        first_surface text, discovered_surfaces jsonb, seed_query text,
        snowball_parent_pin_id text, snowball_hop int, title text, description text, alt_text text,
        image_url text, image_signature text, dominant_color text, destination_url text, clean_domain text, is_linkless boolean,
        pinner_username text, pinner_full_name text, pinner_followers int,
        origin_creator_username text, origin_creator_full_name text, origin_creator_followers int,
        effective_creator_username text, effective_creator_followers int,
        creator_monthly_reach bigint, creator_profile_views bigint, creator_pin_count int, is_repin boolean,
        board_id text, board_name text, board_url text, board_order_modified_at text,
        upload_provenance text, raw_creation_method text, has_ai_disclosure boolean,
        is_video boolean, is_carousel boolean, is_product boolean,
        created_at_pinterest text, age_days double precision,
        save_count bigint, repin_count bigint, comment_count int, share_count int, reaction_count int, is_hydrated boolean,
        repin_per_day double precision, save_per_day double precision, daily_repin_delta double precision, daily_save_delta double precision,
        golden_score double precision, is_golden_pin boolean, is_rookie_outlier boolean, outlier_ratio double precision,
        visual_annotations jsonb, guided_capsules jsonb, crossover_blueprint jsonb,
        consecutive_qualifying_days int, last_qualified_date text,
        watchlist_added_at text, last_polled_at text, profile_id int, metadata jsonb
      )
      ORDER BY u.pin_id ASC
      ON CONFLICT (pin_id) DO UPDATE SET
        stage = CASE
          WHEN newborn_candidates.stage IN ('promoted', 'discarded') THEN newborn_candidates.stage
          ELSE EXCLUDED.stage
        END,
        qualified = EXCLUDED.qualified,
        first_run_id = COALESCE(newborn_candidates.first_run_id, EXCLUDED.first_run_id),
        last_run_id = COALESCE(EXCLUDED.last_run_id, newborn_candidates.last_run_id),
        folder_id = COALESCE(EXCLUDED.folder_id, newborn_candidates.folder_id),
        discovered_surfaces = EXCLUDED.discovered_surfaces,
        seed_query = COALESCE(EXCLUDED.seed_query, newborn_candidates.seed_query),
        snowball_parent_pin_id = COALESCE(newborn_candidates.snowball_parent_pin_id, EXCLUDED.snowball_parent_pin_id),
        title = COALESCE(NULLIF(EXCLUDED.title, ''), newborn_candidates.title),
        description = COALESCE(NULLIF(EXCLUDED.description, ''), newborn_candidates.description),
        alt_text = COALESCE(NULLIF(EXCLUDED.alt_text, ''), newborn_candidates.alt_text),
        image_url = COALESCE(NULLIF(EXCLUDED.image_url, ''), newborn_candidates.image_url),
        image_signature = COALESCE(NULLIF(EXCLUDED.image_signature, ''), newborn_candidates.image_signature),
        dominant_color = CASE WHEN EXCLUDED.dominant_color <> '#888888' THEN EXCLUDED.dominant_color ELSE newborn_candidates.dominant_color END,
        destination_url = COALESCE(EXCLUDED.destination_url, newborn_candidates.destination_url),
        clean_domain = COALESCE(EXCLUDED.clean_domain, newborn_candidates.clean_domain),
        is_linkless = EXCLUDED.is_linkless,
        pinner_username = COALESCE(EXCLUDED.pinner_username, newborn_candidates.pinner_username),
        pinner_full_name = COALESCE(EXCLUDED.pinner_full_name, newborn_candidates.pinner_full_name),
        pinner_followers = COALESCE(EXCLUDED.pinner_followers, newborn_candidates.pinner_followers),
        origin_creator_username = COALESCE(EXCLUDED.origin_creator_username, newborn_candidates.origin_creator_username),
        origin_creator_full_name = COALESCE(EXCLUDED.origin_creator_full_name, newborn_candidates.origin_creator_full_name),
        origin_creator_followers = COALESCE(EXCLUDED.origin_creator_followers, newborn_candidates.origin_creator_followers),
        effective_creator_username = COALESCE(EXCLUDED.effective_creator_username, newborn_candidates.effective_creator_username),
        effective_creator_followers = COALESCE(EXCLUDED.effective_creator_followers, newborn_candidates.effective_creator_followers),
        creator_monthly_reach = COALESCE(EXCLUDED.creator_monthly_reach, newborn_candidates.creator_monthly_reach),
        creator_profile_views = COALESCE(EXCLUDED.creator_profile_views, newborn_candidates.creator_profile_views),
        creator_pin_count = COALESCE(EXCLUDED.creator_pin_count, newborn_candidates.creator_pin_count),
        is_repin = (newborn_candidates.is_repin OR EXCLUDED.is_repin),
        board_id = COALESCE(EXCLUDED.board_id, newborn_candidates.board_id),
        board_name = COALESCE(EXCLUDED.board_name, newborn_candidates.board_name),
        board_url = COALESCE(EXCLUDED.board_url, newborn_candidates.board_url),
        board_order_modified_at = COALESCE(EXCLUDED.board_order_modified_at, newborn_candidates.board_order_modified_at),
        upload_provenance = CASE WHEN EXCLUDED.upload_provenance <> 'UNKNOWN' THEN EXCLUDED.upload_provenance ELSE newborn_candidates.upload_provenance END,
        raw_creation_method = COALESCE(EXCLUDED.raw_creation_method, newborn_candidates.raw_creation_method),
        has_ai_disclosure = (newborn_candidates.has_ai_disclosure OR EXCLUDED.has_ai_disclosure),
        is_video = (newborn_candidates.is_video OR EXCLUDED.is_video),
        is_carousel = (newborn_candidates.is_carousel OR EXCLUDED.is_carousel),
        is_product = (newborn_candidates.is_product OR EXCLUDED.is_product),
        created_at_pinterest = COALESCE(EXCLUDED.created_at_pinterest, newborn_candidates.created_at_pinterest),
        age_days = COALESCE(EXCLUDED.age_days, newborn_candidates.age_days),
        save_count = COALESCE(EXCLUDED.save_count, newborn_candidates.save_count),
        repin_count = COALESCE(EXCLUDED.repin_count, newborn_candidates.repin_count),
        comment_count = COALESCE(EXCLUDED.comment_count, newborn_candidates.comment_count),
        share_count = COALESCE(EXCLUDED.share_count, newborn_candidates.share_count),
        reaction_count = COALESCE(EXCLUDED.reaction_count, newborn_candidates.reaction_count),
        is_hydrated = (newborn_candidates.is_hydrated OR EXCLUDED.is_hydrated),
        repin_per_day = COALESCE(EXCLUDED.repin_per_day, newborn_candidates.repin_per_day),
        save_per_day = COALESCE(EXCLUDED.save_per_day, newborn_candidates.save_per_day),
        daily_repin_delta = COALESCE(EXCLUDED.daily_repin_delta, newborn_candidates.daily_repin_delta),
        daily_save_delta = COALESCE(EXCLUDED.daily_save_delta, newborn_candidates.daily_save_delta),
        golden_score = EXCLUDED.golden_score,
        is_golden_pin = EXCLUDED.is_golden_pin,
        is_rookie_outlier = EXCLUDED.is_rookie_outlier,
        outlier_ratio = COALESCE(EXCLUDED.outlier_ratio, newborn_candidates.outlier_ratio),
        visual_annotations = CASE WHEN jsonb_array_length(EXCLUDED.visual_annotations) > 0 THEN EXCLUDED.visual_annotations ELSE newborn_candidates.visual_annotations END,
        guided_capsules = CASE WHEN jsonb_array_length(EXCLUDED.guided_capsules) > 0 THEN EXCLUDED.guided_capsules ELSE newborn_candidates.guided_capsules END,
        crossover_blueprint = CASE WHEN EXCLUDED.crossover_blueprint <> '{}'::jsonb THEN EXCLUDED.crossover_blueprint ELSE newborn_candidates.crossover_blueprint END,
        consecutive_qualifying_days = EXCLUDED.consecutive_qualifying_days,
        last_qualified_date = COALESCE(EXCLUDED.last_qualified_date, newborn_candidates.last_qualified_date),
        watchlist_added_at = COALESCE(newborn_candidates.watchlist_added_at, EXCLUDED.watchlist_added_at),
        last_polled_at = COALESCE(EXCLUDED.last_polled_at, newborn_candidates.last_polled_at),
        profile_id = COALESCE(EXCLUDED.profile_id, newborn_candidates.profile_id),
        metadata = newborn_candidates.metadata || EXCLUDED.metadata,
        last_seen_at = NOW(),
        updated_at = NOW();
    `;

    await tx`
      INSERT INTO newborn_candidate_snapshots (
        pin_id, recorded_date, save_count, repin_count, comment_count, share_count, reaction_count,
        repin_per_day, save_per_day, golden_score, qualified, updated_at
      )
      SELECT
        s.pin_id,
        s.recorded_date::date,
        s.save_count,
        s.repin_count,
        s.comment_count,
        s.share_count,
        s.reaction_count,
        s.repin_per_day,
        s.save_per_day,
        s.golden_score,
        s.qualified,
        NOW()
      FROM jsonb_to_recordset(${snapshotsJson}::jsonb) AS s(
        pin_id text,
        recorded_date text,
        save_count bigint,
        repin_count bigint,
        comment_count int,
        share_count int,
        reaction_count int,
        repin_per_day double precision,
        save_per_day double precision,
        golden_score double precision,
        qualified boolean
      )
      ORDER BY s.pin_id ASC
      ON CONFLICT (pin_id, recorded_date) DO UPDATE SET
        save_count = COALESCE(EXCLUDED.save_count, newborn_candidate_snapshots.save_count),
        repin_count = COALESCE(EXCLUDED.repin_count, newborn_candidate_snapshots.repin_count),
        comment_count = COALESCE(EXCLUDED.comment_count, newborn_candidate_snapshots.comment_count),
        share_count = COALESCE(EXCLUDED.share_count, newborn_candidate_snapshots.share_count),
        reaction_count = COALESCE(EXCLUDED.reaction_count, newborn_candidate_snapshots.reaction_count),
        repin_per_day = COALESCE(EXCLUDED.repin_per_day, newborn_candidate_snapshots.repin_per_day),
        save_per_day = COALESCE(EXCLUDED.save_per_day, newborn_candidate_snapshots.save_per_day),
        golden_score = EXCLUDED.golden_score,
        qualified = EXCLUDED.qualified,
        updated_at = NOW();
    `;

    if (runCandidatesJson) {
      await tx`
        INSERT INTO newborn_run_candidates (
          run_id, pin_id, seed_query, matched_queries, surface, qualified_in_run, golden_score_in_run, created_at
        )
        SELECT
          r.run_id,
          r.pin_id,
          r.seed_query,
          COALESCE(r.matched_queries, '[]'::jsonb),
          r.surface,
          r.qualified_in_run,
          r.golden_score_in_run,
          NOW()
        FROM jsonb_to_recordset(${runCandidatesJson}::jsonb) AS r(
          run_id bigint,
          pin_id text,
          seed_query text,
          matched_queries jsonb,
          surface text,
          qualified_in_run boolean,
          golden_score_in_run double precision
        )
        ORDER BY r.pin_id ASC
        ON CONFLICT (run_id, pin_id) DO UPDATE SET
          seed_query = COALESCE(EXCLUDED.seed_query, newborn_run_candidates.seed_query),
          matched_queries = CASE
            WHEN jsonb_array_length(COALESCE(EXCLUDED.matched_queries, '[]'::jsonb)) > 0 THEN EXCLUDED.matched_queries
            ELSE newborn_run_candidates.matched_queries
          END,
          surface = COALESCE(EXCLUDED.surface, newborn_run_candidates.surface),
          qualified_in_run = EXCLUDED.qualified_in_run,
          golden_score_in_run = EXCLUDED.golden_score_in_run;
      `;
    }
  });

  return { upserted: preparedRecords.length, rows: preparedRecords };
}

/**
 * Atomically upserts staged Rookie Accounts into `newborn_rookie_accounts`
 * (strictly isolated from `competitor_profiles` until promoted!).
 */
export async function upsertStagedRookiesBatch(sql, rookies = [], { nowMs = Date.now(), isWatchlistPoll = false } = {}) {
  if (!sql || typeof sql !== 'function' || !Array.isArray(rookies) || rookies.length === 0) {
    return { upserted: 0, rows: [] };
  }

  const todayDate = toIsoDateUtc(nowMs);
  const nowIso = new Date(nowMs).toISOString();

  const dedupMap = new Map();
  for (const r of rookies) {
    const uname = String(r?.username || '').trim().toLowerCase();
    if (!uname) continue;
    dedupMap.set(uname, r);
  }
  const usernames = Array.from(dedupMap.keys()).sort((a, b) => a.localeCompare(b));
  if (usernames.length === 0) return { upserted: 0, rows: [] };

  const existingRows = await sql`
    SELECT username, stage, consecutive_qualifying_days, last_qualified_date
    FROM newborn_rookie_accounts
    WHERE username = ANY(${usernames}::text[]);
  `;
  const existingMap = new Map();
  for (const er of (existingRows || [])) {
    existingMap.set(String(er.username).toLowerCase(), er);
  }

  const prepared = [];
  for (const uname of usernames) {
    const r = dedupMap.get(uname);
    const prev = existingMap.get(uname) || null;

    let nextStage = r.stage || prev?.stage || 'discovered';
    if (prev?.stage === 'promoted' || prev?.stage === 'discarded') {
      nextStage = prev.stage;
    } else if (prev?.stage === 'watchlist' && nextStage === 'discovered') {
      nextStage = 'watchlist';
    }

    const consec = computeNextConsecutiveDays(
      prev?.consecutive_qualifying_days ?? r.consecutive_qualifying_days ?? 0,
      prev?.last_qualified_date ?? r.last_qualified_date ?? null,
      todayDate,
      Boolean(r.is_qualified_rookie)
    );

    prepared.push({
      username: uname,
      stage: nextStage,
      display_name: r.display_name || uname,
      avatar_url: r.avatar_url || null,
      website_url: r.website_url || null,
      clean_domain: r.clean_domain || null,
      follower_count: r.follower_count != null ? Math.round(Number(r.follower_count)) : null,
      monthly_reach: r.monthly_reach != null ? Math.round(Number(r.monthly_reach)) : null,
      profile_views: r.profile_views != null ? Math.round(Number(r.profile_views)) : null,
      pin_count: r.pin_count != null ? Math.round(Number(r.pin_count)) : null,
      board_count: r.board_count != null ? Math.round(Number(r.board_count)) : null,
      account_created_at: r.account_created_at || null,
      rookie_score: Number(r.rookie_score ?? 0),
      outlier_multiplier: r.outlier_multiplier != null ? Number(r.outlier_multiplier) : null,
      golden_pins_count: Math.round(Number(r.golden_pins_count ?? 0)),
      sample_pin_ids: Array.isArray(r.sample_pin_ids) ? r.sample_pin_ids : [],
      top_annotations: Array.isArray(r.top_annotations) ? r.top_annotations : [],
      consecutive_qualifying_days: consec.consecutive_qualifying_days,
      last_qualified_date: consec.last_qualified_date,
      last_polled_at: isWatchlistPoll ? nowIso : null
    });
  }

  const payloadJson = JSON.stringify(sanitizeForJsonb(prepared));
  await sql`
    INSERT INTO newborn_rookie_accounts (
      username, stage, display_name, avatar_url, website_url, clean_domain,
      follower_count, monthly_reach, profile_views, pin_count, board_count,
      account_created_at, rookie_score, outlier_multiplier, golden_pins_count,
      sample_pin_ids, top_annotations, consecutive_qualifying_days, last_qualified_date,
      last_polled_at, first_seen_at, updated_at
    )
    SELECT
      u.username, u.stage, u.display_name, u.avatar_url, u.website_url, u.clean_domain,
      u.follower_count, u.monthly_reach, u.profile_views, u.pin_count, u.board_count,
      NULLIF(u.account_created_at, '')::timestamptz,
      u.rookie_score, u.outlier_multiplier, u.golden_pins_count,
      u.sample_pin_ids, u.top_annotations, u.consecutive_qualifying_days,
      NULLIF(u.last_qualified_date, '')::date,
      NULLIF(u.last_polled_at, '')::timestamptz,
      NOW(), NOW()
    FROM jsonb_to_recordset(${payloadJson}::jsonb) AS u(
      username text, stage text, display_name text, avatar_url text, website_url text, clean_domain text,
      follower_count int, monthly_reach bigint, profile_views bigint, pin_count int, board_count int,
      account_created_at text, rookie_score double precision, outlier_multiplier double precision, golden_pins_count int,
      sample_pin_ids jsonb, top_annotations jsonb, consecutive_qualifying_days int, last_qualified_date text,
      last_polled_at text
    )
    ORDER BY u.username ASC
    ON CONFLICT (username) DO UPDATE SET
      stage = CASE
        WHEN newborn_rookie_accounts.stage IN ('promoted', 'discarded') THEN newborn_rookie_accounts.stage
        ELSE EXCLUDED.stage
      END,
      display_name = COALESCE(NULLIF(EXCLUDED.display_name, ''), newborn_rookie_accounts.display_name),
      avatar_url = COALESCE(EXCLUDED.avatar_url, newborn_rookie_accounts.avatar_url),
      website_url = COALESCE(EXCLUDED.website_url, newborn_rookie_accounts.website_url),
      clean_domain = COALESCE(EXCLUDED.clean_domain, newborn_rookie_accounts.clean_domain),
      follower_count = COALESCE(EXCLUDED.follower_count, newborn_rookie_accounts.follower_count),
      monthly_reach = COALESCE(EXCLUDED.monthly_reach, newborn_rookie_accounts.monthly_reach),
      profile_views = COALESCE(EXCLUDED.profile_views, newborn_rookie_accounts.profile_views),
      pin_count = COALESCE(EXCLUDED.pin_count, newborn_rookie_accounts.pin_count),
      board_count = COALESCE(EXCLUDED.board_count, newborn_rookie_accounts.board_count),
      account_created_at = COALESCE(EXCLUDED.account_created_at, newborn_rookie_accounts.account_created_at),
      rookie_score = EXCLUDED.rookie_score,
      outlier_multiplier = COALESCE(EXCLUDED.outlier_multiplier, newborn_rookie_accounts.outlier_multiplier),
      golden_pins_count = GREATEST(newborn_rookie_accounts.golden_pins_count, EXCLUDED.golden_pins_count),
      sample_pin_ids = CASE WHEN jsonb_array_length(EXCLUDED.sample_pin_ids) > 0 THEN EXCLUDED.sample_pin_ids ELSE newborn_rookie_accounts.sample_pin_ids END,
      top_annotations = CASE WHEN jsonb_array_length(EXCLUDED.top_annotations) > 0 THEN EXCLUDED.top_annotations ELSE newborn_rookie_accounts.top_annotations END,
      consecutive_qualifying_days = EXCLUDED.consecutive_qualifying_days,
      last_qualified_date = COALESCE(EXCLUDED.last_qualified_date, newborn_rookie_accounts.last_qualified_date),
      last_polled_at = COALESCE(EXCLUDED.last_polled_at, newborn_rookie_accounts.last_polled_at),
      updated_at = NOW();
  `;

  return { upserted: prepared.length, rows: prepared };
}

/**
 * Executes the complete 8-Surface Newborn Discovery + Hydration + Snowball + Staging Pipeline.
 */
export async function executeNewbornHarvestPipeline(sql, options = {}) {
  const {
    seedQueries = [],
    seedPinIds = [],
    seedBoards = [],
    profileId = null,
    folderId = null,
    clusterId = null,
    existingRunId = null,
    settingsOverrides = null,
    rawCookieOverride = null,
    routerOptions = {},
    runType = 'discovery',
    snowballOnly = false,
    nowMs = Date.now(),
    onProgress = null,
    onAutoPromotePins = null,
    onAutoPromoteRookies = null
  } = options;

  const { settings, profile } = await resolveEffectiveNewbornSettings(sql, {
    profileId,
    overrides: settingsOverrides
  });

  const resolveRootPin = Boolean(settings.qualification?.resolve_root_pin === true);

  const resolvedCookie = rawCookieOverride !== null && rawCookieOverride !== undefined
    ? { rawCookie: String(rawCookieOverride).trim(), source: 'override' }
    : await resolveNewbornRawCookie(sql, routerOptions.env || {});

  const router = new NewbornCookieRouter({
    rawCookie: resolvedCookie.rawCookie,
    ...routerOptions
  });

  const cleanSeeds = Array.from(new Set(
    (Array.isArray(seedQueries) ? seedQueries : [seedQueries])
      .map((q) => String(q || '').trim().toLowerCase())
      .filter(Boolean)
  ));
  const cleanSeedBoards = Array.isArray(seedBoards)
    ? seedBoards.filter((sb) => sb && (sb.board_id || sb.clean_path || sb.url))
    : [];
  const cleanSeedPinIds = Array.from(new Set(
    (Array.isArray(seedPinIds) ? seedPinIds : [seedPinIds])
      .map((id) => String(id || '').trim())
      .filter(Boolean)
  ));
  const hasExplicitSeeds = cleanSeeds.length > 0 || cleanSeedBoards.length > 0 || cleanSeedPinIds.length > 0;
  const numericFolderId = folderId !== null && folderId !== undefined && Number(folderId) > 0 ? Number(folderId) : null;
  const numericClusterId = clusterId !== null && clusterId !== undefined && Number(clusterId) > 0 ? Number(clusterId) : null;

  let runRowId = existingRunId !== null && existingRunId !== undefined && Number(existingRunId) > 0
    ? Number(existingRunId)
    : null;

  if (sql && typeof sql === 'function' && runRowId === null) {
    try {
      const [insertedRun] = await sql`
        INSERT INTO newborn_runs (
          run_type, status, progress_stage, progress_detail, progress_pct,
          profile_id, folder_id, cluster_id, seed_queries, cookie_mode, started_at
        )
        VALUES (
          ${runType},
          'running',
          'harvesting',
          '1. Harvesting search & fresh boards...',
          10,
          ${profile?.id ?? null},
          ${numericFolderId},
          ${numericClusterId},
          ${JSON.stringify(cleanSeeds)}::jsonb,
          ${router.effectiveMode},
          NOW()
        )
        RETURNING id;
      `;
      runRowId = insertedRun?.id ? Number(insertedRun.id) : null;
    } catch (_) {}
  }

  const funnel = {
    scrolled_pins: 0,
    matched_repins: 0,
    hydrated_pins: 0,
    board_repins_unwrapped: 0,
    verified_winners: 0,
    boards_scanned: 0,
    pages_scrolled: 0
  };
  let runIdeaPage = null;

  const reportProgress = async (stage, detail, pct, counters = null) => {
    const clampedPct = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
    if (counters && typeof counters === 'object') {
      if (counters.scrolled_pins !== undefined) funnel.scrolled_pins = Number(counters.scrolled_pins) || 0;
      if (counters.matched_repins !== undefined) funnel.matched_repins = Number(counters.matched_repins) || 0;
      if (counters.hydrated_pins !== undefined) funnel.hydrated_pins = Number(counters.hydrated_pins) || 0;
      if (counters.verified_winners !== undefined) funnel.verified_winners = Number(counters.verified_winners) || 0;
    }
    if (typeof onProgress === 'function') {
      try {
        onProgress({ stage, detail, pct: clampedPct, counters, funnel: { ...funnel }, idea_page: runIdeaPage });
      } catch (_) {}
    }
    if (sql && typeof sql === 'function' && runRowId !== null) {
      const liveTelemetryPatch = sanitizeForJsonb({
        funnel: { ...funnel },
        ...(runIdeaPage ? { idea_page: runIdeaPage } : {})
      });
      await sql`
        UPDATE newborn_runs
        SET
          progress_stage = ${stage},
          progress_detail = ${detail},
          progress_pct = ${clampedPct},
          cookie_mode = ${router.effectiveMode},
          candidates_discovered = COALESCE(${counters?.candidates_discovered ?? funnel.scrolled_pins}::int, candidates_discovered),
          candidates_qualified = COALESCE(${counters?.candidates_qualified ?? null}::int, candidates_qualified),
          golden_pins_count = COALESCE(${counters?.golden_pins_count ?? null}::int, golden_pins_count),
          telemetry = COALESCE(telemetry, '{}'::jsonb) || ${JSON.stringify(liveTelemetryPatch)}::jsonb
        WHERE id = ${runRowId};
      `.catch(() => {});
    }
  };

  const surfacesCfg = settings.discovery.surfaces;
  const surfacesExecuted = [];
  const candidateMap = new Map();
  const activeQueryPool = new Set(cleanSeeds);
  const discoveredCapsules = new Set();
  const discoveredTrends = [];
  const freshBoardsDiscovered = [];
  const rootPinCache = new Map();
  let snowballHopsExecuted = 0;

  const ingestCandidate = (cand) => {
    if (!cand || !cand.pin_id) return;
    // Unwrap board/feed repin to its explicit origin_pin_id ONLY when legacy `resolve_root_pin === true`
    if (resolveRootPin && cand.is_repin && cand.origin_pin_id && cand.origin_pin_id !== cand.pin_id && !cand.is_hydrated) {
      const unwrapped = {
        ...cand,
        pin_id: cand.origin_pin_id,
        root_pin_id: cand.origin_pin_id,
        unwrapped_from_repin_id: cand.pin_id,
        is_repin: false
      };
      candidateMap.set(unwrapped.pin_id, mergeCandidatePinRecords(candidateMap.get(unwrapped.pin_id), unwrapped));
      return;
    }
    candidateMap.set(cand.pin_id, mergeCandidatePinRecords(candidateMap.get(cand.pin_id), cand));
  };

  const hasExplicitIntent = hasExplicitSeeds || Boolean(surfacesCfg.home_feed?.enabled);

  try {
    await reportProgress('harvesting', '1. Scrolling enabled Pinterest extraction paths…', 8);

    if (!snowballOnly) {
      // Automatically resolve official Pinterest Idea Page metadata & search volume for explicit seed query
      if (cleanSeeds.length > 0) {
        runIdeaPage = await resolveIdeaPageIntelligence(cleanSeeds[0], {
          router,
          country: settings.discovery.country
        }).catch(() => null);
        if (runIdeaPage?.found) {
          await reportProgress(
            'harvesting',
            `Resolved Idea Page (${runIdeaPage.formatted_volume} searches) — scrolling enabled paths…`,
            12
          );
        }
      }

      // CRITICAL ZERO-POLLUTION INVARIANT:
      // Growing Trends & Zero-Query Popular belong strictly to unseeded autonomous sweeps
      // (zero explicit seeds AND not a dedicated Home Feed hunt).
      if (!hasExplicitIntent) {
        if (surfacesCfg.growing_trends?.enabled) {
          const trRes = await harvestGrowingTrendsSurface(router, {
            country: settings.discovery.country,
            l1Interest: settings.discovery.default_l1_interest || 'all',
            limit: surfacesCfg.growing_trends.limit || 25
          });
          surfacesExecuted.push('growing_trends');
          for (const t of (trRes.trends || [])) discoveredTrends.push(t);
          for (const p of (trRes.pins || [])) ingestCandidate(p);
          if (activeQueryPool.size === 0) {
            for (const term of (trRes.terms || []).slice(0, 4)) activeQueryPool.add(term);
          }
        }

        if (surfacesCfg.zero_query_popular?.enabled) {
          const zqRes = await harvestZeroQueryPopularSurface(router, {
            country: settings.discovery.country
          });
          surfacesExecuted.push('zero_query_popular');
          for (const p of (zqRes.pins || [])) ingestCandidate(p);
          if (activeQueryPool.size === 0) {
            for (const term of (zqRes.terms || []).slice(0, 4)) activeQueryPool.add(term);
          }
        }
      }

      const maxQueriesLimit = Math.max(1, Math.min(50, Number(settings.discovery?.max_queries_per_run) || 25));
      const queriesToRun = Array.from(activeQueryPool).slice(0, maxQueriesLimit);
      const pathTasks = [];

      // Path 1: Search (`BaseSearchResource/get`, `scope: "pins"`, up to 10,000 pins)
      if (surfacesCfg.pin_serp_capsules?.enabled && queriesToRun.length > 0) {
        surfacesExecuted.push('pin_serp_capsules');
        pathTasks.push((async () => {
          for (const q of queriesToRun) {
            const serpRes = await harvestPinSerpWithCapsulesSurface(router, q, {
              maxPages: surfacesCfg.pin_serp_capsules.max_pages,
              pageSize: surfacesCfg.pin_serp_capsules.page_size || 50,
              targetPins: surfacesCfg.pin_serp_capsules.target_pins ?? null,
              onPageProgress: async ({ pagesFetched }) => {
                funnel.pages_scrolled += 1;
                funnel.scrolled_pins = candidateMap.size;
                await reportProgress(
                  'harvesting',
                  `1. Deep-scrolling Search (page ${pagesFetched}, ${candidateMap.size} pins scrolled)…`,
                  Math.min(30, 12 + Math.round(pagesFetched * 0.4)),
                  { scrolled_pins: candidateMap.size, candidates_discovered: candidateMap.size }
                );
              }
            });
            funnel.pages_scrolled += Number(serpRes.pages_fetched || 0);
            for (const p of (serpRes.pins || [])) ingestCandidate(p);
            for (const cap of (serpRes.capsules || [])) {
              if (cap?.term) discoveredCapsules.add(`${q} ${cap.term}`.trim().toLowerCase());
            }
          }
        })());
      }

      // Path 2: Matching Boards -> Fair multi-query fan-out -> Primary "Find more ideas" (`board_more_ideas`)
      if ((surfacesCfg.fresh_boards?.enabled && queriesToRun.length > 0) || cleanSeedBoards.length > 0) {
        pathTasks.push((async () => {
          const maxBoardsLimit = Math.max(1, Math.min(50, Number(surfacesCfg.fresh_boards?.max_boards_to_expand) || 10));
          const perQueryBoardCap = queriesToRun.length > 1
            ? Math.max(2, Math.ceil(maxBoardsLimit / queriesToRun.length))
            : maxBoardsLimit;
          if (surfacesCfg.fresh_boards?.enabled && queriesToRun.length > 0) {
            surfacesExecuted.push('fresh_boards');
            const seenBoardIds = new Set();
            for (const q of queriesToRun) {
              const bRes = await harvestFreshBoardsSurface(router, q, {
                maxPages: surfacesCfg.fresh_boards.max_pages,
                maxBoards: perQueryBoardCap,
                maxBoardAgeDays: settings.discovery.max_board_age_days,
                nowMs
              });
              for (const b of (bRes.boards || [])) {
                if (!seenBoardIds.has(b.board_id)) {
                  seenBoardIds.add(b.board_id);
                  freshBoardsDiscovered.push(b);
                }
              }
            }
          }

          if (cleanSeedBoards.length > 0) {
            freshBoardsDiscovered.splice(0, 0, ...[...cleanSeedBoards].reverse());
          }

          const boardsToExpand = freshBoardsDiscovered.slice(0, maxBoardsLimit);
          if (boardsToExpand.length === 0) return;

          const boardSem = new Semaphore(5);
          // Legacy `board_feed` is OFF by default in Wave 6E; runs only when explicitly opted-in
          if (surfacesCfg.board_feed?.enabled === true) {
            surfacesExecuted.push('board_feed');
            await Promise.all(
              boardsToExpand.map((board) => boardSem.run(async () => {
                const bfRes = await harvestBoardFeedSurface(router, board, {
                  maxPages: surfacesCfg.board_feed.max_pages,
                  pageSize: surfacesCfg.board_feed.page_size || 100,
                  targetPins: surfacesCfg.board_feed.target_pins_per_board ?? null
                });
                funnel.boards_scanned++;
                funnel.pages_scrolled += Number(bfRes.pages_fetched || 0);
                for (const p of (bfRes.pins || [])) ingestCandidate(p);
                if (funnel.boards_scanned % 3 === 0 || funnel.boards_scanned === boardsToExpand.length) {
                  funnel.scrolled_pins = candidateMap.size;
                  await reportProgress(
                    'harvesting',
                    `1. Scanned ${funnel.boards_scanned}/${boardsToExpand.length} boards (${candidateMap.size} total pins scrolled)…`,
                    24,
                    { scrolled_pins: candidateMap.size, candidates_discovered: candidateMap.size }
                  );
                }
              }))
            );
          }

          // Wave 6E Primary Boards Path: "Find more ideas" (`board_more_ideas`) driven by `max_boards` + `target_pins_per_board`
          if (surfacesCfg.board_more_ideas?.enabled && router.canUseAuthSession) {
            surfacesExecuted.push('board_more_ideas');
            const moreIdeasTargetPins = Number(
              surfacesCfg.board_more_ideas.target_pins_per_board ??
              surfacesCfg.fresh_boards?.target_pins_per_board ??
              100
            ) || 100;
            const moreIdeasPageSize = Math.max(10, Math.min(50, Number(surfacesCfg.board_more_ideas.page_size) || 25));
            const moreIdeasMaxPages = Math.max(1, Math.min(40, Math.ceil(moreIdeasTargetPins / 25)));
            let authSkippedMoreIdeas = false;
            await Promise.all(
              boardsToExpand.map((board) => boardSem.run(async () => {
                if (authSkippedMoreIdeas) return;
                const bmiRes = await harvestBoardMoreIdeasSurface(router, board, {
                  maxPages: moreIdeasMaxPages,
                  pageSize: moreIdeasPageSize,
                  targetPins: moreIdeasTargetPins
                });
                if (!surfacesCfg.board_feed?.enabled) {
                  funnel.boards_scanned++;
                }
                funnel.pages_scrolled += Number(bmiRes.pages_fetched || 0);
                for (const p of (bmiRes.pins || [])) ingestCandidate(p);
                if (bmiRes.skipped_auth_only) authSkippedMoreIdeas = true;
                if (!surfacesCfg.board_feed?.enabled && (funnel.boards_scanned % 3 === 0 || funnel.boards_scanned === boardsToExpand.length)) {
                  funnel.scrolled_pins = candidateMap.size;
                  await reportProgress(
                    'harvesting',
                    `1. Scanned Find more ideas on ${funnel.boards_scanned}/${boardsToExpand.length} boards (${candidateMap.size} total pins scrolled)…`,
                    24,
                    { scrolled_pins: candidateMap.size, candidates_discovered: candidateMap.size }
                  );
                }
              }))
            );
          }
        })());
      }

      // Path 3: Official Idea Page Feed (`/ideas/<slug>/<id>/` via `BestPinsFeedAltResource/get` + SSR fallback)
      if (surfacesCfg.ideas_feeds?.enabled && queriesToRun.length > 0) {
        surfacesExecuted.push('ideas_feeds');
        pathTasks.push((async () => {
          const configuredInterestsCap = Math.max(1, Number(surfacesCfg.ideas_feeds.max_interests_per_run) || 3);
          const effectiveInterestsCap = queriesToRun.length > 1
            ? Math.min(queriesToRun.length, Math.max(configuredInterestsCap, Math.min(queriesToRun.length, 10)))
            : configuredInterestsCap;
          const interestTerms = queriesToRun.slice(0, effectiveInterestsCap);
          for (let i = 0; i < interestTerms.length; i++) {
            const term = interestTerms[i];
            const idRes = await harvestIdeasHubSurface(router, term, {
              maxPages: surfacesCfg.ideas_feeds.max_pages,
              pageSize: surfacesCfg.ideas_feeds.page_size || 50,
              targetPins: surfacesCfg.ideas_feeds.target_pins ?? null,
              preResolvedInterest: i === 0 && runIdeaPage?.found ? runIdeaPage : null
            });
            funnel.pages_scrolled += Number(idRes.pages_fetched || 0);
            for (const p of (idRes.pins || [])) ingestCandidate(p);
          }
        })());
      }

      // Path 4: Authenticated Home Feed Deep Scroll (`UserHomefeedResource/get`, up to 2,000 pins)
      if (surfacesCfg.home_feed?.enabled) {
        surfacesExecuted.push('home_feed');
        pathTasks.push((async () => {
          const hfRes = await harvestHomeFeedSurface(router, {
            maxPages: surfacesCfg.home_feed.max_pages,
            pageSize: surfacesCfg.home_feed.page_size || 50,
            targetPins: surfacesCfg.home_feed.target_pins ?? 250,
            seedQuery: cleanSeeds[0] || 'home feed'
          });
          funnel.pages_scrolled += Number(hfRes.pages_fetched || 0);
          for (const p of (hfRes.pins || [])) ingestCandidate(p);
        })());
      }

      await Promise.all(pathTasks);
    }

    funnel.scrolled_pins = candidateMap.size;

    // Parallelized 50x Zero-Cookie Pidgets Pre-Triage (Semaphore 6) +
    // Min Re-pins (+ optional Min Saves) Pre-Filter +
    // Semaphore(8) Zero-Cookie PinResource/get Root Age & Annotations Verification
    let remainingPinHydrations = settings.discovery.hydration.max_pin_hydrations_per_run;
    const pinHydrateSem = new Semaphore(8);
    const minRepinsGate = Math.max(0, Number(settings.qualification?.min_repin_count ?? 0));
    const minSavesGate = Math.max(0, Number(settings.qualification?.min_save_count ?? 0));

    const enrichAndScoreIds = async (targetIds, progressLabelPrefix = '2. Verifying root ages & annotations') => {
      if (targetIds.length === 0) return;

      if (settings.discovery.hydration.enable_pidgets_pretriage) {
        await reportProgress(
          'pretriaging',
          `1b. Checking Re-pins across ${targetIds.length} scrolled pins (50x Zero-Cookie Pidgets)…`,
          34,
          { scrolled_pins: candidateMap.size, candidates_discovered: candidateMap.size }
        );
        const pidgetsMap = await pretriageCandidatesWithPidgets(targetIds, router, {
          concurrency: 6,
          onBatchProgress: async ({ completedBatches, totalBatches }) => {
            const pct = 34 + Math.round((completedBatches / Math.max(1, totalBatches)) * 12);
            await reportProgress(
              'pretriaging',
              `1b. Checking Re-pins via 50x Pidgets (${completedBatches}/${totalBatches} batches)…`,
              pct,
              { scrolled_pins: candidateMap.size, candidates_discovered: candidateMap.size }
            );
          }
        });
        for (const [, pInfo] of pidgetsMap.entries()) {
          ingestCandidate(pInfo);
        }
      }

      // Gate candidates by Min Re-pins (primary) and Min Saves (ONLY when > 0) before hydrating via PinResource/get.
      // Wave 6E Direct Age Mode (`resolveRootPin === false`):
      // Enforce direct `repin_count >= minRepinsGate` strictly (disable `repin_count = 0` rescue via saves)
      // so PinResource budget is never wasted on zero-repin copies.
      // Only when legacy `resolveRootPin === true` do we rescue unhydrated repins via cluster saves.
      const matchingPreGate = targetIds
        .map((pid) => candidateMap.get(pid))
        .filter(Boolean)
        .filter((c) => {
          const repinsVal = c.repin_count !== null && c.repin_count !== undefined ? Number(c.repin_count) : null;
          const savesVal = c.save_count !== null && c.save_count !== undefined ? Number(c.save_count) : null;
          const isBoardOrigin = Array.isArray(c.discovered_surfaces) &&
            (c.discovered_surfaces.includes('board_feed') || c.discovered_surfaces.includes('board_more_ideas'));
          const rescueRepinCandidate = Boolean(
            resolveRootPin &&
            (c.is_repin || isBoardOrigin || (!c.is_hydrated && repinsVal === 0)) &&
            savesVal !== null &&
            savesVal >= minRepinsGate
          );
          const passesRepins = minRepinsGate === 0 ||
            repinsVal === null ||
            repinsVal >= minRepinsGate ||
            rescueRepinCandidate;
          const passesSaves = minSavesGate === 0 ||
            savesVal === null ||
            savesVal >= minSavesGate;
          return passesRepins && passesSaves;
        });

      funnel.matched_repins = Math.max(funnel.matched_repins, matchingPreGate.length);

      const orderedForHydration = matchingPreGate
        .filter((c) => !c.is_hydrated || !c.created_at_pinterest || c.root_age_verified === null || !Array.isArray(c.visual_annotations) || c.visual_annotations.length === 0)
        .sort((a, b) => {
          const aDirect = Number(a.repin_count ?? 0) >= minRepinsGate ? 1 : 0;
          const bDirect = Number(b.repin_count ?? 0) >= minRepinsGate ? 1 : 0;
          if (bDirect !== aDirect) return bDirect - aDirect;
          const aSig = Math.max(Number(a.repin_count ?? 0), Number(a.save_count ?? 0));
          const bSig = Math.max(Number(b.repin_count ?? 0), Number(b.save_count ?? 0));
          return (bSig - aSig) || (Number(b.repin_count ?? 0) - Number(a.repin_count ?? 0));
        })
        .slice(0, Math.max(0, remainingPinHydrations));

      remainingPinHydrations = Math.max(0, remainingPinHydrations - orderedForHydration.length);

      await reportProgress(
        'hydrating_pins',
        `${progressLabelPrefix} (0/${orderedForHydration.length} matched pins)…`,
        48,
        {
          scrolled_pins: candidateMap.size,
          matched_repins: funnel.matched_repins,
          candidates_discovered: candidateMap.size
        }
      );

      let hydratedDone = 0;
      const reportEvery = Math.max(8, Math.ceil(orderedForHydration.length / 5));
      const unwrappedIds = new Set();

      await Promise.all(
        orderedForHydration.map((cand) => pinHydrateSem.run(async () => {
          const hyd = await hydratePinZeroCookie(cand.pin_id, router, { rootPinCache, nowMs, resolveRootPin });
          if (hyd.ok && hyd.pin) {
            const existingCand = candidateMap.get(cand.pin_id) || cand;
            // Unwrap & deduplicate onto root pin ID ONLY when legacy `resolveRootPin === true`
            if (resolveRootPin && hyd.pin.is_repin && hyd.pin.root_pin_id && hyd.pin.root_pin_id !== cand.pin_id && hyd.pin.root_age_verified === true) {
              const rootId = hyd.pin.root_pin_id;
              const mergedRoot = mergeCandidatePinRecords(
                candidateMap.get(rootId),
                mergeCandidatePinRecords(existingCand, {
                  ...hyd.pin,
                  pin_id: rootId,
                  root_pin_id: rootId,
                  unwrapped_from_repin_id: cand.pin_id
                })
              );
              mergedRoot.pin_id = rootId;
              mergedRoot.root_pin_id = rootId;
              mergedRoot.root_age_verified = true;
              candidateMap.set(rootId, mergedRoot);
              candidateMap.delete(cand.pin_id);
              unwrappedIds.add(rootId);
              funnel.board_repins_unwrapped++;
            } else {
              ingestCandidate(hyd.pin);
            }
          }
          hydratedDone++;
          funnel.hydrated_pins++;
          if (hydratedDone % reportEvery === 0 || hydratedDone === orderedForHydration.length) {
            const pct = 48 + Math.round((hydratedDone / Math.max(1, orderedForHydration.length)) * 34);
            await reportProgress(
              'hydrating_pins',
              `${progressLabelPrefix} (${hydratedDone}/${orderedForHydration.length} pins)…`,
              pct,
              {
                scrolled_pins: candidateMap.size,
                matched_repins: funnel.matched_repins,
                hydrated_pins: funnel.hydrated_pins,
                candidates_discovered: candidateMap.size
              }
            );
          }
        }))
      );

      for (const pid of new Set([...targetIds, ...unwrappedIds])) {
        const cur = candidateMap.get(pid);
        if (cur) {
          candidateMap.set(pid, scoreNewbornCandidate(cur, settings, { nowMs }));
        }
      }
    };

    await enrichAndScoreIds(Array.from(candidateMap.keys()));

    // Path 5: Related Pins Deep Scroll (`RelatedModulesResource/get`, 200..1,000 pins)
    const snowballEnabled = Boolean(
      snowballOnly ||
      cleanSeedPinIds.length > 0 ||
      (surfacesCfg.related_pin_snowball?.enabled && settings.discovery.snowball.enabled && settings.discovery.snowball.max_hops > 0)
    );

    if (snowballEnabled) {
      const maxHops = Math.max(1, settings.discovery.snowball.max_hops || 1);
      const seedCap = settings.discovery.snowball.seed_cap || 10;
      const relatedTargetPins = surfacesCfg.related_pin_snowball?.target_pins ?? null;

      const expandedSeeds = new Set();
      let currentFrontier = Array.from(new Set([
        ...cleanSeedPinIds,
        ...(cleanSeedPinIds.length === 0
          ? Array.from(candidateMap.values())
              .filter((c) => c.qualified === true && c.is_golden_pin)
              .sort((a, b) => (b.repin_count || 0) - (a.repin_count || 0) || (b.golden_score || 0) - (a.golden_score || 0))
              .slice(0, seedCap)
              .map((c) => c.pin_id)
          : [])
      ])).slice(0, seedCap);

      if (currentFrontier.length > 0) {
        surfacesExecuted.push('related_pin_snowball');
        await reportProgress('snowballing', `Scrolling Related Pins from ${currentFrontier.length} seed pin(s)…`, 84);
      }

      const perSeedTarget = relatedTargetPins
        ? Math.max(50, Math.ceil(Number(relatedTargetPins) / Math.max(1, currentFrontier.length)))
        : null;

      for (let hop = 1; hop <= maxHops && currentFrontier.length > 0; hop++) {
        const newSnowballIds = [];
        const newSnowballIdSet = new Set();
        let authSkipped = false;

        for (const seedId of currentFrontier) {
          if (expandedSeeds.has(seedId)) continue;
          expandedSeeds.add(seedId);

          const parentCand = candidateMap.get(seedId);
          const sbRes = await harvestRelatedPinSnowballSurface(router, seedId, {
            maxPages: surfacesCfg.related_pin_snowball?.max_pages || 10,
            pageSize: surfacesCfg.related_pin_snowball?.page_size || 30,
            targetPins: perSeedTarget,
            hop,
            seedQuery: parentCand?.seed_query || cleanSeeds[0] || null
          });
          funnel.pages_scrolled += Number(sbRes.pages_fetched || 0);

          if (sbRes.skipped_auth_only) {
            authSkipped = true;
            break;
          }

          for (const sp of (sbRes.pins || [])) {
            const existingCand = candidateMap.get(sp.pin_id);
            const needsEnrich = !existingCand || !existingCand.is_hydrated || !existingCand.created_at_pinterest;
            ingestCandidate(sp);
            if (needsEnrich && !newSnowballIdSet.has(sp.pin_id)) {
              newSnowballIdSet.add(sp.pin_id);
              newSnowballIds.push(sp.pin_id);
            }
          }
        }

        if (authSkipped) break;
        snowballHopsExecuted = hop;
        funnel.scrolled_pins = candidateMap.size;

        if (newSnowballIds.length > 0) {
          await enrichAndScoreIds(newSnowballIds, `2b. Verifying root dates for Related Pins (hop ${hop})`);
        }

        if (hop < maxHops) {
          currentFrontier = newSnowballIds
            .map((id) => candidateMap.get(id))
            .filter((c) => c && c.qualified === true && c.is_golden_pin && !expandedSeeds.has(c.pin_id))
            .sort((a, b) => (b.repin_count || 0) - (a.repin_count || 0))
            .slice(0, seedCap)
            .map((c) => c.pin_id);
        } else {
          currentFrontier = [];
        }
      }
    }

    // Preliminary score pass before optional opt-in creator sync
    const preScoredCandidates = Array.from(candidateMap.values()).map((c) => scoreNewbornCandidate(c, settings, { nowMs }));
    for (const c of preScoredCandidates) candidateMap.set(c.pin_id, c);

    // STRICT OPT-IN ACCOUNT SYNC (OFF BY DEFAULT!):
    // Never run automatic `UserResource/get` calls during hunts unless explicitly opted-in via
    // `settings.discovery.hydration.auto_fetch_accounts === true`.
    const hydratedUsersMap = new Map();
    if (
      settings.discovery.hydration.auto_fetch_accounts === true &&
      settings.discovery.hydration.max_user_hydrations_per_run > 0
    ) {
      const creatorBuckets = new Map();
      for (const cand of preScoredCandidates) {
        if (!cand.created_at_pinterest || cand.root_age_verified === false || cand.qualified !== true) continue;
        const uname = cand.effective_creator_username;
        if (!uname) continue;
        if (!creatorBuckets.has(uname)) creatorBuckets.set(uname, []);
        creatorBuckets.get(uname).push(cand);
      }

      const prioritizedCreators = Array.from(creatorBuckets.entries())
        .sort((a, b) => {
          const bestA = Math.max(...a[1].map((c) => Number(c.repin_count || 0)));
          const bestB = Math.max(...b[1].map((c) => Number(c.repin_count || 0)));
          return bestB - bestA;
        })
        .slice(0, settings.discovery.hydration.max_user_hydrations_per_run)
        .map(([uname]) => uname);

      if (prioritizedCreators.length > 0) {
        await reportProgress(
          'hydrating_creators',
          `3. Pulling account reach for ${prioritizedCreators.length} opt-in creators…`,
          88
        );

        const userHydrateSem = new Semaphore(4);
        await Promise.all(
          prioritizedCreators.map((uname) => userHydrateSem.run(async () => {
            const uRes = await hydrateUserZeroCookie(uname, router);
            if (uRes.ok && uRes.user) {
              hydratedUsersMap.set(uname, uRes.user);
              for (const cand of (creatorBuckets.get(uname) || [])) {
                if (cand.origin_creator_username === uname) {
                  cand.origin_creator_followers = uRes.user.follower_count;
                } else if (cand.pinner_username === uname) {
                  cand.pinner_followers = uRes.user.follower_count;
                }
                cand.effective_creator_followers = uRes.user.follower_count;
                cand.creator_monthly_reach = uRes.user.monthly_reach;
                cand.creator_profile_views = uRes.user.profile_views;
                cand.creator_pin_count = uRes.user.pin_count;
              }
            }
          }))
        );
      }
    }

    // Final re-scoring + HARD GATE BEFORE PERSISTENCE:
    // Discard in memory any candidate that lacks a verified root `created_at_pinterest`,
    // falls outside `[min_age_days, max_age_days]`, fails `Min Re-pins`, or fails optional `Min Saves > 0`.
    const minAge = Number(settings.qualification?.min_age_days ?? 0);
    const maxAge = Number(settings.qualification?.max_age_days ?? 30);
    const allEvaluated = Array.from(candidateMap.values()).map((c) => scoreNewbornCandidate(c, settings, { nowMs }));
    const verifiedQualified = allEvaluated
      .filter((c) => {
        if (!c || c.qualified !== true) return false;
        if (!c.created_at_pinterest) return false;
        if (c.root_age_verified === false || c.repin_root_unverified === true) return false;
        const age = c.age_days != null ? Number(c.age_days) : NaN;
        if (!Number.isFinite(age) || age < minAge || age > maxAge) return false;
        return true;
      })
      .sort((a, b) => (Number(b.repin_count ?? 0) - Number(a.repin_count ?? 0)) || (Number(a.age_days ?? 9999) - Number(b.age_days ?? 9999)));

    const discardedInMemoryCount = Math.max(0, allEvaluated.length - verifiedQualified.length);
    funnel.scrolled_pins = Math.max(funnel.scrolled_pins, allEvaluated.length);
    funnel.verified_winners = verifiedQualified.length;

    const peerAnnCounts = buildPeerAnnotationCounts(verifiedQualified);
    for (const cand of verifiedQualified) {
      cand.crossover_blueprint = synthesizeNewbornCrossoverBlueprint(cand, peerAnnCounts);
    }

    // Build Rookie Creator records strictly from opt-in hydrated creators
    const verifiedByCreator = new Map();
    for (const c of verifiedQualified) {
      const uname = c.effective_creator_username;
      if (!uname) continue;
      if (!verifiedByCreator.has(uname)) verifiedByCreator.set(uname, []);
      verifiedByCreator.get(uname).push(c);
    }

    const rookieRecords = [];
    for (const [uname, userProfile] of hydratedUsersMap.entries()) {
      const cands = verifiedByCreator.get(uname) || [];
      if (cands.length === 0) continue;
      const scoredRookie = scoreRookieCreator(userProfile, cands, settings);
      if (scoredRookie.is_qualified_rookie || scoredRookie.golden_pins_count > 0) {
        rookieRecords.push(scoredRookie);
      }
    }

    // Determine autonomous watchlist staging ONLY when auto_track_enabled is explicitly ON (OFF by default)
    let autoWatchlistedCount = 0;
    if (settings.automation.auto_track_enabled) {
      for (const cand of verifiedQualified) {
        const ruleCheck = evaluatePinAutoRules(cand, settings);
        if (ruleCheck.meets_watchlist && settings.automation.pin_promotion_rules.destinations.stage_to_watchlist) {
          cand.stage = 'watchlist';
          autoWatchlistedCount++;
        }
      }
      for (const rk of rookieRecords) {
        const rkCheck = evaluateRookieAutoRules(rk, settings);
        if (rkCheck.meets_watchlist) {
          rk.stage = 'watchlist';
        }
      }
    }

    await reportProgress(
      'persisting',
      `3. Saving ${verifiedQualified.length} verified Golden Pin winner${verifiedQualified.length === 1 ? '' : 's'}…`,
      94,
      {
        scrolled_pins: funnel.scrolled_pins,
        matched_repins: funnel.matched_repins,
        verified_winners: verifiedQualified.length,
        candidates_discovered: funnel.scrolled_pins,
        candidates_qualified: verifiedQualified.length,
        golden_pins_count: verifiedQualified.filter((c) => c.is_golden_pin).length
      }
    );

    // Persist ONLY verified qualified candidates strictly to Newborn staging + run-scoped junction table
    let persistedCandidates = verifiedQualified;
    let persistedRookies = rookieRecords;

    if (sql && typeof sql === 'function') {
      if (persistedCandidates.length > 0) {
        const upRes = await upsertStagedCandidatesBatch(sql, persistedCandidates, {
          profileId: profile?.id ?? null,
          runId: runRowId,
          folderId: numericFolderId,
          nowMs
        });
        persistedCandidates = upRes.rows;
      }
      if (persistedRookies.length > 0) {
        const rkRes = await upsertStagedRookiesBatch(sql, persistedRookies, { nowMs });
        persistedRookies = rkRes.rows;
      }
    }

    // Trigger immediate auto-promotion ONLY if `auto_track_enabled` AND `min_consecutive_days` is already satisfied
    let autoPromotedCount = 0;
    if (settings.automation.auto_track_enabled) {
      const promotablePinIds = persistedCandidates
        .filter((c) => c.stage !== 'promoted' && c.stage !== 'discarded')
        .filter((c) => evaluatePinAutoRules(c, settings).meets_promotion)
        .map((c) => c.pin_id);

      if (promotablePinIds.length > 0 && typeof onAutoPromotePins === 'function') {
        const promoRes = await onAutoPromotePins(promotablePinIds, settings);
        autoPromotedCount += Number(promoRes?.promoted_count || 0);
      }

      const promotableRookies = persistedRookies
        .filter((r) => r.stage !== 'promoted' && r.stage !== 'discarded')
        .filter((r) => evaluateRookieAutoRules(r, settings).meets_promotion)
        .map((r) => r.username);

      if (promotableRookies.length > 0 && typeof onAutoPromoteRookies === 'function') {
        const rkPromoRes = await onAutoPromoteRookies(promotableRookies, settings);
        autoPromotedCount += Number(rkPromoRes?.promoted_count || 0);
      }
    }

    const qualifiedCount = persistedCandidates.length;
    const goldenPinsCount = persistedCandidates.filter((c) => c.is_golden_pin).length;
    const crossoverMatrix = buildNewbornCrossoverMatrix(persistedCandidates, { limit: 30 });
    const routerTelemetry = router.getRedactedTelemetry();
    const finalTelemetry = sanitizeForJsonb({
      router: routerTelemetry,
      funnel: { ...funnel, verified_winners: qualifiedCount },
      idea_page: runIdeaPage,
      cluster_id: numericClusterId,
      fresh_boards_found: freshBoardsDiscovered.length,
      growing_trends_found: discoveredTrends.length,
      total_scanned_count: funnel.scrolled_pins,
      discarded_in_memory_count: discardedInMemoryCount,
      applied_filters: {
        max_age_days: maxAge,
        min_repin_count: minRepinsGate,
        min_save_count: minSavesGate,
        resolve_root_pin: resolveRootPin
      }
    });

    if (sql && typeof sql === 'function') {
      await stampAutomationRunTimestamp(sql, 'discovery', new Date(nowMs).toISOString()).catch(() => {});
      if (runRowId !== null) {
        await sql`
          UPDATE newborn_runs
          SET
            status = 'completed',
            progress_stage = 'completed',
            progress_detail = ${`Scrolled ${funnel.scrolled_pins} pins -> ${funnel.matched_repins} matched Re-pins -> ${qualifiedCount} verified Golden Pin${qualifiedCount === 1 ? '' : 's'}.`},
            progress_pct = 100,
            error_message = NULL,
            surfaces_used = ${JSON.stringify(surfacesExecuted)}::jsonb,
            cookie_mode = ${router.effectiveMode},
            candidates_discovered = ${funnel.scrolled_pins},
            candidates_qualified = ${qualifiedCount},
            golden_pins_count = ${goldenPinsCount},
            rookie_creators_count = ${persistedRookies.length},
            auto_watchlisted_count = ${autoWatchlistedCount},
            auto_promoted_count = ${autoPromotedCount},
            snowball_hops_executed = ${snowballHopsExecuted},
            telemetry = ${JSON.stringify(finalTelemetry)}::jsonb,
            completed_at = NOW()
          WHERE id = ${runRowId};
        `.catch(() => {});
      }
    }

    return {
      ok: true,
      run_id: runRowId,
      cluster_id: numericClusterId,
      run_type: runType,
      resolve_root_pin: resolveRootPin,
      profile: profile ? { id: profile.id, slug: profile.slug, name: profile.name } : null,
      cookie_mode: router.effectiveMode,
      surfaces_executed: surfacesExecuted,
      snowball_hops_executed: snowballHopsExecuted,
      idea_page: runIdeaPage,
      funnel: { ...funnel, verified_winners: qualifiedCount },
      stats: {
        scrolled_pins: funnel.scrolled_pins,
        matched_repins: funnel.matched_repins,
        candidates_scanned: funnel.scrolled_pins,
        candidates_discarded_in_memory: discardedInMemoryCount,
        candidates_discovered: funnel.scrolled_pins,
        candidates_qualified: qualifiedCount,
        golden_pins_count: goldenPinsCount,
        rookie_creators_count: persistedRookies.length,
        fresh_boards_count: freshBoardsDiscovered.length,
        auto_watchlisted_count: autoWatchlistedCount,
        auto_promoted_count: autoPromotedCount
      },
      router_telemetry: routerTelemetry,
      trends: discoveredTrends,
      fresh_boards: freshBoardsDiscovered,
      candidates: persistedCandidates,
      rookies: persistedRookies,
      crossover_matrix: crossoverMatrix
    };
  } catch (err) {
    const safeErrMsg = redactSecrets(err?.message || 'Unknown harvest error').slice(0, 1000);
    if (sql && typeof sql === 'function' && runRowId !== null) {
      await sql`
        UPDATE newborn_runs
        SET
          status = 'failed',
          progress_stage = 'failed',
          progress_detail = ${safeErrMsg},
          error_message = ${safeErrMsg},
          surfaces_used = ${JSON.stringify(surfacesExecuted)}::jsonb,
          cookie_mode = ${router.effectiveMode},
          telemetry = ${JSON.stringify(sanitizeForJsonb({
            router: router.getRedactedTelemetry(),
            error: safeErrMsg
          }))}::jsonb,
          completed_at = NOW()
        WHERE id = ${runRowId};
      `.catch(() => {});
    }
    throw err;
  }
}
