/**
 * scripts/lib/pinterest.mjs
 *
 * Pure shared Pinterest Scraping, Parsing & Reverse-Engineering Library.
 * Origin: sayfedin-star/pinorbit-v2 (adapted for pin-arbitrage-engine).
 *
 * Features:
 * - Chrome 151 User-Agent & Client Hints Fingerprinting.
 * - 8-Stage HTML / Relay / GraphQL / Redux / JSON-LD / Meta Parser.
 * - Recursive pin tree traverser (findPinInTree).
 * - Pinterest annotations & AI semantic tags extractor (visual_annotation & annotationsWithLinksArray).
 * - Monotonic metrics normalizer.
 * - Resilient XHR endpoints with AbortSignal.timeout(8000) and jitter.
 */

export const PINTEREST_PAGE_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
  'Accept':
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'sec-ch-ua': '"Not=A?Brand";v="99", "Google Chrome";v="151", "Chromium";v="151"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'upgrade-insecure-requests': '1',
  'Cache-Control': 'no-cache',
};

export function getPinterestXhrHeaders(username, activeCookie = '', options = {}) {
  const cleanUser = String(username || '').replace(/^@/, '').trim();
  const src = options.sourceUrl || `/${cleanUser}/_created/`;
  const handler = options.handler || `www/${cleanUser}/_created.js`;

  return {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8',
    'X-Requested-With': 'XMLHttpRequest',
    'X-App-Version': '9302641',
    'X-Pinterest-AppState': 'active',
    'X-Pinterest-PWS-Handler': handler,
    'X-Pinterest-Source-Url': src,
    'Referer': `https://www.pinterest.com${src}`,
    'Cookie': activeCookie || '',
    ...(options.extraHeaders || {}),
  };
}

export function randomJitterMs(min = 2500, max = 4000) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Recursively search a Pinterest JSON/Redux/Relay object tree for a pin matching pinId.
 */
export function findPinInTree(obj, pinId, depth = 0) {
  if (depth > 20 || !obj || typeof obj !== 'object') return null;
  if (
    String(obj.id) === String(pinId) &&
    (obj.aggregated_pin_data || obj.aggregatedStats || obj.repin_count !== undefined || obj.repinCount !== undefined)
  ) {
    return obj;
  }
  if (String(obj.entityId) === String(pinId)) return obj;
  if (obj[pinId] && typeof obj[pinId] === 'object') return obj[pinId];
  for (const key of Object.keys(obj)) {
    const found = findPinInTree(obj[key], pinId, depth + 1);
    if (found) return found;
  }
  return null;
}

/**
 * Normalize and format raw Pinterest pin data across diverse payload shapes into a consistent object.
 */
