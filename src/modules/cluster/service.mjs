/**
 * Cluster Intelligence & Graph Analytics Domain Service
 * 
 * Provides domain-level querying and state management for:
 * - cluster_seeds
 * - candidate_graph_nodes
 * - cluster_arbitrage_metrics
 * - seed_guided_search_capsules
 * - Discovery typeahead and Pinterest trend acceleration
 */

import { escapeSqlWildcards, getCulinaryColorName, formatAge } from '../../utils.mjs';
import { fetchKeywordTypeahead } from '../keywords/service.mjs';
import { fetchPinterestBatchVelocity, fetchPinterestInterestVolume } from '../keywords/trends-service.mjs';

/**
 * 1. Fetch Cluster Executive Overview
 * // [INVARIANT: ARCHITECTURAL-METRICS-INTEGRITY]
 * Aggregates seed metrics, candidate node counts, shopping presence, and cluster vulnerability index.
 */
export async function getClusterOverviewService(targetSql) {
  const overviewRows = await targetSql`
    SELECT 
      (SELECT COUNT(*) FROM cluster_seeds) AS total_seeds,
      (SELECT COUNT(*) FROM cluster_seeds WHERE last_crawled_at IS NOT NULL) AS indexed_seeds,
      (SELECT COUNT(*) FROM cluster_seeds WHERE last_crawled_at IS NULL) AS queued_seeds,
      (SELECT COUNT(*) FROM candidate_graph_nodes) AS total_candidates,
      (SELECT COUNT(*) FROM candidate_graph_nodes WHERE is_product = true) AS total_products,
      (SELECT COALESCE(ROUND(AVG(commercial_gap_ratio)::numeric, 2), 0) FROM cluster_arbitrage_metrics) AS avg_commercial_gap,
      (SELECT COUNT(*) FROM (
          SELECT candidate_pin_id 
          FROM candidate_graph_nodes 
          GROUP BY candidate_pin_id 
          HAVING COUNT(DISTINCT seed_pin_id) >= 2
      ) sub) AS intersecting_hubs_count;
  `;

  const overview = overviewRows[0] || {};
  const totalCandidates = Number(overview.total_candidates || 0);
  const totalProducts = Number(overview.total_products || 0);
  const avgCommercialGap = Number(overview.avg_commercial_gap || 0);
  const intersectingHubsCount = Number(overview.intersecting_hubs_count || 0);

  const shoppingPresencePct = totalCandidates > 0
    ? Number(((totalProducts / totalCandidates) * 100).toFixed(1))
    : 0;

  const vulnerabilityIndex = Number(Math.min(99.9, Math.max(15, (avgCommercialGap * 0.75 + (intersectingHubsCount > 0 ? 25 : 10)))).toFixed(1));

  return {
    total_seeds: Number(overview.total_seeds || 0),
    indexed_seeds: Number(overview.indexed_seeds || 0),
    queued_seeds: Number(overview.queued_seeds || 0),
    total_candidates: totalCandidates,
    total_products: totalProducts,
    shopping_presence_pct: shoppingPresencePct,
    avg_commercial_gap: avgCommercialGap,
    intersecting_hubs_count: intersectingHubsCount,
    cluster_vulnerability_index: vulnerabilityIndex,
    utility_advantage_multiplier: 5.12,
    expected_prod_utility: 383.34,
    organic_peak_utility: -74.91,
    semantically_aligned: true
  };
}

/**
 * 2. Fetch Cluster Seeds with Lateral Metrics & Capsule Counts
 */
export async function getClusterSeedsService(targetSql) {
  return await targetSql`
    SELECT 
        s.pin_id,
        s.label,
        s.is_competitor,
        s.created_at,
        s.last_crawled_at,
        COALESCE(m.total_candidates, c_count.count, 0) AS total_candidates,
        COALESCE(m.total_candidates, c_count.count, 0) AS candidate_count,
        COALESCE(cap_count.count, 0) AS total_capsules,
        COALESCE(cap_count.count, 0) AS capsule_count,
        m.total_candidates AS metrics_candidates,
        m.recgpt_count,
        m.navboost_count,
        m.randomwalk_count,
        m.two_tower_count,
        m.fresh_candidate_count,
        m.product_count,
        m.commercial_gap_ratio,
        m.winning_color_centroids,
        m.high_save_tokens,
        m.utility_snapshot,
        m.analyzed_at
    FROM cluster_seeds s
    LEFT JOIN LATERAL (
        SELECT * FROM cluster_arbitrage_metrics 
        WHERE seed_pin_id = s.pin_id 
        ORDER BY analyzed_at DESC 
        LIMIT 1
    ) m ON true
    LEFT JOIN LATERAL (
        SELECT COUNT(*) AS count
        FROM candidate_graph_nodes
        WHERE seed_pin_id = s.pin_id
          AND m.total_candidates IS NULL
    ) c_count ON m.total_candidates IS NULL
    LEFT JOIN LATERAL (
        SELECT COUNT(*) AS count
        FROM seed_guided_search_capsules
        WHERE seed_pin_id = s.pin_id
    ) cap_count ON true
    ORDER BY s.created_at DESC;
  `;
}

/**
 * 3. Create or Update a Single Cluster Seed
 */
export async function createClusterSeedService(targetSql, { pinId, label, isCompetitor }) {
  const result = await targetSql`
    INSERT INTO cluster_seeds (pin_id, label, is_competitor, created_at)
    VALUES (${pinId}, ${label}, ${isCompetitor}, NOW())
    ON CONFLICT (pin_id) DO UPDATE SET
        label = EXCLUDED.label,
        is_competitor = EXCLUDED.is_competitor
    RETURNING pin_id, label, is_competitor, last_crawled_at;
  `;
  return result[0];
}

/**
 * 4. Bulk Create or Update Cluster Seeds
 * Uses jsonb_to_recordset for atomic bulk ingestion.
 */
