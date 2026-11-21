/**
 * Global 24-Hour Algorithmic Pulse SQL Query Helpers (src/modules/pulse/pulse-queries.mjs)
 *
 * Encapsulates the 7 core PostgreSQL queries powering the 24h Pulse & Crossover Engine:
 * 1. queryActiveSerp: Active SERP & Folder Mapping (Zero-Cartesian CTE, Hub Skeletal Compaction)
 * 2. queryVaultAndVacuum: Displaced Vault Surge & 24h SERP Vacuum
 * 3. queryViralCreatorPins: Top Surging Competitor & Creator Pins
 * 4. queryGuidedCapsules: Global Guided Search Capsules
 * 5. queryBreakoutCreators: Breakout Creators with Historical Delta Fallbacks & Top 3 Driver Pins
 * 6. queryWinnersAndDomains: PinArchive 24h Winners & Domain Arbitrage Leaders
 * 7. queryKPIs: Executive 24h Pulse KPI Telemetry from mv_pulse_24h_summary with fallback
 *
 * // [INVARIANT: CENTRAL-HUB-SKELETAL-COMPACTION]
 * // [INVARIANT: ZERO-HUB-SNAPSHOTS]
 * // [INVARIANT: FOLDER-SINGLE-PASS-CTE]
 */

/**
 * Query 1: Active SERP & Folder Mapping (Zero-Cartesian CTE)
 * Strictly obeys Hub Skeletal Compaction: does NOT select description, alt_text, or seo_title from ksp.
 */
export async function queryActiveSerp(sql, folderIdNum) {
  return await sql`
    WITH kw_folders AS (
      SELECT
        kfi.keyword_id,
        jsonb_agg(
          jsonb_build_object('folder_id', kf.id, 'folder_name', kf.name, 'folder_color', kf.color)
          ORDER BY kf.name ASC
        ) AS folders
      FROM keyword_folder_items kfi
      JOIN keyword_folders kf ON kf.id = kfi.folder_id
      GROUP BY kfi.keyword_id
    )
    SELECT
      COUNT(*) OVER()::int AS full_count,
      ksp.keyword_id,
      tk.keyword AS keyword_text,
      tk.category AS keyword_category,
      COALESCE(kwf.folders, '[]'::jsonb) AS folders,
      ksp.pin_id,
      ksp.rank_position,
      ksp.prev_rank_position,
      COALESCE(NULLIF(ump.title, ''), '') AS title,
      COALESCE(NULLIF(ump.domain, ''), '') AS domain,
      COALESCE(NULLIF(ump.destination_url, ''), '') AS destination_url,
      COALESCE(NULLIF(ump.image_url, ''), '') AS image_url,
      COALESCE(NULLIF(ump.creator_username, ''), '') AS creator_username,
      COALESCE(NULLIF(ump.board_name, ''), '') AS board_name,
      LEFT(COALESCE(ump.description, ''), 80) AS description,
      LEFT(COALESCE(ump.alt_text, ''), 60) AS alt_text,
      ump.save_count,
      ump.repin_count,
      COALESCE(ump.daily_save_velocity, 0) AS daily_save_velocity,
      COALESCE(ump.delta_saves_24h, 0) AS delta_saves_24h,
      COALESCE(ump.delta_repins_24h, 0) AS delta_repins_24h,
      COALESCE(ump.gains_5d, 0) AS gains_5d,
      COALESCE(ump.gains_7d, 0) AS gains_7d,
      COALESCE(ump.gains_10d, 0) AS gains_10d,
      COALESCE(ump.gains_15d, 0) AS gains_15d,
      COALESCE(ump.url_global_saves, 0) AS url_global_saves,
      CASE WHEN ump.dominant_color NOT IN ('', '#888888', '#1e1e24', '#000000', '#18181b') THEN ump.dominant_color ELSE NULL END AS dominant_color,
      COALESCE(NULLIF(ump.visual_annotations, '[]'::jsonb), '[]'::jsonb) AS visual_annotations,
      ump.created_at_pinterest,
      COALESCE(NULLIF(ump.creation_method, ''), NULLIF(ump.metadata->>'creation_method', ''), 'pinterest_platform') AS creation_method,
      ksp.crawled_at
    FROM keyword_serp_positions ksp
    JOIN tracked_keywords tk ON tk.id = ksp.keyword_id
    JOIN universal_master_pins ump ON ump.pin_id = ksp.pin_id
    LEFT JOIN kw_folders kwf ON kwf.keyword_id = ksp.keyword_id
    WHERE ksp.is_displaced = FALSE
      AND ksp.rank_position IS NOT NULL
      AND ksp.rank_position >= 1
      AND (${folderIdNum}::int IS NULL OR EXISTS (
        SELECT 1 FROM keyword_folder_items fi 
        WHERE fi.keyword_id = ksp.keyword_id AND fi.folder_id = ${folderIdNum}::int
      ))
    ORDER BY ump.daily_save_velocity DESC NULLS LAST, ump.save_count DESC NULLS LAST
    LIMIT 2500;
  `;
}

