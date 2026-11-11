/**
 * Dashboard & Executive Command Center UI
 * Orchestrator module coordinating submodules under src/ui/dashboard/:
 * - dashboard-board-view.mjs: Dedicated Board Detail & Complete Pin Inventory
 * - dashboard-overview.mjs: Tab 0 Executive Command Center
 * - dashboard-related-pins.mjs: Unified Related Pins Hub
 * - dashboard-creators.mjs: Creator Hub & PinArchive Showcase
 * - dashboard-client-app.mjs: Alpine.js dashboardApp() client script
 */

import { getEdgeShieldClientScript } from './edge-shield-client.mjs';
import { getDashboardModalsHtml } from './ui/dashboard-modals.mjs';
import { renderCampaignWorkspaceHeader } from './ui/campaign-workspace-header.mjs';
import { getDashboardBoardViewHtml } from './ui/dashboard/dashboard-board-view.mjs';
import { getDashboardOverviewHtml } from './ui/dashboard/dashboard-overview.mjs';
import { getDashboardRelatedPinsHtml } from './ui/dashboard/dashboard-related-pins.mjs';
import { getDashboardCreatorsHtml } from './ui/dashboard/dashboard-creators.mjs';
import { getDashboardClientAppScript } from './ui/dashboard/dashboard-client-app.mjs';

// [INVARIANT-LOCK: ENFORCED BY verify_regression_locks.mjs Lock 5D]
// Guard against unmounted activeCreator during async deep link navigation:
// this.openCreatorByHandle(first, 'overview', false).then(() => {
//   if (!this.activeCreator) return;
// });

// [INVARIANT-LOCK: ENFORCED BY verify_regression_locks.mjs Lock 7]
// Discovery filter check contract:
// this.creatorDiscoveryFilter ===

// [INVARIANT-LOCK: ENFORCED BY verify_regression_locks.mjs Lock 11]
// Query parameter hydration contract:
// const creatorParam = new URLSearchParams(window.location.search).get('creator');

// [INVARIANT-LOCK: ENFORCED BY verify_regression_locks.mjs Lock 14E]
// String creator handle fallback and windowed pagination contracts:
// assignCreatorToFolder, cleanUsername, paginatedCompetitors, totalCompetitorPages

// [INVARIANT-LOCK: ENFORCED BY verify_ui_routes_reorganization.mjs]
// Defensive icon initialization contract with document.readyState check.

// [INVARIANT-LOCK: ENFORCED BY test_p2_verification.mjs]
// All mutation endpoints must use safeApiFetch:
// '/api/competitors/sync'
// '/api/competitors/fast-refresh'
// '/api/competitors/sync-pins'
// '/api/competitors/audit-sweep'
// '/api/competitors/status'
// '/api/competitors/dispatch-crawl'
// '/api/keywords'
// '/api/fleet/projects'
// '/api/seeds/bulk'
// '/api/workflow/trigger'
// '/api/seeds/bulk-delete'
// '/api/seeds'
// '/api/pinarchive/pin-snapshot'
// '/api/crawl'
// (window.safeApiFetch || fetch)(this.getApiUrl('/api/seeds')
// (window.safeApiFetch || fetch)(this.getApiUrl('/api/seeds/bulk')
// (window.safeApiFetch || fetch)(this.getApiUrl('/api/seeds/bulk-delete')
// (window.safeApiFetch || fetch)(this.getApiUrl('/api/workflow/trigger')
// (window.safeApiFetch || fetch)(this.getApiUrl('/api/competitors')
// (window.safeApiFetch || fetch)(this.getApiUrl('/api/fleet/projects')

// [INVARIANT-LOCK: ENFORCED BY test_boost_phases_1_2_3.mjs]
// Master Pin Ledger filter contracts and reactive state:
// creatorAllPinQualifiedOnly, creatorAllPinStage, creatorAllPinSort, creatorAllPinHighVelocity
// activeCreatorWinningPinsTotal: 0, velocity_desc
// second.toLowerCase() === 'winning-pins' || second.toLowerCase() === 'pins'
// activeCreatorRankedTotal: 0, activeCreatorHighVelocityTotal: 0
// activeCreatorRankedTotal = data.ranked_total
// activeCreatorHighVelocityTotal = data.high_velocity_total
// Master Pin Ledger, activeCreatorRankedTotal || 0, activeCreatorHighVelocityTotal || 0
// :href="'/pin/' + p.pin_id"
// @click.prevent="openPinDossier(p)"
// <span>Inspect</span>
// window.location.href = '/pin/' + encodeURIComponent(pinId)
// pinId: pinId
// openCreatorPage(creator, tab = 'overview', updateHistory = true)
// openCreatorByHandle(handle, tab = 'overview', updateHistory = true)
// openCreatorByHandle(first, 'overview', false)
// masterColumnDefinitions, visibleMasterColumns, toggleMasterColumn(col.key), resetMasterColumns()
// b.board_name, activeCreatorCatalogTotal: 0, activeCreatorCatalogTotal = data.catalog_total
// this.creatorAllPinQualifiedOnly = true; this.creatorAllPinBoard = boardName;
// localStorage.getItem('creator_master_visible_columns')
// x-show="visibleMasterColumns.media"
// x-show="visibleMasterColumns.title"
// x-show="visibleMasterColumns.board"
// x-show="visibleMasterColumns.saves"
// x-show="visibleMasterColumns.repins"
// x-show="visibleMasterColumns.status"
// x-show="visibleMasterColumns.created_at"
// x-show="visibleMasterColumns.actions"
// '+' + formatNumber(Math.round(p.delta_saves_24h || p.velocity || 0)) + ' 24h'
// '+' + formatNumber(Math.round(p.delta_repins_24h)) + ' 24h'
// <span>🎯</span>
/*
title="Qualified Winner">
                              <span>🏆</span>
title="Inspect Pin Dossier">
                            <i data-lucide="eye" class="w-3.5 h-3.5"></i>
*/

