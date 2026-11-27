/**
 * src/modules/domains/rollup-leaderboard-service.mjs
 *
 * Domain Intelligence Leaderboard & Rollup Materialization Service:
 * - Shared parameterized `buildDomainAggregationCtes` + `buildModularFilterAndSortSql` helpers
 * - listDomainsIntelligence (on-the-fly CTE aggregation for scoped & fallback queries)
 * - refreshDomainIntelligenceRollup (full materialization into domain_intelligence_rollup)
 * - syncSingleDomainRollup (O(1) micro-sync on dossier enrichment)
 * - listDomainsIntelligenceFast (fast rollup-backed leaderboard with Day-0 fallback)
 */

import { escapeSqlLike } from './whois-age-service.mjs';
import { safeWaitUntil, redactSecrets } from '../../http/security-and-response.mjs';

let rollupRefreshInflight = null;

/**
 * Pure parameterized SQL fragment container (`__sqlFrag`) that flattens cleanly into
 * a single `TemplateStringsArray` + bound `values` call on both `postgres.js` and unit-test SQL mocks.
 */
function sqlFrag(strings, ...values) {
  return { __sqlFrag: true, strings: Array.from(strings), values };
}

function execComposedSql(sql, strings, ...values) {
  const outStrings = [''];
  const outValues = [];
  const appendPart = (strs, vals) => {
    outStrings[outStrings.length - 1] += strs[0];
    for (let i = 0; i < vals.length; i++) {
      const v = vals[i];
      if (v && v.__sqlFrag) {
        appendPart(v.strings, v.values);
        outStrings[outStrings.length - 1] += strs[i + 1];
      } else {
        outValues.push(v);
        outStrings.push(strs[i + 1]);
      }
    }
  };
  appendPart(strings, values);
  const tpl = Object.freeze(Object.assign(outStrings, { raw: [...outStrings] }));
  return sql(tpl, ...outValues);
}

/**
 * Shared SSOT Domain Aggregation CTE Builder (`raw_occurrences`, `deduped_pins`, `domain_agg`, `enriched`)
 * used by both `listDomainsIntelligence` and `refreshDomainIntelligenceRollup`.
 */
