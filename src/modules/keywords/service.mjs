/**
 * Keyword Velocity & SERP Tracker Service
 * Searches Pinterest for target keywords, tracks pin rank positions,
 * and calculates daily save velocity.
 */

import { formatPinterestCookie } from '../../utils.mjs';

/**
 * List all tracked keywords with velocity summaries
 */
export async function listKeywords(sql, { search = '', limit = 50, offset = 0 } = {}) {
  let query;
  if (search) {
    const pattern = `%${search.toLowerCase().trim()}%`;
    query = await sql`
      SELECT 
        k.*,
        COUNT(s.id)::int AS snapshots_count
      FROM tracked_keywords k
      LEFT JOIN keyword_pins_snapshots s ON s.keyword_id = k.id AND s.snapshot_date = CURRENT_DATE
      WHERE LOWER(k.keyword) LIKE ${pattern}
      GROUP BY k.id
      ORDER BY k.created_at DESC
      LIMIT ${limit} OFFSET ${offset};
    `;
  } else {
    query = await sql`
      SELECT 
        k.*,
        COUNT(s.id)::int AS snapshots_count
      FROM tracked_keywords k
      LEFT JOIN keyword_pins_snapshots s ON s.keyword_id = k.id AND s.snapshot_date = CURRENT_DATE
      GROUP BY k.id
      ORDER BY k.created_at DESC
      LIMIT ${limit} OFFSET ${offset};
    `;
  }
  return query;
}

/**
 * Add a new keyword to track
 */
export async function addKeyword(sql, { keyword, category = 'General', target_pin_count = 50 }) {
  const cleanKeyword = keyword.trim().toLowerCase();
  if (!cleanKeyword) throw new Error('Keyword is required.');

  const [row] = await sql`
    INSERT INTO tracked_keywords (
      keyword,
      category,
      target_pin_count,
      is_active,
      created_at,
      updated_at
    ) VALUES (
      ${cleanKeyword},
      ${category},
      ${target_pin_count},
      TRUE,
      NOW(),
      NOW()
    )
    ON CONFLICT (keyword) DO UPDATE SET
      is_active = TRUE,
      updated_at = NOW()
    RETURNING *;
  `;
  return row;
}

/**
 * Crawl Pinterest search for a keyword and compute daily save velocity
 */
export async function crawlKeywordSERP(sql, keywordId, cookie = (typeof process !== 'undefined' && process?.env ? process.env.PINTEREST_COOKIE : null)) {
  const [keywordRow] = await sql`
    SELECT * FROM tracked_keywords WHERE id = ${keywordId};
  `;
  if (!keywordRow) throw new Error(`Keyword ID ${keywordId} not found.`);

  const query = encodeURIComponent(keywordRow.keyword);
  const url = `https://www.pinterest.com/resource/BaseSearchResource/get/?source_url=%2Fsearch%2Fpins%2F%3Fq%3D${query}&data=%7B%22options%22%3A%7B%22query%22%3A%22${query}%22%2C%22scope%22%3A%22pins%22%2C%22page_size%22%3A${keywordRow.target_pin_count || 50}%7D%2C%22context%22%3A%7B%7D%7D`;

  const headers = {
    'Accept': 'application/json, text/javascript, */*, q=0.01',
    'X-Requested-With': 'XMLHttpRequest',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    'Referer': `https://www.pinterest.com/search/pins/?q=${query}`
  };
  if (cookie) {
    headers['Cookie'] = formatPinterestCookie(cookie);
  }

  const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
  if (!res.ok) {
    throw new Error(`Pinterest Search API returned HTTP ${res.status}`);
  }

  const data = await res.json();
  const rawResults = data?.resource_response?.data?.results || [];

  let rank = 1;
  let topPin = null;

  for (const item of rawResults) {
    if (!item || !item.id) continue;
    const pinId = String(item.id);
    const title = item.title || item.grid_title || item.closeup_unified_description || '';
    const domain = item.domain || (item.link ? new URL(item.link).hostname : '') || '';
    const destinationUrl = item.link || '';
    const imageUrl = item.images?.['736x']?.url || item.images?.orig?.url || null;
    const saves = Number(item.repin_count || item.save_count || 0);

    if (!topPin) {
      topPin = { pinId, title, imageUrl };
    }

    // Check yesterday's snapshot to compute daily velocity
    const [yesterday] = await sql`
      SELECT save_count
      FROM keyword_pins_snapshots
      WHERE keyword_id = ${keywordId}
        AND pin_id = ${pinId}
        AND snapshot_date = CURRENT_DATE - INTERVAL '1 day';
    `;

    const velocity = yesterday ? Math.max(0, saves - Number(yesterday.save_count || 0)) : 0;

    await sql`
      INSERT INTO keyword_pins_snapshots (
        keyword_id,
        pin_id,
        rank_position,
        title,
        domain,
        destination_url,
        image_url,
        save_count,
        daily_save_velocity,
        snapshot_date,
        created_at
      ) VALUES (
        ${keywordId},
        ${pinId},
        ${rank},
        ${title},
        ${domain},
        ${destinationUrl},
        ${imageUrl},
        ${saves},
        ${velocity},
        CURRENT_DATE,
        NOW()
      )
      ON CONFLICT (keyword_id, pin_id, snapshot_date) DO UPDATE SET
        rank_position = EXCLUDED.rank_position,
        save_count = EXCLUDED.save_count,
        daily_save_velocity = EXCLUDED.daily_save_velocity;
    `;

    rank++;
  }

  // Update keyword metadata with top pin & last crawled timestamp
  if (topPin) {
    await sql`
      UPDATE tracked_keywords SET
        top_pin_id = ${topPin.pinId},
        top_pin_title = ${topPin.title},
        top_pin_image = ${topPin.imageUrl},
        last_crawled_at = NOW(),
        updated_at = NOW()
      WHERE id = ${keywordId};
    `;
  }

  return { crawled_pins: rank - 1, top_pin: topPin };
}

/**
 * Retrieve pins for a specific keyword ordered by daily velocity or rank
 */
export async function getKeywordPins(sql, keywordId) {
  return await sql`
    SELECT *
    FROM keyword_pins_snapshots
    WHERE keyword_id = ${keywordId}
      AND snapshot_date = CURRENT_DATE
    ORDER BY rank_position ASC;
  `;
}
