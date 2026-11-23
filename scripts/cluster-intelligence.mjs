#!/usr/bin/env node

/**
 * Pinterest Algorithmic Arbitrage Engine
 * Cluster Intelligence & Macro Graph Synthesis Pipeline
 *
 * Reverse-Engineered Signals:
 * - P2P_RECGPT, P2P_NAVBOOST_CAND, P2P_RANDOMWALK_CAND,
 * - P2P_TWO_TOWER_EMBEDDING_CAND, P2P_TWO_TOWER_MID_FUNNEL_FRESH_EMBEDDING_CAND,
 * - P2P_TWO_TOWER_SHOPPING_CORPUS_CAND / PLP_CORPUS
 * - Utility function: prod:v18 weights
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { createSqlClient, withDbRetry } from '../src/db/client.mjs';
import {
  CANONICAL_FINGERPRINT,
  sleep,
  setDefaultDispatcher,
  fetchPinFromPinResource,
  fetchPinsBatchFromPidgets,
  CircuitBreakerOpenError,
  globalPinterestCircuitBreaker
} from '../src/core/pinterest/index.mjs';
import { redactSecrets } from '../src/http/security-and-response.mjs';

import {
  loadDotEnvIfPresent,
  bootstrapUndiciKeepAliveDispatcher,
  startInstaBoxActivityLease
} from './lib/fleet-runner.mjs';

const isTestEnv = process.env.NODE_ENV === 'test' || process.env.ENVIRONMENT === 'test';
const undiciAgent = !isTestEnv ? await bootstrapUndiciKeepAliveDispatcher(setDefaultDispatcher) : null;
if (!isTestEnv) {
  loadDotEnvIfPresent();
}

let lease = null;
let _sql = null;
function getSql() {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error('CRITICAL: DATABASE_URL environment variable is missing.');
    }
    _sql = createSqlClient(url, { applicationName: 'pae-cluster-intelligence' });
  }
  return _sql;
}

const retryContextStorage = new AsyncLocalStorage();
const noRetrySql = (strings, ...values) => {
  const client = getSql();
  return (client.noRetry || client)(strings, ...values);
};
const sql = (strings, ...values) => {
  const client = getSql();
  if (retryContextStorage.getStore()?.useNoRetry && client.noRetry) {
    return client.noRetry(strings, ...values);
  }
  return client(strings, ...values);
};
sql.noRetry = noRetrySql;

// Comprehensive list of stop words for weighted token scoring (excludes platform & alt-text noise)
const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'have', 'are', 'was',
  'were', 'will', 'would', 'can', 'could', 'should', 'about', 'into', 'over',
  'after', 'how', 'what', 'when', 'where', 'why', 'who', 'which', 'recipe',
  'recipes', 'best', 'easy', 'make', 'made', 'simple', 'quick', 'delicious',
  'your', 'you', 'our', 'all', 'any', 'each', 'more', 'most', 'just', 'only',
  'very', 'too', 'also', 'than', 'then', 'now', 'here', 'there', 'they',
  'them', 'their', 'she', 'her', 'him', 'his', 'its', 'not', 'nor', 'but',
  'out', 'down', 'off', 'through', 'under', 'between', 'during', 'without',
  'food', 'cook', 'cooking', 'instant', 'slow', 'cooker',
  // Machine alt-text and platform boilerplate tokens
  'shown', 'show', 'shows', 'showing', 'instructions', 'instruction',
  'advertisement', 'ad', 'displayed', 'display', 'menu', 'menus', 'dish', 'dishes',
  'photo', 'photos', 'picture', 'pictures', 'image', 'images', 'video', 'videos',
  'pin', 'pins', 'ideas', 'idea', 'guide', 'tutorial', 'read', 'click', 'link',
  'page', 'post', 'view', 'check',
  // Staging and visual container noise
  'table', 'plate', 'bowl', 'counter', 'board', 'background', 'white', 'wooden',
  'close', 'overhead', 'piece', 'pieces', 'slice', 'slices', 'cup', 'glass'
]);

/**
 * Safely extract string content (supports raw strings, numbers, and Pinterest format/text objects)
 */
function cleanString(val) {
  if (typeof val === 'string') return val.trim();
  if (typeof val === 'number') return String(val);
  if (val && typeof val === 'object') {
    if (typeof val.format === 'string' && val.format.trim()) return val.format.trim();
    if (typeof val.text === 'string' && val.text.trim()) return val.text.trim();
    if (typeof val.title === 'string' && val.title.trim()) return val.title.trim();
    if (typeof val.display_name === 'string' && val.display_name.trim()) return val.display_name.trim();
    if (typeof val.label === 'string' && val.label.trim()) return val.label.trim();
    if (typeof val.query === 'string' && val.query.trim()) return val.query.trim();
  }
  return '';
}

import { formatPinterestCookie, normalizeCleanDomain } from '../src/utils.mjs';
import {
  buildZoneARelatedModulesHeaders,
  stripAllCookiesFromHeaders
} from '../src/modules/newborn/cookie-router.mjs';
import { resolveNewbornRawCookie } from '../src/modules/newborn/settings.mjs';
import {
  extractCreatorAndLinkMeta,
  upsertCandidateGraphEdges
} from '../src/modules/related-pins/graph-writer.mjs';
export { formatPinterestCookie };

export function buildClusterSeedRelatedHeaders(pinId, rawCookie = '') {
  return buildZoneARelatedModulesHeaders({ pinId, rawCookie });
}

/**
 * Resilient database query wrapper: delegates transient PG connection retries to canonical withDbRetry
 * while forcing inner `sql` calls onto `sql.noRetry` to eliminate 3 × 5 retry amplification storms.
 */
export async function sqlWithRetry(queryFn, maxRetries = 3, options = {}) {
  const retrySql = options.sqlClient ? (options.sqlClient.noRetry || options.sqlClient) : noRetrySql;
  return retryContextStorage.run({ useNoRetry: true }, () =>
    withDbRetry(() => queryFn(retrySql), {
      maxRetries: Math.max(0, maxRetries - 1),
      baseDelayMs: options.baseDelayMs ?? 500,
      maxDelayMs: options.maxDelayMs ?? 2000,
      ...(typeof options.sleepFn === 'function' ? { sleepFn: options.sleepFn } : {})
    })
  );
}

/**
 * Fetch with resilience: timeout abort, HTTP 429 backoff, Zone-A 412/401 guest fallback, jitter
 */
export async function fetchWithRetry(url, headers, maxRetries = 3, options = {}) {
  const fetchFn = typeof options.fetchImpl === 'function' ? options.fetchImpl : fetch;
  const breaker = options.circuitBreaker !== undefined ? options.circuitBreaker : globalPinterestCircuitBreaker;
  const sleepFn = typeof options.sleepImpl === 'function' ? options.sleepImpl : sleep;
  let activeHeaders = { ...headers };
  let attemptedGuestFallback = false;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    if (breaker && typeof breaker.canExecute === 'function' && !breaker.canExecute()) {
      throw new CircuitBreakerOpenError('Pinterest circuit breaker is OPEN: halting RelatedModulesResource fetch');
    }
    try {
      const response = await fetchFn(url, {
        headers: activeHeaders,
        signal: AbortSignal.timeout(8000),
        ...(undiciAgent ? { dispatcher: undiciAgent } : {})
      });

      if (response.status === 429) {
        if (response?.body) await response.body.cancel().catch(() => {});
        if (breaker && typeof breaker.recordFailure === 'function') {
          breaker.recordFailure(429);
          if (typeof breaker.canExecute === 'function' && !breaker.canExecute()) {
            throw new CircuitBreakerOpenError('Pinterest circuit breaker tripped OPEN after HTTP 429');
          }
        }
        if (attempt === maxRetries) {
          throw new Error('HTTP error 429: Rate limited');
        }
        console.warn(`[!] HTTP 429 Rate limited (attempt ${attempt}/${maxRetries}). Backing off...`);
        await sleepFn(Math.min(60000, 15000 * attempt));
        continue;
      }

      if (response.status === 412 || response.status === 401) {
        if (response?.body) await response.body.cancel().catch(() => {});
        const hadCookie = Boolean(activeHeaders.Cookie || activeHeaders.cookie);
        if (hadCookie && !attemptedGuestFallback) {
          attemptedGuestFallback = true;
          activeHeaders = stripAllCookiesFromHeaders(activeHeaders);
          console.warn(`[!] HTTP ${response.status} on Zone-A session cookie; retrying once with zero-cookie guest headers...`);
          attempt--;
          continue;
        }
        throw new Error(`HTTP error ${response.status}: ${response.statusText || 'Login required'}`);
      }

      if (response.status === 403) {
        if (response?.body) await response.body.cancel().catch(() => {});
        console.error(`[-] HTTP 403 Forbidden on attempt ${attempt}: Pinterest blocked request.`);
        if (breaker && typeof breaker.recordFailure === 'function') {
          breaker.recordFailure(403);
          if (typeof breaker.canExecute === 'function' && !breaker.canExecute()) {
            throw new CircuitBreakerOpenError('Pinterest circuit breaker tripped OPEN after HTTP 403');
          }
        }
      }

      if (!response.ok) {
        if (response?.body) await response.body.cancel().catch(() => {});
        console.warn(`[!] HTTP ${response.status} ${response.statusText} on attempt ${attempt}`);
        if (attempt === maxRetries) {
          throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
        }
        await sleepFn(3000 * attempt);
        continue;
      }

      if (breaker && typeof breaker.recordSuccess === 'function') {
        breaker.recordSuccess();
      }
      return await response.json();
    } catch (err) {
      if (err instanceof CircuitBreakerOpenError || err?.code === 'CIRCUIT_BREAKER_OPEN') {
        throw err;
      }
      if (/^HTTP error (?:412|401|429):/.test(String(err?.message || ''))) {
        throw err;
      }
      if (breaker && typeof breaker.recordFailure === 'function') {
        breaker.recordFailure(0, err);
        if (typeof breaker.canExecute === 'function' && !breaker.canExecute()) {
          throw new CircuitBreakerOpenError('Pinterest circuit breaker tripped OPEN after repeated network failures');
        }
      }
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        console.warn(`[!] Request timed out (attempt ${attempt}/${maxRetries})`);
      } else {
        console.warn(`[!] Network error on attempt ${attempt}: ${redactSecrets(err?.message || String(err))}`);
      }
      if (attempt === maxRetries) {
        throw err;
      }
      await sleepFn(2500 * attempt);
    }
  }
}

/**
 * Detect true engine provenance using upstream signals and MultiBiSage multi-graph interactions
 */
