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
        early_stop_pages: Number(row.early_stop_pages ?? 3),
        max_batch_pins: Number(row.max_batch_pins ?? 500),
        discovery_max_pages: Number(row.discovery_max_pages ?? 500),
        refresh_max_pins: Number(row.refresh_max_pins ?? 0),
        paused_policy: String(row.paused_policy ?? 'reject'),
        updated_at: row.updated_at
      };
    }
  } catch (_) {}
  return { ...DEFAULT_QUALIFICATION_RULES };
}

/**
 * Update and persist Pin Qualification Rules
 */
export async function updateQualificationRules(sql, rules = {}) {
  const t1Saves = Math.max(0, Number(rules.tier1_min_saves ?? 100));
  const t2Repins = Math.max(0, Number(rules.tier2_min_repins ?? 100));
  const t3Days = Math.max(1, Number(rules.tier3_max_age_days ?? 14));
  const t3Saves = Math.max(0, Number(rules.tier3_min_saves ?? 25));
  const masterEnabled = rules.master_ingest_enabled !== undefined ? Boolean(rules.master_ingest_enabled) : true;
  const earlyStop = Math.max(1, Math.min(Number(rules.early_stop_pages ?? 3), 100));
  const maxBatch = Math.max(10, Math.min(Number(rules.max_batch_pins ?? 500), 5000));
  const discMax = Math.max(1, Math.min(Number(rules.discovery_max_pages ?? 500), 2000));
  const refreshMax = Math.max(0, Number(rules.refresh_max_pins ?? 0));
  const pausedPol = String(rules.paused_policy ?? 'reject');

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

  return updated || { ...DEFAULT_QUALIFICATION_RULES, ...rules };
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

  let ageDays = Number(pin.age_days);
  if (isNaN(ageDays)) {
    const rawDate = pin.created_at_pinterest || pin.created_at;
    if (rawDate) {
      const ms = Date.now() - new Date(rawDate).getTime();
      ageDays = Math.max(0, ms / (1000 * 60 * 60 * 24));
    } else {
      ageDays = 9999;
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
  if (ageDays <= Number(rules.tier3_max_age_days ?? 14) && saves >= Number(rules.tier3_min_saves ?? 25)) {
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
export async function reEvaluateArchivedPins(sql, rules = null) {
  const activeRules = rules || (await getQualificationRules(sql));
  const [res] = await sql`
    SELECT
      count(*)::int AS total_pins,
      count(CASE 
        WHEN saves >= ${activeRules.tier1_min_saves} 
          OR repins >= ${activeRules.tier2_min_repins}
          OR (
            EXTRACT(EPOCH FROM (NOW() - created_at_pinterest))/86400 <= ${activeRules.tier3_max_age_days} 
            AND saves >= ${activeRules.tier3_min_saves}
          )
        THEN 1 
      END)::int AS qualified_pins
    FROM pa_pins;
  `;

  return {
    ok: true,
    total_evaluated: res?.total_pins || 0,
    qualified_count: res?.qualified_pins || 0,
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

  let addedCount = 0;
  let updatedCount = 0;
  let filteredCount = 0;

  for (const pin of pins) {
    const pinId = String(pin.pin_id || pin.id || '').trim();
    if (!pinId) continue;

    // Filter sub-threshold pins if qualification is active
    if (activeRules && !isPinQualified(pin, activeRules)) {
      filteredCount++;
      continue;
    }

    try {
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
      const saves = Number(pin.saves || 0);
      const repins = Number(pin.repins || saves);
      const comments = Number(pin.comments || 0);
      const shareCount = Number(pin.share_count || 0);
      const reactions = (pin.reactions && typeof pin.reactions === 'object') ? JSON.stringify(pin.reactions) : '{}';
      const velocity = Number(pin.velocity || 0);
      const annotations = Array.isArray(pin.annotations) ? JSON.stringify(pin.annotations) : '[]';
      const isVideo = Boolean(pin.is_video);
      const isProduct = Boolean(pin.is_product);
      let createdAtPinterest = new Date();
      if (pin.created_at_pinterest) {
        const d = new Date(pin.created_at_pinterest);
        if (!isNaN(d.getTime())) createdAtPinterest = d;
      }

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
          ${pinId},
          ${accountUsername},
          ${title},
          ${description},
          ${link},
          ${domain},
          ${boardName},
          ${imageUrl},
          ${dominantColor},
          ${saves},
          ${repins},
          ${comments},
          ${shareCount},
          ${reactions}::jsonb,
          ${velocity},
          ${annotations}::jsonb,
          ${isVideo},
          ${isProduct},
          ${createdAtPinterest},
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
          dominant_color = EXCLUDED.dominant_color,
          saves = GREATEST(pa_pins.saves, EXCLUDED.saves),
          repins = GREATEST(pa_pins.repins, EXCLUDED.repins),
          comments = GREATEST(pa_pins.comments, EXCLUDED.comments),
          share_count = GREATEST(pa_pins.share_count, EXCLUDED.share_count),
          reactions = EXCLUDED.reactions,
          velocity = EXCLUDED.velocity,
          annotations = CASE WHEN jsonb_typeof(EXCLUDED.annotations) = 'array' AND jsonb_array_length(EXCLUDED.annotations) > 0 THEN EXCLUDED.annotations ELSE pa_pins.annotations END,
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
          ${pinId},
          date_trunc('hour', NOW()),
          ${saves},
          ${repins},
          ${comments}
        )
        ON CONFLICT (pin_id, recorded_at) DO UPDATE SET
          saves = GREATEST(pa_pin_metrics.saves, EXCLUDED.saves),
          repins = GREATEST(pa_pin_metrics.repins, EXCLUDED.repins),
          comments = GREATEST(pa_pin_metrics.comments, EXCLUDED.comments);
      `;
    } catch (pinErr) {
      console.warn(`[ingestPinsBatch] Pin ${pinId} skipped:`, pinErr.message);
    }
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
    `,
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
export async function getTopicClusters(sql, { minPins = 1, search = '', limit = 50, offset = 0 } = {}) {
  const searchPattern = search ? search.trim() : null;

  const rows = await sql`
    SELECT
      topic_name,
      pins_count::bigint AS pins_count,
      total_saves::numeric AS total_saves,
      avg_saves::bigint AS avg_saves,
      avg_velocity::numeric AS avg_velocity
    FROM pa_topic_clusters_page(
      ${minPins},
      ${searchPattern},
      ${limit},
      ${offset}
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
 * List archived pins with filtering, topic clustering, search, and sorting
 */
export async function listArchivedPins(sql, {
  search = '',
  topic = '',
  minSaves = 0,
  account = '',
  sortBy = 'saves',
  order = 'desc',
  limit = 50,
  offset = 0
} = {}) {
  const minNum = Number(minSaves || 0);
  const lim = Math.max(1, Math.min(Number(limit || 50), 200));
  const off = Math.max(0, Number(offset || 0));
  const searchPattern = search ? `%${search.toLowerCase().trim()}%` : null;
  const topicPattern = topic ? `%${topic.toLowerCase().trim()}%` : null;
  const accountPattern = account ? `%${account.toLowerCase().replace('@', '').trim()}%` : null;
  const isAsc = String(order).toLowerCase() === 'asc';

  // Normalize sort column
  let sortColumn = 'saves';
  if (sortBy === 'velocity') sortColumn = 'velocity';
  else if (sortBy === 'created_at') sortColumn = 'created_at_pinterest';
  else if (sortBy === 'repins') sortColumn = 'repins';

  return await sql`
    SELECT *
    FROM pa_pins
    WHERE saves >= ${minNum}
      AND (${searchPattern}::text IS NULL OR (
        LOWER(title) LIKE ${searchPattern} OR
        LOWER(description) LIKE ${searchPattern} OR
        LOWER(board_name) LIKE ${searchPattern}
      ))
      AND (${topicPattern}::text IS NULL OR (
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
      AND (${accountPattern}::text IS NULL OR LOWER(account_username) LIKE ${accountPattern})
    ORDER BY
      CASE WHEN ${sortColumn} = 'saves' AND ${isAsc} THEN saves END ASC,
      CASE WHEN ${sortColumn} = 'saves' AND NOT ${isAsc} THEN saves END DESC,
      CASE WHEN ${sortColumn} = 'velocity' AND ${isAsc} THEN velocity END ASC,
      CASE WHEN ${sortColumn} = 'velocity' AND NOT ${isAsc} THEN velocity END DESC,
      CASE WHEN ${sortColumn} = 'created_at_pinterest' AND ${isAsc} THEN created_at_pinterest END ASC,
      CASE WHEN ${sortColumn} = 'created_at_pinterest' AND NOT ${isAsc} THEN created_at_pinterest END DESC,
      CASE WHEN ${sortColumn} = 'repins' AND ${isAsc} THEN repins END ASC,
      CASE WHEN ${sortColumn} = 'repins' AND NOT ${isAsc} THEN repins END DESC,
      saves DESC
    LIMIT ${lim} OFFSET ${off};
  `;
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
      WHERE NOT EXISTS (
        SELECT 1 FROM pa_staged_pins WHERE pin_id = ${cleanId} AND status = 'staged'
      )
      RETURNING *;
    `;
    if (inserted) stagedRows.push(inserted);
  }

  return { ok: true, stagedCount: stagedRows.length, staged_count: stagedRows.length, items: stagedRows };
}

/**
 * Atomic Compare-And-Swap (CAS) dispatch claim for a staged pin
 * Prevents double-posting across concurrent workers.
 */
export async function claimStagedPinCas(sql, stagedId) {
  const numericId = parseInt(stagedId, 10);
  if (isNaN(numericId)) {
    throw new Error('Invalid staged ID');
  }

  const [claimed] = await sql`
    UPDATE pa_staged_pins
    SET status = 'dispatched', updated_at = NOW()
    WHERE id = ${numericId} AND status = 'staged'
    RETURNING *;
  `;

  return {
    success: Boolean(claimed),
    item: claimed || null,
  };
}

/**
 * List all staged pins in the repurposing pipeline (supports status 'all' and individual statuses)
 */
export async function listStagedPins(sql, { status = 'all', limit = 50, offset = 0 } = {}) {
  const lim = Math.max(1, Math.min(Number(limit || 50), 200));
  const off = Math.max(0, Number(offset || 0));

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