/**
 * Query 2: Displaced Vault Surge & 24h SERP Vacuum (keyword_serp_positions WHERE is_displaced = TRUE)
 * Part 2A: Aggregates displaced counts per keyword.
 * Part 2B: Full Surging Displaced Vault Pins hydrated from universal_master_pins SSOT.
 */
export async function queryVaultAndVacuum(sql, folderIdNum, _env) {
  const [vacuumRows, vaultPinsRaw] = await Promise.all([
    sql`
      SELECT
        ksp.keyword_id,
        tk.keyword AS keyword_text,
        COUNT(*) FILTER (WHERE ksp.displaced_date >= CURRENT_DATE - 1)::int AS displaced_24h_count,
        COUNT(*) FILTER (WHERE ksp.displaced_date >= CURRENT_DATE - 1 AND ksp.last_known_rank <= 10)::int AS displaced_top10_24h_count,
        COUNT(*) FILTER (WHERE ksp.last_known_rank <= 10)::int AS displaced_top10_7d_count
      FROM keyword_serp_positions ksp
      JOIN tracked_keywords tk ON tk.id = ksp.keyword_id
      WHERE ksp.is_displaced = TRUE
        AND ksp.displaced_date >= CURRENT_DATE - 7
        AND (${folderIdNum}::int IS NULL OR EXISTS (
          SELECT 1 FROM keyword_folder_items fi 
          WHERE fi.keyword_id = ksp.keyword_id AND fi.folder_id = ${folderIdNum}::int
        ))
      GROUP BY ksp.keyword_id, tk.keyword;
    `,
    sql`
      WITH top_vault AS MATERIALIZED (
        SELECT
          ksp.keyword_id,
          ksp.pin_id,
          ksp.last_known_rank,
          ksp.vacuum_opportunity_score,
          ksp.displaced_date,
          ksp.updated_at
        FROM keyword_serp_positions ksp
        JOIN universal_master_pins ump ON ump.pin_id = ksp.pin_id
        WHERE ksp.is_displaced = TRUE
          AND (ump.daily_save_velocity > 0 OR COALESCE(ump.delta_repins_24h, 0) > 0)
          AND ksp.updated_at >= NOW() - INTERVAL '48 hours'
          AND (${folderIdNum}::int IS NULL OR EXISTS (
            SELECT 1 FROM keyword_folder_items fi 
            WHERE fi.keyword_id = ksp.keyword_id AND fi.folder_id = ${folderIdNum}::int
          ))
        ORDER BY ump.daily_save_velocity DESC NULLS LAST, ump.save_count DESC NULLS LAST
        LIMIT 2500
      )
      SELECT
        tv.keyword_id,
        tk.keyword AS keyword_text,
        tk.category AS keyword_category,
        tv.pin_id,
        tv.last_known_rank,
        tv.vacuum_opportunity_score,
        tv.displaced_date,
        ump.save_count,
        ump.repin_count,
        COALESCE(ump.daily_save_velocity, 0) AS daily_save_velocity,
        COALESCE(ump.delta_saves_24h, 0) AS delta_saves_24h,
        COALESCE(ump.delta_repins_24h, 0) AS delta_repins_24h,
        COALESCE(ump.gains_5d, 0) AS gains_5d,
        COALESCE(ump.gains_7d, 0) AS gains_7d,
        COALESCE(ump.gains_10d, 0) AS gains_10d,
        COALESCE(ump.gains_15d, 0) AS gains_15d,
        COALESCE(NULLIF(ump.domain, ''), '') AS domain,
        COALESCE(NULLIF(ump.creator_username, ''), '') AS creator_username,
        COALESCE(NULLIF(ump.title, ''), '') AS title,
        LEFT(COALESCE(NULLIF(ump.description, ''), ''), 80) AS description,
        LEFT(COALESCE(NULLIF(ump.alt_text, ''), ''), 60) AS alt_text,
        COALESCE(NULLIF(ump.image_url, ''), '') AS image_url,
        COALESCE(NULLIF(ump.destination_url, ''), '') AS destination_url,
        COALESCE(NULLIF(ump.board_name, ''), '') AS board_name,
        COALESCE(
          CASE WHEN ump.dominant_color NOT IN ('', '#888888', '#1e1e24', '#000000', '#18181b') THEN ump.dominant_color ELSE NULL END,
          NULL
        ) AS dominant_color,
        COALESCE(NULLIF(ump.visual_annotations, '[]'::jsonb), '[]'::jsonb) AS visual_annotations,
        ump.created_at_pinterest
      FROM top_vault tv
      JOIN tracked_keywords tk ON tk.id = tv.keyword_id
      JOIN universal_master_pins ump ON ump.pin_id = tv.pin_id
      ORDER BY ump.daily_save_velocity DESC NULLS LAST, ump.save_count DESC NULLS LAST
      LIMIT 2500;
    `
  ]);

  return { vacuumRows, vaultPins: vaultPinsRaw };
}

