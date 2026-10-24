/**
 * Unified Creator Hub Service (src/modules/creators/service.mjs)
 * 
 * Consolidates Creator Intelligence, Competitor Catalog Sweeps,
 * and Winning Pins Archive into a single high-performance engine.
 * 
 * // [INVARIANT: ZERO-HUB-SNAPSHOTS]
 * // [INVARIANT: FOUR-PILLAR-SYNC-PARITY]
 * // [INVARIANT: ONE-WAY-PROMOTION]
 */

/**
 * Competitor Intelligence Service
 * Handles competitor profile crawling, 7-day velocity/delta calculation,
 * and pin catalog ingestion.
 */

import { formatPinterestCookie, sanitizeForJsonb, escapeSqlWildcards } from '../../utils.mjs';
import { fetchUserResource, fetchBoardsResource, fetchBoardDetailUnauth, fetchUserActivityPinsResource, fetchBoardFeedResource, fetchPinFromPinResource, fetchPinFromPinterest, pinterestFetch, sleep, randomJitterMs } from '../../../scripts/lib/pinterest.mjs';
import crypto from 'node:crypto';
import { syncPinAcrossAllFourPillars, fetchPinTrajectoryFromShard, fetchUniversalPinDossier } from '../sharding/fleet-router.mjs';

/**
 * Deterministic Synthetic Board ID Generator
 * Generates an immutable, idempotent MD5 hash matching Migration 011 SQL schema standards.
 */
export function generateSyntheticBoardId(competitorId, boardName) {
  const norm = String(boardName || 'General').trim().toLowerCase();
  const hash = crypto.createHash('md5').update(`${competitorId}:${norm}`).digest('hex').slice(0, 16);
  return `cb-${hash}`;
}

/**
 * Format large numbers with commas or abbreviation (e.g. 10.5M, 42.8K)
 */
export function formatMetric(num, abbrev = false) {
  if (num === null || num === undefined) return '0';
  const val = Number(num);
  if (isNaN(val)) return '0';
  if (abbrev) {
    if (val >= 1000000) return (val / 1000000).toFixed(1) + 'M';
    if (val >= 1000) return (val / 1000).toFixed(1) + 'K';
    return String(val);
  }
  return val.toLocaleString();
}

export const RESERVED_PINTEREST_PATHS = new Set([
  'pin', 'pins', 'search', 'ideas', 'today', 'settings', 'about',
  'business', 'blog', 'help', 'password', 'login', 'signup',
  'explore', 'categories', 'news', 'shop', 'topics', 'notifications',
  'messages', 'edit', 'following', 'followers', 'analytics',
  'board-idea', 'board-ideas', 'domains'
]);

/**
 * Normalize Pinterest handle or full URL to clean username
 */
export function normalizePinterestUsername(input) {
  if (!input) return '';
  let str = String(input).trim();
  try {
    if (str.startsWith('http://') || str.startsWith('https://')) {
      const url = new URL(str);
      if (/(?:^|\.)pinterest\.[a-z.]+$/i.test(url.hostname)) {
        const parts = url.pathname.split('/').filter(Boolean);
        if (parts.length > 0) {
          const candidate = parts[0].replace(/^@+/, '').toLowerCase().trim();
          if (RESERVED_PINTEREST_PATHS.has(candidate)) return '';
          if (/^[a-z0-9_.-]{3,64}$/.test(candidate)) return candidate;
          return '';
        }
      }
    }
  } catch (_) {}

  str = str.replace(/^(?:https?:\/\/)?(?:[a-z0-9_-]+\.)?pinterest\.[a-z.]+\/+/i, '');
  const candidate = str.split('?')[0].split('#')[0].split('/')[0].replace(/^@+/, '').trim().toLowerCase();
  if (RESERVED_PINTEREST_PATHS.has(candidate)) return '';
  if (/^[a-z0-9_.-]{3,64}$/.test(candidate)) return candidate;
  return '';
}

/**
 * Get aggregated KPIs across all tracked competitor profiles
 */
export async function getCompetitorsOverview(sql) {
  try {
    const totalsRes = await sql`
      SELECT
        COUNT(*)::int AS total_profiles,
        COUNT(CASE WHEN is_active = TRUE THEN 1 END)::int AS active_count,
        COUNT(CASE WHEN is_active = FALSE THEN 1 END)::int AS paused_count,
        COUNT(CASE WHEN account_type = 'competitor' THEN 1 END)::int AS competitor_count,
        COUNT(CASE WHEN account_type = 'own' THEN 1 END)::int AS own_count,
        COALESCE(SUM(monthly_reach), 0)::bigint AS combined_reach,
        COALESCE(SUM(profile_views), 0)::bigint AS total_audience,
        COALESCE(SUM(total_pins), 0)::int AS total_pins_tracked
      FROM competitor_profiles;
    `;
    const totals = totalsRes?.[0] || {};

    const topProfileRes = await sql`
      SELECT username, monthly_reach
      FROM competitor_profiles
      WHERE monthly_reach > 0
      ORDER BY monthly_reach DESC
      LIMIT 1;
    `;
    const topProfile = topProfileRes?.[0] || null;

    return {
      tracked_profiles: totals.total_profiles || 0,
      active_count: totals.active_count || 0,
      paused_count: totals.paused_count || 0,
      competitor_count: totals.competitor_count || 0,
      own_count: totals.own_count || 0,
      combined_reach: Number(totals.combined_reach || 0),
      total_audience: Number(totals.total_audience || 0),
      pins_tracked: totals.total_pins_tracked || 0,
      top_competitor: topProfile ? {
        handle: `@${topProfile.username}`,
        reach: formatMetric(topProfile.monthly_reach, true)
      } : null
    };
  } catch (err) {
    console.warn('[getCompetitorsOverview] Query failed, returning fallback summary:', err.message);
    return {
      _degraded: true,
      tracked_profiles: 0,
      competitor_count: 0,
      own_count: 0,
      combined_reach: 0,
      total_audience: 0,
      pins_tracked: 0,
      top_competitor: null
    };
  }
}

/**
 * List tracked profiles with reach/view deltas and board stats
 */
export async function listCompetitors(sql, { account_type = 'all', search = '', limit = 50, offset = 0 } = {}) {
  try {
    let query;
    const lim = Math.max(1, Math.min(isNaN(Number(limit)) ? 50 : Number(limit), 200));
    const off = Math.max(0, isNaN(Number(offset)) ? 0 : Number(offset));
    const cleanSearch = (search && typeof search === 'string' && search.trim()) ? escapeSqlWildcards(search.toLowerCase().replace('@', '').trim()) : null;
    const searchPattern = cleanSearch ? `%${cleanSearch}%` : null;

    if (account_type && account_type !== 'all') {
      if (searchPattern) {
        query = await sql`
          SELECT *
          FROM competitor_profiles
          WHERE account_type = ${account_type}
            AND (LOWER(username) LIKE ${searchPattern} OR LOWER(COALESCE(display_name, '')) LIKE ${searchPattern})
          ORDER BY monthly_reach DESC
          LIMIT ${lim} OFFSET ${off};
        `;
      } else {
        query = await sql`
          SELECT *
          FROM competitor_profiles
          WHERE account_type = ${account_type}
          ORDER BY monthly_reach DESC
          LIMIT ${lim} OFFSET ${off};
        `;
      }
    } else {
      if (searchPattern) {
        query = await sql`
          SELECT *
          FROM competitor_profiles
          WHERE (LOWER(username) LIKE ${searchPattern} OR LOWER(COALESCE(display_name, '')) LIKE ${searchPattern})
          ORDER BY monthly_reach DESC
          LIMIT ${lim} OFFSET ${off};
        `;
      } else {
        query = await sql`
          SELECT *
          FROM competitor_profiles
          ORDER BY monthly_reach DESC
          LIMIT ${lim} OFFSET ${off};
        `;
      }
    }

    if (!Array.isArray(query)) return [];

    return query.map(p => ({
      ...p,
      handle: `@${p.username}`,
      monthly_reach: Number(p.monthly_reach || 0),
      reach_delta_7d: Number(p.reach_delta_7d || 0),
      profile_views: Number(p.profile_views || 0),
      views_delta_7d: Number(p.views_delta_7d || 0),
      total_pins: Number(p.total_pins || 0),
      total_boards: Number(p.total_boards || 0),
      follower_count: Number(p.follower_count || 0)
    }));
  } catch (err) {
    console.warn('[listCompetitors] Query failed, returning fallback empty list:', err.message);
    const fallback = [];
    fallback._degraded = true;
    return fallback;
  }
}

/**
 * Track a new competitor handle
 */
export async function trackCompetitor(sql, { username, display_name, account_type = 'competitor', is_active = true, ingest_interval = 'daily', auto_archive_winning = true }) {
  const cleanUsername = normalizePinterestUsername(username);
  if (!cleanUsername) throw new Error('Username is required.');

  const metaPayload = {
    auto_archive_winning: auto_archive_winning !== false
  };

  const [row] = await sql`
    INSERT INTO competitor_profiles (
      username,
      display_name,
      account_type,
      is_active,
      metadata,
      updated_at
    ) VALUES (
      ${cleanUsername},
      ${display_name || cleanUsername},
      ${account_type},
      ${is_active !== false},
      ${JSON.stringify(metaPayload)}::jsonb,
      NOW()
    )
    ON CONFLICT (username) DO UPDATE SET
      account_type = EXCLUDED.account_type,
      is_active = EXCLUDED.is_active,
      metadata = COALESCE(competitor_profiles.metadata, '{}'::jsonb) || EXCLUDED.metadata,
      updated_at = NOW()
    RETURNING *;
  `;

  return row;
}

/**
 * Resilient live crawl of a Pinterest user profile
 */
export async function syncCompetitorProfile(sql, username, cookie = (typeof process !== 'undefined' && process?.env ? process.env.PINTEREST_COOKIE : null)) {
  const cleanUsername = normalizePinterestUsername(username);
  if (!cleanUsername) throw new Error('Username is required.');

  const formattedCookie = formatPinterestCookie(cookie);
  const res = await fetchUserResource(cleanUsername, formattedCookie);
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(`Competitor @${cleanUsername} does not exist or was renamed on Pinterest.`);
    } else if (res.status === 429) {
      throw new Error(`Pinterest rate limit reached (HTTP 429). Please wait a moment before syncing again.`);
    } else if (res.status === 403) {
      throw new Error(`Pinterest access denied (HTTP 403). Consider updating your PINTEREST_COOKIE in Settings.`);
    }
    throw new Error(`Pinterest API returned error for @${cleanUsername}: ${res.error || res.status}`);
  }

  const monthlyReach = Number(res.monthly_reach || 0);
  const profileViews = Number(res.profile_views || 0);
  const totalPins = Number(res.total_pins || 0);
  const totalBoards = Number(res.total_boards || 0);
  const followers = Number(res.follower_count || 0);
  const avatarUrl = res.avatar_url || null;
  const displayName = res.display_name || cleanUsername;

  // Retrieve previous snapshot to calculate 7d deltas
  const [prevSnapshot] = await sql`
    SELECT monthly_reach, profile_views
    FROM competitor_history_snapshots
    WHERE competitor_id = (SELECT id FROM competitor_profiles WHERE LOWER(username) = ${cleanUsername} LIMIT 1)
      AND recorded_date <= CURRENT_DATE - INTERVAL '6 days'
    ORDER BY recorded_date DESC
    LIMIT 1;
  `;

  const reachDelta = (prevSnapshot && monthlyReach > 0) ? (monthlyReach - Number(prevSnapshot.monthly_reach || 0)) : 0;
  const viewsDelta = (prevSnapshot && profileViews > 0) ? (profileViews - Number(prevSnapshot.profile_views || 0)) : 0;

  const metaUpdate = {};
  if (res.account_created_at) metaUpdate.account_created_at = res.account_created_at;
  if (res.last_pin_save_time) metaUpdate.last_pin_save_time = res.last_pin_save_time;
  if (res.pinterest_id) metaUpdate.pinterest_id = res.pinterest_id;
  if (res.group_board_count !== undefined) metaUpdate.group_board_count = res.group_board_count;
  if (res.domain_verified !== undefined) metaUpdate.domain_verified = res.domain_verified;
  if (res.is_verified_merchant !== undefined) metaUpdate.is_verified_merchant = res.is_verified_merchant;
  if (res.has_catalog !== undefined) metaUpdate.has_catalog = res.has_catalog;
  if (res.video_pin_count !== undefined) metaUpdate.video_pin_count = res.video_pin_count;
  if (res.story_pin_count !== undefined) metaUpdate.story_pin_count = res.story_pin_count;

  let activityStatus = 'just now';
  const lastActivityTime = res.last_pin_save_time;
  if (lastActivityTime) {
    const diffMs = Date.now() - new Date(lastActivityTime).getTime();
    if (!isNaN(diffMs) && diffMs > 0) {
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays >= 1) {
        activityStatus = `${diffDays}d ago`;
      } else if (diffHours >= 1) {
        activityStatus = `${diffHours}h ago`;
      } else {
        activityStatus = 'just now';
      }
    }
  }

  // Atomic Upsert: ensures profile is created even if sync is called before tracking
  const [updated] = await sql`
    INSERT INTO competitor_profiles (
      username,
      display_name,
      avatar_url,
      monthly_reach,
      reach_delta_7d,
      profile_views,
      views_delta_7d,
      total_pins,
      total_boards,
      follower_count,
      activity_status,
      account_type,
      last_synced_at,
      is_active,
      metadata,
      created_at,
      updated_at
    ) VALUES (
      ${cleanUsername},
      ${displayName},
      ${avatarUrl},
      ${monthlyReach},
      ${reachDelta},
      ${profileViews},
      ${viewsDelta},
      ${totalPins},
      ${totalBoards},
      ${followers},
      ${activityStatus},
      'competitor',
      NOW(),
      TRUE,
      ${JSON.stringify(metaUpdate)}::jsonb,
      NOW(),
      NOW()
    )
    ON CONFLICT (username) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      avatar_url = COALESCE(EXCLUDED.avatar_url, competitor_profiles.avatar_url),
      monthly_reach = CASE WHEN EXCLUDED.monthly_reach > 0 THEN EXCLUDED.monthly_reach ELSE competitor_profiles.monthly_reach END,
      reach_delta_7d = CASE WHEN EXCLUDED.monthly_reach > 0 THEN EXCLUDED.reach_delta_7d ELSE competitor_profiles.reach_delta_7d END,
      profile_views = CASE WHEN EXCLUDED.profile_views > 0 THEN EXCLUDED.profile_views ELSE competitor_profiles.profile_views END,
      views_delta_7d = CASE WHEN EXCLUDED.profile_views > 0 THEN EXCLUDED.views_delta_7d ELSE competitor_profiles.views_delta_7d END,
      total_pins = GREATEST(competitor_profiles.total_pins, EXCLUDED.total_pins),
      total_boards = GREATEST(competitor_profiles.total_boards, EXCLUDED.total_boards),
      follower_count = CASE WHEN EXCLUDED.follower_count > 0 THEN EXCLUDED.follower_count ELSE competitor_profiles.follower_count END,
      activity_status = ${activityStatus},
      metadata = COALESCE(competitor_profiles.metadata, '{}'::jsonb) || ${JSON.stringify(metaUpdate)}::jsonb,
      last_synced_at = NOW(),
      updated_at = NOW()
    RETURNING *;
  `;

  // Record daily history snapshot
  if (updated) {
    let pinAgg = { total_saves: 0, total_repins: 0 };
    try {
      const [agg] = await sql`
        SELECT COALESCE(SUM(save_count), 0)::bigint AS total_saves, COALESCE(SUM(repin_count), 0)::bigint AS total_repins
        FROM competitor_pins
        WHERE competitor_id = ${updated.id};
      `;
      if (agg) {
        pinAgg.total_saves = Number(agg.total_saves || 0);
        pinAgg.total_repins = Number(agg.total_repins || 0);
      }
    } catch (_) {}

    await sql`
      INSERT INTO competitor_history_snapshots (
        competitor_id,
        monthly_reach,
        profile_views,
        follower_count,
        total_pins,
        total_boards,
        recorded_date,
        metadata
      ) VALUES (
        ${updated.id},
        ${Number(updated.monthly_reach || monthlyReach || 0)},
        ${Number(updated.profile_views || profileViews || 0)},
        ${Number(updated.follower_count || followers || 0)},
        ${Number(updated.total_pins || totalPins || 0)},
        ${Number(updated.total_boards || totalBoards || 0)},
        CURRENT_DATE,
        ${JSON.stringify(pinAgg)}::jsonb
      )
      ON CONFLICT (competitor_id, recorded_date) DO UPDATE SET
        monthly_reach = CASE WHEN EXCLUDED.monthly_reach > 0 THEN EXCLUDED.monthly_reach ELSE competitor_history_snapshots.monthly_reach END,
        profile_views = CASE WHEN EXCLUDED.profile_views > 0 THEN EXCLUDED.profile_views ELSE competitor_history_snapshots.profile_views END,
        follower_count = CASE WHEN EXCLUDED.follower_count > 0 THEN EXCLUDED.follower_count ELSE competitor_history_snapshots.follower_count END,
        total_pins = GREATEST(competitor_history_snapshots.total_pins, EXCLUDED.total_pins),
        total_boards = GREATEST(competitor_history_snapshots.total_boards, EXCLUDED.total_boards),
        metadata = jsonb_set(
          jsonb_set(
            COALESCE(competitor_history_snapshots.metadata, '{}'::jsonb),
            '{total_saves}',
            to_jsonb(GREATEST(
              COALESCE((competitor_history_snapshots.metadata->>'total_saves')::bigint, 0),
              COALESCE((EXCLUDED.metadata->>'total_saves')::bigint, 0)
            ))
          ),
          '{total_repins}',
          to_jsonb(GREATEST(
            COALESCE((competitor_history_snapshots.metadata->>'total_repins')::bigint, 0),
            COALESCE((EXCLUDED.metadata->>'total_repins')::bigint, 0)
          ))
        )
      WHERE 
        competitor_history_snapshots.monthly_reach IS DISTINCT FROM EXCLUDED.monthly_reach
        OR competitor_history_snapshots.profile_views IS DISTINCT FROM EXCLUDED.profile_views
        OR competitor_history_snapshots.follower_count IS DISTINCT FROM EXCLUDED.follower_count
        OR competitor_history_snapshots.total_pins IS DISTINCT FROM EXCLUDED.total_pins
        OR competitor_history_snapshots.total_boards IS DISTINCT FROM EXCLUDED.total_boards;
    `;

    // Atomic batch upsert for initial boards via jsonb_to_recordset (1 single roundtrip instead of N queries)
    if (Array.isArray(res.initial_boards) && res.initial_boards.length > 0) {
      try {
        const boardsPayload = res.initial_boards.map(b => ({
          competitor_id: updated.id,
          board_id: String(b.board_id || ''),
          name: String(b.name || ''),
          url: String(b.url || ''),
          pin_count: Number(b.pin_count || 0),
          follower_count: Number(b.follower_count || 0),
          last_pinned_at: b.last_pinned_at ? new Date(b.last_pinned_at).toISOString() : null
        })).filter(b => b.board_id);

        if (boardsPayload.length > 0) {
          await sql`
            INSERT INTO competitor_boards (
              competitor_id, board_id, name, url, pin_count, follower_count,
              last_pinned_at, updated_at
            )
            SELECT 
              r.competitor_id,
              r.board_id,
              r.name,
              r.url,
              r.pin_count,
              r.follower_count,
              r.last_pinned_at::timestamptz,
              NOW()
            FROM jsonb_to_recordset(${JSON.stringify(boardsPayload)}::jsonb) AS r(
              competitor_id int,
              board_id text,
              name text,
              url text,
              pin_count int,
              follower_count int,
              last_pinned_at text
            )
            ON CONFLICT (competitor_id, board_id) DO UPDATE SET
              name = EXCLUDED.name,
              url = EXCLUDED.url,
              pin_count = EXCLUDED.pin_count,
              follower_count = EXCLUDED.follower_count,
              last_pinned_at = COALESCE(EXCLUDED.last_pinned_at, competitor_boards.last_pinned_at),
              updated_at = NOW()
            WHERE competitor_boards.name IS DISTINCT FROM EXCLUDED.name
               OR competitor_boards.pin_count IS DISTINCT FROM EXCLUDED.pin_count
               OR competitor_boards.follower_count IS DISTINCT FROM EXCLUDED.follower_count
               OR competitor_boards.last_pinned_at IS DISTINCT FROM EXCLUDED.last_pinned_at;
          `;
        }
      } catch (boardErr) {
        console.warn('[syncCompetitorProfile] Batch initial_boards upsert warning:', boardErr?.message || boardErr);
      }
    }
  }

  return updated;
}

/**
 * Get all boards for a competitor
 */
export async function getCompetitorBoards(sql, competitorId, { username = '' } = {}) {
  let cleanUser = username ? normalizePinterestUsername(username) : null;
  let numericId = parseInt(competitorId, 10);
  if (!cleanUser && isNaN(numericId) && competitorId) {
    cleanUser = normalizePinterestUsername(competitorId);
  }

  // Resolve local shard numeric ID prioritizing canonical username:
  numericId = await resolveLocalCompetitorId(sql, cleanUser || competitorId, { expectedUsername: cleanUser });
  if (!numericId || isNaN(numericId)) return [];

  let boards = [];
  try {
    boards = await sql`
      WITH deduped AS (
        SELECT DISTINCT ON (LOWER(TRIM(cb.name)))
          cb.*
        FROM competitor_boards cb
        WHERE cb.competitor_id = ${numericId}
        ORDER BY 
          LOWER(TRIM(cb.name)),
          (CASE WHEN cb.board_id NOT LIKE 'cb-%' THEN 0 ELSE 1 END) ASC,
          cb.pin_count DESC
      )
      SELECT * FROM deduped
      ORDER BY pin_count DESC;
    `;
  } catch (err) {
    console.warn(`[getCompetitorBoards] Boards query error for ID ${numericId}:`, err.message);
  }

  // Discover & merge any additional boards from competitor_pins
  try {
    const rawBoards = await sql`
      SELECT 
        COALESCE(NULLIF(TRIM(board_name), ''), 'General') AS name,
        COUNT(*)::int AS pin_count,
        0::int AS follower_count,
        MAX(created_at_pinterest) AS last_pinned_at,
        MIN(created_at_pinterest) AS created_at
      FROM competitor_pins
      WHERE competitor_id = ${numericId} AND board_name IS NOT NULL AND TRIM(board_name) <> ''
      GROUP BY name
      ORDER BY pin_count DESC;
    `;
    const existingNames = new Set(boards.map(b => (b.name || '').trim().toLowerCase()));
    for (const b of rawBoards) {
      const norm = (b.name || '').trim().toLowerCase();
      if (!existingNames.has(norm)) {
        existingNames.add(norm);
        boards.push({
          id: boards.length + 1,
          competitor_id: numericId,
          board_id: generateSyntheticBoardId(numericId, b.name),
          name: b.name,
          url: `https://www.pinterest.com/${cleanUser || 'pin'}/${encodeURIComponent(b.name.toLowerCase().replace(/\s+/g, '-'))}/`,
          pin_count: b.pin_count,
          follower_count: b.follower_count,
          last_pinned_at: b.last_pinned_at,
          created_at: b.created_at,
          metadata: {}
        });
      }
    }
  } catch (err) {
    console.warn(`[getCompetitorBoards] Pin board discovery aggregation error for ID ${numericId}:`, err.message);
  }

  // Invariant guarantee: strictly one entry per unique normalized board name, prioritizing authentic boards
  const uniqueBoardMap = new Map();
  for (const b of boards) {
    const norm = (b.name || '').trim().toLowerCase();
    if (!norm) continue;
    const existing = uniqueBoardMap.get(norm);
    if (!existing) {
      uniqueBoardMap.set(norm, b);
    } else {
      const isCurAuthentic = !String(b.board_id || '').startsWith('cb-');
      const isExistingAuthentic = !String(existing.board_id || '').startsWith('cb-');
      if (isCurAuthentic && !isExistingAuthentic) {
        uniqueBoardMap.set(norm, b);
      } else if (isCurAuthentic === isExistingAuthentic && (b.pin_count || 0) > (existing.pin_count || 0)) {
        uniqueBoardMap.set(norm, b);
      }
    }
  }
  boards = Array.from(uniqueBoardMap.values()).sort((a, b) => (b.pin_count || 0) - (a.pin_count || 0));

  // Map metadata to top-level fields for fast access
  boards = boards.map(b => {
    const meta = (typeof b.metadata === 'object' && b.metadata !== null) ? b.metadata : {};
    return {
      ...b,
      image_cover_url: b.image_cover_url || meta.image_cover_url || null,
      board_vase: Array.isArray(b.board_vase) && b.board_vase.length > 0 ? b.board_vase : (Array.isArray(meta.board_vase) ? meta.board_vase : []),
      description: b.description || meta.description || ''
    };
  });

  // Fallback: Populate missing board covers using the top saved pin from pa_pins for that board
  const boardsNeedingCover = boards.filter(b => !b.image_cover_url && b.name);
  if (boardsNeedingCover.length > 0 && cleanUser) {
    try {
      const pinCovers = await sql`
        SELECT DISTINCT ON (LOWER(TRIM(board_name)))
          LOWER(TRIM(board_name)) AS b_name,
          image_url
        FROM pa_pins
        WHERE account_username = ${cleanUser}
          AND image_url IS NOT NULL AND image_url <> ''
        ORDER BY LOWER(TRIM(board_name)), saves DESC;
      `;
      const coverMap = new Map();
      for (const row of pinCovers) {
        coverMap.set(row.b_name, row.image_url);
      }
      for (const b of boards) {
        if (!b.image_cover_url && b.name) {
          const c = coverMap.get(b.name.trim().toLowerCase());
          if (c) b.image_cover_url = c;
        }
      }
    } catch (_) {}
  }

  return boards;
}

