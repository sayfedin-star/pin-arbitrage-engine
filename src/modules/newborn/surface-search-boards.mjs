/**
 * src/modules/newborn/surface-search-boards.mjs
 *
 * Pin SERP + Guided Capsules, Fresh Boards Search, Board Feed, Board "Find More Ideas",
 * and `/ideas/` Taxonomy Hub Surface Harvesters.
 */

import { parseCleanMetric, safeString } from '../../core/pinterest/pins.mjs';
import { isValidPinId } from '../../http/security-and-response.mjs';
import { extractPwsInitialProps, collectPinsFromSsrTree } from './cookie-router.mjs';
import {
  formatPinterestBoardUrl,
  boardMatchesSeedQuery,
  parseBoardPath,
  extractBookmark,
  normalizeSurfaceCandidatePin,
  mergeCandidatePinRecords
} from './surface-normalizers.mjs';

/**
 * SURFACE 3: Pin SERP + Guided Capsules (`BaseSearchResource/get`, `scope: "pins"`).
 * Uses `_auth=1` to unlock clean Snowflake IDs (avoiding `e1_` encrypted IDs) with guest retry + SSR fallback.
 */
export async function harvestPinSerpWithCapsulesSurface(
  router,
  query,
  { maxPages = 10, pageSize = 50, targetPins = null, onPageProgress = null, signal = null } = {}
) {
  const cleanQuery = String(query || '').trim();
  if (!cleanQuery) {
    return { ok: false, surface: 'pin_serp_capsules', query: '', pins: [], capsules: [], encrypted_skipped_count: 0, pages_fetched: 0 };
  }

  const pSize = Math.max(10, Math.min(100, Number(pageSize) || 50));
  const pinTarget = targetPins !== null && targetPins !== undefined && Number(targetPins) > 0
    ? Math.max(10, Math.min(10000, Math.round(Number(targetPins))))
    : null;
  const derivedPages = pinTarget ? Math.ceil(pinTarget / Math.max(25, pSize)) + 2 : (Number(maxPages) || 2);
  const maxP = Math.max(1, Math.min(200, derivedPages));
  const encodedQ = encodeURIComponent(cleanQuery);
  const sourceUrl = `/search/pins/?q=${encodedQ}`;

  const pinsMap = new Map();
  const capsulesMap = new Map();
  let encryptedSkippedCount = 0;
  let bookmark = null;
  let lastBookmark = null;
  let pagesFetched = 0;
  let consecutiveEmptyPages = 0;

  for (let page = 1; page <= maxP; page++) {
    if (signal?.aborted) break;
    if (pinTarget !== null && pinsMap.size >= pinTarget) break;

    const opts = {
      query: cleanQuery,
      scope: 'pins',
      page_size: pSize,
      ...(bookmark ? { bookmarks: [bookmark] } : {})
    };
    const url = `https://www.pinterest.com/resource/BaseSearchResource/get/?source_url=${encodeURIComponent(sourceUrl)}&data=${encodeURIComponent(JSON.stringify({ options: opts, context: {} }))}`;

    const res = await router.requestJson(url, {
      endpointKey: 'search_pins',
      sourceUrl,
      handler: 'www/search/pins.js',
      signal
    });

    if (!res.ok || !res.data) break;
    pagesFetched++;

    const rr = res.data?.resource_response?.data || res.data?.data || {};
    const rawItems = Array.isArray(rr) ? rr : (rr.results || rr.items || []);
    const rawGuides = rr.guides || rr.rankedGuides || rr.search_guides || [];

    if (Array.isArray(rawGuides)) {
      for (const g of rawGuides) {
        const term = safeString(g?.term || g?.query || g?.display || '');
        if (!term) continue;
        const key = term.toLowerCase();
        if (!capsulesMap.has(key)) {
          capsulesMap.set(key, {
            term,
            display: safeString(g?.display || term),
            dominant_color: safeString(g?.dominant_color || '#10b981')
          });
        }
      }
    }

    const pageCapsules = Array.from(capsulesMap.values());
    const sizeBefore = pinsMap.size;

    for (const item of rawItems) {
      if (!item || typeof item !== 'object') continue;
      if (pinTarget !== null && pinsMap.size >= pinTarget) break;
      const rawId = String(item.id ?? item.pin_id ?? '').trim();
      if (rawId.startsWith('e1_') || (rawId && !isValidPinId(rawId))) {
        encryptedSkippedCount++;
        continue;
      }
      const norm = normalizeSurfaceCandidatePin(item, {
        surface: 'pin_serp_capsules',
        seed_query: cleanQuery,
        guided_capsules: pageCapsules
      });
      if (norm) {
        pinsMap.set(norm.pin_id, mergeCandidatePinRecords(pinsMap.get(norm.pin_id), norm));
      }
    }

    if (pinsMap.size === sizeBefore) {
      consecutiveEmptyPages++;
      if (consecutiveEmptyPages >= 2) break;
    } else {
      consecutiveEmptyPages = 0;
    }

    if (typeof onPageProgress === 'function' && (page === 1 || page % 3 === 0 || (pinTarget !== null && pinsMap.size >= pinTarget))) {
      await onPageProgress({ page, pagesFetched, collected: pinsMap.size, target: pinTarget });
    }

    if (pinTarget !== null && pinsMap.size >= pinTarget) break;
    bookmark = extractBookmark(res.data);
    if (!bookmark || bookmark === lastBookmark) break;
    lastBookmark = bookmark;
  }

  // Zero-cookie SSR __PWS_INITIAL_PROPS__ fallback if guest XHR returned only encrypted `e1_` IDs
  if (pinsMap.size === 0 && !signal?.aborted) {
    const ssrUrl = `https://www.pinterest.com/search/pins/?q=${encodedQ}`;
    const ssrRes = await router.requestJson(ssrUrl, {
      endpointKey: 'ssr_page_zero_cookie',
      isDocumentHtml: true,
      referer: 'https://www.pinterest.com/',
      signal
    });
    if (ssrRes.ok && typeof ssrRes.data === 'string') {
      const props = extractPwsInitialProps(ssrRes.data);
      const ssrPins = collectPinsFromSsrTree(props, pSize);
      for (const sp of ssrPins) {
        const norm = normalizeSurfaceCandidatePin(sp, {
          surface: 'pin_serp_capsules',
          seed_query: cleanQuery,
          guided_capsules: Array.from(capsulesMap.values())
        });
        if (norm) {
          pinsMap.set(norm.pin_id, mergeCandidatePinRecords(pinsMap.get(norm.pin_id), norm));
        }
      }
    }
  }

  return {
    ok: pinsMap.size > 0 || capsulesMap.size > 0,
    surface: 'pin_serp_capsules',
    query: cleanQuery,
    pins: Array.from(pinsMap.values()),
    capsules: Array.from(capsulesMap.values()),
    encrypted_skipped_count: encryptedSkippedCount,
    pages_fetched: pagesFetched
  };
}

