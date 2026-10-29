/**
 * src/domains-ui.mjs
 *
 * Dedicated Domain Intelligence & SERP Monopoly Studio UI (Level 4B)
 * Pure ES Module generating the full HTML application for /domains.
 *
 * Features:
 * - Top 5 Executive KPI Cards with SERP Monopoly Share & Baby Giants detection.
 * - Strategic Arbitrage Lens Toolbar (Baby Giants, Easy Arbitrage, Bleeding Giants, High Multipliers, Multi-Account).
 * - Multi-Pillar Domain Leaderboard with Live WHOIS Age Badges, Multiplier ratios, and SERP distribution.
 * - Slide-Over Deep Domain Dossier Drawer (4 Tabs: Ranked Pins, Money Articles, Keyword Monopoly Matrix, Associated Creators).
 * - Client-side CSV export protected against CSV formula injection (DDE).
 * - Dark / Light Mode with instant hydration.
 */

import { getEdgeShieldClientScript } from './edge-shield-client.mjs';
import { renderAppSidebar } from './ui/app-sidebar.mjs';
import { renderCampaignWorkspaceHeader } from './ui/campaign-workspace-header.mjs';

export function getDomainsPageHtml(initialDomain = '', folderId = '') {
  const rawDomain = String(initialDomain || '').trim();
  const safeInitialDomain = rawDomain.replace(/[^a-zA-Z0-9.-]/g, '').toLowerCase();
  const hasInitialDomain = Boolean(safeInitialDomain);
  const rawFolderId = String(folderId || '').trim();
  const safeFolderId = rawFolderId.replace(/[^a-zA-Z0-9_-]/g, '');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="referrer" content="same-origin">
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📌</text></svg>">
  <title>Domain Intelligence & SERP Monopoly Studio | Pinterest Arbitrage</title>
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
          }
        }
      }
    };
    const theme = (typeof localStorage !== 'undefined') ? localStorage.getItem('pa_theme') : null;
    if (theme === 'light') {
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.add('dark');
    }
  </script>
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
      if (savedTheme === 'light') {
        document.documentElement.classList.remove('dark');
      } else {
        document.documentElement.classList.add('dark');
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
<body x-cloak class="bg-slate-50 dark:bg-[#09090B] text-slate-900 dark:text-zinc-100 min-h-screen antialiased flex flex-col font-sans transition-colors duration-150" :class="(isDark || darkMode) ? 'dark' : ''" x-data="domainsApp('${safeInitialDomain}'${safeFolderId ? `, '${safeFolderId}'` : ''})" @keydown.escape.window="if (isBlueprintModalOpen) closeBlueprintModal(); else if (isDossierOpen) closeDossier();">

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
        <span x-text="toast.message" class="font-medium"></span>
        <button @click="removeToast(toast.id)" class="text-slate-400 hover:text-slate-900 dark:hover:text-white text-xs">✕</button>
      </div>
    </template>
  </div>

  ${renderAppSidebar({ activeNav: 'domains', refreshHandler: 'refreshDomains()' })}

  <!-- Main Container (Offset for Unified Desktop Sidebar) [INVARIANT: UNIFIED-SIDEBAR-LAYOUT] -->
  <main class="flex-1 min-h-screen p-4 sm:p-6 lg:p-8 space-y-6 max-w-full overflow-x-hidden transition-all duration-300 ease-in-out" :class="isSidebarCollapsed ? 'md:ml-20' : 'md:ml-64 lg:ml-72'">

    ${safeFolderId ? renderCampaignWorkspaceHeader({ activeRoom: 'domains', folderId: safeFolderId }) : ''}

    <!-- [INVARIANT: UNIFIED-SIDEBAR-LAYOUT] Studio Header Card -->
    <template x-if="!scopedFolderId">
      <section class="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#121215] border border-slate-200/80 dark:border-[#27272A]/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div class="flex items-center space-x-3.5">
          <div class="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 flex items-center justify-center shadow-xs shrink-0">
            <i data-lucide="globe" class="w-5 h-5"></i>
          </div>
          <div>
            <div class="flex items-center space-x-2">
              <h2 class="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white">Domain Intelligence Studio</h2>
              <span class="px-2 py-0.5 rounded-md text-[10px] font-mono tabular-nums font-semibold bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">Level 4B</span>
            </div>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-normal">SERP Monopoly, WHOIS Age &amp; Pin-to-URL Multipliers</p>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <a href="/keywords/discovery" class="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-[#27272A] transition inline-flex items-center space-x-1.5 shadow-2xs">
            <i data-lucide="compass" class="w-3.5 h-3.5 text-emerald-500"></i>
            <span>Discovery</span>
          </a>
          <a href="/folders" class="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-[#27272A] transition inline-flex items-center space-x-1.5 shadow-2xs">
            <i data-lucide="folder-kanban" class="w-3.5 h-3.5 text-pink-500"></i>
            <span>Campaign Folders</span>
          </a>
          <button @click="refreshDomains()" :disabled="refreshingRollup || loading" class="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white transition inline-flex items-center space-x-1.5 shadow-xs active:scale-95 disabled:opacity-50">
            <i data-lucide="refresh-cw" class="w-3.5 h-3.5" :class="(refreshingRollup || loading) ? 'animate-spin' : ''"></i>
            <span x-text="refreshingRollup ? 'Refreshing...' : 'Refresh'">Refresh</span>
          </button>
        </div>
      </section>
    </template>

    <!-- DOMAIN RADAR LEADERBOARD VIEW -->
    <div x-show="!isDossierOpen" class="flex flex-col gap-6" ${hasInitialDomain ? 'style="display:none;"' : ''}>

    <!-- TOP 5 EXECUTIVE KPI CARDS -->
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
      <!-- 1. Total Ranked Domains -->
      <div @click="setPreset('all')"
           class="bg-white dark:bg-[#121215] border rounded-2xl p-4 flex flex-col gap-1 shadow-sm cursor-pointer transition-all hover:border-sky-500/50"
           :class="activePreset === 'all' ? 'border-sky-500 ring-2 ring-sky-500/20' : 'border-slate-200 dark:border-[#27272A]'"
           title="Click to reset filters and view all domains">
        <div class="flex items-center justify-between text-slate-500 dark:text-slate-400">
          <span class="text-[10px] font-mono tabular-nums uppercase tracking-wider">Ranked Domains</span>
          <span class="text-xs">🌐</span>
        </div>
        <span class="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white" x-text="formatNumber(overview.total_domains)">0</span>
        <span class="text-[11px] text-slate-400 dark:text-slate-500">Indexed sites (Click to reset)</span>
      </div>

      <!-- 2. Top-10 SERP Monopoly -->
      <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl p-4 flex flex-col gap-1 shadow-sm">
        <div class="flex items-center justify-between text-slate-500 dark:text-slate-400">
          <span class="text-[10px] font-mono tabular-nums uppercase tracking-wider">Top-5 Monopoly</span>
          <span class="text-xs">🏆</span>
        </div>
        <span class="text-2xl font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400" x-text="(overview.top5_monopoly_pct || 0) + '%'">0%</span>
        <div class="w-full bg-slate-100 dark:bg-[#18181B] rounded-full h-1.5 mt-1 overflow-hidden">
          <div class="bg-amber-500 h-1.5 rounded-full transition-all duration-500" :style="'width: ' + Math.min(100, overview.top5_monopoly_pct || 0) + '%'"></div>
        </div>
      </div>

      <!-- 3. Baby Giants (< 2 Years) -->
      <div @click="setPreset(activePreset === 'baby_giants' ? 'all' : 'baby_giants')"
           class="bg-white dark:bg-[#121215] border rounded-2xl p-4 flex flex-col gap-1 shadow-sm cursor-pointer transition-all hover:border-emerald-500/50"
           :class="activePreset === 'baby_giants' ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-slate-200 dark:border-[#27272A]'">
        <div class="flex items-center justify-between text-slate-500 dark:text-slate-400">
          <span class="text-[10px] font-mono tabular-nums uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Baby Giants (&lt; 2y)</span>
          <span class="text-xs">🌱</span>
        </div>
        <span class="text-2xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400" x-text="formatNumber(overview.baby_giants_count)">0</span>
        <span class="text-[11px] text-slate-400 dark:text-slate-500">&lt; 2y with Top 10 or 1k+ saves</span>
      </div>

      <!-- 4. Multi-Account Networks -->
      <div @click="setPreset(activePreset === 'multi_account' ? 'all' : 'multi_account')"
           class="bg-white dark:bg-[#121215] border rounded-2xl p-4 flex flex-col gap-1 shadow-sm cursor-pointer transition-all hover:border-purple-500/50"
           :class="activePreset === 'multi_account' ? 'border-purple-500 ring-2 ring-purple-500/20' : 'border-slate-200 dark:border-[#27272A]'">
        <div class="flex items-center justify-between text-slate-500 dark:text-slate-400">
          <span class="text-[10px] font-mono tabular-nums uppercase tracking-wider text-purple-600 dark:text-purple-400">PBN / Multi-Acct</span>
          <span class="text-xs">🕸️</span>
        </div>
        <span class="text-2xl font-bold font-mono tabular-nums text-purple-600 dark:text-purple-400" x-text="formatNumber(overview.multi_account_count)">0</span>
        <span class="text-[11px] text-slate-400 dark:text-slate-500">&gt;= 2 accounts pushing traffic</span>
      </div>

      <!-- 5. Avg Pin-to-URL Multiplier -->
      <div @click="setPreset(activePreset === 'high_multipliers' ? 'all' : 'high_multipliers')"
           class="bg-white dark:bg-[#121215] border rounded-2xl p-4 flex flex-col gap-1 shadow-sm cursor-pointer transition-all hover:border-amber-500/50"
           :class="activePreset === 'high_multipliers' ? 'border-amber-500 ring-2 ring-amber-500/20' : 'border-slate-200 dark:border-[#27272A]'"
           title="Click to filter by High Multipliers (>= 3.0x pins/URL)">
        <div class="flex items-center justify-between text-slate-500 dark:text-slate-400">
          <span class="text-[10px] font-mono tabular-nums uppercase tracking-wider text-amber-600 dark:text-amber-400">Avg Pin / URL</span>
          <span class="text-xs">🔁</span>
        </div>
        <span class="text-2xl font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400" x-text="(overview.avg_pins_per_url || 1.0) + 'x'">1.0x</span>
        <span class="text-[11px] text-slate-400 dark:text-slate-500">Click for High Multipliers (&gt;= 3x)</span>
      </div>
    </div>

    <!-- [INVARIANT: CONSOLIDATED-NEUTRAL-CONTROL-BAR] 2-Tier Control Bar (78px height) -->
    <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl p-2.5 sm:p-3 flex flex-col gap-2.5 shadow-sm">
      <!-- Tier 1: Search, Presets & Batch Actions (~38px) -->
      <div class="flex items-center justify-between flex-wrap gap-2">
        <!-- Search Input (Left) -->
        <div class="relative w-48 sm:w-60">
          <input type="text"
                 x-model="searchQuery"
                 @input.debounce.400ms="applySearch()"
                 placeholder="Search domain (e.g. tasty)..."
                 class="w-full bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A]/80 rounded-xl pl-8 pr-7 py-1.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40">
          <span class="absolute left-2.5 top-2 text-xs text-slate-400">🔍</span>
          <button x-show="searchQuery"
                  @click="searchQuery = ''; applySearch()"
                  class="absolute right-2 top-2 text-slate-400 hover:text-slate-600 text-xs font-bold">✕</button>
        </div>

        <!-- Presets & Target Domains (Center) -->
        <div class="flex items-center gap-1.5 flex-wrap">
          <button @click="setPreset('all')"
                  class="px-2.5 py-1 rounded-xl text-xs font-medium transition-all cursor-pointer"
                  :class="activePreset === 'all' && !pinnedOnly ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-semibold shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#27272A] border border-slate-200/60 dark:border-[#27272A]'">
            All
          </button>
          <button @click="setPreset(activePreset === 'baby_giants' ? 'all' : 'baby_giants')"
                  class="px-2.5 py-1 rounded-xl text-xs font-medium transition-all cursor-pointer"
                  :class="activePreset === 'baby_giants' ? 'bg-emerald-600 text-white font-semibold shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#27272A] border border-slate-200/60 dark:border-[#27272A]'">
            <span>Baby Giants</span>
          </button>
          <button @click="setPreset(activePreset === 'easy_arbitrage' ? 'all' : 'easy_arbitrage')"
                  class="px-2.5 py-1 rounded-xl text-xs font-medium transition-all cursor-pointer"
                  :class="activePreset === 'easy_arbitrage' ? 'bg-indigo-600 text-white font-semibold shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#27272A] border border-slate-200/60 dark:border-[#27272A]'">
            <span>Easy Arb</span>
          </button>
          <button @click="setPreset(activePreset === 'bleeding_giants' ? 'all' : 'bleeding_giants')"
                  class="px-2.5 py-1 rounded-xl text-xs font-medium transition-all cursor-pointer"
                  :class="activePreset === 'bleeding_giants' ? 'bg-rose-600 text-white font-semibold shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#27272A] border border-slate-200/60 dark:border-[#27272A]'">
            <span>Bleeding</span>
          </button>
          <button @click="setPreset(activePreset === 'high_multipliers' ? 'all' : 'high_multipliers')"
                  class="px-2.5 py-1 rounded-xl text-xs font-medium transition-all cursor-pointer"
                  :class="activePreset === 'high_multipliers' ? 'bg-amber-600 text-white font-semibold shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#27272A] border border-slate-200/60 dark:border-[#27272A]'">
            <span>High Mult</span>
          </button>
          <button @click="setPreset(activePreset === 'multi_account' ? 'all' : 'multi_account')"
                  class="px-2.5 py-1 rounded-xl text-xs font-medium transition-all cursor-pointer"
                  :class="activePreset === 'multi_account' ? 'bg-purple-600 text-white font-semibold shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#27272A] border border-slate-200/60 dark:border-[#27272A]'">
            <span>Multi-Acct</span>
          </button>
          <!-- Cluster Push Signal Filter Pill -->
          <button @click="setPreset(activePreset === 'cluster_push_signal' ? 'all' : 'cluster_push_signal')"
                  class="px-2.5 py-1 rounded-xl text-xs font-medium transition-all cursor-pointer flex items-center gap-1"
                  :class="activePreset === 'cluster_push_signal' ? 'bg-amber-500 text-white font-semibold shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#27272A] border border-slate-200/60 dark:border-[#27272A]'"
                  title="Filter young domains (age <= 2y) backed by high-audience creator accounts">
            <span>⚡ Cluster Push Signal</span>
          </button>
          <!-- Target Domains Toggle -->
          <button @click="pinnedOnly = !pinnedOnly; loadDomains(true)"
                  class="px-2.5 py-1 rounded-xl text-xs font-semibold transition-all flex items-center gap-1 shadow-2xs cursor-pointer"
                  :class="pinnedOnly ? 'bg-indigo-600 text-white ring-2 ring-indigo-500/20' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#27272A] border border-slate-200/80 dark:border-[#27272A]'"
                  title="Toggle view between all ranked domains and pinned campaign targets">
            <span>Target Domains</span>
            <template x-if="pinnedDomains.size > 0">
              <span class="px-1.5 py-0.2 rounded-full text-[10px] font-mono tabular-nums bg-indigo-500/20 text-indigo-700 dark:text-indigo-300" x-text="pinnedDomains.size"></span>
            </template>
          </button>
        </div>

        <!-- Consolidated Action Group (Right) -->
        <div class="flex items-center gap-2" x-data="{ actionsOpen: false }" @click.away="actionsOpen = false">
          <!-- Actions ▾ Dropdown -->
          <div class="relative">
            <button @click="actionsOpen = !actionsOpen"
                    class="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] hover:bg-slate-50 dark:hover:bg-[#27272A]/60 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer">
              <span>Actions</span>
              <span :class="actionsOpen ? 'rotate-180' : ''" class="transition-transform duration-150 text-[10px]">▾</span>
              <template x-if="globalEnriching || globalAdsEnriching || batchEnriching || batchAdsEnriching">
                <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              </template>
            </button>

            <div x-show="actionsOpen" x-cloak
                 x-transition:enter="transition ease-out duration-100"
                 x-transition:enter-start="transform opacity-0 scale-95"
                 x-transition:enter-end="transform opacity-100 scale-100"
                 x-transition:leave="transition ease-in duration-75"
                 x-transition:leave-start="transform opacity-100 scale-100"
                 x-transition:leave-end="transform opacity-0 scale-95"
                 class="absolute right-0 mt-1.5 w-56 rounded-2xl bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] shadow-xl py-1.5 z-40 text-xs flex flex-col font-medium">
              
              <button @click="batchEnrichVisible(); actionsOpen = false"
                      :disabled="batchEnriching || globalEnriching"
                      class="px-3.5 py-2 text-left hover:bg-slate-50 dark:hover:bg-[#27272A] text-slate-700 dark:text-slate-300 disabled:opacity-40 transition-colors flex items-center justify-between cursor-pointer">
                <span>Verify Page WHOIS</span>
                <span x-show="batchEnriching" class="animate-spin text-[10px]">⏳</span>
              </button>

              <button @click="batchEnrichAdsVisible(); actionsOpen = false"
                      :disabled="batchAdsEnriching || globalAdsEnriching"
                      title="Batch Check Ads"
                      class="px-3.5 py-2 text-left hover:bg-slate-50 dark:hover:bg-[#27272A] text-slate-700 dark:text-slate-300 disabled:opacity-40 transition-colors flex items-center justify-between cursor-pointer">
                <span>Scan Page Ads.txt</span>
                <span class="sr-only">Batch Check Ads</span>
                <span x-show="batchAdsEnriching" class="animate-spin text-[10px]">⏳</span>
              </button>

              <div class="h-px bg-slate-100 dark:bg-[#18181B] my-1"></div>

              <button @click="toggleGlobalEnrichment(); actionsOpen = false"
                      title="Verify Entire Database"
                      class="px-3.5 py-2 text-left hover:bg-slate-50 dark:hover:bg-[#27272A] text-slate-700 dark:text-slate-300 transition-colors flex items-center justify-between cursor-pointer">
                <span x-text="globalEnriching ? 'Pause Auto-Age' : 'Auto-Verify Database Age'">Verify Entire Database</span>
                <span x-show="globalEnriching" class="text-[10px] text-amber-500 font-mono tabular-nums font-bold" x-text="(globalStats.percent_complete || 0) + '%'"></span>
              </button>

              <button @click="toggleGlobalAdsEnrichment(); actionsOpen = false"
                      title="Auto-Verify All Ads"
                      class="px-3.5 py-2 text-left hover:bg-slate-50 dark:hover:bg-[#27272A] text-slate-700 dark:text-slate-300 transition-colors flex items-center justify-between cursor-pointer">
                <span x-text="globalAdsEnriching ? 'Pause Auto-Ads' : 'Auto-Verify All Ads'">Auto-Verify All Ads</span>
                <span x-show="globalAdsEnriching" class="text-[10px] text-emerald-500 font-mono tabular-nums font-bold" x-text="(globalAdsStats.percent_complete || 0) + '%'"></span>
              </button>

              <div class="h-px bg-slate-100 dark:bg-[#18181B] my-1"></div>

              <button @click="downloadDomainsCsv(); actionsOpen = false"
                      class="px-3.5 py-2 text-left hover:bg-slate-50 dark:hover:bg-[#27272A] text-slate-700 dark:text-slate-300 transition-colors flex items-center justify-between cursor-pointer">
                <span>Export CSV</span>
                <span class="text-[10px] text-slate-400 font-mono tabular-nums">.csv</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Tier 2: Refined Attribute Selects & Quick Toggles (~36px) -->
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-8 gap-2 pt-2 border-t border-slate-100 dark:border-[#27272A]/80 items-center">
        <!-- 1. Ad Network -->
        <div>
          <select x-model="selectedAdNetwork"
                  @change="loadDomains(true)"
                  class="w-full bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A] rounded-lg px-2 py-1 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-sky-500 font-medium cursor-pointer">
            <option value="all">All Ads</option>
            <option value="raptive">Raptive</option>
            <option value="mediavine">Mediavine</option>
            <option value="journey">Journey</option>
            <option value="ezoic">Ezoic</option>
            <option value="hbagency">HBAgency</option>
            <option value="adsense">AdSense</option>
            <option value="affiliate_only">Affiliate Only</option>
            <option value="switched">Switched</option>
            <option value="unchecked">Unchecked</option>
          </select>
        </div>

        <!-- 2. Campaign Folder -->
        <div>
          <select x-model="selectedFolderId"
                  @change="loadDomains(true)"
                  class="w-full bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A] rounded-lg px-2 py-1 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-sky-500 font-medium cursor-pointer">
            <option value="">All Folders</option>
            <template x-for="f in folders" :key="f.id">
              <option :value="String(f.id)" :selected="String(f.id) === String(selectedFolderId)" x-text="f.name + ' (' + (f.item_count || f.keyword_count || 0) + ')'"></option>
            </template>
          </select>
        </div>

        <!-- 3. Domain Age -->
        <div>
          <select x-model="ageFilter"
                  @change="applyModularFilter()"
                  class="w-full bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A] rounded-lg px-2 py-1 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 font-medium cursor-pointer"
                  :class="ageFilter !== 'all' ? 'border-emerald-500 bg-emerald-500/5' : ''">
            <option value="all">Any Age</option>
            <option value="le_0_5">&lt;= 6m</option>
            <option value="le_1">&lt;= 1y</option>
            <option value="le_2">&lt;= 2y (Baby Giant)</option>
            <option value="le_3">&lt;= 3y</option>
            <option value="le_5">&lt;= 5y</option>
            <option value="gt_5">&gt; 5y</option>
            <option value="verified">Verified Only</option>
            <option value="unchecked">Unchecked</option>
          </select>
        </div>

        <!-- 4. SERP Rank -->
        <div>
          <select x-model="rankFilter"
                  @change="applyModularFilter()"
                  class="w-full bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A] rounded-lg px-2 py-1 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-sky-500 font-medium cursor-pointer"
                  :class="rankFilter !== 'all' ? 'border-sky-500 bg-sky-500/5' : ''">
            <option value="all">Any Rank</option>
            <option value="top3">Top 3</option>
            <option value="top5">Top 5</option>
            <option value="top10">Top 10</option>
            <option value="top20">Top 20</option>
            <option value="displaced">Displaced</option>
            <option value="bleeding">Bleeding (&gt;= 30%)</option>
          </select>
        </div>

        <!-- 5. Saves & Velocity -->
        <div>
          <select x-model="savesFilter"
                  @change="applyModularFilter()"
                  class="w-full bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A] rounded-lg px-2 py-1 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-500 font-medium cursor-pointer"
                  :class="savesFilter !== 'all' ? 'border-amber-500 bg-amber-500/5' : ''">
            <option value="all">Any Saves</option>
            <option value="ge_500">&gt;= 500</option>
            <option value="ge_1k">&gt;= 1k</option>
            <option value="ge_5k">&gt;= 5k</option>
            <option value="ge_10k">&gt;= 10k</option>
            <option value="ge_50k">&gt;= 50k</option>
            <option value="vel_5">Vel &gt;= +5/d</option>
            <option value="vel_20">Vel &gt;= +20/d</option>
          </select>
        </div>

        <!-- 6. Sort By -->
        <div>
          <select x-model="sortBy"
                  @change="loadDomains(true)"
                  class="w-full bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A] rounded-lg px-2 py-1 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-sky-500 font-mono tabular-nums cursor-pointer">
            <option value="visibility">Sort: Visibility</option>
            <option value="arbitrage_score">Sort: Arb Score</option>
            <option value="age_asc">Sort: Youngest</option>
            <option value="pins_count">Sort: Pins</option>
            <option value="saves">Sort: Saves</option>
            <option value="velocity">Sort: Velocity</option>
            <option value="avg_rank">Sort: Best Rank</option>
            <option value="multiplier">Sort: Multiplier</option>
          </select>
        </div>

        <!-- 7. Blogs Only Checkbox -->
        <div class="flex items-center justify-between px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#18181B]">
          <label for="marketplaces-toggle" class="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1 cursor-pointer">
            <span>Blogs Only</span>
          </label>
          <input id="marketplaces-toggle"
                 type="checkbox"
                 x-model="excludeMarketplaces"
                 @change="loadDomains(true)"
                 class="rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer">
        </div>

        <!-- 8. Logic Toggle & Reset -->
        <div class="flex items-center justify-between gap-1">
          <button @click="setLogicMode(logicMode === 'and' ? 'or' : 'and')"
                  type="button"
                  class="px-2 py-1 rounded-lg text-[10px] font-mono tabular-nums font-bold transition-all border"
                  :class="logicMode === 'and' ? 'bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border-sky-300 dark:border-sky-700' : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700'"
                  :title="'Logic mode: ' + logicMode.toUpperCase() + '. Click to switch.'">
            <span x-text="logicMode.toUpperCase()">AND</span>
          </button>
          <template x-if="hasActiveFilters()">
            <button @click="resetFilters()"
                    class="text-xs font-semibold text-rose-600 dark:text-rose-400 hover:underline font-mono tabular-nums">
              ✕ Reset
            </button>
          </template>
        </div>
      </div>
    </div>

    <!-- DOMAINS LEADERBOARD TABLE -->
    <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl overflow-hidden shadow-sm flex flex-col">
      <!-- Table Header Bar -->
      <div class="px-5 py-4 border-b border-slate-200 dark:border-[#27272A] flex items-center justify-between flex-wrap gap-2">
        <div class="flex items-center gap-2">
          <span class="text-base">🏆</span>
          <h2 class="text-sm font-bold text-slate-900 dark:text-white tracking-tight">Domain Authority & Monopoly Leaderboard</h2>
          <span class="text-xs text-slate-400 font-mono tabular-nums" x-text="'(' + formatNumber(totalDomains) + ' domains matching)'"></span>
        </div>
        <div class="text-xs text-slate-400 font-mono tabular-nums" x-text="'Page ' + currentPage + ' of ' + totalPages"></div>
      </div>

      <!-- Global Verification Active Banner -->
      <template x-if="globalEnriching">
        <div class="px-5 py-3 bg-gradient-to-r from-sky-500/10 via-indigo-500/10 to-emerald-500/10 border-b border-sky-500/20 flex flex-col gap-2">
          <div class="flex items-center justify-between text-xs font-mono tabular-nums flex-wrap gap-2">
            <div class="flex items-center gap-2">
              <span class="animate-spin text-sm">🚀</span>
              <span class="font-bold text-sky-800 dark:text-sky-300">Global Verification In Progress:</span>
              <span class="text-slate-600 dark:text-slate-300" x-text="formatNumber(globalStats.checked_domains) + ' / ' + formatNumber(globalStats.total_domains) + ' domains (' + (globalStats.percent_complete || 0) + '%)'"></span>
            </div>
            <div class="flex items-center gap-3">
              <span class="text-emerald-700 dark:text-emerald-400 font-bold" x-text="'🌱 ' + formatNumber(globalStats.resolved_domains) + ' resolved'"></span>
              <span class="text-amber-700 dark:text-amber-400 font-bold" x-text="'🔒 ' + formatNumber(globalStats.failed_domains) + ' shielded'"></span>
              <span class="text-slate-500 font-mono tabular-nums" x-text="'⏳ ' + formatNumber(globalStats.unchecked_domains) + ' remaining'"></span>
              <button @click="stopGlobalEnrichment()"
                      class="px-2.5 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/30 text-[11px] font-semibold transition flex items-center gap-1 shadow-sm">
                <span>⏸️</span>
                <span>Pause</span>
              </button>
            </div>
          </div>
          <!-- Animated Progress Bar -->
          <div class="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
            <div class="bg-gradient-to-r from-sky-500 via-indigo-500 to-emerald-500 h-full transition-all duration-500"
                 :style="'width: ' + (globalStats.percent_complete || 0) + '%'"></div>
          </div>
        </div>
      </template>

      <!-- Global Ads Verification Active Banner -->
      <template x-if="globalAdsEnriching">
        <div class="px-5 py-3 bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-sky-500/10 border-b border-emerald-500/20 flex flex-col gap-2">
          <div class="flex items-center justify-between text-xs font-mono tabular-nums flex-wrap gap-2">
            <div class="flex items-center gap-2">
              <span class="animate-spin text-sm">💰</span>
              <span class="font-bold text-emerald-800 dark:text-emerald-300">Automated Ads.txt Verification In Progress:</span>
              <span class="text-slate-600 dark:text-slate-300" x-text="formatNumber(globalAdsStats.checked_domains) + ' / ' + formatNumber(globalAdsStats.total_domains) + ' domains (' + (globalAdsStats.percent_complete || 0) + '%)'"></span>
            </div>
            <div class="flex items-center gap-2.5 flex-wrap">
              <span class="text-purple-600 dark:text-purple-400 font-bold" x-text="'💎 ' + formatNumber(globalAdsStats.raptive_count) + ' Raptive'"></span>
              <span class="text-rose-600 dark:text-rose-400 font-bold" x-text="'🍇 ' + formatNumber(globalAdsStats.mediavine_count) + ' Mediavine'"></span>
              <span class="text-sky-600 dark:text-sky-400 font-bold" x-text="'🚀 ' + formatNumber(globalAdsStats.journey_count) + ' Journey'"></span>
              <span class="text-emerald-600 dark:text-emerald-400 font-bold" x-text="'⚡ ' + formatNumber(globalAdsStats.hbagency_count) + ' HBAgency'"></span>
              <span class="text-amber-600 dark:text-amber-400 font-bold" x-text="'🟡 ' + formatNumber(globalAdsStats.adsense_count) + ' AdSense'"></span>
              <span class="text-slate-500 font-mono tabular-nums" x-text="'⏳ ' + formatNumber(globalAdsStats.unchecked_domains) + ' remaining'"></span>
              <button @click="stopGlobalAdsEnrichment()"
                      class="px-2.5 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/30 text-[11px] font-semibold transition flex items-center gap-1 shadow-sm">
                <span>⏸️</span>
                <span>Pause</span>
              </button>
            </div>
          </div>
          <!-- Animated Progress Bar -->
          <div class="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
            <div class="bg-gradient-to-r from-emerald-500 via-teal-500 to-sky-500 h-full transition-all duration-500"
                 :style="'width: ' + (globalAdsStats.percent_complete || 0) + '%'"></div>
          </div>
        </div>
      </template>

      <!-- Table Element -->
      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs border-collapse min-w-[1020px]">
          <thead>
            <tr class="bg-slate-50/80 dark:bg-[#09090B]/60 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-[#27272A] font-mono tabular-nums text-[11px] uppercase select-none">
              <th @click="toggleSortColumn('domain')" class="py-3 px-4 font-semibold cursor-pointer hover:text-sky-600 dark:hover:text-sky-400 transition-colors">
                # & Domain <span x-show="sortBy === 'domain_asc' || sortBy === 'domain_desc'" x-text="sortBy === 'domain_asc' ? '↑' : '↓'"></span>
              </th>
              <th class="py-3 px-4 font-semibold">Ad Network</th>
              <th @click="toggleSortColumn('pins_count')" class="py-3 px-4 font-semibold cursor-pointer hover:text-sky-600 dark:hover:text-sky-400 transition-colors">
                Pins & Multiplier <span x-show="sortBy === 'pins_count' || sortBy === 'multiplier'" x-text="'↓'"></span>
              </th>
              <th @click="toggleSortColumn('visibility')" class="py-3 px-4 font-semibold cursor-pointer hover:text-sky-600 dark:hover:text-sky-400 transition-colors">
                SERP Distribution <span x-show="sortBy === 'visibility' || sortBy === 'avg_rank'" x-text="'↓'"></span>
              </th>
              <th @click="toggleSortColumn('saves')" class="py-3 px-4 font-semibold cursor-pointer hover:text-sky-600 dark:hover:text-sky-400 transition-colors">
                Saves & Velocity <span x-show="sortBy === 'saves' || sortBy === 'velocity'" x-text="'↓'"></span>
              </th>
              <th @click="toggleSortColumn('arbitrage_score')" class="py-3 px-4 font-semibold cursor-pointer hover:text-sky-600 dark:hover:text-sky-400 transition-colors">
                Arbitrage & Accounts <span x-show="sortBy === 'arbitrage_score'" x-text="'↓'"></span>
              </th>
              <th class="py-3 px-4 text-right font-semibold sticky right-0 bg-slate-50/95 dark:bg-[#09090B]/95 backdrop-blur-xs shadow-[-6px_0_8px_-2px_rgba(0,0,0,0.06)] z-10 select-none">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800/80 text-slate-700 dark:text-slate-200">
            <!-- Loading Row -->
            <template x-if="loading">
              <tr>
                <td colspan="7" class="py-12 text-center text-slate-400 font-mono tabular-nums">
                  <div class="inline-flex items-center gap-2">
                    <span class="animate-spin text-base">⏳</span>
                    <span>Querying cross-pillar domain authority...</span>
                  </div>
                </td>
              </tr>
            </template>

            <!-- Error / Timeout Row -->
            <template x-if="!loading && loadError">
              <tr>
                <td colspan="7" class="py-12 text-center text-rose-500 font-mono tabular-nums">
                  <div class="flex flex-col items-center gap-2">
                    <span class="text-2xl">⚠️</span>
                    <span class="font-semibold text-slate-700 dark:text-slate-300" x-text="loadError"></span>
                    <button @click="loadDomains(false)" class="px-3.5 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold font-sans transition shadow-sm mt-1 flex items-center gap-1.5">
                      <span>🔄</span>
                      <span>Retry Loading</span>
                    </button>
                  </div>
                </td>
              </tr>
            </template>

            <!-- Empty Row -->
            <template x-if="!loading && !loadError && domains.length === 0">
              <tr>
                <td colspan="7" class="py-12 text-center text-slate-400">
                  <div class="flex flex-col items-center gap-2">
                    <span class="text-2xl">🔍</span>
                    <span class="font-semibold text-slate-700 dark:text-slate-300">No domains match the selected filters</span>
                    <button @click="resetFilters()" class="text-xs text-sky-600 hover:underline">Reset all filters</button>
                  </div>
                </td>
              </tr>
            </template>

            <!-- Data Rows -->
            <template x-for="(d, idx) in domains" :key="d.domain">
              <tr @click="openDossier(d.domain)"
                  class="hover:bg-slate-50 dark:hover:bg-[#27272A]/50 cursor-pointer transition-colors group">
                <!-- 1. Rank & Domain (with Age relocated to sub-line, 5 redundant badges purged) -->
                <td class="py-3 px-4">
                  <div class="flex items-center gap-2.5">
                    <span class="text-slate-400 font-mono tabular-nums text-[11px] w-6 shrink-0" x-text="((currentPage - 1) * limit) + idx + 1"></span>
                    <template x-if="d.domain && d.domain.toLowerCase() === 'uploaded by user'">
                      <span class="w-4 h-4 rounded shrink-0 bg-amber-500/10 text-amber-500 flex items-center justify-center text-[10px]" title="Direct Organic Uploads (Unlinked Pins)">✨</span>
                    </template>
                    <template x-if="!d.domain || d.domain.toLowerCase() !== 'uploaded by user'">
                      <img :src="'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(d.domain) + '&sz=32'"
                           class="w-4 h-4 rounded shrink-0 bg-slate-200 dark:bg-slate-700"
                           loading="lazy"
                           onerror="this.onerror=null; this.style.display='none'">
                    </template>
                    <div class="flex flex-col min-w-0">
                      <!-- Line 1: Domain Name + External Link -->
                      <div class="flex items-center gap-1.5 flex-wrap">
                        <span class="font-bold text-slate-900 dark:text-white truncate group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors" x-text="d.domain"></span>
                        <template x-if="!d.domain || d.domain.toLowerCase() !== 'uploaded by user'">
                          <a :href="safeUrl('https://' + d.domain)"
                             target="_blank"
                             rel="noopener noreferrer"
                             @click.stop
                             class="text-slate-400 hover:text-slate-700 dark:hover:text-white text-xs shrink-0"
                             title="Visit website in new tab">
                            ↗
                          </a>
                        </template>
                      </div>

                      <!-- Line 2: Domain Age & URL Count Sub-Line (Clean Universal Time Format) -->
                      <div class="flex items-center gap-1.5 flex-wrap text-[10px] text-slate-400 font-mono tabular-nums mt-0.5">
                        <template x-if="d.domain && d.domain.toLowerCase() === 'uploaded by user'">
                          <span class="text-amber-600 dark:text-amber-400 font-semibold">Direct Uploads • Organic Vacuum</span>
                        </template>
                        <template x-if="!d.domain || d.domain.toLowerCase() !== 'uploaded by user'">
                          <div class="flex items-center gap-1.5 flex-wrap">
                            <!-- Resolved Age with Universal Strict Formatting (>=365d: years only, <365d: days only) -->
                            <template x-if="d.age_years !== null && d.age_years !== undefined">
                              <span class="inline-flex items-center font-bold px-1.5 py-0.2 rounded"
                                    :class="{
                                      'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20': d.age_years <= 2.0,
                                      'bg-sky-500/10 text-sky-700 dark:text-sky-400 border border-sky-500/20': d.age_years > 2.0 && d.age_years <= 5.0,
                                      'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20': d.age_years > 5.0
                                    }"
                                    :title="d.domain_created_at ? 'Registered: ' + d.domain_created_at.slice(0, 10) : 'Age'">
                                <span x-text="formatDomainAge(d.age_days)"></span>
                              </span>
                            </template>

                            <!-- Privacy Shielded / Redacted -->
                            <template x-if="(d.age_years === null || d.age_years === undefined) && d.age_status === 'failed'">
                              <span class="inline-flex items-center gap-0.5 text-slate-500 dark:text-slate-400 font-medium"
                                    title="Registry Withheld / Privacy Shielded">
                                <span>Redacted / Shielded</span>
                                <button @click.stop="enrichAge(d.domain, true)"
                                        :disabled="enrichingDomains[d.domain]"
                                        class="hover:text-slate-600 dark:hover:text-slate-200 transition text-[9px] ml-0.5"
                                        title="Re-check WHOIS">
                                  <span :class="{ 'animate-spin': enrichingDomains[d.domain] }">↻</span>
                                </button>
                              </span>
                            </template>

                            <!-- Unchecked -->
                            <template x-if="(d.age_years === null || d.age_years === undefined) && d.age_status !== 'failed'">
                              <button @click.stop="enrichAge(d.domain)"
                                      :disabled="enrichingDomains[d.domain]"
                                      class="hover:text-sky-600 dark:hover:text-sky-400 underline font-medium transition"
                                      title="Check WHOIS age">
                                <span x-text="enrichingDomains[d.domain] ? 'Checking...' : 'Check WHOIS'"></span>
                              </button>
                            </template>

                            <span class="text-slate-300 dark:text-slate-600">•</span>
                            <span x-text="(d.unique_urls || 0) + ' URLs'"></span>
                          </div>
                        </template>
                      </div>
                    </div>
                  </div>
                </td>

                <!-- 3. Ad Network & Monetization -->
                <td class="py-3 px-4">
                  <template x-if="d.domain && d.domain.toLowerCase() === 'uploaded by user'">
                    <span class="inline-flex items-center gap-1 font-mono tabular-nums text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shadow-sm">
                      <span>✨</span>
                      <span>100% Organic (Unmonetized)</span>
                    </span>
                  </template>
                  <template x-if="!d.domain || d.domain.toLowerCase() !== 'uploaded by user'">
                  <div class="flex flex-col gap-1">
                    <!-- State 1: Recognized Ad Network -->
                    <template x-if="d.ad_network && d.ad_network !== 'unchecked'">
                      <div class="flex items-center gap-1.5 flex-wrap">
                        <span class="inline-flex items-center gap-1 font-mono tabular-nums text-[11px] font-bold px-2 py-0.5 rounded-md shadow-sm w-fit"
                              :class="getAdNetworkBadgeClasses(d.ad_network)"
                              :title="d.ad_manager_domain ? 'Managed by: ' + d.ad_manager_domain : 'Ad Network'">
                          <span x-text="getAdNetworkBadgeText(d.ad_network)"></span>
                        </span>

                        <!-- Switch Detection Pill -->
                        <template x-if="d.previous_ad_network">
                          <span class="px-1.5 py-0.5 rounded text-[9px] font-mono tabular-nums font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 shrink-0"
                                :title="'Migrated from ' + d.previous_ad_network + (d.ad_switched_at ? ' on ' + d.ad_switched_at.slice(0, 10) : '')"
                                x-text="'↗️ Ex-' + capitalize(d.previous_ad_network)"></span>
                        </template>

                        <!-- Force Re-check Button on hover -->
                        <button @click.stop="enrichAd(d.domain, true)"
                                :disabled="enrichingAds[d.domain]"
                                class="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-slate-200 dark:hover:bg-[#27272A] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-[10px] transition"
                                title="Re-scan ads.txt">
                          <span :class="{ 'animate-spin': enrichingAds[d.domain] }">🔄</span>
                        </button>
                      </div>
                    </template>

                    <!-- State 2: Unchecked Ad Network -->
                    <template x-if="!d.ad_network || d.ad_network === 'unchecked'">
                      <button @click.stop="enrichAd(d.domain)"
                              :disabled="enrichingAds[d.domain]"
                              class="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-slate-600 dark:text-slate-300 text-[10px] font-mono tabular-nums border border-slate-200 dark:border-[#27272A] transition flex items-center gap-1 disabled:opacity-60 shadow-sm w-fit">
                        <span :class="{ 'animate-spin': enrichingAds[d.domain] }" x-text="enrichingAds[d.domain] ? '⏳' : '💰'">💰</span>
                        <span x-text="enrichingAds[d.domain] ? 'Checking...' : 'Check Ads'">Check Ads</span>
                      </button>
                    </template>
                  </div>
                  </template>
                </td>

                <!-- 3. Pins & Multiplier -->
                <td class="py-3 px-4 font-mono tabular-nums">
                  <div class="flex flex-col gap-0.5">
                    <div class="flex items-center gap-1.5">
                      <span class="font-bold text-slate-900 dark:text-white" x-text="formatNumber(d.total_pins)"></span>
                      <span class="text-slate-400 text-[10px]">pins</span>
                    </div>
                    <span class="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.2 rounded w-fit"
                          :class="d.pins_per_url >= 3.0 ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30' : 'bg-slate-100 dark:bg-[#18181B] text-slate-600 dark:text-slate-400'">
                      <span>🔁</span>
                      <span x-text="d.pins_per_url + 'x Pins/URL'"></span>
                    </span>
                  </div>
                </td>

                <!-- 4. SERP Distribution -->
                <td class="py-3 px-4">
                  <template x-if="d.active_serp_pins > 0 || d.displaced_pins > 0">
                    <div class="flex flex-col gap-1">
                      <div class="flex items-center gap-2 text-[11px] font-mono tabular-nums">
                        <span class="text-emerald-600 dark:text-emerald-400 font-bold" title="Top 3 Pins" x-text="'🥇 ' + d.top3_pins"></span>
                        <span class="text-sky-600 dark:text-sky-400 font-bold" title="Top 10 Pins" x-text="'🎯 ' + d.top10_pins"></span>
                        <template x-if="d.displaced_pins > 0">
                          <span class="text-rose-600 dark:text-rose-400 font-bold" :title="'Displaced: ' + d.decay_rate_pct + '%'" x-text="'📉 ' + d.displaced_pins"></span>
                        </template>
                      </div>
                      <div class="text-[10px] text-slate-400 font-mono tabular-nums flex items-center gap-2">
                        <span x-text="'Avg #' + (d.avg_rank || '—')"></span>
                        <span class="text-slate-300 dark:text-slate-700">|</span>
                        <span class="text-sky-600 dark:text-sky-400 font-semibold" x-text="'Vis: ' + d.visibility_score"></span>
                      </div>
                    </div>
                  </template>
                  <template x-if="!d.active_serp_pins && !d.displaced_pins">
                    <div class="flex flex-col gap-0.5 font-mono tabular-nums">
                      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-[#18181B] text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-[#27272A] w-fit"
                            title="This domain was discovered via Competitor Profiles (P1) or PinArchive (P4) and has no tracked SERP keywords yet">
                        <span>📦</span>
                        <span>Catalog / Archive Only</span>
                      </span>
                      <span class="text-[9px] text-slate-400">No SERP keyword tracked yet</span>
                    </div>
                  </template>
                </td>

                <!-- 5. Saves & Velocity -->
                <td class="py-3 px-4 font-mono tabular-nums">
                  <div class="flex flex-col gap-0.5">
                    <div class="flex items-center gap-1">
                      <span class="font-bold text-slate-900 dark:text-white" x-text="formatNumber(d.total_saves)"></span>
                      <span class="text-slate-400 text-[10px]">saves</span>
                    </div>
                    <span class="text-[10px] text-emerald-600 dark:text-emerald-400" x-text="'+' + d.avg_velocity + '/d'"></span>
                  </div>
                </td>

                <!-- 6. Arbitrage & Accounts -->
                <td class="py-3 px-4">
                  <div class="flex flex-col gap-1">
                    <div class="flex items-center gap-1.5">
                      <span class="inline-flex items-center gap-1 text-[11px] font-mono tabular-nums font-bold px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-500/20"
                            :title="'Arbitrage Velocity / Age Score: ' + d.arbitrage_score">
                        <span>⚡</span>
                        <span x-text="d.arbitrage_score"></span>
                      </span>
                    </div>
                    <div class="flex items-center gap-1 flex-wrap">
                      <template x-for="acc in (d.sample_accounts || []).slice(0, 2)" :key="acc">
                        <span class="text-[10px] font-mono tabular-nums text-purple-600 dark:text-purple-400 bg-purple-500/10 px-1 py-0.2 rounded" x-text="'@' + acc"></span>
                      </template>
                      <template x-if="d.accounts_count > 2">
                        <span class="text-[10px] text-slate-400 font-mono tabular-nums" x-text="'+' + (d.accounts_count - 2)"></span>
                      </template>
                    </div>
                    <!-- Associated Creator Account Total Audience & Impressions Bridge [INVARIANT: CREATOR-AUDIENCE-BRIDGE] -->
                    <template x-if="d.monthly_reach || d.profile_views || d.creator_audience">
                      <div class="flex items-center gap-1.5 text-[10px] font-mono tabular-nums text-slate-500 dark:text-[#A1A1AA] pt-0.5"
                           :title="'Associated creator account Total Audience: ' + formatNumber(d.monthly_reach || d.creator_audience || 0) + ' | Impressions: ' + formatNumber(d.profile_views || d.creator_impressions || 0)">
                        <span>Aud: <span class="font-semibold text-slate-700 dark:text-slate-200" x-text="formatNumber(d.monthly_reach || d.creator_audience || 0)"></span></span>
                        <span>•</span>
                        <span>Imp: <span class="font-semibold text-slate-700 dark:text-slate-200" x-text="formatNumber(d.profile_views || d.creator_impressions || 0)"></span></span>
                      </div>
                    </template>
                  </div>
                </td>

                <!-- 7. Actions -->
                <td class="py-3 px-4 text-right sticky right-0 bg-white/95 dark:bg-[#121215]/95 backdrop-blur-xs group-hover:bg-slate-50/95 dark:group-hover:bg-slate-800/95 shadow-[-6px_0_8px_-2px_rgba(0,0,0,0.06)] z-10">
                  <div class="flex items-center justify-end gap-1.5 whitespace-nowrap">
                    <button @click.stop="togglePinDomain(d.domain)"
                            class="px-2 py-1 rounded-lg text-xs font-semibold transition flex items-center gap-1 shadow-2xs"
                            :class="pinnedDomains.has(d.domain.toLowerCase()) ? 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30' : 'bg-slate-100 hover:bg-slate-200 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-[#27272A]'"
                            :title="pinnedDomains.has(d.domain.toLowerCase()) ? 'Unpin domain from folder' : 'Pin domain to campaign folder'">
                      <span>📌</span>
                      <span x-text="pinnedDomains.has(d.domain.toLowerCase()) ? 'Pinned' : 'Pin'"></span>
                    </button>
                    <button @click.stop="openDossier(d.domain)"
                            class="px-2.5 py-1.5 rounded-lg bg-sky-50 dark:bg-sky-950/60 hover:bg-sky-100 dark:hover:bg-sky-900/60 text-sky-600 dark:text-sky-400 text-xs font-semibold transition border border-sky-200 dark:border-sky-800">
                      Dossier →
                    </button>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>

      <!-- Pagination Footer -->
      <div class="px-5 py-3.5 border-t border-slate-200 dark:border-[#27272A] flex items-center justify-between flex-wrap gap-2 text-xs text-slate-500">
        <div class="flex items-center gap-2 font-mono tabular-nums">
          <span>Showing</span>
          <span class="font-bold text-slate-900 dark:text-white" x-text="Math.min(totalDomains, ((currentPage - 1) * limit) + 1) + ' - ' + Math.min(totalDomains, currentPage * limit)"></span>
          <span>of</span>
          <span class="font-bold text-slate-900 dark:text-white" x-text="formatNumber(totalDomains)"></span>
        </div>

        <div class="flex items-center gap-2">
          <button @click="changePage(currentPage - 1)"
                  :disabled="currentPage <= 1 || loading"
                  class="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] hover:bg-slate-50 dark:hover:bg-[#27272A] text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition">
            ← Previous
          </button>
          <span class="font-mono tabular-nums text-xs text-slate-700 dark:text-slate-300 font-bold px-2" x-text="currentPage + ' / ' + totalPages"></span>
          <button @click="changePage(currentPage + 1)"
                  :disabled="currentPage >= totalPages || loading"
                  class="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] hover:bg-slate-50 dark:hover:bg-[#27272A] text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition">
            Next →
          </button>
        </div>
      </div>
    </div>
    </div>
    <!-- END DOMAIN RADAR LEADERBOARD VIEW -->

    <!-- DEDICATED FULL-PAGE DOMAIN INTELLIGENCE STUDIO VIEW -->
    <div x-show="isDossierOpen" x-cloak class="flex flex-col gap-6 w-full" ${hasInitialDomain ? 'style="display:flex;"' : ''}>

      <!-- Breadcrumbs & Studio Action Bar -->
      <div class="flex items-center justify-between flex-wrap gap-4 pb-2 border-b border-slate-200 dark:border-[#27272A]">
        <div class="flex items-center gap-3 text-xs font-mono tabular-nums">
          <button @click="closeDossier()"
                  class="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-slate-700 dark:text-slate-300 font-bold flex items-center gap-1.5 transition shadow-sm"
                  title="Return to Domain Radar Leaderboard (Esc)">
            <span>← Back to Leaderboard</span>
          </button>
          <span class="text-slate-300 dark:text-slate-700">|</span>
          <nav class="flex items-center gap-1.5 text-slate-500">
            <a :href="getBaseStudioPath()" href="/domains" @click.prevent="closeDossier()" class="hover:text-sky-600 dark:hover:text-sky-400 flex items-center gap-1 transition">
              <span>🌐 Domain Radar</span>
            </a>
            <span class="text-slate-300 dark:text-slate-700">/</span>
            <span class="font-bold text-slate-900 dark:text-white" x-text="dossierDomain"></span>
          </nav>
        </div>

        <div class="flex items-center gap-2">
          <button @click="openBlueprintModal(dossierDomain)"
                  class="px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-600 hover:to-rose-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-rose-500/20 active:scale-95"
                  title="Generate instant 6-pillar Arbitrage Attack Blueprint">
            <span>⚡</span>
            <span>Attack Plan</span>
          </button>
          <button @click="recheckAgeForDossier()"
                  :disabled="enrichingDomains[dossierDomain]"
                  class="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] hover:bg-slate-50 dark:hover:bg-[#27272A] text-xs font-semibold text-slate-700 dark:text-slate-300 transition flex items-center gap-1 shadow-sm disabled:opacity-60">
            <span :class="{ 'animate-spin': enrichingDomains[dossierDomain] }">🔄</span>
            <span x-text="enrichingDomains[dossierDomain] ? 'Checking...' : 'Re-check Age'">Re-check Age</span>
          </button>
          <button @click="recheckAdsForDossier()"
                  :disabled="enrichingAds[dossierDomain]"
                  class="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] hover:bg-slate-50 dark:hover:bg-[#27272A] text-xs font-semibold text-slate-700 dark:text-slate-300 transition flex items-center gap-1 shadow-sm disabled:opacity-60">
            <span :class="{ 'animate-spin': enrichingAds[dossierDomain] }">🔄</span>
            <span x-text="enrichingAds[dossierDomain] ? 'Scanning...' : 'Re-scan ads.txt'">Re-scan ads.txt</span>
          </button>
          <button @click="closeDossier()"
                  class="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-slate-600 dark:text-slate-300 text-xs font-bold transition flex items-center gap-1"
                  title="Close Studio (Esc)">
            <span>Esc</span>
            <span>✕</span>
          </button>
        </div>
      </div>

      <!-- Stitch Minimalist Domain Header Strip -->
      <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl p-5 shadow-sm flex flex-col gap-4">
        <!-- Top Row: Identity & External Shortcuts -->
        <div class="flex items-center justify-between flex-wrap gap-4">
          <div class="flex items-center gap-3.5">
            <template x-if="dossierDomain && dossierDomain.toLowerCase() === 'uploaded by user'">
              <span class="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center text-lg shadow-sm font-bold">✨</span>
            </template>
            <template x-if="!dossierDomain || dossierDomain.toLowerCase() !== 'uploaded by user'">
              <img :src="'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(dossierDomain) + '&sz=32'"
                   class="w-8 h-8 rounded-xl shadow-sm bg-slate-200 dark:bg-[#18181B] shrink-0"
                   loading="lazy"
                   onerror="this.onerror=null; this.style.display='none'">
            </template>
            <div class="flex items-center gap-3 flex-wrap">
              <h2 class="text-xl font-bold text-slate-900 dark:text-white font-mono tabular-nums tracking-tight" x-text="dossierDomain"></h2>
              <template x-if="dossierDomain && dossierDomain.toLowerCase() === 'uploaded by user'">
                <span class="text-xs font-mono tabular-nums text-amber-600 dark:text-amber-400 font-bold">🎯 100% Organic Direct Uploads • Unlinked Pinterest Traffic • Vacuum Opportunity</span>
              </template>
              <template x-if="!dossierDomain || dossierDomain.toLowerCase() !== 'uploaded by user'">
                <div class="flex items-center gap-2 text-xs font-mono tabular-nums text-slate-400">
                  <a :href="safeUrl('https://' + dossierDomain)" target="_blank" rel="noopener noreferrer" class="text-sky-600 dark:text-sky-400 hover:underline font-medium">Visit ↗</a>
                  <span>•</span>
                  <a :href="safeUrl('https://www.similarweb.com/website/' + dossierDomain)" target="_blank" rel="noopener noreferrer" class="hover:text-slate-600 dark:hover:text-slate-200 hover:underline">Similarweb ↗</a>
                  <span>•</span>
                  <a :href="safeUrl('https://web.archive.org/web/*/' + dossierDomain)" target="_blank" rel="noopener noreferrer" class="hover:text-slate-600 dark:hover:text-slate-200 hover:underline">Wayback ↗</a>
                  <span>•</span>
                  <a :href="safeUrl('https://www.google.com/search?q=site%3A' + encodeURIComponent(dossierDomain))" target="_blank" rel="noopener noreferrer" class="hover:text-slate-600 dark:hover:text-slate-200 hover:underline">Google Site ↗</a>
                </div>
              </template>
            </div>
          </div>

          <!-- Quick Action Buttons -->
          <div class="flex items-center gap-2">
            <button @click="openBlueprintModal(dossierDomain)"
                    class="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white text-white dark:text-slate-900 text-xs font-bold transition flex items-center gap-1.5 shadow-sm active:scale-95"
                    title="Generate instant 6-pillar Arbitrage Attack Blueprint">
              <span>⚡ Attack Plan</span>
            </button>
            <template x-if="!dossierDomain || dossierDomain.toLowerCase() !== 'uploaded by user'">
              <div class="flex items-center gap-2">
                <button @click="recheckAgeForDossier()"
                        :disabled="enrichingDomains[dossierDomain]"
                        class="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#18181B]/80 hover:bg-slate-100 dark:hover:bg-[#27272A] text-xs font-semibold text-slate-700 dark:text-slate-300 transition flex items-center gap-1 shadow-sm disabled:opacity-60">
                  <span :class="{ 'animate-spin': enrichingDomains[dossierDomain] }">🔄</span>
                  <span x-text="enrichingDomains[dossierDomain] ? 'Checking...' : 'Re-check Age'">Re-check Age</span>
                </button>
                <button @click="recheckAdsForDossier()"
                        :disabled="enrichingAds[dossierDomain]"
                        class="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#18181B]/80 hover:bg-slate-100 dark:hover:bg-[#27272A] text-xs font-semibold text-slate-700 dark:text-slate-300 transition flex items-center gap-1 shadow-sm disabled:opacity-60">
                  <span :class="{ 'animate-spin': enrichingAds[dossierDomain] }">🔄</span>
                  <span x-text="enrichingAds[dossierDomain] ? 'Scanning...' : 'Re-scan ads.txt'">Re-scan ads.txt</span>
                </button>
              </div>
            </template>
          </div>
        </div>

        <!-- Sleek Horizontal Bento Metadata Chips -->
        <template x-if="dossierData?.summary?.is_organic_vault">
          <div class="flex items-center gap-2 flex-wrap font-mono tabular-nums text-xs pt-3 border-t border-slate-100 dark:border-[#27272A]/80">
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 font-bold shadow-sm">
              <span>🎯</span>
              <span>100% Unmonetized Arbitrage Vacuum</span>
            </span>
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 font-bold shadow-sm">
              <span>⚡</span>
              <span>0 Outbound Links • Top SERP Search Rankings</span>
            </span>
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-500/20 font-bold shadow-sm">
              <span>👤</span>
              <span x-text="(dossierData?.summary?.accounts_count || 0) + ' Organic Creator Accounts'"></span>
            </span>
          </div>
        </template>
        <template x-if="!dossierData?.summary?.is_organic_vault">
        <div class="flex items-center gap-2 flex-wrap font-mono tabular-nums text-xs pt-3 border-t border-slate-100 dark:border-[#27272A]/80">
          <!-- Age Badge -->
          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold shadow-sm"
                :class="dossierData?.age_info?.age_years != null ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20' : (dossierData?.age_info?.lookup_status === 'failed' ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20' : 'bg-slate-100 dark:bg-[#18181B] text-slate-500 border-slate-200 dark:border-[#27272A]')"
                :title="dossierData?.age_info?.registered_at ? 'Registered: ' + dossierData.age_info.registered_at.slice(0, 10) : 'Age'">
            <span>🌱</span>
            <span x-text="dossierData?.age_info?.age_days != null ? formatDomainAge(dossierData.age_info.age_days) : (dossierData?.age_info?.lookup_status === 'failed' ? 'Registry Withheld / Privacy Shielded' : 'Unverified Age')"></span>
          </span>

          <!-- Registration Date -->
          <template x-if="dossierData?.age_info?.registered_at">
            <span class="px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-[#18181B]/60 border border-slate-200 dark:border-[#27272A]/80 text-slate-600 dark:text-slate-300">
              <span class="text-slate-400">Reg: </span>
              <span class="font-bold text-slate-800 dark:text-slate-200" x-text="dossierData.age_info.registered_at.slice(0, 10)"></span>
            </span>
          </template>

          <!-- Expiry Date -->
          <template x-if="dossierData?.age_info?.expires_at">
            <span class="px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-[#18181B]/60 border border-slate-200 dark:border-[#27272A]/80 text-slate-600 dark:text-slate-300">
              <span class="text-slate-400">Expires: </span>
              <span class="font-bold text-slate-800 dark:text-slate-200" x-text="dossierData.age_info.expires_at.slice(0, 10)"></span>
            </span>
          </template>

          <!-- Active Ad Network Badge -->
          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold shadow-sm"
                title="Ad Network & Monetization Profile"
                :class="getAdNetworkBadgeClasses(dossierData?.ad_info?.current_ad_network)">
            <span x-text="getAdNetworkBadgeText(dossierData?.ad_info?.current_ad_network)"></span>
          </span>

          <!-- Ad Manager Domain -->
          <template x-if="dossierData?.ad_info?.ad_manager_domain">
            <span class="px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-[#18181B]/60 border border-slate-200 dark:border-[#27272A]/80 text-slate-600 dark:text-slate-300">
              <span class="text-slate-400">Manager: </span>
              <span class="font-bold text-sky-600 dark:text-sky-400" x-text="dossierData.ad_info.ad_manager_domain"></span>
            </span>
          </template>

          <!-- Publisher ID -->
          <template x-if="dossierData?.ad_info?.primary_pub_id">
            <span class="px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-[#18181B]/60 border border-slate-200 dark:border-[#27272A]/80 text-slate-600 dark:text-slate-300">
              <span class="text-slate-400">Pub ID: </span>
              <span class="font-bold text-slate-800 dark:text-slate-200" x-text="dossierData.ad_info.primary_pub_id"></span>
            </span>
          </template>

          <!-- ads.txt Status -->
          <span class="px-2.5 py-1 rounded-lg border text-xs font-semibold flex items-center gap-1"
                :class="dossierData?.ad_info?.ads_txt_status === 'valid' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20' : 'bg-slate-50 dark:bg-[#18181B]/60 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-[#27272A]'">
            <span :class="dossierData?.ad_info?.ads_txt_status === 'valid' ? 'text-emerald-500' : 'text-slate-400'">●</span>
            <span x-text="'ads.txt: ' + (dossierData?.ad_info?.ads_txt_status || 'Pending')"></span>
          </span>

          <!-- Migration Pill -->
          <template x-if="dossierData?.ad_info?.previous_ad_network">
            <span class="px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 font-bold flex items-center gap-1 shadow-sm"
                  :title="'Historical Switch Tracking: Migrated from ' + dossierData.ad_info.previous_ad_network + ' to ' + (dossierData.ad_info.current_ad_network || '')">
              <span>↗️</span>
              <span x-text="'Ex-' + capitalize(dossierData.ad_info.previous_ad_network)"></span>
              <span class="text-[10px] text-slate-400" x-text="dossierData?.ad_info?.switched_at ? '(' + dossierData.ad_info.switched_at.slice(0, 10) + ')' : ''"></span>
            </span>
          </template>
        </div>
        </template>
      </div>

      <!-- Dossier High-Level 6 KPI Summary Cards -->
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5 font-mono tabular-nums text-center">
        <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] p-4 rounded-2xl shadow-sm flex flex-col gap-1">
          <div class="text-[10px] text-slate-400 uppercase tracking-wider">Ranked Pins</div>
          <div class="text-2xl font-bold text-slate-900 dark:text-white" x-text="formatNumber(dossierData?.summary?.total_pins || 0)"></div>
          <div class="text-[11px] text-slate-400" x-text="(dossierData?.summary?.visual_pins_count != null && dossierData?.summary?.visual_pins_count < dossierData?.summary?.total_pins) ? (formatNumber(dossierData.summary.visual_pins_count) + ' visual cards loaded') : 'Total SERP pins'"></div>
        </div>
        <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] p-4 rounded-2xl shadow-sm flex flex-col gap-1">
          <div class="text-[10px] text-slate-400 uppercase tracking-wider" x-text="dossierData?.summary?.is_organic_vault ? 'Upload Boards' : 'Money Articles'"></div>
          <div class="text-2xl font-bold text-slate-900 dark:text-white" x-text="dossierData?.summary?.is_organic_vault ? filteredDossierArticles().length : (dossierData?.summary?.unique_urls || 0)"></div>
          <div class="text-[11px] text-slate-400" x-text="dossierData?.summary?.is_organic_vault ? 'Niche board groups' : 'Unique URLs'"></div>
        </div>
        <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] p-4 rounded-2xl shadow-sm flex flex-col gap-1">
          <div class="text-[10px] text-slate-400 uppercase tracking-wider">Multiplier</div>
          <div class="text-2xl font-bold text-amber-600 dark:text-amber-400" x-text="(dossierData?.summary?.pins_per_url || 1) + 'x'"></div>
          <div class="text-[11px] text-slate-400">Pins per article</div>
        </div>
        <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] p-4 rounded-2xl shadow-sm flex flex-col gap-1">
          <div class="text-[10px] text-slate-400 uppercase tracking-wider">Keywords</div>
          <div class="text-2xl font-bold text-sky-600 dark:text-sky-400" x-text="dossierData?.summary?.ranked_keywords_count || 0"></div>
          <div class="text-[11px] text-slate-400">Targeted keywords</div>
        </div>
        <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] p-4 rounded-2xl shadow-sm flex flex-col gap-1">
          <div class="text-[10px] text-slate-400 uppercase tracking-wider">Total Saves</div>
          <div class="text-2xl font-bold text-emerald-600 dark:text-emerald-400" x-text="formatNumber(dossierData?.summary?.total_saves || 0)"></div>
          <div class="text-[11px] text-slate-400">Aggregate saves</div>
        </div>
        <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] p-4 rounded-2xl shadow-sm flex flex-col gap-1">
          <div class="text-[10px] text-slate-400 uppercase tracking-wider">Creators</div>
          <div class="text-2xl font-bold text-purple-600 dark:text-purple-400" x-text="dossierData?.summary?.accounts_count || 0"></div>
          <div class="text-[11px] text-slate-400">Associated accounts</div>
        </div>
      </div>

      <!-- Unified Studio Smart View Switcher & Action Toolbar -->
      <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl p-3.5 shadow-sm flex items-center justify-between flex-wrap gap-3">
        <!-- 3-Way Main Toggle + 2 Secondary Tabs -->
        <div class="flex items-center gap-1.5 flex-wrap">
          <!-- Button 1: Articles / URLs -->
          <button @click="dossierTab = 'urls'"
                  class="px-3 py-1.5 rounded-xl text-xs font-semibold font-mono tabular-nums transition flex items-center gap-1.5"
                  :class="dossierTab === 'urls' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#27272A]'">
            <span x-text="dossierData?.summary?.is_organic_vault ? '📁 Direct Upload Boards' : '🔗 Money Articles'"></span>
            <span class="px-1.5 py-0.2 rounded-full text-[10px] font-bold"
                  :class="dossierTab === 'urls' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'"
                  x-text="filteredDossierArticles().length"></span>
          </button>

          <!-- Button 2: Ranked Pins -->
          <button @click="dossierTab = 'pins'"
                  class="px-3 py-1.5 rounded-xl text-xs font-semibold font-mono tabular-nums transition flex items-center gap-1.5"
                  :class="dossierTab === 'pins' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#27272A]'">
            <span>🎯 Ranked Pins</span>
            <span class="px-1.5 py-0.2 rounded-full text-[10px] font-bold"
                  :class="dossierTab === 'pins' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'"
                  x-text="dossierData?.summary?.total_pins || filteredDossierPins().length"></span>
          </button>

          <!-- Button 3: Keyword Monopoly -->
          <button @click="dossierTab = 'keywords'"
                  class="px-3 py-1.5 rounded-xl text-xs font-semibold font-mono tabular-nums transition flex items-center gap-1.5"
                  :class="dossierTab === 'keywords' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#27272A]'">
            <span>🕸️ Keyword Monopoly</span>
            <span class="px-1.5 py-0.2 rounded-full text-[10px] font-bold"
                  :class="dossierTab === 'keywords' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'"
                  x-text="filteredDossierKeywords().length"></span>
          </button>

          <span class="text-slate-300 dark:text-slate-700 hidden sm:inline">|</span>

          <!-- Button 4: Associated Accounts -->
          <button @click="dossierTab = 'accounts'"
                  class="px-3 py-1.5 rounded-xl text-xs font-semibold font-mono tabular-nums transition flex items-center gap-1.5"
                  :class="dossierTab === 'accounts' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#27272A]'">
            <span>👤 Creators</span>
            <span class="px-1.5 py-0.2 rounded-full text-[10px] font-bold"
                  :class="dossierTab === 'accounts' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'"
                  x-text="dossierData?.accounts?.length || 0"></span>
          </button>

          <!-- Button 5: Visual DNA -->
          <button @click="dossierTab = 'visual_dna'"
                  class="px-3 py-1.5 rounded-xl text-xs font-semibold font-mono tabular-nums transition flex items-center gap-1.5"
                  :class="dossierTab === 'visual_dna' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#27272A]'">
            <span>🧬 Visual DNA</span>
          </button>
        </div>

        <!-- Filter, Sort & 1-Click Copy Actions -->
        <div class="flex items-center gap-2 flex-wrap min-w-0">
          <!-- Instant Search -->
          <div class="relative min-w-[180px] max-w-xs">
            <input type="text"
                   x-model="dossierSearch"
                   placeholder="Search in studio..."
                   class="w-full text-xs font-mono tabular-nums rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#18181B] px-3 py-1.5 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500">
            <template x-if="dossierSearch">
              <button @click="dossierSearch = ''" class="absolute right-2 top-1.5 text-slate-400 hover:text-slate-600 text-xs">✕</button>
            </template>
          </div>

          <!-- Status Filter: All / Active SERP / Displaced -->
          <div class="inline-flex rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#18181B] p-0.5 text-xs font-mono tabular-nums">
            <button @click="dossierStatusFilter = 'all'; dossierPinsPage = 1; dossierArticlesPage = 1"
                    class="px-2.5 py-1 rounded-md transition font-medium"
                    :class="dossierStatusFilter === 'all' ? 'bg-white dark:bg-slate-700 text-sky-600 dark:text-sky-400 shadow-sm font-bold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'">
              All
            </button>
            <button @click="dossierStatusFilter = 'active'; dossierPinsPage = 1; dossierArticlesPage = 1"
                    class="px-2.5 py-1 rounded-md transition font-medium"
                    :class="dossierStatusFilter === 'active' ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm font-bold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'">
              Active SERP
            </button>
            <button @click="dossierStatusFilter = 'displaced'; dossierPinsPage = 1; dossierArticlesPage = 1"
                    class="px-2.5 py-1 rounded-md transition font-medium"
                    :class="dossierStatusFilter === 'displaced' ? 'bg-white dark:bg-slate-700 text-amber-600 dark:text-amber-400 shadow-sm font-bold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'">
              Displaced
            </button>
          </div>

          <!-- Contextual Sort Dropdown -->
          <select x-model="dossierSort"
                  class="text-xs font-mono tabular-nums rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#18181B] px-2.5 py-1.5 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-sky-500">
            <option value="saves">Sort: Highest Saves</option>
            <option value="age_asc">Sort: Newest Pin (Fresh)</option>
            <option value="age_desc">Sort: Oldest Pin (Evergreen)</option>
            <option value="multiplier">Sort: Highest Multiplier</option>
            <option value="rank">Sort: Best SERP Rank</option>
          </select>

          <!-- 1-Click Copy Buttons -->
          <button @click="copyAllArticleUrls()"
                  class="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#18181B] hover:bg-slate-100 dark:hover:bg-[#27272A] text-xs font-mono tabular-nums font-semibold text-slate-700 dark:text-slate-300 transition flex items-center gap-1 shadow-sm"
                  title="Copy all discovered article URLs to clipboard">
            <span>📋</span>
            <span>Copy URLs</span>
          </button>
          <button @click="copyAllKeywords()"
                  class="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#18181B] hover:bg-slate-100 dark:hover:bg-[#27272A] text-xs font-mono tabular-nums font-semibold text-slate-700 dark:text-slate-300 transition flex items-center gap-1 shadow-sm"
                  title="Copy all monopolized keywords to clipboard">
            <span>📋</span>
            <span>Copy Keywords</span>
          </button>
        </div>
      </div>

      <!-- Studio Content Body -->
      <div class="flex flex-col gap-4">
        <!-- Loading State -->
        <template x-if="dossierLoading">
          <div class="py-24 text-center text-slate-400 font-mono tabular-nums flex flex-col items-center justify-center gap-3">
            <span class="animate-spin text-3xl">🔄</span>
            <span class="text-sm">De-obfuscating domain intelligence & 4-pillar data...</span>
          </div>
        </template>

        <!-- Error & Cold Start State -->
        <template x-if="!dossierLoading && !dossierData">
          <div class="py-20 text-center flex flex-col items-center justify-center gap-4 bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl p-8 shadow-sm">
            <div class="w-12 h-12 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center text-2xl font-bold">⚠️</div>
            <div class="flex flex-col gap-1 max-w-md">
              <span class="text-base font-bold text-slate-900 dark:text-white">Dossier Cold-Start or Timed Out</span>
              <span class="text-xs text-slate-500 dark:text-slate-400">The serverless database or background compute may have experienced a cold start while compiling 4-pillar data for <span class="font-mono tabular-nums font-bold text-slate-700 dark:text-slate-300" x-text="dossierDomain"></span>.</span>
            </div>
            <button @click="openDossier(dossierDomain, false, true)"
                    class="px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-mono tabular-nums font-semibold shadow-sm transition flex items-center gap-2">
              <span>🔄</span>
              <span>Retry Loading Dossier</span>
            </button>
          </div>
        </template>

        <!-- Main Studio Tab Views -->
        <template x-if="!dossierLoading && dossierData">
          <div class="flex flex-col gap-4">
              <!-- TAB 1: Ranked Pins -->
              <div x-show="dossierTab === 'pins'" class="space-y-3">
                <template x-for="p in paginatedDossierPins()" :key="p.pin_id">
                  <div :data-pin-id="p.pin_id" class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl p-4 flex items-center justify-between gap-4 shadow-sm hover:border-sky-500/50 transition">
                    <div class="flex items-center gap-3.5 min-w-0">
                      <img :src="p.image_url"
                           referrerpolicy="no-referrer"
                           class="w-14 h-20 rounded-xl object-cover bg-slate-200 dark:bg-slate-700 shrink-0 shadow-sm"
                           loading="lazy"
                           onerror="this.onerror=null; this.style.opacity='0.25'">
                      <div class="flex flex-col min-w-0">
                        <div class="flex items-center gap-2 flex-wrap">
                          <span class="text-sm font-bold text-slate-900 dark:text-white truncate" x-text="p.title"></span>
                          <template x-if="p.is_vulnerable">
                            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold font-mono tabular-nums bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30 shrink-0"
                                  title="Decaying Monopoly: High Saves + Stale Velocity. Vulnerable to Fresh Pin Overhaul!">
                              ⚡ Decaying Monopoly
                            </span>
                          </template>
                          <!-- Pin Age Badge -->
                          <template x-if="getPinAgeBadge(p.created_at_pinterest)">
                            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold font-mono tabular-nums shrink-0"
                                  :class="getPinAgeBadge(p.created_at_pinterest).class"
                                  :title="getPinAgeBadge(p.created_at_pinterest).title"
                                  x-text="getPinAgeBadge(p.created_at_pinterest).label"></span>
                          </template>
                        </div>
                        <div class="flex items-center gap-2 text-xs text-slate-400 font-mono tabular-nums mt-1 flex-wrap">
                          <span x-text="'Pin #' + p.pin_id"></span>
                          <span class="text-slate-300 dark:text-slate-600">•</span>
                          <template x-if="p.creator_username">
                            <a :href="safeUrl('/?competitor=@' + p.creator_username)"
                               target="_blank"
                               class="text-purple-600 dark:text-purple-400 hover:underline"
                               :title="'Inspect creator @' + p.creator_username"
                               x-text="'@' + p.creator_username"></a>
                          </template>
                          <template x-if="!p.creator_username">
                            <span class="text-slate-400">Unknown</span>
                          </template>
                          <span class="text-slate-300 dark:text-slate-600">•</span>
                          <span class="text-emerald-600 dark:text-emerald-400 font-bold" x-text="formatNumber(p.saves) + ' saves'"></span>
                          <template x-if="p.dominant_color">
                            <span class="inline-flex items-center gap-1 text-[10px]">
                              <span>•</span>
                              <span class="w-2.5 h-2.5 rounded-full border border-slate-400/40 inline-block shadow-sm" :style="'background-color: ' + p.dominant_color"></span>
                              <span x-text="p.dominant_color"></span>
                            </span>
                          </template>
                          <template x-if="Array.isArray(p.visual_annotations) && p.visual_annotations.length > 0">
                            <span class="text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[200px]"
                                  :title="(p.visual_annotations || []).map(a => typeof a === 'object' && a !== null ? (a.name || a.tag || '') : String(a || '')).filter(Boolean).join(', ')"
                                  x-text="'• 🏷️ ' + (p.visual_annotations || []).map(a => typeof a === 'object' && a !== null ? (a.name || a.tag || '') : String(a || '')).filter(Boolean).slice(0, 3).join(', ')"></span>
                          </template>
                        </div>
                        <!-- SERP Appearances Badges (Clickable with drilldown) -->
                        <div class="flex items-center gap-1.5 flex-wrap mt-2">
                          <template x-for="app in (p.serp_appearances || []).slice(0, 6)" :key="app.keyword_id">
                            <button @click="filterToKeyword(app.keyword_name)"
                                    class="text-[10px] font-mono tabular-nums px-2 py-0.5 rounded-md bg-sky-500/10 hover:bg-sky-500/20 text-sky-700 dark:text-sky-300 border border-sky-500/20 transition-colors inline-flex items-center gap-1"
                                    :title="'Drilldown to keyword monopoly for ' + app.keyword_name">
                              <span x-text="app.rank_position ? '#' + app.rank_position : 'Displaced'" class="font-bold"></span>
                              <span class="text-slate-500 dark:text-slate-400 truncate max-w-[150px]" x-text="app.keyword_name"></span>
                              <span class="text-[9px]">→</span>
                            </button>
                          </template>
                        </div>
                      </div>
                    </div>

                    <div class="flex items-center gap-2 shrink-0">
                      <a :href="safeUrl('/pin/' + p.pin_id)"
                         target="_blank"
                         class="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-slate-700 dark:text-slate-200 text-xs font-semibold transition font-mono tabular-nums">
                        Inspect ↗
                      </a>
                    </div>
                  </div>
                </template>
                <template x-if="filteredDossierPins().length === 0">
                  <div class="py-12 text-center text-slate-400 font-mono tabular-nums text-xs">No ranked pins matched your search or filters.</div>
                </template>

                <!-- Pins Pagination Controls -->
                <template x-if="totalDossierPinsPages() > 1">
                  <div class="flex items-center justify-between border-t border-slate-200 dark:border-[#27272A] pt-3 px-1 text-xs font-mono tabular-nums">
                    <span class="text-slate-500 dark:text-slate-400">
                      Showing <span class="font-bold text-slate-800 dark:text-slate-200" x-text="((dossierPinsPage - 1) * dossierPinsPerPage) + 1"></span> - <span class="font-bold text-slate-800 dark:text-slate-200" x-text="Math.min(dossierPinsPage * dossierPinsPerPage, filteredDossierPins().length)"></span> of <span class="font-bold text-slate-800 dark:text-slate-200" x-text="filteredDossierPins().length"></span> pins
                    </span>
                    <div class="flex items-center gap-1.5">
                      <button @click="prevDossierPinsPage()"
                              :disabled="dossierPinsPage <= 1"
                              class="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-[#27272A] transition">
                        ← Prev
                      </button>
                      <span class="px-2 py-1 text-slate-600 dark:text-slate-400">
                        Page <span class="font-bold text-slate-900 dark:text-white" x-text="dossierPinsPage"></span> / <span x-text="totalDossierPinsPages()"></span>
                      </span>
                      <button @click="nextDossierPinsPage()"
                              :disabled="dossierPinsPage >= totalDossierPinsPages()"
                              class="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-[#27272A] transition">
                        Next →
                      </button>
                    </div>
                  </div>
                </template>

                <!-- On-Demand Shard Displaced Pins Loader -->
                <template x-if="dossierData?.summary?.displaced_remaining_count > 0">
                  <div class="mt-4 p-4 rounded-2xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 flex items-center justify-between flex-wrap gap-3 font-mono tabular-nums text-xs">
                    <div class="flex items-center gap-2">
                      <span class="text-sky-600 dark:text-sky-400 font-bold">📦 Historical Shard Archive:</span>
                      <span class="text-slate-600 dark:text-slate-300" x-text="formatNumber(dossierData.summary.displaced_remaining_count) + ' additional historical displaced pins are stored in Neon Shards.'"></span>
                    </div>
                    <button @click="loadMoreDisplaced()"
                            :disabled="dossierLoadingMore"
                            class="px-3.5 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold transition flex items-center gap-1.5 shadow-sm disabled:opacity-50">
                      <span :class="{ 'animate-spin': dossierLoadingMore }">🔄</span>
                      <span x-text="dossierLoadingMore ? 'Hydrating Shards...' : 'Load +50 Displaced Pins from Shards'">Load +50 Displaced Pins from Shards</span>
                    </button>
                  </div>
                </template>
              </div>

              <!-- TAB 2: Money Articles & Multipliers -->
              <div x-show="dossierTab === 'urls'" class="space-y-4">
                <template x-for="art in paginatedDossierArticles()" :key="art.clean_slug">
                  <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl p-4 sm:p-5 flex flex-col gap-3 shadow-sm hover:border-sky-500/40 transition">
                    <div class="flex items-start justify-between gap-3">
                      <div class="flex flex-col min-w-0">
                        <div class="flex items-center gap-2 flex-wrap">
                          <span class="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-white truncate" x-text="art.clean_slug === '/' ? 'Root Domain (/)' : art.clean_slug"></span>
                          <button @click="copyToClipboard(art.sample_url || art.clean_slug, 'Copied article URL!')"
                                  class="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-xs px-1.5 py-0.5 rounded hover:bg-slate-100 dark:hover:bg-[#27272A]"
                                  title="Copy URL">
                            📋
                          </button>
                          <a :href="safeUrl(art.sample_url)"
                             target="_blank"
                             rel="noopener noreferrer"
                             class="text-xs text-sky-600 hover:underline shrink-0 font-medium">
                            Open Article ↗
                          </a>
                        </div>
                        <div class="flex items-center gap-2 text-xs font-mono tabular-nums text-slate-400 mt-1 flex-wrap">
                          <!-- Article Pin Age Badge -->
                          <template x-if="getPinAgeBadge(art.created_at_pinterest || art.newest_pin_date)">
                            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold font-mono tabular-nums shrink-0"
                                  :class="getPinAgeBadge(art.created_at_pinterest || art.newest_pin_date).class"
                                  :title="getPinAgeBadge(art.created_at_pinterest || art.newest_pin_date).title"
                                  x-text="getPinAgeBadge(art.created_at_pinterest || art.newest_pin_date).label"></span>
                          </template>
                          <span class="font-bold text-amber-600 dark:text-amber-400" x-text="art.pins_count + ' creative pins'"></span>
                          <span>•</span>
                          <span class="text-emerald-600 dark:text-emerald-400 font-bold" x-text="formatNumber(art.total_saves) + ' saves'"></span>
                          <template x-if="art.best_rank">
                            <span>•</span>
                            <span class="text-sky-600 dark:text-sky-400 font-bold" x-text="'Best Rank #' + art.best_rank"></span>
                          </template>
                          <template x-if="art.is_vulnerable">
                            <span>•</span>
                            <span class="text-rose-600 dark:text-rose-400 font-bold">⚡ Vulnerable</span>
                          </template>
                          <!-- Clickable Keyword Count Drilldown -->
                          <template x-if="(art.keywords || art.target_keywords || []).length > 0">
                            <span class="inline-flex items-center gap-1">
                              <span>•</span>
                              <button @click="filterToArticleKeywords(art)"
                                      class="text-sky-600 dark:text-sky-400 hover:underline font-bold"
                                      :title="'Filter keywords view to this article’s ' + (art.keywords || art.target_keywords).length + ' keywords'"
                                      x-text="(art.keywords || art.target_keywords).length + ' keywords →'"></button>
                            </span>
                          </template>
                        </div>

                        <!-- Targeted Marketing Angles -->
                        <template x-if="Array.isArray(art.angles_targeted) && art.angles_targeted.length > 0">
                          <div class="flex items-center gap-1.5 flex-wrap mt-2">
                            <span class="text-[10px] font-mono tabular-nums text-slate-400 uppercase font-bold">Search Intents:</span>
                            <template x-for="ang in art.angles_targeted" :key="ang">
                              <span class="text-[10px] font-mono tabular-nums px-2 py-0.5 rounded-full bg-slate-100 dark:bg-[#18181B] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#27272A]"
                                    x-text="'🎯 ' + ang"></span>
                            </template>
                          </div>
                        </template>

                        <!-- Cross-View Drilldown Keywords -->
                        <template x-if="Array.isArray(art.target_keywords || art.keywords) && (art.target_keywords || art.keywords).length > 0">
                          <div class="flex items-center gap-1.5 flex-wrap mt-1.5">
                            <span class="text-[10px] font-mono tabular-nums text-slate-400 uppercase font-bold">Keywords:</span>
                            <template x-for="kw in (art.expandedKeywords ? (art.target_keywords || art.keywords) : (art.target_keywords || art.keywords).slice(0, 5))" :key="kw">
                              <button @click="filterToKeyword(kw)"
                                      class="text-[10px] font-mono tabular-nums px-2 py-0.5 rounded-md bg-sky-500/10 hover:bg-sky-500/20 text-sky-700 dark:text-sky-300 border border-sky-500/20 transition flex items-center gap-1"
                                      :title="'Jump to Keyword Monopoly view for ' + kw">
                                <span x-text="kw"></span>
                                <span class="text-[9px]">→</span>
                              </button>
                            </template>
                            <template x-if="(art.target_keywords || art.keywords).length > 5">
                              <button @click="art.expandedKeywords = !art.expandedKeywords"
                                      class="text-[10px] font-mono tabular-nums font-bold px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-slate-600 dark:text-slate-300 transition"
                                      x-text="art.expandedKeywords ? 'Show less' : '+' + ((art.target_keywords || art.keywords).length - 5) + ' more'"></button>
                            </template>
                          </div>
                        </template>
                      </div>
                    </div>

                    <!-- Creative Pin Variations Thumbnails Gallery (Pillar 2) -->
                    <div class="flex flex-col gap-2 pt-2.5 border-t border-slate-100 dark:border-[#27272A]">
                      <div class="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-8 gap-2.5">
                        <template x-for="p in (art.expandedPins ? art.pins : (art.pins || []).slice(0, 6))" :key="p.pin_id">
                          <div class="group relative rounded-xl overflow-hidden border border-slate-200 dark:border-[#27272A] bg-slate-100 dark:bg-[#121215] aspect-[2/3] flex flex-col justify-between">
                            <img :src="p.image_url"
                                 referrerpolicy="no-referrer"
                                 class="w-full h-full object-cover group-hover:scale-105 transition-transform absolute inset-0"
                                 loading="lazy"
                                 onerror="this.onerror=null; this.style.opacity='0.25'">
                            
                            <!-- Top Badges Overlay (Age & Intent) -->
                            <div class="relative z-10 p-1 flex items-start justify-between gap-1 w-full flex-wrap">
                              <template x-if="getPinAgeBadge(p.created_at_pinterest)">
                                <span class="px-1 py-0.2 rounded text-[8px] font-bold font-mono tabular-nums shadow-sm"
                                      :class="getPinAgeBadge(p.created_at_pinterest).class"
                                      :title="getPinAgeBadge(p.created_at_pinterest).title"
                                      x-text="getPinAgeBadge(p.created_at_pinterest).label"></span>
                              </template>
                              <template x-if="p.intent_tag">
                                <div class="px-1 py-0.2 rounded text-[8px] font-bold font-mono tabular-nums bg-black/75 text-amber-300 truncate max-w-[80%] shadow-sm"
                                     x-text="p.intent_tag"></div>
                              </template>
                            </div>

                            <!-- Bottom Rank & Saves Overlay -->
                            <div class="relative z-10 bg-slate-950/85 p-1 text-[9px] font-mono tabular-nums text-white flex items-center justify-between">
                              <a :href="safeUrl('/pin/' + p.pin_id)" target="_blank" class="hover:underline flex items-center gap-0.5">
                                <span x-text="p.best_rank ? '#' + p.best_rank : (p.is_displaced ? 'Displaced' : 'Pin')"></span>
                                <span class="text-[8px]">↗</span>
                              </a>
                              <span class="text-emerald-400 font-bold" x-text="p.saves + 's'"></span>
                            </div>
                          </div>
                        </template>
                      </div>

                      <!-- Expander Button if > 6 pins -->
                      <template x-if="(art.pins || []).length > 6">
                        <div class="flex justify-end">
                          <button @click="art.expandedPins = !art.expandedPins"
                                  class="text-[11px] font-mono tabular-nums font-semibold px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 hover:bg-slate-100 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-sky-600 dark:text-sky-400 transition flex items-center gap-1">
                            <span x-text="art.expandedPins ? 'Collapse to top 6 pins ↑' : 'View all ' + art.pins.length + ' creative variations (' + (art.pins.length - 6) + ' more) ↓'"></span>
                          </button>
                        </div>
                      </template>
                    </div>
                  </div>
                </template>
                <template x-if="filteredDossierArticles().length === 0">
                  <div class="py-12 text-center text-slate-400 font-mono tabular-nums text-xs">No articles matched your search or filters.</div>
                </template>

                <!-- Articles Pagination Controls -->
                <template x-if="totalDossierArticlesPages() > 1">
                  <div class="flex items-center justify-between border-t border-slate-200 dark:border-[#27272A] pt-3 px-1 text-xs font-mono tabular-nums">
                    <span class="text-slate-500 dark:text-slate-400">
                      Showing <span class="font-bold text-slate-800 dark:text-slate-200" x-text="((dossierArticlesPage - 1) * dossierArticlesPerPage) + 1"></span> - <span class="font-bold text-slate-800 dark:text-slate-200" x-text="Math.min(dossierArticlesPage * dossierArticlesPerPage, filteredDossierArticles().length)"></span> of <span class="font-bold text-slate-800 dark:text-slate-200" x-text="filteredDossierArticles().length"></span> articles
                    </span>
                    <div class="flex items-center gap-1.5">
                      <button @click="prevDossierArticlesPage()"
                              :disabled="dossierArticlesPage <= 1"
                              class="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-[#27272A] transition">
                        ← Prev
                      </button>
                      <span class="px-2 py-1 text-slate-600 dark:text-slate-400">
                        Page <span class="font-bold text-slate-900 dark:text-white" x-text="dossierArticlesPage"></span> / <span x-text="totalDossierArticlesPages()"></span>
                      </span>
                      <button @click="nextDossierArticlesPage()"
                              :disabled="dossierArticlesPage >= totalDossierArticlesPages()"
                              class="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-[#27272A] transition">
                        Next →
                      </button>
                    </div>
                  </div>
                </template>
              </div>

              <!-- TAB 3: Keyword Monopoly Matrix -->
              <div x-show="dossierTab === 'keywords' || dossierTab === 'monopoly'" class="space-y-3">
                <template x-for="kw in filteredDossierKeywords()" :key="kw.keyword_id">
                  <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl p-4 flex flex-col gap-2.5 shadow-sm hover:border-sky-500/40 transition">
                    <div class="flex items-start justify-between gap-3">
                      <div class="flex flex-col min-w-0">
                        <div class="flex items-center gap-2 flex-wrap">
                          <span class="text-sm font-bold text-slate-900 dark:text-white" x-text="kw.keyword_name"></span>
                          <a :href="safeUrl('/keywords/' + encodeURIComponent(kw.keyword_name))"
                             target="_blank"
                             class="text-[11px] text-sky-600 hover:underline font-mono tabular-nums">
                            SERP Radar ↗
                          </a>
                          <!-- Strategy Badge (Pillar 1) -->
                          <template x-if="kw.strategy === 'URL_FLOODING'">
                            <span class="text-[10px] font-mono tabular-nums px-2 py-0.5 rounded-full font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30"
                                  title="URL Creative Flooding: The competitor launched multiple creative pins pointing to the exact same article!">
                              💣 URL Flooding (1 Article, Multi-Pin)
                            </span>
                          </template>
                          <template x-if="kw.strategy === 'TOPIC_CLUSTER'">
                            <span class="text-[10px] font-mono tabular-nums px-2 py-0.5 rounded-full font-bold bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30"
                                  title="Topic Cluster: The competitor dominates this keyword through distinct specialized articles!">
                              🌳 Topic Cluster (<span x-text="kw.unique_urls_count"></span> Articles)
                            </span>
                          </template>
                          <template x-if="kw.strategy === 'HYBRID_FLOODING'">
                            <span class="text-[10px] font-mono tabular-nums px-2 py-0.5 rounded-full font-bold bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30">
                              ⚡ Hybrid Domination
                            </span>
                          </template>
                          <!-- Decaying Monopoly Warning (Pillar 5) -->
                          <template x-if="kw.is_decaying_monopoly">
                            <span class="text-[10px] font-mono tabular-nums px-2 py-0.5 rounded font-bold bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30"
                                  title="Decaying Monopoly: Competitor holds top slots with stagnant velocity. High vulnerability to fresh pin takeover!">
                              ⚡ Decaying Monopoly (Vulnerable)
                            </span>
                          </template>
                        </div>

                        <!-- Slot Positions -->
                        <div class="flex items-center gap-1.5 mt-2 flex-wrap">
                          <span class="text-[10px] font-mono tabular-nums font-bold text-slate-500 uppercase">Positions:</span>
                          <template x-for="r in kw.ranks" :key="r">
                            <span class="text-[10px] font-mono tabular-nums font-bold px-2 py-0.5 rounded"
                                  :class="r <= 3 ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30' : (r <= 10 ? 'bg-sky-500/15 text-sky-700 dark:text-sky-400 border border-sky-500/30' : 'bg-slate-100 dark:bg-[#18181B] text-slate-700 dark:text-slate-300')"
                                  x-text="'#' + r"></span>
                          </template>
                        </div>
                      </div>

                      <div class="flex flex-col items-end shrink-0 font-mono tabular-nums text-xs">
                        <span class="font-bold text-sky-600 dark:text-sky-400" x-text="kw.active_slots + ' slots (' + kw.serp_share_pct + '% SERP)'"></span>
                        <span class="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold" x-text="formatNumber(kw.total_saves) + ' saves'"></span>
                      </div>
                    </div>

                    <!-- Top Slot Traffic Attribution with Cross-View Drilldown -->
                    <template x-if="kw.top_slot_attribution">
                      <div class="pt-2 border-t border-slate-100 dark:border-[#27272A] text-[11px] font-mono tabular-nums text-slate-500 flex items-center justify-between flex-wrap gap-2">
                        <div class="flex items-center gap-1.5 min-w-0">
                          <span class="font-bold text-amber-600 dark:text-amber-400">🏆 Top Slot Driver:</span>
                          <span class="font-bold text-slate-800 dark:text-slate-200" x-text="'Rank #' + kw.top_slot_attribution.rank_position"></span>
                          <button @click="filterToArticle(kw.top_slot_attribution.clean_slug || kw.top_slot_attribution.title)"
                                  class="text-sky-600 dark:text-sky-400 hover:underline truncate max-w-[280px] flex items-center gap-1"
                                  :title="'Jump to Article: ' + kw.top_slot_attribution.title">
                            <span x-text="'(' + kw.top_slot_attribution.title + ')'"></span>
                            <span>→</span>
                          </button>
                        </div>
                        <span class="font-bold text-emerald-600 dark:text-emerald-400" x-text="formatNumber(kw.top_slot_attribution.saves) + ' saves (' + Math.round((kw.top_slot_attribution.saves / Math.max(1, kw.total_saves)) * 100) + '%)'"></span>
                      </div>
                    </template>
                  </div>
                </template>
                <template x-if="filteredDossierKeywords().length === 0">
                  <div class="py-12 text-center text-slate-400 font-mono tabular-nums text-xs">No keywords matched your search or filters.</div>
                </template>
              </div>

              <!-- TAB 4: Associated Pinterest Accounts -->
              <div x-show="dossierTab === 'accounts'" class="space-y-3">
                <template x-for="acc in (dossierData.accounts || [])" :key="acc.username">
                  <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl p-4 flex flex-col gap-3 shadow-sm">
                    <div class="flex items-center justify-between gap-3">
                      <div class="flex items-center gap-3.5 min-w-0">
                        <div class="w-10 h-10 rounded-2xl flex items-center justify-center font-bold font-mono tabular-nums text-sm shrink-0"
                             :class="acc.role === 'PRIMARY_BRAND' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30' : 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30'">
                          <span x-text="acc.role === 'PRIMARY_BRAND' ? '👑' : '@'"></span>
                        </div>
                        <div class="flex flex-col min-w-0">
                          <div class="flex items-center gap-2 flex-wrap">
                            <a :href="safeUrl('https://pinterest.com/' + acc.username)"
                               target="_blank"
                               rel="noopener noreferrer"
                               class="text-sm font-bold text-slate-900 dark:text-white hover:text-sky-600 transition truncate"
                               x-text="'@' + acc.username"></a>
                            <span class="text-[10px] font-mono tabular-nums px-2 py-0.5 rounded-full font-bold"
                                  :class="acc.role === 'PRIMARY_BRAND' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30' : 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30'"
                                  x-text="acc.role === 'PRIMARY_BRAND' ? '👑 Primary Brand Account' : '🛰️ Satellite / Ghost Creator'"></span>
                          </div>
                          <div class="flex items-center gap-2 text-xs text-slate-400 font-mono tabular-nums mt-1">
                            <span x-text="acc.pins_count + ' pins linked'"></span>
                            <span>•</span>
                            <span class="text-sky-600 dark:text-sky-400 font-bold" x-text="acc.top10_count + ' top-10 slots'"></span>
                          </div>
                        </div>
                      </div>

                      <div class="flex items-center gap-3 shrink-0">
                        <div class="text-right font-mono tabular-nums text-xs">
                          <div class="font-bold text-emerald-600 dark:text-emerald-400 text-sm" x-text="formatNumber(acc.total_saves)"></div>
                          <div class="text-[10px] text-slate-400">total saves</div>
                        </div>
                        <a :href="safeUrl('/?tab=competitors&action=track&creator=' + encodeURIComponent(acc.username))"
                           target="_blank"
                           class="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-sm transition font-mono tabular-nums">
                          + Track
                        </a>
                      </div>
                    </div>

                    <!-- Cross-Domain Sybil Footprint (Pillar 4) -->
                    <template x-if="Array.isArray(acc.sister_domains) && acc.sister_domains.length > 0">
                      <div class="pt-2 border-t border-slate-100 dark:border-[#27272A] flex items-center gap-1.5 flex-wrap text-xs font-mono tabular-nums">
                        <span class="text-amber-600 dark:text-amber-400 font-bold">⚠️ Sybil Sister Domains Fingerprint:</span>
                        <template x-for="sd in acc.sister_domains" :key="sd.domain">
                          <span class="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/20"
                                x-text="sd.domain + ' (' + sd.pins_count + ' pins)'"></span>
                        </template>
                      </div>
                    </template>
                  </div>
                </template>
              </div>


              <!-- TAB 6: Visual DNA & Computer Vision Reverse-Engineering -->
              <div x-show="dossierTab === 'visual_dna'" class="space-y-4 font-sans">
                <!-- Top Overview Card -->
                <div class="bg-white dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A]/80 rounded-2xl p-4 shadow-sm flex flex-col gap-3">
                  <div class="flex items-center gap-2">
                    <span class="text-xl">🧬</span>
                    <div>
                      <h3 class="text-sm font-bold text-slate-900 dark:text-white">Reverse-Engineered Visual DNA</h3>
                      <p class="text-[11px] text-slate-400">Pinterest Computer Vision annotations cloud, dominant color palette & winning design signals</p>
                    </div>
                  </div>

                  <!-- Visual Tags Cloud -->
                  <div class="pt-2 border-t border-slate-100 dark:border-[#27272A]/60">
                    <div class="flex items-center justify-between mb-2">
                      <span class="text-[11px] font-bold uppercase tracking-wider font-mono tabular-nums text-slate-700 dark:text-slate-300">
                        🏷️ Top Computer Vision Object Annotations (AI Eye)
                      </span>
                      <span class="text-[10px] text-slate-400 font-mono tabular-nums">Elements Pinterest AI identifies in images</span>
                    </div>
                    <div class="flex items-center gap-2 flex-wrap">
                      <template x-for="t in (dossierData?.visual_dna?.visual_tags_cloud || [])" :key="typeof t.tag === 'object' && t.tag !== null ? (t.tag.name || t.tag.tag || '') : t.tag">
                        <span class="px-2.5 py-1 rounded-lg text-xs font-mono tabular-nums font-medium bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/20 flex items-center gap-1.5 shadow-sm">
                          <span x-text="typeof t.tag === 'object' && t.tag !== null ? (t.tag.name || t.tag.tag || '') : t.tag"></span>
                          <span class="px-1.5 py-0.2 rounded-full bg-sky-500/20 text-[9px] font-bold" x-text="t.count + 'x'"></span>
                        </span>
                      </template>
                      <template x-if="!dossierData?.visual_dna?.visual_tags_cloud?.length">
                        <span class="text-xs text-slate-400 italic">No visual annotations indexed yet for this domain.</span>
                      </template>
                    </div>
                  </div>

                  <!-- Dominant Color Palette -->
                  <div class="pt-3 border-t border-slate-100 dark:border-[#27272A]/60">
                    <div class="flex items-center justify-between mb-2">
                      <span class="text-[11px] font-bold uppercase tracking-wider font-mono tabular-nums text-slate-700 dark:text-slate-300">
                        🎨 Dominant Color Palette Distribution
                      </span>
                      <span class="text-[10px] text-slate-400 font-mono tabular-nums">HEX color breakdown across creative pins</span>
                    </div>
                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono tabular-nums text-xs">
                      <template x-for="col in (dossierData?.visual_dna?.dominant_colors_palette || [])" :key="col.color">
                        <div class="p-2.5 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#121215]/60 flex items-center gap-3">
                          <span class="w-7 h-7 rounded-lg border border-slate-300 dark:border-slate-600 shrink-0 shadow-sm" :style="'background-color: ' + col.color"></span>
                          <div class="flex flex-col min-w-0">
                            <span class="font-bold text-slate-800 dark:text-slate-200 uppercase truncate" x-text="col.color"></span>
                            <span class="text-[10px] text-slate-400" x-text="col.count + ' pins (' + col.percentage + '%)'"></span>
                          </div>
                        </div>
                      </template>
                    </div>
                  </div>

                  <!-- High-Converting Title Keywords -->
                  <div class="pt-3 border-t border-slate-100 dark:border-[#27272A]/60">
                    <div class="flex items-center justify-between mb-2">
                      <span class="text-[11px] font-bold uppercase tracking-wider font-mono tabular-nums text-slate-700 dark:text-slate-300">
                        ✍️ Winning SEO Title Semantic Keywords
                      </span>
                      <span class="text-[10px] text-slate-400 font-mono tabular-nums">Most frequent high-CTR title tokens</span>
                    </div>
                    <div class="flex items-center gap-1.5 flex-wrap">
                      <template x-for="w in (dossierData?.visual_dna?.top_title_keywords || [])" :key="w.word">
                        <span class="px-2 py-0.5 rounded-md text-[11px] font-mono tabular-nums font-bold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
                          <span x-text="w.word"></span>
                          <span class="text-[9px] text-amber-500 font-normal" x-text="'(' + w.count + ')'"></span>
                        </span>
                      </template>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </template>
      </div>

    </div>
    <!-- END DEDICATED FULL-PAGE DOMAIN INTELLIGENCE STUDIO VIEW -->

  </main>

  <!-- TACTICAL ARBITRAGE ATTACK BLUEPRINT MODAL (PILLAR 6) -->
  <div x-show="isBlueprintModalOpen"
       x-cloak
       class="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 sm:p-6"
       @keydown.escape.window="closeBlueprintModal()">
    <!-- Backdrop -->
    <div x-show="isBlueprintModalOpen"
         x-transition:enter="ease-out duration-200"
         x-transition:enter-start="opacity-0"
         x-transition:enter-end="opacity-100"
         x-transition:leave="ease-in duration-150"
         x-transition:leave-start="opacity-100"
         x-transition:leave-end="opacity-0"
         class="fixed inset-0 bg-slate-950/80 backdrop-blur-sm"
         @click="closeBlueprintModal()"></div>

    <!-- Modal Panel -->
    <div x-show="isBlueprintModalOpen"
         x-transition:enter="ease-out duration-300"
         x-transition:enter-start="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
         x-transition:enter-end="opacity-100 translate-y-0 sm:scale-100"
         x-transition:leave="ease-in duration-200"
         x-transition:leave-start="opacity-100 translate-y-0 sm:scale-100"
         x-transition:leave-end="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
         class="relative bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-3xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden z-10">

      <!-- Modal Header -->
      <div class="px-6 py-4 border-b border-slate-200 dark:border-[#27272A] bg-slate-50/80 dark:bg-[#09090B]/50 flex items-center justify-between gap-4">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500 to-rose-600 flex items-center justify-center text-white text-lg font-bold shadow-md shadow-rose-500/20">
            ⚡
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h2 class="text-base font-bold text-slate-900 dark:text-white font-mono tabular-nums" x-text="blueprintData?.domain || 'Generating Blueprint...'"></h2>
              <span class="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono tabular-nums bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30">
                Arbitrage Attack Plan
              </span>
            </div>
            <p class="text-xs text-slate-500 dark:text-slate-400">Algorithmic competitive blueprint: clone & outrank top money articles</p>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <button @click="copyBlueprintMarkdown()"
                  :disabled="!blueprintData"
                  class="px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold font-mono tabular-nums transition flex items-center gap-1.5 shadow-sm disabled:opacity-50">
            <span>📋</span>
            <span>Copy Markdown</span>
          </button>
          <button @click="exportBlueprintJson()"
                  :disabled="!blueprintData"
                  class="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-slate-700 dark:text-slate-200 text-xs font-semibold font-mono tabular-nums transition flex items-center gap-1.5 border border-slate-200 dark:border-[#27272A] disabled:opacity-50">
            <span>📥</span>
            <span>JSON</span>
          </button>
          <button @click="closeBlueprintModal()"
                  class="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center justify-center text-sm font-bold transition">
            ✕
          </button>
        </div>
      </div>

      <!-- Modal Body -->
      <div class="p-6 overflow-y-auto space-y-5">
        <!-- Loading -->
        <template x-if="blueprintLoading">
          <div class="py-20 text-center text-slate-400 font-mono tabular-nums flex flex-col items-center justify-center gap-2">
            <span class="animate-spin text-2xl">⚡</span>
            <span>Computing 6-Pillar Arbitrage Attack Blueprint...</span>
          </div>
        </template>

        <template x-if="!blueprintLoading && blueprintData">
          <div class="space-y-5 font-sans">
            <!-- 1. Top Target Articles (Pillar 6 & Pillar 2) -->
            <div class="bg-slate-50 dark:bg-[#09090B]/60 border border-slate-200 dark:border-[#27272A] rounded-2xl p-4 space-y-3">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="text-base">🎯</span>
                  <h3 class="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white font-mono tabular-nums">1. Top Target Articles to Clone & Outrank</h3>
                </div>
                <span class="text-[11px] text-slate-400 font-mono tabular-nums">Ranked by traffic velocity and monopoly slots</span>
              </div>

              <div class="space-y-2.5">
                <template x-for="art in blueprintData.top_articles" :key="art.slug">
                  <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-xl p-3 flex flex-col gap-2 shadow-sm">
                    <div class="flex items-start justify-between gap-3">
                      <div class="flex items-center gap-2 flex-wrap min-w-0">
                        <span class="w-5 h-5 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 font-mono tabular-nums text-[11px] font-bold flex items-center justify-center" x-text="art.priority"></span>
                        <span class="font-mono tabular-nums text-xs font-bold text-slate-900 dark:text-white truncate" x-text="art.slug"></span>
                        <template x-if="art.is_vulnerable">
                          <span class="px-1.5 py-0.2 rounded text-[9px] font-bold font-mono tabular-nums bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30">
                            ⚡ CRITICAL VULNERABLE
                          </span>
                        </template>
                      </div>
                      <div class="flex items-center gap-3 shrink-0 font-mono tabular-nums text-xs">
                        <span class="text-emerald-600 dark:text-emerald-400 font-bold" x-text="formatNumber(art.total_saves) + ' saves'"></span>
                        <span class="text-sky-600 dark:text-sky-400 font-bold" x-text="'#' + art.best_rank"></span>
                      </div>
                    </div>

                    <div class="flex items-center justify-between gap-2 flex-wrap text-[11px] pt-1 border-t border-slate-100 dark:border-[#27272A]">
                      <div class="flex items-center gap-1.5 flex-wrap">
                        <span class="text-slate-400 font-mono tabular-nums">Keywords:</span>
                        <template x-for="kw in art.target_keywords" :key="kw">
                          <span class="px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-700 dark:text-sky-300 font-mono tabular-nums text-[10px]" x-text="kw"></span>
                        </template>
                      </div>
                      <div class="flex items-center gap-1.5 flex-wrap">
                        <span class="text-slate-400 font-mono tabular-nums">Angle Used:</span>
                        <template x-for="ang in art.angles_used_by_competitor" :key="ang">
                          <span class="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#18181B] text-slate-700 dark:text-slate-300 font-mono tabular-nums text-[10px]" x-text="ang"></span>
                        </template>
                      </div>
                    </div>
                  </div>
                </template>
              </div>
            </div>

            <!-- 2. Winning Title Formulas & Visual Tags (Pillars 3 & 6) -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <!-- Title Blueprints -->
              <div class="bg-slate-50 dark:bg-[#09090B]/60 border border-slate-200 dark:border-[#27272A] rounded-2xl p-4 space-y-2.5">
                <div class="flex items-center gap-2">
                  <span class="text-base">✍️</span>
                  <h3 class="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white font-mono tabular-nums">2. Winning Title Blueprint Formulas</h3>
                </div>
                <div class="space-y-2">
                  <template x-for="(t, idx) in blueprintData.title_blueprints" :key="idx">
                    <div class="p-2.5 rounded-xl bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] font-mono tabular-nums text-xs flex items-center justify-between gap-2 shadow-sm">
                      <span class="text-slate-800 dark:text-slate-200" x-text="t"></span>
                      <button @click="copyToClipboard(t, 'Copied title formula!')" class="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-xs">📋</button>
                    </div>
                  </template>
                </div>
              </div>

              <!-- Computer Vision Tags -->
              <div class="bg-slate-50 dark:bg-[#09090B]/60 border border-slate-200 dark:border-[#27272A] rounded-2xl p-4 space-y-2.5">
                <div class="flex items-center gap-2">
                  <span class="text-base">🧬</span>
                  <h3 class="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white font-mono tabular-nums">3. Pinterest Computer Vision Targets</h3>
                </div>
                <div class="flex items-center gap-1.5 flex-wrap">
                  <template x-for="tag in blueprintData.visual_tags_checklist" :key="tag.tag">
                    <span class="px-2 py-1 rounded-lg bg-sky-500/10 text-sky-700 dark:text-sky-300 font-mono tabular-nums text-xs border border-sky-500/20 flex items-center gap-1 shadow-sm">
                      <span x-text="tag.tag"></span>
                      <span class="text-[9px] text-sky-500" x-text="'(' + tag.count + 'x)'"></span>
                    </span>
                  </template>
                </div>
              </div>
            </div>

            <!-- 3. Deployment Multiplier Strategy (Pillar 2 & 5) -->
            <div class="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 font-mono tabular-nums text-xs text-amber-900 dark:text-amber-300 space-y-2">
              <div class="font-bold flex items-center gap-2">
                <span>🚀</span>
                <span>Recommended 3-Pin Multiplier Strategy:</span>
              </div>
              <ul class="space-y-1 text-[11px] list-disc list-inside">
                <li><strong>Pin 1 (Speed & Convenience):</strong> 15-Minute Easy Prep angle targeting time-constrained searchers.</li>
                <li><strong>Pin 2 (Dietary Modification):</strong> Healthy/Keto/Low-Carb angle capturing specialized dietary intent.</li>
                <li><strong>Pin 3 (Family & Budget):</strong> Family-friendly crowd-pleaser / bulk meal-prep angle.</li>
              </ul>
            </div>
          </div>
        </template>
      </div>

    </div>
  </div>

  <!-- Client-Side Application Script -->
  <script>
    function domainsApp(initialDomain = '', scopedFolderId = '') {
      return {
        scopedFolderId: scopedFolderId || '',
        activeFolderId: scopedFolderId || '',
        activeFolder: null,
        crossoverData: null,
        actionsOpen: false,
        pinnedDomains: new Set(),
        pinnedOnly: false,
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
        isDark: (() => {
          try {
            return typeof localStorage !== 'undefined' ? localStorage.getItem('pa_theme') !== 'light' : false;
          } catch (_) { return false; }
        })(),
        darkMode: (() => {
          try {
            return typeof localStorage !== 'undefined' ? localStorage.getItem('pa_theme') !== 'light' : false;
          } catch (_) { return false; }
        })(),
        loading: false,
        refreshingRollup: false,
        domains: [],
        overview: {
          total_domains: 0,
          top5_monopoly_pct: 0,
          baby_giants_count: 0,
          multi_account_count: 0,
          avg_pins_per_url: 1.0
        },
        folders: [],
        totalDomains: 0,
        currentPage: 1,
        totalPages: 1,
        limit: 50,

        // Filters
        searchQuery: '',
        selectedFolderId: scopedFolderId || '',
        selectedPillar: 'all',
        activePreset: 'all',
        selectedAdNetwork: 'all',
        ageFilter: 'all',
        rankFilter: 'all',
        savesFilter: 'all',
        sizeFilter: 'all',
        logicMode: 'and',
        sortBy: 'visibility',
        excludeMarketplaces: true,

        // Deep Dossier Studio State (Dedicated Full-Page Route /domains/:domain)
        isDossierOpen: Boolean(initialDomain),
        dossierDomain: initialDomain || '',
        dossierLoading: false,
        dossierData: null,
        dossierTab: 'urls', // 'urls' | 'pins' | 'keywords' | 'accounts' | 'visual_dna'
        dossierSearch: '',
        dossierSort: 'saves',
        dossierStatusFilter: 'all', // 'all' | 'active' | 'displaced'
        dossierPinsPage: 1,
        dossierPinsPerPage: 25,
        dossierArticlesPage: 1,
        dossierArticlesPerPage: 10,
        currentDisplacedLimit: 30,
        dossierLoadingMore: false,

        // Arbitrage Attack Blueprint Modal State (Pillar 6)
        isBlueprintModalOpen: false,
        blueprintLoading: false,
        blueprintData: null,

        // Age & Ad Verification & Batch Progress State
        enrichingDomains: {},
        enrichingAds: {},
        batchEnriching: false,
        batchProgress: { done: 0, total: 0 },
        globalEnriching: false,
        globalStats: {
          total_domains: 0,
          checked_domains: 0,
          resolved_domains: 0,
          failed_domains: 0,
          unchecked_domains: 0,
          percent_complete: 0
        },
        globalAdsEnriching: false,
        globalAdsStats: {
          total_domains: 0,
          checked_domains: 0,
          total_checked: 0,
          unchecked_domains: 0,
          percent_complete: 0,
          raptive_count: 0,
          mediavine_count: 0,
          journey_count: 0,
          ezoic_count: 0,
          hbagency_count: 0,
          monumetric_count: 0,
          shemedia_count: 0,
          freestar_count: 0,
          playwire_count: 0,
          snigel_count: 0,
          adsense_count: 0,
          affiliate_count: 0,
          protected_count: 0,
          failed_count: 0,
          switched_count: 0
        },
        batchAdsEnriching: false,
        batchAdsProgress: { done: 0, total: 0 },

        toasts: [],
        loadError: null,

        init() {
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
          if (this.scopedFolderId) {
            this.selectedFolderId = String(this.scopedFolderId);
            this.fetchPinnedDomains();
            (async () => {
              try {
                const res = await (window.safeApiFetch || fetch)('/api/folders/' + encodeURIComponent(this.scopedFolderId));
                if (res.ok) {
                  const data = await res.json();
                  if (data?.folder) this.activeFolder = data.folder;
                  else if (data?.id) this.activeFolder = data;
                }
              } catch (_) {}
            })();
          }
          this.fetchFolders();
          this.loadDomains();
          // Defer heavy database-wide aggregations to background idle so leaderboard query gets 100% database priority
          setTimeout(() => {
            this.fetchGlobalEnrichStatus();
            this.fetchGlobalAdsStatus();
          }, 1500);

          // Sync Dedicated Full-Page Route & Browser History
          // [INVARIANT: FOLDER-SCOPED-POPSTATE-PRESERVATION]
          if (typeof window !== 'undefined') {
            window.addEventListener('popstate', (e) => {
              const stateDomain = e.state?.domain;
              const pathMatch = window.location.pathname.match(/(?:\\/folders\\/[^/]+)?\\/(?:keywords\\/)?domains\\/([^/?#]+)/);
              const urlDomain = pathMatch ? decodeURIComponent(pathMatch[1]) : '';
              const target = stateDomain || urlDomain;
              if (target) {
                this.openDossier(target, false);
              } else {
                this.closeDossier(false);
              }
            });

            if (this.dossierDomain) {
              this.openDossier(this.dossierDomain, false);
            } else {
              const pathMatch = window.location.pathname.match(/(?:\\/folders\\/[^/]+)?\\/(?:keywords\\/)?domains\\/([^/?#]+)/);
              if (pathMatch && pathMatch[1]) {
                this.openDossier(decodeURIComponent(pathMatch[1]), false);
              }
            }
          }
        },

        toggleTheme() {
          this.darkMode = !this.darkMode;
          this.isDark = this.darkMode;
          try {
            if (this.darkMode) {
              if (typeof document !== 'undefined' && document.documentElement) {
                document.documentElement.classList.add('dark');
              }
              if (typeof localStorage !== 'undefined') {
                localStorage.setItem('pa_theme', 'dark');
                localStorage.setItem('pin_theme', 'dark');
              }
            } else {
              if (typeof document !== 'undefined' && document.documentElement) {
                document.documentElement.classList.remove('dark');
              }
              if (typeof localStorage !== 'undefined') {
                localStorage.setItem('pa_theme', 'light');
                localStorage.setItem('pin_theme', 'light');
              }
            }
          } catch (_) {}
        },

        toggleDarkMode() {
          this.toggleTheme();
        },

        showToast(message, type = 'info') {
          const id = Date.now() + Math.random();
          this.toasts.push({ id, message, type });
          setTimeout(() => this.removeToast(id), 4000);
        },

        removeToast(id) {
          this.toasts = this.toasts.filter(t => t.id !== id);
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

        formatNumber(num) {
          if (num === null || num === undefined) return '0';
          const n = Number(num);
          if (isNaN(n)) return '0';
          return n.toLocaleString();
        },

        async fetchFolders() {
          try {
            const res = await (window.safeApiFetch || fetch)('/api/folders');
            if (res.ok) {
              const data = await res.json();
              this.folders = Array.isArray(data.folders) ? data.folders : (Array.isArray(data) ? data : []);
              if (this.scopedFolderId) {
                this.selectedFolderId = String(this.scopedFolderId);
                const matched = this.folders.find(f => String(f.id) === String(this.scopedFolderId));
                if (matched) this.activeFolder = matched;
              }
            }
          } catch (_) {}
        },

        async loadDomains(resetPage = false, forceRefresh = false) {
          if (resetPage) this.currentPage = 1;
          this.loading = true;
          this.loadError = null;

          const params = new URLSearchParams({
            page: String(this.currentPage),
            limit: String(this.limit),
            sort: this.sortBy,
            preset: this.activePreset,
            pillar: this.selectedPillar,
            exclude_marketplaces: String(this.excludeMarketplaces)
          });

          // [INVARIANT: CACHE-BUSTED-DOMAIN-LOAD] Guarantee fresh reads on manual refreshes
          if (forceRefresh) {
            params.set('refresh', 'true');
            params.set('_t', Date.now().toString());
          }

          if (this.searchQuery.trim()) {
            params.set('search', this.searchQuery.trim());
          }
          if (this.selectedFolderId) {
            params.set('folder_id', this.selectedFolderId);
          }
          if (this.pinnedOnly) {
            params.set('pinned_only', 'true');
          }
          if (this.selectedAdNetwork && this.selectedAdNetwork !== 'all') {
            params.set('ad_network', this.selectedAdNetwork);
          }
          if (this.ageFilter && this.ageFilter !== 'all') {
            params.set('age_filter', this.ageFilter);
          }
          if (this.rankFilter && this.rankFilter !== 'all') {
            params.set('rank_filter', this.rankFilter);
          }
          if (this.savesFilter && this.savesFilter !== 'all') {
            params.set('saves_filter', this.savesFilter);
          }
          if (this.sizeFilter && this.sizeFilter !== 'all') {
            params.set('size_filter', this.sizeFilter);
          }
          if (this.logicMode) {
            params.set('logic_mode', this.logicMode);
          }

          try {
            const fetchFn = window.safeApiFetch || fetch;
            const res = await fetchFn('/api/domains?' + params.toString(), {
              timeout: 18000,
              cache: forceRefresh ? 'no-store' : 'default',
              headers: { 'Accept': 'application/json' }
            });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            if (data.success === false) throw new Error(data.error || 'Server error');

            let rawDomains = Array.isArray(data.domains) ? data.domains : [];
            if (this.pinnedOnly && this.pinnedDomains.size > 0) {
              rawDomains = rawDomains.filter(d => this.pinnedDomains.has((d.domain || '').toLowerCase()));
            }
            this.domains = rawDomains;
            this.overview = data.overview || this.overview;
            this.totalDomains = data.total || (data.overview?.total_domains || 0);
            this.totalPages = data.total_pages || Math.max(1, Math.ceil(this.totalDomains / this.limit));
          } catch (err) {
            console.error('[DomainRadar] loadDomains error:', err);
            this.loadError = err.message || 'Failed to connect to domain intelligence';
            this.showToast('Failed to load domains: ' + err.message, 'error');
          } finally {
            this.loading = false;
          }
        },

        async refreshDomains() {
          if (this.refreshingRollup) return;
          this.refreshingRollup = true;
          this.showToast('Re-aggregating domain intelligence from live rankings...', 'info');
          try {
            const fetchFn = window.safeApiFetch || fetch;
            const res = await fetchFn('/api/domains/refresh-rollup', {
              method: 'POST',
              headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }
            }).catch(() => null);
            if (res && !res.ok) {
              console.warn('[DomainRadar] refresh-rollup returned HTTP ' + res.status);
            }
            await this.loadDomains(true, true);
            this.showToast('Domain intelligence refreshed successfully!', 'success');
          } catch (e) {
            console.error('[DomainRadar] refreshDomains error:', e);
            await this.loadDomains(true, true);
          } finally {
            this.refreshingRollup = false;
          }
        },

        setPreset(preset) {
          this.activePreset = preset;
          if (preset === 'all') {
            this.ageFilter = 'all';
            this.rankFilter = 'all';
            this.savesFilter = 'all';
            this.sizeFilter = 'all';
          }
          this.loadDomains(true);
        },

        setLogicMode(mode) {
          this.logicMode = mode === 'or' ? 'or' : 'and';
          this.loadDomains(true);
        },

        applyModularFilter() {
          // If the user customizes modular filters, release any conflicting preset lock so modular AND/OR rules govern freely
          if (this.activePreset !== 'all') {
            this.activePreset = 'all';
          }
          this.loadDomains(true);
        },

        hasActiveFilters() {
          return (
            this.activePreset !== 'all' ||
            this.pinnedOnly ||
            this.ageFilter !== 'all' ||
            this.rankFilter !== 'all' ||
            this.savesFilter !== 'all' ||
            this.sizeFilter !== 'all' ||
            this.selectedAdNetwork !== 'all' ||
            this.selectedPillar !== 'all' ||
            Boolean(this.selectedFolderId && this.selectedFolderId !== this.scopedFolderId) ||
            Boolean(this.searchQuery && this.searchQuery.trim())
          );
        },

        toggleSortColumn(col) {
          if (col === 'age_asc') {
            this.sortBy = this.sortBy === 'age_asc' ? 'age_desc' : 'age_asc';
          } else {
            this.sortBy = col;
          }
          this.loadDomains(true);
        },

        applySearch() {
          this.loadDomains(true);
        },

        resetFilters() {
          this.searchQuery = '';
          this.selectedFolderId = this.scopedFolderId || '';
          this.pinnedOnly = false;
          this.selectedPillar = 'all';
          this.activePreset = 'all';
          this.selectedAdNetwork = 'all';
          this.ageFilter = 'all';
          this.rankFilter = 'all';
          this.savesFilter = 'all';
          this.sizeFilter = 'all';
          this.logicMode = 'and';
          this.sortBy = 'visibility';
          this.excludeMarketplaces = true;
          this.loadDomains(true);
        },

        changePage(p) {
          if (p < 1 || p > this.totalPages) return;
          this.currentPage = p;
          this.loadDomains();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        },

        async enrichAge(domain, force = false) {
          if (!domain || this.enrichingDomains[domain]) return;
          this.enrichingDomains[domain] = true;
          this.enrichingDomains = { ...this.enrichingDomains };
          try {
            const res = await (window.safeApiFetch || fetch)('/api/domains/enrich-age', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ domain, force })
            });
            if (res.ok) {
              const data = await res.json();
              if (data.age_info) {
                const target = this.domains.find(d => d.domain === domain);
                if (target) {
                  target.age_years = data.age_info.age_years;
                  target.age_days = data.age_info.age_days;
                  target.domain_created_at = data.age_info.registered_at;
                  target.age_status = data.age_info.lookup_status;
                  target.lookup_source = data.age_info.lookup_source;
                }
                if (this.dossierData && this.dossierDomain === domain) {
                  this.dossierData.age_info = data.age_info;
                }
                const ageLabel = data.age_info.age_years != null ? data.age_info.age_years + 'y' : 'Checked';
                this.showToast('Resolved ' + domain + ': ' + ageLabel + ' (' + (data.age_info.lookup_source || 'whois') + ')', 'success');
              }
            } else {
              throw new Error('HTTP ' + res.status);
            }
          } catch (err) {
            this.showToast('Failed to check age for ' + domain + ': ' + err.message, 'error');
          } finally {
            delete this.enrichingDomains[domain];
            this.enrichingDomains = { ...this.enrichingDomains };
          }
        },

        async batchEnrichVisible() {
          const unchecked = this.domains.filter(d => (!d.age_status || d.age_status === 'unchecked') && !this.enrichingDomains[d.domain]);
          if (unchecked.length === 0) {
            this.showToast('All visible domains on this page are already checked (resolved or privacy-shielded)!', 'info');
            return;
          }
          this.batchEnriching = true;
          this.batchProgress = { done: 0, total: unchecked.length };
          this.showToast('Verifying ' + unchecked.length + ' visible domains in batch...', 'info');

          // Chunk into batches of 8 with safe jitter
          const chunks = [];
          for (let i = 0; i < unchecked.length; i += 8) {
            chunks.push(unchecked.slice(i, i + 8).map(d => d.domain));
          }

          for (const chunk of chunks) {
            chunk.forEach(d => { this.enrichingDomains[d] = true; });
            this.enrichingDomains = { ...this.enrichingDomains };
            try {
              const res = await (window.safeApiFetch || fetch)('/api/domains/enrich-age', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ domains: chunk })
              });
              if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data.results)) {
                  for (const r of data.results) {
                    const target = this.domains.find(d => d.domain === r.domain);
                    if (target) {
                      target.age_years = r.age_years;
                      target.age_days = r.age_days;
                      target.domain_created_at = r.registered_at;
                      target.age_status = r.lookup_status;
                      target.lookup_source = r.lookup_source;
                    }
                  }
                }
              }
            } catch (_) {}
            chunk.forEach(d => { delete this.enrichingDomains[d]; });
            this.batchProgress.done = Math.min(this.batchProgress.total, this.batchProgress.done + chunk.length);
            this.enrichingDomains = { ...this.enrichingDomains };
          }

          this.batchEnriching = false;
          this.fetchGlobalEnrichStatus();
          this.showToast('Batch verification complete! Updated ' + this.batchProgress.done + ' domains.', 'success');
        },

        async fetchGlobalEnrichStatus() {
          try {
            const res = await (window.safeApiFetch || fetch)('/api/domains/enrich-status');
            if (res.ok) {
              const data = await res.json();
              if (data.stats) {
                this.globalStats = data.stats;
              }
            }
          } catch (_) {}
        },

        toggleGlobalEnrichment() {
          if (this.globalEnriching) {
            this.stopGlobalEnrichment();
          } else {
            this.startGlobalEnrichment();
          }
        },

        async startGlobalEnrichment() {
          if (this.globalEnriching) return;
          this.globalEnriching = true;
          this.showToast('Starting automated database verification...', 'info');

          try {
            await this.fetchGlobalEnrichStatus();
            if (this.globalStats.unchecked_domains === 0) {
              this.showToast('All domains in the database are already verified!', 'success');
              this.globalEnriching = false;
              return;
            }

            while (this.globalEnriching) {
              const res = await (window.safeApiFetch || fetch)('/api/domains/enrich-all', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ batch_size: 25, concurrency: 4 })
              });

              if (!res.ok) {
                throw new Error('HTTP ' + res.status);
              }

              const data = await res.json();
              if (data.stats) {
                this.globalStats = data.stats;
              }

              // Update any currently visible rows on screen in real time
              if (Array.isArray(data.results)) {
                for (const r of data.results) {
                  const target = this.domains.find(d => d.domain === r.domain);
                  if (target) {
                    target.age_years = r.age_years;
                    target.age_days = r.age_days;
                    target.domain_created_at = r.registered_at;
                    target.age_status = r.lookup_status;
                    target.lookup_source = r.lookup_source;
                  }
                }
              }

              if (data.is_complete || (this.globalStats.unchecked_domains === 0)) {
                this.globalEnriching = false;
                this.showToast('🎉 All domains in database are fully verified!', 'success');
                break;
              }

              // Small delay between batches to respect rate limits
              await new Promise(r => setTimeout(r, 600));
            }
          } catch (err) {
            this.globalEnriching = false;
            this.showToast('Global verification paused: ' + err.message, 'error');
          }
        },

        stopGlobalEnrichment() {
          this.globalEnriching = false;
          this.showToast('Global verification paused. You can resume anytime.', 'info');
        },

        // [INVARIANT: FOLDER-SCOPED-POPSTATE-PRESERVATION]
        getBaseStudioPath() {
          if (this.scopedFolderId) {
            return '/folders/' + encodeURIComponent(this.scopedFolderId) + '/domains';
          }
          return '/domains';
        },

        // [INVARIANT: STRICT-TIME-FORMATTING-SSOT]
        formatDomainAge(days) {
          if (days == null || days === '' || isNaN(days)) return '—';
          const numDays = Math.max(0, Math.floor(Number(days)));
          if (numDays >= 365) {
            const years = (numDays / 365.25).toFixed(1);
            return years + 'y';
          }
          return numDays + 'd';
        },

        formatAgeFromIso(isoStr) {
          if (!isoStr) return '—';
          try {
            const d = new Date(isoStr);
            if (isNaN(d.getTime())) return '—';
            const diffDays = Math.max(0, Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24)));
            if (diffDays >= 365) {
              const years = (diffDays / 365.25).toFixed(1);
              return years + 'y';
            }
            return diffDays + 'd';
          } catch (_) {
            return '—';
          }
        },

        async fetchPinnedDomains() {
          if (!this.scopedFolderId) return;
          try {
            const res = await (window.safeApiFetch || fetch)('/api/folders/' + encodeURIComponent(this.scopedFolderId) + '/domains');
            if (res.ok) {
              const data = await res.json();
              const list = data.pinned_domains || data.domains || [];
              this.pinnedDomains = new Set(list.map(p => (typeof p === 'string' ? p : (p.domain || '')).toLowerCase()));
            }
          } catch (_) {}
        },

        async togglePinDomain(domain) {
          if (!domain) return;
          const cleanDomain = domain.toLowerCase().trim();
          const targetFolderId = this.scopedFolderId || this.selectedFolderId;
          if (!targetFolderId) {
            this.showToast('Select a Campaign Folder to pin target domains', 'warning');
            return;
          }
          const isPinned = this.pinnedDomains.has(cleanDomain);
          const method = isPinned ? 'DELETE' : 'POST';
          const url = isPinned
            ? '/api/folders/' + encodeURIComponent(targetFolderId) + '/domains/' + encodeURIComponent(cleanDomain)
            : '/api/folders/' + encodeURIComponent(targetFolderId) + '/domains';

          try {
            const res = await (window.safeApiFetch || fetch)(url, {
              method,
              headers: { 'Content-Type': 'application/json' },
              body: isPinned ? undefined : JSON.stringify({ domain: cleanDomain })
            });
            if (res.ok) {
              if (isPinned) {
                this.pinnedDomains.delete(cleanDomain);
                this.showToast('Unpinned ' + cleanDomain + ' from folder', 'info');
              } else {
                this.pinnedDomains.add(cleanDomain);
                this.showToast('Pinned ' + cleanDomain + ' to folder', 'success');
              }
              this.pinnedDomains = new Set(this.pinnedDomains);
            } else {
              const errData = await res.json().catch(() => ({}));
              throw new Error(errData.error || 'HTTP ' + res.status);
            }
          } catch (err) {
            this.showToast('Failed to update domain pin: ' + err.message, 'error');
          }
        },

        async openDossier(domain, pushState = true, forceRefresh = false) {
          if (!domain) return;
          this.dossierDomain = domain;
          this.isDossierOpen = true;
          this.dossierLoading = true;
          this.dossierData = null;
          this.dossierTab = (domain && domain.toLowerCase() === 'uploaded by user') ? 'pins' : 'urls';
          this.currentDisplacedLimit = 30;
          this.dossierSearch = '';
          this.dossierSort = 'saves';
          this.dossierPinsPage = 1;
          this.dossierArticlesPage = 1;
          this.dossierStatusFilter = 'all';

          if (pushState && typeof window !== 'undefined' && window.history && window.history.pushState) {
            const basePath = this.getBaseStudioPath();
            const targetPath = basePath + '/' + encodeURIComponent(domain);
            if (window.location.pathname !== targetPath) {
              window.history.pushState({ domain, folderId: this.scopedFolderId }, '', targetPath);
            }
          }

          try {
            const activeFid = this.scopedFolderId || this.selectedFolderId || '';
            const folderParam = activeFid ? '&folder_id=' + encodeURIComponent(activeFid) : '';
            const apiUrl = '/api/domains/dossier?domain=' + encodeURIComponent(domain) + folderParam + (forceRefresh ? '&refresh=true' : '');
            const res = await (window.safeApiFetch || fetch)(apiUrl, { timeout: 28000 });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            this.dossierData = await res.json();
          } catch (err) {
            this.showToast('Failed to load dossier: ' + err.message, 'error');
          } finally {
            this.dossierLoading = false;
          }
        },

        async loadMoreDisplaced() {
          if (!this.dossierDomain || this.dossierLoadingMore) return;
          this.currentDisplacedLimit += 50;
          this.dossierLoadingMore = true;
          try {
            const activeFid = this.scopedFolderId || this.selectedFolderId || '';
            const folderParam = activeFid ? '&folder_id=' + encodeURIComponent(activeFid) : '';
            const apiUrl = '/api/domains/dossier?domain=' + encodeURIComponent(this.dossierDomain) + folderParam + '&displaced_limit=' + this.currentDisplacedLimit;
            const res = await (window.safeApiFetch || fetch)(apiUrl, { timeout: 28000 });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            if (data?.ranked_pins) {
              this.dossierData.ranked_pins = data.ranked_pins;
              this.dossierData.summary = data.summary;
              this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
              this.showToast('Loaded ' + data.ranked_pins.length + ' visual pins!', 'success');
            }
          } catch (err) {
            this.showToast('Failed to load more displaced pins: ' + err.message, 'error');
          } finally {
            this.dossierLoadingMore = false;
          }
        },

        closeDossier(pushState = true) {
          // [INVARIANT: PRESERVE-LEADERBOARD-TELEMETRY]
          // Only WHOIS age and Ads.txt enrichments sync back; core table metrics remain 100% INVARIANT!
          const domainToSync = this.dossierDomain || this.selectedDomain;
          if (domainToSync && this.dossierData && Array.isArray(this.domains) && this.domains.length > 0) {
            const target = this.domains.find(d => d.domain === domainToSync);
            if (target) {
              if (this.dossierData.age_info?.age_days != null) target.age_days = this.dossierData.age_info.age_days;
              if (this.dossierData.age_info?.created_date || this.dossierData.age_info?.registered_at) {
                target.domain_created_at = this.dossierData.age_info.created_date || this.dossierData.age_info.registered_at;
              }
              if (this.dossierData.age_info?.lookup_status) target.age_status = this.dossierData.age_info.lookup_status;
              if (this.dossierData.ad_info?.current_ad_network || this.dossierData.ad_info?.ad_network) {
                target.ad_network = this.dossierData.ad_info.current_ad_network || this.dossierData.ad_info.ad_network;
              }
              if (this.dossierData.ad_info?.ad_manager_domain) target.ad_manager_domain = this.dossierData.ad_info.ad_manager_domain;
              if (this.dossierData.ad_info?.previous_ad_network) target.previous_ad_network = this.dossierData.ad_info.previous_ad_network;
            }
          }
          this.isDossierOpen = false;
          this.dossierData = null;
          this.dossierDomain = '';
          this.selectedDomain = null;
          this.dossierSearch = '';
          if (pushState && typeof window !== 'undefined' && window.history && window.history.pushState) {
            const basePath = this.getBaseStudioPath();
            if (window.location.pathname !== basePath) {
              window.history.pushState({ folderId: this.scopedFolderId }, '', basePath);
            }
          }
        },

        getPinAgeBadge(dateStr) {
          if (!dateStr) return null;
          const d = new Date(dateStr);
          if (isNaN(d.getTime())) return null;
          const diffDays = Math.max(0, Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24)));
          if (diffDays < 30) {
            return {
              label: '🌱 ' + diffDays + 'd',
              title: 'Fresh Pin: Created ' + diffDays + ' days ago',
              class: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
            };
          } else if (diffDays <= 180) {
            return {
              label: '⚡ ' + diffDays + 'd',
              title: 'Velocity Active: Created ' + diffDays + ' days ago',
              class: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30'
            };
          } else {
            const years = (diffDays / 365).toFixed(1);
            const text = diffDays >= 365 ? '🦖 ' + years + 'y' : '🦖 ' + diffDays + 'd';
            return {
              label: text,
              title: 'Evergreen Pin: Created ' + diffDays + ' days ago',
              class: 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30'
            };
          }
        },

        filterToKeyword(kw) {
          if (!kw) return;
          this.dossierTab = 'keywords';
          this.dossierSearch = kw;
        },

        filterToArticle(urlOrSlug) {
          if (!urlOrSlug) return;
          this.dossierTab = 'urls';
          this.dossierSearch = urlOrSlug;
        },

        filterToArticleKeywords(art) {
          const kws = art?.target_keywords || art?.keywords || [];
          if (!kws || kws.length === 0) return;
          this.dossierTab = 'keywords';
          this.dossierSearch = kws[0];
        },

        copyAllKeywords() {
          if (!this.dossierData?.keyword_monopoly?.length) {
            this.showToast('No keywords available to copy', 'warning');
            return;
          }
          const list = this.dossierData.keyword_monopoly.map(k => k.keyword_name).filter(Boolean).join('\\n');
          this.copyToClipboard(list, 'Copied ' + this.dossierData.keyword_monopoly.length + ' keywords to clipboard!');
        },

        filteredDossierPins() {
          let list = Array.isArray(this.dossierData?.ranked_pins) ? [...this.dossierData.ranked_pins] : [];

          // [INVARIANT: STRICT-VISUAL-PIN-FIDELITY] Every displayed pin must have an authentic image
          list = list.filter(p => Boolean(p.image_url && p.image_url.trim()));

          // Status filter: all | active | displaced
          if (this.dossierStatusFilter === 'active') {
            list = list.filter(p => !p.is_displaced && p.best_rank !== null);
          } else if (this.dossierStatusFilter === 'displaced') {
            list = list.filter(p => Boolean(p.is_displaced));
          }

          const q = (this.dossierSearch || '').toLowerCase().trim();
          if (q) {
            list = list.filter(p => {
              return (p.title && p.title.toLowerCase().includes(q)) ||
                     (p.pin_id && String(p.pin_id).includes(q)) ||
                     (p.creator_username && p.creator_username.toLowerCase().includes(q)) ||
                     (Array.isArray(p.serp_appearances) && p.serp_appearances.some(a => a.keyword_name && a.keyword_name.toLowerCase().includes(q)));
            });
          }
          const getPinTime = (p) => {
            if (!p?.created_at_pinterest) return null;
            const t = new Date(p.created_at_pinterest).getTime();
            return isFinite(t) ? t : null;
          };
          const sort = this.dossierSort || 'saves';
          if (sort === 'saves') {
            list.sort((a, b) => (Number(b.saves) || 0) - (Number(a.saves) || 0));
          } else if (sort === 'age_asc') {
            list.sort((a, b) => {
              const aT = getPinTime(a);
              const bT = getPinTime(b);
              if (aT === null && bT === null) return 0;
              if (aT === null) return 1;
              if (bT === null) return -1;
              return bT - aT;
            });
          } else if (sort === 'age_desc') {
            list.sort((a, b) => {
              const aT = getPinTime(a);
              const bT = getPinTime(b);
              if (aT === null && bT === null) return 0;
              if (aT === null) return 1;
              if (bT === null) return -1;
              return aT - bT;
            });
          } else if (sort === 'multiplier') {
            list.sort((a, b) => (b.serp_appearances?.length || 0) - (a.serp_appearances?.length || 0));
          } else if (sort === 'rank') {
            list.sort((a, b) => (Number(a.best_rank) || 999) - (Number(b.best_rank) || 999));
          }
          return list;
        },

        paginatedDossierPins() {
          const list = this.filteredDossierPins();
          const start = (this.dossierPinsPage - 1) * this.dossierPinsPerPage;
          return list.slice(start, start + this.dossierPinsPerPage);
        },

        totalDossierPinsPages() {
          return Math.max(1, Math.ceil(this.filteredDossierPins().length / this.dossierPinsPerPage));
        },

        prevDossierPinsPage() {
          if (this.dossierPinsPage > 1) this.dossierPinsPage--;
        },

        nextDossierPinsPage() {
          if (this.dossierPinsPage < this.totalDossierPinsPages()) this.dossierPinsPage++;
        },

        filteredDossierArticles() {
          let list = Array.isArray(this.dossierData?.money_urls) ? [...this.dossierData.money_urls] : [];

          // [INVARIANT: CLEAN-MONEY-ARTICLES] Exclude root domain '/' dump from Money Articles
          list = list.filter(art => art.clean_slug && art.clean_slug !== '/');

          // Ensure pins inside each article only contain valid image pins
          list = list.map(art => {
            const validPins = (art.pins || []).filter(p => Boolean(p.image_url && p.image_url.trim()));
            return {
              ...art,
              pins: validPins,
              pins_count: validPins.length
            };
          }).filter(art => art.pins.length > 0);

          if (this.dossierStatusFilter === 'active') {
            list = list.filter(art => art.pins.some(p => !p.is_displaced));
          } else if (this.dossierStatusFilter === 'displaced') {
            list = list.filter(art => art.pins.some(p => Boolean(p.is_displaced)));
          }

          const q = (this.dossierSearch || '').toLowerCase().trim();
          if (q) {
            list = list.filter(art => {
              const kws = art.target_keywords || art.keywords || [];
              return (art.clean_slug && art.clean_slug.toLowerCase().includes(q)) ||
                     (art.sample_url && art.sample_url.toLowerCase().includes(q)) ||
                     (Array.isArray(art.angles_targeted) && art.angles_targeted.some(ang => ang.toLowerCase().includes(q))) ||
                     (Array.isArray(kws) && kws.some(kw => kw && kw.toLowerCase().includes(q))) ||
                     (Array.isArray(art.pins) && art.pins.some(p => p.title && p.title.toLowerCase().includes(q)));
            });
          }
          const getArticleNewestTime = (art) => {
            if (art.newest_pin_date || art.created_at_pinterest) {
              const t = new Date(art.newest_pin_date || art.created_at_pinterest).getTime();
              if (isFinite(t)) return t;
            }
            const times = (art.pins || [])
              .map(p => p.created_at_pinterest ? new Date(p.created_at_pinterest).getTime() : null)
              .filter(t => t !== null && isFinite(t));
            return times.length > 0 ? Math.max(...times) : null;
          };
          const getArticleOldestTime = (art) => {
            if (art.oldest_pin_date) {
              const t = new Date(art.oldest_pin_date).getTime();
              if (isFinite(t)) return t;
            }
            const times = (art.pins || [])
              .map(p => p.created_at_pinterest ? new Date(p.created_at_pinterest).getTime() : null)
              .filter(t => t !== null && isFinite(t));
            return times.length > 0 ? Math.min(...times) : null;
          };
          const sort = this.dossierSort || 'saves';
          if (sort === 'saves') {
            list.sort((a, b) => (Number(b.total_saves) || 0) - (Number(a.total_saves) || 0));
          } else if (sort === 'multiplier') {
            list.sort((a, b) => (Number(b.pins_count) || 0) - (Number(a.pins_count) || 0));
          } else if (sort === 'rank') {
            list.sort((a, b) => (Number(a.best_rank) || 999) - (Number(b.best_rank) || 999));
          } else if (sort === 'age_asc') {
            list.sort((a, b) => {
              const aT = getArticleNewestTime(a);
              const bT = getArticleNewestTime(b);
              if (aT === null && bT === null) return 0;
              if (aT === null) return 1;
              if (bT === null) return -1;
              return bT - aT;
            });
          } else if (sort === 'age_desc') {
            list.sort((a, b) => {
              const aT = getArticleOldestTime(a);
              const bT = getArticleOldestTime(b);
              if (aT === null && bT === null) return 0;
              if (aT === null) return 1;
              if (bT === null) return -1;
              return aT - bT;
            });
          }
          return list;
        },

        paginatedDossierArticles() {
          const list = this.filteredDossierArticles();
          const start = (this.dossierArticlesPage - 1) * this.dossierArticlesPerPage;
          return list.slice(start, start + this.dossierArticlesPerPage);
        },

        totalDossierArticlesPages() {
          return Math.max(1, Math.ceil(this.filteredDossierArticles().length / this.dossierArticlesPerPage));
        },

        prevDossierArticlesPage() {
          if (this.dossierArticlesPage > 1) this.dossierArticlesPage--;
        },

        nextDossierArticlesPage() {
          if (this.dossierArticlesPage < this.totalDossierArticlesPages()) this.dossierArticlesPage++;
        },

        filteredDossierKeywords() {
          let list = Array.isArray(this.dossierData?.keyword_monopoly) ? [...this.dossierData.keyword_monopoly] : [];
          const q = (this.dossierSearch || '').toLowerCase().trim();
          if (q) {
            list = list.filter(kw => {
              return (kw.keyword_name && kw.keyword_name.toLowerCase().includes(q)) ||
                     (kw.strategy && kw.strategy.toLowerCase().includes(q)) ||
                     (kw.top_slot_attribution?.title && kw.top_slot_attribution.title.toLowerCase().includes(q));
            });
          }
          const getKeywordNewestTime = (kw) => {
            const times = (kw.slots_detail || kw.slots || [])
              .map(s => s.created_at_pinterest ? new Date(s.created_at_pinterest).getTime() : null)
              .filter(t => t !== null && isFinite(t));
            return times.length > 0 ? Math.max(...times) : null;
          };
          const getKeywordOldestTime = (kw) => {
            const times = (kw.slots_detail || kw.slots || [])
              .map(s => s.created_at_pinterest ? new Date(s.created_at_pinterest).getTime() : null)
              .filter(t => t !== null && isFinite(t));
            return times.length > 0 ? Math.min(...times) : null;
          };
          const sort = this.dossierSort || 'saves';
          if (sort === 'saves') {
            list.sort((a, b) => (Number(b.total_saves) || 0) - (Number(a.total_saves) || 0));
          } else if (sort === 'multiplier') {
            // Sort by Pins per Keyword / Monopoly slots
            list.sort((a, b) => (Number(b.active_slots) || 0) - (Number(a.active_slots) || 0) || (Number(b.unique_urls_count) || 0) - (Number(a.unique_urls_count) || 0));
          } else if (sort === 'rank') {
            // Best rank: Rank #1 first!
            list.sort((a, b) => (Number(a.best_rank) || 999) - (Number(b.best_rank) || 999));
          } else if (sort === 'age_asc') {
            list.sort((a, b) => {
              const aT = getKeywordNewestTime(a);
              const bT = getKeywordNewestTime(b);
              if (aT === null && bT === null) return 0;
              if (aT === null) return 1;
              if (bT === null) return -1;
              return bT - aT;
            });
          } else if (sort === 'age_desc') {
            list.sort((a, b) => {
              const aT = getKeywordOldestTime(a);
              const bT = getKeywordOldestTime(b);
              if (aT === null && bT === null) return 0;
              if (aT === null) return 1;
              if (bT === null) return -1;
              return aT - bT;
            });
          }
          return list;
        },

        async openBlueprintModal(domain) {
          if (!domain) return;
          this.blueprintLoading = true;
          this.isBlueprintModalOpen = true;
          this.blueprintData = null;

          try {
            const activeFid = this.scopedFolderId || this.selectedFolderId || '';
            const folderParam = activeFid ? '&folder_id=' + encodeURIComponent(activeFid) : '';
            const res = await (window.safeApiFetch || fetch)('/api/domains/blueprint?domain=' + encodeURIComponent(domain) + folderParam, { timeout: 18000 });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            this.blueprintData = await res.json();
          } catch (err) {
            this.showToast('Failed to generate Attack Blueprint: ' + err.message, 'error');
          } finally {
            this.blueprintLoading = false;
          }
        },

        closeBlueprintModal() {
          this.isBlueprintModalOpen = false;
          this.blueprintData = null;
        },

        copyBlueprintMarkdown() {
          if (!this.blueprintData?.markdown_blueprint) return;
          navigator.clipboard.writeText(this.blueprintData.markdown_blueprint).then(() => {
            this.showToast('📋 Attack Blueprint copied to clipboard in Markdown format!', 'success');
          }).catch(() => {
            this.showToast('Failed to copy to clipboard', 'error');
          });
        },

        exportBlueprintJson() {
          if (!this.blueprintData) return;
          const jsonStr = JSON.stringify(this.blueprintData, null, 2);
          const blob = new Blob([jsonStr], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'blueprint_' + (this.blueprintData.domain || 'attack') + '.json';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          this.showToast('📥 Downloaded Blueprint JSON!', 'success');
        },

        async recheckAgeForDossier() {
          if (!this.dossierDomain) return;
          await this.enrichAge(this.dossierDomain, true);
        },

        async enrichAd(domain, force = false) {
          if (!domain || this.enrichingAds[domain]) return;
          this.enrichingAds[domain] = true;
          this.enrichingAds = { ...this.enrichingAds };
          try {
            const res = await (window.safeApiFetch || fetch)('/api/domains/enrich-ads', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ domain, force })
            });
            if (res.ok) {
              const data = await res.json();
              const adInfo = data.ad_info || (Array.isArray(data.results) ? data.results[0] : null);
              if (adInfo) {
                const target = this.domains.find(d => d.domain === domain);
                if (target) {
                  target.ad_network = adInfo.current_ad_network || adInfo.ad_network;
                  target.ad_manager_domain = adInfo.ad_manager_domain;
                  target.primary_pub_id = adInfo.primary_pub_id;
                  target.previous_ad_network = adInfo.previous_ad_network;
                  target.ad_switched_at = adInfo.switched_at || adInfo.ad_switched_at;
                  target.ads_txt_status = adInfo.ads_txt_status;
                  target.ad_network_history = adInfo.network_history || adInfo.ad_network_history;
                }
                if (this.dossierData && this.dossierDomain === domain) {
                  this.dossierData.ad_info = {
                    ...(this.dossierData.ad_info || {}),
                    ...adInfo,
                    current_ad_network: adInfo.current_ad_network || adInfo.ad_network
                  };
                }
                const netLabel = this.getAdNetworkBadgeText(adInfo.current_ad_network || adInfo.ad_network);
                this.showToast('Resolved monetization for ' + domain + ': ' + netLabel, 'success');
              }
            } else {
              throw new Error('HTTP ' + res.status);
            }
          } catch (err) {
            this.showToast('Failed to check ads for ' + domain + ': ' + err.message, 'error');
          } finally {
            delete this.enrichingAds[domain];
            this.enrichingAds = { ...this.enrichingAds };
          }
        },

        async recheckAdsForDossier() {
          if (!this.dossierDomain) return;
          await this.enrichAd(this.dossierDomain, true);
        },

        async batchEnrichAdsVisible() {
          const unchecked = this.domains.filter(d => (!d.ad_network || d.ad_network === 'unchecked') && !this.enrichingAds[d.domain]);
          if (unchecked.length === 0) {
            this.showToast('All visible domains on this page already have ads.txt monetization status!', 'info');
            return;
          }
          this.batchAdsEnriching = true;
          this.batchAdsProgress = { done: 0, total: unchecked.length };
          this.showToast('Verifying ads.txt for ' + unchecked.length + ' visible domains in batch...', 'info');

          // Chunk into batches of 6 with safe concurrency
          const chunks = [];
          for (let i = 0; i < unchecked.length; i += 6) {
            chunks.push(unchecked.slice(i, i + 6).map(d => d.domain));
          }

          for (const chunk of chunks) {
            chunk.forEach(d => { this.enrichingAds[d] = true; });
            this.enrichingAds = { ...this.enrichingAds };
            try {
              const res = await (window.safeApiFetch || fetch)('/api/domains/enrich-ads', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ domains: chunk })
              });
              if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data.results)) {
                  for (const r of data.results) {
                    const target = this.domains.find(d => d.domain === r.domain);
                    if (target) {
                      target.ad_network = r.current_ad_network || r.ad_network;
                      target.ad_manager_domain = r.ad_manager_domain;
                      target.primary_pub_id = r.primary_pub_id;
                      target.previous_ad_network = r.previous_ad_network;
                      target.ad_switched_at = r.switched_at || r.ad_switched_at;
                      target.ads_txt_status = r.ads_txt_status;
                      target.ad_network_history = r.network_history || r.ad_network_history;
                    }
                  }
                }
              }
            } catch (_) {}
            chunk.forEach(d => { delete this.enrichingAds[d]; });
            this.batchAdsProgress.done = Math.min(this.batchAdsProgress.total, this.batchAdsProgress.done + chunk.length);
            this.enrichingAds = { ...this.enrichingAds };
          }

          this.batchAdsEnriching = false;
          this.fetchGlobalAdsStatus();
          this.showToast('Batch ads verification complete! Updated ' + this.batchAdsProgress.done + ' domains.', 'success');
        },

        async fetchGlobalAdsStatus() {
          try {
            const res = await (window.safeApiFetch || fetch)('/api/domains/ads-status');
            if (res.ok) {
              const data = await res.json();
              if (data.stats) {
                this.globalAdsStats = data.stats;
              }
            }
          } catch (_) {}
        },

        toggleGlobalAdsEnrichment() {
          if (this.globalAdsEnriching) {
            this.stopGlobalAdsEnrichment();
          } else {
            this.startGlobalAdsEnrichment();
          }
        },

        async startGlobalAdsEnrichment() {
          if (this.globalAdsEnriching) return;
          this.globalAdsEnriching = true;
          this.showToast('Starting automated ads.txt verification...', 'info');

          try {
            await this.fetchGlobalAdsStatus();
            if (this.globalAdsStats.unchecked_domains === 0) {
              this.showToast('All domains in the database already have ads.txt verified!', 'success');
              this.globalAdsEnriching = false;
              return;
            }

            while (this.globalAdsEnriching) {
              const res = await (window.safeApiFetch || fetch)('/api/domains/enrich-ads-all', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ batch_size: 15, concurrency: 3 })
              });

              if (!res.ok) {
                throw new Error('HTTP ' + res.status);
              }

              const data = await res.json();
              if (data.stats) {
                this.globalAdsStats = data.stats;
              }

              // Update any currently visible rows on screen in real time
              if (Array.isArray(data.results)) {
                for (const r of data.results) {
                  const target = this.domains.find(d => d.domain === r.domain);
                  if (target) {
                    target.ad_network = r.current_ad_network || r.ad_network;
                    target.ad_manager_domain = r.ad_manager_domain;
                    target.primary_pub_id = r.primary_pub_id;
                    target.previous_ad_network = r.previous_ad_network;
                    target.ad_switched_at = r.switched_at || r.ad_switched_at;
                    target.ads_txt_status = r.ads_txt_status;
                    target.ad_network_history = r.network_history || r.ad_network_history;
                  }
                }
              }

              if (data.is_complete || (this.globalAdsStats.unchecked_domains === 0)) {
                this.globalAdsEnriching = false;
                this.showToast('🎉 All domains in database have ads.txt monetization verified!', 'success');
                break;
              }

              // Delay between batches to respect target servers and rate limits
              await new Promise(r => setTimeout(r, 800));
            }
          } catch (err) {
            this.globalAdsEnriching = false;
            this.showToast('Global ads verification paused: ' + err.message, 'error');
          }
        },

        stopGlobalAdsEnrichment() {
          this.globalAdsEnriching = false;
          this.showToast('Global ads verification paused. You can resume anytime.', 'info');
        },

        capitalize(str) {
          if (!str) return '';
          return str.charAt(0).toUpperCase() + str.slice(1);
        },

        getAdNetworkBadgeText(net) {
          if (!net || net === 'unchecked') return '⏳ Unchecked';
          switch (net) {
            case 'raptive': return '💎 Raptive';
            case 'mediavine': return '🍇 Mediavine';
            case 'journey': return '🚀 Journey';
            case 'ezoic': return '⚡ Ezoic';
            case 'hbagency': return '⚡ HBAgency';
            case 'monumetric': return '📈 Monumetric';
            case 'shemedia': return '🌸 SheMedia';
            case 'freestar': return '⭐ Freestar';
            case 'playwire': return '🎮 Playwire';
            case 'snigel': return '🛡️ Snigel';
            case 'adsense': return '🟡 AdSense';
            case 'affiliate_only': return '🛒 Affiliate Only';
            case 'unmonetized': return '⚪ Direct / None';
            case 'protected': return '🛡️ Bot Protected';
            case 'failed': return '❌ Unreachable';
            default: return this.capitalize(net);
          }
        },

        getAdNetworkBadgeClasses(net) {
          if (!net || net === 'unchecked') {
            return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700';
          }
          switch (net) {
            case 'raptive':
              return 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 border border-purple-300 dark:border-purple-700';
            case 'mediavine':
              return 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300 border border-rose-300 dark:border-rose-700';
            case 'journey':
              return 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300 border border-sky-300 dark:border-sky-700';
            case 'ezoic':
              return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700';
            case 'hbagency':
              return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700';
            case 'monumetric':
              return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-700';
            case 'shemedia':
              return 'bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300 border border-pink-300 dark:border-pink-700';
            case 'freestar':
              return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-300 dark:border-amber-700';
            case 'playwire':
              return 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300 border border-violet-300 dark:border-violet-700';
            case 'snigel':
              return 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300 border border-teal-300 dark:border-teal-700';
            case 'adsense':
              return 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-300 dark:border-amber-800';
            case 'affiliate_only':
              return 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-300 dark:border-blue-700';
            case 'unmonetized':
              return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-700';
            case 'protected':
              return 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800';
            case 'failed':
              return 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400 border border-rose-200 dark:border-rose-800';
            default:
              return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700';
          }
        },

        copyToClipboard(text, msg = 'Copied to clipboard!') {
          if (!text) return;
          if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => {
              this.showToast(msg, 'success');
            }).catch(() => {
              this.fallbackCopy(text, msg);
            });
          } else {
            this.fallbackCopy(text, msg);
          }
        },

        fallbackCopy(text, msg = 'Copied to clipboard!') {
          try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            this.showToast(msg, 'success');
          } catch (_) {
            this.showToast('Could not copy to clipboard', 'warning');
          }
        },

        copyAllArticleUrls() {
          if (!this.dossierData?.money_urls?.length) {
            this.showToast('No articles available to copy', 'warning');
            return;
          }
          const urls = this.dossierData.money_urls.map(u => u.sample_url || ('https://' + this.dossierDomain + u.clean_slug)).join('\\n');
          this.copyToClipboard(urls, 'Copied ' + this.dossierData.money_urls.length + ' article URLs to clipboard!');
        },

        downloadDomainsCsv() {
          if (!this.domains || this.domains.length === 0) {
            this.showToast('No domains available to export', 'warning');
            return;
          }

          const headers = [
            'domain',
            'ad_network',
            'ad_manager_domain',
            'previous_ad_network',
            'age_years',
            'age_days',
            'domain_created_at',
            'total_pins',
            'unique_urls',
            'pins_per_url',
            'active_serp_pins',
            'top3_pins',
            'top10_pins',
            'displaced_pins',
            'decay_rate_pct',
            'visibility_score',
            'arbitrage_score',
            'total_saves',
            'avg_velocity',
            'accounts_count'
          ];

          const csvContent = [
            headers.map(h => this.sanitizeCsvCell(h)).join(','),
            ...this.domains.map(d => headers.map(h => this.sanitizeCsvCell(d[h])).join(','))
          ].join('\\r\\n');

          const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'domain_intelligence_' + new Date().toISOString().slice(0, 10) + '.csv';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          this.showToast('Exported domains CSV!', 'success');
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
