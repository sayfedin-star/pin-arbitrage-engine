#!/usr/bin/env node

/**
 * Pinterest Algorithmic Arbitrage Engine
 * Real-Time Web Dashboard & Blueprint Export Studio
 *
 * Runs on port 3456 (or process.env.PORT)
 */

import http from 'node:http';
import { URL } from 'node:url';
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

// HTML Single Page Application
function getDashboardHtml() {
  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pin Arbitrage Engine | Real-Time Intelligence Dashboard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
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
    ::-webkit-scrollbar-track { background: #090d16; }
    ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: #334155; }
  </style>
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen font-sans selection:bg-rose-500 selection:text-white" x-data="dashboardApp()" x-init="initDashboard()">

  <!-- Top Header Navigation -->
  <header class="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-40">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
      <div class="flex items-center space-x-3">
        <div class="h-10 w-10 rounded-xl bg-gradient-to-tr from-rose-600 to-amber-500 flex items-center justify-center shadow-lg shadow-rose-950/40">
          <i data-lucide="radar" class="w-5 h-5 text-white"></i>
        </div>
        <div>
          <div class="flex items-center space-x-2">
            <span class="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
              Pin Arbitrage Engine
            </span>
            <span class="px-2 py-0.5 text-xs font-mono font-medium rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
              v1.0 Core
            </span>
          </div>
          <p class="text-xs text-slate-400">P2P Cluster Intelligence & Golden Vacuum Detection</p>
        </div>
      </div>

      <div class="flex items-center space-x-3">
        <button @click="fetchData()" :disabled="isLoading" class="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700/60 transition shadow-sm active:scale-95 disabled:opacity-50">
          <i data-lucide="refresh-cw" :class="{'animate-spin': isLoading}" class="w-3.5 h-3.5"></i>
          <span>Refresh Data</span>
        </button>

        <button @click="isAddSeedOpen = true" class="flex items-center space-x-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 text-white shadow-md shadow-rose-950/50 transition active:scale-95">
          <i data-lucide="plus" class="w-3.5 h-3.5"></i>
          <span>Track New Seed</span>
        </button>
      </div>
    </div>
  </header>

  <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

    <!-- 1. Executive Metrics Bar -->
    <section class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <!-- Active Seeds -->
      <div class="bg-slate-900/70 border border-slate-800/80 rounded-2xl p-5 backdrop-blur-sm relative overflow-hidden group hover:border-slate-700 transition">
        <div class="flex items-center justify-between">
          <span class="text-xs font-medium uppercase tracking-wider text-slate-400">Tracked Seeds</span>
          <div class="p-2 rounded-xl bg-slate-800/60 text-indigo-400 group-hover:scale-110 transition">
            <i data-lucide="target" class="w-4 h-4"></i>
          </div>
        </div>
        <div class="mt-3 flex items-baseline space-x-2">
          <span class="text-3xl font-extrabold text-white font-mono" x-text="overview.total_seeds">0</span>
          <span class="text-xs text-slate-400">clusters</span>
        </div>
        <div class="mt-2 text-xs text-slate-400 flex items-center space-x-1">
          <span class="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
          <span>Target & competitor roots</span>
        </div>
      </div>

      <!-- Total Candidates -->
      <div class="bg-slate-900/70 border border-slate-800/80 rounded-2xl p-5 backdrop-blur-sm relative overflow-hidden group hover:border-slate-700 transition">
        <div class="flex items-center justify-between">
          <span class="text-xs font-medium uppercase tracking-wider text-slate-400">Graph Candidates</span>
          <div class="p-2 rounded-xl bg-slate-800/60 text-sky-400 group-hover:scale-110 transition">
            <i data-lucide="network" class="w-4 h-4"></i>
          </div>
        </div>
        <div class="mt-3 flex items-baseline space-x-2">
          <span class="text-3xl font-extrabold text-white font-mono" x-text="overview.total_candidates">0</span>
          <span class="text-xs text-slate-400">nodes</span>
        </div>
        <div class="mt-2 text-xs text-slate-400 flex items-center space-x-1">
          <span class="w-1.5 h-1.5 rounded-full bg-sky-500"></span>
          <span>Indexed P2P candidate pins</span>
        </div>
      </div>

      <!-- Commercial Gap -->
      <div class="bg-slate-900/70 border border-slate-800/80 rounded-2xl p-5 backdrop-blur-sm relative overflow-hidden group hover:border-slate-700 transition">
        <div class="flex items-center justify-between">
          <span class="text-xs font-medium uppercase tracking-wider text-slate-400">Global Commercial Gap</span>
          <div class="p-2 rounded-xl bg-slate-800/60 text-emerald-400 group-hover:scale-110 transition">
            <i data-lucide="sparkles" class="w-4 h-4"></i>
          </div>
        </div>
        <div class="mt-3 flex items-baseline space-x-2">
          <span class="text-3xl font-extrabold font-mono" :class="Number(overview.avg_commercial_gap) > 75 ? 'text-emerald-400' : 'text-amber-400'" x-text="overview.avg_commercial_gap + '%'">0%</span>
          <template x-if="Number(overview.avg_commercial_gap) > 75">
            <span class="px-2 py-0.5 text-xs font-bold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 animate-pulse">
              Vacuum
            </span>
          </template>
        </div>
        <div class="mt-2 text-xs text-slate-400 flex items-center space-x-1">
          <span class="w-1.5 h-1.5 rounded-full" :class="Number(overview.avg_commercial_gap) > 75 ? 'bg-emerald-500' : 'bg-amber-500'"></span>
          <span>Percentage of non-commercial pins</span>
        </div>
      </div>

      <!-- Intersecting Hubs -->
      <div class="bg-slate-900/70 border border-slate-800/80 rounded-2xl p-5 backdrop-blur-sm relative overflow-hidden group hover:border-slate-700 transition">
        <div class="flex items-center justify-between">
          <span class="text-xs font-medium uppercase tracking-wider text-slate-400">Multi-Hit Hubs (≥ 2)</span>
          <div class="p-2 rounded-xl bg-slate-800/60 text-amber-400 group-hover:scale-110 transition">
            <i data-lucide="flame" class="w-4 h-4"></i>
          </div>
        </div>
        <div class="mt-3 flex items-baseline space-x-2">
          <span class="text-3xl font-extrabold text-amber-400 font-mono" x-text="overview.intersecting_hubs_count">0</span>
          <span class="text-xs text-slate-400">viral intersections</span>
        </div>
        <div class="mt-2 text-xs text-slate-400 flex items-center space-x-1">
          <span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
          <span>Shared across multiple clusters</span>
        </div>
      </div>
    </section>

    <!-- Navigation Tabs -->
    <div class="flex items-center justify-between border-b border-slate-800 pb-2">
      <div class="flex items-center space-x-2">
        <button @click="activeTab = 'radar'" class="flex items-center space-x-2 px-4 py-2 text-sm font-semibold rounded-xl transition" :class="activeTab === 'radar' ? 'bg-slate-800 text-rose-400 border border-slate-700' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'">
          <i data-lucide="crosshair" class="w-4 h-4"></i>
          <span>Intersection & Multi-Hit Radar</span>
          <span class="text-xs px-2 py-0.5 rounded-full bg-slate-700 font-mono text-slate-300" x-text="intersections.length"></span>
        </button>
        <button @click="activeTab = 'seeds'" class="flex items-center space-x-2 px-4 py-2 text-sm font-semibold rounded-xl transition" :class="activeTab === 'seeds' ? 'bg-slate-800 text-rose-400 border border-slate-700' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'">
          <i data-lucide="layers" class="w-4 h-4"></i>
          <span>Cluster Seeds Manager</span>
          <span class="text-xs px-2 py-0.5 rounded-full bg-slate-700 font-mono text-slate-300" x-text="seeds.length"></span>
        </button>
      </div>

      <!-- Search & Filters -->
      <div class="flex items-center space-x-3" x-show="activeTab === 'radar'">
        <div class="flex items-center space-x-1 bg-slate-900 border border-slate-800 rounded-xl p-1 text-xs">
          <button @click="filter.minOverlap = 2; fetchIntersections()" :class="filter.minOverlap === 2 ? 'bg-rose-500/20 text-rose-400 font-bold border border-rose-500/30' : 'text-slate-400 hover:text-slate-200'" class="px-2.5 py-1 rounded-lg transition">
            Multi-Seed (≥2)
          </button>
          <button @click="filter.minOverlap = 1; fetchIntersections()" :class="filter.minOverlap === 1 ? 'bg-rose-500/20 text-rose-400 font-bold border border-rose-500/30' : 'text-slate-400 hover:text-slate-200'" class="px-2.5 py-1 rounded-lg transition">
            All Pixie Ranked
          </button>
        </div>

        <div class="relative w-64">
          <i data-lucide="search" class="w-4 h-4 text-slate-500 absolute left-3 top-2.5"></i>
          <input type="text" x-model="filter.searchQuery" placeholder="Filter title or domain..." class="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-rose-500 transition">
        </div>
      </div>
    </div>

    <!-- 2. View 1: Intersection & Multi-Hit Radar Table -->
    <section x-show="activeTab === 'radar'" class="space-y-4">
      <div class="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-950/60 border-b border-slate-800 text-slate-400 uppercase font-mono tracking-wider">
              <tr>
                <th class="py-3.5 px-4">Candidate Pin & Title</th>
                <th class="py-3.5 px-4">Overlap</th>
                <th class="py-3.5 px-4">Pixie Multi-Hit Score</th>
                <th class="py-3.5 px-4">Total Saves</th>
                <th class="py-3.5 px-4">Color Palette</th>
                <th class="py-3.5 px-4">Type</th>
                <th class="py-3.5 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-800/60 text-slate-300 font-sans">
              <template x-for="item in filteredIntersections" :key="item.candidate_pin_id">
                <tr class="hover:bg-slate-800/40 transition group">
                  <!-- Title & Pin Link -->
                  <td class="py-3.5 px-4 max-w-sm">
                    <div class="font-medium text-slate-100 group-hover:text-rose-300 transition truncate" x-text="item.title"></div>
                    <div class="flex items-center space-x-2 mt-1">
                      <span class="text-[10px] font-mono text-slate-500" x-text="'ID: ' + item.candidate_pin_id"></span>
                      <span class="text-slate-600">•</span>
                      <a :href="'https://www.pinterest.com/pin/' + item.candidate_pin_id + '/'" target="_blank" class="text-[10px] text-sky-400 hover:underline flex items-center space-x-0.5">
                        <span x-text="item.domain"></span>
                        <i data-lucide="external-link" class="w-2.5 h-2.5"></i>
                      </a>
                    </div>
                  </td>

                  <!-- Seed Overlap Badge -->
                  <td class="py-3.5 px-4 whitespace-nowrap">
                    <template x-if="Number(item.seed_overlap_count) >= 2">
                      <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        <i data-lucide="layers" class="w-3 h-3 mr-1"></i>
                        <span x-text="item.seed_overlap_count + ' Seeds Shared'"></span>
                      </span>
                    </template>
                    <template x-if="Number(item.seed_overlap_count) < 2">
                      <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-800 text-slate-400">
                        <span>1 Seed Cluster</span>
                      </span>
                    </template>
                  </td>

                  <!-- Pixie Multi-Hit Score with progress bar -->
                  <td class="py-3.5 px-4 whitespace-nowrap">
                    <div class="flex items-center space-x-2">
                      <span class="font-mono font-bold text-rose-400" x-text="Number(item.pixie_multihit_score).toLocaleString()"></span>
                    </div>
                    <div class="w-28 bg-slate-800 rounded-full h-1.5 mt-1 overflow-hidden">
                      <div class="bg-gradient-to-r from-rose-500 to-amber-500 h-1.5 rounded-full" :style="'width: ' + Math.min(100, Math.max(10, (Number(item.pixie_multihit_score) / maxPixieScore) * 100)) + '%'"></div>
                    </div>
                  </td>

                  <!-- Total Saves -->
                  <td class="py-3.5 px-4 font-mono text-slate-300 whitespace-nowrap" x-text="Number(item.total_saves).toLocaleString()"></td>

                  <!-- Dominant Color Swatch -->
                  <td class="py-3.5 px-4 whitespace-nowrap">
                    <div class="flex items-center space-x-2">
                      <div class="w-5 h-5 rounded-md border border-slate-700 shadow-sm" :style="'background-color: ' + (item.winning_color || '#888888')"></div>
                      <span class="font-mono text-[11px] text-slate-400" x-text="item.winning_color || '#888888'"></span>
                    </div>
                  </td>

                  <!-- Product vs Organic -->
                  <td class="py-3.5 px-4 whitespace-nowrap">
                    <template x-if="item.is_product">
                      <span class="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-rose-500/10 text-rose-400 border border-rose-500/20">
                        Product
                      </span>
                    </template>
                    <template x-if="!item.is_product">
                      <span class="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        Organic
                      </span>
                    </template>
                  </td>

                  <!-- Action: Direct Blueprint -->
                  <td class="py-3.5 px-4 text-right whitespace-nowrap">
                    <button @click="openBlueprint(item)" class="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-600 hover:text-white text-slate-200 border border-slate-700 hover:border-rose-500 text-xs font-medium transition shadow-sm group-hover:scale-105 active:scale-95">
                      <i data-lucide="file-code" class="w-3.5 h-3.5"></i>
                      <span>Direct Blueprint</span>
                    </button>
                  </td>
                </tr>
              </template>

              <template x-if="filteredIntersections.length === 0">
                <tr>
                  <td colspan="7" class="py-12 text-center text-slate-500">
                    <i data-lucide="inbox" class="w-8 h-8 mx-auto mb-2 opacity-50"></i>
                    <p class="text-sm font-medium">No candidate nodes match your current filters.</p>
                    <p class="text-xs mt-1 text-slate-600" x-show="filter.minOverlap === 2">Try toggling to "All Pixie Ranked" or crawl additional cluster seeds.</p>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- 3. View 2: Cluster Seeds & Crawl Manager -->
    <section x-show="activeTab === 'seeds'" class="space-y-4">
      <div class="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div class="p-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 class="font-bold text-sm text-slate-200">Tracked Seed Roots</h3>
            <p class="text-xs text-slate-400">Seeds trigger the RelatedModulesResource exploration stream</p>
          </div>
          <button @click="isAddSeedOpen = true" class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-500 text-white transition flex items-center space-x-1">
            <i data-lucide="plus" class="w-3 h-3"></i>
            <span>Add Seed</span>
          </button>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-950/60 border-b border-slate-800 text-slate-400 uppercase font-mono tracking-wider">
              <tr>
                <th class="py-3 px-4">Pin ID</th>
                <th class="py-3 px-4">Label</th>
                <th class="py-3 px-4">Type</th>
                <th class="py-3 px-4">Last Crawled</th>
                <th class="py-3 px-4">Candidates</th>
                <th class="py-3 px-4">Commercial Gap</th>
                <th class="py-3 px-4">Crawl Status</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-800/60 text-slate-300">
              <template x-for="seed in seeds" :key="seed.pin_id">
                <tr class="hover:bg-slate-800/30 transition">
                  <td class="py-3.5 px-4 font-mono text-slate-200">
                    <a :href="'https://www.pinterest.com/pin/' + seed.pin_id + '/'" target="_blank" class="hover:text-rose-400 hover:underline flex items-center space-x-1">
                      <span x-text="seed.pin_id"></span>
                      <i data-lucide="external-link" class="w-2.5 h-2.5"></i>
                    </a>
                  </td>
                  <td class="py-3.5 px-4 font-semibold text-slate-100" x-text="seed.label"></td>
                  <td class="py-3.5 px-4">
                    <span :class="seed.is_competitor ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'" class="px-2 py-0.5 rounded text-[10px] font-bold border uppercase" x-text="seed.is_competitor ? 'Competitor' : 'Internal Seed'"></span>
                  </td>
                  <td class="py-3.5 px-4 text-slate-400" x-text="seed.last_crawled_at ? new Date(seed.last_crawled_at).toLocaleString() : 'Never crawled'"></td>
                  <td class="py-3.5 px-4 font-mono" x-text="seed.total_candidates || 0"></td>
                  <td class="py-3.5 px-4 font-mono font-bold" :class="Number(seed.commercial_gap_ratio) > 75 ? 'text-emerald-400' : 'text-slate-300'" x-text="seed.commercial_gap_ratio ? seed.commercial_gap_ratio + '%' : 'N/A'"></td>
                  <td class="py-3.5 px-4">
                    <span :class="seed.last_crawled_at ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-slate-800 text-slate-400 border-slate-700'" class="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border">
                      <span class="w-1.5 h-1.5 rounded-full" :class="seed.last_crawled_at ? 'bg-emerald-400' : 'bg-slate-500'"></span>
                      <span x-text="seed.last_crawled_at ? 'Indexed' : 'Queued'"></span>
                    </span>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </div>
    </section>

  </main>

  <!-- 4. Actionable Blueprint Modal (نافذة تصدير الوصفة لموقع zizeeba.com) -->
  <div x-show="isBlueprintOpen" x-cloak class="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4" @keydown.escape.window="isBlueprintOpen = false">
    <div class="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150" @click.away="isBlueprintOpen = false">
      <!-- Modal Header -->
      <div class="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
        <div class="flex items-center space-x-3">
          <div class="w-8 h-8 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center">
            <i data-lucide="file-code" class="w-4 h-4"></i>
          </div>
          <div>
            <h3 class="font-bold text-slate-100 text-base">Zizeeba.com Recipe Blueprint</h3>
            <p class="text-xs text-slate-400">Algorithmic Arbitrage Export Studio ($1.99 Recipe Card PDF)</p>
          </div>
        </div>
        <button @click="isBlueprintOpen = false" class="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition">
          <i data-lucide="x" class="w-5 h-5"></i>
        </button>
      </div>

      <!-- Modal Body -->
      <div class="p-6 space-y-6 text-xs" x-if="selectedCandidate">

        <!-- Palette & Clean Title -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-950/50 p-4 rounded-xl border border-slate-800/80">
          <div class="col-span-2">
            <span class="text-[10px] uppercase font-mono text-slate-400 tracking-wider">Candidate Title</span>
            <div class="text-sm font-bold text-slate-100 mt-0.5" x-text="selectedCandidate?.title"></div>
            <div class="text-slate-400 text-[11px] mt-1 font-mono" x-text="'Pin ID: ' + selectedCandidate?.candidate_pin_id"></div>
          </div>
          <div>
            <span class="text-[10px] uppercase font-mono text-slate-400 tracking-wider">Dominant Color Swatch</span>
            <div class="flex items-center space-x-2 mt-1">
              <div class="w-8 h-8 rounded-lg border border-slate-700 shadow-md" :style="'background-color: ' + (selectedCandidate?.winning_color || '#888888')"></div>
              <div>
                <div class="font-mono font-bold text-slate-200" x-text="selectedCandidate?.winning_color || '#888888'"></div>
                <div class="text-[10px] text-slate-500">Centroid Anchor</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Optimized SEO Title Formula -->
        <div class="space-y-1.5">
          <div class="flex items-center justify-between">
            <span class="font-semibold text-slate-300 flex items-center space-x-1.5">
              <i data-lucide="heading" class="w-3.5 h-3.5 text-rose-400"></i>
              <span>Optimized Recipe SEO Title Formula</span>
            </span>
            <button @click="copyToClipboard(blueprintSeoTitle, 'seo')" class="text-rose-400 hover:text-rose-300 text-[11px] font-medium flex items-center space-x-1">
              <i data-lucide="copy" class="w-3 h-3"></i>
              <span x-text="copiedField === 'seo' ? 'Copied!' : 'Copy Title'"></span>
            </button>
          </div>
          <div class="bg-slate-950 p-3 rounded-xl border border-slate-800 font-mono text-slate-200 text-xs flex items-center justify-between select-all" x-text="blueprintSeoTitle"></div>
        </div>

        <!-- Midjourney v6.1 Prompt -->
        <div class="space-y-1.5">
          <div class="flex items-center justify-between">
            <span class="font-semibold text-slate-300 flex items-center space-x-1.5">
              <i data-lucide="wand-2" class="w-3.5 h-3.5 text-amber-400"></i>
              <span>Midjourney v6.1 Ready Prompt</span>
            </span>
            <button @click="copyToClipboard(blueprintMidjourney, 'midjourney')" class="text-amber-400 hover:text-amber-300 text-[11px] font-medium flex items-center space-x-1">
              <i data-lucide="copy" class="w-3 h-3"></i>
              <span x-text="copiedField === 'midjourney' ? 'Copied!' : 'Copy Prompt'"></span>
            </button>
          </div>
          <div class="bg-slate-950 p-3 rounded-xl border border-slate-800 font-mono text-slate-300 text-[11px] leading-relaxed select-all" x-text="blueprintMidjourney"></div>
        </div>

        <!-- Auto-Generated Dual JSON-LD Schema (Product + Recipe with $1.99 price) -->
        <div class="space-y-1.5">
          <div class="flex items-center justify-between">
            <span class="font-semibold text-slate-300 flex items-center space-x-1.5">
              <i data-lucide="code-2" class="w-3.5 h-3.5 text-emerald-400"></i>
              <span>Dual JSON-LD Schema ($1.99 Product + Recipe)</span>
            </span>
            <button @click="copyToClipboard(blueprintJsonLd, 'jsonld')" class="text-emerald-400 hover:text-emerald-300 text-[11px] font-medium flex items-center space-x-1">
              <i data-lucide="copy" class="w-3 h-3"></i>
              <span x-text="copiedField === 'jsonld' ? 'Copied JSON-LD!' : '1-Click Copy Schema'"></span>
            </button>
          </div>
          <pre class="bg-slate-950 p-3.5 rounded-xl border border-slate-800 font-mono text-slate-300 text-[10px] leading-relaxed max-h-60 overflow-y-auto select-all" x-text="blueprintJsonLd"></pre>
        </div>

      </div>

      <div class="px-6 py-3.5 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
        <span class="text-[11px] text-slate-400">Ready for direct deployment into <code class="text-rose-400">zizeeba.com/recipes/</code></span>
        <button @click="isBlueprintOpen = false" class="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium rounded-lg text-xs transition">
          Close
        </button>
      </div>
    </div>
  </div>

  <!-- Add New Seed Modal -->
  <div x-show="isAddSeedOpen" x-cloak class="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
    <div class="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4" @click.away="isAddSeedOpen = false">
      <div class="flex items-center justify-between border-b border-slate-800 pb-3">
        <h3 class="font-bold text-slate-100 text-sm flex items-center space-x-2">
          <i data-lucide="plus-circle" class="w-4 h-4 text-rose-500"></i>
          <span>Track New Cluster Seed</span>
        </h3>
        <button @click="isAddSeedOpen = false" class="text-slate-400 hover:text-white">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>

      <form @submit.prevent="submitNewSeed()" class="space-y-4 text-xs">
        <div>
          <label class="block font-medium text-slate-300 mb-1">Pinterest Pin ID</label>
          <input type="text" x-model="newSeed.pin_id" placeholder="e.g., 1125829606876977502" required class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono focus:outline-none focus:border-rose-500">
        </div>

        <div>
          <label class="block font-medium text-slate-300 mb-1">Label / Recipe Niche</label>
          <input type="text" x-model="newSeed.label" placeholder="e.g., Slow Cooker Honey Garlic Chicken" required class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-rose-500">
        </div>

        <div class="flex items-center space-x-2">
          <input type="checkbox" id="is_comp" x-model="newSeed.is_competitor" class="rounded bg-slate-950 border-slate-800 text-rose-600 focus:ring-rose-500">
          <label for="is_comp" class="text-slate-300 font-medium">Mark as Competitor Seed Pin</label>
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
        activeTab: 'radar',
        isLoading: false,
        isSubmitting: false,
        isAddSeedOpen: false,
        isBlueprintOpen: false,
        copiedField: null,
        overview: {
          total_seeds: 0,
          total_candidates: 0,
          avg_commercial_gap: 0,
          intersecting_hubs_count: 0
        },
        intersections: [],
        seeds: [],
        filter: {
          minOverlap: 1,
          searchQuery: ''
        },
        selectedCandidate: null,
        newSeed: {
          pin_id: '',
          label: '',
          is_competitor: false
        },

        get maxPixieScore() {
          if (this.intersections.length === 0) return 1;
          return Math.max(...this.intersections.map(i => Number(i.pixie_multihit_score) || 1));
        },

        get filteredIntersections() {
          let list = this.intersections;
          if (this.filter.searchQuery) {
            const q = this.filter.searchQuery.toLowerCase();
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
          let title = this.selectedCandidate.title || 'Recipe';
          title = title.replace(/\\s*\\|.*$/g, '');
          title = title.replace(/\\s*-\\s*.*recipe.*$/i, '');
          title = title.replace(/^Easy\\s+/i, '');
          return title.trim();
        },

        get blueprintSeoTitle() {
          return 'Easy ' + this.cleanRecipeTitle + ' Recipe (Quick & Delicious) | Zizeeba';
        },

        get blueprintMidjourney() {
          const title = this.cleanRecipeTitle;
          const color = this.selectedCandidate?.winning_color || '#c48858';
          return 'A high-end commercial food photography shot of ' + title + ', styled for a gourmet cookbook, vibrant textures, natural daylight, shallow depth of field, warm cozy aesthetic, color palette accented by ' + color + ', shot on Hasselblad 50mm f/1.8 --ar 2:3 --v 6.1 --style raw --q 2';
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
                "description": "Comprehensive printable digital recipe card for " + title + " featuring step-by-step instructions, ingredients breakdown, and nutritional guide.",
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
          this.$nextTick(() => {
            if (window.lucide) window.lucide.createIcons();
          });
        },

        async fetchData() {
          this.isLoading = true;
          try {
            await Promise.all([
              this.fetchOverview(),
              this.fetchIntersections(),
              this.fetchSeeds()
            ]);
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
            if (res.ok) {
              this.overview = await res.json();
            }
          } catch (e) {
            console.error('Error fetching overview:', e);
          }
        },

        async fetchIntersections() {
          try {
            const res = await fetch('/api/intersections?min_overlap=' + this.filter.minOverlap);
            if (res.ok) {
              this.intersections = await res.json();
            }
          } catch (e) {
            console.error('Error fetching intersections:', e);
          }
        },

        async fetchSeeds() {
          try {
            const res = await fetch('/api/seeds');
            if (res.ok) {
              this.seeds = await res.json();
            }
          } catch (e) {
            console.error('Error fetching seeds:', e);
          }
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
              this.newSeed = { pin_id: '', label: '', is_competitor: false };
              this.isAddSeedOpen = false;
              await this.fetchData();
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
    // 1. GET /api/overview
    if (method === 'GET' && pathname === '/api/overview') {
      const overviewRows = await sql`
        SELECT 
          (SELECT COUNT(*) FROM cluster_seeds) AS total_seeds,
          (SELECT COUNT(*) FROM candidate_graph_nodes) AS total_candidates,
          (SELECT COALESCE(ROUND(AVG(commercial_gap_ratio)::numeric, 2), 0) FROM cluster_arbitrage_metrics) AS avg_commercial_gap,
          (SELECT COUNT(*) FROM (
              SELECT candidate_pin_id 
              FROM candidate_graph_nodes 
              GROUP BY candidate_pin_id 
              HAVING COUNT(DISTINCT seed_pin_id) >= 2
          ) sub) AS intersecting_hubs_count;
      `;

      const overview = overviewRows[0] || {
        total_seeds: 0,
        total_candidates: 0,
        avg_commercial_gap: 0,
        intersecting_hubs_count: 0
      };

      return sendJson(res, 200, {
        total_seeds: Number(overview.total_seeds || 0),
        total_candidates: Number(overview.total_candidates || 0),
        avg_commercial_gap: Number(overview.avg_commercial_gap || 0),
        intersecting_hubs_count: Number(overview.intersecting_hubs_count || 0)
      });
    }

    // 2. GET /api/intersections
    if (method === 'GET' && pathname === '/api/intersections') {
      const minOverlap = Number(parsedUrl.searchParams.get('min_overlap')) || 2;
      const limit = Number(parsedUrl.searchParams.get('limit')) || 100;

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

    // 3. GET /api/seeds
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

    // 4. POST /api/seeds
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

    // 5. GET /
    if (method === 'GET' && pathname === '/') {
      const html = getDashboardHtml();
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache'
      });
      return res.end(html);
    }

    // 404 Not Found
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
  console.log(`  Pin Arbitrage Engine Dashboard active on http://localhost:${PORT}`);
  console.log(`=============================================================`);
});