export function buildDomainAggregationCtes({
  fId = null,
  kId = null,
  pillar = 'all',
  searchPattern = null,
  minPins = 1,
  preset = 'all',
  adNetwork = 'all',
  allowedDomains = null,
  referenceTime,
  forRollupRefresh = false
}) {
  const includeArchiveAndComp = forRollupRefresh || (fId === null && kId === null);
  const normalizedAllowed = Array.isArray(allowedDomains)
    ? allowedDomains.map((d) => String(d || '').trim().toLowerCase().replace(/^www\./, '')).filter(Boolean)
    : [];
  const allowedDomainsFilterSql = !forRollupRefresh && normalizedAllowed.length > 0
    ? sqlFrag`AND REGEXP_REPLACE(LOWER(clean_domain), '^www\\.', '') = ANY(${normalizedAllowed}::text[])`
    : sqlFrag``;

  const rawOccurrencesSql = forRollupRefresh
    ? sqlFrag`
        SELECT
          CASE
            WHEN LOWER(TRIM(COALESCE(ump.clean_domain, ''))) IN ('', 'uploaded by user', 'uploaded-by-user', 'organic') THEN 'Uploaded by user'
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
      `
    : (includeArchiveAndComp
      ? sqlFrag`
        SELECT
          CASE
            WHEN LOWER(TRIM(COALESCE(ump.clean_domain, ''))) IN ('', 'uploaded by user', 'uploaded-by-user', 'organic') THEN 'Uploaded by user'
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
          AND (${fId}::int IS NULL OR ksp.keyword_id IN (SELECT keyword_id FROM keyword_folder_items WHERE folder_id = ${fId}))
          AND (${kId}::int IS NULL OR ksp.keyword_id = ${kId})
        WHERE (${pillar} IN ('all', 'competitors', 'archive', 'serp', 'displaced'))
      `
      : sqlFrag`
        SELECT
          CASE
            WHEN LOWER(TRIM(COALESCE(ump.clean_domain, ''))) IN ('', 'uploaded by user', 'uploaded-by-user', 'organic') THEN 'Uploaded by user'
            ELSE LOWER(TRIM(COALESCE(ump.clean_domain, '')))
          END AS clean_domain,
          ksp_dedup.pin_id,
          NULL::int AS keyword_id,
          ksp_dedup.active_rank,
          ksp_dedup.is_displaced,
          ump.save_count::bigint AS saves,
          ump.repin_count::bigint AS repins,
          ump.daily_save_velocity::numeric AS velocity,
          LOWER(TRIM(REPLACE(COALESCE(ump.creator_username, ''), '@', ''))) AS username,
          COALESCE(NULLIF(REGEXP_REPLACE(LOWER(REGEXP_REPLACE(REGEXP_REPLACE(TRIM(COALESCE(ump.destination_url, '')), '^(https?://)?(www\\.)?[^/]+', ''), '[?#].*$', '')), '/+$', ''), ''), '/') AS url_slug,
          TRUE AS is_serp_ranked,
          COALESCE(NULLIF(TRIM(ump.image_signature), ''), ksp_dedup.pin_id) AS creative_signature
        FROM (
          SELECT
            ksp.pin_id,
            MIN(CASE WHEN ksp.is_displaced = FALSE THEN ksp.rank_position ELSE NULL END) AS active_rank,
            BOOL_OR(ksp.is_displaced) AS is_displaced
          FROM keyword_serp_positions ksp
          WHERE (${fId}::int IS NULL OR ksp.keyword_id IN (SELECT keyword_id FROM keyword_folder_items WHERE folder_id = ${fId}))
            AND (${kId}::int IS NULL OR ksp.keyword_id = ${kId})
          GROUP BY ksp.pin_id
        ) ksp_dedup
        JOIN universal_master_pins ump ON ump.pin_id = ksp_dedup.pin_id
        WHERE (${pillar} IN ('all', 'serp', 'competitors', 'displaced'))
      `);

  const dedupWhereSql = forRollupRefresh
    ? sqlFrag`
        WHERE clean_domain IS NOT NULL
          AND clean_domain <> ''
      `
    : sqlFrag`
        WHERE clean_domain IS NOT NULL
          AND clean_domain <> ''
          AND (${searchPattern}::text IS NULL OR LOWER(clean_domain) LIKE LOWER(${searchPattern}) ESCAPE '\\')
          AND (${pillar} <> 'competitors' OR clean_domain IN (
            SELECT CASE
              WHEN LOWER(TRIM(COALESCE(ump.clean_domain, ''))) IN ('', 'uploaded by user', 'uploaded-by-user', 'organic') THEN 'Uploaded by user'
              ELSE LOWER(TRIM(COALESCE(ump.clean_domain, '')))
            END
            FROM competitor_board_pins cbp
            JOIN universal_master_pins ump ON ump.pin_id = cbp.pin_id
          ))
          ${allowedDomainsFilterSql}
      `;

  const havingSql = forRollupRefresh
    ? sqlFrag``
    : sqlFrag`HAVING COUNT(DISTINCT dp.pin_id) >= ${minPins}`;

  const enrichedWhereSql = forRollupRefresh
    ? sqlFrag``
    : sqlFrag`
        WHERE (
          ${preset} = 'all'
          OR (${preset} = 'baby_giants' AND dir.domain_created_at >= ${referenceTime}::timestamptz - INTERVAL '2 years' AND (da.top10_pins >= 1 OR da.total_saves >= 1000))
          OR (${preset} = 'easy_arbitrage' AND da.total_pins <= 25 AND (da.top10_pins >= 1 OR da.avg_velocity >= 5))
          OR (${preset} = 'bleeding_giants' AND da.displaced_pins >= 3 AND (da.displaced_pins::numeric / GREATEST(1, da.active_serp_pins + da.displaced_pins)) >= 0.30)
          OR (${preset} = 'high_multipliers' AND da.pins_per_url >= 3.0)
          OR (${preset} = 'multi_account' AND da.accounts_count >= 2)
          OR (${preset} = 'decaying_monopoly' AND da.top10_pins >= 1 AND da.total_saves >= 3000 AND (da.avg_velocity <= 3.0 OR (da.displaced_pins::numeric / GREATEST(1, da.active_serp_pins + da.displaced_pins)) >= 0.25))
          OR (${preset} = 'cluster_push_signal' AND (
            (dir.domain_created_at >= ${referenceTime}::timestamptz - INTERVAL '2 years' OR (dir.age_years IS NOT NULL AND dir.age_years <= 2.0))
            AND (
              da.accounts_count >= 2
              OR EXISTS (
                SELECT 1 FROM competitor_profiles cp
                WHERE LOWER(cp.username) = ANY(COALESCE(da.sample_accounts, ARRAY[]::text[]))
                  AND (COALESCE(cp.monthly_reach, 0) >= 100000 OR COALESCE(cp.profile_views, 0) >= 100000)
              )
            )
          ))
        )
        AND (
          ${adNetwork} = 'all'
          OR (${adNetwork} = 'switched' AND dir.ad_switched_at IS NOT NULL)
          OR (${adNetwork} = 'unchecked' AND (dir.ad_network IS NULL OR dir.ad_network = 'unchecked'))
          OR dir.ad_network = ${adNetwork}
        )
      `;

  return sqlFrag`
    WITH raw_occurrences AS (
      ${rawOccurrencesSql}
    ),
    deduped_pins AS (
      SELECT
        clean_domain,
        pin_id,
        MIN(active_rank) AS best_serp_rank,
        BOOL_OR(is_displaced) AND MIN(active_rank) IS NULL AS is_displaced_only,
        BOOL_OR(is_serp_ranked) AS is_serp_ranked,
        MAX(saves)::bigint AS saves,
        MAX(repins)::bigint AS repins,
        MAX(velocity)::numeric AS velocity,
        MAX(NULLIF(username, '')) AS username,
        COALESCE(MAX(NULLIF(url_slug, '/')), '/') AS url_slug,
        COALESCE(MAX(creative_signature), pin_id) AS creative_signature
      FROM raw_occurrences
      ${dedupWhereSql}
      GROUP BY clean_domain, pin_id
    ),
    domain_agg AS (
      SELECT
        dp.clean_domain AS domain,
        -- [INVARIANT: SERP-ONLY-RANKED-PINS-COUNTING]
        COALESCE(
          NULLIF(COUNT(DISTINCT dp.pin_id) FILTER (WHERE dp.is_serp_ranked = TRUE), 0),
          NULLIF(COUNT(DISTINCT dp.pin_id), 0),
          1
        )::int AS total_pins,
        COUNT(DISTINCT dp.pin_id) FILTER (WHERE dp.is_serp_ranked = FALSE)::int AS catalog_only_pins,
        CASE
          WHEN dp.clean_domain = 'Uploaded by user' THEN 0
          ELSE GREATEST(
            1,
            COALESCE(
              NULLIF(COUNT(DISTINCT dp.url_slug) FILTER (WHERE dp.is_serp_ranked = TRUE AND dp.url_slug IS NOT NULL AND dp.url_slug <> '/'), 0),
              COUNT(DISTINCT dp.url_slug) FILTER (WHERE dp.url_slug IS NOT NULL AND dp.url_slug <> '/')
            )
          )::int
        END AS unique_urls,
        ROUND(
          COALESCE(
            NULLIF(COUNT(DISTINCT dp.creative_signature) FILTER (WHERE dp.is_serp_ranked = TRUE), 0),
            NULLIF(COUNT(DISTINCT dp.creative_signature), 0),
            1
          )::numeric /
          GREATEST(
            1,
            COALESCE(
              NULLIF(COUNT(DISTINCT dp.url_slug) FILTER (WHERE dp.is_serp_ranked = TRUE AND dp.url_slug IS NOT NULL AND dp.url_slug <> '/'), 0),
              COUNT(DISTINCT dp.url_slug) FILTER (WHERE dp.url_slug IS NOT NULL AND dp.url_slug <> '/')
            )
          ),
          2
        ) AS pins_per_url,
        COUNT(DISTINCT dp.pin_id) FILTER (WHERE dp.best_serp_rank IS NOT NULL)::int AS active_serp_pins,
        COUNT(DISTINCT dp.pin_id) FILTER (WHERE dp.best_serp_rank <= 3)::int AS top3_pins,
        COUNT(DISTINCT dp.pin_id) FILTER (WHERE dp.best_serp_rank <= 10)::int AS top10_pins,
        COUNT(DISTINCT dp.pin_id) FILTER (WHERE dp.best_serp_rank > 10 AND dp.best_serp_rank <= 50)::int AS rank_11_50_pins,
        COUNT(DISTINCT dp.pin_id) FILTER (WHERE dp.is_displaced_only = TRUE AND dp.is_serp_ranked = TRUE)::int AS displaced_pins,
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
          NULLIF(SUM(dp.saves) FILTER (WHERE dp.is_serp_ranked = TRUE), 0),
          SUM(dp.saves),
          0
        )::bigint AS total_saves,
        ROUND(COALESCE(
          NULLIF(AVG(dp.saves) FILTER (WHERE dp.is_serp_ranked = TRUE), 0),
          AVG(dp.saves),
          0
        ), 1) AS avg_saves,
        COALESCE(
          NULLIF(SUM(dp.repins) FILTER (WHERE dp.is_serp_ranked = TRUE), 0),
          SUM(dp.repins),
          0
        )::bigint AS total_repins,
        -- [INVARIANT: DUAL-DOMAIN-VELOCITY] Non-diluted active pin aggregate daily velocity
        ROUND(COALESCE(
          NULLIF(SUM(dp.velocity) FILTER (WHERE dp.is_serp_ranked = TRUE AND dp.velocity > 0), 0),
          SUM(dp.velocity) FILTER (WHERE dp.velocity > 0),
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
                  AND dp.username NOT LIKE 'preview\\_%' ESCAPE '\\'
                  AND (
                    REPLACE(dp.username, '_', '') = SPLIT_PART(REPLACE(dp.clean_domain, '-', ''), '.', 1)
                    OR SPLIT_PART(REPLACE(dp.clean_domain, '-', ''), '.', 1) LIKE '%' || REPLACE(REPLACE(REPLACE(REPLACE(dp.username, '_', ''), '\\', '\\\\'), '%', '\\%'), '_', '\\_') || '%' ESCAPE '\\'
                    OR REPLACE(dp.username, '_', '') LIKE '%' || REPLACE(REPLACE(REPLACE(SPLIT_PART(REPLACE(dp.clean_domain, '-', ''), '.', 1), '\\', '\\\\'), '%', '\\%'), '_', '\\_') || '%' ESCAPE '\\'
                  )
              )
            ],
            NULL
          ) || COALESCE(
            (ARRAY_AGG(DISTINCT dp.username) FILTER (
              WHERE dp.is_serp_ranked = TRUE AND dp.username IS NOT NULL AND dp.username <> ''
                AND dp.username NOT LIKE 'preview\\_%' ESCAPE '\\'
                AND NOT (
                  REPLACE(dp.username, '_', '') = SPLIT_PART(REPLACE(dp.clean_domain, '-', ''), '.', 1)
                  OR SPLIT_PART(REPLACE(dp.clean_domain, '-', ''), '.', 1) LIKE '%' || REPLACE(REPLACE(REPLACE(REPLACE(dp.username, '_', ''), '\\', '\\\\'), '%', '\\%'), '_', '\\_') || '%' ESCAPE '\\'
                  OR REPLACE(dp.username, '_', '') LIKE '%' || REPLACE(REPLACE(REPLACE(SPLIT_PART(REPLACE(dp.clean_domain, '-', ''), '.', 1), '\\', '\\\\'), '%', '\\%'), '_', '\\_') || '%' ESCAPE '\\'
                )
            ))[1:5],
            (ARRAY_AGG(DISTINCT dp.username) FILTER (
              WHERE dp.username IS NOT NULL AND dp.username <> ''
                AND dp.username NOT LIKE 'preview\\_%' ESCAPE '\\'
                AND NOT (
                  REPLACE(dp.username, '_', '') = SPLIT_PART(REPLACE(dp.clean_domain, '-', ''), '.', 1)
                  OR SPLIT_PART(REPLACE(dp.clean_domain, '-', ''), '.', 1) LIKE '%' || REPLACE(REPLACE(REPLACE(REPLACE(dp.username, '_', ''), '\\', '\\\\'), '%', '\\%'), '_', '\\_') || '%' ESCAPE '\\'
                  OR REPLACE(dp.username, '_', '') LIKE '%' || REPLACE(REPLACE(REPLACE(SPLIT_PART(REPLACE(dp.clean_domain, '-', ''), '.', 1), '\\', '\\\\'), '%', '\\%'), '_', '\\_') || '%' ESCAPE '\\'
                )
            ))[1:5],
            ARRAY[]::text[]
          )
        )[1:5] AS sample_accounts
      FROM deduped_pins dp
      GROUP BY dp.clean_domain
      ${havingSql}
    ),
    enriched AS (
      SELECT
        da.*,
        dir.domain_created_at,
        dir.domain_expires_at,
        CASE
          WHEN dir.domain_created_at IS NOT NULL THEN GREATEST(1, FLOOR(EXTRACT(EPOCH FROM (${referenceTime}::timestamptz - dir.domain_created_at)) / 86400))::int
          ELSE dir.age_days
        END AS age_days,
        CASE
          WHEN dir.domain_created_at IS NOT NULL THEN LEAST(999.99, ROUND((EXTRACT(EPOCH FROM (${referenceTime}::timestamptz - dir.domain_created_at)) / 31557600)::numeric, 2))
          ELSE dir.age_years
        END AS age_years,
        CASE
          WHEN da.domain = 'Uploaded by user' THEN 'organic_unlinked'
          ELSE COALESCE(NULLIF(dir.age_status, 'unchecked'), NULLIF(dir.lookup_status, 'pending'), dir.age_status)
        END AS age_status,
        CASE
          WHEN da.domain = 'Uploaded by user' THEN 'unmonetized'
          ELSE COALESCE(dir.ad_network, 'unchecked')
        END AS ad_network,
        dir.ad_manager_domain,
        dir.primary_pub_id,
        dir.previous_ad_network,
        dir.ad_switched_at,
        COALESCE(dir.ad_network_history, '[]'::jsonb) AS ad_network_history,
        COALESCE(dir.ads_txt_status, 'pending') AS ads_txt_status,
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
                CASE WHEN dir.domain_created_at IS NOT NULL THEN (EXTRACT(EPOCH FROM (${referenceTime}::timestamptz - dir.domain_created_at)) / 31557600)::numeric ELSE NULL END,
                dir.age_years,
                2.5
              )
            )
          )::numeric,
          2
        ) AS arbitrage_score
      FROM domain_agg da
      LEFT JOIN domain_intelligence_rollup dir ON dir.domain = da.domain
      ${enrichedWhereSql}
    )
  `;
}

