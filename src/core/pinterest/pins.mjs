/**
 * src/core/pinterest/pins.mjs
 *
 * Canonical Pin Telemetry Extraction, 48-Field Normalization,
 * Strict Guest Scraping, Hybrid PinResource Fallback, and Batch Pidgets Ingestion.
 *
 * Invariants:
 * - Unhydrated pins MUST have save_count = null (NOT 0).
 * - Capped against 10M+ anomalies (10,000,001 ceiling protection).
 * - Preserves 100% affiliate/arbitrage UTM tracking parameters.
 * - Extracts guest creator audience and carousel detection.
 *
 * // [INVARIANT: STRICT-GUEST-SCRAPING] Unauthenticated guest session headers (NO LOGGED-IN COOKIES)
 * // [INVARIANT: 48-FIELD-AFFILIATE-PRESERVATION] Preserve affiliate/arbitrage tracking links
 * // [INVARIANT: 48-FIELD-TELEMETRY-CAROUSEL-DETECTION]
 * // [INVARIANT: GUEST-AUDIENCE-EXTRACTION] Extract creator audience from closeupUnifiedAttribution in guest mode
 */

import {
  CANONICAL_FINGERPRINT,
  PINTEREST_PAGE_HEADERS,
  getPinterestXhrHeaders,
  sleep,
  exponentialBackoffWithFullJitter,
  getDefaultDispatcher,
  pinterestFetch,
  parseRetryAfterSeconds
} from './client.mjs';
import { normalizeCleanDomain } from '../../domain/pin-intelligence.mjs';

export const PINTEREST_JSON_API_HEADERS = {
  'User-Agent': CANONICAL_FINGERPRINT.USER_AGENT,
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  'X-Requested-With': 'XMLHttpRequest',
  'Referer': 'https://www.pinterest.com/',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'cross-site'
};

export const MAX_METRIC_CAP = 10000000; // 10 Million
export const PINTEREST_CEILING_VALUE = 10000001; // 10M+ unauthenticated ceiling indicator

/**
 * Sanitizes destination URLs while preserving tracking parameters.
 */
export function sanitizeDestinationUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  let url = rawUrl.trim();
  if (!url) return '';
  if (!/^https?:\/\//i.test(url) && !url.startsWith('/')) {
    url = `https://${url}`;
  }
  return url.replace(/[\u0000\x00-\x1F\x7F]/g, '').trim();
}

/**
 * Normalizes domains into clean root domains without www.
 * Thin preset alias delegating to canonical `normalizeCleanDomain` SSOT.
 */
export function normalizeDomain(rawDomain, rawUrl = '') {
  return normalizeCleanDomain(rawDomain, {
    fallbackUrl: rawUrl && typeof rawUrl === 'string' && !rawUrl.startsWith('http') ? `https://${rawUrl}` : rawUrl,
    defaultFallback: 'uploaded by user'
  });
}

/**
 * Safe string trimmer removing null bytes and control chars.
 */
export function safeString(val) {
  if (val === null || val === undefined) return '';
  let str = '';
  if (typeof val === 'string') str = val;
  else if (typeof val === 'number' || typeof val === 'boolean') str = String(val);
  else if (typeof val === 'object') {
    if (typeof val.text === 'string') str = val.text;
    else if (typeof val.title === 'string') str = val.title;
    else if (typeof val.name === 'string') str = val.name;
    else if (typeof val.description === 'string') str = val.description;
  }
  if (!str) return '';
  return str.replace(/[\u0000\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
}

/**
 * Robust numeric parser with 10M+ ceiling protection and NaN immunity.
 *
 * @param {any} val
 * @param {number|null} [fallback=0]
 * @param {object} [options]
 * @param {number} [options.cap=10000000]
 * @param {boolean} [options.preserveCeiling=false]
 * @returns {number|null}
 */
export function parseCleanMetric(val, fallback = 0, options = {}) {
  const { cap = MAX_METRIC_CAP, preserveCeiling = false } = options;
  if (val === null || val === undefined) return fallback;
  if (Array.isArray(val) || typeof val === 'boolean') return fallback;

  if (typeof val === 'number') {
    if (isNaN(val) || !isFinite(val)) return fallback;
    const rounded = Math.max(0, Math.round(val));
    if (preserveCeiling && rounded === PINTEREST_CEILING_VALUE) return PINTEREST_CEILING_VALUE;
    return cap ? Math.min(cap, rounded) : rounded;
  }

  if (typeof val === 'object') {
    if (typeof val.count === 'number' || typeof val.count === 'string') return parseCleanMetric(val.count, fallback, options);
    if (typeof val.value === 'number' || typeof val.value === 'string') return parseCleanMetric(val.value, fallback, options);
    return fallback;
  }

  let s = String(val).replace(/,/g, '').trim().toLowerCase();
  if (!s || s === 'nan' || s === 'infinity' || s === '-infinity') return fallback;

  // Handle 10M+ ceiling notation
  const hasTrailingPlus = s.endsWith('+');
  if (hasTrailingPlus) {
    s = s.slice(0, -1).trim();
  }

  if (s.endsWith('m')) {
    const num = parseFloat(s.slice(0, -1));
    if (isNaN(num) || !isFinite(num)) return fallback;
    const computed = Math.max(0, Math.round(num * 1000000));
    if (hasTrailingPlus && computed === 10000000 && preserveCeiling) {
      return PINTEREST_CEILING_VALUE;
    }
    return cap ? Math.min(cap, computed) : computed;
  }

  if (s.endsWith('k')) {
    const num = parseFloat(s.slice(0, -1));
    return isNaN(num) || !isFinite(num) ? fallback : Math.max(0, Math.round(num * 1000));
  }

  const num = Number(s);
  if (isNaN(num) || !isFinite(num)) return fallback;
  const rounded = Math.max(0, Math.round(num));
  if (preserveCeiling && (rounded === PINTEREST_CEILING_VALUE || (hasTrailingPlus && rounded === MAX_METRIC_CAP))) {
    return PINTEREST_CEILING_VALUE;
  }
  return cap ? Math.min(cap, rounded) : rounded;
}

function isPinCandidate(o) {
  if (!o || typeof o !== 'object') return false;
  return Boolean(
    o.title !== undefined ||
    o.description !== undefined ||
    o.images ||
    o.images_orig ||
    o.aggregated_pin_data ||
    o.aggregatedStats ||
    o.aggregatedPinData ||
    o.board ||
    o.pinner ||
    o.save_count !== undefined ||
    o.saveCount !== undefined ||
    o.repin_count !== undefined ||
    o.repinCount !== undefined ||
    o.pinJoin
  );
}

/**
 * Recursively search a Pinterest JSON/Redux/Relay object tree for a pin matching pinId.
 */
export function findPinInTree(obj, pinId, depth = 0) {
  if (depth > 20 || !obj || typeof obj !== 'object') return null;

  const pIdStr = String(pinId);
  const idMatch =
    (obj.id && String(obj.id) === pIdStr) ||
    (obj.pin_id && String(obj.pin_id) === pIdStr) ||
    (obj.entityId && String(obj.entityId) === pIdStr) ||
    (obj.node_id && String(obj.node_id) === pIdStr);

  if (idMatch && isPinCandidate(obj)) {
    return obj;
  }

  if (obj[pIdStr] && isPinCandidate(obj[pIdStr])) {
    return obj[pIdStr];
  }

  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findPinInTree(item, pinId, depth + 1);
      if (found) return found;
    }
    return null;
  }

  for (const key of Object.keys(obj)) {
    const found = findPinInTree(obj[key], pinId, depth + 1);
    if (found) return found;
  }

  return null;
}

/**
 * Format and normalize raw pin data into the canonical 48-field schema.
 *
 * UNHYDRATED PIN INVARIANT:
 * If explicit saves are NOT present in the data, save_count is set strictly to NULL (NOT 0).
 */
