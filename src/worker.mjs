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
      // 1. GET /api/seeds
      if (method === 'GET' && pathname === '/api/seeds') {
        const seeds = await sql`
          SELECT 
              s.pin_id,
              s.label,
              s.is_competitor,
              s.created_at,
              s.last_crawled_at,
              COALESCE(c_count.count, 0) AS candidate_count,
              COALESCE(cap_count.count, 0) AS capsule_count,
              m.total_candidates,
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

      // 2. POST /api/seeds
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

      // 3. DELETE /api/seeds
      if (method === 'DELETE' && pathname === '/api/seeds') {
        const pinId = searchParams.get('pin_id');
        if (!pinId) {
          return jsonResponse({ error: 'pin_id query parameter is required' }, 400);
        }
        await sql`DELETE FROM cluster_seeds WHERE pin_id = ${pinId};`;
        return jsonResponse({ success: true, deleted_pin_id: pinId });
      }

      // 4. GET /api/candidates
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
        return jsonResponse(rows);
      }

      // 5. GET /api/cluster-telemetry
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
          fresh_candidate_pct: calcPct(fresh),
          product_count: productCount,
          total_engine_quota: (totalEngineQuota > 1 ? totalEngineQuota : 0),
          extracted_count: extractedCount,
          commercial_gap_ratio: Number(m.commercial_gap_ratio || 0),
          color_centroids: m.winning_color_centroids || [],
          high_save_tokens: m.high_save_tokens || [],
          utility_snapshot: m.utility_snapshot || null,
          analyzed_at: m.analyzed_at || null
        });
      }

      // 6. GET /api/guided-search
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

      // 7. GET /api/intersections
      if (method === 'GET' && pathname === '/api/intersections') {
        const rows = await sql`
          WITH candidate_seed_presence AS (
              SELECT 
                  candidate_pin_id,
                  COUNT(DISTINCT seed_pin_id) AS seed_count,
                  ARRAY_AGG(DISTINCT seed_pin_id) AS seed_ids,
                  MAX(title) AS title,
                  MAX(dominant_color) AS dominant_color,
                  MAX(saves) AS saves,
                  MAX(daily_velocity) AS daily_velocity,
                  MAX(sequence_role) AS sequence_role,
                  BOOL_OR(is_product) AS is_product,
                  MAX(image_url) AS image_url,
                  MAX(domain) AS domain
              FROM candidate_graph_nodes
              GROUP BY candidate_pin_id
              HAVING COUNT(DISTINCT seed_pin_id) >= 2
          )
          SELECT *
          FROM candidate_seed_presence
          ORDER BY seed_count DESC, daily_velocity DESC NULLS LAST, saves DESC
          LIMIT 100;
        `;
        return jsonResponse(rows);
      }

      // 8. POST /api/crawl (Instruct user or trigger)
      if (method === 'POST' && pathname === '/api/crawl') {
        return jsonResponse({
          status: 'info',
          message: 'Background crawls are executed serverlessly via GitHub Actions. Please trigger the GitHub Actions workflow cluster-intelligence.yml or run locally with npm run crawl.',
          action_url: 'https://github.com/sayfedin-star/pin-arbitrage-engine/actions'
        });
      }

      // 9. GET /api/crawl-status
      if (method === 'GET' && pathname === '/api/crawl-status') {
        return jsonResponse({
          is_crawling: false,
          mode: 'github_actions_pipeline',
          message: 'Managed in GitHub Actions'
        });
      }

      // 10. GET /api/settings/cookie
      if (method === 'GET' && pathname === '/api/settings/cookie') {
        const cookie = env.PINTEREST_COOKIE || '';
        return jsonResponse({
          configured: Boolean(cookie),
          source: 'cloudflare_env',
          preview: cookie ? `${cookie.slice(0, 8)}...${cookie.slice(-6)}` : 'Not Set'
        });
      }

      // Default 404
      return jsonResponse({ error: 'Endpoint not found', path: pathname }, 404);
    } catch (err) {
      return jsonResponse({ error: 'Internal Server Error', message: err.message }, 500);
    }
  }
};