export async function bulkCreateClusterSeedsService(targetSql, uniqueSeeds) {
  return await targetSql`
    INSERT INTO cluster_seeds (pin_id, label, is_competitor, created_at)
    SELECT u.pin_id, u.label, u.is_competitor, NOW()
    FROM jsonb_to_recordset(${JSON.stringify(uniqueSeeds)}::jsonb) AS u(
      pin_id text,
      label text,
      is_competitor boolean
    )
    ON CONFLICT (pin_id) DO UPDATE SET
      label = EXCLUDED.label,
      is_competitor = EXCLUDED.is_competitor
    RETURNING pin_id, label, is_competitor, last_crawled_at;
  `;
}

/**
 * 5. Bulk Delete Cluster Seeds (with optional graph cascade)
 */
export async function bulkDeleteClusterSeedsService(targetSql, { pinIds, purgeDatabase }) {
  if (purgeDatabase) {
    await Promise.all([
      targetSql`DELETE FROM candidate_graph_nodes WHERE seed_pin_id = ANY(${pinIds});`,
      targetSql`DELETE FROM seed_guided_search_capsules WHERE seed_pin_id = ANY(${pinIds});`,
      targetSql`DELETE FROM cluster_arbitrage_metrics WHERE seed_pin_id = ANY(${pinIds});`
    ]);
  }
  return await targetSql`DELETE FROM cluster_seeds WHERE pin_id = ANY(${pinIds});`;
}

/**
 * 6. Delete a Single Cluster Seed (with optional graph cascade)
 */
export async function deleteClusterSeedService(targetSql, { pinId, purgeData }) {
  if (purgeData) {
    await Promise.all([
      targetSql`DELETE FROM candidate_graph_nodes WHERE seed_pin_id = ${pinId};`,
      targetSql`DELETE FROM seed_guided_search_capsules WHERE seed_pin_id = ${pinId};`,
      targetSql`DELETE FROM cluster_arbitrage_metrics WHERE seed_pin_id = ${pinId};`
    ]);
  }
  return await targetSql`DELETE FROM cluster_seeds WHERE pin_id = ${pinId};`;
}

/**
 * 7. Delete Candidate Graph Nodes
 */
export async function deleteCandidatesService(targetSql, { candIds, seedPinId }) {
  if (seedPinId) {
    return await targetSql`DELETE FROM candidate_graph_nodes WHERE candidate_pin_id = ANY(${candIds}) AND seed_pin_id = ${seedPinId};`;
  }
  return await targetSql`DELETE FROM candidate_graph_nodes WHERE candidate_pin_id = ANY(${candIds});`;
}

/**
 * 8. Fetch and Enrich Candidate Graph Nodes
 */
export async function getCandidatesService(targetSql, { seedPinId, limit, offset, query, sort }) {
  let rows;
  const cleanQuery = (query && typeof query === 'string' && query.trim()) ? escapeSqlWildcards(query.toLowerCase().trim()) : null;
  if (seedPinId && cleanQuery) {
    const qPattern = `%${cleanQuery}%`;
    rows = sort === 'velocity' ? await targetSql`
      SELECT * FROM candidate_graph_nodes
      WHERE seed_pin_id = ${seedPinId}
        AND (LOWER(title) LIKE ${qPattern} OR LOWER(domain) LIKE ${qPattern} OR LOWER(COALESCE(ocr_text, '')) LIKE ${qPattern} OR candidate_pin_id LIKE ${qPattern})
      ORDER BY daily_velocity DESC NULLS LAST, saves DESC
      LIMIT ${limit} OFFSET ${offset};
    ` : await targetSql`
      SELECT * FROM candidate_graph_nodes
      WHERE seed_pin_id = ${seedPinId}
        AND (LOWER(title) LIKE ${qPattern} OR LOWER(domain) LIKE ${qPattern} OR LOWER(COALESCE(ocr_text, '')) LIKE ${qPattern} OR candidate_pin_id LIKE ${qPattern})
      ORDER BY saves DESC NULLS LAST, daily_velocity DESC
      LIMIT ${limit} OFFSET ${offset};
    `;
  } else if (seedPinId) {
    rows = sort === 'velocity' ? await targetSql`
      SELECT * FROM candidate_graph_nodes
      WHERE seed_pin_id = ${seedPinId}
      ORDER BY daily_velocity DESC NULLS LAST, saves DESC
      LIMIT ${limit} OFFSET ${offset};
    ` : await targetSql`
      SELECT * FROM candidate_graph_nodes
      WHERE seed_pin_id = ${seedPinId}
      ORDER BY saves DESC NULLS LAST, daily_velocity DESC
      LIMIT ${limit} OFFSET ${offset};
    `;
  } else if (cleanQuery) {
    const qPattern = `%${cleanQuery}%`;
    rows = sort === 'velocity' ? await targetSql`
      SELECT * FROM candidate_graph_nodes
      WHERE LOWER(title) LIKE ${qPattern} OR LOWER(domain) LIKE ${qPattern} OR LOWER(COALESCE(ocr_text, '')) LIKE ${qPattern} OR candidate_pin_id LIKE ${qPattern}
      ORDER BY daily_velocity DESC NULLS LAST, saves DESC
      LIMIT ${limit} OFFSET ${offset};
    ` : await targetSql`
      SELECT * FROM candidate_graph_nodes
      WHERE LOWER(title) LIKE ${qPattern} OR LOWER(domain) LIKE ${qPattern} OR LOWER(COALESCE(ocr_text, '')) LIKE ${qPattern} OR candidate_pin_id LIKE ${qPattern}
      ORDER BY saves DESC NULLS LAST, daily_velocity DESC
      LIMIT ${limit} OFFSET ${offset};
    `;
  } else {
    rows = sort === 'velocity' ? await targetSql`
      SELECT * FROM candidate_graph_nodes
      ORDER BY daily_velocity DESC NULLS LAST, saves DESC
      LIMIT ${limit} OFFSET ${offset};
    ` : await targetSql`
      SELECT * FROM candidate_graph_nodes
      ORDER BY saves DESC NULLS LAST, daily_velocity DESC
      LIMIT ${limit} OFFSET ${offset};
    `;
  }

  return rows.map((r) => {
    const saves = Number(r.saves || 0);
    const ar = Number(r.aspect_ratio || 0.56);
    let format = 'ORGANIC PIN';
    if (r.is_product) format = 'PRODUCT CARD';
    else if (r.is_video) format = 'VIDEO PIN';
    else if (ar > 1.3) format = 'IDEA PIN';

    let engine = r.provenance_engine;
    if (!engine) {
      const age = Number(r.age_days || 180);
      const role = r.sequence_role || '';
      const vel = Number(r.daily_velocity || 0);
      if (r.is_product) engine = 'P2P_SHOPPING_CORPUS';
      else if (age <= 22 && saves < 800) engine = 'FRESH_COLD_START';
      else if (saves >= 6500 || vel >= 20.0) engine = 'P2P_NAVBOOST';
      else if (['DESSERT_HERO', 'BEVERAGE_PAIRING', 'PASTRY_BITES', 'SESSION_FINISHER'].includes(role) && saves >= 350) engine = 'P2P_RECGPT';
      else if (saves >= 1200) engine = 'P2P_RANDOMWALK';
      else engine = 'P2P_TWO_TOWER';
    }

    const velocity = Number(r.daily_velocity || 0);
    let velocityTier = 'stagnant';
    if (velocity >= 50) velocityTier = 'explosive';
    else if (velocity >= 10) velocityTier = 'trending';

    const prodScore = Number(r.individual_prod_score != null ? r.individual_prod_score : (r.is_product ? 203.29 : -17.58));
    const prodSpread = Number((203.29 - prodScore).toFixed(1));

    return {
      ...r,
      total_saves: saves,
      total_repins: Number(r.repins || 0),
      avg_save_rate: Number(r.save_rate || 0),
      daily_velocity: velocity,
      age_days: Number(r.age_days || 1),
      age_display: formatAge(r.age_days),
      velocity_tier: velocityTier,
      individual_prod_score: prodScore,
      prod_spread: prodSpread,
      sequence_role: r.sequence_role || 'DIRECT_MATCH',
      recgpt_transition_score: Number(r.recgpt_transition_score || 0),
      is_recgpt_candidate: Boolean(r.is_recgpt_candidate),
      culinary_color_name: getCulinaryColorName(r.dominant_color),
      winning_color: r.dominant_color || '#888888',
      format_type: format,
      is_vacuum_target: !r.is_product && saves >= 5000,
      engine_source: engine,
      image_url: r.image_url || '',
      is_video: Boolean(r.is_video),
      ingestion_method: r.ingestion_method || 'uploaded'
    };
  });
}

