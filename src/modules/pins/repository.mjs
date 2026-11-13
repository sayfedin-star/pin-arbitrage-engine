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

import { calculateDailyVelocity, isMultiStageHydrationJump, sanitizeDossierTrajectory } from '../../lib/math.mjs';
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
 * across `universal_master_pins`, `pins_daily_metrics`, and the operational tables (`keyword_serp_current`, `competitor_pins`, `pa_pins`)
 * plus `keyword_displaced_index`, then returns refreshed universal dossier.
 */
export async function syncPinAcrossAllFourPillars({
  sql = null,
  hubSql = null,
  pinId,
  scrapedPin,
  env = null,
  ctx = null,
  fetchUniversalPinDossier: injectedFetchUniversalPinDossier = null
}) {
  // [INVARIANT: ATOMIC-TRANSACTION-BUILDER]
  // [INVARIANT: UNIFIED-POSTGRES-SSOT]
  const dbSql = sql || hubSql;
  const cleanPinId = String(pinId || '').trim();
  if (!cleanPinId) {
    throw new Error('[syncPinAcrossAllFourPillars] pinId is required');
  }
  if (!scrapedPin || typeof scrapedPin !== 'object') {
    throw new Error('[syncPinAcrossAllFourPillars] scrapedPin object is required');
  }
  if (!dbSql) {
    throw new Error('[syncPinAcrossAllFourPillars] sql client is required');
  }

  const fetchUniversalPinDossierFn = injectedFetchUniversalPinDossier || fetchUniversalPinDossier;

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

  // 4. Pillar 1: Upsert universal_master_pins
  await dbSql`
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

  // 5. Query Active SERP State (keyword_serp_current) including baseline velocity columns
  const targetRows = await dbSql`
    SELECT
      keyword_id, rank_position, is_displaced, save_count, repin_count,
      comment_count, share_count, baseline_day_saves, baseline_day_date,
      daily_save_velocity, delta_repins_24h, crawled_at, last_known_rank
    FROM keyword_serp_current
    WHERE pin_id = ${cleanPinId}
      AND COALESCE(is_displaced, FALSE) = FALSE
      AND rank_position IS NOT NULL;
  `;

  // 5B. Displaced / Competitor / Archive Fallback: Query keyword_displaced_index and pins_daily_metrics
  let displacedRows = [];
  try {
    displacedRows = await dbSql`
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
    priorShardMetrics = await dbSql`
      SELECT snapshot_date::text AS snapshot_date, save_count, repin_count, comment_count, share_count, reaction_count, daily_save_velocity, updated_at
      FROM pins_daily_metrics
      WHERE pin_id = ${cleanPinId}
      ORDER BY snapshot_date DESC
      LIMIT 3;
    `;
  } catch (metricLookupErr) {
    console.warn(`[syncPinAcrossAllFourPillars] pins_daily_metrics baseline lookup note: ${metricLookupErr.message}`);
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

  // 7. Upsert two-tier modern snapshot metrics (pins_daily_metrics)
  await dbSql`
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
  await dbSql`
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

    await dbSql`
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

  // 9. Update active SERP state in keyword_serp_current
  if (targetRows.length > 0) {
    const incomingSyncMethod = isCarousel ? 'carousel' : (scrapedPin.creation_method || scrapedPin.method || '');
    await dbSql`
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

  // 9B. Update keyword_displaced_index if the pin is tracked in the Displaced Vault
  if (displacedRows.length > 0) {
    await dbSql`
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

  // 10. Update competitor_pins metric state if tracked competitor pin (creative SSOT lives in universal_master_pins)
  await dbSql`
    UPDATE competitor_pins
    SET
      save_count = CASE WHEN ${hasExplicitScrapedSaves} OR ${newSaves} > 0 THEN ${newSaves}::bigint ELSE save_count END,
      repin_count = CASE WHEN ${newRepins} > 0 OR ${hasExplicitScrapedSaves} THEN ${newRepins}::bigint ELSE repin_count END,
      comment_count = GREATEST(comment_count, ${newComments}),
      metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify(rawMetaToStore)}::jsonb,
      updated_at = NOW()
    WHERE pin_id = ${cleanPinId};
  `;

  // 11. Update pa_pins metric state if in PinArchive (creative SSOT lives in universal_master_pins)
  await dbSql`
    UPDATE pa_pins
    SET
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
  const refreshedDossier = await fetchUniversalPinDossierFn({ sql: dbSql, pinId: cleanPinId, ctx, env, bypassEdgeCache: true });

  return {
    success: true,
    synced: true,
    pin_id: cleanPinId,
    syncVelocity,
    dossier: refreshedDossier
  };
}

/**
 * 6. Unified Universal 4-Pillar Pin Dossier (`fetchUniversalPinDossier`)
 * Single-DB pure read-only dossier retrieval combining master pin creative,
 * daily trajectory snapshots, SERP keyword positions, competitor profile context,
 * and intraday checkpoints.
 */
