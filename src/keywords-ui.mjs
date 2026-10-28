/**
 * Keyword Intelligence & Velocity Dedicated Standalone Studio UI
 * Pure ES Module generating the full HTML application.
 * Compatible with both Cloudflare Workers (V8 isolate) and Node.js.
 *
 * Hardened for Production:
 * - Direct Slug & Deep-Link Routing (/keywords/:slug and /keywords/:keyword)
 * - PinClicks Parity: Right Slide-Over Pin Inspector Drawer with 6 performance cards
 * - Pinterest Trends Parity: 52-Week Interactive Seasonality Curve, Demographics & Related Sparklines
 * - Metric Accuracy: Clear distinction between All-Time Saves vs Direct Reactions (Likes)
 * - Estimated Monthly Volume (~362k/mo) & Seasonal Peak Indicator
 * - Zero-cramping architecture: Full-width table, instant omnibar switcher, slide-over fleet drawer
 * - Request-ID versioning & AbortController (Zero client-side race conditions)
 * - Force-bypass self-healing locks (Zero crawl_lock lockout)
 */

import { getEdgeShieldClientScript } from './edge-shield-client.mjs';
import { getKeywordDrawersAndModalsHtml } from './ui/keywords-drawers.mjs';
import { renderAppSidebar } from './ui/app-sidebar.mjs';
import { renderCampaignWorkspaceHeader } from './ui/campaign-workspace-header.mjs';

export function getKeywordsPageHtml(initialSlug = '', initialKeyword = '', folderId = '') {
  const safeFolderId = String(folderId || '').trim();
  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="referrer" content="same-origin">
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📌</text></svg>">
  <title>Keyword Intelligence & Velocity | Pinterest SERP Radar Studio</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          fontFamily: {
            sans: ['Geist', 'system-ui', '-apple-system', 'sans-serif'],
            mono: ['JetBrains Mono', 'monospace']
          },
          colors: {
            brand: {
              50: '#ecfdf5',
              100: '#d1fae5',
              500: '#10b981',
              600: '#059669',
              700: '#047857',
              900: '#064e3b'
            }
          }
        }
      }
    };
  </script>
  <script src="https://unpkg.com/lucide@0.469.0/dist/umd/lucide.js" defer></script>
  <script defer src="https://unpkg.com/alpinejs@3.14.8/dist/cdn.min.js"></script>
  <style>
    [x-cloak] { display: none !important; }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: rgba(148, 163, 184, 0.25); border-radius: 9999px; }
    ::-webkit-scrollbar-thumb:hover { background: rgba(148, 163, 184, 0.45); }
    .table-sticky-header th { position: sticky; top: 0; z-index: 20; }
  </style>
  <script>
    window.__INITIAL_KEYWORD_SLUG__ = ${JSON.stringify(String(initialSlug || '')).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')};
    window.__INITIAL_FOLDER_ID__ = ${JSON.stringify(safeFolderId).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')};
  </script>
  <script>
(function() {
  if (typeof window === 'undefined' || window.__paeAuthInterceptorInstalled) return;
  window.__paeAuthInterceptorInstalled = true;
  const origFetch = window.fetch.bind(window);
  window.fetch = async function(input, init) {
    const urlStr = typeof input === 'string' ? input : (input && input.url ? input.url : '');
    const isApiCall = urlStr.startsWith('/api/') || urlStr.includes('/api/');
    let savedKey = '';
    try { savedKey = localStorage.getItem('pae_admin_api_key') || ''; } catch (_) {}
    if (isApiCall && savedKey) {
      init = Object.assign({}, init);
      const headers = new Headers(init.headers || (typeof input === 'object' && input.headers ? input.headers : undefined));
      if (!headers.has('x-api-key') && !headers.has('Authorization')) {
        headers.set('x-api-key', savedKey);
      }
      init.headers = headers;
    }
    let res = await origFetch(input, init);
    if (isApiCall && res.status === 401 && typeof window.prompt === 'function') {
      const entered = window.prompt('🔐 Authentication required. Enter API_SECRET_KEY:');
      if (entered && entered.trim()) {
        try { localStorage.setItem('pae_admin_api_key', entered.trim()); } catch (_) {}
        init = Object.assign({}, init);
        const retryHeaders = new Headers(init.headers || {});
        retryHeaders.set('x-api-key', entered.trim());
        init.headers = retryHeaders;
        res = await origFetch(input, init);
      }
    }
    return res;
  };
})();
  </script>
  <script>
    try {
      const savedTheme = localStorage.getItem('pin_theme') || localStorage.getItem('pa_theme');
      if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
      } else if (savedTheme === 'light') {
        document.documentElement.classList.remove('dark');
      }
    } catch (_) {}
  </script>
  <script>
    setTimeout(function() {
      if (typeof document !== 'undefined' && document.body && document.body.hasAttribute('x-cloak')) {
        document.body.removeAttribute('x-cloak');
      }
    }, 1200);
  </script>
</head>
<body x-cloak class="bg-slate-50 dark:bg-[#09090B] text-slate-900 dark:text-slate-100 min-h-screen font-sans antialiased selection:bg-emerald-500 selection:text-white"
      x-data="keywordStudio()">

  <!-- Toast Notification -->
  <div x-show="toast.show" x-cloak
       x-transition:enter="transition ease-out duration-300"
       x-transition:enter-start="opacity-0 translate-y-2"
       x-transition:enter-end="opacity-100 translate-y-0"
       x-transition:leave="transition ease-in duration-200"
       x-transition:leave-start="opacity-100 translate-y-0"
       x-transition:leave-end="opacity-0 translate-y-2"
       class="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-2xl shadow-2xl flex items-center space-x-3 text-xs font-semibold border backdrop-blur-md"
       :class="toast.type === 'success' ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-300' : (toast.type === 'error' ? 'bg-rose-950/90 border-rose-500/40 text-rose-300' : 'bg-slate-900/90 border-slate-700 text-slate-200')">
    <i :data-lucide="toast.type === 'success' ? 'check-circle-2' : (toast.type === 'error' ? 'alert-triangle' : 'info')" class="w-4 h-4 shrink-0"></i>
    <span x-text="toast.message"></span>
  </div>

  ${renderAppSidebar({ activeNav: 'keywords', refreshHandler: 'fetchKeywords(true)' })}

  <!-- Main Full-Width Executive Container (Offset for Unified Desktop Sidebar) [INVARIANT: UNIFIED-SIDEBAR-LAYOUT] -->
  <main class="flex-1 min-h-screen p-4 sm:p-6 lg:p-8 space-y-6 max-w-full overflow-x-hidden transition-all duration-300 ease-in-out" :class="isSidebarCollapsed ? 'md:ml-20' : 'md:ml-64 lg:ml-72'">

    <!-- ========================================================================= -->
    <!-- LEVEL 1A: EXECUTIVE KEYWORDS DASHBOARD (viewModeLevel === 'dashboard')   -->
    <!-- ========================================================================= -->
    <div x-show="viewModeLevel === 'dashboard'" x-cloak class="space-y-6">
      
      ${safeFolderId ? renderCampaignWorkspaceHeader({ activeRoom: 'keywords', folderId: safeFolderId }) : ''}

      <!-- [INVARIANT: MODERN-MINIMALIST-HEADER] Linear / Vercel Executive Header -->
      <template x-if="!activeFolderId">
        <section class="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#121215] border border-slate-200/80 dark:border-[#27272A]/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div class="flex items-center space-x-3.5">
            <div class="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center justify-center shadow-xs shrink-0">
              <i data-lucide="layers" class="w-5 h-5"></i>
            </div>
            <div>
              <div class="flex items-center space-x-2">
                <h2 class="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white">Keywords Fleet Dashboard</h2>
                <span class="px-2 py-0.5 rounded-md text-[10px] font-mono tabular-nums font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">Level 1A</span>
              </div>
              <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-normal">Multi-Cluster Organic SERP Monitoring · Velocity Tracking & Fleet Telemetry</p>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <!-- Keyword Discovery Hub Link (Level 1B) -->
            <a href="/keywords/discovery"
               class="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/10 hover:bg-emerald-500/20 dark:bg-emerald-950/30 dark:hover:bg-emerald-900/40 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 transition inline-flex items-center space-x-1.5 shadow-2xs">
              <i data-lucide="compass" class="w-3.5 h-3.5 text-emerald-500"></i>
              <span class="hidden sm:inline">Discovery</span>
            </a>

            <!-- Campaign Folders Fleet Link (Level 4) -->
            <a href="/folders"
               class="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-pink-500/10 hover:bg-pink-500/20 dark:bg-pink-950/30 dark:hover:bg-pink-900/40 border border-pink-500/20 text-pink-600 dark:text-pink-400 transition inline-flex items-center space-x-1.5 shadow-2xs">
              <i data-lucide="folder-kanban" class="w-3.5 h-3.5 text-pink-500"></i>
              <span class="hidden sm:inline">Folders</span>
              <span class="px-1.5 py-0.2 rounded-full text-[10px] bg-pink-500/20 text-pink-600 dark:text-pink-300 font-mono tabular-nums font-medium" x-text="folders.length"></span>
            </a>

            <!-- Refresh Hub Button -->
            <button @click="fetchKeywords(true)" :disabled="isKeywordsLoading"
                    class="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/80 dark:hover:bg-slate-700/80 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-[#27272A] transition inline-flex items-center space-x-1.5 shadow-2xs cursor-pointer active:scale-95"
                    title="Sync with Neon Central Hub">
              <i data-lucide="refresh-cw" class="w-3.5 h-3.5" :class="isKeywordsLoading ? 'animate-spin text-emerald-500' : 'text-slate-400'"></i>
              <span class="hidden sm:inline">Refresh</span>
            </button>

            <!-- Primary CTA: Track Keyword -->
            <button @click="openQuickTrackModal()"
                    class="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition inline-flex items-center space-x-1.5 shadow-xs active:scale-95 cursor-pointer">
              <i data-lucide="plus-circle" class="w-3.5 h-3.5"></i>
              <span>+ Track Keyword</span>
            </button>

            <!-- Settings -->
            <button @click="openSettingsModal()"
                    class="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/80 dark:hover:bg-slate-700/80 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-[#27272A] transition inline-flex items-center space-x-1.5 shadow-2xs cursor-pointer"
                    title="Configure Crawl Depth & Breakout Hunter">
              <i data-lucide="sliders" class="w-3.5 h-3.5 text-slate-500 dark:text-slate-400"></i>
              <span>Settings</span>
            </button>

            <!-- Trigger Fleet Crawl -->
            <button @click="openFleetDispatchModal()" :disabled="isWorkflowDispatching"
                    class="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white transition inline-flex items-center space-x-1.5 shadow-xs disabled:opacity-50 cursor-pointer">
              <i data-lucide="play" class="w-3.5 h-3.5 text-emerald-400" :class="isWorkflowDispatching ? 'animate-spin' : ''"></i>
              <span>Trigger Fleet</span>
            </button>
          </div>
        </section>
      </template>

      <!-- [INVARIANT: MODERN-MINIMALIST-TELEMETRY-PARITY] Consolidated high-density telemetry strip eliminating card bloat while preserving all 4-pillar fleet telemetry metrics -->
      <section class="rounded-2xl bg-white dark:bg-[#121215] border border-slate-200/80 dark:border-[#27272A]/80 shadow-xs divide-y sm:divide-y-0 sm:divide-x divide-slate-100 dark:divide-slate-800/80 grid grid-cols-2 lg:grid-cols-4 overflow-hidden">
        
        <!-- Metric 1: Tracked Queries Fleet -->
        <div class="p-4 sm:p-5 flex flex-col justify-between space-y-2">
          <div class="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span class="font-medium text-[11px] uppercase tracking-wider font-mono tabular-nums">Tracked Queries</span>
            <span class="p-1 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <i data-lucide="tags" class="w-3.5 h-3.5"></i>
            </span>
          </div>
          <template x-if="isKeywordsLoading">
            <div class="space-y-1 py-0.5">
              <div class="h-7 w-16 bg-slate-200 dark:bg-slate-800 rounded animate-pulse"></div>
              <div class="h-3 w-24 bg-slate-100 dark:bg-slate-800/60 rounded animate-pulse"></div>
            </div>
          </template>
          <template x-if="!isKeywordsLoading">
            <div>
              <div class="flex items-baseline gap-2">
                <span class="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white font-mono tabular-nums tracking-tight" x-text="activeFolderId ? filteredDashboardKeywords.length : keywords.length"></span>
                <span class="text-xs text-slate-400 font-mono tabular-nums">monitored</span>
              </div>
              <div class="flex items-center gap-2 mt-1.5 text-[11px] font-mono tabular-nums">
                <span class="text-emerald-600 dark:text-emerald-400 font-semibold" x-text="activeKeywordsCount + ' active'"></span>
                <span class="text-slate-300 dark:text-slate-700">·</span>
                <span class="text-amber-600 dark:text-amber-400 font-medium" x-text="pausedKeywordsCount + ' paused'"></span>
              </div>
            </div>
          </template>
        </div>

        <!-- Metric 2: Monitored Organic Pins -->
        <div class="p-4 sm:p-5 flex flex-col justify-between space-y-2">
          <div class="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span class="font-medium text-[11px] uppercase tracking-wider font-mono tabular-nums" x-text="activeFolderId ? 'Active Crawled Pins' : 'Monitored Organic Pins'"></span>
            <span class="p-1 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <i data-lucide="database" class="w-3.5 h-3.5"></i>
            </span>
          </div>
          <template x-if="isKeywordsLoading">
            <div class="space-y-1 py-0.5">
              <div class="h-7 w-20 bg-slate-200 dark:bg-slate-800 rounded animate-pulse"></div>
              <div class="h-3 w-28 bg-slate-100 dark:bg-slate-800/60 rounded animate-pulse"></div>
            </div>
          </template>
          <template x-if="!isKeywordsLoading">
            <div>
              <div class="flex items-baseline gap-2">
                <span class="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white font-mono tabular-nums tracking-tight" x-text="formatNumber(totalMonitoredPins)"></span>
                <span class="text-xs text-slate-400 font-mono tabular-nums">pins</span>
              </div>
              <div class="mt-1.5 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                <span>Quota: </span>
                <span class="text-blue-600 dark:text-blue-400 font-medium" x-text="'~' + (appSettings.default_max_pins || 250) + ' pins / query'"></span>
              </div>
            </div>
          </template>
        </div>

        <!-- Metric 3: Campaign Folders (Global) / Displaced Pins (Folder Scoped) -->
        <div class="p-4 sm:p-5 flex flex-col justify-between space-y-2">
          <div class="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span class="font-medium text-[11px] uppercase tracking-wider font-mono tabular-nums" x-text="activeFolderId ? 'Displaced Pins' : 'Campaign Folders'"></span>
            <span class="p-1 rounded-md" :class="activeFolderId ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'">
              <i :data-lucide="activeFolderId ? 'archive' : 'folder'" class="w-3.5 h-3.5"></i>
            </span>
          </div>
          <template x-if="isKeywordsLoading">
            <div class="space-y-1 py-0.5">
              <div class="h-7 w-20 bg-slate-200 dark:bg-slate-800 rounded animate-pulse"></div>
              <div class="h-3 w-28 bg-slate-100 dark:bg-slate-800/60 rounded animate-pulse"></div>
            </div>
          </template>
          <template x-if="!isKeywordsLoading">
            <div>
              <div class="flex items-baseline gap-2">
                <span class="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white font-mono tabular-nums tracking-tight" x-text="formatNumber(activeFolderId ? totalDisplacedPinsCount : folders.length)"></span>
                <span class="text-xs text-slate-400 font-mono tabular-nums" x-text="activeFolderId ? 'in vault' : 'organized'"></span>
              </div>
              <div class="mt-1.5 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                <template x-if="!activeFolderId">
                  <a href="/folders" class="text-amber-600 dark:text-amber-400 hover:underline font-medium inline-flex items-center gap-1">
                    <span>Manage folders</span>
                    <i data-lucide="arrow-right" class="w-3 h-3"></i>
                  </a>
                </template>
                <template x-if="activeFolderId">
                  <span class="text-indigo-600 dark:text-indigo-400 font-medium">Displaced organic pins</span>
                </template>
              </div>
            </div>
          </template>
        </div>

        <!-- Metric 4: Nightly Crawler Fleet Status (Global) / Average Velocity (Folder Scoped) -->
        <div class="p-4 sm:p-5 flex flex-col justify-between space-y-2">
          <div class="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span class="font-medium text-[11px] uppercase tracking-wider font-mono tabular-nums" x-text="activeFolderId ? 'Average Velocity' : 'Nightly Crawler Fleet'"></span>
            <span class="p-1 rounded-md" :class="activeFolderId ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400' : 'bg-purple-500/10 text-purple-600 dark:text-purple-400'">
              <i :data-lucide="activeFolderId ? 'zap' : 'clock'" class="w-3.5 h-3.5"></i>
            </span>
          </div>
          <div>
            <template x-if="!activeFolderId">
              <div>
                <div class="flex items-center gap-2">
                  <span class="px-2 py-0.5 rounded-md text-[10px] font-mono tabular-nums font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 inline-flex items-center gap-1.5">
                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span>OPERATIONAL</span>
                  </span>
                </div>
                <div class="mt-2 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 truncate" :title="nightlySyncCountdown">
                  <span x-text="nightlySyncCountdown"></span>
                </div>
              </div>
            </template>
            <template x-if="activeFolderId">
              <div>
                <div class="flex items-baseline gap-2">
                  <span class="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white font-mono tabular-nums tracking-tight" x-text="averageFleetVelocity"></span>
                  <span class="text-xs text-slate-400 font-mono tabular-nums">saves / day</span>
                </div>
                <div class="mt-1.5 text-[11px] font-mono tabular-nums text-purple-600 dark:text-purple-400 font-medium">
                  <span>Cluster save velocity</span>
                </div>
              </div>
            </template>
          </div>
        </div>

      </section>

      <!-- FILTER & SORT CONTROLS STRIP (LINEAR STYLE) -->
      <section class="p-3.5 rounded-2xl bg-white dark:bg-[#121215] border border-slate-200/80 dark:border-[#27272A]/80 shadow-xs space-y-2.5">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
          <!-- Left: Search and Dropdowns -->
          <div class="flex flex-wrap items-center gap-2 flex-1">
            <!-- Search input with clear button -->
            <div class="relative flex-1 min-w-[220px] max-w-sm">
              <i data-lucide="search" class="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"></i>
              <input type="text" x-model="dashboardSearch" placeholder="Search keywords, categories, or folders..."
                     class="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-[#27272A]/90 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition">
              <button x-show="dashboardSearch" @click="dashboardSearch = ''"
                      class="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white p-0.5 cursor-pointer">
                <i data-lucide="x" class="w-3 h-3"></i>
              </button>
            </div>

            <!-- Campaign Folders filter dropdown -->
            <select x-model="dashboardFolderFilter" class="px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-[#27272A]/90 text-xs font-medium text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 cursor-pointer">
              <option value="ALL">📁 All Folders</option>
              <option value="UNASSIGNED">Unassigned (No Folder)</option>
              <template x-for="f in folders" :key="f.id">
                <option :value="f.id" x-text="'📁 ' + f.name + ' (' + getFolderKeywordCount(f) + ')'"></option>
              </template>
            </select>

            <!-- Category filter dropdown -->
            <select x-model="dashboardCategoryFilter" class="px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-[#27272A]/90 text-xs font-medium text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 cursor-pointer">
              <option value="ALL">All Categories</option>
              <template x-for="cat in uniqueCategories" :key="cat">
                <option :value="cat" x-text="cat"></option>
              </template>
            </select>

            <!-- Status filter dropdown -->
            <select x-model="dashboardStatusFilter" class="px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-[#27272A]/90 text-xs font-medium text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 cursor-pointer">
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active Only</option>
              <option value="PAUSED">Paused Only</option>
            </select>

            <!-- Sort filter dropdown -->
            <select x-model="dashboardSort" class="px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-[#27272A]/90 text-xs font-medium text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 cursor-pointer">
              <option value="total_pins">Sort: Total Pins</option>
              <option value="created_desc">Sort: Date Added (Newest)</option>
              <option value="created_asc">Sort: Date Added (Oldest)</option>
              <option value="crawled">Sort: Recently Crawled</option>
              <option value="name">Sort: Alphabetical (A-Z)</option>
            </select>
          </div>

          <!-- Right: Counter, Columns Visibility & Table/Grid View Switcher -->
          <div class="flex items-center space-x-2 shrink-0">
            <span class="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 font-medium hidden md:inline"
                  x-text="filteredDashboardKeywords.length + ' of ' + (activeFolderId ? filteredDashboardKeywords.length : keywords.length) + ' Queries'"></span>

            <!-- Column Visibility Dropdown -->
            <div x-show="dashboardViewMode === 'table'" class="relative" x-data="{ isColumnsOpen: false }" @click.outside="isColumnsOpen = false" @keydown.escape.window="isColumnsOpen = false">
              <button type="button" @click="isColumnsOpen = !isColumnsOpen"
                      class="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-[#27272A] text-slate-700 dark:text-slate-300 text-xs font-medium transition flex items-center space-x-1.5 cursor-pointer shadow-2xs">
                <i data-lucide="columns-3" class="w-3.5 h-3.5 text-slate-400"></i>
                <span>Columns</span>
                <i data-lucide="chevron-down" class="w-3 h-3 text-slate-400 transition-transform" :class="isColumnsOpen ? 'rotate-180' : ''"></i>
              </button>

              <!-- Dropdown menu -->
              <div x-show="isColumnsOpen" x-cloak
                   x-transition:enter="transition ease-out duration-150"
                   x-transition:enter-start="opacity-0 scale-95"
                   x-transition:enter-end="opacity-100 scale-100"
                   x-transition:leave="transition ease-in duration-100"
                   x-transition:leave-start="opacity-100 scale-100"
                   x-transition:leave-end="opacity-0 scale-95"
                   class="absolute right-0 mt-2 w-56 rounded-xl bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] shadow-xl p-2 space-y-0.5 z-40 text-xs font-sans">
                <div class="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono tabular-nums border-b border-slate-100 dark:border-[#27272A]/80 flex items-center justify-between">
                  <span>Display Columns</span>
                  <button type="button" @click="resetColumns()" class="text-emerald-500 hover:underline capitalize text-[10px]">Reset</button>
                </div>
                
                <template x-for="col in columnDefinitions" :key="col.key">
                  <label class="flex items-center space-x-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer select-none transition"
                         :class="col.required ? 'opacity-60 cursor-not-allowed' : ''">
                    <input type="checkbox"
                           :checked="visibleColumns[col.key]"
                           :disabled="col.required"
                           @change="toggleColumn(col.key)"
                           class="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 dark:border-[#27272A] cursor-pointer">
                    <span class="text-xs text-slate-700 dark:text-slate-300 font-medium" x-text="col.label"></span>
                    <template x-if="col.required">
                      <span class="text-[9px] text-slate-400 font-mono tabular-nums ml-auto">(Required)</span>
                    </template>
                  </label>
                </template>
              </div>
            </div>

            <!-- View Switcher (Table vs Grid) -->
            <div class="flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-[#27272A]">
              <button @click="dashboardViewMode = 'table'"
                      :class="dashboardViewMode === 'table' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs font-semibold' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'"
                      class="px-2 py-1 rounded-md text-xs transition flex items-center space-x-1 cursor-pointer"
                      title="Table View">
                <i data-lucide="list" class="w-3.5 h-3.5"></i>
                <span class="hidden sm:inline">Table</span>
              </button>
              <button @click="dashboardViewMode = 'grid'"
                      :class="dashboardViewMode === 'grid' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs font-semibold' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'"
                      class="px-2 py-1 rounded-md text-xs transition flex items-center space-x-1 cursor-pointer"
                      title="Visual Cards View">
                <i data-lucide="layout-grid" class="w-3.5 h-3.5"></i>
                <span class="hidden sm:inline">Grid</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Category Quick Pills & Active Folder Pill -->
        <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-[#27272A]/80 text-xs">
          <div class="flex flex-wrap items-center gap-1.5">
            <span class="text-[10px] font-semibold text-slate-400 uppercase tracking-wider font-mono tabular-nums mr-1">Categories:</span>
            <button @click="dashboardCategoryFilter = 'ALL'"
                    class="px-2 py-0.5 rounded-md text-xs font-medium transition cursor-pointer"
                    :class="dashboardCategoryFilter === 'ALL' ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-2xs' : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'">
              All
            </button>
            <template x-for="cat in uniqueCategories" :key="cat">
              <button @click="dashboardCategoryFilter = cat"
                      class="px-2 py-0.5 rounded-md text-xs font-medium transition cursor-pointer"
                      :class="dashboardCategoryFilter === cat ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-2xs' : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'"
                      x-text="cat"></button>
            </template>
          </div>

          <!-- Active Folder Filter Indicator -->
          <template x-if="dashboardFolderFilter !== 'ALL'">
            <div class="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-md bg-pink-500/10 text-pink-700 dark:text-pink-300 text-xs font-semibold border border-pink-500/20 font-mono tabular-nums">
              <i data-lucide="folder" class="w-3 h-3 text-pink-500"></i>
              <span>Folder: <span x-text="activeFolderName"></span></span>
              <button @click="clearFolderFilter()" class="hover:text-pink-900 dark:hover:text-white p-0.5 cursor-pointer ml-1" title="Clear Folder Filter">
                <i data-lucide="x" class="w-2.5 h-2.5"></i>
              </button>
            </div>
          </template>
        </div>
      </section>

      <!-- [INVARIANT: HIGH-DENSITY-SERP-TABLE] Modern Minimalist SaaS table with Linear-grade tabular figures, dot status indicators, and clean nested vault pins breakdown -->
      <section id="keywords-dashboard-table" x-show="dashboardViewMode === 'table'" class="rounded-2xl bg-white dark:bg-[#121215] border border-slate-200/80 dark:border-[#27272A]/80 shadow-xs overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="table-sticky-header bg-slate-50/90 dark:bg-[#121215]/90 border-b border-slate-200/80 dark:border-[#27272A]/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                <th class="py-3 px-3.5 w-10 text-center">
                  <input type="checkbox" @click="toggleSelectAllDashboardKeywords()"
                         :checked="paginatedDashboardKeywords.length > 0 && paginatedDashboardKeywords.every(k => isDashboardKeywordSelected(k.id))"
                         class="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 dark:border-[#27272A] bg-white dark:bg-slate-900 cursor-pointer">
                </th>
                <th x-show="visibleColumns.preview" class="py-3 px-3 w-14">Preview</th>
                <th x-show="visibleColumns.keyword" class="py-3 px-4 min-w-[240px]">Keyword & Folders</th>
                <th x-show="visibleColumns.total_pins" class="py-3 px-3 w-36">SERP Breakdown</th>
                <th x-show="visibleColumns.status" class="py-3 px-3 w-24 text-center">Status</th>
                <th x-show="visibleColumns.created_at" class="py-3 px-3 w-32">Date Added</th>
                <th x-show="visibleColumns.last_crawled" class="py-3 px-3 w-32">Last Crawled</th>
                <th x-show="visibleColumns.actions" class="py-3 px-4 w-32 text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
              <!-- Skeleton Loading Rows -->
              <template x-if="isKeywordsLoading">
                <template x-for="i in [1, 2, 3, 4, 5]" :key="i">
                  <tr class="animate-pulse">
                    <td class="py-3.5 px-3.5 text-center"><div class="w-3.5 h-3.5 bg-slate-200 dark:bg-slate-800 rounded mx-auto"></div></td>
                    <td x-show="visibleColumns.preview" class="py-3.5 px-3"><div class="w-10 h-14 bg-slate-200 dark:bg-slate-800 rounded-lg"></div></td>
                    <td x-show="visibleColumns.keyword" class="py-3.5 px-4">
                      <div class="space-y-1.5">
                        <div class="h-3.5 w-36 bg-slate-200 dark:bg-slate-800 rounded"></div>
                        <div class="h-2.5 w-20 bg-slate-100 dark:bg-slate-800/60 rounded"></div>
                      </div>
                    </td>
                    <td x-show="visibleColumns.total_pins" class="py-3.5 px-3"><div class="h-4 w-24 bg-slate-200 dark:bg-slate-800 rounded"></div></td>
                    <td x-show="visibleColumns.status" class="py-3.5 px-3 text-center"><div class="h-5 w-14 bg-slate-200 dark:bg-slate-800 rounded-full mx-auto"></div></td>
                    <td x-show="visibleColumns.created_at" class="py-3.5 px-3"><div class="h-3 w-16 bg-slate-200 dark:bg-slate-800 rounded"></div></td>
                    <td x-show="visibleColumns.last_crawled" class="py-3.5 px-3"><div class="h-3 w-16 bg-slate-200 dark:bg-slate-800 rounded"></div></td>
                    <td x-show="visibleColumns.actions" class="py-3.5 px-4 text-right"><div class="h-6 w-20 bg-slate-200 dark:bg-slate-800 rounded-lg ml-auto"></div></td>
                  </tr>
                </template>
              </template>

              <!-- Real Data Rows -->
              <template x-if="!isKeywordsLoading">
                <template x-for="kw in paginatedDashboardKeywords" :key="kw.id">
                  <tr class="hover:bg-slate-50/80 dark:hover:bg-slate-800/35 transition-colors duration-150 group cursor-pointer"
                      :class="isDashboardKeywordSelected(kw.id) ? 'bg-emerald-50/40 dark:bg-emerald-950/20' : ''"
                      @click="switchToSerpStudio(kw)">
                    
                    <!-- Checkbox -->
                    <td class="py-3 px-3.5 text-center" @click.stop>
                      <input type="checkbox" :checked="isDashboardKeywordSelected(kw.id)" @click="toggleDashboardKeywordSelection(kw.id)"
                             class="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 dark:border-[#27272A] bg-white dark:bg-slate-900 cursor-pointer">
                    </td>

                    <!-- Thumbnail with Zoom -->
                    <td x-show="visibleColumns.preview" class="py-3 px-3">
                      <div class="w-10 h-14 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-900 border border-slate-200/80 dark:border-[#27272A] shadow-2xs relative">
                        <template x-if="kw.top_pin_image">
                          <img :src="kw.top_pin_image" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200">
                        </template>
                        <template x-if="!kw.top_pin_image">
                          <div class="w-full h-full flex items-center justify-center">
                            <i data-lucide="image" class="w-3.5 h-3.5 text-slate-400"></i>
                          </div>
                        </template>
                      </div>
                    </td>

                    <!-- Keyword & Category & Folder Tags -->
                    <td x-show="visibleColumns.keyword" class="py-3 px-4 min-w-[240px]">
                      <div class="space-y-1">
                        <span class="font-semibold text-slate-900 dark:text-slate-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 text-sm capitalize block transition-colors leading-snug"
                              x-text="kw.keyword"></span>
                        <div class="flex flex-wrap items-center gap-1.5">
                          <span class="px-1.5 py-0.5 rounded text-[10px] font-mono tabular-nums font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/60 dark:border-[#27272A]/60"
                                x-text="kw.category || 'General'"></span>
                          
                          <!-- Campaign Folders Tags -->
                          <template x-for="f in getKeywordFolders(kw)" :key="f.id">
                            <button type="button" @click.stop="filterByFolder(f.id)"
                                    class="px-1.5 py-0.5 rounded text-[10px] font-medium font-mono tabular-nums transition inline-flex items-center gap-1 border cursor-pointer hover:opacity-85 shadow-2xs"
                                    :style="'background-color: ' + (f.color || '#ec4899') + '12; color: ' + (f.color || '#ec4899') + '; border-color: ' + (f.color || '#ec4899') + '30;'"
                                    :title="'Filter by folder: ' + f.name">
                              <i data-lucide="folder" class="w-2.5 h-2.5 shrink-0"></i>
                              <span class="max-w-[110px] truncate" x-text="f.name"></span>
                            </button>
                          </template>

                          <!-- If no folders, quick add button -->
                          <template x-if="getKeywordFolders(kw).length === 0">
                            <button type="button" @click.stop="openQuickFolderModal(kw)"
                                    class="px-1.5 py-0.5 rounded text-[10px] font-mono tabular-nums text-slate-400 hover:text-pink-500 hover:bg-pink-500/10 transition border border-dashed border-slate-200 dark:border-[#27272A] inline-flex items-center gap-1 cursor-pointer"
                                    title="Add to Campaign Folder">
                              <i data-lucide="folder-plus" class="w-2.5 h-2.5"></i>
                              <span>Folder</span>
                            </button>
                          </template>

                          <template x-if="kw.annotation_id">
                            <span class="text-[10px] font-mono tabular-nums text-slate-400" x-text="'ID: ' + kw.annotation_id"></span>
                          </template>
                        </div>
                      </div>
                    </td>

                    <!-- SERP Topology & Total Pins (Two-Tone Topology Bar) -->
                    <td x-show="visibleColumns.total_pins" class="py-3 px-3 font-mono tabular-nums">
                      <div class="space-y-1.5 min-w-[120px]" :title="(kw.active_pins_count ?? getKeywordTotalPins(kw)) + ' Active SERP + ' + (kw.displaced_pins_count || 0) + ' Displaced Vault'">
                        <div class="flex items-center justify-between text-xs">
                          <div class="flex items-center gap-1 text-[11px]">
                            <span class="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums" x-text="(kw.active_pins_count || getKeywordTotalPins(kw)) + ' Act'"></span>
                            <span class="text-slate-300 dark:text-slate-700">·</span>
                            <span class="font-medium text-indigo-600 dark:text-indigo-400 tabular-nums" x-text="(kw.displaced_pins_count || 0) + ' Vault'"></span>
                          </div>
                          <span class="text-[10px] text-slate-400 font-mono tabular-nums" x-text="formatNumber(getKeywordTotalPins(kw))"></span>
                        </div>
                        <!-- Two-Tone Topology Progress Bar -->
                        <div class="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
                          <div class="bg-emerald-500 h-full transition-all duration-300"
                                :style="'width: ' + getActiveSerpPercentage(kw) + '%'"
                                :title="'Active SERP: ' + getActiveSerpPercentage(kw) + '%'"></div>
                          <div class="bg-indigo-500 h-full transition-all duration-300"
                                :style="'width: ' + (100 - getActiveSerpPercentage(kw)) + '%'"
                                :title="'Displaced Vault: ' + (100 - getActiveSerpPercentage(kw)) + '%'"></div>
                        </div>
                      </div>
                    </td>

                    <!-- Status Indicator (Linear Dot Badge) -->
                    <td x-show="visibleColumns.status" class="py-3 px-3 text-center" @click.stop>
                      <button @click="toggleKeywordStatus(kw)"
                              class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-mono tabular-nums font-medium transition cursor-pointer border shadow-2xs"
                              :class="kw.is_active !== false ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 hover:bg-amber-500/20'"
                              :title="kw.is_active !== false ? 'Click to Pause Tracking' : 'Click to Resume Tracking'">
                        <span class="w-1.5 h-1.5 rounded-full" :class="kw.is_active !== false ? 'bg-emerald-500' : 'bg-amber-500'"></span>
                        <span x-text="kw.is_active !== false ? 'Active' : 'Paused'"></span>
                      </button>
                    </td>

                    <!-- Date Added -->
                    <td x-show="visibleColumns.created_at" class="py-3 px-3">
                      <div class="space-y-0.5 font-mono tabular-nums text-xs">
                        <span class="font-medium text-slate-700 dark:text-slate-300 block" x-text="kw._relativeCreatedAt || formatRelativeTime(kw.created_at)"></span>
                        <span class="text-[10px] text-slate-400 dark:text-slate-500 block truncate" x-text="kw._formattedCreatedAt || formatDate(kw.created_at)"></span>
                      </div>
                    </td>

                    <!-- Last Crawled -->
                    <td x-show="visibleColumns.last_crawled" class="py-3 px-3">
                      <div class="space-y-0.5 font-mono tabular-nums text-xs">
                        <span class="font-medium text-slate-700 dark:text-slate-300 block" x-text="kw._relativeCrawledAt || formatRelativeTime(kw.last_crawled_at)"></span>
                        <span class="text-[10px] text-slate-400 dark:text-slate-500 block truncate" x-text="kw._formattedCrawledAt || formatDate(kw.last_crawled_at)"></span>
                      </div>
                    </td>

                    <!-- Actions -->
                    <td x-show="visibleColumns.actions" class="py-3 px-4 text-right" @click.stop>
                      <div class="flex items-center justify-end gap-1.5">
                        <button @click="switchToSerpStudio(kw)"
                                class="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition inline-flex items-center gap-1 shadow-2xs cursor-pointer group-hover:scale-102"
                                title="Open SERP Studio">
                          <span>Studio</span>
                          <i data-lucide="arrow-right" class="w-3 h-3"></i>
                        </button>
                        <button @click="rescanKeyword(kw.id, true)" :disabled="syncingKeywordId === kw.id"
                                class="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                                :title="'Re-Crawl ' + (kw.target_pin_count || 250) + ' pins'">
                          <i data-lucide="refresh-cw" class="w-3.5 h-3.5" :class="syncingKeywordId === kw.id ? 'animate-spin text-emerald-500' : ''"></i>
                        </button>
                        <button @click="deleteKeyword(kw.id)"
                                class="p-1 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition cursor-pointer"
                                title="Delete Keyword">
                          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                        </button>
                      </div>
                    </td>

                  </tr>
                </template>
              </template>

              <!-- Empty State Row -->
              <template x-if="!isKeywordsLoading && (!filteredDashboardKeywords || filteredDashboardKeywords.length === 0)">
                <tr>
                  <td :colspan="activeVisibleColumnCount" class="py-16 text-center">
                    <div class="max-w-md mx-auto space-y-3.5 p-4">
                      <div class="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 mx-auto flex items-center justify-center">
                        <i data-lucide="search" class="w-5 h-5"></i>
                      </div>
                      <h3 class="text-sm font-semibold text-slate-900 dark:text-white">No Tracked Keywords Found</h3>
                      <p class="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                        Monitor comprehensive SERP rankings, save velocity, and visual co-occurrence in real time. Track an evergreen query like <strong class="text-emerald-500 cursor-pointer hover:underline" @click="quickTrackKeyword('breakfast ideas')">"breakfast ideas"</strong> now.
                      </p>
                      <div class="flex items-center gap-2 max-w-sm mx-auto pt-1">
                        <input type="text" x-model="quickKeywordInput" @keydown.enter="submitQuickKeyword()"
                               placeholder="e.g. breakfast ideas, high protein meals..."
                               class="flex-1 px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-[#27272A] text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500/50">
                        <button @click="submitQuickKeyword()"
                                class="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition inline-flex items-center gap-1 shrink-0 cursor-pointer">
                          <i data-lucide="plus" class="w-3.5 h-3.5"></i>
                          <span>Track & Crawl</span>
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>

        <!-- DASHBOARD TABLE PAGINATION FOOTER -->
        <template x-if="!isKeywordsLoading && filteredDashboardKeywords && filteredDashboardKeywords.length > 0">
          <div class="px-4 py-3 border-t border-slate-200/80 dark:border-[#27272A]/80 bg-slate-50/50 dark:bg-slate-900/30 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            
            <!-- Left: Items range & Page Size selector -->
            <div class="flex flex-wrap items-center gap-3 text-slate-500 font-mono tabular-nums text-[11px]">
              <div>
                <span>Showing </span>
                <span class="font-bold text-slate-900 dark:text-white" x-text="dashboardRangeStart"></span>
                <span> - </span>
                <span class="font-bold text-slate-900 dark:text-white" x-text="dashboardRangeEnd"></span>
                <span> of </span>
                <span class="font-bold text-slate-900 dark:text-white" x-text="filteredDashboardKeywords.length"></span>
                <span> Queries</span>
              </div>

              <!-- Per Page Selector -->
              <div class="flex items-center space-x-1.5">
                <span class="text-slate-400 font-sans">Rows:</span>
                <select x-model="dashboardPageSize" class="px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-[11px] font-mono tabular-nums font-medium text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer">
                  <option :value="10">10 / page</option>
                  <option :value="25">25 / page</option>
                  <option :value="50">50 / page</option>
                  <option value="all">All</option>
                </select>
              </div>

              <template x-if="selectedKeywordIds.length > 0">
                <span class="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium border border-emerald-500/20 font-sans"
                      x-text="selectedKeywordIds.length + ' selected'"></span>
              </template>
            </div>

            <!-- Right: Pagination Buttons -->
            <template x-if="dashboardPageSize !== 'all' && dashboardTotalPages > 1">
              <div class="flex items-center space-x-1">
                <!-- First Page -->
                <button type="button" @click="setDashboardPage(1)" :disabled="dashboardPage <= 1"
                        class="p-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer text-slate-600 dark:text-slate-400"
                        title="First Page">
                  <i data-lucide="chevrons-left" class="w-3.5 h-3.5"></i>
                </button>

                <!-- Previous Page -->
                <button type="button" @click="setDashboardPage(dashboardPage - 1)" :disabled="dashboardPage <= 1"
                        class="p-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer text-slate-600 dark:text-slate-400"
                        title="Previous Page">
                  <i data-lucide="chevron-left" class="w-3.5 h-3.5"></i>
                </button>

                <!-- Numbered Page Pills -->
                <div class="flex items-center space-x-1 px-1">
                  <template x-for="(p, pIdx) in dashboardPageNumbers" :key="'p-' + pIdx + '-' + p">
                    <div>
                      <span x-show="p === '...'" class="px-1.5 py-0.5 text-slate-400 font-mono tabular-nums text-xs">...</span>
                      <button x-show="p !== '...'" type="button" @click="setDashboardPage(p)"
                              class="min-w-7 h-7 px-1.5 rounded-md text-xs font-mono tabular-nums font-medium transition cursor-pointer"
                              :class="dashboardPage === p ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-2xs' : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'"
                              x-text="p"></button>
                    </div>
                  </template>
                </div>

                <!-- Next Page -->
                <button type="button" @click="setDashboardPage(dashboardPage + 1)" :disabled="dashboardPage >= dashboardTotalPages"
                        class="p-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer text-slate-600 dark:text-slate-400"
                        title="Next Page">
                  <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>
                </button>

                <!-- Last Page -->
                <button type="button" @click="setDashboardPage(dashboardTotalPages)" :disabled="dashboardPage >= dashboardTotalPages"
                        class="p-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer text-slate-600 dark:text-slate-400"
                        title="Last Page">
                  <i data-lucide="chevrons-right" class="w-3.5 h-3.5"></i>
                </button>
              </div>
            </template>
          </div>
        </template>
      </section>

      <!-- VIEW MODE 2: PINTEREST-STYLE VISUAL CARDS GRID (LINEAR / VERCEL STYLE) -->
      <section id="keywords-dashboard-grid" x-show="dashboardViewMode === 'grid'" class="space-y-4">
        <!-- Grid Skeleton Loader -->
        <template x-if="isKeywordsLoading">
          <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            <template x-for="i in [1, 2, 3, 4]" :key="i">
              <div class="rounded-2xl bg-white dark:bg-[#121215] border border-slate-200/80 dark:border-[#27272A]/80 p-3.5 space-y-3 animate-pulse">
                <div class="w-full h-44 bg-slate-200 dark:bg-slate-800 rounded-xl"></div>
                <div class="h-4 w-32 bg-slate-200 dark:bg-slate-800 rounded"></div>
                <div class="h-3 w-20 bg-slate-100 dark:bg-slate-800/60 rounded"></div>
              </div>
            </template>
          </div>
        </template>

        <!-- Grid Cards -->
        <template x-if="!isKeywordsLoading">
          <div class="space-y-4">
            <!-- Grid Empty State -->
            <template x-if="!filteredDashboardKeywords || filteredDashboardKeywords.length === 0">
              <div class="p-12 text-center rounded-2xl bg-white dark:bg-[#121215] border border-slate-200/80 dark:border-[#27272A]/80 shadow-xs">
                <div class="max-w-md mx-auto space-y-3">
                  <div class="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 mx-auto flex items-center justify-center">
                    <i data-lucide="search" class="w-5 h-5"></i>
                  </div>
                  <h3 class="text-sm font-semibold text-slate-900 dark:text-white">No Tracked Keywords Found</h3>
                  <p class="text-xs text-slate-500 dark:text-slate-400">Try adjusting your category, folder, or search filters.</p>
                </div>
              </div>
            </template>

            <div x-show="filteredDashboardKeywords && filteredDashboardKeywords.length > 0"
                 class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
              <template x-for="kw in paginatedDashboardKeywords" :key="kw.id">
                <div class="rounded-2xl bg-white dark:bg-[#121215] border border-slate-200/80 dark:border-[#27272A]/80 p-3.5 shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition duration-150 group flex flex-col justify-between cursor-pointer space-y-3"
                     @click="switchToSerpStudio(kw)">
                  
                  <!-- Card Header: Image Banner with Floating Badges -->
                  <div class="w-full h-44 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-900 border border-slate-200/70 dark:border-[#27272A] relative">
                    <template x-if="kw.top_pin_image">
                      <img :src="kw.top_pin_image" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300">
                    </template>
                    <template x-if="!kw.top_pin_image">
                      <div class="w-full h-full flex items-center justify-center">
                        <i data-lucide="image" class="w-6 h-6 text-slate-400"></i>
                      </div>
                    </template>

                    <!-- Top Badges Overlay -->
                    <div class="absolute top-2 left-2 right-2 flex items-center justify-between">
                      <span class="px-2 py-0.5 rounded-full text-[10px] font-mono tabular-nums font-medium backdrop-blur-md"
                            :class="kw.is_active !== false ? 'bg-slate-950/80 text-emerald-400 border border-emerald-500/30' : 'bg-slate-950/80 text-amber-400 border border-amber-500/30'"
                            x-text="kw.is_active !== false ? '● Active' : '● Paused'"></span>

                      <span class="px-2 py-0.5 rounded-full text-[10px] font-mono tabular-nums font-medium bg-slate-950/80 text-slate-200 backdrop-blur-md border border-slate-700/60 inline-flex items-center space-x-1"
                            :title="(kw.active_pins_count ?? getKeywordTotalPins(kw)) + ' Active + ' + (kw.displaced_pins_count || 0) + ' Vault'">
                        <i data-lucide="pin" class="w-3 h-3 text-emerald-400"></i>
                        <span x-text="getKeywordTotalPins(kw) + ' Pins'"></span>
                        <template x-if="Number(kw.displaced_pins_count || 0) > 0">
                          <span class="text-[9px] text-indigo-300 font-semibold ml-0.5" x-text="'(' + (kw.active_pins_count || 0) + ' Active + ' + kw.displaced_pins_count + ' Vault)'"></span>
                        </template>
                      </span>
                    </div>
                  </div>

                  <!-- Card Body -->
                  <div class="space-y-2 flex-1">
                    <div class="flex items-start justify-between gap-2">
                      <h3 class="font-semibold text-slate-900 dark:text-white text-sm capitalize group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition truncate"
                          x-text="kw.keyword"></h3>
                    </div>

                    <div class="flex flex-wrap items-center gap-1">
                      <span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono tabular-nums font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/60 dark:border-[#27272A]/60"
                            x-text="kw.category || 'General'"></span>
                      
                      <!-- Folder Tags -->
                      <template x-for="f in getKeywordFolders(kw)" :key="f.id">
                        <button type="button" @click.stop="filterByFolder(f.id)"
                                class="px-1.5 py-0.5 rounded text-[10px] font-medium font-mono tabular-nums transition inline-flex items-center space-x-1 border cursor-pointer hover:opacity-85 shadow-2xs"
                                :style="'background-color: ' + (f.color || '#ec4899') + '12; color: ' + (f.color || '#ec4899') + '; border-color: ' + (f.color || '#ec4899') + '30;'"
                                :title="'Click to filter keywords in: ' + f.name">
                          <i data-lucide="folder" class="w-2.5 h-2.5 shrink-0"></i>
                          <span class="max-w-[110px] truncate" x-text="f.name"></span>
                        </button>
                      </template>
                    </div>

                    <!-- Total Pins & Topology Progress Bar -->
                    <div class="space-y-1 pt-1.5 font-mono tabular-nums text-xs">
                      <div class="flex items-center justify-between text-[11px]">
                        <span class="text-slate-400 font-sans">SERP Topology:</span>
                        <div>
                          <span class="text-emerald-600 dark:text-emerald-400 font-bold" x-text="(kw.active_pins_count || getKeywordTotalPins(kw)) + ' Act'"></span>
                          <span class="text-slate-300 dark:text-slate-700">·</span>
                          <span class="text-indigo-600 dark:text-indigo-400 font-medium" x-text="(kw.displaced_pins_count || 0) + ' Vault'"></span>
                        </div>
                      </div>
                      <div class="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
                        <div class="bg-emerald-500 h-full transition-all duration-300"
                             :style="'width: ' + getActiveSerpPercentage(kw) + '%'"></div>
                        <div class="bg-indigo-500 h-full transition-all duration-300"
                             :style="'width: ' + (100 - getActiveSerpPercentage(kw)) + '%'"></div>
                      </div>
                    </div>
                  </div>

                  <!-- Card Footer Actions -->
                  <div class="pt-2 border-t border-slate-100 dark:border-[#27272A] flex items-center justify-between text-xs">
                    <div class="space-y-0.5 text-[10px] font-mono tabular-nums">
                      <span class="block text-slate-500 dark:text-slate-400 truncate" x-text="'Added: ' + (kw._formattedCreatedAt || formatDate(kw.created_at))"></span>
                      <span class="block text-slate-400 truncate" x-text="'Crawled: ' + (kw._relativeCrawledAt || formatRelativeTime(kw.last_crawled_at))"></span>
                    </div>
                    <div class="flex items-center space-x-1.5 shrink-0">
                      <button @click.stop="switchToSerpStudio(kw)"
                              class="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition flex items-center space-x-1 text-xs">
                        <span>Studio</span>
                        <i data-lucide="arrow-right" class="w-3 h-3"></i>
                      </button>
                      <button @click.stop="deleteKeyword(kw.id)"
                              class="p-1 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-slate-800 transition">
                        <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                      </button>
                    </div>
                  </div>

                </div>
              </template>
            </div>

            <!-- DASHBOARD GRID PAGINATION FOOTER -->
            <template x-if="filteredDashboardKeywords && filteredDashboardKeywords.length > 0">
              <div class="px-4 py-3 rounded-2xl border border-slate-200/80 dark:border-[#27272A]/80 bg-white dark:bg-[#121215] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs shadow-xs">
                
                <!-- Left: Items range & Page Size selector -->
                <div class="flex flex-wrap items-center gap-3 text-slate-500 font-mono tabular-nums text-[11px]">
                  <div>
                    <span>Showing </span>
                    <span class="font-bold text-slate-900 dark:text-white" x-text="dashboardRangeStart"></span>
                    <span> - </span>
                    <span class="font-bold text-slate-900 dark:text-white" x-text="dashboardRangeEnd"></span>
                    <span> of </span>
                    <span class="font-bold text-slate-900 dark:text-white" x-text="filteredDashboardKeywords.length"></span>
                    <span> Queries</span>
                  </div>

                  <!-- Per Page Selector -->
                  <div class="flex items-center space-x-1.5">
                    <span class="text-slate-400 font-sans">Rows:</span>
                    <select x-model="dashboardPageSize" class="px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-[11px] font-mono tabular-nums font-medium text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer">
                      <option :value="10">10 / page</option>
                      <option :value="25">25 / page</option>
                      <option :value="50">50 / page</option>
                      <option value="all">All</option>
                    </select>
                  </div>
                </div>

                <!-- Right: Pagination Buttons -->
                <template x-if="dashboardPageSize !== 'all' && dashboardTotalPages > 1">
                  <div class="flex items-center space-x-1">
                    <!-- First Page -->
                    <button type="button" @click="setDashboardPage(1)" :disabled="dashboardPage <= 1"
                            class="p-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer text-slate-600 dark:text-slate-400"
                            title="First Page">
                      <i data-lucide="chevrons-left" class="w-3.5 h-3.5"></i>
                    </button>

                    <!-- Previous Page -->
                    <button type="button" @click="setDashboardPage(dashboardPage - 1)" :disabled="dashboardPage <= 1"
                            class="p-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer text-slate-600 dark:text-slate-400"
                            title="Previous Page">
                      <i data-lucide="chevron-left" class="w-3.5 h-3.5"></i>
                    </button>

                    <!-- Numbered Page Pills -->
                    <div class="flex items-center space-x-1 px-1">
                      <template x-for="(p, pIdx) in dashboardPageNumbers" :key="'gp-' + pIdx + '-' + p">
                        <div>
                          <span x-show="p === '...'" class="px-1.5 py-0.5 text-slate-400 font-mono tabular-nums text-xs">...</span>
                          <button x-show="p !== '...'" type="button" @click="setDashboardPage(p)"
                                  class="min-w-7 h-7 px-1.5 rounded-md text-xs font-mono tabular-nums font-medium transition cursor-pointer"
                                  :class="dashboardPage === p ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-2xs' : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'"
                                  x-text="p"></button>
                        </div>
                      </template>
                    </div>

                    <!-- Next Page -->
                    <button type="button" @click="setDashboardPage(dashboardPage + 1)" :disabled="dashboardPage >= dashboardTotalPages"
                            class="p-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer text-slate-600 dark:text-slate-400"
                            title="Next Page">
                      <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>
                    </button>

                    <!-- Last Page -->
                    <button type="button" @click="setDashboardPage(dashboardTotalPages)" :disabled="dashboardPage >= dashboardTotalPages"
                            class="p-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer text-slate-600 dark:text-slate-400"
                            title="Last Page">
                      <i data-lucide="chevrons-right" class="w-3.5 h-3.5"></i>
                    </button>
                  </div>
                </template>
              </div>
            </template>
          </div>
        </template>
      </section>

      <!-- Quick Track Keyword Modal -->
      <div x-show="isQuickTrackModalOpen" x-cloak class="relative z-50">
        <div class="fixed inset-0 bg-slate-950/70 backdrop-blur-xs" @click="isQuickTrackModalOpen = false"></div>
        <div class="fixed inset-0 flex items-center justify-center p-4">
          <div class="w-full max-w-md bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-3xl p-6 shadow-2xl space-y-4">
            <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-[#27272A]">
              <div class="flex items-center space-x-2.5">
                <div class="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                  <i data-lucide="plus-circle" class="w-4 h-4"></i>
                </div>
                <h3 class="text-sm font-black text-slate-900 dark:text-white">Track New Keyword</h3>
              </div>
              <button @click="isQuickTrackModalOpen = false" class="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400">
                <i data-lucide="x" class="w-4 h-4"></i>
              </button>
            </div>
            <div class="space-y-3">
              <div>
                <label class="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase font-mono tabular-nums block mb-1">Search Query / Keyword</label>
                <input type="text" x-model="quickKeywordInput" @keydown.enter="submitQuickKeyword()"
                       placeholder="e.g. breakfast ideas, avocado toast..."
                       class="w-full px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40">
              </div>
              <div>
                <label class="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase font-mono tabular-nums block mb-1">Category (Optional)</label>
                <input type="text" x-model="quickKeywordCategory"
                       placeholder="e.g. Food & Recipes, General..."
                       class="w-full px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40">
              </div>
            </div>
            <div class="flex items-center justify-end space-x-2 pt-2">
              <button @click="isQuickTrackModalOpen = false" class="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                Cancel
              </button>
              <button @click="submitQuickKeyword()" class="px-5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center space-x-1.5 shadow-md shadow-emerald-950/20 cursor-pointer">
                <i data-lucide="sparkles" class="w-3.5 h-3.5"></i>
                <span x-text="'Track & Index ' + (appSettings.default_max_pins || 250) + ' Pins'">Track & Index 250 Pins</span>
              </button>
            </div>
          </div>
        </div>
      </div>

    </div>

    <!-- ========================================================================= -->
    <!-- LEVEL 2: SERP RADAR STUDIO (viewModeLevel === 'serp_studio')             -->
    <!-- ========================================================================= -->
    <div x-show="viewModeLevel === 'serp_studio'" x-cloak class="space-y-6">

      <!-- Studio Return Button -->
      <div class="flex items-center justify-between">
        <button @click="switchToDashboard()"
                class="px-4 py-2 rounded-2xl text-xs font-bold bg-white dark:bg-[#121215] hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-[#27272A] text-slate-700 dark:text-slate-300 transition flex items-center space-x-2 shadow-xs cursor-pointer">
          <i data-lucide="arrow-left" class="w-4 h-4 text-emerald-500"></i>
          <span>← Back to Keywords Dashboard</span>
        </button>
        <span class="text-xs font-mono tabular-nums text-slate-400">Level 2: SERP Radar Studio</span>
      </div>

    <!-- EXECUTIVE CONTROL BAR: KEYWORD OMNIBAR & DIRECT ACTIONS -->
    <section class="p-4 sm:p-6 rounded-3xl bg-white dark:bg-[#121215] border border-slate-200/80 dark:border-[#27272A] shadow-xs space-y-4">
      <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        
        <!-- Left: Active Keyword Title, Volume & Deep Metadata -->
        <div class="flex items-start sm:items-center space-x-3.5 min-w-0">
          <div class="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shadow-lg shadow-emerald-600/20 shrink-0">
            <i data-lucide="search" class="w-6 h-6"></i>
          </div>
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="text-xl sm:text-2xl font-black text-slate-900 dark:text-white capitalize truncate"
                  x-text="selectedKeyword?.keyword || activeKeywordQuery || 'Enter Keyword'"></h2>
              
              <!-- Official Pinterest Monthly Search Volume Badge (PinClicks & Pinterest Parity) -->
              <div class="flex items-center space-x-1.5 px-3 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30 text-xs font-mono tabular-nums font-black"
                   :title="trendsData?.exact_volume ? 'Official Pinterest Annotation Search Count (Live)' : 'Estimated Pinterest Monthly Search Volume'">
                <i data-lucide="bar-chart-2" class="w-3.5 h-3.5"></i>
                <span>Volume:</span>
                <span x-text="formatNumber(trendsData?.exact_volume || trendsData?.estimated_volume || 380878)"></span>
              </div>

              <!-- Official Pinterest Category Tree Tag -->
              <template x-if="trendsData?.category_tree && trendsData.category_tree.length > 0">
                <span class="px-2.5 py-0.5 rounded-full text-[10px] font-mono tabular-nums font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 truncate max-w-[240px]"
                      :title="'Taxonomy: ' + trendsData.category_tree.join(' > ')"
                      x-text="trendsData.category_tree.join(' > ')"></span>
              </template>
              <template x-if="!trendsData?.category_tree || trendsData.category_tree.length === 0">
                <span class="px-2.5 py-0.5 rounded-full text-[10px] font-mono tabular-nums font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                      x-text="selectedKeyword?.category || 'Organic Search'"></span>
              </template>

              <!-- Annotation ID Badge -->
              <template x-if="trendsData?.annotation_id">
                <span class="px-2.5 py-0.5 rounded-full text-[10px] font-mono tabular-nums font-semibold bg-slate-100 dark:bg-slate-800/80 text-slate-500"
                      :title="'Official Pinterest Annotation ID: ' + trendsData.annotation_id"
                      x-text="'ID: ' + trendsData.annotation_id"></span>
              </template>

              <span class="px-2.5 py-0.5 rounded-full text-[10px] font-mono tabular-nums font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                    x-text="(selectedKeyword?.target_pin_count || 250) + ' Pins Target (' + (selectedKeyword?.crawl_pages_limit || 10) + ' Pages)'">
                250 Pins Target
              </span>
              <template x-if="selectedKeyword?.last_crawled_at">
                <span class="text-[11px] text-slate-400 font-mono tabular-nums flex items-center space-x-1">
                  <i data-lucide="clock" class="w-3 h-3"></i>
                  <span x-text="'Crawled ' + formatDate(selectedKeyword.last_crawled_at)"></span>
                </span>
              </template>
            </div>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
              Live SERP Radar • Direct deep-link URL: <code class="text-emerald-500 font-mono tabular-nums text-[11px]" x-text="'/keywords/' + encodeURIComponent(activeSlug)"></code>
            </p>
          </div>
        </div>

        <!-- Right: Primary Actions Toolbar -->
        <div class="flex flex-wrap items-center gap-2 shrink-0">
          <button @click="rescanActiveKeyword(true)"
                  :disabled="isDetailsLoading || syncingKeywordId === selectedKeyword?.id"
                  class="px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white transition flex items-center space-x-2 shadow-md shadow-emerald-950/20 active:scale-95 disabled:opacity-50 cursor-pointer">
            <i data-lucide="refresh-cw" class="w-3.5 h-3.5" :class="(isDetailsLoading || syncingKeywordId === selectedKeyword?.id) ? 'animate-spin' : ''"></i>
            <span x-text="'Re-Crawl ' + (selectedKeyword?.target_pin_count || 250) + ' Pins'"></span>
          </button>

          <!-- Settings Button for this specific keyword -->
          <button @click="openSettingsModal(selectedKeyword)"
                  class="px-3.5 py-2.5 rounded-2xl text-xs font-bold bg-violet-500/10 hover:bg-violet-500/20 dark:bg-violet-950/30 dark:hover:bg-violet-900/40 border border-violet-500/30 text-violet-600 dark:text-violet-400 transition flex items-center space-x-1.5 cursor-pointer"
                  title="Configure Crawl Depth & Inspection Mode for this Keyword">
            <i data-lucide="sliders" class="w-3.5 h-3.5 text-violet-500"></i>
            <span class="hidden sm:inline">Settings</span>
          </button>

          <!-- Add to Folder Dropdown Button -->
          <div class="relative" x-data="{ folderDropdownOpen: false }" @click.outside="folderDropdownOpen = false">
            <button @click="folderDropdownOpen = !folderDropdownOpen; if(folderDropdownOpen && selectedKeyword) fetchCurrentKeywordFolders()"
                    class="px-3.5 py-2.5 rounded-2xl text-xs font-bold bg-pink-500/10 hover:bg-pink-500/20 dark:bg-pink-950/30 dark:hover:bg-pink-900/40 border border-pink-500/30 text-pink-600 dark:text-pink-400 transition flex items-center space-x-1.5 cursor-pointer">
              <i data-lucide="folder-plus" class="w-3.5 h-3.5 text-pink-500"></i>
              <span class="hidden sm:inline">Folder</span>
              <span class="px-1.5 py-0.2 rounded-full text-[10px] bg-pink-500/20 text-pink-500 dark:text-pink-300 font-mono tabular-nums" x-text="currentKeywordFolders.length"></span>
            </button>
            <div x-show="folderDropdownOpen" x-cloak
                 class="absolute right-0 mt-2 w-64 bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl shadow-2xl z-50 p-2 space-y-1">
              <div class="p-2 border-b border-slate-100 dark:border-[#27272A]/80 flex items-center justify-between">
                <span class="text-[11px] font-bold text-slate-700 dark:text-slate-300">Campaign Folders</span>
                <button @click="folderDropdownOpen = false; openCreateFolderModal()" class="text-[10px] text-pink-500 font-bold hover:underline">+ New Folder</button>
              </div>
              <div class="max-h-52 overflow-y-auto space-y-1">
                <template x-for="f in folders" :key="f.id">
                  <div @click="toggleCurrentKeywordFolder(f.id)"
                       class="px-2.5 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/80 transition flex items-center justify-between cursor-pointer text-xs">
                    <div class="flex items-center space-x-2 min-w-0">
                      <span class="w-2.5 h-2.5 rounded-full shrink-0" :style="'background-color: ' + (f.color || '#ec4899')"></span>
                      <span class="truncate font-semibold text-slate-800 dark:text-slate-200" x-text="f.name"></span>
                    </div>
                    <i :data-lucide="isKeywordInFolder(f.id) ? 'check-circle-2' : 'plus-circle'"
                       class="w-3.5 h-3.5" :class="isKeywordInFolder(f.id) ? 'text-pink-500' : 'text-slate-400'"></i>
                  </div>
                </template>
                <template x-if="folders.length === 0">
                  <div class="p-3 text-center text-xs text-slate-400">No folders yet. Click + New Folder to create one!</div>
                </template>
              </div>
            </div>
          </div>

          <button @click="openFleetDispatchModal()" :disabled="isWorkflowDispatching"
                  class="px-3.5 py-2.5 rounded-2xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-[#27272A] text-slate-700 dark:text-slate-300 transition flex items-center space-x-1.5 disabled:opacity-50 cursor-pointer"
                  title="Run Autonomous 24h Crawler Fleet via GitHub Actions">
            <i data-lucide="play" class="w-3.5 h-3.5 text-emerald-500" :class="isWorkflowDispatching ? 'animate-spin' : ''"></i>
            <span class="hidden sm:inline">Trigger Fleet</span>
          </button>

          <button @click="copySEOFormula()"
                  class="p-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-[#27272A] text-slate-600 dark:text-slate-300 transition"
                  title="Copy SEO Title Formula">
            <i data-lucide="copy" class="w-4 h-4"></i>
          </button>

          <a :href="'https://www.pinterest.com/search/pins/?q=' + encodeURIComponent(selectedKeyword?.keyword || activeKeywordQuery || '')" target="_blank"
             class="p-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-[#27272A] text-slate-600 dark:text-slate-300 transition"
             title="Open on Pinterest">
            <i data-lucide="external-link" class="w-4 h-4"></i>
          </a>
        </div>

      </div>

      <!-- Center Omnibar: Instant Switcher & Predictive Autocomplete (v3_typeahead) -->
      <div class="relative pt-2 border-t border-slate-100 dark:border-[#27272A]/80">
        <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div class="relative flex-1">
            <i data-lucide="search" class="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2"></i>
            <input type="text" x-model="omnibarQuery"
                   @input.debounce.300ms="onOmnibarInput()"
                   @keydown.enter="submitOmnibarKeyword()"
                   @focus="isOmnibarDropdownOpen = true"
                   placeholder="Switch to tracked keyword or search new query (e.g. tater tot casserole, rustic farmhouse, fall fashion)..."
                   class="w-full pl-11 pr-10 py-3 rounded-2xl bg-slate-100/80 dark:bg-slate-900/90 border border-slate-200 dark:border-[#27272A] text-sm font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 shadow-xs transition">
            <div x-show="isTypeaheadLoading" class="absolute right-4 top-1/2 -translate-y-1/2">
              <i data-lucide="loader-2" class="w-4 h-4 text-emerald-500 animate-spin"></i>
            </div>
          </div>

          <button @click="submitOmnibarKeyword()" :disabled="!omnibarQuery.trim()"
                  class="px-5 py-3 rounded-2xl text-xs font-bold uppercase tracking-wider bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white transition flex items-center justify-center space-x-2 shrink-0 disabled:opacity-50">
            <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i>
            <span>Load / Track</span>
          </button>
        </div>

        <!-- Dropdown Menu -->
        <div x-show="isOmnibarDropdownOpen && (omnibarTrackedMatches.length > 0 || typeaheadSuggestions.length > 0)" x-cloak
             @click.away="isOmnibarDropdownOpen = false"
             class="absolute left-0 right-0 top-full mt-2 z-50 bg-white dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A] rounded-3xl shadow-2xl overflow-hidden p-3 space-y-2 max-h-96 overflow-y-auto">
          
          <template x-if="omnibarTrackedMatches.length > 0">
            <div class="space-y-1">
              <div class="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono tabular-nums flex items-center justify-between">
                <span>Already Tracked in Engine</span>
                <span class="text-emerald-500">1-Click Jump</span>
              </div>
              <template x-for="kw in omnibarTrackedMatches" :key="kw.id">
                <div @click="selectKeyword(kw); isOmnibarDropdownOpen = false; omnibarQuery = '';"
                     class="px-3 py-2 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-emerald-500/10 hover:text-emerald-600 dark:hover:text-emerald-400 cursor-pointer flex items-center justify-between transition">
                  <div class="flex items-center space-x-2.5">
                    <i data-lucide="check-circle" class="w-3.5 h-3.5 text-emerald-500"></i>
                    <span class="capitalize" x-text="kw.keyword"></span>
                  </div>
                  <span class="text-[10px] text-slate-400 font-mono tabular-nums" x-text="getKeywordTotalPins(kw) + ' Pins'"></span>
                </div>
              </template>
            </div>
          </template>

          <template x-if="typeaheadSuggestions.length > 0">
            <div class="space-y-1 pt-1 border-t border-slate-100 dark:border-[#27272A]/80">
              <div class="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono tabular-nums flex items-center justify-between">
                <span>Pinterest Trending Autocomplete (v3_typeahead)</span>
                <span class="text-purple-500">+ Track & Crawl</span>
              </div>
              <template x-for="sug in typeaheadSuggestions" :key="sug">
                <div @click="trackNewKeyword(sug); isOmnibarDropdownOpen = false; omnibarQuery = '';"
                     class="px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-purple-500/10 hover:text-purple-600 dark:hover:text-purple-400 cursor-pointer flex items-center justify-between transition">
                  <div class="flex items-center space-x-2.5">
                    <i data-lucide="trending-up" class="w-3.5 h-3.5 text-purple-500"></i>
                    <span class="capitalize" x-text="sug"></span>
                  </div>
                  <span class="text-[10px] text-purple-500 font-mono tabular-nums" x-text="'+ Index ' + (appSettings.default_max_pins || 250) + ' Pins'"></span>
                </div>
              </template>
            </div>
          </template>
        </div>
      </div>

      <!-- GUIDED CAPSULES RIBBON (Zone 1 - Official Pinterest Semantic Intent) -->
      <template x-if="selectedKeywordDetails?.guides && selectedKeywordDetails.guides.length > 0">
        <div class="pt-3 border-t border-slate-100 dark:border-[#27272A]/80 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div class="flex items-center space-x-2 text-xs font-bold text-slate-500 dark:text-slate-400 shrink-0">
            <i data-lucide="compass" class="w-4 h-4 text-cyan-500"></i>
            <span>Guided Keywords:</span>
          </div>
          <div class="flex-1 flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
            <template x-for="(g, i) in selectedKeywordDetails.guides" :key="g.id || g.term">
              <button @click="researchKeywordTag(selectedKeyword.keyword + ' ' + (g.display_label || g.term))"
                      class="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-cyan-500/10 hover:text-cyan-500 dark:hover:text-cyan-400 border border-slate-200 dark:border-[#27272A]/80 transition flex items-center space-x-1.5 shrink-0 cursor-pointer group"
                      :title="'Score: ' + Number(g.score || 0).toFixed(1)">
                <span class="w-2 h-2 rounded-full shrink-0" :style="'background-color: ' + (g.dominant_color || '#06b6d4')"></span>
                <span class="capitalize" x-text="g.display_label || g.term"></span>
              </button>
            </template>
          </div>
          <button @click="copySEOFormula()"
                  class="px-3 py-1 rounded-xl text-xs font-bold bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30 transition flex items-center space-x-1.5 shrink-0 cursor-pointer">
            <i data-lucide="copy" class="w-3.5 h-3.5"></i>
            <span>Copy Complete SEO Formula</span>
          </button>
        </div>
      </template>
    </section>

    <!-- ZONE 2: EXECUTIVE 4-CARD KPI ANALYTICS RIBBON -->
    <section class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      
      <!-- KPI 1: Organic SERP Volatility -->
      <div class="p-5 rounded-3xl bg-white dark:bg-[#121215] border border-slate-200/80 dark:border-[#27272A] space-y-3 shadow-xs">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-slate-500 dark:text-slate-400">SERP Movement</span>
          <span class="p-1.5 rounded-xl bg-emerald-500/10 text-emerald-500">
            <i data-lucide="activity" class="w-4 h-4"></i>
          </span>
        </div>
        <div class="flex items-center space-x-2">
          <span class="text-xl font-black text-slate-900 dark:text-white font-mono tabular-nums" x-text="selectedKeywordDetails?.current_pins?.length || 0"></span>
          <span class="text-xs text-slate-400 font-mono tabular-nums" x-text="'/ ' + (selectedKeyword?.target_pin_count || 250) + ' Organic Pins'"></span>
        </div>
        <div class="grid grid-cols-4 gap-1 pt-1 border-t border-slate-100 dark:border-[#27272A]/80 text-center">
          <div class="p-1 rounded-lg bg-emerald-500/10 text-[10px] font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400" title="Climbed">
            ▲ <span x-text="selectedKeywordDetails?.stats?.climbed || 0"></span>
          </div>
          <div class="p-1 rounded-lg bg-rose-500/10 text-[10px] font-mono tabular-nums font-bold text-rose-600 dark:text-rose-400" title="Dropped">
            ▼ <span x-text="selectedKeywordDetails?.stats?.dropped || 0"></span>
          </div>
          <div class="p-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-[10px] font-mono tabular-nums font-bold text-slate-600 dark:text-slate-400" title="Stable">
            = <span x-text="selectedKeywordDetails?.stats?.stable || 0"></span>
          </div>
          <div class="p-1 rounded-lg bg-amber-500/10 text-[10px] font-mono tabular-nums font-bold text-amber-600 dark:text-amber-400" title="New Entries">
            ★ <span x-text="selectedKeywordDetails?.stats?.new_entries || 0"></span>
          </div>
        </div>
      </div>

      <!-- KPI 2: 24h Daily Save Velocity Pulse -->
      <div class="p-5 rounded-3xl bg-white dark:bg-[#121215] border border-slate-200/80 dark:border-[#27272A] space-y-3 shadow-xs">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-slate-500 dark:text-slate-400">Save Velocity Pulse</span>
          <span class="p-1.5 rounded-xl bg-cyan-500/10 text-cyan-500">
            <i data-lucide="zap" class="w-4 h-4"></i>
          </span>
        </div>
        <div class="flex items-center space-x-2">
          <span class="text-xl font-black text-emerald-600 dark:text-emerald-400 font-mono tabular-nums"
                x-text="'+' + (selectedKeywordDetails?.avg_velocity ?? selectedKeyword?.avg_daily_velocity ?? 0) + ' /day'"></span>
        </div>
        <div class="flex items-center justify-between text-[11px] pt-1 border-t border-slate-100 dark:border-[#27272A]/80">
          <span class="text-slate-400 font-mono tabular-nums">Explosive Pins:</span>
          <span class="font-bold text-cyan-600 dark:text-cyan-400 font-mono tabular-nums" x-text="(selectedKeywordDetails?.velocity_chart?.explosive || 0) + ' Pins (≥50/d)'"></span>
        </div>
      </div>

      <!-- KPI 3: PinClicks Arbitrage Verdict -->
      <div class="p-5 rounded-3xl bg-white dark:bg-[#121215] border border-slate-200/80 dark:border-[#27272A] space-y-3 shadow-xs">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-slate-500 dark:text-slate-400">Arbitrage Verdict</span>
          <span class="p-1.5 rounded-xl bg-purple-500/10 text-purple-500">
            <i data-lucide="sparkles" class="w-4 h-4"></i>
          </span>
        </div>
        <div class="flex items-center space-x-2">
          <template x-if="selectedKeywordDetails?.intelligence?.opportunity">
            <span class="px-2.5 py-1 rounded-xl text-xs font-black font-mono tabular-nums"
                  :class="selectedKeywordDetails.intelligence.opportunity.verdict === 'WIDE_OPEN' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : (selectedKeywordDetails.intelligence.opportunity.verdict === 'COMPETITIVE' ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400' : 'bg-rose-500/20 text-rose-600 dark:text-rose-400')"
                  x-text="selectedKeywordDetails.intelligence.opportunity.verdict === 'WIDE_OPEN' ? '🟢 WIDE OPEN' : (selectedKeywordDetails.intelligence.opportunity.verdict === 'COMPETITIVE' ? '🟡 MODERATE' : '🔴 SATURATED')"></span>
          </template>
          <template x-if="!selectedKeywordDetails?.intelligence?.opportunity">
            <span class="text-sm font-bold text-slate-400">Calculating...</span>
          </template>
        </div>
        <div class="flex items-center justify-between text-[11px] pt-1 border-t border-slate-100 dark:border-[#27272A]/80">
          <span class="text-slate-400 font-mono tabular-nums">Opportunity Score:</span>
          <span class="font-bold text-purple-600 dark:text-purple-400 font-mono tabular-nums" x-text="(selectedKeywordDetails?.intelligence?.opportunity?.opportunity_score ?? 85) + ' / 100'"></span>
        </div>
      </div>

      <!-- KPI 4: Semantic Guided Capsules -->
      <div class="p-5 rounded-3xl bg-white dark:bg-[#121215] border border-slate-200/80 dark:border-[#27272A] space-y-3 shadow-xs">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-slate-500 dark:text-slate-400">Semantic Modifiers</span>
          <span class="p-1.5 rounded-xl bg-amber-500/10 text-amber-500">
            <i data-lucide="compass" class="w-4 h-4"></i>
          </span>
        </div>
        <div class="flex items-center space-x-2">
          <span class="text-xl font-black text-slate-900 dark:text-white font-mono tabular-nums" x-text="selectedKeywordDetails?.guides?.length || 0"></span>
          <span class="text-xs text-slate-400 font-mono tabular-nums">Capsules</span>
        </div>
        <div class="flex items-center justify-between text-[11px] pt-1 border-t border-slate-100 dark:border-[#27272A]/80 truncate">
          <span class="text-slate-400 font-mono tabular-nums">Top:</span>
          <span class="font-bold text-amber-600 dark:text-amber-400 font-mono tabular-nums truncate max-w-[150px]"
                x-text="selectedKeywordDetails?.guides?.[0]?.display_label || 'None'"></span>
        </div>
      </div>

    </section>

    <!-- ZONE 3: FULL-WIDTH TABBED WORKSPACE -->
    <section class="rounded-3xl bg-white dark:bg-[#121215] border border-slate-200/80 dark:border-[#27272A] shadow-xs overflow-hidden">
      
      <!-- TOP NAVIGATION BAR: Tabs (Left) + View Mode & Growth Pace (Right) -->
      <div class="px-4 sm:px-6 py-3.5 border-b border-slate-200/80 dark:border-[#27272A]/80 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white dark:bg-[#121215]">
        
        <!-- Workspace Tabs -->
        <div class="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <button @click="activeTab = 'serp'"
                  class="px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 cursor-pointer"
                  :class="activeTab === 'serp' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'">
            <i data-lucide="list-ordered" class="w-4 h-4"></i>
            <span>SERP Rankings Matrix</span>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-mono tabular-nums font-bold bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                  x-text="'#' + (filteredPins.length || 0)"></span>
          </button>

          <!-- Pinterest Trends 52-Week & Popular Pins Tab -->
          <button @click="activeTab = 'trends'"
                  class="px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 cursor-pointer"
                  :class="activeTab === 'trends' ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30 shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'">
            <i data-lucide="trending-up" class="w-4 h-4 text-blue-500"></i>
            <span>Pinterest Trends (52w & Popular)</span>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-mono tabular-nums font-bold bg-blue-500/20 text-blue-600"
                  x-text="trendsData?.current_index ? trendsData.current_index + '/100' : '52w'"></span>
          </button>

          <!-- PinClicks Intelligence Tab -->
          <button @click="activeTab = 'intelligence'"
                  class="px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 cursor-pointer"
                  :class="activeTab === 'intelligence' ? 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30 shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'">
            <i data-lucide="sparkles" class="w-4 h-4 text-purple-500"></i>
            <span>PinClicks Intelligence</span>
          </button>
        </div>

        <!-- Right Side: Growth Pace (Compact Pills) + Table/Cards Switcher -->
        <div class="flex items-center gap-2 self-start md:self-auto shrink-0" x-show="activeTab === 'serp'">
          
          <!-- Compact Growth Pace Selector -->
          <div class="flex items-center p-1 rounded-xl bg-slate-100/90 dark:bg-slate-900/90 border border-slate-200 dark:border-[#27272A] gap-0.5">
            <span class="text-[10px] font-mono tabular-nums font-bold text-slate-400 uppercase px-1.5 hidden sm:inline">Pace:</span>
            <button @click="growthPaceFilter = '24h'"
                    class="px-2 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center space-x-1"
                    :class="growthPaceFilter === '24h' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40 shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'"
                    title="Velocity over Last 24 Hours">
              <span>🔥</span>
              <span class="font-mono tabular-nums">24h</span>
            </button>
            <button @click="growthPaceFilter = '3d'"
                    class="px-2 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center space-x-1"
                    :class="growthPaceFilter === '3d' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40 shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'"
                    title="Velocity over Last 3 Days">
              <span>⏱</span>
              <span class="font-mono tabular-nums">3d</span>
            </button>
            <button @click="growthPaceFilter = '7d'"
                    class="px-2 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center space-x-1"
                    :class="growthPaceFilter === '7d' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40 shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'"
                    title="Velocity over Last 7 Days">
              <span>📅</span>
              <span class="font-mono tabular-nums">7d</span>
            </button>
            <button @click="growthPaceFilter = 'all'"
                    class="px-2 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center space-x-1"
                    :class="growthPaceFilter === 'all' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40 shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'"
                    title="All-Time Total Engagement">
              <span>⭐</span>
              <span class="font-mono tabular-nums">All</span>
            </button>
          </div>

          <!-- Cards vs Table Toggle Button -->
          <div class="flex items-center p-1 rounded-xl bg-slate-100/90 dark:bg-slate-900/90 border border-slate-200 dark:border-[#27272A]">
            <button @click="viewMode = 'table'"
                    class="px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center space-x-1 cursor-pointer"
                    :class="viewMode === 'table' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'"
                    title="Table View">
              <i data-lucide="table" class="w-3.5 h-3.5"></i>
              <span class="hidden sm:inline">Table</span>
            </button>
            <button @click="viewMode = 'cards'"
                    class="px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center space-x-1 cursor-pointer"
                    :class="viewMode === 'cards' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'"
                    title="Cards Grid View">
              <i data-lucide="layout-grid" class="w-3.5 h-3.5"></i>
              <span class="hidden sm:inline">Cards</span>
            </button>
          </div>

        </div>
      </div>

      <!-- SECONDARY CONTROL BAR: SERP Filter & Search Controls (Exclusively for SERP Tab) -->
      <div x-show="activeTab === 'serp'" class="px-4 sm:px-6 py-3 border-b border-slate-200/80 dark:border-[#27272A]/80 bg-slate-50/70 dark:bg-slate-900/40 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        
        <!-- Left: Scope Segment Filter: All Pins vs Active SERP vs Displaced Vault vs Breakouts vs High Velocity -->
        <div class="flex flex-wrap items-center gap-1.5">
          <span class="text-[10px] font-bold text-slate-400 font-mono tabular-nums uppercase tracking-wider shrink-0 mr-1 hidden sm:inline">Filter:</span>
          
          <button @click="serpScope = 'all'"
                  class="px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center space-x-1.5 border"
                  :class="serpScope === 'all' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/40 shadow-xs' : 'bg-white dark:bg-slate-900/80 border-slate-200 dark:border-[#27272A] text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700'"
                  :title="'Showing ' + allCombinedPins.length + ' of ' + totalCatalogCount + ' total catalog pins'">
            <span>🔘 All Pins</span>
            <span class="px-1.5 py-0.2 rounded-full text-[10px] font-mono tabular-nums font-bold"
                  :class="serpScope === 'all' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'"
                  x-text="totalCatalogCount > allCombinedPins.length ? (allCombinedPins.length + ' / ' + totalCatalogCount) : totalCatalogCount"></span>
          </button>
          
          <button @click="serpScope = 'active'"
                  class="px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center space-x-1.5 border"
                  :class="serpScope === 'active' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/40 shadow-xs' : 'bg-white dark:bg-slate-900/80 border-slate-200 dark:border-[#27272A] text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700'">
            <span>🟢 Active SERP</span>
            <span class="px-1.5 py-0.2 rounded-full text-[10px] font-mono tabular-nums font-bold"
                  :class="serpScope === 'active' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'"
                  x-text="(selectedKeywordDetails?.current_pins || []).length"></span>
          </button>

          <button @click="serpScope = 'displaced'; if(selectedKeyword && displacedVaultPins.length === 0) fetchDisplacedPins()"
                  class="px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center space-x-1.5 border"
                  :class="serpScope === 'displaced' ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/40 shadow-xs' : 'bg-white dark:bg-slate-900/80 border-slate-200 dark:border-[#27272A] text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700'"
                  :title="'Showing ' + displacedVaultPins.length + ' of ' + totalDisplacedCount + ' displaced vault pins'">
            <span>🔴 Displaced Vault</span>
            <span class="px-1.5 py-0.2 rounded-full text-[10px] font-mono tabular-nums font-bold"
                  :class="serpScope === 'displaced' ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'"
                  x-text="totalDisplacedCount > displacedVaultPins.length ? (displacedVaultPins.length + ' / ' + totalDisplacedCount) : totalDisplacedCount"></span>
          </button>

          <button @click="serpScope = 'breakout'"
                  class="px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center space-x-1.5 border"
                  :class="serpScope === 'breakout' ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/40 shadow-xs' : 'bg-white dark:bg-slate-900/80 border-slate-200 dark:border-[#27272A] text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700'">
            <span>🚀 Breakouts</span>
            <span class="px-1.5 py-0.2 rounded-full text-[10px] font-mono tabular-nums font-bold"
                  :class="serpScope === 'breakout' ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'"
                  x-text="breakoutPins.length"></span>
          </button>

          <button @click="serpScope = 'velocity'"
                  class="px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center space-x-1.5 border"
                  :class="serpScope === 'velocity' ? 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border-cyan-500/40 shadow-xs' : 'bg-white dark:bg-slate-900/80 border-slate-200 dark:border-[#27272A] text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700'">
            <span>⚡ High Velocity</span>
          </button>

          <!-- Active Visual Tag Filter Badge -->
          <template x-if="activeVisualTagFilter">
            <div class="flex items-center space-x-1.5 px-3 py-1 rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30 text-xs">
              <i data-lucide="tag" class="w-3.5 h-3.5"></i>
              <span class="font-bold font-mono tabular-nums" x-text="'Tag: #' + activeVisualTagFilter"></span>
              <button @click="activeVisualTagFilter = ''" class="hover:text-purple-800 dark:hover:text-white transition ml-1 cursor-pointer" title="Clear visual tag filter">
                <i data-lucide="x" class="w-3 h-3"></i>
              </button>
            </div>
          </template>

          <!-- Active Domain Filter Badge -->
          <template x-if="activeDomainFilter">
            <div class="flex items-center space-x-1.5 px-3 py-1 rounded-xl bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30 text-xs">
              <i data-lucide="globe" class="w-3.5 h-3.5"></i>
              <span class="font-bold font-mono tabular-nums" x-text="'Domain: ' + activeDomainFilter"></span>
              <button @click="activeDomainFilter = ''" class="hover:text-cyan-800 dark:hover:text-white transition ml-1 cursor-pointer" title="Clear domain filter">
                <i data-lucide="x" class="w-3 h-3"></i>
              </button>
            </div>
          </template>
        </div>

        <!-- Right: Search, Formats, Sorting, Page Size -->
        <div class="flex flex-wrap items-center gap-2">
          
          <!-- Search in Pins -->
          <div class="relative">
            <i data-lucide="search" class="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"></i>
            <input type="text" x-model="pinSearch" placeholder="Filter title, author, domain..."
                   class="w-44 sm:w-52 pl-8 pr-7 py-1.5 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/40">
            <button x-show="pinSearch" @click="pinSearch = ''" class="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 cursor-pointer">
              <i data-lucide="x" class="w-3 h-3"></i>
            </button>
          </div>

          <!-- Format Filter -->
          <select x-model="formatFilter" class="px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer">
            <option value="ALL">All Formats</option>
            <option value="ORGANIC PIN">Organic Pin</option>
            <option value="VIDEO PIN">Video Pin</option>
            <option value="IDEA PIN">Idea Pin</option>
            <option value="PRODUCT CARD">Product Card</option>
          </select>

          <!-- Pin Sort -->
          <select x-model="pinSort" class="px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer">
            <option value="rank" x-text="'Sort: SERP Rank #1-' + (selectedKeyword?.target_pin_count || 250)">Sort: SERP Rank (Ascending)</option>
            <option value="velocity">Sort: 24h Velocity (Highest)</option>
            <option value="saves">Sort: Saves / Likes (Highest)</option>
            <option value="age">Sort: Newest First</option>
          </select>

          <!-- Per Page Select -->
          <select x-model="pinPageSize" class="px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-xs font-mono tabular-nums font-bold text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer">
            <option :value="25">25 / page</option>
            <option :value="50">50 / page</option>
            <option :value="100">100 / page</option>
            <option value="all">All Pins</option>
          </select>

        </div>

      </div>

      <!-- TAB 1: EXECUTIVE FULL-WIDTH SERP MATRIX -->
      <div x-show="activeTab === 'serp'" class="space-y-0">
        
        <template x-if="isDetailsLoading">
          <div class="py-20 text-center space-y-3">
            <div class="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-500 mx-auto flex items-center justify-center">
              <i data-lucide="loader-2" class="w-6 h-6 animate-spin"></i>
            </div>
            <p class="text-sm font-bold text-slate-700 dark:text-slate-300">Loading Full SERP Report...</p>
            <p class="text-xs text-slate-400 font-mono tabular-nums">Comparing rank positions & calculating 24h save velocity baselines</p>
          </div>
        </template>

        <template x-if="!isDetailsLoading && (!filteredPins || filteredPins.length === 0)">
          <div class="py-20 text-center space-y-4 max-w-md mx-auto p-4">
            <div class="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 mx-auto flex items-center justify-center">
              <i data-lucide="sparkles" class="w-6 h-6"></i>
            </div>
            <h3 class="text-base font-bold text-slate-900 dark:text-white capitalize" x-text="'No Snapshots for &quot;' + (selectedKeyword?.keyword || activeKeywordQuery) + '&quot;'"></h3>
            <p class="text-xs text-slate-500">This keyword has not been crawled yet. Trigger an on-demand crawl to index organic SERP pins directly from Pinterest.</p>
            <button @click="rescanActiveKeyword(true)"
                    class="px-5 py-2.5 rounded-2xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition shadow-md shadow-emerald-950/20 active:scale-95 flex items-center justify-center space-x-2 mx-auto cursor-pointer">
              <i data-lucide="refresh-cw" class="w-4 h-4"></i>
              <span x-text="'Crawl ' + (selectedKeyword?.target_pin_count || 250) + ' Pins Now'">Crawl Pins Now</span>
            </button>
          </div>
        </template>

        <!-- VIEW MODE 1: TABLE VIEW (Matching Image 1 Exact Layout) -->
        <template x-if="!isDetailsLoading && filteredPins && filteredPins.length > 0 && viewMode === 'table'">
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="table-sticky-header bg-slate-100/90 dark:bg-[#121215]/90 border-b border-slate-200 dark:border-[#27272A] text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  <th class="py-3.5 px-3 w-10 text-center">
                    <input type="checkbox" @click="toggleSelectAllPins()"
                           :checked="paginatedPins.length > 0 && paginatedPins.every(p => isPinSelected(p.pin_id))"
                           class="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 dark:border-[#27272A]">
                  </th>
                  <th class="py-3.5 px-3 w-14">Preview</th>
                  <th class="py-3.5 px-4 min-w-[260px]">Pin Title & ID</th>
                  <th class="py-3.5 px-3 w-28"># Rank & Delta</th>
                  <th class="py-3.5 px-3 w-36">Board</th>
                  <th class="py-3.5 px-3 w-32">Saves & Δ</th>
                  <th class="py-3.5 px-3 w-28">Repins & Δ</th>
                  <th class="py-3.5 px-2 w-20">Comments</th>
                  <th class="py-3.5 px-2 w-20">Shares</th>
                  <th class="py-3.5 px-3 w-28">Velocity</th>
                  <th class="py-3.5 px-3 w-36">Domain Authority</th>
                  <th class="py-3.5 px-3 w-28 text-right">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
                <template x-for="(pin, idx) in paginatedPins" :key="pin.pin_id">
                  <tr :data-pin-id="pin.pin_id"
                      class="hover:bg-slate-50/80 dark:hover:bg-slate-900/40 transition group cursor-pointer"
                      @click="openPinInspector(pin)">
                    
                    <!-- Checkbox -->
                    <td class="py-3.5 px-3 text-center" @click.stop>
                      <input type="checkbox" :checked="isPinSelected(pin.pin_id)" @click="togglePinSelection(pin.pin_id)"
                             class="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 dark:border-[#27272A]">
                    </td>

                    <!-- Preview Thumbnail -->
                    <td class="py-3.5 px-3">
                      <a :href="getPinDossierUrl(pin)" @click.stop class="relative group/img shrink-0 block" title="Open Dedicated Pin Intelligence (/pins/:pin_id)">
                        <template x-if="pin.image_url">
                          <img :src="pin.image_url" class="w-10 h-14 rounded-lg object-cover border border-slate-200 dark:border-[#27272A] shadow-xs group-hover/img:scale-105 transition">
                        </template>
                        <template x-if="!pin.image_url">
                          <div class="w-10 h-14 rounded-lg bg-slate-200 dark:bg-slate-800 flex items-center justify-center">
                            <i data-lucide="image" class="w-3.5 h-3.5 text-slate-400"></i>
                          </div>
                        </template>
                      </a>
                    </td>

                    <!-- Pin Title, ID & Creator -->
                    <td class="py-3.5 px-4 min-w-[260px]">
                      <div class="space-y-1">
                        <a :href="getPinDossierUrl(pin)" @click.stop
                           class="font-bold text-slate-900 dark:text-white hover:text-emerald-500 line-clamp-2 block transition"
                           title="Open Dedicated Pin Intelligence (/pins/:pin_id)"
                           x-text="pin.title || 'Untitled Pin'"></a>
                        <div class="flex items-center flex-wrap gap-1.5 text-[10px] text-slate-400 font-mono tabular-nums">
                          <a :href="getPinDossierUrl(pin)" @click.stop
                             class="text-slate-500 dark:text-slate-400 hover:text-emerald-500 truncate font-mono tabular-nums"
                             title="Open Dedicated Pin Intelligence"
                             x-text="'ID: ' + pin.pin_id"></a>
                          <template x-if="pin.metadata?.pinner || pin.creator_username">
                            <span class="flex items-center space-x-1 truncate max-w-[130px]">
                              <template x-if="pin.metadata?.pinner?.image_small_url">
                                <img :src="pin.metadata.pinner.image_small_url" class="w-3 h-3 rounded-full object-cover shrink-0">
                              </template>
                              <span class="truncate" x-text="pin.metadata?.pinner?.full_name || ('@' + (pin.metadata?.pinner?.username || pin.creator_username))"></span>
                            </span>
                          </template>
                          <!-- Method Badge -->
                          <span class="px-1.5 py-0.2 rounded text-[9px] font-mono tabular-nums font-bold border shrink-0"
                                :class="getPinMethodBadgeClass(pin)"
                                :title="'Method: ' + formatPinMethodLabel(pin)"
                                x-text="getPinMethod(pin)"></span>
                          <!-- Created Timestamp / Age Badge -->
                          <template x-if="getPinCreatedDate(pin)">
                            <span class="text-slate-500 dark:text-slate-400 font-mono tabular-nums text-[9px] truncate shrink-0"
                                  :title="'Created: ' + formatPinCreated(pin)"
                                  x-text="'📅 ' + (formatPinAge(pin) || formatPinCreated(pin))"></span>
                          </template>
                        </div>
                        <!-- Visual Annotations Tag Pills (Intra-SERP Crossover Engine) -->
                        <template x-if="pin._hasVisualTags || getPinVisualTags(pin).length > 0">
                          <div class="flex flex-wrap items-center gap-1 mt-1">
                            <template x-for="vtag in (pin._cachedVisualTagsSlice || getPinVisualTags(pin).slice(0, 4))" :key="vtag">
                              <button @click.stop="filterByVisualTag(vtag)"
                                      class="px-1.5 py-0.5 rounded-md text-[9px] font-mono tabular-nums transition cursor-pointer flex items-center gap-1"
                                      :class="activeVisualTagFilter === vtag.toLowerCase() 
                                        ? 'bg-purple-600 text-white font-bold shadow-sm' 
                                        : (isCoreAnchorTag(vtag) 
                                          ? 'bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 border border-purple-500/40 font-semibold' 
                                          : 'bg-purple-500/10 text-purple-600 dark:text-purple-400 hover:bg-purple-500/20 border border-purple-500/20')"
                                      :title="isCoreAnchorTag(vtag) 
                                        ? 'Core Visual Anchor: #' + vtag + ' is shared across ' + getTagFrequency(vtag) + ' pins in this keyword. Click to filter crossover.' 
                                        : 'Filter by visual tag: #' + vtag">
                                <template x-if="isCoreAnchorTag(vtag)">
                                  <span class="text-[8px] text-purple-400">🔗</span>
                                </template>
                                <span x-text="'#' + vtag"></span>
                                <template x-if="getTagFrequency(vtag) > 1">
                                  <span class="text-[8px] px-1 py-0.2 rounded font-bold"
                                        :class="isCoreAnchorTag(vtag) ? 'bg-purple-500/30 text-purple-200' : 'bg-slate-700/60 text-slate-300'"
                                        x-text="getTagFrequency(vtag) + 'x'"></span>
                                </template>
                              </button>
                            </template>
                            <template x-if="(pin._extraTagsCount !== undefined ? pin._extraTagsCount : Math.max(0, getPinVisualTags(pin).length - 4)) > 0">
                              <span class="text-[9px] text-slate-400 font-mono tabular-nums" x-text="'+' + (pin._extraTagsCount !== undefined ? pin._extraTagsCount : (getPinVisualTags(pin).length - 4)) + ' tags'"></span>
                            </template>
                          </div>
                        </template>
                      </div>
                    </td>

                    <!-- # Rank & Delta Movement -->
                    <td class="py-3.5 px-3 font-mono tabular-nums font-bold">
                      <template x-if="!pin.is_displaced">
                        <div class="flex items-center space-x-1.5">
                          <span class="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                                :class="Number(pin.rank_position) <= 10 ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30' : ''"
                                x-text="'#' + pin.rank_position"></span>
                          
                          <template x-if="pin.metadata?.is_new">
                            <span class="px-1.5 py-0.2 rounded text-[9px] bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 cursor-help"
                                  title="Newly discovered in this crawl">★ NEW</span>
                          </template>
                          <template x-if="!pin.metadata?.is_new && Number(pin.metadata?.rank_delta || 0) > 0">
                            <span class="text-[10px] text-emerald-500 font-bold cursor-help"
                                  :title="'Climbed from #' + (pin.metadata?.prev_rank ?? '?') + ' (' + (pin.metadata?.baseline_date ? 'vs crawl on ' + pin.metadata.baseline_date : 'vs prior crawl') + ')'"
                                  x-text="'▲ +' + pin.metadata.rank_delta"></span>
                          </template>
                          <template x-if="!pin.metadata?.is_new && Number(pin.metadata?.rank_delta || 0) < 0">
                            <span class="text-[10px] text-rose-500 font-bold cursor-help"
                                  :title="'Dropped from #' + (pin.metadata?.prev_rank ?? '?') + ' (' + (pin.metadata?.baseline_date ? 'vs crawl on ' + pin.metadata.baseline_date : 'vs prior crawl') + ')'"
                                  x-text="'▼ ' + pin.metadata.rank_delta"></span>
                          </template>
                          <template x-if="!pin.metadata?.is_new && Number(pin.metadata?.rank_delta || 0) === 0">
                            <span class="text-[10px] text-slate-400 font-bold cursor-help"
                                  :title="'Maintained rank (' + (pin.metadata?.baseline_date ? 'vs crawl on ' + pin.metadata.baseline_date : 'vs prior crawl') + ')'">=</span>
                          </template>
                        </div>
                      </template>
                      <template x-if="pin.is_displaced">
                        <div class="flex flex-col space-y-1">
                          <div class="flex items-center space-x-1.5 flex-wrap gap-y-0.5">
                            <span class="px-2 py-0.5 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-xs font-mono tabular-nums font-bold"
                                  :title="'Catalog Rank #' + (pin.catalog_rank || ((selectedKeyword?.target_pin_count || 250) + (getPinGlobalIndex(idx) + 1)))"
                                  x-text="'#' + (pin.catalog_rank || ((selectedKeyword?.target_pin_count || 250) + (getPinGlobalIndex(idx) + 1)))"></span>
                            <span class="px-1.5 py-0.5 rounded-md bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 text-[10px] font-black uppercase tracking-wider shrink-0"
                                  x-text="'Was #' + (pin.last_known_rank || pin.rank_position || '?')"></span>
                          </div>
                          <template x-if="pin.is_deleted || pin.metadata?.is_deleted || pin.metadata?.status === 'archived_404'">
                            <span class="text-[9px] text-rose-400 font-mono tabular-nums font-bold flex items-center gap-1">
                              <span>🗑️ Removed (404)</span>
                            </span>
                          </template>
                          <template x-if="!(pin.is_deleted || pin.metadata?.is_deleted || pin.metadata?.status === 'archived_404')">
                            <span class="text-[9px] text-slate-400 font-mono tabular-nums" x-text="'Vault • ' + (pin.status || 'displaced_active')"></span>
                          </template>
                        </div>
                      </template>
                    </td>

                    <!-- Board Name -->
                    <td class="py-3.5 px-3">
                      <span class="text-xs text-slate-600 dark:text-slate-300 font-medium truncate max-w-[130px] block"
                            :title="pin.board_name || pin.metadata?.board_name || 'General Board'"
                            x-text="pin.board_name || pin.metadata?.board_name || 'General Board'"></span>
                    </td>

                    <!-- Saves & Growth Pace Delta (Image 1 Parity) -->
                    <td class="py-3.5 px-3 space-y-0.5 font-mono tabular-nums">
                      <div class="font-bold text-slate-900 dark:text-white"
                           x-text="formatNumber(pin.save_count || pin.metadata?.raw_saves || 0)"></div>
                      <template x-if="getPaceDelta(pin, 'saves') && getPaceDelta(pin, 'saves') !== '0'">
                        <span class="text-[10px] font-bold text-emerald-500 block"
                              x-text="getPaceDelta(pin, 'saves')"></span>
                      </template>
                    </td>

                    <!-- Repins & Growth Pace Delta -->
                    <td class="py-3.5 px-3 space-y-0.5 font-mono tabular-nums">
                      <div class="font-bold text-slate-700 dark:text-slate-300"
                           x-text="formatNumber(pin.repin_count || pin.metadata?.repin_count || 0)"></div>
                      <template x-if="getPaceDelta(pin, 'repins') && getPaceDelta(pin, 'repins') !== '0'">
                        <span class="text-[10px] font-bold text-emerald-500 block"
                              x-text="getPaceDelta(pin, 'repins')"></span>
                      </template>
                    </td>

                    <!-- Comments -->
                    <td class="py-3.5 px-2 font-mono tabular-nums text-slate-600 dark:text-slate-400"
                        x-text="pin.comment_count || 0"></td>

                    <!-- Shares -->
                    <td class="py-3.5 px-2 font-mono tabular-nums text-slate-600 dark:text-slate-400"
                        x-text="pin.share_count || 0"></td>

                    <!-- 24h Velocity -->
                    <td class="py-3.5 px-3 font-mono tabular-nums">
                      <span class="px-2 py-0.5 rounded-lg text-xs font-black block w-fit"
                            :class="Number(pin.daily_save_velocity || 0) >= 10 ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : (Number(pin.daily_save_velocity || 0) > 0 ? 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500')"
                            x-text="(Number(pin.daily_save_velocity || 0) > 0 ? '+' : '') + Number(pin.daily_save_velocity || 0) + ' /d'"></span>
                    </td>

                    <!-- Domain Authority -->
                    <td class="py-3.5 px-3">
                      <span class="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400 truncate max-w-[130px] block"
                            x-text="pin.domain || 'Pinterest Direct'"></span>
                    </td>

                    <!-- Actions -->
                    <td class="py-3.5 px-3 text-right">
                      <div class="flex items-center justify-end space-x-1" @click.stop>
                        <a :href="getPinDossierUrl(pin)"
                           class="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 transition cursor-pointer"
                           title="Open Dedicated Pin Intelligence (/pins/:pin_id)">
                          <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                        </a>
                        <button @click="openPinInspector(pin)"
                                class="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition cursor-pointer"
                                title="Open Pin Deep Dossier">
                          <i data-lucide="eye" class="w-3.5 h-3.5"></i>
                        </button>
                        <button @click="openVisualLens(pin)"
                                class="p-1.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 transition cursor-pointer"
                                title="Visual Lens Similarity Search">
                          <i data-lucide="camera" class="w-3.5 h-3.5"></i>
                        </button>
                        <a :href="'https://www.pinterest.com/pin/' + pin.pin_id + '/'" target="_blank"
                           class="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-white transition"
                           title="Open Pin on Pinterest">
                          <i data-lucide="arrow-up-right" class="w-3.5 h-3.5"></i>
                        </a>
                      </div>
                    </td>

                  </tr>
                </template>
              </tbody>
            </table>
          </div>
        </template>

        <!-- VIEW MODE 2: CARDS VIEW (Matching Image 1 Grid Cards) -->
        <template x-if="!isDetailsLoading && filteredPins && filteredPins.length > 0 && viewMode === 'cards'">
          <div class="p-5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            <template x-for="pin in paginatedPins" :key="pin.pin_id">
              <div :data-pin-id="pin.pin_id"
                   @click="openPinInspector(pin)"
                   class="p-4 rounded-3xl bg-slate-50/70 dark:bg-slate-900/40 border border-slate-200/80 dark:border-[#27272A] hover:border-emerald-500/40 transition group cursor-pointer flex flex-col justify-between space-y-3.5">
                
                <div class="space-y-3">
                  <!-- Thumbnail with Rank & Format overlays -->
                  <a :href="getPinDossierUrl(pin)" @click.stop class="block relative rounded-2xl overflow-hidden aspect-[2/3] max-h-56 bg-slate-200 dark:bg-slate-800" title="Open Dedicated Pin Intelligence (/pins/:pin_id)">
                    <template x-if="pin.image_url">
                      <img :src="pin.image_url" class="w-full h-full object-cover group-hover:scale-105 transition duration-300">
                    </template>
                    <template x-if="!pin.is_displaced">
                      <div class="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-lg bg-slate-950/80 text-white font-mono tabular-nums font-black text-xs backdrop-blur-xs"
                           x-text="'#' + pin.rank_position"></div>
                    </template>
                    <template x-if="pin.is_displaced">
                      <div class="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-lg bg-amber-950/90 text-amber-300 font-mono tabular-nums font-black text-[10px] backdrop-blur-xs border border-amber-500/40 flex items-center gap-1 shadow-sm">
                        <span x-text="'#' + (pin.catalog_rank || 101)"></span>
                        <span class="text-rose-400 text-[9px] font-semibold" x-text="'(Was #' + (pin.last_known_rank || '?') + ')'"></span>
                      </div>
                    </template>
                    <div class="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md bg-slate-950/70 text-[10px] font-mono tabular-nums text-slate-200 backdrop-blur-xs uppercase"
                         x-text="pin.metadata?.format || pin.format || 'ORGANIC'"></div>
                  </a>

                  <!-- Title & ID -->
                  <div class="space-y-1">
                    <a :href="getPinDossierUrl(pin)" @click.stop
                       class="text-xs font-bold text-slate-900 dark:text-white hover:text-emerald-500 line-clamp-2 leading-snug transition block"
                       title="Open Dedicated Pin Intelligence (/pins/:pin_id)"
                       x-text="pin.title || 'Untitled Pin'"></a>
                    <div class="flex items-center space-x-1.5 text-[10px] font-mono tabular-nums">
                      <a :href="getPinDossierUrl(pin)" @click.stop
                         class="text-slate-400 hover:text-emerald-500 truncate"
                         x-text="pin.board_name || pin.metadata?.board_name || ('ID: ' + pin.pin_id)"></a>
                      <span class="px-1.5 py-0.2 rounded text-[8px] font-mono tabular-nums font-bold border shrink-0"
                            :class="getPinMethodBadgeClass(pin)"
                            :title="'Method: ' + formatPinMethodLabel(pin)"
                            x-text="getPinMethod(pin)"></span>
                      <template x-if="formatPinAge(pin)">
                        <span class="text-slate-400 text-[9px] shrink-0" :title="'Created: ' + formatPinCreated(pin)" x-text="'📅 ' + formatPinAge(pin)"></span>
                      </template>
                    </div>
                    <!-- Visual Annotations Tag Pills -->
                    <template x-if="pin._hasVisualTags || getPinVisualTags(pin).length > 0">
                      <div class="flex flex-wrap items-center gap-1 mt-1">
                        <template x-for="vtag in (pin._cachedVisualTagsSlice || getPinVisualTags(pin).slice(0, 3))" :key="vtag">
                          <button @click.stop="filterByVisualTag(vtag)"
                                  class="px-1.5 py-0.2 rounded-md text-[9px] font-mono tabular-nums transition cursor-pointer"
                                  :class="activeVisualTagFilter === vtag.toLowerCase() ? 'bg-purple-600 text-white font-bold' : 'bg-purple-500/10 text-purple-600 dark:text-purple-400 hover:bg-purple-500/20 border border-purple-500/20'"
                                  :title="'Filter by visual tag: #' + vtag">
                            <span x-text="'#' + vtag"></span>
                          </button>
                        </template>
                      </div>
                    </template>
                  </div>
                </div>

                <!-- Engagement Bar & Actions -->
                <div class="pt-2.5 border-t border-slate-200/60 dark:border-[#27272A]/60 space-y-2">
                  <div class="flex items-center justify-between text-xs font-mono tabular-nums">
                    <div>
                      <span class="text-slate-400 text-[10px]">Saves:</span>
                      <strong class="text-slate-900 dark:text-white" x-text="formatNumber(pin.save_count || pin.metadata?.raw_saves || 0)"></strong>
                      <template x-if="getPaceDelta(pin, 'saves') && getPaceDelta(pin, 'saves') !== '0'">
                        <span class="text-emerald-500 text-[10px] font-bold" x-text="getPaceDelta(pin, 'saves')"></span>
                      </template>
                    </div>
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold font-mono tabular-nums"
                          :class="Number(pin.daily_save_velocity || 0) > 0 ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'"
                          x-text="(Number(pin.daily_save_velocity || 0) > 0 ? '+' : '') + (pin.daily_save_velocity || 0) + ' v/d'"></span>
                  </div>

                  <div class="flex items-center justify-between text-[11px] text-slate-400 pt-1" @click.stop>
                    <span class="truncate max-w-[120px] font-mono tabular-nums text-[10px]" x-text="pin.domain || 'Pinterest'"></span>
                    <div class="flex items-center space-x-1">
                      <a :href="getPinDossierUrl(pin)" class="p-1 rounded bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20" title="Open Dossier (/pins/:pin_id)">
                        <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                      </a>
                      <button @click="openPinInspector(pin)" class="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-200" title="Dossier">
                        <i data-lucide="eye" class="w-3.5 h-3.5"></i>
                      </button>
                      <button @click="openVisualLens(pin)" class="p-1 rounded hover:bg-purple-500/20 text-slate-400 hover:text-purple-400" title="Visual Lens">
                        <i data-lucide="camera" class="w-3.5 h-3.5"></i>
                      </button>
                      <a :href="'https://www.pinterest.com/pin/' + pin.pin_id + '/'" target="_blank" class="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-white" title="Pinterest">
                        <i data-lucide="arrow-up-right" class="w-3.5 h-3.5"></i>
                      </a>
                    </div>
                  </div>
                </div>

              </div>
            </template>
          </div>
        </template>

        <!-- TAB 1 PAGINATION & STATUS FOOTER -->
        <template x-if="!isDetailsLoading && filteredPins && filteredPins.length > 0">
          <div class="px-5 py-3.5 border-t border-slate-200/80 dark:border-[#27272A]/80 bg-slate-50/50 dark:bg-slate-900/30 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            
            <!-- Left: Items range & Selection -->
            <div class="flex items-center space-x-3 text-slate-500 font-mono tabular-nums text-[11px] flex-wrap gap-y-1">
              <div>
                <span>Showing </span>
                <span class="font-bold text-slate-900 dark:text-white"
                      x-text="filteredPins.length > 0 ? (((pinPage - 1) * (pinPageSize === 'all' ? 0 : Number(pinPageSize))) + 1) : 0"></span>
                <span> - </span>
                <span class="font-bold text-slate-900 dark:text-white"
                      x-text="pinPageSize === 'all' ? filteredPins.length : Math.min(pinPage * Number(pinPageSize), filteredPins.length)"></span>
                <span> of </span>
                <span class="font-bold text-slate-900 dark:text-white" x-text="filteredPins.length"></span>
                <template x-if="serpScope === 'displaced' && totalDisplacedCount > displacedVaultPins.length">
                  <span class="text-rose-500 font-bold ml-1" x-text="'(' + totalDisplacedCount + ' total in Vault)'"></span>
                </template>
                <template x-if="serpScope === 'all' && totalCatalogCount > allCombinedPins.length">
                  <span class="text-emerald-500 font-bold ml-1" x-text="'(' + totalCatalogCount + ' total in Catalog)'"></span>
                </template>
                <span> pins</span>
              </div>

              <template x-if="selectedPinIds.length > 0">
                <span class="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold border border-emerald-500/30 font-sans"
                      x-text="selectedPinIds.length + ' selected'"></span>
              </template>

              <!-- Load More Displaced Pins Action -->
              <template x-if="(serpScope === 'displaced' || serpScope === 'all') && totalDisplacedCount > displacedVaultPins.length">
                <button type="button" @click="loadMoreDisplacedPins()" :disabled="isLoadingMoreDisplaced"
                        class="px-2.5 py-1 rounded-lg font-mono tabular-nums font-bold text-[11px] bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50 ml-2"
                        title="Load next 24 displaced pins from Vault">
                  <i data-lucide="download" class="w-3 h-3" :class="isLoadingMoreDisplaced ? 'animate-bounce' : ''"></i>
                  <span x-text="isLoadingMoreDisplaced ? 'Loading Vault...' : ('Load More Displaced (' + Math.min(24, totalDisplacedCount - displacedVaultPins.length) + ' more)')"></span>
                </button>
              </template>
            </div>

            <!-- Right: Pagination Buttons -->
            <template x-if="pinPageSize !== 'all' && pinTotalPages > 1">
              <div class="flex items-center space-x-1">
                <!-- First Page -->
                <button type="button" @click="setPinPage(1)" :disabled="pinPage <= 1"
                        class="p-1.5 rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer text-slate-600 dark:text-slate-400"
                        title="First Page">
                  <i data-lucide="chevrons-left" class="w-4 h-4"></i>
                </button>

                <!-- Previous Page -->
                <button type="button" @click="setPinPage(pinPage - 1)" :disabled="pinPage <= 1"
                        class="p-1.5 rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer text-slate-600 dark:text-slate-400"
                        title="Previous Page">
                  <i data-lucide="chevron-left" class="w-4 h-4"></i>
                </button>

                <!-- Numbered Page Pills -->
                <div class="flex items-center space-x-1 px-1">
                  <template x-for="p in pinPageNumbers" :key="p">
                    <div>
                      <template x-if="p === '...'">
                        <span class="px-2 py-1 text-slate-400 font-mono tabular-nums text-xs">...</span>
                      </template>
                      <template x-if="p !== '...'">
                        <button type="button" @click="setPinPage(p)"
                                class="min-w-8 h-8 px-2 rounded-xl text-xs font-mono tabular-nums font-bold transition cursor-pointer"
                                :class="pinPage === p ? 'bg-emerald-600 text-white shadow-xs' : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'"
                                x-text="p"></button>
                      </template>
                    </div>
                  </template>
                </div>

                <!-- Next Page -->
                <button type="button" @click="setPinPage(pinPage + 1)" :disabled="pinPage >= pinTotalPages"
                        class="p-1.5 rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer text-slate-600 dark:text-slate-400"
                        title="Next Page">
                  <i data-lucide="chevron-right" class="w-4 h-4"></i>
                </button>

                <!-- Last Page -->
                <button type="button" @click="setPinPage(pinTotalPages)" :disabled="pinPage >= pinTotalPages"
                        class="p-1.5 rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer text-slate-600 dark:text-slate-400"
                        title="Last Page">
                  <i data-lucide="chevrons-right" class="w-4 h-4"></i>
                </button>
              </div>
            </template>

          </div>
        </template>

      </div>

      <!-- TAB 2: PINTEREST TRENDS (52-WEEK SEASONALITY & DEMOGRAPHICS) -->
      <div x-show="activeTab === 'trends'" class="p-6 space-y-6">
        
        <div class="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 dark:border-[#27272A]/80 gap-3">
          <div>
            <div class="flex items-center space-x-2">
              <h3 class="text-base font-black text-slate-900 dark:text-white">Interest Over Time (52-Week Official Curve)</h3>
              <span class="px-2 py-0.5 text-[10px] font-bold uppercase rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30 font-mono tabular-nums">trends.pinterest.com</span>
            </div>
            <p class="text-xs text-slate-500">Weekly relative search popularity indexed from 0 to 100 over the past 12 months</p>
          </div>

          <div class="flex items-center space-x-3 text-xs font-mono tabular-nums">
            <div class="px-3 py-1 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
              Peak: <strong x-text="trendsData?.peak_value || 100"></strong>/100
            </div>
            <div class="px-3 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
              Latest: <strong x-text="trendsData?.current_index || 56"></strong>/100
            </div>
          </div>
        </div>

        <!-- 52-Week Interactive SVG Chart (Exact Pinterest Trends Parity) -->
        <div class="p-6 rounded-3xl bg-slate-900/80 border border-slate-800 space-y-3 relative overflow-hidden">
          <div class="flex items-center justify-between text-xs text-slate-400 font-mono tabular-nums px-2">
            <span>52 Weeks Ago</span>
            <span>26 Weeks Ago (Mid-Year)</span>
            <span class="text-blue-400 font-bold">Current Week</span>
          </div>

          <svg class="w-full h-48 overflow-visible" viewBox="0 0 800 180" preserveAspectRatio="none">
            <defs>
              <linearGradient id="trendsBlueGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.45"/>
                <stop offset="100%" stop-color="#3b82f6" stop-opacity="0.0"/>
              </linearGradient>
            </defs>
            <!-- Horizontal Gridlines (20, 40, 60, 80, 100) -->
            <line x1="0" y1="36" x2="800" y2="36" stroke="#334155" stroke-dasharray="4" stroke-width="1"/>
            <line x1="0" y1="72" x2="800" y2="72" stroke="#334155" stroke-dasharray="4" stroke-width="1"/>
            <line x1="0" y1="108" x2="800" y2="108" stroke="#334155" stroke-dasharray="4" stroke-width="1"/>
            <line x1="0" y1="144" x2="800" y2="144" stroke="#334155" stroke-dasharray="4" stroke-width="1"/>

            <!-- Area & Line -->
            <path :d="getTrendsAreaPath(trendsData?.counts_52_weeks || []).area" fill="url(#trendsBlueGrad)"/>
            <path :d="getTrendsAreaPath(trendsData?.counts_52_weeks || []).line" fill="none" stroke="#3b82f6" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>

        <!-- Related Trends Chips with Sparklines (Image 2 Parity) -->
        <div class="space-y-3">
          <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono tabular-nums">Related Trends & Comparison</h4>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <template x-for="r in (trendsData?.related_trends || [])" :key="r.term">
              <div @click="loadKeywordBySlugOrText(r.term, true, true)"
                   class="p-3.5 rounded-2xl bg-slate-50/80 dark:bg-slate-900/50 border border-slate-200 dark:border-[#27272A] hover:border-blue-500/50 transition cursor-pointer flex items-center justify-between">
                <div class="min-w-0 pr-2">
                  <p class="text-xs font-bold text-slate-900 dark:text-white capitalize truncate" x-text="r.term"></p>
                  <span class="text-[10px] text-blue-500 font-mono tabular-nums">+ Track Query</span>
                </div>
                <svg class="w-20 h-5 overflow-visible shrink-0" viewBox="0 0 80 20">
                  <path :d="generateSparklinePath(r.counts, 80, 20)" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round"/>
                </svg>
              </div>
            </template>
          </div>
        </div>

        <!-- Demographics: Age & Gender Distribution (Image 2 Parity) -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
          <!-- Age Distribution -->
          <div class="p-5 rounded-3xl bg-slate-50/70 dark:bg-slate-900/50 border border-slate-200/80 dark:border-[#27272A] space-y-3">
            <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono tabular-nums">Audience Age Distribution</h4>
            <div class="space-y-2">
              <template x-for="a in (trendsData?.demographics?.age || [])" :key="a.group">
                <div class="space-y-1">
                  <div class="flex items-center justify-between text-xs font-mono tabular-nums">
                    <span class="text-slate-500" x-text="a.group"></span>
                    <span class="font-bold text-slate-900 dark:text-white" x-text="a.display_pct || (a.pct + '%')"></span>
                  </div>
                  <div class="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <div class="h-full bg-blue-500 rounded-full" :style="'width: ' + (a.pct > 0 ? Math.max(a.pct, 3) : 0) + '%'"></div>
                  </div>
                </div>
              </template>
            </div>
          </div>

          <!-- Gender Distribution -->
          <div class="p-5 rounded-3xl bg-slate-50/70 dark:bg-slate-900/50 border border-slate-200/80 dark:border-[#27272A] space-y-3">
            <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono tabular-nums">Audience Gender Distribution</h4>
            <div class="space-y-4 pt-2">
              <div class="space-y-1">
                <div class="flex items-center justify-between text-xs font-mono tabular-nums">
                  <span class="text-slate-500">Female</span>
                  <span class="font-bold text-rose-500" x-text="trendsData?.demographics?.gender?.female_display || ((trendsData?.demographics?.gender?.female_pct || 86) + '%')"></span>
                </div>
                <div class="w-full h-3 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                  <div class="h-full bg-rose-500 rounded-full" :style="'width: ' + (trendsData?.demographics?.gender?.female_pct || 86) + '%'"></div>
                </div>
              </div>

              <div class="space-y-1">
                <div class="flex items-center justify-between text-xs font-mono tabular-nums">
                  <span class="text-slate-500">Male</span>
                  <span class="font-bold text-cyan-500" x-text="trendsData?.demographics?.gender?.male_display || ((trendsData?.demographics?.gender?.male_pct || 4) + '%')"></span>
                </div>
                <div class="w-full h-3 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                  <div class="h-full bg-cyan-500 rounded-full" :style="'width: ' + Math.max(trendsData?.demographics?.gender?.male_pct || 4, 3) + '%'"></div>
                </div>
              </div>

              <div class="space-y-1">
                <div class="flex items-center justify-between text-xs font-mono tabular-nums">
                  <span class="text-slate-500">Unspecified / Custom</span>
                  <span class="font-bold text-slate-400" x-text="trendsData?.demographics?.gender?.unspecified_display || ((trendsData?.demographics?.gender?.unspecified_pct || 10) + '%')"></span>
                </div>
                <div class="w-full h-3 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                  <div class="h-full bg-slate-500 rounded-full" :style="'width: ' + (trendsData?.demographics?.gender?.unspecified_pct || 10) + '%'"></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Pinterest Official Guided Search Pivots (Image 2 Parity) -->
        <template x-if="trendsData?.ideas_pivots && trendsData.ideas_pivots.length > 0">
          <div class="space-y-3 pt-2">
            <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono tabular-nums">Pinterest Guided Search Capsules (Pivots)</h4>
            <div class="flex flex-wrap gap-2">
              <template x-for="p in trendsData.ideas_pivots" :key="p.label">
                <button @click="loadKeywordBySlugOrText(p.full_name, true, true)"
                        class="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-[#27272A] text-slate-700 dark:text-slate-300 hover:text-emerald-500 dark:hover:text-emerald-400 transition cursor-pointer flex items-center space-x-1">
                  <span>+</span>
                  <span x-text="p.label"></span>
                </button>
              </template>
            </div>
          </div>
        </template>

        <!-- Pinterest Official Related Interests Taxonomy (Image 3 Parity) -->
        <template x-if="trendsData?.related_interests && trendsData.related_interests.length > 0">
          <div class="space-y-3 pt-2">
            <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono tabular-nums">Pinterest Taxonomy Related Interests</h4>
            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
              <template x-for="ri in trendsData.related_interests" :key="ri">
                <div @click="loadKeywordBySlugOrText(ri, true, true)"
                     class="p-3 rounded-2xl bg-slate-50/70 dark:bg-slate-900/50 border border-slate-200/80 dark:border-[#27272A] hover:border-emerald-500/40 transition cursor-pointer group">
                  <p class="text-xs font-bold text-slate-900 dark:text-white capitalize group-hover:text-emerald-500 transition line-clamp-1" x-text="ri"></p>
                  <span class="text-[10px] text-emerald-500 font-mono tabular-nums mt-1 block">+ Track Interest</span>
                </div>
              </template>
            </div>
          </div>
        </template>

        <!-- Pinterest Official Popular Pins (Image 2 Parity) -->
        <div class="space-y-4 pt-4 border-t border-slate-100 dark:border-[#27272A]/80">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div class="space-y-0.5">
              <div class="flex items-center space-x-2">
                <h4 class="text-sm font-bold text-slate-900 dark:text-white font-sans tracking-tight">Popular Pins</h4>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-mono tabular-nums font-bold bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30">736x HD</span>
              </div>
              <p class="text-xs text-slate-500">Browse official popular Pins based on your keywords in high definition</p>
            </div>
            
            <div class="flex items-center space-x-2">
              <!-- View Switcher: Full Pins (736x) vs Official Collage vs Interactive Cards -->
              <div class="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800/90 p-1 border border-slate-200/80 dark:border-[#27272A]/60 text-xs">
                <button @click="popularPinsView = 'full'; $nextTick(() => { if (window.lucide) window.lucide.createIcons(); })"
                        :class="popularPinsView === 'full' ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm font-bold' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-medium'"
                        class="px-2.5 py-1 rounded-lg transition flex items-center space-x-1 cursor-pointer"
                        title="عرض كافة الدبابيس كاملة بدقة 736x">
                  <i data-lucide="layout-grid" class="w-3.5 h-3.5"></i>
                  <span>Full Pins (الصور كاملة)</span>
                </button>
                <button @click="popularPinsView = 'collage'; $nextTick(() => { if (window.lucide) window.lucide.createIcons(); })"
                        :class="popularPinsView === 'collage' ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm font-bold' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-medium'"
                        class="px-2.5 py-1 rounded-lg transition flex items-center space-x-1 cursor-pointer"
                        title="بانر الكولاج الرسمي">
                  <i data-lucide="columns-3" class="w-3.5 h-3.5"></i>
                  <span>Official Collage</span>
                </button>
                <button @click="popularPinsView = 'grid'; $nextTick(() => { if (window.lucide) window.lucide.createIcons(); })"
                        :class="popularPinsView === 'grid' ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm font-bold' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-medium'"
                        class="px-2.5 py-1 rounded-lg transition flex items-center space-x-1 cursor-pointer"
                        title="بطاقات التحليل والتتبع">
                  <i data-lucide="bar-chart-2" class="w-3.5 h-3.5"></i>
                  <span>Interactive Cards</span>
                </button>
              </div>

              <button @click="fetchTrends(selectedKeyword?.keyword || activeKeywordQuery, true)"
                      class="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition flex items-center space-x-1.5 cursor-pointer">
                <i data-lucide="refresh-cw" class="w-3 h-3" :class="isTrendsLoading ? 'animate-spin' : ''"></i>
                <span>Refresh Trends</span>
              </button>
            </div>
          </div>

          <!-- VIEW 1: FULL 9 PINS GALLERY (COMPLETE UNROPPED IMAGES AT 736x RESOLUTION) -->
          <div x-show="popularPinsView === 'full'" class="space-y-4">
            <template x-if="trendsData?.collage_images && trendsData.collage_images.length > 0">
              <div class="space-y-3">
                <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-3 gap-4">
                  <template x-for="(imgUrl, idx) in (trendsData?.collage_images || []).filter(Boolean)" :key="idx">
                    <div class="group relative rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-[#27272A] hover:border-blue-500/50 shadow-xs hover:shadow-md transition duration-300 overflow-hidden flex flex-col justify-between cursor-pointer"
                         @click="window.open((imgUrl || '').replace('/236x/', '/736x/').replace('/474x/', '/736x/'), '_blank')">
                      
                      <!-- Full Pin Image Container with fixed 2:3 aspect ratio -->
                      <div class="relative w-full aspect-[2/3] bg-slate-100 dark:bg-slate-950/80 flex items-center justify-center overflow-hidden p-2">
                        <img :src="(imgUrl || '').replace('/236x/', '/736x/').replace('/474x/', '/736x/')"
                             :alt="'Pin #' + (idx + 1)"
                             class="w-full h-full object-contain rounded-xl group-hover:scale-[1.02] transition duration-300"
                             loading="lazy"
                             referrerpolicy="no-referrer"
                             @error="if ($el.src.includes('/736x/')) { $el.src = $el.src.replace('/736x/', '/474x/'); } else if ($el.src.includes('/474x/')) { $el.src = $el.src.replace('/474x/', '/236x/'); }">
                        
                        <!-- Rank Badge -->
                        <div class="absolute top-4 left-4 px-2.5 py-1 rounded-lg bg-slate-950/80 text-white font-mono tabular-nums font-black text-xs backdrop-blur-xs shadow-md">
                          <span x-text="'#' + (idx + 1)"></span>
                        </div>

                        <!-- 736x HD Badge -->
                        <div class="absolute top-4 right-4 px-2 py-0.5 rounded-md bg-blue-600 text-white font-mono tabular-nums font-bold text-[10px] backdrop-blur-xs shadow-md uppercase tracking-wider">
                          736x HD
                        </div>

                        <!-- Hover Overlay -->
                        <div class="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition duration-200 flex items-center justify-center gap-2 backdrop-blur-[2px]">
                          <span class="px-3.5 py-2 rounded-xl bg-white text-slate-900 text-xs font-bold hover:bg-slate-100 shadow-md flex items-center space-x-1.5 transition">
                            <i data-lucide="maximize-2" class="w-3.5 h-3.5 text-blue-600"></i>
                            <span>Open 736x Full Image</span>
                          </span>
                        </div>
                      </div>

                      <!-- Card Details Bottom Strip -->
                      <div class="p-3 border-t border-slate-100 dark:border-[#27272A]/80 flex items-center justify-between text-xs" @click.stop>
                        <div class="flex items-center space-x-2 min-w-0 pr-2">
                          <span class="w-2 h-2 rounded-full bg-blue-500 shrink-0"></span>
                          <span class="font-bold text-slate-800 dark:text-slate-200 truncate capitalize"
                                x-text="(trendsData?.term || selectedKeyword?.keyword || activeKeywordQuery || 'Popular') + ' Pin ' + (idx + 1)"></span>
                        </div>
                        <a :href="'https://www.pinterest.com/search/pins/?q=' + encodeURIComponent(trendsData?.term || selectedKeyword?.keyword || activeKeywordQuery || '')" target="_blank"
                           class="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-medium text-[11px] transition flex items-center space-x-1 shrink-0">
                          <i data-lucide="external-link" class="w-3 h-3 text-red-500"></i>
                          <span>Pinterest</span>
                        </a>
                      </div>

                    </div>
                  </template>
                </div>

                <!-- Footer Pill -->
                <div class="flex items-center space-x-2 pt-2 px-1">
                  <span class="w-2.5 h-2.5 rounded-full bg-blue-600 dark:bg-blue-500 inline-block"></span>
                  <span class="text-xs font-bold text-slate-900 dark:text-slate-100 font-sans"
                        x-text="(trendsData?.term || selectedKeyword?.keyword || activeKeywordQuery || 'Popular') + ' — All 9 Official Viral Pins in Full HD (736x)'"></span>
                </div>
              </div>
            </template>

            <!-- Loading or Empty state -->
            <template x-if="!trendsData?.collage_images || trendsData.collage_images.length === 0">
              <div class="py-12 text-center text-xs text-slate-400 italic rounded-2xl border border-slate-200 dark:border-[#27272A] bg-slate-50/50 dark:bg-slate-900/30">
                <i data-lucide="image" class="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2"></i>
                <p>Loading full 736x popular pins...</p>
              </div>
            </template>
          </div>

          <!-- VIEW 2: OFFICIAL PINTEREST TRENDS COLLAGE BANNER (736x RESOLUTION) -->
          <div x-show="popularPinsView === 'collage'" class="space-y-3">
            <template x-if="trendsData?.collage_images && trendsData.collage_images.length >= 5">
              <div class="space-y-2">
                <!-- The 5-Column Collage Card -->
                <div @click="window.open('https://www.pinterest.com/search/pins/?q=' + encodeURIComponent(trendsData?.term || selectedKeyword?.keyword || activeKeywordQuery || ''), '_blank')"
                     class="group relative h-[440px] sm:h-[480px] md:h-[520px] w-full rounded-2xl overflow-hidden border border-slate-200 dark:border-[#27272A] bg-slate-100 dark:bg-slate-900/60 cursor-pointer shadow-sm hover:shadow-md transition">
                  
                  <div class="grid grid-cols-5 h-full w-full gap-[3px] bg-slate-200 dark:bg-slate-800">
                    <!-- Column 1: Full Height Image A[0] -->
                    <div class="relative h-full w-full overflow-hidden bg-slate-300 dark:bg-slate-700">
                      <img :src="(trendsData.collage_images[0] || '').replace('/236x/', '/736x/').replace('/474x/', '/736x/')"
                           class="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.02] transition duration-300"
                           loading="lazy"
                           referrerpolicy="no-referrer"
                           @error="if ($el.src.includes('/736x/')) { $el.src = $el.src.replace('/736x/', '/474x/'); } else if ($el.src.includes('/474x/')) { $el.src = $el.src.replace('/474x/', '/236x/'); }">
                    </div>

                    <!-- Column 2: Stacked A[7] (Top 40%) & A[8] (Bottom 60%) -->
                    <div class="h-full w-full flex flex-col gap-[3px]">
                      <div class="relative min-h-0 w-full overflow-hidden bg-slate-300 dark:bg-slate-700" style="flex: 4 1 0%;">
                        <img :src="(trendsData.collage_images[7] || trendsData.collage_images[1] || '').replace('/236x/', '/736x/').replace('/474x/', '/736x/')"
                             class="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.02] transition duration-300"
                             loading="lazy"
                             referrerpolicy="no-referrer"
                             @error="if ($el.src.includes('/736x/')) { $el.src = $el.src.replace('/736x/', '/474x/'); } else if ($el.src.includes('/474x/')) { $el.src = $el.src.replace('/474x/', '/236x/'); }">
                      </div>
                      <div class="relative min-h-0 w-full overflow-hidden bg-slate-300 dark:bg-slate-700" style="flex: 6 1 0%;">
                        <img :src="(trendsData.collage_images[8] || trendsData.collage_images[2] || '').replace('/236x/', '/736x/').replace('/474x/', '/736x/')"
                             class="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.02] transition duration-300"
                             loading="lazy"
                             referrerpolicy="no-referrer"
                             @error="if ($el.src.includes('/736x/')) { $el.src = $el.src.replace('/736x/', '/474x/'); } else if ($el.src.includes('/474x/')) { $el.src = $el.src.replace('/474x/', '/236x/'); }">
                      </div>
                    </div>

                    <!-- Column 3: Stacked A[5] (Top 40%) & A[6] (Bottom 60%) -->
                    <div class="h-full w-full flex flex-col gap-[3px]">
                      <div class="relative min-h-0 w-full overflow-hidden bg-slate-300 dark:bg-slate-700" style="flex: 4 1 0%;">
                        <img :src="(trendsData.collage_images[5] || trendsData.collage_images[3] || '').replace('/236x/', '/736x/').replace('/474x/', '/736x/')"
                             class="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.02] transition duration-300"
                             loading="lazy"
                             referrerpolicy="no-referrer"
                             @error="if ($el.src.includes('/736x/')) { $el.src = $el.src.replace('/736x/', '/474x/'); } else if ($el.src.includes('/474x/')) { $el.src = $el.src.replace('/474x/', '/236x/'); }">
                      </div>
                      <div class="relative min-h-0 w-full overflow-hidden bg-slate-300 dark:bg-slate-700" style="flex: 6 1 0%;">
                        <img :src="(trendsData.collage_images[6] || trendsData.collage_images[4] || '').replace('/236x/', '/736x/').replace('/474x/', '/736x/')"
                             class="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.02] transition duration-300"
                             loading="lazy"
                             referrerpolicy="no-referrer"
                             @error="if ($el.src.includes('/736x/')) { $el.src = $el.src.replace('/736x/', '/474x/'); } else if ($el.src.includes('/474x/')) { $el.src = $el.src.replace('/474x/', '/236x/'); }">
                      </div>
                    </div>

                    <!-- Column 4: Stacked A[3] (Top 60%) & A[4] (Bottom 40%) -->
                    <div class="h-full w-full flex flex-col gap-[3px]">
                      <div class="relative min-h-0 w-full overflow-hidden bg-slate-300 dark:bg-slate-700" style="flex: 6 1 0%;">
                        <img :src="(trendsData.collage_images[3] || trendsData.collage_images[1] || '').replace('/236x/', '/736x/').replace('/474x/', '/736x/')"
                             class="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.02] transition duration-300"
                             loading="lazy"
                             referrerpolicy="no-referrer"
                             @error="if ($el.src.includes('/736x/')) { $el.src = $el.src.replace('/736x/', '/474x/'); } else if ($el.src.includes('/474x/')) { $el.src = $el.src.replace('/474x/', '/236x/'); }">
                      </div>
                      <div class="relative min-h-0 w-full overflow-hidden bg-slate-300 dark:bg-slate-700" style="flex: 4 1 0%;">
                        <img :src="(trendsData.collage_images[4] || trendsData.collage_images[2] || '').replace('/236x/', '/736x/').replace('/474x/', '/736x/')"
                             class="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.02] transition duration-300"
                             loading="lazy"
                             referrerpolicy="no-referrer"
                             @error="if ($el.src.includes('/736x/')) { $el.src = $el.src.replace('/736x/', '/474x/'); } else if ($el.src.includes('/474x/')) { $el.src = $el.src.replace('/474x/', '/236x/'); }">
                      </div>
                    </div>

                    <!-- Column 5: Stacked A[1] (Top 40%) & A[2] (Bottom 60%) -->
                    <div class="h-full w-full flex flex-col gap-[3px]">
                      <div class="relative min-h-0 w-full overflow-hidden bg-slate-300 dark:bg-slate-700" style="flex: 4 1 0%;">
                        <img :src="(trendsData.collage_images[1] || trendsData.collage_images[0] || '').replace('/236x/', '/736x/').replace('/474x/', '/736x/')"
                             class="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.02] transition duration-300"
                             loading="lazy"
                             referrerpolicy="no-referrer"
                             @error="if ($el.src.includes('/736x/')) { $el.src = $el.src.replace('/736x/', '/474x/'); } else if ($el.src.includes('/474x/')) { $el.src = $el.src.replace('/474x/', '/236x/'); }">
                      </div>
                      <div class="relative min-h-0 w-full overflow-hidden bg-slate-300 dark:bg-slate-700" style="flex: 6 1 0%;">
                        <img :src="(trendsData.collage_images[2] || trendsData.collage_images[0] || '').replace('/236x/', '/736x/').replace('/474x/', '/736x/')"
                             class="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.02] transition duration-300"
                             loading="lazy"
                             referrerpolicy="no-referrer"
                             @error="if ($el.src.includes('/736x/')) { $el.src = $el.src.replace('/736x/', '/474x/'); } else if ($el.src.includes('/474x/')) { $el.src = $el.src.replace('/474x/', '/236x/'); }">
                      </div>
                    </div>
                  </div>

                  <!-- Hover Overlay -->
                  <div class="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition flex items-center justify-center pointer-events-none">
                    <span class="px-4 py-2 rounded-full bg-white/90 dark:bg-slate-900/90 text-xs font-bold text-slate-900 dark:text-white shadow-lg flex items-center space-x-1.5 backdrop-blur-sm">
                      <i data-lucide="external-link" class="w-3.5 h-3.5 text-blue-500"></i>
                      <span>Browse Related Pins on Pinterest</span>
                    </span>
                  </div>
                </div>

                <!-- Bottom Indicator Dot Pill -->
                <div class="flex items-center space-x-2 pt-1 px-1">
                  <span class="w-2.5 h-2.5 rounded-full bg-blue-600 dark:bg-blue-500 inline-block"></span>
                  <span class="text-xs font-bold text-slate-900 dark:text-slate-100 font-sans"
                        x-text="trendsData?.term || selectedKeyword?.keyword || activeKeywordQuery"></span>
                </div>
              </div>
            </template>

            <!-- Loading or Empty state for collage -->
            <template x-if="!trendsData?.collage_images || trendsData.collage_images.length < 5">
              <div class="py-12 text-center text-xs text-slate-400 italic rounded-2xl border border-slate-200 dark:border-[#27272A] bg-slate-50/50 dark:bg-slate-900/30">
                <i data-lucide="image" class="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2"></i>
                <p>Loading official Pinterest Trends collage...</p>
              </div>
            </template>
          </div>

          <!-- VIEW 2: INTERACTIVE PIN CARDS (DOSSIER & VELOCITY) -->
          <div x-show="popularPinsView === 'grid'" class="space-y-4">
            <template x-if="!trendsData?.popular_pins || trendsData.popular_pins.length === 0">
              <div class="py-12 text-center text-xs text-slate-400 italic">
                No popular pins extracted yet for this trend. Crawl keyword or click refresh.
              </div>
            </template>

            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3.5">
              <template x-for="p in (trendsData?.popular_pins || [])" :key="p.pin_id || p.id">
                <div :data-pin-id="p.pin_id || p.id"
                     @click="openPinInspector({ pin_id: p.pin_id || p.id, title: p.title, image_url: p.image_url, domain: p.domain, save_count: p.save_count, repin_count: p.repin_count })"
                     class="group rounded-2xl bg-slate-50/80 dark:bg-slate-900/50 border border-slate-200/80 dark:border-[#27272A] hover:border-blue-500/50 overflow-hidden transition cursor-pointer flex flex-col justify-between">
                  
                  <div class="relative aspect-[2/3] bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <template x-if="p.image_url">
                      <img :src="p.image_url" class="w-full h-full object-cover group-hover:scale-105 transition duration-300" loading="lazy" referrerpolicy="no-referrer">
                    </template>
                    <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition flex items-end p-2.5">
                      <span class="text-[10px] font-bold text-white flex items-center space-x-1">
                        <i data-lucide="eye" class="w-3 h-3"></i>
                        <span>Inspect Dossier</span>
                      </span>
                    </div>
                  </div>

                  <div class="p-2.5 space-y-1">
                    <h5 class="text-xs font-bold text-slate-900 dark:text-white line-clamp-2 leading-tight group-hover:text-blue-500 transition"
                        x-text="p.title || 'Popular Pin'"></h5>
                    <div class="flex items-center justify-between text-[10px] text-slate-400 font-mono tabular-nums">
                      <span class="truncate max-w-[80px]" x-text="p.pinner?.full_name || p.domain || 'Pinterest'"></span>
                      <a :href="'https://www.pinterest.com/pin/' + (p.pin_id || p.id) + '/'" target="_blank" @click.stop class="text-blue-500 hover:underline">
                        <i data-lucide="external-link" class="w-3 h-3"></i>
                      </a>
                    </div>
                  </div>

                </div>
              </template>
            </div>
          </div>
        </div>

      </div>

      <!-- TAB 4: PINCLICKS INTELLIGENCE & ARBITRAGE BREAKDOWN -->
      <div x-show="activeTab === 'intelligence'" class="p-4 sm:p-6 space-y-6">

        <!-- Scope Segment Selector: Active SERP vs Full Catalog (All Pins) -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-slate-50/90 dark:bg-slate-900/80 border border-slate-200/80 dark:border-[#27272A]">
          <div class="flex items-center space-x-3">
            <div class="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center shrink-0">
              <i data-lucide="layers" class="w-4 h-4"></i>
            </div>
            <div>
              <div class="flex items-center space-x-2">
                <span class="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">Intelligence Scope</span>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-mono tabular-nums font-bold bg-purple-500/15 text-purple-500"
                      x-text="intelScope === 'all' ? ('Full Historical Catalog (#' + totalCatalogCount + ' Pins)') : ('Active Live SERP (#' + (selectedKeywordDetails?.current_pins?.length || 0) + ' Pins)')"></span>
              </div>
              <p class="text-[11px] text-slate-500">Toggle analysis between live ranking active SERP pins and the full collected catalog (including Displaced Vault pins).</p>
            </div>
          </div>

          <div class="flex items-center p-1 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-[#27272A] gap-1 self-start sm:self-auto shrink-0">
            <button @click="intelScope = 'all'"
                    class="px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center space-x-1.5"
                    :class="intelScope === 'all' ? 'bg-purple-500 text-white shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'">
              <span>🔘 Full Catalog</span>
              <span class="px-1.5 py-0.2 rounded-full text-[10px] font-mono tabular-nums font-bold"
                    :class="intelScope === 'all' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'"
                    x-text="totalCatalogCount > allCombinedPins.length ? ('#' + allCombinedPins.length + ' / ' + totalCatalogCount) : ('#' + totalCatalogCount)"></span>
            </button>
            <button @click="intelScope = 'active'"
                    class="px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center space-x-1.5"
                    :class="intelScope === 'active' ? 'bg-emerald-500 text-white shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'">
              <span>🟢 Active SERP</span>
              <span class="px-1.5 py-0.2 rounded-full text-[10px] font-mono tabular-nums font-bold"
                    :class="intelScope === 'active' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'"
                    x-text="'#' + (selectedKeywordDetails?.current_pins?.length || 0)"></span>
            </button>
          </div>
        </div>

        <!-- Top 4-Metric Grid -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <!-- 1: StaticRank & Saves Baseline -->
          <div class="p-5 rounded-3xl bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200/80 dark:border-[#27272A]/80 space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono tabular-nums">SERP Engagement</span>
              <div class="w-7 h-7 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                <i data-lucide="bookmark" class="w-3.5 h-3.5"></i>
              </div>
            </div>
            <div class="space-y-2">
              <div class="flex items-center justify-between text-xs">
                <span class="text-slate-500">Total Analyzed Pins</span>
                <span class="font-mono tabular-nums font-bold text-slate-900 dark:text-white" x-text="totalAnalyzedPinsCount"></span>
              </div>
              <div class="flex items-center justify-between text-xs">
                <span class="text-slate-500">Avg Saves / Pin</span>
                <span class="font-mono tabular-nums font-bold text-emerald-500" x-text="formatNumber(analyzedAvgSaves)"></span>
              </div>
              <div class="flex items-center justify-between text-xs">
                <span class="text-slate-500">Median Saves</span>
                <span class="font-mono tabular-nums font-bold text-slate-700 dark:text-slate-300" x-text="formatNumber(analyzedMedianSaves)"></span>
              </div>
            </div>
          </div>

          <!-- 2: Domain Concentration & Repeat Frequency -->
          <div class="p-5 rounded-3xl bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200/80 dark:border-[#27272A]/80 space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono tabular-nums">Domain Authority</span>
              <div class="w-7 h-7 rounded-xl bg-cyan-500/10 text-cyan-500 flex items-center justify-center">
                <i data-lucide="globe" class="w-3.5 h-3.5"></i>
              </div>
            </div>
            <div class="space-y-2">
              <div class="flex items-center justify-between text-xs">
                <span class="text-slate-500">Unique Domains</span>
                <span class="font-mono tabular-nums font-bold text-slate-900 dark:text-white" x-text="uniqueDomainsCount"></span>
              </div>
              <div class="flex items-center justify-between text-xs">
                <span class="text-slate-500">Repeated Domains (>1 Pin)</span>
                <span class="font-mono tabular-nums font-bold text-amber-500" x-text="repeatedDomainsCount"></span>
              </div>
              <div class="flex items-center justify-between text-xs">
                <span class="text-slate-500">Top Ranked Domain</span>
                <span class="font-mono tabular-nums font-bold text-purple-400 truncate max-w-[120px]" x-text="selectedKeywordDetails?.intelligence?.top_domain || domainBreakdownList[0]?.domain || 'N/A'"></span>
              </div>
            </div>
          </div>

          <!-- 3: Creative Formats & Canvas Aspect Ratios -->
          <div class="p-5 rounded-3xl bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200/80 dark:border-[#27272A]/80 space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono tabular-nums">Visual Formats</span>
              <div class="w-7 h-7 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center">
                <i data-lucide="image" class="w-3.5 h-3.5"></i>
              </div>
            </div>
            <div class="space-y-2">
              <div class="flex items-center justify-between text-xs">
                <span class="text-slate-500">Standard Static (2:3)</span>
                <span class="font-mono tabular-nums font-bold text-emerald-500" x-text="analyzedVisualFormats.standard_pct + '%'"></span>
              </div>
              <div class="flex items-center justify-between text-xs">
                <span class="text-slate-500">Extra Tall (1:2)</span>
                <span class="font-mono tabular-nums font-bold text-amber-400" x-text="analyzedVisualFormats.extra_tall_pct + '%'"></span>
              </div>
              <div class="flex items-center justify-between text-xs">
                <span class="text-slate-500">Video & Idea Pins</span>
                <span class="font-mono tabular-nums font-bold text-cyan-500" x-text="analyzedVisualFormats.video_idea_pct + '%'"></span>
              </div>
            </div>
          </div>

          <!-- 4: Opportunity Verdict -->
          <div class="p-5 rounded-3xl bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200/80 dark:border-[#27272A]/80 space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono tabular-nums">Opportunity Verdict</span>
              <div class="w-7 h-7 rounded-xl bg-pink-500/10 text-pink-500 flex items-center justify-center">
                <i data-lucide="trending-up" class="w-3.5 h-3.5"></i>
              </div>
            </div>
            <div class="space-y-1.5">
              <div class="text-xs font-black truncate" x-text="selectedKeywordDetails?.intelligence?.opportunity?.badge || '🟢 Wide Open'"></div>
              <p class="text-[11px] text-slate-500 leading-snug line-clamp-2" x-text="selectedKeywordDetails?.intelligence?.opportunity?.summary || 'Algorithmic Arbitrage target.'"></p>
            </div>
          </div>
        </div>

        <!-- SECTION 1: DOMAIN AUTHORITY & REPEAT FREQUENCY BREAKDOWN -->
        <div class="p-5 rounded-3xl bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200/80 dark:border-[#27272A]/80 space-y-4">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/80 dark:border-[#27272A]">
            <div class="flex items-center space-x-3">
              <div class="w-8 h-8 rounded-xl bg-cyan-500/10 text-cyan-500 flex items-center justify-center">
                <i data-lucide="globe" class="w-4 h-4"></i>
              </div>
              <div>
                <div class="flex items-center space-x-2">
                  <h3 class="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">Domain Authority & Repeat Frequency Breakdown</h3>
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-mono tabular-nums font-bold bg-amber-500/15 text-amber-500 border border-amber-500/30"
                        x-text="repeatedDomainsCount + ' Repeated Domains'"></span>
                </div>
                <p class="text-xs text-slate-500 mt-0.5">Footprint analysis of websites ranking in organic SERP. Multi-pin presence indicates authority concentration or programmatic scale.</p>
              </div>
            </div>

            <div class="flex items-center space-x-2 flex-wrap gap-2">
              <!-- Search Domain -->
              <div class="relative">
                <input type="text"
                       x-model="domainSearch"
                       @input="domainPage = 1"
                       placeholder="Filter domains..."
                       class="px-3 py-1.5 pl-8 rounded-xl text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 w-40 sm:w-48 font-sans">
                <span class="absolute left-2.5 top-2 text-xs text-slate-400">🔍</span>
                <button x-show="domainSearch" @click="domainSearch = ''; domainPage = 1" class="absolute right-2.5 top-1.5 text-xs text-slate-400 hover:text-slate-600 cursor-pointer">✕</button>
              </div>

              <span class="text-xs text-slate-500 font-mono tabular-nums" x-text="filteredDomainsList().length + ' Domains'"></span>

              <template x-if="activeDomainFilter">
                <button @click="activeDomainFilter = ''" class="px-2 py-1 rounded-xl text-[11px] font-bold bg-rose-500/15 text-rose-500 hover:bg-rose-500/25 transition flex items-center space-x-1 cursor-pointer">
                  <i data-lucide="x" class="w-3 h-3"></i>
                  <span>Clear Filter</span>
                </button>
              </template>
            </div>
          </div>

          <!-- Domain Table -->
          <div class="overflow-x-auto rounded-2xl border border-slate-200 dark:border-[#27272A]">
            <table class="w-full text-left text-xs">
              <thead class="bg-slate-100/70 dark:bg-slate-900/80 text-slate-500 uppercase font-mono tabular-nums text-[10px] tracking-wider border-b border-slate-200 dark:border-[#27272A]">
                <tr>
                  <th class="py-3 px-3 w-12 text-center">#</th>
                  <th class="py-3 px-4">Domain Name</th>
                  <th class="py-3 px-3 text-center">Ranking Pins</th>
                  <th class="py-3 px-4">SERP Share</th>
                  <th class="py-3 px-3 text-right">Total Saves</th>
                  <th class="py-3 px-3 text-center">Best Rank</th>
                  <th class="py-3 px-3 text-center w-28">Action</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-200/80 dark:divide-slate-800/80 bg-white dark:bg-[#121215]">
                <template x-for="(dom, idx) in paginatedDomainsList()" :key="dom.domain">
                  <tr class="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition">
                    <td class="py-3 px-3 text-center font-mono tabular-nums text-slate-400 font-bold" x-text="((domainPage - 1) * domainPageSize) + idx + 1"></td>
                    <td class="py-3 px-4">
                      <div class="flex items-center space-x-2">
                        <a :href="'https://' + dom.domain" target="_blank" rel="noopener noreferrer"
                           class="font-mono tabular-nums font-bold text-slate-900 dark:text-white hover:text-cyan-500 dark:hover:text-cyan-400 transition flex items-center space-x-1.5 group">
                          <span x-text="dom.domain"></span>
                          <i data-lucide="external-link" class="w-3 h-3 text-slate-400 group-hover:text-cyan-400 transition"></i>
                        </a>
                        <template x-if="dom.pin_count > 1">
                          <span class="px-2 py-0.5 rounded-full text-[9px] font-mono tabular-nums font-black bg-amber-500/15 text-amber-500 border border-amber-500/30"
                                x-text="'🔥 ' + dom.pin_count + ' Pins'"></span>
                        </template>
                      </div>
                    </td>
                    <td class="py-3 px-3 text-center">
                      <span class="px-2 py-0.5 rounded-lg text-xs font-mono tabular-nums font-bold"
                            :class="dom.pin_count > 1 ? 'bg-amber-500/15 text-amber-500 font-black' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'"
                            x-text="dom.pin_count"></span>
                    </td>
                    <td class="py-3 px-4">
                      <div class="space-y-1 max-w-[140px]">
                        <div class="flex items-center justify-between text-[11px] font-mono tabular-nums font-bold">
                          <span class="text-purple-400" x-text="dom.share_pct + '%'"></span>
                        </div>
                        <div class="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div class="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full transition-all duration-300"
                               :style="'width: ' + Math.min(100, dom.share_pct * 2.5) + '%'"></div>
                        </div>
                      </div>
                    </td>
                    <td class="py-3 px-3 text-right font-mono tabular-nums font-bold text-emerald-500" x-text="formatNumber(dom.total_saves)"></td>
                    <td class="py-3 px-3 text-center">
                      <span class="px-2 py-0.5 rounded-lg text-[11px] font-mono tabular-nums font-bold"
                            :class="dom.best_rank <= 5 ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30' : (dom.best_rank <= 20 ? 'bg-cyan-500/15 text-cyan-500' : 'bg-slate-100 dark:bg-slate-800 text-slate-400')"
                            x-text="'#' + dom.best_rank"></span>
                    </td>
                    <td class="py-3 px-3 text-center">
                      <button @click="filterByDomain(dom.domain)"
                              class="px-2.5 py-1 rounded-xl text-[11px] font-bold font-mono tabular-nums transition flex items-center justify-center space-x-1 w-full cursor-pointer"
                              :class="activeDomainFilter === dom.domain.toLowerCase() ? 'bg-cyan-600 text-white shadow-xs' : 'bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border border-cyan-500/25'">
                        <i data-lucide="filter" class="w-3 h-3"></i>
                        <span x-text="activeDomainFilter === dom.domain.toLowerCase() ? 'Filtered' : 'Filter Pins'"></span>
                      </button>
                    </td>
                  </tr>
                </template>

                <template x-if="filteredDomainsList().length === 0">
                  <tr>
                    <td colspan="7" class="py-8 text-center text-xs text-slate-400 font-mono tabular-nums">
                      No domain data matches current search filter.
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>

          <!-- Domain Pagination Footer -->
          <div x-show="filteredDomainsList().length > domainPageSize" class="flex items-center justify-between p-3 rounded-2xl bg-white/60 dark:bg-slate-950/40 border border-slate-200 dark:border-[#27272A] text-xs font-mono tabular-nums">
            <span class="text-slate-500 dark:text-slate-400"
                  x-text="'Showing ' + (((domainPage - 1) * domainPageSize) + 1) + '-' + Math.min(domainPage * domainPageSize, filteredDomainsList().length) + ' of ' + filteredDomainsList().length + ' domains'"></span>
            <div class="flex items-center gap-1.5">
              <button :disabled="domainPage <= 1" @click="domainPage--" class="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-slate-900 disabled:opacity-40 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition">← Prev</button>
              <span class="px-2 py-1 font-bold text-slate-700 dark:text-slate-300" x-text="domainPage + ' / ' + totalDomainsPages()"></span>
              <button :disabled="domainPage >= totalDomainsPages()" @click="domainPage++" class="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-slate-900 disabled:opacity-40 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition">Next →</button>
            </div>
          </div>
        </div>

        <!-- SECTION 2: VISUAL ANNOTATIONS CROSSOVER HUB & CO-OCCURRING POWER PAIRS -->
        <div class="p-5 rounded-3xl bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200/80 dark:border-[#27272A]/80 space-y-5">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/80 dark:border-[#27272A]">
            <div class="flex items-center space-x-3">
              <div class="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center">
                <i data-lucide="sparkles" class="w-4 h-4"></i>
              </div>
              <div>
                <div class="flex items-center space-x-2">
                  <h3 class="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">Visual Annotations Crossover Hub</h3>
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-mono tabular-nums font-bold bg-purple-500/15 text-purple-400 border border-purple-500/30"
                        x-text="computeSerpPowerPairs().length + ' Power Pairs Computed'"></span>
                </div>
                <p class="text-xs text-slate-500 mt-0.5">Computer-vision tag co-occurrences, intra-SERP algorithmic lift, and visual prompt blueprint combinations.</p>
              </div>
            </div>

            <template x-if="activeVisualTagFilter">
              <button @click="activeVisualTagFilter = ''" class="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-rose-500/15 text-rose-500 hover:bg-rose-500/25 transition flex items-center space-x-1 cursor-pointer">
                <i data-lucide="x" class="w-3 h-3"></i>
                <span x-text="'Clear Tag #' + activeVisualTagFilter"></span>
              </button>
            </template>
          </div>

          <!-- Subsection A: Co-Occurring Power Pairs Grid -->
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono tabular-nums">Co-Occurring Visual Power Pairs (Algorithmic Lift)</h4>
              <span class="text-[10px] text-slate-400 font-mono tabular-nums">Top combinations with high intra-SERP affinity</span>
            </div>

            <template x-if="computeSerpPowerPairs().length > 0">
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <template x-for="(pair, idx) in computeSerpPowerPairs()" :key="idx">
                  <div class="p-3.5 rounded-2xl bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] flex flex-col justify-between space-y-2.5 hover:border-purple-500/40 transition group">
                    <div class="space-y-2">
                      <div class="flex items-center justify-between">
                        <span class="px-2 py-0.5 rounded-md text-[9px] font-mono tabular-nums font-black bg-purple-500/15 text-purple-400 border border-purple-500/30"
                              x-text="pair.lift + 'x Lift'"></span>
                        <span class="text-[9px] font-mono tabular-nums text-slate-400" x-text="pair.count + ' Pins (' + pair.supportPct + '%)'"></span>
                      </div>
                      <div class="flex items-center space-x-1.5 text-xs font-bold text-slate-900 dark:text-white truncate">
                        <button @click="filterByVisualTag(pair.tagA)" class="capitalize text-emerald-500 hover:underline truncate cursor-pointer" :title="'Filter SERP: #' + pair.tagA" x-text="pair.tagA"></button>
                        <span class="text-slate-400">+</span>
                        <button @click="filterByVisualTag(pair.tagB)" class="capitalize text-purple-400 hover:underline truncate cursor-pointer" :title="'Filter SERP: #' + pair.tagB" x-text="pair.tagB"></button>
                      </div>
                    </div>
                    <button @click="copySerpVisualBlueprint(pair)"
                            class="w-full py-1.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 text-[10px] font-bold font-mono tabular-nums transition flex items-center justify-center space-x-1 cursor-pointer">
                      <i data-lucide="copy" class="w-3 h-3"></i>
                      <span>📋 Copy Visual Blueprint</span>
                    </button>
                  </div>
                </template>
              </div>
            </template>

            <template x-if="computeSerpPowerPairs().length === 0">
              <div class="py-6 text-center text-xs text-slate-400 font-mono tabular-nums rounded-2xl bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A]">
                Indexing visual tags... Co-occurring power pairs require at least 2 pins with shared visual annotations.
              </div>
            </template>
          </div>

          <!-- Unified Suite: Computer Vision Signals & Visual Anchors -->
          <div class="space-y-4 pt-3 border-t border-slate-200/80 dark:border-[#27272A]">
            <!-- Header with Title, Search, Tier Pills, and View Switcher -->
            <div class="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <div class="flex items-center space-x-2">
                  <h4 class="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white font-mono tabular-nums">Computer Vision Signals & Visual Anchors</h4>
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-mono tabular-nums font-bold bg-purple-500/15 text-purple-400 border border-purple-500/30"
                        x-text="filteredAnchorsList().length + ' Anchors'"></span>
                </div>
                <p class="text-xs text-slate-500 mt-0.5">Semantic AI entity tags detected by Pinterest Computer Vision across ranking pins. Click any anchor to isolate ranking SERP pins.</p>
              </div>

              <div class="flex items-center gap-2 flex-wrap">
                <!-- Search within Anchors -->
                <div class="relative">
                  <input type="text"
                         x-model="anchorsSearch"
                         @input="anchorsPage = 1"
                         placeholder="Filter anchors (e.g. food, dress)..."
                         class="px-3 py-1.5 pl-8 rounded-xl text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500/30 w-44 sm:w-52 font-sans">
                  <span class="absolute left-2.5 top-2 text-xs text-slate-400">🔍</span>
                  <button x-show="anchorsSearch" @click="anchorsSearch = ''; anchorsPage = 1" class="absolute right-2.5 top-1.5 text-xs text-slate-400 hover:text-slate-600 cursor-pointer">✕</button>
                </div>

                <!-- Tier Filter Pills -->
                <div class="flex items-center p-0.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-xs font-mono tabular-nums">
                  <button @click="anchorsTier = 'all'; anchorsPage = 1"
                          :class="anchorsTier === 'all' ? 'bg-purple-600 text-white font-bold shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'"
                          class="px-2 py-1 rounded-lg transition cursor-pointer">
                    All
                  </button>
                  <button @click="anchorsTier = 'high'; anchorsPage = 1"
                          :class="anchorsTier === 'high' ? 'bg-purple-600 text-white font-bold shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'"
                          class="px-2 py-1 rounded-lg transition cursor-pointer" title="Anchors present on >= 10 pins">
                    High (≥10)
                  </button>
                  <button @click="anchorsTier = 'core'; anchorsPage = 1"
                          :class="anchorsTier === 'core' ? 'bg-purple-600 text-white font-bold shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'"
                          class="px-2 py-1 rounded-lg transition cursor-pointer" title="Anchors present on >= 5 pins">
                    Core (≥5)
                  </button>
                </div>

                <!-- View Switcher (Cloud / Cards / Table) -->
                <div class="flex items-center p-0.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-xs font-mono tabular-nums">
                  <button @click="anchorsView = 'cloud'"
                          :class="anchorsView === 'cloud' ? 'bg-purple-600 text-white font-bold shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'"
                          class="px-2.5 py-1 rounded-lg transition flex items-center gap-1.5 cursor-pointer" title="Semantic Tag Cloud">
                    <span>☁️</span>
                    <span>Cloud</span>
                  </button>
                  <button @click="anchorsView = 'cards'"
                          :class="anchorsView === 'cards' ? 'bg-purple-600 text-white font-bold shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'"
                          class="px-2.5 py-1 rounded-lg transition flex items-center gap-1.5 cursor-pointer" title="Cards Grid">
                    <span>🎴</span>
                    <span>Cards</span>
                  </button>
                  <button @click="anchorsView = 'table'"
                          :class="anchorsView === 'table' ? 'bg-purple-600 text-white font-bold shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'"
                          class="px-2.5 py-1 rounded-lg transition flex items-center gap-1.5 cursor-pointer" title="Full Paginated Table">
                    <span>📊</span>
                    <span>Table</span>
                  </button>
                </div>
              </div>
            </div>

            <!-- VIEW 1: SEMANTIC CLOUD VIEW (DEFAULT) -->
            <div x-show="anchorsView === 'cloud' && filteredAnchorsList().length > 0"
                 class="p-5 rounded-2xl bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] space-y-3">
              <div class="flex items-center justify-between text-xs text-slate-400 font-mono tabular-nums pb-2 border-b border-slate-100 dark:border-[#27272A]/80">
                <span>Weighted Semantic Cloud (Visual weight scaled by pin occurrence frequency)</span>
                <span class="text-[11px] text-purple-400">Click any tag to filter SERP</span>
              </div>
              <div class="flex flex-wrap gap-2 items-center justify-center py-4">
                <template x-for="anchor in filteredAnchorsList().slice(0, 120)" :key="anchor.tag">
                  <button @click="filterByVisualTag(anchor.tag)"
                          class="rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5"
                          :class="[
                            activeVisualTagFilter === anchor.tag.toLowerCase() ? 'ring-2 ring-purple-500 bg-purple-600 text-white shadow-md' : '',
                            anchor.count >= 20
                              ? 'px-3.5 py-1.5 text-sm bg-purple-500/20 text-purple-600 dark:text-purple-300 border border-purple-500/40 hover:bg-purple-500/30 shadow-xs'
                              : (anchor.count >= 8
                                ? 'px-3 py-1 text-xs bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/25'
                                : 'px-2.5 py-0.5 text-[11px] bg-slate-100/80 dark:bg-slate-900/80 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#27272A] hover:border-purple-400')
                          ]">
                    <span x-text="'#' + anchor.tag"></span>
                    <span class="text-[9px] font-mono tabular-nums opacity-75 px-1 py-0.2 rounded bg-black/10 dark:bg-white/10" x-text="anchor.count"></span>
                  </button>
                </template>
              </div>
            </div>

            <!-- VIEW 2: CARDS GRID VIEW -->
            <div x-show="anchorsView === 'cards' && filteredAnchorsList().length > 0" class="space-y-4">
              <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                <template x-for="(anchor, idx) in filteredAnchorsList().slice(0, anchorsLimit)" :key="anchor.tag">
                  <button @click="filterByVisualTag(anchor.tag)"
                          class="p-2.5 rounded-2xl bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] text-left hover:border-purple-500/40 transition cursor-pointer flex flex-col justify-between group shadow-xs"
                          :class="activeVisualTagFilter === anchor.tag.toLowerCase() ? 'border-purple-500 ring-2 ring-purple-500/20 bg-purple-500/5' : ''">
                    <div class="flex items-center justify-between text-[10px] font-mono tabular-nums text-slate-400 mb-1">
                      <span x-text="'#' + (idx + 1)"></span>
                      <span class="font-bold text-purple-600 dark:text-purple-400" x-text="anchor.count + ' Pins'"></span>
                    </div>
                    <div class="text-xs font-bold text-slate-900 dark:text-white capitalize truncate group-hover:text-purple-500 transition" x-text="anchor.tag"></div>
                  </button>
                </template>
              </div>

              <!-- Cards Expansion Controls -->
              <div class="flex items-center justify-between p-3 rounded-2xl bg-white/60 dark:bg-[#121215]/60 border border-slate-200 dark:border-[#27272A] text-xs">
                <span class="font-mono tabular-nums text-slate-500 dark:text-slate-400"
                      x-text="'Showing ' + Math.min(anchorsLimit, filteredAnchorsList().length) + ' of ' + filteredAnchorsList().length + ' Visual Anchors'"></span>
                <div class="flex items-center gap-2 font-mono tabular-nums">
                  <button x-show="anchorsLimit < filteredAnchorsList().length"
                          @click="anchorsLimit += 36"
                          class="px-3 py-1.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 font-bold transition cursor-pointer">
                    <span>↓ Show More (+36)</span>
                  </button>
                  <button x-show="anchorsLimit < filteredAnchorsList().length"
                          @click="anchorsLimit = filteredAnchorsList().length"
                          class="px-3 py-1.5 rounded-xl bg-slate-200/80 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold transition cursor-pointer">
                    <span>Show All (<span x-text="filteredAnchorsList().length"></span>)</span>
                  </button>
                  <button x-show="anchorsLimit > 24"
                          @click="anchorsLimit = 24"
                          class="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 font-bold transition cursor-pointer">
                    <span>↑ Collapse to 24</span>
                  </button>
                </div>
              </div>
            </div>

            <!-- VIEW 3: TABLE VIEW -->
            <div x-show="anchorsView === 'table' && filteredAnchorsList().length > 0" class="space-y-3">
              <div class="overflow-x-auto rounded-2xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215]">
                <table class="w-full text-left text-xs font-mono tabular-nums">
                  <thead class="bg-slate-100/70 dark:bg-slate-900/80 border-b border-slate-200 dark:border-[#27272A] text-slate-500 dark:text-slate-400 uppercase text-[10px]">
                    <tr>
                      <th class="p-3 w-16 text-center">Rank #</th>
                      <th class="p-3">Visual Anchor Tag</th>
                      <th class="p-3">Pins Frequency</th>
                      <th class="p-3">Intra-SERP Share</th>
                      <th class="p-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-200/80 dark:divide-slate-800/80 text-slate-700 dark:text-slate-300">
                    <template x-for="(anchor, idx) in paginatedAnchorsTable()" :key="anchor.tag">
                      <tr class="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                        <td class="p-3 text-center text-slate-400 font-mono tabular-nums" x-text="'#' + (((anchorsPage - 1) * anchorsPageSize) + idx + 1)"></td>
                        <td class="p-3">
                          <button @click="filterByVisualTag(anchor.tag)"
                                  class="font-bold text-slate-900 dark:text-white hover:text-purple-600 dark:hover:text-purple-400 hover:underline cursor-pointer flex items-center gap-1.5 text-left capitalize">
                            <span>🏷️</span>
                            <span x-text="anchor.tag"></span>
                          </button>
                        </td>
                        <td class="p-3">
                          <div class="flex items-center gap-2">
                            <div class="w-24 bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                              <div class="h-full rounded-full bg-gradient-to-r from-purple-500 to-indigo-500"
                                   :style="'width: ' + Math.min(100, Math.round((anchor.count / (coreAnchorsList[0]?.count || 1)) * 100)) + '%'"></div>
                            </div>
                            <span class="font-bold text-purple-600 dark:text-purple-400 font-mono tabular-nums" x-text="anchor.count + ' pins'"></span>
                          </div>
                        </td>
                        <td class="p-3 text-slate-500 dark:text-slate-400 font-mono tabular-nums"
                            x-text="((anchor.count / (totalAnalyzedPinsCount || 1)) * 100).toFixed(1) + '%'"></td>
                        <td class="p-3 text-right">
                          <button @click="filterByVisualTag(anchor.tag)"
                                  class="px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors shadow-2xs cursor-pointer"
                                  :class="activeVisualTagFilter === anchor.tag.toLowerCase() ? 'bg-purple-600 text-white font-bold' : 'bg-purple-500/10 hover:bg-purple-600 hover:text-white text-purple-600 dark:text-purple-400 border border-purple-500/20'">
                            <span x-text="activeVisualTagFilter === anchor.tag.toLowerCase() ? 'Filtered ✓' : 'Filter Pins →'"></span>
                          </button>
                        </td>
                      </tr>
                    </template>
                  </tbody>
                </table>
              </div>

              <!-- Anchors Table Pagination Footer -->
              <div class="flex items-center justify-between p-3 rounded-2xl bg-white/60 dark:bg-[#121215]/60 border border-slate-200 dark:border-[#27272A] text-xs font-mono tabular-nums">
                <span class="text-slate-500 dark:text-slate-400"
                      x-text="'Page ' + anchorsPage + ' of ' + totalAnchorsPages() + ' (' + filteredAnchorsList().length + ' anchors)'"></span>
                <div class="flex items-center gap-1.5">
                  <button :disabled="anchorsPage <= 1" @click="anchorsPage--" class="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-slate-900 disabled:opacity-40 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition">← Prev</button>
                  <span class="px-2 py-1 font-bold text-slate-700 dark:text-slate-300" x-text="anchorsPage + ' / ' + totalAnchorsPages()"></span>
                  <button :disabled="anchorsPage >= totalAnchorsPages()" @click="anchorsPage++" class="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-slate-900 disabled:opacity-40 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition">Next →</button>
                </div>
              </div>
            </div>

            <!-- Empty State for Visual Anchors -->
            <div x-show="filteredAnchorsList().length === 0" class="py-8 text-center text-xs text-slate-400 font-mono tabular-nums rounded-2xl bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A]">
              No visual anchors match current search or tier filter.
            </div>
          </div>

        </div>

      </div>

      <!-- DEPRECATED DISPLACED TAB - INTEGRATED INTO SERP MATRIX -->
      <div x-show="activeTab === 'dropped'" class="hidden">
        
        <!-- Vault Header & Growth Pace Ribbon (Image 1 Parity) -->
        <div class="p-4 sm:p-5 border-b border-slate-200/80 dark:border-[#27272A]/80 flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-900/30">
          
          <div class="space-y-1">
            <div class="flex items-center space-x-2">
              <i data-lucide="archive" class="w-4 h-4 text-rose-500"></i>
              <h3 class="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">Displaced Pins Vault</h3>
              <span class="px-2 py-0.5 rounded-full text-[10px] font-mono tabular-nums font-bold bg-rose-500/15 text-rose-600 dark:text-rose-400"
                    x-text="filteredDisplacedPins.length + ' Tracked in Vault'"></span>
            </div>
            <p class="text-xs text-slate-500">Pins that dropped out of the active SERP reach — monitored daily for engagement growth and vacuum ranking opportunities</p>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            
            <!-- Growth Pace Selector -->
            <div class="flex items-center p-1 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] gap-1">
              <button @click="growthPaceFilter = '24h'"
                      class="px-2.5 py-1 rounded-xl text-xs font-bold transition cursor-pointer"
                      :class="growthPaceFilter === '24h' ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/40 shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'">
                🔥 Last 24 Hours
              </button>
              <button @click="growthPaceFilter = '3d'"
                      class="px-2.5 py-1 rounded-xl text-xs font-bold transition cursor-pointer"
                      :class="growthPaceFilter === '3d' ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/40 shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'">
                ⏱ Last 3 Days
              </button>
              <button @click="growthPaceFilter = '7d'"
                      class="px-2.5 py-1 rounded-xl text-xs font-bold transition cursor-pointer"
                      :class="growthPaceFilter === '7d' ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/40 shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'">
                📅 Last 7 Days
              </button>
              <button @click="growthPaceFilter = 'all'"
                      class="px-2.5 py-1 rounded-xl text-xs font-bold transition cursor-pointer"
                      :class="growthPaceFilter === 'all' ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/40 shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'">
                ⭐ All-Time Total
              </button>
            </div>

            <!-- Cards vs Table Toggle -->
            <div class="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-[#27272A]">
              <button @click="viewMode = 'table'"
                      class="px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center space-x-1 cursor-pointer"
                      :class="viewMode === 'table' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'">
                <i data-lucide="table" class="w-3.5 h-3.5"></i>
                <span>Table</span>
              </button>
              <button @click="viewMode = 'cards'"
                      class="px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center space-x-1 cursor-pointer"
                      :class="viewMode === 'cards' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'">
                <i data-lucide="layout-grid" class="w-3.5 h-3.5"></i>
                <span>Cards</span>
              </button>
            </div>

            <!-- Status Dropdown -->
            <select x-model="displacedStatusFilter" @change="fetchDisplacedPins()"
                    class="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none">
              <option value="ALL">All Vault Pins</option>
              <option value="displaced_active">Displaced Active</option>
              <option value="re_entered_serp">Resurged to SERP</option>
            </select>

            <button @click="fetchDisplacedPins()"
                    class="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition cursor-pointer"
                    title="Refresh Vault">
              <i data-lucide="refresh-cw" class="w-3.5 h-3.5" :class="isDisplacedLoading ? 'animate-spin' : ''"></i>
            </button>
          </div>

        </div>

        <template x-if="isDisplacedLoading">
          <div class="py-16 text-center space-y-3">
            <div class="w-10 h-10 rounded-2xl bg-rose-500/10 text-rose-500 mx-auto flex items-center justify-center">
              <i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i>
            </div>
            <p class="text-xs font-bold text-slate-700 dark:text-slate-300">Auditing Displaced Pins Vault & Vacuum Scores...</p>
          </div>
        </template>

        <template x-if="!isDisplacedLoading && (!filteredDisplacedPins || filteredDisplacedPins.length === 0)">
          <div class="py-16 text-center space-y-3 max-w-md mx-auto p-4">
            <div class="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-500 mx-auto flex items-center justify-center">
              <i data-lucide="shield-check" class="w-6 h-6"></i>
            </div>
            <h4 class="text-sm font-bold text-slate-900 dark:text-white">Zero Pins Displaced</h4>
            <p class="text-xs text-slate-500">All crawled pins currently maintain active positions inside the organic SERP reach.</p>
          </div>
        </template>

        <!-- VAULT TABLE VIEW -->
        <template x-if="!isDisplacedLoading && filteredDisplacedPins && filteredDisplacedPins.length > 0 && viewMode === 'table'">
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="table-sticky-header bg-slate-100/90 dark:bg-[#121215]/90 border-b border-slate-200 dark:border-[#27272A] text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  <th class="py-3.5 px-3 w-10 text-center">
                    <input type="checkbox" @click="toggleSelectAllPins()"
                           :checked="selectedPinIds.length === filteredDisplacedPins.length && filteredDisplacedPins.length > 0"
                           class="w-3.5 h-3.5 rounded text-rose-600 focus:ring-rose-500 border-slate-300 dark:border-[#27272A]">
                  </th>
                  <th class="py-3.5 px-3 w-14">Preview</th>
                  <th class="py-3.5 px-4 min-w-[260px]">Pin Title & ID</th>
                  <th class="py-3.5 px-3 w-32">Status & Rank</th>
                  <th class="py-3.5 px-3 w-32">Vacuum Score</th>
                  <th class="py-3.5 px-3 w-32">Saves & Δ</th>
                  <th class="py-3.5 px-3 w-28">Repins & Δ</th>
                  <th class="py-3.5 px-2 w-20">Comments</th>
                  <th class="py-3.5 px-2 w-20">Shares</th>
                  <th class="py-3.5 px-3 w-28">Velocity</th>
                  <th class="py-3.5 px-3 w-36">Domain Authority</th>
                  <th class="py-3.5 px-3 w-28 text-right">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
                <template x-for="(pin, idx) in filteredDisplacedPins" :key="pin.pin_id">
                  <tr :data-pin-id="pin.pin_id"
                      class="hover:bg-slate-50/80 dark:hover:bg-slate-900/40 transition group cursor-pointer"
                      @click="openPinInspector(pin)">
                    
                    <td class="py-3.5 px-3 text-center" @click.stop>
                      <input type="checkbox" :checked="isPinSelected(pin.pin_id)" @click="togglePinSelection(pin.pin_id)"
                             class="w-3.5 h-3.5 rounded text-rose-600 focus:ring-rose-500 border-slate-300 dark:border-[#27272A]">
                    </td>

                    <td class="py-3.5 px-3">
                      <div class="relative group/img shrink-0">
                        <template x-if="pin.image_url">
                          <img :src="pin.image_url" class="w-10 h-14 rounded-lg object-cover border border-slate-200 dark:border-[#27272A] shadow-xs group-hover/img:scale-105 transition">
                        </template>
                        <template x-if="!pin.image_url">
                          <div class="w-10 h-14 rounded-lg bg-slate-200 dark:bg-slate-800 flex items-center justify-center">
                            <i data-lucide="image" class="w-3.5 h-3.5 text-slate-400"></i>
                          </div>
                        </template>
                      </div>
                    </td>

                    <td class="py-3.5 px-4 min-w-[260px]">
                      <div class="space-y-1">
                        <span class="font-bold text-slate-900 dark:text-white group-hover:text-rose-500 line-clamp-2 block transition"
                              x-text="pin.title || 'Untitled Pin'"></span>
                        <div class="flex items-center flex-wrap gap-1.5 text-[10px] text-slate-400 font-mono tabular-nums">
                          <span class="text-slate-500 dark:text-slate-400 truncate font-mono tabular-nums" x-text="'ID: ' + pin.pin_id"></span>
                          <span class="text-slate-400" x-text="'Displaced: ' + formatDate(pin.displaced_date)"></span>
                          <!-- Method Badge -->
                          <span class="px-1.5 py-0.2 rounded text-[9px] font-mono tabular-nums font-bold border shrink-0"
                                :class="getPinMethodBadgeClass(pin)"
                                :title="'Method: ' + formatPinMethodLabel(pin)"
                                x-text="getPinMethod(pin)"></span>
                          <!-- Created Timestamp / Age Badge -->
                          <template x-if="getPinCreatedDate(pin)">
                            <span class="text-slate-500 dark:text-slate-400 font-mono tabular-nums text-[9px] truncate shrink-0"
                                  :title="'Created: ' + formatPinCreated(pin)"
                                  x-text="'📅 ' + (formatPinAge(pin) || formatPinCreated(pin))"></span>
                          </template>
                        </div>
                      </div>
                    </td>

                    <!-- Status & Last Known Rank -->
                    <td class="py-3.5 px-3 font-mono tabular-nums space-y-1">
                      <template x-if="pin.status === 're_entered_serp'">
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 block w-fit">
                          🟢 Resurged
                        </span>
                      </template>
                      <template x-if="pin.status !== 're_entered_serp'">
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 block w-fit">
                          Dropped Out
                        </span>
                      </template>
                      <span class="text-[10px] text-slate-400 block" x-text="'Was Rank #' + (pin.last_known_rank || '?')"></span>
                    </td>

                    <!-- Vacuum Opportunity Score -->
                    <td class="py-3.5 px-3 font-mono tabular-nums">
                      <span class="px-2.5 py-1 rounded-xl text-xs font-black block w-fit"
                            :class="Number(pin.vacuum_opportunity_score || 0) >= 70 ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40' : (Number(pin.vacuum_opportunity_score || 0) >= 40 ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/40' : 'bg-slate-100 dark:bg-slate-800 text-slate-500')"
                            x-text="(pin.vacuum_opportunity_score || 50) + '/100'"></span>
                    </td>

                    <!-- Saves & Growth Pace Delta -->
                    <td class="py-3.5 px-3 space-y-0.5 font-mono tabular-nums">
                      <div class="font-bold text-slate-900 dark:text-white"
                           x-text="formatNumber(pin.save_count ?? pin.current_saves ?? 0)"></div>
                      <template x-if="getPaceDelta(pin, 'saves') && getPaceDelta(pin, 'saves') !== '0'">
                        <span class="text-[10px] font-bold text-emerald-500 block"
                              x-text="getPaceDelta(pin, 'saves')"></span>
                      </template>
                    </td>

                    <!-- Repins & Growth Pace Delta -->
                    <td class="py-3.5 px-3 space-y-0.5 font-mono tabular-nums">
                      <div class="font-bold text-slate-700 dark:text-slate-300"
                           x-text="formatNumber(pin.repin_count ?? pin.current_repins ?? 0)"></div>
                      <template x-if="getPaceDelta(pin, 'repins') && getPaceDelta(pin, 'repins') !== '0'">
                        <span class="text-[10px] font-bold text-emerald-500 block"
                              x-text="getPaceDelta(pin, 'repins')"></span>
                      </template>
                    </td>

                    <!-- Comments -->
                    <td class="py-3.5 px-2 font-mono tabular-nums text-slate-600 dark:text-slate-400"
                        x-text="pin.comment_count ?? pin.current_comments ?? 0"></td>

                    <!-- Shares -->
                    <td class="py-3.5 px-2 font-mono tabular-nums text-slate-600 dark:text-slate-400"
                        x-text="pin.share_count ?? pin.current_shares ?? 0"></td>

                    <!-- Velocity -->
                    <td class="py-3.5 px-3 font-mono tabular-nums">
                      <span class="px-2 py-0.5 rounded-lg text-xs font-black block w-fit"
                            :class="Number(pin.daily_save_velocity || pin.calculated_velocity || 0) > 0 ? 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'"
                            x-text="(Number(pin.daily_save_velocity || pin.calculated_velocity || 0) > 0 ? '+' : '') + Number(pin.daily_save_velocity || pin.calculated_velocity || 0) + ' /d'"></span>
                    </td>

                    <!-- Domain -->
                    <td class="py-3.5 px-3">
                      <span class="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400 truncate max-w-[130px] block"
                            x-text="pin.domain || 'Pinterest Direct'"></span>
                    </td>

                    <!-- Actions -->
                    <td class="py-3.5 px-3 text-right">
                      <div class="flex items-center justify-end space-x-1" @click.stop>
                        <button @click="openPinInspector(pin)"
                                class="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition cursor-pointer"
                                title="Open Pin Deep Dossier">
                          <i data-lucide="eye" class="w-3.5 h-3.5"></i>
                        </button>
                        <button @click="openVisualLens(pin)"
                                class="p-1.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 transition cursor-pointer"
                                title="Visual Lens Similarity Search">
                          <i data-lucide="camera" class="w-3.5 h-3.5"></i>
                        </button>
                        <a :href="'https://www.pinterest.com/pin/' + pin.pin_id + '/'" target="_blank"
                           class="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-white transition"
                           title="Open Pin on Pinterest">
                          <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                        </a>
                      </div>
                    </td>

                  </tr>
                </template>
              </tbody>
            </table>
          </div>
        </template>

        <!-- VAULT CARDS VIEW -->
        <template x-if="!isDisplacedLoading && filteredDisplacedPins && filteredDisplacedPins.length > 0 && viewMode === 'cards'">
          <div class="p-5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            <template x-for="pin in filteredDisplacedPins" :key="pin.pin_id">
              <div :data-pin-id="pin.pin_id"
                   @click="openPinInspector(pin)"
                   class="p-4 rounded-3xl bg-slate-50/70 dark:bg-slate-900/40 border border-slate-200/80 dark:border-[#27272A] hover:border-rose-500/40 transition group cursor-pointer flex flex-col justify-between space-y-3.5">
                
                <div class="space-y-3">
                  <div class="relative rounded-2xl overflow-hidden aspect-[2/3] max-h-56 bg-slate-200 dark:bg-slate-800">
                    <template x-if="pin.image_url">
                      <img :src="pin.image_url" class="w-full h-full object-cover group-hover:scale-105 transition duration-300">
                    </template>
                    <div class="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-lg bg-slate-950/80 text-white font-mono tabular-nums font-black text-xs backdrop-blur-xs"
                         x-text="'Was #' + (pin.last_known_rank || '?')"></div>
                    <div class="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md text-[10px] font-mono tabular-nums backdrop-blur-xs uppercase font-bold"
                         :class="pin.status === 're_entered_serp' ? 'bg-emerald-950/80 text-emerald-400' : 'bg-rose-950/80 text-rose-300'"
                         x-text="pin.status === 're_entered_serp' ? 'Resurged' : 'Displaced'"></div>
                  </div>

                  <div class="space-y-1">
                    <h4 class="text-xs font-bold text-slate-900 dark:text-white group-hover:text-rose-500 line-clamp-2 leading-snug transition"
                        x-text="pin.title || 'Untitled Pin'"></h4>
                    <div class="flex items-center justify-between text-[10px] font-mono tabular-nums text-slate-400">
                      <div class="flex items-center space-x-1.5 truncate">
                        <span x-text="'ID: ' + pin.pin_id"></span>
                        <span class="px-1.5 py-0.2 rounded text-[8px] font-mono tabular-nums font-bold border shrink-0"
                              :class="getPinMethodBadgeClass(pin)"
                              :title="'Method: ' + formatPinMethodLabel(pin)"
                              x-text="getPinMethod(pin)"></span>
                        <template x-if="formatPinAge(pin)">
                          <span class="text-slate-400 text-[9px] shrink-0" :title="'Created: ' + formatPinCreated(pin)" x-text="'📅 ' + formatPinAge(pin)"></span>
                        </template>
                      </div>
                      <span class="text-emerald-500 font-bold shrink-0" x-text="'Vacuum: ' + (pin.vacuum_opportunity_score || 50) + '/100'"></span>
                    </div>
                  </div>
                </div>

                <div class="pt-2.5 border-t border-slate-200/60 dark:border-[#27272A]/60 space-y-2">
                  <div class="flex items-center justify-between text-xs font-mono tabular-nums">
                    <div>
                      <span class="text-slate-400 text-[10px]">Saves:</span>
                      <strong class="text-slate-900 dark:text-white" x-text="formatNumber(pin.save_count ?? pin.current_saves ?? 0)"></strong>
                      <template x-if="getPaceDelta(pin, 'saves') && getPaceDelta(pin, 'saves') !== '0'">
                        <span class="text-emerald-500 text-[10px] font-bold" x-text="getPaceDelta(pin, 'saves')"></span>
                      </template>
                    </div>
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold font-mono tabular-nums"
                          :class="Number(pin.daily_save_velocity || pin.calculated_velocity || 0) > 0 ? 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'"
                          x-text="(Number(pin.daily_save_velocity || pin.calculated_velocity || 0) > 0 ? '+' : '') + (pin.daily_save_velocity || pin.calculated_velocity || 0) + ' v/d'"></span>
                  </div>

                  <div class="flex items-center justify-between text-[11px] text-slate-400 pt-1" @click.stop>
                    <span class="truncate max-w-[120px] font-mono tabular-nums text-[10px]" x-text="pin.domain || 'Pinterest'"></span>
                    <div class="flex items-center space-x-1">
                      <button @click="openPinInspector(pin)" class="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-200" title="Dossier">
                        <i data-lucide="eye" class="w-3.5 h-3.5"></i>
                      </button>
                      <button @click="openVisualLens(pin)" class="p-1 rounded hover:bg-purple-500/20 text-slate-400 hover:text-purple-400" title="Visual Lens">
                        <i data-lucide="camera" class="w-3.5 h-3.5"></i>
                      </button>
                      <a :href="'https://www.pinterest.com/pin/' + pin.pin_id + '/'" target="_blank" class="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-white" title="Pinterest">
                        <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                      </a>
                    </div>
                  </div>
                </div>

              </div>
            </template>
          </div>
        </template>

        <!-- Displaced Vault Pagination / Load More Footer -->
        <template x-if="!isDisplacedLoading && displacedVaultPins.length > 0">
          <div class="p-4 border-t border-slate-200/80 dark:border-[#27272A] flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50/50 dark:bg-slate-900/30 rounded-b-3xl">
            <div class="text-xs text-slate-500 font-mono tabular-nums">
              <span>Showing </span>
              <span class="font-bold text-slate-900 dark:text-white" x-text="displacedVaultPins.length"></span>
              <span> of </span>
              <span class="font-bold text-rose-500" x-text="totalDisplacedCount"></span>
              <span> displaced vault pins</span>
            </div>
            <template x-if="displacedVaultPins.length < totalDisplacedCount">
              <button type="button" @click="loadMoreDisplacedPins()"
                      :disabled="isLoadingMoreDisplaced"
                      class="px-4 py-2 rounded-xl text-xs font-bold font-mono tabular-nums bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 transition flex items-center space-x-2 cursor-pointer disabled:opacity-50">
                <template x-if="isLoadingMoreDisplaced">
                  <i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i>
                </template>
                <template x-if="!isLoadingMoreDisplaced">
                  <i data-lucide="arrow-down" class="w-3.5 h-3.5"></i>
                </template>
                <span x-text="isLoadingMoreDisplaced ? 'Loading Displaced Pins...' : ('Load More Displaced Pins (+' + Math.min(24, totalDisplacedCount - displacedVaultPins.length) + ')')"></span>
              </button>
            </template>
            <template x-if="displacedVaultPins.length >= totalDisplacedCount">
              <div class="text-xs font-mono tabular-nums text-emerald-500 font-bold flex items-center space-x-1">
                <i data-lucide="check" class="w-3.5 h-3.5"></i>
                <span>All Displaced Pins Loaded</span>
              </div>
            </template>
          </div>
        </template>

      </div>

      <!-- DEPRECATED CROSSOVER TAB - MIGRATED TO /folders/:id -->
      <div x-show="activeTab === 'crossover'" class="hidden">
        
        <!-- Folder Switcher & Management Strip -->
        <div class="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-slate-100/80 dark:bg-slate-900/60 border border-slate-200 dark:border-[#27272A]">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-xs font-bold text-slate-400 font-mono tabular-nums uppercase tracking-wider mr-1">Folders:</span>
            <template x-for="f in folders" :key="f.id">
              <button @click="selectFolder(f)"
                      class="px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-2 cursor-pointer border"
                      :class="activeFolder?.id === f.id ? 'bg-pink-500/20 text-pink-600 dark:text-pink-300 border-pink-500/50 shadow-xs' : 'bg-white dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-[#27272A] hover:border-slate-400'">
                <span class="w-2.5 h-2.5 rounded-full shrink-0" :style="'background-color: ' + (f.color || '#ec4899')"></span>
                <span x-text="f.name"></span>
                <span class="px-1.5 py-0.2 rounded-full text-[10px] font-mono tabular-nums bg-slate-200 dark:bg-slate-700/60" x-text="f.keyword_count || 0"></span>
              </button>
            </template>
            <button @click="openCreateFolderModal()"
                    class="px-3 py-1.5 rounded-xl text-xs font-bold bg-pink-500/10 hover:bg-pink-500/20 text-pink-600 dark:text-pink-400 border border-pink-500/30 transition flex items-center space-x-1.5 cursor-pointer">
              <i data-lucide="plus" class="w-3.5 h-3.5"></i>
              <span>New Folder</span>
            </button>
          </div>

          <div class="flex items-center space-x-2">
            <button @click="isFolderManagerOpen = true"
                    class="px-3 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-[#27272A] hover:bg-slate-50 dark:hover:bg-slate-700 transition flex items-center space-x-1.5">
              <i data-lucide="settings" class="w-3.5 h-3.5"></i>
              <span>Manage All Folders</span>
            </button>
          </div>
        </div>

        <!-- Empty State: No Folders Yet -->
        <template x-if="folders.length === 0">
          <div class="py-16 text-center space-y-4 max-w-lg mx-auto p-6 rounded-3xl border border-dashed border-slate-300 dark:border-[#27272A] bg-slate-50/50 dark:bg-slate-900/20">
            <div class="w-16 h-16 rounded-3xl bg-pink-500/10 text-pink-500 mx-auto flex items-center justify-center shadow-lg shadow-pink-500/10">
              <i data-lucide="folder-kanban" class="w-8 h-8"></i>
            </div>
            <div class="space-y-1">
              <h3 class="text-base font-black text-slate-900 dark:text-white">Create Your First Campaign Folder</h3>
              <p class="text-xs text-slate-500 max-w-md mx-auto">
                Group related search keywords into topic clusters (e.g. <em>"Comfort Casseroles"</em>, <em>"Quick Dinner Ideas"</em>) to unlock automatic multi-ranking super-pins, universal tag bridges, creator monopoly analysis, and 1-click CSV blueprints.
              </p>
            </div>
            <button @click="openCreateFolderModal()"
                    class="px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white transition shadow-lg shadow-pink-950/20 active:scale-95 flex items-center space-x-2 mx-auto cursor-pointer">
              <i data-lucide="plus-circle" class="w-4 h-4"></i>
              <span>Create Campaign Folder</span>
            </button>
          </div>
        </template>

        <!-- Active Folder Executive Workspace -->
        <template x-if="activeFolder">
          <div class="space-y-6">

            <!-- FOLDER HERO HEADER & METRIC CARDS -->
            <div class="p-6 rounded-3xl bg-gradient-to-br from-white via-pink-50/30 to-purple-50/20 dark:from-[#0c1322] dark:via-slate-900 dark:to-[#111827] border border-pink-500/20 dark:border-pink-500/10 shadow-sm space-y-5">
              
              <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div class="flex items-start sm:items-center space-x-4 min-w-0">
                  <div class="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-black shadow-lg shadow-pink-500/20 shrink-0"
                       :style="'background: linear-gradient(135deg, ' + (activeFolder.color || '#ec4899') + ', #8b5cf6)'">
                    <i data-lucide="folder" class="w-7 h-7"></i>
                  </div>
                  <div class="min-w-0">
                    <div class="flex flex-wrap items-center gap-2.5">
                      <h2 class="text-xl sm:text-2xl font-black text-slate-900 dark:text-white capitalize truncate" x-text="activeFolder.name"></h2>
                      <span class="px-2.5 py-0.5 rounded-full text-[10px] font-mono tabular-nums font-bold bg-pink-500/10 text-pink-600 dark:text-pink-400 border border-pink-500/30">
                        Topic Cluster
                      </span>
                    </div>
                    <p class="text-xs text-slate-500 dark:text-slate-400 mt-1" x-text="activeFolder.description || 'Algorithmic Topic Cluster & Multi-Dimensional Crossover Engine'"></p>
                  </div>
                </div>

                <!-- Action Toolbar -->
                <div class="flex flex-wrap items-center gap-2">
                  <button @click="exportClusterBlueprintCsv()"
                          :disabled="!crossoverData?.topic_cluster_blueprint?.csv_rows"
                          class="px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white transition flex items-center space-x-2 shadow-md shadow-pink-950/20 active:scale-95 disabled:opacity-50 cursor-pointer">
                    <i data-lucide="download" class="w-3.5 h-3.5"></i>
                    <span>1-Click CSV Blueprint</span>
                  </button>

                  <button @click="openAddKeywordsModal()"
                          class="px-3.5 py-2.5 rounded-2xl text-xs font-bold bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-[#27272A] text-slate-700 dark:text-slate-200 transition flex items-center space-x-1.5 cursor-pointer">
                    <i data-lucide="plus" class="w-3.5 h-3.5 text-pink-500"></i>
                    <span>Add Keywords</span>
                  </button>

                  <button @click="fetchFolderCrossover(activeFolder.id)"
                          :disabled="isCrossoverLoading"
                          class="p-2.5 rounded-2xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-[#27272A] text-slate-600 dark:text-slate-300 transition cursor-pointer"
                          title="Recalculate Crossover Matrix">
                    <i data-lucide="refresh-cw" class="w-4 h-4" :class="isCrossoverLoading ? 'animate-spin text-pink-500' : ''"></i>
                  </button>

                  <button @click="deleteCampaignFolder(activeFolder.id)"
                          class="p-2.5 rounded-2xl bg-white dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-slate-200 dark:border-[#27272A] text-rose-500 hover:text-rose-600 transition cursor-pointer"
                          title="Delete Folder">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                  </button>
                </div>
              </div>

              <!-- 6 Executive Folder KPI Cards -->
              <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-3 border-t border-slate-200/60 dark:border-[#27272A]/60">
                <div class="p-3.5 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-[#27272A] space-y-1">
                  <span class="text-[10px] font-mono tabular-nums font-bold uppercase text-slate-400">Keywords</span>
                  <p class="text-xl font-black text-slate-900 dark:text-white font-mono tabular-nums" x-text="crossoverData?.summary?.total_keywords || 0"></p>
                </div>

                <div class="p-3.5 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-[#27272A] space-y-1">
                  <span class="text-[10px] font-mono tabular-nums font-bold uppercase text-slate-400">Unique Pins</span>
                  <p class="text-xl font-black text-cyan-600 dark:text-cyan-400 font-mono tabular-nums" x-text="formatNumber(crossoverData?.summary?.total_unique_pins || 0)"></p>
                </div>

                <div class="p-3.5 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-[#27272A] space-y-1">
                  <span class="text-[10px] font-mono tabular-nums font-bold uppercase text-slate-400">Super-Pins</span>
                  <p class="text-xl font-black text-amber-500 font-mono tabular-nums" x-text="crossoverData?.summary?.super_pins_count || 0"></p>
                </div>

                <div class="p-3.5 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-[#27272A] space-y-1">
                  <span class="text-[10px] font-mono tabular-nums font-bold uppercase text-slate-400">Universal Tags</span>
                  <p class="text-xl font-black text-emerald-500 font-mono tabular-nums" x-text="crossoverData?.summary?.universal_tags_count || 0"></p>
                </div>

                <div class="p-3.5 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-[#27272A] space-y-1">
                  <span class="text-[10px] font-mono tabular-nums font-bold uppercase text-slate-400">Shared Pivots</span>
                  <p class="text-xl font-black text-blue-500 font-mono tabular-nums" x-text="crossoverData?.summary?.shared_pivots_count || 0"></p>
                </div>

                <div class="p-3.5 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-[#27272A] space-y-1">
                  <span class="text-[10px] font-mono tabular-nums font-bold uppercase text-slate-400">Whale Domains</span>
                  <p class="text-xl font-black text-purple-500 font-mono tabular-nums" x-text="crossoverData?.summary?.monopoly_domain_count || 0"></p>
                </div>
              </div>

            </div>

            <!-- Loading State -->
            <template x-if="isCrossoverLoading">
              <div class="py-20 text-center space-y-3 bg-white dark:bg-[#121215] rounded-3xl border border-slate-200 dark:border-[#27272A]">
                <div class="w-12 h-12 rounded-2xl bg-pink-500/10 text-pink-500 mx-auto flex items-center justify-center">
                  <i data-lucide="loader-2" class="w-6 h-6 animate-spin"></i>
                </div>
                <p class="text-sm font-bold text-slate-700 dark:text-slate-300">Computing Multi-Dimensional Crossover Matrix...</p>
                <p class="text-xs text-slate-400 font-mono tabular-nums">Analyzing super-pins overlap, universal tag bridges, domain monopoly & seasonality wave</p>
              </div>
            </template>

            <!-- Fallback Empty State if not loading and no data -->
            <template x-if="!isCrossoverLoading && !crossoverData">
              <div class="py-16 text-center space-y-4 bg-white dark:bg-[#121215] rounded-3xl border border-slate-200 dark:border-[#27272A]">
                <div class="w-12 h-12 rounded-2xl bg-pink-500/10 text-pink-500 mx-auto flex items-center justify-center">
                  <i data-lucide="network" class="w-6 h-6"></i>
                </div>
                <div>
                  <h3 class="text-sm font-bold text-slate-900 dark:text-white" x-text="'No Crossover Data Loaded for ' + activeFolder.name"></h3>
                  <p class="text-xs text-slate-500 mt-1">Click below to compute the multi-dimensional crossover matrix.</p>
                </div>
                <button @click="fetchFolderCrossover(activeFolder.id)" class="px-5 py-2.5 rounded-xl text-xs font-bold bg-pink-600 text-white hover:bg-pink-500 transition cursor-pointer">
                  Compute Crossover Matrix
                </button>
              </div>
            </template>

            <!-- Crossover Content Panels -->
            <template x-if="!isCrossoverLoading && crossoverData">
              <div class="space-y-6">

                <!-- DIMENSION 1: 🌟 MULTI-RANKING SUPER-PINS OVERLAP -->
                <div class="p-6 rounded-3xl bg-white dark:bg-[#121215] border border-slate-200/80 dark:border-[#27272A] shadow-xs space-y-4">
                  <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-[#27272A]/80">
                    <div class="space-y-0.5">
                      <div class="flex items-center space-x-2">
                        <i data-lucide="sparkles" class="w-4 h-4 text-amber-500"></i>
                        <h3 class="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">Multi-Ranking Super-Pins</h3>
                        <span class="px-2 py-0.5 rounded text-[10px] font-mono tabular-nums font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400"
                              x-text="crossoverData.super_pins?.length + ' Pins'"></span>
                      </div>
                      <p class="text-xs text-slate-500">Pins ranking across multiple search queries simultaneously in this cluster. Analyze their visual layouts for winning templates.</p>
                    </div>
                  </div>

                  <template x-if="crossoverData.super_pins?.length === 0">
                    <div class="py-10 text-center text-xs text-slate-400 italic">
                      No overlapping super-pins discovered yet. Crawl more keyword SERPs to populate multi-ranking pins.
                    </div>
                  </template>

                  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    <template x-for="pin in crossoverData.super_pins?.slice(0, 16)" :key="pin.pin_id">
                      <div class="p-3.5 rounded-2xl bg-slate-50/70 dark:bg-slate-900/40 border border-slate-200/80 dark:border-[#27272A] hover:border-pink-500/40 transition group cursor-pointer flex flex-col justify-between space-y-3"
                           @click="openPinInspector(pin)">
                        
                        <div class="flex items-start space-x-3 min-w-0">
                          <template x-if="pin.image_url">
                            <img :src="pin.image_url" class="w-14 h-20 rounded-xl object-cover border border-slate-200 dark:border-[#27272A] shrink-0 group-hover:scale-105 transition shadow-xs">
                          </template>
                          <template x-if="!pin.image_url">
                            <div class="w-14 h-20 rounded-xl bg-slate-200 dark:bg-slate-800 flex items-center justify-center shrink-0">
                              <i data-lucide="image" class="w-4 h-4 text-slate-400"></i>
                            </div>
                          </template>
                          
                          <div class="min-w-0 flex-1 space-y-1">
                            <div class="flex items-center justify-between gap-1">
                              <span class="px-2 py-0.5 rounded text-[9px] font-mono tabular-nums font-bold uppercase"
                                    :class="pin.overlap_count >= 2 ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'"
                                    x-text="pin.overlap_count >= 2 ? (pin.overlap_count + 'x Overlap') : 'Top Rank'"></span>
                              <span class="text-[10px] font-mono tabular-nums font-bold text-slate-700 dark:text-slate-300" x-text="formatNumber(pin.save_count) + ' saves'"></span>
                            </div>
                            <h4 class="text-xs font-bold text-slate-900 dark:text-white line-clamp-2 leading-tight" x-text="pin.title"></h4>
                            <div class="text-[10px] text-slate-400 font-mono tabular-nums truncate" x-text="pin.domain || 'Pinterest Direct'"></div>
                          </div>
                        </div>

                        <!-- Ranked Keywords List -->
                        <div class="pt-2 border-t border-slate-200/60 dark:border-[#27272A]/60 space-y-1">
                          <span class="text-[9px] font-mono tabular-nums font-bold text-slate-400 uppercase">Ranked Queries:</span>
                          <div class="flex flex-wrap gap-1">
                            <template x-for="r in pin.rankings" :key="r.keyword">
                              <template x-if="r.rank_position != null && r.rank_position >= 1">
                                <span class="px-2 py-0.5 rounded text-[10px] font-mono tabular-nums font-bold bg-pink-500/10 text-pink-600 dark:text-pink-400 border border-pink-500/20 truncate max-w-full"
                                      x-text="r.keyword + ' (#' + r.rank_position + ')'"></span>
                              </template>
                            </template>
                          </div>
                        </div>

                      </div>
                    </template>
                  </div>
                </div>

                <!-- DIMENSION 2: 🌉 UNIVERSAL TAG BRIDGES (CV & Semantic Annotations Overlap) -->
                <div class="p-6 rounded-3xl bg-white dark:bg-[#121215] border border-slate-200/80 dark:border-[#27272A] shadow-xs space-y-4">
                  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-[#27272A]/80">
                    <div class="space-y-0.5">
                      <div class="flex items-center space-x-2">
                        <i data-lucide="network" class="w-4 h-4 text-emerald-500"></i>
                        <h3 class="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">Universal Visual Tag Bridges</h3>
                        <span class="px-2 py-0.5 rounded text-[10px] font-mono tabular-nums font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                              x-text="crossoverData.tag_bridges?.length + ' Tags'"></span>
                      </div>
                      <p class="text-xs text-slate-500">Tags and visual entities shared across multiple search terms in this folder. Include these in your Pin descriptions to rank for the entire topic cluster.</p>
                    </div>

                    <button @click="copyAllUniversalTags()"
                            class="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 transition flex items-center space-x-1.5 cursor-pointer shrink-0">
                      <i data-lucide="copy" class="w-3.5 h-3.5"></i>
                      <span>Copy Top Tags Blueprint</span>
                    </button>
                  </div>

                  <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    <template x-for="tag in crossoverData.tag_bridges?.slice(0, 16)" :key="tag.tag">
                      <div class="p-3 rounded-2xl bg-slate-50/70 dark:bg-slate-900/40 border border-slate-200/80 dark:border-[#27272A] space-y-2">
                        <div class="flex items-center justify-between gap-1">
                          <span class="text-xs font-bold text-slate-900 dark:text-white capitalize" x-text="tag.tag"></span>
                          <span class="px-2 py-0.5 rounded text-[10px] font-mono tabular-nums font-bold"
                                :class="tag.overlap_percentage >= 80 ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30' : (tag.overlap_percentage >= 50 ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400' : 'bg-slate-200 dark:bg-slate-800 text-slate-500')"
                                x-text="tag.overlap_percentage + '% (' + tag.keyword_overlap_count + '/' + crossoverData.summary?.total_keywords + ')'"></span>
                        </div>
                        <div class="flex items-center justify-between text-[11px] text-slate-400 font-mono tabular-nums">
                          <span x-text="tag.pin_count + ' pins tagged'"></span>
                          <span x-text="formatNumber(tag.total_saves) + ' saves'"></span>
                        </div>
                      </div>
                    </template>
                  </div>
                </div>

                <!-- TWO COLUMNS: SHARED GUIDED PIVOTS & DOMAIN AUTHORITY -->
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">

                  <!-- DIMENSION 3: 🧭 SHARED GUIDED SEARCH PIVOTS -->
                  <div class="p-6 rounded-3xl bg-white dark:bg-[#121215] border border-slate-200/80 dark:border-[#27272A] shadow-xs space-y-4">
                    <div class="pb-3 border-b border-slate-100 dark:border-[#27272A]/80">
                      <div class="flex items-center space-x-2">
                        <i data-lucide="compass" class="w-4 h-4 text-cyan-500"></i>
                        <h3 class="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">Shared Guided Pivots</h3>
                      </div>
                      <p class="text-xs text-slate-500 mt-0.5">Semantic search capsules connecting multiple keywords in this cluster.</p>
                    </div>

                    <div class="flex flex-wrap gap-2 max-h-72 overflow-y-auto">
                      <template x-for="pivot in crossoverData.guided_pivots" :key="pivot.term">
                        <div class="px-3 py-1.5 rounded-xl border flex items-center space-x-2 text-xs transition hover:scale-105 cursor-pointer"
                             :title="'Shared by ' + pivot.shared_count + ' keywords: ' + (pivot.shared_keywords?.map(k => k.keyword || k)?.join(', ') || '')"
                             :class="pivot.shared_count >= 2 ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-600 dark:text-cyan-400 font-bold' : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-[#27272A] text-slate-700 dark:text-slate-300'">
                          <span class="font-bold" x-text="pivot.display_label"></span>
                          <span class="px-1.5 py-0.2 rounded-full text-[10px] font-mono tabular-nums"
                                :class="pivot.shared_count >= 2 ? 'bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 font-bold' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'"
                                x-text="pivot.shared_count + ' kw'"></span>
                        </div>
                      </template>
                    </div>
                  </div>

                  <!-- DIMENSION 4: 👑 DOMAIN & CREATOR MONOPOLY INDEX -->
                  <div class="p-6 rounded-3xl bg-white dark:bg-[#121215] border border-slate-200/80 dark:border-[#27272A] shadow-xs space-y-4">
                    <div class="pb-3 border-b border-slate-100 dark:border-[#27272A]/80">
                      <div class="flex items-center space-x-2">
                        <i data-lucide="crown" class="w-4 h-4 text-purple-500"></i>
                        <h3 class="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">Authority Domain Monopoly</h3>
                      </div>
                      <p class="text-xs text-slate-500 mt-0.5">Top websites dominating the search rankings across your entire cluster.</p>
                    </div>

                    <div class="space-y-2 max-h-72 overflow-y-auto">
                      <template x-for="d in crossoverData.domain_monopoly?.slice(0, 8)" :key="d.domain">
                        <div class="p-2.5 rounded-xl bg-slate-50/70 dark:bg-slate-900/40 border border-slate-200/80 dark:border-[#27272A] flex items-center justify-between text-xs">
                          <div class="min-w-0">
                            <p class="font-bold text-slate-900 dark:text-white truncate" x-text="d.domain"></p>
                            <span class="text-[10px] text-slate-400 font-mono tabular-nums" x-text="d.keywords_count + ' keywords covered (' + d.overlap_percentage + '%)'"></span>
                          </div>
                          <div class="text-right shrink-0">
                            <span class="font-mono tabular-nums font-bold text-purple-600 dark:text-purple-400" x-text="formatNumber(d.total_saves) + ' saves'"></span>
                            <p class="text-[10px] text-slate-400 font-mono tabular-nums" x-text="d.pin_count + ' pins'"></p>
                          </div>
                        </div>
                      </template>
                    </div>
                  </div>

                </div>

                <!-- DIMENSION 5: 📈 COMPOSITE 52-WEEK SEASONALITY WAVE -->
                <div class="p-6 rounded-3xl bg-white dark:bg-[#121215] border border-slate-200/80 dark:border-[#27272A] shadow-xs space-y-4">
                  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-[#27272A]/80">
                    <div class="space-y-0.5">
                      <div class="flex items-center space-x-2">
                        <i data-lucide="trending-up" class="w-4 h-4 text-blue-500"></i>
                        <h3 class="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">Composite 52-Week Seasonality Wave</h3>
                      </div>
                      <p class="text-xs text-slate-500">Joint demand curve aggregated across all keywords in this cluster.</p>
                    </div>

                    <div class="flex items-center space-x-3">
                      <div class="px-3 py-1.5 rounded-xl bg-blue-500/10 border border-blue-500/30 text-xs">
                        <span class="text-slate-400">Peak Months:</span>
                        <span class="font-bold text-blue-600 dark:text-blue-400 font-mono tabular-nums ml-1"
                              x-text="crossoverData.seasonality?.peak_months?.join(', ') || 'Evergreen'"></span>
                      </div>
                      <div class="px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs">
                        <span class="text-slate-400">Launch Window:</span>
                        <span class="font-bold text-emerald-600 dark:text-emerald-400 font-mono tabular-nums ml-1"
                              x-text="crossoverData.seasonality?.recommended_launch_window"></span>
                      </div>
                    </div>
                  </div>

                  <!-- Wave Chart -->
                  <div class="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
                    <svg class="w-full h-36 overflow-visible" viewBox="0 0 800 180" preserveAspectRatio="none">
                      <defs>
                        <linearGradient id="crossoverGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.4"/>
                          <stop offset="100%" stop-color="#3b82f6" stop-opacity="0"/>
                        </linearGradient>
                      </defs>
                      <path :d="getTrendsAreaPath(crossoverData.seasonality?.composite_wave?.map(w => w.score) || []).area" fill="url(#crossoverGrad)" />
                      <path :d="getTrendsAreaPath(crossoverData.seasonality?.composite_wave?.map(w => w.score) || []).line" fill="none" stroke="#3b82f6" stroke-width="2.5" stroke-linecap="round"/>
                    </svg>

                    <!-- 12-Month Timeline Axis with Dynamic Peak Highlights (Rolling Chronological) -->
                    <div class="grid grid-cols-12 text-center text-[10px] font-mono tabular-nums pt-2 border-t border-slate-800/80">
                      <template x-for="m in (crossoverData.seasonality?.rolling_months || ['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'])" :key="m">
                        <span :class="crossoverData.seasonality?.peak_months?.includes(m) ? 'text-blue-400 font-bold bg-blue-500/15 rounded py-0.5 border border-blue-500/30' : 'text-slate-500'" x-text="m"></span>
                      </template>
                    </div>
                  </div>
                </div>

                <!-- DIMENSION 6: 🎯 1-CLICK TOPIC CLUSTER BLUEPRINT & CSV CONTENT GENERATOR -->
                <template x-if="crossoverData.topic_cluster_blueprint">
                  <div class="p-6 rounded-3xl bg-gradient-to-br from-white via-purple-50/20 to-pink-50/20 dark:from-[#0c1322] dark:via-slate-900 dark:to-[#111827] border border-purple-500/30 dark:border-purple-500/20 shadow-lg shadow-purple-950/10 space-y-5">
                    
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/80 dark:border-[#27272A]/80">
                      <div>
                        <div class="flex items-center space-x-2">
                          <i data-lucide="target" class="w-4 h-4 text-purple-500"></i>
                          <h3 class="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">Algorithmic Topic Cluster Blueprint</h3>
                          <span class="px-2 py-0.5 rounded text-[10px] font-mono tabular-nums font-bold bg-purple-500/20 text-purple-600 dark:text-purple-400">Ready to Deploy</span>
                        </div>
                        <p class="text-xs text-slate-500 mt-0.5">Automated Pillar + Spoke content architecture targeting maximum cluster authority on Pinterest.</p>
                      </div>

                      <button @click="exportClusterBlueprintCsv()"
                              class="px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white transition flex items-center space-x-2 shadow-md shadow-purple-950/20 active:scale-95 cursor-pointer">
                        <i data-lucide="file-spreadsheet" class="w-4 h-4"></i>
                        <span>Export CSV Blueprint</span>
                      </button>
                    </div>

                    <!-- Pillar Concept -->
                    <div class="p-4 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-purple-500/20 space-y-2">
                      <div class="flex items-center justify-between">
                        <span class="text-[10px] font-mono tabular-nums font-bold uppercase text-purple-600 dark:text-purple-400">Pillar Content Angle</span>
                        <span class="text-[10px] font-mono tabular-nums text-slate-400" x-text="'Anchor: ' + crossoverData.topic_cluster_blueprint.folder_name"></span>
                      </div>
                      <h4 class="text-base font-black text-slate-900 dark:text-white" x-text="crossoverData.topic_cluster_blueprint.pillar_concept"></h4>
                      <p class="text-xs text-slate-400 font-mono tabular-nums">
                        <strong class="text-slate-300">Universal Tags:</strong> 
                        <span x-text="crossoverData.topic_cluster_blueprint.universal_tag_blueprint"></span>
                      </p>
                    </div>

                    <!-- 5 Spoke Pin Angles -->
                    <div class="space-y-3">
                      <span class="text-xs font-bold text-slate-400 font-mono tabular-nums uppercase tracking-wider">5 High-Impact Spoke Pin Angles:</span>
                      
                      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        <template x-for="spoke in crossoverData.topic_cluster_blueprint.spoke_angles" :key="spoke.angle_number">
                          <div class="p-4 rounded-2xl bg-white/80 dark:bg-slate-900/60 border border-slate-200/80 dark:border-[#27272A] space-y-2.5">
                            <div class="flex items-center justify-between">
                              <span class="px-2 py-0.5 rounded text-[10px] font-mono tabular-nums font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20"
                                    x-text="'Spoke #' + spoke.angle_number"></span>
                              <span class="text-[10px] font-mono tabular-nums text-slate-400" x-text="spoke.recommended_aspect_ratio"></span>
                            </div>

                            <h5 class="text-xs font-bold text-slate-900 dark:text-white" x-text="spoke.angle_title"></h5>

                            <div class="space-y-1 text-[11px] text-slate-500">
                              <div class="flex items-center justify-between">
                                <span>Target:</span>
                                <strong class="font-mono tabular-nums text-pink-500 capitalize" x-text="spoke.target_keyword"></strong>
                              </div>
                              <div class="flex items-center justify-between">
                                <span>Format:</span>
                                <strong class="font-mono tabular-nums text-slate-700 dark:text-slate-300" x-text="spoke.recommended_format"></strong>
                              </div>
                            </div>

                            <div class="pt-2 border-t border-slate-100 dark:border-[#27272A]/80 text-[10px] text-slate-400 font-mono tabular-nums line-clamp-1"
                                 x-text="'Tags: ' + spoke.target_tags"></div>
                          </div>
                        </template>
                      </div>
                    </div>

                  </div>
                </template>

              </div>
            </template>

          </div>
        </template>

      </div>

    </section>

    </div>

  </main>

  <!-- ELEVATED FLOATING BULK ACTION BAR (LEVEL 1A DASHBOARD) -->
  <div x-show="viewModeLevel === 'dashboard' && selectedKeywordIds.length > 0" x-cloak
       x-transition:enter="transition ease-out duration-300"
       x-transition:enter-start="opacity-0 translate-y-8"
       x-transition:enter-end="opacity-100 translate-y-0"
       x-transition:leave="transition ease-in duration-200"
       x-transition:leave-start="opacity-100 translate-y-0"
       x-transition:leave-end="opacity-0 translate-y-8"
       class="fixed bottom-6 inset-x-0 mx-auto w-fit z-50 bg-slate-900/95 dark:bg-[#121215]/95 border border-slate-700 shadow-2xl backdrop-blur-xl px-4 sm:px-6 py-3 rounded-2xl flex flex-wrap items-center gap-2 sm:gap-3 text-xs">
    <div class="flex items-center space-x-2">
      <span class="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
      <span class="px-2.5 py-1 rounded-xl bg-emerald-500/20 text-emerald-400 font-mono tabular-nums font-bold" x-text="selectedKeywordIds.length + ' Keywords Selected'"></span>
    </div>

    <div class="h-4 w-px bg-slate-700 hidden sm:block"></div>

    <button @click="bulkSyncKeywords()" :disabled="isBulkLoading"
            class="px-3.5 py-1.5 rounded-xl font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50">
      <i data-lucide="zap" class="w-3.5 h-3.5" :class="isBulkLoading ? 'animate-spin' : ''"></i>
      <span>⚡ Fast Refresh Now</span>
    </button>

    <button @click="openBulkFolderModal()" :disabled="isBulkLoading"
            class="px-3.5 py-1.5 rounded-xl font-bold bg-pink-500/20 hover:bg-pink-500/30 text-pink-400 border border-pink-500/40 transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50">
      <i data-lucide="folder-plus" class="w-3.5 h-3.5"></i>
      <span>📁 Add to Campaign Folder</span>
    </button>

    <button @click="bulkToggleKeywordStatus(false)" :disabled="isBulkLoading"
            class="px-3.5 py-1.5 rounded-xl font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/40 transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50">
      <i data-lucide="pause-circle" class="w-3.5 h-3.5"></i>
      <span>⏸ Pause Tracking</span>
    </button>

    <button @click="bulkToggleKeywordStatus(true)" :disabled="isBulkLoading"
            class="px-3.5 py-1.5 rounded-xl font-bold bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border border-blue-500/40 transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50">
      <i data-lucide="play-circle" class="w-3.5 h-3.5"></i>
      <span>▶ Resume Tracking</span>
    </button>

    <button @click="bulkDeleteKeywords()" :disabled="isBulkLoading"
            class="px-3.5 py-1.5 rounded-xl font-bold bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/40 transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50">
      <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
      <span>🗑 Delete Selected</span>
    </button>

    <button @click="clearSelectedKeywords()" class="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer" title="Clear Selection">
      <i data-lucide="x" class="w-4 h-4"></i>
    </button>
  </div>

  <!-- MODAL: BULK ADD KEYWORDS TO CAMPAIGN FOLDER -->
  <div x-show="isBulkFolderModalOpen" x-cloak class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div x-show="isBulkFolderModalOpen"
         x-transition:enter="transition-opacity ease-linear duration-300"
         x-transition:enter-start="opacity-0"
         x-transition:enter-end="opacity-100"
         x-transition:leave="transition-opacity ease-linear duration-300"
         x-transition:leave-start="opacity-100"
         x-transition:leave-end="opacity-0"
         @click="isBulkFolderModalOpen = false"
         class="fixed inset-0 bg-slate-950/70 backdrop-blur-xs"></div>

    <div x-show="isBulkFolderModalOpen"
         x-transition:enter="transform transition ease-out duration-300"
         x-transition:enter-start="opacity-0 scale-95"
         x-transition:enter-end="opacity-100 scale-100"
         x-transition:leave="transform transition ease-in duration-200"
         x-transition:leave-start="opacity-100 scale-100"
         x-transition:leave-end="opacity-0 scale-95"
         class="relative w-full max-w-md bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-3xl shadow-2xl p-6 space-y-4 z-10">
      
      <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-[#27272A]">
        <div class="flex items-center space-x-2.5">
          <div class="w-8 h-8 rounded-xl bg-pink-500/10 text-pink-500 flex items-center justify-center">
            <i data-lucide="folder-plus" class="w-4 h-4"></i>
          </div>
          <div>
            <h3 class="text-sm font-black text-slate-900 dark:text-white">Add to Campaign Folder</h3>
            <p class="text-[11px] text-slate-400 font-mono tabular-nums" x-text="selectedKeywordIds.length + ' Keywords will be added'"></p>
          </div>
        </div>
        <button @click="isBulkFolderModalOpen = false" class="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>

      <div class="space-y-3">
        <label class="block text-xs font-bold text-slate-700 dark:text-slate-300">Select Target Campaign Folder</label>
        <select x-model="bulkTargetFolderId" class="w-full px-3 py-2 rounded-xl text-xs bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-pink-500/40">
          <template x-for="f in folders" :key="f.id">
            <option :value="f.id" x-text="f.name + ' (' + (f.keyword_count || 0) + ' keywords)'"></option>
          </template>
        </select>
        <template x-if="folders.length === 0">
          <p class="text-xs text-rose-500">No folders available. Please create a campaign folder first.</p>
        </template>
      </div>

      <div class="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100 dark:border-[#27272A]">
        <button @click="isBulkFolderModalOpen = false" class="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
          Cancel
        </button>
        <button @click="commitBulkFolder()" :disabled="!bulkTargetFolderId || folders.length === 0 || isBulkLoading"
                class="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-pink-600 hover:bg-pink-500 text-white transition disabled:opacity-50 cursor-pointer shadow-sm">
          Add Keywords
        </button>
      </div>
    </div>
  </div>

  <!-- MODAL: INTERACTIVE 20-RUNNER FLEET DISPATCH SWARM -->
  <div x-show="isFleetDispatchModalOpen" x-cloak class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div x-show="isFleetDispatchModalOpen"
         x-transition:enter="transition-opacity ease-linear duration-300"
         x-transition:enter-start="opacity-0"
         x-transition:enter-end="opacity-100"
         x-transition:leave="transition-opacity ease-linear duration-300"
         x-transition:leave-start="opacity-100"
         x-transition:leave-end="opacity-0"
         @click="isFleetDispatchModalOpen = false"
         class="fixed inset-0 bg-slate-950/70 backdrop-blur-xs"></div>

    <div x-show="isFleetDispatchModalOpen"
         x-transition:enter="transform transition ease-out duration-300"
         x-transition:enter-start="opacity-0 scale-95"
         x-transition:enter-end="opacity-100 scale-100"
         x-transition:leave="transform transition ease-in duration-200"
         x-transition:leave-start="opacity-100 scale-100"
         x-transition:leave-end="opacity-0 scale-95"
         class="relative w-full max-w-lg bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-3xl shadow-2xl p-6 space-y-5 z-10">
      
      <!-- Modal Header -->
      <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-[#27272A]">
        <div class="flex items-center space-x-3">
          <div class="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
            <i data-lucide="play" class="w-4 h-4"></i>
          </div>
          <div>
            <h3 class="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">Trigger 20-Runner Swarm</h3>
            <p class="text-[11px] text-slate-400 font-mono tabular-nums">Autonomous deep crawler fleet via GitHub Actions</p>
          </div>
        </div>
        <button @click="isFleetDispatchModalOpen = false" class="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>

      <!-- Controls Form -->
      <div class="space-y-4">
        <!-- 1. Target Keyword -->
        <div>
          <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Target Keyword</label>
          <select x-model="fleetDispatchTargetKeyword" @change="onFleetTargetKeywordChange()" class="w-full px-3 py-2.5 rounded-xl text-xs bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40 font-medium">
            <option value="">All Tracked Keywords (Global Sweep)</option>
            <template x-for="kw in keywords" :key="kw.id">
              <option :value="kw.keyword" x-text="kw.keyword + ' (' + (getKeywordTotalPins(kw) || kw.total_pins || 0) + ' pins)'"></option>
            </template>
          </select>
          <p class="mt-1 text-[10px] text-slate-400">Select an individual keyword to partition its pins across 20 runners, or audit all keywords globally.</p>
        </div>

        <!-- 2. Fresh Live SERP First (Toggle / Checkbox) -->
        <div class="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-[#27272A] flex items-start justify-between space-x-3">
          <div class="space-y-0.5">
            <label class="text-xs font-bold text-slate-800 dark:text-slate-200 cursor-pointer" @click="fleetDispatchHarvestSerp = !fleetDispatchHarvestSerp">
              Fetch Fresh Live SERP First
            </label>
            <p class="text-[11px] text-slate-400 leading-relaxed">
              Harvests real-time Pinterest search rankings before extracting 48-field telemetry
            </p>
          </div>
          <label class="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5">
            <input type="checkbox" x-model="fleetDispatchHarvestSerp" class="sr-only peer">
            <div class="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-slate-600 peer-checked:bg-emerald-500"></div>
          </label>
        </div>

        <!-- 3. Crawl Scope -->
        <div>
          <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Crawl Scope</label>
          <div class="grid grid-cols-2 gap-2">
            <button type="button" @click="fleetDispatchScope = 'all_pins'"
                    class="p-3 rounded-2xl border text-left transition cursor-pointer"
                    :class="fleetDispatchScope === 'all_pins' ? 'bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-400' : 'bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-[#27272A] text-slate-600 dark:text-slate-400 hover:border-slate-300'">
              <div class="text-xs font-bold">All Pins</div>
              <div class="text-[10px] text-slate-400 mt-0.5">Active SERP + Displaced Vault</div>
            </button>
            <button type="button" @click="fleetDispatchScope = 'active_serp'"
                    class="p-3 rounded-2xl border text-left transition cursor-pointer"
                    :class="fleetDispatchScope === 'active_serp' ? 'bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-400' : 'bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-[#27272A] text-slate-600 dark:text-slate-400 hover:border-slate-300'">
              <div class="text-xs font-bold">Active SERP Only</div>
              <div class="text-[10px] text-slate-400 mt-0.5">Top 50-100 ranked pins</div>
            </button>
          </div>
        </div>

        <!-- 4. Max Pins Quota -->
        <div>
          <div class="flex items-center justify-between mb-1">
            <label class="text-xs font-bold text-slate-700 dark:text-slate-300">Max Pins Quota</label>
            <span class="text-[11px] font-mono tabular-nums text-emerald-500 font-bold" x-text="fleetDispatchMaxPins + ' pins'"></span>
          </div>
          <select x-model.number="fleetDispatchMaxPins" class="w-full px-3 py-2 rounded-xl text-xs bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40">
            <option :value="fleetDispatchMaxPins" x-show="![50, 100, 250, 500, 1000].includes(fleetDispatchMaxPins)" x-text="fleetDispatchMaxPins + ' Pins (Target Quota)'"></option>
            <option :value="50">50 Pins (Fast Discovery)</option>
            <option :value="100">100 Pins (Standard SERP)</option>
            <option :value="250">250 Pins (Deep Audit)</option>
            <option :value="500">500 Pins (Extensive Sweep)</option>
            <option :value="1000">1000 Pins (Maximum Cluster)</option>
          </select>
        </div>
      </div>

      <!-- Modal Footer -->
      <div class="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-[#27272A]">
        <span class="text-[11px] text-slate-400 font-mono tabular-nums">20 Azure VMs &middot; Zero Hub writes</span>
        <div class="flex items-center space-x-2">
          <button @click="isFleetDispatchModalOpen = false" class="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer">
            Cancel
          </button>
          <button @click="executeFleetDispatch()" :disabled="isWorkflowDispatching"
                  class="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-emerald-600 hover:bg-emerald-500 text-white transition disabled:opacity-50 cursor-pointer shadow-sm flex items-center space-x-1.5">
            <i data-lucide="play" class="w-3.5 h-3.5 text-white" :class="isWorkflowDispatching ? 'animate-spin' : ''"></i>
            <span>Launch 20-Runner Swarm</span>
          </button>
        </div>
      </div>

    </div>
  </div>

  ${getKeywordDrawersAndModalsHtml()}


  <script>
    function keywordStudio() {
      const initialFolderId = (typeof window !== 'undefined' && window.__INITIAL_FOLDER_ID__) ? String(window.__INITIAL_FOLDER_ID__) : '';
      return {
        viewModeLevel: (typeof window !== 'undefined' && window.__INITIAL_KEYWORD_SLUG__ && window.__INITIAL_KEYWORD_SLUG__.trim()) ? 'serp_studio' : 'dashboard',
        activeFolderId: initialFolderId,
        activeFolder: null,
        darkMode: typeof localStorage !== 'undefined' ? localStorage.getItem('pa_theme') !== 'light' : true,
        isDark: typeof localStorage !== 'undefined' ? localStorage.getItem('pa_theme') !== 'light' : true,
        applyTheme() {
          if (this.darkMode || this.isDark) {
            document.documentElement.classList.add('dark');
          } else {
            document.documentElement.classList.remove('dark');
          }
          this.$nextTick(() => {
            if (window.lucide) window.lucide.createIcons();
          });
        },
        toggleTheme() {
          this.darkMode = !this.darkMode;
          this.isDark = this.darkMode;
          try {
            if (typeof localStorage !== 'undefined') {
              localStorage.setItem('pa_theme', this.darkMode ? 'dark' : 'light');
              localStorage.setItem('pin_theme', this.darkMode ? 'dark' : 'light');
            }
          } catch (_) {}
          this.applyTheme();
        },
        isSidebarCollapsed: (() => {
          try {
            return typeof localStorage !== 'undefined' ? localStorage.getItem('pae_sidebar_collapsed') === 'true' : false;
          } catch (_) { return false; }
        })(),
        isMobileMenuOpen: false,
        toggleSidebar() {
          this.isSidebarCollapsed = !this.isSidebarCollapsed;
          try {
            if (typeof localStorage !== 'undefined') {
              localStorage.setItem('pae_sidebar_collapsed', this.isSidebarCollapsed ? 'true' : 'false');
            }
          } catch (_) {}
          this.$nextTick(() => {
            if (window.lucide) window.lucide.createIcons();
          });
        },
        keywords: [],
        selectedKeyword: null,
        selectedKeywordDetails: null,
        activeKeywordQuery: '',
        isDetailsLoading: false,
        isWorkflowDispatching: false,
        syncingKeywordId: null,

        // Interactive 20-Runner Swarm Fleet Dispatch Modal State
        isFleetDispatchModalOpen: false,
        fleetDispatchTargetKeyword: '',
        fleetDispatchHarvestSerp: true,
        fleetDispatchScope: 'all_pins',
        fleetDispatchMaxPins: 50,

        // Level 1A Dashboard State & Bulk Selection
        selectedKeywordIds: [],
        dashboardSearch: '',
        dashboardCategoryFilter: 'ALL',
        dashboardStatusFilter: 'ALL',
        dashboardFolderFilter: initialFolderId || 'ALL',
        dashboardGrowthFilter: 'ALL',
        dashboardPinsFilter: 'ALL',
        dashboardSort: 'total_pins',
        dashboardViewMode: 'table', // 'table' | 'grid'
        dashboardPage: 1,
        dashboardPageSize: 10,
        isBulkFolderModalOpen: false,
        bulkTargetFolderId: '',
        isBulkLoading: false,
        isKeywordsLoading: false,
        isQuickTrackModalOpen: false,
        quickKeywordInput: '',
        quickKeywordCategory: 'General',

        // Table Column Visibility State & Definitions
        columnDefinitions: [
          { key: 'preview', label: 'Preview Image', required: false },
          { key: 'keyword', label: 'Keyword & Folders', required: true },
          { key: 'total_pins', label: 'SERP Breakdown', required: false },
          { key: 'status', label: 'Status', required: false },
          { key: 'created_at', label: 'Date Added', required: false },
          { key: 'last_crawled', label: 'Last Crawled', required: false },
          { key: 'actions', label: 'Actions', required: false }
        ],
        visibleColumns: {
          preview: true,
          keyword: true,
          total_pins: true,
          status: true,
          created_at: true,
          last_crawled: true,
          actions: true
        },

        // Dual-Scope Switcher State (Active SERP Top 100 vs All Vault Pins)
        serpScope: 'active', // 'active' | 'vault'

        // Pin Detail Slide-Over Inspector State (PinClicks Parity)
        isPinDrawerOpen: false,
        activeInspectorPin: null,
        activeInspectorPinIndex: 0,

        // Growth Pace & View Mode Toggle (Image 1 Parity)
        growthPaceFilter: '24h', // '24h' | '3d' | '7d' | 'all'
        viewMode: 'table', // 'table' | 'cards'
        selectedPinIds: [],
        pinPage: 1,
        pinPageSize: 50, // 25 | 50 | 100 | 'all'

        // Displaced Pins Vault State (Phase 3 & 4)
        displacedPins: [],
        displacedPinsTotal: 0,
        displacedOffset: 0,
        displacedStatusFilter: 'ALL',
        isDisplacedLoading: false,
        isLoadingMoreDisplaced: false,

        // Pin Deep Dossier & Performance Trajectory State (Image 2 Parity)
        dossierData: null,
        isDossierLoading: false,
        trajectoryRange: '30d', // '7d' | '14d' | '30d' | 'all'
        trajectoryData: null,
        isTrajectoryLoading: false,

        // Pinterest Trends 52-Week Parity State
        trendsData: null,
        isTrendsLoading: false,

        // Concurrency & Race-Condition Hardening (Inspector & Details)
        detailRequestId: 0,
        detailAbortController: null,
        activePinRequestId: 0,
        pinInspectorAbortController: null,

        // Omnibar State
        omnibarQuery: '',
        typeaheadSuggestions: [],
        isTypeaheadLoading: false,
        isOmnibarDropdownOpen: false,

        // Visual Similarity Lens State (v3_visual_search)
        isVisualLensModalOpen: false,
        isVisualLensLoading: false,
        visualLensPin: null,
        visualLensResults: [],
        visualLensError: null,

        // Engine & Crawl Depth Settings State
        isSettingsModalOpen: false,
        settingsTargetKeyword: null,
        settingsCrawlPages: 2,
        settingsMaxPins: 50,
        settingsMaxSerpPins: 50,
        settingsMaxCatalogInspect: 0,
        settingsEnableSerpHarvest: true,
        settingsCrawlScope: 'all_pins',
        settingsInspectionMode: 'full_catalog',
        settingsExcludePromoted: true,
        settingsExcludeBoardsAndSuggestions: true,
        settingsExcludeIgnoredPins: true,
        settingsMaxPinAgeDays: 30,
        settingsMinVelocity: 1.5,
        settingsApplyGlobal: true,
        settingsLoading: false,
        appSettings: {
          default_crawl_pages: 2,
          default_max_pins: 50,
          max_serp_pins: 50,
          max_catalog_inspect: 0,
          enable_serp_harvest: true,
          default_crawl_scope: 'all_pins',
          default_inspection_mode: 'full_catalog',
          exclude_promoted: true,
          exclude_boards_and_suggestions: true,
          exclude_ignored_pins: true,
          breakout_max_pin_age_days: 30,
          breakout_min_velocity: 1.5
        },

        // UI Tabs & State
        activeTab: 'serp',
        popularPinsView: 'full',
        selectedProjectId: '',
        fleetProjects: [],
        darkMode: true,
        toast: { show: false, message: '', type: 'info' },

        // Campaign Folders & Crossover Engine State
        folders: [],
        activeFolder: null,
        crossoverData: null,
        isCrossoverLoading: false,
        currentKeywordFolders: [],
        isFolderManagerOpen: false,
        isCreateFolderModalOpen: false,
        isAddKeywordsModalOpen: false,
        newFolder: { name: '', description: '', color: '#ec4899' },
        folderKeywordSearch: '',
        selectedFolderKeywordIds: [],

        // Pin Table Filter & Sort Controls
        serpScope: 'all',
        intelScope: 'all',
        activeVisualTagFilter: '',
        activeDomainFilter: '',
        cachedTagFreqMap: null,
        cachedCoreAnchorsSet: null,
        cachedCombinedPins: null,
        cachedDisplacedVaultPins: null,
        pinSearch: '',
        formatFilter: 'ALL',
        pinSort: 'rank',
        expandedPinTags: {},

        // Visual Anchors & Signals Suite (PinClicks Intelligence)
        anchorsView: 'cloud', // 'cloud' | 'cards' | 'table'
        anchorsLimit: 24,
        anchorsSearch: '',
        anchorsTier: 'all', // 'all' | 'high' | 'core'
        anchorsPage: 1,
        anchorsPageSize: 20,

        // Domain Authority Table Controls
        domainSearch: '',
        domainPage: 1,
        domainPageSize: 15,

        // [INVARIANT: DEFENSIVE-PIN-DOSSIER-URL]
        // Generates safe, breadcrumb-rich URLs to Level 3 Pin Dossier (/pins/:pin_id).
        // Defensively resolves keyword and campaign folder context without throwing ReferenceErrors on undeclared state.
        getPinDossierUrl(pin) {
          if (!pin || !pin.pin_id) return '#';
          const kw = this.selectedKeyword;
          const folderId = this.activeFolder?.id || (this.dashboardFolderFilter && this.dashboardFolderFilter !== 'ALL' && this.dashboardFolderFilter !== 'UNASSIGNED' ? this.dashboardFolderFilter : null);
          const params = new URLSearchParams();
          if (kw?.id) params.set('keyword_id', String(kw.id));
          if (kw?.keyword) params.set('keyword', kw.keyword);
          if (folderId) params.set('folder_id', String(folderId));
          const qs = params.toString();
          return '/pins/' + encodeURIComponent(pin.pin_id) + (qs ? '?' + qs : '');
        },

        togglePinTags(pinId) {
          this.expandedPinTags = {
            ...this.expandedPinTags,
            [pinId]: !this.expandedPinTags[pinId]
          };
          this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
        },

        isPinTagsExpanded(pinId) {
          return Boolean(this.expandedPinTags[pinId]);
        },

        openQuickTrackModal() {
          this.quickKeywordInput = '';
          this.quickKeywordCategory = 'General';
          this.isQuickTrackModalOpen = true;
          this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
        },

        async quickTrackKeyword(term) {
          this.quickKeywordInput = term;
          await this.submitQuickKeyword();
        },

        async submitQuickKeyword() {
          const term = (this.quickKeywordInput || '').trim();
          if (!term) return;
          this.isQuickTrackModalOpen = false;
          this.showToast('Loading "' + term + '" into SERP Studio...', 'info');
          await this.loadKeywordBySlugOrText(term, true, true);
        },

        get activeSlug() {
          const raw = this.selectedKeyword?.keyword || this.activeKeywordQuery || '';
          return raw.trim().toLowerCase().replace(/\\s+/g, '-');
        },

        get omnibarTrackedMatches() {
          if (!this.omnibarQuery.trim()) return [];
          const q = this.omnibarQuery.toLowerCase().trim();
          return (this.keywords || []).filter(k => (k?.keyword || '').toLowerCase().includes(q)).slice(0, 5);
        },

        get selectableKeywordsForFolder() {
          if (!this.folderKeywordSearch || !this.folderKeywordSearch.trim()) return this.keywords;
          const q = this.folderKeywordSearch.toLowerCase().trim();
          return this.keywords.filter(k => (k.keyword || '').toLowerCase().includes(q) || (k.category || '').toLowerCase().includes(q));
        },

        get filteredDashboardKeywords() {
          let list = this.keywords || [];
          if (this.dashboardStatusFilter === 'ACTIVE') {
            list = list.filter(k => k.is_active !== false);
          } else if (this.dashboardStatusFilter === 'PAUSED') {
            list = list.filter(k => k.is_active === false);
          }
          if (this.dashboardCategoryFilter && this.dashboardCategoryFilter !== 'ALL') {
            const cat = this.dashboardCategoryFilter.toLowerCase();
            list = list.filter(k => (k.category || 'General').toLowerCase() === cat);
          }
          if (this.activeFolderId) {
            const fid = String(this.activeFolderId);
            list = list.filter(k => this.getKeywordFolders(k).some(f => f && String(f.id) === fid));
          } else if (this.dashboardFolderFilter && this.dashboardFolderFilter !== 'ALL') {
            if (this.dashboardFolderFilter === 'UNASSIGNED') {
              list = list.filter(k => this.getKeywordFolders(k).length === 0);
            } else {
              const targetFid = String(this.dashboardFolderFilter);
              list = list.filter(k => this.getKeywordFolders(k).some(f => f && String(f.id) === targetFid));
            }
          }
          if (this.dashboardGrowthFilter && this.dashboardGrowthFilter !== 'ALL') {
            if (this.dashboardGrowthFilter === 'HIGH') {
              list = list.filter(k => (k._velocity !== undefined ? k._velocity : this.getKeywordVelocity(k)) >= 50);
            } else if (this.dashboardGrowthFilter === 'TRENDING') {
              list = list.filter(k => {
                const v = k._velocity !== undefined ? k._velocity : this.getKeywordVelocity(k);
                return v >= 10 && v < 50;
              });
            } else if (this.dashboardGrowthFilter === 'POSITIVE') {
              list = list.filter(k => (k._velocity !== undefined ? k._velocity : this.getKeywordVelocity(k)) > 0);
            } else if (this.dashboardGrowthFilter === 'FLAT') {
              list = list.filter(k => (k._velocity !== undefined ? k._velocity : this.getKeywordVelocity(k)) === 0);
            } else if (this.dashboardGrowthFilter === 'DECLINING') {
              list = list.filter(k => (k._velocity !== undefined ? k._velocity : this.getKeywordVelocity(k)) < 0);
            }
          }
          if (this.dashboardPinsFilter && this.dashboardPinsFilter !== 'ALL') {
            if (this.dashboardPinsFilter === '250_PLUS') {
              list = list.filter(k => (k._totalPins !== undefined ? k._totalPins : this.getKeywordTotalPins(k)) >= 250);
            } else if (this.dashboardPinsFilter === 'UNDER_250') {
              list = list.filter(k => (k._totalPins !== undefined ? k._totalPins : this.getKeywordTotalPins(k)) < 250);
            }
          }
          if (this.dashboardSearch && this.dashboardSearch.trim()) {
            const q = this.dashboardSearch.toLowerCase().trim();
            list = list.filter(k => k._searchCorpus ? k._searchCorpus.includes(q) : (
              (k.keyword || '').toLowerCase().includes(q) ||
              (k.category || '').toLowerCase().includes(q) ||
              this.getKeywordFolders(k).some(f => (f.name || '').toLowerCase().includes(q))
            ));
          }
          if (this.dashboardSort === 'velocity') {
            return [...list].sort((a, b) => (b._velocity ?? this.getKeywordVelocity(b)) - (a._velocity ?? this.getKeywordVelocity(a)));
          } else if (this.dashboardSort === 'saves_delta') {
            return [...list].sort((a, b) => (b._saveDelta ?? this.getKeywordSaveDelta(b)) - (a._saveDelta ?? this.getKeywordSaveDelta(a)));
          } else if (this.dashboardSort === 'repins_delta') {
            return [...list].sort((a, b) => (b._repinDelta ?? this.getKeywordRepinDelta(b)) - (a._repinDelta ?? this.getKeywordRepinDelta(a)));
          } else if (this.dashboardSort === 'total_pins') {
            return [...list].sort((a, b) => (b._totalPins ?? this.getKeywordTotalPins(b)) - (a._totalPins ?? this.getKeywordTotalPins(a)));
          } else if (this.dashboardSort === 'created_desc') {
            return [...list].sort((a, b) => (b._createdAtMs ?? (Date.parse(b.created_at) || 0)) - (a._createdAtMs ?? (Date.parse(a.created_at) || 0)));
          } else if (this.dashboardSort === 'created_asc') {
            return [...list].sort((a, b) => (a._createdAtMs ?? (Date.parse(a.created_at) || 0)) - (b._createdAtMs ?? (Date.parse(b.created_at) || 0)));
          } else if (this.dashboardSort === 'name') {
            return [...list].sort((a, b) => (a.keyword || '').localeCompare(b.keyword || ''));
          } else if (this.dashboardSort === 'crawled') {
            return [...list].sort((a, b) => (b._crawledAtMs ?? (Date.parse(b.last_crawled_at) || 0)) - (a._crawledAtMs ?? (Date.parse(a.last_crawled_at) || 0)));
          }
          return list;
        },

        get paginatedDashboardKeywords() {
          if (this.dashboardPageSize === 'all') return this.filteredDashboardKeywords;
          const size = Number(this.dashboardPageSize || 10);
          const totalPages = this.dashboardTotalPages;
          const safePage = Math.min(Math.max(1, Number(this.dashboardPage) || 1), totalPages);
          const start = Math.max(0, (safePage - 1) * size);
          return this.filteredDashboardKeywords.slice(start, start + size);
        },

        get dashboardTotalPages() {
          if (this.dashboardPageSize === 'all') return 1;
          const size = Number(this.dashboardPageSize || 10);
          return Math.ceil(this.filteredDashboardKeywords.length / size) || 1;
        },

        get dashboardRangeStart() {
          const total = this.filteredDashboardKeywords.length;
          if (total === 0) return 0;
          if (this.dashboardPageSize === 'all') return 1;
          const size = Number(this.dashboardPageSize || 10);
          const safePage = Math.min(Math.max(1, Number(this.dashboardPage) || 1), this.dashboardTotalPages);
          return ((safePage - 1) * size) + 1;
        },

        get dashboardRangeEnd() {
          const total = this.filteredDashboardKeywords.length;
          if (total === 0) return 0;
          if (this.dashboardPageSize === 'all') return total;
          const size = Number(this.dashboardPageSize || 10);
          const safePage = Math.min(Math.max(1, Number(this.dashboardPage) || 1), this.dashboardTotalPages);
          return Math.min(safePage * size, total);
        },

        get dashboardPageNumbers() {
          const total = this.dashboardTotalPages;
          const current = Math.min(Math.max(1, Number(this.dashboardPage) || 1), total);
          if (total <= 7) {
            return Array.from({ length: total }, (_, i) => i + 1);
          }
          const pages = [];
          if (current <= 4) {
            for (let i = 1; i <= 5; i++) pages.push(i);
            pages.push('...');
            pages.push(total);
          } else if (current >= total - 3) {
            pages.push(1);
            pages.push('...');
            for (let i = total - 4; i <= total; i++) pages.push(i);
          } else {
            pages.push(1);
            pages.push('...');
            pages.push(current - 1);
            pages.push(current);
            pages.push(current + 1);
            pages.push('...');
            pages.push(total);
          }
          return pages;
        },

        setDashboardPage(p) {
          if (p === '...' || p < 1 || p > this.dashboardTotalPages) return;
          this.dashboardPage = p;
          this.$nextTick(() => {
            if (window.lucide) window.lucide.createIcons();
            const el = this.dashboardViewMode === 'grid'
              ? (document.getElementById('keywords-dashboard-grid') || document.getElementById('keywords-dashboard-table'))
              : document.getElementById('keywords-dashboard-table');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          });
        },

        getKeywordTotalPins(kw) {
          if (!kw) return 0;
          if (kw.total_pins_count !== undefined && kw.total_pins_count !== null && !isNaN(Number(kw.total_pins_count))) {
            return Number(kw.total_pins_count);
          }
          const active = Number(kw.active_pins_count ?? kw.snapshots_count ?? 0) || 0;
          const displaced = Number(kw.displaced_pins_count ?? 0) || 0;
          if (active > 0 || displaced > 0) return active + displaced;
          return 0;
        },

        getKeywordFolders(kw) {
          if (!kw) return [];
          if (Array.isArray(kw._folders)) return kw._folders;
          let folders = kw.folders;
          if (typeof folders === 'string' && folders.trim().startsWith('[')) {
            try { folders = JSON.parse(folders); } catch (_) { folders = []; }
          }
          if (Array.isArray(folders) && folders.length > 0) {
            const seen = new Set();
            kw._folders = folders.filter(f => f && f.id && !seen.has(String(f.id)) && seen.add(String(f.id)));
            return kw._folders;
          }
          if (!this.folders || this.folders.length === 0) return [];
          const kid = String(kw.id);
          const seen = new Set();
          kw._folders = this.folders
            .filter(f => {
              if (!f) return false;
              let prev = f.keywords_preview;
              if (typeof prev === 'string' && prev.trim().startsWith('[')) {
                try { prev = JSON.parse(prev); } catch (_) { prev = []; }
              }
              return (Array.isArray(prev) ? prev : []).some(k => k && String(k.id) === kid);
            })
            .map(f => ({ id: f.id, name: f.name, color: f.color || '#ec4899' }))
            .filter(f => !seen.has(String(f.id)) && seen.add(String(f.id)));
          return kw._folders;
        },

        getFolderKeywordCount(f) {
          if (!f) return 0;
          if (f.keyword_count !== undefined && f.keyword_count !== null && !isNaN(Number(f.keyword_count))) {
            return Number(f.keyword_count);
          }
          let prev = f.keywords_preview;
          if (typeof prev === 'string' && prev.trim().startsWith('[')) {
            try { prev = JSON.parse(prev); } catch (_) {}
          }
          return Array.isArray(prev) ? prev.filter(Boolean).length : 0;
        },

        filterByFolder(folderId) {
          this.dashboardFolderFilter = String(folderId);
          this.dashboardPage = 1;
        },

        clearFolderFilter() {
          this.dashboardFolderFilter = 'ALL';
          this.dashboardPage = 1;
        },

        get activeFolderName() {
          if (this.dashboardFolderFilter === 'ALL') return '';
          if (this.dashboardFolderFilter === 'UNASSIGNED') return 'Unassigned (No Folder)';
          const f = (this.folders || []).find(x => x && String(x.id) === String(this.dashboardFolderFilter));
          return f ? f.name : ('Folder #' + this.dashboardFolderFilter);
        },

        openQuickFolderModal(kw) {
          if (!kw) return;
          this.selectedKeyword = kw;
          this.selectedKeywordIds = [kw.id];
          this.openBulkFolderModal();
        },

        toggleColumn(key) {
          if (key === 'keyword') return; // Core column cannot be hidden
          this.visibleColumns = {
            ...this.visibleColumns,
            [key]: !this.visibleColumns[key],
            keyword: true
          };
          try {
            localStorage.setItem('keywords_visible_columns', JSON.stringify(this.visibleColumns));
          } catch (_) {}
          this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
        },

        resetColumns() {
          this.visibleColumns = {
            preview: true,
            keyword: true,
            total_pins: true,
            status: true,
            created_at: true,
            last_crawled: true,
            actions: true
          };
          try {
            localStorage.removeItem('keywords_visible_columns');
          } catch (_) {}
          this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
        },

        get activeVisibleColumnCount() {
          const visible = Object.entries(this.visibleColumns || {}).filter(([_, v]) => Boolean(v)).length;
          return visible + 1; // +1 for selection checkbox
        },

        get activeKeywordsCount() {
          const list = this.activeFolderId ? this.filteredDashboardKeywords : (this.keywords || []);
          return list.filter(k => k.is_active !== false).length;
        },

        get pausedKeywordsCount() {
          const list = this.activeFolderId ? this.filteredDashboardKeywords : (this.keywords || []);
          return list.filter(k => k.is_active === false).length;
        },

        get totalMonitoredPins() {
          const list = this.activeFolderId ? this.filteredDashboardKeywords : (this.keywords || []);
          return list.reduce((acc, k) => acc + this.getKeywordTotalPins(k), 0);
        },

        get averageFleetVelocity() {
          const base = this.activeFolderId ? this.filteredDashboardKeywords : (this.keywords || []);
          const active = base.filter(k => k.is_active !== false);
          if (active.length === 0) return 0;
          const total = active.reduce((acc, k) => acc + Number(k.avg_daily_velocity || 0), 0);
          return Number((total / active.length).toFixed(1));
        },

        get totalDisplacedPinsCount() {
          const list = this.activeFolderId ? this.filteredDashboardKeywords : (this.keywords || []);
          return list.reduce((acc, k) => acc + Number(k.displaced_pins_count || 0), 0);
        },

        get totalActivePinsCount() {
          const list = this.activeFolderId ? this.filteredDashboardKeywords : (this.keywords || []);
          return list.reduce((acc, k) => acc + Number(k.active_pins_count ?? k.snapshots_count ?? this.getKeywordTotalPins(k) ?? 0), 0);
        },

        get uniqueCategories() {
          const cats = new Set((this.keywords || []).map(k => k.category || 'General').filter(Boolean));
          return Array.from(cats).sort();
        },

        get nightlySyncCountdown() {
          const now = new Date();
          const next = new Date(now);
          next.setUTCHours(2, 0, 0, 0);
          if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
          const diffMs = next.getTime() - now.getTime();
          const hours = Math.floor(diffMs / 3600000);
          const mins = Math.floor((diffMs % 3600000) / 60000);
          return 'Next Batch at 02:00 UTC (~' + hours + 'h ' + mins + 'm)';
        },

        // [INVARIANT: NO-FABRICATED-TELEMETRY] Canonical velocity extraction & momentum tier assignment
        getKeywordVelocity(kw) {
          if (!kw) return 0;
          let val = 0;
          if (kw.avg_daily_velocity !== undefined && kw.avg_daily_velocity !== null) val = Number(kw.avg_daily_velocity);
          else if (kw.daily_save_velocity !== undefined && kw.daily_save_velocity !== null) val = Number(kw.daily_save_velocity);
          return Number.isFinite(val) ? val : 0;
        },

        getKeywordVelocityTierLabel(kw) {
          const vel = this.getKeywordVelocity(kw);
          if (vel >= 50) return '🔥 Explosive';
          if (vel >= 10) return '📈 Trending';
          if (vel > 0) return '⏸ Steady';
          return '⚪ Stagnant';
        },

        getKeywordVelocityTierClass(kw) {
          const vel = this.getKeywordVelocity(kw);
          if (vel >= 50) return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30';
          if (vel >= 10) return 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/30';
          if (vel > 0) return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30';
          return 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700';
        },

        getActiveSerpPercentage(kw) {
          const active = Number(kw?.active_pins_count ?? this.getKeywordTotalPins(kw) ?? 0);
          const displaced = Number(kw?.displaced_pins_count || 0);
          const total = active + displaced;
          if (!total) return 100;
          return Math.min(100, Math.max(0, Math.round((active / total) * 100)));
        },

        // Backward-compatible method signatures
        getKeywordSaveDelta(kw) {
          if (!kw) return 0;
          let val = 0;
          if (kw.saves_delta_24h !== undefined && kw.saves_delta_24h !== null) val = Number(kw.saves_delta_24h);
          else if (kw.metadata?.deltas?.saves_24h !== undefined) val = Number(kw.metadata.deltas.saves_24h);
          else val = Number(kw.avg_daily_velocity || kw.daily_save_velocity || 0);
          return Number.isFinite(val) ? val : 0;
        },

        getKeywordRepinDelta(kw) {
          if (!kw) return 0;
          let val = 0;
          if (kw.repins_delta_24h !== undefined && kw.repins_delta_24h !== null) val = Number(kw.repins_delta_24h);
          else if (kw.metadata?.deltas?.repins_24h !== undefined) val = Number(kw.metadata.deltas.repins_24h);
          return Number.isFinite(val) ? val : 0;
        },

        get filteredDisplacedPins() {
          let list = this.displacedPins || [];
          if (this.displacedStatusFilter && this.displacedStatusFilter !== 'ALL') {
            list = list.filter(p => p.status === this.displacedStatusFilter);
          }
          if (this.pinSearch && this.pinSearch.trim()) {
            const q = this.pinSearch.toLowerCase().trim();
            list = list.filter(p => 
              (p.title || '').toLowerCase().includes(q) ||
              (p.domain || '').toLowerCase().includes(q)
            );
          }
          if (this.pinSort === 'velocity') {
            return [...list].sort((a, b) => Number(b.daily_save_velocity || 0) - Number(a.daily_save_velocity || 0));
          } else if (this.pinSort === 'saves') {
            return [...list].sort((a, b) => Number(b.save_count || 0) - Number(a.save_count || 0));
          } else if (this.pinSort === 'age') {
            return [...list].sort((a, b) => new Date(b.displaced_date || 0) - new Date(a.displaced_date || 0));
          }
          return [...list].sort((a, b) => Number(b.vacuum_opportunity_score || 0) - Number(a.vacuum_opportunity_score || 0));
        },

        rebuildPinCaches() {
          const currentPins = (this.selectedKeywordDetails?.current_pins || []).map(p => ({
            ...p,
            is_displaced: false
          }));
          const currentPinIds = new Set(currentPins.map(p => p.pin_id));

          const droppedFromDetails = (this.selectedKeywordDetails?.dropped_out_pins || []).map(p => ({
            ...p,
            is_displaced: true,
            rank_position: p.last_known_rank || p.rank_position || 101,
            save_count: p.current_saves ?? p.save_count ?? 0,
            repin_count: p.current_repins ?? p.repin_count ?? 0,
            comment_count: p.current_comments ?? p.comment_count ?? 0,
            board_name: p.board_name || p.metadata?.board_name || null,
            creation_method: p.creation_method || p.method || p.metadata?.creation_method || p.metadata?.method || null,
            created_at_pinterest: p.created_at_pinterest || p.metadata?.created_at_pinterest || p.metadata?.created_at || null
          }));
          const fetchedDisplaced = (this.displacedPins || []).map(p => ({
            ...p,
            is_displaced: true,
            rank_position: p.last_known_rank || p.rank_position || 101,
            save_count: p.current_saves ?? p.save_count ?? 0,
            repin_count: p.current_repins ?? p.repin_count ?? 0,
            comment_count: p.current_comments ?? p.comment_count ?? 0,
            board_name: p.board_name || p.metadata?.board_name || null,
            creation_method: p.creation_method || p.method || p.metadata?.creation_method || p.metadata?.method || null,
            created_at_pinterest: p.created_at_pinterest || p.metadata?.created_at_pinterest || p.metadata?.created_at || null
          }));
          const vaultMap = new Map();
          for (const p of [...droppedFromDetails, ...fetchedDisplaced]) {
            if (p && p.pin_id && !currentPinIds.has(p.pin_id) && !vaultMap.has(p.pin_id)) {
              vaultMap.set(p.pin_id, p);
            }
          }
          const vaultPins = Array.from(vaultMap.values());
          // Sort displaced pins by their historical last_known_rank so they form a continuous #101, #102... catalog sequence
          vaultPins.sort((a, b) => Number(a.last_known_rank || a.rank_position || 999) - Number(b.last_known_rank || b.rank_position || 999));

          const activeCount = currentPins.length;
          vaultPins.forEach((p, idx) => {
            p.catalog_rank = activeCount + idx + 1;
          });
          currentPins.forEach((p, idx) => {
            p.catalog_rank = Number(p.rank_position) || (idx + 1);
          });

          this.cachedDisplacedVaultPins = vaultPins;

          const combined = [...currentPins, ...vaultPins];

          // Initialize tag frequency map: check if server provided precomputed tag_frequencies
          const freqMap = new Map();
          if (this.selectedKeywordDetails?.tag_frequencies && typeof this.selectedKeywordDetails.tag_frequencies === 'object') {
            for (const [k, v] of Object.entries(this.selectedKeywordDetails.tag_frequencies)) {
              freqMap.set(k.toLowerCase().trim(), Number(v) || 0);
            }
          }

          const coreSet = new Set();
          const shouldComputeClientFreq = freqMap.size === 0;

          // Pre-process and memoize visual tags on each pin object once
          for (const p of combined) {
            const rawTags = this.getPinVisualTags(p);
            p._cachedVisualTags = rawTags;
            p._cachedVisualTagsSlice = rawTags.slice(0, 4);
            p._hasVisualTags = rawTags.length > 0;
            p._extraTagsCount = Math.max(0, rawTags.length - 4);
            p._cachedVisualTagsLower = rawTags.map(t => t.toLowerCase());

            if (shouldComputeClientFreq) {
              for (const t of p._cachedVisualTagsLower) {
                freqMap.set(t, (freqMap.get(t) || 0) + 1);
              }
            }
          }

          for (const [t, cnt] of freqMap.entries()) {
            if (cnt >= 3) coreSet.add(t);
          }

          this.cachedTagFreqMap = freqMap;
          this.cachedCoreAnchorsSet = coreSet;
          this.cachedCombinedPins = combined;
        },

        get allCombinedPins() {
          if (!this.cachedCombinedPins) {
            this.rebuildPinCaches();
          }
          return this.cachedCombinedPins || [];
        },

        get displacedVaultPins() {
          if (!this.cachedDisplacedVaultPins) {
            this.rebuildPinCaches();
          }
          return this.cachedDisplacedVaultPins || [];
        },

        get totalDisplacedCount() {
          const fromDetails = Number(this.selectedKeywordDetails?.total_displaced_count ?? this.selectedKeywordDetails?.stats?.dropped_out ?? 0);
          const fromState = Number(this.displacedPinsTotal || 0);
          const fromArray = (this.displacedVaultPins || []).length;
          return Math.max(fromDetails, fromState, fromArray);
        },

        get totalCatalogCount() {
          const activeCount = Number(this.selectedKeywordDetails?.current_pins?.length || 0);
          const fromDetails = Number(this.selectedKeywordDetails?.total_catalog_pins_count || 0);
          return Math.max(fromDetails, activeCount + this.totalDisplacedCount);
        },

        getPinVisualTags(pin) {
          if (!pin) return [];
          if (pin._cachedVisualTags) return pin._cachedVisualTags;
          const raw = pin.metadata?.visual_annotations || pin.annotations || pin.visual_annotations || [];
          return (raw || []).map(t => {
            if (typeof t === 'string') return t.trim();
            if (t && typeof t === 'object') return (t.name || t.label || t.term || t.title || '').trim();
            return String(t || '').trim();
          }).filter(s => s && s.length >= 2);
        },

        filterByVisualTag(tag) {
          if (!tag) return;
          const clean = (typeof tag === 'string' ? tag : (tag.name || tag.label || tag.term || '')).trim().toLowerCase();
          if (this.activeVisualTagFilter === clean) {
            this.activeVisualTagFilter = '';
          } else {
            this.activeVisualTagFilter = clean;
            this.serpScope = 'all';
            this.activeTab = 'serp';
          }
          this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
        },

        filterByDomain(domain) {
          if (!domain) return;
          const clean = String(domain).trim().toLowerCase();
          if (this.activeDomainFilter === clean) {
            this.activeDomainFilter = '';
          } else {
            this.activeDomainFilter = clean;
            this.serpScope = 'all';
            this.activeTab = 'serp';
          }
          this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
        },

        get analyzedPinsList() {
          if (this.intelScope === 'active') {
            return this.selectedKeywordDetails?.current_pins || [];
          }
          return this.allCombinedPins.length > 0 ? this.allCombinedPins : (this.selectedKeywordDetails?.current_pins || []);
        },

        get totalAnalyzedPinsCount() {
          return this.analyzedPinsList.length;
        },

        get analyzedAvgSaves() {
          const list = this.analyzedPinsList;
          if (list.length === 0) return this.selectedKeywordDetails?.intelligence?.avg_saves || 0;
          const total = list.reduce((acc, p) => acc + Number(p.save_count || 0), 0);
          return Math.round(total / list.length);
        },

        get analyzedMedianSaves() {
          const list = this.analyzedPinsList;
          if (list.length === 0) {
            return this.selectedKeywordDetails?.intelligence?.benchmarks?.median_saves ?? this.selectedKeywordDetails?.intelligence?.median_saves ?? 0;
          }
          const saves = list.map(p => Number(p.save_count || 0)).sort((a, b) => a - b);
          const mid = Math.floor(saves.length / 2);
          return saves.length % 2 !== 0 ? saves[mid] : Math.round((saves[mid - 1] + saves[mid]) / 2);
        },

        get analyzedVisualFormats() {
          const pins = this.analyzedPinsList;
          if (pins.length === 0) {
            const asp = this.selectedKeywordDetails?.intelligence?.aspect_ratios;
            const fmt = this.selectedKeywordDetails?.intelligence?.formats;
            return {
              standard_pct: asp?.standard_pct ?? this.selectedKeywordDetails?.intelligence?.static_ratio ?? 80,
              extra_tall_pct: asp?.extra_tall_pct ?? 0,
              video_idea_pct: (fmt?.video_pct || 0) + (fmt?.idea_pct || 0)
            };
          }
          let standard = 0;
          let extraTall = 0;
          let videoOrIdea = 0;
          for (const p of pins) {
            const fmt = (p.metadata?.format || p.format || 'ORGANIC PIN').toUpperCase();
            const ratio = p.metadata?.aspect_ratio || p.aspect_ratio || '';
            if (fmt.includes('VIDEO') || fmt.includes('IDEA')) videoOrIdea++;
            else if (ratio === '1:2') extraTall++;
            else standard++;
          }
          const len = pins.length;
          return {
            standard_pct: Math.round((standard / len) * 100),
            extra_tall_pct: Math.round((extraTall / len) * 100),
            video_idea_pct: Math.round((videoOrIdea / len) * 100)
          };
        },

        get domainBreakdownList() {
          if (this.intelScope === 'active') {
            const backendList = this.selectedKeywordDetails?.intelligence?.domain_breakdown;
            if (Array.isArray(backendList) && backendList.length > 0) {
              return backendList;
            }
          }
          const pins = this.analyzedPinsList;
          if (pins.length === 0) return [];
          const map = new Map();
          for (const p of pins) {
            let d = (p.domain || '').trim().toLowerCase();
            if (!d && p.destination_url) {
              try { d = new URL(p.destination_url).hostname.replace(/^www\./, '').toLowerCase(); } catch (_) {}
            }
            if (!d || d === 'unknown' || d === 'uploaded by user' || d === 'null' || d === 'undefined') continue;
            if (!map.has(d)) {
              map.set(d, { domain: d, pin_count: 0, total_saves: 0, best_rank: Number(p.rank_position || 999) });
            }
            const entry = map.get(d);
            entry.pin_count++;
            entry.total_saves += Number(p.save_count || 0);
            entry.best_rank = Math.min(entry.best_rank, Number(p.rank_position || 999));
          }
          return Array.from(map.values())
            .map(entry => ({
              ...entry,
              share_pct: Number(((entry.pin_count / pins.length) * 100).toFixed(1))
            }))
            .sort((a, b) => b.pin_count - a.pin_count || b.total_saves - a.total_saves);
        },

        get repeatedDomainsCount() {
          if (this.intelScope === 'active') {
            const count = this.selectedKeywordDetails?.intelligence?.repeated_domains_count;
            if (count !== undefined && count !== null) return count;
          }
          return this.domainBreakdownList.filter(d => d.pin_count > 1).length;
        },

        get uniqueDomainsCount() {
          if (this.intelScope === 'active') {
            const count = this.selectedKeywordDetails?.intelligence?.unique_domains_count;
            if (count !== undefined && count !== null) return count;
          }
          return this.domainBreakdownList.length;
        },

        get coreAnchorsList() {
          if (this.intelScope === 'active') {
            const list = [];
            const freqMap = new Map();
            for (const p of (this.selectedKeywordDetails?.current_pins || [])) {
              const tags = p._cachedVisualTagsLower || this.getPinVisualTags(p).map(t => t.toLowerCase());
              const seen = new Set();
              for (const t of tags) {
                if (!seen.has(t)) {
                  seen.add(t);
                  freqMap.set(t, (freqMap.get(t) || 0) + 1);
                }
              }
            }
            for (const [tag, count] of freqMap.entries()) {
              if (count >= 2) {
                list.push({ tag, count });
              }
            }
            return list.sort((a, b) => b.count - a.count);
          }

          if (Array.isArray(this.selectedKeywordDetails?.core_anchors) && this.selectedKeywordDetails.core_anchors.length > 0) {
            return this.selectedKeywordDetails.core_anchors;
          }
          const freqMap = this.tagFrequencyMap;
          const list = [];
          for (const [tag, count] of freqMap.entries()) {
            if (count >= 2) {
              list.push({ tag, count });
            }
          }
          return list.sort((a, b) => b.count - a.count);
        },

        filteredAnchorsList() {
          let list = this.coreAnchorsList || [];
          if (this.anchorsTier === 'high') {
            list = list.filter(a => a.count >= 10);
          } else if (this.anchorsTier === 'core') {
            list = list.filter(a => a.count >= 5);
          }
          if (this.anchorsSearch && this.anchorsSearch.trim()) {
            const q = this.anchorsSearch.toLowerCase().trim();
            list = list.filter(a => a.tag.toLowerCase().includes(q));
          }
          return list;
        },

        paginatedAnchorsTable() {
          const list = this.filteredAnchorsList();
          const start = (this.anchorsPage - 1) * this.anchorsPageSize;
          return list.slice(start, start + this.anchorsPageSize);
        },

        totalAnchorsPages() {
          return Math.ceil(this.filteredAnchorsList().length / this.anchorsPageSize) || 1;
        },

        setAnchorsPage(p) {
          if (p >= 1 && p <= this.totalAnchorsPages()) {
            this.anchorsPage = p;
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        filteredDomainsList() {
          let list = this.domainBreakdownList || [];
          if (this.domainSearch && this.domainSearch.trim()) {
            const q = this.domainSearch.toLowerCase().trim();
            list = list.filter(d => d.domain.toLowerCase().includes(q));
          }
          return list;
        },

        paginatedDomainsList() {
          const list = this.filteredDomainsList();
          const start = (this.domainPage - 1) * this.domainPageSize;
          return list.slice(start, start + this.domainPageSize);
        },

        totalDomainsPages() {
          return Math.ceil(this.filteredDomainsList().length / this.domainPageSize) || 1;
        },

        setDomainPage(p) {
          if (p >= 1 && p <= this.totalDomainsPages()) {
            this.domainPage = p;
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        get tagFrequencyMap() {
          if (!this.cachedTagFreqMap) {
            this.rebuildPinCaches();
          }
          return this.cachedTagFreqMap || new Map();
        },

        getTagFrequency(tag) {
          if (!tag) return 0;
          if (!this.cachedTagFreqMap) {
            this.rebuildPinCaches();
          }
          return this.cachedTagFreqMap?.get(String(tag).toLowerCase().trim()) || 0;
        },

        isCoreAnchorTag(tag) {
          if (!tag) return false;
          if (!this.cachedCoreAnchorsSet) {
            this.rebuildPinCaches();
          }
          return this.cachedCoreAnchorsSet?.has(String(tag).toLowerCase().trim()) || false;
        },

        get breakoutPins() {
          const maxAge = Number(this.appSettings.breakout_max_pin_age_days || this.appSettings.breakout_rules?.max_pin_age_days || 30);
          const minVel = Number(this.appSettings.breakout_min_velocity || this.appSettings.breakout_rules?.min_daily_save_velocity || 1.5);
          return (this.allCombinedPins || []).filter(p => {
            if (p.is_breakout_candidate) return true;
            if (Number(p.breakout_score || 0) >= 20) return true;
            const vel = Number(p.daily_save_velocity || 0);
            const age = Number(p.metadata?.pin_age_days || 999);
            const saves = Number(p.metadata?.raw_saves || p.save_count || p.current_saves || 0);
            if (vel >= minVel && age <= maxAge) return true;
            if (saves >= 50 && age <= 45) return true;
            return false;
          }).sort((a, b) => Number(b.breakout_score || b.daily_save_velocity || 0) - Number(a.breakout_score || a.daily_save_velocity || 0));
        },

        get filteredPins() {
          let list = [];
          if (this.serpScope === 'active') {
            list = (this.selectedKeywordDetails?.current_pins || []).map(p => ({ ...p, is_displaced: false }));
          } else if (this.serpScope === 'displaced') {
            list = this.displacedVaultPins;
          } else if (this.serpScope === 'breakout') {
            list = this.breakoutPins;
          } else if (this.serpScope === 'velocity') {
            list = this.allCombinedPins.filter(p => Number(p.daily_save_velocity || 0) > 0);
          } else {
            // 'all' or 'vault' (All Vault Pins: current + displaced deduplicated)
            list = this.allCombinedPins;
          }

          if (this.activeVisualTagFilter) {
            const vtag = this.activeVisualTagFilter.toLowerCase().trim();
            list = list.filter(p => {
              const tags = p._cachedVisualTagsLower || this.getPinVisualTags(p).map(t => t.toLowerCase());
              return tags.includes(vtag);
            });
          }

          if (this.activeDomainFilter) {
            const dom = this.activeDomainFilter.toLowerCase().trim();
            list = list.filter(p => {
              let d = (p.domain || '').toLowerCase().trim();
              if (!d && p.destination_url) {
                try { d = new URL(p.destination_url).hostname.replace(/^www\./, '').toLowerCase(); } catch (_) {}
              }
              return d === dom;
            });
          }

          if (this.formatFilter && this.formatFilter !== 'ALL') {
            list = list.filter(p => (p.metadata?.format || p.format || 'ORGANIC PIN') === this.formatFilter);
          }

          if (this.pinSearch && this.pinSearch.trim()) {
            const q = this.pinSearch.toLowerCase().trim();
            list = list.filter(p => 
              (p.title || '').toLowerCase().includes(q) ||
              (p.domain || '').toLowerCase().includes(q) ||
              (p.metadata?.pinner?.username || '').toLowerCase().includes(q) ||
              (p.metadata?.pinner?.full_name || '').toLowerCase().includes(q) ||
              this.getPinVisualTags(p).some(t => t.toLowerCase().includes(q))
            );
          }

          if (this.pinSort === 'velocity') {
            return [...list].sort((a, b) => Number(b.daily_save_velocity || 0) - Number(a.daily_save_velocity || 0));
          } else if (this.pinSort === 'saves') {
            return [...list].sort((a, b) => {
              const aEngage = Number(a.metadata?.raw_saves || a.save_count || a.current_saves || 0);
              const bEngage = Number(b.metadata?.raw_saves || b.save_count || b.current_saves || 0);
              return bEngage - aEngage;
            });
          } else if (this.pinSort === 'age') {
            return [...list].sort((a, b) => Number(a.metadata?.pin_age_days || 9999) - Number(b.metadata?.pin_age_days || 9999));
          }

          return [...list].sort((a, b) => {
            if (a.is_displaced && !b.is_displaced) return 1;
            if (!a.is_displaced && b.is_displaced) return -1;
            return Number(a.catalog_rank || a.rank_position || a.last_known_rank || 999) - Number(b.catalog_rank || b.rank_position || b.last_known_rank || 999);
          });
        },

        get pinTotalPages() {
          if (this.pinPageSize === 'all') return 1;
          const count = this.filteredPins.length;
          if (count === 0) return 1;
          return Math.max(1, Math.ceil(count / Number(this.pinPageSize || 50)));
        },

        get paginatedPins() {
          if (this.pinPageSize === 'all') return this.filteredPins;
          const size = Number(this.pinPageSize || 50);
          const start = (this.pinPage - 1) * size;
          return this.filteredPins.slice(start, start + size);
        },

        get pinPageNumbers() {
          const total = this.pinTotalPages;
          const current = this.pinPage;
          if (total <= 7) {
            return Array.from({ length: total }, (_, i) => i + 1);
          }
          const pages = [];
          if (current <= 4) {
            for (let i = 1; i <= 5; i++) pages.push(i);
            pages.push('...');
            pages.push(total);
          } else if (current >= total - 3) {
            pages.push(1);
            pages.push('...');
            for (let i = total - 4; i <= total; i++) pages.push(i);
          } else {
            pages.push(1);
            pages.push('...');
            pages.push(current - 1);
            pages.push(current);
            pages.push(current + 1);
            pages.push('...');
            pages.push(total);
          }
          return pages;
        },

        setPinPage(p) {
          if (p >= 1 && p <= this.pinTotalPages) {
            this.pinPage = p;
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        getPinGlobalIndex(idx) {
          const size = this.pinPageSize === 'all' ? 0 : Number(this.pinPageSize || 50);
          return (this.pinPage - 1) * size + idx;
        },

        init() {
          this.selectedProjectId = ''; // Keywords & SERP studio strictly bind to Central Metadata Hub
          this.darkMode = typeof localStorage !== 'undefined' ? localStorage.getItem('pa_theme') !== 'light' : true;
          this.isDark = this.darkMode;
          this.applyTheme();
          this.fetchSettings();
          this.fetchFleetProjects();

          if (this.activeFolderId) {
            this.dashboardFolderFilter = this.activeFolderId;
            (async () => {
              try {
                const fRes = await fetch('/api/folders/' + encodeURIComponent(this.activeFolderId));
                if (fRes.ok) {
                  const fData = await fRes.json().catch(() => ({}));
                  this.activeFolder = fData.folder || null;
                }
              } catch (_) {}
            })();
          }

          if (typeof window !== 'undefined') {
            window.addEventListener('keydown', (e) => {
              if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
                const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
                if (activeTag !== 'input' && activeTag !== 'textarea') {
                  e.preventDefault();
                  this.toggleSidebar();
                }
              }
            });
          }

          try {
            const savedCols = localStorage.getItem('keywords_visible_columns');
            if (savedCols) {
              const parsed = JSON.parse(savedCols);
              if (parsed && typeof parsed === 'object') {
                delete parsed.velocity;
                delete parsed.saves_delta;
                delete parsed.repins_delta;
                this.visibleColumns = { ...this.visibleColumns, ...parsed, keyword: true };
                delete this.visibleColumns.velocity;
                delete this.visibleColumns.saves_delta;
                delete this.visibleColumns.repins_delta;
              }
            }
          } catch (_) {}

          window.addEventListener('popstate', (e) => {
            const path = window.location.pathname || '';
            if (path === '/keywords' || path === '/keywords/') {
              this.viewModeLevel = 'dashboard';
              this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
            } else {
              const pathSlug = this.extractSlugFromUrl();
              if (pathSlug) {
                this.viewModeLevel = 'serp_studio';
                this.loadKeywordBySlugOrText(pathSlug, false);
              }
            }
          });

          const urlSlug = this.extractSlugFromUrl() || window.__INITIAL_KEYWORD_SLUG__ || '';
          
          if (urlSlug) {
            this.viewModeLevel = 'serp_studio';
            this.loadKeywordBySlugOrText(urlSlug, false);
            // Defer secondary hub calls so they do not saturate DB connection pool during initial SERP render
            setTimeout(() => {
              this.fetchKeywords();
              this.fetchFolders();
            }, 600);
          } else {
            this.viewModeLevel = 'dashboard';
            this.fetchKeywords();
            this.fetchFolders();
          }

          this.$watch('dashboardSearch', () => { this.dashboardPage = 1; this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); }); });
          this.$watch('dashboardCategoryFilter', () => { this.dashboardPage = 1; this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); }); });
          this.$watch('dashboardStatusFilter', () => { this.dashboardPage = 1; this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); }); });
          this.$watch('dashboardFolderFilter', () => { this.dashboardPage = 1; this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); }); });
          this.$watch('dashboardGrowthFilter', () => { this.dashboardPage = 1; this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); }); });
          this.$watch('dashboardPinsFilter', () => { this.dashboardPage = 1; this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); }); });
          this.$watch('dashboardSort', () => { this.dashboardPage = 1; this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); }); });
          this.$watch('dashboardPageSize', () => { this.dashboardPage = 1; this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); }); });
          this.$watch('dashboardTotalPages', (total) => { if (this.dashboardPage > total) this.dashboardPage = Math.max(1, total); });
          this.$watch('dashboardViewMode', () => { this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); }); });
          this.$watch('pinSearch', () => { this.pinPage = 1; });
          this.$watch('serpScope', () => { this.pinPage = 1; });
          this.$watch('formatFilter', () => { this.pinPage = 1; });
          this.$watch('pinSort', () => { this.pinPage = 1; });
          this.$watch('activeVisualTagFilter', () => { this.pinPage = 1; });
          this.$watch('activeDomainFilter', () => { this.pinPage = 1; });
          this.$watch('pinPageSize', () => { this.pinPage = 1; });
          this.$watch('anchorsSearch', () => { this.anchorsPage = 1; });
          this.$watch('anchorsTier', () => { this.anchorsPage = 1; });
          this.$watch('domainSearch', () => { this.domainPage = 1; });
          this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
        },

        switchToDashboard() {
          this.viewModeLevel = 'dashboard';
          window.history.pushState(null, '', '/keywords');
          this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
        },

        switchToSerpStudio(kw) {
          this.viewModeLevel = 'serp_studio';
          if (kw) {
            this.selectKeyword(kw, true);
          }
          this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
        },

        toggleDashboardKeywordSelection(kwId) {
          const id = Number(kwId);
          const idx = this.selectedKeywordIds.findIndex(x => Number(x) === id);
          if (idx > -1) {
            this.selectedKeywordIds.splice(idx, 1);
          } else {
            this.selectedKeywordIds.push(id);
          }
        },

        toggleSelectAllDashboardKeywords() {
          const list = this.paginatedDashboardKeywords;
          const allSelected = list.length > 0 && list.every(k => this.isDashboardKeywordSelected(k.id));
          if (allSelected) {
            const pageIds = new Set(list.map(k => Number(k.id)));
            this.selectedKeywordIds = this.selectedKeywordIds.filter(id => !pageIds.has(Number(id)));
          } else {
            const newIds = new Set(this.selectedKeywordIds.map(x => Number(x)));
            list.forEach(k => newIds.add(Number(k.id)));
            this.selectedKeywordIds = Array.from(newIds);
          }
        },

        isDashboardKeywordSelected(kwId) {
          const id = Number(kwId);
          return this.selectedKeywordIds.some(x => Number(x) === id);
        },

        clearSelectedKeywords() {
          this.selectedKeywordIds = [];
        },

        async bulkSyncKeywords() {
          if (this.selectedKeywordIds.length === 0) return;
          this.isBulkLoading = true;
          this.showToast('Initiating refresh for ' + this.selectedKeywordIds.length + ' keywords...', 'info');
          try {
            const results = await Promise.allSettled(this.selectedKeywordIds.map(id => 
              (window.safeApiFetch || fetch)(this.getApiUrl('/api/keywords/sync'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ keyword_id: id, force: true })
              })
            ));
            const successCount = results.filter(r => r.status === 'fulfilled' && r.value?.ok).length;
            const failCount = results.length - successCount;
            if (failCount > 0) {
              this.showToast('Refreshed ' + successCount + ' keywords (' + failCount + ' failed due to rate limits or errors)', successCount > 0 ? 'warning' : 'error');
            } else {
              this.showToast('Refreshed ' + successCount + ' keywords!', 'success');
            }
            await this.fetchKeywords();
          } catch (err) {
            this.showToast('Bulk refresh error: ' + err.message, 'error');
          } finally {
            this.isBulkLoading = false;
            this.selectedKeywordIds = [];
          }
        },

        async bulkRefreshKeywords() {
          return this.bulkSyncKeywords();
        },

        async bulkToggleKeywordStatus(targetStatus) {
          if (this.selectedKeywordIds.length === 0) return;
          this.isBulkLoading = true;
          try {
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/keywords/status'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ids: this.selectedKeywordIds, is_active: targetStatus })
            });
            if (!res.ok) {
              const errPayload = await res.json().catch(() => ({}));
              throw new Error(errPayload.message || errPayload.error || ('HTTP ' + res.status));
            }
            this.showToast('Updated status for ' + this.selectedKeywordIds.length + ' keywords.', 'success');
            await this.fetchKeywords();
          } catch (err) {
            this.showToast('Bulk status update error: ' + err.message, 'error');
          } finally {
            this.isBulkLoading = false;
            this.selectedKeywordIds = [];
          }
        },

        async bulkDeleteKeywords() {
          if (this.selectedKeywordIds.length === 0) return;
          if (!confirm('Are you sure you want to delete ' + this.selectedKeywordIds.length + ' tracked keywords?')) return;
          this.isBulkLoading = true;
          try {
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/keywords'), {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ids: this.selectedKeywordIds })
            });
            if (!res.ok) {
              const errPayload = await res.json().catch(() => ({}));
              throw new Error(errPayload.message || errPayload.error || ('HTTP ' + res.status));
            }
            this.showToast('Deleted ' + this.selectedKeywordIds.length + ' keywords.', 'info');
            await this.fetchKeywords();
          } catch (err) {
            this.showToast('Bulk delete error: ' + err.message, 'error');
          } finally {
            this.isBulkLoading = false;
            this.selectedKeywordIds = [];
          }
        },

        openBulkFolderModal() {
          if (this.selectedKeywordIds.length === 0) return;
          this.bulkTargetFolderId = this.folders[0]?.id || '';
          this.isBulkFolderModalOpen = true;
        },

        async commitBulkFolder() {
          if (!this.bulkTargetFolderId || this.selectedKeywordIds.length === 0) return;
          this.isBulkLoading = true;
          try {
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/keywords/folders/items'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                folder_id: this.bulkTargetFolderId,
                keyword_ids: this.selectedKeywordIds
              })
            });
            if (!res.ok) {
              const errPayload = await res.json().catch(() => ({}));
              throw new Error(errPayload.message || errPayload.error || ('HTTP ' + res.status));
            }
            this.showToast('Added ' + this.selectedKeywordIds.length + ' keywords to campaign folder!', 'success');
            this.isBulkFolderModalOpen = false;
            await this.fetchFolders();
          } catch (err) {
            this.showToast('Bulk folder error: ' + err.message, 'error');
          } finally {
            this.isBulkLoading = false;
            this.selectedKeywordIds = [];
          }
        },

        async toggleKeywordStatus(kw) {
          if (!kw?.id) return;
          const newStatus = !(kw.is_active !== false);
          try {
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/keywords/status'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: kw.id, is_active: newStatus })
            });
            if (res.ok) {
              kw.is_active = newStatus;
              this.showToast('Keyword "' + kw.keyword + '" is now ' + (newStatus ? 'Active' : 'Paused') + '.', 'info');
            }
          } catch (err) {
            this.showToast('Failed to update status: ' + err.message, 'error');
          }
        },

        computeSerpPowerPairs() {
          const pins = this.filteredPins || [];
          if (pins.length === 0) return [];
          
          const tagCounts = new Map();
          const pairCounts = new Map();
          let validPinCount = 0;

          for (const pin of pins) {
            const rawTags = this.getPinVisualTags(pin).map(s => s.toLowerCase());

            const uniqueTags = Array.from(new Set(rawTags));
            // Combinatorial guardrail: strictly cap at k <= 15 tags per pin
            const boundedTags = uniqueTags.slice(0, 15);
            if (boundedTags.length < 2) continue;
            validPinCount++;

            for (const tag of boundedTags) {
              tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
            }

            for (let i = 0; i < boundedTags.length; i++) {
              for (let j = i + 1; j < boundedTags.length; j++) {
                const t1 = boundedTags[i] < boundedTags[j] ? boundedTags[i] : boundedTags[j];
                const t2 = boundedTags[i] < boundedTags[j] ? boundedTags[j] : boundedTags[i];
                const key = t1 + '|||' + t2;
                pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
              }
            }
          }

          if (validPinCount === 0 || pairCounts.size === 0) return [];

          const results = [];
          const N = validPinCount;

          for (const [key, count] of pairCounts.entries()) {
            if (count < 2) continue;
            const [tagA, tagB] = key.split('|||');
            const countA = tagCounts.get(tagA) || 1;
            const countB = tagCounts.get(tagB) || 1;
            // Phase 5: Standardized Laplace-smoothed Lift:
            // Lift_smoothed = ((C_AB + 1) * (N + 4)) / ((C_A + 2) * (C_B + 2))
            const liftRaw = ((count + 1) * (N + 4)) / ((countA + 2) * (countB + 2));
            const lift = Number.isFinite(liftRaw) ? Number(liftRaw.toFixed(2)) : 1.0;
            results.push({
              tagA,
              tagB,
              count,
              lift,
              supportPct: Number(((count / N) * 100).toFixed(1))
            });
          }

          return results.sort((a, b) => b.lift - a.lift).slice(0, 8);
        },

        copySerpVisualBlueprint(pair) {
          if (!pair) return;
          const kw = this.selectedKeyword?.keyword || this.activeKeywordQuery || '';
          const prompt = 'Hyper-detailed Pinterest viral pin aesthetic, combining "' + pair.tagA + '" with "' + pair.tagB + '" for organic search query "' + kw + '". Ultra-high CTR commercial composition, vibrant focal lighting, clean negative space for typography overlay, editorial photography --ar 2:3 --stylize 250';
          this.copyToClipboard(prompt, 'Copied Visual Blueprint Prompt for ' + pair.tagA + ' + ' + pair.tagB + '!');
        },

        extractSlugFromUrl() {
          const path = window.location.pathname || '';
          if (path.startsWith('/keywords/')) {
            const raw = path.slice('/keywords/'.length);
            return decodeURIComponent(raw).trim();
          }
          const urlParams = new URLSearchParams(window.location.search);
          return urlParams.get('q') || urlParams.get('keyword') || urlParams.get('slug') || '';
        },

        applyTheme() {
          if (this.darkMode) {
            document.documentElement.classList.add('dark');
            localStorage.setItem('pa_theme', 'dark');
            localStorage.setItem('pin_theme', 'dark');
          } else {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('pa_theme', 'light');
            localStorage.setItem('pin_theme', 'light');
          }
        },

        toggleTheme() {
          this.darkMode = !this.darkMode;
          this.applyTheme();
        },

        showToast(message, type = 'info') {
          this.toast = { show: true, message, type };
          this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          setTimeout(() => { this.toast.show = false; }, 3500);
        },

        getApiUrl(path) {
          return path;
        },

        onProjectChange() {
          localStorage.setItem('pa_selected_project_id', this.selectedProjectId);
          this.selectedKeyword = null;
          this.selectedKeywordDetails = null;
          this.fetchKeywords();
        },

        async fetchFleetProjects() {
          try {
            const res = await fetch('/api/fleet/projects');
            if (res.ok) {
              const data = await res.json();
              this.fleetProjects = data.projects || [];
            }
          } catch (_) {}
        },

        normalizeKeyword(k) {
          if (!k) return k;
          k._totalPins = this.getKeywordTotalPins(k);
          k._velocity = this.getKeywordVelocity(k);
          k._saveDelta = this.getKeywordSaveDelta(k);
          k._repinDelta = this.getKeywordRepinDelta(k);
          k._createdAtMs = k.created_at ? (Date.parse(k.created_at) || 0) : 0;
          k._crawledAtMs = k.last_crawled_at ? (Date.parse(k.last_crawled_at) || 0) : 0;
          k._formattedCreatedAt = this.formatDate(k.created_at);
          k._relativeCreatedAt = this.formatRelativeTime(k.created_at);
          k._formattedCrawledAt = this.formatDate(k.last_crawled_at);
          k._relativeCrawledAt = this.formatRelativeTime(k.last_crawled_at);
          const folders = this.getKeywordFolders(k);
          k._folders = folders;
          k._searchCorpus = ((k.keyword || '') + ' ' + (k.category || '') + ' ' + (folders.map(f => f.name || '').join(' '))).toLowerCase();
          return k;
        },

        async fetchKeywords(forceRefresh = false) {
          this.isKeywordsLoading = true;
          try {
            const refreshParam = forceRefresh ? '&refresh=true' : '';
            const folderParam = this.activeFolderId ? ('&folder_id=' + encodeURIComponent(this.activeFolderId)) : '';
            const res = await fetch(this.getApiUrl('/api/keywords?limit=1000' + refreshParam + folderParam));
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            const raw = Array.isArray(data.keywords) ? data.keywords : [];
            this.keywords = raw.map(k => this.normalizeKeyword(k));
          } catch (err) {
            this.showToast('Failed to load keywords: ' + err.message, 'error');
          } finally {
            this.isKeywordsLoading = false;
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        async loadKeywordBySlugOrText(slugOrText, updateHistory = true, allowCreate = false) {
          if (!slugOrText) return;
          const cleanText = slugOrText.replace(/[-_]+/g, ' ').trim().toLowerCase();
          const cleanSlug = cleanText.replace(/\\s+/g, '-');
          this.activeKeywordQuery = cleanText;

          // Fetch official 52-week trends asynchronously
          this.fetchTrends(cleanText);

          const match = this.keywords.find(k => 
            k.keyword.toLowerCase() === cleanText ||
            k.keyword.toLowerCase().replace(/\\s+/g, '-') === cleanSlug
          );

          if (match) {
            await this.selectKeyword(match, updateHistory);
          } else {
            this.isDetailsLoading = true;
            try {
              const autoParam = allowCreate ? '&auto_create=true' : '';
              const res = await fetch(this.getApiUrl('/api/keywords/serp-compare?slug=' + encodeURIComponent(cleanSlug) + autoParam));
              const data = await res.json();
              if (data.success && data.keyword) {
                this.selectedKeyword = data.keyword;
                this.selectedKeywordDetails = data;
                this.displacedOffset = 0;
                this.displacedPins = [];
                if (data.total_displaced_count !== undefined) {
                  this.displacedPinsTotal = Number(data.total_displaced_count);
                }
                this.anchorsPage = 1;
                this.anchorsSearch = '';
                this.domainPage = 1;
                this.domainSearch = '';
                this.rebuildPinCaches();
                if (data.keyword.id) {
                  this.fetchDisplacedPins(data.keyword.id);
                }
                if (!this.keywords.some(k => k.id === data.keyword.id)) {
                  this.keywords.unshift(this.normalizeKeyword(data.keyword));
                }
                if (updateHistory) {
                  window.history.pushState(null, '', '/keywords/' + encodeURIComponent(cleanSlug));
                }
              } else {
                throw new Error(data.error || 'Could not resolve keyword');
              }
            } catch (err) {
              this.showToast('Error loading keyword: ' + err.message, 'error');
            } finally {
              this.isDetailsLoading = false;
              this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
            }
          }
        },

        async selectKeyword(kw, updateHistory = true) {
          if (!kw) return;
          this.selectedKeyword = kw;
          this.activeKeywordQuery = kw.keyword;
          this.pinPage = 1;
          this.selectedPinIds = [];
          this.anchorsPage = 1;
          this.anchorsSearch = '';
          this.domainPage = 1;
          this.domainSearch = '';
          this.isDetailsLoading = true;
          this.activeTab = 'serp';
          this.displacedOffset = 0;
          this.displacedPins = [];
          this.displacedPinsTotal = Number(kw.displaced_pins_count || 0);

          // Fetch 52-week trends
          this.fetchTrends(kw.keyword);
          this.fetchCurrentKeywordFolders();
          this.fetchDisplacedPins(kw.id);

          const cleanSlug = kw.keyword.trim().toLowerCase().replace(/\\s+/g, '-');
          if (updateHistory) {
            window.history.pushState(null, '', '/keywords/' + encodeURIComponent(cleanSlug));
          }

          if (this.detailAbortController) {
            this.detailAbortController.abort();
          }
          this.detailAbortController = new AbortController();
          const currentReqId = ++this.detailRequestId;

          try {
            const res = await fetch(this.getApiUrl('/api/keywords/serp-compare?keyword_id=' + kw.id), {
              signal: this.detailAbortController.signal
            });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();

            if (currentReqId !== this.detailRequestId) return;

            this.selectedKeywordDetails = data;
            if (data.total_displaced_count !== undefined) {
              this.displacedPinsTotal = Number(data.total_displaced_count);
            }
            this.rebuildPinCaches();
          } catch (err) {
            if (err.name === 'AbortError') return;
            if (currentReqId === this.detailRequestId) {
              this.showToast('Error loading SERP details: ' + err.message, 'error');
            }
          } finally {
            if (currentReqId === this.detailRequestId) {
              this.isDetailsLoading = false;
              this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
            }
          }
        },

        async fetchTrends(term, force = false) {
          if (!term) return;
          this.isTrendsLoading = true;
          try {
            if (force) {
              const fetchFn = window.safeApiFetch || fetch;
              const res = await fetchFn(this.getApiUrl('/api/keywords/trends/refresh'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ term, force: true })
              });
              if (res && res.ok) {
                const data = await res.json();
                if (data.success) {
                  this.trendsData = { ...(this.trendsData || {}), ...data };
                  return;
                }
              }
            }

            const [trendsRes, popularRes] = await Promise.allSettled([
              fetch(this.getApiUrl('/api/keywords/trends?term=' + encodeURIComponent(term))),
              fetch(this.getApiUrl('/api/keywords/trends/popular-pins?term=' + encodeURIComponent(term)))
            ]);

            let merged = {};
            if (trendsRes.status === 'fulfilled' && trendsRes.value.ok) {
              const tData = await trendsRes.value.json();
              if (tData.success) merged = { ...tData };
            }
            if (popularRes.status === 'fulfilled' && popularRes.value.ok) {
              const pData = await popularRes.value.json();
              if (pData.success && Array.isArray(pData.popular_pins) && pData.popular_pins.length > 0) {
                merged.popular_pins = pData.popular_pins;
              }
              if (pData.success && Array.isArray(pData.collage_images) && pData.collage_images.length > 0 && (!merged.collage_images || merged.collage_images.length === 0)) {
                merged.collage_images = pData.collage_images;
              }
            }

            if (Object.keys(merged).length > 0) {
              this.trendsData = { ...(this.trendsData || {}), ...merged };
            }
          } catch (_) {} finally {
            this.isTrendsLoading = false;
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        // Pin Deep Dossier & Trajectory Controls (Image 2 Parity)
        async openPinInspector(pin) {
          if (!pin) return;
          this.activeInspectorPin = { ...pin };
          const list = this.filteredPins;
          this.activeInspectorPinIndex = list.findIndex(p => p.pin_id === pin.pin_id);
          this.dossierData = null;
          this.trajectoryData = null;
          this.isPinDrawerOpen = true;
          this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });

          if (this.pinInspectorAbortController) {
            this.pinInspectorAbortController.abort();
          }
          this.pinInspectorAbortController = new AbortController();
          const currentReqId = ++this.activePinRequestId;

          await Promise.allSettled([
            this.fetchPinDossier(pin.pin_id, this.selectedKeyword?.id, currentReqId, this.pinInspectorAbortController.signal),
            this.fetchPinTrajectory(pin.pin_id, this.selectedKeyword?.id, this.trajectoryRange, currentReqId, this.pinInspectorAbortController.signal)
          ]);
        },

        closePinInspector() {
          if (this.pinInspectorAbortController) {
            this.pinInspectorAbortController.abort();
            this.pinInspectorAbortController = null;
          }
          this.activePinRequestId++;
          this.isPinDrawerOpen = false;
          this.activeInspectorPin = null;
          this.dossierData = null;
          this.trajectoryData = null;
        },

        async fetchPinDossier(pinId, keywordId, reqId, signal) {
          const cleanPin = String(pinId || '').trim();
          if (!cleanPin) return;
          const currentReqId = reqId || this.activePinRequestId;
          const abortSignal = signal || this.pinInspectorAbortController?.signal;
          if (currentReqId !== this.activePinRequestId) return;
          this.isDossierLoading = true;
          try {
            const kid = keywordId || this.selectedKeyword?.id || '';
            const res = await fetch(this.getApiUrl('/api/keywords/pins/dossier?pin_id=' + encodeURIComponent(cleanPin) + (kid ? '&keyword_id=' + kid : '')), {
              signal: abortSignal
            });
            if (currentReqId !== this.activePinRequestId) return;
            if (res.ok) {
              const data = await res.json();
              if (currentReqId !== this.activePinRequestId) return;
              if (data.success) {
                this.dossierData = data.dossier || data;
              }
            }
          } catch (err) {
            if (err.name === 'AbortError') return;
          } finally {
            if (currentReqId === this.activePinRequestId) {
              this.isDossierLoading = false;
              this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
            }
          }
        },

        async fetchPinTrajectory(pinId, keywordId, range, reqId, signal) {
          const cleanPin = String(pinId || '').trim();
          if (!cleanPin) return;
          const currentReqId = reqId || this.activePinRequestId;
          const abortSignal = signal || this.pinInspectorAbortController?.signal;
          if (currentReqId !== this.activePinRequestId) return;
          this.isTrajectoryLoading = true;
          const r = range || this.trajectoryRange || '30d';
          try {
            const kid = keywordId || this.selectedKeyword?.id || '';
            const res = await fetch(this.getApiUrl('/api/keywords/pins/trajectory?pin_id=' + encodeURIComponent(cleanPin) + '&range=' + r + (kid ? '&keyword_id=' + kid : '')), {
              signal: abortSignal
            });
            if (currentReqId !== this.activePinRequestId) return;
            if (res.ok) {
              const data = await res.json();
              if (currentReqId !== this.activePinRequestId) return;
              if (data.success) {
                this.trajectoryData = data;
              }
            }
          } catch (err) {
            if (err.name === 'AbortError') return;
          } finally {
            if (currentReqId === this.activePinRequestId) {
              this.isTrajectoryLoading = false;
              this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
            }
          }
        },

        changeTrajectoryRange(range) {
          this.trajectoryRange = range;
          if (this.activeInspectorPin?.pin_id) {
            this.fetchPinTrajectory(this.activeInspectorPin.pin_id, this.selectedKeyword?.id, range, this.activePinRequestId, this.pinInspectorAbortController?.signal);
          }
        },

        async fetchDisplacedPins(keywordId, append = false) {
          const kid = keywordId || this.selectedKeyword?.id;
          if (!kid) return;
          if (append) {
            this.isLoadingMoreDisplaced = true;
          } else {
            this.isDisplacedLoading = true;
            this.displacedOffset = 0;
          }
          try {
            const offset = append ? this.displacedOffset : 0;
            const limit = 24;
            const statusParam = this.displacedStatusFilter !== 'ALL' ? '&status=' + encodeURIComponent(this.displacedStatusFilter) : '';
            const res = await fetch(this.getApiUrl('/api/keywords/displaced?keyword_id=' + kid + '&limit=' + limit + '&offset=' + offset + statusParam));
            if (res.ok) {
              const data = await res.json();
              const incoming = data.displaced_pins || data.pins || [];
              if (append) {
                const existingIds = new Set([
                  ...this.displacedPins.map(p => String(p.pin_id || p.id)),
                  ...(this.selectedKeywordDetails?.dropped_out_pins || []).map(p => String(p.pin_id || p.id))
                ]);
                const fresh = incoming.filter(p => !existingIds.has(String(p.pin_id || p.id)));
                this.displacedPins = [...this.displacedPins, ...fresh];
                this.displacedOffset += incoming.length;
              } else {
                this.displacedPins = incoming;
                this.displacedOffset = incoming.length;
              }
              if (data.total !== undefined && data.total !== null) {
                this.displacedPinsTotal = Number(data.total);
              } else {
                this.displacedPinsTotal = Math.max(this.displacedPinsTotal || 0, this.displacedPins.length);
              }
              if (append && incoming.length < limit) {
                this.displacedPinsTotal = Math.max(this.displacedPins.length, (this.selectedKeywordDetails?.dropped_out_pins || []).length);
              }
              this.rebuildPinCaches();
            }
          } catch (_) {} finally {
            this.isDisplacedLoading = false;
            this.isLoadingMoreDisplaced = false;
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        async loadMoreDisplacedPins() {
          if (this.isLoadingMoreDisplaced || this.isDisplacedLoading) return;
          if (this.displacedVaultPins.length >= this.totalDisplacedCount) return;
          if (this.displacedOffset === 0 && this.displacedVaultPins.length > 0) {
            this.displacedOffset = this.displacedVaultPins.length;
          }
          await this.fetchDisplacedPins(this.selectedKeyword?.id, true);
        },

        async fetchSettings() {
          try {
            const res = await fetch(this.getApiUrl('/api/settings'));
            if (res.ok) {
              const data = await res.json();
              if (data.success && data.settings) {
                this.appSettings = { ...this.appSettings, ...data.settings };
                this.settingsCrawlPages = Number(data.settings.default_crawl_pages || 2);
                this.settingsMaxSerpPins = Number(data.settings.max_serp_pins || data.settings.default_max_pins || 50);
                this.settingsMaxPins = this.settingsMaxSerpPins;
                this.settingsMaxCatalogInspect = data.settings.max_catalog_inspect !== undefined ? Number(data.settings.max_catalog_inspect) : 0;
                this.settingsEnableSerpHarvest = data.settings.enable_serp_harvest !== undefined ? Boolean(data.settings.enable_serp_harvest) : true;
                this.settingsCrawlScope = data.settings.default_crawl_scope || 'all_pins';
                this.settingsInspectionMode = data.settings.default_inspection_mode || 'full_catalog';
                this.settingsExcludePromoted = data.settings.exclude_promoted !== undefined ? Boolean(data.settings.exclude_promoted) : true;
                this.settingsExcludeBoardsAndSuggestions = data.settings.exclude_boards_and_suggestions !== undefined ? Boolean(data.settings.exclude_boards_and_suggestions) : true;
                this.settingsExcludeIgnoredPins = data.settings.exclude_ignored_pins !== undefined ? Boolean(data.settings.exclude_ignored_pins) : true;
                this.settingsMaxPinAgeDays = Number(data.settings.breakout_max_pin_age_days || data.settings.breakout_rules?.max_pin_age_days || 30);
                this.settingsMinVelocity = Number(data.settings.breakout_min_velocity || data.settings.breakout_rules?.min_daily_save_velocity || 1.5);
              }
            }
          } catch (e) {
            console.error('Failed to fetch settings:', e);
          }
        },

        openSettingsModal(kw = null) {
          const target = kw || (this.viewModeLevel === 'serp_studio' ? (this.selectedKeyword || this.selectedKeywordDetails?.keyword) : null);
          this.settingsTargetKeyword = target;
          if (target) {
            this.settingsCrawlPages = Number(target.crawl_pages_limit || this.appSettings.default_crawl_pages || 2);
            this.settingsMaxSerpPins = Number(target.target_pin_count || this.appSettings.max_serp_pins || this.appSettings.default_max_pins || 50);
            this.settingsMaxPins = this.settingsMaxSerpPins;
            this.settingsMaxCatalogInspect = Number(this.appSettings.max_catalog_inspect !== undefined ? this.appSettings.max_catalog_inspect : 0);
            this.settingsEnableSerpHarvest = this.appSettings.enable_serp_harvest !== undefined ? Boolean(this.appSettings.enable_serp_harvest) : true;
            this.settingsCrawlScope = this.appSettings.default_crawl_scope || 'all_pins';
            this.settingsInspectionMode = target.inspection_mode || this.appSettings.default_inspection_mode || 'full_catalog';
            this.settingsApplyGlobal = false;
          } else {
            this.settingsCrawlPages = Number(this.appSettings.default_crawl_pages || 2);
            this.settingsMaxSerpPins = Number(this.appSettings.max_serp_pins || this.appSettings.default_max_pins || 50);
            this.settingsMaxPins = this.settingsMaxSerpPins;
            this.settingsMaxCatalogInspect = Number(this.appSettings.max_catalog_inspect !== undefined ? this.appSettings.max_catalog_inspect : 0);
            this.settingsEnableSerpHarvest = this.appSettings.enable_serp_harvest !== undefined ? Boolean(this.appSettings.enable_serp_harvest) : true;
            this.settingsCrawlScope = this.appSettings.default_crawl_scope || 'all_pins';
            this.settingsInspectionMode = this.appSettings.default_inspection_mode || 'full_catalog';
            this.settingsApplyGlobal = true;
          }
          this.settingsExcludePromoted = this.appSettings.exclude_promoted !== undefined ? Boolean(this.appSettings.exclude_promoted) : true;
          this.settingsExcludeBoardsAndSuggestions = this.appSettings.exclude_boards_and_suggestions !== undefined ? Boolean(this.appSettings.exclude_boards_and_suggestions) : true;
          this.settingsExcludeIgnoredPins = this.appSettings.exclude_ignored_pins !== undefined ? Boolean(this.appSettings.exclude_ignored_pins) : true;
          this.settingsMaxPinAgeDays = Number(this.appSettings.breakout_max_pin_age_days || this.appSettings.breakout_rules?.max_pin_age_days || 30);
          this.settingsMinVelocity = Number(this.appSettings.breakout_min_velocity || this.appSettings.breakout_rules?.min_daily_save_velocity || 1.5);
          this.isSettingsModalOpen = true;
          this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
        },

        async saveSettings() {
          this.settingsLoading = true;
          try {
            if (this.settingsApplyGlobal || !this.settingsTargetKeyword) {
              const payload = {
                default_crawl_pages: this.settingsCrawlPages,
                default_max_pins: this.settingsMaxSerpPins || this.settingsMaxPins,
                max_serp_pins: this.settingsMaxSerpPins || this.settingsMaxPins,
                max_catalog_inspect: Number(this.settingsMaxCatalogInspect !== undefined ? this.settingsMaxCatalogInspect : 0),
                enable_serp_harvest: Boolean(this.settingsEnableSerpHarvest),
                default_crawl_scope: this.settingsCrawlScope || 'all_pins',
                default_inspection_mode: this.settingsInspectionMode || 'full_catalog',
                exclude_promoted: this.settingsExcludePromoted,
                exclude_boards_and_suggestions: this.settingsExcludeBoardsAndSuggestions,
                exclude_ignored_pins: this.settingsExcludeIgnoredPins,
                breakout_max_pin_age_days: this.settingsMaxPinAgeDays,
                breakout_min_velocity: this.settingsMinVelocity,
                breakout_rules: {
                  max_pin_age_days: this.settingsMaxPinAgeDays,
                  min_daily_save_velocity: this.settingsMinVelocity
                }
              };
              const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/settings'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
              });
              if (!res.ok) {
                const errPayload = await res.json().catch(() => ({}));
                throw new Error(errPayload.message || errPayload.error || 'Failed to save global settings');
              }
              this.appSettings = { ...this.appSettings, ...payload };
            }

            if (this.settingsTargetKeyword) {
              const kwPayload = {
                keyword_id: this.settingsTargetKeyword.id,
                crawl_pages_limit: this.settingsCrawlPages,
                target_pin_count: this.settingsMaxSerpPins || this.settingsMaxPins,
                inspection_mode: this.settingsInspectionMode
              };
              const resKw = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/keywords/settings'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(kwPayload)
              });
              if (!resKw.ok) {
                const errPayload = await resKw.json().catch(() => ({}));
                throw new Error(errPayload.message || errPayload.error || 'Failed to save keyword settings');
              }
              this.settingsTargetKeyword.crawl_pages_limit = this.settingsCrawlPages;
              this.settingsTargetKeyword.target_pin_count = this.settingsMaxSerpPins || this.settingsMaxPins;
              this.settingsTargetKeyword.inspection_mode = this.settingsInspectionMode;
              if (this.selectedKeyword && this.selectedKeyword.id === this.settingsTargetKeyword.id) {
                this.selectedKeyword.crawl_pages_limit = this.settingsCrawlPages;
                this.selectedKeyword.target_pin_count = this.settingsMaxSerpPins || this.settingsMaxPins;
                this.selectedKeyword.inspection_mode = this.settingsInspectionMode;
              }
              if (this.selectedKeywordDetails?.keyword && this.selectedKeywordDetails.keyword.id === this.settingsTargetKeyword.id) {
                this.selectedKeywordDetails.keyword.crawl_pages_limit = this.settingsCrawlPages;
                this.selectedKeywordDetails.keyword.target_pin_count = this.settingsMaxSerpPins || this.settingsMaxPins;
                this.selectedKeywordDetails.keyword.inspection_mode = this.settingsInspectionMode;
              }
              const inList = (this.keywords || []).find(k => k.id === this.settingsTargetKeyword.id);
              if (inList) {
                inList.crawl_pages_limit = this.settingsCrawlPages;
                inList.target_pin_count = this.settingsMaxSerpPins || this.settingsMaxPins;
                inList.inspection_mode = this.settingsInspectionMode;
              }
            }

            this.showToast('Settings saved successfully!', 'success');
            this.isSettingsModalOpen = false;
          } catch (err) {
            this.showToast('Error saving settings: ' + err.message, 'error');
          } finally {
            this.settingsLoading = false;
          }
        },

        getPaceDelta(pin, metric = 'saves') {
          if (!pin) return '';
          const filter = this.growthPaceFilter || '24h';
          if (filter === 'all') return '';

          let val = 0;
          const deltas = pin.metadata?.deltas || pin.deltas || {};
          if (filter === '24h') {
            val = Number(deltas[metric + '_24h'] ?? (metric === 'saves' ? (pin.daily_save_velocity ?? 0) : 0));
          } else if (filter === '3d') {
            val = Number(deltas[metric + '_3d'] ?? (metric === 'saves' ? ((pin.daily_save_velocity || 0) * 3) : 0));
          } else if (filter === '7d') {
            val = Number(deltas[metric + '_7d'] ?? (metric === 'saves' ? ((pin.daily_save_velocity || 0) * 7) : 0));
          }
          if (val > 0) return '+' + this.formatNumber(val);
          if (val < 0) return '-' + this.formatNumber(Math.abs(val));
          return '0';
        },

        getTrajectoryDualSvg(snapshots, width = 640, height = 220) {
          if (!snapshots || snapshots.length === 0) {
            return { isEmpty: true, isSingle: false, savesLine: '', savesArea: '', repinsLine: '', savesMax: 0, repinsMax: 0, points: [] };
          }
          if (snapshots.length === 1) {
            const rawS0 = Number(snapshots[0].save_count);
            const rawR0 = Number(snapshots[0].repin_count);
            const s0Save = Number.isFinite(rawS0) ? rawS0 : 0;
            const s0Repin = Number.isFinite(rawR0) ? rawR0 : 0;
            return {
              isEmpty: false,
              isSingle: true,
              singlePoint: { 
                x: (width / 2).toFixed(1), 
                y: (height / 2).toFixed(1), 
                date: snapshots[0].snapshot_date, 
                saves: s0Save, 
                repins: s0Repin 
              },
              savesLine: '',
              savesArea: '',
              repinsLine: '',
              savesMax: s0Save,
              repinsMax: s0Repin,
              points: []
            };
          }

          const savesVals = snapshots.map(s => {
            const v = Number(s.save_count);
            return Number.isFinite(v) ? v : 0;
          });
          const repinsVals = snapshots.map(s => {
            const v = Number(s.repin_count);
            return Number.isFinite(v) ? v : 0;
          });
          const savesMin = Math.min(...savesVals);
          const savesMax = Math.max(...savesVals, savesMin + 1);
          const savesRange = (savesMax - savesMin) || 1;

          const repinsMin = Math.min(...repinsVals);
          const repinsMax = Math.max(...repinsVals, repinsMin + 1);
          const repinsRange = (repinsMax - repinsMin) || 1;

          const step = width / (snapshots.length - 1);
          const points = snapshots.map((s, i) => {
            const x = (i * step).toFixed(1);
            const sVal = Number.isFinite(Number(s.save_count)) ? Number(s.save_count) : 0;
            const rVal = Number.isFinite(Number(s.repin_count)) ? Number(s.repin_count) : 0;
            const saveY = (height - 30 - ((sVal - savesMin) / savesRange) * (height - 60)).toFixed(1);
            const repinY = (height - 30 - ((rVal - repinsMin) / repinsRange) * (height - 60)).toFixed(1);
            return { x, saveY, repinY, date: s.snapshot_date, saves: sVal, repins: rVal };
          });

          const savesLine = points.map((p, i) => (i === 0 ? 'M' : 'L') + ' ' + p.x + ' ' + p.saveY).join(' ');
          const savesArea = savesLine + ' L ' + width + ' ' + (height - 15) + ' L 0 ' + (height - 15) + ' Z';
          const repinsLine = points.map((p, i) => (i === 0 ? 'M' : 'L') + ' ' + p.x + ' ' + p.repinY).join(' ');

          return { isEmpty: false, isSingle: false, savesLine, savesArea, repinsLine, savesMax, repinsMax, points };
        },

        togglePinSelection(pinId) {
          if (this.selectedPinIds.includes(pinId)) {
            this.selectedPinIds = this.selectedPinIds.filter(id => id !== pinId);
          } else {
            this.selectedPinIds.push(pinId);
          }
        },

        toggleSelectAllPins() {
          const list = this.paginatedPins;
          const allCurrentSelected = list.length > 0 && list.every(p => this.selectedPinIds.includes(p.pin_id));
          if (allCurrentSelected) {
            const currentIds = new Set(list.map(p => p.pin_id));
            this.selectedPinIds = this.selectedPinIds.filter(id => !currentIds.has(id));
          } else {
            const set = new Set(this.selectedPinIds);
            for (const p of list) {
              set.add(p.pin_id);
            }
            this.selectedPinIds = Array.from(set);
          }
        },

        isPinSelected(pinId) {
          return this.selectedPinIds.includes(pinId);
        },

        nextInspectorPin() {
          const list = this.filteredPins;
          if (this.activeInspectorPinIndex < list.length - 1) {
            this.activeInspectorPinIndex++;
            this.openPinInspector(list[this.activeInspectorPinIndex]);
          }
        },

        prevInspectorPin() {
          const list = this.filteredPins;
          if (this.activeInspectorPinIndex > 0) {
            this.activeInspectorPinIndex--;
            this.openPinInspector(list[this.activeInspectorPinIndex]);
          }
        },

        getInspectorAnnotations() {
          const raw = (this.dossierData?.annotations && this.dossierData.annotations.length > 0)
            ? this.dossierData.annotations
            : (this.activeInspectorPin?.metadata?.visual_annotations || []);
          return (raw || []).map(t => {
            if (typeof t === 'string') return t;
            if (t && typeof t === 'object') {
              return t.name || t.label || t.display_label || t.term || t.title || '';
            }
            return String(t || '');
          }).filter(Boolean);
        },

        copyAllInspectorTags() {
          const tags = this.getInspectorAnnotations();
          if (tags.length === 0) return;
          this.copyToClipboard(tags.join(', '), 'Copied ' + tags.length + ' Annotated Interests!');
        },

        async onOmnibarInput() {
          const q = this.omnibarQuery.trim();
          this.isOmnibarDropdownOpen = true;
          if (q.length < 2) {
            this.typeaheadSuggestions = [];
            return;
          }

          this.isTypeaheadLoading = true;
          try {
            const res = await fetch(this.getApiUrl('/api/keywords/typeahead?q=' + encodeURIComponent(q)));
            if (res.ok) {
              const data = await res.json();
              this.typeaheadSuggestions = data.suggestions || [];
            }
          } catch (_) {} finally {
            this.isTypeaheadLoading = false;
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        async submitOmnibarKeyword() {
          const raw = this.omnibarQuery.trim();
          if (!raw) return;
          this.isOmnibarDropdownOpen = false;
          this.omnibarQuery = '';
          await this.loadKeywordBySlugOrText(raw, true, true);
        },

        async trackNewKeyword(term) {
          const clean = term.trim();
          if (!clean) return;
          await this.loadKeywordBySlugOrText(clean, true, true);
        },

        async rescanActiveKeyword(force = true) {
          if (this.selectedKeyword?.id) {
            await this.rescanKeyword(this.selectedKeyword.id, force);
          } else if (this.activeKeywordQuery) {
            await this.loadKeywordBySlugOrText(this.activeKeywordQuery, true);
          }
        },

        async rescanKeyword(id, force = true) {
          this.syncingKeywordId = id;
          const kwObj = this.keywords.find(k => k.id === id) || (this.selectedKeyword?.id === id ? this.selectedKeyword : null);
          const crawlPages = kwObj?.crawl_pages_limit || this.appSettings.default_crawl_pages || 10;
          const maxPins = kwObj?.target_pin_count || this.appSettings.default_max_pins || 250;
          const inspectionMode = kwObj?.inspection_mode || this.appSettings.default_inspection_mode || 'full_catalog';

          this.showToast('Crawling fresh SERP (~' + maxPins + ' pins) from Pinterest...', 'info');

          try {
            const targetKw = kwObj?.keyword || (this.selectedKeyword?.id === id ? this.selectedKeyword?.keyword : '') || this.activeKeywordQuery || '';
            const targetSlug = kwObj?.slug || kwObj?.canonical_keyword || (this.selectedKeyword?.id === id ? this.selectedKeyword?.slug : '') || this.activeKeywordQuery || '';
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/keywords/sync'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                keyword_id: id,
                keyword: targetKw,
                slug: targetSlug,
                force: Boolean(force),
                crawl_pages: crawlPages,
                max_pins: maxPins,
                inspection_mode: inspectionMode,
                dispatch_workflow: false
              })
            });

            if (!res.ok) {
              const errPayload = await res.json().catch(() => ({}));
              throw new Error(errPayload.message || errPayload.error || ('HTTP ' + res.status));
            }
            const data = await res.json();
            const count = Number(data.result?.crawled_pins ?? (data.result?.pins_collected || 0));
            if (data.result?.success && count > 0) {
              this.showToast('SERP updated: ' + count + ' pins indexed!', 'success');
              await this.fetchKeywords();
              if (this.selectedKeyword && this.selectedKeyword.id === id) {
                await this.selectKeyword(this.selectedKeyword, false);
              }
              // [INVARIANT: ZERO-DOUBLE-TRIGGER]
              // [INVARIANT: EDGE-ONLY-RESCAN]
              // Table row re-crawl runs strictly on Cloudflare Edge (< 2s) with dispatch_workflow: false.
              // Deep fleet telemetry is triggered independently via the interactive Trigger Fleet modal.
            } else {
              const reason = data.result?.reason === 'zero_organic_results'
                ? '0 organic pins found on Pinterest (check cookie/query)'
                : (data.result?.reason || data.result?.message || 'No pins indexed');
              this.showToast('Crawl completed: ' + reason, 'warning');
              await this.fetchKeywords();
            }
          } catch (err) {
            this.showToast('Crawl error: ' + err.message, 'error');
          } finally {
            this.syncingKeywordId = null;
          }
        },

        async deleteKeyword(id) {
          if (!confirm('Are you sure you want to delete this tracked keyword and its snapshots?')) return;
          try {
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/keywords?id=' + id), { method: 'DELETE' });
            if (!res.ok) {
              const errPayload = await res.json().catch(() => ({}));
              throw new Error(errPayload.message || errPayload.error || ('HTTP ' + res.status));
            }
            this.showToast('Keyword deleted.', 'info');
            if (this.selectedKeyword?.id === id) {
              this.selectedKeyword = null;
              this.selectedKeywordDetails = null;
            }
            await this.fetchKeywords(true);
            if (this.keywords.length > 0 && !this.selectedKeyword) {
              this.selectKeyword(this.keywords[0]);
            }
          } catch (err) {
            this.showToast('Delete error: ' + err.message, 'error');
          }
        },

        openFleetDispatchModal(target = null) {
          const kwObj = (typeof target === 'object' && target !== null)
            ? target
            : (typeof target === 'string' && target
                ? (this.keywords.find(k => k.keyword?.toLowerCase() === target.toLowerCase()) || { keyword: target })
                : this.selectedKeyword);
          this.fleetDispatchTargetKeyword = kwObj?.keyword || '';
          this.fleetDispatchHarvestSerp = true;
          this.fleetDispatchScope = 'all_pins';
          this.fleetDispatchMaxPins = kwObj?.target_pin_count || this.appSettings?.default_max_pins || 50;
          this.isFleetDispatchModalOpen = true;
          this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
        },

        onFleetTargetKeywordChange() {
          if (!this.fleetDispatchTargetKeyword) {
            this.fleetDispatchMaxPins = this.appSettings?.default_max_pins || 50;
            return;
          }
          const kw = this.keywords.find(k => k.keyword?.toLowerCase() === this.fleetDispatchTargetKeyword.toLowerCase());
          if (kw) {
            this.fleetDispatchMaxPins = kw.target_pin_count || this.appSettings?.default_max_pins || 50;
          }
        },

        async executeFleetDispatch() {
          this.isWorkflowDispatching = true;
          this.isFleetDispatchModalOpen = false;
          this.showToast('Dispatching 20-Runner Swarm via GitHub Actions...', 'info');
          try {
            const targetKw = this.fleetDispatchTargetKeyword || '';
            const targetPins = String(this.fleetDispatchMaxPins || this.selectedKeyword?.target_pin_count || this.appSettings?.default_max_pins || 50);
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/keywords/dispatch-workflow'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                target_keyword: targetKw,
                keyword: targetKw,
                crawl_scope: this.fleetDispatchScope || 'all_pins',
                max_pins: targetPins,
                enable_serp_harvest: this.fleetDispatchHarvestSerp ? 'true' : 'false'
              })
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data?.success) {
              this.showToast('20-Runner Swarm dispatched successfully!', 'success');
            } else {
              this.showToast('Dispatch note: ' + (data.message || data.error || 'Check GitHub token'), 'error');
            }
          } catch (err) {
            this.showToast('Error triggering fleet: ' + err.message, 'error');
          } finally {
            this.isWorkflowDispatching = false;
          }
        },

        async triggerWorkflow(notify = true) {
          this.openFleetDispatchModal();
        },

        copyToClipboard(text, msg = 'Copied to clipboard!') {
          const cleanText = String(text || '').trim();
          if (!cleanText) return;
          if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            navigator.clipboard.writeText(cleanText).then(() => {
              this.showToast(msg, 'success');
            }).catch(() => {
              this.fallbackCopyText(cleanText, msg);
            });
          } else {
            this.fallbackCopyText(cleanText, msg);
          }
        },

        fallbackCopyText(text, msg) {
          try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            const successful = document.execCommand('copy');
            document.body.removeChild(ta);
            if (successful) {
              this.showToast(msg, 'success');
            } else {
              this.showToast('Please copy manually', 'warning');
            }
          } catch (_) {
            this.showToast('Copy not supported on this device', 'error');
          }
        },

        cleanControlChars(str) {
          if (!str) return '';
          return Array.from(String(str))
            .filter(ch => {
              const code = ch.charCodeAt(0);
              if (code < 32 || (code >= 127 && code <= 159)) return false;
              if (code >= 0x200B && code <= 0x200F) return false;
              if (code >= 0x202A && code <= 0x202E) return false;
              return true;
            })
            .join('')
            .replace(/\\s+/g, ' ')
            .trim();
        },

        copySEOFormula() {
          const kw = this.cleanControlChars(this.selectedKeyword?.keyword || this.activeKeywordQuery || '');
          if (!kw) return;
          const guides = this.selectedKeywordDetails?.guides || [];
          const topModifiers = guides
            .slice(0, 3)
            .map(g => this.cleanControlChars(g.display_label || g.term))
            .filter(Boolean)
            .join(' ');
          const formula = kw.charAt(0).toUpperCase() + kw.slice(1) + (topModifiers ? ' - ' + topModifiers : '');
          this.copyToClipboard(formula, 'Copied SEO Title Formula: "' + formula + '"');
        },

        formatNumber(num) {
          const n = Number(num || 0);
          if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
          if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
          return n.toLocaleString();
        },

        formatDate(d) {
          if (!d) return 'Never';
          try {
            const date = new Date(d);
            if (isNaN(date.getTime())) return String(d);
            return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          } catch (_) {
            return String(d);
          }
        },

        formatRelativeTime(d) {
          if (!d) return 'Never';
          try {
            const date = new Date(d);
            if (isNaN(date.getTime())) return 'Never';
            const diffMs = Date.now() - date.getTime();
            if (diffMs < 0) return 'Just now';
            const diffSec = Math.floor(diffMs / 1000);
            if (diffSec < 60) return diffSec + 's ago';
            const diffMin = Math.floor(diffSec / 60);
            if (diffMin < 60) return diffMin + 'm ago';
            const diffHours = Math.floor(diffMin / 60);
            if (diffHours < 24) return diffHours + 'h ago';
            const diffDays = Math.floor(diffHours / 24);
            if (diffDays < 7) return diffDays + 'd ago';
            return date.toLocaleDateString();
          } catch (_) {
            return String(d);
          }
        },

        getQuotaPercentage(kw) {
          if (!kw) return 0;
          const current = Number(kw.snapshots_count) || Number(kw.target_pin_count) || 250;
          const target = Number(kw.target_pin_count) || 250;
          return Math.min(100, Math.max(0, Math.round((current / target) * 100)));
        },

        getPinMethod(pin) {
          if (!pin) return 'pinterest_platform';
          const candidates = [
            pin.creation_method,
            pin.method,
            pin.metadata?.creation_method,
            pin.metadata?.method
          ].filter(m => m && typeof m === 'string' && m.trim().length > 0);
          return (candidates.find(m => m.trim().toLowerCase() !== 'pinterest_platform') || candidates[0] || 'pinterest_platform').toLowerCase().trim();
        },

        formatPinMethodLabel(pin) {
          const m = this.getPinMethod(pin);
          if (m.includes('schedule') || m.includes('tailwind') || m.includes('buffer')) return 'Pin Scheduling';
          if (m.includes('extension') || m.includes('button')) return 'Browser Extension';
          if (m.includes('api') || m.includes('developer')) return 'Pinterest API';
          if (m.includes('publishing') || m.includes('native')) return 'Native Publish';
          if (m.includes('carousel')) return 'Carousel';
          if (m.includes('platform') || m.includes('web') || m.includes('mobile')) return 'Pinterest Platform';
          return m.replace(/_/g, ' ').replace(/\\b\\w/g, c => c.toUpperCase());
        },

        getPinMethodBadgeClass(pin) {
          const m = this.getPinMethod(pin);
          if (m.includes('schedule')) {
            return 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30';
          }
          if (m.includes('extension')) {
            return 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30';
          }
          return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30';
        },

        getPinCreatedDate(pin) {
          if (!pin) return null;
          return pin.created_at_pinterest || pin.metadata?.created_at_pinterest || pin.metadata?.created_at || null;
        },

        formatPinCreated(pin) {
          const d = this.getPinCreatedDate(pin);
          if (!d) return 'Unknown';
          try {
            const dt = new Date(d);
            if (isNaN(dt.getTime())) return String(d);
            return dt.toUTCString().replace(' GMT', '');
          } catch (_) {
            return String(d);
          }
        },

        formatPinAge(pin) {
          const d = this.getPinCreatedDate(pin);
          if (!d) return '';
          try {
            const dt = new Date(d);
            if (isNaN(dt.getTime())) return '';
            const diffMs = Date.now() - dt.getTime();
            if (diffMs < 0) return 'Recent';
            const days = Math.floor(diffMs / 86400000);
            if (days === 0) return 'Today';
            if (days === 1) return '1d ago';
            if (days < 30) return days + 'd ago';
            if (days < 365) return Math.floor(days / 30) + 'mo ago';
            return (days / 365).toFixed(1) + 'y ago';
          } catch (_) {
            return '';
          }
        },

        async openVisualLens(pin) {
          this.visualLensPin = { ...pin };
          this.isVisualLensModalOpen = true;
          this.isVisualLensLoading = true;
          this.visualLensResults = [];
          this.visualLensError = null;

          try {
            const res = await fetch(this.getApiUrl('/api/keywords/visual-search?pin_id=' + encodeURIComponent(pin.pin_id)));
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to fetch visual search matches');
            this.visualLensResults = data.matches || [];
            const seedData = data.seed_pin || data.seed;
            if (seedData) {
              this.visualLensPin = {
                ...this.visualLensPin,
                title: (this.visualLensPin.title && !this.visualLensPin.title.startsWith('Pin #')) ? this.visualLensPin.title : (seedData.title || this.visualLensPin.title),
                image_url: this.visualLensPin.image_url || seedData.image_url,
                domain: this.visualLensPin.domain || seedData.domain,
                save_count: this.visualLensPin.save_count || seedData.save_count
              };
            }
          } catch (err) {
            this.visualLensError = err.message;
          } finally {
            this.isVisualLensLoading = false;
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        closeVisualLens() {
          this.isVisualLensModalOpen = false;
          this.visualLensPin = null;
          this.visualLensResults = [];
          this.visualLensError = null;
        },

        researchKeywordTag(tag) {
          this.closePinInspector();
          this.loadKeywordBySlugOrText(tag, true, true);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        },

        formatAge(days) {
          if (days === null || days === undefined || isNaN(Number(days))) return '-';
          const d = Number(days);
          if (d === 0) return 'Today';
          if (d === 1) return '1d ago';
          if (d < 30) return d + 'd ago';
          if (d < 365) return Math.floor(d / 30) + 'mo ago';
          return Math.floor(d / 365) + 'y ago';
        },

        getSparklinePoints(kw) {
          const history = kw.metadata?.velocity_history;
          if (Array.isArray(history) && history.length > 1) {
            return history.map(h => Number(h.velocity || 0));
          }
          const cur = Number(kw.avg_daily_velocity || 0);
          return [Math.max(0, cur * 0.6), Math.max(0, cur * 0.85), cur];
        },

        generateSparklinePath(points, width = 80, height = 20) {
          if (!points || points.length < 2) return '';
          const min = Math.min(...points);
          const max = Math.max(...points);
          const range = (max - min) === 0 ? 1 : (max - min);
          const step = width / (points.length - 1);
          return points.map((p, i) => {
            const x = (i * step).toFixed(1);
            const y = (height - ((p - min) / range) * (height - 4) - 2).toFixed(1);
            return (i === 0 ? 'M' : 'L') + ' ' + x + ' ' + y;
          }).join(' ');
        },

        getTrendsAreaPath(points, width = 800, height = 180) {
          if (!points || points.length < 2) return { line: '', area: '' };
          const min = 0;
          const max = 100;
          const range = 100;
          const step = width / (points.length - 1);

          const coords = points.map((p, i) => {
            const x = (i * step).toFixed(1);
            const y = (height - (Math.min(100, Math.max(0, Number(p || 0))) / range) * (height - 20) - 10).toFixed(1);
            return { x, y };
          });

          const line = coords.map((c, i) => (i === 0 ? 'M' : 'L') + ' ' + c.x + ' ' + c.y).join(' ');
          const area = line + ' L ' + width + ' ' + height + ' L 0 ' + height + ' Z';
          return { line, area };
        },

        getVelocityAreaPath(points, width = 500, height = 75) {
          if (!points || points.length < 2) return { line: '', area: '' };
          const min = 0;
          const max = Math.max(...points, 1);
          const range = max - min;
          const step = width / (points.length - 1);

          const coords = points.map((p, i) => {
            const x = (i * step).toFixed(1);
            const y = (height - ((p - min) / range) * (height - 12) - 4).toFixed(1);
            return { x, y };
          });

          const line = coords.map((c, i) => (i === 0 ? 'M' : 'L') + ' ' + c.x + ' ' + c.y).join(' ');
          const area = line + ' L ' + width + ' ' + height + ' L 0 ' + height + ' Z';
          return { line, area };
        },

        // =========================================================================
        // CAMPAIGN FOLDERS & CROSSOVER MATRIX ENGINE METHODS
        // =========================================================================

        async fetchFolders() {
          try {
            const res = await fetch(this.getApiUrl('/api/keywords/folders'));
            if (res.ok) {
              const data = await res.json();
              this.folders = data.folders || [];
              if (this.keywords && this.keywords.length > 0) {
                this.keywords.forEach(k => {
                  delete k._folders;
                  const fList = this.getKeywordFolders(k);
                  k._folders = fList;
                  k._searchCorpus = ((k.keyword || '') + ' ' + (k.category || '') + ' ' + (fList.map(f => f.name || '').join(' '))).toLowerCase();
                });
              }
              if (this.folders.length > 0 && !this.activeFolder) {
                this.activeFolder = this.folders[0];
                if (this.activeTab === 'crossover') {
                  this.fetchFolderCrossover(this.activeFolder.id);
                }
              }
            }
          } catch (_) {}
        },

        async selectFolder(folder) {
          if (!folder) return;
          this.activeFolder = folder;
          this.activeTab = 'crossover';
          await this.fetchFolderCrossover(folder.id);
        },

        openCrossoverTab() {
          this.activeTab = 'crossover';
          if (this.activeFolder) {
            if (!this.crossoverData || this.crossoverData.folder?.id !== this.activeFolder.id) {
              this.fetchFolderCrossover(this.activeFolder.id);
            }
          } else if (this.folders.length > 0) {
            this.selectFolder(this.folders[0]);
          }
        },

        async fetchFolderCrossover(folderId) {
          if (!folderId) return;
          this.isCrossoverLoading = true;
          try {
            const res = await fetch(this.getApiUrl('/api/keywords/folders/crossover?folder_id=' + folderId));
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            this.crossoverData = data.crossover || null;
          } catch (err) {
            this.showToast('Error loading crossover matrix: ' + err.message, 'error');
          } finally {
            this.isCrossoverLoading = false;
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        openCreateFolderModal() {
          this.newFolder = { name: '', description: '', color: '#ec4899' };
          this.isCreateFolderModalOpen = true;
        },

        async saveNewCampaignFolder() {
          if (!this.newFolder.name?.trim()) return;
          try {
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/keywords/folders'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(this.newFolder)
            });
            if (!res.ok) {
              const errPayload = await res.json().catch(() => ({}));
              throw new Error(errPayload.message || errPayload.error || ('HTTP ' + res.status));
            }
            const data = await res.json();
            this.showToast('Campaign folder created!', 'success');
            this.isCreateFolderModalOpen = false;
            await this.fetchFolders();
            if (data.folder) {
              this.selectFolder(data.folder);
              this.activeTab = 'crossover';
            }
          } catch (err) {
            this.showToast('Error creating folder: ' + err.message, 'error');
          }
        },

        async deleteCampaignFolder(folderId) {
          if (!confirm('Are you sure you want to delete this campaign folder? Keywords will remain tracked.')) return;
          try {
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/keywords/folders?id=' + folderId), { method: 'DELETE' });
            if (!res.ok) {
              const errPayload = await res.json().catch(() => ({}));
              throw new Error(errPayload.message || errPayload.error || ('HTTP ' + res.status));
            }
            this.showToast('Folder deleted.', 'info');
            if (this.activeFolder?.id === folderId) {
              this.activeFolder = null;
              this.crossoverData = null;
            }
            await this.fetchFolders();
          } catch (err) {
            this.showToast('Delete error: ' + err.message, 'error');
          }
        },

        async fetchCurrentKeywordFolders() {
          if (!this.selectedKeyword?.id) {
            this.currentKeywordFolders = [];
            return;
          }
          try {
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/keywords/folders/by-keyword?keyword_id=' + this.selectedKeyword.id));
            if (res.ok) {
              const data = await res.json();
              this.currentKeywordFolders = data.folders || [];
            }
          } catch (_) {}
        },

        isKeywordInFolder(folderId) {
          return this.currentKeywordFolders.some(f => f.id === folderId);
        },

        async toggleCurrentKeywordFolder(folderId) {
          if (!this.selectedKeyword?.id) return;
          const inFolder = this.isKeywordInFolder(folderId);
          try {
            if (inFolder) {
              await (window.safeApiFetch || fetch)(this.getApiUrl('/api/keywords/folders/items'), {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folder_id: folderId, keyword_id: this.selectedKeyword.id })
              });
              this.showToast('Removed from folder', 'info');
            } else {
              await (window.safeApiFetch || fetch)(this.getApiUrl('/api/keywords/folders/items'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folder_id: folderId, keyword_id: this.selectedKeyword.id })
              });
              this.showToast('Added to folder!', 'success');
            }
            await this.fetchCurrentKeywordFolders();
            await this.fetchFolders();
            if (this.activeFolder?.id === folderId) {
              await this.fetchFolderCrossover(folderId);
            }
          } catch (err) {
            this.showToast('Folder update error: ' + err.message, 'error');
          }
        },

        async openAddKeywordsModal() {
          if (!this.activeFolder) return;
          this.folderKeywordSearch = '';
          try {
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/keywords/folders?id=' + this.activeFolder.id));
            if (res.ok) {
              const data = await res.json();
              this.selectedFolderKeywordIds = (data.folder?.items || []).map(i => i.keyword_id);
            } else {
              this.selectedFolderKeywordIds = [];
            }
          } catch (_) {
            this.selectedFolderKeywordIds = [];
          }
          this.isAddKeywordsModalOpen = true;
        },

        isKeywordSelected(kid) {
          return this.selectedFolderKeywordIds.includes(kid);
        },

        toggleKeywordSelection(kid) {
          if (this.selectedFolderKeywordIds.includes(kid)) {
            this.selectedFolderKeywordIds = this.selectedFolderKeywordIds.filter(id => id !== kid);
          } else {
            this.selectedFolderKeywordIds.push(kid);
          }
        },

        async commitFolderKeywords() {
          if (!this.activeFolder) return;
          try {
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/keywords/folders/items'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                folder_id: this.activeFolder.id,
                keyword_ids: this.selectedFolderKeywordIds
              })
            });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            this.showToast('Folder keywords updated!', 'success');
            this.isAddKeywordsModalOpen = false;
            await this.fetchFolders();
            await this.fetchFolderCrossover(this.activeFolder.id);
          } catch (err) {
            this.showToast('Error saving keywords: ' + err.message, 'error');
          }
        },

        copyAllUniversalTags() {
          const tags = this.crossoverData?.topic_cluster_blueprint?.universal_tag_blueprint || 
                       (this.crossoverData?.tag_bridges || []).slice(0, 15).map(t => t.tag).join(', ');
          if (!tags) return;
          this.copyToClipboard(tags, 'Copied Universal Tag Blueprint to clipboard!');
        },

        safeUrl(url) {
          if (!url) return '#';
          const s = String(url).trim();
          if (/^https?:\\/\\//i.test(s) || s.startsWith('/')) return s;
          return '#';
        },

        sanitizeCsvCell(val) {
          let str = String(val == null ? '' : val);
          const code = str.charCodeAt(0);
          if (code === 61 || code === 43 || code === 45 || code === 64 || code === 9 || code === 10 || code === 13) {
            str = "'" + str;
          }
          return '"' + str.replace(/"/g, '""') + '"';
        },

        exportClusterBlueprintCsv() {
          const blueprint = this.crossoverData?.topic_cluster_blueprint;
          if (!blueprint || !Array.isArray(blueprint.csv_rows) || blueprint.csv_rows.length === 0) {
            this.showToast('No blueprint rows available for export', 'error');
            return;
          }
          const rows = blueprint.csv_rows;
          const headers = Object.keys(rows[0]);
          const csvContent = [
            headers.map(h => this.sanitizeCsvCell(h)).join(','),
            ...rows.map(r => headers.map(h => this.sanitizeCsvCell(r[h])).join(','))
          ].join('\\r\\n');

          const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          const safeName = (this.activeFolder?.name || 'cluster_blueprint').toLowerCase().replace(/[^a-z0-9]+/g, '_');
          a.download = 'pinterest_cluster_' + safeName + '.csv';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          this.showToast('1-Click CSV Blueprint downloaded successfully!', 'success');
        }
      };
    }
    if (typeof document !== 'undefined') {
      const initLucide = () => {
        if (typeof window !== 'undefined' && window.lucide && typeof window.lucide.createIcons === 'function') {
          window.lucide.createIcons();
        }
      };
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initLucide);
      } else {
        initLucide();
      }
    }
  </script>
  ${getEdgeShieldClientScript()}
</body>
</html>`;
}
