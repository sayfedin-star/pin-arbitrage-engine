/**
 * Keyword Folders & Algorithmic Crossover Engine Service
 *
 * Provides:
 * 1. Campaign / Project Folder CRUD & keyword association.
 * 2. Multi-Dimensional Crossover Analysis:
 *    - Multi-ranking "Super-Pins" overlap (pins ranking across >=2 folder keywords)
 *    - Universal Visual Tag Bridges (CV annotations shared across keywords with frequency & %)
 *    - Shared Guided Pivots & Semantic Search Capsules (long-tail modifiers connecting keywords)
 *    - Whale Creators & Domain Authority Overlap (monopoly index across folder SERPs)
 *    - Composite 52-Week Seasonality Wave & Peak Month Launch Calendar
 *    - 1-Click Topic Cluster Blueprint & Content Generator (Pillar + Spoke pins with exportable CSV)
 *
 * Hardened with Neon Serverless Postgres (@neondatabase/serverless).
 */

import { fetchPinterestTrends } from './trends-service.mjs';

/**
 * List all folders with item counts and keyword previews
 */
export async function listFolders(sql, { projectId = 'default' } = {}) {
  const rows = await sql`
    SELECT 
      f.id,
      f.name,
      f.description,
      f.color,
      f.icon,
      f.project_id,
      f.metadata,
      f.created_at,
      f.updated_at,
      COUNT(i.id)::int as keyword_count,
      COALESCE(
        json_agg(
          json_build_object('id', tk.id, 'keyword', tk.keyword)
        ) FILTER (WHERE tk.id IS NOT NULL),
        '[]'::json
      ) as keywords_preview
    FROM keyword_folders f
    LEFT JOIN keyword_folder_items i ON i.folder_id = f.id
    LEFT JOIN tracked_keywords tk ON tk.id = i.keyword_id
    WHERE f.project_id = ${projectId}
    GROUP BY f.id
    ORDER BY f.updated_at DESC, f.created_at DESC;
  `;
  return rows;
}

/**
 * Get single folder with all tracked keyword details
 */
export async function getFolder(sql, folderId) {
  const fid = Number(folderId);
  if (!fid) return null;

  const [folder] = await sql`
    SELECT *
    FROM keyword_folders
    WHERE id = ${fid}
    LIMIT 1;
  `;

  if (!folder) return null;

  const items = await sql`
    SELECT 
      i.id as folder_item_id,
      i.folder_id,
      i.keyword_id,
      i.notes,
      i.added_at,
      tk.keyword,
      tk.category,
      tk.target_pin_count,
      tk.avg_daily_velocity,
      tk.top_pin_id,
      tk.top_pin_title,
      tk.top_pin_image,
      tk.last_crawled_at,
      tk.is_active,
      (
        SELECT COUNT(DISTINCT pin_id)::int 
        FROM keyword_pins_snapshots 
        WHERE keyword_id = tk.id
      ) as pin_count
    FROM keyword_folder_items i
    JOIN tracked_keywords tk ON tk.id = i.keyword_id
    WHERE i.folder_id = ${fid}
    ORDER BY i.added_at DESC;
  `;

  return {
    ...folder,
    items
  };
}

/**
 * Create a new folder
 */
export async function createFolder(sql, { 
  name, 
  description = '', 
  color = '#ec4899', 
  icon = 'folder', 
  projectId = 'default', 
  metadata = {} 
}) {
  const cleanName = String(name || '').trim();
  if (!cleanName) {
    throw new Error('Folder name is required.');
  }

  const [created] = await sql`
    INSERT INTO keyword_folders (
      name,
      description,
      color,
      icon,
      project_id,
      metadata,
      created_at,
      updated_at
    ) VALUES (
      ${cleanName},
      ${String(description || '').trim()},
      ${String(color || '#ec4899').trim()},
      ${String(icon || 'folder').trim()},
      ${String(projectId || 'default').trim()},
      ${JSON.stringify(metadata || {})},
      NOW(),
      NOW()
    )
    RETURNING *;
  `;

  return created;
}

/**
 * Update folder properties
 */
