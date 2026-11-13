/**
 * Competitor Boards Sync & Detail Service
 * Split from src/modules/creators/service.mjs (Layer 3 — depends on competitors-crud & creator-ingest)
 */

import { formatPinterestCookie } from '../../utils.mjs';
import { fetchBoardsResource, fetchBoardDetailUnauth, fetchBoardFeedResource, sleep, randomJitterMs } from '../../core/pinterest/index.mjs';
import crypto from 'node:crypto';
import { normalizePinterestUsername, resolveLocalCompetitorId, getCompetitorRules, getQualificationRules } from './competitors-crud.mjs';
import { upsertCompetitorPins, ingestPinsBatch } from './creator-ingest.mjs';

/**
 * Deterministic Synthetic Board ID Generator
 * Generates an immutable, idempotent MD5 hash matching Migration 011 SQL schema standards.
 */
export function generateSyntheticBoardId(competitorId, boardName) {
  const norm = String(boardName || 'General').trim().toLowerCase();
  const hash = crypto.createHash('md5').update(`${competitorId}:${norm}`).digest('hex').slice(0, 16);
  return `cb-${hash}`;
}


/**
 * Get all boards for a competitor
 */
export async function getCompetitorBoards(sql, competitorId, { username = '' } = {}) {
  let cleanUser = username ? normalizePinterestUsername(username) : null;
  let numericId = parseInt(competitorId, 10);
  if (!cleanUser && isNaN(numericId) && competitorId) {
    cleanUser = normalizePinterestUsername(competitorId);
  }

  // Resolve local shard numeric ID prioritizing canonical username:
  numericId = await resolveLocalCompetitorId(sql, cleanUser || competitorId, { expectedUsername: cleanUser });
  if (!numericId || isNaN(numericId)) return [];

  let boards = [];
  try {
    boards = await sql`
      WITH deduped AS (
        SELECT DISTINCT ON (LOWER(TRIM(cb.name)))
          cb.*
        FROM competitor_boards cb
        WHERE cb.competitor_id = ${numericId}
        ORDER BY 
          LOWER(TRIM(cb.name)),
          (CASE WHEN cb.board_id NOT LIKE 'cb-%' THEN 0 ELSE 1 END) ASC,
          cb.pin_count DESC
      )
      SELECT * FROM deduped
      ORDER BY pin_count DESC;
    `;
  } catch (err) {
    console.warn(`[getCompetitorBoards] Boards query error for ID ${numericId}:`, err.message);
  }

  // Discover & merge any additional boards from competitor_pins
  try {
    const rawBoards = await sql`
      SELECT 
        COALESCE(NULLIF(TRIM(board_name), ''), 'General') AS name,
        COUNT(*)::int AS pin_count,
        0::int AS follower_count,
        MAX(created_at_pinterest) AS last_pinned_at,
        MIN(created_at_pinterest) AS created_at
      FROM competitor_pins
      WHERE competitor_id = ${numericId} AND board_name IS NOT NULL AND TRIM(board_name) <> ''
      GROUP BY name
      ORDER BY pin_count DESC;
    `;
    const existingNames = new Set(boards.map(b => (b.name || '').trim().toLowerCase()));
    for (const b of rawBoards) {
      const norm = (b.name || '').trim().toLowerCase();
      if (!existingNames.has(norm)) {
        existingNames.add(norm);
        boards.push({
          id: boards.length + 1,
          competitor_id: numericId,
          board_id: generateSyntheticBoardId(numericId, b.name),
          name: b.name,
          url: `https://www.pinterest.com/${cleanUser || 'pin'}/${encodeURIComponent(b.name.toLowerCase().replace(/\s+/g, '-'))}/`,
          pin_count: b.pin_count,
          follower_count: b.follower_count,
          last_pinned_at: b.last_pinned_at,
          created_at: b.created_at,
          metadata: {}
        });
      }
    }
  } catch (err) {
    console.warn(`[getCompetitorBoards] Pin board discovery aggregation error for ID ${numericId}:`, err.message);
  }

  // Invariant guarantee: strictly one entry per unique normalized board name, prioritizing authentic boards
  const uniqueBoardMap = new Map();
  for (const b of boards) {
    const norm = (b.name || '').trim().toLowerCase();
    if (!norm) continue;
    const existing = uniqueBoardMap.get(norm);
    if (!existing) {
      uniqueBoardMap.set(norm, b);
    } else {
      const isCurAuthentic = !String(b.board_id || '').startsWith('cb-');
      const isExistingAuthentic = !String(existing.board_id || '').startsWith('cb-');
      if (isCurAuthentic && !isExistingAuthentic) {
        uniqueBoardMap.set(norm, b);
      } else if (isCurAuthentic === isExistingAuthentic && (b.pin_count || 0) > (existing.pin_count || 0)) {
        uniqueBoardMap.set(norm, b);
      }
    }
  }
  boards = Array.from(uniqueBoardMap.values()).sort((a, b) => (b.pin_count || 0) - (a.pin_count || 0));

  // Map metadata to top-level fields for fast access
  boards = boards.map(b => {
    const meta = (typeof b.metadata === 'object' && b.metadata !== null) ? b.metadata : {};
    return {
      ...b,
      image_cover_url: b.image_cover_url || meta.image_cover_url || null,
      board_vase: Array.isArray(b.board_vase) && b.board_vase.length > 0 ? b.board_vase : (Array.isArray(meta.board_vase) ? meta.board_vase : []),
      description: b.description || meta.description || ''
    };
  });

  // Fallback: Populate missing board covers using the top saved pin from pa_pins for that board
  const boardsNeedingCover = boards.filter(b => !b.image_cover_url && b.name);
  if (boardsNeedingCover.length > 0 && cleanUser) {
    try {
      const pinCovers = await sql`
        SELECT DISTINCT ON (LOWER(TRIM(board_name)))
          LOWER(TRIM(board_name)) AS b_name,
          image_url
        FROM pa_pins
        WHERE account_username = ${cleanUser}
          AND image_url IS NOT NULL AND image_url <> ''
        ORDER BY LOWER(TRIM(board_name)), saves DESC;
      `;
      const coverMap = new Map();
      for (const row of pinCovers) {
        coverMap.set(row.b_name, row.image_url);
      }
      for (const b of boards) {
        if (!b.image_cover_url && b.name) {
          const c = coverMap.get(b.name.trim().toLowerCase());
          if (c) b.image_cover_url = c;
        }
      }
    } catch (_) {}
  }

  return boards;
}


