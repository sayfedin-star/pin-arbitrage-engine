/**
 * src/modules/boards/service.mjs
 *
 * Board Ideas Radar Core Service
 * Explores Pinterest's algorithmic recommendations ("Find more ideas") at scale.
 *
 * Features:
 * - Dual-source board identity resolution (Arbitrary URL or Competitor Board).
 * - Automatic conversion of synthetic board IDs ('cb-<md5>') to authentic numeric IDs.
 * - Unauthenticated SSR HTML extraction (/more_ideas/) + BoardFeedResource pagination.
 * - Monotonic metrics normalizer (parseCleanMetric) & Null-byte sanitizer (sanitizeForJsonb).
 * - Monotonic sorting (pin_id ASC) preventing concurrency deadlocks on bulk upserts.
 * - Daily save velocity calculation & recommendation rank volatility tracking.
 */

import { neon } from '@neondatabase/serverless';
import { normalizePinterestUsername, resolveLocalCompetitorId } from '../competitors/service.mjs';
import { sanitizeForJsonb } from '../../utils.mjs';
import {
  parseCleanMetric,
  parseRetryAfterSeconds,
  formatPin,
  extractPinData,
  fetchBoardDetailUnauth,
  getPinterestXhrHeaders,
  PINTEREST_PAGE_HEADERS,
  sleep,
  randomJitterMs,
  safeString
} from '../../../scripts/lib/pinterest.mjs';
import { getShardNumberForEntity } from '../fleet/sharding.mjs';

/**
 * Parses arbitrary Pinterest board URL or slug into username and slug.
 */
export function parseBoardUrl(input) {
  if (!input || typeof input !== 'string') return { username: '', slug: '' };
  let raw = input.trim();
  if (raw.startsWith('http')) {
    try {
      const u = new URL(raw);
      const parts = u.pathname.split('/').filter(Boolean);
      return {
        username: normalizePinterestUsername(parts[0] || ''),
        slug: (parts[1] || '').toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-')
      };
    } catch (_) {}
  }
  const cleanParts = raw.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  return {
    username: normalizePinterestUsername(cleanParts[0] || ''),
    slug: (cleanParts[1] || cleanParts[0] || '').toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-')
  };
}

/**
 * Mirrors a tracked_boards record to its assigned shard database.
 * Eliminates foreign key violations (board_id references tracked_boards) when workers run on shards.
 */
export async function mirrorTrackedBoardToShard(sql, trackedRecord) {
  if (!trackedRecord || !trackedRecord.board_id) return;
  const assignedShardId = trackedRecord.assigned_shard_id || getShardNumberForEntity(trackedRecord.board_id, 99);
  const shardName = `pin-arbitrage-shard-${String(assignedShardId).padStart(2, '0')}`;
  try {
    const [shardProj] = await sql`
      SELECT database_url FROM neon_projects_registry 
      WHERE project_name = ${shardName} AND status = 'active' AND database_url IS NOT NULL 
      LIMIT 1;
    `.catch(() => [null]);

    if (shardProj?.database_url) {
      const sSql = neon(shardProj.database_url);
      await sSql`
        INSERT INTO tracked_boards (
          board_id, url, name, username, competitor_id,
          total_pins, is_active, track_daily, assigned_shard_id,
          metadata, created_at, updated_at
        ) VALUES (
          ${trackedRecord.board_id}, ${trackedRecord.url}, ${trackedRecord.name}, ${trackedRecord.username}, NULL,
          ${Number(trackedRecord.total_pins || 0)}, TRUE, TRUE, ${assignedShardId},
          ${JSON.stringify(trackedRecord.metadata || {})}::jsonb, NOW(), NOW()
        )
        ON CONFLICT (board_id) DO UPDATE SET
          url = EXCLUDED.url,
          name = EXCLUDED.name,
          username = EXCLUDED.username,
          total_pins = GREATEST(tracked_boards.total_pins, EXCLUDED.total_pins),
          is_active = TRUE,
          assigned_shard_id = EXCLUDED.assigned_shard_id,
          metadata = COALESCE(tracked_boards.metadata, '{}'::jsonb) || EXCLUDED.metadata,
          updated_at = NOW();
      `.catch(() => {});
    }
  } catch (_) {}
}

