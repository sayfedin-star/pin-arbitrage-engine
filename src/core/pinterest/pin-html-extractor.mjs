/**
 * src/core/pinterest/pin-html-extractor.mjs
 *
 * Multi-stage HTML / Relay v3 / JSON-LD / OpenGraph Pin Extraction.
 */

import { parseCleanMetric } from './pin-metrics.mjs';
import { findPinInTree, formatPin } from './pin-formatter.mjs';

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

export function mergeRelayV3Pin(target, v3) {
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
      if (formatted.creation_method === 'unhydrated_stub' || formatted.creation_method === 'organic_pin') {
        formatted.creation_method = 'pinterest_platform';
        formatted.method = 'pinterest_platform';
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
