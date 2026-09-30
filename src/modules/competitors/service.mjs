/**
 * Competitor Intelligence Service
 * Handles competitor profile crawling, 7-day velocity/delta calculation,
 * and pin catalog ingestion.
 */

import { formatPinterestCookie } from '../../utils.mjs';
import { fetchBoardsResource, fetchUserActivityPinsResource, sleep, randomJitterMs } from '../../../scripts/lib/pinterest.mjs';
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
  const searchPattern = search ? `%${search.toLowerCase().replace('@', '')}%` : null;

  if (account_type && account_type !== 'all') {
    if (searchPattern) {
      query = await sql`
        SELECT *
        FROM competitor_profiles
        WHERE account_type = ${account_type}
          AND (LOWER(username) LIKE ${searchPattern} OR LOWER(COALESCE(display_name, '')) LIKE ${searchPattern})
        ORDER BY monthly_reach DESC
        LIMIT ${limit} OFFSET ${offset};
      `;
    } else {
      query = await sql`
        SELECT *
        FROM competitor_profiles
        WHERE account_type = ${account_type}
        ORDER BY monthly_reach DESC
        LIMIT ${limit} OFFSET ${offset};
      `;
    }
  } else {
    if (searchPattern) {
      query = await sql`
        SELECT *
        FROM competitor_profiles
        WHERE (LOWER(username) LIKE ${searchPattern} OR LOWER(COALESCE(display_name, '')) LIKE ${searchPattern})
        ORDER BY monthly_reach DESC
        LIMIT ${limit} OFFSET ${offset};
      `;
    } else {
      query = await sql`
        SELECT *
        FROM competitor_profiles
        ORDER BY monthly_reach DESC
        LIMIT ${limit} OFFSET ${offset};
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
  const cleanUsername = username.trim().toLowerCase().replace('@', '');
  if (!cleanUsername) throw new Error('Username is required.');

  const [row] = await sql`
    INSERT INTO competitor_profiles (
      username,
      display_name,
      account_type,
      is_active,
      last_synced_at,
      updated_at
    ) VALUES (
      ${cleanUsername},
      ${display_name || cleanUsername},
      ${account_type},
      TRUE,
      NOW(),
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
  const cleanUsername = username.trim().toLowerCase().replace('@', '');
  const url = `https://www.pinterest.com/resource/UserResource/get/?source_url=%2F${cleanUsername}%2F&data=%7B%22options%22%3A%7B%22username%22%3A%22${cleanUsername}%22%2C%22field_set_key%22%3A%22profile%22%7D%2C%22context%22%3A%7B%7D%7D`;

  const headers = {
    'Accept': 'application/json, text/javascript, */*, q=0.01',
    'X-Requested-With': 'XMLHttpRequest',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    'Referer': `https://www.pinterest.com/${cleanUsername}/`
  };
  if (cookie) {
    headers['Cookie'] = formatPinterestCookie(cookie);
  }

  const res = await fetch(url, { headers, signal: AbortSignal.timeout(9000) });
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(`Competitor @${cleanUsername} does not exist or was renamed on Pinterest.`);
    } else if (res.status === 429) {
      throw new Error(`Pinterest rate limit reached (HTTP 429). Please wait a moment before syncing again.`);
    } else if (res.status === 403) {
      throw new Error(`Pinterest access denied (HTTP 403). Consider updating your PINTEREST_COOKIE in Settings.`);
    }
    throw new Error(`Pinterest API returned HTTP ${res.status} for @${cleanUsername}`);
  }

  const data = await res.json();
  const user = data?.resource_response?.data;
  if (!user) throw new Error(`Could not parse UserResource data for @${cleanUsername}`);

  const monthlyReach = Number(user.profile_reach || user.profile_views || user.monthly_views || 0);
  const profileViews = Number(user.profile_views || user.profile_reach || user.monthly_views || 0);
  const totalPins = Number(user.pin_count || 0);
  const totalBoards = Number(user.board_count || 0);
  const followers = Number(user.follower_count || 0);
  const avatarUrl = user.image_xlarge_url || user.image_medium_url || null;
  const displayName = user.full_name || cleanUsername;

  // Retrieve previous snapshot to calculate 7d deltas
  const [prevSnapshot] = await sql`
    SELECT monthly_reach, profile_views
    FROM competitor_history_snapshots
    WHERE competitor_id = (SELECT id FROM competitor_profiles WHERE username = ${cleanUsername})
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
  const numericId = parseInt(competitorId, 10);
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
  const numericId = parseInt(competitorId, 10);
  if (isNaN(numericId) || !username) {
    throw new Error('Invalid competitorId or username');
  }

  const cleanUsername = username.replace('@', '').trim();
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
  const cleanUsername = String(username || '').replace(/^@/, '').trim().toLowerCase();
  if (!cleanUsername) throw new Error('Username is required');

  const rules = await getQualificationRules(sql);
  if (rules.master_ingest_enabled === false) {
    return { ok: false, error: 'Master Ingest is currently disabled in Pin Qualification Rules.' };
  }

  // Determine pagination depth based on mode
  let pageLimit = rules.early_stop_pages || 3;
  if (mode === 'deep') {
    pageLimit = maxPages ? Math.min(Number(maxPages), rules.discovery_max_pages || 500) : (rules.discovery_max_pages || 500);
  } else if (maxPages) {
    pageLimit = Math.min(Number(maxPages), 50);
  }

  const formattedCookie = formatPinterestCookie(cookie);

  let currentBookmark = null;
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

    // Filter through 3-tier OR qualification rules & ingest qualified winning pins into pa_pins
    if (pins.length > 0) {
      const ingestRes = await ingestPinsBatch(sql, pins, cleanUsername, { filterQualified: true, rules });
      allQualifiedCount += (ingestRes.added + ingestRes.updated);
    }

    currentBookmark = res.nextBookmark;
    if (!currentBookmark || currentBookmark === '-end-') break; // End of feed

    // Inject jitter delay between pages to absorb Pinterest 429 rate limits
    if (page < pageLimit) {
      await sleep(randomJitterMs(1500, 3000));
    }
  }

  // Update harvest metadata on competitor profile without clobbering total_pins published catalog
  const numericId = parseInt(competitorId, 10);
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