function detectEngineProvenance(
  pin,
  parentEntity,
  saves = 0,
  saveRate = 0,
  dailyVelocity = 0,
  ageDays = 180,
  _isRecgptCandidate = false,
  _recgptTransitionScore = 0,
  sequenceRole = ''
) {
  const markers = [
    pin?.logging_data?.source_module,
    pin?.origin_module,
    pin?._parent_module,
    pin?.source_module,
    parentEntity?.source_module,
    parentEntity?.module_id,
    parentEntity?.name,
    parentEntity?.type
  ].filter(Boolean).map((s) => String(s).toUpperCase());

  const combined = markers.join(' ');

  if (combined.includes('NAVBOOST') || combined.includes('CO_VISIT')) {
    return 'P2P_NAVBOOST';
  }
  if (combined.includes('RANDOMWALK') || combined.includes('PIXIE')) {
    return 'P2P_RANDOMWALK';
  }
  if (combined.includes('RECGPT') || combined.includes('SEQUENTIAL')) {
    return 'P2P_RECGPT';
  }
  if (combined.includes('FRESH') || combined.includes('COLD_START')) {
    return 'FRESH_COLD_START';
  }
  if (combined.includes('SHOPPING') || combined.includes('PLP_CORPUS') || combined.includes('MERCHANT')) {
    return 'P2P_SHOPPING_CORPUS';
  }
  if (combined.includes('TWO_TOWER')) {
    return 'P2P_TWO_TOWER';
  }

  // MultiBiSage, Pixie & TransAct V2 interaction-derived provenance:
  // 1. Explicit merchant/shopping corpus tags (Etsy, Shopify, PDP)
  if (pin.is_eligible_for_pdp || (pin.price_value && Number(pin.price_value) > 0) || pin.product_metadata || (Array.isArray(pin.shopping_flags) && pin.shopping_flags.length > 0)) {
    return 'P2P_SHOPPING_CORPUS';
  }
  // 2. Cold-start Fresh exploration (P2B2P / Fresh Two-Tower)
  if (ageDays <= 22 && saves < 800) {
    return 'FRESH_COLD_START';
  }
  // 3. High engagement co-visitation (NavBoost: Click/Save log momentum)
  if (saves >= 6500 || dailyVelocity >= 20.0 || (saveRate >= 35.0 && dailyVelocity >= 10.0)) {
    return 'P2P_NAVBOOST';
  }
  // 4. Sequential session trajectory candidate (RecGPT: Course transitions)
  const isSequentialPairRole = ['DESSERT_HERO', 'BEVERAGE_PAIRING', 'PASTRY_BITES', 'SESSION_FINISHER'].includes(sequenceRole);
  if (isSequentialPairRole && saves >= 350) {
    return 'P2P_RECGPT';
  }
  // 5. Bipartite Pixie Random Walk: Mid-tier graph walk discovery pins across user boards
  if (saves >= 1200) {
    return 'P2P_RANDOMWALK';
  }

  // 6. Default dense semantic vector candidate (Two-Tower PinSage/ItemSage)
  return 'P2P_TWO_TOWER';
}


/**
 * Pre-Classification Sanitation (Title, Domain, and Description Filter)
 * Strictly filter out non-food candidates BEFORE evaluating OCR or inserting into database
 */
export function isCulinaryCandidate(title = '', domain = '', description = '') {
  const combined = `${title || ''} ${domain || ''} ${description || ''}`.toLowerCase();
  
  // Non-culinary blacklist (Furniture, Decor, Apparel, Beauty)
  const nonCulinaryRegex = /\b(barstool|stool|chair|furniture|couch|sofa|table set|dining set|rug|curtain|dress|clothing|earrings|necklace|bracelet|lipstick|hair|braid|wig|skincare|cleanser)\b/i;
  if (nonCulinaryRegex.test(combined)) {
    return false;
  }
  return true;
}

/**
 * Context-Aware Sequence Role Classification (RecGPT & MultiBiSage)
 * Dynamically assigns sequence roles based on seed cluster domain (Bakery/Dessert vs Savory Dinner)
 */
export function classifySequenceRole(title = '', description = '', ocrText = '', clusterType = 'GENERAL') {
  const fullText = `${title || ''} ${description || ''} ${ocrText || ''}`.toLowerCase();

  const isCommercial = /\b(buy|shop|sale|deal|discount|price|order|coupon|store|etsy|amazon|product)\b/i.test(fullText);
  const isActionableGuide = /\b(how to|guide|tutorial|steps|step by step|diy|tips|ideas|checklist|routine|plan)\b/i.test(fullText);
  const isDessertOrBake = /\b(muffin|muffins|cake|cakes|cookie|cookies|brownie|brownies|roll|rolls|cinnamon|pie|pies|tart|bread|cupcake|cupcakes|donut|donuts|pastry|pastries|bake|baking|dessert|sweet|chocolate|caramel|snickerdoodle|pumpkin spice|cheesecake)\b/i.test(fullText);
  const isBeverageOrPairing = /\b(latte|coffee|cider|tea|drink|frosting|glaze|syrup|drizzle|dip|cream cheese|icing)\b/i.test(fullText);
  const isSnackBites = /\b(bites|truffle|truffles|energy bite|snack|crescent|mini|treat|treats|crispie|krispie)\b/i.test(fullText);
  const isSavoryDinner = /\b(chicken|turkey|pork|beef|steak|salmon|cod|meatloaf|dinner|casserole|roast|pasta|meat|soup|stew)\b/i.test(fullText);

  if (isCommercial) {
    return 'COMMERCIAL_TRANSACTION_HERO';
  }
  if (isActionableGuide) {
    return 'ACTIONABLE_PILLAR_GUIDE';
  }

  // If cluster is Bakery/Dessert (or candidate has strong dessert tokens)
  if (clusterType === 'BAKERY_DESSERT' || isDessertOrBake) {
    if (isSavoryDinner && !isDessertOrBake) {
      return 'PIXIE_DRIFT_OUTLIER'; // Cross-cluster leakage from user-board bipartite random walk
    }
    if (isBeverageOrPairing) {
      return 'BEVERAGE_PAIRING';
    }
    if (isSnackBites) {
      return 'PASTRY_BITES';
    }
    return 'DESSERT_HERO';
  }

  // Savory Dinner Cluster
  if (isSavoryDinner) {
    return 'DINNER_ANCHOR';
  }
  if (isBeverageOrPairing || /\b(carrots|potatoes|salad|bread|side|green beans|rice)\b/i.test(fullText)) {
    return 'NAVBOOST_CO_VISITOR';
  }
  if (isDessertOrBake) {
    return 'SESSION_FINISHER';
  }

  return 'NAVBOOST_CO_VISITOR';
}

/**
 * Extract an authentic human-readable title by stripping machine alt-text boilerplate,
 * or extracting the primary phrase from description or board context.
 */
export function cleanHumanTitle(rawAltText = '', rawDesc = '', boardName = '') {
  let cleaned = '';

  // 1. Try extracting and cleaning auto_alt_text
  if (rawAltText && typeof rawAltText === 'string') {
    let text = rawAltText.trim();

    // Strip machine intro boilerplate
    text = text.replace(/^(the\s+|a\s+|an\s+)?(recipe|instructions|directions|guide|tutorial|advertisement|ad|photo|picture|image|dish|menu)\s+(for|to\s+make|to|of)\s+/i, '');
    text = text.replace(/^(a\s+|an\s+)?(close\s*up\s+of|top\s+view\s+of|overhead\s+view\s+of)\s+/i, '');

    // Strip machine trailing boilerplate
    text = text.replace(/\s+(is|are)\s+(shown|displayed).*$/i, '');
    text = text.replace(/\s+(on\s+a\s+(white\s+)?(table|plate|bowl|counter|board|background)).*$/i, '');

    // Clean edge punctuation
    text = text.replace(/[\s.,;:–—-]+$/, '').trim();

    if (text.length >= 3 && !/^(shown|image|photo|recipe|instructions|ad|advertisement)$/i.test(text)) {
      cleaned = text.charAt(0).toUpperCase() + text.slice(1);
    }
  }

  // 2. If cleaned is empty, attempt first meaningful phrase from description
  if (!cleaned && rawDesc && typeof rawDesc === 'string') {
    const desc = rawDesc.trim();
    // Segment by pipe, bullets, em-dashes, or sentence period
    const firstSegment = desc.split(/[\r\n|•–—]|\.\s+/)[0]?.trim();
    if (firstSegment && firstSegment.length >= 4 && firstSegment.length <= 90) {
      cleaned = firstSegment.charAt(0).toUpperCase() + firstSegment.slice(1);
    } else if (desc.length > 0) {
      cleaned = desc.slice(0, 60).trim();
    }
  }

  // 3. Fallback to board name context if sufficiently descriptive
  if (!cleaned && boardName && typeof boardName === 'string') {
    const bName = boardName.trim();
    if (bName.length >= 3 && !/^(pins?|my\s+pins?|food|recipes?)$/i.test(bName)) {
      cleaned = `${bName} Inspiration`;
    }
  }

  return cleaned.replace(/[\s.,;:–—-]+$/, '').trim();
}

/**
 * Extract pin fields with complete fallback chain
 */
