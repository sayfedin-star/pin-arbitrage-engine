/**
 * Creator Catalog Ingestion, Reconciliation & Fast Refresh Service
 * Split from src/modules/creators/service.mjs (Layer 2 — depends on competitors-crud)
 * // [INVARIANT: ZERO-HUB-SNAPSHOTS]
 * // [INVARIANT: FOUR-PILLAR-SYNC-PARITY]
 * // [INVARIANT: ONE-WAY-PROMOTION]
 */

import crypto from 'node:crypto';
import { formatPinterestCookie } from '../../utils.mjs';
import { redactSecrets } from '../../http/security-and-response.mjs';
import { fetchUserActivityPinsResource, fetchPinFromPinResource, fetchPinsBatchFromPidgets, sleep, randomJitterMs } from '../../core/pinterest/index.mjs';
import { syncPinAcrossAllFourPillars, ingestPinsBatch as repoIngestPinsBatch } from '../pins/repository.mjs';
import {
  normalizePinterestUsername,
  resolveQualificationRules,
  getCompetitorRules,
  resolveNumericCompetitorId,
  getQualificationRules,
  isPinQualified
} from './competitors-crud.mjs';

function buildFallbackBoardId(competitorId, boardName) {
  const norm = String(boardName || '').trim().toLowerCase();
  if (!norm) return '';
  const hash = crypto.createHash('md5').update(`${competitorId}:${norm}`).digest('hex').slice(0, 16);
  return `cb-${hash}`;
}

/**
 * Bulk upserts raw pins from Pinterest into 4-table SSOT (universal_master_pins & competitor_board_pins)
 */
export async function upsertCompetitorPins(sql, competitorId, pins, options = {}) {
  if (!competitorId || !Array.isArray(pins) || pins.length === 0) return 0;

  const numericId = Number(competitorId);
  if (!Number.isFinite(numericId) || numericId <= 0) return 0;

  const boardLookupMap = new Map();
  const needsBoardResolution = pins.some(
    p => !(p?.board_id || p?.board?.entityId || p?.board?.id || options.board_id) && p?.board_name
  );
  if (needsBoardResolution && typeof sql === 'function') {
    try {
      const boardRows = await sql`
        SELECT board_id, name
        FROM competitor_boards
        WHERE competitor_id = ${numericId};
      `;
      if (Array.isArray(boardRows)) {
        for (const br of boardRows) {
          const normName = String(br?.name || '').trim().toLowerCase();
          const bid = String(br?.board_id || '').trim();
          if (normName && bid && (!boardLookupMap.has(normName) || !bid.startsWith('cb-'))) {
            boardLookupMap.set(normName, bid);
          }
        }
      }
    } catch (_) {}
  }

  const cleanedPins = [];
  for (const p of pins) {
    const pinId = String(p.pin_id || p.id || p.pinId || '').trim();
    if (!pinId) continue;

    const rawSaves = p.save_count != null ? Number(p.save_count) : (p.saves != null ? Number(p.saves) : null);
    const hasExplicitSaves = p.has_explicit_saves !== undefined
      ? Boolean(p.has_explicit_saves)
      : (rawSaves !== null && rawSaves > 0);
    const rawRepins = p.repin_count != null ? Number(p.repin_count) : (p.repins != null ? Number(p.repins) : null);
    const hasExplicitRepins = p.has_explicit_repins !== undefined
      ? Boolean(p.has_explicit_repins)
      : (rawRepins !== null && rawRepins > 0);

    const boardName = String(p.board_name || p.board?.name || '').trim();
    const normBoardName = boardName.toLowerCase();
    const explicitBoardId = String(p.board_id || p.board?.entityId || p.board?.id || options.board_id || '').trim();
    const resolvedBoardId = explicitBoardId
      || (normBoardName ? (boardLookupMap.get(normBoardName) || buildFallbackBoardId(numericId, boardName)) : '');

    cleanedPins.push({
      ...p,
      pin_id: pinId,
      competitor_id: numericId,
      creator_username: p.creator_username || options.creator_username || p.account_username || options.account_username || null,
      account_username: p.account_username || options.account_username || p.creator_username || options.creator_username || null,
      title: p.title || '',
      description: p.description || '',
      link_domain: p.domain || p.link_domain || '',
      destination_url: p.destination_url || p.link || '',
      board_id: resolvedBoardId,
      board_name: boardName,
      board_slug: boardName.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, ''),
      image_url: p.image_url || '',
      dominant_color: p.dominant_color || null,
      image_signature: p.image_signature || null,
      visual_annotations: p.visual_annotations || null,
      canonical_pin_id: p.canonical_pin_id || null,
      save_count: rawSaves,
      repin_count: rawRepins,
      comment_count: p.comment_count != null ? Number(p.comment_count) : (p.comments != null ? Number(p.comments) : null),
      has_explicit_saves: hasExplicitSaves,
      has_explicit_repins: hasExplicitRepins,
      was_live_scraped: p.was_live_scraped !== undefined
        ? Boolean(p.was_live_scraped)
        : (p.from_hydration_cache !== true && p.scrape_failed !== true && hasExplicitSaves),
      is_product: Boolean(p.is_product),
      created_at_pinterest: (p.created_at_pinterest && !isNaN(new Date(p.created_at_pinterest).getTime())) ? new Date(p.created_at_pinterest).toISOString() : null
    });
  }

  if (cleanedPins.length === 0) return 0;

  const res = await repoIngestPinsBatch(sql, cleanedPins, {
    competitor_id: numericId,
    board_id: options.board_id || null,
    pillar: 'creator',
    ...options
  });
  return (res.inserted || 0) + (res.updated || 0) || cleanedPins.length;
}