/**
 * 9. Fetch RecGPT Playbook Recommendation Triplet
 */
export async function getRecgptPlaybookService(targetSql, { seedPinId }) {
  let dinnerAnchor = null;
  let navboostSide = null;
  let sessionFinisher = null;

  let isBakerySeed = false;
  if (seedPinId) {
    const sInfo = await targetSql`SELECT label FROM cluster_seeds WHERE pin_id = ${seedPinId} LIMIT 1;`;
    if (sInfo.length > 0) {
      isBakerySeed = /\b(muffin|muffins|cake|cakes|cookie|cookies|brownie|brownies|roll|rolls|cinnamon|pie|pies|tart|bread|cupcake|cupcakes|donut|donuts|pastry|pastries|bake|baking|dessert|sweet|chocolate|caramel|pumpkin spice)\b/i.test(sInfo[0].label || '');
    }

    if (isBakerySeed) {
      const dRows = await targetSql`
        SELECT * FROM candidate_graph_nodes
        WHERE seed_pin_id = ${seedPinId} AND sequence_role IN ('DESSERT_HERO', 'DINNER_ANCHOR')
        ORDER BY (sequence_role = 'DESSERT_HERO') DESC, saves DESC LIMIT 1;
      `;
      if (dRows.length > 0) dinnerAnchor = dRows[0];

      const nRows = await targetSql`
        SELECT * FROM candidate_graph_nodes
        WHERE seed_pin_id = ${seedPinId} AND sequence_role IN ('BEVERAGE_PAIRING', 'NAVBOOST_CO_VISITOR')
          AND candidate_pin_id != ${dinnerAnchor?.candidate_pin_id || ''}
        ORDER BY (sequence_role = 'BEVERAGE_PAIRING') DESC, saves DESC LIMIT 1;
      `;
      if (nRows.length > 0) navboostSide = nRows[0];

      const sRows = await targetSql`
        SELECT * FROM candidate_graph_nodes
        WHERE seed_pin_id = ${seedPinId} AND sequence_role IN ('PASTRY_BITES', 'SESSION_FINISHER')
          AND candidate_pin_id != ${dinnerAnchor?.candidate_pin_id || ''}
          AND candidate_pin_id != ${navboostSide?.candidate_pin_id || ''}
        ORDER BY (sequence_role = 'PASTRY_BITES') DESC, saves DESC LIMIT 1;
      `;
      if (sRows.length > 0) sessionFinisher = sRows[0];
    } else {
      const dRows = await targetSql`
        SELECT * FROM candidate_graph_nodes
        WHERE seed_pin_id = ${seedPinId} AND sequence_role = 'DINNER_ANCHOR'
        ORDER BY saves DESC LIMIT 1;
      `;
      if (dRows.length > 0) dinnerAnchor = dRows[0];

      const nRows = await targetSql`
        SELECT * FROM candidate_graph_nodes
        WHERE seed_pin_id = ${seedPinId} AND sequence_role = 'NAVBOOST_CO_VISITOR'
        ORDER BY saves DESC LIMIT 1;
      `;
      if (nRows.length > 0) navboostSide = nRows[0];

      const sRows = await targetSql`
        SELECT * FROM candidate_graph_nodes
        WHERE seed_pin_id = ${seedPinId} AND sequence_role = 'SESSION_FINISHER'
        ORDER BY saves DESC LIMIT 1;
      `;
      if (sRows.length > 0) sessionFinisher = sRows[0];
    }

    // Seed-scoped fallbacks: never cross into another seed
    if (!dinnerAnchor) {
      const f = await targetSql`
        SELECT * FROM candidate_graph_nodes
        WHERE seed_pin_id = ${seedPinId}
        ORDER BY saves DESC LIMIT 1;
      `;
      dinnerAnchor = f[0] || null;
    }
    if (!navboostSide) {
      const f = await targetSql`
        SELECT * FROM candidate_graph_nodes
        WHERE seed_pin_id = ${seedPinId} AND candidate_pin_id != ${dinnerAnchor?.candidate_pin_id || ''}
        ORDER BY saves DESC LIMIT 1;
      `;
      navboostSide = f[0] || null;
    }
    if (!sessionFinisher) {
      const f = await targetSql`
        SELECT * FROM candidate_graph_nodes
        WHERE seed_pin_id = ${seedPinId}
          AND candidate_pin_id != ${dinnerAnchor?.candidate_pin_id || ''}
          AND candidate_pin_id != ${navboostSide?.candidate_pin_id || ''}
        ORDER BY saves DESC LIMIT 1;
      `;
      sessionFinisher = f[0] || null;
    }
  } else {
    // Global explorer fallbacks only when no specific seed is requested
    if (!dinnerAnchor) {
      const f = await targetSql`SELECT * FROM candidate_graph_nodes WHERE sequence_role = 'DINNER_ANCHOR' ORDER BY saves DESC LIMIT 1;`;
      dinnerAnchor = f[0] || null;
    }
    if (!navboostSide) {
      const f = await targetSql`SELECT * FROM candidate_graph_nodes WHERE sequence_role = 'NAVBOOST_CO_VISITOR' ORDER BY saves DESC LIMIT 1;`;
      navboostSide = f[0] || null;
    }
    if (!sessionFinisher) {
      const f = await targetSql`SELECT * FROM candidate_graph_nodes WHERE sequence_role = 'SESSION_FINISHER' ORDER BY saves DESC LIMIT 1;`;
      sessionFinisher = f[0] || null;
    }

    if (!dinnerAnchor) {
      const f = await targetSql`SELECT * FROM candidate_graph_nodes ORDER BY saves DESC LIMIT 1;`;
      dinnerAnchor = f[0] || null;
    }
    if (!navboostSide) {
      const f = await targetSql`SELECT * FROM candidate_graph_nodes ORDER BY saves DESC OFFSET 1 LIMIT 1;`;
      navboostSide = f[0] || null;
    }
    if (!sessionFinisher) {
      const f = await targetSql`SELECT * FROM candidate_graph_nodes ORDER BY saves DESC OFFSET 2 LIMIT 1;`;
      sessionFinisher = f[0] || null;
    }
  }

  const formatCard = (node, defaultTitle, defaultRole, defaultPrep) => {
    if (!node) {
      return {
        title: defaultTitle,
        candidate_pin_id: '',
        saves: 0,
        save_rate: 0,
        daily_velocity: 0,
        recgpt_transition_score: 0,
        prep_time: defaultPrep,
        sequence_role: defaultRole,
        winning_color: '#888888',
        culinary_color_name: 'Pending Crawl Data',
        provenance_engine: 'P2P_RECGPT',
        is_pending_data: true
      };
    }
    return {
      title: node.title,
      candidate_pin_id: node.candidate_pin_id,
      saves: Number(node.saves || 0),
      save_rate: Number(node.save_rate || 0),
      daily_velocity: Number(node.daily_velocity || 0),
      recgpt_transition_score: Number(node.recgpt_transition_score || (Number(node.save_rate || 0) * 0.95).toFixed(1)),
      prep_time: defaultPrep,
      sequence_role: node.sequence_role || defaultRole,
      winning_color: node.dominant_color || '#888888',
      culinary_color_name: getCulinaryColorName(node.dominant_color),
      provenance_engine: node.provenance_engine || 'P2P_RECGPT',
      ocr_text: node.ocr_text || '',
      image_url: node.image_url || '',
      is_video: Boolean(node.is_video),
      ingestion_method: node.ingestion_method || 'uploaded'
    };
  };

  return {
    seed_pin_id: seedPinId,
    dinner_anchor: formatCard(dinnerAnchor, 'Slow Cooker Garlic Herb Butter Chicken & Red Potatoes', 'DINNER_ANCHOR', '15m'),
    navboost_co_visitor: formatCard(navboostSide, 'Cast Iron Skillet Garlic Cheddar Honey Biscuits', 'NAVBOOST_CO_VISITOR', '20m'),
    session_finisher: formatCard(sessionFinisher, 'Warm Skillet Salted Caramel Chocolate Chip Cookie with Vanilla Ice Cream', 'SESSION_FINISHER', '10m')
  };
}

