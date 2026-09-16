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

import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';

// Load .env automatically if available in runtime environment
if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile();
  } catch (err) {
    // Ignore if .env is not present (e.g. CI/CD environment where env vars are passed directly)
  }
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[-] CRITICAL: DATABASE_URL environment variable is missing.');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

// Jitter delay between requests: 2500ms - 4000ms per fail-safe standards
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const jitterDelay = () => 2500 + Math.floor(Math.random() * 1500);

// Comprehensive list of stop words for weighted token scoring
const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'have', 'are', 'was',
  'were', 'will', 'would', 'can', 'could', 'should', 'about', 'into', 'over',
  'after', 'how', 'what', 'when', 'where', 'why', 'who', 'which', 'recipe',
  'recipes', 'best', 'easy', 'make', 'made', 'simple', 'quick', 'delicious',
  'your', 'you', 'our', 'all', 'any', 'each', 'more', 'most', 'just', 'only',
  'very', 'too', 'also', 'than', 'then', 'now', 'here', 'there', 'they',
  'them', 'their', 'she', 'her', 'him', 'his', 'its', 'not', 'nor', 'but',
  'out', 'down', 'off', 'through', 'under', 'between', 'during', 'without',
  'food', 'cook', 'cooking', 'crockpot', 'instant', 'pot', 'slow', 'cooker'
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

/**
 * Clean and format Pinterest cookie to comply with RFC 6265
 * Handles full cookie strings, key-value pairs, or raw _pinterest_sess tokens
 */
export function formatPinterestCookie(rawCookie) {
  if (!rawCookie || typeof rawCookie !== 'string') return '';
  let cookie = rawCookie.trim();
  if (cookie.startsWith('"') && cookie.endsWith('"')) {
    cookie = cookie.slice(1, -1).trim();
  }
  // If user pasted just the raw session token (starts with TWc9, contains Mg==, or lacks '=')
  if (!cookie.includes('=') || cookie.startsWith('TWc9') || cookie.startsWith('Mg==')) {
    return `_pinterest_sess="${cookie}"; _auth=1;`;
  }
  // If user provided a cookie string with '=', ensure _auth=1 is present
  if (!cookie.includes('_auth=')) {
    cookie = `${cookie.replace(/;$/, '')}; _auth=1;`;
  }
  return cookie;
}

/**
 * Fetch with resilience: timeout abort, HTTP 429 backoff, jitter
 */
async function fetchWithRetry(url, headers, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(8000)
      });

      if (response.status === 429) {
        console.warn(`[!] HTTP 429 Rate limited (attempt ${attempt}/${maxRetries}). Sleeping 60 seconds...`);
        await sleep(60000);
        continue;
      }

      if (response.status === 403 || response.status === 401) {
        console.error(`[-] HTTP ${response.status} Forbidden/Unauthorized on attempt ${attempt}: Pinterest blocked guest request. Check PINTEREST_COOKIE in .env.`);
      }

      if (!response.ok) {
        console.warn(`[!] HTTP ${response.status} ${response.statusText} on attempt ${attempt}`);
        if (attempt === maxRetries) {
          throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
        }
        await sleep(3000 * attempt);
        continue;
      }

      return await response.json();
    } catch (err) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        console.warn(`[!] Request timed out (attempt ${attempt}/${maxRetries})`);
      } else {
        console.warn(`[!] Network error on attempt ${attempt}: ${err.message}`);
      }
      if (attempt === maxRetries) {
        throw err;
      }
      await sleep(2500 * attempt);
    }
  }
}

/**
 * Parse candidate counts from aux_fields
 */
function extractCandidateCounts(rawCounts) {
  let counts = {};
  if (typeof rawCounts === 'string') {
    try {
      counts = JSON.parse(rawCounts);
    } catch (e) {
      counts = {};
    }
  } else if (rawCounts && typeof rawCounts === 'object') {
    counts = rawCounts;
  }

  return {
    navboost_count: Number(counts["P2P_NAVBOOST_CAND"] || counts.navboost_count || 0),
    recgpt_count: Number(counts["P2P_RECGPT"] || counts.recgpt_count || 0),
    randomwalk_count: Number(counts["P2P_RANDOMWALK_CAND"] || counts.randomwalk_count || 0),
    two_tower_count: Number(counts["P2P_TWO_TOWER_EMBEDDING_CAND"] || counts.two_tower_count || 0),
    fresh_candidate_count: Number(counts["P2P_TWO_TOWER_MID_FUNNEL_FRESH_EMBEDDING_CAND"] || counts.fresh_candidate_count || 0),
    shopping_corpus_count: Number(counts["P2P_TWO_TOWER_SHOPPING_CORPUS_CAND"] || counts.PLP_CORPUS || counts.shopping_corpus_count || 0)
  };
}

