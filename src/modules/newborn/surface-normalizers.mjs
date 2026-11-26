/**
 * src/modules/newborn/surface-normalizers.mjs
 *
 * Leaf module for Newborn surface candidate normalization, record merging,
 * smart hunt input parsing, board path & semantic matching, and internal sibling helpers.
 */

import {
  formatPin,
  parseCleanMetric,
  safeString,
  sanitizeDestinationUrl,
  normalizeDomain
} from '../../core/pinterest/pins.mjs';
import { isValidPinId, RESERVED_KEYWORD_SLUGS } from '../../http/security-and-response.mjs';
import { normalizePinterestUsername, RESERVED_PINTEREST_PATHS } from '../creators/competitors-crud.mjs';
import { isCommercialOrAdPin } from '../keywords/service.mjs';

const HTML_NAMED_ENTITIES = Object.freeze({
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  rsquo: '\u2019',
  lsquo: '\u2018',
  rdquo: '\u201D',
  ldquo: '\u201C',
  ndash: '\u2013',
  mdash: '\u2014',
  hellip: '\u2026',
  copy: '\u00A9',
  reg: '\u00AE',
  trade: '\u2122'
});

/**
 * Single-pass, safe HTML entity decoder (never double-decodes `&amp;lt;`).
 * Supports decimal/hex numeric entities with strict Unicode scalar bounds and common named entities.
 */
export function decodeHtmlEntities(value) {
  if (value === null || value === undefined) return '';
  const str = typeof value === 'string' ? value : String(value);
  if (!str.includes('&')) return str;
  return str.replace(/&(?:#(\d+)|#x([0-9a-fA-F]+)|([a-zA-Z]+));/g, (match, dec, hex, named) => {
    if (dec !== undefined) {
      const cp = Number.parseInt(dec, 10);
      if (Number.isInteger(cp) && cp > 0 && cp <= 0x10FFFF && !(cp >= 0xD800 && cp <= 0xDFFF)) {
        return String.fromCodePoint(cp);
      }
      return match;
    }
    if (hex !== undefined) {
      const cp = Number.parseInt(hex, 16);
      if (Number.isInteger(cp) && cp > 0 && cp <= 0x10FFFF && !(cp >= 0xD800 && cp <= 0xDFFF)) {
        return String.fromCodePoint(cp);
      }
      return match;
    }
    if (named !== undefined) {
      const mapped = HTML_NAMED_ENTITIES[named.toLowerCase()];
      if (mapped !== undefined) return mapped;
    }
    return match;
  });
}

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

export const BOARD_MATCH_STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'your', 'you', 'are', 'was',
  'were', 'have', 'has', 'had', 'not', 'but', 'all', 'can', 'out', 'about', 'into',
  'pin', 'pins', 'board', 'boards', 'pinterest', 'ideas', 'idea', 'inspo', 'inspiration',
  'best', 'cute', 'easy', 'simple', 'diy', 'aesthetic', 'my', 'of', 'in', 'on', 'to', 'at'
]);