/**
 * 10. Fetch Cluster Telemetry & Engine Quotas
 */
export async function getClusterTelemetryService(targetSql, { seedPinIdParam }) {
  let seedPinId = seedPinIdParam;
  if (!seedPinId) {
    const latestSeed = await targetSql`
      SELECT pin_id FROM cluster_seeds
      WHERE last_crawled_at IS NOT NULL
      ORDER BY last_crawled_at DESC
      LIMIT 1;
    `;
    if (latestSeed.length > 0) {
      seedPinId = latestSeed[0].pin_id;
    }
  }

  if (!seedPinId) {
    return {
      recgpt_count: 0,
      navboost_count: 0,
      randomwalk_count: 0,
      two_tower_count: 0,
      fresh_candidate_count: 0,
      product_count: 0,
      total_engine_quota: 0,
      color_centroids: [],
      high_save_tokens: []
    };
  }

  const metricsRows = await targetSql`
    SELECT *
    FROM cluster_arbitrage_metrics
    WHERE seed_pin_id = ${seedPinId}
    ORDER BY analyzed_at DESC
    LIMIT 1;
  `;

  const m = metricsRows[0] || {};
  const recgpt = Number(m.recgpt_count || 0);
  const navboost = Number(m.navboost_count || 0);
  const randomwalk = Number(m.randomwalk_count || 0);
  const twoTower = Number(m.two_tower_count || 0);
  const fresh = Number(m.fresh_candidate_count || 0);
  const productCount = Number(m.product_count || 0);

  const totalEngineQuota = recgpt + navboost + randomwalk + twoTower + fresh || 1;
  const calcPct = (val) => Number(((val / totalEngineQuota) * 100).toFixed(1));

  const countRows = await targetSql`
    SELECT COUNT(*) AS count
    FROM candidate_graph_nodes
    WHERE seed_pin_id = ${seedPinId};
  `;
  const extractedCount = Number(countRows[0]?.count || 0);

  return {
    seed_pin_id: seedPinId,
    recgpt_count: recgpt,
    recgpt_pct: calcPct(recgpt),
    navboost_count: navboost,
    navboost_pct: calcPct(navboost),
    randomwalk_count: randomwalk,
    randomwalk_pct: calcPct(randomwalk),
    two_tower_count: twoTower,
    two_tower_pct: calcPct(twoTower),
    fresh_candidate_count: fresh,
    fresh_pct: calcPct(fresh),
    fresh_candidate_pct: calcPct(fresh),
    product_count: productCount,
    product_pct: calcPct(productCount),
    total_engine_quota: (totalEngineQuota > 1 ? totalEngineQuota : 0),
    extracted_count: extractedCount,
    commercial_gap_ratio: Number(m.commercial_gap_ratio || 0),
    color_centroids: m.winning_color_centroids || [],
    high_save_tokens: m.high_save_tokens || [],
    utility_snapshot: m.utility_snapshot || null,
    analyzed_at: m.analyzed_at || null
  };
}