export function formatPin(pin) {
  if (!pin || typeof pin !== 'object') return null;

  const st =
    pin?.aggregated_pin_data?.aggregated_stats ||
    pin?.aggregatedPinData?.aggregatedStats ||
    pin?.aggregatedStats ||
    {};

  // Extract annotations: annotationsWithLinksArray (rich) + visual_annotation fallback
  const withLinks =
    pin?.pin_join?.annotationsWithLinksArray ||
    pin?.pinJoin?.annotationsWithLinksArray ||
    pin?.annotationsWithLinksArray ||
    [];
  const visual =
    pin?.pin_join?.visual_annotation ||
    pin?.visual_annotation ||
    pin?.pinJoin?.visualAnnotation ||
    pin?.visualAnnotation ||
    [];

  const annotationsMap = new Map();
  for (const item of Array.isArray(withLinks) ? withLinks : []) {
    const rawName = typeof item?.name === 'string' ? item.name.trim() : '';
    if (rawName) {
      const lower = rawName.toLowerCase();
      const ideaId = item.idea_id ?? item.ideaId ?? (String(item.url || '').match(/\/ideas\/[^/]+\/(\d+)/)?.[1] || null);
      const url = item.url || null;
      const existing = annotationsMap.get(lower);
      if (!existing) {
        annotationsMap.set(lower, { name: rawName, idea_id: ideaId, url: url });
      } else {
        if (!existing.idea_id && ideaId) existing.idea_id = ideaId;
        if (!existing.url && url) existing.url = url;
      }
    }
  }
  for (const name of Array.isArray(visual) ? visual : []) {
    if (typeof name === 'string' && name.trim()) {
      const rawName = name.trim();
      const lower = rawName.toLowerCase();
      if (!annotationsMap.has(lower)) {
        annotationsMap.set(lower, { name: rawName, idea_id: null, url: null });
      }
    }
  }
  if (annotationsMap.size === 0 && Array.isArray(pin?.annotations)) {
    for (const item of pin.annotations) {
      if (typeof item === 'string' && item.trim()) {
        const rawName = item.trim();
        const lower = rawName.toLowerCase();
        if (!annotationsMap.has(lower)) {
          annotationsMap.set(lower, { name: rawName, idea_id: null, url: null });
        }
      } else if (typeof item === 'object' && item?.name) {
        const rawName = String(item.name).trim();
        const lower = rawName.toLowerCase();
        if (!annotationsMap.has(lower)) {
          annotationsMap.set(lower, {
            name: rawName,
            idea_id: item.idea_id ? String(item.idea_id).trim() : null,
            url: item.url ? String(item.url).trim() : null,
          });
        }
      }
    }
  }

  const annotations = Array.from(annotationsMap.values());

  const saves = Number(
    st.saves ??
    st.save_count ??
    pin.save_count ??
    pin.saves ??
    pin.aggregated_pin_data?.saves ??
    0
  );

  const repins = Number(
    st.repins ??
    st.repin_count ??
    pin.repin_count ??
    pin.repins ??
    pin.aggregated_pin_data?.repins ??
    saves
  );

  const comments = Number(
    pin.comment_count ??
    pin.commentCount ??
    pin.comments ??
    st.comment_count ??
    pin.aggregated_pin_data?.comment_count ??
    0
  );

  const pinId = String(pin.id || pin.pin_id || pin.node_id || '').trim();

  // Created at date & velocity calculation (safely handling malformed dates)
  const createdRaw = pin.created_at || pin.created_at_pinterest || pin.createdAt;
  let createdAtPinterest = new Date().toISOString();
  let createdMs = Date.now();
  if (createdRaw) {
    const d = new Date(createdRaw);
    if (!isNaN(d.getTime())) {
      createdAtPinterest = d.toISOString();
      createdMs = d.getTime();
    }
  }
  const ageDays = !Number.isFinite(createdMs) || createdMs <= 0
    ? 1
    : Math.max(1, (Date.now() - createdMs) / 86400000);
  const velocity = Math.round((saves / ageDays) * 100) / 100;

  // Domain extraction (safely handling relative or malformed URLs)
  let domain = pin.domain || '';
  if (!domain && (pin.link || pin.url)) {
    try {
      domain = new URL(pin.link || pin.url).hostname;
    } catch (_) {
      domain = '';
    }
  }

  // Image URL
  const imageUrl =
    pin.images?.orig?.url ||
    pin.images?.['736x']?.url ||
    pin.images?.['474x']?.url ||
    pin.image_large_url ||
    pin.image_url ||
    pin.image ||
    '';

  // Dominant color
  const dominantColor = pin.dominant_color || pin.dominantColor || '#888888';

  return {
    pin_id: pinId,
    title: (pin.grid_title || pin.title || pin.headline || '').trim(),
    description: (pin.description || pin.articleBody || '').trim(),
    link: pin.link || pin.url || '',
    domain,
    board_id: pin.board?.id || pin.board_id || null,
    board_name: pin.board?.name || pin.board_name || '',
    created_at_pinterest: createdAtPinterest,
    age_days: Math.round(ageDays * 10) / 10,
    velocity,
    image_url: imageUrl,
    dominant_color: dominantColor,
    is_video: Boolean(pin.is_video || pin.isVideo || pin.video_status),
    is_product: Boolean(pin.is_product || pin.isProduct),
    saves,
    repins,
    comments,
    share_count: Number(pin.share_count || 0),
    reactions: pin.reaction_counts || pin.reactions || {},
    annotations,
    tags: annotations.map(a => a.name),
  };
}

/**
 * Extract pin data from raw HTML using 8-stage fallback hierarchy.
 */
