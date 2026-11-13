/**
 * Creator Catalog Ingestion, Reconciliation & Fast Refresh Service
 * Split from src/modules/creators/service.mjs (Layer 2 — depends on competitors-crud)
 * // [INVARIANT: ZERO-HUB-SNAPSHOTS]
 * // [INVARIANT: FOUR-PILLAR-SYNC-PARITY]
 * // [INVARIANT: ONE-WAY-PROMOTION]
 */

import { formatPinterestCookie, sanitizeForJsonb } from '../../utils.mjs';
import { fetchUserActivityPinsResource, fetchPinFromPinResource, sleep, randomJitterMs } from '../../core/pinterest/index.mjs';
import { insertNewPinsBatch, syncPinAcrossAllFourPillars } from '../pins/repository.mjs';
import { normalizePinterestUsername, parseRuleNumber, STANDARD_QUALIFICATION_DEFAULTS, getCompetitorRules, resolveNumericCompetitorId, getQualificationRules, qualifyPin, isPinQualified } from './competitors-crud.mjs';

/**
 * Bulk upserts raw pins from Pinterest into competitor_pins inventory
 */
export async function upsertCompetitorPins(sql, competitorId, pins) {
  if (!competitorId || !Array.isArray(pins) || pins.length === 0) return 0;
  
  const cleanedPins = [];
  for (const p of pins) {
    const pinId = String(p.pin_id || p.id || '').trim();
    if (!pinId) continue;
    cleanedPins.push({
      pin_id: pinId,
      title: p.title || '',
      description: p.description || '',
      link_domain: p.domain || '',
      destination_url: p.link || '',
      board_name: p.board_name || '',
      board_slug: (p.board_name || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, ''),
      image_url: p.image_url || '',
      save_count: Math.max(0, Number(p.saves) || 0),
      repin_count: Math.max(0, Number(p.repins) || 0),
      comment_count: Math.max(0, Number(p.comments) || 0),
      is_product: Boolean(p.is_product),
      created_at_pinterest: (p.created_at_pinterest && !isNaN(new Date(p.created_at_pinterest).getTime())) ? new Date(p.created_at_pinterest).toISOString() : null
    });
  }

  if (cleanedPins.length === 0) return 0;

  // Deduplicate and sort pins strictly by pin_id ASC to prevent deadlocks
  const uniquePinsMap = new Map();
  for (const p of cleanedPins) {
    if (p.pin_id) uniquePinsMap.set(p.pin_id, p);
  }
  const sortedPins = Array.from(uniquePinsMap.values()).sort((a, b) => a.pin_id.localeCompare(b.pin_id));
  if (sortedPins.length === 0) return 0;

  try {
    await sql`
      INSERT INTO competitor_pins (
        competitor_id, pin_id, title, link_domain,
        destination_url, board_name, board_slug, image_url, save_count, repin_count,
        comment_count, is_product, created_at_pinterest, first_seen_at, last_seen_at, enrichment_status
      )
      SELECT 
        ${competitorId}, x.pin_id, x.title, x.link_domain,
        x.destination_url, x.board_name, COALESCE(NULLIF(x.board_slug, ''), LOWER(REGEXP_REPLACE(REGEXP_REPLACE(x.board_name, '[^[:alnum:]]+', '-', 'g'), '^-|-$', '', 'g'))), x.image_url, x.save_count, x.repin_count,
        x.comment_count, x.is_product, x.created_at_pinterest, NOW(), NOW(), 'pending'
      FROM jsonb_to_recordset(${typeof sql.json === 'function' ? sql.json(sanitizeForJsonb(sortedPins)) : JSON.stringify(sanitizeForJsonb(sortedPins))}::jsonb) AS x(
        pin_id VARCHAR(64), title TEXT, link_domain VARCHAR(255),
        destination_url TEXT, board_name VARCHAR(255), board_slug VARCHAR(255), image_url TEXT,
        save_count INT, repin_count INT, comment_count INT, is_product BOOLEAN, created_at_pinterest TIMESTAMPTZ
      )
      ORDER BY x.pin_id ASC
      ON CONFLICT (competitor_id, pin_id) DO UPDATE SET
        title = CASE WHEN EXCLUDED.title <> '' THEN EXCLUDED.title ELSE competitor_pins.title END,
        destination_url = CASE WHEN EXCLUDED.destination_url <> '' THEN EXCLUDED.destination_url ELSE competitor_pins.destination_url END,
        link_domain = CASE WHEN EXCLUDED.link_domain <> '' THEN EXCLUDED.link_domain ELSE competitor_pins.link_domain END,
        board_name = CASE WHEN EXCLUDED.board_name <> '' THEN EXCLUDED.board_name ELSE competitor_pins.board_name END,
        board_slug = CASE WHEN EXCLUDED.board_slug <> '' THEN EXCLUDED.board_slug ELSE competitor_pins.board_slug END,
        image_url = CASE WHEN EXCLUDED.image_url <> '' THEN EXCLUDED.image_url ELSE competitor_pins.image_url END,
        save_count = CASE WHEN EXCLUDED.save_count > 0 THEN EXCLUDED.save_count ELSE competitor_pins.save_count END,
        repin_count = CASE WHEN EXCLUDED.repin_count > 0 THEN EXCLUDED.repin_count ELSE competitor_pins.repin_count END,
        comment_count = CASE WHEN EXCLUDED.comment_count > 0 THEN EXCLUDED.comment_count ELSE competitor_pins.comment_count END,
        is_product = (competitor_pins.is_product OR EXCLUDED.is_product),
        enrichment_status = COALESCE(competitor_pins.enrichment_status, 'pending'),
        last_seen_at = NOW();
    `;
    await insertNewPinsBatch(sql, sortedPins, 'creator').catch(() => {});
    return sortedPins.length;
  } catch (err) {
    console.warn(`[upsertCompetitorPins] Bulk insert fallback:`, err.message);
    let saved = 0;
    for (const p of cleanedPins) {
      try {
        await sql`
          INSERT INTO competitor_pins (
            competitor_id, pin_id, title, link_domain,
            destination_url, board_name, board_slug, image_url, save_count, repin_count,
            comment_count, is_product, created_at_pinterest, first_seen_at, last_seen_at, enrichment_status
          ) VALUES (
            ${competitorId}, ${p.pin_id}, ${p.title}, ${p.link_domain},
            ${p.destination_url}, ${p.board_name}, ${p.board_slug || null}, ${p.image_url}, ${p.save_count}, ${p.repin_count},
            ${p.comment_count}, ${p.is_product}, ${p.created_at_pinterest ? new Date(p.created_at_pinterest) : null},
            NOW(), NOW(), 'pending'
          )
          ON CONFLICT (competitor_id, pin_id) DO UPDATE SET
            title = CASE WHEN EXCLUDED.title <> '' THEN EXCLUDED.title ELSE competitor_pins.title END,
            board_slug = COALESCE(EXCLUDED.board_slug, competitor_pins.board_slug),
            save_count = CASE WHEN EXCLUDED.save_count > 0 THEN EXCLUDED.save_count ELSE competitor_pins.save_count END,
            repin_count = CASE WHEN EXCLUDED.repin_count > 0 THEN EXCLUDED.repin_count ELSE competitor_pins.repin_count END,
            is_product = (competitor_pins.is_product OR EXCLUDED.is_product),
            enrichment_status = COALESCE(competitor_pins.enrichment_status, 'pending'),
            last_seen_at = NOW();
        `;
        saved++;
      } catch (_) {}
    }
    await insertNewPinsBatch(sql, cleanedPins, 'creator').catch(() => {});
    return saved;
  }
}

