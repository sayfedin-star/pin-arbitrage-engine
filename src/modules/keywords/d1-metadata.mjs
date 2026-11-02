/**
 * Cloudflare D1 Edge Pin Metadata Service
 *
 * Provides sub-3ms edge read-through and bounded chunked writes into D1 SQLite (edge_pins_metadata).
 * Protects Neon Serverless compute by serving metadata at the edge without waking up dormant shards.
 *
 * // [INVARIANT: SAFE-PREFETCH-EDGE-ONLY]
 * // [INVARIANT: ZERO-HUB-SNAPSHOTS]
 * // [INVARIANT: DETERMINISTIC-CRC32-SHARDING]
 */

export let isEdgePinsMetadataReady = false;

/**
 * Ensures `edge_pins_metadata` table exists on Cloudflare D1 (`PIN_D1_DB`)
 */
export async function ensureEdgePinsMetadataTable(env) {
  if (isEdgePinsMetadataReady || !env?.PIN_D1_DB) return;
  try {
    // [INVARIANT: D1-BATCH-RPC-SETUP] Batch table creation and index initialization
    await env.PIN_D1_DB.batch([
      env.PIN_D1_DB.prepare(`
        CREATE TABLE IF NOT EXISTS edge_pins_metadata (
          pin_id TEXT PRIMARY KEY,
          title TEXT DEFAULT '',
          domain TEXT DEFAULT '',
          destination_url TEXT DEFAULT '',
          image_url TEXT DEFAULT '',
          creator_username TEXT DEFAULT '',
          board_name TEXT DEFAULT '',
          dominant_color TEXT DEFAULT '#888888',
          visual_annotations TEXT DEFAULT '[]',
          seo_alt_text TEXT DEFAULT '',
          description TEXT DEFAULT '',
          metadata TEXT DEFAULT '{}',
          daily_trajectory TEXT DEFAULT '[]',
          created_at_pinterest TEXT,
          updated_at TEXT DEFAULT (datetime('now'))
        )
      `),
      env.PIN_D1_DB.prepare(`CREATE INDEX IF NOT EXISTS idx_edge_pins_domain ON edge_pins_metadata(domain)`)
    ]).catch(() => {});
    // Defensive column upgrade if table was initialized by earlier migration (run separately to avoid batch failure on duplicate column)
    await env.PIN_D1_DB.prepare(`ALTER TABLE edge_pins_metadata ADD COLUMN daily_trajectory TEXT DEFAULT '[]'`).run().catch(() => {});
    // [INVARIANT-LOCK: DO NOT REMOVE - ENFORCED BY verify_regression_locks.mjs] Lock 6: D1 Schema Parity (metadata column)
    await env.PIN_D1_DB.prepare(`ALTER TABLE edge_pins_metadata ADD COLUMN metadata TEXT DEFAULT '{}'`).run().catch(() => {});
    await env.PIN_D1_DB.prepare(`ALTER TABLE edge_pins_metadata ADD COLUMN last_accessed_at TEXT DEFAULT (datetime('now'))`).run().catch(() => {});
    isEdgePinsMetadataReady = true;
  } catch (_) {}
}

/**
 * Batch-syncs creative pin metadata into Cloudflare D1 (`edge_pins_metadata`)
 * in bounded chunks of 80 statements per D1 batch call.
 */
