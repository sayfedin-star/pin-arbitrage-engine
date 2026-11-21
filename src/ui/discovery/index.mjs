/**
 * Keyword Discovery & Autocomplete Hub UI (src/ui/discovery/index.mjs)
 */

import { renderAppSidebar } from '../app-sidebar.mjs';
import { renderSharedDocumentHead } from '../shared-head.mjs';
import { getDiscoveryStudioViewHtml } from './discovery-studio-view.mjs';
import { renderClientJsScriptTag } from '../client-assets.mjs';

export function getDiscoveryPageHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
${renderSharedDocumentHead({
  title: 'Keyword Discovery & Autocomplete Hub | Pinterest Typeahead Radar',
  referrerPolicy: 'no-referrer',
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
  </script>`
})}
</head>
<body x-cloak class="bg-slate-50 dark:bg-[#09090B] text-slate-900 dark:text-zinc-100 min-h-screen antialiased flex flex-col font-sans transition-colors duration-150" x-data="discoveryApp()">

  <!-- Toast Notification Container -->
  <div
    x-show="toast.show"
    x-transition:enter="transition ease-out duration-200"
    x-transition:enter-start="opacity-0 translate-y-2 scale-95"
    x-transition:enter-end="opacity-100 translate-y-0 scale-100"
    x-transition:leave="transition ease-in duration-150"
    x-transition:leave-start="opacity-100 translate-y-0 scale-100"
    x-transition:leave-end="opacity-0 translate-y-2 scale-95"
    class="fixed top-5 right-5 z-50 max-w-sm px-4 py-3 rounded-xl shadow-2xl border flex items-center gap-3 text-xs font-medium"
    :class="toast.type === 'error' ? 'bg-red-950/90 text-red-200 border-red-800/80' : 'bg-emerald-950/90 text-emerald-200 border-emerald-800/80'"
    x-cloak
  >
    <span x-show="toast.type === 'error'" class="inline-flex items-center justify-center shrink-0"><i data-lucide="alert-triangle" class="w-4 h-4"></i></span>
    <span x-show="toast.type !== 'error'" class="inline-flex items-center justify-center shrink-0"><i data-lucide="check-circle-2" class="w-4 h-4"></i></span>
    <span x-text="toast.message" class="flex-1 font-sans"></span>
    <button @click="toast.show = false" class="text-slate-400 hover:text-white ml-2">✕</button>
  </div>

  ${renderAppSidebar({ activeNav: 'keywords', refreshHandler: 'window.location.reload()' })}

${getDiscoveryStudioViewHtml()}

${renderClientJsScriptTag('discovery')}
</body>
</html>`;
}
