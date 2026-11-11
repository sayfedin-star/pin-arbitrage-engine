/**
 * src/pulse-ui.mjs
 *
 * Global 24-Hour Algorithmic Pulse & Crossover Studio UI
 * Single Source of Truth (SSOT) for /pulse, /24h, and /folders/:id/pulse.
 *
 * Pure ES Module generating the complete Cockpit Dense Level 8 3-Room Actionable Arbitrage Cockpit HTML application:
 * - Room 1: 🔥 24h Viral Pin Radar (Unified 250-pin breakout feed, filter pills, active tag chip banner, /pin/:id links, velocity ratchet)
 * - Room 2: 🧬 Annotation Crossover & Guided Intent Matrix (Master-detail Bento split-pane, left 5-col master, right 7-col visual breakdown)
 * - Room 3: 🚀 Breakout Creators & SERP Vacuum Targets (Positive-growth creators, David accounts, driver pins, domainless pins vs SERP vacuums)
 * - Slide-Over: 📋 Pin Dossier & Production Blueprint Drawer (Accessible role="dialog", async live /api/pins/:id hydration, 1-click copy)
 *
 * Architectural Invariants:
 * - [INVARIANT: UNIFIED-SIDEBAR-LAYOUT] Reuses renderAppSidebar with activeNav='pulse'
 * - [INVARIANT: SSR-WORKSPACE-ROOM-ROUTING] Supports folderId scoping with renderCampaignWorkspaceHeader
 * - [INVARIANT: MONOTONIC-REQUEST-SEQUENCING] Employs _pulseReqSeq to eliminate stale async race conditions
 * - [INVARIANT: WINDOWED-DOM-PAGINATION] Caps initial rendering at 50 items with dynamic Load More (+50)
 * - [INVARIANT: 4-TIER-IMAGE-DEGRADATION] Canonical window.handlePinImgError fallback waterfall
 * - [INVARIANT: HEADLESS-NODE-SHIELD] Guards all browser globals against Node.js VM evaluation crashes
 */

import { renderAppSidebar } from './ui/app-sidebar.mjs';
import { renderCampaignWorkspaceHeader } from './ui/campaign-workspace-header.mjs';

export function getPulsePageHtml(folderId = '') {
  const rawFolderId = String(folderId || '').trim();
  const safeFolderId = rawFolderId.replace(/[^a-zA-Z0-9_-]/g, '');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="referrer" content="same-origin">
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📌</text></svg>">
  <title>24-Hour Algorithmic Pulse &amp; Crossover Studio | Pinterest Arbitrage</title>
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
              rose: '#E11D48',
              surface: '#121215',
              card: '#18181B',
              border: '#27272A'
            }
          }
        }
      }
    };
    var theme = (typeof localStorage !== 'undefined') ? localStorage.getItem('pa_theme') : null;
    if (theme === 'light') {
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.add('dark');
    }
  <\/script>
  <script src="https://unpkg.com/lucide@0.469.0/dist/umd/lucide.js" defer></script>
  <script defer src="https://unpkg.com/alpinejs@3.14.8/dist/cdn.min.js"></script>
  <style>
    [x-cloak] { display: none !important; }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: rgba(148, 163, 184, 0.2); border-radius: 9999px; }
    ::-webkit-scrollbar-thumb:hover { background: rgba(148, 163, 184, 0.4); }
  </style>
  <script>
    (function() {
      if (typeof window === 'undefined' || window.__paeAuthInterceptorInstalled) return;
      window.__paeAuthInterceptorInstalled = true;
      var origFetch = window.fetch.bind(window);
      window.fetch = async function(input, init) {
        var urlStr = typeof input === 'string' ? input : (input && input.url ? input.url : '');
        var isApiCall = urlStr.startsWith('/api/') || urlStr.includes('/api/');
        var savedKey = '';
        try { savedKey = localStorage.getItem('pae_admin_api_key') || ''; } catch (_) {}
        if (isApiCall && savedKey) {
          init = Object.assign({}, init);
          var headers = new Headers(init.headers || (typeof input === 'object' && input.headers ? input.headers : undefined));
          if (!headers.has('x-api-key') && !headers.has('Authorization')) {
            headers.set('x-api-key', savedKey);
          }
          init.headers = headers;
        }
        var res = await origFetch(input, init);
        return res;
      };
    })();
  <\/script>
  <script>
    (function() {
      if (typeof window === 'undefined') return;
      var SVG_PLACEHOLDER = "data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2260%22 height=%2290%22 viewBox=%220 0 60 90%22><rect width=%2260%22 height=%2290%22 rx=%224%22 fill=%22%2318181b%22/><text x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%2371717a%22 font-family=%22monospace%22 font-size=%2210%22>PIN</text></svg>";

      window.resolvePinImageUrl = function(url, tier) {
        tier = tier || '236x';
        if (!url || typeof url !== 'string') return SVG_PLACEHOLDER;
        if (!url.includes('pinimg.com')) return url;
        return url.replace(new RegExp('/(236x|474x|564x|736x|1200x|originals)/'), '/' + tier + '/');
      };

      window.handlePinImgError = function(img) {
        if (!img) return;
        var currentSrc = img.src || '';
        img._errStep = (img._errStep || 0) + 1;
        if (img._errStep > 4 || !currentSrc.includes('pinimg.com')) {
          img.onerror = null;
          img.src = SVG_PLACEHOLDER;
          return;
        }
        if (currentSrc.includes('/236x/')) {
          img.src = currentSrc.replace('/236x/', '/474x/');
        } else if (currentSrc.includes('/474x/')) {
          img.src = currentSrc.replace('/474x/', '/736x/');
        } else if (currentSrc.includes('/736x/')) {
          img.src = currentSrc.replace('/736x/', '/originals/');
        } else {
          img.onerror = null;
          img.src = SVG_PLACEHOLDER;
        }
      };
    })();
  <\/script>
