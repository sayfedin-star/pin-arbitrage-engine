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

import { calculateDailyVelocity, isMultiStageHydrationJump, isRepinHydrationJump, detectHydrationJump, sanitizeDossierTrajectory } from '../../lib/math.mjs';
import { buildRichPinMetadataPayload, normalizeCleanDomain, isSyntheticGarbageTitle } from '../../domain/pin-intelligence.mjs';
import { qualifyPin } from '../creators/competitors-crud.mjs';
import { getPinDossier, fetchUniversalPinDossier, fetchPinTrajectory } from './dossier-reader.mjs';

export { normalizeCleanDomain, getPinDossier, fetchUniversalPinDossier, fetchPinTrajectory };

function parseStrictNonNegMetric(raw, explicitFlag) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'string' && raw.trim() === '') return null;
  const num = Number(raw);
  if (!Number.isFinite(num)) return null;
  if (explicitFlag === false && num === 0) return null;
  return Math.max(0, Math.trunc(num));
}

function parseStrictFiniteMetric(raw, { nonNegative = false } = {}) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'string' && raw.trim() === '') return null;
  const num = Number(raw);
  if (!Number.isFinite(num)) return null;
  return nonNegative ? Math.max(0, num) : num;
}

function safeParseIsoTimestamp(val) {
  if (!val) return null;
  const dt = new Date(val);
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
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
  const result = await ingestPinsBatch(sql, pins, { pillar });
  return { inserted: result.inserted ?? result.ingested ?? 0 };
}

/**
 * Helper to upsert daily SERP rank positions (`keyword_serp_positions`) when ranking telemetry is present.
 *
 * @param {Function} sql - Unified PostgreSQL client
 * @param {string} payloadJson - Serialized JSON array of pin rows containing keyword_id
 */
