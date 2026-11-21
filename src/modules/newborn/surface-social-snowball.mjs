/**
 * src/modules/newborn/surface-social-snowball.mjs
 *
 * Authenticated Home Feed Deep Scroll and Related Pin Snowball Surface Harvesters.
 */

import { isValidPinId, redactSecrets } from '../../http/security-and-response.mjs';
import {
  extractBookmark,
  normalizeSurfaceCandidatePin,
  mergeCandidatePinRecords
} from './surface-normalizers.mjs';

/**
 * SURFACE 9: Authenticated Home Feed Deep Scroll (`UserHomefeedResource/get`, Zone 1 `_auth=1`).
 * Supports scrolling 100 to 2,000 pins directly from the authenticated operator's trained Home Feed.
 * Gracefully skips on missing cookie / HTTP 412 without tripping circuit breaker.
 */
export async function harvestHomeFeedSurface(
  router,
  { maxPages = 5, pageSize = 50, targetPins = 250, seedQuery = null, onPageProgress = null, signal = null } = {}
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
    if (signal?.aborted) break;
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
      handler: 'www/index.js',
      signal
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
 * Uses the canonical 2026 RelatedModulesResource payload and records HTTP/error diagnostics
 * on failure rather than silently swallowing page-1 rejections.
 */
export async function harvestRelatedPinSnowballSurface(
  router,
  seedPinId,
  { maxPages = 10, pageSize = 24, targetPins = null, hop = 1, seedQuery = null, onPageProgress = null, signal = null } = {}
) {
  const cleanSeedId = String(seedPinId || '').trim();
  if (!isValidPinId(cleanSeedId)) {
    return {
      ok: false,
      surface: 'related_pin_snowball',
      seed_pin_id: cleanSeedId,
      pins: [],
      skipped_auth_only: false,
      pages_fetched: 0,
      last_http_status: null,
      error: 'INVALID_SEED_PIN_ID'
    };
  }

  const effectivePageSize = Math.max(10, Math.min(24, Number(pageSize) || 24));
  const pinTarget = targetPins !== null && targetPins !== undefined && Number(targetPins) > 0
    ? Math.max(25, Math.min(1000, Math.round(Number(targetPins))))
    : null;
  const maxP = Math.max(1, Math.min(50, pinTarget ? Math.ceil(pinTarget / Math.max(12, effectivePageSize)) + 2 : (Number(maxPages) || 10)));
  const sourceUrl = `/pin/${cleanSeedId}/`;

  const pinsMap = new Map();
  let bookmark = null;
  let lastBookmark = null;
  let pagesFetched = 0;
  let skippedAuthOnly = false;
  let consecutiveEmptyPages = 0;
  let lastHttpStatus = null;
  let lastError = null;

  for (let page = 1; page <= maxP; page++) {
    if (signal?.aborted) break;
    if (pinTarget !== null && pinsMap.size >= pinTarget) break;

    const opts = {
      additional_fields: ['pin.gen_ai_topics'],
      pin_id: cleanSeedId,
      context_pin_ids: [],
      context_near_dup_image_sigs: [],
      homefeed_source_sig: null,
      page_size: effectivePageSize,
      search_query: '',
      source: 'deep_linking',
      top_level_source: 'deep_linking',
      top_level_source_depth: 1,
      is_pdp: false,
      client_tracking_params: 'CwABAAAAEDE0ODExNTU0MzQxNjE4ODgLAAcAAAAPdW5rbm93bi91bmtub3duAA',
      ...(bookmark ? { bookmarks: [bookmark] } : {})
    };
    const url = `https://www.pinterest.com/resource/RelatedModulesResource/get/?source_url=${encodeURIComponent(sourceUrl)}&data=${encodeURIComponent(JSON.stringify({ options: opts, context: {} }))}`;

    const res = await router.requestJson(url, {
      endpointKey: 'related_modules',
      sourceUrl,
      handler: 'www/pin/[id].js',
      extraHeaders: {
        Origin: 'https://www.pinterest.com',
        'Screen-Dpr': '1'
      },
      signal
    });

    if (res.status !== undefined && res.status !== null) {
      lastHttpStatus = res.status;
    }

    if (res.skippedAuthOnly || res.authRequiredFallback) {
      skippedAuthOnly = true;
      lastError = redactSecrets(String(res.error || 'AUTH_REQUIRED_412'));
      break;
    }
    if (!res.ok || !res.data) {
      lastError = redactSecrets(String(res.error || (res.status ? `HTTP_${res.status}` : 'EMPTY_RESPONSE')));
      break;
    }
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
    pages_fetched: pagesFetched,
    last_http_status: lastHttpStatus,
    error: lastError
  };
}