/**
 * Resolves a Pinterest board identity and tracks it in `tracked_boards`.
 * Handles synthetic 'cb-' IDs by transparently resolving the true numeric board ID from Pinterest.
 */
export async function resolveBoardIdentity(sql, boardUrlOrSlug, cookie = '') {
  const { username, slug } = parseBoardUrl(boardUrlOrSlug);
  if (!username || !slug) {
    throw new Error('Invalid board URL or slug provided. Format: https://www.pinterest.com/[username]/[board-name]/');
  }

  // 1. Check if already tracked in tracked_boards
  const [existingTracked] = await sql`
    SELECT * FROM tracked_boards
    WHERE (username = ${username} AND url ILIKE ${'%/' + slug + '%'})
       OR url = ${boardUrlOrSlug}
    LIMIT 1;
  `;

  if (existingTracked && /^\d+$/.test(existingTracked.board_id)) {
    await mirrorTrackedBoardToShard(sql, existingTracked);
    return existingTracked;
  }

  // 2. Check competitor_boards for existing authentic ID
  let resolvedBoardId = null;
  let boardName = slug.replace(/-/g, ' ');
  let coverUrl = null;
  let totalPins = 0;

  const [compBoard] = await sql`
    SELECT board_id, name, url, metadata->>'image_cover_url' AS image_cover_url, pin_count
    FROM competitor_boards
    WHERE (LOWER(url) ILIKE ${'%/' + username + '/' + slug + '%'} OR LOWER(board_id) = ${slug.toLowerCase()})
    LIMIT 1;
  `;

  if (compBoard && compBoard.board_id && !compBoard.board_id.startsWith('cb-') && /^\d+$/.test(compBoard.board_id)) {
    resolvedBoardId = compBoard.board_id;
    boardName = compBoard.name || boardName;
    coverUrl = compBoard.image_cover_url || null;
    totalPins = Number(compBoard.pin_count || 0);
  }

  // 3. If ID not resolved or synthetic, resolve via Pinterest unauthenticated SSR
  if (!resolvedBoardId) {
    const detail = await fetchBoardDetailUnauth(username, slug);
    if (detail.ok && detail.board?.board_id && /^\d+$/.test(detail.board.board_id)) {
      resolvedBoardId = detail.board.board_id;
      boardName = detail.board.name || boardName;
      coverUrl = detail.board.image_cover_url || null;
      totalPins = parseCleanMetric(detail.board.pin_count || 0);
    }
  }

  if (!resolvedBoardId) {
    throw new Error(`Unable to resolve authentic Pinterest board ID for @${username}/${slug}. Verify board is public.`);
  }

  // 4. Resolve local competitor profile if username is a tracked competitor
  let competitorId = null;
  try {
    competitorId = await resolveLocalCompetitorId(sql, username);
  } catch (_) {}

  const canonicalUrl = `https://www.pinterest.com/${username}/${slug}/`;
  const assignedShardId = getShardNumberForEntity(resolvedBoardId, 99);

  // 5. Upsert into tracked_boards
  const metadata = sanitizeForJsonb({
    slug,
    image_cover_url: coverUrl,
    resolved_at: new Date().toISOString()
  });

  const [tracked] = await sql`
    INSERT INTO tracked_boards (
      board_id, url, name, username, competitor_id,
      total_pins, is_active, track_daily, assigned_shard_id,
      metadata, created_at, updated_at
    ) VALUES (
      ${resolvedBoardId}, ${canonicalUrl}, ${boardName}, ${username}, ${competitorId},
      ${totalPins}, TRUE, TRUE, ${assignedShardId},
      ${JSON.stringify(metadata)}::jsonb, NOW(), NOW()
    )
    ON CONFLICT (board_id) DO UPDATE SET
      url = EXCLUDED.url,
      name = EXCLUDED.name,
      username = EXCLUDED.username,
      competitor_id = COALESCE(EXCLUDED.competitor_id, tracked_boards.competitor_id),
      total_pins = GREATEST(tracked_boards.total_pins, EXCLUDED.total_pins),
      is_active = TRUE,
      assigned_shard_id = EXCLUDED.assigned_shard_id,
      metadata = COALESCE(tracked_boards.metadata, '{}'::jsonb) || EXCLUDED.metadata,
      updated_at = NOW()
    RETURNING *;
  `;

  // 6. Mirror tracked_boards to assigned shard database (eliminates FK violations on shards)
  await mirrorTrackedBoardToShard(sql, tracked);

  return tracked;
}