/**
 * Ingest a batch of formatted pins into 4-table SSOT.
 * Consolidates into repoIngestPinsBatch in repository.mjs.
 */
export async function ingestPinsBatch(sql, pins, accountUsername = null, maybeOptions = {}) {
  let opts = {};
  let username = null;
  if (typeof accountUsername === 'object' && accountUsername !== null) {
    opts = accountUsername;
    username = opts.accountUsername || opts.creator_username || null;
  } else {
    username = accountUsername;
    opts = maybeOptions || {};
  }
  return await repoIngestPinsBatch(sql, pins, {
    ...opts,
    creator_username: username,
    account_username: username
  });
}


/**
 * Re-evaluate candidate pins stored in universal_master_pins against active rules
 */
export async function reEvaluateArchivedPins(sql, rules = null, accountUsername = null) {
  const activeRules = rules || (await getQualificationRules(sql));
  const cleanUser = accountUsername ? String(accountUsername).replace(/^@+/, '').trim().toLowerCase() : null;
  
  // If master ingest is disabled, no pins qualify for active ingestion (read-only evaluation)
  if (activeRules.master_ingest_enabled === false) {
    const [cnt] = await sql`
      SELECT count(*)::int AS total
      FROM universal_master_pins
      WHERE (${cleanUser}::text IS NULL OR creator_username = ${cleanUser});
    `;
    const total = cnt?.total || 0;
    return {
      ok: true,
      total_evaluated: total,
      qualified_count: 0,
      disqualified_count: total,
      disqualified_pruned: 0,
      rules: activeRules
    };
  }

  const resolvedGlobal = resolveQualificationRules(activeRules);
  const t1 = resolvedGlobal.tier1_min_saves;
  const t2 = resolvedGlobal.tier2_min_repins;
  const t2Vel = resolvedGlobal.tier2_min_velocity;
  const t2Days = resolvedGlobal.tier2_max_age_days;
  const t3Days = resolvedGlobal.tier3_max_age_days;
  const t3Saves = resolvedGlobal.tier3_min_saves;

  const [res] = await sql`
    WITH target_pins AS (
      SELECT pin_id, save_count, repin_count, created_at_pinterest, daily_save_velocity
      FROM universal_master_pins
      WHERE (${cleanUser}::text IS NULL OR creator_username = ${cleanUser})
    ),
    evaluated AS (
      SELECT
        pin_id,
        (
          COALESCE(save_count, 0) >= ${t1} 
          OR COALESCE(repin_count, 0) >= ${t2}
          OR (
            created_at_pinterest IS NOT NULL
            AND created_at_pinterest >= NOW() - (${t2Days} * INTERVAL '1 day')
            AND (
              COALESCE(daily_save_velocity, 0) >= ${t2Vel}
              OR (COALESCE(save_count, 0)::numeric / GREATEST(1.0, EXTRACT(EPOCH FROM (NOW() - created_at_pinterest)) / 86400.0)) >= ${t2Vel}
            )
          )
          OR (
            created_at_pinterest IS NOT NULL
            AND created_at_pinterest >= NOW() - (${t3Days} * INTERVAL '1 day')
            AND COALESCE(save_count, 0) >= ${t3Saves}
          )
        ) AS is_qualified
      FROM target_pins
    )
    SELECT
      (SELECT count(*)::int FROM target_pins) AS total_pins,
      (SELECT count(*)::int FROM evaluated WHERE is_qualified = TRUE) AS qualified_pins;
  `;

  const total = Number(res?.total_pins || 0);
  const qualified = Number(res?.qualified_pins || 0);
  const disqualified = Math.max(0, total - qualified);

  return {
    ok: true,
    total_evaluated: total,
    qualified_count: qualified,
    disqualified_count: disqualified,
    disqualified_pruned: 0,
    rules: activeRules
  };
}


