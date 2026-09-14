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
 * Safely extract string content
 */
function cleanString(val) {
  if (typeof val === 'string') return val.trim();
  if (typeof val === 'number') return String(val);
  if (val && typeof val === 'object' && typeof val.text === 'string') return val.text.trim();
  return '';
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
  const counts = {
    recgpt_count: 0,
    navboost_count: 0,
    randomwalk_count: 0,
    two_tower_count: 0,
    fresh_candidate_count: 0,
    shopping_corpus_count: 0
  };

  if (!rawCounts) return counts;

  let parsed = rawCounts;
  if (typeof rawCounts === 'string') {
    try {
      parsed = JSON.parse(rawCounts);
    } catch (e) {
      return counts;
    }
  }

  counts.recgpt_count = Number(parsed.P2P_RECGPT || 0);
  counts.navboost_count = Number(parsed.P2P_NAVBOOST_CAND || 0);
  counts.randomwalk_count = Number(parsed.P2P_RANDOMWALK_CAND || 0);
  counts.two_tower_count = Number(parsed.P2P_TWO_TOWER_EMBEDDING_CAND || 0);
  counts.fresh_candidate_count = Number(parsed.P2P_TWO_TOWER_MID_FUNNEL_FRESH_EMBEDDING_CAND || 0);
  counts.shopping_corpus_count = Number(parsed.P2P_TWO_TOWER_SHOPPING_CORPUS_CAND || parsed.PLP_CORPUS || 0);

  return counts;
}

/**
 * Extract pin fields with complete fallback chain
 */
function parsePinCandidate(pin, seedPinId) {
  if (!pin || typeof pin !== 'object') return null;

  const candidatePinId = String(pin.id || pin.pin_id || '').trim();
  if (!candidatePinId || candidatePinId === String(seedPinId)) {
    return null;
  }

  // Title fallback chain
  const title = (
    cleanString(pin.title) ||
    cleanString(pin.grid_title) ||
    cleanString(pin.rich_summary?.display_name) ||
    cleanString(pin.story_pin_data?.metadata?.pin_title) ||
    cleanString(pin.auto_alt_text) ||
    (typeof pin.description === 'string' ? pin.description.slice(0, 60).trim() : '') ||
    'Untitled Recipe'
  );

  const dominantColor = cleanString(pin.dominant_color) || '#888888';

  let aspectRatio = 0.560;
  if (pin.story_pin_data?.metadata?.canvas_aspect_ratio) {
    aspectRatio = Number(Number(pin.story_pin_data.metadata.canvas_aspect_ratio).toFixed(3));
  } else if (pin.images?.orig?.width && pin.images?.orig?.height) {
    aspectRatio = Number((pin.images.orig.height / pin.images.orig.width).toFixed(3));
  }

  const saves = Number(pin.aggregated_pin_data?.aggregated_stats?.saves ?? (pin.repin_count || 0));
  const repins = Number(pin.repin_count || 0);
  const rawRate = saves > 0 ? ((repins / saves) * 100) : 0;
  const saveRate = Number(Math.min(9999999.99, Math.max(0, rawRate)).toFixed(2));

  const domain = cleanString(pin.domain) || cleanString(pin.link_domain?.id) || 'Uploaded by user';

  const isProduct = Boolean(
    pin.is_eligible_for_pdp ||
    (pin.price_value && Number(pin.price_value) > 0) ||
    pin.product_metadata ||
    (Array.isArray(pin.shopping_flags) && pin.shopping_flags.length > 0)
  );

  const ocrText = cleanString(pin.auto_alt_text);

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
    ocr_text: ocrText
  };
}

/**
 * Extract pin objects from entity (handles both standalone pin and nested structures)
 */
