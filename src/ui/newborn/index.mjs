/**
 * src/ui/newborn/index.mjs
 *
 * SSR Studio Entrypoint for `/newborn` & Folder-Scoped `/folders/:id/newborn`:
 * - Unified Light-Mode Bento SaaS shell (`:root` default, `.dark` on `document.documentElement` only)
 * - Trends & Zero-Query Launchpad + Multi-Surface Hunt Bar
 * - Golden Newborn Candidates Grid (Pinner vs Origin Creator, Provenance, Linkless Goldmine, Snowball, Multi-Pillar Promote)
 * - Rookie / Rising Accounts Radar (`Total audience`, `Impressions`, `10M+` ceiling, Leverage Ratio)
 * - Semantic Crossover & Board Blueprints
 * - Watchlist, `01:00 UTC` Daily Anchors & Execution Run Diagnostics
 * - Full-Power Settings, Named Rule Profiles & Redacted Zone-A Cookie Control Center
 */

import { renderAppSidebar } from '../app-sidebar.mjs';
import { renderCampaignWorkspaceHeader } from '../campaign-workspace-header.mjs';
import { renderSharedDocumentHead } from '../shared-head.mjs';
import { getNewbornHeaderAndLaunchpadHtml } from './newborn-header-and-launchpad.mjs';
import { getNewbornCandidatesAndRookiesHtml } from './newborn-candidates-and-rookies.mjs';
import { getNewbornSettingsAndModalsHtml } from './newborn-settings-and-modals.mjs';
import { getNewbornClientAppScript } from './newborn-client-app.mjs';

const VALID_INITIAL_ROOMS = new Set([
  'launchpad',
  'candidates',
  'rookies',
  'crossover',
  'watchlist',
  'settings'
]);

export function getNewbornPageHtml(folderId = '', initialRoom = '') {
  const rawFolderId = String(folderId || '').trim();
  const safeFolderId = rawFolderId.replace(/[^a-zA-Z0-9_-]/g, '');
  const rawRoom = String(initialRoom || '').trim().toLowerCase();
  const safeInitialRoom = VALID_INITIAL_ROOMS.has(rawRoom) ? rawRoom : 'candidates';

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
  title: 'Newborn Breakout Hunter &amp; Automation Studio | Pinterest Arbitrage',
  referrerPolicy: 'same-origin',
  tailwindScriptHtml,
  includeThemeScript: true,
  defaultTheme: 'light'
})}
</head>
<body x-cloak class="bg-[#F8FAFC] dark:bg-[#09090B] text-[#0F172A] dark:text-[#FAFAFA] min-h-screen antialiased flex flex-col font-sans transition-colors duration-150" x-data="newbornStudioApp('${safeFolderId}', '${safeInitialRoom}')" @keydown.escape.window="handleEscapeKey()">

  ${renderAppSidebar({
    activeNav: safeFolderId ? 'folders' : 'newborn',
    refreshHandler: 'refreshActiveRoom(true)',
    refreshLoadingExpr: 'isLoading || isHunting'
  })}

  <!-- Primary Workspace Container -->
  <main class="flex-1 min-h-screen p-4 sm:p-6 lg:p-8 space-y-6 max-w-full overflow-x-hidden transition-all duration-300 ease-in-out" :class="isSidebarCollapsed ? '!ml-20' : 'md:ml-64 lg:ml-72'">

    ${safeFolderId ? renderCampaignWorkspaceHeader({ activeRoom: 'newborn', folderId: safeFolderId }) : ''}

${getNewbornHeaderAndLaunchpadHtml()}

${getNewbornCandidatesAndRookiesHtml()}

${getNewbornSettingsAndModalsHtml({ includeModals: false })}

  </main>

${getNewbornSettingsAndModalsHtml({ includeSettingsRoom: false, includeModals: true })}

${getNewbornClientAppScript()}
</body>
</html>`;
}
