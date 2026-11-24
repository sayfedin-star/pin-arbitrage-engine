/**
 * Keyword Displaced SERP Vault, Vacuum Opportunity Scoring & Tombstone Removal Service
 * Extracted from src/modules/keywords/service.mjs
 *
 * Pure leaf module within src/modules/keywords/ (zero sibling imports) so
 * serp-dossier-service.mjs and folders-crud.mjs depend downward cleanly with zero cycles.
 */

/**
 * Calculates continuous Decay- & Competition-Adjusted SERP Vacuum Opportunity Score (0..100)
 */
export function computeVacuumOpportunityScore({ lastKnownRank = 30, domainlessTop10Count = 0, saveCount = 0, medianTop10Saves = 100 } = {}) {
  const rank = Math.max(1, Number(lastKnownRank || 30));
  const rankScore = 55.0 * Math.exp(-0.045 * (rank - 1));
  const domainlessGapScore = Math.min(25, Number(domainlessTop10Count || 0) * 8);
  const savesRatio = Number(saveCount || 0) / Math.max(100, Number(medianTop10Saves || 100));
  const compScore = Math.min(20, Math.round(15.0 * savesRatio));
  return Math.min(100, Math.max(10, Math.round(rankScore + domainlessGapScore + compScore)));
}

/**
 * Slims heavy universal_master_pins.metadata JSONB (~2.4 KiB/pin) down to the exact
 * allowlist consumed by SERP Matrix, Cards, Intelligence, and Pin Row UIs.
 */
export function slimSerpPinMetadata(rawMeta) {
  if (!rawMeta || typeof rawMeta !== 'object' || Array.isArray(rawMeta)) return {};
  const slim = {};
  const scalarKeys = [
    'pin_age_days', 'format', 'aspect_ratio', 'aspect_ratio_tier',
    'is_new', 'rank_delta', 'prev_rank', 'baseline_date',
    'is_deleted', 'status', 'raw_saves', 'repin_count',
    'board_name', 'creation_method', 'method', 'created_at', 'created_at_pinterest'
  ];
  for (const k of scalarKeys) {
    if (rawMeta[k] !== undefined && rawMeta[k] !== null && rawMeta[k] !== '') {
      slim[k] = rawMeta[k];
    }
  }
  if (rawMeta.deltas && typeof rawMeta.deltas === 'object' && !Array.isArray(rawMeta.deltas)) {
    slim.deltas = rawMeta.deltas;
  }
  if (rawMeta.pinner && typeof rawMeta.pinner === 'object') {
    const p = rawMeta.pinner;
    const slimPinner = {};
    if (p.username) slimPinner.username = p.username;
    if (p.full_name) slimPinner.full_name = p.full_name;
    if (p.follower_count !== undefined && p.follower_count !== null) slimPinner.follower_count = p.follower_count;
    if (p.image_small_url) slimPinner.image_small_url = p.image_small_url;
    if (Object.keys(slimPinner).length > 0) slim.pinner = slimPinner;
  }
  return slim;
}

/**
 * Retrieve persistent displaced pins for a keyword from keyword_serp_positions (is_displaced = TRUE)
 * with calculated live deltas and arbitrage vacuum opportunity score.
 */
