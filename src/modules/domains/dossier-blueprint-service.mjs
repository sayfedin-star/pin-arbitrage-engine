/**
 * src/modules/domains/dossier-blueprint-service.mjs
 *
 * Deep Domain Forensic Dossier, Publisher Network Sybil/PBN Detection,
 * Marketing Angle Classifier & One-Click Arbitrage Attack Blueprint Generator.
 */

import { normalizeCleanDomain } from './domain-constants.mjs';
import { fetchAndCacheDomainAdNetwork, normalizeMonetizationRecord } from './ad-network-service.mjs';
import { fetchAndCacheDomainAge } from './whois-age-service.mjs';

/**
 * Computes Publisher Network Sybil Index & PBN detection metrics.
 * Combines Herfindahl-Hirschman Index (HHI), Effective Creator Count, Bipartite Slug Overlap,
 * Creative Multiplication Ratio, Sybil Risk Score, and Classification Tier.
 * 
 * @param {Object} params
 * @param {Array} params.allPins
 * @param {Map|Array} params.accountsMap
 * @param {Map|Array} params.urlGroupsMap
 * @param {Map|Array} params.crossMap
 * @param {string} params.cleanDomain
 * @returns {Object} Sybil PBN metrics
 */
export function computeSybilPbnMetrics({ allPins = [], accountsMap = new Map(), urlGroupsMap = new Map(), crossMap = new Map() } = {}) {
  const accounts = accountsMap instanceof Map ? Array.from(accountsMap.values()) : (Array.isArray(accountsMap) ? accountsMap : []);
  const urlGroups = urlGroupsMap instanceof Map ? Array.from(urlGroupsMap.values()) : (Array.isArray(urlGroupsMap) ? urlGroupsMap : []);
  const totalDomainPins = Math.max(1, allPins.length);
  const totalMoneySlugs = Math.max(1, urlGroups.length);

  // 1. Herfindahl-Hirschman Index (HHI)
  let sumSquaredShare = 0;
  for (const acc of accounts) {
    const share = (acc.pins_count || 0) / totalDomainPins;
    sumSquaredShare += (share * share);
  }
  const hhi_creator_concentration = accounts.length > 0 ? Number(Math.min(1, Math.max(0, sumSquaredShare)).toFixed(4)) : 1;
  
  // 2. Effective Creator Count (1 / HHI)
  const effective_creator_count = hhi_creator_concentration > 0 ? Number((1 / hhi_creator_concentration).toFixed(2)) : 1.0;

  // 3. Bipartite Slug Overlap: proportion of money slugs pinned by >= 2 distinct creators
  let multiCreatorSlugsCount = 0;
  for (const u of urlGroups) {
    const pins = u.pins || [];
    const creatorsOnSlug = new Set(pins.map(p => p.creator_username).filter(Boolean));
    if (creatorsOnSlug.size > 1) multiCreatorSlugsCount++;
  }
  const bipartite_slug_overlap = Number((multiCreatorSlugsCount / totalMoneySlugs).toFixed(4));

  // 4. Creative Multiplication Ratio: unique visual images / distinct money slugs
  const uniqueCreatives = new Set(allPins.map(p => p.image_signature || p.image_url || p.pin_id).filter(Boolean)).size;
  const creative_multiplication_ratio = Number((uniqueCreatives / totalMoneySlugs).toFixed(2));

  // 5. Cross-domain footprints / sister domains count
  let sisterDomainsCount = 0;
  if (crossMap instanceof Map) {
    const allSister = new Set();
    for (const list of crossMap.values()) {
      if (Array.isArray(list)) {
        for (const item of list) {
          if (item?.domain) allSister.add(item.domain);
        }
      }
    }
    sisterDomainsCount = allSister.size;
  }

  // 6. Sybil Risk Score (0..100)
  let sybil_risk_score = 0;
  if (accounts.length > 1) {
    const decentralizationScore = 1 - hhi_creator_concentration;
    const hhiComponent = decentralizationScore * 35;
    const overlapComponent = bipartite_slug_overlap * 35;
    const sisterComponent = Math.min(20, sisterDomainsCount * 5);
    const creativeComponent = Math.min(10, Math.max(0, (creative_multiplication_ratio - 1) * 2));
    sybil_risk_score = Math.min(100, Math.max(0, Math.round(hhiComponent + overlapComponent + sisterComponent + creativeComponent)));
  }

  // 7. Sybil Tier: ORGANIC_BRAND / AMPLIFIED_CURATION / COORDINATED_SYBIL_RING
  let sybil_tier = 'ORGANIC_BRAND';
  if (sybil_risk_score >= 65) {
    sybil_tier = 'COORDINATED_SYBIL_RING';
  } else if (sybil_risk_score >= 30) {
    sybil_tier = 'AMPLIFIED_CURATION';
  }

  return {
    hhi_creator_concentration,
    effective_creator_count,
    bipartite_slug_overlap,
    creative_multiplication_ratio,
    sybil_risk_score,
    sybil_tier,
    multi_creator_slugs_count: multiCreatorSlugsCount,
    total_money_slugs: totalMoneySlugs,
    sister_domains_count: sisterDomainsCount
  };
}

/**
 * Detects marketing angle and search intent based on title, keywords, and visual annotations
 */
export function detectMarketingAngle({ title = '', keywords = [], annotations = [] } = {}) {
  // [INVARIANT: DEFENSIVE-ANNOTATIONS-UNPACKING] Safely unpack rich objects { name: '...' } into clean string tags
  const normAnnotations = (Array.isArray(annotations) ? annotations : [])
    .map(a => typeof a === 'string' ? a.trim() : (a?.name || a?.label || a?.tag || '').trim())
    .filter(Boolean);
  const combined = `${title || ''} ${(Array.isArray(keywords) ? keywords.join(' ') : '')} ${normAnnotations.join(' ')}`.toLowerCase();

  if (/\b(keto|low carb|healthy|diet|clean eating|gluten[- ]free|gf|whole30|paleo|sugar free|macro|calorie|slimming)\b/i.test(combined)) {
    return {
      angle: 'Diet & Keto / Healthy',
      intent_tag: 'Diet / Low-Carb',
      badge_color: 'emerald'
    };
  }
  if (/\b(easy|quick|minute|min|simple|fast|lazy|instant|speedy|30 min|15 min|20 min|10 min|5 min)\b/i.test(combined)) {
    return {
      angle: 'Quick & Easy / 15-Min',
      intent_tag: 'Speed & Simplicity',
      badge_color: 'amber'
    };
  }
  if (/\b(family|kid|children|budget|cheap|crockpot|slow cooker|casserole|sheet pan|freezer|meal prep|weeknight|bulk|one pot|frugal)\b/i.test(combined)) {
    return {
      angle: 'Family & Budget Meal',
      intent_tag: 'Budget & Family',
      badge_color: 'sky'
    };
  }
  if (/\b(melt|cheesy|cheese|garlic|butter|bacon|cream|creamy|smothered|baked|restaurant|crispy|parmesan|steakhouse|sauce|skillet|gourmet)\b/i.test(combined)) {
    return {
      angle: 'Gourmet Skillet & Comfort',
      intent_tag: 'Comfort & Indulgence',
      badge_color: 'rose'
    };
  }
  if (/\b(party|potluck|holiday|anniversary|sunday dinner|crowd|game day|bbq|summer|thanksgiving|christmas|easter)\b/i.test(combined)) {
    return {
      angle: 'Entertaining & Crowd Pleaser',
      intent_tag: 'Entertaining / Party',
      badge_color: 'purple'
    };
  }

  return {
    angle: 'Classic & Evergreen Recipe',
    intent_tag: 'Evergreen Classic',
    badge_color: 'slate'
  };
}

/**
 * Unpacks raw visual_annotations (JSON string or array of strings/objects) into clean string tags.
 */
function unpackVisualAnnotations(rawAnnotations) {
  let parsed = [];
  if (Array.isArray(rawAnnotations)) {
    parsed = rawAnnotations;
  } else if (typeof rawAnnotations === 'string') {
    try { parsed = JSON.parse(rawAnnotations); } catch (_) {}
  }
  return (Array.isArray(parsed) ? parsed : [])
    .map(item => {
      if (typeof item === 'string') return item.trim();
      if (item && typeof item === 'object') return (item.name || item.tag || item.label || item.display_label || '').trim();
      return '';
    })
    .filter(t => Boolean(t) && t !== '[object Object]');
}

function computePinAgeDays(dateVal) {
  if (!dateVal) return null;
  const t = new Date(dateVal).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86400000));
}

/**
 * Single-query PK lookup on domain_intelligence_rollup when fastPath=true.
 * Combines WHOIS age cache + Ads.txt monetization cache into 1 DB roundtrip.
 */