/**
 * SURFACE 4: Fresh Boards Search (`BaseSearchResource/get`, `scope: "boards"`, strict zero-cookie!).
 * Returns clean boards filtered by `board_order_modified_at <= maxBoardAgeDays`.
 */
export async function harvestFreshBoardsSurface(
  router,
  query,
  { maxPages = 2, maxBoards = null, maxBoardAgeDays = 90, nowMs = Date.now(), signal = null } = {}
) {
  const cleanQuery = String(query || '').trim();
  if (!cleanQuery) {
    return { ok: false, surface: 'fresh_boards', query: '', boards: [], total_boards_scanned: 0, pages_fetched: 0 };
  }

  const targetBoards = maxBoards !== null && maxBoards !== undefined && Number(maxBoards) > 0
    ? Math.max(1, Math.min(50, Math.round(Number(maxBoards))))
    : null;
  const neededPages = targetBoards ? Math.max(Number(maxPages) || 1, Math.ceil(targetBoards / 18)) : (Number(maxPages) || 1);
  const maxP = Math.max(1, Math.min(6, neededPages));
  const maxAge = Math.max(1, Math.min(365, Number(maxBoardAgeDays) || 90));
  const encodedQ = encodeURIComponent(cleanQuery);
  const sourceUrl = `/search/boards/?q=${encodedQ}`;

  const freshBoardsMap = new Map();
  let totalBoardsScanned = 0;
  let bookmark = null;
  let lastBookmark = null;
  let pagesFetched = 0;

  for (let page = 1; page <= maxP; page++) {
    if (signal?.aborted) break;
    const opts = {
      query: cleanQuery,
      scope: 'boards',
      page_size: 50,
      ...(bookmark ? { bookmarks: [bookmark] } : {})
    };
    const url = `https://www.pinterest.com/resource/BaseSearchResource/get/?source_url=${encodeURIComponent(sourceUrl)}&data=${encodeURIComponent(JSON.stringify({ options: opts, context: {} }))}`;

    const res = await router.requestJson(url, {
      endpointKey: 'search_boards',
      sourceUrl,
      handler: 'www/search/boards.js',
      signal
    });

    if (!res.ok || !res.data) break;
    pagesFetched++;

    const rr = res.data?.resource_response?.data || res.data?.data || {};
    const items = Array.isArray(rr) ? rr : (rr.results || rr.items || rr.boards || []);

    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const boardId = String(item.id ?? item.board_id ?? item.node_id ?? '').trim();
      if (!boardId || boardId.startsWith('-')) continue;
      totalBoardsScanned++;

      const modRaw = item.board_order_modified_at || item.boardOrderModifiedAt || item.last_pin_save_time || null;
      let modIso = null;
      let modAgeDays = null;
      if (modRaw) {
        const d = new Date(modRaw);
        if (!Number.isNaN(d.getTime())) {
          modIso = d.toISOString();
          modAgeDays = Math.max(0, (nowMs - d.getTime()) / 86_400_000);
        }
      }

      if (modAgeDays === null || modAgeDays > maxAge) {
        continue;
      }

      const rawUrl = safeString(item.url || '');
      const parsedPath = parseBoardPath(rawUrl, item.owner?.username || '');
      const boardName = safeString(item.name || 'Untitled Board');

      // Require semantic token overlap between board name/slug and seed query to prevent cross-topic pollution
      if (!boardMatchesSeedQuery(boardName, parsedPath.board_slug || '', cleanQuery)) {
        continue;
      }

      const fullUrl = formatPinterestBoardUrl(rawUrl, parsedPath.owner_username || '', parsedPath.board_slug || '') || '';

      if (!freshBoardsMap.has(boardId)) {
        freshBoardsMap.set(boardId, {
          board_id: boardId,
          name: boardName,
          url: fullUrl,
          clean_path: parsedPath.clean_path,
          owner_username: parsedPath.owner_username || null,
          board_slug: parsedPath.board_slug || null,
          pin_count: parseCleanMetric(item.pin_count ?? 0, 0, { preserveCeiling: true, cap: 0 }),
          follower_count: parseCleanMetric(item.follower_count ?? 0, 0, { preserveCeiling: true, cap: 0 }),
          board_order_modified_at: modIso,
          board_age_days: Math.round(modAgeDays * 10) / 10,
          seed_query: cleanQuery
        });
      }
    }

    if (targetBoards !== null && freshBoardsMap.size >= targetBoards) break;
    bookmark = extractBookmark(res.data);
    if (!bookmark || bookmark === lastBookmark) break;
    lastBookmark = bookmark;
  }

  const sortedBoards = Array.from(freshBoardsMap.values()).sort(
    (a, b) => (a.board_age_days ?? 9999) - (b.board_age_days ?? 9999) || (b.follower_count || 0) - (a.follower_count || 0)
  );

  return {
    ok: sortedBoards.length > 0 || pagesFetched > 0,
    surface: 'fresh_boards',
    query: cleanQuery,
    boards: targetBoards !== null ? sortedBoards.slice(0, targetBoards) : sortedBoards,
    total_boards_scanned: totalBoardsScanned,
    pages_fetched: pagesFetched
  };
}