export async function syncPinsBatchToD1(env, pins = []) {
  if (!env?.PIN_D1_DB || !Array.isArray(pins) || pins.length === 0) return 0;
  try {
    await ensureEdgePinsMetadataTable(env);
    const dedup = new Map();
    for (const p of pins) {
      if (!p || !p.pin_id) continue;
      const pid = String(p.pin_id).trim();
      if (!pid) continue;
      if (!dedup.has(pid) || (p.title && p.image_url)) {
        dedup.set(pid, p);
      }
    }
    const uniquePins = Array.from(dedup.values());
    const nowIso = new Date().toISOString();
    let synced = 0;
    const CHUNK = 80;
    for (let i = 0; i < uniquePins.length; i += CHUNK) {
      const slice = uniquePins.slice(i, i + CHUNK);
      const stmts = slice.map(p => {
        const annotationsArr = Array.isArray(p.visual_annotations)
          ? p.visual_annotations
          : (Array.isArray(p.annotations) ? p.annotations : []);
        const metaObj = {
          ...((p.metadata && typeof p.metadata === 'object') ? p.metadata : {}),
          ...((p.extra_meta && typeof p.extra_meta === 'object') ? p.extra_meta : {})
        };
        const candidateMethods = [
          p.creation_method,
          p.method,
          metaObj.creation_method,
          metaObj.method
        ].filter(m => m && typeof m === 'string' && m.trim().length > 0);
        const mVal = candidateMethods.find(m => m.trim().toLowerCase() !== 'pinterest_platform') || candidateMethods[0] || null;
        if (mVal) {
          metaObj.creation_method = mVal;
          metaObj.method = mVal;
        }
        if (p.aspect_ratio && !metaObj.aspect_ratio) {
          metaObj.aspect_ratio = p.aspect_ratio;
        }
        const trajectoryArr = Array.isArray(p.daily_trajectory) ? p.daily_trajectory : [];
        return env.PIN_D1_DB.prepare(`
          INSERT INTO edge_pins_metadata (
            pin_id, title, domain, destination_url, image_url,
            creator_username, board_name, dominant_color, visual_annotations,
            seo_alt_text, description, metadata, daily_trajectory, created_at_pinterest, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(pin_id) DO UPDATE SET
            title = CASE WHEN excluded.title <> '' THEN excluded.title ELSE edge_pins_metadata.title END,
            domain = CASE WHEN excluded.domain <> '' THEN excluded.domain ELSE edge_pins_metadata.domain END,
            destination_url = CASE WHEN excluded.destination_url <> '' THEN excluded.destination_url ELSE edge_pins_metadata.destination_url END,
            image_url = CASE WHEN excluded.image_url <> '' THEN excluded.image_url ELSE edge_pins_metadata.image_url END,
            creator_username = CASE WHEN excluded.creator_username <> '' THEN excluded.creator_username ELSE edge_pins_metadata.creator_username END,
            board_name = CASE WHEN excluded.board_name <> '' THEN excluded.board_name ELSE edge_pins_metadata.board_name END,
            dominant_color = CASE WHEN excluded.dominant_color <> '#888888' THEN excluded.dominant_color ELSE edge_pins_metadata.dominant_color END,
            visual_annotations = CASE WHEN excluded.visual_annotations <> '[]' THEN excluded.visual_annotations ELSE edge_pins_metadata.visual_annotations END,
            seo_alt_text = CASE WHEN excluded.seo_alt_text <> '' THEN excluded.seo_alt_text ELSE edge_pins_metadata.seo_alt_text END,
            description = CASE WHEN excluded.description <> '' THEN excluded.description ELSE edge_pins_metadata.description END,
            metadata = CASE WHEN excluded.metadata <> '{}' AND excluded.metadata <> '' THEN excluded.metadata ELSE edge_pins_metadata.metadata END,
            daily_trajectory = CASE WHEN excluded.daily_trajectory <> '[]' AND excluded.daily_trajectory <> '' THEN excluded.daily_trajectory ELSE edge_pins_metadata.daily_trajectory END,
            created_at_pinterest = COALESCE(excluded.created_at_pinterest, edge_pins_metadata.created_at_pinterest),
            updated_at = excluded.updated_at
        `).bind(
          String(p.pin_id),
          String(p.title || ''),
          String(p.domain || ''),
          String(p.destination_url || ''),
          String(p.image_url || ''),
          String(p.creator_username || p.metadata?.pinner?.username || ''),
          String(p.board_name || p.metadata?.board_name || ''),
          String(p.dominant_color || '#888888'),
          JSON.stringify(annotationsArr),
          String(p.seo_alt_text || p.alt_text || p.metadata?.alt_text || ''),
          String(p.description || p.metadata?.description || ''),
          JSON.stringify(metaObj),
          JSON.stringify(trajectoryArr),
          p.created_at_pinterest ? new Date(p.created_at_pinterest).toISOString() : null,
          nowIso
        );
      });
      await env.PIN_D1_DB.batch(stmts);
      synced += stmts.length;
    }
    return synced;
  } catch (err) {
    console.warn('[syncPinsBatchToD1] Non-fatal D1 sync warning:', err.message);
    return 0;
  }
}

/**
 * Reads pin creative metadata from Cloudflare D1 (`edge_pins_metadata`) in < 3ms
 * using chunks of 80 parameters to respect D1's 100-variable SQLite limit.
 */