function buildModularFilterAndSortSql({
  sourceCteName,
  ageFilter,
  rankFilter,
  savesFilter,
  sizeFilter,
  logicMode,
  sortBy,
  limit,
  offset
}) {
  const srcSql = sourceCteName === 'rollup_src' ? sqlFrag`rollup_src` : sqlFrag`enriched`;
  return sqlFrag`
    modular_evaluated AS (
      SELECT
        s.*,
        CASE
          WHEN ${ageFilter} = 'le_0_5' THEN (s.age_years IS NOT NULL AND s.age_years <= 0.5)
          WHEN ${ageFilter} = 'le_1' THEN (s.age_years IS NOT NULL AND s.age_years <= 1.0)
          WHEN ${ageFilter} = 'le_2' THEN (s.age_years IS NOT NULL AND s.age_years <= 2.0)
          WHEN ${ageFilter} = 'le_3' THEN (s.age_years IS NOT NULL AND s.age_years <= 3.0)
          WHEN ${ageFilter} = 'le_5' THEN (s.age_years IS NOT NULL AND s.age_years <= 5.0)
          WHEN ${ageFilter} = 'gt_5' THEN (s.age_years IS NOT NULL AND s.age_years > 5.0)
          WHEN ${ageFilter} = 'verified' THEN (s.age_years IS NOT NULL)
          WHEN ${ageFilter} = 'unchecked' THEN (s.age_years IS NULL)
          ELSE TRUE
        END AS age_match,
        CASE
          WHEN ${rankFilter} = 'top3' THEN (s.top3_pins >= 1 OR (s.best_rank IS NOT NULL AND s.best_rank <= 3))
          WHEN ${rankFilter} = 'top5' THEN (s.best_rank IS NOT NULL AND s.best_rank <= 5)
          WHEN ${rankFilter} = 'top10' THEN (s.top10_pins >= 1 OR (s.best_rank IS NOT NULL AND s.best_rank <= 10))
          WHEN ${rankFilter} = 'top20' THEN (s.best_rank IS NOT NULL AND s.best_rank <= 20)
          WHEN ${rankFilter} = 'top50' THEN (s.active_serp_pins >= 1)
          WHEN ${rankFilter} = 'displaced' THEN (s.displaced_pins >= 1)
          WHEN ${rankFilter} = 'bleeding' THEN (s.displaced_pins >= 3 AND s.decay_rate_pct >= 30.0)
          ELSE TRUE
        END AS rank_match,
        CASE
          WHEN ${savesFilter} = 'ge_500' THEN (s.total_saves >= 500)
          WHEN ${savesFilter} = 'ge_1k' THEN (s.total_saves >= 1000)
          WHEN ${savesFilter} = 'ge_5k' THEN (s.total_saves >= 5000)
          WHEN ${savesFilter} = 'ge_10k' THEN (s.total_saves >= 10000)
          WHEN ${savesFilter} = 'ge_50k' THEN (s.total_saves >= 50000)
          WHEN ${savesFilter} = 'ge_100k' THEN (s.total_saves >= 100000)
          WHEN ${savesFilter} = 'ge_500k' THEN (s.total_saves >= 500000)
          WHEN ${savesFilter} = 'vel_5' THEN (s.avg_velocity >= 5.0)
          WHEN ${savesFilter} = 'vel_20' THEN (s.avg_velocity >= 20.0)
          ELSE TRUE
        END AS saves_match,
        CASE
          WHEN ${sizeFilter} = 'pins_le_25' THEN (s.total_pins <= 25)
          WHEN ${sizeFilter} = 'pins_le_100' THEN (s.total_pins <= 100)
          WHEN ${sizeFilter} = 'pins_ge_100' THEN (s.total_pins >= 100)
          WHEN ${sizeFilter} = 'pins_ge_500' THEN (s.total_pins >= 500)
          WHEN ${sizeFilter} = 'mult_ge_2' THEN (s.pins_per_url >= 2.0)
          WHEN ${sizeFilter} = 'mult_ge_3' THEN (s.pins_per_url >= 3.0)
          WHEN ${sizeFilter} = 'mult_ge_5' THEN (s.pins_per_url >= 5.0)
          WHEN ${sizeFilter} = 'multi_acct' THEN (s.accounts_count >= 2)
          WHEN ${sizeFilter} = 'pbn_3' THEN (s.accounts_count >= 3)
          ELSE TRUE
        END AS size_match
      FROM ${srcSql} s
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
      CASE WHEN ${sortBy} IN ('domain_asc', 'domain') THEN LOWER(domain) END ASC NULLS LAST,
      CASE WHEN ${sortBy} = 'domain_desc' THEN LOWER(domain) END DESC NULLS LAST,
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
}

function formatDomainsLeaderboardResponse(rows, { page, limit, includeCatalogOnly = false, cached = undefined } = {}) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const total = safeRows[0]?.total_filtered_domains || 0;
  const globalTop10 = Math.max(1, Number(safeRows[0]?.global_top10_slots || 1));
  const top5Share = safeRows[0]?.top5_global_slots !== undefined
    ? Number(safeRows[0].top5_global_slots)
    : safeRows.slice(0, 5).reduce((acc, r) => acc + Number(r.top10_pins || 0), 0);
  const top5MonopolyPct = Number(Math.min(100, Math.max(0, (top5Share / globalTop10) * 100)).toFixed(1));

  const payload = {
    overview: {
      total_domains: total,
      top5_monopoly_pct: top5MonopolyPct,
      baby_giants_count: safeRows[0]?.baby_giants_count || 0,
      multi_account_count: safeRows[0]?.multi_account_domains_count || 0,
      avg_pins_per_url: Number(safeRows[0]?.global_avg_multiplier || 1.0)
    },
    domains: safeRows.map((r) => ({
      domain: r.domain,
      total_pins: Number(r.total_pins || 0),
      ...(includeCatalogOnly ? { catalog_only_pins: Number(r.catalog_only_pins || 0) } : {}),
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
    missing_age_domains: safeRows
      .filter((r) => (!r.age_status || r.age_status === 'unchecked') && r.domain && String(r.domain).trim().toLowerCase() !== 'uploaded by user')
      .map((r) => r.domain)
      .slice(0, 8),
    missing_ad_domains: safeRows
      .filter((r) => (!r.ad_network || r.ad_network === 'unchecked') && r.domain && String(r.domain).trim().toLowerCase() !== 'uploaded by user')
      .map((r) => r.domain)
      .slice(0, 10),
    page,
    limit,
    total,
    total_pages: Math.max(1, Math.ceil(total / limit))
  };

  if (cached !== undefined) {
    payload.cached = cached;
  }
  return payload;
}

/**
 * Top-Level Executive KPIs + Paginated Domain Leaderboard (on-the-fly CTE aggregation)
 */
export async function listDomainsIntelligence(sql, {
  search = '',
  folderId = null,
  keywordId = null,
  pillar = 'all',
  preset = 'all',
  adNetwork = 'all',
  ageFilter = 'all',
  rankFilter = 'all',
  savesFilter = 'all',
  sizeFilter = 'all',
  logicMode = 'and',
  minPins = 1,
  sortBy = 'visibility',
  page = 1,
  limit = 50,
  allowedDomains = null
} = {}) {
  const fId = folderId && !isNaN(Number(folderId)) ? Number(folderId) : null;
  const kId = keywordId && !isNaN(Number(keywordId)) ? Number(keywordId) : null;
  const minP = Math.max(1, parseInt(minPins, 10) || 1);
  const pNum = Math.max(1, parseInt(page, 10) || 1);
  const allowedCount = Array.isArray(allowedDomains) ? allowedDomains.filter(Boolean).length : 0;
  const maxLim = allowedCount > 0 ? Math.min(20000, Math.max(2000, allowedCount)) : 2000;
  const lim = Math.max(1, Math.min(parseInt(limit, 10) || 50, maxLim));
  const off = (pNum - 1) * lim;
  const searchPattern = search ? `%${escapeSqlLike(search)}%` : null;
  const referenceTime = new Date(Math.floor(Date.now() / 3600000) * 3600000).toISOString();

  const aggCtes = buildDomainAggregationCtes({
    fId,
    kId,
    pillar,
    searchPattern,
    minPins: minP,
    preset,
    adNetwork,
    allowedDomains,
    referenceTime,
    forRollupRefresh: false
  });

  const filterAndSort = buildModularFilterAndSortSql({
    sourceCteName: 'enriched',
    ageFilter,
    rankFilter,
    savesFilter,
    sizeFilter,
    logicMode,
    sortBy,
    limit: lim,
    offset: off
  });

  const rows = await execComposedSql(sql, ['', ', ', ''], aggCtes, filterAndSort);
  return formatDomainsLeaderboardResponse(rows, { page: pNum, limit: lim, includeCatalogOnly: true });
}

/**
 * Refreshes or populates the domain_intelligence_rollup cache table using the shared aggregation CTEs.
 */
export async function refreshDomainIntelligenceRollup(sql) {
  if (rollupRefreshInflight) {
    return rollupRefreshInflight;
  }

  const runRefresh = async () => {
    const referenceTime = new Date(Math.floor(Date.now() / 3600000) * 3600000).toISOString();
    try {
      const aggCtes = buildDomainAggregationCtes({
        referenceTime,
        forRollupRefresh: true
      });

      const upsertTail = sqlFrag`
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
        e.visibility_score, e.total_saves, ROUND(e.avg_saves)::bigint, e.total_repins, e.avg_velocity,
        e.accounts_count, to_jsonb(COALESCE(e.sample_accounts, ARRAY[]::text[])), e.domain_created_at, e.domain_expires_at,
        e.age_days, e.age_years, COALESCE(e.age_status, 'unchecked'), e.ad_network, e.ad_manager_domain, e.primary_pub_id,
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

      // Use a scoped statement_timeout via set_config(..., true) inside sql.begin()
      // (PostgreSQL utility statements like `SET LOCAL` reject bind parameters `$1`)
      // so heavy rollup upserts do not abort under Fastify's default 15s statement_timeout.
      const runScoped = async (timeoutMs, fn) => {
        if (typeof sql.begin === 'function') {
          return await sql.begin(async (tx) => {
            await tx`SELECT set_config('statement_timeout', ${String(timeoutMs)}, true);`;
            return await fn(tx);
          });
        }
        return await fn(sql);
      };

      const res = await runScoped(120000, (execSql) => execComposedSql(execSql, ['', ' ', ''], aggCtes, upsertTail));

      // Prune stale zero-pin ghost domains absent from universal_master_pins and folder_pinned_domains
      await runScoped(60000, (execSql) => execSql`
      DELETE FROM domain_intelligence_rollup dir
      WHERE NOT EXISTS (
        SELECT 1 FROM universal_master_pins ump
        WHERE ump.clean_domain = dir.domain
           OR (dir.domain = 'Uploaded by user' AND LOWER(TRIM(COALESCE(ump.clean_domain, ''))) IN ('', 'uploaded by user', 'uploaded-by-user', 'organic'))
      )
      AND NOT EXISTS (
        SELECT 1 FROM folder_pinned_domains fpd
        WHERE fpd.domain = dir.domain
      );
    `).catch((pruneErr) => {
        console.warn('[refreshDomainIntelligenceRollup] Ghost domain prune warning:', pruneErr?.message || pruneErr);
      });

      return { success: true, count: res?.length || 0 };
    } catch (err) {
      const safeMsg = redactSecrets(err?.message || 'Rollup refresh failed');
      console.warn(`[refreshDomainIntelligenceRollup] Error refreshing rollup:`, safeMsg);
      return { success: false, error: safeMsg };
    }
  };

  rollupRefreshInflight = runRefresh().finally(() => {
    rollupRefreshInflight = null;
  });
  return rollupRefreshInflight;
}

