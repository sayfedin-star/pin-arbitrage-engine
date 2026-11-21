/**
 * src/core/pinterest/pin-formatter.mjs
 *
 * Canonical 48-Field Pin Normalization & Redux/Relay Object Tree Traversal.
 *
 * // [INVARIANT: 48-FIELD-AFFILIATE-PRESERVATION] Preserve affiliate/arbitrage tracking links
 * // [INVARIANT: 48-FIELD-TELEMETRY-CAROUSEL-DETECTION]
 * // [INVARIANT: GUEST-AUDIENCE-EXTRACTION] Extract creator audience from closeupUnifiedAttribution in guest mode
 */

import {
  sanitizeDestinationUrl,
  normalizeDomain,
  safeString,
  parseCleanMetric
} from './pin-metrics.mjs';

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

  // Extract annotations: prioritize pin_join.annotations_with_links (Object Map or Array) before visual_annotation
  const linkedSources = [
    pin?.pin_join?.annotations_with_links,
    pin?.pinJoin?.annotations_with_links,
    pin?.pin_join?.annotationsWithLinks,
    pin?.pinJoin?.annotationsWithLinks,
    pin?.pin_join?.annotationsWithLinksArray,
    pin?.pinJoin?.annotationsWithLinksArray,
    pin?.pin_join?.annotations_with_links_array,
    pin?.pinJoin?.annotations_with_links_array,
    pin?.annotations_with_links,
    pin?.annotationsWithLinks,
    pin?.annotationsWithLinksArray
  ];
  const visual =
    pin?.pin_join?.visual_annotation ||
    pin?.visual_annotation ||
    pin?.pinJoin?.visualAnnotation ||
    pin?.visualAnnotation ||
    [];

  const annotationsMap = new Map();
  let hasLinkedAnnotations = false;

  const isCleanAnnotationName = (val) => {
    if (typeof val !== 'string') return false;
    const trimmed = val.trim();
    if (trimmed.length < 2) return false;
    if (/^\[object\s+object\]$/i.test(trimmed) || /^object\s+object$/i.test(trimmed)) return false;
    if (/^not[\s_-]?given$/i.test(trimmed)) return false;
    return true;
  };

  const upsertAnnotation = (rawName, rawUrl = null, rawIdeaId = null, fromLinked = false) => {
    if (!isCleanAnnotationName(rawName)) return;
    const cleanName = rawName.trim();
    const lower = cleanName.toLowerCase();
    const cleanUrl = (typeof rawUrl === 'string' && rawUrl.trim()) ? rawUrl.trim() : null;
    const extractedIdeaId =
      (rawIdeaId !== null && rawIdeaId !== undefined && String(rawIdeaId).trim())
        ? String(rawIdeaId).trim()
        : (cleanUrl ? (cleanUrl.match(/\/ideas\/[^/]+\/(\d+)/)?.[1] || null) : null);

    if (fromLinked) hasLinkedAnnotations = true;

    const existing = annotationsMap.get(lower);
    if (!existing) {
      annotationsMap.set(lower, { name: cleanName, idea_id: extractedIdeaId, url: cleanUrl });
    } else {
      if (!existing.idea_id && extractedIdeaId) existing.idea_id = extractedIdeaId;
      if (!existing.url && cleanUrl) existing.url = cleanUrl;
    }
  };

  const ingestLinkedSource = (source) => {
    if (!source) return;
    if (Array.isArray(source)) {
      for (const item of source) {
        if (!item) continue;
        if (typeof item === 'string') {
          upsertAnnotation(item, null, null, true);
        } else if (typeof item === 'object') {
          const candidateName = item.name ?? item.key ?? item.label ?? item.title ?? '';
          const candidateUrl = item.url ?? item.link ?? null;
          const candidateIdeaId = item.idea_id ?? item.ideaId ?? item.id ?? null;
          upsertAnnotation(typeof candidateName === 'string' ? candidateName : '', candidateUrl, candidateIdeaId, true);
        }
      }
      return;
    }
    if (typeof source === 'object') {
      for (const [entryKey, item] of Object.entries(source)) {
        if (!item) continue;
        if (typeof item === 'string') {
          const valStr = item.trim();
          const keyIsUrl = /^(\/|https?:\/\/)/i.test(entryKey);
          const valIsUrl = /^(\/|https?:\/\/)/i.test(valStr);
          if (valIsUrl && !keyIsUrl && !/^\d+$/.test(entryKey.trim())) {
            // Shape: { "Parmesan Italian Ditalini Soup": "/ideas/parmesan-italian-ditalini-soup/912345/" }
            upsertAnnotation(entryKey, valStr, null, true);
          } else if (!valIsUrl) {
            upsertAnnotation(valStr, keyIsUrl ? entryKey : null, null, true);
          }
        } else if (typeof item === 'object') {
          const fallbackName = (!/^\d+$/.test(entryKey.trim()) && !/^(\/|https?:\/\/)/i.test(entryKey.trim())) ? entryKey : '';
          const candidateName = item.name ?? item.key ?? item.label ?? item.title ?? fallbackName;
          const candidateUrl = item.url ?? item.link ?? null;
          const candidateIdeaId = item.idea_id ?? item.ideaId ?? item.id ?? (/^\d+$/.test(entryKey.trim()) ? entryKey.trim() : null);
          upsertAnnotation(typeof candidateName === 'string' ? candidateName : '', candidateUrl, candidateIdeaId, true);
        }
      }
    }
  };

  for (const src of linkedSources) {
    ingestLinkedSource(src);
  }

  for (const name of Array.isArray(visual) ? visual : []) {
    if (typeof name === 'string') {
      upsertAnnotation(name, null, null, false);
    }
  }

  if (annotationsMap.size === 0 && Array.isArray(pin?.annotations)) {
    for (const item of pin.annotations) {
      if (typeof item === 'string') {
        upsertAnnotation(item, null, null, false);
      } else if (item && typeof item === 'object' && typeof item.name === 'string') {
        upsertAnnotation(item.name, item.url || null, item.idea_id || item.ideaId || null, Boolean(item.url || item.idea_id));
      }
    }
  }

  const annotations = Array.from(annotationsMap.values());
  const annotationsWithLinks = annotations.filter(a => Boolean(a.url || a.idea_id));

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

  const hasNonEmptyObj = (val) => Boolean(val && typeof val === 'object' && !Array.isArray(val) && Object.keys(val).length > 0);
  const shoppingDataObj = hasNonEmptyObj(pin.shopping_data) ? pin.shopping_data : null;
  const hasShoppingSignal = Boolean(
    shoppingDataObj && (
      Number(shoppingDataObj.price_value) > 0 ||
      Boolean(shoppingDataObj.price) ||
      hasNonEmptyObj(shoppingDataObj.buyable_product) ||
      Boolean(shoppingDataObj.product_id || shoppingDataObj.item_id || shoppingDataObj.offer_id) ||
      shoppingDataObj.is_product === true
    )
  );
  const isProduct = Boolean(
    pin.is_product ||
    pin.isProduct ||
    pin.is_shoppable ||
    pin.is_retail_product ||
    pin.rich_metadata?.type === 'product' ||
    pin.rich_summary?.type === 'product' ||
    hasNonEmptyObj(pin.buyable_product) ||
    hasNonEmptyObj(pin.product_metadata) ||
    Number(pin.price_value) > 0 ||
    hasShoppingSignal
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
    annotations_with_links: annotationsWithLinks,
    has_linked_annotations: hasLinkedAnnotations,
    tags: annotations.map(a => a.name),
    is_repin: Boolean(pin.is_repin ?? pin.isRepin ?? false),
    origin_pinner: (pin.originPinner || pin.origin_pinner) ? {
      username: safeString(pin.originPinner?.username || pin.origin_pinner?.username || ''),
      full_name: safeString(pin.originPinner?.fullName || pin.origin_pinner?.full_name || ''),
      follower_count: parseCleanMetric(pin.originPinner?.followerCount || pin.origin_pinner?.follower_count || 0, 0, { preserveCeiling: true }),
      image_url: pin.originPinner?.imageMediumUrl || pin.originPinner?.image_medium_url || pin.originPinner?.imageSmallUrl || null,
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
