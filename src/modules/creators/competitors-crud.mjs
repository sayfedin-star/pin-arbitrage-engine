/**
 * Competitors CRUD, Profile Sync, Rules & Seeds Service
 * Split from src/modules/creators/service.mjs (Layer 1 — Zero internal creator-module deps)
 */

import { formatPinterestCookie, escapeSqlWildcards } from '../../utils.mjs';
import {
  fetchUserResource,
  PINTEREST_CEILING_VALUE,
  normalizeCeilingMetric,
  sanitizeCeilingDelta,
  sanitizeStoredCeilingDelta
} from '../../core/pinterest/index.mjs';
import { DEFAULT_WORKSPACE_ID, resolveActivePinterestCookie } from '../workspaces/service.mjs';
import { pruneOrphanCandidateGraphNodes } from '../related-pins/graph-writer.mjs';

export const GLOBAL_QUALIFICATION_RULES_KEY = 'pin_qualification_rules';
export const PROTECTED_CREATOR_ACCOUNT_TYPES = new Set(['own', 'my_account', 'system']);
export { PINTEREST_CEILING_VALUE, normalizeCeilingMetric, sanitizeCeilingDelta, sanitizeStoredCeilingDelta };


/**
 * Pure canonical predicate identifying permanently dead competitor accounts
 * whose synced Pinterest telemetry resolves to (Total Audience = 0, Impressions = 0)
 * OR (Total Audience = 1, Impressions = 1).
 *
 * Strictly preserves:
 *  - Own / my_account / system profiles
 *  - Unsynced profiles awaiting initial telemetry
 *  - Asymmetric profiles with real impressions or audience (e.g. 1/424208, 1/47, 1/0)
 */
export function isDeadZeroOrOneCreator({
  monthly_reach = 0,
  profile_views = 0,
  account_type = 'competitor',
  last_synced_at = null,
  is_synced = undefined
} = {}) {
  const normalizedType = String(account_type || 'competitor').trim().toLowerCase();
  if (PROTECTED_CREATOR_ACCOUNT_TYPES.has(normalizedType)) return false;

  const synced = is_synced !== undefined ? Boolean(is_synced) : Boolean(last_synced_at);
  if (!synced) return false;

  const reach = Number(monthly_reach ?? 0);
  const views = Number(profile_views ?? 0);
  if (!Number.isFinite(reach) || !Number.isFinite(views)) return false;

  return (reach === 0 && views === 0) || (reach === 1 && views === 1);
}


/**
 * Atomically and permanently purges synced non-own/non-system competitor profiles
 * matching (monthly_reach = 0 AND profile_views = 0) OR (monthly_reach = 1 AND profile_views = 1),
 * cascading all child tables and cleaning matching creator workspace_watchlist rows.
 */