/**
 * Extracts recommended pins from Pinterest's public unauthenticated /more_ideas/ SSR document.
 */
async function fetchMoreIdeasFromSsr(username, slug) {
  const url = `https://www.pinterest.com/${username}/${slug}/more_ideas/`;
  let res = null;
  try {
    res = await fetch(url, { headers: PINTEREST_PAGE_HEADERS, signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      if (res.body) await res.body.cancel().catch(() => {});
      return { ok: false, status: res.status, pins: [], nextBookmark: null };
    }

    const html = await res.text();
    const match = html.match(/<script[^>]*id="__PWS_INITIAL_PROPS__"[^>]*>([\s\S]*?)<\/script>/i);
    if (!match) {
      return { ok: false, pins: [], nextBookmark: null, error: 'no_initial_props' };
    }

    const json = JSON.parse(match[1]);
    const redux = json.initialReduxState || {};
    const rawPins = redux.pins ? Object.values(redux.pins) : [];

    // Extract next bookmark from BoardFeedResource if present
    let nextBookmark = null;
    const bfr = redux.resources?.BoardFeedResource || {};
    for (const val of Object.values(bfr)) {
      if (val?.nextBookmark && val.nextBookmark !== '-end-') {
        nextBookmark = val.nextBookmark;
        break;
      }
    }

    const formattedPins = [];
    for (const p of rawPins) {
      const formatted = formatPin(p);
      if (formatted && formatted.pin_id) {
        formattedPins.push(formatted);
      }
    }

    return { ok: true, pins: formattedPins, nextBookmark };
  } catch (err) {
    return { ok: false, error: err.message, pins: [], nextBookmark: null };
  } finally {
    if (res?.body && !res.bodyUsed) {
      await res.body.cancel().catch(() => {});
    }
  }
}

/**
 * Fetches recommended ideas via unauthenticated BoardFeedResource pagination.
 */
async function fetchMoreIdeasFromXhr(username, slug, boardId, bookmark = null, cookie = '') {
  const src = `/${username}/${slug}/more_ideas/`;
  const options = {
    add_vase: true,
    board_id: String(boardId),
    field_set_key: 'react_grid_pin',
    filter_section_pins: false,
    gated: true,
    is_react: true,
    page_size: 25,
    prepend: false,
    redux_normalize_feed: true
  };
  if (bookmark) options.bookmarks = [bookmark];

  const endpointUrl = `https://www.pinterest.com/resource/BoardFeedResource/get/?source_url=${encodeURIComponent(
    src
  )}&data=${encodeURIComponent(JSON.stringify({ options, context: {} }))}&_=${Date.now()}`;

  const headers = getPinterestXhrHeaders(username, cookie, {
    sourceUrl: src,
    handler: `www/${username}/${slug}/more_ideas.js`
  });

  let res = null;
  try {
    res = await fetch(endpointUrl, { headers, signal: AbortSignal.timeout(8000) });

    if (res.status === 401 || res.status === 403 || res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504) {
      if (res.body) await res.body.cancel().catch(() => {});
      let retryDelay = randomJitterMs(2500, 4000);
      if (res.status === 429) {
        const retrySec = parseRetryAfterSeconds(res.headers.get('retry-after'), 3);
        if (retrySec > 30) return { ok: false, status: 429, retryAfter: retrySec, pins: [], nextBookmark: null };
        retryDelay = Math.max(retryDelay, retrySec * 1000);
      }
      await sleep(retryDelay);
      res = await fetch(endpointUrl, { headers, signal: AbortSignal.timeout(8000) });
    }

    if (!res.ok) {
      if (res.body) await res.body.cancel().catch(() => {});
      return { ok: false, status: res.status, pins: [], nextBookmark: null };
    }

    const json = await res.json();
    const data = json.resource_response?.data || [];
    const rawList = Array.isArray(data) ? data : (data?.items || data?.pins || []);

    const rawBookmark = json.resource_response?.bookmark ||
      (Array.isArray(json.resource_response?.bookmarks) ? json.resource_response.bookmarks[0] : null);
    const nextBookmark = (rawBookmark && rawBookmark !== '-end-') ? String(rawBookmark).trim() : null;

    const formattedPins = [];
    for (const raw of rawList) {
      const p = formatPin(raw);
      if (p && p.pin_id) {
        formattedPins.push(p);
      }
    }

    return { ok: true, pins: formattedPins, nextBookmark };
  } catch (err) {
    return { ok: false, error: err.message, pins: [], nextBookmark: null };
  } finally {
    if (res?.body && !res.bodyUsed) {
      await res.body.cancel().catch(() => {});
    }
  }
}

/**
 * Fetches high-performing ideas for a board's topic from Pinterest SERP.
 */
async function fetchBoardTopicSearchIdeas(boardName, cookie = '', limit = 50) {
  const cleanQuery = String(boardName || '').trim();
  if (!cleanQuery) return [];

  const searchQuery = encodeURIComponent(cleanQuery);
  const url = `https://www.pinterest.com/resource/BaseSearchResource/get/?source_url=%2Fsearch%2Fpins%2F%3Fq%3D${searchQuery}&data=%7B%22options%22%3A%7B%22query%22%3A%22${searchQuery}%22%2C%22scope%22%3A%22pins%22%2C%22page_size%22%3A${limit}%7D%2C%22context%22%3A%7B%7D%7D`;

  const headers = {
    'Accept': 'application/json, text/javascript, */*, q=0.01',
    'X-Requested-With': 'XMLHttpRequest',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    'x-pinterest-pws-handler': 'www/search/pins.js',
    'referer': `https://www.pinterest.com/search/pins/?q=${searchQuery}`
  };
  if (cookie) headers['Cookie'] = cookie;

  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      if (res.body) await res.body.cancel().catch(() => {});
      return [];
    }
    const json = await res.json();
    const results = json?.resource_response?.data?.results || [];
    const pins = [];
    for (const r of results) {
      const f = formatPin(r);
      if (f?.pin_id) pins.push(f);
    }
    return pins;
  } catch (err) {
    console.warn(`[fetchBoardTopicSearchIdeas] Error for "${cleanQuery}":`, err.message);
    return [];
  }
}

