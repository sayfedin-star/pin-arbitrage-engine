/**
 * Unified Single-Database Pin Repository (SSOT)
 *
 * Strictly isolates the three core pin lifecycle operations:
 * 1. First-Time Save (`insertNewPinsBatch`): Fast `ON CONFLICT (pin_id) DO NOTHING` discovery insert
 *    plus opening snapshot in `pins_daily_metrics`. Zero row-lock contention or regex/JSONB merge overhead.
 * 2. Re-Save / Metric Refresh (`resavePinsMetricsBatch`): Direct metric & velocity update on existing pins
 *    plus today's snapshot in `pins_daily_metrics` without mutating `first_discovered_at`.
 * 3. Atomic Batch Ingest (`ingestPinsBatch`): Unified CTE ingestion calculating SQL velocity and
 *    upserting master pins, daily metrics, and SERP positions in a single transaction.
 * 4. Pure Read-Only Dossier (`getPinDossier`): Single-roundtrip read of pin creative, algorithmic intelligence,
 *    creator context, keywords context, and 30-day trajectory with ZERO read-path database writes.
 */

import { calculateDailyVelocity } from '../../lib/math.mjs';
import { buildRichPinMetadataPayload } from '../../domain/pin-intelligence.mjs';

/**
 * Normalizes a raw domain or URL into an index-friendly lowercase domain without `www.`.
 *
 * @param {string} rawDomainOrUrl
 * @returns {string}
 */
