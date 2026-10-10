/**
 * PinArchive Service
 * Project 4 (PinArchive & Topic Intelligence) Engine for Neon Serverless Postgres.
 *
 * Provides:
 * - Atomic pin batch ingestion into pa_pins & time-series telemetry in pa_pin_metrics.
 * - Semantic topic cluster extraction from annotations via pa_topic_clusters_page.
 * - High-speed indexed listing & filtering of archived winning pins.
 * - Safe staging & Bulk Compare-And-Swap (CAS) dispatching via pa_staged_pins.
 */

import { fetchPinFromPinterest } from '../../../scripts/lib/pinterest.mjs';

/**
 * Format numbers with abbreviation (e.g. 12.4K, 1.2M)
 */
export function formatMetric(num, abbrev = false) {
  if (num === null || num === undefined) return '0';
  const val = Number(num);
  if (isNaN(val)) return '0';
  if (abbrev) {
    if (val >= 1000000) return (val / 1000000).toFixed(1) + 'M';
    if (val >= 1000) return (val / 1000).toFixed(1) + 'K';
    return String(val);
  }
  return val.toLocaleString();
}

export const DEFAULT_QUALIFICATION_RULES = {
  id: 1,
  tier1_min_saves: 100,
  tier2_min_repins: 100,
  tier3_max_age_days: 14,
  tier3_min_saves: 25,
  master_ingest_enabled: true,
  early_stop_pages: 3,
  max_batch_pins: 500,
  discovery_max_pages: 500,
  refresh_max_pins: 0,
  paused_policy: 'reject'
};

/**
 * Get active Pin Qualification Rules from Neon Postgres
 */
export async function getQualificationRules(sql) {
  try {
    const [row] = await sql`SELECT * FROM pa_qualification_rules WHERE id = 1;`;
    if (row) {
      return {
        id: 1,
        tier1_min_saves: Number(row.tier1_min_saves ?? 100),
        tier2_min_repins: Number(row.tier2_min_repins ?? 100),
        tier3_max_age_days: Number(row.tier3_max_age_days ?? 14),
        tier3_min_saves: Number(row.tier3_min_saves ?? 25),
        master_ingest_enabled: Boolean(row.master_ingest_enabled ?? true),
        cron_enabled: Boolean(row.master_ingest_enabled ?? true),
        early_stop_pages: Number(row.early_stop_pages ?? 3),
        max_batch_pins: Number(row.max_batch_pins ?? 500),
        discovery_max_pages: Number(row.discovery_max_pages ?? 500),
        refresh_max_pins: Number(row.refresh_max_pins ?? 0),
        paused_policy: String(row.paused_policy ?? 'reject'),
        updated_at: row.updated_at
      };
    }
  } catch (_) {}
  return { ...DEFAULT_QUALIFICATION_RULES, cron_enabled: true };
}

/**
 * Update and persist Pin Qualification Rules
 */
export async function updateQualificationRules(sql, rules = {}) {
  const current = await getQualificationRules(sql);
  const t1Saves = Math.max(0, Number(rules.tier1_min_saves ?? current.tier1_min_saves ?? 100));
  const t2Repins = Math.max(0, Number(rules.tier2_min_repins ?? current.tier2_min_repins ?? 100));
  const t3Days = Math.max(1, Number(rules.tier3_max_age_days ?? current.tier3_max_age_days ?? 14));
  const t3Saves = Math.max(0, Number(rules.tier3_min_saves ?? current.tier3_min_saves ?? 25));
  const masterEnabled = rules.master_ingest_enabled !== undefined 
    ? Boolean(rules.master_ingest_enabled) 
    : (rules.cron_enabled !== undefined ? Boolean(rules.cron_enabled) : Boolean(current.master_ingest_enabled));
  const earlyStop = Math.max(1, Math.min(Number(rules.early_stop_pages ?? current.early_stop_pages ?? 3), 100));
  const maxBatch = Math.max(10, Math.min(Number(rules.max_batch_pins ?? current.max_batch_pins ?? 500), 5000));
  const discMax = Math.max(1, Math.min(Number(rules.discovery_max_pages ?? current.discovery_max_pages ?? 500), 2000));
  const refreshMax = Math.max(0, Number(rules.refresh_max_pins ?? current.refresh_max_pins ?? 0));
  const pausedPol = String(rules.paused_policy ?? current.paused_policy ?? 'reject');

  const [updated] = await sql`
    INSERT INTO pa_qualification_rules (
      id,
      tier1_min_saves,
      tier2_min_repins,
      tier3_max_age_days,
      tier3_min_saves,
      master_ingest_enabled,
      early_stop_pages,
      max_batch_pins,
      discovery_max_pages,
      refresh_max_pins,
      paused_policy,
      updated_at
    ) VALUES (
      1,
      ${t1Saves},
      ${t2Repins},
      ${t3Days},
      ${t3Saves},
      ${masterEnabled},
      ${earlyStop},
      ${maxBatch},
      ${discMax},
      ${refreshMax},
      ${pausedPol},
      NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      tier1_min_saves = EXCLUDED.tier1_min_saves,
      tier2_min_repins = EXCLUDED.tier2_min_repins,
      tier3_max_age_days = EXCLUDED.tier3_max_age_days,
      tier3_min_saves = EXCLUDED.tier3_min_saves,
      master_ingest_enabled = EXCLUDED.master_ingest_enabled,
      early_stop_pages = EXCLUDED.early_stop_pages,
      max_batch_pins = EXCLUDED.max_batch_pins,
      discovery_max_pages = EXCLUDED.discovery_max_pages,
      refresh_max_pins = EXCLUDED.refresh_max_pins,
      paused_policy = EXCLUDED.paused_policy,
      updated_at = NOW()
    RETURNING *;
  `;

  return {
    ...(updated || { ...DEFAULT_QUALIFICATION_RULES, ...rules }),
    master_ingest_enabled: masterEnabled,
    cron_enabled: masterEnabled
  };
}