/**
 * Detect true engine provenance using upstream signals and MultiBiSage multi-graph interactions
 */
function detectEngineProvenance(pin, parentEntity, saves = 0, saveRate = 0, dailyVelocity = 0, ageDays = 180, isRecgptCandidate = false, recgptTransitionScore = 0) {
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

  // MultiBiSage & TransAct V2 interaction-derived provenance:
  // 1. Explicit merchant/shopping corpus tags
  if (pin.is_eligible_for_pdp || (pin.price_value && Number(pin.price_value) > 0) || (Array.isArray(pin.shopping_flags) && pin.shopping_flags.length > 0)) {
    return 'P2P_SHOPPING_CORPUS';
  }
  // 2. Cold-start Fresh exploration (P2B2P / Fresh Two-Tower)
  if (ageDays <= 30 && saves < 50) {
    return 'FRESH_COLD_START';
  }
  // 3. High engagement co-visitation (SearchQuery-Pin-LC / User-Product-LC in MultiBiSage)
  if (saveRate >= 35.0 && dailyVelocity >= 15.0) {
    return 'P2P_NAVBOOST';
  }
  // 4. Sequential session trajectory candidate (RecGPT)
  if (isRecgptCandidate && recgptTransitionScore >= 60.0) {
    return 'P2P_RECGPT';
  }

  // 5. Default dense semantic vector candidate (Two-Tower PinSage/ItemSage)
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
  const titleLower = (title || '').toLowerCase();
  const fullText = `${title || ''} ${description || ''} ${ocrText || ''}`.toLowerCase();

  const isDessertOrBake = /\b(muffin|muffins|cake|cakes|cookie|cookies|brownie|brownies|roll|rolls|cinnamon|pie|pies|tart|bread|cupcake|cupcakes|donut|donuts|pastry|pastries|bake|baking|dessert|sweet|chocolate|caramel|snickerdoodle|pumpkin spice|cheesecake)\b/i.test(fullText);
  const isBeverageOrPairing = /\b(latte|coffee|cider|tea|drink|frosting|glaze|syrup|drizzle|dip|cream cheese|icing)\b/i.test(fullText);
  const isSnackBites = /\b(bites|truffle|truffles|energy bite|snack|crescent|mini|treat|treats|crispie|krispie)\b/i.test(fullText);
  const isSavoryDinner = /\b(chicken|turkey|pork|beef|steak|salmon|cod|meatloaf|dinner|casserole|roast|pasta|meat|soup|stew)\b/i.test(fullText);

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
    cleanString(pin.story_pin_data?.metadata?.pin_title) ||
    cleanString(pin.auto_alt_text) ||
    (typeof pin.description === 'string' ? pin.description.slice(0, 60).trim() : '')
  );

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

  const domain = cleanString(pin.domain) || cleanString(pin.link_domain?.id) || 'Uploaded by user';

  // Strict pre-classification check: reject furniture, apparel, decor, etc.
  if (!isCulinaryCandidate(title, domain, pin.description || '')) {
    return null;
  }

  const dominantColor = cleanString(pin.dominant_color) || '#888888';

  let aspectRatio = 0.560;
  if (pin.story_pin_data?.metadata?.canvas_aspect_ratio) {
    aspectRatio = Number(Number(pin.story_pin_data.metadata.canvas_aspect_ratio).toFixed(3));
  } else if (pin.images?.orig?.width && pin.images?.orig?.height) {
    // Unified standard: width / height (e.g. 1000/1778 = 0.562 for 9:16 portrait)
    aspectRatio = Number((pin.images.orig.width / pin.images.orig.height).toFixed(3));
  }

  const saves = Number(pin.aggregated_pin_data?.aggregated_stats?.saves ?? (pin.repin_count || 0));
  const hasMedia = Boolean(
    pin.images?.orig?.url ||
    pin.images?.['236x']?.url ||
    pin.videos != null ||
    pin.story_pin_data?.pages?.length > 0 ||
    pin.image_large_url ||
    pin.image_medium_url
  );
  if (!hasMedia && saves === 0) {
    return null;
  }
  const repins = Number(pin.repin_count || 0);
  const rawRate = saves > 0 ? ((repins / saves) * 100) : 0;
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
  const dailyVelocity = Number((saves / ageDays).toFixed(2));

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

  const ingestionMethod = cleanString(pin.method) || 'uploaded';

  // Algorithmic RecGPT Trajectory Modeling with Context-Aware Sequence Role
  const sequenceRole = classifySequenceRole(title, pin.description || '', ocrText, seedClusterType);
  let recgptTransitionScore = 0;
  let isRecgptCandidate = false;
  const boundedRate = Math.min(100, Math.max(0, saveRate));

  if (sequenceRole === 'DESSERT_HERO') {
    recgptTransitionScore = Number((boundedRate * 0.95).toFixed(2));
    isRecgptCandidate = true;
  } else if (sequenceRole === 'BEVERAGE_PAIRING') {
    recgptTransitionScore = Number((boundedRate * 0.90).toFixed(2));
    isRecgptCandidate = true;
  } else if (sequenceRole === 'PASTRY_BITES') {
    recgptTransitionScore = Number((boundedRate * 0.88).toFixed(2));
    isRecgptCandidate = true;
  } else if (sequenceRole === 'DINNER_ANCHOR') {
    recgptTransitionScore = Number((boundedRate * 0.90).toFixed(2));
    isRecgptCandidate = true;
  } else if (sequenceRole === 'NAVBOOST_CO_VISITOR') {
    recgptTransitionScore = Number((boundedRate * 0.85).toFixed(2));
    isRecgptCandidate = true;
  } else if (sequenceRole === 'SESSION_FINISHER') {
    recgptTransitionScore = Number((boundedRate * 0.92).toFixed(2));
    isRecgptCandidate = true;
  } else if (sequenceRole === 'PIXIE_DRIFT_OUTLIER') {
    recgptTransitionScore = 0;
    isRecgptCandidate = false;
  }

  // True Engine Provenance (orthogonal to product status) with full interaction signals
  let provenanceEngine = detectEngineProvenance(
    pin,
    parentEntity,
    saves,
    saveRate,
    dailyVelocity,
    ageDays,
    isRecgptCandidate,
    recgptTransitionScore
  );

  if (sequenceRole === 'PIXIE_DRIFT_OUTLIER') {
    provenanceEngine = 'P2P_RANDOMWALK';
  } else if ((provenanceEngine === 'P2P_TWO_TOWER' || provenanceEngine === 'FRESH_COLD_START') && isRecgptCandidate && recgptTransitionScore > 70) {
    provenanceEngine = 'P2P_RECGPT';
  }

  // Dynamic Multi-Head prod:v18 Net Utility Score using upstream utility_config.weights
  let individualProdScore = 0;
  const pClick = 1.0;
  const pLongClick = Math.min(1.0, (saveRate / 100) * 1.2);
  const pRepin = saves > 0 ? Math.min(1.0, repins / saves) : 0;
  const pShortClick = isProduct ? 0.10 : (isVideo ? 0.08 : 0.05);

  if (utilityWeights && typeof utilityWeights === 'object') {
    let headWeights = null;
    if (isProduct && utilityWeights.PRODUCT_TRUSTWORTHY) {
      headWeights = utilityWeights.PRODUCT_TRUSTWORTHY;
    } else if (isVideo && utilityWeights.VIDEO) {
      headWeights = utilityWeights.VIDEO;
    } else if (utilityWeights.ORGANIC) {
      headWeights = utilityWeights.ORGANIC;
    }

    if (headWeights) {
      const clickW = Number(headWeights.CLICK_WEIGHT ?? 1.97);
      const longClickW = Number(headWeights.LONG_CLICK_WEIGHT ?? 0.09);
      const shortClickW = Number(headWeights.SHORT_CLICK_5S_WEIGHT ?? -392.64);
      const repinW = Number(headWeights.REPIN_WEIGHT ?? 118.07);

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
    repins,
    save_rate: saveRate,
    domain,
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

  // STRICT REJECTION: Module containers, UI dividers, section headers, story headers
  if (
    item.container_type != null ||
    item.story_type === 'related_modules_header' ||
    item.node_id === '__EMPTY__' ||
    item.type === 'story'
  ) {
    return pins;
  }

  const rawId = String(item.id || item.pin_id || '').trim();
  if (rawId.startsWith('-') || (rawId && !/^\d+$/.test(rawId))) {
    return pins;
  }

  const moduleMarker = item.source_module || item.module_id || item.name || item.type || item.module_type || '';

  const attachMeta = (p) => {
    if (p && typeof p === 'object') {
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

  // If item itself is a real pin (must have media or positive pin ID and type === 'pin')
  if (rawId && !rawId.startsWith('-') && /^\d+$/.test(rawId)) {
    const hasMedia = Boolean(item.images || item.videos || item.story_pin_data || item.image_large_url || item.image_medium_url);
    if (item.type === 'pin' || hasMedia) {
      attachMeta(item);
    }
  }

  return pins;
}

/**
 * Compute Dominant Color Centroids
 */
function computeColorCentroids(candidates) {
  if (candidates.length === 0) return [];
  const freq = {};
  for (const c of candidates) {
    const color = (c.dominant_color || '#888888').toLowerCase();
    freq[color] = (freq[color] || 0) + 1;
  }

  return Object.entries(freq)
    .map(([color, count]) => ({
      color,
      count,
      percentage: Number(((count / candidates.length) * 100).toFixed(2))
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
    const text = `${candidate.title} ${candidate.ocr_text}`.toLowerCase();
    const rawTokens = text.split(/[^a-z0-9]+/);
    const seenInDoc = new Set();

    for (const raw of rawTokens) {
      if (raw.length < 3 || STOP_WORDS.has(raw)) continue;

      if (!tokenMap.has(raw)) {
        tokenMap.set(raw, { tf: 0, weighted_score: 0 });
      }

      const stat = tokenMap.get(raw);
      stat.tf += 1;

      // Add to weighted score once per candidate document
      if (!seenInDoc.has(raw)) {
        stat.weighted_score += candidate.save_rate;
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
  const maxPages = 40;

  const baseHeaders = {
    'accept': 'application/json, text/javascript, */*, q=0.01',
    'accept-language': 'en-US,en;q=0.9',
    'screen-dpr': '1',
    'x-app-version': '664ee65',
    'x-pinterest-pws-handler': `www/pin/[id].js`,
    'x-requested-with': 'XMLHttpRequest',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    'referer': `https://www.pinterest.com/pin/${pinId}/`,
    'origin': 'https://www.pinterest.com',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin'
  };

  if (process.env.PINTEREST_COOKIE) {
    baseHeaders['cookie'] = formatPinterestCookie(process.env.PINTEREST_COOKIE);
  }

  for (let page = 1; page <= maxPages; page++) {
    const delay = jitterDelay();
    console.log(`[*] [Page ${page}/${maxPages}] Requesting RelatedModulesResource (jitter delay ${delay}ms)...`);
    await sleep(delay);

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
      optionsObj.bookmark = bookmark;
    }

    const dataParam = JSON.stringify({
      options: optionsObj,
      context: {
        client_context: {
          client_session_id: crypto.randomUUID(),
          source_type: 'visual_search_feed',
          navigation_source: 'related_pins_carousel',
          user_recent_actions: [
            { event: 'click', entity_id: pinId, time: Date.now() - 60000 },
            { event: 'save', entity_id: pinId, time: Date.now() - 30000 }
          ]
        }
      }
    });

    const targetUrl = `https://www.pinterest.com/resource/RelatedModulesResource/get/?source_url=${encodeURIComponent(`/pin/${pinId}/`)}&data=${encodeURIComponent(dataParam)}`;

    let responseData;
    try {
      responseData = await fetchWithRetry(targetUrl, baseHeaders);
    } catch (err) {
      console.error(`[-] Failed to fetch page ${page} for seed ${pinId}: ${err.message}`);
      break;
    }

    const resourceResponse = responseData?.resource_response || responseData;
    const items = resourceResponse?.data || [];
    const nextBookmark = resourceResponse?.bookmark;

    console.log(`[+] [Page ${page}] Received ${items.length} raw entities. Next bookmark: ${nextBookmark ? (nextBookmark.slice(0, 20) + '...') : 'none'}`);

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
          const midFunnelFresh = Number(rawCounts["P2P_TWO_TOWER_MID_FUNNEL_FRESH_EMBEDDING_CAND"] || 0);
          const p2bFresh = Number(rawCounts["P2P_P2B2P_FRESH"] || 0);

          authoritativeCandidateCounts = {
            navboost_count: Number(rawCounts["P2P_NAVBOOST_CAND"] || 0),
            recgpt_count: Number(rawCounts["P2P_RECGPT"] || 0),
            randomwalk_count: Number(rawCounts["P2P_RANDOMWALK_CAND"] || 0),
            two_tower_count: twoTowerBase + (p2bFresh > 0 ? midFunnelFresh : 0),
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
        if (!isCulinaryCandidate(rawTitle, rawDomain, rawDesc)) {
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

  // Persistence to Neon Serverless Postgres via Parallel Batch Upserts (Promise.all)
  if (allCandidates.length > 0) {
    console.log(`[*] Upserting ${allCandidates.length} candidate graph nodes into Neon (parallel batch mode)...`);

    // Batch upsert in concurrent chunks of 50
    const chunkSize = 50;
    for (let i = 0; i < allCandidates.length; i += chunkSize) {
      const chunk = allCandidates.slice(i, i + chunkSize);

      await Promise.all(chunk.map((node) => sql`
        INSERT INTO candidate_graph_nodes (
          seed_pin_id, candidate_pin_id, title, dominant_color, aspect_ratio,
          saves, repins, save_rate, domain, is_product, ocr_text, extracted_at,
          pin_created_at, age_days, daily_velocity, provenance_engine,
          individual_prod_score, recgpt_transition_score, sequence_role,
          is_recgpt_candidate, visual_entropy_score,
          image_url, is_video, ingestion_method
        ) VALUES (
          ${node.seed_pin_id}, ${node.candidate_pin_id}, ${node.title},
          ${node.dominant_color}, ${node.aspect_ratio}, ${node.saves},
          ${node.repins}, ${node.save_rate}, ${node.domain},
          ${node.is_product}, ${node.ocr_text}, NOW(),
          ${node.pin_created_at}, ${node.age_days}, ${node.daily_velocity},
          ${node.provenance_engine}, ${node.individual_prod_score},
          ${node.recgpt_transition_score}, ${node.sequence_role},
          ${node.is_recgpt_candidate}, ${node.visual_entropy_score},
          ${node.image_url}, ${node.is_video}, ${node.ingestion_method}
        )
        ON CONFLICT (seed_pin_id, candidate_pin_id) DO UPDATE SET
          title = EXCLUDED.title,
          dominant_color = EXCLUDED.dominant_color,
          aspect_ratio = EXCLUDED.aspect_ratio,
          saves = EXCLUDED.saves,
          repins = EXCLUDED.repins,
          save_rate = EXCLUDED.save_rate,
          domain = EXCLUDED.domain,
          is_product = EXCLUDED.is_product,
          ocr_text = EXCLUDED.ocr_text,
          extracted_at = NOW(),
          pin_created_at = EXCLUDED.pin_created_at,
          age_days = EXCLUDED.age_days,
          daily_velocity = EXCLUDED.daily_velocity,
          provenance_engine = EXCLUDED.provenance_engine,
          individual_prod_score = EXCLUDED.individual_prod_score,
          recgpt_transition_score = EXCLUDED.recgpt_transition_score,
          sequence_role = EXCLUDED.sequence_role,
          is_recgpt_candidate = EXCLUDED.is_recgpt_candidate,
          visual_entropy_score = EXCLUDED.visual_entropy_score,
          image_url = EXCLUDED.image_url,
          is_video = EXCLUDED.is_video,
          ingestion_method = EXCLUDED.ingestion_method;
      `));
    }
    console.log(`[+] Successfully stored candidate nodes in Neon.`);
  }

  // Insert macro cluster metrics snapshot
  console.log(`[*] Recording cluster arbitrage metrics snapshot...`);
  await sql`
    INSERT INTO cluster_arbitrage_metrics (
      seed_pin_id, total_candidates, recgpt_count, navboost_count,
      randomwalk_count, two_tower_count, fresh_candidate_count, product_count,
      commercial_gap_ratio, winning_color_centroids, high_save_tokens,
      utility_snapshot, analyzed_at
    ) VALUES (
      ${pinId},
      ${totalCandidates},
      ${authoritativeCandidateCounts.recgpt_count},
      ${authoritativeCandidateCounts.navboost_count},
      ${authoritativeCandidateCounts.randomwalk_count},
      ${authoritativeCandidateCounts.two_tower_count},
      ${authoritativeCandidateCounts.fresh_candidate_count},
      ${productCount},
      ${commercialGapRatio},
      ${JSON.stringify(centroids)},
      ${JSON.stringify(highSaveTokens)},
      ${utilitySnapshot ? JSON.stringify(utilitySnapshot) : null},
      NOW()
    );
  `;

  // Persist all captured Pinterest Guided Search Capsules into Neon
  const allCapsules = Array.from(guidedSearchCapsulesMap.values());
  if (allCapsules.length > 0) {
    console.log(`[*] Persisting ${allCapsules.length} guided search capsules into Neon...`);
    for (const cap of allCapsules) {
      await sql`
        INSERT INTO seed_guided_search_capsules (
          seed_pin_id, query_term, normalized_query, image_url, search_url, node_id, discovered_at
        ) VALUES (
          ${cap.seed_pin_id}, ${cap.query_term}, ${cap.normalized_query}, ${cap.image_url}, ${cap.search_url}, ${cap.node_id}, NOW()
        )
        ON CONFLICT (seed_pin_id, normalized_query) DO UPDATE
        SET image_url = EXCLUDED.image_url, search_url = EXCLUDED.search_url, node_id = EXCLUDED.node_id;
      `;
    }
    console.log(`[+] Successfully stored ${allCapsules.length} guided search capsules in Neon.`);
  }

  // Update last_crawled_at on cluster_seeds
  await sql`
    UPDATE cluster_seeds
    SET last_crawled_at = NOW()
    WHERE pin_id = ${pinId};
  `;

  console.log(`[+] Seed ${pinId} cluster intelligence pipeline completed successfully.`);
}

/**
 * Main Orchestrator
 */
async function main() {
  console.log(`=============================================================`);
  console.log(`  Pinterest Algorithmic Arbitrage Engine (P2P Cluster Core)  `);
  console.log(`=============================================================`);

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

  if (targetPinArg) {
    const cleanId = String(targetPinArg).trim();
    console.log(`[*] Target pin override specified: ${cleanId}`);

    // Ensure seed exists in database
    await sql`
      INSERT INTO cluster_seeds (pin_id, label, is_competitor, velocity)
      VALUES (${cleanId}, 'Target Pin Override', false, 0)
      ON CONFLICT (pin_id) DO NOTHING;
    `;

    const existing = await sql`
      SELECT pin_id, label, is_competitor, velocity, last_crawled_at
      FROM cluster_seeds
      WHERE pin_id = ${cleanId};
    `;

    seedsToProcess = existing.length > 0 ? [existing[0]] : [{
      pin_id: cleanId,
      label: 'Target Pin Override'
    }];
  } else {
    console.log(`[*] Querying seeds needing crawl (last_crawled_at IS NULL or > 24h old)...`);
    seedsToProcess = await sql`
      SELECT pin_id, label, is_competitor, velocity, last_crawled_at
      FROM cluster_seeds
      WHERE last_crawled_at IS NULL OR last_crawled_at < NOW() - INTERVAL '24 HOURS'
      ORDER BY last_crawled_at ASC NULLS FIRST
      LIMIT 10;
    `;
  }

  if (seedsToProcess.length === 0) {
    console.log(`[+] No cluster seeds require crawling at this time. All clusters are fresh.`);
    return;
  }

  console.log(`[+] Found ${seedsToProcess.length} seed(s) queued for crawling.`);

  for (const seed of seedsToProcess) {
    try {
      await crawlSeed(seed);
    } catch (err) {
      console.error(`[-] Error crawling seed ${seed.pin_id}:`, err);
    }
  }

  console.log(`\n[+] Cluster intelligence run finished.`);
}

import { fileURLToPath } from 'url';
const isDirectRun = process.argv[1] && (
  fileURLToPath(import.meta.url) === process.argv[1] ||
  process.argv[1].endsWith('cluster-intelligence.mjs')
);

if (isDirectRun) {
  main().catch((err) => {
    console.error(`[-] Fatal orchestrator error:`, err);
    process.exit(1);
  });
}
