/**
 * src/core/pinterest/creators.mjs
 *
 * Creator Profiles, Boards, Sections, RSS/Pidgets Streams, and Board Feed Clients.
 */

import { normalizeDomain, parseCleanMetric } from '../pinterest-parser.mjs';
import {
  getPinterestXhrHeaders,
  PINTEREST_PAGE_HEADERS,
  randomJitterMs,
  sleep,
  exponentialBackoffWithFullJitter,
  getDefaultDispatcher,
  pinterestFetch
} from './client.mjs';
import { formatPin } from './pins.mjs';

/**
 * Creator Visual Stream + Parallel RSS pubDate Fusion
 * Queries widgets.pinterest.com/v3/pidgets/users/{username}/pins/ (50 pins) and
 * pinterest.com/{username}/feed.rss (25 pins with pubDate) in parallel.
 *
 * @param {string} username - Pinterest creator username
 * @param {object} [options]
 * @returns {Promise<{ ok: boolean, user: object, pins: Array<object>, count: number }>}
 */
export async function fetchCreatorLatestPinsPidgets(username, options = {}) {
  const cleanUsername = String(username || '').replace(/^@/, '').trim().toLowerCase();
  if (!cleanUsername) {
    return { ok: false, error: 'invalid_username', pins: [] };
  }

  const dispatcher = options.dispatcher || getDefaultDispatcher();
  const timeoutMs = options.timeoutMs || 8000;

  const pidgetsUrl = `https://widgets.pinterest.com/v3/pidgets/users/${encodeURIComponent(cleanUsername)}/pins/`;
  const rssUrl = `https://www.pinterest.com/${encodeURIComponent(cleanUsername)}/feed.rss`;

  const [pidgetsResult, rssResult] = await Promise.allSettled([
    pinterestFetch(pidgetsUrl, {
      headers: {
        ...PINTEREST_PAGE_HEADERS,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
      },
      signal: AbortSignal.timeout(timeoutMs),
      dispatcher
    }).then(async r => {
      if (!r.ok) return { ok: false, status: r.status };
      return { ok: true, data: await r.json() };
    }),
    pinterestFetch(rssUrl, {
      headers: {
        ...PINTEREST_PAGE_HEADERS,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
      },
      signal: AbortSignal.timeout(timeoutMs),
      dispatcher
    }).then(async r => {
      if (!r.ok) return { ok: false, status: r.status };
      return { ok: true, xml: await r.text() };
    })
  ]);

  const pidgetsData = pidgetsResult.status === 'fulfilled' && pidgetsResult.value.ok ? pidgetsResult.value.data : null;
  const rssXml = rssResult.status === 'fulfilled' && rssResult.value.ok ? rssResult.value.xml : null;

  const pubDatesMap = new Map();
  if (rssXml) {
    const itemRegex = /<item>[\s\S]*?<\/item>/gi;
    let itemMatch;
    while ((itemMatch = itemRegex.exec(rssXml)) !== null) {
      const itemXml = itemMatch[0];
      const guidMatch = itemXml.match(/<guid[^>]*>.*?\/pin\/(\d+)\/?<\/guid>/i) || itemXml.match(/<link>.*?\/pin\/(\d+)\/?<\/link>/i);
      const pubDateMatch = itemXml.match(/<pubDate>(.*?)<\/pubDate>/i);
      if (guidMatch && guidMatch[1] && pubDateMatch && pubDateMatch[1]) {
        const d = new Date(pubDateMatch[1]);
        if (!isNaN(d.getTime())) {
          pubDatesMap.set(String(guidMatch[1]), d.toISOString());
        }
      }
    }
  }

  const rawUser = pidgetsData?.data?.user || {};
  const rawPins = pidgetsData?.data?.pins || [];

  const user = {
    username: cleanUsername,
    full_name: rawUser.full_name || cleanUsername,
    about: rawUser.about || '',
    profile_url: rawUser.profile_url || `https://www.pinterest.com/${cleanUsername}/`,
    image_small_url: rawUser.image_small_url || null,
    pin_count: Number(rawUser.pin_count || 0),
    follower_count: Number(rawUser.follower_count || 0)
  };

  const pins = [];
  for (const p of rawPins) {
    if (!p || !p.id) continue;
    const pinId = String(p.id);
    const standardImg = p.images?.['736x']?.url || p.images?.['564x']?.url || p.images?.['236x']?.url || '';
    const hdImg = standardImg ? standardImg.replace(/\/(236x|474x|564x|736x)\//, '/1200x/') : '';
    const link = p.link || '';
    const domain = p.domain || (link ? normalizeDomain('', link) : '') || '';

    const hasExplicitSaves = Boolean(
      p.aggregated_pin_data?.aggregated_stats?.saves !== undefined ||
      p.aggregated_stats?.saves !== undefined ||
      p.save_count !== undefined
    );
    const saves = Number(
      p.aggregated_pin_data?.aggregated_stats?.saves ??
      p.aggregated_stats?.saves ??
      p.save_count ??
      0
    );

    pins.push({
      pin_id: pinId,
      title: p.title || p.description || '',
      description: p.description || '',
      domain,
      link,
      destination_url: link,
      save_count: saves,
      saves,
      has_explicit_saves: hasExplicitSaves || saves > 0,
      repin_count: Number(p.repin_count || 0),
      repins: Number(p.repin_count || 0),
      image_url: standardImg,
      image_hd_url: hdImg,
      created_at: pubDatesMap.get(pinId) || null,
      created_at_pinterest: pubDatesMap.get(pinId) || null
    });
  }

  return {
    ok: true,
    user,
    pins,
    count: pins.length
  };
}

/**
 * Board Sections Client (BoardSectionsResource)
 * Extracts board subsection hierarchies, pin counts, and preview pins.
 *
 * @param {string|number} boardId - Pinterest board ID
 * @param {string} [usernameOrSourceUrl=''] - Creator username or full sourceUrl
 * @param {string} [boardSlug=''] - Board slug
 * @param {object} [options={}]
 * @returns {Promise<{ ok: boolean, board_id: string, sections: Array<object>, error?: string }>}
 */
export async function fetchBoardSectionsResource(boardId, usernameOrSourceUrl = '', boardSlug = '', options = {}) {
  const cleanBoardId = String(boardId || '').trim();
  if (!cleanBoardId) {
    return { ok: false, error: 'invalid_board_id', board_id: '', sections: [] };
  }

  const opts = (typeof usernameOrSourceUrl === 'object' && usernameOrSourceUrl !== null)
    ? usernameOrSourceUrl
    : (typeof boardSlug === 'object' && boardSlug !== null ? boardSlug : (options || {}));

  const dispatcher = opts.dispatcher || getDefaultDispatcher();
  const timeoutMs = opts.timeoutMs || 8000;

  let sourceUrl = '/';
  let cleanUser = '';
  if (typeof usernameOrSourceUrl === 'string' && usernameOrSourceUrl.trim()) {
    if (usernameOrSourceUrl.startsWith('/')) {
      sourceUrl = usernameOrSourceUrl;
    } else {
      cleanUser = usernameOrSourceUrl.replace(/^@/, '').trim();
      const slug = typeof boardSlug === 'string' ? boardSlug.trim() : '';
      sourceUrl = slug ? `/${cleanUser}/${slug}/` : `/${cleanUser}/`;
    }
  }

  const dataPayload = {
    options: { board_id: cleanBoardId },
    context: {}
  };

  const url = `https://www.pinterest.com/resource/BoardSectionsResource/get/?source_url=${encodeURIComponent(sourceUrl)}&data=${encodeURIComponent(JSON.stringify(dataPayload))}`;
  const headers = getPinterestXhrHeaders(cleanUser, '', {
    sourceUrl,
    extraHeaders: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    }
  });

  try {
    const res = await pinterestFetch(url, {
      headers,
      signal: AbortSignal.timeout(timeoutMs),
      dispatcher
    });

    if (res.status === 404) {
      if (res.body) await res.body.cancel().catch(() => {});
      return { ok: false, status: 404, error: 'board_not_found', board_id: cleanBoardId, sections: [] };
    }

    if (!res.ok) {
      if (res.body) await res.body.cancel().catch(() => {});
      return { ok: false, status: res.status, error: `http_${res.status}`, board_id: cleanBoardId, sections: [] };
    }

    const json = await res.json();
    const rawSections = json?.resource_response?.data || json?.data || [];
    const sectionList = Array.isArray(rawSections) ? rawSections : [];

    const sections = sectionList.map(s => {
      const previewPins = (s.preview_pins || []).map(p => {
        const standardImg = p.images?.['736x']?.url || p.images?.['236x']?.url || '';
        return {
          id: String(p.id || ''),
          image_url: standardImg,
          image_hd_url: standardImg ? standardImg.replace(/\/(236x|474x|564x|736x)\//, '/1200x/') : '',
          save_count: Number(p.aggregated_pin_data?.aggregated_stats?.saves || p.aggregated_stats?.saves || 0),
          repin_count: Number(p.repin_count || 0)
        };
      });

      return {
        id: String(s.id || ''),
        title: s.title || s.name || '',
        slug: s.slug || '',
        pin_count: Number(s.pin_count || 0),
        preview_pins: previewPins
      };
    });

    return {
      ok: true,
      board_id: cleanBoardId,
      sections,
      count: sections.length
    };
  } catch (err) {
    return { ok: false, error: err.message, board_id: cleanBoardId, sections: [] };
  }
}

export async function fetchUserProfileUnauth(username, options = {}) {
  const cleanUser = String(username || '').replace(/^@/, '').trim().toLowerCase();
  if (!cleanUser) return { ok: false, error: 'invalid_username' };
  const dispatcher = options.dispatcher || getDefaultDispatcher();

  try {
    const url = `https://www.pinterest.com/${cleanUser}/`;
    const res = await pinterestFetch(url, {
      headers: PINTEREST_PAGE_HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
      dispatcher
    });

    if (!res.ok) {
      if (res.body) await res.body.cancel().catch(() => {});
      return { ok: false, status: res.status };
    }
    const html = await res.text();

    let userData = null;
    const initialBoards = [];

    const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    while ((match = scriptRegex.exec(html)) !== null) {
      const scriptContent = match[1];
      if (scriptContent.includes('initialReduxState')) {
        try {
          const parsed = JSON.parse(scriptContent);
          const state = parsed.initialReduxState || {};
          const users = state.users || {};
          for (const [k, u] of Object.entries(users)) {
            if (u && (u.username?.toLowerCase() === cleanUser || (k && k !== '' && !userData))) {
              userData = u;
            }
          }
          if (state.boards && typeof state.boards === 'object') {
            for (const b of Object.values(state.boards)) {
              if (b && b.id && !String(b.id).startsWith('-')) {
                const coverImg = b.image_cover_hd_url || b.image_cover_url || b.images?.['736x']?.url || b.images?.['236x']?.url || b.image_thumbnail_url || null;
                const rawVase = b.board_vase || [];
                const boardVase = Array.isArray(rawVase) ? rawVase.map(v => {
                  if (typeof v === 'string') return { text: v.trim(), link: '' };
                  return {
                    text: String(v?.text || '').trim(),
                    link: v?.link ? (v.link.startsWith('http') ? v.link : `https://www.pinterest.com${v.link}`) : ''
                  };
                }).filter(v => v.text.length > 0) : [];
                const desc = b.description || '';

                initialBoards.push({
                  board_id: String(b.id),
                  name: b.name || 'Untitled Board',
                  url: b.url ? (b.url.startsWith('http') ? b.url : `https://www.pinterest.com${b.url}`) : '',
                  pin_count: parseCleanMetric(b.pin_count || 0),
                  follower_count: parseCleanMetric(b.follower_count || 0),
                  image_cover_url: coverImg,
                  board_vase: boardVase,
                  description: desc,
                  metadata: {
                    image_cover_url: coverImg,
                    board_vase: boardVase,
                    description: desc
                  }
                });
              }
            }
          }
        } catch (_) {}
      }
    }

    if (!userData) {
      return { ok: false, error: 'user_not_found', status: 404 };
    }

    const monthlyViews = parseCleanMetric(userData.profile_views ?? userData.monthly_views ?? 0, 0, { preserveCeiling: true, cap: 0 });
    const monthlyReach = parseCleanMetric(userData.profile_reach ?? userData.monthly_reach ?? userData.reach ?? 0, 0, { preserveCeiling: true, cap: 0 });
    const followerCount = parseCleanMetric(userData.follower_count ?? 0, 0, { preserveCeiling: true, cap: 0 });
    const followingCount = parseCleanMetric(userData.following_count ?? 0, 0, { preserveCeiling: true, cap: 0 });
    const pinCount = parseCleanMetric(userData.pin_count ?? userData.total_pins ?? 0, 0, { preserveCeiling: true, cap: 0 });
    const boardCount = parseCleanMetric(userData.board_count ?? userData.total_boards ?? initialBoards.length, 0, { preserveCeiling: true, cap: 0 });

    return {
      ok: true,
      username: cleanUser,
      display_name: userData.full_name || cleanUser,
      avatar_url: userData.image_xlarge_url || userData.image_large_url || userData.image_medium_url || null,
      bio: userData.about || '',
      website_url: userData.website_url || userData.domain_url || null,
      monthly_views: monthlyViews,
      profile_views: monthlyViews,
      total_audience: monthlyReach,
      monthly_reach: monthlyReach,
      follower_count: followerCount,
      following_count: followingCount,
      pin_count: pinCount,
      total_pins: pinCount,
      board_count: boardCount,
      total_boards: boardCount,
      account_created_at: userData.created_at || null,
      last_pin_save_time: userData.last_pin_save_time || null,
      pinterest_id: userData.id ? String(userData.id) : null,
      group_board_count: userData.group_board_count !== undefined ? parseCleanMetric(userData.group_board_count, 0) : undefined,
      domain_verified: userData.domain_verified !== undefined ? Boolean(userData.domain_verified) : undefined,
      is_verified_merchant: userData.is_verified_merchant !== undefined ? Boolean(userData.is_verified_merchant) : undefined,
      has_catalog: userData.has_catalog !== undefined ? Boolean(userData.has_catalog) : undefined,
      video_pin_count: userData.video_pin_count !== undefined ? parseCleanMetric(userData.video_pin_count, 0) : undefined,
      story_pin_count: userData.story_pin_count !== undefined ? parseCleanMetric(userData.story_pin_count, 0) : undefined,
      initial_boards: initialBoards
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function fetchUserResource(username, activeCookie = '', options = {}) {
  const cleanUser = String(username || '').replace(/^@/, '').trim().toLowerCase();
  if (!cleanUser) return { ok: false, error: 'invalid_username' };
  const dispatcher = options.dispatcher || getDefaultDispatcher();

  const url = `https://www.pinterest.com/resource/UserResource/get/?source_url=%2F${cleanUser}%2F&data=%7B%22options%22%3A%7B%22username%22%3A%22${cleanUser}%22%2C%22field_set_key%22%3A%22profile%22%7D%2C%22context%22%3A%7B%7D%7D`;
  const headers = getPinterestXhrHeaders(cleanUser, activeCookie);

  try {
    let res = await pinterestFetch(url, { headers, signal: AbortSignal.timeout(8000), dispatcher });
    if (res.status === 401 || res.status === 403 || res.status === 429) {
      if (res.body) await res.body.cancel().catch(() => {});
      await sleep(exponentialBackoffWithFullJitter(1, 2000, 6000));
      const anonHeaders = getPinterestXhrHeaders(cleanUser, '');
      res = await pinterestFetch(url, { headers: anonHeaders, signal: AbortSignal.timeout(8000), dispatcher });
    }

    if (!res.ok) {
      if (res.body) await res.body.cancel().catch(() => {});
      const unauthRes = await fetchUserProfileUnauth(cleanUser, { dispatcher });
      if (unauthRes.ok) return unauthRes;
      return { ok: false, status: res.status };
    }
    const json = await res.json();
    if (json.resource_response?.status === 'failure' || json.resource_response?.error) {
      const unauthRes = await fetchUserProfileUnauth(cleanUser);
      if (unauthRes.ok) return unauthRes;
      const errMsg = json.resource_response?.error?.message || json.resource_response?.message || 'Pinterest resource failure';
      return { ok: false, error: errMsg };
    }
    const data = json.resource_response?.data;
    if (!data) {
      const unauthRes = await fetchUserProfileUnauth(cleanUser);
      if (unauthRes.ok) return unauthRes;
      return { ok: false, error: 'no_data' };
    }

    const monthlyViews = parseCleanMetric(data.profile_views ?? data.monthly_views ?? 0, 0, { preserveCeiling: true, cap: 0 });
    const monthlyReach = parseCleanMetric(data.profile_reach ?? data.monthly_reach ?? data.reach ?? 0, 0, { preserveCeiling: true, cap: 0 });
    const followerCount = parseCleanMetric(data.follower_count ?? 0, 0, { preserveCeiling: true, cap: 0 });
    const followingCount = parseCleanMetric(data.following_count ?? 0, 0, { preserveCeiling: true, cap: 0 });
    const pinCount = parseCleanMetric(data.pin_count ?? data.total_pins ?? 0, 0, { preserveCeiling: true, cap: 0 });
    const boardCount = parseCleanMetric(data.board_count ?? data.total_boards ?? 0, 0, { preserveCeiling: true, cap: 0 });

    return {
      ok: true,
      username: cleanUser,
      display_name: data.full_name || cleanUser,
      avatar_url: data.image_xlarge_url || data.image_large_url || data.image_medium_url || null,
      bio: data.about || '',
      website_url: data.website_url || data.domain_url || null,
      monthly_views: monthlyViews,
      profile_views: monthlyViews,
      total_audience: monthlyReach,
      monthly_reach: monthlyReach,
      follower_count: followerCount,
      following_count: followingCount,
      pin_count: pinCount,
      total_pins: pinCount,
      board_count: boardCount,
      total_boards: boardCount,
      account_created_at: data.created_at || null,
      last_pin_save_time: data.last_pin_save_time || null,
      pinterest_id: data.id ? String(data.id) : null,
      group_board_count: data.group_board_count !== undefined ? parseCleanMetric(data.group_board_count, 0) : undefined,
      domain_verified: data.domain_verified !== undefined ? Boolean(data.domain_verified) : undefined,
      is_verified_merchant: data.is_verified_merchant !== undefined ? Boolean(data.is_verified_merchant) : undefined,
      has_catalog: data.has_catalog !== undefined ? Boolean(data.has_catalog) : undefined,
      video_pin_count: data.video_pin_count !== undefined ? parseCleanMetric(data.video_pin_count, 0) : undefined,
      story_pin_count: data.story_pin_count !== undefined ? parseCleanMetric(data.story_pin_count, 0) : undefined
    };
  } catch (err) {
    const unauthRes = await fetchUserProfileUnauth(cleanUser);
    if (unauthRes.ok) return unauthRes;
    return { ok: false, error: err.message };
  }
}

export async function fetchBoardsResource(username, activeCookie = '', maxPages = 45, options = {}) {
  const cleanUser = String(username || '').replace(/^@/, '').trim().toLowerCase();
  if (!cleanUser) return { ok: false, error: 'invalid_username', boards: [] };
  const dispatcher = options.dispatcher || getDefaultDispatcher();

  const boards = [];
  const seenBoardIds = new Set();
  let bookmark = null;
  let lastSeenBookmark = null;
  const pageLimit = Math.max(1, Math.min(Number(maxPages) || 45, 100));

  for (let page = 1; page <= pageLimit; page++) {
    const opts = {
      privacy_filter: 'all',
      sort: 'last_pinned_to',
      field_set_key: 'profile_grid_item',
      filter_stories: false,
      username: cleanUser,
      page_size: 50,
      group_by: 'visibility',
      include_archived: true,
      filter_all_pins: false,
      add_fields: 'board.{meal_plan,collaborator_count,is_collaborative,owner}'
    };
    if (bookmark) opts.bookmarks = [bookmark];

    const src = `/${cleanUser}/`;
    const url = `https://www.pinterest.com/resource/BoardsResource/get/?source_url=${encodeURIComponent(src)}&data=${encodeURIComponent(JSON.stringify({ options: opts, context: {} }))}&_=${Date.now()}`;
    const headers = getPinterestXhrHeaders(cleanUser, activeCookie, { sourceUrl: src });

    try {
      let res = await pinterestFetch(url, { headers, signal: AbortSignal.timeout(8000), dispatcher });
      if (res.status === 401 || res.status === 403 || res.status === 429) {
        if (res.body) await res.body.cancel().catch(() => {});
        await sleep(randomJitterMs(2500, 4000));
        const anonHeaders = getPinterestXhrHeaders(cleanUser, '', { sourceUrl: src });
        res = await pinterestFetch(url, { headers: anonHeaders, signal: AbortSignal.timeout(8000), dispatcher });
      }

      if (!res.ok) {
        if (res.body) await res.body.cancel().catch(() => {});
        if (page === 1) {
          const unauth = await fetchUserProfileUnauth(cleanUser, { dispatcher });
          if (unauth.ok && Array.isArray(unauth.initial_boards) && unauth.initial_boards.length > 0) {
            return { ok: true, boards: unauth.initial_boards };
          }
          return { ok: false, status: res.status, boards: [] };
        }
        break;
      }

      const json = await res.json();
      if (json.resource_response?.status === 'failure' || json.resource_response?.error) {
        if (page === 1) {
          const errMsg = json.resource_response?.error?.message || json.resource_response?.message || 'Pinterest resource failure';
          return { ok: false, error: errMsg, boards: [] };
        }
        break;
      }

      const items = json.resource_response?.data || [];
      const rawList = Array.isArray(items) ? items : (items?.items || items?.boards || []);

      for (const item of rawList) {
        if (item && (item.type === 'board' || item.id || item.node_id)) {
          const boardId = String(item.id || item.node_id || '').trim();
          if (!boardId || boardId === 'undefined' || boardId.startsWith('-')) continue;
          if (seenBoardIds.has(boardId)) continue;
          seenBoardIds.add(boardId);

          if ((item.name === 'Untitled Board' || !item.name) && !item.url) continue;
          let lastPinned = null;
          if (item.board_order_modified_at) {
            const d = new Date(item.board_order_modified_at);
            if (!isNaN(d.getTime())) lastPinned = d.toISOString();
          }
          let boardCreatedAt = null;
          if (item.created_at) {
            const cd = new Date(item.created_at);
            if (!isNaN(cd.getTime())) boardCreatedAt = cd.toISOString();
          }
          let boardUrl = '';
          if (item.url) {
            boardUrl = item.url.startsWith('http') ? item.url : `https://www.pinterest.com${item.url.startsWith('/') ? '' : '/'}${item.url}`;
          }
          const coverImg = item.image_cover_hd_url || item.image_cover_url || item.images?.['736x']?.url || item.images?.['236x']?.url || item.image_thumbnail_url || null;
          const rawVase = item.board_vase || [];
          const boardVase = Array.isArray(rawVase) ? rawVase.map(v => {
            if (typeof v === 'string') return { text: v.trim(), link: '' };
            return {
              text: String(v?.text || '').trim(),
              link: v?.link ? (v.link.startsWith('http') ? v.link : `https://www.pinterest.com${v.link}`) : ''
            };
          }).filter(v => v.text.length > 0) : [];
          const desc = item.description || '';

          const rawOwner = item.owner || {};
          const ownerUsername = rawOwner.username ? String(rawOwner.username).toLowerCase() : null;
          const collaboratorCount = parseCleanMetric(item.collaborator_count || 0);
          const isCollaborative = Boolean(item.is_collaborative || item.collaborative);
          const isGroupBoard = Boolean(isCollaborative || (ownerUsername && ownerUsername !== cleanUser) || collaboratorCount > 0);

          boards.push({
            board_id: boardId,
            name: item.name || 'Untitled Board',
            url: boardUrl,
            pin_count: parseCleanMetric(item.pin_count || 0),
            follower_count: parseCleanMetric(item.follower_count || 0),
            last_pinned_at: lastPinned,
            created_at: boardCreatedAt,
            image_cover_url: coverImg,
            board_vase: boardVase,
            description: desc,
            is_group_board: isGroupBoard,
            owner_username: ownerUsername,
            collaborator_count: collaboratorCount,
            metadata: {
              image_cover_url: coverImg,
              board_vase: boardVase,
              description: desc,
              section_count: item.section_count || 0,
              privacy: item.privacy || 'public',
              is_collaborative: isCollaborative,
              is_group_board: isGroupBoard,
              owner_username: ownerUsername,
              collaborator_count: collaboratorCount
            }
          });
        }
      }

      const rawBookmark = json.resource_response?.bookmark ||
        (Array.isArray(json.resource_response?.bookmarks) ? json.resource_response.bookmarks[0] : null);
      bookmark = (rawBookmark && rawBookmark !== '-end-') ? String(rawBookmark).trim() : null;

      if (!bookmark || bookmark === lastSeenBookmark) break;
      lastSeenBookmark = bookmark;

      if (page < pageLimit) {
        await sleep(randomJitterMs(250, 450));
      }
    } catch (err) {
      if (page === 1) {
        const unauth = await fetchUserProfileUnauth(cleanUser);
        if (unauth.ok && Array.isArray(unauth.initial_boards) && unauth.initial_boards.length > 0) {
          return { ok: true, boards: unauth.initial_boards };
        }
        return { ok: false, error: err.message, boards: [] };
      }
      break;
    }
  }

  if (boards.length === 0) {
    const unauth = await fetchUserProfileUnauth(cleanUser);
    if (unauth.ok && Array.isArray(unauth.initial_boards) && unauth.initial_boards.length > 0) {
      return { ok: true, boards: unauth.initial_boards };
    }
  }

  return { ok: true, boards };
}

export async function fetchUserActivityPinsResource(username, bookmark = null, activeCookie = '', options = {}) {
  const cleanUser = String(username || '').replace(/^@/, '').trim().toLowerCase();
  if (!cleanUser) return { ok: false, error: 'invalid_username', pins: [], nextBookmark: null };
  const dispatcher = options.dispatcher || getDefaultDispatcher();

  const src = `/${cleanUser}/_created/`;
  const opts = {
    exclude_add_pin_rep: true,
    field_set_key: 'profile_created_grid_item',
    is_own_profile_pins: false,
    username: cleanUser,
    page_size: 50,
    data: { page_size: 50 },
    noCache: true
  };
  if (bookmark) opts.bookmarks = [bookmark];

  const url = `https://www.pinterest.com/resource/UserActivityPinsResource/get/?source_url=${encodeURIComponent(
    src
  )}&data=${encodeURIComponent(JSON.stringify({ options: opts, context: {} }))}&_=${Date.now()}`;

  const headers = getPinterestXhrHeaders(cleanUser, activeCookie, { sourceUrl: src });

  try {
    let res = await pinterestFetch(url, { headers, signal: AbortSignal.timeout(8000), dispatcher });
    if (res.status === 401 || res.status === 403 || res.status === 429) {
      if (res.body) await res.body.cancel().catch(() => {});
      await sleep(randomJitterMs(2500, 4000));
      const anonHeaders = getPinterestXhrHeaders(cleanUser, '', { sourceUrl: src });
      res = await pinterestFetch(url, { headers: anonHeaders, signal: AbortSignal.timeout(8000), dispatcher });
    }

    if (!res.ok) {
      if (res.body) await res.body.cancel().catch(() => {});
      return { ok: false, status: res.status, pins: [], nextBookmark: null };
    }
    const json = await res.json();
    if (json.resource_response?.status === 'failure' || json.resource_response?.error) {
      const errMsg = json.resource_response?.error?.message || json.resource_response?.message || 'Pinterest resource failure';
      return { ok: false, error: errMsg, pins: [], nextBookmark: null };
    }
    const data = json.resource_response?.data;
    const rawBookmark = json.resource_response?.bookmark ||
      (Array.isArray(json.resource_response?.bookmarks) ? json.resource_response.bookmarks[0] : null);
    const nextBookmark = (rawBookmark && rawBookmark !== '-end-') ? String(rawBookmark).trim() : null;

    const rawList = Array.isArray(data) ? data : (data?.items || data?.pins || data?.results || []);

    const formattedPins = [];
    for (const raw of rawList) {
      const p = formatPin(raw);
      if (p && p.pin_id) {
        formattedPins.push(p);
      }
    }

    return { ok: true, pins: formattedPins, nextBookmark };
  } catch (err) {
    return { ok: false, error: err.message, pins: [], nextBookmark: null };
  }
}

export async function fetchBoardFeedResource(boardId, boardUrl, bookmark = null, activeCookie = '', options = {}) {
  const cleanId = String(boardId || '').trim();
  if (!cleanId) return { ok: false, error: 'invalid_board_id', pins: [], nextBookmark: null };
  const dispatcher = options.dispatcher || getDefaultDispatcher();

  let srcUrl = String(boardUrl || '').trim();
  if (srcUrl.startsWith('http')) {
    try {
      srcUrl = new URL(srcUrl).pathname;
    } catch (_) {}
  }
  if (!srcUrl.startsWith('/')) srcUrl = `/${srcUrl}`;
  if (!srcUrl.endsWith('/')) srcUrl = `${srcUrl}/`;

  const pathParts = srcUrl.split('/').filter(Boolean);
  const username = pathParts[0] || '';

  const opts = {
    board_id: cleanId,
    board_url: srcUrl,
    field_set_key: 'grid_item',
    filter_section_pins: true,
    sort: 'default',
    page_size: 25
  };
  if (bookmark) opts.bookmarks = [bookmark];

  const url = `https://www.pinterest.com/resource/BoardFeedResource/get/?source_url=${encodeURIComponent(
    srcUrl
  )}&data=${encodeURIComponent(JSON.stringify({ options: opts, context: {} }))}&_=${Date.now()}`;

  const headers = getPinterestXhrHeaders(username, activeCookie, { sourceUrl: srcUrl });

  try {
    let res = await pinterestFetch(url, { headers, signal: AbortSignal.timeout(8000), dispatcher });
    if (res.status === 401 || res.status === 403 || res.status === 429) {
      if (res.body) await res.body.cancel().catch(() => {});
      await sleep(randomJitterMs(2500, 4000));
      const anonHeaders = getPinterestXhrHeaders(username, '', { sourceUrl: srcUrl });
      res = await pinterestFetch(url, { headers: anonHeaders, signal: AbortSignal.timeout(8000), dispatcher });
    }

    if (!res.ok) {
      if (res.body) await res.body.cancel().catch(() => {});
      return { ok: false, status: res.status, pins: [], nextBookmark: null };
    }
    const json = await res.json();
    if (json.resource_response?.status === 'failure' || json.resource_response?.error) {
      const errMsg = json.resource_response?.error?.message || json.resource_response?.message || 'Pinterest resource failure';
      return { ok: false, error: errMsg, pins: [], nextBookmark: null };
    }
    const data = json.resource_response?.data;
    const rawBookmark = json.resource_response?.bookmark ||
      (Array.isArray(json.resource_response?.bookmarks) ? json.resource_response.bookmarks[0] : null);
    const nextBookmark = (rawBookmark && rawBookmark !== '-end-') ? String(rawBookmark).trim() : null;

    const rawList = Array.isArray(data) ? data : (data?.items || data?.pins || data?.results || []);

    const formattedPins = [];
    for (const raw of rawList) {
      const p = formatPin(raw);
      if (p && p.pin_id) {
        formattedPins.push(p);
      }
    }

    return { ok: true, pins: formattedPins, nextBookmark };
  } catch (err) {
    return { ok: false, error: err.message, pins: [], nextBookmark: null };
  }
}

export async function fetchBoardDetailUnauth(username, boardSlugOrName, options = {}) {
  const cleanUser = String(username || '').replace(/^@/, '').trim().toLowerCase();
  if (!cleanUser) return { ok: false, error: 'invalid_username' };
  const dispatcher = options.dispatcher || getDefaultDispatcher();

  let rawBoard = String(boardSlugOrName || '').trim();
  if (rawBoard.startsWith('http')) {
    try {
      const u = new URL(rawBoard);
      const parts = u.pathname.split('/').filter(Boolean);
      rawBoard = parts[1] || parts[0] || '';
    } catch (_) {}
  }
  const cleanSlug = rawBoard
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]+/gu, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

  if (!cleanSlug) return { ok: false, error: 'invalid_board_name' };

  const url = `https://www.pinterest.com/${cleanUser}/${cleanSlug}/`;
  try {
    let res = await pinterestFetch(url, {
      headers: PINTEREST_PAGE_HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
      dispatcher
    });

    if (res.status === 401 || res.status === 403 || res.status === 429) {
      if (res.body) await res.body.cancel().catch(() => {});
      await sleep(randomJitterMs(2500, 4000));
      res = await pinterestFetch(url, {
        headers: PINTEREST_PAGE_HEADERS,
        redirect: 'follow',
        signal: AbortSignal.timeout(8000),
        dispatcher
      });
    }

    if (!res.ok) {
      if (res.body) await res.body.cancel().catch(() => {});
      return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    }
    const html = await res.text();

    let targetBoard = null;

    const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    while ((match = scriptRegex.exec(html)) !== null) {
      const content = match[1];
      if (content.includes('initialReduxState') && (content.includes('boards') || content.includes('board_vase'))) {
        try {
          const parsed = JSON.parse(content);
          const boards = parsed?.initialReduxState?.boards || {};
          for (const [id, b] of Object.entries(boards)) {
            if (b && (b.id || b.name)) {
              const bSlug = String(b.url || b.name || '')
                .toLowerCase()
                .replace(/[^\w\s-]/g, '')
                .trim()
                .replace(/\s+/g, '-');
              if (bSlug.includes(cleanSlug) || cleanSlug.includes(bSlug) || String(id) === cleanSlug) {
                targetBoard = b;
                break;
              }
            }
          }
          if (targetBoard) break;
        } catch (_) {}
      }
    }

    if (!targetBoard) {
      return { ok: false, status: 404, error: 'board_not_found_in_ssr' };
    }

    const coverImg = targetBoard.image_cover_hd_url || targetBoard.image_cover_url || targetBoard.images?.['736x']?.url || targetBoard.images?.['236x']?.url || targetBoard.image_thumbnail_url || null;
    const rawVase = targetBoard.board_vase || [];
    const boardVase = Array.isArray(rawVase) ? rawVase.map(v => {
      if (typeof v === 'string') return { text: v.trim(), link: '' };
      return {
        text: String(v?.text || '').trim(),
        link: v?.link ? (v.link.startsWith('http') ? v.link : `https://www.pinterest.com${v.link}`) : ''
      };
    }).filter(v => v.text.length > 0) : [];
    const desc = targetBoard.description || '';

    return {
      ok: true,
      board_id: String(targetBoard.id || ''),
      name: targetBoard.name || 'Untitled Board',
      slug: cleanSlug,
      url: targetBoard.url ? (targetBoard.url.startsWith('http') ? targetBoard.url : `https://www.pinterest.com${targetBoard.url}`) : `https://www.pinterest.com/${cleanUser}/${cleanSlug}/`,
      pin_count: parseCleanMetric(targetBoard.pin_count || 0),
      follower_count: parseCleanMetric(targetBoard.follower_count || 0),
      image_cover_url: coverImg,
      board_vase: boardVase,
      description: desc,
      metadata: {
        image_cover_url: coverImg,
        board_vase: boardVase,
        description: desc
      }
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
