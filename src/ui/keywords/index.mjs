/**
 * Keyword Intelligence & Velocity Dashboard UI (src/ui/keywords/index.mjs)
 */

import { getKeywordDrawersAndModalsHtml } from '../keywords-drawers.mjs';
import { renderAppSidebar } from '../app-sidebar.mjs';
import { renderCampaignWorkspaceHeader } from '../campaign-workspace-header.mjs';
import { getKeywordsDashboardViewHtml } from './keywords-dashboard-view.mjs';
import { getKeywordsSerpStudioViewHtml } from './keywords-serp-studio.mjs';
import { getKeywordsModalsHtml } from './keywords-modals.mjs';
import { renderClientJsScriptTag, serializeSafeJsonForInlineScript } from '../client-assets.mjs';
import { renderSharedDocumentHead } from '../shared-head.mjs';

export function getKeywordsPageHtml(initialSlug = '', _initialKeyword = '', folderId = '') {
  const safeFolderId = String(folderId || '').trim();

  return `<!DOCTYPE html>
<html lang="en">
<head>
${renderSharedDocumentHead({
  title: 'Keyword Intelligence & Velocity | Pinterest SERP Radar Studio',
  referrerPolicy: 'same-origin',
  includeThemeScript: true,
  defaultTheme: 'light',
  extraStyleCss: '.table-sticky-header th { position: sticky; top: 0; z-index: 20; }',
  tailwindScriptHtml: `  <script>
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
  </script>`,
  extraHeadHtml: `  <script>
    window.__INITIAL_KEYWORD_SLUG__ = ${serializeSafeJsonForInlineScript(String(initialSlug || ''))};
    window.__INITIAL_FOLDER_ID__ = ${serializeSafeJsonForInlineScript(safeFolderId)};
    window.__PAE_PAGE_DATA__ = ${serializeSafeJsonForInlineScript({ initialSlug: String(initialSlug || ''), folderId: safeFolderId })};
  </script>`
})}
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

  <!-- Main Full-Width Executive Container (Offset for Unified Desktop Sidebar) -->
  <main class="flex-1 min-h-screen p-4 sm:p-6 lg:p-8 space-y-6 max-w-full overflow-x-hidden transition-all duration-300 ease-in-out" :class="isSidebarCollapsed ? '!ml-20' : 'md:ml-64 lg:ml-72'">

    ${safeFolderId ? renderCampaignWorkspaceHeader({ activeRoom: 'keywords', folderId: safeFolderId }) : ''}

    ${getKeywordsDashboardViewHtml()}

    ${getKeywordsSerpStudioViewHtml()}

  </main>

  ${getKeywordsModalsHtml()}

  ${getKeywordDrawersAndModalsHtml()}

${renderClientJsScriptTag('keywords')}
</body>
</html>`;
}