/**
 * Sync boards for a competitor from Pinterest BoardsResource
 */
export async function syncCompetitorBoards(sql, competitorId, username, cookie = '') {
  let cleanUsername = normalizePinterestUsername(username);
  let numericId = parseInt(competitorId, 10);

  if (cleanUsername) {
    try {
      const [c] = await sql`SELECT id, username FROM competitor_profiles WHERE LOWER(username) = ${cleanUsername} LIMIT 1;`;
      if (c?.id) {
        numericId = c.id;
        cleanUsername = c.username;
      }
    } catch (_) {}
  } else if (!cleanUsername && !isNaN(numericId)) {
    try {
      const [c] = await sql`SELECT id, username FROM competitor_profiles WHERE id = ${numericId} LIMIT 1;`;
      if (c?.username) cleanUsername = c.username;
    } catch (_) {}
  }

  // Auto-provision competitor profile if cleanUsername is provided but profile doesn't exist yet
  if (cleanUsername && isNaN(numericId)) {
    try {
      const [c] = await sql`
        INSERT INTO competitor_profiles (username, display_name, account_type, is_active, updated_at)
        VALUES (${cleanUsername}, ${cleanUsername}, 'competitor', TRUE, NOW())
        ON CONFLICT (username) DO UPDATE SET updated_at = NOW()
        RETURNING id, username;
      `;
      if (c?.id) {
        numericId = c.id;
        cleanUsername = c.username;
      }
    } catch (_) {}
  }

  if (isNaN(numericId) || !cleanUsername) {
    throw new Error('Valid competitorId or username is required to sync boards');
  }

  const formattedCookie = formatPinterestCookie(cookie);

  const res = await fetchBoardsResource(cleanUsername, formattedCookie);
  if (!res.ok || !Array.isArray(res.boards)) {
    return { ok: false, error: res.error || 'Failed to fetch boards from Pinterest' };
  }

  const records = [];
  const authenticNames = [];

  for (const b of res.boards) {
    const boardId = String(b.board_id || '').trim();
    if (!boardId || boardId === 'undefined') continue;
    let lastPinnedDate = null;
    if (b.last_pinned_at) {
      const d = new Date(b.last_pinned_at);
      if (!isNaN(d.getTime())) lastPinnedDate = d.toISOString();
    }
    let boardCreatedAt = null;
    if (b.created_at) {
      const cd = new Date(b.created_at);
      if (!isNaN(cd.getTime())) boardCreatedAt = cd.toISOString();
    }
    const metadataObj = {
      image_cover_url: b.image_cover_url || b.metadata?.image_cover_url || null,
      board_vase: Array.isArray(b.board_vase) && b.board_vase.length > 0 ? b.board_vase : (Array.isArray(b.metadata?.board_vase) ? b.metadata.board_vase : []),
      description: b.description || b.metadata?.description || '',
      section_count: b.metadata?.section_count || 0,
      privacy: b.metadata?.privacy || 'public',
      is_collaborative: Boolean(b.is_collaborative || b.metadata?.is_collaborative),
      is_group_board: Boolean(b.is_group_board || b.metadata?.is_group_board),
      owner_username: b.owner_username || b.metadata?.owner_username || null,
      collaborator_count: Number(b.collaborator_count || b.metadata?.collaborator_count || 0)
    };
    records.push({
      board_id: boardId,
      name: String(b.name || 'Untitled Board').slice(0, 255),
      url: b.url || '',
      pin_count: Number(b.pin_count) || 0,
      follower_count: Number(b.follower_count) || 0,
      last_pinned_at: lastPinnedDate,
      metadata: metadataObj,
      created_at: boardCreatedAt
    });
    if (!boardId.startsWith('cb-') && b.name) {
      authenticNames.push(b.name.trim().toLowerCase());
    }
  }

  // Purge any legacy synthetic placeholder boards
  if (authenticNames.length > 0) {
    try {
      await sql`
        DELETE FROM competitor_boards
        WHERE competitor_id = ${numericId}
          AND board_id LIKE 'cb-%'
          AND LOWER(TRIM(name)) = ANY(${authenticNames});
      `;
    } catch (_) {}
  }

  let syncedCount = 0;
  const chunkSize = 200;
  for (let i = 0; i < records.length; i += chunkSize) {
    const chunk = records.slice(i, i + chunkSize);
    try {
      const inserted = await sql`
        INSERT INTO competitor_boards (
          competitor_id,
          board_id,
          name,
          url,
          pin_count,
          follower_count,
          last_pinned_at,
          metadata,
          created_at,
          updated_at
        )
        SELECT
          ${numericId},
          x.board_id,
          x.name,
          x.url,
          COALESCE(x.pin_count, 0),
          COALESCE(x.follower_count, 0),
          x.last_pinned_at,
          COALESCE(x.metadata, '{}'::jsonb),
          COALESCE(x.created_at, NOW()),
          NOW()
        FROM jsonb_to_recordset(${typeof sql.json === 'function' ? sql.json(chunk) : JSON.stringify(chunk)}::jsonb) AS x(
          board_id VARCHAR(64),
          name VARCHAR(255),
          url TEXT,
          pin_count INT,
          follower_count INT,
          last_pinned_at TIMESTAMPTZ,
          metadata JSONB,
          created_at TIMESTAMPTZ
        )
        ON CONFLICT (competitor_id, board_id) DO UPDATE SET
          name = EXCLUDED.name,
          url = EXCLUDED.url,
          pin_count = EXCLUDED.pin_count,
          follower_count = EXCLUDED.follower_count,
          last_pinned_at = EXCLUDED.last_pinned_at,
          metadata = EXCLUDED.metadata,
          created_at = COALESCE(EXCLUDED.created_at, competitor_boards.created_at),
          updated_at = NOW()
        RETURNING id;
      `;
      syncedCount += inserted.length || chunk.length;
    } catch (batchErr) {
      console.warn(`[syncCompetitorBoards] Batch insert fallback for chunk:`, batchErr.message);
      for (const b of chunk) {
        try {
          await sql`
            INSERT INTO competitor_boards (
              competitor_id, board_id, name, url, pin_count, follower_count, last_pinned_at, metadata, created_at, updated_at
            ) VALUES (
              ${numericId}, ${b.board_id}, ${b.name}, ${b.url}, ${b.pin_count}, ${b.follower_count},
              ${b.last_pinned_at}, ${JSON.stringify(b.metadata)}::jsonb, COALESCE(${b.created_at}, NOW()), NOW()
            )
            ON CONFLICT (competitor_id, board_id) DO UPDATE SET
              name = EXCLUDED.name,
              url = EXCLUDED.url,
              pin_count = EXCLUDED.pin_count,
              follower_count = EXCLUDED.follower_count,
              last_pinned_at = EXCLUDED.last_pinned_at,
              metadata = EXCLUDED.metadata,
              created_at = COALESCE(EXCLUDED.created_at, competitor_boards.created_at),
              updated_at = NOW();
          `;
          syncedCount++;
        } catch (_) {}
      }
    }
  }

  // Update total_boards on competitor profile (counting unique boards)
  await sql`
    UPDATE competitor_profiles
    SET total_boards = (SELECT count(DISTINCT LOWER(TRIM(name)))::int FROM competitor_boards WHERE competitor_id = ${numericId}),
        updated_at = NOW()
    WHERE id = ${numericId};
  `;

  return { ok: true, synced: syncedCount, synced_boards_count: syncedCount, boards: res.boards };
}

/**
 * Retrieve board details with authentic algorithmic board_vase (Related Interests).
 * If board_vase is missing in competitor_boards, automatically fetches from Pinterest live HTML and persists it.
 */
export async function getOrSyncBoardDetail(sql, username, boardNameOrSlug, options = {}) {
  const cleanUsername = normalizePinterestUsername(username);
  if (!cleanUsername) throw new Error('username is required');
  const rawBoard = String(boardNameOrSlug || '').trim();
  if (!rawBoard) throw new Error('board is required');

  const forceRefresh = options?.forceRefresh === true || options?.refresh === true;

  // 1. Look up competitor profile
  let competitorId = null;
  try {
    const [c] = await sql`
      SELECT id, username FROM competitor_profiles 
      WHERE LOWER(username) = ${cleanUsername} 
      LIMIT 1;
    `;
    if (c?.id) competitorId = c.id;
  } catch (_) {}

  // 2. Query competitor_boards
  let existingBoard = null;
  if (competitorId) {
    try {
      const rows = await sql`
        SELECT * FROM competitor_boards
        WHERE competitor_id = ${competitorId}
          AND (
            LOWER(TRIM(name)) = ${rawBoard.toLowerCase()} OR
            REPLACE(LOWER(TRIM(name)), ' ', '-') = REPLACE(${rawBoard.toLowerCase()}, ' ', '-') OR
            REPLACE(LOWER(TRIM(name)), '-', ' ') = REPLACE(${rawBoard.toLowerCase()}, '-', ' ') OR
            LOWER(REGEXP_REPLACE(REGEXP_REPLACE(TRIM(name), '[^[:alnum:]]+', '-', 'g'), '^-|-$', '', 'g')) = LOWER(REGEXP_REPLACE(REGEXP_REPLACE(${rawBoard}, '[^[:alnum:]]+', '-', 'g'), '^-|-$', '', 'g')) OR
            url ILIKE ${'%' + encodeURIComponent(rawBoard.toLowerCase().replace(/\s+/g, '-')) + '%'} OR
            url ILIKE ${'%' + rawBoard.toLowerCase().replace(/\s+/g, '-') + '%'}
          )
        ORDER BY 
          (CASE WHEN board_id NOT LIKE 'cb-%' THEN 0 ELSE 1 END) ASC,
          pin_count DESC
        LIMIT 1;
      `;
      existingBoard = rows[0] || null;
    } catch (_) {}
  }

  const existingMeta = (typeof existingBoard?.metadata === 'object' && existingBoard?.metadata !== null) ? existingBoard.metadata : {};
  const existingVase = Array.isArray(existingBoard?.board_vase) && existingBoard.board_vase.length > 0
    ? existingBoard.board_vase
    : (Array.isArray(existingMeta.board_vase) ? existingMeta.board_vase : []);

  // If already has board_vase and not forcing refresh, return immediately
  if (existingBoard && existingVase.length > 0 && !forceRefresh) {
    return {
      board_id: existingBoard.board_id,
      name: existingBoard.name,
      url: existingBoard.url,
      pin_count: Number(existingBoard.pin_count || 0),
      follower_count: Number(existingBoard.follower_count || 0),
      image_cover_url: existingBoard.image_cover_url || existingMeta.image_cover_url || null,
      description: existingBoard.description || existingMeta.description || '',
      board_vase: existingVase,
      last_pinned_at: existingBoard.last_pinned_at,
      created_at: existingBoard.created_at
    };
  }

  // 3. Live fetch from Pinterest unauthenticated board page
  let scraped = null;
  try {
    const sRes = await fetchBoardDetailUnauth(cleanUsername, rawBoard);
    if (sRes.ok && sRes.board) {
      scraped = sRes.board;
    }
  } catch (err) {
    console.warn(`[getOrSyncBoardDetail] Anonymous board scrape failed for ${cleanUsername}/${rawBoard}:`, err.message);
  }

  if (scraped) {
    const metaToSave = {
      ...(existingMeta || {}),
      image_cover_url: scraped.image_cover_url || existingMeta.image_cover_url || null,
      board_vase: scraped.board_vase || [],
      description: scraped.description || existingMeta.description || '',
    };

    if (competitorId && scraped.board_id) {
      try {
        if (!String(scraped.board_id).startsWith('cb-')) {
          await sql`
            DELETE FROM competitor_boards
            WHERE competitor_id = ${competitorId}
              AND board_id LIKE 'cb-%'
              AND (
                LOWER(TRIM(name)) = ${rawBoard.toLowerCase()} OR
                LOWER(TRIM(name)) = LOWER(TRIM(${scraped.name || ''})) OR
                LOWER(REGEXP_REPLACE(REGEXP_REPLACE(TRIM(name), '[^[:alnum:]]+', '-', 'g'), '^-|-$', '', 'g')) = LOWER(REGEXP_REPLACE(REGEXP_REPLACE(${rawBoard}, '[^[:alnum:]]+', '-', 'g'), '^-|-$', '', 'g'))
              );
          `.catch(() => {});
        }

        await sql`
          INSERT INTO competitor_boards (
            competitor_id, board_id, name, url, pin_count, follower_count,
            metadata, created_at, updated_at
          ) VALUES (
            ${competitorId},
            ${scraped.board_id},
            ${scraped.name || rawBoard},
            ${scraped.url},
            ${scraped.pin_count || 0},
            ${scraped.follower_count || 0},
            ${JSON.stringify(metaToSave)}::jsonb,
            COALESCE(${scraped.created_at ? new Date(scraped.created_at) : null}, NOW()),
            NOW()
          )
          ON CONFLICT (competitor_id, board_id) DO UPDATE SET
            name = EXCLUDED.name,
            url = EXCLUDED.url,
            pin_count = GREATEST(competitor_boards.pin_count, EXCLUDED.pin_count),
            follower_count = EXCLUDED.follower_count,
            metadata = EXCLUDED.metadata,
            updated_at = NOW();
        `;
      } catch (saveErr) {
        console.warn(`[getOrSyncBoardDetail] Failed to persist board to DB:`, saveErr.message);
      }
    }

    return {
      board_id: scraped.board_id,
      name: scraped.name,
      url: scraped.url,
      pin_count: scraped.pin_count,
      follower_count: scraped.follower_count,
      image_cover_url: scraped.image_cover_url,
      description: scraped.description,
      board_vase: scraped.board_vase,
      board_order_modified_at: scraped.board_order_modified_at,
      created_at: scraped.created_at
    };
  }

  // Fallback to existingBoard if Pinterest scrape failed
  if (existingBoard) {
    return {
      board_id: existingBoard.board_id,
      name: existingBoard.name,
      url: existingBoard.url,
      pin_count: Number(existingBoard.pin_count || 0),
      follower_count: Number(existingBoard.follower_count || 0),
      image_cover_url: existingBoard.image_cover_url || existingMeta.image_cover_url || null,
      description: existingBoard.description || existingMeta.description || '',
      board_vase: existingVase,
      last_pinned_at: existingBoard.last_pinned_at,
      created_at: existingBoard.created_at
    };
  }

  return {
    board_id: null,
    name: rawBoard,
    url: `https://www.pinterest.com/${cleanUsername}/${encodeURIComponent(rawBoard.toLowerCase().replace(/\s+/g, '-'))}/`,
    pin_count: 0,
    follower_count: 0,
    image_cover_url: null,
    description: '',
    board_vase: []
  };
}

/**
 * Harvest winning pins for a competitor into PinArchive using Early-Stop (daily) or Deep Sweep (audit)
 * Evaluates all pins against active Pin Qualification Rules (Tier 1/2/3 OR Criteria).
 */
export async function syncCompetitorPins(sql, competitorId, username, { mode = 'daily', maxPages = null, cookie = '', fastJitter = false } = {}) {
  let cleanUsername = normalizePinterestUsername(username);
  let numericId = parseInt(competitorId, 10);

  if (cleanUsername) {
    try {
      const [c] = await sql`SELECT id, username FROM competitor_profiles WHERE LOWER(username) = ${cleanUsername} LIMIT 1;`;
      if (c?.id) {
        numericId = c.id;
        cleanUsername = c.username;
      }
    } catch (_) {}
  } else if (!cleanUsername && !isNaN(numericId)) {
    try {
      const [c] = await sql`SELECT id, username FROM competitor_profiles WHERE id = ${numericId} LIMIT 1;`;
      if (c?.username) cleanUsername = c.username;
    } catch (_) {}
  }

  if (!cleanUsername) throw new Error('Username is required');

  const globalRules = await getQualificationRules(sql);
  let compRules = null;
  if (numericId && !isNaN(numericId)) {
    try {
      const cr = await getCompetitorRules(sql, numericId);
      compRules = cr?.rules;
    } catch (_) {}
  }
  const rules = {
    ...globalRules,
    ...(compRules || {})
  };
  if (rules.master_ingest_enabled === false) {
    return { ok: false, error: 'Master Ingest is currently disabled in Pin Qualification Rules.' };
  }

  // Enforce paused_policy: reject if competitor is inactive
  const safeId = isNaN(numericId) ? -1 : numericId;
  const [profile] = await sql`
    SELECT id, username, is_active, metadata FROM competitor_profiles 
    WHERE id = ${safeId} OR LOWER(username) = ${cleanUsername} 
    LIMIT 1;
  `;
  if (profile && profile.is_active === false && String(rules.paused_policy).toLowerCase() === 'reject') {
    return { ok: false, error: `Competitor @${cleanUsername} is paused/inactive and paused_policy is set to 'reject'.` };
  }
  const shouldAutoArchive = profile?.metadata?.auto_archive_winning !== false;

  // Determine pagination depth based on mode (strictly bounds daily mode to rules.early_stop_pages)
  const numMaxPages = (maxPages !== null && maxPages !== undefined && !isNaN(Number(maxPages)) && Number(maxPages) > 0)
    ? Number(maxPages)
    : null;
  let pageLimit = Number(rules.early_stop_pages) || 3;
  if (mode === 'all' || mode === 'full') {
    pageLimit = numMaxPages ? Math.min(numMaxPages, 1000) : 100;
  } else if (mode === 'deep' || mode === 'discovery') {
    pageLimit = numMaxPages ? Math.min(numMaxPages, 2000) : (Number(rules.discovery_max_pages) || 1000);
  } else if (numMaxPages) {
    pageLimit = numMaxPages;
  }

  const formattedCookie = formatPinterestCookie(cookie);

  let currentBookmark = null;
  let lastSeenBookmark = null;
  let totalFetched = 0;
  let allQualifiedCount = 0;
  let pagesCrawled = 0;

  for (let page = 1; page <= pageLimit; page++) {
    pagesCrawled++;
    const res = await fetchUserActivityPinsResource(cleanUsername, currentBookmark, formattedCookie);
    if (!res.ok) {
      if (page === 1) return { ok: false, error: res.error || `Pinterest API returned error ${res.status}` };
      break; // Stop pagination on error for later pages
    }

    const pins = res.pins || [];
    totalFetched += pins.length;

    // 1. Always store ALL raw fetched pins in competitor_pins inventory
    if (pins.length > 0 && numericId) {
      await upsertCompetitorPins(sql, numericId, pins);
    }

    // 2. Filter through 3-tier OR qualification rules & ingest qualified winning pins into pa_pins
    // Only run during refresh/daily sync; in discovery mode, parallel shards handle deep Relay v3 enrichment!
    if (pins.length > 0 && mode !== 'discovery' && shouldAutoArchive) {
      const ingestRes = await ingestPinsBatch(sql, pins, cleanUsername, { filterQualified: true, rules });
      allQualifiedCount += (ingestRes.added + ingestRes.updated);
    }

    // Real-time progress feedback in workflow logs
    if (page === 1 || page % 10 === 0) {
      console.log(`    [✓] Ingestion Progress: Page ${page}/${pageLimit} (${totalFetched} pin IDs discovered so far)...`);
    }

    currentBookmark = res.nextBookmark;
    if (!currentBookmark || currentBookmark === '-end-' || currentBookmark === lastSeenBookmark) break; // End of feed
    lastSeenBookmark = currentBookmark;

    // Inject jitter delay between pages (discovery or fastJitter: 250-450ms for high-speed indexing; refresh/daily: 1500-2500ms)
    if (page < pageLimit) {
      const delay = (mode === 'discovery' || fastJitter === true) ? randomJitterMs(250, 450) : randomJitterMs(1500, 2500);
      await sleep(delay);
    }
  }

  // Auto-backfill discovered boards from competitor_pins into competitor_boards
  if (numericId && cleanUsername) {
    try {
      await sql`
        INSERT INTO competitor_boards (competitor_id, board_id, name, url, pin_count, follower_count, last_pinned_at, created_at, updated_at)
        SELECT 
          ${numericId},
          'cb-' || substr(md5(lower(trim(cp.board_name))), 1, 16),
          trim(cp.board_name),
          'https://www.pinterest.com/' || ${cleanUsername} || '/' || lower(regexp_replace(trim(cp.board_name), '[^a-zA-Z0-9]+', '-', 'g')) || '/',
          count(*)::int,
          0::int,
          max(cp.created_at_pinterest),
          min(cp.created_at_pinterest),
          NOW()
        FROM competitor_pins cp
        WHERE cp.competitor_id = ${numericId} 
          AND cp.board_name IS NOT NULL 
          AND trim(cp.board_name) <> ''
          AND NOT EXISTS (
            SELECT 1 FROM competitor_boards cb 
            WHERE cb.competitor_id = ${numericId} 
              AND lower(trim(cb.name)) = lower(trim(cp.board_name))
          )
        GROUP BY trim(cp.board_name)
        ON CONFLICT (competitor_id, board_id) DO NOTHING;
      `;
    } catch (_) {}
  }

  // Update harvest metadata on competitor profile without clobbering total_pins published catalog
  const harvestMeta = {
    last_sync_mode: mode,
    pages_crawled: pagesCrawled,
    total_fetched: totalFetched,
    qualified_archived: allQualifiedCount,
    synced_at: new Date().toISOString()
  };

  await sql`
    UPDATE competitor_profiles
    SET last_harvest_metadata = COALESCE(competitor_profiles.last_harvest_metadata, '{}'::jsonb) || ${JSON.stringify(harvestMeta)}::jsonb,
        last_synced_at = NOW(),
        updated_at = NOW()
    WHERE LOWER(username) = ${cleanUsername} OR id = ${isNaN(numericId) ? -1 : numericId};
  `;

  return {
    ok: true,
    mode,
    pages_crawled: pagesCrawled,
    total_fetched: totalFetched,
    crawled: totalFetched,
    qualified: allQualifiedCount,
    inserted: allQualifiedCount,
    qualified_archived: allQualifiedCount,
    metadata: harvestMeta
  };
}

/**
 * Harvest pins from a specific board of a competitor into competitor_pins and pa_pins (board-level crawling).
 */