export function formatPin(pin) {
  if (!pin || typeof pin !== 'object') return null;

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

  // Extract annotations
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
        annotationsMap.set(lower, { name: rawName, idea_id: ideaId, url });
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
            url: item.url ? String(item.url).trim() : null
          });
        }
      }
    }
  }

  const annotations = Array.from(annotationsMap.values());

  const hasExplicitRepinsField = Boolean(
    st.repins !== undefined && st.repins !== null ||
    st.repin_count !== undefined && st.repin_count !== null ||
    st.repinCount !== undefined && st.repinCount !== null ||
    pin.repin_count !== undefined && pin.repin_count !== null ||
    pin.repinCount !== undefined && pin.repinCount !== null ||
    pin.repins !== undefined && pin.repins !== null ||
    pin.aggregated_pin_data?.repins !== undefined && pin.aggregated_pin_data?.repins !== null ||
    pin.aggregatedStats?.repins !== undefined && pin.aggregatedStats?.repins !== null ||
    pin.aggregatedStats?.repin_count !== undefined && pin.aggregatedStats?.repin_count !== null ||
    pin.aggregatedPinData?.aggregatedStats?.repins !== undefined && pin.aggregatedPinData?.aggregatedStats?.repins !== null ||
    pin.done_count !== undefined && pin.done_count !== null ||
    pin.doneCount !== undefined && pin.doneCount !== null
  );

  const rawRepinsMetric = parseCleanMetric(
    st.repins ??
    st.repin_count ??
    st.repinCount ??
    pin.repin_count ??
    pin.repinCount ??
    pin.repins ??
    pin.aggregated_pin_data?.repins ??
    pin.aggregatedStats?.repins ??
    pin.aggregatedStats?.repin_count ??
    pin.aggregatedPinData?.aggregatedStats?.repins ??
    pin.done_count ??
    pin.doneCount ??
    null,
    null,
    { preserveCeiling: true }
  );

  const isUnhydratedStub = Boolean(
    pin.is_hydrated === false ||
    pin.is_search_stub ||
    pin.is_stub ||
    pin.stub ||
    pin._source === 'BaseSearchResource' ||
    pin.resource === 'BaseSearchResource' ||
    pin.has_explicit_saves === false
  );

  let repins = null;
  if (pin.has_explicit_repins === false || (isUnhydratedStub && (rawRepinsMetric === null || rawRepinsMetric === 0))) {
    repins = null;
  } else if (hasExplicitRepinsField || (rawRepinsMetric !== null && rawRepinsMetric > 0)) {
    repins = rawRepinsMetric !== null ? rawRepinsMetric : 0;
  }
  const hasExplicitRepins = repins !== null;

  // Check explicit saves field presence
  const hasExplicitSavesField = Boolean(
    st.saves !== undefined && st.saves !== null ||
    st.save_count !== undefined && st.save_count !== null ||
    st.saveCount !== undefined && st.saveCount !== null ||
    pin.save_count !== undefined && pin.save_count !== null ||
    pin.saveCount !== undefined && pin.saveCount !== null ||
    pin.saves !== undefined && pin.saves !== null ||
    pin.aggregated_pin_data?.saves !== undefined && pin.aggregated_pin_data?.saves !== null ||
    pin.aggregated_pin_data?.save_count !== undefined && pin.aggregated_pin_data?.save_count !== null ||
    pin.aggregated_pin_data?.aggregated_stats?.saves !== undefined && pin.aggregated_pin_data?.aggregated_stats?.saves !== null ||
    pin.aggregated_pin_data?.aggregated_stats?.save_count !== undefined && pin.aggregated_pin_data?.aggregated_stats?.save_count !== null ||
    pin.aggregatedStats?.saves !== undefined && pin.aggregatedStats?.saves !== null ||
    pin.aggregatedStats?.save_count !== undefined && pin.aggregatedStats?.save_count !== null ||
    pin.aggregatedPinData?.aggregatedStats?.saves !== undefined && pin.aggregatedPinData?.aggregatedStats?.saves !== null ||
    pin.aggregatedPinData?.saveCount !== undefined && pin.aggregatedPinData?.saveCount !== null
  );

  const rawSavesMetric = parseCleanMetric(
    st.saves ??
    st.save_count ??
    st.saveCount ??
    pin.save_count ??
    pin.saveCount ??
    pin.saves ??
    pin.aggregated_pin_data?.saves ??
    pin.aggregated_pin_data?.save_count ??
    pin.aggregated_pin_data?.aggregated_stats?.saves ??
    pin.aggregated_pin_data?.aggregated_stats?.save_count ??
    pin.aggregatedStats?.saves ??
    pin.aggregatedStats?.save_count ??
    pin.aggregatedPinData?.aggregatedStats?.saves ??
    pin.aggregatedPinData?.saveCount ??
    null,
    null,
    { preserveCeiling: true }
  );

  // [INVARIANT: UNHYDRATED-SAVES-NULL]
  // An unhydrated pin must have save_count = null (NOT 0).
  // Only assign a numeric value if explicit saves are confirmed in the payload.
  let saves = null;
  if (pin.has_explicit_saves === false || (isUnhydratedStub && (rawSavesMetric === null || rawSavesMetric === 0))) {
    saves = null;
  } else if (hasExplicitSavesField || (rawSavesMetric !== null && rawSavesMetric > 0)) {
    saves = rawSavesMetric !== null ? rawSavesMetric : 0;
  }
  const hasExplicitSaves = saves !== null;

  const comments = parseCleanMetric(
    pin.comment_count ??
    pin.commentCount ??
    pin.comments ??
    st.comment_count ??
    st.commentCount ??
    pin.aggregated_pin_data?.comment_count ??
    pin.aggregatedStats?.comments ??
    pin.aggregatedPinData?.commentCount ??
    0
  );

  const shareCount = parseCleanMetric(
    pin.share_count ??
    pin.shareCount ??
    st.share_count ??
    st.shareCount ??
    0
  );

  const pinId = String(pin.id || pin.pin_id || pin.node_id || '').trim();
  if (!pinId || pinId === 'undefined' || pinId === 'null' || pinId.startsWith('-') || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{9,127}$/.test(pinId)) {
    return null;
  }

  // Pin creation date
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
        ageDays = Math.max(0.1, msDiff / 86400000);
      }
    }
  }

  const velocity = null;

  // [INVARIANT: 48-FIELD-TELEMETRY-CAROUSEL-DETECTION]
  const isCarousel = Boolean(
    pin.is_carousel ||
    pin.isCarousel ||
    pin.method === 'carousel' ||
    pin.creation_method === 'carousel' ||
    pin.creationMethod === 'carousel' ||
    pin.type === 'carousel' ||
    (Array.isArray(pin.carousel_data?.slots) && pin.carousel_data.slots.length > 0) ||
    (Array.isArray(pin.carouselData?.slots) && pin.carouselData.slots.length > 0) ||
    (Array.isArray(pin.carousel_slots) && pin.carousel_slots.length > 0)
  );
  const isVideoPin = Boolean(pin.is_video || pin.isVideo || pin.video_status || pin.videos);
  const isIdeaPin = Boolean(
    pin.story_pin_data ||
    pin.storyPinData ||
    pin.story_pin_data_id ||
    pin.is_story_pin ||
    pin.isStoryPin ||
    pin.is_idea_pin
  );

  const explicitMethodCandidate = safeString(
    pin.method ||
    pin.creation_method ||
    pin.creationMethod ||
    pin.originType ||
    pin.origin_type ||
    pin.pinJoin?.originType ||
    ''
  );
  const hasSpecificExplicitMethod = Boolean(
    explicitMethodCandidate &&
    !['pinterest_platform', 'unhydrated_stub'].includes(explicitMethodCandidate.toLowerCase())
  );

  const rawProvider = safeString(
    pin.attribution?.provider_name ||
    pin.provider_name ||
    pin.via_app?.name ||
    pin.application?.name ||
    (pin.attribution?.url ? normalizeDomain('', pin.attribution.url) : '') ||
    ''
  );
  const providerSlug = (
    rawProvider &&
    !['pinterest', 'pinterest.com', 'uploaded by user'].includes(rawProvider.toLowerCase())
  )
    ? rawProvider.toLowerCase().replace(/[^a-z0-9.-]+/g, '_').replace(/^_+|_+$/g, '')
    : '';

  const hasRelayOrHydratedProof = Boolean(
    hasExplicitSaves ||
    pin.entityId ||
    pin.aggregatedPinData ||
    pin.closeupUnifiedAttribution ||
    pin.pinJoin ||
    pin.imageSignature ||
    pin.image_signature
  );

  let method = 'pinterest_platform';
  if (isCarousel) {
    method = 'carousel';
  } else if (hasSpecificExplicitMethod) {
    method = explicitMethodCandidate;
  } else if (isVideoPin) {
    method = 'video';
  } else if (isIdeaPin) {
    method = 'idea_pin';
  } else if (providerSlug) {
    method = providerSlug;
  } else if (hasRelayOrHydratedProof) {
    method = 'organic_pin';
  } else if (isUnhydratedStub || !hasExplicitSaves) {
    method = 'unhydrated_stub';
  }

  // Link & Domain
  let rawLink = String(pin.link || pin.destination_url || pin.url || '').trim();
  if (rawLink && !/^https?:\/\//i.test(rawLink) && !rawLink.startsWith('/')) {
    rawLink = `https://${rawLink}`;
  }
  const cleanLink = sanitizeDestinationUrl(rawLink);
  const domain = normalizeDomain(pin.domain, cleanLink || rawLink);

  // [INVARIANT: 48-FIELD-AFFILIATE-PRESERVATION] Preserve affiliate/arbitrage tracking links
  const utmLink = safeString(
    pin.utmLink ||
    pin.utm_link ||
    (/utm_/i.test(rawLink) ? rawLink : '')
  );
  const trackedLink = safeString(
    pin.trackedLink ||
    pin.tracked_link ||
    (rawLink && cleanLink && rawLink !== cleanLink ? rawLink : (rawLink.includes('?') ? rawLink : ''))
  );

  // Images
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

  // [INVARIANT: GUEST-AUDIENCE-EXTRACTION] Extract creator audience from closeupUnifiedAttribution in guest mode
  const creatorFollowers = parseCleanMetric(
    pin.pinner?.follower_count ||
    pin.pinner?.followerCount ||
    pin.creator?.follower_count ||
    pin.closeupUnifiedAttribution?.followerCount ||
    pin.closeupUnifiedAttribution?.follower_count ||
    pin.closeup_attribution?.follower_count ||
    0,
    0,
    { preserveCeiling: true }
  );

  return {
    pin_id: pinId,
    title: safeString(
      pin.grid_title ||
      pin.title ||
      pin.headline ||
      pin.unauthOnPageTitle ||
      pin.unauth_on_page_title ||
      pin.closeupUnifiedTitle ||
      pin.grid_description ||
      pin.rich_summary?.display_name ||
      pin.rich_metadata?.title ||
      seoTitle ||
      altText ||
      ''
    ),
    description: safeString(
      pin.closeupUnifiedDescription ||
      pin.closeup_unified_description ||
      pin.unauthOnPageDescription ||
      pin.unauth_on_page_description ||
      pin.description ||
      pin.articleBody
    ),
    grid_description: safeString(pin.description || pin.gridDescription || ''),
    alt_text: altText,
    seo_title: seoTitle,
    seo_description: seoDescription,
    link: safeString(cleanLink || rawLink || pin.link || pin.destination_url || pin.url),
    domain,
    board_id: String(pin.board?.entityId || pin.board?.id || pin.board_id || '').trim() || null,
    board_name: safeString(pin.board?.name || pin.board_name),
    creator_username: safeString(pin.pinner?.username || pin.creator?.username || pin.creator_username || pin.origin_pinner?.username || pin.closeupUnifiedAttribution?.username || pin.closeup_attribution?.username || ''),
    creator_name: safeString(pin.pinner?.full_name || pin.pinner?.fullName || pin.creator?.full_name || pin.creator_name || pin.closeupUnifiedAttribution?.fullName || pin.closeup_attribution?.full_name || ''),
    creator_avatar_url: pin.pinner?.image_url || pin.pinner?.imageMediumUrl || pin.pinner?.imageSmallUrl || pin.creator?.image_url || pin.closeupUnifiedAttribution?.imageMediumUrl || null,
    creator_followers: creatorFollowers,
    pinner: {
      username: safeString(pin.pinner?.username || pin.creator?.username || pin.creator_username || pin.closeupUnifiedAttribution?.username || ''),
      full_name: safeString(pin.pinner?.full_name || pin.pinner?.fullName || pin.creator?.full_name || pin.closeupUnifiedAttribution?.fullName || ''),
      follower_count: creatorFollowers,
      image_url: pin.pinner?.image_url || pin.pinner?.imageMediumUrl || pin.creator?.image_url || pin.closeupUnifiedAttribution?.imageMediumUrl || null
    },
    created_at: createdAtPinterest,
    created_at_pinterest: createdAtPinterest,
    method: method || 'pinterest_platform',
    creation_method: method || 'pinterest_platform',
    age_days: ageDays !== null ? Math.round(ageDays * 10) / 10 : null,
    velocity,
    image_url: imageUrl,
    dominant_color: dominantColor,
    is_video: Boolean(pin.is_video || pin.isVideo || pin.video_status),
    is_carousel: isCarousel,
    is_product: isProduct,
    save_count: saves,
    saves,
    has_explicit_saves: hasExplicitSaves,
    repin_count: repins,
    repins,
    has_explicit_repins: hasExplicitRepins,
    comment_count: comments,
    comments,
    share_count: shareCount,
    reaction_count: parseCleanMetric(pin.total_reaction_count || pin.reaction_counts?.total || 0),
    reactions: pin.reaction_counts || pin.reactions || {},
    annotations,
    tags: annotations.map(a => a.name),
    is_repin: Boolean(pin.is_repin ?? pin.isRepin ?? false),
    origin_pinner: (pin.originPinner || pin.origin_pinner) ? {
      username: safeString(pin.originPinner?.username || pin.origin_pinner?.username || ''),
      full_name: safeString(pin.originPinner?.fullName || pin.origin_pinner?.full_name || ''),
      follower_count: parseCleanMetric(pin.originPinner?.followerCount || pin.origin_pinner?.follower_count || 0, 0, { preserveCeiling: true }),
      image_url: pin.originPinner?.imageMediumUrl || pin.origin_pinner?.image_medium_url || pin.originPinner?.imageSmallUrl || null,
      is_verified_merchant: Boolean(pin.originPinner?.isVerifiedMerchant || pin.originPinner?.is_verified_merchant)
    } : null,
    domain_official_user: (pin.linkDomain?.officialUser || pin.link_domain?.official_user) ? {
      username: safeString(pin.linkDomain?.officialUser?.username || pin.link_domain?.official_user?.username || ''),
      full_name: safeString(pin.linkDomain?.officialUser?.fullName || pin.link_domain?.official_user?.full_name || ''),
      follower_count: parseCleanMetric(pin.linkDomain?.officialUser?.followerCount || pin.link_domain?.official_user?.follower_count || 0, 0, { preserveCeiling: true }),
      is_verified_merchant: Boolean(pin.linkDomain?.officialUser?.isVerifiedMerchant || pin.link_domain?.official_user?.isVerifiedMerchant)
    } : null,
    creator_is_verified_merchant: Boolean(pin.pinner?.is_verified_merchant || pin.pinner?.isVerifiedMerchant || pin.creator?.is_verified_merchant || false),
    board_pin_count: parseCleanMetric(pin.board?.pin_count || pin.board?.pinCount || 0),
    board_order_modified_at: pin.board?.board_order_modified_at || pin.board?.boardOrderModifiedAt || null,
    board_url: pin.board?.url || null,
    image_signature: safeString(pin.imageSignature || pin.image_signature || ''),
    seo_noindex_reason: pin.seoNoindexReason || pin.seo_noindex_reason || null,
    is_go_linkless: Boolean(pin.isGoLinkless || pin.is_go_linkless || false),
    utm_link: utmLink,
    tracked_link: trackedLink,
    category_breadcrumbs: Array.isArray(pin.pinJoin?.seoBreadcrumbs)
      ? pin.pinJoin.seoBreadcrumbs.map(b => b?.name).filter(Boolean)
      : (Array.isArray(pin.seo_breadcrumbs) ? pin.seo_breadcrumbs : []),
    seo_related_interests: Array.isArray(pin.pinJoin?.seoRelatedInterests)
      ? pin.pinJoin.seoRelatedInterests.map(i => ({ name: safeString(i.name), url: safeString(i.url) })).filter(i => i.name)
      : (Array.isArray(pin.seo_related_interests) ? pin.seo_related_interests : []),
    rich_metadata: pin.rich_metadata || (pin.richMetadata ? {
      site_name: safeString(pin.richMetadata.siteName || ''),
      title: safeString(pin.richMetadata.title || ''),
      description: safeString(pin.richMetadata.description || ''),
      url: safeString(pin.richMetadata.url || ''),
      article_published_at: pin.article_published_at || pin.richMetadata.article?.datePublished || null,
      type: pin.richMetadata.type || (pin.richMetadata.article ? 'article' : null)
    } : null),
    article_published_at: pin.article_published_at || pin.rich_metadata?.article_published_at || null,
    aggregated_pin_data_id: pin.aggregated_pin_data_id || pin.aggregatedPinData?.entityId || null,
    golden_set_interest: pin.golden_set_interest || null,
    seo_canonical_url: safeString(pin.pinJoin?.seoCanonicalUrl || pin.seo_canonical_url || ''),
    seo_canonical_domain: safeString(pin.pinJoin?.seoCanonicalDomain || pin.seo_canonical_domain || 'www.pinterest.com'),
    canonical_pin_id: pin.canonical_pin_id || pin.canonical_pin?.entity_id || pin.pinJoin?.canonicalPin?.entityId || (pin.seo_canonical_url ? safeString(pin.seo_canonical_url).replace(/[^0-9]/g, '') : null),
    canonical_pin_url: (pin.pinJoin?.canonicalPin?.entityId || pin.canonical_pin_id || (pin.seo_canonical_url ? safeString(pin.seo_canonical_url).replace(/[^0-9]/g, '') : null))
      ? `https://www.pinterest.com/pin/${pin.pinJoin?.canonicalPin?.entityId || pin.canonical_pin_id || safeString(pin.seo_canonical_url).replace(/[^0-9]/g, '')}/`
      : (pin.seo_canonical_url ? (pin.seo_canonical_url.startsWith('http') ? pin.seo_canonical_url : `https://www.pinterest.com${pin.seo_canonical_url}`) : null),
    visual_objects: Array.isArray(pin.visualObjects) ? pin.visualObjects : (Array.isArray(pin.visual_objects) ? pin.visual_objects : []),
    board_cover_url: pin.board?.image_cover_url || pin.board?.imageCoverUrl || pin.board_cover_url || null,
    board_thumbnail_url: pin.board?.image_thumbnail_url || pin.board?.imageThumbnailUrl || pin.board_thumbnail_url || null,
    top_interest_id: pin.topInterest ?? pin.top_interest ?? null,
    unauth_on_page_title: safeString(pin.unauthOnPageTitle || pin.unauth_on_page_title || ''),
    unauth_on_page_description: safeString(pin.unauthOnPageDescription || pin.unauth_on_page_description || ''),
    image_dimensions: (pin.images_orig?.width && pin.images_orig?.height) ? {
      width: Number(pin.images_orig.width),
      height: Number(pin.images_orig.height),
      aspect_ratio: Math.round((Number(pin.images_orig.width) / Number(pin.images_orig.height)) * 100) / 100
    } : null
  };
}