export function extractPinData(html, pinId) {
  if (!html || typeof html !== 'string') return null;

  // 1. Relay Completed Request
  const relayMatch = html.match(
    /<script[^>]*id="__PWS_RELAY_REGISTER_COMPLETED_REQUEST__"[^>]*>([\s\S]*?)<\/script>/i
  );
  if (relayMatch) {
    try {
      const data = JSON.parse(relayMatch[1]);
      const found = findPinInTree(data, pinId);
      if (found) return formatPin(found);
    } catch (_) {}
  }

  // 2. Prefetched Queries
  const prefetchMatch = html.match(/__PWS_RELAY_PREFETCHED_QUERIES__\s*=\s*([\s\S]*?);<\/script>/i);
  if (prefetchMatch) {
    try {
      const data = JSON.parse(prefetchMatch[1]);
      const found = findPinInTree(data, pinId);
      if (found) return formatPin(found);
    } catch (_) {}
  }

  // 3. PWS Data Redux store
  const pwsMatch = html.match(/<script[^>]*id="__PWS_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (pwsMatch) {
    try {
      const data = JSON.parse(pwsMatch[1]);
      const found = findPinInTree(data, pinId);
      if (found) return formatPin(found);
    } catch (_) {}
  }

  // 4. Inline JSON Data Blocks
  const jsonBlocks = html.matchAll(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/gi);
  for (const block of jsonBlocks) {
    try {
      const data = JSON.parse(block[1]);
      const found = findPinInTree(data, pinId);
      if (found) return formatPin(found);
    } catch (_) {}
  }

  // 5. JSON-LD fallback
  const jsonLdMatch = html.match(/<script\s+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
  if (jsonLdMatch) {
    try {
      const ld = JSON.parse(jsonLdMatch[1]);
      if (ld && (ld['@type'] === 'SocialMediaPosting' || ld['@type'] === 'ImageObject' || ld.interactionStatistic)) {
        let saves = 0;
        let comments = 0;
        const stats = Array.isArray(ld.interactionStatistic) ? ld.interactionStatistic : [ld.interactionStatistic].filter(Boolean);
        for (const s of stats) {
          if (s?.interactionType?.includes('LikeAction')) saves = Number(s.userInteractionCount || 0);
          if (s?.interactionType?.includes('CommentAction')) comments = Number(s.userInteractionCount || 0);
        }
        return formatPin({
          id: pinId,
          title: ld.headline || ld.name || '',
          description: ld.articleBody || ld.description || '',
          link: ld.url || '',
          image_url: Array.isArray(ld.image) ? ld.image[0] : (typeof ld.image === 'string' ? ld.image : ld.image?.url || ''),
          created_at: ld.datePublished || null,
          saves,
          repins: saves,
          comments,
        });
      }
    } catch (_) {}
  }

  // 6. OpenGraph Meta Tags fallback
  const saveMeta = html.match(/property="pinterest:saves"\s+content="(\d+)"/i) || html.match(/name="pinterest:saves"\s+content="(\d+)"/i);
  const repinMeta = html.match(/property="pinterest:repins"\s+content="(\d+)"/i) || html.match(/name="pinterest:repins"\s+content="(\d+)"/i);
  const titleMeta = html.match(/property="og:title"\s+content="([^"]*)"/i);
  const descMeta = html.match(/property="og:description"\s+content="([^"]*)"/i);
  const imgMeta = html.match(/property="og:image"\s+content="([^"]*)"/i);

  if (saveMeta || repinMeta || titleMeta || imgMeta) {
    return formatPin({
      id: pinId,
      saves: saveMeta ? parseInt(saveMeta[1], 10) : 0,
      repins: repinMeta ? parseInt(repinMeta[1], 10) : 0,
      title: titleMeta ? titleMeta[1] : '',
      description: descMeta ? descMeta[1] : '',
      image_url: imgMeta ? imgMeta[1] : '',
    });
  }

  return null;
}

/**
 * Fetch a single pin HTML and parse it.
 */
