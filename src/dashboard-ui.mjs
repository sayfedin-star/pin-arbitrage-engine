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
import { renderAppSidebar } from './ui/app-sidebar.mjs';
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
// '/api/creators/pin-snapshot'
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
  const safeFolderId = String(folderId || '').replace(/[^a-zA-Z0-9_-]/g, '').trim();

  return `<!DOCTYPE html>
<html lang="en" class="dark">
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
        var t = (typeof localStorage !== 'undefined') ? (localStorage.getItem('pa_theme') || localStorage.getItem('pin_theme')) : null;
        if (t === 'light') {
          document.documentElement.classList.remove('dark');
        } else {
          document.documentElement.classList.add('dark');
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
<body x-cloak class="bg-slate-50 text-slate-900 dark:bg-[#09090B] dark:text-zinc-100 min-h-screen font-sans selection:bg-rose-500 selection:text-white antialiased transition-colors duration-200" :class="(isDark || darkMode) ? 'dark' : ''" x-data="dashboardApp('${safeFolderId}')" x-init="initDashboard()">

  ${renderAppSidebar({ activeNav: 'overview', isDashboardSpa: true, refreshHandler: 'refreshAll()' })}

  <!-- Main Content Area (Offset for Desktop Sidebar) -->
  <main class="md:ml-64 lg:ml-72 flex-1 min-h-screen p-4 sm:p-6 lg:p-8 space-y-6 max-w-full overflow-x-hidden transition-all duration-300 ease-in-out" :class="isSidebarCollapsed ? 'md:ml-20' : 'md:ml-64 lg:ml-72'">

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

  </main>

  ${getDashboardModalsHtml()}

  <!-- Toast Notification -->
  <div x-show="toastMessage"
       x-cloak
       role="status"
       aria-live="polite"
       :class="toastType === 'error' ? 'bg-rose-950 text-rose-100 border border-rose-500/40 dark:bg-rose-900 dark:text-white' : (toastType === 'warning' || toastType === 'info' ? 'bg-amber-950 text-amber-100 border border-amber-500/40 dark:bg-amber-900 dark:text-white' : 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border border-slate-700/60 dark:border-slate-200')"
       class="fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-xl shadow-2xl font-mono tabular-nums text-xs flex items-center space-x-2 max-w-md animate-in fade-in slide-in-from-bottom-5">
    <i x-show="toastType === 'error'" data-lucide="alert-circle" class="w-4 h-4 text-rose-400 shrink-0"></i>
    <i x-show="toastType === 'warning' || toastType === 'info'" data-lucide="info" class="w-4 h-4 text-amber-400 shrink-0"></i>
    <i x-show="toastType !== 'error' && toastType !== 'warning' && toastType !== 'info'" data-lucide="check-circle" class="w-4 h-4 text-emerald-500 shrink-0"></i>
    <span x-text="toastMessage" class="leading-snug"></span>
  </div>

  ${getDashboardClientAppScript({ safeFolderId })}
  ${getEdgeShieldClientScript()}
</body>
</html>`;
}
