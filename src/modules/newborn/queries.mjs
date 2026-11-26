/**
 * src/modules/newborn/queries.mjs
 *
 * Read/Query & Staging Management Services for `/newborn` Studio:
 * overview, candidates, dossiers, stage updates, deletion, rookies, runs, daily anchors, crossover report.
 */

import { escapeSqlWildcards } from '../../utils.mjs';
import {
  invalidateEdgeCache,
  isValidPinId
} from '../../http/security-and-response.mjs';
import {
  SURFACES_CATALOG,
  OFFICIAL_L1_INTERESTS,
  getNewbornSettings,
  evaluateAutomationSchedule,
  getNewbornCookieStatus
} from './settings.mjs';
import { decodeHtmlEntities, formatPinterestBoardUrl } from './surface-normalizers.mjs';
import { buildNewbornCrossoverMatrix } from './intelligence.mjs';

function decodeCandidateAnnotations(annotations) {
  if (!Array.isArray(annotations)) return [];
  return annotations.map((item) => {
    if (typeof item === 'string') return decodeHtmlEntities(item);
    if (item && typeof item === 'object') {
      return {
        ...item,
        ...(item.name != null ? { name: decodeHtmlEntities(item.name) } : {})
      };
    }
    return item;
  });
}

function parseOptionalPositiveInt(val) {
  if (val == null || val === '') return null;
  const n = Number(val);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function normalizeLinkFilter(linkFilter, linklessOnly) {
  const raw = String(linkFilter || '').trim().toLowerCase();
  if (raw === 'linkless' || raw === 'no_link' || raw === 'without_link') return 'linkless';
  if (raw === 'linked' || raw === 'has_link' || raw === 'with_link') return 'linked';
  if (raw === 'all') return 'all';
  if (linklessOnly === true || linklessOnly === 'true') return 'linkless';
  return 'all';
}

/**
 * Single-pass Executive Overview for `/api/newborn/overview`.
 */
export async function getNewbornOverview(sql, env = {}, { workspaceId = 1, folderId = null } = {}) {
  const wid = parseOptionalPositiveInt(workspaceId) || 1;
  const fid = parseOptionalPositiveInt(folderId);
  const fetchRecentRuns = async () => {
    try {
      return fid !== null
        ? await sql`
            SELECT id, run_type, status, execution_mode, progress_stage, progress_detail, progress_pct, error_message,
                   workspace_id, folder_id, cluster_id, seed_queries, surfaces_used, cookie_mode,
                   candidates_discovered, candidates_qualified,
                   golden_pins_count, rookie_creators_count, auto_watchlisted_count, auto_promoted_count,
                   snowball_hops_executed, shards_total, shards_completed, shards_failed,
                   github_run_id, github_run_url, cancel_requested_at,
                   telemetry, started_at, completed_at
            FROM newborn_runs
            WHERE workspace_id = ${wid}
              AND folder_id = ${fid}
            ORDER BY started_at DESC
            LIMIT 12;
          `
        : await sql`
            SELECT id, run_type, status, execution_mode, progress_stage, progress_detail, progress_pct, error_message,
                   workspace_id, folder_id, cluster_id, seed_queries, surfaces_used, cookie_mode,
                   candidates_discovered, candidates_qualified,
                   golden_pins_count, rookie_creators_count, auto_watchlisted_count, auto_promoted_count,
                   snowball_hops_executed, shards_total, shards_completed, shards_failed,
                   github_run_id, github_run_url, cancel_requested_at,
                   telemetry, started_at, completed_at
            FROM newborn_runs
            WHERE workspace_id = ${wid}
            ORDER BY started_at DESC
            LIMIT 12;
          `;
    } catch (err) {
      if (String(err?.code || '') !== '42703') throw err;
      if (wid !== 1) return [];
      return fid !== null
        ? await sql`
            SELECT id, run_type, status, execution_mode, progress_stage, progress_detail, progress_pct, error_message,
                   folder_id, cluster_id, seed_queries, surfaces_used, cookie_mode,
                   candidates_discovered, candidates_qualified,
                   golden_pins_count, rookie_creators_count, auto_watchlisted_count, auto_promoted_count,
                   snowball_hops_executed, shards_total, shards_completed, shards_failed,
                   github_run_id, github_run_url, cancel_requested_at,
                   telemetry, started_at, completed_at
            FROM newborn_runs
            WHERE folder_id = ${fid}
            ORDER BY started_at DESC
            LIMIT 12;
          `
        : await sql`
            SELECT id, run_type, status, execution_mode, progress_stage, progress_detail, progress_pct, error_message,
                   folder_id, cluster_id, seed_queries, surfaces_used, cookie_mode,
                   candidates_discovered, candidates_qualified,
                   golden_pins_count, rookie_creators_count, auto_watchlisted_count, auto_promoted_count,
                   snowball_hops_executed, shards_total, shards_completed, shards_failed,
                   github_run_id, github_run_url, cancel_requested_at,
                   telemetry, started_at, completed_at
            FROM newborn_runs
            ORDER BY started_at DESC
            LIMIT 12;
          `;
    }
  };

  const wsCandidateFilter = fid !== null
    ? null
    : (wid === 1
        ? sql`(
            nc.folder_id IS NULL
            OR nc.folder_id IN (SELECT id FROM keyword_folders WHERE workspace_id = 1)
          ) AND (
            nc.first_run_id IS NULL
            OR nc.first_run_id IN (SELECT id FROM newborn_runs WHERE workspace_id = 1)
            OR EXISTS (
              SELECT 1 FROM newborn_run_candidates nrc_w1
              JOIN newborn_runs nr_w1 ON nr_w1.id = nrc_w1.run_id
              WHERE nrc_w1.pin_id = nc.pin_id AND nr_w1.workspace_id = 1
            )
          )`
        : sql`(
            nc.folder_id IN (SELECT id FROM keyword_folders WHERE workspace_id = ${wid})
            OR nc.first_run_id IN (SELECT id FROM newborn_runs WHERE workspace_id = ${wid})
            OR EXISTS (
              SELECT 1 FROM newborn_run_candidates nrc_ws
              JOIN newborn_runs nr_ws ON nr_ws.id = nrc_ws.run_id
              WHERE nrc_ws.pin_id = nc.pin_id AND nr_ws.workspace_id = ${wid}
            )
          )`);

  const statsPromise = fid !== null
    ? sql`
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
          (SELECT COUNT(*)::int FROM newborn_daily_anchors WHERE is_active = TRUE AND folder_id = ${fid}) AS active_daily_anchors_count,
          (SELECT COUNT(*)::int FROM newborn_rule_profiles WHERE is_active = TRUE) AS active_profiles_count
        FROM newborn_candidates
        WHERE folder_id = ${fid};
      `
    : wid !== 1
      ? sql`
          SELECT
            COUNT(*)::int AS total_candidates,
            COUNT(*) FILTER (WHERE nc.stage = 'discovered')::int AS discovered_count,
            COUNT(*) FILTER (WHERE nc.stage = 'watchlist')::int AS watchlist_count,
            COUNT(*) FILTER (WHERE nc.stage = 'promoted')::int AS promoted_count,
            COUNT(*) FILTER (WHERE nc.stage = 'discarded')::int AS discarded_count,
            COUNT(*) FILTER (WHERE nc.is_golden_pin = TRUE AND nc.stage <> 'discarded')::int AS golden_pins_count,
            COUNT(*) FILTER (WHERE nc.is_linkless = TRUE AND nc.stage <> 'discarded')::int AS linkless_vacuum_count,
            COUNT(*) FILTER (WHERE nc.is_rookie_outlier = TRUE AND nc.stage <> 'discarded')::int AS rookie_outliers_count,
            COALESCE(ROUND(AVG(nc.golden_score) FILTER (WHERE nc.stage <> 'discarded')::numeric, 2), 0)::double precision AS avg_golden_score,
            (
              SELECT COUNT(*)::int FROM newborn_rookie_accounts nra
              WHERE nra.stage <> 'discarded'
                AND (
                  EXISTS (
                    SELECT 1 FROM newborn_run_candidates nrc_r
                    JOIN newborn_runs nr_r ON nr_r.id = nrc_r.run_id
                    JOIN newborn_candidates nc_r ON nc_r.pin_id = nrc_r.pin_id
                    WHERE nr_r.workspace_id = ${wid} AND LOWER(COALESCE(nc_r.effective_creator_username, '')) = LOWER(nra.username)
                  )
                  OR EXISTS (
                    SELECT 1 FROM newborn_candidates nc_r2
                    JOIN keyword_folders kf_r ON kf_r.id = nc_r2.folder_id
                    WHERE kf_r.workspace_id = ${wid} AND LOWER(COALESCE(nc_r2.effective_creator_username, '')) = LOWER(nra.username)
                  )
                )
            ) AS rookie_accounts_count,
            (
              SELECT COUNT(*)::int FROM newborn_rookie_accounts nra
              WHERE nra.stage = 'watchlist'
                AND EXISTS (
                  SELECT 1 FROM newborn_run_candidates nrc_r
                  JOIN newborn_runs nr_r ON nr_r.id = nrc_r.run_id
                  JOIN newborn_candidates nc_r ON nc_r.pin_id = nrc_r.pin_id
                  WHERE nr_r.workspace_id = ${wid} AND LOWER(COALESCE(nc_r.effective_creator_username, '')) = LOWER(nra.username)
                )
            ) AS rookie_watchlist_count,
            (
              SELECT COUNT(*)::int FROM newborn_rookie_accounts nra
              WHERE nra.stage = 'promoted'
                AND EXISTS (
                  SELECT 1 FROM newborn_run_candidates nrc_r
                  JOIN newborn_runs nr_r ON nr_r.id = nrc_r.run_id
                  JOIN newborn_candidates nc_r ON nc_r.pin_id = nrc_r.pin_id
                  WHERE nr_r.workspace_id = ${wid} AND LOWER(COALESCE(nc_r.effective_creator_username, '')) = LOWER(nra.username)
                )
            ) AS rookie_promoted_count,
            (
              SELECT COUNT(*)::int
              FROM newborn_daily_anchors nda
              WHERE nda.is_active = TRUE
                AND nda.folder_id IN (SELECT id FROM keyword_folders WHERE workspace_id = ${wid})
            ) AS active_daily_anchors_count,
            (SELECT COUNT(*)::int FROM newborn_rule_profiles WHERE is_active = TRUE) AS active_profiles_count
          FROM newborn_candidates nc
          WHERE ${wsCandidateFilter};
        `
      : sql`
          SELECT
            COUNT(*)::int AS total_candidates,
            COUNT(*) FILTER (WHERE nc.stage = 'discovered')::int AS discovered_count,
            COUNT(*) FILTER (WHERE nc.stage = 'watchlist')::int AS watchlist_count,
            COUNT(*) FILTER (WHERE nc.stage = 'promoted')::int AS promoted_count,
            COUNT(*) FILTER (WHERE nc.stage = 'discarded')::int AS discarded_count,
            COUNT(*) FILTER (WHERE nc.is_golden_pin = TRUE AND nc.stage <> 'discarded')::int AS golden_pins_count,
            COUNT(*) FILTER (WHERE nc.is_linkless = TRUE AND nc.stage <> 'discarded')::int AS linkless_vacuum_count,
            COUNT(*) FILTER (WHERE nc.is_rookie_outlier = TRUE AND nc.stage <> 'discarded')::int AS rookie_outliers_count,
            COALESCE(ROUND(AVG(nc.golden_score) FILTER (WHERE nc.stage <> 'discarded')::numeric, 2), 0)::double precision AS avg_golden_score,
            (SELECT COUNT(*)::int FROM newborn_rookie_accounts WHERE stage <> 'discarded') AS rookie_accounts_count,
            (SELECT COUNT(*)::int FROM newborn_rookie_accounts WHERE stage = 'watchlist') AS rookie_watchlist_count,
            (SELECT COUNT(*)::int FROM newborn_rookie_accounts WHERE stage = 'promoted') AS rookie_promoted_count,
            (SELECT COUNT(*)::int FROM newborn_daily_anchors WHERE is_active = TRUE) AS active_daily_anchors_count,
            (SELECT COUNT(*)::int FROM newborn_rule_profiles WHERE is_active = TRUE) AS active_profiles_count
          FROM newborn_candidates nc
          WHERE ${wsCandidateFilter};
        `;

  const topCandidatesPromise = fid !== null
    ? sql`
        SELECT pin_id, title, board_name, is_golden_pin, is_linkless, golden_score, repin_count, save_count, repin_per_day, visual_annotations
        FROM newborn_candidates
        WHERE folder_id = ${fid}
          AND stage IN ('discovered', 'watchlist', 'promoted')
        ORDER BY repin_count DESC NULLS LAST, golden_score DESC, first_seen_at DESC
        LIMIT 100;
      `
    : sql`
        SELECT nc.pin_id, nc.title, nc.board_name, nc.is_golden_pin, nc.is_linkless, nc.golden_score, nc.repin_count, nc.save_count, nc.repin_per_day, nc.visual_annotations
        FROM newborn_candidates nc
        WHERE nc.stage IN ('discovered', 'watchlist', 'promoted')
          AND ${wsCandidateFilter}
        ORDER BY nc.repin_count DESC NULLS LAST, nc.golden_score DESC, nc.first_seen_at DESC
        LIMIT 100;
      `;

  const [settings, cookieStatus, statsRows, recentRuns, topCandidates] = await Promise.all([
    getNewbornSettings(sql),
    getNewbornCookieStatus(sql, env, { workspaceId: wid }),
    statsPromise,
    fetchRecentRuns(),
    topCandidatesPromise
  ]);

  const counts = statsRows?.[0] || {};
  const schedule = evaluateAutomationSchedule(settings);
  const crossoverHighlights = buildNewbornCrossoverMatrix(topCandidates || [], { limit: 10 });

  return {
    success: true,
    folder_id: fid,
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
 * Queries staged `newborn_candidates` with strict optional `run_id` isolation (`newborn_run_candidates`),
 * wildcard-escaped search, multi-facet filters, and deterministic sorting.
 */
export async function listNewbornCandidates(sql, filters = {}) {
  const stage = filters.stage && ['discovered', 'watchlist', 'promoted', 'discarded'].includes(String(filters.stage).toLowerCase())
    ? String(filters.stage).toLowerCase()
    : null;
  const wid = parseOptionalPositiveInt(filters.workspace_id ?? filters.workspaceId) || 1;
  const runId = parseOptionalPositiveInt(filters.run_id);
  const folderId = parseOptionalPositiveInt(filters.folder_id);
  const surface = filters.surface ? String(filters.surface).trim().toLowerCase() : null;
  const provenance = filters.provenance ? String(filters.provenance).trim().toUpperCase() : null;
  const creationMethod = filters.creation_method ? String(filters.creation_method).trim().toLowerCase() : null;
  const rawRepinFilter = filters.repin_filter ? String(filters.repin_filter).trim().toLowerCase() : '';
  const repinFilter = rawRepinFilter === 'original' ? false : (rawRepinFilter === 'repin' ? true : null);
  const goldenOnly = filters.golden_only === true || filters.golden_only === 'true';
  const rookieOnly = filters.rookie_only === true || filters.rookie_only === 'true';
  const linkFilter = normalizeLinkFilter(filters.link_filter ?? filters.linkFilter, filters.linkless_only ?? filters.linkless);
  const qualifiedOnly = filters.qualified_only === true || filters.qualified_only === 'true';
  const minGoldenScore = filters.min_golden_score != null && filters.min_golden_score !== ''
    ? Number(filters.min_golden_score)
    : null;
  const minRepins = filters.min_repins != null && filters.min_repins !== ''
    ? Number(filters.min_repins)
    : null;
  const maxAgeDays = filters.max_age_days != null && filters.max_age_days !== ''
    ? Number(filters.max_age_days)
    : null;
  const cleanAnnotation = filters.annotation
    ? decodeHtmlEntities(String(filters.annotation)).trim().toLowerCase() || null
    : null;

  const rawSearch = String(filters.search || filters.q || '').trim().toLowerCase();
  const searchPattern = rawSearch ? `%${escapeSqlWildcards(rawSearch)}%` : null;

  const sort = String(filters.sort || 'repins').trim().toLowerCase();
  const limit = Math.min(500, Math.max(1, Number(filters.limit) || 50));
  const offset = Math.max(0, Number(filters.offset) || 0);

  const wsScopeCond = wid === 1
    ? sql`(
        (nc.folder_id IS NULL OR nc.folder_id IN (SELECT id FROM keyword_folders WHERE workspace_id = 1))
        AND (
          nc.first_run_id IS NULL
          OR nc.first_run_id IN (SELECT id FROM newborn_runs WHERE workspace_id = 1)
          OR EXISTS (
            SELECT 1 FROM newborn_run_candidates nrc_w1
            JOIN newborn_runs nr_w1 ON nr_w1.id = nrc_w1.run_id
            WHERE nrc_w1.pin_id = nc.pin_id AND nr_w1.workspace_id = 1
          )
        )
      )`
    : sql`(
        nc.folder_id IN (SELECT id FROM keyword_folders WHERE workspace_id = ${wid})
        OR nc.first_run_id IN (SELECT id FROM newborn_runs WHERE workspace_id = ${wid})
        OR EXISTS (
          SELECT 1 FROM newborn_run_candidates nrc_ws
          JOIN newborn_runs nr_ws ON nr_ws.id = nrc_ws.run_id
          WHERE nrc_ws.pin_id = nc.pin_id AND nr_ws.workspace_id = ${wid}
        )
      )`;

  const runListQueries = async (includeRunSurfaces, useAnnotationGinFn = true) => {
    const surfaceCond = runId !== null
      ? (includeRunSurfaces
          ? sql`(${surface}::text IS NULL OR nrc.surface = ${surface} OR COALESCE(nrc.surfaces, '[]'::jsonb) ? ${surface || ''} OR nc.first_surface = ${surface} OR nc.discovered_surfaces ? ${surface || ''})`
          : sql`(${surface}::text IS NULL OR nrc.surface = ${surface} OR nc.first_surface = ${surface} OR nc.discovered_surfaces ? ${surface || ''})`)
      : sql`(${surface}::text IS NULL OR nc.first_surface = ${surface} OR nc.discovered_surfaces ? ${surface || ''})`;

    const annotationCond = cleanAnnotation === null
      ? sql`TRUE`
      : useAnnotationGinFn
        ? sql`public.pae_extract_annotation_tags(nc.visual_annotations) @> ARRAY[${cleanAnnotation}]::text[]`
        : sql`EXISTS (
            SELECT 1
            FROM jsonb_array_elements(COALESCE(nc.visual_annotations, '[]'::jsonb)) AS elem
            WHERE (
              CASE
                WHEN jsonb_typeof(elem) = 'object' THEN LOWER(COALESCE(elem->>'name', ''))
                ELSE LOWER(elem #>> '{}')
              END
            ) = ${cleanAnnotation}
          )`;

    const whereCond = sql`
      (${stage}::text IS NULL OR nc.stage = ${stage})
      AND (${stage !== null}::boolean = TRUE OR nc.stage <> 'discarded')
      AND (${folderId}::int IS NULL OR nc.folder_id = ${folderId})
      AND ${wsScopeCond}
      AND (${qualifiedOnly}::boolean = FALSE OR nc.qualified = TRUE)
      AND ${surfaceCond}
      AND (${provenance}::text IS NULL OR nc.upload_provenance = ${provenance})
      AND (${creationMethod}::text IS NULL OR LOWER(COALESCE(nc.raw_creation_method, '')) = ${creationMethod})
      AND (${repinFilter}::boolean IS NULL OR nc.is_repin = ${repinFilter})
      AND (${goldenOnly}::boolean = FALSE OR nc.is_golden_pin = TRUE)
      AND (${rookieOnly}::boolean = FALSE OR nc.is_rookie_outlier = TRUE)
      AND (
        ${linkFilter}::text = 'all'
        OR (${linkFilter}::text = 'linkless' AND nc.is_linkless = TRUE)
        OR (${linkFilter}::text = 'linked' AND nc.is_linkless = FALSE)
      )
      AND (${minGoldenScore}::double precision IS NULL OR nc.golden_score >= ${minGoldenScore})
      AND (${minRepins}::double precision IS NULL OR nc.repin_count >= ${minRepins})
      AND (${maxAgeDays}::double precision IS NULL OR nc.age_days <= ${maxAgeDays})
      AND ${annotationCond}
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

    const runJoin = runId !== null
      ? sql`JOIN newborn_run_candidates nrc ON nrc.pin_id = nc.pin_id AND nrc.run_id = ${runId}`
      : sql``;
    const selectCols = runId !== null
      ? (includeRunSurfaces
          ? sql`nc.*, COALESCE(nrc.matched_queries, '[]'::jsonb) AS run_matched_queries, nrc.surface AS run_surface, COALESCE(nrc.surfaces, '[]'::jsonb) AS run_surfaces`
          : sql`nc.*, COALESCE(nrc.matched_queries, '[]'::jsonb) AS run_matched_queries, nrc.surface AS run_surface`)
      : sql`nc.*`;

    return await Promise.all([
      sort === 'cluster_hits' || sort === 'cluster_overlap'
        ? (runId !== null
            ? sql`
                SELECT ${selectCols} FROM newborn_candidates nc ${runJoin}
                WHERE ${whereCond}
                ORDER BY jsonb_array_length(COALESCE(nrc.matched_queries, '[]'::jsonb)) DESC, nc.repin_count DESC NULLS LAST, nc.age_days ASC NULLS LAST, nc.pin_id ASC
                LIMIT ${limit} OFFSET ${offset};
              `
            : sql`
                SELECT ${selectCols} FROM newborn_candidates nc ${runJoin}
                WHERE ${whereCond}
                ORDER BY nc.repin_count DESC NULLS LAST, nc.age_days ASC NULLS LAST, nc.pin_id ASC
                LIMIT ${limit} OFFSET ${offset};
              `)
        : sort === 'repin_velocity' || sort === 'repin_per_day'
        ? sql`
            SELECT ${selectCols} FROM newborn_candidates nc ${runJoin}
            WHERE ${whereCond}
            ORDER BY nc.repin_per_day DESC NULLS LAST, nc.save_per_day DESC NULLS LAST, nc.golden_score DESC, nc.pin_id ASC
            LIMIT ${limit} OFFSET ${offset};
          `
        : sort === 'save_velocity' || sort === 'save_per_day'
        ? sql`
            SELECT ${selectCols} FROM newborn_candidates nc ${runJoin}
            WHERE ${whereCond}
            ORDER BY nc.save_per_day DESC NULLS LAST, nc.golden_score DESC, nc.pin_id ASC
            LIMIT ${limit} OFFSET ${offset};
          `
        : sort === 'saves' || sort === 'save_count'
        ? sql`
            SELECT ${selectCols} FROM newborn_candidates nc ${runJoin}
            WHERE ${whereCond}
            ORDER BY nc.save_count DESC NULLS LAST, nc.golden_score DESC, nc.pin_id ASC
            LIMIT ${limit} OFFSET ${offset};
          `
        : sort === 'repins' || sort === 'repin_count'
        ? sql`
            SELECT ${selectCols} FROM newborn_candidates nc ${runJoin}
            WHERE ${whereCond}
            ORDER BY nc.repin_count DESC NULLS LAST, nc.repin_per_day DESC NULLS LAST, nc.age_days ASC NULLS LAST, nc.pin_id ASC
            LIMIT ${limit} OFFSET ${offset};
          `
        : sort === 'fresh' || sort === 'age_days'
        ? sql`
            SELECT ${selectCols} FROM newborn_candidates nc ${runJoin}
            WHERE ${whereCond}
            ORDER BY nc.age_days ASC NULLS LAST, nc.repin_count DESC NULLS LAST, nc.pin_id ASC
            LIMIT ${limit} OFFSET ${offset};
          `
        : sort === 'recent'
        ? sql`
            SELECT ${selectCols} FROM newborn_candidates nc ${runJoin}
            WHERE ${whereCond}
            ORDER BY nc.first_seen_at DESC, nc.pin_id ASC
            LIMIT ${limit} OFFSET ${offset};
          `
        : sort === 'shares' || sort === 'share_count'
        ? sql`
            SELECT ${selectCols} FROM newborn_candidates nc ${runJoin}
            WHERE ${whereCond}
            ORDER BY nc.share_count DESC NULLS LAST, nc.repin_count DESC NULLS LAST, nc.pin_id ASC
            LIMIT ${limit} OFFSET ${offset};
          `
        : sort === 'golden_score'
        ? sql`
            SELECT ${selectCols} FROM newborn_candidates nc ${runJoin}
            WHERE ${whereCond}
            ORDER BY nc.golden_score DESC, nc.repin_count DESC NULLS LAST, nc.pin_id ASC
            LIMIT ${limit} OFFSET ${offset};
          `
        : sql`
            SELECT ${selectCols} FROM newborn_candidates nc ${runJoin}
            WHERE ${whereCond}
            ORDER BY nc.repin_count DESC NULLS LAST, nc.repin_per_day DESC NULLS LAST, nc.age_days ASC NULLS LAST, nc.pin_id ASC
            LIMIT ${limit} OFFSET ${offset};
          `,
      sql`
        SELECT COUNT(*)::int AS total
        FROM newborn_candidates nc ${runJoin}
        WHERE ${whereCond};
      `
    ]);
  };

  let rows;
  let countRows;
  try {
    [rows, countRows] = await runListQueries(true, true);
  } catch (err) {
    const code = String(err?.code || '');
    if (code === '42883' && cleanAnnotation !== null) {
      try {
        [rows, countRows] = await runListQueries(true, false);
      } catch (innerErr) {
        if (String(innerErr?.code || '') !== '42703' || runId === null) throw innerErr;
        [rows, countRows] = await runListQueries(false, false);
      }
    } else if (code === '42703' && runId !== null) {
      [rows, countRows] = await runListQueries(false, true);
    } else {
      throw err;
    }
  }

  const enrichBoardMeta = (row) => {
    if (!row || typeof row !== 'object') return row;
    const meta = (row.metadata && typeof row.metadata === 'object') ? row.metadata : {};
    const matchedQueries = Array.isArray(row.run_matched_queries) && row.run_matched_queries.length > 0
      ? row.run_matched_queries
      : (Array.isArray(row.matched_queries) && row.matched_queries.length > 0
          ? row.matched_queries
          : (row.seed_query ? [String(row.seed_query).trim().toLowerCase()] : []));
    const runSurface = row.run_surface && String(row.run_surface).toLowerCase() !== 'pin_resource' ? row.run_surface : null;
    const rawRunSurfaces = Array.isArray(row.run_surfaces) ? row.run_surfaces : [];
    const rawDiscoveredSurfaces = Array.isArray(row.discovered_surfaces) ? row.discovered_surfaces : [];
    const cleanSurfaces = Array.from(new Set([
      ...rawRunSurfaces,
      ...rawDiscoveredSurfaces,
      ...(runSurface ? [runSurface] : []),
      ...(row.first_surface ? [row.first_surface] : [])
    ].map((s) => String(s || '').trim()).filter((s) => s && s.toLowerCase() !== 'pin_resource')));
    const discoveryBoardName = row.discovery_board_name != null ? decodeHtmlEntities(row.discovery_board_name) : null;
    const discoveryBoardUrl = formatPinterestBoardUrl(row.discovery_board_url || '');
    const pinBoardName = row.pin_board_name != null ? decodeHtmlEntities(row.pin_board_name) : null;
    const pinBoardUrl = formatPinterestBoardUrl(row.pin_board_url || '');

    return {
      ...row,
      title: row.title != null ? decodeHtmlEntities(row.title) : row.title,
      description: row.description != null ? decodeHtmlEntities(row.description) : row.description,
      board_name: row.board_name != null ? decodeHtmlEntities(row.board_name) : row.board_name,
      discovery_board_name: discoveryBoardName,
      discovery_board_url: discoveryBoardUrl,
      pin_board_name: pinBoardName,
      pin_board_url: pinBoardUrl,
      pinner_full_name: row.pinner_full_name != null ? decodeHtmlEntities(row.pinner_full_name) : row.pinner_full_name,
      origin_creator_full_name: row.origin_creator_full_name != null ? decodeHtmlEntities(row.origin_creator_full_name) : row.origin_creator_full_name,
      visual_annotations: Array.isArray(row.visual_annotations) ? decodeCandidateAnnotations(row.visual_annotations) : row.visual_annotations,
      discovered_surfaces: cleanSurfaces,
      run_surfaces: rawRunSurfaces.filter((s) => s && String(s).toLowerCase() !== 'pin_resource'),
      run_surface: runSurface,
      effective_surface: runSurface || cleanSurfaces[0] || row.first_surface || null,
      matched_queries: matchedQueries,
      cluster_hit_count: matchedQueries.length,
      board_url: formatPinterestBoardUrl(row.board_url || ''),
      board_pin_count: row.board_pin_count ?? meta.board_pin_count ?? null,
      board_follower_count: row.board_follower_count ?? meta.board_follower_count ?? null
    };
  };

  return {
    total: Number(countRows?.[0]?.total || 0),
    limit,
    offset,
    run_id: runId,
    candidates: (rows || []).map(enrichBoardMeta)
  };
}

/**
 * Pure read-only dossier for a single Newborn candidate pin, combining staging snapshots
 * and SSOT `pins_daily_metrics` + `newborn_daily_anchors` if promoted.
 */
export async function getNewbornCandidateDossier(sql, pinId, { workspaceId = 1 } = {}) {
  const cleanId = String(pinId || '').trim();
  if (!isValidPinId(cleanId)) return null;
  const wid = parseOptionalPositiveInt(workspaceId) || 1;

  const [candRows, snapRows, anchorRows, ssotMetrics] = await Promise.all([
    wid !== 1
      ? sql`
          SELECT * FROM newborn_candidates
          WHERE pin_id = ${cleanId}
            AND (
              folder_id IN (SELECT id FROM keyword_folders WHERE workspace_id = ${wid})
              OR first_run_id IN (SELECT id FROM newborn_runs WHERE workspace_id = ${wid})
              OR EXISTS (
                SELECT 1 FROM newborn_run_candidates nrc_ws
                JOIN newborn_runs nr_ws ON nr_ws.id = nrc_ws.run_id
                WHERE nrc_ws.pin_id = newborn_candidates.pin_id AND nr_ws.workspace_id = ${wid}
              )
            )
          LIMIT 1;
        `
      : sql`SELECT * FROM newborn_candidates WHERE pin_id = ${cleanId} LIMIT 1;`,
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
  const cleanSurfaces = Array.from(new Set([
    ...(Array.isArray(rawCand.discovered_surfaces) ? rawCand.discovered_surfaces : []),
    ...(rawCand.first_surface ? [rawCand.first_surface] : [])
  ].map((s) => String(s || '').trim()).filter((s) => s && s.toLowerCase() !== 'pin_resource')));

  return {
    candidate: {
      ...rawCand,
      title: rawCand.title != null ? decodeHtmlEntities(rawCand.title) : rawCand.title,
      description: rawCand.description != null ? decodeHtmlEntities(rawCand.description) : rawCand.description,
      board_name: rawCand.board_name != null ? decodeHtmlEntities(rawCand.board_name) : rawCand.board_name,
      discovery_board_name: rawCand.discovery_board_name != null ? decodeHtmlEntities(rawCand.discovery_board_name) : null,
      discovery_board_url: formatPinterestBoardUrl(rawCand.discovery_board_url || ''),
      pin_board_name: rawCand.pin_board_name != null ? decodeHtmlEntities(rawCand.pin_board_name) : null,
      pin_board_url: formatPinterestBoardUrl(rawCand.pin_board_url || ''),
      discovered_surfaces: cleanSurfaces,
      pinner_full_name: rawCand.pinner_full_name != null ? decodeHtmlEntities(rawCand.pinner_full_name) : rawCand.pinner_full_name,
      origin_creator_full_name: rawCand.origin_creator_full_name != null ? decodeHtmlEntities(rawCand.origin_creator_full_name) : rawCand.origin_creator_full_name,
      visual_annotations: Array.isArray(rawCand.visual_annotations) ? decodeCandidateAnnotations(rawCand.visual_annotations) : rawCand.visual_annotations,
      board_url: formatPinterestBoardUrl(rawCand.board_url || ''),
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
export async function updateNewbornCandidateStage(sql, pinIds, nextStage, { workspaceId = 1 } = {}) {
  const validStages = new Set(['discovered', 'watchlist', 'discarded']);
  const cleanStage = String(nextStage || '').trim().toLowerCase();
  if (!validStages.has(cleanStage)) {
    const err = new Error(`Invalid stage "${nextStage}". Expected discovered, watchlist, or discarded.`);
    err.status = 400;
    throw err;
  }
  const wid = parseOptionalPositiveInt(workspaceId) || 1;

  const cleanIds = Array.from(new Set(
    (Array.isArray(pinIds) ? pinIds : [pinIds])
      .map((id) => String(id || '').trim())
      .filter(isValidPinId)
  )).sort((a, b) => a.localeCompare(b));
  if (cleanIds.length === 0) return { updated: 0, pin_ids: [] };

  const updated = wid !== 1
    ? await sql`
        UPDATE newborn_candidates
        SET
          stage = ${cleanStage},
          watchlist_added_at = CASE
            WHEN ${cleanStage} = 'watchlist' THEN COALESCE(watchlist_added_at, NOW())
            ELSE watchlist_added_at
          END,
          updated_at = NOW()
        WHERE pin_id = ANY(${cleanIds}::text[])
          AND (
            folder_id IN (SELECT id FROM keyword_folders WHERE workspace_id = ${wid})
            OR first_run_id IN (SELECT id FROM newborn_runs WHERE workspace_id = ${wid})
            OR EXISTS (
              SELECT 1 FROM newborn_run_candidates nrc_ws
              JOIN newborn_runs nr_ws ON nr_ws.id = nrc_ws.run_id
              WHERE nrc_ws.pin_id = newborn_candidates.pin_id AND nr_ws.workspace_id = ${wid}
            )
          )
        RETURNING pin_id, stage;
      `
    : await sql`
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
export async function deleteNewbornCandidate(sql, pinIds, { workspaceId = 1 } = {}) {
  const wid = parseOptionalPositiveInt(workspaceId) || 1;
  const cleanIds = Array.from(new Set(
    (Array.isArray(pinIds) ? pinIds : [pinIds])
      .map((id) => String(id || '').trim())
      .filter(isValidPinId)
  )).sort((a, b) => a.localeCompare(b));
  if (cleanIds.length === 0) return { deleted: 0 };

  const res = wid !== 1
    ? await sql`
        DELETE FROM newborn_candidates
        WHERE pin_id = ANY(${cleanIds}::text[])
          AND (
            folder_id IN (SELECT id FROM keyword_folders WHERE workspace_id = ${wid})
            OR first_run_id IN (SELECT id FROM newborn_runs WHERE workspace_id = ${wid})
            OR EXISTS (
              SELECT 1 FROM newborn_run_candidates nrc_ws
              JOIN newborn_runs nr_ws ON nr_ws.id = nrc_ws.run_id
              WHERE nrc_ws.pin_id = newborn_candidates.pin_id AND nr_ws.workspace_id = ${wid}
            )
          )
        RETURNING pin_id;
      `
    : await sql`
        DELETE FROM newborn_candidates
        WHERE pin_id = ANY(${cleanIds}::text[])
        RETURNING pin_id;
      `;
  await invalidateEdgeCache('newborn');
  return { deleted: Array.isArray(res) ? res.length : 0 };
}

/**
 * Lists Rookie / Rising Accounts from `newborn_rookie_accounts` (optionally scoped to `run_id`).
 */
export async function listNewbornRookies(sql, filters = {}) {
  const wid = parseOptionalPositiveInt(filters.workspace_id ?? filters.workspaceId) || 1;
  const stage = filters.stage && ['discovered', 'watchlist', 'promoted', 'discarded'].includes(String(filters.stage).toLowerCase())
    ? String(filters.stage).toLowerCase()
    : null;
  const runId = parseOptionalPositiveInt(filters.run_id);
  const rawSearch = String(filters.search || filters.q || '').trim().toLowerCase();
  const searchPattern = rawSearch ? `%${escapeSqlWildcards(rawSearch)}%` : null;
  const limit = Math.min(200, Math.max(1, Number(filters.limit) || 50));
  const offset = Math.max(0, Number(filters.offset) || 0);

  const whereCond = sql`
    (${stage}::text IS NULL OR nra.stage = ${stage})
    AND (${stage !== null}::boolean = TRUE OR nra.stage <> 'discarded')
    AND (
      ${wid}::int = 1
      OR EXISTS (
        SELECT 1
        FROM newborn_run_candidates nrc_ws
        JOIN newborn_runs nr_ws ON nr_ws.id = nrc_ws.run_id
        JOIN newborn_candidates nc_ws ON nc_ws.pin_id = nrc_ws.pin_id
        WHERE nr_ws.workspace_id = ${wid}
          AND LOWER(COALESCE(nc_ws.effective_creator_username, '')) = LOWER(nra.username)
      )
      OR EXISTS (
        SELECT 1
        FROM newborn_candidates nc_ws2
        JOIN keyword_folders kf_ws ON kf_ws.id = nc_ws2.folder_id
        WHERE kf_ws.workspace_id = ${wid}
          AND LOWER(COALESCE(nc_ws2.effective_creator_username, '')) = LOWER(nra.username)
      )
    )
    AND (
      ${runId}::bigint IS NULL
      OR EXISTS (
        SELECT 1
        FROM newborn_run_candidates nrc
        JOIN newborn_candidates nc ON nc.pin_id = nrc.pin_id
        WHERE nrc.run_id = ${runId}
          AND LOWER(COALESCE(nc.effective_creator_username, '')) = LOWER(nra.username)
      )
    )
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
    run_id: runId,
    rookies: rows || []
  };
}

/**
 * Lists recent execution runs from `newborn_runs`, scoped by active `workspaceId`.
 */
export async function listNewbornRuns(sql, { limit = 30, folderId = null, workspaceId = 1 } = {}) {
  const clamped = Math.min(100, Math.max(1, Number(limit) || 30));
  const numericFolderId = parseOptionalPositiveInt(folderId);
  const wid = parseOptionalPositiveInt(workspaceId) || 1;

  try {
    const rows = numericFolderId !== null
      ? await sql`
          SELECT *
          FROM newborn_runs
          WHERE workspace_id = ${wid} AND folder_id = ${numericFolderId}
          ORDER BY started_at DESC
          LIMIT ${clamped};
        `
      : await sql`
          SELECT *
          FROM newborn_runs
          WHERE workspace_id = ${wid}
          ORDER BY started_at DESC
          LIMIT ${clamped};
        `;
    return rows || [];
  } catch (err) {
    if (String(err?.code || '') !== '42703') throw err;
    if (wid !== 1) return [];
    const rows = numericFolderId !== null
      ? await sql`
          SELECT *
          FROM newborn_runs
          WHERE folder_id = ${numericFolderId}
          ORDER BY started_at DESC
          LIMIT ${clamped};
        `
      : await sql`
          SELECT *
          FROM newborn_runs
          ORDER BY started_at DESC
          LIMIT ${clamped};
        `;
    return rows || [];
  }
}

async function pruneOrphanCandidatesAfterRunDelete(tx, targetPinIds = []) {
  const cleanIds = Array.from(new Set(
    (Array.isArray(targetPinIds) ? targetPinIds : [])
      .map((id) => String(id || '').trim())
      .filter(Boolean)
  )).sort((a, b) => a.localeCompare(b));
  if (cleanIds.length === 0) return 0;

  try {
    const pruned = await tx`
      DELETE FROM newborn_candidates nc
      WHERE nc.pin_id = ANY(${cleanIds}::text[])
        AND nc.stage <> 'promoted'
        AND NOT EXISTS (
          SELECT 1 FROM newborn_run_candidates nrc WHERE nrc.pin_id = nc.pin_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM newborn_daily_anchors nda WHERE nda.pin_id = nc.pin_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM campaign_tracked_pins ctp WHERE ctp.pin_id = nc.pin_id AND ctp.is_active = TRUE
        )
      RETURNING nc.pin_id;
    `;
    return Array.isArray(pruned) ? pruned.length : 0;
  } catch (err) {
    if (String(err?.code || '') !== '42P01') throw err;
    const pruned = await tx`
      DELETE FROM newborn_candidates nc
      WHERE nc.pin_id = ANY(${cleanIds}::text[])
        AND nc.stage <> 'promoted'
        AND NOT EXISTS (
          SELECT 1 FROM newborn_run_candidates nrc WHERE nrc.pin_id = nc.pin_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM newborn_daily_anchors nda WHERE nda.pin_id = nc.pin_id
        )
      RETURNING nc.pin_id;
    `;
    return Array.isArray(pruned) ? pruned.length : 0;
  }
}

/**
 * Atomically deletes a single finished/failed/cancelled Past Hunt (`newborn_runs`)
 * and prunes any unpromoted/untracked orphan candidates exclusively tied to it.
 * Captures `target_pins` BEFORE `DELETE FROM newborn_runs` (before ON DELETE CASCADE clears links).
 */
export async function deleteNewbornRun(sql, runId, { workspaceId = 1 } = {}) {
  const numericRunId = parseOptionalPositiveInt(runId);
  const wid = parseOptionalPositiveInt(workspaceId) || 1;
  if (numericRunId === null) {
    return { ok: false, status: 400, error: 'BAD_REQUEST', message: 'Valid numeric run ID is required.' };
  }

  const runInTx = async (fn) => (typeof sql.begin === 'function' ? sql.begin(fn) : fn(sql));
  const result = await runInTx(async (tx) => {
    let runRows;
    try {
      runRows = await tx`
        SELECT id, status, workspace_id
        FROM newborn_runs
        WHERE id = ${numericRunId} AND workspace_id = ${wid}
        LIMIT 1;
      `;
    } catch (err) {
      if (String(err?.code || '') !== '42703') throw err;
      if (wid !== 1) return { ok: false, status: 404, error: 'NOT_FOUND', message: `Newborn run #${numericRunId} not found.` };
      runRows = await tx`
        SELECT id, status
        FROM newborn_runs
        WHERE id = ${numericRunId}
        LIMIT 1;
      `;
    }

    const run = runRows?.[0];
    if (!run) {
      return { ok: false, status: 404, error: 'NOT_FOUND', message: `Newborn run #${numericRunId} not found.` };
    }

    const st = String(run.status || '').toLowerCase();
    if (st === 'queued' || st === 'running' || st === 'cancelling') {
      return {
        ok: false,
        status: 409,
        error: 'RUN_ACTIVE',
        message: `Hunt #${numericRunId} is currently ${st}. Cancel it before deleting.`
      };
    }

    // Step 1: Capture target pin_ids BEFORE deleting from newborn_runs (prevents cascade blindspot)
    const linkedRows = await tx`
      SELECT pin_id FROM newborn_run_candidates WHERE run_id = ${numericRunId}
      UNION
      SELECT pin_id FROM newborn_candidates WHERE first_run_id = ${numericRunId};
    `;
    const targetPinIds = (linkedRows || []).map((r) => String(r.pin_id || '')).filter(Boolean);

    // Step 2: Delete the run (cascades newborn_run_candidates)
    await tx`
      DELETE FROM newborn_runs
      WHERE id = ${numericRunId}
      RETURNING id;
    `;

    // Step 3: Clean up unpromoted/untracked orphan candidates
    const orphansPruned = await pruneOrphanCandidatesAfterRunDelete(tx, targetPinIds);
    return {
      ok: true,
      deleted_run_id: numericRunId,
      orphans_pruned: orphansPruned
    };
  });

  if (result.ok) {
    await invalidateEdgeCache('newborn');
  }
  return result;
}

/**
 * Atomically deletes all failed, cancelled, or empty (0 winners / 0 linked pins) Past Hunts
 * inside the active workspace (optionally scoped to `folderId`) and prunes orphan candidates.
 */
export async function clearFailedAndEmptyNewbornRuns(sql, { workspaceId = 1, folderId = null } = {}) {
  const wid = parseOptionalPositiveInt(workspaceId) || 1;
  const fid = parseOptionalPositiveInt(folderId);
  const runInTx = async (fn) => (typeof sql.begin === 'function' ? sql.begin(fn) : fn(sql));

  const result = await runInTx(async (tx) => {
    let targetRuns;
    try {
      targetRuns = await tx`
        SELECT nr.id
        FROM newborn_runs nr
        WHERE nr.workspace_id = ${wid}
          AND (${fid}::int IS NULL OR nr.folder_id = ${fid})
          AND LOWER(COALESCE(nr.status, '')) NOT IN ('queued', 'running', 'cancelling')
          AND (
            LOWER(COALESCE(nr.status, '')) IN ('failed', 'cancelled', 'error')
            OR (
              COALESCE(nr.candidates_qualified, 0) = 0
              AND COALESCE(nr.golden_pins_count, 0) = 0
              AND NOT EXISTS (
                SELECT 1 FROM newborn_run_candidates nrc WHERE nrc.run_id = nr.id
              )
            )
          )
        ORDER BY nr.id ASC;
      `;
    } catch (err) {
      if (String(err?.code || '') !== '42703') throw err;
      if (wid !== 1) return { ok: true, deleted_runs: 0, deleted_run_ids: [], orphans_pruned: 0 };
      targetRuns = await tx`
        SELECT nr.id
        FROM newborn_runs nr
        WHERE (${fid}::int IS NULL OR nr.folder_id = ${fid})
          AND LOWER(COALESCE(nr.status, '')) NOT IN ('queued', 'running', 'cancelling')
          AND (
            LOWER(COALESCE(nr.status, '')) IN ('failed', 'cancelled', 'error')
            OR (
              COALESCE(nr.candidates_qualified, 0) = 0
              AND COALESCE(nr.golden_pins_count, 0) = 0
              AND NOT EXISTS (
                SELECT 1 FROM newborn_run_candidates nrc WHERE nrc.run_id = nr.id
              )
            )
          )
        ORDER BY nr.id ASC;
      `;
    }

    const runIds = (targetRuns || []).map((r) => Number(r.id)).filter((n) => Number.isInteger(n) && n > 0);
    if (runIds.length === 0) {
      return { ok: true, deleted_runs: 0, deleted_run_ids: [], orphans_pruned: 0 };
    }

    // Step 1: Capture target pin_ids BEFORE deleting runs
    const linkedRows = await tx`
      SELECT pin_id FROM newborn_run_candidates WHERE run_id = ANY(${runIds}::bigint[])
      UNION
      SELECT pin_id FROM newborn_candidates WHERE first_run_id = ANY(${runIds}::bigint[]);
    `;
    const targetPinIds = (linkedRows || []).map((r) => String(r.pin_id || '')).filter(Boolean);

    // Step 2: Delete runs atomically
    await tx`
      DELETE FROM newborn_runs
      WHERE id = ANY(${runIds}::bigint[])
      RETURNING id;
    `;

    // Step 3: Prune unpromoted/untracked orphans
    const orphansPruned = await pruneOrphanCandidatesAfterRunDelete(tx, targetPinIds);
    return {
      ok: true,
      deleted_runs: runIds.length,
      deleted_run_ids: runIds,
      orphans_pruned: orphansPruned
    };
  });

  if (result.deleted_runs > 0) {
    await invalidateEdgeCache('newborn');
  }
  return result;
}

/**
 * Lists standalone daily velocity crawler anchors (`newborn_daily_anchors`).
 */
export async function listNewbornDailyAnchors(sql, { workspaceId = 1, activeOnly = true, folderId = null, limit = 100, offset = 0 } = {}) {
  const wid = parseOptionalPositiveInt(workspaceId) || 1;
  const lim = Math.min(500, Math.max(1, Number(limit) || 100));
  const off = Math.max(0, Number(offset) || 0);
  const numericFolderId = parseOptionalPositiveInt(folderId);

  const rows = (numericFolderId === null && wid !== 1)
    ? await sql`
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
          AND nda.folder_id IN (SELECT id FROM keyword_folders WHERE workspace_id = ${wid})
        ORDER BY nda.promoted_at DESC, nda.pin_id ASC
        LIMIT ${lim} OFFSET ${off};
      `
    : await sql`
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
          AND (${numericFolderId}::int IS NULL OR nda.folder_id = ${numericFolderId})
        ORDER BY nda.promoted_at DESC, nda.pin_id ASC
        LIMIT ${lim} OFFSET ${off};
      `;
  return rows || [];
}

/**
 * Builds the Annotation + Board-Title Crossover matrix across staged Newborn candidates
 * (optionally strictly scoped to `runId` via `newborn_run_candidates`, `folderId`, and active table filters).
 */
export async function getNewbornCrossoverReport(
  sql,
  {
    workspaceId = 1,
    runId = null,
    folderId = null,
    stage = null,
    goldenOnly = false,
    linkFilter = null,
    linklessOnly = false,
    surface = null,
    creationMethod = null,
    repinFilter = null,
    search = null,
    limit = 30
  } = {}
) {
  const wid = parseOptionalPositiveInt(workspaceId) || 1;
  const cleanStage = stage && ['discovered', 'watchlist', 'promoted'].includes(String(stage).toLowerCase())
    ? String(stage).toLowerCase()
    : null;
  const numericRunId = parseOptionalPositiveInt(runId);
  const numericFolderId = parseOptionalPositiveInt(folderId);
  const resolvedLinkFilter = normalizeLinkFilter(linkFilter, linklessOnly);
  const cleanSurface = surface ? String(surface).trim().toLowerCase() : null;
  const cleanMethod = creationMethod ? String(creationMethod).trim().toLowerCase() : null;
  const rawRepin = repinFilter ? String(repinFilter).trim().toLowerCase() : '';
  const repinBool = rawRepin === 'original' ? false : (rawRepin === 'repin' ? true : null);
  const rawSearch = String(search || '').trim().toLowerCase();
  const searchPattern = rawSearch ? `%${escapeSqlWildcards(rawSearch)}%` : null;

  const extraFilterCond = sql`
    AND (
      ${resolvedLinkFilter}::text = 'all'
      OR (${resolvedLinkFilter}::text = 'linkless' AND nc.is_linkless = TRUE)
      OR (${resolvedLinkFilter}::text = 'linked' AND nc.is_linkless = FALSE)
    )
    AND (${cleanSurface}::text IS NULL OR nc.first_surface = ${cleanSurface} OR nc.discovered_surfaces ? ${cleanSurface || ''})
    AND (${cleanMethod}::text IS NULL OR LOWER(COALESCE(nc.raw_creation_method, '')) = ${cleanMethod})
    AND (${repinBool}::boolean IS NULL OR nc.is_repin = ${repinBool})
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

  const rows = numericRunId !== null
    ? await sql`
        SELECT nc.pin_id, nc.title, nc.board_name, nc.is_golden_pin, nc.is_linkless,
               nc.golden_score, nc.repin_count, nc.save_count, nc.repin_per_day, nc.save_per_day, nc.visual_annotations
        FROM newborn_run_candidates nrc
        JOIN newborn_candidates nc ON nc.pin_id = nrc.pin_id
        JOIN newborn_runs nr ON nr.id = nrc.run_id
        WHERE nrc.run_id = ${numericRunId}
          AND (${wid}::int = 1 OR nr.workspace_id = ${wid})
          AND (${numericFolderId}::int IS NULL OR nc.folder_id = ${numericFolderId})
          AND (${cleanStage}::text IS NULL OR nc.stage = ${cleanStage})
          AND nc.stage <> 'discarded'
          AND (${Boolean(goldenOnly)}::boolean = FALSE OR nc.is_golden_pin = TRUE)
          ${extraFilterCond}
        ORDER BY nc.repin_count DESC NULLS LAST, nc.golden_score DESC
        LIMIT 1000;
      `
    : (numericFolderId === null && wid !== 1)
      ? await sql`
          SELECT nc.pin_id, nc.title, nc.board_name, nc.is_golden_pin, nc.is_linkless,
                 nc.golden_score, nc.repin_count, nc.save_count, nc.repin_per_day, nc.save_per_day, nc.visual_annotations
          FROM newborn_candidates nc
          WHERE (
              nc.folder_id IN (SELECT id FROM keyword_folders WHERE workspace_id = ${wid})
              OR nc.first_run_id IN (SELECT id FROM newborn_runs WHERE workspace_id = ${wid})
              OR EXISTS (
                SELECT 1 FROM newborn_run_candidates nrc_ws
                JOIN newborn_runs nr_ws ON nr_ws.id = nrc_ws.run_id
                WHERE nrc_ws.pin_id = nc.pin_id AND nr_ws.workspace_id = ${wid}
              )
            )
            AND (${cleanStage}::text IS NULL OR nc.stage = ${cleanStage})
            AND nc.stage <> 'discarded'
            AND (${Boolean(goldenOnly)}::boolean = FALSE OR nc.is_golden_pin = TRUE)
            ${extraFilterCond}
          ORDER BY nc.repin_count DESC NULLS LAST, nc.golden_score DESC
          LIMIT 1000;
        `
      : await sql`
          SELECT nc.pin_id, nc.title, nc.board_name, nc.is_golden_pin, nc.is_linkless,
                 nc.golden_score, nc.repin_count, nc.save_count, nc.repin_per_day, nc.save_per_day, nc.visual_annotations
          FROM newborn_candidates nc
          WHERE (${numericFolderId}::int IS NULL OR nc.folder_id = ${numericFolderId})
            AND (${cleanStage}::text IS NULL OR nc.stage = ${cleanStage})
            AND nc.stage <> 'discarded'
            AND (${Boolean(goldenOnly)}::boolean = FALSE OR nc.is_golden_pin = TRUE)
            ${extraFilterCond}
          ORDER BY nc.repin_count DESC NULLS LAST, nc.golden_score DESC
          LIMIT 1000;
        `;

  return {
    run_id: numericRunId,
    folder_id: numericFolderId,
    analyzed_pins: (rows || []).length,
    clusters: buildNewbornCrossoverMatrix(rows || [], { limit })
  };
}
