/**
 * src/ui/newborn/index.mjs
 *
 * SSR Studio Entrypoint for `/newborn`, `/newborn/settings` & `/folders/:id/newborn`:
 * Radically simplified 3-Second Studio UI:
 * - Light-Mode Bento SaaS shell (`:root` default, `.dark` on `document.documentElement` only)
 * - Clean Header + Focused Hero Hunt Bar + Collapsible Rising Trends Picker
 * - Instant HTTP 202 Live Progress Strip (`GET /api/newborn/runs/:id` every 1.5s)
 * - Clean 3-View Results Workspace (`This Hunt` | `Watchlist` | `Past Hunts`)
 * - Full-Power Slide-Over Settings Drawer (Age presets, Rule Profiles, Cookie Vault, Surfaces & Auto-Track)
 */

import { renderAppSidebar } from '../app-sidebar.mjs';
import { renderCampaignWorkspaceHeader } from '../campaign-workspace-header.mjs';
import { renderSharedDocumentHead } from '../shared-head.mjs';
import { getNewbornHeaderAndLaunchpadHtml } from './newborn-header-and-launchpad.mjs';
import { getNewbornCandidatesAndRookiesHtml } from './newborn-candidates-and-rookies.mjs';
import { getNewbornSettingsAndModalsHtml } from './newborn-settings-and-modals.mjs';
import { getNewbornClientAppScript } from './newborn-client-app.mjs';

const VALID_INITIAL_MODES = new Set([
  'hunt',
  'candidates',
  'watchlist',
  'history',
  'settings',
  'launchpad',
  'rookies',
  'crossover'
]);

export function getNewbornPageHtml(folderId = '', initialRoom = '') {
  const rawFolderId = String(folderId || '').trim();
  const safeFolderId = rawFolderId.replace(/[^a-zA-Z0-9_-]/g, '');
  const rawMode = String(initialRoom || '').trim().toLowerCase();
  const safeInitialMode = VALID_INITIAL_MODES.has(rawMode) ? rawMode : 'hunt';

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
  title: 'Newborn Pin Hunter | Pinterest Arbitrage',
  referrerPolicy: 'same-origin',
  tailwindScriptHtml,
  includeThemeScript: true,
  defaultTheme: 'light'
})}
</head>
<body x-cloak class="bg-[#F8FAFC] dark:bg-[#09090B] text-[#0F172A] dark:text-[#FAFAFA] min-h-screen antialiased flex flex-col font-sans transition-colors duration-150 motion-reduce:transition-none" x-data="newbornStudioApp('${safeFolderId}', '${safeInitialMode}')" @keydown.escape.window="handleEscapeKey()">

  ${renderAppSidebar({
    activeNav: safeFolderId ? 'folders' : 'newborn',
    refreshHandler: 'refreshWorkspace(true)',
    refreshLoadingExpr: 'isLoading || isPollingRun'
  })}

  <!-- Primary Workspace Container -->
  <main class="flex-1 min-h-screen p-4 sm:p-6 lg:p-8 space-y-5 max-w-full overflow-x-hidden transition-all duration-300 ease-in-out motion-reduce:transition-none" :class="isSidebarCollapsed ? '!ml-20' : 'md:ml-64 lg:ml-72'">

    ${safeFolderId ? renderCampaignWorkspaceHeader({ activeRoom: 'newborn', folderId: safeFolderId }) : ''}

${getNewbornHeaderAndLaunchpadHtml()}

${getNewbornCandidatesAndRookiesHtml()}

  </main>

${getNewbornSettingsAndModalsHtml()}

${getNewbornClientAppScript()}
</body>
</html>`;
}