/**
 * SURFACE 5: Fresh Board Pin Feeds (`BoardFeedResource/get` `_auth=1`, with zero-cookie Pidgets board fallback).
 */
export async function harvestBoardFeedSurface(
  router,
  board = {},
  { maxPages = 2, pageSize = 100, targetPins = null, signal = null } = {}
) {
  const boardId = String(board.board_id || board.id || '').trim();
  const parsedPath = parseBoardPath(board.url || board.clean_path || '', board.owner_username || '');
  const pSize = Math.max(10, Math.min(100, Number(pageSize) || 100));
  const pinTarget = targetPins !== null && targetPins !== undefined && Number(targetPins) > 0
    ? Math.max(25, Math.min(1000, Math.round(Number(targetPins))))
    : null;
  const maxP = Math.max(1, Math.min(20, pinTarget ? Math.ceil(pinTarget / Math.max(25, pSize)) + 1 : (Number(maxPages) || 2)));

  const pinsMap = new Map();
  let pagesFetched = 0;
  let usedPidgetsFallback = false;

  if (boardId) {
    let bookmark = null;
    let lastBookmark = null;
    for (let page = 1; page <= maxP; page++) {
      if (signal?.aborted) break;
      if (pinTarget !== null && pinsMap.size >= pinTarget) break;
      const opts = {
        board_id: boardId,
        board_url: parsedPath.clean_path,
        field_set_key: 'grid_item',
        filter_section_pins: true,
        sort: 'default',
        page_size: pSize,
        ...(bookmark ? { bookmarks: [bookmark] } : {})
      };
      const url = `https://www.pinterest.com/resource/BoardFeedResource/get/?source_url=${encodeURIComponent(parsedPath.clean_path)}&data=${encodeURIComponent(JSON.stringify({ options: opts, context: {} }))}`;

      const res = await router.requestJson(url, {
        endpointKey: 'board_feed',
        sourceUrl: parsedPath.clean_path,
        handler: 'www/[username]/[slug].js',
        signal
      });

      if (!res.ok || !res.data) break;
      pagesFetched++;

      const rr = res.data?.resource_response?.data || res.data?.data || [];
      const list = Array.isArray(rr) ? rr : (rr.items || rr.pins || rr.results || []);
      for (const raw of list) {
        if (pinTarget !== null && pinsMap.size >= pinTarget) break;
        const norm = normalizeSurfaceCandidatePin(raw, {
          surface: 'board_feed',
          seed_query: board.seed_query || board.name || null,
          board_id: boardId,
          board_name: board.name || null,
          board_url: board.url || parsedPath.clean_path,
          board_pin_count: board.pin_count ?? null,
          board_follower_count: board.follower_count ?? null,
          board_order_modified_at: board.board_order_modified_at || null
        });
        if (norm) {
          pinsMap.set(norm.pin_id, mergeCandidatePinRecords(pinsMap.get(norm.pin_id), norm));
        }
      }

      if (pinTarget !== null && pinsMap.size >= pinTarget) break;
      bookmark = extractBookmark(res.data);
      if (!bookmark || bookmark === lastBookmark) break;
      lastBookmark = bookmark;
    }
  }

  // Zero-cookie Pidgets board feed fallback (returns up to 50 clean board pins with pinner.profile_url)
  if (pinsMap.size === 0 && !signal?.aborted && parsedPath.owner_username && parsedPath.board_slug) {
    const pidgetsBoardUrl = `https://widgets.pinterest.com/v3/pidgets/boards/${encodeURIComponent(parsedPath.owner_username)}/${encodeURIComponent(parsedPath.board_slug)}/pins/`;
    const pidRes = await router.requestJson(pidgetsBoardUrl, {
      endpointKey: 'pidgets',
      referer: 'https://www.pinterest.com/',
      signal
    });

    if (pidRes.ok && pidRes.data) {
      usedPidgetsFallback = true;
      pagesFetched++;
      const rawPins = pidRes.data?.data?.pins || [];
      const rawBoard = pidRes.data?.data?.board || {};
      for (const raw of rawPins) {
        const norm = normalizeSurfaceCandidatePin(raw, {
          surface: 'board_feed',
          seed_query: board.seed_query || board.name || rawBoard.name || null,
          board_id: boardId || rawBoard.id || null,
          board_name: board.name || rawBoard.name || null,
          board_url: board.url || rawBoard.url || parsedPath.clean_path,
          board_pin_count: board.pin_count ?? rawBoard.pin_count ?? null,
          board_follower_count: board.follower_count ?? rawBoard.follower_count ?? null,
          board_order_modified_at: board.board_order_modified_at || null
        });
        if (norm) {
          pinsMap.set(norm.pin_id, mergeCandidatePinRecords(pinsMap.get(norm.pin_id), norm));
        }
      }
    }
  }

  return {
    ok: pinsMap.size > 0,
    surface: 'board_feed',
    pins: Array.from(pinsMap.values()),
    used_pidgets_fallback: usedPidgetsFallback,
    pages_fetched: pagesFetched
  };
}

