/**
 * src/ui/app-sidebar.mjs
 *
 * Canonical Unified App Sidebar, Shell Navigation & Topbar Component (V4)
 * Single Source of Truth (SSOT) for PAE desktop navigation, top sticky command bar,
 * and mobile navigation drawer.
 *
 * Enforces:
 * - [INVARIANT: UNIFIED-SIDEBAR-LAYOUT] (5 canonical items: Radar, Discover, Campaigns, Watchlist, Settings)
 * - [INVARIANT: LIGHT-MODE-BENTO] (#F8FAFC canvas, #FFFFFF bento cards, 1px border #E2E8F0, #0F172A primary ink, #64748B muted text, #E11D48 accent)
 * - [INVARIANT: GLOBAL-SEARCH-PALETTE] (⌘K / ⌘F global search & command modal)
 * - [INVARIANT: HEADLESS-NODE-SHIELD] (typeof window, localStorage, document guards)
 */

import { renderClientJsScriptTag } from './client-assets.mjs';

function renderAppTopbar({
  activeNav: _activeNav = 'radar',
  refreshHandler = 'window.location.reload()',
  isDashboardSpa = false,
  refreshLoadingExpr = '',
  customHeaderLeftHtml = '',
  customHeaderRightHtml = ''
} = {}) {
  const darkExpr = `(typeof isDark !== 'undefined' ? isDark : (typeof darkMode !== 'undefined' ? darkMode : false))`;
  const effectiveLoadingExpr = refreshLoadingExpr || (isDashboardSpa ? 'isLoading' : '');
  const loadingSpinAttr = effectiveLoadingExpr ? ` :class="{'animate-spin': ${effectiveLoadingExpr}}"` : '';
  const disabledRefreshAttr = effectiveLoadingExpr ? ` :disabled="${effectiveLoadingExpr}"` : '';
  const hasCustomHeader = Boolean(customHeaderLeftHtml || customHeaderRightHtml);

  if (hasCustomHeader) {
    return `
  <!-- Unified Single Sticky Command Bar (Responsive Mobile + Desktop Shell) -->
  <header
    class="flex sticky top-0 z-30 transition-all duration-300 ease-in-out border-b border-slate-200/90 dark:border-[#27272A] bg-white/95 dark:bg-[#121215]/95 backdrop-blur-xl px-4 lg:px-6 py-2.5 items-center justify-between gap-3 shadow-xs md:ml-64 lg:ml-72"
    :class="isSidebarCollapsed ? 'md:!ml-20' : 'md:ml-64 lg:ml-72'">

    <!-- Left: Mobile Menu / Sidebar Toggle & Contextual Slot -->
    <div class="flex items-center gap-2.5 min-w-0">
      <button
        type="button"
        @click="isMobileMenuOpen = !isMobileMenuOpen"
        aria-label="Toggle Navigation Menu"
        class="md:hidden p-2 rounded-xl border border-slate-200 dark:border-[#27272A] text-slate-600 dark:text-[#A1A1AA] hover:bg-slate-100 dark:hover:bg-[#18181B] transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 shrink-0 cursor-pointer"
        title="Toggle Navigation Menu">
        <i data-lucide="menu" class="w-4 h-4"></i>
      </button>

      <button
        type="button"
        @click="toggleSidebar()"
        class="hidden md:inline-flex p-2 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50/80 hover:bg-slate-100 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-slate-500 hover:text-slate-900 dark:text-[#A1A1AA] dark:hover:text-[#FAFAFA] transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 shrink-0 cursor-pointer"
        :title="isSidebarCollapsed ? 'Expand Sidebar (Ctrl+B)' : 'Collapse Sidebar (Ctrl+B)'"
        aria-label="Toggle Sidebar">
        <span x-show="!isSidebarCollapsed" class="inline-flex items-center justify-center"><i data-lucide="chevrons-left" class="w-4 h-4"></i></span>
        <span x-show="isSidebarCollapsed" x-cloak class="inline-flex items-center justify-center"><i data-lucide="chevrons-right" class="w-4 h-4"></i></span>
      </button>

      ${customHeaderLeftHtml}
    </div>

    <!-- Right: Contextual Actions & Global Shell Controls -->
    <div class="flex items-center gap-2 shrink-0">
      ${customHeaderRightHtml}

      <button
        type="button"
        @click="window.dispatchEvent(new CustomEvent('pae:open-command-palette'))"
        aria-label="Search or Jump (⌘K)"
        class="p-2 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50/80 hover:bg-slate-100 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-slate-600 hover:text-slate-900 dark:text-[#A1A1AA] dark:hover:text-[#FAFAFA] transition active:scale-95 shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 cursor-pointer"
        title="Search or Jump to Studio (⌘K)">
        <i data-lucide="search" class="w-4 h-4"></i>
      </button>

      <button
        type="button"
        @click="toggleTheme()"
        class="p-2 rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] text-slate-600 hover:text-slate-900 dark:text-[#A1A1AA] dark:hover:text-[#FAFAFA] hover:bg-slate-100 dark:hover:bg-[#27272A] transition active:scale-95 shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 cursor-pointer"
        :title="${darkExpr} ? 'Switch to Light Mode' : 'Switch to Dark Mode'"
        aria-label="Toggle color theme">
        <span x-show="!${darkExpr}" class="inline-flex items-center justify-center"><i data-lucide="moon" class="w-4 h-4"></i></span>
        <span x-show="${darkExpr}" class="inline-flex items-center justify-center"><i data-lucide="sun" class="w-4 h-4"></i></span>
      </button>

      <button
        type="button"
        @click="${refreshHandler}"${disabledRefreshAttr}
        class="p-2 rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] hover:bg-slate-100 dark:hover:bg-[#27272A] text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-[#FAFAFA] transition active:scale-95 shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 cursor-pointer"
        title="Refresh View Data"
        aria-label="Refresh View Data">
        <i data-lucide="rotate-cw"${loadingSpinAttr} class="w-4 h-4"></i>
      </button>
    </div>
  </header>
  `;
  }

  return `
  <!-- Desktop Sticky Topbar (Light-Mode Bento Shell) [INVARIANT: UNIFIED-SIDEBAR-LAYOUT] -->
  <header
    class="hidden md:flex sticky top-0 z-30 transition-all duration-300 ease-in-out border-b border-slate-200/90 dark:border-[#27272A] bg-white/95 dark:bg-[#121215]/95 backdrop-blur-xl px-4 lg:px-6 py-2.5 items-center justify-between gap-4 shadow-xs md:ml-64 lg:ml-72"
    :class="isSidebarCollapsed ? '!ml-20' : 'md:ml-64 lg:ml-72'">

    <!-- Left: Sidebar Toggle & ⌘K/⌘F Global Command Trigger -->
    <div class="flex items-center gap-3 min-w-0">
      <button
        type="button"
        @click="toggleSidebar()"
        class="p-2 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50/80 hover:bg-slate-100 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-slate-500 hover:text-slate-900 dark:text-[#A1A1AA] dark:hover:text-[#FAFAFA] transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 shrink-0 cursor-pointer"
        :title="isSidebarCollapsed ? 'Expand Sidebar (Ctrl+B)' : 'Collapse Sidebar (Ctrl+B)'"
        aria-label="Toggle Sidebar">
        <span x-show="!isSidebarCollapsed" class="inline-flex items-center justify-center"><i data-lucide="chevrons-left" class="w-4 h-4"></i></span>
        <span x-show="isSidebarCollapsed" x-cloak class="inline-flex items-center justify-center"><i data-lucide="chevrons-right" class="w-4 h-4"></i></span>
      </button>

      <!-- ⌘K / ⌘F Global Search Command Bar Trigger -->
      <button
        type="button"
        @click="window.dispatchEvent(new CustomEvent('pae:open-command-palette'))"
        class="flex items-center justify-between gap-3 px-3.5 py-1.5 text-xs text-slate-500 dark:text-[#A1A1AA] bg-slate-100/70 hover:bg-slate-100 dark:bg-[#18181B] dark:hover:bg-[#27272A] border border-slate-200/80 dark:border-[#27272A] rounded-xl transition-all w-56 md:w-64 lg:w-80 group shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 text-left cursor-pointer"
        title="Search or Jump to Studio (⌘K or ⌘F)">
        <div class="flex items-center gap-2 truncate">
          <i data-lucide="search" class="w-3.5 h-3.5 text-slate-400 dark:text-[#71717A] group-hover:text-rose-600 dark:group-hover:text-rose-400 transition-colors shrink-0"></i>
          <span class="truncate text-slate-500 dark:text-[#71717A]">Quick search pins, creators...</span>
        </div>
        <div class="flex items-center gap-1 font-mono text-[10px] shrink-0">
          <kbd class="px-1.5 py-0.5 rounded bg-white dark:bg-[#121215] text-slate-500 dark:text-[#A1A1AA] border border-slate-200 dark:border-[#27272A] shadow-2xs font-semibold">⌘K</kbd>
        </div>
      </button>
    </div>

    <!-- Right: Global Shell Controls (Theme Switcher & Refresh) -->
    <div class="flex items-center gap-2 shrink-0">
      <button
        type="button"
        @click="toggleTheme()"
        class="p-2 rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] text-slate-600 hover:text-slate-900 dark:text-[#A1A1AA] dark:hover:text-[#FAFAFA] hover:bg-slate-100 dark:hover:bg-[#27272A] transition active:scale-95 shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 cursor-pointer"
        :title="${darkExpr} ? 'Switch to Light Mode' : 'Switch to Dark Mode'"
        aria-label="Toggle color theme">
        <span x-show="!${darkExpr}" class="inline-flex items-center justify-center"><i data-lucide="moon" class="w-4 h-4"></i></span>
        <span x-show="${darkExpr}" class="inline-flex items-center justify-center"><i data-lucide="sun" class="w-4 h-4"></i></span>
      </button>

      <button
        type="button"
        @click="${refreshHandler}"${disabledRefreshAttr}
        class="p-2 rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] hover:bg-slate-100 dark:hover:bg-[#27272A] text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-[#FAFAFA] transition active:scale-95 shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 cursor-pointer"
        title="Refresh View Data"
        aria-label="Refresh View Data">
        <i data-lucide="rotate-cw"${loadingSpinAttr} class="w-4 h-4"></i>
      </button>
    </div>
  </header>
  `;
}