export const BOARD_GENERIC_HEAD_WORDS = new Set([
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

export function extractBookmark(json) {
  const raw =
    json?.resource_response?.bookmark ||
    (Array.isArray(json?.resource_response?.bookmarks) ? json.resource_response.bookmarks[0] : null) ||
    json?.resource?.options?.bookmarks?.[0] ||
    null;
  if (!raw || raw === '-end-' || raw === 'null') return null;
  return String(raw).trim() || null;
}

export function extractPinAnnotationsDetailed(rawPin) {
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
      const clean = decodeHtmlEntities(item).trim();
      if (clean.length >= 2 && !/^not[\s_-]?given$/i.test(clean)) {
        const key = clean.toLowerCase();
        if (!map.has(key)) map.set(key, { name: clean, url: null, idea_id: null });
      }
      return;
    }
    if (typeof item === 'object') {
      const rawName = decodeHtmlEntities(safeString(item.name || item.key || item.label || item.title || '')).trim();
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
    for (const [label, val] of Object.entries(withLinks)) {
      if (typeof val === 'string') {
        const valTrim = val.trim();
        const keyTrim = label.trim();
        const keyIsUrl = /^(\/|https?:\/\/)/i.test(keyTrim);
        const valIsUrl = /^(\/|https?:\/\/)/i.test(valTrim);
        if (valIsUrl && !keyIsUrl && !/^\d+$/.test(keyTrim)) {
          ingestLinkedItem({ name: keyTrim, url: valTrim });
        } else if (!valIsUrl && (/^\d+$/.test(keyTrim) || keyIsUrl)) {
          ingestLinkedItem({
            name: valTrim,
            url: keyIsUrl ? keyTrim : null,
            idea_id: /^\d+$/.test(keyTrim) ? keyTrim : null
          });
        } else {
          ingestLinkedItem({ name: keyTrim, url: valTrim });
        }
      } else if (val && typeof val === 'object') {
        const fallbackName = (!/^\d+$/.test(label.trim()) && !/^(\/|https?:\/\/)/i.test(label.trim())) ? label : '';
        ingestLinkedItem({
          ...val,
          name: val.name || val.key || val.label || val.title || fallbackName,
          idea_id: val.idea_id || val.ideaId || val.id || (/^\d+$/.test(label.trim()) ? label.trim() : null)
        });
      } else if (label && !/^\d+$/.test(label.trim())) {
        ingestLinkedItem(label);
      }
    }
  }

  if (Array.isArray(visual)) {
    for (const item of visual) ingestLinkedItem(item);
  }

  if (Array.isArray(pj.seo_related_interests || pj.seoRelatedInterests)) {
    for (const item of (pj.seo_related_interests || pj.seoRelatedInterests)) {
      ingestLinkedItem(item);
    }
  }

  if (Array.isArray(rawPin.annotations)) {
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
  const pinnerFullName = decodeHtmlEntities(safeString(pinnerRaw.full_name || pinnerRaw.fullName || formatted?.pinner?.full_name || ''));
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
  const originFullName = originRaw ? decodeHtmlEntities(safeString(originRaw.full_name || originRaw.fullName || '')) : '';
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
    rawPin.is_repin ||
    rawPin.isRepin ||
    (originPinId && originPinId !== rawId) ||
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
  const isBoardDiscoverySurface = context.surface === 'board_more_ideas' || context.surface === 'board_feed';
  const discoveryBoardName = isBoardDiscoverySurface
    ? (decodeHtmlEntities(safeString(context.discovery_board_name || context.board_name || '')) || null)
    : (decodeHtmlEntities(safeString(context.discovery_board_name || '')) || null);
  const discoveryBoardUrl = isBoardDiscoverySurface
    ? formatPinterestBoardUrl(context.discovery_board_url || context.board_url || '')
    : formatPinterestBoardUrl(context.discovery_board_url || '');

  const pinBoardName = decodeHtmlEntities(safeString(boardObj.name || formatted?.board_name || '')) || null;
  const pinBoardUrl = formatPinterestBoardUrl(safeString(boardObj.url || formatted?.board_url || ''));

  const boardId = safeString(boardObj.id || boardObj.entityId || context.board_id || formatted?.board_id || '') || null;
  const boardName = discoveryBoardName || pinBoardName || decodeHtmlEntities(safeString(context.board_name || '')) || null;
  const boardUrl = discoveryBoardUrl || pinBoardUrl || formatPinterestBoardUrl(safeString(context.board_url || ''));

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

  const rawSurface = context.is_hydration_overlay
    ? null
    : (context.surface !== undefined ? context.surface : 'pin_serp_capsules');
  const surfaceId = (rawSurface && String(rawSurface).trim().toLowerCase() !== 'pin_resource')
    ? String(rawSurface).trim()
    : null;

  return {
    pin_id: rawId,
    origin_pin_id: originPinId,
    canonical_pin_id: canonicalPinId,
    aggregated_pin_data_id: aggregatedPinDataId,
    root_pin_id: originPinId || (isRepin ? (canonicalPinId || rawId) : rawId),
    root_age_verified: context.root_age_verified ?? null,
    first_surface: surfaceId,
    discovered_surfaces: surfaceId ? [surfaceId] : [],
    seed_query: context.seed_query || null,
    matched_queries: context.seed_query ? [String(context.seed_query).trim().toLowerCase()] : [],
    snowball_parent_pin_id: context.snowball_parent_pin_id || null,
    snowball_hop: Number.isFinite(Number(context.snowball_hop)) ? Number(context.snowball_hop) : 0,
    title: decodeHtmlEntities(formatted?.title || safeString(rawPin.title || rawPin.grid_title || '')),
    description: decodeHtmlEntities(formatted?.description || safeString(rawPin.description || '')),
    alt_text: decodeHtmlEntities(formatted?.alt_text || safeString(rawPin.alt_text || rawPin.auto_alt_text || '')),
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
    discovery_board_name: discoveryBoardName,
    discovery_board_url: discoveryBoardUrl,
    pin_board_name: pinBoardName,
    pin_board_url: pinBoardUrl,
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

  const SURFACE_PRIORITY = [
    'board_more_ideas',
    'pin_serp_capsules',
    'ideas_feeds',
    'home_feed',
    'related_pin_snowball',
    'board_feed',
    'growing_trends',
    'zero_query_popular'
  ];
  const surfaces = Array.from(new Set([
    ...(Array.isArray(base.discovered_surfaces) ? base.discovered_surfaces : []),
    ...(Array.isArray(incoming.discovered_surfaces) ? incoming.discovered_surfaces : [])
  ].map((s) => String(s || '').trim()).filter((s) => s && s.toLowerCase() !== 'pin_resource')));

  const pickDeterministicFirstSurface = () => {
    const cleanBase = base.first_surface && String(base.first_surface).toLowerCase() !== 'pin_resource' ? base.first_surface : null;
    const cleanInc = incoming.first_surface && String(incoming.first_surface).toLowerCase() !== 'pin_resource' ? incoming.first_surface : null;
    if (surfaces.length > 0) {
      for (const p of SURFACE_PRIORITY) {
        if (surfaces.includes(p)) return p;
      }
      return surfaces[0];
    }
    return cleanBase || cleanInc || 'pin_serp_capsules';
  };

  const annMap = new Map();
  for (const a of [...(base.visual_annotations || []), ...(incoming.visual_annotations || [])]) {
    if (!a) continue;
    const rawObj = typeof a === 'string' ? { name: a, url: null, idea_id: null } : a;
    const cleanName = decodeHtmlEntities(rawObj.name || '').trim();
    if (!cleanName) continue;
    const obj = { ...rawObj, name: cleanName };
    const k = cleanName.toLowerCase();
    const prev = annMap.get(k);
    if (!prev) annMap.set(k, obj);
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
  const isInternalDomain = Boolean(cleanDomain && /(^|\.)(pinterest\.|pin\.it)/i.test(String(cleanDomain)));
  const isLinkless = (!destinationUrl || !cleanDomain || isInternalDomain)
    ? true
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

  const preferHydratedText = (baseVal, incomingVal) => {
    const b = decodeHtmlEntities(baseVal || '').trim();
    const inc = decodeHtmlEntities(incomingVal || '').trim();
    if (incoming.is_hydrated && inc) return inc;
    if (base.is_hydrated && !incoming.is_hydrated && b) return b;
    return inc || b || '';
  };

  return {
    ...base,
    ...incoming,
    origin_pin_id: incoming.origin_pin_id || base.origin_pin_id || null,
    canonical_pin_id: incoming.canonical_pin_id || base.canonical_pin_id || null,
    aggregated_pin_data_id: incoming.aggregated_pin_data_id || base.aggregated_pin_data_id || null,
    root_pin_id: incoming.root_pin_id || base.root_pin_id || incoming.pin_id || base.pin_id,
    root_age_verified: resolvedRootVerified,
    first_surface: pickDeterministicFirstSurface(),
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
    title: preferHydratedText(base.title, incoming.title),
    description: preferHydratedText(base.description, incoming.description),
    alt_text: preferHydratedText(base.alt_text, incoming.alt_text),
    image_url: incoming.image_url || base.image_url || '',
    image_signature: incoming.image_signature || base.image_signature || null,
    dominant_color: (incoming.dominant_color && incoming.dominant_color !== '#888888')
      ? incoming.dominant_color
      : (base.dominant_color || '#888888'),
    destination_url: destinationUrl,
    clean_domain: cleanDomain,
    is_linkless: isLinkless,
    pinner_username: pinnerUsername,
    pinner_full_name: preferHydratedText(base.pinner_full_name, incoming.pinner_full_name) || null,
    pinner_followers: pinnerFollowers,
    origin_creator_username: originUsername,
    origin_creator_full_name: preferHydratedText(base.origin_creator_full_name, incoming.origin_creator_full_name) || null,
    origin_creator_followers: originFollowers,
    effective_creator_username: effectiveUsername,
    effective_creator_followers: effectiveFollowers,
    creator_monthly_reach: pickMaxNullable(base.creator_monthly_reach, incoming.creator_monthly_reach),
    creator_profile_views: pickMaxNullable(base.creator_profile_views, incoming.creator_profile_views),
    creator_pin_count: pickMaxNullable(base.creator_pin_count, incoming.creator_pin_count),
    is_repin: Boolean(base.is_repin || incoming.is_repin || (originUsername && pinnerUsername && originUsername !== pinnerUsername)),
    board_id: incoming.board_id || base.board_id || null,
    discovery_board_name: base.discovery_board_name || incoming.discovery_board_name || null,
    discovery_board_url: formatPinterestBoardUrl(base.discovery_board_url || incoming.discovery_board_url || ''),
    pin_board_name: preferHydratedText(base.pin_board_name, incoming.pin_board_name) || null,
    pin_board_url: formatPinterestBoardUrl(incoming.pin_board_url || base.pin_board_url || ''),
    board_name: base.discovery_board_name || incoming.discovery_board_name || preferHydratedText(base.pin_board_name || base.board_name, incoming.pin_board_name || incoming.board_name) || null,
    board_url: formatPinterestBoardUrl(base.discovery_board_url || incoming.discovery_board_url || incoming.pin_board_url || incoming.board_url || base.pin_board_url || base.board_url || ''),
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