export async function fetchUniversalPinDossier({ sql = null, hubSql = null, pinId, ctx = null, env = null, bypassEdgeCache = false } = {}) {
  const dbSql = sql || hubSql;
  const cleanPinId = String(pinId || '').trim();
  if (!cleanPinId) throw new Error('Pin ID is required');
  if (!dbSql) {
    return {
      success: false,
      error: 'DB_UNAVAILABLE',
      reason: 'MISSING_SQL_CLIENT',
      message: 'Database connection is not configured.'
    };
  }

  let dbError = null;
  const captureDbErr = (err) => {
    if (!dbError && err) dbError = err;
  };

  const hubSerpPromise = dbSql`
    SELECT 
      sc.keyword_id, sc.pin_id, sc.title, sc.domain, sc.destination_url, sc.image_url,
      sc.creator_username, sc.board_name, sc.save_count, sc.repin_count,
      COALESCE(sc.comment_count, 0) as comment_count,
      COALESCE(sc.share_count, 0) as share_count,
      0 as reaction_count,
      sc.daily_save_velocity, sc.dominant_color, sc.visual_annotations,
      sc.rank_position, sc.prev_rank_position, sc.last_known_rank, sc.is_displaced, sc.metadata,
      COALESCE(sc.crawled_at, sc.updated_at) as crawled_at,
      sc.updated_at,
      sc.baseline_day_saves, sc.baseline_day_date,
      tk.keyword AS keyword_name,
      sc.creation_method,
      sc.created_at_pinterest,
      cprof.id as competitor_id,
      cprof.username as competitor_username,
      cprof.display_name as competitor_display_name,
      cprof.is_active as competitor_active
    FROM keyword_serp_current sc
    LEFT JOIN tracked_keywords tk ON tk.id = sc.keyword_id
    LEFT JOIN competitor_profiles cprof ON cprof.username = sc.creator_username
    WHERE sc.pin_id = ${cleanPinId}
    UNION ALL
    SELECT 
      kdi.keyword_id, kdi.pin_id, '' as title, COALESCE(kdi.domain, '') as domain, '' as destination_url, '' as image_url,
      COALESCE(kdi.creator_username, '') as creator_username, '' as board_name, kdi.save_count, kdi.repin_count,
      COALESCE(kdi.comment_count, 0) as comment_count,
      COALESCE(kdi.share_count, 0) as share_count,
      0 as reaction_count,
      kdi.daily_save_velocity, '#888888' as dominant_color, '[]'::jsonb as visual_annotations,
      NULL::int as rank_position, NULL::int as prev_rank_position, kdi.last_known_rank,
      TRUE as is_displaced,
      jsonb_build_object(
        'delta_repins_24h', kdi.delta_repins_24h,
        'gains_5d', kdi.gains_5d,
        'gains_7d', kdi.gains_7d,
        'gains_10d', kdi.gains_10d,
        'gains_15d', kdi.gains_15d
      ) as metadata,
      kdi.updated_at as crawled_at, kdi.updated_at,
      NULL::bigint as baseline_day_saves, NULL::date as baseline_day_date,
      tk.keyword AS keyword_name,
      NULL::text as creation_method,
      NULL::timestamptz as created_at_pinterest,
      cprof.id as competitor_id,
      cprof.username as competitor_username,
      cprof.display_name as competitor_display_name,
      cprof.is_active as competitor_active
    FROM keyword_displaced_index kdi
    LEFT JOIN tracked_keywords tk ON tk.id = kdi.keyword_id
    LEFT JOIN competitor_profiles cprof ON cprof.username = kdi.creator_username
    WHERE kdi.pin_id = ${cleanPinId}
      AND NOT EXISTS (
        SELECT 1 FROM keyword_serp_current sc2
        WHERE sc2.pin_id = kdi.pin_id AND sc2.keyword_id = kdi.keyword_id
      )
    ORDER BY save_count DESC;
  `.catch((err) => { captureDbErr(err); return []; });

  const hubCompetitorPromise = dbSql`
    SELECT 
      cp.pin_id, cp.competitor_id, cprof.username as competitor_username, cprof.display_name, cprof.is_active as competitor_active,
      COALESCE(NULLIF(ump.title, ''), cp.title) as title,
      COALESCE(NULLIF(ump.description, ''), cp.description) as description,
      COALESCE(NULLIF(ump.alt_text, ''), cp.alt_text) as alt_text,
      COALESCE(NULLIF(ump.image_url, ''), cp.image_url) as image_url,
      COALESCE(NULLIF(ump.destination_url, ''), cp.destination_url) as destination_url,
      COALESCE(NULLIF(ump.domain, ''), cp.link_domain) as domain,
      COALESCE(NULLIF(cp.board_name, ''), ump.board_name) as board_name,
      GREATEST(COALESCE(ump.save_count, 0), COALESCE(cp.save_count, 0)) as save_count,
      GREATEST(COALESCE(ump.repin_count, 0), COALESCE(cp.repin_count, 0)) as repin_count,
      GREATEST(COALESCE(ump.comment_count, 0), COALESCE(cp.comment_count, 0)) as comment_count,
      COALESCE(cp.created_at_pinterest, ump.created_at_pinterest) as created_at_pinterest,
      cp.updated_at,
      COALESCE(ump.metadata, '{}'::jsonb) || COALESCE(cp.metadata, '{}'::jsonb) as metadata
    FROM competitor_pins cp
    LEFT JOIN competitor_profiles cprof ON cprof.id = cp.competitor_id
    LEFT JOIN universal_master_pins ump ON ump.pin_id = cp.pin_id
    WHERE cp.pin_id = ${cleanPinId}
    LIMIT 1;
  `.catch((err) => { captureDbErr(err); return []; });

  const masterAndSnapsPromise = Promise.all([
    getPinDossier(dbSql, cleanPinId).catch((err) => { captureDbErr(err); return null; }),
    dbSql`
      SELECT 
        id, snapshot_date::text AS snapshot_date, rank_position, is_displaced, save_count, repin_count,
        comment_count, share_count, reaction_count, daily_save_velocity,
        keyword_id, competitor_id, created_at, created_at AS crawled_at, created_at AS updated_at
      FROM pins_daily_snapshots
      WHERE pin_id = ${cleanPinId}
      ORDER BY snapshot_date DESC, created_at DESC
      LIMIT 90;
    `.catch((err) => { captureDbErr(err); return []; })
  ]);

  const [
    [repoDossier, rollupsOrSnaps],
    hubSerpRowsRaw,
    hubCompetitorRowsRaw
  ] = await Promise.all([
    masterAndSnapsPromise,
    hubSerpPromise,
    hubCompetitorPromise
  ]);
  const hubPaRowsRaw = [];

  const row = repoDossier?.creative || null;
  let masterRecord = null;
  if (row) {
    const meta = typeof row.metadata === 'object' && row.metadata !== null ? row.metadata : {};
    masterRecord = {
      ...row,
      first_discovered_at: row.first_saved_at || row.first_discovered_at || null,
      last_scraped_at: row.last_resaved_at || row.last_scraped_at || row.updated_at || null,
      creation_method: meta.creation_method || meta.method || row.creation_method || null
    };
  }
  const initialSnapshots = (Array.isArray(rollupsOrSnaps) && rollupsOrSnaps.length > 0)
    ? rollupsOrSnaps
    : (repoDossier?.daily_trajectory || []);

  if (masterRecord) {
    const mMeta = typeof masterRecord.metadata === 'object' && masterRecord.metadata !== null ? masterRecord.metadata : {};
    const candidateMethods = [
      masterRecord.creation_method,
      mMeta.creation_method,
      mMeta.method
    ].filter(m => m && typeof m === 'string' && m.trim().length > 0);
    masterRecord.creation_method = candidateMethods.find(m => m.trim().toLowerCase() !== 'pinterest_platform') || candidateMethods[0] || null;
  }
  let snapshots = initialSnapshots;
  const hubSerpRows = Array.isArray(hubSerpRowsRaw) ? hubSerpRowsRaw : [];

  function normalizeMetadata(raw) {
    if (!raw) return {};
    if (typeof raw === 'string') {
      try {
        return normalizeMetadata(JSON.parse(raw));
      } catch (_) {
        return {};
      }
    }
    if (Array.isArray(raw)) {
      let merged = {};
      for (const item of raw) {
        merged = { ...merged, ...normalizeMetadata(item) };
      }
      return merged;
    }
    if (typeof raw === 'object') {
      const clean = {};
      for (const [k, v] of Object.entries(raw)) {
        if (v !== '' && v !== null && v !== undefined) {
          clean[k] = v;
        }
      }
      return clean;
    }
    return {};
  }

  function normalizeVisualAnnotations(raw) {
    if (!raw) return [];
    let list = [];
    if (Array.isArray(raw)) {
      list = raw;
    } else if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        list = Array.isArray(parsed) ? parsed : [];
      } catch (_) {
        list = [];
      }
    }
    return list.map(a => typeof a === 'string' ? a : (a?.name || a?.label || '')).filter(Boolean);
  }

  const topHubMeta = normalizeMetadata(hubSerpRows[0]?.metadata);
  const masterMetaObj = normalizeMetadata(masterRecord?.metadata);

  const unionSet = new Set();
  for (const tag of normalizeVisualAnnotations(masterRecord?.visual_annotations)) {
    if (tag && typeof tag === 'string' && tag.trim()) unionSet.add(tag.trim());
  }
  for (const tag of normalizeVisualAnnotations(masterMetaObj?.visual_annotations)) {
    if (tag && typeof tag === 'string' && tag.trim()) unionSet.add(tag.trim());
  }
  for (const rowItem of hubSerpRows) {
    for (const tag of normalizeVisualAnnotations(rowItem.visual_annotations)) {
      if (tag && typeof tag === 'string' && tag.trim()) unionSet.add(tag.trim());
    }
    const rMeta = normalizeMetadata(rowItem.metadata);
    for (const tag of normalizeVisualAnnotations(rMeta.visual_annotations)) {
      if (tag && typeof tag === 'string' && tag.trim()) unionSet.add(tag.trim());
    }
  }

  if (!masterRecord) {
    if (hubSerpRows.length > 0 && (hubSerpRows[0].title || hubSerpRows[0].image_url || Number(hubSerpRows[0].save_count) > 0)) {
      const topRow = hubSerpRows[0];
      const candidateHubMethods = [
        topRow.creation_method,
        topHubMeta.creation_method,
        topHubMeta.method
      ].filter(m => m && typeof m === 'string' && m.trim().length > 0);
      const resolvedHubMethod = candidateHubMethods.find(m => m.trim().toLowerCase() !== 'pinterest_platform') || candidateHubMethods[0] || 'pinterest_platform';
      masterRecord = {
        pin_id: topRow.pin_id,
        title: topRow.title || topHubMeta.seo_title || '',
        domain: topRow.domain || topHubMeta.seo_canonical_domain || '',
        destination_url: topRow.destination_url || topHubMeta.tracked_link || topHubMeta.utm_link || '',
        image_url: topRow.image_url,
        creator_username: topRow.creator_username || topHubMeta.pinner?.username || topHubMeta.domain_official_user?.username || '',
        board_name: topRow.board_name || topHubMeta.board_name || '',
        save_count: topRow.save_count,
        repin_count: topRow.repin_count,
        daily_save_velocity: topRow.daily_save_velocity,
        dominant_color: topRow.dominant_color || topHubMeta.dominant_color || '#888888',
        alt_text: topHubMeta.alt_text || '',
        description: topHubMeta.description || '',
        created_at_pinterest: topRow.created_at_pinterest || topHubMeta.created_at_pinterest || null,
        creation_method: resolvedHubMethod,
        visual_annotations: Array.from(unionSet),
        metadata: { ...topHubMeta, creation_method: resolvedHubMethod, method: resolvedHubMethod }
      };
    } else if (hubCompetitorRowsRaw && hubCompetitorRowsRaw.length > 0 && (hubCompetitorRowsRaw[0].title || hubCompetitorRowsRaw[0].image_url)) {
      const compRow = hubCompetitorRowsRaw[0];
      const cMeta = normalizeMetadata(compRow.metadata);
      const cMethod = cMeta.creation_method || cMeta.method || 'pinterest_platform';
      const cAnnotations = normalizeVisualAnnotations(cMeta.visual_annotations || compRow.visual_annotations);
      masterRecord = {
        pin_id: compRow.pin_id,
        title: compRow.title || cMeta.seo_title || '',
        domain: compRow.domain || '',
        destination_url: compRow.destination_url || '',
        image_url: compRow.image_url || '',
        creator_username: compRow.competitor_username || '',
        board_name: compRow.board_name || '',
        save_count: Number(compRow.save_count || 0),
        repin_count: Number(compRow.repin_count || 0),
        daily_save_velocity: Number(cMeta.daily_save_velocity || cMeta.velocity || 0),
        dominant_color: cMeta.dominant_color || '#888888',
        alt_text: compRow.alt_text || cMeta.alt_text || '',
        description: compRow.description || cMeta.description || '',
        created_at_pinterest: compRow.created_at_pinterest || null,
        creation_method: cMethod,
        visual_annotations: cAnnotations.length > 0 ? cAnnotations : Array.from(unionSet),
        metadata: { ...cMeta, creation_method: cMethod, method: cMethod }
      };
    } else if (hubPaRowsRaw && hubPaRowsRaw.length > 0 && (hubPaRowsRaw[0].title || hubPaRowsRaw[0].image_url)) {
      const paRow = hubPaRowsRaw[0];
      const paAnnotations = normalizeVisualAnnotations(paRow.visual_annotations);
      masterRecord = {
        pin_id: paRow.pin_id,
        title: paRow.title || '',
        domain: paRow.domain || '',
        destination_url: paRow.destination_url || '',
        image_url: paRow.image_url || '',
        creator_username: paRow.creator_username || '',
        board_name: paRow.board_name || '',
        save_count: Number(paRow.save_count || 0),
        repin_count: Number(paRow.repin_count || 0),
        daily_save_velocity: Number(paRow.daily_save_velocity || 0),
        dominant_color: paRow.dominant_color || '#888888',
        alt_text: paRow.alt_text || '',
        description: paRow.description || '',
        created_at_pinterest: paRow.created_at_pinterest || null,
        creation_method: 'pinterest_platform',
        visual_annotations: paAnnotations.length > 0 ? paAnnotations : Array.from(unionSet),
        metadata: { creation_method: 'pinterest_platform', method: 'pinterest_platform' }
      };
    }
  }

  if (masterRecord) {
    if (!masterRecord.board_name) {
      masterRecord.board_name =
        hubSerpRows.find(r => r?.board_name && String(r.board_name).trim())?.board_name ||
        masterMetaObj.board_name ||
        topHubMeta.board_name ||
        '';
    }
    if (!masterRecord.alt_text) {
      masterRecord.alt_text = masterMetaObj.alt_text || topHubMeta.alt_text || '';
    }
    if (!masterRecord.description) {
      masterRecord.description = masterMetaObj.description || topHubMeta.description || '';
    }
    if (!masterRecord.created_at_pinterest) {
      masterRecord.created_at_pinterest = masterMetaObj.created_at_pinterest || hubSerpRows[0]?.created_at_pinterest || topHubMeta.created_at_pinterest || null;
    }
    const candidateMethods = [
      masterRecord?.creation_method,
      masterMetaObj.creation_method,
      masterMetaObj.method,
      hubSerpRows[0]?.creation_method,
      topHubMeta.creation_method,
      topHubMeta.method
    ].filter(m => m && typeof m === 'string' && m.trim().length > 0);
    const resolvedBestMethod = candidateMethods.find(m => m.trim().toLowerCase() !== 'pinterest_platform') || candidateMethods[0] || 'pinterest_platform';
    masterRecord.creation_method = resolvedBestMethod;
    masterRecord.metadata = { ...topHubMeta, ...masterMetaObj, creation_method: resolvedBestMethod, method: resolvedBestMethod };
  }

  const finalVisualAnnotations = Array.from(unionSet)
    .map(t => String(t || '').trim())
    .filter(t => t.length >= 2 && !/^not[\s-_]?given$/i.test(t))
    .slice(0, 15);

  const snapshotList = snapshots || [];
  const snapshotMap = new Map();

  function formatUtcDate(val) {
    if (!val) return '';
    if (val instanceof Date) {
      if (isNaN(val.getTime())) return '';
      const year = val.getUTCFullYear();
      const month = String(val.getUTCMonth() + 1).padStart(2, '0');
      const day = String(val.getUTCDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    if (typeof val === 'string') {
      const s = val.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
      const d = new Date(s);
      if (!isNaN(d.getTime())) {
        const year = d.getUTCFullYear();
        const month = String(d.getUTCMonth() + 1).padStart(2, '0');
        const day = String(d.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      }
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    }
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      const year = d.getUTCFullYear();
      const month = String(d.getUTCMonth() + 1).padStart(2, '0');
      const day = String(d.getUTCDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    return '';
  }

  const existingSnapshotDates = new Set();
  for (const s of snapshotList) {
    const sDate = formatUtcDate(s.snapshot_date);
    if (!sDate) continue;
    existingSnapshotDates.add(sDate);
    const dedupKey = `${sDate}_${s.keyword_id || 'global'}`;
    snapshotMap.set(dedupKey, s);
  }

  const deletedSnapshotDates = new Set([
    ...(Array.isArray(masterRecord?.metadata?.deleted_snapshot_dates) ? masterRecord.metadata.deleted_snapshot_dates : []),
    ...(Array.isArray(topHubMeta?.deleted_snapshot_dates) ? topHubMeta.deleted_snapshot_dates : [])
  ]);

  for (const sc of hubSerpRows) {
    const crawlDate = sc.crawled_at || sc.updated_at;
    const crawlIso = formatUtcDate(crawlDate);
    const canUseCrawlDate = crawlIso && !deletedSnapshotDates.has(crawlIso) && (existingSnapshotDates.size === 0 || existingSnapshotDates.has(crawlIso));
    if (canUseCrawlDate) {
      const dedupKey = `${crawlIso}_${sc.keyword_id || 'global'}`;
      const crawlIsoStr = repoSafeIsoDate(sc.crawled_at) || repoSafeIsoDate(sc.updated_at) || (crawlIso + 'T00:00:00.000Z');
      const updatedIsoStr = repoSafeIsoDate(sc.updated_at) || crawlIsoStr;
      const livePoint = {
        pin_id: cleanPinId,
        keyword_id: sc.keyword_id,
        keyword_name: sc.keyword_name,
        snapshot_date: crawlIso,
        rank_position: sc.rank_position ?? sc.last_known_rank ?? null,
        last_known_rank: sc.last_known_rank ?? null,
        is_displaced: Boolean(sc.is_displaced),
        save_count: Number(sc.save_count || 0),
        repin_count: Number(sc.repin_count || 0),
        comment_count: Number(sc.comment_count || 0),
        share_count: Number(sc.share_count || 0),
        reaction_count: Number(sc.reaction_count || 0),
        daily_save_velocity: (sc.daily_save_velocity !== undefined && sc.daily_save_velocity !== null) ? Number(sc.daily_save_velocity) : 0,
        created_at: updatedIsoStr,
        crawled_at: crawlIsoStr,
        updated_at: updatedIsoStr,
        metadata: sc.metadata || {}
      };

      if (!snapshotMap.has(dedupKey)) {
        snapshotMap.set(dedupKey, livePoint);
      } else {
        const existing = snapshotMap.get(dedupKey);
        const existingTs = existing.crawled_at || existing.updated_at || existing.created_at;
        const incomingTs = livePoint.crawled_at || livePoint.updated_at;
        const isNewer = !existingTs || (incomingTs && new Date(incomingTs).getTime() >= new Date(existingTs).getTime());

        existing.comment_count = Math.max(Number(existing.comment_count || 0), Number(livePoint.comment_count || 0));
        existing.share_count = Math.max(Number(existing.share_count || 0), Number(livePoint.share_count || 0));
        existing.reaction_count = Math.max(Number(existing.reaction_count || 0), Number(livePoint.reaction_count || 0));

        if (isNewer) {
          if (Number(livePoint.save_count || 0) > 0) existing.save_count = Number(livePoint.save_count);
          if (Number(livePoint.repin_count || 0) > 0) existing.repin_count = Number(livePoint.repin_count);
          existing.crawled_at = livePoint.crawled_at;
          existing.updated_at = livePoint.updated_at;
          if (livePoint.rank_position != null) existing.rank_position = livePoint.rank_position;
          if (livePoint.last_known_rank != null) existing.last_known_rank = livePoint.last_known_rank;
          if (livePoint.is_displaced != null) existing.is_displaced = livePoint.is_displaced;
          if (livePoint.daily_save_velocity != null && livePoint.daily_save_velocity > 0) {
            existing.daily_save_velocity = livePoint.daily_save_velocity;
          }
        } else {
          if (!existing.save_count && Number(livePoint.save_count || 0) > 0) existing.save_count = Number(livePoint.save_count);
          if (!existing.repin_count && Number(livePoint.repin_count || 0) > 0) existing.repin_count = Number(livePoint.repin_count);
        }
      }
    }

    const rawBaseDate = sc.baseline_day_date || (sc.daily_save_velocity > 0 && crawlIso ? new Date(new Date(crawlIso + 'T00:00:00.000Z').getTime() - 86400000) : null);
    const rawBaseSaves = sc.baseline_day_saves != null ? Number(sc.baseline_day_saves) : (sc.daily_save_velocity > 0 && sc.save_count != null ? Math.max(0, Number(sc.save_count) - Number(sc.daily_save_velocity)) : null);

    if (rawBaseDate && rawBaseSaves != null) {
      const baseDateStr = formatUtcDate(rawBaseDate);
      if (baseDateStr && !deletedSnapshotDates.has(baseDateStr) && (!crawlIso || baseDateStr < crawlIso)) {
        const baseKey = `${baseDateStr}_${sc.keyword_id || 'global'}`;
        if (!snapshotMap.has(baseKey)) {
          const baseIsoStr = baseDateStr + 'T00:00:00.000Z';
          snapshotMap.set(baseKey, {
            pin_id: cleanPinId,
            keyword_id: sc.keyword_id,
            keyword_name: sc.keyword_name,
            snapshot_date: baseDateStr,
            rank_position: sc.prev_rank_position ?? sc.rank_position ?? null,
            last_known_rank: sc.last_known_rank ?? null,
            is_displaced: Boolean(sc.is_displaced),
            save_count: Number(rawBaseSaves || 0),
            repin_count: 0,
            comment_count: 0,
            share_count: 0,
            reaction_count: 0,
            daily_save_velocity: 0,
            created_at: baseIsoStr,
            crawled_at: baseIsoStr,
            updated_at: baseIsoStr,
            metadata: {}
          });
        }
      }
    }
  }

  if (snapshotMap.size === 0 && masterRecord) {
    const todayStr = formatUtcDate(new Date());
    const livePoint = {
      pin_id: cleanPinId,
      keyword_id: null,
      keyword_name: null,
      snapshot_date: todayStr,
      rank_position: null,
      last_known_rank: null,
      is_displaced: false,
      save_count: Number(masterRecord.save_count || 0),
      repin_count: Number(masterRecord.repin_count || 0),
      comment_count: Number(masterRecord.comment_count || 0),
      share_count: 0,
      reaction_count: 0,
      daily_save_velocity: Number(masterRecord.daily_save_velocity || 0),
      created_at: new Date().toISOString(),
      crawled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      metadata: masterRecord.metadata || {}
    };
    snapshotMap.set(`${todayStr}_global`, livePoint);
  }

  snapshots = Array.from(snapshotMap.values()).sort(
    (a, b) => new Date(b.snapshot_date) - new Date(a.snapshot_date)
  );

  const rawSnapshots = snapshots || [];
  const kwMap = new Map();
  for (const r of hubSerpRows) {
    if (r?.keyword_id && r?.keyword_name) kwMap.set(Number(r.keyword_id), r.keyword_name);
  }
  const missingKwIds = [...new Set(rawSnapshots.map(s => s.keyword_id).filter(id => id != null && !isNaN(Number(id)) && !kwMap.has(Number(id))))];
  if (missingKwIds.length > 0) {
    const kwRows = await dbSql`SELECT id, keyword FROM tracked_keywords WHERE id = ANY(${missingKwIds});`.catch(() => []);
    for (const r of kwRows) {
      if (r && r.id != null) kwMap.set(Number(r.id), r.keyword);
    }
  }

  const serpByKeyword = new Map();
  for (const rowItem of hubSerpRows) {
    if (rowItem && rowItem.keyword_id) {
      serpByKeyword.set(Number(rowItem.keyword_id), rowItem);
    }
  }

  const todayUtcStr = formatUtcDate(new Date());

  const enrichedSnapshots = rawSnapshots.map((s) => {
    const sDate = formatUtcDate(s.snapshot_date);
    const kid = s.keyword_id != null ? Number(s.keyword_id) : null;
    const isToday = Boolean(sDate && sDate === todayUtcStr);
    const serpMatch = isToday ? ((kid ? serpByKeyword.get(kid) : null) || hubSerpRows[0] || null) : null;

    const rawRankPos = Number(s.rank_position);
    const hasValidPositiveRank = Number.isFinite(rawRankPos) && rawRankPos >= 1;

    let isDisplaced;
    let rankPosition;
    let lastKnownRank;

    if (isToday) {
      if (s.is_displaced || serpMatch?.is_displaced || !hasValidPositiveRank) {
        isDisplaced = true;
        rankPosition = null;
        lastKnownRank = Number(s.last_known_rank) > 0
          ? Number(s.last_known_rank)
          : (Number(serpMatch?.last_known_rank) > 0
              ? Number(serpMatch.last_known_rank)
              : (Number(serpMatch?.prev_rank_position) > 0
                  ? Number(serpMatch.prev_rank_position)
                  : (Number(serpMatch?.rank_position) > 0 ? Number(serpMatch.rank_position) : 100)));
      } else {
        isDisplaced = false;
        rankPosition = rawRankPos;
        lastKnownRank = Number(s.last_known_rank) > 0 ? Number(s.last_known_rank) : rawRankPos;
      }
    } else {
      if (s.is_displaced || !hasValidPositiveRank) {
        isDisplaced = true;
        rankPosition = null;
        lastKnownRank = Number(s.last_known_rank) > 0
          ? Number(s.last_known_rank)
          : (kid && Number(serpByKeyword.get(kid)?.last_known_rank) > 0
              ? Number(serpByKeyword.get(kid).last_known_rank)
              : (kid && Number(serpByKeyword.get(kid)?.prev_rank_position) > 0
                  ? Number(serpByKeyword.get(kid).prev_rank_position)
                  : (kid && Number(serpByKeyword.get(kid)?.rank_position) > 0
                      ? Number(serpByKeyword.get(kid).rank_position)
                      : (Number(s.catalog_rank) > 0 ? Number(s.catalog_rank) : 100))));
      } else {
        isDisplaced = false;
        rankPosition = rawRankPos;
        lastKnownRank = Number(s.last_known_rank) > 0 ? Number(s.last_known_rank) : rawRankPos;
      }
    }

    const catalogRank = s.catalog_rank || (isDisplaced ? (Number(lastKnownRank || 100) + 250) : rankPosition);
    const crawlTimestamp = repoSafeIsoDate(s.crawled_at || s.updated_at || s.created_at) || (sDate ? sDate + 'T00:00:00.000Z' : null);
    const updatedTimestamp = repoSafeIsoDate(s.updated_at) || crawlTimestamp;
    return {
      ...s,
      snapshot_date: sDate,
      crawled_at: crawlTimestamp,
      updated_at: updatedTimestamp,
      keyword_name: kid ? (kwMap.get(kid) || s.keyword_name || `Keyword #${kid}`) : (s.keyword_name || null),
      is_displaced: isDisplaced,
      rank_position: rankPosition,
      last_known_rank: lastKnownRank,
      catalog_rank: catalogRank
    };
  });

  const dailyMap = new Map();
  for (const s of enrichedSnapshots) {
    const dateKey = s.snapshot_date;
    if (!dateKey) continue;
    const crawlTs = repoSafeIsoDate(s.crawled_at || s.updated_at || s.created_at) || (dateKey + 'T00:00:00.000Z');
    const updatedTs = repoSafeIsoDate(s.updated_at) || crawlTs;
    if (!dailyMap.has(dateKey)) {
      dailyMap.set(dateKey, {
        row_key: dateKey,
        snapshot_id: s.id ? String(s.id) : dateKey,
        snapshot_date: dateKey,
        recorded_at: updatedTs || crawlTs,
        save_count: Number(s.save_count) || 0,
        repin_count: Number(s.repin_count) || 0,
        comment_count: Number(s.comment_count) || 0,
        share_count: Number(s.share_count) || 0,
        reaction_count: Number(s.reaction_count || 0),
        daily_save_velocity: Number(s.daily_save_velocity) || 0,
        best_rank: (s.rank_position && s.rank_position > 0) ? s.rank_position : 999,
        ranking_keywords: [],
        crawled_at: crawlTs,
        updated_at: updatedTs
      });
    }
    const day = dailyMap.get(dateKey);
    const isDayNewer = Boolean(crawlTs && (!day.crawled_at || new Date(crawlTs).getTime() >= new Date(day.crawled_at).getTime()));
    if (isDayNewer) {
      day.crawled_at = crawlTs;
      day.updated_at = updatedTs;
      day.recorded_at = updatedTs || crawlTs;
      if (Number(s.save_count) > 0) day.save_count = Number(s.save_count);
      if (Number(s.repin_count) > 0) day.repin_count = Number(s.repin_count);
      if (Number(s.daily_save_velocity) > 0) day.daily_save_velocity = Number(s.daily_save_velocity);
    } else {
      if (!day.save_count && Number(s.save_count) > 0) day.save_count = Number(s.save_count);
      if (!day.repin_count && Number(s.repin_count) > 0) day.repin_count = Number(s.repin_count);
      if (!day.daily_save_velocity && Number(s.daily_save_velocity) > 0) day.daily_save_velocity = Number(s.daily_save_velocity);
    }
    day.comment_count = Math.max(day.comment_count, Number(s.comment_count) || 0);
    day.share_count = Math.max(day.share_count, Number(s.share_count) || 0);
    day.reaction_count = Math.max(day.reaction_count, Number(s.reaction_count) || 0);
    const effRank = s.rank_position || s.last_known_rank || null;
    if (effRank && effRank > 0) {
      day.best_rank = Math.min(day.best_rank, effRank);
    }
    if (s.keyword_name) {
      const isDisplaced = Boolean(s.is_displaced);
      const rawPos = Number(s.rank_position);
      const hasPos = Number.isFinite(rawPos) && rawPos >= 1;

      const effDisplaced = isDisplaced || !hasPos;
      const liveRank = effDisplaced ? null : rawPos;
      const vaultRank = effDisplaced
        ? (Number(s.last_known_rank) > 0
            ? Number(s.last_known_rank)
            : (s.keyword_id && Number(serpByKeyword.get(Number(s.keyword_id))?.last_known_rank) > 0
                ? Number(serpByKeyword.get(Number(s.keyword_id)).last_known_rank)
                : (s.keyword_id && Number(serpByKeyword.get(Number(s.keyword_id))?.rank_position) > 0
                    ? Number(serpByKeyword.get(Number(s.keyword_id)).rank_position)
                    : 100)))
        : null;
      const effKwRank = effDisplaced ? vaultRank : liveRank;
      const sortRank = effDisplaced ? (vaultRank + 250) : (liveRank || 999);
      const kwObj = {
        keyword_id: s.keyword_id,
        keyword: s.keyword_name,
        rank: effKwRank,
        rank_position: liveRank,
        last_known_rank: vaultRank,
        is_displaced: effDisplaced,
        live_serp_rank: liveRank,
        vault_rank: vaultRank,
        effective_sort_rank: sortRank,
        catalog_rank: sortRank,
        saves: Number(s.save_count) || 0
      };
      const existingKwIdx = day.ranking_keywords.findIndex(k => (
        (k.keyword_id && s.keyword_id && k.keyword_id === s.keyword_id) ||
        (String(k.keyword || '').toLowerCase() === String(s.keyword_name || '').toLowerCase())
      ));
      if (existingKwIdx >= 0) {
        day.ranking_keywords[existingKwIdx] = kwObj;
      } else {
        day.ranking_keywords.push(kwObj);
      }
    }
  }

  const intradayList = Array.isArray(masterRecord?.metadata?.intraday_snapshots)
    ? masterRecord.metadata.intraday_snapshots
    : [];
  const trajectoryEntries = Array.from(dailyMap.values());
  const seenIntradayKeys = new Set();

  for (const cp of intradayList) {
    if (!cp || !cp.snapshot_date) continue;
    const cpDate = formatUtcDate(cp.snapshot_date);
    const cpId = String(cp.id || cp.recorded_at || '');
    if (!cpDate || deletedSnapshotDates.has(cpDate) || (cpId && deletedSnapshotDates.has(cpId))) continue;
    const parentDay = dailyMap.get(cpDate);
    const cpSaves = Number(cp.save_count || 0);
    const cpRepins = Number(cp.repin_count || 0);
    if (parentDay && cpSaves === Number(parentDay.save_count || 0) && cpRepins === Number(parentDay.repin_count || 0)) {
      continue;
    }
    const dedupIntra = `${cpDate}_${cpSaves}_${cpRepins}`;
    if (seenIntradayKeys.has(dedupIntra)) continue;
    seenIntradayKeys.add(dedupIntra);

    const recAt = repoSafeIsoDate(cp.recorded_at) || (cpDate + 'T00:00:00.000Z');
    trajectoryEntries.push({
      row_key: cpId || `${cpDate}_${recAt}`,
      snapshot_id: cpId || `${cpDate}_${recAt}`,
      snapshot_date: cpDate,
      recorded_at: recAt,
      crawled_at: recAt,
      updated_at: recAt,
      is_intraday_checkpoint: true,
      save_count: cpSaves,
      repin_count: cpRepins,
      comment_count: Number(cp.comment_count || parentDay?.comment_count || 0),
      share_count: Number(cp.share_count || parentDay?.share_count || 0),
      reaction_count: Number(cp.reaction_count || parentDay?.reaction_count || 0),
      daily_save_velocity: 0,
      best_rank: parentDay?.best_rank || 999,
      ranking_keywords: parentDay?.ranking_keywords ? [...parentDay.ranking_keywords] : []
    });
  }

  const dailyTrajectory = trajectoryEntries.sort((a, b) => {
    const dCmp = String(b.snapshot_date || '').localeCompare(String(a.snapshot_date || ''));
    if (dCmp !== 0) return dCmp;
    return String(b.recorded_at || b.updated_at || '').localeCompare(String(a.recorded_at || a.updated_at || ''));
  });
  const chronoDays = [...dailyTrajectory].reverse();

  if (chronoDays[0] && chronoDays[0].is_hydration_jump === undefined) {
    chronoDays[0].is_hydration_jump = false;
  }
  if (chronoDays.length === 1 && chronoDays[0]) {
    const cSaves = Number(chronoDays[0].save_count || 0);
    const cVel = Number(chronoDays[0].daily_save_velocity || 0);
    if (cSaves > 0 && cVel >= cSaves) {
      chronoDays[0].daily_save_velocity = 0;
      chronoDays[0].window_24h_velocity = 0;
      chronoDays[0].window_24h_delta = 0;
    }
  }

  for (let i = 1; i < chronoDays.length; i++) {
    const prev = chronoDays[i - 1];
    const curr = chronoDays[i];
    const prevDayStr = String(prev.snapshot_date || '').slice(0, 10);
    const currDayStr = String(curr.snapshot_date || '').slice(0, 10);
    const isSameDayStep = Boolean(currDayStr && prevDayStr && currDayStr === prevDayStr);
    const prevDate = new Date(prevDayStr);
    const currDate = new Date(currDayStr);
    const elapsedDays = Math.max(1, Math.round((currDate - prevDate) / 86400000));
    const diff = curr.save_count - prev.save_count;

    let priorCalSnap = null;
    for (let j = i - 1; j >= 0; j--) {
      const candDayStr = String(chronoDays[j].snapshot_date || '').slice(0, 10);
      if (candDayStr && candDayStr < currDayStr) {
        priorCalSnap = chronoDays[j];
        break;
      }
    }

    const isJump = isMultiStageHydrationJump(prev, curr) || (priorCalSnap && isMultiStageHydrationJump(priorCalSnap, curr));
    if (isJump) {
      curr.is_hydration_jump = true;
      curr.velocity_mode = 'hydration_jump';
      curr.step_save_delta = 0;
      curr.daily_save_velocity = 0;
      curr.window_24h_velocity = 0;
      curr.window_24h_delta = 0;
      curr.window_elapsed_days = 1;
    } else {
      curr.is_hydration_jump = false;
      curr.velocity_mode = 'normal';
      curr.step_save_delta = diff;
      curr.step_elapsed_days = isSameDayStep ? 0 : elapsedDays;

      if (priorCalSnap && Number(priorCalSnap.save_count || 0) > 0) {
        const calElapsed = Math.max(1, Math.round((currDate - new Date(priorCalSnap.snapshot_date)) / 86400000));
        const calDiff = Math.max(0, curr.save_count - priorCalSnap.save_count);
        curr.window_24h_delta = calDiff;
        curr.window_elapsed_days = calElapsed;
        curr.window_24h_velocity = Math.round((calDiff / calElapsed) * 10) / 10;
        if (isSameDayStep) {
          curr.daily_save_velocity = curr.window_24h_velocity;
        }
      } else {
        curr.window_24h_delta = Math.max(0, diff);
        curr.window_elapsed_days = elapsedDays;
        curr.window_24h_velocity = diff <= 0 ? 0 : Math.round((diff / elapsedDays) * 10) / 10;
      }

      if (isSameDayStep) {
        curr.daily_save_velocity = priorCalSnap ? curr.window_24h_velocity : 0;
      } else if (elapsedDays >= 1) {
        curr.daily_save_velocity = diff <= 0 ? 0 : Math.round((diff / elapsedDays) * 10) / 10;
      }
    }
  }

  const rankingKeywordsFromMem = hubSerpRows
    .filter(sc => sc.keyword_id && (sc.keyword_name || kwMap.get(Number(sc.keyword_id))))
    .map(sc => {
      const isDisplaced = Boolean(sc.is_displaced);
      const rawPos = Number(sc.rank_position);
      const hasPos = Number.isFinite(rawPos) && rawPos >= 1;
      const effDisplaced = isDisplaced || !hasPos;
      const liveRank = effDisplaced ? null : rawPos;
      const vaultRank = effDisplaced ? (Number(sc.last_known_rank) || 1) : null;
      const sortRank = effDisplaced ? (vaultRank + 250) : (liveRank || 999);
      return {
        keyword_id: Number(sc.keyword_id),
        keyword: sc.keyword_name || kwMap.get(Number(sc.keyword_id)),
        rank: effDisplaced ? vaultRank : liveRank,
        rank_position: liveRank,
        last_known_rank: vaultRank,
        is_displaced: effDisplaced,
        live_serp_rank: liveRank,
        vault_rank: vaultRank,
        effective_sort_rank: sortRank,
        catalog_rank: sortRank,
        velocity: Number(sc.daily_save_velocity || 0)
      };
    });

  let competitorInfo = null;
  if (hubCompetitorRowsRaw && hubCompetitorRowsRaw.length > 0 && hubCompetitorRowsRaw[0].competitor_id) {
    competitorInfo = hubCompetitorRowsRaw[0];
  } else if (hubSerpRows.length > 0 && hubSerpRows[0].competitor_id) {
    competitorInfo = {
      competitor_id: hubSerpRows[0].competitor_id,
      competitor_username: hubSerpRows[0].competitor_username,
      display_name: hubSerpRows[0].competitor_display_name,
      competitor_active: hubSerpRows[0].competitor_active
    };
  } else if (masterRecord?.creator_username) {
    const [compRow] = await dbSql`
      SELECT id as competitor_id, username as competitor_username, display_name, is_active as competitor_active
      FROM competitor_profiles
      WHERE username = ${masterRecord.creator_username}
      LIMIT 1;
    `.catch(() => []);
    competitorInfo = compRow || null;
  }
  const hubContext = { ranking_keywords: rankingKeywordsFromMem, competitor_info: competitorInfo };

  if (!masterRecord && snapshots.length === 0 && (!hubContext?.ranking_keywords || hubContext.ranking_keywords.length === 0)) {
    if (dbError) {
      return {
        success: false,
        error: 'DB_UNAVAILABLE',
        reason: dbError.code || 'DB_ERROR',
        message: `Database query failed for pin ${cleanPinId}.`
      };
    }
    return {
      success: false,
      error: 'NOT_FOUND',
      message: `Pin ${cleanPinId} not found in any intelligence pillar.`
    };
  }

  const cleanMeta = (obj) => {
    const normalized = normalizeMetadata(obj);
    if (!normalized || typeof normalized !== 'object' || Array.isArray(normalized)) return {};
    return Object.fromEntries(
      Object.entries(normalized).filter(([_, v]) => v !== '' && v !== null && v !== undefined)
    );
  };

  const snapMeta = {
    ...cleanMeta(hubSerpRows[0]?.metadata),
    ...cleanMeta(masterRecord?.metadata)
  };

  const creatorUsername = masterRecord?.creator_username || hubSerpRows[0]?.creator_username || snapMeta.pinner?.username || snapMeta.domain_official_user?.username || '';
  const boardName = masterRecord?.board_name || hubSerpRows[0]?.board_name || snapMeta?.board_name || '';
  const boardSlug = masterRecord?.board_slug || (boardName ? boardName.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-') : '');
  const allMetas = [
    ...(masterRecord?.metadata ? [normalizeMetadata(masterRecord.metadata)] : []),
    ...(snapshots || []).map(s => normalizeMetadata(s.metadata)).filter(Boolean),
    ...(hubSerpRows || []).map(s => normalizeMetadata(s.metadata)).filter(Boolean)
  ];

  let canonicalPinId = null;
  let canonicalPinUrl = null;
  let seoCanonicalUrl = '';
  let seoRelatedInterests = [];

  for (const m of allMetas) {
    if (!canonicalPinId && (m.canonical_pin_id || m.canonical_pin?.entity_id)) {
      canonicalPinId = String(m.canonical_pin_id || m.canonical_pin?.entity_id);
    }
    if (!canonicalPinUrl && m.canonical_pin_url) {
      canonicalPinUrl = m.canonical_pin_url;
    }
    if (!seoCanonicalUrl && m.seo_canonical_url) {
      seoCanonicalUrl = m.seo_canonical_url;
    }
    if (seoRelatedInterests.length === 0 && Array.isArray(m.seo_related_interests) && m.seo_related_interests.length > 0) {
      seoRelatedInterests = m.seo_related_interests;
    }
  }

  if (!canonicalPinId && seoCanonicalUrl) {
    const urlMatch = String(seoCanonicalUrl).match(/\/pin\/([a-zA-Z0-9_-]+)/);
    if (urlMatch) {
      canonicalPinId = urlMatch[1];
    } else {
      const m = String(seoCanonicalUrl).match(/[a-zA-Z0-9_-]{10,128}/);
      if (m) canonicalPinId = m[0];
    }
  }
  if (!canonicalPinUrl && canonicalPinId) {
    canonicalPinUrl = `https://www.pinterest.com/pin/${canonicalPinId}/`;
  }
  if (!seoCanonicalUrl && canonicalPinId) {
    seoCanonicalUrl = `/pin/${canonicalPinId}/`;
  }
  const isCanonicalRoot = !canonicalPinId || String(canonicalPinId) === String(cleanPinId);

  if (masterRecord) {
    if (!masterRecord.description && snapMeta.description) {
      masterRecord.description = snapMeta.description;
    }
    if (!masterRecord.alt_text && snapMeta.alt_text) {
      masterRecord.alt_text = snapMeta.alt_text;
    }
    if (!masterRecord.created_at_pinterest && (snapMeta.created_at_pinterest || snapMeta.created_at)) {
      masterRecord.created_at_pinterest = snapMeta.created_at_pinterest || snapMeta.created_at;
    }
  }

  const candidateCreationMethods = [
    masterRecord?.creation_method,
    masterMetaObj.creation_method,
    masterMetaObj.method,
    snapMeta.creation_method,
    snapMeta.method,
    hubSerpRows[0]?.creation_method,
    topHubMeta.creation_method,
    topHubMeta.method
  ].filter(m => m && typeof m === 'string' && m.trim().length > 0);
  const resolvedCreationMethod = candidateCreationMethods.find(m => m.trim().toLowerCase() !== 'pinterest_platform') || candidateCreationMethods[0] || 'pinterest_platform';

  const hasDestLink = Boolean(
    masterRecord?.destination_url ||
    snapMeta.tracked_link ||
    snapMeta.utm_link ||
    hubSerpRows[0]?.destination_url
  );
  const isGoLinkless = Boolean(
    snapMeta.is_go_linkless ||
    snapMeta.go_linkless ||
    !hasDestLink
  );

  const algorithmicIntelligence = {
    is_repin: Boolean(snapMeta.is_repin ?? false),
    origin_pinner: snapMeta.origin_pinner || null,
    origin_pinner_followers: snapMeta.origin_pinner_followers ?? snapMeta.origin_pinner?.follower_count ?? null,
    domain_official_user: snapMeta.domain_official_user || null,
    creator_is_verified_merchant: Boolean(snapMeta.creator_is_verified_merchant ?? false),
    image_signature: snapMeta.image_signature || '',
    image_dimensions: snapMeta.image_dimensions || snapMeta.imageDimensions || null,
    seo_noindex_reason: snapMeta.seo_noindex_reason || null,
    is_indexed_google: !snapMeta.seo_noindex_reason,
    is_go_linkless: isGoLinkless,
    is_arbitrage_active: !isGoLinkless,
    category_breadcrumbs: Array.isArray(snapMeta.category_breadcrumbs) ? snapMeta.category_breadcrumbs : [],
    board_metrics: {
      pin_count: Number(snapMeta.board_pin_count || 0),
      order_modified_at: snapMeta.board_order_modified_at || null,
      board_url: snapMeta.board_url || null,
      cover_url: snapMeta.board_cover_url || null,
      thumbnail_url: snapMeta.board_thumbnail_url || null
    },
    creation_method: resolvedCreationMethod,
    seo_title: snapMeta.seo_title || masterRecord?.title || '',
    seo_description: snapMeta.seo_description || masterRecord?.description || '',
    seo_canonical_url: seoCanonicalUrl || snapMeta.seo_canonical_url || '',
    seo_canonical_domain: snapMeta.seo_canonical_domain || '',
    canonical_pin_id: canonicalPinId,
    canonical_pin_url: canonicalPinUrl,
    is_canonical_root: isCanonicalRoot,
    seo_related_interests: (seoRelatedInterests.length > 0 ? seoRelatedInterests : (Array.isArray(snapMeta.seo_related_interests) ? snapMeta.seo_related_interests : [])),
    rich_metadata: snapMeta.rich_metadata || null,
    visual_objects: Array.isArray(snapMeta.visual_objects) ? snapMeta.visual_objects : [],
    reactions: snapMeta.reactions || {},
    utm_link: snapMeta.utm_link || masterRecord?.destination_url || '',
    tracked_link: snapMeta.tracked_link || masterRecord?.destination_url || '',
    is_product: Boolean(snapMeta.is_product || snapMeta.isProduct || (Array.isArray(snapMeta.shopping_flags) && snapMeta.shopping_flags.includes('is_product'))),
    is_video: Boolean(snapMeta.is_video || snapMeta.isVideo || snapMeta.video_url),
    shopping_data: snapMeta.shopping_data || snapMeta.shoppingData || null
  };

  const latestLiveAnnotations = new Set(
    normalizeVisualAnnotations(snapMeta.visual_annotations || hubSerpRows[0]?.metadata?.visual_annotations)
      .map(t => String(t || '').trim())
      .filter(Boolean)
  );

  const detailedAnnotations = finalVisualAnnotations.map(tag => ({
    name: tag,
    is_live: latestLiveAnnotations.size > 0 ? latestLiveAnnotations.has(tag) : true,
    status: (latestLiveAnnotations.size > 0 && latestLiveAnnotations.has(tag)) ? 'live' : 'historical',
    label: (latestLiveAnnotations.size > 0 && latestLiveAnnotations.has(tag)) ? 'Live Active' : 'Historical Crawl'
  }));

  const reactionsSum = Object.values(snapMeta.reactions || {}).reduce((acc, v) => acc + (Number(v) || 0), 0);
  const resolvedReactionCount = Math.max(
    0,
    Number(masterRecord?.reaction_count || 0),
    Number(dailyTrajectory[0]?.reaction_count || 0),
    Number(hubSerpRows[0]?.reaction_count || 0),
    reactionsSum
  );

  const dossierResult = {
    success: true,
    pin_id: cleanPinId,
    is_degraded: Boolean(dbError),
    creative: {
      title: masterRecord?.title || `Pin ${cleanPinId}`,
      description: masterRecord?.description || '',
      alt_text: masterRecord?.alt_text || '',
      destination_url: masterRecord?.destination_url || snapMeta.tracked_link || snapMeta.utm_link || '',
      utm_link: snapMeta.utm_link || masterRecord?.destination_url || '',
      domain: masterRecord?.domain || 'pinterest.com',
      image_url: masterRecord?.image_url || '',
      dominant_color: masterRecord?.dominant_color || '#888888',
      visual_annotations: finalVisualAnnotations,
      visual_annotations_detailed: detailedAnnotations,
      created_at_pinterest: masterRecord?.created_at_pinterest || snapMeta.created_at_pinterest || snapMeta.created_at || null,
      creation_method: resolvedCreationMethod,
      image_signature: snapMeta.image_signature || '',
      canonical_pin_id: canonicalPinId,
      canonical_pin_url: canonicalPinUrl,
      is_canonical_root: isCanonicalRoot,
      save_count: Math.max(0, Number(masterRecord?.save_count || 0), Number(hubSerpRows[0]?.save_count || 0), Number(dailyTrajectory[0]?.save_count || 0)),
      repin_count: Math.max(0, Number(masterRecord?.repin_count || 0), Number(hubSerpRows[0]?.repin_count || 0), Number(dailyTrajectory[0]?.repin_count || 0)),
      comment_count: Number(masterRecord?.comment_count || dailyTrajectory[0]?.comment_count || hubSerpRows[0]?.comment_count || 0),
      share_count: Number(masterRecord?.share_count || dailyTrajectory[0]?.share_count || hubSerpRows[0]?.share_count || 0),
      reaction_count: resolvedReactionCount,
      daily_save_velocity: Number(dailyTrajectory[0]?.window_24h_velocity ?? dailyTrajectory[0]?.daily_save_velocity ?? masterRecord?.daily_save_velocity ?? hubSerpRows[0]?.daily_save_velocity ?? 0),
      first_discovered_pillar: masterRecord?.first_discovered_pillar || 'keyword',
      is_deleted: Boolean(masterRecord?.is_deleted || masterRecord?.metadata?.is_deleted || (masterRecord?.metadata?.status === 'archived_404')),
      metadata: snapMeta
    },
    algorithmic_intelligence: algorithmicIntelligence,
    pillar_1_creator_context: {
      creator_username: creatorUsername,
      creator_url: creatorUsername ? `https://www.pinterest.com/${creatorUsername}/` : null,
      board_name: boardName,
      board_slug: boardSlug,
      board_url: (creatorUsername && boardSlug) ? `https://www.pinterest.com/${creatorUsername}/${boardSlug}/` : null,
      competitor_tracked: Boolean(hubContext?.competitor_info),
      competitor_profile: hubContext?.competitor_info || null
    },
    pillar_2_keywords_context: {
      ranking_keywords: hubContext?.ranking_keywords || [],
      serp_impressions: (hubContext?.ranking_keywords || []).length,
      highest_rank: (hubContext?.ranking_keywords || []).reduce((min, k) => Math.min(min, k.rank || 999), 999)
    },
    pillar_3_related_pins_context: {
      seed_pin_id: cleanPinId,
      radar_url: `/api/keywords/visual-search?pin_id=${cleanPinId}`
    },
    daily_trajectory: dailyTrajectory,
    snapshots: enrichedSnapshots
  };

  sanitizeDossierTrajectory(dossierResult);
  return dossierResult;
}

/**
 * 7. Unified Historical Pin Trajectory Retrieval (`fetchPinTrajectory`)
 * Retrieves chronological daily snapshot metrics from pins_daily_metrics.
 */
export async function fetchPinTrajectory({ sql = null, hubSql = null, pinId, timeframe = 'all' } = {}) {
  const dbSql = sql || hubSql;
  const cleanId = String(pinId || '').trim();
  if (!cleanId || !dbSql) return { success: false, trajectory: [], snapshots: [] };

  try {
    const snapshots = await dbSql`
      SELECT 
        snapshot_date::text AS snapshot_date,
        save_count,
        daily_save_velocity,
        reaction_count,
        repin_count,
        comment_count,
        share_count,
        updated_at,
        updated_at AS crawled_at
      FROM pins_daily_metrics
      WHERE pin_id = ${cleanId}
      ORDER BY snapshot_date ASC;
    `;

    const processedSnapshots = (snapshots || []).map(s => ({ ...s }));
    for (let i = 1; i < processedSnapshots.length; i++) {
      const prev = processedSnapshots[i - 1];
      const curr = processedSnapshots[i];
      const isJump = isMultiStageHydrationJump(prev, curr);
      if (isJump) {
        curr.is_hydration_jump = true;
        curr.velocity_mode = 'hydration_amortized';
        curr.daily_save_velocity = 0;
      } else {
        curr.is_hydration_jump = false;
        curr.velocity_mode = 'normal';
      }
    }

    return {
      success: true,
      timeframe,
      trajectory: processedSnapshots,
      snapshots: processedSnapshots
    };
  } catch (err) {
    console.error(`[PinRepository.fetchPinTrajectory] Error for Pin ${cleanId}:`, err?.message || err);
    return { success: false, trajectory: [], snapshots: [], error: err.message };
  }
}

export const PinRepository = {
  insertNewPinsBatch,
  resavePinsMetricsBatch,
  ingestPinsBatch,
  getPinDossier,
  fetchUniversalPinDossier,
  fetchPinTrajectory,
  syncPinAcrossAllFourPillars,
  normalizeCleanDomain
};

export default PinRepository;