/**
 * Extracts all JSON payloads from __PWS_RELAY_REGISTER_COMPLETED_REQUEST__(requestId, payload)
 * calls using quote/escape-aware balanced brace parsing.
 *
 * @param {string} rawHtml
 * @returns {Array<object>} Array of parsed JSON payloads
 */
export function extractRelayCompletedPayloads(rawHtml) {
  if (!rawHtml || typeof rawHtml !== 'string') return [];
  const html = rawHtml.length > 4000000 ? rawHtml.slice(0, 4000000) : rawHtml;
  const relayPrefix = '__PWS_RELAY_REGISTER_COMPLETED_REQUEST__';
  const results = [];
  let searchPos = 0;

  while ((searchPos = html.indexOf(relayPrefix, searchPos)) !== -1) {
    let cursor = searchPos + relayPrefix.length;
    while (cursor < html.length && /\s/.test(html[cursor])) cursor++;
    if (cursor >= html.length || html[cursor] !== '(') {
      searchPos += relayPrefix.length;
      continue;
    }

    let argDepth = 0;
    let argQuote = null;
    let argEscaped = false;
    let firstComma = -1;
    for (let i = cursor + 1; i < html.length; i++) {
      const ch = html[i];
      if (argQuote) {
        if (argEscaped) {
          argEscaped = false;
        } else if (ch === '\\') {
          argEscaped = true;
        } else if (ch === argQuote) {
          argQuote = null;
        }
      } else {
        if (ch === '"' || ch === "'" || ch === '`') {
          argQuote = ch;
        } else if (ch === '(' || ch === '{' || ch === '[') {
          argDepth++;
        } else if (ch === '}' || ch === ']') {
          if (argDepth > 0) argDepth--;
        } else if (ch === ')') {
          if (argDepth === 0) {
            searchPos = i + 1;
            break;
          }
          argDepth--;
        } else if (ch === ',' && argDepth === 0) {
          firstComma = i;
          break;
        }
      }
    }

    if (firstComma === -1) {
      if (searchPos <= cursor) searchPos = cursor + 1;
      continue;
    }

    let braceStart = firstComma + 1;
    while (braceStart < html.length && /\s/.test(html[braceStart])) braceStart++;
    if (braceStart >= html.length || html[braceStart] !== '{') {
      searchPos = firstComma + 1;
      continue;
    }

    let depth = 0;
    let inString = false;
    let isEscaped = false;
    let foundEnd = -1;

    for (let i = braceStart; i < html.length; i++) {
      const ch = html[i];
      if (inString) {
        if (isEscaped) {
          isEscaped = false;
        } else if (ch === '\\') {
          isEscaped = true;
        } else if (ch === '"') {
          inString = false;
        }
      } else {
        if (ch === '"') {
          inString = true;
        } else if (ch === '{') {
          depth++;
        } else if (ch === '}') {
          depth--;
          if (depth === 0) {
            foundEnd = i + 1;
            break;
          }
        }
      }
    }

    if (foundEnd === -1) {
      searchPos = braceStart + 1;
      continue;
    }

    searchPos = foundEnd;
    try {
      const jsonStr = html.slice(braceStart, foundEnd);
      const parsed = JSON.parse(jsonStr);
      if (parsed && typeof parsed === 'object') {
        results.push(parsed);
      }
    } catch (_) {}
  }

  return results;
}