function extractPinsFromEntity(item) {
  const pins = [];
  if (!item || typeof item !== 'object') return pins;

  if (Array.isArray(item.pins)) {
    for (const p of item.pins) {
      if (p && typeof p === 'object') pins.push(p);
    }
  }
  if (Array.isArray(item.objects)) {
    for (const p of item.objects) {
      if (p && typeof p === 'object') pins.push(p);
    }
  }
  if (Array.isArray(item.items)) {
    for (const p of item.items) {
      if (p && typeof p === 'object') pins.push(p);
    }
  }

  // If item itself is a pin
  if (item.id && (item.images || item.domain || item.type === 'pin' || item.link || item.aggregated_pin_data || item.title)) {
    pins.push(item);
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
  let candidateCounts = {
    recgpt_count: 0,
    navboost_count: 0,
    randomwalk_count: 0,
    two_tower_count: 0,
    fresh_candidate_count: 0,
    shopping_corpus_count: 0
  };
  let utilitySnapshot = null;

  let bookmark = null;
  const maxPages = 12;

  const baseHeaders = {
    'accept': 'application/json, text/javascript, */*, q=0.01',
    'accept-language': 'en-US,en;q=0.9',
    'screen-dpr': '1',
    'x-app-version': '664ee65',
    'x-pinterest-pws-handler': `www/pin/[id].js`,
    'x-requested-with': 'XMLHttpRequest',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
  };

  if (process.env.PINTEREST_COOKIE) {
    baseHeaders['cookie'] = process.env.PINTEREST_COOKIE;
  }

  for (let page = 1; page <= maxPages; page++) {
    const delay = jitterDelay();
    console.log(`[*] [Page ${page}/${maxPages}] Requesting RelatedModulesResource (jitter delay ${delay}ms)...`);
    await sleep(delay);

    const optionsObj = { pin_id: pinId };
    if (bookmark) {
      optionsObj.bookmark = bookmark;
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
      if (item?.aux_fields?.candidate_counts && !candidateCounts.recgpt_count) {
        candidateCounts = extractCandidateCounts(item.aux_fields.candidate_counts);
        console.log(`[+] Parsed aux candidate counts:`, candidateCounts);
      }
      if (item?.aux_fields?.utility_config?.weights && !utilitySnapshot) {
        utilitySnapshot = item.aux_fields.utility_config.weights;
        console.log(`[+] Captured prod:v18 utility weights snapshot.`);
      }

      // Extract all nested or direct pins
      const pinsToProcess = extractPinsFromEntity(item);

      for (const pinObj of pinsToProcess) {
        const parsed = parsePinCandidate(pinObj, pinId);
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
  console.log(`---------------------------------------------------\n`);

  // Persistence to Neon Serverless Postgres
  if (allCandidates.length > 0) {
    console.log(`[*] Upserting ${allCandidates.length} candidate graph nodes into Neon...`);

    // Batch upsert in chunks of 50 to avoid query size limits
    const chunkSize = 50;
    for (let i = 0; i < allCandidates.length; i += chunkSize) {
      const chunk = allCandidates.slice(i, i + chunkSize);

      for (const node of chunk) {
        await sql`
          INSERT INTO candidate_graph_nodes (
            seed_pin_id, candidate_pin_id, title, dominant_color, aspect_ratio,
            saves, repins, save_rate, domain, is_product, ocr_text, extracted_at
          ) VALUES (
            ${node.seed_pin_id}, ${node.candidate_pin_id}, ${node.title},
            ${node.dominant_color}, ${node.aspect_ratio}, ${node.saves},
            ${node.repins}, ${node.save_rate}, ${node.domain},
            ${node.is_product}, ${node.ocr_text}, NOW()
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
            extracted_at = NOW();
        `;
      }
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
      ${candidateCounts.recgpt_count},
      ${candidateCounts.navboost_count},
      ${candidateCounts.randomwalk_count},
      ${candidateCounts.two_tower_count},
      ${candidateCounts.fresh_candidate_count},
      ${productCount},
      ${commercialGapRatio},
      ${JSON.stringify(centroids)},
      ${JSON.stringify(highSaveTokens)},
      ${utilitySnapshot ? JSON.stringify(utilitySnapshot) : null},
      NOW()
    );
  `;

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

  const targetPinArg = process.argv[2] || process.env.TARGET_PIN_ID;
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

    seedsToProcess = [{
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

main().catch((err) => {
  console.error(`[-] Fatal orchestrator error:`, err);
  process.exit(1);
});
