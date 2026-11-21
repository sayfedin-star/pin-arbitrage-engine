/**
 * src/modules/newborn/launchpad.mjs
 *
 * Trends & Zero-Query Launchpad Feed, Idea Page Intelligence, and On-Demand Account Reach Fetcher.
 */

import { Semaphore, sanitizeForJsonb } from '../../utils.mjs';
import {
  invalidateEdgeCache,
  isValidPinId
} from '../../http/security-and-response.mjs';
import { normalizePinterestUsername } from '../creators/competitors-crud.mjs';
import {
  OFFICIAL_L1_INTERESTS,
  SUPPORTED_TREND_TYPES,
  SUPPORTED_TREND_COUNTRIES,
  getNewbornSettings,
  resolveNewbornRawCookie
} from './settings.mjs';
import { NewbornCookieRouter } from './cookie-router.mjs';
import { mergeCandidatePinRecords } from './surface-normalizers.mjs';
import {
  resolveIdeaPageIntelligence,
  harvestGrowingTrendsSurface,
  harvestZeroQueryPopularSurface
} from './surface-trends.mjs';
import {
  hydratePinZeroCookie,
  hydrateUserZeroCookie
} from './surface-hydrators.mjs';
import {
  classifyPinProvenance,
  scoreNewbornCandidate,
  scoreRookieCreator
} from './intelligence.mjs';
import { upsertStagedRookiesBatch } from './harvester.mjs';

export const LAUNCHPAD_CACHE_KEY = 'newborn_launchpad_cache';

/**
 * Pure read-only Trends & Zero-Query Launchpad feed (`GET /api/newborn/launchpad`).
 * Safe even when `sql` is null / offline.
 */
export async function getNewbornLaunchpadFeed(sql, { country = null, trendType = 'growing', l1Interest = 'all' } = {}) {
  const settings = await getNewbornSettings(sql);
  const resolvedCountry = /^[A-Z]{2}$/.test(String(country || '').toUpperCase())
    ? String(country).toUpperCase()
    : (settings.discovery?.country || 'US');
  const resolvedType = SUPPORTED_TREND_TYPES.includes(String(trendType || '').toLowerCase())
    ? String(trendType).toLowerCase()
    : 'growing';
  const resolvedInterest = String(l1Interest || settings.discovery?.default_l1_interest || 'all').toLowerCase();

  let cached = null;
  let recentSeeds = [];

  if (sql && typeof sql === 'function') {
    const [cacheRows, seedRows] = await Promise.all([
      sql`SELECT value, updated_at FROM app_settings WHERE key = ${LAUNCHPAD_CACHE_KEY} LIMIT 1;`,
      sql`
        SELECT seed_query, COUNT(*)::int AS pin_count, MAX(golden_score)::double precision AS max_score
        FROM newborn_candidates
        WHERE seed_query IS NOT NULL AND seed_query <> '' AND stage <> 'discarded'
        GROUP BY seed_query
        ORDER BY max_score DESC NULLS LAST, pin_count DESC
        LIMIT 16;
      `
    ]);

    if (cacheRows?.[0]?.value) {
      cached = typeof cacheRows[0].value === 'string' ? JSON.parse(cacheRows[0].value) : cacheRows[0].value;
    }
    recentSeeds = (seedRows || []).map((r) => ({
      term: r.seed_query,
      pin_count: Number(r.pin_count || 0),
      max_golden_score: Number(r.max_score || 0)
    }));
  }

  const bucketKey = `${resolvedCountry}:${resolvedType}:${resolvedInterest}`;
  const bucket = cached?.buckets?.[bucketKey] || null;

  return {
    country: resolvedCountry,
    trend_type: resolvedType,
    l1_interest: resolvedInterest,
    trends: Array.isArray(bucket?.trends) ? bucket.trends : [],
    popular_terms: Array.isArray(cached?.zero_query?.popular_terms) ? cached.zero_query.popular_terms : [],
    ideas_for_you_terms: Array.isArray(cached?.zero_query?.ideas_for_you_terms) ? cached.zero_query.ideas_for_you_terms : [],
    zero_query_used_guest_fallback: Boolean(cached?.zero_query?.used_guest_fallback),
    recent_seeds: recentSeeds,
    l1_interests_catalog: OFFICIAL_L1_INTERESTS,
    supported_trend_types: SUPPORTED_TREND_TYPES,
    supported_countries: SUPPORTED_TREND_COUNTRIES,
    cached_at: bucket?.fetched_at || cached?.updated_at || null
  };
}