/**
 * Ingest a batch of formatted pins into pa_pins on Central Hub.
 * [INVARIANT: ZERO-HUB-SNAPSHOTS]
 * Optionally applies qualifyPin criteria so unqualified pins are filtered out.
 */
export async function ingestPinsBatch(sql, pins, accountUsername = null, { filterQualified = false, rules = null } = {}) {
  if (!Array.isArray(pins) || pins.length === 0) {
    return { ok: true, added: 0, inserted: 0, updated: 0, filtered: 0, total: 0 };
  }

  const activeRules = filterQualified ? (rules || (await getQualificationRules(sql))) : null;
  const cleanAccount = accountUsername ? String(accountUsername).replace(/^@/, '').trim().toLowerCase() : null;

  let addedCount = 0;
  let updatedCount = 0;
  let filteredCount = 0;

  const preparedPins = [];
  for (const pin of pins) {
    const pinId = String(pin.pin_id || pin.id || '').trim();
    if (!pinId) continue;

    // Filter sub-threshold pins if qualification is active
    if (activeRules && !isPinQualified(pin, activeRules)) {
      filteredCount++;
      continue;
    }

    const title = pin.title || '';
    const description = pin.description || '';
    const link = pin.link || '';
    let domain = pin.domain || '';
    if (!domain && link) {
      try {
        domain = new URL(link).hostname;
      } catch (_) {
        domain = '';
      }
    }
    const boardName = pin.board_name || '';
    const imageUrl = pin.image_url || '';
    const dominantColor = pin.dominant_color || '#888888';
    const saves = Math.max(0, isNaN(Number(pin.saves)) ? 0 : Number(pin.saves));
    const repins = Math.max(0, isNaN(Number(pin.repins)) ? saves : Number(pin.repins));
    const comments = Math.max(0, isNaN(Number(pin.comments)) ? 0 : Number(pin.comments));
    const shareCount = Math.max(0, isNaN(Number(pin.share_count)) ? 0 : Number(pin.share_count));
    
    let reactions = {};
    if (pin.reactions && typeof pin.reactions === 'object' && !Array.isArray(pin.reactions)) {
      reactions = pin.reactions;
    } else if (typeof pin.reactions === 'string' && pin.reactions.trim().startsWith('{')) {
      try {
        reactions = JSON.parse(pin.reactions.trim());
      } catch {
        reactions = {};
      }
    }

    const velocity = Math.max(0, isNaN(Number(pin.velocity)) ? 0 : Number(pin.velocity));

    let annotations = [];
    if (Array.isArray(pin.annotations)) {
      annotations = pin.annotations.slice(0, 15);
    } else if (typeof pin.annotations === 'string' && pin.annotations.trim().startsWith('[')) {
      try {
        annotations = JSON.parse(pin.annotations.trim()).slice(0, 15);
      } catch {
        annotations = [];
      }
    }

    const isVideo = Boolean(pin.is_video);
    const isProduct = Boolean(pin.is_product);
    let createdAtPinterest = null;
    if (pin.created_at_pinterest || pin.created_at) {
      const d = new Date(pin.created_at_pinterest || pin.created_at);
      if (!isNaN(d.getTime())) createdAtPinterest = d;
    }

    preparedPins.push({
      pinId,
      title,
      description,
      link,
      domain,
      boardName,
      imageUrl,
      dominantColor,
      saves,
      repins,
      comments,
      shareCount,
      reactions,
      velocity,
      annotations,
      isVideo,
      isProduct,
      createdAtPinterest
    });
  }

  if (!preparedPins.length) {
    return { ok: true, added: 0, inserted: 0, updated: 0, filtered: filteredCount, total: pins.length };
  }

  // Deduplicate preparedPins by pinId
  const pinMap = new Map();
  for (const p of preparedPins) {
    pinMap.set(p.pinId, p);
  }
  const dedupedPins = Array.from(pinMap.values());

  const payloadArray = dedupedPins.map(p => ({
    pin_id: p.pinId,
    account_username: cleanAccount,
    title: p.title || '',
    description: p.description || '',
    link: p.link || '',
    domain: p.domain || '',
    board_name: p.boardName || '',
    image_url: p.imageUrl || '',
    dominant_color: p.dominantColor || '#888888',
    saves: Number(p.saves || 0),
    repins: Number(p.repins || 0),
    comments: Number(p.comments || 0),
    share_count: Number(p.shareCount || 0),
    reactions: (p.reactions && typeof p.reactions === 'object' && !Array.isArray(p.reactions)) ? p.reactions : {},
    velocity: Number(p.velocity || 0),
    annotations: Array.isArray(p.annotations) ? p.annotations : [],
    is_video: Boolean(p.isVideo),
    is_product: Boolean(p.isProduct),
    created_at_pinterest: p.createdAtPinterest || null
  }));
  const jsonPayload = JSON.stringify(payloadArray);

  try {
    const buildPinsQuery = (db) => db`
      INSERT INTO pa_pins (
        pin_id,
        account_username,
        title,
        link,
        domain,
        board_name,
        image_url,
        dominant_color,
        saves,
        repins,
        comments,
        share_count,
        reactions,
        velocity,
        annotations,
        is_video,
        is_product,
        created_at_pinterest,
        first_seen_at,
        last_updated_at
      )
      SELECT
        u.pin_id,
        u.account_username,
        u.title,
        u.link,
        u.domain,
        u.board_name,
        u.image_url,
        u.dominant_color,
        u.saves,
        u.repins,
        u.comments,
        u.share_count,
        u.reactions,
        u.velocity,
        u.annotations,
        u.is_video,
        u.is_product,
        u.created_at_pinterest::timestamptz,
        NOW(),
        NOW()
      FROM (
        SELECT *
        FROM jsonb_to_recordset(${typeof db.json === 'function' ? db.json(payloadArray) : jsonPayload}::jsonb) AS raw(
          pin_id text,
          account_username text,
          title text,
          link text,
          domain text,
          board_name text,
          image_url text,
          dominant_color text,
          saves bigint,
          repins int,
          comments int,
          share_count int,
          reactions jsonb,
          velocity numeric,
          annotations jsonb,
          is_video boolean,
          is_product boolean,
          created_at_pinterest text
        )
        ORDER BY raw.pin_id ASC
      ) u
      ON CONFLICT (pin_id) DO UPDATE SET
        account_username = COALESCE(EXCLUDED.account_username, pa_pins.account_username),
        title = CASE WHEN EXCLUDED.title <> '' THEN EXCLUDED.title ELSE pa_pins.title END,
        link = CASE WHEN EXCLUDED.link <> '' THEN EXCLUDED.link ELSE pa_pins.link END,
        domain = CASE WHEN EXCLUDED.domain <> '' THEN EXCLUDED.domain ELSE pa_pins.domain END,
        board_name = CASE WHEN EXCLUDED.board_name <> '' THEN EXCLUDED.board_name ELSE pa_pins.board_name END,
        image_url = CASE WHEN EXCLUDED.image_url <> '' THEN EXCLUDED.image_url ELSE pa_pins.image_url END,
        dominant_color = CASE WHEN EXCLUDED.dominant_color <> '#888888' AND EXCLUDED.dominant_color <> '' THEN EXCLUDED.dominant_color ELSE pa_pins.dominant_color END,
        saves = CASE WHEN EXCLUDED.saves > 0 THEN EXCLUDED.saves ELSE pa_pins.saves END,
        repins = CASE WHEN EXCLUDED.repins > 0 THEN EXCLUDED.repins ELSE pa_pins.repins END,
        comments = GREATEST(pa_pins.comments, EXCLUDED.comments),
        share_count = GREATEST(pa_pins.share_count, EXCLUDED.share_count),
        reactions = CASE WHEN EXCLUDED.reactions <> '{}'::jsonb THEN EXCLUDED.reactions ELSE pa_pins.reactions END,
        velocity = CASE WHEN EXCLUDED.velocity > 0 THEN EXCLUDED.velocity ELSE pa_pins.velocity END,
        annotations = CASE WHEN jsonb_typeof(EXCLUDED.annotations) = 'array' AND jsonb_array_length(EXCLUDED.annotations) > 0 THEN EXCLUDED.annotations ELSE pa_pins.annotations END,
        is_product = (pa_pins.is_product OR EXCLUDED.is_product),
        created_at_pinterest = COALESCE(pa_pins.created_at_pinterest, EXCLUDED.created_at_pinterest),
        last_updated_at = NOW()
      RETURNING (xmax = 0) AS is_inserted;
    `;

    // [INVARIANT: HYPERDRIVE-ATOMIC-BUILDER]
    // [INVARIANT: ZERO-HUB-SNAPSHOTS]
    // pa_pin_metrics direct writes are strictly eradicated.
    // Time-series daily snapshots belong exclusively to pins_daily_metrics in Unified PostgreSQL.
    let pinRows = [];
    if (typeof sql.transaction === 'function') {
      const res = await sql.transaction([
        (db) => buildPinsQuery(db)
      ]);
      pinRows = res && res[0] ? res[0] : [];
    } else if (typeof sql.begin === 'function') {
      [pinRows] = await sql.begin(async (tx) => {
        const rows = await buildPinsQuery(tx);
        return [rows];
      });
    } else {
      pinRows = await buildPinsQuery(sql);
    }

    for (const r of (pinRows || [])) {
      if (r.is_inserted) addedCount++;
      else updatedCount++;
    }

    if (typeof sql?.unsafe === 'function') {
      await insertNewPinsBatch(
        sql,
        dedupedPins.map(p => ({
          pin_id: p.pinId,
          title: p.title,
          description: p.description,
          destination_url: p.link,
          link_domain: p.domain,
          board_name: p.boardName,
          image_url: p.imageUrl,
          dominant_color: p.dominantColor,
          save_count: p.saves,
          repin_count: p.repins,
          comment_count: p.comments,
          share_count: p.shareCount,
          daily_save_velocity: p.velocity,
          visual_annotations: p.annotations,
          is_product: p.isProduct,
          creator_username: cleanAccount,
          created_at_pinterest: p.createdAtPinterest
        })),
        'creator'
      ).catch(() => {});
    }

    if (cleanAccount) {
      try {
        const [comp] = await sql`SELECT id FROM competitor_profiles WHERE LOWER(username) = ${cleanAccount} LIMIT 1;`;
        if (comp?.id) {
          await sql`
            INSERT INTO competitor_pins (
              competitor_id, pin_id, title, link_domain,
              destination_url, board_name, board_slug, image_url, save_count, repin_count,
              comment_count, is_product, created_at_pinterest, first_seen_at, last_seen_at, enrichment_status
            )
            SELECT 
              ${comp.id},
              u.pin_id,
              COALESCE(u.title, ''),
              COALESCE(NULLIF(u.domain, ''), ''),
              COALESCE(NULLIF(u.link, ''), ''),
              COALESCE(u.board_name, ''),
              LOWER(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(u.board_name, ''), '[^[:alnum:]]+', '-', 'g'), '^-|-$', '', 'g')),
              COALESCE(u.image_url, ''),
              COALESCE(u.saves, 0)::int,
              COALESCE(u.repins, 0)::int,
              COALESCE(u.comments, 0)::int,
              COALESCE(u.is_product, false),
              u.created_at_pinterest::timestamptz,
              NOW(),
              NOW(),
              'completed'
            FROM jsonb_to_recordset(${jsonPayload}::jsonb) AS u(
              pin_id text, title text, domain text, link text,
              board_name text, image_url text, saves bigint, repins int,
              comments int, is_product boolean, created_at_pinterest text
            )
            ON CONFLICT (competitor_id, pin_id) DO UPDATE SET
              title = CASE WHEN EXCLUDED.title <> '' THEN EXCLUDED.title ELSE competitor_pins.title END,
              destination_url = CASE WHEN EXCLUDED.destination_url <> '' THEN EXCLUDED.destination_url ELSE competitor_pins.destination_url END,
              link_domain = CASE WHEN EXCLUDED.link_domain <> '' THEN EXCLUDED.link_domain ELSE competitor_pins.link_domain END,
              board_name = CASE WHEN EXCLUDED.board_name <> '' THEN EXCLUDED.board_name ELSE competitor_pins.board_name END,
              save_count = CASE WHEN EXCLUDED.save_count > 0 THEN EXCLUDED.save_count ELSE competitor_pins.save_count END,
              repin_count = CASE WHEN EXCLUDED.repin_count > 0 THEN EXCLUDED.repin_count ELSE competitor_pins.repin_count END,
              comment_count = GREATEST(competitor_pins.comment_count, EXCLUDED.comment_count),
              is_product = (competitor_pins.is_product OR EXCLUDED.is_product),
              last_seen_at = NOW();
          `.catch(() => {});
        }
      } catch (_) {}
    }
  } catch (batchErr) {
    console.warn('[ingestPinsBatch] Bulk ingest batch warning:', batchErr.message);
  }

  return { ok: true, added: addedCount, inserted: addedCount, updated: updatedCount, filtered: filteredCount, total: pins.length };
}