async function fetchDomainRollupFastPath(sql, cleanDomain) {
  const referenceTime = new Date(Math.floor(Date.now() / 3600000) * 3600000).toISOString();
  const buildPendingAge = () => ({
    domain: cleanDomain,
    registered_at: null,
    updated_at_whois: null,
    expires_at: null,
    lookup_source: null,
    lookup_status: 'pending',
    checked_at: null,
    age_days: null,
    age_years: null,
    needs_enrichment: true
  });
  const buildPendingAd = (existingRow = null) => {
    const normalized = normalizeMonetizationRecord(existingRow);
    const adNet = existingRow?.current_ad_network || existingRow?.ad_network || 'unchecked';
    const adsCheckedAt = existingRow?.ads_checked_at || existingRow?.checked_at || null;
    const switchedAt = existingRow?.switched_at || existingRow?.ad_switched_at || null;
    return {
      domain: cleanDomain,
      current_ad_network: adNet,
      ad_network: adNet,
      ad_manager_domain: existingRow?.ad_manager_domain || null,
      primary_pub_id: existingRow?.primary_pub_id || null,
      previous_ad_network: existingRow?.previous_ad_network || null,
      switched_at: switchedAt,
      ad_switched_at: switchedAt,
      network_history: normalized?.network_history || [],
      ad_network_history: normalized?.ad_network_history || [],
      ads_txt_status: 'pending',
      raw_header_snippet: existingRow?.raw_header_snippet || null,
      checked_at: adsCheckedAt,
      ads_checked_at: adsCheckedAt,
      needs_enrichment: true
    };
  };

  try {
    const [row] = await sql`
      SELECT
        domain,
        domain_created_at AS registered_at,
        updated_at_whois,
        domain_expires_at AS expires_at,
        lookup_source,
        COALESCE(NULLIF(lookup_status, 'pending'), NULLIF(age_status, 'unchecked'), lookup_status) AS lookup_status,
        age_status,
        whois_checked_at,
        updated_at,
        CASE
          WHEN domain_created_at IS NOT NULL THEN GREATEST(1, FLOOR(EXTRACT(EPOCH FROM (${referenceTime}::timestamptz - domain_created_at)) / 86400))::int
          ELSE age_days
        END AS age_days,
        CASE
          WHEN domain_created_at IS NOT NULL THEN ROUND((EXTRACT(EPOCH FROM (${referenceTime}::timestamptz - domain_created_at)) / 31557600)::numeric, 2)
          ELSE age_years
        END AS age_years,
        COALESCE(ad_network, 'unchecked') AS current_ad_network,
        ad_network,
        ad_manager_domain,
        primary_pub_id,
        previous_ad_network,
        ad_switched_at AS switched_at,
        ad_switched_at,
        ad_network_history AS network_history,
        ad_network_history,
        ads_txt_status,
        raw_header_snippet,
        ads_checked_at AS checked_at,
        ads_checked_at
      FROM domain_intelligence_rollup
      WHERE domain = ${cleanDomain}
      LIMIT 1;
    `;

    if (!row) {
      return { ageInfo: buildPendingAge(), adInfo: buildPendingAd(null) };
    }

    const whoisCheckedAt = row.whois_checked_at || row.updated_at;
    const isFailedFresh = (row.lookup_status === 'failed' || row.age_status === 'failed') &&
      whoisCheckedAt &&
      (Date.now() - new Date(whoisCheckedAt).getTime()) < 3 * 86400000;
    const hasResolvedAge = row.lookup_status === 'resolved' || row.age_status === 'resolved' || isFailedFresh;

    const ageInfo = hasResolvedAge
      ? {
          domain: row.domain || cleanDomain,
          registered_at: row.registered_at || null,
          updated_at_whois: row.updated_at_whois || null,
          expires_at: row.expires_at || null,
          lookup_source: row.lookup_source || null,
          lookup_status: row.lookup_status || row.age_status || 'resolved',
          age_status: row.age_status || row.lookup_status || 'resolved',
          checked_at: row.whois_checked_at || null,
          age_days: row.age_days != null ? Number(row.age_days) : null,
          age_years: row.age_years != null ? Number(row.age_years) : null
        }
      : buildPendingAge();

    const adsCheckedAt = row.ads_checked_at || row.checked_at || null;
    const currentAdNet = row.current_ad_network || row.ad_network || 'unchecked';
    const isAdFresh =
      currentAdNet !== 'unchecked' &&
      adsCheckedAt &&
      (Date.now() - new Date(adsCheckedAt).getTime()) < 14 * 86400000;

    const adInfo = isAdFresh
      ? normalizeMonetizationRecord({
          domain: row.domain || cleanDomain,
          current_ad_network: currentAdNet,
          ad_network: row.ad_network || currentAdNet,
          ad_manager_domain: row.ad_manager_domain,
          primary_pub_id: row.primary_pub_id,
          previous_ad_network: row.previous_ad_network,
          switched_at: row.switched_at,
          ad_switched_at: row.ad_switched_at,
          network_history: row.network_history,
          ad_network_history: row.ad_network_history,
          ads_txt_status: row.ads_txt_status,
          raw_header_snippet: row.raw_header_snippet,
          checked_at: adsCheckedAt,
          ads_checked_at: adsCheckedAt
        })
      : buildPendingAd(row);

    return { ageInfo, adInfo };
  } catch (err) {
    console.warn(`[getDomainDeepDossier] Fast-path rollup read failed for ${cleanDomain}:`, err?.message || err);
    return { ageInfo: buildPendingAge(), adInfo: buildPendingAd(null) };
  }
}

/**
 * Deep Forensic Dossier for a Specific Domain:
 * 1. Live WHOIS / Age check via fetchAndCacheDomainAge & Ads.txt Monetization Profile
 * 2. All Ranked Pins & SERP Positions across Keywords with Vulnerability Radar
 * 3. Top Money URLs with Multi-Angle Creative Multiplier Breakdown
 * 4. Keyword Monopoly Matrix (Carpet Bombing: URL Flooding vs Topic Cluster)
 * 5. P2P Sybil Network (Primary Brand vs Satellite Creators & Cross-Domain Footprint)
 * 6. Reverse-Engineered Visual DNA (Computer Vision Annotations Cloud & Palette)
 */
