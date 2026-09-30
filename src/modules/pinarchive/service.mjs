/**
 * PinArchive Service
 * Project 4 (PinArchive & Topic Intelligence) Engine for Neon Serverless Postgres.
 *
 * Provides:
 * - Atomic pin batch ingestion into pa_pins & time-series telemetry in pa_pin_metrics.
 * - Semantic topic cluster extraction from annotations via pa_topic_clusters_page.
 * - High-speed indexed listing & filtering of archived winning pins.
 * - Safe staging & Bulk Compare-And-Swap (CAS) dispatching via pa_staged_pins.
 */

/**
 * Format numbers with abbreviation (e.g. 12.4K, 1.2M)
 */
export function formatMetric(num, abbrev = false) {
  if (num === null || num === undefined) return '0';
  const val = Number(num);
  if (isNaN(val)) return '0';
  if (abbrev) {
    if (val >= 1000000) return (val / 1000000).toFixed(1) + 'M';
    if (val >= 1000) return (val / 1000).toFixed(1) + 'K';
    return String(val);
  }
  return val.toLocaleString();
}

/**
 * Ingest a batch of formatted pins into pa_pins & record time-series in pa_pin_metrics
 */
export async function ingestPinsBatch(sql, pins, accountUsername = null) {
  if (!Array.isArray(pins) || pins.length === 0) {
    return { ok: true, added: 0, updated: 0 };
  }

  let addedCount = 0;
  let updatedCount = 0;

  for (const pin of pins) {
    const pinId = String(pin.pin_id || pin.id || '').trim();
    if (!pinId) continue;

    const title = pin.title || '';
    const description = pin.description || '';
    const link = pin.link || '';
    const domain = pin.domain || (link ? new URL(link).hostname : '');
    const boardName = pin.board_name || '';
    const imageUrl = pin.image_url || '';
    const dominantColor = pin.dominant_color || '#888888';
    const saves = Number(pin.saves || 0);
    const repins = Number(pin.repins || saves);
    const comments = Number(pin.comments || 0);
    const shareCount = Number(pin.share_count || 0);
    const reactions = typeof pin.reactions === 'object' ? JSON.stringify(pin.reactions) : '{}';
    const velocity = Number(pin.velocity || 0);
    const annotations = Array.isArray(pin.annotations) ? JSON.stringify(pin.annotations) : '[]';
    const isVideo = Boolean(pin.is_video);
    const isProduct = Boolean(pin.is_product);
    const createdAtPinterest = pin.created_at_pinterest ? new Date(pin.created_at_pinterest) : new Date();

    const [row] = await sql`
      INSERT INTO pa_pins (
        pin_id,
        account_username,
        title,
        description,
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
      ) VALUES (
        ${pinId},
        ${accountUsername},
        ${title},
        ${description},
        ${link},
        ${domain},
        ${boardName},
        ${imageUrl},
        ${dominantColor},
        ${saves},
        ${repins},
        ${comments},
        ${shareCount},
        ${reactions}::jsonb,
        ${velocity},
        ${annotations}::jsonb,
        ${isVideo},
        ${isProduct},
        ${createdAtPinterest},
        NOW(),
        NOW()
      )
      ON CONFLICT (pin_id) DO UPDATE SET
        account_username = COALESCE(EXCLUDED.account_username, pa_pins.account_username),
        title = CASE WHEN EXCLUDED.title <> '' THEN EXCLUDED.title ELSE pa_pins.title END,
        description = CASE WHEN EXCLUDED.description <> '' THEN EXCLUDED.description ELSE pa_pins.description END,
        link = CASE WHEN EXCLUDED.link <> '' THEN EXCLUDED.link ELSE pa_pins.link END,
        domain = CASE WHEN EXCLUDED.domain <> '' THEN EXCLUDED.domain ELSE pa_pins.domain END,
        board_name = CASE WHEN EXCLUDED.board_name <> '' THEN EXCLUDED.board_name ELSE pa_pins.board_name END,
        image_url = CASE WHEN EXCLUDED.image_url <> '' THEN EXCLUDED.image_url ELSE pa_pins.image_url END,
        dominant_color = EXCLUDED.dominant_color,
        saves = GREATEST(pa_pins.saves, EXCLUDED.saves),
        repins = GREATEST(pa_pins.repins, EXCLUDED.repins),
        comments = GREATEST(pa_pins.comments, EXCLUDED.comments),
        share_count = GREATEST(pa_pins.share_count, EXCLUDED.share_count),
        reactions = EXCLUDED.reactions,
        velocity = EXCLUDED.velocity,
        annotations = CASE WHEN jsonb_array_length(EXCLUDED.annotations) > 0 THEN EXCLUDED.annotations ELSE pa_pins.annotations END,
        last_updated_at = NOW()
      RETURNING (xmax = 0) AS is_inserted;
    `;

    if (row?.is_inserted) addedCount++;
    else updatedCount++;

    // Record telemetry snapshot in pa_pin_metrics (rate-limited to 1 per hour per pin via recorded_at)
    await sql`
      INSERT INTO pa_pin_metrics (
        pin_id,
        saves,
        repins,
        comments
      ) VALUES (
        ${pinId},
        ${saves},
        ${repins},
        ${comments}
      )
      ON CONFLICT (pin_id, recorded_at) DO NOTHING;
    `;
  }

  return { ok: true, added: addedCount, updated: updatedCount, total: pins.length };
}

