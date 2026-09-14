#!/usr/bin/env node

/**
 * Pinterest Algorithmic Arbitrage Engine (V2 Advanced Command Center)
 * High-Density Algorithmic Intelligence Cockpit & Blueprint Studio
 *
 * Runs on port 3456 (or process.env.PORT)
 */

import http from 'node:http';
import { URL } from 'node:url';
import { spawn } from 'node:child_process';
import { neon } from '@neondatabase/serverless';

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

  crawlState.is_crawling = true;
  crawlState.seed_pin_id = seedPinId || 'all_queued';
  crawlState.started_at = new Date().toISOString();
  crawlState.completed_at = null;
  crawlState.last_log = 'Crawler process initiated...';
  crawlState.error = null;

  const args = ['--use-system-ca', 'scripts/cluster-intelligence.mjs'];
  if (seedPinId) {
    args.push(seedPinId);
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

// Helper to send JSON response
function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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

// HTML Single Page Application V2
function getDashboardHtml() {
  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pin Arbitrage Engine | Algorithmic Command Center V2</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          fontFamily: {
            sans: ['Inter', 'sans-serif'],
            mono: ['JetBrains Mono', 'monospace'],
          },
          colors: {
            brand: {
              50: '#fdf2f2',
              500: '#ef4444',
              600: '#dc2626',
              900: '#7f1d1d',
            }
          }
        }
      }
    }
  </script>
  <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
  <script src="https://unpkg.com/lucide@latest"></script>
  <style>
    [x-cloak] { display: none !important; }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: #030712; }
    ::-webkit-scrollbar-thumb { background: #1f2937; border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: #374151; }
    .glow-rose { box-shadow: 0 0 25px -5px rgba(244, 63, 94, 0.3); }
    .glow-emerald { box-shadow: 0 0 25px -5px rgba(16, 185, 129, 0.3); }
    .glow-amber { box-shadow: 0 0 25px -5px rgba(245, 158, 11, 0.3); }
  </style>
</head>
<body class="bg-[#030712] text-slate-100 min-h-screen font-sans selection:bg-rose-500 selection:text-white antialiased" x-data="dashboardApp()" x-init="initDashboard()">

  <!-- Top Control & Status Header -->
  <header class="border-b border-slate-800/80 bg-[#090d16]/80 backdrop-blur-xl sticky top-0 z-40">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
      <div class="flex items-center space-x-3">
        <div class="h-10 w-10 rounded-xl bg-gradient-to-tr from-rose-600 via-rose-500 to-amber-500 flex items-center justify-center shadow-lg shadow-rose-950/50">
          <i data-lucide="cpu" class="w-5 h-5 text-white"></i>
        </div>
        <div>
          <div class="flex items-center space-x-2">
            <span class="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
              Pin Arbitrage Engine
            </span>
            <span class="px-2 py-0.5 text-[10px] font-mono font-bold uppercase rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/30">
              V2 Command Center
            </span>
            <template x-if="crawlStatus.is_crawling">
              <span class="px-2 py-0.5 text-[10px] font-mono font-bold rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center space-x-1 animate-pulse">
                <span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping"></span>
                <span>Crawler Active</span>
              </span>
            </template>
          </div>
          <p class="text-[11px] text-slate-400">P2P Graph Discovery • prod:v18 Reranking • Golden Commercial Vacuum Radar</p>
        </div>
      </div>

      <!-- Header Action Controls -->
      <div class="flex items-center space-x-3">
        <!-- Live Crawl Queued Seeds Now Button -->
        <button @click="triggerCrawl()" :disabled="crawlStatus.is_crawling" class="flex items-center space-x-2 px-4 py-2 text-xs font-bold rounded-xl transition shadow-lg active:scale-95 disabled:opacity-50" :class="crawlStatus.is_crawling ? 'bg-amber-600/30 text-amber-300 border border-amber-500/40 cursor-not-allowed' : 'bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white shadow-rose-950/40'">
          <i data-lucide="zap" :class="{'animate-spin': crawlStatus.is_crawling}" class="w-4 h-4"></i>
          <span x-text="crawlStatus.is_crawling ? 'Crawling Seeds in Background...' : '⚡ Crawl Queued Seeds Now'"></span>
        </button>

        <button @click="fetchData()" :disabled="isLoading" class="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 hover:border-slate-700 transition active:scale-95" title="Refresh Data">
          <i data-lucide="rotate-cw" :class="{'animate-spin': isLoading}" class="w-4 h-4"></i>
        </button>

        <button @click="isAddSeedOpen = true" class="flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700 transition active:scale-95">
          <i data-lucide="plus-circle" class="w-3.5 h-3.5 text-rose-400"></i>
          <span>Add Competitor Pin</span>
        </button>
      </div>
    </div>
  </header>

  <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

    <!-- Active Crawl Notification Banner -->
    <div x-show="crawlStatus.is_crawling" x-cloak class="bg-amber-950/30 border border-amber-500/40 rounded-2xl p-3 px-4 flex items-center justify-between text-xs text-amber-200 backdrop-blur-sm animate-pulse">
      <div class="flex items-center space-x-2">
        <i data-lucide="loader-2" class="w-4 h-4 animate-spin text-amber-400"></i>
        <span class="font-semibold">Crawler in flight:</span>
        <span class="font-mono text-amber-300" x-text="'Target: ' + crawlStatus.seed_pin_id"></span>
        <span class="text-amber-400/60">•</span>
        <span class="text-amber-200/80" x-text="crawlStatus.last_log"></span>
      </div>
      <span class="font-mono text-[11px] text-amber-400/80" x-text="'Elapsed: ' + crawlElapsed + 's'"></span>
    </div>

    <!-- 1. Executive Metrics Bar -->
    <section class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <!-- Active Seeds Card -->
      <div class="bg-[#0b1120]/80 border border-slate-800/90 rounded-2xl p-4 relative overflow-hidden group hover:border-slate-700 transition shadow-xl">
        <div class="flex items-center justify-between">
          <span class="text-[11px] font-mono font-medium uppercase tracking-wider text-slate-400">Tracked Seeds</span>
          <div class="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <i data-lucide="target" class="w-4 h-4"></i>
          </div>
        </div>
        <div class="mt-2 flex items-baseline space-x-2">
          <span class="text-3xl font-extrabold text-white font-mono" x-text="overview.total_seeds">0</span>
          <span class="text-xs text-slate-400">roots</span>
        </div>
        <div class="mt-2 text-[11px] flex items-center space-x-2">
          <span class="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono font-semibold" x-text="overview.indexed_seeds + ' Indexed'"></span>
          <span class="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono font-semibold" x-text="overview.queued_seeds + ' Queued'"></span>
        </div>
      </div>

      <!-- Total Candidates Card -->
      <div class="bg-[#0b1120]/80 border border-slate-800/90 rounded-2xl p-4 relative overflow-hidden group hover:border-slate-700 transition shadow-xl">
        <div class="flex items-center justify-between">
          <span class="text-[11px] font-mono font-medium uppercase tracking-wider text-slate-400">STORED CANDIDATES (DATABASE)</span>
          <div class="p-1.5 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20">
            <i data-lucide="network" class="w-4 h-4"></i>
          </div>
        </div>
        <div class="mt-2 flex items-baseline space-x-2">
          <span class="text-3xl font-extrabold text-white font-mono" x-text="overview.total_candidates">0</span>
          <span class="text-xs text-slate-400">harvested pins</span>
        </div>
        <div class="mt-2 text-[11px] text-slate-400 flex items-center space-x-1">
          <span class="w-1.5 h-1.5 rounded-full bg-sky-400"></span>
          <span>Extracted & stored in Neon Postgres</span>
        </div>
      </div>

      <!-- Commercial Vacuum Ratio Card -->
      <div class="bg-[#0b1120]/80 border border-slate-800/90 rounded-2xl p-4 relative overflow-hidden group hover:border-slate-700 transition shadow-xl" :class="Number(overview.avg_commercial_gap) > 75 ? 'glow-emerald' : ''">
        <div class="flex items-center justify-between">
          <span class="text-[11px] font-mono font-medium uppercase tracking-wider text-slate-400">Commercial Vacuum Ratio</span>
          <div class="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <i data-lucide="sparkles" class="w-4 h-4"></i>
          </div>
        </div>
        <div class="mt-2 flex items-baseline space-x-2">
          <span class="text-3xl font-extrabold font-mono text-emerald-400" x-text="overview.avg_commercial_gap + '%'">0%</span>
          <span class="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            GOLDEN VACUUM
          </span>
        </div>
        <div class="mt-2 text-[11px] text-slate-400 flex items-center space-x-1">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
          <span>Non-commercial candidate ratio ($1.99 arbitrage)</span>
        </div>
      </div>

      <!-- Multi-Hit Hubs Card -->
      <div class="bg-[#0b1120]/80 border border-slate-800/90 rounded-2xl p-4 relative overflow-hidden group hover:border-slate-700 transition shadow-xl" :class="overview.intersecting_hubs_count > 0 ? 'glow-amber' : ''">
        <div class="flex items-center justify-between">
          <span class="text-[11px] font-mono font-medium uppercase tracking-wider text-slate-400">Golden Multi-Hit Hubs</span>
          <div class="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <i data-lucide="flame" class="w-4 h-4"></i>
          </div>
        </div>
        <div class="mt-2 flex items-baseline space-x-2">
          <span class="text-3xl font-extrabold font-mono text-amber-400" x-text="overview.intersecting_hubs_count">0</span>
          <span class="text-xs text-slate-400">intersections (≥ 2 seeds)</span>
        </div>
        <div class="mt-2 text-[11px] text-slate-400 flex items-center space-x-1">
          <span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
          <span>Bipartite random walk co-visitation nodes</span>
        </div>
      </div>
    </section>

    <!-- 2. View 2: Cluster Deep-Telemetry Radar -->
    <section class="bg-[#0b1120]/90 border border-slate-800/90 rounded-2xl p-6 shadow-2xl space-y-6">
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
        <div>
          <div class="flex items-center space-x-2">
            <h2 class="text-base font-bold text-slate-100 flex items-center space-x-2">
              <i data-lucide="activity" class="w-4 h-4 text-rose-500"></i>
              <span>Cluster Deep-Telemetry Radar (Reverse-Engineered Signals)</span>
            </h2>
            <span class="px-2 py-0.5 text-[10px] font-mono font-semibold rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">
              prod:v18 Engine
            </span>
          </div>
          <p class="text-xs text-slate-400 mt-0.5">Live telemetry of Pinterest's internal retrieval allocations and algorithmic leverage score</p>
        </div>

        <!-- Seed Selector Dropdown -->
        <div class="flex items-center space-x-2">
          <span class="text-xs text-slate-400 font-medium">Cluster Focus:</span>
          <select x-model="selectedSeedId" @change="fetchTelemetry()" class="bg-slate-900 border border-slate-700 text-xs text-slate-100 rounded-xl px-3 py-1.5 focus:outline-none focus:border-rose-500 transition font-mono">
            <template x-for="seed in seeds" :key="seed.pin_id">
              <option :value="seed.pin_id" x-text="seed.label + ' (' + seed.pin_id + ')'"></option>
            </template>
          </select>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">

        <!-- Left Column: P2P Retrieval Allocation (7 cols) -->
        <div class="lg:col-span-7 space-y-4">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span class="text-xs font-bold text-slate-200 uppercase font-mono tracking-wider flex items-center space-x-1.5">
              <i data-lucide="layers" class="w-3.5 h-3.5 text-sky-400"></i>
              <span>P2P Candidate Allocation Engine Quotas</span>
            </span>
            <div class="px-2.5 py-1 rounded-lg bg-sky-500/10 border border-sky-500/20 text-[11px] font-mono text-sky-300">
              <span>Pinterest Algorithmic Evaluation Pool: <strong class="text-white font-bold" x-text="telemetry.total_engine_quota">0</strong> evaluated by Pinterest &rarr; Top <strong class="text-emerald-400 font-bold" x-text="telemetry.extracted_count || 0">0</strong> extracted & stored</span>
            </div>
          </div>

          <!-- Multi-color Stacked Allocation Bar -->
          <div class="w-full bg-slate-900 rounded-xl h-4 overflow-hidden flex border border-slate-800 shadow-inner">
            <div class="bg-purple-500 transition-all duration-500" :style="'width: ' + telemetry.recgpt_pct + '%'" :title="'RecGPT: ' + telemetry.recgpt_count + ' (' + telemetry.recgpt_pct + '%)'"></div>
            <div class="bg-sky-500 transition-all duration-500" :style="'width: ' + telemetry.navboost_pct + '%'" :title="'NavBoost: ' + telemetry.navboost_count + ' (' + telemetry.navboost_pct + '%)'"></div>
            <div class="bg-emerald-500 transition-all duration-500" :style="'width: ' + telemetry.randomwalk_pct + '%'" :title="'RandomWalk (Pixie): ' + telemetry.randomwalk_count + ' (' + telemetry.randomwalk_pct + '%)'"></div>
            <div class="bg-amber-500 transition-all duration-500" :style="'width: ' + telemetry.two_tower_pct + '%'" :title="'Two-Tower: ' + telemetry.two_tower_count + ' (' + telemetry.two_tower_pct + '%)'"></div>
            <div class="bg-rose-500 transition-all duration-500" :style="'width: ' + telemetry.fresh_pct + '%'" :title="'Fresh Candidates: ' + telemetry.fresh_candidate_count + ' (' + telemetry.fresh_pct + '%)'"></div>
          </div>

          <!-- Allocation Legend Grid -->
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1 text-xs">
            <div class="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/80 flex items-center space-x-2">
              <div class="w-2.5 h-2.5 rounded bg-purple-500 flex-shrink-0"></div>
              <div class="min-w-0 flex-1">
                <div class="text-[11px] text-slate-400 truncate">P2P_RECGPT</div>
                <div class="font-mono font-bold text-slate-200" x-text="telemetry.recgpt_count + ' (' + telemetry.recgpt_pct + '%)'"></div>
              </div>
            </div>

            <div class="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/80 flex items-center space-x-2">
              <div class="w-2.5 h-2.5 rounded bg-sky-500 flex-shrink-0"></div>
              <div class="min-w-0 flex-1">
                <div class="text-[11px] text-slate-400 truncate">P2P_NAVBOOST</div>
                <div class="font-mono font-bold text-slate-200" x-text="telemetry.navboost_count + ' (' + telemetry.navboost_pct + '%)'"></div>
              </div>
            </div>

            <div class="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/80 flex items-center space-x-2">
              <div class="w-2.5 h-2.5 rounded bg-emerald-500 flex-shrink-0"></div>
              <div class="min-w-0 flex-1">
                <div class="text-[11px] text-slate-400 truncate">RANDOMWALK (Pixie)</div>
                <div class="font-mono font-bold text-slate-200" x-text="telemetry.randomwalk_count + ' (' + telemetry.randomwalk_pct + '%)'"></div>
              </div>
            </div>

            <div class="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/80 flex items-center space-x-2">
              <div class="w-2.5 h-2.5 rounded bg-amber-500 flex-shrink-0"></div>
              <div class="min-w-0 flex-1">
                <div class="text-[11px] text-slate-400 truncate">TWO_TOWER_EMBED</div>
                <div class="font-mono font-bold text-slate-200" x-text="telemetry.two_tower_count + ' (' + telemetry.two_tower_pct + '%)'"></div>
              </div>
            </div>

            <div class="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/80 flex items-center space-x-2">
              <div class="w-2.5 h-2.5 rounded bg-rose-500 flex-shrink-0"></div>
              <div class="min-w-0 flex-1">
                <div class="text-[11px] text-slate-400 truncate">FRESH_COLD_START</div>
                <div class="font-mono font-bold text-slate-200" x-text="telemetry.fresh_candidate_count + ' (' + telemetry.fresh_pct + '%)'"></div>
              </div>
            </div>

            <div class="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/80 flex items-center space-x-2">
              <div class="w-2.5 h-2.5 rounded bg-indigo-500 flex-shrink-0"></div>
              <div class="min-w-0 flex-1">
                <div class="text-[11px] text-slate-400 truncate">PRODUCT INDEX</div>
                <div class="font-mono font-bold text-slate-200" x-text="telemetry.product_count + ' (' + telemetry.product_pct + '%)'"></div>
              </div>
            </div>
          </div>

          <!-- Dominant Palette Centroids -->
          <div class="pt-2">
            <span class="text-[11px] font-mono font-bold uppercase text-slate-400 tracking-wider">Cluster Color DNA (Dominant Centroids)</span>
            <div class="flex items-center space-x-2 mt-2 flex-wrap gap-y-2">
              <template x-for="swatch in telemetry.color_centroids" :key="swatch.color">
                <div class="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 shadow-sm hover:border-slate-700 transition">
                  <span class="w-4 h-4 rounded-md border border-slate-700" :style="'background-color: ' + swatch.color"></span>
                  <span class="font-mono text-xs text-slate-200" x-text="swatch.color"></span>
                  <span class="text-[10px] text-slate-500 font-mono" x-text="swatch.percentage + '%'"></span>
                </div>
              </template>
            </div>
          </div>
        </div>

        <!-- Right Column: prod:v18 Utility Function Disparity Card (5 cols) -->
        <div class="lg:col-span-5 bg-gradient-to-b from-[#111827] to-[#0b1120] p-5 rounded-2xl border border-slate-800/90 shadow-xl space-y-4">
          <div class="flex items-center justify-between border-b border-slate-800 pb-3">
            <span class="text-xs font-bold text-amber-400 uppercase font-mono tracking-wider flex items-center space-x-1.5">
              <i data-lucide="scale" class="w-4 h-4 text-amber-400"></i>
              <span>prod:v18 Utility Disparity</span>
            </span>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
              5.12x Leverage
            </span>
          </div>

          <div class="space-y-3 text-xs">
            <!-- Competitor Etsy/PDP Row -->
            <div class="bg-slate-950/60 p-3 rounded-xl border border-rose-900/30 space-y-1.5">
              <div class="flex items-center justify-between font-semibold text-rose-400">
                <span class="flex items-center space-x-1">
                  <i data-lucide="trending-down" class="w-3.5 h-3.5"></i>
                  <span>Competitor Etsy Pin (Quick Bounce)</span>
                </span>
                <span class="font-mono font-bold text-rose-400">-74.91 Net</span>
              </div>
              <div class="grid grid-cols-2 gap-2 text-[10px] font-mono text-slate-400 pt-0.5">
                <div>Click Weight: <span class="text-slate-200">+111.72</span></div>
                <div>Short Bounce (&lt;5s): <span class="text-rose-400">-186.62</span></div>
              </div>
              <p class="text-[10px] text-slate-500 leading-tight">Suffers quick bounce penalty on slow external storefronts, destroying graph rank.</p>
            </div>

            <!-- Zizeeba Hybrid Pin Row -->
            <div class="bg-slate-950/60 p-3 rounded-xl border border-emerald-900/30 space-y-1.5">
              <div class="flex items-center justify-between font-semibold text-emerald-400">
                <span class="flex items-center space-x-1">
                  <i data-lucide="trending-up" class="w-3.5 h-3.5"></i>
                  <span>Zizeeba Hybrid Model (3.5m Dwell Time)</span>
                </span>
                <span class="font-mono font-bold text-emerald-400">+383.34 Net</span>
              </div>
              <div class="grid grid-cols-3 gap-1 text-[10px] font-mono text-slate-400 pt-0.5">
                <div>Click: <span class="text-slate-200">+111.72</span></div>
                <div>Long Dwell: <span class="text-emerald-300">+137.80</span></div>
                <div>Repin: <span class="text-emerald-300">+133.82</span></div>
              </div>
              <p class="text-[10px] text-slate-500 leading-tight">Interactive recipe reader with high dwell time & instant PDF purchase trigger.</p>
            </div>
          </div>

          <!-- Top Viral Word Cloud / NLP Lexical Stack -->
          <div class="pt-1">
            <span class="text-[10px] font-mono font-bold uppercase text-slate-400 tracking-wider">High-Save Lexical Cloud (TF-IDF Weighted)</span>
            <div class="flex flex-wrap gap-1.5 mt-2">
              <template x-for="token in telemetry.high_save_tokens.slice(0, 10)" :key="token.token">
                <span class="px-2 py-0.5 rounded-md bg-slate-900 text-slate-300 border border-slate-800 text-[11px] font-mono flex items-center space-x-1">
                  <span x-text="token.token"></span>
                  <span class="text-[9px] text-rose-400 font-bold" x-text="token.weighted_score"></span>
                </span>
              </template>
            </div>
          </div>
        </div>

      </div>
    </section>

    <!-- 3. View 3: Candidate Graph & Arbitrage Grid -->
    <section class="space-y-4">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 class="text-base font-bold text-slate-100 flex items-center space-x-2">
            <i data-lucide="crosshair" class="w-4 h-4 text-rose-500"></i>
            <span>Candidate Graph & Arbitrage Grid</span>
          </h2>
          <p class="text-xs text-slate-400">Harvested nodes evaluated by Pixie Multi-Hit Score and Commercial Gap potential</p>
        </div>

        <!-- Filter Controls -->
        <div class="flex items-center space-x-3">
          <div class="flex items-center space-x-1 bg-slate-900 border border-slate-800 rounded-xl p-1 text-xs">
            <button @click="filterMode = 'all'; fetchIntersections()" :class="filterMode === 'all' ? 'bg-rose-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'" class="px-3 py-1 rounded-lg transition">
              All Candidates
            </button>
            <button @click="filterMode = 'multihit'; fetchIntersections()" :class="filterMode === 'multihit' ? 'bg-rose-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'" class="px-3 py-1 rounded-lg transition flex items-center space-x-1">
              <span>Multi-Hit (≥2)</span>
              <span class="px-1.5 py-0.2 rounded-full bg-slate-800 text-[10px]" x-text="overview.intersecting_hubs_count"></span>
            </button>
            <button @click="filterMode = 'vacuum'; fetchIntersections()" :class="filterMode === 'vacuum' ? 'bg-amber-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'" class="px-3 py-1 rounded-lg transition">
              Vacuum Targets Only
            </button>
          </div>

          <div class="relative w-56">
            <i data-lucide="search" class="w-4 h-4 text-slate-500 absolute left-3 top-2.5"></i>
            <input type="text" x-model="searchQuery" placeholder="Filter title or domain..." class="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-rose-500 transition">
          </div>
        </div>
      </div>

      <div class="bg-[#0b1120]/90 border border-slate-800/90 rounded-2xl overflow-hidden shadow-2xl">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="bg-[#080d1a] border-b border-slate-800 text-slate-400 uppercase font-mono tracking-wider">
              <tr>
                <th class="py-3.5 px-4">Candidate Pin & Title</th>
                <th class="py-3.5 px-4">Origin / Overlap</th>
                <th class="py-3.5 px-4">Pixie Multi-Hit Score</th>
                <th class="py-3.5 px-4">Saves</th>
                <th class="py-3.5 px-4">Palette</th>
                <th class="py-3.5 px-4">Market Status</th>
                <th class="py-3.5 px-4 text-right">Production Action</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-800/60 text-slate-300 font-sans">
              <template x-for="item in filteredCandidates" :key="item.candidate_pin_id">
                <tr class="hover:bg-slate-800/40 transition group">
                  <!-- Title & Link -->
                  <td class="py-3.5 px-4 max-w-sm">
                    <div class="font-semibold text-slate-100 group-hover:text-rose-300 transition truncate" x-text="item.title"></div>
                    <div class="flex items-center space-x-2 mt-1">
                      <span class="text-[10px] font-mono text-slate-500" x-text="'ID: ' + item.candidate_pin_id"></span>
                      <span class="text-slate-600">•</span>
                      <a :href="'https://www.pinterest.com/pin/' + item.candidate_pin_id + '/'" target="_blank" class="text-[10px] text-sky-400 hover:underline flex items-center space-x-0.5">
                        <span x-text="item.domain"></span>
                        <i data-lucide="external-link" class="w-2.5 h-2.5"></i>
                      </a>
                    </div>
                  </td>

                  <!-- Overlap Depth Badge -->
                  <td class="py-3.5 px-4 whitespace-nowrap">
                    <template x-if="Number(item.seed_overlap_count) >= 2">
                      <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        <i data-lucide="layers" class="w-3 h-3 mr-1"></i>
                        <span x-text="item.seed_overlap_count + ' Seeds Shared'"></span>
                      </span>
                    </template>
                    <template x-if="Number(item.seed_overlap_count) < 2">
                      <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-800 text-slate-400">
                        <span>1 Seed Node</span>
                      </span>
                    </template>
                  </td>

                  <!-- Pixie Multi-Hit Score with progress bar -->
                  <td class="py-3.5 px-4 whitespace-nowrap">
                    <div class="flex items-center space-x-2">
                      <span class="font-mono font-bold text-rose-400" x-text="Number(item.pixie_multihit_score).toLocaleString()"></span>
                    </div>
                    <div class="w-28 bg-slate-800 rounded-full h-1.5 mt-1 overflow-hidden">
                      <div class="bg-gradient-to-r from-rose-500 to-amber-500 h-1.5 rounded-full" :style="'width: ' + Math.min(100, Math.max(8, (Number(item.pixie_multihit_score) / maxPixieScore) * 100)) + '%'"></div>
                    </div>
                  </td>

                  <!-- Saves -->
                  <td class="py-3.5 px-4 font-mono text-slate-300 whitespace-nowrap" x-text="Number(item.total_saves).toLocaleString()"></td>

                  <!-- Color Swatch -->
                  <td class="py-3.5 px-4 whitespace-nowrap">
                    <div class="flex items-center space-x-2">
                      <div class="w-5 h-5 rounded-md border border-slate-700 shadow-sm" :style="'background-color: ' + (item.winning_color || '#888888')"></div>
                      <span class="font-mono text-[11px] text-slate-400" x-text="item.winning_color || '#888888'"></span>
                    </div>
                  </td>

                  <!-- Market Status & Vacuum Badge -->
                  <td class="py-3.5 px-4 whitespace-nowrap">
                    <div class="flex items-center space-x-1.5">
                      <template x-if="item.is_product">
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-rose-500/10 text-rose-400 border border-rose-500/20">
                          Product
                        </span>
                      </template>
                      <template x-if="!item.is_product">
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-800 text-slate-300 border border-slate-700">
                          Organic
                        </span>
                      </template>

                      <template x-if="!item.is_product && Number(item.total_saves) >= 5000">
                        <span class="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse">
                          VACUUM TARGET
                        </span>
                      </template>
                    </div>
                  </td>

                  <!-- Production Action -->
                  <td class="py-3.5 px-4 text-right whitespace-nowrap">
                    <button @click="openBlueprint(item)" class="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 text-white text-xs font-semibold transition shadow-md shadow-rose-950/40 active:scale-95">
                      <i data-lucide="zap" class="w-3.5 h-3.5"></i>
                      <span>⚡ Open Production Blueprint</span>
                    </button>
                  </td>
                </tr>
              </template>

              <template x-if="filteredCandidates.length === 0">
                <tr>
                  <td colspan="7" class="py-12 text-center text-slate-500">
                    <i data-lucide="inbox" class="w-8 h-8 mx-auto mb-2 opacity-50"></i>
                    <p class="text-sm font-medium">No candidates found for this filter criteria.</p>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </div>
    </section>

  </main>

  <!-- 4. View 4: Production Blueprint Slide-Over Drawer / Modal -->
  <div x-show="isBlueprintOpen" x-cloak class="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4" @keydown.escape.window="isBlueprintOpen = false">
    <div class="bg-[#0b1120] border border-slate-800 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150" @click.away="isBlueprintOpen = false">
      <!-- Modal Header -->
      <div class="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-[#080d1a]">
        <div class="flex items-center space-x-3">
          <div class="w-8 h-8 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center">
            <i data-lucide="zap" class="w-4 h-4"></i>
          </div>
          <div>
            <h3 class="font-bold text-slate-100 text-base">Zizeeba.com Actionable Recipe Production Blueprint</h3>
            <p class="text-xs text-slate-400">Algorithmic Arbitrage Export Studio ($1.99 Recipe Card PDF)</p>
          </div>
        </div>
        <button @click="isBlueprintOpen = false" class="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition">
          <i data-lucide="x" class="w-5 h-5"></i>
        </button>
      </div>

      <!-- Modal Body -->
      <div class="p-6 space-y-5 text-xs" x-if="selectedCandidate">

        <!-- Candidate Overview Box -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 bg-[#080d1a] p-4 rounded-xl border border-slate-800">
          <div class="col-span-2">
            <span class="text-[10px] uppercase font-mono text-slate-400 tracking-wider">Candidate Target</span>
            <div class="text-sm font-bold text-slate-100 mt-0.5" x-text="selectedCandidate?.title"></div>
            <div class="text-slate-400 text-[11px] mt-1 font-mono flex items-center space-x-2">
              <span x-text="'Pin ID: ' + selectedCandidate?.candidate_pin_id"></span>
              <span class="text-slate-600">•</span>
              <span class="text-rose-400 font-bold" x-text="'Saves: ' + Number(selectedCandidate?.total_saves || 0).toLocaleString()"></span>
            </div>
          </div>
          <div>
            <span class="text-[10px] uppercase font-mono text-slate-400 tracking-wider">Color Palette Anchor</span>
            <div class="flex items-center space-x-2 mt-1">
              <div class="w-8 h-8 rounded-lg border border-slate-700 shadow-md" :style="'background-color: ' + (selectedCandidate?.winning_color || '#888888')"></div>
              <div>
                <div class="font-mono font-bold text-slate-200" x-text="selectedCandidate?.winning_color || '#888888'"></div>
                <div class="text-[10px] text-slate-500">Centroid Anchor</div>
              </div>
            </div>
          </div>
        </div>

        <!-- 1. Algorithmic Title Formula -->
        <div class="space-y-1.5">
          <div class="flex items-center justify-between">
            <span class="font-semibold text-slate-300 flex items-center space-x-1.5">
              <i data-lucide="heading" class="w-3.5 h-3.5 text-rose-400"></i>
              <span>1. Algorithmic Recipe SEO Title Formula</span>
            </span>
            <button @click="copyToClipboard(blueprintSeoTitle, 'seo')" class="text-rose-400 hover:text-rose-300 text-[11px] font-medium flex items-center space-x-1">
              <i data-lucide="copy" class="w-3 h-3"></i>
              <span x-text="copiedField === 'seo' ? 'Copied!' : 'Copy Title'"></span>
            </button>
          </div>
          <div class="bg-black/50 p-3 rounded-xl border border-slate-800 font-mono text-slate-200 text-xs flex items-center justify-between select-all" x-text="blueprintSeoTitle"></div>
        </div>

        <!-- 2. Midjourney v6.1 Generation Prompt -->
        <div class="space-y-1.5">
          <div class="flex items-center justify-between">
            <span class="font-semibold text-slate-300 flex items-center space-x-1.5">
              <i data-lucide="image" class="w-3.5 h-3.5 text-amber-400"></i>
              <span>2. Midjourney v6.1 Generation Prompt (--ar 9:16 --v 6.1 --style raw)</span>
            </span>
            <button @click="copyToClipboard(blueprintMidjourney, 'midjourney')" class="text-amber-400 hover:text-amber-300 text-[11px] font-medium flex items-center space-x-1">
              <i data-lucide="copy" class="w-3 h-3"></i>
              <span x-text="copiedField === 'midjourney' ? 'Copied!' : 'Copy Prompt'"></span>
            </button>
          </div>
          <div class="bg-black/50 p-3 rounded-xl border border-slate-800 font-mono text-slate-300 text-[11px] leading-relaxed select-all" x-text="blueprintMidjourney"></div>
        </div>

        <!-- 3. Copy-Ready Dual JSON-LD Schema -->
        <div class="space-y-1.5">
          <div class="flex items-center justify-between">
            <span class="font-semibold text-slate-300 flex items-center space-x-1.5">
              <i data-lucide="code-2" class="w-3.5 h-3.5 text-emerald-400"></i>
              <span>3. Copy-Ready Dual JSON-LD Schema (Product $1.99 + Recipe)</span>
            </span>
            <button @click="copyToClipboard(blueprintJsonLd, 'jsonld')" class="text-emerald-400 hover:text-emerald-300 text-[11px] font-medium flex items-center space-x-1">
              <i data-lucide="copy" class="w-3 h-3"></i>
              <span x-text="copiedField === 'jsonld' ? 'Copied JSON-LD!' : '1-Click Copy Schema'"></span>
            </button>
          </div>
          <pre class="bg-black/60 p-3.5 rounded-xl border border-slate-800 font-mono text-slate-300 text-[10px] leading-relaxed max-h-52 overflow-y-auto select-all" x-text="blueprintJsonLd"></pre>
        </div>

        <!-- 4. Alt Text & SEO Description -->
        <div class="space-y-1.5">
          <div class="flex items-center justify-between">
            <span class="font-semibold text-slate-300 flex items-center space-x-1.5">
              <i data-lucide="file-text" class="w-3.5 h-3.5 text-sky-400"></i>
              <span>4. Alt Text & SEO Description (Formatted with Cluster Tokens)</span>
            </span>
            <button @click="copyToClipboard(blueprintAltText, 'alt')" class="text-sky-400 hover:text-sky-300 text-[11px] font-medium flex items-center space-x-1">
              <i data-lucide="copy" class="w-3 h-3"></i>
              <span x-text="copiedField === 'alt' ? 'Copied Alt Text!' : 'Copy Alt Text'"></span>
            </button>
          </div>
          <div class="bg-black/50 p-2.5 rounded-xl border border-slate-800 font-mono text-slate-300 text-[11px] select-all" x-text="blueprintAltText"></div>
        </div>

      </div>

      <div class="px-6 py-3.5 border-t border-slate-800 bg-[#080d1a] flex items-center justify-between">
        <span class="text-[11px] text-slate-400">Ready for instant production rollout on <code class="text-rose-400">zizeeba.com</code></span>
        <button @click="isBlueprintOpen = false" class="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium rounded-lg text-xs transition">
          Close
        </button>
      </div>
    </div>
  </div>

  <!-- Add New Seed Modal -->
  <div x-show="isAddSeedOpen" x-cloak class="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
    <div class="bg-[#0b1120] border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4" @click.away="isAddSeedOpen = false">
      <div class="flex items-center justify-between border-b border-slate-800 pb-3">
        <h3 class="font-bold text-slate-100 text-sm flex items-center space-x-2">
          <i data-lucide="plus-circle" class="w-4 h-4 text-rose-500"></i>
          <span>Track New Competitor Seed Pin</span>
        </h3>
        <button @click="isAddSeedOpen = false" class="text-slate-400 hover:text-white">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>

      <form @submit.prevent="submitNewSeed()" class="space-y-4 text-xs">
        <div>
          <label class="block font-medium text-slate-300 mb-1">Pinterest Pin ID</label>
          <input type="text" x-model="newSeed.pin_id" placeholder="e.g., 840765824177432857" required class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono focus:outline-none focus:border-rose-500">
        </div>

        <div>
          <label class="block font-medium text-slate-300 mb-1">Label / Target Niche</label>
          <input type="text" x-model="newSeed.label" placeholder="e.g., Tuscan Garlic Chicken Crockpot" required class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-rose-500">
        </div>

        <div class="flex items-center space-x-2">
          <input type="checkbox" id="is_comp" x-model="newSeed.is_competitor" class="rounded bg-slate-950 border-slate-800 text-rose-600 focus:ring-rose-500">
          <label for="is_comp" class="text-slate-300 font-medium">Mark as Competitor Pin</label>
        </div>

        <div class="flex items-center space-x-2 pt-1">
          <input type="checkbox" id="auto_crawl" x-model="newSeed.auto_crawl" class="rounded bg-slate-950 border-slate-800 text-amber-500 focus:ring-amber-500">
          <label for="auto_crawl" class="text-amber-400 font-semibold">⚡ Trigger Immediate Crawl in Background</label>
        </div>

        <div class="pt-2 flex justify-end space-x-2">
          <button type="button" @click="isAddSeedOpen = false" class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300">
            Cancel
          </button>
          <button type="submit" :disabled="isSubmitting" class="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold flex items-center space-x-1">
            <span x-text="isSubmitting ? 'Saving...' : 'Add to Pipeline'"></span>
          </button>
        </div>
      </form>
    </div>
  </div>

  <script>
    function dashboardApp() {
      return {
        isLoading: false,
        isSubmitting: false,
        isAddSeedOpen: false,
        isBlueprintOpen: false,
        copiedField: null,
        filterMode: 'all', // 'all', 'multihit', 'vacuum'
        searchQuery: '',
        selectedSeedId: '',
        crawlElapsed: 0,
        crawlTimer: null,
        crawlStatus: {
          is_crawling: false,
          seed_pin_id: null,
          last_log: ''
        },
        overview: {
          total_seeds: 0,
          indexed_seeds: 0,
          queued_seeds: 0,
          total_candidates: 0,
          avg_commercial_gap: 0,
          intersecting_hubs_count: 0
        },
        telemetry: {
          recgpt_count: 0,
          recgpt_pct: 0,
          navboost_count: 0,
          navboost_pct: 0,
          randomwalk_count: 0,
          randomwalk_pct: 0,
          two_tower_count: 0,
          two_tower_pct: 0,
          fresh_candidate_count: 0,
          fresh_pct: 0,
          product_count: 0,
          product_pct: 0,
          total_engine_quota: 0,
          color_centroids: [],
          high_save_tokens: []
        },
        candidates: [],
        seeds: [],
        selectedCandidate: null,
        newSeed: {
          pin_id: '',
          label: '',
          is_competitor: true,
          auto_crawl: true
        },

        get maxPixieScore() {
          if (this.candidates.length === 0) return 1;
          return Math.max(...this.candidates.map(i => Number(i.pixie_multihit_score) || 1));
        },

        get filteredCandidates() {
          let list = this.candidates;

          if (this.filterMode === 'multihit') {
            list = list.filter(item => Number(item.seed_overlap_count) >= 2);
          } else if (this.filterMode === 'vacuum') {
            list = list.filter(item => !item.is_product && Number(item.total_saves) >= 5000);
          }

          if (this.searchQuery) {
            const q = this.searchQuery.toLowerCase();
            list = list.filter(item =>
              (item.title && item.title.toLowerCase().includes(q)) ||
              (item.domain && item.domain.toLowerCase().includes(q)) ||
              (item.candidate_pin_id && item.candidate_pin_id.includes(q))
            );
          }

          return list;
        },

        get cleanRecipeTitle() {
          if (!this.selectedCandidate) return 'Recipe';
          let title = this.selectedCandidate.title || '';
          if (!title || title.startsWith('[')) {
            const topTokens = (this.telemetry.high_save_tokens || []).slice(0, 2).map(t => t.token).join(' ');
            title = topTokens ? (topTokens.charAt(0).toUpperCase() + topTokens.slice(1) + ' Dish') : 'Culinary Recipe';
          } else {
            title = title.replace(/\s*\|.*$/g, '');
            title = title.replace(/\s*-\s*.*recipe.*$/i, '');
            title = title.replace(/^Easy\s+/i, '');
          }
          return title.trim();
        },

        get blueprintSeoTitle() {
          return 'Easy ' + this.cleanRecipeTitle + ' Recipe (Quick & Delicious) | Zizeeba';
        },

        get blueprintMidjourney() {
          const title = this.cleanRecipeTitle;
          const color = this.selectedCandidate?.winning_color || '#c48858';
          return 'A high-end commercial food photography shot of ' + title + ', styled for a gourmet cookbook, vibrant textures, natural daylight, shallow depth of field, warm cozy aesthetic, color palette accented by ' + color + ', shot on Hasselblad 50mm f/1.8 --ar 9:16 --v 6.1 --style raw --q 2';
        },

        get blueprintAltText() {
          const title = this.cleanRecipeTitle;
          const topTokens = (this.telemetry.high_save_tokens || []).slice(0, 4).map(t => t.token).join(', ');
          return 'Homemade ' + title + ' with golden crispy crust and savory seasoning. High engagement recipe card PDF featuring ' + (topTokens || 'easy dinner instructions') + '.';
        },

        get blueprintJsonLd() {
          if (!this.selectedCandidate) return '{}';
          const title = this.cleanRecipeTitle;
          const pinId = this.selectedCandidate.candidate_pin_id;
          const schema = {
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "Product",
                "name": title + " - Printable Recipe Card PDF",
                "image": "https://zizeeba.com/images/recipes/" + pinId + ".jpg",
                "description": "Comprehensive printable digital recipe card for " + title + " featuring step-by-step instructions, ingredients breakdown, and chef tips.",
                "brand": {
                  "@type": "Brand",
                  "name": "Zizeeba"
                },
                "offers": {
                  "@type": "Offer",
                  "url": "https://zizeeba.com/recipe/" + pinId,
                  "priceCurrency": "USD",
                  "price": "1.99",
                  "availability": "https://schema.org/InStock",
                  "priceValidUntil": "2027-12-31"
                }
              },
              {
                "@type": "Recipe",
                "name": title,
                "image": [
                  "https://zizeeba.com/images/recipes/" + pinId + ".jpg"
                ],
                "author": {
                  "@type": "Organization",
                  "name": "Zizeeba Culinary Kitchen"
                },
                "description": "Delicious homemade " + title + " crafted with simple ingredients and optimal kitchen workflow.",
                "prepTime": "PT15M",
                "cookTime": "PT30M",
                "totalTime": "PT45M",
                "recipeYield": "4 servings",
                "recipeCategory": "Main Course",
                "suitableForDiet": "https://schema.org/HealthyDiet"
              }
            ]
          };
          return JSON.stringify(schema, null, 2);
        },

        async initDashboard() {
          await this.fetchData();
          this.pollCrawlStatus();
          setInterval(() => this.pollCrawlStatus(), 3000);
          this.$nextTick(() => {
            if (window.lucide) window.lucide.createIcons();
          });
        },

        async fetchData() {
          this.isLoading = true;
          try {
            await Promise.all([
              this.fetchOverview(),
              this.fetchSeeds(),
              this.fetchIntersections()
            ]);
            if (this.seeds.length > 0 && !this.selectedSeedId) {
              this.selectedSeedId = this.seeds[0].pin_id;
            }
            await this.fetchTelemetry();
          } finally {
            this.isLoading = false;
            this.$nextTick(() => {
              if (window.lucide) window.lucide.createIcons();
            });
          }
        },

        async fetchOverview() {
          try {
            const res = await fetch('/api/overview');
            if (res.ok) this.overview = await res.json();
          } catch (e) {
            console.error('Error fetching overview:', e);
          }
        },

        async fetchSeeds() {
          try {
            const res = await fetch('/api/seeds');
            if (res.ok) {
              this.seeds = await res.json();
              if (this.seeds.length > 0 && !this.selectedSeedId) {
                this.selectedSeedId = this.seeds[0].pin_id;
              }
            }
          } catch (e) {
            console.error('Error fetching seeds:', e);
          }
        },

        async fetchIntersections() {
          try {
            const res = await fetch('/api/intersections?min_overlap=1');
            if (res.ok) this.candidates = await res.json();
          } catch (e) {
            console.error('Error fetching intersections:', e);
          }
        },

        async fetchTelemetry() {
          if (!this.selectedSeedId) return;
          try {
            const res = await fetch('/api/cluster-telemetry?seed_pin_id=' + this.selectedSeedId);
            if (res.ok) {
              this.telemetry = await res.json();
            }
          } catch (e) {
            console.error('Error fetching telemetry:', e);
          }
        },

        async triggerCrawl(seedPinId = null) {
          try {
            const res = await fetch('/api/crawl', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ seed_pin_id: seedPinId })
            });
            if (res.ok) {
              this.crawlStatus.is_crawling = true;
              this.crawlElapsed = 0;
              this.startElapsedTimer();
            }
          } catch (e) {
            alert('Failed to trigger crawl: ' + e.message);
          }
        },

        startElapsedTimer() {
          if (this.crawlTimer) clearInterval(this.crawlTimer);
          this.crawlTimer = setInterval(() => {
            if (this.crawlStatus.is_crawling) {
              this.crawlElapsed += 1;
            } else {
              clearInterval(this.crawlTimer);
            }
          }, 1000);
        },

        async pollCrawlStatus() {
          try {
            const res = await fetch('/api/crawl-status');
            if (res.ok) {
              const prevCrawling = this.crawlStatus.is_crawling;
              this.crawlStatus = await res.json();

              // If crawl just finished, refresh data automatically!
              if (prevCrawling && !this.crawlStatus.is_crawling) {
                await this.fetchData();
              }
            }
          } catch (e) {}
        },

        openBlueprint(item) {
          this.selectedCandidate = item;
          this.isBlueprintOpen = true;
          this.copiedField = null;
          this.$nextTick(() => {
            if (window.lucide) window.lucide.createIcons();
          });
        },

        async copyToClipboard(text, field) {
          try {
            await navigator.clipboard.writeText(text);
            this.copiedField = field;
            setTimeout(() => {
              if (this.copiedField === field) this.copiedField = null;
            }, 2000);
          } catch (e) {
            console.error('Failed to copy to clipboard:', e);
          }
        },

        async submitNewSeed() {
          this.isSubmitting = true;
          try {
            const res = await fetch('/api/seeds', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(this.newSeed)
            });
            if (res.ok) {
              const autoCrawl = this.newSeed.auto_crawl;
              const newPinId = this.newSeed.pin_id;
              this.newSeed = { pin_id: '', label: '', is_competitor: true, auto_crawl: true };
              this.isAddSeedOpen = false;
              await this.fetchData();

              if (autoCrawl) {
                await this.triggerCrawl(newPinId);
              }
            } else {
              const err = await res.json();
              alert('Error adding seed: ' + (err.error || 'Unknown error'));
            }
          } catch (e) {
            alert('Failed to submit seed: ' + e.message);
          } finally {
            this.isSubmitting = false;
          }
        }
      };
    }
  </script>
