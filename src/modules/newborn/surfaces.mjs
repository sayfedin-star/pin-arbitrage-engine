/**
 * src/modules/newborn/surfaces.mjs
 *
 * 8-Surface Pinterest 2026 Harvester Clients & Strict Zero-Cookie Hydrators.
 *
 * Enforces Empirical 2026 Cookie Boundaries via `NewbornCookieRouter`:
 * - Zone 1 (`_auth=1` Auth Session with graceful guest fallback):
 *     1. `SearchTabResource/get` (Zero-Query Popular / Ideas for you -> guest fallback to Trends)
 *     2. `BaseSearchResource/get` (`scope: "pins"` -> avoids `e1_` encrypted IDs + extracts Guided Capsules)
 *     3. `BoardFeedResource/get` (Fresh board pins -> guest fallback to Pidgets `/boards/<user>/<slug>/pins/`)
 *     4. `BoardFeedResource/get` (`/<user>/<slug>/more_ideas/`, `add_vase: true` -> Board "Find more ideas")
 *     5. `BestPinsFeedAltResource/get` (Deep `/ideas/` pagination -> guest fallback to `__PWS_INITIAL_PROPS__`)
 *     6. `RelatedModulesResource/get` (Multi-hop Golden Pin Snowball)
 *
 * - Zone 2 (Strict Zero-Cookie — sending `_auth=1` strips `pin_join`!):
 *     7. `trends.pinterest.com/top_trends_filtered/` + `/metrics/?predicted_days=90` (`x-new-site: "true"`)
 *     8. `BaseSearchResource/get` (`scope: "boards"` -> 50 clean boards with `board_order_modified_at`)
 *     + `InterestResource/get` (`is_interest` gate before hitting `/ideas/`)
 *     + `widgets.pinterest.com/v3/pidgets/pins/info/` (`50x` pre-triage; `pinner.username` via `pinner.profile_url`)
 *     + `PinResource/get` (preserves `pin_join.visual_annotation` & `annotations_with_links`; separates `pinner` vs `origin_pinner`)
 *     + `UserResource/get` (`profile_reach` = Total audience, `profile_views` = Impressions)
 */

import { Semaphore, chunkArray } from '../../utils.mjs';
import {
  formatPin,
  parseCleanMetric,
  safeString,
  sanitizeDestinationUrl,
  normalizeDomain,
  findPinInTree
} from '../../core/pinterest/pins.mjs';
import { isValidPinId, RESERVED_KEYWORD_SLUGS } from '../../http/security-and-response.mjs';
import { normalizePinterestUsername, RESERVED_PINTEREST_PATHS } from '../creators/competitors-crud.mjs';
import { isCommercialOrAdPin } from '../keywords/service.mjs';
import {
  fetchPinterestInterestVolume,
  fetchPinterestBatchVelocity
} from '../keywords/trends-service.mjs';
import { extractPwsInitialProps, collectPinsFromSsrTree } from './cookie-router.mjs';

/**
 * Extracts a clean, validated Pinterest username from an explicit username field
 * or a Pidgets / board `profile_url` (e.g. `https://www.pinterest.com/rookiebaker/`).
 * Rejects reserved system paths (`newborn`, `pin`, `ideas`, `search`, etc.).
 */
export function extractUsernameFromProfileUrl(profileUrl = '', explicitUsername = '') {
  const direct = normalizePinterestUsername(explicitUsername);
  if (direct && !RESERVED_KEYWORD_SLUGS.has(direct) && !RESERVED_PINTEREST_PATHS.has(direct)) {
    return direct;
  }

  if (!profileUrl || typeof profileUrl !== 'string') return '';
  let pathname = profileUrl.trim();
  try {
    const parsed = new URL(pathname, 'https://www.pinterest.com');
    pathname = parsed.pathname || '';
  } catch (_) {}

  const segments = pathname.split('/').map((s) => s.trim()).filter(Boolean);
  if (segments.length === 0) return '';

  const candidate = normalizePinterestUsername(segments[0]);
  if (!candidate || RESERVED_KEYWORD_SLUGS.has(candidate) || RESERVED_PINTEREST_PATHS.has(candidate)) {
    return '';
  }
  return candidate;
}

/**
 * Normalizes any Pinterest board URL or relative `/user/slug/` path into a full external
 * `https://www.pinterest.com/...` URL so UI links never resolve against our own origin.
 */
export function formatPinterestBoardUrl(rawUrl = '', ownerUsername = '', boardSlug = '') {
  const clean = safeString(rawUrl || '').trim();
  if (clean) {
    if (/^https?:\/\//i.test(clean)) return clean;
    if (clean.startsWith('//')) return `https:${clean}`;
    const prefixed = clean.startsWith('/') ? clean : `/${clean}`;
    return `https://www.pinterest.com${prefixed.endsWith('/') ? prefixed : `${prefixed}/`}`;
  }
  const owner = extractUsernameFromProfileUrl('', ownerUsername);
  const slug = safeString(boardSlug || '').trim().replace(/^\/+|\/+$/g, '');
  if (owner && slug) {
    return `https://www.pinterest.com/${owner}/${slug}/`;
  }
  return null;
}

const BOARD_MATCH_STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'your', 'you', 'are', 'was',
  'were', 'have', 'has', 'had', 'not', 'but', 'all', 'can', 'out', 'about', 'into',
  'pin', 'pins', 'board', 'boards', 'pinterest', 'ideas', 'idea', 'inspo', 'inspiration',
  'best', 'cute', 'easy', 'simple', 'diy', 'aesthetic', 'my', 'of', 'in', 'on', 'to', 'at'
]);

const BOARD_GENERIC_HEAD_WORDS = new Set([
  'party', 'parties', 'food', 'foods', 'recipe', 'recipes', 'outfit', 'outfits',
  'decor', 'decoration', 'decorations', 'style', 'design', 'designs', 'home', 'room',
  'nail', 'nails', 'hair', 'hairstyle', 'hairstyles', 'makeup', 'fashion', 'art',
  'craft', 'crafts', 'gift', 'gifts', 'photo', 'photos', 'pose', 'poses', 'wallpaper',
  'theme', 'themes', 'aesthetic', 'vibe', 'vibes', 'stuff', 'things', 'life'
]);

function stemTokenLight(token) {
  if (!token || token.length < 4) return token;
  if (token.endsWith('ies') && token.length >= 5) return `${token.slice(0, -3)}y`;
  if (token.endsWith('es') && token.length >= 5 && /(ch|sh|x|s|z)es$/.test(token)) return token.slice(0, -2);
  if (token.endsWith('s') && !token.endsWith('ss') && token.length >= 4) return token.slice(0, -1);
  return token;
}

