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

export function renderAppTopbar({
  activeNav = 'overview',
  refreshHandler = 'window.location.reload()',
  isDashboardSpa = false
} = {}) {
  const darkExpr = `(typeof isDark !== 'undefined' ? isDark : (typeof darkMode !== 'undefined' ? darkMode : false))`;
  const loadingSpinAttr = isDashboardSpa ? ` :class="{'animate-spin': isLoading}"` : '';
  const disabledRefreshAttr = isDashboardSpa ? ` :disabled="isLoading"` : '';

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
        <i x-show="!isSidebarCollapsed" data-lucide="chevrons-left" class="w-4 h-4"></i>
        <i x-show="isSidebarCollapsed" data-lucide="chevrons-right" class="w-4 h-4"></i>
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

    <!-- Right: Timeframe Selector (24h, 5d, 7d, 15d) & Global Shell Controls -->
    <div class="flex items-center gap-2.5 shrink-0">
      <!-- Bento Timeframe Selector Pill Bar [INVARIANT: TIMEFRAME-SELECTOR-PARITY] -->
      <div
        class="flex items-center p-0.5 rounded-xl bg-slate-100/80 dark:bg-[#18181B] border border-slate-200/80 dark:border-[#27272A] shadow-2xs"
        x-data="{
          activeTf: (typeof selectedTimeWindow !== 'undefined' ? selectedTimeWindow : (typeof chartTimeframe !== 'undefined' ? chartTimeframe : ((typeof localStorage !== 'undefined' && localStorage.getItem('pae_timeframe')) || '24h'))),
          setShellTf(tf) {
            this.activeTf = tf;
            if (typeof selectedTimeWindow !== 'undefined') { selectedTimeWindow = tf; }
            if (typeof chartTimeframe !== 'undefined') {
              chartTimeframe = tf;
              if (typeof updateChartTimeframe === 'function') updateChartTimeframe(tf);
            }
            try {
              if (typeof localStorage !== 'undefined') localStorage.setItem('pae_timeframe', tf);
            } catch (_) {}
            window.dispatchEvent(new CustomEvent('pae:timeframe-changed', { detail: { timeframe: tf } }));
          }
        }"
        @pae:timeframe-changed.window="activeTf = $event.detail.timeframe">
        <template x-for="tf in ['24h', '5d', '7d', '15d']" :key="tf">
          <button
            type="button"
            @click="setShellTf(tf)"
            :class="activeTf === tf ? 'bg-white dark:bg-[#27272A] text-rose-600 dark:text-rose-400 font-bold shadow-xs border border-slate-200/60 dark:border-transparent' : 'text-slate-500 dark:text-[#71717A] hover:text-slate-900 dark:hover:text-[#FAFAFA] border border-transparent'"
            class="px-2.5 py-1 text-xs font-mono tabular-nums rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 cursor-pointer"
            :title="'Switch to ' + tf + ' analytics window'"
            x-text="tf">
          </button>
        </template>
      </div>

      <!-- Quick Action: Track Creator CTA -->
      ${isDashboardSpa ? `
      <button
        type="button"
        @click="openAddCompetitorModal()"
        class="hidden xl:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-rose-600 hover:bg-rose-500 text-white shadow-xs border border-rose-500/30 transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
        title="Track New Competitor Creator">
        <i data-lucide="user-plus" class="w-3.5 h-3.5"></i>
        <span>Track</span>
      </button>` : `
      <a
        href="/accounts?action=new"
        class="hidden xl:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-rose-600 hover:bg-rose-500 text-white shadow-xs border border-rose-500/30 transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
        title="Track New Competitor Creator">
        <i data-lucide="user-plus" class="w-3.5 h-3.5"></i>
        <span>Track</span>
      </a>`}

      <div class="h-4 w-px bg-slate-200 dark:bg-[#27272A] mx-0.5"></div>

      <!-- Theme Switcher -->
      <button
        type="button"
        @click="toggleTheme()"
        class="p-2 rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] text-slate-600 hover:text-slate-900 dark:text-[#A1A1AA] dark:hover:text-[#FAFAFA] hover:bg-slate-100 dark:hover:bg-[#27272A] transition active:scale-95 shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 cursor-pointer"
        :title="${darkExpr} ? 'Switch to Light Mode' : 'Switch to Dark Mode'"
        aria-label="Toggle color theme">
        <i x-show="!${darkExpr}" data-lucide="moon" class="w-4 h-4"></i>
        <i x-show="${darkExpr}" data-lucide="sun" class="w-4 h-4"></i>
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
  activeNav = 'overview', // 'overview' | 'pulse' | 'creators' | 'keywords' | 'domains' | 'related_pins' | 'folders'
  refreshHandler = 'window.location.reload()',
  isDashboardSpa = false,
  showTopbar = true
} = {}) {
  const isOverview = activeNav === 'overview';
  const isPulse = activeNav === 'pulse' || activeNav === '24h';
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
          <span class="flex items-center truncate font-mono tabular-nums" ${isMobile ? 'class="space-x-2"' : ':class="isSidebarCollapsed ? \'justify-center\' : \'space-x-2\'"'}>
            <span class="w-2 h-2 rounded-full shrink-0" :class="cookieStatus.has_cookie ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'"></span>
            <span ${isMobile ? '' : 'x-show="!isSidebarCollapsed" '}class="truncate text-[11px]" x-text="cookieStatus.has_cookie ? '${isMobile ? 'Session: Authenticated' : 'Pinterest: Authenticated'}' : 'Guest Mode (No Cookie)'"></span>
          </span>
          <i ${isMobile ? '' : 'x-show="!isSidebarCollapsed" '}data-lucide="key" class="w-3.5 h-3.5 shrink-0 opacity-70"></i>
        </button>
  ` : `
        <div
          class="flex items-center rounded-xl border bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-400 font-mono tabular-nums"
          ${isMobile ? 'class="w-full justify-between px-3 py-2 text-xs font-semibold"' : ':class="isSidebarCollapsed ? \'w-10 h-10 p-0 justify-center mx-auto\' : \'w-full justify-between px-3 py-2 text-xs font-semibold\'"'}
          title="PAE Distributed System: Active">
          <span class="flex items-center truncate" ${isMobile ? 'class="space-x-2"' : ':class="isSidebarCollapsed ? \'justify-center\' : \'space-x-2\'"'}>
            <span class="w-2 h-2 rounded-full shrink-0 bg-emerald-500 motion-safe:animate-pulse"></span>
            <span ${isMobile ? '' : 'x-show="!isSidebarCollapsed" '}class="truncate text-[11px]">System: Operational</span>
          </span>
          <i ${isMobile ? '' : 'x-show="!isSidebarCollapsed" '}data-lucide="shield-check" class="w-3.5 h-3.5 shrink-0 opacity-70"></i>
        </div>
  `;

  return `
  <!-- Mobile Top Header (Visible on screens < md) [INVARIANT: UNIFIED-SIDEBAR-LAYOUT] -->
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
  </header>

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

      <!-- Mobile Quick Actions -->
      <div class="space-y-1.5">
        ${isDashboardSpa ? `
        <button type="button" @click="openAddCompetitorModal(); isMobileMenuOpen = false" class="w-full flex items-center justify-center space-x-2 px-3 py-2 text-xs font-semibold rounded-xl bg-rose-600 hover:bg-rose-500 text-white shadow-xs border border-rose-500/30 active:scale-95 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 cursor-pointer">
          <i data-lucide="user-plus" class="w-3.5 h-3.5"></i>
          <span>+ Track Creator</span>
        </button>
        <div class="grid grid-cols-2 gap-1.5">
          <button type="button" @click="openAddSeedModal(); isMobileMenuOpen = false" class="flex items-center justify-center space-x-1 px-2.5 py-1.5 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-slate-700 dark:text-[#FAFAFA] border border-slate-200 dark:border-[#27272A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 cursor-pointer">
            <i data-lucide="plus-circle" class="w-3 h-3 text-rose-500"></i>
            <span>Add Seeds</span>
          </button>
          <button type="button" @click="openCrawlModal(); isMobileMenuOpen = false" class="flex items-center justify-center space-x-1 px-2.5 py-1.5 text-xs font-bold rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-amber-600 dark:text-amber-400 border border-slate-200 dark:border-[#27272A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 cursor-pointer">
            <i data-lucide="zap" class="w-3 h-3"></i>
            <span>Crawl</span>
          </button>
        </div>` : `
        <a href="/accounts?action=new" class="w-full flex items-center justify-center space-x-2 px-3 py-2 text-xs font-semibold rounded-xl bg-rose-600 hover:bg-rose-500 text-white shadow-xs border border-rose-500/30 active:scale-95 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">
          <i data-lucide="user-plus" class="w-3.5 h-3.5"></i>
          <span>+ Track Creator</span>
        </a>
        <div class="grid grid-cols-2 gap-1.5">
          <a href="/related-pins" class="flex items-center justify-center space-x-1 px-2.5 py-1.5 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-slate-700 dark:text-[#FAFAFA] border border-slate-200 dark:border-[#27272A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">
            <i data-lucide="plus-circle" class="w-3 h-3 text-rose-500"></i>
            <span>Add Seeds</span>
          </a>
          <a href="/" class="flex items-center justify-center space-x-1 px-2.5 py-1.5 text-xs font-bold rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-amber-600 dark:text-amber-400 border border-slate-200 dark:border-[#27272A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">
            <i data-lucide="zap" class="w-3 h-3"></i>
            <span>Crawl</span>
          </a>
        </div>`}
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
            <span :class="${spaCreatorsExpr} ? '${badgeActive}' : '${badgeInactive}'" x-text="competitors.length"></span>
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
              <span :class="${spaRelatedExpr} ? '${badgeActive}' : '${badgeInactive}'" x-text="seeds.length + 's'"></span>
              <span class="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300" x-text="intersections.length + 'i'"></span>
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
          <i x-show="!isSidebarCollapsed" data-lucide="chevrons-left" class="w-4 h-4"></i>
          <i x-show="isSidebarCollapsed" data-lucide="chevrons-right" class="w-4 h-4"></i>
        </button>
      </div>

      <!-- Quick Action Buttons -->
      <div class="pt-1 transition-all duration-300" :class="isSidebarCollapsed ? 'space-y-2 flex flex-col items-center' : 'space-y-1.5'">
        ${isDashboardSpa ? `
        <button
          type="button"
          @click="openAddCompetitorModal()"
          class="flex items-center justify-center rounded-xl bg-rose-600 hover:bg-rose-500 text-white shadow-xs border border-rose-500/30 active:scale-95 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 cursor-pointer"
          :class="isSidebarCollapsed ? 'w-10 h-10 p-0' : 'w-full px-3 py-2 space-x-2 text-xs font-semibold'"
          title="Track Creator">
          <i data-lucide="user-plus" class="w-3.5 h-3.5 shrink-0"></i>
          <span x-show="!isSidebarCollapsed" class="truncate">+ Track Creator</span>
        </button>

        <div :class="isSidebarCollapsed ? 'flex flex-col space-y-2 w-full items-center' : 'grid grid-cols-2 gap-1.5'">
          <button
            type="button"
            @click="openAddSeedModal()"
            class="flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-slate-700 dark:text-[#FAFAFA] border border-slate-200 dark:border-[#27272A] transition active:scale-95 shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 cursor-pointer"
            :class="isSidebarCollapsed ? 'w-10 h-10 p-0' : 'px-2.5 py-1.5 space-x-1 text-xs font-semibold'"
            title="Add Seeds">
            <i data-lucide="plus-circle" class="w-3 h-3 text-rose-500 shrink-0"></i>
            <span x-show="!isSidebarCollapsed" class="truncate">Add Seeds</span>
          </button>

          <button
            type="button"
            @click="openCrawlModal()"
            class="flex items-center justify-center rounded-xl transition shadow-xs active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 cursor-pointer"
            :class="[
              isSidebarCollapsed ? 'w-10 h-10 p-0' : 'px-2.5 py-1.5 space-x-1 text-xs font-bold',
              crawlStatus.is_crawling
                ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                : 'bg-slate-100 hover:bg-slate-200 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-amber-600 dark:text-amber-400 border border-slate-200 dark:border-[#27272A]'
            ]"
            title="Crawl">
            <i data-lucide="zap" :class="{'animate-spin': crawlStatus.is_crawling}" class="w-3 h-3 shrink-0"></i>
            <span x-show="!isSidebarCollapsed" class="truncate">Crawl</span>
          </button>
        </div>` : `
        <a
          href="/accounts?action=new"
          class="flex items-center justify-center rounded-xl bg-rose-600 hover:bg-rose-500 text-white shadow-xs active:scale-95 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
          :class="isSidebarCollapsed ? 'w-10 h-10 p-0' : 'w-full px-3 py-2 space-x-2 text-xs font-semibold'"
          title="Track Creator">
          <i data-lucide="user-plus" class="w-3.5 h-3.5 shrink-0"></i>
          <span x-show="!isSidebarCollapsed" class="truncate">+ Track Creator</span>
        </a>

        <div :class="isSidebarCollapsed ? 'flex flex-col space-y-2 w-full items-center' : 'grid grid-cols-2 gap-1.5'">
          <a
            href="/related-pins"
            class="flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-slate-700 dark:text-[#FAFAFA] border border-slate-200 dark:border-[#27272A] transition active:scale-95 shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
            :class="isSidebarCollapsed ? 'w-10 h-10 p-0' : 'px-2.5 py-1.5 space-x-1 text-xs font-medium'"
            title="Add Seeds">
            <i data-lucide="plus-circle" class="w-3 h-3 text-rose-500 shrink-0"></i>
            <span x-show="!isSidebarCollapsed" class="truncate">Add Seeds</span>
          </a>

          <a
            href="/"
            class="flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-amber-600 dark:text-amber-400 border border-slate-200 dark:border-[#27272A] transition shadow-xs active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
            :class="isSidebarCollapsed ? 'w-10 h-10 p-0' : 'px-2.5 py-1.5 space-x-1 text-xs font-semibold'"
            title="Crawl">
            <i data-lucide="zap" class="w-3 h-3 shrink-0"></i>
            <span x-show="!isSidebarCollapsed" class="truncate">Crawl</span>
          </a>
        </div>`}
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
              <span :class="${spaCreatorsExpr} ? '${badgeActive}' : '${badgeInactive}'" x-text="competitors.length"></span>
            </div>
            <span x-show="isSidebarCollapsed && competitors.length > 0" class="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500"></span>
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
              <span :class="${spaRelatedExpr} ? '${badgeActive}' : '${badgeInactive}'" x-text="seeds.length + 's'"></span>
              <span class="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300" x-text="intersections.length + 'i'"></span>
            </div>
            <span x-show="isSidebarCollapsed && (seeds.length > 0 || intersections.length > 0)" class="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500"></span>
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
          <i x-show="!${darkExpr}" data-lucide="moon" class="w-3.5 h-3.5"></i>
          <i x-show="${darkExpr}" data-lucide="sun" class="w-3.5 h-3.5"></i>
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

  ${showTopbar ? renderAppTopbar({ activeNav, refreshHandler, isDashboardSpa }) : ''}

  <!-- Global Command Palette Modal (⌘K / ⌘F) [INVARIANT: GLOBAL-SEARCH-PALETTE] -->
  <div
    x-data="{
      isCommandOpen: false,
      cmdQuery: '',
      openCmd() {
        this.isCommandOpen = true;
        this.cmdQuery = '';
        this.$nextTick(() => {
          const el = document.getElementById('pae-global-cmd-input');
          if (el) el.focus();
        });
      },
      closeCmd() {
        this.isCommandOpen = false;
        this.cmdQuery = '';
      },
      handleCmdSubmit() {
        const q = String(this.cmdQuery || '').trim();
        if (!q) return;
        if (/^\\d{10,30}$/.test(q)) {
          window.location.href = '/pin/' + q;
        } else if (q.includes('.') && !q.includes(' ')) {
          window.location.href = '/domains/' + encodeURIComponent(q);
        } else {
          window.location.href = '/keywords?q=' + encodeURIComponent(q);
        }
        this.closeCmd();
      }
    }"
    @pae:open-command-palette.window="openCmd()"
    @keydown.window.cmd.k.prevent="openCmd()"
    @keydown.window.ctrl.k.prevent="openCmd()"
    @keydown.window.cmd.f.prevent="openCmd()"
    @keydown.window.ctrl.f.prevent="openCmd()"
    x-show="isCommandOpen"
    x-cloak
    class="fixed inset-0 z-50 overflow-y-auto p-4 sm:p-6 md:p-20 bg-slate-950/60 backdrop-blur-sm flex items-start justify-center"
    @click="closeCmd()"
    @keydown.escape.window="closeCmd()">
    
    <div
      class="w-full max-w-xl bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl shadow-2xl overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Global Command Palette and Fast Search"
      @click.stop>
      
      <!-- Input Header -->
      <div class="p-3.5 border-b border-slate-200 dark:border-[#27272A] flex items-center gap-3 bg-slate-50/50 dark:bg-[#18181B]/50">
        <i data-lucide="search" class="w-4 h-4 text-rose-500 shrink-0"></i>
        <input
          id="pae-global-cmd-input"
          type="text"
          x-model="cmdQuery"
          @keydown.enter.prevent="handleCmdSubmit()"
          placeholder="Search pins, keywords, creators, or enter pin ID..."
          class="flex-1 bg-transparent border-0 text-sm font-medium text-slate-900 dark:text-[#FAFAFA] placeholder:text-slate-400 dark:placeholder:text-[#71717A] focus:outline-none"
        />
        <div class="flex items-center gap-1.5 shrink-0">
          <kbd class="px-1.5 py-0.5 text-[10px] font-mono rounded bg-white dark:bg-[#121215] text-slate-400 border border-slate-200 dark:border-[#27272A] shadow-2xs">ESC</kbd>
        </div>
      </div>

      <!-- Quick Jump Navigation Options -->
      <div class="max-h-80 overflow-y-auto p-2 space-y-1">
        <!-- Direct Query Action if typed -->
        <template x-if="cmdQuery.trim().length > 0">
          <div class="p-1 mb-1 border-b border-slate-100 dark:border-[#27272A]">
            <button
              type="button"
              @click="handleCmdSubmit()"
              class="w-full flex items-center justify-between p-2 rounded-xl bg-rose-50/70 hover:bg-rose-100/70 dark:bg-rose-950/20 dark:hover:bg-rose-900/30 text-rose-700 dark:text-rose-300 text-xs font-semibold transition cursor-pointer">
              <div class="flex items-center gap-2">
                <i data-lucide="arrow-right" class="w-3.5 h-3.5 text-rose-500"></i>
                <span x-text="'Jump to: ' + cmdQuery"></span>
              </div>
              <span class="font-mono text-[10px] px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">↵ Enter</span>
            </button>
          </div>
        </template>

        <!-- Category: Executive -->
        <div class="px-2 pt-1.5 pb-1 text-[10px] font-mono uppercase tracking-wider text-slate-400 dark:text-[#71717A] font-bold">Executive Studios</div>
        <a href="/" class="flex items-center justify-between p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-[#18181B] text-slate-700 dark:text-[#FAFAFA] text-xs transition">
          <div class="flex items-center gap-2.5">
            <i data-lucide="layout-dashboard" class="w-4 h-4 text-slate-400"></i>
            <span class="font-medium">Overview & Hub</span>
          </div>
          <span class="text-[10px] text-slate-400 font-mono">/</span>
        </a>
        <a href="/pulse" class="flex items-center justify-between p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-[#18181B] text-slate-700 dark:text-[#FAFAFA] text-xs transition">
          <div class="flex items-center gap-2.5">
            <i data-lucide="activity" class="w-4 h-4 text-rose-500"></i>
            <span class="font-medium">24h Pulse Studio</span>
          </div>
          <span class="text-[10px] text-rose-500 font-mono">Live</span>
        </a>

        <!-- Category: Intelligence -->
        <div class="px-2 pt-2.5 pb-1 text-[10px] font-mono uppercase tracking-wider text-slate-400 dark:text-[#71717A] font-bold">Intelligence Fleet</div>
        <a href="/accounts" class="flex items-center justify-between p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-[#18181B] text-slate-700 dark:text-[#FAFAFA] text-xs transition">
          <div class="flex items-center gap-2.5">
            <i data-lucide="users" class="w-4 h-4 text-slate-400"></i>
            <span class="font-medium">Creator Hub</span>
          </div>
          <span class="text-[10px] text-slate-400 font-mono">/accounts</span>
        </a>
        <a href="/keywords" class="flex items-center justify-between p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-[#18181B] text-slate-700 dark:text-[#FAFAFA] text-xs transition">
          <div class="flex items-center gap-2.5">
            <i data-lucide="search" class="w-4 h-4 text-slate-400"></i>
            <span class="font-medium">Keywords Fleet</span>
          </div>
          <span class="text-[10px] text-slate-400 font-mono">/keywords</span>
        </a>
        <a href="/domains" class="flex items-center justify-between p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-[#18181B] text-slate-700 dark:text-[#FAFAFA] text-xs transition">
          <div class="flex items-center gap-2.5">
            <i data-lucide="globe" class="w-4 h-4 text-slate-400"></i>
            <span class="font-medium">Domain Radar</span>
          </div>
          <span class="text-[10px] text-slate-400 font-mono">/domains</span>
        </a>
        <a href="/related-pins" class="flex items-center justify-between p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-[#18181B] text-slate-700 dark:text-[#FAFAFA] text-xs transition">
          <div class="flex items-center gap-2.5">
            <i data-lucide="git-fork" class="w-4 h-4 text-slate-400"></i>
            <span class="font-medium">Related Pins</span>
          </div>
          <span class="text-[10px] text-slate-400 font-mono">/related-pins</span>
        </a>
        <a href="/folders" class="flex items-center justify-between p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-[#18181B] text-slate-700 dark:text-[#FAFAFA] text-xs transition">
          <div class="flex items-center gap-2.5">
            <i data-lucide="folder-kanban" class="w-4 h-4 text-slate-400"></i>
            <span class="font-medium">Campaign Folders</span>
          </div>
          <span class="text-[10px] text-slate-400 font-mono">/folders</span>
        </a>
        <a href="/discovery" class="flex items-center justify-between p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-[#18181B] text-slate-700 dark:text-[#FAFAFA] text-xs transition">
          <div class="flex items-center gap-2.5">
            <i data-lucide="compass" class="w-4 h-4 text-slate-400"></i>
            <span class="font-medium">Keyword Discovery</span>
          </div>
          <span class="text-[10px] text-slate-400 font-mono">/discovery</span>
        </a>
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

  <script>
    (function() {
      function refreshAppSidebarIcons() {
        if (typeof window !== 'undefined' && window.lucide && typeof window.lucide.createIcons === 'function') {
          window.lucide.createIcons();
        }
      }
      if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', refreshAppSidebarIcons);
        } else {
          refreshAppSidebarIcons();
        }
        if (typeof window !== 'undefined') {
          window.addEventListener('load', refreshAppSidebarIcons);
          window.addEventListener('keydown', function(e) {
            if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
              e.preventDefault();
              if (window.Alpine) {
                var el = document.querySelector('[x-data]');
                if (el && el.__x && typeof el.__x.$data.toggleSidebar === 'function') {
                  el.__x.$data.toggleSidebar();
                }
              }
            }
          });
        }
        document.addEventListener('alpine:initialized', refreshAppSidebarIcons);
        setTimeout(refreshAppSidebarIcons, 50);
        setTimeout(refreshAppSidebarIcons, 250);
        setTimeout(refreshAppSidebarIcons, 1000);
      }
    })();
  </script>
`;
}