export async function updateFolder(sql, folderId, { 
  name, 
  description, 
  color, 
  icon, 
  metadata 
}) {
  const fid = Number(folderId);
  if (!fid) throw new Error('Invalid folder ID');

  const updates = [];
  if (name !== undefined) {
    const cleanName = String(name).trim();
    if (!cleanName) throw new Error('Folder name cannot be empty');
    updates.push(sql`name = ${cleanName}`);
  }
  if (description !== undefined) {
    updates.push(sql`description = ${String(description).trim()}`);
  }
  if (color !== undefined) {
    updates.push(sql`color = ${String(color).trim()}`);
  }
  if (icon !== undefined) {
    updates.push(sql`icon = ${String(icon).trim()}`);
  }
  if (metadata !== undefined) {
    updates.push(sql`metadata = ${JSON.stringify(metadata)}`);
  }

  updates.push(sql`updated_at = NOW()`);

  const [updated] = await sql`
    UPDATE keyword_folders
    SET ${sql(updates, ...updates.map(() => ''))}
    WHERE id = ${fid}
    RETURNING *;
  `;

  return updated;
}

/**
 * Delete folder and cascaded items
 */
export async function deleteFolder(sql, folderId) {
  const fid = Number(folderId);
  if (!fid) throw new Error('Invalid folder ID');

  const [deleted] = await sql`
    DELETE FROM keyword_folders
    WHERE id = ${fid}
    RETURNING id, name;
  `;

  return deleted;
}

/**
 * Add keyword to folder
 */
export async function addKeywordToFolder(sql, folderId, keywordId, notes = '') {
  const fid = Number(folderId);
  const kid = Number(keywordId);
  if (!fid || !kid) throw new Error('Invalid folderId or keywordId');

  const [item] = await sql`
    INSERT INTO keyword_folder_items (
      folder_id,
      keyword_id,
      notes,
      added_at
    ) VALUES (
      ${fid},
      ${kid},
      ${String(notes || '').trim()},
      NOW()
    )
    ON CONFLICT (folder_id, keyword_id) DO UPDATE SET
      notes = EXCLUDED.notes
    RETURNING *;
  `;

  await sql`
    UPDATE keyword_folders 
    SET updated_at = NOW() 
    WHERE id = ${fid};
  `;

  return item;
}

/**
 * Batch add keywords to folder
 */
export async function batchAddKeywordsToFolder(sql, folderId, keywordIds = []) {
  const fid = Number(folderId);
  if (!fid) throw new Error('Invalid folder ID');
  const validKids = (keywordIds || []).map(Number).filter(Boolean);
  if (!validKids.length) return { added: 0 };

  let added = 0;
  for (const kid of validKids) {
    await sql`
      INSERT INTO keyword_folder_items (
        folder_id,
        keyword_id,
        added_at
      ) VALUES (
        ${fid},
        ${kid},
        NOW()
      )
      ON CONFLICT (folder_id, keyword_id) DO NOTHING;
    `;
    added++;
  }

  await sql`
    UPDATE keyword_folders 
    SET updated_at = NOW() 
    WHERE id = ${fid};
  `;

  return { added };
}

/**
 * Remove keyword from folder
 */
export async function removeKeywordFromFolder(sql, folderId, keywordId) {
  const fid = Number(folderId);
  const kid = Number(keywordId);
  if (!fid || !kid) throw new Error('Invalid folderId or keywordId');

  const [deleted] = await sql`
    DELETE FROM keyword_folder_items
    WHERE folder_id = ${fid} AND keyword_id = ${kid}
    RETURNING id;
  `;

  await sql`
    UPDATE keyword_folders 
    SET updated_at = NOW() 
    WHERE id = ${fid};
  `;

  return deleted;
}

/**
 * Get folder membership for a keyword (which folders contain this keyword)
 */
export async function getFoldersForKeyword(sql, keywordId) {
  const kid = Number(keywordId);
  if (!kid) return [];

  const rows = await sql`
    SELECT 
      f.id,
      f.name,
      f.color,
      f.icon,
      i.added_at
    FROM keyword_folder_items i
    JOIN keyword_folders f ON f.id = i.folder_id
    WHERE i.keyword_id = ${kid}
    ORDER BY f.name ASC;
  `;

  return rows;
}

/**
 * Helper to extract title entities / stopword-filtered n-grams
 */
