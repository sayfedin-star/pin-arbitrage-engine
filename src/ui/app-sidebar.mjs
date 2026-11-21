/**
 * src/ui/app-sidebar.mjs
 * 
 * Canonical Unified App Sidebar, Shell Navigation & Topbar Component
 * Single Source of Truth (SSOT) for PAE desktop navigation, top sticky command bar,
 * and mobile navigation drawer.
 * 
 * Enforces:
 * - [INVARIANT: UNIFIED-SIDEBAR-LAYOUT] (100% layout parity across all studio views)
 * - [INVARIANT: LIGHT-MODE-BENTO] (#F8FAFC canvas, #FFFFFF bento cards, 1px border #E2E8F0, #0F172A primary ink, #64748B muted text, #E11D48 accent)
 * - [INVARIANT: GROUPED-NAVIGATION] (Executive, Intelligence, Campaigns)
 * - [INVARIANT: GLOBAL-SEARCH-PALETTE] (⌘K / ⌘F global search & command modal)
 * - [INVARIANT: TIMEFRAME-SELECTOR-PARITY] (24h, 5d, 7d, 15d segmented bento controls)
 * - [INVARIANT: HEADLESS-NODE-SHIELD] (Rule 17: typeof window, localStorage, document guards)
 */

import { renderClientJsScriptTag } from './client-assets.mjs';