</body>
</html>`;
}

// Request Handler
const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;
  const method = req.method.toUpperCase();

  // Handle CORS Preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  try {
    // 1. POST /api/crawl
    if (method === 'POST' && pathname === '/api/crawl') {
      const body = await parseRequestBody(req);
      const seedPinId = body.seed_pin_id ? String(body.seed_pin_id).trim() : null;

      const triggerResult = triggerCrawlProcess(seedPinId);
      return sendJson(res, 200, {
        status: 'crawling_started',
        seed_pin_id: seedPinId || 'all_queued',
        ...triggerResult
      });
    }

    // 2. GET /api/crawl-status
    if (method === 'GET' && pathname === '/api/crawl-status') {
      return sendJson(res, 200, crawlState);
    }

    // 3. GET /api/cluster-telemetry
    if (method === 'GET' && pathname === '/api/cluster-telemetry') {
      let seedPinId = parsedUrl.searchParams.get('seed_pin_id');

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

    // 4. GET /api/overview
    if (method === 'GET' && pathname === '/api/overview') {
      const overviewRows = await sql`
        SELECT 
          (SELECT COUNT(*) FROM cluster_seeds) AS total_seeds,
          (SELECT COUNT(*) FROM cluster_seeds WHERE last_crawled_at IS NOT NULL) AS indexed_seeds,
          (SELECT COUNT(*) FROM cluster_seeds WHERE last_crawled_at IS NULL) AS queued_seeds,
          (SELECT COUNT(*) FROM candidate_graph_nodes) AS total_candidates,
          (SELECT COALESCE(ROUND(AVG(commercial_gap_ratio)::numeric, 2), 0) FROM cluster_arbitrage_metrics) AS avg_commercial_gap,
          (SELECT COUNT(*) FROM (
              SELECT candidate_pin_id 
              FROM candidate_graph_nodes 
              GROUP BY candidate_pin_id 
              HAVING COUNT(DISTINCT seed_pin_id) >= 2
          ) sub) AS intersecting_hubs_count;
      `;

      const overview = overviewRows[0] || {};

      return sendJson(res, 200, {
        total_seeds: Number(overview.total_seeds || 0),
        indexed_seeds: Number(overview.indexed_seeds || 0),
        queued_seeds: Number(overview.queued_seeds || 0),
        total_candidates: Number(overview.total_candidates || 0),
        avg_commercial_gap: Number(overview.avg_commercial_gap || 0),
        intersecting_hubs_count: Number(overview.intersecting_hubs_count || 0)
      });
    }

    // 5. GET /api/intersections
    if (method === 'GET' && pathname === '/api/intersections') {
      const minOverlap = Number(parsedUrl.searchParams.get('min_overlap')) || 1;
      const limit = Number(parsedUrl.searchParams.get('limit')) || 150;

      const rows = await sql`
        SELECT 
            c.candidate_pin_id,
            MAX(c.title) AS title,
            MAX(c.domain) AS domain,
            BOOL_OR(c.is_product) AS is_product,
            MAX(c.dominant_color) AS winning_color,
            COUNT(DISTINCT c.seed_pin_id) AS seed_overlap_count,
            ROUND(POWER(SUM(SQRT(GREATEST(c.saves, 1))), 2)::numeric, 2) AS pixie_multihit_score,
            SUM(c.saves) AS total_saves,
            ARRAY_AGG(DISTINCT c.seed_pin_id) AS originating_seeds
        FROM candidate_graph_nodes c
        GROUP BY c.candidate_pin_id
        HAVING COUNT(DISTINCT c.seed_pin_id) >= ${minOverlap}
        ORDER BY pixie_multihit_score DESC
        LIMIT ${limit};
      `;

      return sendJson(res, 200, rows);
    }

    // 6. GET /api/seeds
    if (method === 'GET' && pathname === '/api/seeds') {
      const seeds = await sql`
        SELECT 
            s.pin_id,
            s.label,
            s.is_competitor,
            s.velocity,
            s.last_crawled_at,
            s.created_at,
            m.total_candidates,
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
            SELECT *
            FROM cluster_arbitrage_metrics
            WHERE seed_pin_id = s.pin_id
            ORDER BY analyzed_at DESC
            LIMIT 1
        ) m ON true
        ORDER BY s.created_at DESC;
      `;

      return sendJson(res, 200, seeds);
    }

    // 7. POST /api/seeds
    if (method === 'POST' && pathname === '/api/seeds') {
      const body = await parseRequestBody(req);
      const pinId = String(body.pin_id || '').trim();
      const label = String(body.label || 'Manual Seed').trim();
      const isCompetitor = Boolean(body.is_competitor);

      if (!pinId) {
        return sendJson(res, 400, { error: 'pin_id is required' });
      }

      const result = await sql`
        INSERT INTO cluster_seeds (pin_id, label, is_competitor, velocity)
        VALUES (${pinId}, ${label}, ${isCompetitor}, 0)
        ON CONFLICT (pin_id) DO UPDATE SET
          label = EXCLUDED.label,
          is_competitor = EXCLUDED.is_competitor
        RETURNING pin_id, label, is_competitor, created_at;
      `;

      return sendJson(res, 201, { success: true, seed: result[0] });
    }

    // 8. GET /
    if (method === 'GET' && pathname === '/') {
      const html = getDashboardHtml();
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache'
      });
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
  console.log(`  Pin Arbitrage Command Center V2 active on http://localhost:${PORT}`);
  console.log(`=============================================================`);
});
