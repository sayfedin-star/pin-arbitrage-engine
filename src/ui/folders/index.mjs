/**
 * Dedicated Campaign Folders & Crossover Studio UI (src/ui/folders/index.mjs)
 */

import { renderAppSidebar } from '../app-sidebar.mjs';
import { getFoldersStudioViewHtml } from './folders-studio-view.mjs';
import { getFoldersHubViewHtml } from './folders-hub-view.mjs';
import { getFoldersModalsHtml } from './folders-modals.mjs';
import { renderClientJsScriptTag, renderPageBootstrapScript } from '../client-assets.mjs';
import { renderSharedDocumentHead } from '../shared-head.mjs';

export function getCampaignFoldersPageHtml(folderId = '', initialRoom = '') {
  const rawId = String(folderId || '').trim();
  const safeFolderId = rawId.replace(/[^a-zA-Z0-9_-]/g, '');
  const activeRoom = initialRoom === 'settings' ? 'settings' : 'crossover';

  return `<!DOCTYPE html>
<html lang="en">
<head>
${renderSharedDocumentHead({
  title: 'Campaign Folders & Crossover Studio | Pinterest Arbitrage',
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

  <!-- Main View (Offset for Unified Desktop Sidebar) -->
  <main class="flex-1 min-h-screen p-4 sm:p-6 lg:p-8 space-y-6 max-w-full overflow-x-hidden transition-all duration-300 ease-in-out" :class="isSidebarCollapsed ? '!ml-20' : 'md:ml-64 lg:ml-72'">

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

${renderPageBootstrapScript({ folderId: safeFolderId, initialRoom: activeRoom })}
${renderClientJsScriptTag('folders')}
</body>
</html>`;
}