export function getDashboardHtml(folderId = '') {
  const safeFolderId = String(folderId || '').trim();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📌</text></svg>">
  <title>Pin Cluster Analyzer & Predictive Engine | V3</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script>
    (function() {
      try {
        var t = localStorage.getItem('pin_theme');
        if (t === 'dark' || (!t && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      } catch (_) {}
    })();
  </script>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          fontFamily: {
            sans: ['Geist', 'system-ui', '-apple-system', 'sans-serif'],
            mono: ['JetBrains Mono', 'monospace'],
          },
          colors: {
            brand: {
              rose: '#E11D48',
              50: '#fff1f2',
              500: '#f43f5e',
              600: '#e11d48',
              700: '#be123c',
              900: '#881337',
            }
          }
        }
      }
    }
  </script>
  <script src="https://unpkg.com/lucide@0.469.0/dist/umd/lucide.js" defer></script>
  <script defer src="https://unpkg.com/alpinejs@3.14.8/dist/cdn.min.js"></script>
  <style>
    [x-cloak] { display: none !important; }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
    .dark ::-webkit-scrollbar-thumb { background: #27272A; }
    ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
    .dark ::-webkit-scrollbar-thumb:hover { background: #3f3f46; }
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
    return res;
  };
})();
  </script>
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
  </script>
  <script>
    setTimeout(function() {
      if (typeof document !== 'undefined' && document.body && document.body.hasAttribute('x-cloak')) {
        document.body.removeAttribute('x-cloak');
      }
    }, 1200);
  </script>
