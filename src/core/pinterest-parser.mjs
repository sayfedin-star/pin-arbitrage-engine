/**
 * src/core/pinterest-parser.mjs
 *
 * Core Canonical Pinterest Parser & Telemetry Extraction Engine
 * Extracts the 48 algorithmic treasure fields from Pinterest payloads across:
 * 1. __PWS_DATA__ SSR JSON script tags and Relay stores
 * 2. PinResource/get/?data=... closeup fallback (~90ms)
 * 3. Pidgets endpoint batch fallback
 *
 * Invariants:
 * - Unhydrated pins MUST have save_count = null (NOT 0).
 * - Capped against 10M+ anomalies (10,000,001 ceiling protection).
 * - Preserves 100% affiliate/arbitrage UTM tracking parameters.
 * - Extracts guest creator audience and carousel detection.
 *
 * // [INVARIANT: 48-FIELD-TELEMETRY-CAROUSEL-DETECTION]
 * // [INVARIANT: 48-FIELD-AFFILIATE-PRESERVATION]
 * // [INVARIANT: STRICT-GUEST-SCRAPING]
 */

import {
  pinterestFetch,
  getPinterestXhrHeaders,
  PINTEREST_PAGE_HEADERS
} from './pinterest-client.mjs';

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
 */
export function normalizeDomain(rawDomain, rawUrl = '') {
  if (rawDomain && typeof rawDomain === 'string') {
    const clean = rawDomain.trim().toLowerCase().replace(/^www\./, '');
    if (clean && clean !== 'uploaded by user' && clean !== 'organic') {
      return clean;
    }
  }
  if (rawUrl && typeof rawUrl === 'string') {
    try {
      const u = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`);
      return u.hostname.toLowerCase().replace(/^www\./, '');
    } catch (_) {}
  }
  return 'uploaded by user';
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
  if (preserveCeiling && rounded === PINTEREST_CEILING_VALUE) return PINTEREST_CEILING_VALUE;
  return cap ? Math.min(cap, rounded) : rounded;
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

  const repins = parseCleanMetric(
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
    0
  );

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
    null
  );

  // [INVARIANT: UNHYDRATED-SAVES-NULL]
  // An unhydrated pin must have save_count = null (NOT 0).
  // Only assign a numeric value if explicit saves are confirmed in the payload.
  let saves = null;
  if (hasExplicitSavesField || (rawSavesMetric !== null && rawSavesMetric > 0)) {
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

  const velocity = (saves !== null && ageDays !== null && ageDays > 0)
    ? Math.round((saves / ageDays) * 100) / 100
    : 0;

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

  const method = isCarousel ? 'carousel' : safeString(
    pin.method ||
    pin.creation_method ||
    pin.creationMethod ||
    pin.originType ||
    pin.origin_type ||
    pin.pinJoin?.originType ||
    pin.attribution?.provider_name ||
    pin.provider_name ||
    'pinterest_platform'
  );

  // Link & Domain
  let rawLink = String(pin.link || pin.destination_url || pin.url || '').trim();
  if (rawLink && !/^https?:\/\//i.test(rawLink) && !rawLink.startsWith('/')) {
    rawLink = `https://${rawLink}`;
  }
  const cleanLink = sanitizeDestinationUrl(rawLink);
  const domain = normalizeDomain(pin.domain, cleanLink || rawLink);

  // [INVARIANT: 48-FIELD-AFFILIATE-PRESERVATION]
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

  // Creator Follower extraction
  const creatorFollowers = parseCleanMetric(
    pin.pinner?.follower_count ||
    pin.pinner?.followerCount ||
    pin.creator?.follower_count ||
    pin.closeupUnifiedAttribution?.followerCount ||
    pin.closeupUnifiedAttribution?.follower_count ||
    pin.closeup_attribution?.follower_count ||
    0
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
    board_id: pin.board?.id || pin.board_id || null,
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
      follower_count: parseCleanMetric(pin.originPinner?.followerCount || pin.origin_pinner?.follower_count || 0),
      image_url: pin.originPinner?.imageMediumUrl || pin.origin_pinner?.image_medium_url || pin.originPinner?.imageSmallUrl || null,
      is_verified_merchant: Boolean(pin.originPinner?.isVerifiedMerchant || pin.origin_pinner?.is_verified_merchant)
    } : null,
    domain_official_user: (pin.linkDomain?.officialUser || pin.link_domain?.official_user) ? {
      username: safeString(pin.linkDomain?.officialUser?.username || pin.link_domain?.official_user?.username || ''),
      full_name: safeString(pin.linkDomain?.officialUser?.fullName || pin.link_domain?.official_user?.full_name || ''),
      follower_count: parseCleanMetric(pin.linkDomain?.officialUser?.followerCount || pin.link_domain?.official_user?.follower_count || 0),
      is_verified_merchant: Boolean(pin.linkDomain?.officialUser?.isVerifiedMerchant || pin.link_domain?.official_user?.is_verified_merchant)
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
 * Extract pin data from raw HTML using the multi-stage fallback hierarchy:
 * 1. __PWS_DATA__ SSR JSON script tag
 * 2. Relay Completed Requests (__PWS_RELAY_REGISTER_COMPLETED_REQUEST__)
 * 3. Prefetched Queries (__PWS_RELAY_PREFETCHED_QUERIES__)
 * 4. Inline JSON Data Blocks (<script type="application/json">)
 * 5. JSON-LD schema (<script type="application/ld+json">)
 * 6. OpenGraph / Twitter meta tags
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
  const relayRegex = /__PWS_RELAY_REGISTER_COMPLETED_REQUEST__\s*\(([^,]+),\s*(\{[\s\S]*?\})\);/g;
  let rMatch;
  while ((rMatch = relayRegex.exec(html)) !== null) {
    try {
      const payload = JSON.parse(rMatch[2]);
      const v3 = payload?.data?.v3GetPinQueryv2?.data;
      if (v3 && (String(v3.entityId || v3.id || '') === String(pinId) || !pinId || String(v3.id || '').includes(String(pinId)))) {
        if (!mergedPin) mergedPin = {};
        Object.assign(mergedPin, v3);
        if (v3.entityId) mergedPin.id = v3.entityId;
        if (v3.aggregatedPinData?.aggregatedStats) {
          mergedPin.aggregated_pin_data = v3.aggregatedPinData;
        }
      } else {
        const found = findPinInTree(payload, pinId);
        if (found) {
          if (!mergedPin) mergedPin = { ...found };
          else Object.assign(mergedPin, found);
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

  // Stage 5: JSON-LD Schema
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

  return formatPin(mergedPin);
}

/**
 * Fallback to PinResource/get/?data=... endpoint
 *
 * @param {string} pinId
 * @param {object} [options]
 * @returns {Promise<object|null>}
 */
export async function fetchPinFromPinResource(pinId, options = {}) {
  const cleanId = String(pinId || '').trim();
  if (!cleanId) return null;

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

  try {
    const res = await pinterestFetch(url, {
      headers,
      timeoutMs: options.timeoutMs || 8000,
      dispatcher: options.dispatcher
    });
    if (!res.ok) return null;

    const body = await res.json();
    const pinData = body?.resource_response?.data;
    if (!pinData) return null;

    return formatPin(pinData);
  } catch (err) {
    return null;
  }
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
      dispatcher: options.dispatcher
    });
    if (!res.ok) return Array.isArray(pinIds) ? [] : null;

    const data = await res.json();
    const rawPins = Array.isArray(data?.data?.pins) ? data.data.pins : (Array.isArray(data?.data) ? data.data : []);
    const formatted = rawPins.map(p => formatPin(p)).filter(Boolean);

    if (Array.isArray(pinIds)) {
      return formatted;
    }
    return formatted[0] || null;
  } catch (err) {
    return Array.isArray(pinIds) ? [] : null;
  }
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
        // Merge with preference to newly discovered saves
        if (resourcePin.has_explicit_saves && resourcePin.save_count !== null) {
          pinResult.save_count = resourcePin.save_count;
          pinResult.saves = resourcePin.saves;
          pinResult.has_explicit_saves = true;
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
        if (pidgetsPin.repin_count) pinResult.repin_count = pidgetsPin.repin_count;
      }
    }
  } catch (_) {}

  return pinResult;
}