/**
 * Re-evaluate competitor pins against custom qualification rules.
 */
export async function reEvaluateCompetitorPins(sql, competitorId) {
  const numericId = await resolveNumericCompetitorId(sql, competitorId);
  if (!numericId || isNaN(numericId)) throw new Error('Valid competitorId is required.');

  const { rules, username } = await getCompetitorRules(sql, numericId);

  const resolved = resolveQualificationRules(rules, {
    deriveTiersFromSaves: true,
    defaultArticlesOnly: true
  });
  const minSaves = resolved.tier1_min_saves;
  const minRepins = resolved.tier2_min_repins;
  const minVelocity = resolved.tier2_min_velocity;
  const maxAgeDays = resolved.tier2_max_age_days;
  const freshDays = resolved.tier3_max_age_days;
  const freshMinSaves = resolved.tier3_min_saves;
  const articlesOnly = resolved.articles_only;
  const allowVelocityFallback = Boolean(minSaves <= 100 && minVelocity <= 3.5);

  // Fetch all pins meeting the 3-tier rules from competitor_board_pins JOIN universal_master_pins
  const [res] = await sql`
    WITH comp_pins AS (
      SELECT 
        cbp.pin_id,
        ump.save_count,
        ump.repin_count,
        ump.daily_save_velocity,
        ump.created_at_pinterest,
        ump.is_product
      FROM competitor_board_pins cbp
      JOIN universal_master_pins ump ON ump.pin_id = cbp.pin_id
      WHERE cbp.competitor_id = ${numericId}
    ),
    evaluated AS (
      SELECT 
        pin_id,
        (
          COALESCE(save_count, 0) >= ${minSaves}
          OR COALESCE(repin_count, 0) >= ${minRepins}
          OR (
            created_at_pinterest >= NOW() - (${freshDays} || ' days')::interval
            AND COALESCE(save_count, 0) >= ${freshMinSaves}
          )
          OR (
            created_at_pinterest >= NOW() - (${maxAgeDays} || ' days')::interval
            AND (
              COALESCE(daily_save_velocity, 0) >= ${minVelocity}
              OR (COALESCE(save_count, 0)::numeric / GREATEST(1.0, EXTRACT(EPOCH FROM (NOW() - created_at_pinterest)) / 86400)) >= ${minVelocity}
              OR (${allowVelocityFallback} = TRUE AND COALESCE(save_count, 0) >= 50 AND (COALESCE(save_count, 0)::numeric / GREATEST(1.0, EXTRACT(EPOCH FROM (NOW() - created_at_pinterest)) / 86400)) >= 2.0)
            )
          )
        ) AND (${articlesOnly} = FALSE OR (is_product IS NULL OR is_product = FALSE)) AS is_qualified
      FROM comp_pins
    )
    SELECT
      (SELECT count(*)::int FROM comp_pins) AS total_count,
      (SELECT count(*)::int FROM evaluated WHERE is_qualified = TRUE) AS qualified_count;
  `;

  return {
    ok: true,
    competitor_id: numericId,
    username,
    qualified_count: Number(res?.qualified_count || 0),
    total_count: Number(res?.total_count || 0),
    pruned_count: 0,
    rules
  };
}