/**
 * Enriches pins that have empty titles or saves by extracting authentic data from public pin HTML.
 * Executes in bounded concurrency of 5 with 5000ms timeouts.
 */
async function enrichBarePins(pins, limit = 25) {
  const barePins = pins.filter(p => !p.title || p.saves === 0).slice(0, limit);
  if (barePins.length === 0) return;

  const BATCH_SIZE = 5;
  for (let i = 0; i < barePins.length; i += BATCH_SIZE) {
    const batch = barePins.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (pin) => {
      try {
        const url = `https://www.pinterest.com/pin/${pin.pin_id}/`;
        const res = await fetch(url, { headers: PINTEREST_PAGE_HEADERS, signal: AbortSignal.timeout(5000) });
        if (res.ok) {
          const html = await res.text();
          const ext = extractPinData(html, pin.pin_id);
          if (ext) {
            const candidateTitle = ext.title || ext.seo_title || ext.alt_text || '';
            if (candidateTitle && !pin.title) pin.title = candidateTitle;
            if (ext.saves > 0 && (!pin.saves || pin.saves === 0)) {
              pin.saves = ext.saves;
              pin.save_count = ext.saves;
            }
            if (ext.repins > 0 && (!pin.repins || pin.repins === 0)) {
              pin.repins = ext.repins;
              pin.repin_count = ext.repins;
            }
            if (ext.domain && !pin.domain) pin.domain = ext.domain;
            if (ext.velocity > 0 && (!pin.velocity || pin.velocity === 0)) pin.velocity = ext.velocity;
          }
        } else if (res.body) {
          await res.body.cancel().catch(() => {});
        }
      } catch (_) {}
    }));
  }
}