export async function getDomainDeepDossier(sql, rawDomain, { folderId = null, keywordId = null, fastPath = true, displacedLimit = 30 } = {}) {
  const isOrganicVault = typeof rawDomain === 'string' && (
    rawDomain.trim().toLowerCase() === 'uploaded by user' || 
    rawDomain.trim().toLowerCase() === 'uploaded-by-user' ||
    rawDomain.trim().toLowerCase() === 'organic'
  );
  const cleanDomain = isOrganicVault ? 'Uploaded by user' : normalizeCleanDomain(rawDomain);
  if (!cleanDomain) throw new Error('Valid domain is required.');

  const fId = folderId && !isNaN(Number(folderId)) ? Number(folderId) : null;
  const kId = keywordId && !isNaN(Number(keywordId)) ? Number(keywordId) : null;
  const safeDisplacedLimit = Math.max(30, Math.min(500, Number(displacedLimit) || 30));

  let degraded = false;
  // [INVARIANT: DEFENSIVE-QUERY-TIMEOUT-GUARD]
  // Catch blocks must only handle genuine network timeouts/aborts per Invariant 4, never swallow SQL syntax or schema errors
  const guardQueryTimeout = (err, queryName = 'query') => {
    const isTimeout = err?.name === 'AbortError' || err?.code === 'ETIMEDOUT' || err?.message?.includes('timeout');
    if (isTimeout) {
      degraded = true;
      console.warn(`[getDomainDeepDossier] Query ${queryName} timed out, falling back to empty set:`, err.message);
      return [];
    }
    throw err;
  };

  const organicAgeStub = {
    domain: 'Uploaded by user',
    age_days: null,
    age_years: null,
    age_status: 'organic_unlinked',
    lookup_status: 'organic_vault'
  };
  const organicAdStub = {
    domain: 'Uploaded by user',
    current_ad_network: 'unmonetized',
    ad_network: 'unmonetized',
    ad_network_history: [],
    ads_txt_status: 'organic_unlinked'
  };

  const rollupPromise = isOrganicVault
    ? Promise.resolve({ ageInfo: organicAgeStub, adInfo: organicAdStub })
    : (fastPath
        ? fetchDomainRollupFastPath(sql, cleanDomain)
        : Promise.all([
            fetchAndCacheDomainAge(sql, cleanDomain, { fastPath: false }),
            fetchAndCacheDomainAdNetwork(sql, cleanDomain, { fastPath: false }).catch((err) => {
              console.warn(`[getDomainDeepDossier] Ad-network lookup failed for ${cleanDomain}:`, err?.message || err);
              return null;
            })
          ]).then(([ageInfo, adInfo]) => ({ ageInfo, adInfo })));

  const [rollupBundle, serpPins, umpPins] = await Promise.all([
    rollupPromise,
    sql`
      SELECT
        ksp.pin_id,
        ksp.keyword_id,
        tk.keyword AS keyword_name,
        ksp.rank_position,
        ksp.prev_rank_position,
        ksp.last_known_rank,
        ksp.is_displaced,
        ksp.displaced_date,
        ksp.first_seen_at,
        ksp.vacuum_opportunity_score,
        ump.title,
        ump.destination_url,
        ump.image_url,
        COALESCE(ump.creator_username, '') AS creator_username,
        ump.board_name,
        ump.save_count::bigint AS saves,
        ump.repin_count::bigint AS repins,
        ump.comment_count::int AS comments,
        ump.share_count::int AS shares,
        ump.reaction_count::int AS reactions,
        ump.url_global_saves::bigint AS url_global_saves,
        ump.daily_save_velocity::numeric AS velocity,
        ump.daily_repin_velocity::numeric AS repin_velocity,
        ump.delta_saves_24h::bigint AS delta_saves_24h,
        ump.delta_repins_24h::bigint AS delta_repins_24h,
        ump.gains_5d::bigint AS gains_5d,
        ump.gains_7d::bigint AS gains_7d,
        ump.gains_10d::bigint AS gains_10d,
        ump.gains_15d::bigint AS gains_15d,
        ump.dominant_color,
        COALESCE(ump.visual_annotations, '[]'::jsonb) AS visual_annotations,
        ump.created_at_pinterest,
        ump.first_discovered_at,
        ump.creation_method,
        ump.is_video,
        ump.alt_text,
        COALESCE(ump.metadata->>'aspect_ratio', '2:3') AS aspect_ratio
      FROM keyword_serp_positions ksp
      JOIN universal_master_pins ump ON ump.pin_id = ksp.pin_id
      LEFT JOIN tracked_keywords tk ON tk.id = ksp.keyword_id
      WHERE (ump.clean_domain = ${cleanDomain} OR (${isOrganicVault}::boolean AND (ump.clean_domain IS NULL OR LOWER(TRIM(ump.clean_domain)) IN ('', 'uploaded by user', 'uploaded-by-user', 'organic'))))
        AND (${fId}::int IS NULL OR ksp.keyword_id IN (SELECT keyword_id FROM keyword_folder_items WHERE folder_id = ${fId}))
        AND (${kId}::int IS NULL OR ksp.keyword_id = ${kId})
      ORDER BY ksp.is_displaced ASC, ksp.rank_position ASC NULLS LAST, ump.save_count DESC NULLS LAST
      LIMIT 5000;
    `.catch(err => guardQueryTimeout(err, 'keyword_serp_positions')),
    (fId === null && kId === null)
      ? sql`
          SELECT
            ump.pin_id,
            ump.title,
            ump.destination_url,
            ump.image_url,
            COALESCE(ump.creator_username, '') AS creator_username,
            ump.board_name,
            ump.save_count::bigint AS saves,
            ump.repin_count::bigint AS repins,
            ump.comment_count::int AS comments,
            ump.share_count::int AS shares,
            ump.reaction_count::int AS reactions,
            ump.url_global_saves::bigint AS url_global_saves,
            ump.daily_save_velocity::numeric AS velocity,
            ump.daily_repin_velocity::numeric AS repin_velocity,
            ump.delta_saves_24h::bigint AS delta_saves_24h,
            ump.delta_repins_24h::bigint AS delta_repins_24h,
            ump.gains_5d::bigint AS gains_5d,
            ump.gains_7d::bigint AS gains_7d,
            ump.gains_10d::bigint AS gains_10d,
            ump.gains_15d::bigint AS gains_15d,
            ump.dominant_color,
            COALESCE(ump.visual_annotations, '[]'::jsonb) AS visual_annotations,
            ump.created_at_pinterest,
            ump.first_discovered_at,
            ump.creation_method,
            ump.is_video,
            ump.alt_text,
            COALESCE(ump.metadata->>'aspect_ratio', '2:3') AS aspect_ratio
          FROM universal_master_pins ump
          WHERE (ump.clean_domain = ${cleanDomain} OR (${isOrganicVault}::boolean AND (ump.clean_domain IS NULL OR LOWER(TRIM(ump.clean_domain)) IN ('', 'uploaded by user', 'uploaded-by-user', 'organic'))))
          ORDER BY ump.save_count DESC NULLS LAST
          LIMIT 5000;
        `.catch(err => guardQueryTimeout(err, 'universal_master_pins'))
      : (fId !== null && kId === null)
        ? sql`
            SELECT DISTINCT ON (ump.pin_id)
              ump.pin_id,
              ump.title,
              ump.destination_url,
              ump.image_url,
              COALESCE(ump.creator_username, '') AS creator_username,
              ump.board_name,
              ump.save_count::bigint AS saves,
              ump.repin_count::bigint AS repins,
              ump.comment_count::int AS comments,
              ump.share_count::int AS shares,
              ump.reaction_count::int AS reactions,
              ump.url_global_saves::bigint AS url_global_saves,
              ump.daily_save_velocity::numeric AS velocity,
              ump.daily_repin_velocity::numeric AS repin_velocity,
              ump.delta_saves_24h::bigint AS delta_saves_24h,
              ump.delta_repins_24h::bigint AS delta_repins_24h,
              ump.gains_5d::bigint AS gains_5d,
              ump.gains_7d::bigint AS gains_7d,
              ump.gains_10d::bigint AS gains_10d,
              ump.gains_15d::bigint AS gains_15d,
              ump.dominant_color,
              COALESCE(ump.visual_annotations, '[]'::jsonb) AS visual_annotations,
              ump.created_at_pinterest,
              ump.first_discovered_at,
              ump.creation_method,
              ump.is_video,
              ump.alt_text,
              COALESCE(ump.metadata->>'aspect_ratio', '2:3') AS aspect_ratio
            FROM campaign_tracked_pins ctp
            JOIN universal_master_pins ump ON ump.pin_id = ctp.pin_id
            WHERE ctp.folder_id = ${fId}
              AND ctp.is_active = TRUE
              AND (ump.clean_domain = ${cleanDomain} OR (${isOrganicVault}::boolean AND (ump.clean_domain IS NULL OR LOWER(TRIM(ump.clean_domain)) IN ('', 'uploaded by user', 'uploaded-by-user', 'organic'))))
            ORDER BY ump.pin_id, ump.save_count DESC NULLS LAST
            LIMIT 2000;
          `.catch(err => {
            if (String(err?.code || '') === '42P01') return [];
            return guardQueryTimeout(err, 'campaign_tracked_pins');
          })
        : Promise.resolve([])
  ]);

  const { ageInfo, adInfo } = rollupBundle || {};

  // 1. Consolidate Unique Pins with their SERP Rank Appearances
  const pinsMap = new Map();
  const keywordMatrixMap = new Map();
  const accountsMap = new Map();

  const registerPin = (row, sourcePillar) => {
    const pid = String(row.pin_id || '').trim();
    if (!pid) return;
    const rawUser = String(row.creator_username || '').replace(/^@+/, '').trim();
    const cleanUser = rawUser.toLowerCase();
    const existingPinEntry = pinsMap.get(pid);
    const shouldRegisterAccount = cleanUser && (
      sourcePillar === 'serp' ||
      sourcePillar === 'displaced' ||
      !existingPinEntry ||
      !existingPinEntry.creator_username ||
      existingPinEntry.creator_username === cleanUser
    );
    if (shouldRegisterAccount) {
      if (!accountsMap.has(cleanUser)) {
        accountsMap.set(cleanUser, {
          username: cleanUser,
          pins_count: 0,
          total_saves: 0,
          daily_velocity: 0,
          gains_7d: 0,
          top10_count: 0
        });
      }
    }

    // [INVARIANT: DEFENSIVE-ANNOTATIONS-UNPACKING]
    // Safely unpack rich object annotations (e.g. { name: '...', url: '...' } from Pinterest GraphQL)
    const parsedAnnotations = unpackVisualAnnotations(row.visual_annotations);

    let cleanSlug = '/';
    if (isOrganicVault) {
      cleanSlug = row.board_name ? `/${row.board_name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : '/direct-uploads';
    } else if (row.destination_url) {
      try {
        const u = new URL(row.destination_url.startsWith('http') ? row.destination_url : `https://${row.destination_url}`);
        cleanSlug = (u.pathname.replace(/\/+$/, '') || '/').toLowerCase();
      } catch (_) {}
    }

    const rowAspectRatio = row.aspect_ratio || row.metadata?.aspect_ratio || '2:3';
    const rowCreatedAt = row.created_at_pinterest || null;
    const rowAgeDays = computePinAgeDays(rowCreatedAt);
    const rowUrlGlobalSaves = row.url_global_saves != null && Number(row.url_global_saves) > 0
      ? Number(row.url_global_saves)
      : null;

    if (!pinsMap.has(pid)) {
      pinsMap.set(pid, {
        pin_id: pid,
        title: row.title || `Pin #${pid}`,
        destination_url: row.destination_url || '',
        clean_slug: cleanSlug,
        image_url: row.image_url || '',
        creator_username: cleanUser,
        board_name: row.board_name || '',
        saves: Number(row.saves || 0),
        repins: Number(row.repins || 0),
        comments: Number(row.comments || 0),
        shares: Number(row.shares || 0),
        reactions: Number(row.reactions || 0),
        url_global_saves: rowUrlGlobalSaves,
        velocity: Number(row.velocity || 0),
        repin_velocity: Number(row.repin_velocity || 0),
        delta_saves_24h: Number(row.delta_saves_24h || 0),
        delta_repins_24h: Number(row.delta_repins_24h || 0),
        gains_5d: Number(row.gains_5d || 0),
        gains_7d: Number(row.gains_7d || 0),
        gains_10d: Number(row.gains_10d || 0),
        gains_15d: Number(row.gains_15d || 0),
        dominant_color: row.dominant_color || '#888888',
        visual_annotations: parsedAnnotations,
        aspect_ratio: rowAspectRatio,
        creation_method: row.creation_method || null,
        is_video: Boolean(row.is_video),
        has_alt_text: Boolean(row.alt_text && String(row.alt_text).trim()),
        created_at_pinterest: rowCreatedAt,
        pin_age_days: rowAgeDays,
        first_discovered_at: row.first_discovered_at || null,
        first_seen_at: row.first_seen_at || null,
        best_rank: null,
        best_vault_rank: null,
        is_displaced: false,
        is_vulnerable: false,
        vulnerability_score: 0,
        serp_appearances: [],
        pillars: new Set([sourcePillar])
      });
    } else {
      const existing = pinsMap.get(pid);
      if (sourcePillar === 'master' || sourcePillar === 'serp') {
        if (Number(row.saves || 0) > 0) existing.saves = Number(row.saves);
        if (Number(row.repins || 0) > 0) existing.repins = Number(row.repins);
        if (Number(row.velocity || 0) > 0) existing.velocity = Number(row.velocity);
        if (Number(row.repin_velocity || 0) > 0) existing.repin_velocity = Number(row.repin_velocity);
        if (Number(row.delta_saves_24h || 0) !== 0) existing.delta_saves_24h = Number(row.delta_saves_24h);
        if (Number(row.delta_repins_24h || 0) !== 0) existing.delta_repins_24h = Number(row.delta_repins_24h);
        if (Number(row.gains_5d || 0) !== 0) existing.gains_5d = Number(row.gains_5d);
        if (Number(row.gains_7d || 0) !== 0) existing.gains_7d = Number(row.gains_7d);
        if (Number(row.gains_10d || 0) !== 0) existing.gains_10d = Number(row.gains_10d);
        if (Number(row.gains_15d || 0) !== 0) existing.gains_15d = Number(row.gains_15d);
        if (Number(row.comments || 0) > 0) existing.comments = Number(row.comments);
        if (Number(row.shares || 0) > 0) existing.shares = Number(row.shares);
        if (Number(row.reactions || 0) > 0) existing.reactions = Number(row.reactions);
      } else {
        if (!existing.saves && Number(row.saves || 0) > 0) existing.saves = Number(row.saves);
        if (!existing.repins && Number(row.repins || 0) > 0) existing.repins = Number(row.repins);
        if (!existing.velocity && Number(row.velocity || 0) > 0) existing.velocity = Number(row.velocity);
        if (!existing.gains_7d && Number(row.gains_7d || 0) !== 0) existing.gains_7d = Number(row.gains_7d);
      }
      if (rowUrlGlobalSaves && (!existing.url_global_saves || rowUrlGlobalSaves > existing.url_global_saves)) {
        existing.url_global_saves = rowUrlGlobalSaves;
      }
      if (!existing.title && row.title) existing.title = row.title;
      if (!existing.image_url && row.image_url) existing.image_url = row.image_url;
      if (!existing.creator_username && cleanUser) existing.creator_username = cleanUser;
      if (!existing.creation_method && row.creation_method) existing.creation_method = row.creation_method;
      if (!existing.is_video && row.is_video) existing.is_video = true;
      if (!existing.has_alt_text && row.alt_text && String(row.alt_text).trim()) existing.has_alt_text = true;
      if (!existing.created_at_pinterest && rowCreatedAt) {
        existing.created_at_pinterest = rowCreatedAt;
        existing.pin_age_days = rowAgeDays;
      }
      if (!existing.first_discovered_at && row.first_discovered_at) existing.first_discovered_at = row.first_discovered_at;
      if ((!existing.destination_url || existing.clean_slug === '/') && row.destination_url) {
        existing.destination_url = row.destination_url;
        existing.clean_slug = cleanSlug;
      }
      if (parsedAnnotations.length > 0 && existing.visual_annotations.length === 0) {
        existing.visual_annotations = parsedAnnotations;
      }
      if (row.dominant_color && existing.dominant_color === '#888888') {
        existing.dominant_color = row.dominant_color;
      }
      existing.pillars.add(sourcePillar);
    }

    if ((sourcePillar === 'serp' || sourcePillar === 'displaced') && row.keyword_id) {
      const pEntry = pinsMap.get(pid);
      const activeRank = !row.is_displaced && row.rank_position ? Number(row.rank_position) : null;
      const prevRank = row.prev_rank_position != null ? Number(row.prev_rank_position) : null;
      const lastKnown = row.last_known_rank != null ? Number(row.last_known_rank) : null;
      const rankDelta = (prevRank != null && activeRank != null) ? (prevRank - activeRank) : null;

      if (activeRank !== null && (pEntry.best_rank === null || activeRank < pEntry.best_rank)) {
        pEntry.best_rank = activeRank;
      }
      if (lastKnown !== null && (pEntry.best_vault_rank === null || lastKnown < pEntry.best_vault_rank)) {
        pEntry.best_vault_rank = lastKnown;
      }
      if (row.is_displaced && pEntry.best_rank === null) {
        pEntry.is_displaced = true;
      }
      if (row.first_seen_at) {
        if (!pEntry.first_seen_at || new Date(row.first_seen_at).getTime() < new Date(pEntry.first_seen_at).getTime()) {
          pEntry.first_seen_at = row.first_seen_at;
        }
      }

      // Pillar 5: Freshness Gap & Decaying Monopoly Calculation
      let vulnScore = 0;
      if (activeRank !== null && activeRank <= 10) {
        const s = Number(row.saves || 0);
        const v = Number(row.velocity || 0);
        if (s >= 10000 && v <= 1.0) vulnScore = 95;
        else if (s >= 5000 && v <= 2.0) vulnScore = 88;
        else if (s >= 3000 && v <= 3.0) vulnScore = 78;
        else if (s >= 1000 && v <= 1.0) vulnScore = 65;
        else if (s >= 500 && v <= 0.5) vulnScore = 40;
      }
      pEntry.vulnerability_score = Math.max(pEntry.vulnerability_score || 0, vulnScore);
      pEntry.is_vulnerable = pEntry.vulnerability_score >= 70;

      pEntry.serp_appearances.push({
        keyword_id: Number(row.keyword_id),
        keyword_name: row.keyword_name || `Keyword #${row.keyword_id}`,
        rank_position: activeRank,
        prev_rank_position: prevRank,
        rank_delta: rankDelta,
        last_known_rank: lastKnown,
        is_displaced: Boolean(row.is_displaced),
        first_seen_at: row.first_seen_at || null,
        displaced_date: row.displaced_date || null,
        vacuum_opportunity_score: row.vacuum_opportunity_score != null ? Number(row.vacuum_opportunity_score) : null
      });

      const kwKey = Number(row.keyword_id);
      if (!keywordMatrixMap.has(kwKey)) {
        keywordMatrixMap.set(kwKey, {
          keyword_id: kwKey,
          keyword_name: row.keyword_name || `Keyword #${kwKey}`,
          active_slots: 0,
          displaced_slots: 0,
          best_rank: null,
          best_vault_rank: null,
          ranks: [],
          vault_ranks: [],
          total_saves: 0,
          active_total_saves: 0,
          daily_velocity: 0,
          delta_saves_24h: 0,
          gains_7d: 0,
          pin_ids_seen: new Set(),
          unique_urls: new Set(),
          slots_detail: [],
          is_decaying_monopoly: false
        });
      }
      const kwEntry = keywordMatrixMap.get(kwKey);
      kwEntry.total_saves += Number(row.saves || 0);
      if (activeRank !== null) {
        kwEntry.active_total_saves += Number(row.saves || 0);
      }
      if (!kwEntry.pin_ids_seen.has(pid)) {
        kwEntry.pin_ids_seen.add(pid);
        kwEntry.daily_velocity += Math.max(0, Number(row.velocity || 0));
        kwEntry.delta_saves_24h += Number(row.delta_saves_24h || 0);
        kwEntry.gains_7d += Number(row.gains_7d || 0);
      }
      if (row.destination_url) {
        kwEntry.unique_urls.add(cleanSlug);
      }

      const slotDetail = {
        pin_id: pid,
        rank_position: activeRank,
        prev_rank_position: prevRank,
        rank_delta: rankDelta,
        last_known_rank: lastKnown,
        is_displaced: Boolean(row.is_displaced),
        saves: Number(row.saves || 0),
        repins: Number(row.repins || 0),
        velocity: Number(row.velocity || 0),
        delta_saves_24h: Number(row.delta_saves_24h || 0),
        gains_7d: Number(row.gains_7d || 0),
        created_at_pinterest: pEntry.created_at_pinterest,
        pin_age_days: pEntry.pin_age_days,
        first_seen_at: row.first_seen_at || null,
        title: pEntry.title,
        clean_slug: cleanSlug,
        creator_username: cleanUser,
        is_vulnerable: pEntry.is_vulnerable
      };
      kwEntry.slots_detail.push(slotDetail);

      if (slotDetail.is_vulnerable) {
        kwEntry.is_decaying_monopoly = true;
      }

      if (activeRank !== null) {
        kwEntry.active_slots++;
        kwEntry.ranks.push(activeRank);
        if (kwEntry.best_rank === null || activeRank < kwEntry.best_rank) {
          kwEntry.best_rank = activeRank;
        }
      } else {
        kwEntry.displaced_slots++;
        if (lastKnown !== null) {
          kwEntry.vault_ranks.push(lastKnown);
          if (kwEntry.best_vault_rank === null || lastKnown < kwEntry.best_vault_rank) {
            kwEntry.best_vault_rank = lastKnown;
          }
        }
      }
    }
  };

  for (const r of serpPins) registerPin(r, 'serp');

  // [INVARIANT: SERP-ONLY-RANKED-PINS-COUNTING]
  // Enrich SERP & Displaced Vault pins from Master Pins without polluting pinsMap or moneyUrls.
  // Keep unranked catalog-only pins in a separate catalogOnlyMap (when viewing global scope) so Ranked Pins & Money Articles stay 100% pure.
  const catalogOnlyMap = new Map();
  const enrichOrCollectCatalogRow = (row, sourcePillar) => {
    const pid = String(row.pin_id || '').trim();
    if (!pid) return;
    if (pinsMap.has(pid)) {
      registerPin(row, sourcePillar);
      return;
    }
    if (fId === null && kId === null && !catalogOnlyMap.has(pid)) {
      const rawUser = String(row.creator_username || '').replace(/^@+/, '').trim().toLowerCase();
      let cleanSlug = '/';
      if (isOrganicVault) {
        cleanSlug = row.board_name ? `/${row.board_name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : '/direct-uploads';
      } else if (row.destination_url) {
        try {
          const u = new URL(row.destination_url.startsWith('http') ? row.destination_url : `https://${row.destination_url}`);
          cleanSlug = (u.pathname.replace(/\/+$/, '') || '/').toLowerCase();
        } catch (_) {}
      }
      const createdIso = row.created_at_pinterest || null;
      catalogOnlyMap.set(pid, {
        pin_id: pid,
        title: row.title || `Pin #${pid}`,
        destination_url: row.destination_url || '',
        clean_slug: cleanSlug,
        image_url: row.image_url || '',
        creator_username: rawUser,
        board_name: row.board_name || '',
        saves: Number(row.saves || 0),
        repins: Number(row.repins || 0),
        comments: Number(row.comments || 0),
        shares: Number(row.shares || 0),
        reactions: Number(row.reactions || 0),
        url_global_saves: row.url_global_saves != null && Number(row.url_global_saves) > 0 ? Number(row.url_global_saves) : null,
        velocity: Number(row.velocity || 0),
        repin_velocity: Number(row.repin_velocity || 0),
        delta_saves_24h: Number(row.delta_saves_24h || 0),
        delta_repins_24h: Number(row.delta_repins_24h || 0),
        gains_5d: Number(row.gains_5d || 0),
        gains_7d: Number(row.gains_7d || 0),
        gains_10d: Number(row.gains_10d || 0),
        gains_15d: Number(row.gains_15d || 0),
        dominant_color: row.dominant_color || '#888888',
        visual_annotations: unpackVisualAnnotations(row.visual_annotations),
        aspect_ratio: row.aspect_ratio || row.metadata?.aspect_ratio || '2:3',
        creation_method: row.creation_method || null,
        is_video: Boolean(row.is_video),
        has_alt_text: Boolean(row.alt_text && String(row.alt_text).trim()),
        created_at_pinterest: createdIso,
        pin_age_days: computePinAgeDays(createdIso),
        first_discovered_at: row.first_discovered_at || null,
        best_rank: null,
        best_vault_rank: null,
        is_displaced: false,
        is_catalog_only: true,
        is_vulnerable: false,
        vulnerability_score: 0,
        serp_appearances: [],
        pillars: [sourcePillar]
      });
    }
  };

  if (fId !== null && kId === null) {
    // Folder-scoped active campaign_tracked_pins (Newborn, Creator, Related, Search Top-N)
    // are first-class campaign pins — register them directly alongside SERP pins.
    for (const r of (umpPins || [])) registerPin(r, 'tracked');
  } else if (pinsMap.size > 0 || kId !== null) {
    for (const r of (umpPins || [])) enrichOrCollectCatalogRow(r, 'master');
  } else {
    // Fallback only for catalog-only domains that have 0 SERP/Vault occurrences globally
    for (const r of (umpPins || [])) registerPin(r, 'master');
  }

  const catalogOnlyVisualPins = Array.from(catalogOnlyMap.values())
    .filter(p => Boolean(p.image_url && p.image_url.trim()))
    .sort((a, b) => b.saves - a.saves);

  // 2. Finalize Pins & Group by Money Article URLs (Pillar 2: Creative Multiplier)
  const urlGroupsMap = new Map();
  const allPins = Array.from(pinsMap.values()).map(p => {
    if (p.creator_username && accountsMap.has(p.creator_username)) {
      const acc = accountsMap.get(p.creator_username);
      acc.pins_count++;
      acc.total_saves += p.saves;
      acc.daily_velocity += Math.max(0, Number(p.velocity || 0));
      acc.gains_7d += Number(p.gains_7d || 0);
      if (p.best_rank !== null && p.best_rank <= 10) acc.top10_count++;
    }

    // [INVARIANT: CLEAN-MONEY-ARTICLES] An article must represent a genuine content path (clean_slug !== '/')
    const isRealArticle = isOrganicVault ? Boolean(p.title || p.pin_id) : (p.clean_slug && p.clean_slug !== '/');

    if (isRealArticle) {
      const slugKey = p.clean_slug;
      if (!urlGroupsMap.has(slugKey)) {
        urlGroupsMap.set(slugKey, {
          clean_slug: slugKey,
          sample_url: isOrganicVault ? `Direct Upload Board: ${p.board_name || 'Personal Pins'}` : (p.destination_url || `https://${cleanDomain}${slugKey}`),
          pins_count: 0,
          active_pins_count: 0,
          vault_pins_count: 0,
          total_saves: 0,
          total_repins: 0,
          total_comments: 0,
          total_shares: 0,
          total_reactions: 0,
          url_global_saves: null,
          daily_velocity: 0,
          delta_saves_24h: 0,
          delta_repins_24h: 0,
          gains_5d: 0,
          gains_7d: 0,
          gains_10d: 0,
          gains_15d: 0,
          best_rank: null,
          best_vault_rank: null,
          keywords_set: new Set(),
          pins: [],
          angles_targeted: new Set()
        });
      }
      const uGroup = urlGroupsMap.get(slugKey);
      uGroup.pins_count++;
      if (p.best_rank !== null) uGroup.active_pins_count++;
      else if (p.is_displaced) uGroup.vault_pins_count++;
      uGroup.total_saves += p.saves;
      uGroup.total_repins += p.repins;
      uGroup.total_comments += Number(p.comments || 0);
      uGroup.total_shares += Number(p.shares || 0);
      uGroup.total_reactions += Number(p.reactions || 0);
      if (p.url_global_saves && (!uGroup.url_global_saves || p.url_global_saves > uGroup.url_global_saves)) {
        uGroup.url_global_saves = p.url_global_saves;
      }
      uGroup.daily_velocity += Math.max(0, Number(p.velocity || 0));
      uGroup.delta_saves_24h += Number(p.delta_saves_24h || 0);
      uGroup.delta_repins_24h += Number(p.delta_repins_24h || 0);
      uGroup.gains_5d += Number(p.gains_5d || 0);
      uGroup.gains_7d += Number(p.gains_7d || 0);
      uGroup.gains_10d += Number(p.gains_10d || 0);
      uGroup.gains_15d += Number(p.gains_15d || 0);

      if (p.best_rank !== null && (uGroup.best_rank === null || p.best_rank < uGroup.best_rank)) {
        uGroup.best_rank = p.best_rank;
      }
      if (p.best_vault_rank !== null && (uGroup.best_vault_rank === null || p.best_vault_rank < uGroup.best_vault_rank)) {
        uGroup.best_vault_rank = p.best_vault_rank;
      }
      for (const sa of p.serp_appearances) {
        if (sa.keyword_name) uGroup.keywords_set.add(sa.keyword_name);
      }

      // Detect Marketing Angle for this Pin
      const angleInfo = detectMarketingAngle({
        title: p.title,
        keywords: Array.from(uGroup.keywords_set),
        annotations: p.visual_annotations
      });
      uGroup.angles_targeted.add(angleInfo.angle);

      if (!uGroup.pins.some(existing => String(existing.pin_id) === String(p.pin_id))) {
        const primarySa = Array.isArray(p.serp_appearances) && p.serp_appearances.length > 0
          ? (p.serp_appearances.find(sa => !sa.is_displaced) || p.serp_appearances[0])
          : null;
        uGroup.pins.push({
          pin_id: p.pin_id,
          title: p.title,
          image_url: p.image_url,
          saves: p.saves,
          repins: p.repins,
          comments: p.comments,
          shares: p.shares,
          reactions: p.reactions,
          url_global_saves: p.url_global_saves,
          velocity: p.velocity,
          delta_saves_24h: p.delta_saves_24h,
          delta_repins_24h: p.delta_repins_24h,
          gains_5d: p.gains_5d,
          gains_7d: p.gains_7d,
          gains_10d: p.gains_10d,
          gains_15d: p.gains_15d,
          best_rank: p.best_rank,
          best_vault_rank: p.best_vault_rank,
          last_known_rank: primarySa?.rank_position || primarySa?.last_known_rank || null,
          primary_keyword: primarySa?.keyword_name || '',
          keywords_count: Array.isArray(p.serp_appearances) ? p.serp_appearances.length : 0,
          serp_appearances: p.serp_appearances,
          creator_username: p.creator_username,
          dominant_color: p.dominant_color,
          created_at_pinterest: p.created_at_pinterest,
          pin_age_days: p.pin_age_days,
          first_seen_at: p.first_seen_at,
          creation_method: p.creation_method,
          is_video: p.is_video,
          is_vulnerable: p.is_vulnerable,
          vulnerability_score: p.vulnerability_score,
          is_displaced: Boolean(p.is_displaced),
          detected_angle: angleInfo.angle,
          intent_tag: angleInfo.intent_tag,
          badge_color: angleInfo.badge_color
        });
      }
    }

    return {
      ...p,
      pillars: Array.from(p.pillars)
    };
  });

  allPins.sort((a, b) => {
    if (a.best_rank !== null && b.best_rank !== null) return a.best_rank - b.best_rank;
    if (a.best_rank !== null) return -1;
    if (b.best_rank !== null) return 1;
    return b.saves - a.saves;
  });

  // [INVARIANT: STRICT-VISUAL-PIN-FIDELITY] Every displayed pin must possess an authentic image URL
  const visualPins = allPins.filter(p => Boolean(p.image_url && p.image_url.trim()));

  const moneyUrls = Array.from(urlGroupsMap.values())
    .map(u => {
      const pinDates = u.pins
        .map(p => p.created_at_pinterest ? new Date(p.created_at_pinterest).getTime() : null)
        .filter(t => t !== null && isFinite(t));
      const newestPinDate = pinDates.length > 0 ? new Date(Math.max(...pinDates)).toISOString() : null;
      const oldestPinDate = pinDates.length > 0 ? new Date(Math.min(...pinDates)).toISOString() : null;
      const pinAges = u.pins.map(p => p.pin_age_days).filter(d => d !== null && Number.isFinite(d));
      const minPinAgeDays = pinAges.length > 0 ? Math.min(...pinAges) : null;
      const maxPinAgeDays = pinAges.length > 0 ? Math.max(...pinAges) : null;
      const kws = Array.from(u.keywords_set);

      return {
        clean_slug: u.clean_slug,
        sample_url: u.sample_url,
        pins_count: u.pins_count,
        active_pins_count: u.active_pins_count,
        vault_pins_count: u.vault_pins_count,
        total_saves: u.total_saves,
        total_repins: u.total_repins,
        total_comments: u.total_comments,
        total_shares: u.total_shares,
        total_reactions: u.total_reactions,
        url_global_saves: u.url_global_saves,
        daily_velocity: Number(u.daily_velocity.toFixed(1)),
        delta_saves_24h: u.delta_saves_24h,
        delta_repins_24h: u.delta_repins_24h,
        gains_5d: u.gains_5d,
        gains_7d: u.gains_7d,
        gains_10d: u.gains_10d,
        gains_15d: u.gains_15d,
        best_rank: u.best_rank,
        best_vault_rank: u.best_vault_rank,
        keywords: kws,
        created_at_pinterest: newestPinDate,
        newest_pin_date: newestPinDate,
        oldest_pin_date: oldestPinDate,
        min_pin_age_days: minPinAgeDays,
        max_pin_age_days: maxPinAgeDays,
        angles_targeted: Array.from(u.angles_targeted),
        angle_multiplier: u.angles_targeted.size,
        is_vulnerable: u.pins.some(p => p.is_vulnerable),
        pins: u.pins.sort((a, b) => b.saves - a.saves)
      };
    })
    .sort((a, b) => b.pins_count - a.pins_count || b.total_saves - a.total_saves);

  // 3. Pillar 1: Carpet Bombing & Slot Domination Analysis
  const keywordMonopoly = Array.from(keywordMatrixMap.values())
    .map(k => {
      const uniqueCount = k.unique_urls.size;
      let strategy = 'SINGLE_SLOT';
      let strategyLabel = 'Single Slot';
      if (k.active_slots > 1 && uniqueCount === 1) {
        strategy = 'URL_FLOODING';
        strategyLabel = 'URL Creative Flooding';
      } else if (k.active_slots > 1 && (k.active_slots / Math.max(1, uniqueCount)) >= 1.5) {
        strategy = 'HYBRID_FLOODING';
        strategyLabel = 'Hybrid Domination';
      } else if (uniqueCount > 1) {
        strategy = 'TOPIC_CLUSTER';
        strategyLabel = 'Topic Cluster';
      }

      const sortedSlots = k.slots_detail.sort((a, b) => (a.rank_position || 999) - (b.rank_position || 999) || (a.last_known_rank || 999) - (b.last_known_rank || 999) || b.saves - a.saves);
      const activeSlotsPool = sortedSlots.filter(s => !s.is_displaced && s.rank_position != null);
      const candidatePool = activeSlotsPool.length > 0 ? activeSlotsPool : sortedSlots;
      const topSlot = candidatePool.reduce((max, s) => s.saves > (max?.saves || 0) ? s : max, candidatePool[0] || null);
      const shareDenom = activeSlotsPool.length > 0 ? Math.max(1, k.active_total_saves) : Math.max(1, k.total_saves);
      const topSlotSharePct = topSlot ? Math.round((topSlot.saves / shareDenom) * 100) : 0;

      const slotDates = sortedSlots
        .map(s => s.created_at_pinterest ? new Date(s.created_at_pinterest).getTime() : null)
        .filter(t => t !== null && isFinite(t));
      const newestPinDate = slotDates.length > 0 ? new Date(Math.max(...slotDates)).toISOString() : null;
      const oldestPinDate = slotDates.length > 0 ? new Date(Math.min(...slotDates)).toISOString() : null;
      const slotAges = sortedSlots.map(s => s.pin_age_days).filter(d => d !== null && Number.isFinite(d));

      return {
        keyword_id: k.keyword_id,
        keyword_name: k.keyword_name,
        active_slots: k.active_slots,
        displaced_slots: k.displaced_slots,
        best_rank: k.best_rank,
        best_vault_rank: k.best_vault_rank,
        ranks: k.ranks.sort((a, b) => a - b),
        vault_ranks: k.vault_ranks.sort((a, b) => a - b),
        total_saves: k.total_saves,
        active_total_saves: k.active_total_saves,
        daily_velocity: Number(k.daily_velocity.toFixed(1)),
        delta_saves_24h: k.delta_saves_24h,
        gains_7d: k.gains_7d,
        newest_pin_date: newestPinDate,
        oldest_pin_date: oldestPinDate,
        min_pin_age_days: slotAges.length > 0 ? Math.min(...slotAges) : null,
        max_pin_age_days: slotAges.length > 0 ? Math.max(...slotAges) : null,
        unique_urls_count: uniqueCount,
        strategy,
        strategy_label: strategyLabel,
        serp_share_pct: Number(((k.active_slots / 50) * 100).toFixed(1)),
        is_decaying_monopoly: k.is_decaying_monopoly,
        top_slot_attribution: topSlot,
        top_slot_share_pct: topSlotSharePct,
        slots: sortedSlots
      };
    })
    .sort((a, b) => b.active_slots - a.active_slots || (a.best_rank || 999) - (b.best_rank || 999) || (a.best_vault_rank || 999) - (b.best_vault_rank || 999));

  // 4. Pillar 4: P2P Sybil Network & Ghost Creators Tracking
  const brandRoot = cleanDomain.split('.')[0].replace(/[^a-z0-9]/g, '');

  // Calculate Creator HHI (Herfindahl-Hirschman Index) & Multi-Creator Slug Overlap
  const totalDomainPins = Math.max(1, allPins.length);
  let sumSquaredShare = 0;
  for (const acc of accountsMap.values()) {
    const share = (acc.pins_count || 0) / totalDomainPins;
    sumSquaredShare += (share * share);
  }
  const hhiCreator = accountsMap.size > 0 ? Math.min(1, Math.max(0, sumSquaredShare)) : 1;
  const decentralizationScore = 1 - hhiCreator; // (1 - HHI_creator)

  // Multi-creator slug overlap: proportion of money slugs pinned by >= 2 distinct creators
  let multiCreatorSlugsCount = 0;
  for (const u of urlGroupsMap.values()) {
    const creatorsOnSlug = new Set(u.pins.map(p => p.creator_username).filter(Boolean));
    if (creatorsOnSlug.size > 1) multiCreatorSlugsCount++;
  }
  const totalMoneySlugs = Math.max(1, urlGroupsMap.size);
  const slugOverlapRatio = multiCreatorSlugsCount / totalMoneySlugs;

  // Publisher Network Sybil Index: C_sybil = (1 - HHI_creator) * (0.3 + 0.7 * slugOverlapRatio)
  const cSybil = accountsMap.size <= 1
    ? 0
    : Number((decentralizationScore * (0.3 + 0.7 * slugOverlapRatio)).toFixed(3));

  // [INVARIANT: SARGABLE-INDEX-SEEK] Match idx_ump_creator_clean functional expression directly
  // Sort accounts by activity (pins_count & total_saves) to strictly bound to the true top 50 accounts
  const sortedAccounts = Array.from(accountsMap.values())
    .sort((a, b) => b.pins_count - a.pins_count || b.total_saves - a.total_saves);
  const topAccounts = sortedAccounts.slice(0, 50);

  const cleanUsernames = Array.from(new Set(
    topAccounts.map(acc => acc.username).filter(Boolean)
  ));
  let crossFootprintRows = [];
  if (cleanUsernames.length > 0) {
    try {
      crossFootprintRows = await sql`
        SELECT
          lower(TRIM(BOTH FROM replace((COALESCE(ump.creator_username, ''::character varying))::text, '@'::text, ''::text))) AS username,
          ump.clean_domain AS cross_domain,
          COUNT(DISTINCT ksp.pin_id)::int AS pins_count
        FROM keyword_serp_positions ksp
        JOIN universal_master_pins ump ON ump.pin_id = ksp.pin_id
        WHERE lower(TRIM(BOTH FROM replace((COALESCE(ump.creator_username, ''::character varying))::text, '@'::text, ''::text))) = ANY(${cleanUsernames}::text[])
          AND ump.clean_domain IS NOT NULL AND ump.clean_domain <> ''
          AND ump.clean_domain <> ${cleanDomain}
          AND (${fId}::int IS NULL OR ksp.keyword_id IN (SELECT keyword_id FROM keyword_folder_items WHERE folder_id = ${fId}))
        GROUP BY 1, 2
        ORDER BY 3 DESC
        LIMIT 60;
      `.catch((err) => guardQueryTimeout(err, 'cross_footprint'));
    } catch (err) {
      guardQueryTimeout(err, 'cross_footprint');
    }
  }

  const crossMap = new Map();
  for (const r of crossFootprintRows) {
    const u = String(r.username || '').replace(/^@+/, '').trim().toLowerCase();
    if (!crossMap.has(u)) crossMap.set(u, []);
    crossMap.get(u).push({ domain: r.cross_domain, pins_count: r.pins_count });
  }

  // Compute full Publisher Network Sybil Index & PBN detection metrics
  const sybilMetrics = computeSybilPbnMetrics({
    allPins,
    accountsMap,
    urlGroupsMap,
    crossMap,
    cleanDomain
  });

  const accountsList = Array.from(accountsMap.values()).map(acc => {
    const isBrand = acc.username === brandRoot ||
                    acc.username.includes(brandRoot) ||
                    (brandRoot.length > 3 && brandRoot.includes(acc.username)) ||
                    (acc.pins_count / Math.max(1, allPins.length)) >= 0.4;
    const sisterDomains = crossMap.get(acc.username) || [];
    return {
      ...acc,
      daily_velocity: Number((acc.daily_velocity || 0).toFixed(1)),
      role: isBrand ? 'PRIMARY_BRAND' : 'SATELLITE_CREATOR',
      role_label: isBrand ? 'Primary Brand Account' : 'Satellite / Ghost Creator',
      sister_domains: sisterDomains,
      is_sybil_ring: sisterDomains.length > 0,
      c_sybil: cSybil,
      sybil_risk_score: sybilMetrics.sybil_risk_score,
      sybil_tier: sybilMetrics.sybil_tier
    };
  }).sort((a, b) => (b.role === 'PRIMARY_BRAND' ? 1 : 0) - (a.role === 'PRIMARY_BRAND' ? 1 : 0) || b.total_saves - a.total_saves);

  // 5. Pillar 3: Reverse-Engineered Visual DNA Profile
  const tagFreq = new Map();
  const colorFreq = new Map();
  const aspectFreq = new Map();
  const titleWords = new Map();
  const STOP_WORDS = new Set(['the', 'and', 'for', 'with', 'in', 'of', 'to', 'a', 'on', 'easy', 'recipe', 'recipes', 'how', 'make', 'best', 'that']);

  for (const p of allPins) {
    if (Array.isArray(p.visual_annotations)) {
      for (const t of p.visual_annotations) {
        // [INVARIANT: DEFENSIVE-ANNOTATIONS-UNPACKING] Prevent [object Object] poisoning from raw objects
        const rawTag = (typeof t === 'object' && t !== null) 
          ? (t.name || t.tag || t.label || t.display_label || '') 
          : String(t || '');
        const cleanTag = rawTag.trim();
        if (cleanTag && cleanTag !== '[object Object]') {
          tagFreq.set(cleanTag, (tagFreq.get(cleanTag) || 0) + 1);
        }
      }
    }
    const c = (p.dominant_color || '').trim().toLowerCase();
    const isPlaceholderColorHex = !c || !c.startsWith('#') || c === '#888888' || c === '#888' || c === '#1e1e24' || c === '#000000' || c === '#18181b' || c === '#121215';
    if (!isPlaceholderColorHex) {
      colorFreq.set(c, (colorFreq.get(c) || 0) + 1);
    }
    const ar = p.aspect_ratio || '2:3';
    aspectFreq.set(ar, (aspectFreq.get(ar) || 0) + 1);

    const words = String(p.title || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP_WORDS.has(w));
    for (const w of words) {
      titleWords.set(w, (titleWords.get(w) || 0) + 1);
    }
  }

  const visualTagsCloud = Array.from(tagFreq.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  const totalRealColorPins = Math.max(1, Array.from(colorFreq.values()).reduce((sum, cnt) => sum + cnt, 0));
  const dominantColorsPalette = Array.from(colorFreq.entries())
    .map(([color, count]) => ({
      color,
      count,
      percentage: Math.round((count / totalRealColorPins) * 100)
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  const topTitleKeywords = Array.from(titleWords.entries())
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const visualDna = {
    visual_tags_cloud: visualTagsCloud,
    dominant_colors_palette: dominantColorsPalette,
    aspect_ratios: Object.fromEntries(aspectFreq),
    top_title_keywords: topTitleKeywords
  };

  // [INVARIANT: FOLDER-SCOPED-LEADERBOARD-DOSSIER-PARITY]
  // Align total_pins, unique_urls and total_saves across all SERP + Displaced Vault pins so Leaderboard and Dossier match 1:1
  const activePins = allPins.filter(p => p.best_rank !== null);
  const activeUniqueUrlsSet = isOrganicVault ? new Set() : new Set(activePins.filter(p => p.clean_slug && p.clean_slug !== '/').map(p => p.clean_slug));
  const activeUniqueUrls = activeUniqueUrlsSet.size;
  const activeTotalSaves = activePins.reduce((acc, p) => acc + (Number(p.saves) || 0), 0);

  const vaultUniqueUrlsSet = isOrganicVault
    ? new Set()
    : new Set(
        allPins
          .filter(p => p.best_rank === null && p.is_displaced && p.clean_slug && p.clean_slug !== '/' && !activeUniqueUrlsSet.has(p.clean_slug))
          .map(p => p.clean_slug)
      );
  const vaultUniqueUrlsCount = vaultUniqueUrlsSet.size;

  const allCatalogPinsCount = allPins.length + catalogOnlyVisualPins.length;
  const totalPinsCount = allPins.length > 0 ? allPins.length : allCatalogPinsCount;
  const summaryUniqueUrls = isOrganicVault ? 0 : moneyUrls.length;
  const summaryPinsPerUrl = summaryUniqueUrls > 0
    ? Number((totalPinsCount / summaryUniqueUrls).toFixed(2))
    : (totalPinsCount > 0 ? 1 : 0);
  const summaryTotalSaves = allPins.reduce((acc, p) => acc + (Number(p.saves) || 0), 0);
  const summaryTotalDailyVelocity = Number(allPins.reduce((acc, p) => acc + Math.max(0, Number(p.velocity || 0)), 0).toFixed(1));
  const allPinAges = allPins.map(p => p.pin_age_days).filter(d => d !== null && Number.isFinite(d));

  const activeVisualPins = visualPins.filter(p => p.best_rank !== null || !p.is_displaced);
  const displacedVisualPins = visualPins.filter(p => p.best_rank === null && p.is_displaced);
  const visibleDisplacedPins = displacedVisualPins.slice(0, safeDisplacedLimit);
  const pagedVisualPins = [...activeVisualPins, ...visibleDisplacedPins];

  return {
    success: true,
    domain: cleanDomain,
    age_info: ageInfo,
    ad_info: adInfo,
    needs_age_enrichment: Boolean(ageInfo?.needs_enrichment || ageInfo?.lookup_status === 'pending'),
    needs_ad_enrichment: Boolean(adInfo?.needs_enrichment || adInfo?.ads_txt_status === 'pending'),
    summary: {
      total_pins: totalPinsCount,
      all_catalog_pins_count: allPins.length + catalogOnlyVisualPins.length,
      catalog_only_pins_count: catalogOnlyVisualPins.length,
      visual_pins_count: visualPins.length,
      active_pins_count: visualPins.filter(p => p.best_rank !== null).length,
      active_total_saves: activeTotalSaves,
      top3_pins: visualPins.filter(p => p.best_rank !== null && p.best_rank <= 3).length,
      top10_pins: visualPins.filter(p => p.best_rank !== null && p.best_rank <= 10).length,
      rank_11_50_pins: visualPins.filter(p => p.best_rank !== null && p.best_rank >= 11 && p.best_rank <= 50).length,
      displaced_pins_count: visibleDisplacedPins.length,
      displaced_total_count: displacedVisualPins.length,
      displaced_remaining_count: Math.max(0, displacedVisualPins.length - visibleDisplacedPins.length),
      unique_urls: summaryUniqueUrls,
      all_unique_urls_count: isOrganicVault ? 0 : moneyUrls.length,
      active_unique_urls_count: activeUniqueUrls,
      vault_unique_urls_count: vaultUniqueUrlsCount,
      pins_per_url: summaryPinsPerUrl,
      ranked_keywords_count: keywordMonopoly.length,
      active_slots_count: keywordMonopoly.reduce((acc, k) => acc + (k.active_slots || 0), 0),
      displaced_slots_count: keywordMonopoly.reduce((acc, k) => acc + (k.displaced_slots || 0), 0),
      total_saves: summaryTotalSaves,
      total_repins: allPins.reduce((acc, p) => acc + Number(p.repins || 0), 0),
      total_comments: allPins.reduce((acc, p) => acc + Number(p.comments || 0), 0),
      total_shares: allPins.reduce((acc, p) => acc + Number(p.shares || 0), 0),
      total_reactions: allPins.reduce((acc, p) => acc + Number(p.reactions || 0), 0),
      visual_saves: visualPins.reduce((acc, p) => acc + (Number(p.saves) || 0), 0),
      total_daily_velocity: summaryTotalDailyVelocity,
      avg_velocity: summaryTotalDailyVelocity,
      total_delta_saves_24h: allPins.reduce((acc, p) => acc + Number(p.delta_saves_24h || 0), 0),
      total_gains_5d: allPins.reduce((acc, p) => acc + Number(p.gains_5d || 0), 0),
      total_gains_7d: allPins.reduce((acc, p) => acc + Number(p.gains_7d || 0), 0),
      total_gains_10d: allPins.reduce((acc, p) => acc + Number(p.gains_10d || 0), 0),
      total_gains_15d: allPins.reduce((acc, p) => acc + Number(p.gains_15d || 0), 0),
      min_pin_age_days: allPinAges.length > 0 ? Math.min(...allPinAges) : null,
      max_pin_age_days: allPinAges.length > 0 ? Math.max(...allPinAges) : null,
      best_rank: visualPins.reduce((min, p) => p.best_rank !== null ? (min === null ? p.best_rank : Math.min(min, p.best_rank)) : min, null),
      avg_rank: (() => {
        const r = visualPins.filter(p => p.best_rank !== null);
        return r.length > 0 ? Number((r.reduce((sum, p) => sum + p.best_rank, 0) / r.length).toFixed(1)) : null;
      })(),
      visibility_score: Number(((visualPins.filter(p => p.best_rank !== null && p.best_rank <= 3).length * 100) + (visualPins.filter(p => p.best_rank !== null && p.best_rank > 3 && p.best_rank <= 10).length * 45) + (visualPins.filter(p => p.best_rank !== null && p.best_rank > 10 && p.best_rank <= 50).length * 12)).toFixed(1)),
      accounts_count: accountsMap.size,
      vulnerable_pins_count: visualPins.filter(p => p.is_vulnerable).length,
      decaying_monopoly_count: keywordMonopoly.filter(k => k.is_decaying_monopoly).length,
      sybil_accounts_count: accountsList.filter(a => a.role === 'SATELLITE_CREATOR').length,
      sybil_index: cSybil,
      c_sybil: cSybil,
      sybil_risk_score: sybilMetrics.sybil_risk_score,
      sybil_tier: sybilMetrics.sybil_tier,
      effective_creator_count: sybilMetrics.effective_creator_count,
      creative_multiplication_ratio: sybilMetrics.creative_multiplication_ratio,
      bipartite_slug_overlap: sybilMetrics.bipartite_slug_overlap,
      creator_hhi: Number(hhiCreator.toFixed(3)),
      creator_decentralization: Number(decentralizationScore.toFixed(3)),
      slug_overlap_ratio: Number(slugOverlapRatio.toFixed(3)),
      multi_creator_slugs_count: multiCreatorSlugsCount,
      sister_domains_count: new Set(crossFootprintRows.map(r => r.cross_domain)).size,
      is_organic_vault: isOrganicVault
    },
    sybil_pbn_metrics: sybilMetrics,
    ranked_pins: pagedVisualPins,
    catalog_pins: catalogOnlyVisualPins,
    money_urls: moneyUrls,
    keyword_monopoly: keywordMonopoly,
    accounts: accountsList,
    visual_dna: visualDna,
    ...(degraded ? { degraded: true } : {})
  };
}

/**
 * Pillar 6: Generates the One-Click Arbitrage Attack Blueprint
 */
export async function generateDomainArbitrageBlueprint(sql, rawDomain, options = {}) {
  const dossier = await getDomainDeepDossier(sql, rawDomain, options);
  const cleanDomain = dossier.domain;

  // 1. Top 5 Target Articles to Clone & Outrank
  const topArticles = (dossier.money_urls || [])
    .slice(0, 5)
    .map((art, idx) => {
      const primaryKeywords = (art.keywords || []).slice(0, 3);
      const angles = (art.angles_targeted && art.angles_targeted.length > 0)
        ? art.angles_targeted
        : ['Classic Recipe'];

      return {
        priority: idx + 1,
        slug: art.clean_slug,
        sample_url: art.sample_url,
        total_saves: art.total_saves,
        creative_pins_count: art.pins_count,
        best_rank: art.best_rank,
        is_vulnerable: Boolean(art.is_vulnerable),
        target_keywords: primaryKeywords,
        angles_used_by_competitor: angles,
        recommended_counter_angles: [
          'Quick 15-Min Prep Angle',
          'Diet/Keto/Low-Carb Modification Angle',
          'Budget-Friendly Family Meal-Prep Angle'
        ]
      };
    });

  // 2. High-Converting Title Formula Blueprints
  const topKw = dossier.visual_dna?.top_title_keywords?.slice(0, 3).map(k => k.word) || ['Chicken', 'Dinner', 'Easy'];
  const titleBlueprints = [
    `The Best ${topKw[0] ? topKw[0].charAt(0).toUpperCase() + topKw[0].slice(1) : 'Recipe'} (Ready In Under 20 Minutes)`,
    `Ultra-Crispy ${topKw.slice(0, 2).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')} That Everyone Will Love`,
    `5 Easy ${topKw[0] ? topKw[0].charAt(0).toUpperCase() + topKw[0].slice(1) : 'Meal'} Ideas For Weeknight Dinners`
  ];

  // 3. Visual DNA Tags to Feed Pinterest Computer Vision Algorithm
  const visualTagsChecklist = (dossier.visual_dna?.visual_tags_cloud || []).slice(0, 10);

  // 4. Color Strategy
  const colorPalette = (dossier.visual_dna?.dominant_colors_palette || []).slice(0, 4);

  // 5. Build Markdown Blueprint
  const mdLines = [
    `# Tactical Arbitrage Attack Blueprint: ${cleanDomain}`,
    `Generated on: ${new Date().toISOString().slice(0, 10)} | Domain Age: ${dossier.age_info?.age_years != null ? dossier.age_info.age_years + 'y' : 'Unknown'} | Ad Network: ${dossier.ad_info?.current_ad_network || 'Direct'}`,
    '',
    `## Executive Threat Assessment`,
    `- **Total Tracked Pins:** ${dossier.summary.total_pins} pins across ${dossier.summary.unique_urls} articles`,
    `- **Creative Multiplier:** ${dossier.summary.pins_per_url}x pins per article`,
    `- **Decaying Monopoly Slots:** ${dossier.summary.decaying_monopoly_count} vulnerable keywords ready for fresh pin takeover`,
    `- **P2P Creator Network:** ${dossier.summary.accounts_count} creators (${dossier.summary.sybil_accounts_count} satellite/sybil accounts)`,
    '',
    `## Top 5 Target Articles to Clone & Outrank`,
    '| # | Article Slug | Saves | Best Rank | Vulnerability | Primary Keywords | Recommended Angles |',
    '|---|---|---|---|---|---|---|'
  ];

  for (const a of topArticles) {
    const vulnBadge = a.is_vulnerable ? 'CRITICAL VULNERABLE' : 'Normal';
    const kwStr = a.target_keywords.join(', ') || '—';
    const angleStr = a.angles_used_by_competitor.join(', ') || 'Classic';
    mdLines.push(`| ${a.priority} | \`${a.slug}\` | ${Number(a.total_saves).toLocaleString()} | #${a.best_rank || '—'} | ${vulnBadge} | ${kwStr} | ${angleStr} |`);
  }

  mdLines.push('', `## Pinterest Computer Vision Tags to Include (Alt-Text & Image Elements)`);
  mdLines.push('Include these visual concepts in your image pins so Pinterest AI matches your pin with the #1 slot:');
  for (const t of visualTagsChecklist) {
    mdLines.push(`- **${t.tag}** (Detected ${t.count}x in competitor top pins)`);
  }

  mdLines.push('', `## Winning Color Palette`);
  for (const c of colorPalette) {
    mdLines.push(`- \`${c.color}\` (${c.percentage}% of competitor pins)`);
  }

  mdLines.push('', `## High-Converting Title Formulas`);
  for (const t of titleBlueprints) {
    mdLines.push(`1. \`${t}\``);
  }

  mdLines.push('', `## Recommended Deployment Plan`);
  mdLines.push('1. Write 1 in-depth comprehensive guide covering the top 5 article topics above.');
  mdLines.push('2. Deploy **3 distinct creative pin variations** per article (Multiplier: 3.0x):');
  mdLines.push('   - Pin 1: Quick & 15-Minute Angle targeting speed-conscious searchers.');
  mdLines.push('   - Pin 2: Diet/Keto/Low-Carb Modification Angle targeting health searchers.');
  mdLines.push('   - Pin 3: Family/Budget/One-Pot Angle targeting household cooks.');
  mdLines.push('3. Launch pins using high-contrast images embedding the visual tags above to steal rank within 72 hours.');

  return {
    success: true,
    domain: cleanDomain,
    generated_at: new Date().toISOString(),
    top_articles: topArticles,
    title_blueprints: titleBlueprints,
    visual_tags_checklist: visualTagsChecklist,
    color_palette: colorPalette,
    recommended_multiplier: 3,
    markdown_blueprint: mdLines.join('\n')
  };
}
