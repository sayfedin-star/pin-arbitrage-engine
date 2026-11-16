/**
 * src/pulse-ui.mjs
 *
 * Global 24-Hour Algorithmic Pulse & Crossover Studio UI
 * Single Source of Truth (SSOT) for /pulse, /24h, and /folders/:id/pulse.
 *
 * Thin SSR orchestrator shell composing:
 * - Shared document head (renderSharedDocumentHead)
 * - Unified desktop/mobile sidebar (renderAppSidebar)
 * - Campaign workspace header (renderCampaignWorkspaceHeader)
 * - 3-Room Cockpit & Slide-Over Blueprint Drawer views (getPulseStudioViewsHtml)
 * - Alpine.js client controller (getPulseClientAppScript)
 */

import { renderAppSidebar } from './ui/app-sidebar.mjs';
import { renderCampaignWorkspaceHeader } from './ui/campaign-workspace-header.mjs';
import { renderSharedDocumentHead } from './ui/shared-head.mjs';
import { getEdgeShieldClientScript } from './edge-shield-client.mjs';
import { getPulseStudioViewsHtml } from './ui/pulse/pulse-views.mjs';
import { getPulseClientAppScript } from './ui/pulse/pulse-client-app.mjs';

export function getPulsePageHtml(folderId = '') {
  const rawFolderId = String(folderId || '').trim();
  const safeFolderId = rawFolderId.replace(/[^a-zA-Z0-9_-]/g, '');

  const tailwindScriptHtml = `  <script>
    if (typeof tailwind !== 'undefined') {
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
    }
  </script>`;

  const extraHeadHtml = `  <style>
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
        try { savedKey = (typeof localStorage !== 'undefined') ? (localStorage.getItem('pae_admin_api_key') || '') : ''; } catch (_) {}
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
  </script>
  ${getEdgeShieldClientScript()}
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
  </script>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
${renderSharedDocumentHead({
  title: '24-Hour Algorithmic Pulse &amp; Crossover Studio | Pinterest Arbitrage',
  referrerPolicy: 'same-origin',
  tailwindScriptHtml,
  includeThemeScript: true,
  defaultTheme: 'light',
  extraHeadHtml
})}
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
  <main class="flex-1 min-h-screen p-4 sm:p-6 lg:p-8 space-y-6 max-w-full overflow-x-hidden transition-all duration-300 ease-in-out" :class="isSidebarCollapsed ? '!ml-20' : 'md:ml-64 lg:ml-72'">

    ${safeFolderId ? renderCampaignWorkspaceHeader({ activeRoom: 'pulse', folderId: safeFolderId }) : ''}

${getPulseStudioViewsHtml()}

${getPulseClientAppScript()}
</body>
</html>`;
}
