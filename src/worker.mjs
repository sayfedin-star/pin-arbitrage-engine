/**
 * Pinterest Algorithmic Arbitrage Engine
 * Cloudflare Worker Edge Entrypoint
 *
 * Runs on Cloudflare Workers edge runtime with Neon Serverless Postgres
 */

import { neon } from '@neondatabase/serverless';
import { getDashboardHtml } from './dashboard-ui.mjs';
import { getKeywordsPageHtml } from './keywords-ui.mjs';
import {
  getCompetitorsOverview,
  listCompetitors,
  trackCompetitor,
  syncCompetitorProfile,
  getCompetitorBoards,
  syncCompetitorBoards,
  syncCompetitorPins,
  getCompetitorDetail,
  deleteCompetitorSnapshot,
  updateCompetitorStatus,
  listCompetitorAccountPins,
  getOrSyncBoardDetail,
  getTopDestinationUrls,
  getCompetitorRules,
  saveCompetitorRules,
  reEvaluateCompetitorPins,
  getCompetitorSeeds,
  addCompetitorSeeds,
  deleteCompetitorSeed,
  getCompetitorRelatedIntersections,
  harvestSinglePinRelatedLive
} from './modules/competitors/service.mjs';
import {
  listKeywords,
  addKeyword,
  crawlKeywordSERP,
  getKeywordPins,
  fetchKeywordTypeahead,
  fetchVisualSearchLens,
  getKeywordGuides,
  getKeywordSERPComparison
} from './modules/keywords/service.mjs';
import { getFleetProjects, registerNewProject, syncFleetDatabases, syncCompetitorAcrossFleet, pingFleetProject, getFleetProjectUrl } from './modules/fleet/service.mjs';
import {
  getPinArchiveOverview,
  getTopicClusters,
  listArchivedPins,
  stagePinsForRepurpose,
  listStagedPins,
  claimStagedPinCas,
  cancelStagedPin,
  getQualificationRules,
  updateQualificationRules,
  reEvaluateArchivedPins,
  getPinDetailWithMetrics,
  deletePinMetricSnapshot
} from './modules/pinarchive/service.mjs';