/**
 * Query 6: Top 150 Surging Competitor & Creator Pins (competitor_board_pins + universal_master_pins)
 */
export async function queryViralCreatorPins(sql, folderIdNum) {
  return await sql`
    SELECT
      ump.pin_id,
      COALESCE(NULLIF(ump.title, ''), '') AS title,
      LEFT(COALESCE(NULLIF(ump.description, ''), ''), 120) AS description,
      LEFT(COALESCE(NULLIF(ump.alt_text, ''), ''), 120) AS alt_text,
      COALESCE(NULLIF(ump.image_url, ''), '') AS image_url,
      COALESCE(NULLIF(ump.destination_url, ''), '') AS destination_url,
      COALESCE(NULLIF(ump.domain, ''), '') AS domain,
      COALESCE(NULLIF(ump.board_name, ''), '') AS board_name,
      cp.username AS creator_username,
      ump.save_count,
      ump.repin_count,
      COALESCE(ump.daily_save_velocity, 0) AS daily_save_velocity,
      COALESCE(ump.delta_saves_24h, 0) AS delta_saves_24h,
      COALESCE(ump.delta_repins_24h, 0) AS delta_repins_24h,
      ump.created_at_pinterest,
      COALESCE(NULLIF(ump.visual_annotations, '[]'::jsonb), '[]'::jsonb) AS visual_annotations
    FROM competitor_board_pins cbp
    JOIN competitor_profiles cp ON cp.id = cbp.competitor_id
    JOIN universal_master_pins ump ON ump.pin_id = cbp.pin_id
    WHERE COALESCE(NULLIF(ump.image_url, ''), '') <> ''
      AND (${folderIdNum}::int IS NULL OR cp.source_folder_id = ${folderIdNum}::int OR EXISTS (
        SELECT 1 FROM folder_competitor_items fci 
        WHERE fci.competitor_id = cbp.competitor_id AND fci.folder_id = ${folderIdNum}::int
      ))
      AND (ump.daily_save_velocity > 0 OR COALESCE(ump.delta_saves_24h, 0) > 0 OR COALESCE(ump.delta_repins_24h, 0) > 0 OR COALESCE(ump.save_count, 0) >= 50)
    ORDER BY ump.daily_save_velocity DESC NULLS LAST, ump.save_count DESC NULLS LAST
    LIMIT 120;
  `;
}

/**
 * Query 3: Global Guided Search Capsules Query (keyword_guided_capsules)
 */