/**
 * Sync boards for a competitor from Pinterest BoardsResource
 */
export async function syncCompetitorBoards(sql, competitorId, username, cookie = '', options = {}) {
  const opts = (typeof cookie === 'object' && cookie !== null) ? cookie : (typeof options === 'object' && options !== null ? options : {});
  const effectiveCookie = typeof cookie === 'string' ? cookie : (opts.cookie || '');
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

  // [INVARIANT: READ-ONLY-GET-SAFE] Never mutate database on unauthenticated requests unless explicitly requested
  if (cleanUsername && isNaN(numericId) && (opts.autoCreate || opts.generateIfEmpty)) {
    try {
      const [c] = await sql`
        INSERT INTO competitor_profiles (username, display_name, account_type, is_active, updated_at)
        VALUES (${cleanUsername}, ${cleanUsername}, 'competitor', TRUE, NOW())
        ON CONFLICT (username) DO UPDATE SET updated_at = NOW()
        RETURNING id, username;
      `;
      if (c?.id) {
        numericId = c.id;
        cleanUsername = c.username;
      }
    } catch (_) {}
  }

  if (isNaN(numericId) || !cleanUsername) {
    throw new Error('Valid competitorId or username is required to sync boards');
  }

  const formattedCookie = formatPinterestCookie(effectiveCookie);

  const res = await fetchBoardsResource(cleanUsername, formattedCookie);
  if (!res.ok || !Array.isArray(res.boards)) {
    return { ok: false, error: res.error || 'Failed to fetch boards from Pinterest' };
  }

  const records = [];
  const authenticNames = [];

  for (const b of res.boards) {
    const boardId = String(b.board_id || '').trim();
    if (!boardId || boardId === 'undefined') continue;
    let lastPinnedDate = null;
    if (b.last_pinned_at) {
      const d = new Date(b.last_pinned_at);
      if (!isNaN(d.getTime())) lastPinnedDate = d.toISOString();
    }
    let boardCreatedAt = null;
    if (b.created_at) {
      const cd = new Date(b.created_at);
      if (!isNaN(cd.getTime())) boardCreatedAt = cd.toISOString();
    }
    const metadataObj = {
      image_cover_url: b.image_cover_url || b.metadata?.image_cover_url || null,
      board_vase: Array.isArray(b.board_vase) && b.board_vase.length > 0 ? b.board_vase : (Array.isArray(b.metadata?.board_vase) ? b.metadata.board_vase : []),
      description: b.description || b.metadata?.description || '',
      section_count: b.metadata?.section_count || 0,
      privacy: b.metadata?.privacy || 'public',
      is_collaborative: Boolean(b.is_collaborative || b.metadata?.is_collaborative),
      is_group_board: Boolean(b.is_group_board || b.metadata?.is_group_board),
      owner_username: b.owner_username || b.metadata?.owner_username || null,
      collaborator_count: Number(b.collaborator_count || b.metadata?.collaborator_count || 0)
    };
    records.push({
      board_id: boardId,
      name: String(b.name || 'Untitled Board').slice(0, 255),
      url: b.url || '',
      pin_count: Number(b.pin_count) || 0,
      follower_count: Number(b.follower_count) || 0,
      last_pinned_at: lastPinnedDate,
      metadata: metadataObj,
      created_at: boardCreatedAt
    });
    if (!boardId.startsWith('cb-') && b.name) {
      authenticNames.push(b.name.trim().toLowerCase());
    }
  }

  // Purge any legacy synthetic placeholder boards
  if (authenticNames.length > 0) {
    try {
      await sql`
        DELETE FROM competitor_boards
        WHERE competitor_id = ${numericId}
          AND board_id LIKE 'cb-%'
          AND LOWER(TRIM(name)) = ANY(${authenticNames});
      `;
    } catch (_) {}
  }

  let syncedCount = 0;
  const chunkSize = 200;
  for (let i = 0; i < records.length; i += chunkSize) {
    const chunk = records.slice(i, i + chunkSize);
    try {
      const inserted = await sql`
        INSERT INTO competitor_boards (
          competitor_id,
          board_id,
          name,
          url,
          pin_count,
          follower_count,
          last_pinned_at,
          metadata,
          created_at,
          updated_at
        )
        SELECT
          ${numericId},
          x.board_id,
          x.name,
          x.url,
          COALESCE(x.pin_count, 0),
          COALESCE(x.follower_count, 0),
          x.last_pinned_at,
          COALESCE(x.metadata, '{}'::jsonb),
          COALESCE(x.created_at, NOW()),
          NOW()
        FROM jsonb_to_recordset(${typeof sql.json === 'function' ? sql.json(chunk) : JSON.stringify(chunk)}::jsonb) AS x(
          board_id VARCHAR(64),
          name VARCHAR(255),
          url TEXT,
          pin_count INT,
          follower_count INT,
          last_pinned_at TIMESTAMPTZ,
          metadata JSONB,
          created_at TIMESTAMPTZ
        )
        ON CONFLICT (competitor_id, board_id) DO UPDATE SET
          name = EXCLUDED.name,
          url = EXCLUDED.url,
          pin_count = EXCLUDED.pin_count,
          follower_count = EXCLUDED.follower_count,
          last_pinned_at = EXCLUDED.last_pinned_at,
          metadata = EXCLUDED.metadata,
          created_at = COALESCE(EXCLUDED.created_at, competitor_boards.created_at),
          updated_at = NOW()
        RETURNING id;
      `;
      syncedCount += inserted.length || chunk.length;
    } catch (batchErr) {
      console.warn(`[syncCompetitorBoards] Batch insert fallback for chunk:`, batchErr.message);
      for (const b of chunk) {
        try {
          await sql`
            INSERT INTO competitor_boards (
              competitor_id, board_id, name, url, pin_count, follower_count, last_pinned_at, metadata, created_at, updated_at
            ) VALUES (
              ${numericId}, ${b.board_id}, ${b.name}, ${b.url}, ${b.pin_count}, ${b.follower_count},
              ${b.last_pinned_at}, ${JSON.stringify(b.metadata)}::jsonb, COALESCE(${b.created_at}, NOW()), NOW()
            )
            ON CONFLICT (competitor_id, board_id) DO UPDATE SET
              name = EXCLUDED.name,
              url = EXCLUDED.url,
              pin_count = EXCLUDED.pin_count,
              follower_count = EXCLUDED.follower_count,
              last_pinned_at = EXCLUDED.last_pinned_at,
              metadata = EXCLUDED.metadata,
              created_at = COALESCE(EXCLUDED.created_at, competitor_boards.created_at),
              updated_at = NOW();
          `;
          syncedCount++;
        } catch (_) {}
      }
    }
  }

  // Update total_boards on competitor profile (counting unique boards)
  await sql`
    UPDATE competitor_profiles
    SET total_boards = (SELECT count(DISTINCT LOWER(TRIM(name)))::int FROM competitor_boards WHERE competitor_id = ${numericId}),
        updated_at = NOW()
    WHERE id = ${numericId};
  `;

  return { ok: true, synced: syncedCount, synced_boards_count: syncedCount, boards: res.boards };
}


