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
import { renderSharedDocumentHead } from './ui/shared-head.mjs';

export function getDashboardHtml(folderId = '') {
  const safeFolderId = String(folderId || '').replace(/[^a-zA-Z0-9_-]/g, '').trim();

  return `<!DOCTYPE html>
<html lang="en">
<head>
${renderSharedDocumentHead({
  title: 'Pin Cluster Analyzer & Predictive Engine | V3',
  tailwindScriptHtml: `  <script>
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
  </script>`
})}
</head>
<body x-cloak class="bg-[#F8FAFC] text-[#0F172A] dark:bg-[#09090B] dark:text-zinc-100 min-h-screen font-sans selection:bg-rose-500 selection:text-white antialiased transition-colors duration-200" x-data="dashboardApp('${safeFolderId}')" x-init="initDashboard()">

  ${renderAppSidebar({ activeNav: 'overview', isDashboardSpa: true, refreshHandler: 'refreshAll()' })}

  <!-- Main Content Area (Offset for Desktop Sidebar) -->
  <main class="flex-1 min-h-screen p-4 sm:p-6 lg:p-8 space-y-6 max-w-full overflow-x-hidden transition-all duration-300 ease-in-out" :class="isSidebarCollapsed ? '!ml-20' : 'md:ml-64 lg:ml-72'">

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
    <span x-show="toastType === 'error'" class="inline-flex items-center justify-center shrink-0"><i data-lucide="alert-circle" class="w-4 h-4 text-rose-400"></i></span>
    <span x-show="toastType === 'warning' || toastType === 'info'" class="inline-flex items-center justify-center shrink-0"><i data-lucide="info" class="w-4 h-4 text-amber-400"></i></span>
    <span x-show="toastType !== 'error' && toastType !== 'warning' && toastType !== 'info'" class="inline-flex items-center justify-center shrink-0"><i data-lucide="check-circle" class="w-4 h-4 text-emerald-500"></i></span>
    <span x-text="toastMessage" class="leading-snug"></span>
  </div>

  ${getDashboardClientAppScript({ safeFolderId })}
  ${getEdgeShieldClientScript()}
</body>
</html>`;
}
