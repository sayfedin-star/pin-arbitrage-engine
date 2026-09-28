/**
 * Pinterest Algorithmic Arbitrage Engine
 * Cloudflare Worker Edge Entrypoint
 *
 * Runs on Cloudflare Workers edge runtime with Neon Serverless Postgres
 */

import { neon } from '@neondatabase/serverless';
import { getDashboardHtml } from './dashboard-ui.mjs';

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  });
}

function corsOptionsResponse() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    }
  });
}

// Culinary Color Name Mapper
export function getCulinaryColorName(hex) {
  if (!hex || typeof hex !== 'string') return 'Culinary Accent';
  const cleanHex = hex.replace('#', '').toLowerCase();
  if (cleanHex.length < 6) return 'Culinary Accent';

  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);

  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const delta = max - min;
  const l = (max + min) / 2;
  let h = 0;

  if (delta !== 0) {
    if (max === r / 255) h = ((g / 255 - b / 255) / delta) % 6;
    else if (max === g / 255) h = (b / 255 - r / 255) / delta + 2;
    else h = (r / 255 - g / 255) / delta + 4;
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }

  // Refined Culinary & Dessert/Bakery Boundaries
  if (l >= 0.82) return 'Whipped Vanilla / Glaze Cream';
  if (l <= 0.18) return 'Charred Espresso / Dark Truffle';
  if (h >= 345 || h <= 10) return 'Cranberry Glaze / Red Reduction';
  if (h > 10 && h <= 30 && l < 0.38) return 'Toasted Cinnamon / Dutch Cocoa';
  if (h > 10 && h <= 32 && l >= 0.38 && l < 0.55) return 'Roasted Pumpkin / Warm Amber';
  if (h > 32 && h <= 55 && l >= 0.40) return 'Golden Brioche / Honey Glaze';
  if (h > 10 && h <= 45 && l < 0.45) return 'Caramelized Pecan / Spice Crumble';
  if (h > 55 && h <= 165) return 'Fresh Herb / Sage Infusion';
  if (h > 165 && h <= 260) return 'Nordic Sea Salt / Steel Cookware';
  
  return 'Artisan Blend / Culinary Accent';
}

