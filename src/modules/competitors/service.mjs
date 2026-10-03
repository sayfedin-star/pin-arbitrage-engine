/**
 * Competitor Intelligence Service
 * Handles competitor profile crawling, 7-day velocity/delta calculation,
 * and pin catalog ingestion.
 */

import { formatPinterestCookie } from '../../utils.mjs';
import { fetchUserResource, fetchBoardsResource, fetchBoardDetailUnauth, fetchUserActivityPinsResource, fetchBoardFeedResource, sleep, randomJitterMs } from '../../../scripts/lib/pinterest.mjs';
import { ingestPinsBatch, getQualificationRules } from '../pinarchive/service.mjs';

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

/**
 * Normalize Pinterest handle or full URL to clean username
 */
export function normalizePinterestUsername(input) {
  if (!input) return '';
  let str = String(input).trim();
  try {
    if (str.startsWith('http://') || str.startsWith('https://')) {
      const url = new URL(str);
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts.length > 0) return parts[0].replace(/^@/, '').toLowerCase();
    }
  } catch (_) {}
  str = str.replace(/^(?:https?:\/\/)?(?:www\.)?pinterest\.[a-z.]+\/+/i, '');
  return str.split('?')[0].split('#')[0].split('/')[0].replace(/^@+/, '').trim().toLowerCase();
}

/**
 * Get aggregated KPIs across all tracked competitor profiles
 */