/**
 * Fetches deep board recommendations combining unauthenticated SSR, XHR pagination,
 * bare pin enrichment, and niche topic search ideas expansion.
 */
export async function fetchBoardRecommendations(username, slug, boardId, cookie = '', maxPages = 3, boardName = '') {
  const allPins = [];
  const seenPinIds = new Set();
  const pagesToFetch = Math.max(1, Math.min(Number(maxPages) || 1, 5));

  // 1. Page 1: Try fast unauthenticated SSR document
  const ssrRes = await fetchMoreIdeasFromSsr(username, slug);
  let currentBookmark = null;

  if (ssrRes.ok && ssrRes.pins?.length > 0) {
    for (const p of ssrRes.pins) {
      if (!seenPinIds.has(p.pin_id)) {
        seenPinIds.add(p.pin_id);
        allPins.push(p);
      }
    }
    currentBookmark = ssrRes.nextBookmark;
  }

  // If SSR yielded 0 pins, fallback to page 1 XHR
  if (allPins.length === 0) {
    const xhrRes = await fetchMoreIdeasFromXhr(username, slug, boardId, null, cookie);
    if (xhrRes.ok && xhrRes.pins?.length > 0) {
      for (const p of xhrRes.pins) {
        if (!seenPinIds.has(p.pin_id)) {
          seenPinIds.add(p.pin_id);
          allPins.push(p);
        }
      }
      currentBookmark = xhrRes.nextBookmark;
    }
  }

  // Fetch subsequent recommendation pages if requested and bookmark available
  for (let page = 2; page <= pagesToFetch && currentBookmark; page++) {
    await sleep(randomJitterMs(1200, 2000));
    const nextRes = await fetchMoreIdeasFromXhr(username, slug, boardId, currentBookmark, cookie);
    if (!nextRes.ok || nextRes.pins?.length === 0) break;

    for (const p of nextRes.pins) {
      if (!seenPinIds.has(p.pin_id)) {
        seenPinIds.add(p.pin_id);
        allPins.push(p);
      }
    }

    if (!nextRes.nextBookmark || nextRes.nextBookmark === currentBookmark) break;
    currentBookmark = nextRes.nextBookmark;
  }

  // 2. Enrich bare recommendation pins with authentic titles, saves & domains
  await enrichBarePins(allPins, 25);

  // 3. Multi-Source Topic Expansion: Ingest organic top-performing ideas for this board topic
  const topicQuery = boardName || (slug ? slug.replace(/-/g, ' ') : '');
  if (topicQuery && topicQuery.length >= 3) {
    const searchPins = await fetchBoardTopicSearchIdeas(topicQuery, cookie, 50);
    for (const p of searchPins) {
      if (!seenPinIds.has(p.pin_id)) {
        seenPinIds.add(p.pin_id);
        allPins.push(p);
      }
    }
  }

  return { ok: true, pins: allPins, total: allPins.length };
}

/**
 * Syncs and stores daily recommendations snapshot for a tracked board.
 * Enforces monotonic ORDER BY pin_id ASC to eliminate lock contention & deadlocks.
 */