/**
 * Harvest winning pins for a competitor into PinArchive using Early-Stop (daily) or Deep Sweep (audit)
 * Evaluates all pins against active Pin Qualification Rules (Tier 1/2/3 OR Criteria).
 */
export async function syncCompetitorPins(sql, competitorId, username, { mode = 'daily', maxPages = null, cookie = '', fastJitter = false, disableEarlyStop = false } = {}) {
  let cleanUsername = normalizePinterestUsername(username);
  let numericId = parseInt(competitorId, 10);

  if (cleanUsername) {
    try {
      const [c] = await sql`SELECT id, username FROM competitor_profiles WHERE LOWER(username) = ${cleanUsername} LIMIT 1;`;
      if (c?.id) {
        numericId = c.id;
        cleanUsername = c.username;
      }
    } catch (_) {}
  } else if (!cleanUsername && !isNaN(numericId)) {
    try {
      const [c] = await sql`SELECT id, username FROM competitor_profiles WHERE id = ${numericId} LIMIT 1;`;
      if (c?.username) cleanUsername = c.username;
    } catch (_) {}
  }

  if (!cleanUsername) throw new Error('Username is required');

  const globalRules = await getQualificationRules(sql);
  let compRules = null;
  if (numericId && !isNaN(numericId)) {
    try {
      const cr = await getCompetitorRules(sql, numericId);
      compRules = cr?.rules;
    } catch (_) {}
  }
  const rules = resolveQualificationRules(compRules || {}, {
    base: globalRules,
    defaultArticlesOnly: true
  });
  if (rules.master_ingest_enabled === false) {
    return { ok: false, error: 'Master Ingest is currently disabled in Pin Qualification Rules.' };
  }

  // Enforce paused_policy: reject if competitor is inactive
  const safeId = isNaN(numericId) ? -1 : numericId;
  const [profile] = await sql`
    SELECT id, username, is_active, metadata FROM competitor_profiles 
    WHERE id = ${safeId} OR LOWER(username) = ${cleanUsername} 
    LIMIT 1;
  `;
  if (profile && profile.is_active === false && String(rules.paused_policy).toLowerCase() === 'reject') {
    return { ok: false, error: `Competitor @${cleanUsername} is paused/inactive and paused_policy is set to 'reject'.` };
  }
  const shouldAutoArchive = profile?.metadata?.auto_archive_winning !== false;

  // Determine pagination depth: full/all/deep/discovery or disableEarlyStop bypasses the legacy early_stop_pages=3 cap
  const numMaxPages = (maxPages !== null && maxPages !== undefined && !isNaN(Number(maxPages)) && Number(maxPages) > 0)
    ? Number(maxPages)
    : null;
  const accountMaxPages = Number(rules.max_pages) || 500;
  const accountEarlyStop = Number(rules.early_stop_pages) || 3;
  let pageLimit = disableEarlyStop ? (numMaxPages ? Math.min(numMaxPages, 2000) : accountMaxPages) : accountEarlyStop;
  if (mode === 'all' || mode === 'full') {
    pageLimit = numMaxPages ? Math.min(numMaxPages, 2000) : accountMaxPages;
  } else if (mode === 'deep' || mode === 'discovery') {
    pageLimit = numMaxPages ? Math.min(numMaxPages, 2000) : (Number(rules.max_pages) || Number(rules.discovery_max_pages) || 500);
  } else if (numMaxPages) {
    pageLimit = numMaxPages;
  }

  const formattedCookie = formatPinterestCookie(cookie);

  let currentBookmark = null;
  let lastSeenBookmark = null;
  let totalFetched = 0;
  let allQualifiedCount = 0;
  let pagesCrawled = 0;
  const errors = [];

  for (let page = 1; page <= pageLimit; page++) {
    pagesCrawled++;
    const res = await fetchUserActivityPinsResource(cleanUsername, currentBookmark, formattedCookie);
    if (!res.ok) {
      const errMsg = redactSecrets(res.error || `Pinterest API returned error ${res.status}`);
      errors.push({ stage: 'created_feed', page, message: errMsg });
      if (page === 1) return { ok: false, error: errMsg, errors };
      console.warn(`[syncCompetitorPins] @${cleanUsername} stopped on page ${page}: ${errMsg}`);
      break;
    }

    const pins = res.pins || [];
    totalFetched += pins.length;

    // 1. Always store ALL raw fetched pins in 4-table SSOT
    if (pins.length > 0 && numericId) {
      await upsertCompetitorPins(sql, numericId, pins, {
        competitor_id: numericId,
        creator_username: cleanUsername,
        account_username: cleanUsername
      });
    }

    // 2. Count qualified winning pins
    if (pins.length > 0 && mode !== 'discovery' && shouldAutoArchive) {
      for (const p of pins) {
        if (isPinQualified(p, rules)) allQualifiedCount++;
      }
    }

    // Real-time progress feedback in workflow logs
    if (page === 1 || page % 10 === 0) {
      console.log(`    [✓] Ingestion Progress: Page ${page}/${pageLimit} (${totalFetched} pin IDs discovered so far)...`);
    }

    currentBookmark = res.nextBookmark;
    if (!currentBookmark || currentBookmark === '-end-' || currentBookmark === lastSeenBookmark) break; // End of feed
    lastSeenBookmark = currentBookmark;

    // Inject jitter delay between pages (discovery or fastJitter: 250-450ms for high-speed indexing; refresh/daily: 1500-2500ms)
    if (page < pageLimit) {
      const delay = (mode === 'discovery' || fastJitter === true) ? randomJitterMs(250, 450) : randomJitterMs(1500, 2500);
      await sleep(delay);
    }
  }

  // Auto-backfill discovered boards from competitor_board_pins & universal_master_pins into competitor_boards
  if (numericId && cleanUsername) {
    try {
      await sql`
        INSERT INTO competitor_boards (competitor_id, board_id, name, url, pin_count, follower_count, last_pinned_at, created_at, updated_at)
        SELECT 
          ${numericId},
          'cb-' || substr(md5(lower(trim(cp.board_name))), 1, 16),
          trim(cp.board_name),
          'https://www.pinterest.com/' || ${cleanUsername} || '/' || lower(regexp_replace(trim(cp.board_name), '[^a-zA-Z0-9]+', '-', 'g')) || '/',
          count(*)::int,
          0::int,
          max(cp.created_at_pinterest),
          min(cp.created_at_pinterest),
          NOW()
        FROM competitor_board_pins cbp
        JOIN universal_master_pins cp ON cp.pin_id = cbp.pin_id
        WHERE cbp.competitor_id = ${numericId} 
          AND cp.board_name IS NOT NULL 
          AND trim(cp.board_name) <> ''
          AND NOT EXISTS (
            SELECT 1 FROM competitor_boards cb 
            WHERE cb.competitor_id = ${numericId} 
              AND lower(trim(cb.name)) = lower(trim(cp.board_name))
          )
        GROUP BY trim(cp.board_name)
        ON CONFLICT (competitor_id, board_id) DO NOTHING;
      `;
    } catch (err) {
      const safeMsg = redactSecrets(err.message);
      console.warn(`[syncCompetitorPins] Board backfill warning for @${cleanUsername}:`, safeMsg);
      errors.push({ stage: 'board_backfill', message: safeMsg });
    }
  }

  // Update harvest metadata on competitor profile without clobbering total_pins published catalog
  const harvestMeta = {
    last_sync_mode: mode,
    pages_crawled: pagesCrawled,
    total_fetched: totalFetched,
    qualified_archived: allQualifiedCount,
    synced_at: new Date().toISOString()
  };

  await sql`
    UPDATE competitor_profiles
    SET last_harvest_metadata = COALESCE(competitor_profiles.last_harvest_metadata, '{}'::jsonb) || ${JSON.stringify(harvestMeta)}::jsonb,
        last_synced_at = NOW(),
        updated_at = NOW()
    WHERE LOWER(username) = ${cleanUsername} OR id = ${isNaN(numericId) ? -1 : numericId};
  `;

  return {
    ok: true,
    mode,
    pages_crawled: pagesCrawled,
    total_fetched: totalFetched,
    crawled: totalFetched,
    qualified: allQualifiedCount,
    inserted: allQualifiedCount,
    qualified_archived: allQualifiedCount,
    errors,
    metadata: harvestMeta
  };
}


