/**
 * Dedicated Campaign Folders & Crossover Studio UI (Level 4)
 * Pure ES Module generating the full HTML application for /folders and /folders/:id.
 * Multi-keyword cluster hub: Super-pins overlap, raw visual tags bridge matrix,
 * co-occurring power pairs with mathematical lift, monopoly SOV breakdown, and topic blueprint.
 * Supports Full 1,788 Unique Pins pagination, advanced sorting, and Light/Dark Mode toggle.
 */

import { getEdgeShieldClientScript } from './edge-shield-client.mjs';
import { renderAppSidebar } from './ui/app-sidebar.mjs';
import { renderCampaignWorkspaceHeader } from './ui/campaign-workspace-header.mjs';

export function getCampaignFoldersPageHtml(folderId = '', initialRoom = '') {
  // Sanitize folderId against script/attribute injection
  const rawId = String(folderId || '').trim();
  const safeFolderId = rawId.replace(/[^a-zA-Z0-9_-]/g, '');
  const activeRoom = initialRoom === 'settings' ? 'settings' : 'crossover';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="referrer" content="same-origin">
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📌</text></svg>">
  <title>Campaign Folders & Crossover Studio | Pinterest Arbitrage</title>
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
    // Pre-hydrate dark mode immediately to avoid layout flash
    try {
      const savedTheme = localStorage.getItem('pin_theme') || localStorage.getItem('pa_theme');
      if (savedTheme === 'light') {
        document.documentElement.classList.remove('dark');
      } else {
        document.documentElement.classList.add('dark');
      }
    } catch (_) {}
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
    setTimeout(function() {
      if (typeof document !== 'undefined' && document.body && document.body.hasAttribute('x-cloak')) {
        document.body.removeAttribute('x-cloak');
      }
    }, 1200);
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
</head>
<body x-cloak class="bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 min-h-screen antialiased flex flex-col font-sans transition-colors duration-150" x-data="foldersApp('${safeFolderId}'${activeRoom === 'settings' ? ", 'settings'" : ''})">

  <!-- Toast Notification Container -->
  <div class="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
    <template x-for="toast in toasts" :key="toast.id">
      <div class="pointer-events-auto px-4 py-3 rounded-xl border text-xs shadow-2xl flex items-center justify-between gap-3 transition-all transform duration-300"
           :class="{
             'bg-emerald-50 dark:bg-emerald-950/90 border-emerald-500/40 text-emerald-900 dark:text-emerald-200': toast.type === 'success',
             'bg-rose-50 dark:bg-rose-950/90 border-rose-500/40 text-rose-900 dark:text-rose-200': toast.type === 'error',
             'bg-indigo-50 dark:bg-indigo-950/90 border-indigo-500/40 text-indigo-900 dark:text-indigo-200': toast.type === 'info',
             'bg-amber-50 dark:bg-amber-950/90 border-amber-500/40 text-amber-900 dark:text-amber-200': toast.type === 'warning'
           }">
        <span x-text="toast.message" class="font-medium"></span>
        <button @click="removeToast(toast.id)" class="text-slate-400 hover:text-slate-900 dark:hover:text-white text-xs">✕</button>
      </div>
    </template>
  </div>

  ${renderAppSidebar({ activeNav: 'folders', refreshHandler: 'loadFolders()' })}

  <!-- Main View (Offset for Unified Desktop Sidebar) [INVARIANT: UNIFIED-SIDEBAR-LAYOUT] -->
  <main class="flex-1 min-h-screen p-4 sm:p-6 lg:p-8 space-y-6 max-w-full overflow-x-hidden transition-all duration-300 ease-in-out" :class="isSidebarCollapsed ? 'md:ml-20' : 'md:ml-64 lg:ml-72'">

    <!-- [INVARIANT: UNIFIED-SIDEBAR-LAYOUT] Studio Header Card -->
    <template x-if="!activeFolderId">
      <section class="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#121215] border border-slate-200/80 dark:border-[#27272A]/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div class="flex items-center space-x-3.5">
          <div class="w-10 h-10 rounded-xl bg-pink-500/10 text-pink-600 dark:text-pink-400 border border-pink-500/20 flex items-center justify-center shadow-xs shrink-0">
            <i data-lucide="folder-kanban" class="w-5 h-5"></i>
          </div>
          <div>
            <div class="flex items-center space-x-2">
              <h2 class="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white">Campaign Folders Studio</h2>
              <span class="px-2 py-0.5 rounded-md text-[10px] font-mono tabular-nums font-semibold bg-pink-500/10 text-pink-600 dark:text-pink-400 border border-pink-500/20">Level 4</span>
            </div>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-normal">Multi-Keyword Clustering &amp; Crossover Matrix</p>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <a href="/keywords" class="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-[#27272A] transition inline-flex items-center space-x-1.5 shadow-2xs">
            <i data-lucide="arrow-left" class="w-3.5 h-3.5 text-slate-400"></i>
            <span>Keywords Fleet</span>
          </a>
          <a href="/keywords/discovery" class="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-[#27272A] transition inline-flex items-center space-x-1.5 shadow-2xs">
            <i data-lucide="compass" class="w-3.5 h-3.5 text-emerald-500"></i>
            <span>Discovery</span>
          </a>
          <a href="/pulse" class="px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-500/10 hover:bg-rose-500/20 dark:bg-rose-950/30 dark:hover:bg-rose-900/40 text-rose-600 dark:text-rose-400 border border-rose-500/20 transition inline-flex items-center space-x-1.5 shadow-2xs" title="24h Algorithmic Pulse & Crossover Radar">
            <i data-lucide="activity" class="w-3.5 h-3.5 text-rose-500"></i>
            <span>⚡ 24h Pulse Radar</span>
          </a>
          <button @click="openNewFolderModal = true" class="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-pink-600 hover:bg-pink-500 text-white transition inline-flex items-center space-x-1.5 shadow-xs active:scale-95 cursor-pointer">
            <i data-lucide="plus" class="w-3.5 h-3.5"></i>
            <span>+ New Folder</span>
          </button>
        </div>
      </section>
    </template>

    <!-- ========================================================================= -->
    <!-- VIEW A: STUDIO VIEW (/folders/:id)                                       -->
    <!-- ========================================================================= -->
    <div x-show="activeFolderId" class="flex flex-col gap-6" x-cloak>

      <!-- Shared Campaign Workspace Header -->
      ${renderCampaignWorkspaceHeader({ activeRoom, folderId: safeFolderId })}

      <!-- Room 1 Content (Crossover & Super-Pins) -->
      <div x-show="currentRoom !== 'settings'" class="flex flex-col gap-6">

      <!-- Studio Action Shortcuts -->
      <div class="flex items-center justify-between flex-wrap gap-3 -mt-2 mb-1">
        <div class="flex items-center gap-2">
          <span class="text-xs font-semibold text-slate-700 dark:text-slate-300">Room 1: Crossover &amp; 24h Pulse Studio</span>
          <span class="text-xs text-slate-400 font-mono tabular-nums" x-text="'(' + (activeFolder?.items?.length || crossoverData?.summary?.total_keywords || 0) + ' keywords in cluster)'"></span>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          <button @click="scrollToSection('visual-crossover-hub')" class="px-3.5 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/40 dark:hover:bg-purple-900/50 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/80 text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer" title="Jump to Visual Annotations, 3-Tag Triplets, Guided Capsules &amp; Color Swatches">
            <span>✨</span>
            <span>Visual &amp; Intent Matrix</span>
          </button>
          <button @click="runCrossoverAnalysis(true)" :disabled="crossoverLoading" class="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer">
            <span x-show="!crossoverLoading">⚡</span>
            <span x-show="crossoverLoading" class="animate-spin inline-block">⏳</span>
            <span x-text="crossoverLoading ? 'Recalculating Matrix...' : 'Re-Run Crossover Analysis'"></span>
          </button>
          <button @click="dispatchFolderDeepAudit()" :disabled="auditDispatching" class="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer" title="Partition all cluster pins across 20 parallel GitHub runners to deep inspect authentic saves, repins & CV annotations">
            <span x-show="!auditDispatching">🚀</span>
            <span x-show="auditDispatching" class="animate-spin inline-block">⏳</span>
            <span x-text="auditDispatching ? 'Launching 20 Runners...' : 'Deep Cluster Audit (20 Runners)'"></span>
          </button>
        </div>
      </div>

      <!-- Telemetry KPIs Bar -->
      <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div class="bg-white/90 dark:bg-[#121215]/90 border border-slate-200 dark:border-[#27272A] rounded-xl p-3.5 flex flex-col gap-1 shadow-sm">
          <span class="text-[10px] font-mono tabular-nums uppercase tracking-wider text-slate-500 dark:text-slate-400">Cluster Keywords</span>
          <span class="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white" x-text="crossoverData?.summary?.total_keywords || 0">0</span>
          <span class="text-[10px] text-slate-400 dark:text-slate-500">Tracked search SERPs</span>
        </div>
        <div class="bg-white/90 dark:bg-[#121215]/90 border border-slate-200 dark:border-[#27272A] rounded-xl p-3.5 flex flex-col gap-1 shadow-sm">
          <span class="text-[10px] font-mono tabular-nums uppercase tracking-wider text-slate-500 dark:text-slate-400">Total Unique Pins</span>
          <span class="text-xl font-bold font-mono tabular-nums text-sky-600 dark:text-sky-400" x-text="formatNumber(crossoverData?.summary?.total_unique_pins || (crossoverData?.all_pins?.length || 0))">0</span>
          <span class="text-[10px] text-slate-400 dark:text-slate-500">In folder snapshots</span>
        </div>
        <div class="bg-white/90 dark:bg-[#121215]/90 border border-slate-200 dark:border-[#27272A] rounded-xl p-3.5 flex flex-col gap-1 shadow-sm">
          <span class="text-[10px] font-mono tabular-nums uppercase tracking-wider text-slate-500 dark:text-slate-400">Super-Pins (>=2 Kw)</span>
          <span class="text-xl font-bold font-mono tabular-nums text-pink-600 dark:text-pink-400" x-text="formatNumber(crossoverData?.summary?.super_pins_count || (crossoverData?.super_pins?.length || 0))">0</span>
          <span class="text-[10px] text-slate-400 dark:text-slate-500">Cross-SERP dominators</span>
        </div>
        <div class="bg-white/90 dark:bg-[#121215]/90 border border-slate-200 dark:border-[#27272A] rounded-xl p-3.5 flex flex-col gap-1 shadow-sm">
          <span class="text-[10px] font-mono tabular-nums uppercase tracking-wider text-slate-500 dark:text-slate-400">Universal Bridges</span>
          <span class="text-xl font-bold font-mono tabular-nums text-indigo-600 dark:text-indigo-400" x-text="formatNumber(crossoverData?.summary?.universal_tags_count || 0)">0</span>
          <span class="text-[10px] text-slate-400 dark:text-slate-500">Visual tags (>=50% SERPs)</span>
        </div>
        <div class="bg-white/90 dark:bg-[#121215]/90 border border-slate-200 dark:border-[#27272A] rounded-xl p-3.5 flex flex-col gap-1 shadow-sm">
          <span class="text-[10px] font-mono tabular-nums uppercase tracking-wider text-slate-500 dark:text-slate-400">Shared Pivots</span>
          <span class="text-xl font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400" x-text="formatNumber(crossoverData?.summary?.shared_pivots_count || 0)">0</span>
          <span class="text-[10px] text-slate-400 dark:text-slate-500">Guided search connectors</span>
        </div>
        <div class="bg-white/90 dark:bg-[#121215]/90 border border-slate-200 dark:border-[#27272A] rounded-xl p-3.5 flex flex-col gap-1 shadow-sm">
          <span class="text-[10px] font-mono tabular-nums uppercase tracking-wider text-slate-500 dark:text-slate-400">Monopoly Entities</span>
          <span class="text-xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400" x-text="(crossoverData?.domain_monopoly?.length || 0) + ' domains'">0</span>
          <span class="text-[10px] text-slate-400 dark:text-slate-500">Top commercial players</span>
        </div>
      </div>

      <!-- Active Drill-Down Filter Banner -->
      <div x-show="entityFilter.type" class="bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-500/30 rounded-xl p-3 flex items-center justify-between shadow-sm" x-cloak>
        <div class="flex items-center gap-2 text-xs text-indigo-900 dark:text-indigo-200">
          <span class="font-bold">🎯 Active Drill-Down Filter:</span>
          <span class="font-mono tabular-nums uppercase text-[10px] px-1.5 py-0.5 rounded bg-indigo-200/60 dark:bg-indigo-500/20 text-indigo-800 dark:text-indigo-300" x-text="entityFilter.type"></span>
          <span class="font-mono tabular-nums font-semibold text-indigo-950 dark:text-white" x-text="entityFilter.value"></span>
        </div>
        <button @click="clearEntityFilter()" class="text-xs px-2.5 py-1 rounded-lg bg-indigo-100 hover:bg-indigo-200 dark:bg-indigo-500/20 dark:hover:bg-indigo-500/30 text-indigo-700 dark:text-indigo-300 transition-colors">
          ✕ Clear Drill-Down Filter
        </button>
      </div>

      <!-- Cluster Performance & Velocity Rollup Bar Across 6 Windows [INVARIANT: CLUSTER-ROLLUP-TELEMETRY] -->
      <div class="cluster-performance-rollup bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl p-4 shadow-sm flex flex-col gap-3">
        <div class="flex items-center justify-between flex-wrap gap-3">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 flex items-center justify-center font-bold text-xs">
              ⚡
            </div>
            <div>
              <h3 class="text-xs font-bold text-slate-900 dark:text-white tracking-tight uppercase font-mono">Cluster Performance &amp; Velocity Rollup Bar</h3>
              <p class="text-[11px] text-slate-500 dark:text-slate-400">Multi-window trajectory gains and audience acceleration across cluster search terms</p>
            </div>
          </div>

          <!-- Multi-Window Selector Buttons: 24h, 5d, 7d, 10d, 15d, All -->
          <div class="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A]">
            <template x-for="win in ['24h', '5d', '7d', '10d', '15d', 'all']" :key="win">
              <button @click="selectedTimeWindow = win" 
                      class="px-2.5 py-1 rounded-lg text-xs font-mono tabular-nums font-semibold transition-colors cursor-pointer"
                      :class="selectedTimeWindow === win ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'"
                      x-text="win === 'all' ? 'All' : win">
              </button>
            </template>
          </div>
        </div>

        <!-- Rollup Cards: Winning Pins, Saves Gains, Repins Gains, Avg Daily Velocity, Competitor Gains -->
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 pt-1">
          <div class="p-3 rounded-xl bg-slate-50 dark:bg-[#18181B]/60 border border-slate-200/80 dark:border-[#27272A] flex flex-col gap-1">
            <span class="text-[10px] uppercase font-mono tabular-nums text-slate-500 dark:text-slate-400">Winning Cluster Pins</span>
            <span class="text-base font-bold font-mono tabular-nums text-rose-600 dark:text-rose-400" x-text="formatNumber(crossoverData?.summary?.super_pins_count || crossoverData?.super_pins?.length || 0)">0</span>
            <span class="text-[10px] text-slate-400">Multi-ranking dominators</span>
          </div>
          <div class="p-3 rounded-xl bg-slate-50 dark:bg-[#18181B]/60 border border-slate-200/80 dark:border-[#27272A] flex flex-col gap-1">
            <span class="text-[10px] uppercase font-mono tabular-nums text-slate-500 dark:text-slate-400" x-text="'Saves Gains (' + selectedTimeWindow + ')'">Saves Gains</span>
            <span class="text-base font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400" x-text="'+' + formatNumber(clusterWindowSavesGains)">+0</span>
            <span class="text-[10px] text-slate-400">Cluster net saves gain</span>
          </div>
          <div class="p-3 rounded-xl bg-slate-50 dark:bg-[#18181B]/60 border border-slate-200/80 dark:border-[#27272A] flex flex-col gap-1">
            <span class="text-[10px] uppercase font-mono tabular-nums text-slate-500 dark:text-slate-400" x-text="'Repins Gains (' + selectedTimeWindow + ')'">Repins Gains</span>
            <span class="text-base font-bold font-mono tabular-nums text-sky-600 dark:text-sky-400" x-text="'+' + formatNumber(clusterWindowRepinsGains)">+0</span>
            <span class="text-[10px] text-slate-400">Cluster shared repins</span>
          </div>
          <div class="p-3 rounded-xl bg-slate-50 dark:bg-[#18181B]/60 border border-slate-200/80 dark:border-[#27272A] flex flex-col gap-1">
            <span class="text-[10px] uppercase font-mono tabular-nums text-slate-500 dark:text-slate-400">Avg Daily Velocity</span>
            <span class="text-base font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400" x-text="'+' + clusterAvgVelocity + '/d'">+0/d</span>
            <span class="text-[10px] text-slate-400">Per-pin daily momentum</span>
          </div>
          <div class="p-3 rounded-xl bg-slate-50 dark:bg-[#18181B]/60 border border-slate-200/80 dark:border-[#27272A] flex flex-col gap-1 col-span-2 sm:col-span-1">
            <span class="text-[10px] uppercase font-mono tabular-nums text-slate-500 dark:text-slate-400" x-text="'Competitor Gains (' + selectedTimeWindow + ')'">Competitor Gains</span>
            <span class="text-base font-bold font-mono tabular-nums text-indigo-600 dark:text-indigo-400" x-text="'+' + formatNumber(clusterCompetitorAudienceGains)">+0</span>
            <span class="text-[10px] text-slate-400">Audience &amp; reach expansion</span>
          </div>
        </div>
      </div>

      <!-- SECTION 1: Full Pins Table (Paginated 1,788 Unique Pins / Super-Pins) -->
      <div id="pins-table-section" class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl overflow-hidden shadow-sm dark:shadow-xl flex flex-col transition-colors">
        
        <!-- Table Title & Meta Bar -->
        <div class="p-4 border-b border-slate-200 dark:border-[#27272A] flex items-center justify-between flex-wrap gap-3">
          <div class="flex items-center gap-2">
            <span class="text-base" x-text="scopeFilter === 'super_only' ? '⭐' : (scopeFilter === 'active_only' ? '🟢' : (scopeFilter === 'vault_only' ? '🟣' : '📌'))">📌</span>
            <h3 class="text-sm font-semibold text-slate-900 dark:text-white tracking-tight" 
                x-text="scopeFilter === 'super_only' ? 'Multi-Ranking Super-Pins (Cross-SERP Dominators)' : (scopeFilter === 'active_only' ? 'Active SERP Dominators (Live Ranking Pins)' : (scopeFilter === 'vault_only' ? 'Displaced Vault Movers (Organic Cluster Pins)' : (scopeFilter === 'all' ? 'All Cluster Pins (Full Snapshot Dataset)' : 'Pins ranking for: ' + scopeFilter)))"></h3>
            <span class="text-xs text-slate-500 dark:text-slate-400" 
                  x-text="scopeFilter === 'super_only' ? '(Pins ranking across >= 2 cluster search terms)' : (scopeFilter === 'active_only' ? '(Pins actively ranking in live SERPs)' : (scopeFilter === 'vault_only' ? '(High-signal displaced organic pins in vault)' : '(Every verified pin across cluster search snapshots)'))"></span>
          </div>
          <div class="flex items-center gap-3">
            <span class="text-xs font-mono tabular-nums text-indigo-600 dark:text-indigo-400 font-bold" x-text="formatNumber(filteredPinsList().length) + ' pins matching'"></span>
            <span class="text-xs text-slate-300 dark:text-slate-600">|</span>
            <span class="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums" x-text="'Page ' + currentPage + ' of ' + totalPages()"></span>
          </div>
        </div>

        <!-- Integrated Toolbar: Scope Switcher, Sorter & Search Filter Bar -->
        <div class="p-3.5 bg-slate-50/80 dark:bg-slate-950/60 border-b border-slate-200 dark:border-[#27272A] flex items-center justify-between flex-wrap gap-3">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-xs font-medium text-slate-500 dark:text-slate-400 mr-1">Scope:</span>
            <button @click="scopeFilter = 'all'; currentPage = 1" 
                    class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                    :class="scopeFilter === 'all' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white dark:bg-[#18181B] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#27272A] border border-slate-200 dark:border-[#27272A]'">
              All Cluster Pins (<span x-text="formatNumber(crossoverData?.summary?.total_unique_pins || (crossoverData?.all_pins?.length || 0))"></span>)
            </button>
            <button @click="scopeFilter = 'active_only'; currentPage = 1" 
                    class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
                    :title="crossoverData?.summary?.active_serp_slots_count ? ('Unique active SERP pins (' + formatNumber(crossoverData.summary.active_serp_slots_count) + ' ranked slots)') : 'Unique active SERP pins'"
                    :class="scopeFilter === 'active_only' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-white dark:bg-[#18181B] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#27272A] border border-slate-200 dark:border-[#27272A]'">
              <span>🟢</span> Active SERP (<span x-text="formatNumber(crossoverData?.summary?.active_pins_count || (crossoverData?.all_pins?.filter(p => p.has_active_rank)?.length || 0))"></span>)
            </button>
            <button @click="scopeFilter = 'vault_only'; currentPage = 1" 
                    class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
                    :class="scopeFilter === 'vault_only' ? 'bg-purple-600 text-white shadow-sm' : 'bg-white dark:bg-[#18181B] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#27272A] border border-slate-200 dark:border-[#27272A]'">
              <span>🟣</span> Vault Movers (<span x-text="formatNumber(crossoverData?.summary?.vault_pins_count || (crossoverData?.all_pins?.filter(p => !p.has_active_rank && p.has_vault_rank)?.length || 0))"></span>)
            </button>
            <button @click="scopeFilter = 'super_only'; currentPage = 1" 
                    class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
                    :class="scopeFilter === 'super_only' ? 'bg-pink-600 text-white shadow-sm' : 'bg-white dark:bg-[#18181B] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#27272A] border border-slate-200 dark:border-[#27272A]'">
              <span>⭐</span> Super-Pins Only (<span x-text="formatNumber(crossoverData?.summary?.super_pins_count || (crossoverData?.super_pins?.length || 0))"></span>)
            </button>
            <button type="button" @click="onlySurging24h = !onlySurging24h; currentPage = 1" :class="onlySurging24h ? 'bg-rose-600 text-white border-rose-500 shadow-xs' : 'bg-white dark:bg-[#18181B] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-[#27272A] hover:bg-slate-100 dark:hover:bg-[#27272A]'" class="px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-all flex items-center gap-1.5 cursor-pointer"><span>⚡</span><span>24h Surges</span><span class="px-1.5 py-0.2 text-[10px] font-mono tabular-nums rounded-full bg-rose-500/20 text-rose-600 dark:text-rose-300" x-text="formatNumber(crossoverData?.summary?.surging_24h_count || 0)"></span></button>
            <button type="button" @click="onlyFreshRockets = !onlyFreshRockets; currentPage = 1" :class="onlyFreshRockets ? 'bg-amber-600 text-white border-amber-500 shadow-xs' : 'bg-white dark:bg-[#18181B] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-[#27272A] hover:bg-slate-100 dark:hover:bg-[#27272A]'" class="px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-all flex items-center gap-1.5 cursor-pointer"><span>🚀</span><span>Rockets (≤14d)</span><span class="px-1.5 py-0.2 text-[10px] font-mono tabular-nums rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-300" x-text="formatNumber(crossoverData?.summary?.rockets_count || 0)"></span></button>
            <button type="button" @click="onlyBreakoutBabyDomains = !onlyBreakoutBabyDomains; currentPage = 1" :class="onlyBreakoutBabyDomains ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-zinc-800/60 text-zinc-400 border-zinc-700/50 hover:bg-zinc-800'" class="px-2.5 py-1 text-xs font-medium rounded-lg border transition-all flex items-center gap-1.5 cursor-pointer"><span>🐣</span><span>Breakout Baby Domains (<2y + 7d Gains)</span></button>
            <button type="button" @click="onlyVacuumPins = !onlyVacuumPins; currentPage = 1" :class="onlyVacuumPins ? 'bg-rose-500/20 text-rose-300 border-rose-500/40' : 'bg-zinc-800/60 text-zinc-400 border-zinc-700/50 hover:bg-zinc-800'" class="px-2.5 py-1 text-xs font-medium rounded-lg border transition-all flex items-center gap-1.5 cursor-pointer"><span>🎯</span><span>Linkless Vacuums</span><span x-show="crossoverData?.summary?.vacuum_pins_count" class="px-1.5 py-0.2 text-[10px] rounded-full bg-rose-500/30 text-rose-200" x-text="crossoverData?.summary?.vacuum_pins_count"></span></button>
            <template x-if="activeFolder?.items?.length">
              <select x-model="scopeFilter" @change="currentPage = 1" class="bg-white dark:bg-[#18181B] text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-[#27272A] rounded-lg text-xs py-1.5 px-2.5 font-mono tabular-nums shadow-sm">
                <option value="all">Filter by Keyword (All)</option>
                <template x-for="item in activeFolder.items" :key="item.keyword">
                  <option :value="item.keyword" x-text="item.keyword"></option>
                </template>
              </select>
            </template>
          </div>

          <div class="flex items-center gap-3 flex-wrap">
            <!-- Sort Dropdown -->
            <div class="flex items-center gap-1.5 text-xs">
              <span class="text-slate-500 dark:text-slate-400">Sort:</span>
              <select x-model="sortBy" @change="currentPage = 1" class="bg-white dark:bg-[#18181B] text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-[#27272A] rounded-lg text-xs py-1.5 px-2.5 font-mono tabular-nums shadow-sm">
                <option value="velocity_desc">Daily Velocity (Fastest)</option>
                <option value="repins_24h_desc">24h Repins Surge (Highest)</option>
                <option value="saves_desc">Total Saves (High → Low)</option>
                <option value="saves_asc">Total Saves (Low → High)</option>
                <option value="pin_age_asc">Pin Age (Youngest First)</option>
                <option value="pin_age_desc">Pin Age (Oldest First)</option>
                <option value="folder_age_desc">Days in Folder (Longest)</option>
                <option value="folder_age_asc">Days in Folder (Recent)</option>
                <option value="rank_asc">Best Rank (#1 First)</option>
                <option value="overlap_desc">Cross-SERP Overlap (Most)</option>
                <option value="title_asc">Title (A → Z)</option>
              </select>
            </div>

            <!-- Search Filter -->
            <div class="relative">
              <input type="text" x-model.debounce.150ms="searchQuery" @input="currentPage = 1" placeholder="Filter pins by title, domain, or tag..."
                     class="w-64 pl-8 pr-3 py-1.5 bg-white dark:bg-slate-950 border border-slate-300 dark:border-[#27272A] rounded-lg text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 font-sans focus:outline-none focus:border-indigo-500 shadow-sm">
              <span class="absolute left-2.5 top-1.5 text-slate-400 text-xs">🔍</span>
            </div>
            
             <a href="#visual-crossover-hub" @click.prevent="scrollToSection('visual-crossover-hub')" class="text-xs font-semibold text-purple-600 dark:text-purple-400 hover:text-purple-500 transition-colors flex items-center gap-1 ml-1" title="Jump to Visual Annotations & Power Pairs">
               <span>✨ Visual Hub ↓</span>
             </a>
           </div>
         </div>

         <!-- Active Structural Pattern / Entity Filter Bar -->
         <div x-show="activeMatrixFilter || entityFilter.type" x-cloak class="px-4 py-2.5 bg-purple-500/10 dark:bg-purple-950/40 border-b border-purple-500/20 flex items-center justify-between flex-wrap gap-2 text-xs font-mono tabular-nums">
           <div class="flex items-center gap-2 flex-wrap">
             <template x-if="activeMatrixFilter">
               <div class="flex items-center gap-2">
                 <span class="px-2 py-0.5 rounded bg-purple-600 text-white text-[10px] font-bold uppercase" x-text="activeMatrixFilter.badge || 'Matrix Pattern'"></span>
                 <span class="font-bold text-purple-900 dark:text-purple-200" x-text="activeMatrixFilter.label"></span>
                 <span class="text-purple-600 dark:text-purple-400 text-[11px]" x-text="'(' + formatNumber(filteredPinsList().length) + ' matching pins)'"></span>
               </div>
             </template>
             <template x-if="entityFilter.type">
               <div class="flex items-center gap-2">
                 <span class="px-2 py-0.5 rounded bg-indigo-600 text-white text-[10px] font-bold uppercase" x-text="entityFilter.type"></span>
                 <span class="font-bold text-indigo-900 dark:text-indigo-200" x-text="entityFilter.value"></span>
               </div>
             </template>
           </div>
           <div class="flex items-center gap-2">
             <template x-if="activeMatrixFilter">
               <button type="button" @click="clearMatrixFilter()" class="px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-600 dark:text-rose-300 font-bold transition cursor-pointer flex items-center gap-1">
                 <span>✕</span>
                 <span>Clear Pattern Filter</span>
               </button>
             </template>
             <template x-if="entityFilter.type">
               <button type="button" @click="clearEntityFilter()" class="px-2.5 py-1 rounded-lg bg-slate-200 hover:bg-slate-300 dark:bg-[#27272A] text-slate-700 dark:text-slate-200 font-bold transition cursor-pointer flex items-center gap-1">
                 <span>✕</span>
                 <span>Clear Entity</span>
               </button>
             </template>
           </div>
         </div>

         <div class="overflow-x-auto">
           <table class="w-full text-left text-xs font-mono tabular-nums">
             <thead class="bg-slate-50 dark:bg-slate-950/80 border-b border-slate-200 dark:border-[#27272A] text-slate-500 dark:text-slate-400 uppercase text-[10px]">
               <tr>
                 <th class="p-3.5 w-12 text-center">#</th>
                 <th class="p-3.5">Pin Image & Dossier</th>
                 <th class="p-3.5">Cross-SERP Overlap & Ranks</th>
                 <th class="p-3.5">Domain & Creator</th>
                 <th class="p-3.5 cursor-pointer hover:text-indigo-600 dark:hover:text-white transition-colors" @click="toggleSort('pin_age')">
                   Pin Age &amp; Tenure <span x-text="sortBy === 'pin_age_asc' ? '↑' : (sortBy === 'pin_age_desc' ? '↓' : '↕')"></span>
                 </th>
                 <th class="p-3.5 cursor-pointer hover:text-indigo-600 dark:hover:text-white transition-colors" @click="toggleSort('saves')">
                   Total Saves <span x-text="sortBy === 'saves_desc' ? '↓' : (sortBy === 'saves_asc' ? '↑' : '↕')"></span>
                 </th>
                 <th class="p-3.5 cursor-pointer hover:text-indigo-600 dark:hover:text-white transition-colors" @click="toggleSort('velocity')">
                   Daily Velocity <span x-text="sortBy === 'velocity_desc' ? '↓' : '↕'"></span>
                 </th>
                 <th class="p-3.5 text-right">Actions</th>
               </tr>
             </thead>
             <tbody class="divide-y divide-slate-200 dark:divide-slate-800/60 text-slate-700 dark:text-slate-300">
               <template x-for="(sp, idx) in paginatedPins()" :key="sp.pin_id">
                 <tr :data-pin-id="sp.pin_id" class="hover:bg-slate-50 dark:hover:bg-[#27272A]/40 transition-colors">
                   <td class="p-3.5 text-center font-mono tabular-nums text-slate-400 dark:text-slate-500 text-[11px]" x-text="(currentPage - 1) * pageSize + idx + 1"></td>
                   <td class="p-3.5">
                     <div class="flex items-center gap-3">
                       <a :href="'/pins/' + sp.pin_id + '?folder_id=' + encodeURIComponent(activeFolder?.id || activeFolderId || '') + '&folder=' + encodeURIComponent(activeFolder?.name || '') + '&return_url=' + encodeURIComponent('/folders/' + (activeFolder?.id || activeFolderId || ''))" class="w-10 h-14 rounded bg-slate-100 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A] overflow-hidden flex-shrink-0 block hover:ring-2 hover:ring-indigo-500 transition">
                         <img :src="sp.image_url || 'data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2260%22 height=%2290%22 viewBox=%220 0 60 90%22><rect width=%2260%22 height=%2290%22 rx=%224%22 fill=%22%2318181b%22/><text x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%2352525b%22 font-family=%22monospace%22 font-size=%2210%22>PIN</text></svg>'" 
                              class="w-full h-full object-cover"
                              loading="lazy"
                              onerror="window.handlePinImgError(this)">
                       </a>
                       <div class="flex flex-col gap-1 max-w-xs">
                         <!-- // [INVARIANT-LOCK: DO NOT REMOVE - ENFORCED BY verify_regression_locks.mjs] Lock 5: Context-Preserving Pin Navigation -->
                         <a :href="'/pins/' + sp.pin_id + '?folder_id=' + encodeURIComponent(activeFolder?.id || activeFolderId || '') + '&folder=' + encodeURIComponent(activeFolder?.name || '') + '&return_url=' + encodeURIComponent('/folders/' + (activeFolder?.id || activeFolderId || ''))" 
                            class="font-semibold text-slate-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors truncate block" 
                            x-text="sp.title || ('Pin #' + sp.pin_id)"></a>
                         <div class="flex items-center gap-1.5 flex-wrap">
                           <span class="text-[9px] font-mono tabular-nums px-1 py-0.2 rounded bg-slate-100 dark:bg-[#18181B] text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-[#27272A]" 
                                 x-text="sp.format || 'ORGANIC PIN'"></span>
                           <span class="text-[9px] font-mono tabular-nums text-slate-500" x-text="sp.aspect_ratio || '2:3'"></span>
                           <!-- Breakout Baby Domain Badge -->
                           <template x-if="(Number(sp.domain_age_days || (sp.domain_age_years ? sp.domain_age_years * 365 : 0)) > 0) && (Number(sp.domain_age_days || (sp.domain_age_years ? sp.domain_age_years * 365 : 0)) <= 730) && (Number(sp.gains_7d || (sp.daily_save_velocity ? sp.daily_save_velocity * 7 : 0)) >= 15)">
                             <span class="text-[9px] font-mono tabular-nums px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 font-semibold"
                                   title="Breakout Baby Domain (<2y + 7d Gains >= 15)">
                               🐣 Baby Breakout
                             </span>
                           </template>
                           <!-- Linkless Vacuum Pin Badge -->
                           <template x-if="sp.is_vacuum_pin || ((!sp.domain || sp.domain === 'Uploaded by user') && Number(sp.save_count || 0) >= 100)">
                             <span class="text-[9px] font-mono tabular-nums px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 font-semibold"
                                   title="Linkless SERP Vacuum (High Saves, No Outbound Domain)">
                               🎯 Vacuum
                             </span>
                           </template>
                         </div>

                         <!-- Pinterest Computer Vision Visual Annotations -->
                         <div class="flex items-center gap-1 flex-wrap pt-1" x-show="sp.visual_annotations?.length">
                           <template x-for="va in (sp.visual_annotations || []).slice(0, 3)" :key="typeof va === 'object' && va !== null ? (va.name || va.tag || va.label || va.term || '') : va">
                             <button @click="applyMatrixFilter({ tag: (typeof va === 'object' && va !== null ? (va.name || va.tag || va.label || va.term || '') : va), raw_tag: (typeof va === 'object' && va !== null ? (va.name || va.tag || va.label || va.term || '') : va) }, 'anchors')" 
                                     class="text-[9px] font-mono tabular-nums px-1.5 py-0.5 rounded bg-indigo-50/80 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/60 transition-colors truncate max-w-[130px] text-left cursor-pointer" 
                                     :title="'Filter cluster pins by visual tag: ' + (typeof va === 'object' && va !== null ? (va.name || va.tag || va.label || va.term || '') : va)"
                                     x-text="'👁️ ' + (typeof va === 'object' && va !== null ? (va.name || va.tag || va.label || va.term || '') : va)"></button>
                           </template>
                           <span x-show="sp.visual_annotations?.length > 3" 
                                 class="text-[9px] font-mono tabular-nums text-slate-400 dark:text-slate-500 cursor-help"
                                 :title="(sp.visual_annotations || []).slice(3).map(tag => typeof tag === 'object' && tag !== null ? (tag.name || tag.tag || tag.label || tag.term || '') : tag).join(', ')"
                                 x-text="'+' + (sp.visual_annotations.length - 3) + ' more'"></span>
                         </div>
                       </div>
                     </div>
                   </td>

                   <td class="p-3.5">
                     <div class="flex flex-col gap-1.5">
                       <div class="flex items-center gap-1.5 flex-wrap">
                         <template x-for="rk in (expandedPinRanks[sp.pin_id] ? getSortedPinRankings(sp) : getSortedPinRankings(sp).slice(0, 4))" :key="rk.keyword_id || rk.keyword">
                           <span class="px-2 py-0.5 rounded text-[10px] font-mono tabular-nums border flex items-center gap-1"
                                 :class="rk.is_displaced
                                   ? 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30'
                                   : rk.rank_position <= 3 
                                   ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30' 
                                   : rk.rank_position <= 10 
                                   ? 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/30' 
                                   : 'bg-slate-100 dark:bg-[#18181B] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-[#27272A]'">
                             <span x-show="rk.is_displaced" class="text-[9px]">🟣</span>
                             <span x-text="rk.keyword"></span>
                             <span class="font-bold" x-text="'#' + rk.rank_position"></span>
                             <span x-show="rk.is_displaced" class="text-[9px] font-normal opacity-80">(Vault)</span>
                           </span>
                         </template>
                         <template x-if="(sp.rankings || []).length > 4">
                           <button type="button"
                                   @click="expandedPinRanks[sp.pin_id] = !expandedPinRanks[sp.pin_id]"
                                   class="px-2 py-0.5 rounded text-[10px] font-mono tabular-nums font-bold bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30 transition cursor-pointer"
                                   x-text="expandedPinRanks[sp.pin_id] ? 'Show less ↑' : ('+' + ((sp.rankings || []).length - 4) + ' more keywords')"></button>
                         </template>
                       </div>
                       <div class="flex items-center gap-2 flex-wrap">
                         <span class="text-[10px] text-slate-500 dark:text-slate-400" x-text="'Ranks in ' + sp.overlap_count + ' keyword' + (sp.overlap_count > 1 ? 's' : '') + ' (' + sp.overlap_percentage + '% coverage)'"></span>
                         <template x-if="sp.bridge_tags && sp.bridge_tags.length">
                           <span class="text-[9px] font-mono tabular-nums px-1.5 py-0.2 rounded bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 font-semibold"
                                 :title="'Universal Bridge Tags: ' + sp.bridge_tags.join(', ')"
                                 x-text="'🌉 ' + sp.bridge_tags.length + ' Bridges'"></span>
                         </template>
                       </div>
                     </div>
                   </td>

                   <td class="p-3.5 font-sans">
                     <div class="flex flex-col gap-0.5">
                       <button @click="setEntityFilter('domain', sp.domain)" 
                               class="text-xs font-semibold text-slate-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 text-left transition-colors truncate max-w-[140px]" 
                               x-text="sp.domain || 'direct'"></button>
                       <div class="flex items-center gap-1.5">
                         <button @click="setEntityFilter('creator', sp.creator_username)" 
                                 class="text-[11px] text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 text-left transition-colors truncate max-w-[120px]" 
                                 x-text="'@' + (sp.creator_username || 'anonymous')"></button>
                         <template x-if="sp.creator_username">
                           <button @click.stop="openCreatorVisualFeed(sp.creator_username)"
                                   class="p-0.5 rounded text-slate-400 hover:text-emerald-500 hover:bg-emerald-500/10 transition"
                                   title="⚡ Instant 50-Pin Visual Feed (<350ms)">
                             <i data-lucide="layout-grid" class="w-3 h-3 text-emerald-500"></i>
                           </button>
                         </template>
                       </div>
                     </div>
                   </td>

                   <td class="p-3.5 font-mono tabular-nums">
                     <div class="flex flex-col gap-1">
                       <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-[#18181B] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#27272A] inline-flex items-center gap-1 w-fit"
                             :title="'Created on Pinterest: ' + (sp.created_at_pinterest || 'N/A') + ' (' + (sp.pin_age_days != null ? sp.pin_age_days + ' days' : 'unknown') + ')'">
                         <span>⏳</span>
                         <span x-text="formatUniversalAge(sp.pin_age_days)"></span>
                       </span>
                       <template x-if="sp.folder_age_days != null">
                         <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 inline-flex items-center gap-1 w-fit"
                               :title="'Added to folder: ' + sp.folder_age_days + ' days ago'">
                           <span>📁</span>
                           <span x-text="sp.folder_age_days + 'd in folder'"></span>
                         </span>
                       </template>
                     </div>
                   </td>

                   <td class="p-3.5 font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400" x-text="formatNumber(sp.save_count)"></td>
                   <td class="p-3.5 font-mono tabular-nums text-amber-600 dark:text-amber-400">
                     <div class="flex flex-col gap-0.5">
                       <span class="font-bold" x-text="'+' + formatNumber(sp.effective_velocity ?? sp.daily_save_velocity ?? 0) + '/d'"></span>
                       <template x-if="(sp.delta_repins_24h || 0) > 0">
                         <span class="text-[10px] text-sky-500 dark:text-sky-400 font-semibold" x-text="'+' + formatNumber(sp.delta_repins_24h) + ' repins (24h)'"></span>
                       </template>
                       <template x-if="sp.gains_7d != null">
                         <span class="text-[9px] text-slate-400" x-text="'+' + formatNumber(sp.gains_7d) + ' (7d)'"></span>
                       </template>
                     </div>
                   </td>

                   <td class="p-3.5 text-right font-sans">
                     <div class="flex items-center justify-end gap-1.5">
                       <button type="button" @click="copyPinBlueprint(sp)" class="px-2 py-1 rounded-lg bg-rose-50 hover:bg-rose-600 hover:text-white dark:bg-rose-950/40 dark:hover:bg-rose-600 text-rose-700 dark:text-rose-300 text-xs font-semibold border border-rose-200 dark:border-rose-800/80 transition-colors inline-flex items-center gap-1 cursor-pointer shadow-2xs" title="Copy Scientific Pin Blueprint">
                         <span>⚡</span>
                         <span>Blueprint</span>
                       </button>
                       <a :href="'/pins/' + sp.pin_id + '?folder_id=' + encodeURIComponent(activeFolder?.id || activeFolderId || '') + '&folder=' + encodeURIComponent(activeFolder?.name || '') + '&return_url=' + encodeURIComponent('/folders/' + (activeFolder?.id || activeFolderId || ''))" class="px-2 py-1 rounded-lg bg-slate-100 dark:bg-[#18181B] hover:bg-indigo-600 hover:text-white dark:hover:bg-indigo-600 text-slate-700 dark:text-slate-300 text-xs font-semibold border border-slate-200 dark:border-[#27272A] transition-colors inline-flex items-center gap-1 shadow-2xs" title="Open Full Pin Dossier">
                         <span>↗</span>
                       </a>
                     </div>
                   </td>
                 </tr>
               </template>

              <tr x-show="crossoverLoading">
                <td colspan="8" class="p-10 text-center text-slate-500 font-sans">
                  <div class="flex items-center justify-center gap-2.5">
                    <span class="animate-spin inline-block text-indigo-500 text-lg">⏳</span>
                    <span class="font-medium text-slate-600 dark:text-slate-300">Loading cluster snapshots and computing crossover matrix...</span>
                  </div>
                </td>
              </tr>

              <tr x-show="!crossoverLoading && !filteredPinsList().length">
                <td colspan="8" class="p-8 text-center text-slate-500 font-sans">
                  No pins found matching your current filter settings.
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Table Pagination Footer -->
        <div class="flex items-center justify-between p-3 border-t border-slate-200 dark:border-[#27272A] bg-slate-50/60 dark:bg-slate-950/40 text-xs font-mono tabular-nums" x-show="filteredPinsList().length > 0">
          <div class="flex items-center gap-2.5">
            <span class="text-slate-500 dark:text-slate-400 hidden sm:inline" 
                  x-text="'Showing ' + (filteredPinsList().length ? ((currentPage - 1) * pageSize + 1) : 0) + '–' + Math.min(currentPage * pageSize, filteredPinsList().length) + ' of ' + formatNumber(filteredPinsList().length) + ' pins'"></span>
            <div class="flex items-center gap-1 text-[11px] text-slate-400">
              <span>Density:</span>
              <select 
                x-model.number="pageSize" 
                @change="currentPage = 1"
                class="py-0.5 px-1.5 rounded border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] font-mono tabular-nums text-[11px] focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-900 dark:text-white cursor-pointer"
              >
                <option :value="10">10 / page</option>
                <option :value="25">25 / page</option>
                <option :value="50">50 / page</option>
                <option :value="100">100 / page</option>
              </select>
            </div>
          </div>
          <div class="flex items-center gap-1.5 ml-auto sm:ml-0">
            <button 
              :disabled="currentPage <= 1" 
              @click="currentPage = Math.max(1, (parseInt(currentPage, 10) || 1) - 1); scrollToSection('pins-table-section')" 
              class="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] disabled:opacity-40 cursor-pointer hover:bg-slate-50 dark:hover:bg-[#27272A] transition-colors shadow-2xs">
              ← Prev
            </button>
            <div class="flex items-center gap-1 text-slate-500 dark:text-slate-400">
              <span>Page</span>
              <input 
                type="number" 
                min="1" 
                :max="totalPages()" 
                x-model.number="currentPage" 
                @change="currentPage = Math.max(1, Math.min(totalPages(), parseInt(currentPage, 10) || 1)); scrollToSection('pins-table-section')"
                class="w-12 text-center py-0.5 px-1 rounded border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] font-mono tabular-nums text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-900 dark:text-white" 
              />
              <span x-text="'/ ' + totalPages()"></span>
            </div>
            <button 
              :disabled="currentPage >= totalPages()" 
              @click="currentPage = Math.min(totalPages(), (parseInt(currentPage, 10) || 1) + 1); scrollToSection('pins-table-section')" 
              class="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] disabled:opacity-40 cursor-pointer hover:bg-slate-50 dark:hover:bg-[#27272A] transition-colors shadow-2xs">
              Next →
            </button>
          </div>
        </div>
      </div>

      <!-- SECTION 2: VISUAL ANNOTATIONS, INTENT MATRIX & COLOR STUDIO (Cluster-Scoped Mirror of /pulse Master-Detail Split View) -->
      <div id="visual-crossover-hub" class="p-6 rounded-3xl bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] space-y-5 shadow-sm dark:shadow-xl transition-colors shared-annotations-hub">
        <!-- Hub Header -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-[#27272A]">
          <div class="flex items-center space-x-3">
            <div class="w-10 h-10 rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center text-lg font-bold">
              ✨
            </div>
            <div>
              <div class="flex items-center space-x-2 flex-wrap gap-y-1">
                <h3 class="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">Visual Annotations, Intent Matrix &amp; Color Studio</h3>
                <span class="px-2.5 py-0.5 rounded-full text-[10px] font-mono tabular-nums font-bold bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30"
                      x-text="powerPairs.length + ' Pairs • ' + powerTriplets.length + ' Triplets • ' + coreAnchorsList.length + ' Bridges'"></span>
              </div>
              <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Click any N-gram pair, triplet, visual bridge, guided search capsule, or color swatch on the left to inspect its surging cluster pins on the right.</p>
            </div>
          </div>

          <div class="flex items-center gap-2 flex-wrap">
            <template x-if="activeMatrixFilter">
              <button type="button" @click="clearMatrixFilter()" class="px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-500/15 text-rose-600 dark:text-rose-400 hover:bg-rose-500/25 transition flex items-center space-x-1.5 cursor-pointer">
                <span>✕</span>
                <span x-text="'Clear Table Filter: ' + activeMatrixFilter.label"></span>
              </button>
            </template>
            <button type="button" @click="copyAnnotations()" class="px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 transition flex items-center gap-1.5 cursor-pointer">
              <span>📋</span>
              <span>Copy All Annotations</span>
            </button>
          </div>
        </div>

        <!-- Unified 5-Tab Matrix Navigation Bar -->
        <div class="flex items-center justify-between gap-3 flex-wrap p-2 rounded-2xl bg-slate-50 dark:bg-[#18181B]/70 border border-slate-200 dark:border-[#27272A] text-xs font-mono tabular-nums">
          <div class="flex items-center gap-2 flex-wrap">
            <button type="button" @click="switchMatrixTab('pairs')" :class="(visualHubTab === 'pairs' || visualHubTab === 'all') ? 'bg-purple-600 text-white font-bold shadow-xs' : 'bg-white dark:bg-[#121215] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-[#27272A] hover:border-purple-500/40'" class="px-3 py-1.5 rounded-xl transition cursor-pointer">
              ⚡ 2-Tag Power Pairs (<span x-text="powerPairs.length"></span>)
            </button>
            <button type="button" @click="switchMatrixTab('triplets')" :class="visualHubTab === 'triplets' ? 'bg-rose-600 text-white font-bold shadow-xs' : 'bg-white dark:bg-[#121215] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-[#27272A] hover:border-rose-500/40'" class="px-3 py-1.5 rounded-xl transition cursor-pointer">
              🔺 3-Tag Triplets (<span x-text="powerTriplets.length"></span>)
            </button>
            <button type="button" @click="switchMatrixTab('anchors')" :class="visualHubTab === 'anchors' ? 'bg-sky-600 text-white font-bold shadow-xs' : 'bg-white dark:bg-[#121215] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-[#27272A] hover:border-sky-500/40'" class="px-3 py-1.5 rounded-xl transition cursor-pointer">
              🏷️ 1-Tag Power Leaders &amp; Bridges (<span x-text="coreAnchorsList.length"></span>)
            </button>
            <button type="button" @click="switchMatrixTab('guided')" :class="visualHubTab === 'guided' ? 'bg-amber-600 text-white font-bold shadow-xs' : 'bg-white dark:bg-[#121215] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-[#27272A] hover:border-amber-500/40'" class="px-3 py-1.5 rounded-xl transition cursor-pointer">
              🎯 Guided Search Capsules (<span x-text="(crossoverData?.guided_pivots || []).length"></span>)
            </button>
            <button type="button" @click="switchMatrixTab('colors')" :class="visualHubTab === 'colors' ? 'bg-emerald-600 text-white font-bold shadow-xs' : 'bg-white dark:bg-[#121215] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-[#27272A] hover:border-emerald-500/40'" class="px-3 py-1.5 rounded-xl transition cursor-pointer">
              🎨 Dominant Color Swatches (<span x-text="(crossoverData?.dominant_colors || []).length"></span>)
            </button>
          </div>

          <!-- Search & Sort Controls for Active Matrix Tab -->
          <div class="flex items-center gap-2 flex-wrap">
            <template x-if="visualHubTab === 'anchors'">
              <div class="flex items-center gap-1 text-[11px]">
                <button type="button" @click="anchorsTier = 'all'; selectedMatrixIndex = 0" :class="anchorsTier === 'all' ? 'bg-sky-600 text-white font-bold' : 'bg-white dark:bg-[#121215] text-slate-500 border border-slate-200 dark:border-[#27272A]'" class="px-2 py-1 rounded-lg cursor-pointer">All</button>
                <button type="button" @click="anchorsTier = 'universal'; selectedMatrixIndex = 0" :class="anchorsTier === 'universal' ? 'bg-sky-600 text-white font-bold' : 'bg-white dark:bg-[#121215] text-slate-500 border border-slate-200 dark:border-[#27272A]'" class="px-2 py-1 rounded-lg cursor-pointer" title="Tags bridging >= 50% of cluster keywords">🌉 Bridges (≥50%)</button>
                <button type="button" @click="anchorsTier = 'whales'; selectedMatrixIndex = 0" :class="anchorsTier === 'whales' ? 'bg-sky-600 text-white font-bold' : 'bg-white dark:bg-[#121215] text-slate-500 border border-slate-200 dark:border-[#27272A]'" class="px-2 py-1 rounded-lg cursor-pointer" title="Tags appearing on >= 25 pins">💎 Whales (≥25)</button>
              </div>
            </template>

            <div class="relative">
              <input type="text"
                     x-model="matrixSearch"
                     @input="selectedMatrixIndex = 0"
                     placeholder="Filter patterns or keywords..."
                     class="px-3 py-1.5 pl-8 rounded-xl text-xs bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500/30 w-44 sm:w-52 font-sans">
              <span class="absolute left-2.5 top-1.5 text-xs text-slate-400">🔍</span>
              <button x-show="matrixSearch" @click="matrixSearch = ''; selectedMatrixIndex = 0" class="absolute right-2.5 top-1.5 text-xs text-slate-400 hover:text-slate-600 cursor-pointer">✕</button>
            </div>

            <select x-model="matrixSort" @change="selectedMatrixIndex = 0" class="px-2.5 py-1.5 rounded-xl bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] text-slate-800 dark:text-slate-200 text-xs font-sans focus:outline-none cursor-pointer">
              <option value="velocity_desc">⚡ Sort: 24h Velocity (Fastest)</option>
              <option value="freq_desc">🔥 Sort: Pin Count (Most Pins)</option>
              <option value="keywords_desc">🌉 Sort: Keyword Coverage (Most KWs)</option>
              <option value="lift_desc">🚀 Sort: Synergy Lift / Score</option>
              <option value="saves_desc">💎 Sort: Combined Saves</option>
            </select>
          </div>
        </div>

        <!-- MASTER-DETAIL SPLIT VIEW (12 Columns: 5 Cols Left Master List + 7 Cols Right Matching Surging Pins) -->
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <!-- LEFT PANEL (5 Cols): Master Pattern List -->
          <div class="lg:col-span-5 rounded-2xl border border-slate-200 dark:border-[#27272A] bg-slate-50/50 dark:bg-slate-950/60 overflow-hidden flex flex-col">
            <div class="px-4 py-3 border-b border-slate-200 dark:border-[#27272A] bg-slate-100/70 dark:bg-[#18181B]/80 flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold">
              <span x-text="getActiveMatrixTitle()"></span>
              <span x-text="getActiveMatrixItems().length + ' items'"></span>
            </div>

            <div class="divide-y divide-slate-200/80 dark:divide-[#27272A]/70 max-h-[680px] overflow-y-auto">
              <template x-for="(item, mIdx) in getActiveMatrixItems().slice(0, matrixListLimit)" :key="item._key || mIdx">
                <div @click="selectMatrixItem(item, mIdx)"
                     :class="isMatrixItemSelected(item, mIdx)
                       ? 'bg-purple-500/10 dark:bg-purple-500/15 border-l-4 border-l-purple-500'
                       : 'hover:bg-white dark:hover:bg-[#18181B]/70 border-l-4 border-l-transparent'"
                     class="p-3.5 transition-all cursor-pointer flex flex-col gap-2">
                  <div class="flex items-start justify-between gap-2">
                    <div class="flex items-center gap-2 min-w-0 flex-wrap">
                      <span class="text-[10px] font-mono tabular-nums text-slate-400 font-bold" x-text="'#' + (mIdx + 1)"></span>

                      <!-- 2-Tag Power Pair Label -->
                      <template x-if="visualHubTab === 'pairs' || visualHubTab === 'all'">
                        <div class="flex items-center gap-1.5 flex-wrap">
                          <span class="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25 text-xs font-bold" x-text="item.tag_a"></span>
                          <span class="text-purple-500 font-bold text-xs">+</span>
                          <span class="px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/25 text-xs font-bold" x-text="item.tag_b"></span>
                        </div>
                      </template>

                      <!-- 3-Tag Triplet Label -->
                      <template x-if="visualHubTab === 'triplets'">
                        <div class="flex items-center gap-1 flex-wrap">
                          <template x-for="(tg, tIdx) in (item.tags || [])" :key="tg">
                            <div class="flex items-center gap-1">
                              <span x-show="tIdx > 0" class="text-rose-500 font-bold text-[10px]">+</span>
                              <span class="px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/25 text-[11px] font-bold" x-text="tg"></span>
                            </div>
                          </template>
                        </div>
                      </template>

                      <!-- 1-Tag Power Leader / Bridge Label -->
                      <template x-if="visualHubTab === 'anchors'">
                        <div class="flex items-center gap-1.5 min-w-0">
                          <span x-text="item.is_universal ? '🌉' : '🏷️'" class="text-xs"></span>
                          <span class="text-xs font-bold text-slate-900 dark:text-white truncate" x-text="item.tag"></span>
                          <template x-if="item.overlap_percentage >= 50">
                            <span class="px-1.5 py-0.2 rounded text-[9px] font-mono tabular-nums font-bold bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30" x-text="item.overlap_percentage + '% SERPs'"></span>
                          </template>
                        </div>
                      </template>

                      <!-- Guided Search Capsule Label -->
                      <template x-if="visualHubTab === 'guided'">
                        <div class="flex items-center gap-2 min-w-0">
                          <span class="w-3 h-3 rounded-full shrink-0 border border-black/10 dark:border-white/20" :style="'background-color: ' + (item.dominant_color || '#f59e0b')"></span>
                          <span class="text-xs font-bold text-slate-900 dark:text-white truncate" x-text="item.display_label || item.term"></span>
                          <span class="px-1.5 py-0.2 rounded text-[9px] font-mono tabular-nums bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 font-bold" x-text="'Score ' + (item.composite_score || 0)"></span>
                        </div>
                      </template>

                      <!-- Dominant Color Swatch Label -->
                      <template x-if="visualHubTab === 'colors'">
                        <div class="flex items-center gap-2.5 min-w-0">
                          <span class="w-6 h-6 rounded-lg shrink-0 border border-black/15 dark:border-white/20 shadow-inner" :style="'background-color: ' + item.hex"></span>
                          <span class="text-xs font-bold font-mono tabular-nums text-slate-900 dark:text-white" x-text="item.hex"></span>
                        </div>
                      </template>
                    </div>

                    <!-- Right-side Velocity Badge -->
                    <div class="flex items-center gap-1.5 shrink-0 font-mono tabular-nums">
                      <span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                            x-text="'⚡ +' + formatNumber(item.total_velocity ?? item.velocity_gain ?? 0) + '/d'"></span>
                    </div>
                  </div>

                  <!-- Bottom Metrics Sub-bar -->
                  <div class="flex items-center justify-between gap-2 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    <div class="flex items-center gap-2 flex-wrap">
                      <span class="font-semibold text-indigo-600 dark:text-indigo-400"
                            x-text="(item.keywords_count || item.keyword_count || item.shared_count || item.keyword_overlap_count || 1) + ' keywords'"></span>
                      <span>•</span>
                      <span class="font-bold text-slate-700 dark:text-slate-200"
                            x-text="(item.joint_count || item.pin_count || item.count || 0) + ' pins'"></span>
                      <template x-if="item.lift">
                        <span class="px-1.5 py-0.2 rounded text-[9px] bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 font-bold"
                              x-text="item.lift + 'x Lift'"></span>
                      </template>
                      <template x-if="(item.total_repins_delta || 0) > 0">
                        <span class="text-sky-600 dark:text-sky-400 text-[10px]" x-text="'+' + formatNumber(item.total_repins_delta) + ' repins'"></span>
                      </template>
                    </div>
                    <template x-if="(item.total_saves || 0) > 0">
                      <span class="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold" x-text="formatNumber(item.total_saves) + ' saves'"></span>
                    </template>
                  </div>
                </div>
              </template>

              <div x-show="getActiveMatrixItems().length === 0" class="p-8 text-center text-xs text-slate-400 font-mono tabular-nums">
                No visual patterns match your current search filter.
              </div>
            </div>

            <!-- Show More / Collapse Footer in Left Master Panel -->
            <div x-show="getActiveMatrixItems().length > 25" class="p-2.5 border-t border-slate-200 dark:border-[#27272A] bg-slate-100/60 dark:bg-[#18181B]/60 flex items-center justify-between text-[11px] font-mono tabular-nums">
              <span class="text-slate-500" x-text="'Showing ' + Math.min(matrixListLimit, getActiveMatrixItems().length) + ' of ' + getActiveMatrixItems().length"></span>
              <div class="flex items-center gap-1.5">
                <button type="button" x-show="matrixListLimit < getActiveMatrixItems().length" @click="matrixListLimit += 30" class="px-2.5 py-1 rounded-lg bg-purple-500/15 text-purple-600 dark:text-purple-400 font-bold hover:bg-purple-500/25 transition cursor-pointer">+30 More</button>
                <button type="button" x-show="matrixListLimit > 30" @click="matrixListLimit = 30" class="px-2 py-1 rounded-lg bg-slate-200 dark:bg-[#27272A] text-slate-600 dark:text-slate-300 font-bold cursor-pointer">Collapse</button>
              </div>
            </div>
          </div>

          <!-- RIGHT PANEL (7 Cols): MATCHING SURGING PINS INSPECTOR -->
          <div class="lg:col-span-7 rounded-2xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-slate-950/80 overflow-hidden flex flex-col">
            <template x-if="getSelectedMatrixItem()">
              <div class="flex flex-col">
                <!-- Selected Pattern Inspector Header -->
                <div class="p-4 border-b border-slate-200 dark:border-[#27272A] bg-slate-50/80 dark:bg-[#18181B]/70 space-y-3">
                  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div class="flex items-center gap-2.5 flex-wrap">
                      <span class="px-2 py-0.5 rounded bg-purple-600 text-white text-[10px] font-mono tabular-nums font-bold uppercase">Matching Cluster Pins</span>
                      <h4 class="text-sm font-black text-slate-900 dark:text-white font-mono tabular-nums" x-text="getMatrixItemLabel(getSelectedMatrixItem())"></h4>
                    </div>
                    <div class="flex items-center gap-2 flex-wrap">
                      <button type="button"
                              @click="applyMatrixFilter(getSelectedMatrixItem(), visualHubTab)"
                              class="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold font-mono tabular-nums transition flex items-center gap-1.5 cursor-pointer shadow-xs">
                        <span>🎯</span>
                        <span>Filter Cluster Table (<span x-text="getMatchingPinsForMatrixItem(getSelectedMatrixItem(), visualHubTab).length"></span> pins) ↑</span>
                      </button>
                      <button type="button"
                              @click="copyMatrixItemBlueprint(getSelectedMatrixItem(), visualHubTab)"
                              class="px-2.5 py-1.5 rounded-xl bg-white dark:bg-[#121215] hover:bg-slate-100 dark:hover:bg-[#27272A] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-[#27272A] text-xs font-bold font-mono tabular-nums transition flex items-center gap-1 cursor-pointer">
                        <span>📋</span>
                        <span>Blueprint</span>
                      </button>
                    </div>
                  </div>

                  <!-- Pattern Summary KPIs & Connected Keywords Strip -->
                  <div class="flex items-center gap-2 flex-wrap text-[11px] font-mono tabular-nums">
                    <span class="px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 font-bold"
                          x-text="(getSelectedMatrixItem().keywords_count || getSelectedMatrixItem().keyword_count || getSelectedMatrixItem().shared_count || 1) + ' Cluster Keywords'"></span>
                    <span class="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-bold"
                          x-text="'⚡ +' + formatNumber(getSelectedMatrixItem().total_velocity ?? getSelectedMatrixItem().velocity_gain ?? 0) + '/d save velocity'"></span>
                    <template x-if="(getSelectedMatrixItem().total_saves || 0) > 0">
                      <span class="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-[#121215] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#27272A] font-semibold"
                            x-text="formatNumber(getSelectedMatrixItem().total_saves) + ' combined saves'"></span>
                    </template>
                    <template x-if="getSelectedMatrixItem().lift">
                      <span class="px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 font-bold"
                            x-text="getSelectedMatrixItem().lift + 'x Synergy Lift'"></span>
                    </template>
                  </div>

                  <template x-if="(getSelectedMatrixItem().keywords || []).length > 0">
                    <div class="flex items-center gap-1.5 flex-wrap pt-0.5">
                      <span class="text-[10px] font-mono tabular-nums uppercase text-slate-400">SERPs:</span>
                      <template x-for="kw in (getSelectedMatrixItem().keywords || []).slice(0, 8)" :key="kw">
                        <button type="button" @click="scopeFilter = kw; currentPage = 1; scrollToSection('pins-table-section')" class="px-2 py-0.5 rounded bg-white dark:bg-[#121215] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#27272A] hover:border-indigo-500 text-[10px] font-mono tabular-nums transition cursor-pointer" x-text="kw"></button>
                      </template>
                      <span x-show="(getSelectedMatrixItem().keywords || []).length > 8" class="text-[10px] font-mono tabular-nums text-slate-400" x-text="'+' + ((getSelectedMatrixItem().keywords || []).length - 8) + ' more'"></span>
                    </div>
                  </template>
                </div>

                <!-- 2-Column Grid of Matching Surging Cluster Pins -->
                <div class="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3.5 max-h-[600px] overflow-y-auto">
                  <template x-for="mp in getMatchingPinsForMatrixItem(getSelectedMatrixItem(), visualHubTab).slice(0, 24)" :key="mp.pin_id">
                    <div class="p-3 rounded-2xl bg-slate-50/70 dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] hover:border-purple-500/50 transition flex flex-col justify-between gap-2.5 shadow-2xs">
                      <div class="flex items-start gap-3">
                        <a :href="'/pins/' + mp.pin_id + '?folder_id=' + encodeURIComponent(activeFolder?.id || activeFolderId || '') + '&folder=' + encodeURIComponent(activeFolder?.name || '') + '&return_url=' + encodeURIComponent('/folders/' + (activeFolder?.id || activeFolderId || ''))" class="w-16 h-24 rounded-xl overflow-hidden border border-slate-200 dark:border-[#27272A] bg-slate-100 dark:bg-[#18181B] shrink-0 block hover:ring-2 hover:ring-purple-500 transition">
                          <img :src="mp.image_url || 'data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2260%22 height=%2290%22 viewBox=%220 0 60 90%22><rect width=%2260%22 height=%2290%22 rx=%224%22 fill=%22%2318181b%22/><text x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%2352525b%22 font-family=%22monospace%22 font-size=%2210%22>PIN</text></svg>'"
                               class="w-full h-full object-cover"
                               loading="lazy"
                               onerror="window.handlePinImgError(this)">
                        </a>
                        <div class="flex flex-col gap-1 min-w-0 flex-1">
                          <a :href="'/pins/' + mp.pin_id + '?folder_id=' + encodeURIComponent(activeFolder?.id || activeFolderId || '') + '&folder=' + encodeURIComponent(activeFolder?.name || '') + '&return_url=' + encodeURIComponent('/folders/' + (activeFolder?.id || activeFolderId || ''))"
                             class="text-xs font-bold text-slate-900 dark:text-white hover:text-purple-600 dark:hover:text-purple-400 transition line-clamp-2 leading-snug"
                             x-text="mp.title || ('Pin #' + mp.pin_id)"></a>

                          <div class="flex items-center gap-1.5 flex-wrap font-mono tabular-nums text-[10px]">
                            <span class="px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold border border-emerald-500/25"
                                  x-text="'+' + formatNumber(mp.effective_velocity ?? mp.daily_save_velocity ?? 0) + '/d'"></span>
                            <template x-if="(mp.delta_repins_24h || 0) > 0">
                              <span class="px-1.5 py-0.2 rounded bg-sky-500/15 text-sky-600 dark:text-sky-400 font-bold"
                                    x-text="'+' + formatNumber(mp.delta_repins_24h) + ' repins'"></span>
                            </template>
                            <span class="text-slate-500 dark:text-slate-400 font-semibold" x-text="formatNumber(mp.save_count || 0) + ' saves'"></span>
                            <span class="text-slate-400" x-text="'⏳ ' + formatUniversalAge(mp.pin_age_days)"></span>
                          </div>

                          <div class="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400 truncate">
                            <span class="font-semibold text-slate-700 dark:text-slate-300 truncate" x-text="mp.domain || 'Uploaded by user'"></span>
                            <template x-if="mp.creator_username">
                              <span class="truncate" x-text="'• @' + mp.creator_username"></span>
                            </template>
                          </div>

                          <!-- Visual Annotations on Matching Pin -->
                          <div class="flex items-center gap-1 flex-wrap pt-0.5" x-show="mp.visual_annotations && mp.visual_annotations.length">
                            <template x-for="va in (mp.visual_annotations || []).slice(0, 4)" :key="typeof va === 'object' && va !== null ? (va.name || va.tag || va.label || va.term || '') : va">
                              <span class="px-1.5 py-0.2 rounded text-[9px] font-mono tabular-nums border truncate max-w-[125px]"
                                    :class="isTagHighlightedInSelectedPattern(typeof va === 'object' && va !== null ? (va.name || va.tag || va.label || va.term || '') : va)
                                      ? 'bg-purple-500/20 text-purple-700 dark:text-purple-200 border-purple-500/40 font-bold'
                                      : 'bg-white dark:bg-[#18181B] text-slate-500 dark:text-slate-400 border-slate-200 dark:border-[#27272A]'"
                                    x-text="'#' + (typeof va === 'object' && va !== null ? (va.name || va.tag || va.label || va.term || '') : va)"></span>
                            </template>
                          </div>
                        </div>
                      </div>

                      <div class="pt-2 border-t border-slate-200/70 dark:border-[#27272A]/80 flex items-center justify-between gap-2 font-mono tabular-nums text-[10px]">
                        <button type="button" @click="copyPinBlueprint(mp)" class="px-2 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-600 hover:text-white text-rose-600 dark:text-rose-400 font-bold border border-rose-500/20 transition cursor-pointer">
                          ⚡ Blueprint
                        </button>
                        <a :href="'/pins/' + mp.pin_id + '?folder_id=' + encodeURIComponent(activeFolder?.id || activeFolderId || '') + '&folder=' + encodeURIComponent(activeFolder?.name || '') + '&return_url=' + encodeURIComponent('/folders/' + (activeFolder?.id || activeFolderId || ''))" class="text-indigo-600 dark:text-indigo-400 hover:underline font-bold">
                          Full Dossier ↗
                        </a>
                      </div>
                    </div>
                  </template>
                </div>
              </div>
            </template>

            <div x-show="!getSelectedMatrixItem()" class="p-12 text-center text-xs text-slate-400 font-mono tabular-nums">
              Select any visual pattern on the left to inspect its matching cluster pins.
            </div>
          </div>
        </div>
      </div>
    </div>
    <!-- End of Room 1 Content -->

      <!-- ROOM 5 VIEW: Dedicated Folder Settings & Smart Bulk Pin Pruning Studio -->
      <!-- // [INVARIANT-LOCK: DO NOT REMOVE - ENFORCED BY verify_regression_locks.mjs] Lock 1: Room 1 & Room 5 Sibling DOM Hierarchy -->
      <div x-show="currentRoom === 'settings'" class="space-y-6" x-cloak>
        <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl p-6 shadow-sm">
          <div class="flex items-center justify-between flex-wrap gap-4 pb-6 border-b border-slate-100 dark:border-[#27272A]">
            <div>
              <h3 class="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>⚙️</span>
                <span>Room 5: Campaign Folder Settings &amp; Smart Bulk Pin Pruning</span>
              </h3>
              <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">Configure automated fleet crawling controls, harvest quotas, and clean out low-performing pins.</p>
            </div>
            <div class="flex items-center gap-2">
              <button type="button" @click="saveFolderSettings(false)" :disabled="settingsLoading" class="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition flex items-center gap-1.5 shadow-sm cursor-pointer">
                <span x-text="settingsLoading ? 'Saving Settings...' : 'Save Settings'"></span>
              </button>
            </div>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-6">
            <!-- Left: Fleet Execution & Crawler Controls -->
            <div class="space-y-4">
              <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">Crawler &amp; Fleet Execution Controls</h4>
              
              <!-- Pause Competitor Crawlers Toggle -->
              <div class="p-4 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50/60 dark:bg-[#18181B]/60 flex items-center justify-between">
                <div>
                  <div class="text-xs font-semibold text-slate-900 dark:text-white">Pause Competitor Crawlers</div>
                  <div class="text-[11px] text-slate-500 dark:text-slate-400">Temporarily prevent competitor profile and board scraping for this folder.</div>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" x-model="folderSettings.pause_competitors" class="sr-only peer">
                  <div class="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rose-600"></div>
                </label>
              </div>

              <!-- Pause SERP Crawlers Toggle -->
              <div class="p-4 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50/60 dark:bg-[#18181B]/60 flex items-center justify-between">
                <div>
                  <div class="text-xs font-semibold text-slate-900 dark:text-white">Pause SERP Crawlers</div>
                  <div class="text-[11px] text-slate-500 dark:text-slate-400">Suspend automated daily SERP ranking snapshots for folder keywords.</div>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" x-model="folderSettings.pause_crawlers" class="sr-only peer">
                  <div class="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rose-600"></div>
                </label>
              </div>

              <!-- Emergency Block Fleet Toggle -->
              <div class="p-4 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50/60 dark:bg-[#18181B]/60 flex items-center justify-between">
                <div>
                  <div class="text-xs font-semibold text-slate-900 dark:text-white">Block Fleet Ingestion</div>
                  <div class="text-[11px] text-slate-500 dark:text-slate-400">Hard stop: refuse all incoming GitHub Actions fleet crawler batches.</div>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" x-model="folderSettings.block_fleet" class="sr-only peer">
                  <div class="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rose-600"></div>
                </label>
              </div>

              <!-- Auto-Discover Creators Toggle -->
              <div class="p-4 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50/60 dark:bg-[#18181B]/60 flex items-center justify-between">
                <div>
                  <div class="text-xs font-semibold text-slate-900 dark:text-white">Auto-Discover Creators</div>
                  <div class="text-[11px] text-slate-500 dark:text-slate-400">Automatically register active ranking creators from SERP crawls into Creator Hub.</div>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" x-model="folderSettings.auto_discover_creators" class="sr-only peer">
                  <div class="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rose-600"></div>
                </label>
              </div>
            </div>

            <!-- Right: Quotas & Smart Bulk Pin Pruning -->
            <div class="space-y-4">
              <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">Harvest Quotas &amp; Pruning Engine</h4>

              <div class="p-4 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50/60 dark:bg-[#18181B]/60 space-y-3">
                <div class="flex items-center justify-between">
                  <label class="text-xs font-semibold text-slate-900 dark:text-white">Max SERP Pins Harvest Quota</label>
                  <span class="text-xs font-mono font-bold text-rose-600 dark:text-rose-400" x-text="folderSettings.max_serp_pins + ' pins'"></span>
                </div>
                <input type="range" min="20" max="250" step="10" x-model="folderSettings.max_serp_pins" @input="folderSettings.max_pins = folderSettings.max_serp_pins" class="w-full accent-rose-600">
                <div class="flex justify-between text-[10px] text-slate-400 font-mono">
                  <span>20 (Fast)</span>
                  <span>100 (Standard)</span>
                  <span>250 (Deep)</span>
                </div>
              </div>

              <!-- Smart Bulk Pin Pruning Box -->
              <div class="p-4 rounded-xl border border-rose-500/20 bg-rose-50/30 dark:bg-rose-950/10 space-y-3">
                <div class="flex items-center gap-2">
                  <span class="text-rose-600 dark:text-rose-400 font-bold">✂️</span>
                  <div class="text-xs font-bold text-slate-900 dark:text-white">Smart Bulk Pin Pruning</div>
                </div>
                <p class="text-[11px] text-slate-500 dark:text-slate-400">Prune dead or low-traction pins across selected cluster keywords into the tombstone archive.</p>

                <div>
                  <label class="text-[10px] uppercase font-mono text-slate-500">Target Scope</label>
                  <select x-model="pruneForm.scope" class="w-full mt-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] text-slate-900 dark:text-white font-mono text-xs cursor-pointer">
                    <option value="displaced">Displaced Vault Pins</option>
                    <option value="all">All Cluster Pins (Active + Vault)</option>
                    <option value="active">Active SERP Only</option>
                  </select>
                </div>

                <div class="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <label class="text-[10px] uppercase font-mono text-slate-500">Min Age (Days)</label>
                    <input type="number" x-model.number="pruneForm.min_pin_age_days" min="0" placeholder="30" class="w-full mt-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] text-slate-900 dark:text-white font-mono text-xs">
                  </div>
                  <div>
                    <label class="text-[10px] uppercase font-mono text-slate-500">Max Saves Threshold</label>
                    <input type="number" x-model.number="pruneForm.max_saves" min="0" placeholder="5" class="w-full mt-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] text-slate-900 dark:text-white font-mono text-xs">
                  </div>
                </div>

                <!-- Preview Candidate Feedback -->
                <div x-show="prunePreviewResult" class="p-2.5 rounded-lg bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] text-xs font-mono">
                  <div class="flex items-center justify-between text-slate-700 dark:text-slate-300">
                    <span>Candidates found:</span>
                    <span class="font-bold text-amber-500" x-text="prunePreviewResult?.candidates_count ?? prunePreviewResult?.matched_count ?? 0"></span>
                  </div>
                </div>

                <div class="flex items-center gap-2 pt-1">
                  <button type="button" @click="runPrunePreview()" :disabled="pruningLoading" class="flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold bg-slate-200 hover:bg-slate-300 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-slate-800 dark:text-slate-200 transition cursor-pointer">
                    <span x-text="pruningLoading ? 'Inspecting...' : 'Preview Candidates (Dry-Run)'"></span>
                  </button>
                  <button type="button" @click="executePrune()" :disabled="pruningLoading || !(prunePreviewResult?.candidates_count || prunePreviewResult?.matched_count)" class="flex-1 py-1.5 px-3 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white transition cursor-pointer">
                    Execute Atomic Prune
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <!-- Legacy Section 5 monopoly tables purged in favor of dedicated /folders/:id/domains and /folders/:id/creators rooms -->

    </div> <!-- [INVARIANT: SIBLING-VIEW-ISOLATION] Closes VIEW A (activeFolderId) before VIEW B -->

    <!-- ========================================================================= -->
    <!-- VIEW B: HUB VIEW (/folders)                                               -->
    <!-- ========================================================================= -->
    <div x-show="!activeFolderId" class="flex flex-col gap-6" x-cloak>

      <!-- Hub Header & Summary -->
      <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl p-6 shadow-sm dark:shadow-xl flex items-center justify-between flex-wrap gap-4 transition-colors">
        <div>
          <div class="flex items-center gap-3">
            <h1 class="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Campaign Folders Hub</h1>
            <span class="text-xs font-mono tabular-nums px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30 font-semibold" x-text="foldersList.length + ' clusters'"></span>
          </div>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">Organize tracked keywords into niche topic clusters and analyze cross-SERP super-pin crossover.</p>
        </div>

        <button @click="openNewFolderModal = true" class="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md transition-colors flex items-center gap-2">
          <span>+</span> Create New Campaign Folder
        </button>
      </div>

      <!-- Quick KPI Stats for All Folders -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-xl p-4 flex flex-col gap-1 shadow-sm">
          <span class="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">Total Campaign Folders</span>
          <span class="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white" x-text="foldersList.length">0</span>
        </div>
        <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-xl p-4 flex flex-col gap-1 shadow-sm">
          <span class="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">Tracked Keywords Across Folders</span>
          <span class="text-2xl font-bold font-mono tabular-nums text-indigo-600 dark:text-indigo-400" x-text="totalKeywordsCount">0</span>
        </div>
        <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-xl p-4 flex flex-col gap-1 shadow-sm">
          <span class="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">Crossover Engine Readiness</span>
          <span class="text-2xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">100% Operational</span>
        </div>
      </div>

      <!-- Folders Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <template x-for="f in foldersList" :key="f.id">
          <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl p-5 shadow-sm dark:shadow-xl hover:border-indigo-400 dark:hover:border-slate-700 transition-all flex flex-col justify-between gap-4 group">
            <!-- Card Header -->
            <div class="flex items-center justify-between">
              <div class="w-10 h-10 rounded-xl flex items-center justify-center text-xl shadow-inner border border-slate-200 dark:border-white/10"
                   :style="'background-color: ' + (f.color ? f.color + '20' : '#6366f120')">
                <span x-text="f.icon || '📁'">📁</span>
              </div>
              <span class="text-[10px] font-mono tabular-nums px-2 py-0.5 rounded bg-slate-100 dark:bg-[#18181B] text-indigo-600 dark:text-indigo-400 border border-slate-200 dark:border-[#27272A] font-semibold" 
                    x-text="'Folder #' + f.id"></span>
            </div>

            <!-- Card Titles -->
            <div>
              <h3 class="text-base font-bold text-slate-900 dark:text-white tracking-tight group-hover:text-indigo-600 dark:group-hover:text-indigo-300 transition-colors" x-text="f.name"></h3>
              <p class="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2" x-text="f.description || 'Campaign cluster for Pinterest arbitrage'"></p>
            </div>

            <!-- Keyword Preview Chips -->
            <div class="flex items-center gap-1.5 flex-wrap pt-0.5">
              <template x-for="kw in (f.keywords_preview || []).slice(0, 3)" :key="kw.id || kw.keyword">
                <span class="text-[10px] font-mono tabular-nums px-2 py-0.5 rounded bg-slate-100 dark:bg-[#18181B]/80 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#27272A]/60 truncate max-w-[120px]" x-text="kw.keyword"></span>
              </template>
              <template x-if="(f.keywords_preview || []).length > 3">
                <span class="text-[10px] font-mono tabular-nums text-slate-400 dark:text-slate-500" x-text="'+' + ((f.keywords_preview || []).length - 3) + ' more'"></span>
              </template>
            </div>

            <!-- 3 Live Telemetry Counters Grid -->
            <div class="grid grid-cols-3 gap-2 py-2 px-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-[#27272A]/80 font-mono tabular-nums text-center">
              <div class="flex flex-col">
                <span class="text-[9px] uppercase tracking-wider text-slate-400">Keywords</span>
                <span class="text-sm font-bold text-emerald-600 dark:text-emerald-400" x-text="f.keyword_count || 0">0</span>
              </div>
              <div class="flex flex-col border-x border-slate-200 dark:border-[#27272A]">
                <span class="text-[9px] uppercase tracking-wider text-slate-400">Creators</span>
                <span class="text-sm font-bold text-purple-600 dark:text-purple-400" x-text="f.creator_count || 0">0</span>
              </div>
              <div class="flex flex-col">
                <span class="text-[9px] uppercase tracking-wider text-slate-400">Domains</span>
                <span class="text-sm font-bold text-sky-600 dark:text-sky-400" 
                      x-text="(f.domain_count || 0) + (f.pinned_domain_count ? ' (' + f.pinned_domain_count + '📌)' : '')">0</span>
              </div>
            </div>

            <!-- Action Footer with Room Shortcuts -->
            <div class="pt-3 border-t border-slate-100 dark:border-[#27272A]/80 flex items-center justify-between">
              <a :href="'/folders/' + f.id" class="px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-600/10 dark:hover:bg-indigo-600/20 text-indigo-600 dark:text-indigo-400 text-xs font-semibold border border-indigo-200 dark:border-indigo-500/20 transition-colors flex items-center gap-1">
                <span>Open Workspace →</span>
              </a>
              <div class="flex items-center gap-1">
                <a :href="'/folders/' + f.id + '/keywords'" class="p-1.5 rounded text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition" title="Keywords Fleet Room">
                  <i data-lucide="search" class="w-3.5 h-3.5"></i>
                </a>
                <a :href="'/folders/' + f.id + '/creators'" class="p-1.5 rounded text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 transition" title="Creator Hub Room">
                  <i data-lucide="users" class="w-3.5 h-3.5"></i>
                </a>
                <a :href="'/folders/' + f.id + '/domains'" class="p-1.5 rounded text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 transition" title="Domain Studio Room">
                  <i data-lucide="globe" class="w-3.5 h-3.5"></i>
                </a>
                <button @click="confirmDeleteFolder(f.id)" class="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 text-xs transition-colors p-1.5 cursor-pointer" title="Delete Folder">
                  <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                </button>
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- Empty State -->
      <div x-show="!foldersList.length && !foldersLoading" class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl p-12 text-center flex flex-col items-center justify-center gap-4 shadow-sm" x-cloak>
        <div class="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-3xl">
          📁
        </div>
        <div class="max-w-md">
          <h3 class="text-base font-bold text-slate-900 dark:text-white tracking-tight">No Campaign Folders Yet</h3>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Group your tracked keywords into campaign topic clusters to discover super-pins, shared visual tags, and generate comprehensive content blueprints.
          </p>
        </div>
        <button @click="openNewFolderModal = true" class="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md transition-colors">
          + Create First Campaign Folder
        </button>
      </div>

    </div>

  </main>

  <!-- New Folder Modal -->
  <div x-show="openNewFolderModal" class="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4" x-cloak>
    <div @click.away="openNewFolderModal = false" class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl max-w-md w-full p-6 shadow-2xl flex flex-col gap-4">
      <div class="flex items-center justify-between border-b border-slate-200 dark:border-[#27272A] pb-3">
        <h3 class="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <span>📁</span> Create New Campaign Folder
        </h3>
        <button @click="openNewFolderModal = false" class="text-slate-400 hover:text-slate-600 dark:hover:text-white">✕</button>
      </div>

      <div class="flex flex-col gap-3">
        <div>
          <label class="text-xs text-slate-500 dark:text-slate-400 block mb-1">Folder Name *</label>
          <input type="text" x-model="newFolderName" placeholder="e.g. High-Velocity Dinners 2026" class="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-[#27272A] rounded-xl text-slate-900 dark:text-white text-xs font-mono tabular-nums focus:outline-none focus:border-indigo-500">
        </div>
        <div>
          <label class="text-xs text-slate-500 dark:text-slate-400 block mb-1">Description (Optional)</label>
          <textarea x-model="newFolderDesc" rows="3" placeholder="Target niche, seasonal strategy, and monetized destination links..." class="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-[#27272A] rounded-xl text-slate-900 dark:text-white text-xs font-sans focus:outline-none focus:border-indigo-500"></textarea>
        </div>
        <div>
          <label class="text-xs text-slate-500 dark:text-slate-400 block mb-1">Color Theme</label>
          <div class="flex items-center gap-2">
            <template x-for="c in colorOptions" :key="c">
              <button @click="newFolderColor = c" 
                      class="w-7 h-7 rounded-lg border-2 transition-transform"
                      :class="newFolderColor === c ? 'scale-110 border-indigo-600 dark:border-white shadow' : 'border-transparent'"
                      :style="'background-color: ' + c"></button>
            </template>
          </div>
        </div>
      </div>

      <div class="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-[#27272A]">
        <button @click="openNewFolderModal = false" class="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-slate-700 dark:text-slate-300 text-xs">Cancel</button>
        <button @click="createFolder()" :disabled="!newFolderName.trim()" class="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold">Create Folder</button>
      </div>
    </div>
  </div>

  <!-- Delete Confirmation Modal -->
  <div x-show="deleteModalFolderId" class="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4" x-cloak>
    <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl max-w-sm w-full p-6 shadow-2xl flex flex-col gap-4 text-center">
      <div class="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center text-xl mx-auto">
        🗑️
      </div>
      <div>
        <h3 class="text-sm font-bold text-slate-900 dark:text-white">Delete Campaign Folder?</h3>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">This will remove the folder grouping. The underlying tracked keywords and pin snapshots will remain preserved.</p>
      </div>
      <div class="flex items-center justify-center gap-3 pt-2">
        <button @click="deleteModalFolderId = null" class="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-slate-700 dark:text-slate-300 text-xs font-medium">Cancel</button>
        <button @click="executeDeleteFolder()" class="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold">Delete Folder</button>
      </div>
    </div>
  </div>

  <!-- Folder Settings & Fleet Dispatch Modal -->
  <div x-show="isSettingsModalOpen" class="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4" x-cloak>
    <div class="bg-white dark:bg-[#0c1322] border border-slate-200 dark:border-[#27272A] rounded-3xl max-w-xl w-full p-6 shadow-2xl flex flex-col gap-5 max-h-[90vh] overflow-y-auto" @click.away="isSettingsModalOpen = false">
      
      <!-- Modal Header -->
      <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-[#27272A]">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-lg font-bold">
            ⚙️
          </div>
          <div>
            <h3 class="text-sm font-bold text-slate-900 dark:text-white">Folder Settings & 20-Runner Fleet Config</h3>
            <p class="text-xs text-slate-500 dark:text-slate-400">Configure cluster harvest depth, live SERP ingestion and metadata</p>
          </div>
        </div>
        <button @click="isSettingsModalOpen = false" class="p-1 rounded-xl hover:bg-slate-100 dark:hover:bg-[#27272A] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition">✕</button>
      </div>

      <!-- Section 1: 20-Runner Cluster Fleet Engine -->
      <div class="p-4 rounded-2xl bg-gradient-to-br from-indigo-500/5 via-purple-500/5 to-transparent border border-indigo-500/20 flex flex-col gap-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="text-base">🚀</span>
            <span class="text-xs font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">Cluster Fleet Engine (20 Parallel Runners)</span>
          </div>
          <span class="text-[10px] font-mono tabular-nums px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold border border-indigo-500/20">Stage 0 + Stage 1 Matrix</span>
        </div>

        <!-- Live SERP Ingestion Toggle -->
        <div class="flex items-start justify-between gap-4 p-3 rounded-xl bg-white/70 dark:bg-[#121215]/60 border border-slate-200/80 dark:border-[#27272A]">
          <div class="flex flex-col gap-0.5">
            <div class="flex items-center gap-2">
              <span class="text-xs font-bold text-slate-900 dark:text-white">Live Search Discovery & SERP Ingestion</span>
              <span class="text-[10px] font-mono tabular-nums px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">Essential</span>
            </div>
            <p class="text-[11px] text-slate-500 dark:text-slate-400">Harvest fresh Pinterest search SERPs across cluster keywords before partitioning pins. Prevents newly added keywords from remaining at 0 pins.</p>
          </div>
          <label class="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
            <input type="checkbox" x-model="folderSettings.enable_serp_harvest" class="sr-only peer">
            <div class="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
          </label>
        </div>

        <!-- Target Pin Quota per Keyword -->
        <div class="flex flex-col gap-2">
          <label class="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between">
            <span>Pin Quota per Keyword (Harvest Depth)</span>
            <span class="text-xs font-mono tabular-nums text-indigo-600 dark:text-indigo-400 font-bold" x-text="(folderSettings.max_pins || 50) + ' pins/KW (~' + Math.ceil((parseInt(folderSettings.max_pins, 10) || 50) / 25) + ' pages)'"></span>
          </label>
          <div class="grid grid-cols-4 gap-2">
            <template x-for="q in ['50', '100', '250', '500']" :key="q">
              <button type="button" @click="folderSettings.max_pins = q; folderSettings.max_serp_pins = q"
                      class="px-2.5 py-1.5 rounded-xl text-xs font-mono tabular-nums font-medium border text-center transition cursor-pointer"
                      :class="String(folderSettings.max_pins) === q 
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' 
                        : 'bg-white dark:bg-[#121215] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-[#27272A] hover:border-slate-300'">
                <span x-text="q + ' pins'"></span>
              </button>
            </template>
          </div>
          <!-- Custom Slider & Number Input -->
          <div class="flex items-center gap-3 pt-1">
            <input type="range" min="10" max="2000" step="5" x-model="folderSettings.max_pins" @input="folderSettings.max_serp_pins = folderSettings.max_pins"
                   class="flex-1 accent-indigo-600 dark:accent-indigo-500 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg cursor-pointer">
            <div class="flex items-center gap-1 shrink-0">
              <input type="number" min="10" max="2000" step="5" x-model="folderSettings.max_pins" @input="folderSettings.max_serp_pins = folderSettings.max_pins"
                     class="w-20 px-2 py-1 text-xs font-mono tabular-nums font-bold text-center rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500">
              <span class="text-[10px] text-slate-400 font-mono tabular-nums">pins</span>
            </div>
          </div>
        </div>

        <!-- Crawl Scope & Inspection Cap -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div class="flex flex-col gap-1.5">
            <label class="text-xs font-semibold text-slate-700 dark:text-slate-300">Crawl Scope</label>
            <select x-model="folderSettings.crawl_scope" class="w-full text-xs rounded-xl bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] px-3 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500">
              <option value="all_pins">all_pins (Active + Vault Archive)</option>
              <option value="active_serp">active_serp (Top 100 Organic Only)</option>
            </select>
          </div>
          <div class="flex flex-col gap-1.5">
            <label class="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between">
              <span>Inspection Cap</span>
              <span class="text-[10px] text-slate-400 font-mono tabular-nums" x-text="folderSettings.max_catalog_inspect === '0' ? 'Unlimited' : folderSettings.max_catalog_inspect + ' pins'"></span>
            </label>
            <input type="number" x-model="folderSettings.max_catalog_inspect" min="0" step="50" placeholder="0 = Unlimited"
                   class="w-full text-xs rounded-xl bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] px-3 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500">
          </div>
        </div>
      </div>

      <!-- Section 2: Folder Metadata (Identity) -->
      <div class="flex flex-col gap-3">
        <span class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Folder Identity</span>
        
        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-semibold text-slate-700 dark:text-slate-300">Folder Name</label>
          <input type="text" x-model="folderSettings.name" placeholder="e.g. Crockpot Meals Cluster"
                 class="w-full text-xs rounded-xl bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] px-3 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500">
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-semibold text-slate-700 dark:text-slate-300">Campaign Description</label>
          <textarea x-model="folderSettings.description" rows="2" placeholder="Campaign Topic Cluster & Cross-SERP Intelligence"
                    class="w-full text-xs rounded-xl bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] px-3 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"></textarea>
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-semibold text-slate-700 dark:text-slate-300">Theme Color</label>
          <div class="flex items-center gap-2">
            <template x-for="c in colorOptions" :key="c">
              <button type="button" @click="folderSettings.color = c" 
                      class="w-7 h-7 rounded-lg border-2 transition-transform cursor-pointer"
                      :class="folderSettings.color === c ? 'scale-110 border-indigo-600 dark:border-white shadow' : 'border-transparent'"
                      :style="'background-color: ' + c"></button>
            </template>
          </div>
        </div>
      </div>

      <!-- Section 3: Cluster Keywords Summary -->
      <div class="p-3 rounded-2xl bg-slate-50 dark:bg-[#121215]/60 border border-slate-200 dark:border-[#27272A] flex items-center justify-between text-xs">
        <div class="flex items-center gap-2">
          <span class="font-bold text-slate-700 dark:text-slate-300">Cluster Status:</span>
          <span class="font-mono tabular-nums text-emerald-600 dark:text-emerald-400 font-semibold" x-text="crawledKeywordsCount + ' Crawled'"></span>
          <span class="text-slate-400">•</span>
          <span class="font-mono tabular-nums text-amber-600 dark:text-amber-400 font-semibold" x-text="pendingKeywordsCount + ' Pending Harvest'"></span>
        </div>
        <span class="text-[11px] font-mono tabular-nums text-slate-500" x-text="totalKeywordsCount + ' Total Keywords'"></span>
      </div>

      <!-- Modal Footer -->
      <div class="flex items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-[#27272A]">
        <button type="button" @click="isSettingsModalOpen = false" class="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-slate-600 dark:text-slate-300 transition">
          Cancel
        </button>
        <div class="flex items-center gap-2">
          <button type="button" @click="saveFolderSettings(false)" :disabled="settingsLoading"
                  class="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-200 hover:bg-slate-300 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-slate-800 dark:text-slate-200 transition">
            <span x-text="settingsLoading ? 'Saving...' : 'Save Settings'"></span>
          </button>
          <button type="button" @click="saveFolderSettings(true)" :disabled="settingsLoading || auditDispatching"
                  class="px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-md transition flex items-center gap-1.5">
            <span>🚀</span>
            <span x-text="auditDispatching ? 'Launching...' : 'Save & Launch 20 Runners'"></span>
          </button>
        </div>
      </div>

    </div>
  </div>

  <!-- ======================================================== -->
  <!-- CREATOR INSTANT 50-PIN VISUAL FEED MODAL (<350ms)       -->
  <!-- ======================================================== -->
  <div x-show="isVisualFeedModalOpen" x-cloak
       class="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6"
       @keydown.escape.window="isVisualFeedModalOpen = false">
    <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl w-full max-w-5xl max-h-[90vh] shadow-2xl flex flex-col text-slate-900 dark:text-[#FAFAFA] overflow-hidden"
         role="dialog" aria-modal="true" aria-label="Creator Instant Visual Stream"
         @click.away="isVisualFeedModalOpen = false">
      
      <!-- Modal Header -->
      <div class="flex items-center justify-between border-b border-slate-200 dark:border-[#27272A] p-4 bg-slate-50/50 dark:bg-[#18181B]/50 shrink-0">
        <div class="flex items-center space-x-3">
          <template x-if="visualFeedUser?.image_xlarge_url || visualFeedUser?.image_medium_url">
            <img :src="visualFeedUser?.image_xlarge_url || visualFeedUser?.image_medium_url" class="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-[#27272A]">
          </template>
          <div>
            <div class="flex items-center space-x-2">
              <h3 class="font-bold text-sm sm:text-base text-slate-900 dark:text-white" x-text="visualFeedUser?.full_name || ('@' + visualFeedUsername)"></h3>
              <span class="px-2 py-0.5 rounded-full text-[10px] font-mono tabular-nums font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                ⚡ Instant Feed (&lt;350ms)
              </span>
            </div>
            <div class="flex items-center space-x-3 text-xs text-slate-500 font-mono tabular-nums mt-0.5">
              <span x-text="'@' + visualFeedUsername"></span>
              <span>•</span>
              <span x-text="visualFeedPins.length + ' Latest Pins'"></span>
              <template x-if="visualFeedUser?.follower_count">
                <span>•</span>
                <span x-text="formatNumber(visualFeedUser.follower_count) + ' Followers'"></span>
              </template>
            </div>
          </div>
        </div>
        <button @click="isVisualFeedModalOpen = false" class="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition">
          <i data-lucide="x" class="w-5 h-5"></i>
        </button>
      </div>

      <!-- Modal Body / 50-Pin Gallery -->
      <div class="p-4 overflow-y-auto flex-1">
        <!-- Loading State -->
        <div x-show="isVisualFeedLoading" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 animate-pulse">
          <template x-for="i in 10" :key="i">
            <div class="rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-100 dark:bg-slate-900 aspect-[2/3] p-2 flex flex-col justify-between">
              <div class="h-full bg-slate-200 dark:bg-slate-800 rounded-lg"></div>
            </div>
          </template>
        </div>

        <!-- Empty State -->
        <div x-show="!isVisualFeedLoading && visualFeedPins.length === 0" class="text-center py-12 text-slate-400 text-xs font-mono">
          No live pins discovered for @<span x-text="visualFeedUsername"></span> yet.
        </div>

        <!-- Pins Grid -->
        <div x-show="!isVisualFeedLoading && visualFeedPins.length > 0" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          <template x-for="p in visualFeedPins" :key="p.id || p.pin_id">
            <div class="group relative rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] overflow-hidden flex flex-col justify-between hover:border-emerald-500/50 transition shadow-2xs">
              <div class="relative aspect-[2/3] bg-slate-100 dark:bg-slate-900 overflow-hidden">
                <img :src="p.images?.['1200x']?.url || p.image_url"
                     onerror="window.handlePinImgError(this)"
                     class="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                     loading="lazy" />
                <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition duration-200 flex flex-col justify-between p-2">
                  <div class="flex justify-end">
                    <a :href="p.link || ('https://www.pinterest.com/pin/' + (p.id || p.pin_id) + '/')" target="_blank" class="p-1 rounded bg-black/60 text-white hover:bg-black/90 transition">
                      <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                    </a>
                  </div>
                  <div class="text-[11px] text-white line-clamp-2" x-text="p.title || p.description || 'Pinterest Pin'"></div>
                </div>
              </div>
              <div class="p-2 border-t border-slate-100 dark:border-[#27272A]/80 text-[11px] font-mono tabular-nums flex items-center justify-between text-slate-500">
                <span class="flex items-center space-x-1 text-emerald-600 dark:text-emerald-400 font-bold">
                  <i data-lucide="bookmark" class="w-3 h-3"></i>
                  <span x-text="formatNumber(p.save_count || p.repin_count || 0)"></span>
                </span>
                <span class="text-[10px] text-slate-400" x-text="p.published_at ? new Date(p.published_at).toLocaleDateString() : 'Live'"></span>
              </div>
            </div>
          </template>
        </div>
      </div>

      <!-- Modal Footer -->
      <div class="p-3 border-t border-slate-200 dark:border-[#27272A] bg-slate-50/50 dark:bg-[#18181B]/50 flex justify-between items-center text-xs">
        <span class="text-slate-500 font-mono tabular-nums text-[11px]">Direct Pinterest Pidgets Feed</span>
        <button @click="isVisualFeedModalOpen = false" class="px-4 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition">Close</button>
      </div>

    </div>
  </div>

  <script>
    function foldersApp(activeFolderId, initialRoom = 'crossover') {
      return {
        activeFolderId,
        currentRoom: initialRoom || 'crossover',
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
        darkMode: typeof localStorage !== 'undefined' ? localStorage.getItem('pa_theme') !== 'light' : true,
        isDark: typeof localStorage !== 'undefined' ? localStorage.getItem('pa_theme') !== 'light' : true,
        foldersList: [],
        foldersLoading: false,
        activeFolder: null,
        crossoverData: null,
        crossoverLoading: false,
        _folderReqSeq: 0,
        auditDispatching: false,
        isSettingsModalOpen: false,
        settingsLoading: false,
        selectedTimeWindow: '24h',
        pruningLoading: false,
        prunePreviewResult: null,
        pruneForm: {
          scope: 'displaced',
          min_pin_age_days: 30,
          max_saves: 5,
          keyword_ids: []
        },

        get clusterWindowSavesGains() {
          const pins = this.crossoverData?.all_pins || this.crossoverData?.super_pins || [];
          if (!pins.length) return 0;
          const win = this.selectedTimeWindow;
          return pins.reduce((sum, p) => {
            let delta = 0;
            if (win === '24h') delta = Number(p.delta_saves_24h || p.daily_save_velocity || 0);
            else if (win === '5d') delta = Number(p.gains_5d || (p.daily_save_velocity ? p.daily_save_velocity * 5 : 0));
            else if (win === '7d') delta = Number(p.gains_7d || (p.daily_save_velocity ? p.daily_save_velocity * 7 : 0));
            else if (win === '10d') delta = Number(p.gains_10d || (p.daily_save_velocity ? p.daily_save_velocity * 10 : 0));
            else if (win === '15d') delta = Number(p.gains_15d || (p.daily_save_velocity ? p.daily_save_velocity * 15 : 0));
            else delta = Number(p.save_count || 0);
            return sum + Math.max(0, delta);
          }, 0);
        },

        get clusterWindowRepinsGains() {
          const pins = this.crossoverData?.all_pins || this.crossoverData?.super_pins || [];
          if (!pins.length) return 0;
          const win = this.selectedTimeWindow;
          const mult = win === '24h' ? 1 : win === '5d' ? 5 : win === '7d' ? 7 : win === '10d' ? 10 : win === '15d' ? 15 : 30;
          return Math.round(pins.reduce((sum, p) => sum + (Number(p.delta_repins_24h || p.daily_repin_velocity || 0) * mult), 0));
        },

        get clusterAvgVelocity() {
          const pins = this.crossoverData?.all_pins || this.crossoverData?.super_pins || [];
          if (!pins.length) return '0.0';
          const totalVel = pins.reduce((sum, p) => sum + (Number(p.daily_save_velocity || 0)), 0);
          return (totalVel / pins.length).toFixed(1);
        },

        get clusterCompetitorAudienceGains() {
          const creators = this.crossoverData?.top_creators || [];
          if (!creators.length) return 0;
          const win = this.selectedTimeWindow;
          return creators.reduce((sum, c) => {
            const d24 = Number(c.delta_reach_24h ?? c.delta_monthly_reach ?? 0);
            const d7 = Number(c.reach_delta_7d ?? (d24 > 0 ? d24 * 7 : 0));
            const d30 = Number(c.delta_audience_30d ?? c.delta_monthly_reach ?? (d7 > 0 ? Math.round((d7 / 7) * 30) : 0));
            let val = 0;
            if (win === '24h') val = d24;
            else if (win === '5d') val = Math.round((d7 / 7) * 5);
            else if (win === '7d') val = d7;
            else if (win === '10d') val = Math.round((d7 / 7) * 10);
            else if (win === '15d') val = Math.round((d7 / 7) * 15);
            else val = d30 || Number(c.monthly_reach || 0);
            return sum + Math.max(0, val);
          }, 0);
        },

        formatUniversalAge(days) {
          if (days == null || isNaN(days) || days === '') return '—';
          const numDays = Number(days);
          if (numDays >= 365) {
            return (numDays / 365).toFixed(1) + 'y';
          }
          return Math.floor(numDays) + 'd';
        },

        copyAnnotation(tag) {
          if (!tag) return;
          navigator.clipboard.writeText(String(tag)).then(() => {
            this.showToast('Copied annotation "' + tag + '" to clipboard!', 'success');
          }).catch(() => {
            this.showToast('Clipboard access denied', 'warning');
          });
        },

        copyAnnotations() {
          const list = this.filteredTagBridges();
          if (!list || !list.length) {
            this.showToast('No annotations to copy', 'warning');
            return;
          }
          const tags = list.map(tb => tb.tag).join(', ');
          navigator.clipboard.writeText(tags).then(() => {
            this.showToast('Copied ' + list.length + ' shared annotations to clipboard!', 'success');
          }).catch(() => {
            this.showToast('Clipboard access denied', 'warning');
          });
        },

        async runPrunePreview() {
          if (!this.activeFolderId) return;
          this.pruningLoading = true;
          try {
            const kwIds = this.pruneForm.keyword_ids?.length 
              ? this.pruneForm.keyword_ids 
              : (this.activeFolder?.items || []).map(i => i.keyword_id || i.id).filter(Boolean);

            const res = await (window.safeApiFetch || fetch)('/api/folders/' + this.activeFolderId + '/prune-pins', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                dry_run: true,
                keyword_ids: kwIds,
                scope: this.pruneForm.scope || 'displaced',
                min_pin_age_days: Number(this.pruneForm.min_pin_age_days) || 30,
                max_saves: Number(this.pruneForm.max_saves) || 5
              })
            });
            const data = await res.json();
            if (res.ok) {
              const count = data.candidates_count ?? data.matched_count ?? 0;
              this.prunePreviewResult = { ...data, candidates_count: count, matched_count: count };
              this.showToast('Dry run preview: ' + count + ' candidate pins identified for pruning', 'info');
            } else {
              this.showToast(data.message || 'Prune preview failed', 'error');
            }
          } catch (e) {
            this.showToast('Network error during prune preview: ' + e.message, 'error');
          } finally {
            this.pruningLoading = false;
          }
        },

        async executePrune() {
          if (!this.activeFolderId) return;
          if (!confirm('Are you sure you want to prune candidate pins? They will be tombstoned to keyword_ignored_pins.')) return;
          this.pruningLoading = true;
          try {
            const kwIds = this.pruneForm.keyword_ids?.length 
              ? this.pruneForm.keyword_ids 
              : (this.activeFolder?.items || []).map(i => i.keyword_id || i.id).filter(Boolean);

            const res = await (window.safeApiFetch || fetch)('/api/folders/' + this.activeFolderId + '/prune-pins', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                dry_run: false,
                keyword_ids: kwIds,
                scope: this.pruneForm.scope || 'displaced',
                min_pin_age_days: Number(this.pruneForm.min_pin_age_days) || 30,
                max_saves: Number(this.pruneForm.max_saves) || 5
              })
            });
            const data = await res.json();
            if (res.ok) {
              this.showToast('Successfully pruned ' + (data.pruned_count || 0) + ' pins!', 'success');
              this.prunePreviewResult = null;
              await this.loadActiveFolder(true);
            } else {
              this.showToast(data.message || 'Pruning execution failed', 'error');
            }
          } catch (e) {
            this.showToast('Network error during prune execution: ' + e.message, 'error');
          } finally {
            this.pruningLoading = false;
          }
        },

        folderSettings: {
          name: '',
          description: '',
          color: '#6366f1',
          enable_serp_harvest: true,
          max_pins: '50',
          max_serp_pins: '50',
          crawl_scope: 'all_pins',
          max_catalog_inspect: '0',
          pause_competitors: false,
          pause_crawlers: false,
          block_fleet: false,
          auto_discover_creators: true
        },

        get totalKeywordsCount() {
          if (this.activeFolderId) {
            return Number(this.activeFolder?.items?.length || this.activeFolder?.keyword_count || this.crossoverData?.summary?.total_keywords || 0);
          }
          return (this.foldersList || []).reduce((acc, f) => acc + (Number(f.keyword_count) || 0), 0);
        },
        get crawledKeywordsCount() {
          if (this.activeFolder?.items && this.activeFolder.items.length > 0) {
            return this.activeFolder.items.filter(i => (Number(i.pin_count || 0) > 0 || Boolean(i.last_crawled_at))).length;
          }
          const total = this.totalKeywordsCount;
          return total > 0 ? total : 0;
        },
        get pendingKeywordsCount() {
          if (this.activeFolder?.items && this.activeFolder.items.length > 0) {
            return this.activeFolder.items.filter(i => !(Number(i.pin_count || 0) > 0 || Boolean(i.last_crawled_at))).length;
          }
          return 0;
        },
        openNewFolderModal: false,
        isVisualFeedModalOpen: false,
        visualFeedUser: null,
        visualFeedUsername: '',
        visualFeedPins: [],
        isVisualFeedLoading: false,
        newFolderName: '',
        newFolderDesc: '',
        newFolderColor: '#6366f1',
        deleteModalFolderId: null,
        scopeFilter: 'all',
        sortBy: 'velocity_desc',
        currentPage: 1,
        pageSize: 10,
        searchQuery: '',
        entityFilter: { type: null, value: null },
        activeMatrixFilter: null,
        expandedPinRanks: {},
        onlyBreakoutBabyDomains: false,
        onlyVacuumPins: false,
        onlyFreshRockets: false,
        onlySurging24h: false,
        visualHubTab: 'pairs',
        selectedMatrixIndex: 0,
        selectedMatrixItem: null,
        matrixSearch: '',
        matrixSort: 'velocity_desc',
        matrixListLimit: 30,
        _pinsCacheKey: '',
        _cachedFilteredPins: null,
        powerPairs: [],
        powerTriplets: [],
        powerPairsView: 'cards',
        powerPairsLimit: 12,
        powerPairsSearch: '',
        powerPairsSort: 'freq_desc',
        powerPairsPage: 1,
        powerPairsPageSize: 15,

        // Core Visual Anchors State
        anchorsView: 'cards',
        anchorsLimit: 24,
        anchorsSearch: '',
        anchorsTier: 'all',
        anchorsPage: 1,
        anchorsPageSize: 25,

        // Domain Monopoly State
        domainSearch: '',
        domainSort: 'default',
        domainPage: 1,
        domainPageSize: 10,
        _domainCacheKey: '',
        _cachedFilteredDomains: null,

        getSortedPinRankings(sp) {
          const list = Array.isArray(sp?.rankings) ? sp.rankings.slice() : [];
          return list.sort((a, b) => {
            const aDisp = a.is_displaced ? 1 : 0;
            const bDisp = b.is_displaced ? 1 : 0;
            if (aDisp !== bDisp) return aDisp - bDisp;
            return (Number(a.rank_position) || 999) - (Number(b.rank_position) || 999);
          });
        },

        normalizeClientTagLemma(raw) {
          if (!raw) return '';
          const str = typeof raw === 'object' && raw !== null
            ? String(raw.name || raw.tag || raw.label || raw.term || raw.display_label || '')
            : String(raw || '');
          const clean = str.trim().toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/  +/g, ' ').trim();
          if (!clean) return '';
          const words = clean.split(' ').filter(Boolean).map(w => {
            if (w.length <= 3) return w;
            if (w.endsWith('ies') && w.length > 4) return w.slice(0, -3) + 'y';
            if (w.endsWith('ches') || w.endsWith('shes') || w.endsWith('xes') || w.endsWith('zes')) return w.slice(0, -2);
            if (w.endsWith('ves') && w.length > 4) return w.slice(0, -3) + 'f';
            if (w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us') && !w.endsWith('is')) return w.slice(0, -1);
            return w;
          });
          return words.join(' ');
        },

        switchMatrixTab(tab) {
          this.visualHubTab = tab;
          this.selectedMatrixIndex = 0;
          this.selectedMatrixItem = null;
          this.matrixListLimit = 30;
        },

        getActiveMatrixTitle() {
          const tab = this.visualHubTab;
          if (tab === 'triplets') return '3-Tag Co-Occurrence Triplets';
          if (tab === 'anchors') return '1-Tag Power Leaders & Bridges';
          if (tab === 'guided') return 'Guided Search Capsules (SERP Modifiers)';
          if (tab === 'colors') return 'Dominant Color Swatches';
          return '2-Tag Visual Power Pairs';
        },

        getActiveMatrixItems() {
          const tab = this.visualHubTab;
          const q = (this.matrixSearch || '').toLowerCase().trim();
          const sort = this.matrixSort || 'velocity_desc';
          let items = [];

          if (tab === 'triplets') {
            items = (this.powerTriplets || []).map((tr, i) => ({
              ...tr,
              _type: 'triplet',
              _key: 'tr_' + (tr.tags || []).join('|') + '_' + i
            }));
            if (q) {
              items = items.filter(tr =>
                (tr.tags || []).some(t => t.toLowerCase().includes(q)) ||
                (tr.keywords || []).some(k => k.toLowerCase().includes(q))
              );
            }
          } else if (tab === 'anchors') {
            items = (this.coreAnchorsList || []).map((a, i) => ({
              ...a,
              _type: 'anchor',
              _key: 'anc_' + (a.raw_tag || a.tag || i)
            }));
            if (this.anchorsTier === 'universal') {
              items = items.filter(a => (a.overlap_percentage || 0) >= 50 || a.is_universal);
            } else if (this.anchorsTier === 'whales') {
              items = items.filter(a => (a.pin_count || a.count || 0) >= 25);
            } else if (this.anchorsTier === 'high') {
              items = items.filter(a => (a.pin_count || a.count || 0) >= 10);
            }
            if (q) {
              items = items.filter(a =>
                String(a.tag || '').toLowerCase().includes(q) ||
                (a.keywords || []).some(k => k.toLowerCase().includes(q))
              );
            }
          } else if (tab === 'guided') {
            items = (this.crossoverData?.guided_pivots || []).map((gp, i) => ({
              ...gp,
              _type: 'capsule',
              _key: 'gp_' + (gp.term || i)
            }));
            if (q) {
              items = items.filter(gp =>
                String(gp.display_label || gp.term || '').toLowerCase().includes(q) ||
                (gp.keywords || []).some(k => k.toLowerCase().includes(q))
              );
            }
          } else if (tab === 'colors') {
            items = (this.crossoverData?.dominant_colors || []).map((sw, i) => ({
              ...sw,
              _type: 'color',
              _key: 'sw_' + (sw.hex || i)
            }));
            if (q) {
              items = items.filter(sw =>
                String(sw.hex || '').toLowerCase().includes(q) ||
                (sw.keywords || []).some(k => k.toLowerCase().includes(q))
              );
            }
          } else {
            items = (this.powerPairs || []).map((p, i) => ({
              ...p,
              _type: 'pair',
              _key: 'pr_' + p.tag_a + '|' + p.tag_b + '_' + i
            }));
            if (q) {
              items = items.filter(p =>
                String(p.tag_a || '').toLowerCase().includes(q) ||
                String(p.tag_b || '').toLowerCase().includes(q) ||
                (p.keywords || []).some(k => k.toLowerCase().includes(q))
              );
            }
          }

          items = items.slice().sort((a, b) => {
            const aVel = Number(a.total_velocity ?? a.velocity_gain ?? 0);
            const bVel = Number(b.total_velocity ?? b.velocity_gain ?? 0);
            const aPins = Number(a.joint_count ?? a.pin_count ?? a.count ?? 0);
            const bPins = Number(b.joint_count ?? b.pin_count ?? b.count ?? 0);
            const aKws = Number(a.keywords_count ?? a.keyword_count ?? a.shared_count ?? a.keyword_overlap_count ?? 1);
            const bKws = Number(b.keywords_count ?? b.keyword_count ?? b.shared_count ?? b.keyword_overlap_count ?? 1);
            const aLift = Number(a.lift ?? a.composite_score ?? a.overlap_percentage ?? 0);
            const bLift = Number(b.lift ?? b.composite_score ?? b.overlap_percentage ?? 0);
            const aSaves = Number(a.total_saves ?? 0);
            const bSaves = Number(b.total_saves ?? 0);

            if (sort === 'freq_desc') return bPins - aPins || bVel - aVel || bKws - aKws;
            if (sort === 'keywords_desc') return bKws - aKws || bVel - aVel || bPins - aPins;
            if (sort === 'lift_desc') return bLift - aLift || bVel - aVel || bPins - aPins;
            if (sort === 'saves_desc') return bSaves - aSaves || bVel - aVel || bPins - aPins;
            return bVel - aVel || bPins - aPins || bKws - aKws;
          });

          return items;
        },

        selectMatrixItem(item, idx = 0) {
          this.selectedMatrixIndex = idx;
          this.selectedMatrixItem = item;
        },

        isMatrixItemSelected(item, idx) {
          const current = this.getSelectedMatrixItem();
          if (!current || !item) return idx === 0;
          if (current._key && item._key) return current._key === item._key;
          return this.selectedMatrixIndex === idx;
        },

        getSelectedMatrixItem() {
          const list = this.getActiveMatrixItems();
          if (!list.length) return null;
          if (this.selectedMatrixItem) {
            const found = list.find(x => x._key && x._key === this.selectedMatrixItem._key);
            if (found) return found;
          }
          const idx = Math.min(Math.max(0, this.selectedMatrixIndex || 0), list.length - 1);
          return list[idx] || list[0];
        },

        getMatrixItemLabel(item) {
          if (!item) return '';
          const tab = this.visualHubTab;
          if (tab === 'triplets' || item._type === 'triplet') {
            return (item.tags || []).map(t => '#' + t).join(' + ');
          }
          if (tab === 'anchors' || item._type === 'anchor') {
            return '#' + (item.tag || item.raw_tag || '');
          }
          if (tab === 'guided' || item._type === 'capsule') {
            return '🎯 Capsule: ' + (item.display_label || item.term || '');
          }
          if (tab === 'colors' || item._type === 'color') {
            return '🎨 Palette: ' + (item.hex || '');
          }
          return '#' + (item.tag_a || '') + ' + #' + (item.tag_b || '');
        },

        isTagHighlightedInSelectedPattern(rawTag) {
          const item = this.getSelectedMatrixItem();
          if (!item || !rawTag) return false;
          const lemma = this.normalizeClientTagLemma(rawTag);
          if (!lemma) return false;
          const tab = this.visualHubTab;
          if (tab === 'pairs' || tab === 'all' || item._type === 'pair') {
            return lemma === this.normalizeClientTagLemma(item.tag_a) || lemma === this.normalizeClientTagLemma(item.tag_b);
          }
          if (tab === 'triplets' || item._type === 'triplet') {
            return (item.tags || []).some(t => this.normalizeClientTagLemma(t) === lemma);
          }
          if (tab === 'anchors' || item._type === 'anchor') {
            return lemma === this.normalizeClientTagLemma(item.raw_tag || item.tag);
          }
          if (tab === 'guided' || item._type === 'capsule') {
            const term = this.normalizeClientTagLemma(item.term || item.display_label);
            return Boolean(term && (' ' + lemma + ' ').includes(' ' + term + ' '));
          }
          return false;
        },

        pinMatchesMatrixItem(pin, item, tabOverride = null) {
          if (!pin || !item) return false;
          const tab = tabOverride || item._type || this.visualHubTab;
          const pinLemmas = new Set();
          for (const va of (pin.visual_annotations || [])) {
            const l = this.normalizeClientTagLemma(va);
            if (l) pinLemmas.add(l);
          }

          if (tab === 'pairs' || tab === 'all' || tab === 'pair') {
            const lA = this.normalizeClientTagLemma(item.tag_a);
            const lB = this.normalizeClientTagLemma(item.tag_b);
            return Boolean(lA && lB && pinLemmas.has(lA) && pinLemmas.has(lB));
          }
          if (tab === 'triplets' || tab === 'triplet') {
            const required = (item.tags || []).map(t => this.normalizeClientTagLemma(t)).filter(Boolean);
            return required.length > 0 && required.every(req => pinLemmas.has(req));
          }
          if (tab === 'anchors' || tab === 'anchor') {
            const target = this.normalizeClientTagLemma(item.raw_tag || item.tag);
            return Boolean(target && pinLemmas.has(target));
          }
          if (tab === 'guided' || tab === 'capsule') {
            const term = this.normalizeClientTagLemma(item.term || item.display_label);
            if (!term) return false;
            const padded = ' ' + term + ' ';
            if (pinLemmas.has(term)) return true;
            for (const pl of pinLemmas) {
              if ((' ' + pl + ' ').includes(padded)) return true;
            }
            const normTitle = ' ' + String(pin.title || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/  +/g, ' ').trim() + ' ';
            if (normTitle.includes(padded)) return true;
            return (pin.rankings || []).some(r => (' ' + String(r.keyword || '').toLowerCase() + ' ').includes(padded));
          }
          if (tab === 'colors' || tab === 'color') {
            const targetHex = String(item.hex || '').trim().toUpperCase();
            return Boolean(targetHex && String(pin.dominant_color || '').trim().toUpperCase() === targetHex);
          }
          return false;
        },

        getMatchingPinsForMatrixItem(item, tabOverride = null) {
          if (!item) return [];
          const allPins = (this.crossoverData?.all_pins && this.crossoverData.all_pins.length > 0)
            ? this.crossoverData.all_pins
            : (this.crossoverData?.super_pins || []);
          if (!allPins.length) {
            return item.matching_pins || item.pins || [];
          }
          const matched = allPins.filter(p => this.pinMatchesMatrixItem(p, item, tabOverride));
          if (!matched.length && (item.matching_pins?.length || item.pins?.length)) {
            return item.matching_pins || item.pins || [];
          }
          return matched.slice().sort((a, b) =>
            ((b.effective_velocity ?? b.daily_save_velocity ?? 0) - (a.effective_velocity ?? a.daily_save_velocity ?? 0)) ||
            ((b.save_count || 0) - (a.save_count || 0))
          );
        },

        applyMatrixFilter(item, tabOverride = null) {
          if (!item) return;
          const tab = tabOverride || item._type || this.visualHubTab;
          let badge = 'Matrix Pattern';
          if (tab === 'pairs' || tab === 'all' || tab === 'pair') badge = '2-Tag Power Pair';
          else if (tab === 'triplets' || tab === 'triplet') badge = '3-Tag Triplet';
          else if (tab === 'anchors' || tab === 'anchor') badge = '1-Tag Visual Bridge';
          else if (tab === 'guided' || tab === 'capsule') badge = 'Guided Search Capsule';
          else if (tab === 'colors' || tab === 'color') badge = 'Color Swatch';

          const label = this.getMatrixItemLabel(item);
          this.activeMatrixFilter = {
            type: tab,
            badge,
            label,
            item
          };
          this.currentPage = 1;
          this._pinsCacheKey = '';
          this.showToast('Filtered cluster pins by ' + badge + ': ' + label, 'info');
          this.scrollToSection('pins-table-section');
        },

        clearMatrixFilter() {
          this.activeMatrixFilter = null;
          this.currentPage = 1;
          this._pinsCacheKey = '';
          this.showToast('Cleared matrix pattern filter', 'info');
        },

        copyMatrixItemBlueprint(item, tabOverride = null) {
          if (!item) return;
          const tab = tabOverride || item._type || this.visualHubTab;
          if (tab === 'pairs' || tab === 'all' || tab === 'pair') {
            this.copyVisualBlueprint(item);
            return;
          }
          const label = this.getMatrixItemLabel(item);
          const kws = (item.keywords || []).slice(0, 6).join(', ');
          const text = [
            '📌 CLUSTER VISUAL PATTERN BLUEPRINT',
            '===================================',
            'Pattern: ' + label,
            'Joint Cluster Pins: ' + (item.joint_count || item.pin_count || item.count || 0),
            '24h Save Velocity: +' + (item.total_velocity ?? item.velocity_gain ?? 0) + '/d',
            'Target SERP Keywords: ' + (kws || 'Cluster Terms')
          ].join('\\n');
          navigator.clipboard.writeText(text).then(() => {
            this.showToast('Copied pattern blueprint: ' + label, 'success');
          }).catch(() => {});
        },

        togglePowerPairsSort(col) {
          if (col === 'freq') {
            this.powerPairsSort = this.powerPairsSort === 'freq_desc' ? 'freq_asc' : 'freq_desc';
          } else if (col === 'velocity') {
            this.powerPairsSort = this.powerPairsSort === 'velocity_desc' ? 'velocity_asc' : 'velocity_desc';
          } else if (col === 'lift') {
            this.powerPairsSort = this.powerPairsSort === 'lift_desc' ? 'lift_asc' : 'lift_desc';
          } else if (col === 'tag') {
            this.powerPairsSort = this.powerPairsSort === 'tag_asc' ? 'tag_desc' : 'tag_asc';
          } else {
            this.powerPairsSort = this.powerPairsSort === 'synergy_desc' ? 'freq_desc' : 'synergy_desc';
          }
          this.powerPairsPage = 1;
        },

        filteredPowerPairs() {
          if (!this.powerPairs || this.powerPairs.length === 0) return [];
          let list = this.powerPairs;
          if (this.powerPairsSearch.trim()) {
            const q = this.powerPairsSearch.toLowerCase().trim();
            list = list.filter(p => 
              p.tag_a.toLowerCase().includes(q) || 
              p.tag_b.toLowerCase().includes(q)
            );
          }

          if (this.powerPairsSort === 'freq_desc') {
            list = list.slice().sort((a, b) => b.joint_count - a.joint_count || (b.total_velocity || 0) - (a.total_velocity || 0) || b.lift - a.lift);
          } else if (this.powerPairsSort === 'freq_asc') {
            list = list.slice().sort((a, b) => a.joint_count - b.joint_count || (a.total_velocity || 0) - (b.total_velocity || 0) || a.lift - b.lift);
          } else if (this.powerPairsSort === 'velocity_desc') {
            list = list.slice().sort((a, b) => (b.total_velocity || 0) - (a.total_velocity || 0) || b.joint_count - a.joint_count);
          } else if (this.powerPairsSort === 'velocity_asc') {
            list = list.slice().sort((a, b) => (a.total_velocity || 0) - (b.total_velocity || 0) || a.joint_count - b.joint_count);
          } else if (this.powerPairsSort === 'lift_desc') {
            list = list.slice().sort((a, b) => b.lift - a.lift || b.joint_count - a.joint_count);
          } else if (this.powerPairsSort === 'lift_asc') {
            list = list.slice().sort((a, b) => a.lift - b.lift || b.joint_count - a.joint_count);
          } else if (this.powerPairsSort === 'tag_asc') {
            list = list.slice().sort((a, b) => a.tag_a.localeCompare(b.tag_a));
          } else if (this.powerPairsSort === 'tag_desc') {
            list = list.slice().sort((a, b) => b.tag_a.localeCompare(a.tag_a));
          } else {
            list = list.slice().sort((a, b) => b.synergy_score - a.synergy_score || b.joint_count - a.joint_count);
          }
          return list;
        },

        paginatedPowerPairsTable() {
          const list = this.filteredPowerPairs();
          const start = (this.powerPairsPage - 1) * this.powerPairsPageSize;
          return list.slice(start, start + this.powerPairsPageSize);
        },

        totalPowerPairsPages() {
          return Math.ceil(this.filteredPowerPairs().length / this.powerPairsPageSize) || 1;
        },

        filteredAnchorsList() {
          let list = this.coreAnchorsList || [];
          if (this.anchorsTier === 'whales') {
            list = list.filter(a => a.count >= 25);
          } else if (this.anchorsTier === 'high') {
            list = list.filter(a => a.count >= 10);
          } else if (this.anchorsTier === 'core') {
            list = list.filter(a => a.count >= 5);
          }

          if (this.anchorsSearch.trim()) {
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

        toggleDomainSort(col) {
          if (col === 'domain') {
            this.domainSort = this.domainSort === 'domain_asc' ? 'domain_desc' : 'domain_asc';
          } else if (col === 'keywords') {
            this.domainSort = this.domainSort === 'kw_desc' ? 'kw_asc' : 'kw_desc';
          } else if (col === 'pins') {
            this.domainSort = this.domainSort === 'pins_desc' ? 'pins_asc' : 'pins_desc';
          } else if (col === 'saves') {
            this.domainSort = this.domainSort === 'saves_desc' ? 'saves_asc' : 'saves_desc';
          } else {
            this.domainSort = 'default';
          }
          this.domainPage = 1;
          this._domainCacheKey = '';
        },

        filteredDomainList() {
          const monopoly = this.crossoverData?.domain_monopoly || [];
          const search = (this.domainSearch || '').toLowerCase().trim();
          const currentKey = (this.activeFolderId || '') + '|' + search + '|' + this.domainSort + '|' + monopoly.length;
          if (this._domainCacheKey === currentKey && this._cachedFilteredDomains) {
            return this._cachedFilteredDomains;
          }

          let list = monopoly;
          if (search) {
            list = monopoly.filter(d => d.domain && d.domain.toLowerCase().includes(search));
          }

          if (this.domainSort === 'domain_asc') {
            list = list.slice().sort((a, b) => String(a.domain || '').localeCompare(String(b.domain || '')));
          } else if (this.domainSort === 'domain_desc') {
            list = list.slice().sort((a, b) => String(b.domain || '').localeCompare(String(a.domain || '')));
          } else if (this.domainSort === 'kw_desc') {
            list = list.slice().sort((a, b) => ((b.keywords_count || 0) - (a.keywords_count || 0)) || ((b.pin_count || 0) - (a.pin_count || 0)) || ((b.total_saves || 0) - (a.total_saves || 0)));
          } else if (this.domainSort === 'kw_asc') {
            list = list.slice().sort((a, b) => ((a.keywords_count || 0) - (b.keywords_count || 0)) || ((a.pin_count || 0) - (b.pin_count || 0)) || ((a.total_saves || 0) - (b.total_saves || 0)));
          } else if (this.domainSort === 'pins_desc') {
            list = list.slice().sort((a, b) => ((b.pin_count || 0) - (a.pin_count || 0)) || ((b.total_saves || 0) - (a.total_saves || 0)));
          } else if (this.domainSort === 'pins_asc') {
            list = list.slice().sort((a, b) => ((a.pin_count || 0) - (b.pin_count || 0)) || ((a.total_saves || 0) - (b.total_saves || 0)));
          } else if (this.domainSort === 'saves_desc') {
            list = list.slice().sort((a, b) => ((b.total_saves || 0) - (a.total_saves || 0)) || ((b.pin_count || 0) - (a.pin_count || 0)));
          } else if (this.domainSort === 'saves_asc') {
            list = list.slice().sort((a, b) => ((a.total_saves || 0) - (b.total_saves || 0)) || ((a.pin_count || 0) - (b.pin_count || 0)));
          }

          this._domainCacheKey = currentKey;
          this._cachedFilteredDomains = list;
          return list;
        },

        paginatedDomains() {
          const list = this.filteredDomainList();
          const pageSize = Math.max(1, parseInt(this.domainPageSize, 10) || 10);
          const totalPages = Math.ceil(list.length / pageSize) || 1;
          let page = parseInt(this.domainPage, 10);
          if (!page || isNaN(page) || page < 1) page = 1;
          if (page > totalPages) page = totalPages;
          const start = (page - 1) * pageSize;
          return list.slice(start, start + pageSize);
        },

        totalDomainPages() {
          const pageSize = Math.max(1, parseInt(this.domainPageSize, 10) || 10);
          return Math.ceil(this.filteredDomainList().length / pageSize) || 1;
        },
        toasts: [],
        colorOptions: ['#6366f1', '#ec4899', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4'],

        async init() {
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

            // [INVARIANT: FOLDER-SCOPED-POPSTATE-PRESERVATION] Synchronize currentRoom with URL on browser Back/Forward (LND-15)
            window.addEventListener('popstate', () => {
              try {
                const path = window.location.pathname || '';
                const segs = path.split('/').filter(Boolean);
                if (segs[0] === 'folders' && segs[1]) {
                  const subRoute = (segs[2] || '').toLowerCase();
                  if (subRoute === 'settings') {
                    this.currentRoom = 'settings';
                  } else if (subRoute === 'crossover' || !subRoute) {
                    this.currentRoom = 'crossover';
                  } else if (subRoute === 'keywords') {
                    this.currentRoom = 'keywords';
                  } else if (subRoute === 'creators') {
                    this.currentRoom = 'creators';
                  } else if (subRoute === 'domains') {
                    this.currentRoom = 'domains';
                  }
                  this.$nextTick(() => {
                    if (window.lucide && typeof window.lucide.createIcons === 'function') {
                      window.lucide.createIcons();
                    }
                  });
                }
              } catch (_) {}
            });
          }

          if (this.darkMode) {
            document.documentElement.classList.add('dark');
          } else {
            document.documentElement.classList.remove('dark');
          }

          this.$nextTick(() => {
            if (typeof window !== 'undefined' && window.lucide && typeof window.lucide.createIcons === 'function') {
              window.lucide.createIcons();
            }
          });

          if (this.activeFolderId) {
            await this.loadActiveFolder();
            // Non-blocking background fetch for switcher dropdown when active folder is loaded
            this.loadFolders().catch(() => {});
          } else {
            await this.loadFolders();
          }

          this.$watch('searchQuery', async (val) => {
            this.currentPage = 1;
            if (val && String(val).includes('pin.it/') && /pin[.]it[/][a-zA-Z0-9_-]+/i.test(String(val).trim())) {
              await this.resolveShortlinkSearch(String(val).trim());
            }
          });

          this.$nextTick(() => {
            if (typeof window !== 'undefined' && window.lucide && typeof window.lucide.createIcons === 'function') {
              window.lucide.createIcons();
            }
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
          if (this.darkMode) {
            document.documentElement.classList.add('dark');
            this.showToast('Dark theme activated', 'info');
          } else {
            document.documentElement.classList.remove('dark');
            this.showToast('Light theme activated', 'info');
          }
          this.$nextTick(() => {
            if (window.lucide) window.lucide.createIcons();
          });
        },

        showToast(message, type = 'info') {
          const id = Date.now() + Math.random();
          this.toasts.push({ id, message, type });
          setTimeout(() => this.removeToast(id), 4000);
        },

        removeToast(id) {
          this.toasts = this.toasts.filter(t => t.id !== id);
        },

        async loadFolders() {
          this.foldersLoading = true;
          try {
            let res;
            if (this.activeFolderId) {
              res = await (window.safeApiFetch || fetch)('/api/folders?lite=true');
            } else {
              res = await (window.safeApiFetch || fetch)('/api/folders');
            }
            if (res.ok) {
              const data = await res.json().catch(() => ({}));
              this.foldersList = data.folders || [];
              if (this.activeFolderId) {
                const matched = this.foldersList.find(f => String(f.id) === String(this.activeFolderId));
                if (matched) {
                  this.activeFolder = this.activeFolder ? { ...matched, ...this.activeFolder } : matched;
                }
              }
            } else {
              if (!this.activeFolder) {
                this.showToast('Failed to load campaign folders', 'error');
              }
            }
          } catch (e) {
            console.error('Error loading folders:', e);
            if (!this.activeFolder) {
              this.showToast('Network error loading folders', 'error');
            }
          } finally {
            if (!this.foldersList.length && this.activeFolder) {
              this.foldersList = [this.activeFolder];
            }
            this.foldersLoading = false;
          }
        },

        async loadActiveFolder(forceRefresh = false) {
          const reqSeq = ++this._folderReqSeq;
          // Phase 1: Fast metadata hydration (< 50ms)
          try {
            const shouldRefresh = forceRefresh === true || this.currentRoom === 'settings';
            const folderUrl = '/api/folders/' + this.activeFolderId + (shouldRefresh ? '?refresh=true' : '');
            const folderRes = await (window.safeApiFetch || fetch)(folderUrl);
            if (reqSeq !== this._folderReqSeq) return;
            if (folderRes.ok) {
              const data = await folderRes.json().catch(() => ({}));
              if (reqSeq !== this._folderReqSeq) return;
              const fetched = data.folder || null;
              this.activeFolder = fetched ? (this.activeFolder ? { ...this.activeFolder, ...fetched } : fetched) : null;
              this.syncFolderSettingsFromActive();
            } else {
              this.showToast('Campaign folder not found', 'error');
            }
          } catch (e) {
            if (reqSeq !== this._folderReqSeq) return;
            console.error('Error fetching folder metadata:', e);
          }

          // Unnecessary 30s Crossover fetch bypassed when in settings room
          if (this.currentRoom === 'settings') {
            this.crossoverLoading = false;
            return;
          }

          // Phase 2: Crossover Matrix analysis (< 30s)
          this.crossoverLoading = true;
          try {
            const crossoverRes = await (window.safeApiFetch || fetch)('/api/folders/' + this.activeFolderId + '/raw-visual-crossover', {
              timeout: 30000,
              retries: 1
            });
            if (reqSeq !== this._folderReqSeq) return;
            if (crossoverRes.ok) {
              const cdata = await crossoverRes.json().catch(() => ({}));
              if (reqSeq !== this._folderReqSeq) return;
              this.crossoverData = cdata.crossover || cdata;
              this.computePowerPairs();
              this.currentPage = 1;
              this.domainPage = 1;
              this.domainSearch = '';
              this.domainSort = 'default';
              this._domainCacheKey = '';
              this._cachedFilteredDomains = null;
              this._pinsCacheKey = '';
            } else {
              this.showToast('Failed to compute crossover matrix', 'error');
            }
          } catch (e) {
            if (reqSeq !== this._folderReqSeq) return;
            console.error('Error loading crossover matrix:', e);
            this.showToast('Crossover matrix analysis timed out or failed', 'error');
          } finally {
            if (reqSeq === this._folderReqSeq) {
              this.crossoverLoading = false;
            }
          }
        },

        async runCrossoverAnalysis(isRefresh = false) {
          if (!this.activeFolderId) return;
          const reqSeq = ++this._folderReqSeq;
          this.crossoverLoading = true;
          try {
            const url = '/api/folders/' + this.activeFolderId + '/raw-visual-crossover' + (isRefresh ? '?refresh=true' : '');
            const res = await (window.safeApiFetch || fetch)(url);
            if (reqSeq !== this._folderReqSeq) return;
            if (res.ok) {
              const data = await res.json().catch(() => ({}));
              if (reqSeq !== this._folderReqSeq) return;
              this.crossoverData = data.crossover || data;
              this.computePowerPairs();
              this.currentPage = 1;
              this.domainPage = 1;
              this.domainSearch = '';
              this.domainSort = 'default';
              this._domainCacheKey = '';
              this._cachedFilteredDomains = null;
              this._pinsCacheKey = '';
              if (isRefresh) {
                this.showToast('Crossover analysis recalculated successfully', 'success');
              }
            } else {
              this.showToast('Failed to compute crossover matrix', 'error');
            }
          } catch (e) {
            if (reqSeq !== this._folderReqSeq) return;
            console.error('Error running crossover analysis:', e);
            this.showToast('Network error analyzing crossover', 'error');
          } finally {
            if (reqSeq === this._folderReqSeq) {
              this.crossoverLoading = false;
            }
          }
        },

        syncFolderSettingsFromActive() {
          if (!this.activeFolder) return;
          let meta = this.activeFolder.metadata;
          if (typeof meta === 'string') {
            try {
              meta = JSON.parse(meta);
              if (typeof meta === 'string') meta = JSON.parse(meta);
            } catch (_) { meta = {}; }
          }
          if (!meta || typeof meta !== 'object' || Array.isArray(meta)) meta = {};

          this.folderSettings = {
            name: this.activeFolder.name || '',
            description: this.activeFolder.description || '',
            color: this.activeFolder.color || '#6366f1',
            enable_serp_harvest: meta.enable_serp_harvest !== undefined ? Boolean(meta.enable_serp_harvest) : true,
            max_pins: String(meta.max_pins || '50'),
            max_serp_pins: String(meta.max_serp_pins || meta.max_pins || '50'),
            crawl_scope: String(meta.crawl_scope || 'all_pins'),
            max_catalog_inspect: String(meta.max_catalog_inspect || '0'),
            pause_competitors: Boolean(meta.pause_competitors),
            pause_crawlers: Boolean(meta.pause_crawlers),
            block_fleet: Boolean(meta.block_fleet),
            auto_discover_creators: meta.auto_discover_creators !== undefined ? Boolean(meta.auto_discover_creators) : true
          };
        },

        openFolderSettingsModal() {
          if (!this.activeFolder) return;
          this.syncFolderSettingsFromActive();
          this.isSettingsModalOpen = true;
        },

        async saveFolderSettings(andLaunchAudit = false) {
          if (!this.activeFolderId) return;
          this.settingsLoading = true;
          try {
            let meta = this.activeFolder?.metadata;
            if (typeof meta === 'string') {
              try {
                meta = JSON.parse(meta);
                if (typeof meta === 'string') meta = JSON.parse(meta);
              } catch (_) { meta = {}; }
            }
            if (!meta || typeof meta !== 'object' || Array.isArray(meta)) meta = {};

            const maxPinsVal = String(this.folderSettings.max_serp_pins || this.folderSettings.max_pins || '50');
            const payload = {
              name: (this.folderSettings.name || '').trim() || (this.activeFolder?.name || ''),
              description: (this.folderSettings.description || '').trim(),
              color: this.folderSettings.color || '#6366f1',
              metadata: {
                ...meta,
                enable_serp_harvest: Boolean(this.folderSettings.enable_serp_harvest),
                max_pins: maxPinsVal,
                max_serp_pins: maxPinsVal,
                crawl_scope: String(this.folderSettings.crawl_scope || 'all_pins'),
                max_catalog_inspect: String(this.folderSettings.max_catalog_inspect || '0'),
                pause_competitors: Boolean(this.folderSettings.pause_competitors),
                pause_crawlers: Boolean(this.folderSettings.pause_crawlers),
                block_fleet: Boolean(this.folderSettings.block_fleet),
                auto_discover_creators: Boolean(this.folderSettings.auto_discover_creators)
              }
            };

            const res = await (window.safeApiFetch || fetch)('/api/folders/' + this.activeFolderId, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });

            if (res.ok) {
              const data = await res.json();
              if (data.folder) {
                this.activeFolder = { ...this.activeFolder, ...data.folder };
                const fIdx = this.foldersList.findIndex(f => f.id === this.activeFolderId);
                if (fIdx !== -1) {
                  this.foldersList[fIdx] = { ...this.foldersList[fIdx], ...data.folder };
                }
              }
              this.showToast('Folder settings saved successfully', 'success');
              if (andLaunchAudit) {
                await this.dispatchFolderDeepAudit();
              } else {
                this.isSettingsModalOpen = false;
              }
            } else {
              const errData = await res.json().catch(() => ({}));
              this.showToast(errData.message || errData.error || 'Failed to save folder settings', 'error');
            }
          } catch (err) {
            this.showToast('Error saving settings: ' + err.message, 'error');
          } finally {
            this.settingsLoading = false;
          }
        },

        async dispatchFolderDeepAudit() {
          if (!this.activeFolderId) return;
          this.auditDispatching = true;
          this.showToast('🚀 Dispatching 20-runner parallel cluster fleet on GitHub Actions...', 'info');
          try {
            let meta = this.activeFolder?.metadata;
            if (typeof meta === 'string') {
              try {
                meta = JSON.parse(meta);
                if (typeof meta === 'string') meta = JSON.parse(meta);
              } catch (_) { meta = {}; }
            }
            if (!meta || typeof meta !== 'object' || Array.isArray(meta)) meta = {};

            const harvest = this.folderSettings?.enable_serp_harvest !== undefined
              ? Boolean(this.folderSettings.enable_serp_harvest)
              : (meta.enable_serp_harvest !== undefined ? Boolean(meta.enable_serp_harvest) : true);
            const maxPins = String(this.folderSettings?.max_pins || meta.max_pins || '50');
            const maxSerpPins = String(this.folderSettings?.max_serp_pins || meta.max_serp_pins || maxPins);
            const crawlScope = String(this.folderSettings?.crawl_scope || meta.crawl_scope || 'all_pins');
            const maxCatalogInspect = String(this.folderSettings?.max_catalog_inspect || meta.max_catalog_inspect || '0');

            const res = await (window.safeApiFetch || fetch)('/api/folders/' + this.activeFolderId + '/dispatch-audit', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                crawl_scope: crawlScope,
                max_pins: maxPins,
                max_serp_pins: maxSerpPins,
                max_catalog_inspect: maxCatalogInspect,
                enable_serp_harvest: String(harvest)
              })
            });
            const data = await res.json();
            if (res.ok && data.success) {
              this.showToast(data.message || '20-Runner Parallel Fleet Audit dispatched successfully on GitHub Actions!', 'success');
              if (this.isSettingsModalOpen) this.isSettingsModalOpen = false;
            } else {
              this.showToast('Dispatch note: ' + (data.message || data.error || 'Check GitHub token in settings'), 'error');
            }
          } catch (err) {
            this.showToast('Error triggering cluster fleet: ' + err.message, 'error');
          } finally {
            this.auditDispatching = false;
          }
        },

        get coreAnchorsList() {
          // Single Source of Truth: Use backend canonical lemmatized tag_bridges when present
          if (Array.isArray(this.crossoverData?.tag_bridges) && this.crossoverData.tag_bridges.length > 0) {
            return this.crossoverData.tag_bridges.map(tb => ({
              ...tb,
              tag: tb.tag || tb.raw_tag,
              raw_tag: tb.raw_tag || tb.tag,
              count: tb.pin_count ?? tb.count ?? 0,
              pin_count: tb.pin_count ?? tb.count ?? 0,
              keywords_count: tb.keyword_overlap_count ?? tb.keywords_count ?? (tb.keywords ? tb.keywords.length : 1),
              total_velocity: tb.total_velocity ?? tb.velocity_gain ?? 0
            }));
          }

          const pins = (this.crossoverData?.all_pins && this.crossoverData.all_pins.length > 0)
            ? this.crossoverData.all_pins
            : (this.crossoverData?.super_pins || []);
          if (!pins || pins.length === 0) return [];

          const totalKws = Math.max(1, Number(this.crossoverData?.summary?.total_keywords || this.totalKeywordsCount || 1));
          const toTitleCase = (str) => str ? str.split(' ').filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') : '';
          const freqMap = new Map();

          for (const pin of pins) {
            const tags = Array.isArray(pin.visual_annotations) ? pin.visual_annotations : [];
            const seen = new Set();
            for (const t of tags) {
              const lemma = this.normalizeClientTagLemma(t);
              if (lemma && lemma.length >= 3 && !seen.has(lemma)) {
                seen.add(lemma);
                let rec = freqMap.get(lemma);
                if (!rec) {
                  rec = {
                    tag: toTitleCase(lemma),
                    raw_tag: lemma,
                    count: 0,
                    pin_count: 0,
                    total_saves: 0,
                    total_velocity: 0,
                    total_repins_delta: 0,
                    keywords_set: new Set()
                  };
                  freqMap.set(lemma, rec);
                }
                rec.count += 1;
                rec.pin_count += 1;
                rec.total_saves += Number(pin.save_count || 0);
                rec.total_velocity += Number(pin.effective_velocity ?? pin.daily_save_velocity ?? 0);
                rec.total_repins_delta += Math.max(0, Number(pin.delta_repins_24h || 0));
                for (const r of (pin.rankings || [])) {
                  if (r.keyword) rec.keywords_set.add(r.keyword);
                }
              }
            }
          }

          const list = [];
          for (const rec of freqMap.values()) {
            if (rec.count >= 2) {
              const kwCount = rec.keywords_set.size || 1;
              const overlapPct = Math.round((kwCount / totalKws) * 100);
              list.push({
                tag: rec.tag,
                raw_tag: rec.raw_tag,
                count: rec.count,
                pin_count: rec.pin_count,
                keywords_count: kwCount,
                keyword_overlap_count: kwCount,
                overlap_percentage: overlapPct,
                is_universal: overlapPct >= 50,
                keywords: Array.from(rec.keywords_set),
                total_saves: rec.total_saves,
                total_velocity: Math.round(rec.total_velocity * 10) / 10,
                velocity_gain: Math.round(rec.total_velocity * 10) / 10,
                total_repins_delta: Math.round(rec.total_repins_delta)
              });
            }
          }
          return list.sort((a, b) => b.count - a.count || b.total_velocity - a.total_velocity);
        },

        computePowerPairs() {
          // Compute across all cluster pins (or super-pins)
          const source = (this.crossoverData?.all_pins && this.crossoverData.all_pins.length > 0)
            ? this.crossoverData.all_pins
            : (this.crossoverData?.super_pins || []);
          if (!source || source.length < 2) {
            this.powerPairs = [];
            this.powerTriplets = [];
            return;
          }

          const pins = source;
          const N_total = pins.length;
          const tagFreq = new Map();
          const pairFreq = new Map();
          const tripletFreq = new Map();

          // Stopwords filter for pairs
          const skipWords = new Set([
            'pin', 'pins', 'recipe', 'recipes', 'idea', 'ideas', 'food', 'dinner', 
            'meal', 'meals', 'easy', 'quick', 'best', 'delicious', 'simple', 'diy', 'guide',
            'homemade', 'cook', 'cooking', 'dish', 'dishes'
          ]);

          const toTitleCase = (str) => {
            if (!str) return '';
            return str.split(' ').filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
          };

          // Pass 1: Extract normalized tags per pin once and count frequencies using primitive integers only
          const extractedPinMeta = new Array(N_total);
          for (let pIdx = 0; pIdx < N_total; pIdx++) {
            const pin = pins[pIdx];
            const rawSet = new Set();
            const lemmaSet = new Set();
            for (const rawVa of (pin.visual_annotations || [])) {
              const va = typeof rawVa === 'object' && rawVa !== null ? (rawVa.name || rawVa.tag || rawVa.label || rawVa.term || '') : (typeof rawVa === 'string' ? rawVa : '');
              if (va) {
                const clean = va.trim().toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/  +/g, ' ').trim();
                if (clean.length >= 3 && clean.length <= 35 && !skipWords.has(clean)) {
                  rawSet.add(clean);
                }
                const lemma = this.normalizeClientTagLemma(va);
                if (lemma && lemma.length >= 3 && lemma.length <= 35 && !skipWords.has(lemma)) {
                  lemmaSet.add(lemma);
                }
              }
            }

            const pinTags = Array.from(rawSet).slice(0, 10);
            const tArr = Array.from(lemmaSet).slice(0, 8).sort();
            extractedPinMeta[pIdx] = { pinTags, tArr };

            for (let i = 0; i < pinTags.length; i++) {
              const t1 = pinTags[i];
              tagFreq.set(t1, (tagFreq.get(t1) || 0) + 1);
              for (let j = i + 1; j < pinTags.length; j++) {
                const t2 = pinTags[j];
                if (t1.includes(t2) || t2.includes(t1)) continue;
                const key = t1 < t2 ? (t1 + '|||' + t2) : (t2 + '|||' + t1);
                pairFreq.set(key, (pairFreq.get(key) || 0) + 1);
              }
            }

            for (let i = 0; i < tArr.length; i++) {
              for (let j = i + 1; j < tArr.length; j++) {
                if (tArr[i].includes(tArr[j]) || tArr[j].includes(tArr[i])) continue;
                for (let k = j + 1; k < tArr.length; k++) {
                  if (tArr[k].includes(tArr[i]) || tArr[i].includes(tArr[k]) || tArr[k].includes(tArr[j]) || tArr[j].includes(tArr[k])) continue;
                  const tKey = tArr[i] + '|||' + tArr[j] + '|||' + tArr[k];
                  tripletFreq.set(tKey, (tripletFreq.get(tKey) || 0) + 1);
                }
              }
            }
          }

          // Dynamic min support threshold: 2 for small subsets, at least 5 for 1,000+ pins
          const minSupport = N_total > 500 ? 5 : (N_total > 100 ? 3 : 2);

          // Collect only qualifying pairs and triplets before allocating metadata structures
          const pairStats = new Map();
          for (const [key, jointCount] of pairFreq.entries()) {
            if (jointCount >= minSupport) {
              pairStats.set(key, { jointCount, vel: 0, repins: 0, saves: 0, kws: new Set(), pins: [] });
            }
          }

          const tripletStats = new Map();
          for (const [tKey, jointCount] of tripletFreq.entries()) {
            if (jointCount >= 2) {
              tripletStats.set(tKey, { jointCount, vel: 0, repins: 0, saves: 0, kws: new Set(), pinIds: [], pins: [] });
            }
          }

          // Pass 2: Hydrate metrics and pin references ONLY for surviving pairs & triplets
          for (let pIdx = 0; pIdx < N_total; pIdx++) {
            const pin = pins[pIdx];
            const { pinTags, tArr } = extractedPinMeta[pIdx];
            const pVel = Number(pin.effective_velocity ?? pin.daily_save_velocity ?? pin.delta_saves_24h ?? 0);
            const pRepins = Math.max(0, Number(pin.delta_repins_24h || 0));
            const pSaves = Number(pin.save_count || 0);
            const pinKws = (pin.rankings || []).map(r => r.keyword).filter(Boolean);

            for (let i = 0; i < pinTags.length; i++) {
              const t1 = pinTags[i];
              for (let j = i + 1; j < pinTags.length; j++) {
                const t2 = pinTags[j];
                if (t1.includes(t2) || t2.includes(t1)) continue;
                const key = t1 < t2 ? (t1 + '|||' + t2) : (t2 + '|||' + t1);
                const st = pairStats.get(key);
                if (st) {
                  st.vel += pVel;
                  st.repins += pRepins;
                  st.saves += pSaves;
                  for (const kw of pinKws) st.kws.add(kw);
                  if (st.pins.length < 16) st.pins.push(pin);
                }
              }
            }

            for (let i = 0; i < tArr.length; i++) {
              for (let j = i + 1; j < tArr.length; j++) {
                if (tArr[i].includes(tArr[j]) || tArr[j].includes(tArr[i])) continue;
                for (let k = j + 1; k < tArr.length; k++) {
                  if (tArr[k].includes(tArr[i]) || tArr[i].includes(tArr[k]) || tArr[k].includes(tArr[j]) || tArr[j].includes(tArr[k])) continue;
                  const tKey = tArr[i] + '|||' + tArr[j] + '|||' + tArr[k];
                  const tst = tripletStats.get(tKey);
                  if (tst) {
                    tst.vel += pVel;
                    tst.repins += pRepins;
                    tst.saves += pSaves;
                    tst.pinIds.push(String(pin.pin_id || pIdx));
                    for (const kw of pinKws) tst.kws.add(kw);
                    if (tst.pins.length < 16) tst.pins.push(pin);
                  }
                }
              }
            }
          }

          const pairs = [];
          for (const [key, st] of pairStats.entries()) {
            const jointCount = st.jointCount;
            const [t1, t2] = key.split('|||');
            const n1 = tagFreq.get(t1) || 1;
            const n2 = tagFreq.get(t2) || 1;
            const liftRaw = ((jointCount + 1) * (N_total + 4)) / ((n1 + 2) * (n2 + 2));
            const confRaw = (jointCount + 1) / (n1 + 2);

            const liftVal = Number.isFinite(liftRaw) ? Number(liftRaw.toFixed(2)) : 1.0;
            const confidence = Number.isFinite(confRaw) ? Number(confRaw.toFixed(2)) : 0.0;
            const supportPct = Number(((jointCount / N_total) * 100).toFixed(1));
            const synergyScore = liftVal * Math.log2(jointCount + 1);

            const topPins = st.pins.slice().sort((a, b) => (Number(b.effective_velocity ?? b.daily_save_velocity ?? 0) - Number(a.effective_velocity ?? a.daily_save_velocity ?? 0)) || (Number(b.save_count || 0) - Number(a.save_count || 0))).slice(0, 12);

            pairs.push({
              tag_a: toTitleCase(t1),
              tag_b: toTitleCase(t2),
              joint_count: jointCount,
              keywords_count: st.kws.size || 1,
              keywords: Array.from(st.kws),
              lift: liftVal,
              confidence: confidence,
              support_pct: supportPct,
              synergy_score: synergyScore,
              total_velocity: Math.round(st.vel * 10) / 10,
              total_repins_delta: Math.round(st.repins),
              total_saves: st.saves,
              pins: topPins,
              matching_pins: topPins
            });
          }

          // Default sort by pins frequency (high to low), with daily save velocity as secondary ranking
          pairs.sort((a, b) => b.joint_count - a.joint_count || (b.total_velocity || 0) - (a.total_velocity || 0) || b.lift - a.lift);
          this.powerPairs = pairs;

          const rawTriplets = [];
          for (const [tKey, tst] of tripletStats.entries()) {
            const rawTags = tKey.split('|||');
            const topPins = tst.pins.slice().sort((a, b) => (Number(b.effective_velocity ?? b.daily_save_velocity ?? 0) - Number(a.effective_velocity ?? a.daily_save_velocity ?? 0)) || (Number(b.save_count || 0) - Number(a.save_count || 0))).slice(0, 12);
            const pinSetSig = tst.pinIds.slice().sort().join(',');
            const tagSupportSum = rawTags.reduce((s, tg) => s + (tagFreq.get(tg) || 1), 0);
            rawTriplets.push({
              tags: rawTags.map(toTitleCase),
              raw_tags: rawTags,
              joint_count: tst.jointCount,
              keywords_count: tst.kws.size || 1,
              keywords: Array.from(tst.kws),
              total_velocity: Math.round(tst.vel * 10) / 10,
              total_repins_delta: Math.round(tst.repins),
              total_saves: tst.saves,
              pins: topPins,
              matching_pins: topPins,
              _pin_set_sig: pinSetSig,
              _tag_support_sum: tagSupportSum
            });
          }

          // Sort candidates so the strongest multi-keyword, highest-velocity, highest-support triplet comes first
          rawTriplets.sort((a, b) =>
            ((b.keywords_count >= 2 ? 1 : 0) - (a.keywords_count >= 2 ? 1 : 0)) ||
            (b.total_velocity - a.total_velocity) ||
            (b.joint_count - a.joint_count) ||
            (b._tag_support_sum - a._tag_support_sum)
          );

          // Deduplicate cloned pin-set combinations (prevents 11 identical syndicated pins with 6 tags from spawning C(6,3)=20 identical triplet rows)
          const seenPinSets = new Set();
          const dedupedTriplets = [];
          for (const tr of rawTriplets) {
            if (tr._pin_set_sig && seenPinSets.has(tr._pin_set_sig)) {
              continue;
            }
            if (tr._pin_set_sig) {
              seenPinSets.add(tr._pin_set_sig);
            }
            delete tr._pin_set_sig;
            delete tr._tag_support_sum;
            dedupedTriplets.push(tr);
          }

          this.powerTriplets = dedupedTriplets.slice(0, 60);
        },

        copyPinBlueprint(sp) {
          if (!sp) return;
          const title = String(sp.title || ('Pin #' + sp.pin_id)).trim();
          const tags = (sp.visual_annotations || []).map(v => typeof v === 'object' && v !== null ? (v.name || v.tag || '') : String(v || '')).filter(Boolean).slice(0, 8);
          const kws = (sp.rankings || []).map(r => r.keyword + ' (#' + r.rank_position + ')').slice(0, 5);
          const vel = Number(sp.effective_velocity ?? sp.daily_save_velocity ?? 0);
          const blueprint = [
            '⚡ SCIENTIFIC PIN ARBITRAGE BLUEPRINT',
            '====================================',
            'Reference Pin: ' + title + ' (#' + sp.pin_id + ')',
            'Total Saves: ' + this.formatNumber(sp.save_count || 0) + ' | 24h Save Velocity: +' + vel + '/d | 24h Repins: +' + (sp.delta_repins_24h || 0),
            'Ranked Keywords: ' + (kws.join(', ') || 'Cluster Discovery'),
            'Visual CV Hooks: ' + (tags.join(', ') || 'Clean Focal Composition'),
            'Dominant Color: ' + (sp.dominant_color || '#E11D48') + ' | Aspect Ratio: ' + (sp.aspect_ratio || '2:3')
          ].join('\\n');
          navigator.clipboard.writeText(blueprint).then(() => {
            this.showToast('Copied Scientific Blueprint for Pin #' + sp.pin_id + '!', 'success');
          }).catch(() => {
            this.showToast('Clipboard access denied', 'warning');
          });
        },

        copyVisualBlueprint(pair) {
          const folderName = String(this.activeFolder?.name || 'Topic Cluster').replace(/<[^>]*>/g, '').trim();
          const pillar = String(folderName + ' Master Guide').replace(/<[^>]*>/g, '').trim();
          const launch = String(this.crossoverData?.seasonality?.recommended_launch_window || 'Evergreen').replace(/<[^>]*>/g, '').trim();
          const tagA = String(pair.tag_a || '').replace(/<[^>]*>/g, '').trim();
          const tagB = String(pair.tag_b || '').replace(/<[^>]*>/g, '').trim();

          const blueprint = [
            '📌 PINTEREST HIGH-CONVERTING VISUAL BLUEPRINT',
            '============================================',
            'Cluster: ' + folderName,
            'Power Synergy Pair: ' + tagA + ' + ' + tagB,
            'Mathematical Lift: ' + pair.lift + 'x (Joint Pins: ' + pair.joint_count + ')',
            'Pillar Concept: ' + pillar,
            'Target Launch Window: ' + launch,
            '',
            '🎨 CREATIVE GUIDELINES FOR GRAPHIC DESIGNER:',
            '1. Primary Focal Object: ' + tagA + ' prominently showcased in foreground.',
            '2. Secondary Anchor: ' + tagB + ' clearly visible or labeled in background/overlay.',
            '3. Typography: High-contrast bold headline with clean sans-serif text.',
            '4. Aspect Ratio: 2:3 Standard Vertical (1000x1500) or 9:16 Story (1080x1920).'
          ].join('\\n');

          navigator.clipboard.writeText(blueprint).then(() => {
            this.showToast('Copied Visual Blueprint (' + tagA + ' + ' + tagB + ')!', 'success');
          }).catch(() => {
            this.showToast('Clipboard access denied', 'warning');
          });
        },

        scrollToSection(id) {
          this.$nextTick(() => {
            const el = document.getElementById(id);
            if (el) {
              el.scrollIntoView({ behavior: 'smooth' });
            }
          });
        },

        sanitizeCsvCell(val) {
          let str = String(val == null ? '' : val);
          const code = str.charCodeAt(0);
          if (code === 61 || code === 43 || code === 45 || code === 64 || code === 9 || code === 10 || code === 13) {
            str = "'" + str;
          }
          return '"' + str.replace(/"/g, '""') + '"';
        },

        downloadClusterCsv() {
          const bp = this.crossoverData?.topic_cluster_blueprint;
          if (!bp || !bp.csv_rows?.length) {
            this.showToast('No cluster blueprint rows available to export', 'warning');
            return;
          }

          const headers = Object.keys(bp.csv_rows[0]);
          const csvContent = [
            headers.map(h => this.sanitizeCsvCell(h)).join(','),
            ...bp.csv_rows.map(row => 
              headers.map(h => this.sanitizeCsvCell(row[h])).join(',')
            )
          ].join('\\r\\n');

          const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = (this.activeFolder?.name || 'campaign').toLowerCase().replace(/[^a-z0-9]/g, '_') + '_content_plan.csv';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          this.showToast('Downloaded CSV Content Plan!', 'success');
        },

        setEntityFilter(type, value) {
          if (!value) return;
          this.entityFilter = { type, value };
          this.currentPage = 1;
          this.showToast('Filtered pins by ' + type + ': ' + value, 'info');
          this.scrollToSection('pins-table-section');
        },

        clearEntityFilter() {
          this.entityFilter = { type: null, value: null };
          this.currentPage = 1;
          this.showToast('Cleared drill-down filter', 'info');
        },

        toggleSort(col) {
          if (col === 'saves') {
            this.sortBy = this.sortBy === 'saves_desc' ? 'saves_asc' : 'saves_desc';
          } else if (col === 'velocity') {
            this.sortBy = this.sortBy === 'velocity_desc' ? 'saves_desc' : 'velocity_desc';
          } else if (col === 'pin_age') {
            this.sortBy = this.sortBy === 'pin_age_asc' ? 'pin_age_desc' : 'pin_age_asc';
          } else if (col === 'folder_age') {
            this.sortBy = this.sortBy === 'folder_age_desc' ? 'folder_age_asc' : 'folder_age_desc';
          }
          this.currentPage = 1;
        },

        filteredPinsList() {
          const allCount = (this.crossoverData?.all_pins?.length || 0);
          const superCount = (this.crossoverData?.super_pins?.length || 0);
          const matrixKey = this.activeMatrixFilter ? (this.activeMatrixFilter.type + ':' + this.activeMatrixFilter.label) : '';
          const currentKey = this.scopeFilter + '|' + this.sortBy + '|' + this.searchQuery + '|' + matrixKey + '|' + (this.entityFilter.type || '') + ':' + (this.entityFilter.value || '') + '|' + (this.onlyBreakoutBabyDomains ? '1' : '0') + '|' + (this.onlyVacuumPins ? '1' : '0') + '|' + (this.onlyFreshRockets ? '1' : '0') + '|' + (this.onlySurging24h ? '1' : '0') + '|' + allCount + ':' + superCount;

          if (this._pinsCacheKey === currentKey && this._cachedFilteredPins) {
            return this._cachedFilteredPins;
          }

          // Source pins array: if scope is 'super_only', use super_pins; otherwise use full all_pins dataset
          let list = [];
          if (this.scopeFilter === 'super_only') {
            list = this.crossoverData?.super_pins || [];
          } else if (this.scopeFilter === 'active_only') {
            const source = (this.crossoverData?.all_pins && this.crossoverData.all_pins.length > 0)
              ? this.crossoverData.all_pins
              : (this.crossoverData?.super_pins || []);
            list = source.filter(p => p.has_active_rank);
          } else if (this.scopeFilter === 'vault_only') {
            const source = (this.crossoverData?.all_pins && this.crossoverData.all_pins.length > 0)
              ? this.crossoverData.all_pins
              : (this.crossoverData?.super_pins || []);
            list = source.filter(p => !p.has_active_rank && p.has_vault_rank);
          } else {
            list = (this.crossoverData?.all_pins && this.crossoverData.all_pins.length > 0) 
              ? this.crossoverData.all_pins 
              : (this.crossoverData?.super_pins || []);
          }

          // 1. Scope filter by individual keyword
          if (this.scopeFilter !== 'all' && this.scopeFilter !== 'super_only' && this.scopeFilter !== 'active_only' && this.scopeFilter !== 'vault_only') {
            const kw = this.scopeFilter.toLowerCase().trim();
            list = list.filter(p => (p.rankings || []).some(r => (r.keyword || '').toLowerCase().trim() === kw));
          }

          // 2. Entity filter (drill-down by domain or creator)
          if (this.entityFilter.type === 'domain') {
            const d = (this.entityFilter.value || '').toLowerCase().trim();
            list = list.filter(p => (p.domain || '').toLowerCase().includes(d));
          } else if (this.entityFilter.type === 'creator') {
            const c = (this.entityFilter.value || '').toLowerCase().trim();
            list = list.filter(p => (p.creator_username || 'anonymous').toLowerCase() === c);
          }

          // 2B. Structural Visual Matrix Pattern Filter (AND-logic for pairs/triplets, canonical lemma for anchors, capsule/color matching)
          if (this.activeMatrixFilter && this.activeMatrixFilter.item) {
            const mf = this.activeMatrixFilter;
            list = list.filter(p => this.pinMatchesMatrixItem(p, mf.item, mf.type));
          }

          // 3. Search query
          if (this.searchQuery.trim()) {
            const q = this.searchQuery.toLowerCase().trim();
            list = list.filter(p => 
              (p.title || '').toLowerCase().includes(q) ||
              (p.domain || '').toLowerCase().includes(q) ||
              (p.creator_username || '').toLowerCase().includes(q) ||
              (p.visual_annotations || []).some(va => {
                const s = typeof va === 'object' && va !== null ? (va.name || va.tag || '') : String(va || '');
                return s.toLowerCase().includes(q);
              })
            );
          }

          // 3B. Breakout Baby Domains Filter (<2y + 7d Gains >= 15)
          if (this.onlyBreakoutBabyDomains) {
            list = list.filter(p => {
              const ageDays = Number(p.domain_age_days || (p.domain_age_years ? p.domain_age_years * 365 : 0));
              const g7 = Number(p.gains_7d || (p.daily_save_velocity ? p.daily_save_velocity * 7 : 0));
              return ageDays > 0 && ageDays <= 730 && g7 >= 15;
            });
          }

          // 3C. Linkless Vacuums Filter (High Saves >= 100, No Domain / User Upload)
          if (this.onlyVacuumPins) {
            list = list.filter(p => Boolean(p.is_vacuum_pin || ((!p.domain || p.domain === 'Uploaded by user') && Number(p.save_count || 0) >= 100)));
          }

          // 3D. Fresh Rockets Filter (<= 14d age with positive 24h momentum)
          if (this.onlyFreshRockets) {
            list = list.filter(p => p.pin_age_days != null && Number(p.pin_age_days) <= 14 && (Number(p.effective_velocity ?? p.daily_save_velocity ?? 0) > 0 || Number(p.delta_repins_24h || 0) > 0));
          }

          // 3E. 24h Surges Filter (Pins actively gaining saves or repins in last 24h)
          if (this.onlySurging24h) {
            list = list.filter(p => Number(p.effective_velocity ?? p.daily_save_velocity ?? 0) > 0 || Number(p.delta_repins_24h || 0) > 0);
          }

          // 4. Sorting
          if (this.sortBy === 'velocity_desc') {
            list = list.slice().sort((a, b) => ((b.effective_velocity ?? b.daily_save_velocity ?? 0) - (a.effective_velocity ?? a.daily_save_velocity ?? 0)) || (b.overlap_count || 0) - (a.overlap_count || 0) || (b.save_count || 0) - (a.save_count || 0));
          } else if (this.sortBy === 'repins_24h_desc') {
            list = list.slice().sort((a, b) => (Number(b.delta_repins_24h || 0) - Number(a.delta_repins_24h || 0)) || ((b.effective_velocity ?? b.daily_save_velocity ?? 0) - (a.effective_velocity ?? a.daily_save_velocity ?? 0)));
          } else if (this.sortBy === 'saves_desc') {
            list = list.slice().sort((a, b) => (b.save_count || 0) - (a.save_count || 0) || (b.daily_save_velocity || 0) - (a.daily_save_velocity || 0));
          } else if (this.sortBy === 'saves_asc') {
            list = list.slice().sort((a, b) => (a.save_count || 0) - (b.save_count || 0) || (a.daily_save_velocity || 0) - (b.daily_save_velocity || 0));
          } else if (this.sortBy === 'pin_age_asc') {
            list = list.slice().sort((a, b) => (a.pin_age_days != null && isFinite(a.pin_age_days) ? Number(a.pin_age_days) : Infinity) - (b.pin_age_days != null && isFinite(b.pin_age_days) ? Number(b.pin_age_days) : Infinity));
          } else if (this.sortBy === 'pin_age_desc') {
            list = list.slice().sort((a, b) => (b.pin_age_days != null && isFinite(b.pin_age_days) ? Number(b.pin_age_days) : -Infinity) - (a.pin_age_days != null && isFinite(a.pin_age_days) ? Number(a.pin_age_days) : -Infinity));
          } else if (this.sortBy === 'folder_age_desc') {
            list = list.slice().sort((a, b) => (Number(b.folder_age_days) || 0) - (Number(a.folder_age_days) || 0));
          } else if (this.sortBy === 'folder_age_asc') {
            list = list.slice().sort((a, b) => (Number(a.folder_age_days) || 0) - (Number(b.folder_age_days) || 0));
          } else if (this.sortBy === 'rank_asc') {
            list = list.slice().sort((a, b) => (a.min_rank || 999) - (b.min_rank || 999));
          } else if (this.sortBy === 'overlap_desc') {
            list = list.slice().sort((a, b) => (b.overlap_count || 0) - (a.overlap_count || 0) || (b.save_count || 0) - (a.save_count || 0));
          } else if (this.sortBy === 'title_asc') {
            list = list.slice().sort((a, b) => (a.title || '').localeCompare(b.title || ''));
          }

          this._pinsCacheKey = currentKey;
          this._cachedFilteredPins = list;
          return list;
        },

        // Alias for backward compatibility with template checks
        filteredSuperPins() {
          return this.filteredPinsList();
        },

        totalPages() {
          const total = this.filteredPinsList().length;
          const pageSize = Math.max(1, parseInt(this.pageSize, 10) || 10);
          return Math.max(1, Math.ceil(total / pageSize));
        },

        paginatedPins() {
          const list = this.filteredPinsList();
          const pageSize = Math.max(1, parseInt(this.pageSize, 10) || 10);
          const maxPage = Math.max(1, Math.ceil(list.length / pageSize));
          let page = parseInt(this.currentPage, 10);
          if (!page || isNaN(page) || page < 1) page = 1;
          if (page > maxPage) page = maxPage;
          const start = (page - 1) * pageSize;
          return list.slice(start, start + pageSize);
        },

        goToPage(page) {
          const total = this.totalPages();
          const p = parseInt(page, 10);
          if (!p || isNaN(p) || p < 1) {
            this.currentPage = 1;
          } else if (p > total) {
            this.currentPage = total;
          } else {
            this.currentPage = p;
          }
        },

        visiblePages() {
          const total = this.totalPages();
          const current = this.currentPage;
          const pages = [];

          if (total <= 7) {
            for (let i = 1; i <= total; i++) pages.push(i);
          } else {
            pages.push(1);
            if (current > 3) pages.push('...');
            const start = Math.max(2, current - 1);
            const end = Math.min(total - 1, current + 1);
            for (let i = start; i <= end; i++) pages.push(i);
            if (current < total - 2) pages.push('...');
            pages.push(total);
          }
          return pages;
        },

        filteredTagBridges() {
          let list = this.crossoverData?.tag_bridges || [];

          if (this.searchQuery.trim()) {
            const q = this.searchQuery.toLowerCase().trim();
            list = list.filter(tb => 
              (tb.tag || '').toLowerCase().includes(q) ||
              (tb.keywords || []).some(k => k.toLowerCase().includes(q))
            );
          }

          return list;
        },

        calcSov(pinCount) {
          const total = this.crossoverData?.summary?.total_unique_pins || (this.crossoverData?.all_pins?.length || 0);
          if (!total || total <= 0) return 0;
          const count = Number(pinCount) || 0;
          if (count <= 0) return 0;
          const pct = Math.round((count / total) * 100);
          return Math.min(100, Math.max(0, pct));
        },

        async createFolder() {
          if (!this.newFolderName.trim()) return;
          try {
            const res = await (window.safeApiFetch || fetch)('/api/folders', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: this.newFolderName.trim(),
                description: this.newFolderDesc.trim(),
                color: this.newFolderColor,
                icon: '📁'
              })
            });
            if (res.ok) {
              const data = await res.json();
              this.openNewFolderModal = false;
              this.newFolderName = '';
              this.newFolderDesc = '';
              this.showToast('Campaign folder created!', 'success');
              if (data.folder?.id) {
                window.location.href = '/folders/' + data.folder.id;
              } else {
                await this.loadFolders();
              }
            } else {
              const errData = await res.json().catch(() => ({}));
              this.showToast(errData.message || errData.error || 'Failed to create folder', 'error');
            }
          } catch (e) {
            this.showToast('Network error creating folder: ' + e.message, 'error');
          }
        },

        confirmDeleteFolder(id) {
          this.deleteModalFolderId = id;
        },

        async executeDeleteFolder() {
          const id = this.deleteModalFolderId;
          if (!id) return;
          try {
            const res = await (window.safeApiFetch || fetch)('/api/folders/' + id, { method: 'DELETE' });
            if (res.ok) {
              this.foldersList = this.foldersList.filter(f => f.id !== id);
              this.deleteModalFolderId = null;
              this.showToast('Campaign folder deleted', 'success');
              if (String(this.activeFolderId) === String(id)) {
                window.location.href = '/folders';
              }
            } else {
              const errData = await res.json().catch(() => ({}));
              this.showToast(errData.message || errData.error || 'Failed to delete folder', 'error');
            }
          } catch (e) {
            this.showToast('Network error deleting folder: ' + e.message, 'error');
          }
        },

        async resolveShortlinkSearch(url) {
          if (!url) return;
          try {
            const res = await fetch('/api/pins/resolve-shortlink?url=' + encodeURIComponent(url), {
              signal: AbortSignal.timeout(8000)
            });
            if (!res.ok) return;
            const data = await res.json();
            if (data?.ok && data.pin_id) {
              this.searchQuery = String(data.pin_id);
              this.showToast('Resolved pin.it shortlink to Pin #' + data.pin_id, 'success');
            }
          } catch (_) {}
        },

        async openCreatorVisualFeed(username) {
          const cleanUser = String(username || '').replace(/^@+/, '').trim();
          if (!cleanUser) return;
          this.visualFeedUsername = cleanUser;
          this.visualFeedUser = { username: cleanUser };
          this.visualFeedPins = [];
          this.isVisualFeedLoading = true;
          this.isVisualFeedModalOpen = true;
          this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });

          try {
            const res = await (window.safeApiFetch || fetch)('/api/competitors/' + encodeURIComponent(cleanUser) + '/latest-pins');
            if (res.ok) {
              const data = await res.json();
              if (data.ok) {
                this.visualFeedPins = data.pins || [];
                if (data.user) {
                  this.visualFeedUser = data.user;
                }
              } else {
                this.showToast('Failed to fetch visual feed: ' + (data.error || 'Unknown error'), 'error');
              }
            } else {
              this.showToast('Could not load visual feed (<350ms)', 'error');
            }
          } catch (err) {
            this.showToast('Network error loading visual feed: ' + err.message, 'error');
          } finally {
            this.isVisualFeedLoading = false;
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        formatNumber(n) {
          return Number(n || 0).toLocaleString();
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
      if (typeof window !== 'undefined') {
        window.addEventListener('load', initLucide);
      }
    }
  </script>
  ${getEdgeShieldClientScript()}
</body>
</html>`;
}
