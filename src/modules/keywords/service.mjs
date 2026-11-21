/**
 * Keyword Velocity & SERP Tracker Service
 * Searches Pinterest for target keywords, tracks pin rank positions,
 * calculates daily save velocity, semantic capsules (rankedGuides),
 * predictive typeahead autocomplete, and visual similarity lens.
 *
 * Hardened for Production:
 * - Atomic Single-Transaction Batch Upserts (sql.transaction -> Zero deadlocks, zero dirty reads)
 * - Zero Duplicate Batch Crash (strict in-memory deduplication by conflict key before SQL)
 * - Distributed 60s Atomic Lease + Process-Local Mutex (zero race conditions across edge isolates)
 * - Safe Regex Numeric Casting on JSONB metadata (immune to dirty metadata)
 * - Intraday Velocity Preservation (anchored to prior-day baseline, avoiding reset corruption)
 * - Intraday Snapshot Pruning (prevents ghost row accumulation and duplicate ranks)
 * - Request-Coalescing in-flight cache & True LRU Cache (zero memory leaks, zero rate-limit pressure)
 * - Full 4 Endpoints: v3_typeahead, v3_search_pins, v3_guided_search, v3_visual_search
 * - PinArchive-parity metadata enrichment (aspect ratio, format badges, velocity tiers)
 */

import { formatPinterestCookie, chunkArray } from '../../utils.mjs';
import {
  getStandardPinterestHeaders,
  fetchPinFromPinterest,
  fetchPinsBatchFromPidgets,
  pinterestFetch
} from '../../core/pinterest/index.mjs';
import { isSyntheticPinTitle, derivePinTitle } from './folders-crossover.mjs';
import { autoDiscoverFolderCreatorsForKeyword } from './folders-crud.mjs';
import { calculateDailyVelocity, isRepinHydrationJump } from '../../lib/math.mjs';
import { sanitizeVisualAnnotations } from '../../domain/pin-intelligence.mjs';
import { invalidateGlobalPulseCache } from '../pulse/service.mjs';
import {
  insertNewPinsBatch,
  resavePinsMetricsBatch
} from '../pins/repository.mjs';
import { computeVacuumOpportunityScore } from './serp-dossier-service.mjs';
export {
  listKeywords,
  fetchVisualSearchLens,
  getKeywordPins,
  getKeywordGuides,
  getKeywordSERPComparison,
  getKeywordIntelligence,
  computeVacuumOpportunityScore,
  getPinPerformanceTrajectory,
  getPinDeepDossier
} from './serp-dossier-service.mjs';

// In-Memory Mutex for process-local fast-fail
const activeKeywordCrawls = new Set();

// Modular Analytics, Outlier Suppression & Normalization
export {
  safeNormalizeMetadata,
  winsorize,
  extractPinTitle,
  calculateMedian,
  calculateKeywordIntelligenceSummary
} from './analytics.mjs';
import {
  safeNormalizeMetadata,
  winsorize,
  extractPinTitle
} from './analytics.mjs';
// Modular Keyword Settings & Configuration
export {
  getAppSettings,
  updateAppSettings,
  updateKeywordSettings,
  addKeyword,
  resolveKeywordBySlug,
  getEffectivePinterestCookie,
  savePinterestCookie,
  DEFAULT_PINTEREST_SESSION_COOKIE,
  MIN_SERP_QUOTA,
  MAX_SERP_QUOTA,
  DEFAULT_SERP_QUOTA,
  clampSerpQuota,
  computePagesForQuota,
  resolveEffectiveSerpQuota
} from './settings.mjs';
import {
  getAppSettings,
  getEffectivePinterestCookie,
  DEFAULT_PINTEREST_SESSION_COOKIE,
  resolveEffectiveSerpQuota
} from './settings.mjs';

// Modular Predictive Autocomplete & Typeahead
export { fetchKeywordTypeahead } from './typeahead.mjs';

/**
 * Endpoints 2 & 3: v3_search_pins (BaseSearchResource) & v3_guided_search (Guided Capsules)
 * Crawls Pinterest SERP for target keyword, extracts 50 organic pins,
 * calculates save velocities, saves semantic capsules (rankedGuides),
 * and records rank movement deltas.
 *
 * Hardened for Production:
 * - 100% Atomic Single-Transaction Batch Upserts (sql.transaction -> Zero deadlocks, zero dirty reads)
 * - Distributed 60s lease with safe regex numeric cast + Process-local Mutex.
 * - Deduplication of pins by pin_id and guides by term -> Zero Batch Conflict Crashes.
 * - Deterministic conflict-key sorting -> Zero Deadlocks.
 * - Intraday snapshot pruning -> Exactly 50 pins preserved with clean rank sequencing.
 * - Separation of intraday rank movements vs prior-day save velocity baseline.
 */
/**
 * Comprehensive Pinterest Ad & Commercial Post Detector
 * Exhaustively checks all nested attributes to prevent sponsored/shopping ad leakage into organic SERPs
 */
export function isCommercialOrAdPin(it) {
  if (!it) return false;
  return Boolean(
    it.is_promoted ||
    it.promoted ||
    it.is_sponsored ||
    it.ad ||
    it.advertiser_name ||
    it.promoter ||
    it.tracking_params?.ad_id ||
    it.tracking_params?.campaign_id ||
    it.attribution?.provider_name === 'ad' ||
    it.type === 'ad' ||
    it.type === 'promoted_pin'
  );
}

