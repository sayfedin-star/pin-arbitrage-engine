/**
 * PinArchive Service
 * Project 4 (PinArchive & Topic Intelligence) Engine for Neon Serverless Postgres.
 *
 * Provides:
 * - Atomic pin batch ingestion into pa_pins & time-series telemetry in pa_pin_metrics.
 * - Semantic topic cluster extraction from annotations via pa_topic_clusters_page.
 * - High-speed indexed listing & filtering of archived winning pins.
 */

import { fetchPinFromPinterest } from '../../../scripts/lib/pinterest.mjs';
import { escapeSqlWildcards } from '../../utils.mjs';

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
  tier2_min_velocity: 3.5,
  tier2_max_age_days: 60,
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
        tier2_min_velocity: Number(row.tier2_min_velocity ?? 3.5),
        tier2_max_age_days: Number(row.tier2_max_age_days ?? 60),
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
  const t2Vel = Math.max(0.1, Number(rules.tier2_min_velocity ?? current.tier2_min_velocity ?? 3.5));
  const t2Days = Math.max(1, Number(rules.tier2_max_age_days ?? current.tier2_max_age_days ?? 60));
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
      tier2_min_velocity,
      tier2_max_age_days,
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
      ${t2Vel},
      ${t2Days},
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
      tier2_min_velocity = EXCLUDED.tier2_min_velocity,
      tier2_max_age_days = EXCLUDED.tier2_max_age_days,
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

  // Strict product filtering if configured in active rules
  if ((rules.articles_only === true || rules.exclude_product_pins === true) && Boolean(pin.is_product)) {
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

  // Tier 2: Sustained Virality & Velocity Breakout (Age <= 60d AND saves/age >= min_velocity, OR repins >= min_repins)
  const minVelocity = Number(rules.tier2_min_velocity ?? 3.5);
  const maxVelocityAge = Number(rules.tier2_max_age_days ?? 60);
  const pinVelocity = Number(pin.velocity || (!isNaN(ageDays) && ageDays > 0 ? (saves / ageDays) : 0));
  if (
    repins >= Number(rules.tier2_min_repins ?? 100) ||
    (!isNaN(ageDays) && ageDays > 0 && ageDays <= maxVelocityAge && (pinVelocity >= minVelocity || (saves >= 50 && pinVelocity >= 2.0)))
  ) {
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
  const cleanUser = accountUsername ? String(accountUsername).replace(/^@+/, '').trim().toLowerCase() : null;
  
  // If master ingest is disabled, no pins qualify for active ingestion (read-only evaluation)
  if (activeRules.master_ingest_enabled === false) {
    const [cnt] = await sql`
      SELECT count(*)::int AS total
      FROM pa_pins
      WHERE (${cleanUser}::text IS NULL OR LOWER(REPLACE(account_username, '@', '')) = ${cleanUser});
    `;
    const total = cnt?.total || 0;
    return {
      ok: true,
      total_evaluated: total,
      qualified_count: 0,
      disqualified_count: total,
      disqualified_pruned: 0,
      rules: activeRules
    };
  }

  const t1 = Number(activeRules.tier1_min_saves ?? 100);
  const t2 = Number(activeRules.tier2_min_repins ?? 100);
  const t2Vel = Number(activeRules.tier2_min_velocity ?? 3.5);
  const t2Days = Number(activeRules.tier2_max_age_days ?? 60);
  const t3Days = Number(activeRules.tier3_max_age_days ?? 14);
  const t3Saves = Number(activeRules.tier3_min_saves ?? 25);

  // Single-Pass SARGable CTE: evaluates, counts, and prunes unqualified pins atomically
  const [res] = await sql`
    WITH target_pins AS (
      SELECT pin_id, saves, repins, created_at_pinterest
      FROM pa_pins
      WHERE (${cleanUser}::text IS NULL OR LOWER(REPLACE(account_username, '@', '')) = ${cleanUser})
    ),
    evaluated AS (
      SELECT
        pin_id,
        (
          saves >= ${t1} 
          OR repins >= ${t2}
          OR (
            created_at_pinterest IS NOT NULL
            AND created_at_pinterest >= NOW() - (${t2Days} * INTERVAL '1 day')
            AND (saves::numeric / GREATEST(0.1, EXTRACT(EPOCH FROM (NOW() - created_at_pinterest)) / 86400.0)) >= ${t2Vel}
          )
          OR (
            created_at_pinterest IS NOT NULL
            AND created_at_pinterest >= NOW() - (${t3Days} * INTERVAL '1 day')
            AND saves >= ${t3Saves}
          )
        ) AS is_qualified
      FROM target_pins
    ),
    deleted AS (
      DELETE FROM pa_pins p
      USING evaluated e
      WHERE p.pin_id = e.pin_id AND e.is_qualified = FALSE
      RETURNING p.pin_id
    )
    SELECT
      (SELECT count(*)::int FROM target_pins) AS total_pins,
      (SELECT count(*)::int FROM evaluated WHERE is_qualified = TRUE) AS qualified_pins,
      (SELECT count(*)::int FROM deleted) AS pruned_pins;
  `;

  const total = Number(res?.total_pins || 0);
  const qualified = Number(res?.qualified_pins || 0);
  const prunedCount = Number(res?.pruned_pins || 0);
  const disqualified = Math.max(0, total - qualified);

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
    
    let reactions = {};
    if (pin.reactions && typeof pin.reactions === 'object' && !Array.isArray(pin.reactions)) {
      reactions = pin.reactions;
    } else if (typeof pin.reactions === 'string' && pin.reactions.trim().startsWith('{')) {
      try {
        reactions = JSON.parse(pin.reactions.trim());
      } catch {
        reactions = {};
      }
    }

    const velocity = Math.max(0, isNaN(Number(pin.velocity)) ? 0 : Number(pin.velocity));

    let annotations = [];
    if (Array.isArray(pin.annotations)) {
      annotations = pin.annotations.slice(0, 15);
    } else if (typeof pin.annotations === 'string' && pin.annotations.trim().startsWith('[')) {
      try {
        annotations = JSON.parse(pin.annotations.trim()).slice(0, 15);
      } catch {
        annotations = [];
      }
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

  if (!preparedPins.length) {
    return { ok: true, added: 0, inserted: 0, updated: 0, filtered: filteredCount, total: pins.length };
  }

  // Deduplicate preparedPins by pinId
  const pinMap = new Map();
  for (const p of preparedPins) {
    pinMap.set(p.pinId, p);
  }
  const dedupedPins = Array.from(pinMap.values());

  const payloadArray = dedupedPins.map(p => ({
    pin_id: p.pinId,
    account_username: cleanAccount,
    title: p.title || '',
    description: p.description || '',
    link: p.link || '',
    domain: p.domain || '',
    board_name: p.boardName || '',
    image_url: p.imageUrl || '',
    dominant_color: p.dominantColor || '#888888',
    saves: Number(p.saves || 0),
    repins: Number(p.repins || 0),
    comments: Number(p.comments || 0),
    share_count: Number(p.shareCount || 0),
    reactions: (p.reactions && typeof p.reactions === 'object' && !Array.isArray(p.reactions)) ? p.reactions : {},
    velocity: Number(p.velocity || 0),
    annotations: Array.isArray(p.annotations) ? p.annotations : [],
    is_video: Boolean(p.isVideo),
    is_product: Boolean(p.isProduct),
    created_at_pinterest: p.createdAtPinterest || null
  }));
  const jsonPayload = JSON.stringify(payloadArray);

  try {
    const buildPinsQuery = (db) => db`
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
      )
      SELECT
        u.pin_id,
        u.account_username,
        u.title,
        u.description,
        u.link,
        u.domain,
        u.board_name,
        u.image_url,
        u.dominant_color,
        u.saves,
        u.repins,
        u.comments,
        u.share_count,
        u.reactions,
        u.velocity,
        u.annotations,
        u.is_video,
        u.is_product,
        u.created_at_pinterest::timestamptz,
        NOW(),
        NOW()
      FROM (
        SELECT *
        FROM jsonb_to_recordset(${typeof db.json === 'function' ? db.json(payloadArray) : jsonPayload}::jsonb) AS raw(
          pin_id text,
          account_username text,
          title text,
          description text,
          link text,
          domain text,
          board_name text,
          image_url text,
          dominant_color text,
          saves bigint,
          repins int,
          comments int,
          share_count int,
          reactions jsonb,
          velocity numeric,
          annotations jsonb,
          is_video boolean,
          is_product boolean,
          created_at_pinterest text
        )
        ORDER BY raw.pin_id ASC
      ) u
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

    const buildMetricsQuery = (db) => db`
      INSERT INTO pa_pin_metrics (
        pin_id,
        recorded_at,
        saves,
        repins,
        comments
      )
      SELECT
        u.pin_id,
        date_trunc('hour', NOW()),
        GREATEST(u.saves, COALESCE(p.saves, 0)),
        GREATEST(u.repins, COALESCE(p.repins, 0)),
        GREATEST(u.comments, COALESCE(p.comments, 0))
      FROM (
        SELECT *
        FROM jsonb_to_recordset(${typeof db.json === 'function' ? db.json(payloadArray) : jsonPayload}::jsonb) AS raw(
          pin_id text,
          saves bigint,
          repins int,
          comments int
        )
        ORDER BY raw.pin_id ASC
      ) u
      LEFT JOIN pa_pins p ON p.pin_id = u.pin_id
      ON CONFLICT (pin_id, recorded_at) DO UPDATE SET
        saves = GREATEST(pa_pin_metrics.saves, EXCLUDED.saves),
        repins = GREATEST(pa_pin_metrics.repins, EXCLUDED.repins),
        comments = GREATEST(pa_pin_metrics.comments, EXCLUDED.comments);
    `;

    let pinRows = [];
    if (typeof sql.begin === 'function') {
      // Hyperdrive / postgres.js (TCP)
      [pinRows] = await sql.begin(async (tx) => {
        const rows = await buildPinsQuery(tx);
        await buildMetricsQuery(tx);
        return [rows];
      });
    } else if (typeof sql.transaction === 'function') {
      // Neon Serverless (HTTP) - requires array of queries
      const qPins = buildPinsQuery(sql);
      const qMetrics = buildMetricsQuery(sql);
      const res = await sql.transaction([ qPins, qMetrics ]);
      pinRows = res && res[0] ? res[0] : [];
    } else {
      pinRows = await buildPinsQuery(sql);
      await buildMetricsQuery(sql);
    }

    for (const r of (pinRows || [])) {
      if (r.is_inserted) addedCount++;
      else updatedCount++;
    }

    if (cleanAccount) {
      try {
        const [comp] = await sql`SELECT id FROM competitor_profiles WHERE LOWER(username) = ${cleanAccount} LIMIT 1;`;
        if (comp?.id) {
          await sql`
            INSERT INTO competitor_pins (
              competitor_id, pin_id, title, description, link_domain,
              destination_url, board_name, board_slug, image_url, save_count, repin_count,
              comment_count, is_product, created_at_pinterest, first_seen_at, last_seen_at, enrichment_status
            )
            SELECT 
              ${comp.id},
              u.pin_id,
              COALESCE(u.title, ''),
              COALESCE(u.description, ''),
              COALESCE(NULLIF(u.domain, ''), ''),
              COALESCE(NULLIF(u.link, ''), ''),
              COALESCE(u.board_name, ''),
              LOWER(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(u.board_name, ''), '[^[:alnum:]]+', '-', 'g'), '^-|-$', '', 'g')),
              COALESCE(u.image_url, ''),
              COALESCE(u.saves, 0)::int,
              COALESCE(u.repins, 0)::int,
              COALESCE(u.comments, 0)::int,
              COALESCE(u.is_product, false),
              u.created_at_pinterest::timestamptz,
              NOW(),
              NOW(),
              'completed'
            FROM jsonb_to_recordset(${jsonPayload}::jsonb) AS u(
              pin_id text, title text, description text, domain text, link text,
              board_name text, image_url text, saves bigint, repins int,
              comments int, is_product boolean, created_at_pinterest text
            )
            ON CONFLICT (competitor_id, pin_id) DO UPDATE SET
              title = CASE WHEN EXCLUDED.title <> '' THEN EXCLUDED.title ELSE competitor_pins.title END,
              destination_url = CASE WHEN EXCLUDED.destination_url <> '' THEN EXCLUDED.destination_url ELSE competitor_pins.destination_url END,
              link_domain = CASE WHEN EXCLUDED.link_domain <> '' THEN EXCLUDED.link_domain ELSE competitor_pins.link_domain END,
              board_name = CASE WHEN EXCLUDED.board_name <> '' THEN EXCLUDED.board_name ELSE competitor_pins.board_name END,
              save_count = GREATEST(competitor_pins.save_count, EXCLUDED.save_count),
              repin_count = GREATEST(competitor_pins.repin_count, EXCLUDED.repin_count),
              comment_count = GREATEST(competitor_pins.comment_count, EXCLUDED.comment_count),
              is_product = (competitor_pins.is_product OR EXCLUDED.is_product),
              last_seen_at = NOW();
          `.catch(() => {});
        }
      } catch (_) {}
    }
  } catch (batchErr) {
    console.warn('[ingestPinsBatch] Bulk ingest batch warning:', batchErr.message);
  }

  return { ok: true, added: addedCount, inserted: addedCount, updated: updatedCount, filtered: filteredCount, total: pins.length };
}

/**
 * Get aggregated PinArchive overview metrics
 */
export async function getPinArchiveOverview(sql) {
  const [[stats], [topCluster]] = await Promise.all([
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
      total_saves: Number(topCluster.total_saves),
    } : null
  };
}

/**
 * Get topic clusters extracted from AI annotations in Postgres
 */
export async function getTopicClusters(sql, { minPins = 1, search = '', account = '', limit = 50, offset = 0 } = {}) {
  const searchPattern = search ? escapeSqlWildcards(search.trim()) : null;
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
        ${searchPattern},
        ${lim},
        ${off}
      );
    `;

    if (!Array.isArray(rows)) return [];

    return rows.map(r => ({
      name: r.topic_name,
      pins_count: Number(r.pins_count || 0),
      total_saves: Number(r.total_saves || 0),
      avg_saves: Number(r.avg_saves || 0),
      avg_velocity: Number(r.avg_velocity || 0),
    }));
  } catch (err) {
    console.warn('[getTopicClusters] Stored procedure query failed, returning fallback empty list:', err.message);
    return [];
  }
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
  const cleanSearch = (search && typeof search === 'string' && search.trim()) ? escapeSqlWildcards(search.toLowerCase().trim()) : null;
  const searchPattern = cleanSearch ? `%${cleanSearch}%` : null;
  const cleanTopic = (topic && typeof topic === 'string' && topic.trim()) ? escapeSqlWildcards(topic.toLowerCase().trim()) : null;
  const topicPattern = cleanTopic ? `%${cleanTopic}%` : null;
  const cleanAccount = (account && typeof account === 'string' && account.trim()) ? escapeSqlWildcards(account.toLowerCase().replace('@', '').trim()) : null;
  const accountPattern = cleanAccount ? `%${cleanAccount}%` : null;
  const cleanBoard = (board && typeof board === 'string' && board.trim()) ? escapeSqlWildcards(board.toLowerCase().trim()) : null;
  const boardPattern = cleanBoard ? `%${cleanBoard}%` : null;
  const isAsc = String(order).toLowerCase() === 'asc';

  // Stage and change filters
  const stageFilter = stage ? String(stage).trim().toUpperCase() : null;
  const filterChangedOnly = Boolean(changedOnly);

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
        AND (${accountPattern}::text IS NULL OR COALESCE(LOWER(REPLACE(account_username, '@', '')), '') LIKE ${accountPattern})
        AND (
          ${stageFilter}::text IS NULL OR
          (${stageFilter} = 'DORMANT' AND velocity < 0.5) OR
          (${stageFilter} = 'COOLING' AND velocity >= 0.5 AND velocity < 2.0) OR
          (${stageFilter} = 'NEW' AND velocity >= 0.5 AND COALESCE(created_at_pinterest, first_seen_at) >= NOW() - INTERVAL '14 days') OR
          (${stageFilter} = 'GROWING' AND velocity >= 10.0 AND (COALESCE(created_at_pinterest, first_seen_at) < NOW() - INTERVAL '14 days' OR COALESCE(created_at_pinterest, first_seen_at) IS NULL)) OR
          (${stageFilter} = 'MATURE' AND velocity >= 2.0 AND velocity < 10.0 AND (COALESCE(created_at_pinterest, first_seen_at) < NOW() - INTERVAL '14 days' OR COALESCE(created_at_pinterest, first_seen_at) IS NULL))
        )
        AND (
          NOT ${filterChangedOnly} OR
          EXISTS (
            SELECT 1 FROM pa_pin_metrics m
            WHERE m.pin_id = pa_pins.pin_id
              AND m.recorded_at <= NOW() - INTERVAL '6 hours'
              AND m.recorded_at >= NOW() - INTERVAL '36 hours'
              AND (pa_pins.saves > m.saves OR pa_pins.repins > m.repins)
          )
        )
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
        AND (${accountPattern}::text IS NULL OR COALESCE(LOWER(REPLACE(account_username, '@', '')), '') LIKE ${accountPattern})
        AND (
          ${stageFilter}::text IS NULL OR
          (${stageFilter} = 'DORMANT' AND velocity < 0.5) OR
          (${stageFilter} = 'COOLING' AND velocity >= 0.5 AND velocity < 2.0) OR
          (${stageFilter} = 'NEW' AND velocity >= 0.5 AND COALESCE(created_at_pinterest, first_seen_at) >= NOW() - INTERVAL '14 days') OR
          (${stageFilter} = 'GROWING' AND velocity >= 10.0 AND (COALESCE(created_at_pinterest, first_seen_at) < NOW() - INTERVAL '14 days' OR COALESCE(created_at_pinterest, first_seen_at) IS NULL)) OR
          (${stageFilter} = 'MATURE' AND velocity >= 2.0 AND velocity < 10.0 AND (COALESCE(created_at_pinterest, first_seen_at) < NOW() - INTERVAL '14 days' OR COALESCE(created_at_pinterest, first_seen_at) IS NULL))
        )
        AND (
          NOT ${filterChangedOnly} OR
          EXISTS (
            SELECT 1 FROM pa_pin_metrics m
            WHERE m.pin_id = pa_pins.pin_id
              AND m.recorded_at <= NOW() - INTERVAL '6 hours'
              AND m.recorded_at >= NOW() - INTERVAL '36 hours'
              AND (pa_pins.saves > m.saves OR pa_pins.repins > m.repins)
          )
        );
    `
  ]);

  const now = Date.now();

  // Batch-fetch true historical time-series summaries for the retrieved page of pins
  const metricsMap = new Map();
  if (rows.length > 0) {
    try {
      const pinIds = rows.map(r => r.pin_id);
      const metricSummaryRows = await sql`
        SELECT
          u.pin_id,
          s24.saves AS saves_24h,
          s24.repins AS repins_24h,
          s3d.saves AS saves_3d,
          s7d.saves AS saves_7d
        FROM UNNEST(${pinIds}::text[]) AS u(pin_id)
        LEFT JOIN LATERAL (
          SELECT saves, repins
          FROM pa_pin_metrics m
          WHERE m.pin_id = u.pin_id
            AND m.recorded_at <= NOW() - INTERVAL '6 hours'
            AND m.recorded_at >= NOW() - INTERVAL '36 hours'
          ORDER BY ABS(EXTRACT(EPOCH FROM (m.recorded_at - (NOW() - INTERVAL '24 hours')))) ASC
          LIMIT 1
        ) s24 ON TRUE
        LEFT JOIN LATERAL (
          SELECT saves
          FROM pa_pin_metrics m
          WHERE m.pin_id = u.pin_id
            AND m.recorded_at <= NOW() - INTERVAL '60 hours'
            AND m.recorded_at >= NOW() - INTERVAL '108 hours'
          ORDER BY m.recorded_at DESC
          LIMIT 1
        ) s3d ON TRUE
        LEFT JOIN LATERAL (
          SELECT saves
          FROM pa_pin_metrics m
          WHERE m.pin_id = u.pin_id
            AND m.recorded_at <= NOW() - INTERVAL '144 hours'
            AND m.recorded_at >= NOW() - INTERVAL '204 hours'
          ORDER BY m.recorded_at DESC
          LIMIT 1
        ) s7d ON TRUE;
      `;
      for (const snap of metricSummaryRows) {
        metricsMap.set(snap.pin_id, snap);
      }
    } catch (_) {}
  }

  let mapped = rows.map(p => {
    const velocity = Number(p.velocity || 0);
    const createdDate = p.created_at_pinterest ? new Date(p.created_at_pinterest) : (p.first_seen_at ? new Date(p.first_seen_at) : new Date());
    const ageDays = Math.max(1, Math.round((now - createdDate.getTime()) / 86400000));
    
    // Genuine growth deltas calculation directly from summary object
    const snap = metricsMap.get(p.pin_id);
    const curSaves = Number(p.saves || 0);
    const curRepins = Number(p.repins || 0);
    const deltaSaves = snap?.saves_24h != null ? Math.max(0, curSaves - Number(snap.saves_24h)) : 0;
    const deltaRepins = snap?.repins_24h != null ? Math.max(0, curRepins - Number(snap.repins_24h)) : 0;
    const deltaSaves3d = snap?.saves_3d != null ? Math.max(0, curSaves - Number(snap.saves_3d)) : deltaSaves;
    const deltaSaves7d = snap?.saves_7d != null ? Math.max(0, curSaves - Number(snap.saves_7d)) : deltaSaves3d;

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

  // Since SQL has already filtered by stage and changedOnly correctly with SARGable index predicates,
  // we do not truncate post-LIMIT in JS, preserving correct page lengths and total counts.
  mapped.total = countRow ? countRow.total : mapped.length;
  return mapped;
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
            saves = GREATEST(pa_pins.saves, EXCLUDED.saves),
            repins = GREATEST(pa_pins.repins, EXCLUDED.repins),
            comments = GREATEST(pa_pins.comments, EXCLUDED.comments),
            share_count = GREATEST(pa_pins.share_count, EXCLUDED.share_count),
            reactions = CASE 
              WHEN jsonb_typeof(EXCLUDED.reactions) = 'object' AND EXCLUDED.reactions <> '{}'::jsonb 
              THEN EXCLUDED.reactions 
              ELSE pa_pins.reactions 
            END,
            annotations = CASE 
              WHEN jsonb_typeof(EXCLUDED.annotations) = 'array' AND jsonb_array_length(EXCLUDED.annotations) > 0 
              THEN EXCLUDED.annotations 
              ELSE pa_pins.annotations 
            END,
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

        // Record live metric snapshot with monotonic ratchet protection
        await sql`
          INSERT INTO pa_pin_metrics (pin_id, recorded_at, saves, repins, comments)
          VALUES (
            ${cleanId},
            date_trunc('hour', NOW()),
            GREATEST(${live.saves || 0}, COALESCE((SELECT saves FROM pa_pins WHERE pin_id = ${cleanId}), 0)),
            GREATEST(${live.repins || 0}, COALESCE((SELECT repins FROM pa_pins WHERE pin_id = ${cleanId}), 0)),
            GREATEST(${live.comments || 0}, COALESCE((SELECT comments FROM pa_pins WHERE pin_id = ${cleanId}), 0))
          )
          ON CONFLICT (pin_id, recorded_at) DO UPDATE SET
            saves = GREATEST(pa_pin_metrics.saves, EXCLUDED.saves),
            repins = GREATEST(pa_pin_metrics.repins, EXCLUDED.repins),
            comments = GREATEST(pa_pin_metrics.comments, EXCLUDED.comments);
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