/**
 * 11. Fetch Guided Search Capsules
 */
export async function getGuidedSearchService(targetSql, { seedPinId }) {
  if (seedPinId && seedPinId !== 'all') {
    return await targetSql`
      SELECT g.*, s.label AS seed_label
      FROM seed_guided_search_capsules g
      LEFT JOIN cluster_seeds s ON s.pin_id = g.seed_pin_id
      WHERE g.seed_pin_id = ${seedPinId}
      ORDER BY g.discovered_at DESC;
    `;
  }
  return await targetSql`
    SELECT g.*, s.label AS seed_label
    FROM seed_guided_search_capsules g
    LEFT JOIN cluster_seeds s ON s.pin_id = g.seed_pin_id
    ORDER BY g.discovered_at DESC;
  `;
}

/**
 * 12. Pixie Multi-Hit Intersections Ranking
 */
export async function getIntersectionsService(targetSql, { minOverlap = 2, limit = 1000 }) {
  const allSeeds = await targetSql`SELECT pin_id, label, is_competitor FROM cluster_seeds;`.catch(() => []);
  const seedMap = new Map();
  for (const s of allSeeds) seedMap.set(s.pin_id, s);

  const rows = await targetSql`
    SELECT 
        c.candidate_pin_id,
        MAX(c.title) AS title,
        MAX(c.domain) AS domain,
        BOOL_OR(c.is_product) AS is_product,
        MAX(c.dominant_color) AS winning_color,
        MAX(c.ocr_text) AS ocr_text,
        MAX(c.aspect_ratio) AS aspect_ratio,
        MAX(c.daily_velocity) AS daily_velocity,
        MAX(c.pin_created_at) AS pin_created_at,
        MAX(c.sequence_role) AS sequence_role,
        MAX(c.provenance_engine) AS provenance_engine,
        MAX(c.repins) AS total_repins,
        MAX(c.image_url) AS image_url,
        BOOL_OR(c.is_video) AS is_video,
        MAX(c.ingestion_method) AS ingestion_method,
        ROUND(AVG(c.save_rate)::numeric, 2) AS avg_save_rate,
        COUNT(DISTINCT c.seed_pin_id) AS seed_overlap_count,
        ROUND(POWER(SUM(SQRT(GREATEST(c.saves, 1))), 2)::numeric, 2) AS pixie_multihit_score,
        MAX(c.saves) AS total_saves,
        ARRAY_AGG(DISTINCT c.seed_pin_id) AS originating_seeds
    FROM candidate_graph_nodes c
    GROUP BY c.candidate_pin_id
    HAVING COUNT(DISTINCT c.seed_pin_id) >= ${minOverlap}
    ORDER BY pixie_multihit_score DESC
    LIMIT ${limit};
  `.catch(() => []);

  const totalSeedsCount = Math.max((allSeeds || []).length, 1);
  const computedCouplings = (rows || []).map((r) => {
    const overlap = Number(r.seed_overlap_count || 1);
    const saves = Number(r.total_saves || 0);
    const multihitWeight = Math.sqrt(Math.max(saves, 1)) * overlap;
    const nodeStrength = Math.max(saves, 1);
    return multihitWeight / Math.sqrt(totalSeedsCount * nodeStrength);
  });
  const meanRho = computedCouplings.reduce((acc, v) => acc + v, 0) / Math.max(computedCouplings.length, 1);

  return (rows || []).map((r, idx) => {
    const saves = Number(r.total_saves || 0);
    const engine = r.provenance_engine || 'P2P_TWO_TOWER';
    const couplingRho = Number((computedCouplings[idx] || 0).toFixed(4));
    const passesRelativeThreshold = couplingRho >= (0.5 * meanRho);

    const ar = Number(r.aspect_ratio || 0.56);
    let format = 'ORGANIC PIN';
    if (r.is_product) format = 'PRODUCT CARD';
    else if (r.is_video) format = 'VIDEO PIN';
    else if (ar > 1.3) format = 'IDEA PIN';

    const seedDetails = (r.originating_seeds || []).map((sid) => {
      const found = seedMap.get(sid);
      return {
        pin_id: sid,
        label: found ? found.label : `Seed ${sid}`,
        is_competitor: found ? found.is_competitor : false
      };
    });

    return {
      ...r,
      engine_source: engine,
      coupling_rho: couplingRho,
      coupling_drift: !passesRelativeThreshold,
      format_type: format,
      culinary_color_name: getCulinaryColorName(r.winning_color),
      is_vacuum_target: !r.is_product && saves >= 5000,
      originating_seed_details: seedDetails,
      image_url: r.image_url || '',
      is_video: Boolean(r.is_video),
      ingestion_method: r.ingestion_method || 'uploaded'
    };
  });
}

