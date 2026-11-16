/**
 * src/modules/domains/rollup-leaderboard-service.mjs
 *
 * Domain Intelligence Leaderboard & Rollup Materialization Service:
 * - listDomainsIntelligence (on-the-fly CTE aggregation for scoped & fallback queries)
 * - refreshDomainIntelligenceRollup (full materialization into domain_intelligence_rollup)
 * - syncSingleDomainRollup (O(1) micro-sync on dossier enrichment)
 * - listDomainsIntelligenceFast (fast rollup-backed leaderboard with Day-0 fallback)
 */

import {
  IGNORED_INTERNAL_DOMAINS,
  ECOMMERCE_AND_SOCIAL_DOMAINS
} from './domain-constants.mjs';
import { escapeSqlLike } from './whois-age-service.mjs';

/**
 * Top-Level Executive KPIs + Paginated Domain Leaderboard
 */
export async function listDomainsIntelligence(sql, {
  search = '',
  folderId = null,
  keywordId = null,
  pillar = 'all',           // 'all' | 'serp' | 'archive' | 'competitors'
  preset = 'all',           // 'all' | 'baby_giants' | 'easy_arbitrage' | 'bleeding_giants' | 'high_multipliers' | 'multi_account'
  adNetwork = 'all',        // 'all' | 'raptive' | 'mediavine' | 'journey' | 'ezoic' | 'adsense' | 'affiliate_only' | 'switched' | 'unchecked'
  ageFilter = 'all',        // 'all' | 'le_0_5' | 'le_1' | 'le_2' | 'le_3' | 'le_5' | 'gt_5' | 'verified' | 'unchecked'
  rankFilter = 'all',       // 'all' | 'top3' | 'top5' | 'top10' | 'top20' | 'top50' | 'displaced' | 'bleeding'
  savesFilter = 'all',      // 'all' | 'ge_500' | 'ge_1k' | 'ge_5k' | 'ge_10k' | 'ge_50k' | 'ge_100k' | 'ge_500k' | 'vel_5' | 'vel_20'
  sizeFilter = 'all',       // 'all' | 'pins_le_25' | 'pins_le_100' | 'pins_ge_100' | 'pins_ge_500' | 'mult_ge_2' | 'mult_ge_3' | 'mult_ge_5' | 'multi_acct' | 'pbn_3'
  logicMode = 'and',        // 'and' | 'or'
  excludeMarketplaces = true,
  minPins = 1,
  sortBy = 'visibility',    // 'visibility' | 'pins_count' | 'avg_rank' | 'saves' | 'velocity' | 'age_asc' | 'age_desc' | 'arbitrage_score' | 'multiplier'
  page = 1,
  limit = 50
} = {}) {
  const fId = folderId && !isNaN(Number(folderId)) ? Number(folderId) : null;
  const kId = keywordId && !isNaN(Number(keywordId)) ? Number(keywordId) : null;
  const minP = Math.max(1, parseInt(minPins, 10) || 1);
  const pNum = Math.max(1, parseInt(page, 10) || 1);
  const lim = Math.max(1, Math.min(parseInt(limit, 10) || 50, 2000));
  const off = (pNum - 1) * lim;
  const searchPattern = search ? `%${escapeSqlLike(search)}%` : null;
  const includeArchiveAndComp = (fId === null && kId === null);
  const referenceTime = new Date(Math.floor(Date.now() / 3600000) * 3600000).toISOString();

  const rows = await sql`
    WITH raw_occurrences AS (
      ${includeArchiveAndComp
        ? sql`
      SELECT
        CASE 
          WHEN LOWER(TRIM(COALESCE(ump.clean_domain, ''))) IN ('uploaded by user', 'uploaded-by-user', 'organic') THEN 'Uploaded by user'
          ELSE LOWER(TRIM(COALESCE(ump.clean_domain, '')))
        END AS clean_domain,
        ump.pin_id,
        ksp.keyword_id,
        CASE WHEN ksp.is_displaced = FALSE THEN ksp.rank_position ELSE NULL END AS active_rank,
        COALESCE(ksp.is_displaced, FALSE) AS is_displaced,
        ump.save_count::bigint AS saves,
        ump.repin_count::bigint AS repins,
        ump.daily_save_velocity::numeric AS velocity,
        LOWER(TRIM(REPLACE(COALESCE(ump.creator_username, ''), '@', ''))) AS username,
        COALESCE(NULLIF(REGEXP_REPLACE(LOWER(REGEXP_REPLACE(REGEXP_REPLACE(TRIM(COALESCE(ump.destination_url, '')), '^(https?://)?(www\\.)?[^/]+', ''), '[?#].*$', '')), '/+$', ''), ''), '/') AS url_slug,
        (ksp.pin_id IS NOT NULL) AS is_serp_ranked
      FROM universal_master_pins ump
      LEFT JOIN keyword_serp_positions ksp ON ksp.pin_id = ump.pin_id
        AND (${fId}::int IS NULL OR ksp.keyword_id IN (SELECT keyword_id FROM keyword_folder_items WHERE folder_id = ${fId}))
        AND (${kId}::int IS NULL OR ksp.keyword_id = ${kId})
      WHERE ump.clean_domain IS NOT NULL AND ump.clean_domain <> ''
        AND (${pillar} IN ('all', 'competitors', 'archive', 'serp', 'displaced'))
      `
        : sql`
      SELECT
        CASE 
          WHEN LOWER(TRIM(COALESCE(ump.clean_domain, ''))) IN ('uploaded by user', 'uploaded-by-user', 'organic') THEN 'Uploaded by user'
          ELSE LOWER(TRIM(COALESCE(ump.clean_domain, '')))
        END AS clean_domain,
        ksp.pin_id,
        ksp.keyword_id,
        CASE WHEN ksp.is_displaced = FALSE THEN ksp.rank_position ELSE NULL END AS active_rank,
        ksp.is_displaced,
        ump.save_count::bigint AS saves,
        ump.repin_count::bigint AS repins,
        ump.daily_save_velocity::numeric AS velocity,
        LOWER(TRIM(REPLACE(COALESCE(ump.creator_username, ''), '@', ''))) AS username,
        COALESCE(NULLIF(REGEXP_REPLACE(LOWER(REGEXP_REPLACE(REGEXP_REPLACE(TRIM(COALESCE(ump.destination_url, '')), '^(https?://)?(www\\.)?[^/]+', ''), '[?#].*$', '')), '/+$', ''), ''), '/') AS url_slug,
        TRUE AS is_serp_ranked
      FROM keyword_serp_positions ksp
      JOIN universal_master_pins ump ON ump.pin_id = ksp.pin_id
      WHERE (${pillar} IN ('all', 'serp', 'competitors', 'displaced'))
        AND ump.clean_domain IS NOT NULL AND ump.clean_domain <> ''
        AND (${fId}::int IS NULL OR ksp.keyword_id IN (SELECT keyword_id FROM keyword_folder_items WHERE folder_id = ${fId}))
        AND (${kId}::int IS NULL OR ksp.keyword_id = ${kId})
      `}

      UNION ALL

      -- Base Pillar 0: Preserved Domain Registry Metadata (Guarantees all discovered domains remain visible with WHOIS & ads.txt)
      SELECT
        drm.domain AS clean_domain,
        'reg_' || drm.domain AS pin_id,
        NULL::int AS keyword_id,
        NULL::int AS active_rank,
        TRUE AS is_displaced,
        0::bigint AS saves,
        0::bigint AS repins,
        0::numeric AS velocity,
        '' AS username,
        '/' AS url_slug,
        FALSE AS is_serp_ranked
      FROM domain_registry_metadata drm
      WHERE ${includeArchiveAndComp} = TRUE
        AND (${pillar} IN ('all', 'serp'))
        AND drm.domain IS NOT NULL AND drm.domain <> ''
    ),
    deduped_pins AS (
      SELECT
        clean_domain,
        pin_id,
        MIN(active_rank) AS best_serp_rank,
        COUNT(DISTINCT keyword_id) FILTER (WHERE active_rank IS NOT NULL)::int AS ranked_keywords_for_pin,
        BOOL_OR(is_displaced) AND MIN(active_rank) IS NULL AS is_displaced_only,
        BOOL_OR(is_serp_ranked) AS is_serp_ranked,
        MAX(saves)::bigint AS saves,
        MAX(repins)::bigint AS repins,
        MAX(velocity)::numeric AS velocity,
        MAX(NULLIF(username, '')) AS username,
        COALESCE(MAX(NULLIF(url_slug, '/')), '/') AS url_slug
      FROM raw_occurrences
      WHERE clean_domain <> ''
        AND clean_domain <> ALL(${IGNORED_INTERNAL_DOMAINS}::text[])
        AND (${excludeMarketplaces} = FALSE OR ${fId}::int IS NOT NULL OR clean_domain <> ALL(${ECOMMERCE_AND_SOCIAL_DOMAINS}::text[]))
        AND clean_domain LIKE '%.%'
        AND (${searchPattern}::text IS NULL OR clean_domain LIKE ${searchPattern})
        AND (${pillar} <> 'competitors' OR clean_domain IN (
          SELECT ump.clean_domain
          FROM competitor_board_pins cbp
          JOIN universal_master_pins ump ON ump.pin_id = cbp.pin_id
          WHERE ump.clean_domain IS NOT NULL AND ump.clean_domain <> ''
        ))
      GROUP BY clean_domain, pin_id
    ),
    domain_agg AS (
      SELECT
        dp.clean_domain AS domain,
        -- [INVARIANT: SERP-ONLY-RANKED-PINS-COUNTING]
        -- Only count pins and URLs that actually ranked in SERP or Displaced SERP Vault (is_serp_ranked = TRUE),
        -- falling back to catalog pins only for catalog-only domains that have 0 SERP/Vault occurrences.
        COALESCE(
          NULLIF(COUNT(DISTINCT dp.pin_id) FILTER (WHERE dp.is_serp_ranked = TRUE AND NOT (dp.pin_id LIKE 'reg_%')), 0),
          NULLIF(COUNT(DISTINCT dp.pin_id) FILTER (WHERE NOT (dp.pin_id LIKE 'reg_%')), 0),
          1
        )::int AS total_pins,
        COUNT(DISTINCT dp.pin_id) FILTER (WHERE dp.is_serp_ranked = FALSE AND NOT (dp.pin_id LIKE 'reg_%'))::int AS catalog_only_pins,
        CASE
          WHEN dp.clean_domain = 'Uploaded by user' THEN 0
          ELSE GREATEST(
            1,
            COALESCE(
              NULLIF(COUNT(DISTINCT dp.url_slug) FILTER (WHERE dp.is_serp_ranked = TRUE AND NOT (dp.pin_id LIKE 'reg_%') AND dp.url_slug IS NOT NULL AND dp.url_slug <> '/'), 0),
              COUNT(DISTINCT dp.url_slug) FILTER (WHERE NOT (dp.pin_id LIKE 'reg_%') AND dp.url_slug IS NOT NULL AND dp.url_slug <> '/')
            )
          )::int
        END AS unique_urls,
        ROUND(
          COALESCE(
            NULLIF(COUNT(DISTINCT dp.pin_id) FILTER (WHERE dp.is_serp_ranked = TRUE AND NOT (dp.pin_id LIKE 'reg_%')), 0),
            NULLIF(COUNT(DISTINCT dp.pin_id) FILTER (WHERE NOT (dp.pin_id LIKE 'reg_%')), 0),
            1
          )::numeric /
          GREATEST(
            1,
            COALESCE(
              NULLIF(COUNT(DISTINCT dp.url_slug) FILTER (WHERE dp.is_serp_ranked = TRUE AND NOT (dp.pin_id LIKE 'reg_%') AND dp.url_slug IS NOT NULL AND dp.url_slug <> '/'), 0),
              COUNT(DISTINCT dp.url_slug) FILTER (WHERE NOT (dp.pin_id LIKE 'reg_%') AND dp.url_slug IS NOT NULL AND dp.url_slug <> '/')
            )
          ),
          2
        ) AS pins_per_url,
        COUNT(DISTINCT dp.pin_id) FILTER (WHERE dp.best_serp_rank IS NOT NULL AND NOT (dp.pin_id LIKE 'reg_%'))::int AS active_serp_pins,
        COUNT(DISTINCT dp.pin_id) FILTER (WHERE dp.best_serp_rank <= 3 AND NOT (dp.pin_id LIKE 'reg_%'))::int AS top3_pins,
        COUNT(DISTINCT dp.pin_id) FILTER (WHERE dp.best_serp_rank <= 10 AND NOT (dp.pin_id LIKE 'reg_%'))::int AS top10_pins,
        COUNT(DISTINCT dp.pin_id) FILTER (WHERE dp.best_serp_rank > 10 AND dp.best_serp_rank <= 50 AND NOT (dp.pin_id LIKE 'reg_%'))::int AS rank_11_50_pins,
        COUNT(DISTINCT dp.pin_id) FILTER (WHERE dp.is_displaced_only = TRUE AND dp.is_serp_ranked = TRUE AND NOT (dp.pin_id LIKE 'reg_%'))::int AS displaced_pins,
        MIN(dp.best_serp_rank)::int AS best_rank,
        ROUND(AVG(dp.best_serp_rank), 1) AS avg_rank,
        ROUND(
          (
            (COUNT(DISTINCT dp.pin_id) FILTER (WHERE dp.best_serp_rank <= 3) * 100) +
            (COUNT(DISTINCT dp.pin_id) FILTER (WHERE dp.best_serp_rank > 3 AND dp.best_serp_rank <= 10) * 45) +
            (COUNT(DISTINCT dp.pin_id) FILTER (WHERE dp.best_serp_rank > 10 AND dp.best_serp_rank <= 50) * 12)
          )::numeric,
          1
        ) AS visibility_score,
        COALESCE(
          NULLIF(SUM(dp.saves) FILTER (WHERE dp.is_serp_ranked = TRUE AND NOT (dp.pin_id LIKE 'reg_%')), 0),
          SUM(dp.saves) FILTER (WHERE NOT (dp.pin_id LIKE 'reg_%')),
          0
        )::bigint AS total_saves,
        ROUND(COALESCE(
          NULLIF(AVG(dp.saves) FILTER (WHERE dp.is_serp_ranked = TRUE AND NOT (dp.pin_id LIKE 'reg_%')), 0),
          AVG(dp.saves) FILTER (WHERE NOT (dp.pin_id LIKE 'reg_%')),
          0
        ))::bigint AS avg_saves,
        COALESCE(
          NULLIF(SUM(dp.repins) FILTER (WHERE dp.is_serp_ranked = TRUE AND NOT (dp.pin_id LIKE 'reg_%')), 0),
          SUM(dp.repins) FILTER (WHERE NOT (dp.pin_id LIKE 'reg_%')),
          0
        )::bigint AS total_repins,
        ROUND(COALESCE(
          NULLIF(SUM(dp.velocity) FILTER (WHERE dp.is_serp_ranked = TRUE AND NOT (dp.pin_id LIKE 'reg_%') AND dp.velocity > 0), 0),
          SUM(dp.velocity) FILTER (WHERE NOT (dp.pin_id LIKE 'reg_%') AND dp.velocity > 0),
          0
        ), 1) AS avg_velocity,
        COALESCE(
          NULLIF(COUNT(DISTINCT dp.username) FILTER (WHERE dp.is_serp_ranked = TRUE AND dp.username IS NOT NULL AND dp.username <> ''), 0),
          COUNT(DISTINCT dp.username) FILTER (WHERE dp.username IS NOT NULL AND dp.username <> '')
        )::int AS accounts_count,
        (
          ARRAY_REMOVE(
            ARRAY[
              MIN(dp.username) FILTER (
                WHERE dp.username IS NOT NULL AND dp.username <> ''
                  AND dp.username NOT LIKE 'preview_%'
                  AND (
                    REPLACE(dp.username, '_', '') = SPLIT_PART(REPLACE(dp.clean_domain, '-', ''), '.', 1)
                    OR SPLIT_PART(REPLACE(dp.clean_domain, '-', ''), '.', 1) LIKE '%' || REPLACE(dp.username, '_', '') || '%'
                    OR REPLACE(dp.username, '_', '') LIKE '%' || SPLIT_PART(REPLACE(dp.clean_domain, '-', ''), '.', 1) || '%'
                  )
              )
            ],
            NULL
          ) || COALESCE(
            (ARRAY_AGG(DISTINCT dp.username) FILTER (
              WHERE dp.is_serp_ranked = TRUE AND dp.username IS NOT NULL AND dp.username <> ''
                AND dp.username NOT LIKE 'preview_%'
                AND NOT (
                  REPLACE(dp.username, '_', '') = SPLIT_PART(REPLACE(dp.clean_domain, '-', ''), '.', 1)
                  OR SPLIT_PART(REPLACE(dp.clean_domain, '-', ''), '.', 1) LIKE '%' || REPLACE(dp.username, '_', '') || '%'
                  OR REPLACE(dp.username, '_', '') LIKE '%' || SPLIT_PART(REPLACE(dp.clean_domain, '-', ''), '.', 1) || '%'
                )
            ))[1:5],
            (ARRAY_AGG(DISTINCT dp.username) FILTER (
              WHERE dp.username IS NOT NULL AND dp.username <> ''
                AND dp.username NOT LIKE 'preview_%'
                AND NOT (
                  REPLACE(dp.username, '_', '') = SPLIT_PART(REPLACE(dp.clean_domain, '-', ''), '.', 1)
                  OR SPLIT_PART(REPLACE(dp.clean_domain, '-', ''), '.', 1) LIKE '%' || REPLACE(dp.username, '_', '') || '%'
                  OR REPLACE(dp.username, '_', '') LIKE '%' || SPLIT_PART(REPLACE(dp.clean_domain, '-', ''), '.', 1) || '%'
                )
            ))[1:5],
            ARRAY[]::text[]
          )
        )[1:5] AS sample_accounts
      FROM deduped_pins dp
      GROUP BY dp.clean_domain
      HAVING COUNT(DISTINCT dp.pin_id) >= ${minP}
    ),
    enriched AS (
      SELECT
        da.*,
        drm.registered_at AS domain_created_at,
        drm.expires_at AS domain_expires_at,
        drm.lookup_status AS age_status,
        CASE
          WHEN drm.registered_at IS NOT NULL THEN GREATEST(1, FLOOR(EXTRACT(EPOCH FROM (${referenceTime}::timestamptz - drm.registered_at)) / 86400))::int
          ELSE drm.initial_age_days
        END AS age_days,
        CASE
          WHEN drm.registered_at IS NOT NULL THEN ROUND((EXTRACT(EPOCH FROM (${referenceTime}::timestamptz - drm.registered_at)) / 31557600)::numeric, 2)
          ELSE drm.initial_age_years
        END AS age_years,
        COALESCE(dmm.current_ad_network, 'unchecked') AS ad_network,
        dmm.ad_manager_domain,
        dmm.primary_pub_id,
        dmm.previous_ad_network,
        dmm.switched_at AS ad_switched_at,
        dmm.network_history AS ad_network_history,
        COALESCE(dmm.ads_txt_status, 'pending') AS ads_txt_status,
        ROUND(
          (da.displaced_pins::numeric / GREATEST(1, da.active_serp_pins + da.displaced_pins)) * 100,
          1
        ) AS decay_rate_pct,
        ROUND(
          (
            (GREATEST(0.5, da.visibility_score) * LN(GREATEST(10, da.total_saves)::numeric)) /
            GREATEST(
              0.25,
              COALESCE(
                CASE WHEN drm.registered_at IS NOT NULL THEN (EXTRACT(EPOCH FROM (${referenceTime}::timestamptz - drm.registered_at)) / 31557600)::numeric ELSE NULL END,
                drm.initial_age_years,
                2.5
              )
            )
          )::numeric,
          2
        ) AS arbitrage_score
      FROM domain_agg da
      LEFT JOIN domain_registry_metadata drm ON drm.domain = da.domain
      LEFT JOIN domain_monetization_metadata dmm ON dmm.domain = da.domain
      WHERE (
        ${preset} = 'all'
        OR (${preset} = 'baby_giants' AND drm.registered_at >= ${referenceTime}::timestamptz - INTERVAL '2 years' AND (da.top10_pins >= 1 OR da.total_saves >= 1000))
        OR (${preset} = 'easy_arbitrage' AND da.total_pins <= 25 AND (da.top10_pins >= 1 OR da.avg_velocity >= 5))
        OR (${preset} = 'bleeding_giants' AND da.displaced_pins >= 3 AND (da.displaced_pins::numeric / GREATEST(1, da.active_serp_pins + da.displaced_pins)) >= 0.30)
        OR (${preset} = 'high_multipliers' AND da.pins_per_url >= 3.0)
        OR (${preset} = 'multi_account' AND da.accounts_count >= 2)
        OR (${preset} = 'decaying_monopoly' AND da.top10_pins >= 1 AND da.total_saves >= 3000 AND (da.avg_velocity <= 3.0 OR (da.displaced_pins::numeric / GREATEST(1, da.active_serp_pins + da.displaced_pins)) >= 0.25))
      )
      AND (
        ${adNetwork} = 'all'
        OR (${adNetwork} = 'switched' AND dmm.switched_at IS NOT NULL)
        OR (${adNetwork} = 'unchecked' AND (dmm.current_ad_network IS NULL OR dmm.current_ad_network = 'unchecked'))
        OR dmm.current_ad_network = ${adNetwork}
      )
    ),
    modular_evaluated AS (
      SELECT
        e.*,
        CASE
          WHEN ${ageFilter} = 'le_0_5' THEN (e.age_years IS NOT NULL AND e.age_years <= 0.5)
          WHEN ${ageFilter} = 'le_1' THEN (e.age_years IS NOT NULL AND e.age_years <= 1.0)
          WHEN ${ageFilter} = 'le_2' THEN (e.age_years IS NOT NULL AND e.age_years <= 2.0)
          WHEN ${ageFilter} = 'le_3' THEN (e.age_years IS NOT NULL AND e.age_years <= 3.0)
          WHEN ${ageFilter} = 'le_5' THEN (e.age_years IS NOT NULL AND e.age_years <= 5.0)
          WHEN ${ageFilter} = 'gt_5' THEN (e.age_years IS NOT NULL AND e.age_years > 5.0)
          WHEN ${ageFilter} = 'verified' THEN (e.age_years IS NOT NULL)
          WHEN ${ageFilter} = 'unchecked' THEN (e.age_years IS NULL)
          ELSE TRUE
        END AS age_match,
        CASE
          WHEN ${rankFilter} = 'top3' THEN (e.top3_pins >= 1 OR (e.best_rank IS NOT NULL AND e.best_rank <= 3))
          WHEN ${rankFilter} = 'top5' THEN (e.best_rank IS NOT NULL AND e.best_rank <= 5)
          WHEN ${rankFilter} = 'top10' THEN (e.top10_pins >= 1 OR (e.best_rank IS NOT NULL AND e.best_rank <= 10))
          WHEN ${rankFilter} = 'top20' THEN (e.best_rank IS NOT NULL AND e.best_rank <= 20)
          WHEN ${rankFilter} = 'top50' THEN (e.active_serp_pins >= 1)
          WHEN ${rankFilter} = 'displaced' THEN (e.displaced_pins >= 1)
          WHEN ${rankFilter} = 'bleeding' THEN (e.displaced_pins >= 3 AND e.decay_rate_pct >= 30.0)
          ELSE TRUE
        END AS rank_match,
        CASE
          WHEN ${savesFilter} = 'ge_500' THEN (e.total_saves >= 500)
          WHEN ${savesFilter} = 'ge_1k' THEN (e.total_saves >= 1000)
          WHEN ${savesFilter} = 'ge_5k' THEN (e.total_saves >= 5000)
          WHEN ${savesFilter} = 'ge_10k' THEN (e.total_saves >= 10000)
          WHEN ${savesFilter} = 'ge_50k' THEN (e.total_saves >= 50000)
          WHEN ${savesFilter} = 'ge_100k' THEN (e.total_saves >= 100000)
          WHEN ${savesFilter} = 'ge_500k' THEN (e.total_saves >= 500000)
          WHEN ${savesFilter} = 'vel_5' THEN (e.avg_velocity >= 5.0)
          WHEN ${savesFilter} = 'vel_20' THEN (e.avg_velocity >= 20.0)
          ELSE TRUE
        END AS saves_match,
        CASE
          WHEN ${sizeFilter} = 'pins_le_25' THEN (e.total_pins <= 25)
          WHEN ${sizeFilter} = 'pins_le_100' THEN (e.total_pins <= 100)
          WHEN ${sizeFilter} = 'pins_ge_100' THEN (e.total_pins >= 100)
          WHEN ${sizeFilter} = 'pins_ge_500' THEN (e.total_pins >= 500)
          WHEN ${sizeFilter} = 'mult_ge_2' THEN (e.pins_per_url >= 2.0)
          WHEN ${sizeFilter} = 'mult_ge_3' THEN (e.pins_per_url >= 3.0)
          WHEN ${sizeFilter} = 'mult_ge_5' THEN (e.pins_per_url >= 5.0)
          WHEN ${sizeFilter} = 'multi_acct' THEN (e.accounts_count >= 2)
          WHEN ${sizeFilter} = 'pbn_3' THEN (e.accounts_count >= 3)
          ELSE TRUE
        END AS size_match
      FROM enriched e
    ),
    modular_filtered AS (
      SELECT
        *,
        ROW_NUMBER() OVER (ORDER BY visibility_score DESC, total_saves DESC) AS top5_rn
      FROM modular_evaluated
      WHERE (
        CASE
          WHEN ${logicMode} = 'or' AND (${ageFilter} <> 'all' OR ${rankFilter} <> 'all' OR ${savesFilter} <> 'all' OR ${sizeFilter} <> 'all') THEN (
            (${ageFilter} <> 'all' AND age_match)
            OR (${rankFilter} <> 'all' AND rank_match)
            OR (${savesFilter} <> 'all' AND saves_match)
            OR (${sizeFilter} <> 'all' AND size_match)
          )
          ELSE (age_match AND rank_match AND saves_match AND size_match)
        END
      )
    )
    SELECT
      *,
      COUNT(*) OVER()::int AS total_filtered_domains,
      SUM(top10_pins) OVER()::int AS global_top10_slots,
      SUM(CASE WHEN top5_rn <= 5 THEN top10_pins ELSE 0 END) OVER()::int AS top5_global_slots,
      COUNT(*) FILTER (WHERE age_years IS NOT NULL AND age_years <= 2.0 AND (top10_pins >= 1 OR total_saves >= 1000)) OVER()::int AS baby_giants_count,
      COUNT(*) FILTER (WHERE accounts_count >= 2) OVER()::int AS multi_account_domains_count,
      ROUND(AVG(pins_per_url) OVER(), 2) AS global_avg_multiplier
    FROM modular_filtered
    ORDER BY
      CASE WHEN ${sortBy} = 'visibility' THEN visibility_score END DESC NULLS LAST,
      CASE WHEN ${sortBy} = 'pins_count' THEN total_pins END DESC NULLS LAST,
      CASE WHEN ${sortBy} = 'avg_rank' THEN avg_rank END ASC NULLS LAST,
      CASE WHEN ${sortBy} = 'saves' THEN total_saves END DESC NULLS LAST,
      CASE WHEN ${sortBy} = 'velocity' THEN avg_velocity END DESC NULLS LAST,
      CASE WHEN ${sortBy} = 'age_asc' THEN age_days END ASC NULLS LAST,
      CASE WHEN ${sortBy} = 'age_desc' THEN age_days END DESC NULLS LAST,
      CASE WHEN ${sortBy} = 'arbitrage_score' THEN arbitrage_score END DESC NULLS LAST,
      CASE WHEN ${sortBy} = 'multiplier' THEN pins_per_url END DESC NULLS LAST,
      visibility_score DESC, total_saves DESC
    LIMIT ${lim} OFFSET ${off};
  `;

  const total = rows[0]?.total_filtered_domains || 0;
  const globalTop10 = Math.max(1, Number(rows[0]?.global_top10_slots || 1));
  const top5Share = rows[0]?.top5_global_slots !== undefined
    ? Number(rows[0].top5_global_slots)
    : rows.slice(0, 5).reduce((acc, r) => acc + Number(r.top10_pins || 0), 0);
  const top5MonopolyPct = Number(Math.min(100, Math.max(0, (top5Share / globalTop10) * 100)).toFixed(1));

  const missingAgeDomains = rows
    .filter(r => !r.age_status && r.domain)
    .map(r => r.domain)
    .slice(0, 8);

  return {
    overview: {
      total_domains: total,
      top5_monopoly_pct: top5MonopolyPct,
      baby_giants_count: rows[0]?.baby_giants_count || 0,
      multi_account_count: rows[0]?.multi_account_domains_count || 0,
      avg_pins_per_url: Number(rows[0]?.global_avg_multiplier || 1.0)
    },
    domains: rows.map(r => ({
      domain: r.domain,
      total_pins: Number(r.total_pins || 0),
      catalog_only_pins: Number(r.catalog_only_pins || 0),
      unique_urls: Number(r.unique_urls || 1),
      pins_per_url: Number(r.pins_per_url || 1),
      active_serp_pins: Number(r.active_serp_pins || 0),
      top3_pins: Number(r.top3_pins || 0),
      top10_pins: Number(r.top10_pins || 0),
      rank_11_50_pins: Number(r.rank_11_50_pins || 0),
      displaced_pins: Number(r.displaced_pins || 0),
      best_rank: r.best_rank != null ? Number(r.best_rank) : null,
      avg_rank: r.avg_rank != null ? Number(r.avg_rank) : null,
      visibility_score: Number(r.visibility_score || 0),
      total_saves: Number(r.total_saves || 0),
      avg_saves: Number(r.avg_saves || 0),
      total_repins: Number(r.total_repins || 0),
      avg_velocity: Number(r.avg_velocity || 0),
      accounts_count: Number(r.accounts_count || 0),
      sample_accounts: Array.isArray(r.sample_accounts) ? r.sample_accounts : [],
      domain_created_at: r.domain_created_at || null,
      domain_expires_at: r.domain_expires_at || null,
      age_days: r.age_days != null ? Number(r.age_days) : null,
      age_years: r.age_years != null ? Number(r.age_years) : null,
      age_status: r.age_status || 'unchecked',
      ad_network: r.ad_network || 'unchecked',
      ad_manager_domain: r.ad_manager_domain || null,
      primary_pub_id: r.primary_pub_id || null,
      previous_ad_network: r.previous_ad_network || null,
      ad_switched_at: r.ad_switched_at || null,
      ad_network_history: Array.isArray(r.ad_network_history) ? r.ad_network_history : [],
      ads_txt_status: r.ads_txt_status || 'pending',
      decay_rate_pct: Number(r.decay_rate_pct || 0),
      arbitrage_score: Number(r.arbitrage_score || 0)
    })),
    missing_age_domains: missingAgeDomains,
    missing_ad_domains: rows
      .filter(r => (!r.ad_network || r.ad_network === 'unchecked') && r.domain)
      .map(r => r.domain)
      .slice(0, 10),
    page: pNum,
    limit: lim,
    total,
    total_pages: Math.max(1, Math.ceil(total / lim))
  };
}