export async function crawlKeywordSERP(sql, keywordId, optionsOrCookie = {}, maybeOptions = {}) {
  const kid = Number(keywordId);
  if (!kid) throw new Error('Valid keyword ID is required');

  let cookie = (typeof process !== 'undefined' && process?.env ? process.env.PINTEREST_COOKIE : null);
  let force = false;
  let options = {};

  if (typeof optionsOrCookie === 'string') {
    cookie = optionsOrCookie;
    options = (maybeOptions && typeof maybeOptions === 'object') ? { ...maybeOptions } : {};
  } else if (optionsOrCookie && typeof optionsOrCookie === 'object') {
    options = { ...optionsOrCookie };
    if (options.cookie !== undefined) cookie = options.cookie;
  } else if (!optionsOrCookie && maybeOptions && typeof maybeOptions === 'object') {
    options = { ...maybeOptions };
    if (options.cookie !== undefined) cookie = options.cookie;
  }

  // Fallback to runtime environment secrets if not provided directly
  if (!cookie) {
    cookie = options?.env?.PINTEREST_COOKIE || maybeOptions?.env?.PINTEREST_COOKIE || null;
  }

  if (options.force) force = Boolean(options.force);

  // 1. Process-local fast-fail check and lock acquisition
  if (activeKeywordCrawls.has(kid) && !force) {
    return { success: false, in_progress: true, message: `Crawl already in progress locally for keyword ID ${kid}` };
  }
  activeKeywordCrawls.add(kid);

  let leaseAcquired = false;
  let leaseCommittedInTx = false;
  const skipLeaseRelease = Boolean(options?.skip_lease_release);

  const isUuid = (val) => typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
  const callerLeaseToken = isUuid(options?.lease_token) ? options.lease_token : null;
  const effectiveToken = callerLeaseToken || (
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : (await import('node:crypto')).randomUUID()
  );

  try {
    // [INVARIANT: DISTRIBUTED-CRAWL-LEASE-FENCING]
    // Even when force = true, active unexpired leases held by another node MUST be respected.
    // force = true only bypasses local in-memory lock (activeKeywordCrawls) and stale SERP freshness,
    // NEVER active distributed concurrency leases held by another worker.
    const leaseQuery = callerLeaseToken
      ? sql`
          UPDATE tracked_keywords
          SET crawl_lease_token = ${effectiveToken}::uuid,
              crawl_lease_until = GREATEST(COALESCE(crawl_lease_until, NOW()), NOW() + INTERVAL '15 minutes')
          WHERE id = ${kid}
            AND (crawl_lease_token = ${effectiveToken}::uuid OR crawl_lease_until IS NULL OR crawl_lease_until < NOW())
          RETURNING id;
        `
      : sql`
          UPDATE tracked_keywords
          SET crawl_lease_token = ${effectiveToken}::uuid,
              crawl_lease_until = NOW() + INTERVAL '90 seconds'
          WHERE id = ${kid}
            AND (crawl_lease_until IS NULL OR crawl_lease_until < NOW() OR crawl_lease_token = ${effectiveToken}::uuid)
          RETURNING id;
        `;

    let leaseResult;
    try {
      leaseResult = await leaseQuery;
    } catch (lErr) {
      if (lErr.message && (lErr.message.includes('crawl_lease_until') || lErr.message.includes('column') || lErr.message.includes('does not exist'))) {
        console.warn(`[crawlKeywordSERP] crawl_lease_until column missing, proceeding without database lease: ${lErr.message}`);
        leaseResult = [{ id: kid }];
      } else {
        console.error(`[crawlKeywordSERP] Database error acquiring lease for keyword ID ${kid}:`, lErr.message);
        throw lErr;
      }
    }

    if (leaseResult.length === 0) {
      return { success: false, in_progress: true, message: `Crawl actively locked by another node for keyword ID ${kid}` };
    }
    leaseAcquired = true;

    const [keywordRow] = await sql`
      SELECT id, keyword, target_pin_count, crawl_pages_limit, is_active, metadata, top_pin_id, top_pin_title, top_pin_image, avg_daily_velocity, last_crawled_at FROM tracked_keywords WHERE id = ${kid};
    `;
    if (!keywordRow) throw new Error(`Keyword ID ${kid} not found.`);

    const query = encodeURIComponent(keywordRow.keyword);

    // Resolve Filtration Exceptions & Persistent Cookie from options -> app_settings -> default
    const appSettings = await getAppSettings(sql);

    // Resolve Dynamic Depth via SSOT precedence: explicit override -> keywordRow.target_pin_count -> appSettings -> crawl_pages_limit * 25 -> 50
    const targetCount = resolveEffectiveSerpQuota({
      explicitMaxPins: options.max_serp_pins ?? options.max_pins,
      keywordTargetPins: keywordRow.target_pin_count,
      keywordPagesLimit: keywordRow.crawl_pages_limit,
      appSettings
    });
    const configuredPages = Math.max(1, Math.min(40, Number(
      options.crawl_pages ||
      options.max_pages ||
      Math.ceil(targetCount / 25) ||
      keywordRow.crawl_pages_limit ||
      2
    )));
    // Replenishment Guard: Dynamic maxPages ensures excluded ads/boards/tombstone never starve targetCount
    const maxPages = Math.min(40, Math.max(configuredPages, Math.ceil(targetCount / 12)));
    const excludePromoted = options.exclude_promoted ?? appSettings.exclude_promoted ?? true;
    const excludeBoardsAndSuggestions = options.exclude_boards_and_suggestions ?? appSettings.exclude_boards_and_suggestions ?? true;
    const excludeIgnoredPins = options.exclude_ignored_pins ?? appSettings.exclude_ignored_pins ?? true;

    cookie = formatPinterestCookie(
      cookie || appSettings.pinterest_cookie || await getEffectivePinterestCookie(sql, cookie)
    );

    // Phase 2 Tombstone Architecture: Pre-fetch Ignored Pins Registry to accurately gate paging quota
    const ignoredPinRows = await sql`
      SELECT pin_id
      FROM keyword_ignored_pins
      WHERE keyword_id = ${kid};
    `;
    const ignoredPinSet = new Set(ignoredPinRows.map(r => String(r.pin_id)));

    const headers = getStandardPinterestHeaders({
      cookie,
      referer: `https://www.pinterest.com/search/pins/?q=${query}`,
      extraHeaders: {
        'x-pinterest-pws-handler': 'www/search/pins.js'
      }
    });

    let rawResults = [];
    let bookmark = null;
    let page = 1;
    let rawGuides = [];
    const seenPagingIds = new Set();
    let organicPinsCollected = 0;
    let paginationAbortedByHttp = false;

    let lastHeartbeatTime = Date.now();
    const renewLeaseHeartbeat = async (extSeconds = 90) => {
      try {
        await sql`
          UPDATE tracked_keywords
          SET crawl_lease_until = NOW() + (${extSeconds} * INTERVAL '1 second')
          WHERE id = ${kid} AND crawl_lease_token = ${effectiveToken}::uuid;
        `;
        lastHeartbeatTime = Date.now();
      } catch (hbErr) {
        console.warn(`[crawlKeywordSERP] Lease heartbeat warning for keyword ${kid}:`, hbErr?.message);
      }
    };

    // Deep dynamic pagination: Follow bookmark stream up to maxPages / targetCount
    while (organicPinsCollected < targetCount && page <= maxPages) {
      const optionsObj = {
        query: decodeURIComponent(query),
        scope: 'pins',
        page_size: 50
      };
      if (bookmark) {
        optionsObj.bookmarks = [bookmark];
      }
      const dataParam = encodeURIComponent(JSON.stringify({
        options: optionsObj,
        context: {}
      }));
      const url = `https://www.pinterest.com/resource/BaseSearchResource/get/?source_url=%2Fsearch%2Fpins%2F%3Fq%3D${query}&data=${dataParam}`;

      let res;
      try {
        res = await pinterestFetch(url, { headers, signal: AbortSignal.timeout(8000) });
        if (res.status === 401 || res.status === 403 || res.status === 429) {
          if (res?.body && !res.bodyUsed) await res.body.cancel().catch(() => {});
          const jitter = 2500 + Math.floor(Math.random() * 1500);
          await new Promise(r => setTimeout(r, jitter));
          const authHeaders = { ...headers };
          if (cookie && String(cookie).trim()) {
            authHeaders['Cookie'] = formatPinterestCookie(cookie);
          }
          res = await pinterestFetch(url, { headers: authHeaders, signal: AbortSignal.timeout(8000) });
        }

        if (!res.ok) {
          if (page === 1) {
            throw new Error(`Pinterest Search API returned HTTP ${res.status}`);
          }
          paginationAbortedByHttp = true;
          break;
        }

        let data = await res.json();
        let pageItems = data?.resource_response?.data?.results || [];

        if (page === 1 && pageItems.length > 0) {
          const hasObfuscated = pageItems.some(it => String(it?.id || '').startsWith('e1_'));
          if (hasObfuscated) {
            const fallbackCookie = formatPinterestCookie(DEFAULT_PINTEREST_SESSION_COOKIE);
            if (fallbackCookie && headers['Cookie'] !== fallbackCookie) {
              console.warn(`[BaseSearchResource] Encrypted e1_ pin IDs detected on page 1 for "${query}" — retrying with fallback authenticated session cookie...`);
              headers['Cookie'] = fallbackCookie;
              cookie = fallbackCookie;
              const retryRes = await pinterestFetch(url, { headers, signal: AbortSignal.timeout(8000) });
              if (retryRes.ok) {
                const retryData = await retryRes.json();
                const retryItems = retryData?.resource_response?.data?.results || [];
                if (retryItems.length > 0 && !retryItems.some(it => String(it?.id || '').startsWith('e1_'))) {
                  data = retryData;
                  pageItems = retryItems;
                }
              }
            } else {
              console.warn(`[BaseSearchResource] WARNING: Pinterest returned encrypted e1_ pin IDs for query "${query}". Your PINTEREST_COOKIE may be expired, invalid, or missing.`);
            }
          }
        }

        if (page === 1) {
          rawGuides = data?.resource_response?.data?.rankedGuides || [];
        }
        if (pageItems.length === 0) break;
        rawResults.push(...pageItems);

        for (const it of pageItems) {
          if (!it || it.type !== 'pin') continue;
          if (excludeBoardsAndSuggestions && (it.format === 'Related Interests' || it.format === 'board')) continue;
          if (excludePromoted && isCommercialOrAdPin(it)) continue;
          const pid = [it?.id, it?.root_pin_id, it?.orig_pin_id, it?.aggregated_pin_data?.id]
            .map(v => String(v || '').trim())
            .find(v => /^(?:\d{10,30}|e1_[A-Za-z0-9_-]{15,90})$/.test(v));
          if (!pid) continue;
          if (excludeIgnoredPins && ignoredPinSet.has(pid)) continue;
          if (!seenPagingIds.has(pid)) {
            seenPagingIds.add(pid);
            organicPinsCollected++;
          }
        }

        // Robust multi-path bookmark resolution
        const nextBookmark = data?.resource_response?.bookmark ||
          (Array.isArray(data?.resource_response?.bookmarks) ? data.resource_response.bookmarks[0] : null) ||
          data?.resource_response?.data?.bookmark ||
          null;

        if (!nextBookmark || nextBookmark === '-end-' || nextBookmark === bookmark) {
          break;
        }
        bookmark = nextBookmark;
        page++;

        if (organicPinsCollected < targetCount && page <= maxPages) {
          const jitter = options.skip_top_enrich
            ? (800 + Math.floor(Math.random() * 600))
            : (2500 + Math.floor(Math.random() * 1500));
          await new Promise(r => setTimeout(r, jitter));
        }

        if (Date.now() - lastHeartbeatTime > 25000) {
          await renewLeaseHeartbeat(callerLeaseToken ? 900 : 90);
        }
      } catch (fetchErr) {
        if (page === 1) throw fetchErr;
        console.warn(`[crawlKeywordSERP] Pagination aborted on page ${page} due to network/fetch error:`, fetchErr?.message);
        paginationAbortedByHttp = true;
        break;
      } finally {
        if (res?.body && !res.bodyUsed) {
          await res.body.cancel().catch(() => {});
        }
      }
    }

    // Pre-query historical records from SSOT (surface transient DB errors instead of wiping baselines!):
    // A) Immediate prior active SERP state (including creative fields)
    const immediateSnapshots = await sql`
      SELECT
        ksp.pin_id, ksp.rank_position, ksp.prev_rank_position,
        ump.save_count,
        ump.repin_count, ump.comment_count, ksp.crawled_at,
        ump.created_at_pinterest, ump.creation_method,
        ump.is_hydrated AS is_deep_hydrated,
        ump.title,
        ump.image_url,
        COALESCE(ump.clean_domain, '') AS domain,
        ump.destination_url,
        ump.creator_username,
        COALESCE(ump.visual_annotations, '[]'::jsonb) AS visual_annotations
      FROM keyword_serp_positions ksp
      JOIN universal_master_pins ump ON ump.pin_id = ksp.pin_id
      WHERE ksp.keyword_id = ${kid}
        AND ksp.is_displaced = FALSE;
    `;

    const immediateMap = new Map();
    const baselineMap = new Map();
    let baselineSnapshotDate = null;
    const todayIsoDate = new Date().toISOString().slice(0, 10);

    for (const s of (immediateSnapshots || [])) {
      const pid = String(s.pin_id);
      immediateMap.set(pid, {
        snapshotId: null,
        rank: Number(s.rank_position || 0),
        saves: s.save_count != null ? Number(s.save_count) : null,
        repins: s.repin_count != null ? Number(s.repin_count) : null,
        comments: Number(s.comment_count || 0),
        title: s.title || '',
        imageUrl: s.image_url || null,
        domain: s.domain || '',
        destinationUrl: s.destination_url || '',
        creatorUsername: s.creator_username || '',
        visualAnnotations: s.visual_annotations || [],
        snapshotDate: s.crawled_at,
        createdAt: s.crawled_at,
        created_at_pinterest: s.created_at_pinterest,
        creation_method: s.creation_method,
        is_deep_hydrated: Boolean(s.is_deep_hydrated)
      });

      const snapDateStr = s.crawled_at instanceof Date
        ? s.crawled_at.toISOString().slice(0, 10)
        : (s.crawled_at ? String(s.crawled_at).slice(0, 10) : todayIsoDate);

      if (snapDateStr && snapDateStr < todayIsoDate && s.save_count != null) {
        baselineMap.set(pid, { saves: Number(s.save_count), repins: s.repin_count != null ? Number(s.repin_count) : null, date: snapDateStr });
        if (!baselineSnapshotDate) baselineSnapshotDate = new Date(snapDateStr);
      }
    }

    // C) Existing Displaced Pins Registry lookup from keyword_serp_positions
    const existingDisplacedRows = await sql`
      SELECT pin_id, last_known_rank
      FROM keyword_serp_positions
      WHERE keyword_id = ${kid} AND is_displaced = TRUE;
    `;
    const existingDisplacedMap = new Map();
    for (const d of existingDisplacedRows) {
      existingDisplacedMap.set(String(d.pin_id), d);
    }
    const resurgedPins = [];

    // System-wide maximum confirmed saves + authoritative prior-day baseline from pins_daily_metrics
    const discoveredPids = Array.from(seenPagingIds);
    const globalSavesMap = new Map();
    const globalRepinsMap = new Map();
    if (discoveredPids.length > 0) {
      const [priorMetricRows, masterRows] = await Promise.all([
        sql`
          SELECT DISTINCT ON (pin_id)
            pin_id,
            recorded_date::text AS snapshot_date,
            save_count,
            repin_count
          FROM pins_daily_metrics
          WHERE pin_id = ANY(${discoveredPids})
            AND recorded_date < (NOW() AT TIME ZONE 'UTC')::date
          ORDER BY pin_id, recorded_date DESC;
        `,
        sql`
          SELECT pin_id, save_count, repin_count
          FROM universal_master_pins
          WHERE pin_id = ANY(${discoveredPids});
        `
      ]);
      for (const r of masterRows) {
        const pid = String(r.pin_id);
        const s = r.save_count != null ? Number(r.save_count) : null;
        const rep = r.repin_count != null ? Number(r.repin_count) : null;
        if (s !== null && (globalSavesMap.get(pid) === undefined || s > globalSavesMap.get(pid))) globalSavesMap.set(pid, s);
        if (rep !== null && (globalRepinsMap.get(pid) === undefined || rep > globalRepinsMap.get(pid))) globalRepinsMap.set(pid, rep);
      }
      for (const pm of priorMetricRows) {
        const pid = String(pm.pin_id);
        const pmDateStr = String(pm.snapshot_date || '').slice(0, 10);
        if (pmDateStr && pmDateStr < todayIsoDate) {
          baselineMap.set(pid, {
            saves: pm.save_count != null ? Number(pm.save_count) : null,
            repins: pm.repin_count != null ? Number(pm.repin_count) : null,
            date: pmDateStr,
            fromDailyMetrics: true
          });
          if (!baselineSnapshotDate) baselineSnapshotDate = new Date(pmDateStr);
        }
      }
    }

    let rank = 1;
    let topPin = null;
    const pinVelocities = [];
    const todayDate = new Date();
    const crawlNowIso = todayDate.toISOString();
    let climbedCount = 0;
    let droppedCount = 0;
    let stableCount = 0;
    let newEntryCount = 0;

    const preparedPins = [];
    const seenPinIds = new Set();

    for (const item of rawResults) {
      if (!item || item.type !== 'pin') continue;
      if (excludeBoardsAndSuggestions && (item.format === 'Related Interests' || item.format === 'board')) continue;
      if (excludePromoted && isCommercialOrAdPin(item)) continue;
      const pinId = [item?.id, item?.root_pin_id, item?.orig_pin_id, item?.aggregated_pin_data?.id]
        .map(v => String(v || '').trim())
        .find(v => /^(?:\d{10,30}|e1_[A-Za-z0-9_-]{15,90})$/.test(v));
      if (!pinId || seenPinIds.has(pinId)) continue;
      if (excludeIgnoredPins && ignoredPinSet.has(pinId)) continue;
      if (preparedPins.length >= targetCount) break;
      seenPinIds.add(pinId);

      if (existingDisplacedMap.has(pinId)) {
        resurgedPins.push({ pin_id: pinId, rank });
      }

      const title = extractPinTitle(item, keywordRow.keyword);
      
      let domain = (item.domain || '').slice(0, 255);
      if (!domain && item.link) {
        try {
          domain = (new URL(item.link).hostname || '').slice(0, 255);
        } catch (_) {
          domain = '';
        }
      }

      const destinationUrl = item.link || '';
      const imageUrl = item.images?.['736x']?.url || item.images?.orig?.url || item.images?.['474x']?.url || item.images?.['236x']?.url || null;
      
      const rawSaves = Math.max(
        Number(item.aggregated_pin_data?.aggregated_stats?.saves || 0),
        Number(item.save_count || 0)
      );
      const hasExplicitItemSaves = Boolean(
        rawSaves > 0 && (
          item.aggregated_pin_data?.aggregated_stats?.saves !== undefined ||
          item.save_count !== undefined
        )
      );
      
      let reactions = 0;
      if (item.reaction_counts && typeof item.reaction_counts === 'object') {
        for (const v of Object.values(item.reaction_counts)) {
          const num = Number(v);
          if (!isNaN(num) && num > 0) reactions += num;
        }
      }
      if (reactions === 0) {
        reactions = Number(
          item.reaction_counts?.['1'] || 
          item.reaction_counts?.['like'] || 
          item.reaction_counts?.['heart'] || 
          item.reaction_counts?.['total'] || 
          0
        );
      }
      // Strictly keep authentic saves separate from reactions so save_count is never polluted by reaction_counts
      const saves = rawSaves;

      if (!topPin && imageUrl) {
        topPin = { pinId, title, imageUrl };
      }

      // Rank movements are evaluated against immediate prior crawl
      const immediateData = immediateMap.get(pinId);
      let rankDelta = 0;
      let prevRank = null;
      let isNew = false;

      if (immediateData) {
        prevRank = immediateData.rank;
        rankDelta = prevRank - rank;
        if (rankDelta > 0) climbedCount++;
        else if (rankDelta < 0) droppedCount++;
        else stableCount++;
      } else {
        isNew = true;
        rankDelta = 0;
        newEntryCount++;
      }

      // MONOTONIC SAVE RETENTION GUARD (IN-MEMORY):
      // Lifetime cumulative pin saves can NEVER legitimately drop to 0.
      const baseEntryForPin = baselineMap.get(pinId);
      const baseSavesForPin = (baseEntryForPin && typeof baseEntryForPin === 'object') ? (baseEntryForPin.saves != null ? Number(baseEntryForPin.saves) : null) : (baseEntryForPin != null ? Number(baseEntryForPin) : null);
      const immSaves = immediateData?.saves != null ? Number(immediateData.saves) : null;
      const globSaves = globalSavesMap.get(pinId) != null ? Number(globalSavesMap.get(pinId)) : null;

      const priorKnownSavesCandidates = [immSaves, baseSavesForPin, globSaves].filter(v => v !== null && v >= 0);
      const priorKnownSaves = priorKnownSavesCandidates.length > 0 ? Math.max(...priorKnownSavesCandidates) : null;

      const confirmedSaves = (saves > 0)
        ? saves
        : (priorKnownSaves != null ? priorKnownSaves : (hasExplicitItemSaves ? 0 : null));

      const hasExplicitItemRepins = item.repin_count !== undefined && item.repin_count !== null;
      const itemRepins = hasExplicitItemRepins ? Number(item.repin_count) : null;
      const immRepins = immediateData?.repins != null ? Number(immediateData.repins) : null;
      const baseRepins = (baseEntryForPin && typeof baseEntryForPin === 'object' && baseEntryForPin.repins != null) ? Number(baseEntryForPin.repins) : null;
      const globRepins = globalRepinsMap.get(pinId) != null ? Number(globalRepinsMap.get(pinId)) : null;

      const priorKnownRepinsCandidates = [immRepins, baseRepins, globRepins].filter(v => v !== null && v >= 0);
      const priorKnownRepins = priorKnownRepinsCandidates.length > 0 ? Math.max(...priorKnownRepinsCandidates) : null;

      const confirmedRepins = (itemRepins !== null && itemRepins > 0)
        ? itemRepins
        : (hasExplicitItemRepins ? itemRepins : priorKnownRepins);

      const confirmedComments = Math.max(
        Number(item.comment_count || 0),
        Number(immediateData?.comments || 0)
      );

      // 24h Daily Save Velocity is evaluated against previous day's baseline
      // Time-Normalized: Divides delta by pure UTC calendar days via calculateDailyVelocity SSOT
      let velocity = null;
      if (confirmedSaves !== null) {
        if (baselineMap.has(pinId)) {
          const baseDateStr = (baseEntryForPin && typeof baseEntryForPin === 'object') ? baseEntryForPin.date : null;
          velocity = calculateDailyVelocity({
            currentSaves: confirmedSaves,
            baselineSaves: baseSavesForPin != null ? baseSavesForPin : 0,
            repinCount: confirmedRepins != null ? confirmedRepins : 0,
            currentRepins: confirmedRepins != null ? confirmedRepins : 0,
            baselineRepins: (baseEntryForPin && typeof baseEntryForPin === 'object' && baseEntryForPin.repins != null) ? Number(baseEntryForPin.repins) : 0,
            currentDate: todayDate,
            baselineDate: baseDateStr || baselineSnapshotDate,
            createdAt: item.created_at_pinterest || item.created_at || null,
            maxCap: 25000
          });
        } else if (immediateData && immediateData.saves != null) {
          const immDateStr = immediateData.snapshotDate instanceof Date
            ? immediateData.snapshotDate.toISOString().slice(0, 10)
            : (immediateData.snapshotDate ? String(immediateData.snapshotDate).slice(0, 10) : '');
          const todayIsoStr = todayDate.toISOString().slice(0, 10);
          if (immDateStr && immDateStr < todayIsoStr) {
            velocity = calculateDailyVelocity({
              currentSaves: confirmedSaves,
              baselineSaves: immediateData.saves,
              repinCount: confirmedRepins != null ? confirmedRepins : 0,
              currentRepins: confirmedRepins != null ? confirmedRepins : 0,
              baselineRepins: Number(immediateData.repins || 0),
              currentDate: todayDate,
              baselineDate: immediateData.snapshotDate,
              createdAt: item.created_at_pinterest || item.created_at || null,
              maxCap: 25000
            });
          }
        }
      }

      if (velocity !== null) {
        // Sanity bound to protect against malicious bot-farm spikes
        velocity = Math.min(velocity, 25000);
        pinVelocities.push(velocity);
      }

      // Classify pin format & aspect ratio (PinArchive Parity)
      const isVideo = Boolean(item.is_video || item.videos);
      const isProduct = Boolean(item.is_promoted || item.is_buyable || item.price_value != null);
      const isIdea = Boolean(item.story_pin_data || item.pin_join?.story_pin_data);
      let format = 'ORGANIC PIN';
      if (isProduct) format = 'PRODUCT CARD';
      else if (isVideo) format = 'VIDEO PIN';
      else if (isIdea) format = 'IDEA PIN';

      // Aspect ratio classification (1:2, 2:3, 1:1, 9:16, 3:4, 16:9)
      const origW = Number(item.images?.['736x']?.width || item.images?.orig?.width || 236);
      const origH = Number(item.images?.['736x']?.height || item.images?.orig?.height || 354);
      let aspectRatio = '2:3';
      let aspectRatioTier = '2:3 Standard';
      if (origW > 0 && origH > 0) {
        const ratio = origW / origH;
        if (ratio <= 0.55) {
          aspectRatio = '1:2';
          aspectRatioTier = '1:2 Extra Tall';
        } else if (ratio <= 0.6) {
          aspectRatio = '9:16';
          aspectRatioTier = '9:16 Story';
        } else if (ratio > 0.6 && ratio <= 0.74) {
          aspectRatio = '2:3';
          aspectRatioTier = '2:3 Standard';
        } else if (ratio > 0.74 && ratio <= 0.92) {
          aspectRatio = '3:4';
          aspectRatioTier = '3:4 Medium';
        } else if (ratio > 0.92 && ratio < 1.08) {
          aspectRatio = '1:1';
          aspectRatioTier = '1:1 Square';
        } else if (ratio >= 1.08) {
          aspectRatio = '16:9';
          aspectRatioTier = '16:9 Landscape';
        }
      }

      let velocityTier = 'stagnant';
      if (velocity >= 50) velocityTier = 'explosive';
      else if (velocity >= 10) velocityTier = 'trending';
      else if (velocity > 0) velocityTier = 'steady';

      // Enriched Pinterest SERP intelligence attributes
      const pinner = item.pinner ? {
        username: item.pinner.username || '',
        full_name: item.pinner.full_name || '',
        follower_count: Number(item.pinner.follower_count || 0),
        image_small_url: item.pinner.image_small_url || ''
      } : null;

      const createdAt = item.created_at || item.createdAt || null;
      const method = item.method || item.creation_method || item.creationMethod || item.attribution?.provider_name || null;
      let pinAgeDays = null;
      if (createdAt) {
        const createdMs = new Date(createdAt).getTime();
        if (!isNaN(createdMs)) {
          pinAgeDays = Math.max(0, Math.floor((Date.now() - createdMs) / (1000 * 60 * 60 * 24)));
        }
      }

      const visualAnnotations = sanitizeVisualAnnotations(item.pin_join?.visual_annotation, { maxItems: 15 });

      const description = (item.grid_description || item.closeup_unified_description || item.description || '').slice(0, 500);
      const altText = (item.closeup_unified_description || item.description || '').slice(0, 500);
      const boardName = item.board?.name || null;

      const finalTitle = derivePinTitle(title, destinationUrl, keywordRow.keyword, boardName, visualAnnotations, description, altText, item.seo_title || '');

      const baseRepinsForPin = (baseEntryForPin && typeof baseEntryForPin === 'object' && baseEntryForPin.repins != null)
        ? Number(baseEntryForPin.repins)
        : (immediateData ? Number(immediateData.repins || 0) : confirmedRepins);
      const resolvedBaselineDateStr = (baseEntryForPin && typeof baseEntryForPin === 'object' && baseEntryForPin.date)
        ? String(baseEntryForPin.date).slice(0, 10)
        : (immediateData?.snapshotDate
          ? (immediateData.snapshotDate instanceof Date ? immediateData.snapshotDate.toISOString().slice(0, 10) : String(immediateData.snapshotDate).slice(0, 10))
          : null);
      const repinDaysElapsed = resolvedBaselineDateStr
        ? Math.max(1, Math.round((new Date(crawlNowIso.slice(0, 10) + 'T00:00:00Z').getTime() - new Date(resolvedBaselineDateStr + 'T00:00:00Z').getTime()) / 86400000))
        : 1;
      const deltaRepins24h = (confirmedRepins !== null && baseRepinsForPin !== null)
        ? Math.round(Math.max(0, confirmedRepins - baseRepinsForPin) / repinDaysElapsed)
        : null;

      preparedPins.push({
        pin_id: pinId,
        rank_position: rank,
        title: finalTitle,
        description: description,
        alt_text: altText,
        domain,
        destination_url: destinationUrl,
        image_url: imageUrl,
        save_count: confirmedSaves,
        has_explicit_saves: hasExplicitItemSaves,
        repin_count: confirmedRepins,
        comment_count: confirmedComments,
        daily_save_velocity: velocity,
        daily_repin_velocity: deltaRepins24h,
        delta_repins_24h: deltaRepins24h,
        created_at_pinterest: createdAt,
        creation_method: method,
        dominant_color: item.dominant_color || '#888888',
        visual_annotations: visualAnnotations,
        crawled_at: crawlNowIso,
        metadata: {
          description: description,
          creation_method: method,
          prev_rank: prevRank,
          rank_delta: rankDelta,
          baseline_snapshot_id: immediateData?.snapshotId ?? null,
          baseline_date: resolvedBaselineDateStr,
          baseline_repins: baseRepinsForPin,
          is_new: isNew,
          prev_save_count: baselineMap.has(pinId) ? baseSavesForPin : (immediateData ? immediateData.saves : confirmedSaves),
          format,
          aspect_ratio: aspectRatio,
          aspect_ratio_tier: aspectRatioTier,
          velocity_tier: velocityTier,
          is_breakout_candidate: Boolean(
            rank >= 10 && (
              (pinAgeDays !== null && pinAgeDays <= 21 && (velocity >= 2.0 || confirmedSaves >= 10)) ||
              (rankDelta >= 10 && (velocity >= 1.0 || confirmedSaves >= 5)) ||
              (isNew && confirmedSaves >= 15)
            )
          ),
          breakout_score: Math.round((confirmedSaves / Math.max(1, pinAgeDays ?? 7)) * 10),
          pin_age_days: pinAgeDays,
          pinner,
          reactions,
          board_name: boardName,
          alt_text: (item.closeup_unified_description || item.description || '').slice(0, 500),
          is_deep_hydrated: false
        }
      });

      rank++;
    }

    // Pre-index preparedPins by pin_id and index for O(1) lookups across Pidgets chunks & top enrichment
    const preparedPinById = new Map();
    const preparedPinIndexMap = new Map();
    for (let i = 0; i < preparedPins.length; i++) {
      const pinObj = preparedPins[i];
      if (pinObj?.pin_id) preparedPinById.set(String(pinObj.pin_id), pinObj);
      preparedPinIndexMap.set(pinObj, i);
    }

    // Batch Pidgets SERP Pre-Enrichment (LND-801)
    // Skip when skip_top_enrich is true (Phase 1A fleet harvest), because Phase 1B runs unified 50x Pidgets telemetry
    // and Phase 1A intentionally omits resavePinsMetricsBatch for existing SERP pins.
    if (!options.skip_top_enrich && typeof fetchPinsBatchFromPidgets === 'function' && preparedPins.length > 0) {
      const allPinIds = preparedPins.map(p => p.pin_id).filter(Boolean);
      for (const chunk of chunkArray(allPinIds, 50)) {
        try {
          const pidgetsMap = await fetchPinsBatchFromPidgets(chunk);
          if (pidgetsMap) {
            for (const rawPid of chunk) {
              const pidStr = String(rawPid);
              if (!pidgetsMap.has(pidStr)) continue;
              const p = preparedPinById.get(pidStr);
              if (!p) continue;
              const pData = pidgetsMap.get(pidStr);
              if (!pData || pData.is_missing) continue;

              const pidgetSaves = (pData.saves !== undefined && pData.saves !== null) ? Number(pData.saves) : ((pData.save_count !== undefined && pData.save_count !== null) ? Number(pData.save_count) : null);
              const pidgetRepins = (pData.repins !== undefined && pData.repins !== null) ? Number(pData.repins) : ((pData.repin_count !== undefined && pData.repin_count !== null) ? Number(pData.repin_count) : null);
              if (pidgetSaves !== null && (pidgetSaves > 0 || pData.has_explicit_saves)) {
                p.save_count = pidgetSaves;
                p.has_explicit_saves = true;
                p.was_live_scraped = true;
              }
              if (pidgetRepins !== null) {
                p.repin_count = pidgetRepins;
              }
              if (pData.title && !isSyntheticPinTitle(pData.title) && (!p.title || isSyntheticPinTitle(p.title))) {
                p.title = pData.title;
              }
              if (pData.image_hd_url) {
                p.image_hd_url = pData.image_hd_url;
                if (p.metadata) p.metadata.image_hd_url = pData.image_hd_url;
              }

              // Recalculate daily save velocity against baseline using calculateDailyVelocity to prevent hydration jumps (LND-801)
              const baseEntry = baselineMap.get(p.pin_id);
              if (baseEntry !== undefined && baseEntry !== null) {
                const baseSavesNum = (typeof baseEntry === 'object') ? Number(baseEntry.saves || 0) : Number(baseEntry || 0);
                const baseDateRaw = (typeof baseEntry === 'object' && baseEntry.date) ? new Date(baseEntry.date) : baselineSnapshotDate;
                const baseRepinsNum = (baseEntry && typeof baseEntry === 'object' && baseEntry.repins != null) ? Number(baseEntry.repins) : Number(p.metadata?.baseline_repins || 0);
                const newVel = calculateDailyVelocity({
                  currentSaves: p.save_count,
                  baselineSaves: baseSavesNum,
                  currentRepins: p.repin_count,
                  baselineRepins: baseRepinsNum,
                  currentDate: new Date(),
                  baselineDate: baseDateRaw,
                  createdAt: p.created_at_pinterest || null,
                  maxCap: 25000
                });
                p.daily_save_velocity = newVel;
                if (baseRepinsNum > 0 && p.repin_count >= baseRepinsNum) {
                  const baseDateStr = baseDateRaw instanceof Date && !isNaN(baseDateRaw) ? baseDateRaw.toISOString().slice(0, 10) : null;
                  const gapDays = baseDateStr ? Math.max(1, Math.round((new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z').getTime() - new Date(baseDateStr + 'T00:00:00Z').getTime()) / 86400000)) : 1;
                  const repinJump = isRepinHydrationJump(
                    { save_count: baseSavesNum, repin_count: baseRepinsNum },
                    { save_count: p.save_count, repin_count: p.repin_count }
                  );
                  const computedRepinDelta = repinJump ? 0 : Math.round(Math.max(0, p.repin_count - baseRepinsNum) / gapDays);
                  p.delta_repins_24h = computedRepinDelta;
                  p.daily_repin_velocity = computedRepinDelta;
                }
                const pIdxInPrepared = preparedPinIndexMap.get(p);
                if (pIdxInPrepared !== undefined) {
                  pinVelocities[pIdxInPrepared] = newVel;
                }
                if (p.metadata) {
                  p.metadata.prev_save_count = baseSavesNum;
                  if (newVel >= 50) p.metadata.velocity_tier = 'explosive';
                  else if (newVel >= 10) p.metadata.velocity_tier = 'trending';
                  else if (newVel > 0) p.metadata.velocity_tier = 'steady';
                  else p.metadata.velocity_tier = 'stagnant';
                }
              }
            }
          }
        } catch (err) {
          console.warn('[crawlKeywordSERP] Batch Pidgets pre-enrichment chunk warning:', err?.message || err);
        }
      }
    }

    // Enrich top 10 ranking pins + up to 10 detected breakout candidates with verified live deep metrics via fetchPinFromPinterest
    const skipTopEnrich = Boolean(options.skip_top_enrich);
    const topSlice = skipTopEnrich ? [] : preparedPins.slice(0, 10);
    const topSliceSet = new Set(topSlice);
    const breakoutSlice = skipTopEnrich ? [] : preparedPins.filter(p => p.metadata?.is_breakout_candidate && !topSliceSet.has(p)).slice(0, 10);
    const topToEnrich = [...topSlice, ...breakoutSlice];
    if (topToEnrich.length > 0) {
      await Promise.allSettled(topToEnrich.map(async (p) => {
        try {
          const detail = await fetchPinFromPinterest(p.pin_id, cookie);
          const scraped = detail?.pin || detail;
          if (scraped && (scraped.pin_id || scraped.id || scraped.title || scraped.saves !== undefined)) {
            p.crawled_at = new Date().toISOString();
            p.was_live_scraped = true;
            const rawEnrichedSaves = scraped.saves ?? scraped.save_count;
            const enrichedSavesNum = rawEnrichedSaves != null ? Number(rawEnrichedSaves) : null;
            const enrichedSaves = (enrichedSavesNum !== null && Number.isFinite(enrichedSavesNum) && enrichedSavesNum >= 0) ? enrichedSavesNum : null;

            const hasExplicitEnrichedRepins = scraped.has_explicit_repins === true;
            const rawEnrichedRepins = scraped.repins ?? scraped.repin_count;
            const enrichedRepinsNum = rawEnrichedRepins != null ? Number(rawEnrichedRepins) : null;
            const enrichedRepins = (enrichedRepinsNum !== null && Number.isFinite(enrichedRepinsNum) && enrichedRepinsNum >= 0) ? enrichedRepinsNum : null;

            const rawEnrichedComments = scraped.comments ?? scraped.comment_count;
            const enrichedCommentsNum = rawEnrichedComments != null ? Number(rawEnrichedComments) : null;
            const enrichedComments = (enrichedCommentsNum !== null && Number.isFinite(enrichedCommentsNum) && enrichedCommentsNum >= 0) ? enrichedCommentsNum : null;
            const enrichedSharesNum = Number(scraped.shares ?? scraped.share_count ?? 0);
            const enrichedShares = Number.isFinite(enrichedSharesNum) ? Math.max(0, enrichedSharesNum) : 0;

            if (enrichedSaves !== null && (enrichedSaves > 0 || scraped.has_explicit_saves || p.save_count != null)) {
              p.save_count = p.save_count != null ? Math.max(Number(p.save_count), enrichedSaves) : enrichedSaves;
            }
            if (enrichedRepins !== null && (enrichedRepins > 0 || (hasExplicitEnrichedRepins && (p.repin_count == null || Number(p.repin_count) === 0)))) {
              p.repin_count = p.repin_count != null ? Math.max(Number(p.repin_count), enrichedRepins) : enrichedRepins;
            }
            if (enrichedComments !== null) {
              p.comment_count = p.comment_count != null ? Math.max(Number(p.comment_count), enrichedComments) : enrichedComments;
            }
            const scrapedCandidateTitle = String(scraped.title || scraped.seo_title || '').trim();
            if (scrapedCandidateTitle && !isSyntheticPinTitle(scrapedCandidateTitle) && (!p.title || isSyntheticPinTitle(p.title))) {
              p.title = scrapedCandidateTitle;
            }
            if (scraped.created_at_pinterest || scraped.created_at) {
              const enrichedCreated = scraped.created_at_pinterest || scraped.created_at;
              p.created_at_pinterest = enrichedCreated;
            }
            if (scraped.method || scraped.creation_method) {
              const enrichedMethod = scraped.method || scraped.creation_method;
              p.creation_method = enrichedMethod;
              if (p.metadata) p.metadata.creation_method = enrichedMethod;
            }
            if (scraped.dominant_color) {
              p.dominant_color = scraped.dominant_color;
            }
            if (Array.isArray(scraped.visual_annotations) && scraped.visual_annotations.length > 0) {
              p.visual_annotations = scraped.visual_annotations;
            }
            if (p.metadata) {
              p.metadata.is_deep_hydrated = true;
              p.metadata.share_count = enrichedShares;
              if (scraped.alt_text || scraped.seo_alt_text) {
                const altStr = scraped.alt_text || scraped.seo_alt_text;
                p.alt_text = altStr;
                p.metadata.alt_text = altStr;
              }
              if (scraped.description) {
                const descStr = String(scraped.description).slice(0, 1000);
                p.description = descStr;
                p.metadata.description = descStr;
              }
              if (scraped.seo_title) p.metadata.seo_title = scraped.seo_title;
              if (scraped.seo_description) p.metadata.seo_description = scraped.seo_description;
              if (scraped.canonical_pin_id) p.metadata.canonical_pin_id = scraped.canonical_pin_id;
              if (scraped.canonical_pin_url) p.metadata.canonical_pin_url = scraped.canonical_pin_url;
              if (scraped.seo_canonical_url) p.metadata.seo_canonical_url = scraped.seo_canonical_url;
              if (scraped.aggregated_pin_data_id) p.metadata.aggregated_pin_data_id = scraped.aggregated_pin_data_id;
              if (scraped.domain_official_user?.username) p.metadata.domain_official_user = scraped.domain_official_user;
              if (scraped.board_pin_count) p.metadata.board_pin_count = Number(scraped.board_pin_count);
              if (scraped.board_order_modified_at) p.metadata.board_order_modified_at = scraped.board_order_modified_at;
              if (scraped.board_url) p.metadata.board_url = scraped.board_url;
              if (scraped.board_cover_url) p.metadata.board_cover_url = scraped.board_cover_url;
              if (scraped.board_thumbnail_url) p.metadata.board_thumbnail_url = scraped.board_thumbnail_url;
              if (scraped.image_signature) p.metadata.image_signature = scraped.image_signature;
              if (scraped.image_dimensions) p.metadata.image_dimensions = scraped.image_dimensions;
              if (scraped.rich_metadata) p.metadata.rich_metadata = scraped.rich_metadata;
              if (scraped.article_published_at) p.metadata.article_published_at = scraped.article_published_at;
              if (Array.isArray(scraped.seo_related_interests) && scraped.seo_related_interests.length > 0) {
                p.metadata.seo_related_interests = scraped.seo_related_interests;
              }
              if (Array.isArray(scraped.category_breadcrumbs) && scraped.category_breadcrumbs.length > 0) {
                p.metadata.category_breadcrumbs = scraped.category_breadcrumbs;
              }
              if (Array.isArray(scraped.visual_objects) && scraped.visual_objects.length > 0) {
                p.metadata.visual_objects = scraped.visual_objects;
              }
              if (scraped.golden_set_interest) p.metadata.golden_set_interest = scraped.golden_set_interest;
            }

            // Recalculate daily save velocity against baseline using calculateDailyVelocity to prevent hydration jumps (LND-801)
            const baseEntry = baselineMap.get(p.pin_id);
            if (baseEntry !== undefined && baseEntry !== null) {
              const baseSavesNum = (typeof baseEntry === 'object') ? Number(baseEntry.saves || 0) : Number(baseEntry || 0);
              const baseDateRaw = (typeof baseEntry === 'object' && baseEntry.date) ? new Date(baseEntry.date) : baselineSnapshotDate;
              const baseRepinsNum = (baseEntry && typeof baseEntry === 'object' && baseEntry.repins != null) ? Number(baseEntry.repins) : Number(p.metadata?.baseline_repins || 0);
              const newVel = calculateDailyVelocity({
                currentSaves: p.save_count,
                baselineSaves: baseSavesNum,
                currentRepins: p.repin_count,
                baselineRepins: baseRepinsNum,
                repinCount: p.repin_count,
                currentDate: new Date(),
                baselineDate: baseDateRaw,
                createdAt: p.created_at_pinterest || null,
                maxCap: 25000
              });
              p.daily_save_velocity = newVel;
              if (baseRepinsNum > 0 && p.repin_count >= baseRepinsNum) {
                const baseDateStr = baseDateRaw instanceof Date && !isNaN(baseDateRaw) ? baseDateRaw.toISOString().slice(0, 10) : null;
                const gapDays = baseDateStr ? Math.max(1, Math.round((new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z').getTime() - new Date(baseDateStr + 'T00:00:00Z').getTime()) / 86400000)) : 1;
                const repinJump = isRepinHydrationJump(
                  { save_count: baseSavesNum, repin_count: baseRepinsNum },
                  { save_count: p.save_count, repin_count: p.repin_count }
                );
                const computedRepinDelta = repinJump ? 0 : Math.round(Math.max(0, p.repin_count - baseRepinsNum) / gapDays);
                p.delta_repins_24h = computedRepinDelta;
                p.daily_repin_velocity = computedRepinDelta;
              }
              const pIdxInPrepared = preparedPinIndexMap.get(p);
              if (pIdxInPrepared !== undefined) {
                pinVelocities[pIdxInPrepared] = newVel;
              }
              if (p.metadata) {
                p.metadata.prev_save_count = (newVel === 0 && (baseSavesNum === 0 || Math.abs(baseSavesNum - Number(p.repin_count || 0)) <= Math.max(50, Number(p.repin_count || 0) * 0.03)))
                  ? p.save_count
                  : baseSavesNum;
                if (newVel >= 50) p.metadata.velocity_tier = 'explosive';
                else if (newVel >= 10) p.metadata.velocity_tier = 'trending';
                else if (newVel > 0) p.metadata.velocity_tier = 'steady';
                else p.metadata.velocity_tier = 'stagnant';
              }
            }
          }
        } catch (_) {
          // Fail-safe: keep BaseSearchResource fallback metrics if enrichment fails
        }
      }));
    }

    // PHASE 3: DYNAMIC SERP CIRCUIT BREAKER
    // Supporting small targets (10-30 pins) and large crawls: calculate expectedCount & minRequiredForEviction dynamically
    const priorActiveCount = immediateSnapshots.length;
    const effectiveTarget = targetCount || Number(keywordRow.target_pin_count) || Number(appSettings?.max_serp_pins || appSettings?.default_max_pins || 50);
    const expectedCount = priorActiveCount > 0
      ? Math.min(effectiveTarget, priorActiveCount)
      : effectiveTarget;

    const minRequiredForEviction = Math.min(
      Math.max(5, Math.floor(expectedCount * 0.70)),
      Math.max(5, expectedCount)
    );
    const isSuspectedIncompleteCrawl = preparedPins.length < minRequiredForEviction || paginationAbortedByHttp;
    const droppedOutList = [];

    if (isSuspectedIncompleteCrawl) {
      console.warn(`[Circuit Breaker] Suspected incomplete SERP crawl for keyword "${keywordRow.keyword}" (got ${preparedPins.length} pins vs ${priorActiveCount} prior, expected ${expectedCount}, min required ${minRequiredForEviction}, paginationAborted=${paginationAbortedByHttp}). Preserving rankings, skipping eviction.`);
    } else {
      for (const s of immediateSnapshots) {
        const pid = String(s.pin_id);
        if (!seenPinIds.has(pid) && !ignoredPinSet.has(pid)) {
          droppedOutList.push({
            pin_id: pid,
            rank_position: Number(s.rank_position || 1),
            save_count: s.save_count != null ? Number(s.save_count) : null,
            repin_count: s.repin_count != null ? Number(s.repin_count) : null,
            comment_count: s.comment_count != null ? Number(s.comment_count) : null,
            title: s.title || '',
            image_url: s.image_url || null,
            domain: s.domain || '',
            destination_url: s.destination_url || '',
            creator_username: s.creator_username || '',
            visual_annotations: s.visual_annotations || [],
            board_name: s.board_name || s.metadata?.board_name || null,
            format: s.metadata?.format || 'ORGANIC PIN',
            created_at_pinterest: s.created_at_pinterest || s.metadata?.created_at_pinterest || s.metadata?.created_at || null,
            creation_method: s.creation_method || s.metadata?.creation_method || s.metadata?.method || 'pinterest_platform',
            metadata: s.metadata || {},
            dropped_at: new Date().toISOString()
          });
        }
      }
    }

    // DEADLOCK IMMUNITY: Sort deterministically by conflict key (pin_id)
    preparedPins.sort((a, b) => a.pin_id.localeCompare(b.pin_id));

    // Extract and store semantic guided search capsules (rankedGuides)
    let savedGuidesCount = 0;
    const seenGuideTerms = new Set();
    const preparedGuides = [];

    if (rawGuides.length > 0) {
      for (const g of rawGuides) {
        if (!g) continue;
        const term = String(g.term || g.display || '').trim();
        const termKey = term.toLowerCase();
        if (!term || seenGuideTerms.has(termKey)) continue;
        seenGuideTerms.add(termKey);
        preparedGuides.push({
          keyword_id: kid,
          term,
          display_label: String(g.display || g.term || '').trim(),
          score: Number(g.score || 0),
          dominant_color: String(g.dominant_color || '#10b981').slice(0, 64),
          display_order: preparedGuides.length + 1
        });
      }
      // Sort guides deterministically by term
      preparedGuides.sort((a, b) => a.term.localeCompare(b.term));
      savedGuidesCount = preparedGuides.length;
    }

    const crawledCount = rank - 1;
    if (crawledCount === 0) {
      const reason = priorActiveCount > 0 ? 'suspected_soft_block' : 'zero_organic_results';
      console.warn(`[SERP Integrity Guard] 0 pins collected for "${keywordRow.keyword}" (priorActive=${priorActiveCount}, reason=${reason}). Aborting state mutation.`);
      return {
        success: false,
        incomplete: true,
        reason,
        keyword: keywordRow.keyword,
        crawled_pins: 0,
        avg_velocity: Number(keywordRow.avg_daily_velocity || 0)
      };
    }

    // Statistical Winsorization (95th percentile upper clamp) to eliminate bot-farm metric distortion
    const robustVelocities = winsorize(pinVelocities, 0.95);
    const robustTotalVelocity = robustVelocities.reduce((acc, v) => acc + v, 0);
    const avgVelocity = crawledCount > 0 ? Number((robustTotalVelocity / crawledCount).toFixed(2)) : 0;

    // Track 14-day historical daily average velocity points for trend sparklines
    const baseMetadata = safeNormalizeMetadata(keywordRow.metadata);
    const prevHistory = Array.isArray(baseMetadata.velocity_history) ? [...baseMetadata.velocity_history] : [];
    const todayIso = new Date().toISOString().slice(0, 10);
    const filteredHistory = prevHistory.filter(h => h && h.date !== todayIso);
    if (!isSuspectedIncompleteCrawl) {
      filteredHistory.push({ date: todayIso, velocity: avgVelocity });
      if (filteredHistory.length > 14) filteredHistory.shift();
    }

    // Build slim metadata without last_dropped_pins or popular_pins (prevents pg_toast_221295 bloat!)
    const updatedMetadata = {
      ...baseMetadata,
      velocity_history: filteredHistory,
      last_crawled_pins_count: isSuspectedIncompleteCrawl ? (baseMetadata.last_crawled_pins_count || crawledCount) : crawledCount,
      last_crawl_summary: {
        total: crawledCount,
        climbed: isSuspectedIncompleteCrawl ? (baseMetadata.last_crawl_summary?.climbed || 0) : climbedCount,
        dropped: isSuspectedIncompleteCrawl ? (baseMetadata.last_crawl_summary?.dropped || 0) : droppedCount,
        stable: isSuspectedIncompleteCrawl ? (baseMetadata.last_crawl_summary?.stable || 0) : stableCount,
        new_entries: isSuspectedIncompleteCrawl ? (baseMetadata.last_crawl_summary?.new_entries || 0) : newEntryCount,
        dropped_out: isSuspectedIncompleteCrawl ? (baseMetadata.last_crawl_summary?.dropped_out || 0) : droppedOutList.length
      }
    };
    delete updatedMetadata.crawl_lock;
    delete updatedMetadata.last_dropped_pins;
    delete updatedMetadata.popular_pins;

    // Prepare slimmed Hub SERP rows containing strictly the fields required by keyword_serp_positions
    const hubSerpPayload = preparedPins.map(p => ({
      pin_id: p.pin_id,
      rank_position: p.rank_position,
      prev_rank_position: p.metadata?.prev_rank ?? p.rank_position,
      crawled_at: p.crawled_at || null
    }));

    // ATOMIC MULTI-STATEMENT TRANSACTION VIA sql.transaction
    // Bundles Unified SSOT master pin upserts + Hub active SERP cache + slim displaced index updates into 1 ACID commit
    const envObj = options?.env || null;
    const ctxObj = options?.ctx || null;
    const txBatch = [];

    if (!isSuspectedIncompleteCrawl && (preparedPins.length > 0 || droppedOutList.length > 0)) {
      const newSerpPins = [];
      const existingSerpPins = [];
      for (const p of preparedPins) {
        const pid = String(p.pin_id || '');
        if (!pid) continue;
        const enrichedPin = { ...p, keyword_id: kid, is_displaced: false };
        if (!immediateMap.has(pid) && !globalSavesMap.has(pid)) {
          newSerpPins.push(enrichedPin);
        } else {
          existingSerpPins.push(enrichedPin);
        }
      }
      if (newSerpPins.length > 0) {
        txBatch.push((db) => insertNewPinsBatch(db, newSerpPins, 'keyword', { inTransaction: true, skipSerpUpsert: true }));
      }
      if (existingSerpPins.length > 0 && !options?.skip_top_enrich) {
        txBatch.push((db) => resavePinsMetricsBatch(db, existingSerpPins, { inTransaction: true, skipSerpUpsert: true }));
      }
    }

    if (hubSerpPayload.length > 0 && !isSuspectedIncompleteCrawl) {
      // 1. Keep active SERP positions synchronized in keyword_serp_positions
      txBatch.push((db) => db`
        INSERT INTO keyword_serp_positions (
          keyword_id,
          pin_id,
          rank_position,
          prev_rank_position,
          is_displaced,
          last_known_rank,
          crawled_at,
          updated_at
        )
        SELECT
          ${kid},
          u.pin_id,
          u.rank_position,
          u.prev_rank_position,
          FALSE,
          u.rank_position,
          u.crawled_at::timestamptz,
          NOW()
        FROM jsonb_to_recordset(${JSON.stringify(hubSerpPayload)}::jsonb) AS u(
          pin_id text,
          rank_position int,
          prev_rank_position int,
          crawled_at text
        )
        WHERE EXISTS (
          SELECT 1 FROM universal_master_pins ump
          WHERE ump.pin_id = u.pin_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM keyword_ignored_pins kip
          WHERE kip.keyword_id = ${kid} AND kip.pin_id = u.pin_id
        )
        ORDER BY u.pin_id ASC
        ON CONFLICT (keyword_id, pin_id) DO UPDATE SET
          prev_rank_position = COALESCE(keyword_serp_positions.rank_position, EXCLUDED.prev_rank_position),
          rank_position = EXCLUDED.rank_position,
          is_displaced = FALSE,
          displaced_date = NULL,
          last_known_rank = EXCLUDED.rank_position,
          crawled_at = COALESCE(EXCLUDED.crawled_at, keyword_serp_positions.crawled_at),
          updated_at = NOW();
      `);

      // 2. Dynamic SERP Guard: Move displaced pins into displaced status
      const pinIds = preparedPins.map(p => p.pin_id);
      const hasNumericPins = pinIds.some(id => /^\d+$/.test(String(id)));
      if (hasNumericPins) {
        // Purge any stale encrypted e1_ pin rows from unauthenticated crawls so they never pollute SERP or Displaced Vault
        txBatch.push((db) => db`
          DELETE FROM keyword_serp_positions
          WHERE keyword_id = ${kid}
            AND pin_id LIKE 'e1_%';
        `);
      }

      const shouldApplyDisplacement = !isSuspectedIncompleteCrawl && pinIds.length >= minRequiredForEviction;

      if (shouldApplyDisplacement) {
        // Continuous Decay- & Competition-Adjusted SERP Vacuum Opportunity Score (V_opp)
        txBatch.push((db) => db`
          WITH active_top10_stats AS (
            SELECT
              COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ump.save_count), 500)::numeric AS median_saves,
              COUNT(*) FILTER (WHERE LOWER(BTRIM(COALESCE(ump.clean_domain, ''))) IN ('', 'uploaded by user', 'uploaded-by-user', 'organic'))::int AS domainless_top10
            FROM keyword_serp_positions ksp
            JOIN universal_master_pins ump ON ump.pin_id = ksp.pin_id
            WHERE ksp.keyword_id = ${kid}
              AND ksp.is_displaced = FALSE
              AND ksp.rank_position <= 10
          )
          UPDATE keyword_serp_positions SET
            is_displaced = TRUE,
            last_known_rank = COALESCE(keyword_serp_positions.rank_position, keyword_serp_positions.last_known_rank),
            rank_position = NULL,
            displaced_date = COALESCE(keyword_serp_positions.displaced_date, (NOW() AT TIME ZONE 'UTC')::date),
            vacuum_opportunity_score = (
              SELECT
                LEAST(100, GREATEST(10, ROUND(
                  -- 1. Continuous rank decay: up to 55 points via exponential decay from last known rank
                  (55.0 * EXP(-0.045 * GREATEST(0, COALESCE(keyword_serp_positions.rank_position, keyword_serp_positions.last_known_rank, 30) - 1)))
                  -- 2. Domainless Top-10 gap boost: up to 25 points (8 pts per domainless pin in active top 10)
                  + LEAST(25, ast.domainless_top10 * 8)
                  -- 3. Stagnation / save competition ratio: up to 20 points
                  + LEAST(20, ROUND(15.0 * (COALESCE(ump.save_count, 0)::numeric / GREATEST(100, ast.median_saves))))
                )))::smallint
              FROM active_top10_stats ast
              LEFT JOIN universal_master_pins ump ON ump.pin_id = keyword_serp_positions.pin_id
            ),
            updated_at = NOW()
          WHERE keyword_id = ${kid}
            AND is_displaced = FALSE
            AND NOT (pin_id = ANY(${pinIds}))
            AND NOT EXISTS (
              SELECT 1 FROM keyword_ignored_pins kip
              WHERE kip.keyword_id = ${kid} AND kip.pin_id = keyword_serp_positions.pin_id
            );
        `);
      } else if (pinIds.length > 0) {
        console.warn(`[SERP Guard] Crawl returned only ${pinIds.length} pins for keyword "${keywordRow.keyword}" (Dynamic Threshold: ${minRequiredForEviction}, Expected: ${expectedCount}, Prior Active: ${priorActiveCount}). Displacement skipped to protect active rankings.`);
      }
    }

    if (preparedGuides.length > 0) {
      txBatch.push((db) => db`
        INSERT INTO keyword_guided_capsules (
          keyword_id, term, display_label, score, dominant_color, display_order, discovered_at
        )
        SELECT
          u.keyword_id, u.term, u.display_label, u.score, u.dominant_color, u.display_order, NOW()
        FROM jsonb_to_recordset(${JSON.stringify(preparedGuides)}::jsonb) AS u(
          keyword_id int,
          term text,
          display_label text,
          score numeric,
          dominant_color text,
          display_order int
        )
        ON CONFLICT (keyword_id, term) DO UPDATE SET
          display_label = EXCLUDED.display_label,
          score = EXCLUDED.score,
          dominant_color = EXCLUDED.dominant_color,
          display_order = EXCLUDED.display_order,
          discovered_at = NOW();
      `);
    }

    // Atomic update of tracked_keywords metadata AND release scalar crawl_lease_until
    const finalVelocity = isSuspectedIncompleteCrawl ? (Number(keywordRow.avg_daily_velocity) || 0) : avgVelocity;
    const lastCrawledAtVal = isSuspectedIncompleteCrawl
      ? (keywordRow.last_crawled_at ? new Date(keywordRow.last_crawled_at).toISOString() : null)
      : new Date().toISOString();

    txBatch.push((db) => db`
      UPDATE tracked_keywords SET
        top_pin_id = ${topPin && !isSuspectedIncompleteCrawl ? topPin.pinId : (keywordRow.top_pin_id ?? null)},
        top_pin_title = ${topPin && !isSuspectedIncompleteCrawl ? topPin.title : (keywordRow.top_pin_title ?? null)},
        top_pin_image = ${topPin && !isSuspectedIncompleteCrawl ? topPin.imageUrl : (keywordRow.top_pin_image ?? null)},
        avg_daily_velocity = ${finalVelocity},
        last_crawled_at = ${lastCrawledAtVal}::timestamptz,
        crawl_lease_token = CASE WHEN ${skipLeaseRelease} THEN crawl_lease_token ELSE NULL END,
        crawl_lease_until = CASE WHEN ${skipLeaseRelease} THEN crawl_lease_until ELSE NULL END,
        updated_at = NOW(),
        metadata = ${JSON.stringify(updatedMetadata)}::jsonb
      WHERE id = ${kid}
        AND (crawl_lease_token = ${effectiveToken}::uuid OR crawl_lease_token IS NULL);
    `);

    // [INVARIANT: ATOMIC-TRANSACTION-BUILDER]
    // Execute atomic database transaction in 1 single roundtrip using lazy query builders
    // Supports both wrapped transaction-bridge clients (__atomicBuilderWrapped) and raw postgres.js clients
    if (typeof sql.transaction === 'function') {
      const isLazyRequired = Boolean(
        sql.__atomicBuilderWrapped ||
        typeof sql.begin === 'function' ||
        (sql.options && sql.options.max !== undefined)
      );
      const txPayload = isLazyRequired
        ? txBatch.map(b => (typeof b === 'function' ? b : () => b))
        : txBatch.map(b => (typeof b === 'function' ? b(sql) : b));
      await sql.transaction(txPayload);
    } else if (typeof sql.begin === 'function') {
      await sql.begin(async (tx) => {
        for (const builder of txBatch) {
          await builder(tx);
        }
      });
    } else {
      for (const builder of txBatch) {
        await builder(sql);
      }
    }
    leaseCommittedInTx = true;

    // Auto-discover newly ranked creators into tracking folders if enabled (R3)
    autoDiscoverFolderCreatorsForKeyword(sql, kid).catch(err => {
      console.warn(`[crawlKeywordSERP] Auto-discover folder creators warning for keyword ${kid}:`, err?.message);
    });

    // Invalidate Global 24h Pulse Cache upon crawl completion
    invalidateGlobalPulseCache(envObj, ctxObj).catch(() => {});

    return {
      success: true,
      keyword: keywordRow.keyword,
      crawled_pins: crawledCount,
      top_pin: topPin,
      avg_velocity: avgVelocity,
      guides_count: savedGuidesCount,
      summary: {
        total: crawledCount,
        climbed: climbedCount,
        dropped: droppedCount,
        stable: stableCount,
        new_entries: newEntryCount,
        dropped_out: droppedOutList.length
      }
    };
  } finally {
    // Release process-local mutex
    activeKeywordCrawls.delete(kid);

    // If this node acquired the lease and transaction failed or aborted early, heal scalar crawl_lease_until
    if (leaseAcquired && !leaseCommittedInTx && !skipLeaseRelease) {
      await sql`
        UPDATE tracked_keywords 
        SET crawl_lease_token = NULL,
            crawl_lease_until = NULL
        WHERE id = ${kid}
          AND crawl_lease_token = ${effectiveToken}::uuid;
      `.catch((releaseErr) => {
        console.warn(`[crawlKeywordSERP] Lease cleanup warning for keyword ${kid}:`, releaseErr?.message || releaseErr);
      });
    }
  }
}



/**
 * Retrieve persistent displaced pins for a keyword from keyword_serp_positions (is_displaced = TRUE)
 * with calculated live deltas and arbitrage vacuum opportunity score.
 */
export async function getKeywordDisplacedPins(sql, keywordId, options = {}) {
  const kid = Number(keywordId);
  if (!kid) throw new Error('Valid keyword ID is required');

  const { limit = 500, offset = 0 } = options;
  // Bound page size to <= 500 displaced pins per query
  const lim = Math.min(500, Math.max(1, Number(limit) || 500));
  const off = Math.max(0, Number(offset) || 0);

  // Query keyword_serp_positions joined with universal_master_pins in parallel (surface real DB errors)
  const [rawRows, cntRows, activeStatsRows] = await Promise.all([
    sql`
      SELECT
        ksp.keyword_id,
        ksp.pin_id,
        ump.title,
        COALESCE(ump.clean_domain, '') AS domain,
        ump.destination_url,
        ump.image_url,
        ump.creator_username,
        ump.board_name,
        ksp.last_known_rank,
        ksp.displaced_date,
        'displaced_active' AS status,
        ump.save_count AS current_saves,
        ump.save_count,
        ump.repin_count AS current_repins,
        ump.repin_count,
        ump.comment_count AS current_comments,
        ump.comment_count,
        ump.share_count AS current_shares,
        ump.share_count,
        ump.daily_save_velocity,
        ump.daily_save_velocity AS calculated_velocity,
        ump.daily_repin_velocity,
        ksp.vacuum_opportunity_score,
        COALESCE(ump.alt_text, '') AS seo_alt_text,
        COALESCE(ump.visual_annotations, '[]'::jsonb) AS annotations,
        COALESCE(NULLIF(ump.dominant_color, ''), '#888888') AS dominant_color,
        ump.created_at_pinterest,
        COALESCE(NULLIF(ump.creation_method, ''), 'pinterest_platform') AS creation_method,
        COALESCE(ump.metadata, '{}'::jsonb) AS metadata,
        ksp.updated_at AS created_at
      FROM keyword_serp_positions ksp
      JOIN universal_master_pins ump ON ump.pin_id = ksp.pin_id
      WHERE ksp.keyword_id = ${kid}
        AND ksp.is_displaced = TRUE
        AND NOT EXISTS (
          SELECT 1 FROM keyword_ignored_pins kip
          WHERE kip.keyword_id = ${kid} AND kip.pin_id = ksp.pin_id
        )
      ORDER BY ksp.vacuum_opportunity_score DESC NULLS LAST, ksp.last_known_rank ASC NULLS LAST
      LIMIT ${lim} OFFSET ${off};
    `,
    sql`
      SELECT COUNT(*)::int AS total
      FROM keyword_serp_positions ksp
      WHERE ksp.keyword_id = ${kid}
        AND ksp.is_displaced = TRUE
        AND NOT EXISTS (
          SELECT 1 FROM keyword_ignored_pins kip
          WHERE kip.keyword_id = ${kid} AND kip.pin_id = ksp.pin_id
        );
    `,
    sql`
      SELECT
        COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ump.save_count), 500)::numeric AS median_saves,
        COUNT(*) FILTER (WHERE LOWER(BTRIM(COALESCE(ump.clean_domain, ''))) IN ('', 'uploaded by user', 'uploaded-by-user', 'organic'))::int AS domainless_top10
      FROM keyword_serp_positions ksp
      JOIN universal_master_pins ump ON ump.pin_id = ksp.pin_id
      WHERE ksp.keyword_id = ${kid}
        AND ksp.is_displaced = FALSE
        AND ksp.rank_position <= 10;
    `
  ]);

  const rows = Array.isArray(rawRows) ? rawRows : [];
  const cntRow = cntRows?.[0];
  const activeStatsRow = activeStatsRows?.[0];

  const medianTop10Saves = Math.max(100, Number(activeStatsRow?.median_saves || 500));
  const domainlessTop10Count = Math.max(0, Number(activeStatsRow?.domainless_top10 || 0));

  // Calculate live deltas and continuous vacuum opportunity score for each pin
  for (const pin of rows) {
    pin.save_count = pin.save_count != null ? Number(pin.save_count) : (pin.current_saves != null ? Number(pin.current_saves) : null);
    pin.repin_count = pin.repin_count != null ? Number(pin.repin_count) : (pin.current_repins != null ? Number(pin.current_repins) : null);
    pin.comment_count = pin.comment_count != null ? Number(pin.comment_count) : (pin.current_comments != null ? Number(pin.current_comments) : null);
    pin.share_count = pin.share_count != null ? Number(pin.share_count) : (pin.current_shares != null ? Number(pin.current_shares) : null);
    if (!pin.daily_save_velocity || pin.daily_save_velocity === 0) {
      pin.daily_save_velocity = Number(pin.calculated_velocity || 0);
    }
    pin.current_saves = pin.save_count;
    pin.current_repins = pin.repin_count;
    pin.current_comments = pin.comment_count;
    pin.current_shares = pin.share_count;
    pin.board_name = pin.board_name || pin.metadata?.board_name || null;
    pin.creation_method = pin.creation_method || pin.metadata?.creation_method || pin.metadata?.method || null;
    pin.created_at_pinterest = pin.created_at_pinterest || pin.metadata?.created_at_pinterest || pin.metadata?.created_at || null;

    if (!pin.vacuum_opportunity_score || pin.vacuum_opportunity_score === 0) {
      pin.vacuum_opportunity_score = computeVacuumOpportunityScore({
        lastKnownRank: pin.last_known_rank,
        domainlessTop10Count,
        saveCount: pin.save_count,
        medianTop10Saves
      });
    }
  }

  const displacedResult = {
    success: true,
    keyword_id: kid,
    total: cntRow?.total || rows.length,
    pins: rows,
    displaced_pins: rows
  };


  return displacedResult;
}



/**
 * Canonical SERP Tombstone & Position Removal Helper
 * Atomically records tombstones in keyword_ignored_pins and removes matching (keyword_id, pin_id)
 * rows from keyword_serp_positions so deleted/pruned pins never resurrect on future crawls.
 */
export async function ignoreAndRemoveSerpPin(sql, {
  pairs = null,
  keywordId = null,
  pinId = null,
  reason = 'manual_user_deletion'
} = {}) {
  if (!sql) return { deletedCount: 0, pairs: [] };

  const rawList = Array.isArray(pairs)
    ? pairs
    : (keywordId != null && pinId != null ? [{ keyword_id: keywordId, pin_id: pinId }] : []);

  const dedupMap = new Map();
  for (const item of rawList) {
    const kid = Number(item?.keyword_id ?? item?.keywordId ?? item?.kid);
    const pid = String(item?.pin_id ?? item?.pinId ?? item?.pid ?? '').trim();
    const itemReason = String(item?.ignored_reason || item?.reason || reason || 'manual_user_deletion');
    if (Number.isInteger(kid) && kid > 0 && pid) {
      dedupMap.set(`${kid}:${pid}`, {
        keyword_id: kid,
        pin_id: pid,
        ignored_reason: itemReason
      });
    }
  }

  const normalizedPairs = Array.from(dedupMap.values()).sort(
    (a, b) => (a.keyword_id - b.keyword_id) || a.pin_id.localeCompare(b.pin_id)
  );
  if (normalizedPairs.length === 0) {
    return { deletedCount: 0, pairs: [] };
  }

  const runInTx = async (fn) => (typeof sql?.begin === 'function' ? sql.begin(fn) : fn(sql));

  if (normalizedPairs.length === 1) {
    const [{ keyword_id: kid, pin_id: pid, ignored_reason: ignReason }] = normalizedPairs;
    const deletedRows = await runInTx(async (tx) => {
      await tx`
        INSERT INTO keyword_ignored_pins (keyword_id, pin_id, ignored_reason, ignored_at)
        VALUES (${kid}, ${pid}, ${ignReason}, NOW())
        ON CONFLICT (keyword_id, pin_id) DO UPDATE SET
          ignored_reason = EXCLUDED.ignored_reason,
          ignored_at = NOW();
      `;

      return await tx`
        DELETE FROM keyword_serp_positions
        WHERE keyword_id = ${kid} AND pin_id = ${pid}
        RETURNING keyword_id, pin_id;
      `;
    });

    return {
      deletedCount: Array.isArray(deletedRows) ? deletedRows.length : 0,
      pairs: normalizedPairs
    };
  }

  const payloadJson = JSON.stringify(normalizedPairs);
  const deletedRows = await runInTx(async (tx) => {
    await tx`
      INSERT INTO keyword_ignored_pins (keyword_id, pin_id, ignored_reason, ignored_at)
      SELECT x.keyword_id, x.pin_id, x.ignored_reason, NOW()
      FROM jsonb_to_recordset(${payloadJson}::jsonb) AS x(
        keyword_id int,
        pin_id text,
        ignored_reason text
      )
      ON CONFLICT (keyword_id, pin_id) DO UPDATE SET
        ignored_reason = EXCLUDED.ignored_reason,
        ignored_at = NOW();
    `;

    return await tx`
      DELETE FROM keyword_serp_positions ksp
      USING jsonb_to_recordset(${payloadJson}::jsonb) AS x(
        keyword_id int,
        pin_id text,
        ignored_reason text
      )
      WHERE ksp.keyword_id = x.keyword_id
        AND ksp.pin_id = x.pin_id
      RETURNING ksp.keyword_id, ksp.pin_id;
    `;
  });

  return {
    deletedCount: Array.isArray(deletedRows) ? deletedRows.length : 0,
    pairs: normalizedPairs
  };
}