/**
 * Get aggregated PinArchive overview metrics
 */
export async function getPinArchiveOverview(sql) {
  const [stats] = await sql`
    SELECT
      COUNT(*)::bigint AS total_pins,
      COALESCE(SUM(saves), 0)::bigint AS total_saves,
      COALESCE(SUM(repins), 0)::bigint AS total_repins,
      ROUND(COALESCE(AVG(velocity), 0), 2)::numeric AS avg_velocity,
      COUNT(DISTINCT account_username)::int AS tracked_accounts
    FROM pa_pins;
  `;

  const [topCluster] = await sql`
    SELECT *
    FROM pa_topic_clusters_page(1, NULL, 1, 0);
  `;

  const [stagedCount] = await sql`
    SELECT COUNT(*)::int AS count
    FROM pa_staged_pins
    WHERE status = 'staged';
  `;

  return {
    total_pins: Number(stats?.total_pins || 0),
    total_saves: Number(stats?.total_saves || 0),
    total_repins: Number(stats?.total_repins || 0),
    avg_velocity: Number(stats?.avg_velocity || 0),
    tracked_accounts: Number(stats?.tracked_accounts || 0),
    top_cluster: topCluster ? {
      name: topCluster.topic_name,
      pins: Number(topCluster.pins_count),
      avg_saves: Number(topCluster.avg_saves),
      total_saves: Number(topCluster.total_saves),
    } : null,
    staged_pins_count: Number(stagedCount?.count || 0)
  };
}

/**
 * Get topic clusters extracted from AI annotations in Postgres
 */
export async function getTopicClusters(sql, { minPins = 1, search = '', limit = 50, offset = 0 } = {}) {
  const searchPattern = search ? search.trim() : null;

  const rows = await sql`
    SELECT
      topic_name,
      pins_count::bigint AS pins_count,
      total_saves::numeric AS total_saves,
      avg_saves::bigint AS avg_saves,
      avg_velocity::numeric AS avg_velocity
    FROM pa_topic_clusters_page(
      ${minPins},
      ${searchPattern},
      ${limit},
      ${offset}
    );
  `;

  return rows.map(r => ({
    name: r.topic_name,
    pins_count: Number(r.pins_count),
    total_saves: Number(r.total_saves),
    avg_saves: Number(r.avg_saves),
    avg_velocity: Number(r.avg_velocity),
  }));
}

/**
 * List archived pins with filtering, search, and sorting
 */