</head>
<body x-cloak class="bg-slate-50 dark:bg-[#09090B] text-slate-900 dark:text-zinc-100 min-h-screen antialiased flex flex-col font-sans transition-colors duration-150" :class="(isDark || darkMode) ? 'dark' : ''" x-data="pulseStudioApp('${safeFolderId}')" @keydown.escape.window="if (isBlueprintModalOpen) closeBlueprintModal();">

  <!-- Toast Notification Container -->
  <div class="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
    <template x-for="toast in toasts" :key="toast.id">
      <div class="pointer-events-auto px-4 py-3 rounded-xl border text-xs shadow-2xl flex items-center justify-between gap-3 transition-all transform duration-300"
           :class="{
             'bg-emerald-50 dark:bg-emerald-950/90 border-emerald-500/40 text-emerald-900 dark:text-emerald-200': toast.type === 'success',
             'bg-rose-50 dark:bg-rose-950/90 border-rose-500/40 text-rose-900 dark:text-rose-200': toast.type === 'error',
             'bg-sky-50 dark:bg-sky-950/90 border-sky-500/40 text-sky-900 dark:text-sky-200': toast.type === 'info',
             'bg-amber-50 dark:bg-amber-950/90 border-amber-500/40 text-amber-900 dark:text-amber-200': toast.type === 'warning'
           }">
        <span x-text="toast.message" class="font-medium font-sans"></span>
        <button @click="removeToast(toast.id)" class="text-slate-400 hover:text-slate-900 dark:hover:text-white text-xs">✕</button>
      </div>
    </template>
  </div>

  ${renderAppSidebar({ activeNav: 'pulse', refreshHandler: 'refreshPulse(true)' })}

  <!-- Main Container (Offset for Unified Desktop Sidebar) [INVARIANT: UNIFIED-SIDEBAR-LAYOUT] -->
  <main class="flex-1 min-h-screen p-4 sm:p-6 lg:p-8 space-y-6 max-w-full overflow-x-hidden transition-all duration-300 ease-in-out" :class="isSidebarCollapsed ? 'md:ml-20' : 'md:ml-64 lg:ml-72'">

    ${safeFolderId ? renderCampaignWorkspaceHeader({ activeRoom: 'pulse', folderId: safeFolderId }) : ''}

    <!-- [INVARIANT: UNIFIED-SIDEBAR-LAYOUT] Studio Header Card -->
    <template x-if="!scopedFolderId">
      <section class="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#121215] border border-slate-200/80 dark:border-[#27272A]/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div class="flex items-center space-x-3.5">
          <div class="w-11 h-11 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 flex items-center justify-center shadow-xs shrink-0">
            <i data-lucide="activity" class="w-6 h-6"></i>
          </div>
          <div>
            <div class="flex items-center space-x-2">
              <h1 class="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white">24-Hour Algorithmic Pulse &amp; Crossover Studio</h1>
              <span class="px-2 py-0.5 rounded-md text-[10px] font-mono tabular-nums font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">Live Radar</span>
            </div>
            <p class="text-xs text-slate-500 dark:text-[#A1A1AA] mt-0.5 font-normal">Real-Time Pin Momentum, Co-Occurrence Matrix, Guided Capsules &amp; Scientific Pin Blueprints</p>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <!-- Window Selector Pills -->
          <div class="flex items-center p-1 bg-slate-100 dark:bg-[#18181B] rounded-xl border border-slate-200 dark:border-[#27272A] text-xs">
            <template x-for="win in ['24h', '5d', '7d', '15d']" :key="win">
              <button 
                type="button" 
                @click="setWindow(win)" 
                class="px-2.5 py-1 rounded-lg font-mono tabular-nums font-semibold transition cursor-pointer"
                :class="selectedWindow === win ? 'bg-rose-600 text-white shadow-2xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'"
                x-text="win"
              ></button>
            </template>
          </div>

          <!-- Refresh Button -->
          <button 
            type="button" 
            @click="refreshPulse(true)" 
            :disabled="isLoading || isRefreshing" 
            class="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition inline-flex items-center space-x-1.5 shadow-xs active:scale-95 disabled:opacity-50 cursor-pointer"
            title="Force refresh live database telemetry"
          >
            <i data-lucide="rotate-cw" class="w-3.5 h-3.5" :class="(isLoading || isRefreshing) ? 'animate-spin' : ''"></i>
            <span x-text="(isLoading || isRefreshing) ? 'Scanning...' : 'Refresh Pulse'"></span>
          </button>
        </div>
      </section>
    </template>

    <!-- 7-CELL TELEMETRY RIBBON -->
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
      <!-- 1. Active SERP Pins -->
      <div class="p-3.5 rounded-2xl bg-white dark:bg-[#121215] border border-slate-200/80 dark:border-[#27272A] shadow-xs flex flex-col justify-between">
        <div class="text-[10.5px] font-mono tabular-nums uppercase text-slate-500 dark:text-slate-400 font-bold flex items-center justify-between">
          <span>Active SERP</span>
          <i data-lucide="layers" class="w-3.5 h-3.5 text-slate-400"></i>
        </div>
        <div class="mt-2 text-2xl font-black font-mono tabular-nums text-slate-900 dark:text-white" x-text="formatNumber(kpis.total_active_serp_pins || 0)">0</div>
        <div class="mt-1 text-[10px] text-slate-400 font-mono" x-text="kpis.total_active_serp_slots ? ('Unique pins (' + formatNumber(kpis.total_active_serp_slots) + ' ranked slots)') : 'Unique ranked pins inventory'">Unique ranked pins inventory</div>
      </div>

      <!-- 2. Pins Gaining (24h) -->
      <div class="p-3.5 rounded-2xl bg-white dark:bg-[#121215] border border-slate-200/80 dark:border-[#27272A] shadow-xs flex flex-col justify-between">
        <div class="text-[10.5px] font-mono tabular-nums uppercase text-emerald-600 dark:text-emerald-400 font-bold flex items-center justify-between">
          <span>Pins Gaining</span>
          <i data-lucide="trending-up" class="w-3.5 h-3.5 text-emerald-500"></i>
        </div>
        <div class="mt-2 text-2xl font-black font-mono tabular-nums text-emerald-600 dark:text-emerald-400" x-text="formatNumber(kpis.pins_gaining_24h_count || 0)">0</div>
        <div class="mt-1 text-[10px] text-slate-400 font-mono">Positive save velocity</div>
      </div>

      <!-- 3. 24h Saves Velocity -->
      <div class="p-3.5 rounded-2xl bg-white dark:bg-[#121215] border border-slate-200/80 dark:border-[#27272A] shadow-xs flex flex-col justify-between">
        <div class="text-[10.5px] font-mono tabular-nums uppercase text-rose-600 dark:text-rose-400 font-bold flex items-center justify-between">
          <span x-text="((selectedWindow || '24h').toUpperCase()) + ' Velocity'">24h Velocity</span>
          <i data-lucide="zap" class="w-3.5 h-3.5 text-rose-500"></i>
        </div>
        <div class="mt-2 text-2xl font-black font-mono tabular-nums text-rose-600 dark:text-rose-400" x-text="(selectedWindow && selectedWindow !== '24h') ? ('+' + formatNumber(kpis.total_24h_saves_velocity || 0)) : formatVelocity(kpis.total_24h_saves_velocity || 0)">0/d</div>
        <div class="mt-1 text-[10px] text-slate-400 font-mono" x-text="(selectedWindow && selectedWindow !== '24h') ? ('Aggregate ' + selectedWindow + ' save gain') : 'Aggregate daily saves'">Aggregate daily saves</div>
      </div>

      <!-- 4. 24h Repins Delta -->
      <div class="p-3.5 rounded-2xl bg-white dark:bg-[#121215] border border-slate-200/80 dark:border-[#27272A] shadow-xs flex flex-col justify-between">
        <div class="text-[10.5px] font-mono tabular-nums uppercase text-purple-600 dark:text-purple-400 font-bold flex items-center justify-between">
          <span>Repins Surge</span>
          <i data-lucide="repeat" class="w-3.5 h-3.5 text-purple-500"></i>
        </div>
        <div class="mt-2 text-2xl font-black font-mono tabular-nums text-purple-600 dark:text-purple-400" x-text="'+' + formatNumber(kpis.total_24h_repins_delta || 0)">+0</div>
        <div class="mt-1 text-[10px] text-slate-400 font-mono">24h organic viral shares</div>
      </div>

      <!-- 5. Fresh Rockets (<=14d) -->
      <div class="p-3.5 rounded-2xl bg-white dark:bg-[#121215] border border-slate-200/80 dark:border-[#27272A] shadow-xs flex flex-col justify-between">
        <div class="text-[10.5px] font-mono tabular-nums uppercase text-amber-600 dark:text-amber-400 font-bold flex items-center justify-between">
          <span>Rockets (≤14d)</span>
          <i data-lucide="rocket" class="w-3.5 h-3.5 text-amber-500"></i>
        </div>
        <div class="mt-2 text-2xl font-black font-mono tabular-nums text-amber-600 dark:text-amber-400" x-text="formatNumber(kpis.fresh_rocket_pins_14d_count || 0)">0</div>
        <div class="mt-1 text-[10px] text-slate-400 font-mono">New pins accelerating</div>
      </div>

      <!-- 6. Breakout Creators -->
      <div class="p-3.5 rounded-2xl bg-white dark:bg-[#121215] border border-slate-200/80 dark:border-[#27272A] shadow-xs flex flex-col justify-between">
        <div class="text-[10.5px] font-mono tabular-nums uppercase text-sky-600 dark:text-sky-400 font-bold flex items-center justify-between">
          <span>Creators</span>
          <i data-lucide="users" class="w-3.5 h-3.5 text-sky-500"></i>
        </div>
        <div class="mt-2 text-2xl font-black font-mono tabular-nums text-sky-600 dark:text-sky-400" x-text="formatNumber(kpis.breakout_creators_count || 0)">0</div>
        <div class="mt-1 text-[10px] text-slate-400 font-mono">Audience gainers</div>
      </div>

      <!-- 7. Bridges & Vacuums -->
      <div class="p-3.5 rounded-2xl bg-white dark:bg-[#121215] border border-slate-200/80 dark:border-[#27272A] shadow-xs flex flex-col justify-between">
        <div class="text-[10.5px] font-mono tabular-nums uppercase text-indigo-600 dark:text-indigo-400 font-bold flex items-center justify-between">
          <span>Bridge Nodes</span>
          <i data-lucide="git-fork" class="w-3.5 h-3.5 text-indigo-500"></i>
        </div>
        <div class="mt-2 text-2xl font-black font-mono tabular-nums text-indigo-600 dark:text-indigo-400" x-text="formatNumber(kpis.multi_keyword_bridge_pins_count || 0)">0</div>
        <div class="mt-1 text-[10px] text-slate-400 font-mono" x-text="(kpis.serp_vacuum_top10_24h_count || 0) + ' vacuum targets'"></div>
      </div>
    </div>

    <!-- 3-ROOM ACTIONABLE ARBITRAGE COCKPIT NAVIGATION BAR -->
    <div class="flex items-center justify-between border-b border-slate-200 dark:border-[#27272A] overflow-x-auto pb-1 gap-2">
      <nav class="flex items-center space-x-2 shrink-0 text-xs">
        <!-- Room 1: Viral Pin Radar -->
        <button 
          type="button" 
          @click="setRoom('radar')" 
          class="px-4 py-2.5 rounded-xl font-bold transition flex items-center space-x-2 cursor-pointer shadow-2xs"
          :class="currentRoom === 'radar' ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30' : 'text-slate-600 dark:text-[#A1A1AA] hover:bg-slate-100 dark:hover:bg-[#18181B] border border-transparent'"
        >
          <i data-lucide="flame" class="w-4 h-4 text-rose-500"></i>
          <span>🔥 24h Viral Pin Radar</span>
          <span class="px-1.5 py-0.5 rounded-md font-mono tabular-nums text-[10px] bg-slate-200/80 dark:bg-[#27272A] text-slate-700 dark:text-slate-300" x-text="formatNumber(getFilteredRadarPins().length)"></span>
        </button>

        <!-- Room 2: Annotation & Intent Matrix -->
        <button 
          type="button" 
          @click="setRoom('matrix')" 
          class="px-4 py-2.5 rounded-xl font-bold transition flex items-center space-x-2 cursor-pointer shadow-2xs"
          :class="currentRoom === 'matrix' ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30' : 'text-slate-600 dark:text-[#A1A1AA] hover:bg-slate-100 dark:hover:bg-[#18181B] border border-transparent'"
        >
          <i data-lucide="dna" class="w-4 h-4 text-purple-500"></i>
          <span>🧬 Annotation &amp; Intent Matrix</span>
        </button>

        <!-- Room 3: Breakout Creators & Vacuums -->
        <button 
          type="button" 
          @click="setRoom('creators_vacuums')" 
          class="px-4 py-2.5 rounded-xl font-bold transition flex items-center space-x-2 cursor-pointer shadow-2xs"
          :class="currentRoom === 'creators_vacuums' ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30' : 'text-slate-600 dark:text-[#A1A1AA] hover:bg-slate-100 dark:hover:bg-[#18181B] border border-transparent'"
        >
          <i data-lucide="rocket" class="w-4 h-4 text-amber-500"></i>
          <span>🚀 Creators &amp; SERP Vacuums</span>
        </button>
      </nav>

      <!-- Global Search Filter Bar -->
      <div class="relative w-52 sm:w-72 shrink-0">
        <input 
          type="text" 
          x-model="searchQuery" 
          placeholder="Filter active room entities..."
          class="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] text-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500/30 text-slate-900 dark:text-white"
        />
        <i data-lucide="search" class="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5"></i>
      </div>
    </div>

    <!-- ======================================================== -->
    <!-- ROOM 1: 🔥 24H VIRAL PIN RADAR (UNIFIED BREAKOUT FEED)   -->
    <!-- ======================================================== -->
    <section x-show="currentRoom === 'radar'" class="space-y-4">
      <!-- Radar Filter Pills -->
      <div class="flex items-center justify-between flex-wrap gap-2 text-xs">
        <div class="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-[#18181B] rounded-xl border border-slate-200 dark:border-[#27272A] flex-wrap">
          <button 
            type="button" 
            @click="setRadarFilter('all')" 
            class="px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer"
            :class="radarFilter === 'all' ? 'bg-white dark:bg-[#121215] text-rose-600 dark:text-rose-400 shadow-2xs font-bold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'"
          >
            <span>All 24h Surges</span>
            <span class="ml-1 font-mono text-[10px]" x-text="'(' + formatNumber(kpis.pins_gaining_24h_count || (breakout_pins.top_breakouts || []).length) + ')'"></span>
          </button>
          <button 
            type="button" 
            @click="setRadarFilter('fresh')" 
            class="px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer"
            :class="radarFilter === 'fresh' ? 'bg-white dark:bg-[#121215] text-amber-600 dark:text-amber-400 shadow-2xs font-bold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'"
          >
            <span>⚡ Fresh Breakouts (≤14d)</span>
            <span class="ml-1 font-mono text-[10px]" x-text="'(' + formatNumber(kpis.fresh_rocket_pins_14d_count || (breakout_pins.fresh_rockets || []).length) + ')'"></span>
          </button>
          <button 
            type="button" 
            @click="setRadarFilter('bridges')" 
            class="px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer"
            :class="radarFilter === 'bridges' ? 'bg-white dark:bg-[#121215] text-indigo-600 dark:text-indigo-400 shadow-2xs font-bold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'"
          >
            <span>🌉 Multi-Keyword Pixie Bridges</span>
            <span class="ml-1 font-mono text-[10px]" x-text="'(' + formatNumber(kpis.multi_keyword_bridge_pins_count || (keyword_vacuums_and_bridges.bridge_pins || []).length) + ')'"></span>
          </button>
          <button 
            type="button" 
            @click="setRadarFilter('domainless')" 
            class="px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer"
            :class="radarFilter === 'domainless' ? 'bg-white dark:bg-[#121215] text-emerald-600 dark:text-emerald-400 shadow-2xs font-bold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'"
          >
            <span>💎 Domainless / Linkless Hijacks</span>
            <span class="ml-1 font-mono text-[10px]" x-text="'(' + formatNumber(kpis.domainless_viral_pins_count || (hidden_gems_telemetry.domainless_viral_pins || []).length) + ')'"></span>
          </button>
          <button 
            type="button" 
            @click="setRadarFilter('vault')" 
            class="px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer"
            :class="radarFilter === 'vault' ? 'bg-white dark:bg-[#121215] text-purple-600 dark:text-purple-400 shadow-2xs font-bold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'"
          >
            <span>📦 Vault Surges (Displaced Index)</span>
            <span class="ml-1 font-mono text-[10px]" x-text="'(' + formatNumber(kpis.vault_surge_pins_count || (breakout_pins.vault_surge_pins || []).length) + ')'"></span>
          </button>
        </div>

        <div class="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums" x-text="'Showing top ' + Math.min(displayLimits.radar, getFilteredRadarPins().length) + ' of ' + getFilteredRadarPins().length + ' loaded surging pins'"></div>
      </div>

      <!-- Active Tag / Capsule Filter Banner -->
      <div x-show="activeTagFilter" class="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-between gap-3 text-xs">
        <div class="flex items-center space-x-2">
          <i data-lucide="filter" class="w-4 h-4 text-rose-500"></i>
          <span class="text-slate-700 dark:text-slate-300 font-medium">Filtered by Tag / Capsule:</span>
          <span class="px-2.5 py-1 rounded-lg bg-rose-600 text-white font-mono font-bold text-[11px]" x-text="'#' + activeTagFilter"></span>
        </div>
        <button 
          type="button" 
          @click="clearTagFilter()" 
          class="px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-semibold transition cursor-pointer flex items-center space-x-1"
        >
          <span>Clear Filter</span>
          <span>✕</span>
        </button>
      </div>

      <!-- Unified 24h Breakout Table -->
      <div class="rounded-2xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] overflow-hidden shadow-xs">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs border-collapse">
            <thead>
              <tr class="border-b border-slate-200 dark:border-[#27272A] bg-slate-50/75 dark:bg-[#18181B]/50 font-mono tabular-nums text-slate-500 text-[10.5px] uppercase">
                <th class="py-2.5 px-3 w-12 text-center">Rank</th>
                <th class="py-2.5 px-3 w-20">Preview</th>
                <th class="py-2.5 px-3 min-w-[280px]">Pin Title &amp; Context</th>
                <th class="py-2.5 px-3 min-w-[130px]">Domain / Creator</th>
                <th class="py-2.5 px-3 text-right min-w-[90px]" x-text="((selectedWindow || '24h').toUpperCase()) + ' Gain'">24H Gain</th>
                <th class="py-2.5 px-3 text-right min-w-[85px]">Total Saves</th>
                <th class="py-2.5 px-3 text-right min-w-[85px]">24H Repins Δ</th>
                <th class="py-2.5 px-3 text-right min-w-[65px]">Age</th>
                <th class="py-2.5 px-3 text-right w-28">Action</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-[#27272A]/60">
              <template x-for="(pin, idx) in getFilteredRadarPins().slice(0, displayLimits.radar)" :key="pin.pin_id || idx">
                <tr class="hover:bg-slate-50/80 dark:hover:bg-[#18181B]/60 transition">
                  <td class="py-2.5 px-3 text-center font-mono font-bold text-slate-400 text-xs" x-text="idx + 1"></td>
                  
                  <!-- Thumbnail & Dual Links (Internal /pin/:id + Pinterest) [Bug 9 Fix] -->
                  <td class="py-2.5 px-3">
                    <div class="flex items-center space-x-2">
                      <div class="w-10 h-14 rounded-lg bg-slate-100 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A] overflow-hidden relative shrink-0 cursor-pointer group"
                           @click="openBlueprintModal(pin)">
                        <img :src="window.resolvePinImageUrl(pin.image_url, '236x')" 
                             alt="Pin preview" 
                             loading="lazy" 
                             class="w-full h-full object-cover group-hover:scale-105 transition" 
                             onerror="window.handlePinImgError(this)" />
                      </div>
                      <div class="flex flex-col space-y-1">
                        <!-- Direct link to /pin/:id -->
                        <a :href="'/pin/' + pin.pin_id" 
                           class="text-[10px] font-mono text-rose-600 dark:text-rose-400 hover:underline flex items-center space-x-0.5" 
                           title="Open PAE Internal Pin Dossier">
                          <span>/pin</span>
                          <i data-lucide="arrow-up-right" class="w-3 h-3"></i>
                        </a>
                        <!-- External Pinterest Link -->
                        <a :href="'https://www.pinterest.com/pin/' + pin.pin_id + '/'" 
                           target="_blank" 
                           rel="noopener noreferrer" 
                           class="text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center space-x-0.5"
                           title="View on Pinterest">
                          <i data-lucide="external-link" class="w-3 h-3"></i>
                        </a>
                      </div>
                    </div>
                  </td>

                  <!-- Pin Title, Keywords & Clickable Visual Annotations -->
                  <td class="py-2.5 px-3">
                    <a :href="'/pin/' + pin.pin_id" 
                       class="font-semibold text-slate-900 dark:text-white line-clamp-1 hover:text-rose-600 transition text-xs" 
                       :title="pin.title"
                       x-text="pin.title || 'Untitled Pin'"></a>
                    
                    <div class="flex items-center gap-1.5 mt-1 flex-wrap">
                      <!-- Keyword Context Badge -->
                      <template x-if="pin.keyword_text">
                        <a :href="getKeywordUrl(pin.keyword_slug || pin.keyword_text, pin.keyword_id)" 
                           class="px-1.5 py-0.2 rounded bg-slate-100 dark:bg-[#18181B] text-[10px] font-mono text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-[#27272A] hover:border-rose-500/40">
                          <span x-text="pin.keyword_text"></span>
                          <template x-if="pin.rank_position">
                            <span class="text-rose-500 font-bold" x-text="' #' + pin.rank_position"></span>
                          </template>
                        </a>
                      </template>

                      <!-- Fresh Rocket Badge -->
                      <template x-if="pin.is_fresh_14d || pin.is_fresh_breakout || (pin.pin_age_days !== null && pin.pin_age_days !== undefined && pin.pin_age_days !== '' && Number(pin.pin_age_days) >= 0 && Number(pin.pin_age_days) <= 14)">
                        <span class="px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-mono font-bold border border-amber-500/20">🚀 Rocket (≤14d)</span>
                      </template>

                      <!-- Pixie Bridge Badge -->
                      <template x-if="pin.overlap_count > 1 || (pin.keywords && pin.keywords.length > 1) || pin.keyword_count > 1">
                        <span class="px-1.5 py-0.2 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[10px] font-mono font-bold border border-indigo-500/20" 
                              x-text="(pin.overlap_count || (pin.keywords && pin.keywords.length) || pin.keyword_count || 2) + ' Keywords Bridge'"></span>
                      </template>

                      <!-- Alt-Text Indicator Badge -->
                      <template x-if="pin.alt_text">
                        <span class="px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[9.5px] font-mono border border-emerald-500/20 font-bold" 
                              title="SEO Alt-Text Verified">✓ Alt-Text</span>
                      </template>

                      <!-- Vault Surge Badge -->
                      <template x-if="pin.is_vault_surge || pin.is_displaced">
                        <span class="px-1.5 py-0.2 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400 text-[9.5px] font-mono border border-purple-500/20 font-bold">📦 Vault Surge</span>
                      </template>
                    </div>

                    <!-- Clickable Visual Annotation Pills (Sets activeTagFilter) [Bug 2 Fix] -->
                    <div class="flex items-center gap-1 mt-1.5 flex-wrap">
                      <template x-for="(tag, tidx) in (pin.visual_annotations || pin.annotations || []).slice(0, 4)" :key="tidx">
                        <button type="button" 
                                @click.stop="setTagFilter(tag.display || tag.norm || tag)"
                                class="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-rose-50 dark:bg-[#18181B] dark:hover:bg-rose-950/30 text-[9.5px] font-mono text-slate-600 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 border border-slate-200 dark:border-[#27272A] hover:border-rose-500/30 transition cursor-pointer"
                                title="Filter feed by this visual annotation">
                          <span x-text="'#' + (tag.display || tag.norm || tag)"></span>
                        </button>
                      </template>
                    </div>
                  </td>

                  <!-- Domain / Creator -->
                  <td class="py-2.5 px-3">
                    <div class="text-slate-800 dark:text-slate-200 font-medium truncate max-w-[130px] text-xs" 
                         x-text="pin.domain || 'Uploaded by user'"></div>
                    <div class="text-[10.5px] text-slate-400 truncate max-w-[130px] font-mono" 
                         x-text="pin.creator_username ? '@' + pin.creator_username : 'unknown'"></div>
                  </td>

                  <!-- Unified 24H / Window Gain Column -->
                  <td class="py-2.5 px-3 text-right">
                    <div class="font-mono tabular-nums font-bold text-xs text-rose-600 dark:text-rose-400"
                         x-text="(selectedWindow && selectedWindow !== '24h') ? ('+' + formatNumber(Number(pin.window_saves_gain ?? pin.daily_save_velocity ?? pin.delta_saves_24h ?? 0))) : ('+' + formatNumber(Number(pin.daily_save_velocity ?? pin.delta_saves_24h ?? 0)) + '/d')">
                    </div>
                    <div class="text-[9px] font-mono text-slate-400 uppercase" 
                         x-text="(selectedWindow && selectedWindow !== '24h') ? (selectedWindow.toUpperCase() + ' Saves') : 'Save Velocity'"></div>
                  </td>

                  <!-- Total Saves -->
                  <td class="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-slate-800 dark:text-slate-200 text-xs" 
                      x-text="formatNumber(pin.save_count || 0)"></td>

                  <!-- 24H Repins Δ -->
                  <td class="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-purple-600 dark:text-purple-400 text-xs" 
                      x-text="'+' + formatNumber(pin.delta_repins_24h || 0)"></td>

                  <!-- Age (Rule 31 Compliant) -->
                  <td class="py-2.5 px-3 text-right font-mono tabular-nums text-slate-500 text-xs" 
                      x-text="(pin.pin_age_days !== null && pin.pin_age_days !== undefined && pin.pin_age_days !== '') ? formatAge(pin.pin_age_days) : '—'"></td>

                  <!-- Actions -->
                  <td class="py-2.5 px-3 text-right">
                    <button type="button" 
                            @click="openBlueprintModal(pin)" 
                            class="px-2.5 py-1 rounded-lg border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-[11px] font-bold transition cursor-pointer shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                            title="Inspect pin dossier and generate production blueprint">
                      <span>⚡ Blueprint</span>
                    </button>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>

        <!-- Windowed Load More Button -->
        <div x-show="getFilteredRadarPins().length > displayLimits.radar" class="p-4 border-t border-slate-200 dark:border-[#27272A] text-center bg-slate-50/50 dark:bg-[#18181B]/40">
          <button 
            type="button" 
            @click="displayLimits.radar += 50" 
            class="px-4 py-2 rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#18181B] transition cursor-pointer shadow-2xs"
          >
            <span>Load More (+50 Pins)</span>
          </button>
        </div>
      </div>
    </section>

    <!-- ================================================================= -->
    <!-- ROOM 2: 🧬 ANNOTATION CROSSOVER & GUIDED INTENT MATRIX (BENTO)   -->
    <!-- ================================================================= -->
    <section x-show="currentRoom === 'matrix'" class="space-y-4">
      <!-- Matrix Sub-Filter Navigation Pills -->
      <div class="flex items-center justify-between flex-wrap gap-2 text-xs">
        <div class="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-[#18181B] rounded-xl border border-slate-200 dark:border-[#27272A] flex-wrap">
          <button 
            type="button" 
            @click="setMatrixSubFilter('pairs')" 
            class="px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer"
            :class="matrixSubFilter === 'pairs' ? 'bg-white dark:bg-[#121215] text-purple-600 dark:text-purple-400 shadow-2xs font-bold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'"
          >
            <span>2-Tag Crossovers (Min 2+ Pins)</span>
          </button>
          <button 
            type="button" 
            @click="setMatrixSubFilter('triplets')" 
            class="px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer"
            :class="matrixSubFilter === 'triplets' ? 'bg-white dark:bg-[#121215] text-indigo-600 dark:text-indigo-400 shadow-2xs font-bold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'"
          >
            <span>3-Tag Triplets (Min 2+ Pins)</span>
          </button>
          <button 
            type="button" 
            @click="setMatrixSubFilter('single')" 
            class="px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer"
            :class="matrixSubFilter === 'single' ? 'bg-white dark:bg-[#121215] text-rose-600 dark:text-rose-400 shadow-2xs font-bold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'"
          >
            <span>1-Tag Power Leaders</span>
          </button>
          <button 
            type="button" 
            @click="setMatrixSubFilter('capsules')" 
            class="px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer"
            :class="matrixSubFilter === 'capsules' ? 'bg-white dark:bg-[#121215] text-sky-600 dark:text-sky-400 shadow-2xs font-bold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'"
          >
            <span>🎯 Guided Search Capsules</span>
          </button>
          <button 
            type="button" 
            @click="setMatrixSubFilter('colors')" 
            class="px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer"
            :class="matrixSubFilter === 'colors' ? 'bg-white dark:bg-[#121215] text-amber-600 dark:text-amber-400 shadow-2xs font-bold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'"
          >
            <span>🎨 Dominant Color Swatches</span>
          </button>
          <button 
            type="button" 
            @click="setMatrixSubFilter('domains')" 
            class="px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer"
            :class="matrixSubFilter === 'domains' ? 'bg-white dark:bg-[#121215] text-emerald-600 dark:text-emerald-400 shadow-2xs font-bold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'"
          >
            <span>🌐 Top Arbitrage Domains</span>
          </button>
        </div>

        <div class="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums" x-text="'Showing ' + getMatrixEntities().length + ' active intent patterns'"></div>
      </div>

      <!-- Split-Pane Bento Grid: Left Master Table (5 cols), Right Matching Pin Drill-Down (7 cols) -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        
        <!-- LEFT PANEL: Master Table (5 cols) -->
        <div class="lg:col-span-5 rounded-2xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] overflow-hidden shadow-xs flex flex-col">
          <div class="p-3 border-b border-slate-200 dark:border-[#27272A] bg-slate-50/75 dark:bg-[#18181B]/50 flex items-center justify-between">
            <span class="font-bold text-xs uppercase font-mono text-slate-500 dark:text-slate-400" x-text="matrixSubFilter.toUpperCase() + ' MASTER INDEX'"></span>
            <span class="text-[11px] font-mono text-slate-400">Click row to inspect pins</span>
          </div>

          <div class="max-h-[640px] overflow-y-auto divide-y divide-slate-100 dark:divide-[#27272A]/50">
            <template x-for="(item, idx) in getMatrixEntities().slice(0, displayLimits.matrix)" :key="matrixSubFilter + ':' + (item.domain || item.label || item.pair || item.triplet || item.display_label || item.term || item.color || idx)">
              <div 
                @click="selectMatrixItem(item)" 
                class="p-3 transition cursor-pointer flex items-center justify-between gap-3 text-xs"
                :class="isMatrixItemSelected(item) ? 'bg-rose-500/10 border-l-4 border-rose-500 dark:bg-rose-950/20' : 'hover:bg-slate-50 dark:hover:bg-[#18181B] border-l-4 border-transparent'"
              >
                <!-- Entity Label & Badge -->
                <div class="min-w-0 flex-1">
                  <!-- Color Swatch Presentation [Bug 4 Fix: col.pin_count || col.count] -->
                  <template x-if="matrixSubFilter === 'colors'">
                    <div class="flex items-center space-x-2">
                      <span class="w-4 h-4 rounded-full border border-black/20 shrink-0" :style="'background-color: ' + (item.color || item.dominant_color)"></span>
                      <span class="font-bold font-mono text-slate-900 dark:text-white" x-text="item.color || item.dominant_color"></span>
                      <!-- [INVARIANT: COLOR-SWATCH-COUNT-BINDING] binds col.pin_count || col.count for palette compatibility -->
                      <span class="text-[10px] text-slate-400 font-mono" x-text="'(' + formatNumber(item.pin_count || item.count || (typeof col !== 'undefined' ? (col.pin_count || col.count) : 0)) + ')'"></span>
                    </div>
                  </template>

                  <!-- Capsule Presentation -->
                  <template x-if="matrixSubFilter === 'capsules'">
                    <div class="min-w-0">
                      <div class="flex items-center space-x-2 min-w-0">
                        <span class="w-3 h-3 rounded-full shrink-0" :style="'background-color: ' + (item.dominant_color || '#3b82f6')"></span>
                        <span class="font-bold text-slate-900 dark:text-white truncate" x-text="item.display_label || item.term"></span>
                      </div>
                      <div class="text-[10px] text-slate-400 font-mono pl-5" x-text="((item.distinct_keywords || item.keyword_count) ? (item.distinct_keywords || item.keyword_count) + ' keywords' : '')"></div>
                    </div>
                  </template>

                  <!-- Domain Presentation -->
                  <template x-if="matrixSubFilter === 'domains'">
                    <div class="min-w-0">
                      <div class="font-bold text-slate-900 dark:text-white truncate" x-text="item.domain || item.label"></div>
                      <div class="text-[10px] text-slate-400 font-mono" x-text="((item.keywords_count || item.keyword_count) ? (item.keywords_count || item.keyword_count) + ' keywords · ' : '') + formatNumber(item.total_saves || 0) + ' saves'"></div>
                    </div>
                  </template>

                  <!-- Crossover (Pairs, Triplets, Single) -->
                  <template x-if="matrixSubFilter !== 'colors' && matrixSubFilter !== 'capsules' && matrixSubFilter !== 'domains'">
                    <div>
                      <div class="font-bold text-slate-900 dark:text-white truncate" x-text="item.label || item.pair || item.triplet || item.display || item.tag"></div>
                      <div class="text-[10px] text-slate-400 font-mono" x-text="((item.keywords_count || item.keyword_count) ? (item.keywords_count || item.keyword_count) + ' keywords' : '')"></div>
                    </div>
                  </template>
                </div>

                <!-- Occurrence Count, Save Velocity & Repins Surge -->
                <div class="text-right shrink-0">
                  <div class="font-mono tabular-nums font-bold text-slate-700 dark:text-slate-300">
                    <span x-text="formatNumber(item.pin_count || item.count || item.total_pins || (typeof col !== 'undefined' ? (col.pin_count || col.count) : 0) || item.frequency || 0)"></span>
                    <span class="text-[10px] text-slate-400">pins</span>
                  </div>
                  <div class="font-mono tabular-nums text-[11px] text-rose-600 dark:text-rose-400 font-bold" 
                       x-text="matrixSubFilter === 'capsules' ? (item.cross_serp_velocity > 0 ? (formatVelocity(item.cross_serp_velocity) + ' · Score ' + Number(item.score || 0).toFixed(1)) : ('Score ' + Number(item.score || 0).toFixed(1))) : formatVelocity(item.total_velocity || item.total_24h_gain || item.velocity || item.avg_velocity || 0)"></div>
                  <template x-if="Number(item.total_repins_delta || item.repins_surge || 0) > 0">
                    <div class="font-mono tabular-nums text-[10px] text-purple-600 dark:text-purple-400 font-bold"
                         x-text="'+' + formatNumber(item.total_repins_delta || item.repins_surge || 0) + ' repins'"></div>
                  </template>
                </div>
              </div>
            </template>
          </div>

          <!-- Master Table Load More -->
          <div x-show="getMatrixEntities().length > displayLimits.matrix" class="p-3 border-t border-slate-200 dark:border-[#27272A] text-center bg-slate-50/50 dark:bg-[#18181B]/30">
            <button 
              type="button" 
              @click="displayLimits.matrix += 50" 
              class="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#18181B] transition cursor-pointer shadow-2xs"
            >
              <span>Load More Patterns (+50)</span>
            </button>
          </div>
        </div>

        <!-- RIGHT PANEL: Visual Pin Drill-Down (7 cols) -->
        <div class="lg:col-span-7 space-y-4">
          <!-- Active Selection Header Card -->
          <div class="p-4 rounded-2xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div class="min-w-0">
              <div class="text-[10.5px] font-mono uppercase text-slate-400 font-bold">Matching Surging Pins</div>
              <h3 class="text-base font-bold text-slate-900 dark:text-white truncate mt-0.5">
                <span x-text="getMatrixItemTag(selectedMatrixItem) || 'Select an entity on left'"></span>
              </h3>
              <p class="text-xs text-slate-500 dark:text-[#A1A1AA] mt-0.5">
                Real-time breakout pins carrying this exact semantic hook
              </p>
            </div>

            <!-- Filter Feed CTA -->
            <button 
              type="button" 
              @click="setTagFilter(getMatrixItemTag(selectedMatrixItem))" 
              class="px-3.5 py-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-bold transition flex items-center space-x-1.5 shrink-0 cursor-pointer shadow-2xs"
              title="Filter Room 1 feed by this tag"
            >
              <i data-lucide="filter" class="w-3.5 h-3.5"></i>
              <span>Filter Radar Feed</span>
            </button>
          </div>

          <!-- Matching Pins Grid -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <template x-for="(p, pidx) in getSelectedMatrixPins()" :key="p.pin_id || pidx">
              <div class="p-3.5 rounded-2xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] hover:border-rose-500/40 transition shadow-2xs flex flex-col justify-between space-y-3 group">
                <div class="flex items-start space-x-3">
                  <!-- Thumbnail with /pin/:id and Pinterest links [Bug 9 Fix] -->
                  <div class="w-12 h-18 rounded-lg bg-slate-100 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A] overflow-hidden shrink-0 relative cursor-pointer"
                       @click="openBlueprintModal(p)">
                    <img :src="window.resolvePinImageUrl(p.image_url, '236x')" 
                         alt="Pin thumbnail" 
                         loading="lazy" 
                         class="w-full h-full object-cover group-hover:scale-105 transition" 
                         onerror="window.handlePinImgError(this)" />
                  </div>

                  <!-- Details -->
                  <div class="min-w-0 flex-1 space-y-1">
                    <a :href="'/pin/' + p.pin_id" 
                       class="font-bold text-xs text-slate-900 dark:text-white line-clamp-2 hover:text-rose-600 transition" 
                       :title="p.title"
                       x-text="p.title || 'Untitled Pin'"></a>
                    
                    <div class="flex items-center gap-2 font-mono text-[11px] pt-0.5">
                      <span class="text-rose-600 dark:text-rose-400 font-bold" 
                            x-text="formatVelocity(p.window_saves_gain || p.daily_save_velocity || p.delta_saves_24h || 0)"></span>
                      <span class="text-purple-600 dark:text-purple-400 font-bold" 
                            x-text="'+' + formatNumber(p.delta_repins_24h || 0) + ' repins'"></span>
                      <span class="text-slate-400" x-text="(p.pin_age_days !== null && p.pin_age_days !== undefined && p.pin_age_days !== '') ? formatAge(p.pin_age_days) : '—'"></span>
                    </div>

                    <div class="text-[10.5px] text-slate-400 truncate font-mono" 
                         x-text="p.domain || 'Uploaded by user'"></div>
                  </div>
                </div>

                <!-- Clickable Tag Badges (Highlight active match, up to 4 tags) [Bug 2 Fix] -->
                <div class="flex items-center gap-1 flex-wrap pt-1 border-t border-slate-100 dark:border-[#27272A]/50">
                  <template x-for="(t, tidx) in (p.visual_annotations || p.annotations || []).slice(0, 4)" :key="tidx">
                    <span 
                      class="px-1.5 py-0.5 rounded text-[9.5px] font-mono border"
                      :class="(getMatrixItemTag(selectedMatrixItem).toLowerCase().includes((t.display || t.norm || t).toLowerCase())) ? 'bg-rose-500/15 border-rose-500/40 text-rose-600 dark:text-rose-400 font-bold' : 'bg-slate-100 dark:bg-[#18181B] border-slate-200 dark:border-[#27272A] text-slate-500'"
                      x-text="'#' + (t.display || t.norm || t)"
                    ></span>
                  </template>
                </div>

                <!-- Footer Quick Actions (Direct /pin/:id link & Blueprint) [Bug 9 Fix] -->
                <div class="flex items-center justify-between pt-1">
                  <a :href="'/pin/' + p.pin_id" 
                     class="text-[10.5px] font-mono text-rose-600 dark:text-rose-400 hover:underline flex items-center space-x-0.5">
                    <span>Full Dossier</span>
                    <i data-lucide="arrow-up-right" class="w-3 h-3"></i>
                  </a>

                  <button 
                    type="button" 
                    @click="openBlueprintModal(p)" 
                    class="px-2.5 py-1 rounded-lg border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-[11px] font-bold transition cursor-pointer"
                  >
                    <span>⚡ Blueprint</span>
                  </button>
                </div>
              </div>
            </template>
          </div>

          <!-- Empty State -->
          <div x-show="!getSelectedMatrixPins().length" class="p-8 rounded-2xl border border-dashed border-slate-200 dark:border-[#27272A] text-center space-y-2">
            <i data-lucide="inbox" class="w-8 h-8 text-slate-400 mx-auto"></i>
            <div class="text-xs font-semibold text-slate-700 dark:text-slate-300">No matching surging pins found for this pattern in current telemetry</div>
            <div class="text-[11px] text-slate-400 font-mono">Select another crossover row or change the time window</div>
          </div>
        </div>

      </div>
    </section>

    <!-- =================================================================== -->
    <!-- ROOM 3: 🚀 BREAKOUT CREATORS & SERP VACUUM TARGETS                 -->
    <!-- =================================================================== -->
    <section x-show="currentRoom === 'creators_vacuums'" class="space-y-6">
      
      <!-- TOP SECTION: Verified Positive-Only Creators -->
      <div class="space-y-4">
        <div class="flex items-center justify-between flex-wrap gap-2 text-xs">
          <div class="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-[#18181B] rounded-xl border border-slate-200 dark:border-[#27272A]">
            <button 
              type="button" 
              @click="setCreatorSubFilter('all')" 
              class="px-3.5 py-1.5 rounded-lg font-semibold transition cursor-pointer"
              :class="creatorSubFilter === 'all' ? 'bg-white dark:bg-[#121215] text-sky-600 dark:text-sky-400 shadow-2xs font-bold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'"
            >
              <span>All Surging Creators</span>
              <span class="ml-1 font-mono text-[10px]" x-text="'(' + getFilteredCreators().length + ')'"></span>
            </button>
            <button 
              type="button" 
              @click="setCreatorSubFilter('david')" 
              class="px-3.5 py-1.5 rounded-lg font-semibold transition cursor-pointer"
              :class="creatorSubFilter === 'david' ? 'bg-white dark:bg-[#121215] text-emerald-600 dark:text-emerald-400 shadow-2xs font-bold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'"
            >
              <span>🏹 David Breakouts (High Velocity Small Accounts)</span>
            </button>
          </div>

          <div class="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums" x-text="'Showing ' + Math.min(displayLimits.creators, getFilteredCreators().length) + ' verified growth creators'"></div>
        </div>

        <!-- Creators Table -->
        <div class="rounded-2xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] overflow-hidden shadow-xs">
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs border-collapse">
              <thead>
                <tr class="border-b border-slate-200 dark:border-[#27272A] bg-slate-50/75 dark:bg-[#18181B]/50 font-mono tabular-nums text-slate-500 text-[10.5px] uppercase">
                  <th class="py-2.5 px-3 min-w-[200px]">Creator Profile</th>
                  <th class="py-2.5 px-3 text-right">Impressions</th>
                  <th class="py-2.5 px-3 text-right">Total Audience</th>
                  <th class="py-2.5 px-3 text-right">24h Δ Reach</th>
                  <th class="py-2.5 px-3 text-right">7d Δ Reach</th>
                  <th class="py-2.5 px-3 text-center min-w-[260px]">Top Driver Pins</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-[#27272A]/60">
                <template x-for="(c, idx) in getFilteredCreators().slice(0, displayLimits.creators)" :key="c.id || idx">
                  <tr class="hover:bg-slate-50/80 dark:hover:bg-[#18181B]/60 transition">
                    <!-- Profile Info -->
                    <td class="py-2.5 px-3">
                      <div class="font-bold text-slate-900 dark:text-white flex items-center space-x-1.5">
                        <span x-text="c.display_name || c.username"></span>
                        <template x-if="c.is_david_breakout || c.is_david_account">
                          <span class="px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[9px] font-mono font-bold border border-emerald-500/20">David Breakout</span>
                        </template>
                      </div>
                      <div class="text-[10.5px] text-slate-400 font-mono" x-text="'@' + c.username"></div>
                    </td>

                    <!-- Pinterest Business Terminology: Impressions & Total Audience -->
                    <td class="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300" x-text="formatNumber(c.profile_views || 0)"></td>
                    <td class="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-slate-900 dark:text-white" x-text="formatNumber(c.monthly_reach || 0)"></td>
                    <td class="py-2.5 px-3 text-right font-mono tabular-nums font-bold"
                        :class="Number(c.effective_delta_reach_24h || c.delta_reach_24h || 0) > 0 ? 'text-emerald-600 dark:text-emerald-400' : (Number(c.effective_delta_reach_24h || c.delta_reach_24h || 0) < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400 dark:text-zinc-500')"
                        x-text="(Number(c.effective_delta_reach_24h || c.delta_reach_24h || 0) > 0 ? '+' : '') + formatNumber(c.effective_delta_reach_24h || c.delta_reach_24h || 0)"></td>
                    <td class="py-2.5 px-3 text-right font-mono tabular-nums text-purple-600 dark:text-purple-400" x-text="(Number(c.reach_delta_7d || 0) > 0 ? '+' : '') + formatNumber(c.reach_delta_7d || 0)"></td>

                    <!-- Driver Pins Micro-Cards [Bug 6 & Bug 9 Fix] -->
                    <td class="py-2.5 px-3">
                      <div class="flex items-center justify-center gap-2 flex-wrap">
                        <template x-for="(p, pidx) in (c.driver_pins || []).slice(0, 3)" :key="p.pin_id || pidx">
                          <div class="flex items-center gap-1.5 p-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#18181B] hover:border-rose-500/40 cursor-pointer transition shadow-2xs group"
                               @click="openBlueprintModal(p)"
                               :title="p.title || 'Driver Pin'">
                            <div class="w-7 h-10 rounded bg-slate-200 dark:bg-[#27272A] overflow-hidden shrink-0">
                              <img :src="p.image_url ? window.resolvePinImageUrl(p.image_url, '236x') : window.resolvePinImageUrl('', '236x')" 
                                   alt="Driver" 
                                   class="w-full h-full object-cover group-hover:scale-105 transition" 
                                   onerror="window.handlePinImgError(this)" 
                                   loading="lazy" />
                            </div>
                            <div class="min-w-0 pr-1 text-left">
                              <div class="text-[10px] font-bold text-slate-900 dark:text-white truncate max-w-[85px]" x-text="p.title || 'Driver Pin'"></div>
                              <div class="text-[9.5px] font-mono tabular-nums text-rose-600 dark:text-rose-400 font-bold" x-text="formatVelocity(p.daily_save_velocity || p.delta_saves_24h || p.effective_24h_gain || 0)"></div>
                            </div>
                          </div>
                        </template>
                        <template x-if="!(c.driver_pins && c.driver_pins.length)">
                          <span class="text-slate-400 text-[10px] italic">No driver pins in SERP</span>
                        </template>
                      </div>
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>

          <!-- Load More Creators -->
          <div x-show="getFilteredCreators().length > displayLimits.creators" class="p-3 border-t border-slate-200 dark:border-[#27272A] text-center bg-slate-50/50 dark:bg-[#18181B]/30">
            <button 
              type="button" 
              @click="displayLimits.creators += 50" 
              class="px-4 py-1.5 rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#18181B] transition cursor-pointer shadow-2xs"
            >
              <span>Load More Creators (+50)</span>
            </button>
          </div>
        </div>
      </div>

      <!-- BOTTOM SECTION: Clean Separation into Domainless Viral Pins vs SERP Vacuums -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        
        <!-- Part A: 💎 True Domainless Viral Pins -->
        <div class="rounded-2xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] overflow-hidden shadow-xs p-4 space-y-3">
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-2">
              <span class="text-base">💎</span>
              <h3 class="font-bold text-slate-900 dark:text-white text-sm">True Domainless Viral Pins</h3>
            </div>
            <span class="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 font-bold">Blog Hijack Ripe</span>
          </div>
          <p class="text-xs text-slate-500 dark:text-[#A1A1AA]">
            Pins with heavy viral save volume but zero external destination website. Prime opportunities to build landing pages and capture traffic.
          </p>

          <div class="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
            <template x-for="(gem, idx) in getDomainlessViralPins().slice(0, displayLimits.domainless)" :key="gem.pin_id || idx">
              <div class="p-3 rounded-xl border border-rose-500/20 bg-rose-500/5 flex items-center justify-between gap-3">
                <div class="flex items-center space-x-3 min-w-0">
                  <div class="w-10 h-14 rounded-lg bg-slate-100 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A] overflow-hidden shrink-0 cursor-pointer"
                       @click="openBlueprintModal(gem)">
                    <img :src="window.resolvePinImageUrl(gem.image_url, '236x')" alt="Gem" class="w-full h-full object-cover" onerror="window.handlePinImgError(this)" />
                  </div>
                  <div class="min-w-0 space-y-0.5">
                    <a :href="'/pin/' + gem.pin_id" 
                       class="font-bold text-xs text-slate-900 dark:text-white truncate hover:text-rose-600 transition block" 
                       x-text="gem.title || 'Domainless Viral Target'"></a>
                    
                    <!-- Destination URL status [Bug 5 Fix] -->
                    <div class="text-[10px] text-slate-500 dark:text-slate-400 font-mono" 
                         x-text="formatNumber(gem.save_count || 0) + ' saves · ' + ((!gem.domain || gem.domain === 'Uploaded by user' || gem.domain.includes('pinterest.') || !gem.destination_url) ? 'Uploaded by user (Ripe for Blog Hijack)' : gem.domain)"></div>
                    
                    <div class="text-[9.5px] font-mono text-rose-600 dark:text-rose-400 font-bold"
                         x-text="formatVelocity(gem.daily_save_velocity || gem.delta_saves_24h || 0) + ' save velocity'"></div>
                  </div>
                </div>

                <button type="button" @click="openBlueprintModal(gem)" class="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[10.5px] font-bold shrink-0 cursor-pointer shadow-2xs">
                  <span>⚡ Hijack</span>
                </button>
              </div>
            </template>
          </div>
        </div>

        <!-- Part B: 🌪️ High-Churn Keyword SERP Vacuums -->
        <div class="rounded-2xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] overflow-hidden shadow-xs p-4 space-y-3">
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-2">
              <span class="text-base">🌪️</span>
              <h3 class="font-bold text-slate-900 dark:text-white text-sm">High-Churn Keyword SERP Vacuums</h3>
            </div>
            <span class="text-[11px] font-mono text-purple-600 dark:text-purple-400 font-bold">Top 10 Flux</span>
          </div>
          <p class="text-xs text-slate-500 dark:text-[#A1A1AA]">
            Keywords where previously ranking pins were displaced from the top 10 positions within the last 24h. Algorithmic churn creates entry vacuums.
          </p>

          <div class="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
            <template x-for="(v, idx) in getKeywordVacuums().slice(0, displayLimits.vacuums)" :key="v.keyword_id || idx">
              <div class="p-3 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50/60 dark:bg-[#18181B]/60 flex items-center justify-between gap-3">
                <div class="min-w-0 space-y-0.5">
                  <div class="font-bold text-xs text-slate-900 dark:text-white truncate" x-text="v.keyword_text || v.keyword"></div>
                  <div class="text-[10px] text-slate-400 font-mono" x-text="(v.displaced_top10_24h_count || 0) + ' pins displaced from Top 10 in 24h'"></div>
                </div>

                <div class="flex items-center space-x-2 shrink-0">
                  <span class="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20" 
                        x-text="'Score: ' + (v.vacuum_score || v.displaced_top10_24h_count || 0)"></span>
                  <a :href="getKeywordUrl(v.keyword_slug || v.keyword_text || v.keyword, v.keyword_id)" 
                     class="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] text-[10.5px] font-semibold text-rose-600 dark:text-rose-400 hover:border-rose-500 transition flex items-center space-x-0.5">
                    <span>Inspect</span>
                    <i data-lucide="arrow-up-right" class="w-3 h-3"></i>
                  </a>
                </div>
              </div>
            </template>
          </div>
        </div>

      </div>

    </section>

  </main>

  <!-- ======================================================== -->
  <!-- PERSISTENT SLIDE-OVER: PIN DOSSIER & PRODUCTION BLUEPRINT -->
  <!-- ======================================================== -->
  <div 
    x-show="isBlueprintModalOpen" 
    x-cloak 
    class="fixed inset-0 z-50 overflow-hidden"
    role="dialog" 
    aria-modal="true" 
    aria-labelledby="blueprint-drawer-title"
    @keydown.escape.window="if (isBlueprintModalOpen) closeBlueprintModal();"
  >
    <!-- Backdrop -->
    <div class="fixed inset-0 bg-slate-950/70 backdrop-blur-xs transition-opacity"
         @click="closeBlueprintModal()"></div>

    <!-- Slide-Over Panel Container -->
    <div class="fixed inset-y-0 right-0 max-w-full flex pl-6 sm:pl-10">
      <div class="w-screen max-w-2xl bg-white dark:bg-[#121215] border-l border-slate-200 dark:border-[#27272A] shadow-2xl flex flex-col h-full overflow-hidden font-sans"
           @click.stop>
        
        <!-- Top Action Ribbon -->
        <div class="p-4 sm:p-5 border-b border-slate-200 dark:border-[#27272A] flex items-center justify-between gap-3 bg-slate-50/50 dark:bg-[#18181B]/40 shrink-0">
          <div class="flex items-center space-x-3 min-w-0">
            <div class="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 flex items-center justify-center shrink-0">
              <i data-lucide="dna" class="w-5 h-5"></i>
            </div>
            <div class="min-w-0">
              <h2 id="blueprint-drawer-title" class="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
                Scientific Pin Blueprint &amp; Production Dossier
              </h2>
              <div class="text-[11px] font-mono text-slate-400 flex items-center space-x-2">
                <span x-text="'Pin #' + (activeBlueprintPin?.pin_id || '')"></span>
                <span class="text-slate-300 dark:text-[#27272A]">•</span>
                <span class="text-rose-500 font-bold" x-text="formatVelocity(activeBlueprintPin?.daily_save_velocity || activeBlueprintPin?.delta_saves_24h || 0) + ' saves/d'"></span>
              </div>
            </div>
          </div>

          <!-- Action Cluster [Bug 9 Fix] -->
          <div class="flex items-center space-x-2 shrink-0">
            <!-- Direct internal link to /pin/:id -->
            <a :href="'/pin/' + (activeBlueprintPin?.pin_id || '')" 
               class="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] hover:border-rose-500 text-slate-700 dark:text-slate-200 hover:text-rose-600 text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer shadow-2xs"
               title="Open internal full PAE Pin Dossier">
              <span>Dossier (/pin/:id) ↗</span>
            </a>

            <!-- External Pinterest link -->
            <a :href="'https://www.pinterest.com/pin/' + (activeBlueprintPin?.pin_id || '') + '/'" 
               target="_blank" 
               rel="noopener noreferrer" 
               class="p-2 rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] text-slate-400 hover:text-rose-500 transition" 
               title="View on Pinterest">
              <i data-lucide="external-link" class="w-4 h-4"></i>
            </a>

            <!-- Copy Complete Markdown Blueprint -->
            <button type="button" 
                    @click="copyBlueprintMarkdown()" 
                    class="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition flex items-center space-x-1.5 shadow-xs cursor-pointer">
              <i data-lucide="copy" class="w-3.5 h-3.5"></i>
              <span x-text="blueprintCopied ? 'Copied!' : 'Copy Blueprint'"></span>
            </button>

            <!-- Close Drawer -->
            <button type="button" 
                    @click="closeBlueprintModal()" 
                    class="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-xl hover:bg-slate-100 dark:hover:bg-[#18181B] cursor-pointer">
              <i data-lucide="x" class="w-4 h-4"></i>
            </button>
          </div>
        </div>

        <!-- Drawer Body -->
        <div class="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 text-xs font-sans">
          
          <!-- Live Background Hydration Status Indicator -->
          <div x-show="isDossierHydrating" class="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-[11px] font-mono flex items-center space-x-2">
            <i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin text-amber-500 shrink-0"></i>
            <span>Hydrating deep description, SEO alt-text, and Shard trajectory in background...</span>
          </div>

          <!-- Hero Pin Card -->
          <div class="p-4 rounded-2xl border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#18181B] flex items-start space-x-4">
            <div class="w-16 h-24 rounded-xl bg-slate-200 dark:bg-[#27272A] border border-slate-300 dark:border-slate-700 overflow-hidden shrink-0">
              <img :src="window.resolvePinImageUrl(activeBlueprintPin?.image_url, '474x')" 
                   alt="Blueprint Pin" 
                   class="w-full h-full object-cover" 
                   onerror="window.handlePinImgError(this)" />
            </div>
            <div class="space-y-1.5 min-w-0 flex-1">
              <div class="font-bold text-slate-900 dark:text-white text-sm" x-text="activeBlueprintPin?.title || 'Untitled Pin'"></div>
              <div class="text-[11px] text-slate-500 font-mono" x-text="'Target Board: ' + (activeBlueprintPin?.board_name || 'General Inspiration')"></div>
              <div class="flex items-center gap-2.5 pt-1 font-mono text-[11px] flex-wrap">
                <span class="text-rose-600 dark:text-rose-400 font-bold" x-text="formatVelocity(activeBlueprintPin?.daily_save_velocity || activeBlueprintPin?.delta_saves_24h || 0) + ' saves/d'"></span>
                <span class="text-purple-600 dark:text-purple-400 font-bold" x-text="'+' + formatNumber(activeBlueprintPin?.delta_repins_24h || 0) + ' repins'"></span>
                <span class="text-slate-400" x-text="(activeBlueprintPin && activeBlueprintPin.pin_age_days !== null && activeBlueprintPin.pin_age_days !== undefined && activeBlueprintPin.pin_age_days !== '') ? formatAge(activeBlueprintPin.pin_age_days) : '—'"></span>
                <span class="text-slate-400" x-text="activeBlueprintPin?.domain ? '• ' + activeBlueprintPin.domain : ''"></span>
              </div>
            </div>
          </div>

          <!-- 1. Extracted Title Section (with Copy) -->
          <div class="space-y-1.5">
            <div class="flex items-center justify-between">
              <span class="text-[11px] font-bold uppercase font-mono text-slate-400">1. Pin Title</span>
              <button type="button" @click="copyText(activeBlueprintPin?.title || '', 'Title')" class="text-rose-600 hover:underline font-mono text-[10.5px]">Copy Title</button>
            </div>
            <div class="p-3 rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] font-medium text-slate-800 dark:text-slate-200"
                 x-text="activeBlueprintPin?.title || 'N/A'"></div>
          </div>

          <!-- 2. Extracted Description Section (with Copy) -->
          <div class="space-y-1.5">
            <div class="flex items-center justify-between">
              <span class="text-[11px] font-bold uppercase font-mono text-slate-400">2. Extracted Description</span>
              <button type="button" @click="copyText(activeBlueprintPin?.description || '', 'Description')" class="text-rose-600 hover:underline font-mono text-[10.5px]">Copy Description</button>
            </div>
            <div class="p-3 rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] text-slate-700 dark:text-slate-300 leading-relaxed max-h-36 overflow-y-auto">
              <span x-text="activeBlueprintPin?.description ? activeBlueprintPin.description : (isDossierHydrating ? 'Hydrating description...' : '[No description provided by original creator]')"></span>
            </div>
          </div>

          <!-- 3. SEO Alt-Text Section (with Copy) -->
          <div class="space-y-1.5">
            <div class="flex items-center justify-between">
              <span class="text-[11px] font-bold uppercase font-mono text-slate-400">3. SEO Alt-Text</span>
              <button type="button" @click="copyText(activeBlueprintPin?.alt_text || generateRecommendedAltText(activeBlueprintPin), 'Alt-Text')" class="text-rose-600 hover:underline font-mono text-[10.5px]">Copy Alt-Text</button>
            </div>
            <div class="p-3 rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] text-slate-700 dark:text-slate-300 font-mono text-[11.5px]">
              <template x-if="activeBlueprintPin?.alt_text">
                <span x-text="activeBlueprintPin.alt_text"></span>
              </template>
              <template x-if="!activeBlueprintPin?.alt_text">
                <div>
                  <span class="text-amber-500 font-bold">[Recommended Alt-Text]:</span>
                  <span class="text-slate-500 dark:text-[#A1A1AA]" x-text="generateRecommendedAltText(activeBlueprintPin)"></span>
                </div>
              </template>
            </div>
          </div>

          <!-- 4. Visual Annotations Co-Occurrence Pills (Clickable) [Bug 2 Fix] -->
          <div class="space-y-1.5">
            <div class="flex items-center justify-between">
              <span class="text-[11px] font-bold uppercase font-mono text-slate-400">4. Visual Annotations (Clickable Filter Pills)</span>
              <span class="text-[10px] font-mono text-slate-400" x-text="((activeBlueprintPin?.visual_annotations || activeBlueprintPin?.annotations || []).length) + ' tags'"></span>
            </div>
            <div class="p-3 rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B]">
              <div class="flex items-center gap-1.5 flex-wrap">
                <template x-for="(tag, tidx) in (activeBlueprintPin?.visual_annotations || activeBlueprintPin?.annotations || [])" :key="tidx">
                  <button type="button" 
                          @click="setTagFilter(tag.display || tag.norm || tag); closeBlueprintModal();"
                          class="px-2 py-1 rounded-md bg-slate-100 hover:bg-rose-50 dark:bg-[#27272A] dark:hover:bg-rose-950/40 font-mono text-[11px] text-slate-700 hover:text-rose-600 dark:text-slate-300 dark:hover:text-rose-400 border border-slate-200 dark:border-slate-700 hover:border-rose-500 transition cursor-pointer"
                          title="Filter 24h Radar by this tag">
                    <span x-text="'#' + (tag.display || tag.norm || tag)"></span>
                  </button>
                </template>
                <template x-if="!((activeBlueprintPin?.visual_annotations || activeBlueprintPin?.annotations || []).length)">
                  <span class="text-slate-400 italic">No visual tags detected in Hub SERP snapshot</span>
                </template>
              </div>
            </div>
          </div>

          <!-- 5. Multi-Keyword SERP Footprint -->
          <div class="space-y-1.5">
            <div class="text-[11px] font-bold uppercase font-mono text-slate-400">5. Multi-Keyword SERP Footprint</div>
            <div class="rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] overflow-hidden">
              <table class="w-full text-left text-xs border-collapse">
                <thead>
                  <tr class="border-b border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#121215] font-mono text-[10px] text-slate-400 uppercase">
                    <th class="py-2 px-3">Keyword</th>
                    <th class="py-2 px-3 text-right">Rank</th>
                    <th class="py-2 px-3 text-right">Folder</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 dark:divide-[#27272A]/50 font-mono text-[11px]">
                  <template x-for="(kw, kwidx) in (activeBlueprintPin?.keywords || [{ keyword: activeBlueprintPin?.keyword_text, rank: activeBlueprintPin?.rank_position }])" :key="kwidx">
                    <tr>
                      <td class="py-2 px-3 font-medium text-slate-800 dark:text-slate-200">
                        <a :href="getKeywordUrl(kw.keyword || kw.keyword_text || kw.keyword_slug, kw.keyword_id)" 
                           class="hover:text-rose-600 hover:underline transition"
                           x-text="kw.keyword || kw.keyword_text || 'Universal'"></a>
                      </td>
                      <td class="py-2 px-3 text-right font-bold text-rose-600" x-text="'#' + (kw.rank || activeBlueprintPin?.rank_position || '1')"></td>
                      <td class="py-2 px-3 text-right text-slate-400" x-text="kw.folder_name || 'Global'"></td>
                    </tr>
                  </template>
                </tbody>
              </table>
            </div>
          </div>

          <!-- 6. Ready-to-Execute Production AI Blueprint Formula -->
          <div class="space-y-1.5">
            <div class="flex items-center justify-between">
              <span class="text-[11px] font-bold uppercase font-mono text-slate-400">6. AI Visual Generation Prompt (Midjourney v6 / Ideogram)</span>
              <button type="button" @click="copyAiPrompt(activeBlueprintPin)" class="text-rose-600 hover:underline font-mono text-[10.5px]">
                <span x-text="promptCopied ? 'Copied Prompt!' : 'Copy AI Prompt'"></span>
              </button>
            </div>
            <div class="p-3.5 rounded-xl border border-rose-500/30 bg-rose-500/5 font-mono text-[11.5px] leading-relaxed text-slate-800 dark:text-slate-200"
                 x-text="generateAiPrompt(activeBlueprintPin)"></div>
          </div>

        </div>
      </div>
    </div>
  </div>

  <script>
    function pulseStudioApp(initialFolderId) {
      return {
        // [INVARIANT: HEADLESS-NODE-SHIELD] Browser environment guards
        isDark: (typeof localStorage !== 'undefined') ? (localStorage.getItem('pa_theme') !== 'light') : true,
        darkMode: (typeof localStorage !== 'undefined') ? (localStorage.getItem('pa_theme') !== 'light') : true,
        isSidebarCollapsed: (typeof localStorage !== 'undefined') ? (localStorage.getItem('pae_sidebar_collapsed') === 'true') : false,
        isMobileMenuOpen: false,
        scopedFolderId: initialFolderId || '',
        activeFolderId: initialFolderId || '',
        activeFolder: null,
        foldersList: [],

        // 3-Room Navigation State
        currentRoom: 'radar', // 'radar' | 'matrix' | 'creators_vacuums'
        activeTab: 'breakouts', // Backward compatibility alias

        // Room 1: Radar State
        radarFilter: 'all', // 'all' | 'fresh' | 'bridges' | 'domainless' | 'vault'
        breakoutSubFilter: 'all', // Backward compatibility alias
        activeTagFilter: '', // Active visual annotation or capsule filter chip
        searchQuery: '',

        // Room 2: Matrix State
        matrixSubFilter: 'pairs', // 'pairs' | 'triplets' | 'single' | 'capsules' | 'colors'
        annotationSubFilter: 'pairs', // Backward compatibility alias
        matrixSortMode: 'gain',
        selectedMatrixItem: null,

        // Room 3: Breakout Creators & Vacuums State
        creatorSubFilter: 'all', // 'all' | 'david'

        // Persistent Slide-Over Drawer State
        isBlueprintModalOpen: false,
        activeBlueprintPin: null,
        isDossierHydrating: false,
        blueprintCopied: false,
        promptCopied: false,

        // Networking & Stampede Defense [INVARIANT: MONOTONIC-REQUEST-SEQUENCING]
        isLoading: false,
        isRefreshing: false,
        selectedWindow: '24h',
        _pulseReqSeq: 0,

        // Windowed Pagination Caps [INVARIANT: WINDOWED-DOM-PAGINATION]
        displayLimits: {
          radar: 50,
          breakouts: 50,
          matrix: 50,
          annotations: 50,
          capsules: 50,
          creators: 50,
          domainless: 50,
          vacuums: 50,
          bridges: 50,
          gems: 50
        },

        // Ingested Telemetry Containers
        kpis: {},
        breakout_pins: {
          top_breakouts: [],
          fresh_rockets: [],
          vault_surge_pins: [],
          pinarchive_winners: []
        },
        annotation_crossovers: {
          single_annotations: [],
          pair_crossovers: [],
          triplet_crossovers: []
        },
        guided_capsule_crossovers: [],
        creator_breakouts: [],
        keyword_vacuums_and_bridges: {
          bridge_pins: [],
          keyword_vacuum_opportunities: []
        },
        hidden_gems_telemetry: {
          winning_boards: [],
          vacuum_hijack_pins: [],
          domainless_viral_pins: [],
          creation_method_breakdown: [],
          dominant_color_palette: [],
          top_arbitrage_domains: []
        },

        toasts: [],

        init: function() {
          if (this.scopedFolderId) {
            this.loadFolderInfo();
          }
          this.fetchPulseData(false);

          if (typeof document !== 'undefined') {
            document.addEventListener('DOMContentLoaded', function() {
              if (typeof lucide !== 'undefined' && lucide.createIcons) {
                lucide.createIcons();
              }
            });
          }
        },

        loadFolderInfo: async function() {
          try {
            if (!this.scopedFolderId) return;
            const res = await fetch('/api/keywords/folders');
            const data = await res.json();
            if (data && Array.isArray(data.folders)) {
              this.foldersList = data.folders;
              const found = data.folders.find(f => String(f.id) === String(this.scopedFolderId));
              if (found) {
                this.activeFolder = found;
              }
            }
          } catch (_) {}
        },

        setRoom: function(room) {
          this.currentRoom = room;
          if (room === 'radar') this.activeTab = 'breakouts';
          else if (room === 'matrix') this.activeTab = 'annotations';
          else if (room === 'creators_vacuums') this.activeTab = 'creators';
          this.$nextTick(function() {
            if (typeof lucide !== 'undefined' && lucide.createIcons) {
              lucide.createIcons();
            }
          });
        },

        setRadarFilter: function(filter) {
          this.radarFilter = filter;
          this.breakoutSubFilter = filter;
          this.displayLimits.radar = 50;
          this.$nextTick(function() {
            if (typeof lucide !== 'undefined' && lucide.createIcons) {
              lucide.createIcons();
            }
          });
        },

        setTagFilter: function(tag) {
          if (!tag) return;
          this.activeTagFilter = String(tag).trim();
          this.currentRoom = 'radar';
          this.activeTab = 'breakouts';
          this.displayLimits.radar = 50;
          this.showToast('Filtering 24h Radar by tag: "' + this.activeTagFilter + '"', 'info');
          this.$nextTick(function() {
            if (typeof lucide !== 'undefined' && lucide.createIcons) {
              lucide.createIcons();
            }
          });
        },

        clearTagFilter: function() {
          this.activeTagFilter = '';
          this.showToast('Cleared tag filter', 'info');
          this.$nextTick(function() {
            if (typeof lucide !== 'undefined' && lucide.createIcons) {
              lucide.createIcons();
            }
          });
        },

        setMatrixSubFilter: function(sub) {
          this.matrixSubFilter = sub;
          this.annotationSubFilter = sub;
          this.displayLimits.matrix = 50;
          this.selectedMatrixItem = null;
          var entities = this.getMatrixEntities();
          if (entities && entities.length > 0) {
            this.selectedMatrixItem = entities[0];
          }
          this.$nextTick(function() {
            if (typeof lucide !== 'undefined' && lucide.createIcons) {
              lucide.createIcons();
            }
          });
        },

        selectMatrixItem: function(item) {
          this.selectedMatrixItem = item;
          this.$nextTick(function() {
            if (typeof lucide !== 'undefined' && lucide.createIcons) {
              lucide.createIcons();
            }
          });
        },

        isMatrixItemSelected: function(item) {
          if (!this.selectedMatrixItem || !item) return false;
          var sub = this.matrixSubFilter;
          if (sub === 'pairs') {
            return (item.pair || item.label) === (this.selectedMatrixItem.pair || this.selectedMatrixItem.label);
          }
          if (sub === 'triplets') {
            return (item.triplet || item.label) === (this.selectedMatrixItem.triplet || this.selectedMatrixItem.label);
          }
          if (sub === 'single') {
            return (item.norm || item.display || item.label) === (this.selectedMatrixItem.norm || this.selectedMatrixItem.display || this.selectedMatrixItem.label);
          }
          if (sub === 'capsules') {
            return (item.id && item.id === this.selectedMatrixItem.id) || (item.display_label === this.selectedMatrixItem.display_label);
          }
          if (sub === 'colors') {
            return (item.color || item.dominant_color) === (this.selectedMatrixItem.color || this.selectedMatrixItem.dominant_color);
          }
          if (sub === 'domains') {
            return (item.domain || item.label) === (this.selectedMatrixItem.domain || this.selectedMatrixItem.label);
          }
          return false;
        },

        getMatrixItemTag: function(item) {
          if (!item) return '';
          return item.domain || item.display_label || item.term || item.display || item.norm || item.label || item.pair || item.triplet || item.color || '';
        },

        setCreatorSubFilter: function(sub) {
          this.creatorSubFilter = sub;
          this.displayLimits.creators = 50;
          this.$nextTick(function() {
            if (typeof lucide !== 'undefined' && lucide.createIcons) {
              lucide.createIcons();
            }
          });
        },

        toggleSidebar: function() {
          this.isSidebarCollapsed = !this.isSidebarCollapsed;
          try {
            localStorage.setItem('pae_sidebar_collapsed', String(this.isSidebarCollapsed));
          } catch (_) {}
          this.$nextTick(function() {
            if (typeof lucide !== 'undefined' && lucide.createIcons) {
              lucide.createIcons();
            }
          });
        },

        toggleTheme: function() {
          this.isDark = !this.isDark;
          this.darkMode = this.isDark;
          try {
            localStorage.setItem('pa_theme', this.isDark ? 'dark' : 'light');
          } catch (_) {}
          if (this.isDark) {
            document.documentElement.classList.add('dark');
          } else {
            document.documentElement.classList.remove('dark');
          }
        },

        showToast: function(message, type) {
          type = type || 'info';
          var id = Date.now() + Math.random();
          this.toasts.push({ id: id, message: message, type: type });
          var self = this;
          setTimeout(function() {
            self.removeToast(id);
          }, 3500);
        },

        removeToast: function(id) {
          this.toasts = this.toasts.filter(function(t) { return t.id !== id; });
        },

        getKeywordUrl: function(kwTextOrSlug, kwId) {
          if (kwTextOrSlug && typeof kwTextOrSlug === 'string' && kwTextOrSlug.trim()) {
            var slug = kwTextOrSlug.trim().toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-+|-+$/g, '');
            if (slug) return '/keywords/' + encodeURIComponent(slug);
          }
          if (kwId) {
            return '/keywords/' + encodeURIComponent(String(kwId));
          }
          return '/keywords';
        },

        setWindow: function(win) {
          this.selectedWindow = win;
          this.fetchPulseData(false);
        },

        refreshPulse: function(force) {
          this.fetchPulseData(Boolean(force));
        },

        fetchPulseData: async function(forceRefresh) {
          var seq = ++this._pulseReqSeq;
          this.isLoading = true;
          if (forceRefresh) this.isRefreshing = true;

          try {
            var params = new URLSearchParams();
            if (this.scopedFolderId) params.set('folder_id', this.scopedFolderId);
            params.set('window', this.selectedWindow || '24h');
            if (forceRefresh) params.set('force', 'true');

            var url = '/api/pulse/24h?' + params.toString();
            var maxAttempts = 2;
            var res = null;
            var lastFetchErr = null;

            for (var attempt = 1; attempt <= maxAttempts; attempt++) {
              if (seq !== this._pulseReqSeq) return; // Discard if user triggered new action
              try {
                // Generate fresh AbortSignal for each attempt
                var fetchOptions = {
                  headers: { 'Accept': 'application/json' },
                  signal: (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) ? AbortSignal.timeout(15000) : undefined
                };

                res = await fetch(url, fetchOptions);

                // [INVARIANT: COLD-START-TRANSIENT-RETRY] Automatic retry on cold-start HTTP 502/503/504
                if ((res.status === 502 || res.status === 503 || res.status === 504) && attempt < maxAttempts && seq === this._pulseReqSeq) {
                  console.warn('[Pulse UI] Cold-start HTTP ' + res.status + ' encountered (attempt ' + attempt + '/' + maxAttempts + '). Retrying in 1,200ms...');
                  await new Promise(function(resolve) { setTimeout(resolve, 1200); });
                  continue;
                }

                lastFetchErr = null;
                break;
              } catch (fetchErr) {
                lastFetchErr = fetchErr;
                var isTransient = fetchErr.name === 'TimeoutError' ||
                                  fetchErr.name === 'AbortError' ||
                                  fetchErr instanceof TypeError ||
                                  (fetchErr.message && /network|fetch|timeout|abort/i.test(fetchErr.message));
                if (attempt < maxAttempts && isTransient && seq === this._pulseReqSeq) {
                  console.warn('[Pulse UI] Transient network/timeout error encountered (' + (fetchErr.message || fetchErr.name) + ') on attempt ' + attempt + '/' + maxAttempts + '. Retrying in 1,500ms...');
                  await new Promise(function(resolve) { setTimeout(resolve, 1500); });
                  continue;
                }
                throw fetchErr;
              }
            }

            if (seq !== this._pulseReqSeq) return; // Discard stale race responses
            if (lastFetchErr) throw lastFetchErr;
            if (!res) throw new Error('No response received from server');

            if (seq !== this._pulseReqSeq) return; // Discard stale race responses

            if (!res.ok) {
              var errData = null;
              try { errData = await res.json(); } catch (_) {}
              var msg = (errData && errData.message) ? errData.message : ('Server returned HTTP ' + res.status);
              throw new Error(msg);
            }

            var data = await res.json();
            if (seq !== this._pulseReqSeq) return;

            this.kpis = data.kpis || {};
            this.breakout_pins = {
              top_breakouts: Array.isArray(data.breakout_pins) ? data.breakout_pins : (data.breakout_pins?.top_breakouts || []),
              fresh_rockets: Array.isArray(data.fresh_rocket_pins) ? data.fresh_rocket_pins : (data.breakout_pins?.fresh_rockets || []),
              vault_surge_pins: Array.isArray(data.vault_surge_pins) ? data.vault_surge_pins : (data.breakout_pins?.vault_surge_pins || []),
              pinarchive_winners: Array.isArray(data.pinarchive_winners) ? data.pinarchive_winners : (data.breakout_pins?.pinarchive_winners || [])
            };
            this.annotation_crossovers = data.annotation_crossovers || {};
            this.guided_capsule_crossovers = data.guided_capsule_crossovers || [];
            this.creator_breakouts = data.creator_breakouts || [];
            this.keyword_vacuums_and_bridges = data.keyword_vacuums_and_bridges || {};
            this.hidden_gems_telemetry = data.hidden_gems_telemetry || {};

            // Sync selectedMatrixItem with fresh payload entities
            var entities = this.getMatrixEntities();
            if (entities && entities.length > 0) {
              var currentLabel = this.selectedMatrixItem ? this.getMatrixItemTag(this.selectedMatrixItem) : '';
              var matchedEntity = currentLabel
                ? entities.find(function(e) { return (e.display_label || e.term || e.display || e.norm || e.label || e.pair || e.triplet || e.color || '') === currentLabel; })
                : null;
              this.selectedMatrixItem = matchedEntity || entities[0];
            } else {
              this.selectedMatrixItem = null;
            }

            if (forceRefresh) {
              this.showToast('24h Pulse telemetry refreshed cleanly!', 'success');
            }
          } catch (err) {
            if (seq === this._pulseReqSeq) {
              console.error('Pulse fetch error:', err);
              this.showToast('Failed to load Pulse data: ' + (err.message || 'Network error'), 'error');
            }
          } finally {
            if (seq === this._pulseReqSeq) {
              this.isLoading = false;
              this.isRefreshing = false;
              this.$nextTick(function() {
                if (typeof lucide !== 'undefined' && lucide.createIcons) {
                  lucide.createIcons();
                }
              });
            }
          }
        },

        getFilteredRadarPins: function() {
          var list = (this.breakout_pins.top_breakouts && this.breakout_pins.top_breakouts.length)
            ? this.breakout_pins.top_breakouts.slice()
            : [];

          // Fallback if top_breakouts is empty: pool from other breakout lists
          if (!list.length) {
            var seen = new Set();
            var pools = [
              this.breakout_pins.fresh_rockets,
              this.breakout_pins.vault_surge_pins,
              this.breakout_pins.pinarchive_winners
            ];
            for (var pidx = 0; pidx < pools.length; pidx++) {
              var pool = pools[pidx] || [];
              for (var j = 0; j < pool.length; j++) {
                var pin = pool[j];
                if (pin && pin.pin_id && !seen.has(pin.pin_id)) {
                  seen.add(pin.pin_id);
                  list.push(pin);
                }
              }
            }

            // Filter out unhydrated skeleton pins lacking both image and valid title
            list = list.filter(function(p) {
              return !(!p.image_url && (!p.title || p.title === 'Untitled Pin'));
            });
          }

          // 1. Radar Filter Pills — Merge dedicated backend pools with any matching pins in top_breakouts (deduplicated by pin_id)
          var rf = this.radarFilter;
          var mergeUnique = function(primaryPool, secondaryMatched) {
            var merged = [];
            var seenIds = new Set();
            var a = primaryPool || [];
            var b = secondaryMatched || [];
            for (var i = 0; i < a.length; i++) {
              if (a[i] && a[i].pin_id && !seenIds.has(a[i].pin_id)) {
                seenIds.add(a[i].pin_id);
                merged.push(a[i]);
              }
            }
            for (var k = 0; k < b.length; k++) {
              if (b[k] && b[k].pin_id && !seenIds.has(b[k].pin_id)) {
                seenIds.add(b[k].pin_id);
                merged.push(b[k]);
              }
            }
            return merged;
          };
          if (rf === 'fresh') {
            var matchedFresh = list.filter(function(p) {
              return Boolean(p.is_fresh_14d || p.is_fresh_breakout || (p.pin_age_days !== null && p.pin_age_days !== undefined && p.pin_age_days !== '' && Number(p.pin_age_days) >= 0 && Number(p.pin_age_days) <= 14));
            });
            list = mergeUnique(this.breakout_pins.fresh_rockets, matchedFresh);
          } else if (rf === 'bridges') {
            var matchedBridges = list.filter(function(p) {
              return Boolean((p.overlap_count > 1) || (p.keywords && p.keywords.length > 1) || (p.keyword_count > 1));
            });
            list = mergeUnique(this.keyword_vacuums_and_bridges.bridge_pins, matchedBridges);
          } else if (rf === 'domainless') {
            var matchedDomainless = list.filter(function(p) {
              return !p.domain || p.domain === 'Uploaded by user' || p.domain.includes('pinterest.') || !p.destination_url;
            });
            list = mergeUnique(this.hidden_gems_telemetry.domainless_viral_pins, matchedDomainless);
          } else if (rf === 'vault') {
            var matchedVault = list.filter(function(p) { return Boolean(p.is_vault_surge || p.is_displaced); });
            list = mergeUnique(this.breakout_pins.vault_surge_pins, matchedVault);
          }

          // 2. Active Tag Filter (Clickable Tag Banner)
          if (this.activeTagFilter) {
            var tagQuery = this.activeTagFilter.toLowerCase();
            list = list.filter(function(p) {
              var tags = (p.visual_annotations || p.annotations || []).map(function(t) {
                return (typeof t === 'string' ? t : (t.norm || t.display || t.tag || '')).toLowerCase();
              });
              var text = ((p.title || '') + ' ' + (p.keyword_text || '') + ' ' + (p.domain || '')).toLowerCase();
              return tags.some(function(t) { return t.includes(tagQuery) || tagQuery.includes(t); }) || text.includes(tagQuery);
            });
          }

          // 3. Search Query Filter
          var q = (this.searchQuery || '').trim().toLowerCase();
          if (q) {
            list = list.filter(function(p) {
              var tags = (p.visual_annotations || p.annotations || []).map(function(t) {
                return (typeof t === 'string' ? t : (t.norm || t.display || t.tag || '')).toLowerCase();
              });
              return (p.title || '').toLowerCase().includes(q) ||
                     (p.domain || '').toLowerCase().includes(q) ||
                     (p.creator_username || '').toLowerCase().includes(q) ||
                     (p.keyword_text || '').toLowerCase().includes(q) ||
                     tags.some(function(t) { return t.includes(q); });
            });
          }

          // Sort by effective momentum descending (prioritizing hydrated pins with images)
          list.sort(function(a, b) {
            var aHyd = Boolean(a.image_url && a.title && a.title !== 'Untitled Pin');
            var bHyd = Boolean(b.image_url && b.title && b.title !== 'Untitled Pin');
            if (aHyd !== bHyd) return aHyd ? -1 : 1;

            var gainA = Math.max(Number(a.daily_save_velocity) || 0, Number(a.delta_saves_24h) || 0, Number(a.delta_repins_24h) || 0);
            var gainB = Math.max(Number(b.daily_save_velocity) || 0, Number(b.delta_saves_24h) || 0, Number(b.delta_repins_24h) || 0);
            return gainB - gainA;
          });

          return list;
        },

        getMatrixEntities: function() {
          var sub = this.matrixSubFilter;
          var list = [];
          if (sub === 'pairs') {
            list = (this.annotation_crossovers.pair_crossovers || []).filter(function(item) {
              var cnt = Number(item.pin_count || item.count || item.frequency || 0);
              return cnt >= 2;
            });
          } else if (sub === 'triplets') {
            list = (this.annotation_crossovers.triplet_crossovers || []).filter(function(item) {
              var cnt = Number(item.pin_count || item.count || item.frequency || 0);
              return cnt >= 2;
            });
          } else if (sub === 'single') {
            list = this.annotation_crossovers.single_annotations || [];
          } else if (sub === 'capsules') {
            list = this.guided_capsule_crossovers || [];
          } else if (sub === 'colors') {
            list = this.hidden_gems_telemetry.dominant_color_palette || [];
          } else if (sub === 'domains') {
            list = this.hidden_gems_telemetry.top_arbitrage_domains || [];
          }

          var q = (this.searchQuery || '').trim().toLowerCase();
          if (q) {
            list = list.filter(function(item) {
              var label = String(item.domain || item.label || item.pair || item.triplet || item.display || item.display_label || item.term || item.color || item.dominant_color || '').toLowerCase();
              return label.includes(q);
            });
          }

          if (!this.selectedMatrixItem && list.length > 0) {
            this.selectedMatrixItem = list[0];
          }

          return list;
        },

        // Helper: Color Swatch Count Resolver (satisfies col.pin_count || col.count parity)
        getColorCount: function(col) {
          if (!col) return 0;
          return col.pin_count || col.count || col.frequency || 0;
        },

        getSelectedMatrixPins: function() {
          if (!this.selectedMatrixItem) {
            var entities = this.getMatrixEntities();
            if (entities && entities.length > 0) {
              this.selectedMatrixItem = entities[0];
            }
          }
          var item = this.selectedMatrixItem;
          if (!item) return [];

          // Priority 1: Use backend matching_pins if populated
          if (Array.isArray(item.matching_pins) && item.matching_pins.length > 0) {
            return item.matching_pins.filter(function(p) { return Boolean(p && p.image_url); });
          }

          // Priority 2: In-memory client fallback scanning breakout_pins
          var allPins = [];
          var seenIds = new Set();
          var pools = [
            this.breakout_pins.top_breakouts,
            this.breakout_pins.fresh_rockets,
            this.breakout_pins.vault_surge_pins,
            this.breakout_pins.pinarchive_winners
          ];
          for (var i = 0; i < pools.length; i++) {
            var pool = pools[i] || [];
            for (var j = 0; j < pool.length; j++) {
              var p = pool[j];
              if (p && p.pin_id && !seenIds.has(p.pin_id)) {
                seenIds.add(p.pin_id);
                allPins.push(p);
              }
            }
          }

          var sub = this.matrixSubFilter;
          var matched = [];

          if (sub === 'pairs') {
            var pairStr = String(item.pair || item.label || item.display || '').toLowerCase();
            var pairTags = pairStr.split(/[+,/]/).map(function(s) { return s.trim(); }).filter(Boolean);
            matched = allPins.filter(function(p) {
              var pinTags = (p.visual_annotations || p.annotations || []).map(function(t) {
                return (typeof t === 'string' ? t : (t.norm || t.display || t.tag || '')).toLowerCase();
              });
              var pinText = ((p.title || '') + ' ' + (p.keyword_text || '')).toLowerCase();
              return pairTags.every(function(tag) {
                return pinTags.some(function(pt) { return pt.includes(tag) || tag.includes(pt); }) || pinText.includes(tag);
              });
            });
          } else if (sub === 'triplets') {
            var tripStr = String(item.triplet || item.label || item.display || '').toLowerCase();
            var tripTags = tripStr.split(/[+,/]/).map(function(s) { return s.trim(); }).filter(Boolean);
            matched = allPins.filter(function(p) {
              var pinTags = (p.visual_annotations || p.annotations || []).map(function(t) {
                return (typeof t === 'string' ? t : (t.norm || t.display || t.tag || '')).toLowerCase();
              });
              var pinText = ((p.title || '') + ' ' + (p.keyword_text || '')).toLowerCase();
              return tripTags.every(function(tag) {
                return pinTags.some(function(pt) { return pt.includes(tag) || tag.includes(pt); }) || pinText.includes(tag);
              });
            });
          } else if (sub === 'single') {
            var targetTag = String(item.norm || item.label || item.display || item.tag || '').toLowerCase();
            matched = allPins.filter(function(p) {
              var pinTags = (p.visual_annotations || p.annotations || []).map(function(t) {
                return (typeof t === 'string' ? t : (t.norm || t.display || t.tag || '')).toLowerCase();
              });
              var pinText = ((p.title || '') + ' ' + (p.keyword_text || '')).toLowerCase();
              return pinTags.some(function(pt) { return pt.includes(targetTag) || targetTag.includes(pt); }) || pinText.includes(targetTag);
            });
          } else if (sub === 'capsules') {
            var capTerm = String(item.term || item.display_label || '').toLowerCase();
            matched = allPins.filter(function(p) {
              var pinTags = (p.visual_annotations || p.annotations || []).map(function(t) {
                return (typeof t === 'string' ? t : (t.norm || t.display || t.tag || '')).toLowerCase();
              });
              var pinText = ((p.title || '') + ' ' + (p.keyword_text || '')).toLowerCase();
              return pinTags.some(function(pt) { return pt.includes(capTerm); }) || pinText.includes(capTerm);
            });
          } else if (sub === 'colors') {
            var targetColor = String(item.color || item.dominant_color || '').toLowerCase();
            matched = allPins.filter(function(p) {
              return Boolean(p.image_url) && (p.dominant_color || '').toLowerCase() === targetColor;
            });
          } else if (sub === 'domains') {
            var targetDomain = String(item.domain || item.label || '').toLowerCase();
            matched = allPins.filter(function(p) {
              return Boolean(p.image_url) && (p.domain || '').toLowerCase() === targetDomain;
            });
          }

          // Sort matched pins by 24h momentum descending
          matched.sort(function(a, b) {
            var gainA = Math.max(Number(a.daily_save_velocity) || 0, Number(a.delta_saves_24h) || 0, Number(a.delta_repins_24h) || 0);
            var gainB = Math.max(Number(b.daily_save_velocity) || 0, Number(b.delta_saves_24h) || 0, Number(b.delta_repins_24h) || 0);
            return gainB - gainA;
          });

          return matched.slice(0, 12);
        },

        getFilteredCreators: function() {
          var list = this.creator_breakouts || [];
          // Filter for positive growth only
          list = list.filter(function(c) {
            return (Number(c.effective_delta_reach_24h) > 0 ||
                    Number(c.effective_delta_views_24h) > 0 ||
                    Number(c.delta_reach_24h) > 0 ||
                    Number(c.delta_views_24h) > 0 ||
                    Number(c.max_pin_velocity) > 0);
          });

          if (this.creatorSubFilter === 'david') {
            list = list.filter(function(c) {
              return Boolean(c.is_david_breakout || c.is_david_account || (Number(c.total_pins || 0) <= 250 && Number(c.monthly_reach || 0) <= 500000 && (Number(c.effective_delta_reach_24h || 0) > 0 || Number(c.delta_reach_24h || 0) > 0)));
            });
          }

          var q = (this.searchQuery || '').trim().toLowerCase();
          if (q) {
            list = list.filter(function(c) {
              return (c.username || '').toLowerCase().includes(q) ||
                     (c.display_name || '').toLowerCase().includes(q);
            });
          }

          return list;
        },

        getDomainlessViralPins: function() {
          var list = [];
          var seen = new Set();
          var candidates = (this.hidden_gems_telemetry.domainless_viral_pins || [])
            .concat(this.hidden_gems_telemetry.vacuum_hijack_pins || [])
            .concat(this.breakout_pins.top_breakouts || []);
          for (var i = 0; i < candidates.length; i++) {
            var p = candidates[i];
            if (p && p.pin_id && !seen.has(p.pin_id)) {
              seen.add(p.pin_id);
              var isDomainless = Boolean(p.is_domainless_viral || (!p.domain || p.domain === 'Uploaded by user' || p.domain.includes('pinterest.') || !p.destination_url));
              if (isDomainless) {
                list.push(p);
              }
            }
          }

          var q = (this.searchQuery || '').trim().toLowerCase();
          if (q) {
            list = list.filter(function(p) {
              return (p.title || '').toLowerCase().includes(q) || (p.creator_username || '').toLowerCase().includes(q);
            });
          }

          list.sort(function(a, b) {
            var gainA = Number(a.effective_24h_gain || a.daily_save_velocity || a.delta_saves_24h || 0);
            var gainB = Number(b.effective_24h_gain || b.daily_save_velocity || b.delta_saves_24h || 0);
            if (gainB !== gainA) return gainB - gainA;
            return (Number(b.save_count) || 0) - (Number(a.save_count) || 0);
          });

          return list.slice(0, 50);
        },

        getKeywordVacuums: function() {
          var list = this.keyword_vacuums_and_bridges.keyword_vacuum_opportunities || [];
          var q = (this.searchQuery || '').trim().toLowerCase();
          if (q) {
            list = list.filter(function(v) {
              return (v.keyword_text || v.keyword || '').toLowerCase().includes(q);
            });
          }
          return list.slice(0, 50);
        },

        // Backward compatibility helpers
        getFilteredBreakouts: function() {
          return this.getFilteredRadarPins();
        },

        getFilteredAnnotations: function() {
          return this.getMatrixEntities();
        },

        getFilteredCapsules: function() {
          var list = this.guided_capsule_crossovers || [];
          var q = (this.searchQuery || '').trim().toLowerCase();
          if (!q) return list;
          return list.filter(function(c) {
            return (c.display_label || '').toLowerCase().includes(q) ||
                   (c.term || '').toLowerCase().includes(q) ||
                   (c.keyword_text || '').toLowerCase().includes(q);
          });
        },

        openBlueprintModal: function(pin) {
          if (!pin) return;
          this.activeBlueprintPin = Object.assign({}, pin);
          this.blueprintCopied = false;
          this.promptCopied = false;
          this.isBlueprintModalOpen = true;
          this.isDossierHydrating = true;

          var self = this;
          var targetPinId = pin.pin_id;

          // Non-blocking live /api/pins/:id hydration
          fetch('/api/pins/' + encodeURIComponent(targetPinId), {
            headers: { 'Accept': 'application/json' },
            signal: (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) ? AbortSignal.timeout(8000) : undefined
          })
          .then(function(res) { return res.ok ? res.json() : null; })
          .then(function(data) {
            if (data && self.activeBlueprintPin && self.activeBlueprintPin.pin_id === targetPinId) {
              var c = data.creative || data.pin || data;
              var creatorCtx = data.pillar_1_creator_context || {};
              var kwCtx = data.pillar_2_keywords_context || {};
              var algoCtx = data.algorithmic_intelligence || {};

              var desc = c.description || algoCtx.seo_description || '';
              if (desc && !self.activeBlueprintPin.description) {
                self.activeBlueprintPin.description = desc;
              }
              var alt = c.alt_text || '';
              if (alt && !self.activeBlueprintPin.alt_text) {
                self.activeBlueprintPin.alt_text = alt;
              }
              var board = creatorCtx.board_name || c.board_name || '';
              if (board && (!self.activeBlueprintPin.board_name || self.activeBlueprintPin.board_name === 'General Inspiration')) {
                self.activeBlueprintPin.board_name = board;
              }
              var annotations = (c.visual_annotations && c.visual_annotations.length)
                ? c.visual_annotations
                : (c.annotations && c.annotations.length ? c.annotations : null);
              if (annotations && (!self.activeBlueprintPin.visual_annotations || !self.activeBlueprintPin.visual_annotations.length)) {
                self.activeBlueprintPin.visual_annotations = annotations;
                self.activeBlueprintPin.annotations = annotations;
              }
              if (c.title && (!self.activeBlueprintPin.title || self.activeBlueprintPin.title === 'Untitled Pin')) {
                self.activeBlueprintPin.title = c.title;
              }
              if (c.image_url && !self.activeBlueprintPin.image_url) {
                self.activeBlueprintPin.image_url = c.image_url;
              }
              if (c.destination_url && !self.activeBlueprintPin.destination_url) {
                self.activeBlueprintPin.destination_url = c.destination_url;
              }
              if (c.domain && (!self.activeBlueprintPin.domain || self.activeBlueprintPin.domain === 'pinterest.com')) {
                self.activeBlueprintPin.domain = c.domain;
              }
              if (Array.isArray(kwCtx.ranking_keywords) && kwCtx.ranking_keywords.length > 0) {
                if (!self.activeBlueprintPin.keywords || self.activeBlueprintPin.keywords.length <= 1) {
                  self.activeBlueprintPin.keywords = kwCtx.ranking_keywords.map(function(rk) {
                    return {
                      keyword_id: rk.keyword_id,
                      keyword: rk.keyword,
                      keyword_text: rk.keyword,
                      rank: rk.rank || rk.rank_position || rk.last_known_rank || 1,
                      folder_name: rk.folder_name || 'Global'
                    };
                  });
                }
              }
            }
          })
          .catch(function(err) {
            console.warn('[Pulse UI] Non-blocking dossier hydration skipped:', err);
          })
          .finally(function() {
            if (self.activeBlueprintPin && self.activeBlueprintPin.pin_id === targetPinId) {
              self.isDossierHydrating = false;
              self.$nextTick(function() {
                if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
              });
            }
          });

          this.$nextTick(function() {
            if (typeof lucide !== 'undefined' && lucide.createIcons) {
              lucide.createIcons();
            }
          });
        },

        closeBlueprintModal: function() {
          this.isBlueprintModalOpen = false;
          this.activeBlueprintPin = null;
          this.isDossierHydrating = false;
        },

        copyText: async function(text, label) {
          if (!text) return;
          try {
            if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
              await navigator.clipboard.writeText(text);
              this.showToast((label || 'Text') + ' copied to clipboard!', 'success');
            } else {
              this.showToast('Clipboard access not available', 'warning');
            }
          } catch (e) {
            this.showToast('Failed to copy to clipboard', 'error');
          }
        },

        copyAiPrompt: async function(p) {
          var prompt = this.generateAiPrompt(p);
          if (!prompt) return;
          try {
            if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
              await navigator.clipboard.writeText(prompt);
              this.promptCopied = true;
              this.showToast('AI Visual Generation Prompt copied!', 'success');
            } else {
              this.showToast('Clipboard access not available', 'warning');
            }
          } catch (e) {
            this.showToast('Failed to copy prompt', 'error');
          }
        },

        copyBlueprintMarkdown: async function() {
          var p = this.activeBlueprintPin;
          if (!p) return;

          var tags = (p.visual_annotations || p.annotations || []);
          var tagLines = tags.length
            ? tags.map(function(a) { return '- ' + (a.display || a.norm || a); }).join('\\n')
            : '- Standard extraction';

          var md = [
            '# ⚡ PAE SCIENTIFIC PIN BLUEPRINT: ' + (p.title || 'Untitled'),
            '**Pin ID:** ' + (p.pin_id || 'N/A'),
            '**Target Board:** ' + (p.board_name || 'General Inspiration'),
            '**Dominant Color:** ' + (p.dominant_color || '#888888'),
            '**Arbitrage Domain:** ' + (p.domain || 'N/A'),
            '**Destination URL:** ' + (p.destination_url || 'N/A'),
            '**Pin Age:** ' + (p.pin_age_days != null ? p.pin_age_days + 'd' : 'N/A'),
            '**Daily Save Velocity:** ' + (p.daily_save_velocity || 0),
            '**24h Repins Delta:** ' + (p.delta_repins_24h || 0),
            '',
            '---',
            '',
            '## 1. PinText Semantic Architecture',
            '- **Title Formula:** ' + (p.title || 'Untitled'),
            '- **Creation Method:** ' + (p.creation_method || 'pinterest_platform'),
            '- **Dominant Color Centroid:** ' + (p.dominant_color || '#888888'),
            '',
            '---',
            '',
            '## 2. Visual Annotations (Co-Occurrence Tags)',
            tagLines,
            '',
            '---',
            '',
            '## 3. 5-Source Search Relevance Integrity',
            '- **Source 1 (Title):** ' + (p.title ? '100% Present' : 'Missing'),
            '- **Source 2 (Description):** ' + (p.description ? 'Enriched from live Shard' : 'Compacted on Hub · Available via Edge D1'),
            '- **Source 3 (Visual Annotations):** ' + (tags.length ? tags.length + ' Tags Detected' : 'Standard Crawl Extraction'),
            '- **Source 4 (Board Placement):** ' + (p.board_name || 'Curated Board'),
            '- **Source 5 (Destination URL):** ' + (p.destination_url ? 'Outbound Verified' : 'Uploaded (Vacuum Target)'),
            '',
            '---',
            '',
            '## 4. AI Visual Generation Prompt (Midjourney / Ideogram)',
            String.fromCharCode(96, 96, 96),
            this.generateAiPrompt(p),
            String.fromCharCode(96, 96, 96),
            '',
            '*Generated by Pin Arbitrage Engine (PAE) 24h Algorithmic Pulse Studio*'
          ].join('\\n');

          try {
            if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
              await navigator.clipboard.writeText(md);
              this.blueprintCopied = true;
              this.showToast('Scientific Pin Blueprint copied to clipboard!', 'success');
            } else {
              this.showToast('Clipboard access not available', 'warning');
            }
          } catch (e) {
            this.showToast('Failed to copy to clipboard', 'error');
          }
        },

        generateAiPrompt: function(p) {
          if (!p) return '';
          var title = p.title || 'Pinterest viral aesthetic';
          var tags = (p.visual_annotations || p.annotations || []).map(function(t) { return t.display || t.norm || t; }).slice(0, 5).join(', ');
          var color = p.dominant_color || '#E11D48';
          var board = p.board_name || 'Lifestyle Inspiration';
          return '/imagine prompt: High-converting editorial Pinterest pin photography for "' + title + '", featuring ' + (tags || title) + ', cinematic lighting, authentic styling, curated for "' + board + '", color harmony inspired by hex ' + color + ', ultra-detailed, professional food and lifestyle photography, clean composition, high depth of field --ar 2:3 --v 6.0 --style raw';
        },

        generateRecommendedAltText: function(p) {
          if (!p) return '';
          var title = p.title || 'Pinterest pin';
          var tags = (p.visual_annotations || p.annotations || []).map(function(t) { return t.display || t.norm || t; }).slice(0, 3).join(' and ');
          var board = p.board_name ? ' on ' + p.board_name : '';
          return 'Close-up editorial photo of ' + title + (tags ? ', highlighting ' + tags : '') + board + ' - Pinterest viral trending idea';
        },

        formatNumber: function(val) {
          var num = Number(val || 0);
          if (!isFinite(num)) return '0';
          return num.toLocaleString();
        },

        formatVelocity: function(vel) {
          var num = Number(vel || 0);
          if (!isFinite(num) || num <= 0) return '0.0/d';
          return num.toFixed(1) + '/d';
        },

        // Rule 31 Universal Strict Time Formatting Rule
        formatAge: function(days) {
          var num = Number(days || 0);
          if (!isFinite(num) || num < 0) return '0d';
          if (num >= 365) {
            return (num / 365.25).toFixed(1) + 'y';
          }
          return Math.round(num) + 'd';
        }
      };
    }
  <\/script>
</body>
</html>`;
}