function tokenizeForSemanticOverlap(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[-_/]+/g, ' ')
    .replace(/[^a-z0-9\s]+/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

/**
 * Verifies semantic token overlap between a candidate board's name/slug and the target seed query
 * so unrelated trending boards (e.g. "Sims 4" or "Winter Outfits" on a "graduation party foods" hunt)
 * are never expanded via `board_feed` or `board_more_ideas`.
 */
export function boardMatchesSeedQuery(boardName = '', boardSlug = '', seedQuery = '') {
  const rawQueryTokens = tokenizeForSemanticOverlap(seedQuery);
  if (rawQueryTokens.length === 0) return true;

  const boardTokens = tokenizeForSemanticOverlap(`${boardName || ''} ${boardSlug || ''}`);
  if (boardTokens.length === 0) return false;

  const boardStems = new Set(boardTokens.map(stemTokenLight));
  const meaningfulQueryTokens = Array.from(new Set(
    rawQueryTokens.filter((t) => !BOARD_MATCH_STOP_WORDS.has(t))
  ));
  const targetTokens = meaningfulQueryTokens.length > 0
    ? meaningfulQueryTokens
    : Array.from(new Set(rawQueryTokens));

  const matchedTokens = [];
  for (const qt of targetTokens) {
    const qStem = stemTokenLight(qt);
    const matched = boardTokens.some((bt) => {
      const bStem = stemTokenLight(bt);
      if (bt === qt || bStem === qStem) return true;
      if (qt.length >= 4 && bt.length >= 4 && (bt.startsWith(qt) || qt.startsWith(bt))) return true;
      return false;
    }) || boardStems.has(qStem);
    if (matched) matchedTokens.push(qt);
  }

  if (matchedTokens.length === 0) return false;
  if (targetTokens.length <= 2) return true;

  // For 3+ meaningful seed words (e.g. "graduation party foods"), require either >= 2 matching words
  // OR a match on a specific (non-generic) anchor word like "graduation".
  if (matchedTokens.length >= 2) return true;
  return matchedTokens.some((tok) => !BOARD_GENERIC_HEAD_WORDS.has(tok) && !BOARD_GENERIC_HEAD_WORDS.has(stemTokenLight(tok)));
}

/**
 * Extracts `{ owner_username, board_slug, clean_path }` from a Pinterest board URL.
 */
export function parseBoardPath(boardUrl = '', fallbackOwner = '') {
  let pathname = String(boardUrl || '').trim();
  if (pathname.startsWith('http')) {
    try {
      pathname = new URL(pathname).pathname || '';
    } catch (_) {}
  }
  const parts = pathname.split('/').map((s) => s.trim()).filter(Boolean);
  const owner = extractUsernameFromProfileUrl('', parts[0] || fallbackOwner || '');
  const rawSlug = parts.length >= 2 ? parts[1] : '';
  const slug = rawSlug && rawSlug !== 'more_ideas' && !rawSlug.startsWith('_') ? rawSlug : '';
  const cleanPath = owner && slug ? `/${owner}/${slug}/` : (pathname.startsWith('/') ? pathname : `/${pathname}`);
  return {
    owner_username: owner,
    board_slug: slug,
    clean_path: cleanPath.endsWith('/') ? cleanPath : `${cleanPath}/`
  };
}

/**
 * Smart parser for any operator Multi-Surface Hunt Bar input:
 * - Numeric Pin ID or `pinterest.com/pin/<id>/` -> `{ kind: 'pin', pinId }`
 * - `/ideas/<slug>/<id>/` or `ideas:<slug>` -> `{ kind: 'idea', query }`
 * - `pinterest.com/<user>/<board>/` or `<user>/<board>` -> `{ kind: 'board', board }`
 * - Keyword / Trend phrase -> `{ kind: 'query', query }`
 */
export function parseSmartHuntInput(rawInput = '') {
  const str = String(rawInput || '').trim();
  if (!str) return null;

  if (isValidPinId(str)) {
    return { kind: 'pin', pinId: str };
  }

  const pinUrlMatch = str.match(/(?:pinterest\.[a-z.]+\/pin\/|(?:^|\/)pin\/)(\d{10,30})/i);
  if (pinUrlMatch && isValidPinId(pinUrlMatch[1])) {
    return { kind: 'pin', pinId: pinUrlMatch[1] };
  }

  const ideasUrlMatch = str.match(/(?:pinterest\.[a-z.]+\/ideas\/|^\/?ideas\/)([^/?#]+)/i);
  if (ideasUrlMatch && ideasUrlMatch[1]) {
    const cleanIdeaTerm = decodeURIComponent(ideasUrlMatch[1])
      .replace(/[-_]+/g, ' ')
      .trim()
      .toLowerCase();
    if (cleanIdeaTerm) {
      return { kind: 'idea', query: cleanIdeaTerm };
    }
  }

  const looksLikeBoardPath = (
    /^https?:\/\/(?:[a-z0-9-]+\.)?pinterest\.[a-z.]+\/[^/?#]+\/[^/?#]+/i.test(str) ||
    (/^\/?[a-zA-Z0-9._-]{3,50}\/[a-zA-Z0-9._-]{2,100}\/?$/.test(str) && !str.includes(' '))
  );
  if (looksLikeBoardPath) {
    const parsed = parseBoardPath(str);
    if (
      parsed.owner_username &&
      parsed.board_slug &&
      !['pin', 'pins', 'ideas', 'search', 'today', 'trends'].includes(parsed.owner_username.toLowerCase())
    ) {
      return {
        kind: 'board',
        board: {
          board_id: '',
          name: parsed.board_slug.replace(/[-_]+/g, ' '),
          url: `https://www.pinterest.com${parsed.clean_path}`,
          clean_path: parsed.clean_path,
          owner_username: parsed.owner_username,
          board_slug: parsed.board_slug
        },
        query: parsed.board_slug.replace(/[-_]+/g, ' ').toLowerCase()
      };
    }
  }

  return { kind: 'query', query: str.toLowerCase() };
}

function extractBookmark(json) {
  const raw =
    json?.resource_response?.bookmark ||
    (Array.isArray(json?.resource_response?.bookmarks) ? json.resource_response.bookmarks[0] : null) ||
    json?.resource?.options?.bookmarks?.[0] ||
    null;
  if (!raw || raw === '-end-' || raw === 'null') return null;
  return String(raw).trim() || null;
}

function extractPinAnnotationsDetailed(rawPin) {
  if (!rawPin || typeof rawPin !== 'object') return [];
  const pj = rawPin.pin_join || rawPin.pinJoin || {};
  const withLinks =
    pj.annotations_with_links ||
    pj.annotationsWithLinksArray ||
    pj.annotations_with_links_array ||
    rawPin.annotations_with_links ||
    rawPin.annotationsWithLinksArray ||
    [];
  const visual =
    pj.visual_annotation ||
    pj.visualAnnotation ||
    rawPin.visual_annotation ||
    rawPin.visualAnnotation ||
    [];

  const map = new Map();

  const ingestLinkedItem = (item) => {
    if (!item) return;
    if (typeof item === 'string') {
      const clean = item.trim();
      if (clean.length >= 2 && !/^not[\s_-]?given$/i.test(clean)) {
        const key = clean.toLowerCase();
        if (!map.has(key)) map.set(key, { name: clean, url: null, idea_id: null });
      }
      return;
    }
    if (typeof item === 'object') {
      const rawName = safeString(item.name || item.key || item.label || item.title || '');
      if (!rawName || rawName.length < 2 || /^not[\s_-]?given$/i.test(rawName)) return;
      const key = rawName.toLowerCase();
      const rawUrl = safeString(item.url || item.link || '');
      const ideaId = safeString(
        item.idea_id ||
        item.ideaId ||
        item.id ||
        (rawUrl.match(/\/ideas\/[^/]+\/(\d+)/)?.[1] || '')
      ) || null;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { name: rawName, url: rawUrl || null, idea_id: ideaId });
      } else {
        if (!existing.url && rawUrl) existing.url = rawUrl;
        if (!existing.idea_id && ideaId) existing.idea_id = ideaId;
      }
    }
  };

  if (Array.isArray(withLinks)) {
    for (const item of withLinks) ingestLinkedItem(item);
  } else if (withLinks && typeof withLinks === 'object') {
    for (const item of Object.values(withLinks)) ingestLinkedItem(item);
  }

  if (Array.isArray(visual)) {
    for (const item of visual) ingestLinkedItem(item);
  }

  if (Array.isArray(pj.seo_related_interests || pj.seoRelatedInterests)) {
    for (const item of (pj.seo_related_interests || pj.seoRelatedInterests)) {
      ingestLinkedItem(item);
    }
  }

  if (map.size === 0 && Array.isArray(rawPin.annotations)) {
    for (const item of rawPin.annotations) ingestLinkedItem(item);
  }

  return Array.from(map.values()).slice(0, 25);
}

/**
 * Normalizes a raw Pinterest pin object from any surface into a Newborn candidate record,
 * strictly separating `pinner` vs `origin_creator`, preserving `save_count = null` when
 * unhydrated, and rejecting non-Snowflake (`e1_`) or ad stubs.
 */
export function normalizeSurfaceCandidatePin(rawPin, context = {}) {
  if (!rawPin || typeof rawPin !== 'object') return null;
  if (isCommercialOrAdPin(rawPin)) return null;
  if (
    rawPin.type === 'board' ||
    rawPin.type === 'user' ||
    rawPin.type === 'interest' ||
    rawPin.type === 'interstitial' ||
    rawPin.type === 'story' ||
    rawPin.type === 'module' ||
    rawPin.type === 'guide' ||
    rawPin.type === 'collection'
  ) {
    return null;
  }

  const rawId = String(rawPin.id ?? rawPin.pin_id ?? rawPin.entityId ?? '').trim();
  if (!isValidPinId(rawId)) {
    return null;
  }

  const formatted = formatPin({
    ...rawPin,
    id: rawId
  });

  const pinnerRaw = rawPin.pinner || rawPin.closeupUnifiedAttribution || {};
  const pinnerUsername = extractUsernameFromProfileUrl(
    pinnerRaw.profile_url || pinnerRaw.url || '',
    pinnerRaw.username || formatted?.pinner?.username || ''
  );
  const pinnerFullName = safeString(pinnerRaw.full_name || pinnerRaw.fullName || formatted?.pinner?.full_name || '');
  const pinnerFollowersRaw = pinnerRaw.follower_count ?? pinnerRaw.followerCount ?? null;
  const pinnerFollowers = pinnerFollowersRaw !== null && pinnerFollowersRaw !== undefined
    ? parseCleanMetric(pinnerFollowersRaw, null, { preserveCeiling: true, cap: 0 })
    : null;

  const originRaw =
    rawPin.origin_pinner ||
    rawPin.originPinner ||
    rawPin.native_creator ||
    rawPin.nativeCreator ||
    (rawPin.creator && rawPin.creator.username && rawPin.creator.username !== pinnerUsername ? rawPin.creator : null) ||
    null;

  const originUsername = originRaw
    ? extractUsernameFromProfileUrl(originRaw.profile_url || originRaw.url || '', originRaw.username || '')
    : '';
  const originFullName = originRaw ? safeString(originRaw.full_name || originRaw.fullName || '') : '';
  const originFollowersRaw = originRaw ? (originRaw.follower_count ?? originRaw.followerCount ?? null) : null;
  const originFollowers = originFollowersRaw !== null && originFollowersRaw !== undefined
    ? parseCleanMetric(originFollowersRaw, null, { preserveCeiling: true, cap: 0 })
    : null;

  const effectiveUsername = originUsername || pinnerUsername || '';
  const effectiveFollowers = originUsername
    ? (originFollowers ?? pinnerFollowers)
    : (pinnerFollowers ?? originFollowers);

  const explicitOriginRaw = String(
    rawPin.origin_pin?.id ??
    rawPin.originPin?.id ??
    ''
  ).trim();
  const originPinId = isValidPinId(explicitOriginRaw) ? explicitOriginRaw : null;

  const isRepin = Boolean(
    rawPin.is_repin ??
    rawPin.isRepin ??
    (originPinId && originPinId !== rawId) ??
    (originUsername && pinnerUsername && originUsername !== pinnerUsername)
  );

  const rawLink = safeString(rawPin.link || rawPin.destination_url || rawPin.rich_metadata?.url || formatted?.link || '');
  const destinationUrl = sanitizeDestinationUrl(rawLink);
  const cleanDomainRaw = normalizeDomain(rawPin.domain || '', destinationUrl);
  const isLinkless = Boolean(
    !destinationUrl ||
    rawPin.is_go_linkless ||
    rawPin.isGoLinkless ||
    !cleanDomainRaw ||
    ['uploaded by user', 'uploaded by pinner', 'pinterest.com', 'www.pinterest.com', 'pin.it'].includes(cleanDomainRaw.toLowerCase())
  );
  const cleanDomain = isLinkless ? null : cleanDomainRaw;

  const detailedAnnotations = extractPinAnnotationsDetailed(rawPin);
  const boardObj = rawPin.board || {};
  const boardId = safeString(boardObj.id || boardObj.entityId || context.board_id || formatted?.board_id || '') || null;
  const boardName = safeString(boardObj.name || context.board_name || formatted?.board_name || '') || null;
  const boardUrlRaw = safeString(boardObj.url || context.board_url || formatted?.board_url || '');
  const boardUrl = formatPinterestBoardUrl(boardUrlRaw);

  const rawBoardPins = boardObj.pin_count ?? boardObj.pinCount ?? context.board_pin_count ?? null;
  const boardPinCount = rawBoardPins !== null && rawBoardPins !== undefined
    ? parseCleanMetric(rawBoardPins, null, { preserveCeiling: true, cap: 0 })
    : null;

  const rawBoardFollowers = boardObj.follower_count ?? boardObj.followerCount ?? context.board_follower_count ?? null;
  const boardFollowerCount = rawBoardFollowers !== null && rawBoardFollowers !== undefined
    ? parseCleanMetric(rawBoardFollowers, null, { preserveCeiling: true, cap: 0 })
    : null;

  let boardOrderModifiedAt = null;
  const rawBoardMod = boardObj.board_order_modified_at || boardObj.boardOrderModifiedAt || context.board_order_modified_at || null;
  if (rawBoardMod) {
    const bd = new Date(rawBoardMod);
    if (!Number.isNaN(bd.getTime())) boardOrderModifiedAt = bd.toISOString();
  }

  // Strict unhydrated save_count = null preservation
  const saveCount = formatted?.has_explicit_saves ? formatted.save_count : null;
  const repinCount = formatted?.has_explicit_repins ? formatted.repin_count : (
    rawPin.repin_count !== undefined && rawPin.repin_count !== null
      ? parseCleanMetric(rawPin.repin_count, null, { preserveCeiling: true })
      : null
  );

  // Preserve missing secondary engagement signals as `null` rather than fake 0/0/0
  const rawCommentCount =
    rawPin.comment_count ??
    rawPin.total_comment_count ??
    rawPin.comments_count ??
    rawPin.aggregated_pin_data?.comment_count ??
    null;
  const commentCount = (rawCommentCount !== null && rawCommentCount !== undefined && rawCommentCount !== '')
    ? parseCleanMetric(rawCommentCount, null, { preserveCeiling: true })
    : null;

  const rawShareCount =
    rawPin.share_count ??
    rawPin.shares ??
    rawPin.total_share_count ??
    rawPin.aggregated_pin_data?.share_count ??
    null;
  const shareCount = (rawShareCount !== null && rawShareCount !== undefined && rawShareCount !== '')
    ? parseCleanMetric(rawShareCount, null, { preserveCeiling: true })
    : null;

  const rawReactionCount =
    rawPin.total_reaction_count ??
    rawPin.reaction_counts?.total ??
    rawPin.reaction_count ??
    rawPin.aggregated_pin_data?.reaction_count ??
    null;
  const reactionCount = (rawReactionCount !== null && rawReactionCount !== undefined && rawReactionCount !== '')
    ? parseCleanMetric(rawReactionCount, null, { preserveCeiling: true })
    : null;

  const explicitCanonicalRaw = String(
    rawPin.pin_join?.canonical_pin?.id ??
    rawPin.pin_join?.canonical_pin?.entity_id ??
    rawPin.pinJoin?.canonicalPin?.entityId ??
    rawPin.origin_pin?.id ??
    rawPin.originPin?.id ??
    rawPin.canonical_pin_id ??
    rawPin.canonical_pin?.id ??
    rawPin.aggregated_pin_data?.canonical_pin_id ??
    ''
  ).trim();
  const canonicalPinId = isValidPinId(explicitCanonicalRaw) ? explicitCanonicalRaw : null;

  const aggPinDataIdRaw = String(rawPin.aggregated_pin_data?.id ?? '').trim();
  const aggregatedPinDataId = isValidPinId(aggPinDataIdRaw) ? aggPinDataIdRaw : null;

  const rawCreationMethod = safeString(
    rawPin.insertion_source ||
    rawPin.creation_source ||
    rawPin.upload_source ||
    rawPin.pin_source ||
    rawPin.method ||
    rawPin.creation_method ||
    rawPin.creationMethod ||
    rawPin.origin_type ||
    rawPin.originType ||
    rawPin.via_app?.client_type ||
    rawPin.via_app?.name ||
    rawPin.attribution?.provider_name ||
    formatted?.creation_method ||
    ''
  );

  const hasAiDisclosure = Boolean(
    rawPin.is_ai_generated ||
    rawPin.isAiGenerated ||
    rawPin.ai_generated ||
    rawPin.has_ai_disclosure ||
    rawPin.modified_by_ai ||
    rawPin.gen_ai_disclosure ||
    /ai[\s_-]*generated|modified[\s_-]*by[\s_-]*ai/i.test(
      safeString(rawPin.ai_disclosure_label || rawPin.disclosure_label || rawPin.auto_alt_text_ai_tag || '')
    )
  );

  const surfaceId = context.surface || 'pin_serp_capsules';

  return {
    pin_id: rawId,
    origin_pin_id: originPinId,
    canonical_pin_id: canonicalPinId,
    aggregated_pin_data_id: aggregatedPinDataId,
    root_pin_id: originPinId || (isRepin ? (canonicalPinId || rawId) : rawId),
    root_age_verified: context.root_age_verified ?? null,
    first_surface: surfaceId,
    discovered_surfaces: [surfaceId],
    seed_query: context.seed_query || null,
    matched_queries: context.seed_query ? [String(context.seed_query).trim().toLowerCase()] : [],
    snowball_parent_pin_id: context.snowball_parent_pin_id || null,
    snowball_hop: Number.isFinite(Number(context.snowball_hop)) ? Number(context.snowball_hop) : 0,
    title: formatted?.title || safeString(rawPin.title || rawPin.grid_title || ''),
    description: formatted?.description || safeString(rawPin.description || ''),
    alt_text: formatted?.alt_text || safeString(rawPin.alt_text || rawPin.auto_alt_text || ''),
    image_url: formatted?.image_url || '',
    image_signature: formatted?.image_signature || safeString(rawPin.image_signature || rawPin.imageSignature || '') || null,
    dominant_color: formatted?.dominant_color || rawPin.dominant_color || '#888888',
    destination_url: destinationUrl || null,
    clean_domain: cleanDomain,
    is_linkless: isLinkless,
    pinner_username: pinnerUsername || null,
    pinner_full_name: pinnerFullName || null,
    pinner_followers: pinnerFollowers,
    origin_creator_username: originUsername || null,
    origin_creator_full_name: originFullName || null,
    origin_creator_followers: originFollowers,
    effective_creator_username: effectiveUsername || null,
    effective_creator_followers: effectiveFollowers,
    is_repin: isRepin,
    board_id: boardId,
    board_name: boardName,
    board_url: boardUrl,
    board_pin_count: boardPinCount,
    board_follower_count: boardFollowerCount,
    board_order_modified_at: boardOrderModifiedAt,
    raw_creation_method: rawCreationMethod || null,
    has_ai_disclosure: hasAiDisclosure,
    is_video: Boolean(formatted?.is_video || rawPin.is_video || rawPin.videos),
    is_carousel: Boolean(formatted?.is_carousel),
    is_product: Boolean(formatted?.is_product),
    is_idea_pin: Boolean(rawPin.story_pin_data || rawPin.storyPinData || rawPin.is_story_pin || rawPin.is_idea_pin),
    created_at_pinterest: formatted?.created_at_pinterest || null,
    age_days: formatted?.age_days ?? null,
    save_count: saveCount,
    has_explicit_saves: saveCount !== null,
    repin_count: repinCount,
    has_explicit_repins: repinCount !== null,
    comment_count: commentCount,
    share_count: shareCount,
    reaction_count: reactionCount,
    is_hydrated: Boolean(context.is_hydrated),
    visual_annotations: detailedAnnotations,
    guided_capsules: Array.isArray(context.guided_capsules) ? context.guided_capsules : []
  };
}

/**
 * Merges two normalized candidate objects for the same `pin_id` without losing
 * zero-cookie `pin_join` annotations, explicit saves, or origin creator attribution.
 */
export function mergeCandidatePinRecords(base, incoming) {
  if (!base) return incoming;
  if (!incoming) return base;

  const surfaces = Array.from(new Set([
    ...(Array.isArray(base.discovered_surfaces) ? base.discovered_surfaces : []),
    ...(Array.isArray(incoming.discovered_surfaces) ? incoming.discovered_surfaces : [])
  ]));

  const annMap = new Map();
  for (const a of [...(base.visual_annotations || []), ...(incoming.visual_annotations || [])]) {
    if (!a) continue;
    const obj = typeof a === 'string' ? { name: a, url: null, idea_id: null } : a;
    if (!obj.name) continue;
    const k = obj.name.toLowerCase();
    const prev = annMap.get(k);
    if (!prev) annMap.set(k, { ...obj });
    else {
      if (!prev.url && obj.url) prev.url = obj.url;
      if (!prev.idea_id && obj.idea_id) prev.idea_id = obj.idea_id;
    }
  }

  const capMap = new Map();
  for (const c of [...(base.guided_capsules || []), ...(incoming.guided_capsules || [])]) {
    if (!c) continue;
    const term = String(typeof c === 'string' ? c : (c.term || c.display || '')).trim();
    if (!term) continue;
    const k = term.toLowerCase();
    if (!capMap.has(k)) {
      capMap.set(k, typeof c === 'string' ? { term, display: term } : c);
    }
  }

  const pickMaxNullable = (a, b) => {
    if (a !== null && a !== undefined && b !== null && b !== undefined) return Math.max(Number(a), Number(b));
    return (b !== null && b !== undefined) ? Number(b) : ((a !== null && a !== undefined) ? Number(a) : null);
  };

  const pinnerUsername = incoming.pinner_username || base.pinner_username || null;
  const originUsername = incoming.origin_creator_username || base.origin_creator_username || null;
  const pinnerFollowers = pickMaxNullable(base.pinner_followers, incoming.pinner_followers);
  const originFollowers = pickMaxNullable(base.origin_creator_followers, incoming.origin_creator_followers);

  const effectiveUsername = originUsername || pinnerUsername || incoming.effective_creator_username || base.effective_creator_username || null;
  const effectiveFollowers = originUsername
    ? (originFollowers ?? pinnerFollowers)
    : (pinnerFollowers ?? originFollowers ?? incoming.effective_creator_followers ?? base.effective_creator_followers ?? null);

  const saveCount = pickMaxNullable(base.save_count, incoming.save_count);
  const repinCount = pickMaxNullable(base.repin_count, incoming.repin_count);

  const destinationUrl = incoming.destination_url || base.destination_url || null;
  const cleanDomain = incoming.clean_domain || base.clean_domain || null;
  const isLinkless = !destinationUrl && !cleanDomain
    ? Boolean(incoming.is_linkless ?? base.is_linkless)
    : false;

  const rawCreationMethod = (
    incoming.raw_creation_method &&
    !['pinterest_platform', 'unhydrated_stub', 'organic_pin'].includes(String(incoming.raw_creation_method).toLowerCase())
  )
    ? incoming.raw_creation_method
    : (base.raw_creation_method || incoming.raw_creation_method || null);

  const incomingVerified = incoming.root_age_verified;
  const baseVerified = base.root_age_verified;
  const resolvedRootVerified = incomingVerified !== undefined && incomingVerified !== null
    ? incomingVerified
    : (baseVerified ?? null);

  let resolvedCreatedAt = incoming.created_at_pinterest || base.created_at_pinterest || null;
  let resolvedAgeDays = incoming.age_days ?? base.age_days ?? null;
  if (resolvedRootVerified === false) {
    // Repin clone whose true root creation date could not be verified — NEVER keep fake repin timestamp!
    resolvedCreatedAt = null;
    resolvedAgeDays = null;
  } else if (incomingVerified === true && incoming.created_at_pinterest) {
    resolvedCreatedAt = incoming.created_at_pinterest;
    resolvedAgeDays = incoming.age_days ?? base.age_days ?? null;
  }

  return {
    ...base,
    ...incoming,
    origin_pin_id: incoming.origin_pin_id || base.origin_pin_id || null,
    canonical_pin_id: incoming.canonical_pin_id || base.canonical_pin_id || null,
    aggregated_pin_data_id: incoming.aggregated_pin_data_id || base.aggregated_pin_data_id || null,
    root_pin_id: incoming.root_pin_id || base.root_pin_id || incoming.pin_id || base.pin_id,
    root_age_verified: resolvedRootVerified,
    first_surface: base.first_surface || incoming.first_surface,
    discovered_surfaces: surfaces,
    seed_query: base.seed_query || incoming.seed_query || null,
    matched_queries: Array.from(new Set([
      ...(Array.isArray(base.matched_queries) ? base.matched_queries : []),
      ...(base.seed_query ? [base.seed_query] : []),
      ...(Array.isArray(incoming.matched_queries) ? incoming.matched_queries : []),
      ...(incoming.seed_query ? [incoming.seed_query] : [])
    ].map((q) => String(q || '').trim().toLowerCase()).filter(Boolean))),
    snowball_parent_pin_id: base.snowball_parent_pin_id || incoming.snowball_parent_pin_id || null,
    snowball_hop: Math.min(
      base.snowball_hop ?? 0,
      incoming.snowball_hop ?? (base.snowball_hop ?? 0)
    ),
    title: incoming.title || base.title || '',
    description: incoming.description || base.description || '',
    alt_text: incoming.alt_text || base.alt_text || '',
    image_url: incoming.image_url || base.image_url || '',
    image_signature: incoming.image_signature || base.image_signature || null,
    dominant_color: (incoming.dominant_color && incoming.dominant_color !== '#888888')
      ? incoming.dominant_color
      : (base.dominant_color || '#888888'),
    destination_url: destinationUrl,
    clean_domain: cleanDomain,
    is_linkless: isLinkless,
    pinner_username: pinnerUsername,
    pinner_full_name: incoming.pinner_full_name || base.pinner_full_name || null,
    pinner_followers: pinnerFollowers,
    origin_creator_username: originUsername,
    origin_creator_full_name: incoming.origin_creator_full_name || base.origin_creator_full_name || null,
    origin_creator_followers: originFollowers,
    effective_creator_username: effectiveUsername,
    effective_creator_followers: effectiveFollowers,
    creator_monthly_reach: pickMaxNullable(base.creator_monthly_reach, incoming.creator_monthly_reach),
    creator_profile_views: pickMaxNullable(base.creator_profile_views, incoming.creator_profile_views),
    creator_pin_count: pickMaxNullable(base.creator_pin_count, incoming.creator_pin_count),
    is_repin: Boolean(base.is_repin || incoming.is_repin || (originUsername && pinnerUsername && originUsername !== pinnerUsername)),
    board_id: incoming.board_id || base.board_id || null,
    board_name: incoming.board_name || base.board_name || null,
    board_url: formatPinterestBoardUrl(incoming.board_url || base.board_url || ''),
    board_pin_count: pickMaxNullable(base.board_pin_count, incoming.board_pin_count),
    board_follower_count: pickMaxNullable(base.board_follower_count, incoming.board_follower_count),
    board_order_modified_at: incoming.board_order_modified_at || base.board_order_modified_at || null,
    raw_creation_method: rawCreationMethod,
    has_ai_disclosure: Boolean(base.has_ai_disclosure || incoming.has_ai_disclosure),
    is_video: Boolean(base.is_video || incoming.is_video),
    is_carousel: Boolean(base.is_carousel || incoming.is_carousel),
    is_product: Boolean(base.is_product || incoming.is_product),
    is_idea_pin: Boolean(base.is_idea_pin || incoming.is_idea_pin),
    created_at_pinterest: resolvedCreatedAt,
    age_days: resolvedAgeDays,
    save_count: saveCount,
    has_explicit_saves: saveCount !== null,
    repin_count: repinCount,
    has_explicit_repins: repinCount !== null,
    comment_count: pickMaxNullable(base.comment_count, incoming.comment_count),
    share_count: pickMaxNullable(base.share_count, incoming.share_count),
    reaction_count: pickMaxNullable(base.reaction_count, incoming.reaction_count),
    is_hydrated: Boolean(base.is_hydrated || incoming.is_hydrated),
    visual_annotations: Array.from(annMap.values()),
    guided_capsules: Array.from(capMap.values())
  };
}

let cachedTrendsLatestDate = { value: null, expiresAt: 0 };

/**
 * Resolves Pinterest Trends' `/latest_available_date/` (handling Pinterest Trends' 2–4 day lag
 * so `top_trends_filtered/?endDate=<date>` never returns HTTP 400 / 0 rows).
 */
export async function resolveTrendsLatestAvailableDate(router, nowMs = Date.now()) {
  const isCustomMockFetch = Boolean(router && typeof router.fetchImpl === 'function' && router.fetchImpl !== globalThis.fetch);
  if (!isCustomMockFetch && cachedTrendsLatestDate.value && cachedTrendsLatestDate.expiresAt > nowMs) {
    return cachedTrendsLatestDate.value;
  }

  const fallbackDate = new Date(nowMs - 3 * 86_400_000).toISOString().slice(0, 10);
  try {
    const res = await router.requestJson('https://trends.pinterest.com/latest_available_date/', {
      endpointKey: 'trends_api',
      referer: 'https://trends.pinterest.com/',
      extraHeaders: { 'x-new-site': 'true' }
    });
    if (res.ok && res.data) {
      const raw = typeof res.data === 'string'
        ? res.data.trim()
        : safeString(res.data.date || res.data.latest_available_date || res.data.endDate || '');
      const cleanDate = raw.replace(/[^0-9-]/g, '').slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
        if (!isCustomMockFetch) {
          cachedTrendsLatestDate = { value: cleanDate, expiresAt: nowMs + 30 * 60_000 };
        }
        return cleanDate;
      }
    }
  } catch (_) {}

  return fallbackDate;
}

/**
 * Resolves Official Pinterest `Idea Page` Intelligence for any seed keyword:
 * - Official `InterestResource/get` URL (`https://www.pinterest.com/ideas/<slug>/<id>/`),
 *   `internal_search_count`, `seo_breadcrumbs`, `seo_related_objects`, and `ideas_pivots`.
 * - Weekly / monthly / yearly trend growth % via Pinterest Trends `prefix_match`.
 *
 * Uses existing `trends-service.mjs` LRU+singleflight helpers in production, or routes through
 * `router.requestJson` when a custom `fetchImpl` router is supplied (100% offline testable).
 */
export async function resolveIdeaPageIntelligence(term, { router = null, country = 'US' } = {}) {
  const cleanTerm = String(term || '').trim().toLowerCase();
  if (!cleanTerm || cleanTerm.length < 2) {
    return { found: false, term: cleanTerm, idea_url: null, internal_search_count: 0 };
  }

  const slug = cleanTerm.replace(/[^a-z0-9\s-]/gi, ' ').trim().replace(/[\s_]+/g, '-');
  if (!slug) {
    return { found: false, term: cleanTerm, idea_url: null, internal_search_count: 0 };
  }
  const cleanCountry = /^[A-Z]{2}$/.test(String(country || '').toUpperCase()) ? String(country).toUpperCase() : 'US';
  const useCustomRouter = Boolean(router && typeof router.requestJson === 'function' && router.fetchImpl !== globalThis.fetch);

  let interestInfo = null;
  let velocityInfo = null;

  if (useCustomRouter) {
    const dataParam = encodeURIComponent(JSON.stringify({
      options: { interest: slug, field_set_key: 'ideas_hub' },
      context: {}
    }));
    const interestUrl = `https://www.pinterest.com/resource/InterestResource/get/?source_url=${encodeURIComponent(`/ideas/${slug}/`)}&data=${dataParam}`;
    const prefixUrl = `https://trends.pinterest.com/prefix_match/?query=${encodeURIComponent(cleanTerm)}&country=${cleanCountry}`;

    const [intRes, prefRes] = await Promise.allSettled([
      router.requestJson(interestUrl, {
        endpointKey: 'interest_resource',
        sourceUrl: `/ideas/${slug}/`,
        handler: 'www/ideas/[interest_url_name]/[interest_id].js'
      }),
      router.requestJson(prefixUrl, {
        endpointKey: 'trends_api',
        referer: 'https://trends.pinterest.com/',
        extraHeaders: { 'x-new-site': 'true' }
      })
    ]);

    if (intRes.status === 'fulfilled' && intRes.value?.ok) {
      const data = intRes.value.data?.resource_response?.data || intRes.value.data?.data || null;
      if (data && data.is_interest !== false && data.id && String(data.id) !== '0') {
        const rawRelated = Array.isArray(data.seo_related_interests) ? data.seo_related_interests : [];
        const rawPivots = Array.isArray(data.ideas_klp_pivots) ? data.ideas_klp_pivots : [];
        interestInfo = {
          success: true,
          id: String(data.id),
          key: safeString(data.key || cleanTerm),
          url_name: safeString(data.url_name || slug),
          internal_search_count: Number(data.internal_search_count || 0),
          feed_update_time: data.feed_update_time || null,
          seo_breadcrumbs: Array.isArray(data.seo_breadcrumbs) ? data.seo_breadcrumbs.map((b) => safeString(b?.name || b)).filter(Boolean) : [],
          seo_related_objects: rawRelated.map((r) => ({
            name: safeString(r.name || r.key || ''),
            key: safeString(r.key || r.name || ''),
            id: String(r.id || r.origin_interest_id || ''),
            url: r.url || `/ideas/${String(r.key || r.name || '').replace(/\s+/g, '-')}/${r.id || ''}/`
          })).filter((r) => r.name),
          ideas_pivots: rawPivots.map((p) => {
            const pivotUrl = safeString(p.pivot_url || '');
            const pivotId = pivotUrl.split('/').filter(Boolean).pop() || '';
            return {
              label: safeString(p.pivot_display_text || ''),
              full_name: safeString(p.pivot_full_name || ''),
              url: pivotUrl,
              id: pivotId
            };
          }).filter((p) => p.full_name)
        };
      }
    }

    if (prefRes.status === 'fulfilled' && prefRes.value?.ok && Array.isArray(prefRes.value.data) && prefRes.value.data.length > 0) {
      const exact = prefRes.value.data.find((x) => String(x?.term || '').trim().toLowerCase() === cleanTerm) || prefRes.value.data[0];
      const counts = Array.isArray(exact?.counts) ? exact.counts : [];
      if (counts.length >= 2) {
        const calcPct = (curr, past) => {
          const c = Number(curr);
          const p = Number(past);
          if (!Number.isFinite(c) || !Number.isFinite(p)) return null;
          if (p > 0) return Math.max(-100, Math.min(999, Math.round(((c - p) / p) * 100)));
          return c > 0 ? 100 : 0;
        };
        velocityInfo = {
          weekly_change: calcPct(counts[counts.length - 1], counts[counts.length - 2]),
          monthly_change: counts.length >= 5 ? calcPct(counts[counts.length - 1], counts[counts.length - 5]) : null,
          yearly_change: calcPct(counts[counts.length - 1], counts[0])
        };
      }
    }
  } else {
    const [intRes, velMapRes] = await Promise.allSettled([
      fetchPinterestInterestVolume(cleanTerm),
      fetchPinterestBatchVelocity(cleanTerm, [cleanTerm], cleanCountry)
    ]);
    if (intRes.status === 'fulfilled' && intRes.value && intRes.value.id && intRes.value.id !== '0') {
      interestInfo = intRes.value;
    }
    if (velMapRes.status === 'fulfilled' && velMapRes.value instanceof Map) {
      velocityInfo = velMapRes.value.get(cleanTerm) || null;
    }
  }

  if (!interestInfo || !interestInfo.id || interestInfo.id === '0') {
    return {
      found: false,
      term: cleanTerm,
      id: null,
      key: cleanTerm,
      url_name: slug,
      idea_url: null,
      internal_search_count: 0,
      formatted_volume: '0',
      weekly_change: velocityInfo?.weekly_change ?? null,
      monthly_change: velocityInfo?.monthly_change ?? null,
      yearly_change: velocityInfo?.yearly_change ?? null,
      feed_update_time: null,
      seo_breadcrumbs: [],
      related_interests: [],
      ideas_pivots: []
    };
  }

  const urlName = interestInfo.url_name || slug;
  const searchCount = Number(interestInfo.internal_search_count || 0);

  return {
    found: true,
    term: cleanTerm,
    id: String(interestInfo.id),
    key: interestInfo.key || cleanTerm,
    url_name: urlName,
    idea_url: `https://www.pinterest.com/ideas/${urlName}/${interestInfo.id}/`,
    internal_search_count: searchCount,
    formatted_volume: searchCount > 0 ? searchCount.toLocaleString('en-US') : '0',
    weekly_change: velocityInfo?.weekly_change ?? null,
    monthly_change: velocityInfo?.monthly_change ?? null,
    yearly_change: velocityInfo?.yearly_change ?? null,
    feed_update_time: interestInfo.feed_update_time || null,
    seo_breadcrumbs: Array.isArray(interestInfo.seo_breadcrumbs) ? interestInfo.seo_breadcrumbs : [],
    related_interests: (interestInfo.seo_related_objects || []).slice(0, 12).map((r) => ({
      name: r.name || r.key,
      key: r.key || r.name,
      id: String(r.id || ''),
      url: r.url && r.url.startsWith('http')
        ? r.url
        : `https://www.pinterest.com${r.url && r.url.startsWith('/') ? r.url : `/ideas/${String(r.key || r.name || '').replace(/\s+/g, '-')}/${r.id || ''}/`}`
    })),
    ideas_pivots: (interestInfo.ideas_pivots || []).slice(0, 8).map((p) => ({
      label: p.label,
      full_name: p.full_name,
      id: p.id,
      url: p.url && p.url.startsWith('http')
        ? p.url
        : `https://www.pinterest.com${p.url && p.url.startsWith('/') ? p.url : `/ideas/${String(p.full_name || '').toLowerCase().replace(/\s+/g, '-')}/${p.id || ''}/`}`
    }))
  };
}

/**
 * SURFACE 1: Growing / Seasonal / Monthly / Yearly Trends + 90-Day Prediction Metrics
 * (`trends.pinterest.com`, strict zero-cookie + `x-new-site: "true"` + `/latest_available_date/`).
 */
const TRENDS_PRESET_CODES = Object.freeze({
  monthly: '1',
  yearly: '2',
  growing: '3',
  seasonal: '4'
});

const TRENDS_L1_INTEREST_IDS = Object.freeze({
  animals: '925056443165',
  architecture: '918105274631',
  art: '961238559656',
  beauty: '935541271955',
  design: '902065567321',
  'diy-and-crafts': '934876475639',
  diy_and_crafts: '934876475639',
  diyandcrafts: '934876475639',
  education: '922134410098',
  electronics: '960887632144',
  entertainment: '953061268473',
  'event-planning': '941870572865',
  event_planning: '941870572865',
  eventplanning: '941870572865',
  finance: '913207199297',
  'food-and-drink': '918530398158',
  'food-and-drinks': '918530398158',
  food_and_drink: '918530398158',
  food_and_drinks: '918530398158',
  foodanddrink: '918530398158',
  gardening: '909983286710',
  'lawn-and-garden': '909983286710',
  lawn_and_garden: '909983286710',
  lawnandgarden: '909983286710',
  health: '898620064290',
  'home-decor': '935249274030',
  home_decor: '935249274030',
  homedecor: '935249274030',
  'mens-fashion': '924581335376',
  mens_fashion: '924581335376',
  parenting: '920236059316',
  quotes: '948192800438',
  sport: '919812032692',
  sports: '919812032692',
  travel: '908182459161',
  vehicles: '918093243960',
  wedding: '903260720461',
  weddings: '903260720461',
  fashion: '948967005229',
  'womens-fashion': '948967005229',
  womens_fashion: '948967005229'
});

export function resolveTrendsL1InterestId(rawInterest) {
  const clean = String(rawInterest || '').trim().toLowerCase();
  if (!clean || clean === 'all') return null;
  if (/^\d{6,20}$/.test(clean)) return clean;
  return TRENDS_L1_INTEREST_IDS[clean] || null;
}

export async function harvestGrowingTrendsSurface(
  router,
  {
    country = 'US',
    trendType = 'growing',
    l1Interest = 'all',
    limit = 25,
    fetch90dForecast = true,
    includeTerms = [],
    excludeTerms = [],
    endDate = null,
    age = null,
    gender = null,
    moments = null
  } = {}
) {
  const cleanCountry = /^[A-Z]{2}$/.test(String(country || '').toUpperCase()) ? String(country).toUpperCase() : 'US';
  const cleanTrendType = ['growing', 'seasonal', 'monthly', 'yearly'].includes(String(trendType || '').toLowerCase())
    ? String(trendType).toLowerCase()
    : 'growing';
  const presetCode = TRENDS_PRESET_CODES[cleanTrendType] || '3';
  const seasonalParam = cleanTrendType === 'seasonal' ? '&isSeasonal=true' : '';
  const cleanInterest = String(l1Interest || 'all').trim().toLowerCase();
  const resolvedL1Id = resolveTrendsL1InterestId(cleanInterest);
  const interestParam = resolvedL1Id
    ? `&l1interests=${encodeURIComponent(resolvedL1Id)}`
    : '';
  const clampedLimit = Math.max(5, Math.min(100, Number(limit) || 25));

  const includeList = (Array.isArray(includeTerms) ? includeTerms : String(includeTerms || '').split(','))
    .map((t) => String(t || '').trim().toLowerCase())
    .filter(Boolean);
  const excludeList = (Array.isArray(excludeTerms) ? excludeTerms : String(excludeTerms || '').split(','))
    .map((t) => String(t || '').trim().toLowerCase())
    .filter(Boolean);

  const includeParam = includeList.length > 0 ? `&keywordsToInclude=${encodeURIComponent(includeList.join(','))}` : '';
  const excludeParam = excludeList.length > 0 ? `&keywordsToExclude=${encodeURIComponent(excludeList.join(','))}` : '';
  const ageParam = age ? `&ageBuckets=${encodeURIComponent(String(age).trim())}` : '';
  const genderParam = gender ? `&gender=${encodeURIComponent(String(gender).trim())}` : '';
  const momentsParam = moments ? `&moments=${encodeURIComponent(String(moments).trim())}` : '';

  // Resolve latest available date first to handle Pinterest Trends' 2–4 day data lag (prevents HTTP 400 / 0 trends!)
  const latestDate = endDate || await resolveTrendsLatestAvailableDate(router);

  const listUrl = `https://trends.pinterest.com/top_trends_filtered/?country=${cleanCountry}&trendsPreset=${presetCode}&rankingMethod=${presetCode}${seasonalParam}${interestParam}${includeParam}${excludeParam}${ageParam}${genderParam}${momentsParam}&endDate=${encodeURIComponent(latestDate)}&numTermsToReturn=${clampedLimit}`;
  const res = await router.requestJson(listUrl, {
    endpointKey: 'trends_api',
    referer: 'https://trends.pinterest.com/',
    extraHeaders: { 'x-new-site': 'true' }
  });

  if (!res.ok || !res.data) {
    return {
      ok: false,
      surface: 'growing_trends',
      trend_type: cleanTrendType,
      l1_interest: cleanInterest || 'all',
      latest_available_date: latestDate,
      trends: [],
      terms: [],
      pins: [],
      error: res.error || 'trends_unavailable'
    };
  }

  const isLiveValuesFormat = Boolean(!Array.isArray(res.data) && Array.isArray(res.data.values));
  const rawTrends = Array.isArray(res.data)
    ? res.data
    : (res.data.values || res.data.trends || res.data.results || res.data.data || []);

  const parseGrowthPct = (ratioObj, directVal) => {
    if (ratioObj && typeof ratioObj === 'object' && ratioObj.value !== undefined && ratioObj.value !== null) {
      const n = Number(ratioObj.value);
      return Number.isFinite(n) ? Math.round(n * 100) : 0;
    }
    const d = Number(directVal ?? 0);
    return Number.isFinite(d) ? Math.round(d) : 0;
  };

  const trends = [];
  const pins = [];
  for (const item of rawTrends) {
    if (!item) continue;
    const term = safeString(item.term || item.keyword || item.query || item.name || '').toLowerCase();
    if (!term) continue;

    // Defensive local post-filter in case upstream Trends ignores includeTerms/excludeTerms
    if (includeList.length > 0 && !includeList.some((inc) => term.includes(inc))) {
      continue;
    }
    if (excludeList.length > 0 && excludeList.some((exc) => term.includes(exc))) {
      continue;
    }

    const weeklyPct = parseGrowthPct(item.wow_change, item.weekly_change ?? item.perc_change_weekly ?? item.growth_weekly);
    const monthlyPct = parseGrowthPct(item.mom_change, item.monthly_change ?? item.perc_change_monthly ?? item.growth_monthly);
    const yearlyPct = parseGrowthPct(item.yoy_change, item.yearly_change ?? item.perc_change_yearly ?? item.growth_yearly);
    const seasonalityScore = item.seasonality_score !== undefined && item.seasonality_score !== null
      ? Number(item.seasonality_score)
      : null;
    const predictedPeakDate = safeString(item.predicted_peak_date || item.peak_date || item.peakDate || '') || null;
    const hasPrediction = Boolean(
      item.hasPrediction ??
      item.has_prediction ??
      item.isPredicted ??
      item.predicted_peak_date ??
      item.peak_date ??
      (Number.isFinite(seasonalityScore) && seasonalityScore >= 0.825)
    );

    trends.push({
      term,
      trend_type: cleanTrendType,
      l1_interest: safeString(item.interest || item.category || (cleanInterest !== 'all' ? cleanInterest : '')) || null,
      weekly_change: weeklyPct,
      weekly_growth_pct: weeklyPct,
      monthly_change: monthlyPct,
      monthly_growth_pct: monthlyPct,
      yearly_change: yearlyPct,
      yearly_growth_pct: yearlyPct,
      seasonality_score: item.seasonality_score !== undefined ? Number(item.seasonality_score) : null,
      search_count: item.searchCount !== undefined ? Number(item.searchCount) : (item.normalizedCount !== undefined ? Number(item.normalizedCount) : null),
      has_prediction: hasPrediction,
      predicted_90d_growth: null,
      predicted_peak_date: predictedPeakDate,
      is_predicted_peak_rising: false
    });

    const samplePins = item.sample_pins || item.pins || item.top_pins || [];
    if (Array.isArray(samplePins)) {
      for (const sp of samplePins) {
        const norm = normalizeSurfaceCandidatePin(sp, { surface: 'growing_trends', seed_query: term });
        if (norm) pins.push(norm);
      }
    }
  }

  // Sort live `values` results cleanly by requested trend window
  if (isLiveValuesFormat && trends.length > 1) {
    if (cleanTrendType === 'growing') {
      trends.sort((a, b) => (b.weekly_change - a.weekly_change) || (b.monthly_change - a.monthly_change));
    } else if (cleanTrendType === 'monthly') {
      trends.sort((a, b) => (b.monthly_change - a.monthly_change) || (b.weekly_change - a.weekly_change));
    } else if (cleanTrendType === 'yearly') {
      trends.sort((a, b) => (b.yearly_change - a.yearly_change) || (b.monthly_change - a.monthly_change));
    } else if (cleanTrendType === 'seasonal') {
      trends.sort((a, b) => ((b.seasonality_score ?? 0) - (a.seasonality_score ?? 0)) || (b.monthly_change - a.monthly_change));
    }
  }

  const trimmedTrends = trends.slice(0, clampedLimit);

  if (fetch90dForecast && trimmedTrends.length > 0) {
    const forecastSlice = trimmedTrends.slice(0, 8).map((t) => t.term);
    const metricsUrl = `https://trends.pinterest.com/metrics/?terms=${encodeURIComponent(forecastSlice.join(','))}&country=${cleanCountry}&predicted_days=90`;
    const metricsRes = await router.requestJson(metricsUrl, {
      endpointKey: 'trends_api',
      referer: 'https://trends.pinterest.com/',
      extraHeaders: { 'x-new-site': 'true' }
    });

    if (metricsRes.ok && metricsRes.data && typeof metricsRes.data === 'object') {
      const metricsPayload = metricsRes.data.metrics || metricsRes.data.data || metricsRes.data;
      for (const tr of trimmedTrends) {
        const seriesEntry = metricsPayload?.[tr.term];
        const predictedArr = Array.isArray(seriesEntry?.predicted)
          ? seriesEntry.predicted
          : (Array.isArray(seriesEntry?.predictions) ? seriesEntry.predictions : null);
        if (predictedArr && predictedArr.length >= 2) {
          const firstVal = Number(predictedArr[0]?.value ?? predictedArr[0]?.count ?? predictedArr[0] ?? 0);
          const lastVal = Number(predictedArr[predictedArr.length - 1]?.value ?? predictedArr[predictedArr.length - 1]?.count ?? predictedArr[predictedArr.length - 1] ?? 0);
          if (Number.isFinite(firstVal) && Number.isFinite(lastVal) && firstVal > 0) {
            tr.predicted_90d_growth = Math.round(((lastVal - firstVal) / firstVal) * 1000) / 10;
            tr.is_predicted_peak_rising = tr.predicted_90d_growth > 5;
          }
          let maxVal = -Infinity;
          let peakDate = null;
          for (const pt of predictedArr) {
            const v = Number(pt?.value ?? pt?.count ?? pt ?? NaN);
            if (Number.isFinite(v) && v > maxVal) {
              maxVal = v;
              peakDate = safeString(pt?.date || pt?.ds || pt?.week || '') || null;
            }
          }
          if (peakDate && !tr.predicted_peak_date) {
            tr.predicted_peak_date = peakDate;
          }
          if (Number.isFinite(firstVal) && firstVal > 0 && maxVal > firstVal * 1.1) {
            tr.is_predicted_peak_rising = true;
          }
        }
      }
    }
  }

  return {
    ok: true,
    surface: 'growing_trends',
    trend_type: cleanTrendType,
    l1_interest: cleanInterest || 'all',
    latest_available_date: latestDate,
    trends: trimmedTrends,
    terms: trimmedTrends.map((t) => t.term),
    pins
  };
}

/**
 * SURFACE 2: Zero-Query Popular / Ideas for You (`SearchTabResource/get` `_auth=1`, with zero-cookie Trends fallback).
 */
export async function harvestZeroQueryPopularSurface(router, { country = 'US' } = {}) {
  const dataParam = encodeURIComponent(JSON.stringify({
    options: { page_size: 25 },
    context: {}
  }));
  const url = `https://www.pinterest.com/resource/SearchTabResource/get/?source_url=%2F&data=${dataParam}`;
  const res = await router.requestJson(url, {
    endpointKey: 'search_tab_ideas',
    sourceUrl: '/',
    handler: 'www/index.js'
  });

  const termsSet = new Set();
  const popularSet = new Set();
  const ideasForYouSet = new Set();
  const pins = [];

  if (res.ok && res.data) {
    const payload = res.data?.resource_response?.data || res.data?.data || res.data;
    const collectFromModule = (node, depth = 0, bucketHint = '') => {
      if (depth > 8 || !node || typeof node !== 'object') return;
      if (Array.isArray(node)) {
        for (const item of node) collectFromModule(item, depth + 1, bucketHint);
        return;
      }
      const q = safeString(node.query || node.search_query || node.term || node.display_query || '');
      if (q && q.length >= 2 && q.length <= 100 && !/^https?:/i.test(q)) {
        const lower = q.toLowerCase();
        termsSet.add(lower);
        if (bucketHint === 'ideas') ideasForYouSet.add(lower);
        else popularSet.add(lower);
      }
      const maybePin = normalizeSurfaceCandidatePin(node, { surface: 'zero_query_popular', seed_query: q || null });
      if (maybePin) {
        pins.push(maybePin);
      }
      for (const k of ['modules', 'items', 'results', 'ideas', 'popular_searches', 'trending_searches', 'pins', 'data']) {
        if (node[k]) {
          const nextHint = k === 'ideas' ? 'ideas' : (k === 'popular_searches' || k === 'trending_searches' ? 'popular' : bucketHint);
          collectFromModule(node[k], depth + 1, nextHint);
        }
      }
    };
    collectFromModule(payload);
  }

  if (termsSet.size > 0 || pins.length > 0) {
    return {
      ok: true,
      surface: 'zero_query_popular',
      terms: Array.from(termsSet),
      popular_terms: Array.from(popularSet),
      ideas_for_you_terms: Array.from(ideasForYouSet),
      pins,
      used_guest_fallback: false
    };
  }

  // Graceful guest fallback when SearchTabResource requires auth or returns empty
  const cleanCountry = /^[A-Z]{2}$/.test(String(country || '').toUpperCase()) ? String(country).toUpperCase() : 'US';
  const latestDate = await resolveTrendsLatestAvailableDate(router);
  const fallbackUrl = `https://trends.pinterest.com/top_trends_filtered/?country=${cleanCountry}&trendsPreset=1&rankingMethod=1&endDate=${encodeURIComponent(latestDate)}&numTermsToReturn=15`;
  const fbRes = await router.requestJson(fallbackUrl, {
    endpointKey: 'trends_api',
    referer: 'https://trends.pinterest.com/',
    extraHeaders: { 'x-new-site': 'true' }
  });

  if (fbRes.ok && fbRes.data) {
    const list = Array.isArray(fbRes.data) ? fbRes.data : (fbRes.data.values || fbRes.data.trends || fbRes.data.results || []);
    for (const item of list.slice(0, 15)) {
      const t = safeString(item?.term || item?.keyword || item?.query || '').toLowerCase();
      if (t) {
        termsSet.add(t);
        popularSet.add(t);
      }
    }
  }

  return {
    ok: termsSet.size > 0,
    surface: 'zero_query_popular',
    terms: Array.from(termsSet),
    popular_terms: Array.from(popularSet),
    ideas_for_you_terms: Array.from(ideasForYouSet),
    pins,
    used_guest_fallback: true
  };
}

/**
 * SURFACE 3: Pin SERP + Guided Capsules (`BaseSearchResource/get`, `scope: "pins"`).
 * Uses `_auth=1` to unlock clean Snowflake IDs (avoiding `e1_` encrypted IDs) with guest retry + SSR fallback.
 */
export async function harvestPinSerpWithCapsulesSurface(
  router,
  query,
  { maxPages = 10, pageSize = 50, targetPins = null, onPageProgress = null } = {}
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
      handler: 'www/search/pins.js'
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
  if (pinsMap.size === 0) {
    const ssrUrl = `https://www.pinterest.com/search/pins/?q=${encodedQ}`;
    const ssrRes = await router.requestJson(ssrUrl, {
      endpointKey: 'ssr_page_zero_cookie',
      isDocumentHtml: true,
      referer: 'https://www.pinterest.com/'
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
  { maxPages = 2, maxBoards = null, maxBoardAgeDays = 90, nowMs = Date.now() } = {}
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
      handler: 'www/search/boards.js'
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
  { maxPages = 2, pageSize = 100, targetPins = null } = {}
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
        handler: 'www/[username]/[slug].js'
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
  if (pinsMap.size === 0 && parsedPath.owner_username && parsedPath.board_slug) {
    const pidgetsBoardUrl = `https://widgets.pinterest.com/v3/pidgets/boards/${encodeURIComponent(parsedPath.owner_username)}/${encodeURIComponent(parsedPath.board_slug)}/pins/`;
    const pidRes = await router.requestJson(pidgetsBoardUrl, {
      endpointKey: 'pidgets',
      referer: 'https://www.pinterest.com/'
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
 * SURFACE 6: Board "Find more ideas" (`BoardFeedResource/get` via `/<user>/<slug>/more_ideas/` with `add_vase: true`).
 * Requires `_auth=1`; gracefully skips on missing/expired cookie without tripping circuit breaker.
 */
export async function harvestBoardMoreIdeasSurface(
  router,
  board = {},
  { maxPages = 4, pageSize = 25, targetPins = null } = {}
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

  for (let page = 1; page <= maxP; page++) {
    if (pinTarget !== null && pinsMap.size >= pinTarget) break;
    const opts = {
      board_id: boardId,
      board_url: parsedPath.clean_path,
      current_page: 'board_more_ideas',
      add_vase: true,
      field_set_key: 'grid_item',
      page_size: pSize,
      ...(bookmark ? { bookmarks: [bookmark] } : {})
    };
    const url = `https://www.pinterest.com/resource/BoardFeedResource/get/?source_url=${encodeURIComponent(moreIdeasSourceUrl)}&data=${encodeURIComponent(JSON.stringify({ options: opts, context: {} }))}`;

    const res = await router.requestJson(url, {
      endpointKey: 'board_more_ideas',
      sourceUrl: moreIdeasSourceUrl,
      handler: 'www/[username]/[slug]/more_ideas.js'
    });

    if (res.skippedAuthOnly || res.authRequiredFallback) {
      skippedAuthOnly = true;
      break;
    }
    if (!res.ok || !res.data) break;
    pagesFetched++;

    const rr = res.data?.resource_response?.data || res.data?.data || [];
    const list = Array.isArray(rr) ? rr : (rr.items || rr.pins || rr.results || []);
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
      }
    }

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
  { maxPages = 5, pageSize = 50, targetPins = null, preResolvedInterest = null, onPageProgress = null } = {}
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
      handler: 'www/ideas/[interest_url_name]/[interest_id].js'
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
        handler: 'www/ideas/[interest_url_name]/[interest_id].js'
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
  if (pinsMap.size === 0) {
    const htmlRes = await router.requestJson(`https://www.pinterest.com${ideasSourceUrl}`, {
      endpointKey: 'ssr_page_zero_cookie',
      isDocumentHtml: true,
      referer: 'https://www.pinterest.com/'
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

/**
 * SURFACE 9: Authenticated Home Feed Deep Scroll (`UserHomefeedResource/get`, Zone 1 `_auth=1`).
 * Supports scrolling 100 to 2,000 pins directly from the authenticated operator's trained Home Feed.
 * Gracefully skips on missing cookie / HTTP 412 without tripping circuit breaker.
 */
export async function harvestHomeFeedSurface(
  router,
  { maxPages = 5, pageSize = 50, targetPins = 250, seedQuery = null, onPageProgress = null } = {}
) {
  const pSize = Math.max(10, Math.min(50, Number(pageSize) || 50));
  const pinTarget = targetPins !== null && targetPins !== undefined && Number(targetPins) > 0
    ? Math.max(25, Math.min(2000, Math.round(Number(targetPins))))
    : null;
  const maxP = Math.max(1, Math.min(50, pinTarget ? Math.ceil(pinTarget / Math.max(20, pSize)) + 2 : (Number(maxPages) || 5)));

  const pinsMap = new Map();
  let bookmark = null;
  let lastBookmark = null;
  let pagesFetched = 0;
  let skippedAuthOnly = false;
  let consecutiveEmptyPages = 0;

  for (let page = 1; page <= maxP; page++) {
    if (pinTarget !== null && pinsMap.size >= pinTarget) break;

    const opts = {
      field_set_key: 'hf_grid_partner',
      in_nux: false,
      prependPartner: false,
      prependUserNews: false,
      static_feed: false,
      page_size: pSize,
      ...(bookmark ? { bookmarks: [bookmark] } : {})
    };
    const url = `https://www.pinterest.com/resource/UserHomefeedResource/get/?source_url=%2F&data=${encodeURIComponent(JSON.stringify({ options: opts, context: {} }))}`;

    const res = await router.requestJson(url, {
      endpointKey: 'home_feed',
      sourceUrl: '/',
      handler: 'www/index.js'
    });

    if (res.skippedAuthOnly || res.authRequiredFallback) {
      skippedAuthOnly = true;
      break;
    }
    if (!res.ok || !res.data) break;
    pagesFetched++;

    const rr = res.data?.resource_response?.data ?? res.data?.data ?? [];
    const list = Array.isArray(rr) ? rr : (rr.results || rr.items || rr.pins || []);
    const sizeBefore = pinsMap.size;

    for (const raw of list) {
      if (pinTarget !== null && pinsMap.size >= pinTarget) break;
      const norm = normalizeSurfaceCandidatePin(raw, {
        surface: 'home_feed',
        seed_query: seedQuery || 'home feed'
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

  return {
    ok: pinsMap.size > 0,
    surface: 'home_feed',
    pins: Array.from(pinsMap.values()),
    skipped_auth_only: skippedAuthOnly,
    pages_fetched: pagesFetched
  };
}

/**
 * Recursively unwraps nested module/pin containers from `RelatedModulesResource/get`
 * (handles both flat pin arrays and 2026 nested `{ type: 'module', pins/items/objects/results/data }` wrappers).
 */
export function extractPinsFromRelatedModulesPayload(payload) {
  const pins = [];
  const seen = new Set();

  const visit = (node, depth = 0) => {
    if (!node || depth > 8) return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1);
      return;
    }
    if (typeof node !== 'object') return;

    const rawId = String(node.id ?? node.pin_id ?? node.entityId ?? '').trim();
    const isDirectPin = isValidPinId(rawId) && (
      node.type === 'pin' ||
      (!node.type && (node.images || node.imageSpec_736x || node.pinner || node.repin_count !== undefined || node.aggregated_pin_data))
    );
    if (isDirectPin && !seen.has(rawId)) {
      seen.add(rawId);
      pins.push(node);
    }

    const nestedKeys = ['pins', 'items', 'objects', 'results', 'data', 'carousel_items', 'related_pins', 'module', 'pin', 'object'];
    for (const k of nestedKeys) {
      if (node[k]) visit(node[k], depth + 1);
    }
  };

  visit(payload, 0);
  return pins;
}

/**
 * SURFACE 8: Related Pin Snowball (`RelatedModulesResource/get`, Zone 1 `_auth=1`).
 * Gracefully skips when no cookie is configured or on `HTTP 412 Login required` without tripping circuit breaker.
 */
export async function harvestRelatedPinSnowballSurface(
  router,
  seedPinId,
  { maxPages = 10, pageSize = 30, targetPins = null, hop = 1, seedQuery = null, onPageProgress = null } = {}
) {
  const cleanSeedId = String(seedPinId || '').trim();
  if (!isValidPinId(cleanSeedId)) {
    return { ok: false, surface: 'related_pin_snowball', seed_pin_id: cleanSeedId, pins: [], skipped_auth_only: false, pages_fetched: 0 };
  }

  const pSize = Math.max(10, Math.min(50, Number(pageSize) || 30));
  const pinTarget = targetPins !== null && targetPins !== undefined && Number(targetPins) > 0
    ? Math.max(25, Math.min(1000, Math.round(Number(targetPins))))
    : null;
  const maxP = Math.max(1, Math.min(40, pinTarget ? Math.ceil(pinTarget / Math.max(20, pSize)) + 2 : (Number(maxPages) || 2)));
  const sourceUrl = `/pin/${cleanSeedId}/`;

  const pinsMap = new Map();
  let bookmark = null;
  let lastBookmark = null;
  let pagesFetched = 0;
  let skippedAuthOnly = false;
  let consecutiveEmptyPages = 0;

  for (let page = 1; page <= maxP; page++) {
    if (pinTarget !== null && pinsMap.size >= pinTarget) break;

    const isAuth = Boolean(router?.canUseAuthSession);
    const opts = {
      pin_id: cleanSeedId,
      context_pin_ids: [],
      search_query: '',
      field_set_key: isAuth ? 'react_grid_pin' : 'unauth_react',
      ...(isAuth ? { add_vase: true, is_related_modules: true } : {}),
      page_size: pSize,
      ...(bookmark ? { bookmarks: [bookmark] } : {})
    };
    const url = `https://www.pinterest.com/resource/RelatedModulesResource/get/?source_url=${encodeURIComponent(sourceUrl)}&data=${encodeURIComponent(JSON.stringify({ options: opts, context: {} }))}`;

    const res = await router.requestJson(url, {
      endpointKey: 'related_modules',
      sourceUrl,
      handler: 'www/pin/[id].js'
    });

    if (res.skippedAuthOnly || res.authRequiredFallback) {
      skippedAuthOnly = true;
      break;
    }
    if (!res.ok || !res.data) break;
    pagesFetched++;

    const rr = res.data?.resource_response?.data ?? res.data?.data ?? [];
    const list = extractPinsFromRelatedModulesPayload(rr);
    const sizeBefore = pinsMap.size;
    for (const raw of list) {
      if (pinTarget !== null && pinsMap.size >= pinTarget) break;
      const norm = normalizeSurfaceCandidatePin(raw, {
        surface: 'related_pin_snowball',
        seed_query: seedQuery,
        snowball_parent_pin_id: cleanSeedId,
        snowball_hop: hop
      });
      if (norm && norm.pin_id !== cleanSeedId) {
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

  return {
    ok: pinsMap.size > 0,
    surface: 'related_pin_snowball',
    seed_pin_id: cleanSeedId,
    pins: Array.from(pinsMap.values()),
    skipped_auth_only: skippedAuthOnly,
    pages_fetched: pagesFetched
  };
}

/**
 * 50x Batch Pre-Triage via `widgets.pinterest.com/v3/pidgets/pins/info/` (STRICT ZERO-COOKIE,
 * parallelized with Semaphore(6) so 5,000 pins finish in ~3.5s!).
 * Extracts `repin_count`, explicit `saves` (keeping `save_count = null` when omitted),
 * board context, and `pinner.username` via `pinner.profile_url`.
 */
export async function pretriageCandidatesWithPidgets(
  pinIds,
  router,
  { concurrency = 6, onBatchProgress = null } = {}
) {
  const uniqueIds = Array.from(new Set((pinIds || []).map((id) => String(id || '').trim()).filter(isValidPinId)));
  const enrichmentMap = new Map();
  if (uniqueIds.length === 0) return enrichmentMap;

  const slices = chunkArray(uniqueIds, 50);
  const sem = new Semaphore(Math.max(1, Math.min(8, Number(concurrency) || 6)));
  let completedBatches = 0;

  await Promise.all(
    slices.map((slice) => sem.run(async () => {
      const requestedSliceSet = new Set(slice);
      const url = `https://widgets.pinterest.com/v3/pidgets/pins/info/?pin_ids=${slice.join(',')}`;
      const res = await router.requestJson(url, {
        endpointKey: 'pidgets',
        referer: 'https://www.pinterest.com/'
      });

      completedBatches++;
      if (!res.ok || !res.data) {
        if (typeof onBatchProgress === 'function' && (completedBatches % 5 === 0 || completedBatches === slices.length)) {
          await onBatchProgress({ completedBatches, totalBatches: slices.length, enrichedCount: enrichmentMap.size });
        }
        return;
      }

      const rawList = Array.isArray(res.data?.data) ? res.data.data : (res.data?.data?.pins || []);

      for (const p of rawList) {
        const pid = String(p?.id || '').trim();
        if (!isValidPinId(pid) || !requestedSliceSet.has(pid)) continue;

        const pinnerUsername = extractUsernameFromProfileUrl(p.pinner?.profile_url || '', p.pinner?.username || '');
        const nativeCreatorUsername = extractUsernameFromProfileUrl(p.native_creator?.profile_url || '', p.native_creator?.username || '');
        const rawSaves =
          p.aggregated_pin_data?.aggregated_stats?.saves ??
          p.aggregated_stats?.saves ??
          p.save_count ??
          null;
        const saveCount = rawSaves !== null && rawSaves !== undefined
          ? parseCleanMetric(rawSaves, null, { preserveCeiling: true })
          : null;

        const rawRepins = p.repin_count ?? p.repins ?? null;
        const repinCount = rawRepins !== null && rawRepins !== undefined
          ? parseCleanMetric(rawRepins, null, { preserveCeiling: true })
          : null;

        const rawLink = safeString(p.link || p.rich_metadata?.url || '');
        const destUrl = sanitizeDestinationUrl(rawLink);
        const dom = normalizeDomain(p.domain || '', destUrl);
        const isLinkless = Boolean(
          !destUrl ||
          !dom ||
          ['uploaded by user', 'uploaded by pinner', 'pinterest.com', 'www.pinterest.com', 'pin.it'].includes(dom.toLowerCase())
        );

        const standardImg =
          p.images?.['736x']?.url ||
          p.images?.['564x']?.url ||
          p.images?.['236x']?.url ||
          '';

        const effectiveCreator = nativeCreatorUsername || pinnerUsername || null;
        const originPinRaw = String(p.origin_pin?.id ?? p.originPin?.id ?? '').trim();
        const originPinId = isValidPinId(originPinRaw) ? originPinRaw : null;

        enrichmentMap.set(pid, {
          pin_id: pid,
          origin_pin_id: originPinId,
          title: safeString(p.title || p.rich_metadata?.title || ''),
          description: safeString(p.description || ''),
          image_url: standardImg,
          dominant_color: p.dominant_color || '#888888',
          destination_url: destUrl || null,
          clean_domain: isLinkless ? null : dom,
          is_linkless: isLinkless,
          pinner_username: pinnerUsername || null,
          pinner_full_name: safeString(p.pinner?.full_name || '') || null,
          pinner_followers: p.pinner?.follower_count !== undefined && p.pinner?.follower_count !== null
            ? parseCleanMetric(p.pinner.follower_count, null, { preserveCeiling: true, cap: 0 })
            : null,
          origin_creator_username: nativeCreatorUsername || null,
          effective_creator_username: effectiveCreator,
          effective_creator_followers: p.pinner?.follower_count !== undefined && p.pinner?.follower_count !== null
            ? parseCleanMetric(p.pinner.follower_count, null, { preserveCeiling: true, cap: 0 })
            : null,
          is_repin: Boolean(
            (originPinId && originPinId !== pid) ||
            (nativeCreatorUsername && pinnerUsername && nativeCreatorUsername !== pinnerUsername)
          ),
          board_id: safeString(p.board?.id || '') || null,
          board_name: safeString(p.board?.name || '') || null,
          board_url: formatPinterestBoardUrl(p.board?.url || ''),
          board_pin_count: p.board?.pin_count !== undefined && p.board?.pin_count !== null
            ? parseCleanMetric(p.board.pin_count, null, { preserveCeiling: true, cap: 0 })
            : null,
          board_follower_count: p.board?.follower_count !== undefined && p.board?.follower_count !== null
            ? parseCleanMetric(p.board.follower_count, null, { preserveCeiling: true, cap: 0 })
            : null,
          save_count: saveCount,
          has_explicit_saves: saveCount !== null,
          repin_count: repinCount,
          has_explicit_repins: repinCount !== null,
          is_video: Boolean(p.is_video || p.videos),
          // CRITICAL: Pidgets lacks `created_at` and root canonical check — NEVER mark is_hydrated = true!
          is_hydrated: false
        });
      }

      if (typeof onBatchProgress === 'function' && (completedBatches % 5 === 0 || completedBatches === slices.length)) {
        await onBatchProgress({ completedBatches, totalBatches: slices.length, enrichedCount: enrichmentMap.size });
      }
    }))
  );

  return enrichmentMap;
}

/**
 * Strict Zero-Cookie `PinResource/get` Hydrator (`hydratePinZeroCookie`).
 * NEVER sends `_auth=1` — preserves `pin_join.visual_annotation` & `annotations_with_links`,
 * authentic root `created_at` (defeating the Child Repin fake-age trap by hydrating
 * `canonical_pin_id` whenever `is_repin === true` or canonical differs from `pin_id`),
 * upload provenance, and `pinner` vs `origin_pinner` separation.
 */
export async function hydratePinZeroCookie(
  pinId,
  router,
  { _depth = 0, rootPinCache = null, nowMs = Date.now(), resolveRootPin = false } = {}
) {
  const cleanId = String(pinId || '').trim();
  if (!isValidPinId(cleanId)) return { ok: false, pin_id: cleanId, pin: null, error: 'invalid_pin_id' };

  const sourceUrl = `/pin/${cleanId}/`;
  const dataParam = encodeURIComponent(JSON.stringify({
    options: {
      id: cleanId,
      field_set_key: 'detailed',
      fetch_visual_search_objects: false
    },
    context: {}
  }));
  const url = `https://www.pinterest.com/resource/PinResource/get/?source_url=${encodeURIComponent(sourceUrl)}&data=${dataParam}`;

  const res = await router.requestJson(url, {
    endpointKey: 'pin_resource',
    sourceUrl,
    handler: 'www/pin/[id].js'
  });

  let rawPin = res.data?.resource_response?.data || res.data?.data || null;

  // Fallback to zero-cookie SSR __PWS_INITIAL_PROPS__ if PinResource failed
  if (!rawPin || typeof rawPin !== 'object') {
    const ssrRes = await router.requestJson(`https://www.pinterest.com/pin/${cleanId}/`, {
      endpointKey: 'ssr_page_zero_cookie',
      isDocumentHtml: true,
      referer: 'https://www.pinterest.com/'
    });
    if (ssrRes.ok && typeof ssrRes.data === 'string') {
      const props = extractPwsInitialProps(ssrRes.data);
      rawPin = findPinInTree(props, cleanId);
    }
  }

  if (!rawPin || typeof rawPin !== 'object') {
    return {
      ok: false,
      status: res.status || 404,
      pin_id: cleanId,
      pin: null,
      error: res.error || 'pin_not_found'
    };
  }

  const normalized = normalizeSurfaceCandidatePin(
    { ...rawPin, id: cleanId },
    { surface: 'pin_resource', is_hydrated: true }
  );

  if (!normalized) {
    return { ok: false, status: 422, pin_id: cleanId, pin: null, error: 'invalid_pin_payload' };
  }

  // Wave 6E Direct Age Mode (default `resolveRootPin === false`):
  // Trust the pin's own `created_at_pinterest` and `repin_count` directly without extra `PinResource/get`
  // root-unwrapping calls. Opt-in legacy root unwrapping runs ONLY when `resolveRootPin === true`.
  if (_depth === 0 && resolveRootPin === true) {
    const explicitOrigin = (normalized.origin_pin_id && normalized.origin_pin_id !== cleanId)
      ? normalized.origin_pin_id
      : null;
    const needsRootUnwrap = Boolean(normalized.is_repin || explicitOrigin);
    const explicitCanonical = (needsRootUnwrap && normalized.canonical_pin_id && normalized.canonical_pin_id !== cleanId)
      ? normalized.canonical_pin_id
      : null;
    const repinFallbackCanonical = (needsRootUnwrap && !explicitOrigin && !explicitCanonical && normalized.aggregated_pin_data_id && normalized.aggregated_pin_data_id !== cleanId)
      ? normalized.aggregated_pin_data_id
      : null;
    const rootTargetId = explicitOrigin || explicitCanonical || repinFallbackCanonical;

    if (needsRootUnwrap && rootTargetId) {
      let rootRes = rootPinCache?.get?.(rootTargetId) || null;
      if (!rootRes) {
        rootRes = await hydratePinZeroCookie(rootTargetId, router, {
          _depth: 1,
          rootPinCache,
          nowMs,
          resolveRootPin: false
        });
        if (rootPinCache && typeof rootPinCache.set === 'function') {
          rootPinCache.set(rootTargetId, rootRes);
        }
      }

      const rootPin = rootRes?.ok ? rootRes.pin : null;
      if (rootPin && rootPin.created_at_pinterest) {
        const childMs = normalized.created_at_pinterest ? Date.parse(normalized.created_at_pinterest) : NaN;
        const rootMs = Date.parse(rootPin.created_at_pinterest);
        const trueCreatedMs = Number.isFinite(childMs) && Number.isFinite(rootMs)
          ? Math.min(childMs, rootMs)
          : rootMs;
        if (Number.isFinite(trueCreatedMs)) {
          normalized.created_at_pinterest = new Date(trueCreatedMs).toISOString();
          normalized.age_days = Math.max(0.05, Math.round(((nowMs - trueCreatedMs) / 86_400_000) * 10) / 10);
          normalized.root_pin_id = rootTargetId;
          normalized.canonical_pin_id = rootTargetId;
          normalized.root_age_verified = true;
          normalized.is_repin = true;

          // Unwrap root pin metrics, annotations, and metadata so board repin gems never lose root Re-pins or annotations!
          if (rootPin.repin_count !== null && rootPin.repin_count !== undefined) {
            normalized.repin_count = normalized.repin_count !== null && normalized.repin_count !== undefined
              ? Math.max(Number(normalized.repin_count), Number(rootPin.repin_count))
              : Number(rootPin.repin_count);
            normalized.has_explicit_repins = true;
          }
          if (rootPin.save_count !== null && rootPin.save_count !== undefined) {
            normalized.save_count = normalized.save_count !== null && normalized.save_count !== undefined
              ? Math.max(Number(normalized.save_count), Number(rootPin.save_count))
              : Number(rootPin.save_count);
            normalized.has_explicit_saves = true;
          }
          if (Array.isArray(rootPin.visual_annotations) && rootPin.visual_annotations.length > 0) {
            const mergedAnns = new Map();
            for (const a of [...(normalized.visual_annotations || []), ...rootPin.visual_annotations]) {
              const name = String(typeof a === 'string' ? a : (a?.name || '')).trim();
              if (!name) continue;
              const k = name.toLowerCase();
              if (!mergedAnns.has(k)) mergedAnns.set(k, typeof a === 'string' ? { name, url: null, idea_id: null } : { ...a });
            }
            normalized.visual_annotations = Array.from(mergedAnns.values()).slice(0, 25);
          }
          if (!normalized.title && rootPin.title) normalized.title = rootPin.title;
          if (!normalized.image_url && rootPin.image_url) normalized.image_url = rootPin.image_url;
          if (!normalized.destination_url && rootPin.destination_url) {
            normalized.destination_url = rootPin.destination_url;
            normalized.clean_domain = rootPin.clean_domain;
            normalized.is_linkless = rootPin.is_linkless;
          }
          if (!normalized.origin_creator_username && (rootPin.origin_creator_username || rootPin.pinner_username)) {
            normalized.origin_creator_username = rootPin.origin_creator_username || rootPin.pinner_username;
            normalized.origin_creator_full_name = rootPin.origin_creator_full_name || rootPin.pinner_full_name || normalized.origin_creator_full_name;
            normalized.origin_creator_followers = rootPin.origin_creator_followers ?? rootPin.pinner_followers ?? normalized.origin_creator_followers;
            normalized.effective_creator_username = normalized.origin_creator_username;
            normalized.effective_creator_followers = normalized.origin_creator_followers ?? normalized.effective_creator_followers;
          }
        } else {
          normalized.root_age_verified = false;
          normalized.created_at_pinterest = null;
          normalized.age_days = null;
          normalized.repin_root_unverified = true;
        }
      } else {
        // Root creation date could NOT be verified — invalidate fake child repin timestamp!
        normalized.root_age_verified = false;
        normalized.created_at_pinterest = null;
        normalized.age_days = null;
        normalized.repin_root_unverified = true;
      }
    } else if (needsRootUnwrap) {
      // Child repin with no canonical/origin root pin ID — cannot verify original root creation date!
      normalized.root_age_verified = false;
      normalized.created_at_pinterest = null;
      normalized.age_days = null;
      normalized.repin_root_unverified = true;
    } else {
      normalized.root_pin_id = cleanId;
      normalized.root_age_verified = Boolean(normalized.created_at_pinterest);
    }
  } else {
    normalized.root_pin_id = cleanId;
    normalized.root_age_verified = Boolean(normalized.created_at_pinterest);
    normalized.repin_root_unverified = false;
  }

  // Mark hydrated after PinResource/get completed
  normalized.is_hydrated = true;

  return {
    ok: true,
    status: 200,
    pin_id: cleanId,
    pin: normalized
  };
}

/**
 * Strict Zero-Cookie `UserResource/get` Hydrator (`hydrateUserZeroCookie`).
 * Maps `profile_reach` -> `monthly_reach` (`total_audience`) and `profile_views` -> `profile_views` (`impressions`),
 * preserving `10,000,001` (`10M+` ceiling indicator).
 */
export async function hydrateUserZeroCookie(username, router) {
  const cleanUser = extractUsernameFromProfileUrl('', username);
  if (!cleanUser) {
    return { ok: false, username: '', user: null, error: 'invalid_username' };
  }

  const sourceUrl = `/${cleanUser}/`;
  const dataParam = encodeURIComponent(JSON.stringify({
    options: { username: cleanUser, field_set_key: 'profile' },
    context: {}
  }));
  const url = `https://www.pinterest.com/resource/UserResource/get/?source_url=${encodeURIComponent(sourceUrl)}&data=${dataParam}`;

  const res = await router.requestJson(url, {
    endpointKey: 'user_resource',
    sourceUrl,
    handler: 'www/[username]/index.js'
  });

  let data = res.data?.resource_response?.data || res.data?.data || null;

  if (!data || typeof data !== 'object') {
    const ssrRes = await router.requestJson(`https://www.pinterest.com/${cleanUser}/`, {
      endpointKey: 'ssr_page_zero_cookie',
      isDocumentHtml: true,
      referer: 'https://www.pinterest.com/'
    });
    if (ssrRes.ok && typeof ssrRes.data === 'string') {
      const props = extractPwsInitialProps(ssrRes.data);
      const usersMap = props?.initialReduxState?.users || props?.props?.initialReduxState?.users || {};
      for (const u of Object.values(usersMap)) {
        if (u && typeof u === 'object' && String(u.username || '').toLowerCase() === cleanUser) {
          data = u;
          break;
        }
      }
    }
  }

  if (!data || typeof data !== 'object') {
    return { ok: false, status: res.status || 404, username: cleanUser, user: null, error: res.error || 'user_not_found' };
  }

  const followerCount = parseCleanMetric(data.follower_count ?? 0, 0, { preserveCeiling: true, cap: 0 });
  const monthlyReach = parseCleanMetric(data.profile_reach ?? data.monthly_reach ?? data.reach ?? 0, 0, { preserveCeiling: true, cap: 0 });
  const profileViews = parseCleanMetric(data.profile_views ?? data.monthly_views ?? 0, 0, { preserveCeiling: true, cap: 0 });
  const pinCount = parseCleanMetric(data.pin_count ?? data.total_pins ?? 0, 0, { preserveCeiling: true, cap: 0 });
  const boardCount = parseCleanMetric(data.board_count ?? data.total_boards ?? 0, 0, { preserveCeiling: true, cap: 0 });
  const websiteUrl = sanitizeDestinationUrl(data.website_url || data.domain_url || '') || null;
  const rawDom = websiteUrl ? normalizeDomain('', websiteUrl) : '';
  const cleanDomain = (rawDom && !['uploaded by user', 'pinterest.com', 'www.pinterest.com'].includes(rawDom.toLowerCase()))
    ? rawDom
    : null;

  let accountCreatedAt = null;
  if (data.created_at) {
    const d = new Date(data.created_at);
    if (!Number.isNaN(d.getTime())) accountCreatedAt = d.toISOString();
  }

  return {
    ok: true,
    status: 200,
    username: cleanUser,
    user: {
      username: cleanUser,
      display_name: safeString(data.full_name || cleanUser),
      avatar_url: data.image_xlarge_url || data.image_large_url || data.image_medium_url || null,
      website_url: websiteUrl,
      clean_domain: cleanDomain,
      follower_count: followerCount,
      monthly_reach: monthlyReach,
      total_audience: monthlyReach,
      profile_views: profileViews,
      impressions: profileViews,
      pin_count: pinCount,
      board_count: boardCount,
      account_created_at: accountCreatedAt,
      is_verified_merchant: Boolean(data.is_verified_merchant)
    }
  };
}