export async function getKeywordDisplacedPins(sql, keywordId, options = {}) {
  const kid = Number(keywordId);
  if (!kid) throw new Error('Valid keyword ID is required');

  const { limit = 500, offset = 0, status = 'ALL' } = options;
  const cleanStatus = String(status || 'ALL').trim();
  // Currently all non-ignored displaced pins have status 'displaced_active'
  if (cleanStatus && cleanStatus !== 'ALL' && cleanStatus !== 'displaced_active') {
    return {
      success: true,
      keyword_id: kid,
      total: 0,
      pins: []
    };
  }
  // Bound page size to <= 500 displaced pins per query
  const lim = Math.min(500, Math.max(1, Number(limit) || 500));
  const off = Math.max(0, Number(offset) || 0);

  // Query keyword_serp_positions joined with universal_master_pins in parallel (surface real DB errors)
  const [rawRows, cntRows, activeStatsRows] = await Promise.all([
    sql`
      SELECT
        ksp.keyword_id,
        ksp.pin_id,
        ump.title,
        COALESCE(ump.clean_domain, '') AS domain,
        ump.destination_url,
        ump.image_url,
        ump.creator_username,
        ump.board_name,
        ksp.last_known_rank,
        ksp.displaced_date,
        'displaced_active' AS status,
        ump.save_count AS current_saves,
        ump.save_count,
        ump.repin_count AS current_repins,
        ump.repin_count,
        ump.comment_count AS current_comments,
        ump.comment_count,
        ump.share_count AS current_shares,
        ump.share_count,
        ump.daily_save_velocity,
        ump.daily_save_velocity AS calculated_velocity,
        ump.daily_repin_velocity,
        ksp.vacuum_opportunity_score,
        COALESCE(ump.alt_text, '') AS seo_alt_text,
        COALESCE(ump.visual_annotations, '[]'::jsonb) AS annotations,
        COALESCE(NULLIF(ump.dominant_color, ''), '#888888') AS dominant_color,
        ump.created_at_pinterest,
        COALESCE(NULLIF(ump.creation_method, ''), 'pinterest_platform') AS creation_method,
        COALESCE(ump.metadata, '{}'::jsonb) AS metadata,
        ksp.updated_at AS created_at
      FROM keyword_serp_positions ksp
      JOIN universal_master_pins ump ON ump.pin_id = ksp.pin_id
      WHERE ksp.keyword_id = ${kid}
        AND ksp.is_displaced = TRUE
        AND NOT EXISTS (
          SELECT 1 FROM keyword_ignored_pins kip
          WHERE kip.keyword_id = ${kid} AND kip.pin_id = ksp.pin_id
        )
      ORDER BY ksp.vacuum_opportunity_score DESC NULLS LAST, ksp.last_known_rank ASC NULLS LAST
      LIMIT ${lim} OFFSET ${off};
    `,
    sql`
      SELECT COUNT(*)::int AS total
      FROM keyword_serp_positions ksp
      WHERE ksp.keyword_id = ${kid}
        AND ksp.is_displaced = TRUE
        AND NOT EXISTS (
          SELECT 1 FROM keyword_ignored_pins kip
          WHERE kip.keyword_id = ${kid} AND kip.pin_id = ksp.pin_id
        );
    `,
    sql`
      SELECT
        COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ump.save_count), 500)::numeric AS median_saves,
        COUNT(*) FILTER (WHERE LOWER(BTRIM(COALESCE(ump.clean_domain, ''))) IN ('', 'uploaded by user', 'uploaded-by-user', 'organic'))::int AS domainless_top10
      FROM keyword_serp_positions ksp
      JOIN universal_master_pins ump ON ump.pin_id = ksp.pin_id
      WHERE ksp.keyword_id = ${kid}
        AND ksp.is_displaced = FALSE
        AND ksp.rank_position <= 10;
    `
  ]);

  const rows = Array.isArray(rawRows) ? rawRows : [];
  const cntRow = cntRows?.[0];
  const activeStatsRow = activeStatsRows?.[0];

  const medianTop10Saves = Math.max(100, Number(activeStatsRow?.median_saves || 500));
  const domainlessTop10Count = Math.max(0, Number(activeStatsRow?.domainless_top10 || 0));

  // Calculate live deltas and continuous vacuum opportunity score for each pin
  for (const pin of rows) {
    pin.save_count = pin.save_count != null ? Number(pin.save_count) : (pin.current_saves != null ? Number(pin.current_saves) : null);
    pin.repin_count = pin.repin_count != null ? Number(pin.repin_count) : (pin.current_repins != null ? Number(pin.current_repins) : null);
    pin.comment_count = pin.comment_count != null ? Number(pin.comment_count) : (pin.current_comments != null ? Number(pin.current_comments) : null);
    pin.share_count = pin.share_count != null ? Number(pin.share_count) : (pin.current_shares != null ? Number(pin.current_shares) : null);
    if (!pin.daily_save_velocity || pin.daily_save_velocity === 0) {
      pin.daily_save_velocity = Number(pin.calculated_velocity || 0);
    }
    pin.current_saves = pin.save_count;
    pin.current_repins = pin.repin_count;
    pin.current_comments = pin.comment_count;
    pin.current_shares = pin.share_count;
    pin.board_name = pin.board_name || pin.metadata?.board_name || null;
    pin.creation_method = pin.creation_method || pin.metadata?.creation_method || pin.metadata?.method || null;
    pin.created_at_pinterest = pin.created_at_pinterest || pin.metadata?.created_at_pinterest || pin.metadata?.created_at || null;
    pin.metadata = slimSerpPinMetadata(pin.metadata);

    if (!pin.vacuum_opportunity_score || pin.vacuum_opportunity_score === 0) {
      pin.vacuum_opportunity_score = computeVacuumOpportunityScore({
        lastKnownRank: pin.last_known_rank,
        domainlessTop10Count,
        saveCount: pin.save_count,
        medianTop10Saves
      });
    }
  }

  return {
    success: true,
    keyword_id: kid,
    total: cntRow?.total || rows.length,
    pins: rows
  };
}