export async function hydratePinsFromD1(env, pinIds = []) {
  const map = new Map();
  if (!env?.PIN_D1_DB || !Array.isArray(pinIds) || pinIds.length === 0) return map;
  try {
    await ensureEdgePinsMetadataTable(env);
    const uniqueIds = Array.from(new Set(pinIds.map(id => String(id).trim()).filter(Boolean)));
    const CHUNK = 80;
    const stmts = [];
    for (let i = 0; i < uniqueIds.length; i += CHUNK) {
      const slice = uniqueIds.slice(i, i + CHUNK);
      const placeholders = slice.map(() => '?').join(',');
      stmts.push(
        env.PIN_D1_DB.prepare(
          `SELECT pin_id, title, domain, destination_url, image_url, creator_username, board_name, dominant_color, visual_annotations, seo_alt_text, description, metadata, daily_trajectory, created_at_pinterest FROM edge_pins_metadata WHERE pin_id IN (${placeholders})`
        ).bind(...slice)
      );
    }
    if (stmts.length === 0) return map;
    // [LND-817 FIX] Chunk statements into batches of <= 100 before calling env.PIN_D1_DB.batch()
    const BATCH_STMT_LIMIT = 100;
    const batchRes = [];
    for (let b = 0; b < stmts.length; b += BATCH_STMT_LIMIT) {
      const subBatch = stmts.slice(b, b + BATCH_STMT_LIMIT);
      const res = await env.PIN_D1_DB.batch(subBatch);
      if (Array.isArray(res)) {
        batchRes.push(...res);
      }
    }
    for (const res of (batchRes || [])) {
      for (const r of (res?.results || [])) {
        let parsedAnnotations = [];
        if (Array.isArray(r.visual_annotations)) {
          parsedAnnotations = r.visual_annotations;
        } else if (typeof r.visual_annotations === 'string' && r.visual_annotations.trim()) {
          try { parsedAnnotations = JSON.parse(r.visual_annotations); } catch (_) {}
        }
        let parsedMeta = {};
        if (typeof r.metadata === 'string' && r.metadata.trim()) {
          try { parsedMeta = JSON.parse(r.metadata); } catch (_) {}
        } else if (r.metadata && typeof r.metadata === 'object') {
          parsedMeta = r.metadata;
        }
        let parsedTrajectory = [];
        if (typeof r.daily_trajectory === 'string' && r.daily_trajectory.trim()) {
          try { parsedTrajectory = JSON.parse(r.daily_trajectory); } catch (_) {}
        } else if (Array.isArray(r.daily_trajectory)) {
          parsedTrajectory = r.daily_trajectory;
        }
        map.set(String(r.pin_id), {
          ...r,
          metadata: parsedMeta,
          visual_annotations: Array.isArray(parsedAnnotations) ? parsedAnnotations : [],
          daily_trajectory: parsedTrajectory,
          alt_text: r.seo_alt_text || '',
          creation_method: parsedMeta.creation_method || parsedMeta.method || null,
          aspect_ratio: r.aspect_ratio || parsedMeta.aspect_ratio || null
        });
      }
    }
  } catch (_) {}
  return map;
}

export let isEdgeKeywordsTableReady = false;

/**
 * Ensures `edge_keywords_catalog` and `edge_keywords_meta` tables exist on Cloudflare D1
 */
export async function ensureEdgeKeywordsCatalogTable(env) {
  if (isEdgeKeywordsTableReady || !env?.PIN_D1_DB) return;
  try {
    await env.PIN_D1_DB.batch([
      env.PIN_D1_DB.prepare(`
        CREATE TABLE IF NOT EXISTS edge_keywords_catalog (
          id INTEGER PRIMARY KEY,
          keyword TEXT NOT NULL,
          category TEXT DEFAULT 'General',
          target_pin_count INTEGER DEFAULT 50,
          refresh_interval_hours INTEGER DEFAULT 24,
          last_crawled_at TEXT,
          top_pin_id TEXT,
          top_pin_title TEXT,
          top_pin_image TEXT,
          avg_daily_velocity REAL DEFAULT 0,
          is_active INTEGER DEFAULT 1,
          tags TEXT DEFAULT '{}',
          metadata TEXT DEFAULT '{}',
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now')),
          crawl_pages_limit INTEGER DEFAULT 2,
          inspection_mode TEXT DEFAULT 'full_catalog',
          canonical_keyword TEXT,
          snapshots_count INTEGER DEFAULT 0,
          total_pins_count INTEGER DEFAULT 0,
          folders TEXT DEFAULT '[]'
        )
      `),
      env.PIN_D1_DB.prepare(`CREATE INDEX IF NOT EXISTS idx_edge_keywords_kw ON edge_keywords_catalog(keyword)`),
      env.PIN_D1_DB.prepare(`CREATE INDEX IF NOT EXISTS idx_edge_keywords_created ON edge_keywords_catalog(created_at DESC)`),
      env.PIN_D1_DB.prepare(`
        CREATE TABLE IF NOT EXISTS edge_keywords_meta (
          key TEXT PRIMARY KEY,
          value TEXT,
          updated_at TEXT DEFAULT (datetime('now'))
        )
      `)
    ]).catch(() => {});
    isEdgeKeywordsTableReady = true;
  } catch (err) {
    console.warn('[ensureEdgeKeywordsCatalogTable] Non-fatal init error:', err?.message || err);
  }
}