function formatAge(days) {
  const d = Number(days || 1);
  if (d < 30) return `${d}d ago`;
  if (d < 365) return `${Math.floor(d / 30)}mo ago`;
  return `${(d / 365).toFixed(1)}y ago`;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname, searchParams } = url;
    const method = request.method.toUpperCase();

    if (method === 'OPTIONS') {
      return corsOptionsResponse();
    }

    // Serve Frontend Dashboard HTML
    if (pathname === '/' || pathname === '/index.html') {
      return new Response(getDashboardHtml(), {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache'
        }
      });
    }

    // Health check endpoint
    if (pathname === '/api/health') {
      const dbUrl = env.DATABASE_URL || (typeof process !== 'undefined' ? process.env.DATABASE_URL : null);
      if (!dbUrl) {
        return jsonResponse({
          status: 'degraded',
          database: 'missing_database_url',
          error: 'DATABASE_URL secret is not set in Cloudflare Workers settings.',
          timestamp: new Date().toISOString()
        }, 503);
      }
      try {
        const sql = neon(dbUrl);
        await sql`SELECT 1 as alive;`;
        return jsonResponse({
          status: 'healthy',
          database: 'connected',
          runtime: 'cloudflare_workers',
          timestamp: new Date().toISOString()
        });
      } catch (err) {
        return jsonResponse({
          status: 'error',
          database: 'disconnected',
          error: err.message,
          timestamp: new Date().toISOString()
        }, 500);
      }
    }

    const dbUrl = env.DATABASE_URL || (typeof process !== 'undefined' ? process.env.DATABASE_URL : null);
    if (!dbUrl) {
      return jsonResponse({
        error: 'DATABASE_URL secret is not set in Cloudflare Workers environment.',
        hint: 'Add DATABASE_URL in Cloudflare Dashboard -> Workers & Pages -> pin-arbitrage-engine -> Settings -> Variables and Secrets.'
      }, 500);
    }

    const sql = neon(dbUrl);

    try {
      // 1. GET /api/overview
      if (method === 'GET' && pathname === '/api/overview') {
        const overviewRows = await sql`
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

        return jsonResponse({
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
        });
      }

      // 2. GET /api/seeds
      if (method === 'GET' && pathname === '/api/seeds') {
        const seeds = await sql`
          SELECT 
              s.pin_id,
              s.label,
              s.is_competitor,
              s.created_at,
              s.last_crawled_at,
              COALESCE(c_count.count, 0) AS total_candidates,
              COALESCE(c_count.count, 0) AS candidate_count,
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
              SELECT COUNT(*) AS count
              FROM candidate_graph_nodes
              WHERE seed_pin_id = s.pin_id
          ) c_count ON true
          LEFT JOIN LATERAL (
              SELECT COUNT(*) AS count
              FROM seed_guided_search_capsules
              WHERE seed_pin_id = s.pin_id
          ) cap_count ON true
          LEFT JOIN LATERAL (
              SELECT * FROM cluster_arbitrage_metrics 
              WHERE seed_pin_id = s.pin_id 
              ORDER BY analyzed_at DESC 
              LIMIT 1
          ) m ON true
          ORDER BY s.created_at DESC;
        `;
        return jsonResponse(seeds);
      }

      // 3. POST /api/seeds
      if (method === 'POST' && pathname === '/api/seeds') {
        const body = await request.json().catch(() => ({}));
        const pinId = String(body.pin_id || '').trim();
        const label = String(body.label || 'Manual Tracked Seed').trim();
        const isCompetitor = Boolean(body.is_competitor ?? true);

        if (!pinId) {
          return jsonResponse({ error: 'pin_id is required' }, 400);
        }

        const result = await sql`
          INSERT INTO cluster_seeds (pin_id, label, is_competitor, created_at)
          VALUES (${pinId}, ${label}, ${isCompetitor}, NOW())
          ON CONFLICT (pin_id) DO UPDATE SET
              label = EXCLUDED.label,
              is_competitor = EXCLUDED.is_competitor
          RETURNING pin_id, label, is_competitor, last_crawled_at;
        `;
        return jsonResponse({ success: true, seed: result[0] }, 201);
      }

      // 4. DELETE /api/seeds
      if (method === 'DELETE' && pathname === '/api/seeds') {
        const pinId = searchParams.get('pin_id');
        if (!pinId) {
          return jsonResponse({ error: 'pin_id query parameter is required' }, 400);
        }
        await sql`DELETE FROM cluster_seeds WHERE pin_id = ${pinId};`;
        return jsonResponse({ success: true, deleted_pin_id: pinId });
      }

      // 5. GET /api/candidates
      if (method === 'GET' && pathname === '/api/candidates') {
        const seedPinId = searchParams.get('seed_pin_id');
        const limit = Number(searchParams.get('limit')) || 1000;
        const offset = Number(searchParams.get('offset')) || 0;
        const query = (searchParams.get('q') || '').trim();
        const sort = (searchParams.get('sort') || 'saves').toLowerCase();

        let rows;
        if (seedPinId && query) {
          const qPattern = `%${query.toLowerCase()}%`;
          rows = sort === 'velocity' ? await sql`
            SELECT * FROM candidate_graph_nodes
            WHERE seed_pin_id = ${seedPinId}
              AND (LOWER(title) LIKE ${qPattern} OR LOWER(domain) LIKE ${qPattern} OR LOWER(COALESCE(ocr_text, '')) LIKE ${qPattern} OR candidate_pin_id LIKE ${qPattern})
            ORDER BY daily_velocity DESC NULLS LAST, saves DESC
            LIMIT ${limit} OFFSET ${offset};
          ` : await sql`
            SELECT * FROM candidate_graph_nodes
            WHERE seed_pin_id = ${seedPinId}
              AND (LOWER(title) LIKE ${qPattern} OR LOWER(domain) LIKE ${qPattern} OR LOWER(COALESCE(ocr_text, '')) LIKE ${qPattern} OR candidate_pin_id LIKE ${qPattern})
            ORDER BY saves DESC NULLS LAST, daily_velocity DESC
            LIMIT ${limit} OFFSET ${offset};
          `;
        } else if (seedPinId) {
          rows = sort === 'velocity' ? await sql`
            SELECT * FROM candidate_graph_nodes
            WHERE seed_pin_id = ${seedPinId}
            ORDER BY daily_velocity DESC NULLS LAST, saves DESC
            LIMIT ${limit} OFFSET ${offset};
          ` : await sql`
            SELECT * FROM candidate_graph_nodes
            WHERE seed_pin_id = ${seedPinId}
            ORDER BY saves DESC NULLS LAST, daily_velocity DESC
            LIMIT ${limit} OFFSET ${offset};
          `;
        } else if (query) {
          const qPattern = `%${query.toLowerCase()}%`;
          rows = sort === 'velocity' ? await sql`
            SELECT * FROM candidate_graph_nodes
            WHERE LOWER(title) LIKE ${qPattern} OR LOWER(domain) LIKE ${qPattern} OR LOWER(COALESCE(ocr_text, '')) LIKE ${qPattern} OR candidate_pin_id LIKE ${qPattern}
            ORDER BY daily_velocity DESC NULLS LAST, saves DESC
            LIMIT ${limit} OFFSET ${offset};
          ` : await sql`
            SELECT * FROM candidate_graph_nodes
            WHERE LOWER(title) LIKE ${qPattern} OR LOWER(domain) LIKE ${qPattern} OR LOWER(COALESCE(ocr_text, '')) LIKE ${qPattern} OR candidate_pin_id LIKE ${qPattern}
            ORDER BY saves DESC NULLS LAST, daily_velocity DESC
            LIMIT ${limit} OFFSET ${offset};
          `;
        } else {
          rows = sort === 'velocity' ? await sql`
            SELECT * FROM candidate_graph_nodes
            ORDER BY daily_velocity DESC NULLS LAST, saves DESC
            LIMIT ${limit} OFFSET ${offset};
          ` : await sql`
            SELECT * FROM candidate_graph_nodes
            ORDER BY saves DESC NULLS LAST, daily_velocity DESC
            LIMIT ${limit} OFFSET ${offset};
          `;
        }

        const enriched = rows.map((r) => {
          const saves = Number(r.saves || 0);
          const ar = Number(r.aspect_ratio || 0.56);
          let format = 'ORGANIC PIN';
          if (r.is_product) format = 'PRODUCT CARD';
          else if (r.is_video) format = 'VIDEO PIN';
          else if (ar > 1.3) format = 'IDEA PIN';

          const engine = r.provenance_engine || (saves >= 30000 ? 'P2P_NAVBOOST' : (saves >= 8000 ? 'P2P_RANDOMWALK' : 'P2P_TWO_TOWER'));

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

        return jsonResponse(enriched);
      }

      // 6. GET /api/recgpt-playbook
      if (method === 'GET' && pathname === '/api/recgpt-playbook') {
        const seedPinId = searchParams.get('seed_pin_id');

        let dinnerAnchor = null;
        let navboostSide = null;
        let sessionFinisher = null;

        let isBakerySeed = false;
        if (seedPinId) {
          const sInfo = await sql`SELECT label FROM cluster_seeds WHERE pin_id = ${seedPinId} LIMIT 1;`;
          if (sInfo.length > 0) {
            isBakerySeed = /\b(muffin|muffins|cake|cakes|cookie|cookies|brownie|brownies|roll|rolls|cinnamon|pie|pies|tart|bread|cupcake|cupcakes|donut|donuts|pastry|pastries|bake|baking|dessert|sweet|chocolate|caramel|pumpkin spice)\b/i.test(sInfo[0].label || '');
          }

          if (isBakerySeed) {
            const dRows = await sql`
              SELECT * FROM candidate_graph_nodes
              WHERE seed_pin_id = ${seedPinId} AND sequence_role IN ('DESSERT_HERO', 'DINNER_ANCHOR')
              ORDER BY (sequence_role = 'DESSERT_HERO') DESC, saves DESC LIMIT 1;
            `;
            if (dRows.length > 0) dinnerAnchor = dRows[0];

            const nRows = await sql`
              SELECT * FROM candidate_graph_nodes
              WHERE seed_pin_id = ${seedPinId} AND sequence_role IN ('BEVERAGE_PAIRING', 'NAVBOOST_CO_VISITOR')
                AND candidate_pin_id != ${dinnerAnchor?.candidate_pin_id || ''}
              ORDER BY (sequence_role = 'BEVERAGE_PAIRING') DESC, saves DESC LIMIT 1;
            `;
            if (nRows.length > 0) navboostSide = nRows[0];

            const sRows = await sql`
              SELECT * FROM candidate_graph_nodes
              WHERE seed_pin_id = ${seedPinId} AND sequence_role IN ('PASTRY_BITES', 'SESSION_FINISHER')
                AND candidate_pin_id != ${dinnerAnchor?.candidate_pin_id || ''}
                AND candidate_pin_id != ${navboostSide?.candidate_pin_id || ''}
              ORDER BY (sequence_role = 'PASTRY_BITES') DESC, saves DESC LIMIT 1;
            `;
            if (sRows.length > 0) sessionFinisher = sRows[0];
          } else {
            const dRows = await sql`
              SELECT * FROM candidate_graph_nodes
              WHERE seed_pin_id = ${seedPinId} AND sequence_role = 'DINNER_ANCHOR'
              ORDER BY saves DESC LIMIT 1;
            `;
            if (dRows.length > 0) dinnerAnchor = dRows[0];

            const nRows = await sql`
              SELECT * FROM candidate_graph_nodes
              WHERE seed_pin_id = ${seedPinId} AND sequence_role = 'NAVBOOST_CO_VISITOR'
              ORDER BY saves DESC LIMIT 1;
            `;
            if (nRows.length > 0) navboostSide = nRows[0];

            const sRows = await sql`
              SELECT * FROM candidate_graph_nodes
              WHERE seed_pin_id = ${seedPinId} AND sequence_role = 'SESSION_FINISHER'
              ORDER BY saves DESC LIMIT 1;
            `;
            if (sRows.length > 0) sessionFinisher = sRows[0];
          }

          // Seed-scoped fallbacks: never cross into another seed
          if (!dinnerAnchor) {
            const f = await sql`
              SELECT * FROM candidate_graph_nodes
              WHERE seed_pin_id = ${seedPinId}
              ORDER BY saves DESC LIMIT 1;
            `;
            dinnerAnchor = f[0] || null;
          }
          if (!navboostSide) {
            const f = await sql`
              SELECT * FROM candidate_graph_nodes
              WHERE seed_pin_id = ${seedPinId} AND candidate_pin_id != ${dinnerAnchor?.candidate_pin_id || ''}
              ORDER BY saves DESC LIMIT 1;
            `;
            navboostSide = f[0] || null;
          }
          if (!sessionFinisher) {
            const f = await sql`
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
            const f = await sql`SELECT * FROM candidate_graph_nodes WHERE sequence_role = 'DINNER_ANCHOR' ORDER BY saves DESC LIMIT 1;`;
            dinnerAnchor = f[0] || null;
          }
          if (!navboostSide) {
            const f = await sql`SELECT * FROM candidate_graph_nodes WHERE sequence_role = 'NAVBOOST_CO_VISITOR' ORDER BY saves DESC LIMIT 1;`;
            navboostSide = f[0] || null;
          }
          if (!sessionFinisher) {
            const f = await sql`SELECT * FROM candidate_graph_nodes WHERE sequence_role = 'SESSION_FINISHER' ORDER BY saves DESC LIMIT 1;`;
            sessionFinisher = f[0] || null;
          }

          if (!dinnerAnchor) {
            const f = await sql`SELECT * FROM candidate_graph_nodes ORDER BY saves DESC LIMIT 1;`;
            dinnerAnchor = f[0] || null;
          }
          if (!navboostSide) {
            const f = await sql`SELECT * FROM candidate_graph_nodes ORDER BY saves DESC OFFSET 1 LIMIT 1;`;
            navboostSide = f[0] || null;
          }
          if (!sessionFinisher) {
            const f = await sql`SELECT * FROM candidate_graph_nodes ORDER BY saves DESC OFFSET 2 LIMIT 1;`;
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

        return jsonResponse({
          seed_pin_id: seedPinId,
          dinner_anchor: formatCard(dinnerAnchor, 'Slow Cooker Garlic Herb Butter Chicken & Red Potatoes', 'DINNER_ANCHOR', '15m'),
          navboost_co_visitor: formatCard(navboostSide, 'Cast Iron Skillet Garlic Cheddar Honey Biscuits', 'NAVBOOST_CO_VISITOR', '20m'),
          session_finisher: formatCard(sessionFinisher, 'Warm Skillet Salted Caramel Chocolate Chip Cookie with Vanilla Ice Cream', 'SESSION_FINISHER', '10m')
        });
      }

      // 7. GET /api/cluster-telemetry
      if (method === 'GET' && pathname === '/api/cluster-telemetry') {
        let seedPinId = searchParams.get('seed_pin_id');
        if (!seedPinId) {
          const latestSeed = await sql`
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
          return jsonResponse({
            recgpt_count: 0,
            navboost_count: 0,
            randomwalk_count: 0,
            two_tower_count: 0,
            fresh_candidate_count: 0,
            product_count: 0,
            total_engine_quota: 0,
            color_centroids: [],
            high_save_tokens: []
          });
        }

        const metricsRows = await sql`
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

        const countRows = await sql`
          SELECT COUNT(*) AS count
          FROM candidate_graph_nodes
          WHERE seed_pin_id = ${seedPinId};
        `;
        const extractedCount = Number(countRows[0]?.count || 0);

        return jsonResponse({
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
        });
      }

      // 8. GET /api/guided-search
      if (method === 'GET' && pathname === '/api/guided-search') {
        const seedPinId = searchParams.get('seed_pin_id');
        let rows;
        if (seedPinId && seedPinId !== 'all') {
          rows = await sql`
            SELECT g.*, s.label AS seed_label
            FROM seed_guided_search_capsules g
            LEFT JOIN cluster_seeds s ON s.pin_id = g.seed_pin_id
            WHERE g.seed_pin_id = ${seedPinId}
            ORDER BY g.discovered_at DESC;
          `;
        } else {
          rows = await sql`
            SELECT g.*, s.label AS seed_label
            FROM seed_guided_search_capsules g
            LEFT JOIN cluster_seeds s ON s.pin_id = g.seed_pin_id
            ORDER BY g.discovered_at DESC;
          `;
        }
        return jsonResponse(rows);
      }

      // 9. GET /api/intersections (Uncapped, authentic Pixie Multi-Hit ranking)
      if (method === 'GET' && pathname === '/api/intersections') {
        const minOverlap = Number(searchParams.get('min_overlap')) || 2;
        const limit = Number(searchParams.get('limit')) || 1000;

        const allSeeds = await sql`SELECT pin_id, label, is_competitor FROM cluster_seeds;`;
        const seedMap = new Map();
        for (const s of allSeeds) seedMap.set(s.pin_id, s);

        const rows = await sql`
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
        `;

        const totalSeedsCount = Math.max(allSeeds.length, 1);
        const computedCouplings = rows.map((r) => {
          const overlap = Number(r.seed_overlap_count || 1);
          const saves = Number(r.total_saves || 0);
          const multihitWeight = Math.sqrt(Math.max(saves, 1)) * overlap;
          const nodeStrength = Math.max(saves, 1);
          return multihitWeight / Math.sqrt(totalSeedsCount * nodeStrength);
        });
        const meanRho = computedCouplings.reduce((acc, v) => acc + v, 0) / Math.max(computedCouplings.length, 1);

        const enrichedRows = rows.map((r, idx) => {
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

        return jsonResponse(enrichedRows);
      }

      // 10. POST /api/crawl (Instruct user or trigger)
      if (method === 'POST' && pathname === '/api/crawl') {
        return jsonResponse({
          status: 'info',
          message: 'Background crawls are executed serverlessly via GitHub Actions. Please trigger the GitHub Actions workflow cluster-intelligence.yml or run locally with npm run crawl.',
          action_url: 'https://github.com/sayfedin-star/pin-arbitrage-engine/actions'
        });
      }

      // 11. GET /api/crawl-status
      if (method === 'GET' && pathname === '/api/crawl-status') {
        return jsonResponse({
          is_crawling: false,
          mode: 'github_actions_pipeline',
          message: 'Managed in GitHub Actions'
        });
      }

      // 12. GET /api/settings/cookie
      if (method === 'GET' && pathname === '/api/settings/cookie') {
        const cookie = env.PINTEREST_COOKIE || '';
        return jsonResponse({
          has_cookie: Boolean(cookie && cookie.trim().length > 10),
          source: 'cloudflare_env',
          preview: cookie ? `${cookie.slice(0, 8)}...${cookie.slice(-6)}` : 'Not Set'
        });
      }

      // 13. POST /api/settings/cookie
      if (method === 'POST' && pathname === '/api/settings/cookie') {
        const body = await request.json().catch(() => ({}));
        const cookie = String(body.cookie || '').trim();
        return jsonResponse({
          success: true,
          has_cookie: Boolean(cookie && cookie.length > 10),
          preview: cookie ? (cookie.slice(0, 30) + '...') : null,
          note: 'For edge worker execution, add PINTEREST_COOKIE in Cloudflare Worker Secrets.'
        });
      }

      // Default 404
      return jsonResponse({ error: 'Endpoint not found', path: pathname }, 404);
    } catch (err) {
      return jsonResponse({ error: 'Internal Server Error', message: err.message }, 500);
    }
  }
};