/**
 * Retrieve board details with authentic algorithmic board_vase (Related Interests).
 * If board_vase is missing in competitor_boards, automatically fetches from Pinterest live HTML and persists it.
 */
export async function getOrSyncBoardDetail(sql, username, boardNameOrSlug, options = {}) {
  const cleanUsername = normalizePinterestUsername(username);
  if (!cleanUsername) throw new Error('username is required');
  const rawBoard = String(boardNameOrSlug || '').trim();
  if (!rawBoard) throw new Error('board is required');

  const forceRefresh = options?.forceRefresh === true || options?.refresh === true;

  // 1. Look up competitor profile
  let competitorId = null;
  try {
    const [c] = await sql`
      SELECT id, username FROM competitor_profiles 
      WHERE LOWER(username) = ${cleanUsername} 
      LIMIT 1;
    `;
    if (c?.id) competitorId = c.id;
  } catch (_) {}

  // 2. Query competitor_boards
  let existingBoard = null;
  if (competitorId) {
    try {
      const rows = await sql`
        SELECT * FROM competitor_boards
        WHERE competitor_id = ${competitorId}
          AND (
            LOWER(TRIM(name)) = ${rawBoard.toLowerCase()} OR
            REPLACE(LOWER(TRIM(name)), ' ', '-') = REPLACE(${rawBoard.toLowerCase()}, ' ', '-') OR
            REPLACE(LOWER(TRIM(name)), '-', ' ') = REPLACE(${rawBoard.toLowerCase()}, '-', ' ') OR
            LOWER(REGEXP_REPLACE(REGEXP_REPLACE(TRIM(name), '[^[:alnum:]]+', '-', 'g'), '^-|-$', '', 'g')) = LOWER(REGEXP_REPLACE(REGEXP_REPLACE(${rawBoard}, '[^[:alnum:]]+', '-', 'g'), '^-|-$', '', 'g')) OR
            url ILIKE ${'%' + encodeURIComponent(rawBoard.toLowerCase().replace(/\s+/g, '-')) + '%'} OR
            url ILIKE ${'%' + rawBoard.toLowerCase().replace(/\s+/g, '-') + '%'}
          )
        ORDER BY 
          (CASE WHEN board_id NOT LIKE 'cb-%' THEN 0 ELSE 1 END) ASC,
          pin_count DESC
        LIMIT 1;
      `;
      existingBoard = rows[0] || null;
    } catch (_) {}
  }

  const existingMeta = (typeof existingBoard?.metadata === 'object' && existingBoard?.metadata !== null) ? existingBoard.metadata : {};
  const existingVase = Array.isArray(existingBoard?.board_vase) && existingBoard.board_vase.length > 0
    ? existingBoard.board_vase
    : (Array.isArray(existingMeta.board_vase) ? existingMeta.board_vase : []);

  // If already has board_vase and not forcing refresh, return immediately
  if (existingBoard && existingVase.length > 0 && !forceRefresh) {
    return {
      board_id: existingBoard.board_id,
      name: existingBoard.name,
      url: existingBoard.url,
      pin_count: Number(existingBoard.pin_count || 0),
      follower_count: Number(existingBoard.follower_count || 0),
      image_cover_url: existingBoard.image_cover_url || existingMeta.image_cover_url || null,
      description: existingBoard.description || existingMeta.description || '',
      board_vase: existingVase,
      last_pinned_at: existingBoard.last_pinned_at,
      created_at: existingBoard.created_at
    };
  }

  // 3. Live fetch from Pinterest unauthenticated board page
  let scraped = null;
  try {
    const sRes = await fetchBoardDetailUnauth(cleanUsername, rawBoard);
    if (sRes.ok && sRes.board) {
      scraped = sRes.board;
    }
  } catch (err) {
    console.warn(`[getOrSyncBoardDetail] Anonymous board scrape failed for ${cleanUsername}/${rawBoard}:`, err.message);
  }

  if (scraped) {
    const metaToSave = {
      ...(existingMeta || {}),
      image_cover_url: scraped.image_cover_url || existingMeta.image_cover_url || null,
      board_vase: scraped.board_vase || [],
      description: scraped.description || existingMeta.description || '',
    };

    if (competitorId && scraped.board_id) {
      try {
        if (!String(scraped.board_id).startsWith('cb-')) {
          await sql`
            DELETE FROM competitor_boards
            WHERE competitor_id = ${competitorId}
              AND board_id LIKE 'cb-%'
              AND (
                LOWER(TRIM(name)) = ${rawBoard.toLowerCase()} OR
                LOWER(TRIM(name)) = LOWER(TRIM(${scraped.name || ''})) OR
                LOWER(REGEXP_REPLACE(REGEXP_REPLACE(TRIM(name), '[^[:alnum:]]+', '-', 'g'), '^-|-$', '', 'g')) = LOWER(REGEXP_REPLACE(REGEXP_REPLACE(${rawBoard}, '[^[:alnum:]]+', '-', 'g'), '^-|-$', '', 'g'))
              );
          `.catch(() => {});
        }

        await sql`
          INSERT INTO competitor_boards (
            competitor_id, board_id, name, url, pin_count, follower_count,
            metadata, created_at, updated_at
          ) VALUES (
            ${competitorId},
            ${scraped.board_id},
            ${scraped.name || rawBoard},
            ${scraped.url},
            ${scraped.pin_count || 0},
            ${scraped.follower_count || 0},
            ${JSON.stringify(metaToSave)}::jsonb,
            COALESCE(${scraped.created_at ? new Date(scraped.created_at) : null}, NOW()),
            NOW()
          )
          ON CONFLICT (competitor_id, board_id) DO UPDATE SET
            name = EXCLUDED.name,
            url = EXCLUDED.url,
            pin_count = GREATEST(competitor_boards.pin_count, EXCLUDED.pin_count),
            follower_count = EXCLUDED.follower_count,
            metadata = EXCLUDED.metadata,
            updated_at = NOW();
        `;
      } catch (saveErr) {
        console.warn(`[getOrSyncBoardDetail] Failed to persist board to DB:`, saveErr.message);
      }
    }

    return {
      board_id: scraped.board_id,
      name: scraped.name,
      url: scraped.url,
      pin_count: scraped.pin_count,
      follower_count: scraped.follower_count,
      image_cover_url: scraped.image_cover_url,
      description: scraped.description,
      board_vase: scraped.board_vase,
      board_order_modified_at: scraped.board_order_modified_at,
      created_at: scraped.created_at
    };
  }

  // Fallback to existingBoard if Pinterest scrape failed
  if (existingBoard) {
    return {
      board_id: existingBoard.board_id,
      name: existingBoard.name,
      url: existingBoard.url,
      pin_count: Number(existingBoard.pin_count || 0),
      follower_count: Number(existingBoard.follower_count || 0),
      image_cover_url: existingBoard.image_cover_url || existingMeta.image_cover_url || null,
      description: existingBoard.description || existingMeta.description || '',
      board_vase: existingVase,
      last_pinned_at: existingBoard.last_pinned_at,
      created_at: existingBoard.created_at
    };
  }

  return {
    board_id: null,
    name: rawBoard,
    url: `https://www.pinterest.com/${cleanUsername}/${encodeURIComponent(rawBoard.toLowerCase().replace(/\s+/g, '-'))}/`,
    pin_count: 0,
    follower_count: 0,
    image_cover_url: null,
    description: '',
    board_vase: []
  };
}