export async function queryGuidedCapsules(sql, folderIdNum) {
  return await sql`
    SELECT
      c.id,
      c.keyword_id,
      c.term,
      c.display_label,
      COALESCE(c.score, 0) AS score,
      COALESCE(c.dominant_color, '#3b82f6') AS dominant_color,
      COALESCE(c.display_order, 10) AS display_order,
      tk.keyword AS keyword_text,
      tk.category AS keyword_category
    FROM keyword_guided_capsules c
    JOIN tracked_keywords tk ON tk.id = c.keyword_id
    WHERE (${folderIdNum}::int IS NULL OR EXISTS (
      SELECT 1 FROM keyword_folder_items fi 
      WHERE fi.keyword_id = c.keyword_id AND fi.folder_id = ${folderIdNum}::int
    ))
    ORDER BY c.score DESC, c.display_order ASC
    LIMIT 1000;
  `;
}

/**
 * Query 4: Breakout Creators with Historical Delta Fallbacks and Top 3 Driver Pins
 */
export async function queryBreakoutCreators(sql, folderIdNum) {
  return await sql`
    WITH snap_prev1d AS (
      SELECT competitor_id, monthly_reach AS prev_reach_1d, profile_views AS prev_views_1d
      FROM competitor_history_snapshots
      WHERE recorded_date = CURRENT_DATE - 1
    ),
    snap_prev7d AS (
      SELECT competitor_id, monthly_reach AS prev_reach_7d, profile_views AS prev_views_7d
      FROM competitor_history_snapshots
      WHERE recorded_date = CURRENT_DATE - 7
    ),
    active_creators AS (
      SELECT
        cprof.id,
        cprof.username,
        cprof.display_name,
        cprof.avatar_url,
        cprof.bio,
        cprof.website_url,
        COALESCE(cprof.monthly_reach, 0) AS monthly_reach,
        COALESCE(cprof.profile_views, 0) AS profile_views,
        COALESCE(cprof.total_pins, 0) AS total_pins,
        COALESCE(cprof.total_boards, 0) AS total_boards,
        COALESCE(cprof.follower_count, 0) AS follower_count,
        COALESCE(cprof.delta_reach_24h, 0) AS delta_reach_24h,
        COALESCE(cprof.delta_views_24h, 0) AS delta_views_24h,
        COALESCE(cprof.reach_delta_7d, 0) AS reach_delta_7d,
        COALESCE(cprof.views_delta_7d, 0) AS views_delta_7d,
        COALESCE(cprof.delta_pins_24h, 0) AS delta_pins_24h,
        cprof.last_synced_at,
        CASE
          WHEN COALESCE(cprof.delta_reach_24h, 0) <> 0 THEN cprof.delta_reach_24h
          WHEN sp1.prev_reach_1d IS NOT NULL AND sp1.prev_reach_1d > 0 THEN (cprof.monthly_reach - sp1.prev_reach_1d)
          ELSE 0
        END AS effective_delta_reach_24h,
        CASE
          WHEN COALESCE(cprof.delta_views_24h, 0) <> 0 THEN cprof.delta_views_24h
          WHEN sp1.prev_views_1d IS NOT NULL AND sp1.prev_views_1d > 0 THEN (cprof.profile_views - sp1.prev_views_1d)
          ELSE 0
        END AS effective_delta_views_24h,
        CASE
          WHEN COALESCE(cprof.reach_delta_7d, 0) <> 0 THEN cprof.reach_delta_7d
          WHEN sp7.prev_reach_7d IS NOT NULL AND sp7.prev_reach_7d > 0 THEN (cprof.monthly_reach - sp7.prev_reach_7d)
          ELSE 0
        END AS effective_reach_delta_7d,
        CASE
          WHEN COALESCE(cprof.views_delta_7d, 0) <> 0 THEN cprof.views_delta_7d
          WHEN sp7.prev_views_7d IS NOT NULL AND sp7.prev_views_7d > 0 THEN (cprof.profile_views - sp7.prev_views_7d)
          ELSE 0
        END AS effective_views_delta_7d
      FROM competitor_profiles cprof
      LEFT JOIN snap_prev1d sp1 ON sp1.competitor_id = cprof.id
      LEFT JOIN snap_prev7d sp7 ON sp7.competitor_id = cprof.id
      WHERE cprof.is_active = TRUE
        AND (
          cprof.monthly_reach > 0 OR cprof.profile_views > 0
          OR cprof.delta_reach_24h <> 0 OR cprof.delta_views_24h <> 0
          OR cprof.reach_delta_7d <> 0
          OR sp1.prev_reach_1d IS NOT NULL
        )
        AND (${folderIdNum}::int IS NULL OR cprof.source_folder_id = ${folderIdNum}::int OR EXISTS (
          SELECT 1 FROM folder_competitor_items fci 
          WHERE fci.competitor_id = cprof.id AND fci.folder_id = ${folderIdNum}::int
        ))
    ),
    top_creators AS (
      SELECT *
      FROM active_creators
      WHERE (effective_delta_reach_24h > 0 OR effective_reach_delta_7d > 0 OR monthly_reach > 0)
      ORDER BY 
        effective_delta_reach_24h DESC,
        effective_reach_delta_7d DESC,
        monthly_reach DESC
      LIMIT 60
    ),
    candidate_creator_pins AS (
      SELECT
        cbp.competitor_id,
        ump.pin_id,
        COALESCE(NULLIF(ump.title, ''), '') AS title,
        COALESCE(NULLIF(ump.image_url, ''), '') AS image_url,
        COALESCE(NULLIF(ump.board_name, ''), '') AS board_name,
        COALESCE(NULLIF(ump.domain, ''), '') AS link_domain,
        COALESCE(NULLIF(ump.destination_url, ''), '') AS destination_url,
        ump.save_count,
        ump.repin_count,
        COALESCE(ump.delta_saves_24h, ump.daily_save_velocity, 0)::numeric AS delta_saves_24h,
        COALESCE(ump.daily_save_velocity, 0)::numeric AS daily_save_velocity,
        ump.created_at_pinterest
      FROM competitor_board_pins cbp
      JOIN top_creators tc ON tc.id = cbp.competitor_id
      JOIN universal_master_pins ump ON ump.pin_id = cbp.pin_id
      WHERE COALESCE(NULLIF(ump.image_url, ''), '') <> ''

      UNION ALL

      SELECT
        tc.id AS competitor_id,
        ump.pin_id,
        COALESCE(NULLIF(ump.title, ''), '') AS title,
        COALESCE(NULLIF(ump.image_url, ''), '') AS image_url,
        COALESCE(NULLIF(ump.board_name, ''), '') AS board_name,
        COALESCE(NULLIF(ump.domain, ''), '') AS link_domain,
        COALESCE(NULLIF(ump.destination_url, ''), '') AS destination_url,
        ump.save_count,
        ump.repin_count,
        COALESCE(ump.delta_saves_24h, ump.daily_save_velocity, 0)::numeric AS delta_saves_24h,
        COALESCE(ump.daily_save_velocity, 0)::numeric AS daily_save_velocity,
        ump.created_at_pinterest
      FROM universal_master_pins ump
      JOIN top_creators tc ON LOWER(TRIM(REPLACE(COALESCE(tc.username, ''), '@', ''))) = LOWER(TRIM(REPLACE(COALESCE(ump.creator_username, ''), '@', '')))
      WHERE COALESCE(NULLIF(ump.image_url, ''), '') <> ''
    ),
    deduped_creator_pins AS (
      SELECT DISTINCT ON (ccp.competitor_id, ccp.pin_id)
        ccp.competitor_id,
        ccp.pin_id,
        ccp.title,
        ccp.image_url,
        ccp.board_name,
        ccp.link_domain,
        ccp.destination_url,
        ccp.save_count,
        ccp.repin_count,
        ccp.delta_saves_24h,
        ccp.daily_save_velocity,
        ccp.created_at_pinterest
      FROM candidate_creator_pins ccp
      ORDER BY ccp.competitor_id, ccp.pin_id, GREATEST(ccp.delta_saves_24h, ccp.daily_save_velocity) DESC, ccp.save_count DESC
    ),
    ranked_pins AS (
      SELECT
        dcp.competitor_id,
        dcp.pin_id,
        dcp.title,
        dcp.image_url,
        dcp.board_name,
        dcp.link_domain,
        dcp.destination_url,
        dcp.save_count,
        dcp.repin_count,
        dcp.delta_saves_24h,
        dcp.daily_save_velocity,
        dcp.created_at_pinterest,
        ROW_NUMBER() OVER (
          PARTITION BY dcp.competitor_id
          ORDER BY (CASE WHEN GREATEST(dcp.delta_saves_24h, dcp.daily_save_velocity) > 0 THEN 1 ELSE 0 END) DESC,
                   GREATEST(dcp.delta_saves_24h, dcp.daily_save_velocity) DESC,
                   dcp.save_count DESC
        ) AS rn
      FROM deduped_creator_pins dcp
      WHERE dcp.daily_save_velocity > 0 OR dcp.delta_saves_24h > 0 OR dcp.save_count > 0
    ),
    driver_pins_agg AS (
      SELECT
        rp.competitor_id,
        jsonb_agg(
          jsonb_build_object(
            'pin_id', rp.pin_id,
            'title', rp.title,
            'image_url', rp.image_url,
            'board_name', rp.board_name,
            'link_domain', rp.link_domain,
            'destination_url', rp.destination_url,
            'save_count', rp.save_count,
            'repin_count', rp.repin_count,
            'delta_saves_24h', rp.delta_saves_24h,
            'daily_save_velocity', rp.daily_save_velocity,
            'created_at_pinterest', rp.created_at_pinterest
          )
          ORDER BY rp.rn ASC
        ) AS driver_pins
      FROM ranked_pins rp
      WHERE rp.rn <= 3
      GROUP BY rp.competitor_id
    )
    SELECT
      tc.id,
      tc.username,
      tc.display_name,
      tc.avatar_url,
      tc.bio,
      tc.website_url,
      tc.monthly_reach,
      tc.profile_views,
      tc.total_pins,
      tc.total_boards,
      tc.follower_count,
      tc.delta_reach_24h,
      tc.delta_views_24h,
      tc.reach_delta_7d,
      tc.views_delta_7d,
      tc.delta_pins_24h,
      tc.last_synced_at,
      tc.effective_delta_reach_24h,
      tc.effective_delta_views_24h,
      tc.effective_reach_delta_7d,
      tc.effective_views_delta_7d,
      COALESCE(dpa.driver_pins, '[]'::jsonb) AS driver_pins
    FROM top_creators tc
    LEFT JOIN driver_pins_agg dpa ON dpa.competitor_id = tc.id
    ORDER BY 
      GREATEST(tc.effective_delta_reach_24h, tc.effective_delta_views_24h) DESC,
      tc.monthly_reach DESC;
  `;
}