export function normalizeCleanDomain(rawDomainOrUrl) {
  if (!rawDomainOrUrl || typeof rawDomainOrUrl !== 'string') return '';
  const trimmed = rawDomainOrUrl.trim().toLowerCase();
  if (!trimmed) return '';
  if (trimmed === 'uploaded by user' || trimmed === 'uploaded-by-user' || trimmed === 'organic') {
    return 'uploaded by user';
  }
  return trimmed
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[/?#].*$/, '')
    .trim();
}

/**
 * 1. First-Time Save (`insertNewPinsBatch` - الحفظ لأول مرة)
 * Dedicated strictly to newly discovered pins from SERP or competitor crawls.
 * Executes `INSERT INTO universal_master_pins ... ON CONFLICT (pin_id) DO NOTHING`
 * and records the initial daily snapshot in `pins_daily_metrics`.
 *
 * @param {Function} sql - Unified PostgreSQL client
 * @param {Array<object>} pins - Array of newly discovered pin objects
 * @param {string} [pillar='keyword'] - Discovery pillar identifier
 * @returns {Promise<{ inserted: number }>}
 */
export async function insertNewPinsBatch(sql, pins = [], pillar = 'keyword') {
  if (!Array.isArray(pins) || pins.length === 0) {
    return { inserted: 0 };
  }

  const dedupMap = new Map();
  for (const p of pins) {
    const pid = String(p?.pin_id || p?.id || '').trim();
    if (!pid) continue;
    if (!dedupMap.has(pid)) {
      const domainRaw = String(p.domain || p.link_domain || '').trim();
      const destUrl = String(p.destination_url || p.link || '').trim();
      const cleanDomain = normalizeCleanDomain(domainRaw || destUrl);
      const richMeta = buildRichPinMetadataPayload(p);
      const rawSaves = p.save_count ?? p.saves;
      const isUnhydrated = (rawSaves === null || rawSaves === undefined) || (p.has_explicit_saves === false && Number(rawSaves || 0) === 0);
      const saveCount = isUnhydrated ? null : Math.max(0, Number(rawSaves || 0));

      dedupMap.set(pid, {
        pin_id: pid,
        creator_username: String(p.creator_username || p.account_username || '').replace(/^@/, '').trim().toLowerCase(),
        board_name: String(p.board_name || '').trim(),
        board_slug: String(p.board_slug || '').trim(),
        title: String(p.title || '').trim(),
        domain: cleanDomain || domainRaw,
        clean_domain: cleanDomain,
        destination_url: destUrl,
        image_url: String(p.image_url || '').trim(),
        description: String(p.description || '').trim(),
        alt_text: String(p.alt_text || '').trim(),
        dominant_color: String(p.dominant_color || '#888888').trim(),
        visual_annotations: Array.isArray(p.visual_annotations)
          ? p.visual_annotations
          : (Array.isArray(p.annotations) ? p.annotations : []),
        created_at_pinterest: p.created_at_pinterest ? new Date(p.created_at_pinterest).toISOString() : null,
        save_count: saveCount,
        repin_count: Math.max(0, Number(p.repin_count ?? p.repins ?? 0)),
        comment_count: Math.max(0, Number(p.comment_count ?? p.comments ?? 0)),
        share_count: Math.max(0, Number(p.share_count ?? p.shares ?? 0)),
        reaction_count: Math.max(0, Number(p.reaction_count ?? 0)),
        daily_save_velocity: 0,
        is_product: Boolean(p.is_product || richMeta.is_product),
        is_video: Boolean(p.is_video || richMeta.is_video),
        creation_method: String(p.creation_method || richMeta.creation_method || 'pinterest_platform'),
        image_signature: richMeta.image_signature ? String(richMeta.image_signature) : null,
        canonical_pin_id: richMeta.canonical_pin_id ? String(richMeta.canonical_pin_id) : null,
        first_discovered_pillar: String(pillar || 'keyword'),
        keyword_id: p.keyword_id != null ? Number(p.keyword_id) : null,
        rank_position: p.rank_position != null ? Number(p.rank_position) : null,
        is_displaced: Boolean(p.is_displaced),
        last_known_rank: p.last_known_rank != null ? Number(p.last_known_rank) : null,
        catalog_rank: p.catalog_rank != null ? Number(p.catalog_rank) : (p.rank_position != null ? Number(p.rank_position) : null),
        metadata: richMeta
      });
    }
  }

  const rows = Array.from(dedupMap.values()).sort((a, b) => a.pin_id.localeCompare(b.pin_id));
  if (rows.length === 0) return { inserted: 0 };

  const payloadJson = JSON.stringify(rows);

  const insertedRows = await sql`
    WITH ins_pins AS (
      INSERT INTO universal_master_pins (
        pin_id, creator_username, board_name, board_slug, title, domain, clean_domain, destination_url,
        image_url, description, alt_text, dominant_color, visual_annotations, created_at_pinterest,
        save_count, repin_count, comment_count, share_count, reaction_count, daily_save_velocity,
        delta_saves_24h, delta_repins_24h,
        is_product, is_video, creation_method, image_signature, canonical_pin_id,
        first_discovered_pillar, first_discovered_at, first_saved_at, last_resaved_at, last_scraped_at, updated_at, metadata
      )
      SELECT
        u.pin_id, u.creator_username, u.board_name, u.board_slug, u.title, u.domain,
        COALESCE(NULLIF(u.clean_domain, ''), LOWER(REGEXP_REPLACE(TRIM(COALESCE(u.domain, '')), '^www\.', ''))),
        u.destination_url,
        u.image_url, u.description, u.alt_text, u.dominant_color, u.visual_annotations,
        NULLIF(TRIM(u.created_at_pinterest), '')::timestamptz,
        u.save_count, u.repin_count, u.comment_count, u.share_count, u.reaction_count, 0,
        0, 0,
        u.is_product, u.is_video, u.creation_method, u.image_signature, u.canonical_pin_id,
        u.first_discovered_pillar, NOW(), NOW(), NOW(), NOW(), NOW(), u.metadata
      FROM jsonb_to_recordset(${payloadJson}::jsonb) AS u(
        pin_id text, creator_username text, board_name text, board_slug text, title text, domain text, clean_domain text,
        destination_url text, image_url text, description text, alt_text text, dominant_color text,
        visual_annotations jsonb, created_at_pinterest text,
        save_count bigint, repin_count bigint, comment_count int, share_count int, reaction_count int,
        daily_save_velocity numeric, is_product boolean, is_video boolean, creation_method text,
        image_signature text, canonical_pin_id text, first_discovered_pillar text, metadata jsonb
      )
      ORDER BY u.pin_id ASC
      ON CONFLICT (pin_id) DO NOTHING
      RETURNING pin_id
    ),
    ins_metrics AS (
      INSERT INTO pins_daily_metrics (
        pin_id, snapshot_date, save_count, repin_count, comment_count, share_count, reaction_count, daily_save_velocity, updated_at
      )
      SELECT
        u.pin_id,
        (NOW() AT TIME ZONE 'UTC')::date,
        COALESCE(u.save_count, 0),
        COALESCE(u.repin_count, 0),
        COALESCE(u.comment_count, 0),
        COALESCE(u.share_count, 0),
        COALESCE(u.reaction_count, 0),
        0,
        NOW()
      FROM jsonb_to_recordset(${payloadJson}::jsonb) AS u(
        pin_id text, save_count bigint, repin_count bigint, comment_count int, share_count int, reaction_count int, daily_save_velocity numeric
      )
      ORDER BY u.pin_id ASC
      ON CONFLICT (pin_id, snapshot_date) DO NOTHING
    )
    SELECT pin_id FROM ins_pins;
  `;

  if (rows.some(r => r.keyword_id && r.keyword_id > 0)) {
    await upsertPinSerpPositionsBatch(sql, payloadJson);
  }

  return { inserted: Array.isArray(insertedRows) ? insertedRows.length : 0 };
}

/**
 * Helper to upsert daily SERP rank positions (`pin_serp_positions`) when ranking telemetry is present.
 *
 * @param {Function} sql - Unified PostgreSQL client
 * @param {string} payloadJson - Serialized JSON array of pin rows containing keyword_id
 */
async function upsertPinSerpPositionsBatch(sql, payloadJson) {
  await sql`
    INSERT INTO pin_serp_positions (
      pin_id, snapshot_date, keyword_id, rank_position, is_displaced,
      last_known_rank, catalog_rank, updated_at
    )
    SELECT DISTINCT ON (u.pin_id, u.keyword_id)
      u.pin_id,
      (NOW() AT TIME ZONE 'UTC')::date,
      u.keyword_id,
      u.rank_position,
      COALESCE(u.is_displaced, FALSE),
      u.last_known_rank,
      u.catalog_rank,
      NOW()
    FROM jsonb_to_recordset(${payloadJson}::jsonb) AS u(
      pin_id text, keyword_id int, rank_position int, is_displaced boolean, last_known_rank int, catalog_rank int
    )
    WHERE u.keyword_id IS NOT NULL AND u.keyword_id > 0
    ORDER BY u.pin_id ASC, u.keyword_id ASC
    ON CONFLICT (pin_id, snapshot_date, keyword_id) DO UPDATE SET
      rank_position = CASE WHEN EXCLUDED.is_displaced = TRUE THEN NULL ELSE EXCLUDED.rank_position END,
      is_displaced = EXCLUDED.is_displaced,
      last_known_rank = COALESCE(EXCLUDED.last_known_rank, pin_serp_positions.last_known_rank),
      catalog_rank = COALESCE(EXCLUDED.catalog_rank, pin_serp_positions.catalog_rank),
      updated_at = NOW();
  `;
}

/**
 * 2. Re-Save / Refresh Metrics (`resavePinsMetricsBatch` - إعادة الحفظ وتحديث الأرقام)
 * Updates existing pins with fresh metrics and authentic daily velocity (`MAX(0, (curr - prev) / days)`),
 * and upserts today's snapshot into `pins_daily_metrics` without mutating `first_discovered_at`.
 *
 * @param {Function} sql - Unified PostgreSQL client
 * @param {Array<object>} pins - Array of refreshed pin metric payloads
 * @returns {Promise<{ updated: number }>}
 */
export async function resavePinsMetricsBatch(sql, pins = []) {
  if (!Array.isArray(pins) || pins.length === 0) {
    return { updated: 0 };
  }

  const dedupMap = new Map();
  for (const p of pins) {
    const pid = String(p?.pin_id || p?.id || '').trim();
    if (!pid) continue;
    const domainRaw = String(p.domain || p.link_domain || '').trim();
    const destUrl = String(p.destination_url || p.link || '').trim();
    const cleanDomain = normalizeCleanDomain(domainRaw || destUrl);
    dedupMap.set(pid, {
      pin_id: pid,
      domain: cleanDomain || domainRaw || null,
      clean_domain: cleanDomain || null,
      keyword_id: p.keyword_id != null ? Number(p.keyword_id) : null,
      rank_position: p.rank_position != null ? Number(p.rank_position) : null,
      is_displaced: Boolean(p.is_displaced),
      last_known_rank: p.last_known_rank != null ? Number(p.last_known_rank) : null,
      catalog_rank: p.catalog_rank != null ? Number(p.catalog_rank) : (p.rank_position != null ? Number(p.rank_position) : null),
      save_count: Math.max(0, Number(p.save_count ?? p.saves ?? 0)),
      repin_count: Math.max(0, Number(p.repin_count ?? p.repins ?? 0)),
      comment_count: Math.max(0, Number(p.comment_count ?? p.comments ?? 0)),
      share_count: Math.max(0, Number(p.share_count ?? p.shares ?? 0)),
      reaction_count: Math.max(0, Number(p.reaction_count ?? 0)),
      daily_save_velocity: p.daily_save_velocity != null ? Number(p.daily_save_velocity) : (p.velocity != null ? Number(p.velocity) : null),
      delta_repins_24h: p.delta_repins_24h != null ? Number(p.delta_repins_24h) : null,
      gains_5d: p.gains_5d != null ? Number(p.gains_5d) : null,
      gains_7d: p.gains_7d != null ? Number(p.gains_7d) : null,
      gains_10d: p.gains_10d != null ? Number(p.gains_10d) : null,
      gains_15d: p.gains_15d != null ? Number(p.gains_15d) : null,
      created_at_pinterest: p.created_at_pinterest ? new Date(p.created_at_pinterest).toISOString() : null
    });
  }

  const sorted = Array.from(dedupMap.values()).sort((a, b) => a.pin_id.localeCompare(b.pin_id));
  if (sorted.length === 0) return { updated: 0 };

  const payloadJson = JSON.stringify(sorted);

  const updatedRows = await sql`
    WITH raw_batch AS (
      SELECT *
      FROM jsonb_to_recordset(${payloadJson}::jsonb) AS u(
        pin_id text,
        domain text,
        clean_domain text,
        save_count bigint,
        repin_count bigint,
        comment_count int,
        share_count int,
        reaction_count int,
        daily_save_velocity numeric,
        delta_repins_24h int,
        gains_5d int,
        gains_7d int,
        gains_10d int,
        gains_15d int,
        created_at_pinterest text
      )
    ),
    computed_batch AS (
      SELECT
        rb.*,
        CASE
          WHEN prev.save_count IS NOT NULL AND prev.save_count > 0 THEN
            CASE
              WHEN rb.daily_save_velocity IS NOT NULL THEN GREATEST(0::numeric, rb.daily_save_velocity)
              WHEN prev.snapshot_date IS NOT NULL THEN
                ROUND(
                  GREATEST(0, rb.save_count - prev.save_count)::numeric
                  / GREATEST(1, ((NOW() AT TIME ZONE 'UTC')::date - prev.snapshot_date)),
                  2
                )
              ELSE 0::numeric
            END
          ELSE 0::numeric
        END AS effective_velocity,
        CASE
          WHEN prev.save_count IS NOT NULL AND prev.save_count > 0 THEN
            GREATEST(0, (rb.save_count - prev.save_count))::bigint
          ELSE 0::bigint
        END AS true_delta_saves_24h
      FROM raw_batch rb
      LEFT JOIN LATERAL (
        SELECT pm.save_count, pm.snapshot_date
        FROM pins_daily_metrics pm
        WHERE pm.pin_id = rb.pin_id
          AND pm.snapshot_date < (NOW() AT TIME ZONE 'UTC')::date
        ORDER BY pm.snapshot_date DESC
        LIMIT 1
      ) prev ON TRUE
    ),
    upd_master AS (
      UPDATE universal_master_pins ump
      SET
        domain = COALESCE(NULLIF(cb.domain, ''), ump.domain),
        clean_domain = COALESCE(NULLIF(cb.clean_domain, ''), NULLIF(ump.clean_domain, ''), LOWER(REGEXP_REPLACE(TRIM(COALESCE(cb.domain, ump.domain, '')), '^www\.', ''))),
        save_count = CASE WHEN cb.save_count > 0 THEN cb.save_count ELSE ump.save_count END,
        repin_count = CASE WHEN cb.repin_count > 0 THEN cb.repin_count ELSE ump.repin_count END,
        comment_count = CASE WHEN cb.comment_count > 0 THEN cb.comment_count ELSE ump.comment_count END,
        share_count = CASE WHEN cb.share_count > 0 THEN cb.share_count ELSE ump.share_count END,
        reaction_count = CASE WHEN cb.reaction_count > 0 THEN cb.reaction_count ELSE ump.reaction_count END,
        daily_save_velocity = cb.effective_velocity,
        delta_saves_24h = cb.true_delta_saves_24h,
        delta_repins_24h = COALESCE(cb.delta_repins_24h, ump.delta_repins_24h, 0),
        gains_5d = COALESCE(cb.gains_5d, ump.gains_5d, 0),
        gains_7d = COALESCE(cb.gains_7d, ump.gains_7d, 0),
        gains_10d = COALESCE(cb.gains_10d, ump.gains_10d, 0),
        gains_15d = COALESCE(cb.gains_15d, ump.gains_15d, 0),
        created_at_pinterest = COALESCE(ump.created_at_pinterest, NULLIF(TRIM(cb.created_at_pinterest), '')::timestamptz),
        last_resaved_at = NOW(),
        last_scraped_at = NOW(),
        updated_at = NOW()
      FROM computed_batch cb
      WHERE ump.pin_id = cb.pin_id
      RETURNING ump.pin_id
    ),
    upsert_daily AS (
      INSERT INTO pins_daily_metrics (
        pin_id, snapshot_date, save_count, repin_count, comment_count, share_count, reaction_count, daily_save_velocity, updated_at
      )
      SELECT
        cb.pin_id,
        (NOW() AT TIME ZONE 'UTC')::date,
        COALESCE(cb.save_count, 0),
        COALESCE(cb.repin_count, 0),
        COALESCE(cb.comment_count, 0),
        COALESCE(cb.share_count, 0),
        COALESCE(cb.reaction_count, 0),
        COALESCE(cb.effective_velocity, 0),
        NOW()
      FROM computed_batch cb
      ORDER BY cb.pin_id ASC
      ON CONFLICT (pin_id, snapshot_date) DO UPDATE SET
        save_count = CASE WHEN EXCLUDED.save_count > 0 THEN EXCLUDED.save_count ELSE pins_daily_metrics.save_count END,
        repin_count = CASE WHEN EXCLUDED.repin_count > 0 THEN EXCLUDED.repin_count ELSE pins_daily_metrics.repin_count END,
        comment_count = CASE WHEN EXCLUDED.comment_count > 0 THEN EXCLUDED.comment_count ELSE pins_daily_metrics.comment_count END,
        share_count = CASE WHEN EXCLUDED.share_count > 0 THEN EXCLUDED.share_count ELSE pins_daily_metrics.share_count END,
        reaction_count = CASE WHEN EXCLUDED.reaction_count > 0 THEN EXCLUDED.reaction_count ELSE pins_daily_metrics.reaction_count END,
        daily_save_velocity = EXCLUDED.daily_save_velocity,
        updated_at = NOW()
    )
    SELECT pin_id FROM upd_master;
  `;

  if (sorted.some(r => r.keyword_id && r.keyword_id > 0)) {
    await upsertPinSerpPositionsBatch(sql, payloadJson);
  }

  return { updated: Array.isArray(updatedRows) ? updatedRows.length : 0 };
}

/**
 * 3. Atomic Batch Ingest (`ingestPinsBatch` - الاستيعاب الذري الشامل)
 * Unified CTE ingestion calculating SQL velocity and upserting master pins,
 * daily metrics, and SERP positions in a single transaction.
 *
 * @param {Function} sql - Unified PostgreSQL client
 * @param {Array<object>} pins - Array of pins from crawlers/scrapers
 * @param {object} [options={}] - Options (e.g. pillar)
 * @returns {Promise<{ ingested: number, inserted: number, updated: number }>}
 */
export async function ingestPinsBatch(sql, pins = [], options = {}) {
  if (!Array.isArray(pins) || pins.length === 0) {
    return { ingested: 0, inserted: 0, updated: 0 };
  }
  const pillar = String(options.pillar || 'keyword');

  const dedupMap = new Map();
  for (const p of pins) {
    const pid = String(p?.pin_id || p?.id || '').trim();
    if (!pid) continue;
    if (!dedupMap.has(pid)) {
      const domainRaw = String(p.domain || p.link_domain || '').trim();
      const destUrl = String(p.destination_url || p.link || '').trim();
      const cleanDomain = normalizeCleanDomain(domainRaw || destUrl);
      const richMeta = buildRichPinMetadataPayload(p);
      const rawSaves = p.save_count ?? p.saves;
      const isUnhydrated = (rawSaves === null || rawSaves === undefined) || (p.has_explicit_saves === false && Number(rawSaves || 0) === 0);
      const saveCount = isUnhydrated ? null : Math.max(0, Number(rawSaves || 0));

      dedupMap.set(pid, {
        pin_id: pid,
        creator_username: String(p.creator_username || p.account_username || '').replace(/^@/, '').trim().toLowerCase(),
        board_name: String(p.board_name || '').trim(),
        board_slug: String(p.board_slug || '').trim(),
        title: String(p.title || '').trim(),
        domain: cleanDomain || domainRaw,
        clean_domain: cleanDomain,
        destination_url: destUrl,
        image_url: String(p.image_url || '').trim(),
        description: String(p.description || '').trim(),
        alt_text: String(p.alt_text || '').trim(),
        dominant_color: String(p.dominant_color || '#888888').trim(),
        visual_annotations: Array.isArray(p.visual_annotations)
          ? p.visual_annotations
          : (Array.isArray(p.annotations) ? p.annotations : []),
        created_at_pinterest: p.created_at_pinterest ? new Date(p.created_at_pinterest).toISOString() : null,
        save_count: saveCount,
        repin_count: Math.max(0, Number(p.repin_count ?? p.repins ?? 0)),
        comment_count: Math.max(0, Number(p.comment_count ?? p.comments ?? 0)),
        share_count: Math.max(0, Number(p.share_count ?? p.shares ?? 0)),
        reaction_count: Math.max(0, Number(p.reaction_count ?? 0)),
        daily_save_velocity: p.daily_save_velocity != null ? Number(p.daily_save_velocity) : (p.velocity != null ? Number(p.velocity) : null),
        is_product: Boolean(p.is_product || richMeta.is_product),
        is_video: Boolean(p.is_video || richMeta.is_video),
        creation_method: String(p.creation_method || richMeta.creation_method || 'pinterest_platform'),
        image_signature: richMeta.image_signature ? String(richMeta.image_signature) : null,
        canonical_pin_id: richMeta.canonical_pin_id ? String(richMeta.canonical_pin_id) : null,
        first_discovered_pillar: pillar,
        keyword_id: p.keyword_id != null ? Number(p.keyword_id) : null,
        rank_position: p.rank_position != null ? Number(p.rank_position) : null,
        is_displaced: Boolean(p.is_displaced),
        last_known_rank: p.last_known_rank != null ? Number(p.last_known_rank) : null,
        catalog_rank: p.catalog_rank != null ? Number(p.catalog_rank) : (p.rank_position != null ? Number(p.rank_position) : null),
        metadata: richMeta
      });
    }
  }

  const rows = Array.from(dedupMap.values()).sort((a, b) => a.pin_id.localeCompare(b.pin_id));
  if (rows.length === 0) return { ingested: 0, inserted: 0, updated: 0 };

  const payloadJson = JSON.stringify(rows);

  const res = await sql`
    WITH raw_batch AS (
      SELECT *
      FROM jsonb_to_recordset(${payloadJson}::jsonb) AS u(
        pin_id text, creator_username text, board_name text, board_slug text, title text, domain text, clean_domain text,
        destination_url text, image_url text, description text, alt_text text, dominant_color text,
        visual_annotations jsonb, created_at_pinterest text,
        save_count bigint, repin_count bigint, comment_count int, share_count int, reaction_count int,
        daily_save_velocity numeric, is_product boolean, is_video boolean, creation_method text,
        image_signature text, canonical_pin_id text, first_discovered_pillar text, metadata jsonb
      )
    ),
    computed_batch AS (
      SELECT
        rb.*,
        CASE
          WHEN prev.save_count IS NOT NULL AND prev.save_count > 0 THEN
            CASE
              WHEN rb.daily_save_velocity IS NOT NULL THEN GREATEST(0::numeric, rb.daily_save_velocity)
              WHEN prev.snapshot_date IS NOT NULL THEN
                ROUND(
                  GREATEST(0, COALESCE(rb.save_count, 0) - prev.save_count)::numeric
                  / GREATEST(1, ((NOW() AT TIME ZONE 'UTC')::date - prev.snapshot_date)),
                  2
                )
              ELSE 0::numeric
            END
          ELSE 0::numeric
        END AS effective_velocity,
        CASE
          WHEN prev.save_count IS NOT NULL AND prev.save_count > 0 THEN
            GREATEST(0, (COALESCE(rb.save_count, 0) - prev.save_count))::bigint
          ELSE 0::bigint
        END AS true_delta_saves_24h
      FROM raw_batch rb
      LEFT JOIN LATERAL (
        SELECT pm.save_count, pm.snapshot_date
        FROM pins_daily_metrics pm
        WHERE pm.pin_id = rb.pin_id
          AND pm.snapshot_date < (NOW() AT TIME ZONE 'UTC')::date
        ORDER BY pm.snapshot_date DESC
        LIMIT 1
      ) prev ON TRUE
    ),
    upsert_pins AS (
      INSERT INTO universal_master_pins (
        pin_id, creator_username, board_name, board_slug, title, domain, clean_domain, destination_url,
        image_url, description, alt_text, dominant_color, visual_annotations, created_at_pinterest,
        save_count, repin_count, comment_count, share_count, reaction_count, daily_save_velocity,
        delta_saves_24h, delta_repins_24h,
        is_product, is_video, creation_method, image_signature, canonical_pin_id,
        first_discovered_pillar, first_discovered_at, first_saved_at, last_resaved_at, last_scraped_at, updated_at, metadata
      )
      SELECT
        cb.pin_id, cb.creator_username, cb.board_name, cb.board_slug, cb.title, cb.domain,
        COALESCE(NULLIF(cb.clean_domain, ''), LOWER(REGEXP_REPLACE(TRIM(COALESCE(cb.domain, '')), '^www\.', ''))),
        cb.destination_url,
        cb.image_url, cb.description, cb.alt_text, cb.dominant_color, cb.visual_annotations,
        NULLIF(TRIM(cb.created_at_pinterest), '')::timestamptz,
        cb.save_count, cb.repin_count, cb.comment_count, cb.share_count, cb.reaction_count, cb.effective_velocity,
        cb.true_delta_saves_24h, 0,
        cb.is_product, cb.is_video, cb.creation_method, cb.image_signature, cb.canonical_pin_id,
        cb.first_discovered_pillar, NOW(), NOW(), NOW(), NOW(), NOW(), cb.metadata
      FROM computed_batch cb
      ORDER BY cb.pin_id ASC
      ON CONFLICT (pin_id) DO UPDATE SET
        creator_username = COALESCE(NULLIF(EXCLUDED.creator_username, ''), universal_master_pins.creator_username),
        board_name = COALESCE(NULLIF(EXCLUDED.board_name, ''), universal_master_pins.board_name),
        board_slug = COALESCE(NULLIF(EXCLUDED.board_slug, ''), universal_master_pins.board_slug),
        title = COALESCE(NULLIF(EXCLUDED.title, ''), universal_master_pins.title),
        domain = COALESCE(NULLIF(EXCLUDED.domain, ''), universal_master_pins.domain),
        clean_domain = COALESCE(NULLIF(EXCLUDED.clean_domain, ''), universal_master_pins.clean_domain),
        destination_url = COALESCE(NULLIF(EXCLUDED.destination_url, ''), universal_master_pins.destination_url),
        image_url = COALESCE(NULLIF(EXCLUDED.image_url, ''), universal_master_pins.image_url),
        description = COALESCE(NULLIF(EXCLUDED.description, ''), universal_master_pins.description),
        alt_text = COALESCE(NULLIF(EXCLUDED.alt_text, ''), universal_master_pins.alt_text),
        dominant_color = CASE WHEN EXCLUDED.dominant_color NOT IN ('', '#888888') THEN EXCLUDED.dominant_color ELSE universal_master_pins.dominant_color END,
        visual_annotations = CASE WHEN jsonb_array_length(COALESCE(EXCLUDED.visual_annotations, '[]'::jsonb)) > 0 THEN EXCLUDED.visual_annotations ELSE universal_master_pins.visual_annotations END,
        save_count = CASE WHEN EXCLUDED.save_count IS NOT NULL AND EXCLUDED.save_count > 0 THEN EXCLUDED.save_count ELSE universal_master_pins.save_count END,
        repin_count = CASE WHEN EXCLUDED.repin_count > 0 THEN EXCLUDED.repin_count ELSE universal_master_pins.repin_count END,
        comment_count = CASE WHEN EXCLUDED.comment_count > 0 THEN EXCLUDED.comment_count ELSE universal_master_pins.comment_count END,
        share_count = CASE WHEN EXCLUDED.share_count > 0 THEN EXCLUDED.share_count ELSE universal_master_pins.share_count END,
        reaction_count = CASE WHEN EXCLUDED.reaction_count > 0 THEN EXCLUDED.reaction_count ELSE universal_master_pins.reaction_count END,
        daily_save_velocity = EXCLUDED.daily_save_velocity,
        delta_saves_24h = EXCLUDED.delta_saves_24h,
        last_resaved_at = NOW(),
        last_scraped_at = NOW(),
        updated_at = NOW()
      RETURNING pin_id, (xmax = 0) AS is_insert
    ),
    upsert_daily AS (
      INSERT INTO pins_daily_metrics (
        pin_id, snapshot_date, save_count, repin_count, comment_count, share_count, reaction_count, daily_save_velocity, updated_at
      )
      SELECT
        cb.pin_id,
        (NOW() AT TIME ZONE 'UTC')::date,
        COALESCE(cb.save_count, 0),
        COALESCE(cb.repin_count, 0),
        COALESCE(cb.comment_count, 0),
        COALESCE(cb.share_count, 0),
        COALESCE(cb.reaction_count, 0),
        COALESCE(cb.effective_velocity, 0),
        NOW()
      FROM computed_batch cb
      ORDER BY cb.pin_id ASC
      ON CONFLICT (pin_id, snapshot_date) DO UPDATE SET
        save_count = CASE WHEN EXCLUDED.save_count > 0 THEN EXCLUDED.save_count ELSE pins_daily_metrics.save_count END,
        repin_count = CASE WHEN EXCLUDED.repin_count > 0 THEN EXCLUDED.repin_count ELSE pins_daily_metrics.repin_count END,
        comment_count = CASE WHEN EXCLUDED.comment_count > 0 THEN EXCLUDED.comment_count ELSE pins_daily_metrics.comment_count END,
        share_count = CASE WHEN EXCLUDED.share_count > 0 THEN EXCLUDED.share_count ELSE pins_daily_metrics.share_count END,
        reaction_count = CASE WHEN EXCLUDED.reaction_count > 0 THEN EXCLUDED.reaction_count ELSE pins_daily_metrics.reaction_count END,
        daily_save_velocity = EXCLUDED.daily_save_velocity,
        updated_at = NOW()
    )
    SELECT pin_id, is_insert FROM upsert_pins;
  `;

  if (rows.some(r => r.keyword_id && r.keyword_id > 0)) {
    await upsertPinSerpPositionsBatch(sql, payloadJson);
  }

  const inserted = Array.isArray(res) ? res.filter(r => r.is_insert).length : 0;
  const updated = Array.isArray(res) ? res.filter(r => !r.is_insert).length : 0;
  return { ingested: Array.isArray(res) ? res.length : 0, inserted, updated };
}

/**
 * 4. Pure Read-Only Pin Dossier (`getPinDossier` - القراءة الصافية السريعة)
 * Single canonical dossier retrieval function returning:
 * - creative
 * - algorithmic_intelligence
 * - pillar_1_creator_context
 * - pillar_2_keywords_context
 * - snapshots (and daily_trajectory)
 *
 * @param {Function} sql - Unified PostgreSQL client
 * @param {string|number} pinId - Target Pin ID
 * @returns {Promise<object|null>}
 */
export async function getPinDossier(sql, pinId) {
  const cleanPinId = String(pinId || '').trim();
  if (!cleanPinId) return null;

  const [pinRows, trajectoryRows, serpRows, creatorRows] = await Promise.all([
    sql`
      SELECT
        pin_id, creator_username, board_id, board_name, board_slug, title, domain, destination_url,
        image_url, description, alt_text, dominant_color, visual_annotations, created_at_pinterest,
        first_discovered_pillar, first_discovered_at AS first_saved_at, last_scraped_at AS last_resaved_at, updated_at,
        save_count, repin_count, comment_count, share_count, reaction_count,
        daily_save_velocity, delta_saves_24h, delta_repins_24h,
        gains_5d, gains_7d, gains_10d, gains_15d,
        is_product, is_video, creation_method, image_signature, seo_noindex_reason, is_repin, canonical_pin_id,
        COALESCE(metadata, '{}'::jsonb) AS metadata
      FROM universal_master_pins
      WHERE pin_id = ${cleanPinId}
      LIMIT 1;
    `,
    sql`
      SELECT
        pin_id,
        snapshot_date::text AS snapshot_date,
        save_count,
        repin_count,
        comment_count,
        share_count,
        reaction_count,
        daily_save_velocity,
        updated_at
      FROM pins_daily_metrics
      WHERE pin_id = ${cleanPinId}
      ORDER BY snapshot_date DESC
      LIMIT 30;
    `,
    sql`
      SELECT
        ksc.keyword_id,
        tk.keyword AS keyword_name,
        ksc.rank_position,
        ksc.prev_rank_position,
        ksc.is_displaced,
        ksc.last_known_rank,
        ksc.crawled_at,
        ksc.updated_at
      FROM keyword_serp_current ksc
      LEFT JOIN tracked_keywords tk ON tk.id = ksc.keyword_id
      WHERE ksc.pin_id = ${cleanPinId}
      ORDER BY ksc.is_displaced ASC, ksc.rank_position ASC NULLS LAST;
    `,
    sql`
      SELECT cp.id, cp.username, cp.display_name, cp.is_active, cp.metadata
      FROM competitor_profiles cp
      JOIN universal_master_pins ump ON ump.creator_username = cp.username
      WHERE ump.pin_id = ${cleanPinId}
      LIMIT 1;
    `.catch(() => [])
  ]);

  const pin = pinRows?.[0] || null;
  if (!pin) return null;

  const creatorProfile = creatorRows?.[0] || null;
  const meta = typeof pin.metadata === 'object' && pin.metadata !== null ? pin.metadata : {};

  // Compute clean chronological step deltas (pure MAX(0, (curr - prev) / days))
  const chrono = [...(trajectoryRows || [])].reverse();
  for (let i = 0; i < chrono.length; i++) {
    const curr = chrono[i];
    if (i === 0) {
      curr.step_save_delta = 0;
      curr.daily_save_velocity = Number(curr.daily_save_velocity || 0);
    } else {
      const prev = chrono[i - 1];
      const prevSaves = Number(prev.save_count || 0);
      const currSaves = Number(curr.save_count || 0);
      const diff = Math.max(0, currSaves - prevSaves);
      curr.step_save_delta = diff;
      if (prevSaves <= 0 && currSaves > 0) {
        // Hydration jump from zero/null baseline: suppress velocity to 0
        curr.daily_save_velocity = 0;
      } else {
        curr.daily_save_velocity = calculateDailyVelocity({
          currentSaves: curr.save_count,
          baselineSaves: prev.save_count,
          currentDate: curr.snapshot_date,
          baselineDate: prev.snapshot_date
        });
      }
    }
  }

  const descSnapshots = [...chrono].reverse();
  const canonicalPinId = pin.canonical_pin_id || meta.canonical_pin_id || cleanPinId;
  const isCanonicalRoot = !pin.canonical_pin_id || String(pin.canonical_pin_id) === String(cleanPinId);
  const hasDestLink = Boolean(pin.destination_url || meta.tracked_link || meta.utm_link);
  const isGoLinkless = Boolean(meta.is_go_linkless || !hasDestLink);

  const creative = {
    ...pin,
    save_count: Number(pin.save_count || 0),
    repin_count: Number(pin.repin_count || 0),
    reaction_count: Math.max(0, Number(pin.reaction_count || 0)),
    daily_save_velocity: Number(pin.daily_save_velocity || 0),
    delta_saves_24h: Number(pin.delta_saves_24h || 0),
    visual_annotations: Array.isArray(pin.visual_annotations) ? pin.visual_annotations : []
  };

  const algorithmicIntelligence = {
    is_repin: Boolean(pin.is_repin),
    origin_pinner: meta.origin_pinner || null,
    origin_pinner_followers: meta.origin_pinner_followers ?? meta.origin_pinner?.follower_count ?? null,
    domain_official_user: meta.domain_official_user || null,
    creator_is_verified_merchant: Boolean(meta.creator_is_verified_merchant ?? false),
    image_signature: pin.image_signature || meta.image_signature || '',
    image_dimensions: meta.image_dimensions || meta.imageDimensions || null,
    seo_noindex_reason: pin.seo_noindex_reason || meta.seo_noindex_reason || null,
    is_indexed_google: !(pin.seo_noindex_reason || meta.seo_noindex_reason),
    is_go_linkless: isGoLinkless,
    is_arbitrage_active: !isGoLinkless,
    category_breadcrumbs: Array.isArray(meta.category_breadcrumbs) ? meta.category_breadcrumbs : [],
    board_metrics: {
      pin_count: Number(meta.board_pin_count || 0),
      order_modified_at: meta.board_order_modified_at || null,
      board_url: meta.board_url || null,
      cover_url: meta.board_cover_url || null,
      thumbnail_url: meta.board_thumbnail_url || null
    },
    creation_method: pin.creation_method || meta.creation_method || 'pinterest_platform',
    seo_title: meta.seo_title || pin.title || '',
    seo_description: meta.seo_description || pin.description || '',
    seo_canonical_url: meta.seo_canonical_url || '',
    seo_canonical_domain: meta.seo_canonical_domain || pin.domain || '',
    canonical_pin_id: canonicalPinId,
    canonical_pin_url: pin.canonical_pin_id ? `https://www.pinterest.com/pin/${pin.canonical_pin_id}/` : `https://www.pinterest.com/pin/${cleanPinId}/`,
    is_canonical_root: isCanonicalRoot,
    seo_related_interests: Array.isArray(meta.seo_related_interests) ? meta.seo_related_interests : [],
    rich_metadata: meta.rich_metadata || null,
    visual_objects: Array.isArray(meta.visual_objects) ? meta.visual_objects : [],
    reactions: meta.reactions || {},
    utm_link: meta.utm_link || pin.destination_url || '',
    tracked_link: meta.tracked_link || pin.destination_url || '',
    is_product: Boolean(pin.is_product || meta.is_product),
    is_video: Boolean(pin.is_video || meta.is_video),
    shopping_data: meta.shopping_data || null
  };

  const pillar1CreatorContext = {
    creator_username: pin.creator_username || '',
    creator_url: pin.creator_username ? `https://www.pinterest.com/${pin.creator_username}/` : null,
    board_name: pin.board_name || '',
    board_slug: pin.board_slug || (pin.board_name ? pin.board_name.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-') : ''),
    board_url: (pin.creator_username && pin.board_slug) ? `https://www.pinterest.com/${pin.creator_username}/${pin.board_slug}/` : null,
    competitor_tracked: Boolean(creatorProfile),
    competitor_profile: creatorProfile || null
  };

  const pillar2KeywordsContext = {
    ranking_keywords: (serpRows || []).map(k => ({
      keyword_id: k.keyword_id,
      keyword: k.keyword_name,
      rank: k.rank_position,
      prev_rank: k.prev_rank_position,
      is_displaced: k.is_displaced,
      last_known_rank: k.last_known_rank,
      crawled_at: k.crawled_at,
      updated_at: k.updated_at
    })),
    serp_impressions: (serpRows || []).length,
    highest_rank: (serpRows || []).reduce((min, k) => Math.min(min, k.rank_position || 999), 999)
  };

  return {
    pin_id: cleanPinId,
    creative,
    algorithmic_intelligence: algorithmicIntelligence,
    pillar_1_creator_context: pillar1CreatorContext,
    pillar_2_keywords_context: pillar2KeywordsContext,
    snapshots: descSnapshots,
    daily_trajectory: descSnapshots,
    serp_positions: serpRows || []
  };
}

function repoSafeIsoDate(val, fallback = null) {
  if (!val) return fallback;
  try {
    const d = new Date(val);
    return !isNaN(d.getTime()) ? d.toISOString() : fallback;
  } catch (_) {
    return fallback;
  }
}

function repoIsMultiStageHydrationJump(prev, curr) {
  if (!prev || !curr) return false;
  const pSaves = typeof prev === 'number' ? prev : Number(prev.save_count ?? prev.saves ?? prev.baselineSaves ?? prev.prev_saves ?? 0);
  const cSaves = typeof curr === 'number' ? curr : Number(curr.save_count ?? curr.saves ?? curr.currentSaves ?? curr.cur_saves ?? 0);
  const pRepins = typeof prev === 'object' ? Number(prev.repin_count ?? prev.repins ?? prev.baselineRepins ?? prev.prev_repins ?? 0) : 0;
  const cRepins = typeof curr === 'object' ? Number(curr.repin_count ?? curr.repins ?? curr.currentRepins ?? curr.cur_repins ?? 0) : 0;

  if (!Number.isFinite(pSaves) || !Number.isFinite(cSaves)) return false;
  const rawDelta = Math.max(0, cSaves - pSaves);
  if (rawDelta === 0) return false;
  if (pSaves <= 0 && cSaves > 0) return true;
  if (pRepins > 0 && pSaves < pRepins) return true;
  const effCurRepins = cRepins > 0 ? cRepins : pRepins;
  if (pRepins > 0 && pSaves === pRepins && cSaves > effCurRepins * 1.35) return true;
  if (pRepins === 0 && cRepins >= 25 && cSaves >= pSaves * 2.5) return true;
  if (pSaves > 0 && (cSaves / pSaves) >= 4.0 && (cSaves - pSaves) >= 2500) return true;
  if (rawDelta > 2000 && pSaves < 500 && (pSaves <= 0 || (cSaves / Math.max(1, pSaves)) > 20)) return true;
  return false;
}

/**
 * 5. Four-Pillar Atomic Sync (`syncPinAcrossAllFourPillars`)
 * Writes master creative + 48 telemetry fields + Day-2 velocity + SERP positions
 * across target shard tables and the 3 hub operational tables (`keyword_serp_current`, `competitor_pins`, `pa_pins`)
 * plus `keyword_displaced_index`, then returns refreshed universal dossier.
 */
export async function syncPinAcrossAllFourPillars({
  hubSql,
  pinId,
  scrapedPin,
  env = null,
  ctx = null,
  getPinShardId: injectedGetPinShardId = null,
  resolveShardConnection: injectedResolveShardConnection = null,
  fetchUniversalPinDossier: injectedFetchUniversalPinDossier = null
}) {
  // [INVARIANT: HYPERDRIVE-ATOMIC-BUILDER]
  // [INVARIANT: ZERO-HUB-SNAPSHOTS]
  // [INVARIANT: DETERMINISTIC-CRC32-SHARDING]
  // [INVARIANT: SAFE-PREFETCH-EDGE-ONLY]
  const cleanPinId = String(pinId || '').trim();
  if (!cleanPinId) {
    throw new Error('[syncPinAcrossAllFourPillars] pinId is required');
  }
  if (!scrapedPin || typeof scrapedPin !== 'object') {
    throw new Error('[syncPinAcrossAllFourPillars] scrapedPin object is required');
  }

  let getPinShardIdFn = injectedGetPinShardId;
  let resolveShardConnectionFn = injectedResolveShardConnection;
  let fetchUniversalPinDossierFn = injectedFetchUniversalPinDossier;
  if (!getPinShardIdFn || !resolveShardConnectionFn || !fetchUniversalPinDossierFn) {
    const fleetRouter = await import('../sharding/fleet-router.mjs');
    getPinShardIdFn = getPinShardIdFn || fleetRouter.getPinShardId;
    resolveShardConnectionFn = resolveShardConnectionFn || fleetRouter.resolveShardConnection;
    fetchUniversalPinDossierFn = fetchUniversalPinDossierFn || fleetRouter.fetchUniversalPinDossier;
  }

  // 1. Resolve target Shard using deterministic CRC32
  // [INVARIANT: DETERMINISTIC-CRC32-SHARDING]
  const shardId = getPinShardIdFn(cleanPinId, 99);
  let shardSql;
  try {
    shardSql = await resolveShardConnectionFn({ hubSql, shardId, env });
  } catch (shardErr) {
    console.warn(`[syncPinAcrossAllFourPillars] Failed resolving shard ${shardId}: ${shardErr.message}`);
    shardSql = hubSql;
  }

  // 2. Normalize and sanitize numeric metrics (Anti-NaN Protection)
  const newSaves = Number.isFinite(Number(scrapedPin.saves))
    ? Math.max(0, Number(scrapedPin.saves))
    : (Number.isFinite(Number(scrapedPin.save_count)) ? Math.max(0, Number(scrapedPin.save_count)) : 0);
  const hasExplicitScrapedSaves = Boolean(scrapedPin.has_explicit_saves) || newSaves > 0;
  const newRepins = Number.isFinite(Number(scrapedPin.repins))
    ? Math.max(0, Number(scrapedPin.repins))
    : (Number.isFinite(Number(scrapedPin.repin_count)) ? Math.max(0, Number(scrapedPin.repin_count)) : 0);
  const newComments = Number.isFinite(Number(scrapedPin.comments))
    ? Math.max(0, Number(scrapedPin.comments))
    : (Number.isFinite(Number(scrapedPin.comment_count)) ? Math.max(0, Number(scrapedPin.comment_count)) : 0);
  const newShares = Number.isFinite(Number(scrapedPin.share_count))
    ? Math.max(0, Number(scrapedPin.share_count))
    : (Number.isFinite(Number(scrapedPin.shares)) ? Math.max(0, Number(scrapedPin.shares)) : 0);

  const totalReactions = Number(
    scrapedPin.total_reaction_count ??
    (scrapedPin.reactions && typeof scrapedPin.reactions === 'object'
      ? Object.values(scrapedPin.reactions).reduce((acc, v) => acc + (Number(v) || 0), 0)
      : 0)
  );

  // 3. Prepare sanitized metadata payload
  // [INVARIANT: 48-FIELD-TELEMETRY-PRESERVATION] Preserve carousel detection, affiliate tracking links, and creator audience
  // [INVARIANT: 48-FIELD-TELEMETRY-CAROUSEL-DETECTION]
  const isCarousel = Boolean(
    scrapedPin.is_carousel ||
    scrapedPin.isCarousel ||
    scrapedPin.method === 'carousel' ||
    scrapedPin.creation_method === 'carousel'
  );
  const rawMetaToStore = {
    alt_text: scrapedPin.alt_text || scrapedPin.seo_title || '',
    description: scrapedPin.description || '',
    board_name: scrapedPin.board_name || '',
    creation_method: isCarousel ? 'carousel' : (scrapedPin.creation_method || scrapedPin.method || 'pinterest_platform'),
    method: isCarousel ? 'carousel' : (scrapedPin.method || scrapedPin.creation_method || 'pinterest_platform'),
    is_carousel: isCarousel,
    created_at_pinterest: scrapedPin.created_at_pinterest || scrapedPin.created_at || '',
    is_repin: Boolean(scrapedPin.is_repin),
    origin_pinner: scrapedPin.origin_pinner || null,
    domain_official_user: scrapedPin.domain_official_user || null,
    creator_is_verified_merchant: Boolean(scrapedPin.creator_is_verified_merchant),
    has_affiliate_redirect: Boolean(scrapedPin.has_affiliate_redirect || scrapedPin.affiliate_link || scrapedPin.is_affiliate),
    affiliate_networks: Array.isArray(scrapedPin.affiliate_networks) ? scrapedPin.affiliate_networks : [],
    utm_source: scrapedPin.utm_source || null,
    utm_medium: scrapedPin.utm_medium || null,
    utm_campaign: scrapedPin.utm_campaign || null,
    utm_content: scrapedPin.utm_content || null,
    // [INVARIANT: 48-FIELD-AFFILIATE-PRESERVATION] Preserve affiliate & tracking links without stripping
    utm_link: scrapedPin.utm_link || scrapedPin.utmLink || null,
    tracked_link: scrapedPin.tracked_link || scrapedPin.trackedLink || null,
    is_fresh_angle: Boolean(scrapedPin.is_fresh_angle),
    // [INVARIANT: GUEST-AUDIENCE-EXTRACTION]
    creator_followers: scrapedPin.creator_followers ?? scrapedPin.pinner?.follower_count ?? null,
    pinner: scrapedPin.pinner || null,
    closeupUnifiedAttribution: scrapedPin.closeupUnifiedAttribution || null,
    closeup_attribution: scrapedPin.closeup_attribution || null,
    link_domain: scrapedPin.link_domain || scrapedPin.domain || null,
    shopping_flags: Array.isArray(scrapedPin.shopping_flags) ? scrapedPin.shopping_flags : [],
    // [INVARIANT: 48-FIELD-TELEMETRY-PRESERVATION] Complete SEO, canonical, visual, and shopping telemetry (L-07)
    seo_title: scrapedPin.seo_title || scrapedPin.alt_text || '',
    seo_description: scrapedPin.seo_description || scrapedPin.description || '',
    seo_canonical_url: scrapedPin.seo_canonical_url || scrapedPin.canonical_url || '',
    canonical_pin_id: scrapedPin.canonical_pin_id || scrapedPin.canonicalPinId || '',
    seo_related_interests: Array.isArray(scrapedPin.seo_related_interests) ? scrapedPin.seo_related_interests : (scrapedPin.related_interests || []),
    rich_metadata: scrapedPin.rich_metadata || scrapedPin.richMetadata || null,
    image_signature: scrapedPin.image_signature || scrapedPin.imageSignature || null,
    image_dimensions: scrapedPin.image_dimensions || scrapedPin.imageDimensions || (scrapedPin.width && scrapedPin.height ? { width: scrapedPin.width, height: scrapedPin.height } : null),
    seo_noindex_reason: scrapedPin.seo_noindex_reason || null,
    is_go_linkless: Boolean(scrapedPin.is_go_linkless || scrapedPin.isGoLinkless),
    category_breadcrumbs: Array.isArray(scrapedPin.category_breadcrumbs) ? scrapedPin.category_breadcrumbs : (scrapedPin.breadcrumbs || []),
    board_pin_count: scrapedPin.board_pin_count ?? scrapedPin.boardPinCount ?? null,
    visual_objects: Array.isArray(scrapedPin.visual_objects) ? scrapedPin.visual_objects : (scrapedPin.visualObjects || []),
    reactions: scrapedPin.reactions && typeof scrapedPin.reactions === 'object' ? scrapedPin.reactions : null,
    origin_pinner_followers: scrapedPin.origin_pinner_followers ?? scrapedPin.origin_pinner?.follower_count ?? null,
    is_product: Boolean(scrapedPin.is_product || scrapedPin.isProduct || (Array.isArray(scrapedPin.shopping_flags) && scrapedPin.shopping_flags.includes('is_product'))),
    is_video: Boolean(scrapedPin.is_video || scrapedPin.isVideo || scrapedPin.video_url),
    shopping_data: scrapedPin.shopping_data || scrapedPin.shoppingData || null
  };

  const metaToStore = {};
  for (const [k, v] of Object.entries(rawMetaToStore)) {
    if (v === null || v === undefined || v === '') continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (typeof v === 'object' && Object.keys(v).length === 0) continue;
    metaToStore[k] = v;
  }

  const cleanCreatedAtIso = (() => {
    const rawDate = scrapedPin.created_at_pinterest || scrapedPin.created_at;
    if (!rawDate) return null;
    const d = new Date(rawDate);
    return isNaN(d.getTime()) ? null : d.toISOString();
  })();

  // 4. Pillar 1: Upsert universal_master_pins on designated Storage Shard
  await shardSql`
    INSERT INTO universal_master_pins (
      pin_id, creator_username, board_name, title, domain, destination_url,
      image_url, description, alt_text, dominant_color, visual_annotations,
      created_at_pinterest, metadata,
      first_discovered_pillar, first_discovered_at, updated_at
    ) VALUES (
      ${cleanPinId},
      ${scrapedPin.creator_username || scrapedPin.pinner_username || ''},
      ${scrapedPin.board_name || ''},
      ${scrapedPin.title || ''},
      ${scrapedPin.domain || ''},
      ${scrapedPin.link || scrapedPin.destination_url || ''},
      ${scrapedPin.image_url || ''},
      ${scrapedPin.description || ''},
      ${scrapedPin.alt_text || scrapedPin.seo_title || ''},
      ${scrapedPin.dominant_color || '#888888'},
      ${JSON.stringify(scrapedPin.annotations?.map(a => a.name) || scrapedPin.visual_style_tags || [])}::jsonb,
      ${cleanCreatedAtIso}::timestamptz,
      ${JSON.stringify(metaToStore)}::jsonb,
      'live_sync',
      NOW(),
      NOW()
    )
    ON CONFLICT (pin_id) DO UPDATE SET
      creator_username = COALESCE(NULLIF(EXCLUDED.creator_username, ''), universal_master_pins.creator_username),
      board_name = COALESCE(NULLIF(EXCLUDED.board_name, ''), universal_master_pins.board_name),
      title = CASE
        WHEN EXCLUDED.title IS NOT NULL
         AND BTRIM(EXCLUDED.title) <> ''
         AND EXCLUDED.title !~* '(^|\\s)(Inspiration|Idea)$'
         AND EXCLUDED.title !~* '^(Untitled(\\s+Pin)?|Pin(\\s*#?\\s*\\w+)?|Pinterest\\s+(Visual\\s+Guide|Pin\\s+Idea))$'
        THEN EXCLUDED.title
        ELSE COALESCE(NULLIF(universal_master_pins.title, ''), EXCLUDED.title)
      END,
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
      metadata = (COALESCE(universal_master_pins.metadata, '{}'::jsonb) || EXCLUDED.metadata
        || CASE
             WHEN COALESCE(NULLIF(universal_master_pins.metadata->>'creation_method', ''), NULLIF(universal_master_pins.metadata->>'method', '')) IS NOT NULL 
              AND LOWER(TRIM(COALESCE(NULLIF(universal_master_pins.metadata->>'creation_method', ''), NULLIF(universal_master_pins.metadata->>'method', '')))) NOT IN ('pinterest_platform')
              AND (COALESCE(NULLIF(EXCLUDED.metadata->>'creation_method', ''), NULLIF(EXCLUDED.metadata->>'method', '')) IS NULL 
                   OR LOWER(TRIM(COALESCE(NULLIF(EXCLUDED.metadata->>'creation_method', ''), NULLIF(EXCLUDED.metadata->>'method', '')))) = 'pinterest_platform')
             THEN jsonb_build_object(
               'creation_method', COALESCE(NULLIF(universal_master_pins.metadata->>'creation_method', ''), NULLIF(universal_master_pins.metadata->>'method', '')),
               'method', COALESCE(NULLIF(universal_master_pins.metadata->>'creation_method', ''), NULLIF(universal_master_pins.metadata->>'method', ''))
             )
             ELSE '{}'::jsonb
           END) - 'deleted_snapshot_dates'
        || jsonb_build_object('deleted_snapshot_dates', (
             SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
             FROM jsonb_array_elements_text(COALESCE(universal_master_pins.metadata->'deleted_snapshot_dates', '[]'::jsonb)) AS elem
             WHERE elem <> (NOW() AT TIME ZONE 'UTC')::date::text
           )),
      created_at_pinterest = COALESCE(EXCLUDED.created_at_pinterest, universal_master_pins.created_at_pinterest),
      updated_at = NOW();
  `;

  // 5. Query Central Hub Active SERP State (keyword_serp_current) including baseline velocity columns
  const targetRows = await hubSql`
    SELECT
      keyword_id, rank_position, is_displaced, save_count, repin_count,
      comment_count, share_count, baseline_day_saves, baseline_day_date,
      daily_save_velocity, delta_repins_24h, crawled_at, last_known_rank
    FROM keyword_serp_current
    WHERE pin_id = ${cleanPinId}
      AND COALESCE(is_displaced, FALSE) = FALSE
      AND rank_position IS NOT NULL;
  `;

  // 5B. Displaced / Competitor / Archive Fallback: Query keyword_displaced_index and Shard pins_daily_metrics
  let displacedRows = [];
  try {
    displacedRows = await hubSql`
      SELECT
        keyword_id, last_known_rank, displaced_date, save_count, repin_count,
        comment_count, share_count, daily_save_velocity, delta_repins_24h, domain, updated_at
      FROM keyword_displaced_index
      WHERE pin_id = ${cleanPinId};
    `;
  } catch (dispErr) {
    console.warn(`[syncPinAcrossAllFourPillars] keyword_displaced_index lookup note: ${dispErr.message}`);
  }

  let priorShardMetrics = [];
  try {
    priorShardMetrics = await shardSql`
      SELECT snapshot_date::text AS snapshot_date, save_count, repin_count, comment_count, share_count, reaction_count, daily_save_velocity, updated_at
      FROM pins_daily_metrics
      WHERE pin_id = ${cleanPinId}
      ORDER BY snapshot_date DESC
      LIMIT 3;
    `;
  } catch (metricLookupErr) {
    console.warn(`[syncPinAcrossAllFourPillars] Shard pins_daily_metrics baseline lookup note: ${metricLookupErr.message}`);
  }

  // 6. Compute UTC-normalized save velocity with Day-2 Baseline & Intraday Ratchet Protection
  // [INVARIANT: UTC-MIDNIGHT-NORMALIZED-VELOCITY]
  const nowDate = new Date();
  const todayUtcStr = nowDate.toISOString().slice(0, 10);
  const toIsoDateStr = (val) => {
    if (!val) return null;
    if (val instanceof Date) return isNaN(val.getTime()) ? null : val.toISOString().slice(0, 10);
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  };

  const todayShardRow = priorShardMetrics.find(m => toIsoDateStr(m.snapshot_date) === todayUtcStr) || null;
  const priorDayShardRow = priorShardMetrics.find(m => {
    const dStr = toIsoDateStr(m.snapshot_date);
    return dStr && dStr < todayUtcStr;
  }) || null;

  let baselineSaves = 0;
  let baselineDate = null;

  if (priorDayShardRow && Number.isFinite(Number(priorDayShardRow.save_count)) && Number(priorDayShardRow.save_count) > 0) {
    baselineSaves = Number(priorDayShardRow.save_count);
    baselineDate = priorDayShardRow.snapshot_date;
  } else if (targetRows.length > 0) {
    const priorBaseRow = targetRows.find(r => {
      const bIso = toIsoDateStr(r.baseline_day_date);
      return bIso && bIso < todayUtcStr && r.baseline_day_saves != null && Number(r.baseline_day_saves) > 0;
    });
    const priorCrawlRow = targetRows.find(r => {
      const cIso = toIsoDateStr(r.crawled_at);
      return cIso && cIso < todayUtcStr && Number.isFinite(Number(r.save_count));
    });
    const r0 = priorBaseRow || priorCrawlRow || targetRows[0];
    const baseDateIso = toIsoDateStr(r0.baseline_day_date);
    const crawlDateIso = toIsoDateStr(r0.crawled_at);

    if (baseDateIso && baseDateIso < todayUtcStr && r0.baseline_day_saves != null && Number(r0.baseline_day_saves) > 0) {
      baselineSaves = Number(r0.baseline_day_saves);
      baselineDate = r0.baseline_day_date;
    } else if (crawlDateIso && crawlDateIso < todayUtcStr && Number.isFinite(Number(r0.save_count))) {
      baselineSaves = Number(r0.save_count);
      baselineDate = r0.crawled_at;
    } else if (r0.baseline_day_date && r0.baseline_day_saves != null && Number(r0.baseline_day_saves) > 0) {
      baselineSaves = Number(r0.baseline_day_saves);
      baselineDate = r0.baseline_day_date;
    } else {
      baselineSaves = Number.isFinite(Number(r0.save_count)) ? Number(r0.save_count) : 0;
      baselineDate = r0.crawled_at ? new Date(r0.crawled_at) : null;
    }
  } else if (displacedRows.length > 0) {
    const d0 = displacedRows[0];
    baselineSaves = Number.isFinite(Number(d0.save_count)) ? Number(d0.save_count) : 0;
    baselineDate = d0.displaced_date || d0.updated_at || null;
  } else if (todayShardRow && Number.isFinite(Number(todayShardRow.save_count))) {
    baselineSaves = Number(todayShardRow.save_count);
    baselineDate = todayShardRow.snapshot_date;
  }

  const targetBaselineRepins = (priorDayShardRow && priorDayShardRow.repin_count != null && Number(priorDayShardRow.repin_count) > 0)
    ? Number(priorDayShardRow.repin_count)
    : ((targetRows.length > 0 && targetRows[0].repin_count != null)
      ? Number(targetRows[0].repin_count)
      : ((displacedRows.length > 0 && displacedRows[0].repin_count != null) ? Number(displacedRows[0].repin_count) : Number(todayShardRow?.repin_count || 0)));

  const jumpDetected = repoIsMultiStageHydrationJump(
    { save_count: baselineSaves, repin_count: targetBaselineRepins },
    { save_count: newSaves, repin_count: newRepins }
  );
  let computedVelocity = 0;

  if (jumpDetected) {
    computedVelocity = 0;
  } else {
    computedVelocity = calculateDailyVelocity({
      currentSaves: newSaves,
      baselineSaves,
      currentRepins: newRepins,
      baselineRepins: targetBaselineRepins,
      currentDate: nowDate,
      baselineDate
    });
  }

  const existingPositiveVelocity = Math.max(
    0,
    ...targetRows.map(r => Number(r.daily_save_velocity) || 0),
    ...displacedRows.map(r => Number(r.daily_save_velocity) || 0),
    Number(todayShardRow?.daily_save_velocity || 0)
  );
  const existingPositiveRepinDelta = Math.max(
    0,
    ...targetRows.map(r => Number(r.delta_repins_24h) || 0),
    ...displacedRows.map(r => Number(r.delta_repins_24h) || 0)
  );

  const baselineDateIso = toIsoDateStr(baselineDate);
  const rawRepinDelta = Math.max(0, newRepins - targetBaselineRepins);

  const intradayStepGain = todayShardRow
    ? Math.max(0, newSaves - Number(todayShardRow.save_count || 0))
    : 0;
  const intradayRepinStepGain = todayShardRow
    ? Math.max(0, newRepins - Number(todayShardRow.repin_count || 0))
    : 0;
  const syncVelocity = jumpDetected
    ? 0
    : ((hasExplicitScrapedSaves && newSaves < baselineSaves)
      ? 0
      : ((!baselineDateIso || baselineDateIso === todayUtcStr)
        ? Math.max(existingPositiveVelocity, computedVelocity, intradayStepGain)
        : computedVelocity));
  const syncRepinsDelta = (!baselineDateIso || baselineDateIso === todayUtcStr)
    ? Math.max(existingPositiveRepinDelta, rawRepinDelta, intradayRepinStepGain)
    : rawRepinDelta;

  // 7. Shard: Upsert two-tier modern snapshot metrics (pins_daily_metrics)
  // [INVARIANT: TWO-TIER-MODERN-SHARDING]
  // [INVARIANT: ZERO-HUB-SNAPSHOTS]
  await shardSql`
    INSERT INTO pins_daily_metrics (
      pin_id, snapshot_date, save_count, repin_count, comment_count, share_count, reaction_count, daily_save_velocity, updated_at
    ) VALUES (
      ${cleanPinId}, (NOW() AT TIME ZONE 'UTC')::date, ${newSaves}, ${newRepins},
      ${newComments}, ${newShares}, ${totalReactions}, ${syncVelocity}, NOW()
    )
    ON CONFLICT (pin_id, snapshot_date) DO UPDATE SET
      save_count = CASE WHEN ${hasExplicitScrapedSaves} OR EXCLUDED.save_count > 0 THEN EXCLUDED.save_count ELSE pins_daily_metrics.save_count END,
      repin_count = CASE WHEN EXCLUDED.repin_count > 0 OR ${hasExplicitScrapedSaves} THEN EXCLUDED.repin_count ELSE pins_daily_metrics.repin_count END,
      comment_count = GREATEST(pins_daily_metrics.comment_count, EXCLUDED.comment_count),
      share_count = GREATEST(pins_daily_metrics.share_count, EXCLUDED.share_count),
      reaction_count = GREATEST(pins_daily_metrics.reaction_count, EXCLUDED.reaction_count),
      daily_save_velocity = COALESCE(EXCLUDED.daily_save_velocity, pins_daily_metrics.daily_save_velocity, 0),
      updated_at = NOW();
  `;
  await shardSql`
    UPDATE universal_master_pins
    SET
      metadata = (CASE WHEN jsonb_typeof(universal_master_pins.metadata) = 'object' THEN universal_master_pins.metadata ELSE '{}'::jsonb END)
        || CASE
             WHEN COALESCE(universal_master_pins.save_count, 0) > 0
              AND universal_master_pins.last_scraped_at IS NOT NULL
              AND (universal_master_pins.last_scraped_at AT TIME ZONE 'UTC')::date = (NOW() AT TIME ZONE 'UTC')::date
              AND (
                universal_master_pins.save_count IS DISTINCT FROM ${newSaves}
                OR universal_master_pins.repin_count IS DISTINCT FROM ${newRepins}
              )
             THEN jsonb_build_object(
               'intraday_snapshots',
               (
                 SELECT COALESCE(jsonb_agg(elem ORDER BY ord), '[]'::jsonb)
                 FROM (
                   SELECT elem, ord
                   FROM jsonb_array_elements(
                     (
                       CASE
                         WHEN jsonb_typeof(universal_master_pins.metadata->'intraday_snapshots') = 'array'
                         THEN universal_master_pins.metadata->'intraday_snapshots'
                         ELSE '[]'::jsonb
                       END
                     ) || jsonb_build_array(
                       jsonb_build_object(
                         'id', 'intra_' || EXTRACT(EPOCH FROM universal_master_pins.last_scraped_at)::bigint::text,
                         'snapshot_date', ((NOW() AT TIME ZONE 'UTC')::date)::text,
                         'recorded_at', to_char(universal_master_pins.last_scraped_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                         'save_count', COALESCE(universal_master_pins.save_count, 0),
                         'repin_count', COALESCE(universal_master_pins.repin_count, 0),
                         'comment_count', COALESCE(universal_master_pins.comment_count, 0),
                         'share_count', COALESCE(universal_master_pins.share_count, 0)
                       )
                     )
                   ) WITH ORDINALITY AS t(elem, ord)
                   ORDER BY ord DESC
                   LIMIT 24
                 ) recent_intra
               )
             )
             ELSE '{}'::jsonb
           END,
      save_count = CASE WHEN ${hasExplicitScrapedSaves} OR ${newSaves} > 0 THEN ${newSaves}::bigint ELSE COALESCE(universal_master_pins.save_count, 0) END,
      repin_count = CASE WHEN ${newRepins} > 0 OR ${hasExplicitScrapedSaves} THEN ${newRepins}::int ELSE COALESCE(universal_master_pins.repin_count, 0) END,
      comment_count = GREATEST(COALESCE(universal_master_pins.comment_count, 0), ${newComments}::int),
      share_count = GREATEST(COALESCE(universal_master_pins.share_count, 0), ${newShares}::int),
      reaction_count = GREATEST(COALESCE(universal_master_pins.reaction_count, 0), ${totalReactions}::int),
      daily_save_velocity = COALESCE(${syncVelocity}::numeric, daily_save_velocity, 0),
      delta_saves_24h = ROUND(COALESCE(${syncVelocity}::numeric, 0))::int,
      delta_repins_24h = COALESCE(${syncRepinsDelta}::int, delta_repins_24h, 0),
      last_scraped_at = NOW(),
      updated_at = NOW()
    WHERE pin_id = ${cleanPinId};
  `.catch((err) => {
    console.error(`[PinRepository.syncPinAcrossAllFourPillars] universal_master_pins metric update failed for pin ${cleanPinId}:`, err?.message || err);
  });

  // 8. Shard: Upsert SERP positions (pin_serp_positions) for each associated active or displaced keyword
  // [INVARIANT: ATOMIC-BATCH-UPSERT-WITH-MAP-DEDUP]
  const combinedKeywordRows = [
    ...targetRows,
    ...displacedRows
      .filter(d => !targetRows.some(t => Number(t.keyword_id) === Number(d.keyword_id)))
      .map(d => ({
        keyword_id: d.keyword_id,
        rank_position: null,
        is_displaced: true,
        last_known_rank: d.last_known_rank || 100
      }))
  ];

  const validPositions = [];
  for (const row of combinedKeywordRows) {
    const shardKid = Number(row.keyword_id);
    if (shardKid != null) {
      if (shardKid > 0) {
        const isDisp = Boolean(row.is_displaced);
        const effLastRank = row.rank_position || row.last_known_rank || 100;
        const effCatalogRank = isDisp ? (Number(effLastRank) + 250) : Number(row.rank_position || 1);
        validPositions.push({
          pin_id: cleanPinId,
          keyword_id: shardKid,
          rank_position: isDisp ? null : row.rank_position,
          is_displaced: isDisp,
          last_known_rank: effLastRank,
          catalog_rank: effCatalogRank
        });
      }
    }
  }

  if (validPositions.length > 0) {
    const dedupMap = new Map();
    for (const pos of validPositions) {
      const existing = dedupMap.get(pos.keyword_id);
      if (!existing || (pos.rank_position != null && (existing.rank_position == null || pos.rank_position < existing.rank_position))) {
        dedupMap.set(pos.keyword_id, pos);
      }
    }
    const cleanPositions = Array.from(dedupMap.values()).sort((a, b) => a.keyword_id - b.keyword_id);
    const positionsPayload = JSON.stringify(cleanPositions);

    await shardSql`
      INSERT INTO pin_serp_positions (
        pin_id, snapshot_date, keyword_id, rank_position, is_displaced, last_known_rank, catalog_rank, updated_at
      )
      SELECT 
        x.pin_id,
        (NOW() AT TIME ZONE 'UTC')::date,
        x.keyword_id,
        x.rank_position,
        x.is_displaced,
        x.last_known_rank,
        x.catalog_rank,
        NOW()
      FROM jsonb_to_recordset(${positionsPayload}::jsonb) AS x(
        pin_id VARCHAR(64),
        keyword_id INT,
        rank_position INT,
        is_displaced BOOLEAN,
        last_known_rank INT,
        catalog_rank INT
      )
      ON CONFLICT (pin_id, snapshot_date, keyword_id) DO UPDATE SET
        rank_position = CASE WHEN EXCLUDED.is_displaced = TRUE THEN NULL ELSE EXCLUDED.rank_position END,
        is_displaced = COALESCE(EXCLUDED.is_displaced, FALSE),
        last_known_rank = COALESCE(EXCLUDED.last_known_rank, pin_serp_positions.last_known_rank),
        catalog_rank = COALESCE(EXCLUDED.catalog_rank, pin_serp_positions.catalog_rank),
        updated_at = NOW();
    `;
  }

  // 9. Hub: Update active SERP state in keyword_serp_current
  if (targetRows.length > 0) {
    const incomingSyncMethod = isCarousel ? 'carousel' : (scrapedPin.creation_method || scrapedPin.method || '');
    await hubSql`
      UPDATE keyword_serp_current
      SET
        title = COALESCE(NULLIF(${scrapedPin.title || ''}, ''), title),
        domain = COALESCE(NULLIF(${scrapedPin.domain || ''}, ''), domain),
        destination_url = COALESCE(NULLIF(${scrapedPin.link || scrapedPin.destination_url || ''}, ''), destination_url),
        image_url = COALESCE(NULLIF(${scrapedPin.image_url || ''}, ''), image_url),
        creation_method = CASE
          WHEN ${incomingSyncMethod} <> '' AND LOWER(TRIM(${incomingSyncMethod})) <> 'pinterest_platform'
          THEN ${incomingSyncMethod}
          ELSE COALESCE(NULLIF(creation_method, ''), ${incomingSyncMethod}, 'pinterest_platform')
        END,
        save_count = CASE WHEN ${hasExplicitScrapedSaves} OR ${newSaves} > 0 THEN ${newSaves}::bigint ELSE save_count END,
        repin_count = CASE WHEN ${newRepins} > 0 OR ${hasExplicitScrapedSaves} THEN ${newRepins}::bigint ELSE repin_count END,
        baseline_day_saves = CASE
          WHEN (${hasExplicitScrapedSaves} OR ${newSaves} > 0) AND baseline_day_saves > ${newSaves}::bigint
          THEN ${newSaves}::bigint
          ELSE baseline_day_saves
        END,
        comment_count = GREATEST(comment_count, ${newComments}),
        share_count = GREATEST(share_count, ${newShares}),
        daily_save_velocity = CASE
          WHEN (${hasExplicitScrapedSaves} OR ${newSaves} > 0) AND baseline_day_saves > ${newSaves}::bigint
          THEN 0
          WHEN (crawled_at AT TIME ZONE 'UTC')::date = (NOW() AT TIME ZONE 'UTC')::date
          THEN GREATEST(COALESCE(daily_save_velocity, 0), COALESCE(${syncVelocity}::numeric, 0))
          WHEN ${syncVelocity} IS NOT NULL AND (${syncVelocity} > 0 OR COALESCE((crawled_at AT TIME ZONE 'UTC')::date, baseline_day_date) < (NOW() AT TIME ZONE 'UTC')::date)
          THEN ${syncVelocity}
          ELSE daily_save_velocity
        END,
        delta_repins_24h = CASE
          WHEN (crawled_at AT TIME ZONE 'UTC')::date = (NOW() AT TIME ZONE 'UTC')::date
          THEN GREATEST(COALESCE(delta_repins_24h, 0), COALESCE(${syncRepinsDelta}::int, 0))
          ELSE COALESCE(${syncRepinsDelta}::int, delta_repins_24h, 0)
        END,
        metadata = ((CASE WHEN jsonb_typeof(metadata) = 'object' THEN metadata ELSE '{}'::jsonb END) 
          || ${JSON.stringify(rawMetaToStore)}::jsonb
          || CASE
               WHEN COALESCE(NULLIF(metadata->>'creation_method', ''), NULLIF(metadata->>'method', '')) IS NOT NULL 
                AND LOWER(TRIM(COALESCE(NULLIF(metadata->>'creation_method', ''), NULLIF(metadata->>'method', '')))) NOT IN ('pinterest_platform')
                AND (${incomingSyncMethod} IS NULL OR LOWER(TRIM(${incomingSyncMethod})) IN ('', 'pinterest_platform'))
               THEN jsonb_build_object(
                 'creation_method', COALESCE(NULLIF(metadata->>'creation_method', ''), NULLIF(metadata->>'method', '')),
                 'method', COALESCE(NULLIF(metadata->>'creation_method', ''), NULLIF(metadata->>'method', ''))
               )
               ELSE '{}'::jsonb
             END) - 'deleted_snapshot_dates'
          || jsonb_build_object('deleted_snapshot_dates', (
               SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
               FROM jsonb_array_elements_text(COALESCE(keyword_serp_current.metadata->'deleted_snapshot_dates', '[]'::jsonb)) AS elem
               WHERE elem <> (NOW() AT TIME ZONE 'UTC')::date::text
             )),
        crawled_at = NOW(),
        updated_at = NOW()
      WHERE pin_id = ${cleanPinId};
    `;
  }

  // 9B. Hub: Update keyword_displaced_index if the pin is tracked in the Displaced Vault
  if (displacedRows.length > 0) {
    await hubSql`
      UPDATE keyword_displaced_index
      SET
        save_count = CASE WHEN ${hasExplicitScrapedSaves} OR ${newSaves} > 0 THEN ${newSaves}::bigint ELSE COALESCE(save_count, 0) END,
        repin_count = CASE WHEN ${newRepins} > 0 OR ${hasExplicitScrapedSaves} THEN ${newRepins}::bigint ELSE COALESCE(repin_count, 0) END,
        comment_count = GREATEST(COALESCE(comment_count, 0), ${newComments}),
        share_count = GREATEST(COALESCE(share_count, 0), ${newShares}),
        daily_save_velocity = COALESCE(${syncVelocity}::numeric, daily_save_velocity, 0),
        delta_saves_24h = ROUND(COALESCE(${syncVelocity}::numeric, 0))::int,
        delta_repins_24h = COALESCE(${syncRepinsDelta}::int, delta_repins_24h, 0),
        domain = COALESCE(NULLIF(${scrapedPin.domain || ''}, ''), domain),
        updated_at = NOW()
      WHERE pin_id = ${cleanPinId};
    `;
  }

  // 10. Hub: Update competitor_pins if tracked competitor pin
  await hubSql`
    UPDATE competitor_pins
    SET
      title = COALESCE(NULLIF(${scrapedPin.title || ''}, ''), title),
      link_domain = COALESCE(NULLIF(${scrapedPin.domain || ''}, ''), link_domain),
      destination_url = COALESCE(NULLIF(${scrapedPin.link || scrapedPin.destination_url || ''}, ''), destination_url),
      image_url = COALESCE(NULLIF(${scrapedPin.image_url || ''}, ''), image_url),
      save_count = CASE WHEN ${hasExplicitScrapedSaves} OR ${newSaves} > 0 THEN ${newSaves}::bigint ELSE save_count END,
      repin_count = CASE WHEN ${newRepins} > 0 OR ${hasExplicitScrapedSaves} THEN ${newRepins}::bigint ELSE repin_count END,
      comment_count = GREATEST(comment_count, ${newComments}),
      metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify(rawMetaToStore)}::jsonb,
      updated_at = NOW()
    WHERE pin_id = ${cleanPinId};
  `;

  // 11. Hub: Update pa_pins if in PinArchive
  await hubSql`
    UPDATE pa_pins
    SET
      title = COALESCE(NULLIF(${scrapedPin.title || ''}, ''), title),
      domain = COALESCE(NULLIF(${scrapedPin.domain || ''}, ''), domain),
      link = COALESCE(NULLIF(${scrapedPin.link || scrapedPin.destination_url || ''}, ''), link),
      image_url = COALESCE(NULLIF(${scrapedPin.image_url || ''}, ''), image_url),
      saves = CASE WHEN ${hasExplicitScrapedSaves} OR ${newSaves} > 0 THEN ${newSaves}::bigint ELSE saves END,
      repins = CASE WHEN ${newRepins} > 0 OR ${hasExplicitScrapedSaves} THEN ${newRepins}::bigint ELSE repins END,
      comments = GREATEST(comments, ${newComments}),
      share_count = GREATEST(share_count, ${newShares}),
      velocity = COALESCE(${syncVelocity}::numeric, 0),
      reactions = COALESCE(reactions, '{}'::jsonb) || ${JSON.stringify(scrapedPin.reactions || {})}::jsonb,
      last_updated_at = NOW()
    WHERE pin_id = ${cleanPinId};
  `;

  // Step C: Fetch fresh universal dossier with edge cache bypassed
  const refreshedDossier = await fetchUniversalPinDossierFn({ hubSql, pinId: cleanPinId, ctx, env, bypassEdgeCache: true });

  return {
    success: true,
    synced: true,
    pin_id: cleanPinId,
    shard_id: shardId,
    syncVelocity,
    dossier: refreshedDossier
  };
}

/**
 * 6. Canonical Deterministic Shard Batch Ingestion (`writeBatchToDeterministicShards`)
 * Groups pins by (crc32(pin_id) % 99) + 1, executes atomic bulk upserts via jsonb_to_recordset,
 * and returns decorated confirmedPinIds Set with zero-data-loss confirmation gate.
 */
export async function writeBatchToDeterministicShards(params = {}) {
  const pins = params.pins || [];
  const hubSql = params.hubSql;
  const env = params.env || null;
  const options = params.options || params;

  const confirmedPinIds = new Set();
  const failedShards = [];
  confirmedPinIds.confirmedPinIds = confirmedPinIds;
  confirmedPinIds.totalAttempted = Array.isArray(pins) ? pins.length : 0;
  confirmedPinIds.failedShards = failedShards;

  if (!Array.isArray(pins) || pins.length === 0) {
    return confirmedPinIds;
  }

  let batchGroupByShardFn = params.batchGroupByShard;
  let coalesceShardGroupsByPhysicalFn = params.coalesceShardGroupsByPhysical;
  let resolveShardConnectionFn = params.resolveShardConnection;
  if (!batchGroupByShardFn || !coalesceShardGroupsByPhysicalFn || !resolveShardConnectionFn) {
    const fleetRouter = await import('../sharding/fleet-router.mjs');
    batchGroupByShardFn = batchGroupByShardFn || fleetRouter.batchGroupByShard;
    coalesceShardGroupsByPhysicalFn = coalesceShardGroupsByPhysicalFn || fleetRouter.coalesceShardGroupsByPhysical;
    resolveShardConnectionFn = resolveShardConnectionFn || fleetRouter.resolveShardConnection;
  }

  const totalShards = options.totalShards || 99;
  const virtualShardGroups = batchGroupByShardFn(pins, totalShards);
  const physicalShardGroups = coalesceShardGroupsByPhysicalFn(virtualShardGroups);
  const concurrency = Math.max(1, Math.min(8, options.concurrency || 4));

  const formatPinForMasterPayload = (p) => {
    const pid = String(p.pin_id || p.id || '').trim();
    const reactions = p.reactions && typeof p.reactions === 'object' ? p.reactions : {};
    const reactionCount = Number(
      p.total_reaction_count ??
      p.reaction_count ??
      (typeof p.reactions === 'object' ? Object.values(reactions).reduce((acc, v) => acc + (Number(v) || 0), 0) : Number(p.reactions || 0))
    );
    const rawColor = p.dominant_color ? String(p.dominant_color).trim() : '';
    const cleanColor = (rawColor && !['', '#888888', '#1e1e24', '#000000', '#18181b'].includes(rawColor.toLowerCase())) ? rawColor : null;
    const richMeta = buildRichPinMetadataPayload(p);
    return {
      pin_id: pid,
      creator_username: String(p.creator_username || p.account_username || ''),
      board_name: String(p.board_name || ''),
      title: String(p.title || ''),
      domain: String(p.domain || p.link_domain || ''),
      destination_url: String(p.destination_url || p.link || ''),
      image_url: String(p.image_url || ''),
      description: String(p.description || ''),
      alt_text: String(p.alt_text || p.seo_alt_text || ''),
      dominant_color: cleanColor,
      visual_annotations: Array.isArray(p.visual_annotations || p.annotations) ? (p.visual_annotations || p.annotations) : [],
      created_at_pinterest: repoSafeIsoDate(p.created_at_pinterest),
      metadata: richMeta,
      save_count: Math.max(0, Number(p.saves ?? p.save_count ?? 0)),
      repin_count: Math.max(0, Number(p.repins ?? p.repin_count ?? 0)),
      comment_count: Math.max(0, Number(p.comments ?? p.comment_count ?? 0)),
      share_count: Math.max(0, Number(p.shares ?? p.share_count ?? 0)),
      reaction_count: Math.max(0, Number(reactionCount || 0)),
      daily_save_velocity: Number(p.velocity ?? p.daily_save_velocity ?? 0),
      is_product: Boolean(richMeta.is_product),
      is_video: Boolean(richMeta.is_video),
      creation_method: richMeta.creation_method || null,
      image_signature: richMeta.image_signature || null,
      seo_noindex_reason: richMeta.seo_noindex_reason || null,
      is_repin: Boolean(richMeta.is_repin),
      canonical_pin_id: richMeta.canonical_pin_id ? String(richMeta.canonical_pin_id) : null
    };
  };

  const entries = Array.from(physicalShardGroups.entries());
  for (let i = 0; i < entries.length; i += concurrency) {
    const batch = entries.slice(i, i + concurrency);
    await Promise.allSettled(batch.map(async ([shardId, rawShardPins]) => {
      try {
        const shardSql = await resolveShardConnectionFn({ hubSql, shardId, env }).catch((err) => {
          console.error(`[PinRepository.writeBatchToDeterministicShards] resolveShardConnection failed for shard #${shardId}:`, err?.message || err);
          return null;
        });
        if (!shardSql) {
          console.warn(`[writeBatchToDeterministicShards] Could not resolve shard #${shardId}`);
          failedShards.push(shardId);
          return;
        }

        const pinMap = new Map();
        for (const p of rawShardPins) {
          const pid = String(p?.pin_id || p?.id || '').trim();
          if (pid) pinMap.set(pid, p);
        }
        if (pinMap.size === 0) return;

        const deduplicatedPins = Array.from(pinMap.values());
        deduplicatedPins.sort((a, b) => String(a.pin_id || a.id).localeCompare(String(b.pin_id || b.id)));

        const masterPayload = JSON.stringify(deduplicatedPins.map(formatPinForMasterPayload));

        // 1. Batch Upsert into universal_master_pins (Unified SSOT with LATERAL prior-day delta calculation)
        await shardSql`
          INSERT INTO universal_master_pins (
            pin_id, creator_username, board_name, title, domain, destination_url,
            image_url, description, alt_text, dominant_color, visual_annotations, created_at_pinterest, metadata,
            save_count, repin_count, comment_count, share_count, reaction_count, daily_save_velocity,
            delta_saves_24h, delta_repins_24h,
            is_product, is_video, creation_method, image_signature, seo_noindex_reason, is_repin, canonical_pin_id,
            first_discovered_pillar, first_discovered_at, updated_at, last_scraped_at
          )
          SELECT DISTINCT ON (u.pin_id)
            u.pin_id, u.creator_username, u.board_name, u.title, u.domain, u.destination_url,
            u.image_url, u.description, u.alt_text, u.dominant_color, u.visual_annotations,
            NULLIF(TRIM(u.created_at_pinterest), '')::timestamptz, u.metadata,
            COALESCE(u.save_count, 0)::bigint, COALESCE(u.repin_count, 0)::int, COALESCE(u.comment_count, 0)::int,
            COALESCE(u.share_count, 0)::int, COALESCE(u.reaction_count, 0)::int,
            COALESCE(
              CASE
                WHEN prev.save_count IS NOT NULL AND prev.save_count > 0 AND prev.snapshot_date IS NOT NULL
                THEN ROUND(GREATEST(0, COALESCE(u.save_count, 0) - prev.save_count)::numeric / GREATEST(1, ((NOW() AT TIME ZONE 'UTC')::date - prev.snapshot_date)), 1)
                ELSE NULL
              END,
              u.daily_save_velocity,
              0
            )::numeric,
            COALESCE(
              CASE
                WHEN prev.save_count IS NOT NULL AND prev.save_count > 0 AND prev.snapshot_date IS NOT NULL
                THEN ROUND(GREATEST(0, COALESCE(u.save_count, 0) - prev.save_count)::numeric / GREATEST(1, ((NOW() AT TIME ZONE 'UTC')::date - prev.snapshot_date)), 1)
                ELSE NULL
              END,
              u.daily_save_velocity,
              0
            )::numeric,
            COALESCE(
              CASE
                WHEN prev.repin_count IS NOT NULL AND prev.repin_count > 0 AND prev.snapshot_date IS NOT NULL
                THEN ROUND(GREATEST(0, COALESCE(u.repin_count, 0) - prev.repin_count)::numeric / GREATEST(1, ((NOW() AT TIME ZONE 'UTC')::date - prev.snapshot_date)))::int
                WHEN prev.repin_count IS NOT NULL AND prev.repin_count > 0
                THEN GREATEST(0, COALESCE(u.repin_count, 0) - prev.repin_count)::int
                ELSE 0
              END,
              0
            )::int,
            COALESCE(u.is_product, FALSE), COALESCE(u.is_video, FALSE), u.creation_method, u.image_signature,
            u.seo_noindex_reason, COALESCE(u.is_repin, FALSE), u.canonical_pin_id,
            'batch_ingest', NOW(), NOW(), NOW()
          FROM jsonb_to_recordset(${masterPayload}::jsonb) AS u(
            pin_id text, creator_username text, board_name text, title text, domain text, destination_url text,
            image_url text, description text, alt_text text, dominant_color text, visual_annotations jsonb,
            created_at_pinterest text, metadata jsonb,
            save_count bigint, repin_count int, comment_count int, share_count int, reaction_count int,
            daily_save_velocity numeric, is_product boolean, is_video boolean, creation_method text,
            image_signature text, seo_noindex_reason text, is_repin boolean, canonical_pin_id text
          )
          LEFT JOIN LATERAL (
            SELECT pm.save_count, pm.repin_count, pm.snapshot_date
            FROM pins_daily_metrics pm
            WHERE pm.pin_id = u.pin_id
              AND pm.snapshot_date < (NOW() AT TIME ZONE 'UTC')::date
            ORDER BY pm.snapshot_date DESC
            LIMIT 1
          ) prev ON TRUE
          ORDER BY u.pin_id ASC
          ON CONFLICT (pin_id) DO UPDATE SET
            creator_username = COALESCE(NULLIF(EXCLUDED.creator_username, ''), universal_master_pins.creator_username),
            board_name = COALESCE(NULLIF(EXCLUDED.board_name, ''), universal_master_pins.board_name),
            title = CASE
              WHEN EXCLUDED.title IS NOT NULL
               AND BTRIM(EXCLUDED.title) <> ''
               AND EXCLUDED.title !~* '(^|\\s)(Inspiration|Idea)$'
               AND EXCLUDED.title !~* '^(Untitled(\\s+Pin)?|Pin(\\s*#?\\s*\\w+)?|Pinterest\\s+(Visual\\s+Guide|Pin\\s+Idea))$'
              THEN EXCLUDED.title
              ELSE COALESCE(NULLIF(universal_master_pins.title, ''), EXCLUDED.title)
            END,
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
            metadata = COALESCE(universal_master_pins.metadata, '{}'::jsonb) || EXCLUDED.metadata,
            save_count = CASE WHEN EXCLUDED.save_count > 0 THEN EXCLUDED.save_count ELSE COALESCE(universal_master_pins.save_count, 0) END,
            repin_count = CASE WHEN EXCLUDED.repin_count > 0 THEN EXCLUDED.repin_count ELSE COALESCE(universal_master_pins.repin_count, 0) END,
            comment_count = GREATEST(COALESCE(universal_master_pins.comment_count, 0), COALESCE(EXCLUDED.comment_count, 0)),
            share_count = GREATEST(COALESCE(universal_master_pins.share_count, 0), COALESCE(EXCLUDED.share_count, 0)),
            reaction_count = GREATEST(COALESCE(universal_master_pins.reaction_count, 0), COALESCE(EXCLUDED.reaction_count, 0)),
            daily_save_velocity = CASE
              WHEN (universal_master_pins.last_scraped_at AT TIME ZONE 'UTC')::date = (NOW() AT TIME ZONE 'UTC')::date
              THEN GREATEST(COALESCE(universal_master_pins.daily_save_velocity, 0), COALESCE(EXCLUDED.daily_save_velocity, 0))
              WHEN EXCLUDED.daily_save_velocity IS NOT NULL THEN EXCLUDED.daily_save_velocity
              ELSE COALESCE(universal_master_pins.daily_save_velocity, 0)
            END,
            delta_saves_24h = CASE
              WHEN (universal_master_pins.last_scraped_at AT TIME ZONE 'UTC')::date = (NOW() AT TIME ZONE 'UTC')::date
              THEN GREATEST(COALESCE(universal_master_pins.delta_saves_24h, 0), COALESCE(EXCLUDED.delta_saves_24h, 0))
              WHEN EXCLUDED.delta_saves_24h IS NOT NULL THEN EXCLUDED.delta_saves_24h
              ELSE COALESCE(universal_master_pins.delta_saves_24h, 0)
            END,
            delta_repins_24h = CASE
              WHEN (universal_master_pins.last_scraped_at AT TIME ZONE 'UTC')::date = (NOW() AT TIME ZONE 'UTC')::date
              THEN GREATEST(COALESCE(universal_master_pins.delta_repins_24h, 0), COALESCE(EXCLUDED.delta_repins_24h, 0))
              WHEN EXCLUDED.delta_repins_24h IS NOT NULL THEN EXCLUDED.delta_repins_24h
              ELSE COALESCE(universal_master_pins.delta_repins_24h, 0)
            END,
            is_product = COALESCE(EXCLUDED.is_product, universal_master_pins.is_product, FALSE),
            is_video = COALESCE(EXCLUDED.is_video, universal_master_pins.is_video, FALSE),
            creation_method = COALESCE(NULLIF(EXCLUDED.creation_method, ''), universal_master_pins.creation_method),
            image_signature = COALESCE(NULLIF(EXCLUDED.image_signature, ''), universal_master_pins.image_signature),
            seo_noindex_reason = COALESCE(NULLIF(EXCLUDED.seo_noindex_reason, ''), universal_master_pins.seo_noindex_reason),
            is_repin = COALESCE(EXCLUDED.is_repin, universal_master_pins.is_repin, FALSE),
            canonical_pin_id = COALESCE(NULLIF(EXCLUDED.canonical_pin_id, ''), universal_master_pins.canonical_pin_id),
            updated_at = NOW(),
            last_scraped_at = NOW();
        `;

        // 2. Batch Upsert into pins_daily_metrics
        await shardSql`
          INSERT INTO pins_daily_metrics (
            pin_id, snapshot_date, save_count, repin_count, comment_count, share_count, reaction_count, daily_save_velocity, updated_at
          )
          SELECT DISTINCT ON (u.pin_id)
            u.pin_id,
            (NOW() AT TIME ZONE 'UTC')::date,
            COALESCE(u.save_count, 0)::bigint,
            COALESCE(u.repin_count, 0)::int,
            COALESCE(u.comment_count, 0)::int,
            COALESCE(u.share_count, 0)::int,
            COALESCE(u.reaction_count, 0)::int,
            COALESCE(
              CASE
                WHEN prev.save_count IS NOT NULL AND prev.save_count > 0 AND prev.snapshot_date IS NOT NULL
                THEN ROUND(GREATEST(0, COALESCE(u.save_count, 0) - prev.save_count)::numeric / GREATEST(1, ((NOW() AT TIME ZONE 'UTC')::date - prev.snapshot_date)), 1)
                ELSE NULL
              END,
              u.daily_save_velocity,
              0
            )::numeric,
            NOW()
          FROM jsonb_to_recordset(${masterPayload}::jsonb) AS u(
            pin_id text, save_count bigint, repin_count int, comment_count int, share_count int, reaction_count int, daily_save_velocity numeric
          )
          LEFT JOIN LATERAL (
            SELECT pm.save_count, pm.snapshot_date
            FROM pins_daily_metrics pm
            WHERE pm.pin_id = u.pin_id
              AND pm.snapshot_date < (NOW() AT TIME ZONE 'UTC')::date
            ORDER BY pm.snapshot_date DESC
            LIMIT 1
          ) prev ON TRUE
          ORDER BY u.pin_id ASC
          ON CONFLICT (pin_id, snapshot_date) DO UPDATE SET
            save_count = CASE WHEN EXCLUDED.save_count > 0 THEN EXCLUDED.save_count ELSE COALESCE(pins_daily_metrics.save_count, 0) END,
            repin_count = CASE WHEN EXCLUDED.repin_count > 0 THEN EXCLUDED.repin_count ELSE COALESCE(pins_daily_metrics.repin_count, 0) END,
            comment_count = GREATEST(pins_daily_metrics.comment_count, EXCLUDED.comment_count),
            share_count = GREATEST(pins_daily_metrics.share_count, EXCLUDED.share_count),
            reaction_count = GREATEST(pins_daily_metrics.reaction_count, EXCLUDED.reaction_count),
            daily_save_velocity = CASE
              WHEN (pins_daily_metrics.updated_at AT TIME ZONE 'UTC')::date = (NOW() AT TIME ZONE 'UTC')::date
              THEN GREATEST(COALESCE(pins_daily_metrics.daily_save_velocity, 0), COALESCE(EXCLUDED.daily_save_velocity, 0))
              WHEN EXCLUDED.daily_save_velocity IS NOT NULL THEN EXCLUDED.daily_save_velocity
              ELSE pins_daily_metrics.daily_save_velocity
            END,
            updated_at = NOW();
        `;

        for (const [pid] of pinMap) {
          confirmedPinIds.add(pid);
        }
      } catch (shardErr) {
        console.error(`[PinRepository.writeBatchToDeterministicShards] Shard #${shardId} batch write failed:`, shardErr?.message || shardErr);
        failedShards.push(shardId);
      }
    }));
  }

  return confirmedPinIds;
}

export const PinRepository = {
  insertNewPinsBatch,
  resavePinsMetricsBatch,
  ingestPinsBatch,
  getPinDossier,
  syncPinAcrossAllFourPillars,
  writeBatchToDeterministicShards,
  normalizeCleanDomain
};

export default PinRepository;