/**
 * Pure qualification filter function implementing the 3-Tier OR criteria
 */
export function qualifyPin(pin, rules = DEFAULT_QUALIFICATION_RULES) {
  if (!rules || rules.master_ingest_enabled === false) {
    return { qualified: false, matchedTier: null };
  }
  const saves = Number(pin.saves || 0);
  const repins = Number(pin.repins || 0);

  let ageDays = (pin.age_days !== undefined && pin.age_days !== null) ? Number(pin.age_days) : NaN;
  if (isNaN(ageDays)) {
    const rawDate = pin.created_at_pinterest || pin.created_at;
    if (rawDate) {
      const ms = Date.now() - new Date(rawDate).getTime();
      if (Number.isFinite(ms) && ms >= 0) {
        ageDays = Math.max(0.1, ms / (1000 * 60 * 60 * 24));
      }
    }
  }

  // Tier 1: Star Performers (Cumulative Saves)
  if (saves >= Number(rules.tier1_min_saves ?? 100)) {
    return { qualified: true, matchedTier: 'tier1' };
  }

  // Tier 2: High Virality (Repins Distribution)
  if (repins >= Number(rules.tier2_min_repins ?? 100)) {
    return { qualified: true, matchedTier: 'tier2' };
  }

  // Tier 3: Fresh High-Velocity Breakouts (Age & Saves)
  // Pin MUST have a verified non-negative age <= tier3_max_age_days
  if (!isNaN(ageDays) && ageDays !== null && ageDays >= 0 && ageDays <= Number(rules.tier3_max_age_days ?? 14) && saves >= Number(rules.tier3_min_saves ?? 25)) {
    return { qualified: true, matchedTier: 'tier3' };
  }

  return { qualified: false, matchedTier: null };
}

export function isPinQualified(pin, rules) {
  const res = qualifyPin(pin, rules);
  return typeof res === 'boolean' ? res : Boolean(res?.qualified);
}

/**
 * Re-evaluate candidate pins stored in pa_pins against active rules
 */
export async function reEvaluateArchivedPins(sql, rules = null, accountUsername = null) {
  const activeRules = rules || (await getQualificationRules(sql));
  const cleanUser = accountUsername ? String(accountUsername).replace(/^@/, '').trim().toLowerCase() : null;
  
  // If master ingest is disabled, no pins qualify
  if (activeRules.master_ingest_enabled === false) {
    const delRes = await sql`
      DELETE FROM pa_pins
      WHERE (${cleanUser}::text IS NULL OR LOWER(account_username) = ${cleanUser})
      RETURNING pin_id;
    `;
    const total = delRes.length || 0;
    return {
      ok: true,
      total_evaluated: total,
      qualified_count: 0,
      disqualified_count: total,
      disqualified_pruned: total,
      rules: activeRules
    };
  }

  const t1 = Number(activeRules.tier1_min_saves ?? 100);
  const t2 = Number(activeRules.tier2_min_repins ?? 100);
  const t3Days = Number(activeRules.tier3_max_age_days ?? 14);
  const t3Saves = Number(activeRules.tier3_min_saves ?? 25);

  const [res] = await sql`
    SELECT
      count(*)::int AS total_pins,
      count(CASE 
        WHEN saves >= ${t1} 
          OR repins >= ${t2}
          OR (
            created_at_pinterest IS NOT NULL
            AND (NOW() - created_at_pinterest) >= INTERVAL '0 seconds'
            AND EXTRACT(EPOCH FROM (NOW() - created_at_pinterest))/86400 <= ${t3Days} 
            AND saves >= ${t3Saves}
          )
        THEN 1 
      END)::int AS qualified_pins
    FROM pa_pins
    WHERE (${cleanUser}::text IS NULL OR LOWER(account_username) = ${cleanUser});
  `;

  const total = res?.total_pins || 0;
  const qualified = res?.qualified_pins || 0;
  const disqualified = Math.max(0, total - qualified);

  let prunedCount = 0;
  if (disqualified > 0) {
    const delRes = await sql`
      DELETE FROM pa_pins
      WHERE (${cleanUser}::text IS NULL OR LOWER(account_username) = ${cleanUser})
        AND NOT (
          saves >= ${t1} 
          OR repins >= ${t2}
          OR (
            created_at_pinterest IS NOT NULL
            AND (NOW() - created_at_pinterest) >= INTERVAL '0 seconds'
            AND EXTRACT(EPOCH FROM (NOW() - created_at_pinterest))/86400 <= ${t3Days} 
            AND saves >= ${t3Saves}
          )
        )
      RETURNING pin_id;
    `;
    prunedCount = delRes.length || 0;
  }

  return {
    ok: true,
    total_evaluated: total,
    qualified_count: qualified,
    disqualified_count: disqualified,
    disqualified_pruned: prunedCount,
    rules: activeRules
  };
}

/**
 * Ingest a batch of formatted pins into pa_pins & record time-series in pa_pin_metrics.
 * Optionally applies qualifyPin criteria so unqualified pins are filtered out.
 */