export async function fetchPinFromPinterest(pinId, activeCookie = '') {
  try {
    const url = `https://www.pinterest.com/pin/${pinId}/`;
    const res = await fetch(url, {
      headers: { ...PINTEREST_PAGE_HEADERS, Cookie: activeCookie || '' },
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    });

    if (res.status === 401 || res.status === 403) {
      // Self-heal: retry anonymously
      const anonRes = await fetch(url, { headers: PINTEREST_PAGE_HEADERS, redirect: 'follow', signal: AbortSignal.timeout(8000) });
      if (!anonRes.ok) return { ok: false, status: anonRes.status };
      const html = await anonRes.text();
      const parsed = extractPinData(html, pinId);
      return parsed ? { ok: true, pin: parsed, anonymous_fallback: true } : { ok: false, status: 200, error: 'parse_failed' };
    }

    if (!res.ok) return { ok: false, status: res.status };
    const html = await res.text();
    const parsed = extractPinData(html, pinId);
    return parsed ? { ok: true, pin: parsed } : { ok: false, status: 200, error: 'parse_failed' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Fetch competitor user profile from UserResource.
 */
export async function fetchUserResource(username, activeCookie = '') {
  const url = `https://www.pinterest.com/resource/UserResource/get/?source_url=%2F${username}%2F&data=%7B%22options%22%3A%7B%22username%22%3A%22${username}%22%2C%22field_set_key%22%3A%22profile%22%7D%2C%22context%22%3A%7B%7D%7D`;
  const headers = getPinterestXhrHeaders(username, activeCookie);

  try {
    let res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
    if (res.status === 401 || res.status === 403) {
      // Retry anonymously
      const anonHeaders = getPinterestXhrHeaders(username, '');
      res = await fetch(url, { headers: anonHeaders, signal: AbortSignal.timeout(8000) });
    }

    if (!res.ok) return { ok: false, status: res.status };
    const json = await res.json();
    const data = json.resource_response?.data;
    if (!data) return { ok: false, error: 'no_data' };

    return {
      ok: true,
      username,
      display_name: data.full_name || username,
      avatar_url: data.image_large_url || data.image_medium_url || null,
      bio: data.about || '',
      website_url: data.website_url || null,
      monthly_reach: Number(data.profile_reach || data.profile_views || 0),
      profile_views: Number(data.profile_views || data.profile_reach || 0),
      follower_count: Number(data.follower_count || 0),
      following_count: Number(data.following_count || 0),
      total_pins: Number(data.pin_count || 0),
      total_boards: Number(data.board_count || 0),
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Fetch competitor boards from BoardsResource.
 */
export async function fetchBoardsResource(username, activeCookie = '') {
  const url = `https://www.pinterest.com/resource/BoardsResource/get/?source_url=%2F${username}%2F&data=%7B%22options%22%3A%7B%22privacy_filter%22%3A%22all%22%2C%22sort%22%3A%22last_pinned_to%22%2C%22field_set_key%22%3A%22profile_grid_item%22%2C%22filter_stories%22%3Afalse%2C%22username%22%3A%22${username}%22%2C%22page_size%22%3A50%2C%22group_by%22%3A%22visibility%22%2C%22include_archived%22%3Atrue%2C%22filter_all_pins%22%3Afalse%2C%22add_fields%22%3A%22board.%7Bmeal_plan%7D%22%7D%2C%22context%22%3A%7B%7D%7D`;
  const headers = getPinterestXhrHeaders(username, activeCookie);

  try {
    let res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
    if (res.status === 401 || res.status === 403) {
      const anonHeaders = getPinterestXhrHeaders(username, '');
      res = await fetch(url, { headers: anonHeaders, signal: AbortSignal.timeout(8000) });
    }

    if (!res.ok) return { ok: false, status: res.status, boards: [] };
    const json = await res.json();
    const items = json.resource_response?.data || [];

    const boards = [];
    if (Array.isArray(items)) {
      for (const item of items) {
        if (item && (item.type === 'board' || item.id || item.node_id)) {
          let lastPinned = null;
          if (item.board_order_modified_at) {
            const d = new Date(item.board_order_modified_at);
            if (!isNaN(d.getTime())) lastPinned = d.toISOString();
          }
          boards.push({
            board_id: String(item.id || item.node_id),
            name: item.name || 'Untitled Board',
            url: item.url ? `https://www.pinterest.com${item.url}` : '',
            pin_count: Number(item.pin_count || 0),
            follower_count: Number(item.follower_count || 0),
            last_pinned_at: lastPinned,
          });
        }
      }
    }

    return { ok: true, boards };
  } catch (err) {
    return { ok: false, error: err.message, boards: [] };
  }
}

/**
 * Fetch pins from UserActivityPinsResource (discovery & backfill).
 */
export async function fetchUserActivityPinsResource(username, bookmark = null, activeCookie = '') {
  const src = `/${username}/_created/`;
  const options = {
    exclude_add_pin_rep: true,
    field_set_key: 'profile_created_grid_item',
    is_own_profile_pins: false,
    username,
    data: { page_size: 50 },
    noCache: true,
  };
  if (bookmark) options.bookmarks = [bookmark];

  const url = `https://www.pinterest.com/resource/UserActivityPinsResource/get/?source_url=${encodeURIComponent(
    src
  )}&data=${encodeURIComponent(JSON.stringify({ options, context: {} }))}&_=${Date.now()}`;

  const headers = getPinterestXhrHeaders(username, activeCookie, { sourceUrl: src });

  try {
    let res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
    if (res.status === 401 || res.status === 403) {
      const anonHeaders = getPinterestXhrHeaders(username, '', { sourceUrl: src });
      res = await fetch(url, { headers: anonHeaders, signal: AbortSignal.timeout(8000) });
    }

    if (!res.ok) return { ok: false, status: res.status, pins: [], nextBookmark: null };
    const json = await res.json();
    const data = json.resource_response?.data || [];
    const nextBookmark = json.resource_response?.bookmark || null;

    const formattedPins = [];
    if (Array.isArray(data)) {
      for (const raw of data) {
        const p = formatPin(raw);
        if (p && p.pin_id) {
          formattedPins.push(p);
        }
      }
    }

    return { ok: true, pins: formattedPins, nextBookmark };
  } catch (err) {
    return { ok: false, error: err.message, pins: [], nextBookmark: null };
  }
}
