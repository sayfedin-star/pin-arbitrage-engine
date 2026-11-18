/**
 * Global 24-Hour Algorithmic Pulse & Crossover Studio UI (src/ui/pulse/index.mjs)
 */

import { renderAppSidebar } from '../app-sidebar.mjs';
import { renderCampaignWorkspaceHeader } from '../campaign-workspace-header.mjs';
import { renderSharedDocumentHead } from '../shared-head.mjs';
import { getPulseStudioViewsHtml } from './pulse-views.mjs';
import { getPulseClientAppScript } from './pulse-client-app.mjs';

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

  return `<!DOCTYPE html>
<html lang="en">
<head>
${renderSharedDocumentHead({
  title: '24-Hour Algorithmic Pulse &amp; Crossover Studio | Pinterest Arbitrage',
  referrerPolicy: 'same-origin',
  tailwindScriptHtml,
  includeThemeScript: true,
  defaultTheme: 'light'
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

  <!-- Main Container (Offset for Unified Desktop Sidebar) -->
  <main class="flex-1 min-h-screen p-4 sm:p-6 lg:p-8 space-y-6 max-w-full overflow-x-hidden transition-all duration-300 ease-in-out" :class="isSidebarCollapsed ? '!ml-20' : 'md:ml-64 lg:ml-72'">

    ${safeFolderId ? renderCampaignWorkspaceHeader({ activeRoom: 'pulse', folderId: safeFolderId }) : ''}

${getPulseStudioViewsHtml()}

${getPulseClientAppScript()}
</body>
</html>`;
}