/**
 * Synchronizes a single domain's aggregated metrics directly into domain_intelligence_rollup.
 * Designed for micro-sync on dossier request (<5ms) without full table re-aggregation.
 *
 * // [INVARIANT: SINGLE-DOMAIN-SYNC-O1]
 */
export async function syncSingleDomainRollup(sql, cleanDomain, dossierData, options = {}) {
  if (!sql || !cleanDomain || !dossierData) return null;
  if (options?.folderId || dossierData?.folderId || options?.keywordId || dossierData?.keywordId) return null;

  const isOrganicVault = String(cleanDomain).trim().toLowerCase() === 'uploaded by user' || String(cleanDomain).trim().toLowerCase() === 'uploaded-by-user' || String(cleanDomain).trim().toLowerCase() === 'organic';
  const canonicalDomain = isOrganicVault ? 'Uploaded by user' : cleanDomain;

  const ageInfo = dossierData.age_info || {};
  const adInfo = dossierData.ad_info || {};
  const summary = dossierData.summary || {};

  const totalPins = Math.max(0, Number(summary.total_pins || 0));
  const totalSaves = Math.max(0, Number(summary.total_saves || 0));
  const accountsCount = Math.max(0, Number(summary.accounts_count || 0));
  const uniqueUrls = isOrganicVault ? 0 : Math.max(1, Number(summary.unique_urls || 1));
  const pinsPerUrl = Number(summary.pins_per_url || 1);
  const activeSerpPins = Math.max(0, Number(summary.active_serp_pins ?? summary.active_pins_count ?? 0));
  const displacedPins = Math.max(0, Number(summary.displaced_total_count ?? summary.displaced_pins_count ?? 0));
  const top3Pins = Math.max(0, Number(summary.top3_pins || 0));
  const top10Pins = Math.max(0, Number(summary.top10_pins || 0));
  const rank1150Pins = Math.max(0, Number(summary.rank_11_50_pins || 0));
  const bestRank = summary.best_rank != null ? Number(summary.best_rank) : null;
  const avgRank = summary.avg_rank != null ? Number(summary.avg_rank) : null;
  const visibilityScore = Number(summary.visibility_score || 0);
  const avgVelocity = Number(summary.avg_velocity || 0);

  const rawAgeStatus = isOrganicVault
    ? 'organic_unlinked'
    : (ageInfo.age_status || ageInfo.lookup_status || 'unchecked');
  const normalizedAgeStatus = rawAgeStatus === 'pending' ? 'unchecked' : rawAgeStatus;

  try {
    const [existing] = await sql`
      SELECT domain FROM domain_intelligence_rollup WHERE domain = ${canonicalDomain} LIMIT 1;
    `;
    if (!existing) {
      const [pinCheck] = await sql`
        SELECT 1 FROM universal_master_pins
        WHERE (clean_domain = ${canonicalDomain} OR (${isOrganicVault}::boolean AND LOWER(TRIM(COALESCE(clean_domain, ''))) IN ('', 'uploaded by user', 'uploaded-by-user', 'organic')))
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
        ${canonicalDomain}, ${totalPins}, ${totalSaves}, ${accountsCount}, ${uniqueUrls}, ${pinsPerUrl},
        ${activeSerpPins}, ${displacedPins}, ${top3Pins}, ${top10Pins}, ${rank1150Pins},
        ${bestRank}, ${avgRank}, ${visibilityScore}, ${avgVelocity},
        ${adInfo.current_ad_network || adInfo.ad_network || 'unchecked'},
        ${adInfo.ad_manager_domain || null},
        ${adInfo.primary_pub_id || null},
        ${adInfo.ads_txt_status || 'pending'},
        ${ageInfo.age_days != null ? Number(ageInfo.age_days) : null},
        ${ageInfo.age_years != null ? Number(ageInfo.age_years) : null},
        ${normalizedAgeStatus},
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
          WHEN EXCLUDED.age_status NOT IN ('unchecked', 'pending', '')
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
  const allowBackgroundRefresh = options.allowBackgroundRefresh !== false;

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
      const minPins = Math.max(1, parseInt(options.minPins, 10) || 1);
      const sortBy = options.sortBy || 'visibility';
      const page = Math.max(1, parseInt(options.page, 10) || 1);
      const normalizedAllowed = Array.isArray(options.allowedDomains)
        ? options.allowedDomains.map((d) => String(d || '').trim().toLowerCase().replace(/^www\./, '')).filter(Boolean)
        : [];
      const maxLim = normalizedAllowed.length > 0 ? Math.min(20000, Math.max(2000, normalizedAllowed.length)) : 2000;
      const limit = Math.max(1, Math.min(parseInt(options.limit, 10) || 50, maxLim));
      const offset = (page - 1) * limit;
      const searchPattern = search ? `%${escapeSqlLike(search.toLowerCase())}%` : null;
      const allowedDomainsFilterSql = normalizedAllowed.length > 0
        ? sqlFrag`AND r.domain = ANY(${normalizedAllowed}::text[])`
        : sqlFrag``;

      const rollupSrcSql = sqlFrag`
        WITH rollup_src AS (
          SELECT *
          FROM domain_intelligence_rollup r
          WHERE r.total_pins >= ${minPins}
            AND (${searchPattern}::text IS NULL OR LOWER(r.domain) LIKE ${searchPattern} ESCAPE '\\')
            AND (
              ${preset} = 'all'
              OR (${preset} = 'baby_giants' AND r.age_years IS NOT NULL AND r.age_years <= 2.0 AND (r.top10_pins >= 1 OR r.total_saves >= 1000))
              OR (${preset} = 'easy_arbitrage' AND r.total_pins <= 25 AND (r.top10_pins >= 1 OR r.avg_velocity >= 5))
              OR (${preset} = 'bleeding_giants' AND r.displaced_pins >= 3 AND r.decay_rate_pct >= 30.0)
              OR (${preset} = 'high_multipliers' AND r.pins_per_url >= 3.0)
              OR (${preset} = 'multi_account' AND r.accounts_count >= 2)
              OR (${preset} = 'decaying_monopoly' AND r.top10_pins >= 1 AND r.total_saves >= 3000 AND (r.avg_velocity <= 3.0 OR r.decay_rate_pct >= 25.0))
              OR (${preset} = 'cluster_push_signal' AND (
                r.age_years IS NOT NULL AND r.age_years <= 2.0
                AND (
                  r.accounts_count >= 2
                  OR EXISTS (
                    SELECT 1
                    FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(r.sample_accounts) = 'array' THEN r.sample_accounts ELSE '[]'::jsonb END) AS sa(uname)
                    JOIN competitor_profiles cp ON LOWER(cp.username) = LOWER(sa.uname)
                    WHERE COALESCE(cp.monthly_reach, 0) >= 100000
                       OR COALESCE(cp.profile_views, 0) >= 100000
                  )
                )
              ))
            )
            AND (
              ${adNetwork} = 'all'
              OR (${adNetwork} = 'switched' AND r.ad_switched_at IS NOT NULL)
              OR (${adNetwork} = 'unchecked' AND (r.ad_network IS NULL OR r.ad_network = 'unchecked'))
              OR r.ad_network = ${adNetwork}
            )
            ${allowedDomainsFilterSql}
        )
      `;

      const filterAndSort = buildModularFilterAndSortSql({
        sourceCteName: 'rollup_src',
        ageFilter,
        rankFilter,
        savesFilter,
        sizeFilter,
        logicMode,
        sortBy,
        limit,
        offset
      });

      const rows = await execComposedSql(sql, ['', ', ', ''], rollupSrcSql, filterAndSort);

      if (rows && rows.length > 0) {
        return formatDomainsLeaderboardResponse(rows, { page, limit, includeCatalogOnly: false, cached: true });
      }

      // [INVARIANT: ZERO-ROW-FALLBACK-GUARD] Guard against unpopulated table without triggering storm on empty searches
      const [countCheck] = await sql`SELECT 1 FROM domain_intelligence_rollup LIMIT 1;`;
      if (!countCheck) {
        if (allowBackgroundRefresh) {
          safeWaitUntil(
            () => refreshDomainIntelligenceRollup(sql),
            options.ctx || null,
            'refresh_domain_intelligence_rollup_empty'
          );
        }
        return await listDomainsIntelligence(sql, options);
      }

      return formatDomainsLeaderboardResponse([], { page, limit, includeCatalogOnly: false, cached: true });
    } catch (fastErr) {
      console.warn(`[listDomainsIntelligenceFast] Rollup query fallback:`, fastErr.message);
      if (allowBackgroundRefresh) {
        safeWaitUntil(
          () => refreshDomainIntelligenceRollup(sql),
          options.ctx || null,
          'refresh_domain_intelligence_rollup_fallback'
        );
      }
    }
  }

  return await listDomainsIntelligence(sql, options);
}
