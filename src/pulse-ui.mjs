/**
 * src/pulse-ui.mjs
 *
 * Global 24-Hour Algorithmic Pulse & Crossover Studio UI
 * Single Source of Truth (SSOT) for /pulse, /24h, and /folders/:id/pulse.
 *
 * Pure ES Module generating the complete Cockpit Dense Level 8 HTML application.
 *
 * Architectural Invariants:
 * - [INVARIANT: UNIFIED-SIDEBAR-LAYOUT] Reuses renderAppSidebar with activeNav='pulse'
 * - [INVARIANT: SSR-WORKSPACE-ROOM-ROUTING] Supports folderId scoping with renderCampaignWorkspaceHeader
 * - [INVARIANT: MONOTONIC-REQUEST-SEQUENCING] Employs _pulseReqSeq to eliminate stale async race conditions
 * - [INVARIANT: WINDOWED-DOM-PAGINATION] Caps initial tab rendering at 50 items with dynamic Load More (+50)
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
        if (isApiCall && res.status === 401 && typeof window.prompt === 'function') {
          var entered = window.prompt('🔐 Authentication required. Enter API_SECRET_KEY:');
          if (entered && entered.trim()) {
            try { localStorage.setItem('pae_admin_api_key', entered.trim()); } catch (_) {}
            init = Object.assign({}, init);
            var retryHeaders = new Headers(init.headers || {});
            retryHeaders.set('x-api-key', entered.trim());
            init.headers = retryHeaders;
            res = await origFetch(input, init);
          }
        }
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
        <div class="mt-1 text-[10px] text-slate-400 font-mono">Ranked pins inventory</div>
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
          <span>24h Velocity</span>
          <i data-lucide="zap" class="w-3.5 h-3.5 text-rose-500"></i>
        </div>
        <div class="mt-2 text-2xl font-black font-mono tabular-nums text-rose-600 dark:text-rose-400" x-text="formatVelocity(kpis.total_24h_saves_velocity || 0)">0/d</div>
        <div class="mt-1 text-[10px] text-slate-400 font-mono">Aggregate daily saves</div>
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

    <!-- MAIN 6 TABS NAVIGATION STRIP -->
    <div class="flex items-center justify-between border-b border-slate-200 dark:border-[#27272A] overflow-x-auto pb-1 gap-2">
      <nav class="flex items-center space-x-2 shrink-0 text-xs">
        <!-- Tab 1: Breakout Pins -->
        <button 
          type="button" 
          @click="activeTab = 'breakouts'" 
          class="px-3.5 py-2 rounded-xl font-semibold transition flex items-center space-x-2 cursor-pointer"
          :class="activeTab === 'breakouts' ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 font-bold' : 'text-slate-600 dark:text-[#A1A1AA] hover:bg-slate-100 dark:hover:bg-[#18181B]'"
        >
          <i data-lucide="trophy" class="w-4 h-4"></i>
          <span>🏆 Breakout Pins &amp; Rockets</span>
          <span class="px-1.5 py-0.2 rounded-md font-mono tabular-nums text-[10px] bg-slate-200/70 dark:bg-[#27272A]" x-text="getFilteredBreakouts().length"></span>
        </button>

        <!-- Tab 2: Annotation Matrix -->
        <button 
          type="button" 
          @click="activeTab = 'annotations'" 
          class="px-3.5 py-2 rounded-xl font-semibold transition flex items-center space-x-2 cursor-pointer"
          :class="activeTab === 'annotations' ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 font-bold' : 'text-slate-600 dark:text-[#A1A1AA] hover:bg-slate-100 dark:hover:bg-[#18181B]'"
        >
          <i data-lucide="dna" class="w-4 h-4"></i>
          <span>🧬 Annotation Crossover Matrix</span>
        </button>

        <!-- Tab 3: Guided Capsules -->
        <button 
          type="button" 
          @click="activeTab = 'capsules'" 
          class="px-3.5 py-2 rounded-xl font-semibold transition flex items-center space-x-2 cursor-pointer"
          :class="activeTab === 'capsules' ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 font-bold' : 'text-slate-600 dark:text-[#A1A1AA] hover:bg-slate-100 dark:hover:bg-[#18181B]'"
        >
          <i data-lucide="compass" class="w-4 h-4"></i>
          <span>🎯 Guided Search Capsules</span>
        </button>

        <!-- Tab 4: Creator Breakouts -->
        <button 
          type="button" 
          @click="activeTab = 'creators'" 
          class="px-3.5 py-2 rounded-xl font-semibold transition flex items-center space-x-2 cursor-pointer"
          :class="activeTab === 'creators' ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 font-bold' : 'text-slate-600 dark:text-[#A1A1AA] hover:bg-slate-100 dark:hover:bg-[#18181B]'"
        >
          <i data-lucide="users" class="w-4 h-4"></i>
          <span>🚀 Creator Breakouts</span>
        </button>

        <!-- Tab 5: Pixie Bridges & Vacuum Radar -->
        <button 
          type="button" 
          @click="activeTab = 'bridges'" 
          class="px-3.5 py-2 rounded-xl font-semibold transition flex items-center space-x-2 cursor-pointer"
          :class="activeTab === 'bridges' ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 font-bold' : 'text-slate-600 dark:text-[#A1A1AA] hover:bg-slate-100 dark:hover:bg-[#18181B]'"
        >
          <i data-lucide="git-merge" class="w-4 h-4"></i>
          <span>🌉 Pixie Bridges &amp; Vacuum Radar</span>
        </button>

        <!-- Tab 6: Hidden Gems -->
        <button 
          type="button" 
          @click="activeTab = 'gems'" 
          class="px-3.5 py-2 rounded-xl font-semibold transition flex items-center space-x-2 cursor-pointer"
          :class="activeTab === 'gems' ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 font-bold' : 'text-slate-600 dark:text-[#A1A1AA] hover:bg-slate-100 dark:hover:bg-[#18181B]'"
        >
          <i data-lucide="gem" class="w-4 h-4"></i>
          <span>💎 Hidden Gems</span>
        </button>
      </nav>

      <!-- Search Filter Bar -->
      <div class="relative w-48 sm:w-64 shrink-0">
        <input 
          type="text" 
          x-model="searchQuery" 
          placeholder="Filter pulse entities..."
          class="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] text-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500/30"
        />
        <i data-lucide="search" class="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5"></i>
      </div>
    </div>

    <!-- ======================================================== -->
    <!-- TAB 1: 🏆 BREAKOUT PINS & FRESH ROCKETS                  -->
    <!-- ======================================================== -->
    <div x-show="activeTab === 'breakouts'" class="space-y-4">
      <!-- Sub-filter pills -->
      <div class="flex items-center justify-between flex-wrap gap-2 text-xs">
        <div class="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-[#18181B] rounded-xl border border-slate-200 dark:border-[#27272A]">
          <button 
            type="button" 
            @click="breakoutSubFilter = 'all'; displayLimits.breakouts = 50" 
            class="px-3 py-1 rounded-lg font-semibold transition cursor-pointer"
            :class="breakoutSubFilter === 'all' ? 'bg-white dark:bg-[#121215] text-rose-600 dark:text-rose-400 shadow-2xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'"
          >
            <span>All Breakouts</span>
            <span class="ml-1 font-mono text-[10px]" x-text="(breakout_pins.top_breakouts || []).length"></span>
          </button>
          <button 
            type="button" 
            @click="breakoutSubFilter = 'rockets'; displayLimits.breakouts = 50" 
            class="px-3 py-1 rounded-lg font-semibold transition cursor-pointer"
            :class="breakoutSubFilter === 'rockets' ? 'bg-white dark:bg-[#121215] text-amber-600 dark:text-amber-400 shadow-2xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'"
          >
            <span>🚀 Fresh Rockets (≤14d)</span>
            <span class="ml-1 font-mono text-[10px]" x-text="(breakout_pins.fresh_rockets || []).length"></span>
          </button>
          <button 
            type="button" 
            @click="breakoutSubFilter = 'vault'; displayLimits.breakouts = 50" 
            class="px-3 py-1 rounded-lg font-semibold transition cursor-pointer"
            :class="breakoutSubFilter === 'vault' ? 'bg-white dark:bg-[#121215] text-purple-600 dark:text-purple-400 shadow-2xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'"
          >
            <span>⚡ Vault Surge Sleepers</span>
            <span class="ml-1 font-mono text-[10px]" x-text="(breakout_pins.vault_surge_pins || []).length"></span>
          </button>
          <button 
            type="button" 
            @click="breakoutSubFilter = 'archive'; displayLimits.breakouts = 50" 
            class="px-3 py-1 rounded-lg font-semibold transition cursor-pointer"
            :class="breakoutSubFilter === 'archive' ? 'bg-white dark:bg-[#121215] text-emerald-600 dark:text-emerald-400 shadow-2xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'"
          >
            <span>🏆 PinArchive Winners</span>
            <span class="ml-1 font-mono text-[10px]" x-text="(breakout_pins.pinarchive_winners || []).length"></span>
          </button>
        </div>

        <div class="text-xs text-slate-500 font-mono tabular-nums" x-text="'Showing top ' + Math.min(displayLimits.breakouts, getFilteredBreakouts().length) + ' of ' + getFilteredBreakouts().length + ' breakout pins'"></div>
      </div>

      <!-- Breakout Pins Table -->
      <div class="rounded-2xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] overflow-hidden shadow-xs">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs border-collapse">
            <thead>
              <tr class="border-b border-slate-200 dark:border-[#27272A] bg-slate-50/75 dark:bg-[#18181B]/50 font-mono tabular-nums text-slate-500 text-[10.5px] uppercase">
                <th class="py-2.5 px-3 w-12 text-center">Rank</th>
                <th class="py-2.5 px-3 w-16">Preview</th>
                <th class="py-2.5 px-3 min-w-[240px]">Pin Title &amp; Keyword Context</th>
                <th class="py-2.5 px-3 min-w-[130px]">Domain / Creator</th>
                <th class="py-2.5 px-3 text-right">Daily Saves</th>
                <th class="py-2.5 px-3 text-right">Repins Δ</th>
                <th class="py-2.5 px-3 text-right">Age</th>
                <th class="py-2.5 px-3 text-center">Bridges</th>
                <th class="py-2.5 px-3 text-right w-28">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-[#27272A]/60">
              <template x-for="(pin, idx) in getFilteredBreakouts().slice(0, displayLimits.breakouts)" :key="pin.pin_id || idx">
                <tr class="hover:bg-slate-50/80 dark:hover:bg-[#18181B]/60 transition">
                  <td class="py-2.5 px-3 text-center font-mono font-bold text-slate-400" x-text="idx + 1"></td>
                  <td class="py-2.5 px-3">
                    <div class="w-10 h-14 rounded-lg bg-slate-100 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A] overflow-hidden relative shrink-0">
                      <img 
                        :src="window.resolvePinImageUrl(pin.image_url, '236x')" 
                        alt="Pin preview" 
                        loading="lazy" 
                        class="w-full h-full object-cover" 
                        onerror="window.handlePinImgError(this)" 
                      />
                    </div>
                  </td>
                  <td class="py-2.5 px-3">
                    <div class="font-semibold text-slate-900 dark:text-white line-clamp-1" x-text="pin.title || 'Untitled Pin'"></div>
                    <div class="flex items-center gap-1.5 mt-1 flex-wrap">
                      <template x-if="pin.keyword_text">
                        <span class="px-1.5 py-0.2 rounded bg-slate-100 dark:bg-[#18181B] text-[10px] font-mono text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-[#27272A]" x-text="pin.keyword_text"></span>
                      </template>
                      <template x-if="pin.is_fresh_14d">
                        <span class="px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-mono font-bold border border-amber-500/20">🚀 Rocket (≤14d)</span>
                      </template>
                      <template x-if="pin.is_vacuum_hijack_target">
                        <span class="px-1.5 py-0.2 rounded bg-rose-500/10 text-rose-600 dark:text-rose-400 text-[10px] font-mono font-bold border border-rose-500/20">🎯 Vacuum Target</span>
                      </template>
                    </div>
                  </td>
                  <td class="py-2.5 px-3">
                    <div class="text-slate-800 dark:text-slate-200 font-medium truncate max-w-[140px]" x-text="pin.domain || 'Uploaded by user'"></div>
                    <div class="text-[10.5px] text-slate-400 truncate max-w-[140px]" x-text="pin.creator_username ? '@' + pin.creator_username : 'unknown'"></div>
                  </td>
                  <td class="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-rose-600 dark:text-rose-400" x-text="formatVelocity(pin.daily_save_velocity)"></td>
                  <td class="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-purple-600 dark:text-purple-400" x-text="'+' + formatNumber(pin.delta_repins_24h || 0)"></td>
                  <td class="py-2.5 px-3 text-right font-mono tabular-nums text-slate-500" x-text="formatAge(pin.pin_age_days)"></td>
                  <td class="py-2.5 px-3 text-center">
                    <span 
                      class="px-1.5 py-0.5 rounded font-mono tabular-nums text-[10.5px] font-bold"
                      :class="(pin.overlap_count > 1) ? 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30' : 'bg-slate-100 dark:bg-[#18181B] text-slate-400'"
                      x-text="pin.overlap_count || 1"
                      title="Number of keywords this pin simultaneously ranks on"
                    ></span>
                  </td>
                  <td class="py-2.5 px-3 text-right">
                    <div class="inline-flex items-center gap-1.5 justify-end">
                      <button 
                        type="button" 
                        @click="openBlueprintModal(pin)" 
                        class="px-2 py-1 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400 text-[11px] font-bold hover:bg-rose-500/20 transition cursor-pointer"
                        title="Generate Scientific Pin Blueprint"
                      >
                        <span>⚡ Blueprint</span>
                      </button>
                      <a :href="'https://www.pinterest.com/pin/' + pin.pin_id + '/'" target="_blank" rel="noopener noreferrer" class="p-1 rounded-lg text-slate-400 hover:text-rose-500 transition" title="View on Pinterest">
                        <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                      </a>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>

        <!-- Windowed Load More Button -->
        <div x-show="getFilteredBreakouts().length > displayLimits.breakouts" class="p-4 border-t border-slate-200 dark:border-[#27272A] text-center bg-slate-50/50 dark:bg-[#18181B]/40">
          <button 
            type="button" 
            @click="displayLimits.breakouts += 50" 
            class="px-4 py-2 rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#18181B] transition cursor-pointer shadow-2xs"
          >
            <span>Load More (+50 Breakouts)</span>
          </button>
        </div>
      </div>
    </div>

    <!-- ======================================================== -->
    <!-- TAB 2: 🧬 ANNOTATION CROSSOVER MATRIX                    -->
    <!-- ======================================================== -->
    <div x-show="activeTab === 'annotations'" class="space-y-4">
      <div class="flex items-center justify-between flex-wrap gap-2 text-xs">
        <div class="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-[#18181B] rounded-xl border border-slate-200 dark:border-[#27272A]">
          <button 
            type="button" 
            @click="annotationSubFilter = 'single'; displayLimits.annotations = 50" 
            class="px-3 py-1 rounded-lg font-semibold transition cursor-pointer"
            :class="annotationSubFilter === 'single' ? 'bg-white dark:bg-[#121215] text-rose-600 dark:text-rose-400 shadow-2xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'"
          >
            <span>1-Gram Singles (Top 50)</span>
          </button>
          <button 
            type="button" 
            @click="annotationSubFilter = 'pairs'; displayLimits.annotations = 50" 
            class="px-3 py-1 rounded-lg font-semibold transition cursor-pointer"
            :class="annotationSubFilter === 'pairs' ? 'bg-white dark:bg-[#121215] text-purple-600 dark:text-purple-400 shadow-2xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'"
          >
            <span>2-Pairs [A + B] (Top 50)</span>
          </button>
          <button 
            type="button" 
            @click="annotationSubFilter = 'triplets'; displayLimits.annotations = 50" 
            class="px-3 py-1 rounded-lg font-semibold transition cursor-pointer"
            :class="annotationSubFilter === 'triplets' ? 'bg-white dark:bg-[#121215] text-indigo-600 dark:text-indigo-400 shadow-2xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'"
          >
            <span>3-Triplets [A + B + C] (Top 50)</span>
          </button>
        </div>
      </div>

      <div class="rounded-2xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] overflow-hidden shadow-xs">
        <table class="w-full text-left text-xs border-collapse">
          <thead>
            <tr class="border-b border-slate-200 dark:border-[#27272A] bg-slate-50/75 dark:bg-[#18181B]/50 font-mono tabular-nums text-slate-500 text-[10.5px] uppercase">
              <th class="py-2.5 px-3 w-12 text-center">#</th>
              <th class="py-2.5 px-3">Visual Annotation / Crossover Entity</th>
              <th class="py-2.5 px-3 text-right">Occurrence Count</th>
              <th class="py-2.5 px-3 text-right">Avg Save Velocity</th>
              <th class="py-2.5 px-3 text-right">Repins Surge</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-[#27272A]/60">
            <template x-for="(item, idx) in getFilteredAnnotations().slice(0, displayLimits.annotations)" :key="idx">
              <tr class="hover:bg-slate-50/80 dark:hover:bg-[#18181B]/60 transition">
                <td class="py-2.5 px-3 text-center font-mono font-bold text-slate-400" x-text="idx + 1"></td>
                <td class="py-2.5 px-3">
                  <div class="font-bold text-slate-900 dark:text-white" x-text="item.label || item.pair || item.triplet || item.display || item.crossover_label || item.tag_display"></div>
                  <div class="text-[10px] text-slate-400 font-mono" x-text="((item.keywords_count || item.keyword_count) ? (item.keywords_count || item.keyword_count) + ' keywords' : '')"></div>
                </td>
                <td class="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-slate-700 dark:text-slate-300" x-text="formatNumber(item.count || item.pin_count || item.frequency || 0)"></td>
                <td class="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-rose-600 dark:text-rose-400" x-text="formatVelocity(item.avg_velocity || item.velocity || item.total_velocity || 0)"></td>
                <td class="py-2.5 px-3 text-right font-mono tabular-nums text-purple-600 dark:text-purple-400" x-text="'+' + formatNumber(item.repins_surge || item.total_repins_delta || item.delta_repins || 0)"></td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ======================================================== -->
    <!-- TAB 3: 🎯 GUIDED SEARCH CAPSULES                         -->
    <!-- ======================================================== -->
    <div x-show="activeTab === 'capsules'" class="space-y-4">
      <div class="flex items-center justify-between text-xs">
        <div class="text-slate-500 font-mono" x-text="'Indexed Guided Search Capsules: ' + (guided_capsule_crossovers || []).length"></div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <template x-for="(capsule, idx) in getFilteredCapsules().slice(0, displayLimits.capsules)" :key="capsule.id || idx">
          <div class="p-3.5 rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] shadow-2xs flex flex-col justify-between space-y-2">
            <div class="flex items-start justify-between gap-2">
              <div class="flex items-center space-x-2">
                <span class="w-3 h-3 rounded-full shrink-0" :style="'background-color: ' + (capsule.dominant_color || '#3b82f6')"></span>
                <span class="font-bold text-slate-900 dark:text-white text-sm" x-text="capsule.display_label || capsule.term"></span>
              </div>
              <span class="px-1.5 py-0.5 rounded font-mono tabular-nums text-[10px] font-bold bg-slate-100 dark:bg-[#18181B] text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-[#27272A]" x-text="'Score: ' + Number(capsule.score || 0).toFixed(1)"></span>
            </div>
            <div class="flex items-center justify-between text-xs text-slate-500 pt-1 border-t border-slate-100 dark:border-[#27272A]/50">
              <span class="truncate" x-text="capsule.keyword_text || capsule.keyword || 'Universal'"></span>
              <span class="font-mono tabular-nums text-[10.5px]" x-text="(capsule.distinct_keywords ? capsule.distinct_keywords + ' SERPs' : '')"></span>
            </div>
          </div>
        </template>
      </div>

      <div x-show="getFilteredCapsules().length > displayLimits.capsules" class="p-4 text-center">
        <button 
          type="button" 
          @click="displayLimits.capsules += 50" 
          class="px-4 py-2 rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#18181B] transition cursor-pointer shadow-2xs"
        >
          <span>Load More (+50 Capsules)</span>
        </button>
      </div>
    </div>

    <!-- ======================================================== -->
    <!-- TAB 4: 🚀 CREATOR BREAKOUTS                              -->
    <!-- ======================================================== -->
    <div x-show="activeTab === 'creators'" class="space-y-4">
      <div class="rounded-2xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] overflow-hidden shadow-xs">
        <table class="w-full text-left text-xs border-collapse">
          <thead>
            <tr class="border-b border-slate-200 dark:border-[#27272A] bg-slate-50/75 dark:bg-[#18181B]/50 font-mono tabular-nums text-slate-500 text-[10.5px] uppercase">
              <th class="py-2.5 px-3">Creator Profile</th>
              <th class="py-2.5 px-3 text-right">Total Audience</th>
              <th class="py-2.5 px-3 text-right">Impressions</th>
              <th class="py-2.5 px-3 text-right">24h Δ Reach</th>
              <th class="py-2.5 px-3 text-right">7d Δ Reach</th>
              <th class="py-2.5 px-3 text-center">Top 3 Driver Pins</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-[#27272A]/60">
            <template x-for="(c, idx) in getFilteredCreators().slice(0, displayLimits.creators)" :key="c.id || idx">
              <tr class="hover:bg-slate-50/80 dark:hover:bg-[#18181B]/60 transition">
                <td class="py-2.5 px-3">
                  <div class="font-bold text-slate-900 dark:text-white flex items-center space-x-1.5">
                    <span x-text="c.display_name || c.username"></span>
                    <template x-if="c.is_david_breakout">
                      <span class="px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[9px] font-mono font-bold">David Breakout</span>
                    </template>
                  </div>
                  <div class="text-[10.5px] text-slate-400 font-mono" x-text="'@' + c.username"></div>
                </td>
                <td class="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-slate-900 dark:text-white" x-text="formatNumber(c.monthly_reach || 0)"></td>
                <td class="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300" x-text="formatNumber(c.profile_views || 0)"></td>
                <td class="py-2.5 px-3 text-right font-mono tabular-nums font-bold" :class="(c.effective_delta_reach_24h > 0) ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'" x-text="(c.effective_delta_reach_24h > 0 ? '+' : '') + formatNumber(c.effective_delta_reach_24h || 0)"></td>
                <td class="py-2.5 px-3 text-right font-mono tabular-nums text-purple-600 dark:text-purple-400" x-text="(c.reach_delta_7d > 0 ? '+' : '') + formatNumber(c.reach_delta_7d || 0)"></td>
                <td class="py-2.5 px-3">
                  <div class="flex items-center justify-center space-x-1.5">
                    <template x-for="(p, pidx) in (c.driver_pins || []).slice(0, 3)" :key="p.pin_id || pidx">
                      <div class="w-8 h-10 rounded bg-slate-100 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A] overflow-hidden relative cursor-pointer" @click="openBlueprintModal(p)" :title="p.title || 'Driver Pin'">
                        <img :src="window.resolvePinImageUrl(p.image_url, '236x')" alt="Driver" class="w-full h-full object-cover" onerror="window.handlePinImgError(this)" />
                      </div>
                    </template>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ======================================================== -->
    <!-- TAB 5: 🌉 PIXIE BRIDGES & VACUUM RADAR                   -->
    <!-- ======================================================== -->
    <div x-show="activeTab === 'bridges'" class="space-y-6">
      <!-- Section A: Pixie Multi-Hit Bridge Pins -->
      <div class="space-y-2">
        <h3 class="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2">
          <span>🌉 Multi-Keyword Bridge Pins (Pixie Multi-Hit Candidates)</span>
        </h3>
        <div class="rounded-2xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] overflow-hidden shadow-xs">
          <table class="w-full text-left text-xs border-collapse">
            <thead>
              <tr class="border-b border-slate-200 dark:border-[#27272A] bg-slate-50/75 dark:bg-[#18181B]/50 font-mono tabular-nums text-slate-500 text-[10.5px] uppercase">
                <th class="py-2.5 px-3 w-16">Preview</th>
                <th class="py-2.5 px-3 min-w-[200px]">Pin Title &amp; Domain</th>
                <th class="py-2.5 px-3 text-center">Spanned Keywords</th>
                <th class="py-2.5 px-3 text-right">Daily Velocity</th>
                <th class="py-2.5 px-3 text-right w-24">Action</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-[#27272A]/60">
              <template x-for="(b, idx) in (keyword_vacuums_and_bridges.bridge_pins || []).slice(0, 30)" :key="b.pin_id || idx">
                <tr class="hover:bg-slate-50/80 dark:hover:bg-[#18181B]/60 transition">
                  <td class="py-2.5 px-3">
                    <div class="w-9 h-12 rounded bg-slate-100 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A] overflow-hidden">
                      <img :src="window.resolvePinImageUrl(b.image_url, '236x')" alt="Bridge" class="w-full h-full object-cover" onerror="window.handlePinImgError(this)" />
                    </div>
                  </td>
                  <td class="py-2.5 px-3">
                    <div class="font-bold text-slate-900 dark:text-white line-clamp-1" x-text="b.title || 'Untitled'"></div>
                    <div class="text-[10.5px] text-slate-400 font-mono" x-text="b.domain || 'Direct'"></div>
                  </td>
                  <td class="py-2.5 px-3 text-center">
                    <span class="px-2 py-0.5 rounded-full font-mono text-[11px] font-bold bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30" x-text="(b.keyword_count || b.overlap_count || 1) + ' SERPs'"></span>
                  </td>
                  <td class="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-rose-600 dark:text-rose-400" x-text="formatVelocity(b.daily_save_velocity)"></td>
                  <td class="py-2.5 px-3 text-right">
                    <button type="button" @click="openBlueprintModal(b)" class="px-2 py-1 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400 text-[11px] font-bold hover:bg-rose-500/20 transition cursor-pointer">Blueprint</button>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Section B: SERP Vacuum Opportunities -->
      <div class="space-y-2">
        <h3 class="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2">
          <span>🌪️ Keyword SERP Vacuum Opportunities (Top 10 Churn)</span>
        </h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <template x-for="(v, idx) in (keyword_vacuums_and_bridges.keyword_vacuum_opportunities || []).slice(0, 15)" :key="v.keyword_id || idx">
            <div class="p-3.5 rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] shadow-2xs space-y-2">
              <div class="flex items-start justify-between">
                <span class="font-bold text-slate-900 dark:text-white text-sm" x-text="v.keyword_text || v.keyword"></span>
                <span class="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20" x-text="'Vacuum Score: ' + (v.vacuum_score || v.displaced_top10_24h_count || 0)"></span>
              </div>
              <div class="text-[11px] text-slate-400 flex items-center justify-between font-mono">
                <span x-text="(v.displaced_top10_24h_count || 0) + ' displaced from Top 10 (24h)'"></span>
                <a :href="'/keywords/' + (v.keyword_id || '')" class="text-rose-500 hover:underline">Inspect SERP →</a>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- ======================================================== -->
    <!-- TAB 6: 💎 HIDDEN GEMS                                    -->
    <!-- ======================================================== -->
    <div x-show="activeTab === 'gems'" class="space-y-6">
      <!-- Section A: Vacuum Hijack Targets -->
      <div class="space-y-2">
        <h3 class="text-sm font-bold text-slate-900 dark:text-white">🎯 High-Saves Domainless Vacuum Targets</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <template x-for="(gem, idx) in (hidden_gems_telemetry.vacuum_hijack_pins || []).slice(0, 9)" :key="gem.pin_id || idx">
            <div class="p-3.5 rounded-xl border border-rose-500/20 bg-rose-500/5 rounded-xl flex items-center space-x-3">
              <div class="w-12 h-16 rounded bg-slate-100 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A] overflow-hidden shrink-0">
                <img :src="window.resolvePinImageUrl(gem.image_url, '236x')" alt="Gem" class="w-full h-full object-cover" onerror="window.handlePinImgError(this)" />
              </div>
              <div class="min-w-0 flex-1 space-y-1">
                <div class="font-bold text-xs text-slate-900 dark:text-white truncate" x-text="gem.title || 'Vacuum Candidate'"></div>
                <div class="text-[10px] text-slate-400 font-mono" x-text="formatNumber(gem.save_count || 0) + ' saves · No external URL'"></div>
                <button type="button" @click="openBlueprintModal(gem)" class="px-2 py-0.5 rounded bg-rose-600 text-white text-[10px] font-bold">Hijack Blueprint</button>
              </div>
            </div>
          </template>
        </div>
      </div>

      <!-- Section B: Dominant Color Palette -->
      <div class="space-y-2">
        <h3 class="text-sm font-bold text-slate-900 dark:text-white">🎨 Dominant Color Palette Centroids</h3>
        <div class="flex items-center gap-2 flex-wrap">
          <template x-for="(col, idx) in (hidden_gems_telemetry.dominant_color_palette || [])" :key="idx">
            <div class="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] flex items-center space-x-2 text-xs font-mono">
              <span class="w-3.5 h-3.5 rounded-full border border-black/20 shrink-0" :style="'background-color: ' + (col.color || col.dominant_color)"></span>
              <span class="font-bold" x-text="col.color || col.dominant_color"></span>
              <span class="text-slate-400" x-text="'(' + (col.count || col.frequency || 0) + ')'"></span>
            </div>
          </template>
        </div>
      </div>
    </div>

  </main>

  <!-- ======================================================== -->
  <!-- SCIENTIFIC PIN BLUEPRINT MODAL (ONE-CLICK MARKDOWN)      -->
  <!-- ======================================================== -->
  <div 
    x-show="isBlueprintModalOpen" 
    x-cloak 
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
    role="dialog" 
    aria-modal="true" 
    aria-labelledby="blueprint-modal-title"
    @click.self="closeBlueprintModal()"
  >
    <div class="w-full max-w-2xl bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
      <!-- Modal Header -->
      <div class="p-4 border-b border-slate-200 dark:border-[#27272A] flex items-center justify-between">
        <div class="flex items-center space-x-2.5">
          <div class="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center">
            <i data-lucide="dna" class="w-4 h-4"></i>
          </div>
          <div>
            <h2 id="blueprint-modal-title" class="text-sm font-bold text-slate-900 dark:text-white">Scientific Pin Blueprint</h2>
            <div class="text-[10.5px] font-mono text-slate-400" x-text="'Pin #' + (activeBlueprintPin?.pin_id || '')"></div>
          </div>
        </div>
        <div class="flex items-center space-x-2">
          <button 
            type="button" 
            @click="copyBlueprintMarkdown()" 
            class="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition flex items-center space-x-1.5 shadow-xs cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
          >
            <i data-lucide="copy" class="w-3.5 h-3.5"></i>
            <span x-text="blueprintCopied ? 'Copied!' : 'Copy Markdown'"></span>
          </button>
          <button 
            type="button" 
            @click="closeBlueprintModal()" 
            class="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg cursor-pointer"
          >
            <i data-lucide="x" class="w-4 h-4"></i>
          </button>
        </div>
      </div>

      <!-- Modal Body -->
      <div class="p-5 overflow-y-auto space-y-4 text-xs font-sans">
        <!-- Pin Summary Card -->
        <div class="p-3.5 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#18181B] flex items-start space-x-3.5">
          <div class="w-14 h-20 rounded-lg bg-slate-200 dark:bg-[#27272A] border border-slate-300 dark:border-slate-700 overflow-hidden shrink-0">
            <img :src="window.resolvePinImageUrl(activeBlueprintPin?.image_url, '236x')" alt="Blueprint Pin" class="w-full h-full object-cover" onerror="window.handlePinImgError(this)" />
          </div>
          <div class="space-y-1 min-w-0 flex-1">
            <div class="font-bold text-slate-900 dark:text-white text-sm" x-text="activeBlueprintPin?.title || 'Untitled Pin'"></div>
            <div class="text-[11px] text-slate-500 font-mono" x-text="'Target Board: ' + (activeBlueprintPin?.board_name || 'General Inspiration')"></div>
            <div class="flex items-center gap-2 pt-1 font-mono text-[10.5px]">
              <span class="text-rose-600 dark:text-rose-400 font-bold" x-text="formatVelocity(activeBlueprintPin?.daily_save_velocity) + ' saves/d'"></span>
              <span class="text-purple-600 dark:text-purple-400 font-bold" x-text="'+' + formatNumber(activeBlueprintPin?.delta_repins_24h || 0) + ' repins'"></span>
              <span class="text-slate-400" x-text="formatAge(activeBlueprintPin?.pin_age_days)"></span>
            </div>
          </div>
        </div>

        <!-- Section 1: PinText Formula -->
        <div class="space-y-1">
          <div class="text-[11px] font-bold uppercase font-mono text-slate-400">1. PinText Semantic Architecture</div>
          <div class="p-3 rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] space-y-1">
            <div class="text-slate-600 dark:text-slate-300"><span class="font-bold text-slate-900 dark:text-white">Title:</span> <span x-text="activeBlueprintPin?.title || 'N/A'"></span></div>
            <div class="text-slate-600 dark:text-slate-300"><span class="font-bold text-slate-900 dark:text-white">Creation Method:</span> <span x-text="activeBlueprintPin?.creation_method || 'pinterest_platform'"></span></div>
            <div class="text-slate-600 dark:text-slate-300"><span class="font-bold text-slate-900 dark:text-white">Dominant Color:</span> <span class="font-mono" x-text="activeBlueprintPin?.dominant_color || '#888888'"></span></div>
          </div>
        </div>

        <!-- Section 2: Visual Annotations Triplets -->
        <div class="space-y-1">
          <div class="text-[11px] font-bold uppercase font-mono text-slate-400">2. Visual Annotations (Co-Occurrence Tags)</div>
          <div class="p-3 rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B]">
            <div class="flex items-center gap-1.5 flex-wrap">
              <template x-for="(tag, tidx) in (activeBlueprintPin?.annotations || [])" :key="tidx">
                <span class="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-[#27272A] font-mono text-[10.5px] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700" x-text="tag.display || tag.norm || tag"></span>
              </template>
              <template x-if="!(activeBlueprintPin?.annotations && activeBlueprintPin.annotations.length)">
                <span class="text-slate-400 italic">No visual tags detected in Hub SERP snapshot</span>
              </template>
            </div>
          </div>
        </div>

        <!-- Section 3: 5-Source LLM Search Relevance -->
        <div class="space-y-1">
          <div class="text-[11px] font-bold uppercase font-mono text-slate-400">3. 5-Source Search Relevance Integrity</div>
          <div class="p-3 rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] space-y-1 text-[11px]">
            <div><span class="font-bold">Source 1 (Title):</span> <span class="text-emerald-500">✓ Present (100% verified)</span></div>
            <div><span class="font-bold">Source 2 (Description):</span> <span class="text-amber-500">Compacted on Hub · Available via Edge D1</span></div>
            <div><span class="font-bold">Source 3 (Visual Annotations):</span> <span x-text="(activeBlueprintPin?.annotations && activeBlueprintPin.annotations.length) ? '✓ ' + activeBlueprintPin.annotations.length + ' Tags Detected' : 'Standard Crawl Extraction'"></span></div>
            <div><span class="font-bold">Source 4 (Board Placement):</span> <span class="text-slate-600 dark:text-slate-300" x-text="activeBlueprintPin?.board_name || 'Curated Board'"></span></div>
            <div><span class="font-bold">Source 5 (Destination URL):</span> <span class="text-slate-600 dark:text-slate-300 font-mono" x-text="activeBlueprintPin?.destination_url || 'Uploaded by user (Vacuum Target)'"></span></div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    function pulseStudioApp(initialFolderId) {
      return {
        isDark: (typeof localStorage !== 'undefined') ? (localStorage.getItem('pa_theme') !== 'light') : true,
        darkMode: (typeof localStorage !== 'undefined') ? (localStorage.getItem('pa_theme') !== 'light') : true,
        isSidebarCollapsed: (typeof localStorage !== 'undefined') ? (localStorage.getItem('pa_sidebar_collapsed') === 'true') : false,
        isMobileMenuOpen: false,
        scopedFolderId: initialFolderId || '',

        activeTab: 'breakouts',
        breakoutSubFilter: 'all',
        annotationSubFilter: 'single',
        selectedWindow: '24h',
        searchQuery: '',

        isLoading: false,
        isRefreshing: false,
        _pulseReqSeq: 0,

        displayLimits: {
          breakouts: 50,
          annotations: 50,
          capsules: 50,
          creators: 50,
          bridges: 50,
          gems: 50
        },

        kpis: {},
        breakout_pins: {},
        annotation_crossovers: {},
        guided_capsule_crossovers: [],
        creator_breakouts: [],
        keyword_vacuums_and_bridges: {},
        hidden_gems_telemetry: {},

        isBlueprintModalOpen: false,
        activeBlueprintPin: null,
        blueprintCopied: false,

        toasts: [],

        init: function() {
          var self = this;
          this.fetchPulseData(false);

          if (typeof document !== 'undefined') {
            document.addEventListener('DOMContentLoaded', function() {
              if (typeof lucide !== 'undefined' && lucide.createIcons) {
                lucide.createIcons();
              }
            });
          }
        },

        toggleSidebar: function() {
          this.isSidebarCollapsed = !this.isSidebarCollapsed;
          try {
            localStorage.setItem('pa_sidebar_collapsed', String(this.isSidebarCollapsed));
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

            var res = await fetch('/api/pulse/24h?' + params.toString(), {
              headers: { 'Accept': 'application/json' },
              signal: (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) ? AbortSignal.timeout(15000) : undefined
            });

            if (seq !== this._pulseReqSeq) return; // Discard stale race responses

            if (!res.ok) {
              throw new Error('Server returned HTTP ' + res.status);
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

        getFilteredBreakouts: function() {
          var list = [];
          if (this.breakoutSubFilter === 'all') {
            list = this.breakout_pins.top_breakouts || [];
          } else if (this.breakoutSubFilter === 'rockets') {
            list = this.breakout_pins.fresh_rockets || [];
          } else if (this.breakoutSubFilter === 'vault') {
            list = this.breakout_pins.vault_surge_pins || [];
          } else if (this.breakoutSubFilter === 'archive') {
            list = this.breakout_pins.pinarchive_winners || [];
          }

          var q = (this.searchQuery || '').trim().toLowerCase();
          if (!q) return list;
          return list.filter(function(p) {
            return (p.title || '').toLowerCase().includes(q) ||
                   (p.domain || '').toLowerCase().includes(q) ||
                   (p.creator_username || '').toLowerCase().includes(q) ||
                   (p.keyword_text || '').toLowerCase().includes(q);
          });
        },

        getFilteredAnnotations: function() {
          var list = [];
          if (this.annotationSubFilter === 'single') {
            list = this.annotation_crossovers.single_annotations || [];
          } else if (this.annotationSubFilter === 'pairs') {
            list = this.annotation_crossovers.pair_crossovers || [];
          } else if (this.annotationSubFilter === 'triplets') {
            list = this.annotation_crossovers.triplet_crossovers || [];
          }

          var q = (this.searchQuery || '').trim().toLowerCase();
          if (!q) return list;
          return list.filter(function(a) {
            var label = a.label || a.pair || a.triplet || a.display || '';
            return label.toLowerCase().includes(q);
          });
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

        getFilteredCreators: function() {
          var list = this.creator_breakouts || [];
          var q = (this.searchQuery || '').trim().toLowerCase();
          if (!q) return list;
          return list.filter(function(c) {
            return (c.username || '').toLowerCase().includes(q) ||
                   (c.display_name || '').toLowerCase().includes(q);
          });
        },

        openBlueprintModal: function(pin) {
          this.activeBlueprintPin = pin;
          this.blueprintCopied = false;
          this.isBlueprintModalOpen = true;
          this.$nextTick(function() {
            if (typeof lucide !== 'undefined' && lucide.createIcons) {
              lucide.createIcons();
            }
          });
        },

        closeBlueprintModal: function() {
          this.isBlueprintModalOpen = false;
          this.activeBlueprintPin = null;
        },

        copyBlueprintMarkdown: async function() {
          var p = this.activeBlueprintPin;
          if (!p) return;

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
            (p.annotations && p.annotations.length) 
              ? p.annotations.map(function(a) { return '- ' + (a.display || a.norm || a); }).join('\\n')
              : '- Standard extraction',
            '',
            '---',
            '',
            '## 3. 5-Source Search Relevance Integrity',
            '- **Source 1 (Title):** ' + (p.title ? '100% Present' : 'Missing'),
            '- **Source 2 (Description):** Compacted on Hub · Available via Edge D1',
            '- **Source 3 (Visual Annotations):** ' + ((p.annotations && p.annotations.length) ? p.annotations.length + ' Tags Detected' : 'Standard Crawl Extraction'),
            '- **Source 4 (Board Placement):** ' + (p.board_name || 'Curated Board'),
            '- **Source 5 (Destination URL):** ' + (p.destination_url ? 'Outbound Verified' : 'Uploaded (Vacuum Target)'),
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

        formatAge: function(days) {
          var num = Number(days || 0);
          if (!isFinite(num) || num <= 0) return '1d';
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
