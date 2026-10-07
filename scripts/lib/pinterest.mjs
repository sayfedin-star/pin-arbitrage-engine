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

  const headers = {
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
    ...(options.extraHeaders || {}),
  };

  if (activeCookie && String(activeCookie).trim()) {
    headers['Cookie'] = String(activeCookie).trim();
  }

  return headers;
}

export function randomJitterMs(min = 2500, max = 4000) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Standard Exponential Backoff with Full Jitter
 * Decorrelates retry stamps across shards to prevent synchronized thundering herds on Pinterest edge
 */
export function exponentialBackoffWithFullJitter(attempt = 1, baseMs = 1500, capMs = 15000) {
  const temp = Math.min(capMs, baseMs * Math.pow(2, attempt));
  return Math.floor(Math.random() * temp);
}

/**
 * Sanitizes destination URLs by stripping tracking parameters (utm_*, fbclid, ref, epik, etc.)
 * Prevents URL parameter bloat and protects competitive analytics privacy.
 */
export function sanitizeDestinationUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  let trimmed = rawUrl.trim();
  if (!trimmed) return '';
  if (!/^https?:\/\//i.test(trimmed) && !trimmed.startsWith('/')) {
    trimmed = `https://${trimmed}`;
  }
  try {
    const parsed = new URL(trimmed);
    const trackingKeys = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'ref', 'fbclid', 'gclid', 'pin_tracking_params', 'epik', 'srsltid',
      'source', 'source_url', 'mc_cid', 'mc_eid', 'igshid', '_ga'
    ];
    for (const p of trackingKeys) parsed.searchParams.delete(p);
    for (const k of Array.from(parsed.searchParams.keys())) {
      if (k.startsWith('utm_') || k.startsWith('fb_')) parsed.searchParams.delete(k);
    }
    let clean = parsed.toString();
    if (clean.endsWith('?')) clean = clean.slice(0, -1);
    return clean;
  } catch (_) {
    return trimmed;
  }
}

/**
 * Normalizes host domains (strips 'www.', converts to lowercase, handles protocol-less input)
 */