/**
 * Canonical SERP Tombstone & Position Removal Helper
 * Atomically records tombstones in keyword_ignored_pins and removes matching (keyword_id, pin_id)
 * rows from keyword_serp_positions so deleted/pruned pins never resurrect on future crawls.
 */
export async function ignoreAndRemoveSerpPin(sql, {
  pairs = null,
  keywordId = null,
  pinId = null,
  reason = 'manual_user_deletion'
} = {}) {
  if (!sql) return { deletedCount: 0, deletedPinIds: [], pairs: [] };

  const rawList = Array.isArray(pairs)
    ? pairs
    : (keywordId != null && pinId != null ? [{ keyword_id: keywordId, pin_id: pinId }] : []);

  const dedupMap = new Map();
  for (const item of rawList) {
    const kid = Number(item?.keyword_id ?? item?.keywordId ?? item?.kid);
    const pid = String(item?.pin_id ?? item?.pinId ?? item?.pid ?? '').trim();
    const itemReason = String(item?.ignored_reason || item?.reason || reason || 'manual_user_deletion');
    if (Number.isInteger(kid) && kid > 0 && pid) {
      dedupMap.set(`${kid}:${pid}`, {
        keyword_id: kid,
        pin_id: pid,
        ignored_reason: itemReason
      });
    }
  }

  const normalizedPairs = Array.from(dedupMap.values()).sort(
    (a, b) => (a.keyword_id - b.keyword_id) || a.pin_id.localeCompare(b.pin_id)
  );
  if (normalizedPairs.length === 0) {
    return { deletedCount: 0, deletedPinIds: [], pairs: [] };
  }

  const runInTx = async (fn) => (typeof sql?.begin === 'function' ? sql.begin(fn) : fn(sql));

  if (normalizedPairs.length === 1) {
    const [{ keyword_id: kid, pin_id: pid, ignored_reason: ignReason }] = normalizedPairs;
    const deletedRows = await runInTx(async (tx) => {
      await tx`
        INSERT INTO keyword_ignored_pins (keyword_id, pin_id, ignored_reason, ignored_at)
        VALUES (${kid}, ${pid}, ${ignReason}, NOW())
        ON CONFLICT (keyword_id, pin_id) DO UPDATE SET
          ignored_reason = EXCLUDED.ignored_reason,
          ignored_at = NOW();
      `;

      return await tx`
        DELETE FROM keyword_serp_positions
        WHERE keyword_id = ${kid} AND pin_id = ${pid}
        RETURNING keyword_id, pin_id;
      `;
    });

    return {
      deletedCount: Array.isArray(deletedRows) ? deletedRows.length : 0,
      deletedPinIds: Array.from(new Set(
        (Array.isArray(deletedRows) ? deletedRows : [])
          .map((r) => String(r?.pin_id || '').trim())
          .filter(Boolean)
      )),
      pairs: normalizedPairs
    };
  }

  const payloadJson = JSON.stringify(normalizedPairs);
  const deletedRows = await runInTx(async (tx) => {
    await tx`
      INSERT INTO keyword_ignored_pins (keyword_id, pin_id, ignored_reason, ignored_at)
      SELECT x.keyword_id, x.pin_id, x.ignored_reason, NOW()
      FROM jsonb_to_recordset(${payloadJson}::jsonb) AS x(
        keyword_id int,
        pin_id text,
        ignored_reason text
      )
      ON CONFLICT (keyword_id, pin_id) DO UPDATE SET
        ignored_reason = EXCLUDED.ignored_reason,
        ignored_at = NOW();
    `;

    return await tx`
      DELETE FROM keyword_serp_positions ksp
      USING jsonb_to_recordset(${payloadJson}::jsonb) AS x(
        keyword_id int,
        pin_id text,
        ignored_reason text
      )
      WHERE ksp.keyword_id = x.keyword_id
        AND ksp.pin_id = x.pin_id
      RETURNING ksp.keyword_id, ksp.pin_id;
    `;
  });

  return {
    deletedCount: Array.isArray(deletedRows) ? deletedRows.length : 0,
    deletedPinIds: Array.from(new Set(
      (Array.isArray(deletedRows) ? deletedRows : [])
        .map((r) => String(r?.pin_id || '').trim())
        .filter(Boolean)
    )),
    pairs: normalizedPairs
  };
}