/**
 * Query 5: PinArchive 24h Winners & Domain Arbitrage Leaders (universal_master_pins SSOT)
 */
export async function queryWinnersAndDomains(sql) {
  const [paWinners, domainRollups] = await Promise.all([
    sql`
      SELECT
        ump.pin_id,
        COALESCE(NULLIF(ump.creator_username, ''), '') AS account_username,
        COALESCE(NULLIF(ump.title, ''), '') AS title,
        LEFT(COALESCE(NULLIF(ump.description, ''), ''), 120) AS description,
        COALESCE(NULLIF(ump.destination_url, ''), '') AS link,
        COALESCE(NULLIF(ump.domain, ''), '') AS domain,
        COALESCE(NULLIF(ump.board_name, ''), '') AS board_name,
        COALESCE(NULLIF(ump.image_url, ''), '') AS image_url,
        CASE WHEN ump.dominant_color NOT IN ('', '#888888', '#1e1e24', '#000000', '#18181b') THEN ump.dominant_color ELSE NULL END AS dominant_color,
        ump.save_count AS saves,
        ump.repin_count AS repins,
        COALESCE(ump.comment_count, 0) AS comments,
        COALESCE(ump.daily_save_velocity, 0) AS velocity,
        COALESCE(NULLIF(ump.visual_annotations, '[]'::jsonb), '[]'::jsonb) AS annotations,
        ump.created_at_pinterest,
        ump.first_discovered_at AS first_seen_at,
        ump.updated_at AS last_updated_at
      FROM universal_master_pins ump
      WHERE (
        ump.daily_save_velocity > 0
        OR (COALESCE(ump.save_count, 0) >= 100 AND COALESCE(ump.last_scraped_at, ump.updated_at, NOW()) >= NOW() - INTERVAL '48 hours')
      )
      ORDER BY ump.daily_save_velocity DESC NULLS LAST, ump.save_count DESC NULLS LAST
      LIMIT 100;
    `,
    sql`
      SELECT
        dir.domain,
        COALESCE(dir.total_pins, 0) AS total_pins,
        COALESCE(dir.unique_urls, 1) AS unique_urls,
        COALESCE(dir.active_serp_pins, 0) AS active_serp_pins,
        COALESCE(dir.top3_pins, 0) AS top3_pins,
        COALESCE(dir.top10_pins, 0) AS top10_pins,
        COALESCE(dir.displaced_pins, 0) AS displaced_pins,
        dir.best_rank,
        dir.avg_rank,
        COALESCE(dir.visibility_score, 0) AS visibility_score,
        COALESCE(dir.total_saves, 0) AS total_saves,
        COALESCE(dir.avg_saves, 0) AS avg_saves,
        COALESCE(dir.total_repins, 0) AS total_repins,
        COALESCE(dir.avg_velocity, 0) AS avg_velocity,
        COALESCE(dir.pins_per_url, 1.0) AS pins_per_url,
        COALESCE(dir.accounts_count, 1) AS accounts_count,
        COALESCE(dir.sample_accounts, '[]'::jsonb) AS sample_accounts,
        COALESCE(dir.ad_network, 'unchecked') AS ad_network,
        COALESCE(dir.age_days, 0) AS age_days,
        dir.age_years,
        COALESCE(dir.arbitrage_score, 0) AS arbitrage_score
      FROM domain_intelligence_rollup dir
      WHERE (dir.avg_velocity > 0 OR dir.arbitrage_score > 0)
      ORDER BY dir.arbitrage_score DESC, dir.avg_velocity DESC
      LIMIT 30;
    `
  ]);
  return { paWinners, domainRollups };
}

