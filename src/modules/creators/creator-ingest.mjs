/**
 * Creator Catalog Ingestion, Reconciliation & Fast Refresh Service
 * Split from src/modules/creators/service.mjs (Layer 2 — depends on competitors-crud)
 * // [INVARIANT: ZERO-HUB-SNAPSHOTS]
 * // [INVARIANT: FOUR-PILLAR-SYNC-PARITY]
 * // [INVARIANT: ONE-WAY-PROMOTION]
 */

import { formatPinterestCookie, sanitizeForJsonb } from '../../utils.mjs';
import { fetchUserActivityPinsResource, fetchPinFromPinResource, sleep, randomJitterMs } from '../../core/pinterest/index.mjs';
import { insertNewPinsBatch, syncPinAcrossAllFourPillars, ingestPinsBatch as repoIngestPinsBatch } from '../pins/repository.mjs';
import { normalizePinterestUsername, parseRuleNumber, STANDARD_QUALIFICATION_DEFAULTS, getCompetitorRules, resolveNumericCompetitorId, getQualificationRules, qualifyPin, isPinQualified } from './competitors-crud.mjs';

/**
 * Bulk upserts raw pins from Pinterest into 4-table SSOT (universal_master_pins & competitor_board_pins)
 */
export async function upsertCompetitorPins(sql, competitorId, pins) {
  if (!competitorId || !Array.isArray(pins) || pins.length === 0) return 0;
  
  const numericId = Number(competitorId);
  const cleanedPins = [];
  for (const p of pins) {
    const pinId = String(p.pin_id || p.id || p.pinId || '').trim();
    if (!pinId) continue;
    cleanedPins.push({
      pin_id: pinId,
      competitor_id: numericId,
      title: p.title || '',
      description: p.description || '',
      link_domain: p.domain || p.link_domain || '',
      destination_url: p.link || p.destination_url || '',
      board_id: p.board_id || '',
      board_name: p.board_name || '',
      board_slug: (p.board_name || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, ''),
      image_url: p.image_url || '',
      save_count: p.save_count != null ? Number(p.save_count) : (p.saves != null ? Number(p.saves) : null),
      repin_count: p.repin_count != null ? Number(p.repin_count) : (p.repins != null ? Number(p.repins) : null),
      comment_count: p.comment_count != null ? Number(p.comment_count) : (p.comments != null ? Number(p.comments) : null),
      is_product: Boolean(p.is_product),
      created_at_pinterest: (p.created_at_pinterest && !isNaN(new Date(p.created_at_pinterest).getTime())) ? new Date(p.created_at_pinterest).toISOString() : null
    });
  }

  if (cleanedPins.length === 0) return 0;

  const res = await repoIngestPinsBatch(sql, cleanedPins, {
    competitor_id: numericId,
    pillar: 'creator'
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

  const t1 = Number(activeRules.tier1_min_saves ?? 100);
  const t2 = Number(activeRules.tier2_min_repins ?? 100);
  const t2Vel = Number(activeRules.tier2_min_velocity ?? 3.5);
  const t2Days = Number(activeRules.tier2_max_age_days ?? 60);
  const t3Days = Number(activeRules.tier3_max_age_days ?? 14);
  const t3Saves = Number(activeRules.tier3_min_saves ?? 25);

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

  const minSaves = parseRuleNumber(rules.tier1_min_saves, 100, 0);
  const minRepins = parseRuleNumber(rules.tier2_min_repins, Math.max(100, minSaves), 0);
  const minVelocity = parseRuleNumber(rules.tier2_min_velocity, 3.5, 0);
  const maxAgeDays = parseRuleNumber(rules.tier2_max_age_days, 60, 1);
  const freshDays = parseRuleNumber(rules.tier3_fresh_days ?? rules.tier3_max_age_days, 14, 1);
  const freshMinSaves = parseRuleNumber(rules.tier3_min_saves, Math.min(minSaves, Math.max(25, Math.floor(minSaves / 2))), 0);
  const articlesOnly = rules.articles_only ?? true;
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
 * Zero-HTTP Reconciliation Pipeline
 * Reconciles catalog pins based on 3-tier qualification rules.
 * Can run for a specific competitor (by numeric ID or username) or across the entire database.
 */
export async function reconcileQualifiedCatalogPins(sql, competitorIdOrUsername = null) {
  if (!sql) throw new Error('Database client (sql) is required.');

  // If competitorIdOrUsername is null, execute per-account evaluation across all active accounts
  if (!competitorIdOrUsername) {
    const competitors = await sql`
      SELECT id, username FROM competitor_profiles
      WHERE is_active = TRUE
        AND COALESCE(account_type, 'competitor') <> 'system';
    `;
    let totalPromoted = 0;
    for (const comp of competitors) {
      const res = await reconcileQualifiedCatalogPins(sql, comp.id);
      totalPromoted += (res?.promoted_or_updated || 0);
    }
    return {
      ok: true,
      competitor_id: null,
      username: null,
      promoted_or_updated: totalPromoted
    };
  }

  // If specific competitor requested, resolve it
  let numericId = null;
  let username = null;

  if (competitorIdOrUsername) {
    const raw = String(competitorIdOrUsername).trim();
    if (/^\d+$/.test(raw)) {
      numericId = Number(raw);
      const [c] = await sql`SELECT id, username FROM competitor_profiles WHERE id = ${numericId} LIMIT 1;`;
      if (c) username = c.username;
    } else {
      const cleanUser = normalizePinterestUsername(raw);
      if (cleanUser) {
        const [c] = await sql`SELECT id, username FROM competitor_profiles WHERE LOWER(username) = ${cleanUser} LIMIT 1;`;
        if (c) {
          numericId = c.id;
          username = c.username;
        }
      }
    }
  }

  // Load competitor-specific rules if single competitor, otherwise standard per-account defaults
  let rules = null;
  if (numericId) {
    try {
      const compRules = await getCompetitorRules(sql, numericId);
      rules = compRules?.rules;
    } catch (_) {}
  }
  if (!rules) {
    rules = { ...STANDARD_QUALIFICATION_DEFAULTS };
  }

  const minSaves = parseRuleNumber(rules.tier1_min_saves ?? rules.min_saves, 100, 0);
  const minRepins = parseRuleNumber(rules.tier2_min_repins ?? rules.min_repins, Math.max(100, minSaves), 0);
  const minVelocity = parseRuleNumber(rules.tier2_min_velocity, 3.5, 0);
  const maxAgeDays = parseRuleNumber(rules.tier2_max_age_days, 60, 1);
  const freshDays = parseRuleNumber(rules.tier3_fresh_days ?? rules.fresh_days ?? rules.tier3_max_age_days, 14, 1);
  const freshMinSaves = parseRuleNumber(rules.tier3_min_saves ?? rules.fresh_min_saves, Math.min(minSaves, Math.max(25, Math.floor(minSaves / 2))), 0);
  const articlesOnly = rules.articles_only ?? true;
  const allowVelocityFallback = Boolean(minSaves <= 100 && minVelocity <= 3.5);

  const [res] = await sql`
    SELECT count(*)::int AS qualified_count
    FROM competitor_board_pins cbp
    JOIN universal_master_pins ump ON ump.pin_id = cbp.pin_id
    WHERE (${numericId}::int IS NULL OR cbp.competitor_id = ${numericId})
      AND (
        COALESCE(ump.save_count, 0) >= ${minSaves}
        OR COALESCE(ump.repin_count, 0) >= ${minRepins}
        OR (
          ump.created_at_pinterest >= NOW() - (${freshDays} || ' days')::interval
          AND COALESCE(ump.save_count, 0) >= ${freshMinSaves}
        )
        OR (
          ump.created_at_pinterest >= NOW() - (${maxAgeDays} || ' days')::interval
          AND (
            COALESCE(ump.daily_save_velocity, 0) >= ${minVelocity}
            OR (COALESCE(ump.save_count, 0)::numeric / GREATEST(1.0, EXTRACT(EPOCH FROM (NOW() - ump.created_at_pinterest)) / 86400)) >= ${minVelocity}
            OR (${allowVelocityFallback} = TRUE AND COALESCE(ump.save_count, 0) >= 50 AND (COALESCE(ump.save_count, 0)::numeric / GREATEST(1.0, EXTRACT(EPOCH FROM (NOW() - ump.created_at_pinterest)) / 86400)) >= 2.0)
          )
        )
      )
      AND (${articlesOnly} = FALSE OR (ump.is_product IS NULL OR ump.is_product = FALSE));
  `;

  return {
    ok: true,
    competitor_id: numericId,
    username,
    promoted_or_updated: Number(res?.qualified_count || 0)
  };
}


/**
 * Harvest winning pins for a competitor into PinArchive using Early-Stop (daily) or Deep Sweep (audit)
 * Evaluates all pins against active Pin Qualification Rules (Tier 1/2/3 OR Criteria).
 */
export async function syncCompetitorPins(sql, competitorId, username, { mode = 'daily', maxPages = null, cookie = '', fastJitter = false } = {}) {
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
  const rules = {
    ...globalRules,
    ...(compRules || {})
  };
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

  // Determine pagination depth based on mode (strictly bounds daily mode to rules.early_stop_pages, discovery/full to rules.max_pages)
  const numMaxPages = (maxPages !== null && maxPages !== undefined && !isNaN(Number(maxPages)) && Number(maxPages) > 0)
    ? Number(maxPages)
    : null;
  const accountMaxPages = Number(rules.max_pages) || 500;
  const accountEarlyStop = Number(rules.early_stop_pages) || 3;
  let pageLimit = accountEarlyStop;
  if (mode === 'all' || mode === 'full') {
    pageLimit = numMaxPages ? Math.min(numMaxPages, 1000) : accountMaxPages;
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

  for (let page = 1; page <= pageLimit; page++) {
    pagesCrawled++;
    const res = await fetchUserActivityPinsResource(cleanUsername, currentBookmark, formattedCookie);
    if (!res.ok) {
      if (page === 1) return { ok: false, error: res.error || `Pinterest API returned error ${res.status}` };
      break; // Stop pagination on error for later pages
    }

    const pins = res.pins || [];
    totalFetched += pins.length;

    // 1. Always store ALL raw fetched pins in 4-table SSOT
    if (pins.length > 0 && numericId) {
      await upsertCompetitorPins(sql, numericId, pins);
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
    } catch (_) {}
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
    SELECT pin_id, title, save_count AS saves, repin_count AS repins, comment_count AS comments
    FROM universal_master_pins
    WHERE creator_username = ${cleanUsername.toLowerCase()}
    ORDER BY save_count DESC NULLS LAST;
  `;

  if (pinsToRefresh.length === 0) {
    return { ok: true, refreshed_count: 0, total_archived: 0, message: 'No archived pins found for this account.' };
  }

  let refreshedCount = 0;
  const results = [];
  const maxToRefresh = Math.min(pinsToRefresh.length, Number(options.limit) || 200);

  for (let i = 0; i < maxToRefresh; i++) {
    const pin = pinsToRefresh[i];
    try {
      const live = await fetchPinFromPinResource(pin.pin_id);
      if (live && live.saves > 0) {
        // [INVARIANT: FOUR-PILLAR-SYNC-PARITY]
        await syncPinAcrossAllFourPillars({
          sql,
          pinId: pin.pin_id,
          scrapedPin: live,
          env: options?.env || null
        });

        refreshedCount++;
        results.push({ pin_id: pin.pin_id, saves: live.saves, repins: live.repins });
      }
    } catch (_) {}

    // Small jitter between pins (150-300ms) to prevent 429 rate limits
    if (i < maxToRefresh - 1) {
      await sleep(randomJitterMs(150, 300));
    }
  }

  return {
    ok: true,
    refreshed_count: refreshedCount,
    total_archived: pinsToRefresh.length,
    pins: results
  };
}
