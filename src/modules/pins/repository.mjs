/**
 * Unified Single-Database Pin Repository (SSOT)
 *
 * Strictly isolates the three core pin lifecycle operations:
 * 1. First-Time Save (`insertNewPinsBatch`): Fast `ON CONFLICT (pin_id) DO NOTHING` discovery insert
 *    plus opening snapshot in `pins_daily_metrics`. Zero row-lock contention or regex/JSONB merge overhead.
 * 2. Re-Save / Metric Refresh (`resavePinsMetricsBatch`): Direct metric & velocity update on existing pins
 *    plus today's snapshot in `pins_daily_metrics` without mutating `first_discovered_at`.
 * 3. Pure Read-Only Dossier (`getPinDossier`): Single-roundtrip read of pin creative, 30-day trajectory,
 *    and active/displaced SERP positions with ZERO read-path database writes.
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
      dedupMap.set(pid, {
        pin_id: pid,
        creator_username: String(p.creator_username || p.account_username || '').replace(/^@/, '').trim().toLowerCase(),
        board_name: String(p.board_name || '').trim(),
        board_slug: String(p.board_slug || '').trim(),
        title: String(p.title || '').trim(),
        domain: cleanDomain || domainRaw,
        destination_url: destUrl,
        image_url: String(p.image_url || '').trim(),
        description: String(p.description || '').trim(),
        alt_text: String(p.alt_text || '').trim(),
        dominant_color: String(p.dominant_color || '#888888').trim(),
        visual_annotations: Array.isArray(p.visual_annotations)
          ? p.visual_annotations
          : (Array.isArray(p.annotations) ? p.annotations : []),
        created_at_pinterest: p.created_at_pinterest ? new Date(p.created_at_pinterest).toISOString() : null,
        save_count: Math.max(0, Number(p.save_count ?? p.saves ?? 0)),
        repin_count: Math.max(0, Number(p.repin_count ?? p.repins ?? 0)),
        comment_count: Math.max(0, Number(p.comment_count ?? p.comments ?? 0)),
        share_count: Math.max(0, Number(p.share_count ?? p.shares ?? 0)),
        reaction_count: Math.max(0, Number(p.reaction_count ?? 0)),
        daily_save_velocity: Math.max(0, Number(p.daily_save_velocity ?? p.velocity ?? 0)),
        is_product: Boolean(p.is_product || richMeta.is_product),
        is_video: Boolean(p.is_video || richMeta.is_video),
        creation_method: String(p.creation_method || richMeta.creation_method || 'pinterest_platform'),
        image_signature: richMeta.image_signature ? String(richMeta.image_signature) : null,
        canonical_pin_id: richMeta.canonical_pin_id ? String(richMeta.canonical_pin_id) : null,
        first_discovered_pillar: String(pillar || 'keyword'),
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
        pin_id, creator_username, board_name, board_slug, title, domain, destination_url,
        image_url, description, alt_text, dominant_color, visual_annotations, created_at_pinterest,
        save_count, repin_count, comment_count, share_count, reaction_count, daily_save_velocity,
        delta_saves_24h, delta_repins_24h,
        is_product, is_video, creation_method, image_signature, canonical_pin_id,
        first_discovered_pillar, first_discovered_at, last_scraped_at, updated_at, metadata
      )
      SELECT
        u.pin_id, u.creator_username, u.board_name, u.board_slug, u.title, u.domain, u.destination_url,
        u.image_url, u.description, u.alt_text, u.dominant_color, u.visual_annotations,
        NULLIF(TRIM(u.created_at_pinterest), '')::timestamptz,
        u.save_count, u.repin_count, u.comment_count, u.share_count, u.reaction_count, u.daily_save_velocity,
        u.daily_save_velocity, 0,
        u.is_product, u.is_video, u.creation_method, u.image_signature, u.canonical_pin_id,
        u.first_discovered_pillar, NOW(), NOW(), NOW(), u.metadata
      FROM jsonb_to_recordset(${payloadJson}::jsonb) AS u(
        pin_id text, creator_username text, board_name text, board_slug text, title text, domain text,
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
        u.save_count,
        u.repin_count,
        u.comment_count,
        u.share_count,
        u.reaction_count,
        u.daily_save_velocity,
        NOW()
      FROM jsonb_to_recordset(${payloadJson}::jsonb) AS u(
        pin_id text, save_count bigint, repin_count bigint, comment_count int, share_count int, reaction_count int, daily_save_velocity numeric
      )
      ORDER BY u.pin_id ASC
      ON CONFLICT (pin_id, snapshot_date) DO NOTHING
    )
    SELECT pin_id FROM ins_pins;
  `;

  return { inserted: Array.isArray(insertedRows) ? insertedRows.length : 0 };
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
    dedupMap.set(pid, {
      pin_id: pid,
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
          WHEN rb.daily_save_velocity IS NOT NULL THEN GREATEST(0::numeric, rb.daily_save_velocity)
          WHEN prev.save_count IS NOT NULL AND prev.save_count > 0 AND prev.snapshot_date IS NOT NULL THEN
            ROUND(
              GREATEST(0, rb.save_count - prev.save_count)::numeric
              / GREATEST(1, ((NOW() AT TIME ZONE 'UTC')::date - prev.snapshot_date)),
              2
            )
          ELSE 0::numeric
        END AS effective_velocity
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
        save_count = CASE WHEN cb.save_count > 0 THEN cb.save_count ELSE ump.save_count END,
        repin_count = CASE WHEN cb.repin_count > 0 THEN cb.repin_count ELSE ump.repin_count END,
        comment_count = CASE WHEN cb.comment_count > 0 THEN cb.comment_count ELSE ump.comment_count END,
        share_count = CASE WHEN cb.share_count > 0 THEN cb.share_count ELSE ump.share_count END,
        reaction_count = CASE WHEN cb.reaction_count > 0 THEN cb.reaction_count ELSE ump.reaction_count END,
        daily_save_velocity = cb.effective_velocity,
        delta_saves_24h = cb.effective_velocity,
        delta_repins_24h = COALESCE(cb.delta_repins_24h, ump.delta_repins_24h, 0),
        gains_5d = COALESCE(cb.gains_5d, ump.gains_5d, 0),
        gains_7d = COALESCE(cb.gains_7d, ump.gains_7d, 0),
        gains_10d = COALESCE(cb.gains_10d, ump.gains_10d, 0),
        gains_15d = COALESCE(cb.gains_15d, ump.gains_15d, 0),
        created_at_pinterest = COALESCE(ump.created_at_pinterest, NULLIF(TRIM(cb.created_at_pinterest), '')::timestamptz),
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
        cb.save_count,
        cb.repin_count,
        cb.comment_count,
        cb.share_count,
        cb.reaction_count,
        cb.effective_velocity,
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

  return { updated: Array.isArray(updatedRows) ? updatedRows.length : 0 };
}

/**
 * 3. Pure Read-Only Pin Dossier (`getPinDossier` - القراءة الصافية السريعة)
 * Reads the pin creative from `universal_master_pins`, the last 30 daily snapshots
 * from `pins_daily_metrics`, and its SERP rankings from `keyword_serp_current`
 * in a single fast read-only pass with ZERO database writes.
 *
 * @param {Function} sql - Unified PostgreSQL client
 * @param {string|number} pinId - Target Pin ID
 * @returns {Promise<object|null>}
 */
export async function getPinDossier(sql, pinId) {
  const cleanPinId = String(pinId || '').trim();
  if (!cleanPinId) return null;

  const [pinRows, trajectoryRows, serpRows] = await Promise.all([
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
    `
  ]);

  const pin = pinRows?.[0] || null;
  if (!pin) return null;

  // Compute clean chronological step deltas (pure MAX(0, (curr - prev) / days))
  const chrono = [...(trajectoryRows || [])].reverse();
  for (let i = 0; i < chrono.length; i++) {
    const curr = chrono[i];
    if (i === 0) {
      curr.step_save_delta = 0;
      curr.daily_save_velocity = Number(curr.daily_save_velocity || 0);
    } else {
      const prev = chrono[i - 1];
      curr.step_save_delta = Math.max(0, Number(curr.save_count || 0) - Number(prev.save_count || 0));
      curr.daily_save_velocity = calculateDailyVelocity({
        currentSaves: curr.save_count,
        baselineSaves: prev.save_count,
        currentDate: curr.snapshot_date,
        baselineDate: prev.snapshot_date
      });
    }
  }

  return {
    pin_id: cleanPinId,
    creative: pin,
    daily_trajectory: [...chrono].reverse(),
    serp_positions: serpRows || []
  };
}