export async function ingestPinsBatch(sql, pins, accountUsername = null, { filterQualified = false, rules = null } = {}) {
  if (!Array.isArray(pins) || pins.length === 0) {
    return { ok: true, added: 0, inserted: 0, updated: 0, filtered: 0, total: 0 };
  }

  const activeRules = filterQualified ? (rules || (await getQualificationRules(sql))) : null;
  const cleanAccount = accountUsername ? String(accountUsername).replace(/^@/, '').trim().toLowerCase() : null;

  let addedCount = 0;
  let updatedCount = 0;
  let filteredCount = 0;

  const preparedPins = [];
  for (const pin of pins) {
    const pinId = String(pin.pin_id || pin.id || '').trim();
    if (!pinId) continue;

    // Filter sub-threshold pins if qualification is active
    if (activeRules && !isPinQualified(pin, activeRules)) {
      filteredCount++;
      continue;
    }

    const title = pin.title || '';
    const description = pin.description || '';
    const link = pin.link || '';
    let domain = pin.domain || '';
    if (!domain && link) {
      try {
        domain = new URL(link).hostname;
      } catch (_) {
        domain = '';
      }
    }
    const boardName = pin.board_name || '';
    const imageUrl = pin.image_url || '';
    const dominantColor = pin.dominant_color || '#888888';
    const saves = Math.max(0, isNaN(Number(pin.saves)) ? 0 : Number(pin.saves));
    const repins = Math.max(0, isNaN(Number(pin.repins)) ? saves : Number(pin.repins));
    const comments = Math.max(0, isNaN(Number(pin.comments)) ? 0 : Number(pin.comments));
    const shareCount = Math.max(0, isNaN(Number(pin.share_count)) ? 0 : Number(pin.share_count));
    
    let reactions = '{}';
    if (pin.reactions && typeof pin.reactions === 'object') {
      reactions = JSON.stringify(pin.reactions);
    } else if (typeof pin.reactions === 'string' && pin.reactions.trim().startsWith('{')) {
      reactions = pin.reactions.trim();
    }

    const velocity = Math.max(0, isNaN(Number(pin.velocity)) ? 0 : Number(pin.velocity));

    let annotations = '[]';
    if (Array.isArray(pin.annotations)) {
      annotations = JSON.stringify(pin.annotations.slice(0, 15));
    } else if (typeof pin.annotations === 'string' && pin.annotations.trim().startsWith('[')) {
      annotations = pin.annotations.trim();
    }

    const isVideo = Boolean(pin.is_video);
    const isProduct = Boolean(pin.is_product);
    let createdAtPinterest = null;
    if (pin.created_at_pinterest || pin.created_at) {
      const d = new Date(pin.created_at_pinterest || pin.created_at);
      if (!isNaN(d.getTime())) createdAtPinterest = d;
    }

    preparedPins.push({
      pinId,
      title,
      description,
      link,
      domain,
      boardName,
      imageUrl,
      dominantColor,
      saves,
      repins,
      comments,
      shareCount,
      reactions,
      velocity,
      annotations,
      isVideo,
      isProduct,
      createdAtPinterest
    });
  }

  // Process in bounded parallel chunks of 25 to optimize serverless round-trips
  const CHUNK_SIZE = 25;
  for (let i = 0; i < preparedPins.length; i += CHUNK_SIZE) {
    const chunk = preparedPins.slice(i, i + CHUNK_SIZE);
    await Promise.allSettled(chunk.map(async (p) => {
      try {
        const [row] = await sql`
          INSERT INTO pa_pins (
            pin_id,
            account_username,
            title,
            description,
            link,
            domain,
            board_name,
            image_url,
            dominant_color,
            saves,
            repins,
            comments,
            share_count,
            reactions,
            velocity,
            annotations,
            is_video,
            is_product,
            created_at_pinterest,
            first_seen_at,
            last_updated_at
          ) VALUES (
            ${p.pinId},
            ${cleanAccount},
            ${p.title},
            ${p.description},
            ${p.link},
            ${p.domain},
            ${p.boardName},
            ${p.imageUrl},
            ${p.dominantColor},
            ${p.saves},
            ${p.repins},
            ${p.comments},
            ${p.shareCount},
            ${p.reactions}::jsonb,
            ${p.velocity},
            ${p.annotations}::jsonb,
            ${p.isVideo},
            ${p.isProduct},
            ${p.createdAtPinterest},
            NOW(),
            NOW()
          )
          ON CONFLICT (pin_id) DO UPDATE SET
            account_username = COALESCE(EXCLUDED.account_username, pa_pins.account_username),
            title = CASE WHEN EXCLUDED.title <> '' THEN EXCLUDED.title ELSE pa_pins.title END,
            description = CASE WHEN EXCLUDED.description <> '' THEN EXCLUDED.description ELSE pa_pins.description END,
            link = CASE WHEN EXCLUDED.link <> '' THEN EXCLUDED.link ELSE pa_pins.link END,
            domain = CASE WHEN EXCLUDED.domain <> '' THEN EXCLUDED.domain ELSE pa_pins.domain END,
            board_name = CASE WHEN EXCLUDED.board_name <> '' THEN EXCLUDED.board_name ELSE pa_pins.board_name END,
            image_url = CASE WHEN EXCLUDED.image_url <> '' THEN EXCLUDED.image_url ELSE pa_pins.image_url END,
            dominant_color = CASE WHEN EXCLUDED.dominant_color <> '#888888' AND EXCLUDED.dominant_color <> '' THEN EXCLUDED.dominant_color ELSE pa_pins.dominant_color END,
            saves = GREATEST(pa_pins.saves, EXCLUDED.saves),
            repins = GREATEST(pa_pins.repins, EXCLUDED.repins),
            comments = GREATEST(pa_pins.comments, EXCLUDED.comments),
            share_count = GREATEST(pa_pins.share_count, EXCLUDED.share_count),
            reactions = CASE WHEN EXCLUDED.reactions <> '{}'::jsonb THEN EXCLUDED.reactions ELSE pa_pins.reactions END,
            velocity = CASE WHEN EXCLUDED.velocity > 0 THEN EXCLUDED.velocity ELSE pa_pins.velocity END,
            annotations = CASE WHEN jsonb_typeof(EXCLUDED.annotations) = 'array' AND jsonb_array_length(EXCLUDED.annotations) > 0 THEN EXCLUDED.annotations ELSE pa_pins.annotations END,
            is_product = (pa_pins.is_product OR EXCLUDED.is_product),
            created_at_pinterest = COALESCE(pa_pins.created_at_pinterest, EXCLUDED.created_at_pinterest),
            last_updated_at = NOW()
          RETURNING (xmax = 0) AS is_inserted;
        `;

        if (row?.is_inserted) addedCount++;
        else updatedCount++;

        // Record hourly deduplicated telemetry snapshot in pa_pin_metrics
        await sql`
          INSERT INTO pa_pin_metrics (
            pin_id,
            recorded_at,
            saves,
            repins,
            comments
          ) VALUES (
            ${p.pinId},
            date_trunc('hour', NOW()),
            ${p.saves},
            ${p.repins},
            ${p.comments}
          )
          ON CONFLICT (pin_id, recorded_at) DO UPDATE SET
            saves = GREATEST(pa_pin_metrics.saves, EXCLUDED.saves),
            repins = GREATEST(pa_pin_metrics.repins, EXCLUDED.repins),
            comments = GREATEST(pa_pin_metrics.comments, EXCLUDED.comments);
        `;
      } catch (pinErr) {
        console.warn(`[ingestPinsBatch] Pin ${p.pinId} skipped:`, pinErr.message);
      }
    }));
  }

  return { ok: true, added: addedCount, inserted: addedCount, updated: updatedCount, filtered: filteredCount, total: pins.length };
}