export function normalizeDomain(rawDomain, rawUrl = '') {
  if (rawDomain && typeof rawDomain === 'string') {
    return rawDomain.trim().toLowerCase().replace(/^www\./, '');
  }
  if (rawUrl) {
    try {
      const u = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`);
      return u.hostname.toLowerCase().replace(/^www\./, '');
    } catch (_) {
      return '';
    }
  }
  return '';
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Parses Retry-After header (seconds or HTTP date), guaranteeing bounded integer output.
 */
export function parseRetryAfterSeconds(headerValue, defaultSec = 3) {
  if (!headerValue) return defaultSec;
  const num = parseInt(headerValue, 10);
  if (!isNaN(num) && num > 0) return num;
  const d = new Date(headerValue);
  if (!isNaN(d.getTime())) {
    const diffSec = Math.ceil((d.getTime() - Date.now()) / 1000);
    return Math.max(1, diffSec);
  }
  return defaultSec;
}

/**
 * Robust metric parser: safely converts numbers, formatted strings ('1.2k', '1.5M', '1,250')
 * into clean integers, guaranteeing no NaN is emitted to PostgreSQL.
 */
export function parseCleanMetric(val, fallback = 0) {
  if (val === null || val === undefined) return fallback;
  if (Array.isArray(val) || typeof val === 'boolean') return fallback;
  if (typeof val === 'number') {
    if (isNaN(val) || !isFinite(val)) return fallback;
    return Math.max(0, Math.round(val));
  }
  if (typeof val === 'object') {
    if (typeof val.count === 'number' || typeof val.count === 'string') return parseCleanMetric(val.count, fallback);
    if (typeof val.value === 'number' || typeof val.value === 'string') return parseCleanMetric(val.value, fallback);
    return fallback;
  }
  const s = String(val).replace(/,/g, '').trim().toLowerCase();
  if (!s || s === 'nan' || s === 'infinity' || s === '-infinity') return fallback;
  if (s.endsWith('m')) {
    const num = parseFloat(s.slice(0, -1));
    return isNaN(num) || !isFinite(num) ? fallback : Math.max(0, Math.round(num * 1000000));
  }
  if (s.endsWith('k')) {
    const num = parseFloat(s.slice(0, -1));
    return isNaN(num) || !isFinite(num) ? fallback : Math.max(0, Math.round(num * 1000));
  }
  const num = Number(s);
  return isNaN(num) || !isFinite(num) ? fallback : Math.max(0, Math.round(num));
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
 * Robust string extractor: handles string, object ({text: string}), or numbers cleanly without throwing .trim() errors.
 * Strips null bytes and unprintable control characters.
 */
export function safeString(val) {
  if (val === null || val === undefined) return '';
  let str = '';
  if (typeof val === 'string') str = val;
  else if (typeof val === 'number' || typeof val === 'bigint') str = String(val);
  else if (typeof val === 'object' && !Array.isArray(val)) {
    if (typeof val.text === 'string') str = val.text;
    else if (typeof val.title === 'string') str = val.title;
    else if (typeof val.headline === 'string') str = val.headline;
    else if (typeof val.name === 'string') str = val.name;
    else if (typeof val.description === 'string') str = val.description;
  }
  if (!str) return '';
  return str.replace(/[\u0000\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
}

/**
 * Normalize and format raw Pinterest pin data across diverse payload shapes into a consistent object.
 */
export function formatPin(pin) {
  if (!pin || typeof pin !== 'object') return null;

  // Filter out non-pin cards, interstitials, and section headers
  if (
    pin.type === 'interstitial' ||
    pin.type === 'board' ||
    pin.format === 'Related Interests' ||
    Boolean(pin.is_promoted && !pin.id)
  ) {
    return null;
  }

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

  const saves = parseCleanMetric(
    st.saves ??
    st.save_count ??
    pin.save_count ??
    pin.saves ??
    pin.aggregated_pin_data?.saves ??
    0
  );

  const repins = parseCleanMetric(
    st.repins ??
    st.repin_count ??
    pin.repin_count ??
    pin.repins ??
    pin.aggregated_pin_data?.repins ??
    saves
  );

  const comments = parseCleanMetric(
    pin.comment_count ??
    pin.commentCount ??
    pin.comments ??
    st.comment_count ??
    pin.aggregated_pin_data?.comment_count ??
    0
  );

  const pinId = String(pin.id || pin.pin_id || pin.node_id || '').trim();
  if (!pinId || pinId === 'undefined' || pinId === 'null' || pinId.startsWith('-') || !/^\d+$/.test(pinId)) return null;

  // Created at date & velocity calculation (safely handling malformed dates and clock skew)
  const createdRaw = pin.created_at || pin.created_at_pinterest || pin.createdAt;
  let createdAtPinterest = null;
  let ageDays = null;
  let createdMs = null;
  if (createdRaw) {
    const d = new Date(createdRaw);
    if (!isNaN(d.getTime())) {
      createdAtPinterest = d.toISOString();
      createdMs = d.getTime();
      const msDiff = Date.now() - createdMs;
      if (Number.isFinite(msDiff)) {
        // Guard against slight server clock skew while ensuring fresh pins are assigned a positive age (min 0.1 days)
        ageDays = Math.max(0.1, msDiff / 86400000);
      }
    }
  }
  const velocity = (ageDays !== null && ageDays > 0)
    ? Math.round((saves / ageDays) * 100) / 100
    : 0;

  // Domain extraction & URL sanitization (stripping tracking parameters utm_*, fbclid, etc.)
  let rawLink = String(pin.link || pin.url || '').trim();
  if (rawLink && !/^https?:\/\//i.test(rawLink) && !rawLink.startsWith('/')) {
    rawLink = `https://${rawLink}`;
  }
  const cleanLink = sanitizeDestinationUrl(rawLink);
  const domain = normalizeDomain(pin.domain, cleanLink || rawLink);

  // Image URL
  let rawImageUrl =
    pin.images?.orig?.url ||
    pin.images_orig?.url ||
    pin.images?.['736x']?.url ||
    pin.images_736x?.url ||
    pin.images?.['474x']?.url ||
    pin.images_474x?.url ||
    pin.image_large_url ||
    pin.imageLargeUrl ||
    pin.image_url ||
    pin.image ||
    '';

  let imageUrl = '';
  if (typeof rawImageUrl === 'string') {
    imageUrl = rawImageUrl.replace(/[\u0000\x00-\x1F\x7F]/g, '').trim();
    if (imageUrl.startsWith('//')) {
      imageUrl = `https:${imageUrl}`;
    }
  }

  // Dominant color
  const dominantColor = pin.dominant_color || pin.dominantColor || '#888888';

  const altText = safeString(pin.seoAltText || pin.altText || pin.alt_text || pin.auto_alt_text || '');
  const seoTitle = safeString(pin.seoTitle || pin.seo_title || '');
  const seoDescription = safeString(pin.seoDescription || pin.seo_description || '');

  const isProduct = Boolean(
    pin.is_product ||
    pin.isProduct ||
    pin.is_eligible_for_pdp ||
    pin.is_shoppable ||
    pin.is_retail_product ||
    pin.rich_metadata?.type === 'product' ||
    pin.rich_summary?.type === 'product' ||
    Boolean(pin.buyable_product) ||
    Boolean(pin.shopping_data) ||
    Boolean(pin.product_metadata) ||
    Boolean(pin.price_value) ||
    Boolean(pin.price_currency)
  );

  return {
    pin_id: pinId,
    title: safeString(
      pin.grid_title ||
      pin.title ||
      pin.headline ||
      pin.grid_description ||
      pin.rich_summary?.display_name ||
      pin.rich_metadata?.title ||
      seoTitle ||
      altText ||
      ''
    ),
    description: safeString(pin.description || pin.articleBody || pin.unauth_on_page_description),
    alt_text: altText,
    seo_title: seoTitle,
    seo_description: seoDescription,
    link: safeString(cleanLink || rawLink || pin.link || pin.url),
    domain,
    board_id: pin.board?.id || pin.board_id || null,
    board_name: safeString(pin.board?.name || pin.board_name),
    created_at_pinterest: createdAtPinterest,
    age_days: ageDays !== null ? Math.round(ageDays * 10) / 10 : null,
    velocity,
    image_url: imageUrl,
    dominant_color: dominantColor,
    is_video: Boolean(pin.is_video || pin.isVideo || pin.video_status),
    is_product: isProduct,
    saves,
    repins,
    comments,
    share_count: parseCleanMetric(pin.share_count || 0),
    reactions: pin.reaction_counts || pin.reactions || {},
    annotations,
    tags: annotations.map(a => a.name),
  };
}

/**
 * Extract pin data from raw HTML using 8-stage fallback hierarchy.
 */
export function extractPinData(rawHtml, pinId) {
  if (!rawHtml || typeof rawHtml !== 'string') return null;
  // Bounded buffer length to eliminate Catastrophic Backtracking (ReDoS) on oversized payloads
  const html = rawHtml.length > 2000000 ? rawHtml.slice(0, 2000000) : rawHtml;

  // 1. Modern Relay Completed Request Calls (__PWS_RELAY_REGISTER_COMPLETED_REQUEST__)
  const relayRegex = /__PWS_RELAY_REGISTER_COMPLETED_REQUEST__\s*\(([^,]+),\s*(\{[\s\S]*?\})\);/g;
  let rMatch;
  let mergedRelayPin = null;

  while ((rMatch = relayRegex.exec(html)) !== null) {
    try {
      const payload = JSON.parse(rMatch[2]);
      const v3 = payload?.data?.v3GetPinQueryv2?.data;
      if (v3 && (String(v3.entityId || v3.id || '') === String(pinId) || !pinId || String(v3.id || '').includes(String(pinId)))) {
        if (!mergedRelayPin) mergedRelayPin = {};
        const realId = v3.entityId || (typeof v3.id === 'string' && /^\d+$/.test(v3.id) ? v3.id : null);
        if (realId) mergedRelayPin.id = realId;

        if (v3.seoAltText) mergedRelayPin.seoAltText = v3.seoAltText;
        if (v3.altText) mergedRelayPin.altText = v3.altText;
        if (v3.title) mergedRelayPin.title = v3.title;
        if (v3.gridTitle && !mergedRelayPin.title) mergedRelayPin.title = v3.gridTitle;
        if (v3.description) mergedRelayPin.description = v3.description;
        if (v3.seoTitle) mergedRelayPin.seoTitle = v3.seoTitle;
        if (v3.seoDescription) mergedRelayPin.seoDescription = v3.seoDescription;
        if (v3.link) mergedRelayPin.link = v3.link;
        if (v3.domain) mergedRelayPin.domain = v3.domain;
        if (v3.dominantColor) mergedRelayPin.dominantColor = v3.dominantColor;
        if (v3.createdAt) mergedRelayPin.createdAt = v3.createdAt;

        if (v3.board && v3.board.name) {
          mergedRelayPin.board = {
            id: v3.board.entityId || v3.board.id,
            name: v3.board.name,
            url: v3.board.url
          };
        }

        const saves = v3.saveCount ?? v3.aggregatedStats?.saves ?? v3.aggregatedPinData?.aggregatedStats?.saves;
        if (saves !== undefined && saves !== null) {
          mergedRelayPin.saves = Math.max(mergedRelayPin.saves || 0, Number(saves));
        }
        const repins = v3.repinCount ?? v3.aggregatedStats?.repins ?? v3.aggregatedPinData?.aggregatedStats?.repins;
        if (repins !== undefined && repins !== null) {
          mergedRelayPin.repins = Math.max(mergedRelayPin.repins || 0, Number(repins));
        }
        const comments = v3.commentCount ?? v3.aggregatedPinData?.commentCount ?? v3.aggregatedStats?.comments;
        if (comments !== undefined && comments !== null) {
          mergedRelayPin.commentCount = Math.max(mergedRelayPin.commentCount || 0, Number(comments));
        }

        const totalReactions = v3.totalReactionCount ?? v3.reactionCounts?.total;
        if (totalReactions !== undefined && totalReactions !== null) {
          mergedRelayPin.total_reaction_count = Number(totalReactions);
        }

        if (Array.isArray(v3.reactionCountsData)) {
          const rMap = {};
          for (const item of v3.reactionCountsData) {
            rMap[String(item.reactionType)] = Number(item.reactionCount || 0);
          }
          mergedRelayPin.reaction_counts = rMap;
        } else if (v3.reactionCounts) {
          mergedRelayPin.reaction_counts = v3.reactionCounts;
        }

        if (v3.shareCount !== undefined && v3.shareCount !== null) {
          mergedRelayPin.share_count = Number(v3.shareCount);
        }

        const imgOrig = v3.images_orig?.url || v3.images_736x?.url || v3.imageLargeUrl || v3.images?.orig?.url;
        if (imgOrig) mergedRelayPin.image_url = imgOrig;

        if (v3.isEligibleForPdp || (Array.isArray(v3.shoppingFlags) && v3.shoppingFlags.length > 0) || v3.isProduct || v3.priceValue) {
          mergedRelayPin.is_product = true;
        }

        if (!mergedRelayPin.pinJoin) mergedRelayPin.pinJoin = {};
        if (v3.pinJoin) {
          if (Array.isArray(v3.pinJoin.visualAnnotation)) {
            mergedRelayPin.pinJoin.visualAnnotation = [
              ...(mergedRelayPin.pinJoin.visualAnnotation || []),
              ...v3.pinJoin.visualAnnotation
            ];
          }
          if (Array.isArray(v3.pinJoin.annotationsWithLinksArray)) {
            mergedRelayPin.pinJoin.annotationsWithLinksArray = [
              ...(mergedRelayPin.pinJoin.annotationsWithLinksArray || []),
              ...v3.pinJoin.annotationsWithLinksArray
            ];
          }
          if (Array.isArray(v3.pinJoin.seoRelatedInterests)) {
            mergedRelayPin.pinJoin.seoRelatedInterests = [
              ...(mergedRelayPin.pinJoin.seoRelatedInterests || []),
              ...v3.pinJoin.seoRelatedInterests
            ];
          }
        }
      } else {
        const found = findPinInTree(payload, pinId);
        if (found) {
          if (!mergedRelayPin) mergedRelayPin = { ...found };
          else mergedRelayPin = { ...mergedRelayPin, ...found };
        }
      }
    } catch (_) {}
  }

  if (mergedRelayPin && (mergedRelayPin.id || Object.keys(mergedRelayPin).length > 0)) {
    if (!mergedRelayPin.id) mergedRelayPin.id = pinId;
    const formatted = formatPin(mergedRelayPin);
    if (formatted) return formatted;
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
        const rawImg = Array.isArray(ld.image) ? ld.image[0] : (typeof ld.image === 'string' ? ld.image : ld.image?.url || '');
        const hasValidContent = Boolean(
          ld.headline || ld.name || ld.articleBody || ld.description || rawImg || ld.url || saves > 0 || comments > 0
        );
        if (hasValidContent) {
          return formatPin({
            id: pinId,
            title: ld.headline || ld.name || '',
            description: ld.articleBody || ld.description || '',
            link: ld.url || '',
            image_url: rawImg,
            created_at: ld.datePublished || null,
            saves,
            repins: saves,
            comments,
          });
        }
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
export async function fetchPinFromPinterest(pinId) {
  try {
    const cleanId = String(pinId || '').trim();
    if (!cleanId || cleanId.startsWith('-') || !/^\d+$/.test(cleanId)) {
      return { ok: false, status: 400, error: 'invalid_pin_id' };
    }
    const url = `https://www.pinterest.com/pin/${cleanId}/`;
    // Pin details MUST always be queried anonymously (zero cookies)
    // to guarantee Pinterest serves public aggregate stats (saves/repins) instead of viewer-state zeroes
    const headers = { ...PINTEREST_PAGE_HEADERS };
    let res = await fetch(url, {
      headers,
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    });

    if (res.status === 401 || res.status === 403 || res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504) {
      if (res.body) await res.body.cancel().catch(() => {});
      let retryDelay = exponentialBackoffWithFullJitter(1, 2500, 8000);
      if (res.status === 429) {
        const retrySec = parseRetryAfterSeconds(res.headers.get('retry-after'), 3);
        if (retrySec > 30) {
          return { ok: false, status: 429, retryAfter: retrySec };
        }
        retryDelay = Math.max(retryDelay, retrySec * 1000);
      }
      await sleep(retryDelay);
      res = await fetch(url, { headers: PINTEREST_PAGE_HEADERS, redirect: 'follow', signal: AbortSignal.timeout(8000) });
    }

    if (!res.ok) {
      if (res.body) await res.body.cancel().catch(() => {});
      const resRetryAfter = res.status === 429 ? parseRetryAfterSeconds(res.headers.get('retry-after'), 15) : undefined;
      return { ok: false, status: res.status, retryAfter: resRetryAfter };
    }
    const html = await res.text();
    const parsed = extractPinData(html, pinId);
    return parsed ? { ok: true, pin: parsed } : { ok: false, status: 200, error: 'parse_failed' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Scrape user profile from Pinterest unauthenticated SSR HTML document.
 * 100% cookie-free, extracts user details from initialReduxState and JSON-LD ProfilePage.
 */
export async function fetchUserProfileUnauth(username) {
  const cleanUser = String(username || '').replace(/^@/, '').trim().toLowerCase();
  if (!cleanUser) return { ok: false, error: 'invalid_username' };

  try {
    const url = `https://www.pinterest.com/${cleanUser}/`;
    const res = await fetch(url, {
      headers: PINTEREST_PAGE_HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      if (res.body) await res.body.cancel().catch(() => {});
      return { ok: false, status: res.status };
    }
    const html = await res.text();

    let userData = null;
    let jsonLdData = null;
    const initialBoards = [];

    // Scan script tags for initialReduxState and JSON-LD
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
                  created_at: b.created_at || null,
                  last_pinned_at: b.board_order_modified_at || null,
                  image_cover_url: coverImg,
                  board_vase: boardVase,
                  description: desc,
                  metadata: {
                    image_cover_url: coverImg,
                    board_vase: boardVase,
                    description: desc,
                    section_count: b.section_count || 0,
                    privacy: b.privacy || 'public',
                    is_collaborative: Boolean(b.is_collaborative)
                  }
                });
              }
            }
          }
        } catch (_) {}
      } else if (scriptContent.includes('"@type"') && scriptContent.includes('ProfilePage')) {
        try {
          const parsed = JSON.parse(scriptContent);
          if (parsed?.mainEntity) {
            jsonLdData = parsed;
          }
        } catch (_) {}
      }
    }

    if (!userData && !jsonLdData) {
      return { ok: false, error: 'profile_not_found_in_html' };
    }

    const mainEntity = jsonLdData?.mainEntity || {};
    const displayName = userData?.full_name || userData?.first_name || mainEntity?.name || cleanUser;
    const avatarUrl = userData?.image_xlarge_url || userData?.image_large_url || userData?.image_medium_url ||
      (typeof mainEntity?.image === 'string' ? mainEntity.image : mainEntity?.image?.contentUrl) || null;
    const bio = userData?.about || userData?.seo_description || mainEntity?.description || '';
    const websiteUrl = userData?.website_url || (Array.isArray(mainEntity?.sameAs) ? mainEntity.sameAs[0] : null) || null;
    const followerCount = parseCleanMetric(userData?.follower_count || 0);
    const followingCount = parseCleanMetric(userData?.following_count || 0);
    const totalPins = parseCleanMetric(userData?.pin_count || 0);
    const totalBoards = parseCleanMetric(userData?.board_count || initialBoards.length || 0);
    const monthlyReach = parseCleanMetric(userData?.profile_reach || userData?.profile_views || userData?.monthly_views || 0);
    const profileViews = parseCleanMetric(userData?.profile_views || userData?.profile_reach || userData?.monthly_views || 0);
    const accountCreatedAt = userData?.created_at || jsonLdData?.dateCreated || null;
    const lastPinSaveTime = userData?.last_pin_save_time || null;

    return {
      ok: true,
      username: cleanUser,
      display_name: displayName,
      avatar_url: avatarUrl,
      bio,
      website_url: websiteUrl,
      monthly_reach: monthlyReach,
      profile_views: profileViews,
      follower_count: followerCount,
      following_count: followingCount,
      total_pins: totalPins,
      total_boards: totalBoards,
      account_created_at: accountCreatedAt,
      last_pin_save_time: lastPinSaveTime,
      initial_boards: initialBoards
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Fetch competitor user profile with resilient unauthenticated SSR HTML fallback.
 * Works 100% cookie-free without triggering 401/403 session errors.
 */
export async function fetchUserResource(username, activeCookie = '') {
  const cleanUser = String(username || '').replace(/^@/, '').trim().toLowerCase();
  if (!cleanUser) return { ok: false, error: 'invalid_username' };

  const url = `https://www.pinterest.com/resource/UserResource/get/?source_url=%2F${cleanUser}%2F&data=%7B%22options%22%3A%7B%22username%22%3A%22${cleanUser}%22%2C%22field_set_key%22%3A%22profile%22%7D%2C%22context%22%3A%7B%7D%7D`;
  const headers = getPinterestXhrHeaders(cleanUser, activeCookie);

  try {
    let res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
    if (res.status === 401 || res.status === 403 || res.status === 429) {
      if (res.body) await res.body.cancel().catch(() => {});
      await sleep(exponentialBackoffWithFullJitter(1, 2000, 6000));
      const anonHeaders = getPinterestXhrHeaders(cleanUser, '');
      res = await fetch(url, { headers: anonHeaders, signal: AbortSignal.timeout(8000) });
    }

    if (!res.ok) {
      if (res.body) await res.body.cancel().catch(() => {});
      const unauthRes = await fetchUserProfileUnauth(cleanUser);
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

    return {
      ok: true,
      username: cleanUser,
      display_name: data.full_name || cleanUser,
      avatar_url: data.image_large_url || data.image_medium_url || null,
      bio: data.about || '',
      website_url: data.website_url || null,
      monthly_reach: parseCleanMetric(data.profile_reach || data.profile_views || data.monthly_views || 0),
      profile_views: parseCleanMetric(data.profile_views || data.profile_reach || data.monthly_views || 0),
      follower_count: parseCleanMetric(data.follower_count || 0),
      following_count: parseCleanMetric(data.following_count || 0),
      total_pins: parseCleanMetric(data.pin_count || 0),
      total_boards: parseCleanMetric(data.board_count || 0),
      group_board_count: parseCleanMetric(data.group_board_count || 0),
      account_created_at: data.created_at || null,
      last_pin_save_time: data.last_pin_save_time || null,
      pinterest_id: data.id || data.node_id || null,
      domain_verified: Boolean(data.domain_verified || data.is_primary_website_verified),
      is_verified_merchant: Boolean(data.is_verified_merchant),
      has_catalog: Boolean(data.has_catalog),
      video_pin_count: parseCleanMetric(data.video_pin_count || 0),
      story_pin_count: parseCleanMetric(data.story_pin_count || 0)
    };
  } catch (err) {
    const unauthRes = await fetchUserProfileUnauth(cleanUser);
    if (unauthRes.ok) return unauthRes;
    return { ok: false, error: err.message };
  }
}

/**
 * Fetch competitor boards from BoardsResource with full bookmark pagination.
 * Supports accounts with thousands of boards (e.g. 1,600+ boards).
 */
export async function fetchBoardsResource(username, activeCookie = '', maxPages = 45) {
  const cleanUser = String(username || '').replace(/^@/, '').trim().toLowerCase();
  if (!cleanUser) return { ok: false, error: 'invalid_username', boards: [] };

  const boards = [];
  const seenBoardIds = new Set();
  let bookmark = null;
  let lastSeenBookmark = null;
  const pageLimit = Math.max(1, Math.min(Number(maxPages) || 45, 100));

  for (let page = 1; page <= pageLimit; page++) {
    const options = {
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
    if (bookmark) options.bookmarks = [bookmark];

    const src = `/${cleanUser}/`;
    const url = `https://www.pinterest.com/resource/BoardsResource/get/?source_url=${encodeURIComponent(src)}&data=${encodeURIComponent(JSON.stringify({ options, context: {} }))}&_=${Date.now()}`;
    const headers = getPinterestXhrHeaders(cleanUser, activeCookie, { sourceUrl: src });

    try {
      let res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
      if (res.status === 401 || res.status === 403 || res.status === 429) {
        if (res.body) await res.body.cancel().catch(() => {});
        await sleep(randomJitterMs(2500, 4000));
        const anonHeaders = getPinterestXhrHeaders(cleanUser, '', { sourceUrl: src });
        res = await fetch(url, { headers: anonHeaders, signal: AbortSignal.timeout(8000) });
      }

      if (!res.ok) {
        if (res.body) await res.body.cancel().catch(() => {});
        if (page === 1) {
          const unauth = await fetchUserProfileUnauth(cleanUser);
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

/**
 * Fetch pins from UserActivityPinsResource (discovery, backfill & early-stop).
 */
export async function fetchUserActivityPinsResource(username, bookmark = null, activeCookie = '') {
  const cleanUser = String(username || '').replace(/^@/, '').trim().toLowerCase();
  if (!cleanUser) return { ok: false, error: 'invalid_username', pins: [], nextBookmark: null };

  const src = `/${cleanUser}/_created/`;
  const options = {
    exclude_add_pin_rep: true,
    field_set_key: 'profile_created_grid_item',
    is_own_profile_pins: false,
    username: cleanUser,
    page_size: 50,
    data: { page_size: 50 },
    noCache: true,
  };
  if (bookmark) options.bookmarks = [bookmark];

  const url = `https://www.pinterest.com/resource/UserActivityPinsResource/get/?source_url=${encodeURIComponent(
    src
  )}&data=${encodeURIComponent(JSON.stringify({ options, context: {} }))}&_=${Date.now()}`;

  const headers = getPinterestXhrHeaders(cleanUser, activeCookie, { sourceUrl: src });

  try {
    let res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
    if (res.status === 401 || res.status === 403 || res.status === 429) {
      if (res.body) await res.body.cancel().catch(() => {});
      await sleep(randomJitterMs(2500, 4000));
      const anonHeaders = getPinterestXhrHeaders(cleanUser, '', { sourceUrl: src });
      res = await fetch(url, { headers: anonHeaders, signal: AbortSignal.timeout(8000) });
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

/**
 * Fetch pins from BoardFeedResource (board-level crawling for sharded distributed crawling).
 */
export async function fetchBoardFeedResource(boardId, boardUrl, bookmark = null, activeCookie = '') {
  const cleanId = String(boardId || '').trim();
  if (!cleanId) return { ok: false, error: 'invalid_board_id', pins: [], nextBookmark: null };

  let srcUrl = String(boardUrl || '').trim();
  if (srcUrl.startsWith('http')) {
    try {
      srcUrl = new URL(srcUrl).pathname;
    } catch (_) {}
  }
  if (!srcUrl.startsWith('/')) srcUrl = `/${srcUrl}`;
  if (!srcUrl.endsWith('/')) srcUrl = `${srcUrl}/`;

  // Extract username from boardUrl (e.g. /wifesrecipesbyme/dinner/ -> wifesrecipesbyme)
  const pathParts = srcUrl.split('/').filter(Boolean);
  const username = pathParts[0] || '';

  const options = {
    board_id: cleanId,
    board_url: srcUrl,
    field_set_key: 'grid_item',
    filter_section_pins: true,
    sort: 'default',
    page_size: 25,
  };
  if (bookmark) options.bookmarks = [bookmark];

  const url = `https://www.pinterest.com/resource/BoardFeedResource/get/?source_url=${encodeURIComponent(
    srcUrl
  )}&data=${encodeURIComponent(JSON.stringify({ options, context: {} }))}&_=${Date.now()}`;

  const headers = getPinterestXhrHeaders(username, activeCookie, { sourceUrl: srcUrl });

  try {
    let res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
    if (res.status === 401 || res.status === 403 || res.status === 429) {
      if (res.body) await res.body.cancel().catch(() => {});
      await sleep(randomJitterMs(2500, 4000));
      const anonHeaders = getPinterestXhrHeaders(username, '', { sourceUrl: srcUrl });
      res = await fetch(url, { headers: anonHeaders, signal: AbortSignal.timeout(8000) });
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

/**
 * Scrape dedicated board page from Pinterest unauthenticated SSR HTML document.
 * 100% cookie-free, extracts board metadata, cover, stats, and authentic algorithmic board_vase (Related Interests).
 */
export async function fetchBoardDetailUnauth(username, boardSlugOrName) {
  const cleanUser = String(username || '').replace(/^@/, '').trim().toLowerCase();
  if (!cleanUser) return { ok: false, error: 'invalid_username' };

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
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

  if (!cleanSlug) return { ok: false, error: 'invalid_board_name' };

  const url = `https://www.pinterest.com/${cleanUser}/${cleanSlug}/`;
  try {
    let res = await fetch(url, {
      headers: PINTEREST_PAGE_HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    });

    if (res.status === 401 || res.status === 403 || res.status === 429) {
      if (res.body) await res.body.cancel().catch(() => {});
      await sleep(randomJitterMs(2500, 4000));
      res = await fetch(url, {
        headers: PINTEREST_PAGE_HEADERS,
        redirect: 'follow',
        signal: AbortSignal.timeout(8000),
      });
    }

    if (!res.ok) {
      if (res.body) await res.body.cancel().catch(() => {});
      return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    }
    const html = await res.text();

    let targetBoard = null;

    // 1. Scan initialReduxState
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
              if (
                b.board_vase?.length > 0 ||
                bSlug.includes(cleanSlug) ||
                cleanSlug.includes(bSlug) ||
                (b.name && b.name.toLowerCase() === rawBoard.toLowerCase())
              ) {
                targetBoard = b;
                break;
              }
            }
          }
        } catch (_) {}
      }
      if (targetBoard && targetBoard.board_vase?.length > 0) break;
    }

    if (!targetBoard) {
      return { ok: false, error: 'board_not_found_in_html' };
    }

    const coverImg =
      targetBoard.image_cover_hd_url ||
      targetBoard.image_cover_url ||
      targetBoard.images?.['736x']?.url ||
      targetBoard.images?.['474x']?.url ||
      targetBoard.images?.['236x']?.url ||
      targetBoard.image_thumbnail_url ||
      null;

    const rawVase = targetBoard.board_vase || [];
    const boardVase = Array.isArray(rawVase)
      ? rawVase
          .map(v => {
            if (typeof v === 'string') return { text: v.trim(), link: '' };
            return {
              text: String(v?.text || '').trim(),
              link: v?.link ? (v.link.startsWith('http') ? v.link : `https://www.pinterest.com${v.link}`) : '',
            };
          })
          .filter(v => v.text.length > 0)
      : [];

    const boardUrl = targetBoard.url
      ? (targetBoard.url.startsWith('http') ? targetBoard.url : `https://www.pinterest.com${targetBoard.url.startsWith('/') ? '' : '/'}${targetBoard.url}`)
      : url;

    return {
      ok: true,
      board: {
        board_id: String(targetBoard.id || targetBoard.entityId || '').trim(),
        name: targetBoard.name || rawBoard,
        url: boardUrl,
        pin_count: parseCleanMetric(targetBoard.pin_count || 0),
        follower_count: parseCleanMetric(targetBoard.follower_count || 0),
        board_order_modified_at: targetBoard.board_order_modified_at || null,
        created_at: targetBoard.created_at || null,
        image_cover_url: coverImg,
        description: targetBoard.description || '',
        board_vase: boardVase,
        metadata: {
          image_cover_url: coverImg,
          board_vase: boardVase,
          description: targetBoard.description || '',
          privacy: targetBoard.privacy || 'public',
        }
      }
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}