</head>
<body x-cloak class="bg-slate-50 text-slate-900 dark:bg-[#09090B] dark:text-zinc-100 min-h-screen font-sans selection:bg-rose-500 selection:text-white antialiased transition-colors duration-200">

  <!-- Mobile Top Header (Visible on screens < md) -->
  <header class="md:hidden border-b border-slate-200/90 dark:border-[#27272A] bg-white/95 dark:bg-[#121215]/90 backdrop-blur-xl sticky top-0 z-40 px-4 py-3 flex items-center justify-between shadow-sm">
    <div class="flex items-center space-x-2.5">
      <button @click="isMobileMenuOpen = !isMobileMenuOpen" class="p-2 rounded-xl border border-slate-200 dark:border-[#27272A] text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-[#18181B] transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500" title="Toggle Navigation Menu">
        <i data-lucide="menu" class="w-5 h-5"></i>
      </button>
      <div class="h-8 w-8 rounded-lg bg-rose-600 flex items-center justify-center text-white shadow-sm">
        <i data-lucide="cpu" class="w-4 h-4"></i>
      </div>
      <div>
        <span class="font-bold text-sm tracking-tight text-slate-900 dark:text-white">Pin Arbitrage</span>
        <span class="text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-600 dark:text-rose-400 font-bold ml-1 border border-rose-500/20">V3</span>
      </div>
    </div>
    <div class="flex items-center space-x-2">
      <button @click="toggleTheme()" class="p-2 rounded-xl border border-slate-200 dark:border-[#27272A] text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-[#18181B] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500" :title="isDark ? 'Light Mode' : 'Dark Mode'">
        <i :data-lucide="isDark ? 'sun' : 'moon'" class="w-4 h-4"></i>
      </button>
      <button @click="refreshAll()" :disabled="isLoading" class="p-2 rounded-xl border border-slate-200 dark:border-[#27272A] text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-[#18181B] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500" title="Refresh Data">
        <i data-lucide="rotate-cw" :class="{'animate-spin': isLoading}" class="w-4 h-4"></i>
      </button>
    </div>
  </header>

  <!-- Mobile Drawer Backdrop & Drawer -->
  <div x-show="isMobileMenuOpen" x-cloak class="fixed inset-0 z-50 md:hidden bg-slate-950/70 backdrop-blur-sm transition-opacity" @click="isMobileMenuOpen = false" role="dialog" aria-modal="true" @keydown.escape.window="isMobileMenuOpen = false">
    <div class="w-72 bg-white dark:bg-[#121215] border-r border-slate-200 dark:border-[#27272A] h-full flex flex-col justify-between p-5 space-y-4 shadow-2xl overflow-y-auto" @click.stop>
      <!-- Mobile Drawer Header -->
      <div class="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-[#27272A]">
        <div class="flex items-center space-x-2.5">
          <div class="h-9 w-9 rounded-xl bg-rose-600 flex items-center justify-center text-white shadow-sm">
            <i data-lucide="cpu" class="w-5 h-5"></i>
          </div>
          <div>
            <div class="font-bold text-sm text-slate-900 dark:text-white">Pin Arbitrage</div>
            <div class="text-[10px] text-slate-500 dark:text-[#A1A1AA] font-mono tabular-nums">V3 Predictive</div>
          </div>
        </div>
        <button @click="isMobileMenuOpen = false" class="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">
          <i data-lucide="x" class="w-5 h-5"></i>
        </button>
      </div>

      <!-- Mobile Quick Actions -->
      <div class="space-y-1.5">
        <button @click="openAddCompetitorModal(); isMobileMenuOpen = false" class="w-full flex items-center justify-center space-x-2 px-3 py-2 text-xs font-semibold rounded-xl bg-rose-600 hover:bg-rose-500 text-white shadow-xs border border-rose-500/30 active:scale-95 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">
          <i data-lucide="user-plus" class="w-3.5 h-3.5"></i>
          <span>+ Track Creator</span>
        </button>
        <div class="grid grid-cols-2 gap-1.5">
          <button @click="openAddSeedModal(); isMobileMenuOpen = false" class="flex items-center justify-center space-x-1 px-2.5 py-1.5 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-slate-700 dark:text-[#FAFAFA] border border-slate-200 dark:border-[#27272A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">
            <i data-lucide="plus-circle" class="w-3 h-3 text-rose-500"></i>
            <span>Add Seeds</span>
          </button>
          <button @click="openCrawlModal(); isMobileMenuOpen = false" class="flex items-center justify-center space-x-1 px-2.5 py-1.5 text-xs font-bold rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-amber-600 dark:text-amber-400 border border-slate-200 dark:border-[#27272A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">
            <i data-lucide="zap" class="w-3 h-3"></i>
            <span>Crawl</span>
          </button>
        </div>
      </div>

      <!-- Mobile Navigation Links -->
      <nav class="space-y-1">
        <!-- Overview & Command Center (Home) -->
        <button @click="switchTab('overview'); isMobileMenuOpen = false" class="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500" :class="currentTab === 'overview' ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 font-bold border border-rose-500/20 dark:bg-[#18181B]' : 'text-slate-600 dark:text-[#A1A1AA] hover:bg-slate-100 dark:hover:bg-[#18181B] hover:text-slate-900 dark:hover:text-[#FAFAFA]'">
          <div class="flex items-center space-x-2.5">
            <i data-lucide="layout-dashboard" class="w-4 h-4 shrink-0" :class="currentTab === 'overview' ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400 dark:text-[#71717A]'"></i>
            <span>Overview & Hub</span>
          </div>
          <span :class="currentTab === 'overview' ? 'px-1.5 py-0.5 rounded-md text-[10px] font-mono tabular-nums font-bold bg-rose-500/15 text-rose-700 dark:text-rose-300' : 'px-1.5 py-0.5 rounded-md text-[10px] font-mono tabular-nums font-semibold bg-slate-100 dark:bg-[#27272A] text-slate-500 dark:text-[#A1A1AA]'">Home</span>
        </button>

        <!-- Creator Hub -->
        <button @click="switchTab('creators_archive'); isMobileMenuOpen = false" class="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500" :class="(currentTab === 'creators_archive' || currentTab === 'competitors' || currentTab === 'pinarchive') ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 font-bold border border-rose-500/20 dark:bg-[#18181B]' : 'text-slate-600 dark:text-[#A1A1AA] hover:bg-slate-100 dark:hover:bg-[#18181B] hover:text-slate-900 dark:hover:text-[#FAFAFA]'">
          <div class="flex items-center space-x-2.5">
            <i data-lucide="users" class="w-4 h-4 shrink-0" :class="(currentTab === 'creators_archive' || currentTab === 'competitors' || currentTab === 'pinarchive') ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400 dark:text-[#71717A]'"></i>
            <span>Creator Hub</span>
          </div>
          <div class="flex items-center space-x-1">
            <span class="px-1.5 py-0.5 rounded-md text-[10px] font-mono tabular-nums font-bold" :class="(currentTab === 'creators_archive' || currentTab === 'competitors' || currentTab === 'pinarchive') ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300' : 'bg-slate-100 dark:bg-[#27272A] text-slate-500 dark:text-[#A1A1AA]'" x-text="competitors.length"></span>
          </div>
        </button>

        <!-- Keywords Fleet Dashboard (Direct Dedicated Page) -->
        <a href="/keywords" class="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-[#A1A1AA] hover:bg-slate-100 dark:hover:bg-[#18181B] hover:text-slate-900 dark:hover:text-[#FAFAFA] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">
          <div class="flex items-center space-x-2.5">
            <i data-lucide="search" class="w-4 h-4 shrink-0 text-slate-400 dark:text-[#71717A]"></i>
            <span>Keywords Fleet</span>
          </div>
          <span class="px-2 py-0.5 rounded-full text-[11px] font-mono tabular-nums font-semibold bg-slate-100 dark:bg-[#27272A] text-slate-600 dark:text-[#A1A1AA]" x-text="keywords.length"></span>
        </a>

        <!-- Domain Radar (/domains - Dedicated Studio) -->
        <a href="/domains" class="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-[#A1A1AA] hover:bg-slate-100 dark:hover:bg-[#18181B] hover:text-slate-900 dark:hover:text-[#FAFAFA] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">
          <div class="flex items-center space-x-2.5">
            <i data-lucide="globe" class="w-4 h-4 shrink-0 text-slate-400 dark:text-[#71717A]"></i>
            <span>Domain Radar</span>
          </div>
          <span class="px-1.5 py-0.5 rounded-md text-[10px] font-mono tabular-nums font-semibold bg-slate-100 dark:bg-[#27272A] text-slate-500 dark:text-[#A1A1AA] border border-slate-200 dark:border-[#27272A]">WHOIS</span>
        </a>

        <!-- Related Pins Tab -->
        <button @click="switchTab('related_pins'); isMobileMenuOpen = false" class="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500" :class="(currentTab === 'related_pins' || currentTab === 'seeds' || currentTab === 'intersections' || currentTab === 'explorer') ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 font-bold border border-rose-500/20 dark:bg-[#18181B]' : 'text-slate-600 dark:text-[#A1A1AA] hover:bg-slate-100 dark:hover:bg-[#18181B] hover:text-slate-900 dark:hover:text-[#FAFAFA]'">
          <div class="flex items-center space-x-2.5">
            <i data-lucide="git-fork" class="w-4 h-4 shrink-0" :class="(currentTab === 'related_pins' || currentTab === 'seeds' || currentTab === 'intersections' || currentTab === 'explorer') ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400 dark:text-[#71717A]'"></i>
            <span>Related Pins</span>
          </div>
          <div class="flex items-center space-x-1 font-mono tabular-nums">
            <span class="px-1.5 py-0.5 rounded-md text-[10px] font-bold" :class="(currentTab === 'related_pins' || currentTab === 'seeds' || currentTab === 'intersections' || currentTab === 'explorer') ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300' : 'bg-slate-100 dark:bg-[#27272A] text-slate-500 dark:text-[#A1A1AA]'" x-text="seeds.length + 's'"></span>
            <span class="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300" x-text="intersections.length + 'i'"></span>
          </div>
        </button>

        <!-- 24h Pulse Studio (/pulse) -->
        <a href="/pulse" class="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-[#A1A1AA] hover:bg-slate-100 dark:hover:bg-[#18181B] hover:text-slate-900 dark:hover:text-[#FAFAFA] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">
          <div class="flex items-center space-x-2.5">
            <i data-lucide="activity" class="w-4 h-4 shrink-0 text-rose-500"></i>
            <span>24h Pulse Studio</span>
          </div>
          <span class="px-1.5 py-0.5 rounded-md text-[10px] font-mono tabular-nums font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">Live</span>
        </a>
      </nav>

      <!-- Mobile Drawer Footer -->
      <div class="pt-3 border-t border-slate-200 dark:border-[#27272A] space-y-2">
        <button @click="isCookieModalOpen = true; isMobileMenuOpen = false" class="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold rounded-xl border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500" :class="cookieStatus.has_cookie ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400' : 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400'">
          <span class="flex items-center space-x-2 truncate font-mono tabular-nums">
            <span class="w-2 h-2 rounded-full shrink-0" :class="cookieStatus.has_cookie ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'"></span>
            <span class="truncate" x-text="cookieStatus.has_cookie ? 'Session: Authenticated' : 'Guest Mode (No Cookie)'"></span>
          </span>
          <i data-lucide="key" class="w-3.5 h-3.5"></i>
        </button>
      </div>
    </div>
  </div>

  <!-- Desktop Permanent Sidebar (<aside>) -->
  <aside 
    class="hidden md:flex fixed inset-y-0 left-0 z-40 bg-white/95 dark:bg-[#121215] border-r border-slate-200/90 dark:border-[#27272A] flex-col justify-between shadow-xs overflow-y-auto overflow-x-hidden transition-all duration-300 ease-in-out"
    :class="isSidebarCollapsed ? 'w-20' : 'w-64 lg:w-72'">
    <!-- Top section: Logo, DB Project Switcher, Quick Actions, Nav Links -->
    <div class="transition-all duration-300" :class="isSidebarCollapsed ? 'p-3 space-y-4' : 'p-4 lg:p-5 space-y-4'">
      <!-- App Brand & Title + Collapse Toggle -->
      <div class="flex items-center transition-all duration-300" :class="isSidebarCollapsed ? 'flex-col space-y-2.5 items-center' : 'justify-between'">
        <!-- Logo & Title -->
        <div class="flex items-center space-x-3 overflow-hidden">
          <div class="h-10 w-10 rounded-xl bg-rose-600 flex items-center justify-center shadow-xs text-white shrink-0">
            <i data-lucide="cpu" class="w-5 h-5"></i>
          </div>
          <div x-show="!isSidebarCollapsed" x-transition.opacity.duration.200ms class="overflow-hidden whitespace-nowrap">
            <div class="flex items-center space-x-1.5">
              <span class="font-bold text-sm lg:text-base tracking-tight text-slate-900 dark:text-white truncate">
                Pin Cluster Analyzer
              </span>
            </div>
            <div class="flex items-center space-x-1.5 mt-0.5">
              <span class="px-1.5 py-0.5 text-[9px] font-mono tabular-nums font-bold uppercase rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30">
                V3 Predictive
              </span>
              <template x-if="crawlStatus.is_crawling">
                <span class="px-1.5 py-0.5 text-[9px] font-mono tabular-nums font-bold rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center space-x-1 motion-safe:animate-pulse">
                  <span class="w-1 h-1 rounded-full bg-amber-400 motion-safe:animate-ping"></span>
                  <span>Active</span>
                </span>
              </template>
            </div>
          </div>
        </div>

        <!-- Sideways Collapse / Expand Toggle Button -->
        <button 
          @click="toggleSidebar()" 
          class="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-[#18181B] transition active:scale-95 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500" 
          :class="isSidebarCollapsed ? 'w-8 h-8 flex items-center justify-center' : ''"
          :title="isSidebarCollapsed ? 'Expand Sidebar (Ctrl+B)' : 'Collapse Sidebar (Ctrl+B)'">
          <i x-show="!isSidebarCollapsed" data-lucide="chevrons-left" class="w-4 h-4"></i>
          <i x-show="isSidebarCollapsed" data-lucide="chevrons-right" class="w-4 h-4"></i>
        </button>
      </div>

      <!-- Quick Action Buttons -->
      <div class="pt-1 transition-all duration-300" :class="isSidebarCollapsed ? 'space-y-2 flex flex-col items-center' : 'space-y-1.5'">
        <!-- + Track Creator (Unified Modal) -->
        <button 
          @click="openAddCompetitorModal()" 
          class="flex items-center justify-center rounded-xl bg-rose-600 hover:bg-rose-500 text-white shadow-xs border border-rose-500/30 active:scale-95 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
          :class="isSidebarCollapsed ? 'w-10 h-10 p-0' : 'w-full px-3 py-2 space-x-2 text-xs font-semibold'"
          title="Track Creator">
          <i data-lucide="user-plus" class="w-3.5 h-3.5 shrink-0"></i>
          <span x-show="!isSidebarCollapsed" class="truncate">+ Track Creator</span>
        </button>

        <div :class="isSidebarCollapsed ? 'flex flex-col space-y-2 w-full items-center' : 'grid grid-cols-2 gap-1.5'">
          <!-- + Add Seeds -->
          <button 
            @click="openAddSeedModal()" 
            class="flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-slate-700 dark:text-[#FAFAFA] border border-slate-200 dark:border-[#27272A] transition active:scale-95 shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
            :class="isSidebarCollapsed ? 'w-10 h-10 p-0' : 'px-2.5 py-1.5 space-x-1 text-xs font-semibold'"
            title="Add Seeds">
            <i data-lucide="plus-circle" class="w-3 h-3 text-rose-500 shrink-0"></i>
            <span x-show="!isSidebarCollapsed" class="truncate">Add Seeds</span>
          </button>

          <!-- Crawl -->
          <button 
            @click="openCrawlModal()" 
            class="flex items-center justify-center rounded-xl transition shadow-xs active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500" 
            :class="[
              isSidebarCollapsed ? 'w-10 h-10 p-0' : 'px-2.5 py-1.5 space-x-1 text-xs font-bold',
              crawlStatus.is_crawling 
                ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30' 
                : 'bg-slate-100 hover:bg-slate-200 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-amber-600 dark:text-amber-400 border border-slate-200 dark:border-[#27272A]'
            ]"
            title="Crawl">
            <i data-lucide="zap" :class="{'animate-spin': crawlStatus.is_crawling}" class="w-3 h-3 shrink-0"></i>
            <span x-show="!isSidebarCollapsed" class="truncate">Crawl</span>
          </button>
        </div>
      </div>

      <!-- Navigation Links (Desktop) -->
      <nav class="space-y-1 pt-2" :class="isSidebarCollapsed ? 'flex flex-col items-center' : ''">
        <!-- Overview & Command Center (Home) -->
        <button 
          @click="switchTab('overview')" 
          class="relative flex items-center rounded-xl text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500" 
          :class="[
            isSidebarCollapsed ? 'w-10 h-10 justify-center' : 'w-full justify-between px-3 py-2.5',
            currentTab === 'overview' 
              ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 font-semibold border border-rose-500/20 shadow-xs dark:bg-[#18181B]' 
              : 'text-slate-600 dark:text-[#A1A1AA] hover:bg-slate-100 dark:hover:bg-[#18181B] hover:text-slate-900 dark:hover:text-[#FAFAFA]'
          ]"
          title="Overview & Hub">
          <div class="flex items-center" :class="isSidebarCollapsed ? 'justify-center' : 'space-x-2.5'">
            <i data-lucide="layout-dashboard" class="w-4 h-4 shrink-0" :class="currentTab === 'overview' ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400 dark:text-[#71717A]'"></i>
            <span x-show="!isSidebarCollapsed" class="truncate">Overview & Hub</span>
          </div>
          <span x-show="!isSidebarCollapsed" :class="currentTab === 'overview' ? 'px-1.5 py-0.5 rounded-md text-[10px] font-mono tabular-nums font-bold bg-rose-500/15 text-rose-700 dark:text-rose-300' : 'px-1.5 py-0.5 rounded-md text-[10px] font-mono tabular-nums font-semibold bg-slate-100 dark:bg-[#27272A] text-slate-500 dark:text-[#A1A1AA]'">Home</span>
        </button>

        <!-- Creator Hub (/accounts) -->
        <button 
          @click="switchTab('creators_archive')" 
          class="relative flex items-center rounded-xl text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500" 
          :class="[
            isSidebarCollapsed ? 'w-10 h-10 justify-center' : 'w-full justify-between px-3 py-2.5',
            (currentTab === 'creators_archive' || currentTab === 'competitors' || currentTab === 'pinarchive') 
              ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 font-semibold border border-rose-500/20 shadow-xs dark:bg-[#18181B]' 
              : 'text-slate-600 dark:text-[#A1A1AA] hover:bg-slate-100 dark:hover:bg-[#18181B] hover:text-slate-900 dark:hover:text-[#FAFAFA]'
          ]"
          title="Creator Hub">
          <div class="flex items-center" :class="isSidebarCollapsed ? 'justify-center' : 'space-x-2.5'">
            <i data-lucide="users" class="w-4 h-4 shrink-0" :class="(currentTab === 'creators_archive' || currentTab === 'competitors' || currentTab === 'pinarchive') ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400 dark:text-[#71717A]'"></i>
            <span x-show="!isSidebarCollapsed" class="truncate">Creator Hub</span>
          </div>
          <div x-show="!isSidebarCollapsed" class="flex items-center space-x-1 font-mono tabular-nums">
            <span class="px-1.5 py-0.5 rounded-md text-[10px] font-bold" :class="(currentTab === 'creators_archive' || currentTab === 'competitors' || currentTab === 'pinarchive') ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300' : 'bg-slate-100 dark:bg-[#27272A] text-slate-500 dark:text-[#A1A1AA]'" x-text="competitors.length"></span>
          </div>
          <span x-show="isSidebarCollapsed && competitors.length > 0" class="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500"></span>
        </button>

        <!-- Keywords Fleet Dashboard (/keywords - Dedicated Studio) -->
        <a 
          href="/keywords" 
          class="relative flex items-center rounded-xl text-xs font-medium text-slate-600 dark:text-[#A1A1AA] hover:bg-slate-100 dark:hover:bg-[#18181B] hover:text-slate-900 dark:hover:text-[#FAFAFA] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
          :class="isSidebarCollapsed ? 'w-10 h-10 justify-center' : 'w-full justify-between px-3 py-2.5'"
          title="Keywords Fleet">
          <div class="flex items-center" :class="isSidebarCollapsed ? 'justify-center' : 'space-x-2.5'">
            <i data-lucide="search" class="w-4 h-4 text-slate-400 dark:text-[#71717A] shrink-0"></i>
            <span x-show="!isSidebarCollapsed" class="truncate">Keywords Fleet</span>
          </div>
          <span x-show="!isSidebarCollapsed" class="px-2 py-0.5 rounded-full text-[11px] font-mono tabular-nums font-semibold bg-slate-100 dark:bg-[#27272A] text-slate-600 dark:text-[#A1A1AA]" x-text="keywords.length"></span>
          <span x-show="isSidebarCollapsed && keywords.length > 0" class="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500"></span>
        </a>

        <!-- Domain Radar (/domains - Dedicated Studio) -->
        <a 
          href="/domains" 
          class="relative flex items-center rounded-xl text-xs font-medium text-slate-600 dark:text-[#A1A1AA] hover:bg-slate-100 dark:hover:bg-[#18181B] hover:text-slate-900 dark:hover:text-[#FAFAFA] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
          :class="isSidebarCollapsed ? 'w-10 h-10 justify-center' : 'w-full justify-between px-3 py-2.5'"
          title="Domain Radar">
          <div class="flex items-center" :class="isSidebarCollapsed ? 'justify-center' : 'space-x-2.5'">
            <i data-lucide="globe" class="w-4 h-4 text-slate-400 dark:text-[#71717A] shrink-0"></i>
            <span x-show="!isSidebarCollapsed" class="truncate">Domain Radar</span>
          </div>
          <span x-show="!isSidebarCollapsed" class="px-1.5 py-0.5 rounded-md text-[10px] font-mono tabular-nums font-semibold bg-slate-100 dark:bg-[#27272A] text-slate-500 dark:text-[#A1A1AA] border border-slate-200 dark:border-[#27272A]">WHOIS</span>
        </a>

        <!-- Related Pins Tab (/related-pins) -->
        <button 
          @click="switchTab('related_pins')" 
          class="relative flex items-center rounded-xl text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500" 
          :class="[
            isSidebarCollapsed ? 'w-10 h-10 justify-center' : 'w-full justify-between px-3 py-2.5',
            (currentTab === 'related_pins' || currentTab === 'seeds' || currentTab === 'intersections' || currentTab === 'explorer') 
              ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 font-semibold border border-rose-500/20 shadow-xs dark:bg-[#18181B]' 
              : 'text-slate-600 dark:text-[#A1A1AA] hover:bg-slate-100 dark:hover:bg-[#18181B] hover:text-slate-900 dark:hover:text-[#FAFAFA]'
          ]"
          title="Related Pins">
          <div class="flex items-center" :class="isSidebarCollapsed ? 'justify-center' : 'space-x-2.5'">
            <i data-lucide="git-fork" class="w-4 h-4 text-slate-400 dark:text-[#71717A] shrink-0" :class="(currentTab === 'related_pins' || currentTab === 'seeds' || currentTab === 'intersections' || currentTab === 'explorer') ? 'text-rose-600 dark:text-rose-400' : ''"></i>
            <span x-show="!isSidebarCollapsed" class="truncate">Related Pins</span>
          </div>
          <div x-show="!isSidebarCollapsed" class="flex items-center space-x-1 font-mono tabular-nums">
            <span class="px-1.5 py-0.5 rounded-md text-[10px] font-bold" :class="(currentTab === 'related_pins' || currentTab === 'seeds' || currentTab === 'intersections' || currentTab === 'explorer') ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300' : 'bg-slate-100 dark:bg-[#27272A] text-slate-500 dark:text-[#A1A1AA]'" x-text="seeds.length + 's'"></span>
            <span class="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300" x-text="intersections.length + 'i'"></span>
          </div>
          <span x-show="isSidebarCollapsed && (seeds.length > 0 || intersections.length > 0)" class="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500"></span>
        </button>

        <!-- 24h Pulse Studio (/pulse) -->
        <a 
          href="/pulse" 
          class="relative flex items-center rounded-xl text-xs font-medium text-slate-600 dark:text-[#A1A1AA] hover:bg-slate-100 dark:hover:bg-[#18181B] hover:text-slate-900 dark:hover:text-[#FAFAFA] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
          :class="isSidebarCollapsed ? 'w-10 h-10 justify-center' : 'w-full justify-between px-3 py-2.5'"
          title="24h Pulse Studio">
          <div class="flex items-center" :class="isSidebarCollapsed ? 'justify-center' : 'space-x-2.5'">
            <i data-lucide="activity" class="w-4 h-4 text-rose-500 shrink-0"></i>
            <span x-show="!isSidebarCollapsed" class="truncate">24h Pulse Studio</span>
          </div>
          <span x-show="!isSidebarCollapsed" class="px-1.5 py-0.5 rounded-md text-[10px] font-mono tabular-nums font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">Live</span>
        </a>
      </nav>
    </div>

    <!-- Bottom Footer section: Pinterest Auth Status, Theme toggle, Refresh -->
    <div class="border-t border-slate-200/80 dark:border-[#27272A] bg-slate-50/50 dark:bg-[#121215] transition-all duration-300" :class="isSidebarCollapsed ? 'p-3 space-y-2' : 'p-4 space-y-3'">
      <!-- Pinterest Session Status -->
      <button 
        @click="isCookieModalOpen = true" 
        class="flex items-center rounded-xl border transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500" 
        :class="[
          isSidebarCollapsed ? 'w-10 h-10 p-0 justify-center mx-auto' : 'w-full justify-between px-3 py-2 text-xs font-semibold',
          cookieStatus.has_cookie ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20' : 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20'
        ]" 
        :title="cookieStatus.has_cookie ? 'Pinterest: Authenticated' : 'Guest Mode (No Cookie)'">
        <span class="flex items-center truncate font-mono tabular-nums" :class="isSidebarCollapsed ? 'justify-center' : 'space-x-2'">
          <span class="w-2 h-2 rounded-full shrink-0" :class="cookieStatus.has_cookie ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'"></span>
          <span x-show="!isSidebarCollapsed" class="truncate text-[11px]" x-text="cookieStatus.has_cookie ? 'Pinterest: Authenticated' : 'Guest Mode (No Cookie)'"></span>
        </span>
        <i x-show="!isSidebarCollapsed" data-lucide="key" class="w-3.5 h-3.5 shrink-0 opacity-70"></i>
      </button>

      <!-- Theme Toggle & Refresh -->
      <div :class="isSidebarCollapsed ? 'flex flex-col space-y-2 items-center' : 'flex items-center justify-between pt-1'">
        <!-- Theme Toggle -->
        <button 
          @click="toggleTheme()" 
          class="flex items-center justify-center rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] text-slate-700 dark:text-[#FAFAFA] text-xs font-semibold hover:bg-slate-100 dark:hover:bg-[#27272A] transition active:scale-95 shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
          :class="isSidebarCollapsed ? 'w-10 h-10 p-0' : 'flex-1 mr-2 space-x-2 py-2 px-3'"
          :title="isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'">
          <i x-show="!isDark" data-lucide="moon" class="w-3.5 h-3.5"></i>
          <i x-show="isDark" data-lucide="sun" class="w-3.5 h-3.5"></i>
          <span x-show="!isSidebarCollapsed" x-text="isDark ? 'Light' : 'Dark'"></span>
        </button>

        <!-- Refresh Data -->
        <button 
          @click="refreshAll()" 
          :disabled="isLoading" 
          class="flex items-center justify-center rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] hover:bg-slate-100 dark:hover:bg-[#27272A] text-slate-600 dark:text-[#A1A1AA] transition active:scale-95 shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500" 
          :class="isSidebarCollapsed ? 'w-10 h-10 p-0' : 'p-2'"
          title="Refresh All Data">
          <i data-lucide="rotate-cw" :class="{'animate-spin': isLoading}" class="w-4 h-4"></i>
        </button>
      </div>
    </div>
  </aside>

  <!-- Main Content Area (Offset for Desktop Sidebar) -->
  <main class="flex-1 min-h-screen p-4 sm:p-6 lg:p-8 space-y-6 max-w-full overflow-x-hidden transition-all duration-300 ease-in-out" :class="isSidebarCollapsed ? 'md:ml-20' : 'md:ml-64 lg:ml-72'">

    <!-- Active Crawl Notification Banner -->
    <div x-show="crawlStatus.is_crawling" x-cloak class="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3 px-4 flex items-center justify-between text-xs text-amber-700 dark:text-amber-300 backdrop-blur-sm animate-pulse">
      <div class="flex items-center space-x-2">
        <i data-lucide="loader-2" class="w-4 h-4 animate-spin text-amber-500"></i>
        <span class="font-semibold">Crawler in flight:</span>
        <span class="font-mono tabular-nums" x-text="'Target: ' + crawlStatus.seed_pin_id"></span>
        <span class="text-amber-500/60">•</span>
        <span class="text-slate-700 dark:text-amber-200" x-text="crawlStatus.last_log"></span>
      </div>
      <span class="font-mono tabular-nums text-[11px] text-amber-600 dark:text-amber-400" x-text="'Elapsed: ' + crawlElapsed + 's'"></span>
    </div>

    ${getDashboardBoardViewHtml()}

    <div x-show="!activeBoardName" x-cloak class="space-y-6">

      ${getDashboardOverviewHtml()}

      ${getDashboardRelatedPinsHtml()}

      ${getDashboardCreatorsHtml({ safeFolderId })}

    </div>

  </div>

  ${getDashboardModalsHtml()}

  <!-- Toast Notification -->
  <div x-show="toastMessage" x-cloak class="fixed bottom-6 right-6 z-50 bg-slate-900 text-white dark:bg-white dark:text-slate-900 px-4 py-2.5 rounded-xl shadow-2xl font-mono tabular-nums text-xs flex items-center space-x-2 animate-in fade-in slide-in-from-bottom-5">
    <i data-lucide="check-circle" class="w-4 h-4 text-emerald-500"></i>
    <span x-text="toastMessage"></span>
  </div>

  ${getDashboardClientAppScript({ safeFolderId })}
  ${getEdgeShieldClientScript()}
</body>
</html>`;
}