/**
 * SURFACE 6: Board "Find more ideas" (`BoardContentRecommendationResource/get` via `/<user>/<slug>/more_ideas/`).
 * Requires `_auth=1`; gracefully skips on missing/expired cookie without tripping circuit breaker.
 * Falls back once on page 1 to legacy `BoardFeedResource/get` (`add_vase: true`) if non-auth 404/400 or empty payload.
 */
export async function harvestBoardMoreIdeasSurface(
  router,
  board = {},
  { maxPages = 4, pageSize = 25, targetPins = null, signal = null } = {}
) {
  const boardId = String(board.board_id || board.id || '').trim();
  const parsedPath = parseBoardPath(board.url || board.clean_path || '', board.owner_username || '');
  if (!boardId || !parsedPath.owner_username || !parsedPath.board_slug) {
    return { ok: false, surface: 'board_more_ideas', pins: [], skipped_auth_only: false, pages_fetched: 0 };
  }

  const moreIdeasSourceUrl = `/${parsedPath.owner_username}/${parsedPath.board_slug}/more_ideas/`;
  const pSize = Math.max(10, Math.min(50, Number(pageSize) || 25));
  const pinTarget = targetPins !== null && targetPins !== undefined && Number(targetPins) > 0
    ? Math.max(25, Math.min(1000, Math.round(Number(targetPins))))
    : null;
  const derivedPages = pinTarget ? Math.ceil(pinTarget / Math.max(10, pSize)) : (Number(maxPages) || 4);
  const maxP = Math.max(1, Math.min(40, derivedPages));

  const pinsMap = new Map();
  let bookmark = null;
  let lastBookmark = null;
  let pagesFetched = 0;
  let skippedAuthOnly = false;
  let useLegacyFallback = false;

  const extractMoreIdeasList = (data) => {
    const rr = data?.resource_response?.data ?? data?.data ?? [];
    if (Array.isArray(rr)) return rr;
    if (rr && typeof rr === 'object') {
      return rr.results || rr.items || rr.pins || rr.recommendations || [];
    }
    return [];
  };

  const ingestList = (list) => {
    let added = 0;
    for (const raw of list) {
      if (pinTarget !== null && pinsMap.size >= pinTarget) break;
      const norm = normalizeSurfaceCandidatePin(raw, {
        surface: 'board_more_ideas',
        seed_query: board.seed_query || board.name || null,
        board_id: boardId,
        board_name: board.name || null,
        board_url: board.url || parsedPath.clean_path,
        board_pin_count: board.pin_count ?? null,
        board_follower_count: board.follower_count ?? null,
        board_order_modified_at: board.board_order_modified_at || null
      });
      if (norm) {
        pinsMap.set(norm.pin_id, mergeCandidatePinRecords(pinsMap.get(norm.pin_id), norm));
        added++;
      }
    }
    return added;
  };

  const buildPrimaryUrl = (bm) => {
    const opts = {
      id: boardId,
      board_id: boardId,
      type: 'board',
      page_size: pSize,
      ...(bm ? { bookmarks: [bm] } : {})
    };
    return `https://www.pinterest.com/resource/BoardContentRecommendationResource/get/?source_url=${encodeURIComponent(moreIdeasSourceUrl)}&data=${encodeURIComponent(JSON.stringify({ options: opts, context: {} }))}`;
  };

  const buildLegacyUrl = (bm) => {
    const opts = {
      board_id: boardId,
      board_url: parsedPath.clean_path,
      current_page: 'board_more_ideas',
      add_vase: true,
      field_set_key: 'grid_item',
      page_size: pSize,
      ...(bm ? { bookmarks: [bm] } : {})
    };
    return `https://www.pinterest.com/resource/BoardFeedResource/get/?source_url=${encodeURIComponent(moreIdeasSourceUrl)}&data=${encodeURIComponent(JSON.stringify({ options: opts, context: {} }))}`;
  };

  for (let page = 1; page <= maxP; page++) {
    if (signal?.aborted) break;
    if (pinTarget !== null && pinsMap.size >= pinTarget) break;

    const url = useLegacyFallback ? buildLegacyUrl(bookmark) : buildPrimaryUrl(bookmark);

    let res = await router.requestJson(url, {
      endpointKey: 'board_more_ideas',
      sourceUrl: moreIdeasSourceUrl,
      handler: 'www/[username]/[slug]/more_ideas.js',
      signal
    });

    if (res.skippedAuthOnly || res.authRequiredFallback) {
      skippedAuthOnly = true;
      break;
    }

    let list = res.ok && res.data ? extractMoreIdeasList(res.data) : [];

    // If page 1 on BoardContentRecommendationResource returns a non-auth 404/400 or empty payload,
    // fall back once to legacy BoardFeedResource/get (`add_vase: true`).
    if (
      page === 1 &&
      !useLegacyFallback &&
      !signal?.aborted &&
      ((!res.ok && (res.status === 404 || res.status === 400)) || (res.ok && list.length === 0))
    ) {
      useLegacyFallback = true;
      res = await router.requestJson(buildLegacyUrl(null), {
        endpointKey: 'board_more_ideas',
        sourceUrl: moreIdeasSourceUrl,
        handler: 'www/[username]/[slug]/more_ideas.js',
        signal
      });
      if (res.skippedAuthOnly || res.authRequiredFallback) {
        skippedAuthOnly = true;
        break;
      }
      list = res.ok && res.data ? extractMoreIdeasList(res.data) : [];
    }

    if (!res.ok || !res.data) break;
    pagesFetched++;

    ingestList(list);

    if (pinTarget !== null && pinsMap.size >= pinTarget) break;
    bookmark = extractBookmark(res.data);
    if (!bookmark || bookmark === lastBookmark) break;
    lastBookmark = bookmark;
  }

  return {
    ok: pinsMap.size > 0,
    surface: 'board_more_ideas',
    pins: Array.from(pinsMap.values()),
    skipped_auth_only: skippedAuthOnly,
    used_legacy_fallback: useLegacyFallback,
    pages_fetched: pagesFetched
  };
}

