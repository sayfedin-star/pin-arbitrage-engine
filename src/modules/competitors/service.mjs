/**
 * Competitor Intelligence Service
 * Handles competitor profile crawling, 7-day velocity/delta calculation,
 * and pin catalog ingestion.
 */

import { formatPinterestCookie } from '../../utils.mjs';
import { fetchUserResource, fetchBoardsResource, fetchUserActivityPinsResource, fetchBoardFeedResource, sleep, randomJitterMs } from '../../../scripts/lib/pinterest.mjs';
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
      NOW(),
      NOW()
    )
    ON CONFLICT (username) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      avatar_url = COALESCE(EXCLUDED.avatar_url, competitor_profiles.avatar_url),
      monthly_reach = EXCLUDED.monthly_reach,
      reach_delta_7d = EXCLUDED.reach_delta_7d,
      profile_views = EXCLUDED.profile_views,
      views_delta_7d = EXCLUDED.views_delta_7d,
      total_pins = EXCLUDED.total_pins,
      total_boards = EXCLUDED.total_boards,
      follower_count = EXCLUDED.follower_count,
      activity_status = '1d ago',
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
        monthly_reach = EXCLUDED.monthly_reach,
        profile_views = EXCLUDED.profile_views,
        follower_count = EXCLUDED.follower_count,
        total_pins = EXCLUDED.total_pins,
        total_boards = EXCLUDED.total_boards;
    `;
  }

  return updated;
}

/**
 * Get all boards for a competitor
 */
export async function getCompetitorBoards(sql, competitorId) {
  let numericId = parseInt(competitorId, 10);
  if (isNaN(numericId) && competitorId) {
    const cleanUser = normalizePinterestUsername(competitorId);
    try {
      const [c] = await sql`SELECT id FROM competitor_profiles WHERE LOWER(username) = ${cleanUser} LIMIT 1;`;
      if (c?.id) numericId = c.id;
    } catch (_) {}
  }
  if (isNaN(numericId)) return [];

  return await sql`
    SELECT *
    FROM competitor_boards
    WHERE competitor_id = ${numericId}
    ORDER BY pin_count DESC;
  `;
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
    try {
      await sql`
        INSERT INTO competitor_boards (
          competitor_id,
          board_id,
          name,
          url,
          pin_count,
          follower_count,
          last_pinned_at,
          updated_at
        ) VALUES (
          ${numericId},
          ${b.board_id},
          ${b.name},
          ${b.url},
          ${b.pin_count},
          ${b.follower_count},
          ${lastPinnedDate},
          NOW()
        )
        ON CONFLICT (competitor_id, board_id) DO UPDATE SET
          name = EXCLUDED.name,
          url = EXCLUDED.url,
          pin_count = EXCLUDED.pin_count,
          follower_count = EXCLUDED.follower_count,
          last_pinned_at = EXCLUDED.last_pinned_at,
          updated_at = NOW();
      `;
      syncedCount++;
    } catch (bErr) {
      console.warn(`[syncCompetitorBoards] Skipped board ${b.board_id}:`, bErr.message);
    }
  }

  // Update total_boards on competitor profile
  await sql`
    UPDATE competitor_profiles
    SET total_boards = (SELECT count(*)::int FROM competitor_boards WHERE competitor_id = ${numericId}),
        updated_at = NOW()
    WHERE id = ${numericId};
  `;

  return { ok: true, synced: syncedCount, synced_boards_count: syncedCount, boards: res.boards };
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
export async function getCompetitorDetail(sql, competitorIdOrUsername, { generateIfEmpty = false } = {}) {
  const isNumeric = typeof competitorIdOrUsername === 'number' || (typeof competitorIdOrUsername === 'string' && /^\d+$/.test(competitorIdOrUsername.trim()));
  let numericId = isNumeric ? parseInt(competitorIdOrUsername, 10) : NaN;
  let cleanUsername = !isNumeric ? normalizePinterestUsername(competitorIdOrUsername) : null;

  let profile = null;
  if (!isNaN(numericId)) {
    const [pById] = await sql`SELECT * FROM competitor_profiles WHERE id = ${numericId} LIMIT 1;`;
    if (pById) {
      profile = pById;
      cleanUsername = normalizePinterestUsername(profile.username);
    }
  }

  if (!profile && cleanUsername) {
    const [pByUsername] = await sql`SELECT * FROM competitor_profiles WHERE LOWER(username) = ${cleanUsername} LIMIT 1;`;
    if (pByUsername) {
      profile = pByUsername;
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
      SELECT *
      FROM competitor_boards
      WHERE competitor_id = ${compId}
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

  // Fallback B: If still no boards, discover boards from competitor_pins
  if (boards.length === 0 && compId) {
    try {
      const rawBoards = await sql`
        SELECT 
          COALESCE(NULLIF(TRIM(board_name), ''), 'General') AS name,
          COUNT(*)::int AS pin_count,
          COALESCE(MAX(save_count), 0)::int AS follower_count,
          MAX(created_at_pinterest) AS last_pinned_at,
          MIN(created_at_pinterest) AS created_at
        FROM competitor_pins
        WHERE competitor_id = ${compId}
        GROUP BY name
        ORDER BY pin_count DESC;
      `;
      if (rawBoards.length > 0) {
        boards = rawBoards.map((b, idx) => ({
          id: idx + 1,
          board_id: 'cb-' + idx,
          name: b.name,
          url: `https://www.pinterest.com/${cleanUsername || profile.username}/${encodeURIComponent(b.name.toLowerCase().replace(/\s+/g, '-'))}/`,
          pin_count: b.pin_count,
          follower_count: b.follower_count,
          last_pinned_at: b.last_pinned_at,
          created_at: b.created_at
        }));
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

  return {
    profile: {
      ...profile,
      handle: `@${profile.username}`,
      monthly_reach: Number(profile.monthly_reach || 0),
      profile_views: Number(profile.profile_views || 0),
      follower_count: Number(profile.follower_count || 0),
      total_pins: Number(profile.total_pins || boards.reduce((acc, b) => acc + (b.pin_count || 0), 0) || 0),
      total_boards: Number(profile.total_boards || boards.length || 0),
      website_domain: profile.website_url ? profile.website_url.replace(/^https?:\/\//, '').replace(/\/.*$/, '') : null,
      verified_domain: Boolean(profile.website_url),
      notes: profile.bio || profile.metadata?.notes || 'No internal notes set for this competitor.',
      last_pin_date: latestPinDateStr
    },
    strategy_age: {
      days: strategyAgeDays,
      oldest_board_date: oldestBoardDateStr
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
  search = '',
  board = '',
  min_saves = 0,
  sort = 'saves_desc',
  page = 1,
  limit = 50,
  qualified_only = false
} = {}) {
  let numericId = parseInt(competitorIdOrUsername, 10);
  let cleanUsername = null;
  if (isNaN(numericId) || !numericId) {
    cleanUsername = normalizePinterestUsername(competitorIdOrUsername);
    const [c] = await sql`SELECT id, username FROM competitor_profiles WHERE LOWER(username) = ${cleanUsername} LIMIT 1;`;
    if (c) {
      numericId = c.id;
      cleanUsername = c.username;
    }
  } else {
    const [c] = await sql`SELECT id, username FROM competitor_profiles WHERE id = ${numericId} LIMIT 1;`;
    if (c) cleanUsername = c.username;
  }

  if (!numericId) {
    return { pins: [], total: 0, page: 1, limit, total_pages: 0, boards: [] };
  }

  const pNum = Math.max(1, parseInt(page, 10) || 1);
  const pLim = Math.max(1, Math.min(parseInt(limit, 10) || 50, 200));
  const offset = (pNum - 1) * pLim;

  const minSavesNum = Math.max(0, parseInt(min_saves, 10) || 0);
  const searchPattern = search ? `%${search.toLowerCase().trim()}%` : null;
  const boardPattern = board ? board.trim() : null;

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
      (pa.pin_id IS NOT NULL) AS is_qualified,
      COALESCE(pa.velocity, 0) AS velocity
    FROM competitor_pins cp
    LEFT JOIN pa_pins pa ON pa.pin_id = cp.pin_id
    WHERE cp.competitor_id = ${numericId}
      AND (${minSavesNum} = 0 OR cp.save_count >= ${minSavesNum})
      AND (${searchPattern}::text IS NULL OR LOWER(cp.title) LIKE ${searchPattern} OR LOWER(COALESCE(cp.description, '')) LIKE ${searchPattern})
      AND (${boardPattern}::text IS NULL OR cp.board_name = ${boardPattern})
      AND (${qualified_only} = FALSE OR pa.pin_id IS NOT NULL)
    ORDER BY 
      CASE WHEN ${sort} = 'saves_desc' THEN cp.save_count END DESC NULLS LAST,
      CASE WHEN ${sort} = 'repins_desc' THEN cp.repin_count END DESC NULLS LAST,
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
      AND (${boardPattern}::text IS NULL OR cp.board_name = ${boardPattern})
      AND (${qualified_only} = FALSE OR pa.pin_id IS NOT NULL);
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
      is_qualified: Boolean(r.is_qualified)
    })),
    total,
    page: pNum,
    limit: pLim,
    total_pages,
    boards: boardsRows
  };
}