/**
 * Live Trends & Zero-Query Launchpad refresh (`POST /api/newborn/launchpad`).
 * Fetches live `Growing` / `Seasonal` / `Monthly` / `Yearly` trends + 90d `Predicted Peaks`
 * and `Zero-Query` (`Popular on Pinterest` + `Ideas for you`) via `NewbornCookieRouter`.
 */
export async function refreshNewbornLaunchpadFeed(sql, options = {}) {
  const {
    country = null,
    trendType = 'growing',
    l1Interest = 'all',
    limit = 25,
    routerOptions = {},
    env = null
  } = options;

  const settings = await getNewbornSettings(sql);
  const resolvedCountry = /^[A-Z]{2}$/.test(String(country || '').toUpperCase())
    ? String(country).toUpperCase()
    : (settings.discovery?.country || 'US');
  const resolvedType = SUPPORTED_TREND_TYPES.includes(String(trendType || '').toLowerCase())
    ? String(trendType).toLowerCase()
    : 'growing';
  const resolvedInterest = String(l1Interest || settings.discovery?.default_l1_interest || 'all').toLowerCase();

  const resolvedCookie = await resolveNewbornRawCookie(sql, env || routerOptions.env || {});
  const router = new NewbornCookieRouter({
    rawCookie: resolvedCookie.rawCookie,
    ...routerOptions
  });

  const [trendsRes, zeroQueryRes] = await Promise.all([
    harvestGrowingTrendsSurface(router, {
      country: resolvedCountry,
      trendType: resolvedType,
      l1Interest: resolvedInterest,
      limit: Math.max(5, Math.min(60, Number(limit) || 25)),
      fetch90dForecast: true
    }),
    harvestZeroQueryPopularSurface(router, { country: resolvedCountry })
  ]);

  const nowIso = new Date().toISOString();
  const bucketKey = `${resolvedCountry}:${resolvedType}:${resolvedInterest}`;

  if (sql && typeof sql === 'function') {
    let existingCache = { buckets: {}, zero_query: {} };
    const prevRows = await sql`SELECT value FROM app_settings WHERE key = ${LAUNCHPAD_CACHE_KEY} LIMIT 1;`;
    if (prevRows?.[0]?.value) {
      const parsed = typeof prevRows[0].value === 'string' ? JSON.parse(prevRows[0].value) : prevRows[0].value;
      if (parsed && typeof parsed === 'object') {
        existingCache = {
          buckets: (parsed.buckets && typeof parsed.buckets === 'object') ? parsed.buckets : {},
          zero_query: (parsed.zero_query && typeof parsed.zero_query === 'object') ? parsed.zero_query : {}
        };
      }
    }

    const bucketKeys = Object.keys(existingCache.buckets);
    if (bucketKeys.length >= 24 && !existingCache.buckets[bucketKey]) {
      delete existingCache.buckets[bucketKeys[0]];
    }

    existingCache.buckets[bucketKey] = {
      trends: trendsRes.trends || [],
      fetched_at: nowIso
    };
    existingCache.zero_query = {
      popular_terms: zeroQueryRes.popular_terms || zeroQueryRes.terms || [],
      ideas_for_you_terms: zeroQueryRes.ideas_for_you_terms || [],
      used_guest_fallback: Boolean(zeroQueryRes.used_guest_fallback),
      fetched_at: nowIso
    };
    existingCache.updated_at = nowIso;

    await sql`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (${LAUNCHPAD_CACHE_KEY}, ${JSON.stringify(sanitizeForJsonb(existingCache))}::jsonb, NOW())
      ON CONFLICT (key) DO UPDATE SET
        value = EXCLUDED.value,
        updated_at = NOW();
    `;
  }

  await invalidateEdgeCache('newborn:launchpad');

  return {
    ok: Boolean(trendsRes.ok || zeroQueryRes.ok),
    country: resolvedCountry,
    trend_type: resolvedType,
    l1_interest: resolvedInterest,
    trends: trendsRes.trends || [],
    popular_terms: zeroQueryRes.popular_terms || zeroQueryRes.terms || [],
    ideas_for_you_terms: zeroQueryRes.ideas_for_you_terms || [],
    zero_query_used_guest_fallback: Boolean(zeroQueryRes.used_guest_fallback),
    router_telemetry: router.getRedactedTelemetry(),
    cached_at: nowIso
  };
}