export async function syncBoardIdeas(sql, boardId, cookie = '', maxPages = 1) {
  const cleanId = String(boardId || '').trim();
  if (!cleanId) throw new Error('board_id is required');

  let [tracked] = await sql`
    SELECT * FROM tracked_boards
    WHERE board_id = ${cleanId}
    LIMIT 1;
  `;

  if (!tracked) {
    // If running directly on a shard where tracked_boards wasn't mirrored yet,
    // look up competitor_boards to auto-provision tracked_boards
    const [cb] = await sql`
      SELECT board_id, name, url, pin_count
      FROM competitor_boards
      WHERE board_id = ${cleanId}
      LIMIT 1;
    `.catch(() => [null]);

    if (cb) {
      const { username, slug } = parseBoardUrl(cb.url || '');
      const assignedShardId = getShardNumberForEntity(cleanId, 99);
      const [autoTracked] = await sql`
        INSERT INTO tracked_boards (
          board_id, url, name, username, competitor_id,
          total_pins, is_active, track_daily, assigned_shard_id,
          metadata, created_at, updated_at
        ) VALUES (
          ${cleanId}, ${cb.url || `https://www.pinterest.com/${username || 'board'}/${slug || cleanId}/`},
          ${cb.name || 'Untitled Board'}, ${username || null}, NULL,
          ${Number(cb.pin_count || 0)}, TRUE, TRUE, ${assignedShardId},
          '{}'::jsonb, NOW(), NOW()
        )
        ON CONFLICT (board_id) DO UPDATE SET updated_at = NOW()
        RETURNING *;
      `.catch(() => [null]);
      tracked = autoTracked;
    }
  }

  if (!tracked) {
    throw new Error(`Board ID ${cleanId} is not registered in tracked_boards. Call resolveBoardIdentity first.`);
  }

  // Ensure mirror exists on assigned shard before fetching/inserting snapshots
  await mirrorTrackedBoardToShard(sql, tracked);

  const { username, slug } = parseBoardUrl(tracked.url);

  // 1. Fetch live recommendation feed with topic expansion
  const recRes = await fetchBoardRecommendations(username, slug, cleanId, cookie, maxPages, tracked.name);
  const rawPins = recRes.pins || [];

  if (rawPins.length === 0) {
    return { ok: true, board_id: cleanId, total_synced: 0, message: 'No recommendations found' };
  }

  // 2. Fetch baseline snapshots to compute daily_save_velocity and rank_delta
  const priorSnapshots = await sql`
    SELECT pin_id, save_count, repin_count, recommendation_rank, snapshot_date
    FROM board_idea_snapshots
    WHERE board_id = ${cleanId}
      AND snapshot_date < CURRENT_DATE
    ORDER BY snapshot_date DESC, recommendation_rank ASC;
  `;

  const priorMap = new Map();
  for (const row of priorSnapshots) {
    if (!priorMap.has(row.pin_id)) {
      priorMap.set(row.pin_id, row);
    }
  }

  // 3. Assemble and calculate snapshot records
  const snapshotRecords = [];
  let rank = 1;

  for (const pin of rawPins) {
    const pinId = String(pin.pin_id);
    const currSaves = parseCleanMetric(pin.saves ?? pin.save_count ?? 0);
    const currRepins = parseCleanMetric(pin.repins ?? pin.repin_count ?? 0);
    const prior = priorMap.get(pinId);

    let dailySaveVelocity = 0;
    let rankDelta = 0;
    let isNew = true;

    if (prior) {
      isNew = false;
      const priorSaves = Number(prior.save_count || 0);
      const priorRank = Number(prior.recommendation_rank || rank);
      rankDelta = priorRank - rank; // Positive: climbed up in rank

      const daysElapsed = Math.max(1, Math.round((Date.now() - new Date(prior.snapshot_date).getTime()) / 86400000));
      dailySaveVelocity = Math.max(0, Math.round(((currSaves - priorSaves) / daysElapsed) * 10) / 10);
    } else {
      // Fresh recommendation: initial daily velocity estimate based on pin velocity
      dailySaveVelocity = Number(pin.velocity || 0);
    }

    snapshotRecords.push({
      board_id: cleanId,
      pin_id: pinId,
      title: safeString(pin.title || ''),
      image_url: safeString(pin.image_url || ''),
      domain: safeString(pin.domain || ''),
      destination_url: safeString(pin.link || pin.destination_url || ''),
      save_count: currSaves,
      repin_count: currRepins,
      daily_save_velocity: dailySaveVelocity,
      recommendation_rank: rank,
      metadata: sanitizeForJsonb({
        is_new: isNew,
        rank_delta: rankDelta,
        aspect_ratio: pin.aspect_ratio || null,
        is_product: Boolean(pin.is_product),
        is_video: Boolean(pin.is_video),
        dominant_color: pin.dominant_color || '#888888'
      })
    });

    rank++;
  }

  // 4. Deadlock Shielding: Monotonic ORDER BY pin_id ASC in JS and SQL
  const uniqueMap = new Map();
  for (const r of snapshotRecords) {
    uniqueMap.set(String(r.pin_id), r);
  }

  const sortedRecords = Array.from(uniqueMap.values()).sort((a, b) =>
    String(a.pin_id).localeCompare(String(b.pin_id))
  );

  const cleanRecords = sanitizeForJsonb(sortedRecords);

  let res = [];
  try {
    res = await sql`
      WITH inserted AS (
        INSERT INTO board_idea_snapshots (
          board_id, pin_id, title, image_url, domain, destination_url,
          save_count, repin_count, daily_save_velocity, recommendation_rank,
          snapshot_date, metadata, created_at
        )
        SELECT
          board_id, pin_id, title, image_url, domain, destination_url,
          save_count, repin_count, daily_save_velocity, recommendation_rank,
          CURRENT_DATE, metadata, NOW()
        FROM jsonb_to_recordset(${JSON.stringify(cleanRecords)}::jsonb) AS x(
          board_id VARCHAR(255), pin_id VARCHAR(255), title TEXT, image_url TEXT,
          domain VARCHAR(255), destination_url TEXT, save_count BIGINT, repin_count INT,
          daily_save_velocity NUMERIC, recommendation_rank INT, metadata JSONB
        )
        ORDER BY pin_id ASC
        ON CONFLICT (board_id, pin_id, snapshot_date) DO UPDATE SET
          title = COALESCE(EXCLUDED.title, board_idea_snapshots.title),
          image_url = CASE WHEN EXCLUDED.image_url <> '' THEN EXCLUDED.image_url ELSE board_idea_snapshots.image_url END,
          domain = CASE WHEN EXCLUDED.domain <> '' THEN EXCLUDED.domain ELSE board_idea_snapshots.domain END,
          destination_url = CASE WHEN EXCLUDED.destination_url <> '' THEN EXCLUDED.destination_url ELSE board_idea_snapshots.destination_url END,
          save_count = GREATEST(board_idea_snapshots.save_count, EXCLUDED.save_count),
          repin_count = GREATEST(board_idea_snapshots.repin_count, EXCLUDED.repin_count),
          daily_save_velocity = GREATEST(board_idea_snapshots.daily_save_velocity, EXCLUDED.daily_save_velocity),
          recommendation_rank = EXCLUDED.recommendation_rank,
          metadata = COALESCE(board_idea_snapshots.metadata, '{}'::jsonb) || EXCLUDED.metadata
        RETURNING pin_id
      ),
      pruned AS (
        DELETE FROM board_idea_snapshots
        WHERE board_id = ${cleanId}
          AND snapshot_date = CURRENT_DATE
          AND pin_id NOT IN (SELECT pin_id FROM inserted)
        RETURNING pin_id
      )
      SELECT pin_id FROM inserted;
    `;
  } catch (dbErr) {
    if (dbErr.code === '23503' || dbErr.message?.includes('foreign key constraint')) {
      return { ok: false, board_id: cleanId, total_synced: 0, message: 'Board tracking was removed during sync' };
    }
    throw dbErr;
  }

  // 5. Update tracked_boards timestamp and pin count
  await sql`
    UPDATE tracked_boards
    SET last_scanned_at = NOW(),
        updated_at = NOW()
    WHERE board_id = ${cleanId};
  `.catch(() => {});

  const newCount = cleanRecords.filter(r => r.metadata?.is_new).length;

  return {
    ok: true,
    board_id: cleanId,
    total_synced: res.length,
    new_recommendations: newCount,
    snapshot_date: new Date().toISOString().slice(0, 10)
  };
}

/**
 * Returns latest recommendations snapshot, movement indicators, and dropped pins.
 */
export async function getBoardIdeasComparison(sql, boardId) {
  const cleanId = String(boardId || '').trim();
  if (!cleanId) return null;

  const [board] = await sql`
    SELECT tb.*, cp.display_name AS competitor_name
    FROM tracked_boards tb
    LEFT JOIN competitor_profiles cp ON cp.id = tb.competitor_id
    WHERE tb.board_id = ${cleanId}
    LIMIT 1;
  `;

  if (!board) return null;

  // 1. Get latest snapshot date
  const [dateRow] = await sql`
    SELECT snapshot_date
    FROM board_idea_snapshots
    WHERE board_id = ${cleanId}
    ORDER BY snapshot_date DESC
    LIMIT 1;
  `;

  if (!dateRow) {
    return {
      board,
      latest_snapshot: { date: null, count: 0, pins: [] },
      dropped_pins: [],
      stats: { total: 0, high_volume: 0, avg_velocity: 0, new_count: 0 }
    };
  }

  const latestDate = dateRow.snapshot_date;

  // 2. Fetch current pins on latest date
  const currentPins = await sql`
    SELECT *
    FROM board_idea_snapshots
    WHERE board_id = ${cleanId} AND snapshot_date = ${latestDate}
    ORDER BY recommendation_rank ASC;
  `;

  // 3. Detect dropped pins (pins present on previous date but missing from current)
  const [priorDateRow] = await sql`
    SELECT snapshot_date
    FROM board_idea_snapshots
    WHERE board_id = ${cleanId} AND snapshot_date < ${latestDate}
    ORDER BY snapshot_date DESC
    LIMIT 1;
  `;

  let droppedPins = [];
  if (priorDateRow) {
    const priorDate = priorDateRow.snapshot_date;
    const currentPinIdSet = new Set(currentPins.map(p => p.pin_id));

    const priorPins = await sql`
      SELECT *
      FROM board_idea_snapshots
      WHERE board_id = ${cleanId} AND snapshot_date = ${priorDate}
      ORDER BY recommendation_rank ASC;
    `;

    droppedPins = priorPins.filter(p => !currentPinIdSet.has(p.pin_id));
  }

  // 4. Calculate volatility metrics
  const totalPins = currentPins.length;
  const highVolume = currentPins.filter(p => Number(p.save_count || 0) >= 1000).length;
  const sumVelocity = currentPins.reduce((acc, p) => acc + Number(p.daily_save_velocity || 0), 0);
  const avgVelocity = totalPins > 0 ? Math.round((sumVelocity / totalPins) * 10) / 10 : 0;
  const newCount = currentPins.filter(p => p.metadata?.is_new).length;

  return {
    board,
    latest_snapshot: {
      date: latestDate,
      count: totalPins,
      pins: currentPins
    },
    dropped_pins: droppedPins,
    stats: {
      total: totalPins,
      high_volume: highVolume,
      avg_velocity: avgVelocity,
      new_count: newCount
    }
  };
}

/**
 * Lists available boards (tracked boards + top indexed competitor boards).
 */
export async function listAvailableBoards(sql) {
  // 1. Fetch tracked boards
  const tracked = await sql`
    SELECT tb.*, cp.display_name AS competitor_name
    FROM tracked_boards tb
    LEFT JOIN competitor_profiles cp ON cp.id = tb.competitor_id
    ORDER BY tb.last_scanned_at DESC NULLS LAST, tb.created_at DESC;
  `;

  // 2. Fetch top competitor boards for quick-selection (ordered by pin_count descending)
  const topCompetitorBoards = await sql`
    WITH ranked_boards AS (
      SELECT DISTINCT ON (cb.board_id)
        cb.board_id, cb.name, cb.url, cb.pin_count, cb.follower_count,
        cb.metadata->>'image_cover_url' AS image_cover_url, cp.username, cp.display_name
      FROM competitor_boards cb
      JOIN competitor_profiles cp ON cp.id = cb.competitor_id
      WHERE cb.url IS NOT NULL AND cb.url <> ''
      ORDER BY cb.board_id, cb.pin_count DESC NULLS LAST
    )
    SELECT * FROM ranked_boards
    ORDER BY pin_count DESC NULLS LAST
    LIMIT 50;
  `;

  return {
    tracked_boards: tracked,
    suggested_boards: topCompetitorBoards
  };
}

/**
 * Removes a board from tracking (cascades to snapshots).
 */
export async function deleteTrackedBoard(sql, boardId) {
  const cleanId = String(boardId || '').trim();
  if (!cleanId) return { deleted_count: 0, board_id: '', deleted_board_id: '' };

  const res = await sql`
    DELETE FROM tracked_boards
    WHERE board_id = ${cleanId}
    RETURNING id;
  `;

  return {
    deleted_count: res.length,
    board_id: cleanId,
    deleted_board_id: cleanId
  };
}