export function parsePinCandidate(pin, seedPinId, parentEntity = null, utilityWeights = null, seedClusterType = 'GENERAL') {
  if (!pin || typeof pin !== 'object') return null;

  const candidatePinId = String(pin.id || pin.pin_id || '').trim();
  if (!candidatePinId || candidatePinId === String(seedPinId) || candidatePinId.startsWith('-') || !/^\d+$/.test(candidatePinId)) {
    return null;
  }

  // Title fallback chain
  let title = (
    cleanString(pin.title) ||
    cleanString(pin.grid_title) ||
    cleanString(pin.rich_summary?.display_name) ||
    cleanString(pin.story_pin_data?.metadata?.pin_title)
  );

  // If title is missing or contains machine boilerplate (e.g., "recipe for ... is shown")
  if (!title || /^(the\s+|a\s+)?(recipe|instructions|advertisement)\s+for\b.*(shown|displayed)/i.test(title)) {
    const humanTitle = cleanHumanTitle(cleanString(pin.auto_alt_text), pin.description, cleanString(pin.board?.name));
    if (humanTitle) {
      title = humanTitle;
    }
  }

  if (!title) {
    const boardName = cleanString(pin.board?.name);
    const domainName = cleanString(pin.domain) || cleanString(pin.link_domain?.id);
    if (boardName) {
      title = `${boardName} Idea`;
    } else if (domainName && domainName !== 'Uploaded by user') {
      title = `Content via ${domainName}`;
    } else if (pin.is_video || pin.story_pin_data) {
      title = `[Video Pin without Title]`;
    } else {
      title = `[Pin without Title]`;
    }
  }

  const creatorLinkMeta = extractCreatorAndLinkMeta(pin);
  const rawDomain = cleanString(pin.domain) || cleanString(pin.link_domain?.id) || cleanString(pin.link);
  const cleanDomain = creatorLinkMeta.clean_domain || normalizeCleanDomain(rawDomain, { strictFqdn: true }) || null;
  const domain = cleanDomain || rawDomain || 'Uploaded by user';

  // Pre-classification check: reject non-culinary candidates only if cluster is culinary
  if ((seedClusterType === 'BAKERY_DESSERT' || seedClusterType === 'CULINARY') && !isCulinaryCandidate(title, domain, pin.description || '')) {
    return null;
  }

  const rawColor = cleanString(pin.dominant_color);
  const dominantColor = (rawColor && rawColor.toLowerCase() !== '#888888') ? rawColor : null;

  let aspectRatio = 0.560;
  if (pin.story_pin_data?.metadata?.canvas_aspect_ratio) {
    const parsedRatio = Number(pin.story_pin_data.metadata.canvas_aspect_ratio);
    if (!isNaN(parsedRatio) && isFinite(parsedRatio) && parsedRatio > 0) {
      aspectRatio = Number(parsedRatio.toFixed(3));
    }
  } else if (pin.images?.orig?.width && pin.images?.orig?.height) {
    const w = Number(pin.images.orig.width);
    const h = Number(pin.images.orig.height);
    if (!isNaN(w) && !isNaN(h) && h > 0) {
      aspectRatio = Number((w / h).toFixed(3));
    }
  }

  const rawExplicitSaves =
    pin.aggregated_pin_data?.aggregated_stats?.saves ??
    pin.aggregated_stats?.saves ??
    pin.save_count ??
    pin.saves ??
    null;
  const hasExplicitSaves =
    rawExplicitSaves !== null &&
    rawExplicitSaves !== undefined &&
    String(rawExplicitSaves).trim() !== '' &&
    Number.isFinite(Number(rawExplicitSaves));
  const saves = hasExplicitSaves ? Math.max(0, Math.round(Number(rawExplicitSaves))) : null;
  const effectiveSaves = saves ?? 0;
  const repins = Number(pin.repin_count || 0);
  const hasMedia = Boolean(
    pin.images?.orig?.url ||
    pin.images?.['236x']?.url ||
    pin.videos != null ||
    pin.story_pin_data?.pages?.length > 0 ||
    pin.image_large_url ||
    pin.image_medium_url
  );
  if (!hasMedia && effectiveSaves === 0 && repins === 0) {
    return null;
  }
  const rawRate = effectiveSaves > 0 ? ((repins / effectiveSaves) * 100) : 0;
  const saveRate = Number(Math.min(9999999.99, Math.max(0, rawRate)).toFixed(2));

  const isProduct = Boolean(
    pin.is_eligible_for_pdp ||
    (pin.price_value && Number(pin.price_value) > 0) ||
    pin.product_metadata ||
    (Array.isArray(pin.shopping_flags) && pin.shopping_flags.length > 0)
  );

  const ocrText = cleanString(pin.auto_alt_text);

  // Pin Age & Daily Velocity Math (Conservative fallback to prevent fake explosion)
  let pinCreatedAt = null;
  let hasExplicitDate = false;
  if (pin.created_at) {
    const parsedDate = new Date(pin.created_at);
    if (!isNaN(parsedDate.getTime())) {
      pinCreatedAt = parsedDate.toISOString();
      hasExplicitDate = true;
    }
  } else if (pin.story_pin_data?.metadata?.pin_created_at) {
    const parsedDate = new Date(pin.story_pin_data.metadata.pin_created_at);
    if (!isNaN(parsedDate.getTime())) {
      pinCreatedAt = parsedDate.toISOString();
      hasExplicitDate = true;
    }
  }

  let ageDays = 180;
  if (hasExplicitDate && pinCreatedAt) {
    ageDays = Math.max(1, Math.floor((Date.now() - new Date(pinCreatedAt).getTime()) / 86400000));
  } else {
    // When Pinterest omits creation date, estimate ~6 months to avoid saves/1 velocity spike
    pinCreatedAt = new Date(Date.now() - (180 * 86400000)).toISOString();
  }

  // Statistical Clamping: limit daily velocity to 1000 saves/day to eliminate artificial bot surges
  const rawVelocity = effectiveSaves > 0 ? Number((effectiveSaves / ageDays).toFixed(2)) : 0;
  const dailyVelocity = Math.min(rawVelocity, 1000.0);

  // Authentic media and origin properties from raw Pinterest entity
  const imageUrl = cleanString(
    pin.images?.['236x']?.url ||
    pin.images?.['474x']?.url ||
    pin.images?.orig?.url ||
    pin.image_large_url ||
    pin.image_medium_url ||
    pin.story_pin_data?.pages?.[0]?.blocks?.[0]?.image?.images?.['236x']?.url ||
    pin.story_pin_data?.pages?.[0]?.blocks?.[0]?.image?.images?.orig?.url ||
    ''
  );

  const isVideo = Boolean(
    pin.is_video === true ||
    pin.videos != null ||
    (Array.isArray(pin.story_pin_data?.pages) && pin.story_pin_data.pages.some((page) =>
      Array.isArray(page?.blocks) && page.blocks.some((b) => b.video != null || b.block_type === 3)
    ))
  );

  const isStory = Boolean(
    pin.story_pin_data != null ||
    pin.is_story === true ||
    pin.is_story_pin === true ||
    (pin.story_type && pin.story_type !== 'related_modules_header' && pin.story_type !== 'BUBBLE_ONE_COL') ||
    aspectRatio === 0.562 ||
    aspectRatio === 0.563
  );

  const ingestionMethod = cleanString(pin.method) || 'uploaded';

  // Algorithmic RecGPT Trajectory Modeling with Context-Aware Sequence Role
  const sequenceRole = classifySequenceRole(title, pin.description || '', ocrText, seedClusterType);
  let recgptTransitionScore = 0;
  let isRecgptCandidate = false;

  let baseAffinity = 0;
  if (sequenceRole === 'COMMERCIAL_TRANSACTION_HERO') {
    baseAffinity = 95.0;
    isRecgptCandidate = true;
  } else if (sequenceRole === 'ACTIONABLE_PILLAR_GUIDE') {
    baseAffinity = 94.0;
    isRecgptCandidate = true;
  } else if (sequenceRole === 'DESSERT_HERO') {
    baseAffinity = 95.0;
    isRecgptCandidate = true;
  } else if (sequenceRole === 'SESSION_FINISHER') {
    baseAffinity = 94.0;
    isRecgptCandidate = true;
  } else if (sequenceRole === 'BEVERAGE_PAIRING') {
    baseAffinity = 91.0;
    isRecgptCandidate = true;
  } else if (sequenceRole === 'PASTRY_BITES') {
    baseAffinity = 88.0;
    isRecgptCandidate = true;
  } else if (sequenceRole === 'DINNER_ANCHOR') {
    baseAffinity = 90.0;
    isRecgptCandidate = false;
  } else if (sequenceRole === 'NAVBOOST_CO_VISITOR') {
    baseAffinity = 85.0;
    isRecgptCandidate = false;
  }

  if (baseAffinity > 0) {
    const engagementFactor = saveRate > 0
      ? (0.7 + 0.3 * Math.min(1.0, saveRate / 100))
      : (0.75 + 0.25 * Math.min(1.0, Math.log10(Math.max(effectiveSaves, 10)) / 5));
    recgptTransitionScore = Number(Math.min(99.9, baseAffinity * engagementFactor).toFixed(1));
  }

  // True Engine Provenance (orthogonal to product status) with full interaction signals
  let provenanceEngine = detectEngineProvenance(
    pin,
    parentEntity,
    effectiveSaves,
    saveRate,
    dailyVelocity,
    ageDays,
    isRecgptCandidate,
    recgptTransitionScore,
    sequenceRole
  );

  // Dynamic Multi-Head prod:v18 Net Utility Score using upstream utility_config.weights
  let individualProdScore = 0;
  const pClick = 1.0;
  const pLongClick = Math.min(1.0, (saveRate / 100) * 1.2);
  const pRepin = effectiveSaves > 0 ? Math.min(1.0, repins / effectiveSaves) : 0;
  const pShortClick = isProduct ? 0.10 : (isVideo ? 0.08 : (isStory ? 0.06 : 0.05));

  if (utilityWeights && typeof utilityWeights === 'object') {
    let headWeights = null;
    if (isProduct && utilityWeights.PRODUCT_TRUSTWORTHY) {
      headWeights = utilityWeights.PRODUCT_TRUSTWORTHY;
    } else if (isVideo && utilityWeights.VIDEO) {
      headWeights = utilityWeights.VIDEO;
    } else if (isStory && utilityWeights.STORY) {
      headWeights = utilityWeights.STORY;
    } else if (utilityWeights.ORGANIC) {
      headWeights = utilityWeights.ORGANIC;
    }

    if (headWeights) {
      const clickW = Number(headWeights.CLICK_WEIGHT ?? (isStory ? 1.0 : (isProduct ? 111.72 : (isVideo ? 0.05 : 1.97))));
      const longClickW = Number(headWeights.LONG_CLICK_10S_WEIGHT ?? headWeights.LONG_CLICK_WEIGHT ?? (isStory ? 0.5 : (isProduct ? 137.80 : (isVideo ? 0.04 : 0.09))));
      const shortClickW = Number(headWeights.SHORT_CLICK_5S_WEIGHT ?? (isStory ? -100.34 : (isProduct ? -186.62 : (isVideo ? -99.65 : -392.64))));
      const repinW = Number(headWeights.REPIN_WEIGHT ?? (isStory ? 133.22 : (isProduct ? 133.83 : (isVideo ? 109.54 : 118.07))));

      individualProdScore = Number((
        (clickW * pClick) +
        (longClickW * pLongClick) +
        (shortClickW * pShortClick) +
        (repinW * pRepin)
      ).toFixed(2));
    }
  }

  // Calibrated fallback when upstream snapshot is unavailable
  if (individualProdScore === 0) {
    if (isProduct) {
      individualProdScore = Number(((111.72 * pClick) + (137.80 * pLongClick) - (186.62 * pShortClick) + (133.83 * pRepin)).toFixed(2));
    } else if (isVideo) {
      individualProdScore = Number(((0.05 * pClick) + (0.04 * pLongClick) - (99.65 * pShortClick) + (109.54 * pRepin)).toFixed(2));
    } else if (isStory) {
      individualProdScore = Number(((1.0 * pClick) + (0.5 * pLongClick) - (100.34 * pShortClick) + (133.22 * pRepin)).toFixed(2));
    } else {
      individualProdScore = Number(((1.97 * pClick) + (0.09 * pLongClick) - (392.64 * pShortClick) + (118.07 * pRepin)).toFixed(2));
    }
  }

  // Visual Entropy Score
  const visualEntropyScore = Number((Math.min(99.99, Math.abs(aspectRatio - 0.56) * 15 + (ocrText.length > 20 ? 12 : 5))).toFixed(2));

  return {
    seed_pin_id: String(seedPinId),
    candidate_pin_id: candidatePinId,
    title,
    dominant_color: dominantColor,
    aspect_ratio: aspectRatio,
    saves,
    save_count: saves,
    has_explicit_saves: hasExplicitSaves,
    repins,
    save_rate: saveRate,
    domain,
    clean_domain: cleanDomain,
    destination_url: creatorLinkMeta.destination_url,
    creator_username: creatorLinkMeta.creator_username,
    creator_name: creatorLinkMeta.creator_name,
    is_product: isProduct,
    ocr_text: ocrText,
    pin_created_at: pinCreatedAt,
    age_days: ageDays,
    daily_velocity: dailyVelocity,
    provenance_engine: provenanceEngine,
    individual_prod_score: individualProdScore,
    recgpt_transition_score: recgptTransitionScore,
    sequence_role: sequenceRole,
    is_recgpt_candidate: isRecgptCandidate,
    visual_entropy_score: visualEntropyScore,
    image_url: imageUrl,
    is_video: isVideo,
    ingestion_method: ingestionMethod
  };
}

/**
 * Extract pin objects from entity (handles both standalone pin and nested structures)
 */
function extractPinsFromEntity(item) {
  const pins = [];
  if (!item || typeof item !== 'object') return pins;

  const isContainerOrHeader = (entity) => {
    if (!entity || typeof entity !== 'object') return true;
    return Boolean(
      entity.container_type != null ||
      entity.story_type === 'related_modules_header' ||
      entity.story_type === 'BUBBLE_ONE_COL' ||
      entity.story_type === 'explore_article' ||
      entity.story_type === 'guide' ||
      entity.node_id === '__EMPTY__' ||
      entity.type === 'story' ||
      entity.type === 'explorearticle' ||
      entity.type === 'guide'
    );
  };

  const moduleMarker = item.source_module || item.module_id || item.name || item.type || item.module_type || '';

  const attachMeta = (p) => {
    if (p && typeof p === 'object' && !isContainerOrHeader(p)) {
      const pId = String(p.id || p.pin_id || '').trim();
      // Only attach valid positive numeric IDs
      if (pId && !pId.startsWith('-') && /^\d+$/.test(pId)) {
        if (!p._parent_module && moduleMarker) {
          p._parent_module = moduleMarker;
        }
        pins.push(p);
      }
    }
  };

  if (Array.isArray(item.pins)) {
    for (const p of item.pins) attachMeta(p);
  }
  if (Array.isArray(item.objects)) {
    for (const p of item.objects) attachMeta(p);
  }
  if (Array.isArray(item.items)) {
    for (const p of item.items) attachMeta(p);
  }

  const rawId = String(item.id || item.pin_id || '').trim();
  // If item itself is a real pin (must have media or positive pin ID and type === 'pin')
  if (!isContainerOrHeader(item) && rawId && !rawId.startsWith('-') && /^\d+$/.test(rawId)) {
    const hasMedia = Boolean(item.images || item.videos || item.story_pin_data || item.image_large_url || item.image_medium_url);
    if (item.type === 'pin' || hasMedia) {
      attachMeta(item);
    }
  }

  return pins;
}

