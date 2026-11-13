/**
 * Dedicated Campaign Folders & Crossover Studio UI (Level 4)
 * Orchestrator module coordinating submodules under src/ui/folders/:
 * - folders-studio-view.mjs: VIEW A Studio View (Lock 1 Sibling DOM)
 * - folders-hub-view.mjs: VIEW B Hub View
 * - folders-modals.mjs: New Folder, Edit, Delete, Visual Feed Modals
 * - folders-client-app.mjs: Alpine.js foldersApp() client script
 */

import { getEdgeShieldClientScript } from './edge-shield-client.mjs';
import { renderAppSidebar } from './ui/app-sidebar.mjs';
import { getFoldersStudioViewHtml } from './ui/folders/folders-studio-view.mjs';
import { getFoldersHubViewHtml } from './ui/folders/folders-hub-view.mjs';
import { getFoldersModalsHtml } from './ui/folders/folders-modals.mjs';
import { getFoldersClientAppScript } from './ui/folders/folders-client-app.mjs';

export function getCampaignFoldersPageHtml(folderId = '', initialRoom = '') {
  // Sanitize folderId against script/attribute injection
  const rawId = String(folderId || '').trim();
  const safeFolderId = rawId.replace(/[^a-zA-Z0-9_-]/g, '');
  const activeRoom = initialRoom === 'settings' ? 'settings' : 'crossover';

  return `<html lang="en">
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


    ${getFoldersStudioViewHtml({ activeRoom, safeFolderId })}

    ${getFoldersHubViewHtml()}

  </main>

  ${getFoldersModalsHtml()}

  ${getFoldersClientAppScript()}
  ${getEdgeShieldClientScript()}
</body>
</html>`;
}