/**
 * Fast Refresh:
 * Refreshes live metrics (saves, repins, comments, reactions) of all archived/winning pins
 * for a specific competitor directly from Pinterest unauthenticated.
 * Enforces monotonic ratchet so metrics NEVER drop.
 */
export async function fastRefreshCompetitorArchivedPins(sql, competitorIdOrUsername, options = {}) {
  const numericId = await resolveNumericCompetitorId(sql, competitorIdOrUsername);
  let cleanUsername = null;
  if (numericId) {
    const [comp] = await sql`SELECT username FROM competitor_profiles WHERE id = ${numericId};`;
    cleanUsername = comp ? comp.username : null;
  } else {
    cleanUsername = normalizePinterestUsername(competitorIdOrUsername);
  }

  if (!cleanUsername) {
    return { ok: false, error: 'Valid competitor ID or username is required.' };
  }

  // Get all winning pins currently archived for this account in universal_master_pins
  const pinsToRefresh = await sql`
    SELECT
      pin_id,
      title,
      save_count AS saves,
      repin_count AS repins,
      comment_count AS comments,
      (visual_annotations IS NOT NULL AND jsonb_array_length(COALESCE(visual_annotations, '[]'::jsonb)) > 0) AS has_annotations
    FROM universal_master_pins
    WHERE creator_username = ${cleanUsername.toLowerCase()}
    ORDER BY save_count DESC NULLS LAST;
  `;

  if (pinsToRefresh.length === 0) {
    return { ok: true, refreshed_count: 0, total_archived: 0, message: 'No archived pins found for this account.' };
  }

  let refreshedCount = 0;
  let pidgetsHits = 0;
  let pinResourceFallbacks = 0;
  const results = [];
  const maxToRefresh = Math.min(pinsToRefresh.length, Number(options.limit) || 200);
  const targetPins = pinsToRefresh.slice(0, maxToRefresh);

  const batchPidgetsFn = typeof options.fetchPinsBatchFromPidgets === 'function'
    ? options.fetchPinsBatchFromPidgets
    : fetchPinsBatchFromPidgets;
  const pinResourceFn = typeof options.fetchPinFromPinResource === 'function'
    ? options.fetchPinFromPinResource
    : fetchPinFromPinResource;

  // Stage 1: 50x Pidgets batch pre-pass
  let pidgetsMap = new Map();
  try {
    const batchRes = await batchPidgetsFn(targetPins.map(p => p.pin_id));
    if (batchRes instanceof Map) pidgetsMap = batchRes;
  } catch (_) {}

  // Stage 2: Selective fallback to fetchPinFromPinResource only when missing or deep fields (annotations/reactions) are needed
  for (let i = 0; i < targetPins.length; i++) {
    const pin = targetPins[i];
    const pid = String(pin.pin_id);
    const pidgetsPin = pidgetsMap.get(pid);
    const hasPidgetsMetrics = Boolean(
      pidgetsPin &&
      !pidgetsPin.is_missing &&
      pidgetsPin.has_explicit_saves &&
      Number(pidgetsPin.saves) > 0
    );
    const needsDeepFields = options.requireDeepFields === true || pin.has_annotations === false;

    let live = null;
    let usedFallback = false;
    try {
      if (hasPidgetsMetrics && !needsDeepFields) {
        live = pidgetsPin;
        pidgetsHits++;
      } else {
        usedFallback = true;
        pinResourceFallbacks++;
        live = await pinResourceFn(pid);
        if ((!live || !(live.saves > 0)) && hasPidgetsMetrics) {
          live = pidgetsPin;
        }
      }

      if (live && live.saves > 0) {
        // [INVARIANT: FOUR-PILLAR-SYNC-PARITY]
        await syncPinAcrossAllFourPillars({
          sql,
          pinId: pid,
          scrapedPin: live,
          env: options?.env || null
        });

        refreshedCount++;
        results.push({ pin_id: pid, saves: live.saves, repins: live.repins });
      }
    } catch (_) {}

    // Small jitter only between individual PinResource fallback calls to prevent 429 rate limits
    if (usedFallback && i < targetPins.length - 1) {
      await sleep(randomJitterMs(150, 300));
    }
  }

  return {
    ok: true,
    refreshed_count: refreshedCount,
    total_archived: pinsToRefresh.length,
    pidgets_hits: pidgetsHits,
    fallback_count: pinResourceFallbacks,
    pins: results
  };
}