function jsonResponse(data, status = 200, cacheSeconds = 0) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
  if (cacheSeconds > 0) {
    headers['Cache-Control'] = `public, max-age=${cacheSeconds}, stale-while-revalidate=${cacheSeconds * 3}`;
  }
  return new Response(JSON.stringify(data), {
    status,
    headers
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

// Shard database connection cache to prevent connection/memory leaks in Workers
const shardSqlCache = new Map();

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname, searchParams } = url;
    const method = request.method.toUpperCase();

    if (method === 'OPTIONS') {
      return corsOptionsResponse();
    }

    // Serve Dedicated Keywords Studio HTML
    if (pathname === '/keywords') {
      return new Response(getKeywordsPageHtml(), {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache'
        }
      });
    }

    // Serve Frontend Dashboard HTML for root or any creator handle route (e.g. /wifesrecipesbyme)
    if (!pathname.startsWith('/api/')) {
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
    let targetSql = sql;
    const reqProjectId = searchParams.get('project_id') || searchParams.get('shard') || request.headers.get('x-target-project');
    if (reqProjectId && reqProjectId !== 'all' && reqProjectId !== 'hub') {
      try {
        const [proj] = await sql`
          SELECT database_url FROM neon_projects_registry 
          WHERE (project_id = ${reqProjectId} OR project_name = ${reqProjectId}) AND status = 'active' 
          LIMIT 1;
        `;
        if (proj && proj.database_url) {
          if (!shardSqlCache.has(proj.database_url)) {
            shardSqlCache.set(proj.database_url, neon(proj.database_url));
          }
          targetSql = shardSqlCache.get(proj.database_url);
        }
      } catch (_) {}
    }

    try {
      // 1. GET /api/overview
      if (method === 'GET' && pathname === '/api/overview') {
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
        const seeds = await targetSql`
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

        const result = await targetSql`
          INSERT INTO cluster_seeds (pin_id, label, is_competitor, created_at)
          VALUES (${pinId}, ${label}, ${isCompetitor}, NOW())
          ON CONFLICT (pin_id) DO UPDATE SET
              label = EXCLUDED.label,
              is_competitor = EXCLUDED.is_competitor
          RETURNING pin_id, label, is_competitor, last_crawled_at;
        `;
        return jsonResponse({ success: true, seed: result[0] }, 201);
      }

      // 3B. POST /api/seeds/bulk
      if (method === 'POST' && pathname === '/api/seeds/bulk') {
        const body = await request.json().catch(() => ({}));
        const rawSeeds = [];
        if (Array.isArray(body.seeds)) {
          for (const s of body.seeds) {
            const pid = String(s.pin_id || '').trim();
            if (pid && /^\d+$/.test(pid)) {
              rawSeeds.push({
                pin_id: pid,
                label: String(s.label || `Tracked Seed ${pid}`).trim(),
                is_competitor: Boolean(s.is_competitor ?? true)
              });
            }
          }
        } else if (Array.isArray(body.pin_ids)) {
          const isComp = Boolean(body.is_competitor ?? true);
          const prefix = String(body.label_prefix || 'Tracked Seed').trim();
          for (const raw of body.pin_ids) {
            const pid = String(raw || '').trim();
            if (pid && /^\d+$/.test(pid)) {
              rawSeeds.push({
                pin_id: pid,
                label: `${prefix} ${pid}`,
                is_competitor: isComp
              });
            }
          }
        }

        if (rawSeeds.length === 0) {
          return jsonResponse({ error: 'No valid numeric pin IDs provided in payload' }, 400);
        }

        const inserted = [];
        const chunkSize = 20;
        for (let i = 0; i < rawSeeds.length; i += chunkSize) {
          const chunk = rawSeeds.slice(i, i + chunkSize);
          const chunkResults = await Promise.all(chunk.map(s => targetSql`
            INSERT INTO cluster_seeds (pin_id, label, is_competitor, created_at)
            VALUES (${s.pin_id}, ${s.label}, ${s.is_competitor}, NOW())
            ON CONFLICT (pin_id) DO UPDATE SET
              label = EXCLUDED.label,
              is_competitor = EXCLUDED.is_competitor
            RETURNING pin_id, label, is_competitor, last_crawled_at;
          `));
          inserted.push(...chunkResults.flat());
        }

        return jsonResponse({ success: true, count: inserted.length, seeds: inserted }, 201);
      }

      // 3C. POST /api/seeds/bulk-delete
      if (method === 'POST' && pathname === '/api/seeds/bulk-delete') {
        const body = await request.json().catch(() => ({}));
        const pinIds = Array.isArray(body.pin_ids) ? body.pin_ids.map(p => String(p).trim()).filter(Boolean) : [];
        const purgeDatabase = Boolean(body.purge_database ?? true);

        if (pinIds.length === 0) {
          return jsonResponse({ error: 'pin_ids array is required' }, 400);
        }

        if (purgeDatabase) {
          await Promise.all([
            targetSql`DELETE FROM candidate_graph_nodes WHERE seed_pin_id = ANY(${pinIds});`,
            targetSql`DELETE FROM seed_guided_search_capsules WHERE seed_pin_id = ANY(${pinIds});`,
            targetSql`DELETE FROM cluster_arbitrage_metrics WHERE seed_pin_id = ANY(${pinIds});`
          ]);
        }
        await targetSql`DELETE FROM cluster_seeds WHERE pin_id = ANY(${pinIds});`;

        return jsonResponse({
          success: true,
          deleted_count: pinIds.length,
          purged_database: purgeDatabase,
          deleted_pin_ids: pinIds
        });
      }

      // 4. DELETE /api/seeds
      if (method === 'DELETE' && pathname === '/api/seeds') {
        const pinId = searchParams.get('pin_id');
        const purgeData = searchParams.get('purge_data') === 'true' || searchParams.get('purge_database') === 'true';
        if (!pinId) {
          return jsonResponse({ error: 'pin_id query parameter is required' }, 400);
        }
        if (purgeData) {
          await Promise.all([
            targetSql`DELETE FROM candidate_graph_nodes WHERE seed_pin_id = ${pinId};`,
            targetSql`DELETE FROM seed_guided_search_capsules WHERE seed_pin_id = ${pinId};`,
            targetSql`DELETE FROM cluster_arbitrage_metrics WHERE seed_pin_id = ${pinId};`
          ]);
        }
        await targetSql`DELETE FROM cluster_seeds WHERE pin_id = ${pinId};`;
        return jsonResponse({ success: true, deleted_pin_id: pinId, purged_database: purgeData });
      }

      // 4B. POST /api/candidates/delete
      if (method === 'POST' && pathname === '/api/candidates/delete') {
        const body = await request.json().catch(() => ({}));
        const candIds = Array.isArray(body.candidate_pin_ids) ? body.candidate_pin_ids.map(c => String(c).trim()).filter(Boolean) : [];
        const seedPinId = body.seed_pin_id ? String(body.seed_pin_id).trim() : null;

        if (candIds.length === 0) {
          return jsonResponse({ error: 'candidate_pin_ids array is required' }, 400);
        }

        if (seedPinId) {
          await targetSql`DELETE FROM candidate_graph_nodes WHERE candidate_pin_id = ANY(${candIds}) AND seed_pin_id = ${seedPinId};`;
        } else {
          await targetSql`DELETE FROM candidate_graph_nodes WHERE candidate_pin_id = ANY(${candIds});`;
        }

        return jsonResponse({ success: true, deleted_count: candIds.length });
      }

      // 4C. GET /api/workflow/runs (Cloudflare Worker GitHub API integration)
      if (method === 'GET' && pathname === '/api/workflow/runs') {
        const ghToken = env.GITHUB_TOKEN || env.GH_TOKEN || env.GH_REFRESH_TOKEN;
        const repo = 'sayfedin-star/pin-arbitrage-engine';
        try {
          const headers = {
            'User-Agent': 'Cloudflare-Worker-Pin-Arbitrage-Engine',
            'Accept': 'application/vnd.github.v3+json'
          };
          if (ghToken) {
            const cleanToken = String(ghToken).replace(/^(token|Bearer)\s+/i, '').replace(/^["']|["']$/g, '').trim();
            headers['Authorization'] = cleanToken.startsWith('ghp_') ? `token ${cleanToken}` : `Bearer ${cleanToken}`;
          }
          const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/cluster-intelligence.yml/runs?per_page=15`, { headers });
          if (res.ok) {
            const data = await res.json();
            const formatted = (data.workflow_runs || []).map(r => ({
              databaseId: r.id,
              status: r.status,
              conclusion: r.conclusion,
              createdAt: r.created_at,
              url: r.html_url,
              event: r.event,
              displayTitle: r.display_title || r.name,
              headBranch: r.head_branch
            }));
            return jsonResponse(formatted);
          }
          if (res?.body) await res.body.cancel().catch(() => {});
          return jsonResponse([]);
        } catch (e) {
          return jsonResponse([]);
        }
      }

      // 4D. POST /api/workflow/trigger (Cloudflare Worker GitHub API dispatch)
      if (method === 'POST' && pathname === '/api/workflow/trigger') {
        const ghToken = env.GITHUB_TOKEN || env.GH_TOKEN || env.GH_REFRESH_TOKEN;
        if (!ghToken) {
          return jsonResponse({
            success: false,
            error: 'GitHub Token secret not configured in Cloudflare Workers settings. Please add GITHUB_TOKEN or GH_REFRESH_TOKEN secret.'
          }, 400);
        }
        const cleanToken = String(ghToken).replace(/^(token|Bearer)\s+/i, '').replace(/^["']|["']$/g, '').trim();
        const authHeader = cleanToken.startsWith('ghp_') ? `token ${cleanToken}` : `Bearer ${cleanToken}`;
        const body = await request.json().catch(() => ({}));
        let target = '';
        if (Array.isArray(body.seed_pin_ids) && body.seed_pin_ids.length > 0) {
          target = body.seed_pin_ids.map(s => {
            const m = String(s).match(/\d{10,25}/);
            return m ? m[0] : String(s).trim();
          }).filter(Boolean).join(',');
        } else if (body.seed_pin_id) {
          target = String(body.seed_pin_id).split(',').map(s => {
            const m = String(s).match(/\d{10,25}/);
            return m ? m[0] : String(s).trim();
          }).filter(Boolean).join(',');
        }
        const maxPages = body.max_pages ? String(body.max_pages).trim() : '60';

        const repo = 'sayfedin-star/pin-arbitrage-engine';
        const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/cluster-intelligence.yml/dispatches`, {
          method: 'POST',
          headers: {
            'User-Agent': 'Cloudflare-Worker-Pin-Arbitrage-Engine',
            'Accept': 'application/vnd.github.v3+json',
            'Authorization': authHeader,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            ref: 'main',
            inputs: {
              seed_pin_id: target,
              max_pages: maxPages
            }
          })
        });

        if (res.ok || res.status === 204) {
          if (res?.body && !res.bodyUsed) await res.body.cancel().catch(() => {});
          return jsonResponse({
            success: true,
            seed_pin_id: target || 'all_queued',
            max_pages: maxPages,
            message: 'Workflow dispatched successfully to GitHub Actions.'
          });
        } else {
          const errText = await res.text();
          let errDetail = errText;
          if (res.status === 401) {
            errDetail = 'GitHub Token rejected (401 Bad credentials). Ensure your token in Cloudflare has both "repo" and "workflow" scopes enabled at https://github.com/settings/tokens';
          }
          return jsonResponse({ success: false, error: `GitHub API error (${res.status}): ${errDetail}` }, res.status);
        }
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
        } else if (query) {
          const qPattern = `%${query.toLowerCase()}%`;
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

        const enriched = rows.map((r) => {
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
          rows = await targetSql`
            SELECT g.*, s.label AS seed_label
            FROM seed_guided_search_capsules g
            LEFT JOIN cluster_seeds s ON s.pin_id = g.seed_pin_id
            WHERE g.seed_pin_id = ${seedPinId}
            ORDER BY g.discovered_at DESC;
          `;
        } else {
          rows = await targetSql`
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

        const allSeeds = await targetSql`SELECT pin_id, label, is_competitor FROM cluster_seeds;`;
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

      // 14. POST /api/seeds/import-raw-json
      if (method === 'POST' && pathname === '/api/seeds/import-raw-json') {
        const body = await request.json().catch(() => ({}));
        const seedPinId = String(body.seed_pin_id || '').trim();
        let rawJson = body.raw_json;

        if (!seedPinId) {
          return jsonResponse({ error: 'seed_pin_id is required' }, 400);
        }

        let parsedBlocks = [];
        if (typeof rawJson === 'string') {
          try {
            parsedBlocks = [JSON.parse(rawJson)];
          } catch (err) {
            return jsonResponse({ error: 'Invalid JSON payload: ' + err.message }, 400);
          }
        } else if (Array.isArray(rawJson)) {
          parsedBlocks = rawJson;
        } else if (rawJson && typeof rawJson === 'object') {
          parsedBlocks = [rawJson];
        }

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
          return jsonResponse({ error: 'No data items found in JSON (expected resource_response.data array)' }, 400);
        }

        let authoritativeCounts = null;
        let utilityWeights = null;
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
          if (!utilityWeights && item?.aux_fields?.utility_config?.weights) {
            utilityWeights = item.aux_fields.utility_config.weights;
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

        const capChunkSize = 20;
        for (let i = 0; i < capturedCapsules.length; i += capChunkSize) {
          const chunk = capturedCapsules.slice(i, i + capChunkSize);
          await Promise.all(chunk.map(cap => targetSql`
            INSERT INTO seed_guided_search_capsules (
              seed_pin_id, query_term, normalized_query, image_url, search_url, node_id, discovered_at
            ) VALUES (
              ${cap.seed_pin_id}, ${cap.query_term}, ${cap.normalized_query}, ${cap.image_url}, ${cap.search_url}, ${cap.node_id}, NOW()
            )
            ON CONFLICT (seed_pin_id, normalized_query) DO UPDATE
            SET image_url = EXCLUDED.image_url, search_url = EXCLUDED.search_url, node_id = EXCLUDED.node_id;
          `));
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

        const candChunkSize = 20;
        for (let i = 0; i < rawCandidates.length; i += candChunkSize) {
          const chunk = rawCandidates.slice(i, i + candChunkSize);
          await Promise.all(chunk.map(node => targetSql`
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
            ) VALUES (
              ${node.seed_pin_id}, ${node.candidate_pin_id}, ${node.title},
              ${node.dominant_color}, ${node.aspect_ratio}, ${node.saves},
              ${node.repins}, ${node.save_rate}, ${node.domain},
              ${node.is_product}, ${node.ocr_text}, NOW(),
              ${node.pin_created_at}, ${node.age_days}, ${node.daily_velocity},
              ${node.provenance_engine}, ${node.individual_prod_score},
              ${node.recgpt_transition_score}, ${node.sequence_role},
              ${node.is_recgpt_candidate}, ${node.visual_entropy_score},
              ${node.image_url}, ${node.is_video}, ${node.ingestion_method}
            )
            ON CONFLICT (seed_pin_id, candidate_pin_id) DO UPDATE SET
              title = EXCLUDED.title,
              dominant_color = EXCLUDED.dominant_color,
              saves = GREATEST(candidate_graph_nodes.saves, EXCLUDED.saves),
              repins = CASE WHEN EXCLUDED.repins > 0 THEN EXCLUDED.repins ELSE candidate_graph_nodes.repins END,
              save_rate = CASE
                WHEN EXCLUDED.repins > 0 AND GREATEST(candidate_graph_nodes.saves, EXCLUDED.saves) > 0
                  THEN ROUND((EXCLUDED.repins::numeric / GREATEST(candidate_graph_nodes.saves, EXCLUDED.saves)::numeric) * 100, 2)
                WHEN candidate_graph_nodes.repins > 0 AND GREATEST(candidate_graph_nodes.saves, EXCLUDED.saves) > 0
                  THEN ROUND((candidate_graph_nodes.repins::numeric / GREATEST(candidate_graph_nodes.saves, EXCLUDED.saves)::numeric) * 100, 2)
                ELSE candidate_graph_nodes.save_rate
              END,
              domain = EXCLUDED.domain,
              is_product = EXCLUDED.is_product,
              ocr_text = EXCLUDED.ocr_text,
              extracted_at = NOW(),
              image_url = EXCLUDED.image_url,
              is_video = EXCLUDED.is_video;
          `));
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

        return jsonResponse({
          success: true,
          candidates_imported: rawCandidates.length,
          capsules_imported: capturedCapsules.length,
          authoritative_counts: authoritativeCounts
        });
      }

      // 15. Competitor Intelligence API
      if (method === 'GET' && pathname === '/api/competitors') {
        const overview = await getCompetitorsOverview(targetSql);
        const competitors = await listCompetitors(targetSql, {
          account_type: searchParams.get('account_type') || 'all',
          search: searchParams.get('search') || '',
          limit: Number(searchParams.get('limit') || 50),
          offset: Number(searchParams.get('offset') || 0)
        });
        return jsonResponse({ success: true, overview, competitors });
      }

      if (method === 'POST' && pathname === '/api/competitors') {
        const body = await request.json().catch(() => ({}));
        const row = await trackCompetitor(targetSql, body);
        if (row?.username) {
          syncCompetitorAcrossFleet(sql, row.username).catch(() => {});
        }
        return jsonResponse({ success: true, competitor: row });
      }

      if (method === 'POST' && pathname === '/api/competitors/sync') {
        const body = await request.json().catch(() => ({}));
        const username = body.username;
        if (!username) return jsonResponse({ error: 'username is required' }, 400);
        const cookie = env.PINTEREST_COOKIE || (typeof process !== 'undefined' ? process.env.PINTEREST_COOKIE : null);
        const updated = await syncCompetitorProfile(targetSql, username, cookie);
        if (updated?.username) {
          syncCompetitorAcrossFleet(sql, updated.username).catch(() => {});
        }
        return jsonResponse({ success: true, profile: updated });
      }

      if (method === 'DELETE' && pathname === '/api/competitors') {
        let id = searchParams.get('id');
        let username = searchParams.get('username');
        if (!id && !username) {
          try {
            const body = await request.json();
            id = body.id || body.competitor_id;
            username = body.username;
          } catch (_) {}
        }
        if (username) {
          const cleanUser = String(username).replace(/^@/, '').trim().toLowerCase();
          await targetSql`DELETE FROM competitor_profiles WHERE LOWER(username) = ${cleanUser};`;
          return jsonResponse({ success: true, deleted_username: cleanUser });
        } else if (id && !isNaN(Number(id))) {
          await targetSql`DELETE FROM competitor_profiles WHERE id = ${Number(id)};`;
          return jsonResponse({ success: true, deleted_id: Number(id) });
        }
        return jsonResponse({ error: 'id or username is required to delete competitor' }, 400);
      }

      if (method === 'GET' && pathname === '/api/competitors/boards') {
        const username = searchParams.get('username') || searchParams.get('account');
        const competitorId = searchParams.get('competitor_id') || searchParams.get('id');
        const idOrUser = username || competitorId;
        if (!idOrUser) return jsonResponse({ error: 'competitor_id or username is required' }, 400);
        const boards = await getCompetitorBoards(targetSql, idOrUser, { username });
        return jsonResponse({ success: true, boards }, 200, 30);
      }

      if (method === 'POST' && pathname === '/api/competitors/sync-boards') {
        try {
          const body = await request.json().catch(() => ({}));
          const { competitor_id, username } = body;
          if (!competitor_id && !username) return jsonResponse({ error: 'competitor_id or username is required' }, 400);
          const cookie = env.PINTEREST_COOKIE || (typeof process !== 'undefined' ? process.env.PINTEREST_COOKIE : null);
          const result = await syncCompetitorBoards(targetSql, competitor_id, username, cookie);
          if (result?.ok && (username || competitor_id)) {
            syncCompetitorAcrossFleet(sql, username || competitor_id).catch(() => {});
          }
          if (!result.ok) return jsonResponse({ success: false, ...result }, 400);
          return jsonResponse({ success: true, ...result });
        } catch (err) {
          return jsonResponse({ success: false, error: err.message }, 500);
        }
      }

      if (method === 'POST' && pathname === '/api/competitors/sync-pins') {
        const body = await request.json().catch(() => ({}));
        const { competitor_id, username, mode, max_pages } = body;
        if (!username && !competitor_id) return jsonResponse({ error: 'username or competitor_id is required' }, 400);
        const cookie = env.PINTEREST_COOKIE || (typeof process !== 'undefined' ? process.env.PINTEREST_COOKIE : null);
        const result = await syncCompetitorPins(targetSql, competitor_id, username, { mode, maxPages: max_pages, cookie });
        if (!result.ok) return jsonResponse({ success: false, ...result }, 400);
        return jsonResponse({ success: true, ...result });
      }

      if (method === 'GET' && pathname === '/api/competitors/detail') {
        const username = searchParams.get('username') || searchParams.get('account');
        const id = searchParams.get('id') || searchParams.get('competitor_id');
        const idOrUser = username || id;
        if (!idOrUser) return jsonResponse({ error: 'id or username is required' }, 400);
        try {
          const detail = await getCompetitorDetail(targetSql, idOrUser, { username });
          return jsonResponse({ success: true, ...detail }, 200, 20);
        } catch (err) {
          return jsonResponse({ success: false, error: err.message }, 500);
        }
      }

      if (method === 'GET' && pathname === '/api/competitors/board-detail') {
        const username = searchParams.get('username') || searchParams.get('account') || searchParams.get('id');
        const board = searchParams.get('board') || searchParams.get('board_name') || searchParams.get('slug');
        if (!username || !board) return jsonResponse({ error: 'username and board are required' }, 400);
        try {
          const forceRefresh = searchParams.get('refresh') === 'true';
          const boardData = await getOrSyncBoardDetail(targetSql, username, board, { forceRefresh });
          return jsonResponse({ success: true, board: boardData }, 200, forceRefresh ? 0 : 60);
        } catch (err) {
          return jsonResponse({ success: false, error: err.message }, 500);
        }
      }

      if (method === 'GET' && pathname === '/api/competitors/all-pins') {
        const username = searchParams.get('username') || searchParams.get('account');
        const id = searchParams.get('id') || searchParams.get('competitor_id');
        const idOrUser = username || id;
        if (!idOrUser) return jsonResponse({ error: 'id or username is required' }, 400);
        try {
          const data = await listCompetitorAccountPins(targetSql, idOrUser, {
            username,
            search: searchParams.get('search') || '',
            board: searchParams.get('board') || searchParams.get('board_name') || searchParams.get('slug') || '',
            min_saves: Number(searchParams.get('min_saves') || 0),
            sort: searchParams.get('sort') || 'saves_desc',
            page: Number(searchParams.get('page') || 1),
            limit: Number(searchParams.get('limit') || 50),
            qualified_only: searchParams.get('qualified_only') === 'true',
            product_only: searchParams.get('product_only') === 'true',
            articles_only: searchParams.get('articles_only') === 'true'
          });
          return jsonResponse({ success: true, ...data }, 200, 15);
        } catch (err) {
          return jsonResponse({ success: false, error: err.message }, 500);
        }
      }

      if (method === 'GET' && pathname === '/api/competitors/top-urls') {
        const id = searchParams.get('id') || searchParams.get('competitor_id');
        if (!id) return jsonResponse({ error: 'competitor_id is required' }, 400);
        try {
          const result = await getTopDestinationUrls(targetSql, id, {
            limit: Number(searchParams.get('limit') || 50),
            page: Number(searchParams.get('page') || 1),
            search: searchParams.get('search') || '',
            sort: searchParams.get('sort') || 'saves_desc',
            filter_type: searchParams.get('filter_type') || 'all'
          });
          return jsonResponse({ success: true, ...result }, 200, 15);
        } catch (err) {
          return jsonResponse({ success: false, error: err.message }, 500);
        }
      }

      if (method === 'GET' && pathname === '/api/competitors/rules') {
        const id = searchParams.get('id') || searchParams.get('competitor_id');
        if (!id) return jsonResponse({ error: 'competitor_id is required' }, 400);
        try {
          const result = await getCompetitorRules(targetSql, id);
          return jsonResponse({ success: true, ...result });
        } catch (err) {
          return jsonResponse({ success: false, error: err.message }, 500);
        }
      }

      if (method === 'POST' && pathname === '/api/competitors/rules') {
        const body = await request.json().catch(() => ({}));
        const id = body.competitor_id || body.id;
        if (!id) return jsonResponse({ error: 'competitor_id is required' }, 400);
        try {
          const result = await saveCompetitorRules(targetSql, id, body.rules || body);
          return jsonResponse({ success: true, ...result });
        } catch (err) {
          return jsonResponse({ success: false, error: err.message }, 500);
        }
      }

      if (method === 'POST' && pathname === '/api/competitors/re-evaluate') {
        const body = await request.json().catch(() => ({}));
        const id = body.competitor_id || body.id;
        if (!id) return jsonResponse({ error: 'competitor_id is required' }, 400);
        try {
          const result = await reEvaluateCompetitorPins(targetSql, id);
          return jsonResponse({ success: true, ...result });
        } catch (err) {
          return jsonResponse({ success: false, error: err.message }, 500);
        }
      }

      if (method === 'POST' && pathname === '/api/competitors/dispatch-crawl') {
        const body = await request.json().catch(() => ({}));
        const username = (body.username || body.target_account || '').replace(/^@+/, '').trim();
        if (!username) return jsonResponse({ error: 'username is required' }, 400);
        const ghToken = env.GITHUB_TOKEN || env.GH_TOKEN || env.GH_REFRESH_TOKEN;
        if (!ghToken) {
          return jsonResponse({
            success: false,
            error: 'GITHUB_TOKEN secret is not configured in Cloudflare Workers settings. Please configure GITHUB_TOKEN to enable automatic GitHub Actions dispatching.'
          }, 400);
        }
        const cleanToken = String(ghToken).replace(/^(token|Bearer)\s+/i, '').replace(/^["']|["']$/g, '').trim();
        const authHeader = cleanToken.startsWith('ghp_') ? `token ${cleanToken}` : `Bearer ${cleanToken}`;
        const repo = 'sayfedin-star/pin-arbitrage-engine';
        const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/crawler-pipeline.yml/dispatches`, {
          method: 'POST',
          headers: {
            'User-Agent': 'Cloudflare-Worker-Pin-Arbitrage-Engine',
            'Accept': 'application/vnd.github.v3+json',
            'Authorization': authHeader,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            ref: 'main',
            inputs: {
              target_account: username,
              target_boards: String(body.target_boards || body.boards || '').trim(),
              crawl_mode: body.crawl_mode || 'sharded_boards',
              max_pages: String(body.max_pages || '1000'),
              personal_boards_only: String(body.personal_boards_only !== false)
            }
          })
        });

        if (res.ok || res.status === 204) {
          if (res?.body && !res.bodyUsed) await res.body.cancel().catch(() => {});
          return jsonResponse({
            success: true,
            target_account: username,
            target_boards: body.target_boards || '',
            crawl_mode: body.crawl_mode || 'discovery',
            message: `Two-Stage Pipeline (Discovery + 20-Shard Parallel Matrix) dispatched successfully on GitHub Actions for @${username}!${body.target_boards ? ` (Target Boards: ${body.target_boards})` : ''}`
          });
        } else {
          const errText = await res.text();
          return jsonResponse({ success: false, error: `GitHub API error (${res.status}): ${errText}` }, res.status);
        }
      }

      // Account-Scoped Related Pins & Graph Intersections Radar
      if (method === 'GET' && pathname === '/api/competitors/related-pins/seeds') {
        const id = searchParams.get('id') || searchParams.get('competitor_id');
        if (!id) return jsonResponse({ error: 'competitor_id is required' }, 400);
        try {
          const result = await getCompetitorSeeds(targetSql, id);
          return jsonResponse({ success: true, ...result });
        } catch (err) {
          return jsonResponse({ success: false, error: err.message }, 500);
        }
      }

      if (method === 'POST' && pathname === '/api/competitors/related-pins/seeds') {
        const body = await request.json().catch(() => ({}));
        const id = body.competitor_id || body.id;
        if (!id) return jsonResponse({ error: 'competitor_id is required' }, 400);
        try {
          const result = await addCompetitorSeeds(targetSql, id, body.pin_ids || body.pins || []);
          return jsonResponse({ success: true, ...result });
        } catch (err) {
          return jsonResponse({ success: false, error: err.message }, 500);
        }
      }

      if (method === 'DELETE' && pathname === '/api/competitors/related-pins/seeds') {
        let id = searchParams.get('competitor_id') || searchParams.get('id');
        let pinId = searchParams.get('pin_id') || searchParams.get('pin_ids');
        if (!id || !pinId) {
          const body = await request.json().catch(() => ({}));
          id = id || body.competitor_id || body.id;
          pinId = pinId || body.pin_id || body.pin_ids;
        }
        if (!id || !pinId) return jsonResponse({ error: 'competitor_id and pin_id are required' }, 400);
        try {
          const result = await deleteCompetitorSeed(targetSql, id, pinId);
          return jsonResponse({ success: true, ...result });
        } catch (err) {
          return jsonResponse({ success: false, error: err.message }, 500);
        }
      }

      if (method === 'GET' && pathname === '/api/competitors/related-pins/intersections') {
        const id = searchParams.get('id') || searchParams.get('competitor_id');
        if (!id) return jsonResponse({ error: 'competitor_id is required' }, 400);
        try {
          const result = await getCompetitorRelatedIntersections(targetSql, id, {
            min_overlap: Number(searchParams.get('min_overlap') || 2),
            page: Number(searchParams.get('page') || 1),
            limit: Number(searchParams.get('limit') || 50),
            filter: searchParams.get('filter') || 'all',
            search: searchParams.get('search') || ''
          });
          return jsonResponse({ success: true, ...result });
        } catch (err) {
          return jsonResponse({ success: false, error: err.message }, 500);
        }
      }

      if (method === 'POST' && pathname === '/api/competitors/related-pins/harvest-live') {
        const body = await request.json().catch(() => ({}));
        const id = body.competitor_id || body.id;
        const pinId = body.pin_id;
        if (!id || !pinId) return jsonResponse({ error: 'competitor_id and pin_id are required' }, 400);
        try {
          const result = await harvestSinglePinRelatedLive(targetSql, id, pinId);
          return jsonResponse({ success: true, ...result });
        } catch (err) {
          return jsonResponse({ success: false, error: err.message }, 500);
        }
      }

      if (method === 'POST' && pathname === '/api/competitors/related-pins/dispatch-workflow') {
        const body = await request.json().catch(() => ({}));
        const username = (body.username || body.target_account || '').replace(/^@+/, '').trim();
        if (!username) return jsonResponse({ error: 'username is required' }, 400);
        const ghToken = env.GITHUB_TOKEN || env.GH_TOKEN || env.GH_REFRESH_TOKEN;
        if (!ghToken) {
          return jsonResponse({
            success: false,
            error: 'GITHUB_TOKEN secret is not configured in Cloudflare Workers settings. Please configure GITHUB_TOKEN to enable automatic GitHub Actions dispatching.'
          }, 400);
        }
        const cleanToken = String(ghToken).replace(/^(token|Bearer)\s+/i, '').replace(/^["']|["']$/g, '').trim();
        const authHeader = cleanToken.startsWith('ghp_') ? `token ${cleanToken}` : `Bearer ${cleanToken}`;
        const repo = 'sayfedin-star/pin-arbitrage-engine';
        const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/account-related-pins.yml/dispatches`, {
          method: 'POST',
          headers: {
            'User-Agent': 'Cloudflare-Worker-Pin-Arbitrage-Engine',
            'Accept': 'application/vnd.github.v3+json',
            'Authorization': authHeader,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            ref: 'main',
            inputs: {
              target_account: username,
              pin_ids: String(body.pin_ids || body.pins || '').trim(),
              max_pages_per_seed: String(body.max_pages_per_seed || '2')
            }
          })
        });

        if (res.ok || res.status === 204) {
          if (res?.body && !res.bodyUsed) await res.body.cancel().catch(() => {});
          return jsonResponse({
            success: true,
            target_account: username,
            message: `Account Related Pins Harvester workflow dispatched successfully on GitHub Actions for @${username}!`
          });
        } else {
          const errText = await res.text();
          return jsonResponse({ success: false, error: `GitHub API error (${res.status}): ${errText}` }, res.status);
        }
      }

      if (method === 'DELETE' && (pathname === '/api/competitors/snapshot' || pathname === '/api/competitors/snapshots')) {
        let snapshotId = searchParams.get('id') || searchParams.get('snapshot_id');
        if (!snapshotId) {
          try {
            const body = await request.json();
            snapshotId = body.snapshot_id || body.id;
          } catch (_) {}
        }
        if (!snapshotId) return jsonResponse({ error: 'snapshot_id is required' }, 400);
        await deleteCompetitorSnapshot(targetSql, snapshotId);
        return jsonResponse({ success: true, deleted_snapshot_id: snapshotId });
      }

      if (method === 'POST' && (pathname === '/api/competitors/status' || pathname === '/api/competitors/toggle')) {
        const body = await request.json();
        const idOrUser = body.username || body.id || body.competitor_id;
        if (!idOrUser) return jsonResponse({ error: 'id or username is required' }, 400);
        const row = await updateCompetitorStatus(targetSql, idOrUser, body.is_active);
        return jsonResponse({ success: true, competitor: row });
      }

      // 16. Keyword Velocity Tracker API
      if (method === 'GET' && pathname === '/api/keywords') {
        const keywords = await listKeywords(targetSql, {
          search: searchParams.get('search') || '',
          limit: Number(searchParams.get('limit') || 50),
          offset: Number(searchParams.get('offset') || 0)
        });
        return jsonResponse({ success: true, keywords });
      }

      if (method === 'POST' && pathname === '/api/keywords') {
        const body = await request.json().catch(() => ({}));
        const row = await addKeyword(targetSql, body);
        return jsonResponse({ success: true, keyword: row });
      }

      if (method === 'POST' && pathname === '/api/keywords/sync') {
        const body = await request.json().catch(() => ({}));
        const keywordId = Number(body.keyword_id);
        if (!keywordId) return jsonResponse({ error: 'keyword_id is required' }, 400);
        const cookie = env.PINTEREST_COOKIE || (typeof process !== 'undefined' ? process.env.PINTEREST_COOKIE : null);
        const res = await crawlKeywordSERP(targetSql, keywordId, cookie);
        return jsonResponse({ success: true, result: res });
      }

      if (method === 'DELETE' && pathname === '/api/keywords') {
        let id = searchParams.get('id');
        let keyword = searchParams.get('keyword');
        if (!id && !keyword) {
          try {
            const body = await request.json();
            id = body.id || body.keyword_id;
            keyword = body.keyword;
          } catch (_) {}
        }
        if (id && !isNaN(Number(id))) {
          await targetSql`DELETE FROM tracked_keywords WHERE id = ${Number(id)};`;
          return jsonResponse({ success: true, deleted_id: Number(id) });
        } else if (keyword) {
          const cleanKeyword = keyword.toLowerCase().trim();
          await targetSql`DELETE FROM tracked_keywords WHERE LOWER(keyword) = ${cleanKeyword};`;
          return jsonResponse({ success: true, deleted_keyword: cleanKeyword });
        }
        return jsonResponse({ error: 'id or keyword is required to delete tracked keyword' }, 400);
      }

      if (method === 'GET' && pathname === '/api/keywords/pins') {
        const keywordId = Number(searchParams.get('keyword_id'));
        if (!keywordId) return jsonResponse({ error: 'keyword_id is required' }, 400);
        const pins = await getKeywordPins(targetSql, keywordId);
        return jsonResponse({ success: true, pins });
      }

      if (method === 'GET' && pathname === '/api/keywords/typeahead') {
        const q = searchParams.get('q') || searchParams.get('term') || '';
        const result = await fetchKeywordTypeahead(q);
        return jsonResponse(result);
      }

      if (method === 'GET' && pathname === '/api/keywords/visual-search') {
        const pinId = searchParams.get('pin_id');
        if (!pinId) return jsonResponse({ error: 'pin_id is required' }, 400);
        const cookie = env.PINTEREST_COOKIE || (typeof process !== 'undefined' ? process.env.PINTEREST_COOKIE : null);
        const result = await fetchVisualSearchLens(targetSql, pinId, cookie);
        return jsonResponse(result, result.success ? 200 : 500);
      }

      if (method === 'GET' && pathname === '/api/keywords/guides') {
        const keywordId = Number(searchParams.get('keyword_id'));
        if (!keywordId) return jsonResponse({ error: 'keyword_id is required' }, 400);
        const guides = await getKeywordGuides(targetSql, keywordId);
        return jsonResponse({ success: true, guides });
      }

      if (method === 'GET' && pathname === '/api/keywords/serp-compare') {
        const keywordId = Number(searchParams.get('keyword_id'));
        if (!keywordId) return jsonResponse({ error: 'keyword_id is required' }, 400);
        const result = await getKeywordSERPComparison(targetSql, keywordId);
        return jsonResponse({ success: true, ...result });
      }

      if (method === 'POST' && pathname === '/api/keywords/dispatch-workflow') {
        const body = await request.json().catch(() => ({}));
        const targetKw = body.target_keyword || '';
        const repo = (typeof env !== 'undefined' && env?.GITHUB_REPOSITORY) || (typeof process !== 'undefined' ? process.env?.GITHUB_REPOSITORY : null) || 'sayfedin-star/pin-arbitrage-engine';
        const token = (typeof env !== 'undefined' && (env?.GITHUB_TOKEN || env?.GITHUB_PAT)) || (typeof process !== 'undefined' ? (process.env?.GITHUB_TOKEN || process.env?.GITHUB_PAT || process.env?.GH_TOKEN) : null);
        if (!token) {
          return jsonResponse({ success: false, error: 'GITHUB_TOKEN environment variable is not configured' }, 400);
        }
        const workflowUrl = `https://api.github.com/repos/${repo}/actions/workflows/keyword-intelligence-velocity.yml/dispatches`;
        let dispatchRes;
        try {
          dispatchRes = await fetch(workflowUrl, {
            method: 'POST',
            headers: {
              'Accept': 'application/vnd.github.v3+json',
              'Authorization': `Bearer ${token}`,
              'User-Agent': 'Pin-Arbitrage-Engine'
            },
            body: JSON.stringify({
              ref: 'main',
              inputs: {
                target_keyword: targetKw,
                max_pins: '50'
              }
            })
          });
          if (!dispatchRes.ok) {
            const errText = await dispatchRes.text();
            return jsonResponse({ success: false, error: `GitHub API error: ${errText}` }, dispatchRes.status);
          }
          return jsonResponse({ success: true, message: 'Workflow dispatched successfully' });
        } finally {
          if (dispatchRes?.body && !dispatchRes.bodyUsed) {
            await dispatchRes.body.cancel().catch(() => {});
          }
        }
      }

      // 17. Neon Multi-Project Fleet API
      if (method === 'GET' && pathname === '/api/fleet/projects') {
        const projects = await getFleetProjects(sql);
        return jsonResponse({ success: true, projects });
      }

      if (method === 'POST' && pathname === '/api/fleet/projects') {
        const body = await request.json().catch(() => ({}));
        const row = await registerNewProject(sql, body);
        return jsonResponse({ success: true, project: row });
      }

      if (method === 'POST' && pathname === '/api/fleet/sync') {
        const body = await request.json().catch(() => ({}));
        const targetProj = body?.project_id || searchParams.get('project_id');
        const syncRes = await syncFleetDatabases(sql, { targetProjectId: targetProj });
        return jsonResponse(syncRes);
      }

      if (method === 'POST' && pathname === '/api/fleet/ping') {
        const body = await request.json().catch(() => ({}));
        const projId = body?.project_id || searchParams.get('project_id');
        try {
          const pingRes = await pingFleetProject(sql, projId);
          return jsonResponse({ success: true, ...pingRes });
        } catch (err) {
          return jsonResponse({ success: false, error: err.message }, 500);
        }
      }

      if ((method === 'GET' || method === 'POST') && pathname === '/api/fleet/url') {
        const body = method === 'POST' ? await request.json().catch(() => ({})) : {};
        const projId = body?.project_id || searchParams.get('project_id') || searchParams.get('id');
        try {
          const urlRes = await getFleetProjectUrl(sql, projId);
          return jsonResponse({ success: true, ...urlRes });
        } catch (err) {
          return jsonResponse({ success: false, error: err.message }, 500);
        }
      }

      // 18. PinArchive & Topic Clusters API
      if (method === 'GET' && pathname === '/api/pinarchive/overview') {
        const overview = await getPinArchiveOverview(targetSql);
        return jsonResponse({ success: true, overview });
      }

      if (method === 'GET' && pathname === '/api/pinarchive/rules') {
        const rules = await getQualificationRules(targetSql);
        return jsonResponse({ success: true, rules });
      }

      if (method === 'POST' && pathname === '/api/pinarchive/rules') {
        const body = await request.json().catch(() => ({}));
        const rules = await updateQualificationRules(targetSql, body);
        return jsonResponse({ success: true, rules });
      }

      if (method === 'POST' && pathname === '/api/pinarchive/re-evaluate') {
        const body = await request.json().catch(() => ({}));
        const account = searchParams.get('account') || searchParams.get('username') || body.account_username || null;
        const audit = await reEvaluateArchivedPins(targetSql, (body && Object.keys(body).length > 0) ? body : null, account);
        return jsonResponse({ success: true, ...audit });
      }

      if (method === 'GET' && pathname === '/api/pinarchive/topics') {
        const minPins = Number(searchParams.get('min_pins') || 1);
        const search = searchParams.get('search') || '';
        const account = searchParams.get('account') || '';
        const limit = Number(searchParams.get('limit') || 50);
        const offset = Number(searchParams.get('offset') || 0);
        const topics = await getTopicClusters(targetSql, { minPins, search, account, limit, offset });
        return jsonResponse({ success: true, topics });
      }

      if (method === 'GET' && pathname === '/api/pinarchive/pins') {
        const search = searchParams.get('search') || '';
        const topic = searchParams.get('topic') || '';
        const board = searchParams.get('board') || '';
        const stage = searchParams.get('stage') || '';
        const account = searchParams.get('account') || searchParams.get('username') || '';
        const minSaves = Number(searchParams.get('min_saves') || 0);
        const maxSaves = searchParams.get('max_saves') ? Number(searchParams.get('max_saves')) : null;
        const timeframe = searchParams.get('timeframe') || '24h';
        const changedOnly = searchParams.get('changed_only') === 'true' || searchParams.get('changed_only') === '1';
        const sortBy = searchParams.get('sort') || searchParams.get('sort_by') || 'saves';
        const order = searchParams.get('order') || 'desc';
        const limit = Number(searchParams.get('limit') || 50);
        const offset = Number(searchParams.get('offset') || 0);
        const pins = await listArchivedPins(targetSql, { search, topic, board, stage, account, minSaves, maxSaves, timeframe, changedOnly, sortBy, order, limit, offset });
        return jsonResponse({ success: true, pins, total: pins.total ?? pins.length });
      }

      if (method === 'GET' && pathname === '/api/pinarchive/pin-detail') {
        const pinId = searchParams.get('pin_id') || searchParams.get('id');
        if (!pinId) return jsonResponse({ error: 'pin_id is required' }, 400);
        const refresh = searchParams.get('refresh') === 'true';
        const detail = await getPinDetailWithMetrics(targetSql, pinId, { refresh });
        if (!detail) return jsonResponse({ error: 'Pin not found' }, 404);
        return jsonResponse({ success: true, ...detail }, 200, refresh ? 0 : 60);
      }

      if (method === 'DELETE' && pathname === '/api/pinarchive/pin-snapshot') {
        const body = await request.json().catch(() => ({}));
        const snapshotId = searchParams.get('id') || searchParams.get('snapshot_id') || body.id || body.snapshot_id;
        const pinId = searchParams.get('pin_id') || body.pin_id;
        if (!snapshotId || !pinId) return jsonResponse({ error: 'snapshot_id and pin_id are required' }, 400);
        const result = await deletePinMetricSnapshot(targetSql, snapshotId, pinId);
        return jsonResponse(result);
      }

      if (method === 'POST' && pathname === '/api/pinarchive/stage') {
        const body = await request.json().catch(() => ({}));
        const pinIds = body.pin_ids || body.pinIds;
        const targetBoard = body.target_board || body.targetBoard || '';
        const overrideLink = body.override_link || body.overrideLink || '';
        if (!pinIds || !pinIds.length) return jsonResponse({ error: 'pin_ids are required' }, 400);
        const result = await stagePinsForRepurpose(targetSql, { pinIds, targetBoard, overrideLink });
        return jsonResponse({ success: true, ...result });
      }

      if (method === 'GET' && pathname === '/api/pinarchive/staged') {
        const status = searchParams.get('status') || 'staged';
        const limit = Number(searchParams.get('limit') || 50);
        const offset = Number(searchParams.get('offset') || 0);
        const items = await listStagedPins(targetSql, { status, limit, offset });
        return jsonResponse({ success: true, staged: items, items });
      }

      if (method === 'POST' && pathname === '/api/pinarchive/claim-cas') {
        const body = await request.json().catch(() => ({}));
        const stagedId = body.staged_id || body.id || body.pin_id;
        if (!stagedId) return jsonResponse({ error: 'staged_id or pin_id is required' }, 400);
        const result = await claimStagedPinCas(targetSql, stagedId);
        if (!result.success) {
          return jsonResponse({ success: false, error: 'CAS Conflict: pin already dispatched or not in staged status' }, 409);
        }
        return jsonResponse({ success: true, ...result });
      }

      if (method === 'DELETE' && (pathname === '/api/pinarchive/staged' || pathname === '/api/pinarchive/cancel-staged')) {
        const body = await request.json().catch(() => ({}));
        const stagedId = searchParams.get('id') || searchParams.get('staged_id') || body.staged_id || body.id || body.pin_id;
        if (!stagedId) return jsonResponse({ error: 'staged_id or pin_id is required' }, 400);
        const result = await cancelStagedPin(targetSql, stagedId);
        if (!result.success) {
          return jsonResponse({ success: false, error: 'Staged pin not found or already dispatched/cancelled', ...result }, 404);
        }
        return jsonResponse({ success: true, ...result });
      }

      // Default 404
      return jsonResponse({ error: 'Endpoint not found', path: pathname }, 404);
    } catch (err) {
      return jsonResponse({ error: 'Internal Server Error', message: err.message }, 500);
    }
  },

  /**
   * Cloudflare Worker Scheduled Cron Handler
   * 100% reliant on GitHub Actions (20-Shard Parallel Matrix) for harvesting.
   * Dispatches crawler-pipeline.yml on GitHub Actions rather than harvesting on Worker.
   */
  async scheduled(event, env, ctx) {
    const githubToken = env.GITHUB_TOKEN || env.GITHUB_PAT;
    const repo = env.GITHUB_REPOSITORY || 'sayfedin-star/pin-arbitrage-engine';

    if (githubToken) {
      console.log(`[Worker Cron] Delegating scheduled crawl to GitHub Actions 20-shard pipeline (${repo})...`);
      try {
        const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/crawler-pipeline.yml/dispatches`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${githubToken}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'Pin-Arbitrage-Engine-EdgeWorker'
          },
          body: JSON.stringify({
            ref: 'main',
            inputs: {
              crawl_mode: 'refresh',
              max_pages: '3'
            }
          })
        });
        if (res.ok) {
          if (res?.body && !res.bodyUsed) await res.body.cancel().catch(() => {});
          console.log('[Worker Cron] Successfully dispatched crawler-pipeline.yml to GitHub Actions.');
        } else {
          const errText = await res.text();
          console.warn(`[Worker Cron] GitHub Actions dispatch returned ${res.status}: ${errText}`);
        }
      } catch (err) {
        console.error('[Worker Cron] GitHub dispatch error:', err.message);
      }
    } else {
      console.log('[Worker Cron] Automated crawl delegated 100% to GitHub Actions native daily cron schedule (.github/workflows/crawler-pipeline.yml)');
    }
  }
};