/**
 * Query 7: Executive 24h Pulse KPI Telemetry from mv_pulse_24h_summary with fallback.
 * Queries mv_pulse_24h_summary for sub-millisecond execution when folderIdNum is null,
 * falling back cleanly to universal_master_pins if the materialized view is empty or unpopulated.
 * When folderIdNum is specified, computes folder-specific KPIs joined against keyword_folder_items.
 */
export async function queryKPIs(sql, folderIdNum = null) {
  if (!sql) return null;

  // 1. When folderIdNum !== null, bypass global matview and compute folder-specific 24h KPIs
  if (folderIdNum !== null && folderIdNum !== undefined) {
    try {
      const folderRows = await sql`
        SELECT
          COUNT(DISTINCT ump.pin_id)::bigint AS active_pins_24h,
          COUNT(DISTINCT NULLIF(BTRIM(ump.clean_domain), '')) FILTER (
            WHERE LOWER(BTRIM(COALESCE(ump.clean_domain, ''))) NOT IN ('uploaded by user', 'uploaded-by-user', 'organic', 'pinterest.com', 'www.pinterest.com')
          )::bigint AS active_domains_24h,
          COUNT(DISTINCT NULLIF(BTRIM(ump.creator_username), ''))::bigint AS active_creators_24h,
          COALESCE(ROUND(AVG(ump.daily_save_velocity)::numeric, 2), 0)::numeric(12,2) AS avg_velocity_24h,
          COALESCE(MAX(ump.daily_save_velocity), 0)::numeric(12,2) AS max_velocity_24h,
          COALESCE(SUM(GREATEST(0, COALESCE(ump.delta_saves_24h, ROUND(ump.daily_save_velocity)::bigint, 0))), 0)::bigint AS total_delta_saves_24h
        FROM keyword_folder_items kfi
        JOIN keyword_serp_positions ksp ON ksp.keyword_id = kfi.keyword_id
        JOIN universal_master_pins ump ON ump.pin_id = ksp.pin_id
        WHERE kfi.folder_id = ${folderIdNum}::int
          AND ump.is_hydrated = TRUE
          AND (ump.last_scraped_at >= NOW() - INTERVAL '24 hours' OR ump.updated_at >= NOW() - INTERVAL '24 hours');
      `;
      if (folderRows && folderRows.length > 0) {
        const r = folderRows[0];
        return {
          active_pins_24h: Number(r.active_pins_24h || 0),
          active_domains_24h: Number(r.active_domains_24h || 0),
          active_creators_24h: Number(r.active_creators_24h || 0),
          avg_velocity_24h: Number(r.avg_velocity_24h || 0),
          max_velocity_24h: Number(r.max_velocity_24h || 0),
          total_delta_saves_24h: Number(r.total_delta_saves_24h || 0),
          refreshed_at: null,
          from_matview: false
        };
      }
    } catch (_err) {
      return null;
    }
    return null;
  }

  // 2. When folderIdNum === null, use mv_pulse_24h_summary directly without falling back to a full table scan
  // when active_pins_24h === 0 unless the matview is unpopulated.
  let matviewPopulated = false;
  try {
    const rows = await sql`
      SELECT
        summary_id,
        active_pins_24h,
        active_domains_24h,
        active_creators_24h,
        avg_velocity_24h,
        max_velocity_24h,
        total_delta_saves_24h,
        refreshed_at
      FROM mv_pulse_24h_summary
      WHERE summary_id = 1
      LIMIT 1;
    `;
    if (rows && rows.length > 0) {
      matviewPopulated = true;
      return {
        active_pins_24h: Number(rows[0].active_pins_24h || 0),
        active_domains_24h: Number(rows[0].active_domains_24h || 0),
        active_creators_24h: Number(rows[0].active_creators_24h || 0),
        avg_velocity_24h: Number(rows[0].avg_velocity_24h || 0),
        max_velocity_24h: Number(rows[0].max_velocity_24h || 0),
        total_delta_saves_24h: Number(rows[0].total_delta_saves_24h || 0),
        refreshed_at: rows[0].refreshed_at,
        from_matview: true
      };
    }
  } catch (_err) {
    // Matview unpopulated or not yet created — proceed to fallback
  }

  // 3. Fallback: Aggregate directly from universal_master_pins base table ONLY if matview is unpopulated
  if (!matviewPopulated) {
    try {
      const fallbackRows = await sql`
        SELECT
          COUNT(DISTINCT ump.pin_id)::bigint AS active_pins_24h,
          COUNT(DISTINCT NULLIF(BTRIM(ump.clean_domain), '')) FILTER (
            WHERE LOWER(BTRIM(COALESCE(ump.clean_domain, ''))) NOT IN ('uploaded by user', 'uploaded-by-user', 'organic', 'pinterest.com', 'www.pinterest.com')
          )::bigint AS active_domains_24h,
          COUNT(DISTINCT NULLIF(BTRIM(ump.creator_username), ''))::bigint AS active_creators_24h,
          COALESCE(ROUND(AVG(ump.daily_save_velocity)::numeric, 2), 0)::numeric(12,2) AS avg_velocity_24h,
          COALESCE(MAX(ump.daily_save_velocity), 0)::numeric(12,2) AS max_velocity_24h,
          COALESCE(SUM(GREATEST(0, COALESCE(ump.delta_saves_24h, ROUND(ump.daily_save_velocity)::bigint, 0))), 0)::bigint AS total_delta_saves_24h
        FROM universal_master_pins ump
        WHERE ump.is_hydrated = TRUE
          AND (ump.last_scraped_at >= NOW() - INTERVAL '24 hours' OR ump.updated_at >= NOW() - INTERVAL '24 hours');
      `;
      if (fallbackRows && fallbackRows.length > 0) {
        const r = fallbackRows[0];
        return {
          active_pins_24h: Number(r.active_pins_24h || 0),
          active_domains_24h: Number(r.active_domains_24h || 0),
          active_creators_24h: Number(r.active_creators_24h || 0),
          avg_velocity_24h: Number(r.avg_velocity_24h || 0),
          max_velocity_24h: Number(r.max_velocity_24h || 0),
          total_delta_saves_24h: Number(r.total_delta_saves_24h || 0),
          refreshed_at: null,
          from_matview: false
        };
      }
    } catch (_err) {
      // Both matview and base table query unavailable — return null for in-memory synthesis fallback
    }
  }

  return null;
}
