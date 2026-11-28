/**
 * Creator Analytics, Topic Clusters, Pin Archive & Deep Harvest Orchestration
 * Split from src/modules/creators/service.mjs (Layer 4)
 * // [INVARIANT: ZERO-HUB-SNAPSHOTS]
 */

import { escapeSqlWildcards } from '../../utils.mjs';
import { PINTEREST_CEILING_VALUE } from '../../core/pinterest/index.mjs';
import { normalizePinterestUsername } from './competitors-crud.mjs';
export {
  getTopDestinationUrls,
  getCompetitorRelatedIntersections,
  harvestSinglePinRelatedLive,
  auditSweepCompetitor,
  quickPulseCreator,
  syncFullCreatorCatalog,
  deepHarvestCreator,
  getPinArchiveOverview,
  getTopicClusters,
  getPinDetailWithMetrics
} from './creator-harvest-and-archive.mjs';

/**
 * Retrieve comprehensive details for a competitor, including profile,
 * historical snapshots, deltas, strategy age, velocity, and boards.
 */
export async function getCompetitorDetail(sql, competitorIdOrUsername, { generateIfEmpty = false, username = '' } = {}) {
  let cleanUsername = username ? normalizePinterestUsername(username) : null;
  const isNumeric = typeof competitorIdOrUsername === 'number' || (typeof competitorIdOrUsername === 'string' && /^\d+$/.test(competitorIdOrUsername.trim()));
  let numericId = isNumeric ? parseInt(competitorIdOrUsername, 10) : NaN;
  if (!cleanUsername && !isNumeric) {
    cleanUsername = normalizePinterestUsername(competitorIdOrUsername);
  }

  let profile = null;

  // Step 1: Fast B-Tree PK seek by numeric ID if available
  if (!isNaN(numericId)) {
    const [pById] = await sql`SELECT * FROM competitor_profiles WHERE id = ${numericId} LIMIT 1;`;
    if (pById) {
      profile = pById;
      cleanUsername = normalizePinterestUsername(profile.username);
    }
  }

  // Step 2: Fallback lookup by username
  if (!profile && cleanUsername) {
    const [pByUsername] = await sql`SELECT * FROM competitor_profiles WHERE username = ${cleanUsername} LIMIT 1;`;
    if (pByUsername) {
      profile = pByUsername;
      numericId = profile.id;
    }
  }

  // [INVARIANT: READ-ONLY-GET-SAFE] Never mutate database on GET requests unless explicitly requested
  if (!profile && generateIfEmpty && cleanUsername && isNaN(numericId)) {
    try {
      [profile] = await sql`
        INSERT INTO competitor_profiles (username, display_name, account_type, is_active, updated_at)
        VALUES (${cleanUsername}, ${cleanUsername}, 'competitor', TRUE, NOW())
        ON CONFLICT (username) DO UPDATE SET updated_at = NOW()
        RETURNING *;
      `;
    } catch (_) {}
  }

  if (!profile) {
    throw new Error('Competitor profile not found.');
  }

  const compId = profile.id;

  // [OPTIMIZED SARGABLE: 3 Parallel Aggregations via Promise.all replacing 17 sequential round-trips]
  const boardsPromise = (async () => {
    try {
      const rows = await sql`
        SELECT 
          cb.id,
          cb.competitor_id,
          cb.board_id,
          cb.name,
          cb.url,
          cb.pin_count,
          cb.follower_count,
          cb.last_pinned_at,
          cb.created_at,
          cb.updated_at,
          cb.metadata
        FROM competitor_boards cb
        WHERE cb.competitor_id = ${compId}
        ORDER BY cb.pin_count DESC;
      `;
      if (rows && rows.length > 0) return rows;
    } catch (err) {
      console.warn(`[getCompetitorDetail] Could not query competitor_boards for #${compId}:`, err.message);
    }

    // Fallback board discovery from competitor_board_pins & universal_master_pins
    try {
      const rawBoards = await sql`
        SELECT 
          COALESCE(NULLIF(TRIM(ump.board_name), ''), 'General') AS name,
          COUNT(*)::int AS pin_count,
          0::int AS follower_count,
          MAX(ump.created_at_pinterest) AS last_pinned_at,
          MIN(ump.created_at_pinterest) AS created_at
        FROM competitor_board_pins cbp
        JOIN universal_master_pins ump ON ump.pin_id = cbp.pin_id
        WHERE cbp.competitor_id = ${compId} AND ump.board_name IS NOT NULL AND TRIM(ump.board_name) <> ''
        GROUP BY name
        ORDER BY pin_count DESC;
      `;
      return rawBoards.map((b, idx) => ({
        id: idx + 1,
        competitor_id: compId,
        board_id: 'cb-' + (idx + 1),
        name: b.name,
        url: `https://www.pinterest.com/${cleanUsername || profile.username}/${encodeURIComponent(b.name.toLowerCase().replace(/\s+/g, '-'))}/`,
        pin_count: b.pin_count,
        follower_count: 0,
        last_pinned_at: b.last_pinned_at,
        created_at: b.created_at,
        image_cover_url: null,
        board_vase: [],
        description: '',
        metadata: {}
      }));
    } catch (_) {
      return [];
    }
  })();

  const snapshotsPromise = (async () => {
    try {
      return await sql`
        SELECT id, competitor_id, monthly_reach, profile_views, follower_count, total_pins, total_boards, recorded_date, metadata, created_at
        FROM competitor_history_snapshots
        WHERE competitor_id = ${compId}
        ORDER BY recorded_date ASC, id ASC;
      `;
    } catch (snapErr) {
      console.warn(`[getCompetitorDetail] Could not query competitor_history_snapshots for #${compId}:`, snapErr.message);
      return [];
    }
  })();

  let resolvedPrimaryDomain = profile.website_url
    ? profile.website_url.toLowerCase().trim().replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '').replace(/^www\./, '')
    : '';
  if (resolvedPrimaryDomain && (resolvedPrimaryDomain.includes('pinterest.') || resolvedPrimaryDomain.includes('pin.it'))) {
    resolvedPrimaryDomain = '';
  }

  if (!resolvedPrimaryDomain) {
    try {
      const [domRow] = await sql`
        WITH direct_pins AS (
          SELECT DISTINCT ON (pin_id) pin_id, clean_domain, save_count
          FROM (
            SELECT cbp.pin_id, ump.clean_domain, ump.save_count, 0 AS src_priority
            FROM competitor_board_pins cbp
            JOIN universal_master_pins ump ON ump.pin_id = cbp.pin_id
            WHERE cbp.competitor_id = ${compId}
              AND ump.pin_id ~ '^[0-9]{10,30}$'
            UNION ALL
            SELECT ump.pin_id, ump.clean_domain, ump.save_count, 1 AS src_priority
            FROM universal_master_pins ump
            WHERE ${cleanUsername} <> ''
              AND ump.pin_id ~ '^[0-9]{10,30}$'
              AND LOWER(LTRIM(BTRIM(COALESCE(ump.creator_username, '')), '@')) = ${cleanUsername}
          ) dp_raw
          ORDER BY pin_id, src_priority ASC
        )
        SELECT COALESCE(clean_domain, '') AS clean_dom
        FROM direct_pins
        WHERE COALESCE(clean_domain, '') <> ''
          AND clean_domain NOT ILIKE '%pinterest.%'
          AND clean_domain NOT ILIKE '%pin.it%'
          AND clean_domain NOT ILIKE '%amazon.%'
          AND clean_domain NOT ILIKE '%etsy.%'
        GROUP BY clean_dom
        ORDER BY COUNT(*) DESC, SUM(COALESCE(save_count, 0)) DESC
        LIMIT 1;
      `;
      if (domRow?.clean_dom) {
        resolvedPrimaryDomain = domRow.clean_dom;
        profile.website_url = resolvedPrimaryDomain;
      }
    } catch (_) {}
  }

  // [INVARIANT: ZERO-READ-PATH-MUTATIONS]
  // Read path is strictly read-only: zero UPDATE competitor_profiles or writes during GET /api/creators/detail.

  const aggregatesPromise = (async () => {
    try {
      const [agg] = await sql`
        WITH direct_pins AS (
          SELECT DISTINCT ON (pin_id)
            pin_id,
            save_count,
            repin_count,
            share_count,
            daily_save_velocity,
            delta_saves_24h,
            delta_repins_24h,
            destination_url,
            created_at_pinterest,
            first_discovered_at,
            clean_domain
          FROM (
            SELECT
              cbp.pin_id,
              ump.save_count,
              ump.repin_count,
              ump.share_count,
              ump.daily_save_velocity,
              ump.delta_saves_24h,
              ump.delta_repins_24h,
              ump.destination_url,
              ump.created_at_pinterest,
              ump.first_discovered_at,
              ump.clean_domain,
              0 AS src_priority
            FROM competitor_board_pins cbp
            JOIN universal_master_pins ump ON ump.pin_id = cbp.pin_id
            WHERE cbp.competitor_id = ${compId}
              AND ump.pin_id ~ '^[0-9]{10,30}$'
            UNION ALL
            SELECT
              ump.pin_id,
              ump.save_count,
              ump.repin_count,
              ump.share_count,
              ump.daily_save_velocity,
              ump.delta_saves_24h,
              ump.delta_repins_24h,
              ump.destination_url,
              ump.created_at_pinterest,
              ump.first_discovered_at,
              ump.clean_domain,
              1 AS src_priority
            FROM universal_master_pins ump
            WHERE ump.pin_id ~ '^[0-9]{10,30}$'
              AND (
                (${cleanUsername} <> '' AND LOWER(LTRIM(BTRIM(COALESCE(ump.creator_username, '')), '@')) = ${cleanUsername})
                OR (
                  ${resolvedPrimaryDomain} <> ''
                  AND ump.clean_domain = ${resolvedPrimaryDomain}
                  AND LOWER(LTRIM(BTRIM(COALESCE(ump.creator_username, '')), '@')) IN ('', 'uploaded by user', 'uploaded by pinner', 'anonymous', 'community_curator')
                )
              )
          ) dp_raw
          ORDER BY pin_id, src_priority ASC
        ),
        classified_cp AS (
          SELECT
            dp.pin_id,
            dp.save_count,
            dp.repin_count,
            dp.share_count,
            dp.daily_save_velocity,
            dp.delta_saves_24h,
            dp.delta_repins_24h,
            dp.destination_url,
            dp.created_at_pinterest,
            dp.first_discovered_at,
            dp.clean_domain,
            (
              ${resolvedPrimaryDomain} = ''
              OR COALESCE(dp.clean_domain, '') IN ('', 'uploaded by user', 'uploaded-by-user', 'organic', ${resolvedPrimaryDomain})
              OR COALESCE(dp.clean_domain, '') ILIKE '%pinterest.%'
              OR COALESCE(dp.clean_domain, '') ILIKE '%pin.it%'
            ) AS is_official_domain,
            (COALESCE(dp.save_count, 0) >= 100 OR COALESCE(dp.daily_save_velocity, 0) >= 3.5) AS is_winning
          FROM direct_pins dp
        )
        SELECT
          COUNT(*)::int AS total_catalog_pins,
          COUNT(*) FILTER (WHERE is_official_domain = FALSE)::int AS external_pins_count,
          COALESCE(SUM(save_count), 0)::bigint AS total_saves,
          COALESCE(SUM(save_count) FILTER (WHERE is_official_domain = FALSE), 0)::bigint AS external_saves,
          COALESCE(SUM(repin_count), 0)::bigint AS total_repins,
          COALESCE(SUM(share_count), 0)::bigint AS total_shares,
          COALESCE(SUM(COALESCE(delta_saves_24h, daily_save_velocity, 0)), 0)::numeric AS live_delta_saves_24h,
          COUNT(*) FILTER (WHERE delta_saves_24h IS NOT NULL OR COALESCE(daily_save_velocity, 0) > 0)::int AS pins_with_delta_saves,
          COALESCE(SUM(COALESCE(delta_repins_24h, 0)), 0)::numeric AS live_delta_repins_24h,
          COUNT(*) FILTER (WHERE delta_repins_24h IS NOT NULL)::int AS pins_with_delta_repins,
          MIN(COALESCE(created_at_pinterest, first_discovered_at)) AS earliest_pin_at,
          MAX(COALESCE(created_at_pinterest, first_discovered_at)) AS latest_pin_at,
          COUNT(*) FILTER (WHERE created_at_pinterest >= NOW() - INTERVAL '30 days')::int AS pins_last_30d,
          COUNT(*) FILTER (WHERE created_at_pinterest IS NOT NULL)::int AS dated_pins_count,
          COUNT(*) FILTER (WHERE is_winning = TRUE)::int AS winning_pins_count,
          COUNT(DISTINCT NULLIF(NULLIF(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(LOWER(TRIM(COALESCE(destination_url, ''))), '^https?://(www\\.)?[^/]+', ''), '[?#].*$', ''), '/+$', ''), ''), '/')) FILTER (WHERE COALESCE(destination_url, '') NOT LIKE '%pinterest.%')::int AS official_urls_count,
          GREATEST(1.0, EXTRACT(EPOCH FROM (MAX(created_at_pinterest) - MIN(created_at_pinterest))) / 86400.0) AS span_days
        FROM classified_cp;
      `;
      return agg || {};
    } catch (_) {
      return {};
    }
  })();

  const [rawBoards, snapshots, aggStats] = await Promise.all([
    boardsPromise,
    snapshotsPromise,
    aggregatesPromise
  ]);

  let domainEcosystem = {
    primary_domain: resolvedPrimaryDomain || null,
    official_pins: Number(aggStats.total_catalog_pins || 0),
    official_saves: Number(aggStats.total_saves || 0),
    official_urls: Number(aggStats.official_urls_count || 0),
    external_pins: Number(aggStats.external_pins_count || 0),
    external_saves: Number(aggStats.external_saves || 0),
    curator_pins: 0,
    curator_saves: 0,
    ecosystem_total_pins: Number(aggStats.total_catalog_pins || 0),
    ecosystem_total_saves: Number(aggStats.total_saves || 0),
    ecosystem_unique_urls: Number(aggStats.official_urls_count || 0)
  };

  if (resolvedPrimaryDomain) {
    try {
      const [ecoRow] = await sql`
        WITH direct_pins AS (
          SELECT DISTINCT ON (pin_id) pin_id, save_count, destination_url, clean_domain
          FROM (
            SELECT cbp.pin_id, ump.save_count, ump.destination_url, ump.clean_domain, 0 AS src_priority
            FROM competitor_board_pins cbp
            JOIN universal_master_pins ump ON ump.pin_id = cbp.pin_id
            WHERE cbp.competitor_id = ${compId}
              AND ump.pin_id ~ '^[0-9]{10,30}$'
            UNION ALL
            SELECT ump.pin_id, ump.save_count, ump.destination_url, ump.clean_domain, 1 AS src_priority
            FROM universal_master_pins ump
            WHERE ump.pin_id ~ '^[0-9]{10,30}$'
              AND (
                (${cleanUsername} <> '' AND LOWER(LTRIM(BTRIM(COALESCE(ump.creator_username, '')), '@')) = ${cleanUsername})
                OR (
                  ump.clean_domain = ${resolvedPrimaryDomain}
                  AND LOWER(LTRIM(BTRIM(COALESCE(ump.creator_username, '')), '@')) IN ('', 'uploaded by user', 'uploaded by pinner', 'anonymous', 'community_curator')
                )
              )
          ) dp_raw
          ORDER BY pin_id, src_priority ASC
        ),
        official_set AS (
          SELECT
            dp.pin_id,
            COALESCE(dp.save_count, 0)::bigint AS saves,
            NULLIF(NULLIF(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(LOWER(TRIM(COALESCE(dp.destination_url, ''))), '^https?://(www\\.)?[^/]+', ''), '[?#].*$', ''), '/+$', ''), ''), '/') AS slug
          FROM direct_pins dp
          WHERE (
              COALESCE(dp.clean_domain, '') IN ('', 'uploaded by user', 'uploaded-by-user', 'organic', ${resolvedPrimaryDomain})
              OR COALESCE(dp.clean_domain, '') ILIKE '%pinterest.%'
              OR COALESCE(dp.clean_domain, '') ILIKE '%pin.it%'
            )
        ),
        curator_set AS (
          SELECT
            ump.pin_id,
            COALESCE(ump.save_count, 0)::bigint AS saves,
            NULLIF(NULLIF(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(LOWER(TRIM(COALESCE(ump.destination_url, ''))), '^https?://(www\\.)?[^/]+', ''), '[?#].*$', ''), '/+$', ''), ''), '/') AS slug
          FROM universal_master_pins ump
          WHERE ump.pin_id ~ '^[0-9]{10,30}$'
            AND ump.clean_domain = ${resolvedPrimaryDomain}
            AND LOWER(LTRIM(BTRIM(COALESCE(ump.creator_username, '')), '@')) NOT IN ('', 'uploaded by user', 'uploaded by pinner', 'anonymous', 'community_curator', ${cleanUsername})
            AND NOT EXISTS (
              SELECT 1 FROM direct_pins dp_ex
              WHERE dp_ex.pin_id = ump.pin_id
            )
        ),
        combined AS (
          SELECT pin_id, saves, slug, 'official' AS src FROM official_set
          UNION ALL
          SELECT pin_id, saves, slug, 'curator' AS src FROM curator_set
        )
        SELECT
          COUNT(*) FILTER (WHERE src = 'curator')::int AS curator_pins,
          COALESCE(SUM(saves) FILTER (WHERE src = 'curator'), 0)::bigint AS curator_saves,
          COUNT(*)::int AS ecosystem_total_pins,
          COALESCE(SUM(saves), 0)::bigint AS ecosystem_total_saves,
          COUNT(DISTINCT slug) FILTER (WHERE slug IS NOT NULL AND slug <> '' AND slug <> '/')::int AS ecosystem_unique_urls
        FROM combined;
      `;
      if (ecoRow) {
        domainEcosystem = {
          primary_domain: resolvedPrimaryDomain,
          official_pins: Number(aggStats.total_catalog_pins || 0),
          official_saves: Number(aggStats.total_saves || 0),
          official_urls: Number(aggStats.official_urls_count || 0),
          external_pins: Number(aggStats.external_pins_count || 0),
          external_saves: Number(aggStats.external_saves || 0),
          curator_pins: Number(ecoRow.curator_pins || 0),
          curator_saves: Number(ecoRow.curator_saves || 0),
          ecosystem_total_pins: Number(ecoRow.ecosystem_total_pins || aggStats.total_catalog_pins || 0),
          ecosystem_total_saves: Number(ecoRow.ecosystem_total_saves || aggStats.total_saves || 0),
          ecosystem_unique_urls: Number(ecoRow.ecosystem_unique_urls || aggStats.official_urls_count || 0)
        };
      }
    } catch (_) {}
  }

  // Monotonic 10M+ ceiling & Zero-Drop guard for snapshots so unauthenticated 10,000,001 or transient 0 dips never corrupt trajectory charts or deltas
  const profReach = Number(profile.monthly_reach || 0);
  const profViews = Number(profile.profile_views || 0);
  const profPins = Number(profile.total_pins || 0);
  const profBoards = Number(profile.total_boards || 0);
  let runningMaxReach = profReach > PINTEREST_CEILING_VALUE ? profReach : 0;
  let runningMaxViews = profViews > PINTEREST_CEILING_VALUE ? profViews : 0;
  let lastValidReach = profReach > 0 ? profReach : 0;
  let lastValidViews = profViews > 0 ? profViews : 0;
  let lastValidPins = profPins > 0 ? profPins : 0;
  let lastValidBoards = profBoards > 0 ? profBoards : 0;
  for (const snap of (snapshots || [])) {
    const r = Number(snap.monthly_reach || 0);
    const v = Number(snap.profile_views || 0);
    const p = Number(snap.total_pins || 0);
    const b = Number(snap.total_boards || 0);
    if (r <= 0 && lastValidReach > 0) {
      snap.monthly_reach = lastValidReach;
    } else if (r === PINTEREST_CEILING_VALUE && runningMaxReach > PINTEREST_CEILING_VALUE) {
      snap.monthly_reach = runningMaxReach;
    } else if (r > 0) {
      lastValidReach = r;
      if (r > runningMaxReach) runningMaxReach = r;
    }
    if (v <= 0 && lastValidViews > 0) {
      snap.profile_views = lastValidViews;
    } else if (v === PINTEREST_CEILING_VALUE && runningMaxViews > PINTEREST_CEILING_VALUE) {
      snap.profile_views = runningMaxViews;
    } else if (v > 0) {
      lastValidViews = v;
      if (v > runningMaxViews) runningMaxViews = v;
    }
    if (p <= 0 && lastValidPins > 0) {
      snap.total_pins = lastValidPins;
    } else if (p > 0) {
      lastValidPins = p;
    }
    if (b <= 0 && lastValidBoards > 0) {
      snap.total_boards = lastValidBoards;
    } else if (b > 0) {
      lastValidBoards = b;
    }
  }
  if (Number(profile.monthly_reach || 0) === PINTEREST_CEILING_VALUE && runningMaxReach > PINTEREST_CEILING_VALUE) {
    profile.monthly_reach = runningMaxReach;
  }
  if (Number(profile.profile_views || 0) === PINTEREST_CEILING_VALUE && runningMaxViews > PINTEREST_CEILING_VALUE) {
    profile.profile_views = runningMaxViews;
  }

  // Map and deduplicate boards
  const uniqueDetailBoardMap = new Map();
  for (const b of (rawBoards || [])) {
    const norm = (b.name || '').trim().toLowerCase();
    if (!norm) continue;
    const existing = uniqueDetailBoardMap.get(norm);
    if (!existing || (!String(b.board_id || '').startsWith('cb-') && String(existing.board_id || '').startsWith('cb-'))) {
      uniqueDetailBoardMap.set(norm, b);
    }
  }
  let boards = Array.from(uniqueDetailBoardMap.values()).sort((a, b) => (b.pin_count || 0) - (a.pin_count || 0));

  boards = boards.map(b => {
    const meta = (typeof b.metadata === 'object' && b.metadata !== null) ? b.metadata : {};
    return {
      ...b,
      image_cover_url: b.image_cover_url || meta.image_cover_url || null,
      board_vase: Array.isArray(b.board_vase) && b.board_vase.length > 0 ? b.board_vase : (Array.isArray(meta.board_vase) ? meta.board_vase : []),
      description: b.description || meta.description || ''
    };
  });

  // Strategy age
  let strategyAgeDays = 0;
  let oldestBoardDateStr = 'No boards yet';
  if (boards.length > 0) {
    const oldestBoard = boards.reduce((oldest, b) => {
      const d = b.created_at || b.last_pinned_at;
      if (!d) return oldest;
      const dTime = new Date(d).getTime();
      if (isNaN(dTime)) return oldest;
      return !oldest || dTime < oldest.time ? { ...b, time: dTime, dateStr: d } : oldest;
    }, null);

    if (oldestBoard && oldestBoard.time) {
      strategyAgeDays = Math.max(0, Math.floor((Date.now() - oldestBoard.time) / 86400000));
      oldestBoardDateStr = new Date(oldestBoard.time).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    }
  }

  if (strategyAgeDays === 0 && aggStats.earliest_pin_at) {
    const oTime = new Date(aggStats.earliest_pin_at).getTime();
    if (!isNaN(oTime)) {
      strategyAgeDays = Math.max(0, Math.floor((Date.now() - oTime) / 86400000));
      oldestBoardDateStr = new Date(oTime).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    }
  }

  // Account age
  let accountAgeDays = strategyAgeDays;
  let accountCreatedDateStr = oldestBoardDateStr;

  let profileMeta = profile.metadata;
  if (typeof profileMeta === 'string') {
    try { profileMeta = JSON.parse(profileMeta); } catch (_) { profileMeta = {}; }
  }

  if (profileMeta?.account_created_at) {
    const dTime = new Date(profileMeta.account_created_at).getTime();
    if (!isNaN(dTime)) {
      accountAgeDays = Math.max(0, Math.floor((Date.now() - dTime) / 86400000));
      accountCreatedDateStr = new Date(dTime).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    }
  } else if (aggStats.earliest_pin_at) {
    const pTime = new Date(aggStats.earliest_pin_at).getTime();
    if (!isNaN(pTime)) {
      const pDays = Math.max(0, Math.floor((Date.now() - pTime) / 86400000));
      if (pDays > accountAgeDays || accountAgeDays === 0) {
        accountAgeDays = pDays;
        accountCreatedDateStr = new Date(pTime).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        });
      }
    }
  } else if (profile.created_at) {
    const cTime = new Date(profile.created_at).getTime();
    if (!isNaN(cTime)) {
      accountAgeDays = Math.max(1, Math.floor((Date.now() - cTime) / 86400000));
      accountCreatedDateStr = new Date(cTime).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    }
  }

  // Deltas (curr vs prev snapshot)
  let deltas = null;
  if (snapshots.length >= 2) {
    const curr = snapshots[snapshots.length - 1];
    const prev = snapshots[snapshots.length - 2];
    const calc = (c, p) => {
      const cv = Number(c) || 0;
      const pv = Number(p) || 0;
      const change = cv - pv;
      const percent = pv > 0 ? Number(((change / pv) * 100).toFixed(1)) : 0;
      return { change, percent };
    };
    deltas = {
      reach: calc(curr.monthly_reach, prev.monthly_reach),
      views: calc(curr.profile_views, prev.profile_views),
      followers: calc(curr.follower_count, prev.follower_count),
      pins: calc(curr.total_pins, prev.total_pins)
    };
  } else {
    deltas = {
      reach: { change: 0, percent: 0 },
      views: { change: 0, percent: 0 },
      followers: { change: 0, percent: 0 },
      pins: { change: 0, percent: 0 }
    };
  }

  // Pinning velocity
  let pinningVelocity = '0.0';
  let pinsAdded = 0;
  let daysSpan = 1;
  let pacingEstimate = 0;
  let winningPinsCount = Number(aggStats.winning_pins_count || 0);
  let winningHitRatePct = 0.0;
  let pinsPerWinner = null;

  if (snapshots.length >= 2) {
    const earliest = snapshots[0];
    const latest = snapshots[snapshots.length - 1];
    const dEarliest = new Date(earliest.recorded_date || earliest.created_at).getTime();
    const dLatest = new Date(latest.recorded_date || latest.created_at).getTime();
    const rawSpan = (!isNaN(dEarliest) && !isNaN(dLatest)) ? Math.round((dLatest - dEarliest) / 86400000) : 1;
    daysSpan = Math.max(1, (!isNaN(rawSpan) && isFinite(rawSpan)) ? rawSpan : 1);
    pinsAdded = Math.max(0, (Number(latest.total_pins) || 0) - (Number(earliest.total_pins) || 0));
    const safeVelocity = (isNaN(pinsAdded / daysSpan) || !isFinite(pinsAdded / daysSpan)) ? 0 : (pinsAdded / daysSpan);
    pinningVelocity = safeVelocity.toFixed(1);
    pacingEstimate = Math.round(safeVelocity * 30);
  } else if (aggStats.total_catalog_pins && Number(aggStats.total_catalog_pins) > 0) {
    const totalCatalog = Number(aggStats.total_catalog_pins || 0);
    const datedCount = Number(aggStats.dated_pins_count || 0);
    const rawSpan = Number(aggStats.span_days);
    const safeSpan = Math.max(1.0, (!isNaN(rawSpan) && isFinite(rawSpan)) ? rawSpan : 1.0);
    daysSpan = Math.max(1, Math.round(safeSpan));
    pinsAdded = totalCatalog;

    const calcVelocity = datedCount > 0
      ? (datedCount / safeSpan)
      : (totalCatalog > 0 ? (totalCatalog / daysSpan) : 0);

    pinningVelocity = (!isNaN(calcVelocity) && isFinite(calcVelocity)) ? calcVelocity.toFixed(1) : '0.0';
    pacingEstimate = Math.round((Number(pinningVelocity) || 0) * 30);
  }

  const totalCatalogForWinners = Number(aggStats.total_catalog_pins || 0);
  if (totalCatalogForWinners > 0) {
    winningHitRatePct = Number(((winningPinsCount / totalCatalogForWinners) * 100).toFixed(1));
    pinsPerWinner = winningPinsCount > 0 ? Number((totalCatalogForWinners / winningPinsCount).toFixed(1)) : null;
  }

  let latestPinDateStr = '—';
  if (aggStats.latest_pin_at) {
    latestPinDateStr = new Date(aggStats.latest_pin_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } else if (profile.last_synced_at) {
    latestPinDateStr = new Date(profile.last_synced_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // Engagement (strictly real measured DB telemetry — zero fabricated formulas)
  const totalSaves = Number(aggStats.total_saves || 0);
  const totalShares = Number(aggStats.total_shares || 0);

  let deltaSaves24h = null;
  let deltaRepins24h = null;

  if (Number(aggStats.pins_with_delta_saves || 0) > 0) {
    const liveDelta = Number(aggStats.live_delta_saves_24h || 0);
    if (Number.isFinite(liveDelta)) {
      deltaSaves24h = Math.round(liveDelta);
    }
  }
  if (Number(aggStats.pins_with_delta_repins || 0) > 0) {
    const liveRepinDelta = Number(aggStats.live_delta_repins_24h || 0);
    if (Number.isFinite(liveRepinDelta)) {
      deltaRepins24h = Math.round(liveRepinDelta);
    }
  }

  if ((deltaSaves24h === null || deltaRepins24h === null) && snapshots.length >= 2) {
    const curr = snapshots[snapshots.length - 1];
    const prev = snapshots[snapshots.length - 2];
    const currSaves = Number(curr.metadata?.total_saves || 0);
    const prevSaves = Number(prev.metadata?.total_saves || 0);
    if (deltaSaves24h === null && curr.metadata && prev.metadata && (currSaves > 0 || prevSaves > 0)) {
      deltaSaves24h = currSaves - prevSaves;
    }
    const currRepins = Number(curr.metadata?.total_repins || 0);
    const prevRepins = Number(prev.metadata?.total_repins || 0);
    if (deltaRepins24h === null && curr.metadata && prev.metadata && (currRepins > 0 || prevRepins > 0)) {
      deltaRepins24h = currRepins - prevRepins;
    }
  }

  // [INVARIANT: UNIFIED-POSTGRES-SNAPSHOTS]
  // Time-series snapshots are stored exclusively in Unified PostgreSQL (pins_daily_metrics).

  // Auto-heal non-zero reach & profile_views if profile record was degraded to 0
  let resolvedMonthlyReach = Number(profile.monthly_reach || 0);
  let resolvedProfileViews = Number(profile.profile_views || 0);
  if (resolvedMonthlyReach <= 0 && Array.isArray(snapshots) && snapshots.length > 0) {
    const latestWithReach = [...snapshots].reverse().find(s => Number(s.monthly_reach || 0) > 0);
    if (latestWithReach) {
      resolvedMonthlyReach = Number(latestWithReach.monthly_reach);
    }
  }
  if (resolvedProfileViews <= 0 && Array.isArray(snapshots) && snapshots.length > 0) {
    const latestWithViews = [...snapshots].reverse().find(s => Number(s.profile_views || 0) > 0);
    if (latestWithViews) {
      resolvedProfileViews = Number(latestWithViews.profile_views);
    }
  }

  // [INVARIANT: ZERO-READ-PATH-MUTATIONS]
  // Healed reach & views are resolved in-memory without issuing UPDATE on GET.

  return {
    profile: {
      ...profile,
      handle: `@${profile.username}`,
      monthly_reach: resolvedMonthlyReach,
      profile_views: resolvedProfileViews,
      follower_count: Number(profile.follower_count || 0),
      total_pins: Number(profile.total_pins || boards.reduce((acc, b) => acc + (b.pin_count || 0), 0) || aggStats.total_catalog_pins || 0),
      total_boards: Math.max(Number(profile.total_boards || 0), boards.length),
      website_domain: resolvedPrimaryDomain || (profile.website_url ? profile.website_url.replace(/^https?:\/\//, '').replace(/\/.*$/, '') : null),
      verified_domain: Boolean(resolvedPrimaryDomain || profile.website_url),
      notes: profile.bio || profileMeta?.notes || 'No internal notes set for this competitor.',
      last_pin_date: latestPinDateStr
    },
    domain_ecosystem: domainEcosystem,
    top_urls_count: Number(domainEcosystem.ecosystem_unique_urls || domainEcosystem.official_urls || 0),
    account_age: {
      days: accountAgeDays,
      created_at: accountCreatedDateStr
    },
    strategy_age: {
      days: strategyAgeDays,
      oldest_board_date: oldestBoardDateStr
    },
    engagement: {
      total_saves: totalSaves,
      total_shares: totalShares,
      delta_saves_24h: deltaSaves24h,
      delta_repins_24h: deltaRepins24h
    },
    pinning_velocity: {
      pins_per_day: pinningVelocity,
      pins_added: pinsAdded,
      days_span: daysSpan,
      pacing_estimate: pacingEstimate,
      winning_pins_count: winningPinsCount,
      winning_hit_rate_pct: winningHitRatePct,
      pins_per_winner: pinsPerWinner
    },
    deltas,
    snapshots: snapshots.map(s => ({
      id: s.id,
      competitor_id: s.competitor_id,
      monthly_reach: Number(s.monthly_reach || 0),
      profile_views: Number(s.profile_views || 0),
      follower_count: Number(s.follower_count || 0),
      total_pins: Number(s.total_pins || 0),
      total_boards: Number(s.total_boards || 0),
      recorded_date: s.recorded_date,
      metadata: s.metadata || {},
      created_at: s.created_at
    })),
    boards: boards.map(b => ({
      id: b.id,
      board_id: b.board_id,
      name: b.name,
      url: b.url,
      pin_count: Number(b.pin_count || 0),
      follower_count: Number(b.follower_count || 0),
      last_pinned_at: b.last_pinned_at,
      created_at: b.created_at || b.board_created_at || null
    }))
  };
}


/**
 * List all creator pins from 4-table SSOT inventory with rich filtering, sorting, and pagination
 * Supports scope: 'official' (default direct account pins), 'ecosystem' (official + third-party curator pins linking to primary domain), or 'curators' (third-party curator pins only).
 */
export async function listCompetitorAccountPins(sql, competitorIdOrUsername, {
  username = '',
  search = '',
  board = '',
  min_saves = 0,
  sort = 'saves_desc',
  page = 1,
  limit = 50,
  qualified_only = false,
  product_only = false,
  articles_only = false,
  ranked_only = false,
  stage = '',
  high_velocity = false,
  changed_only = false,
  scope = 'official'
} = {}) {
  let cleanUsername = username ? normalizePinterestUsername(username) : null;
  let numericId = parseInt(competitorIdOrUsername, 10);
  let primaryDomain = '';
  if (!cleanUsername && (isNaN(numericId) || !numericId)) {
    cleanUsername = normalizePinterestUsername(competitorIdOrUsername);
    numericId = null;
  }

  // 1. If username is known, ALWAYS resolve local numeric ID on this specific database instance
  if (cleanUsername) {
    try {
      const [c] = await sql`
        SELECT id, username, website_url FROM competitor_profiles 
        WHERE LOWER(username) = ${cleanUsername} 
        LIMIT 1;
      `;
      if (c) {
        numericId = c.id;
        cleanUsername = c.username;
        primaryDomain = c.website_url ? c.website_url.toLowerCase().trim().replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '').replace(/^www\./, '') : '';
      }
    } catch (_) {}
  } else if (!isNaN(numericId) && numericId) {
    try {
      const [c] = await sql`
        SELECT id, username, website_url FROM competitor_profiles 
        WHERE id = ${numericId} 
        LIMIT 1;
      `;
      if (c) {
        cleanUsername = c.username;
        primaryDomain = c.website_url ? c.website_url.toLowerCase().trim().replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '').replace(/^www\./, '') : '';
      } else {
        numericId = null;
      }
    } catch (_) {}
  }

  if (primaryDomain && (primaryDomain.includes('pinterest.') || primaryDomain.includes('pin.it'))) {
    primaryDomain = '';
  }

  if (!numericId) {
    return { pins: [], total: 0, qualified_total: 0, page: 1, limit, total_pages: 0, boards: [] };
  }

  const normCreatorUser = (cleanUsername || '').toLowerCase().trim();

  if (!primaryDomain) {
    try {
      const [domRow] = await sql`
        WITH direct_pins AS (
          SELECT DISTINCT ON (pin_id) pin_id, clean_domain, save_count
          FROM (
            SELECT cbp.pin_id, ump.clean_domain, ump.save_count, 0 AS src_priority
            FROM competitor_board_pins cbp
            JOIN universal_master_pins ump ON ump.pin_id = cbp.pin_id
            WHERE cbp.competitor_id = ${numericId}
              AND ump.pin_id ~ '^[0-9]{10,30}$'
            UNION ALL
            SELECT ump.pin_id, ump.clean_domain, ump.save_count, 1 AS src_priority
            FROM universal_master_pins ump
            WHERE ${normCreatorUser} <> ''
              AND ump.pin_id ~ '^[0-9]{10,30}$'
              AND LOWER(LTRIM(BTRIM(COALESCE(ump.creator_username, '')), '@')) = ${normCreatorUser}
          ) dp_raw
          ORDER BY pin_id, src_priority ASC
        )
        SELECT COALESCE(clean_domain, '') AS clean_dom
        FROM direct_pins
        WHERE COALESCE(clean_domain, '') <> ''
          AND clean_domain NOT ILIKE '%pinterest.%'
          AND clean_domain NOT ILIKE '%pin.it%'
          AND clean_domain NOT ILIKE '%amazon.%'
          AND clean_domain NOT ILIKE '%etsy.%'
        GROUP BY clean_dom
        ORDER BY COUNT(*) DESC, SUM(COALESCE(save_count, 0)) DESC
        LIMIT 1;
      `;
      if (domRow?.clean_dom) {
        primaryDomain = domRow.clean_dom;
      }
    } catch (_) {}
  }

  // [INVARIANT: ONE-WAY-PROMOTION] 4-Table SSOT: competitor_board_pins joins universal_master_pins

  const pNum = Math.max(1, parseInt(page, 10) || 1);
  const pLim = Math.max(1, Math.min(parseInt(limit, 10) || 50, 1000));
  const offset = (pNum - 1) * pLim;

  const minSavesNum = Math.max(0, parseInt(min_saves, 10) || 0);
  const cleanSearch = (search && typeof search === 'string' && search.trim()) ? escapeSqlWildcards(search.toLowerCase().trim()) : null;
  const searchPattern = cleanSearch ? `%${cleanSearch}%` : null;
  const boardPattern = (board && board.trim()) ? board.trim().toLowerCase() : null;
  const rawSlug = boardPattern ? boardPattern.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') : null;
  const cleanBoardSlug = (rawSlug && rawSlug.length > 0) ? rawSlug : null;
  const stageFilter = (stage && typeof stage === 'string' && stage.trim()) ? stage.trim().toUpperCase() : null;
  const isHighVelocity = Boolean(high_velocity);
  const isChangedOnly = Boolean(changed_only);
  const activeScope = (scope === 'ecosystem' || scope === 'curators' || scope === 'external' || scope === 'domain_only') && primaryDomain
    ? scope
    : (scope === 'all' ? 'all' : 'official');
  const restrictToPrimaryDomain = activeScope === 'domain_only' && Boolean(primaryDomain);

  const boardsPromise = sql`
    WITH direct_pins AS (
      SELECT DISTINCT ON (pin_id) pin_id, board_name, clean_domain
      FROM (
        SELECT cbp.pin_id, ump.board_name, ump.clean_domain, 0 AS src_priority
        FROM competitor_board_pins cbp
        JOIN universal_master_pins ump ON ump.pin_id = cbp.pin_id
        WHERE cbp.competitor_id = ${numericId}
          AND ump.pin_id ~ '^[0-9]{10,30}$'
        UNION ALL
        SELECT ump.pin_id, ump.board_name, ump.clean_domain, 1 AS src_priority
        FROM universal_master_pins ump
        WHERE ump.pin_id ~ '^[0-9]{10,30}$'
          AND (
            (${normCreatorUser} <> '' AND LOWER(LTRIM(BTRIM(COALESCE(ump.creator_username, '')), '@')) = ${normCreatorUser})
            OR (
              ${primaryDomain} <> ''
              AND ump.clean_domain = ${primaryDomain}
              AND LOWER(LTRIM(BTRIM(COALESCE(ump.creator_username, '')), '@')) IN ('', 'uploaded by user', 'uploaded by pinner', 'anonymous', 'community_curator')
            )
          )
      ) dp_raw
      ORDER BY pin_id, src_priority ASC
    )
    SELECT DISTINCT COALESCE(NULLIF(TRIM(dp.board_name), ''), 'General') AS board_name, COUNT(*)::int as count
    FROM direct_pins dp
    WHERE dp.board_name IS NOT NULL AND TRIM(dp.board_name) <> ''
      AND (
        ${restrictToPrimaryDomain} = FALSE
        OR COALESCE(dp.clean_domain, '') IN ('', 'uploaded by user', 'uploaded-by-user', 'organic', ${primaryDomain})
        OR dp.clean_domain ILIKE '%pinterest.%'
        OR dp.clean_domain ILIKE '%pin.it%'
      )
    GROUP BY board_name
    ORDER BY count DESC;
  `;

  // [OPTIMIZED SARGABLE: 4-Table SSOT join with keyword_serp_positions]
  // V4 Zero-Exclusion: 'official'/'domain_only' query direct creator pins (with UMP fallback if cbp empty);
  // 'all' queries direct creator pins + primary-domain curator pins when primaryDomain exists.
  const isDirectCatalogScope = activeScope === 'official' || activeScope === 'domain_only' || (activeScope === 'all' && !primaryDomain);
  const rowsPromise = isDirectCatalogScope
    ? (ranked_only
      ? sql`
    WITH direct_pins AS (
      SELECT DISTINCT ON (pin_id) *
      FROM (
        SELECT
          cbp.competitor_id,
          cbp.board_id,
          cbp.pin_id,
          cb.name AS cb_board_name,
          ump.title,
          ump.description,
          ump.clean_domain,
          ump.domain,
          ump.destination_url,
          ump.board_name,
          ump.board_slug,
          ump.image_url,
          ump.save_count,
          ump.repin_count,
          ump.comment_count,
          ump.share_count,
          ump.daily_save_velocity,
          ump.delta_saves_24h,
          ump.delta_repins_24h,
          ump.dominant_color,
          ump.visual_annotations,
          ump.alt_text,
          ump.created_at_pinterest,
          ump.first_discovered_at,
          ump.updated_at,
          ump.is_product,
          0 AS src_priority
        FROM competitor_board_pins cbp
        JOIN universal_master_pins ump ON ump.pin_id = cbp.pin_id
        LEFT JOIN competitor_boards cb ON cb.competitor_id = cbp.competitor_id AND cb.board_id = cbp.board_id
        WHERE cbp.competitor_id = ${numericId}
          AND ump.pin_id ~ '^[0-9]{10,30}$'
        UNION ALL
        SELECT
          ${numericId}::int AS competitor_id,
          NULL::text AS board_id,
          ump.pin_id,
          NULL::text AS cb_board_name,
          ump.title,
          ump.description,
          ump.clean_domain,
          ump.domain,
          ump.destination_url,
          ump.board_name,
          ump.board_slug,
          ump.image_url,
          ump.save_count,
          ump.repin_count,
          ump.comment_count,
          ump.share_count,
          ump.daily_save_velocity,
          ump.delta_saves_24h,
          ump.delta_repins_24h,
          ump.dominant_color,
          ump.visual_annotations,
          ump.alt_text,
          ump.created_at_pinterest,
          ump.first_discovered_at,
          ump.updated_at,
          ump.is_product,
          1 AS src_priority
        FROM universal_master_pins ump
        WHERE ump.pin_id ~ '^[0-9]{10,30}$'
          AND (
            (${normCreatorUser} <> '' AND LOWER(LTRIM(BTRIM(COALESCE(ump.creator_username, '')), '@')) = ${normCreatorUser})
            OR (
              ${primaryDomain} <> ''
              AND ump.clean_domain = ${primaryDomain}
              AND LOWER(LTRIM(BTRIM(COALESCE(ump.creator_username, '')), '@')) IN ('', 'uploaded by user', 'uploaded by pinner', 'anonymous', 'community_curator')
            )
          )
      ) dp_raw
      ORDER BY pin_id, src_priority ASC
    )
    SELECT 
      dp.competitor_id,
      dp.board_id,
      dp.pin_id,
      'official'::text AS attribution_source,
      ${cleanUsername || ''}::text AS curator_username,
      COALESCE(dp.title, '') AS title,
      COALESCE(dp.description, '') AS description,
      COALESCE(dp.clean_domain, dp.domain, '') AS link_domain,
      COALESCE(dp.destination_url, '') AS destination_url,
      COALESCE(dp.cb_board_name, dp.board_name, '') AS board_name,
      dp.board_slug,
      COALESCE(dp.image_url, '') AS image_url,
      COALESCE(dp.save_count, 0)::bigint AS save_count,
      COALESCE(dp.repin_count, 0)::bigint AS repin_count,
      COALESCE(dp.comment_count, 0)::int AS comment_count,
      COALESCE(dp.share_count, 0)::bigint AS share_count,
      COALESCE(dp.daily_save_velocity, 0)::numeric AS velocity,
      dp.delta_saves_24h::numeric AS delta_saves_24h,
      COALESCE(dp.delta_repins_24h, 0)::numeric AS delta_repins_24h,
      COALESCE(NULLIF(dp.dominant_color, '#888888'), '#888888') AS dominant_color,
      COALESCE(
        CASE WHEN jsonb_typeof(dp.visual_annotations) = 'array' AND jsonb_array_length(dp.visual_annotations) > 0 THEN dp.visual_annotations ELSE NULL END,
        '[]'::jsonb
      ) AS annotations,
      '{}'::jsonb AS reactions,
      COALESCE(dp.alt_text, '') AS alt_text,
      dp.created_at_pinterest,
      dp.first_discovered_at AS first_seen_at,
      dp.updated_at AS last_seen_at,
      (
        COALESCE(dp.is_product, false) OR 
        COALESCE(dp.clean_domain ILIKE '%etsy%' OR dp.clean_domain ILIKE '%shopify%' OR dp.clean_domain ILIKE '%amazon%' OR dp.destination_url ILIKE '%/listing/%' OR dp.destination_url ILIKE '%/product/%' OR dp.destination_url ILIKE '%/item/%' OR dp.destination_url ILIKE '%gumroad.com%', false)
      ) AS is_product,
      (COALESCE(dp.save_count, 0) >= 100 OR COALESCE(dp.daily_save_velocity, 0) >= 3.5) AS is_qualified,
      ((ksp.rank_position IS NOT NULL OR ksp.last_known_rank IS NOT NULL) AND ksp.is_displaced = FALSE) AS is_ranked,
      COALESCE(ksp.rank_position, ksp.last_known_rank) AS rank_position,
      CASE WHEN ksp.is_displaced = FALSE THEN ksp.rank_position ELSE NULL END AS active_serp_rank,
      ksp.active_keyword,
      COUNT(*) OVER()::int AS full_count
    FROM direct_pins dp
    LEFT JOIN LATERAL (
      SELECT ksp_sub.rank_position, k.keyword AS active_keyword, ksp_sub.last_known_rank, ksp_sub.is_displaced
      FROM keyword_serp_positions ksp_sub
      LEFT JOIN tracked_keywords k ON k.id = ksp_sub.keyword_id
      WHERE ksp_sub.pin_id = dp.pin_id
        AND NOT EXISTS (
          SELECT 1 FROM keyword_ignored_pins kip
          WHERE kip.keyword_id = ksp_sub.keyword_id AND kip.pin_id = ksp_sub.pin_id
        )
      ORDER BY ksp_sub.is_displaced ASC, ksp_sub.rank_position ASC NULLS LAST, ksp_sub.last_known_rank ASC NULLS LAST
      LIMIT 1
    ) ksp ON TRUE
    WHERE (
        ${restrictToPrimaryDomain} = FALSE
        OR COALESCE(dp.clean_domain, '') IN ('', 'uploaded by user', 'uploaded-by-user', 'organic', ${primaryDomain})
        OR dp.clean_domain ILIKE '%pinterest.%'
        OR dp.clean_domain ILIKE '%pin.it%'
      )
      AND (ksp.rank_position IS NOT NULL OR ksp.last_known_rank IS NOT NULL)
      AND ksp.is_displaced = FALSE
      AND (${minSavesNum} = 0 OR COALESCE(dp.save_count, 0) >= ${minSavesNum})
      AND (${searchPattern}::text IS NULL OR LOWER(COALESCE(dp.title, '')) LIKE ${searchPattern} ESCAPE '\\' OR LOWER(COALESCE(dp.description, '')) LIKE ${searchPattern} ESCAPE '\\')
      AND (${cleanBoardSlug}::text IS NULL OR dp.board_slug = ${cleanBoardSlug})
      AND (${qualified_only} = FALSE OR (COALESCE(dp.save_count, 0) >= 100 OR COALESCE(dp.daily_save_velocity, 0) >= 3.5))
      AND (${isHighVelocity} = FALSE OR COALESCE(dp.daily_save_velocity, 0) >= 10)
      AND (${isChangedOnly} = FALSE OR COALESCE(dp.daily_save_velocity, 0) > 0)
      AND (
        ${stageFilter}::text IS NULL OR
        (${stageFilter} = 'DORMANT' AND COALESCE(dp.daily_save_velocity, 0) < 0.5) OR
        (${stageFilter} = 'COOLING' AND COALESCE(dp.daily_save_velocity, 0) >= 0.5 AND COALESCE(dp.daily_save_velocity, 0) < 2.0 AND (COALESCE(dp.created_at_pinterest, dp.first_discovered_at) < NOW() - INTERVAL '14 days' OR COALESCE(dp.created_at_pinterest, dp.first_discovered_at) IS NULL)) OR
        (${stageFilter} = 'NEW' AND COALESCE(dp.daily_save_velocity, 0) >= 0.5 AND COALESCE(dp.created_at_pinterest, dp.first_discovered_at) >= NOW() - INTERVAL '14 days') OR
        (${stageFilter} = 'GROWING' AND COALESCE(dp.daily_save_velocity, 0) >= 10.0 AND (COALESCE(dp.created_at_pinterest, dp.first_discovered_at) < NOW() - INTERVAL '14 days' OR COALESCE(dp.created_at_pinterest, dp.first_discovered_at) IS NULL)) OR
        (${stageFilter} = 'MATURE' AND COALESCE(dp.daily_save_velocity, 0) >= 2.0 AND COALESCE(dp.daily_save_velocity, 0) < 10.0 AND (COALESCE(dp.created_at_pinterest, dp.first_discovered_at) < NOW() - INTERVAL '14 days' OR COALESCE(dp.created_at_pinterest, dp.first_discovered_at) IS NULL))
      )
      AND (${product_only} = FALSE OR (
        COALESCE(dp.is_product, false) OR 
        COALESCE(dp.clean_domain ILIKE '%etsy%' OR dp.clean_domain ILIKE '%shopify%' OR dp.clean_domain ILIKE '%amazon%' OR dp.destination_url ILIKE '%/listing/%' OR dp.destination_url ILIKE '%/product/%' OR dp.destination_url ILIKE '%/item/%' OR dp.destination_url ILIKE '%gumroad.com%', false)
      ) = TRUE)
      AND (${articles_only} = FALSE OR (
        COALESCE(dp.is_product, false) = FALSE AND 
        COALESCE(dp.clean_domain ILIKE '%etsy%' OR dp.clean_domain ILIKE '%shopify%' OR dp.clean_domain ILIKE '%amazon%' OR dp.destination_url ILIKE '%/listing/%' OR dp.destination_url ILIKE '%/product/%' OR dp.destination_url ILIKE '%/item/%' OR dp.destination_url ILIKE '%gumroad.com%', false) = FALSE
      ))
    ORDER BY 
      CASE WHEN ${sort} = 'saves_desc' THEN dp.save_count END DESC NULLS LAST,
      CASE WHEN ${sort} = 'repins_desc' THEN dp.repin_count END DESC NULLS LAST,
      CASE WHEN ${sort} = 'velocity' OR ${sort} = 'velocity_desc' THEN dp.daily_save_velocity END DESC NULLS LAST,
      CASE WHEN ${sort} = 'comments' OR ${sort} = 'comments_desc' THEN dp.comment_count END DESC NULLS LAST,
      CASE WHEN ${sort} = 'newest' OR ${sort} = 'created_desc' THEN dp.created_at_pinterest END DESC NULLS LAST,
      CASE WHEN ${sort} = 'oldest' OR ${sort} = 'created_asc' THEN dp.created_at_pinterest END ASC NULLS LAST,
      dp.save_count DESC NULLS LAST
    LIMIT ${pLim} OFFSET ${offset};
  `
      : sql`
    WITH direct_pins AS (
      SELECT DISTINCT ON (pin_id) *
      FROM (
        SELECT
          cbp.competitor_id,
          cbp.board_id,
          cbp.pin_id,
          cb.name AS cb_board_name,
          ump.title,
          ump.description,
          COALESCE(ump.clean_domain, ump.domain, '') AS clean_domain,
          ump.destination_url,
          ump.board_name,
          ump.board_slug,
          ump.image_url,
          ump.save_count,
          ump.repin_count,
          ump.comment_count,
          ump.share_count,
          ump.daily_save_velocity,
          ump.delta_saves_24h,
          ump.delta_repins_24h,
          ump.dominant_color,
          ump.visual_annotations,
          ump.alt_text,
          ump.created_at_pinterest,
          ump.first_discovered_at,
          ump.updated_at,
          ump.is_product,
          0 AS src_priority
        FROM competitor_board_pins cbp
        JOIN universal_master_pins ump ON ump.pin_id = cbp.pin_id
        LEFT JOIN competitor_boards cb ON cb.competitor_id = cbp.competitor_id AND cb.board_id = cbp.board_id
        WHERE cbp.competitor_id = ${numericId}
          AND ump.pin_id ~ '^[0-9]{10,30}$'
        UNION ALL
        SELECT
          ${numericId}::int AS competitor_id,
          NULL::text AS board_id,
          ump.pin_id,
          NULL::text AS cb_board_name,
          ump.title,
          ump.description,
          COALESCE(ump.clean_domain, ump.domain, '') AS clean_domain,
          ump.destination_url,
          ump.board_name,
          ump.board_slug,
          ump.image_url,
          ump.save_count,
          ump.repin_count,
          ump.comment_count,
          ump.share_count,
          ump.daily_save_velocity,
          ump.delta_saves_24h,
          ump.delta_repins_24h,
          ump.dominant_color,
          ump.visual_annotations,
          ump.alt_text,
          ump.created_at_pinterest,
          ump.first_discovered_at,
          ump.updated_at,
          ump.is_product,
          1 AS src_priority
        FROM universal_master_pins ump
        WHERE ump.pin_id ~ '^[0-9]{10,30}$'
          AND (
            (${normCreatorUser} <> '' AND LOWER(LTRIM(BTRIM(COALESCE(ump.creator_username, '')), '@')) = ${normCreatorUser})
            OR (
              ${primaryDomain} <> ''
              AND ump.clean_domain = ${primaryDomain}
              AND LOWER(LTRIM(BTRIM(COALESCE(ump.creator_username, '')), '@')) IN ('', 'uploaded by user', 'uploaded by pinner', 'anonymous', 'community_curator')
            )
          )
      ) dp_raw
      ORDER BY pin_id, src_priority ASC
    ),
    filtered_pins AS (
      SELECT 
        dp.*,
        COUNT(*) OVER()::int AS full_count
      FROM direct_pins dp
      WHERE (
          ${restrictToPrimaryDomain} = FALSE
          OR COALESCE(dp.clean_domain, '') IN ('', 'uploaded by user', 'uploaded-by-user', 'organic', ${primaryDomain})
          OR dp.clean_domain ILIKE '%pinterest.%'
          OR dp.clean_domain ILIKE '%pin.it%'
        )
        AND (${minSavesNum} = 0 OR COALESCE(dp.save_count, 0) >= ${minSavesNum})
        AND (${searchPattern}::text IS NULL OR LOWER(COALESCE(dp.title, '')) LIKE ${searchPattern} ESCAPE '\\' OR LOWER(COALESCE(dp.description, '')) LIKE ${searchPattern} ESCAPE '\\')
        AND (${cleanBoardSlug}::text IS NULL OR dp.board_slug = ${cleanBoardSlug})
        AND (${qualified_only} = FALSE OR (COALESCE(dp.save_count, 0) >= 100 OR COALESCE(dp.daily_save_velocity, 0) >= 3.5))
        AND (${isHighVelocity} = FALSE OR COALESCE(dp.daily_save_velocity, 0) >= 10)
        AND (${isChangedOnly} = FALSE OR COALESCE(dp.daily_save_velocity, 0) > 0)
        AND (
          ${stageFilter}::text IS NULL OR
          (${stageFilter} = 'DORMANT' AND COALESCE(dp.daily_save_velocity, 0) < 0.5) OR
          (${stageFilter} = 'COOLING' AND COALESCE(dp.daily_save_velocity, 0) >= 0.5 AND COALESCE(dp.daily_save_velocity, 0) < 2.0 AND (COALESCE(dp.created_at_pinterest, dp.first_discovered_at) < NOW() - INTERVAL '14 days' OR COALESCE(dp.created_at_pinterest, dp.first_discovered_at) IS NULL)) OR
          (${stageFilter} = 'NEW' AND COALESCE(dp.daily_save_velocity, 0) >= 0.5 AND COALESCE(dp.created_at_pinterest, dp.first_discovered_at) >= NOW() - INTERVAL '14 days') OR
          (${stageFilter} = 'GROWING' AND COALESCE(dp.daily_save_velocity, 0) >= 10.0 AND (COALESCE(dp.created_at_pinterest, dp.first_discovered_at) < NOW() - INTERVAL '14 days' OR COALESCE(dp.created_at_pinterest, dp.first_discovered_at) IS NULL)) OR
          (${stageFilter} = 'MATURE' AND COALESCE(dp.daily_save_velocity, 0) >= 2.0 AND COALESCE(dp.daily_save_velocity, 0) < 10.0 AND (COALESCE(dp.created_at_pinterest, dp.first_discovered_at) < NOW() - INTERVAL '14 days' OR COALESCE(dp.created_at_pinterest, dp.first_discovered_at) IS NULL))
        )
        AND (${product_only} = FALSE OR (
          COALESCE(dp.is_product, false) OR 
          COALESCE(dp.clean_domain ILIKE '%etsy%' OR dp.clean_domain ILIKE '%shopify%' OR dp.clean_domain ILIKE '%amazon%' OR dp.destination_url ILIKE '%/listing/%' OR dp.destination_url ILIKE '%/product/%' OR dp.destination_url ILIKE '%/item/%' OR dp.destination_url ILIKE '%gumroad.com%', false)
        ) = TRUE)
        AND (${articles_only} = FALSE OR (
          COALESCE(dp.is_product, false) = FALSE AND 
          COALESCE(dp.clean_domain ILIKE '%etsy%' OR dp.clean_domain ILIKE '%shopify%' OR dp.clean_domain ILIKE '%amazon%' OR dp.destination_url ILIKE '%/listing/%' OR dp.destination_url ILIKE '%/product/%' OR dp.destination_url ILIKE '%/item/%' OR dp.destination_url ILIKE '%gumroad.com%', false) = FALSE
        ))
      ORDER BY 
        CASE WHEN ${sort} = 'saves_desc' THEN dp.save_count END DESC NULLS LAST,
        CASE WHEN ${sort} = 'repins_desc' THEN dp.repin_count END DESC NULLS LAST,
        CASE WHEN ${sort} = 'velocity' OR ${sort} = 'velocity_desc' THEN dp.daily_save_velocity END DESC NULLS LAST,
        CASE WHEN ${sort} = 'comments' OR ${sort} = 'comments_desc' THEN dp.comment_count END DESC NULLS LAST,
        CASE WHEN ${sort} = 'newest' OR ${sort} = 'created_desc' THEN dp.created_at_pinterest END DESC NULLS LAST,
        CASE WHEN ${sort} = 'oldest' OR ${sort} = 'created_asc' THEN dp.created_at_pinterest END ASC NULLS LAST,
        dp.save_count DESC NULLS LAST
      LIMIT ${pLim} OFFSET ${offset}
    )
    SELECT 
      fp.competitor_id,
      fp.board_id,
      fp.pin_id,
      'official'::text AS attribution_source,
      ${cleanUsername || ''}::text AS curator_username,
      COALESCE(fp.title, '') AS title,
      COALESCE(fp.description, '') AS description,
      COALESCE(fp.clean_domain, '') AS link_domain,
      COALESCE(fp.destination_url, '') AS destination_url,
      COALESCE(fp.cb_board_name, fp.board_name, '') AS board_name,
      fp.board_slug,
      COALESCE(fp.image_url, '') AS image_url,
      COALESCE(fp.save_count, 0)::bigint AS save_count,
      COALESCE(fp.repin_count, 0)::bigint AS repin_count,
      COALESCE(fp.comment_count, 0)::int AS comment_count,
      COALESCE(fp.share_count, 0)::bigint AS share_count,
      COALESCE(fp.daily_save_velocity, 0)::numeric AS velocity,
      fp.delta_saves_24h::numeric AS delta_saves_24h,
      COALESCE(fp.delta_repins_24h, 0)::numeric AS delta_repins_24h,
      COALESCE(NULLIF(fp.dominant_color, '#888888'), '#888888') AS dominant_color,
      COALESCE(
        CASE WHEN jsonb_typeof(fp.visual_annotations) = 'array' AND jsonb_array_length(fp.visual_annotations) > 0 THEN fp.visual_annotations ELSE NULL END,
        '[]'::jsonb
      ) AS annotations,
      '{}'::jsonb AS reactions,
      COALESCE(fp.alt_text, '') AS alt_text,
      fp.created_at_pinterest,
      fp.first_discovered_at AS first_seen_at,
      fp.updated_at AS last_seen_at,
      (
        COALESCE(fp.is_product, false) OR 
        COALESCE(fp.clean_domain ILIKE '%etsy%' OR fp.clean_domain ILIKE '%shopify%' OR fp.clean_domain ILIKE '%amazon%' OR fp.destination_url ILIKE '%/listing/%' OR fp.destination_url ILIKE '%/product/%' OR fp.destination_url ILIKE '%/item/%' OR fp.destination_url ILIKE '%gumroad.com%', false)
      ) AS is_product,
      (COALESCE(fp.save_count, 0) >= 100 OR COALESCE(fp.daily_save_velocity, 0) >= 3.5) AS is_qualified,
      ((ksp.rank_position IS NOT NULL OR ksp.last_known_rank IS NOT NULL) AND ksp.is_displaced = FALSE) AS is_ranked,
      COALESCE(ksp.rank_position, ksp.last_known_rank) AS rank_position,
      CASE WHEN ksp.is_displaced = FALSE THEN ksp.rank_position ELSE NULL END AS active_serp_rank,
      ksp.active_keyword,
      fp.full_count
    FROM filtered_pins fp
    LEFT JOIN LATERAL (
      SELECT ksp_sub.rank_position, k.keyword AS active_keyword, ksp_sub.last_known_rank, ksp_sub.is_displaced
      FROM keyword_serp_positions ksp_sub
      LEFT JOIN tracked_keywords k ON k.id = ksp_sub.keyword_id
      WHERE ksp_sub.pin_id = fp.pin_id
        AND NOT EXISTS (
          SELECT 1 FROM keyword_ignored_pins kip
          WHERE kip.keyword_id = ksp_sub.keyword_id AND kip.pin_id = ksp_sub.pin_id
        )
      ORDER BY ksp_sub.is_displaced ASC, ksp_sub.rank_position ASC NULLS LAST, ksp_sub.last_known_rank ASC NULLS LAST
      LIMIT 1
    ) ksp ON TRUE
    ORDER BY 
      CASE WHEN ${sort} = 'saves_desc' THEN fp.save_count END DESC NULLS LAST,
      CASE WHEN ${sort} = 'repins_desc' THEN fp.repin_count END DESC NULLS LAST,
      CASE WHEN ${sort} = 'velocity' OR ${sort} = 'velocity_desc' THEN fp.daily_save_velocity END DESC NULLS LAST,
      CASE WHEN ${sort} = 'comments' OR ${sort} = 'comments_desc' THEN fp.comment_count END DESC NULLS LAST,
      CASE WHEN ${sort} = 'newest' OR ${sort} = 'created_desc' THEN fp.created_at_pinterest END DESC NULLS LAST,
      CASE WHEN ${sort} = 'oldest' OR ${sort} = 'created_asc' THEN fp.created_at_pinterest END ASC NULLS LAST,
      fp.save_count DESC NULLS LAST;
  `)
    : sql`
    WITH direct_pins AS (
      SELECT DISTINCT ON (pin_id) *
      FROM (
        SELECT
          cbp.competitor_id,
          cbp.board_id,
          cbp.pin_id,
          cb.name AS cb_board_name,
          ump.title,
          ump.description,
          ump.clean_domain,
          ump.domain,
          ump.destination_url,
          ump.board_name,
          ump.board_slug,
          ump.image_url,
          ump.save_count,
          ump.repin_count,
          ump.comment_count,
          ump.share_count,
          ump.daily_save_velocity,
          ump.delta_saves_24h,
          ump.delta_repins_24h,
          ump.dominant_color,
          ump.visual_annotations,
          ump.alt_text,
          ump.created_at_pinterest,
          ump.first_discovered_at,
          ump.updated_at,
          ump.is_product,
          0 AS src_priority
        FROM competitor_board_pins cbp
        JOIN universal_master_pins ump ON ump.pin_id = cbp.pin_id
        LEFT JOIN competitor_boards cb ON cb.competitor_id = cbp.competitor_id AND cb.board_id = cbp.board_id
        WHERE cbp.competitor_id = ${numericId}
          AND ump.pin_id ~ '^[0-9]{10,30}$'
        UNION ALL
        SELECT
          ${numericId}::int AS competitor_id,
          NULL::text AS board_id,
          ump.pin_id,
          NULL::text AS cb_board_name,
          ump.title,
          ump.description,
          ump.clean_domain,
          ump.domain,
          ump.destination_url,
          ump.board_name,
          ump.board_slug,
          ump.image_url,
          ump.save_count,
          ump.repin_count,
          ump.comment_count,
          ump.share_count,
          ump.daily_save_velocity,
          ump.delta_saves_24h,
          ump.delta_repins_24h,
          ump.dominant_color,
          ump.visual_annotations,
          ump.alt_text,
          ump.created_at_pinterest,
          ump.first_discovered_at,
          ump.updated_at,
          ump.is_product,
          1 AS src_priority
        FROM universal_master_pins ump
        WHERE ump.pin_id ~ '^[0-9]{10,30}$'
          AND (
            (${normCreatorUser} <> '' AND LOWER(LTRIM(BTRIM(COALESCE(ump.creator_username, '')), '@')) = ${normCreatorUser})
            OR (
              ${primaryDomain} <> ''
              AND ump.clean_domain = ${primaryDomain}
              AND LOWER(LTRIM(BTRIM(COALESCE(ump.creator_username, '')), '@')) IN ('', 'uploaded by user', 'uploaded by pinner', 'anonymous', 'community_curator')
            )
          )
      ) dp_raw
      ORDER BY pin_id, src_priority ASC
    ),
    eco_pool AS (
      SELECT
        dp.competitor_id,
        dp.board_id,
        dp.pin_id,
        CASE WHEN ${activeScope} = 'external' THEN 'external'::text ELSE 'official'::text END AS attribution_source,
        ${cleanUsername || ''}::text AS curator_username,
        COALESCE(dp.title, '') AS title,
        COALESCE(dp.description, '') AS description,
        COALESCE(dp.clean_domain, dp.domain, '') AS link_domain,
        COALESCE(dp.destination_url, '') AS destination_url,
        COALESCE(dp.cb_board_name, dp.board_name, '') AS board_name,
        dp.board_slug,
        COALESCE(dp.image_url, '') AS image_url,
        COALESCE(dp.save_count, 0)::bigint AS save_count,
        COALESCE(dp.repin_count, 0)::bigint AS repin_count,
        COALESCE(dp.comment_count, 0)::int AS comment_count,
        COALESCE(dp.share_count, 0)::bigint AS share_count,
        COALESCE(dp.daily_save_velocity, 0)::numeric AS velocity,
        dp.delta_saves_24h::numeric AS delta_saves_24h,
        COALESCE(dp.delta_repins_24h, 0)::numeric AS delta_repins_24h,
        COALESCE(NULLIF(dp.dominant_color, '#888888'), '#888888') AS dominant_color,
        COALESCE(CASE WHEN jsonb_typeof(dp.visual_annotations) = 'array' AND jsonb_array_length(dp.visual_annotations) > 0 THEN dp.visual_annotations ELSE NULL END, '[]'::jsonb) AS annotations,
        '{}'::jsonb AS reactions,
        COALESCE(dp.alt_text, '') AS alt_text,
        dp.created_at_pinterest,
        dp.first_discovered_at AS first_seen_at,
        dp.updated_at AS last_seen_at,
        (
          COALESCE(dp.is_product, false) OR
          COALESCE(dp.clean_domain ILIKE '%etsy%' OR dp.clean_domain ILIKE '%shopify%' OR dp.clean_domain ILIKE '%amazon%' OR dp.destination_url ILIKE '%/listing/%' OR dp.destination_url ILIKE '%/product/%' OR dp.destination_url ILIKE '%/item/%' OR dp.destination_url ILIKE '%gumroad.com%', false)
        ) AS is_product
      FROM direct_pins dp
      WHERE ${activeScope} <> 'curators'
        AND (
          ${activeScope} = 'all'
          OR (${activeScope} = 'ecosystem' AND (
            ${primaryDomain} = ''
            OR COALESCE(dp.clean_domain, '') IN ('', 'uploaded by user', 'uploaded-by-user', 'organic', ${primaryDomain})
            OR dp.clean_domain ILIKE '%pinterest.%'
            OR dp.clean_domain ILIKE '%pin.it%'
          ))
          OR (${activeScope} = 'external' AND ${primaryDomain} <> '' AND (
            COALESCE(dp.clean_domain, '') NOT IN ('', 'uploaded by user', 'uploaded-by-user', 'organic', ${primaryDomain})
            AND dp.clean_domain NOT ILIKE '%pinterest.%'
            AND dp.clean_domain NOT ILIKE '%pin.it%'
          ))
        )
      UNION ALL
      SELECT
        ${numericId}::int AS competitor_id,
        NULL::text AS board_id,
        ump.pin_id,
        'curator'::text AS attribution_source,
        COALESCE(NULLIF(ump.creator_username, ''), 'community_curator') AS curator_username,
        COALESCE(ump.title, '') AS title,
        COALESCE(ump.description, '') AS description,
        COALESCE(ump.clean_domain, ump.domain, '') AS link_domain,
        COALESCE(ump.destination_url, '') AS destination_url,
        COALESCE(ump.board_name, '') AS board_name,
        ump.board_slug,
        COALESCE(ump.image_url, '') AS image_url,
        COALESCE(ump.save_count, 0)::bigint AS save_count,
        COALESCE(ump.repin_count, 0)::bigint AS repin_count,
        COALESCE(ump.comment_count, 0)::int AS comment_count,
        COALESCE(ump.share_count, 0)::bigint AS share_count,
        COALESCE(ump.daily_save_velocity, 0)::numeric AS velocity,
        ump.delta_saves_24h::numeric AS delta_saves_24h,
        COALESCE(ump.delta_repins_24h, 0)::numeric AS delta_repins_24h,
        COALESCE(NULLIF(ump.dominant_color, '#888888'), '#888888') AS dominant_color,
        COALESCE(CASE WHEN jsonb_typeof(ump.visual_annotations) = 'array' AND jsonb_array_length(ump.visual_annotations) > 0 THEN ump.visual_annotations ELSE NULL END, '[]'::jsonb) AS annotations,
        '{}'::jsonb AS reactions,
        COALESCE(ump.alt_text, '') AS alt_text,
        ump.created_at_pinterest,
        ump.first_discovered_at AS first_seen_at,
        ump.updated_at AS last_seen_at,
        (
          COALESCE(ump.is_product, false) OR
          COALESCE(ump.clean_domain ILIKE '%etsy%' OR ump.clean_domain ILIKE '%shopify%' OR ump.clean_domain ILIKE '%amazon%' OR ump.destination_url ILIKE '%/listing/%' OR ump.destination_url ILIKE '%/product/%' OR ump.destination_url ILIKE '%/item/%' OR ump.destination_url ILIKE '%gumroad.com%', false)
        ) AS is_product
      FROM universal_master_pins ump
      WHERE ${activeScope} IN ('ecosystem', 'curators', 'all')
        AND ${primaryDomain} <> ''
        AND ump.pin_id ~ '^[0-9]{10,30}$'
        AND ump.clean_domain = ${primaryDomain}
        AND LOWER(LTRIM(BTRIM(COALESCE(ump.creator_username, '')), '@')) NOT IN ('', 'uploaded by user', 'uploaded by pinner', 'anonymous', 'community_curator', ${normCreatorUser})
        AND NOT EXISTS (
          SELECT 1 FROM direct_pins dp_ex
          WHERE dp_ex.pin_id = ump.pin_id
        )
    )
    SELECT
      ep.*,
      (ep.save_count >= 100 OR ep.velocity >= 3.5) AS is_qualified,
      ((ksp.rank_position IS NOT NULL OR ksp.last_known_rank IS NOT NULL) AND ksp.is_displaced = FALSE) AS is_ranked,
      COALESCE(ksp.rank_position, ksp.last_known_rank) AS rank_position,
      CASE WHEN ksp.is_displaced = FALSE THEN ksp.rank_position ELSE NULL END AS active_serp_rank,
      ksp.active_keyword,
      COUNT(*) OVER()::int AS full_count
    FROM eco_pool ep
    LEFT JOIN LATERAL (
      SELECT ksp_sub.rank_position, k.keyword AS active_keyword, ksp_sub.last_known_rank, ksp_sub.is_displaced
      FROM keyword_serp_positions ksp_sub
      LEFT JOIN tracked_keywords k ON k.id = ksp_sub.keyword_id
      WHERE ksp_sub.pin_id = ep.pin_id
        AND NOT EXISTS (
          SELECT 1 FROM keyword_ignored_pins kip
          WHERE kip.keyword_id = ksp_sub.keyword_id AND kip.pin_id = ksp_sub.pin_id
        )
      ORDER BY ksp_sub.is_displaced ASC, ksp_sub.rank_position ASC NULLS LAST, ksp_sub.last_known_rank ASC NULLS LAST
      LIMIT 1
    ) ksp ON TRUE
    WHERE (${ranked_only} = FALSE OR ((ksp.rank_position IS NOT NULL OR ksp.last_known_rank IS NOT NULL) AND ksp.is_displaced = FALSE))
      AND (${minSavesNum} = 0 OR ep.save_count >= ${minSavesNum})
      AND (${searchPattern}::text IS NULL OR LOWER(ep.title) LIKE ${searchPattern} ESCAPE '\\' OR LOWER(ep.description) LIKE ${searchPattern} ESCAPE '\\' OR LOWER(ep.curator_username) LIKE ${searchPattern} ESCAPE '\\')
      AND (${cleanBoardSlug}::text IS NULL OR ep.board_slug = ${cleanBoardSlug})
      AND (${qualified_only} = FALSE OR (ep.save_count >= 100 OR ep.velocity >= 3.5))
      AND (${isHighVelocity} = FALSE OR ep.velocity >= 10)
      AND (${isChangedOnly} = FALSE OR ep.velocity > 0)
      AND (
        ${stageFilter}::text IS NULL OR
        (${stageFilter} = 'DORMANT' AND ep.velocity < 0.5) OR
        (${stageFilter} = 'COOLING' AND ep.velocity >= 0.5 AND ep.velocity < 2.0 AND (COALESCE(ep.created_at_pinterest, ep.first_seen_at) < NOW() - INTERVAL '14 days' OR COALESCE(ep.created_at_pinterest, ep.first_seen_at) IS NULL)) OR
        (${stageFilter} = 'NEW' AND ep.velocity >= 0.5 AND COALESCE(ep.created_at_pinterest, ep.first_seen_at) >= NOW() - INTERVAL '14 days') OR
        (${stageFilter} = 'GROWING' AND ep.velocity >= 10.0 AND (COALESCE(ep.created_at_pinterest, ep.first_seen_at) < NOW() - INTERVAL '14 days' OR COALESCE(ep.created_at_pinterest, ep.first_seen_at) IS NULL)) OR
        (${stageFilter} = 'MATURE' AND ep.velocity >= 2.0 AND ep.velocity < 10.0 AND (COALESCE(ep.created_at_pinterest, ep.first_seen_at) < NOW() - INTERVAL '14 days' OR COALESCE(ep.created_at_pinterest, ep.first_seen_at) IS NULL))
      )
      AND (${product_only} = FALSE OR ep.is_product = TRUE)
      AND (${articles_only} = FALSE OR ep.is_product = FALSE)
    ORDER BY
      CASE WHEN ${sort} = 'saves_desc' THEN ep.save_count END DESC NULLS LAST,
      CASE WHEN ${sort} = 'repins_desc' THEN ep.repin_count END DESC NULLS LAST,
      CASE WHEN ${sort} = 'velocity' OR ${sort} = 'velocity_desc' THEN ep.velocity END DESC NULLS LAST,
      CASE WHEN ${sort} = 'comments' OR ${sort} = 'comments_desc' THEN ep.comment_count END DESC NULLS LAST,
      CASE WHEN ${sort} = 'newest' OR ${sort} = 'created_desc' THEN ep.created_at_pinterest END DESC NULLS LAST,
      CASE WHEN ${sort} = 'oldest' OR ${sort} = 'created_asc' THEN ep.created_at_pinterest END ASC NULLS LAST,
      ep.save_count DESC NULLS LAST
    LIMIT ${pLim} OFFSET ${offset};
  `;

  const getCountFallback = async () => {
    const [row] = await sql`
      WITH direct_pins AS (
        SELECT DISTINCT ON (pin_id) *
        FROM (
          SELECT
            cbp.pin_id,
            ump.title,
            ump.description,
            ump.clean_domain,
            ump.destination_url,
            ump.board_slug,
            ump.save_count,
            ump.repin_count,
            ump.daily_save_velocity,
            ump.created_at_pinterest,
            ump.first_discovered_at,
            ump.is_product,
            ${cleanUsername || ''}::text AS curator_username,
            0 AS src_priority
          FROM competitor_board_pins cbp
          JOIN universal_master_pins ump ON ump.pin_id = cbp.pin_id
          WHERE cbp.competitor_id = ${numericId}
            AND ump.pin_id ~ '^[0-9]{10,30}$'
          UNION ALL
          SELECT
            ump.pin_id,
            ump.title,
            ump.description,
            ump.clean_domain,
            ump.destination_url,
            ump.board_slug,
            ump.save_count,
            ump.repin_count,
            ump.daily_save_velocity,
            ump.created_at_pinterest,
            ump.first_discovered_at,
            ump.is_product,
            COALESCE(NULLIF(ump.creator_username, ''), ${cleanUsername || ''}) AS curator_username,
            1 AS src_priority
          FROM universal_master_pins ump
          WHERE ump.pin_id ~ '^[0-9]{10,30}$'
            AND (
              (${normCreatorUser} <> '' AND LOWER(LTRIM(BTRIM(COALESCE(ump.creator_username, '')), '@')) = ${normCreatorUser})
              OR (
                ${primaryDomain} <> ''
                AND ump.clean_domain = ${primaryDomain}
                AND LOWER(LTRIM(BTRIM(COALESCE(ump.creator_username, '')), '@')) IN ('', 'uploaded by user', 'uploaded by pinner', 'anonymous', 'community_curator')
              )
            )
        ) dp_raw
        ORDER BY pin_id, src_priority ASC
      ),
      scoped_pool AS (
        SELECT
          dp.pin_id,
          COALESCE(dp.title, '') AS title,
          COALESCE(dp.description, '') AS description,
          COALESCE(dp.clean_domain, '') AS clean_domain,
          COALESCE(dp.destination_url, '') AS destination_url,
          dp.board_slug,
          COALESCE(dp.save_count, 0)::bigint AS save_count,
          COALESCE(dp.repin_count, 0)::bigint AS repin_count,
          COALESCE(dp.daily_save_velocity, 0)::numeric AS velocity,
          dp.created_at_pinterest,
          dp.first_discovered_at,
          (
            COALESCE(dp.is_product, false) OR
            COALESCE(dp.clean_domain ILIKE '%etsy%' OR dp.clean_domain ILIKE '%shopify%' OR dp.clean_domain ILIKE '%amazon%' OR dp.destination_url ILIKE '%/listing/%' OR dp.destination_url ILIKE '%/product/%' OR dp.destination_url ILIKE '%/item/%' OR dp.destination_url ILIKE '%gumroad.com%', false)
          ) AS is_product,
          dp.curator_username
        FROM direct_pins dp
        WHERE ${activeScope} <> 'curators'
          AND (
            ${activeScope} IN ('official', 'all')
            OR (${activeScope} IN ('domain_only', 'ecosystem') AND (
              ${primaryDomain} = ''
              OR COALESCE(dp.clean_domain, '') IN ('', 'uploaded by user', 'uploaded-by-user', 'organic', ${primaryDomain})
              OR dp.clean_domain ILIKE '%pinterest.%'
              OR dp.clean_domain ILIKE '%pin.it%'
            ))
            OR (${activeScope} = 'external' AND ${primaryDomain} <> '' AND (
              COALESCE(dp.clean_domain, '') NOT IN ('', 'uploaded by user', 'uploaded-by-user', 'organic', ${primaryDomain})
              AND dp.clean_domain NOT ILIKE '%pinterest.%'
              AND dp.clean_domain NOT ILIKE '%pin.it%'
            ))
          )
        UNION ALL
        SELECT
          ump.pin_id,
          COALESCE(ump.title, '') AS title,
          COALESCE(ump.description, '') AS description,
          COALESCE(ump.clean_domain, '') AS clean_domain,
          COALESCE(ump.destination_url, '') AS destination_url,
          ump.board_slug,
          COALESCE(ump.save_count, 0)::bigint AS save_count,
          COALESCE(ump.repin_count, 0)::bigint AS repin_count,
          COALESCE(ump.daily_save_velocity, 0)::numeric AS velocity,
          ump.created_at_pinterest,
          ump.first_discovered_at,
          (
            COALESCE(ump.is_product, false) OR
            COALESCE(ump.clean_domain ILIKE '%etsy%' OR ump.clean_domain ILIKE '%shopify%' OR ump.clean_domain ILIKE '%amazon%' OR ump.destination_url ILIKE '%/listing/%' OR ump.destination_url ILIKE '%/product/%' OR ump.destination_url ILIKE '%/item/%' OR ump.destination_url ILIKE '%gumroad.com%', false)
          ) AS is_product,
          COALESCE(NULLIF(ump.creator_username, ''), 'community_curator') AS curator_username
        FROM universal_master_pins ump
        WHERE ${activeScope} IN ('ecosystem', 'curators', 'all')
          AND ${primaryDomain} <> ''
          AND ump.pin_id ~ '^[0-9]{10,30}$'
          AND ump.clean_domain = ${primaryDomain}
          AND LOWER(LTRIM(BTRIM(COALESCE(ump.creator_username, '')), '@')) NOT IN ('', 'uploaded by user', 'uploaded by pinner', 'anonymous', 'community_curator', ${normCreatorUser})
          AND NOT EXISTS (SELECT 1 FROM direct_pins dp_ex WHERE dp_ex.pin_id = ump.pin_id)
      )
      SELECT COUNT(*)::int as total
      FROM scoped_pool sp
      LEFT JOIN LATERAL (
        SELECT ksp_sub.rank_position, ksp_sub.last_known_rank, ksp_sub.is_displaced
        FROM keyword_serp_positions ksp_sub
        WHERE ksp_sub.pin_id = sp.pin_id
          AND (ksp_sub.rank_position IS NOT NULL OR ksp_sub.last_known_rank IS NOT NULL)
          AND NOT EXISTS (
            SELECT 1 FROM keyword_ignored_pins kip
            WHERE kip.keyword_id = ksp_sub.keyword_id AND kip.pin_id = ksp_sub.pin_id
          )
        ORDER BY ksp_sub.is_displaced ASC, ksp_sub.rank_position ASC NULLS LAST
        LIMIT 1
      ) ksp ON TRUE
      WHERE (${ranked_only} = FALSE OR ((ksp.rank_position IS NOT NULL OR ksp.last_known_rank IS NOT NULL) AND ksp.is_displaced = FALSE))
        AND (${minSavesNum} = 0 OR sp.save_count >= ${minSavesNum})
        AND (${searchPattern}::text IS NULL OR LOWER(sp.title) LIKE ${searchPattern} ESCAPE '\\' OR LOWER(sp.description) LIKE ${searchPattern} ESCAPE '\\' OR LOWER(sp.curator_username) LIKE ${searchPattern} ESCAPE '\\')
        AND (${cleanBoardSlug}::text IS NULL OR sp.board_slug = ${cleanBoardSlug})
        AND (${qualified_only} = FALSE OR (sp.save_count >= 100 OR sp.velocity >= 3.5))
        AND (${isHighVelocity} = FALSE OR sp.velocity >= 10)
        AND (${isChangedOnly} = FALSE OR sp.velocity > 0)
        AND (
          ${stageFilter}::text IS NULL OR
          (${stageFilter} = 'DORMANT' AND sp.velocity < 0.5) OR
          (${stageFilter} = 'COOLING' AND sp.velocity >= 0.5 AND sp.velocity < 2.0 AND (COALESCE(sp.created_at_pinterest, sp.first_discovered_at) < NOW() - INTERVAL '14 days' OR COALESCE(sp.created_at_pinterest, sp.first_discovered_at) IS NULL)) OR
          (${stageFilter} = 'NEW' AND sp.velocity >= 0.5 AND COALESCE(sp.created_at_pinterest, sp.first_discovered_at) >= NOW() - INTERVAL '14 days') OR
          (${stageFilter} = 'GROWING' AND sp.velocity >= 10.0 AND (COALESCE(sp.created_at_pinterest, sp.first_discovered_at) < NOW() - INTERVAL '14 days' OR COALESCE(sp.created_at_pinterest, sp.first_discovered_at) IS NULL)) OR
          (${stageFilter} = 'MATURE' AND sp.velocity >= 2.0 AND sp.velocity < 10.0 AND (COALESCE(sp.created_at_pinterest, sp.first_discovered_at) < NOW() - INTERVAL '14 days' OR COALESCE(sp.created_at_pinterest, sp.first_discovered_at) IS NULL))
        )
        AND (${product_only} = FALSE OR sp.is_product = TRUE)
        AND (${articles_only} = FALSE OR sp.is_product = FALSE);
    `;
    return row?.total || 0;
  };

  // Global Unfiltered Totals Query: Decoupled from active filter predicates
  const unfilteredTotalsPromise = sql`
    WITH direct_pins AS (
      SELECT DISTINCT ON (pin_id) pin_id, clean_domain, save_count, ump_vel
      FROM (
        SELECT
          cbp.pin_id,
          ump.clean_domain,
          ump.save_count,
          ump.daily_save_velocity AS ump_vel,
          0 AS src_priority
        FROM competitor_board_pins cbp
        JOIN universal_master_pins ump ON ump.pin_id = cbp.pin_id
        WHERE cbp.competitor_id = ${numericId}
          AND ump.pin_id ~ '^[0-9]{10,30}$'
        UNION ALL
        SELECT
          ump.pin_id,
          ump.clean_domain,
          ump.save_count,
          ump.daily_save_velocity AS ump_vel,
          1 AS src_priority
        FROM universal_master_pins ump
        WHERE ump.pin_id ~ '^[0-9]{10,30}$'
          AND (
            (${normCreatorUser} <> '' AND LOWER(LTRIM(BTRIM(COALESCE(ump.creator_username, '')), '@')) = ${normCreatorUser})
            OR (
              ${primaryDomain} <> ''
              AND ump.clean_domain = ${primaryDomain}
              AND LOWER(LTRIM(BTRIM(COALESCE(ump.creator_username, '')), '@')) IN ('', 'uploaded by user', 'uploaded by pinner', 'anonymous', 'community_curator')
            )
          )
      ) dp_raw
      ORDER BY pin_id, src_priority ASC
    ),
    classified_cp AS (
      SELECT
        dp.pin_id,
        dp.save_count,
        dp.ump_vel,
        ksp.pin_id AS ksp_pin_id,
        (
          ${primaryDomain} = ''
          OR COALESCE(dp.clean_domain, '') IN ('', 'uploaded by user', 'uploaded-by-user', 'organic', ${primaryDomain})
          OR dp.clean_domain ILIKE '%pinterest.%'
          OR dp.clean_domain ILIKE '%pin.it%'
        ) AS is_official_domain
      FROM direct_pins dp
      LEFT JOIN (
        SELECT DISTINCT ksp_sub.pin_id
        FROM keyword_serp_positions ksp_sub
        WHERE (ksp_sub.rank_position IS NOT NULL OR ksp_sub.last_known_rank IS NOT NULL)
          AND ksp_sub.is_displaced = FALSE
          AND NOT EXISTS (
            SELECT 1 FROM keyword_ignored_pins kip
            WHERE kip.keyword_id = ksp_sub.keyword_id AND kip.pin_id = ksp_sub.pin_id
          )
      ) ksp ON ksp.pin_id = dp.pin_id
    )
    SELECT
      COUNT(*)::int AS catalog_total,
      COUNT(*) FILTER (WHERE is_official_domain = FALSE)::int AS external_pins_total,
      COUNT(*) FILTER (WHERE COALESCE(save_count, 0) >= 100 OR COALESCE(ump_vel, 0) >= 3.5)::int AS qualified_total,
      COUNT(*) FILTER (WHERE ksp_pin_id IS NOT NULL)::int AS ranked_total,
      COUNT(*) FILTER (WHERE COALESCE(ump_vel, 0) >= 10)::int AS high_velocity_total
    FROM classified_cp;
  `;

  const curatorTotalsPromise = primaryDomain
    ? sql`
        WITH direct_pins AS (
          SELECT DISTINCT pin_id
          FROM (
            SELECT cbp_ex.pin_id
            FROM competitor_board_pins cbp_ex
            JOIN universal_master_pins ump_chk ON ump_chk.pin_id = cbp_ex.pin_id
            WHERE cbp_ex.competitor_id = ${numericId}
              AND ump_chk.pin_id ~ '^[0-9]{10,30}$'
            UNION ALL
            SELECT ump_dp.pin_id
            FROM universal_master_pins ump_dp
            WHERE ump_dp.pin_id ~ '^[0-9]{10,30}$'
              AND (
                (${normCreatorUser} <> '' AND LOWER(LTRIM(BTRIM(COALESCE(ump_dp.creator_username, '')), '@')) = ${normCreatorUser})
                OR (
                  ump_dp.clean_domain = ${primaryDomain}
                  AND LOWER(LTRIM(BTRIM(COALESCE(ump_dp.creator_username, '')), '@')) IN ('', 'uploaded by user', 'uploaded by pinner', 'anonymous', 'community_curator')
                )
              )
          ) dp_raw
        )
        SELECT COUNT(*)::int AS curator_pins_total
        FROM universal_master_pins ump
        WHERE ump.pin_id ~ '^[0-9]{10,30}$'
          AND ump.clean_domain = ${primaryDomain}
          AND LOWER(LTRIM(BTRIM(COALESCE(ump.creator_username, '')), '@')) NOT IN ('', 'uploaded by user', 'uploaded by pinner', 'anonymous', 'community_curator', ${normCreatorUser})
          AND NOT EXISTS (
            SELECT 1 FROM direct_pins dp_ex
            WHERE dp_ex.pin_id = ump.pin_id
          );
      `.catch(() => [{ curator_pins_total: 0 }])
    : Promise.resolve([{ curator_pins_total: 0 }]);

  const [boardsRows, rows, [unfilteredRow], [curatorRow]] = await Promise.all([
    boardsPromise,
    rowsPromise,
    unfilteredTotalsPromise,
    curatorTotalsPromise
  ]);

  const now = Date.now();
  const total = rows.length > 0 
    ? Number(rows[0].full_count || 0) 
    : (offset === 0 ? 0 : await getCountFallback());
  const catalog_total = unfilteredRow ? (unfilteredRow.catalog_total ?? total) : total;
  const external_pins_total = Number(unfilteredRow?.external_pins_total || 0);
  const curator_pins_total = Number(curatorRow?.curator_pins_total || 0);
  const ecosystem_catalog_total = catalog_total + curator_pins_total;
  const qualified_total = unfilteredRow ? (unfilteredRow.qualified_total || 0) : 0;
  const ranked_total = unfilteredRow ? (unfilteredRow.ranked_total || 0) : 0;
  const high_velocity_total = unfilteredRow ? (unfilteredRow.high_velocity_total || 0) : 0;
  const total_pages = Math.ceil(total / pLim);

  return {
    pins: rows.map(r => {
      const velocity = Number(r.velocity || 0);
      const rawCreatedDate = r.created_at_pinterest || r.first_seen_at || null;
      const parsedDate = rawCreatedDate ? new Date(rawCreatedDate) : null;
      const hasValidDate = Boolean(parsedDate && !isNaN(parsedDate.getTime()));
      const ageDays = hasValidDate ? Math.max(1, Math.round((now - parsedDate.getTime()) / 86400000)) : null;
      const stage = computePinStage(velocity, 0, ageDays);

      return {
        ...r,
        attribution_source: r.attribution_source || 'official',
        curator_username: r.curator_username || cleanUsername || '',
        saves: Number(r.save_count || 0),
        repins: Number(r.repin_count || 0),
        comments: Number(r.comment_count || 0),
        share_count: Number(r.share_count || 0),
        velocity: Number(velocity.toFixed(1)),
        delta_saves_24h: (() => {
          const raw = (r.delta_saves_24h !== null && r.delta_saves_24h !== undefined && r.delta_saves_24h !== '') ? Number(r.delta_saves_24h) : NaN;
          return Number.isFinite(raw) ? Number(raw.toFixed(1)) : null;
        })(),
        delta_repins_24h: Number(r.delta_repins_24h || 0),
        age_days: ageDays,
        stage,
        is_product: Boolean(r.is_product),
        is_qualified: Boolean(r.is_qualified)
      };
    }),
    total,
    catalog_total,
    external_pins_total,
    curator_pins_total,
    ecosystem_catalog_total,
    primary_domain: primaryDomain || null,
    scope: activeScope,
    qualified_total,
    ranked_total,
    high_velocity_total,
    page: pNum,
    limit: pLim,
    total_pages,
    boards: boardsRows
  };
}





/**
 * Calculate pin growth stage
 */
export function computePinStage(velocity, deltaSaves = 0, ageDays = null) {
  if (velocity < 0.5) return 'DORMANT';
  if (deltaSaves < 0 && velocity < 2) return 'COOLING';
  if (ageDays !== null && ageDays !== undefined && ageDays <= 14) return 'NEW';
  if (velocity >= 10) return 'GROWING';
  if (velocity >= 2) return 'MATURE';
  return 'COOLING';
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
  let sortColumn = 'save_count';
  if (sortBy === 'velocity' || sortBy === 'delta_saves') sortColumn = 'daily_save_velocity';
  else if (sortBy === 'created_at' || sortBy === 'date' || sortBy === 'newest') sortColumn = 'created_at_pinterest';
  else if (sortBy === 'repins') sortColumn = 'repin_count';
  else if (sortBy === 'comments') sortColumn = 'comment_count';
  else if (sortBy === 'shares' || sortBy === 'share_count') sortColumn = 'share_count';

  const [rows, [countRow]] = await Promise.all([
    sql`
      SELECT 
        pin_id,
        creator_username AS account_username,
        title,
        description,
        board_name,
        clean_domain AS domain,
        destination_url AS link,
        image_url,
        dominant_color,
        save_count AS saves,
        repin_count AS repins,
        comment_count AS comments,
        share_count,
        daily_save_velocity AS velocity,
        delta_saves_24h,
        delta_repins_24h,
        daily_repin_velocity,
        gains_5d,
        gains_7d,
        gains_10d,
        gains_15d,
        visual_annotations AS annotations,
        is_video,
        is_product,
        created_at_pinterest,
        first_discovered_at AS first_seen_at,
        updated_at AS last_updated_at
      FROM universal_master_pins
      WHERE (COALESCE(save_count, 0) >= ${minNum})
        AND (${maxNum}::bigint IS NULL OR COALESCE(save_count, 0) <= ${maxNum})
        AND (${searchPattern}::text IS NULL OR (
          COALESCE(LOWER(title), '') LIKE ${searchPattern} ESCAPE '\\' OR
          COALESCE(LOWER(description), '') LIKE ${searchPattern} ESCAPE '\\' OR
          COALESCE(LOWER(board_name), '') LIKE ${searchPattern} ESCAPE '\\' OR
          COALESCE(pin_id, '') LIKE ${searchPattern} ESCAPE '\\'
        ))
        AND (${boardPattern}::text IS NULL OR COALESCE(LOWER(board_name), '') LIKE ${boardPattern} ESCAPE '\\')
        AND (${topicPattern}::text IS NULL OR (
          COALESCE(LOWER(board_name), '') LIKE ${topicPattern} ESCAPE '\\' OR
          COALESCE(LOWER(title), '') LIKE ${topicPattern} ESCAPE '\\' OR
          EXISTS (
            SELECT 1
            FROM jsonb_array_elements(CASE WHEN jsonb_typeof(visual_annotations) = 'array' THEN visual_annotations ELSE '[]'::jsonb END) AS elem
            WHERE (
              (jsonb_typeof(elem) = 'object' AND LOWER(elem->>'name') LIKE ${topicPattern} ESCAPE '\\')
              OR
              (jsonb_typeof(elem) = 'string' AND LOWER(elem #>> '{}') LIKE ${topicPattern} ESCAPE '\\')
            )
          )
        ))
        AND (${accountPattern}::text IS NULL OR LOWER(COALESCE(creator_username, '')) LIKE ${accountPattern} ESCAPE '\\')
        AND (
          ${stageFilter}::text IS NULL OR
          (${stageFilter} = 'DORMANT' AND COALESCE(daily_save_velocity, 0) < 0.5) OR
          (${stageFilter} = 'COOLING' AND COALESCE(daily_save_velocity, 0) >= 0.5 AND COALESCE(daily_save_velocity, 0) < 2.0 AND (COALESCE(created_at_pinterest, first_discovered_at) < NOW() - INTERVAL '14 days' OR COALESCE(created_at_pinterest, first_discovered_at) IS NULL)) OR
          (${stageFilter} = 'NEW' AND COALESCE(daily_save_velocity, 0) >= 0.5 AND COALESCE(created_at_pinterest, first_discovered_at) >= NOW() - INTERVAL '14 days') OR
          (${stageFilter} = 'GROWING' AND COALESCE(daily_save_velocity, 0) >= 10.0 AND (COALESCE(created_at_pinterest, first_discovered_at) < NOW() - INTERVAL '14 days' OR COALESCE(created_at_pinterest, first_discovered_at) IS NULL)) OR
          (${stageFilter} = 'MATURE' AND COALESCE(daily_save_velocity, 0) >= 2.0 AND COALESCE(daily_save_velocity, 0) < 10.0 AND (COALESCE(created_at_pinterest, first_discovered_at) < NOW() - INTERVAL '14 days' OR COALESCE(created_at_pinterest, first_discovered_at) IS NULL))
        )
        AND (
          NOT ${filterChangedOnly} OR
          COALESCE(daily_save_velocity, 0) > 0
        )
      ORDER BY
        CASE WHEN ${sortColumn} = 'save_count' AND ${isAsc} THEN save_count END ASC NULLS LAST,
        CASE WHEN ${sortColumn} = 'save_count' AND NOT ${isAsc} THEN save_count END DESC NULLS LAST,
        CASE WHEN ${sortColumn} = 'daily_save_velocity' AND ${isAsc} THEN daily_save_velocity END ASC NULLS LAST,
        CASE WHEN ${sortColumn} = 'daily_save_velocity' AND NOT ${isAsc} THEN daily_save_velocity END DESC NULLS LAST,
        CASE WHEN ${sortColumn} = 'created_at_pinterest' AND ${isAsc} THEN created_at_pinterest END ASC NULLS LAST,
        CASE WHEN ${sortColumn} = 'created_at_pinterest' AND NOT ${isAsc} THEN created_at_pinterest END DESC NULLS LAST,
        CASE WHEN ${sortColumn} = 'repin_count' AND ${isAsc} THEN repin_count END ASC NULLS LAST,
        CASE WHEN ${sortColumn} = 'repin_count' AND NOT ${isAsc} THEN repin_count END DESC NULLS LAST,
        CASE WHEN ${sortColumn} = 'comment_count' AND ${isAsc} THEN comment_count END ASC NULLS LAST,
        CASE WHEN ${sortColumn} = 'comment_count' AND NOT ${isAsc} THEN comment_count END DESC NULLS LAST,
        CASE WHEN ${sortColumn} = 'share_count' AND ${isAsc} THEN share_count END ASC NULLS LAST,
        CASE WHEN ${sortColumn} = 'share_count' AND NOT ${isAsc} THEN share_count END DESC NULLS LAST,
        save_count DESC NULLS LAST
      LIMIT ${lim} OFFSET ${off};
    `,
    sql`
      SELECT COUNT(*)::int as total
      FROM universal_master_pins
      WHERE (COALESCE(save_count, 0) >= ${minNum})
        AND (${maxNum}::bigint IS NULL OR COALESCE(save_count, 0) <= ${maxNum})
        AND (${searchPattern}::text IS NULL OR (
          COALESCE(LOWER(title), '') LIKE ${searchPattern} ESCAPE '\\' OR
          COALESCE(LOWER(description), '') LIKE ${searchPattern} ESCAPE '\\' OR
          COALESCE(LOWER(board_name), '') LIKE ${searchPattern} ESCAPE '\\' OR
          COALESCE(pin_id, '') LIKE ${searchPattern} ESCAPE '\\'
        ))
        AND (${boardPattern}::text IS NULL OR COALESCE(LOWER(board_name), '') LIKE ${boardPattern} ESCAPE '\\')
        AND (${topicPattern}::text IS NULL OR (
          COALESCE(LOWER(board_name), '') LIKE ${topicPattern} ESCAPE '\\' OR
          COALESCE(LOWER(title), '') LIKE ${topicPattern} ESCAPE '\\' OR
          EXISTS (
            SELECT 1
            FROM jsonb_array_elements(CASE WHEN jsonb_typeof(visual_annotations) = 'array' THEN visual_annotations ELSE '[]'::jsonb END) AS elem
            WHERE (
              (jsonb_typeof(elem) = 'object' AND LOWER(elem->>'name') LIKE ${topicPattern} ESCAPE '\\')
              OR
              (jsonb_typeof(elem) = 'string' AND LOWER(elem #>> '{}') LIKE ${topicPattern} ESCAPE '\\')
            )
          )
        ))
        AND (${accountPattern}::text IS NULL OR LOWER(COALESCE(creator_username, '')) LIKE ${accountPattern} ESCAPE '\\')
        AND (
          ${stageFilter}::text IS NULL OR
          (${stageFilter} = 'DORMANT' AND COALESCE(daily_save_velocity, 0) < 0.5) OR
          (${stageFilter} = 'COOLING' AND COALESCE(daily_save_velocity, 0) >= 0.5 AND COALESCE(daily_save_velocity, 0) < 2.0 AND (COALESCE(created_at_pinterest, first_discovered_at) < NOW() - INTERVAL '14 days' OR COALESCE(created_at_pinterest, first_discovered_at) IS NULL)) OR
          (${stageFilter} = 'NEW' AND COALESCE(daily_save_velocity, 0) >= 0.5 AND COALESCE(created_at_pinterest, first_discovered_at) >= NOW() - INTERVAL '14 days') OR
          (${stageFilter} = 'GROWING' AND COALESCE(daily_save_velocity, 0) >= 10.0 AND (COALESCE(created_at_pinterest, first_discovered_at) < NOW() - INTERVAL '14 days' OR COALESCE(created_at_pinterest, first_discovered_at) IS NULL)) OR
          (${stageFilter} = 'MATURE' AND COALESCE(daily_save_velocity, 0) >= 2.0 AND COALESCE(daily_save_velocity, 0) < 10.0 AND (COALESCE(created_at_pinterest, first_discovered_at) < NOW() - INTERVAL '14 days' OR COALESCE(created_at_pinterest, first_discovered_at) IS NULL))
        )
        AND (
          NOT ${filterChangedOnly} OR
          COALESCE(daily_save_velocity, 0) > 0
        );
    `
  ]);

  const now = Date.now();

  let mapped = rows.map(p => {
    const rawVel = Number(p.velocity ?? 0);
    const velocity = Number.isFinite(rawVel) ? Math.max(0, rawVel) : 0;
    const rawCreatedDate = p.created_at_pinterest || p.first_seen_at || null;
    const parsedDate = rawCreatedDate ? new Date(rawCreatedDate) : null;
    const hasValidDate = Boolean(parsedDate && !isNaN(parsedDate.getTime()));
    const ageDays = hasValidDate ? Math.max(1, Math.round((now - parsedDate.getTime()) / 86400000)) : null;

    // Authentic growth deltas directly from universal_master_pins columns (delta_saves_24h, delta_repins_24h, gains_5d, gains_7d)
    const curSavesNum = Number(p.saves ?? 0);
    const curSaves = Number.isFinite(curSavesNum) ? Math.max(0, curSavesNum) : 0;
    const curRepinsNum = Number(p.repins ?? 0);
    const curRepins = Number.isFinite(curRepinsNum) ? Math.max(0, curRepinsNum) : 0;

    const deltaSaves = (p.delta_saves_24h !== null && p.delta_saves_24h !== undefined && p.delta_saves_24h !== '' && Number.isFinite(Number(p.delta_saves_24h)))
      ? Math.max(0, Math.round(Number(p.delta_saves_24h)))
      : null;
    const deltaRepins = p.delta_repins_24h != null && Number.isFinite(Number(p.delta_repins_24h))
      ? Math.max(0, Math.round(Number(p.delta_repins_24h)))
      : (p.daily_repin_velocity != null && Number.isFinite(Number(p.daily_repin_velocity))
        ? Math.max(0, Math.round(Number(p.daily_repin_velocity)))
        : 0);
    const gains5d = p.gains_5d != null && Number.isFinite(Number(p.gains_5d))
      ? Math.max(0, Math.round(Number(p.gains_5d)))
      : null;
    const gains7d = p.gains_7d != null && Number.isFinite(Number(p.gains_7d))
      ? Math.max(0, Math.round(Number(p.gains_7d)))
      : null;

    const deltaSaves3d = gains5d ?? deltaSaves;
    const deltaSaves7d = gains7d ?? gains5d ?? deltaSaves;

    const pinStage = computePinStage(velocity, deltaSaves ?? 0, ageDays);

    return {
      ...p,
      saves: curSaves,
      repins: curRepins,
      comments: Number(p.comments || 0),
      share_count: Number(p.share_count || 0),
      velocity: Number(velocity.toFixed(1)),
      age_days: ageDays,
      delta_saves: deltaSaves,
      delta_saves_24h: deltaSaves,
      delta_repins: deltaRepins,
      delta_repins_24h: deltaRepins,
      gains_5d: gains5d,
      gains_7d: gains7d,
      delta_saves_3d: deltaSaves3d,
      delta_saves_7d: deltaSaves7d,
      stage: pinStage,
      formatted_created: hasValidDate ? parsedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—',
      formatted_first_pulled: p.first_seen_at ? new Date(p.first_seen_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : (p.created_at_pinterest ? new Date(p.created_at_pinterest).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—')
    };
  });

  // Since SQL has already filtered by stage and changedOnly correctly with SARGable index predicates,
  // we do not truncate post-LIMIT in JS, preserving correct page lengths and total counts.
  mapped.total = countRow ? countRow.total : mapped.length;
  return mapped;
}







// Modular Creator Hub Settings & Configuration
export {
  getCreatorHubSettings,
  updateCreatorHubSettings,
  DEFAULT_CREATOR_HUB_SETTINGS
} from './settings.mjs';