function mergeRelayV3Pin(target, v3) {
  const prevTitle = target.title || null;
  const prevDesc = target.description || null;
  Object.assign(target, v3);

  if (prevTitle && !v3.title) target.title = prevTitle;
  if (prevDesc && !v3.description) target.description = prevDesc;

  const realId = v3.entityId || (typeof v3.id === 'string' && /^\d+$/.test(v3.id) ? v3.id : null);
  if (realId) target.id = realId;

  if (!target.images && (v3.imageSpec_736x || v3.imageSpec_564x || v3.imageSpec_236x || v3.imageSpec_orig)) {
    target.images = {};
    if (v3.imageSpec_736x) target.images['736x'] = v3.imageSpec_736x;
    if (v3.imageSpec_564x) target.images['564x'] = v3.imageSpec_564x;
    if (v3.imageSpec_236x) target.images['236x'] = v3.imageSpec_236x;
    if (v3.imageSpec_orig) target.images['orig'] = v3.imageSpec_orig;
  }

  if (v3.seoAltText) target.seoAltText = v3.seoAltText;
  if (v3.altText) target.altText = v3.altText;
  if (v3.title) target.title = v3.title;
  if (v3.gridTitle && !target.title) target.title = v3.gridTitle;

  if (v3.closeupUnifiedDescription) target.closeupUnifiedDescription = v3.closeupUnifiedDescription;
  if (v3.unauthOnPageDescription) target.unauthOnPageDescription = v3.unauthOnPageDescription;
  if (v3.description && (!target.description || v3.description.length > target.description.length)) {
    target.description = v3.description;
  }
  if (v3.gridDescription && !target.description) {
    target.description = v3.gridDescription;
  }

  if (v3.seoTitle) target.seoTitle = v3.seoTitle;
  if (v3.seoDescription) target.seoDescription = v3.seoDescription;
  if (v3.link) target.link = v3.link;
  if (v3.domain) target.domain = v3.domain;
  if (v3.dominantColor) target.dominantColor = v3.dominantColor;
  if (v3.createdAt) target.createdAt = v3.createdAt;
  if (v3.created_at) target.created_at = v3.created_at;

  const isCarouselPin = Boolean(
    v3.isCarousel ||
    v3.is_carousel ||
    v3.carouselData ||
    v3.carousel_data ||
    v3.carousel_slots ||
    v3.method === 'carousel' ||
    v3.creation_method === 'carousel' ||
    v3.creationMethod === 'carousel'
  );
  if (isCarouselPin) {
    target.is_carousel = true;
    target.isCarousel = true;
    target.method = 'carousel';
    target.creation_method = 'carousel';
  } else {
    const detectedMethod = v3.method || v3.creationMethod || v3.creation_method || v3.originType || v3.origin_type || v3.pinJoin?.originType || v3.attribution?.provider_name;
    if (detectedMethod) {
      target.method = detectedMethod;
      target.creation_method = detectedMethod;
    }
  }
  if (v3.attribution?.provider_name) target.provider_name = v3.attribution.provider_name;

  if (v3.aggregatedPinData) {
    if (v3.aggregatedPinData.entityId) {
      target.aggregated_pin_data_id = String(v3.aggregatedPinData.entityId);
    }
    if (v3.aggregatedPinData.aggregatedStats) {
      target.aggregated_pin_data = {
        aggregated_stats: {
          saves: v3.aggregatedPinData.aggregatedStats.saves,
          save_count: v3.aggregatedPinData.aggregatedStats.saveCount ?? v3.aggregatedPinData.aggregatedStats.saves,
          done_count: v3.aggregatedPinData.aggregatedStats.doneCount
        }
      };
    }
  }

  if (v3.closeupUnifiedAttribution) {
    target.closeupUnifiedAttribution = v3.closeupUnifiedAttribution;
    if (v3.closeupUnifiedAttribution.followerCount !== undefined) {
      if (!target.pinner) target.pinner = {};
      target.pinner.follower_count = v3.closeupUnifiedAttribution.followerCount;
      target.pinner.username = v3.closeupUnifiedAttribution.username || v3.closeupUnifiedAttribution.name;
    }
  }
}