/**
 * Resolves Official Pinterest `Idea Page` Intelligence (`GET /api/newborn/idea-intelligence`):
 * Official Idea Page URL (`/ideas/<slug>/<id>/`), `internal_search_count`, weekly/monthly/yearly
 * growth %, SEO breadcrumbs, and related interests. Works offline / scale-to-zero (`sql` optional).
 */
export async function getNewbornIdeaPageIntelligence(term, { country = 'US', routerOptions = {}, env = null } = {}) {
  const cleanTerm = String(term || '').trim();
  const isOversizedOrInvalid = Boolean(
    cleanTerm.length > 120 ||
    /https?:\/\//i.test(cleanTerm) ||
    /[\r\n]/.test(cleanTerm) ||
    cleanTerm.split(/\s+/).filter(Boolean).length > 12
  );
  if (!cleanTerm || cleanTerm.length < 2 || isOversizedOrInvalid) {
    return {
      ok: true,
      found: false,
      ...(isOversizedOrInvalid ? { skipped_reason: 'query_too_long_or_not_keyword' } : {}),
      term: cleanTerm.slice(0, 120),
      idea_url: null,
      internal_search_count: 0,
      formatted_volume: '0',
      weekly_change: null,
      monthly_change: null,
      yearly_change: null,
      seo_breadcrumbs: [],
      related_interests: [],
      ideas_pivots: []
    };
  }

  const fetchImpl = routerOptions.fetchImpl || (typeof env?.NEWBORN_FETCH_IMPL === 'function' ? env.NEWBORN_FETCH_IMPL : undefined);
  const router = new NewbornCookieRouter({
    rawCookie: '',
    ...routerOptions,
    ...(fetchImpl ? { fetchImpl } : {})
  });

  const info = await resolveIdeaPageIntelligence(cleanTerm, { router, country });
  return {
    ok: true,
    ...info
  };
}

/**
 * On-demand Zero-Cookie Account Reach & Impressions fetcher (`POST /api/newborn/candidates/:pin_id/fetch-account`
 * and `POST /api/newborn/candidates/fetch-accounts`).
 *
 * Account scraping is strictly OFF BY DEFAULT during hunts; this endpoint runs `UserResource/get`
 * ONLY when explicitly triggered by the user, updating `newborn_candidates` (`creator_monthly_reach`,
 * `creator_profile_views`, `effective_creator_followers`, `creator_pin_count`) and staging rookie metadata.
 */
