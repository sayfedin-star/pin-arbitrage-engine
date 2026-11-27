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
import { CircuitBreakerOpenError } from '../../core/pinterest/client.mjs';
import { redactSecrets } from '../../http/security-and-response.mjs';
import { NewbornCookieRouter } from './cookie-router.mjs';
import {
  resolveEffectiveNewbornSettings,
  resolveNewbornRawCookie,
  stampAutomationRunTimestamp
} from './settings.mjs';
import { getWorkspaceSettings } from '../workspaces/service.mjs';
import { isDeadZeroOrOneCreator } from '../creators/competitors-crud.mjs';
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

function isAbortError(err, signal = null) {
  return Boolean(
    signal?.aborted ||
    err?.name === 'AbortError' ||
    err?.code === 'ABORT_ERR'
  );
}

function isRateLimitError(err) {
  return Boolean(
    err instanceof CircuitBreakerOpenError ||
    err?.name === 'CircuitBreakerOpenError' ||
    err?.code === 'CIRCUIT_BREAKER_OPEN'
  );
}

function sleepAbortable(ms, signal = null) {
  const duration = Math.max(0, Number(ms) || 0);
  if (signal?.aborted) {
    return Promise.reject(signal.reason || new DOMException('Operator cancelled', 'AbortError'));
  }
  if (duration === 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let timer = null;
    const onAbort = () => {
      if (timer !== null) clearTimeout(timer);
      reject(signal.reason || new DOMException('Operator cancelled', 'AbortError'));
    };
    timer = setTimeout(() => {
      if (signal && typeof signal.removeEventListener === 'function') {
        signal.removeEventListener('abort', onAbort);
      }
      resolve();
    }, duration);
    if (signal && typeof signal.addEventListener === 'function') {
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
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
 * V4 Wave 4: Maps `workspace_settings.extraction_targets` onto normalized Newborn
 * `settings.discovery.surfaces`, respecting any explicit per-run `settingsOverrides`
 * passed by the caller so interactive UI overrides always win.
 */
export function applyWorkspaceExtractionTargetsToSettings(settings, workspaceSettings = null, explicitOverrides = null) {
  if (!settings || typeof settings !== 'object') return settings;
  if (!workspaceSettings || typeof workspaceSettings !== 'object') return settings;

  const clamp = (val, min, max) => {
    const n = Number(val);
    if (!Number.isFinite(n)) return null;
    return Math.min(max, Math.max(min, Math.round(n)));
  };

  // V4 Pre-Wave 5 SSOT: Also honor workspace_settings qualification defaults when not explicitly overridden
  const qual = settings?.qualification;
  const ovQual = explicitOverrides?.qualification || {};
  if (qual && typeof qual === 'object') {
    if (ovQual.max_age_days === undefined && workspaceSettings.max_pin_age_days != null) {
      const maxAge = clamp(workspaceSettings.max_pin_age_days, 1, 3650);
      if (maxAge !== null) qual.max_age_days = maxAge;
    }
    if (ovQual.min_repin_count === undefined && workspaceSettings.min_repin_count != null) {
      const minRp = clamp(workspaceSettings.min_repin_count, 0, 1000000);
      if (minRp !== null) qual.min_repin_count = minRp;
    }
    if (ovQual.min_save_count === undefined && workspaceSettings.min_save_count != null) {
      const minSv = clamp(workspaceSettings.min_save_count, 0, 1000000);
      if (minSv !== null) qual.min_save_count = minSv;
    }
  }

  const targets = workspaceSettings?.extraction_targets;
  if (!targets || typeof targets !== 'object') return settings;

  const surfaces = settings?.discovery?.surfaces;
  if (!surfaces || typeof surfaces !== 'object') return settings;

  const ovSurfaces = explicitOverrides?.discovery?.surfaces || {};
  const ovEnabledList = Array.isArray(explicitOverrides?.discovery?.enabled_surfaces)
    ? new Set(explicitOverrides.discovery.enabled_surfaces)
    : null;

  if (targets.search && typeof targets.search === 'object' && !ovSurfaces.pin_serp_capsules) {
    if (typeof targets.search.enabled === 'boolean' && surfaces.pin_serp_capsules && !ovEnabledList) {
      surfaces.pin_serp_capsules.enabled = targets.search.enabled;
    }
    const tp = clamp(targets.search.target_pins, 10, 5000);
    if (tp !== null && surfaces.pin_serp_capsules) {
      surfaces.pin_serp_capsules.target_pins = tp;
    }
  }

  if (targets.boards && typeof targets.boards === 'object') {
    const maxB = clamp(targets.boards.max_boards, 1, 100);
    const perB = clamp(targets.boards.target_pins_per_board, 10, 2000);
    if (!ovSurfaces.fresh_boards && surfaces.fresh_boards) {
      if (typeof targets.boards.enabled === 'boolean' && !ovEnabledList) {
        surfaces.fresh_boards.enabled = targets.boards.enabled;
      }
      if (maxB !== null) surfaces.fresh_boards.max_boards_to_expand = Math.min(50, maxB);
      if (perB !== null) surfaces.fresh_boards.target_pins_per_board = perB;
    }
    if (!ovSurfaces.board_more_ideas && surfaces.board_more_ideas) {
      if (typeof targets.boards.enabled === 'boolean' && !ovEnabledList) {
        surfaces.board_more_ideas.enabled = targets.boards.enabled;
      }
      if (perB !== null) surfaces.board_more_ideas.target_pins_per_board = perB;
    }
    if (!ovSurfaces.board_feed && surfaces.board_feed && perB !== null) {
      surfaces.board_feed.target_pins_per_board = perB;
    }
  }

  if (targets.idea_page && typeof targets.idea_page === 'object' && !ovSurfaces.ideas_feeds && surfaces.ideas_feeds) {
    if (typeof targets.idea_page.enabled === 'boolean' && !ovEnabledList) {
      surfaces.ideas_feeds.enabled = targets.idea_page.enabled;
    }
    const tp = clamp(targets.idea_page.target_pins, 10, 5000);
    if (tp !== null) surfaces.ideas_feeds.target_pins = tp;
  }

  if (targets.home_feed && typeof targets.home_feed === 'object' && !ovSurfaces.home_feed && surfaces.home_feed) {
    if (typeof targets.home_feed.enabled === 'boolean' && !ovEnabledList) {
      surfaces.home_feed.enabled = targets.home_feed.enabled;
    }
    const tp = clamp(targets.home_feed.target_pins, 10, 5000);
    if (tp !== null) surfaces.home_feed.target_pins = tp;
  }

  if (targets.related_pins && typeof targets.related_pins === 'object' && !ovSurfaces.related_pin_snowball && surfaces.related_pin_snowball) {
    if (typeof targets.related_pins.enabled === 'boolean' && !ovEnabledList && explicitOverrides?.discovery?.snowball?.enabled === undefined) {
      surfaces.related_pin_snowball.enabled = targets.related_pins.enabled;
    }
    const tp = clamp(targets.related_pins.target_pins, 10, 5000);
    if (tp !== null) surfaces.related_pin_snowball.target_pins = tp;
  }

  return settings;
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
      board_name: c.discovery_board_name || c.board_name || c.pin_board_name || null,
      board_url: formatPinterestBoardUrl(c.discovery_board_url || c.board_url || c.pin_board_url || ''),
      discovery_board_name: c.discovery_board_name || null,
      discovery_board_url: formatPinterestBoardUrl(c.discovery_board_url || ''),
      pin_board_name: c.pin_board_name || null,
      pin_board_url: formatPinterestBoardUrl(c.pin_board_url || ''),
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
        root_age_verified: Boolean(c.is_hydrated && c.root_age_verified === true),
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
  }

  const candidatesJson = JSON.stringify(sanitizeForJsonb(preparedRecords));
  const runCandidatesRecords = numericRunId !== null
    ? preparedRecords.map((r) => ({
        run_id: numericRunId,
        pin_id: r.pin_id,
        seed_query: r.seed_query || null,
        matched_queries: Array.isArray(r.matched_queries) ? r.matched_queries : [],
        surface: r.first_surface || 'pin_serp_capsules',
        surfaces: Array.isArray(r.discovered_surfaces)
          ? r.discovered_surfaces.filter((s) => s && String(s).toLowerCase() !== 'pin_resource')
          : [r.first_surface || 'pin_serp_capsules'],
        qualified_in_run: Boolean(r.qualified),
        golden_score_in_run: Number(r.golden_score ?? 0)
      }))
    : [];
  const runCandidatesJson = runCandidatesRecords.length > 0
    ? JSON.stringify(sanitizeForJsonb(runCandidatesRecords))
    : null;
  const runInTx = async (fn) => (typeof sql.begin === 'function' ? sql.begin(fn) : fn(sql));

  await runInTx(async (tx) => {
    const upsertCandidatesFull = async () => tx`
      INSERT INTO newborn_candidates (
        pin_id, stage, qualified, first_run_id, last_run_id, folder_id,
        first_surface, discovered_surfaces, seed_query,
        snowball_parent_pin_id, snowball_hop, title, description, alt_text,
        image_url, image_signature, dominant_color, destination_url, clean_domain, is_linkless,
        pinner_username, pinner_full_name, pinner_followers,
        origin_creator_username, origin_creator_full_name, origin_creator_followers,
        effective_creator_username, effective_creator_followers,
        creator_monthly_reach, creator_profile_views, creator_pin_count, is_repin,
        board_id, board_name, board_url, discovery_board_name, discovery_board_url, pin_board_name, pin_board_url, board_order_modified_at,
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
        u.board_id, u.board_name, u.board_url, u.discovery_board_name, u.discovery_board_url, u.pin_board_name, u.pin_board_url, NULLIF(u.board_order_modified_at, '')::timestamptz,
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
        board_id text, board_name text, board_url text, discovery_board_name text, discovery_board_url text, pin_board_name text, pin_board_url text, board_order_modified_at text,
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
        discovered_surfaces = COALESCE((
          SELECT jsonb_agg(DISTINCT elem)
          FROM (
            SELECT jsonb_array_elements(COALESCE(newborn_candidates.discovered_surfaces, '[]'::jsonb)) AS elem
            UNION
            SELECT jsonb_array_elements(COALESCE(EXCLUDED.discovered_surfaces, '[]'::jsonb)) AS elem
          ) merged_surfaces
          WHERE elem #>> '{}' <> 'pin_resource'
        ), '[]'::jsonb),
        seed_query = COALESCE(EXCLUDED.seed_query, newborn_candidates.seed_query),
        snowball_parent_pin_id = COALESCE(newborn_candidates.snowball_parent_pin_id, EXCLUDED.snowball_parent_pin_id),
        title = COALESCE(NULLIF(EXCLUDED.title, ''), newborn_candidates.title),
        description = COALESCE(NULLIF(EXCLUDED.description, ''), newborn_candidates.description),
        alt_text = COALESCE(NULLIF(EXCLUDED.alt_text, ''), newborn_candidates.alt_text),
        image_url = COALESCE(NULLIF(EXCLUDED.image_url, ''), newborn_candidates.image_url),
        image_signature = COALESCE(NULLIF(EXCLUDED.image_signature, ''), newborn_candidates.image_signature),
        dominant_color = CASE WHEN EXCLUDED.dominant_color <> '#888888' THEN EXCLUDED.dominant_color ELSE newborn_candidates.dominant_color END,
        destination_url = COALESCE(NULLIF(EXCLUDED.destination_url, ''), newborn_candidates.destination_url),
        clean_domain = COALESCE(NULLIF(EXCLUDED.clean_domain, ''), newborn_candidates.clean_domain),
        is_linkless = (
          COALESCE(EXCLUDED.destination_url, newborn_candidates.destination_url) IS NULL
          OR btrim(COALESCE(EXCLUDED.destination_url, newborn_candidates.destination_url)) = ''
          OR COALESCE(EXCLUDED.clean_domain, newborn_candidates.clean_domain) IS NULL
          OR btrim(COALESCE(EXCLUDED.clean_domain, newborn_candidates.clean_domain)) = ''
          OR lower(COALESCE(EXCLUDED.clean_domain, newborn_candidates.clean_domain, '')) ~ '(^|\.)(pinterest\.|pin\.it)'
        ),
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
        discovery_board_name = COALESCE(newborn_candidates.discovery_board_name, EXCLUDED.discovery_board_name),
        discovery_board_url = COALESCE(newborn_candidates.discovery_board_url, EXCLUDED.discovery_board_url),
        pin_board_name = COALESCE(EXCLUDED.pin_board_name, newborn_candidates.pin_board_name),
        pin_board_url = COALESCE(EXCLUDED.pin_board_url, newborn_candidates.pin_board_url),
        board_name = COALESCE(newborn_candidates.discovery_board_name, EXCLUDED.discovery_board_name, EXCLUDED.board_name, newborn_candidates.board_name),
        board_url = COALESCE(newborn_candidates.discovery_board_url, EXCLUDED.discovery_board_url, EXCLUDED.board_url, newborn_candidates.board_url),
        board_order_modified_at = COALESCE(EXCLUDED.board_order_modified_at, newborn_candidates.board_order_modified_at),
        upload_provenance = CASE WHEN EXCLUDED.upload_provenance <> 'UNKNOWN' THEN EXCLUDED.upload_provenance ELSE newborn_candidates.upload_provenance END,
        raw_creation_method = COALESCE(EXCLUDED.raw_creation_method, newborn_candidates.raw_creation_method),
        has_ai_disclosure = (newborn_candidates.has_ai_disclosure OR EXCLUDED.has_ai_disclosure),
        is_video = (newborn_candidates.is_video OR EXCLUDED.is_video),
        is_carousel = (newborn_candidates.is_carousel OR EXCLUDED.is_carousel),
        is_product = (newborn_candidates.is_product OR EXCLUDED.is_product),
        created_at_pinterest = COALESCE(EXCLUDED.created_at_pinterest, newborn_candidates.created_at_pinterest),
        age_days = COALESCE(EXCLUDED.age_days, newborn_candidates.age_days),
        save_count = CASE
          WHEN newborn_candidates.save_count IS NULL THEN EXCLUDED.save_count
          WHEN EXCLUDED.save_count IS NULL THEN newborn_candidates.save_count
          ELSE GREATEST(newborn_candidates.save_count, EXCLUDED.save_count)
        END,
        repin_count = CASE
          WHEN newborn_candidates.repin_count IS NULL THEN EXCLUDED.repin_count
          WHEN EXCLUDED.repin_count IS NULL THEN newborn_candidates.repin_count
          ELSE GREATEST(newborn_candidates.repin_count, EXCLUDED.repin_count)
        END,
        comment_count = COALESCE(EXCLUDED.comment_count, newborn_candidates.comment_count),
        share_count = CASE
          WHEN newborn_candidates.share_count IS NULL THEN EXCLUDED.share_count
          WHEN EXCLUDED.share_count IS NULL THEN newborn_candidates.share_count
          ELSE GREATEST(newborn_candidates.share_count, EXCLUDED.share_count)
        END,
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
        consecutive_qualifying_days = CASE
          WHEN EXCLUDED.qualified = TRUE THEN GREATEST(newborn_candidates.consecutive_qualifying_days, EXCLUDED.consecutive_qualifying_days)
          ELSE 0
        END,
        last_qualified_date = COALESCE(EXCLUDED.last_qualified_date, newborn_candidates.last_qualified_date),
        watchlist_added_at = COALESCE(newborn_candidates.watchlist_added_at, EXCLUDED.watchlist_added_at),
        last_polled_at = COALESCE(EXCLUDED.last_polled_at, newborn_candidates.last_polled_at),
        profile_id = COALESCE(EXCLUDED.profile_id, newborn_candidates.profile_id),
        metadata = jsonb_set(
          COALESCE(newborn_candidates.metadata, '{}'::jsonb) || jsonb_strip_nulls(COALESCE(EXCLUDED.metadata, '{}'::jsonb)),
          '{root_age_verified}',
          to_jsonb(
            COALESCE((newborn_candidates.metadata->>'root_age_verified')::boolean, false)
            OR COALESCE((EXCLUDED.metadata->>'root_age_verified')::boolean, false)
          ),
          true
        ),
        last_seen_at = NOW(),
        updated_at = NOW();
    `;

    await upsertCandidatesFull();

    // Per-harvest writes to newborn_candidate_snapshots retired to eliminate dead tuples / bloat.

    if (runCandidatesJson) {
      await tx`
        INSERT INTO newborn_run_candidates (
          run_id, pin_id, seed_query, matched_queries, surface, surfaces, qualified_in_run, golden_score_in_run, created_at
        )
        SELECT
          r.run_id,
          r.pin_id,
          r.seed_query,
          COALESCE(r.matched_queries, '[]'::jsonb),
          r.surface,
          COALESCE(r.surfaces, jsonb_build_array(r.surface)),
          r.qualified_in_run,
          r.golden_score_in_run,
          NOW()
        FROM jsonb_to_recordset(${runCandidatesJson}::jsonb) AS r(
          run_id bigint,
          pin_id text,
          seed_query text,
          matched_queries jsonb,
          surface text,
          surfaces jsonb,
          qualified_in_run boolean,
          golden_score_in_run double precision
        )
        ORDER BY r.pin_id ASC
        ON CONFLICT (run_id, pin_id) DO UPDATE SET
          seed_query = COALESCE(EXCLUDED.seed_query, newborn_run_candidates.seed_query),
          matched_queries = COALESCE((
            SELECT jsonb_agg(DISTINCT elem)
            FROM (
              SELECT jsonb_array_elements(COALESCE(newborn_run_candidates.matched_queries, '[]'::jsonb)) AS elem
              UNION
              SELECT jsonb_array_elements(COALESCE(EXCLUDED.matched_queries, '[]'::jsonb)) AS elem
            ) merged_queries
          ), '[]'::jsonb),
          surfaces = COALESCE((
            SELECT jsonb_agg(DISTINCT elem)
            FROM (
              SELECT jsonb_array_elements(COALESCE(newborn_run_candidates.surfaces, '[]'::jsonb)) AS elem
              UNION
              SELECT jsonb_array_elements(COALESCE(EXCLUDED.surfaces, '[]'::jsonb)) AS elem
            ) merged_run_surfaces
            WHERE elem #>> '{}' <> 'pin_resource'
          ), '[]'::jsonb),
          surface = CASE
            WHEN newborn_run_candidates.surface IS NOT NULL
              AND newborn_run_candidates.surface <> ''
              AND newborn_run_candidates.surface <> 'related_pin_snowball'
              AND newborn_run_candidates.surface <> 'pin_resource'
            THEN newborn_run_candidates.surface
            ELSE COALESCE(NULLIF(EXCLUDED.surface, ''), newborn_run_candidates.surface)
          END,
          qualified_in_run = (newborn_run_candidates.qualified_in_run OR EXCLUDED.qualified_in_run),
          golden_score_in_run = GREATEST(COALESCE(newborn_run_candidates.golden_score_in_run, 0), COALESCE(EXCLUDED.golden_score_in_run, 0));
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
  let skippedDeadCount = 0;
  for (const uname of usernames) {
    const r = dedupMap.get(uname);
    const hasHydratedTelemetry = r.monthly_reach != null || r.profile_views != null;
    if (
      hasHydratedTelemetry &&
      isDeadZeroOrOneCreator({
        monthly_reach: r.monthly_reach ?? 0,
        profile_views: r.profile_views ?? 0,
        is_synced: true
      })
    ) {
      skippedDeadCount++;
      continue;
    }
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

  if (prepared.length === 0) {
    return { upserted: 0, skipped_dead_count: skippedDeadCount, rows: [] };
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
    workspaceId = null,
    existingRunId = null,
    settingsOverrides = null,
    rawCookieOverride = null,
    routerOptions = {},
    runType = 'discovery',
    snowballOnly = false,
    nowMs = Date.now(),
    signal = null,
    shardMode = false,
    shardIndex = 0,
    shardTotal = 1,
    onProgress = null,
    onAutoPromotePins = null,
    onAutoPromoteRookies = null
  } = options;

  const wid = Number.isInteger(Number(workspaceId)) && Number(workspaceId) > 0 ? Number(workspaceId) : 1;
  const isShardMode = Boolean(shardMode);
  const numericShardIndex = Math.max(0, Number(shardIndex) || 0);
  const numericShardTotal = Math.max(1, Number(shardTotal) || 1);

  const { settings, profile } = await resolveEffectiveNewbornSettings(sql, {
    profileId,
    overrides: settingsOverrides,
    workspaceId: wid
  });

  if (sql && typeof sql === 'function') {
    const wsSettings = await getWorkspaceSettings(sql, wid).catch(() => null);
    if (wsSettings && wsSettings.updated_at) {
      applyWorkspaceExtractionTargetsToSettings(settings, wsSettings, settingsOverrides);
    }
  }

  const resolveRootPin = Boolean(settings.qualification?.resolve_root_pin === true);

  const resolvedCookie = rawCookieOverride !== null && rawCookieOverride !== undefined
    ? { rawCookie: String(rawCookieOverride).trim(), source: 'override' }
    : await resolveNewbornRawCookie(sql, routerOptions.env || {}, { workspaceId: wid });

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

  if (sql && typeof sql === 'function' && runRowId === null && !isShardMode) {
    try {
      const [insertedRun] = await sql`
        INSERT INTO newborn_runs (
          run_type, status, progress_stage, progress_detail, progress_pct,
          profile_id, folder_id, cluster_id, workspace_id, seed_queries, cookie_mode, started_at
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
          ${wid},
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
  let lastDbProgressWriteMs = 0;
  let lastDbProgressStage = null;

  const reportProgress = async (stage, detail, pct, counters = null, { forceDbWrite = false } = {}) => {
    const clampedPct = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
    if (counters && typeof counters === 'object') {
      if (counters.scrolled_pins !== undefined) funnel.scrolled_pins = Number(counters.scrolled_pins) || 0;
      if (counters.matched_repins !== undefined) funnel.matched_repins = Number(counters.matched_repins) || 0;
      if (counters.hydrated_pins !== undefined) funnel.hydrated_pins = Number(counters.hydrated_pins) || 0;
      if (counters.verified_winners !== undefined) funnel.verified_winners = Number(counters.verified_winners) || 0;
    }
    if (typeof onProgress === 'function') {
      try {
        onProgress({
          stage,
          detail,
          pct: clampedPct,
          counters,
          funnel: { ...funnel },
          idea_page: runIdeaPage,
          cookie_mode: router.effectiveMode
        });
      } catch (_) {}
    }
    if (sql && typeof sql === 'function' && runRowId !== null && !isShardMode) {
      const nowTick = Date.now();
      const stageChanged = stage !== lastDbProgressStage;
      const isTerminalStage = stage === 'completed' || stage === 'partial_rate_limited' || stage === 'cancelled' || stage === 'failed';
      if (!forceDbWrite && !stageChanged && !isTerminalStage && (nowTick - lastDbProgressWriteMs) < 2500) {
        return;
      }
      lastDbProgressWriteMs = nowTick;
      lastDbProgressStage = stage;
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
  let stopReason = null;
  let salvageTriggered = false;
  let cancelledTriggered = Boolean(signal?.aborted);
  const surfaceDiagnostics = {};

  try {
    await reportProgress('harvesting', '1. Scrolling enabled Pinterest extraction paths…', 8);

    if (!snowballOnly && !cancelledTriggered) {
      let discoveryHalted = false;
      try {
        // Automatically resolve official Pinterest Idea Page metadata & search volume for explicit seed query
        // Skip redundant Idea Page lookups on non-primary shards whose surfaces disabled ideas_feeds (e.g. board-slice workers)
        const shouldResolveRunIdeaPage = cleanSeeds.length > 0
          && !signal?.aborted
          && (!isShardMode || numericShardIndex === 0 || surfacesCfg.ideas_feeds?.enabled !== false);
        if (shouldResolveRunIdeaPage) {
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
        if (!hasExplicitIntent && !signal?.aborted) {
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

          if (surfacesCfg.zero_query_popular?.enabled && !signal?.aborted) {
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

        const maxQueriesLimit = Math.max(1, Math.min(100, Number(settings.discovery?.max_queries_per_run) || 25));
        const queriesToRun = Array.from(activeQueryPool).slice(0, maxQueriesLimit);
        const pathTasks = [];

        const runPathGuard = async (fn) => {
          try {
            await fn();
          } catch (pathErr) {
            if (isAbortError(pathErr, signal)) {
              cancelledTriggered = true;
              stopReason = 'operator_cancelled';
              discoveryHalted = true;
              return;
            }
            if (isRateLimitError(pathErr)) {
              discoveryHalted = true;
              throw pathErr;
            }
            throw pathErr;
          }
        };

        // Path 1: Search (`BaseSearchResource/get`, `scope: "pins"`, up to 10,000 pins)
        if (surfacesCfg.pin_serp_capsules?.enabled && queriesToRun.length > 0) {
          surfacesExecuted.push('pin_serp_capsules');
          pathTasks.push(runPathGuard(async () => {
            for (const q of queriesToRun) {
              if (signal?.aborted || discoveryHalted) break;
              let serpPagesReported = 0;
              const serpRes = await harvestPinSerpWithCapsulesSurface(router, q, {
                maxPages: surfacesCfg.pin_serp_capsules.max_pages,
                pageSize: surfacesCfg.pin_serp_capsules.page_size || 50,
                targetPins: surfacesCfg.pin_serp_capsules.target_pins ?? null,
                signal,
                onPageProgress: async ({ pagesFetched }) => {
                  serpPagesReported += 1;
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
              funnel.pages_scrolled += Math.max(0, Number(serpRes.pages_fetched || 0) - serpPagesReported);
              for (const p of (serpRes.pins || [])) ingestCandidate(p);
              for (const cap of (serpRes.capsules || [])) {
                if (cap?.term) discoveredCapsules.add(`${q} ${cap.term}`.trim().toLowerCase());
              }
            }
          }));
        }

        // Path 2: Matching Boards -> Fair multi-query fan-out -> Primary "Find more ideas" (`board_more_ideas`)
        if ((surfacesCfg.fresh_boards?.enabled && queriesToRun.length > 0) || cleanSeedBoards.length > 0) {
          pathTasks.push(runPathGuard(async () => {
            const maxBoardsLimit = Math.max(1, Math.min(50, Number(surfacesCfg.fresh_boards?.max_boards_to_expand) || 10));
            const perQueryBoardCap = queriesToRun.length > 1
              ? Math.max(2, Math.ceil(maxBoardsLimit / queriesToRun.length))
              : maxBoardsLimit;
            if (surfacesCfg.fresh_boards?.enabled && queriesToRun.length > 0) {
              surfacesExecuted.push('fresh_boards');
              const seenBoardIds = new Set();
              for (const q of queriesToRun) {
                if (signal?.aborted || discoveryHalted) break;
                const bRes = await harvestFreshBoardsSurface(router, q, {
                  maxPages: surfacesCfg.fresh_boards.max_pages,
                  maxBoards: perQueryBoardCap,
                  maxBoardAgeDays: settings.discovery.max_board_age_days,
                  nowMs,
                  signal
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

            const allBoardsToExpand = freshBoardsDiscovered.slice(0, maxBoardsLimit);
            const rawSliceTotal = Number(settingsOverrides?.discovery?.board_slice_total ?? settings.discovery?.board_slice_total ?? 1);
            const boardSliceTotal = Number.isInteger(rawSliceTotal) && rawSliceTotal > 1 ? rawSliceTotal : 1;
            const rawSliceIndices = Array.isArray(settingsOverrides?.discovery?.board_slice_indices)
              ? settingsOverrides.discovery.board_slice_indices
              : (Array.isArray(settings.discovery?.board_slice_indices) ? settings.discovery.board_slice_indices : null);
            const rawSliceIdx = Number(settingsOverrides?.discovery?.board_slice_index ?? settings.discovery?.board_slice_index ?? 0);
            const allowedSliceSet = boardSliceTotal > 1
              ? new Set(
                  (rawSliceIndices && rawSliceIndices.length > 0 ? rawSliceIndices : [rawSliceIdx])
                    .map((n) => Number(n))
                    .filter((n) => Number.isInteger(n) && n >= 0 && n < boardSliceTotal)
                )
              : null;
            const boardsToExpand = (allowedSliceSet && allowedSliceSet.size > 0)
              ? allBoardsToExpand.filter((_, idx) => allowedSliceSet.has(idx % boardSliceTotal))
              : allBoardsToExpand;
            if (boardsToExpand.length === 0 || signal?.aborted || discoveryHalted) return;

            const boardSem = new Semaphore(5);
            // Legacy `board_feed` is OFF by default in Wave 6E; runs only when explicitly opted-in
            if (surfacesCfg.board_feed?.enabled === true) {
              surfacesExecuted.push('board_feed');
              await Promise.all(
                boardsToExpand.map((board) => boardSem.run(async () => {
                  if (signal?.aborted || discoveryHalted) return;
                  const bfRes = await harvestBoardFeedSurface(router, board, {
                    maxPages: surfacesCfg.board_feed.max_pages,
                    pageSize: surfacesCfg.board_feed.page_size || 100,
                    targetPins: surfacesCfg.board_feed.target_pins_per_board ?? null,
                    signal
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

            // Wave 6E/6F Primary Boards Path: "Find more ideas" (`board_more_ideas`) driven by `max_boards` + `target_pins_per_board`.
            // In Guest Mode (`!router.canUseAuthSession`), automatically fall back to zero-cookie `board_feed` so boards are never silently dropped!
            if (surfacesCfg.board_more_ideas?.enabled && !signal?.aborted && !discoveryHalted) {
              const moreIdeasTargetPins = Number(
                surfacesCfg.board_more_ideas.target_pins_per_board ??
                surfacesCfg.fresh_boards?.target_pins_per_board ??
                100
              ) || 100;
              if (router.canUseAuthSession) {
                surfacesExecuted.push('board_more_ideas');
                const moreIdeasPageSize = Math.max(10, Math.min(50, Number(surfacesCfg.board_more_ideas.page_size) || 25));
                const moreIdeasMaxPages = Math.max(1, Math.min(80, Math.ceil(moreIdeasTargetPins / 25)));
                let authSkippedMoreIdeas = false;
                await Promise.all(
                  boardsToExpand.map((board) => boardSem.run(async () => {
                    if (authSkippedMoreIdeas || signal?.aborted || discoveryHalted) return;
                    const bmiRes = await harvestBoardMoreIdeasSurface(router, board, {
                      maxPages: moreIdeasMaxPages,
                      pageSize: moreIdeasPageSize,
                      targetPins: moreIdeasTargetPins,
                      signal
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
              } else if (!surfacesCfg.board_feed?.enabled) {
                // Guest-mode fallback: harvest zero-cookie board_feed / Pidgets board pins instead of skipping boards completely
                surfacesExecuted.push('board_feed');
                await Promise.all(
                  boardsToExpand.map((board) => boardSem.run(async () => {
                    if (signal?.aborted || discoveryHalted) return;
                    const bfRes = await harvestBoardFeedSurface(router, board, {
                      maxPages: Math.max(1, Math.min(20, Math.ceil(moreIdeasTargetPins / 25))),
                      pageSize: 25,
                      targetPins: moreIdeasTargetPins,
                      signal
                    });
                    funnel.boards_scanned++;
                    funnel.pages_scrolled += Number(bfRes.pages_fetched || 0);
                    for (const p of (bfRes.pins || [])) ingestCandidate(p);
                  }))
                );
              }
            }
          }));
        }

        // Path 3: Official Idea Page Feed (`/ideas/<slug>/<id>/` via `BestPinsFeedAltResource/get` + SSR fallback)
        if (surfacesCfg.ideas_feeds?.enabled && queriesToRun.length > 0) {
          surfacesExecuted.push('ideas_feeds');
          pathTasks.push(runPathGuard(async () => {
            const configuredInterestsCap = Math.max(1, Number(surfacesCfg.ideas_feeds.max_interests_per_run) || 3);
            const effectiveInterestsCap = queriesToRun.length > 1
              ? Math.min(queriesToRun.length, Math.max(configuredInterestsCap, Math.min(queriesToRun.length, 10)))
              : configuredInterestsCap;
            const interestTerms = queriesToRun.slice(0, effectiveInterestsCap);
            for (let i = 0; i < interestTerms.length; i++) {
              if (signal?.aborted || discoveryHalted) break;
              const term = interestTerms[i];
              const idRes = await harvestIdeasHubSurface(router, term, {
                maxPages: surfacesCfg.ideas_feeds.max_pages,
                pageSize: surfacesCfg.ideas_feeds.page_size || 50,
                targetPins: surfacesCfg.ideas_feeds.target_pins ?? null,
                preResolvedInterest: i === 0 && runIdeaPage?.found ? runIdeaPage : null,
                signal
              });
              funnel.pages_scrolled += Number(idRes.pages_fetched || 0);
              for (const p of (idRes.pins || [])) ingestCandidate(p);
            }
          }));
        }

        // Path 4: Authenticated Home Feed Deep Scroll (`UserHomefeedResource/get`, up to 2,000 pins)
        if (surfacesCfg.home_feed?.enabled) {
          surfacesExecuted.push('home_feed');
          pathTasks.push(runPathGuard(async () => {
            if (signal?.aborted || discoveryHalted) return;
            const hfRes = await harvestHomeFeedSurface(router, {
              maxPages: surfacesCfg.home_feed.max_pages,
              pageSize: surfacesCfg.home_feed.page_size || 50,
              targetPins: surfacesCfg.home_feed.target_pins ?? 250,
              seedQuery: cleanSeeds[0] || 'home feed',
              signal
            });
            funnel.pages_scrolled += Number(hfRes.pages_fetched || 0);
            for (const p of (hfRes.pins || [])) ingestCandidate(p);
          }));
        }

        const settledPaths = await Promise.allSettled(pathTasks);
        const rejectedErrors = settledPaths.filter((r) => r.status === 'rejected').map((r) => r.reason);
        if (rejectedErrors.length > 0) {
          const rateErr = rejectedErrors.find((e) => isRateLimitError(e));
          if (rateErr) throw rateErr;
          const nonAbortErr = rejectedErrors.find((e) => !isAbortError(e, signal));
          if (nonAbortErr) throw nonAbortErr;
          cancelledTriggered = true;
          stopReason = 'operator_cancelled';
        }
      } catch (discErr) {
        if (isAbortError(discErr, signal)) {
          cancelledTriggered = true;
          stopReason = 'operator_cancelled';
        } else if (isRateLimitError(discErr) && candidateMap.size > 0) {
          // WAVE 6F PARTIAL SALVAGE: Preserve all already-harvested candidates and proceed to Stage 2 Pidgets!
          salvageTriggered = true;
          stopReason = 'rate_limited_discovery';
          await reportProgress(
            'pretriaging',
            `Pinterest rate limit hit after ${candidateMap.size} pins — salvaging harvested candidates via Pidgets…`,
            32,
            { scrolled_pins: candidateMap.size, candidates_discovered: candidateMap.size },
            { forceDbWrite: true }
          );
        } else {
          throw discErr;
        }
      }
    }

    if (signal?.aborted) {
      cancelledTriggered = true;
      stopReason = 'operator_cancelled';
    }

    funnel.scrolled_pins = candidateMap.size;

    // Parallelized 50x Zero-Cookie Pidgets Pre-Triage (Semaphore 6) +
    // Min Re-pins (+ optional Min Saves) Pre-Filter +
    // DB Pre-Hydration Cache Reuse (`newborn_candidates` + `universal_master_pins`) +
    // Uncapped Zero-Cookie PinResource/get Verification for ALL pins passing the Pidgets gate
    const minRepinsGate = Math.max(0, Number(settings.qualification?.min_repin_count ?? 0));
    const minSavesGate = Math.max(0, Number(settings.qualification?.min_save_count ?? 0));
    const minAge = Number(settings.qualification?.min_age_days ?? 0);
    const maxAge = Number(settings.qualification?.max_age_days ?? 30);
    const matchedRepinPinIds = new Set();
    const attemptedHydrationPinIds = new Set();
    let hydrationRateLimitedGlobal = false;
    let dbPreHydratedCount = 0;

    // DB Pre-Hydration Helper: reuse already-verified `created_at_pinterest`, `visual_annotations`,
    // `raw_creation_method`, `upload_provenance`, and `pin_board_name` from DB before hitting Pinterest!
    const preHydrateCandidatesFromDb = async (pinIds = []) => {
      if (!sql || typeof sql !== 'function' || !Array.isArray(pinIds) || pinIds.length === 0) return 0;
      const cleanIds = Array.from(new Set(pinIds.filter((id) => candidateMap.has(id))));
      if (cleanIds.length === 0) return 0;
      let reused = 0;
      try {
        const [ncRows, umpRows] = await Promise.all([
          sql`
            SELECT pin_id, created_at_pinterest, visual_annotations, raw_creation_method, upload_provenance,
                   share_count, comment_count, reaction_count, is_hydrated, is_repin, board_id, board_name, board_url, metadata
            FROM newborn_candidates
            WHERE pin_id = ANY(${cleanIds}::text[])
              AND created_at_pinterest IS NOT NULL
              AND is_hydrated = TRUE;
          `.catch(() => []),
          sql`
            SELECT pin_id, created_at_pinterest, visual_annotations, creation_method,
                   share_count, comment_count, reaction_count, is_hydrated, is_repin, board_id, board_name
            FROM universal_master_pins
            WHERE pin_id = ANY(${cleanIds}::text[])
              AND created_at_pinterest IS NOT NULL;
          `.catch(() => [])
        ]);

        const dbByPin = new Map();
        for (const r of (umpRows || [])) {
          if (!r?.pin_id || !r.created_at_pinterest) continue;
          dbByPin.set(String(r.pin_id), {
            created_at_pinterest: new Date(r.created_at_pinterest).toISOString(),
            visual_annotations: Array.isArray(r.visual_annotations) ? r.visual_annotations : [],
            raw_creation_method: r.creation_method || null,
            upload_provenance: null,
            share_count: r.share_count != null ? Number(r.share_count) : null,
            comment_count: r.comment_count != null ? Number(r.comment_count) : null,
            reaction_count: r.reaction_count != null ? Number(r.reaction_count) : null,
            is_repin: Boolean(r.is_repin),
            pin_board_name: r.board_name || null,
            root_age_verified: !resolveRootPin
          });
        }
        for (const r of (ncRows || [])) {
          if (!r?.pin_id || !r.created_at_pinterest) continue;
          const prev = dbByPin.get(String(r.pin_id));
          const metaVerified = Boolean(r.metadata && typeof r.metadata === 'object' && r.metadata.root_age_verified === true);
          const ncAnns = Array.isArray(r.visual_annotations) ? r.visual_annotations : [];
          dbByPin.set(String(r.pin_id), {
            created_at_pinterest: new Date(r.created_at_pinterest).toISOString(),
            visual_annotations: ncAnns.length > 0 ? ncAnns : (prev?.visual_annotations || []),
            raw_creation_method: r.raw_creation_method || prev?.raw_creation_method || null,
            upload_provenance: r.upload_provenance || prev?.upload_provenance || null,
            share_count: r.share_count != null ? Number(r.share_count) : (prev?.share_count ?? null),
            comment_count: r.comment_count != null ? Number(r.comment_count) : (prev?.comment_count ?? null),
            reaction_count: r.reaction_count != null ? Number(r.reaction_count) : (prev?.reaction_count ?? null),
            is_repin: Boolean(r.is_repin || prev?.is_repin),
            pin_board_name: r.board_name || prev?.pin_board_name || null,
            root_age_verified: resolveRootPin ? metaVerified : true
          });
        }

        for (const [pid, cached] of dbByPin.entries()) {
          const cur = candidateMap.get(pid);
          if (!cur) continue;
          const hasAnns = Array.isArray(cached.visual_annotations) && cached.visual_annotations.length > 0;
          if (!cached.created_at_pinterest) continue;
          if (resolveRootPin && !cached.root_age_verified) continue;

          const createdMs = Date.parse(cached.created_at_pinterest);
          const ageDays = Number.isFinite(createdMs) ? Math.max(0.05, Math.round(((nowMs - createdMs) / 86_400_000) * 10) / 10) : null;
          ingestCandidate({
            pin_id: pid,
            first_surface: null,
            discovered_surfaces: [],
            created_at_pinterest: cached.created_at_pinterest,
            age_days: ageDays,
            root_age_verified: cached.root_age_verified,
            visual_annotations: cached.visual_annotations,
            raw_creation_method: cached.raw_creation_method,
            upload_provenance: cached.upload_provenance,
            share_count: cached.share_count,
            comment_count: cached.comment_count,
            reaction_count: cached.reaction_count,
            is_repin: cached.is_repin,
            pin_board_name: cached.pin_board_name,
            is_hydrated: hasAnns
          });
          if (hasAnns) {
            reused++;
            dbPreHydratedCount++;
          }
        }
      } catch (_) {}
      return reused;
    };

    const computeKnownAgeDays = (cand) => {
      if (!cand) return null;
      if (cand.created_at_pinterest) {
        const parsedMs = Date.parse(String(cand.created_at_pinterest));
        if (Number.isFinite(parsedMs)) {
          return Math.max(0, (nowMs - parsedMs) / 86_400_000);
        }
      }
      if (cand.age_days !== null && cand.age_days !== undefined && Number.isFinite(Number(cand.age_days))) {
        return Number(cand.age_days);
      }
      return null;
    };

    const runPinHydrationBatch = async (
      batchPins = [],
      {
        progressPrefix = '2. Verifying root ages & annotations',
        maxConcurrency = 4,
        startPct = 48,
        spanPct = 34
      } = {}
    ) => {
      const unwrappedIds = new Set();
      let hydratedDone = 0;
      let hydrationRateLimited = false;

      if (!Array.isArray(batchPins) || batchPins.length === 0 || cancelledTriggered || signal?.aborted || hydrationRateLimitedGlobal) {
        return { unwrappedIds, hydratedDone, rateLimited: hydrationRateLimitedGlobal };
      }

      const reportEvery = Math.max(8, Math.ceil(batchPins.length / 5));

      // Cooldown wait if discoveryBreaker is OPEN with remaining cooldown <= 35s
      const remainingCooldownMs = Number(router.discoveryBreaker?.getRemainingCooldownMs?.() || 0);
      if (remainingCooldownMs > 0 && remainingCooldownMs <= 35_000) {
        const waitMs = Math.min(remainingCooldownMs + 500, 35_000);
        await reportProgress(
          'hydrating_pins',
          `Waiting ${Math.ceil(waitMs / 1000)}s for Pinterest cooldown before verifying ${batchPins.length} matched pins…`,
          Math.max(40, startPct - 2),
          {
            scrolled_pins: candidateMap.size,
            matched_repins: funnel.matched_repins,
            candidates_discovered: candidateMap.size
          },
          { forceDbWrite: true }
        );
        try {
          await sleepAbortable(waitMs, signal);
        } catch (sleepErr) {
          if (isAbortError(sleepErr, signal)) {
            cancelledTriggered = true;
            stopReason = 'operator_cancelled';
          }
        }
      }

      if (cancelledTriggered || signal?.aborted) {
        return { unwrappedIds, hydratedDone, rateLimited: hydrationRateLimitedGlobal };
      }

      await reportProgress(
        'hydrating_pins',
        `${progressPrefix} (0/${batchPins.length} matched pins)…`,
        startPct,
        {
          scrolled_pins: candidateMap.size,
          matched_repins: funnel.matched_repins,
          candidates_discovered: candidateMap.size
        }
      );

      const hydrateSingleCandidate = async (cand) => {
        if (cancelledTriggered || signal?.aborted || hydrationRateLimited || hydrationRateLimitedGlobal) return false;
        attemptedHydrationPinIds.add(cand.pin_id);
        try {
          const hyd = await hydratePinZeroCookie(cand.pin_id, router, {
            rootPinCache,
            nowMs,
            resolveRootPin,
            signal
          });
          if (!hyd.ok && hyd.status === 429) {
            hydrationRateLimited = true;
            hydrationRateLimitedGlobal = true;
            salvageTriggered = true;
            stopReason = stopReason || 'rate_limited_hydration';
            return false;
          }
          if (hyd.ok && hyd.pin) {
            const existingCand = candidateMap.get(cand.pin_id) || cand;
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
              attemptedHydrationPinIds.add(rootId);
              unwrappedIds.add(rootId);
              funnel.board_repins_unwrapped++;
            } else {
              ingestCandidate(hyd.pin);
            }
          }
          hydratedDone++;
          funnel.hydrated_pins++;
          if (hydratedDone % reportEvery === 0 || hydratedDone === batchPins.length) {
            const pct = startPct + Math.round((hydratedDone / Math.max(1, batchPins.length)) * spanPct);
            await reportProgress(
              'hydrating_pins',
              `${progressPrefix} (${hydratedDone}/${batchPins.length} pins)…`,
              pct,
              {
                scrolled_pins: candidateMap.size,
                matched_repins: funnel.matched_repins,
                hydrated_pins: funnel.hydrated_pins,
                candidates_discovered: candidateMap.size
              }
            );
          }
          return Boolean(hyd.ok);
        } catch (hydErr) {
          if (isAbortError(hydErr, signal)) {
            cancelledTriggered = true;
            stopReason = 'operator_cancelled';
            return false;
          }
          if (isRateLimitError(hydErr)) {
            hydrationRateLimited = true;
            hydrationRateLimitedGlobal = true;
            salvageTriggered = true;
            stopReason = stopReason || 'rate_limited_hydration';
            return false;
          }
          throw hydErr;
        }
      };

      const breakerState = router.discoveryBreaker?.state || 'CLOSED';
      const needsHalfOpenSerialProbe = salvageTriggered || breakerState === 'OPEN' || breakerState === 'HALF_OPEN';

      if (needsHalfOpenSerialProbe) {
        // CRITICAL HALF_OPEN GUARD: Hydrate batchPins[0] serially as a single probe
        // so concurrent Semaphore workers cannot trip probeInFlight === true into CircuitBreakerOpenError!
        const probeOk = await hydrateSingleCandidate(batchPins[0]);
        const probeRecoveredBreaker = router.discoveryBreaker?.state === 'CLOSED';
        if ((probeOk || probeRecoveredBreaker) && !hydrationRateLimited && !hydrationRateLimitedGlobal && !cancelledTriggered && !signal?.aborted && batchPins.length > 1) {
          const salvageSem = new Semaphore(3);
          await Promise.all(
            batchPins.slice(1).map((cand) => salvageSem.run(() => hydrateSingleCandidate(cand)))
          );
        }
      } else {
        const normalSem = new Semaphore(Math.max(1, Number(maxConcurrency) || 8));
        await Promise.all(
          batchPins.map((cand) => normalSem.run(() => hydrateSingleCandidate(cand)))
        );
      }

      return { unwrappedIds, hydratedDone, rateLimited: hydrationRateLimited || hydrationRateLimitedGlobal };
    };

    const enrichAndScoreIds = async (targetIds, progressLabelPrefix = '2. Verifying root ages & annotations') => {
      if (targetIds.length === 0 || cancelledTriggered || signal?.aborted) return;

      if (settings.discovery.hydration.enable_pidgets_pretriage) {
        await reportProgress(
          'pretriaging',
          `1b. Checking Re-pins across ${targetIds.length} scrolled pins (50x Zero-Cookie Pidgets)…`,
          34,
          { scrolled_pins: candidateMap.size, candidates_discovered: candidateMap.size }
        );
        try {
          const pidgetsMap = await pretriageCandidatesWithPidgets(targetIds, router, {
            concurrency: 6,
            signal,
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
        } catch (pidErr) {
          if (isAbortError(pidErr, signal)) {
            cancelledTriggered = true;
            stopReason = 'operator_cancelled';
            return;
          }
          if (!isRateLimitError(pidErr)) {
            throw pidErr;
          }
          salvageTriggered = true;
          stopReason = stopReason || 'rate_limited_pidgets';
        }
      }

      if (cancelledTriggered || signal?.aborted) {
        cancelledTriggered = true;
        stopReason = 'operator_cancelled';
        return;
      }

      // Gate candidates by Min Re-pins (primary) and Min Saves (ONLY when > 0) before hydrating via PinResource/get.
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

      for (const c of matchingPreGate) {
        if (c?.pin_id) matchedRepinPinIds.add(c.pin_id);
      }
      funnel.matched_repins = matchedRepinPinIds.size;

      // Pre-hydrate matching candidates from DB cache (newborn_candidates + universal_master_pins)
      // to skip redundant Pinterest PinResource/get requests!
      await preHydrateCandidatesFromDb(matchingPreGate.map((c) => c.pin_id));

      // UNCAPPED HYDRATION (Directive 3): Hydrate ALL pins that passed the Min Re-pins / Min Saves gate
      // (skipping only those already hydrated from DB or whose known age is already outside [minAge, maxAge]).
      // Sort cleanly by Re-pins DESC so highest-traction pins from ALL surfaces (Search, Boards, Idea Page,
      // Related Pins) are verified first without starving board_more_ideas or Path 5 Related Pins!
      const orderedForHydration = matchingPreGate
        .map((c) => candidateMap.get(c.pin_id) || c)
        .filter((c) => {
          const needsHydration = !c.is_hydrated || !c.created_at_pinterest || c.root_age_verified === null || !Array.isArray(c.visual_annotations) || c.visual_annotations.length === 0;
          if (!needsHydration) return false;
          const knownAge = computeKnownAgeDays(c);
          if (knownAge !== null) {
            if (knownAge > maxAge) return false;
            if (knownAge < minAge && (!resolveRootPin || !c.is_repin)) return false;
          }
          return true;
        })
        .sort((a, b) => {
          const aDirect = Number(a.repin_count ?? 0) >= minRepinsGate ? 1 : 0;
          const bDirect = Number(b.repin_count ?? 0) >= minRepinsGate ? 1 : 0;
          if (bDirect !== aDirect) return bDirect - aDirect;
          const aSig = Math.max(Number(a.repin_count ?? 0), Number(a.save_count ?? 0));
          const bSig = Math.max(Number(b.repin_count ?? 0), Number(b.save_count ?? 0));
          return (bSig - aSig) || (Number(b.repin_count ?? 0) - Number(a.repin_count ?? 0));
        });

      const { unwrappedIds } = await runPinHydrationBatch(orderedForHydration, {
        progressPrefix: progressLabelPrefix,
        maxConcurrency: isShardMode ? 6 : 8,
        startPct: 48,
        spanPct: 34
      });

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
      !cancelledTriggered &&
      !signal?.aborted &&
      !salvageTriggered &&
      (
        snowballOnly ||
        cleanSeedPinIds.length > 0 ||
        (surfacesCfg.related_pin_snowball?.enabled && settings.discovery.snowball.enabled && settings.discovery.snowball.max_hops > 0)
      )
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

      const snowballDiag = {
        seed_pin_ids: [...currentFrontier],
        pages_fetched: 0,
        pins_collected: 0,
        last_http_status: null,
        error: null,
        skipped_auth_only: false
      };

      if (currentFrontier.length > 0) {
        surfacesExecuted.push('related_pin_snowball');
        await reportProgress('snowballing', `Scrolling Related Pins from ${currentFrontier.length} seed pin(s)…`, 84);
      }

      const perSeedTarget = relatedTargetPins
        ? Math.max(50, Math.ceil(Number(relatedTargetPins) / Math.max(1, currentFrontier.length)))
        : null;

      try {
        for (let hop = 1; hop <= maxHops && currentFrontier.length > 0; hop++) {
          if (cancelledTriggered || signal?.aborted || salvageTriggered) break;
          const newSnowballIds = [];
          const newSnowballIdSet = new Set();
          let authSkipped = false;

          for (const seedId of currentFrontier) {
            if (cancelledTriggered || signal?.aborted || salvageTriggered) break;
            if (expandedSeeds.has(seedId)) continue;
            expandedSeeds.add(seedId);

            const parentCand = candidateMap.get(seedId);
            const sbRes = await harvestRelatedPinSnowballSurface(router, seedId, {
              maxPages: surfacesCfg.related_pin_snowball?.max_pages || 10,
              pageSize: surfacesCfg.related_pin_snowball?.page_size || 24,
              targetPins: perSeedTarget,
              hop,
              seedQuery: parentCand?.seed_query || cleanSeeds[0] || null,
              signal
            });
            funnel.pages_scrolled += Number(sbRes.pages_fetched || 0);
            snowballDiag.pages_fetched += Number(sbRes.pages_fetched || 0);
            snowballDiag.pins_collected += Number((sbRes.pins || []).length);
            if (sbRes.last_http_status !== undefined && sbRes.last_http_status !== null) {
              snowballDiag.last_http_status = sbRes.last_http_status;
            }
            if (sbRes.error) {
              snowballDiag.error = sbRes.error;
            }
            if (sbRes.skipped_auth_only) {
              snowballDiag.skipped_auth_only = true;
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

          if (authSkipped || cancelledTriggered || signal?.aborted) break;
          snowballHopsExecuted = hop;
          funnel.scrolled_pins = candidateMap.size;

          if (newSnowballIds.length > 0) {
            await enrichAndScoreIds(newSnowballIds, `2b. Verifying root dates for Related Pins (hop ${hop})`);
          }

          if (hop < maxHops && !cancelledTriggered && !signal?.aborted && !salvageTriggered) {
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
      } catch (sbErr) {
        if (isAbortError(sbErr, signal)) {
          cancelledTriggered = true;
          stopReason = 'operator_cancelled';
        } else if (isRateLimitError(sbErr) && candidateMap.size > 0) {
          salvageTriggered = true;
          stopReason = stopReason || 'rate_limited_snowball';
          snowballDiag.error = redactSecrets(sbErr.message);
        } else {
          throw sbErr;
        }
      }

      surfaceDiagnostics.related_pin_snowball = snowballDiag;
    }

    // Preliminary score pass before optional opt-in creator sync
    const preScoredCandidates = Array.from(candidateMap.values()).map((c) => scoreNewbornCandidate(c, settings, { nowMs }));
    for (const c of preScoredCandidates) candidateMap.set(c.pin_id, c);

    // STRICT OPT-IN ACCOUNT SYNC (OFF BY DEFAULT!):
    // Never run automatic `UserResource/get` calls during hunts unless explicitly opted-in via
    // `settings.discovery.hydration.auto_fetch_accounts === true`.
    const hydratedUsersMap = new Map();
    if (
      !cancelledTriggered &&
      !signal?.aborted &&
      !salvageTriggered &&
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
            if (cancelledTriggered || signal?.aborted) return;
            try {
              const uRes = await hydrateUserZeroCookie(uname, router, { signal });
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
            } catch (uErr) {
              if (isAbortError(uErr, signal)) {
                cancelledTriggered = true;
                stopReason = 'operator_cancelled';
              } else if (isRateLimitError(uErr)) {
                salvageTriggered = true;
                stopReason = stopReason || 'rate_limited_creators';
              }
            }
          }))
        );
      }
    }

    // Final re-scoring + HARD GATE BEFORE PERSISTENCE:
    // Discard in memory any candidate that lacks a verified root `created_at_pinterest`,
    // falls outside `[min_age_days, max_age_days]`, fails `Min Re-pins`, or fails optional `Min Saves > 0`.
    const evaluateQualifiedWinners = (evaluatedList) => evaluatedList
      .filter((c) => {
        if (!c || c.qualified !== true) return false;
        if (!c.created_at_pinterest) return false;
        if (c.root_age_verified === false || c.repin_root_unverified === true) return false;
        const age = c.age_days != null ? Number(c.age_days) : NaN;
        if (!Number.isFinite(age) || age < minAge || age > maxAge) return false;
        return true;
      })
      .sort((a, b) => (Number(b.repin_count ?? 0) - Number(a.repin_count ?? 0)) || (Number(a.age_days ?? 9999) - Number(b.age_days ?? 9999)));

    let allEvaluated = Array.from(candidateMap.values()).map((c) => scoreNewbornCandidate(c, settings, { nowMs }));
    let verifiedQualified = evaluateQualifiedWinners(allEvaluated);

    // WAVE 6G PASS 2 — Guaranteed Winner Hydration:
    // Hydrate any qualified winners that did not yet receive `PinResource/get` in Pass 1 so they carry
    // full `visual_annotations`, `share_count`, `raw_creation_method`, and verified root creation age.
    const unhydratedWinners = verifiedQualified.filter(
      (c) => !attemptedHydrationPinIds.has(c.pin_id) && (!c.is_hydrated || !Array.isArray(c.visual_annotations) || c.visual_annotations.length === 0)
    );
    if (
      unhydratedWinners.length > 0 &&
      !cancelledTriggered &&
      !signal?.aborted &&
      !salvageTriggered &&
      !hydrationRateLimitedGlobal
    ) {
      const winnerBatch = unhydratedWinners;
      if (winnerBatch.length > 0) {
        const winnerPassRes = await runPinHydrationBatch(winnerBatch, {
          progressPrefix: '3. Hydrating verified Golden Pin annotations',
          maxConcurrency: isShardMode ? 6 : 8,
          startPct: 86,
          spanPct: 6
        });
        const touchedWinnerIds = new Set([
          ...winnerBatch.map((c) => c.pin_id),
          ...winnerPassRes.unwrappedIds
        ]);
        for (const pid of touchedWinnerIds) {
          const cur = candidateMap.get(pid);
          if (cur) {
            candidateMap.set(pid, scoreNewbornCandidate(cur, settings, { nowMs }));
          }
        }
        allEvaluated = Array.from(candidateMap.values()).map((c) => scoreNewbornCandidate(c, settings, { nowMs }));
        verifiedQualified = evaluateQualifiedWinners(allEvaluated);
      }
    }

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
      // Per-harvest writes to newborn_rookie_accounts retired in favor of on-demand account fetch.
      persistedRookies = [];
    }

    // Trigger immediate auto-promotion ONLY if `auto_track_enabled` AND `min_consecutive_days` is already satisfied
    let autoPromotedCount = 0;
    if (settings.automation.auto_track_enabled && !cancelledTriggered) {
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

    const finalStatus = (cancelledTriggered || signal?.aborted)
      ? 'cancelled'
      : (salvageTriggered ? 'partial_rate_limited' : 'completed');
    const resolvedStopReason = finalStatus === 'cancelled'
      ? 'operator_cancelled'
      : (finalStatus === 'partial_rate_limited' ? (stopReason || 'rate_limited_discovery') : null);
    const salvagedPinsCount = finalStatus === 'partial_rate_limited' ? funnel.scrolled_pins : 0;

    let finalProgressDetail = `Scrolled ${funnel.scrolled_pins} pins -> ${funnel.matched_repins} matched Re-pins -> ${qualifiedCount} verified Golden Pin${qualifiedCount === 1 ? '' : 's'}.`;
    if (finalStatus === 'cancelled') {
      finalProgressDetail = `Cancelled by operator — saved ${qualifiedCount} verified Golden Pin${qualifiedCount === 1 ? '' : 's'} from ${funnel.scrolled_pins} scrolled.`;
    } else if (finalStatus === 'partial_rate_limited') {
      finalProgressDetail = `Rate-limited during discovery — salvaged ${funnel.scrolled_pins} scrolled -> ${funnel.matched_repins} matched Re-pins -> ${qualifiedCount} verified Golden Pin${qualifiedCount === 1 ? '' : 's'}.`;
    } else if (snowballOnly && funnel.scrolled_pins === 0 && surfaceDiagnostics.related_pin_snowball) {
      const sd = surfaceDiagnostics.related_pin_snowball;
      const reasonText = sd.skipped_auth_only
        ? 'Auth cookie required (HTTP 412)'
        : (sd.error || (sd.last_http_status ? `HTTP ${sd.last_http_status}` : 'no related pins returned'));
      finalProgressDetail = `Related Pins returned 0 pins (${reasonText}).`;
    }

    const finalTelemetry = sanitizeForJsonb({
      router: routerTelemetry,
      funnel: { ...funnel, verified_winners: qualifiedCount },
      idea_page: runIdeaPage,
      cluster_id: numericClusterId,
      fresh_boards_found: freshBoardsDiscovered.length,
      growing_trends_found: discoveredTrends.length,
      total_scanned_count: funnel.scrolled_pins,
      discarded_in_memory_count: discardedInMemoryCount,
      stop_reason: resolvedStopReason,
      salvaged_pins_count: salvagedPinsCount,
      ...(Object.keys(surfaceDiagnostics).length > 0 ? { surface_diagnostics: surfaceDiagnostics } : {}),
      applied_filters: {
        max_age_days: maxAge,
        min_repin_count: minRepinsGate,
        min_save_count: minSavesGate,
        resolve_root_pin: resolveRootPin
      }
    });

    const uniqueSurfacesExecuted = Array.from(new Set(surfacesExecuted));

    if (sql && typeof sql === 'function') {
      if (isShardMode) {
        if (runRowId !== null) {
          const shardSummary = sanitizeForJsonb({
            shard_index: numericShardIndex,
            shard_total: numericShardTotal,
            status: finalStatus,
            stop_reason: resolvedStopReason,
            keywords_count: cleanSeeds.length,
            scrolled_pins: funnel.scrolled_pins,
            matched_repins: funnel.matched_repins,
            hydrated_pins: funnel.hydrated_pins,
            verified_winners: qualifiedCount,
            golden_pins_count: goldenPinsCount,
            rookie_creators_count: persistedRookies.length,
            surfaces_used: uniqueSurfacesExecuted,
            cookie_mode: router.effectiveMode,
            completed_at: new Date().toISOString()
          });
          await sql`
            UPDATE newborn_runs
            SET
              status = CASE WHEN status = 'queued' THEN 'running' ELSE status END,
              shards_completed = shards_completed + 1,
              candidates_discovered = candidates_discovered + ${funnel.scrolled_pins},
              candidates_qualified = candidates_qualified + ${qualifiedCount},
              golden_pins_count = golden_pins_count + ${goldenPinsCount},
              rookie_creators_count = rookie_creators_count + ${persistedRookies.length},
              auto_watchlisted_count = auto_watchlisted_count + ${autoWatchlistedCount},
              auto_promoted_count = auto_promoted_count + ${autoPromotedCount},
              snowball_hops_executed = GREATEST(snowball_hops_executed, ${snowballHopsExecuted}),
              surfaces_used = COALESCE((
                SELECT jsonb_agg(DISTINCT elem)
                FROM (
                  SELECT jsonb_array_elements(COALESCE(surfaces_used, '[]'::jsonb)) AS elem
                  UNION
                  SELECT jsonb_array_elements(${JSON.stringify(uniqueSurfacesExecuted)}::jsonb) AS elem
                ) merged_run_surfaces
              ), '[]'::jsonb),
              cookie_mode = ${router.effectiveMode},
              progress_stage = 'running',
              progress_detail = ${`Fleet shard ${numericShardIndex + 1}/${numericShardTotal} finished (${funnel.scrolled_pins} scrolled -> ${qualifiedCount} winners).`},
              progress_pct = LEAST(95, ROUND(((shards_completed + 1)::numeric / GREATEST(1, shards_total)) * 90)),
              telemetry = jsonb_set(
                jsonb_set(
                  COALESCE(telemetry, '{}'::jsonb),
                  '{shards}',
                  COALESCE(telemetry->'shards', '{}'::jsonb),
                  true
                ),
                ARRAY['shards', ${String(numericShardIndex)}],
                ${JSON.stringify(shardSummary)}::jsonb,
                true
              )
            WHERE id = ${runRowId};
          `.catch(() => {});
        }
      } else {
        await stampAutomationRunTimestamp(sql, 'discovery', new Date(nowMs).toISOString(), { workspaceId: wid }).catch(() => {});
        if (runRowId !== null) {
          await sql`
            UPDATE newborn_runs
            SET
              status = ${finalStatus},
              progress_stage = ${finalStatus},
              progress_detail = ${finalProgressDetail},
              progress_pct = 100,
              error_message = NULL,
              surfaces_used = ${JSON.stringify(uniqueSurfacesExecuted)}::jsonb,
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
    }

    if (typeof onProgress === 'function' && !isShardMode) {
      try {
        onProgress({
          stage: finalStatus,
          status: finalStatus,
          detail: finalProgressDetail,
          pct: 100,
          counters: {
            scrolled_pins: funnel.scrolled_pins,
            matched_repins: funnel.matched_repins,
            hydrated_pins: funnel.hydrated_pins,
            verified_winners: qualifiedCount,
            candidates_discovered: funnel.scrolled_pins,
            candidates_qualified: qualifiedCount,
            golden_pins_count: goldenPinsCount,
            rookie_creators_count: persistedRookies.length
          },
          funnel: { ...funnel, verified_winners: qualifiedCount },
          idea_page: runIdeaPage,
          cookie_mode: router.effectiveMode,
          stop_reason: resolvedStopReason,
          salvaged_pins_count: salvagedPinsCount,
          surface_diagnostics: surfaceDiagnostics
        });
      } catch (_) {}
    }

    return {
      ok: true,
      status: finalStatus,
      stop_reason: resolvedStopReason,
      salvaged_pins_count: salvagedPinsCount,
      surface_diagnostics: surfaceDiagnostics,
      run_id: runRowId,
      cluster_id: numericClusterId,
      run_type: runType,
      shard_mode: isShardMode,
      shard_index: numericShardIndex,
      shard_total: numericShardTotal,
      resolve_root_pin: resolveRootPin,
      profile: profile ? { id: profile.id, slug: profile.slug, name: profile.name } : null,
      cookie_mode: router.effectiveMode,
      surfaces_executed: uniqueSurfacesExecuted,
      snowball_hops_executed: snowballHopsExecuted,
      idea_page: runIdeaPage,
      funnel: { ...funnel, db_pre_hydrated: dbPreHydratedCount, verified_winners: qualifiedCount },
      stats: {
        scrolled_pins: funnel.scrolled_pins,
        matched_repins: funnel.matched_repins,
        db_pre_hydrated: dbPreHydratedCount,
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
      if (isShardMode) {
        const failedShardPayload = sanitizeForJsonb({
          shard_index: numericShardIndex,
          shard_total: numericShardTotal,
          status: 'failed',
          error: safeErrMsg,
          failed_at: new Date().toISOString()
        });
        await sql`
          UPDATE newborn_runs
          SET
            shards_failed = shards_failed + 1,
            telemetry = jsonb_set(
              jsonb_set(
                COALESCE(telemetry, '{}'::jsonb),
                '{shards}',
                COALESCE(telemetry->'shards', '{}'::jsonb),
                true
              ),
              ARRAY['shards', ${String(numericShardIndex)}],
              ${JSON.stringify(failedShardPayload)}::jsonb,
              true
            )
          WHERE id = ${runRowId};
        `.catch(() => {});
      } else if (isAbortError(err, signal)) {
        await sql`
          UPDATE newborn_runs
          SET
            status = 'cancelled',
            progress_stage = 'cancelled',
            progress_detail = 'Cancelled by operator.',
            error_message = NULL,
            surfaces_used = ${JSON.stringify(Array.from(new Set(surfacesExecuted)))}::jsonb,
            cookie_mode = ${router.effectiveMode},
            telemetry = ${JSON.stringify(sanitizeForJsonb({
              router: router.getRedactedTelemetry(),
              funnel: { ...funnel },
              stop_reason: 'operator_cancelled'
            }))}::jsonb,
            completed_at = NOW()
          WHERE id = ${runRowId};
        `.catch(() => {});
      } else {
        await sql`
          UPDATE newborn_runs
          SET
            status = 'failed',
            progress_stage = 'failed',
            progress_detail = ${safeErrMsg},
            error_message = ${safeErrMsg},
            surfaces_used = ${JSON.stringify(Array.from(new Set(surfacesExecuted)))}::jsonb,
            cookie_mode = ${router.effectiveMode},
            telemetry = ${JSON.stringify(sanitizeForJsonb({
              router: router.getRedactedTelemetry(),
              funnel: { ...funnel },
              error: safeErrMsg
            }))}::jsonb,
            completed_at = NOW()
          WHERE id = ${runRowId};
        `.catch(() => {});
      }
    }
    throw err;
  }
}