export async function getCompetitorsOverview(sql) {
  const [totals] = await sql`
    SELECT
      COUNT(*)::int AS total_profiles,
      COUNT(CASE WHEN account_type = 'competitor' THEN 1 END)::int AS competitor_count,
      COUNT(CASE WHEN account_type = 'own' THEN 1 END)::int AS own_count,
      COALESCE(SUM(monthly_reach), 0)::bigint AS combined_reach,
      COALESCE(SUM(profile_views), 0)::bigint AS total_audience,
      COALESCE(SUM(total_pins), 0)::int AS total_pins_tracked
    FROM competitor_profiles
    WHERE is_active = TRUE;
  `;

  const [topProfile] = await sql`
    SELECT username, monthly_reach
    FROM competitor_profiles
    WHERE is_active = TRUE AND monthly_reach > 0
    ORDER BY monthly_reach DESC
    LIMIT 1;
  `;

  return {
    tracked_profiles: totals.total_profiles || 0,
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
}

/**
 * List tracked profiles with reach/view deltas and board stats
 */
export async function listCompetitors(sql, { account_type = 'all', search = '', limit = 50, offset = 0 } = {}) {
  let query;
  const lim = Math.max(1, Math.min(isNaN(Number(limit)) ? 50 : Number(limit), 200));
  const off = Math.max(0, isNaN(Number(offset)) ? 0 : Number(offset));
  const searchPattern = search ? `%${search.toLowerCase().replace('@', '')}%` : null;

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
}

/**
 * Track a new competitor handle
 */
export async function trackCompetitor(sql, { username, display_name, account_type = 'competitor' }) {
  const cleanUsername = normalizePinterestUsername(username);
  if (!cleanUsername) throw new Error('Username is required.');

  const [row] = await sql`
    INSERT INTO competitor_profiles (
      username,
      display_name,
      account_type,
      is_active,
      updated_at
    ) VALUES (
      ${cleanUsername},
      ${display_name || cleanUsername},
      ${account_type},
      TRUE,
      NOW()
    )
    ON CONFLICT (username) DO UPDATE SET
      account_type = EXCLUDED.account_type,
      is_active = TRUE,
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

  const reachDelta = prevSnapshot ? (monthlyReach - Number(prevSnapshot.monthly_reach || 0)) : 0;
  const viewsDelta = prevSnapshot ? (profileViews - Number(prevSnapshot.profile_views || 0)) : 0;

  const metaUpdate = {};
  if (res.account_created_at) metaUpdate.account_created_at = res.account_created_at;
  if (res.last_pin_save_time) metaUpdate.last_pin_save_time = res.last_pin_save_time;

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
      '1d ago',
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
      activity_status = '1d ago',
      metadata = COALESCE(competitor_profiles.metadata, '{}'::jsonb) || ${JSON.stringify(metaUpdate)}::jsonb,
      last_synced_at = NOW(),
      updated_at = NOW()
    RETURNING *;
  `;

  // Record daily history snapshot
  if (updated) {
    await sql`
      INSERT INTO competitor_history_snapshots (
        competitor_id,
        monthly_reach,
        profile_views,
        follower_count,
        total_pins,
        total_boards,
        recorded_date
      ) VALUES (
        ${updated.id},
        ${monthlyReach},
        ${profileViews},
        ${followers},
        ${totalPins},
        ${totalBoards},
        CURRENT_DATE
      )
      ON CONFLICT (competitor_id, recorded_date) DO UPDATE SET
        monthly_reach = CASE WHEN EXCLUDED.monthly_reach > 0 THEN EXCLUDED.monthly_reach ELSE competitor_history_snapshots.monthly_reach END,
        profile_views = CASE WHEN EXCLUDED.profile_views > 0 THEN EXCLUDED.profile_views ELSE competitor_history_snapshots.profile_views END,
        follower_count = CASE WHEN EXCLUDED.follower_count > 0 THEN EXCLUDED.follower_count ELSE competitor_history_snapshots.follower_count END,
        total_pins = GREATEST(competitor_history_snapshots.total_pins, EXCLUDED.total_pins),
        total_boards = GREATEST(competitor_history_snapshots.total_boards, EXCLUDED.total_boards);
    `;

    // Upsert any initial boards discovered directly from unauthenticated profile HTML
    if (Array.isArray(res.initial_boards) && res.initial_boards.length > 0) {
      for (const b of res.initial_boards) {
        try {
          await sql`
            INSERT INTO competitor_boards (
              competitor_id, board_id, name, url, pin_count, follower_count,
              last_pinned_at, updated_at
            ) VALUES (
              ${updated.id}, ${b.board_id}, ${b.name}, ${b.url},
              ${b.pin_count || 0}, ${b.follower_count || 0},
              ${b.last_pinned_at ? new Date(b.last_pinned_at) : null}, NOW()
            )
            ON CONFLICT (competitor_id, board_id) DO UPDATE SET
              name = EXCLUDED.name,
              url = EXCLUDED.url,
              pin_count = EXCLUDED.pin_count,
              follower_count = EXCLUDED.follower_count,
              last_pinned_at = COALESCE(EXCLUDED.last_pinned_at, competitor_boards.last_pinned_at),
              updated_at = NOW();
          `;
        } catch (_) {}
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

  // Always resolve local shard numeric ID by canonical username first:
  if (cleanUser) {
    try {
      const [c] = await sql`SELECT id, username FROM competitor_profiles WHERE LOWER(username) = ${cleanUser} LIMIT 1;`;
      if (c?.id) {
        numericId = c.id;
        cleanUser = c.username;
      }
    } catch (_) {}
  } else if (!isNaN(numericId)) {
    try {
      const [c] = await sql`SELECT id, username FROM competitor_profiles WHERE id = ${numericId} LIMIT 1;`;
      if (c?.username) {
        cleanUser = c.username;
      } else {
        numericId = null;
      }
    } catch (_) {}
  }
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
  } catch (_) {}

  // Discover & merge any additional boards from competitor_pins
  try {
    const rawBoards = await sql`
      SELECT 
        COALESCE(NULLIF(TRIM(board_name), ''), 'General') AS name,
        COUNT(*)::int AS pin_count,
        COALESCE(MAX(save_count), 0)::int AS follower_count,
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
          board_id: 'cb-' + (boards.length + 1),
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
  } catch (_) {}

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
        WHERE LOWER(REPLACE(account_username, '@', '')) = ${cleanUser}
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

  let syncedCount = 0;
  for (const b of res.boards) {
    if (!b.board_id || String(b.board_id).trim() === '' || b.board_id === 'undefined') continue;
    let lastPinnedDate = null;
    if (b.last_pinned_at) {
      const d = new Date(b.last_pinned_at);
      if (!isNaN(d.getTime())) lastPinnedDate = d;
    }
    let boardCreatedAt = null;
    if (b.created_at) {
      const cd = new Date(b.created_at);
      if (!isNaN(cd.getTime())) boardCreatedAt = cd;
    }
    const metadataObj = {
      image_cover_url: b.image_cover_url || b.metadata?.image_cover_url || null,
      board_vase: Array.isArray(b.board_vase) && b.board_vase.length > 0 ? b.board_vase : (Array.isArray(b.metadata?.board_vase) ? b.metadata.board_vase : []),
      description: b.description || b.metadata?.description || '',
      section_count: b.metadata?.section_count || 0,
      privacy: b.metadata?.privacy || 'public',
      is_collaborative: Boolean(b.metadata?.is_collaborative)
    };
    try {
      // Purge any legacy synthetic placeholder board for this name when inserting authentic board
      if (b.board_id && !String(b.board_id).startsWith('cb-')) {
        await sql`
          DELETE FROM competitor_boards
          WHERE competitor_id = ${numericId}
            AND board_id LIKE 'cb-%'
            AND LOWER(TRIM(name)) = LOWER(TRIM(${b.name}));
        `.catch(() => {});
      }

      await sql`
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
        ) VALUES (
          ${numericId},
          ${b.board_id},
          ${b.name},
          ${b.url},
          ${b.pin_count},
          ${b.follower_count},
          ${lastPinnedDate},
          ${JSON.stringify(metadataObj)}::jsonb,
          COALESCE(${boardCreatedAt}, NOW()),
          NOW()
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
    } catch (bErr) {
      console.warn(`[syncCompetitorBoards] Skipped board ${b.board_id}:`, bErr.message);
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
                LOWER(TRIM(name)) = LOWER(TRIM(${scraped.name || ''}))
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
export async function syncCompetitorPins(sql, competitorId, username, { mode = 'daily', maxPages = null, cookie = '' } = {}) {
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

  const rules = await getQualificationRules(sql);
  if (rules.master_ingest_enabled === false) {
    return { ok: false, error: 'Master Ingest is currently disabled in Pin Qualification Rules.' };
  }

  // Enforce paused_policy: reject if competitor is inactive
  const safeId = isNaN(numericId) ? -1 : numericId;
  const [profile] = await sql`
    SELECT id, username, is_active FROM competitor_profiles 
    WHERE id = ${safeId} OR LOWER(username) = ${cleanUsername} 
    LIMIT 1;
  `;
  if (profile && profile.is_active === false && String(rules.paused_policy).toLowerCase() === 'reject') {
    return { ok: false, error: `Competitor @${cleanUsername} is paused/inactive and paused_policy is set to 'reject'.` };
  }

  // Determine pagination depth based on mode (strictly bounds daily mode to rules.early_stop_pages)
  const numMaxPages = (maxPages !== null && maxPages !== undefined && !isNaN(Number(maxPages)) && Number(maxPages) > 0)
    ? Number(maxPages)
    : null;
  let pageLimit = Number(rules.early_stop_pages) || 3;
  if (mode === 'all' || mode === 'full') {
    pageLimit = numMaxPages ? Math.min(numMaxPages, 500) : 100;
  } else if (mode === 'deep' || mode === 'discovery') {
    pageLimit = numMaxPages ? Math.min(numMaxPages, 500) : (Number(rules.discovery_max_pages) || 500);
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
    if (pins.length > 0) {
      const ingestRes = await ingestPinsBatch(sql, pins, cleanUsername, { filterQualified: true, rules });
      allQualifiedCount += (ingestRes.added + ingestRes.updated);
    }

    currentBookmark = res.nextBookmark;
    if (!currentBookmark || currentBookmark === '-end-' || currentBookmark === lastSeenBookmark) break; // End of feed
    lastSeenBookmark = currentBookmark;

    // Inject jitter delay between pages to absorb Pinterest 429 rate limits (Rule 6 compliant)
    if (page < pageLimit) {
      await sleep(randomJitterMs(2500, 4000));
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
          coalesce(max(cp.save_count), 0)::int,
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
    SET last_harvest_metadata = ${JSON.stringify(harvestMeta)}::jsonb,
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
export async function syncCompetitorBoardPins(sql, competitorId, username, board, { maxPages = 50, cookie = '' } = {}) {
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

  if (!cleanUsername) throw new Error('Username is required to sync board pins');

  const boardId = String(board?.board_id || board?.id || '').trim();
  const boardName = String(board?.name || 'Untitled Board').trim();
  let boardUrl = String(board?.url || '').trim();

  if (!boardUrl) {
    boardUrl = `/${cleanUsername}/${encodeURIComponent(boardName.toLowerCase().replace(/\s+/g, '-'))}/`;
  }

  const rules = await getQualificationRules(sql);
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
    if (pins.length > 0) {
      const ingestRes = await ingestPinsBatch(sql, pins, cleanUsername, { filterQualified: true, rules });
      allQualifiedCount += (ingestRes.added + ingestRes.updated);
    }

    currentBookmark = res.nextBookmark;
    if (!currentBookmark || currentBookmark === '-end-' || currentBookmark === lastSeenBookmark) break;
    lastSeenBookmark = currentBookmark;

    if (page < pageLimit) {
      await sleep(randomJitterMs(2500, 4000));
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
            (SELECT MIN(created_at_pinterest) FROM pa_pins WHERE LOWER(REPLACE(account_username, '@', '')) = ${cleanUsername} AND LOWER(TRIM(board_name)) = LOWER(TRIM(cb.name))),
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
          COALESCE(MAX(saves), 0)::int AS follower_count,
          MAX(created_at_pinterest) AS last_pinned_at,
          MIN(created_at_pinterest) AS created_at
        FROM pa_pins
        WHERE LOWER(REPLACE(account_username, '@', '')) = ${cleanUsername}
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
          COALESCE(MAX(save_count), 0)::int AS follower_count,
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
        WHERE LOWER(REPLACE(account_username, '@', '')) = ${cleanUsername}
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
        WHERE LOWER(REPLACE(account_username, '@', '')) = ${cleanUsername};
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
        WHERE LOWER(REPLACE(account_username, '@', '')) = ${cleanUsername} AND COALESCE(created_at_pinterest, first_seen_at) IS NOT NULL;
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
      SELECT id, competitor_id, monthly_reach, profile_views, follower_count, total_pins, total_boards, recorded_date, created_at
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

  // 5. Compute Pinning Velocity
  let pinningVelocity = '0.0';
  let pinsAdded = 0;
  let daysSpan = 1;
  let pacingEstimate = 0;

  if (snapshots.length >= 2) {
    const earliest = snapshots[0];
    const latest = snapshots[snapshots.length - 1];
    const dEarliest = new Date(earliest.recorded_date || earliest.created_at).getTime();
    const dLatest = new Date(latest.recorded_date || latest.created_at).getTime();
    daysSpan = Math.max(1, Math.round((dLatest - dEarliest) / 86400000));
    pinsAdded = Math.max(0, (Number(latest.total_pins) || 0) - (Number(earliest.total_pins) || 0));
    pinningVelocity = (pinsAdded / daysSpan).toFixed(1);
    pacingEstimate = Math.round((pinsAdded / daysSpan) * 30);
  } else if (cleanUsername) {
    try {
      const [pinStats] = await sql`
        SELECT 
          COUNT(*)::int AS cnt,
          MIN(COALESCE(created_at_pinterest, first_seen_at)) AS earliest,
          MAX(COALESCE(created_at_pinterest, first_seen_at)) AS latest
        FROM pa_pins
        WHERE LOWER(REPLACE(account_username, '@', '')) = ${cleanUsername};
      `;
      if (pinStats && pinStats.cnt > 0) {
        pinsAdded = pinStats.cnt;
        daysSpan = pinStats.earliest && pinStats.latest ? Math.max(1, Math.round((new Date(pinStats.latest).getTime() - new Date(pinStats.earliest).getTime()) / 86400000)) : 1;
        pinningVelocity = (pinsAdded / daysSpan).toFixed(1);
        pacingEstimate = Math.round((pinsAdded / daysSpan) * 30);
      }
    } catch (_) {}
  }

  if (pinningVelocity === '0.0' && compId) {
    try {
      const [rawStats] = await sql`
        SELECT 
          COUNT(*)::int AS cnt,
          MIN(COALESCE(created_at_pinterest, first_seen_at)) AS earliest,
          MAX(COALESCE(created_at_pinterest, first_seen_at)) AS latest
        FROM competitor_pins
        WHERE competitor_id = ${compId};
      `;
      if (rawStats && rawStats.cnt > 0) {
        pinsAdded = rawStats.cnt;
        daysSpan = rawStats.earliest && rawStats.latest ? Math.max(1, Math.round((new Date(rawStats.latest).getTime() - new Date(rawStats.earliest).getTime()) / 86400000)) : 1;
        pinningVelocity = (pinsAdded / daysSpan).toFixed(1);
        pacingEstimate = Math.round((pinsAdded / daysSpan) * 30);
      }
    } catch (_) {}
  }

  let latestPinDateStr = '—';
  if (cleanUsername) {
    const [latestPin] = await sql`
      SELECT MAX(created_at_pinterest) AS max_date
      FROM pa_pins
      WHERE LOWER(REPLACE(account_username, '@', '')) = ${cleanUsername};
    `;
    if (latestPin && latestPin.max_date) {
      latestPinDateStr = new Date(latestPin.max_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
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
        WHERE LOWER(REPLACE(account_username, '@', '')) = ${cleanUsername};
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
    if (currSaves > 0 && prevSaves > 0) {
      deltaSaves24h = currSaves - prevSaves;
    }
    const currRepins = Number(curr.metadata?.total_repins || 0);
    const prevRepins = Number(prev.metadata?.total_repins || 0);
    if (currRepins > 0 && prevRepins > 0) {
      deltaRepins24h = currRepins - prevRepins;
    }
  }

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
    sql`
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
      pacing_estimate: pacingEstimate
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
  let saved = 0;
  for (const p of pins) {
    const pinId = String(p.pin_id || p.id || '').trim();
    if (!pinId) continue;
    try {
      await sql`
        INSERT INTO competitor_pins (
          competitor_id,
          pin_id,
          title,
          description,
          link_domain,
          destination_url,
          board_name,
          image_url,
          save_count,
          repin_count,
          comment_count,
          is_product,
          created_at_pinterest,
          first_seen_at,
          last_seen_at
        ) VALUES (
          ${competitorId},
          ${pinId},
          ${p.title || ''},
          ${p.description || ''},
          ${p.domain || ''},
          ${p.link || ''},
          ${p.board_name || ''},
          ${p.image_url || ''},
          ${Math.max(0, Number(p.saves) || 0)},
          ${Math.max(0, Number(p.repins) || 0)},
          ${Math.max(0, Number(p.comments) || 0)},
          ${Boolean(p.is_product)},
          ${p.created_at_pinterest ? new Date(p.created_at_pinterest) : null},
          NOW(),
          NOW()
        )
        ON CONFLICT (competitor_id, pin_id) DO UPDATE SET
          title = CASE WHEN EXCLUDED.title <> '' THEN EXCLUDED.title ELSE competitor_pins.title END,
          description = CASE WHEN EXCLUDED.description <> '' THEN EXCLUDED.description ELSE competitor_pins.description END,
          destination_url = CASE WHEN EXCLUDED.destination_url <> '' THEN EXCLUDED.destination_url ELSE competitor_pins.destination_url END,
          link_domain = CASE WHEN EXCLUDED.link_domain <> '' THEN EXCLUDED.link_domain ELSE competitor_pins.link_domain END,
          board_name = CASE WHEN EXCLUDED.board_name <> '' THEN EXCLUDED.board_name ELSE competitor_pins.board_name END,
          image_url = CASE WHEN EXCLUDED.image_url <> '' THEN EXCLUDED.image_url ELSE competitor_pins.image_url END,
          save_count = GREATEST(competitor_pins.save_count, EXCLUDED.save_count),
          repin_count = GREATEST(competitor_pins.repin_count, EXCLUDED.repin_count),
          comment_count = GREATEST(competitor_pins.comment_count, EXCLUDED.comment_count),
          is_product = (competitor_pins.is_product OR EXCLUDED.is_product),
          last_seen_at = NOW();
      `;
      saved++;
    } catch (err) {
      console.warn(`[upsertCompetitorPins] Failed to insert pin ${pinId}:`, err.message);
    }
  }
  return saved;
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
  product_only = false
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
    return { pins: [], total: 0, page: 1, limit, total_pages: 0, boards: [] };
  }

  const pNum = Math.max(1, parseInt(page, 10) || 1);
  const pLim = Math.max(1, Math.min(parseInt(limit, 10) || 50, 1000));
  const offset = (pNum - 1) * pLim;

  const minSavesNum = Math.max(0, parseInt(min_saves, 10) || 0);
  const searchPattern = search ? `%${search.toLowerCase().trim()}%` : null;
  const boardPattern = (board && board.trim()) ? board.trim().toLowerCase() : null;

  const boardsRows = await sql`
    SELECT DISTINCT board_name, COUNT(*)::int as count
    FROM competitor_pins
    WHERE competitor_id = ${numericId} AND board_name IS NOT NULL AND board_name <> ''
    GROUP BY board_name
    ORDER BY count DESC;
  `;

  const rows = await sql`
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
      cp.save_count,
      cp.repin_count,
      cp.comment_count,
      cp.created_at_pinterest,
      cp.first_seen_at,
      cp.last_seen_at,
      (
        COALESCE(cp.is_product, false) OR 
        COALESCE(pa.is_product, false) OR 
        COALESCE(cp.link_domain ILIKE '%etsy%' OR cp.link_domain ILIKE '%shopify%' OR cp.link_domain ILIKE '%amazon%' OR cp.destination_url ILIKE '%/listing/%' OR cp.destination_url ILIKE '%/product/%' OR cp.destination_url ILIKE '%/item/%' OR cp.destination_url ILIKE '%gumroad.com%', false)
      ) AS is_product,
      (pa.pin_id IS NOT NULL) AS is_qualified,
      COALESCE(pa.velocity, 0) AS velocity
    FROM competitor_pins cp
    LEFT JOIN pa_pins pa ON pa.pin_id = cp.pin_id
    WHERE cp.competitor_id = ${numericId}
      AND (${minSavesNum} = 0 OR cp.save_count >= ${minSavesNum})
      AND (${searchPattern}::text IS NULL OR LOWER(cp.title) LIKE ${searchPattern} OR LOWER(COALESCE(cp.description, '')) LIKE ${searchPattern})
      AND (
        ${boardPattern}::text IS NULL OR 
        LOWER(TRIM(cp.board_name)) = ${boardPattern} OR
        REPLACE(LOWER(TRIM(cp.board_name)), '-', ' ') = REPLACE(${boardPattern}, '-', ' ') OR
        REPLACE(LOWER(TRIM(cp.board_name)), ' ', '-') = REPLACE(${boardPattern}, ' ', '-') OR
        REPLACE(REPLACE(LOWER(TRIM(cp.board_name)), '-', ''), ' ', '') = REPLACE(REPLACE(${boardPattern}, '-', ''), ' ', '')
      )
      AND (${qualified_only} = FALSE OR pa.pin_id IS NOT NULL)
      AND (${product_only} = FALSE OR (
        COALESCE(cp.is_product, false) OR 
        COALESCE(pa.is_product, false) OR 
        COALESCE(cp.link_domain ILIKE '%etsy%' OR cp.link_domain ILIKE '%shopify%' OR cp.link_domain ILIKE '%amazon%' OR cp.destination_url ILIKE '%/listing/%' OR cp.destination_url ILIKE '%/product/%' OR cp.destination_url ILIKE '%/item/%' OR cp.destination_url ILIKE '%gumroad.com%', false)
      ) = TRUE)
    ORDER BY 
      CASE WHEN ${sort} = 'saves_desc' THEN cp.save_count END DESC NULLS LAST,
      CASE WHEN ${sort} = 'repins_desc' THEN cp.repin_count END DESC NULLS LAST,
      CASE WHEN ${sort} = 'velocity' OR ${sort} = 'velocity_desc' THEN COALESCE(pa.velocity, 0) END DESC NULLS LAST,
      CASE WHEN ${sort} = 'comments' OR ${sort} = 'comments_desc' THEN cp.comment_count END DESC NULLS LAST,
      CASE WHEN ${sort} = 'newest' THEN cp.created_at_pinterest END DESC NULLS LAST,
      CASE WHEN ${sort} = 'oldest' THEN cp.created_at_pinterest END ASC NULLS LAST,
      cp.save_count DESC
    LIMIT ${pLim} OFFSET ${offset};
  `;

  const [countRow] = await sql`
    SELECT COUNT(*)::int as total
    FROM competitor_pins cp
    LEFT JOIN pa_pins pa ON pa.pin_id = cp.pin_id
    WHERE cp.competitor_id = ${numericId}
      AND (${minSavesNum} = 0 OR cp.save_count >= ${minSavesNum})
      AND (${searchPattern}::text IS NULL OR LOWER(cp.title) LIKE ${searchPattern} OR LOWER(COALESCE(cp.description, '')) LIKE ${searchPattern})
      AND (
        ${boardPattern}::text IS NULL OR 
        LOWER(TRIM(cp.board_name)) = ${boardPattern} OR
        REPLACE(LOWER(TRIM(cp.board_name)), '-', ' ') = REPLACE(${boardPattern}, '-', ' ') OR
        REPLACE(LOWER(TRIM(cp.board_name)), ' ', '-') = REPLACE(${boardPattern}, ' ', '-') OR
        REPLACE(REPLACE(LOWER(TRIM(cp.board_name)), '-', ''), ' ', '') = REPLACE(REPLACE(${boardPattern}, '-', ''), ' ', '')
      )
      AND (${qualified_only} = FALSE OR pa.pin_id IS NOT NULL)
      AND (${product_only} = FALSE OR (
        COALESCE(cp.is_product, false) OR 
        COALESCE(pa.is_product, false) OR 
        COALESCE(cp.link_domain ILIKE '%etsy%' OR cp.link_domain ILIKE '%shopify%' OR cp.link_domain ILIKE '%amazon%' OR cp.destination_url ILIKE '%/listing/%' OR cp.destination_url ILIKE '%/product/%' OR cp.destination_url ILIKE '%/item/%' OR cp.destination_url ILIKE '%gumroad.com%', false)
      ) = TRUE);
  `;

  const total = countRow ? countRow.total : 0;
  const total_pages = Math.ceil(total / pLim);

  return {
    pins: rows.map(r => ({
      ...r,
      saves: Number(r.save_count || 0),
      repins: Number(r.repin_count || 0),
      comments: Number(r.comment_count || 0),
      velocity: Number(r.velocity || 0),
      is_product: Boolean(r.is_product),
      is_qualified: Boolean(r.is_qualified)
    })),
    total,
    page: pNum,
    limit: pLim,
    total_pages,
    boards: boardsRows
  };
}