export async function listArchivedPins(sql, {
  search = '',
  topic = '',
  minSaves = 0,
  account = '',
  sortBy = 'saves',
  order = 'desc',
  limit = 50,
  offset = 0
} = {}) {
  let query;
  const searchPattern = search ? `%${search.toLowerCase().trim()}%` : null;

  // Safe sort mapping
  let sortColumn = 'saves';
  if (sortBy === 'velocity') sortColumn = 'velocity';
  if (sortBy === 'created_at') sortColumn = 'created_at_pinterest';
  if (sortBy === 'repins') sortColumn = 'repins';

  const isAsc = String(order).toLowerCase() === 'asc';

  if (searchPattern) {
    if (isAsc) {
      query = await sql`
        SELECT *
        FROM pa_pins
        WHERE saves >= ${minSaves}
          AND (LOWER(title) LIKE ${searchPattern} OR LOWER(description) LIKE ${searchPattern} OR LOWER(board_name) LIKE ${searchPattern})
        ORDER BY
          CASE WHEN ${sortColumn} = 'saves' THEN saves END ASC,
          CASE WHEN ${sortColumn} = 'velocity' THEN velocity END ASC,
          CASE WHEN ${sortColumn} = 'created_at_pinterest' THEN created_at_pinterest END ASC,
          saves ASC
        LIMIT ${limit} OFFSET ${offset};
      `;
    } else {
      query = await sql`
        SELECT *
        FROM pa_pins
        WHERE saves >= ${minSaves}
          AND (LOWER(title) LIKE ${searchPattern} OR LOWER(description) LIKE ${searchPattern} OR LOWER(board_name) LIKE ${searchPattern})
        ORDER BY
          CASE WHEN ${sortColumn} = 'saves' THEN saves END DESC,
          CASE WHEN ${sortColumn} = 'velocity' THEN velocity END DESC,
          CASE WHEN ${sortColumn} = 'created_at_pinterest' THEN created_at_pinterest END DESC,
          saves DESC
        LIMIT ${limit} OFFSET ${offset};
      `;
    }
  } else {
    if (isAsc) {
      query = await sql`
        SELECT *
        FROM pa_pins
        WHERE saves >= ${minSaves}
        ORDER BY
          CASE WHEN ${sortColumn} = 'saves' THEN saves END ASC,
          CASE WHEN ${sortColumn} = 'velocity' THEN velocity END ASC,
          CASE WHEN ${sortColumn} = 'created_at_pinterest' THEN created_at_pinterest END ASC,
          saves ASC
        LIMIT ${limit} OFFSET ${offset};
      `;
    } else {
      query = await sql`
        SELECT *
        FROM pa_pins
        WHERE saves >= ${minSaves}
        ORDER BY
          CASE WHEN ${sortColumn} = 'saves' THEN saves END DESC,
          CASE WHEN ${sortColumn} = 'velocity' THEN velocity END DESC,
          CASE WHEN ${sortColumn} = 'created_at_pinterest' THEN created_at_pinterest END DESC,
          saves DESC
        LIMIT ${limit} OFFSET ${offset};
      `;
    }
  }

  return query;
}

/**
 * Stage selected pins for repurposing & scheduling
 */
export async function stagePinsForRepurpose(sql, { pinIds = [], targetBoard = '', overrideLink = '' } = {}) {
  if (!Array.isArray(pinIds) || pinIds.length === 0) {
    throw new Error('No pin IDs provided to stage.');
  }

  const stagedRows = [];
  for (const pinId of pinIds) {
    const cleanId = String(pinId).trim();
    if (!cleanId) continue;

    const [inserted] = await sql`
      INSERT INTO pa_staged_pins (
        pin_id,
        target_board,
        override_link,
        status,
        created_at,
        updated_at
      ) VALUES (
        ${cleanId},
        ${targetBoard || null},
        ${overrideLink || null},
        'staged',
        NOW(),
        NOW()
      )
      RETURNING *;
    `;
    if (inserted) stagedRows.push(inserted);
  }

  return { ok: true, stagedCount: stagedRows.length, items: stagedRows };
}

/**
 * Atomic Compare-And-Swap (CAS) dispatch claim for a staged pin
 * Prevents double-posting across concurrent workers.
 */
export async function claimStagedPinCas(sql, stagedId) {
  const numericId = parseInt(stagedId, 10);
  if (isNaN(numericId)) {
    throw new Error('Invalid staged ID');
  }

  const [claimed] = await sql`
    UPDATE pa_staged_pins
    SET status = 'dispatched', updated_at = NOW()
    WHERE id = ${numericId} AND status = 'staged'
    RETURNING *;
  `;

  return {
    success: Boolean(claimed),
    item: claimed || null,
  };
}

/**
 * List all staged pins in the repurposing pipeline
 */
export async function listStagedPins(sql, { status = 'staged', limit = 50, offset = 0 } = {}) {
  return await sql`
    SELECT
      s.*,
      p.title,
      p.image_url,
      p.dominant_color,
      p.saves,
      p.velocity,
      p.link AS original_link
    FROM pa_staged_pins s
    JOIN pa_pins p ON s.pin_id = p.pin_id
    WHERE s.status = ${status}
    ORDER BY s.created_at DESC
    LIMIT ${limit} OFFSET ${offset};
  `;
}
