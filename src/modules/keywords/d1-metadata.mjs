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
    const batchRes = await env.PIN_D1_DB.batch(stmts);
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
          creation_method: parsedMeta.creation_method || parsedMeta.method || null
        });
      }
    }
  } catch (_) {}
  return map;
}
