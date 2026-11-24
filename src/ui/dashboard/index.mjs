/**
 * Dashboard & Executive Command Center UI (src/ui/dashboard/index.mjs)
 */

import { getDashboardModalsHtml } from '../dashboard-modals.mjs';
import { renderAppSidebar } from '../app-sidebar.mjs';
import { getDashboardBoardViewHtml } from './dashboard-board-view.mjs';
import { getDashboardOverviewHtml } from './dashboard-overview.mjs';
import { getDashboardRelatedPinsHtml } from './dashboard-related-pins.mjs';
import { getDashboardCreatorsHtml } from './dashboard-creators.mjs';
import { renderClientJsScriptTag, renderPageBootstrapScript } from '../client-assets.mjs';
import { renderSharedDocumentHead, compactHtmlFragment } from '../shared-head.mjs';

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

  ${renderAppSidebar({ activeNav: safeFolderId ? 'folders' : 'overview', isDashboardSpa: true, refreshHandler: 'refreshAll()' })}

  <!-- Main Content Area (Offset for Desktop Sidebar) -->
  <main class="flex-1 min-h-screen p-4 sm:p-6 lg:p-8 space-y-6 max-w-full overflow-x-hidden transition-all duration-300 ease-in-out" :class="isSidebarCollapsed ? 'md:!ml-20' : 'md:ml-64 lg:ml-72'">

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

    ${compactHtmlFragment(getDashboardBoardViewHtml())}

    <div x-show="!activeBoardName" x-cloak class="space-y-6">

      ${safeFolderId ? '' : compactHtmlFragment(getDashboardOverviewHtml())}

      ${safeFolderId ? '' : compactHtmlFragment(getDashboardRelatedPinsHtml())}

      ${compactHtmlFragment(getDashboardCreatorsHtml({ safeFolderId }))}

    </div>

  </main>

  ${compactHtmlFragment(getDashboardModalsHtml({ includeClusterModals: !safeFolderId }))}

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

${renderPageBootstrapScript({ folderId: safeFolderId })}
${renderClientJsScriptTag('dashboard')}
</body>
</html>`;
}