function renderAppTopbar({
  activeNav: _activeNav = 'overview',
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
    class="flex sticky top-0 z-40 transition-all duration-300 ease-in-out border-b border-slate-200/90 dark:border-[#27272A] bg-white/95 dark:bg-[#121215]/95 backdrop-blur-xl px-4 lg:px-6 py-2.5 items-center justify-between gap-3 shadow-xs"
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
        <span x-show="isSidebarCollapsed" class="inline-flex items-center justify-center"><i data-lucide="chevrons-right" class="w-4 h-4"></i></span>
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
    class="hidden md:flex sticky top-0 z-30 transition-all duration-300 ease-in-out border-b border-slate-200/90 dark:border-[#27272A] bg-white/95 dark:bg-[#121215]/95 backdrop-blur-xl px-4 lg:px-6 py-2.5 items-center justify-between gap-4 shadow-xs"
    :class="isSidebarCollapsed ? '!ml-20' : 'md:ml-64 lg:ml-72'">
    
    <!-- Left: Sidebar Toggle & ⌘K/⌘F Global Command Trigger -->
    <div class="flex items-center gap-3 min-w-0">
      <button
        type="button"
        @click="toggleSidebar()"
        class="p-2 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50/80 hover:bg-slate-100 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-slate-500 hover:text-slate-900 dark:text-[#A1A1AA] dark:hover:text-[#FAFAFA] transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 shrink-0"
        :title="isSidebarCollapsed ? 'Expand Sidebar (Ctrl+B)' : 'Collapse Sidebar (Ctrl+B)'"
        aria-label="Toggle Sidebar">
        <span x-show="!isSidebarCollapsed" class="inline-flex items-center justify-center"><i data-lucide="chevrons-left" class="w-4 h-4"></i></span>
        <span x-show="isSidebarCollapsed" class="inline-flex items-center justify-center"><i data-lucide="chevrons-right" class="w-4 h-4"></i></span>
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
      <!-- Theme Switcher -->
      <button
        type="button"
        @click="toggleTheme()"
        class="p-2 rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] text-slate-600 hover:text-slate-900 dark:text-[#A1A1AA] dark:hover:text-[#FAFAFA] hover:bg-slate-100 dark:hover:bg-[#27272A] transition active:scale-95 shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 cursor-pointer"
        :title="${darkExpr} ? 'Switch to Light Mode' : 'Switch to Dark Mode'"
        aria-label="Toggle color theme">
        <span x-show="!${darkExpr}" class="inline-flex items-center justify-center"><i data-lucide="moon" class="w-4 h-4"></i></span>
        <span x-show="${darkExpr}" class="inline-flex items-center justify-center"><i data-lucide="sun" class="w-4 h-4"></i></span>
      </button>

      <!-- Refresh Button -->
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
  activeNav = 'overview', // 'overview' | 'pulse' | 'newborn' | 'creators' | 'keywords' | 'domains' | 'related_pins' | 'folders'
  refreshHandler = 'window.location.reload()',
  isDashboardSpa = false,
  showTopbar = true,
  refreshLoadingExpr = '',
  customHeaderLeftHtml = '',
  customHeaderRightHtml = ''
} = {}) {
  const hasCustomHeader = Boolean(customHeaderLeftHtml || customHeaderRightHtml);
  const isOverview = activeNav === 'overview';
  const isPulse = activeNav === 'pulse' || activeNav === '24h';
  const isNewborn = activeNav === 'newborn';
  const isCreators = activeNav === 'creators';
  const isKeywords = activeNav === 'keywords';
  const isDomains = activeNav === 'domains';
  const isRelated = activeNav === 'related_pins';
  const isFolders = activeNav === 'folders';

  // Light-Mode Bento Tokens (#F8FAFC canvas, #FFFFFF card surface with 1px border #E2E8F0, #0F172A ink, #E11D48 accent)
  const inactiveClass = 'text-slate-600 dark:text-[#A1A1AA] hover:bg-slate-100/80 dark:hover:bg-[#18181B] hover:text-slate-900 dark:hover:text-[#FAFAFA] border border-transparent font-medium';
  const activeClass = 'bg-rose-50 text-rose-600 font-semibold border border-rose-200/80 shadow-xs dark:bg-rose-950/20 dark:text-rose-400 dark:border-rose-500/30';

  const overviewActive = isOverview ? activeClass : inactiveClass;
  const pulseActive = isPulse ? activeClass : inactiveClass;
  const newbornActive = isNewborn ? activeClass : inactiveClass;
  const creatorsActive = isCreators ? activeClass : inactiveClass;
  const keywordsActive = isKeywords ? activeClass : inactiveClass;
  const domainsActive = isDomains ? activeClass : inactiveClass;
  const relatedActive = isRelated ? activeClass : inactiveClass;
  const foldersActive = isFolders ? activeClass : inactiveClass;

  const iconActive = 'text-rose-600 dark:text-rose-400 shrink-0';
  const iconInactive = 'text-slate-400 dark:text-[#71717A] shrink-0';

  const badgeActive = 'px-1.5 py-0.5 rounded-md text-[10px] font-mono tabular-nums font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20';
  const badgeInactive = 'px-1.5 py-0.5 rounded-md text-[10px] font-mono tabular-nums font-medium bg-slate-100 dark:bg-[#18181B] text-slate-500 dark:text-[#71717A] border border-slate-200/80 dark:border-[#27272A]';

  const spaCreatorsExpr = `(currentTab === 'creators_archive' || currentTab === 'competitors' || currentTab === 'pinarchive')`;
  const spaRelatedExpr = `(currentTab === 'related_pins' || currentTab === 'seeds' || currentTab === 'intersections' || currentTab === 'explorer')`;
  const darkExpr = `(typeof isDark !== 'undefined' ? isDark : (typeof darkMode !== 'undefined' ? darkMode : false))`;
  const loadingSpinAttr = isDashboardSpa ? ` :class="{'animate-spin': isLoading}"` : '';
  const disabledRefreshAttr = isDashboardSpa ? ` :disabled="isLoading"` : '';

  const renderFooterStatus = (isMobile) => isDashboardSpa ? `
        <button
          type="button"
          @click="isCookieModalOpen = true${isMobile ? '; isMobileMenuOpen = false' : ''}"
          class="flex items-center rounded-xl border transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 cursor-pointer"
          :class="[
            ${isMobile ? "'w-full justify-between px-3 py-2 text-xs font-semibold'" : "isSidebarCollapsed ? 'w-10 h-10 p-0 justify-center mx-auto' : 'w-full justify-between px-3 py-2 text-xs font-semibold'"},
            cookieStatus.has_cookie ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20' : 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20'
          ]"
          :title="cookieStatus.has_cookie ? 'Pinterest: Authenticated' : 'Guest Mode (No Cookie)'">
          <span class="${isMobile ? 'flex items-center truncate font-mono tabular-nums space-x-2' : 'flex items-center truncate font-mono tabular-nums'}"${isMobile ? '' : ' :class="isSidebarCollapsed ? \'justify-center\' : \'space-x-2\'"'}>
            <span class="w-2 h-2 rounded-full shrink-0" :class="cookieStatus.has_cookie ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'"></span>
            <span ${isMobile ? '' : 'x-show="!isSidebarCollapsed" '}class="truncate text-[11px]" x-text="cookieStatus.has_cookie ? '${isMobile ? 'Session: Authenticated' : 'Pinterest: Authenticated'}' : 'Guest Mode (No Cookie)'"></span>
          </span>
          <span ${isMobile ? '' : 'x-show="!isSidebarCollapsed" '}class="inline-flex items-center justify-center shrink-0 opacity-70"><i data-lucide="key" class="w-3.5 h-3.5"></i></span>
        </button>
  ` : `
        <div
          class="${isMobile ? 'flex items-center rounded-xl border bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-400 font-mono tabular-nums w-full justify-between px-3 py-2 text-xs font-semibold' : 'flex items-center rounded-xl border bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-400 font-mono tabular-nums'}"${isMobile ? '' : ' :class="isSidebarCollapsed ? \'w-10 h-10 p-0 justify-center mx-auto\' : \'w-full justify-between px-3 py-2 text-xs font-semibold\'"'}
          title="PAE Distributed System: Active">
          <span class="${isMobile ? 'flex items-center truncate space-x-2' : 'flex items-center truncate'}"${isMobile ? '' : ' :class="isSidebarCollapsed ? \'justify-center\' : \'space-x-2\'"'}>
            <span class="w-2 h-2 rounded-full shrink-0 bg-emerald-500 motion-safe:animate-pulse"></span>
            <span ${isMobile ? '' : 'x-show="!isSidebarCollapsed" '}class="truncate text-[11px]">System: Operational</span>
          </span>
          <span ${isMobile ? '' : 'x-show="!isSidebarCollapsed" '}class="inline-flex items-center justify-center shrink-0 opacity-70"><i data-lucide="shield-check" class="w-3.5 h-3.5"></i></span>
        </div>
  `;

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
      <a href="/" class="flex items-center space-x-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 rounded-lg">
        <div class="h-8 w-8 rounded-lg bg-rose-600 flex items-center justify-center text-white shadow-xs">
          <i data-lucide="cpu" class="w-4 h-4"></i>
        </div>
        <div>
          <span class="font-bold text-sm tracking-tight text-slate-900 dark:text-[#FAFAFA]">Pin Arbitrage</span>
          <span class="text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-600 dark:text-rose-400 font-bold ml-1 border border-rose-500/20">V3</span>
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
        <i :data-lucide="${darkExpr} ? 'sun' : 'moon'" class="w-4 h-4"></i>
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
      <!-- Mobile Drawer Header -->
      <div class="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-[#27272A]">
        <a href="/" class="flex items-center space-x-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 rounded-lg">
          <div class="h-9 w-9 rounded-xl bg-rose-600 flex items-center justify-center text-white shadow-xs">
            <i data-lucide="cpu" class="w-5 h-5"></i>
          </div>
          <div>
            <div class="font-bold text-sm text-slate-900 dark:text-[#FAFAFA]">Pin Arbitrage</div>
            <div class="text-[10px] text-slate-500 dark:text-[#71717A] font-mono tabular-nums">V3 Predictive</div>
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

      <!-- Mobile Navigation Links with Grouped Headers [INVARIANT: GROUPED-NAVIGATION] -->
      <nav class="space-y-4">
        <!-- Group 1: Executive -->
        <div class="space-y-1">
          <div class="px-3 text-[10px] font-mono uppercase tracking-wider text-slate-400 dark:text-[#71717A] font-bold">Executive</div>
          ${isDashboardSpa ? `
          <button type="button" @click="switchTab('overview'); isMobileMenuOpen = false" class="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500" :class="currentTab === 'overview' ? '${activeClass}' : '${inactiveClass}'">
            <div class="flex items-center space-x-2.5">
              <i data-lucide="layout-dashboard" class="w-4 h-4 shrink-0" :class="currentTab === 'overview' ? '${iconActive}' : '${iconInactive}'"></i>
              <span>Overview & Hub</span>
            </div>
            <span :class="currentTab === 'overview' ? '${badgeActive}' : '${badgeInactive}'">Home</span>
          </button>` : `
          <a href="/" class="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 ${overviewActive}">
            <div class="flex items-center space-x-2.5">
              <i data-lucide="layout-dashboard" class="w-4 h-4 shrink-0 ${isOverview ? iconActive : iconInactive}"></i>
              <span>Overview & Hub</span>
            </div>
            <span class="${isOverview ? badgeActive : badgeInactive}">Home</span>
          </a>`}

          <a href="/pulse" class="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 ${pulseActive}">
            <div class="flex items-center space-x-2.5">
              <i data-lucide="activity" class="w-4 h-4 shrink-0 ${isPulse ? iconActive : iconInactive}"></i>
              <span>24h Pulse Studio</span>
            </div>
            <span class="${isPulse ? badgeActive : badgeInactive}">Live</span>
          </a>

          <a href="/newborn" class="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 ${newbornActive}">
            <div class="flex items-center space-x-2.5">
              <i data-lucide="flame" class="w-4 h-4 shrink-0 ${isNewborn ? iconActive : iconInactive}"></i>
              <span>Newborn Hunter</span>
            </div>
            <span class="${isNewborn ? badgeActive : badgeInactive}">8-Surf</span>
          </a>
        </div>

        <!-- Group 2: Intelligence -->
        <div class="space-y-1">
          <div class="px-3 text-[10px] font-mono uppercase tracking-wider text-slate-400 dark:text-[#71717A] font-bold">Intelligence</div>
          ${isDashboardSpa ? `
          <button type="button" @click="switchTab('creators_archive'); isMobileMenuOpen = false" class="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500" :class="${spaCreatorsExpr} ? '${activeClass}' : '${inactiveClass}'">
            <div class="flex items-center space-x-2.5">
              <i data-lucide="users" class="w-4 h-4 shrink-0" :class="${spaCreatorsExpr} ? '${iconActive}' : '${iconInactive}'"></i>
              <span>Creator Hub</span>
            </div>
            <span :class="${spaCreatorsExpr} ? '${badgeActive}' : '${badgeInactive}'" x-text="(competitorsOverview && competitorsOverview.tracked_profiles) || competitors.length"></span>
          </button>` : `
          <a href="/accounts" class="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 ${creatorsActive}">
            <div class="flex items-center space-x-2.5">
              <i data-lucide="users" class="w-4 h-4 shrink-0 ${isCreators ? iconActive : iconInactive}"></i>
              <span>Creator Hub</span>
            </div>
            <span class="${isCreators ? badgeActive : badgeInactive}">Ledger</span>
          </a>`}

          <a href="/keywords" class="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 ${keywordsActive}">
            <div class="flex items-center space-x-2.5">
              <i data-lucide="search" class="w-4 h-4 shrink-0 ${isKeywords ? iconActive : iconInactive}"></i>
              <span>Keywords Fleet</span>
            </div>
            ${isDashboardSpa ? `<span class="${badgeInactive}" x-text="keywords.length"></span>` : `<span class="${isKeywords ? badgeActive : badgeInactive}">SERP</span>`}
          </a>

          <a href="/domains" class="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 ${domainsActive}">
            <div class="flex items-center space-x-2.5">
              <i data-lucide="globe" class="w-4 h-4 shrink-0 ${isDomains ? iconActive : iconInactive}"></i>
              <span>Domain Radar</span>
            </div>
            <span class="${isDomains ? badgeActive : badgeInactive}">WHOIS</span>
          </a>

          ${isDashboardSpa ? `
          <button type="button" @click="switchTab('related_pins'); isMobileMenuOpen = false" class="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500" :class="${spaRelatedExpr} ? '${activeClass}' : '${inactiveClass}'">
            <div class="flex items-center space-x-2.5">
              <i data-lucide="git-fork" class="w-4 h-4 shrink-0" :class="${spaRelatedExpr} ? '${iconActive}' : '${iconInactive}'"></i>
              <span>Related Pins</span>
            </div>
            <div class="flex items-center space-x-1 font-mono tabular-nums">
              <span :class="${spaRelatedExpr} ? '${badgeActive}' : '${badgeInactive}'" x-text="((overview && overview.total_seeds) || seeds.length) + 's'"></span>
              <span class="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300" x-text="((overview && overview.intersecting_hubs_count) || intersections.length) + 'i'"></span>
            </div>
          </button>` : `
          <a href="/related-pins" class="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 ${relatedActive}">
            <div class="flex items-center space-x-2.5">
              <i data-lucide="git-fork" class="w-4 h-4 shrink-0 ${isRelated ? iconActive : iconInactive}"></i>
              <span>Related Pins</span>
            </div>
            <span class="${isRelated ? badgeActive : badgeInactive}">Graph</span>
          </a>`}
        </div>

        <!-- Group 3: Campaigns -->
        <div class="space-y-1">
          <div class="px-3 text-[10px] font-mono uppercase tracking-wider text-slate-400 dark:text-[#71717A] font-bold">Campaigns</div>
          <a href="/folders" class="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 ${foldersActive}">
            <div class="flex items-center space-x-2.5">
              <i data-lucide="folder-kanban" class="w-4 h-4 shrink-0 ${isFolders ? iconActive : iconInactive}"></i>
              <span>Campaign Folders</span>
            </div>
            <span x-show="(typeof foldersList !== 'undefined' && foldersList && foldersList.length > 0) || (typeof folders !== 'undefined' && folders && folders.length > 0)" class="${isFolders ? badgeActive : badgeInactive}" x-text="(typeof foldersList !== 'undefined' && foldersList && foldersList.length > 0) ? foldersList.length : ((typeof folders !== 'undefined' && folders) ? folders.length : '')"></span>
            <span x-show="!(typeof foldersList !== 'undefined' && foldersList && foldersList.length > 0) && !(typeof folders !== 'undefined' && folders && folders.length > 0)" class="${isFolders ? badgeActive : badgeInactive}">Clusters</span>
          </a>
        </div>
      </nav>

      <!-- Mobile Drawer Footer -->
      <div class="pt-3 border-t border-slate-200 dark:border-[#27272A] space-y-2">
        ${renderFooterStatus(true)}
      </div>
    </div>
  </div>

  <!-- Desktop Permanent Sidebar (<aside>) [INVARIANT: UNIFIED-SIDEBAR-LAYOUT] -->
  <aside
    class="hidden md:flex fixed inset-y-0 left-0 z-40 bg-white dark:bg-[#121215] border-r border-slate-200/90 dark:border-[#27272A] flex-col justify-between shadow-xs overflow-y-auto overflow-x-hidden transition-all duration-300 ease-in-out"
    :class="isSidebarCollapsed ? '!w-20' : 'w-64 lg:w-72'">
    
    <!-- Top Section: App Brand, Quick Actions, Grouped Navigation Links -->
    <div class="transition-all duration-300" :class="isSidebarCollapsed ? 'p-3 space-y-4' : 'p-4 lg:p-5 space-y-4'">
      <!-- App Brand & Title + Collapse Toggle -->
      <div class="flex items-center transition-all duration-300" :class="isSidebarCollapsed ? 'flex-col space-y-2.5 items-center' : 'justify-between'">
        <a href="/" class="flex items-center space-x-3 overflow-hidden group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 rounded-xl">
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
              <span class="px-1.5 py-0.5 text-[9px] font-mono tabular-nums font-bold uppercase rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30">
                V3 Predictive
              </span>
              ${isDashboardSpa ? `
              <template x-if="crawlStatus.is_crawling">
                <span class="px-1.5 py-0.5 text-[9px] font-mono tabular-nums font-bold rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center space-x-1 motion-safe:animate-pulse">
                  <span class="w-1 h-1 rounded-full bg-amber-400 motion-safe:animate-ping"></span>
                  <span>Active</span>
                </span>
              </template>` : ''}
            </div>
          </div>
        </a>

        <!-- Sideways Collapse / Expand Toggle Button -->
        <button
          type="button"
          @click="toggleSidebar()"
          class="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 dark:hover:text-[#FAFAFA] hover:bg-slate-100 dark:hover:bg-[#18181B] transition active:scale-95 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 cursor-pointer"
          :class="isSidebarCollapsed ? 'w-8 h-8 flex items-center justify-center' : ''"
          :title="isSidebarCollapsed ? 'Expand Sidebar (Ctrl+B)' : 'Collapse Sidebar (Ctrl+B)'"
          aria-label="Toggle Sidebar">
          <span x-show="!isSidebarCollapsed" class="inline-flex items-center justify-center"><i data-lucide="chevrons-left" class="w-4 h-4"></i></span>
          <span x-show="isSidebarCollapsed" class="inline-flex items-center justify-center"><i data-lucide="chevrons-right" class="w-4 h-4"></i></span>
        </button>
      </div>

      <!-- Navigation Links (Desktop) with Grouped Headers [INVARIANT: GROUPED-NAVIGATION] -->
      <nav class="space-y-3 pt-2" :class="isSidebarCollapsed ? 'flex flex-col items-center' : ''">
        
        <!-- SECTION 1: EXECUTIVE -->
        <div class="space-y-1 w-full">
          <div x-show="!isSidebarCollapsed" class="px-3 pt-1 pb-1 text-[10px] font-mono uppercase tracking-wider text-slate-400 dark:text-[#71717A] font-bold">
            Executive
          </div>
          <div x-show="isSidebarCollapsed" class="w-8 mx-auto my-1 border-t border-slate-200 dark:border-[#27272A]"></div>

          <!-- Overview & Hub -->
          ${isDashboardSpa ? `
          <button
            type="button"
            @click="switchTab('overview')"
            class="relative flex items-center rounded-xl text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 cursor-pointer"
            :class="[
              isSidebarCollapsed ? 'w-10 h-10 justify-center' : 'w-full justify-between px-3 py-2.5',
              currentTab === 'overview' ? '${activeClass}' : '${inactiveClass}'
            ]"
            title="Overview & Hub">
            <div class="flex items-center" :class="isSidebarCollapsed ? 'justify-center' : 'space-x-2.5'">
              <i data-lucide="layout-dashboard" class="w-4 h-4 shrink-0" :class="currentTab === 'overview' ? '${iconActive}' : '${iconInactive}'"></i>
              <span x-show="!isSidebarCollapsed" class="truncate">Overview & Hub</span>
            </div>
            <span x-show="!isSidebarCollapsed" :class="currentTab === 'overview' ? '${badgeActive}' : '${badgeInactive}'">Home</span>
            <span x-show="isSidebarCollapsed && currentTab === 'overview'" class="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 shadow-xs"></span>
          </button>` : `
          <a
            href="/"
            class="relative flex items-center rounded-xl text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 ${overviewActive}"
            :class="isSidebarCollapsed ? 'w-10 h-10 justify-center' : 'w-full justify-between px-3 py-2.5'"
            title="Overview & Hub">
            <div class="flex items-center" :class="isSidebarCollapsed ? 'justify-center' : 'space-x-2.5'">
              <i data-lucide="layout-dashboard" class="w-4 h-4 shrink-0 ${isOverview ? iconActive : iconInactive}"></i>
              <span x-show="!isSidebarCollapsed" class="truncate">Overview & Hub</span>
            </div>
            <span x-show="!isSidebarCollapsed" class="${isOverview ? badgeActive : badgeInactive}">Home</span>
            ${isOverview ? '<span x-show="isSidebarCollapsed" class="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 shadow-xs"></span>' : ''}
          </a>`}

          <!-- 24h Pulse Studio -->
          <a
            href="/pulse"
            class="relative flex items-center rounded-xl text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 ${pulseActive}"
            :class="isSidebarCollapsed ? 'w-10 h-10 justify-center' : 'w-full justify-between px-3 py-2.5'"
            title="24h Pulse Studio">
            <div class="flex items-center" :class="isSidebarCollapsed ? 'justify-center' : 'space-x-2.5'">
              <i data-lucide="activity" class="w-4 h-4 shrink-0 ${isPulse ? iconActive : iconInactive}"></i>
              <span x-show="!isSidebarCollapsed" class="truncate">24h Pulse Studio</span>
            </div>
            <span x-show="!isSidebarCollapsed" class="${isPulse ? badgeActive : badgeInactive}">Live</span>
            ${isPulse ? '<span x-show="isSidebarCollapsed" class="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 shadow-xs"></span>' : ''}
          </a>

          <!-- Newborn Breakout Hunter -->
          <a
            href="/newborn"
            class="relative flex items-center rounded-xl text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 ${newbornActive}"
            :class="isSidebarCollapsed ? 'w-10 h-10 justify-center' : 'w-full justify-between px-3 py-2.5'"
            title="Newborn Breakout Hunter">
            <div class="flex items-center" :class="isSidebarCollapsed ? 'justify-center' : 'space-x-2.5'">
              <i data-lucide="flame" class="w-4 h-4 shrink-0 ${isNewborn ? iconActive : iconInactive}"></i>
              <span x-show="!isSidebarCollapsed" class="truncate">Newborn Hunter</span>
            </div>
            <span x-show="!isSidebarCollapsed" class="${isNewborn ? badgeActive : badgeInactive}">8-Surf</span>
            ${isNewborn ? '<span x-show="isSidebarCollapsed" class="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 shadow-xs"></span>' : ''}
          </a>
        </div>

        <!-- SECTION 2: INTELLIGENCE -->
        <div class="space-y-1 w-full">
          <div x-show="!isSidebarCollapsed" class="px-3 pt-2 pb-1 text-[10px] font-mono uppercase tracking-wider text-slate-400 dark:text-[#71717A] font-bold">
            Intelligence
          </div>
          <div x-show="isSidebarCollapsed" class="w-8 mx-auto my-1 border-t border-slate-200 dark:border-[#27272A]"></div>

          <!-- Creator Hub -->
          ${isDashboardSpa ? `
          <button
            type="button"
            @click="switchTab('creators_archive')"
            class="relative flex items-center rounded-xl text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 cursor-pointer"
            :class="[
              isSidebarCollapsed ? 'w-10 h-10 justify-center' : 'w-full justify-between px-3 py-2.5',
              ${spaCreatorsExpr} ? '${activeClass}' : '${inactiveClass}'
            ]"
            title="Creator Hub">
            <div class="flex items-center" :class="isSidebarCollapsed ? 'justify-center' : 'space-x-2.5'">
              <i data-lucide="users" class="w-4 h-4 shrink-0" :class="${spaCreatorsExpr} ? '${iconActive}' : '${iconInactive}'"></i>
              <span x-show="!isSidebarCollapsed" class="truncate">Creator Hub</span>
            </div>
            <div x-show="!isSidebarCollapsed" class="flex items-center space-x-1 font-mono tabular-nums">
              <span :class="${spaCreatorsExpr} ? '${badgeActive}' : '${badgeInactive}'" x-text="(competitorsOverview && competitorsOverview.tracked_profiles) || competitors.length"></span>
            </div>
            <span x-show="isSidebarCollapsed && ((competitorsOverview && competitorsOverview.tracked_profiles > 0) || competitors.length > 0)" class="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500"></span>
          </button>` : `
          <a
            href="/accounts"
            class="relative flex items-center rounded-xl text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 ${creatorsActive}"
            :class="isSidebarCollapsed ? 'w-10 h-10 justify-center' : 'w-full justify-between px-3 py-2.5'"
            title="Creator Hub">
            <div class="flex items-center" :class="isSidebarCollapsed ? 'justify-center' : 'space-x-2.5'">
              <i data-lucide="users" class="w-4 h-4 shrink-0 ${isCreators ? iconActive : iconInactive}"></i>
              <span x-show="!isSidebarCollapsed" class="truncate">Creator Hub</span>
            </div>
            <span x-show="!isSidebarCollapsed && (typeof competitors !== 'undefined' && competitors && competitors.length > 0)" class="${isCreators ? badgeActive : badgeInactive}" x-text="(typeof competitors !== 'undefined' && competitors) ? competitors.length : ''"></span>
            <span x-show="!isSidebarCollapsed && (typeof competitors === 'undefined' || !competitors || !competitors.length)" class="${isCreators ? badgeActive : badgeInactive}">Ledger</span>
            ${isCreators ? '<span x-show="isSidebarCollapsed" class="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 shadow-xs"></span>' : ''}
          </a>`}

          <!-- Keywords Fleet -->
          <a
            href="/keywords"
            class="relative flex items-center rounded-xl text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 ${keywordsActive}"
            :class="isSidebarCollapsed ? 'w-10 h-10 justify-center' : 'w-full justify-between px-3 py-2.5'"
            title="Keywords Fleet">
            <div class="flex items-center" :class="isSidebarCollapsed ? 'justify-center' : 'space-x-2.5'">
              <i data-lucide="search" class="w-4 h-4 shrink-0 ${isKeywords ? iconActive : iconInactive}"></i>
              <span x-show="!isSidebarCollapsed" class="truncate">Keywords Fleet</span>
            </div>
            <span x-show="!isSidebarCollapsed && (typeof keywords !== 'undefined' && keywords && keywords.length > 0)" class="${isKeywords ? badgeActive : badgeInactive}" x-text="(typeof keywords !== 'undefined' && keywords) ? keywords.length : ''"></span>
            <span x-show="!isSidebarCollapsed && (typeof keywords === 'undefined' || !keywords || !keywords.length)" class="${isKeywords ? badgeActive : badgeInactive}">SERP</span>
            <span x-show="isSidebarCollapsed && (typeof keywords !== 'undefined' && keywords && keywords.length > 0)" class="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 shadow-xs"></span>
          </a>

          <!-- Domain Radar -->
          <a
            href="/domains"
            class="relative flex items-center rounded-xl text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 ${domainsActive}"
            :class="isSidebarCollapsed ? 'w-10 h-10 justify-center' : 'w-full justify-between px-3 py-2.5'"
            title="Domain Radar">
            <div class="flex items-center" :class="isSidebarCollapsed ? 'justify-center' : 'space-x-2.5'">
              <i data-lucide="globe" class="w-4 h-4 shrink-0 ${isDomains ? iconActive : iconInactive}"></i>
              <span x-show="!isSidebarCollapsed" class="truncate">Domain Radar</span>
            </div>
            <span x-show="!isSidebarCollapsed && (typeof overview !== 'undefined' && overview && overview.total_domains > 0)" class="${isDomains ? badgeActive : badgeInactive}" x-text="(typeof overview !== 'undefined' && overview) ? overview.total_domains : ''"></span>
            <span x-show="!isSidebarCollapsed && (typeof overview === 'undefined' || !overview || !overview.total_domains)" class="${isDomains ? badgeActive : badgeInactive}">WHOIS</span>
            ${isDomains ? '<span x-show="isSidebarCollapsed" class="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 shadow-xs"></span>' : ''}
          </a>

          <!-- Related Pins -->
          ${isDashboardSpa ? `
          <button
            type="button"
            @click="switchTab('related_pins')"
            class="relative flex items-center rounded-xl text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 cursor-pointer"
            :class="[
              isSidebarCollapsed ? 'w-10 h-10 justify-center' : 'w-full justify-between px-3 py-2.5',
              ${spaRelatedExpr} ? '${activeClass}' : '${inactiveClass}'
            ]"
            title="Related Pins">
            <div class="flex items-center" :class="isSidebarCollapsed ? 'justify-center' : 'space-x-2.5'">
              <i data-lucide="git-fork" class="w-4 h-4 shrink-0" :class="${spaRelatedExpr} ? '${iconActive}' : '${iconInactive}'"></i>
              <span x-show="!isSidebarCollapsed" class="truncate">Related Pins</span>
            </div>
            <div x-show="!isSidebarCollapsed" class="flex items-center space-x-1 font-mono tabular-nums">
              <span :class="${spaRelatedExpr} ? '${badgeActive}' : '${badgeInactive}'" x-text="((overview && overview.total_seeds) || seeds.length) + 's'"></span>
              <span class="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300" x-text="((overview && overview.intersecting_hubs_count) || intersections.length) + 'i'"></span>
            </div>
            <span x-show="isSidebarCollapsed && (((overview && overview.total_seeds > 0) || seeds.length > 0) || ((overview && overview.intersecting_hubs_count > 0) || intersections.length > 0))" class="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500"></span>
          </button>` : `
          <a
            href="/related-pins"
            class="relative flex items-center rounded-xl text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 ${relatedActive}"
            :class="isSidebarCollapsed ? 'w-10 h-10 justify-center' : 'w-full justify-between px-3 py-2.5'"
            title="Related Pins">
            <div class="flex items-center" :class="isSidebarCollapsed ? 'justify-center' : 'space-x-2.5'">
              <i data-lucide="git-fork" class="w-4 h-4 shrink-0 ${isRelated ? iconActive : iconInactive}"></i>
              <span x-show="!isSidebarCollapsed" class="truncate">Related Pins</span>
            </div>
            <span x-show="!isSidebarCollapsed" class="${isRelated ? badgeActive : badgeInactive}">Graph</span>
            ${isRelated ? '<span x-show="isSidebarCollapsed" class="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 shadow-xs"></span>' : ''}
          </a>`}
        </div>

        <!-- SECTION 3: CAMPAIGNS -->
        <div class="space-y-1 w-full">
          <div x-show="!isSidebarCollapsed" class="px-3 pt-2 pb-1 text-[10px] font-mono uppercase tracking-wider text-slate-400 dark:text-[#71717A] font-bold">
            Campaigns
          </div>
          <div x-show="isSidebarCollapsed" class="w-8 mx-auto my-1 border-t border-slate-200 dark:border-[#27272A]"></div>

          <!-- Campaign Folders -->
          <a
            href="/folders"
            class="relative flex items-center rounded-xl text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 ${foldersActive}"
            :class="isSidebarCollapsed ? 'w-10 h-10 justify-center' : 'w-full justify-between px-3 py-2.5'"
            title="Campaign Folders">
            <div class="flex items-center" :class="isSidebarCollapsed ? 'justify-center' : 'space-x-2.5'">
              <i data-lucide="folder-kanban" class="w-4 h-4 shrink-0 ${isFolders ? iconActive : iconInactive}"></i>
              <span x-show="!isSidebarCollapsed" class="truncate">Campaign Folders</span>
            </div>
            <span x-show="!isSidebarCollapsed && ((typeof foldersList !== 'undefined' && foldersList && foldersList.length > 0) || (typeof folders !== 'undefined' && folders && folders.length > 0))" class="${isFolders ? badgeActive : badgeInactive}" x-text="(typeof foldersList !== 'undefined' && foldersList && foldersList.length > 0) ? foldersList.length : ((typeof folders !== 'undefined' && folders) ? folders.length : '')"></span>
            <span x-show="!isSidebarCollapsed && !(typeof foldersList !== 'undefined' && foldersList && foldersList.length > 0) && !(typeof folders !== 'undefined' && folders && folders.length > 0)" class="${isFolders ? badgeActive : badgeInactive}">Clusters</span>
            ${isFolders ? '<span x-show="isSidebarCollapsed" class="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 shadow-xs"></span>' : ''}
          </a>
        </div>
      </nav>
    </div>

    <!-- Bottom Footer Section: Auth Status (TopBar is SSOT for theme/refresh when visible) -->
    <div class="border-t border-slate-200/80 dark:border-[#27272A] bg-slate-50/60 dark:bg-[#09090B]/60 transition-all duration-300" :class="isSidebarCollapsed ? 'p-3 space-y-2' : 'p-4 space-y-3'">
      ${renderFooterStatus(false)}

      ${!showTopbar ? `
      <!-- Theme Switcher & Refresh Buttons (Fallback when Topbar is hidden) -->
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
          placeholder="Search keywords, @creators, folders, domains, or paste Pin ID..."
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
            <span>Type at least <strong class="text-slate-700 dark:text-slate-200 font-mono">2</strong> characters to search keywords, creators, folders &amp; domains</span>
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
                      <!-- Avatar for Creator if available -->
                      <template x-if="item.kind === 'creator' && safeAvatarUrl(item.avatarUrl)">
                        <img :src="safeAvatarUrl(item.avatarUrl)" alt="" class="w-6 h-6 rounded-full object-cover border border-slate-200 dark:border-[#27272A] shrink-0" referrerpolicy="no-referrer" />
                      </template>
                      <!-- Folder Color Swatch -->
                      <template x-if="item.kind === 'folder'">
                        <span class="w-6 h-6 rounded-lg flex items-center justify-center border border-slate-200 dark:border-white/10 shrink-0 text-[11px] font-bold"
                              :style="'background-color:' + safeFolderColor(item.color) + '22; color:' + safeFolderColor(item.color)">📁</span>
                      </template>
                      <!-- Badge Icon for Keyword / Domain / Action / Creator fallback -->
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

            <!-- Empty results state (still shows Filter-in-Studio rows above) -->
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
        <span class="text-rose-600 dark:text-rose-400 font-bold">PAE Shell V3</span>
      </div>
    </div>
  </div>

${renderClientJsScriptTag('command-palette')}
`;
}

export function getAppSidebarClientScriptCode() {
  return `
  <script>
    (function() {
      var STATIC_STUDIO_ITEMS = [
        { groupKey: 'exec', groupTitle: 'Executive Studios', uid: 'static-overview', kind: 'static', title: 'Overview & Hub', metric: '/', iconGlyph: 'O', iconClass: 'bg-slate-100 dark:bg-[#18181B] text-slate-500 border border-slate-200 dark:border-[#27272A]', url: '/' },
        { groupKey: 'exec', groupTitle: 'Executive Studios', uid: 'static-pulse', kind: 'static', title: '24h Pulse Studio', metric: 'Live', badgeClass: 'text-rose-500 font-semibold', iconGlyph: 'P', iconClass: 'bg-rose-500/10 text-rose-500 border border-rose-500/20', url: '/pulse' },
        { groupKey: 'exec', groupTitle: 'Executive Studios', uid: 'static-newborn', kind: 'static', title: 'Newborn Breakout Hunter', metric: '/newborn', badgeClass: 'text-rose-600 dark:text-rose-400 font-semibold', iconGlyph: 'N', iconClass: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20', url: '/newborn' },
        { groupKey: 'intel', groupTitle: 'Intelligence Fleet', uid: 'static-accounts', kind: 'static', title: 'Creator Hub', metric: '/accounts', iconGlyph: '@', iconClass: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20', url: '/accounts' },
        { groupKey: 'intel', groupTitle: 'Intelligence Fleet', uid: 'static-keywords', kind: 'static', title: 'Keywords Fleet', metric: '/keywords', iconGlyph: 'K', iconClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20', url: '/keywords' },
        { groupKey: 'intel', groupTitle: 'Intelligence Fleet', uid: 'static-domains', kind: 'static', title: 'Domain Radar', metric: '/domains', iconGlyph: 'D', iconClass: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20', url: '/domains' },
        { groupKey: 'intel', groupTitle: 'Intelligence Fleet', uid: 'static-related', kind: 'static', title: 'Related Pins', metric: '/related-pins', iconGlyph: 'R', iconClass: 'bg-slate-100 dark:bg-[#18181B] text-slate-500 border border-slate-200 dark:border-[#27272A]', url: '/related-pins' },
        { groupKey: 'intel', groupTitle: 'Intelligence Fleet', uid: 'static-folders', kind: 'static', title: 'Campaign Folders', metric: '/folders', iconGlyph: 'F', iconClass: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20', url: '/folders' },
        { groupKey: 'intel', groupTitle: 'Intelligence Fleet', uid: 'static-discovery', kind: 'static', title: 'Keyword Discovery', metric: '/discovery', iconGlyph: '?', iconClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20', url: '/discovery' }
      ];

      function formatCompactNum(val) {
        var n = Number(val || 0);
        if (!isFinite(n) || n <= 0) return '0';
        if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/[.]0$/, '') + 'M';
        if (n >= 1000) return (n / 1000).toFixed(1).replace(/[.]0$/, '') + 'K';
        return String(Math.round(n));
      }

      if (typeof window !== 'undefined' && typeof window.paeCommandPalette !== 'function') {
        window.paeCommandPalette = function() {
          return {
            isCommandOpen: false,
            cmdQuery: '',
            cmdLoading: false,
            cmdHasQueried: false,
            cmdError: '',
            cmdActiveIndex: 0,
            cmdResults: { keywords: [], creators: [], folders: [], domains: [] },
            _cmdTimer: null,
            _cmdAbort: null,
            _cmdSeq: 0,
            _cmdCache: new Map(),

            get cmdTrimmed() {
              return String(this.cmdQuery || '').trim();
            },

            get cmdTotalMatches() {
              var r = this.cmdResults || {};
              return (r.keywords ? r.keywords.length : 0) +
                (r.creators ? r.creators.length : 0) +
                (r.folders ? r.folders.length : 0) +
                (r.domains ? r.domains.length : 0);
            },

            cmdSafeUrl(url) {
              if (!url || typeof url !== 'string') return '#';
              var s = url.trim();
              if (s.startsWith('/') && !s.startsWith('//') && s.charCodeAt(1) !== 92) {
                return s;
              }
              return '#';
            },

            safeAvatarUrl(url) {
              if (!url || typeof url !== 'string') return '';
              var s = url.trim();
              if (/^https?:[/][/]/i.test(s)) return s;
              return '';
            },

            safeFolderColor(color) {
              if (!color || typeof color !== 'string') return '#6366f1';
              var s = color.trim();
              return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(s) ? s : '#6366f1';
            },

            get staticCmdSections() {
              var execItems = [];
              var intelItems = [];
              for (var i = 0; i < STATIC_STUDIO_ITEMS.length; i++) {
                var item = Object.assign({}, STATIC_STUDIO_ITEMS[i], { idx: i });
                if (item.groupKey === 'exec') execItems.push(item);
                else intelItems.push(item);
              }
              return [
                { key: 'exec', title: 'Executive Studios', items: execItems },
                { key: 'intel', title: 'Intelligence Fleet', items: intelItems }
              ];
            },

            get groupedCmdSections() {
              var q = this.cmdTrimmed;
              if (!q) return [];
              var idx = 0;
              var sections = [];
              var res = this.cmdResults || { keywords: [], creators: [], folders: [], domains: [] };

              // 1. Direct Smart Jump (Pin ID or Domain literal)
              var directItems = [];
              if (/^[0-9]{10,30}$/.test(q)) {
                directItems.push({
                  uid: 'direct-pin-' + q,
                  idx: idx++,
                  kind: 'action',
                  title: 'Inspect Pin #' + q,
                  subtitle: 'Open Pin Dossier Studio',
                  metric: 'Pin ID',
                  iconGlyph: '#',
                  iconClass: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30',
                  url: '/pin/' + encodeURIComponent(q)
                });
              } else if (q.indexOf('.') !== -1 && q.indexOf(' ') === -1) {
                var qLowerDom = q.toLowerCase().replace(/^https?:[/][/]/i, '').replace(/^www[.]/i, '').split('/')[0];
                var hasExactDom = (res.domains || []).some(function(d) { return String(d.domain || '').toLowerCase() === qLowerDom; });
                if (!hasExactDom && qLowerDom.indexOf('.') !== -1) {
                  directItems.push({
                    uid: 'direct-domain-' + qLowerDom,
                    idx: idx++,
                    kind: 'action',
                    title: 'Open Domain Dossier: ' + qLowerDom,
                    subtitle: 'Direct domain intelligence lookup',
                    metric: 'Domain',
                    iconGlyph: 'D',
                    iconClass: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30',
                    url: '/domains/' + encodeURIComponent(qLowerDom)
                  });
                }
              }
              if (directItems.length > 0) {
                sections.push({
                  key: 'direct',
                  title: 'Direct Jump',
                  badge: '',
                  headerClass: 'text-rose-600 dark:text-rose-400',
                  items: directItems
                });
              }

              // 2. Keywords
              if (Array.isArray(res.keywords) && res.keywords.length > 0) {
                var kwItems = res.keywords.map(function(k) {
                  var vel = Number(k.avg_daily_velocity || 0);
                  var pins = Number(k.active_pin_count || 0);
                  return {
                    uid: 'kw-' + k.id,
                    idx: idx++,
                    kind: 'keyword',
                    isActive: k.is_active !== false,
                    title: k.keyword,
                    subtitle: (k.category || 'General') + (vel > 0 ? (' · ' + vel.toFixed(0) + '/d vel') : ''),
                    metric: pins + ' pins',
                    iconGlyph: 'K',
                    iconClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
                    url: k.url
                  };
                });
                sections.push({
                  key: 'keywords',
                  title: 'Keywords',
                  badge: kwItems.length + ' match' + (kwItems.length === 1 ? '' : 'es'),
                  headerClass: 'text-emerald-600 dark:text-emerald-400',
                  items: kwItems
                });
              }

              // 3. Creators & Accounts
              if (Array.isArray(res.creators) && res.creators.length > 0) {
                var crItems = res.creators.map(function(c) {
                  var reach = Number(c.monthly_reach || 0);
                  return {
                    uid: 'cr-' + c.id,
                    idx: idx++,
                    kind: 'creator',
                    avatarUrl: c.avatar_url || '',
                    title: c.display_name || ('@' + c.username),
                    subtitle: '@' + c.username + (c.total_pins ? (' · ' + formatCompactNum(c.total_pins) + ' pins') : ''),
                    metric: reach > 0 ? (formatCompactNum(reach) + ' reach') : 'Creator',
                    iconGlyph: '@',
                    iconClass: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30',
                    url: c.url
                  };
                });
                sections.push({
                  key: 'creators',
                  title: 'Creators & Accounts',
                  badge: crItems.length + ' match' + (crItems.length === 1 ? '' : 'es'),
                  headerClass: 'text-purple-600 dark:text-purple-400',
                  items: crItems
                });
              }

              // 4. Campaign Folders
              if (Array.isArray(res.folders) && res.folders.length > 0) {
                var flItems = res.folders.map(function(f) {
                  return {
                    uid: 'fl-' + f.id,
                    idx: idx++,
                    kind: 'folder',
                    color: f.color || '#6366f1',
                    title: f.name,
                    subtitle: f.description || 'Campaign cluster workspace',
                    metric: (f.keyword_count || 0) + ' kw',
                    iconGlyph: 'F',
                    iconClass: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30',
                    url: f.url
                  };
                });
                sections.push({
                  key: 'folders',
                  title: 'Campaign Folders',
                  badge: flItems.length + ' match' + (flItems.length === 1 ? '' : 'es'),
                  headerClass: 'text-indigo-600 dark:text-indigo-400',
                  items: flItems
                });
              }

              // 5. Domains
              if (Array.isArray(res.domains) && res.domains.length > 0) {
                var domItems = res.domains.map(function(d) {
                  var adBadge = d.ad_network && d.ad_network !== 'unchecked' ? d.ad_network : '';
                  var ageText = d.age_years != null ? (Number(d.age_years).toFixed(1) + 'y') : '';
                  var subParts = [d.total_pins + ' pins'];
                  if (adBadge) subParts.push(adBadge);
                  if (ageText) subParts.push(ageText);
                  return {
                    uid: 'dom-' + d.domain,
                    idx: idx++,
                    kind: 'domain',
                    title: d.domain,
                    subtitle: subParts.join(' · '),
                    metric: formatCompactNum(d.total_saves) + ' saves',
                    iconGlyph: 'G',
                    iconClass: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30',
                    url: d.url
                  };
                });
                sections.push({
                  key: 'domains',
                  title: 'Domains',
                  badge: domItems.length + ' match' + (domItems.length === 1 ? '' : 'es'),
                  headerClass: 'text-sky-600 dark:text-sky-400',
                  items: domItems
                });
              }

              // 6. Search-in-Studio Fallbacks
              if (q.length >= 2) {
                var enc = encodeURIComponent(q);
                var encCreator = encodeURIComponent(q.replace(/^@+/, ''));
                sections.push({
                  key: 'fallbacks',
                  title: 'Filter In Studio',
                  badge: '',
                  headerClass: 'text-slate-400 dark:text-[#71717A]',
                  items: [
                    {
                      uid: 'fb-newborn',
                      idx: idx++,
                      kind: 'action',
                      title: 'Hunt or Filter Newborn Studio for "' + q + '"',
                      subtitle: '/newborn?search=' + enc,
                      metric: 'Newborn',
                      iconGlyph: 'N',
                      iconClass: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
                      url: '/newborn?search=' + enc
                    },
                    {
                      uid: 'fb-keywords',
                      idx: idx++,
                      kind: 'action',
                      title: 'Filter Keywords Fleet for "' + q + '"',
                      subtitle: '/keywords?search=' + enc,
                      metric: 'Keywords',
                      iconGlyph: 'K',
                      iconClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
                      url: '/keywords?search=' + enc
                    },
                    {
                      uid: 'fb-creators',
                      idx: idx++,
                      kind: 'action',
                      title: 'Filter Creator Hub for "' + q + '"',
                      subtitle: '/accounts?search=' + encCreator,
                      metric: 'Creators',
                      iconGlyph: '@',
                      iconClass: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
                      url: '/accounts?search=' + encCreator
                    },
                    {
                      uid: 'fb-domains',
                      idx: idx++,
                      kind: 'action',
                      title: 'Filter Domain Radar for "' + q + '"',
                      subtitle: '/domains?search=' + enc,
                      metric: 'Domains',
                      iconGlyph: 'D',
                      iconClass: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20',
                      url: '/domains?search=' + enc
                    },
                    {
                      uid: 'fb-folders',
                      idx: idx++,
                      kind: 'action',
                      title: 'Filter Campaign Folders for "' + q + '"',
                      subtitle: '/folders?search=' + enc,
                      metric: 'Folders',
                      iconGlyph: 'F',
                      iconClass: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
                      url: '/folders?search=' + enc
                    }
                  ]
                });
              }

              return sections;
            },

            get flatCmdItems() {
              var sections = this.cmdTrimmed.length > 0 ? this.groupedCmdSections : this.staticCmdSections;
              var flat = [];
              for (var i = 0; i < sections.length; i++) {
                var items = sections[i].items || [];
                for (var j = 0; j < items.length; j++) {
                  flat.push(items[j]);
                }
              }
              return flat;
            },

            openCmd() {
              this.isCommandOpen = true;
              this.cmdQuery = '';
              this.cmdLoading = false;
              this.cmdHasQueried = false;
              this.cmdError = '';
              this.cmdActiveIndex = 0;
              this.cmdResults = { keywords: [], creators: [], folders: [], domains: [] };
              this.$nextTick(function() {
                var el = document.getElementById('pae-global-cmd-input');
                if (el) el.focus();
                if (typeof window !== 'undefined' && window.lucide && typeof window.lucide.createIcons === 'function') {
                  window.lucide.createIcons();
                }
              });
            },

            closeCmd() {
              this.isCommandOpen = false;
              this.cmdQuery = '';
              this.cmdLoading = false;
              this.cmdHasQueried = false;
              this.cmdError = '';
              this.cmdActiveIndex = 0;
              this.cmdResults = { keywords: [], creators: [], folders: [], domains: [] };
              if (this._cmdTimer) {
                clearTimeout(this._cmdTimer);
                this._cmdTimer = null;
              }
              if (this._cmdAbort) {
                try { this._cmdAbort.abort(); } catch (_) {}
                this._cmdAbort = null;
              }
            },

            clearCmdQuery() {
              this.cmdQuery = '';
              this.onCmdInput();
              this.$nextTick(function() {
                var el = document.getElementById('pae-global-cmd-input');
                if (el) el.focus();
              });
            },

            onCmdInput() {
              var self = this;
              var q = this.cmdTrimmed;
              this.cmdError = '';
              this.cmdActiveIndex = 0;
              if (this._cmdTimer) {
                clearTimeout(this._cmdTimer);
                this._cmdTimer = null;
              }
              if (this._cmdAbort) {
                try { this._cmdAbort.abort(); } catch (_) {}
                this._cmdAbort = null;
              }

              var effectiveLen = q.indexOf('@') === 0 ? q.replace(/^@+/, '').trim().length : q.length;
              if (!q || effectiveLen < 2 || /^[0-9]{10,30}$/.test(q)) {
                this.cmdLoading = false;
                this.cmdHasQueried = false;
                this.cmdResults = { keywords: [], creators: [], folders: [], domains: [] };
                return;
              }

              var cacheKey = q.toLowerCase();
              var cached = this._cmdCache.get(cacheKey);
              if (cached && (Date.now() - cached.ts) < 30000) {
                this.cmdLoading = false;
                this.cmdHasQueried = true;
                this.cmdResults = cached.entities;
                this.cmdActiveIndex = 0;
                return;
              }

              this.cmdLoading = true;
              var seq = ++this._cmdSeq;
              this._cmdTimer = setTimeout(function() {
                self.fetchCmdSuggestions(q, seq);
              }, 180);
            },

            async fetchCmdSuggestions(q, seq) {
              var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
              this._cmdAbort = controller;
              try {
                var fetchOpts = { headers: { 'Accept': 'application/json' } };
                if (controller) fetchOpts.signal = controller.signal;
                var res = await (window.apiFetch || fetch)('/api/search/autocomplete?q=' + encodeURIComponent(q) + '&limit=5', fetchOpts);
                if (!res.ok) throw new Error('HTTP ' + res.status);
                var data = await res.json();
                if (seq !== this._cmdSeq || this.cmdTrimmed.toLowerCase() !== q.toLowerCase()) return;
                var entities = (data && data.entities) ? data.entities : {
                  keywords: Array.isArray(data?.results) ? data.results.map(function(r) {
                    return { id: r.id || r.keyword, keyword: r.keyword, url: r.url || ('/keywords/' + encodeURIComponent(String(r.keyword || '').toLowerCase().trim().split(' ').filter(Boolean).join('-'))), active_pin_count: r.active_pin_count || r.pin_count || 0, avg_daily_velocity: r.avg_daily_velocity || 0, is_active: r.is_active !== false };
                  }) : [],
                  creators: [],
                  folders: [],
                  domains: []
                };
                if (this._cmdCache.size >= 50) {
                  var firstKey = this._cmdCache.keys().next().value;
                  if (firstKey !== undefined) this._cmdCache.delete(firstKey);
                }
                this._cmdCache.set(q.toLowerCase(), { ts: Date.now(), entities: entities });
                this.cmdResults = entities;
                this.cmdHasQueried = true;
                this.cmdActiveIndex = 0;
              } catch (err) {
                if (err && err.name === 'AbortError') return;
                if (seq !== this._cmdSeq) return;
                this.cmdError = 'Live search unavailable — use studio filter links below.';
              } finally {
                if (seq === this._cmdSeq) {
                  this.cmdLoading = false;
                }
              }
            },

            moveCmdSelection(delta) {
              var items = this.flatCmdItems;
              if (!items || items.length === 0) return;
              var next = (this.cmdActiveIndex + delta + items.length) % items.length;
              this.cmdActiveIndex = next;
              this.$nextTick(function() {
                if (typeof document !== 'undefined') {
                  var el = document.querySelector('[data-cmd-idx="' + next + '"]');
                  if (el && typeof el.scrollIntoView === 'function') {
                    el.scrollIntoView({ block: 'nearest' });
                  }
                }
              });
            },

            navigateToCmdUrl(url) {
              var safe = this.cmdSafeUrl(url);
              if (safe && safe !== '#') {
                this.closeCmd();
                if (typeof window !== 'undefined') {
                  window.location.href = safe;
                }
              }
            },

            handleCmdSubmit() {
              var items = this.flatCmdItems;
              if (items && items.length > 0 && items[this.cmdActiveIndex]) {
                this.navigateToCmdUrl(items[this.cmdActiveIndex].url);
                return;
              }
              var q = this.cmdTrimmed;
              if (!q) return;
              if (/^[0-9]{10,30}$/.test(q)) {
                this.navigateToCmdUrl('/pin/' + encodeURIComponent(q));
              } else if (q.indexOf('.') !== -1 && q.indexOf(' ') === -1) {
                this.navigateToCmdUrl('/domains/' + encodeURIComponent(q));
              } else {
                this.navigateToCmdUrl('/keywords?search=' + encodeURIComponent(q));
              }
            }
          };
        };
      }
    })();
  </script>

  <script>
    (function() {
      var _iconTimer = null;
      var _iconRaf = null;
      var _lastIconRunTs = 0;

      function runLucidePass() {
        _iconTimer = null;
        _iconRaf = null;
        if (typeof window === 'undefined' || !window.lucide || typeof window.lucide.createIcons !== 'function') {
          return;
        }
        if (typeof document !== 'undefined' && typeof document.querySelector === 'function') {
          var pendingIcon = document.querySelector('i[data-lucide], [data-lucide]:not(svg)');
          if (!pendingIcon) return;
        }
        _lastIconRunTs = Date.now();
        window.lucide.createIcons();
      }

      function refreshAppSidebarIcons() {
        if (typeof window === 'undefined') return;
        if (_iconTimer !== null && typeof clearTimeout === 'function') {
          clearTimeout(_iconTimer);
          _iconTimer = null;
        }
        if (_iconRaf !== null && typeof cancelAnimationFrame === 'function') {
          cancelAnimationFrame(_iconRaf);
          _iconRaf = null;
        }
        var now = Date.now();
        var elapsed = now - _lastIconRunTs;
        if (elapsed >= 60 && typeof requestAnimationFrame === 'function') {
          _iconRaf = requestAnimationFrame(runLucidePass);
        } else if (typeof setTimeout === 'function') {
          _iconTimer = setTimeout(runLucidePass, 60);
        } else {
          runLucidePass();
        }
      }

      if (typeof window !== 'undefined') {
        if (window.PAE && !window.PAE.refreshIcons) {
          window.PAE.refreshIcons = refreshAppSidebarIcons;
        }
        if (window.__paeSidebarBootstrapped) {
          refreshAppSidebarIcons();
          return;
        }
        window.__paeSidebarBootstrapped = true;
      }

      if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', refreshAppSidebarIcons, { once: true });
        } else {
          refreshAppSidebarIcons();
        }
        if (typeof window !== 'undefined') {
          window.addEventListener('load', refreshAppSidebarIcons, { once: true });
          window.addEventListener('keydown', function(e) {
            if ((e.metaKey || e.ctrlKey) && (e.key === 'b' || e.key === 'B')) {
              var activeEl = document.activeElement;
              var tag = activeEl && activeEl.tagName ? String(activeEl.tagName).toUpperCase() : '';
              if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (activeEl && activeEl.isContentEditable)) {
                return;
              }
              e.preventDefault();
              if (window.Alpine && typeof window.Alpine.$data === 'function') {
                var el = document.querySelector('[x-data]');
                if (el) {
                  var data = window.Alpine.$data(el);
                  if (data && typeof data.toggleSidebar === 'function') {
                    data.toggleSidebar();
                  }
                }
              }
            }
          });
        }
        document.addEventListener('alpine:initialized', refreshAppSidebarIcons, { once: true });
      }
    })();
  </script>
`;
}
