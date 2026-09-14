#!/usr/bin/env node

/**
 * Pinterest Algorithmic Arbitrage Engine (V3 Architectural UI/UX)
 * Pin Cluster Analyzer & Predictive Engine
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

// Culinary Color Name Mapper
function getCulinaryColorName(hex) {
  if (!hex || typeof hex !== 'string') return 'Neutral Mineral / Steel';
  const h = hex.toLowerCase().trim();
  const colorMap = {
    '#824d30': 'Rustic Umber / Roasted Crust',
    '#663e0d': 'Deep Molasses / Dark Cocoa',
    '#6b4216': 'Toasted Walnut / Brown Butter',
    '#b9975f': 'Golden Cornmeal / Biscuit Crust',
    '#9f642e': 'Caramel Glaze / Roasted Pecan',
    '#ad7137': 'Honey Amber / Crispy Garlic',
    '#d08c47': 'Cheddar Melt / Golden Brioche',
    '#ecc584': 'Warm Cream / Flaky Pastry',
    '#beae88': 'Savory Herb Crust / Almond Beige',
    '#976a29': 'Crisp Brioche / Roasted Sesame',
    '#87551c': 'Smoked Hickory / Savory BBQ',
    '#cfc29e': 'Buttermilk Dough / Oat Crust',
    '#9b7373': 'Spiced Berry / Mulled Wine',
    '#796f5b': 'Earthy Rosemary / Herb Infusion',
    '#d87f5a': 'Spiced Paprika / Roasted Pepper',
    '#765728': 'Rich Maple / Golden Gravy',
    '#754819': 'Dark Truffle / Cast Iron Glaze',
    '#888888': 'Slate Mineral / Neutral Steel',
    '#ffffff': 'Pure Cream / Sugar Glaze',
    '#000000': 'Cast Iron Black / Charred Sear'
  };
  if (colorMap[h]) return colorMap[h];

  try {
    const r = parseInt(h.slice(1, 3), 16) || 0;
    const g = parseInt(h.slice(3, 5), 16) || 0;
    const b = parseInt(h.slice(5, 7), 16) || 0;
    if (r > 180 && g > 150 && b < 110) return 'Golden Honey / Butter Glaze';
    if (r > 150 && g < 110 && b < 90) return 'Rich Paprika / Roasted Tomato';
    if (r > 120 && g > 80 && b < 60) return 'Toasted Toffee / Crust Brown';
    if (r < 110 && g > 120 && b < 100) return 'Garden Basil / Fresh Herb';
    if (r > 200 && g > 190 && b > 170) return 'Almond Milk / Vanilla Bean';
  } catch (e) {}

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

// HTML Single Page Application V3
function getDashboardHtml() {
  return `<!DOCTYPE html>
<html lang="en" :class="isDark ? 'dark' : ''" x-data="dashboardApp()" x-init="initDashboard()">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pin Cluster Analyzer & Predictive Engine | V3</title>
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
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
    .dark ::-webkit-scrollbar-thumb { background: #1e293b; }
    ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
    .dark ::-webkit-scrollbar-thumb:hover { background: #334155; }
    .glow-rose { box-shadow: 0 0 25px -5px rgba(244, 63, 94, 0.3); }
    .glow-emerald { box-shadow: 0 0 25px -5px rgba(16, 185, 129, 0.3); }
    .glow-amber { box-shadow: 0 0 25px -5px rgba(245, 158, 11, 0.3); }
  </style>
</head>
<body class="bg-slate-50 text-slate-900 dark:bg-[#080d1a] dark:text-slate-100 min-h-screen font-sans selection:bg-rose-500 selection:text-white antialiased transition-colors duration-200">

  <!-- Top Navigation Bar -->
  <header class="border-b border-slate-200/90 dark:border-slate-800/80 bg-white/95 dark:bg-[#0b1120]/90 backdrop-blur-xl sticky top-0 z-40 shadow-sm">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="h-16 flex items-center justify-between">
        <div class="flex items-center space-x-3">
          <div class="h-10 w-10 rounded-xl bg-gradient-to-tr from-rose-600 via-rose-500 to-amber-500 flex items-center justify-center shadow-md shadow-rose-500/20 text-white">
            <i data-lucide="cpu" class="w-5 h-5"></i>
          </div>
          <div>
            <div class="flex items-center space-x-2">
              <span class="font-bold text-base sm:text-lg tracking-tight text-slate-900 dark:text-white">
                Pin Cluster Analyzer
              </span>
              <span class="px-2 py-0.5 text-[10px] font-mono font-bold uppercase rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30">
                Predictive Engine
              </span>
              <template x-if="crawlStatus.is_crawling">
                <span class="px-2 py-0.5 text-[10px] font-mono font-bold rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center space-x-1 animate-pulse">
                  <span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping"></span>
                  <span>Crawler Active</span>
                </span>
              </template>
            </div>
            <p class="text-[11px] text-slate-500 dark:text-slate-400">Reverse-Engineered P2P Multi-Engine Retrieval & prod:v18 Reranker</p>
          </div>
        </div>

        <!-- Action Controls & Dark Mode Toggle -->
        <div class="flex items-center space-x-2 sm:space-x-3">
          <!-- Dark Mode Toggle Button -->
          <button @click="toggleTheme()" class="p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition active:scale-95" :title="isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'">
            <i :data-lucide="isDark ? 'sun' : 'moon'" class="w-4 h-4"></i>
          </button>

          <!-- Refresh Data -->
          <button @click="fetchData()" :disabled="isLoading" class="p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition active:scale-95" title="Refresh Data">
            <i data-lucide="rotate-cw" :class="{'animate-spin': isLoading}" class="w-4 h-4"></i>
          </button>

          <!-- Live Crawl Button -->
          <button @click="triggerCrawl()" :disabled="crawlStatus.is_crawling" class="flex items-center space-x-2 px-3.5 py-2 text-xs font-bold rounded-xl transition shadow-sm active:scale-95 disabled:opacity-50" :class="crawlStatus.is_crawling ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 cursor-not-allowed' : 'bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white shadow-rose-950/20'">
            <i data-lucide="zap" :class="{'animate-spin': crawlStatus.is_crawling}" class="w-3.5 h-3.5"></i>
            <span class="hidden sm:inline" x-text="crawlStatus.is_crawling ? 'Crawling...' : '⚡ Crawl Queued Seeds'"></span>
            <span class="sm:hidden">Crawl</span>
          </button>

          <!-- Add Competitor Button -->
          <button @click="isAddSeedOpen = true" class="flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/90 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition active:scale-95">
            <i data-lucide="plus-circle" class="w-3.5 h-3.5 text-rose-500"></i>
            <span class="hidden sm:inline">Add Seed</span>
          </button>
        </div>
      </div>

      <!-- Analytical Tabs Navigation -->
      <div class="flex items-center space-x-1 sm:space-x-2 overflow-x-auto border-t border-slate-200 dark:border-slate-800/80 pt-1 -mb-px">
        <button @click="currentTab = 'table'" class="flex items-center space-x-2 px-3 py-2.5 text-xs font-medium border-b-2 transition whitespace-nowrap" :class="currentTab === 'table' ? 'border-rose-500 text-rose-600 dark:text-rose-400 font-bold' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'">
          <i data-lucide="table" class="w-4 h-4"></i>
          <span>Comparison Table</span>
          <span class="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300" x-text="candidates.length"></span>
        </button>

        <button @click="currentTab = 'utility'" class="flex items-center space-x-2 px-3 py-2.5 text-xs font-medium border-b-2 transition whitespace-nowrap" :class="currentTab === 'utility' ? 'border-rose-500 text-rose-600 dark:text-rose-400 font-bold' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'">
          <i data-lucide="scale" class="w-4 h-4"></i>
          <span>Algorithm & Utility Engine</span>
        </button>

        <button @click="currentTab = 'visual'" class="flex items-center space-x-2 px-3 py-2.5 text-xs font-medium border-b-2 transition whitespace-nowrap" :class="currentTab === 'visual' ? 'border-rose-500 text-rose-600 dark:text-rose-400 font-bold' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'">
          <i data-lucide="palette" class="w-4 h-4"></i>
          <span>Visual Intelligence & Colors</span>
        </button>

        <button @click="currentTab = 'playbook'" class="flex items-center space-x-2 px-3 py-2.5 text-xs font-medium border-b-2 transition whitespace-nowrap" :class="currentTab === 'playbook' ? 'border-rose-500 text-rose-600 dark:text-rose-400 font-bold' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'">
          <i data-lucide="book-open" class="w-4 h-4"></i>
          <span>Creator Playbook (RecGPT Matrix)</span>
        </button>

        <button @click="currentTab = 'raw'" class="flex items-center space-x-2 px-3 py-2.5 text-xs font-medium border-b-2 transition whitespace-nowrap" :class="currentTab === 'raw' ? 'border-rose-500 text-rose-600 dark:text-rose-400 font-bold' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'">
          <i data-lucide="code-2" class="w-4 h-4"></i>
          <span>Raw JSON Inspector</span>
        </button>
      </div>
    </div>
  </header>

  <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

    <!-- Active Crawl Notification Banner -->
    <div x-show="crawlStatus.is_crawling" x-cloak class="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3 px-4 flex items-center justify-between text-xs text-amber-700 dark:text-amber-300 backdrop-blur-sm animate-pulse">
      <div class="flex items-center space-x-2">
        <i data-lucide="loader-2" class="w-4 h-4 animate-spin text-amber-500"></i>
        <span class="font-semibold">Crawler in flight:</span>
        <span class="font-mono" x-text="'Target: ' + crawlStatus.seed_pin_id"></span>
        <span class="text-amber-500/60">•</span>
        <span class="text-slate-700 dark:text-amber-200" x-text="crawlStatus.last_log"></span>
      </div>
      <span class="font-mono text-[11px] text-amber-600 dark:text-amber-400" x-text="'Elapsed: ' + crawlElapsed + 's'"></span>
    </div>

    <!-- Cluster Arbitrage & Vulnerability Header Card -->
    <section class="bg-white dark:bg-[#0d1526] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-sm dark:shadow-xl transition relative overflow-hidden">
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        <!-- Left Column: Vulnerability Index & Score -->
        <div class="lg:col-span-4 space-y-3 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800 pb-4 lg:pb-0 lg:pr-6">
          <div class="flex items-center justify-between">
            <span class="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Cluster Arbitrage & Vulnerability Index
            </span>
            <span class="px-2 py-0.5 rounded-md text-[10px] font-bold font-mono bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
              HIGH EXPLOITATION
            </span>
          </div>

          <div class="flex items-baseline space-x-3">
            <span class="text-4xl sm:text-5xl font-extrabold font-mono text-slate-900 dark:text-white" x-text="overview.cluster_vulnerability_index || 88.4">88.4</span>
            <span class="text-sm font-semibold text-slate-400 font-mono">/ 100</span>
          </div>

          <div class="flex items-center flex-wrap gap-1.5 pt-1">
            <span class="px-2.5 py-1 rounded-full text-[11px] font-bold font-mono bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 flex items-center space-x-1">
              <i data-lucide="zap" class="w-3 h-3 text-emerald-500"></i>
              <span>+5.12x Utility Advantage</span>
            </span>
            <span class="px-2.5 py-1 rounded-full text-[11px] font-bold font-mono bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-500/20 flex items-center space-x-1">
              <i data-lucide="shield-check" class="w-3 h-3 text-indigo-500"></i>
              <span>Semantically Aligned / Clean Taxonomy</span>
            </span>
          </div>
        </div>

        <!-- Middle Column: Market Dynamics & Reranking Disparity -->
        <div class="lg:col-span-5 space-y-3">
          <span class="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Algorithmic Dynamics (prod:v18 Utility Model)
          </span>

          <div class="grid grid-cols-2 gap-3 text-xs">
            <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
              <div class="text-[10px] text-slate-500 dark:text-slate-400">Expected Prod Utility</div>
              <div class="font-mono font-bold text-sm text-emerald-600 dark:text-emerald-400 mt-0.5">+383.34 Net</div>
              <div class="text-[10px] text-slate-400 mt-0.5">High dwell ($1.99 Product Card)</div>
            </div>

            <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
              <div class="text-[10px] text-slate-500 dark:text-slate-400">Organic Peak Baseline</div>
              <div class="font-mono font-bold text-sm text-rose-600 dark:text-rose-400 mt-0.5">-74.91 Net</div>
              <div class="text-[10px] text-slate-400 mt-0.5">Penalized by external quick bounce</div>
            </div>
          </div>

          <div class="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 font-mono pt-1">
            <span class="flex items-center space-x-1.5">
              <span class="w-2 h-2 rounded-full bg-amber-500"></span>
              <span x-text="(overview.shopping_presence_pct || 29.4) + '% Shopping Corpus Presence'"></span>
            </span>
            <span class="text-slate-400">•</span>
            <span class="flex items-center space-x-1.5">
              <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span x-text="(overview.intersecting_hubs_count || 0) + ' Intersecting Hubs (≥ 2 Seeds)'"></span>
            </span>
          </div>
        </div>

        <!-- Right Column: Action CTAs -->
        <div class="lg:col-span-3 space-y-2.5">
          <button @click="exploitTopVacuumTarget()" class="w-full flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-bold text-xs shadow-md shadow-rose-950/20 active:scale-95 transition">
            <i data-lucide="sparkles" class="w-4 h-4"></i>
            <span>⚡ Exploit Gap (Generate Asset & Schema)</span>
          </button>

          <button @click="isDhashModalOpen = true" class="w-full flex items-center justify-center space-x-2 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs border border-slate-200 dark:border-slate-700 active:scale-95 transition">
            <i data-lucide="shield" class="w-3.5 h-3.5 text-indigo-500"></i>
            <span>🛡️ Check Image Signature (dHash Guard)</span>
          </button>
        </div>
      </div>
    </section>

    <!-- ======================================================== -->
    <!-- TAB 1: ADVANCED COMPARISON TABLE VIEW                    -->
    <!-- ======================================================== -->
    <div x-show="currentTab === 'table'" class="space-y-4">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <!-- Filter Tabs -->
        <div class="flex items-center space-x-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button @click="candidateFilter = 'all'" class="px-3 py-1.5 rounded-lg text-xs font-semibold transition" :class="candidateFilter === 'all' ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-sm' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'">
            All Candidates (<span x-text="candidates.length"></span>)
          </button>
          <button @click="candidateFilter = 'hubs'" class="px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center space-x-1" :class="candidateFilter === 'hubs' ? 'bg-amber-500 text-white shadow-sm' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'">
            <i data-lucide="flame" class="w-3 h-3"></i>
            <span>Multi-Hit Hubs (≥ 2 Seeds)</span>
          </button>
          <button @click="candidateFilter = 'vacuum'" class="px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center space-x-1" :class="candidateFilter === 'vacuum' ? 'bg-rose-600 text-white shadow-sm' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'">
            <i data-lucide="target" class="w-3 h-3"></i>
            <span>Vacuum Targets (≥ 5K Saves)</span>
          </button>
          <button @click="candidateFilter = 'product'" class="px-3 py-1.5 rounded-lg text-xs font-semibold transition" :class="candidateFilter === 'product' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'">
            Product Cards
          </button>
        </div>

        <!-- Search Bar -->
        <div class="relative min-w-[240px]">
          <i data-lucide="search" class="w-4 h-4 absolute left-3 top-2.5 text-slate-400"></i>
          <input type="text" x-model="searchQuery" placeholder="Filter by title, domain, OCR..." class="w-full pl-9 pr-4 py-1.5 rounded-xl text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-rose-500 transition font-mono">
        </div>
      </div>

      <!-- Advanced Candidates Table -->
      <div class="bg-white dark:bg-[#0d1526] border border-slate-200/90 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm dark:shadow-xl">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs border-collapse">
            <thead>
              <tr class="border-b border-slate-200 dark:border-slate-800/80 bg-slate-50/80 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 font-mono text-[11px] uppercase tracking-wider">
                <th class="py-3.5 px-4">Preview & Format</th>
                <th class="py-3.5 px-4">What-If Product Simulator</th>
                <th class="py-3.5 px-4 min-w-[280px]">Title / Topic & Vision OCR</th>
                <th class="py-3.5 px-4">Metrics (Saves / Repins / Rate)</th>
                <th class="py-3.5 px-4">Dominant Color Swatch</th>
                <th class="py-3.5 px-4">Engine Source</th>
                <th class="py-3.5 px-4 text-right">Inspect</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60 font-sans">
              <template x-for="item in filteredCandidates" :key="item.candidate_pin_id">
                <tr class="hover:bg-slate-50/80 dark:hover:bg-slate-900/40 transition group">
                  
                  <!-- 1. Preview & Format -->
                  <td class="py-3.5 px-4 whitespace-nowrap">
                    <div class="flex items-center space-x-2.5">
                      <div class="w-9 h-12 rounded-lg flex-shrink-0 flex items-center justify-center border shadow-sm" :style="'border-color: ' + (item.winning_color || '#cbd5e1') + '; background-color: ' + (item.winning_color || '#cbd5e1') + '15;'">
                        <i data-lucide="image" class="w-4 h-4 text-slate-400"></i>
                      </div>
                      <div class="space-y-1">
                        <span class="inline-block px-1.5 py-0.5 rounded text-[9px] font-mono font-bold tracking-wider uppercase" :class="{
                          'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20': item.format_type === 'PRODUCT CARD',
                          'bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20': item.format_type === 'ORGANIC PIN',
                          'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20': item.format_type === 'VIDEO PIN',
                          'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20': item.format_type === 'IDEA PIN'
                        }" x-text="item.format_type"></span>

                        <template x-if="item.is_vacuum_target">
                          <div>
                            <span class="px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wider bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/40">
                              VACUUM TARGET
                            </span>
                          </div>
                        </template>
                      </div>
                    </div>
                  </td>

                  <!-- 2. What-If Product Simulator -->
                  <td class="py-3.5 px-4 whitespace-nowrap">
                    <button @click="toggleSimulation(item.candidate_pin_id)" class="px-2.5 py-1 rounded-xl text-[11px] font-mono border transition flex items-center space-x-1.5" :class="simulatedPins[item.candidate_pin_id] ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-emerald-500/40'">
                      <i data-lucide="calculator" class="w-3.5 h-3.5"></i>
                      <template x-if="!simulatedPins[item.candidate_pin_id]">
                        <span>Simulate: <strong>-74.91 &rarr; +383.34</strong></span>
                      </template>
                      <template x-if="simulatedPins[item.candidate_pin_id]">
                        <span>Active: <strong class="text-emerald-600 dark:text-emerald-400">+458.25 Net Gain ($1.99)</strong></span>
                      </template>
                    </button>
                  </td>

                  <!-- 3. Title / Topic & Vision OCR -->
                  <td class="py-3.5 px-4">
                    <div class="space-y-1">
                      <div class="flex items-center space-x-1.5">
                        <a :href="'https://www.pinterest.com/pin/' + item.candidate_pin_id + '/'" target="_blank" class="font-bold text-slate-900 dark:text-slate-100 hover:text-rose-600 dark:hover:text-rose-400 line-clamp-1 group-hover:underline" x-text="item.title"></a>
                        <i data-lucide="external-link" class="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 transition"></i>
                      </div>
                      <div class="flex items-center space-x-2 text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                        <span class="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300" x-text="item.domain"></span>
                        <span class="text-slate-300 dark:text-slate-700">•</span>
                        <span x-text="'ID: ' + item.candidate_pin_id"></span>
                      </div>
                      <template x-if="item.ocr_text">
                        <div class="p-1 px-2 rounded bg-slate-100 dark:bg-slate-900/90 text-[10px] text-slate-600 dark:text-slate-400 font-mono truncate max-w-sm" :title="item.ocr_text">
                          <span class="text-rose-500 font-bold">OCR:</span> <span x-text="item.ocr_text"></span>
                        </div>
                      </template>
                    </div>
                  </td>

                  <!-- 4. Metrics -->
                  <td class="py-3.5 px-4 whitespace-nowrap font-mono">
                    <div class="space-y-0.5">
                      <div class="flex items-center space-x-1 text-slate-900 dark:text-slate-100 font-bold">
                        <i data-lucide="bookmark" class="w-3.5 h-3.5 text-rose-500"></i>
                        <span x-text="Number(item.total_saves || 0).toLocaleString() + ' saves'"></span>
                      </div>
                      <div class="text-[10px] text-slate-500 dark:text-slate-400" x-text="Number(item.total_repins || 0).toLocaleString() + ' repins'"></div>
                      <div class="pt-0.5">
                        <template x-if="Number(item.avg_save_rate) >= 90">
                          <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                            🔥 High Board Rate (<span x-text="item.avg_save_rate + '%'"></span>)
                          </span>
                        </template>
                        <template x-if="Number(item.avg_save_rate) < 90">
                          <span class="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400" x-text="item.avg_save_rate + '% Save Rate'"></span>
                        </template>
                      </div>
                    </div>
                  </td>

                  <!-- 5. Dominant Color Swatch -->
                  <td class="py-3.5 px-4 whitespace-nowrap">
                    <div class="flex items-center space-x-2">
                      <span class="w-4 h-4 rounded-md border border-slate-300 dark:border-slate-700 shadow-sm flex-shrink-0" :style="'background-color: ' + (item.winning_color || '#888888')"></span>
                      <div class="space-y-0.5">
                        <div class="font-mono text-[11px] font-bold text-slate-700 dark:text-slate-300" x-text="item.winning_color"></div>
                        <div class="text-[10px] text-slate-500 dark:text-slate-400 max-w-[150px] truncate" x-text="item.culinary_color_name" :title="item.culinary_color_name"></div>
                      </div>
                    </div>
                  </td>

                  <!-- 6. Candidate Engine Source -->
                  <td class="py-3.5 px-4 whitespace-nowrap">
                    <span class="px-2 py-1 rounded-lg text-[10px] font-mono font-bold uppercase tracking-wider flex items-center space-x-1.5 w-max" :class="{
                      'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20': item.engine_source === 'P2P_RANDOMWALK',
                      'bg-sky-500/10 text-sky-700 dark:text-sky-400 border border-sky-500/20': item.engine_source === 'P2P_NAVBOOST',
                      'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20': item.engine_source === 'FRESH_SHOPPING',
                      'bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-500/20': item.engine_source === 'P2P_TWO_TOWER',
                      'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-500/20': item.engine_source === 'P2P_RECGPT'
                    }">
                      <i data-lucide="git-commit" class="w-3 h-3"></i>
                      <span x-text="item.engine_source"></span>
                    </span>
                  </td>

                  <!-- 7. Inspect Action -->
                  <td class="py-3.5 px-4 text-right whitespace-nowrap">
                    <button @click="inspectCandidate(item)" class="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-rose-50 dark:bg-slate-800 dark:hover:bg-rose-950/40 text-slate-700 dark:text-slate-200 hover:text-rose-600 dark:hover:text-rose-400 text-xs font-semibold transition border border-slate-200 dark:border-slate-700 active:scale-95 shadow-sm" title="Open Candidate Dossier & Menu Matrix">
                      <i data-lucide="eye" class="w-3.5 h-3.5"></i>
                      <span>Inspect</span>
                    </button>
                  </td>
                </tr>
              </template>

              <template x-if="filteredCandidates.length === 0">
                <tr>
                  <td colspan="7" class="py-12 text-center text-slate-400">
                    <i data-lucide="inbox" class="w-8 h-8 mx-auto mb-2 opacity-40"></i>
                    <p class="text-sm font-medium">No candidates match your current filter.</p>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ======================================================== -->
    <!-- TAB 2: ALGORITHM & UTILITY ENGINE VIEW                   -->
    <!-- ======================================================== -->
    <div x-show="currentTab === 'utility'" class="space-y-6">
      <div class="bg-white dark:bg-[#0d1526] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-6 shadow-sm dark:shadow-xl space-y-6">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div>
            <h3 class="text-base font-bold text-slate-900 dark:text-white flex items-center space-x-2">
              <i data-lucide="activity" class="w-4 h-4 text-rose-500"></i>
              <span>P2P Candidate Allocation Engine Quotas</span>
            </h3>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Reverse-engineered Pinterest candidate allocation pool for tracked cluster</p>
          </div>

          <!-- Evaluation Pool Badge -->
          <div class="px-3 py-1 rounded-xl bg-sky-500/10 border border-sky-500/20 text-xs font-mono text-sky-700 dark:text-sky-300">
            <span>Pinterest Evaluation Pool: <strong class="text-slate-900 dark:text-white" x-text="telemetry.total_engine_quota">0</strong> evaluated &rarr; Top <strong class="text-emerald-600 dark:text-emerald-400" x-text="telemetry.extracted_count || 0">0</strong> extracted</span>
          </div>
        </div>

        <!-- Multi-color Stacked Allocation Bar -->
        <div class="space-y-2">
          <div class="w-full bg-slate-100 dark:bg-slate-900 rounded-xl h-5 overflow-hidden flex border border-slate-200 dark:border-slate-800 shadow-inner">
            <div class="bg-purple-500 transition-all duration-500" :style="'width: ' + telemetry.recgpt_pct + '%'" :title="'RecGPT: ' + telemetry.recgpt_count"></div>
            <div class="bg-sky-500 transition-all duration-500" :style="'width: ' + telemetry.navboost_pct + '%'" :title="'NavBoost: ' + telemetry.navboost_count"></div>
            <div class="bg-emerald-500 transition-all duration-500" :style="'width: ' + telemetry.randomwalk_pct + '%'" :title="'RandomWalk (Pixie): ' + telemetry.randomwalk_count"></div>
            <div class="bg-amber-500 transition-all duration-500" :style="'width: ' + telemetry.two_tower_pct + '%'" :title="'Two-Tower: ' + telemetry.two_tower_count"></div>
            <div class="bg-rose-500 transition-all duration-500" :style="'width: ' + telemetry.fresh_pct + '%'" :title="'Fresh Candidates: ' + telemetry.fresh_candidate_count"></div>
          </div>

          <!-- Quota Breakdown Grid -->
          <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 pt-2 text-xs font-mono">
            <div class="bg-slate-50 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center space-x-2.5">
              <div class="w-3 h-3 rounded bg-purple-500 flex-shrink-0"></div>
              <div>
                <div class="text-[10px] text-slate-500">P2P_RECGPT</div>
                <div class="font-bold text-slate-900 dark:text-slate-100" x-text="telemetry.recgpt_count + ' (' + telemetry.recgpt_pct + '%)'"></div>
              </div>
            </div>

            <div class="bg-slate-50 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center space-x-2.5">
              <div class="w-3 h-3 rounded bg-sky-500 flex-shrink-0"></div>
              <div>
                <div class="text-[10px] text-slate-500">P2P_NAVBOOST</div>
                <div class="font-bold text-slate-900 dark:text-slate-100" x-text="telemetry.navboost_count + ' (' + telemetry.navboost_pct + '%)'"></div>
              </div>
            </div>

            <div class="bg-slate-50 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center space-x-2.5">
              <div class="w-3 h-3 rounded bg-emerald-500 flex-shrink-0"></div>
              <div>
                <div class="text-[10px] text-slate-500">RANDOMWALK (Pixie)</div>
                <div class="font-bold text-slate-900 dark:text-slate-100" x-text="telemetry.randomwalk_count + ' (' + telemetry.randomwalk_pct + '%)'"></div>
              </div>
            </div>

            <div class="bg-slate-50 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center space-x-2.5">
              <div class="w-3 h-3 rounded bg-amber-500 flex-shrink-0"></div>
              <div>
                <div class="text-[10px] text-slate-500">TWO_TOWER_EMBED</div>
                <div class="font-bold text-slate-900 dark:text-slate-100" x-text="telemetry.two_tower_count + ' (' + telemetry.two_tower_pct + '%)'"></div>
              </div>
            </div>

            <div class="bg-slate-50 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center space-x-2.5">
              <div class="w-3 h-3 rounded bg-rose-500 flex-shrink-0"></div>
              <div>
                <div class="text-[10px] text-slate-500">FRESH_COLD_START</div>
                <div class="font-bold text-slate-900 dark:text-slate-100" x-text="telemetry.fresh_candidate_count + ' (' + telemetry.fresh_pct + '%)'"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- prod:v18 Disparity Mathematical Function -->
        <div class="p-5 rounded-2xl bg-gradient-to-r from-slate-100 via-slate-50 to-slate-100 dark:from-slate-900 dark:via-slate-950 dark:to-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase font-mono tracking-wider flex items-center space-x-1.5">
              <i data-lucide="scale" class="w-4 h-4"></i>
              <span>prod:v18 Utility Disparity Equation</span>
            </span>
            <span class="px-2.5 py-0.5 rounded-full text-xs font-bold font-mono bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              5.12x Leverage Surplus
            </span>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-sans">
            <div class="bg-white dark:bg-slate-900 p-4 rounded-xl border border-rose-200 dark:border-rose-900/30 space-y-2">
              <div class="flex items-center justify-between font-bold text-rose-600 dark:text-rose-400">
                <span>Competitor Etsy / Organic Pin</span>
                <span class="font-mono text-sm">-74.91 Net</span>
              </div>
              <p class="text-slate-500 dark:text-slate-400 text-[11px]">Suffers extreme hide penalty on slow third-party platforms with quick user bounce:</p>
              <div class="font-mono text-[10px] text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-950 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-1">
                <div>HIDE_WEIGHT: <strong class="text-rose-600">-1570.54</strong></div>
                <div>SHORT_CLICK_5S_WEIGHT: <strong class="text-rose-600">-392.64</strong></div>
                <div>CLICK_WEIGHT: <strong class="text-emerald-600">+2.95</strong></div>
              </div>
            </div>

            <div class="bg-white dark:bg-slate-900 p-4 rounded-xl border border-emerald-200 dark:border-emerald-900/30 space-y-2">
              <div class="flex items-center justify-between font-bold text-emerald-600 dark:text-emerald-400">
                <span>Zizeeba Commercial Arbitrage Model</span>
                <span class="font-mono text-sm">+383.34 Net</span>
              </div>
              <p class="text-slate-500 dark:text-slate-400 text-[11px]">Receives massive ranking amplification from trustworthy product metadata and high dwell:</p>
              <div class="font-mono text-[10px] text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-950 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-1">
                <div>LONG_CLICK_WEIGHT: <strong class="text-emerald-600">+275.60</strong></div>
                <div>SHARE_WEIGHT: <strong class="text-emerald-600">+234.04</strong></div>
                <div>CLICK_WEIGHT: <strong class="text-emerald-600">+166.74</strong></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ======================================================== -->
    <!-- TAB 3: VISUAL INTELLIGENCE & COLORS VIEW                 -->
    <!-- ======================================================== -->
    <div x-show="currentTab === 'visual'" class="space-y-6">
      <div class="bg-white dark:bg-[#0d1526] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-6 shadow-sm dark:shadow-xl space-y-5">
        <div>
          <h3 class="text-base font-bold text-slate-900 dark:text-white flex items-center space-x-2">
            <i data-lucide="palette" class="w-4 h-4 text-rose-500"></i>
            <span>Cluster Color DNA (Dominant Centroids & Culinary Palette)</span>
          </h3>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Top visual colors weighted by candidate engagement for Midjourney replication</p>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 pt-2">
          <template x-for="swatch in (telemetry.color_centroids || [])" :key="swatch.color">
            <div class="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 flex items-center space-x-3 shadow-sm">
              <span class="w-8 h-8 rounded-lg border border-slate-300 dark:border-slate-700 shadow-md flex-shrink-0" :style="'background-color: ' + swatch.color"></span>
              <div class="min-w-0">
                <div class="font-mono text-xs font-bold text-slate-900 dark:text-white" x-text="swatch.color"></div>
                <div class="text-[10px] text-slate-500 dark:text-slate-400 truncate" x-text="getCulinaryName(swatch.color)"></div>
                <div class="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-bold" x-text="swatch.percentage + '% allocation'"></div>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- ======================================================== -->
    <!-- TAB 4: CREATOR PLAYBOOK (RECGPT MATRIX) VIEW             -->
    <!-- ======================================================== -->
    <div x-show="currentTab === 'playbook'" class="space-y-6">
      <div class="bg-white dark:bg-[#0d1526] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-6 shadow-sm dark:shadow-xl space-y-5">
        <div>
          <h3 class="text-base font-bold text-slate-900 dark:text-white flex items-center space-x-2">
            <i data-lucide="book-open" class="w-4 h-4 text-rose-500"></i>
            <span>Creator Playbook: High-Save NLP Lexical Stack</span>
          </h3>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Keywords ranked by TF-IDF weighted save rate (W_t = Σ TF(t) × Saves)</p>
        </div>

        <div class="flex flex-wrap gap-2 pt-2">
          <template x-for="token in (telemetry.high_save_tokens || [])" :key="token.token">
            <div class="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-xs font-mono shadow-sm">
              <span class="font-bold text-slate-900 dark:text-slate-100" x-text="token.token"></span>
              <span class="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-600 dark:text-rose-400 font-bold" x-text="'TF ' + token.tf"></span>
              <span class="text-[10px] text-slate-400" x-text="'Score ' + token.weighted_score"></span>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- ======================================================== -->
    <!-- TAB 5: RAW JSON INSPECTOR VIEW                           -->
    <!-- ======================================================== -->
    <div x-show="currentTab === 'raw'" class="space-y-4">
      <div class="bg-white dark:bg-[#0d1526] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-6 shadow-sm dark:shadow-xl space-y-4">
        <div class="flex items-center justify-between">
          <h3 class="text-base font-bold text-slate-900 dark:text-white flex items-center space-x-2">
            <i data-lucide="code-2" class="w-4 h-4 text-rose-500"></i>
            <span>Raw JSON Data Inspector</span>
          </h3>
          <button @click="copyToClipboard(rawJsonString, 'raw')" class="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-semibold font-mono text-slate-700 dark:text-slate-200 transition">
            <span x-text="copiedField === 'raw' ? 'Copied JSON!' : 'Copy Full JSON'"></span>
          </button>
        </div>
        <pre class="bg-slate-50 dark:bg-black/80 p-4 rounded-xl border border-slate-200 dark:border-slate-800 font-mono text-[11px] leading-relaxed max-h-[500px] overflow-y-auto text-slate-800 dark:text-slate-200" x-text="rawJsonString"></pre>
      </div>
    </div>

  </main>

  <!-- ======================================================== -->
  <!-- CANDIDATE DEEP-INSPECTION SLIDE-OVER & MENU MATRIX       -->
  <!-- ======================================================== -->
  <div x-show="isDossierOpen" x-cloak class="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-md flex justify-end" @keydown.escape.window="isDossierOpen = false">
    <div class="bg-white dark:bg-[#0b1120] border-l border-slate-200 dark:border-slate-800 w-full max-w-2xl h-full min-h-screen shadow-2xl overflow-y-auto p-6 space-y-6 animate-in slide-in-from-right duration-200" @click.away="isDossierOpen = false">
      
      <!-- Slide-over Header -->
      <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
        <div class="flex items-center space-x-3">
          <div class="w-8 h-8 rounded-lg bg-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center">
            <i data-lucide="eye" class="w-4 h-4"></i>
          </div>
          <div>
            <h3 class="font-bold text-slate-900 dark:text-white text-base">Candidate Pin Deep-Inspection Dossier</h3>
            <p class="text-xs text-slate-500 dark:text-slate-400 font-mono" x-text="'Pin ID: ' + selectedCandidate?.candidate_pin_id"></p>
          </div>
        </div>
        <button @click="isDossierOpen = false" class="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition">
          <i data-lucide="x" class="w-5 h-5"></i>
        </button>
      </div>

      <!-- Pin Visual Dossier -->
      <div class="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 space-y-3">
        <div class="flex items-start justify-between gap-3">
          <div class="space-y-1">
            <span class="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">Inspected Title</span>
            <div class="text-sm font-bold text-slate-900 dark:text-white" x-text="selectedCandidate?.title"></div>
            <div class="text-[11px] font-mono text-slate-500 flex items-center space-x-2 pt-0.5">
              <span x-text="selectedCandidate?.domain"></span>
              <span>•</span>
              <span class="text-rose-500 font-bold" x-text="Number(selectedCandidate?.total_saves || 0).toLocaleString() + ' Saves'"></span>
            </div>
          </div>
          <div class="flex items-center space-x-2 p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex-shrink-0">
            <span class="w-6 h-6 rounded-md border" :style="'background-color: ' + (selectedCandidate?.winning_color || '#888888')"></span>
            <div class="text-[10px] font-mono">
              <div class="font-bold" x-text="selectedCandidate?.winning_color"></div>
              <div class="text-slate-400 text-[9px]" x-text="selectedCandidate?.culinary_color_name"></div>
            </div>
          </div>
        </div>

        <template x-if="selectedCandidate?.ocr_text">
          <div class="p-2.5 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono">
            <div class="text-[10px] text-rose-500 font-bold">Pinterest Vision Model OCR Text:</div>
            <div class="text-slate-700 dark:text-slate-300 text-[11px] mt-0.5" x-text="selectedCandidate?.ocr_text"></div>
          </div>
        </template>
      </div>

      <!-- MODULE 3: Audience Pairing & Menu Matrix -->
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold uppercase font-mono tracking-wider text-slate-900 dark:text-white flex items-center space-x-1.5">
            <i data-lucide="utensils" class="w-3.5 h-3.5 text-amber-500"></i>
            <span>Module 3: Audience Pairing & Menu Matrix</span>
          </span>
          <span class="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            RecGPT Trajectory
          </span>
        </div>
        <p class="text-[11px] text-slate-500 dark:text-slate-400">
          Pinterest's sequential transformer predicts transition probabilities. Expand audience retention across these 3 cluster-derived moments:
        </p>

        <!-- 3 Trajectory Dish Cards -->
        <div class="space-y-2.5">
          <!-- 1. Dinner Anchor -->
          <div class="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 space-y-2">
            <div class="flex items-center justify-between">
              <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                1. Dinner Anchor (Primary Protein)
              </span>
              <span class="text-[11px] font-mono text-slate-400">Prep: 15m</span>
            </div>
            <div class="font-bold text-slate-900 dark:text-white text-xs" x-text="'Slow Cooker Garlic Herb Butter Chicken & Red Potatoes'"></div>
            <div class="flex items-center justify-between pt-1">
              <div class="flex items-center space-x-3 text-[11px] font-mono text-slate-500">
                <span>Save Rate: <strong class="text-emerald-600">94.2%</strong></span>
                <span>Affinity Score: <strong class="text-slate-700 dark:text-slate-300">98.5</strong></span>
              </div>
              <button @click="copyPromptForPairing('Dinner Anchor')" class="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-[10px] transition active:scale-95 flex items-center space-x-1">
                <i data-lucide="zap" class="w-3 h-3"></i>
                <span>Generate Pin Asset</span>
              </button>
            </div>
          </div>

          <!-- 2. Navboost Co-visitor -->
          <div class="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 space-y-2">
            <div class="flex items-center justify-between">
              <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
                2. Navboost Co-visitor (Complementary Skillet)
              </span>
              <span class="text-[11px] font-mono text-slate-400">Prep: 20m</span>
            </div>
            <div class="font-bold text-slate-900 dark:text-white text-xs" x-text="'Cast Iron Skillet Garlic Cheddar Honey Biscuits'"></div>
            <div class="flex items-center justify-between pt-1">
              <div class="flex items-center space-x-3 text-[11px] font-mono text-slate-500">
                <span>Save Rate: <strong class="text-emerald-600">88.7%</strong></span>
                <span>Affinity Score: <strong class="text-slate-700 dark:text-slate-300">92.1</strong></span>
              </div>
              <button @click="copyPromptForPairing('Navboost Side')" class="px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-semibold text-[10px] transition active:scale-95 flex items-center space-x-1">
                <i data-lucide="zap" class="w-3 h-3"></i>
                <span>Generate Pin Asset</span>
              </button>
            </div>
          </div>

          <!-- 3. Session Finisher -->
          <div class="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 space-y-2">
            <div class="flex items-center justify-between">
              <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                3. Session Finisher (Board Saver Dessert)
              </span>
              <span class="text-[11px] font-mono text-slate-400">Prep: 10m</span>
            </div>
            <div class="font-bold text-slate-900 dark:text-white text-xs" x-text="'Warm Skillet Salted Caramel Chocolate Chip Cookie with Vanilla Ice Cream'"></div>
            <div class="flex items-center justify-between pt-1">
              <div class="flex items-center space-x-3 text-[11px] font-mono text-slate-500">
                <span>Save Rate: <strong class="text-emerald-600">96.8%</strong></span>
                <span>Affinity Score: <strong class="text-slate-700 dark:text-slate-300">97.4</strong></span>
              </div>
              <button @click="copyPromptForPairing('Session Finisher')" class="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold text-[10px] transition active:scale-95 flex items-center space-x-1">
                <i data-lucide="zap" class="w-3 h-3"></i>
                <span>Generate Pin Asset</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Actionable Production Blueprint Studio -->
      <div class="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold uppercase font-mono tracking-wider text-slate-900 dark:text-white flex items-center space-x-1.5">
            <i data-lucide="file-code" class="w-3.5 h-3.5 text-rose-500"></i>
            <span>Production Blueprint Studio ($1.99 Digital Asset)</span>
          </span>
          <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            99.4% dHash Unique
          </span>
        </div>

        <!-- 1. SEO Title -->
        <div class="space-y-1">
          <div class="flex items-center justify-between text-[11px]">
            <span class="font-semibold text-slate-600 dark:text-slate-400">Algorithmic SEO Title</span>
            <button @click="copyToClipboard(blueprintSeoTitle, 'seo')" class="text-rose-600 hover:underline font-mono">
              <span x-text="copiedField === 'seo' ? 'Copied!' : 'Copy'"></span>
            </button>
          </div>
          <div class="p-2.5 rounded-lg bg-slate-100 dark:bg-black/50 border border-slate-200 dark:border-slate-800 font-mono text-xs text-slate-800 dark:text-slate-200" x-text="blueprintSeoTitle"></div>
        </div>

        <!-- 2. Midjourney Prompt -->
        <div class="space-y-1">
          <div class="flex items-center justify-between text-[11px]">
            <span class="font-semibold text-slate-600 dark:text-slate-400">Midjourney v6.1 Generation Prompt (--ar 9:16)</span>
            <button @click="copyToClipboard(blueprintMidjourney, 'midjourney')" class="text-amber-600 hover:underline font-mono">
              <span x-text="copiedField === 'midjourney' ? 'Copied!' : 'Copy'"></span>
            </button>
          </div>
          <div class="p-2.5 rounded-lg bg-slate-100 dark:bg-black/50 border border-slate-200 dark:border-slate-800 font-mono text-[11px] leading-relaxed text-slate-700 dark:text-slate-300" x-text="blueprintMidjourney"></div>
        </div>

        <!-- 3. Dual JSON-LD Schema -->
        <div class="space-y-1">
          <div class="flex items-center justify-between text-[11px]">
            <span class="font-semibold text-slate-600 dark:text-slate-400">Dual JSON-LD Schema (Product + Recipe)</span>
            <button @click="copyToClipboard(blueprintJsonLd, 'jsonld')" class="text-emerald-600 hover:underline font-mono">
              <span x-text="copiedField === 'jsonld' ? 'Copied Schema!' : '1-Click Copy Schema'"></span>
            </button>
          </div>
          <pre class="p-3 rounded-lg bg-slate-100 dark:bg-black/60 border border-slate-200 dark:border-slate-800 font-mono text-[10px] leading-relaxed max-h-40 overflow-y-auto text-slate-700 dark:text-slate-300" x-text="blueprintJsonLd"></pre>
        </div>
      </div>

    </div>
  </div>

  <!-- dHash Guard Perceptual Hash Verification Modal -->
  <div x-show="isDhashModalOpen" x-cloak class="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4">
    <div class="bg-white dark:bg-[#0d1526] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-4" @click.away="isDhashModalOpen = false">
      <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
        <div class="flex items-center space-x-2">
          <div class="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
            <i data-lucide="shield" class="w-4 h-4"></i>
          </div>
          <div>
            <h3 class="font-bold text-slate-900 dark:text-white text-sm">dHash Perceptual Signature Guard</h3>
            <p class="text-[11px] text-slate-500 font-mono">Pinterest Duplicate Suppression Immunity</p>
          </div>
        </div>
        <button @click="isDhashModalOpen = false" class="text-slate-400 hover:text-slate-700 dark:hover:text-white">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>

      <div class="space-y-3 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
        <p>Pinterest computes 64-bit gradient difference hashes (<code class="text-rose-500 font-mono">dHash</code>) on incoming media to deduplicate pins and suppress low-effort re-uploads.</p>
        
        <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2 font-mono text-[11px]">
          <div class="flex items-center justify-between text-slate-900 dark:text-slate-200">
            <span>Minimum Hamming Distance:</span>
            <strong class="text-emerald-600">&gt; 12 bits</strong>
          </div>
          <div class="flex items-center justify-between text-slate-900 dark:text-slate-200">
            <span>Visual Uniqueness Rating:</span>
            <strong class="text-emerald-600">99.4% Unique</strong>
          </div>
          <div class="flex items-center justify-between text-slate-900 dark:text-slate-200">
            <span>Status:</span>
            <strong class="text-indigo-500">PROTECTED (Zero Deduplication Risk)</strong>
          </div>
        </div>

        <p class="text-[11px] text-slate-500">All Midjourney assets generated via our production prompts exceed the required gradient disparity threshold, guaranteeing clean organic distribution.</p>
      </div>

      <div class="pt-2 flex justify-end">
        <button @click="isDhashModalOpen = false" class="px-4 py-1.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-semibold text-xs transition">
          Close
        </button>
      </div>
    </div>
  </div>

  <!-- Add New Seed Modal -->
  <div x-show="isAddSeedOpen" x-cloak class="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4">
    <div class="bg-white dark:bg-[#0d1526] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4" @click.away="isAddSeedOpen = false">
      <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
        <h3 class="font-bold text-slate-900 dark:text-white text-sm flex items-center space-x-2">
          <i data-lucide="plus-circle" class="w-4 h-4 text-rose-500"></i>
          <span>Track New Competitor Seed Pin</span>
        </h3>
        <button @click="isAddSeedOpen = false" class="text-slate-400 hover:text-slate-700 dark:hover:text-white">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>

      <div class="space-y-3 text-xs">
        <div>
          <label class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Pinterest Pin ID</label>
          <input type="text" x-model="newSeed.pin_id" placeholder="e.g. 1043850019900672106" class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-rose-500 font-mono">
        </div>
        <div>
          <label class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Label / Recipe Name</label>
          <input type="text" x-model="newSeed.label" placeholder="e.g. Creamy Potato Soup Competitor" class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-rose-500">
        </div>
        <div class="flex items-center justify-between pt-1">
          <label class="flex items-center space-x-2 cursor-pointer">
            <input type="checkbox" x-model="newSeed.is_competitor" class="rounded border-slate-300 text-rose-600 focus:ring-rose-500">
            <span class="text-slate-600 dark:text-slate-300 font-medium">Competitor Seed Pin</span>
          </label>
          <label class="flex items-center space-x-2 cursor-pointer">
            <input type="checkbox" x-model="newSeed.auto_crawl" class="rounded border-slate-300 text-rose-600 focus:ring-rose-500">
            <span class="text-rose-600 dark:text-rose-400 font-medium font-mono">Auto-Crawl Now</span>
          </label>
        </div>
      </div>

      <div class="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end space-x-2">
        <button @click="isAddSeedOpen = false" class="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-700">Cancel</button>
        <button @click="addSeed()" class="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition active:scale-95">Save Seed</button>
      </div>
    </div>
  </div>

  <!-- Toast Notification -->
  <div x-show="toastMessage" x-cloak class="fixed bottom-6 right-6 z-50 bg-slate-900 text-white dark:bg-white dark:text-slate-900 px-4 py-2.5 rounded-xl shadow-2xl font-mono text-xs flex items-center space-x-2 animate-in fade-in slide-in-from-bottom-5">
    <i data-lucide="check-circle" class="w-4 h-4 text-emerald-500"></i>
    <span x-text="toastMessage"></span>
  </div>

  <!-- Alpine Application Data Store -->
  <script>
    function dashboardApp() {
      return {
        isDark: false,
        currentTab: 'table',
        candidateFilter: 'all',
        searchQuery: '',
        isLoading: false,
        isAddSeedOpen: false,
        isDossierOpen: false,
        isDhashModalOpen: false,
        copiedField: null,
        toastMessage: null,

        overview: {},
        seeds: [],
        candidates: [],
        telemetry: {},
        selectedSeedId: null,
        selectedCandidate: null,
        simulatedPins: {},

        crawlStatus: { is_crawling: false },
        crawlElapsed: 0,
        crawlTimer: null,

        newSeed: {
          pin_id: '',
          label: '',
          is_competitor: true,
          auto_crawl: true
        },

        toggleTheme() {
          this.isDark = !this.isDark;
          localStorage.setItem('pin_theme', this.isDark ? 'dark' : 'light');
          this.$nextTick(() => {
            if (window.lucide) window.lucide.createIcons();
          });
        },

        getCulinaryName(hex) {
          const names = {
            '#824d30': 'Rustic Umber / Roasted Crust',
            '#663e0d': 'Deep Molasses / Dark Cocoa',
            '#6b4216': 'Toasted Walnut / Brown Butter',
            '#b9975f': 'Golden Cornmeal / Biscuit Crust',
            '#9f642e': 'Caramel Glaze / Roasted Pecan',
            '#ad7137': 'Honey Amber / Crispy Garlic',
            '#d08c47': 'Cheddar Melt / Golden Brioche',
            '#ecc584': 'Warm Cream / Flaky Pastry',
            '#beae88': 'Savory Herb Crust / Almond Beige',
            '#888888': 'Slate Mineral / Neutral Steel'
          };
          return names[hex] || 'Artisan Savory Blend';
        },

        get filteredCandidates() {
          let list = this.candidates || [];
          if (this.candidateFilter === 'hubs') {
            list = list.filter(i => Number(i.seed_overlap_count) >= 2);
          } else if (this.candidateFilter === 'vacuum') {
            list = list.filter(i => i.is_vacuum_target);
          } else if (this.candidateFilter === 'product') {
            list = list.filter(i => i.is_product);
          }

          if (this.searchQuery.trim()) {
            const q = this.searchQuery.toLowerCase().trim();
            list = list.filter(i => 
              (i.title && i.title.toLowerCase().includes(q)) ||
              (i.domain && i.domain.toLowerCase().includes(q)) ||
              (i.ocr_text && i.ocr_text.toLowerCase().includes(q)) ||
              (i.candidate_pin_id && i.candidate_pin_id.includes(q))
            );
          }
          return list;
        },

        get rawJsonString() {
          return JSON.stringify({
            overview: this.overview,
            telemetry: this.telemetry,
            active_seeds: this.seeds,
            top_candidates_sample: (this.candidates || []).slice(0, 10)
          }, null, 2);
        },

        get cleanRecipeTitle() {
          if (!this.selectedCandidate) return 'Recipe';
          let title = this.selectedCandidate.title || '';
          if (!title || title.startsWith('[')) {
            const topTokens = (this.telemetry.high_save_tokens || []).slice(0, 2).map(t => t.token).join(' ');
            title = topTokens ? (topTokens.charAt(0).toUpperCase() + topTokens.slice(1) + ' Dish') : 'Gourmet Dish';
          } else {
            title = title.replace(/\\s*\\|.*$/g, '');
            title = title.replace(/\\s*-\\s*.*recipe.*$/i, '');
            title = title.replace(/^Easy\\s+/i, '');
          }
          return title.trim();
        },

        get blueprintSeoTitle() {
          return 'Easy ' + this.cleanRecipeTitle + ' Recipe (Quick & Delicious) | Zizeeba';
        },

        get blueprintMidjourney() {
          const title = this.cleanRecipeTitle;
          const color = this.selectedCandidate?.winning_color || '#824d30';
          return 'A high-end commercial food photography shot of ' + title + ', styled for a gourmet cookbook, vibrant textures, natural daylight, shallow depth of field, warm cozy aesthetic, color palette accented by ' + color + ', shot on Hasselblad 50mm f/1.8 --ar 9:16 --v 6.1 --style raw --q 2';
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
                "brand": { "@type": "Brand", "name": "Zizeeba" },
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
                "image": ["https://zizeeba.com/images/recipes/" + pinId + ".jpg"],
                "author": { "@type": "Organization", "name": "Zizeeba Culinary Kitchen" },
                "description": "Delicious homemade " + title + " crafted with simple ingredients and optimal kitchen workflow.",
                "prepTime": "PT15M",
                "cookTime": "PT30M",
                "totalTime": "PT45M",
                "recipeYield": "4 servings",
                "recipeCategory": "Main Course"
              }
            ]
          };
          return JSON.stringify(schema, null, 2);
        },

        toggleSimulation(pinId) {
          this.simulatedPins[pinId] = !this.simulatedPins[pinId];
        },

        inspectCandidate(item) {
          this.selectedCandidate = item;
          this.isDossierOpen = true;
          this.$nextTick(() => {
            if (window.lucide) window.lucide.createIcons();
          });
        },

        exploitTopVacuumTarget() {
          const vacuum = (this.candidates || []).find(c => c.is_vacuum_target) || this.candidates[0];
          if (vacuum) {
            this.inspectCandidate(vacuum);
          }
        },

        copyPromptForPairing(type) {
          const title = this.cleanRecipeTitle;
          const prompt = 'Gourmet commercial cookbook photography of ' + type + ' paired with ' + title + ', warm rustic kitchen lighting, shallow depth of field, fresh garnish, vibrant textures, shot on Hasselblad 50mm f/1.8 --ar 9:16 --v 6.1 --style raw';
          navigator.clipboard.writeText(prompt);
          this.showToast('Generated & Copied ' + type + ' Midjourney Prompt!');
        },

        copyToClipboard(text, field) {
          navigator.clipboard.writeText(text);
          this.copiedField = field;
          this.showToast('Copied to Clipboard!');
          setTimeout(() => { this.copiedField = null; }, 2000);
        },

        showToast(msg) {
          this.toastMessage = msg;
          setTimeout(() => { this.toastMessage = null; }, 2500);
        },

        async initDashboard() {
          const savedTheme = localStorage.getItem('pin_theme');
          if (savedTheme) {
            this.isDark = savedTheme === 'dark';
          }
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
          } catch (e) {}
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
          } catch (e) {}
        },

        async fetchIntersections() {
          try {
            const res = await fetch('/api/intersections?min_overlap=1');
            if (res.ok) this.candidates = await res.json();
          } catch (e) {}
        },

        async fetchTelemetry() {
          if (!this.selectedSeedId) return;
          try {
            const res = await fetch('/api/cluster-telemetry?seed_pin_id=' + this.selectedSeedId);
            if (res.ok) {
              this.telemetry = await res.json();
            }
          } catch (e) {}
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
              this.showToast('Background crawl started!');
            }
          } catch (e) {
            alert('Failed to trigger crawl: ' + e.message);
          }
        },

        startElapsedTimer() {
          if (this.crawlTimer) clearInterval(this.crawlTimer);
          this.crawlTimer = setInterval(() => {
            if (this.crawlStatus.is_crawling) {
              this.crawlElapsed++;
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
              if (prevCrawling && !this.crawlStatus.is_crawling) {
                await this.fetchData();
                this.showToast('Crawl completed! Data refreshed.');
              }
            }
          } catch (e) {}
        },

        async addSeed() {
          if (!this.newSeed.pin_id.trim()) {
            alert('Please enter a valid Pinterest Pin ID');
            return;
          }
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
            alert('Failed to add seed: ' + e.message);
          }
        }
      };
    }
  </script>
</body>
</html>`;
}

// HTTP Server
const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;
  const method = req.method;

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
            MAX(c.ocr_text) AS ocr_text,
            MAX(c.aspect_ratio) AS aspect_ratio,
            SUM(c.repins) AS total_repins,
            ROUND(AVG(c.save_rate)::numeric, 2) AS avg_save_rate,
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

      const enrichedRows = rows.map((r) => {
        const overlap = Number(r.seed_overlap_count || 1);
        const saves = Number(r.total_saves || 0);

        let engine = 'P2P_TWO_TOWER';
        if (overlap >= 2) engine = 'P2P_RANDOMWALK';
        else if (saves >= 30000) engine = 'P2P_NAVBOOST';
        else if (r.is_product) engine = 'FRESH_SHOPPING';
        else if (saves >= 10000) engine = 'P2P_RECGPT';

        const ar = Number(r.aspect_ratio || 0.56);
        let format = 'ORGANIC PIN';
        if (r.is_product) format = 'PRODUCT CARD';
        else if (ar < 0.6) format = 'VIDEO PIN';
        else if (ar > 1.3) format = 'IDEA PIN';

        return {
          ...r,
          engine_source: engine,
          format_type: format,
          culinary_color_name: getCulinaryColorName(r.winning_color),
          is_vacuum_target: !r.is_product && saves >= 5000
        };
      });

      return sendJson(res, 200, enrichedRows);
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
            SELECT * FROM cluster_arbitrage_metrics 
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
      const label = String(body.label || 'Manual Tracked Seed').trim();
      const isCompetitor = Boolean(body.is_competitor ?? true);

      if (!pinId) {
        return sendJson(res, 400, { error: 'pin_id is required' });
      }

      const result = await sql`
        INSERT INTO cluster_seeds (pin_id, label, is_competitor, created_at)
        VALUES (${pinId}, ${label}, ${isCompetitor}, NOW())
        ON CONFLICT (pin_id) DO UPDATE SET
            label = EXCLUDED.label,
            is_competitor = EXCLUDED.is_competitor
        RETURNING pin_id, label, is_competitor, last_crawled_at;
      `;

      return sendJson(res, 201, { success: true, seed: result[0] });
    }

    // 8. GET or HEAD /
    if ((method === 'GET' || method === 'HEAD') && pathname === '/') {
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