export async function fetchNewbornCandidateAccounts(sql, pinIds, { routerOptions = {}, env = null, nowMs = Date.now() } = {}) {
  if (!sql || typeof sql !== 'function') {
    const err = new Error('Database client is required to pull account reach.');
    err.status = 503;
    throw err;
  }

  const cleanIds = Array.from(new Set(
    (Array.isArray(pinIds) ? pinIds : [pinIds])
      .map((id) => String(id || '').trim())
      .filter(isValidPinId)
  )).slice(0, 50);

  if (cleanIds.length === 0) {
    return {
      ok: false,
      status: 400,
      fetched_count: 0,
      users_fetched: 0,
      results: [],
      message: 'Provide at least one valid numeric pin_id.'
    };
  }

  const rows = await sql`
    SELECT *
    FROM newborn_candidates
    WHERE pin_id = ANY(${cleanIds}::text[])
    ORDER BY pin_id ASC;
  `;

  if (!Array.isArray(rows) || rows.length === 0) {
    return {
      ok: false,
      status: 404,
      fetched_count: 0,
      users_fetched: 0,
      results: [],
      message: 'No matching Newborn candidates found.'
    };
  }

  const settings = await getNewbornSettings(sql);
  const fetchImpl = routerOptions.fetchImpl || (typeof env?.NEWBORN_FETCH_IMPL === 'function' ? env.NEWBORN_FETCH_IMPL : undefined);
  // Strictly Zero-Cookie for both PinResource & UserResource!
  const router = new NewbornCookieRouter({
    rawCookie: '',
    ...routerOptions,
    ...(fetchImpl ? { fetchImpl } : {})
  });

  // 1. Ensure each candidate has a creator username AND full pin hydration (zero-cookie PinResource if missing or unhydrated)
  const pinSem = new Semaphore(6);
  const rootPinCache = new Map();
  const workingRows = await Promise.all(
    rows.map((row) => pinSem.run(async () => {
      const existingUsername = normalizePinterestUsername(
        row.effective_creator_username || row.origin_creator_username || row.pinner_username || ''
      );
      if (existingUsername && row.is_hydrated) {
        return { ...row, _resolved_username: existingUsername, _newly_hydrated: false };
      }
      const hyd = await hydratePinZeroCookie(String(row.pin_id), router, {
        rootPinCache,
        nowMs,
        resolveRootPin: Boolean(settings.qualification?.resolve_root_pin === true)
      });
      if (hyd.ok && hyd.pin) {
        const merged = mergeCandidatePinRecords(row, hyd.pin);
        const foundUser = normalizePinterestUsername(
          merged.effective_creator_username || merged.origin_creator_username || merged.pinner_username || existingUsername || ''
        );
        return { ...merged, _resolved_username: foundUser || null, _newly_hydrated: true };
      }
      return { ...row, _resolved_username: existingUsername || null, _newly_hydrated: false };
    }))
  );

  // 2. Deduplicate usernames and pull Total audience (`profile_reach`) + Impressions (`profile_views`) via Zero-Cookie UserResource
  const uniqueUsernames = Array.from(new Set(
    workingRows.map((r) => r._resolved_username).filter(Boolean)
  )).sort((a, b) => a.localeCompare(b));

  const userMap = new Map();
  const userSem = new Semaphore(4);
  await Promise.all(
    uniqueUsernames.map((uname) => userSem.run(async () => {
      const uRes = await hydrateUserZeroCookie(uname, router);
      if (uRes.ok && uRes.user) {
        userMap.set(uname, uRes.user);
      }
    }))
  );

  // 3. Persist updated account & hydrated pin metadata onto newborn_candidates in a single batched UPDATE and stage rookies
  const results = [];
  const scoredRookies = [];
  const updatesToPersist = [];

  for (const row of workingRows) {
    const uname = row._resolved_username;
    const u = uname ? userMap.get(uname) : null;
    const hydratedAnnotations = Array.isArray(row.visual_annotations) ? row.visual_annotations : [];
    const hydratedShareCount = row.share_count != null ? Math.round(Number(row.share_count)) : null;

    if (!u) {
      const resolvedProv = row._newly_hydrated
        ? (classifyPinProvenance(row)?.upload_provenance || row.upload_provenance || null)
        : (row.upload_provenance || null);
      if (row._newly_hydrated) {
        updatesToPersist.push({
          pin_id: String(row.pin_id),
          effective_creator_username: uname || row.effective_creator_username || null,
          effective_creator_followers: row.effective_creator_followers ?? null,
          creator_monthly_reach: row.creator_monthly_reach ?? null,
          creator_profile_views: row.creator_profile_views ?? null,
          creator_pin_count: row.creator_pin_count ?? null,
          is_rookie_outlier: Boolean(row.is_rookie_outlier),
          outlier_ratio: row.outlier_ratio != null ? Number(row.outlier_ratio) : null,
          title: row.title || null,
          board_name: row.board_name || null,
          board_url: row.board_url || null,
          share_count: hydratedShareCount,
          raw_creation_method: row.raw_creation_method || null,
          upload_provenance: resolvedProv,
          is_repin: Boolean(row.is_repin),
          is_hydrated: Boolean(row.is_hydrated),
          visual_annotations: hydratedAnnotations
        });
      }
      results.push({
        pin_id: String(row.pin_id),
        username: uname || null,
        fetched: false,
        effective_creator_followers: row.effective_creator_followers ?? null,
        creator_monthly_reach: row.creator_monthly_reach ?? null,
        creator_profile_views: row.creator_profile_views ?? null,
        creator_pin_count: row.creator_pin_count ?? null,
        title: row.title || null,
        board_name: row.board_name || null,
        share_count: hydratedShareCount,
        raw_creation_method: row.raw_creation_method || null,
        upload_provenance: resolvedProv,
        is_repin: Boolean(row.is_repin),
        is_hydrated: Boolean(row.is_hydrated),
        visual_annotations: hydratedAnnotations
      });
      continue;
    }

    const enriched = {
      ...row,
      effective_creator_username: u.username || uname,
      effective_creator_followers: u.follower_count != null ? Math.round(Number(u.follower_count)) : (row.effective_creator_followers ?? null),
      creator_monthly_reach: u.monthly_reach != null ? Math.round(Number(u.monthly_reach)) : (row.creator_monthly_reach ?? null),
      creator_profile_views: u.profile_views != null ? Math.round(Number(u.profile_views)) : (row.creator_profile_views ?? null),
      creator_pin_count: u.pin_count != null ? Math.round(Number(u.pin_count)) : (row.creator_pin_count ?? null)
    };
    const rescored = scoreNewbornCandidate(enriched, settings, { nowMs });
    const resolvedUploadProvenance = rescored.upload_provenance || enriched.upload_provenance || null;

    updatesToPersist.push({
      pin_id: String(row.pin_id),
      effective_creator_username: enriched.effective_creator_username,
      effective_creator_followers: enriched.effective_creator_followers,
      creator_monthly_reach: enriched.creator_monthly_reach,
      creator_profile_views: enriched.creator_profile_views,
      creator_pin_count: enriched.creator_pin_count,
      is_rookie_outlier: Boolean(rescored.is_rookie_outlier),
      outlier_ratio: rescored.outlier_ratio != null ? Number(rescored.outlier_ratio) : null,
      title: enriched.title || null,
      board_name: enriched.board_name || null,
      board_url: enriched.board_url || null,
      share_count: hydratedShareCount,
      raw_creation_method: enriched.raw_creation_method || null,
      upload_provenance: resolvedUploadProvenance,
      is_repin: Boolean(enriched.is_repin),
      is_hydrated: Boolean(enriched.is_hydrated),
      visual_annotations: hydratedAnnotations
    });

    results.push({
      pin_id: String(row.pin_id),
      username: enriched.effective_creator_username,
      display_name: u.display_name || null,
      avatar_url: u.avatar_url || null,
      website_url: u.website_url || null,
      fetched: true,
      effective_creator_followers: enriched.effective_creator_followers,
      creator_monthly_reach: enriched.creator_monthly_reach,
      creator_profile_views: enriched.creator_profile_views,
      creator_pin_count: enriched.creator_pin_count,
      board_count: u.board_count ?? null,
      is_rookie_outlier: Boolean(rescored.is_rookie_outlier),
      outlier_ratio: rescored.outlier_ratio ?? null,
      title: enriched.title || null,
      board_name: enriched.board_name || null,
      share_count: hydratedShareCount,
      raw_creation_method: enriched.raw_creation_method || null,
      upload_provenance: resolvedUploadProvenance,
      is_repin: Boolean(enriched.is_repin),
      is_hydrated: Boolean(enriched.is_hydrated),
      visual_annotations: hydratedAnnotations
    });
  }

  if (updatesToPersist.length > 0) {
    updatesToPersist.sort((a, b) => a.pin_id.localeCompare(b.pin_id));
    await sql`
      UPDATE newborn_candidates AS nc
      SET
        effective_creator_username = COALESCE(NULLIF(u.effective_creator_username, ''), nc.effective_creator_username),
        effective_creator_followers = COALESCE(u.effective_creator_followers, nc.effective_creator_followers),
        creator_monthly_reach = COALESCE(u.creator_monthly_reach, nc.creator_monthly_reach),
        creator_profile_views = COALESCE(u.creator_profile_views, nc.creator_profile_views),
        creator_pin_count = COALESCE(u.creator_pin_count, nc.creator_pin_count),
        is_rookie_outlier = u.is_rookie_outlier,
        outlier_ratio = u.outlier_ratio,
        title = COALESCE(NULLIF(u.title, ''), nc.title),
        board_name = COALESCE(NULLIF(u.board_name, ''), nc.board_name),
        board_url = COALESCE(NULLIF(u.board_url, ''), nc.board_url),
        share_count = CASE
          WHEN u.share_count IS NULL THEN nc.share_count
          WHEN nc.share_count IS NULL THEN u.share_count
          ELSE GREATEST(nc.share_count, u.share_count)
        END,
        raw_creation_method = COALESCE(NULLIF(u.raw_creation_method, ''), nc.raw_creation_method),
        upload_provenance = CASE
          WHEN u.upload_provenance IS NOT NULL AND u.upload_provenance <> '' AND u.upload_provenance <> 'UNKNOWN'
          THEN u.upload_provenance
          ELSE nc.upload_provenance
        END,
        is_repin = (nc.is_repin OR u.is_repin),
        is_hydrated = (nc.is_hydrated OR u.is_hydrated),
        visual_annotations = CASE
          WHEN jsonb_array_length(COALESCE(u.visual_annotations, '[]'::jsonb)) > 0
          THEN u.visual_annotations
          ELSE nc.visual_annotations
        END,
        updated_at = NOW()
      FROM jsonb_to_recordset(${JSON.stringify(sanitizeForJsonb(updatesToPersist))}::jsonb) AS u(
        pin_id text,
        effective_creator_username text,
        effective_creator_followers int,
        creator_monthly_reach bigint,
        creator_profile_views bigint,
        creator_pin_count int,
        is_rookie_outlier boolean,
        outlier_ratio double precision,
        title text,
        board_name text,
        board_url text,
        share_count int,
        raw_creation_method text,
        upload_provenance text,
        is_repin boolean,
        is_hydrated boolean,
        visual_annotations jsonb
      )
      WHERE nc.pin_id = u.pin_id;
    `;
  }

  const workingRowsByUser = new Map();
  for (const r of workingRows) {
    const uname = r?._resolved_username;
    if (!uname) continue;
    let list = workingRowsByUser.get(uname);
    if (!list) {
      list = [];
      workingRowsByUser.set(uname, list);
    }
    list.push(r);
  }

  for (const [uname, u] of userMap.entries()) {
    const assocPins = workingRowsByUser.get(uname) || [];
    const rk = scoreRookieCreator(u, assocPins, settings);
    if (rk) scoredRookies.push(rk);
  }
  if (scoredRookies.length > 0) {
    await upsertStagedRookiesBatch(sql, scoredRookies, { nowMs }).catch(() => {});
  }

  await invalidateEdgeCache('newborn');

  return {
    ok: true,
    fetched_count: results.filter((r) => r.fetched).length,
    users_fetched: userMap.size,
    results,
    router_telemetry: router.getRedactedTelemetry()
  };
}