async function upsertPinSerpPositionsBatch(sql, payloadJson) {
  await sql`
    INSERT INTO keyword_serp_positions (
      keyword_id, pin_id, rank_position, is_displaced,
      last_known_rank, updated_at
    )
    SELECT DISTINCT ON (u.keyword_id, u.pin_id)
      u.keyword_id,
      u.pin_id,
      CASE WHEN COALESCE(u.is_displaced, FALSE) THEN NULL ELSE u.rank_position END,
      COALESCE(u.is_displaced, FALSE),
      u.last_known_rank,
      NOW()
    FROM jsonb_to_recordset(${payloadJson}::jsonb) AS u(
      pin_id text, keyword_id int, rank_position int, is_displaced boolean, last_known_rank int
    )
    WHERE u.keyword_id IS NOT NULL AND u.keyword_id > 0
    ORDER BY u.keyword_id ASC, u.pin_id ASC
    ON CONFLICT (keyword_id, pin_id) DO UPDATE SET
      rank_position = CASE WHEN EXCLUDED.is_displaced = TRUE THEN NULL ELSE EXCLUDED.rank_position END,
      is_displaced = EXCLUDED.is_displaced,
      last_known_rank = COALESCE(EXCLUDED.last_known_rank, keyword_serp_positions.last_known_rank),
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
    const rawSaves = p.save_count ?? p.saves;
    const saveCount = parseStrictNonNegMetric(rawSaves, p.has_explicit_saves);

    const rawRepins = p.repin_count ?? p.repins;
    const repinCount = parseStrictNonNegMetric(rawRepins, p.has_explicit_repins);

    const isHydrated = Boolean(p.is_hydrated === true || (saveCount !== null && Number.isFinite(saveCount)));
    const velNum = parseStrictFiniteMetric(p.velocity);

    dedupMap.set(pid, {
      pin_id: pid,
      domain: cleanDomain || domainRaw || null,
      clean_domain: cleanDomain || null,
      keyword_id: parseStrictFiniteMetric(p.keyword_id),
      rank_position: parseStrictFiniteMetric(p.rank_position),
      is_displaced: Boolean(p.is_displaced),
      last_known_rank: parseStrictFiniteMetric(p.last_known_rank),
      catalog_rank: parseStrictFiniteMetric(p.catalog_rank) ?? parseStrictFiniteMetric(p.rank_position),
      save_count: saveCount,
      repin_count: repinCount,
      comment_count: parseStrictNonNegMetric(p.comment_count ?? p.comments),
      share_count: parseStrictNonNegMetric(p.share_count ?? p.shares),
      reaction_count: parseStrictNonNegMetric(p.reaction_count),
      is_hydrated: isHydrated,
      daily_save_velocity: (saveCount !== null && parseStrictFiniteMetric(p.daily_save_velocity) !== null)
        ? parseStrictFiniteMetric(p.daily_save_velocity)
        : ((saveCount !== null && velNum !== null && velNum > 0) ? velNum : null),
      daily_repin_velocity: repinCount !== null ? parseStrictFiniteMetric(p.daily_repin_velocity) : null,
      delta_repins_24h: parseStrictFiniteMetric(p.delta_repins_24h),
      gains_5d: parseStrictFiniteMetric(p.gains_5d),
      gains_7d: parseStrictFiniteMetric(p.gains_7d),
      gains_10d: parseStrictFiniteMetric(p.gains_10d),
      gains_15d: parseStrictFiniteMetric(p.gains_15d),
      created_at_pinterest: safeParseIsoTimestamp(p.created_at_pinterest)
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
        is_hydrated boolean,
        daily_save_velocity double precision,
        daily_repin_velocity double precision,
        delta_repins_24h int,
        gains_5d int,
        gains_7d int,
        gains_10d int,
        gains_15d int,
        created_at_pinterest text
      )
    ),
    evaluated_batch AS (
      SELECT
        rb.*,
        prev.save_count AS prev_save_count,
        prev.repin_count AS prev_repin_count,
        prev.recorded_date AS prev_recorded_date,
        CASE
          WHEN prev.save_count IS NOT NULL AND rb.save_count IS NOT NULL AND rb.save_count > prev.save_count AND (
            prev.save_count <= 0
            OR (prev.save_count < 100 AND rb.save_count >= 500)
            OR (COALESCE(prev.repin_count, 0) > 0 AND prev.save_count < prev.repin_count)
            OR (COALESCE(prev.repin_count, 0) > 0 AND prev.save_count = prev.repin_count AND rb.save_count > COALESCE(NULLIF(rb.repin_count, 0), prev.repin_count) * 1.35)
            OR (COALESCE(prev.repin_count, 0) = 0 AND COALESCE(rb.repin_count, 0) >= 25 AND rb.save_count >= prev.save_count * 2.5)
            OR (prev.save_count > 0 AND rb.save_count >= prev.save_count * 4 AND (rb.save_count - prev.save_count) >= 2500)
            OR (prev.save_count < 500 AND (rb.save_count - prev.save_count) > 2000 AND (prev.save_count <= 0 OR (rb.save_count::numeric / GREATEST(1, prev.save_count)) > 20))
          ) THEN true ELSE false
        END AS is_save_jump,
        CASE
          WHEN prev.repin_count IS NOT NULL AND rb.repin_count IS NOT NULL AND rb.repin_count > prev.repin_count AND (
            (prev.repin_count <= 0 AND rb.repin_count >= 10)
            OR (
              prev.repin_count > 0
              AND prev.repin_count < 100
              AND rb.repin_count >= 500
              AND (rb.save_count IS NULL OR prev.save_count IS NULL OR GREATEST(0, rb.save_count - prev.save_count) < (rb.repin_count - prev.repin_count) * 0.25)
            )
            OR (
              prev.repin_count > 0
              AND rb.repin_count >= prev.repin_count * 4
              AND (rb.repin_count - prev.repin_count) >= 200
              AND (rb.save_count IS NULL OR prev.save_count IS NULL OR GREATEST(0, rb.save_count - prev.save_count) < (rb.repin_count - prev.repin_count) * 0.15)
            )
          ) THEN true ELSE false
        END AS is_repin_jump
      FROM (
        SELECT rb_sub.*, (NOW() AT TIME ZONE 'UTC')::date AS recorded_date
        FROM raw_batch rb_sub
      ) rb
      LEFT JOIN LATERAL (
        SELECT pm.save_count, pm.repin_count, pm.recorded_date
        FROM pins_daily_metrics pm
        WHERE pm.pin_id = rb.pin_id
          AND pm.recorded_date < rb.recorded_date
        ORDER BY pm.recorded_date DESC
        LIMIT 1
      ) prev ON TRUE
    ),
    computed_batch AS (
      SELECT
        eb.*,
        CASE
          WHEN eb.save_count IS NULL THEN NULL
          WHEN eb.is_save_jump THEN 0::double precision
          WHEN eb.daily_save_velocity IS NOT NULL THEN LEAST(25000::double precision, GREATEST(0::double precision, eb.daily_save_velocity))
          WHEN eb.prev_save_count IS NOT NULL AND eb.prev_save_count > 0
           AND (eb.recorded_date - eb.prev_recorded_date) BETWEEN 1 AND 7 THEN
            LEAST(
              25000::double precision,
              ROUND(
                GREATEST(0, eb.save_count - eb.prev_save_count)::numeric
                / GREATEST(1, (eb.recorded_date - eb.prev_recorded_date)),
                2
              )::double precision
            )
          ELSE NULL::double precision
        END AS effective_velocity,
        CASE
          WHEN eb.repin_count IS NULL THEN NULL
          WHEN eb.is_repin_jump OR eb.is_save_jump THEN 0::double precision
          WHEN eb.daily_repin_velocity IS NOT NULL THEN LEAST(25000::double precision, GREATEST(0::double precision, eb.daily_repin_velocity))
          WHEN eb.prev_repin_count IS NOT NULL AND eb.prev_repin_count > 0
           AND (eb.recorded_date - eb.prev_recorded_date) BETWEEN 1 AND 7 THEN
            LEAST(
              25000::double precision,
              ROUND(
                GREATEST(0, eb.repin_count - eb.prev_repin_count)::numeric
                / GREATEST(1, (eb.recorded_date - eb.prev_recorded_date)),
                2
              )::double precision
            )
          ELSE NULL::double precision
        END AS effective_repin_velocity,
        CASE
          WHEN eb.save_count IS NULL THEN NULL
          WHEN eb.is_save_jump THEN 0::bigint
          WHEN eb.daily_save_velocity IS NOT NULL THEN LEAST(25000::bigint, ROUND(GREATEST(0::numeric, eb.daily_save_velocity))::bigint)
          WHEN eb.prev_save_count IS NOT NULL AND eb.prev_save_count > 0
           AND (eb.recorded_date - eb.prev_recorded_date) BETWEEN 1 AND 7 THEN
            LEAST(
              25000::bigint,
              ROUND(
                GREATEST(0, eb.save_count - eb.prev_save_count)::numeric
                / GREATEST(1, (eb.recorded_date - eb.prev_recorded_date))
              )::bigint
            )
          ELSE NULL::bigint
        END AS true_delta_saves_24h,
        CASE
          WHEN eb.repin_count IS NULL THEN NULL
          WHEN eb.is_repin_jump OR eb.is_save_jump THEN 0::int
          WHEN eb.delta_repins_24h IS NOT NULL THEN LEAST(25000, GREATEST(0, eb.delta_repins_24h)::int)
          WHEN eb.prev_repin_count IS NOT NULL AND eb.prev_repin_count > 0
           AND (eb.recorded_date - eb.prev_recorded_date) BETWEEN 1 AND 7
           AND eb.repin_count > eb.prev_repin_count THEN
            LEAST(
              25000,
              ROUND(
                GREATEST(0, eb.repin_count - eb.prev_repin_count)::numeric
                / GREATEST(1, (eb.recorded_date - eb.prev_recorded_date))
              )::int
            )
          ELSE NULL::int
        END AS effective_delta_repins_24h
      FROM evaluated_batch eb
    ),
    upd_master AS (
      UPDATE universal_master_pins ump
      SET
        domain = COALESCE(NULLIF(cb.domain, ''), ump.domain),
        clean_domain = COALESCE(NULLIF(cb.clean_domain, ''), NULLIF(ump.clean_domain, ''), LOWER(REGEXP_REPLACE(TRIM(COALESCE(cb.domain, ump.domain, '')), '^www\.', ''))),
        save_count = CASE
          WHEN COALESCE(cb.save_count, 0) > 0 THEN cb.save_count
          WHEN COALESCE(ump.save_count, 0) > 0 THEN ump.save_count
          ELSE COALESCE(cb.save_count, ump.save_count)
        END,
        repin_count = CASE
          WHEN COALESCE(cb.repin_count, 0) > 0 THEN cb.repin_count
          WHEN COALESCE(ump.repin_count, 0) > 0 THEN ump.repin_count
          ELSE COALESCE(cb.repin_count, ump.repin_count)
        END,
        comment_count = COALESCE(cb.comment_count, ump.comment_count),
        share_count = COALESCE(cb.share_count, ump.share_count),
        reaction_count = COALESCE(cb.reaction_count, ump.reaction_count),
        is_hydrated = (ump.is_hydrated OR cb.is_hydrated OR cb.save_count IS NOT NULL),
        daily_save_velocity = COALESCE(cb.effective_velocity, ump.daily_save_velocity),
        daily_repin_velocity = COALESCE(cb.effective_repin_velocity, ump.daily_repin_velocity),
        delta_saves_24h = COALESCE(cb.true_delta_saves_24h, ump.delta_saves_24h),
        delta_repins_24h = COALESCE(cb.effective_delta_repins_24h, ump.delta_repins_24h),
        gains_5d = COALESCE(cb.gains_5d, ump.gains_5d),
        gains_7d = COALESCE(cb.gains_7d, ump.gains_7d),
        gains_10d = COALESCE(cb.gains_10d, ump.gains_10d),
        gains_15d = COALESCE(cb.gains_15d, ump.gains_15d),
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
        pin_id, recorded_date, save_count, repin_count, comment_count, share_count, reaction_count, daily_save_velocity, daily_repin_velocity, updated_at
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
        cb.effective_repin_velocity,
        NOW()
      FROM computed_batch cb
      ORDER BY cb.pin_id ASC
      ON CONFLICT (pin_id, recorded_date) DO UPDATE SET
        save_count = CASE
          WHEN COALESCE(EXCLUDED.save_count, 0) > 0 THEN EXCLUDED.save_count
          WHEN COALESCE(pins_daily_metrics.save_count, 0) > 0 THEN pins_daily_metrics.save_count
          ELSE COALESCE(EXCLUDED.save_count, pins_daily_metrics.save_count)
        END,
        repin_count = CASE
          WHEN COALESCE(EXCLUDED.repin_count, 0) > 0 THEN EXCLUDED.repin_count
          WHEN COALESCE(pins_daily_metrics.repin_count, 0) > 0 THEN pins_daily_metrics.repin_count
          ELSE COALESCE(EXCLUDED.repin_count, pins_daily_metrics.repin_count)
        END,
        comment_count = COALESCE(EXCLUDED.comment_count, pins_daily_metrics.comment_count),
        share_count = COALESCE(EXCLUDED.share_count, pins_daily_metrics.share_count),
        reaction_count = COALESCE(EXCLUDED.reaction_count, pins_daily_metrics.reaction_count),
        daily_save_velocity = COALESCE(EXCLUDED.daily_save_velocity, pins_daily_metrics.daily_save_velocity),
        daily_repin_velocity = COALESCE(EXCLUDED.daily_repin_velocity, pins_daily_metrics.daily_repin_velocity),
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
 * daily metrics, SERP positions, and competitor board pins in a single atomic transaction.
 *
 * @param {Function} sql - Unified PostgreSQL client
 * @param {Array<object>} pins - Array of pins from crawlers/scrapers
 * @param {string|object} [accountUsernameOrOptions={}] - Account username string or options object
 * @param {object} [maybeOptions={}] - Additional options when username is passed as string
 * @returns {Promise<{ ok: boolean, ingested: number, inserted: number, updated: number, added: number, filtered: number, total: number }>}
 */
export async function ingestPinsBatch(sql, pins = [], accountUsernameOrOptions = {}, maybeOptions = {}) {
  if (!Array.isArray(pins) || pins.length === 0) {
    return { ok: true, ingested: 0, inserted: 0, updated: 0, added: 0, filtered: 0, total: 0 };
  }

  let accountUsername = null;
  let options = {};
  if (typeof accountUsernameOrOptions === 'string') {
    accountUsername = accountUsernameOrOptions;
    options = maybeOptions || {};
  } else if (accountUsernameOrOptions && typeof accountUsernameOrOptions === 'object') {
    options = accountUsernameOrOptions;
    accountUsername = options.accountUsername || options.creator_username || null;
  }

  const cleanAccount = accountUsername ? String(accountUsername).replace(/^@/, '').trim().toLowerCase() : null;
  const pillar = String(options.pillar || (options.competitor_id ? 'creator' : 'keyword'));

  let filteredCount = 0;
  const masterPinDedupMap = new Map();
  const serpPositionDedupMap = new Map();
  const competitorBoardDedupMap = new Map();

  for (const p of pins) {
    const pid = String(p?.pin_id || p?.id || p?.pinId || '').trim();
    if (!pid) continue;

    let passesMasterQualification = true;
    if (options.filterQualified === true) {
      const qRes = qualifyPin(p, options.rules);
      passesMasterQualification = typeof qRes === 'boolean' ? qRes : Boolean(qRes?.qualified);
      if (!passesMasterQualification) {
        filteredCount++;
      }
    }

    const domainRaw = String(p.domain || p.link_domain || '').trim();
    let destUrl = String(p.destination_url || p.link || '').trim();
    let cleanDomain = normalizeCleanDomain(domainRaw || destUrl);
    if (!cleanDomain && destUrl) {
      try { cleanDomain = normalizeCleanDomain(new URL(destUrl).hostname); } catch (_) {}
    }

    const boardId = String(p.board_id || options.board_id || '').trim() || null;
    const boardName = String(p.board_name || p.boardName || '').trim() || null;
    const boardSlug = String(p.board_slug || '').trim() || (boardName ? boardName.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') : null);
    const competitorId = p.competitor_id != null ? Number(p.competitor_id) : (options.competitor_id != null ? Number(options.competitor_id) : null);
    const kwId = p.keyword_id != null ? Number(p.keyword_id) : null;

    if (passesMasterQualification) {
      if (!masterPinDedupMap.has(pid)) {
        const richMeta = buildRichPinMetadataPayload(p);
        const rawSaves = p.save_count ?? p.saves;
        const saveCount = parseStrictNonNegMetric(rawSaves, p.has_explicit_saves);
        const isUnhydratedSaves = saveCount === null;

        const rawRepins = p.repin_count ?? p.repins;
        const repinCount = parseStrictNonNegMetric(rawRepins, p.has_explicit_repins);

        const isHydrated = Boolean(p.is_hydrated === true || (saveCount !== null && Number.isFinite(saveCount)));
        const velNum = parseStrictFiniteMetric(p.velocity);
        const creatorUsername = String(
          p.creator_username || p.account_username || cleanAccount || ''
        ).replace(/^@/, '').trim().toLowerCase() || null;
        const wasLiveScraped = p.was_live_scraped !== undefined
          ? Boolean(p.was_live_scraped)
          : Boolean(p.from_hydration_cache !== true && p.scrape_failed !== true && !p.fromCache && !isUnhydratedSaves);

        masterPinDedupMap.set(pid, {
          pin_id: pid,
          creator_username: creatorUsername,
          board_id: boardId,
          board_name: boardName,
          board_slug: boardSlug,
          title: String(p.title || '').trim(),
          domain: cleanDomain || domainRaw || null,
          clean_domain: cleanDomain || null,
          destination_url: destUrl || null,
          image_url: String(p.image_url || p.imageUrl || '').trim(),
          description: String(p.description || '').trim(),
          alt_text: String(p.alt_text || '').trim(),
          dominant_color: (() => {
            const c = String(p.dominant_color || p.dominantColor || '').trim();
            return (!c || c.toLowerCase() === '#888888') ? null : c;
          })(),
          visual_annotations: Array.isArray(p.visual_annotations)
            ? p.visual_annotations
            : (Array.isArray(p.annotations) ? p.annotations : []),
          created_at_pinterest: safeParseIsoTimestamp(p.created_at_pinterest || p.created_at),
          save_count: saveCount,
          repin_count: repinCount,
          comment_count: parseStrictNonNegMetric(p.comment_count ?? p.comments),
          share_count: parseStrictNonNegMetric(p.share_count ?? p.shares),
          reaction_count: parseStrictNonNegMetric(p.reaction_count),
          is_hydrated: isHydrated,
          daily_save_velocity: (saveCount !== null && parseStrictFiniteMetric(p.daily_save_velocity) !== null)
            ? parseStrictFiniteMetric(p.daily_save_velocity)
            : ((saveCount !== null && velNum !== null && velNum > 0) ? velNum : null),
          daily_repin_velocity: repinCount !== null ? parseStrictFiniteMetric(p.daily_repin_velocity) : null,
          delta_saves_24h: parseStrictFiniteMetric(p.delta_saves_24h),
          delta_repins_24h: parseStrictFiniteMetric(p.delta_repins_24h),
          gains_5d: parseStrictFiniteMetric(p.gains_5d),
          gains_7d: parseStrictFiniteMetric(p.gains_7d),
          gains_10d: parseStrictFiniteMetric(p.gains_10d),
          gains_15d: parseStrictFiniteMetric(p.gains_15d),
          is_product: Boolean(p.is_product || richMeta.is_product),
          is_video: Boolean(p.is_video || richMeta.is_video),
          creation_method: String(p.creation_method || richMeta.creation_method || 'pinterest_platform'),
          image_signature: richMeta.image_signature ? String(richMeta.image_signature) : null,
          canonical_pin_id: richMeta.canonical_pin_id ? String(richMeta.canonical_pin_id) : null,
          first_discovered_pillar: pillar,
          was_live_scraped: wasLiveScraped,
          metadata: richMeta
        });
      } else {
        const existing = masterPinDedupMap.get(pid);
        const richMeta = buildRichPinMetadataPayload(p, existing.metadata || {});
        const rawSaves = p.save_count ?? p.saves;
        const incomingSaves = parseStrictNonNegMetric(rawSaves, p.has_explicit_saves);
        const isUnhydratedSaves = incomingSaves === null;
        const rawRepins = p.repin_count ?? p.repins;
        const incomingRepins = parseStrictNonNegMetric(rawRepins, p.has_explicit_repins);
        const incomingWasLive = p.was_live_scraped !== undefined
          ? Boolean(p.was_live_scraped)
          : Boolean(p.from_hydration_cache !== true && p.scrape_failed !== true && !p.fromCache && !isUnhydratedSaves);

        if (incomingSaves !== null) {
          existing.save_count = existing.save_count !== null ? Math.max(Number(existing.save_count), incomingSaves) : incomingSaves;
        }
        if (incomingRepins !== null) {
          existing.repin_count = existing.repin_count !== null ? Math.max(Number(existing.repin_count), incomingRepins) : incomingRepins;
        }
        for (const [k, alt] of [['comment_count', 'comments'], ['share_count', 'shares'], ['reaction_count', 'reactions']]) {
          const parsedVal = parseStrictNonNegMetric(p[k] ?? p[alt]);
          if (parsedVal !== null) {
            existing[k] = existing[k] != null ? Math.max(Number(existing[k]), parsedVal) : parsedVal;
          }
        }
        const incSaveVel = parseStrictFiniteMetric(p.daily_save_velocity);
        const incVel = parseStrictFiniteMetric(p.velocity);
        if (incSaveVel !== null) {
          existing.daily_save_velocity = existing.daily_save_velocity != null ? Math.max(Number(existing.daily_save_velocity), incSaveVel) : incSaveVel;
        } else if (existing.save_count !== null && incVel !== null && incVel > 0) {
          existing.daily_save_velocity = existing.daily_save_velocity != null ? Math.max(Number(existing.daily_save_velocity), incVel) : incVel;
        }
        const incRepinVel = parseStrictFiniteMetric(p.daily_repin_velocity);
        if (incRepinVel !== null) {
          existing.daily_repin_velocity = existing.daily_repin_velocity != null ? Math.max(Number(existing.daily_repin_velocity), incRepinVel) : incRepinVel;
        }
        for (const dk of ['delta_saves_24h', 'delta_repins_24h', 'gains_5d', 'gains_7d', 'gains_10d', 'gains_15d']) {
          const parsedDk = parseStrictFiniteMetric(p[dk]);
          if (parsedDk !== null) {
            existing[dk] = existing[dk] != null ? Math.max(Number(existing[dk]), parsedDk) : parsedDk;
          }
        }
        existing.is_hydrated = Boolean(existing.is_hydrated || !isUnhydratedSaves || p.is_hydrated === true);
        existing.was_live_scraped = Boolean(existing.was_live_scraped || incomingWasLive);

        const candidateTitle = String(p.title || '').trim();
        if ((!existing.title || isSyntheticGarbageTitle(existing.title, pid)) && candidateTitle && !isSyntheticGarbageTitle(candidateTitle, pid)) {
          existing.title = candidateTitle;
        } else if (!existing.title && candidateTitle) {
          existing.title = candidateTitle;
        }
        if (!existing.description && p.description) existing.description = String(p.description).trim();
        if (!existing.alt_text && p.alt_text) existing.alt_text = String(p.alt_text).trim();
        const incImage = String(p.image_url || p.imageUrl || '').trim();
        if (!existing.image_url && incImage) existing.image_url = incImage;
        if (!existing.destination_url && destUrl) existing.destination_url = destUrl;
        if (!existing.domain && (cleanDomain || domainRaw)) existing.domain = cleanDomain || domainRaw;
        if (!existing.clean_domain && cleanDomain) existing.clean_domain = cleanDomain;
        if (!existing.creator_username && (p.creator_username || p.account_username || cleanAccount)) {
          existing.creator_username = String(p.creator_username || p.account_username || cleanAccount).replace(/^@/, '').trim().toLowerCase() || null;
        }
        if (!existing.board_id && boardId) existing.board_id = boardId;
        if (!existing.board_name && boardName) existing.board_name = boardName;
        if (!existing.board_slug && boardSlug) existing.board_slug = boardSlug;
        const incColor = String(p.dominant_color || p.dominantColor || '').trim();
        if ((!existing.dominant_color || existing.dominant_color === '#888888') && incColor) {
          existing.dominant_color = incColor;
        }
        const incAnnotations = Array.isArray(p.visual_annotations)
          ? p.visual_annotations
          : (Array.isArray(p.annotations) ? p.annotations : []);
        if ((!existing.visual_annotations || existing.visual_annotations.length === 0) && incAnnotations.length > 0) {
          existing.visual_annotations = incAnnotations;
        }
        if (!existing.created_at_pinterest && (p.created_at_pinterest || p.created_at)) {
          existing.created_at_pinterest = safeParseIsoTimestamp(p.created_at_pinterest || p.created_at);
        }
        if (!existing.image_signature && richMeta.image_signature) existing.image_signature = String(richMeta.image_signature);
        if (!existing.canonical_pin_id && richMeta.canonical_pin_id) existing.canonical_pin_id = String(richMeta.canonical_pin_id);
        if ((!existing.creation_method || existing.creation_method === 'pinterest_platform') && (p.creation_method || p.method)) {
          existing.creation_method = String(p.creation_method || p.method);
        }
        existing.is_product = Boolean(existing.is_product || p.is_product || richMeta.is_product);
        existing.is_video = Boolean(existing.is_video || p.is_video || richMeta.is_video);
        existing.metadata = richMeta;
      }
    }

    if (kwId && kwId > 0) {
      const serpKey = `${kwId}:${pid}`;
      const existingSerp = serpPositionDedupMap.get(serpKey);
      const incomingRank = p.rank_position != null ? Number(p.rank_position) : null;
      if (!existingSerp) {
        serpPositionDedupMap.set(serpKey, {
          pin_id: pid,
          keyword_id: kwId,
          rank_position: incomingRank,
          is_displaced: Boolean(p.is_displaced),
          last_known_rank: p.last_known_rank != null ? Number(p.last_known_rank) : null,
          catalog_rank: p.catalog_rank != null ? Number(p.catalog_rank) : incomingRank,
          vacuum_opportunity_score: p.vacuum_opportunity_score != null ? Number(p.vacuum_opportunity_score) : null
        });
      } else if (incomingRank != null && (existingSerp.rank_position == null || incomingRank < existingSerp.rank_position)) {
        existingSerp.rank_position = incomingRank;
        if (p.catalog_rank != null) existingSerp.catalog_rank = Number(p.catalog_rank);
        if (p.is_displaced != null) existingSerp.is_displaced = Boolean(p.is_displaced);
        if (p.last_known_rank != null) existingSerp.last_known_rank = Number(p.last_known_rank);
        if (p.vacuum_opportunity_score != null) existingSerp.vacuum_opportunity_score = Number(p.vacuum_opportunity_score);
      }
    }

    if (competitorId && competitorId > 0) {
      const cKey = `${competitorId}:${boardId || ''}:${pid}`;
      if (!competitorBoardDedupMap.has(cKey)) {
        competitorBoardDedupMap.set(cKey, {
          pin_id: pid,
          competitor_id: competitorId,
          board_id: boardId,
          rank_position: p.rank_position != null ? Number(p.rank_position) : null
        });
      }
    }
  }

  const rows = Array.from(masterPinDedupMap.values()).sort((a, b) => a.pin_id.localeCompare(b.pin_id));
  const serpRows = Array.from(serpPositionDedupMap.values()).sort((a, b) => a.keyword_id - b.keyword_id || a.pin_id.localeCompare(b.pin_id));
  const competitorRows = Array.from(competitorBoardDedupMap.values()).sort((a, b) => a.competitor_id - b.competitor_id || a.pin_id.localeCompare(b.pin_id));

  if (rows.length === 0 && serpRows.length === 0 && competitorRows.length === 0) {
    return { ok: true, ingested: 0, inserted: 0, updated: 0, added: 0, filtered: filteredCount, total: pins.length };
  }

  const payloadJson = JSON.stringify(rows);
  const serpPayloadJson = JSON.stringify(serpRows);
  const compPayloadJson = JSON.stringify(competitorRows);

  const executeAtomicBatch = async (tx) => {
    const res = await tx`
      WITH raw_batch AS (
        SELECT *
        FROM jsonb_to_recordset(${payloadJson}::jsonb) AS u(
          pin_id text, creator_username text, board_id text, board_name text, board_slug text, title text, domain text, clean_domain text,
          destination_url text, image_url text, description text, alt_text text, dominant_color text,
          visual_annotations jsonb, created_at_pinterest text,
          save_count bigint, repin_count bigint, comment_count int, share_count int, reaction_count int,
          is_hydrated boolean, daily_save_velocity double precision, daily_repin_velocity double precision,
          delta_saves_24h bigint, delta_repins_24h bigint,
          gains_5d bigint, gains_7d bigint, gains_10d bigint, gains_15d bigint,
          is_product boolean, is_video boolean, creation_method text,
          image_signature text, canonical_pin_id text, first_discovered_pillar text,
          was_live_scraped boolean, metadata jsonb
        )
      ),
      evaluated_batch AS (
        SELECT
          rb.*,
          prev.save_count AS prev_save_count,
          prev.repin_count AS prev_repin_count,
          prev.recorded_date AS prev_recorded_date,
          CASE
            WHEN prev.save_count IS NOT NULL AND rb.save_count IS NOT NULL AND rb.save_count > prev.save_count AND (
              prev.save_count <= 0
              OR (prev.save_count < 100 AND rb.save_count >= 500)
              OR (COALESCE(prev.repin_count, 0) > 0 AND prev.save_count < prev.repin_count)
              OR (COALESCE(prev.repin_count, 0) > 0 AND prev.save_count = prev.repin_count AND rb.save_count > COALESCE(NULLIF(rb.repin_count, 0), prev.repin_count) * 1.35)
              OR (COALESCE(prev.repin_count, 0) = 0 AND COALESCE(rb.repin_count, 0) >= 25 AND rb.save_count >= prev.save_count * 2.5)
              OR (prev.save_count > 0 AND rb.save_count >= prev.save_count * 4 AND (rb.save_count - prev.save_count) >= 2500)
              OR (prev.save_count < 500 AND (rb.save_count - prev.save_count) > 2000 AND (prev.save_count <= 0 OR (rb.save_count::numeric / GREATEST(1, prev.save_count)) > 20))
            ) THEN true ELSE false
          END AS is_save_jump,
          CASE
            WHEN prev.repin_count IS NOT NULL AND rb.repin_count IS NOT NULL AND rb.repin_count > prev.repin_count AND (
              (prev.repin_count <= 0 AND rb.repin_count >= 10)
              OR (
                prev.repin_count > 0
                AND prev.repin_count < 100
                AND rb.repin_count >= 500
                AND (rb.save_count IS NULL OR prev.save_count IS NULL OR GREATEST(0, rb.save_count - prev.save_count) < (rb.repin_count - prev.repin_count) * 0.25)
              )
              OR (
                prev.repin_count > 0
                AND rb.repin_count >= prev.repin_count * 4
                AND (rb.repin_count - prev.repin_count) >= 200
                AND (rb.save_count IS NULL OR prev.save_count IS NULL OR GREATEST(0, rb.save_count - prev.save_count) < (rb.repin_count - prev.repin_count) * 0.15)
              )
            ) THEN true ELSE false
          END AS is_repin_jump
        FROM (
          SELECT rb_sub.*, (NOW() AT TIME ZONE 'UTC')::date AS recorded_date
          FROM raw_batch rb_sub
        ) rb
        LEFT JOIN LATERAL (
          SELECT pm.save_count, pm.repin_count, pm.recorded_date
          FROM pins_daily_metrics pm
          WHERE pm.pin_id = rb.pin_id
            AND pm.recorded_date < rb.recorded_date
          ORDER BY pm.recorded_date DESC
          LIMIT 1
        ) prev ON TRUE
      ),
      computed_batch AS (
        SELECT
          eb.*,
          CASE
            WHEN eb.save_count IS NULL THEN NULL
            WHEN eb.is_save_jump THEN 0::double precision
            WHEN eb.daily_save_velocity IS NOT NULL THEN LEAST(25000::double precision, GREATEST(0::double precision, eb.daily_save_velocity))
            WHEN eb.prev_save_count IS NOT NULL AND eb.prev_save_count > 0
             AND (eb.recorded_date - eb.prev_recorded_date) BETWEEN 1 AND 7 THEN
              LEAST(
                25000::double precision,
                ROUND(
                  GREATEST(0, eb.save_count - eb.prev_save_count)::numeric
                  / GREATEST(1, (eb.recorded_date - eb.prev_recorded_date)),
                  2
                )::double precision
              )
            ELSE NULL::double precision
          END AS effective_save_velocity,
          CASE
            WHEN eb.repin_count IS NULL THEN NULL
            WHEN eb.is_repin_jump OR eb.is_save_jump THEN 0::double precision
            WHEN eb.daily_repin_velocity IS NOT NULL THEN LEAST(25000::double precision, GREATEST(0::double precision, eb.daily_repin_velocity))
            WHEN eb.prev_repin_count IS NOT NULL AND eb.prev_repin_count > 0
             AND (eb.recorded_date - eb.prev_recorded_date) BETWEEN 1 AND 7 THEN
              LEAST(
                25000::double precision,
                ROUND(
                  GREATEST(0, eb.repin_count - eb.prev_repin_count)::numeric
                  / GREATEST(1, (eb.recorded_date - eb.prev_recorded_date)),
                  2
                )::double precision
              )
            ELSE NULL::double precision
          END AS effective_repin_velocity,
          CASE
            WHEN eb.save_count IS NULL THEN NULL
            WHEN eb.is_save_jump THEN 0::bigint
            WHEN eb.delta_saves_24h IS NOT NULL THEN LEAST(25000::bigint, GREATEST(0::bigint, eb.delta_saves_24h))
            WHEN eb.daily_save_velocity IS NOT NULL THEN LEAST(25000::bigint, ROUND(GREATEST(0::numeric, eb.daily_save_velocity))::bigint)
            WHEN eb.prev_save_count IS NOT NULL AND eb.prev_save_count > 0
             AND (eb.recorded_date - eb.prev_recorded_date) BETWEEN 1 AND 7 THEN
              LEAST(
                25000::bigint,
                ROUND(
                  GREATEST(0, eb.save_count - eb.prev_save_count)::numeric
                  / GREATEST(1, (eb.recorded_date - eb.prev_recorded_date))
                )::bigint
              )
            ELSE NULL::bigint
          END AS true_delta_saves_24h,
          CASE
            WHEN eb.repin_count IS NULL THEN NULL
            WHEN eb.is_repin_jump OR eb.is_save_jump THEN 0::bigint
            WHEN eb.delta_repins_24h IS NOT NULL THEN LEAST(25000::bigint, GREATEST(0::bigint, eb.delta_repins_24h::bigint))
            WHEN eb.prev_repin_count IS NOT NULL AND eb.prev_repin_count > 0
             AND (eb.recorded_date - eb.prev_recorded_date) BETWEEN 1 AND 7
             AND eb.repin_count > eb.prev_repin_count THEN
              LEAST(
                25000::bigint,
                ROUND(
                  GREATEST(0, eb.repin_count - eb.prev_repin_count)::numeric
                  / GREATEST(1, (eb.recorded_date - eb.prev_recorded_date))
                )::bigint
              )
            ELSE NULL::bigint
          END AS true_delta_repins_24h
        FROM evaluated_batch eb
      ),
      upsert_pins AS (
        INSERT INTO universal_master_pins (
          pin_id, creator_username, board_id, board_name, board_slug, title, domain, clean_domain, destination_url,
          image_url, description, alt_text, dominant_color, visual_annotations, created_at_pinterest,
          save_count, repin_count, comment_count, share_count, reaction_count, is_hydrated,
          daily_save_velocity, daily_repin_velocity, delta_saves_24h, delta_repins_24h,
          gains_5d, gains_7d, gains_10d, gains_15d,
          is_product, is_video, creation_method, image_signature, canonical_pin_id,
          first_discovered_pillar, first_discovered_at, first_saved_at, last_resaved_at, last_scraped_at, updated_at, metadata
        )
        SELECT
          cb.pin_id, cb.creator_username, cb.board_id, cb.board_name, cb.board_slug, cb.title, cb.domain,
          COALESCE(NULLIF(cb.clean_domain, ''), LOWER(REGEXP_REPLACE(TRIM(COALESCE(cb.domain, '')), '^www\.', ''))),
          cb.destination_url,
          cb.image_url, cb.description, cb.alt_text, cb.dominant_color, cb.visual_annotations,
          NULLIF(TRIM(cb.created_at_pinterest), '')::timestamptz,
          cb.save_count, cb.repin_count, cb.comment_count, cb.share_count, cb.reaction_count,
          (cb.is_hydrated OR cb.save_count IS NOT NULL),
          cb.effective_save_velocity, cb.effective_repin_velocity,
          cb.true_delta_saves_24h,
          cb.true_delta_repins_24h,
          cb.gains_5d, cb.gains_7d, cb.gains_10d, cb.gains_15d,
          cb.is_product, cb.is_video, cb.creation_method, cb.image_signature, cb.canonical_pin_id,
          cb.first_discovered_pillar, NOW(), NOW(), NOW(),
          CASE WHEN cb.was_live_scraped = TRUE THEN NOW() ELSE NULL END,
          NOW(), cb.metadata
        FROM computed_batch cb
        ORDER BY cb.pin_id ASC
        ON CONFLICT (pin_id) DO UPDATE SET
          creator_username = COALESCE(NULLIF(EXCLUDED.creator_username, ''), universal_master_pins.creator_username),
          board_id = COALESCE(NULLIF(EXCLUDED.board_id, ''), universal_master_pins.board_id),
          board_name = COALESCE(NULLIF(EXCLUDED.board_name, ''), universal_master_pins.board_name),
          board_slug = COALESCE(NULLIF(EXCLUDED.board_slug, ''), universal_master_pins.board_slug),
          title = CASE
            WHEN EXCLUDED.title IS NOT NULL AND BTRIM(EXCLUDED.title) <> ''
            THEN EXCLUDED.title
            ELSE universal_master_pins.title
          END,
          domain = COALESCE(NULLIF(EXCLUDED.domain, ''), universal_master_pins.domain),
          clean_domain = COALESCE(NULLIF(EXCLUDED.clean_domain, ''), universal_master_pins.clean_domain),
          destination_url = COALESCE(NULLIF(EXCLUDED.destination_url, ''), universal_master_pins.destination_url),
          image_url = COALESCE(NULLIF(EXCLUDED.image_url, ''), universal_master_pins.image_url),
          description = COALESCE(NULLIF(EXCLUDED.description, ''), universal_master_pins.description),
          alt_text = COALESCE(NULLIF(EXCLUDED.alt_text, ''), universal_master_pins.alt_text),
          dominant_color = CASE WHEN EXCLUDED.dominant_color NOT IN ('', '#888888') THEN EXCLUDED.dominant_color ELSE universal_master_pins.dominant_color END,
          visual_annotations = CASE WHEN jsonb_array_length(COALESCE(EXCLUDED.visual_annotations, '[]'::jsonb)) > 0 THEN EXCLUDED.visual_annotations ELSE universal_master_pins.visual_annotations END,
          save_count = CASE
            WHEN COALESCE(EXCLUDED.save_count, 0) > 0 THEN EXCLUDED.save_count
            WHEN COALESCE(universal_master_pins.save_count, 0) > 0 THEN universal_master_pins.save_count
            ELSE COALESCE(EXCLUDED.save_count, universal_master_pins.save_count)
          END,
          repin_count = CASE
            WHEN COALESCE(EXCLUDED.repin_count, 0) > 0 THEN EXCLUDED.repin_count
            WHEN COALESCE(universal_master_pins.repin_count, 0) > 0 THEN universal_master_pins.repin_count
            ELSE COALESCE(EXCLUDED.repin_count, universal_master_pins.repin_count)
          END,
          comment_count = COALESCE(EXCLUDED.comment_count, universal_master_pins.comment_count),
          share_count = COALESCE(EXCLUDED.share_count, universal_master_pins.share_count),
          reaction_count = COALESCE(EXCLUDED.reaction_count, universal_master_pins.reaction_count),
          is_hydrated = (universal_master_pins.is_hydrated OR EXCLUDED.is_hydrated OR EXCLUDED.save_count IS NOT NULL),
          daily_save_velocity = COALESCE(EXCLUDED.daily_save_velocity, universal_master_pins.daily_save_velocity),
          daily_repin_velocity = COALESCE(EXCLUDED.daily_repin_velocity, universal_master_pins.daily_repin_velocity),
          delta_saves_24h = COALESCE(EXCLUDED.delta_saves_24h, universal_master_pins.delta_saves_24h),
          delta_repins_24h = COALESCE(EXCLUDED.delta_repins_24h, universal_master_pins.delta_repins_24h),
          gains_5d = COALESCE(EXCLUDED.gains_5d, universal_master_pins.gains_5d),
          gains_7d = COALESCE(EXCLUDED.gains_7d, universal_master_pins.gains_7d),
          gains_10d = COALESCE(EXCLUDED.gains_10d, universal_master_pins.gains_10d),
          gains_15d = COALESCE(EXCLUDED.gains_15d, universal_master_pins.gains_15d),
          last_resaved_at = NOW(),
          last_scraped_at = COALESCE(EXCLUDED.last_scraped_at, universal_master_pins.last_scraped_at),
          updated_at = NOW()
        RETURNING pin_id, (xmax = 0) AS is_insert
      ),
      upsert_daily AS (
        INSERT INTO pins_daily_metrics (
          pin_id, recorded_date, save_count, repin_count, comment_count, share_count, reaction_count,
          daily_save_velocity, daily_repin_velocity, updated_at
        )
        SELECT
          cb.pin_id,
          (NOW() AT TIME ZONE 'UTC')::date,
          cb.save_count,
          cb.repin_count,
          cb.comment_count,
          cb.share_count,
          cb.reaction_count,
          cb.effective_save_velocity,
          cb.effective_repin_velocity,
          NOW()
        FROM computed_batch cb
        ORDER BY cb.pin_id ASC
        ON CONFLICT (pin_id, recorded_date) DO UPDATE SET
          save_count = CASE
            WHEN COALESCE(EXCLUDED.save_count, 0) > 0 THEN EXCLUDED.save_count
            WHEN COALESCE(pins_daily_metrics.save_count, 0) > 0 THEN pins_daily_metrics.save_count
            ELSE COALESCE(EXCLUDED.save_count, pins_daily_metrics.save_count)
          END,
          repin_count = CASE
            WHEN COALESCE(EXCLUDED.repin_count, 0) > 0 THEN EXCLUDED.repin_count
            WHEN COALESCE(pins_daily_metrics.repin_count, 0) > 0 THEN pins_daily_metrics.repin_count
            ELSE COALESCE(EXCLUDED.repin_count, pins_daily_metrics.repin_count)
          END,
          comment_count = COALESCE(EXCLUDED.comment_count, pins_daily_metrics.comment_count),
          share_count = COALESCE(EXCLUDED.share_count, pins_daily_metrics.share_count),
          reaction_count = COALESCE(EXCLUDED.reaction_count, pins_daily_metrics.reaction_count),
          daily_save_velocity = COALESCE(EXCLUDED.daily_save_velocity, pins_daily_metrics.daily_save_velocity),
          daily_repin_velocity = COALESCE(EXCLUDED.daily_repin_velocity, pins_daily_metrics.daily_repin_velocity),
          updated_at = NOW()
      )
      SELECT pin_id, is_insert FROM upsert_pins;
    `;

    // SERP Positions upsert
    if (serpRows.length > 0) {
      await tx`
        INSERT INTO keyword_serp_positions (
          keyword_id, pin_id, rank_position, is_displaced,
          last_known_rank, vacuum_opportunity_score, prev_rank_position, crawled_at, updated_at
        )
        SELECT DISTINCT ON (u.keyword_id, u.pin_id)
          u.keyword_id,
          u.pin_id,
          CASE WHEN COALESCE(u.is_displaced, FALSE) THEN NULL ELSE u.rank_position END,
          COALESCE(u.is_displaced, FALSE),
          u.last_known_rank,
          u.vacuum_opportunity_score,
          NULL,
          NOW(),
          NOW()
        FROM jsonb_to_recordset(${serpPayloadJson}::jsonb) AS u(
          pin_id text, keyword_id int, rank_position int, is_displaced boolean, last_known_rank int, vacuum_opportunity_score double precision
        )
        WHERE u.keyword_id IS NOT NULL AND u.keyword_id > 0
        ORDER BY u.keyword_id ASC, u.pin_id ASC
        ON CONFLICT (keyword_id, pin_id) DO UPDATE SET
          prev_rank_position = CASE
            WHEN EXCLUDED.is_displaced = FALSE AND keyword_serp_positions.rank_position IS NOT NULL
            THEN keyword_serp_positions.rank_position
            ELSE keyword_serp_positions.prev_rank_position
          END,
          rank_position = CASE WHEN EXCLUDED.is_displaced = TRUE THEN NULL ELSE EXCLUDED.rank_position END,
          is_displaced = EXCLUDED.is_displaced,
          last_known_rank = COALESCE(EXCLUDED.last_known_rank, keyword_serp_positions.last_known_rank),
          vacuum_opportunity_score = COALESCE(EXCLUDED.vacuum_opportunity_score, keyword_serp_positions.vacuum_opportunity_score),
          crawled_at = NOW(),
          updated_at = NOW();
      `;
    }

    // Competitor board pins join table upsert
    if (competitorRows.length > 0) {
      await tx`
        INSERT INTO competitor_board_pins (
          competitor_id, board_id, pin_id, position, discovered_at
        )
        SELECT DISTINCT ON (u.competitor_id, COALESCE(u.board_id, ''), u.pin_id)
          u.competitor_id,
          COALESCE(u.board_id, ''),
          u.pin_id,
          u.rank_position,
          NOW()
        FROM jsonb_to_recordset(${compPayloadJson}::jsonb) AS u(
          pin_id text, competitor_id int, board_id text, rank_position int
        )
        WHERE u.competitor_id IS NOT NULL AND u.competitor_id > 0
        ORDER BY u.competitor_id ASC, COALESCE(u.board_id, '') ASC, u.pin_id ASC
        ON CONFLICT (competitor_id, board_id, pin_id) DO UPDATE SET
          position = COALESCE(EXCLUDED.position, competitor_board_pins.position);
      `;
    }

    return res;
  };

  const res = typeof sql.begin === 'function'
    ? await sql.begin(executeAtomicBatch)
    : (typeof sql.transaction === 'function' ? await sql.transaction(executeAtomicBatch) : await executeAtomicBatch(sql));

  const inserted = Array.isArray(res) ? res.filter(r => r.is_insert).length : 0;
  const updated = Array.isArray(res) ? res.filter(r => !r.is_insert).length : 0;
  return { ok: true, ingested: Array.isArray(res) ? res.length : 0, inserted, updated, added: inserted, filtered: filteredCount, total: pins.length };
}

/**
 * Merges master pin metadata over SERP hub metadata, giving supreme priority to masterRecord.metadata
 */
export function mergeMasterAndHubMetadata(topHubMeta, masterMetaObj, resolvedBestMethod) {
  return { ...topHubMeta, ...masterMetaObj, creation_method: resolvedBestMethod, method: resolvedBestMethod };
}

/**
 * 5. Four-Pillar Atomic Sync (`syncPinAcrossAllFourPillars`)
 * Writes master creative + 48 telemetry fields + Day-2 velocity + SERP positions
 * across `universal_master_pins`, `pins_daily_metrics`, and `keyword_serp_positions`,
 * then returns refreshed universal dossier.
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
  const rawSaves = (scrapedPin.saves !== undefined && scrapedPin.saves !== null)
    ? scrapedPin.saves
    : ((scrapedPin.save_count !== undefined && scrapedPin.save_count !== null) ? scrapedPin.save_count : null);
  const isUnhydratedSaves = (rawSaves === null || rawSaves === undefined || rawSaves === '')
    || (scrapedPin.has_explicit_saves === false && Number(rawSaves || 0) === 0);
  const newSaves = (!isUnhydratedSaves && Number.isFinite(Number(rawSaves)))
    ? Math.max(0, Number(rawSaves))
    : null;
  const hasExplicitScrapedSaves = Boolean(scrapedPin.has_explicit_saves) || (newSaves !== null && newSaves > 0);

  const rawRepins = (scrapedPin.repins !== undefined && scrapedPin.repins !== null)
    ? scrapedPin.repins
    : ((scrapedPin.repin_count !== undefined && scrapedPin.repin_count !== null) ? scrapedPin.repin_count : null);
  const isUnhydratedRepins = (rawRepins === null || rawRepins === undefined || rawRepins === '')
    || (scrapedPin.has_explicit_repins === false && Number(rawRepins || 0) === 0)
    || (scrapedPin.has_explicit_saves === false && Number(rawRepins || 0) === 0);
  const newRepins = (!isUnhydratedRepins && Number.isFinite(Number(rawRepins)))
    ? Math.max(0, Number(rawRepins))
    : null;
  const hasExplicitScrapedRepins = Boolean(scrapedPin.has_explicit_repins) || (newRepins !== null && newRepins > 0);

  const rawComments = (scrapedPin.comments !== undefined && scrapedPin.comments !== null)
    ? scrapedPin.comments
    : ((scrapedPin.comment_count !== undefined && scrapedPin.comment_count !== null) ? scrapedPin.comment_count : null);
  const newComments = (rawComments !== null && rawComments !== '' && Number.isFinite(Number(rawComments)))
    ? Math.max(0, Number(rawComments))
    : null;

  const rawShares = (scrapedPin.share_count !== undefined && scrapedPin.share_count !== null)
    ? scrapedPin.share_count
    : ((scrapedPin.shares !== undefined && scrapedPin.shares !== null) ? scrapedPin.shares : null);
  const newShares = (rawShares !== null && rawShares !== '' && Number.isFinite(Number(rawShares)))
    ? Math.max(0, Number(rawShares))
    : null;

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

  // Creative SSOT keys live exclusively in universal_master_pins (skip bloating secondary metadata JSONB)
  const secondaryMetaToStore = { ...metaToStore };
  delete secondaryMetaToStore.alt_text;
  delete secondaryMetaToStore.description;
  delete secondaryMetaToStore.seo_title;
  delete secondaryMetaToStore.seo_description;
  delete secondaryMetaToStore.board_name;

  const cleanCreatedAtIso = (() => {
    const rawDate = scrapedPin.created_at_pinterest || scrapedPin.created_at;
    if (!rawDate) return null;
    const d = new Date(rawDate);
    return isNaN(d.getTime()) ? null : d.toISOString();
  })();

  // 4. Pillar 1: Upsert universal_master_pins
  const cleanSyncDominantColor = (() => {
    const c = String(scrapedPin.dominant_color || scrapedPin.dominantColor || '').trim();
    return (!c || c.toLowerCase() === '#888888') ? null : c;
  })();

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
      ${cleanSyncDominantColor},
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
      dominant_color = CASE WHEN EXCLUDED.dominant_color NOT IN ('', '#888888') THEN EXCLUDED.dominant_color ELSE universal_master_pins.dominant_color END,
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

  // 5. Query Active & Displaced SERP State (keyword_serp_positions joined with universal_master_pins)
  const targetRows = await dbSql`
    SELECT
      ksp.keyword_id, ksp.rank_position, ksp.is_displaced,
      ksp.crawled_at, ksp.last_known_rank, ksp.vacuum_opportunity_score,
      ump.save_count, ump.repin_count,
      ump.daily_save_velocity, ump.delta_repins_24h, ump.daily_repin_velocity,
      ump.last_scraped_at
    FROM keyword_serp_positions ksp
    LEFT JOIN universal_master_pins ump ON ump.pin_id = ksp.pin_id
    WHERE ksp.pin_id = ${cleanPinId}
      AND ksp.is_displaced = FALSE
      AND ksp.rank_position IS NOT NULL;
  `;

  let displacedRows = [];
  try {
    displacedRows = await dbSql`
      SELECT
        ksp.keyword_id, ksp.last_known_rank, ksp.displaced_date, ksp.vacuum_opportunity_score, ksp.updated_at,
        ump.save_count, ump.repin_count,
        ump.daily_save_velocity, ump.delta_repins_24h, ump.daily_repin_velocity,
        ump.last_scraped_at
      FROM keyword_serp_positions ksp
      LEFT JOIN universal_master_pins ump ON ump.pin_id = ksp.pin_id
      WHERE ksp.pin_id = ${cleanPinId}
        AND ksp.is_displaced = TRUE;
    `;
  } catch (dispErr) {
    console.warn(`[syncPinAcrossAllFourPillars] keyword_serp_positions displaced lookup note: ${dispErr.message}`);
  }

  let priorShardMetrics = [];
  try {
    priorShardMetrics = await dbSql`
      SELECT recorded_date::text AS snapshot_date, save_count, repin_count, comment_count, share_count, reaction_count, daily_save_velocity, daily_repin_velocity, updated_at
      FROM pins_daily_metrics
      WHERE pin_id = ${cleanPinId}
      ORDER BY recorded_date DESC
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
    const priorCrawlRow = targetRows.find(r => {
      const cIso = toIsoDateStr(r.crawled_at || r.updated_at || r.last_scraped_at);
      return cIso && cIso < todayUtcStr && Number.isFinite(Number(r.save_count)) && Number(r.save_count) > 0;
    });
    const r0 = priorCrawlRow || targetRows[0];
    const crawlDateIso = toIsoDateStr(r0.crawled_at || r0.updated_at || r0.last_scraped_at);

    if (crawlDateIso && crawlDateIso < todayUtcStr && Number.isFinite(Number(r0.save_count))) {
      baselineSaves = Number(r0.save_count);
      baselineDate = r0.crawled_at || r0.updated_at || r0.last_scraped_at;
    } else {
      baselineSaves = Number.isFinite(Number(r0.save_count)) ? Number(r0.save_count) : 0;
      baselineDate = (r0.crawled_at || r0.last_scraped_at || r0.updated_at) ? new Date(r0.crawled_at || r0.last_scraped_at || r0.updated_at) : null;
    }
  } else if (displacedRows.length > 0) {
    const d0 = displacedRows[0];
    baselineSaves = Number.isFinite(Number(d0.save_count)) ? Number(d0.save_count) : 0;
    baselineDate = d0.displaced_date || d0.updated_at || d0.last_scraped_at || null;
  } else if (todayShardRow && Number.isFinite(Number(todayShardRow.save_count))) {
    baselineSaves = Number(todayShardRow.save_count);
    baselineDate = todayShardRow.snapshot_date;
  }

  const targetBaselineRepins = (priorDayShardRow && priorDayShardRow.repin_count != null && Number(priorDayShardRow.repin_count) > 0)
    ? Number(priorDayShardRow.repin_count)
    : ((targetRows.length > 0 && targetRows[0].repin_count != null)
      ? Number(targetRows[0].repin_count)
      : ((displacedRows.length > 0 && displacedRows[0].repin_count != null) ? Number(displacedRows[0].repin_count) : Number(todayShardRow?.repin_count || 0)));

  const jumpDetected = detectHydrationJump({
    currentSaves: newSaves,
    baselineSaves,
    currentRepins: newRepins,
    baselineRepins: targetBaselineRepins
  });
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
  const repinJumpDetected = jumpDetected || isRepinHydrationJump(
    { save_count: baselineSaves, repin_count: targetBaselineRepins },
    { save_count: newSaves, repin_count: newRepins }
  );
  const rawRepinDelta = (repinJumpDetected || newRepins === null) ? 0 : Math.max(0, newRepins - targetBaselineRepins);

  const intradayStepGain = (todayShardRow && newSaves !== null)
    ? Math.max(0, newSaves - Number(todayShardRow.save_count || 0))
    : 0;
  const isIntradayJump = (todayShardRow && newSaves !== null) && detectHydrationJump({
    currentSaves: newSaves,
    baselineSaves: Number(todayShardRow.save_count || 0),
    currentRepins: newRepins,
    baselineRepins: Number(todayShardRow.repin_count || 0)
  });
  const cappedIntradayStepGain = (isIntradayJump || jumpDetected) ? 0 : Math.min(25000, intradayStepGain);

  const intradayRepinStepGain = (todayShardRow && newRepins !== null && !repinJumpDetected && !isRepinHydrationJump(
    { save_count: Number(todayShardRow.save_count || 0), repin_count: Number(todayShardRow.repin_count || 0) },
    { save_count: newSaves, repin_count: newRepins }
  ))
    ? Math.max(0, newRepins - Number(todayShardRow.repin_count || 0))
    : 0;
  const syncVelocity = (newSaves === null)
    ? null
    : (jumpDetected
      ? 0
      : ((hasExplicitScrapedSaves && baselineSaves > 0 && newSaves < baselineSaves)
        ? 0
        : ((!baselineDateIso || baselineDateIso === todayUtcStr)
          ? Math.max(existingPositiveVelocity, computedVelocity, cappedIntradayStepGain)
          : computedVelocity)));
  const safeExistingRepinDelta = (existingPositiveRepinDelta >= 150 && newRepins !== null && newRepins >= 200 && (newRepins - existingPositiveRepinDelta) <= Math.max(60, newRepins * 0.05) && (syncVelocity ?? 0) < existingPositiveRepinDelta * 0.15)
    ? 0
    : existingPositiveRepinDelta;
  const syncRepinsDelta = (newRepins === null)
    ? null
    : (repinJumpDetected
      ? 0
      : ((!baselineDateIso || baselineDateIso === todayUtcStr)
        ? Math.max(safeExistingRepinDelta, rawRepinDelta, intradayRepinStepGain)
        : rawRepinDelta));

  // 7. Upsert two-tier modern snapshot metrics (pins_daily_metrics)
  await dbSql`
    INSERT INTO pins_daily_metrics (
      pin_id, recorded_date, save_count, repin_count, comment_count, share_count, reaction_count, daily_save_velocity, daily_repin_velocity, updated_at
    ) VALUES (
      ${cleanPinId}, (NOW() AT TIME ZONE 'UTC')::date, ${newSaves}, ${newRepins},
      ${newComments}, ${newShares}, ${totalReactions}, ${syncVelocity}, ${syncRepinsDelta}, NOW()
    )
    ON CONFLICT (pin_id, recorded_date) DO UPDATE SET
      save_count = CASE
        WHEN EXCLUDED.save_count IS NOT NULL AND EXCLUDED.save_count > 0 THEN EXCLUDED.save_count
        WHEN COALESCE(pins_daily_metrics.save_count, 0) > 0 THEN pins_daily_metrics.save_count
        WHEN ${hasExplicitScrapedSaves} AND EXCLUDED.save_count IS NOT NULL THEN EXCLUDED.save_count
        ELSE pins_daily_metrics.save_count
      END,
      repin_count = CASE
        WHEN EXCLUDED.repin_count IS NOT NULL AND EXCLUDED.repin_count > 0 THEN EXCLUDED.repin_count
        WHEN COALESCE(pins_daily_metrics.repin_count, 0) > 0 THEN pins_daily_metrics.repin_count
        WHEN ${hasExplicitScrapedRepins} AND EXCLUDED.repin_count IS NOT NULL THEN EXCLUDED.repin_count
        ELSE pins_daily_metrics.repin_count
      END,
      comment_count = GREATEST(pins_daily_metrics.comment_count, EXCLUDED.comment_count),
      share_count = GREATEST(pins_daily_metrics.share_count, EXCLUDED.share_count),
      reaction_count = GREATEST(pins_daily_metrics.reaction_count, EXCLUDED.reaction_count),
      daily_save_velocity = COALESCE(EXCLUDED.daily_save_velocity, pins_daily_metrics.daily_save_velocity),
      daily_repin_velocity = COALESCE(EXCLUDED.daily_repin_velocity, pins_daily_metrics.daily_repin_velocity),
      updated_at = NOW();
  `;
  try {
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
        save_count = CASE
          WHEN ${newSaves !== null && newSaves > 0} THEN ${newSaves}::bigint
          WHEN COALESCE(universal_master_pins.save_count, 0) > 0 THEN universal_master_pins.save_count
          WHEN ${hasExplicitScrapedSaves} AND ${newSaves !== null} THEN ${newSaves}::bigint
          ELSE universal_master_pins.save_count
        END,
        repin_count = CASE
          WHEN ${newRepins !== null && newRepins > 0} THEN ${newRepins}::bigint
          WHEN COALESCE(universal_master_pins.repin_count, 0) > 0 THEN universal_master_pins.repin_count
          WHEN ${hasExplicitScrapedRepins} AND ${newRepins !== null} THEN ${newRepins}::bigint
          ELSE universal_master_pins.repin_count
        END,
        comment_count = GREATEST(universal_master_pins.comment_count, ${newComments}::int),
        share_count = GREATEST(universal_master_pins.share_count, ${newShares}::int),
        reaction_count = GREATEST(COALESCE(universal_master_pins.reaction_count, 0), ${totalReactions}::int),
        is_hydrated = (universal_master_pins.is_hydrated OR ${hasExplicitScrapedSaves}),
        daily_save_velocity = COALESCE(${syncVelocity}::numeric, daily_save_velocity),
        daily_repin_velocity = COALESCE(${syncRepinsDelta}::numeric, daily_repin_velocity),
        delta_saves_24h = CASE WHEN ${syncVelocity} IS NOT NULL THEN ROUND(${syncVelocity}::numeric)::bigint ELSE delta_saves_24h END,
        delta_repins_24h = COALESCE(${syncRepinsDelta}::bigint, delta_repins_24h),
        last_scraped_at = NOW(),
        updated_at = NOW()
      WHERE pin_id = ${cleanPinId};
    `;
  } catch (err) {
    console.error(`[PinRepository.syncPinAcrossAllFourPillars] universal_master_pins metric update failed for pin ${cleanPinId}:`, err?.message || err);
  }

  // 8. Upsert SERP positions (keyword_serp_positions) for each associated active or displaced keyword
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
      INSERT INTO keyword_serp_positions (
        keyword_id, pin_id, rank_position, is_displaced, last_known_rank, updated_at
      )
      SELECT 
        x.keyword_id,
        x.pin_id,
        x.rank_position,
        x.is_displaced,
        x.last_known_rank,
        NOW()
      FROM jsonb_to_recordset(${positionsPayload}::jsonb) AS x(
        keyword_id INT,
        pin_id VARCHAR(64),
        rank_position INT,
        is_displaced BOOLEAN,
        last_known_rank INT
      )
      ON CONFLICT (keyword_id, pin_id) DO UPDATE SET
        rank_position = CASE WHEN EXCLUDED.is_displaced = TRUE THEN NULL ELSE EXCLUDED.rank_position END,
        is_displaced = COALESCE(EXCLUDED.is_displaced, FALSE),
        last_known_rank = COALESCE(EXCLUDED.last_known_rank, keyword_serp_positions.last_known_rank),
        updated_at = NOW();
    `;
  }

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
