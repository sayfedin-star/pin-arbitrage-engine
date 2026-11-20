/**
 * Creator Harvest, Intersections, Topic Clusters & Pin Archive Detail Service
 * Extracted from src/modules/creators/creator-analytics.mjs
 */

import { escapeSqlWildcards } from '../../utils.mjs';
import { fetchPinFromPinResource, fetchPinFromPinterest, sleep, randomJitterMs } from '../../core/pinterest/index.mjs';
import { fetchRelatedModulesWithZoneA } from '../newborn/cookie-router.mjs';
import { extractCreatorAndLinkMeta, upsertCandidateGraphEdges } from '../related-pins/graph-writer.mjs';
import { syncPinAcrossAllFourPillars, fetchPinTrajectory, fetchUniversalPinDossier } from '../pins/repository.mjs';
import { normalizePinterestUsername, syncCompetitorProfile, resolveNumericCompetitorId } from './competitors-crud.mjs';
import { syncCompetitorPins, reEvaluateCompetitorPins, reconcileQualifiedCatalogPins } from './creator-ingest.mjs';
import { syncCompetitorBoards } from './boards-service.mjs';

/**
 * Top Destination URLs Intelligence:
 * Aggregates pins by normalized article slug, stripping protocol, www, query params, anchors, and trailing slashes.
 * Supports filtering by articles only (is_product = false) vs products only vs all, and scope ('ecosystem' | 'official' | 'curators' | 'external').
 */
export async function getTopDestinationUrls(sql, competitorId, {
  limit = 50,
  page = 1,
  search = '',
  sort = 'saves_desc',
  filter_type = 'all',
  scope = 'ecosystem'
} = {}) {
  const numericId = await resolveNumericCompetitorId(sql, competitorId);
  if (!numericId || isNaN(numericId)) throw new Error('Valid competitorId is required.');

  // [INVARIANT: ONE-WAY-PROMOTION] Zero auto-hydration from archive.

  let primaryDomain = '';
  try {
    const [c] = await sql`SELECT website_url FROM competitor_profiles WHERE id = ${numericId} LIMIT 1;`;
    if (c?.website_url) {
      primaryDomain = c.website_url.toLowerCase().trim().replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '').replace(/^www\./, '');
      if (primaryDomain.includes('pinterest.') || primaryDomain.includes('pin.it')) primaryDomain = '';
    }
    if (!primaryDomain) {
      const [domRow] = await sql`
        SELECT COALESCE(ump.clean_domain, '') AS clean_dom
        FROM competitor_board_pins cbp
        JOIN universal_master_pins ump ON ump.pin_id = cbp.pin_id
        WHERE cbp.competitor_id = ${numericId}
          AND COALESCE(ump.clean_domain, '') <> ''
          AND ump.clean_domain NOT ILIKE '%pinterest.%'
          AND ump.clean_domain NOT ILIKE '%pin.it%'
          AND ump.clean_domain NOT ILIKE '%amazon.%'
          AND ump.clean_domain NOT ILIKE '%etsy.%'
        GROUP BY clean_dom
        ORDER BY COUNT(*) DESC, SUM(COALESCE(ump.save_count, 0)) DESC
        LIMIT 1;
      `;
      if (domRow?.clean_dom) primaryDomain = domRow.clean_dom;
    }
  } catch (_) {}

  const pLim = Math.max(1, Math.min(Number(limit) || 50, 200));
  const pNum = Math.max(1, Number(page) || 1);
  const offset = (pNum - 1) * pLim;
  const cleanSearch = (search && typeof search === 'string' && search.trim()) ? escapeSqlWildcards(search.toLowerCase().trim()) : null;
  const searchPattern = cleanSearch ? `%${cleanSearch}%` : null;
  const activeScope = (scope === 'official' || scope === 'curators' || scope === 'ecosystem' || scope === 'external') ? scope : 'ecosystem';

  // Double escaped for PostgreSQL template literals: \\1, \\., \\?
  const rows = await sql`
    WITH raw_pins AS (
      SELECT
        cbp.pin_id,
        CASE WHEN ${activeScope} = 'external' THEN 'external'::text ELSE 'official'::text END AS attribution_source,
        COALESCE(ump.destination_url, '') AS destination_url,
        COALESCE(ump.clean_domain, ump.domain, '') AS link_domain,
        COALESCE(ump.save_count, 0) AS save_count,
        COALESCE(ump.repin_count, 0) AS repin_count,
        ump.created_at_pinterest,
        COALESCE(ump.is_product, false) AS is_product
      FROM competitor_board_pins cbp
      JOIN universal_master_pins ump ON ump.pin_id = cbp.pin_id
      WHERE cbp.competitor_id = ${numericId}
        AND ${activeScope} <> 'curators'
        AND COALESCE(ump.destination_url, '') != ''
        AND COALESCE(ump.destination_url, '') NOT LIKE '%pinterest.com%'
        AND (
          ${primaryDomain} = ''
          OR (${activeScope} IN ('official', 'ecosystem') AND COALESCE(ump.clean_domain, '') = ${primaryDomain})
          OR (${activeScope} = 'external' AND COALESCE(ump.clean_domain, '') <> ${primaryDomain})
        )
      UNION ALL
      SELECT
        ump.pin_id,
        'curator'::text AS attribution_source,
        COALESCE(ump.destination_url, '') AS destination_url,
        COALESCE(ump.clean_domain, ump.domain, '') AS link_domain,
        COALESCE(ump.save_count, 0) AS save_count,
        COALESCE(ump.repin_count, 0) AS repin_count,
        ump.created_at_pinterest,
        COALESCE(ump.is_product, false) AS is_product
      FROM universal_master_pins ump
      WHERE ${primaryDomain} <> ''
        AND ${activeScope} IN ('ecosystem', 'curators')
        AND ump.clean_domain = ${primaryDomain}
        AND COALESCE(ump.destination_url, '') != ''
        AND COALESCE(ump.destination_url, '') NOT LIKE '%pinterest.com%'
        AND NOT EXISTS (
          SELECT 1 FROM competitor_board_pins cbp_ex
          WHERE cbp_ex.competitor_id = ${numericId} AND cbp_ex.pin_id = ump.pin_id
        )
    ),
    base AS (
      SELECT 
        REGEXP_REPLACE(
          LOWER(
            REGEXP_REPLACE(
              REGEXP_REPLACE(
                REGEXP_REPLACE(destination_url, 'https?://(www\\.)?[^/]+', ''),
                '\\?.*$', ''
              ),
              '#.*$', ''
            )
          ),
          '/+$', ''
        ) AS clean_slug,
        attribution_source,
        destination_url,
        link_domain,
        save_count,
        repin_count,
        created_at_pinterest,
        is_product
      FROM raw_pins
    ),
    aggregated AS (
      SELECT 
        clean_slug,
        MIN(destination_url) AS sample_url,
        MIN(link_domain) AS domain,
        COUNT(*)::int AS pin_count,
        COUNT(*) FILTER (WHERE attribution_source = 'official')::int AS official_pin_count,
        COUNT(*) FILTER (WHERE attribution_source = 'curator')::int AS curator_pin_count,
        SUM(COALESCE(save_count, 0))::bigint AS total_saves,
        ROUND(AVG(COALESCE(save_count, 0)))::int AS avg_saves,
        SUM(COALESCE(repin_count, 0))::bigint AS total_repins,
        MIN(created_at_pinterest) AS first_pin_date,
        MAX(created_at_pinterest) AS last_pin_date,
        BOOL_OR(COALESCE(is_product, false)) AS is_product,
        BOOL_OR(COALESCE(link_domain ILIKE '%amazon%' OR link_domain ILIKE '%amzn.to%' OR link_domain ILIKE '%etsy%' OR link_domain ILIKE '%shopify%' OR link_domain ILIKE '%rstyle%' OR link_domain ILIKE '%liketoknow%' OR link_domain ILIKE '%shopstyle%' OR link_domain ILIKE '%shareasale%' OR link_domain ILIKE '%rewardstyle%', false)) AS is_affiliate
      FROM base
      WHERE clean_slug IS NOT NULL AND clean_slug != '' AND clean_slug != '/'
      GROUP BY clean_slug
    )
    -- [INVARIANT: SARGABLE-INDEX-SEEKING] Single-pass window count eliminating duplicate CTE scan
    SELECT 
      *,
      COUNT(*) OVER()::int AS total_count
    FROM aggregated
    WHERE (${searchPattern}::text IS NULL OR clean_slug LIKE ${searchPattern} ESCAPE '\\')
      AND (
        ${filter_type} = 'all' OR
        (${filter_type} = 'articles_only' AND is_product = FALSE) OR
        (${filter_type} = 'products_only' AND is_product = TRUE) OR
        (${filter_type} = 'affiliate_only' AND is_affiliate = TRUE)
      )
    ORDER BY 
      CASE WHEN ${sort} = 'saves_desc' THEN total_saves END DESC NULLS LAST,
      CASE WHEN ${sort} = 'saves_asc' THEN total_saves END ASC NULLS LAST,
      CASE WHEN ${sort} = 'pins_desc' THEN pin_count END DESC NULLS LAST,
      CASE WHEN ${sort} = 'avg_saves_desc' THEN avg_saves END DESC NULLS LAST,
      CASE WHEN ${sort} = 'repins_desc' THEN total_repins END DESC NULLS LAST,
      CASE WHEN ${sort} = 'newest' THEN last_pin_date END DESC NULLS LAST,
      total_saves DESC
    LIMIT ${pLim} OFFSET ${offset};
  `;

  const total = rows.length > 0 ? (rows[0].total_count || 0) : 0;
  const total_pages = Math.ceil(total / pLim);

  return {
    urls: rows.map(r => ({
      clean_slug: r.clean_slug,
      sample_url: r.sample_url,
      domain: r.domain,
      pin_count: Number(r.pin_count || 0),
      official_pin_count: Number(r.official_pin_count || 0),
      curator_pin_count: Number(r.curator_pin_count || 0),
      total_saves: Number(r.total_saves || 0),
      avg_saves: Number(r.avg_saves || 0),
      total_repins: Number(r.total_repins || 0),
      first_pin_date: r.first_pin_date,
      last_pin_date: r.last_pin_date,
      is_product: Boolean(r.is_product),
      is_affiliate: Boolean(r.is_affiliate)
    })),
    total,
    primary_domain: primaryDomain || null,
    scope: activeScope,
    page: pNum,
    limit: pLim,
    total_pages
  };
}

