/**
 * Dedicated Domain Intelligence & SERP Monopoly Studio UI (src/ui/domains/index.mjs)
 */

import { renderAppSidebar } from '../app-sidebar.mjs';
import { renderCampaignWorkspaceHeader } from '../campaign-workspace-header.mjs';
import { getDomainsLeaderboardViewHtml } from './domains-leaderboard-view.mjs';
import { getDomainsStudioViewHtml } from './domains-studio-view.mjs';
import { getDomainsModalsHtml } from './domains-modals.mjs';
import { renderClientJsScriptTag, renderPageBootstrapScript } from '../client-assets.mjs';
import { renderSharedDocumentHead } from '../shared-head.mjs';

export function getDomainsPageHtml(initialDomain = '', folderId = '') {
  const rawDomain = String(initialDomain || '').trim();
  const safeInitialDomain = rawDomain.replace(/[^a-zA-Z0-9.-]/g, '').toLowerCase();
  const hasInitialDomain = Boolean(safeInitialDomain);
  const rawFolderId = String(folderId || '').trim();
  const safeFolderId = rawFolderId.replace(/[^a-zA-Z0-9_-]/g, '');

  return `<!DOCTYPE html>
<html lang="en">
<head>
${renderSharedDocumentHead({
  title: 'Domain Intelligence & SERP Monopoly Studio | Pinterest Arbitrage',
  referrerPolicy: 'same-origin',
  tailwindScriptHtml: `  <script>
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
  </script>`
})}
</head>
<body x-cloak class="bg-slate-50 dark:bg-[#09090B] text-slate-900 dark:text-zinc-100 min-h-screen antialiased flex flex-col font-sans transition-colors duration-150" x-data="domainsApp('${safeInitialDomain}'${safeFolderId ? `, '${safeFolderId}'` : ''})" @keydown.escape.window="if (isBlueprintModalOpen) closeBlueprintModal(); else if (isDossierOpen) closeDossier();">

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

  <!-- Main Container (Offset for Unified Desktop Sidebar) -->
  <main class="flex-1 min-h-screen p-4 sm:p-6 lg:p-8 space-y-6 max-w-full overflow-x-hidden transition-all duration-300 ease-in-out" :class="isSidebarCollapsed ? '!ml-20' : 'md:ml-64 lg:ml-72'">

    ${safeFolderId ? renderCampaignWorkspaceHeader({ activeRoom: 'domains', folderId: safeFolderId }) : ''}

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
          <a href="/pulse" class="px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-500/10 hover:bg-rose-500/20 dark:bg-rose-950/30 dark:hover:bg-rose-900/40 text-rose-600 dark:text-rose-400 border border-rose-500/20 transition inline-flex items-center space-x-1.5 shadow-2xs" title="24h Algorithmic Pulse & Crossover Radar">
            <i data-lucide="activity" class="w-3.5 h-3.5 text-rose-500"></i>
            <span>24h Pulse Radar</span>
          </a>
          <button @click="refreshDomains()" :disabled="refreshingRollup || loading" class="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white transition inline-flex items-center space-x-1.5 shadow-xs active:scale-95 disabled:opacity-50">
            <i data-lucide="refresh-cw" class="w-3.5 h-3.5" :class="(refreshingRollup || loading) ? 'animate-spin' : ''"></i>
            <span x-text="refreshingRollup ? 'Refreshing...' : 'Refresh'">Refresh</span>
          </button>
        </div>
      </section>
    </template>

    ${getDomainsLeaderboardViewHtml({ hasInitialDomain })}

    ${getDomainsStudioViewHtml({ hasInitialDomain })}

  </main>

  ${getDomainsModalsHtml()}

${renderPageBootstrapScript({ initialDomain: safeInitialDomain, folderId: safeFolderId })}
${renderClientJsScriptTag('domains')}
</body>
</html>`;
}
