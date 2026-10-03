#!/usr/bin/env node

/**
 * Pinterest Algorithmic Arbitrage Engine (V3 Dedicated Per-Seed & Intersections Architecture)
 * Pin Cluster Analyzer & Predictive Engine
 *
 * Runs on port 3456 (or process.env.PORT)
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { URL } from 'node:url';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { neon } from '@neondatabase/serverless';
import { parsePinCandidate, formatPinterestCookie } from './cluster-intelligence.mjs';
import { getDashboardHtml } from '../src/dashboard-ui.mjs';
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
  listCompetitorAccountPins
} from '../src/modules/competitors/service.mjs';
import { listKeywords, addKeyword, crawlKeywordSERP, getKeywordPins } from '../src/modules/keywords/service.mjs';
import { getFleetProjects, registerNewProject, getFleetCompetitors, syncProjectCompetitorStats } from '../src/modules/fleet/service.mjs';
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
  reEvaluateArchivedPins
} from '../src/modules/pinarchive/service.mjs';

const execFileAsync = promisify(execFile);

// Load .env automatically if present
if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile();
  } catch (err) {}
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[-] CRITICAL: DATABASE_URL environment variable is missing.');
  process.exit(1);
}

const sql = neon(DATABASE_URL);
const PORT = Number(process.env.PORT || 3456);

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

// In-memory crawl status tracker
let crawlState = {
  is_crawling: false,
  seed_pin_id: null,
  started_at: null,
  completed_at: null,
  last_log: null,
  error: null
};

// Spawn cluster-intelligence crawler asynchronously in background
function triggerCrawlProcess(seedPinId = null) {
  if (crawlState.is_crawling) {
    return { already_running: true };
  }

  // Dynamically reload .env to ensure fresh PINTEREST_COOKIE or credentials are used
  if (typeof process.loadEnvFile === 'function') {
    try {
      process.loadEnvFile();
    } catch (err) {}
  }

  let targetArg = null;
  if (Array.isArray(seedPinId)) {
    targetArg = seedPinId.map(s => String(s).trim()).filter(Boolean).join(',');
  } else if (seedPinId) {
    targetArg = String(seedPinId).trim();
  }

  crawlState.is_crawling = true;
  crawlState.seed_pin_id = targetArg || 'all_queued';
  crawlState.started_at = new Date().toISOString();
  crawlState.completed_at = null;
  crawlState.last_log = 'Crawler process initiated...';
  crawlState.error = null;

  const args = ['--use-system-ca', 'scripts/cluster-intelligence.mjs'];
  if (targetArg) {
    args.push(targetArg);
  }

  console.log(`[*] Spawning crawler background job: node ${args.join(' ')}`);

  const child = spawn(process.execPath, args, {
    cwd: process.cwd(),
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  child.stdout.on('data', (data) => {
    const line = data.toString().trim();
    if (line) {
      crawlState.last_log = line.split('\n').pop();
      console.log(`[Crawler] ${line}`);
    }
  });

  child.stderr.on('data', (data) => {
    console.error(`[Crawler Error] ${data.toString().trim()}`);
  });

  child.on('close', (code) => {
    crawlState.is_crawling = false;
    crawlState.completed_at = new Date().toISOString();
    if (code === 0) {
      crawlState.last_log = 'Crawl completed successfully.';
      console.log(`[+] Crawler job completed with exit code 0.`);
    } else {
      crawlState.error = `Crawler exited with code ${code}`;
      crawlState.last_log = `Crawler exited with error code ${code}`;
      console.error(`[-] Crawler job failed with exit code ${code}.`);
    }
  });

  child.on('error', (err) => {
    crawlState.is_crawling = false;
    crawlState.error = err.message;
    crawlState.last_log = `Crawler failed to start: ${err.message}`;
    console.error(`[-] Crawler spawn error:`, err);
  });

  return { success: true, seed_pin_id: crawlState.seed_pin_id };
}

// GitHub Actions Workflow helpers (Dual-Engine: gh CLI with direct GitHub REST API fallback)
async function getWorkflowRuns(limit = 10) {
  try {
    const { stdout } = await execFileAsync('gh', [
      'run', 'list',
      '--workflow=cluster-intelligence.yml',
      `--limit=${limit}`,
      '--json', 'databaseId,status,conclusion,createdAt,url,event,displayTitle,headBranch'
    ]);
    return JSON.parse(stdout);
  } catch (err) {
    // Graceful fallback to direct GitHub REST API using environment token
    const ghToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || process.env.GH_REFRESH_TOKEN;
    const repo = 'sayfedin-star/pin-arbitrage-engine';
    try {
      const headers = {
        'User-Agent': 'Local-Dashboard-Pin-Arbitrage-Engine',
        'Accept': 'application/vnd.github.v3+json'
      };
      if (ghToken) {
        const cleanToken = String(ghToken).replace(/^(token|Bearer)\s+/i, '').replace(/^["']|["']$/g, '').trim();
        headers['Authorization'] = cleanToken.startsWith('ghp_') ? `token ${cleanToken}` : `Bearer ${cleanToken}`;
      }
      const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/cluster-intelligence.yml/runs?per_page=${limit}`, { headers });
      if (res.ok) {
        const data = await res.json();
        return (data.workflow_runs || []).map(r => ({
          databaseId: r.id,
          status: r.status,
          conclusion: r.conclusion,
          createdAt: r.created_at,
          url: r.html_url,
          event: r.event,
          displayTitle: r.display_title || r.name,
          headBranch: r.head_branch
        }));
      }
    } catch (apiErr) {}
    console.warn('[!] Failed to fetch workflow runs via gh CLI & API:', err.message);
    return [];
  }
}

async function triggerWorkflowDispatch(seedPinId = '', maxPages = '60') {
  try {
    const args = ['workflow', 'run', 'cluster-intelligence.yml'];
    if (seedPinId && String(seedPinId).trim()) {
      args.push('-f', `seed_pin_id=${String(seedPinId).trim()}`);
    }
    if (maxPages) {
      args.push('-f', `max_pages=${String(maxPages).trim()}`);
    }
    console.log(`[*] Triggering GitHub Actions workflow via gh CLI: gh ${args.join(' ')}`);
    const { stdout, stderr } = await execFileAsync('gh', args);
    return { success: true, output: (stdout || stderr || '').trim() || 'Workflow dispatched via gh CLI' };
  } catch (ghErr) {
    console.warn(`[*] gh CLI unavailable (${ghErr.message}). Falling back to GitHub REST API...`);
    const ghToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || process.env.GH_REFRESH_TOKEN;
    if (!ghToken) {
      throw new Error('Neither gh CLI nor GitHub Token (GITHUB_TOKEN / GH_REFRESH_TOKEN in .env) are available for workflow dispatch.');
    }
    const cleanToken = String(ghToken).replace(/^(token|Bearer)\s+/i, '').replace(/^["']|["']$/g, '').trim();
    const authHeader = cleanToken.startsWith('ghp_') ? `token ${cleanToken}` : `Bearer ${cleanToken}`;
    const repo = 'sayfedin-star/pin-arbitrage-engine';

    const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/cluster-intelligence.yml/dispatches`, {
      method: 'POST',
      headers: {
        'User-Agent': 'Local-Dashboard-Pin-Arbitrage-Engine',
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ref: 'main',
        inputs: {
          seed_pin_id: String(seedPinId || '').trim(),
          max_pages: String(maxPages || '60').trim()
        }
      })
    });

    if (res.ok || res.status === 204) {
      return { success: true, output: 'Workflow dispatched successfully via direct GitHub REST API' };
    } else {
      const errText = await res.text();
      throw new Error(`GitHub API error (${res.status}): ${errText}`);
    }
  }
}

async function triggerCrawlerWorkflowDispatch(targetAccount = '', crawlMode = 'discovery', maxPages = '500') {
  const cleanAccount = String(targetAccount || '').replace(/^@+/, '').trim();
  try {
    const args = ['workflow', 'run', 'crawler-pipeline.yml'];
    if (cleanAccount) {
      args.push('-f', `target_account=${cleanAccount}`);
    }
    if (crawlMode) {
      args.push('-f', `crawl_mode=${crawlMode}`);
    }
    if (maxPages) {
      args.push('-f', `max_pages=${String(maxPages).trim()}`);
    }
    console.log(`[*] Triggering 20-shard crawler workflow via gh CLI: gh ${args.join(' ')}`);
    const { stdout, stderr } = await execFileAsync('gh', args);
    return { success: true, output: (stdout || stderr || '').trim() || 'Crawler pipeline dispatched via gh CLI' };
  } catch (ghErr) {
    console.warn(`[*] gh CLI unavailable (${ghErr.message}). Falling back to GitHub REST API...`);
    const ghToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || process.env.GH_REFRESH_TOKEN;
    if (!ghToken) {
      throw new Error('Neither gh CLI nor GitHub Token (GITHUB_TOKEN / GH_REFRESH_TOKEN in .env) are available for workflow dispatch.');
    }
    const cleanToken = String(ghToken).replace(/^(token|Bearer)\s+/i, '').replace(/^["']|["']$/g, '').trim();
    const authHeader = cleanToken.startsWith('ghp_') ? `token ${cleanToken}` : `Bearer ${cleanToken}`;
    const repo = 'sayfedin-star/pin-arbitrage-engine';

    const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/crawler-pipeline.yml/dispatches`, {
      method: 'POST',
      headers: {
        'User-Agent': 'Local-Dashboard-Pin-Arbitrage-Engine',
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ref: 'main',
        inputs: {
          target_account: cleanAccount,
          crawl_mode: crawlMode,
          max_pages: String(maxPages || '500').trim()
        }
      })
    });

    if (!res.ok && res.status !== 204) {
      const errText = await res.text();
      throw new Error(`GitHub API error (${res.status}): ${errText}`);
    }
    return { success: true, output: `Crawler pipeline dispatched via GitHub API for @${cleanAccount}` };
  }
}

// Helper to send JSON response
function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

// Parse request body for POST
function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1e6) {
        req.socket.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        const parsed = body ? JSON.parse(body) : {};
        resolve(parsed);
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

// Alias for backwards compatibility across endpoints
const parseJsonBody = parseRequestBody;

// getDashboardHtml is imported from ../src/dashboard-ui.mjs

// HTTP Server
const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;
  const method = req.method;
  const searchParams = parsedUrl.searchParams;

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  try {
    let targetSql = sql;
    const reqProjectId = parsedUrl.searchParams.get('project_id') || parsedUrl.searchParams.get('shard') || req.headers['x-target-project'];
    if (reqProjectId && reqProjectId !== 'all' && reqProjectId !== 'hub') {
      try {
        const [proj] = await sql`
          SELECT database_url FROM neon_projects_registry 
          WHERE (project_id = ${reqProjectId} OR project_name = ${reqProjectId}) AND status = 'active' 
          LIMIT 1;
        `;
        if (proj && proj.database_url) {
          targetSql = neon(proj.database_url);
        }
      } catch (_) {}
    }

    // 1. POST /api/crawl
    if (method === 'POST' && pathname === '/api/crawl') {
      const body = await parseRequestBody(req);
      let target = null;
      if (Array.isArray(body.seed_pin_ids) && body.seed_pin_ids.length > 0) {
        target = body.seed_pin_ids;
      } else if (body.seed_pin_id) {
        target = String(body.seed_pin_id).trim();
      }

      const triggerResult = triggerCrawlProcess(target);
      return sendJson(res, 200, {
        status: 'crawling_started',
        seed_pin_id: crawlState.seed_pin_id,
        ...triggerResult
      });
    }

    // 1B. GET /api/workflow/runs
    if (method === 'GET' && pathname === '/api/workflow/runs') {
      const limit = Number(parsedUrl.searchParams.get('limit')) || 10;
      const runs = await getWorkflowRuns(limit);
      return sendJson(res, 200, runs);
    }

    // 1C. POST /api/workflow/trigger
    if (method === 'POST' && pathname === '/api/workflow/trigger') {
      const body = await parseRequestBody(req);
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
      try {
        const dispatchRes = await triggerWorkflowDispatch(target, maxPages);
        return sendJson(res, 200, {
          success: true,
          seed_pin_id: target || 'all_queued',
          max_pages: maxPages,
          ...dispatchRes
        });
      } catch (err) {
        return sendJson(res, 500, {
          success: false,
          error: err.message
        });
      }
    }

    // 2. GET /api/crawl-status
    if (method === 'GET' && pathname === '/api/crawl-status') {
      return sendJson(res, 200, crawlState);
    }

    // 3. GET /api/candidates (Dedicated per-seed and explorer query, uncapped, velocity & save sorting)
    if (method === 'GET' && pathname === '/api/candidates') {
      const seedPinId = parsedUrl.searchParams.get('seed_pin_id');
      const limit = Number(parsedUrl.searchParams.get('limit')) || 1000;
      const offset = Number(parsedUrl.searchParams.get('offset')) || 0;
      const query = (parsedUrl.searchParams.get('q') || '').trim();
      const sort = (parsedUrl.searchParams.get('sort') || 'saves').toLowerCase();

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
          ORDER BY saves DESC
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
          ORDER BY saves DESC
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
          ORDER BY saves DESC
          LIMIT ${limit} OFFSET ${offset};
        `;
      } else {
        rows = sort === 'velocity' ? await targetSql`
          SELECT * FROM candidate_graph_nodes
          ORDER BY daily_velocity DESC NULLS LAST, saves DESC
          LIMIT ${limit} OFFSET ${offset};
        ` : await targetSql`
          SELECT * FROM candidate_graph_nodes
          ORDER BY saves DESC
          LIMIT ${limit} OFFSET ${offset};
        `;
      }

      const formatAge = (days) => {
        const d = Number(days || 1);
        if (d < 30) return `${d}d ago`;
        if (d < 365) return `${Math.floor(d / 30)}mo ago`;
        return `${(d / 365).toFixed(1)}y ago`;
      };

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

      return sendJson(res, 200, enriched);
    }

    // 3.5 GET /api/recgpt-playbook (Authentic Database-Backed RecGPT Trajectory Cards)
    if (method === 'GET' && pathname === '/api/recgpt-playbook') {
      const seedPinId = parsedUrl.searchParams.get('seed_pin_id');

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

        // Seed-scoped fallbacks: never cross into another seed!
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

      return sendJson(res, 200, {
        seed_pin_id: seedPinId,
        dinner_anchor: formatCard(dinnerAnchor, 'Slow Cooker Garlic Herb Butter Chicken & Red Potatoes', 'DINNER_ANCHOR', '15m'),
        navboost_co_visitor: formatCard(navboostSide, 'Cast Iron Skillet Garlic Cheddar Honey Biscuits', 'NAVBOOST_CO_VISITOR', '20m'),
        session_finisher: formatCard(sessionFinisher, 'Warm Skillet Salted Caramel Chocolate Chip Cookie with Vanilla Ice Cream', 'SESSION_FINISHER', '10m')
      });
    }

    // 4. GET /api/cluster-telemetry
    if (method === 'GET' && pathname === '/api/cluster-telemetry') {
      let seedPinId = parsedUrl.searchParams.get('seed_pin_id');

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
        return sendJson(res, 200, {
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

      return sendJson(res, 200, {
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
        product_count: productCount,
        product_pct: calcPct(productCount),
        total_engine_quota: totalEngineQuota,
        extracted_count: extractedCount,
        commercial_gap_ratio: Number(m.commercial_gap_ratio || 0),
        color_centroids: m.winning_color_centroids || [],
        high_save_tokens: m.high_save_tokens || [],
        utility_snapshot: m.utility_snapshot || null
      });
    }

    // 5. GET /api/overview
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

      return sendJson(res, 200, {
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

    // 6. GET /api/intersections (Uncapped, includes originating seed details)
    if (method === 'GET' && pathname === '/api/intersections') {
      const minOverlap = Number(parsedUrl.searchParams.get('min_overlap')) || 2;
      const limit = Number(parsedUrl.searchParams.get('limit')) || 1000;

      // Get seeds map for labels
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

      // Imbrišak & Tisanić (2026): Compute cluster-wide mean coupling for relative threshold
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
        const overlap = Number(r.seed_overlap_count || 1);
        const saves = Number(r.total_saves || 0);

        // Zero Speculation: Use authentic engine provenance from DB instead of arbitrary heuristics
        const engine = r.provenance_engine || 'P2P_TWO_TOWER';

        // Self-calibrated coupling coefficient rho_ij = W_ij / sqrt(s_i * s_j)
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

      return sendJson(res, 200, enrichedRows);
    }

    // 7. GET /api/seeds
    if (method === 'GET' && pathname === '/api/seeds') {
      const seeds = await targetSql`
        SELECT 
            s.pin_id,
            s.label,
            s.is_competitor,
            s.velocity,
            s.last_crawled_at,
            s.created_at,
            COALESCE(c_count.count, 0) AS total_candidates,
            COALESCE(c_count.count, 0) AS candidate_count,
            COALESCE(cap_count.count, 0) AS total_capsules,
            COALESCE(cap_count.count, 0) AS capsule_count,
            m.product_count,
            m.commercial_gap_ratio,
            m.winning_color_centroids,
            m.high_save_tokens,
            m.recgpt_count,
            m.navboost_count,
            m.randomwalk_count,
            m.two_tower_count,
            m.fresh_candidate_count,
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
      return sendJson(res, 200, seeds);
    }

    // 8. POST /api/seeds
    if (method === 'POST' && pathname === '/api/seeds') {
      const body = await parseRequestBody(req);
      const pinId = String(body.pin_id || '').trim();
      const label = String(body.label || 'Manual Tracked Seed').trim();
      const isCompetitor = Boolean(body.is_competitor ?? true);

      if (!pinId) {
        return sendJson(res, 400, { error: 'pin_id is required' });
      }

      const result = await targetSql`
        INSERT INTO cluster_seeds (pin_id, label, is_competitor, created_at)
        VALUES (${pinId}, ${label}, ${isCompetitor}, NOW())
        ON CONFLICT (pin_id) DO UPDATE SET
            label = EXCLUDED.label,
            is_competitor = EXCLUDED.is_competitor
        RETURNING pin_id, label, is_competitor, last_crawled_at;
      `;

      return sendJson(res, 201, { success: true, seed: result[0] });
    }

    // 8B. POST /api/seeds/bulk (Bulk Pin Insertion)
    if (method === 'POST' && pathname === '/api/seeds/bulk') {
      const body = await parseRequestBody(req);
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
        return sendJson(res, 400, { error: 'No valid numeric pin IDs provided in payload' });
      }

      const inserted = (await Promise.all(rawSeeds.map(s => targetSql`
        INSERT INTO cluster_seeds (pin_id, label, is_competitor, created_at)
        VALUES (${s.pin_id}, ${s.label}, ${s.is_competitor}, NOW())
        ON CONFLICT (pin_id) DO UPDATE SET
          label = EXCLUDED.label,
          is_competitor = EXCLUDED.is_competitor
        RETURNING pin_id, label, is_competitor, last_crawled_at;
      `))).flat();

      return sendJson(res, 201, { success: true, count: inserted.length, seeds: inserted });
    }

    // 8C. POST /api/seeds/bulk-delete (Bulk Selection Deletion & Neon DB Purge)
    if (method === 'POST' && pathname === '/api/seeds/bulk-delete') {
      const body = await parseRequestBody(req);
      const pinIds = Array.isArray(body.pin_ids) ? body.pin_ids.map(p => String(p).trim()).filter(Boolean) : [];
      const purgeDatabase = Boolean(body.purge_database ?? true);

      if (pinIds.length === 0) {
        return sendJson(res, 400, { error: 'pin_ids array is required' });
      }

      if (purgeDatabase) {
        await Promise.all([
          targetSql`DELETE FROM candidate_graph_nodes WHERE seed_pin_id = ANY(${pinIds});`,
          targetSql`DELETE FROM seed_guided_search_capsules WHERE seed_pin_id = ANY(${pinIds});`,
          targetSql`DELETE FROM cluster_arbitrage_metrics WHERE seed_pin_id = ANY(${pinIds});`
        ]);
      }
      await targetSql`DELETE FROM cluster_seeds WHERE pin_id = ANY(${pinIds});`;

      return sendJson(res, 200, {
        success: true,
        deleted_count: pinIds.length,
        purged_database: purgeDatabase,
        deleted_pin_ids: pinIds
      });
    }

    // 8D. DELETE /api/seeds (Single Seed Deletion with optional Neon DB Purge)
    if (method === 'DELETE' && pathname === '/api/seeds') {
      const pinId = parsedUrl.searchParams.get('pin_id');
      const purgeData = parsedUrl.searchParams.get('purge_data') === 'true' || parsedUrl.searchParams.get('purge_database') === 'true';
      if (!pinId) {
        return sendJson(res, 400, { error: 'pin_id query parameter is required' });
      }
      if (purgeData) {
        await Promise.all([
          targetSql`DELETE FROM candidate_graph_nodes WHERE seed_pin_id = ${pinId};`,
          targetSql`DELETE FROM seed_guided_search_capsules WHERE seed_pin_id = ${pinId};`,
          targetSql`DELETE FROM cluster_arbitrage_metrics WHERE seed_pin_id = ${pinId};`
        ]);
      }
      await targetSql`DELETE FROM cluster_seeds WHERE pin_id = ${pinId};`;
      return sendJson(res, 200, { success: true, deleted_pin_id: pinId, purged_database: purgeData });
    }

    // 8E. POST /api/candidates/delete (Delete specific candidates from database)
    if (method === 'POST' && pathname === '/api/candidates/delete') {
      const body = await parseRequestBody(req);
      const candIds = Array.isArray(body.candidate_pin_ids) ? body.candidate_pin_ids.map(c => String(c).trim()).filter(Boolean) : [];
      const seedPinId = body.seed_pin_id ? String(body.seed_pin_id).trim() : null;

      if (candIds.length === 0) {
        return sendJson(res, 400, { error: 'candidate_pin_ids array is required' });
      }

      if (seedPinId) {
        await targetSql`
          DELETE FROM candidate_graph_nodes 
          WHERE candidate_pin_id = ANY(${candIds}) AND seed_pin_id = ${seedPinId};
        `;
      } else {
        await targetSql`
          DELETE FROM candidate_graph_nodes 
          WHERE candidate_pin_id = ANY(${candIds});
        `;
      }

      return sendJson(res, 200, { success: true, deleted_count: candIds.length });
    }

    // 8C. GET /api/guided-search
    if (method === 'GET' && pathname === '/api/guided-search') {
      const seedPinId = parsedUrl.searchParams.get('seed_pin_id');
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
      return sendJson(res, 200, rows);
    }

    // 8D. GET /api/settings/cookie
    if (method === 'GET' && pathname === '/api/settings/cookie') {
      const cookie = process.env.PINTEREST_COOKIE || '';
      return sendJson(res, 200, {
        has_cookie: Boolean(cookie && cookie.trim().length > 10),
        preview: cookie ? (cookie.slice(0, 30) + '...') : null
      });
    }

    // Helper to extract multiple or concatenated JSON objects from raw string
    function parseMultiJson(rawText) {
      if (!rawText || typeof rawText !== 'string') return [];
      const results = [];
      let idx = 0;
      while (idx < rawText.length) {
        const start = rawText.indexOf('{', idx);
        if (start === -1) break;
        let depth = 0;
        let inString = false;
        let escape = false;
        let end = -1;
        for (let i = start; i < rawText.length; i++) {
          const ch = rawText[i];
          if (escape) {
            escape = false;
            continue;
          }
          if (ch === '\\') {
            escape = true;
            continue;
          }
          if (ch === '"') {
            inString = !inString;
            continue;
          }
          if (inString) continue;

          if (ch === '{') {
            depth++;
          } else if (ch === '}') {
            depth--;
            if (depth === 0) {
              end = i;
              break;
            }
          }
        }
        if (end !== -1) {
          const candidate = rawText.slice(start, end + 1);
          try {
            const parsed = JSON.parse(candidate);
            results.push(parsed);
          } catch (e) {}
          idx = end + 1;
        } else {
          break;
        }
      }
      return results;
    }

    // 8E. POST /api/settings/cookie
    if (method === 'POST' && pathname === '/api/settings/cookie') {
      const body = await parseRequestBody(req);
      const rawCookieVal = String(body.cookie || '').trim();
      const cookieVal = formatPinterestCookie(rawCookieVal);
      process.env.PINTEREST_COOKIE = cookieVal;

      // Persist to .env file
      const envPath = path.join(process.cwd(), '.env');
      let envContent = '';
      if (fs.existsSync(envPath)) {
        envContent = fs.readFileSync(envPath, 'utf-8');
      }
      if (envContent.includes('PINTEREST_COOKIE=')) {
        envContent = envContent.replace(/PINTEREST_COOKIE=.*(\r?\n|$)/, `PINTEREST_COOKIE=${cookieVal}$1`);
      } else {
        envContent += `\nPINTEREST_COOKIE=${cookieVal}\n`;
      }
      fs.writeFileSync(envPath, envContent, 'utf-8');

      return sendJson(res, 200, {
        success: true,
        has_cookie: Boolean(cookieVal && cookieVal.length > 10),
        preview: cookieVal ? (cookieVal.slice(0, 35) + '...') : null
      });
    }

    // 8F. POST /api/seeds/import-raw-json
    if (method === 'POST' && pathname === '/api/seeds/import-raw-json') {
      const body = await parseRequestBody(req);
      const seedPinId = String(body.seed_pin_id || '').trim();
      let rawJson = body.raw_json;

      if (!seedPinId) {
        return sendJson(res, 400, { error: 'seed_pin_id is required' });
      }

      let parsedBlocks = [];
      if (typeof rawJson === 'string') {
        try {
          parsedBlocks = [JSON.parse(rawJson)];
        } catch (err) {
          // If direct single JSON parse fails, attempt multi-block extraction
          parsedBlocks = parseMultiJson(rawJson);
          if (parsedBlocks.length === 0) {
            return sendJson(res, 400, { error: 'Invalid JSON payload: ' + err.message });
          }
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
        return sendJson(res, 400, { error: 'No data items found in JSON (expected resource_response.data array)' });
      }

      // 1. Check for candidate_counts & utility_config
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

      // 2. Extract Guided Search Capsules (BUBBLE_ONE_COL / explorearticle)
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

      // Save capsules
      for (const cap of capturedCapsules) {
        await targetSql`
          INSERT INTO seed_guided_search_capsules (
            seed_pin_id, query_term, normalized_query, image_url, search_url, node_id, discovered_at
          ) VALUES (
            ${cap.seed_pin_id}, ${cap.query_term}, ${cap.normalized_query}, ${cap.image_url}, ${cap.search_url}, ${cap.node_id}, NOW()
          )
          ON CONFLICT (seed_pin_id, normalized_query) DO UPDATE
          SET image_url = EXCLUDED.image_url, search_url = EXCLUDED.search_url, node_id = EXCLUDED.node_id;
        `;
      }

      // 3. Extract Candidates
      const parsedCandidates = [];
      for (const item of items) {
        const list = [];
        if (item.type === 'pin' || item.images || item.story_pin_data) list.push(item);
        if (Array.isArray(item.pins)) list.push(...item.pins);
        if (Array.isArray(item.objects)) list.push(...item.objects.filter(o => o.type === 'pin' || o.images));
        
        for (const p of list) {
          const parsed = parsePinCandidate(p, seedPinId, item, utilityWeights, 'GENERAL');
          if (parsed) parsedCandidates.push(parsed);
        }
      }

      // Save candidates
      for (const node of parsedCandidates) {
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
          ) VALUES (
            ${node.seed_pin_id}, ${node.candidate_pin_id}, ${node.title},
            ${node.dominant_color}, ${node.aspect_ratio}, ${node.saves},
            ${node.repins}, ${node.save_rate}, ${node.domain},
            ${node.is_product}, ${node.ocr_text}, NOW(),
            ${node.pin_created_at}, ${node.age_days}, ${node.daily_velocity},
            ${node.provenance_engine}, ${node.individual_prod_score},
            ${node.recgpt_transition_score}, ${node.sequence_role},
            ${node.is_recgpt_candidate}, ${node.visual_entropy_score},
            ${node.image_url}, ${node.is_video}, 'RAW_PAYLOAD_DIRECT_IMPORT'
          )
          ON CONFLICT (seed_pin_id, candidate_pin_id) DO UPDATE SET
            title = EXCLUDED.title,
            dominant_color = EXCLUDED.dominant_color,
            aspect_ratio = EXCLUDED.aspect_ratio,
            saves = EXCLUDED.saves,
            repins = EXCLUDED.repins,
            save_rate = EXCLUDED.save_rate,
            domain = EXCLUDED.domain,
            is_product = EXCLUDED.is_product,
            ocr_text = EXCLUDED.ocr_text,
            extracted_at = NOW(),
            provenance_engine = EXCLUDED.provenance_engine,
            individual_prod_score = EXCLUDED.individual_prod_score,
            recgpt_transition_score = EXCLUDED.recgpt_transition_score,
            sequence_role = EXCLUDED.sequence_role,
            image_url = EXCLUDED.image_url,
            is_video = EXCLUDED.is_video,
            ingestion_method = EXCLUDED.ingestion_method;
        `;
      }

      // Update metrics if authoritative counts present
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
        } else {
          await targetSql`
            INSERT INTO cluster_arbitrage_metrics (
              seed_pin_id, total_candidates, recgpt_count, navboost_count,
              randomwalk_count, two_tower_count, fresh_candidate_count, product_count,
              commercial_gap_ratio, analyzed_at
            ) VALUES (
              ${seedPinId}, ${parsedCandidates.length},
              ${authoritativeCounts.recgpt}, ${authoritativeCounts.navboost},
              ${authoritativeCounts.randomwalk}, ${authoritativeCounts.two_tower},
              ${authoritativeCounts.fresh}, 0, 0, NOW()
            );
          `;
        }

        await targetSql`
          UPDATE cluster_seeds
          SET last_crawled_at = NOW()
          WHERE pin_id = ${seedPinId};
        `;
      }

      return sendJson(res, 200, {
        success: true,
        candidates_imported: parsedCandidates.length,
        capsules_imported: capturedCapsules.length,
        authoritative_counts: authoritativeCounts
      });
    }

    // Competitor Intelligence API
    if (method === 'GET' && pathname === '/api/competitors') {
      const isFleetAll = (!reqProjectId || reqProjectId === 'all');
      if (isFleetAll) {
        const fleetData = await getFleetCompetitors(sql, {
          account_type: searchParams.get('account_type') || 'all',
          search: searchParams.get('search') || '',
          limit: Number(searchParams.get('limit') || 50),
          offset: Number(searchParams.get('offset') || 0)
        });
        return sendJson(res, 200, { success: true, ...fleetData });
      }

      const overview = await getCompetitorsOverview(targetSql);
      const competitors = await listCompetitors(targetSql, {
        account_type: searchParams.get('account_type') || 'all',
        search: searchParams.get('search') || '',
        limit: Number(searchParams.get('limit') || 50),
        offset: Number(searchParams.get('offset') || 0)
      });
      return sendJson(res, 200, { success: true, overview, competitors });
    }

    if (method === 'POST' && pathname === '/api/competitors') {
      const body = await parseJsonBody(req);
      const row = await trackCompetitor(targetSql, body);
      await syncProjectCompetitorStats(sql, targetSql, reqProjectId);
      return sendJson(res, 200, { success: true, competitor: row });
    }

    if (method === 'POST' && pathname === '/api/competitors/sync') {
      const body = await parseJsonBody(req);
      const username = body.username;
      if (!username) return sendJson(res, 400, { error: 'username is required' });
      const updated = await syncCompetitorProfile(targetSql, username, process.env.PINTEREST_COOKIE);
      await syncProjectCompetitorStats(sql, targetSql, reqProjectId);
      return sendJson(res, 200, { success: true, profile: updated });
    }

    if (method === 'DELETE' && pathname === '/api/competitors') {
      let id = searchParams.get('id');
      let username = searchParams.get('username');
      if (!id && !username) {
        try {
          const body = await parseJsonBody(req);
          id = body.id || body.competitor_id;
          username = body.username;
        } catch (_) {}
      }
      if (id && !isNaN(Number(id))) {
        await targetSql`DELETE FROM competitor_profiles WHERE id = ${Number(id)};`;
        await syncProjectCompetitorStats(sql, targetSql, reqProjectId);
        return sendJson(res, 200, { success: true, deleted_id: Number(id) });
      } else if (username) {
        const cleanUser = String(username).replace(/^@/, '').trim().toLowerCase();
        await targetSql`DELETE FROM competitor_profiles WHERE LOWER(username) = ${cleanUser};`;
        await syncProjectCompetitorStats(sql, targetSql, reqProjectId);
        return sendJson(res, 200, { success: true, deleted_username: cleanUser });
      }
      return sendJson(res, 400, { error: 'id or username is required to delete competitor' });
    }

    if (method === 'GET' && pathname === '/api/competitors/boards') {
      const competitorId = searchParams.get('competitor_id');
      if (!competitorId) return sendJson(res, 400, { error: 'competitor_id is required' });
      const boards = await getCompetitorBoards(targetSql, competitorId);
      return sendJson(res, 200, { success: true, boards });
    }

    if (method === 'POST' && pathname === '/api/competitors/sync-boards') {
      const body = await parseJsonBody(req);
      const { competitor_id, username } = body;
      if (!competitor_id && !username) return sendJson(res, 400, { error: 'competitor_id or username is required' });
      const result = await syncCompetitorBoards(targetSql, competitor_id, username, process.env.PINTEREST_COOKIE);
      if (!result.ok) return sendJson(res, 400, { success: false, ...result });
      return sendJson(res, 200, { success: true, ...result });
    }

    if (method === 'POST' && pathname === '/api/competitors/sync-pins') {
      const body = await parseJsonBody(req);
      const { competitor_id, username, mode, max_pages } = body;
      if (!username && !competitor_id) return sendJson(res, 400, { error: 'username or competitor_id is required' });
      const result = await syncCompetitorPins(targetSql, competitor_id, username, { 
        mode, 
        maxPages: max_pages, 
        cookie: process.env.PINTEREST_COOKIE 
      });
      if (!result.ok) return sendJson(res, 400, { success: false, ...result });
      return sendJson(res, 200, { success: true, ...result });
    }

    if (method === 'GET' && pathname === '/api/competitors/detail') {
      const idOrUser = searchParams.get('id') || searchParams.get('username') || searchParams.get('account');
      if (!idOrUser) return sendJson(res, 400, { error: 'id or username is required' });
      try {
        const detail = await getCompetitorDetail(targetSql, idOrUser);
        return sendJson(res, 200, { success: true, ...detail });
      } catch (err) {
        return sendJson(res, 500, { success: false, error: err.message });
      }
    }

    if (method === 'GET' && pathname === '/api/competitors/all-pins') {
      const idOrUser = searchParams.get('id') || searchParams.get('competitor_id') || searchParams.get('username') || searchParams.get('account');
      if (!idOrUser) return sendJson(res, 400, { error: 'id or username is required' });
      try {
        const data = await listCompetitorAccountPins(targetSql, idOrUser, {
          search: searchParams.get('search') || '',
          board: searchParams.get('board') || '',
          min_saves: Number(searchParams.get('min_saves') || 0),
          sort: searchParams.get('sort') || 'saves_desc',
          page: Number(searchParams.get('page') || 1),
          limit: Number(searchParams.get('limit') || 50),
          qualified_only: searchParams.get('qualified_only') === 'true'
        });
        return sendJson(res, 200, { success: true, ...data });
      } catch (err) {
        return sendJson(res, 500, { success: false, error: err.message });
      }
    }

    if (method === 'POST' && pathname === '/api/competitors/dispatch-crawl') {
      const body = await parseJsonBody(req);
      const username = (body.username || body.target_account || '').replace(/^@+/, '').trim();
      if (!username) return sendJson(res, 400, { error: 'username is required' });
      try {
        const dispatchRes = await triggerCrawlerWorkflowDispatch(username, body.crawl_mode || 'discovery', body.max_pages || '500');
        return sendJson(res, 200, {
          success: true,
          target_account: username,
          crawl_mode: body.crawl_mode || 'discovery',
          message: `20-Shard Crawler Pipeline dispatched successfully on GitHub Actions for @${username}!`,
          ...dispatchRes
        });
      } catch (err) {
        return sendJson(res, 500, { success: false, error: err.message });
      }
    }

    if (method === 'DELETE' && (pathname === '/api/competitors/snapshot' || pathname === '/api/competitors/snapshots')) {
      let snapshotId = searchParams.get('id') || searchParams.get('snapshot_id');
      if (!snapshotId) {
        try {
          const body = await parseJsonBody(req);
          snapshotId = body.snapshot_id || body.id;
        } catch (_) {}
      }
      if (!snapshotId) return sendJson(res, 400, { error: 'snapshot_id is required' });
      await deleteCompetitorSnapshot(targetSql, snapshotId);
      return sendJson(res, 200, { success: true, deleted_snapshot_id: snapshotId });
    }

    if (method === 'POST' && (pathname === '/api/competitors/status' || pathname === '/api/competitors/toggle')) {
      const body = await parseJsonBody(req);
      const idOrUser = body.id || body.username || body.competitor_id;
      if (!idOrUser) return sendJson(res, 400, { error: 'id or username is required' });
      const row = await updateCompetitorStatus(targetSql, idOrUser, body.is_active);
      return sendJson(res, 200, { success: true, competitor: row });
    }

    // Keyword Velocity Tracker API
    if (method === 'GET' && pathname === '/api/keywords') {
      const keywords = await listKeywords(targetSql, {
        search: searchParams.get('search') || '',
        limit: Number(searchParams.get('limit') || 50),
        offset: Number(searchParams.get('offset') || 0)
      });
      return sendJson(res, 200, { success: true, keywords });
    }

    if (method === 'POST' && pathname === '/api/keywords') {
      const body = await parseJsonBody(req);
      const row = await addKeyword(targetSql, body);
      return sendJson(res, 200, { success: true, keyword: row });
    }

    if (method === 'POST' && pathname === '/api/keywords/sync') {
      const body = await parseJsonBody(req);
      const keywordId = Number(body.keyword_id);
      if (!keywordId) return sendJson(res, 400, { error: 'keyword_id is required' });
      const result = await crawlKeywordSERP(targetSql, keywordId, process.env.PINTEREST_COOKIE);
      return sendJson(res, 200, { success: true, result });
    }

    if (method === 'DELETE' && pathname === '/api/keywords') {
      let id = searchParams.get('id');
      let keyword = searchParams.get('keyword');
      if (!id && !keyword) {
        try {
          const body = await parseJsonBody(req);
          id = body.id || body.keyword_id;
          keyword = body.keyword;
        } catch (_) {}
      }
      if (id && !isNaN(Number(id))) {
        await targetSql`DELETE FROM tracked_keywords WHERE id = ${Number(id)};`;
        return sendJson(res, 200, { success: true, deleted_id: Number(id) });
      } else if (keyword) {
        const cleanKeyword = keyword.toLowerCase().trim();
        await targetSql`DELETE FROM tracked_keywords WHERE LOWER(keyword) = ${cleanKeyword};`;
        return sendJson(res, 200, { success: true, deleted_keyword: cleanKeyword });
      }
      return sendJson(res, 400, { error: 'id or keyword is required to delete tracked keyword' });
    }

    if (method === 'GET' && pathname === '/api/keywords/pins') {
      const keywordId = Number(searchParams.get('keyword_id'));
      if (!keywordId) return sendJson(res, 400, { error: 'keyword_id is required' });
      const pins = await getKeywordPins(targetSql, keywordId);
      return sendJson(res, 200, { success: true, pins });
    }

    // Neon Multi-Project Fleet API
    if (method === 'GET' && pathname === '/api/fleet/projects') {
      const projects = await getFleetProjects(sql);
      return sendJson(res, 200, { success: true, projects });
    }

    if (method === 'POST' && pathname === '/api/fleet/projects') {
      const body = await parseJsonBody(req);
      const row = await registerNewProject(sql, body);
      return sendJson(res, 200, { success: true, project: row });
    }

    // PinArchive & Topic Clusters API
    if (method === 'GET' && pathname === '/api/pinarchive/overview') {
      const overview = await getPinArchiveOverview(targetSql);
      return sendJson(res, 200, { success: true, overview });
    }

    if (method === 'GET' && pathname === '/api/pinarchive/rules') {
      const rules = await getQualificationRules(targetSql);
      return sendJson(res, 200, { success: true, rules });
    }

    if (method === 'POST' && pathname === '/api/pinarchive/rules') {
      const body = await parseJsonBody(req);
      const rules = await updateQualificationRules(targetSql, body);
      return sendJson(res, 200, { success: true, rules });
    }

    if (method === 'POST' && pathname === '/api/pinarchive/re-evaluate') {
      const body = await parseJsonBody(req).catch(() => ({}));
      const audit = await reEvaluateArchivedPins(targetSql, (body && Object.keys(body).length > 0) ? body : null);
      return sendJson(res, 200, { success: true, ...audit });
    }

    if (method === 'GET' && pathname === '/api/pinarchive/topics') {
      const minPins = Number(searchParams.get('min_pins') || 1);
      const search = searchParams.get('search') || '';
      const account = searchParams.get('account') || '';
      const limit = Number(searchParams.get('limit') || 50);
      const offset = Number(searchParams.get('offset') || 0);
      const topics = await getTopicClusters(targetSql, { minPins, search, account, limit, offset });
      return sendJson(res, 200, { success: true, topics });
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
      return sendJson(res, 200, { success: true, pins });
    }

    if (method === 'POST' && pathname === '/api/pinarchive/stage') {
      const body = await parseJsonBody(req);
      const pinIds = body.pin_ids || body.pinIds;
      const targetBoard = body.target_board || body.targetBoard || '';
      const overrideLink = body.override_link || body.overrideLink || '';
      if (!pinIds || !pinIds.length) return sendJson(res, 400, { error: 'pin_ids are required' });
      const result = await stagePinsForRepurpose(targetSql, { pinIds, targetBoard, overrideLink });
      return sendJson(res, 200, { success: true, ...result });
    }

    if (method === 'GET' && pathname === '/api/pinarchive/staged') {
      const status = searchParams.get('status') || 'staged';
      const limit = Number(searchParams.get('limit') || 50);
      const offset = Number(searchParams.get('offset') || 0);
      const items = await listStagedPins(targetSql, { status, limit, offset });
      return sendJson(res, 200, { success: true, staged: items, items });
    }

    if (method === 'POST' && pathname === '/api/pinarchive/claim-cas') {
      const body = await parseJsonBody(req);
      const stagedId = body.staged_id || body.id || body.pin_id;
      if (!stagedId) return sendJson(res, 400, { error: 'staged_id or pin_id is required' });
      const result = await claimStagedPinCas(targetSql, stagedId);
      if (!result.success) {
        return sendJson(res, 409, { success: false, error: 'CAS Conflict: pin already dispatched or not in staged status' });
      }
      return sendJson(res, 200, { success: true, ...result });
    }

    if (method === 'DELETE' && (pathname === '/api/pinarchive/staged' || pathname === '/api/pinarchive/cancel-staged')) {
      const body = await parseJsonBody(req).catch(() => ({}));
      const stagedId = searchParams.get('id') || searchParams.get('staged_id') || body.staged_id || body.id || body.pin_id;
      if (!stagedId) return sendJson(res, 400, { error: 'staged_id or pin_id is required' });
      const result = await cancelStagedPin(targetSql, stagedId);
      if (!result.success) {
        return sendJson(res, 404, { success: false, error: 'Staged pin not found or already dispatched/cancelled', ...result });
      }
      return sendJson(res, 200, { success: true, ...result });
    }

    // 9. GET or HEAD / or SPA creator routes (e.g. /wifesrecipesbyme)
    if ((method === 'GET' || method === 'HEAD') && !pathname.startsWith('/api/')) {
      const html = getDashboardHtml();
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Content-Length': Buffer.byteLength(html)
      });
      if (method === 'HEAD') return res.end();
      return res.end(html);
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Endpoint not found' }));

  } catch (err) {
    console.error('[-] Server Error:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal Server Error', message: err.message }));
  }
});

server.listen(PORT, () => {
  console.log(`=============================================================`);
  console.log(`  Pin Cluster Analyzer & Predictive Engine (V3) on http://localhost:${PORT}`);
  console.log(`=============================================================`);
});