/**
 * Harvest pins from a specific board of a competitor into competitor_pins and pa_pins (board-level crawling).
 */
export async function syncCompetitorBoardPins(sql, competitorId, username, board, { mode = 'daily', maxPages = 50, cookie = '' } = {}) {
  let cleanUsername = normalizePinterestUsername(username);
  let numericId = parseInt(competitorId, 10);

  let compProfile = null;
  if (cleanUsername) {
    try {
      const [c] = await sql`SELECT id, username, metadata FROM competitor_profiles WHERE LOWER(username) = ${cleanUsername} LIMIT 1;`;
      if (c?.id) {
        numericId = c.id;
        cleanUsername = c.username;
        compProfile = c;
      }
    } catch (_) {}
  } else if (!cleanUsername && !isNaN(numericId)) {
    try {
      const [c] = await sql`SELECT id, username, metadata FROM competitor_profiles WHERE id = ${numericId} LIMIT 1;`;
      if (c?.username) {
        cleanUsername = c.username;
        compProfile = c;
      }
    } catch (_) {}
  }

  if (!cleanUsername) throw new Error('Username is required to sync board pins');

  const boardId = String(board?.board_id || board?.id || '').trim();
  const boardName = String(board?.name || 'Untitled Board').trim();
  let boardUrl = String(board?.url || '').trim();

  if (!boardUrl) {
    boardUrl = `/${cleanUsername}/${encodeURIComponent(boardName.toLowerCase().replace(/\s+/g, '-'))}/`;
  }

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
  const formattedCookie = formatPinterestCookie(cookie);

  let currentBookmark = null;
  let lastSeenBookmark = null;
  let totalFetched = 0;
  let allQualifiedCount = 0;
  let pagesCrawled = 0;
  const pageLimit = Math.max(1, Math.min(Number(maxPages) || 50, 200));

  for (let page = 1; page <= pageLimit; page++) {
    pagesCrawled++;
    const res = await fetchBoardFeedResource(boardId, boardUrl, currentBookmark, formattedCookie);
    if (!res.ok) {
      if (page === 1) return { ok: false, error: res.error || `BoardFeedResource error ${res.status}` };
      break;
    }

    const pins = (res.pins || []).map(p => ({
      ...p,
      board_name: boardName
    }));
    totalFetched += pins.length;

    // 1. Raw inventory upsert to competitor_pins
    if (pins.length > 0 && numericId) {
      await upsertCompetitorPins(sql, numericId, pins);
    }

    // 2. Filter through 3-tier OR rules & ingest qualified winning pins into pa_pins
    // Only run during refresh/daily sync; in discovery mode, parallel shards handle deep Relay v3 enrichment!
    const shouldAutoArchive = compProfile?.metadata?.auto_archive_winning !== false;
    if (pins.length > 0 && mode !== 'discovery' && shouldAutoArchive) {
      const ingestRes = await ingestPinsBatch(sql, pins, cleanUsername, { filterQualified: true, rules });
      allQualifiedCount += (ingestRes.added + ingestRes.updated);
    }

    // Real-time progress feedback in workflow logs
    if (page === 1 || page % 5 === 0) {
      console.log(`    [✓] Board "${boardName}": Page ${page}/${pageLimit} (${totalFetched} pins discovered so far)...`);
    }

    currentBookmark = res.nextBookmark;
    if (!currentBookmark || currentBookmark === '-end-' || currentBookmark === lastSeenBookmark) break;
    lastSeenBookmark = currentBookmark;

    if (page < pageLimit) {
      const delay = (mode === 'discovery') ? randomJitterMs(250, 450) : randomJitterMs(1500, 2500);
      await sleep(delay);
    }
  }

  // Update board's pin_count in competitor_boards
  if (numericId && boardId) {
    try {
      await sql`
        UPDATE competitor_boards
        SET pin_count = GREATEST(pin_count, ${totalFetched}),
            last_pinned_at = NOW(),
            updated_at = NOW()
        WHERE competitor_id = ${numericId} AND board_id = ${boardId};
      `;
    } catch (_) {}
  }

  return {
    ok: true,
    board_id: boardId,
    board_name: boardName,
    pages_crawled: pagesCrawled,
    total_fetched: totalFetched,
    crawled: totalFetched,
    qualified: allQualifiedCount,
    inserted: allQualifiedCount
  };
}