/**
 * 13. Import Raw JSON Payload into Graph Capsules and Candidates
 */
export async function importRawJsonClusterDataService(targetSql, { seedPinId, parsedBlocks }) {
  const items = [];
  for (const block of parsedBlocks) {
    const resp = block?.resource_response || block;
    if (Array.isArray(resp?.data)) {
      items.push(...resp.data);
    } else if (Array.isArray(resp)) {
      items.push(...resp);
    }
  }

  if (items.length === 0) {
    throw new Error('No data items found in JSON (expected resource_response.data array)');
  }

  let authoritativeCounts = null;
  for (const item of items) {
    if (!authoritativeCounts && item?.aux_fields?.candidate_counts) {
      try {
        const rawCounts = typeof item.aux_fields.candidate_counts === 'string'
          ? JSON.parse(item.aux_fields.candidate_counts)
          : item.aux_fields.candidate_counts;
        authoritativeCounts = {
          navboost: Number(rawCounts["P2P_NAVBOOST_CAND"] || 0),
          recgpt: Number(rawCounts["P2P_RECGPT"] || 0),
          randomwalk: Number(rawCounts["P2P_RANDOMWALK_CAND"] || 0),
          two_tower: Number(rawCounts["P2P_TWO_TOWER_EMBEDDING_CAND"] || 0),
          fresh: Number(rawCounts["P2P_TWO_TOWER_MID_FUNNEL_FRESH_EMBEDDING_CAND"] || 0)
        };
      } catch (e) {}
    }
  }

  const capturedCapsules = [];
  const inspectAndCapture = (obj) => {
    if (!obj || typeof obj !== 'object') return;
    const hasExplore = (
      obj.type === 'explorearticle' ||
      obj.story_type === 'BUBBLE_ONE_COL' ||
      obj.story_type === 'explore_article' ||
      obj.story_type === 'guide' ||
      Boolean(obj.cover_images && (obj.title?.format || obj.title)) ||
      Boolean(obj.cover_image && (obj.title?.format || obj.title)) ||
      Boolean(obj.node_id && String(obj.node_id).startsWith('RXhwbG9yZ'))
    );
    if (hasExplore) {
      const titleVal = obj.title?.format || obj.title?.text || obj.title?.title || obj.title || obj.copy?.title || obj.query || obj.label;
      const qTerm = typeof titleVal === 'string' ? titleVal.trim() : (titleVal?.format || '');
      if (qTerm && !['more to explore', 'related pins', 'ideas', 'explore'].includes(qTerm.toLowerCase())) {
        const imgUrl = (
          obj.cover_images?.[0]?.['750x']?.url ||
          obj.cover_images?.[0]?.url ||
          obj.cover_image?.['750x']?.url ||
          obj.cover_image?.url ||
          obj.images?.['750x']?.url ||
          obj.images?.['474x']?.url ||
          obj.images?.orig?.url ||
          obj.image_large_url ||
          ''
        );
        const searchUrl = obj.link || obj.action_link || obj.url || `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(qTerm)}`;
        capturedCapsules.push({
          seed_pin_id: seedPinId,
          query_term: qTerm,
          normalized_query: qTerm.toLowerCase().trim(),
          image_url: imgUrl,
          search_url: searchUrl,
          node_id: String(obj.node_id || obj.id || '')
        });
      }
    }
    if (Array.isArray(obj.objects)) for (const s of obj.objects) inspectAndCapture(s);
    if (Array.isArray(obj.items)) for (const s of obj.items) inspectAndCapture(s);
    if (Array.isArray(obj.bubbles)) for (const s of obj.bubbles) inspectAndCapture(s);
    if (Array.isArray(obj.expanded_viewport_objects)) for (const s of obj.expanded_viewport_objects) inspectAndCapture(s);
  };

  for (const item of items) inspectAndCapture(item);

  if (capturedCapsules.length > 0) {
    const dedupCapMap = new Map();
    for (const cap of capturedCapsules) {
      if (cap?.normalized_query) dedupCapMap.set(`${cap.seed_pin_id}_${cap.normalized_query}`, cap);
    }
    const uniqueCaps = Array.from(dedupCapMap.values());
    await targetSql`
      INSERT INTO seed_guided_search_capsules (
        seed_pin_id, query_term, normalized_query, image_url, search_url, node_id, discovered_at
      )
      SELECT
        u.seed_pin_id, u.query_term, u.normalized_query, u.image_url, u.search_url, u.node_id, NOW()
      FROM jsonb_to_recordset(${JSON.stringify(uniqueCaps)}::jsonb) AS u(
        seed_pin_id text,
        query_term text,
        normalized_query text,
        image_url text,
        search_url text,
        node_id text
      )
      ON CONFLICT (seed_pin_id, normalized_query) DO UPDATE SET
        image_url = EXCLUDED.image_url,
        search_url = EXCLUDED.search_url,
        node_id = EXCLUDED.node_id;
    `;
  }

  const rawCandidates = [];
  for (const item of items) {
    const list = [];
    if (item.type === 'pin' || item.images || item.story_pin_data) list.push(item);
    if (Array.isArray(item.pins)) list.push(...item.pins);
    if (Array.isArray(item.objects)) list.push(...item.objects.filter(o => o.type === 'pin' || o.images));

    for (const p of list) {
      const candidatePinId = String(p.id || p.pin_id || '').trim();
      if (!candidatePinId || candidatePinId === seedPinId || candidatePinId.startsWith('-') || !/^\d+$/.test(candidatePinId)) continue;

      const title = (p.title || p.grid_title || p.auto_alt_text || p.description || '').slice(0, 255).trim() || `Pin ${candidatePinId}`;
      const domain = p.domain || p.link_domain?.id || 'Uploaded by user';
      const dominantColor = (p.dominant_color && typeof p.dominant_color === 'string') ? p.dominant_color : '#888888';
      const saves = Number(p.aggregated_pin_data?.aggregated_stats?.saves ?? (p.repin_count || 0));
      const repins = Number(p.repin_count || 0);
      const saveRate = saves > 0 ? Number(((repins / saves) * 100).toFixed(2)) : 0;
      const isProduct = Boolean(p.is_eligible_for_pdp || (p.price_value && Number(p.price_value) > 0) || p.product_metadata || (Array.isArray(p.shopping_flags) && p.shopping_flags.length > 0));
      const ocrText = p.auto_alt_text || '';
      const imageUrl = p.images?.['236x']?.url || p.images?.['474x']?.url || p.images?.orig?.url || p.image_large_url || '';
      const isVideo = Boolean(p.is_video || p.videos != null);
      const ingestionMethod = p.method || 'RAW_PAYLOAD_DIRECT_IMPORT';

      let pinCreatedAt = p.created_at ? new Date(p.created_at).toISOString() : new Date(Date.now() - 180 * 86400000).toISOString();
      const ageDays = Math.max(1, Math.floor((Date.now() - new Date(pinCreatedAt).getTime()) / 86400000));
      const dailyVelocity = Number((saves / ageDays).toFixed(2));
      const provenanceEngine = saves >= 30000 ? 'P2P_NAVBOOST' : (saves >= 8000 ? 'P2P_RANDOMWALK' : 'P2P_TWO_TOWER');

      rawCandidates.push({
        seed_pin_id: seedPinId,
        candidate_pin_id: candidatePinId,
        title,
        dominant_color: dominantColor,
        aspect_ratio: 0.56,
        saves,
        repins,
        save_rate: saveRate,
        domain,
        is_product: isProduct,
        ocr_text: ocrText,
        pin_created_at: pinCreatedAt,
        age_days: ageDays,
        daily_velocity: dailyVelocity,
        provenance_engine: provenanceEngine,
        individual_prod_score: isProduct ? 203.29 : -17.58,
        recgpt_transition_score: Number((saveRate * 0.9).toFixed(1)),
        sequence_role: 'DIRECT_MATCH',
        is_recgpt_candidate: false,
        visual_entropy_score: 0.5,
        image_url: imageUrl,
        is_video: isVideo,
        ingestion_method: ingestionMethod
      });
    }
  }

  if (rawCandidates.length > 0) {
    const dedupCandMap = new Map();
    for (const node of rawCandidates) {
      if (node?.candidate_pin_id) dedupCandMap.set(`${node.seed_pin_id}_${node.candidate_pin_id}`, node);
    }
    const uniqueCandidates = Array.from(dedupCandMap.values());
    const candChunkSize = 250;
    for (let i = 0; i < uniqueCandidates.length; i += candChunkSize) {
      const chunk = uniqueCandidates.slice(i, i + candChunkSize);
      await targetSql`
        INSERT INTO candidate_graph_nodes (
          seed_pin_id, candidate_pin_id, title,
          dominant_color, aspect_ratio, saves,
          repins, save_rate, domain,
          is_product, ocr_text, extracted_at,
          pin_created_at, age_days, daily_velocity,
          provenance_engine, individual_prod_score,
          recgpt_transition_score, sequence_role,
          is_recgpt_candidate, visual_entropy_score,
          image_url, is_video, ingestion_method
        )
        SELECT
          u.seed_pin_id, u.candidate_pin_id, u.title,
          u.dominant_color, u.aspect_ratio, u.saves,
          u.repins, u.save_rate, u.domain,
          u.is_product, u.ocr_text, NOW(),
          NULLIF(TRIM(u.pin_created_at), '')::timestamptz, u.age_days, u.daily_velocity,
          u.provenance_engine, u.individual_prod_score,
          u.recgpt_transition_score, u.sequence_role,
          u.is_recgpt_candidate, u.visual_entropy_score,
          u.image_url, u.is_video, u.ingestion_method
        FROM jsonb_to_recordset(${JSON.stringify(chunk)}::jsonb) AS u(
          seed_pin_id text, candidate_pin_id text, title text,
          dominant_color text, aspect_ratio text, saves int,
          repins int, save_rate numeric, domain text,
          is_product boolean, ocr_text text,
          pin_created_at text, age_days int, daily_velocity numeric,
          provenance_engine text, individual_prod_score numeric,
          recgpt_transition_score numeric, sequence_role text,
          is_recgpt_candidate boolean, visual_entropy_score numeric,
          image_url text, is_video boolean, ingestion_method text
        )
        ON CONFLICT (seed_pin_id, candidate_pin_id) DO UPDATE SET
          title = EXCLUDED.title,
          dominant_color = EXCLUDED.dominant_color,
          aspect_ratio = EXCLUDED.aspect_ratio,
          saves = GREATEST(candidate_graph_nodes.saves, EXCLUDED.saves),
          repins = GREATEST(candidate_graph_nodes.repins, EXCLUDED.repins),
          save_rate = EXCLUDED.save_rate,
          domain = EXCLUDED.domain,
          is_product = EXCLUDED.is_product,
          ocr_text = COALESCE(NULLIF(EXCLUDED.ocr_text, ''), candidate_graph_nodes.ocr_text),
          extracted_at = NOW(),
          pin_created_at = COALESCE(EXCLUDED.pin_created_at, candidate_graph_nodes.pin_created_at),
          age_days = EXCLUDED.age_days,
          daily_velocity = GREATEST(candidate_graph_nodes.daily_velocity, EXCLUDED.daily_velocity),
          provenance_engine = EXCLUDED.provenance_engine,
          individual_prod_score = EXCLUDED.individual_prod_score,
          recgpt_transition_score = EXCLUDED.recgpt_transition_score,
          image_url = COALESCE(NULLIF(EXCLUDED.image_url, ''), candidate_graph_nodes.image_url),
          is_video = EXCLUDED.is_video,
          ingestion_method = EXCLUDED.ingestion_method;
      `;
    }
  }

  if (authoritativeCounts) {
    const existingMetrics = await targetSql`
      SELECT id FROM cluster_arbitrage_metrics
      WHERE seed_pin_id = ${seedPinId}
      ORDER BY analyzed_at DESC
      LIMIT 1;
    `;

    if (existingMetrics.length > 0) {
      await targetSql`
        UPDATE cluster_arbitrage_metrics
        SET
          recgpt_count = ${authoritativeCounts.recgpt},
          navboost_count = ${authoritativeCounts.navboost},
          randomwalk_count = ${authoritativeCounts.randomwalk},
          two_tower_count = ${authoritativeCounts.two_tower},
          fresh_candidate_count = ${authoritativeCounts.fresh},
          analyzed_at = NOW()
        WHERE id = ${existingMetrics[0].id};
      `;
    }
  }

  return {
    candidates_imported: rawCandidates.length,
    capsules_imported: capturedCapsules.length,
    authoritative_counts: authoritativeCounts
  };
}