function extractTitleKeywords(title = '') {
  if (!title) return [];
  const stopwords = new Set([
    'the', 'a', 'an', 'and', 'or', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
    'recipe', 'recipes', 'how', 'make', 'best', 'easy', 'quick', 'delicious', 'simple',
    'homemade', 'top', 'ideas', 'pin', 'pins', 'this', 'that', 'from', 'your', 'my', 'untitled'
  ]);
  
  const tokens = String(title)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2 && !stopwords.has(t));

  return [...new Set(tokens)];
}

/**
 * Deep Algorithmic Crossover Matrix Engine
 * Calculates multi-dimensional overlaps across all keywords in a folder:
 * 1. Multi-Ranking Super-Pins (pins occupying rank positions in >= 2 keywords)
 * 2. Universal Tag Bridges (CV annotations & tags shared across multiple keywords)
 * 3. Shared Guided Pivots (Search capsules that act as semantic connectors)
 * 4. Creator & Domain Monopoly Index (who owns authority across this niche)
 * 5. Composite 52-Week Seasonality Wave & Optimal Launch Calendar
 * 6. Algorithmic Topic Cluster Blueprint & CSV Content Plan
 */
export async function calculateFolderCrossover(sql, folderId) {
  const fid = Number(folderId);
  if (!fid) throw new Error('Invalid folder ID');

  // 1. Fetch Folder & Member Keywords
  const [folder] = await sql`
    SELECT * FROM keyword_folders WHERE id = ${fid} LIMIT 1;
  `;
  if (!folder) throw new Error('Folder not found');

  const folderKeywords = await sql`
    SELECT 
      tk.id,
      tk.keyword,
      tk.category,
      tk.target_pin_count,
      tk.avg_daily_velocity,
      tk.top_pin_id,
      tk.top_pin_title,
      tk.top_pin_image,
      tk.last_crawled_at,
      tk.metadata
    FROM keyword_folder_items i
    JOIN tracked_keywords tk ON tk.id = i.keyword_id
    WHERE i.folder_id = ${fid}
    ORDER BY tk.avg_daily_velocity DESC, tk.keyword ASC;
  `;

  const totalKeywords = folderKeywords.length;
  const keywordIds = folderKeywords.map(k => k.id);

  if (totalKeywords === 0) {
    return {
      folder,
      summary: {
        total_keywords: 0,
        total_unique_pins: 0,
        super_pins_count: 0,
        universal_tags_count: 0,
        shared_pivots_count: 0,
        monopoly_domain_count: 0
      },
      super_pins: [],
      tag_bridges: [],
      guided_pivots: [],
      domain_monopoly: [],
      creator_monopoly: [],
      seasonality: {
        composite_wave: [],
        peak_months: [],
        recommended_launch_window: 'Add keywords to see launch window'
      },
      topic_cluster_blueprint: null
    };
  }

  // 2. Query Latest Pin Snapshots for all folder keywords
  // Distinct per (keyword_id, pin_id) using the latest snapshot_date
  const pinRows = await sql`
    WITH ranked_snaps AS (
      SELECT 
        s.id,
        s.keyword_id,
        s.pin_id,
        s.rank_position,
        s.title,
        s.domain,
        s.destination_url,
        s.image_url,
        s.save_count,
        s.repin_count,
        s.comment_count,
        s.daily_save_velocity,
        s.snapshot_date,
        s.metadata,
        tk.keyword as keyword_text,
        ROW_NUMBER() OVER(
          PARTITION BY s.keyword_id, s.pin_id 
          ORDER BY s.snapshot_date DESC, s.id DESC
        ) as rn
      FROM keyword_pins_snapshots s
      JOIN tracked_keywords tk ON tk.id = s.keyword_id
      WHERE s.keyword_id = ANY(${keywordIds})
    )
    SELECT *
    FROM ranked_snaps
    WHERE rn = 1
    ORDER BY save_count DESC, daily_save_velocity DESC;
  `;

  // 3. Query Guided Search Capsules for all folder keywords
  const capsuleRows = await sql`
    SELECT 
      c.id,
      c.keyword_id,
      c.term,
      c.display_label,
      c.score,
      c.dominant_color,
      c.display_order,
      tk.keyword as keyword_text
    FROM keyword_guided_capsules c
    JOIN tracked_keywords tk ON tk.id = c.keyword_id
    WHERE c.keyword_id = ANY(${keywordIds})
    ORDER BY c.score DESC, c.display_order ASC;
  `;

  // =========================================================================
  // DIMENSION A: MULTI-RANKING SUPER-PINS OVERLAP
  // =========================================================================
  const pinMap = new Map(); // pin_id -> { pin data, keywords: [] }
  for (const row of pinRows) {
    const pid = String(row.pin_id).trim();
    if (!pid) continue;

    if (!pinMap.has(pid)) {
      const meta = typeof row.metadata === 'object' && row.metadata !== null ? row.metadata : {};
      const pinner = meta.pinner || {};
      pinMap.set(pid, {
        pin_id: pid,
        title: row.title || meta.title || `Pin #${pid}`,
        image_url: row.image_url || meta.image_url || '',
        domain: row.domain || meta.domain || '',
        destination_url: row.destination_url || meta.destination_url || '',
        save_count: Number(row.save_count || meta.raw_saves || 0),
        repin_count: Number(row.repin_count || 0),
        comment_count: Number(row.comment_count || 0),
        daily_save_velocity: Number(row.daily_save_velocity || 0),
        creator_username: pinner.username || '',
        creator_name: pinner.full_name || '',
        aspect_ratio: meta.aspect_ratio || '2:3',
        format: meta.format || 'ORGANIC PIN',
        visual_annotations: Array.isArray(meta.visual_annotations) ? meta.visual_annotations : [],
        rankings: []
      });
    }

    const pinRecord = pinMap.get(pid);
    pinRecord.rankings.push({
      keyword_id: row.keyword_id,
      keyword: row.keyword_text,
      rank_position: row.rank_position,
      daily_save_velocity: row.daily_save_velocity,
      snapshot_date: row.snapshot_date
    });
  }

  const allPins = Array.from(pinMap.values());
  for (const p of allPins) {
    p.overlap_count = p.rankings.length;
    p.overlap_percentage = Math.round((p.overlap_count / totalKeywords) * 100);
    p.is_super_pin = p.overlap_count >= 2;
    p.min_rank = Math.min(...p.rankings.map(r => r.rank_position));
    p.avg_rank = Number((p.rankings.reduce((sum, r) => sum + r.rank_position, 0) / p.rankings.length).toFixed(1));
    // Sort rankings by rank position ASC
    p.rankings.sort((a, b) => a.rank_position - b.rank_position);
  }

  // Super Pins: multi-ranking first, sorted by overlap_count DESC, save_count DESC
  const superPins = allPins
    .filter(p => p.overlap_count >= (totalKeywords > 1 ? 2 : 1))
    .sort((a, b) => {
      if (b.overlap_count !== a.overlap_count) {
        return b.overlap_count - a.overlap_count;
      }
      return b.save_count - a.save_count;
    });

  // Top overall pins if no super pins or total keywords is 1
  const topRankedPins = allPins
    .sort((a, b) => b.save_count - a.save_count)
    .slice(0, 30);

  // =========================================================================
  // DIMENSION B: UNIVERSAL TAG BRIDGES (CV & Semantic Annotations Overlap)
  // =========================================================================
  const tagMap = new Map(); // cleanTag -> { tag, keywords: Set, count: int, saves: int, sample_pins: [] }

  for (const pin of allPins) {
    const rawTags = new Set();
    // 1. From visual annotations
    for (const va of pin.visual_annotations) {
      if (typeof va === 'string' && va.trim().length > 1) {
        rawTags.add(va.trim().toLowerCase());
      }
    }
    // 2. From title entities
    const titleTokens = extractTitleKeywords(pin.title);
    for (const tt of titleTokens) {
      rawTags.add(tt);
    }

    const pinKeywords = pin.rankings.map(r => r.keyword);

    for (const t of rawTags) {
      if (!t || t.length < 3) continue;
      if (!tagMap.has(t)) {
        tagMap.set(t, {
          tag: t,
          keywords_set: new Set(),
          pin_count: 0,
          total_saves: 0,
          sample_pins: []
        });
      }
      const record = tagMap.get(t);
      record.pin_count++;
      record.total_saves += pin.save_count;
      for (const kw of pinKeywords) {
        record.keywords_set.add(kw);
      }
      if (record.sample_pins.length < 3) {
        record.sample_pins.push({
          pin_id: pin.pin_id,
          title: pin.title,
          image_url: pin.image_url,
          save_count: pin.save_count
        });
      }
    }
  }

  const tagBridges = Array.from(tagMap.values()).map(t => {
    const kwCount = t.keywords_set.size;
    const overlapPct = Math.round((kwCount / totalKeywords) * 100);
    return {
      tag: t.tag,
      keywords: Array.from(t.keywords_set),
      keyword_overlap_count: kwCount,
      overlap_percentage: overlapPct,
      pin_count: t.pin_count,
      total_saves: t.total_saves,
      is_universal: overlapPct >= 50,
      bridge_tier: overlapPct >= 80 ? 'Master Bridge (80%+)' : overlapPct >= 50 ? 'Strong Bridge (50%+)' : 'Secondary Bridge',
      sample_pins: t.sample_pins
    };
  })
  .sort((a, b) => {
    if (b.keyword_overlap_count !== a.keyword_overlap_count) {
      return b.keyword_overlap_count - a.keyword_overlap_count;
    }
    if (b.pin_count !== a.pin_count) {
      return b.pin_count - a.pin_count;
    }
    return b.total_saves - a.total_saves;
  })
  .slice(0, 50);

  // =========================================================================
  // DIMENSION C: SHARED GUIDED SEARCH CAPSULES & SEMANTIC PIVOTS
  // =========================================================================
  const pivotMap = new Map(); // cleanTerm -> { term, display_label, keywords: Set, total_score: float, dominant_color }
  for (const c of capsuleRows) {
    const rawTerm = (c.term || c.display_label || '').trim().toLowerCase();
    if (!rawTerm) continue;

    if (!pivotMap.has(rawTerm)) {
      pivotMap.set(rawTerm, {
        term: rawTerm,
        display_label: c.display_label || c.term,
        keywords_map: new Map(),
        dominant_color: c.dominant_color || '#3b82f6',
        total_score: 0
      });
    }

    const rec = pivotMap.get(rawTerm);
    rec.total_score += Number(c.score || 0);
    if (!rec.keywords_map.has(c.keyword_text)) {
      rec.keywords_map.set(c.keyword_text, {
        keyword: c.keyword_text,
        display_order: c.display_order,
        score: c.score
      });
    }
  }

  const guidedPivots = Array.from(pivotMap.values()).map(p => {
    const kwList = Array.from(p.keywords_map.values());
    const count = kwList.length;
    const overlapPct = Math.round((count / totalKeywords) * 100);
    return {
      term: p.term,
      display_label: p.display_label,
      shared_keywords: kwList,
      shared_count: count,
      overlap_percentage: overlapPct,
      composite_score: Number(p.total_score.toFixed(4)),
      dominant_color: p.dominant_color,
      is_connector: count >= 2
    };
  })
  .sort((a, b) => {
    if (b.shared_count !== a.shared_count) {
      return b.shared_count - a.shared_count;
    }
    return b.composite_score - a.composite_score;
  })
  .slice(0, 40);

  // =========================================================================
  // DIMENSION D: DOMAIN & CREATOR MONOPOLY OVERLAP
  // =========================================================================
  const domainMap = new Map();
  const creatorMap = new Map();

  for (const pin of allPins) {
    // 1. Domain
    const dom = (pin.domain || '').trim().toLowerCase();
    if (dom && !dom.includes('pinterest.com')) {
      if (!domainMap.has(dom)) {
        domainMap.set(dom, {
          domain: dom,
          keywords_set: new Set(),
          pin_count: 0,
          total_saves: 0,
          top_pins: []
        });
      }
      const dRec = domainMap.get(dom);
      dRec.pin_count++;
      dRec.total_saves += pin.save_count;
      for (const r of pin.rankings) dRec.keywords_set.add(r.keyword);
      if (dRec.top_pins.length < 2) {
        dRec.top_pins.push({ pin_id: pin.pin_id, title: pin.title, image_url: pin.image_url, save_count: pin.save_count });
      }
    }

    // 2. Creator
    const cUser = (pin.creator_username || '').trim().toLowerCase();
    if (cUser) {
      if (!creatorMap.has(cUser)) {
        creatorMap.set(cUser, {
          username: cUser,
          display_name: pin.creator_name || cUser,
          keywords_set: new Set(),
          pin_count: 0,
          total_saves: 0,
          top_pins: []
        });
      }
      const cRec = creatorMap.get(cUser);
      cRec.pin_count++;
      cRec.total_saves += pin.save_count;
      for (const r of pin.rankings) cRec.keywords_set.add(r.keyword);
      if (cRec.top_pins.length < 2) {
        cRec.top_pins.push({ pin_id: pin.pin_id, title: pin.title, image_url: pin.image_url, save_count: pin.save_count });
      }
    }
  }

  const domainMonopoly = Array.from(domainMap.values()).map(d => ({
    domain: d.domain,
    keywords_covered: Array.from(d.keywords_set),
    keywords_count: d.keywords_set.size,
    overlap_percentage: Math.round((d.keywords_set.size / totalKeywords) * 100),
    pin_count: d.pin_count,
    total_saves: d.total_saves,
    top_pins: d.top_pins
  }))
  .sort((a, b) => {
    if (b.keywords_count !== a.keywords_count) return b.keywords_count - a.keywords_count;
    return b.pin_count - a.pin_count;
  })
  .slice(0, 20);

  const creatorMonopoly = Array.from(creatorMap.values()).map(c => ({
    username: c.username,
    display_name: c.display_name,
    keywords_covered: Array.from(c.keywords_set),
    keywords_count: c.keywords_set.size,
    overlap_percentage: Math.round((c.keywords_set.size / totalKeywords) * 100),
    pin_count: c.pin_count,
    total_saves: c.total_saves,
    top_pins: c.top_pins
  }))
  .sort((a, b) => {
    if (b.keywords_count !== a.keywords_count) return b.keywords_count - a.keywords_count;
    return b.pin_count - a.pin_count;
  })
  .slice(0, 20);

  // =========================================================================
  // DIMENSION E: COMPOSITE 52-WEEK SEASONALITY WAVE & OPTIMAL LAUNCH CALENDAR
  // =========================================================================
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthScores = new Array(12).fill(0);
  const compositeWeeklyWave = new Array(52).fill(0);
  let trendsLoaded = 0;

  // Attempt to fetch trends for each keyword
  for (const kw of folderKeywords) {
    try {
      const trendData = await fetchPinterestTrends(kw.keyword);
      if (trendData && trendData.success && Array.isArray(trendData.timeline) && trendData.timeline.length > 0) {
        trendsLoaded++;
        const tLen = trendData.timeline.length;
        trendData.timeline.forEach((pt, idx) => {
          const val = Number(pt.value || pt.normalized_interest || 0);
          const weekIdx = Math.min(51, Math.floor((idx / tLen) * 52));
          compositeWeeklyWave[weekIdx] += val;

          // Estimate month
          const monthIdx = Math.min(11, Math.floor((weekIdx / 52) * 12));
          monthScores[monthIdx] += val;
        });
      }
    } catch (_) {
      // Trends network fallback
    }
  }

  // Normalize composite wave to 0-100 scale
  const maxWeekly = Math.max(...compositeWeeklyWave, 1);
  const normalizedWeeklyWave = compositeWeeklyWave.map((v, i) => ({
    week: i + 1,
    score: Math.round((v / maxWeekly) * 100)
  }));

  // Identify peak months
  const maxMonthVal = Math.max(...monthScores, 1);
  const peakMonthIndices = monthScores
    .map((val, idx) => ({ month: months[idx], idx, score: Math.round((val / maxMonthVal) * 100) }))
    .filter(m => m.score >= 70)
    .sort((a, b) => b.score - a.score);

  const peakMonths = peakMonthIndices.map(m => m.month);
  
  // Calculate recommended launch window (45-60 days / ~2 months prior to highest peak)
  let recommendedLaunchWindow = 'Year-Round Evergreen';
  if (peakMonthIndices.length > 0) {
    const highestPeakIdx = peakMonthIndices[0].idx;
    const launchMonthIdx = (highestPeakIdx - 2 + 12) % 12;
    recommendedLaunchWindow = `${months[launchMonthIdx]} (Deploy pins 45-60 days before ${months[highestPeakIdx]} peak)`;
  }

  // =========================================================================
  // DIMENSION F: 1-CLICK TOPIC CLUSTER BLUEPRINT & CONTENT GENERATOR
  // =========================================================================
  const topTagNames = tagBridges.slice(0, 12).map(t => t.tag);
  const topPivotTerms = guidedPivots.slice(0, 8).map(p => p.display_label || p.term);

  // Synthesize Pillar title and concept
  const primaryKw = folderKeywords[0]?.keyword || 'Topic Cluster';
  const secondaryKw = folderKeywords[1]?.keyword || '';
  const pillarTitle = secondaryKw 
    ? `The Ultimate ${primaryKw.toUpperCase()} & ${secondaryKw.toUpperCase()} Guide`
    : `The Ultimate ${primaryKw.toUpperCase()} Master Blueprint`;

  // Synthesize 5 actionable spoke pins
  const spokeAngles = [];
  const modifiers = topPivotTerms.length > 0 ? topPivotTerms : ['Easy', 'Quick', 'Best', 'Healthy', 'Budget'];

  for (let i = 0; i < Math.min(5, Math.max(modifiers.length, 5)); i++) {
    const mod = modifiers[i] || `Angle ${i+1}`;
    const targetKw = folderKeywords[i % folderKeywords.length]?.keyword || primaryKw;
    const relevantTag = topTagNames[i] || 'ideas';

    spokeAngles.push({
      angle_number: i + 1,
      angle_title: `${mod} ${targetKw.charAt(0).toUpperCase() + targetKw.slice(1)}: Step-by-Step`,
      target_keyword: targetKw,
      modifier: mod,
      hook_concept: `Focus on visual clarity with ${relevantTag} close-up and bold overlay text.`,
      recommended_format: i === 0 ? 'VIDEO PIN' : (i % 2 === 0 ? 'PRODUCT CARD / CAROUSEL' : 'ORGANIC PIN (2:3 Standard)'),
      recommended_aspect_ratio: i === 0 ? '9:16 Story' : '2:3 Standard',
      target_tags: topTagNames.slice(i * 2, i * 2 + 4).join(', ')
    });
  }

  // Format CSV Export Rows
  const csvRows = spokeAngles.map((spoke, idx) => ({
    "Pin Slot": `Spoke #${idx + 1}`,
    "Working Title": spoke.angle_title,
    "Target Keyword": spoke.target_keyword,
    "Modifier Pivot": spoke.modifier,
    "Recommended Format": spoke.recommended_format,
    "Aspect Ratio": spoke.recommended_aspect_ratio,
    "Recommended Launch": recommendedLaunchWindow,
    "SEO Tags": spoke.target_tags,
    "Universal Folder Tags": topTagNames.join(' | ')
  }));

  const topicClusterBlueprint = {
    folder_name: folder.name,
    pillar_concept: pillarTitle,
    target_keywords: folderKeywords.map(k => k.keyword),
    universal_tag_blueprint: topTagNames.join(', '),
    top_connectors: topPivotTerms,
    spoke_angles: spokeAngles,
    csv_rows: csvRows
  };

  return {
    folder,
    summary: {
      total_keywords: totalKeywords,
      total_unique_pins: allPins.length,
      super_pins_count: superPins.length,
      universal_tags_count: tagBridges.filter(t => t.is_universal).length,
      shared_pivots_count: guidedPivots.filter(p => p.is_connector).length,
      monopoly_domain_count: domainMonopoly.length,
      monopoly_creator_count: creatorMonopoly.length
    },
    super_pins: superPins.length > 0 ? superPins : topRankedPins,
    has_super_pins: superPins.length > 0,
    tag_bridges: tagBridges,
    guided_pivots: guidedPivots,
    domain_monopoly: domainMonopoly,
    creator_monopoly: creatorMonopoly,
    seasonality: {
      composite_wave: normalizedWeeklyWave,
      peak_months: peakMonths.length > 0 ? peakMonths : ['Year-round'],
      recommended_launch_window: recommendedLaunchWindow,
      trends_loaded_count: trendsLoaded
    },
    topic_cluster_blueprint: topicClusterBlueprint
  };
}