/**
 * Get aggregated PinArchive overview metrics
 */
export async function getPinArchiveOverview(sql) {
  const [[stats], [topCluster], [stagedCount]] = await Promise.all([
    sql`
      SELECT
        COUNT(*)::bigint AS total_pins,
        COALESCE(SUM(saves), 0)::bigint AS total_saves,
        COALESCE(SUM(repins), 0)::bigint AS total_repins,
        ROUND(COALESCE(AVG(velocity), 0), 2)::numeric AS avg_velocity,
        COUNT(DISTINCT account_username)::int AS tracked_accounts
      FROM pa_pins;
    `,
    sql`
      SELECT *
      FROM pa_topic_clusters_page(1, NULL, 1, 0);
    `.catch(() => []),
    sql`
      SELECT COUNT(*)::int AS count
      FROM pa_staged_pins
      WHERE status = 'staged';
    `
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
      total_saves: Number(topCluster.total_saves),
    } : null,
    staged_pins_count: Number(stagedCount?.count || 0)
  };
}

/**
 * Get topic clusters extracted from AI annotations in Postgres
 */
export async function getTopicClusters(sql, { minPins = 1, search = '', account = '', limit = 50, offset = 0 } = {}) {
  const searchPattern = search ? search.trim() : null;
  const cleanAccount = account ? account.toLowerCase().replace(/^@/, '').trim() : null;
  const minNum = Math.max(1, isNaN(Number(minPins)) ? 1 : Number(minPins));
  const lim = Math.max(1, Math.min(isNaN(Number(limit)) ? 50 : Number(limit), 200));
  const off = Math.max(0, isNaN(Number(offset)) ? 0 : Number(offset));

  if (cleanAccount) {
    const rows = await sql`
      WITH extracted AS (
        SELECT
          COALESCE(
            CASE
              WHEN jsonb_typeof(ann) = 'object' THEN trim(ann->>'name')
              WHEN jsonb_typeof(ann) = 'string' THEN trim(ann #>> '{}')
              ELSE NULL
            END,
            NULLIF(TRIM(p.board_name), '')
          ) AS raw_topic,
          p.pin_id,
          p.saves,
          p.velocity
        FROM pa_pins p
        LEFT JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(p.annotations) = 'array' THEN p.annotations ELSE '[]'::jsonb END) AS ann ON TRUE
        WHERE LOWER(REPLACE(p.account_username, '@', '')) = ${cleanAccount}
      ),
      aggregated AS (
        SELECT
          e.raw_topic AS t_name,
          count(DISTINCT e.pin_id)::BIGINT AS p_count,
          coalesce(sum(e.saves), 0)::NUMERIC AS s_saves,
          CASE WHEN count(DISTINCT e.pin_id) > 0 THEN (coalesce(sum(e.saves), 0) / count(DISTINCT e.pin_id))::BIGINT ELSE 0::BIGINT END AS a_saves,
          round(avg(e.velocity), 2) AS a_velocity
        FROM extracted e
        WHERE e.raw_topic IS NOT NULL AND TRIM(e.raw_topic) <> ''
          AND (${searchPattern}::text IS NULL OR e.raw_topic ILIKE ${'%' + (searchPattern || '') + '%'})
        GROUP BY e.raw_topic
        HAVING count(DISTINCT e.pin_id) >= ${minNum}
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
      pins_count: Number(r.pins_count),
      total_saves: Number(r.total_saves),
      avg_saves: Number(r.avg_saves),
      avg_velocity: Number(r.avg_velocity),
    }));
  }

  const rows = await sql`
    SELECT
      topic_name,
      pins_count::bigint AS pins_count,
      total_saves::numeric AS total_saves,
      avg_saves::bigint AS avg_saves,
      avg_velocity::numeric AS avg_velocity
    FROM pa_topic_clusters_page(
      ${minNum},
      ${searchPattern},
      ${lim},
      ${off}
    );
  `;

  return rows.map(r => ({
    name: r.topic_name,
    pins_count: Number(r.pins_count),
    total_saves: Number(r.total_saves),
    avg_saves: Number(r.avg_saves),
    avg_velocity: Number(r.avg_velocity),
  }));
}

/**
 * Calculate pin growth stage
 */
export function computePinStage(velocity, deltaSaves, ageDays) {
  if (velocity < 0.5) return 'DORMANT';
  if (velocity < 2 && deltaSaves < 0) return 'COOLING';
  if (ageDays <= 14) return 'NEW';
  if (velocity >= 10) return 'GROWING';
  if (velocity >= 2 && ageDays > 14) return 'MATURE';
  return velocity >= 2 ? 'MATURE' : 'DORMANT';
}

/**
 * List archived pins with filtering, topic clustering, search, and sorting
 */
export async function listArchivedPins(sql, {
  search = '',
  topic = '',
  board = '',
  stage = '',
  minSaves = 0,
  maxSaves = null,
  account = '',
  timeframe = '24h',
  changedOnly = false,
  sortBy = 'saves',
  order = 'desc',
  limit = 50,
  offset = 0
} = {}) {
  const minNum = Math.max(0, isNaN(Number(minSaves)) ? 0 : Number(minSaves));
  const maxNum = (maxSaves !== null && !isNaN(Number(maxSaves))) ? Number(maxSaves) : null;
  const lim = Math.max(1, Math.min(isNaN(Number(limit)) ? 50 : Number(limit), 1000));
  const off = Math.max(0, isNaN(Number(offset)) ? 0 : Number(offset));
  const searchPattern = search ? `%${search.toLowerCase().trim()}%` : null;
  const topicPattern = topic ? `%${topic.toLowerCase().trim()}%` : null;
  const accountPattern = account ? `%${account.toLowerCase().replace('@', '').trim()}%` : null;
  const boardPattern = board ? `%${board.toLowerCase().trim()}%` : null;
  const isAsc = String(order).toLowerCase() === 'asc';

  // Normalize sort column
  let sortColumn = 'saves';
  if (sortBy === 'velocity' || sortBy === 'delta_saves') sortColumn = 'velocity';
  else if (sortBy === 'created_at' || sortBy === 'date' || sortBy === 'newest') sortColumn = 'created_at_pinterest';
  else if (sortBy === 'repins') sortColumn = 'repins';
  else if (sortBy === 'comments') sortColumn = 'comments';
  else if (sortBy === 'shares' || sortBy === 'share_count') sortColumn = 'share_count';

  const [rows, [countRow]] = await Promise.all([
    sql`
      SELECT *
      FROM pa_pins
      WHERE saves >= ${minNum}
        AND (${maxNum}::bigint IS NULL OR saves <= ${maxNum})
        AND (${searchPattern}::text IS NULL OR (
          COALESCE(LOWER(title), '') LIKE ${searchPattern} OR
          COALESCE(LOWER(description), '') LIKE ${searchPattern} OR
          COALESCE(LOWER(board_name), '') LIKE ${searchPattern} OR
          COALESCE(pin_id, '') LIKE ${searchPattern}
        ))
        AND (${boardPattern}::text IS NULL OR COALESCE(LOWER(board_name), '') LIKE ${boardPattern})
        AND (${topicPattern}::text IS NULL OR (
          COALESCE(LOWER(board_name), '') LIKE ${topicPattern} OR
          COALESCE(LOWER(title), '') LIKE ${topicPattern} OR
          EXISTS (
            SELECT 1
            FROM jsonb_array_elements(CASE WHEN jsonb_typeof(annotations) = 'array' THEN annotations ELSE '[]'::jsonb END) AS elem
            WHERE (
              (jsonb_typeof(elem) = 'object' AND LOWER(elem->>'name') LIKE ${topicPattern})
              OR
              (jsonb_typeof(elem) = 'string' AND LOWER(elem #>> '{}') LIKE ${topicPattern})
            )
          )
        ))
        AND (${accountPattern}::text IS NULL OR COALESCE(LOWER(account_username), '') LIKE ${accountPattern})
      ORDER BY
        CASE WHEN ${sortColumn} = 'saves' AND ${isAsc} THEN saves END ASC,
        CASE WHEN ${sortColumn} = 'saves' AND NOT ${isAsc} THEN saves END DESC,
        CASE WHEN ${sortColumn} = 'velocity' AND ${isAsc} THEN velocity END ASC,
        CASE WHEN ${sortColumn} = 'velocity' AND NOT ${isAsc} THEN velocity END DESC,
        CASE WHEN ${sortColumn} = 'created_at_pinterest' AND ${isAsc} THEN created_at_pinterest END ASC NULLS LAST,
        CASE WHEN ${sortColumn} = 'created_at_pinterest' AND NOT ${isAsc} THEN created_at_pinterest END DESC NULLS LAST,
        CASE WHEN ${sortColumn} = 'repins' AND ${isAsc} THEN repins END ASC,
        CASE WHEN ${sortColumn} = 'repins' AND NOT ${isAsc} THEN repins END DESC,
        CASE WHEN ${sortColumn} = 'comments' AND ${isAsc} THEN comments END ASC,
        CASE WHEN ${sortColumn} = 'comments' AND NOT ${isAsc} THEN comments END DESC,
        CASE WHEN ${sortColumn} = 'share_count' AND ${isAsc} THEN share_count END ASC,
        CASE WHEN ${sortColumn} = 'share_count' AND NOT ${isAsc} THEN share_count END DESC,
        saves DESC
      LIMIT ${lim} OFFSET ${off};
    `,
    sql`
      SELECT COUNT(*)::int as total
      FROM pa_pins
      WHERE saves >= ${minNum}
        AND (${maxNum}::bigint IS NULL OR saves <= ${maxNum})
        AND (${searchPattern}::text IS NULL OR (
          COALESCE(LOWER(title), '') LIKE ${searchPattern} OR
          COALESCE(LOWER(description), '') LIKE ${searchPattern} OR
          COALESCE(LOWER(board_name), '') LIKE ${searchPattern} OR
          COALESCE(pin_id, '') LIKE ${searchPattern}
        ))
        AND (${boardPattern}::text IS NULL OR COALESCE(LOWER(board_name), '') LIKE ${boardPattern})
        AND (${topicPattern}::text IS NULL OR (
          COALESCE(LOWER(board_name), '') LIKE ${topicPattern} OR
          COALESCE(LOWER(title), '') LIKE ${topicPattern} OR
          EXISTS (
            SELECT 1
            FROM jsonb_array_elements(CASE WHEN jsonb_typeof(annotations) = 'array' THEN annotations ELSE '[]'::jsonb END) AS elem
            WHERE (
              (jsonb_typeof(elem) = 'object' AND LOWER(elem->>'name') LIKE ${topicPattern})
              OR
              (jsonb_typeof(elem) = 'string' AND LOWER(elem #>> '{}') LIKE ${topicPattern})
            )
          )
        ))
        AND (${accountPattern}::text IS NULL OR COALESCE(LOWER(account_username), '') LIKE ${accountPattern});
    `
  ]);

  const now = Date.now();

  // Batch-fetch true historical time-series snapshots for the retrieved page of pins
  const metricsMap = new Map();
  if (rows.length > 0) {
    try {
      const pinIds = rows.map(r => r.pin_id);
      const metricSnapshots = await sql`
        SELECT pin_id, saves, repins, comments, recorded_at
        FROM pa_pin_metrics
        WHERE pin_id = ANY(${pinIds})
        ORDER BY pin_id, recorded_at DESC;
      `;
      for (const snap of metricSnapshots) {
        if (!metricsMap.has(snap.pin_id)) {
          metricsMap.set(snap.pin_id, []);
        }
        metricsMap.get(snap.pin_id).push(snap);
      }
    } catch (_) {}
  }

  let mapped = rows.map(p => {
    const velocity = Number(p.velocity || 0);
    const createdDate = p.created_at_pinterest ? new Date(p.created_at_pinterest) : (p.first_seen_at ? new Date(p.first_seen_at) : new Date());
    const ageDays = Math.max(1, Math.round((now - createdDate.getTime()) / 86400000));
    
    // Genuine growth deltas calculation directly from time-series snapshots
    const history = metricsMap.get(p.pin_id) || [];
    const curSaves = Number(p.saves || 0);
    const curRepins = Number(p.repins || 0);

    let deltaSaves = 0;
    let deltaRepins = 0;
    let deltaSaves3d = 0;
    let deltaSaves7d = 0;

    if (history.length > 0) {
      const tNow = Date.now();
      // Find snapshot closest to 24 hours ago (between 16h and 36h, or oldest in window, or previous snapshot)
      const snap24h = history.find(s => {
        const diffHours = (tNow - new Date(s.recorded_at).getTime()) / 3600000;
        return diffHours >= 16 && diffHours <= 36;
      }) || (history.length > 1 && (tNow - new Date(history[history.length - 1].recorded_at).getTime()) >= 6 * 3600000 ? history[history.length - 1] : null);

      if (snap24h) {
        deltaSaves = Math.max(0, curSaves - Number(snap24h.saves || 0));
        deltaRepins = Math.max(0, curRepins - Number(snap24h.repins || 0));
      }

      const snap3d = history.find(s => {
        const diffDays = (tNow - new Date(s.recorded_at).getTime()) / 86400000;
        return diffDays >= 2.5 && diffDays <= 4.5;
      });
      if (snap3d) {
        deltaSaves3d = Math.max(0, curSaves - Number(snap3d.saves || 0));
      } else if (deltaSaves > 0) {
        deltaSaves3d = deltaSaves;
      }

      const snap7d = history.find(s => {
        const diffDays = (tNow - new Date(s.recorded_at).getTime()) / 86400000;
        return diffDays >= 6 && diffDays <= 8.5;
      });
      if (snap7d) {
        deltaSaves7d = Math.max(0, curSaves - Number(snap7d.saves || 0));
      } else if (deltaSaves3d > 0) {
        deltaSaves7d = deltaSaves3d;
      }
    }

    const pinStage = computePinStage(velocity, deltaSaves, ageDays);

    return {
      ...p,
      saves: curSaves,
      repins: curRepins,
      comments: Number(p.comments || 0),
      share_count: Number(p.share_count || 0),
      velocity: Number(velocity.toFixed(1)),
      age_days: ageDays,
      delta_saves: deltaSaves,
      delta_repins: deltaRepins,
      delta_saves_3d: deltaSaves3d,
      delta_saves_7d: deltaSaves7d,
      stage: pinStage,
      formatted_created: createdDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      formatted_first_pulled: p.first_seen_at ? new Date(p.first_seen_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : (p.created_at_pinterest ? new Date(p.created_at_pinterest).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—')
    };
  });

  if (stage) {
    const sUpper = String(stage).toUpperCase();
    mapped = mapped.filter(p => p.stage === sUpper);
  }

  if (changedOnly) {
    mapped = mapped.filter(p => p.delta_saves > 0 || p.delta_repins > 0);
  }

  mapped.total = countRow ? countRow.total : mapped.length;
  return mapped;
}

/**
 * Stage selected pins for repurposing & scheduling (idempotent: avoids duplicate active staging)
 */
export async function stagePinsForRepurpose(sql, { pinIds = [], targetBoard = '', overrideLink = '' } = {}) {
  if (!Array.isArray(pinIds) || pinIds.length === 0) {
    throw new Error('No pin IDs provided to stage.');
  }

  const stagedRows = [];
  for (const pinId of pinIds) {
    const cleanId = String(pinId).trim();
    if (!cleanId) continue;

    try {
      const [inserted] = await sql`
        INSERT INTO pa_staged_pins (
          pin_id,
          target_board,
          override_link,
          status,
          created_at,
          updated_at
        )
        SELECT
          ${cleanId},
          ${targetBoard || null},
          ${overrideLink || null},
          'staged',
          NOW(),
          NOW()
        WHERE EXISTS (
          SELECT 1 FROM pa_pins WHERE pin_id = ${cleanId}
        )
        AND NOT EXISTS (
          SELECT 1 FROM pa_staged_pins WHERE pin_id = ${cleanId} AND status = 'staged'
        )
        RETURNING *;
      `;
      if (inserted) stagedRows.push(inserted);
    } catch (err) {
      console.warn(`[stagePinsForRepurpose] Skipped pin ${cleanId}:`, err.message);
    }
  }

  return { ok: true, stagedCount: stagedRows.length, staged_count: stagedRows.length, items: stagedRows };
}

/**
 * Atomic Compare-And-Swap (CAS) dispatch claim for a staged pin
 * Prevents double-posting across concurrent workers.
 */
export async function claimStagedPinCas(sql, stagedId) {
  if (!stagedId) throw new Error('Invalid staged ID');
  const cleanStr = String(stagedId).trim();
  const numericId = parseInt(cleanStr, 10);
  const isSerialId = !isNaN(numericId) && String(numericId) === cleanStr && numericId > 0 && numericId <= 2147483647;

  let claimed;
  if (isSerialId) {
    [claimed] = await sql`
      UPDATE pa_staged_pins
      SET status = 'dispatched', updated_at = NOW()
      WHERE id = ${numericId} AND status = 'staged'
      RETURNING *;
    `;
  }

  // Fallback to claim by Pinterest pin_id if not claimed by serial primary key
  if (!claimed) {
    [claimed] = await sql`
      UPDATE pa_staged_pins
      SET status = 'dispatched', updated_at = NOW()
      WHERE pin_id = ${cleanStr} AND status = 'staged'
      RETURNING *;
    `;
  }

  return {
    success: Boolean(claimed),
    item: claimed || null,
  };
}

/**
 * Cancel or unstage a pin in pa_staged_pins
 */
export async function cancelStagedPin(sql, stagedId) {
  if (!stagedId) throw new Error('Invalid staged ID');
  const cleanStr = String(stagedId).trim();
  const numericId = parseInt(cleanStr, 10);
  const isSerialId = !isNaN(numericId) && String(numericId) === cleanStr && numericId > 0 && numericId <= 2147483647;

  let cancelled;
  if (isSerialId) {
    [cancelled] = await sql`
      UPDATE pa_staged_pins
      SET status = 'cancelled', updated_at = NOW()
      WHERE id = ${numericId} AND status = 'staged'
      RETURNING *;
    `;
  }

  // Fallback to cancel by Pinterest pin_id if not matched by serial ID
  if (!cancelled) {
    [cancelled] = await sql`
      UPDATE pa_staged_pins
      SET status = 'cancelled', updated_at = NOW()
      WHERE pin_id = ${cleanStr} AND status = 'staged'
      RETURNING *;
    `;
  }

  return {
    success: Boolean(cancelled),
    item: cancelled || null,
  };
}

/**
 * List all staged pins in the repurposing pipeline (supports status 'all' and individual statuses)
 */
export async function listStagedPins(sql, { status = 'all', limit = 50, offset = 0 } = {}) {
  const lim = Math.max(1, Math.min(isNaN(Number(limit)) ? 50 : Number(limit), 200));
  const off = Math.max(0, isNaN(Number(offset)) ? 0 : Number(offset));

  if (status && status !== 'all') {
    return await sql`
      SELECT
        s.*,
        p.title,
        p.image_url,
        p.dominant_color,
        p.saves,
        p.velocity,
        p.link AS original_link
      FROM pa_staged_pins s
      LEFT JOIN pa_pins p ON s.pin_id = p.pin_id
      WHERE s.status = ${status}
      ORDER BY s.created_at DESC
      LIMIT ${lim} OFFSET ${off};
    `;
  }

  return await sql`
    SELECT
      s.*,
      p.title,
      p.image_url,
      p.dominant_color,
      p.saves,
      p.velocity,
      p.link AS original_link
    FROM pa_staged_pins s
    LEFT JOIN pa_pins p ON s.pin_id = p.pin_id
    ORDER BY s.created_at DESC
    LIMIT ${lim} OFFSET ${off};
  `;
}

/**
 * Fetch complete pin detail dossier including all historical metric snapshots and deltas
 */
export async function getPinDetailWithMetrics(sql, pinId, options = {}) {
  const cleanId = String(pinId || '').trim();
  if (!cleanId) throw new Error('pinId is required');
  const forceRefresh = options?.forceRefresh === true || options?.refresh === true;

  let pin = null;

  if (!forceRefresh) {
    const [p] = await sql`
      SELECT * FROM pa_pins WHERE pin_id = ${cleanId} LIMIT 1;
    `;
    pin = p || null;

    if (!pin) {
      const [rawPin] = await sql`
        SELECT 
          pin_id,
          title,
          description,
          destination_url AS link,
          link_domain AS domain,
          board_name,
          image_url,
          NULL AS dominant_color,
          save_count AS saves,
          repin_count AS repins,
          comment_count AS comments,
          0 AS share_count,
          '{}'::jsonb AS reactions,
          0 AS velocity,
          metadata->'annotations' AS annotations,
          FALSE AS is_video,
          COALESCE(is_product, false) AS is_product,
          alt_text,
          created_at_pinterest,
          first_seen_at,
          last_seen_at AS last_updated_at
        FROM competitor_pins
        WHERE pin_id = ${cleanId}
        LIMIT 1;
      `;
      pin = rawPin || null;
    }
  }

  // Only fetch live from Pinterest if user explicitly clicked "Live Refresh" (never auto-crawl on pin modal open)
  const needsEnrichment = forceRefresh;

  if (needsEnrichment) {
    try {
      const pRes = await fetchPinFromPinterest(cleanId, '');
      if (pRes?.ok && pRes.pin) {
        const live = pRes.pin;
        await sql`
          INSERT INTO pa_pins (
            pin_id, title, description, alt_text, link, domain, board_name, image_url,
            saves, repins, comments, share_count, reactions, velocity,
            annotations, is_video, is_product, created_at_pinterest,
            first_seen_at, last_updated_at
          ) VALUES (
            ${cleanId},
            ${live.title || ''},
            ${live.description || ''},
            ${live.alt_text || null},
            ${live.link || ''},
            ${live.domain || ''},
            ${live.board_name || 'General'},
            ${live.image_url || null},
            ${live.saves || 0},
            ${live.repins || 0},
            ${live.comments || 0},
            ${live.share_count || 0},
            ${JSON.stringify(live.reactions || {})}::jsonb,
            ${live.velocity || 0},
            ${JSON.stringify(live.annotations || [])}::jsonb,
            ${Boolean(live.is_video)},
            ${Boolean(live.is_product)},
            ${live.created_at_pinterest || null},
            NOW(),
            NOW()
          )
          ON CONFLICT (pin_id) DO UPDATE SET
            title = EXCLUDED.title,
            description = EXCLUDED.description,
            alt_text = COALESCE(EXCLUDED.alt_text, pa_pins.alt_text),
            link = EXCLUDED.link,
            domain = EXCLUDED.domain,
            board_name = COALESCE(EXCLUDED.board_name, pa_pins.board_name),
            image_url = COALESCE(EXCLUDED.image_url, pa_pins.image_url),
            saves = EXCLUDED.saves,
            repins = EXCLUDED.repins,
            comments = EXCLUDED.comments,
            share_count = EXCLUDED.share_count,
            reactions = EXCLUDED.reactions,
            annotations = EXCLUDED.annotations,
            is_product = EXCLUDED.is_product,
            last_updated_at = NOW();
        `;

        try {
          await sql`
            UPDATE competitor_pins
            SET
              alt_text = COALESCE(${live.alt_text || null}, competitor_pins.alt_text),
              is_product = COALESCE(${Boolean(live.is_product)}, competitor_pins.is_product),
              metadata = jsonb_set(COALESCE(competitor_pins.metadata, '{}'::jsonb), '{annotations}', ${JSON.stringify(live.annotations || [])}::jsonb)
            WHERE pin_id = ${cleanId};
          `;
        } catch (_) {}

        // Record live metric snapshot
        await sql`
          INSERT INTO pa_pin_metrics (pin_id, recorded_at, saves, repins, comments)
          VALUES (${cleanId}, NOW(), ${live.saves || 0}, ${live.repins || 0}, ${live.comments || 0});
        `;

        const [refreshed] = await sql`SELECT * FROM pa_pins WHERE pin_id = ${cleanId} LIMIT 1;`;
        pin = refreshed || null;
      }
    } catch (fetchErr) {
      console.warn(`[getPinDetailWithMetrics] Anonymous Pinterest fetch fallback failed for pin ${cleanId}:`, fetchErr.message);
    }
  }

  if (!pin) return null;

  // Fetch snapshots from pa_pin_metrics
  const rawSnaps = await sql`
    SELECT id, pin_id, recorded_at, saves, repins, comments
    FROM pa_pin_metrics
    WHERE pin_id = ${cleanId}
    ORDER BY recorded_at DESC;
  `;

  const totalReactions = typeof pin.reactions === 'object' && pin.reactions !== null
    ? Object.values(pin.reactions).reduce((a, b) => a + Number(b || 0), 0)
    : Number(pin.reactions || 0);

  // Compute deltas between consecutive snapshots
  const snapshots = rawSnaps.map((s, idx) => {
    const next = rawSnaps[idx + 1]; // next in DESC order is chronologically previous
    const sSaves = Number(s.saves || 0);
    const sRepins = Number(s.repins || 0);
    const sComments = Number(s.comments || 0);
    const nSaves = next ? Number(next.saves || 0) : sSaves;
    const nRepins = next ? Number(next.repins || 0) : sRepins;
    const nComments = next ? Number(next.comments || 0) : sComments;

    return {
      id: s.id,
      pin_id: s.pin_id,
      recorded_at: s.recorded_at,
      saves: sSaves,
      repins: sRepins,
      comments: sComments,
      shares: Number(pin.share_count || 0),
      reactions: totalReactions,
      delta_saves: next ? (sSaves - nSaves) : 0,
      delta_repins: next ? (sRepins - nRepins) : 0,
      delta_comments: next ? (sComments - nComments) : 0,
      delta_shares: 0,
      delta_reactions: 0
    };
  });

  if (snapshots.length === 0) {
    snapshots.push({
      id: 'baseline-' + pin.pin_id,
      pin_id: pin.pin_id,
      recorded_at: pin.last_updated_at || pin.first_seen_at || new Date().toISOString(),
      saves: Number(pin.saves || 0),
      repins: Number(pin.repins || 0),
      comments: Number(pin.comments || 0),
      shares: Number(pin.share_count || 0),
      reactions: totalReactions,
      delta_saves: 0,
      delta_repins: 0,
      delta_comments: 0,
      delta_shares: 0,
      delta_reactions: 0
    });
  }

  // Calculate Net Growth
  let netGrowth = { saves: 0, repins: 0, comments: 0, shares: 0, reactions: 0 };
  if (snapshots.length >= 2) {
    const latest = snapshots[0];
    const earliest = snapshots[snapshots.length - 1];
    netGrowth = {
      saves: latest.saves - earliest.saves,
      repins: latest.repins - earliest.repins,
      comments: latest.comments - earliest.comments,
      shares: latest.shares - earliest.shares,
      reactions: latest.reactions - earliest.reactions
    };
  }

  // Format annotations
  let annotationsList = [];
  if (Array.isArray(pin.annotations)) {
    annotationsList = pin.annotations;
  } else if (typeof pin.annotations === 'string') {
    try { annotationsList = JSON.parse(pin.annotations); } catch (_) {}
  }

  return {
    pin: {
      ...pin,
      saves: Number(pin.saves || 0),
      repins: Number(pin.repins || 0),
      comments: Number(pin.comments || 0),
      share_count: Number(pin.share_count || 0),
      velocity: Number(pin.velocity || 0),
      annotations: annotationsList,
      reactions_count: totalReactions,
      dominant_color: pin.dominant_color || '#a88d56'
    },
    snapshots,
    net_growth: netGrowth
  };
}

/**
 * Delete a specific pin metric snapshot
 */
export async function deletePinMetricSnapshot(sql, snapshotId, pinId) {
  if (!snapshotId) throw new Error('snapshotId is required');
  const numId = parseInt(snapshotId, 10);
  if (isNaN(numId)) {
    return { success: false, error: 'Invalid snapshot ID' };
  }
  const deleted = await sql`
    DELETE FROM pa_pin_metrics 
    WHERE id = ${numId} AND pin_id = ${String(pinId).trim()}
    RETURNING id;
  `;
  return { success: deleted.length > 0 };
}