export async function pruneDeadZeroOneCreators(sql, { competitorIds = null } = {}) {
  if (!sql) return { deleted_count: 0, deleted_ids: [], deleted_usernames: [], deleted_watchlist_count: 0 };

  const scopedIds = Array.isArray(competitorIds)
    ? [...new Set(competitorIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))]
    : null;
  if (Array.isArray(competitorIds) && scopedIds.length === 0) {
    return { deleted_count: 0, deleted_ids: [], deleted_usernames: [], deleted_watchlist_count: 0 };
  }

  const runInTx = async (fn) => (typeof sql?.begin === 'function' ? sql.begin(fn) : fn(sql));
  let deletedRows = [];
  let deletedWatchlistCount = 0;

  await runInTx(async (tx) => {
    const doomedRows = scopedIds
      ? await tx`
          SELECT id, username
          FROM competitor_profiles
          WHERE id = ANY(${scopedIds}::int[])
            AND COALESCE(account_type, 'competitor') NOT IN ('own', 'my_account', 'system')
            AND (
              (COALESCE(monthly_reach, 0) = 0 AND COALESCE(profile_views, 0) = 0)
              OR (COALESCE(monthly_reach, 0) = 1 AND COALESCE(profile_views, 0) = 1)
            );
        `
      : await tx`
          SELECT id, username
          FROM competitor_profiles
          WHERE last_synced_at IS NOT NULL
            AND COALESCE(account_type, 'competitor') NOT IN ('own', 'my_account', 'system')
            AND (
              (COALESCE(monthly_reach, 0) = 0 AND COALESCE(profile_views, 0) = 0)
              OR (COALESCE(monthly_reach, 0) = 1 AND COALESCE(profile_views, 0) = 1)
            );
        `;

    if (!Array.isArray(doomedRows) || doomedRows.length === 0) {
      return;
    }

    const idsToDelete = doomedRows.map((r) => Number(r.id)).filter((id) => Number.isInteger(id) && id > 0);
    const usernamesToDelete = [...new Set(
      doomedRows.map((r) => normalizePinterestUsername(r.username)).filter(Boolean)
    )];

    const execOptionalCleanup = async (spName, fn) => {
      const canSavepoint = typeof tx?.unsafe === 'function';
      if (canSavepoint) await tx.unsafe(`SAVEPOINT ${spName};`);
      try {
        const res = await fn();
        if (canSavepoint) await tx.unsafe(`RELEASE SAVEPOINT ${spName};`);
        return res;
      } catch (err) {
        if (canSavepoint) await tx.unsafe(`ROLLBACK TO SAVEPOINT ${spName};`);
        const code = String(err?.code || '');
        const msg = String(err?.message || '');
        if (code === '42P01' || code === '42703' || /does\s+not\s+exist/i.test(msg)) {
          return [];
        }
        throw err;
      }
    };

    if (idsToDelete.length > 0) {
      const deletedSeeds = await tx`
        DELETE FROM competitor_seed_pins
        WHERE competitor_id = ANY(${idsToDelete}::int[])
        RETURNING pin_id;
      `.catch((err) => {
        if (String(err?.code || '') === '42P01') return [];
        throw err;
      });
      if (Array.isArray(deletedSeeds) && deletedSeeds.length > 0) {
        await pruneOrphanCandidateGraphNodes(tx, deletedSeeds.map((r) => r.pin_id));
      }

      await execOptionalCleanup('sp_prune_dead_rookies', () => tx`
        UPDATE newborn_rookie_accounts
        SET promoted_competitor_id = NULL, updated_at = NOW()
        WHERE promoted_competitor_id = ANY(${idsToDelete}::int[]);
      `);

      if (usernamesToDelete.length > 0) {
        const wwDeleted = await execOptionalCleanup('sp_prune_dead_watchlist', () => tx`
          DELETE FROM workspace_watchlist
          WHERE entity_type = 'creator'
            AND LOWER(LTRIM(BTRIM(entity_key), '@')) = ANY(${usernamesToDelete}::text[])
          RETURNING id;
        `);
        deletedWatchlistCount = Array.isArray(wwDeleted) ? wwDeleted.length : 0;
      }

      deletedRows = await tx`
        DELETE FROM competitor_profiles
        WHERE id = ANY(${idsToDelete}::int[])
        RETURNING id, username;
      `;
    }
  });

  return {
    deleted_count: Array.isArray(deletedRows) ? deletedRows.length : 0,
    deleted_ids: (Array.isArray(deletedRows) ? deletedRows : []).map((r) => Number(r.id)),
    deleted_usernames: (Array.isArray(deletedRows) ? deletedRows : [])
      .map((r) => normalizePinterestUsername(r.username))
      .filter(Boolean),
    deleted_watchlist_count: deletedWatchlistCount
  };
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
  'board-idea', 'board-ideas', 'domains', 'folders', 'folder',
  'campaign-folders', 'discovery', 'board', 'boards', 'feed',
  'newborn'
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
        -- [INVARIANT: PINTEREST-BUSINESS-ANALYTICS-PARITY]
        -- Align metrics with official Pinterest analytics: monthly_reach -> Total audience, profile_views -> Impressions
        COALESCE(SUM(monthly_reach), 0)::bigint AS total_audience,
        COALESCE(SUM(profile_views), 0)::bigint AS total_impressions,
        COALESCE(SUM(monthly_reach), 0)::bigint AS combined_reach,
        COALESCE(SUM(total_pins), 0)::bigint AS total_pins_tracked
      FROM competitor_profiles
      WHERE COALESCE(account_type, 'competitor') <> 'system';
    `;
    const totals = totalsRes?.[0] || {};

    const topProfileRes = await sql`
      SELECT username, monthly_reach
      FROM competitor_profiles
      WHERE monthly_reach > 0
        AND COALESCE(account_type, 'competitor') <> 'system'
      ORDER BY monthly_reach DESC
      LIMIT 1;
    `;
    const topProfile = topProfileRes?.[0] || null;

    return {
      tracked_profiles: Number(totals.total_profiles ?? totals.tracked_profiles ?? 0),
      active_count: totals.active_count || 0,
      paused_count: totals.paused_count || 0,
      competitor_count: totals.competitor_count || 0,
      own_count: totals.own_count || 0,
      total_audience: Number(totals.total_audience || 0),
      total_impressions: Number(totals.total_impressions || 0),
      combined_reach: Number(totals.combined_reach || totals.total_audience || 0),
      pins_tracked: Number(totals.total_pins_tracked ?? totals.pins_tracked ?? 0),
      top_competitor: topProfile ? {
        handle: `@${topProfile.username}`,
        reach: formatMetric(topProfile.monthly_reach, true)
      } : null
    };
  } catch (err) {
    console.warn('[getCompetitorsOverview] Query failed:', err.message);
    throw err;
  }
}


/**
 * List tracked profiles with reach/view deltas and board stats
 */
export async function listCompetitors(sql, { account_type = 'all', search = '', limit = 1000, offset = 0 } = {}) {
  try {
    let query;
    const lim = Math.max(1, Math.min(isNaN(Number(limit)) ? 1000 : Number(limit), 5000));
    const off = Math.max(0, isNaN(Number(offset)) ? 0 : Number(offset));
    const cleanSearch = (search && typeof search === 'string' && search.trim()) ? escapeSqlWildcards(search.toLowerCase().replace('@', '').trim()) : null;
    const searchPattern = cleanSearch ? `%${cleanSearch}%` : null;

    if (account_type && account_type !== 'all') {
      if (searchPattern) {
        query = await sql`
          SELECT
            id, username, display_name, avatar_url, website_url,
            account_type, is_active, tracking_mode, source_folder_id, custom_label,
            monthly_reach, delta_reach_24h, reach_delta_7d,
            profile_views, delta_views_24h, views_delta_7d,
            total_pins, delta_pins_24h, pins_delta_7d,
            total_boards, delta_boards_24h, boards_delta_7d,
            follower_count, activity_status, last_synced_at, updated_at, created_at
          FROM competitor_profiles
          WHERE COALESCE(account_type, 'competitor') <> 'system'
            AND account_type = ${account_type}
            AND (LOWER(username) LIKE ${searchPattern} ESCAPE '\\' OR LOWER(COALESCE(display_name, '')) LIKE ${searchPattern} ESCAPE '\\')
          ORDER BY monthly_reach DESC
          LIMIT ${lim} OFFSET ${off};
        `;
      } else {
        query = await sql`
          SELECT
            id, username, display_name, avatar_url, website_url,
            account_type, is_active, tracking_mode, source_folder_id, custom_label,
            monthly_reach, delta_reach_24h, reach_delta_7d,
            profile_views, delta_views_24h, views_delta_7d,
            total_pins, delta_pins_24h, pins_delta_7d,
            total_boards, delta_boards_24h, boards_delta_7d,
            follower_count, activity_status, last_synced_at, updated_at, created_at
          FROM competitor_profiles
          WHERE COALESCE(account_type, 'competitor') <> 'system'
            AND account_type = ${account_type}
          ORDER BY monthly_reach DESC
          LIMIT ${lim} OFFSET ${off};
        `;
      }
    } else {
      if (searchPattern) {
        query = await sql`
          SELECT
            id, username, display_name, avatar_url, website_url,
            account_type, is_active, tracking_mode, source_folder_id, custom_label,
            monthly_reach, delta_reach_24h, reach_delta_7d,
            profile_views, delta_views_24h, views_delta_7d,
            total_pins, delta_pins_24h, pins_delta_7d,
            total_boards, delta_boards_24h, boards_delta_7d,
            follower_count, activity_status, last_synced_at, updated_at, created_at
          FROM competitor_profiles
          WHERE COALESCE(account_type, 'competitor') <> 'system'
            AND (LOWER(username) LIKE ${searchPattern} ESCAPE '\\' OR LOWER(COALESCE(display_name, '')) LIKE ${searchPattern} ESCAPE '\\')
          ORDER BY monthly_reach DESC
          LIMIT ${lim} OFFSET ${off};
        `;
      } else {
        query = await sql`
          SELECT
            id, username, display_name, avatar_url, website_url,
            account_type, is_active, tracking_mode, source_folder_id, custom_label,
            monthly_reach, delta_reach_24h, reach_delta_7d,
            profile_views, delta_views_24h, views_delta_7d,
            total_pins, delta_pins_24h, pins_delta_7d,
            total_boards, delta_boards_24h, boards_delta_7d,
            follower_count, activity_status, last_synced_at, updated_at, created_at
          FROM competitor_profiles
          WHERE COALESCE(account_type, 'competitor') <> 'system'
          ORDER BY monthly_reach DESC
          LIMIT ${lim} OFFSET ${off};
        `;
      }
    }

    if (!Array.isArray(query)) return [];

    return query.map(p => {
      const mReach = Number(p.monthly_reach || 0);
      const dReach24h = sanitizeStoredCeilingDelta(mReach, p.delta_reach_24h);
      const dReach7d = sanitizeStoredCeilingDelta(mReach, p.reach_delta_7d);

      const pViews = Number(p.profile_views || 0);
      const dViews24h = sanitizeStoredCeilingDelta(pViews, p.delta_views_24h);
      const dViews7d = sanitizeStoredCeilingDelta(pViews, p.views_delta_7d);

      return {
        ...p,
        handle: `@${p.username}`,
        monthly_reach: mReach,
        delta_reach_24h: dReach24h,
        reach_delta_7d: dReach7d,
        profile_views: pViews,
        delta_views_24h: dViews24h,
        views_delta_7d: dViews7d,
        total_pins: Number(p.total_pins || 0),
        delta_pins_24h: Number(p.delta_pins_24h || 0),
        pins_delta_7d: Number(p.pins_delta_7d || 0),
        total_boards: Number(p.total_boards || 0),
        delta_boards_24h: Number(p.delta_boards_24h || 0),
        boards_delta_7d: Number(p.boards_delta_7d || 0),
        follower_count: Number(p.follower_count || 0)
      };
    });
  } catch (err) {
    console.warn('[listCompetitors] Query failed:', err.message);
    throw err;
  }
}


/**
 * Track a new competitor handle
 */
export async function trackCompetitor(sql, { username, display_name, account_type = 'competitor', is_active = true, auto_archive_winning = true, tracking_mode = null }) {
  const cleanUsername = normalizePinterestUsername(username);
  if (!cleanUsername) throw new Error('Username is required.');
  if (cleanUsername.startsWith('__system_')) throw new Error('Reserved system profile.');

  const resolvedTrackingMode = (tracking_mode === 'pulse_only' || tracking_mode === 'full')
    ? tracking_mode
    : 'full';
  const metaPayload = {
    auto_archive_winning: auto_archive_winning !== false,
    ...(resolvedTrackingMode === 'pulse_only' ? { profile_pulse_only: true } : {})
  };

  const [row] = await sql`
    INSERT INTO competitor_profiles (
      username,
      display_name,
      account_type,
      tracking_mode,
      is_active,
      metadata,
      updated_at
    ) VALUES (
      ${cleanUsername},
      ${display_name || cleanUsername},
      ${account_type},
      ${resolvedTrackingMode},
      ${is_active !== false},
      ${JSON.stringify(metaPayload)}::jsonb,
      NOW()
    )
    ON CONFLICT (username) DO UPDATE SET
      account_type = EXCLUDED.account_type,
      tracking_mode = COALESCE(NULLIF(${tracking_mode || ''}, ''), competitor_profiles.tracking_mode, EXCLUDED.tracking_mode),
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
export async function syncCompetitorProfile(sql, username, cookie = '', options = {}) {
  if (typeof cookie === 'object' && cookie !== null) {
    options = cookie;
    cookie = '';
  }
  options = options || {};

  const cleanUsername = normalizePinterestUsername(username);
  if (!cleanUsername) throw new Error('Username is required.');

  const [existingProfile] = await sql`
    SELECT id, account_type, tracking_mode, custom_label, source_folder_id,
           avatar_url, display_name, monthly_reach, profile_views,
           total_pins, total_boards, follower_count,
           (metadata->>'profile_pulse_only')::boolean AS profile_pulse_only
    FROM competitor_profiles
    WHERE username = ${cleanUsername}
    LIMIT 1;
  `;

  const isPulseOnly = Boolean(
    options.pulseOnly ||
    options.tracking_mode === 'pulse_only' ||
    existingProfile?.tracking_mode === 'pulse_only' ||
    existingProfile?.profile_pulse_only === true ||
    existingProfile?.metadata?.profile_pulse_only === true
  );

  let resolvedCookie = typeof cookie === 'string' ? cookie.trim() : '';
  if (!resolvedCookie && !options.disableGlobalCookieFallback) {
    const active = await resolveActivePinterestCookie(sql, {
      workspaceId: options.workspaceId || DEFAULT_WORKSPACE_ID,
      env: options.env || null
    }).catch(() => ({ rawCookie: '' }));
    resolvedCookie = active?.rawCookie || '';
  }
  const formattedCookie = formatPinterestCookie(resolvedCookie);
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

  const rawReach = Number(res.monthly_reach ?? res.total_audience ?? 0);
  const rawViews = Number(res.profile_views ?? res.monthly_views ?? 0);
  const rawPins = Number(res.total_pins ?? res.pin_count ?? 0);
  const rawBoards = Number(res.total_boards ?? res.board_count ?? 0);
  const rawFollowers = Number(res.follower_count ?? 0);
  const avatarUrl = res.avatar_url || existingProfile?.avatar_url || null;
  const displayName = res.display_name || existingProfile?.display_name || cleanUsername;

  // [INVARIANT: PINTEREST-10M-CEILING-GUARD & ZERO-DROP-SHIELD]
  // Never overwrite positive historical metrics with transient 0 values or unauthenticated 10,000,001 caps.
  const prevExistingReach = Number(existingProfile?.monthly_reach || 0);
  const prevExistingViews = Number(existingProfile?.profile_views || 0);
  const prevExistingPins = Number(existingProfile?.total_pins || 0);
  const prevExistingBoards = Number(existingProfile?.total_boards || 0);
  const prevExistingFollowers = Number(existingProfile?.follower_count || 0);

  let monthlyReach = normalizeCeilingMetric(rawReach, prevExistingReach);
  let profileViews = normalizeCeilingMetric(rawViews, prevExistingViews);
  const totalPins = rawPins > 0 ? Math.max(rawPins, prevExistingPins) : prevExistingPins;
  const totalBoards = rawBoards > 0 ? Math.max(rawBoards, prevExistingBoards) : prevExistingBoards;
  const followers = rawFollowers > 0 ? rawFollowers : prevExistingFollowers;

  // Permanently prune synced competitor accounts whose resolved telemetry is strictly (0, 0) or (1, 1)
  const effectiveAccountType = existingProfile?.account_type || options.account_type || 'competitor';
  if (isDeadZeroOrOneCreator({
    monthly_reach: monthlyReach,
    profile_views: profileViews,
    account_type: effectiveAccountType,
    is_synced: true
  })) {
    if (existingProfile?.id) {
      await deleteCompetitor(sql, existingProfile.id);
    }
    return {
      pruned: true,
      deleted: true,
      username: cleanUsername,
      monthly_reach: monthlyReach,
      profile_views: profileViews,
      reason: 'DEAD_ZERO_OR_ONE_CREATOR'
    };
  }

  // [INVARIANT: LIGHTWEIGHT-CREATOR-PULSE]
  // 1. Query prior 24h snapshot and 7d baseline in 1 single roundtrip via CTE
  let prior24h = null;
  let baseline7d = null;
  if (existingProfile?.id) {
    const [historyRow] = await sql`
      WITH p24 AS (
        SELECT monthly_reach, profile_views, total_pins, total_boards, recorded_date
        FROM competitor_history_snapshots
        WHERE competitor_id = ${existingProfile.id}
          AND recorded_date < CURRENT_DATE
        ORDER BY recorded_date DESC
        LIMIT 1
      ),
      b7d AS (
        SELECT monthly_reach, profile_views, total_pins, total_boards, recorded_date
        FROM competitor_history_snapshots
        WHERE competitor_id = ${existingProfile.id}
          AND recorded_date <= CURRENT_DATE - INTERVAL '6 days'
        ORDER BY recorded_date DESC
        LIMIT 1
      ),
      earliest AS (
        SELECT monthly_reach, profile_views, total_pins, total_boards, recorded_date
        FROM competitor_history_snapshots
        WHERE competitor_id = ${existingProfile.id}
          AND recorded_date < CURRENT_DATE
        ORDER BY recorded_date ASC
        LIMIT 1
      )
      SELECT
        (SELECT row_to_json(p24) FROM p24) AS prior_24h,
        COALESCE((SELECT row_to_json(b7d) FROM b7d), (SELECT row_to_json(earliest) FROM earliest)) AS baseline_7d;
    `;
    prior24h = historyRow?.prior_24h || null;
    baseline7d = historyRow?.baseline_7d || null;
  }

  const priorReach = Number(prior24h?.monthly_reach || 0);
  const priorViews = Number(prior24h?.profile_views || 0);
  const baselineReach = Number(baseline7d?.monthly_reach || 0);
  const baselineViews = Number(baseline7d?.profile_views || 0);

  if (rawReach === PINTEREST_CEILING_VALUE) {
    monthlyReach = normalizeCeilingMetric(rawReach, monthlyReach, priorReach, baselineReach);
  }
  if (rawViews === PINTEREST_CEILING_VALUE) {
    profileViews = normalizeCeilingMetric(rawViews, profileViews, priorViews, baselineViews);
  }

  const deltaReach24h = prior24h ? sanitizeCeilingDelta(monthlyReach, priorReach, rawReach) : 0;
  const deltaViews24h = prior24h ? sanitizeCeilingDelta(profileViews, priorViews, rawViews) : 0;
  const deltaPins24h = (prior24h && totalPins > 0) ? (totalPins - Number(prior24h.total_pins || 0)) : 0;
  const deltaBoards24h = (prior24h && totalBoards > 0) ? (totalBoards - Number(prior24h.total_boards || 0)) : 0;

  const reachDelta7d = baseline7d ? sanitizeCeilingDelta(monthlyReach, baselineReach, rawReach) : 0;
  const viewsDelta7d = baseline7d ? sanitizeCeilingDelta(profileViews, baselineViews, rawViews) : 0;
  const pinsDelta7d = (baseline7d && totalPins > 0) ? (totalPins - Number(baseline7d.total_pins || 0)) : 0;
  const boardsDelta7d = (baseline7d && totalBoards > 0) ? (totalBoards - Number(baseline7d.total_boards || 0)) : 0;

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

  const effectiveTrackingMode = options.tracking_mode || (isPulseOnly ? 'pulse_only' : 'full');
  const effectiveCustomLabel = options.custom_label || existingProfile?.custom_label || '';
  const effectiveSourceFolderId = options.source_folder_id || existingProfile?.source_folder_id || null;

  // Atomic Upsert: ensures profile is created even if sync is called before tracking
  const [updated] = await sql`
    INSERT INTO competitor_profiles (
      username,
      display_name,
      avatar_url,
      monthly_reach,
      delta_reach_24h,
      reach_delta_7d,
      profile_views,
      delta_views_24h,
      views_delta_7d,
      total_pins,
      delta_pins_24h,
      pins_delta_7d,
      total_boards,
      delta_boards_24h,
      boards_delta_7d,
      follower_count,
      activity_status,
      account_type,
      tracking_mode,
      custom_label,
      source_folder_id,
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
      ${deltaReach24h},
      ${reachDelta7d},
      ${profileViews},
      ${deltaViews24h},
      ${viewsDelta7d},
      ${totalPins},
      ${deltaPins24h},
      ${pinsDelta7d},
      ${totalBoards},
      ${deltaBoards24h},
      ${boardsDelta7d},
      ${followers},
      ${activityStatus},
      'competitor',
      ${effectiveTrackingMode},
      ${effectiveCustomLabel},
      ${effectiveSourceFolderId},
      NOW(),
      TRUE,
      ${JSON.stringify(metaUpdate)}::jsonb,
      NOW(),
      NOW()
    )
    ON CONFLICT (username) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      avatar_url = COALESCE(EXCLUDED.avatar_url, competitor_profiles.avatar_url),
      monthly_reach = CASE 
        WHEN EXCLUDED.monthly_reach = ${PINTEREST_CEILING_VALUE} AND competitor_profiles.monthly_reach > ${PINTEREST_CEILING_VALUE} THEN competitor_profiles.monthly_reach
        WHEN EXCLUDED.monthly_reach > 0 THEN EXCLUDED.monthly_reach 
        ELSE competitor_profiles.monthly_reach 
      END,
      delta_reach_24h = EXCLUDED.delta_reach_24h,
      reach_delta_7d = EXCLUDED.reach_delta_7d,
      profile_views = CASE 
        WHEN EXCLUDED.profile_views = ${PINTEREST_CEILING_VALUE} AND competitor_profiles.profile_views > ${PINTEREST_CEILING_VALUE} THEN competitor_profiles.profile_views
        WHEN EXCLUDED.profile_views > 0 THEN EXCLUDED.profile_views 
        ELSE competitor_profiles.profile_views 
      END,
      delta_views_24h = EXCLUDED.delta_views_24h,
      views_delta_7d = EXCLUDED.views_delta_7d,
      total_pins = GREATEST(competitor_profiles.total_pins, EXCLUDED.total_pins),
      delta_pins_24h = EXCLUDED.delta_pins_24h,
      pins_delta_7d = EXCLUDED.pins_delta_7d,
      total_boards = GREATEST(competitor_profiles.total_boards, EXCLUDED.total_boards),
      delta_boards_24h = EXCLUDED.delta_boards_24h,
      boards_delta_7d = EXCLUDED.boards_delta_7d,
      follower_count = CASE WHEN EXCLUDED.follower_count > 0 THEN EXCLUDED.follower_count ELSE competitor_profiles.follower_count END,
      activity_status = ${activityStatus},
      tracking_mode = COALESCE(NULLIF(EXCLUDED.tracking_mode, ''), competitor_profiles.tracking_mode),
      custom_label = CASE WHEN competitor_profiles.custom_label IS NULL OR competitor_profiles.custom_label = '' THEN EXCLUDED.custom_label ELSE competitor_profiles.custom_label END,
      source_folder_id = COALESCE(competitor_profiles.source_folder_id, EXCLUDED.source_folder_id),
      metadata = COALESCE(competitor_profiles.metadata, '{}'::jsonb) || ${JSON.stringify(metaUpdate)}::jsonb,
      last_synced_at = NOW(),
      updated_at = NOW()
    RETURNING
      id, username, display_name, avatar_url, website_url,
      monthly_reach, reach_delta_7d, delta_reach_24h,
      profile_views, views_delta_7d, delta_views_24h,
      follower_count,
      total_pins, pins_delta_7d, delta_pins_24h,
      total_boards, boards_delta_7d, delta_boards_24h,
      activity_status, account_type, tracking_mode, custom_label, source_folder_id, is_active,
      last_synced_at, created_at, updated_at,
      (metadata->>'profile_pulse_only')::boolean AS profile_pulse_only;
  `;

  // Record daily history snapshot
  if (updated) {
    let pinAgg = {
      total_saves: 0,
      total_repins: 0,
      delta_reach_24h: deltaReach24h,
      reach_delta_7d: reachDelta7d,
      delta_views_24h: deltaViews24h,
      views_delta_7d: viewsDelta7d,
      delta_pins_24h: deltaPins24h,
      pins_delta_7d: pinsDelta7d,
      delta_boards_24h: deltaBoards24h,
      boards_delta_7d: boardsDelta7d
    };

    if (!isPulseOnly) {
      try {
        const [agg] = await sql`
          SELECT COALESCE(SUM(ump.save_count), 0)::bigint AS total_saves, COALESCE(SUM(ump.repin_count), 0)::bigint AS total_repins
          FROM competitor_board_pins cbp
          JOIN universal_master_pins ump ON ump.pin_id = cbp.pin_id
          WHERE cbp.competitor_id = ${updated.id};
        `;
        if (agg) {
          pinAgg.total_saves = Number(agg.total_saves || 0);
          pinAgg.total_repins = Number(agg.total_repins || 0);
        }
      } catch (_) {}
    }

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
        monthly_reach = CASE 
          WHEN EXCLUDED.monthly_reach = ${PINTEREST_CEILING_VALUE} AND competitor_history_snapshots.monthly_reach > ${PINTEREST_CEILING_VALUE} THEN competitor_history_snapshots.monthly_reach
          WHEN EXCLUDED.monthly_reach > 0 THEN EXCLUDED.monthly_reach 
          ELSE competitor_history_snapshots.monthly_reach 
        END,
        profile_views = CASE 
          WHEN EXCLUDED.profile_views = ${PINTEREST_CEILING_VALUE} AND competitor_history_snapshots.profile_views > ${PINTEREST_CEILING_VALUE} THEN competitor_history_snapshots.profile_views
          WHEN EXCLUDED.profile_views > 0 THEN EXCLUDED.profile_views 
          ELSE competitor_history_snapshots.profile_views 
        END,
        follower_count = CASE WHEN EXCLUDED.follower_count > 0 THEN EXCLUDED.follower_count ELSE competitor_history_snapshots.follower_count END,
        total_pins = GREATEST(competitor_history_snapshots.total_pins, EXCLUDED.total_pins),
        total_boards = GREATEST(competitor_history_snapshots.total_boards, EXCLUDED.total_boards),
        metadata = COALESCE(competitor_history_snapshots.metadata, '{}'::jsonb) || ${JSON.stringify(pinAgg)}::jsonb
      WHERE 
        competitor_history_snapshots.monthly_reach IS DISTINCT FROM EXCLUDED.monthly_reach
        OR competitor_history_snapshots.profile_views IS DISTINCT FROM EXCLUDED.profile_views
        OR competitor_history_snapshots.follower_count IS DISTINCT FROM EXCLUDED.follower_count
        OR competitor_history_snapshots.total_pins IS DISTINCT FROM EXCLUDED.total_pins
        OR competitor_history_snapshots.total_boards IS DISTINCT FROM EXCLUDED.total_boards;
    `;

    // Self-heal any corrupted 0-metric historical snapshots for this competitor (only when we have positive metrics)
    const healReach = Number(updated.monthly_reach || monthlyReach || 0);
    const healViews = Number(updated.profile_views || profileViews || 0);
    const healPins = Number(updated.total_pins || totalPins || 0);
    const healBoards = Number(updated.total_boards || totalBoards || 0);
    if (healReach > 0 || healViews > 0 || healPins > 0 || healBoards > 0) {
      await sql`
        UPDATE competitor_history_snapshots
        SET
          monthly_reach = CASE WHEN monthly_reach = 0 AND ${healReach} > 0 THEN ${healReach} ELSE monthly_reach END,
          profile_views = CASE WHEN profile_views = 0 AND ${healViews} > 0 THEN ${healViews} ELSE profile_views END,
          total_pins = CASE WHEN total_pins = 0 AND ${healPins} > 0 THEN ${healPins} ELSE total_pins END,
          total_boards = CASE WHEN total_boards = 0 AND ${healBoards} > 0 THEN ${healBoards} ELSE total_boards END
        WHERE competitor_id = ${updated.id}
          AND (
            (monthly_reach = 0 AND ${healReach} > 0)
            OR (profile_views = 0 AND ${healViews} > 0)
            OR (total_pins = 0 AND ${healPins} > 0)
            OR (total_boards = 0 AND ${healBoards} > 0)
          );
      `.catch(() => {});
    }

    // Atomic batch upsert for initial boards via jsonb_to_recordset (1 single roundtrip instead of N queries)
    // Strictly skipped when pulse_only is active
    if (!isPulseOnly && Array.isArray(res.initial_boards) && res.initial_boards.length > 0) {
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
 * Delete a competitor profile and cascade cleanup across all child tables
 * (competitor_board_pins, competitor_boards, competitor_history_snapshots,
 * competitor_seed_pins, folder_competitor_items), orphan-safe pruning
 * unreferenced candidate_graph_nodes edges, plus stray empty-username rows.
 */
export async function deleteCompetitor(sql, idOrUsername) {
  if (!sql) throw new Error('Database client is required');
  const raw = String(idOrUsername ?? '').trim();
  const isNumeric = /^\d+$/.test(raw);
  const numId = isNumeric ? parseInt(raw, 10) : NaN;
  const cleanUser = !isNumeric ? normalizePinterestUsername(raw) : '';

  const runInTx = async (fn) => (typeof sql?.begin === 'function' ? sql.begin(fn) : fn(sql));
  let targetUsername = cleanUser;
  let targetId = (!isNaN(numId) && numId > 0) ? numId : null;

  await runInTx(async (tx) => {
    let targetProfile = null;
    if (!isNaN(numId) && numId > 0) {
      const [row] = await tx`
        SELECT id, username FROM competitor_profiles WHERE id = ${numId} LIMIT 1;
      `;
      targetProfile = row || { id: numId, username: '' };
    } else if (cleanUser) {
      const [row] = await tx`
        SELECT id, username FROM competitor_profiles WHERE LOWER(username) = ${cleanUser} LIMIT 1;
      `;
      targetProfile = row || { id: null, username: cleanUser };
    }

    targetId = targetProfile?.id ? Number(targetProfile.id) : (!isNaN(numId) && numId > 0 ? numId : null);
    targetUsername = cleanUser || (targetProfile?.username ? normalizePinterestUsername(targetProfile.username) : '');

    const execOptionalCleanup = async (spName, fn) => {
      const canSavepoint = typeof tx?.unsafe === 'function';
      if (canSavepoint) await tx.unsafe(`SAVEPOINT ${spName};`);
      try {
        await fn();
        if (canSavepoint) await tx.unsafe(`RELEASE SAVEPOINT ${spName};`);
      } catch (err) {
        if (canSavepoint) await tx.unsafe(`ROLLBACK TO SAVEPOINT ${spName};`);
        const code = String(err?.code || '');
        const msg = String(err?.message || '');
        if (code === '42P01' || code === '42703' || /does\s+not\s+exist/i.test(msg)) {
          return;
        }
        throw err;
      }
    };

    if (targetId) {
      await tx`DELETE FROM competitor_board_pins WHERE competitor_id = ${targetId};`;
      await tx`DELETE FROM competitor_boards WHERE competitor_id = ${targetId};`;
      await tx`DELETE FROM competitor_history_snapshots WHERE competitor_id = ${targetId};`;
      const deletedSeeds = await tx`
        DELETE FROM competitor_seed_pins
        WHERE competitor_id = ${targetId}
        RETURNING pin_id;
      `;
      if (Array.isArray(deletedSeeds) && deletedSeeds.length > 0) {
        await pruneOrphanCandidateGraphNodes(tx, deletedSeeds.map(r => r.pin_id));
      }
      await tx`DELETE FROM folder_competitor_items WHERE competitor_id = ${targetId};`;
      await execOptionalCleanup('sp_rookie_unlink', () => tx`
        UPDATE newborn_rookie_accounts
        SET promoted_competitor_id = NULL, updated_at = NOW()
        WHERE promoted_competitor_id = ${targetId};
      `);
    }

    if (targetUsername) {
      await execOptionalCleanup('sp_watchlist_creator_del', () => tx`
        DELETE FROM workspace_watchlist
        WHERE entity_type = 'creator' AND LOWER(entity_key) = ${targetUsername};
      `);
      await tx`DELETE FROM competitor_profiles WHERE LOWER(username) = ${targetUsername};`;
    }
    if (targetId) {
      await tx`DELETE FROM competitor_profiles WHERE id = ${targetId};`;
    }

    // Also purge any stray corrupted rows with empty usernames
    await tx`DELETE FROM competitor_profiles WHERE username IS NULL OR TRIM(username) = '';`;
  });

  return {
    ok: true,
    deleted: targetUsername || targetId
  };
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
  auto_pipeline: true,

  max_pages: 500,
  early_stop_pages: 3
};

/**
 * Canonical Single Source of Truth (SSOT) for parsing and normalizing Pin Qualification Rules
 * across global settings, per-competitor overrides, pin qualification, and fleet auto-promotion.
 *
 * @param {object|null|undefined} rawRules
 * @param {object} [options]
 * @param {object} [options.base] - Optional base rule values merged beneath `rawRules`
 * @param {boolean} [options.deriveTiersFromSaves=false] - Derive omitted tier2_min_repins & tier3_min_saves from tier1_min_saves
 * @param {number} [options.minVelocityFloor=0] - Minimum floor for tier2_min_velocity (e.g. 0.1 on persistence)
 * @param {boolean} [options.defaultArticlesOnly=false] - Default articles_only when omitted
 * @returns {object}
 */
export function resolveQualificationRules(rawRules = {}, options = {}) {
  const input = (rawRules && typeof rawRules === 'object') ? rawRules : {};
  const base = (options.base && typeof options.base === 'object') ? options.base : {};
  const deriveTiersFromSaves = Boolean(options.deriveTiersFromSaves);
  const minVelocityFloor = Number.isFinite(Number(options.minVelocityFloor)) ? Number(options.minVelocityFloor) : 0;

  const minSaves = parseRuleNumber(
    input.tier1_min_saves ?? input.min_saves ?? base.tier1_min_saves ?? base.min_saves,
    STANDARD_QUALIFICATION_DEFAULTS.tier1_min_saves,
    0
  );

  const defaultTier2Repins = deriveTiersFromSaves
    ? Math.max(STANDARD_QUALIFICATION_DEFAULTS.tier2_min_repins, minSaves)
    : (base.tier2_min_repins ?? STANDARD_QUALIFICATION_DEFAULTS.tier2_min_repins);
  const tier2Repins = parseRuleNumber(
    input.tier2_min_repins ?? input.min_repins ?? (deriveTiersFromSaves ? undefined : base.tier2_min_repins),
    defaultTier2Repins,
    0
  );

  const tier2Velocity = parseRuleNumber(
    input.tier2_min_velocity ?? input.min_velocity ?? base.tier2_min_velocity ?? base.min_velocity,
    STANDARD_QUALIFICATION_DEFAULTS.tier2_min_velocity,
    minVelocityFloor
  );

  const tier2MaxAgeDays = parseRuleNumber(
    input.tier2_max_age_days ?? base.tier2_max_age_days,
    STANDARD_QUALIFICATION_DEFAULTS.tier2_max_age_days,
    1
  );

  const tier2MinShares = parseRuleNumber(
    input.tier2_min_shares ?? base.tier2_min_shares,
    STANDARD_QUALIFICATION_DEFAULTS.tier2_min_shares,
    0
  );

  const tier3FreshDays = parseRuleNumber(
    input.tier3_fresh_days ?? input.tier3_max_age_days ?? base.tier3_fresh_days ?? base.tier3_max_age_days,
    STANDARD_QUALIFICATION_DEFAULTS.tier3_max_age_days,
    1
  );

  const defaultTier3Saves = deriveTiersFromSaves
    ? Math.min(minSaves, Math.max(25, Math.floor(minSaves / 2)))
    : (base.tier3_min_saves ?? STANDARD_QUALIFICATION_DEFAULTS.tier3_min_saves);
  const tier3MinSaves = parseRuleNumber(
    input.tier3_min_saves ?? input.fresh_min_saves ?? (deriveTiersFromSaves ? undefined : base.tier3_min_saves),
    defaultTier3Saves,
    0
  );

  const rawMasterEnabled = input.master_ingest_enabled !== undefined
    ? input.master_ingest_enabled
    : (input.cron_enabled !== undefined
      ? input.cron_enabled
      : (base.master_ingest_enabled !== undefined ? base.master_ingest_enabled : true));
  const masterIngestEnabled = Boolean(rawMasterEnabled);

  const articlesOnly = input.articles_only !== undefined
    ? Boolean(input.articles_only)
    : (base.articles_only !== undefined ? Boolean(base.articles_only) : Boolean(options.defaultArticlesOnly));
  const excludeProductPins = Boolean(input.exclude_product_pins ?? base.exclude_product_pins ?? false);

  const autoPipeline = input.auto_pipeline !== undefined
    ? Boolean(input.auto_pipeline)
    : (base.auto_pipeline !== undefined ? Boolean(base.auto_pipeline) : STANDARD_QUALIFICATION_DEFAULTS.auto_pipeline);

  const earlyStopPages = parseRuleNumber(
    input.early_stop_pages ?? base.early_stop_pages,
    STANDARD_QUALIFICATION_DEFAULTS.early_stop_pages,
    1
  );
  const maxPages = parseRuleNumber(
    input.max_pages ?? base.max_pages,
    STANDARD_QUALIFICATION_DEFAULTS.max_pages,
    1
  );
  const maxBatchPins = parseRuleNumber(
    input.max_batch_pins ?? base.max_batch_pins,
    500,
    10
  );
  const discoveryMaxPages = parseRuleNumber(
    input.discovery_max_pages ?? base.discovery_max_pages,
    500,
    1
  );
  const refreshMaxPins = parseRuleNumber(
    input.refresh_max_pins ?? base.refresh_max_pins,
    0,
    0
  );
  const pausedPolicy = String(input.paused_policy ?? base.paused_policy ?? 'reject');

  return {
    tier1_min_saves: minSaves,
    tier2_min_repins: tier2Repins,
    tier2_min_velocity: tier2Velocity,
    tier2_max_age_days: tier2MaxAgeDays,
    tier2_min_shares: tier2MinShares,
    tier3_fresh_days: tier3FreshDays,
    tier3_max_age_days: tier3FreshDays,
    tier3_min_saves: tier3MinSaves,
    articles_only: articlesOnly,
    exclude_product_pins: excludeProductPins,
    auto_pipeline: autoPipeline,
    master_ingest_enabled: masterIngestEnabled,
    cron_enabled: masterIngestEnabled,
    max_pages: maxPages,
    early_stop_pages: earlyStopPages,
    max_batch_pins: maxBatchPins,
    discovery_max_pages: discoveryMaxPages,
    refresh_max_pins: refreshMaxPins,
    paused_policy: pausedPolicy
  };
}

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

  const resolved = resolveQualificationRules(row.rules || {}, {
    base: STANDARD_QUALIFICATION_DEFAULTS,
    defaultArticlesOnly: true
  });

  return {
    competitor_id: row.id,
    username: row.username,
    rules: {
      ...STANDARD_QUALIFICATION_DEFAULTS,
      ...(row.rules || {}),
      tier1_min_saves: resolved.tier1_min_saves,
      tier2_min_repins: resolved.tier2_min_repins,
      tier2_min_velocity: resolved.tier2_min_velocity,
      tier2_max_age_days: resolved.tier2_max_age_days,
      tier2_min_shares: resolved.tier2_min_shares,
      tier3_fresh_days: resolved.tier3_fresh_days,
      tier3_max_age_days: resolved.tier3_max_age_days,
      tier3_min_saves: resolved.tier3_min_saves,
      articles_only: resolved.articles_only,
      auto_pipeline: resolved.auto_pipeline,
      max_pages: resolved.max_pages,
      early_stop_pages: resolved.early_stop_pages
    }
  };
}


/**
 * Save custom qualification rules for a specific competitor in competitor_profiles.metadata.
 * Uses PostgreSQL JSONB shallow merge to guarantee non-destructive preservation of other metadata keys.
 */
export async function saveCompetitorRules(sql, competitorId, newRules = {}) {
  const numericId = await resolveNumericCompetitorId(sql, competitorId);
  if (!numericId || isNaN(numericId)) throw new Error('Valid competitorId is required.');

  const resolved = resolveQualificationRules(newRules, {
    base: STANDARD_QUALIFICATION_DEFAULTS,
    defaultArticlesOnly: true
  });
  const sanitizedRules = {
    tier1_min_saves: resolved.tier1_min_saves,
    tier2_min_repins: resolved.tier2_min_repins,
    tier2_min_velocity: resolved.tier2_min_velocity,
    tier2_max_age_days: resolved.tier2_max_age_days,
    tier2_min_shares: resolved.tier2_min_shares,
    tier3_fresh_days: resolved.tier3_fresh_days,
    tier3_max_age_days: resolved.tier3_max_age_days,
    tier3_min_saves: resolved.tier3_min_saves,
    articles_only: resolved.articles_only,
    auto_pipeline: resolved.auto_pipeline,
    max_pages: resolved.max_pages,
    early_stop_pages: resolved.early_stop_pages
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
 * Hardened Natural-Key Shard ID Resolver
 * Resolves local database surrogate ID from canonical immutable username or validates local numeric ID.
 * Guarantees zero cross-shard surrogate key mismatch.
 */
export async function resolveLocalCompetitorId(sql, competitorIdentifier, { expectedUsername = '', throwOnError = false } = {}) {
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
      if (throwOnError) throw err;
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
      if (throwOnError) throw err;
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
    if (throwOnError) throw err;
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
      COUNT(cgn.id)::int AS related_count
    FROM competitor_seed_pins csp
    LEFT JOIN candidate_graph_nodes cgn
      ON cgn.seed_pin_id = csp.pin_id
    WHERE csp.competitor_id = ${numericId}
    GROUP BY csp.id
    ORDER BY csp.created_at DESC;
  `;

  return { seeds: rows };
}


/**
 * Add pin IDs as seeds for a competitor, populating titles and thumbnails from 4-table SSOT if available.
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
      cbp.pin_id,
      ump.title,
      ump.image_url,
      cb.name AS board_name,
      ump.save_count
    FROM competitor_board_pins cbp
    JOIN universal_master_pins ump ON ump.pin_id = cbp.pin_id
    LEFT JOIN competitor_boards cb ON cb.competitor_id = cbp.competitor_id AND cb.board_id = cbp.board_id
    WHERE cbp.competitor_id = ${numericId} AND cbp.pin_id = ANY(${cleanIds});
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

  await sql`
    INSERT INTO universal_master_pins (pin_id, first_discovered_pillar)
    SELECT x.pin_id, 'creator'
    FROM jsonb_to_recordset(${JSON.stringify(seedRecords)}::jsonb) AS x(pin_id varchar)
    ON CONFLICT (pin_id) DO NOTHING;
  `;

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
 * Delete a seed pin (or multiple seed pins) and orphan-safely prune associated graph edges.
 */
export async function deleteCompetitorSeed(sql, competitorId, pinId) {
  const numericId = await resolveNumericCompetitorId(sql, competitorId);
  if (!numericId || isNaN(numericId)) throw new Error('Valid competitorId is required.');
  const pins = Array.isArray(pinId)
    ? pinId.map(p => String(p).trim()).filter(Boolean)
    : String(pinId || '').split(/[\s,]+/).map(p => p.trim().replace(/\D+/g, '')).filter(Boolean);
  if (pins.length === 0) throw new Error('Valid pinId is required.');

  await sql`
    DELETE FROM competitor_seed_pins 
    WHERE competitor_id = ${numericId} AND pin_id = ANY(${pins});
  `;
  // Only delete candidate_graph_nodes edges if no cluster_seeds or remaining competitor_seed_pins reference them
  await pruneOrphanCandidateGraphNodes(sql, pins);

  return { ok: true, deleted_pin_ids: pins, deleted_pin_id: pins[0] };
}


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
 * Get active Global Pin Qualification Rules from app_settings (key = 'pin_qualification_rules')
 */
export async function getQualificationRules(sql, options = {}) {
  try {
    const [row] = await sql`
      SELECT value AS rules, updated_at
      FROM app_settings
      WHERE key = ${GLOBAL_QUALIFICATION_RULES_KEY}
      LIMIT 1;
    `;
    const parsedRules = typeof row?.rules === 'string'
      ? (() => { try { return JSON.parse(row.rules); } catch (_) { return null; } })()
      : row?.rules;
    if (parsedRules && typeof parsedRules === 'object') {
      const resolved = resolveQualificationRules(parsedRules, { base: DEFAULT_QUALIFICATION_RULES });
      return {
        id: 1,
        tier1_min_saves: resolved.tier1_min_saves,
        tier2_min_repins: resolved.tier2_min_repins,
        tier2_min_velocity: resolved.tier2_min_velocity,
        tier2_max_age_days: resolved.tier2_max_age_days,
        tier3_max_age_days: resolved.tier3_max_age_days,
        tier3_min_saves: resolved.tier3_min_saves,
        master_ingest_enabled: resolved.master_ingest_enabled,
        cron_enabled: resolved.cron_enabled,
        early_stop_pages: resolved.early_stop_pages,
        max_batch_pins: resolved.max_batch_pins,
        discovery_max_pages: resolved.discovery_max_pages,
        refresh_max_pins: resolved.refresh_max_pins,
        paused_policy: resolved.paused_policy,
        updated_at: row.updated_at
      };
    }
  } catch (err) {
    if (options.throwOnError) throw err;
  }
  return { ...DEFAULT_QUALIFICATION_RULES, cron_enabled: true };
}


/**
 * Update and persist Global Pin Qualification Rules in app_settings (key = 'pin_qualification_rules')
 */
export async function updateQualificationRules(sql, rules = {}) {
  const current = await getQualificationRules(sql);
  const resolved = resolveQualificationRules(rules, {
    base: current,
    minVelocityFloor: 0.1
  });
  const masterEnabled = resolved.master_ingest_enabled;

  const sanitizedRules = {
    tier1_min_saves: resolved.tier1_min_saves,
    tier2_min_repins: resolved.tier2_min_repins,
    tier2_min_velocity: resolved.tier2_min_velocity,
    tier2_max_age_days: resolved.tier2_max_age_days,
    tier3_max_age_days: resolved.tier3_max_age_days,
    tier3_min_saves: resolved.tier3_min_saves,
    master_ingest_enabled: masterEnabled,
    early_stop_pages: Math.min(resolved.early_stop_pages, 100),
    max_batch_pins: Math.min(resolved.max_batch_pins, 5000),
    discovery_max_pages: Math.min(resolved.discovery_max_pages, 2000),
    refresh_max_pins: resolved.refresh_max_pins,
    paused_policy: resolved.paused_policy
  };

  const [updated] = await sql`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (
      ${GLOBAL_QUALIFICATION_RULES_KEY},
      ${JSON.stringify(sanitizedRules)}::jsonb,
      NOW()
    )
    ON CONFLICT (key) DO UPDATE SET
      value = EXCLUDED.value,
      updated_at = NOW()
    RETURNING value AS rules, updated_at;
  `;

  const savedObj = typeof updated?.rules === 'string'
    ? (() => { try { return JSON.parse(updated.rules); } catch (_) { return null; } })()
    : updated?.rules;

  return {
    id: 1,
    ...sanitizedRules,
    ...(savedObj && typeof savedObj === 'object' ? savedObj : {}),
    master_ingest_enabled: masterEnabled,
    cron_enabled: masterEnabled,
    updated_at: updated?.updated_at || new Date().toISOString()
  };
}


/**
 * Pure qualification filter function implementing the 3-Tier OR criteria
 */
export function qualifyPin(pin, rules = DEFAULT_QUALIFICATION_RULES) {
  if (!rules || rules.master_ingest_enabled === false) {
    return { qualified: false, matchedTier: null };
  }

  const resolved = resolveQualificationRules(rules, {
    deriveTiersFromSaves: true,
    defaultArticlesOnly: false
  });

  // Strict product filtering if configured in active rules
  if ((resolved.articles_only === true || resolved.exclude_product_pins === true) && Boolean(pin.is_product)) {
    return { qualified: false, matchedTier: null };
  }

  const saves = Number(pin.saves ?? pin.save_count ?? 0);
  const repins = Number(pin.repins ?? pin.repin_count ?? 0);
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

  const minSaves = resolved.tier1_min_saves;
  // Tier 1: Star Performers (Cumulative Saves)
  if (saves >= minSaves) {
    return { qualified: true, matchedTier: 'tier1' };
  }

  // Tier 2: Sustained Virality & Velocity Breakout (Age <= 60d AND saves/age >= min_velocity, OR repins >= min_repins)
  const minVelocity = resolved.tier2_min_velocity;
  const maxVelocityAge = resolved.tier2_max_age_days;
  const minRepins = resolved.tier2_min_repins;
  const pinVelocity = Number(pin.velocity || pin.daily_save_velocity || (!isNaN(ageDays) && ageDays > 0 ? (saves / ageDays) : 0));
  const allowVelocityFallback = Boolean(minSaves <= 100 && minVelocity <= 3.5);
  const matchesVelocity = pinVelocity >= minVelocity || (allowVelocityFallback && saves >= 50 && pinVelocity >= 2.0);
  if (
    repins >= minRepins ||
    (!isNaN(ageDays) && ageDays > 0 && ageDays <= maxVelocityAge && matchesVelocity)
  ) {
    return { qualified: true, matchedTier: 'tier2' };
  }

  // Tier 3: Fresh High-Velocity Breakouts (Age & Saves)
  // Pin MUST have a verified non-negative age <= tier3_max_age_days
  const maxFreshDays = resolved.tier3_max_age_days;
  const freshMinSaves = resolved.tier3_min_saves;
  if (!isNaN(ageDays) && ageDays !== null && ageDays >= 0 && ageDays <= maxFreshDays && saves >= freshMinSaves) {
    return { qualified: true, matchedTier: 'tier3' };
  }

  return { qualified: false, matchedTier: null };
}


export function isPinQualified(pin, rules) {
  const res = qualifyPin(pin, rules);
  return typeof res === 'boolean' ? res : Boolean(res?.qualified);
}