export function renderAppSidebar({
  activeNav = 'radar', // 'radar' | 'discover' | 'campaigns' | 'watchlist' | 'settings' (+ legacy aliases)
  refreshHandler = 'window.location.reload()',
  isDashboardSpa = false,
  showTopbar = true,
  refreshLoadingExpr = '',
  customHeaderLeftHtml = '',
  customHeaderRightHtml = ''
} = {}) {
  const hasCustomHeader = Boolean(customHeaderLeftHtml || customHeaderRightHtml);
  const norm = String(activeNav || 'radar').toLowerCase();

  const isRadar = norm === 'radar' || norm === 'overview' || norm === 'pulse' || norm === '24h' ||
    norm === 'creators' || norm === 'domains' || norm === 'keywords' || norm === 'related_pins';
  const isDiscover = norm === 'discover' || norm === 'newborn' || norm === 'discovery';
  const isCampaigns = norm === 'campaigns' || norm === 'folders';
  const isWatchlist = norm === 'watchlist';
  const isSettings = norm === 'settings';

  const inactiveClass = 'text-slate-600 dark:text-[#A1A1AA] hover:bg-slate-100/80 dark:hover:bg-[#18181B] hover:text-slate-900 dark:hover:text-[#FAFAFA] border border-transparent font-medium';
  const activeClass = 'bg-rose-50 text-rose-600 font-semibold border border-rose-200/80 shadow-xs dark:bg-rose-950/25 dark:text-rose-400 dark:border-rose-500/30';

  const iconActive = 'text-rose-600 dark:text-rose-400 shrink-0';
  const iconInactive = 'text-slate-400 dark:text-[#71717A] shrink-0';

  const darkExpr = `(typeof isDark !== 'undefined' ? isDark : (typeof darkMode !== 'undefined' ? darkMode : false))`;
  const loadingSpinAttr = isDashboardSpa ? ` :class="{'animate-spin': isLoading}"` : '';
  const disabledRefreshAttr = isDashboardSpa ? ` :disabled="isLoading"` : '';

  const NAV_ITEMS = [
    { key: 'radar', href: '/radar', label: 'Radar', icon: 'radar', active: isRadar },
    { key: 'discover', href: '/discover', label: 'Discover', icon: 'sparkles', active: isDiscover },
    { key: 'campaigns', href: '/campaigns', label: 'Campaigns', icon: 'folder-kanban', active: isCampaigns },
    { key: 'watchlist', href: '/watchlist', label: 'Watchlist', icon: 'bookmark', active: isWatchlist },
    { key: 'settings', href: '/settings', label: 'Settings', icon: 'settings', active: isSettings }
  ];

  const renderDesktopNavItems = () => NAV_ITEMS.map((item) => `
          <a
            href="${item.href}"
            data-nav-key="${item.key}"
            class="relative flex items-center w-full justify-between px-3 py-2.5 rounded-xl text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 ${item.active ? activeClass : inactiveClass}"
            :class="isSidebarCollapsed ? '!w-10 !h-10 !justify-center !p-0' : 'w-full justify-between px-3 py-2.5'"
            title="${item.label}">
            <div class="flex items-center space-x-2.5" :class="isSidebarCollapsed ? '!space-x-0 justify-center' : 'space-x-2.5'">
              <i data-lucide="${item.icon}" class="w-4 h-4 shrink-0 ${item.active ? iconActive : iconInactive}"></i>
              <span x-show="!isSidebarCollapsed" class="truncate">${item.label}</span>
            </div>
            ${item.active ? '<span x-show="isSidebarCollapsed" x-cloak class="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 shadow-xs"></span>' : ''}
          </a>`).join('\n');

  const renderMobileNavItems = () => NAV_ITEMS.map((item) => `
          <a
            href="${item.href}"
            data-nav-key="${item.key}"
            @click="isMobileMenuOpen = false"
            class="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 ${item.active ? activeClass : inactiveClass}">
            <div class="flex items-center space-x-2.5">
              <i data-lucide="${item.icon}" class="w-4 h-4 shrink-0 ${item.active ? iconActive : iconInactive}"></i>
              <span>${item.label}</span>
            </div>
          </a>`).join('\n');

  const renderFooterShortcut = (isMobile) => `
        <button
          type="button"
          @click="window.dispatchEvent(new CustomEvent('pae:open-command-palette'))${isMobile ? '; isMobileMenuOpen = false' : ''}"
          class="flex items-center rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] hover:bg-slate-100 dark:hover:bg-[#27272A] text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-[#FAFAFA] transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 cursor-pointer w-full justify-between px-3 py-2 text-xs font-medium"${isMobile ? '' : ' :class="isSidebarCollapsed ? \'!w-10 !h-10 !p-0 !justify-center mx-auto\' : \'w-full justify-between px-3 py-2\'"'}
          title="Quick Jump &amp; Search (⌘K)">
          <span class="flex items-center truncate space-x-2"${isMobile ? '' : ' :class="isSidebarCollapsed ? \'!space-x-0 justify-center\' : \'space-x-2\'"'}>
            <i data-lucide="command" class="w-3.5 h-3.5 shrink-0 text-slate-400 dark:text-[#71717A]"></i>
            <span ${isMobile ? '' : 'x-show="!isSidebarCollapsed" '}class="truncate text-[11px]">Quick Search</span>
          </span>
          <kbd ${isMobile ? '' : 'x-show="!isSidebarCollapsed" '}class="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#121215] text-[10px] font-mono text-slate-500 dark:text-[#A1A1AA] border border-slate-200 dark:border-[#27272A]">⌘K</kbd>
        </button>`;

  return `
  ${hasCustomHeader ? '' : `<!-- Mobile Top Header (Visible on screens < md) [INVARIANT: UNIFIED-SIDEBAR-LAYOUT] -->
  <header class="md:hidden border-b border-slate-200/90 dark:border-[#27272A] bg-white/95 dark:bg-[#121215]/95 backdrop-blur-xl sticky top-0 z-40 px-4 py-2.5 flex items-center justify-between shadow-xs">
    <div class="flex items-center space-x-2.5">
      <button
        type="button"
        @click="isMobileMenuOpen = !isMobileMenuOpen"
        aria-label="Toggle Navigation Menu"
        class="p-2 rounded-xl border border-slate-200 dark:border-[#27272A] text-slate-600 dark:text-[#A1A1AA] hover:bg-slate-100 dark:hover:bg-[#18181B] transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 cursor-pointer"
        title="Toggle Navigation Menu">
        <i data-lucide="menu" class="w-5 h-5"></i>
      </button>
      <a href="/radar" class="flex items-center space-x-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 rounded-lg">
        <div class="h-8 w-8 rounded-lg bg-rose-600 flex items-center justify-center text-white shadow-xs">
          <i data-lucide="cpu" class="w-4 h-4"></i>
        </div>
        <div>
          <span class="font-bold text-sm tracking-tight text-slate-900 dark:text-[#FAFAFA]">Pin Arbitrage</span>
          <span class="text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-600 dark:text-rose-400 font-bold ml-1 border border-rose-500/20">V4</span>
        </div>
      </a>
    </div>

    <!-- Mobile Quick Search & Action Buttons -->
    <div class="flex items-center space-x-1.5">
      <button
        type="button"
        @click="window.dispatchEvent(new CustomEvent('pae:open-command-palette'))"
        aria-label="Search"
        class="p-2 rounded-xl border border-slate-200 dark:border-[#27272A] text-slate-600 dark:text-[#A1A1AA] hover:bg-slate-100 dark:hover:bg-[#18181B] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 cursor-pointer"
        title="Search or Jump (⌘K)">
        <i data-lucide="search" class="w-4 h-4"></i>
      </button>
      <button
        type="button"
        @click="toggleTheme()"
        aria-label="Toggle Theme"
        class="p-2 rounded-xl border border-slate-200 dark:border-[#27272A] text-slate-600 dark:text-[#A1A1AA] hover:bg-slate-100 dark:hover:bg-[#18181B] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 cursor-pointer"
        :title="${darkExpr} ? 'Light Mode' : 'Dark Mode'">
        <span x-show="!${darkExpr}" class="inline-flex items-center justify-center"><i data-lucide="moon" class="w-4 h-4"></i></span>
        <span x-show="${darkExpr}" class="inline-flex items-center justify-center"><i data-lucide="sun" class="w-4 h-4"></i></span>
      </button>
      <button
        type="button"
        @click="${refreshHandler}"${disabledRefreshAttr}
        aria-label="Refresh Data"
        class="p-2 rounded-xl border border-slate-200 dark:border-[#27272A] text-slate-600 dark:text-[#A1A1AA] hover:bg-slate-100 dark:hover:bg-[#18181B] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 cursor-pointer"
        title="Refresh Data">
        <i data-lucide="rotate-cw"${loadingSpinAttr} class="w-4 h-4"></i>
      </button>
    </div>
  </header>`}

  <!-- Mobile Drawer Backdrop & Drawer [INVARIANT: UNIFIED-SIDEBAR-LAYOUT] -->
  <div
    x-show="isMobileMenuOpen"
    x-cloak
    class="fixed inset-0 z-50 md:hidden bg-slate-950/70 backdrop-blur-sm transition-opacity"
    @click="isMobileMenuOpen = false"
    @keydown.escape.window="isMobileMenuOpen = false">
    <div
      class="w-72 bg-white dark:bg-[#121215] border-r border-slate-200 dark:border-[#27272A] h-full flex flex-col justify-between p-5 space-y-4 shadow-2xl overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Navigation Menu"
      @click.stop>
      <div class="space-y-4">
        <!-- Mobile Drawer Header -->
        <div class="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-[#27272A]">
          <a href="/radar" class="flex items-center space-x-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 rounded-lg">
            <div class="h-9 w-9 rounded-xl bg-rose-600 flex items-center justify-center text-white shadow-xs">
              <i data-lucide="cpu" class="w-5 h-5"></i>
            </div>
            <div>
              <div class="font-bold text-sm text-slate-900 dark:text-[#FAFAFA]">Pin Arbitrage</div>
              <div class="text-[10px] text-slate-500 dark:text-[#71717A] font-mono tabular-nums">V4 Workspace</div>
            </div>
          </a>
          <button
            type="button"
            @click="isMobileMenuOpen = false"
            aria-label="Close Navigation Menu"
            class="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 cursor-pointer">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <!-- Mobile Workspace Switcher (V4 Multi-Workspace Isolation) -->
        <div x-data="paeWorkspaceSwitcher()" x-init="init()" class="relative">
          <button
            type="button"
            @click="open = !open"
            :aria-expanded="open ? 'true' : 'false'"
            aria-label="Switch Active Workspace"
            class="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold bg-slate-100/80 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A] text-slate-800 dark:text-[#FAFAFA] hover:border-rose-500/40 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">
            <div class="flex items-center space-x-2 min-w-0">
              <span class="w-6 h-6 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <i data-lucide="layers" class="w-3.5 h-3.5"></i>
              </span>
              <span class="truncate" x-text="activeWorkspaceName()">Default Workspace</span>
            </div>
            <i data-lucide="chevrons-up-down" class="w-3.5 h-3.5 text-slate-400 shrink-0"></i>
          </button>
          <div
            x-show="open"
            x-cloak
            @click.outside="open = false"
            class="mt-1.5 p-1.5 rounded-xl bg-white dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A] shadow-lg space-y-1">
            <template x-for="ws in workspaces" :key="ws.id">
              <button
                type="button"
                @click="switchWorkspace(ws.id)"
                class="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition cursor-pointer"
                :class="ws.id === activeWorkspaceId ? 'bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300 font-semibold' : 'text-slate-600 dark:text-[#A1A1AA] hover:bg-slate-100 dark:hover:bg-[#27272A]'">
                <span class="truncate" x-text="ws.name"></span>
                <span class="text-[10px] font-mono tabular-nums opacity-70" x-text="ws.campaign_count || 0"></span>
              </button>
            </template>
            <div class="pt-1 mt-1 border-t border-slate-200 dark:border-[#27272A]">
              <form x-show="creating" @submit.prevent="createNewWorkspace()" class="flex items-center space-x-1">
                <input
                  type="text"
                  x-model="newWorkspaceName"
                  placeholder="e.g. Food Site"
                  aria-label="New Workspace Name"
                  maxlength="80"
                  class="flex-1 min-w-0 px-2 py-1 text-xs rounded-lg bg-slate-50 dark:bg-[#09090B] border border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-[#FAFAFA] focus:outline-none focus:ring-1 focus:ring-rose-500" />
                <button type="submit" :disabled="saving" class="px-2 py-1 text-[11px] font-semibold rounded-lg bg-rose-600 text-white hover:bg-rose-700 cursor-pointer">Add</button>
              </form>
              <button
                type="button"
                x-show="!creating"
                @click="creating = true"
                class="w-full flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition cursor-pointer">
                <i data-lucide="plus" class="w-3.5 h-3.5"></i>
                <span>New Workspace</span>
              </button>
              <div x-show="errorMsg" x-text="errorMsg" class="mt-1 px-2 text-[10px] text-rose-500"></div>
            </div>
          </div>
        </div>

        <!-- Mobile 5-Item Navigation -->
        <nav class="space-y-1" aria-label="Primary Mobile Navigation">
          ${renderMobileNavItems()}
        </nav>
      </div>

      <!-- Mobile Drawer Footer -->
      <div class="pt-3 border-t border-slate-200 dark:border-[#27272A]">
        ${renderFooterShortcut(true)}
      </div>
    </div>
  </div>

  <!-- Desktop Permanent Sidebar (<aside>) [INVARIANT: UNIFIED-SIDEBAR-LAYOUT] -->
  <aside
    class="hidden md:flex fixed inset-y-0 left-0 z-40 w-64 lg:w-72 bg-white dark:bg-[#121215] border-r border-slate-200/90 dark:border-[#27272A] flex-col justify-between shadow-xs overflow-y-auto overflow-x-hidden transition-all duration-300 ease-in-out"
    :class="isSidebarCollapsed ? '!w-20' : 'w-64 lg:w-72'">

    <!-- Top Section: App Brand, Workspace Switcher & 5 Canonical Navigation Items -->
    <div class="p-4 lg:p-5 space-y-4 transition-all duration-300" :class="isSidebarCollapsed ? '!p-3 space-y-4' : 'p-4 lg:p-5 space-y-4'">
      <!-- App Brand & Title + Collapse Toggle -->
      <div class="flex items-center justify-between transition-all duration-300" :class="isSidebarCollapsed ? 'flex-col space-y-2.5 items-center !justify-center' : 'justify-between'">
        <a href="/radar" class="flex items-center space-x-3 overflow-hidden group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 rounded-xl">
          <div class="h-10 w-10 rounded-xl bg-rose-600 flex items-center justify-center shadow-xs text-white shrink-0 group-hover:scale-102 transition">
            <i data-lucide="cpu" class="w-5 h-5"></i>
          </div>
          <div x-show="!isSidebarCollapsed" x-transition.opacity.duration.200ms class="overflow-hidden whitespace-nowrap">
            <div class="flex items-center space-x-1.5">
              <span class="font-bold text-sm lg:text-base tracking-tight text-slate-900 dark:text-[#FAFAFA] truncate">
                Pin Arbitrage
              </span>
            </div>
            <div class="flex items-center space-x-1.5 mt-0.5">
              <span class="px-1.5 py-0.5 text-[9px] font-mono tabular-nums font-bold uppercase rounded-md bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/25">
                V4
              </span>
            </div>
          </div>
        </a>

        <button
          type="button"
          @click="toggleSidebar()"
          class="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 dark:hover:text-[#FAFAFA] hover:bg-slate-100 dark:hover:bg-[#18181B] transition active:scale-95 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 cursor-pointer"
          :class="isSidebarCollapsed ? 'w-8 h-8 flex items-center justify-center' : ''"
          :title="isSidebarCollapsed ? 'Expand Sidebar (Ctrl+B)' : 'Collapse Sidebar (Ctrl+B)'"
          aria-label="Toggle Sidebar">
          <span x-show="!isSidebarCollapsed" class="inline-flex items-center justify-center"><i data-lucide="chevrons-left" class="w-4 h-4"></i></span>
          <span x-show="isSidebarCollapsed" x-cloak class="inline-flex items-center justify-center"><i data-lucide="chevrons-right" class="w-4 h-4"></i></span>
        </button>
      </div>

      <!-- Desktop Workspace Switcher (V4 Multi-Workspace Isolation) -->
      <div x-data="paeWorkspaceSwitcher()" x-init="init()" class="relative pb-3 border-b border-slate-200 dark:border-[#27272A]">
        <button
          type="button"
          @click="isSidebarCollapsed ? (toggleSidebar(), open = true) : (open = !open)"
          :aria-expanded="open ? 'true' : 'false'"
          :title="'Workspace: ' + activeWorkspaceName()"
          aria-label="Switch Active Workspace"
          class="w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-semibold bg-slate-100/80 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A] text-slate-800 dark:text-[#FAFAFA] hover:border-rose-500/40 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
          :class="isSidebarCollapsed ? '!w-10 !h-10 !mx-auto !justify-center !p-0' : ''">
          <div class="flex items-center space-x-2 min-w-0" :class="isSidebarCollapsed ? '!space-x-0 justify-center' : ''">
            <span class="w-6 h-6 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
              <i data-lucide="layers" class="w-3.5 h-3.5"></i>
            </span>
            <div x-show="!isSidebarCollapsed" class="min-w-0 text-left">
              <div class="text-[9px] font-mono uppercase tracking-wider text-slate-400 dark:text-[#71717A] leading-none mb-0.5">Workspace</div>
              <div class="truncate text-xs font-semibold leading-tight" x-text="activeWorkspaceName()">Default Workspace</div>
            </div>
          </div>
          <i x-show="!isSidebarCollapsed" data-lucide="chevrons-up-down" class="w-3.5 h-3.5 text-slate-400 shrink-0"></i>
        </button>

        <div
          x-show="open && !isSidebarCollapsed"
          x-cloak
          @click.outside="open = false"
          class="absolute left-0 right-0 mt-1.5 z-50 p-1.5 rounded-xl bg-white dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A] shadow-xl space-y-1">
          <template x-for="ws in workspaces" :key="ws.id">
            <button
              type="button"
              @click="switchWorkspace(ws.id)"
              class="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition cursor-pointer"
              :class="ws.id === activeWorkspaceId ? 'bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300 font-semibold' : 'text-slate-600 dark:text-[#A1A1AA] hover:bg-slate-100 dark:hover:bg-[#27272A]'">
              <span class="truncate" x-text="ws.name"></span>
              <span class="text-[10px] font-mono tabular-nums opacity-70" x-text="ws.campaign_count || 0"></span>
            </button>
          </template>
          <div class="pt-1 mt-1 border-t border-slate-200 dark:border-[#27272A]">
            <form x-show="creating" @submit.prevent="createNewWorkspace()" class="flex items-center space-x-1">
              <input
                type="text"
                x-model="newWorkspaceName"
                placeholder="e.g. Home Decor"
                aria-label="New Workspace Name"
                maxlength="80"
                class="flex-1 min-w-0 px-2 py-1 text-xs rounded-lg bg-slate-50 dark:bg-[#09090B] border border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-[#FAFAFA] focus:outline-none focus:ring-1 focus:ring-rose-500" />
              <button type="submit" :disabled="saving" class="px-2 py-1 text-[11px] font-semibold rounded-lg bg-rose-600 text-white hover:bg-rose-700 cursor-pointer">Add</button>
            </form>
            <button
              type="button"
              x-show="!creating"
              @click="creating = true"
              class="w-full flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition cursor-pointer">
              <i data-lucide="plus" class="w-3.5 h-3.5"></i>
              <span>New Workspace</span>
            </button>
          </div>
          <div x-show="errorMsg" x-cloak class="px-2 py-1 text-[11px] text-rose-600 dark:text-rose-400" x-text="errorMsg"></div>
        </div>
      </div>

      <!-- Desktop 5-Item Clean Navigation -->
      <nav class="space-y-1 pt-1" aria-label="Primary Navigation" :class="isSidebarCollapsed ? 'flex flex-col items-center' : ''">
        ${renderDesktopNavItems()}
      </nav>
    </div>

    <!-- Bottom Footer Section (Clean Shortcut — No Duplicate Cookie Modal or Telemetry) -->
    <div class="p-4 space-y-3 border-t border-slate-200/80 dark:border-[#27272A] bg-slate-50/60 dark:bg-[#09090B]/60 transition-all duration-300" :class="isSidebarCollapsed ? '!p-3 !space-y-2' : 'p-4 space-y-3'">
      ${renderFooterShortcut(false)}

      ${!showTopbar ? `
      <div :class="isSidebarCollapsed ? 'flex flex-col space-y-2 items-center' : 'flex items-center justify-between pt-1'">
        <button
          type="button"
          @click="toggleTheme()"
          class="flex items-center justify-center rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] text-slate-700 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-[#FAFAFA] text-xs font-medium hover:bg-slate-100 dark:hover:bg-[#27272A] transition active:scale-95 shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 cursor-pointer"
          :class="isSidebarCollapsed ? 'w-10 h-10 p-0' : 'flex-1 mr-2 space-x-2 py-2 px-3'"
          title="Switch Theme"
          aria-label="Toggle theme">
          <span x-show="!${darkExpr}" class="inline-flex items-center justify-center"><i data-lucide="moon" class="w-3.5 h-3.5"></i></span>
          <span x-show="${darkExpr}" class="inline-flex items-center justify-center"><i data-lucide="sun" class="w-3.5 h-3.5"></i></span>
          <span x-show="!isSidebarCollapsed" x-text="${darkExpr} ? 'Light' : 'Dark'"></span>
        </button>

        <button
          type="button"
          @click="${refreshHandler}"${disabledRefreshAttr}
          class="flex items-center justify-center rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] hover:bg-slate-100 dark:hover:bg-[#27272A] text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-[#FAFAFA] transition active:scale-95 shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 cursor-pointer"
          :class="isSidebarCollapsed ? 'w-10 h-10 p-0' : 'p-2'"
          title="Refresh Data"
          aria-label="Refresh Data">
          <i data-lucide="rotate-cw"${loadingSpinAttr} class="w-4 h-4"></i>
        </button>
      </div>` : ''}
    </div>
  </aside>

  ${showTopbar ? renderAppTopbar({ activeNav, refreshHandler, isDashboardSpa, refreshLoadingExpr, customHeaderLeftHtml, customHeaderRightHtml }) : ''}

  <!-- Global Command Palette Modal (⌘K / ⌘F) [INVARIANT: GLOBAL-SEARCH-PALETTE] -->
  <div
    x-data="paeCommandPalette()"
    @pae:open-command-palette.window="openCmd()"
    @keydown.window.cmd.k.prevent="openCmd()"
    @keydown.window.ctrl.k.prevent="openCmd()"
    @keydown.window.cmd.f.prevent="openCmd()"
    @keydown.window.ctrl.f.prevent="openCmd()"
    x-show="isCommandOpen"
    x-cloak
    class="fixed inset-0 z-[60] overflow-y-auto p-4 sm:p-6 md:p-16 bg-slate-950/65 backdrop-blur-sm flex items-start justify-center"
    @click="closeCmd()"
    @keydown.escape.window="if (isCommandOpen) closeCmd()">

    <div
      class="w-full max-w-2xl bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl shadow-2xl overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Global Command Palette and Multi-Entity Live Search"
      @click.stop>

      <!-- Input Header -->
      <div class="p-3.5 border-b border-slate-200 dark:border-[#27272A] flex items-center gap-3 bg-slate-50/70 dark:bg-[#18181B]/70">
        <span x-show="!cmdLoading" class="inline-flex items-center justify-center shrink-0">
          <i data-lucide="search" class="w-4 h-4 text-rose-500"></i>
        </span>
        <span x-show="cmdLoading" class="inline-flex items-center justify-center shrink-0">
          <i data-lucide="loader-2" class="w-4 h-4 text-rose-500 animate-spin"></i>
        </span>
        <input
          id="pae-global-cmd-input"
          type="text"
          autocomplete="off"
          spellcheck="false"
          x-model="cmdQuery"
          @input="onCmdInput()"
          @keydown.arrow-down.prevent="moveCmdSelection(1)"
          @keydown.arrow-up.prevent="moveCmdSelection(-1)"
          @keydown.enter.prevent="handleCmdSubmit()"
          placeholder="Search keywords, @creators, campaigns, domains, or paste Pin ID..."
          class="flex-1 bg-transparent border-0 text-sm font-medium text-slate-900 dark:text-[#FAFAFA] placeholder:text-slate-400 dark:placeholder:text-[#71717A] focus:outline-none"
        />
        <div class="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            x-show="cmdQuery.length > 0"
            @click="clearCmdQuery()"
            class="px-1.5 py-0.5 text-[10px] font-mono rounded bg-slate-100 dark:bg-[#27272A] text-slate-500 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer"
            aria-label="Clear search query">Clear</button>
          <kbd class="px-1.5 py-0.5 text-[10px] font-mono rounded bg-white dark:bg-[#121215] text-slate-400 border border-slate-200 dark:border-[#27272A] shadow-2xs">ESC</kbd>
        </div>
      </div>

      <!-- Results & Quick Jump Viewport -->
      <div class="max-h-[26rem] overflow-y-auto p-2 space-y-1.5" role="listbox" aria-label="Search results">

        <!-- 1-char hint -->
        <template x-if="cmdTrimmed.length === 1 && !/^[0-9]+$/.test(cmdTrimmed)">
          <div class="px-3 py-2 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between bg-slate-50/70 dark:bg-[#18181B]/60 rounded-xl border border-slate-100 dark:border-[#27272A]">
            <span>Type at least <strong class="text-slate-700 dark:text-slate-200 font-mono">2</strong> characters to search keywords, creators, campaigns &amp; domains</span>
            <span class="font-mono text-[10px] text-slate-400">min 2 chars</span>
          </div>
        </template>

        <!-- Error / Degraded Notice -->
        <template x-if="cmdError">
          <div class="px-3 py-2 text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-800/60" x-text="cmdError"></div>
        </template>

        <!-- Active Query Results (grouped) -->
        <template x-if="cmdTrimmed.length > 0">
          <div class="space-y-2">
            <template x-for="group in groupedCmdSections" :key="group.key">
              <div class="space-y-0.5">
                <div class="px-2.5 pt-1 pb-0.5 flex items-center justify-between">
                  <span class="text-[10px] font-mono uppercase tracking-wider font-bold" :class="group.headerClass" x-text="group.title"></span>
                  <span x-show="group.badge" class="text-[10px] font-mono tabular-nums text-slate-400 dark:text-slate-500" x-text="group.badge"></span>
                </div>

                <template x-for="item in group.items" :key="item.uid">
                  <a
                    :href="cmdSafeUrl(item.url)"
                    :data-cmd-idx="item.idx"
                    role="option"
                    :aria-selected="cmdActiveIndex === item.idx ? 'true' : 'false'"
                    @mouseenter="cmdActiveIndex = item.idx"
                    @click.prevent="navigateToCmdUrl(item.url)"
                    class="flex items-center justify-between gap-3 px-2.5 py-2 rounded-xl text-xs transition border"
                    :class="cmdActiveIndex === item.idx ? 'bg-rose-50/90 dark:bg-rose-950/30 border-rose-200 dark:border-rose-500/40 text-slate-900 dark:text-white' : 'border-transparent hover:bg-slate-100/80 dark:hover:bg-[#18181B] text-slate-700 dark:text-[#FAFAFA]'">

                    <div class="flex items-center gap-2.5 min-w-0 flex-1">
                      <template x-if="item.kind === 'creator' && safeAvatarUrl(item.avatarUrl)">
                        <img :src="safeAvatarUrl(item.avatarUrl)" alt="" class="w-6 h-6 rounded-full object-cover border border-slate-200 dark:border-[#27272A] shrink-0" referrerpolicy="no-referrer" />
                      </template>
                      <template x-if="item.kind === 'folder'">
                        <span class="w-6 h-6 rounded-lg flex items-center justify-center border border-slate-200 dark:border-white/10 shrink-0 text-[11px] font-bold"
                              :style="'background-color:' + safeFolderColor(item.color) + '22; color:' + safeFolderColor(item.color)"><i data-lucide="folder" class="w-3.5 h-3.5"></i></span>
                      </template>
                      <template x-if="item.kind !== 'folder' && !(item.kind === 'creator' && safeAvatarUrl(item.avatarUrl))">
                        <span class="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-mono font-bold shrink-0 border" :class="item.iconClass" x-text="item.iconGlyph"></span>
                      </template>

                      <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-1.5 min-w-0">
                          <span x-show="item.kind === 'keyword'" class="w-1.5 h-1.5 rounded-full shrink-0" :class="item.isActive ? 'bg-emerald-500' : 'bg-slate-400'"></span>
                          <span class="font-semibold truncate" x-text="item.title"></span>
                        </div>
                        <div x-show="item.subtitle" class="text-[10px] text-slate-500 dark:text-slate-400 truncate font-mono" x-text="item.subtitle"></div>
                      </div>
                    </div>

                    <div class="flex items-center gap-2 shrink-0">
                      <span x-show="item.metric" class="text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#18181B] text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-[#27272A]" x-text="item.metric"></span>
                      <span x-show="cmdActiveIndex === item.idx" class="text-[10px] font-mono text-rose-600 dark:text-rose-400 font-bold">↵</span>
                    </div>
                  </a>
                </template>
              </div>
            </template>

            <template x-if="!cmdLoading && cmdTrimmed.length >= 2 && cmdHasQueried && cmdTotalMatches === 0">
              <div class="px-3 py-2 text-[11px] text-slate-500 dark:text-slate-400 text-center">
                No exact database matches for "<span class="font-mono font-semibold text-slate-700 dark:text-slate-200" x-text="cmdTrimmed"></span>". Use a studio filter option above.
              </div>
            </template>
          </div>
        </template>

        <!-- Static Quick Jump Links (when input is empty) -->
        <template x-if="cmdTrimmed.length === 0">
          <div class="space-y-1">
            <template x-for="group in staticCmdSections" :key="group.key">
              <div class="space-y-0.5">
                <div class="px-2.5 pt-2 pb-1 text-[10px] font-mono uppercase tracking-wider text-slate-400 dark:text-[#71717A] font-bold" x-text="group.title"></div>
                <template x-for="item in group.items" :key="item.uid">
                  <a
                    :href="cmdSafeUrl(item.url)"
                    :data-cmd-idx="item.idx"
                    role="option"
                    :aria-selected="cmdActiveIndex === item.idx ? 'true' : 'false'"
                    @mouseenter="cmdActiveIndex = item.idx"
                    @click.prevent="navigateToCmdUrl(item.url)"
                    class="flex items-center justify-between p-2 rounded-xl text-xs transition border"
                    :class="cmdActiveIndex === item.idx ? 'bg-rose-50/90 dark:bg-rose-950/30 border-rose-200 dark:border-rose-500/40 text-slate-900 dark:text-white' : 'border-transparent hover:bg-slate-100 dark:hover:bg-[#18181B] text-slate-700 dark:text-[#FAFAFA]'">
                    <div class="flex items-center gap-2.5">
                      <span class="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-mono font-bold" :class="item.iconClass" x-text="item.iconGlyph"></span>
                      <span class="font-medium" x-text="item.title"></span>
                    </div>
                    <span class="text-[10px] font-mono" :class="item.badgeClass || 'text-slate-400'" x-text="item.metric"></span>
                  </a>
                </template>
              </div>
            </template>
          </div>
        </template>
      </div>

      <!-- Footer Quick Keys -->
      <div class="p-2.5 px-4 bg-slate-50 dark:bg-[#18181B] border-t border-slate-200 dark:border-[#27272A] flex items-center justify-between text-[11px] text-slate-400 font-mono">
        <div class="flex items-center gap-3">
          <span><kbd class="px-1 py-0.5 rounded bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A]">↑</kbd> <kbd class="px-1 py-0.5 rounded bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A]">↓</kbd> navigate</span>
          <span><kbd class="px-1 py-0.5 rounded bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A]">↵</kbd> select</span>
          <span><kbd class="px-1 py-0.5 rounded bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A]">esc</kbd> close</span>
        </div>
        <span class="text-rose-600 dark:text-rose-400 font-bold">PAE V4</span>
      </div>
    </div>
  </div>

${renderClientJsScriptTag('command-palette')}
`;
}

export { getAppSidebarClientScriptCode } from './command-palette-client-app.mjs';