/**
 * Refreshes or populates the domain_intelligence_rollup cache table.
 */
export async function refreshDomainIntelligenceRollup(sql) {
  const referenceTime = new Date(Math.floor(Date.now() / 3600000) * 3600000).toISOString();
  try {
    const res = await sql`
      WITH raw_occurrences AS (
        SELECT
          CASE 
            WHEN LOWER(TRIM(COALESCE(ump.clean_domain, ''))) IN ('uploaded by user', 'uploaded-by-user', 'organic') THEN 'Uploaded by user'
            ELSE LOWER(TRIM(COALESCE(ump.clean_domain, '')))
          END AS clean_domain,
          ump.pin_id,
          ksp.keyword_id,
          CASE WHEN ksp.is_displaced = FALSE THEN ksp.rank_position ELSE NULL END AS active_rank,
          COALESCE(ksp.is_displaced, FALSE) AS is_displaced,
          ump.save_count::bigint AS saves,
          ump.repin_count::bigint AS repins,
          ump.daily_save_velocity::numeric AS velocity,
          LOWER(TRIM(REPLACE(COALESCE(ump.creator_username, ''), '@', ''))) AS username,
          COALESCE(NULLIF(REGEXP_REPLACE(LOWER(REGEXP_REPLACE(REGEXP_REPLACE(TRIM(COALESCE(ump.destination_url, '')), '^(https?://)?(www\\.)?[^/]+', ''), '[?#].*$', '')), '/+$', ''), ''), '/') AS url_slug,
          (ksp.pin_id IS NOT NULL) AS is_serp_ranked,
          COALESCE(NULLIF(TRIM(ump.image_signature), ''), ump.pin_id) AS creative_signature
        FROM universal_master_pins ump
        LEFT JOIN keyword_serp_positions ksp ON ksp.pin_id = ump.pin_id
        WHERE ump.clean_domain IS NOT NULL AND ump.clean_domain <> ''

        UNION ALL

        SELECT
          drm.domain AS clean_domain,
          'reg_' || drm.domain AS pin_id,
          NULL::int AS keyword_id,
          NULL::int AS active_rank,
          TRUE AS is_displaced,
          0::bigint AS saves,
          0::bigint AS repins,
          0::numeric AS velocity,
          '' AS username,
          '/' AS url_slug,
          FALSE AS is_serp_ranked,
          'reg_' || drm.domain AS creative_signature
        FROM domain_registry_metadata drm
        WHERE drm.domain IS NOT NULL AND drm.domain <> '' AND drm.domain LIKE '%.%'
      ),
      dedup_pins AS (
        SELECT
          clean_domain,
          pin_id,
          MIN(active_rank) AS active_rank,
          BOOL_OR(is_displaced) AND MIN(active_rank) IS NULL AS is_displaced,
          BOOL_OR(is_serp_ranked) AS is_serp_ranked,
          MAX(saves) AS saves,
          MAX(repins) AS repins,
          MAX(velocity) AS velocity,
          MAX(NULLIF(username, '')) AS sample_username,
          COALESCE(MAX(NULLIF(url_slug, '/')), '/') AS url_slug,
          COALESCE(MAX(creative_signature), pin_id) AS creative_signature
        FROM raw_occurrences
        WHERE clean_domain IS NOT NULL
          AND clean_domain <> ''
          AND clean_domain NOT IN ('pinterest.com', 'www.pinterest.com', 'pin.it', 'localhost')
        GROUP BY clean_domain, pin_id
      ),
      domain_agg AS (
        SELECT
          dp.clean_domain AS domain,
          -- [INVARIANT: SERP-ONLY-RANKED-PINS-COUNTING]
          -- Count SERP + Displaced Vault pins & URLs first, falling back to catalog only when 0 SERP/Vault pins exist
          COALESCE(
            NULLIF(COUNT(DISTINCT dp.pin_id) FILTER (WHERE dp.is_serp_ranked = TRUE AND NOT (dp.pin_id LIKE 'reg_%')), 0),
            COUNT(DISTINCT dp.pin_id) FILTER (WHERE NOT (dp.pin_id LIKE 'reg_%'))
          )::int AS total_pins,
          CASE
            WHEN dp.clean_domain = 'Uploaded by user' THEN 0
            ELSE GREATEST(
              1,
              COALESCE(
                NULLIF(COUNT(DISTINCT dp.url_slug) FILTER (WHERE dp.is_serp_ranked = TRUE AND NOT (dp.pin_id LIKE 'reg_%') AND dp.url_slug IS NOT NULL AND dp.url_slug <> '/'), 0),
                COUNT(DISTINCT dp.url_slug) FILTER (WHERE NOT (dp.pin_id LIKE 'reg_%') AND dp.url_slug IS NOT NULL AND dp.url_slug <> '/')
              )
            )::int
          END AS unique_urls,
          ROUND(
            COALESCE(
              NULLIF(COUNT(DISTINCT dp.creative_signature) FILTER (WHERE dp.is_serp_ranked = TRUE AND NOT (dp.pin_id LIKE 'reg_%')), 0),
              NULLIF(COUNT(DISTINCT dp.creative_signature) FILTER (WHERE NOT (dp.pin_id LIKE 'reg_%')), 0),
              1
            )::numeric / 
            GREATEST(
              1,
              COALESCE(
                NULLIF(COUNT(DISTINCT dp.url_slug) FILTER (WHERE dp.is_serp_ranked = TRUE AND NOT (dp.pin_id LIKE 'reg_%') AND dp.url_slug IS NOT NULL AND dp.url_slug <> '/'), 0),
                COUNT(DISTINCT dp.url_slug) FILTER (WHERE NOT (dp.pin_id LIKE 'reg_%') AND dp.url_slug IS NOT NULL AND dp.url_slug <> '/')
              )
            ), 
            2
          ) AS pins_per_url,
          COUNT(dp.pin_id) FILTER (WHERE dp.active_rank IS NOT NULL AND NOT (dp.pin_id LIKE 'reg_%'))::int AS active_serp_pins,
          COUNT(dp.pin_id) FILTER (WHERE dp.active_rank <= 3 AND NOT (dp.pin_id LIKE 'reg_%'))::int AS top3_pins,
          COUNT(dp.pin_id) FILTER (WHERE dp.active_rank <= 10 AND NOT (dp.pin_id LIKE 'reg_%'))::int AS top10_pins,
          COUNT(dp.pin_id) FILTER (WHERE dp.active_rank BETWEEN 11 AND 50 AND NOT (dp.pin_id LIKE 'reg_%'))::int AS rank_11_50_pins,
          COUNT(dp.pin_id) FILTER (WHERE dp.is_displaced = TRUE AND dp.is_serp_ranked = TRUE AND NOT (dp.pin_id LIKE 'reg_%'))::int AS displaced_pins,
          MIN(dp.active_rank) AS best_rank,
          ROUND(AVG(dp.active_rank), 1) AS avg_rank,
          ROUND(
            (
              (COUNT(dp.pin_id) FILTER (WHERE dp.active_rank <= 3) * 100) +
              (COUNT(dp.pin_id) FILTER (WHERE dp.active_rank BETWEEN 4 AND 10) * 45) +
              (COUNT(dp.pin_id) FILTER (WHERE dp.active_rank BETWEEN 11 AND 50) * 12)
            )::numeric,
            1
          ) AS visibility_score,
          COALESCE(
            NULLIF(SUM(dp.saves) FILTER (WHERE dp.is_serp_ranked = TRUE AND NOT (dp.pin_id LIKE 'reg_%')), 0),
            SUM(dp.saves) FILTER (WHERE NOT (dp.pin_id LIKE 'reg_%')),
            0
          )::bigint AS total_saves,
          ROUND(COALESCE(
            NULLIF(AVG(dp.saves) FILTER (WHERE dp.is_serp_ranked = TRUE AND NOT (dp.pin_id LIKE 'reg_%')), 0),
            AVG(dp.saves) FILTER (WHERE NOT (dp.pin_id LIKE 'reg_%')),
            0
          ), 1) AS avg_saves,
          COALESCE(
            NULLIF(SUM(dp.repins) FILTER (WHERE dp.is_serp_ranked = TRUE AND NOT (dp.pin_id LIKE 'reg_%')), 0),
            SUM(dp.repins) FILTER (WHERE NOT (dp.pin_id LIKE 'reg_%')),
            0
          )::bigint AS total_repins,
          -- [INVARIANT: DUAL-DOMAIN-VELOCITY] Non-diluted active pin aggregate daily velocity
          ROUND(COALESCE(
            NULLIF(SUM(dp.velocity) FILTER (WHERE dp.is_serp_ranked = TRUE AND NOT (dp.pin_id LIKE 'reg_%') AND dp.velocity > 0), 0),
            SUM(dp.velocity) FILTER (WHERE NOT (dp.pin_id LIKE 'reg_%') AND dp.velocity > 0),
            0
          ), 1) AS avg_velocity,
          COALESCE(
            NULLIF(COUNT(DISTINCT dp.sample_username) FILTER (WHERE dp.is_serp_ranked = TRUE AND dp.sample_username IS NOT NULL AND dp.sample_username <> ''), 0),
            COUNT(DISTINCT dp.sample_username) FILTER (WHERE dp.sample_username IS NOT NULL AND dp.sample_username <> '')
          )::int AS accounts_count,
          (
            ARRAY_REMOVE(
              ARRAY[
                MIN(dp.sample_username) FILTER (
                  WHERE dp.sample_username IS NOT NULL AND dp.sample_username <> ''
                    AND dp.sample_username NOT LIKE 'preview_%'
                    AND (
                      REPLACE(dp.sample_username, '_', '') = SPLIT_PART(REPLACE(dp.clean_domain, '-', ''), '.', 1)
                      OR SPLIT_PART(REPLACE(dp.clean_domain, '-', ''), '.', 1) LIKE '%' || REPLACE(dp.sample_username, '_', '') || '%'
                      OR REPLACE(dp.sample_username, '_', '') LIKE '%' || SPLIT_PART(REPLACE(dp.clean_domain, '-', ''), '.', 1) || '%'
                    )
                )
              ],
              NULL
            ) || COALESCE(
              (ARRAY_AGG(DISTINCT dp.sample_username) FILTER (
                WHERE dp.is_serp_ranked = TRUE AND dp.sample_username IS NOT NULL AND dp.sample_username <> ''
                  AND dp.sample_username NOT LIKE 'preview_%'
                  AND NOT (
                    REPLACE(dp.sample_username, '_', '') = SPLIT_PART(REPLACE(dp.clean_domain, '-', ''), '.', 1)
                    OR SPLIT_PART(REPLACE(dp.clean_domain, '-', ''), '.', 1) LIKE '%' || REPLACE(dp.sample_username, '_', '') || '%'
                    OR REPLACE(dp.sample_username, '_', '') LIKE '%' || SPLIT_PART(REPLACE(dp.clean_domain, '-', ''), '.', 1) || '%'
                  )
              ))[1:5],
              (ARRAY_AGG(DISTINCT dp.sample_username) FILTER (
                WHERE dp.sample_username IS NOT NULL AND dp.sample_username <> ''
                  AND dp.sample_username NOT LIKE 'preview_%'
                  AND NOT (
                    REPLACE(dp.sample_username, '_', '') = SPLIT_PART(REPLACE(dp.clean_domain, '-', ''), '.', 1)
                    OR SPLIT_PART(REPLACE(dp.clean_domain, '-', ''), '.', 1) LIKE '%' || REPLACE(dp.sample_username, '_', '') || '%'
                    OR REPLACE(dp.sample_username, '_', '') LIKE '%' || SPLIT_PART(REPLACE(dp.clean_domain, '-', ''), '.', 1) || '%'
                  )
              ))[1:5],
              ARRAY[]::text[]
            )
          )[1:5] AS sample_accounts
        FROM dedup_pins dp
        GROUP BY dp.clean_domain
      ),
      enriched AS (
        SELECT
          da.*,
          drm.registered_at AS domain_created_at,
          drm.expires_at AS domain_expires_at,
          CASE
            WHEN drm.registered_at IS NOT NULL THEN GREATEST(1, FLOOR(EXTRACT(EPOCH FROM (${referenceTime}::timestamptz - drm.registered_at)) / 86400))::int
            ELSE drm.initial_age_days
          END AS age_days,
          CASE
            WHEN drm.registered_at IS NOT NULL THEN ROUND((EXTRACT(EPOCH FROM (${referenceTime}::timestamptz - drm.registered_at)) / 31557600)::numeric, 2)
            ELSE drm.initial_age_years
          END AS age_years,
          CASE
            WHEN da.domain = 'Uploaded by user' THEN 'organic_unlinked'
            ELSE COALESCE(drm.lookup_status, 'unchecked')
          END AS age_status,
          CASE
            WHEN da.domain = 'Uploaded by user' THEN 'unmonetized'
            ELSE COALESCE(dmm.current_ad_network, 'unchecked')
          END AS ad_network,
          dmm.ad_manager_domain,
          dmm.primary_pub_id,
          dmm.previous_ad_network,
          dmm.switched_at AS ad_switched_at,
          COALESCE(dmm.network_history, '[]'::jsonb) AS ad_network_history,
          COALESCE(dmm.ads_txt_status, 'pending') AS ads_txt_status,
          ROUND(
            (da.displaced_pins::numeric / GREATEST(1, da.active_serp_pins + da.displaced_pins)) * 100,
            1
          ) AS decay_rate_pct,
          ROUND(
            (
              (GREATEST(0.5, da.visibility_score) * LN(GREATEST(10, da.total_saves)::numeric)) /
              GREATEST(
                0.25,
                COALESCE(
                  CASE WHEN drm.registered_at IS NOT NULL THEN (EXTRACT(EPOCH FROM (${referenceTime}::timestamptz - drm.registered_at)) / 31557600)::numeric ELSE NULL END,
                  drm.initial_age_years,
                  2.5
                )
              )
            )::numeric,
            2
          ) AS arbitrage_score
        FROM domain_agg da
        LEFT JOIN domain_registry_metadata drm ON drm.domain = da.domain
        LEFT JOIN domain_monetization_metadata dmm ON dmm.domain = da.domain
      )
      INSERT INTO domain_intelligence_rollup (
        domain, total_pins, unique_urls, pins_per_url, active_serp_pins,
        top3_pins, top10_pins, rank_11_50_pins, displaced_pins, best_rank, avg_rank,
        visibility_score, total_saves, avg_saves, total_repins, avg_velocity,
        accounts_count, sample_accounts, domain_created_at, domain_expires_at,
        age_days, age_years, age_status, ad_network, ad_manager_domain, primary_pub_id,
        previous_ad_network, ad_switched_at, ad_network_history, ads_txt_status,
        decay_rate_pct, arbitrage_score, refreshed_at
      )
      SELECT
        e.domain, e.total_pins, e.unique_urls, e.pins_per_url, e.active_serp_pins,
        e.top3_pins, e.top10_pins, e.rank_11_50_pins, e.displaced_pins, e.best_rank, e.avg_rank,
        e.visibility_score, e.total_saves, e.avg_saves, e.total_repins, e.avg_velocity,
        e.accounts_count, to_jsonb(COALESCE(e.sample_accounts, ARRAY[]::text[])), e.domain_created_at, e.domain_expires_at,
        e.age_days, e.age_years, e.age_status, e.ad_network, e.ad_manager_domain, e.primary_pub_id,
        e.previous_ad_network, e.ad_switched_at, e.ad_network_history, e.ads_txt_status,
        e.decay_rate_pct, e.arbitrage_score, NOW()
      FROM enriched e
      ON CONFLICT (domain) DO UPDATE SET
        total_pins = EXCLUDED.total_pins,
        unique_urls = EXCLUDED.unique_urls,
        pins_per_url = EXCLUDED.pins_per_url,
        active_serp_pins = EXCLUDED.active_serp_pins,
        top3_pins = EXCLUDED.top3_pins,
        top10_pins = EXCLUDED.top10_pins,
        rank_11_50_pins = EXCLUDED.rank_11_50_pins,
        displaced_pins = EXCLUDED.displaced_pins,
        best_rank = EXCLUDED.best_rank,
        avg_rank = EXCLUDED.avg_rank,
        visibility_score = EXCLUDED.visibility_score,
        total_saves = EXCLUDED.total_saves,
        avg_saves = EXCLUDED.avg_saves,
        total_repins = EXCLUDED.total_repins,
        avg_velocity = EXCLUDED.avg_velocity,
        accounts_count = EXCLUDED.accounts_count,
        sample_accounts = EXCLUDED.sample_accounts,
        domain_created_at = EXCLUDED.domain_created_at,
        domain_expires_at = EXCLUDED.domain_expires_at,
        age_days = EXCLUDED.age_days,
        age_years = EXCLUDED.age_years,
        age_status = EXCLUDED.age_status,
        ad_network = EXCLUDED.ad_network,
        ad_manager_domain = EXCLUDED.ad_manager_domain,
        primary_pub_id = EXCLUDED.primary_pub_id,
        previous_ad_network = EXCLUDED.previous_ad_network,
        ad_switched_at = EXCLUDED.ad_switched_at,
        ad_network_history = EXCLUDED.ad_network_history,
        ads_txt_status = EXCLUDED.ads_txt_status,
        decay_rate_pct = EXCLUDED.decay_rate_pct,
        arbitrage_score = EXCLUDED.arbitrage_score,
        refreshed_at = NOW()
      WHERE
        domain_intelligence_rollup.total_pins IS DISTINCT FROM EXCLUDED.total_pins OR
        domain_intelligence_rollup.unique_urls IS DISTINCT FROM EXCLUDED.unique_urls OR
        domain_intelligence_rollup.pins_per_url IS DISTINCT FROM EXCLUDED.pins_per_url OR
        domain_intelligence_rollup.active_serp_pins IS DISTINCT FROM EXCLUDED.active_serp_pins OR
        domain_intelligence_rollup.top3_pins IS DISTINCT FROM EXCLUDED.top3_pins OR
        domain_intelligence_rollup.top10_pins IS DISTINCT FROM EXCLUDED.top10_pins OR
        domain_intelligence_rollup.rank_11_50_pins IS DISTINCT FROM EXCLUDED.rank_11_50_pins OR
        domain_intelligence_rollup.displaced_pins IS DISTINCT FROM EXCLUDED.displaced_pins OR
        domain_intelligence_rollup.best_rank IS DISTINCT FROM EXCLUDED.best_rank OR
        domain_intelligence_rollup.avg_rank IS DISTINCT FROM EXCLUDED.avg_rank OR
        domain_intelligence_rollup.visibility_score IS DISTINCT FROM EXCLUDED.visibility_score OR
        domain_intelligence_rollup.total_saves IS DISTINCT FROM EXCLUDED.total_saves OR
        domain_intelligence_rollup.avg_saves IS DISTINCT FROM EXCLUDED.avg_saves OR
        domain_intelligence_rollup.total_repins IS DISTINCT FROM EXCLUDED.total_repins OR
        domain_intelligence_rollup.avg_velocity IS DISTINCT FROM EXCLUDED.avg_velocity OR
        domain_intelligence_rollup.accounts_count IS DISTINCT FROM EXCLUDED.accounts_count OR
        domain_intelligence_rollup.sample_accounts IS DISTINCT FROM EXCLUDED.sample_accounts OR
        domain_intelligence_rollup.ad_network IS DISTINCT FROM EXCLUDED.ad_network OR
        domain_intelligence_rollup.ad_manager_domain IS DISTINCT FROM EXCLUDED.ad_manager_domain OR
        domain_intelligence_rollup.primary_pub_id IS DISTINCT FROM EXCLUDED.primary_pub_id OR
        domain_intelligence_rollup.previous_ad_network IS DISTINCT FROM EXCLUDED.previous_ad_network OR
        domain_intelligence_rollup.ad_switched_at IS DISTINCT FROM EXCLUDED.ad_switched_at OR
        domain_intelligence_rollup.ad_network_history IS DISTINCT FROM EXCLUDED.ad_network_history OR
        domain_intelligence_rollup.ads_txt_status IS DISTINCT FROM EXCLUDED.ads_txt_status OR
        domain_intelligence_rollup.age_days IS DISTINCT FROM EXCLUDED.age_days OR
        domain_intelligence_rollup.age_years IS DISTINCT FROM EXCLUDED.age_years OR
        domain_intelligence_rollup.age_status IS DISTINCT FROM EXCLUDED.age_status OR
        domain_intelligence_rollup.domain_created_at IS DISTINCT FROM EXCLUDED.domain_created_at OR
        domain_intelligence_rollup.domain_expires_at IS DISTINCT FROM EXCLUDED.domain_expires_at OR
        domain_intelligence_rollup.decay_rate_pct IS DISTINCT FROM EXCLUDED.decay_rate_pct OR
        domain_intelligence_rollup.arbitrage_score IS DISTINCT FROM EXCLUDED.arbitrage_score;
    `;
    return { success: true, count: res?.length || 0 };
  } catch (err) {
    console.warn(`[refreshDomainIntelligenceRollup] Error refreshing rollup:`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Synchronizes a single domain's aggregated metrics directly into domain_intelligence_rollup.
 * Designed for micro-sync on dossier request (<5ms) without full table re-aggregation.
 * 
 * // [INVARIANT: SINGLE-DOMAIN-SYNC-O1]
 */
export async function syncSingleDomainRollup(sql, cleanDomain, dossierData, options = {}) {
  if (!sql || !cleanDomain || !dossierData) return null;
  // Guard: NEVER execute syncSingleDomainRollup if folderId is present
  if (options?.folderId || dossierData?.folderId) return null;

  const isOrganicVault = String(cleanDomain).trim().toLowerCase() === 'uploaded by user' || String(cleanDomain).trim().toLowerCase() === 'uploaded-by-user' || String(cleanDomain).trim().toLowerCase() === 'organic';
  const canonicalDomain = isOrganicVault ? 'Uploaded by user' : cleanDomain;

  const ageInfo = dossierData.age_info || {};
  const adInfo = dossierData.ad_info || {};

  try {
    // Decoupled SSOT: ONLY update WHOIS age and ads.txt monetization fields.
    // NEVER overwrite total_pins, displaced_pins, active_serp_pins, total_saves, or avg_velocity.
    // Guard: Do not insert total_pins = 0 stub rows into domain_intelligence_rollup when a domain has 0 pins in universal_master_pins.
    const [existing] = await sql`
      SELECT domain FROM domain_intelligence_rollup WHERE domain = ${canonicalDomain} LIMIT 1;
    `;
    if (!existing) {
      const [pinCheck] = await sql`
        SELECT 1 FROM universal_master_pins
        WHERE (clean_domain = ${canonicalDomain} OR (${isOrganicVault}::boolean AND clean_domain = 'uploaded by user'))
        LIMIT 1;
      `;
      if (!pinCheck) {
        return null;
      }
    }

    const [result] = await sql`
      INSERT INTO domain_intelligence_rollup (
        domain, total_pins, total_saves, accounts_count, unique_urls, pins_per_url,
        active_serp_pins, displaced_pins, top3_pins, top10_pins, rank_11_50_pins,
        best_rank, avg_rank, visibility_score, avg_velocity,
        ad_network, ad_manager_domain, primary_pub_id, ads_txt_status,
        age_days, age_years, age_status, domain_created_at, domain_expires_at,
        refreshed_at
      ) VALUES (
        ${canonicalDomain}, 0, 0, 0, 1, 1,
        0, 0, 0, 0, 0,
        null, null, 0, 0,
        ${adInfo.current_ad_network || adInfo.ad_network || 'unchecked'},
        ${adInfo.ad_manager_domain || null},
        ${adInfo.primary_pub_id || null},
        ${adInfo.ads_txt_status || 'pending'},
        ${ageInfo.age_days != null ? Number(ageInfo.age_days) : null},
        ${ageInfo.age_years != null ? Number(ageInfo.age_years) : null},
        ${ageInfo.lookup_status || ageInfo.age_status || 'unchecked'},
        ${ageInfo.registered_at ? new Date(ageInfo.registered_at) : null},
        ${ageInfo.expires_at ? new Date(ageInfo.expires_at) : null},
        NOW()
      )
      ON CONFLICT (domain) DO UPDATE SET
        ad_network = CASE 
          WHEN EXCLUDED.ad_network <> 'unchecked' AND EXCLUDED.ad_network <> '' 
          THEN EXCLUDED.ad_network 
          ELSE domain_intelligence_rollup.ad_network 
        END,
        ad_manager_domain = COALESCE(EXCLUDED.ad_manager_domain, domain_intelligence_rollup.ad_manager_domain),
        primary_pub_id = COALESCE(EXCLUDED.primary_pub_id, domain_intelligence_rollup.primary_pub_id),
        ads_txt_status = CASE 
          WHEN EXCLUDED.ads_txt_status <> 'pending' AND EXCLUDED.ads_txt_status <> '' 
          THEN EXCLUDED.ads_txt_status 
          ELSE domain_intelligence_rollup.ads_txt_status 
        END,
        age_days = COALESCE(EXCLUDED.age_days, domain_intelligence_rollup.age_days),
        age_years = COALESCE(EXCLUDED.age_years, domain_intelligence_rollup.age_years),
        age_status = CASE 
          WHEN EXCLUDED.age_status <> 'unchecked' AND EXCLUDED.age_status <> '' 
          THEN EXCLUDED.age_status 
          ELSE domain_intelligence_rollup.age_status 
        END,
        domain_created_at = COALESCE(EXCLUDED.domain_created_at, domain_intelligence_rollup.domain_created_at),
        domain_expires_at = COALESCE(EXCLUDED.domain_expires_at, domain_intelligence_rollup.domain_expires_at),
        refreshed_at = NOW()
      RETURNING *;
    `;
    return result || null;
  } catch (err) {
    console.warn(`[syncSingleDomainRollup] Failed for ${cleanDomain}:`, err.message);
    return null;
  }
}

/**
 * Fast Domain Intelligence querying domain_intelligence_rollup with graceful fallback to on-the-fly CTE
 */
export async function listDomainsIntelligenceFast(sql, options = {}) {
  const fId = options.folderId && !isNaN(Number(options.folderId)) ? Number(options.folderId) : null;
  const kId = options.keywordId && !isNaN(Number(options.keywordId)) ? Number(options.keywordId) : null;
  const pillar = options.pillar || 'all';

  if (fId === null && kId === null && pillar === 'all') {
    try {
      const search = options.search || '';
      const preset = options.preset || 'all';
      const adNetwork = options.adNetwork || 'all';
      const ageFilter = options.ageFilter || 'all';
      const rankFilter = options.rankFilter || 'all';
      const savesFilter = options.savesFilter || 'all';
      const sizeFilter = options.sizeFilter || 'all';
      const logicMode = options.logicMode || 'and';
      const excludeMarketplaces = options.excludeMarketplaces !== false;
      const minPins = Math.max(1, parseInt(options.minPins, 10) || 1);
      const sortBy = options.sortBy || 'visibility';
      const page = Math.max(1, parseInt(options.page, 10) || 1);
      const limit = Math.max(1, Math.min(parseInt(options.limit, 10) || 50, 2000));
      const offset = (page - 1) * limit;
      const searchPattern = search ? `%${escapeSqlLike(search.toLowerCase())}%` : null;

      const rows = await sql`
        WITH rollup_src AS (
          SELECT *
          FROM domain_intelligence_rollup r
          WHERE (${minPins} <= 1 OR r.total_pins >= ${minPins})
            AND (${searchPattern}::text IS NULL OR LOWER(r.domain) LIKE ${searchPattern})
            AND (
              ${excludeMarketplaces} = FALSE
              OR r.domain NOT IN (
                'etsy.com', 'amazon.com', 'amazon.co.uk', 'amzn.to', 'walmart.com', 'target.com',
                'ebay.com', 'aliexpress.com', 'temu.com', 'shein.com', 'ltks.co', 'liketoknow.it',
                'shopltk.com', 'rstyle.me', 'shopstyle.it', 'youtube.com', 'youtu.be', 'instagram.com',
                'tiktok.com', 'facebook.com', 'twitter.com', 'x.com', 'reddit.com', 'threads.net',
                'linkedin.com', 'quora.com', 'tumblr.com', 'medium.com', 'wikipedia.org',
                'google.com', 'share.google', 'drive.google.com', 'docs.google.com', 'storage.googleapis.com',
                'blogger.googleusercontent.com'
              )
            )
            AND (
              ${preset} = 'all'
              OR (${preset} = 'baby_giants' AND r.age_years IS NOT NULL AND r.age_years <= 2.0 AND (r.top10_pins >= 1 OR r.total_saves >= 1000))
              OR (${preset} = 'easy_arbitrage' AND r.total_pins <= 25 AND (r.top10_pins >= 1 OR r.avg_velocity >= 5))
              OR (${preset} = 'bleeding_giants' AND r.displaced_pins >= 3 AND r.decay_rate_pct >= 30.0)
              OR (${preset} = 'high_multipliers' AND r.pins_per_url >= 3.0)
              OR (${preset} = 'multi_account' AND r.accounts_count >= 2)
              OR (${preset} = 'decaying_monopoly' AND r.top10_pins >= 1 AND r.total_saves >= 3000 AND (r.avg_velocity <= 3.0 OR r.decay_rate_pct >= 25.0))
            )
            AND (
              ${adNetwork} = 'all'
              OR (${adNetwork} = 'switched' AND r.ad_switched_at IS NOT NULL)
              OR (${adNetwork} = 'unchecked' AND (r.ad_network IS NULL OR r.ad_network = 'unchecked'))
              OR r.ad_network = ${adNetwork}
            )
        ),
        modular_evaluated AS (
          SELECT
            r.*,
            CASE
              WHEN ${ageFilter} = 'le_0_5' THEN (r.age_years IS NOT NULL AND r.age_years <= 0.5)
              WHEN ${ageFilter} = 'le_1' THEN (r.age_years IS NOT NULL AND r.age_years <= 1.0)
              WHEN ${ageFilter} = 'le_2' THEN (r.age_years IS NOT NULL AND r.age_years <= 2.0)
              WHEN ${ageFilter} = 'le_3' THEN (r.age_years IS NOT NULL AND r.age_years <= 3.0)
              WHEN ${ageFilter} = 'le_5' THEN (r.age_years IS NOT NULL AND r.age_years <= 5.0)
              WHEN ${ageFilter} = 'gt_5' THEN (r.age_years IS NOT NULL AND r.age_years > 5.0)
              WHEN ${ageFilter} = 'verified' THEN (r.age_years IS NOT NULL)
              WHEN ${ageFilter} = 'unchecked' THEN (r.age_years IS NULL)
              ELSE TRUE
            END AS age_match,
            CASE
              WHEN ${rankFilter} = 'top3' THEN (r.top3_pins >= 1 OR (r.best_rank IS NOT NULL AND r.best_rank <= 3))
              WHEN ${rankFilter} = 'top5' THEN (r.best_rank IS NOT NULL AND r.best_rank <= 5)
              WHEN ${rankFilter} = 'top10' THEN (r.top10_pins >= 1 OR (r.best_rank IS NOT NULL AND r.best_rank <= 10))
              WHEN ${rankFilter} = 'top20' THEN (r.best_rank IS NOT NULL AND r.best_rank <= 20)
              WHEN ${rankFilter} = 'top50' THEN (r.active_serp_pins >= 1)
              WHEN ${rankFilter} = 'displaced' THEN (r.displaced_pins >= 1)
              WHEN ${rankFilter} = 'bleeding' THEN (r.displaced_pins >= 3 AND r.decay_rate_pct >= 30.0)
              ELSE TRUE
            END AS rank_match,
            CASE
              WHEN ${savesFilter} = 'ge_500' THEN (r.total_saves >= 500)
              WHEN ${savesFilter} = 'ge_1k' THEN (r.total_saves >= 1000)
              WHEN ${savesFilter} = 'ge_5k' THEN (r.total_saves >= 5000)
              WHEN ${savesFilter} = 'ge_10k' THEN (r.total_saves >= 10000)
              WHEN ${savesFilter} = 'ge_50k' THEN (r.total_saves >= 50000)
              WHEN ${savesFilter} = 'ge_100k' THEN (r.total_saves >= 100000)
              WHEN ${savesFilter} = 'ge_500k' THEN (r.total_saves >= 500000)
              WHEN ${savesFilter} = 'vel_5' THEN (r.avg_velocity >= 5.0)
              WHEN ${savesFilter} = 'vel_20' THEN (r.avg_velocity >= 20.0)
              ELSE TRUE
            END AS saves_match,
            CASE
              WHEN ${sizeFilter} = 'pins_le_25' THEN (r.total_pins <= 25)
              WHEN ${sizeFilter} = 'pins_le_100' THEN (r.total_pins <= 100)
              WHEN ${sizeFilter} = 'pins_ge_100' THEN (r.total_pins >= 100)
              WHEN ${sizeFilter} = 'pins_ge_500' THEN (r.total_pins >= 500)
              WHEN ${sizeFilter} = 'mult_ge_2' THEN (r.pins_per_url >= 2.0)
              WHEN ${sizeFilter} = 'mult_ge_3' THEN (r.pins_per_url >= 3.0)
              WHEN ${sizeFilter} = 'mult_ge_5' THEN (r.pins_per_url >= 5.0)
              WHEN ${sizeFilter} = 'multi_acct' THEN (r.accounts_count >= 2)
              WHEN ${sizeFilter} = 'pbn_3' THEN (r.accounts_count >= 3)
              ELSE TRUE
            END AS size_match
          FROM rollup_src r
        ),
        modular_filtered AS (
          SELECT
            *,
            ROW_NUMBER() OVER (ORDER BY visibility_score DESC, total_saves DESC) AS top5_rn
          FROM modular_evaluated
          WHERE (
            CASE
              WHEN ${logicMode} = 'or' AND (${ageFilter} <> 'all' OR ${rankFilter} <> 'all' OR ${savesFilter} <> 'all' OR ${sizeFilter} <> 'all') THEN (
                (${ageFilter} <> 'all' AND age_match)
                OR (${rankFilter} <> 'all' AND rank_match)
                OR (${savesFilter} <> 'all' AND saves_match)
                OR (${sizeFilter} <> 'all' AND size_match)
              )
              ELSE (age_match AND rank_match AND saves_match AND size_match)
            END
          )
        )
        SELECT
          *,
          COUNT(*) OVER()::int AS total_filtered_domains,
          SUM(top10_pins) OVER()::int AS global_top10_slots,
          SUM(CASE WHEN top5_rn <= 5 THEN top10_pins ELSE 0 END) OVER()::int AS top5_global_slots,
          COUNT(*) FILTER (WHERE age_years IS NOT NULL AND age_years <= 2.0 AND (top10_pins >= 1 OR total_saves >= 1000)) OVER()::int AS baby_giants_count,
          COUNT(*) FILTER (WHERE accounts_count >= 2) OVER()::int AS multi_account_domains_count,
          ROUND(AVG(pins_per_url) OVER(), 2) AS global_avg_multiplier
        FROM modular_filtered
        ORDER BY
          CASE WHEN ${sortBy} = 'visibility' THEN visibility_score END DESC NULLS LAST,
          CASE WHEN ${sortBy} = 'pins_count' THEN total_pins END DESC NULLS LAST,
          CASE WHEN ${sortBy} = 'avg_rank' THEN avg_rank END ASC NULLS LAST,
          CASE WHEN ${sortBy} = 'saves' THEN total_saves END DESC NULLS LAST,
          CASE WHEN ${sortBy} = 'velocity' THEN avg_velocity END DESC NULLS LAST,
          CASE WHEN ${sortBy} = 'age_asc' THEN age_days END ASC NULLS LAST,
          CASE WHEN ${sortBy} = 'age_desc' THEN age_days END DESC NULLS LAST,
          CASE WHEN ${sortBy} = 'arbitrage_score' THEN arbitrage_score END DESC NULLS LAST,
          CASE WHEN ${sortBy} = 'multiplier' THEN pins_per_url END DESC NULLS LAST,
          visibility_score DESC, total_saves DESC
        LIMIT ${limit} OFFSET ${offset};
      `;

      if (rows && rows.length > 0) {
        const total = rows[0]?.total_filtered_domains || 0;
        const globalTop10 = Math.max(1, Number(rows[0]?.global_top10_slots || 1));
        const top5Share = rows[0]?.top5_global_slots !== undefined
          ? Number(rows[0].top5_global_slots)
          : rows.slice(0, 5).reduce((acc, r) => acc + Number(r.top10_pins || 0), 0);
        const top5MonopolyPct = Number(Math.min(100, Math.max(0, (top5Share / globalTop10) * 100)).toFixed(1));

        return {
          overview: {
            total_domains: total,
            top5_monopoly_pct: top5MonopolyPct,
            baby_giants_count: rows[0]?.baby_giants_count || 0,
            multi_account_count: rows[0]?.multi_account_domains_count || 0,
            avg_pins_per_url: Number(rows[0]?.global_avg_multiplier || 1.0)
          },
          domains: rows.map(r => ({
            domain: r.domain,
            total_pins: Number(r.total_pins || 0),
            unique_urls: Number(r.unique_urls || 1),
            pins_per_url: Number(r.pins_per_url || 1),
            active_serp_pins: Number(r.active_serp_pins || 0),
            top3_pins: Number(r.top3_pins || 0),
            top10_pins: Number(r.top10_pins || 0),
            rank_11_50_pins: Number(r.rank_11_50_pins || 0),
            displaced_pins: Number(r.displaced_pins || 0),
            best_rank: r.best_rank != null ? Number(r.best_rank) : null,
            avg_rank: r.avg_rank != null ? Number(r.avg_rank) : null,
            visibility_score: Number(r.visibility_score || 0),
            total_saves: Number(r.total_saves || 0),
            avg_saves: Number(r.avg_saves || 0),
            total_repins: Number(r.total_repins || 0),
            avg_velocity: Number(r.avg_velocity || 0),
            accounts_count: Number(r.accounts_count || 0),
            sample_accounts: Array.isArray(r.sample_accounts) ? r.sample_accounts : [],
            domain_created_at: r.domain_created_at || null,
            domain_expires_at: r.domain_expires_at || null,
            age_days: r.age_days != null ? Number(r.age_days) : null,
            age_years: r.age_years != null ? Number(r.age_years) : null,
            age_status: r.age_status || 'unchecked',
            ad_network: r.ad_network || 'unchecked',
            ad_manager_domain: r.ad_manager_domain || null,
            primary_pub_id: r.primary_pub_id || null,
            previous_ad_network: r.previous_ad_network || null,
            ad_switched_at: r.ad_switched_at || null,
            ad_network_history: Array.isArray(r.ad_network_history) ? r.ad_network_history : [],
            ads_txt_status: r.ads_txt_status || 'pending',
            decay_rate_pct: Number(r.decay_rate_pct || 0),
            arbitrage_score: Number(r.arbitrage_score || 0)
          })),
          missing_age_domains: rows.filter(r => !r.age_status && r.domain).map(r => r.domain).slice(0, 8),
          missing_ad_domains: rows
            .filter(r => (!r.ad_network || r.ad_network === 'unchecked') && r.domain)
            .map(r => r.domain)
            .slice(0, 10),
          page,
          limit,
          total,
          total_pages: Math.max(1, Math.ceil(total / limit)),
          cached: true
        };
      } else {
        // [INVARIANT: ZERO-ROW-FALLBACK-GUARD] Guard against unpopulated table without triggering storm on empty searches
        const [countCheck] = await sql`SELECT 1 FROM domain_intelligence_rollup LIMIT 1;`.catch(() => []);
        if (!countCheck) {
          // Table is truly empty on Day-0: trigger background refresh and fallback
          refreshDomainIntelligenceRollup(sql).catch(() => {});
          return await listDomainsIntelligence(sql, options);
        }
        // Legitimate empty search/filter result: return full contract object with empty list
        return {
          overview: {
            total_domains: 0,
            top5_monopoly_pct: 0,
            baby_giants_count: 0,
            multi_account_count: 0,
            avg_pins_per_url: 1.0
          },
          domains: [],
          missing_age_domains: [],
          missing_ad_domains: [],
          page: Number(options.page || 1),
          limit: Number(options.limit || 50),
          total: 0,
          total_pages: 1,
          cached: true
        };
      }
    } catch (fastErr) {
      console.warn(`[listDomainsIntelligenceFast] Rollup query fallback:`, fastErr.message);
      refreshDomainIntelligenceRollup(sql).catch(() => {});
    }
  }

  return await listDomainsIntelligence(sql, options);
}