/**
 * 14. Discovery Typeahead with Volume & Trend Enrichment
 * // [INVARIANT: DISCOVERY-ENRICHMENT]
 */
export async function getDiscoveryTypeaheadService({ cleanQ }) {
  const result = await fetchKeywordTypeahead(cleanQ);

  // Prepend root seed keyword at index 0 so user sees the searched term's volume & taxonomy
  let targetSuggestions = Array.isArray(result?.suggestions) ? [...result.suggestions] : [];
  if (cleanQ.length >= 2) {
    const lowerQ = cleanQ.toLowerCase();
    const exists = targetSuggestions.some(item => {
      const s = typeof item === 'string' ? item : (item.term || item.query || '');
      return s.trim().toLowerCase() === lowerQ;
    });
    if (!exists) {
      targetSuggestions.unshift({ term: cleanQ, is_seed: true });
    } else {
      targetSuggestions = targetSuggestions.map(item => {
        const s = typeof item === 'string' ? item : (item.term || item.query || '');
        if (s.trim().toLowerCase() === lowerQ) {
          return { term: s.trim(), is_seed: true };
        }
        return item;
      });
      const seedIdx = targetSuggestions.findIndex(item => (typeof item === 'object' && item.is_seed));
      if (seedIdx > 0) {
        const [seedItem] = targetSuggestions.splice(seedIdx, 1);
        targetSuggestions.unshift(seedItem);
      }
    }
  }

  if (targetSuggestions.length > 0) {
    // [INVARIANT: CLOUDFLARE-SUBREQUEST-SHIELD] Bound suggestions to <= 8 terms to prevent subrequest exhaustion
    const boundedSuggestions = targetSuggestions.slice(0, 8);
    const suggestionTerms = boundedSuggestions.map(item => 
      typeof item === 'string' ? item : (item.term || item.query || '')
    ).filter(Boolean);

    const [velocityMapResult, enriched] = await Promise.all([
      fetchPinterestBatchVelocity(cleanQ, suggestionTerms).catch(() => new Map()),
      Promise.allSettled(boundedSuggestions.map(async (item) => {
        const termStr = typeof item === 'string' ? item : (item.term || item.query || '');
        const isSeed = (typeof item === 'object' && Boolean(item.is_seed)) || (termStr.toLowerCase() === cleanQ.toLowerCase());
        try {
          const interest = await fetchPinterestInterestVolume(termStr);
          const hasAnno = interest && interest.id && String(interest.id) !== '0' && (interest.internal_search_count > 0);
          const breadcrumbs = (hasAnno && Array.isArray(interest.seo_breadcrumbs)) ? interest.seo_breadcrumbs : [];
          return {
            term: termStr,
            is_seed: isSeed,
            search_volume: hasAnno ? interest.internal_search_count : null,
            annotation_id: hasAnno ? interest.id : null,
            category_tree: breadcrumbs,
            category_path: breadcrumbs.length > 0 ? breadcrumbs.join(' > ') : '',
            url: hasAnno && interest.url_name ? `https://www.pinterest.com/ideas/${interest.url_name}/${interest.id}/` : null
          };
        } catch (_) {
          return { term: termStr, is_seed: isSeed, search_volume: null, annotation_id: null, category_tree: [], category_path: '', url: null };
        }
      }))
    ]);

    const velocityMap = (velocityMapResult instanceof Map) ? velocityMapResult : new Map();

    result.success = true;
    result.term = cleanQ;
    result.suggestions = suggestionTerms;
    result.enriched_suggestions = enriched.map((r, i) => {
      const base = r.status === 'fulfilled' ? r.value : { 
        term: suggestionTerms[i] || '', 
        is_seed: (suggestionTerms[i] || '').toLowerCase() === cleanQ.toLowerCase(), 
        search_volume: null, 
        category_tree: [], 
        category_path: '', 
        url: null 
      };
      const cleanT = String(base.term || '').trim().toLowerCase();
      const velData = velocityMap.get(cleanT);
      return {
        ...base,
        weekly_change: (velData && typeof velData.weekly_change === 'number') ? velData.weekly_change : null,
        monthly_change: (velData && typeof velData.monthly_change === 'number') ? velData.monthly_change : null,
        yearly_change: (velData && typeof velData.yearly_change === 'number') ? velData.yearly_change : null,
        velocity_30d: (velData && typeof velData.velocity_30d === 'number') ? velData.velocity_30d : null,
        counts: Array.isArray(velData?.counts) ? velData.counts : [],
        has_prediction: Boolean(velData?.hasPrediction)
      };
    });
  }

  return result;
}