/**
 * Reads keywords from Cloudflare D1 (`edge_keywords_catalog`) in < 5ms.
 * Supports keyword search and folder-scoped filtering via SQLite json_each(folders).
 *
 * // [INVARIANT: D1-FOLDER-SCOPED-READ]
 */
export async function readKeywordsFromD1(env, { search = '', limit = 1000, offset = 0, folderId = null } = {}) {
  if (!env?.PIN_D1_DB) return null;
  await ensureEdgeKeywordsCatalogTable(env);
  try {
    // 1. Verify that D1 edge catalog has been fully warmed and seeded
    let meta = null;
    try {
      const metaRow = await env.PIN_D1_DB.prepare(
        "SELECT value FROM edge_keywords_meta WHERE key = ? LIMIT 1"
      ).bind('catalog_status').first();
      if (metaRow?.value) {
        meta = JSON.parse(metaRow.value);
      }
    } catch (_) {}

    // If edge catalog hasn't completed a full warm, treat as cold to allow Neon Hub to seed it
    if (!meta || !meta.is_warmed) {
      return null;
    }

    const lim = Math.max(1, Math.min(parseInt(limit, 10) || 1000, 1000));
    const off = Math.max(0, parseInt(offset, 10) || 0);
    const fId = folderId ? Number(folderId) : null;

    const whereClauses = [];
    const bindParams = [];

    if (search && search.trim()) {
      whereClauses.push('LOWER(keyword) LIKE ?');
      bindParams.push(`%${search.trim().toLowerCase()}%`);
    }

    // [INVARIANT: D1-FOLDER-SCOPED-READ]
    // Evaluates folders JSON array in D1 SQLite using json_each:
    // AND EXISTS (SELECT 1 FROM json_each(folders) WHERE json_extract(value, '$.id') = ? OR value = ?)
    if (fId && Number.isFinite(fId) && fId > 0) {
      whereClauses.push(`EXISTS (
        SELECT 1 FROM json_each(folders) 
        WHERE json_extract(value, '$.id') = ? OR value = ?
      )`);
      bindParams.push(fId, fId);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const sqlStatement = `
      SELECT * FROM edge_keywords_catalog 
      ${whereSql}
      ORDER BY created_at DESC 
      LIMIT ? OFFSET ?
    `;
    bindParams.push(lim, off);

    const queryRes = await env.PIN_D1_DB.prepare(sqlStatement).bind(...bindParams).all();

    if (!queryRes || !Array.isArray(queryRes.results)) return null;
    if (queryRes.results.length === 0) {
      if (!search && !fId && off === 0) return null;
      return [];
    }

    // If requesting full catalog without search/folder filter and results are fewer than expected, re-warm
    if (!search && !fId && off === 0 && lim >= meta.count && queryRes.results.length < meta.count) {
      return null;
    }

    return queryRes.results.map(row => {
      let m = {};
      if (typeof row.metadata === 'string') {
        try { m = JSON.parse(row.metadata); } catch (_) { m = {}; }
      } else if (row.metadata && typeof row.metadata === 'object') {
        m = row.metadata;
      }

      let fldrs = [];
      if (typeof row.folders === 'string') {
        try { fldrs = JSON.parse(row.folders); } catch (_) { fldrs = []; }
      } else if (Array.isArray(row.folders)) {
        fldrs = row.folders;
      }

      return {
        ...row,
        id: Number(row.id),
        target_pin_count: Number(row.target_pin_count || 50),
        refresh_interval_hours: Number(row.refresh_interval_hours || 24),
        avg_daily_velocity: String(row.avg_daily_velocity || '0.00'),
        is_active: Boolean(row.is_active),
        crawl_pages_limit: Number(row.crawl_pages_limit || 2),
        snapshots_count: Number(row.snapshots_count || 0),
        active_pins_count: Number(row.active_pins_count ?? row.snapshots_count ?? 0),
        displaced_pins_count: Number(row.displaced_pins_count ?? Math.max(0, (row.total_pins_count || 0) - (row.snapshots_count || 0))),
        total_pins_count: Number(row.total_pins_count || 0),
        metadata: m,
        folders: fldrs
      };
    });
  } catch (err) {
    console.warn('[readKeywordsFromD1] Read error (falling back to Neon):', err?.message || err);
    return null;
  }
}

/**
 * Evicts D1 edge keywords catalog by invalidating catalog_status in edge_keywords_meta,
 * or deletes a specific keyword from edge_keywords_catalog.
 *
 * // [INVARIANT: ZERO-BLACKOUT-D1-CATALOG]
 */
export async function evictKeywordsCatalogFromD1(env, keywordId = null) {
  if (!env?.PIN_D1_DB) return;
  await ensureEdgeKeywordsCatalogTable(env);
  try {
    if (keywordId) {
      await env.PIN_D1_DB.prepare("DELETE FROM edge_keywords_catalog WHERE id = ?").bind(Number(keywordId)).run();
    } else {
      // Mark catalog status as stale instead of wiping entire table
      await env.PIN_D1_DB.prepare(`
        INSERT INTO edge_keywords_meta (key, value, updated_at)
        VALUES (?, ?, datetime('now'))
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at
      `).bind('catalog_status', JSON.stringify({ is_warmed: false, stale: true, invalidated_at: new Date().toISOString() })).run().catch(() => {});
    }
  } catch (err) {
    console.warn('[evictKeywordsCatalogFromD1] Non-fatal D1 eviction error:', err?.message || err);
  }
}

/**
 * Synchronizes keyword catalog into Cloudflare D1 (`edge_keywords_catalog`).
 * Uses safe bounded batching of prepared statements (<= 99 variables per statement,
 * and chunked into batches of <= 100 statements before calling env.PIN_D1_DB.batch()).
 *
 * // [INVARIANT: ZERO-BLACKOUT-D1-CATALOG]
 * // [INVARIANT-LOCK: DO NOT REMOVE - ENFORCED BY verify_regression_locks.mjs] Lock 6: Safe D1 Catalog Synchronization
 */
export async function syncKeywordsCatalogToD1(env, keywords, options = {}) {
  if (!env?.PIN_D1_DB || !Array.isArray(keywords) || keywords.length === 0) return;
  await ensureEdgeKeywordsCatalogTable(env);
  // [INVARIANT-LOCK: DO NOT REMOVE - ENFORCED BY verify_regression_locks.mjs] Lock 6: Safe D1 Catalog Synchronization
  const isFullCatalog = options.isFullCatalog === true;
  try {
    const CHUNK_SIZE = 50;
    for (let i = 0; i < keywords.length; i += CHUNK_SIZE) {
      const slice = keywords.slice(i, i + CHUNK_SIZE);
      const stmts = [];
      for (const k of slice) {
        if (!k) continue;
        const id = Number(k.id ?? k.keyword_id);
        if (!id || !Number.isFinite(id)) continue;
        const keyword = String(k.keyword || '').trim();
        if (!keyword) continue;
        const category = String(k.category || 'General');
        const targetPinCount = Number(k.target_pin_count || 50);
        const refreshInterval = Number(k.refresh_interval_hours || 24);
        const lastCrawledAt = k.last_crawled_at ? new Date(k.last_crawled_at).toISOString() : null;
        const topPinId = k.top_pin_id ? String(k.top_pin_id) : null;
        const topPinTitle = k.top_pin_title ? String(k.top_pin_title) : null;
        const topPinImage = k.top_pin_image ? String(k.top_pin_image) : null;
        const avgVelocity = Number(k.avg_daily_velocity || 0);
        const isActive = k.is_active === false ? 0 : 1;
        const tags = typeof k.tags === 'string' ? k.tags : JSON.stringify(k.tags || {});
        const metadata = typeof k.metadata === 'string' ? k.metadata : JSON.stringify(k.metadata || {});
        const createdAt = k.created_at ? new Date(k.created_at).toISOString() : new Date().toISOString();
        const updatedAt = k.updated_at ? new Date(k.updated_at).toISOString() : new Date().toISOString();
        const crawlPagesLimit = Number(k.crawl_pages_limit || 2);
        const inspectionMode = String(k.inspection_mode || 'full_catalog');
        const canonicalKeyword = (k.canonical_keyword ?? k.normalized_keyword) ? String(k.canonical_keyword ?? k.normalized_keyword) : null;
        const snapshotsCount = Number(k.snapshots_count || 0);
        const totalPinsCount = Number(k.total_pins_count || 0);
        const folders = typeof k.folders === 'string' ? k.folders : JSON.stringify(k.folders || []);

        stmts.push(
          env.PIN_D1_DB.prepare(`
            INSERT INTO edge_keywords_catalog (
              id, keyword, category, target_pin_count, refresh_interval_hours,
              last_crawled_at, top_pin_id, top_pin_title, top_pin_image,
              avg_daily_velocity, is_active, tags, metadata,
              created_at, updated_at, crawl_pages_limit, inspection_mode,
              canonical_keyword, snapshots_count, total_pins_count, folders
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              keyword = excluded.keyword,
              category = excluded.category,
              target_pin_count = excluded.target_pin_count,
              refresh_interval_hours = excluded.refresh_interval_hours,
              last_crawled_at = excluded.last_crawled_at,
              top_pin_id = excluded.top_pin_id,
              top_pin_title = excluded.top_pin_title,
              top_pin_image = excluded.top_pin_image,
              avg_daily_velocity = excluded.avg_daily_velocity,
              is_active = excluded.is_active,
              tags = excluded.tags,
              metadata = excluded.metadata,
              updated_at = excluded.updated_at,
              crawl_pages_limit = excluded.crawl_pages_limit,
              inspection_mode = excluded.inspection_mode,
              canonical_keyword = excluded.canonical_keyword,
              snapshots_count = excluded.snapshots_count,
              total_pins_count = excluded.total_pins_count,
              folders = excluded.folders
          `).bind(
            id, keyword, category, targetPinCount, refreshInterval,
            lastCrawledAt, topPinId, topPinTitle, topPinImage,
            avgVelocity, isActive, tags, metadata,
            createdAt, updatedAt, crawlPagesLimit, inspectionMode,
            canonicalKeyword, snapshotsCount, totalPinsCount, folders
          )
        );
      }
      if (stmts.length > 0) {
        // [LND-817 FIX] Chunk statements into batches of <= 100 before calling env.PIN_D1_DB.batch()
        const BATCH_STMT_LIMIT = 100;
        for (let b = 0; b < stmts.length; b += BATCH_STMT_LIMIT) {
          const subBatch = stmts.slice(b, b + BATCH_STMT_LIMIT);
          await env.PIN_D1_DB.batch(subBatch);
        }
      }
    }

    if (isFullCatalog && keywords.length > 0) {
      // [INVARIANT: ZERO-BLACKOUT-D1-CATALOG]
      // Prune obsolete IDs after in-place upsert without blanking table during sync
      const activeIds = keywords.map(k => Number(k.id ?? k.keyword_id)).filter(id => Number.isFinite(id) && id > 0);
      if (activeIds.length > 0) {
        const existingRows = await env.PIN_D1_DB.prepare('SELECT id FROM edge_keywords_catalog').all().catch(() => ({ results: [] }));
        const currentIds = (existingRows?.results || []).map(r => Number(r.id));
        const activeIdSet = new Set(activeIds);
        const obsoleteIds = currentIds.filter(id => !activeIdSet.has(id));
        if (obsoleteIds.length > 0) {
          const PRUNE_CHUNK = 50;
          for (let p = 0; p < obsoleteIds.length; p += PRUNE_CHUNK) {
            const pSlice = obsoleteIds.slice(p, p + PRUNE_CHUNK);
            const placeholders = pSlice.map(() => '?').join(',');
            await env.PIN_D1_DB.prepare(`DELETE FROM edge_keywords_catalog WHERE id IN (${placeholders})`).bind(...pSlice).run().catch(() => {});
          }
        }
      }
      await env.PIN_D1_DB.prepare(`
        INSERT INTO edge_keywords_meta (key, value, updated_at)
        VALUES (?, ?, datetime('now'))
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at
      `).bind('catalog_status', JSON.stringify({ is_warmed: true, count: keywords.length, synced_at: new Date().toISOString() })).run().catch(() => {});
    }
  } catch (err) {
    console.warn('[syncKeywordsCatalogToD1] Non-fatal catalog D1 sync error:', err?.message || err);
  }
}