/**
 * Quantize Hex color to 40-step RGB buckets for perceptual cluster centroids
 */
function quantizeHex(hex) {
  if (!hex || typeof hex !== 'string') return null;
  const clean = hex.replace('#', '').toLowerCase();
  if (clean.length < 6 || clean === '888888') return null;
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
  const step = 40;
  const qr = Math.min(255, Math.round(r / step) * step).toString(16).padStart(2, '0');
  const qg = Math.min(255, Math.round(g / step) * step).toString(16).padStart(2, '0');
  const qb = Math.min(255, Math.round(b / step) * step).toString(16).padStart(2, '0');
  return `#${qr}${qg}${qb}`;
}

/**
 * Compute Dominant Color Centroids with Perceptual Quantization Clustering
 */
function computeColorCentroids(candidates) {
  if (candidates.length === 0) return [];
  const clusters = new Map();
  let validCount = 0;
  for (const c of candidates) {
    if (!c.dominant_color || typeof c.dominant_color !== 'string') continue;
    const raw = c.dominant_color.trim().toLowerCase();
    if (!raw || raw === '#888888') continue;
    const bucket = quantizeHex(raw);
    if (!bucket) continue;
    validCount++;
    if (!clusters.has(bucket)) {
      clusters.set(bucket, { hex: raw, count: 0 });
    }
    clusters.get(bucket).count++;
  }

  const denom = validCount > 0 ? validCount : candidates.length;
  return Array.from(clusters.values())
    .map(c => ({
      color: c.hex,
      count: c.count,
      percentage: Number(((c.count / denom) * 100).toFixed(1))
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

/**
 * Tokenize text, remove stop words, and compute Weighted Save-Rate NLP Score
 * W_t = \sum TF(t) * save_rate
 */
function computeHighSaveTokens(candidates) {
  if (candidates.length === 0) return [];

  const tokenMap = new Map(); // token => { tf: number, weighted_score: number }

  for (const candidate of candidates) {
    const text = `${candidate.title || ''} ${candidate.ocr_text || ''}`.toLowerCase();
    const rawTokens = text.split(/[^a-z0-9]+/);
    const seenInDoc = new Set();
    const saves = Number(candidate.saves || 0);
    const saveRate = Number(candidate.save_rate || 0);
    const docWeight = saveRate > 0 ? saveRate : Number((Math.log10(Math.max(saves, 10)) * 20).toFixed(2));

    for (const raw of rawTokens) {
      if (raw.length < 3 || /^\d+$/.test(raw) || STOP_WORDS.has(raw)) continue;

      if (!tokenMap.has(raw)) {
        tokenMap.set(raw, { tf: 0, weighted_score: 0 });
      }

      const stat = tokenMap.get(raw);
      stat.tf += 1;

      // Add to weighted score once per candidate document
      if (!seenInDoc.has(raw)) {
        stat.weighted_score += docWeight;
        seenInDoc.add(raw);
      }
    }
  }

  return Array.from(tokenMap.entries())
    .map(([token, data]) => ({
      token,
      tf: data.tf,
      weighted_score: Number(data.weighted_score.toFixed(2))
    }))
    .sort((a, b) => b.weighted_score - a.weighted_score)
    .slice(0, 25);
}

/**
 * Fetch authentic individual pin details from Pinterest PinResource
 * Zero speculation: Retrieves authoritative repin_count, reaction_counts, and saves directly
 */
export async function fetchPinDetails(pinId, _baseHeaders) {
  try {
    const formatted = await fetchPinFromPinResource(pinId, { dispatcher: undiciAgent });
    if (formatted) {
      const rawRepins = formatted.repin_count ?? formatted.repins ?? null;
      const repinNum = (rawRepins !== null && rawRepins !== undefined && rawRepins !== '') ? Number(rawRepins) : NaN;
      const repins = Number.isFinite(repinNum) ? Math.max(0, repinNum) : null;

      const rawSaves = formatted.save_count ?? formatted.saves ?? null;
      const saveNum = (rawSaves !== null && rawSaves !== undefined && rawSaves !== '') ? Number(rawSaves) : NaN;
      const saves = Number.isFinite(saveNum) ? Math.max(0, saveNum) : null;

      return {
        id: String(formatted.pin_id || formatted.id),
        repins,
        saves,
        reactions: formatted.reaction_counts || {}
      };
    }
  } catch (err) {}
  return null;
}

/**
 * Automated Deep Candidate Enrichment Pipeline
 * Seamlessly enriches candidates with authentic Pinterest PinResource metrics
 * Includes concurrency throttling (4 concurrent requests) and jitter to prevent HTTP 429
 */
export async function enrichCandidatesWithPinMetrics(seedPinId, baseHeaders, candidatesOverride = null, options = {}) {
  const dbSql = options.sql || sql;
  const batchPidgetsFn = typeof options.fetchPinsBatchFromPidgets === 'function'
    ? options.fetchPinsBatchFromPidgets
    : fetchPinsBatchFromPidgets;
  const fallbackDetailsFn = typeof options.fetchPinDetails === 'function'
    ? options.fetchPinDetails
    : fetchPinDetails;

  try {
    let candidatesNeedingEnrichment = Array.isArray(candidatesOverride) ? candidatesOverride : null;
    if (!candidatesNeedingEnrichment) {
      candidatesNeedingEnrichment = await dbSql`
        (
          SELECT candidate_pin_id, saves, daily_velocity, age_days
          FROM candidate_graph_nodes
          WHERE seed_pin_id = ${seedPinId} AND (repins = 0 OR repins IS NULL OR saves IS NULL)
          ORDER BY daily_velocity DESC NULLS LAST
          LIMIT 150
        )
        UNION
        (
          SELECT candidate_pin_id, saves, daily_velocity, age_days
          FROM candidate_graph_nodes
          WHERE seed_pin_id = ${seedPinId} AND (repins = 0 OR repins IS NULL OR saves IS NULL)
          ORDER BY saves DESC NULLS LAST
          LIMIT 150
        );
      `;
    }

    if (candidatesNeedingEnrichment.length === 0) {
      console.log(`[+] All candidate nodes for seed ${seedPinId} already have authentic metrics.`);
      return { total: 0, pidgetsHits: 0, fallbackCalls: 0, enriched: 0 };
    }

    console.log(`[*] Auto-enriching ${candidatesNeedingEnrichment.length} candidates (Stage 1: 50x Pidgets batch, Stage 2: selective PinResource)...`);

    const enrichedBatch = [];
    const fallbackCandidates = [];
    let pidgetsHits = 0;

    // Stage 1: 50-pin Pidgets batch pre-pass
    let pidgetsMap = new Map();
    try {
      const candidateIds = candidatesNeedingEnrichment.map(c => String(c.candidate_pin_id));
      const res = await batchPidgetsFn(candidateIds, { dispatcher: undiciAgent });
      if (res instanceof Map) pidgetsMap = res;
    } catch (_) {}

    const pushEnriched = (candidate, repinsVal, savesVal) => {
      const repins = Number(repinsVal || 0);
      const currentSaves = (savesVal !== null && savesVal !== undefined && Number.isFinite(Number(savesVal)) && Number(savesVal) >= 0)
        ? Number(savesVal)
        : (candidate.saves !== null && candidate.saves !== undefined && Number.isFinite(Number(candidate.saves)) ? Number(candidate.saves) : null);
      const saveRate = (currentSaves !== null && currentSaves > 0)
        ? Number(((repins / currentSaves) * 100).toFixed(2))
        : 0.00;
      const ageDays = Math.max(1, Number(candidate.age_days || 180));
      const updatedVelocity = (currentSaves !== null && currentSaves > 0)
        ? Math.min(1000.0, Number((currentSaves / ageDays).toFixed(2)) || Number(candidate.daily_velocity || 0))
        : Number(candidate.daily_velocity || 0);

      enrichedBatch.push({
        seed_pin_id: String(seedPinId),
        candidate_pin_id: String(candidate.candidate_pin_id),
        repins,
        saves: currentSaves,
        save_rate: saveRate,
        daily_velocity: updatedVelocity
      });
    };

    for (const candidate of candidatesNeedingEnrichment) {
      const cid = String(candidate.candidate_pin_id);
      const p = pidgetsMap.get(cid);
      const hasValidRepins = Boolean(p && !p.is_missing && p.repins !== undefined && p.repins !== null);
      if (hasValidRepins && options.requireDeepFields !== true) {
        pidgetsHits++;
        pushEnriched(candidate, p.repins, p.saves);
      } else {
        fallbackCandidates.push(candidate);
      }
    }

    // Stage 2: Fallback to fetchPinDetails (PinResource) only for missing pins or deep fields
    const concurrency = 4;
    let fallbackCalls = 0;

    for (let i = 0; i < fallbackCandidates.length; i += concurrency) {
      const chunk = fallbackCandidates.slice(i, i + concurrency);

      await Promise.all(chunk.map(async (candidate) => {
        try {
          fallbackCalls++;
          const pinData = await fallbackDetailsFn(candidate.candidate_pin_id, baseHeaders);
          if (pinData && pinData.repins !== undefined && pinData.repins !== null) {
            pushEnriched(candidate, pinData.repins, pinData.saves);
          }
        } catch (pinErr) {
          // Individual failure absorbed gracefully
        }
      }));

      // Polite inter-chunk jitter delay to respect Pinterest rate limits
      if (i + concurrency < fallbackCandidates.length) {
        await sleep(350);
      }
    }

    if (enrichedBatch.length > 0) {
      // Strictly sort by candidate_pin_id ASC to guarantee deterministic order and prevent 40P01 deadlocks
      enrichedBatch.sort((a, b) => String(a.candidate_pin_id).localeCompare(String(b.candidate_pin_id)));

      // Single bulk batch commit via jsonb_to_recordset replacing individual UPDATE round-trips
      await dbSql`
        UPDATE candidate_graph_nodes cgn
        SET 
          repins = x.repins,
          saves = x.saves,
          save_rate = x.save_rate,
          daily_velocity = x.daily_velocity
        FROM jsonb_to_recordset(${JSON.stringify(enrichedBatch)}::jsonb) AS x(
          seed_pin_id text, candidate_pin_id text, repins bigint, saves bigint, save_rate numeric, daily_velocity numeric
        )
        WHERE cgn.seed_pin_id = x.seed_pin_id 
          AND cgn.candidate_pin_id = x.candidate_pin_id;
      `;
    }

    console.log(`[+] Successfully enriched ${enrichedBatch.length}/${candidatesNeedingEnrichment.length} candidates with authentic Pinterest repin counts.`);
    return { total: candidatesNeedingEnrichment.length, pidgetsHits, fallbackCalls, enriched: enrichedBatch.length };
  } catch (err) {
    console.warn(`[!] Deep enrichment encountered non-fatal error: ${err.message}`);
    return { total: 0, pidgetsHits: 0, fallbackCalls: 0, enriched: 0, error: err.message };
  }
}

/**
 * Crawl seed pin candidates graph across up to 12 paginated bookmarks
 */
async function crawlSeed(seed) {
  const pinId = String(seed.pin_id);
  console.log(`\n======================================================`);
  console.log(`[*] Harvesting cluster for Seed Pin: ${pinId} (${seed.label || 'No label'})`);
  console.log(`======================================================`);

  const candidatesMap = new Map();
  let authoritativeCandidateCounts = null;
  let utilitySnapshot = null;
  const guidedSearchBubbles = new Set();
  const guidedSearchCapsulesMap = new Map();

  const labelLower = `${seed.label || ''} ${seed.title || ''}`.toLowerCase();
  const isBakery = /\b(muffin|muffins|cake|cakes|cookie|cookies|brownie|brownies|roll|rolls|cinnamon|pie|pies|tart|bread|cupcake|cupcakes|donut|donuts|pastry|pastries|bake|baking|dessert|sweet|chocolate|caramel|pumpkin spice)\b/i.test(labelLower);
  const seedClusterType = isBakery ? 'BAKERY_DESSERT' : 'GENERAL';

  let bookmark = null;
  const rawMaxPages = parseInt(process.env.MAX_PAGES, 10);
  const seedRuleMaxPages = Number(seed?.pin_graph_rules?.max_pages);
  const maxPages = Number.isFinite(seedRuleMaxPages) && seedRuleMaxPages > 0
    ? Math.min(Math.round(seedRuleMaxPages), 100)
    : ((!isNaN(rawMaxPages) && rawMaxPages > 0) ? Math.min(rawMaxPages, 100) : 60);

  const seedWorkspaceId = Number(seed?.workspace_id) > 0 ? Number(seed.workspace_id) : 1;
  const resolvedCookieInfo = await resolveNewbornRawCookie(sql, process.env, { workspaceId: seedWorkspaceId }).catch(() => ({ rawCookie: '' }));
  const { headers: baseHeaders, guestHeaders, usedAuthCookie } = buildZoneARelatedModulesHeaders({
    pinId,
    rawCookie: resolvedCookieInfo?.rawCookie || ''
  });
  console.log(`[*] RelatedModulesResource Routing (ws=${seedWorkspaceId}): ${usedAuthCookie ? 'Zone-A Authenticated (_auth=1)' : 'Guest Fallback (Zero-Cookie)'}`);

  for (let page = 1; page <= maxPages; page++) {
    console.log(`[*] [Page ${page}/${maxPages}] Requesting RelatedModulesResource...`);

    const optionsObj = {
      pin_id: pinId,
      additional_fields: ["pin.gen_ai_topics"],
      context_pin_ids: [],
      context_near_dup_image_sigs: [],
      homefeed_source_sig: null,
      page_size: 12,
      search_query: "",
      source: "deep_linking",
      top_level_source: "deep_linking",
      top_level_source_depth: 1,
      is_pdp: false,
      client_tracking_params: "CwABAAAAEDE0ODExNTU0MzQxNjE4ODgLAAcAAAAPdW5rbm93bi91bmtub3duAA"
    };
    if (bookmark) {
      optionsObj.bookmarks = [bookmark];
    }

    const dataParam = JSON.stringify({
      options: optionsObj,
      context: {}
    });

    const targetUrl = `https://www.pinterest.com/resource/RelatedModulesResource/get/?source_url=${encodeURIComponent(`/pin/${pinId}/`)}&data=${encodeURIComponent(dataParam)}`;

    let responseData;
    try {
      responseData = await fetchWithRetry(targetUrl, baseHeaders);
    } catch (err) {
      console.error(`[-] Failed to fetch page ${page} for seed ${pinId}: ${redactSecrets(err?.message || String(err))}`);
      break;
    }

    const resourceResponse = responseData?.resource_response || responseData;
    const items = resourceResponse?.data || [];
    const nextBookmark = resourceResponse?.bookmark;
    const bookmarkDisplay = nextBookmark
      ? `${nextBookmark.slice(0, 10)}...${nextBookmark.slice(-10)} (len: ${nextBookmark.length})`
      : 'none';

    console.log(`[+] [Page ${page}] Received ${items.length} raw entities. Next bookmark: ${bookmarkDisplay}`);

    if (items.length === 0) {
      console.log(`[*] No more items returned on page ${page}. Terminating crawl.`);
      break;
    }

    // Inspect aux_fields for candidate counts and utility config
    for (const item of items) {
      if (!authoritativeCandidateCounts && item?.aux_fields?.candidate_counts) {
        try {
          const rawCounts = typeof item.aux_fields.candidate_counts === 'string'
            ? JSON.parse(item.aux_fields.candidate_counts)
            : item.aux_fields.candidate_counts;

          const twoTowerBase = Number(rawCounts["P2P_TWO_TOWER_EMBEDDING_CAND"] || 0);
          const plpCand = Number(rawCounts["P2P_TWO_TOWER_PLP_CORPUS_CAND"] || 0);
          const midFunnelFresh = Number(rawCounts["P2P_TWO_TOWER_MID_FUNNEL_FRESH_EMBEDDING_CAND"] || 0);
          const p2bFresh = Number(rawCounts["P2P_P2B2P_FRESH"] || 0);

          authoritativeCandidateCounts = {
            navboost_count: Number(rawCounts["P2P_NAVBOOST_CAND"] || 0),
            recgpt_count: Number(rawCounts["P2P_RECGPT"] || 0),
            randomwalk_count: Number(rawCounts["P2P_RANDOMWALK_CAND"] || 0),
            two_tower_count: twoTowerBase + plpCand,
            fresh_candidate_count: p2bFresh > 0 ? p2bFresh : midFunnelFresh
          };
          console.log(`[+] Authoritative Page ${page} candidate counts locked directly from Pinterest:`, authoritativeCandidateCounts);
        } catch (err) {
          console.warn('[Telemetry] Error parsing candidate counts:', err.message);
        }
      }
      if (item?.aux_fields?.utility_config?.weights && !utilitySnapshot) {
        utilitySnapshot = item.aux_fields.utility_config.weights;
        console.log(`[+] Captured prod:v18 utility weights snapshot.`);
      }

      // Capture Pinterest Guided Search Capsules (explorearticle / BUBBLE_ONE_COL) with cover images & search queries
      const inspectAndCaptureCapsule = (obj) => {
        if (!obj || typeof obj !== 'object') return;

        const hasExploreSignal = (
          obj.type === 'explorearticle' ||
          obj.story_type === 'BUBBLE_ONE_COL' ||
          obj.story_type === 'explore_article' ||
          obj.story_type === 'guide' ||
          Boolean(obj.cover_images && (obj.title?.format || obj.title)) ||
          Boolean(obj.cover_image && (obj.title?.format || obj.title)) ||
          Boolean(obj.node_id && String(obj.node_id).startsWith('RXhwbG9yZUFydGljbGU'))
        );

        if (hasExploreSignal) {
          const qTerm = cleanString(obj.title) || cleanString(obj.copy?.title) || cleanString(obj.query) || cleanString(obj.label);

          if (qTerm && !['more to explore', 'related pins', 'ideas', 'explore', 'explore ideas'].includes(qTerm.toLowerCase())) {
            guidedSearchBubbles.add(qTerm);

            const imgUrl = cleanString(
              obj.cover_images?.[0]?.['750x']?.url ||
              obj.cover_images?.[0]?.url ||
              obj.cover_image?.['750x']?.url ||
              obj.cover_image?.url ||
              obj.images?.['750x']?.url ||
              obj.images?.['474x']?.url ||
              obj.images?.orig?.url ||
              obj.image_large_url ||
              obj.image_medium_url ||
              obj.image_url ||
              ''
            );

            const searchUrl = cleanString(obj.link || obj.action_link || obj.url) || `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(qTerm)}`;
            const nodeId = cleanString(obj.node_id || obj.id || '');
            const normalized = qTerm.toLowerCase().trim();

            if (!guidedSearchCapsulesMap.has(normalized)) {
              console.log(`[+] Captured Guided Search Capsule: "${qTerm}"`);
              guidedSearchCapsulesMap.set(normalized, {
                seed_pin_id: pinId,
                query_term: qTerm,
                normalized_query: normalized,
                image_url: imgUrl,
                search_url: searchUrl,
                node_id: nodeId
              });
            }
          }
        }

        // Recursively inspect any nested containers
        if (Array.isArray(obj.objects)) {
          for (const sub of obj.objects) inspectAndCaptureCapsule(sub);
        }
        if (Array.isArray(obj.items)) {
          for (const sub of obj.items) inspectAndCaptureCapsule(sub);
        }
        if (Array.isArray(obj.bubbles)) {
          for (const sub of obj.bubbles) inspectAndCaptureCapsule(sub);
        }
        if (Array.isArray(obj.expanded_viewport_objects)) {
          for (const sub of obj.expanded_viewport_objects) inspectAndCaptureCapsule(sub);
        }
      };

      inspectAndCaptureCapsule(item);

      // Extract all nested or direct pins
      const pinsToProcess = extractPinsFromEntity(item);

      for (const pinObj of pinsToProcess) {
        const rawTitle = pinObj.title || pinObj.grid_title || pinObj.auto_alt_text || '';
        const rawDomain = pinObj.domain || pinObj.link_domain?.id || '';
        const rawDesc = typeof pinObj.description === 'string' ? pinObj.description : '';
        if ((seedClusterType === 'BAKERY_DESSERT' || seedClusterType === 'CULINARY') && !isCulinaryCandidate(rawTitle, rawDomain, rawDesc)) {
          continue;
        }

        const parsed = parsePinCandidate(pinObj, pinId, item, utilitySnapshot, seedClusterType);
        if (parsed && !candidatesMap.has(parsed.candidate_pin_id)) {
          candidatesMap.set(parsed.candidate_pin_id, parsed);
        }
      }
    }

    if (!nextBookmark || nextBookmark === '-end-' || nextBookmark === bookmark) {
      console.log(`[*] Reached end of pagination stream for seed ${pinId}.`);
      break;
    }

    bookmark = nextBookmark;
  }

  const allCandidates = Array.from(candidatesMap.values());
  const totalCandidates = allCandidates.length;

  // Zero-Candidates Safeguard: Prevent wiping existing metrics or prematurely marking crawl as done if upstream fails
  if (totalCandidates === 0) {
    console.warn(`[!] Warning: Zero candidates harvested for seed ${pinId} (check network connectivity or seed validity). Preserving existing database metrics and crawl state.`);
    return { totalCandidates: 0, candidates: [] };
  }

  // Strict Upstream Quota Preservation: If Pinterest delivered candidate_counts, preserve them 100% as ground truth!
  const hasAuthoritativeCounts = Boolean(
    authoritativeCandidateCounts &&
    (authoritativeCandidateCounts.navboost_count > 0 ||
     authoritativeCandidateCounts.recgpt_count > 0 ||
     authoritativeCandidateCounts.two_tower_count > 0)
  );

  if (hasAuthoritativeCounts) {
    // If live response omitted P2P_RECGPT (e.g. unauthenticated request), preserve previous authenticated RecGPT
    if (authoritativeCandidateCounts.recgpt_count === 0) {
      try {
        const prevRecgpt = await sql`
          SELECT recgpt_count
          FROM cluster_arbitrage_metrics
          WHERE seed_pin_id = ${pinId} AND recgpt_count > 0
          ORDER BY analyzed_at DESC
          LIMIT 1;
        `;
        if (prevRecgpt.length > 0 && prevRecgpt[0].recgpt_count > 0) {
          authoritativeCandidateCounts.recgpt_count = Number(prevRecgpt[0].recgpt_count);
          console.log(`[+] Preserved authenticated RecGPT quota (${authoritativeCandidateCounts.recgpt_count}) to prevent anonymous zeroing.`);
        }
      } catch (e) {}
    }
    console.log(`[+] Preserving exact upstream Pinterest retrieval quotas for seed ${pinId}:`, authoritativeCandidateCounts);
  } else {
    // Only engage fallback if upstream did not supply candidate_counts for this crawl run
    try {
      const prevMetrics = await sql`
        SELECT recgpt_count, navboost_count, randomwalk_count, two_tower_count, fresh_candidate_count
        FROM cluster_arbitrage_metrics
        WHERE seed_pin_id = ${pinId} AND (recgpt_count > 0 OR navboost_count > 0)
        ORDER BY analyzed_at DESC
        LIMIT 1;
      `;
      if (prevMetrics.length > 0) {
        authoritativeCandidateCounts = {
          navboost_count: Number(prevMetrics[0].navboost_count || 0),
          recgpt_count: Number(prevMetrics[0].recgpt_count || 0),
          randomwalk_count: Number(prevMetrics[0].randomwalk_count || 0),
          two_tower_count: Number(prevMetrics[0].two_tower_count || 0),
          fresh_candidate_count: Number(prevMetrics[0].fresh_candidate_count || 0)
        };
        console.log(`[+] Restored previous authoritative quota baseline for seed ${pinId}:`, authoritativeCandidateCounts);
      } else {
        // Derive dynamic baseline from harvested graph nodes when no prior history exists
        authoritativeCandidateCounts = {
          navboost_count: allCandidates.filter(c => c.provenance_engine === 'P2P_NAVBOOST').length,
          recgpt_count: allCandidates.filter(c => c.provenance_engine === 'P2P_RECGPT' || c.is_recgpt_candidate).length,
          randomwalk_count: allCandidates.filter(c => c.provenance_engine === 'P2P_RANDOMWALK').length,
          two_tower_count: allCandidates.filter(c => c.provenance_engine === 'P2P_TWO_TOWER').length,
          fresh_candidate_count: allCandidates.filter(c => c.provenance_engine === 'FRESH_COLD_START').length
        };
        console.log(`[+] Seed ${pinId} has no upstream aux_fields; derived from harvested candidates:`, authoritativeCandidateCounts);
      }
    } catch (e) {
      console.warn(`[!] Quota fallback check encountered non-fatal error: ${e.message}`);
      authoritativeCandidateCounts = {
        recgpt_count: 0,
        navboost_count: 0,
        randomwalk_count: 0,
        two_tower_count: 0,
        fresh_candidate_count: 0
      };
    }
  }

  const productCount = allCandidates.filter((c) => c.is_product).length;
  const commercialGapRatio = totalCandidates > 0
    ? Number((((totalCandidates - productCount) / totalCandidates) * 100).toFixed(2))
    : 100.00;

  const centroids = computeColorCentroids(allCandidates);
  const highSaveTokens = computeHighSaveTokens(allCandidates);

  console.log(`\n---------------- Cluster Synthesis ----------------`);
  console.log(`Total Graph Candidates: ${totalCandidates}`);
  console.log(`Products Detected:      ${productCount}`);
  console.log(`Commercial Gap Ratio:   ${commercialGapRatio}% ${commercialGapRatio === 100 ? '🔥 (GOLDEN OPPORTUNITY - 0% PRODUCTS)' : ''}`);
  console.log(`Top Winning Colors:     ${centroids.slice(0, 3).map((c) => `${c.color} (${c.percentage}%)`).join(', ')}`);
  console.log(`Top Save Tokens:        ${highSaveTokens.slice(0, 5).map((t) => `${t.token} (score: ${t.weighted_score})`).join(', ')}`);
  if (guidedSearchBubbles.size > 0) {
    console.log(`Guided Search Bubbles:  ${Array.from(guidedSearchBubbles).slice(0, 8).join(' • ')}`);
  }
  console.log(`---------------------------------------------------\n`);

  // Persistence to Unified PostgreSQL via Shared Non-Destructive Deep Graph Writer
  if (allCandidates.length > 0) {
    console.log(`[*] Upserting ${allCandidates.length} candidate graph nodes into Unified PostgreSQL (deterministically sorted deep merge)...`);
    await upsertCandidateGraphEdges(sql, allCandidates, {
      mode: 'deep',
      chunkSize: 50,
      defaultSeedPinId: pinId,
      queryWrapper: sqlWithRetry
    });
    console.log(`[+] Successfully stored candidate nodes in Unified PostgreSQL.`);

    // Phase 2: Automated Deep Metrics Enrichment via PinResource (Strict Zero-Cookie Zone 2)
    console.log(`[*] Initiating automated deep metrics enrichment for candidate nodes...`);
    await enrichCandidatesWithPinMetrics(pinId, guestHeaders);
  }

  // Recompute highSaveTokens with authentic post-enrichment saves [NEW-09]
  let activeHighSaveTokens = highSaveTokens;
  try {
    const freshCandidates = await sql`
      SELECT title, ocr_text, saves, repins, save_rate, daily_velocity
      FROM candidate_graph_nodes
      WHERE seed_pin_id = ${pinId}
    `;
    if (freshCandidates && freshCandidates.length > 0) {
      activeHighSaveTokens = computeHighSaveTokens(freshCandidates);
    }
  } catch (_) {}

  // Insert macro cluster metrics snapshot
  console.log(`[*] Recording cluster arbitrage metrics snapshot...`);
  const candidatePoolTotal = (authoritativeCandidateCounts && (
    authoritativeCandidateCounts.recgpt_count +
    authoritativeCandidateCounts.navboost_count +
    authoritativeCandidateCounts.randomwalk_count +
    authoritativeCandidateCounts.two_tower_count +
    authoritativeCandidateCounts.fresh_candidate_count
  )) || totalCandidates;

  // Non-idempotent snapshot INSERT: execute once without retry to prevent duplicate metric rows
  await noRetrySql`
    INSERT INTO cluster_arbitrage_metrics (
      seed_pin_id, total_candidates, recgpt_count, navboost_count,
      randomwalk_count, two_tower_count, fresh_candidate_count, product_count,
      commercial_gap_ratio, winning_color_centroids, high_save_tokens,
      utility_snapshot, analyzed_at
    ) VALUES (
      ${pinId},
      ${candidatePoolTotal},
      ${authoritativeCandidateCounts.recgpt_count},
      ${authoritativeCandidateCounts.navboost_count},
      ${authoritativeCandidateCounts.randomwalk_count},
      ${authoritativeCandidateCounts.two_tower_count},
      ${authoritativeCandidateCounts.fresh_candidate_count},
      ${productCount},
      ${commercialGapRatio},
      ${JSON.stringify(centroids)},
      ${JSON.stringify(activeHighSaveTokens)},
      ${utilitySnapshot ? JSON.stringify(utilitySnapshot) : null},
      NOW()
    );
  `;

  await sqlWithRetry(() => pruneClusterArbitrageMetrics(sql, pinId, 90));

  // Persist all captured Pinterest Guided Search Capsules into Unified PostgreSQL in chunks via bulk jsonb_to_recordset
  const allCapsules = Array.from(guidedSearchCapsulesMap.values());
  if (allCapsules.length > 0) {
    allCapsules.sort((a, b) => String(a.normalized_query).localeCompare(String(b.normalized_query)));
    console.log(`[*] Persisting ${allCapsules.length} guided search capsules into Unified PostgreSQL (bulk jsonb_to_recordset)...`);
    const capChunkSize = 50;
    for (let i = 0; i < allCapsules.length; i += capChunkSize) {
      const chunk = allCapsules.slice(i, i + capChunkSize);
      const capPayload = JSON.stringify(chunk.map((cap) => ({
        seed_pin_id: String(cap.seed_pin_id || pinId),
        query_term: String(cap.query_term || ''),
        normalized_query: String(cap.normalized_query || ''),
        image_url: cap.image_url || '',
        search_url: cap.search_url || '',
        node_id: cap.node_id || ''
      })));

      await sqlWithRetry(() => sql`
        INSERT INTO seed_guided_search_capsules (
          seed_pin_id, query_term, normalized_query, image_url, search_url, node_id, discovered_at
        )
        SELECT
          x.seed_pin_id, x.query_term, x.normalized_query, x.image_url, x.search_url, x.node_id, NOW()
        FROM (
          SELECT *
          FROM jsonb_to_recordset(${capPayload}::jsonb) AS raw(
            seed_pin_id text,
            query_term text,
            normalized_query text,
            image_url text,
            search_url text,
            node_id text
          )
          ORDER BY raw.normalized_query ASC
        ) x
        ON CONFLICT (seed_pin_id, normalized_query) DO UPDATE
        SET image_url = EXCLUDED.image_url, search_url = EXCLUDED.search_url, node_id = EXCLUDED.node_id;
      `);
    }
    console.log(`[+] Successfully stored ${allCapsules.length} guided search capsules in Unified PostgreSQL.`);
  }

  // Update last_crawled_at on cluster_seeds
  await sqlWithRetry(() => sql`
    UPDATE cluster_seeds
    SET last_crawled_at = NOW()
    WHERE pin_id = ${pinId};
  `);

  console.log(`[+] Seed ${pinId} cluster intelligence pipeline completed successfully.`);
  return { totalCandidates, candidates: allCandidates };
}

/**
 * V4 Wave 4: Merges workspace default `pin_graph_rules` with optional per-campaign
 * overrides (`keyword_folders.pin_graph_rules`), preserving `auto_trigger_enabled = false`
 * as the strict Zero Auto-Promote default.
 */
export function mergeCampaignPinGraphRules(workspaceRules = {}, folderRules = {}) {
  const ws = (workspaceRules && typeof workspaceRules === 'object' && !Array.isArray(workspaceRules)) ? workspaceRules : {};
  const fl = (folderRules && typeof folderRules === 'object' && !Array.isArray(folderRules)) ? folderRules : {};
  const clamp = (val, fallback, min, max) => {
    const n = Number(val);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.round(n)));
  };
  return {
    auto_trigger_enabled: typeof fl.auto_trigger_enabled === 'boolean'
      ? fl.auto_trigger_enabled
      : (typeof ws.auto_trigger_enabled === 'boolean' ? ws.auto_trigger_enabled : false),
    linkless_only: typeof fl.linkless_only === 'boolean'
      ? fl.linkless_only
      : (typeof ws.linkless_only === 'boolean' ? ws.linkless_only : false),
    min_repins: clamp(fl.min_repins ?? ws.min_repins, 500, 0, 1000000),
    max_pages: clamp(fl.max_pages ?? ws.max_pages, 20, 1, 100)
  };
}

/**
 * V4 Wave 4: Pure rule evaluator for Pin Graph candidates (`min_repins` + `linkless_only`).
 */
export function evaluatePinGraphCandidateRules(candidate, rules = {}) {
  if (!candidate || !candidate.candidate_pin_id && !candidate.pin_id) return false;
  const minRepins = Math.max(0, Number(rules?.min_repins ?? 0) || 0);
  const repins = Number(candidate.repins ?? candidate.repin_count ?? 0) || 0;
  if (minRepins > 0 && repins < minRepins) return false;

  if (rules?.linkless_only === true) {
    const dest = String(candidate.destination_url || '').trim();
    const dom = String(candidate.clean_domain || candidate.domain || '').trim();
    if (dest.length > 0 || dom.length > 0) return false;
  }
  return true;
}

/**
 * V4 Wave 4: Fetches queued `campaign_pin_graph_seeds` merged with workspace & campaign
 * `pin_graph_rules`, shard-partitioned across the 20-runner matrix (`42P01`/`42703` safe).
 */
export async function fetchQueuedCampaignPinGraphSeeds(dbSql, { shardIdx = null, shardTotal = 20, limit = 100, pinIds = null } = {}) {
  if (!dbSql || typeof dbSql !== 'function') return [];
  const effectiveShardTot = Math.max(1, Number(shardTotal) || 20);
  const safeLimit = Math.max(1, Math.min(500, Number(limit) || 100));
  const cleanPinIds = Array.isArray(pinIds) && pinIds.length > 0
    ? pinIds.map((id) => String(id || '').trim()).filter(Boolean)
    : null;
  try {
    const rows = await dbSql`
      SELECT
        cpgs.folder_id,
        COALESCE(cpgs.workspace_id, kf.workspace_id, 1)::int AS workspace_id,
        cpgs.seed_pin_id AS pin_id,
        cpgs.source_type,
        cpgs.status,
        cpgs.last_crawled_at,
        kf.name AS folder_name,
        kf.pin_graph_rules AS folder_pin_graph_rules,
        ws.pin_graph_rules AS workspace_pin_graph_rules
      FROM campaign_pin_graph_seeds cpgs
      JOIN keyword_folders kf ON kf.id = cpgs.folder_id
      LEFT JOIN workspace_settings ws ON ws.workspace_id = COALESCE(cpgs.workspace_id, kf.workspace_id, 1)
      WHERE cpgs.status = 'queued'
        AND LOWER(COALESCE(kf.metadata->>'status', 'active')) NOT IN ('paused', 'archived')
        AND LOWER(COALESCE(kf.metadata->>'pause_crawlers', 'false')) <> 'true'
        AND LOWER(COALESCE(kf.metadata->>'is_crawler_paused', 'false')) <> 'true'
        AND (${cleanPinIds}::text[] IS NULL OR cpgs.seed_pin_id = ANY(${cleanPinIds}::text[]))
        AND (${shardIdx}::int IS NULL OR (ABS(hashtext(cpgs.seed_pin_id::text)::bigint) % ${effectiveShardTot}::int) = ${shardIdx}::int)
      ORDER BY cpgs.created_at ASC, cpgs.seed_pin_id ASC
      LIMIT ${safeLimit};
    `;
    return (rows || []).map((r) => ({
      folder_id: Number(r.folder_id),
      workspace_id: Number(r.workspace_id) || 1,
      pin_id: String(r.pin_id),
      label: r.folder_name ? `Campaign: ${r.folder_name}` : 'Campaign Pin Graph Seed',
      source_type: String(r.source_type || 'manual'),
      status: String(r.status || 'queued'),
      last_crawled_at: r.last_crawled_at || null,
      is_campaign_seed: true,
      pin_graph_rules: mergeCampaignPinGraphRules(r.workspace_pin_graph_rules, r.folder_pin_graph_rules)
    }));
  } catch (err) {
    const code = String(err?.code || '');
    if (code === '42P01' || code === '42703') {
      return [];
    }
    throw err;
  }
}

/**
 * V4 Wave 4: Updates `campaign_pin_graph_seeds.status` strictly within Migration 012's
 * CHECK constraint (`'queued' | 'crawled' | 'failed'`).
 */
export async function markCampaignPinGraphSeedStatus(dbSql, { folderId, seedPinId, status = 'crawled' } = {}) {
  const fid = Number(folderId);
  const pid = String(seedPinId || '').trim();
  const safeStatus = ['queued', 'crawled', 'failed'].includes(String(status)) ? String(status) : 'failed';
  if (!dbSql || typeof dbSql !== 'function' || !fid || !pid) return false;
  try {
    await dbSql`
      UPDATE campaign_pin_graph_seeds
      SET status = ${safeStatus},
          last_crawled_at = NOW()
      WHERE folder_id = ${fid}
        AND seed_pin_id = ${pid};
    `;
    return true;
  } catch (err) {
    if (String(err?.code || '') === '42P01') return false;
    throw err;
  }
}

/**
 * V4 Wave 4: Conditionally records qualifying Related Pins into `campaign_tracked_pins`
 * (`source_type = 'related'`) ONLY when `rules.auto_trigger_enabled === true`.
 * Preserves Zero Auto-Promote whenever `auto_trigger_enabled` is false.
 */
export async function recordCampaignRelatedPins(dbSql, {
  folderId,
  workspaceId = 1,
  seedPinId,
  candidates = [],
  rules = {}
} = {}) {
  const fid = Number(folderId);
  const wid = Number(workspaceId) || 1;
  const seedId = String(seedPinId || '').trim();
  if (!dbSql || typeof dbSql !== 'function' || !fid || !seedId) {
    return { tracked: 0, skippedReason: 'invalid_args' };
  }
  const merged = mergeCampaignPinGraphRules({}, rules);
  if (merged.auto_trigger_enabled !== true) {
    return { tracked: 0, skippedReason: 'auto_trigger_disabled' };
  }
  const matchingIds = Array.from(new Set(
    (Array.isArray(candidates) ? candidates : [])
      .filter((c) => evaluatePinGraphCandidateRules(c, merged))
      .map((c) => String(c.candidate_pin_id || c.pin_id || '').trim())
      .filter((id) => /^\d{10,30}$/.test(id) && id !== seedId)
  )).sort();

  if (matchingIds.length === 0) {
    return { tracked: 0, skippedReason: 'no_matching_candidates' };
  }

  const sourceRef = `seed:${seedId}`;
  try {
    const inserted = await dbSql`
      INSERT INTO campaign_tracked_pins (folder_id, workspace_id, pin_id, source_type, source_ref, is_active, added_at)
      SELECT ${fid}, ${wid}, unnest(${matchingIds}::varchar[]), 'related', ${sourceRef}, TRUE, NOW()
      ON CONFLICT (folder_id, pin_id, source_type) DO UPDATE SET
        is_active = TRUE,
        source_ref = EXCLUDED.source_ref
      RETURNING pin_id;
    `;
    return { tracked: Array.isArray(inserted) ? inserted.length : 0, skippedReason: null };
  } catch (err) {
    if (String(err?.code || '') === '42P01') {
      return { tracked: 0, skippedReason: 'table_missing' };
    }
    throw err;
  }
}

/**
 * Bounds cluster_arbitrage_metrics to the newest `keepLimit` snapshots per seed_pin_id.
 */
export async function pruneClusterArbitrageMetrics(dbSql, seedPinId, keepLimit = 90) {
  const limit = Math.max(1, Number(keepLimit) || 90);
  const cleanSeedId = String(seedPinId || '').trim();
  if (!cleanSeedId) return;

  await dbSql`
    DELETE FROM cluster_arbitrage_metrics
    WHERE seed_pin_id = ${cleanSeedId}
      AND id NOT IN (
        SELECT id
        FROM cluster_arbitrage_metrics
        WHERE seed_pin_id = ${cleanSeedId}
        ORDER BY analyzed_at DESC NULLS LAST, id DESC
        LIMIT ${limit}
      );
  `;
}

/**
 * Main Orchestrator
 */
async function main() {
  console.log(`=============================================================`);
  console.log(`  Pinterest Algorithmic Arbitrage Engine (P2P Cluster Core)  `);
  console.log(`=============================================================`);

  // Validate database handle early inside lifecycle try/finally
  getSql();

  let targetPinArg = null;
  const seedIdx = process.argv.indexOf('--seed');
  if (seedIdx !== -1 && process.argv[seedIdx + 1]) {
    targetPinArg = process.argv[seedIdx + 1];
  } else if (process.argv[2] && !process.argv[2].startsWith('--')) {
    targetPinArg = process.argv[2];
  } else {
    targetPinArg = process.env.TARGET_PIN_ID;
  }

  let seedsToProcess = [];

  // 🚀 Matrix Sharding (WWW 2018 Distributed Crawler Architecture — 20 Shards)
  const shardNumberRaw = process.env.SHARD_NUMBER;
  const shardIndexRaw = process.env.SHARD_INDEX;
  const shardTotalRaw = process.env.SHARD_TOTAL;
  let shardIdx = null;
  let shardTot = null;

  if (shardNumberRaw !== undefined && shardNumberRaw !== '') {
    const parsedNum = parseInt(shardNumberRaw, 10);
    if (!isNaN(parsedNum) && parsedNum > 0) {
      shardIdx = parsedNum - 1; // Convert 1-indexed to 0-indexed
    }
  } else if (shardIndexRaw !== undefined && shardIndexRaw !== '') {
    const parsedIdx = parseInt(shardIndexRaw, 10);
    if (!isNaN(parsedIdx) && parsedIdx >= 0) {
      shardIdx = parsedIdx;
    }
  } else if (process.env.WORKER_INDEX !== undefined && process.env.WORKER_INDEX !== '') {
    const parsedWorker = parseInt(process.env.WORKER_INDEX, 10);
    if (!isNaN(parsedWorker) && parsedWorker >= 0) {
      shardIdx = parsedWorker;
    }
  }

  if (shardTotalRaw !== undefined && shardTotalRaw !== '') {
    shardTot = parseInt(shardTotalRaw, 10);
  } else if (process.env.WORKER_TOTAL !== undefined && process.env.WORKER_TOTAL !== '') {
    shardTot = parseInt(process.env.WORKER_TOTAL, 10);
  }

  const rawIdsAll = (targetPinArg && targetPinArg !== 'undefined')
    ? [...new Set(
        String(targetPinArg)
          .split(',')
          .map(s => {
            const m = String(s).match(/\d{10,25}/);
            return m ? m[0] : s.trim();
          })
          .filter(id => /^\d{10,25}$/.test(id))
      )]
    : [];

  let rawIds = rawIdsAll;
  if (rawIdsAll.length > 0 && shardIdx !== null) {
    const effectiveTotal = (shardTot && shardTot > 0) ? shardTot : 20;
    rawIds = rawIdsAll.filter((_, idx) => (idx % effectiveTotal) === shardIdx);
    if (rawIds.length === 0) {
      console.log(`[+] Target pin override (${rawIdsAll.length} seed(s)) assigned to other runners; runner ${shardIdx + 1}/${effectiveTotal} exiting cleanly.`);
      return;
    }
  }

  if (rawIds.length > 0) {
    console.log(`[*] Target pin(s) override specified (${rawIds.length}): ${rawIds.join(', ')}`);

    // Concurrent idempotent seed registration in resilient chunks of 25
    const chunkSize = 25;
    for (let i = 0; i < rawIds.length; i += chunkSize) {
      const chunk = rawIds.slice(i, i + chunkSize);
      await Promise.all(chunk.map(cleanId => sqlWithRetry(() => sql`
        INSERT INTO cluster_seeds (pin_id, label, is_competitor, velocity)
        VALUES (${cleanId}, 'Target Pin Override', false, 0)
        ON CONFLICT (pin_id) DO NOTHING;
      `)));
    }

    const existing = await sqlWithRetry(() => sql`
      SELECT pin_id, label, is_competitor, velocity, last_crawled_at
      FROM cluster_seeds
      WHERE pin_id = ANY(${rawIds});
    `);

    // Strictly deterministic order matching rawIds across all shards
    const existingMap = new Map((existing || []).map(s => [String(s.pin_id), s]));
    const matchedCampaignSeeds = await fetchQueuedCampaignPinGraphSeeds(sql, {
      pinIds: rawIds,
      limit: Math.min(500, Math.max(20, rawIds.length * 5))
    }).catch((err) => {
      console.warn(`[!] Warning loading campaign_pin_graph_seeds for TARGET_PIN_ID override:`, redactSecrets(err?.message || String(err)));
      return [];
    });
    const campaignLinksByPin = new Map();
    for (const cs of matchedCampaignSeeds) {
      const list = campaignLinksByPin.get(cs.pin_id) || [];
      list.push(cs);
      campaignLinksByPin.set(cs.pin_id, list);
    }
    seedsToProcess = rawIds.map(id => {
      const baseSeed = existingMap.get(id) || {
        pin_id: id,
        label: 'Target Pin Override',
        is_competitor: false,
        velocity: 0,
        last_crawled_at: null
      };
      const links = campaignLinksByPin.get(String(id)) || [];
      return links.length > 0
        ? {
            ...baseSeed,
            workspace_id: baseSeed.workspace_id || links[0].workspace_id,
            pin_graph_rules: baseSeed.pin_graph_rules || links[0].pin_graph_rules,
            campaign_links: links
          }
        : baseSeed;
    });
  } else {
    const effectiveShardTot = (shardTot !== null && !isNaN(shardTot) && shardTot > 0) ? shardTot : 20;
    console.log(`[*] Querying seeds needing crawl (last_crawled_at IS NULL or > 24h old)...`);
    seedsToProcess = await sqlWithRetry(() => sql`
      SELECT pin_id, label, is_competitor, velocity, last_crawled_at
      FROM cluster_seeds
      WHERE (last_crawled_at IS NULL OR last_crawled_at < NOW() - INTERVAL '24 HOURS')
        AND (crawl_lease_until IS NULL OR crawl_lease_until < NOW())
        AND (${shardIdx}::int IS NULL OR (ABS(hashtext(pin_id::text)::bigint) % ${effectiveShardTot}::int) = ${shardIdx}::int)
      ORDER BY last_crawled_at ASC NULLS FIRST, pin_id ASC
      LIMIT 100;
    `);

    const campaignSeeds = await fetchQueuedCampaignPinGraphSeeds(sql, {
      shardIdx,
      shardTotal: effectiveShardTot,
      limit: 100
    }).catch((err) => {
      console.warn(`[!] Warning loading campaign_pin_graph_seeds:`, err?.message || err);
      return [];
    });

    if (campaignSeeds.length > 0) {
      const existingByPin = new Map(seedsToProcess.map((s) => [String(s.pin_id), s]));
      for (const cs of campaignSeeds) {
        await sqlWithRetry(() => sql`
          INSERT INTO cluster_seeds (pin_id, label, is_competitor, velocity)
          VALUES (${cs.pin_id}, ${cs.label}, false, 0)
          ON CONFLICT (pin_id) DO NOTHING;
        `).catch(() => {});
        const existingSeed = existingByPin.get(cs.pin_id);
        if (existingSeed) {
          existingSeed.campaign_links = [...(existingSeed.campaign_links || []), cs];
          existingSeed.workspace_id = existingSeed.workspace_id || cs.workspace_id;
          existingSeed.pin_graph_rules = existingSeed.pin_graph_rules || cs.pin_graph_rules;
        } else {
          const wrapped = { ...cs, campaign_links: [cs] };
          existingByPin.set(cs.pin_id, wrapped);
          seedsToProcess.push(wrapped);
        }
      }
      console.log(`[+] Merged ${campaignSeeds.length} queued V4 campaign_pin_graph_seeds into crawl queue.`);
    }

    if (shardIdx !== null) {
      console.log(`\n===============================================================`);
      console.log(`🚀 [MATRIX SHARDING ACTIVE] Shard ${shardIdx + 1}/${effectiveShardTot}`);
      console.log(`📊 Assigned Seeds: ${seedsToProcess.length} (retrieved via SQL hashtext shard pushdown)`);
      if (seedsToProcess.length > 0) {
        console.log(`🎯 Assigned Target Pin IDs: ${seedsToProcess.map(s => s.pin_id).join(', ')}`);
      }
      console.log(`===============================================================\n`);

      if (seedsToProcess.length === 0) {
        console.log(`[+] Shard ${shardIdx + 1}/${effectiveShardTot}: No seeds assigned to this shard index. Exiting cleanly.`);
        return;
      }
    }
  }

  if (seedsToProcess.length === 0) {
    console.log(`[+] All cluster seeds have fresh crawl timestamps.`);
    // Automated background enrichment sweep for any seeds with un-enriched candidates
    const effectiveShardTot = (shardTot !== null && !isNaN(shardTot) && shardTot > 0) ? shardTot : 20;
    try {
      const seedsNeedingEnrichment = await sqlWithRetry(() => sql`
        SELECT cgn.seed_pin_id 
        FROM candidate_graph_nodes cgn
        INNER JOIN cluster_seeds cs ON cs.pin_id = cgn.seed_pin_id
        WHERE (cgn.repins = 0 OR cgn.repins IS NULL OR cgn.saves IS NULL)
          AND (${shardIdx}::int IS NULL OR (ABS(hashtext(cgn.seed_pin_id::text)::bigint) % ${effectiveShardTot}::int) = ${shardIdx}::int)
        GROUP BY cgn.seed_pin_id
        ORDER BY COUNT(*) DESC, cgn.seed_pin_id ASC;
      `);
      if (seedsNeedingEnrichment.length > 0) {
        const enrichmentSlice = seedsNeedingEnrichment;
        if (enrichmentSlice.length === 0) {
          console.log(`[+] Shard ${shardIdx + 1}/${effectiveShardTot}: No enrichment seeds assigned. Exiting cleanly.`);
          return;
        }
        console.log(`[*] Shard ${shardIdx !== null ? (shardIdx + 1) + '/' + effectiveShardTot : '1/1'}: Discovered ${enrichmentSlice.length} seed(s) with pending deep metrics. Auto-enriching...`);
        const baseHeaders = {
          'accept': 'application/json, text/javascript, */*, q=0.01',
          'accept-language': 'en-US,en;q=0.9',
          'user-agent': CANONICAL_FINGERPRINT.USER_AGENT,
          'x-app-version': CANONICAL_FINGERPRINT.APP_VERSION
        };
        for (const row of enrichmentSlice) {
          await enrichCandidatesWithPinMetrics(row.seed_pin_id, baseHeaders);
        }
      }
    } catch (e) {
      console.warn(`[!] Auto-enrichment sweep error:`, e.message);
    }
    return;
  }

  console.log(`[+] Found ${seedsToProcess.length} seed(s) queued for crawling.`);

  let currentSeedLeaseContext = null;
  const cleanupAndExit = async (signal) => {
    console.log(`\n[!] Received ${signal}. Terminating cluster intelligence gracefully...`);
    try {
      if (currentSeedLeaseContext?.leaseToken && currentSeedLeaseContext?.pinId) {
        await sqlWithRetry(() => sql`
          UPDATE cluster_seeds
          SET crawl_lease_token = NULL,
              crawl_lease_until = NULL
          WHERE pin_id = ${currentSeedLeaseContext.pinId} AND crawl_lease_token = ${currentSeedLeaseContext.leaseToken};
        `).catch(() => {});
        console.log(`[Graceful Shutdown] Released lease for seed pin ID ${currentSeedLeaseContext.pinId}`);
      }
    } catch (_) {
      // Best-effort row lease release
    } finally {
      try {
        if (lease && typeof lease.stop === 'function') {
          await lease.stop();
        }
      } catch (_) {}
      try {
        const sqlToClose = _sql;
        _sql = null;
        if (sqlToClose && typeof sqlToClose.end === 'function') {
          await sqlToClose.end({ timeout: 3 });
        }
      } catch (_) {}
    }
    process.exit(1);
  };
  process.once('SIGINT', () => cleanupAndExit('SIGINT'));
  process.once('SIGTERM', () => cleanupAndExit('SIGTERM'));

  for (const seed of seedsToProcess) {
    // Atomic row lease acquisition with 15-minute expiry & strict Fail-Closed policy [CAP-16]
    let leaseToken = null;
    let heartbeatTimer = null;
    try {
      const [leaseRow] = await sqlWithRetry(() => sql`
        UPDATE cluster_seeds
        SET crawl_lease_token = gen_random_uuid(),
            crawl_lease_until = NOW() + INTERVAL '15 minutes'
        WHERE pin_id = ${seed.pin_id}
          AND (crawl_lease_until IS NULL OR crawl_lease_until < NOW())
        RETURNING crawl_lease_token;
      `);
      leaseToken = leaseRow?.crawl_lease_token || null;
    } catch (lErr) {
      console.warn(`[RowLease] Warning acquiring lease for seed ${seed.pin_id}:`, lErr.message);
      leaseToken = null;
    }

    if (!leaseToken) {
      console.log(`[RowLease] Seed pin ${seed.pin_id} is actively being crawled by a peer worker. Non-blocking skip ✅`);
      continue;
    }

    currentSeedLeaseContext = { pinId: seed.pin_id, leaseToken };
    heartbeatTimer = setInterval(async () => {
      try {
        await sqlWithRetry(() => sql`
          UPDATE cluster_seeds
          SET crawl_lease_until = NOW() + INTERVAL '15 minutes'
          WHERE pin_id = ${seed.pin_id} AND crawl_lease_token = ${leaseToken};
        `).catch(() => {});
      } catch (hbErr) {
        console.warn(`  [Heartbeat] Lease renewal warning for seed ${seed.pin_id}:`, hbErr?.message);
      }
    }, 3 * 60 * 1000);
    if (typeof heartbeatTimer.unref === 'function') heartbeatTimer.unref();

    try {
      const crawlRes = await crawlSeed(seed);
      const campaignLinks = Array.isArray(seed.campaign_links) ? seed.campaign_links : [];
      for (const link of campaignLinks) {
        const nextStatus = (crawlRes && crawlRes.totalCandidates > 0) ? 'crawled' : 'failed';
        await markCampaignPinGraphSeedStatus(sql, {
          folderId: link.folder_id,
          seedPinId: link.pin_id,
          status: nextStatus
        }).catch(() => {});
        if (nextStatus === 'crawled') {
          const trackRes = await recordCampaignRelatedPins(sql, {
            folderId: link.folder_id,
            workspaceId: link.workspace_id,
            seedPinId: link.pin_id,
            candidates: crawlRes.candidates || [],
            rules: link.pin_graph_rules || {}
          }).catch(() => ({ tracked: 0 }));
          if (trackRes.tracked > 0) {
            console.log(`[+] Auto-tracked ${trackRes.tracked} related pin(s) into Campaign #${link.folder_id} (auto_trigger_enabled=true).`);
          }
        }
      }
    } catch (err) {
      console.error(`[-] Error crawling seed ${seed.pin_id}: ${redactSecrets(err?.message || String(err))}`);
      const campaignLinks = Array.isArray(seed.campaign_links) ? seed.campaign_links : [];
      for (const link of campaignLinks) {
        await markCampaignPinGraphSeedStatus(sql, {
          folderId: link.folder_id,
          seedPinId: link.pin_id,
          status: 'failed'
        }).catch(() => {});
      }
    } finally {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      currentSeedLeaseContext = null;
      if (leaseToken) {
        await sqlWithRetry(() => sql`
          UPDATE cluster_seeds
          SET crawl_lease_token = NULL,
              crawl_lease_until = NULL
          WHERE pin_id = ${seed.pin_id} AND crawl_lease_token = ${leaseToken};
        `).catch(() => {});
      }
    }
  }

  console.log(`\n[+] Cluster intelligence run finished.`);
}

/**
 * Executes cluster-intelligence inside a guaranteed try/finally block that always stops
 * the InstaBox activity lease and closes the SQL pool on every exit path.
 */
export async function runClusterIntelligenceLifecycle(runFn = main, options = {}) {
  lease = options.lease || startInstaBoxActivityLease('cluster-intelligence');
  if (options.sqlClient) {
    _sql = options.sqlClient;
  }
  try {
    return await runFn();
  } finally {
    try {
      if (lease && typeof lease.stop === 'function') {
        await lease.stop();
      }
    } catch (_) {}
    try {
      const sqlToClose = _sql;
      _sql = null;
      if (sqlToClose && typeof sqlToClose.end === 'function') {
        await sqlToClose.end({ timeout: 3 });
      }
    } catch (_) {}
  }
}

import { fileURLToPath } from 'url';
const isDirectRun = process.argv[1] && (
  fileURLToPath(import.meta.url) === process.argv[1] ||
  process.argv[1].endsWith('cluster-intelligence.mjs')
);

if (isDirectRun) {
  (async () => {
    try {
      await runClusterIntelligenceLifecycle(main);
    } catch (err) {
      console.error('[-] Fatal orchestrator error:', err);
      process.exitCode = 1;
    }
    if (process.exitCode) {
      process.exit(process.exitCode);
    }
  })();
}