/**
 * Calculate Multi-Seed Intersections, Account Retention Rate, and Traffic Leakage.
 * Strictly inner joins competitor_seed_pins to prevent ghost/orphaned nodes from contaminating telemetry.
 */
export async function getCompetitorRelatedIntersections(sql, competitorId, options = {}) {
  const numericId = await resolveNumericCompetitorId(sql, competitorId);
  if (!numericId || isNaN(numericId)) throw new Error('Valid competitorId is required.');

  const rawMin = options.min_overlap ?? options.min_seed_overlap;
  const minOverlap = (rawMin !== undefined && rawMin !== null) ? Math.max(1, Number(rawMin)) : 2;
  const page = Math.max(1, Number(options.page) || 1);
  const limit = Math.min(Math.max(1, Number(options.limit) || 50), 200);
  const offset = (page - 1) * limit;
  const filter = options.filter || options.ownership_filter || 'all'; // 'all', 'self_only', 'rivals_only'
  const cleanSearch = (options.search && typeof options.search === 'string' && options.search.trim()) ? escapeSqlWildcards(options.search.toLowerCase().trim()) : null;
  const searchPattern = cleanSearch ? `%${cleanSearch}%` : null;

  // Execute stats, paginated rows, and total count concurrently over unified candidate_graph_nodes
  const [[statsRow], rows, [countRow]] = await Promise.all([
    // 1. Overall stats for this competitor's active seed graph (dynamic is_same_account)
    sql`
      SELECT 
        (SELECT COUNT(*)::int FROM competitor_seed_pins WHERE competitor_id = ${numericId}) AS total_seeds,
        COUNT(*)::int AS total_nodes,
        COUNT(DISTINCT cgn.candidate_pin_id)::int AS unique_candidates,
        COUNT(*) FILTER (
          WHERE BTRIM(COALESCE(cgn.creator_username, '')) <> ''
            AND LOWER(LTRIM(BTRIM(cgn.creator_username), '@')) = LOWER(LTRIM(BTRIM(COALESCE(cp.username, '')), '@'))
        )::int AS self_nodes,
        COUNT(*) FILTER (
          WHERE NOT (
            BTRIM(COALESCE(cgn.creator_username, '')) <> ''
            AND LOWER(LTRIM(BTRIM(cgn.creator_username), '@')) = LOWER(LTRIM(BTRIM(COALESCE(cp.username, '')), '@'))
          )
        )::int AS rival_nodes
      FROM competitor_seed_pins csp
      INNER JOIN competitor_profiles cp ON cp.id = csp.competitor_id
      INNER JOIN candidate_graph_nodes cgn ON cgn.seed_pin_id = csp.pin_id
      WHERE csp.competitor_id = ${numericId};
    `,
    // 2. Fetch intersections matching criteria
    sql`
      WITH scoped_edges AS (
        SELECT
          cgn.candidate_pin_id,
          cgn.seed_pin_id,
          cgn.title,
          cgn.image_url,
          cgn.dominant_color,
          cgn.saves,
          cgn.repins,
          cgn.domain,
          cgn.destination_url,
          cgn.creator_username,
          cgn.creator_name,
          cgn.provenance_engine,
          (
            BTRIM(COALESCE(cgn.creator_username, '')) <> ''
            AND LOWER(LTRIM(BTRIM(cgn.creator_username), '@')) = LOWER(LTRIM(BTRIM(COALESCE(cp.username, '')), '@'))
          ) AS is_same_account
        FROM competitor_seed_pins csp
        INNER JOIN competitor_profiles cp ON cp.id = csp.competitor_id
        INNER JOIN candidate_graph_nodes cgn ON cgn.seed_pin_id = csp.pin_id
        WHERE csp.competitor_id = ${numericId}
      )
      SELECT 
        se.candidate_pin_id,
        MAX(se.title) AS title,
        MAX(se.image_url) AS image_url,
        MAX(se.dominant_color) AS dominant_color,
        MAX(se.saves)::bigint AS saves,
        MAX(se.repins)::bigint AS repins,
        MAX(se.domain) AS domain,
        MAX(se.destination_url) AS destination_url,
        BOOL_OR(se.is_same_account) AS is_same_account,
        MAX(se.creator_username) AS creator_username,
        MAX(se.creator_name) AS creator_name,
        MAX(se.provenance_engine) AS provenance_engine,
        COUNT(DISTINCT se.seed_pin_id)::int AS seed_overlap_count,
        ARRAY_AGG(DISTINCT se.seed_pin_id) AS originating_seeds
      FROM scoped_edges se
      WHERE (${searchPattern}::text IS NULL OR LOWER(COALESCE(se.title, '')) LIKE ${searchPattern} ESCAPE '\\' OR LOWER(COALESCE(se.creator_username, '')) LIKE ${searchPattern} ESCAPE '\\')
        AND (
          ${filter} = 'all' OR
          (${filter} = 'self_only' AND se.is_same_account = TRUE) OR
          (${filter} = 'rivals_only' AND se.is_same_account = FALSE)
        )
      GROUP BY se.candidate_pin_id
      HAVING COUNT(DISTINCT se.seed_pin_id) >= ${minOverlap}
      ORDER BY seed_overlap_count DESC, saves DESC NULLS LAST
      LIMIT ${limit} OFFSET ${offset};
    `,
    // 3. Count matching intersections for accurate pagination
    sql`
      WITH scoped_edges AS (
        SELECT
          cgn.candidate_pin_id,
          cgn.seed_pin_id,
          cgn.title,
          cgn.creator_username,
          (
            BTRIM(COALESCE(cgn.creator_username, '')) <> ''
            AND LOWER(LTRIM(BTRIM(cgn.creator_username), '@')) = LOWER(LTRIM(BTRIM(COALESCE(cp.username, '')), '@'))
          ) AS is_same_account
        FROM competitor_seed_pins csp
        INNER JOIN competitor_profiles cp ON cp.id = csp.competitor_id
        INNER JOIN candidate_graph_nodes cgn ON cgn.seed_pin_id = csp.pin_id
        WHERE csp.competitor_id = ${numericId}
      )
      SELECT COUNT(*)::int AS total
      FROM (
        SELECT se.candidate_pin_id
        FROM scoped_edges se
        WHERE (${searchPattern}::text IS NULL OR LOWER(COALESCE(se.title, '')) LIKE ${searchPattern} ESCAPE '\\' OR LOWER(COALESCE(se.creator_username, '')) LIKE ${searchPattern} ESCAPE '\\')
          AND (
            ${filter} = 'all' OR
            (${filter} = 'self_only' AND se.is_same_account = TRUE) OR
            (${filter} = 'rivals_only' AND se.is_same_account = FALSE)
          )
        GROUP BY se.candidate_pin_id
        HAVING COUNT(DISTINCT se.seed_pin_id) >= ${minOverlap}
      ) sub;
    `
  ]);

  const totalNodes = Number(statsRow?.total_nodes || 0);
  const selfNodes = Number(statsRow?.self_nodes || 0);
  const rivalNodes = Number(statsRow?.rival_nodes || 0);
  const retentionRate = totalNodes > 0 ? Number(((selfNodes / totalNodes) * 100).toFixed(1)) : 0;
  const leakageRate = Number((100 - retentionRate).toFixed(1));

  const total = Number(countRow?.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return {
    intersections: rows.map(r => ({
      ...r,
      saves: Number(r.saves || 0),
      repins: Number(r.repins || 0),
      seed_overlap_count: Number(r.seed_overlap_count || 1)
    })),
    stats: {
      total_seeds: Number(statsRow?.total_seeds || 0),
      total_nodes: totalNodes,
      unique_candidates: Number(statsRow?.unique_candidates || 0),
      self_retention_nodes: selfNodes,
      rival_leakage_nodes: rivalNodes,
      retention_rate_pct: retentionRate,
      leakage_rate_pct: leakageRate,
      total_intersections: total
    },
    total,
    page,
    limit,
    total_pages: totalPages
  };
}

/**
 * Fast live harvest for a single pin (Zone-A Authenticated with graceful Zero-Cookie fallback, AbortSignal).
 * In-memory Map deduplication prevents PostgreSQL cardinality violations.
 * Monotonic sorting eliminates deadlocks.
 */
export async function harvestSinglePinRelatedLive(sql, competitorId, pinId, options = {}) {
  const numericId = await resolveNumericCompetitorId(sql, competitorId);
  if (!numericId || isNaN(numericId)) throw new Error('Valid competitorId is required.');
  const cleanPin = String(pinId || '').trim();
  if (!cleanPin) throw new Error('Valid pinId is required.');

  // Fetch competitor username and metadata concurrently
  const [[comp], [metaPin]] = await Promise.all([
    sql`SELECT id, username FROM competitor_profiles WHERE id = ${numericId} LIMIT 1;`,
    sql`
      SELECT ump.title, ump.image_url, ump.board_name, ump.save_count 
      FROM competitor_board_pins cbp 
      JOIN universal_master_pins ump ON ump.pin_id = cbp.pin_id 
      WHERE cbp.competitor_id = ${numericId} AND cbp.pin_id = ${cleanPin} 
      LIMIT 1;
    `
  ]);
  const targetUsername = comp ? comp.username : '';

  // Ensure seed pin row exists in competitor_seed_pins BEFORE inserting related child nodes
  const seedTitle = metaPin?.title || `Pin #${cleanPin}`;
  const seedImg = metaPin?.image_url || null;
  const seedBoard = metaPin?.board_name || null;
  const seedSaves = Number(metaPin?.save_count || 0);

  await sql`
    INSERT INTO universal_master_pins (pin_id, creator_username, first_discovered_pillar)
    VALUES (${cleanPin}, ${targetUsername || null}, 'creator')
    ON CONFLICT (pin_id) DO NOTHING;
  `;

  await sql`
    INSERT INTO competitor_seed_pins (competitor_id, pin_id, title, image_url, board_name, save_count, last_crawled_at)
    VALUES (${numericId}, ${cleanPin}, ${seedTitle}, ${seedImg}, ${seedBoard}, ${seedSaves}, NOW())
    ON CONFLICT (competitor_id, pin_id) DO UPDATE SET 
      title = CASE WHEN EXCLUDED.title <> '' AND EXCLUDED.title NOT LIKE 'Pin #%' THEN EXCLUDED.title ELSE competitor_seed_pins.title END,
      image_url = COALESCE(EXCLUDED.image_url, competitor_seed_pins.image_url),
      board_name = COALESCE(EXCLUDED.board_name, competitor_seed_pins.board_name),
      save_count = GREATEST(competitor_seed_pins.save_count, EXCLUDED.save_count),
      last_crawled_at = NOW();
  `;

  const optionsObj = {
    pin_id: cleanPin,
    additional_fields: ['pin.gen_ai_topics'],
    context_pin_ids: [],
    context_near_dup_image_sigs: [],
    homefeed_source_sig: null,
    page_size: 24,
    search_query: '',
    source: 'deep_linking',
    top_level_source: 'deep_linking',
    top_level_source_depth: 1,
    is_pdp: false,
    client_tracking_params: 'CwABAAAAEDE0ODExNTU0MzQxNjE4ODgLAAcAAAAPdW5rbm93bi91bmtub3duAA'
  };

  const dataParam = JSON.stringify({ options: optionsObj, context: {} });
  const url = `https://www.pinterest.com/resource/RelatedModulesResource/get/?source_url=${encodeURIComponent(`/pin/${cleanPin}/`)}&data=${encodeURIComponent(dataParam)}`;

  const zoneRes = await fetchRelatedModulesWithZoneA(url, {
    pinId: cleanPin,
    sql,
    env: options.env || null,
    rawCookie: options.rawCookie,
    fetchImpl: options.fetchImpl,
    timeoutMs: 8000
  });
  if (!zoneRes.ok || !zoneRes.data) {
    throw new Error(`Pinterest returned HTTP ${zoneRes.status}`);
  }

  const json = zoneRes.data;
  const resResponse = json?.resource_response || json;
  const items = resResponse?.data || [];

  const rawEdges = [];
  for (const item of items) {
    const isPin = item?.type === 'pin' || (item?.id && /^\d+$/.test(String(item.id)));
    if (!isPin) continue;

    const candId = String(item.id);
    if (candId === cleanPin) continue; // ignore self-reference

    const title = typeof item.title === 'string' ? item.title : (typeof item.grid_title === 'string' ? item.grid_title : '');
    const rawSaves = item.aggregated_pin_data?.aggregated_stats?.saves ?? item.aggregated_stats?.saves ?? item.save_count ?? null;
    const saves = (rawSaves !== null && rawSaves !== undefined && String(rawSaves).trim() !== '' && Number.isFinite(Number(rawSaves)))
      ? Math.max(0, Math.round(Number(rawSaves)))
      : null;
    const rawRepins = item.repin_count ?? item.repins ?? null;
    const repins = (rawRepins !== null && rawRepins !== undefined && String(rawRepins).trim() !== '' && Number.isFinite(Number(rawRepins)))
      ? Math.max(0, Math.round(Number(rawRepins)))
      : null;
    const meta = extractCreatorAndLinkMeta(item);
    const img = item.images?.['236x']?.url || item.images?.['736x']?.url || item.images?.orig?.url || '';
    const rawColor = typeof item.dominant_color === 'string' ? item.dominant_color.trim() : '';
    const dominantColor = (rawColor && rawColor.toLowerCase() !== '#888888') ? rawColor : null;

    rawEdges.push({
      seed_pin_id: cleanPin,
      candidate_pin_id: candId,
      title: title.slice(0, 500),
      image_url: img,
      dominant_color: dominantColor,
      saves,
      repins,
      domain: meta.domain,
      clean_domain: meta.clean_domain,
      destination_url: meta.destination_url,
      is_product: Boolean(item.is_product || item.commerce_product),
      creator_username: meta.creator_username,
      creator_name: meta.creator_name,
      provenance_engine: 'P2P_TWO_TOWER'
    });
  }

  let discoveredCount = 0;
  if (rawEdges.length > 0) {
    const { upsertedCount } = await upsertCandidateGraphEdges(sql, rawEdges, {
      mode: 'quick',
      chunkSize: 100,
      defaultSeedPinId: cleanPin
    });
    discoveredCount = upsertedCount;
  }

  return {
    ok: true,
    pin_id: cleanPin,
    discovered_count: discoveredCount,
    used_auth_cookie: Boolean(zoneRes.usedAuthCookie),
    used_guest_fallback: Boolean(zoneRes.usedGuestFallback)
  };
}

/**
 * Audit Sweep Now:
 * Executes a comprehensive audit and reconciliation sweep for a creator:
 * 1. Scrapes fresh unauthenticated profile metrics (reach, views, followers, total pins) and snapshots history.
 * 2. Syncs and heals all Pinterest boards in competitor_boards.
 * 3. Sweeps and resolves any monotonic dips (handled at Shard DB Storage level).
 * 4. Re-evaluates all discovered competitor pins against 3-tier rules to ingest newly qualified pins.
 * 5. Returns a detailed audit report.
 */
export async function auditSweepCompetitor(sql, competitorIdOrUsername, options = {}) {
  const numericId = await resolveNumericCompetitorId(sql, competitorIdOrUsername);
  let cleanUsername = null;
  if (numericId) {
    const [comp] = await sql`SELECT username FROM competitor_profiles WHERE id = ${numericId};`;
    cleanUsername = comp ? comp.username : null;
  } else {
    cleanUsername = normalizePinterestUsername(competitorIdOrUsername);
  }

  if (!cleanUsername) {
    return { ok: false, error: 'Valid competitor ID or username is required.' };
  }

  const auditReport = {
    competitor_id: numericId,
    username: cleanUsername,
    profile_updated: false,
    boards_synced: 0,
    monotonic_dips_healed: 0,
    newly_qualified_pins: 0,
    total_pins_inventory: 0,
    total_destination_urls: 0,
    audited_at: new Date().toISOString()
  };

  // 1. Scrape fresh unauthenticated profile and record snapshot
  try {
    const profileRes = await syncCompetitorProfile(sql, cleanUsername, options.cookie || '');
    if (profileRes?.ok) {
      auditReport.profile_updated = true;
      auditReport.profile = profileRes.profile;
    }
  } catch (err) {
    console.warn(`[auditSweep] syncCompetitorProfile notice:`, err.message);
  }

  // 2. Sync boards
  if (numericId) {
    try {
      const boardRes = await syncCompetitorBoards(sql, numericId, cleanUsername, options.cookie || '');
      auditReport.boards_synced = boardRes?.synced_boards_count || boardRes?.synced || 0;
    } catch (err) {
      console.warn(`[auditSweep] syncCompetitorBoards notice:`, err.message);
    }
  }

  // 3. Monotonic healing ratchet sweep (Snapshots are managed exclusively in pins_daily_metrics on Unified PostgreSQL)
  // [INVARIANT: ZERO-HUB-SNAPSHOTS]
  auditReport.monotonic_dips_healed = 0;

  // 4. Re-evaluate pins against 3-tier rules
  if (numericId) {
    try {
      const reEval = await reEvaluateCompetitorPins(sql, numericId);
      auditReport.newly_qualified_pins = reEval?.qualified_count || 0;
    } catch (err) {
      console.warn(`[auditSweep] reEvaluate notice:`, err.message);
    }

    // 5. Query inventory totals
    try {
      const [{ count: pinCount }] = await sql`
        SELECT COUNT(*)::int AS count FROM competitor_board_pins WHERE competitor_id = ${numericId};
      `;
      auditReport.total_pins_inventory = pinCount;

      const [{ count: urlCount }] = await sql`
        SELECT COUNT(DISTINCT ump.destination_url)::int AS count 
        FROM competitor_board_pins cbp
        JOIN universal_master_pins ump ON ump.pin_id = cbp.pin_id
        WHERE cbp.competitor_id = ${numericId} AND ump.destination_url IS NOT NULL AND ump.destination_url <> '' AND ump.destination_url NOT LIKE '%pinterest.com%';
      `;
      auditReport.total_destination_urls = urlCount;
    } catch (_) {}
  }

  return {
    ok: true,
    ...auditReport,
    message: `Audit sweep successfully completed for @${cleanUsername}: Profile refreshed, ${auditReport.boards_synced} boards synced, ${auditReport.total_pins_inventory} pins audited.`
  };
}

/**
 * ⚡ Quick Pulse (~3s):
 * High-speed parallel synchronization of creator profile & boards metadata.
 * Returns live impressions, total audience, and follower counts without crawling pins.
 */
export async function quickPulseCreator(sql, idOrUsername, cookie = '') {
  const numericId = await resolveNumericCompetitorId(sql, idOrUsername);
  let cleanUsername = null;
  if (numericId) {
    const [comp] = await sql`SELECT username FROM competitor_profiles WHERE id = ${numericId};`;
    cleanUsername = comp ? comp.username : null;
  } else {
    cleanUsername = normalizePinterestUsername(idOrUsername);
  }
  if (!cleanUsername) throw new Error('Valid creator username or ID is required.');

  const effectiveCookie = cookie || '';

  let activeId = numericId;
  const profilePromise = syncCompetitorProfile(sql, cleanUsername, effectiveCookie);
  const boardsPromise = activeId ? syncCompetitorBoards(sql, activeId, cleanUsername, effectiveCookie) : Promise.resolve(null);

  const [profileRes, initialBoardsRes] = await Promise.all([
    profilePromise,
    boardsPromise
  ]);

  let boardsRes = initialBoardsRes;
  if (!boardsRes) {
    activeId = profileRes?.id || (await resolveNumericCompetitorId(sql, cleanUsername));
    if (activeId) {
      boardsRes = await syncCompetitorBoards(sql, activeId, cleanUsername, effectiveCookie).catch(() => null);
    }
  }

  const [refreshed] = await sql`
    SELECT id, username, display_name, monthly_reach, profile_views, follower_count, following_count, total_pins, avatar_url, updated_at
    FROM competitor_profiles
    WHERE LOWER(username) = ${cleanUsername.toLowerCase()}
    LIMIT 1;
  `;

  return {
    ok: true,
    mode: 'quick-pulse',
    creator_id: refreshed?.id || activeId || numericId,
    username: cleanUsername,
    monthly_reach: Number(refreshed?.monthly_reach || 0),
    profile_views: Number(refreshed?.profile_views || 0),
    follower_count: Number(refreshed?.follower_count || 0),
    total_pins: Number(refreshed?.total_pins || 0),
    boards_synced: boardsRes?.synced_boards_count || boardsRes?.synced || 0,
    profile: refreshed,
    synced_at: new Date().toISOString()
  };
}

/**
 * 🌊 Deep Harvest (~30s):
 * Full profile + board sync, catalog sweep into 4-table SSOT,
 * qualification evaluation, and an in-process 4-worker pool
 * live metric refresh with deterministic shard snapshots on pins_daily_metrics.
 */
export async function deepHarvestCreator(sql, idOrUsername, { cookie = '', env = null, maxPinRefresh = 20 } = {}) {
  const pulse = await quickPulseCreator(sql, idOrUsername, cookie);
  const numericId = pulse.creator_id;
  const cleanUsername = pulse.username;

  let pinsSyncRes = null;
  if (numericId) {
    try {
      pinsSyncRes = await syncCompetitorPins(sql, numericId, cleanUsername, { mode: 'daily', maxPages: 3, fastJitter: true, cookie });
    } catch (err) {
      console.warn(`[deepHarvestCreator] syncCompetitorPins warning:`, err.message);
    }
  }

  let reconcileRes = null;
  if (numericId) {
    try {
      reconcileRes = await reconcileQualifiedCatalogPins(sql, numericId);
    } catch (err) {
      console.warn(`[deepHarvestCreator] reconcileQualifiedCatalogPins warning:`, err.message);
    }
  }

  // 4-Worker pool live metric refresh on winning pins (bounded to max 25 to protect Cloudflare subrequest budget)
  let refreshedCount = 0;
  const limitPins = Math.max(1, Math.min(Number(maxPinRefresh) || 20, 25));
  const archivedPins = await sql`
    SELECT pin_id, title, save_count AS saves, repin_count AS repins, comment_count AS comments
    FROM universal_master_pins
    WHERE creator_username = ${cleanUsername.toLowerCase()}
    ORDER BY save_count DESC NULLS LAST
    LIMIT ${limitPins};
  `;

  if (archivedPins.length > 0) {
    const CONCURRENCY = 4;
    let nextIdx = 0;
    const workers = Array.from({ length: CONCURRENCY }, async () => {
      while (nextIdx < archivedPins.length) {
        const p = archivedPins[nextIdx++];
        if (!p) break;
        try {
          const live = await fetchPinFromPinResource(p.pin_id);
          if (live && live.saves > 0) {
            // [INVARIANT: FOUR-PILLAR-SYNC-PARITY]
            await syncPinAcrossAllFourPillars({
              sql,
              pinId: p.pin_id,
              scrapedPin: live,
              env
            });
            refreshedCount++;
          }
        } catch (_) {}
        await sleep(randomJitterMs(50, 120));
      }
    });
    await Promise.all(workers);
  }

  return {
    ok: true,
    mode: 'deep-harvest',
    creator_id: numericId,
    username: cleanUsername,
    monthly_reach: pulse.monthly_reach,
    profile_views: pulse.profile_views,
    follower_count: pulse.follower_count,
    boards_synced: pulse.boards_synced,
    new_pins_discovered: pinsSyncRes?.new_pins_count || pinsSyncRes?.inserted || 0,
    qualified_promotions: reconcileRes?.promoted_or_updated || 0,
    promoted_count: reconcileRes?.promoted_or_updated || 0,
    qualified_count: reconcileRes?.promoted_or_updated || 0,
    refreshed_winning_pins: refreshedCount,
    harvested_at: new Date().toISOString()
  };
}

/**
 * Get aggregated PinArchive overview metrics
 */
export async function getPinArchiveOverview(sql) {
  const [[stats], [topCluster]] = await Promise.all([
    sql`
      SELECT
        COUNT(*)::bigint AS total_pins,
        COALESCE(SUM(save_count), 0)::bigint AS total_saves,
        COALESCE(SUM(repin_count), 0)::bigint AS total_repins,
        ROUND(COALESCE(AVG(daily_save_velocity), 0)::numeric, 2) AS avg_velocity,
        COUNT(DISTINCT creator_username)::int AS tracked_accounts
      FROM universal_master_pins;
    `,
    sql`
      SELECT *
      FROM pa_topic_clusters_page(1, NULL, 1, 0, NULL);
    `.catch(() => [])
  ]);

  return {
    total_pins: Number(stats?.total_pins || 0),
    total_saves: Number(stats?.total_saves || 0),
    total_repins: Number(stats?.total_repins || 0),
    avg_velocity: Number(stats?.avg_velocity || 0),
    tracked_accounts: Number(stats?.tracked_accounts || 0),
    top_cluster: topCluster ? {
      name: topCluster.topic_name,
      pins: Number(topCluster.pins_count),
      avg_saves: Number(topCluster.avg_saves),
      total_saves: Number(topCluster.total_saves)
    } : null
  };
}

/**
 * Get topic clusters extracted from AI annotations in Postgres
 */
export async function getTopicClusters(sql, { minPins = 1, search = '', account = '', limit = 50, offset = 0 } = {}) {
  const rawSearch = search ? String(search).trim() : '';
  const searchParam = rawSearch || null;
  const cleanAccount = account ? account.toLowerCase().replace(/^@/, '').trim() : null;
  const minNum = Math.max(1, isNaN(Number(minPins)) ? 1 : Number(minPins));
  const lim = Math.max(1, Math.min(isNaN(Number(limit)) ? 50 : Number(limit), 200));
  const off = Math.max(0, isNaN(Number(offset)) ? 0 : Number(offset));

  try {
    const rows = await sql`
      SELECT
        topic_name,
        pins_count::bigint AS pins_count,
        total_saves::numeric AS total_saves,
        avg_saves::bigint AS avg_saves,
        avg_velocity::numeric AS avg_velocity
      FROM pa_topic_clusters_page(
        ${minNum},
        ${searchParam},
        ${lim},
        ${off},
        ${cleanAccount}
      );
    `;

    if (Array.isArray(rows)) {
      return rows.map(r => ({
        name: r.topic_name,
        pins_count: Number(r.pins_count || 0),
        total_saves: Number(r.total_saves || 0),
        avg_saves: Number(r.avg_saves || 0),
        avg_velocity: Number(r.avg_velocity || 0)
      }));
    }
  } catch (_) {
    // Fallback inline CTE if stored procedure is not yet compiled or in local test environment
    const cleanAcctNorm = cleanAccount ? cleanAccount.replace(/^@+/, '').trim().toLowerCase() : null;
    const escapedSearch = searchParam ? ('%' + escapeSqlWildcards(searchParam) + '%') : null;
    const rows = await sql`
      WITH extracted AS (
        SELECT
          CASE
            WHEN jsonb_typeof(ann) = 'object' THEN trim(ann->>'name')
            WHEN jsonb_typeof(ann) = 'string' THEN trim(ann #>> '{}')
            ELSE NULL
          END AS raw_topic,
          p.pin_id,
          p.save_count AS saves,
          p.daily_save_velocity AS velocity
        FROM universal_master_pins p
        CROSS JOIN LATERAL jsonb_array_elements(
          CASE WHEN jsonb_typeof(p.visual_annotations) = 'array' THEN p.visual_annotations ELSE '[]'::jsonb END
        ) AS ann
        WHERE (${cleanAcctNorm}::text IS NULL OR LOWER(TRIM(REPLACE(COALESCE(p.creator_username, ''), '@', ''))) = ${cleanAcctNorm})
      ),
      deduped AS (
        SELECT DISTINCT ON (e.pin_id, LOWER(TRIM(e.raw_topic)))
          e.pin_id,
          LOWER(TRIM(e.raw_topic)) AS norm_topic,
          TRIM(e.raw_topic) AS raw_topic,
          e.saves,
          e.velocity
        FROM extracted e
        WHERE e.raw_topic IS NOT NULL AND TRIM(e.raw_topic) <> ''
          AND (${escapedSearch}::text IS NULL OR e.raw_topic ILIKE ${escapedSearch} ESCAPE '\\')
        ORDER BY e.pin_id, LOWER(TRIM(e.raw_topic)), TRIM(e.raw_topic)
      ),
      aggregated AS (
        SELECT
          MIN(d.raw_topic) AS t_name,
          count(DISTINCT d.pin_id)::BIGINT AS p_count,
          coalesce(sum(d.saves), 0)::NUMERIC AS s_saves,
          CASE WHEN count(DISTINCT d.pin_id) > 0 THEN (coalesce(sum(d.saves), 0) / count(DISTINCT d.pin_id))::BIGINT ELSE 0::BIGINT END AS a_saves,
          coalesce(round(avg(d.velocity)::numeric, 2), 0::numeric) AS a_velocity
        FROM deduped d
        GROUP BY d.norm_topic
        HAVING count(DISTINCT d.pin_id) >= ${minNum}
      )
      SELECT
        a.t_name AS topic_name,
        a.p_count AS pins_count,
        a.s_saves AS total_saves,
        a.a_saves AS avg_saves,
        a.a_velocity AS avg_velocity
      FROM aggregated a
      ORDER BY a.s_saves DESC
      LIMIT ${lim}
      OFFSET ${off};
    `;

    return rows.map(r => ({
      name: r.topic_name,
      pins_count: Number(r.pins_count || 0),
      total_saves: Number(r.total_saves || 0),
      avg_saves: Number(r.avg_saves || 0),
      avg_velocity: Number(r.avg_velocity || 0)
    }));
  }
}

/**
 * Fetch complete pin detail dossier including all historical metric snapshots and deltas
 */
export async function getPinDetailWithMetrics(sql, pinId, options = {}) {
  const cleanId = String(pinId || '').trim();
  if (!cleanId) throw new Error('pinId is required');
  const forceRefresh = options?.forceRefresh === true || options?.refresh === true;
  const env = options?.env || null;
  const ctx = options?.ctx || null;

  // [INVARIANT: READ-ONLY-GET-SAFE] Live enrichment on GET requests is banned; dedicated to POST /api/pins/:id/sync
  if (forceRefresh && options?.allowScrape === true && !options?.isReadOnly) {
    try {
      const pRes = await fetchPinFromPinterest(cleanId, '');
      if (pRes?.ok && pRes.pin) {
        await syncPinAcrossAllFourPillars({
          sql,
          pinId: cleanId,
          scrapedPin: pRes.pin,
          env,
          ctx
        });
      }
    } catch (fetchErr) {
      console.warn(`[getPinDetailWithMetrics] Anonymous Pinterest fetch fallback failed for pin ${cleanId}:`, fetchErr.message);
    }
  }

  // Canonical SSOT Dossier Retrieval
  const universal = await fetchUniversalPinDossier({
    sql,
    pinId: cleanId,
    ctx,
    env,
    bypassEdgeCache: Boolean(forceRefresh)
  }).catch(() => null);

  const c = universal?.creative || {};

  // Fallback query to allow mockSql in tests to supply mockPinRecord.
  let paRow = null;
  if ((!c.save_count || c.save_count === 0) && typeof sql === 'function') {
    try {
      const [p] = await sql`SELECT * FROM universal_master_pins WHERE pin_id = ${cleanId} LIMIT 1;`.catch(() => []);
      paRow = p || null;
    } catch (_) {}
  }

  if (!universal && !paRow && typeof sql === 'function') {
    try {
      const [cp] = await sql`SELECT * FROM universal_master_pins WHERE pin_id = ${cleanId} LIMIT 1;`.catch(() => []);
      paRow = cp || null;
    } catch (_) {}
  }

  if (!universal && !paRow) {
    return null;
  }

  // Trajectory retrieval fallback
  let rawSnaps = Array.isArray(universal?.snapshots) && universal.snapshots.length > 0
    ? universal.snapshots
    : (Array.isArray(universal?.daily_trajectory) ? universal.daily_trajectory : []);

  if (rawSnaps.length === 0) {
    try {
      const trajRes = await fetchPinTrajectory({ sql, pinId: cleanId });
      if (trajRes?.success && Array.isArray(trajRes.snapshots)) {
        rawSnaps = trajRes.snapshots;
      }
    } catch (trajErr) {
      console.warn(`[getPinDetailWithMetrics] Trajectory fetch warning for pin ${cleanId}:`, trajErr.message);
    }
  }

  // Sort chronologically descending to compute deltas
  const sortedSnaps = [...rawSnaps].sort((a, b) => {
    const da = new Date(a.snapshot_date || a.recorded_at || 0).getTime();
    const db = new Date(b.snapshot_date || b.recorded_at || 0).getTime();
    return db - da;
  });

  const totalReactions = typeof paRow?.reactions === 'object' && paRow.reactions !== null
    ? Object.values(paRow.reactions).reduce((a, b) => {
        const n = Number(b);
        return a + (Number.isFinite(n) ? n : 0);
      }, 0)
    : (() => {
        const n = Number(paRow?.reactions ?? c.reaction_count ?? 0);
        return Number.isFinite(n) ? n : 0;
      })();

  const saves = Number(paRow?.saves ?? paRow?.save_count ?? c.save_count ?? 0);
  const repins = Number(paRow?.repins ?? paRow?.repin_count ?? c.repin_count ?? 0);
  const comments = Number(paRow?.comments ?? paRow?.comment_count ?? c.comment_count ?? 0);
  const share_count = Number(paRow?.share_count ?? c.share_count ?? 0);
  const velocity = Number(paRow?.velocity ?? paRow?.daily_save_velocity ?? c.daily_save_velocity ?? 0);

  const title = paRow?.title || c.title || `Pin ${cleanId}`;
  const description = paRow?.description || c.description || '';
  const alt_text = paRow?.alt_text || c.alt_text || '';
  const destination_url = paRow?.destination_url || paRow?.link || c.destination_url || '';
  const domain = paRow?.domain || paRow?.link_domain || c.domain || '';
  const image_url = paRow?.image_url || c.image_url || '';
  const account_username = paRow?.account_username || paRow?.creator_username || universal?.pillar_1_creator_context?.creator_username || '';
  const board_name = paRow?.board_name || universal?.pillar_1_creator_context?.board_name || '';
  const dominant_color = paRow?.dominant_color || c.dominant_color || '#a88d56';
  const creation_method = paRow?.creation_method || c.creation_method || 'pinterest_platform';
  const created_at_pinterest = paRow?.created_at_pinterest || c.created_at_pinterest || null;

  let annotationsList = [];
  if (Array.isArray(paRow?.annotations)) {
    annotationsList = paRow.annotations;
  } else if (typeof paRow?.annotations === 'string') {
    try { annotationsList = JSON.parse(paRow.annotations); } catch (_) {}
  } else if (Array.isArray(c.visual_annotations)) {
    annotationsList = c.visual_annotations;
  }

  // Compute deltas between consecutive snapshots
  const snapshots = sortedSnaps.map((s, idx) => {
    const next = sortedSnaps[idx + 1];
    const sSaves = Number(s.save_count ?? s.saves ?? 0);
    const sRepins = Number(s.repin_count ?? s.repins ?? 0);
    const sComments = Number(s.comment_count ?? s.comments ?? 0);
    const nSaves = next ? Number(next.save_count ?? next.saves ?? 0) : sSaves;
    const nRepins = next ? Number(next.repin_count ?? next.repins ?? 0) : sRepins;
    const nComments = next ? Number(next.comment_count ?? next.comments ?? 0) : sComments;

    const recordedDate = s.snapshot_date ? (typeof s.snapshot_date === 'string' ? s.snapshot_date : s.snapshot_date.toISOString?.() || String(s.snapshot_date)) : (s.recorded_at || new Date().toISOString());

    return {
      id: s.id || `${cleanId}-${recordedDate}`,
      pin_id: cleanId,
      recorded_at: recordedDate,
      saves: sSaves,
      repins: sRepins,
      comments: sComments,
      shares: Number(s.share_count ?? share_count),
      reactions: Number(s.reaction_count ?? totalReactions),
      delta_saves: next ? (sSaves - nSaves) : 0,
      delta_repins: next ? (sRepins - nRepins) : 0,
      delta_comments: next ? (sComments - nComments) : 0,
      delta_shares: 0,
      delta_reactions: 0
    };
  });

  if (snapshots.length === 0) {
    snapshots.push({
      id: 'baseline-' + cleanId,
      pin_id: cleanId,
      recorded_at: paRow?.last_updated_at || paRow?.first_seen_at || new Date().toISOString(),
      saves: saves,
      repins: repins,
      comments: comments,
      shares: share_count,
      reactions: totalReactions,
      delta_saves: 0,
      delta_repins: 0,
      delta_comments: 0,
      delta_shares: 0,
      delta_reactions: 0
    });
  }

  let netGrowth = { saves: 0, repins: 0, comments: 0, shares: 0, reactions: 0 };
  if (snapshots.length >= 2) {
    const latestSnap = snapshots[0];
    const earliestSnap = snapshots[snapshots.length - 1];
    netGrowth = {
      saves: latestSnap.saves - earliestSnap.saves,
      repins: latestSnap.repins - earliestSnap.repins,
      comments: latestSnap.comments - earliestSnap.comments,
      shares: latestSnap.shares - earliestSnap.shares,
      reactions: latestSnap.reactions - earliestSnap.reactions
    };
  }

  return {
    ...(universal || {}),
    pin: {
      pin_id: cleanId,
      title,
      description,
      alt_text,
      destination_url,
      domain,
      image_url,
      account_username,
      board_name,
      saves,
      repins,
      comments,
      share_count,
      velocity,
      annotations: annotationsList,
      reactions_count: totalReactions,
      dominant_color,
      creation_method,
      created_at_pinterest
    },
    snapshots,
    net_growth: netGrowth
  };
}