/**
 * SURFACE 7: `/ideas/` Taxonomy Feeds.
 * Mandatory Step 1: Zero-cookie `InterestResource/get` verifying `is_interest !== false` & valid numeric `id`.
 * Step 2: `BestPinsFeedAltResource/get` (`_auth=1`), falling back to zero-cookie `/ideas/<slug>/<id>/` SSR `__PWS_INITIAL_PROPS__`.
 */
export async function harvestIdeasHubSurface(
  router,
  termOrInterest,
  { maxPages = 5, pageSize = 50, targetPins = null, preResolvedInterest = null, onPageProgress = null, signal = null } = {}
) {
  const rawInput = typeof termOrInterest === 'string'
    ? termOrInterest
    : (termOrInterest?.name || termOrInterest?.key || termOrInterest?.term || '');
  const cleanTerm = String(rawInput || '').trim().toLowerCase();
  const slug = cleanTerm.replace(/[^a-z0-9\s-]/gi, ' ').trim().replace(/[\s_]+/g, '-');
  if (!slug) {
    return { ok: false, surface: 'ideas_feeds', skipped_non_interest: true, pins: [], pages_fetched: 0 };
  }

  // Step 1: Zero-cookie InterestResource/get gate (`is_interest` verification — reuse pre-resolved interest when provided)
  let interestData = null;
  let interestId = '';
  let isOfficialInterest = false;

  if (preResolvedInterest && preResolvedInterest.found && preResolvedInterest.id) {
    interestData = {
      id: preResolvedInterest.id,
      key: preResolvedInterest.key || cleanTerm,
      url_name: preResolvedInterest.url_name || slug,
      internal_search_count: preResolvedInterest.internal_search_count || 0,
      is_interest: true
    };
    interestId = String(preResolvedInterest.id);
    isOfficialInterest = true;
  } else {
    const interestDataParam = encodeURIComponent(JSON.stringify({
      options: { interest: slug, field_set_key: 'ideas_hub' },
      context: {}
    }));
    const interestUrl = `https://www.pinterest.com/resource/InterestResource/get/?source_url=${encodeURIComponent(`/ideas/${slug}/`)}&data=${interestDataParam}`;
    const interestRes = await router.requestJson(interestUrl, {
      endpointKey: 'interest_resource',
      sourceUrl: `/ideas/${slug}/`,
      handler: 'www/ideas/[interest_url_name]/[interest_id].js',
      signal
    });

    interestData = interestRes.data?.resource_response?.data || interestRes.data?.data || null;
    interestId = safeString(interestData?.id || '');
    isOfficialInterest = Boolean(
      interestRes.ok &&
      interestData &&
      interestData.is_interest !== false &&
      interestId &&
      interestId !== '0'
    );
  }

  if (!isOfficialInterest) {
    return {
      ok: false,
      surface: 'ideas_feeds',
      skipped_non_interest: true,
      term: cleanTerm,
      pins: [],
      pages_fetched: 0
    };
  }

  const urlName = safeString(interestData.url_name || slug);
  const ideasSourceUrl = `/ideas/${urlName}/${interestId}/`;
  const pSize = Math.max(10, Math.min(50, Number(pageSize) || 50));
  const pinTarget = targetPins !== null && targetPins !== undefined && Number(targetPins) > 0
    ? Math.max(25, Math.min(2000, Math.round(Number(targetPins))))
    : null;
  const maxP = Math.max(1, Math.min(60, pinTarget ? Math.ceil(pinTarget / Math.max(20, pSize)) + 2 : (Number(maxPages) || 2)));

  const pinsMap = new Map();
  let bookmark = null;
  let lastBookmark = null;
  let pagesFetched = 0;
  let usedSsrFallback = false;

  // Step 2: Deep pagination via BestPinsFeedAltResource/get when auth session is available
  if (router.canUseAuthSession) {
    for (let page = 1; page <= maxP; page++) {
      if (signal?.aborted) break;
      if (pinTarget !== null && pinsMap.size >= pinTarget) break;
      const opts = {
        interest_id: interestId,
        interest: urlName,
        url_name: urlName,
        field_set_key: 'grid_item',
        page_size: pSize,
        ...(bookmark ? { bookmarks: [bookmark] } : {})
      };
      const feedUrl = `https://www.pinterest.com/resource/BestPinsFeedAltResource/get/?source_url=${encodeURIComponent(ideasSourceUrl)}&data=${encodeURIComponent(JSON.stringify({ options: opts, context: {} }))}`;

      const feedRes = await router.requestJson(feedUrl, {
        endpointKey: 'best_pins_ideas',
        sourceUrl: ideasSourceUrl,
        handler: 'www/ideas/[interest_url_name]/[interest_id].js',
        signal
      });

      if (!feedRes.ok || !feedRes.data) break;
      pagesFetched++;

      const rr = feedRes.data?.resource_response?.data || feedRes.data?.data || [];
      const list = Array.isArray(rr) ? rr : (rr.results || rr.items || rr.pins || []);
      for (const raw of list) {
        if (pinTarget !== null && pinsMap.size >= pinTarget) break;
        const norm = normalizeSurfaceCandidatePin(raw, {
          surface: 'ideas_feeds',
          seed_query: interestData.key || cleanTerm
        });
        if (norm) {
          pinsMap.set(norm.pin_id, mergeCandidatePinRecords(pinsMap.get(norm.pin_id), norm));
        }
      }

      if (typeof onPageProgress === 'function' && (page === 1 || page % 3 === 0 || (pinTarget !== null && pinsMap.size >= pinTarget))) {
        await onPageProgress({ page, pagesFetched, collected: pinsMap.size, target: pinTarget });
      }

      if (pinTarget !== null && pinsMap.size >= pinTarget) break;
      bookmark = extractBookmark(feedRes.data);
      if (!bookmark || bookmark === lastBookmark) break;
      lastBookmark = bookmark;
    }
  }

  // Step 3: Zero-cookie SSR <script id="__PWS_INITIAL_PROPS__"> fallback
  if (pinsMap.size === 0 && !signal?.aborted) {
    const htmlRes = await router.requestJson(`https://www.pinterest.com${ideasSourceUrl}`, {
      endpointKey: 'ssr_page_zero_cookie',
      isDocumentHtml: true,
      referer: 'https://www.pinterest.com/',
      signal
    });

    if (htmlRes.ok && typeof htmlRes.data === 'string') {
      usedSsrFallback = true;
      pagesFetched++;
      const props = extractPwsInitialProps(htmlRes.data);
      const ssrPins = collectPinsFromSsrTree(props, pinTarget || (pSize * maxP));
      for (const sp of ssrPins) {
        if (pinTarget !== null && pinsMap.size >= pinTarget) break;
        const norm = normalizeSurfaceCandidatePin(sp, {
          surface: 'ideas_feeds',
          seed_query: interestData.key || cleanTerm
        });
        if (norm) {
          pinsMap.set(norm.pin_id, mergeCandidatePinRecords(pinsMap.get(norm.pin_id), norm));
        }
      }
    }
  }

  return {
    ok: pinsMap.size > 0,
    surface: 'ideas_feeds',
    skipped_non_interest: false,
    interest: {
      id: interestId,
      key: safeString(interestData.key || cleanTerm),
      url_name: urlName,
      idea_url: `https://www.pinterest.com${ideasSourceUrl}`,
      internal_search_count: Number(interestData.internal_search_count || 0)
    },
    pins: Array.from(pinsMap.values()),
    used_ssr_fallback: usedSsrFallback,
    pages_fetched: pagesFetched
  };
}