/**
 * Extract pin data from raw HTML using the multi-stage fallback hierarchy:
 * 1. __PWS_DATA__ SSR JSON script tag
 * 2. Relay Completed Requests (__PWS_RELAY_REGISTER_COMPLETED_REQUEST__)
 * 3. Prefetched Queries (__PWS_RELAY_PREFETCHED_QUERIES__)
 * 4. Inline JSON Data Blocks (<script type="application/json">)
 * 5. JSON-LD schema (<script type="application/ld+json">)
 * 6. OpenGraph / pinterest:* meta tags
 */
export function extractPinFromHtml(rawHtml, pinId) {
  if (!rawHtml || typeof rawHtml !== 'string') return null;
  const html = rawHtml.length > 4000000 ? rawHtml.slice(0, 4000000) : rawHtml;

  let mergedPin = null;

  // Stage 1: __PWS_DATA__ script tag
  const pwsMatch = html.match(/<script[^>]*id="__PWS_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (pwsMatch) {
    try {
      const data = JSON.parse(pwsMatch[1]);
      const found = findPinInTree(data, pinId);
      if (found) {
        mergedPin = { ...found };
      }
    } catch (_) {}
  }

  // Stage 2: Relay Completed Requests
  const relayPayloads = extractRelayCompletedPayloads(html);
  for (const payload of relayPayloads) {
    try {
      const v3 = payload?.data?.v3GetPinQueryv2?.data;
      if (v3 && (String(v3.entityId || v3.id || '') === String(pinId) || !pinId || String(v3.id || '').includes(String(pinId)))) {
        if (!mergedPin) mergedPin = {};
        mergeRelayV3Pin(mergedPin, v3);
      } else {
        const found = findPinInTree(payload, pinId);
        if (found) {
          if (!mergedPin) mergedPin = {};
          mergeRelayV3Pin(mergedPin, found);
        }
      }
    } catch (_) {}
  }

  // Stage 3: Prefetched Queries
  const prefetchMatch = html.match(/__PWS_RELAY_PREFETCHED_QUERIES__\s*=\s*([\s\S]*?);<\/script>/i);
  if (prefetchMatch) {
    try {
      const data = JSON.parse(prefetchMatch[1]);
      const found = findPinInTree(data, pinId);
      if (found) {
        if (!mergedPin) mergedPin = { ...found };
        else Object.assign(mergedPin, found);
      }
    } catch (_) {}
  }

  // Stage 4: Inline application/json script blocks
  const jsonBlocks = html.matchAll(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/gi);
  for (const block of jsonBlocks) {
    try {
      const data = JSON.parse(block[1]);
      const found = findPinInTree(data, pinId);
      if (found) {
        if (!mergedPin) mergedPin = { ...found };
        else Object.assign(mergedPin, found);
      }
    } catch (_) {}
  }

  // Stage 5: JSON-LD Schema + OpenGraph / pinterest:* Meta Tags
  const pinSavesMeta = html.match(/<meta[^>]*name=["']pinterest:saves["'][^>]*content=["'](.*?)["']/i)?.[1];
  const pinRepinsMeta = html.match(/<meta[^>]*name=["']pinterest:repins["'][^>]*content=["'](.*?)["']/i)?.[1];
  let ogSaves = pinSavesMeta !== undefined ? parseCleanMetric(pinSavesMeta, null, { preserveCeiling: true }) : null;
  const ogRepins = pinRepinsMeta !== undefined ? parseCleanMetric(pinRepinsMeta, null, { preserveCeiling: true }) : null;
  let ldReactionCount = null;

  const jsonLdMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
  if (jsonLdMatch) {
    try {
      const ld = JSON.parse(jsonLdMatch[1]);
      const ldObj = Array.isArray(ld) ? ld[0] : ld;
      if (ldObj && typeof ldObj === 'object') {
        if (!mergedPin) mergedPin = {};
        if (ldObj.name && !mergedPin.title) mergedPin.title = ldObj.name;
        if (ldObj.headline && !mergedPin.headline) mergedPin.headline = ldObj.headline;
        if (ldObj.articleBody && !mergedPin.description) mergedPin.description = ldObj.articleBody;
        if (ldObj.image && !mergedPin.image_url) {
          const img = Array.isArray(ldObj.image) ? ldObj.image[0] : (typeof ldObj.image === 'object' ? ldObj.image.url : ldObj.image);
          if (img) mergedPin.image_url = img;
        }
        if (ldObj.datePublished && !mergedPin.created_at) mergedPin.created_at = ldObj.datePublished;
        if (ldObj.creator?.name && (!mergedPin.pinner || !mergedPin.pinner.username)) {
          mergedPin.pinner = {
            ...(mergedPin.pinner || {}),
            full_name: ldObj.creator.name,
            username: ldObj.creator.alternateName || ldObj.creator.name
          };
        }
        if (Array.isArray(ldObj.interactionStatistic)) {
          for (const stat of ldObj.interactionStatistic) {
            if (!stat || typeof stat !== 'object') continue;
            const rawCount = stat.userInteractionCount;
            const hasFiniteCount =
              rawCount !== undefined &&
              rawCount !== null &&
              String(rawCount).trim() !== '' &&
              Number.isFinite(Number(rawCount));
            if (!hasFiniteCount) continue;
            const count = parseCleanMetric(rawCount, null, { preserveCeiling: true });
            if (count === null) continue;
            const interactionType = String(stat.interactionType || stat.name || '');
            if (interactionType.includes('SaveAction') || interactionType.includes('BookmarkAction')) {
              if (ogSaves === null) ogSaves = count;
            } else if (interactionType.includes('LikeAction')) {
              if (ldReactionCount === null) ldReactionCount = count;
            }
          }
        }
      }
    } catch (_) {}
  }

  // Stage 6: OpenGraph Meta Tags
  if (!mergedPin || !mergedPin.title || !mergedPin.image_url) {
    const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["'](.*?)["']/i)?.[1];
    const ogDesc = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["'](.*?)["']/i)?.[1];
    const ogImage = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["'](.*?)["']/i)?.[1];
    if (ogTitle || ogImage) {
      if (!mergedPin) mergedPin = {};
      if (ogTitle && !mergedPin.title) mergedPin.title = ogTitle;
      if (ogDesc && !mergedPin.description) mergedPin.description = ogDesc;
      if (ogImage && !mergedPin.image_url) mergedPin.image_url = ogImage;
    }
  }

  if (mergedPin && !mergedPin.id && pinId) {
    mergedPin.id = pinId;
  }

  const formatted = formatPin(mergedPin);
  if (formatted) {
    if (ogSaves !== null && (formatted.saves === null || formatted.saves === 0)) {
      formatted.saves = ogSaves;
      formatted.save_count = ogSaves;
      formatted.has_explicit_saves = true;
      if (formatted.creation_method === 'pinterest_platform' || formatted.creation_method === 'unhydrated_stub') {
        formatted.creation_method = 'organic_pin';
        formatted.method = 'organic_pin';
      }
    }
    if (ogRepins !== null) {
      formatted.repins = ogRepins;
      formatted.repin_count = ogRepins;
      formatted.has_explicit_repins = true;
    }
    if (ldReactionCount !== null && (!formatted.reaction_count || formatted.reaction_count === 0)) {
      formatted.reaction_count = ldReactionCount;
    }
  }
  return formatted;
}

/**
 * Unified HTML Pin Extractor alias preserving backwards compatibility.
 */
export const extractPinData = extractPinFromHtml;

/**
 * Fetch single pin via PinResource/get/?data=... endpoint.
 * Supports both (pinId, options) and (pinId, dispatcher, returnEnvelope) calling conventions.
 *
 * @param {string} pinId
 * @param {object|null} [dispatcherOrOptions]
 * @param {boolean} [returnEnvelope=false]
 * @returns {Promise<object|null>}
 */
export async function fetchPinFromPinResource(pinId, dispatcherOrOptions = null, returnEnvelope = false) {
  const cleanId = String(pinId || '').trim();
  const isOptionsObj = Boolean(
    dispatcherOrOptions &&
    typeof dispatcherOrOptions === 'object' &&
    typeof dispatcherOrOptions.dispatch !== 'function' &&
    ('dispatcher' in dispatcherOrOptions || 'timeoutMs' in dispatcherOrOptions || Object.keys(dispatcherOrOptions).length === 0)
  );
  const actualDispatcher = isOptionsObj
    ? (dispatcherOrOptions.dispatcher || getDefaultDispatcher())
    : (dispatcherOrOptions || getDefaultDispatcher());
  const timeoutMs = (isOptionsObj && dispatcherOrOptions.timeoutMs) ? dispatcherOrOptions.timeoutMs : 8000;

  if (!cleanId) {
    return returnEnvelope ? { ok: false, status: 400, pin: null } : null;
  }

  const dataParam = encodeURIComponent(JSON.stringify({
    options: {
      id: cleanId,
      field_set_key: 'detailed'
    },
    context: {}
  }));
  const sourceUrl = encodeURIComponent(`/pin/${cleanId}/`);
  const url = `https://www.pinterest.com/resource/PinResource/get/?source_url=${sourceUrl}&data=${dataParam}`;

  const headers = getPinterestXhrHeaders('', '', {
    sourceUrl: `/pin/${cleanId}/`,
    handler: 'www/pin/[id].js'
  });

  let formattedPin = null;
  try {
    const res = await pinterestFetch(url, {
      headers,
      timeoutMs,
      dispatcher: actualDispatcher
    });
    if (res.ok) {
      const body = await res.json();
      const pinData = body?.resource_response?.data;
      if (pinData) {
        formattedPin = formatPin(pinData);
      }
    }
  } catch (_) {}

  if (returnEnvelope) {
    return { ok: Boolean(formattedPin), status: formattedPin ? 200 : 404, pin: formattedPin };
  }
  return formattedPin;
}

/**
 * Fallback to Pidgets endpoint
 *
 * @param {string|string[]} pinIds
 * @param {object} [options]
 * @returns {Promise<object[]|object|null>}
 */
export async function fetchPinFromPidgets(pinIds, options = {}) {
  const ids = Array.isArray(pinIds) ? pinIds : [pinIds];
  const cleanIds = ids.map(id => String(id || '').trim()).filter(Boolean);
  if (cleanIds.length === 0) return Array.isArray(pinIds) ? [] : null;

  const url = `https://widgets.pinterest.com/v3/pidgets/pins/info/?pin_ids=${cleanIds.join(',')}`;
  const headers = {
    'User-Agent': PINTEREST_PAGE_HEADERS['User-Agent'],
    'Accept': 'application/json',
    'Referer': 'https://widgets.pinterest.com/'
  };

  try {
    const res = await pinterestFetch(url, {
      headers,
      timeoutMs: options.timeoutMs || 8000,
      dispatcher: options.dispatcher || getDefaultDispatcher()
    });
    if (!res.ok) return Array.isArray(pinIds) ? [] : null;

    const data = await res.json();
    const rawPins = Array.isArray(data?.data?.pins) ? data.data.pins : (Array.isArray(data?.data) ? data.data : []);
    const formatted = rawPins.map(p => formatPin(p)).filter(Boolean);

    if (Array.isArray(pinIds)) {
      return formatted;
    }
    return formatted[0] || null;
  } catch (_) {
    return Array.isArray(pinIds) ? [] : null;
  }
}

/**
 * Batch 50-Pin Pidgets Ingestion Client
 * Slices arbitrary pin IDs into chunks of at most 50 IDs and queries widgets.pinterest.com/v3/pidgets/pins/info/
 * Delivers 50 hydrated pins in a single subrequest (<550ms, 98% subrequest reduction).
 *
 * @param {Array<string|number>} pinIds - Array of Pinterest pin snowflake IDs
 * @param {object} [options]
 * @returns {Promise<Map<string, object> & { ok: boolean, pins: Array<object> }>}
 */
export async function fetchPinsBatchFromPidgets(pinIds = [], options = {}) {
  const dispatcher = options.dispatcher || getDefaultDispatcher();
  const timeoutMs = options.timeoutMs || 8000;

  const validIds = Array.from(new Set(
    (Array.isArray(pinIds) ? pinIds : [pinIds])
      .map(id => String(id || '').trim())
      .filter(id => /^\d{10,25}$/.test(id))
  ));

  const resultsMap = new Map();

  if (validIds.length === 0) {
    resultsMap.ok = true;
    resultsMap.pins = [];
    return resultsMap;
  }

  const chunkSize = 50;
  for (let i = 0; i < validIds.length; i += chunkSize) {
    const slice = validIds.slice(i, i + chunkSize);
    const endpoint = `https://widgets.pinterest.com/v3/pidgets/pins/info/?pin_ids=${slice.join(',')}`;

    try {
      const reqHeaders = options.headers
        ? { ...PINTEREST_JSON_API_HEADERS, ...options.headers }
        : PINTEREST_JSON_API_HEADERS;
      const res = await pinterestFetch(endpoint, {
        headers: reqHeaders,
        signal: AbortSignal.timeout(timeoutMs),
        dispatcher
      });

      if (!res.ok) {
        if (res.body) await res.body.cancel().catch(() => {});
        for (const id of slice) {
          if (!resultsMap.has(id)) {
            resultsMap.set(id, { pin_id: id, id, is_missing: true, saves: null, save_count: null, repins: null, repin_count: null, has_explicit_saves: false, has_explicit_repins: false, status: res.status });
          }
        }
        continue;
      }

      const json = await res.json();
      const rawPins = json?.data?.pins || json?.pins || json?.data || [];
      const pinList = Array.isArray(rawPins) ? rawPins : Object.values(rawPins);
      const returnedIds = new Set();

      for (const pin of pinList) {
        if (!pin || !pin.id) continue;
        const idStr = String(pin.id);
        returnedIds.add(idStr);

        const hasExplicitSaves = Boolean(
          pin.aggregated_pin_data?.aggregated_stats?.saves !== undefined && pin.aggregated_pin_data?.aggregated_stats?.saves !== null ||
          pin.aggregated_stats?.saves !== undefined && pin.aggregated_stats?.saves !== null ||
          pin.save_count !== undefined && pin.save_count !== null
        );
        const rawSaves = (
          pin.aggregated_pin_data?.aggregated_stats?.saves ??
          pin.aggregated_stats?.saves ??
          pin.save_count ??
          null
        );
        const saves = rawSaves !== null ? Number(rawSaves) : (hasExplicitSaves ? 0 : null);

        const hasExplicitRepins = Boolean(pin.repin_count !== undefined && pin.repin_count !== null);
        const repins = hasExplicitRepins ? Number(pin.repin_count) : null;

        const title = (
          pin.title ||
          pin.story_pin_data?.metadata?.pin_title ||
          pin.rich_metadata?.title ||
          ''
        ).trim();

        const link = pin.link || pin.rich_metadata?.url || '';
        const domain = pin.domain || (link ? normalizeDomain('', link) : '') || '';

        const standardImageUrl =
          pin.images?.['736x']?.url ||
          pin.story_pin_data?.pages?.[0]?.image?.images?.['736x']?.url ||
          pin.images?.['564x']?.url ||
          pin.images?.['236x']?.url ||
          '';

        const hdImageUrl = standardImageUrl
          ? standardImageUrl.replace(/\/(236x|474x|564x|736x)\//, '/1200x/')
          : '';

        const pinner = pin.pinner ? {
          id: String(pin.pinner.id || ''),
          username: pin.pinner.username || '',
          full_name: pin.pinner.full_name || '',
          profile_url: pin.pinner.profile_url || '',
          follower_count: Number(pin.pinner.follower_count || 0),
          pin_count: Number(pin.pinner.pin_count || 0),
          about: pin.pinner.about || '',
          image_small_url: pin.pinner.image_small_url || ''
        } : null;

        const board = pin.board ? {
          id: String(pin.board.id || ''),
          name: pin.board.name || '',
          url: pin.board.url || '',
          pin_count: Number(pin.board.pin_count || 0),
          follower_count: Number(pin.board.follower_count || 0),
          description: pin.board.description || ''
        } : null;

        resultsMap.set(idStr, {
          pin_id: idStr,
          id: idStr,
          saves,
          save_count: saves,
          has_explicit_saves: hasExplicitSaves || saves > 0,
          repins,
          repin_count: repins,
          has_explicit_repins: repins !== null,
          title,
          description: pin.description || '',
          domain,
          destination_url: link,
          link,
          dominant_color: pin.dominant_color || null,
          image_url: standardImageUrl,
          image_hd_url: hdImageUrl,
          images: pin.images || {},
          pinner,
          creator: pinner,
          board,
          is_missing: false
        });
      }

      for (const id of slice) {
        if (!returnedIds.has(id) && !resultsMap.has(id)) {
          resultsMap.set(id, { pin_id: id, id, is_missing: true, saves: null, save_count: null, repins: null, repin_count: null, has_explicit_saves: false, has_explicit_repins: false });
        }
      }
    } catch (_) {
      for (const id of slice) {
        if (!resultsMap.has(id)) {
          resultsMap.set(id, { pin_id: id, id, is_missing: true, saves: null, save_count: null, repins: null, repin_count: null, has_explicit_saves: false, has_explicit_repins: false });
        }
      }
    }
  }

  resultsMap.ok = true;
  resultsMap.pins = Array.from(resultsMap.values());
  return resultsMap;
}

/**
 * Universal Pin Deep Extractor with 3-tier Fallback Hierarchy:
 * Tier 1: SSR __PWS_DATA__ HTML parsing
 * Tier 2: PinResource/get/?data=... closeup fallback (~90ms)
 * Tier 3: Pidgets batch fallback
 *
 * @param {string} pinId
 * @param {object} [options]
 * @returns {Promise<object|null>}
 */
export async function fetchAndExtractPin(pinId, options = {}) {
  const cleanId = String(pinId || '').trim();
  if (!cleanId) return null;

  // Tier 1: Fetch HTML and parse SSR data
  const pinPageUrl = `https://www.pinterest.com/pin/${cleanId}/`;
  let pinResult = null;

  try {
    const htmlRes = await pinterestFetch(pinPageUrl, {
      headers: PINTEREST_PAGE_HEADERS,
      timeoutMs: options.timeoutMs || 8000,
      dispatcher: options.dispatcher
    });
    if (htmlRes.ok) {
      const htmlText = await htmlRes.text();
      pinResult = extractPinFromHtml(htmlText, cleanId);
    }
  } catch (_) {}

  // If pin has explicit saves, return immediately
  if (pinResult && pinResult.has_explicit_saves && pinResult.save_count !== null) {
    return pinResult;
  }

  // Tier 2: Fallback to PinResource/get/?data=...
  try {
    const resourcePin = await fetchPinFromPinResource(cleanId, options);
    if (resourcePin) {
      if (!pinResult) {
        pinResult = resourcePin;
      } else {
        if (resourcePin.has_explicit_saves && resourcePin.save_count !== null) {
          pinResult.save_count = resourcePin.save_count;
          pinResult.saves = resourcePin.saves;
          pinResult.has_explicit_saves = true;
        }
        if (resourcePin.has_explicit_repins) {
          pinResult.has_explicit_repins = true;
        }
        if (resourcePin.repin_count) pinResult.repin_count = resourcePin.repin_count;
        if (resourcePin.comment_count) pinResult.comment_count = resourcePin.comment_count;
        if (resourcePin.annotations && resourcePin.annotations.length > 0) {
          pinResult.annotations = resourcePin.annotations;
          pinResult.tags = resourcePin.tags;
        }
      }
    }
  } catch (_) {}

  if (pinResult && pinResult.has_explicit_saves && pinResult.save_count !== null) {
    return pinResult;
  }

  // Tier 3: Fallback to Pidgets
  try {
    const pidgetsPin = await fetchPinFromPidgets(cleanId, options);
    if (pidgetsPin) {
      if (!pinResult) {
        pinResult = pidgetsPin;
      } else {
        if (pidgetsPin.has_explicit_saves && pidgetsPin.save_count !== null) {
          pinResult.save_count = pidgetsPin.save_count;
          pinResult.saves = pidgetsPin.saves;
          pinResult.has_explicit_saves = true;
        }
        if (pidgetsPin.has_explicit_repins) {
          pinResult.has_explicit_repins = true;
        }
        if (pidgetsPin.repin_count) pinResult.repin_count = pidgetsPin.repin_count;
      }
    }
  } catch (_) {}

  return pinResult;
}

export async function fetchPinHybrid(pinId, { isTelemetryOnly = false, cookie = null, dispatcher = null } = {}) {
  const actualDispatcher = dispatcher || getDefaultDispatcher();
  const isNumericSnowflake = /^\d+$/.test(String(pinId || '').trim());
  if (isTelemetryOnly && isNumericSnowflake) {
    const fastRes = await fetchPinFromPinResource(pinId, actualDispatcher, true);
    if (fastRes && fastRes.status === 429) {
      return fastRes;
    }
    if (fastRes && fastRes.ok && fastRes.pin) {
      const p = fastRes.pin;
      const hasValidSaves = (p.saves || 0) > 0 || Boolean(p.has_explicit_saves);

      if (hasValidSaves) {
        return fastRes;
      }

      const ssrRes = await fetchPinFromPinterest(pinId, cookie, { dispatcher: actualDispatcher });
      if (ssrRes && ssrRes.ok && ssrRes.pin) {
        if (p.saves !== null && p.saves !== undefined) {
          ssrRes.pin.saves = (ssrRes.pin.saves !== null && ssrRes.pin.saves !== undefined)
            ? Math.max(Number(ssrRes.pin.saves), Number(p.saves))
            : Number(p.saves);
          ssrRes.pin.save_count = ssrRes.pin.saves;
          if (p.has_explicit_saves || Number(p.saves) > 0) ssrRes.pin.has_explicit_saves = true;
        }
        if (p.repins !== null && p.repins !== undefined) {
          ssrRes.pin.repins = (ssrRes.pin.repins !== null && ssrRes.pin.repins !== undefined)
            ? Math.max(Number(ssrRes.pin.repins), Number(p.repins))
            : Number(p.repins);
          ssrRes.pin.repin_count = ssrRes.pin.repins;
          if (p.has_explicit_repins || Number(p.repins) > 0) ssrRes.pin.has_explicit_repins = true;
        }
        return ssrRes;
      }
      return fastRes;
    }
  }
  return await fetchPinFromPinterest(pinId, cookie, { dispatcher: actualDispatcher });
}

// [INVARIANT: STRICT-GUEST-SCRAPING] Unauthenticated guest session headers (NO LOGGED-IN COOKIES)
export async function fetchPinFromPinterest(pinId, cookieOrOptions = null, maybeOptions = {}) {
  try {
    const cleanId = String(pinId || '').trim();
    if (!cleanId || cleanId.startsWith('-') || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{9,127}$/.test(cleanId)) {
      return { ok: false, status: 400, error: 'invalid_pin_id' };
    }
    const opts = (typeof cookieOrOptions === 'object' && cookieOrOptions !== null)
      ? cookieOrOptions
      : (maybeOptions || {});
    const dispatcher = opts.dispatcher || getDefaultDispatcher();

    let cookieStr = (typeof cookieOrOptions === 'string') ? cookieOrOptions : (opts.cookie || '');
    if (cookieStr) {
      cookieStr = cookieStr.replace(/(?:^|;\s*)_auth=1(?:;|$)/gi, '; ').trim().replace(/^;\s*|;\s*$/g, '');
    }
    const headers = { ...PINTEREST_PAGE_HEADERS };
    if (cookieStr && opts.allowGuestCookie === true && !cookieStr.includes('_auth=1')) {
      headers['Cookie'] = cookieStr;
    }

    const url = `https://www.pinterest.com/pin/${cleanId}/`;
    let res = null;
    let lastFetchErr = null;
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        res = await pinterestFetch(url, {
          headers,
          redirect: 'follow',
          signal: AbortSignal.timeout(8000),
          dispatcher
        });
        lastFetchErr = null;
        break;
      } catch (err) {
        lastFetchErr = err;
        const isTimeout = err.name === 'TimeoutError' || err.name === 'AbortError' || err.code === 'ETIMEDOUT' || String(err.message || '').toLowerCase().includes('timeout');
        if (isTimeout && attempt < maxAttempts) {
          const delay = exponentialBackoffWithFullJitter(attempt, 1500, 3500);
          await sleep(delay);
          continue;
        }
        break;
      }
    }

    if (!res && lastFetchErr) {
      const fallbackPin = await fetchPinFromPinResource(cleanId, dispatcher);
      if (fallbackPin) return { ok: true, pin: fallbackPin, fastPath: true };
      return { ok: false, error: lastFetchErr.message };
    }

    if (res.status === 401 || res.status === 403 || res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504) {
      if (res.body) await res.body.cancel().catch(() => {});
      let retryDelay = exponentialBackoffWithFullJitter(1, 1500, 3500);
      if (res.status === 429) {
        const retrySec = parseRetryAfterSeconds(res.headers.get('retry-after'), 3);
        if (retrySec > 15) {
          const fallbackPin = await fetchPinFromPinResource(cleanId, dispatcher);
          if (fallbackPin) return { ok: true, pin: fallbackPin, fastPath: true };
          return { ok: false, status: 429, retryAfter: retrySec };
        }
        retryDelay = Math.min(Math.max(retryDelay, retrySec * 1000), 4000);
      }
      await sleep(retryDelay);
      res = await pinterestFetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(8000), dispatcher });
    }

    if (!res.ok) {
      if (res.body) await res.body.cancel().catch(() => {});
      const fallbackPin = await fetchPinFromPinResource(cleanId, dispatcher);
      if (fallbackPin) return { ok: true, pin: fallbackPin, fastPath: true };

      const resRetryAfter = res.status === 429 ? parseRetryAfterSeconds(res.headers.get('retry-after'), 15) : undefined;
      return { ok: false, status: res.status, retryAfter: resRetryAfter };
    }
    const html = await res.text();
    let parsed = extractPinData(html, pinId);

    const isSuspicious = !parsed || (!parsed.has_explicit_saves && (parsed.repins > 0 || parsed.saves === 0));
    if (isSuspicious) {
      const fallbackPin = await fetchPinFromPinResource(cleanId, dispatcher);
      if (fallbackPin && (fallbackPin.saves > 0 || fallbackPin.repins > 0)) {
        if (!parsed) {
          parsed = fallbackPin;
        } else {
          const authenticMethod = (fallbackPin?.method && fallbackPin.method !== 'pinterest_platform')
            ? fallbackPin.method
            : (parsed.method || fallbackPin?.method || 'pinterest_platform');

          const mergedSaves = (parsed.saves !== null && parsed.saves !== undefined)
            ? ((fallbackPin.saves !== null && fallbackPin.saves !== undefined) ? Math.max(Number(parsed.saves), Number(fallbackPin.saves)) : Number(parsed.saves))
            : ((fallbackPin.saves !== null && fallbackPin.saves !== undefined) ? Number(fallbackPin.saves) : null);

          const mergedRepins = (parsed.repins !== null && parsed.repins !== undefined)
            ? ((fallbackPin.repins !== null && fallbackPin.repins !== undefined) ? Math.max(Number(parsed.repins), Number(fallbackPin.repins)) : Number(parsed.repins))
            : ((fallbackPin.repins !== null && fallbackPin.repins !== undefined) ? Number(fallbackPin.repins) : null);

          parsed = {
            ...fallbackPin,
            ...parsed,
            method: authenticMethod,
            creation_method: authenticMethod,
            canonical_pin_id: parsed.canonical_pin_id || fallbackPin.canonical_pin_id || null,
            saves: mergedSaves,
            save_count: mergedSaves,
            repins: mergedRepins,
            repin_count: mergedRepins,
            comments: Math.max(Number(parsed.comments || 0), Number(fallbackPin.comments || 0)),
            has_explicit_saves: Boolean(parsed.has_explicit_saves || fallbackPin.has_explicit_saves || (fallbackPin.saves !== null && fallbackPin.saves > 0)),
            has_explicit_repins: Boolean(parsed.has_explicit_repins || fallbackPin.has_explicit_repins || (fallbackPin.repins !== null && fallbackPin.repins > 0))
          };
        }
      }
    }

    if (parsed) return { ok: true, pin: parsed };

    const fallbackPin = await fetchPinFromPinResource(cleanId, dispatcher);
    if (fallbackPin) return { ok: true, pin: fallbackPin, fastPath: true };

    return { ok: false, status: 200, error: 'parse_failed' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
