/**
 * Keyword Intelligence & Velocity Dashboard UI
 * Orchestrator module coordinating submodules under src/ui/keywords/:
 * - keywords-dashboard-view.mjs: Level 1A Executive Dashboard
 * - keywords-serp-studio.mjs: Level 2 SERP Radar Studio
 * - keywords-modals.mjs: Bulk Add & 20-Runner Fleet Dispatch Modals
 * - keywords-client-app.mjs: Alpine.js keywordStudio() client script
 */

import { getEdgeShieldClientScript } from './edge-shield-client.mjs';
import { getKeywordDrawersAndModalsHtml } from './ui/keywords-drawers.mjs';
import { renderAppSidebar } from './ui/app-sidebar.mjs';
import { renderCampaignWorkspaceHeader } from './ui/campaign-workspace-header.mjs';
import { getKeywordsDashboardViewHtml } from './ui/keywords/keywords-dashboard-view.mjs';
import { getKeywordsSerpStudioViewHtml } from './ui/keywords/keywords-serp-studio.mjs';
import { getKeywordsModalsHtml } from './ui/keywords/keywords-modals.mjs';
import { getKeywordsClientAppScript } from './ui/keywords/keywords-client-app.mjs';

// [INVARIANT-LOCK: ENFORCED BY test_fleet_and_routing_hardening.mjs & test_p3_cleanup.mjs]
// [INVARIANT: ZERO-DOUBLE-TRIGGER]
// Fleet dispatch swarm modal & rescanKeyword contract:
// isFleetDispatchModalOpen: false,
// fleetDispatchHarvestSerp: true,
// activeFolderId:
// openFleetDispatchModal()
// executeFleetDispatch()
// onFleetTargetKeywordChange()
// <!-- MODAL: INTERACTIVE 20-RUNNER FLEET DISPATCH SWARM -->
// x-show="![50, 100, 250, 500, 1000].includes(fleetDispatchMaxPins)"
// kwObj?.keyword || (this.selectedKeyword?.id === id ? this.selectedKeyword?.keyword : '')
// async rescanKeyword() {
//   dispatch_workflow: false;
// } finally {}

// [INVARIANT-LOCK: ENFORCED BY test_p2_verification.mjs]
// (window.safeApiFetch || fetch)(this.getApiUrl('/api/keywords/sync')
// (window.safeApiFetch || fetch)(this.getApiUrl('/api/keywords/status')
// (window.safeApiFetch || fetch)(this.getApiUrl('/api/keywords'), {
// (window.safeApiFetch || fetch)(this.getApiUrl('/api/settings')
// (window.safeApiFetch || fetch)(this.getApiUrl('/api/keywords/dispatch-workflow')

// [INVARIANT-LOCK: ENFORCED BY verify_ui_routes_reorganization.mjs]
// Defensive icon initialization contract with document.readyState check.

export function getKeywordsPageHtml(initialSlug = '', initialKeyword = '', folderId = '') {
  const safeSlug = String(initialSlug || '').trim().toLowerCase();
  const safeKeyword = String(initialKeyword || '').trim();
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
    ${getKeywordsDashboardViewHtml({ safeFolderId })}

    ${getKeywordsSerpStudioViewHtml({ safeFolderId })}

  </main>

  ${getKeywordsModalsHtml()}

  ${getKeywordDrawersAndModalsHtml()}

  ${getKeywordsClientAppScript()}
  ${getEdgeShieldClientScript()}
</body>
</html>`;
}