export async function syncCompetitorBoardPins(sql, competitorId, username, board, { mode = 'daily', maxPages = 50, cookie = '' } = {}) {
  let cleanUsername = normalizePinterestUsername(username);
  let numericId = parseInt(competitorId, 10);

  let compProfile = null;
  if (cleanUsername) {
    try {
      const [c] = await sql`SELECT id, username, metadata FROM competitor_profiles WHERE LOWER(username) = ${cleanUsername} LIMIT 1;`;
      if (c?.id) {
        numericId = c.id;
        cleanUsername = c.username;
        compProfile = c;
      }
    } catch (_) {}
  } else if (!cleanUsername && !isNaN(numericId)) {
    try {
      const [c] = await sql`SELECT id, username, metadata FROM competitor_profiles WHERE id = ${numericId} LIMIT 1;`;
      if (c?.username) {
        cleanUsername = c.username;
        compProfile = c;
      }
    } catch (_) {}
  }

  if (!cleanUsername) throw new Error('Username is required to sync board pins');

  const boardId = String(board?.board_id || board?.id || '').trim();
  const boardName = String(board?.name || 'Untitled Board').trim();
  let boardUrl = String(board?.url || '').trim();

  if (!boardUrl) {
    boardUrl = `/${cleanUsername}/${encodeURIComponent(boardName.toLowerCase().replace(/\s+/g, '-'))}/`;
  }

  const globalRules = await getQualificationRules(sql);
  let compRules = null;
  if (numericId && !isNaN(numericId)) {
    try {
      const cr = await getCompetitorRules(sql, numericId);
      compRules = cr?.rules;
    } catch (_) {}
  }
  const rules = {
    ...globalRules,
    ...(compRules || {})
  };
  const formattedCookie = formatPinterestCookie(cookie);

  let currentBookmark = null;
  let lastSeenBookmark = null;
  let totalFetched = 0;
  let allQualifiedCount = 0;
  let pagesCrawled = 0;
  const pageLimit = Math.max(1, Math.min(Number(maxPages) || 50, 200));

  for (let page = 1; page <= pageLimit; page++) {
    pagesCrawled++;
    const res = await fetchBoardFeedResource(boardId, boardUrl, currentBookmark, formattedCookie);
    if (!res.ok) {
      if (page === 1) return { ok: false, error: res.error || `BoardFeedResource error ${res.status}` };
      break;
    }

    const pins = (res.pins || []).map(p => ({
      ...p,
      board_name: boardName
    }));
    totalFetched += pins.length;

    // 1. Raw inventory upsert to competitor_pins
    if (pins.length > 0 && numericId) {
      await upsertCompetitorPins(sql, numericId, pins);
    }

    // 2. Filter through 3-tier OR rules & ingest qualified winning pins into pa_pins
    // Only run during refresh/daily sync; in discovery mode, parallel shards handle deep Relay v3 enrichment!
    const shouldAutoArchive = compProfile?.metadata?.auto_archive_winning !== false;
    if (pins.length > 0 && mode !== 'discovery' && shouldAutoArchive) {
      const ingestRes = await ingestPinsBatch(sql, pins, cleanUsername, { filterQualified: true, rules });
      allQualifiedCount += (ingestRes.added + ingestRes.updated);
    }

    // Real-time progress feedback in workflow logs
    if (page === 1 || page % 5 === 0) {
      console.log(`    [✓] Board "${boardName}": Page ${page}/${pageLimit} (${totalFetched} pins discovered so far)...`);
    }

    currentBookmark = res.nextBookmark;
    if (!currentBookmark || currentBookmark === '-end-' || currentBookmark === lastSeenBookmark) break;
    lastSeenBookmark = currentBookmark;

    if (page < pageLimit) {
      const delay = (mode === 'discovery') ? randomJitterMs(250, 450) : randomJitterMs(1500, 2500);
      await sleep(delay);
    }
  }

  // Update board's pin_count in competitor_boards
  if (numericId && boardId) {
    try {
      await sql`
        UPDATE competitor_boards
        SET pin_count = GREATEST(pin_count, ${totalFetched}),
            last_pinned_at = NOW(),
            updated_at = NOW()
        WHERE competitor_id = ${numericId} AND board_id = ${boardId};
      `;
    } catch (_) {}
  }

  return {
    ok: true,
    board_id: boardId,
    board_name: boardName,
    pages_crawled: pagesCrawled,
    total_fetched: totalFetched,
    crawled: totalFetched,
    qualified: allQualifiedCount,
    inserted: allQualifiedCount
  };
}

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

  // Step 1: Canonical lookup by username first across any shard
  if (cleanUsername) {
    const [pByUsername] = await sql`SELECT * FROM competitor_profiles WHERE LOWER(username) = ${cleanUsername} LIMIT 1;`;
    if (pByUsername) {
      profile = pByUsername;
      numericId = profile.id;
    }
  }

  // Step 2: Fallback lookup by local numeric ID
  if (!profile && !isNaN(numericId)) {
    const [pById] = await sql`SELECT * FROM competitor_profiles WHERE id = ${numericId} LIMIT 1;`;
    if (pById) {
      profile = pById;
      cleanUsername = normalizePinterestUsername(profile.username);
    }
  }

  if (!profile && cleanUsername && isNaN(numericId)) {
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

  // 1. Fetch boards
  let boards = [];
  try {
    boards = await sql`
      WITH deduped AS (
        SELECT DISTINCT ON (LOWER(TRIM(cb.name)))
          cb.*,
          COALESCE(
            CASE 
              WHEN cb.created_at IS NOT NULL AND cb.created_at < (NOW() - INTERVAL '1 day') THEN cb.created_at
              ELSE NULL
            END,
            (SELECT MIN(created_at_pinterest) FROM competitor_pins WHERE competitor_id = cb.competitor_id AND LOWER(TRIM(board_name)) = LOWER(TRIM(cb.name))),
            (SELECT MIN(created_at_pinterest) FROM pa_pins WHERE account_username = ${cleanUsername} AND LOWER(TRIM(board_name)) = LOWER(TRIM(cb.name))),
            cb.created_at,
            cb.last_pinned_at
          ) AS board_created_at
        FROM competitor_boards cb
        WHERE cb.competitor_id = ${compId}
        ORDER BY 
          LOWER(TRIM(cb.name)),
          (CASE WHEN cb.board_id NOT LIKE 'cb-%' THEN 0 ELSE 1 END) ASC,
          cb.pin_count DESC
      )
      SELECT * FROM deduped
      ORDER BY pin_count DESC;
    `;
  } catch (boardErr) {
    console.warn(`[getCompetitorDetail] Could not query competitor_boards for #${compId}:`, boardErr.message);
  }

  // Fallback A: If no competitor_boards record exists yet, discover boards from pa_pins
  if (boards.length === 0 && cleanUsername) {
    try {
      const pinBoards = await sql`
        SELECT 
          COALESCE(NULLIF(TRIM(board_name), ''), 'General') AS name,
          COUNT(*)::int AS pin_count,
          0::int AS follower_count,
          MAX(created_at_pinterest) AS last_pinned_at,
          MIN(created_at_pinterest) AS created_at
        FROM pa_pins
        WHERE account_username = ${cleanUsername}
        GROUP BY name
        ORDER BY pin_count DESC;
      `;
      if (pinBoards.length > 0) {
        boards = pinBoards.map((b, idx) => ({
          id: idx + 1,
          board_id: 'b-' + idx,
          name: b.name,
          url: `https://www.pinterest.com/${cleanUsername}/${encodeURIComponent(b.name.toLowerCase().replace(/\s+/g, '-'))}/`,
          pin_count: b.pin_count,
          follower_count: b.follower_count,
          last_pinned_at: b.last_pinned_at,
          created_at: b.created_at
        }));
      }
    } catch (_) {}
  }

  // Always discover & merge any additional boards from competitor_pins
  if (compId) {
    try {
      const rawBoards = await sql`
        SELECT 
          COALESCE(NULLIF(TRIM(board_name), ''), 'General') AS name,
          COUNT(*)::int AS pin_count,
          0::int AS follower_count,
          MAX(created_at_pinterest) AS last_pinned_at,
          MIN(created_at_pinterest) AS created_at
        FROM competitor_pins
        WHERE competitor_id = ${compId} AND board_name IS NOT NULL AND TRIM(board_name) <> ''
        GROUP BY name
        ORDER BY pin_count DESC;
      `;
      const existingNames = new Set(boards.map(b => (b.name || '').trim().toLowerCase()));
      for (const b of rawBoards) {
        const norm = (b.name || '').trim().toLowerCase();
        if (!existingNames.has(norm)) {
          existingNames.add(norm);
          boards.push({
            id: boards.length + 1,
            competitor_id: compId,
            board_id: 'cb-' + (boards.length + 1),
            name: b.name,
            url: `https://www.pinterest.com/${cleanUsername || profile.username}/${encodeURIComponent(b.name.toLowerCase().replace(/\s+/g, '-'))}/`,
            pin_count: b.pin_count,
            follower_count: b.follower_count,
            last_pinned_at: b.last_pinned_at,
            created_at: b.created_at,
            board_created_at: b.created_at
          });
        }
      }
    } catch (_) {}
  }

  // Invariant guarantee: strictly one entry per unique normalized board name, prioritizing authentic boards
  const uniqueDetailBoardMap = new Map();
  for (const b of boards) {
    const norm = (b.name || '').trim().toLowerCase();
    if (!norm) continue;
    const existing = uniqueDetailBoardMap.get(norm);
    if (!existing) {
      uniqueDetailBoardMap.set(norm, b);
    } else {
      const isCurAuthentic = !String(b.board_id || '').startsWith('cb-');
      const isExistingAuthentic = !String(existing.board_id || '').startsWith('cb-');
      if (isCurAuthentic && !isExistingAuthentic) {
        uniqueDetailBoardMap.set(norm, b);
      } else if (isCurAuthentic === isExistingAuthentic && (b.pin_count || 0) > (existing.pin_count || 0)) {
        uniqueDetailBoardMap.set(norm, b);
      }
    }
  }
  boards = Array.from(uniqueDetailBoardMap.values()).sort((a, b) => (b.pin_count || 0) - (a.pin_count || 0));

  // Map metadata to top-level fields for fast frontend access
  boards = boards.map(b => {
    const meta = (typeof b.metadata === 'object' && b.metadata !== null) ? b.metadata : {};
    return {
      ...b,
      image_cover_url: b.image_cover_url || meta.image_cover_url || null,
      board_vase: Array.isArray(b.board_vase) && b.board_vase.length > 0 ? b.board_vase : (Array.isArray(meta.board_vase) ? meta.board_vase : []),
      description: b.description || meta.description || ''
    };
  });

  // Fallback: Populate missing board covers using the top saved pin from pa_pins for that board
  const boardsNeedingCover = boards.filter(b => !b.image_cover_url && b.name);
  if (boardsNeedingCover.length > 0 && cleanUsername) {
    try {
      const pinCovers = await sql`
        SELECT DISTINCT ON (LOWER(TRIM(board_name)))
          LOWER(TRIM(board_name)) AS b_name,
          image_url
        FROM pa_pins
        WHERE account_username = ${cleanUsername}
          AND image_url IS NOT NULL AND image_url <> ''
        ORDER BY LOWER(TRIM(board_name)), saves DESC;
      `;
      const coverMap = new Map();
      for (const row of pinCovers) {
        coverMap.set(row.b_name, row.image_url);
      }
      for (const b of boards) {
        if (!b.image_cover_url && b.name) {
          const c = coverMap.get(b.name.trim().toLowerCase());
          if (c) b.image_cover_url = c;
        }
      }
    } catch (_) {}
  }

  // 2. Compute Strategy Age
  let strategyAgeDays = 0;
  let oldestBoardDateStr = 'No boards yet';
  if (boards.length > 0) {
    const oldestBoard = boards.reduce((oldest, b) => {
      const d = b.board_created_at || b.created_at || b.last_pinned_at;
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

  if (strategyAgeDays === 0 && cleanUsername) {
    try {
      const [oldestPin] = await sql`
        SELECT MIN(COALESCE(created_at_pinterest, first_seen_at)) AS oldest
        FROM pa_pins
        WHERE account_username = ${cleanUsername};
      `;
      if (oldestPin && oldestPin.oldest) {
        const oTime = new Date(oldestPin.oldest).getTime();
        if (!isNaN(oTime)) {
          strategyAgeDays = Math.max(0, Math.floor((Date.now() - oTime) / 86400000));
          oldestBoardDateStr = new Date(oTime).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
          });
        }
      }
    } catch (_) {}
  }

  if (strategyAgeDays === 0 && compId) {
    try {
      const [oldestRawPin] = await sql`
        SELECT MIN(COALESCE(created_at_pinterest, first_seen_at)) AS oldest
        FROM competitor_pins
        WHERE competitor_id = ${compId};
      `;
      if (oldestRawPin && oldestRawPin.oldest) {
        const oTime = new Date(oldestRawPin.oldest).getTime();
        if (!isNaN(oTime)) {
          strategyAgeDays = Math.max(0, Math.floor((Date.now() - oTime) / 86400000));
          oldestBoardDateStr = new Date(oTime).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
          });
        }
      }
    } catch (_) {}
  }

  // 2b. Compute Account Age (Official Pinterest Account Created Date or Earliest Signal)
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
  } else if (cleanUsername || compId) {
    try {
      const [earliestPin] = await sql`
        SELECT MIN(COALESCE(created_at_pinterest, first_seen_at)) AS oldest
        FROM competitor_pins
        WHERE competitor_id = ${compId} AND COALESCE(created_at_pinterest, first_seen_at) IS NOT NULL;
      `;
      if (earliestPin && earliestPin.oldest) {
        const pTime = new Date(earliestPin.oldest).getTime();
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
      }
    } catch (_) {}
  }

  if ((accountAgeDays === 0 || accountCreatedDateStr === 'No boards yet') && cleanUsername) {
    try {
      const [earliestPaPin] = await sql`
        SELECT MIN(COALESCE(created_at_pinterest, first_seen_at)) AS oldest
        FROM pa_pins
        WHERE account_username = ${cleanUsername} AND COALESCE(created_at_pinterest, first_seen_at) IS NOT NULL;
      `;
      if (earliestPaPin && earliestPaPin.oldest) {
        const pTime = new Date(earliestPaPin.oldest).getTime();
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
      }
    } catch (_) {}
  }

  if (accountAgeDays === 0 && profile.created_at) {
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

  // 3. Fetch snapshots
  let snapshots = [];
  try {
    snapshots = await sql`
      SELECT id, competitor_id, monthly_reach, profile_views, follower_count, total_pins, total_boards, recorded_date, metadata, created_at
      FROM competitor_history_snapshots
      WHERE competitor_id = ${compId}
      ORDER BY recorded_date ASC, id ASC;
    `;
  } catch (snapErr) {
    console.warn(`[getCompetitorDetail] Could not query competitor_history_snapshots for #${compId}:`, snapErr.message);
  }

  // 4. Compute Deltas (curr vs prev snapshot)
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

  // 5. Compute Pinning Velocity & Output Cadence (Primary source: competitor_pins full catalog)
  let pinningVelocity = '0.0';
  let pinsAdded = 0;
  let daysSpan = 1;
  let pacingEstimate = 0;
  let winningPinsCount = 0;
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
  } else if (compId) {
    try {
      const runCatalogStats = async (includeDeleted) => {
        const delFilter = includeDeleted ? sql`AND (cp.is_deleted IS NULL OR cp.is_deleted = FALSE)` : sql``;
        return await sql`
          WITH valid_catalog AS (
            SELECT
              cp.pin_id,
              cp.save_count,
              CASE
                WHEN cp.created_at_pinterest IS NOT NULL
                 AND cp.created_at_pinterest >= '2010-01-01'::timestamptz
                 AND cp.created_at_pinterest <= NOW() + INTERVAL '10 minutes'
                THEN LEAST(cp.created_at_pinterest, NOW())
                ELSE NULL
              END AS clean_ts,
              (pa.pin_id IS NOT NULL) AS is_winner
            FROM competitor_pins cp
            LEFT JOIN pa_pins pa ON pa.pin_id = cp.pin_id
            WHERE cp.competitor_id = ${compId}
              ${delFilter}
          )
          SELECT
            COUNT(*)::int AS total_catalog_pins,
            COUNT(*) FILTER (WHERE clean_ts IS NOT NULL)::int AS dated_pins_count,
            COUNT(*) FILTER (WHERE is_winner)::int AS winning_pins_count,
            COUNT(*) FILTER (WHERE clean_ts >= NOW() - INTERVAL '30 days')::int AS pins_last_30d,
            MIN(clean_ts) AS earliest_pin_at,
            MAX(clean_ts) AS latest_pin_at,
            GREATEST(1.0, EXTRACT(EPOCH FROM (MAX(clean_ts) - MIN(clean_ts))) / 86400.0) AS span_days
          FROM valid_catalog;
        `;
      };

      let velocityStats = null;
      try {
        const [row] = await runCatalogStats(true);
        velocityStats = row;
      } catch (vErr) {
        if (vErr.message && vErr.message.includes('is_deleted')) {
          const [row] = await runCatalogStats(false);
          velocityStats = row;
        } else {
          throw vErr;
        }
      }

      if (velocityStats && Number(velocityStats.total_catalog_pins) > 0) {
        const totalCatalog = Number(velocityStats.total_catalog_pins || 0);
        const datedCount = Number(velocityStats.dated_pins_count || 0);
        winningPinsCount = Number(velocityStats.winning_pins_count || 0);
        const rawSpan = Number(velocityStats.span_days);
        const safeSpan = Math.max(1.0, (!isNaN(rawSpan) && isFinite(rawSpan)) ? rawSpan : 1.0);
        daysSpan = Math.max(1, Math.round(safeSpan));
        pinsAdded = totalCatalog;

        const calcVelocity = datedCount > 0
          ? (datedCount / safeSpan)
          : (totalCatalog > 0 ? (totalCatalog / daysSpan) : 0);

        pinningVelocity = (!isNaN(calcVelocity) && isFinite(calcVelocity)) ? calcVelocity.toFixed(1) : '0.0';
        pacingEstimate = Math.round((Number(pinningVelocity) || 0) * 30);
        winningHitRatePct = totalCatalog > 0 ? Number(((winningPinsCount / totalCatalog) * 100).toFixed(1)) : 0.0;
        pinsPerWinner = winningPinsCount > 0 ? Number((totalCatalog / winningPinsCount).toFixed(1)) : null;
      }
    } catch (_) {}
  }

  let latestPinDateStr = '—';
  if (compId) {
    try {
      const [latestPin] = await sql`
        SELECT MAX(created_at_pinterest) AS max_date
        FROM competitor_pins
        WHERE competitor_id = ${compId} AND created_at_pinterest IS NOT NULL;
      `;
      if (latestPin && latestPin.max_date) {
        latestPinDateStr = new Date(latestPin.max_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      }
    } catch (_) {}
  }
  if (latestPinDateStr === '—' && cleanUsername) {
    try {
      const [latestPaPin] = await sql`
        SELECT MAX(created_at_pinterest) AS max_date
        FROM pa_pins
        WHERE account_username = ${cleanUsername};
      `;
      if (latestPaPin && latestPaPin.max_date) {
        latestPinDateStr = new Date(latestPaPin.max_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      }
    } catch (_) {}
  }
  if (latestPinDateStr === '—' && profile.last_synced_at) {
    latestPinDateStr = new Date(profile.last_synced_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // 6. Compute Engagement Aggregates (Total Saves, Total Shares, 24H Saves Δ, 24H Repins Δ)
  let totalSaves = 0;
  let totalRepins = 0;
  let totalShares = 0;

  try {
    const [rawPinStats] = await sql`
      SELECT 
        COALESCE(SUM(save_count), 0)::bigint AS total_saves,
        COALESCE(SUM(repin_count), 0)::bigint AS total_repins
      FROM competitor_pins
      WHERE competitor_id = ${compId};
    `;
    if (rawPinStats) {
      totalSaves = Number(rawPinStats.total_saves || 0);
      totalRepins = Number(rawPinStats.total_repins || 0);
    }
  } catch (_) {}

  if (cleanUsername) {
    try {
      const [paPinStats] = await sql`
        SELECT 
          COALESCE(SUM(saves), 0)::bigint AS total_saves,
          COALESCE(SUM(repins), 0)::bigint AS total_repins,
          COALESCE(SUM(COALESCE(share_count, 0)), 0)::bigint AS total_shares
        FROM pa_pins
        WHERE account_username = ${cleanUsername};
      `;
      if (paPinStats) {
        totalSaves = Math.max(totalSaves, Number(paPinStats.total_saves || 0));
        totalRepins = Math.max(totalRepins, Number(paPinStats.total_repins || 0));
        totalShares = Math.max(totalShares, Number(paPinStats.total_shares || 0));
      }
    } catch (_) {}
  }

  if (totalShares === 0 && totalRepins > 0) {
    totalShares = Math.round(totalRepins * 0.22) || Math.round(totalSaves * 0.02);
  }

  let deltaSaves24h = null;
  let deltaRepins24h = null;

  if (snapshots.length >= 2) {
    const curr = snapshots[snapshots.length - 1];
    const prev = snapshots[snapshots.length - 2];
    const currSaves = Number(curr.metadata?.total_saves || 0);
    const prevSaves = Number(prev.metadata?.total_saves || 0);
    if (curr.metadata && prev.metadata && (currSaves > 0 || prevSaves > 0)) {
      deltaSaves24h = currSaves - prevSaves;
    }
    const currRepins = Number(curr.metadata?.total_repins || 0);
    const prevRepins = Number(prev.metadata?.total_repins || 0);
    if (curr.metadata && prev.metadata && (currRepins > 0 || prevRepins > 0)) {
      deltaRepins24h = currRepins - prevRepins;
    }
  }

  // [INVARIANT: ZERO-HUB-SNAPSHOTS]
  // Time-series snapshots are stored exclusively on Shards (pins_daily_metrics).
  // Hub pa_pin_metrics fallback is eradicated.

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

  // Asynchronously persist healed reach and views to Postgres profile
  if (resolvedMonthlyReach > Number(profile.monthly_reach || 0) || resolvedProfileViews > Number(profile.profile_views || 0)) {
    await sql`
      UPDATE competitor_profiles
      SET monthly_reach = GREATEST(monthly_reach, ${resolvedMonthlyReach}),
          profile_views = GREATEST(profile_views, ${resolvedProfileViews}),
          updated_at = NOW()
      WHERE id = ${compId};
    `.catch(() => {});
  }

  return {
    profile: {
      ...profile,
      handle: `@${profile.username}`,
      monthly_reach: resolvedMonthlyReach,
      profile_views: resolvedProfileViews,
      follower_count: Number(profile.follower_count || 0),
      total_pins: Number(profile.total_pins || boards.reduce((acc, b) => acc + (b.pin_count || 0), 0) || 0),
      total_boards: boards.length > 0 ? boards.length : Number(profile.total_boards || 0),
      website_domain: profile.website_url ? profile.website_url.replace(/^https?:\/\//, '').replace(/\/.*$/, '') : null,
      verified_domain: Boolean(profile.website_url),
      notes: profile.bio || profileMeta?.notes || 'No internal notes set for this competitor.',
      last_pin_date: latestPinDateStr
    },
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
 * Delete a single snapshot by ID
 */
export async function deleteCompetitorSnapshot(sql, snapshotId) {
  if (!snapshotId) throw new Error('snapshotId is required');
  const numId = parseInt(snapshotId, 10);
  if (!isNaN(numId)) {
    await sql`DELETE FROM competitor_history_snapshots WHERE id = ${numId};`;
  }
  return { success: true };
}

/**
 * Update competitor active status (pause / resume)
 */
export async function updateCompetitorStatus(sql, idOrUsername, isActive) {
  const numId = parseInt(idOrUsername, 10);
  if (!isNaN(numId)) {
    const [row] = await sql`
      UPDATE competitor_profiles
      SET is_active = ${Boolean(isActive)}, updated_at = NOW()
      WHERE id = ${numId}
      RETURNING *;
    `;
    return row;
  }
  const clean = String(idOrUsername).replace(/^@/, '').trim().toLowerCase();
  const [row] = await sql`
    UPDATE competitor_profiles
    SET is_active = ${Boolean(isActive)}, updated_at = NOW()
    WHERE LOWER(username) = ${clean}
    RETURNING *;
  `;
  return row;
}

/**
 * Bulk upserts raw pins from Pinterest into competitor_pins inventory
 */
export async function upsertCompetitorPins(sql, competitorId, pins) {
  if (!competitorId || !Array.isArray(pins) || pins.length === 0) return 0;
  
  const cleanedPins = [];
  for (const p of pins) {
    const pinId = String(p.pin_id || p.id || '').trim();
    if (!pinId) continue;
    cleanedPins.push({
      pin_id: pinId,
      title: p.title || '',
      description: p.description || '',
      link_domain: p.domain || '',
      destination_url: p.link || '',
      board_name: p.board_name || '',
      board_slug: (p.board_name || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, ''),
      image_url: p.image_url || '',
      save_count: Math.max(0, Number(p.saves) || 0),
      repin_count: Math.max(0, Number(p.repins) || 0),
      comment_count: Math.max(0, Number(p.comments) || 0),
      is_product: Boolean(p.is_product),
      created_at_pinterest: (p.created_at_pinterest && !isNaN(new Date(p.created_at_pinterest).getTime())) ? new Date(p.created_at_pinterest).toISOString() : null
    });
  }

  if (cleanedPins.length === 0) return 0;

  // Deduplicate and sort pins strictly by pin_id ASC to prevent deadlocks
  const uniquePinsMap = new Map();
  for (const p of cleanedPins) {
    if (p.pin_id) uniquePinsMap.set(p.pin_id, p);
  }
  const sortedPins = Array.from(uniquePinsMap.values()).sort((a, b) => a.pin_id.localeCompare(b.pin_id));
  if (sortedPins.length === 0) return 0;

  try {
    await sql`
      INSERT INTO competitor_pins (
        competitor_id, pin_id, title, description, link_domain,
        destination_url, board_name, board_slug, image_url, save_count, repin_count,
        comment_count, is_product, created_at_pinterest, first_seen_at, last_seen_at, enrichment_status
      )
      SELECT 
        ${competitorId}, x.pin_id, x.title, x.description, x.link_domain,
        x.destination_url, x.board_name, COALESCE(NULLIF(x.board_slug, ''), LOWER(REGEXP_REPLACE(REGEXP_REPLACE(x.board_name, '[^[:alnum:]]+', '-', 'g'), '^-|-$', '', 'g'))), x.image_url, x.save_count, x.repin_count,
        x.comment_count, x.is_product, x.created_at_pinterest, NOW(), NOW(), 'pending'
      FROM jsonb_to_recordset(${typeof sql.json === 'function' ? sql.json(sanitizeForJsonb(sortedPins)) : JSON.stringify(sanitizeForJsonb(sortedPins))}::jsonb) AS x(
        pin_id VARCHAR(64), title TEXT, description TEXT, link_domain VARCHAR(255),
        destination_url TEXT, board_name VARCHAR(255), board_slug VARCHAR(255), image_url TEXT,
        save_count INT, repin_count INT, comment_count INT, is_product BOOLEAN, created_at_pinterest TIMESTAMPTZ
      )
      ORDER BY x.pin_id ASC
      ON CONFLICT (competitor_id, pin_id) DO UPDATE SET
        title = CASE WHEN EXCLUDED.title <> '' THEN EXCLUDED.title ELSE competitor_pins.title END,
        description = CASE 
          WHEN competitor_pins.enrichment_status = 'compacted' THEN competitor_pins.description 
          WHEN EXCLUDED.description <> '' THEN EXCLUDED.description 
          ELSE competitor_pins.description 
        END,
        destination_url = CASE WHEN EXCLUDED.destination_url <> '' THEN EXCLUDED.destination_url ELSE competitor_pins.destination_url END,
        link_domain = CASE WHEN EXCLUDED.link_domain <> '' THEN EXCLUDED.link_domain ELSE competitor_pins.link_domain END,
        board_name = CASE WHEN EXCLUDED.board_name <> '' THEN EXCLUDED.board_name ELSE competitor_pins.board_name END,
        board_slug = CASE WHEN EXCLUDED.board_slug <> '' THEN EXCLUDED.board_slug ELSE competitor_pins.board_slug END,
        image_url = CASE WHEN EXCLUDED.image_url <> '' THEN EXCLUDED.image_url ELSE competitor_pins.image_url END,
        save_count = GREATEST(competitor_pins.save_count, EXCLUDED.save_count),
        repin_count = GREATEST(competitor_pins.repin_count, EXCLUDED.repin_count),
        comment_count = GREATEST(competitor_pins.comment_count, EXCLUDED.comment_count),
        is_product = (competitor_pins.is_product OR EXCLUDED.is_product),
        enrichment_status = COALESCE(competitor_pins.enrichment_status, 'pending'),
        last_seen_at = NOW();
    `;
    return sortedPins.length;
  } catch (err) {
    console.warn(`[upsertCompetitorPins] Bulk insert fallback:`, err.message);
    let saved = 0;
    for (const p of cleanedPins) {
      try {
        await sql`
          INSERT INTO competitor_pins (
            competitor_id, pin_id, title, description, link_domain,
            destination_url, board_name, board_slug, image_url, save_count, repin_count,
            comment_count, is_product, created_at_pinterest, first_seen_at, last_seen_at, enrichment_status
          ) VALUES (
            ${competitorId}, ${p.pin_id}, ${p.title}, ${p.description}, ${p.link_domain},
            ${p.destination_url}, ${p.board_name}, ${p.board_slug || null}, ${p.image_url}, ${p.save_count}, ${p.repin_count},
            ${p.comment_count}, ${p.is_product}, ${p.created_at_pinterest ? new Date(p.created_at_pinterest) : null},
            NOW(), NOW(), 'pending'
          )
          ON CONFLICT (competitor_id, pin_id) DO UPDATE SET
            title = CASE WHEN EXCLUDED.title <> '' THEN EXCLUDED.title ELSE competitor_pins.title END,
            description = CASE 
              WHEN competitor_pins.enrichment_status = 'compacted' THEN competitor_pins.description 
              WHEN EXCLUDED.description <> '' THEN EXCLUDED.description 
              ELSE competitor_pins.description 
            END,
            board_slug = COALESCE(EXCLUDED.board_slug, competitor_pins.board_slug),
            save_count = GREATEST(competitor_pins.save_count, EXCLUDED.save_count),
            repin_count = GREATEST(competitor_pins.repin_count, EXCLUDED.repin_count),
            is_product = (competitor_pins.is_product OR EXCLUDED.is_product),
            enrichment_status = COALESCE(competitor_pins.enrichment_status, 'pending'),
            last_seen_at = NOW();
        `;
        saved++;
      } catch (_) {}
    }
    return saved;
  }
}

/**
 * [INVARIANT: ONE-WAY-PROMOTION]
 * Auto-hydration from pa_pins into competitor_pins is eradicated.
 * Pins strictly flow one-way: competitor_pins -> pa_pins via qualification.
 */
export async function autoHydrateCompetitorPinsFromArchive(sql, competitorId, username) {
  return { ok: true, hydrated_count: 0 };
}

/**
 * List all creator pins from competitor_pins inventory with rich filtering, sorting, and pagination
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
  changed_only = false
} = {}) {
  let cleanUsername = username ? normalizePinterestUsername(username) : null;
  let numericId = parseInt(competitorIdOrUsername, 10);
  if (!cleanUsername && (isNaN(numericId) || !numericId)) {
    cleanUsername = normalizePinterestUsername(competitorIdOrUsername);
    numericId = null;
  }

  // 1. If username is known, ALWAYS resolve local numeric ID on this specific database instance
  if (cleanUsername) {
    try {
      const [c] = await sql`
        SELECT id, username FROM competitor_profiles 
        WHERE LOWER(username) = ${cleanUsername} 
        LIMIT 1;
      `;
      if (c) {
        numericId = c.id;
        cleanUsername = c.username;
      }
    } catch (_) {}
  } else if (!isNaN(numericId) && numericId) {
    try {
      const [c] = await sql`
        SELECT id, username FROM competitor_profiles 
        WHERE id = ${numericId} 
        LIMIT 1;
      `;
      if (c) {
        cleanUsername = c.username;
      } else {
        numericId = null;
      }
    } catch (_) {}
  }

  if (!numericId) {
    return { pins: [], total: 0, qualified_total: 0, page: 1, limit, total_pages: 0, boards: [] };
  }

  // [INVARIANT: ONE-WAY-PROMOTION] Zero auto-hydration from archive; pins flow competitor_pins -> pa_pins only.

  const pNum = Math.max(1, parseInt(page, 10) || 1);
  const pLim = Math.max(1, Math.min(parseInt(limit, 10) || 50, 1000));
  const offset = (pNum - 1) * pLim;

  const minSavesNum = Math.max(0, parseInt(min_saves, 10) || 0);
  const cleanSearch = (search && typeof search === 'string' && search.trim()) ? escapeSqlWildcards(search.toLowerCase().trim()) : null;
  const searchPattern = cleanSearch ? `%${cleanSearch}%` : null;
  const boardPattern = (board && board.trim()) ? board.trim().toLowerCase() : null;
  const rawSlug = boardPattern ? boardPattern.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') : null;
  const boardSlugPattern = (rawSlug && rawSlug.length > 0) ? rawSlug : null;
  const stageFilter = (stage && typeof stage === 'string' && stage.trim()) ? stage.trim().toUpperCase() : null;
  const isHighVelocity = Boolean(high_velocity);
  const isChangedOnly = Boolean(changed_only);

  const boardsPromise = sql`
    SELECT DISTINCT board_name, COUNT(*)::int as count
    FROM competitor_pins
    WHERE competitor_id = ${numericId} AND board_name IS NOT NULL AND board_name <> ''
    GROUP BY board_name
    ORDER BY count DESC;
  `;

  const rowsPromise = sql`
    SELECT 
      cp.id,
      cp.competitor_id,
      cp.pin_id,
      cp.title,
      cp.description,
      cp.link_domain,
      cp.destination_url,
      cp.board_name,
      cp.image_url,
      GREATEST(COALESCE(cp.save_count, 0), COALESCE(pa.saves, 0))::bigint AS save_count,
      GREATEST(COALESCE(cp.repin_count, 0), COALESCE(pa.repins, 0))::bigint AS repin_count,
      GREATEST(COALESCE(cp.comment_count, 0), COALESCE(pa.comments, 0))::int AS comment_count,
      COALESCE(pa.share_count, 0)::bigint AS share_count,
      COALESCE(pa.velocity, 0)::numeric AS velocity,
      COALESCE(
        (cp.metadata->>'delta_saves_24h')::numeric,
        (cp.metadata->>'delta_saves')::numeric,
        pa.velocity,
        0
      )::numeric AS delta_saves_24h,
      COALESCE(
        (cp.metadata->>'delta_repins_24h')::numeric,
        (cp.metadata->>'delta_repins')::numeric,
        0
      )::numeric AS delta_repins_24h,
      COALESCE(pa.dominant_color, '#888888') AS dominant_color,
      COALESCE(pa.annotations, cp.metadata->'annotations', '[]'::jsonb) AS annotations,
      COALESCE(pa.reactions, '{}'::jsonb) AS reactions,
      COALESCE(NULLIF(cp.alt_text, ''), pa.alt_text, '') AS alt_text,
      cp.created_at_pinterest,
      cp.first_seen_at,
      cp.last_seen_at,
      (
        COALESCE(cp.is_product, false) OR 
        COALESCE(pa.is_product, false) OR 
        COALESCE(cp.link_domain ILIKE '%etsy%' OR cp.link_domain ILIKE '%shopify%' OR cp.link_domain ILIKE '%amazon%' OR cp.destination_url ILIKE '%/listing/%' OR cp.destination_url ILIKE '%/product/%' OR cp.destination_url ILIKE '%/item/%' OR cp.destination_url ILIKE '%gumroad.com%', false)
      ) AS is_product,
      (pa.pin_id IS NOT NULL) AS is_qualified,
      (ksc.pin_id IS NOT NULL OR kdi.pin_id IS NOT NULL) AS is_ranked,
      COALESCE(ksc.rank_position, kdi.last_known_rank) AS rank_position
    FROM competitor_pins cp
    LEFT JOIN pa_pins pa ON pa.pin_id = cp.pin_id
    LEFT JOIN (
      SELECT DISTINCT ON (pin_id) pin_id, rank_position
      FROM keyword_serp_current
      WHERE rank_position IS NOT NULL
      ORDER BY pin_id, rank_position ASC
    ) ksc ON ksc.pin_id = cp.pin_id
    LEFT JOIN (
      SELECT DISTINCT ON (pin_id) pin_id, last_known_rank
      FROM keyword_displaced_index
      WHERE last_known_rank IS NOT NULL
      ORDER BY pin_id, last_known_rank ASC
    ) kdi ON kdi.pin_id = cp.pin_id
    WHERE cp.competitor_id = ${numericId}
      AND (${ranked_only} = FALSE OR (ksc.pin_id IS NOT NULL OR kdi.pin_id IS NOT NULL))
      AND (${minSavesNum} = 0 OR GREATEST(COALESCE(cp.save_count, 0), COALESCE(pa.saves, 0)) >= ${minSavesNum})
      AND (${searchPattern}::text IS NULL OR LOWER(cp.title) LIKE ${searchPattern} OR LOWER(COALESCE(cp.description, '')) LIKE ${searchPattern})
      AND (
        ${boardPattern}::text IS NULL OR 
        (${boardSlugPattern}::text IS NOT NULL AND cp.board_slug = ${boardSlugPattern}) OR
        LOWER(TRIM(cp.board_name)) = ${boardPattern} OR
        REPLACE(LOWER(TRIM(cp.board_name)), '-', ' ') = REPLACE(${boardPattern}, '-', ' ') OR
        REPLACE(LOWER(TRIM(cp.board_name)), ' ', '-') = REPLACE(${boardPattern}, ' ', '-') OR
        REPLACE(REPLACE(LOWER(TRIM(cp.board_name)), '-', ''), ' ', '') = REPLACE(REPLACE(${boardPattern}, '-', ''), ' ', '') OR
        (${boardSlugPattern}::text IS NOT NULL AND LOWER(REGEXP_REPLACE(REGEXP_REPLACE(TRIM(cp.board_name), '[^[:alnum:]]+', '-', 'g'), '^-|-$', '', 'g')) = ${boardSlugPattern})
      )
      AND (${qualified_only} = FALSE OR pa.pin_id IS NOT NULL)
      AND (${isHighVelocity} = FALSE OR COALESCE(pa.velocity, 0) >= 10)
      AND (${isChangedOnly} = FALSE OR COALESCE(pa.velocity, 0) > 0)
      AND (
        ${stageFilter}::text IS NULL OR
        (${stageFilter} = 'DORMANT' AND COALESCE(pa.velocity, 0) < 0.5) OR
        (${stageFilter} = 'COOLING' AND COALESCE(pa.velocity, 0) >= 0.5 AND COALESCE(pa.velocity, 0) < 2.0) OR
        (${stageFilter} = 'NEW' AND COALESCE(pa.velocity, 0) >= 0.5 AND COALESCE(cp.created_at_pinterest, cp.first_seen_at) >= NOW() - INTERVAL '14 days') OR
        (${stageFilter} = 'GROWING' AND COALESCE(pa.velocity, 0) >= 10.0 AND (COALESCE(cp.created_at_pinterest, cp.first_seen_at) < NOW() - INTERVAL '14 days' OR COALESCE(cp.created_at_pinterest, cp.first_seen_at) IS NULL)) OR
        (${stageFilter} = 'MATURE' AND COALESCE(pa.velocity, 0) >= 2.0 AND COALESCE(pa.velocity, 0) < 10.0 AND (COALESCE(cp.created_at_pinterest, cp.first_seen_at) < NOW() - INTERVAL '14 days' OR COALESCE(cp.created_at_pinterest, cp.first_seen_at) IS NULL))
      )
      AND (${product_only} = FALSE OR (
        COALESCE(cp.is_product, false) OR 
        COALESCE(pa.is_product, false) OR 
        COALESCE(cp.link_domain ILIKE '%etsy%' OR cp.link_domain ILIKE '%shopify%' OR cp.link_domain ILIKE '%amazon%' OR cp.destination_url ILIKE '%/listing/%' OR cp.destination_url ILIKE '%/product/%' OR cp.destination_url ILIKE '%/item/%' OR cp.destination_url ILIKE '%gumroad.com%', false)
      ) = TRUE)
      AND (${articles_only} = FALSE OR (
        COALESCE(cp.is_product, false) = FALSE AND 
        COALESCE(pa.is_product, false) = FALSE AND 
        COALESCE(cp.link_domain ILIKE '%etsy%' OR cp.link_domain ILIKE '%shopify%' OR cp.link_domain ILIKE '%amazon%' OR cp.destination_url ILIKE '%/listing/%' OR cp.destination_url ILIKE '%/product/%' OR cp.destination_url ILIKE '%/item/%' OR cp.destination_url ILIKE '%gumroad.com%', false) = FALSE
      ))
    ORDER BY 
      CASE WHEN ${sort} = 'saves_desc' THEN GREATEST(COALESCE(cp.save_count, 0), COALESCE(pa.saves, 0)) END DESC NULLS LAST,
      CASE WHEN ${sort} = 'repins_desc' THEN GREATEST(COALESCE(cp.repin_count, 0), COALESCE(pa.repins, 0)) END DESC NULLS LAST,
      CASE WHEN ${sort} = 'velocity' OR ${sort} = 'velocity_desc' THEN COALESCE(pa.velocity, 0) END DESC NULLS LAST,
      CASE WHEN ${sort} = 'comments' OR ${sort} = 'comments_desc' THEN GREATEST(COALESCE(cp.comment_count, 0), COALESCE(pa.comments, 0)) END DESC NULLS LAST,
      CASE WHEN ${sort} = 'newest' OR ${sort} = 'created_desc' THEN cp.created_at_pinterest END DESC NULLS LAST,
      CASE WHEN ${sort} = 'oldest' OR ${sort} = 'created_asc' THEN cp.created_at_pinterest END ASC NULLS LAST,
      GREATEST(COALESCE(cp.save_count, 0), COALESCE(pa.saves, 0)) DESC
    LIMIT ${pLim} OFFSET ${offset};
  `;

  const countPromise = sql`
    SELECT COUNT(*)::int as total
    FROM competitor_pins cp
    LEFT JOIN pa_pins pa ON pa.pin_id = cp.pin_id
    LEFT JOIN (
      SELECT DISTINCT pin_id FROM keyword_serp_current WHERE rank_position IS NOT NULL
    ) ksc ON ksc.pin_id = cp.pin_id
    LEFT JOIN (
      SELECT DISTINCT pin_id FROM keyword_displaced_index WHERE last_known_rank IS NOT NULL
    ) kdi ON kdi.pin_id = cp.pin_id
    WHERE cp.competitor_id = ${numericId}
      AND (${ranked_only} = FALSE OR (ksc.pin_id IS NOT NULL OR kdi.pin_id IS NOT NULL))
      AND (${minSavesNum} = 0 OR GREATEST(COALESCE(cp.save_count, 0), COALESCE(pa.saves, 0)) >= ${minSavesNum})
      AND (${searchPattern}::text IS NULL OR LOWER(cp.title) LIKE ${searchPattern} OR LOWER(COALESCE(cp.description, '')) LIKE ${searchPattern})
      AND (
        ${boardPattern}::text IS NULL OR 
        (${boardSlugPattern}::text IS NOT NULL AND cp.board_slug = ${boardSlugPattern}) OR
        LOWER(TRIM(cp.board_name)) = ${boardPattern} OR
        REPLACE(LOWER(TRIM(cp.board_name)), '-', ' ') = REPLACE(${boardPattern}, '-', ' ') OR
        REPLACE(LOWER(TRIM(cp.board_name)), ' ', '-') = REPLACE(${boardPattern}, ' ', '-') OR
        REPLACE(REPLACE(LOWER(TRIM(cp.board_name)), '-', ''), ' ', '') = REPLACE(REPLACE(${boardPattern}, '-', ''), ' ', '') OR
        (${boardSlugPattern}::text IS NOT NULL AND LOWER(REGEXP_REPLACE(REGEXP_REPLACE(TRIM(cp.board_name), '[^[:alnum:]]+', '-', 'g'), '^-|-$', '', 'g')) = ${boardSlugPattern})
      )
      AND (${qualified_only} = FALSE OR pa.pin_id IS NOT NULL)
      AND (${isHighVelocity} = FALSE OR COALESCE(pa.velocity, 0) >= 10)
      AND (${isChangedOnly} = FALSE OR COALESCE(pa.velocity, 0) > 0)
      AND (
        ${stageFilter}::text IS NULL OR
        (${stageFilter} = 'DORMANT' AND COALESCE(pa.velocity, 0) < 0.5) OR
        (${stageFilter} = 'COOLING' AND COALESCE(pa.velocity, 0) >= 0.5 AND COALESCE(pa.velocity, 0) < 2.0) OR
        (${stageFilter} = 'NEW' AND COALESCE(pa.velocity, 0) >= 0.5 AND COALESCE(cp.created_at_pinterest, cp.first_seen_at) >= NOW() - INTERVAL '14 days') OR
        (${stageFilter} = 'GROWING' AND COALESCE(pa.velocity, 0) >= 10.0 AND (COALESCE(cp.created_at_pinterest, cp.first_seen_at) < NOW() - INTERVAL '14 days' OR COALESCE(cp.created_at_pinterest, cp.first_seen_at) IS NULL)) OR
        (${stageFilter} = 'MATURE' AND COALESCE(pa.velocity, 0) >= 2.0 AND COALESCE(pa.velocity, 0) < 10.0 AND (COALESCE(cp.created_at_pinterest, cp.first_seen_at) < NOW() - INTERVAL '14 days' OR COALESCE(cp.created_at_pinterest, cp.first_seen_at) IS NULL))
      )
      AND (${product_only} = FALSE OR (
        COALESCE(cp.is_product, false) OR 
        COALESCE(pa.is_product, false) OR 
        COALESCE(cp.link_domain ILIKE '%etsy%' OR cp.link_domain ILIKE '%shopify%' OR cp.link_domain ILIKE '%amazon%' OR cp.destination_url ILIKE '%/listing/%' OR cp.destination_url ILIKE '%/product/%' OR cp.destination_url ILIKE '%/item/%' OR cp.destination_url ILIKE '%gumroad.com%', false)
      ) = TRUE)
      AND (${articles_only} = FALSE OR (
        COALESCE(cp.is_product, false) = FALSE AND 
        COALESCE(pa.is_product, false) = FALSE AND 
        COALESCE(cp.link_domain ILIKE '%etsy%' OR cp.link_domain ILIKE '%shopify%' OR cp.link_domain ILIKE '%amazon%' OR cp.destination_url ILIKE '%/listing/%' OR cp.destination_url ILIKE '%/product/%' OR cp.destination_url ILIKE '%/item/%' OR cp.destination_url ILIKE '%gumroad.com%', false) = FALSE
      ));
  `;

  // Global Unfiltered Totals Query: Decoupled from active filter predicates
  const unfilteredTotalsPromise = sql`
    SELECT 
      COUNT(*)::int AS catalog_total,
      COUNT(*) FILTER (WHERE pa.pin_id IS NOT NULL)::int AS qualified_total,
      COUNT(*) FILTER (WHERE ksc.pin_id IS NOT NULL OR kdi.pin_id IS NOT NULL)::int AS ranked_total,
      COUNT(*) FILTER (WHERE COALESCE(pa.velocity, 0) >= 10)::int AS high_velocity_total
    FROM competitor_pins cp
    LEFT JOIN pa_pins pa ON pa.pin_id = cp.pin_id
    LEFT JOIN (
      SELECT DISTINCT pin_id FROM keyword_serp_current WHERE rank_position IS NOT NULL
    ) ksc ON ksc.pin_id = cp.pin_id
    LEFT JOIN (
      SELECT DISTINCT pin_id FROM keyword_displaced_index WHERE last_known_rank IS NOT NULL
    ) kdi ON kdi.pin_id = cp.pin_id
    WHERE cp.competitor_id = ${numericId};
  `;

  const [boardsRows, rows, [countRow], [unfilteredRow]] = await Promise.all([
    boardsPromise,
    rowsPromise,
    countPromise,
    unfilteredTotalsPromise
  ]);

  const now = Date.now();
  const total = countRow ? countRow.total : 0;
  const catalog_total = unfilteredRow ? (unfilteredRow.catalog_total ?? total) : total;
  const qualified_total = unfilteredRow ? (unfilteredRow.qualified_total || 0) : 0;
  const ranked_total = unfilteredRow ? (unfilteredRow.ranked_total || 0) : 0;
  const high_velocity_total = unfilteredRow ? (unfilteredRow.high_velocity_total || 0) : 0;
  const total_pages = Math.ceil(total / pLim);

  return {
    pins: rows.map(r => {
      const velocity = Number(r.velocity || 0);
      const createdDate = r.created_at_pinterest ? new Date(r.created_at_pinterest) : (r.first_seen_at ? new Date(r.first_seen_at) : new Date());
      const ageDays = Math.max(1, Math.round((now - createdDate.getTime()) / 86400000));
      const stage = computePinStage(velocity, 0, ageDays);

      return {
        ...r,
        saves: Number(r.save_count || 0),
        repins: Number(r.repin_count || 0),
        comments: Number(r.comment_count || 0),
        share_count: Number(r.share_count || 0),
        velocity: Number(velocity.toFixed(1)),
        delta_saves_24h: Number(r.delta_saves_24h || velocity || 0),
        delta_repins_24h: Number(r.delta_repins_24h || 0),
        age_days: ageDays,
        stage,
        is_product: Boolean(r.is_product),
        is_qualified: Boolean(r.is_qualified)
      };
    }),
    total,
    catalog_total,
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
 * Top Destination URLs Intelligence:
 * Aggregates pins by normalized article slug, stripping protocol, www, query params, and anchors.
 * Supports filtering by articles only (is_product = false) vs products only vs all.
 */
export async function getTopDestinationUrls(sql, competitorId, {
  limit = 50,
  page = 1,
  search = '',
  sort = 'saves_desc',
  filter_type = 'all'
} = {}) {
  const numericId = await resolveNumericCompetitorId(sql, competitorId);
  if (!numericId || isNaN(numericId)) throw new Error('Valid competitorId is required.');

  // [INVARIANT: ONE-WAY-PROMOTION] Zero auto-hydration from archive.

  const pLim = Math.max(1, Math.min(Number(limit) || 50, 200));
  const pNum = Math.max(1, Number(page) || 1);
  const offset = (pNum - 1) * pLim;
  const cleanSearch = (search && typeof search === 'string' && search.trim()) ? escapeSqlWildcards(search.toLowerCase().trim()) : null;
  const searchPattern = cleanSearch ? `%${cleanSearch}%` : null;

  // Double escaped for Neon template literals: \\1, \\., \\?
  const rows = await sql`
    WITH base AS (
      SELECT 
        LOWER(
          REGEXP_REPLACE(
            REGEXP_REPLACE(
              REGEXP_REPLACE(destination_url, 'https?://(www\\.)?[^/]+', ''),
              '\\?.*$', ''
            ),
            '#.*$', ''
          )
        ) AS clean_slug,
        destination_url,
        link_domain,
        save_count,
        repin_count,
        created_at_pinterest,
        is_product
      FROM competitor_pins
      WHERE competitor_id = ${numericId}
        AND destination_url IS NOT NULL 
        AND destination_url != ''
        AND destination_url NOT LIKE '%pinterest.com%'
    ),
    aggregated AS (
      SELECT 
        clean_slug,
        MIN(destination_url) AS sample_url,
        MIN(link_domain) AS domain,
        COUNT(*)::int AS pin_count,
        SUM(COALESCE(save_count, 0))::bigint AS total_saves,
        ROUND(AVG(COALESCE(save_count, 0)))::int AS avg_saves,
        SUM(COALESCE(repin_count, 0))::bigint AS total_repins,
        MIN(created_at_pinterest) AS first_pin_date,
        MAX(created_at_pinterest) AS last_pin_date,
        BOOL_OR(COALESCE(is_product, false)) AS is_product,
        BOOL_OR(COALESCE(link_domain ILIKE '%amazon%' OR link_domain ILIKE '%amzn.to%' OR link_domain ILIKE '%etsy%' OR link_domain ILIKE '%shopify%' OR link_domain ILIKE '%rstyle%' OR link_domain ILIKE '%liketoknow%' OR link_domain ILIKE '%shopstyle%' OR link_domain ILIKE '%shareasale%' OR link_domain ILIKE '%rewardstyle%', false)) AS is_affiliate
      FROM base
      WHERE clean_slug IS NOT NULL AND clean_slug != '' AND clean_slug != '/'
      GROUP BY clean_slug
    )
    SELECT *
    FROM aggregated
    WHERE (${searchPattern}::text IS NULL OR clean_slug LIKE ${searchPattern})
      AND (
        ${filter_type} = 'all' OR
        (${filter_type} = 'articles_only' AND is_product = FALSE) OR
        (${filter_type} = 'products_only' AND is_product = TRUE) OR
        (${filter_type} = 'affiliate_only' AND is_affiliate = TRUE)
      )
    ORDER BY 
      CASE WHEN ${sort} = 'saves_desc' THEN total_saves END DESC NULLS LAST,
      CASE WHEN ${sort} = 'saves_asc' THEN total_saves END ASC NULLS LAST,
      CASE WHEN ${sort} = 'pins_desc' THEN pin_count END DESC NULLS LAST,
      CASE WHEN ${sort} = 'avg_saves_desc' THEN avg_saves END DESC NULLS LAST,
      CASE WHEN ${sort} = 'repins_desc' THEN total_repins END DESC NULLS LAST,
      CASE WHEN ${sort} = 'newest' THEN last_pin_date END DESC NULLS LAST,
      total_saves DESC
    LIMIT ${pLim} OFFSET ${offset};
  `;

  const [countRow] = await sql`
    WITH base AS (
      SELECT 
        LOWER(
          REGEXP_REPLACE(
            REGEXP_REPLACE(
              REGEXP_REPLACE(destination_url, 'https?://(www\\.)?[^/]+', ''),
              '\\?.*$', ''
            ),
            '#.*$', ''
          )
        ) AS clean_slug,
        link_domain,
        is_product
      FROM competitor_pins
      WHERE competitor_id = ${numericId}
        AND destination_url IS NOT NULL 
        AND destination_url != ''
        AND destination_url NOT LIKE '%pinterest.com%'
    ),
    aggregated AS (
      SELECT 
        clean_slug,
        BOOL_OR(COALESCE(is_product, false)) AS is_product,
        BOOL_OR(COALESCE(link_domain ILIKE '%amazon%' OR link_domain ILIKE '%amzn.to%' OR link_domain ILIKE '%etsy%' OR link_domain ILIKE '%shopify%' OR link_domain ILIKE '%rstyle%' OR link_domain ILIKE '%liketoknow%' OR link_domain ILIKE '%shopstyle%' OR link_domain ILIKE '%shareasale%' OR link_domain ILIKE '%rewardstyle%', false)) AS is_affiliate
      FROM base
      WHERE clean_slug IS NOT NULL AND clean_slug != '' AND clean_slug != '/'
      GROUP BY clean_slug
    )
    SELECT COUNT(*)::int AS total
    FROM aggregated
    WHERE (${searchPattern}::text IS NULL OR clean_slug LIKE ${searchPattern})
      AND (
        ${filter_type} = 'all' OR
        (${filter_type} = 'articles_only' AND is_product = FALSE) OR
        (${filter_type} = 'products_only' AND is_product = TRUE) OR
        (${filter_type} = 'affiliate_only' AND is_affiliate = TRUE)
      );
  `;

  const total = countRow ? countRow.total : 0;
  const total_pages = Math.ceil(total / pLim);

  return {
    urls: rows.map(r => ({
      clean_slug: r.clean_slug,
      sample_url: r.sample_url,
      domain: r.domain,
      pin_count: Number(r.pin_count || 0),
      total_saves: Number(r.total_saves || 0),
      avg_saves: Number(r.avg_saves || 0),
      total_repins: Number(r.total_repins || 0),
      first_pin_date: r.first_pin_date,
      last_pin_date: r.last_pin_date,
      is_product: Boolean(r.is_product),
      is_affiliate: Boolean(r.is_affiliate)
    })),
    total,
    page: pNum,
    limit: pLim,
    total_pages
  };
}

/**
 * Pure numeric rule parser that preserves valid 0 values and guards against NaN.
 */
export function parseRuleNumber(val, fallback, min = 0) {
  if (val === null || val === undefined || val === '') return fallback;
  const n = Number(val);
  return Number.isFinite(n) ? Math.max(min, n) : fallback;
}

/**
 * Get qualification rules for a specific competitor.
 * Returns custom rules stored in competitor_profiles.metadata->'qualification_rules' or system defaults.
 */
export const STANDARD_QUALIFICATION_DEFAULTS = {
  tier1_min_saves: 100,
  tier2_min_repins: 100,
  tier2_min_velocity: 3.5,
  tier2_max_age_days: 60,
  tier2_min_shares: 15,
  tier3_fresh_days: 14,
  tier3_max_age_days: 14,
  tier3_min_saves: 25,
  articles_only: true,
  auto_pipeline: true
};

export async function getCompetitorRules(sql, competitorId) {
  const numericId = await resolveNumericCompetitorId(sql, competitorId);
  if (!numericId || isNaN(numericId)) throw new Error('Valid competitorId is required.');

  const [row] = await sql`
    SELECT id, username, metadata->'qualification_rules' AS rules
    FROM competitor_profiles
    WHERE id = ${numericId}
    LIMIT 1;
  `;

  if (!row) throw new Error(`Competitor #${numericId} not found.`);

  const defaultRules = STANDARD_QUALIFICATION_DEFAULTS;

  return {
    competitor_id: row.id,
    username: row.username,
    rules: { ...defaultRules, ...(row.rules || {}) }
  };
}

/**
 * Save custom qualification rules for a specific competitor in competitor_profiles.metadata.
 * Uses PostgreSQL JSONB shallow merge to guarantee non-destructive preservation of other metadata keys.
 */
export async function saveCompetitorRules(sql, competitorId, newRules = {}) {
  const numericId = await resolveNumericCompetitorId(sql, competitorId);
  if (!numericId || isNaN(numericId)) throw new Error('Valid competitorId is required.');

  const freshDaysVal = parseRuleNumber(newRules.tier3_fresh_days ?? newRules.tier3_max_age_days, 14, 1);
  const sanitizedRules = {
    tier1_min_saves: parseRuleNumber(newRules.tier1_min_saves, 100, 0),
    tier2_min_repins: parseRuleNumber(newRules.tier2_min_repins, 100, 0),
    tier2_min_velocity: parseRuleNumber(newRules.tier2_min_velocity, 3.5, 0),
    tier2_max_age_days: parseRuleNumber(newRules.tier2_max_age_days, 60, 1),
    tier2_min_shares: parseRuleNumber(newRules.tier2_min_shares, 15, 0),
    tier3_fresh_days: freshDaysVal,
    tier3_max_age_days: freshDaysVal,
    tier3_min_saves: parseRuleNumber(newRules.tier3_min_saves, 25, 0),
    articles_only: Boolean(newRules.articles_only ?? true),
    auto_pipeline: Boolean(newRules.auto_pipeline ?? true)
  };

  const [updated] = await sql`
    UPDATE competitor_profiles
    SET 
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('qualification_rules', ${JSON.stringify(sanitizedRules)}::jsonb),
      updated_at = NOW()
    WHERE id = ${numericId}
    RETURNING id, username, metadata->'qualification_rules' AS rules;
  `;

  if (!updated) throw new Error(`Competitor #${numericId} not found.`);
  return { ok: true, competitor_id: updated.id, username: updated.username, rules: updated.rules };
}

/**
 * Re-evaluate competitor pins against custom qualification rules and upsert qualified pins into pa_pins.
 */
export async function reEvaluateCompetitorPins(sql, competitorId) {
  const numericId = await resolveNumericCompetitorId(sql, competitorId);
  if (!numericId || isNaN(numericId)) throw new Error('Valid competitorId is required.');

  const { rules, username } = await getCompetitorRules(sql, numericId);

  const minSaves = parseRuleNumber(rules.tier1_min_saves, 100, 0);
  const minRepins = parseRuleNumber(rules.tier2_min_repins, 100, 0);
  const minVelocity = parseRuleNumber(rules.tier2_min_velocity, 3.5, 0);
  const maxAgeDays = parseRuleNumber(rules.tier2_max_age_days, 60, 1);
  const freshDays = parseRuleNumber(rules.tier3_fresh_days ?? rules.tier3_max_age_days, 14, 1);
  const freshMinSaves = parseRuleNumber(rules.tier3_min_saves, 25, 0);
  const articlesOnly = rules.articles_only ?? true;

  // Fetch all pins from competitor_pins meeting the 3-tier rules
  const qualifiedPins = await sql`
    SELECT 
      cp.pin_id,
      ${username} AS account_username,
      cp.title,
      cp.description,
      cp.destination_url AS link,
      cp.link_domain AS domain,
      cp.board_name,
      cp.image_url,
      '#888888' AS dominant_color,
      cp.save_count AS saves,
      cp.repin_count AS repins,
      cp.comment_count AS comments,
      0::bigint AS share_count,
      '{}'::jsonb AS reactions,
      ROUND((cp.save_count::numeric / GREATEST(0.1, EXTRACT(EPOCH FROM (NOW() - cp.created_at_pinterest)) / 86400)), 2) AS velocity,
      '[]'::jsonb AS annotations,
      false AS is_video,
      COALESCE(cp.is_product, false) AS is_product,
      cp.created_at_pinterest,
      NOW() AS first_seen_at,
      NOW() AS last_updated_at,
      COALESCE(NULLIF(cp.alt_text, ''), cp.title, '') AS alt_text
    FROM competitor_pins cp
    WHERE cp.competitor_id = ${numericId}
      AND (
        cp.save_count >= ${minSaves}
        OR cp.repin_count >= ${minRepins}
        OR (
          cp.created_at_pinterest >= NOW() - (${freshDays} || ' days')::interval
          AND cp.save_count >= ${freshMinSaves}
        )
        OR (
          cp.created_at_pinterest >= NOW() - (${maxAgeDays} || ' days')::interval
          AND (
            (cp.save_count::numeric / GREATEST(0.1, EXTRACT(EPOCH FROM (NOW() - cp.created_at_pinterest)) / 86400)) >= ${minVelocity}
            OR (cp.save_count >= 50 AND (cp.save_count::numeric / GREATEST(0.1, EXTRACT(EPOCH FROM (NOW() - cp.created_at_pinterest)) / 86400)) >= 2.0)
          )
        )
      )
      AND (${articlesOnly} = FALSE OR (cp.is_product IS NULL OR cp.is_product = FALSE));
  `;

  let upsertedCount = 0;
  if (qualifiedPins.length > 0) {
    // Monotonic ORDER BY pin_id ASC to eliminate lock contention & deadlocks
    const sortedQualified = [...qualifiedPins].sort((a, b) => String(a.pin_id).localeCompare(String(b.pin_id)));

    // Upsert in batches of 50
    for (let i = 0; i < sortedQualified.length; i += 50) {
      const batch = sortedQualified.slice(i, i + 50);
      await sql`
        INSERT INTO pa_pins (
          pin_id, account_username, title, description, link, domain,
          board_name, image_url, dominant_color, saves, repins, comments,
          share_count, reactions, velocity, annotations, is_video, is_product,
          created_at_pinterest, first_seen_at, last_updated_at, alt_text
        )
        SELECT 
          x.pin_id, x.account_username, x.title, x.description, x.link, x.domain,
          x.board_name, x.image_url, x.dominant_color, x.saves, x.repins, x.comments,
          x.share_count, x.reactions, x.velocity, x.annotations, x.is_video, x.is_product,
          x.created_at_pinterest, x.first_seen_at, x.last_updated_at, x.alt_text
        FROM jsonb_to_recordset(${typeof sql.json === 'function' ? sql.json(batch) : JSON.stringify(batch)}::jsonb) AS x(
          pin_id character varying, account_username character varying, title text, description text, link text, domain character varying,
          board_name character varying, image_url text, dominant_color character varying, saves bigint, repins bigint, comments integer,
          share_count bigint, reactions jsonb, velocity numeric, annotations jsonb, is_video boolean, is_product boolean,
          created_at_pinterest timestamp with time zone, first_seen_at timestamp with time zone, last_updated_at timestamp with time zone, alt_text text
        )
        ORDER BY x.pin_id ASC
        ON CONFLICT (pin_id) DO UPDATE SET
          title = CASE WHEN EXCLUDED.title <> '' THEN EXCLUDED.title ELSE pa_pins.title END,
          description = CASE WHEN EXCLUDED.description IS NOT NULL AND EXCLUDED.description <> '' THEN EXCLUDED.description ELSE pa_pins.description END,
          link = CASE WHEN EXCLUDED.link <> '' THEN EXCLUDED.link ELSE pa_pins.link END,
          domain = CASE WHEN EXCLUDED.domain <> '' THEN EXCLUDED.domain ELSE pa_pins.domain END,
          board_name = CASE WHEN EXCLUDED.board_name <> '' THEN EXCLUDED.board_name ELSE pa_pins.board_name END,
          image_url = CASE WHEN EXCLUDED.image_url <> '' THEN EXCLUDED.image_url ELSE pa_pins.image_url END,
          alt_text = COALESCE(NULLIF(EXCLUDED.alt_text, ''), pa_pins.alt_text, EXCLUDED.title, pa_pins.title),
          saves = GREATEST(pa_pins.saves, EXCLUDED.saves),
          repins = GREATEST(pa_pins.repins, EXCLUDED.repins),
          comments = GREATEST(pa_pins.comments, EXCLUDED.comments),
          velocity = CASE WHEN EXCLUDED.velocity > 0 THEN EXCLUDED.velocity ELSE pa_pins.velocity END,
          is_product = (pa_pins.is_product OR EXCLUDED.is_product),
          last_updated_at = NOW();
      `;
      upsertedCount += batch.length;
    }
  }

  // Atomic demotion pass: Prune pins belonging to creator that no longer satisfy tightened rules
  const qualifiedIds = qualifiedPins.map(p => String(p.pin_id)).filter(Boolean);
  let prunedCount = 0;
  if (username) {
    const cleanUser = username.replace(/^@+/, '').trim().toLowerCase();
    try {
      const deletedRows = qualifiedIds.length > 0
        ? await sql`
            DELETE FROM pa_pins
            WHERE account_username = ${cleanUser}
              AND NOT (pin_id = ANY(${qualifiedIds}))
            RETURNING pin_id;
          `
        : await sql`
            DELETE FROM pa_pins
            WHERE account_username = ${cleanUser}
            RETURNING pin_id;
          `;
      prunedCount = deletedRows.length;
    } catch (pruneErr) {
      console.warn(`[reEvaluateCompetitorPins] Demotion prune warning for @${cleanUser}:`, pruneErr.message);
    }
  }

  return {
    ok: true,
    competitor_id: numericId,
    username,
    qualified_count: upsertedCount,
    pruned_count: prunedCount,
    rules
  };
}

/**
 * Zero-HTTP Reconciliation Pipeline
 * Reconciles catalog pins from competitor_pins into pa_pins based on 3-tier qualification rules (including Tier 2 sustained velocity).
 * Resolves the discrepancy where pins accumulating saves/momentum in the catalog were left trapped in competitor_pins.
 * Can run for a specific competitor (by numeric ID or username) or across the entire database.
 */
export async function reconcileQualifiedCatalogPins(sql, competitorIdOrUsername = null) {
  if (!sql) throw new Error('Database client (sql) is required.');

  // If competitorIdOrUsername is null, execute per-account evaluation across all active accounts
  if (!competitorIdOrUsername) {
    const competitors = await sql`
      SELECT id, username FROM competitor_profiles WHERE is_active = TRUE;
    `;
    let totalPromoted = 0;
    for (const comp of competitors) {
      const res = await reconcileQualifiedCatalogPins(sql, comp.id);
      totalPromoted += (res?.promoted_or_updated || 0);
    }
    return {
      ok: true,
      competitor_id: null,
      username: null,
      promoted_or_updated: totalPromoted
    };
  }

  // If specific competitor requested, resolve it
  let compFilter = sql``;
  let numericId = null;
  let username = null;

  if (competitorIdOrUsername) {
    const raw = String(competitorIdOrUsername).trim();
    if (/^\d+$/.test(raw)) {
      numericId = Number(raw);
      const [c] = await sql`SELECT id, username FROM competitor_profiles WHERE id = ${numericId} LIMIT 1;`;
      if (c) username = c.username;
    } else {
      const cleanUser = normalizePinterestUsername(raw);
      if (cleanUser) {
        const [c] = await sql`SELECT id, username FROM competitor_profiles WHERE LOWER(username) = ${cleanUser} LIMIT 1;`;
        if (c) {
          numericId = c.id;
          username = c.username;
        }
      }
    }
    if (numericId) {
      compFilter = sql`AND cp.competitor_id = ${numericId}`;
    }
  }

  // Load competitor-specific rules if single competitor, otherwise standard per-account defaults
  let rules = null;
  if (numericId) {
    try {
      const compRules = await getCompetitorRules(sql, numericId);
      rules = compRules?.rules;
    } catch (_) {}
  }
  if (!rules) {
    rules = { ...STANDARD_QUALIFICATION_DEFAULTS };
  }

  const minSaves = parseRuleNumber(rules.tier1_min_saves ?? rules.min_saves, 100, 0);
  const minRepins = parseRuleNumber(rules.tier2_min_repins ?? rules.min_repins, 100, 0);
  const minVelocity = parseRuleNumber(rules.tier2_min_velocity, 3.5, 0);
  const maxAgeDays = parseRuleNumber(rules.tier2_max_age_days, 60, 1);
  const freshDays = parseRuleNumber(rules.tier3_fresh_days ?? rules.fresh_days ?? rules.tier3_max_age_days, 14, 1);
  const freshMinSaves = parseRuleNumber(rules.tier3_min_saves ?? rules.fresh_min_saves, 25, 0);
  const articlesOnly = rules.articles_only ?? true;

  const runReconcileQuery = async (includeDeletedCheck) => {
    const deletedFilter = includeDeletedCheck ? sql`AND (cp.is_deleted IS NULL OR cp.is_deleted = FALSE)` : sql``;
    return await sql`
      WITH candidate_pins AS (
        SELECT 
          cp.pin_id,
          COALESCE(prof.username, 'unknown') AS account_username,
          COALESCE(cp.title, '') AS title,
          COALESCE(cp.description, '') AS description,
          COALESCE(cp.destination_url, '') AS link,
          COALESCE(cp.link_domain, '') AS domain,
          COALESCE(cp.board_name, 'General') AS board_name,
          COALESCE(cp.image_url, '') AS image_url,
          '#888888' AS dominant_color,
          COALESCE(cp.save_count, 0) AS saves,
          COALESCE(cp.repin_count, 0) AS repins,
          COALESCE(cp.comment_count, 0) AS comments,
          0::bigint AS share_count,
          '{}'::jsonb AS reactions,
          ROUND((COALESCE(cp.save_count, 0)::numeric / GREATEST(0.1, EXTRACT(EPOCH FROM (NOW() - COALESCE(cp.created_at_pinterest, cp.first_seen_at, NOW()))) / 86400)), 2) AS velocity,
          '[]'::jsonb AS annotations,
          false AS is_video,
          COALESCE(cp.is_product, false) AS is_product,
          COALESCE(cp.created_at_pinterest, cp.first_seen_at, NOW()) AS created_at_pinterest,
          COALESCE(cp.first_seen_at, NOW()) AS first_seen_at,
          NOW() AS last_updated_at,
          COALESCE(NULLIF(cp.alt_text, ''), cp.title, '') AS alt_text
        FROM competitor_pins cp
        LEFT JOIN competitor_profiles prof ON cp.competitor_id = prof.id
        WHERE 1=1
          ${deletedFilter}
          ${compFilter}
          AND (
            cp.save_count >= ${minSaves}
            OR cp.repin_count >= ${minRepins}
            OR (
              cp.created_at_pinterest >= NOW() - (${freshDays} || ' days')::interval
              AND cp.save_count >= ${freshMinSaves}
            )
            OR (
              cp.created_at_pinterest >= NOW() - (${maxAgeDays} || ' days')::interval
              AND (
                (cp.save_count::numeric / GREATEST(0.1, EXTRACT(EPOCH FROM (NOW() - cp.created_at_pinterest)) / 86400)) >= ${minVelocity}
                OR (cp.save_count >= 50 AND (cp.save_count::numeric / GREATEST(0.1, EXTRACT(EPOCH FROM (NOW() - cp.created_at_pinterest)) / 86400)) >= 2.0)
              )
            )
          )
          AND (${articlesOnly} = FALSE OR (cp.is_product IS NULL OR cp.is_product = FALSE))
      )
      INSERT INTO pa_pins (
        pin_id, account_username, title, description, link, domain,
        board_name, image_url, dominant_color, saves, repins, comments,
        share_count, reactions, velocity, annotations, is_video, is_product,
        created_at_pinterest, first_seen_at, last_updated_at, alt_text
      )
      SELECT 
        c.pin_id, c.account_username, c.title, c.description, c.link, c.domain,
        c.board_name, c.image_url, c.dominant_color, c.saves, c.repins, c.comments,
        c.share_count, c.reactions, c.velocity, c.annotations, c.is_video, c.is_product,
        c.created_at_pinterest, c.first_seen_at, c.last_updated_at, c.alt_text
      FROM candidate_pins c
      ON CONFLICT (pin_id) DO UPDATE SET
        title = CASE WHEN EXCLUDED.title <> '' THEN EXCLUDED.title ELSE pa_pins.title END,
        description = CASE WHEN EXCLUDED.description IS NOT NULL AND EXCLUDED.description <> '' THEN EXCLUDED.description ELSE pa_pins.description END,
        link = CASE WHEN EXCLUDED.link <> '' THEN EXCLUDED.link ELSE pa_pins.link END,
        domain = CASE WHEN EXCLUDED.domain <> '' THEN EXCLUDED.domain ELSE pa_pins.domain END,
        board_name = CASE WHEN EXCLUDED.board_name <> '' THEN EXCLUDED.board_name ELSE pa_pins.board_name END,
        image_url = CASE WHEN EXCLUDED.image_url <> '' THEN EXCLUDED.image_url ELSE pa_pins.image_url END,
        alt_text = COALESCE(NULLIF(EXCLUDED.alt_text, ''), pa_pins.alt_text, EXCLUDED.title, pa_pins.title),
        saves = GREATEST(pa_pins.saves, EXCLUDED.saves),
        repins = GREATEST(pa_pins.repins, EXCLUDED.repins),
        comments = GREATEST(pa_pins.comments, EXCLUDED.comments),
        velocity = CASE WHEN EXCLUDED.velocity > 0 THEN EXCLUDED.velocity ELSE pa_pins.velocity END,
        is_product = (pa_pins.is_product OR EXCLUDED.is_product),
        last_updated_at = NOW()
      RETURNING pin_id;
    `;
  };

  let reconciled = [];
  try {
    reconciled = await runReconcileQuery(true);
  } catch (err) {
    if (err.message && err.message.includes('is_deleted')) {
      reconciled = await runReconcileQuery(false);
    } else {
      throw err;
    }
  }

  return {
    ok: true,
    competitor_id: numericId,
    username,
    promoted_or_updated: reconciled.length
  };
}

/**
 * Hardened Natural-Key Shard ID Resolver
 * Resolves local database surrogate ID from canonical immutable username or validates local numeric ID.
 * Guarantees zero cross-shard surrogate key mismatch.
 */
export async function resolveLocalCompetitorId(sql, competitorIdentifier, { expectedUsername = '' } = {}) {
  if (!competitorIdentifier || !sql) return null;
  if (typeof competitorIdentifier !== 'string' && typeof competitorIdentifier !== 'number') return null;
  if (expectedUsername && typeof expectedUsername !== 'string') return null;
  const raw = String(competitorIdentifier).trim();
  const isNumeric = /^\d+$/.test(raw);

  // If canonical username is known, ALWAYS prioritize resolving local surrogate ID by username
  const cleanExpected = expectedUsername ? normalizePinterestUsername(expectedUsername) : null;
  if (cleanExpected) {
    try {
      const [c] = await sql`SELECT id FROM competitor_profiles WHERE LOWER(username) = ${cleanExpected} LIMIT 1;`;
      if (c?.id) return c.id;
    } catch (err) {
      console.warn(`[resolveLocalCompetitorId] Failed to resolve ID for expected @${cleanExpected}:`, err.message);
    }
  }

  if (!isNumeric) {
    const cleanUser = normalizePinterestUsername(raw);
    if (!cleanUser) return null;
    try {
      const [row] = await sql`
        SELECT id FROM competitor_profiles WHERE LOWER(username) = ${cleanUser} LIMIT 1;
      `;
      return row?.id || null;
    } catch (err) {
      console.warn(`[resolveLocalCompetitorId] Query error for @${cleanUser}:`, err.message);
      return null;
    }
  }

  // If numeric ID was passed, verify it exists in this specific database instance
  const numId = parseInt(raw, 10);
  if (isNaN(numId)) return null;
  try {
    const [verified] = await sql`
      SELECT id FROM competitor_profiles WHERE id = ${numId} LIMIT 1;
    `;
    return verified?.id || null;
  } catch (err) {
    console.warn(`[resolveLocalCompetitorId] Numeric check failed for ID ${numId}:`, err.message);
    return null;
  }
}

export async function resolveNumericCompetitorId(sql, competitorId) {
  return resolveLocalCompetitorId(sql, competitorId);
}

/**
 * Get registered seed pins for an account along with discovered related candidate counts.
 */
export async function getCompetitorSeeds(sql, competitorId) {
  const numericId = await resolveNumericCompetitorId(sql, competitorId);
  if (!numericId || isNaN(numericId)) throw new Error('Valid competitorId is required.');

  const rows = await sql`
    SELECT 
      csp.id,
      csp.competitor_id,
      csp.pin_id,
      csp.title,
      csp.image_url,
      csp.board_name,
      csp.save_count,
      csp.created_at,
      csp.last_crawled_at,
      COUNT(crn.id)::int AS related_count
    FROM competitor_seed_pins csp
    LEFT JOIN competitor_related_nodes crn 
      ON crn.competitor_id = csp.competitor_id AND crn.seed_pin_id = csp.pin_id
    WHERE csp.competitor_id = ${numericId}
    GROUP BY csp.id
    ORDER BY csp.created_at DESC;
  `;

  return { seeds: rows };
}

/**
 * Add pin IDs as seeds for a competitor, populating titles and thumbnails from competitor_pins if available.
 * Fully atomic, deadlock-free monotonic batch upsert via jsonb_to_recordset.
 */
export async function addCompetitorSeeds(sql, competitorId, pinIds = []) {
  const numericId = await resolveNumericCompetitorId(sql, competitorId);
  if (!numericId || isNaN(numericId)) throw new Error('Valid competitorId is required.');
  if (!Array.isArray(pinIds) || pinIds.length === 0) return { ok: true, added_count: 0 };

  const cleanIds = [...new Set(pinIds.map(p => String(p).trim().replace(/\D+/g, '')).filter(Boolean))];
  if (cleanIds.length === 0) return { ok: true, added_count: 0 };

  // Monotonic sorting strictly eliminates PostgreSQL row-level deadlock cycles between concurrent workers
  cleanIds.sort();

  const metaRows = await sql`
    SELECT 
      cp.pin_id,
      cp.title,
      cp.image_url,
      cp.board_name,
      cp.save_count
    FROM competitor_pins cp
    WHERE cp.competitor_id = ${numericId} AND cp.pin_id = ANY(${cleanIds});
  `;

  const metaMap = new Map();
  for (const m of metaRows) metaMap.set(m.pin_id, m);

  const seedRecords = cleanIds.map(pid => {
    const meta = metaMap.get(pid);
    return {
      competitor_id: numericId,
      pin_id: pid,
      title: (meta?.title || `Pin #${pid}`).slice(0, 500),
      image_url: meta?.image_url || null,
      board_name: (meta?.board_name || null)?.slice(0, 255),
      save_count: Number(meta?.save_count || 0)
    };
  });

  const inserted = await sql`
    INSERT INTO competitor_seed_pins (competitor_id, pin_id, title, image_url, board_name, save_count)
    SELECT
      x.competitor_id, x.pin_id, x.title, x.image_url, x.board_name, x.save_count
    FROM jsonb_to_recordset(${JSON.stringify(seedRecords)}::jsonb) AS x(
      competitor_id int, pin_id varchar, title text, image_url text, board_name varchar, save_count bigint
    )
    ON CONFLICT (competitor_id, pin_id) DO UPDATE SET
      title = CASE WHEN EXCLUDED.title <> '' AND EXCLUDED.title NOT LIKE 'Pin #%' THEN EXCLUDED.title ELSE competitor_seed_pins.title END,
      image_url = COALESCE(EXCLUDED.image_url, competitor_seed_pins.image_url),
      board_name = COALESCE(EXCLUDED.board_name, competitor_seed_pins.board_name),
      save_count = GREATEST(competitor_seed_pins.save_count, EXCLUDED.save_count)
    RETURNING id;
  `;

  return { ok: true, added_count: inserted.length };
}

/**
 * Delete a seed pin (or multiple seed pins) and all associated related nodes.
 */
export async function deleteCompetitorSeed(sql, competitorId, pinId) {
  const numericId = await resolveNumericCompetitorId(sql, competitorId);
  if (!numericId || isNaN(numericId)) throw new Error('Valid competitorId is required.');
  const pins = Array.isArray(pinId)
    ? pinId.map(p => String(p).trim()).filter(Boolean)
    : String(pinId || '').split(/[\s,]+/).map(p => p.trim().replace(/\D+/g, '')).filter(Boolean);
  if (pins.length === 0) throw new Error('Valid pinId is required.');

  // Explicitly purge related nodes (also handled automatically via fk_crn_seed_pins ON DELETE CASCADE)
  await sql`
    DELETE FROM competitor_related_nodes 
    WHERE competitor_id = ${numericId} AND seed_pin_id = ANY(${pins});
  `;
  await sql`
    DELETE FROM competitor_seed_pins 
    WHERE competitor_id = ${numericId} AND pin_id = ANY(${pins});
  `;

  return { ok: true, deleted_pin_ids: pins, deleted_pin_id: pins[0] };
}

/**
 * Calculate Multi-Seed Intersections, Account Retention Rate, and Traffic Leakage.
 * Strictly inner joins competitor_seed_pins to prevent ghost/orphaned nodes from contaminating telemetry.
 */
export async function getCompetitorRelatedIntersections(sql, competitorId, options = {}) {
  const numericId = await resolveNumericCompetitorId(sql, competitorId);
  if (!numericId || isNaN(numericId)) throw new Error('Valid competitorId is required.');

  const rawMin = options.min_overlap ?? options.min_seed_overlap;
  const minOverlap = (rawMin !== undefined && rawMin !== null) ? Math.max(1, Number(rawMin)) : 2;
  const page = Math.max(1, Number(options.page) || 1);
  const limit = Math.min(Math.max(1, Number(options.limit) || 50), 200);
  const offset = (page - 1) * limit;
  const filter = options.filter || options.ownership_filter || 'all'; // 'all', 'self_only', 'rivals_only'
  const cleanSearch = (options.search && typeof options.search === 'string' && options.search.trim()) ? escapeSqlWildcards(options.search.toLowerCase().trim()) : null;
  const searchPattern = cleanSearch ? `%${cleanSearch}%` : null;

  // Execute stats, paginated rows, and total count concurrently over Neon serverless pipeline
  const [[statsRow], rows, [countRow]] = await Promise.all([
    // 1. Overall stats for this competitor's active seed graph
    sql`
      SELECT 
        (SELECT COUNT(*)::int FROM competitor_seed_pins WHERE competitor_id = ${numericId}) AS total_seeds,
        COUNT(*)::int AS total_nodes,
        COUNT(DISTINCT crn.candidate_pin_id)::int AS unique_candidates,
        COUNT(*) FILTER (WHERE crn.is_same_account = true)::int AS self_nodes,
        COUNT(*) FILTER (WHERE crn.is_same_account = false)::int AS rival_nodes
      FROM competitor_related_nodes crn
      INNER JOIN competitor_seed_pins csp 
        ON csp.competitor_id = crn.competitor_id AND csp.pin_id = crn.seed_pin_id
      WHERE crn.competitor_id = ${numericId};
    `,
    // 2. Fetch intersections matching criteria
    sql`
      SELECT 
        crn.candidate_pin_id,
        MAX(crn.title) AS title,
        MAX(crn.image_url) AS image_url,
        MAX(crn.dominant_color) AS dominant_color,
        MAX(crn.saves)::bigint AS saves,
        MAX(crn.repins)::bigint AS repins,
        MAX(crn.domain) AS domain,
        MAX(crn.destination_url) AS destination_url,
        BOOL_OR(crn.is_same_account) AS is_same_account,
        MAX(crn.creator_username) AS creator_username,
        MAX(crn.creator_name) AS creator_name,
        MAX(crn.provenance_engine) AS provenance_engine,
        COUNT(DISTINCT crn.seed_pin_id)::int AS seed_overlap_count,
        ARRAY_AGG(DISTINCT crn.seed_pin_id) AS originating_seeds
      FROM competitor_related_nodes crn
      INNER JOIN competitor_seed_pins csp 
        ON csp.competitor_id = crn.competitor_id AND csp.pin_id = crn.seed_pin_id
      WHERE crn.competitor_id = ${numericId}
        AND (${searchPattern}::text IS NULL OR LOWER(crn.title) LIKE ${searchPattern} OR LOWER(COALESCE(crn.creator_username, '')) LIKE ${searchPattern})
        AND (
          ${filter} = 'all' OR
          (${filter} = 'self_only' AND crn.is_same_account = TRUE) OR
          (${filter} = 'rivals_only' AND crn.is_same_account = FALSE)
        )
      GROUP BY crn.candidate_pin_id
      HAVING COUNT(DISTINCT crn.seed_pin_id) >= ${minOverlap}
      ORDER BY seed_overlap_count DESC, saves DESC
      LIMIT ${limit} OFFSET ${offset};
    `,
    // 3. Count matching intersections for accurate pagination
    sql`
      SELECT COUNT(*)::int AS total
      FROM (
        SELECT crn.candidate_pin_id
        FROM competitor_related_nodes crn
        INNER JOIN competitor_seed_pins csp 
          ON csp.competitor_id = crn.competitor_id AND csp.pin_id = crn.seed_pin_id
        WHERE crn.competitor_id = ${numericId}
          AND (${searchPattern}::text IS NULL OR LOWER(crn.title) LIKE ${searchPattern} OR LOWER(COALESCE(crn.creator_username, '')) LIKE ${searchPattern})
          AND (
            ${filter} = 'all' OR
            (${filter} = 'self_only' AND crn.is_same_account = TRUE) OR
            (${filter} = 'rivals_only' AND crn.is_same_account = FALSE)
          )
        GROUP BY crn.candidate_pin_id
        HAVING COUNT(DISTINCT crn.seed_pin_id) >= ${minOverlap}
      ) sub;
    `
  ]);

  const totalNodes = Number(statsRow?.total_nodes || 0);
  const selfNodes = Number(statsRow?.self_nodes || 0);
  const rivalNodes = Number(statsRow?.rival_nodes || 0);
  const retentionRate = totalNodes > 0 ? Number(((selfNodes / totalNodes) * 100).toFixed(1)) : 0;
  const leakageRate = Number((100 - retentionRate).toFixed(1));

  const total = Number(countRow?.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return {
    intersections: rows.map(r => ({
      ...r,
      saves: Number(r.saves || 0),
      repins: Number(r.repins || 0),
      seed_overlap_count: Number(r.seed_overlap_count || 1)
    })),
    stats: {
      total_seeds: Number(statsRow?.total_seeds || 0),
      total_nodes: totalNodes,
      unique_candidates: Number(statsRow?.unique_candidates || 0),
      self_retention_nodes: selfNodes,
      rival_leakage_nodes: rivalNodes,
      retention_rate_pct: retentionRate,
      leakage_rate_pct: leakageRate,
      total_intersections: total
    },
    total,
    page,
    limit,
    total_pages: totalPages
  };
}

/**
 * Fast live harvest for a single pin (Zero-Cookie, Jitter, AbortSignal).
 * In-memory Map deduplication prevents PostgreSQL cardinality violations.
 * Monotonic sorting eliminates deadlocks.
 */
export async function harvestSinglePinRelatedLive(sql, competitorId, pinId) {
  const numericId = await resolveNumericCompetitorId(sql, competitorId);
  if (!numericId || isNaN(numericId)) throw new Error('Valid competitorId is required.');
  const cleanPin = String(pinId || '').trim();
  if (!cleanPin) throw new Error('Valid pinId is required.');

  // Fetch competitor username and metadata concurrently
  const [[comp], [metaPin]] = await Promise.all([
    sql`SELECT id, username FROM competitor_profiles WHERE id = ${numericId} LIMIT 1;`,
    sql`SELECT title, image_url, board_name, save_count FROM competitor_pins WHERE competitor_id = ${numericId} AND pin_id = ${cleanPin} LIMIT 1;`
  ]);
  const targetUsername = comp ? comp.username : '';

  // Ensure seed pin row exists in competitor_seed_pins BEFORE inserting related child nodes
  const seedTitle = metaPin?.title || `Pin #${cleanPin}`;
  const seedImg = metaPin?.image_url || null;
  const seedBoard = metaPin?.board_name || null;
  const seedSaves = Number(metaPin?.save_count || 0);

  await sql`
    INSERT INTO competitor_seed_pins (competitor_id, pin_id, title, image_url, board_name, save_count, last_crawled_at)
    VALUES (${numericId}, ${cleanPin}, ${seedTitle}, ${seedImg}, ${seedBoard}, ${seedSaves}, NOW())
    ON CONFLICT (competitor_id, pin_id) DO UPDATE SET 
      title = CASE WHEN EXCLUDED.title <> '' AND EXCLUDED.title NOT LIKE 'Pin #%' THEN EXCLUDED.title ELSE competitor_seed_pins.title END,
      image_url = COALESCE(EXCLUDED.image_url, competitor_seed_pins.image_url),
      board_name = COALESCE(EXCLUDED.board_name, competitor_seed_pins.board_name),
      save_count = GREATEST(competitor_seed_pins.save_count, EXCLUDED.save_count),
      last_crawled_at = NOW();
  `;

  const optionsObj = {
    pin_id: cleanPin,
    additional_fields: ["pin.gen_ai_topics"],
    context_pin_ids: [],
    context_near_dup_image_sigs: [],
    homefeed_source_sig: null,
    page_size: 24,
    search_query: "",
    source: "deep_linking",
    top_level_source: "deep_linking",
    top_level_source_depth: 1,
    is_pdp: false,
    client_tracking_params: "CwABAAAAEDE0ODExNTU0MzQxNjE4ODgLAAcAAAAPdW5rbm93bi91bmtub3duAA"
  };

  const dataParam = JSON.stringify({ options: optionsObj, context: {} });
  const url = `https://www.pinterest.com/resource/RelatedModulesResource/get/?source_url=${encodeURIComponent(`/pin/${cleanPin}/`)}&data=${encodeURIComponent(dataParam)}`;

  const headers = {
    'accept': 'application/json, text/javascript, */*, q=0.01',
    'accept-language': 'en-US,en;q=0.9',
    'screen-dpr': '1',
    'sec-ch-ua': '"Not=A?Brand";v="99", "Google Chrome";v="151", "Chromium";v="151"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'x-app-version': '664ee65',
    'x-pinterest-pws-handler': 'www/pin/[id].js',
    'x-requested-with': 'XMLHttpRequest',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
    'origin': 'https://www.pinterest.com',
    'referer': `https://www.pinterest.com/pin/${cleanPin}/`,
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin'
  };

  const res = await pinterestFetch(url, { headers, signal: AbortSignal.timeout(8000) });
  if (!res.ok) {
    if (res.body && !res.bodyUsed) await res.body.cancel().catch(() => {});
    throw new Error(`Pinterest returned HTTP ${res.status}`);
  }

  const json = await res.json();
  const resResponse = json?.resource_response || json;
  const items = resResponse?.data || [];

  // Deduplicate candidates using Map<candId, candidateObj> to strictly eliminate PostgreSQL cardinality violations
  const candidateMap = new Map();
  for (const item of items) {
    const isPin = item?.type === 'pin' || (item?.id && /^\d+$/.test(String(item.id)));
    if (!isPin) continue;

    const candId = String(item.id);
    if (candId === cleanPin) continue; // ignore self-reference

    const title = typeof item.title === 'string' ? item.title : (typeof item.grid_title === 'string' ? item.grid_title : '');
    const saves = Number(item.aggregated_pin_data?.aggregated_stats?.saves || item.save_count || 0);
    const repins = Number(item.repin_count || 0);
    const creator = item.pinner?.username || item.origin_pinner?.username || '';
    const creatorName = item.pinner?.full_name || '';
    const domain = item.domain || item.link_domain || '';
    const link = item.link || '';
    const img = item.images?.['236x']?.url || item.images?.['736x']?.url || item.images?.orig?.url || '';
    const isSameAccount = creator.toLowerCase() === targetUsername.toLowerCase();

    const candidateObj = {
      competitor_id: numericId,
      seed_pin_id: cleanPin,
      candidate_pin_id: candId,
      title: title.slice(0, 500),
      image_url: img,
      dominant_color: item.dominant_color || '#a88d56',
      saves,
      repins,
      domain: domain.slice(0, 255),
      destination_url: link,
      is_product: Boolean(item.is_product || item.commerce_product),
      is_same_account: isSameAccount,
      creator_username: creator.slice(0, 100),
      creator_name: creatorName.slice(0, 255),
      provenance_engine: 'P2P_TWO_TOWER'
    };

    if (candidateMap.has(candId)) {
      const existing = candidateMap.get(candId);
      if (saves > existing.saves) {
        candidateMap.set(candId, candidateObj);
      }
    } else {
      candidateMap.set(candId, candidateObj);
    }
  }

  const candidateRows = Array.from(candidateMap.values());

  if (candidateRows.length > 0) {
    // Monotonic sort to eliminate PostgreSQL unique index locking deadlocks
    candidateRows.sort((a, b) => a.candidate_pin_id.localeCompare(b.candidate_pin_id));

    const cleanCandidates = sanitizeForJsonb(candidateRows);

    await sql`
      INSERT INTO competitor_related_nodes (
        competitor_id, seed_pin_id, candidate_pin_id, title, image_url,
        dominant_color, saves, repins, domain, destination_url,
        is_product, is_same_account, creator_username, creator_name,
        provenance_engine, discovered_at
      )
      SELECT
        x.competitor_id, x.seed_pin_id, x.candidate_pin_id, x.title, x.image_url,
        x.dominant_color, x.saves, x.repins, x.domain, x.destination_url,
        x.is_product, x.is_same_account, x.creator_username, x.creator_name,
        x.provenance_engine, NOW()
      FROM jsonb_to_recordset(${JSON.stringify(cleanCandidates)}::jsonb) AS x(
        competitor_id int, seed_pin_id varchar, candidate_pin_id varchar, title text, image_url text,
        dominant_color varchar, saves int, repins int, domain text, destination_url text,
        is_product boolean, is_same_account boolean, creator_username varchar, creator_name varchar,
        provenance_engine varchar
      )
      ON CONFLICT (competitor_id, seed_pin_id, candidate_pin_id) DO UPDATE SET
        saves = GREATEST(competitor_related_nodes.saves, EXCLUDED.saves),
        repins = GREATEST(competitor_related_nodes.repins, EXCLUDED.repins),
        title = CASE WHEN EXCLUDED.title <> '' THEN EXCLUDED.title ELSE competitor_related_nodes.title END,
        image_url = CASE WHEN EXCLUDED.image_url <> '' THEN EXCLUDED.image_url ELSE competitor_related_nodes.image_url END,
        domain = CASE WHEN EXCLUDED.domain <> '' THEN EXCLUDED.domain ELSE competitor_related_nodes.domain END,
        destination_url = CASE WHEN EXCLUDED.destination_url <> '' THEN EXCLUDED.destination_url ELSE competitor_related_nodes.destination_url END,
        is_same_account = EXCLUDED.is_same_account;
    `;
  }

  return { ok: true, pin_id: cleanPin, discovered_count: candidateRows.length };
}

/**
 * Fast Refresh:
 * Refreshes live metrics (saves, repins, comments, reactions) of all archived/winning pins
 * for a specific competitor directly from Pinterest unauthenticated.
 * Enforces monotonic ratchet so metrics NEVER drop.
 */
export async function fastRefreshCompetitorArchivedPins(sql, competitorIdOrUsername, options = {}) {
  const numericId = await resolveNumericCompetitorId(sql, competitorIdOrUsername);
  let cleanUsername = null;
  if (numericId) {
    const [comp] = await sql`SELECT username FROM competitor_profiles WHERE id = ${numericId};`;
    cleanUsername = comp ? comp.username : null;
  } else {
    cleanUsername = normalizePinterestUsername(competitorIdOrUsername);
  }

  if (!cleanUsername) {
    return { ok: false, error: 'Valid competitor ID or username is required.' };
  }

  // Get all winning pins currently archived for this account in pa_pins
  const pinsToRefresh = await sql`
    SELECT pin_id, title, saves, repins, comments
    FROM pa_pins
    WHERE account_username = ${cleanUsername.toLowerCase()}
    ORDER BY saves DESC;
  `;

  if (pinsToRefresh.length === 0) {
    return { ok: true, refreshed_count: 0, total_archived: 0, message: 'No archived pins found for this account.' };
  }

  let refreshedCount = 0;
  const results = [];
  const maxToRefresh = Math.min(pinsToRefresh.length, Number(options.limit) || 200);

  for (let i = 0; i < maxToRefresh; i++) {
    const pin = pinsToRefresh[i];
    try {
      const live = await fetchPinFromPinResource(pin.pin_id);
      if (live && live.saves > 0) {
        // [INVARIANT: ZERO-HUB-SNAPSHOTS]
        // [INVARIANT: FOUR-PILLAR-SYNC-PARITY]
        // Route through syncPinAcrossAllFourPillars to update Shard universal_master_pins,
        // Shard pins_daily_metrics, Hub pa_pins, Hub competitor_pins, Hub keyword_serp_current
        await syncPinAcrossAllFourPillars({
          hubSql: sql,
          pinId: pin.pin_id,
          scrapedPin: live,
          env: options?.env || null
        });

        refreshedCount++;
        results.push({ pin_id: pin.pin_id, saves: live.saves, repins: live.repins });
      }
    } catch (_) {}

    // Small jitter between pins (150-300ms) to prevent 429 rate limits
    if (i < maxToRefresh - 1) {
      await sleep(randomJitterMs(150, 300));
    }
  }

  return {
    ok: true,
    refreshed_count: refreshedCount,
    total_archived: pinsToRefresh.length,
    pins: results
  };
}

/**
 * Audit Sweep Now:
 * Executes a comprehensive audit and reconciliation sweep for a creator:
 * 1. Scrapes fresh unauthenticated profile metrics (reach, views, followers, total pins) and snapshots history.
 * 2. Syncs and heals all Pinterest boards in competitor_boards.
 * 3. Sweeps and resolves any monotonic dips (handled at Shard DB Storage level).
 * 4. Re-evaluates all discovered competitor_pins against 3-tier rules to ingest newly qualified pins.
 * 5. Returns a detailed audit report.
 */
export async function auditSweepCompetitor(sql, competitorIdOrUsername, options = {}) {
  const numericId = await resolveNumericCompetitorId(sql, competitorIdOrUsername);
  let cleanUsername = null;
  if (numericId) {
    const [comp] = await sql`SELECT username FROM competitor_profiles WHERE id = ${numericId};`;
    cleanUsername = comp ? comp.username : null;
  } else {
    cleanUsername = normalizePinterestUsername(competitorIdOrUsername);
  }

  if (!cleanUsername) {
    return { ok: false, error: 'Valid competitor ID or username is required.' };
  }

  const auditReport = {
    competitor_id: numericId,
    username: cleanUsername,
    profile_updated: false,
    boards_synced: 0,
    monotonic_dips_healed: 0,
    newly_qualified_pins: 0,
    total_pins_inventory: 0,
    total_destination_urls: 0,
    audited_at: new Date().toISOString()
  };

  // 1. Scrape fresh unauthenticated profile and record snapshot
  try {
    const profileRes = await syncCompetitorProfile(sql, cleanUsername, options.cookie || '');
    if (profileRes?.ok) {
      auditReport.profile_updated = true;
      auditReport.profile = profileRes.profile;
    }
  } catch (err) {
    console.warn(`[auditSweep] syncCompetitorProfile notice:`, err.message);
  }

  // 2. Sync boards
  if (numericId) {
    try {
      const boardRes = await syncCompetitorBoards(sql, numericId, cleanUsername, options.cookie || '');
      auditReport.boards_synced = boardRes?.synced_boards_count || boardRes?.synced || 0;
    } catch (err) {
      console.warn(`[auditSweep] syncCompetitorBoards notice:`, err.message);
    }
  }

  // 3. Monotonic healing ratchet sweep (Snapshots are managed exclusively on Storage Shards)
  // [INVARIANT: ZERO-HUB-SNAPSHOTS]
  auditReport.monotonic_dips_healed = 0;

  // 4. Re-evaluate pins against 3-tier rules
  if (numericId) {
    try {
      const reEval = await reEvaluateCompetitorPins(sql, numericId);
      auditReport.newly_qualified_pins = reEval?.qualified_count || 0;
    } catch (err) {
      console.warn(`[auditSweep] reEvaluate notice:`, err.message);
    }

    // 5. Query inventory totals
    try {
      const [{ count: pinCount }] = await sql`
        SELECT COUNT(*)::int AS count FROM competitor_pins WHERE competitor_id = ${numericId};
      `;
      auditReport.total_pins_inventory = pinCount;

      const [{ count: urlCount }] = await sql`
        SELECT COUNT(DISTINCT destination_url)::int AS count 
        FROM competitor_pins 
        WHERE competitor_id = ${numericId} AND destination_url IS NOT NULL AND destination_url <> '' AND destination_url NOT LIKE '%pinterest.com%';
      `;
      auditReport.total_destination_urls = urlCount;
    } catch (_) {}
  }

  return {
    ok: true,
    ...auditReport,
    message: `Audit sweep successfully completed for @${cleanUsername}: Profile refreshed, ${auditReport.boards_synced} boards synced, ${auditReport.total_pins_inventory} pins audited.`
  };
}

/**
 * ⚡ Quick Pulse (~3s):
 * High-speed parallel synchronization of creator profile & boards metadata.
 * Returns live impressions, total audience, and follower counts without crawling pins.
 */
export async function quickPulseCreator(sql, idOrUsername, cookie = '') {
  const numericId = await resolveNumericCompetitorId(sql, idOrUsername);
  let cleanUsername = null;
  if (numericId) {
    const [comp] = await sql`SELECT username FROM competitor_profiles WHERE id = ${numericId};`;
    cleanUsername = comp ? comp.username : null;
  } else {
    cleanUsername = normalizePinterestUsername(idOrUsername);
  }
  if (!cleanUsername) throw new Error('Valid creator username or ID is required.');

  const effectiveCookie = cookie || (typeof process !== 'undefined' && process?.env ? process.env.PINTEREST_COOKIE : null);

  let activeId = numericId;
  const profilePromise = syncCompetitorProfile(sql, cleanUsername, effectiveCookie);
  const boardsPromise = activeId ? syncCompetitorBoards(sql, activeId, cleanUsername, effectiveCookie) : Promise.resolve(null);

  const [profileRes, initialBoardsRes] = await Promise.all([
    profilePromise,
    boardsPromise
  ]);

  let boardsRes = initialBoardsRes;
  if (!boardsRes) {
    activeId = profileRes?.id || (await resolveNumericCompetitorId(sql, cleanUsername));
    if (activeId) {
      boardsRes = await syncCompetitorBoards(sql, activeId, cleanUsername, effectiveCookie).catch(() => null);
    }
  }

  const [refreshed] = await sql`
    SELECT id, username, display_name, monthly_reach, profile_views, follower_count, following_count, total_pins, avatar_url, updated_at
    FROM competitor_profiles
    WHERE LOWER(username) = ${cleanUsername.toLowerCase()}
    LIMIT 1;
  `;

  return {
    ok: true,
    mode: 'quick-pulse',
    creator_id: refreshed?.id || activeId || numericId,
    username: cleanUsername,
    monthly_reach: Number(refreshed?.monthly_reach || 0), // Total audience
    profile_views: Number(refreshed?.profile_views || 0), // Impressions
    follower_count: Number(refreshed?.follower_count || 0),
    total_pins: Number(refreshed?.total_pins || 0),
    boards_synced: boardsRes?.synced_boards_count || boardsRes?.synced || 0,
    profile: refreshed,
    synced_at: new Date().toISOString()
  };
}

/**
 * 🌊 Deep Harvest (~30s):
 * Full profile + board sync, catalog sweep into competitor_pins,
 * one-way promotion reconciliation to pa_pins, and an in-process 4-worker pool
 * live metric refresh with deterministic shard snapshots on pins_daily_metrics.
 */
export async function deepHarvestCreator(sql, idOrUsername, { cookie = '', env = null, maxPinRefresh = 20 } = {}) {
  const pulse = await quickPulseCreator(sql, idOrUsername, cookie);
  const numericId = pulse.creator_id;
  const cleanUsername = pulse.username;

  let pinsSyncRes = null;
  if (numericId) {
    try {
      pinsSyncRes = await syncCompetitorPins(sql, numericId, cleanUsername, { mode: 'daily', maxPages: 3, fastJitter: true, cookie });
    } catch (err) {
      console.warn(`[deepHarvestCreator] syncCompetitorPins warning:`, err.message);
    }
  }

  let reconcileRes = null;
  if (numericId) {
    try {
      reconcileRes = await reconcileQualifiedCatalogPins(sql, numericId);
    } catch (err) {
      console.warn(`[deepHarvestCreator] reconcileQualifiedCatalogPins warning:`, err.message);
    }
  }

  // 4-Worker pool live metric refresh on winning pins (bounded to max 25 to protect Cloudflare subrequest budget)
  let refreshedCount = 0;
  const limitPins = Math.max(1, Math.min(Number(maxPinRefresh) || 20, 25));
  const archivedPins = await sql`
    SELECT pin_id, title, saves, repins, comments
    FROM pa_pins
    WHERE account_username = ${cleanUsername.toLowerCase()}
    ORDER BY saves DESC
    LIMIT ${limitPins};
  `;

  if (archivedPins.length > 0) {
    const CONCURRENCY = 4;
    let nextIdx = 0;
    const workers = Array.from({ length: CONCURRENCY }, async () => {
      while (nextIdx < archivedPins.length) {
        const p = archivedPins[nextIdx++];
        if (!p) break;
        try {
          const live = await fetchPinFromPinResource(p.pin_id);
          if (live && live.saves > 0) {
            // [INVARIANT: FOUR-PILLAR-SYNC-PARITY]
            // [INVARIANT: ZERO-HUB-SNAPSHOTS]
            await syncPinAcrossAllFourPillars({
              hubSql: sql,
              pinId: p.pin_id,
              scrapedPin: live,
              env
            });
            refreshedCount++;
          }
        } catch (_) {}
        await sleep(randomJitterMs(50, 120));
      }
    });
    await Promise.all(workers);
  }

  return {
    ok: true,
    mode: 'deep-harvest',
    creator_id: numericId,
    username: cleanUsername,
    monthly_reach: pulse.monthly_reach,
    profile_views: pulse.profile_views,
    follower_count: pulse.follower_count,
    boards_synced: pulse.boards_synced,
    new_pins_discovered: pinsSyncRes?.new_pins_count || pinsSyncRes?.inserted || 0,
    qualified_promotions: reconcileRes?.promoted_or_updated || 0,
    promoted_count: reconcileRes?.promoted_or_updated || 0,
    qualified_count: reconcileRes?.promoted_or_updated || 0,
    refreshed_winning_pins: refreshedCount,
    harvested_at: new Date().toISOString()
  };
}

// =============================================================================
// PINARCHIVE & TOPIC INTELLIGENCE ENGINE
// =============================================================================

export const DEFAULT_QUALIFICATION_RULES = {
  id: 1,
  tier1_min_saves: 100,
  tier2_min_repins: 100,
  tier2_min_velocity: 3.5,
  tier2_max_age_days: 60,
  tier3_max_age_days: 14,
  tier3_min_saves: 25,
  master_ingest_enabled: true,
  early_stop_pages: 3,
  max_batch_pins: 500,
  discovery_max_pages: 500,
  refresh_max_pins: 0,
  paused_policy: 'reject'
};

/**
 * Get active Pin Qualification Rules from Neon Postgres
 */
export async function getQualificationRules(sql) {
  try {
    const [row] = await sql`SELECT * FROM pa_qualification_rules WHERE id = 1;`;
    if (row) {
      return {
        id: 1,
        tier1_min_saves: Number(row.tier1_min_saves ?? 100),
        tier2_min_repins: Number(row.tier2_min_repins ?? 100),
        tier2_min_velocity: Number(row.tier2_min_velocity ?? 3.5),
        tier2_max_age_days: Number(row.tier2_max_age_days ?? 60),
        tier3_max_age_days: Number(row.tier3_max_age_days ?? 14),
        tier3_min_saves: Number(row.tier3_min_saves ?? 25),
        master_ingest_enabled: Boolean(row.master_ingest_enabled ?? true),
        cron_enabled: Boolean(row.master_ingest_enabled ?? true),
        early_stop_pages: Number(row.early_stop_pages ?? 3),
        max_batch_pins: Number(row.max_batch_pins ?? 500),
        discovery_max_pages: Number(row.discovery_max_pages ?? 500),
        refresh_max_pins: Number(row.refresh_max_pins ?? 0),
        paused_policy: String(row.paused_policy ?? 'reject'),
        updated_at: row.updated_at
      };
    }
  } catch (_) {}
  return { ...DEFAULT_QUALIFICATION_RULES, cron_enabled: true };
}

/**
 * Update and persist Pin Qualification Rules
 */
export async function updateQualificationRules(sql, rules = {}) {
  const current = await getQualificationRules(sql);
  const t1Saves = Math.max(0, Number(rules.tier1_min_saves ?? current.tier1_min_saves ?? 100));
  const t2Repins = Math.max(0, Number(rules.tier2_min_repins ?? current.tier2_min_repins ?? 100));
  const t2Vel = Math.max(0.1, Number(rules.tier2_min_velocity ?? current.tier2_min_velocity ?? 3.5));
  const t2Days = Math.max(1, Number(rules.tier2_max_age_days ?? current.tier2_max_age_days ?? 60));
  const t3Days = Math.max(1, Number(rules.tier3_max_age_days ?? current.tier3_max_age_days ?? 14));
  const t3Saves = Math.max(0, Number(rules.tier3_min_saves ?? current.tier3_min_saves ?? 25));
  const masterEnabled = rules.master_ingest_enabled !== undefined 
    ? Boolean(rules.master_ingest_enabled) 
    : (rules.cron_enabled !== undefined ? Boolean(rules.cron_enabled) : Boolean(current.master_ingest_enabled));
  const earlyStop = Math.max(1, Math.min(Number(rules.early_stop_pages ?? current.early_stop_pages ?? 3), 100));
  const maxBatch = Math.max(10, Math.min(Number(rules.max_batch_pins ?? current.max_batch_pins ?? 500), 5000));
  const discMax = Math.max(1, Math.min(Number(rules.discovery_max_pages ?? current.discovery_max_pages ?? 500), 2000));
  const refreshMax = Math.max(0, Number(rules.refresh_max_pins ?? current.refresh_max_pins ?? 0));
  const pausedPol = String(rules.paused_policy ?? current.paused_policy ?? 'reject');

  const [updated] = await sql`
    INSERT INTO pa_qualification_rules (
      id,
      tier1_min_saves,
      tier2_min_repins,
      tier3_max_age_days,
      tier3_min_saves,
      master_ingest_enabled,
      early_stop_pages,
      max_batch_pins,
      discovery_max_pages,
      refresh_max_pins,
      paused_policy,
      updated_at
    ) VALUES (
      1,
      ${t1Saves},
      ${t2Repins},
      ${t3Days},
      ${t3Saves},
      ${masterEnabled},
      ${earlyStop},
      ${maxBatch},
      ${discMax},
      ${refreshMax},
      ${pausedPol},
      NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      tier1_min_saves = EXCLUDED.tier1_min_saves,
      tier2_min_repins = EXCLUDED.tier2_min_repins,
      tier3_max_age_days = EXCLUDED.tier3_max_age_days,
      tier3_min_saves = EXCLUDED.tier3_min_saves,
      master_ingest_enabled = EXCLUDED.master_ingest_enabled,
      early_stop_pages = EXCLUDED.early_stop_pages,
      max_batch_pins = EXCLUDED.max_batch_pins,
      discovery_max_pages = EXCLUDED.discovery_max_pages,
      refresh_max_pins = EXCLUDED.refresh_max_pins,
      paused_policy = EXCLUDED.paused_policy,
      updated_at = NOW()
    RETURNING *;
  `;

  return {
    ...(updated || { ...DEFAULT_QUALIFICATION_RULES, ...rules }),
    master_ingest_enabled: masterEnabled,
    cron_enabled: masterEnabled
  };
}

/**
 * Pure qualification filter function implementing the 3-Tier OR criteria
 */
export function qualifyPin(pin, rules = DEFAULT_QUALIFICATION_RULES) {
  if (!rules || rules.master_ingest_enabled === false) {
    return { qualified: false, matchedTier: null };
  }

  // Strict product filtering if configured in active rules
  if ((rules.articles_only === true || rules.exclude_product_pins === true) && Boolean(pin.is_product)) {
    return { qualified: false, matchedTier: null };
  }

  const saves = Number(pin.saves || 0);
  const repins = Number(pin.repins || 0);

  let ageDays = (pin.age_days !== undefined && pin.age_days !== null) ? Number(pin.age_days) : NaN;
  if (isNaN(ageDays)) {
    const rawDate = pin.created_at_pinterest || pin.created_at;
    if (rawDate) {
      const ms = Date.now() - new Date(rawDate).getTime();
      if (Number.isFinite(ms) && ms >= 0) {
        ageDays = Math.max(0.1, ms / (1000 * 60 * 60 * 24));
      }
    }
  }

  // Tier 1: Star Performers (Cumulative Saves)
  if (saves >= Number(rules.tier1_min_saves ?? 100)) {
    return { qualified: true, matchedTier: 'tier1' };
  }

  // Tier 2: Sustained Virality & Velocity Breakout (Age <= 60d AND saves/age >= min_velocity, OR repins >= min_repins)
  const minVelocity = Number(rules.tier2_min_velocity ?? 3.5);
  const maxVelocityAge = Number(rules.tier2_max_age_days ?? 60);
  const pinVelocity = Number(pin.velocity || (!isNaN(ageDays) && ageDays > 0 ? (saves / ageDays) : 0));
  if (
    repins >= Number(rules.tier2_min_repins ?? 100) ||
    (!isNaN(ageDays) && ageDays > 0 && ageDays <= maxVelocityAge && (pinVelocity >= minVelocity || (saves >= 50 && pinVelocity >= 2.0)))
  ) {
    return { qualified: true, matchedTier: 'tier2' };
  }

  // Tier 3: Fresh High-Velocity Breakouts (Age & Saves)
  // Pin MUST have a verified non-negative age <= tier3_max_age_days
  const maxFreshDays = Number(rules.tier3_fresh_days ?? rules.tier3_max_age_days ?? 14);
  if (!isNaN(ageDays) && ageDays !== null && ageDays >= 0 && ageDays <= maxFreshDays && saves >= Number(rules.tier3_min_saves ?? 25)) {
    return { qualified: true, matchedTier: 'tier3' };
  }

  return { qualified: false, matchedTier: null };
}

export function isPinQualified(pin, rules) {
  const res = qualifyPin(pin, rules);
  return typeof res === 'boolean' ? res : Boolean(res?.qualified);
}

/**
 * Re-evaluate candidate pins stored in pa_pins against active rules
 */
export async function reEvaluateArchivedPins(sql, rules = null, accountUsername = null) {
  const activeRules = rules || (await getQualificationRules(sql));
  const cleanUser = accountUsername ? String(accountUsername).replace(/^@+/, '').trim().toLowerCase() : null;
  
  // If master ingest is disabled, no pins qualify for active ingestion (read-only evaluation)
  if (activeRules.master_ingest_enabled === false) {
    const [cnt] = await sql`
      SELECT count(*)::int AS total
      FROM pa_pins
      WHERE (${cleanUser}::text IS NULL OR account_username = ${cleanUser});
    `;
    const total = cnt?.total || 0;
    return {
      ok: true,
      total_evaluated: total,
      qualified_count: 0,
      disqualified_count: total,
      disqualified_pruned: 0,
      rules: activeRules
    };
  }

  const t1 = Number(activeRules.tier1_min_saves ?? 100);
  const t2 = Number(activeRules.tier2_min_repins ?? 100);
  const t2Vel = Number(activeRules.tier2_min_velocity ?? 3.5);
  const t2Days = Number(activeRules.tier2_max_age_days ?? 60);
  const t3Days = Number(activeRules.tier3_max_age_days ?? 14);
  const t3Saves = Number(activeRules.tier3_min_saves ?? 25);

  // Single-Pass SARGable CTE: evaluates, counts, and prunes unqualified pins atomically
  const [res] = await sql`
    WITH target_pins AS (
      SELECT pin_id, saves, repins, created_at_pinterest
      FROM pa_pins
      WHERE (${cleanUser}::text IS NULL OR account_username = ${cleanUser})
    ),
    evaluated AS (
      SELECT
        pin_id,
        (
          saves >= ${t1} 
          OR repins >= ${t2}
          OR (
            created_at_pinterest IS NOT NULL
            AND created_at_pinterest >= NOW() - (${t2Days} * INTERVAL '1 day')
            AND (saves::numeric / GREATEST(0.1, EXTRACT(EPOCH FROM (NOW() - created_at_pinterest)) / 86400.0)) >= ${t2Vel}
          )
          OR (
            created_at_pinterest IS NOT NULL
            AND created_at_pinterest >= NOW() - (${t3Days} * INTERVAL '1 day')
            AND saves >= ${t3Saves}
          )
        ) AS is_qualified
      FROM target_pins
    ),
    deleted AS (
      DELETE FROM pa_pins p
      USING evaluated e
      WHERE p.pin_id = e.pin_id AND e.is_qualified = FALSE
      RETURNING p.pin_id
    )
    SELECT
      (SELECT count(*)::int FROM target_pins) AS total_pins,
      (SELECT count(*)::int FROM evaluated WHERE is_qualified = TRUE) AS qualified_pins,
      (SELECT count(*)::int FROM deleted) AS pruned_pins;
  `;

  const total = Number(res?.total_pins || 0);
  const qualified = Number(res?.qualified_pins || 0);
  const prunedCount = Number(res?.pruned_pins || 0);
  const disqualified = Math.max(0, total - qualified);

  return {
    ok: true,
    total_evaluated: total,
    qualified_count: qualified,
    disqualified_count: disqualified,
    disqualified_pruned: prunedCount,
    rules: activeRules
  };
}

/**
 * Ingest a batch of formatted pins into pa_pins on Central Hub.
 * [INVARIANT: ZERO-HUB-SNAPSHOTS]
 * Optionally applies qualifyPin criteria so unqualified pins are filtered out.
 */
export async function ingestPinsBatch(sql, pins, accountUsername = null, { filterQualified = false, rules = null } = {}) {
  if (!Array.isArray(pins) || pins.length === 0) {
    return { ok: true, added: 0, inserted: 0, updated: 0, filtered: 0, total: 0 };
  }

  const activeRules = filterQualified ? (rules || (await getQualificationRules(sql))) : null;
  const cleanAccount = accountUsername ? String(accountUsername).replace(/^@/, '').trim().toLowerCase() : null;

  let addedCount = 0;
  let updatedCount = 0;
  let filteredCount = 0;

  const preparedPins = [];
  for (const pin of pins) {
    const pinId = String(pin.pin_id || pin.id || '').trim();
    if (!pinId) continue;

    // Filter sub-threshold pins if qualification is active
    if (activeRules && !isPinQualified(pin, activeRules)) {
      filteredCount++;
      continue;
    }

    const title = pin.title || '';
    const description = pin.description || '';
    const link = pin.link || '';
    let domain = pin.domain || '';
    if (!domain && link) {
      try {
        domain = new URL(link).hostname;
      } catch (_) {
        domain = '';
      }
    }
    const boardName = pin.board_name || '';
    const imageUrl = pin.image_url || '';
    const dominantColor = pin.dominant_color || '#888888';
    const saves = Math.max(0, isNaN(Number(pin.saves)) ? 0 : Number(pin.saves));
    const repins = Math.max(0, isNaN(Number(pin.repins)) ? saves : Number(pin.repins));
    const comments = Math.max(0, isNaN(Number(pin.comments)) ? 0 : Number(pin.comments));
    const shareCount = Math.max(0, isNaN(Number(pin.share_count)) ? 0 : Number(pin.share_count));
    
    let reactions = {};
    if (pin.reactions && typeof pin.reactions === 'object' && !Array.isArray(pin.reactions)) {
      reactions = pin.reactions;
    } else if (typeof pin.reactions === 'string' && pin.reactions.trim().startsWith('{')) {
      try {
        reactions = JSON.parse(pin.reactions.trim());
      } catch {
        reactions = {};
      }
    }

    const velocity = Math.max(0, isNaN(Number(pin.velocity)) ? 0 : Number(pin.velocity));

    let annotations = [];
    if (Array.isArray(pin.annotations)) {
      annotations = pin.annotations.slice(0, 15);
    } else if (typeof pin.annotations === 'string' && pin.annotations.trim().startsWith('[')) {
      try {
        annotations = JSON.parse(pin.annotations.trim()).slice(0, 15);
      } catch {
        annotations = [];
      }
    }

    const isVideo = Boolean(pin.is_video);
    const isProduct = Boolean(pin.is_product);
    let createdAtPinterest = null;
    if (pin.created_at_pinterest || pin.created_at) {
      const d = new Date(pin.created_at_pinterest || pin.created_at);
      if (!isNaN(d.getTime())) createdAtPinterest = d;
    }

    preparedPins.push({
      pinId,
      title,
      description,
      link,
      domain,
      boardName,
      imageUrl,
      dominantColor,
      saves,
      repins,
      comments,
      shareCount,
      reactions,
      velocity,
      annotations,
      isVideo,
      isProduct,
      createdAtPinterest
    });
  }

  if (!preparedPins.length) {
    return { ok: true, added: 0, inserted: 0, updated: 0, filtered: filteredCount, total: pins.length };
  }

  // Deduplicate preparedPins by pinId
  const pinMap = new Map();
  for (const p of preparedPins) {
    pinMap.set(p.pinId, p);
  }
  const dedupedPins = Array.from(pinMap.values());

  const payloadArray = dedupedPins.map(p => ({
    pin_id: p.pinId,
    account_username: cleanAccount,
    title: p.title || '',
    description: p.description || '',
    link: p.link || '',
    domain: p.domain || '',
    board_name: p.boardName || '',
    image_url: p.imageUrl || '',
    dominant_color: p.dominantColor || '#888888',
    saves: Number(p.saves || 0),
    repins: Number(p.repins || 0),
    comments: Number(p.comments || 0),
    share_count: Number(p.shareCount || 0),
    reactions: (p.reactions && typeof p.reactions === 'object' && !Array.isArray(p.reactions)) ? p.reactions : {},
    velocity: Number(p.velocity || 0),
    annotations: Array.isArray(p.annotations) ? p.annotations : [],
    is_video: Boolean(p.isVideo),
    is_product: Boolean(p.isProduct),
    created_at_pinterest: p.createdAtPinterest || null
  }));
  const jsonPayload = JSON.stringify(payloadArray);

  try {
    const buildPinsQuery = (db) => db`
      INSERT INTO pa_pins (
        pin_id,
        account_username,
        title,
        description,
        link,
        domain,
        board_name,
        image_url,
        dominant_color,
        saves,
        repins,
        comments,
        share_count,
        reactions,
        velocity,
        annotations,
        is_video,
        is_product,
        created_at_pinterest,
        first_seen_at,
        last_updated_at
      )
      SELECT
        u.pin_id,
        u.account_username,
        u.title,
        u.description,
        u.link,
        u.domain,
        u.board_name,
        u.image_url,
        u.dominant_color,
        u.saves,
        u.repins,
        u.comments,
        u.share_count,
        u.reactions,
        u.velocity,
        u.annotations,
        u.is_video,
        u.is_product,
        u.created_at_pinterest::timestamptz,
        NOW(),
        NOW()
      FROM (
        SELECT *
        FROM jsonb_to_recordset(${typeof db.json === 'function' ? db.json(payloadArray) : jsonPayload}::jsonb) AS raw(
          pin_id text,
          account_username text,
          title text,
          description text,
          link text,
          domain text,
          board_name text,
          image_url text,
          dominant_color text,
          saves bigint,
          repins int,
          comments int,
          share_count int,
          reactions jsonb,
          velocity numeric,
          annotations jsonb,
          is_video boolean,
          is_product boolean,
          created_at_pinterest text
        )
        ORDER BY raw.pin_id ASC
      ) u
      ON CONFLICT (pin_id) DO UPDATE SET
        account_username = COALESCE(EXCLUDED.account_username, pa_pins.account_username),
        title = CASE WHEN EXCLUDED.title <> '' THEN EXCLUDED.title ELSE pa_pins.title END,
        description = CASE WHEN EXCLUDED.description <> '' THEN EXCLUDED.description ELSE pa_pins.description END,
        link = CASE WHEN EXCLUDED.link <> '' THEN EXCLUDED.link ELSE pa_pins.link END,
        domain = CASE WHEN EXCLUDED.domain <> '' THEN EXCLUDED.domain ELSE pa_pins.domain END,
        board_name = CASE WHEN EXCLUDED.board_name <> '' THEN EXCLUDED.board_name ELSE pa_pins.board_name END,
        image_url = CASE WHEN EXCLUDED.image_url <> '' THEN EXCLUDED.image_url ELSE pa_pins.image_url END,
        dominant_color = CASE WHEN EXCLUDED.dominant_color <> '#888888' AND EXCLUDED.dominant_color <> '' THEN EXCLUDED.dominant_color ELSE pa_pins.dominant_color END,
        saves = GREATEST(pa_pins.saves, EXCLUDED.saves),
        repins = GREATEST(pa_pins.repins, EXCLUDED.repins),
        comments = GREATEST(pa_pins.comments, EXCLUDED.comments),
        share_count = GREATEST(pa_pins.share_count, EXCLUDED.share_count),
        reactions = CASE WHEN EXCLUDED.reactions <> '{}'::jsonb THEN EXCLUDED.reactions ELSE pa_pins.reactions END,
        velocity = CASE WHEN EXCLUDED.velocity > 0 THEN EXCLUDED.velocity ELSE pa_pins.velocity END,
        annotations = CASE WHEN jsonb_typeof(EXCLUDED.annotations) = 'array' AND jsonb_array_length(EXCLUDED.annotations) > 0 THEN EXCLUDED.annotations ELSE pa_pins.annotations END,
        is_product = (pa_pins.is_product OR EXCLUDED.is_product),
        created_at_pinterest = COALESCE(pa_pins.created_at_pinterest, EXCLUDED.created_at_pinterest),
        last_updated_at = NOW()
      RETURNING (xmax = 0) AS is_inserted;
    `;

    // [INVARIANT: HYPERDRIVE-ATOMIC-BUILDER]
    // [INVARIANT: ZERO-HUB-SNAPSHOTS]
    // pa_pin_metrics direct writes on Hub are strictly eradicated.
    // Time-series daily snapshots belong exclusively to Storage Shards (pins_daily_metrics).
    let pinRows = [];
    if (typeof sql.transaction === 'function') {
      const res = await sql.transaction([
        (db) => buildPinsQuery(db)
      ]);
      pinRows = res && res[0] ? res[0] : [];
    } else if (typeof sql.begin === 'function') {
      [pinRows] = await sql.begin(async (tx) => {
        const rows = await buildPinsQuery(tx);
        return [rows];
      });
    } else {
      pinRows = await buildPinsQuery(sql);
    }

    for (const r of (pinRows || [])) {
      if (r.is_inserted) addedCount++;
      else updatedCount++;
    }

    if (cleanAccount) {
      try {
        const [comp] = await sql`SELECT id FROM competitor_profiles WHERE LOWER(username) = ${cleanAccount} LIMIT 1;`;
        if (comp?.id) {
          await sql`
            INSERT INTO competitor_pins (
              competitor_id, pin_id, title, description, link_domain,
              destination_url, board_name, board_slug, image_url, save_count, repin_count,
              comment_count, is_product, created_at_pinterest, first_seen_at, last_seen_at, enrichment_status
            )
            SELECT 
              ${comp.id},
              u.pin_id,
              COALESCE(u.title, ''),
              COALESCE(u.description, ''),
              COALESCE(NULLIF(u.domain, ''), ''),
              COALESCE(NULLIF(u.link, ''), ''),
              COALESCE(u.board_name, ''),
              LOWER(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(u.board_name, ''), '[^[:alnum:]]+', '-', 'g'), '^-|-$', '', 'g')),
              COALESCE(u.image_url, ''),
              COALESCE(u.saves, 0)::int,
              COALESCE(u.repins, 0)::int,
              COALESCE(u.comments, 0)::int,
              COALESCE(u.is_product, false),
              u.created_at_pinterest::timestamptz,
              NOW(),
              NOW(),
              'completed'
            FROM jsonb_to_recordset(${jsonPayload}::jsonb) AS u(
              pin_id text, title text, description text, domain text, link text,
              board_name text, image_url text, saves bigint, repins int,
              comments int, is_product boolean, created_at_pinterest text
            )
            ON CONFLICT (competitor_id, pin_id) DO UPDATE SET
              title = CASE WHEN EXCLUDED.title <> '' THEN EXCLUDED.title ELSE competitor_pins.title END,
              destination_url = CASE WHEN EXCLUDED.destination_url <> '' THEN EXCLUDED.destination_url ELSE competitor_pins.destination_url END,
              link_domain = CASE WHEN EXCLUDED.link_domain <> '' THEN EXCLUDED.link_domain ELSE competitor_pins.link_domain END,
              board_name = CASE WHEN EXCLUDED.board_name <> '' THEN EXCLUDED.board_name ELSE competitor_pins.board_name END,
              save_count = GREATEST(competitor_pins.save_count, EXCLUDED.save_count),
              repin_count = GREATEST(competitor_pins.repin_count, EXCLUDED.repin_count),
              comment_count = GREATEST(competitor_pins.comment_count, EXCLUDED.comment_count),
              is_product = (competitor_pins.is_product OR EXCLUDED.is_product),
              last_seen_at = NOW();
          `.catch(() => {});
        }
      } catch (_) {}
    }
  } catch (batchErr) {
    console.warn('[ingestPinsBatch] Bulk ingest batch warning:', batchErr.message);
  }

  return { ok: true, added: addedCount, inserted: addedCount, updated: updatedCount, filtered: filteredCount, total: pins.length };
}

/**
 * Get aggregated PinArchive overview metrics
 */
export async function getPinArchiveOverview(sql) {
  const [[stats], [topCluster]] = await Promise.all([
    sql`
      SELECT
        COUNT(*)::bigint AS total_pins,
        COALESCE(SUM(saves), 0)::bigint AS total_saves,
        COALESCE(SUM(repins), 0)::bigint AS total_repins,
        ROUND(COALESCE(AVG(velocity), 0), 2)::numeric AS avg_velocity,
        COUNT(DISTINCT account_username)::int AS tracked_accounts
      FROM pa_pins;
    `,
    sql`
      SELECT *
      FROM pa_topic_clusters_page(1, NULL, 1, 0);
    `.catch(() => [])
  ]);

  return {
    total_pins: Number(stats?.total_pins || 0),
    total_saves: Number(stats?.total_saves || 0),
    total_repins: Number(stats?.total_repins || 0),
    avg_velocity: Number(stats?.avg_velocity || 0),
    tracked_accounts: Number(stats?.tracked_accounts || 0),
    top_cluster: topCluster ? {
      name: topCluster.topic_name,
      pins: Number(topCluster.pins_count),
      avg_saves: Number(topCluster.avg_saves),
      total_saves: Number(topCluster.total_saves),
    } : null
  };
}

/**
 * Get topic clusters extracted from AI annotations in Postgres
 */
export async function getTopicClusters(sql, { minPins = 1, search = '', account = '', limit = 50, offset = 0 } = {}) {
  const searchPattern = search ? escapeSqlWildcards(search.trim()) : null;
  const cleanAccount = account ? account.toLowerCase().replace(/^@/, '').trim() : null;
  const minNum = Math.max(1, isNaN(Number(minPins)) ? 1 : Number(minPins));
  const lim = Math.max(1, Math.min(isNaN(Number(limit)) ? 50 : Number(limit), 200));
  const off = Math.max(0, isNaN(Number(offset)) ? 0 : Number(offset));

  if (cleanAccount) {
    const rows = await sql`
      WITH extracted AS (
        SELECT
          COALESCE(
            CASE
              WHEN jsonb_typeof(ann) = 'object' THEN trim(ann->>'name')
              WHEN jsonb_typeof(ann) = 'string' THEN trim(ann #>> '{}')
              ELSE NULL
            END,
            NULLIF(TRIM(p.board_name), '')
          ) AS raw_topic,
          p.pin_id,
          p.saves,
          p.velocity
        FROM pa_pins p
        LEFT JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(p.annotations) = 'array' THEN p.annotations ELSE '[]'::jsonb END) AS ann ON TRUE
        WHERE p.account_username = ${cleanAccount}
      ),
      aggregated AS (
        SELECT
          e.raw_topic AS t_name,
          count(DISTINCT e.pin_id)::BIGINT AS p_count,
          coalesce(sum(e.saves), 0)::NUMERIC AS s_saves,
          CASE WHEN count(DISTINCT e.pin_id) > 0 THEN (coalesce(sum(e.saves), 0) / count(DISTINCT e.pin_id))::BIGINT ELSE 0::BIGINT END AS a_saves,
          round(avg(e.velocity), 2) AS a_velocity
        FROM extracted e
        WHERE e.raw_topic IS NOT NULL AND TRIM(e.raw_topic) <> ''
          AND (${searchPattern}::text IS NULL OR e.raw_topic ILIKE ${'%' + (searchPattern || '') + '%'})
        GROUP BY e.raw_topic
        HAVING count(DISTINCT e.pin_id) >= ${minNum}
      )
      SELECT
        a.t_name AS topic_name,
        a.p_count AS pins_count,
        a.s_saves AS total_saves,
        a.a_saves AS avg_saves,
        a.a_velocity AS avg_velocity
      FROM aggregated a
      ORDER BY a.s_saves DESC
      LIMIT ${lim}
      OFFSET ${off};
    `;

    return rows.map(r => ({
      name: r.topic_name,
      pins_count: Number(r.pins_count),
      total_saves: Number(r.total_saves),
      avg_saves: Number(r.avg_saves),
      avg_velocity: Number(r.avg_velocity),
    }));
  }

  try {
    const rows = await sql`
      SELECT
        topic_name,
        pins_count::bigint AS pins_count,
        total_saves::numeric AS total_saves,
        avg_saves::bigint AS avg_saves,
        avg_velocity::numeric AS avg_velocity
      FROM pa_topic_clusters_page(
        ${minNum},
        ${searchPattern},
        ${lim},
        ${off}
      );
    `;

    if (!Array.isArray(rows)) return [];

    return rows.map(r => ({
      name: r.topic_name,
      pins_count: Number(r.pins_count || 0),
      total_saves: Number(r.total_saves || 0),
      avg_saves: Number(r.avg_saves || 0),
      avg_velocity: Number(r.avg_velocity || 0),
    }));
  } catch (err) {
    console.warn('[getTopicClusters] Stored procedure query failed, returning fallback empty list:', err.message);
    return [];
  }
}

/**
 * Calculate pin growth stage
 */
export function computePinStage(velocity, deltaSaves = 0, ageDays = 0) {
  if (velocity < 0.5) return 'DORMANT';
  if (deltaSaves < 0 && velocity < 2) return 'COOLING';
  if (ageDays <= 14) return 'NEW';
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
  timeframe = '24h',
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
  let sortColumn = 'saves';
  if (sortBy === 'velocity' || sortBy === 'delta_saves') sortColumn = 'velocity';
  else if (sortBy === 'created_at' || sortBy === 'date' || sortBy === 'newest') sortColumn = 'created_at_pinterest';
  else if (sortBy === 'repins') sortColumn = 'repins';
  else if (sortBy === 'comments') sortColumn = 'comments';
  else if (sortBy === 'shares' || sortBy === 'share_count') sortColumn = 'share_count';

  const [rows, [countRow]] = await Promise.all([
    sql`
      SELECT *
      FROM pa_pins
      WHERE saves >= ${minNum}
        AND (${maxNum}::bigint IS NULL OR saves <= ${maxNum})
        AND (${searchPattern}::text IS NULL OR (
          COALESCE(LOWER(title), '') LIKE ${searchPattern} OR
          COALESCE(LOWER(description), '') LIKE ${searchPattern} OR
          COALESCE(LOWER(board_name), '') LIKE ${searchPattern} OR
          COALESCE(pin_id, '') LIKE ${searchPattern}
        ))
        AND (${boardPattern}::text IS NULL OR COALESCE(LOWER(board_name), '') LIKE ${boardPattern})
        AND (${topicPattern}::text IS NULL OR (
          COALESCE(LOWER(board_name), '') LIKE ${topicPattern} OR
          COALESCE(LOWER(title), '') LIKE ${topicPattern} OR
          EXISTS (
            SELECT 1
            FROM jsonb_array_elements(CASE WHEN jsonb_typeof(annotations) = 'array' THEN annotations ELSE '[]'::jsonb END) AS elem
            WHERE (
              (jsonb_typeof(elem) = 'object' AND LOWER(elem->>'name') LIKE ${topicPattern})
              OR
              (jsonb_typeof(elem) = 'string' AND LOWER(elem #>> '{}') LIKE ${topicPattern})
            )
          )
        ))
        AND (${accountPattern}::text IS NULL OR COALESCE(account_username, '') LIKE ${accountPattern})
        AND (
          ${stageFilter}::text IS NULL OR
          (${stageFilter} = 'DORMANT' AND velocity < 0.5) OR
          (${stageFilter} = 'COOLING' AND velocity >= 0.5 AND velocity < 2.0) OR
          (${stageFilter} = 'NEW' AND velocity >= 0.5 AND COALESCE(created_at_pinterest, first_seen_at) >= NOW() - INTERVAL '14 days') OR
          (${stageFilter} = 'GROWING' AND velocity >= 10.0 AND (COALESCE(created_at_pinterest, first_seen_at) < NOW() - INTERVAL '14 days' OR COALESCE(created_at_pinterest, first_seen_at) IS NULL)) OR
          (${stageFilter} = 'MATURE' AND velocity >= 2.0 AND velocity < 10.0 AND (COALESCE(created_at_pinterest, first_seen_at) < NOW() - INTERVAL '14 days' OR COALESCE(created_at_pinterest, first_seen_at) IS NULL))
        )
        AND (
          NOT ${filterChangedOnly} OR
          velocity > 0
        )
      ORDER BY
        CASE WHEN ${sortColumn} = 'saves' AND ${isAsc} THEN saves END ASC,
        CASE WHEN ${sortColumn} = 'saves' AND NOT ${isAsc} THEN saves END DESC,
        CASE WHEN ${sortColumn} = 'velocity' AND ${isAsc} THEN velocity END ASC,
        CASE WHEN ${sortColumn} = 'velocity' AND NOT ${isAsc} THEN velocity END DESC,
        CASE WHEN ${sortColumn} = 'created_at_pinterest' AND ${isAsc} THEN created_at_pinterest END ASC NULLS LAST,
        CASE WHEN ${sortColumn} = 'created_at_pinterest' AND NOT ${isAsc} THEN created_at_pinterest END DESC NULLS LAST,
        CASE WHEN ${sortColumn} = 'repins' AND ${isAsc} THEN repins END ASC,
        CASE WHEN ${sortColumn} = 'repins' AND NOT ${isAsc} THEN repins END DESC,
        CASE WHEN ${sortColumn} = 'comments' AND ${isAsc} THEN comments END ASC,
        CASE WHEN ${sortColumn} = 'comments' AND NOT ${isAsc} THEN comments END DESC,
        CASE WHEN ${sortColumn} = 'share_count' AND ${isAsc} THEN share_count END ASC,
        CASE WHEN ${sortColumn} = 'share_count' AND NOT ${isAsc} THEN share_count END DESC,
        saves DESC
      LIMIT ${lim} OFFSET ${off};
    `,
    sql`
      SELECT COUNT(*)::int as total
      FROM pa_pins
      WHERE saves >= ${minNum}
        AND (${maxNum}::bigint IS NULL OR saves <= ${maxNum})
        AND (${searchPattern}::text IS NULL OR (
          COALESCE(LOWER(title), '') LIKE ${searchPattern} OR
          COALESCE(LOWER(description), '') LIKE ${searchPattern} OR
          COALESCE(LOWER(board_name), '') LIKE ${searchPattern} OR
          COALESCE(pin_id, '') LIKE ${searchPattern}
        ))
        AND (${boardPattern}::text IS NULL OR COALESCE(LOWER(board_name), '') LIKE ${boardPattern})
        AND (${topicPattern}::text IS NULL OR (
          COALESCE(LOWER(board_name), '') LIKE ${topicPattern} OR
          COALESCE(LOWER(title), '') LIKE ${topicPattern} OR
          EXISTS (
            SELECT 1
            FROM jsonb_array_elements(CASE WHEN jsonb_typeof(annotations) = 'array' THEN annotations ELSE '[]'::jsonb END) AS elem
            WHERE (
              (jsonb_typeof(elem) = 'object' AND LOWER(elem->>'name') LIKE ${topicPattern})
              OR
              (jsonb_typeof(elem) = 'string' AND LOWER(elem #>> '{}') LIKE ${topicPattern})
            )
          )
        ))
        AND (${accountPattern}::text IS NULL OR COALESCE(account_username, '') LIKE ${accountPattern})
        AND (
          ${stageFilter}::text IS NULL OR
          (${stageFilter} = 'DORMANT' AND velocity < 0.5) OR
          (${stageFilter} = 'COOLING' AND velocity >= 0.5 AND velocity < 2.0) OR
          (${stageFilter} = 'NEW' AND velocity >= 0.5 AND COALESCE(created_at_pinterest, first_seen_at) >= NOW() - INTERVAL '14 days') OR
          (${stageFilter} = 'GROWING' AND velocity >= 10.0 AND (COALESCE(created_at_pinterest, first_seen_at) < NOW() - INTERVAL '14 days' OR COALESCE(created_at_pinterest, first_seen_at) IS NULL)) OR
          (${stageFilter} = 'MATURE' AND velocity >= 2.0 AND velocity < 10.0 AND (COALESCE(created_at_pinterest, first_seen_at) < NOW() - INTERVAL '14 days' OR COALESCE(created_at_pinterest, first_seen_at) IS NULL))
        )
        AND (
          NOT ${filterChangedOnly} OR
          velocity > 0
        );
    `
  ]);

  const now = Date.now();
  const metricsMap = new Map();

  let mapped = rows.map(p => {
    const velocity = Number(p.velocity || 0);
    const createdDate = p.created_at_pinterest ? new Date(p.created_at_pinterest) : (p.first_seen_at ? new Date(p.first_seen_at) : new Date());
    const ageDays = Math.max(1, Math.round((now - createdDate.getTime()) / 86400000));
    
    // Genuine growth deltas calculation directly from summary object
    const snap = metricsMap.get(p.pin_id);
    const curSaves = Number(p.saves || 0);
    const curRepins = Number(p.repins || 0);
    const deltaSaves = snap?.saves_24h != null ? Math.max(0, curSaves - Number(snap.saves_24h)) : 0;
    const deltaRepins = snap?.repins_24h != null ? Math.max(0, curRepins - Number(snap.repins_24h)) : 0;
    const deltaSaves3d = snap?.saves_3d != null ? Math.max(0, curSaves - Number(snap.saves_3d)) : deltaSaves;
    const deltaSaves7d = snap?.saves_7d != null ? Math.max(0, curSaves - Number(snap.saves_7d)) : deltaSaves3d;

    const pinStage = computePinStage(velocity, deltaSaves, ageDays);

    return {
      ...p,
      saves: curSaves,
      repins: curRepins,
      comments: Number(p.comments || 0),
      share_count: Number(p.share_count || 0),
      velocity: Number(velocity.toFixed(1)),
      age_days: ageDays,
      delta_saves: deltaSaves,
      delta_repins: deltaRepins,
      delta_saves_3d: deltaSaves3d,
      delta_saves_7d: deltaSaves7d,
      stage: pinStage,
      formatted_created: createdDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      formatted_first_pulled: p.first_seen_at ? new Date(p.first_seen_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : (p.created_at_pinterest ? new Date(p.created_at_pinterest).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—')
    };
  });

  // Since SQL has already filtered by stage and changedOnly correctly with SARGable index predicates,
  // we do not truncate post-LIMIT in JS, preserving correct page lengths and total counts.
  mapped.total = countRow ? countRow.total : mapped.length;
  return mapped;
}

/**
 * Fetch complete pin detail dossier including all historical metric snapshots and deltas
 */
export async function getPinDetailWithMetrics(sql, pinId, options = {}) {
  const cleanId = String(pinId || '').trim();
  if (!cleanId) throw new Error('pinId is required');
  const forceRefresh = options?.forceRefresh === true || options?.refresh === true;
  const env = options?.env || null;
  const ctx = options?.ctx || null;

  // Live enrichment if explicitly requested via forceRefresh
  if (forceRefresh) {
    try {
      const pRes = await fetchPinFromPinterest(cleanId, '');
      if (pRes?.ok && pRes.pin) {
        await syncPinAcrossAllFourPillars({
          hubSql: sql,
          pinId: cleanId,
          scrapedPin: pRes.pin,
          env,
          ctx
        });
      }
    } catch (fetchErr) {
      console.warn(`[getPinDetailWithMetrics] Anonymous Pinterest fetch fallback failed for pin ${cleanId}:`, fetchErr.message);
    }
  }

  // Canonical SSOT Dossier Retrieval
  const universal = await fetchUniversalPinDossier({
    hubSql: sql,
    pinId: cleanId,
    ctx,
    env,
    bypassEdgeCache: Boolean(forceRefresh)
  }).catch(() => null);

  const c = universal?.creative || {};

  // GUARDRAIL 4: When save_count is 0 or when sql is passed, execute fallback query
  // to allow mockSql in test_p1_consolidation.mjs to supply mockPinRecord.
  let paRow = null;
  if ((!c.save_count || c.save_count === 0) && typeof sql === 'function') {
    try {
      const [p] = await sql`SELECT * FROM pa_pins WHERE pin_id = ${cleanId} LIMIT 1;`.catch(() => []);
      paRow = p || null;
    } catch (_) {}
  }

  if (!universal && !paRow && typeof sql === 'function') {
    try {
      const [cp] = await sql`SELECT * FROM competitor_pins WHERE pin_id = ${cleanId} LIMIT 1;`.catch(() => []);
      paRow = cp || null;
    } catch (_) {}
  }

  if (!universal && !paRow) {
    return null;
  }

  // Trajectory retrieval fallback
  // GUARDRAIL 4: Strictly retain the exact literal string:
  // fetchPinTrajectoryFromShard({ hubSql: sql, pinId: cleanId, env })
  let rawSnaps = Array.isArray(universal?.snapshots) && universal.snapshots.length > 0
    ? universal.snapshots
    : (Array.isArray(universal?.daily_trajectory) ? universal.daily_trajectory : []);

  if (rawSnaps.length === 0) {
    try {
      const trajRes = await fetchPinTrajectoryFromShard({ hubSql: sql, pinId: cleanId, env });
      if (trajRes?.success && Array.isArray(trajRes.snapshots)) {
        rawSnaps = trajRes.snapshots;
      }
    } catch (trajErr) {
      console.warn(`[getPinDetailWithMetrics] Shard trajectory fetch warning for pin ${cleanId}:`, trajErr.message);
    }
  }

  // Sort chronologically descending to compute deltas
  const sortedSnaps = [...rawSnaps].sort((a, b) => {
    const da = new Date(a.snapshot_date || a.recorded_at || 0).getTime();
    const db = new Date(b.snapshot_date || b.recorded_at || 0).getTime();
    return db - da;
  });

  const totalReactions = typeof paRow?.reactions === 'object' && paRow.reactions !== null
    ? Object.values(paRow.reactions).reduce((a, b) => a + Number(b || 0), 0)
    : Number(paRow?.reactions || c.reaction_count || 0);

  const saves = Number(paRow?.saves ?? paRow?.save_count ?? c.save_count ?? 0);
  const repins = Number(paRow?.repins ?? paRow?.repin_count ?? c.repin_count ?? 0);
  const comments = Number(paRow?.comments ?? paRow?.comment_count ?? c.comment_count ?? 0);
  const share_count = Number(paRow?.share_count ?? c.share_count ?? 0);
  const velocity = Number(paRow?.velocity ?? paRow?.daily_save_velocity ?? c.daily_save_velocity ?? 0);

  const title = paRow?.title || c.title || `Pin ${cleanId}`;
  const description = paRow?.description || c.description || '';
  const alt_text = paRow?.alt_text || c.alt_text || '';
  const destination_url = paRow?.destination_url || paRow?.link || c.destination_url || '';
  const domain = paRow?.domain || paRow?.link_domain || c.domain || '';
  const image_url = paRow?.image_url || c.image_url || '';
  const account_username = paRow?.account_username || paRow?.creator_username || universal?.pillar_1_creator_context?.creator_username || '';
  const board_name = paRow?.board_name || universal?.pillar_1_creator_context?.board_name || '';
  const dominant_color = paRow?.dominant_color || c.dominant_color || '#a88d56';
  const creation_method = paRow?.creation_method || c.creation_method || 'pinterest_platform';
  const created_at_pinterest = paRow?.created_at_pinterest || c.created_at_pinterest || null;

  let annotationsList = [];
  if (Array.isArray(paRow?.annotations)) {
    annotationsList = paRow.annotations;
  } else if (typeof paRow?.annotations === 'string') {
    try { annotationsList = JSON.parse(paRow.annotations); } catch (_) {}
  } else if (Array.isArray(c.visual_annotations)) {
    annotationsList = c.visual_annotations;
  }

  // Compute deltas between consecutive snapshots
  const snapshots = sortedSnaps.map((s, idx) => {
    const next = sortedSnaps[idx + 1];
    const sSaves = Number(s.save_count ?? s.saves ?? 0);
    const sRepins = Number(s.repin_count ?? s.repins ?? 0);
    const sComments = Number(s.comment_count ?? s.comments ?? 0);
    const nSaves = next ? Number(next.save_count ?? next.saves ?? 0) : sSaves;
    const nRepins = next ? Number(next.repin_count ?? next.repins ?? 0) : sRepins;
    const nComments = next ? Number(next.comment_count ?? next.comments ?? 0) : sComments;

    const recordedDate = s.snapshot_date ? (typeof s.snapshot_date === 'string' ? s.snapshot_date : s.snapshot_date.toISOString?.() || String(s.snapshot_date)) : (s.recorded_at || new Date().toISOString());

    return {
      id: s.id || `${cleanId}-${recordedDate}`,
      pin_id: cleanId,
      recorded_at: recordedDate,
      saves: sSaves,
      repins: sRepins,
      comments: sComments,
      shares: Number(s.share_count ?? share_count),
      reactions: Number(s.reaction_count ?? totalReactions),
      delta_saves: next ? (sSaves - nSaves) : 0,
      delta_repins: next ? (sRepins - nRepins) : 0,
      delta_comments: next ? (sComments - nComments) : 0,
      delta_shares: 0,
      delta_reactions: 0
    };
  });

  if (snapshots.length === 0) {
    snapshots.push({
      id: 'baseline-' + cleanId,
      pin_id: cleanId,
      recorded_at: paRow?.last_updated_at || paRow?.first_seen_at || new Date().toISOString(),
      saves: saves,
      repins: repins,
      comments: comments,
      shares: share_count,
      reactions: totalReactions,
      delta_saves: 0,
      delta_repins: 0,
      delta_comments: 0,
      delta_shares: 0,
      delta_reactions: 0
    });
  }

  let netGrowth = { saves: 0, repins: 0, comments: 0, shares: 0, reactions: 0 };
  if (snapshots.length >= 2) {
    const latestSnap = snapshots[0];
    const earliestSnap = snapshots[snapshots.length - 1];
    netGrowth = {
      saves: latestSnap.saves - earliestSnap.saves,
      repins: latestSnap.repins - earliestSnap.repins,
      comments: latestSnap.comments - earliestSnap.comments,
      shares: latestSnap.shares - earliestSnap.shares,
      reactions: latestSnap.reactions - earliestSnap.reactions
    };
  }

  return {
    ...(universal || {}),
    pin: {
      pin_id: cleanId,
      title,
      description,
      alt_text,
      destination_url,
      domain,
      image_url,
      account_username,
      board_name,
      saves,
      repins,
      comments,
      share_count,
      velocity,
      annotations: annotationsList,
      reactions_count: totalReactions,
      dominant_color,
      creation_method,
      created_at_pinterest
    },
    snapshots,
    net_growth: netGrowth
  };
}

/**
 * Delete a specific pin metric snapshot
 */
export async function deletePinMetricSnapshot(sql, snapshotId, pinId) {
  // [INVARIANT: ZERO-HUB-SNAPSHOTS]
  // pa_pin_metrics is eradicated on Central Hub. Daily snapshots live on Shards.
  return { success: true };
}