/**
 * Re-evaluate candidate pins stored in pa_pins against active rules
 */
export async function reEvaluateArchivedPins(sql, rules = null, accountUsername = null) {
  const activeRules = rules || (await getQualificationRules(sql));
  const cleanUser = accountUsername ? String(accountUsername).replace(/^@+/, '').trim().toLowerCase() : null;
  
  // If master ingest is disabled, no pins qualify for active ingestion (read-only evaluation)
  if (activeRules.master_ingest_enabled === false) {
    const [cnt] = await sql`
      SELECT count(*)::int AS total
      FROM pa_pins
      WHERE (${cleanUser}::text IS NULL OR account_username = ${cleanUser});
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

  // Single-Pass SARGable CTE: evaluates, counts, and prunes unqualified pins atomically
  const [res] = await sql`
    WITH target_pins AS (
      SELECT pin_id, saves, repins, created_at_pinterest
      FROM pa_pins
      WHERE (${cleanUser}::text IS NULL OR account_username = ${cleanUser})
    ),
    evaluated AS (
      SELECT
        pin_id,
        (
          saves >= ${t1} 
          OR repins >= ${t2}
          OR (
            created_at_pinterest IS NOT NULL
            AND created_at_pinterest >= NOW() - (${t2Days} * INTERVAL '1 day')
            AND (saves::numeric / GREATEST(1.0, EXTRACT(EPOCH FROM (NOW() - created_at_pinterest)) / 86400.0)) >= ${t2Vel}
          )
          OR (
            created_at_pinterest IS NOT NULL
            AND created_at_pinterest >= NOW() - (${t3Days} * INTERVAL '1 day')
            AND saves >= ${t3Saves}
          )
        ) AS is_qualified
      FROM target_pins
    ),
    deleted AS (
      DELETE FROM pa_pins p
      USING evaluated e
      WHERE p.pin_id = e.pin_id AND e.is_qualified = FALSE
      RETURNING p.pin_id
    )
    SELECT
      (SELECT count(*)::int FROM target_pins) AS total_pins,
      (SELECT count(*)::int FROM evaluated WHERE is_qualified = TRUE) AS qualified_pins,
      (SELECT count(*)::int FROM deleted) AS pruned_pins;
  `;

  const total = Number(res?.total_pins || 0);
  const qualified = Number(res?.qualified_pins || 0);
  const prunedCount = Number(res?.pruned_pins || 0);
  const disqualified = Math.max(0, total - qualified);

  return {
    ok: true,
    total_evaluated: total,
    qualified_count: qualified,
    disqualified_count: disqualified,
    disqualified_pruned: prunedCount,
    rules: activeRules
  };
}


/**
 * Re-evaluate competitor pins against custom qualification rules and upsert qualified pins into pa_pins.
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

  // Fetch all pins from competitor_pins meeting the 3-tier rules
  const qualifiedPins = await sql`
    SELECT 
      cp.pin_id,
      ${username} AS account_username,
      cp.title,
      cp.destination_url AS link,
      cp.link_domain AS domain,
      cp.board_name,
      cp.image_url,
      '#888888' AS dominant_color,
      cp.save_count AS saves,
      cp.repin_count AS repins,
      cp.comment_count AS comments,
      0::bigint AS share_count,
      '{}'::jsonb AS reactions,
      -- [INVARIANT: AGE-BOUNDED-VELOCITY-SHIELD] Prevent 10x multiplier explosion on recent/missing discovery dates
      ROUND(
        (COALESCE(cp.save_count, 0)::numeric / 
         CASE 
           WHEN cp.created_at_pinterest IS NOT NULL 
           THEN GREATEST(1.0, EXTRACT(EPOCH FROM (NOW() - cp.created_at_pinterest)) / 86400)
           ELSE GREATEST(30.0, EXTRACT(EPOCH FROM (NOW() - COALESCE(cp.first_seen_at, NOW() - INTERVAL '30 days'))) / 86400)
         END
        ), 2
      ) AS velocity,
      '[]'::jsonb AS annotations,
      false AS is_video,
      COALESCE(cp.is_product, false) AS is_product,
      cp.created_at_pinterest,
      NOW() AS first_seen_at,
      NOW() AS last_updated_at
    FROM competitor_pins cp
    WHERE cp.competitor_id = ${numericId}
      AND (
        cp.save_count >= ${minSaves}
        OR cp.repin_count >= ${minRepins}
        OR (
          cp.created_at_pinterest >= NOW() - (${freshDays} || ' days')::interval
          AND cp.save_count >= ${freshMinSaves}
        )
        OR (
          cp.created_at_pinterest >= NOW() - (${maxAgeDays} || ' days')::interval
          AND (
            (cp.save_count::numeric / GREATEST(1.0, EXTRACT(EPOCH FROM (NOW() - cp.created_at_pinterest)) / 86400)) >= ${minVelocity}
            OR (${allowVelocityFallback} = TRUE AND cp.save_count >= 50 AND (cp.save_count::numeric / GREATEST(1.0, EXTRACT(EPOCH FROM (NOW() - cp.created_at_pinterest)) / 86400)) >= 2.0)
          )
        )
      )
      AND (${articlesOnly} = FALSE OR (cp.is_product IS NULL OR cp.is_product = FALSE));
  `;

  let upsertedCount = 0;
  if (qualifiedPins.length > 0) {
    // Monotonic ORDER BY pin_id ASC to eliminate lock contention & deadlocks
    const sortedQualified = [...qualifiedPins].sort((a, b) => String(a.pin_id).localeCompare(String(b.pin_id)));

    // Upsert in batches of 50
    for (let i = 0; i < sortedQualified.length; i += 50) {
      const batch = sortedQualified.slice(i, i + 50);
      await sql`
        INSERT INTO pa_pins (
          pin_id, account_username, title, link, domain,
          board_name, image_url, dominant_color, saves, repins, comments,
          share_count, reactions, velocity, annotations, is_video, is_product,
          created_at_pinterest, first_seen_at, last_updated_at
        )
        SELECT 
          x.pin_id, x.account_username, x.title, x.link, x.domain,
          x.board_name, x.image_url, x.dominant_color, x.saves, x.repins, x.comments,
          x.share_count, x.reactions, x.velocity, x.annotations, x.is_video, x.is_product,
          x.created_at_pinterest, x.first_seen_at, x.last_updated_at
        FROM jsonb_to_recordset(${typeof sql.json === 'function' ? sql.json(batch) : JSON.stringify(batch)}::jsonb) AS x(
          pin_id character varying, account_username character varying, title text, link text, domain character varying,
          board_name character varying, image_url text, dominant_color character varying, saves bigint, repins bigint, comments integer,
          share_count bigint, reactions jsonb, velocity numeric, annotations jsonb, is_video boolean, is_product boolean,
          created_at_pinterest timestamp with time zone, first_seen_at timestamp with time zone, last_updated_at timestamp with time zone
        )
        ORDER BY x.pin_id ASC
        ON CONFLICT (pin_id) DO UPDATE SET
          title = CASE WHEN EXCLUDED.title <> '' THEN EXCLUDED.title ELSE pa_pins.title END,
          link = CASE WHEN EXCLUDED.link <> '' THEN EXCLUDED.link ELSE pa_pins.link END,
          domain = CASE WHEN EXCLUDED.domain <> '' THEN EXCLUDED.domain ELSE pa_pins.domain END,
          board_name = CASE WHEN EXCLUDED.board_name <> '' THEN EXCLUDED.board_name ELSE pa_pins.board_name END,
          image_url = CASE WHEN EXCLUDED.image_url <> '' THEN EXCLUDED.image_url ELSE pa_pins.image_url END,
          saves = CASE WHEN EXCLUDED.saves > 0 THEN EXCLUDED.saves ELSE pa_pins.saves END,
          repins = CASE WHEN EXCLUDED.repins > 0 THEN EXCLUDED.repins ELSE pa_pins.repins END,
          comments = CASE WHEN EXCLUDED.comments > 0 THEN EXCLUDED.comments ELSE pa_pins.comments END,
          velocity = CASE WHEN EXCLUDED.velocity > 0 THEN EXCLUDED.velocity ELSE pa_pins.velocity END,
          is_product = (pa_pins.is_product OR EXCLUDED.is_product),
          last_updated_at = NOW();
      `;
      upsertedCount += batch.length;
    }
  }

  // Atomic demotion pass: Prune pins belonging to creator that no longer satisfy tightened rules
  const qualifiedIds = qualifiedPins.map(p => String(p.pin_id)).filter(Boolean);
  let prunedCount = 0;
  if (username) {
    const cleanUser = username.replace(/^@+/, '').trim().toLowerCase();
    try {
      const deletedRows = qualifiedIds.length > 0
        ? await sql`
            DELETE FROM pa_pins
            WHERE account_username = ${cleanUser}
              AND NOT (pin_id = ANY(${qualifiedIds}))
            RETURNING pin_id;
          `
        : await sql`
            DELETE FROM pa_pins
            WHERE account_username = ${cleanUser}
            RETURNING pin_id;
          `;
      prunedCount = deletedRows.length;
    } catch (pruneErr) {
      console.warn(`[reEvaluateCompetitorPins] Demotion prune warning for @${cleanUser}:`, pruneErr.message);
    }
  }

  return {
    ok: true,
    competitor_id: numericId,
    username,
    qualified_count: upsertedCount,
    pruned_count: prunedCount,
    rules
  };
}


/**
 * Zero-HTTP Reconciliation Pipeline
 * Reconciles catalog pins from competitor_pins into pa_pins based on 3-tier qualification rules (including Tier 2 sustained velocity).
 * Resolves the discrepancy where pins accumulating saves/momentum in the catalog were left trapped in competitor_pins.
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

  const runReconcileQuery = async () => {
    return await sql`
      WITH candidate_pins AS (
        SELECT DISTINCT ON (cp.pin_id)
          cp.pin_id,
          COALESCE(prof.username, NULLIF(ump.creator_username, ''), 'unknown') AS account_username,
          COALESCE(NULLIF(ump.title, ''), cp.title, '') AS title,
          COALESCE(NULLIF(ump.destination_url, ''), cp.destination_url, '') AS link,
          COALESCE(NULLIF(ump.domain, ''), cp.link_domain, '') AS domain,
          COALESCE(NULLIF(cp.board_name, ''), NULLIF(ump.board_name, ''), 'General') AS board_name,
          COALESCE(NULLIF(ump.image_url, ''), cp.image_url, '') AS image_url,
          COALESCE(NULLIF(ump.dominant_color, '#888888'), NULL) AS dominant_color,
          GREATEST(COALESCE(ump.save_count, 0), COALESCE(cp.save_count, 0)) AS saves,
          GREATEST(COALESCE(ump.repin_count, 0), COALESCE(cp.repin_count, 0)) AS repins,
          GREATEST(COALESCE(ump.comment_count, 0), COALESCE(cp.comment_count, 0)) AS comments,
          COALESCE(ump.share_count, 0)::bigint AS share_count,
          '{}'::jsonb AS reactions,
          -- [INVARIANT: AGE-BOUNDED-VELOCITY-SHIELD] Prevent 10x multiplier explosion on recent/missing discovery dates
          COALESCE(
            NULLIF(ump.daily_save_velocity, 0),
            ROUND(
              (GREATEST(COALESCE(ump.save_count, 0), COALESCE(cp.save_count, 0))::numeric / 
               CASE 
                 WHEN COALESCE(cp.created_at_pinterest, ump.created_at_pinterest) IS NOT NULL 
                 THEN GREATEST(1.0, EXTRACT(EPOCH FROM (NOW() - COALESCE(cp.created_at_pinterest, ump.created_at_pinterest))) / 86400)
                 ELSE GREATEST(30.0, EXTRACT(EPOCH FROM (NOW() - COALESCE(cp.first_seen_at, NOW() - INTERVAL '30 days'))) / 86400)
               END
              ), 2
            )
          ) AS velocity,
          COALESCE(NULLIF(ump.visual_annotations, '[]'::jsonb), '[]'::jsonb) AS annotations,
          false AS is_video,
          (COALESCE(cp.is_product, false) OR COALESCE(ump.is_product, false)) AS is_product,
          COALESCE(cp.created_at_pinterest, ump.created_at_pinterest, cp.first_seen_at, NOW()) AS created_at_pinterest,
          COALESCE(cp.first_seen_at, NOW()) AS first_seen_at,
          NOW() AS last_updated_at
        FROM competitor_pins cp
        LEFT JOIN competitor_profiles prof ON cp.competitor_id = prof.id
        LEFT JOIN universal_master_pins ump ON ump.pin_id = cp.pin_id
        WHERE 1=1
          AND (${numericId}::int IS NULL OR cp.competitor_id = ${numericId})
          AND (cp.is_deleted IS NULL OR cp.is_deleted = FALSE)
          AND (cp.metadata->>'is_deleted' IS NULL OR cp.metadata->>'is_deleted' <> 'true')
          AND (
            cp.save_count >= ${minSaves}
            OR cp.repin_count >= ${minRepins}
            OR (
              cp.created_at_pinterest >= NOW() - (${freshDays} || ' days')::interval
              AND cp.save_count >= ${freshMinSaves}
            )
            OR (
              cp.created_at_pinterest >= NOW() - (${maxAgeDays} || ' days')::interval
              AND (
                (cp.save_count::numeric / GREATEST(1.0, EXTRACT(EPOCH FROM (NOW() - cp.created_at_pinterest)) / 86400)) >= ${minVelocity}
                OR (${allowVelocityFallback} = TRUE AND cp.save_count >= 50 AND (cp.save_count::numeric / GREATEST(1.0, EXTRACT(EPOCH FROM (NOW() - cp.created_at_pinterest)) / 86400)) >= 2.0)
              )
            )
          )
          AND (${articlesOnly} = FALSE OR (cp.is_product IS NULL OR cp.is_product = FALSE))
        ORDER BY cp.pin_id ASC, cp.save_count DESC
      )
      INSERT INTO pa_pins (
        pin_id, account_username, title, link, domain,
        board_name, image_url, dominant_color, saves, repins, comments,
        share_count, reactions, velocity, annotations, is_video, is_product,
        created_at_pinterest, first_seen_at, last_updated_at
      )
      SELECT 
        c.pin_id, c.account_username, c.title, c.link, c.domain,
        c.board_name, c.image_url, c.dominant_color, c.saves, c.repins, c.comments,
        c.share_count, c.reactions, c.velocity, c.annotations, c.is_video, c.is_product,
        c.created_at_pinterest, c.first_seen_at, c.last_updated_at
      FROM candidate_pins c
      ON CONFLICT (pin_id) DO UPDATE SET
        title = CASE WHEN EXCLUDED.title <> '' THEN EXCLUDED.title ELSE pa_pins.title END,
        link = CASE WHEN EXCLUDED.link <> '' THEN EXCLUDED.link ELSE pa_pins.link END,
        domain = CASE WHEN EXCLUDED.domain <> '' THEN EXCLUDED.domain ELSE pa_pins.domain END,
        board_name = CASE WHEN EXCLUDED.board_name <> '' THEN EXCLUDED.board_name ELSE pa_pins.board_name END,
        image_url = CASE WHEN EXCLUDED.image_url <> '' THEN EXCLUDED.image_url ELSE pa_pins.image_url END,
        saves = CASE WHEN EXCLUDED.saves > 0 THEN EXCLUDED.saves ELSE pa_pins.saves END,
        repins = CASE WHEN EXCLUDED.repins > 0 THEN EXCLUDED.repins ELSE pa_pins.repins END,
        -- [INVARIANT: PRESERVE-AUTHENTIC-24H-VELOCITY] Fix LND-2: Preserve authentic daily velocity over lifetime average
        velocity = CASE WHEN pa_pins.velocity > 0 THEN pa_pins.velocity WHEN EXCLUDED.velocity > 0 THEN EXCLUDED.velocity ELSE pa_pins.velocity END,
        is_product = (pa_pins.is_product OR EXCLUDED.is_product),
        last_updated_at = NOW()
      RETURNING pin_id;
    `;
  };

  const reconciled = await runReconcileQuery();

  return {
    ok: true,
    competitor_id: numericId,
    username,
    promoted_or_updated: reconciled.length
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

    // 1. Always store ALL raw fetched pins in competitor_pins inventory
    if (pins.length > 0 && numericId) {
      await upsertCompetitorPins(sql, numericId, pins);
    }

    // 2. Filter through 3-tier OR qualification rules & ingest qualified winning pins into pa_pins
    // Only run during refresh/daily sync; in discovery mode, parallel shards handle deep Relay v3 enrichment!
    if (pins.length > 0 && mode !== 'discovery' && shouldAutoArchive) {
      const ingestRes = await ingestPinsBatch(sql, pins, cleanUsername, { filterQualified: true, rules });
      allQualifiedCount += (ingestRes.added + ingestRes.updated);
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

  // Auto-backfill discovered boards from competitor_pins into competitor_boards
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
        FROM competitor_pins cp
        WHERE cp.competitor_id = ${numericId} 
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

  // Get all winning pins currently archived for this account in pa_pins
  const pinsToRefresh = await sql`
    SELECT pin_id, title, saves, repins, comments
    FROM pa_pins
    WHERE account_username = ${cleanUsername.toLowerCase()}
    ORDER BY saves DESC;
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
