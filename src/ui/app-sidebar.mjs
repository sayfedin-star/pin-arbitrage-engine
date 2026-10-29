/**
 * src/ui/app-sidebar.mjs
 * 
 * Canonical Unified App Sidebar & Shell Layout Component
 * Single Source of Truth (SSOT) for PAE desktop sidebar and mobile navigation drawer.
 * Ensures 100% layout parity across Overview (/), Creator Hub (/accounts),
 * Keywords Fleet (/keywords), Domain Radar (/domains), and Related Pins (/related-pins).
 * 
 * [INVARIANT: UNIFIED-SIDEBAR-LAYOUT]
 * [INVARIANT: DESIGN-TOKEN-PARITY]
 */

export function renderAppSidebar({
  activeNav = 'overview', // 'overview' | 'creators' | 'keywords' | 'domains' | 'related_pins'
  refreshHandler = 'window.location.reload()'
} = {}) {
  const isOverview = activeNav === 'overview';
  const isCreators = activeNav === 'creators';
  const isKeywords = activeNav === 'keywords';
  const isDomains = activeNav === 'domains';
  const isRelated = activeNav === 'related_pins';
  const isFolders = activeNav === 'folders';

  // Strict DESIGN.md Cockpit Dense Tokens: Unified Surface & Rose Accent (Eliminating Rainbow Tabs)
  const inactiveClass = 'text-slate-600 dark:text-[#A1A1AA] hover:bg-slate-100 dark:hover:bg-[#18181B] hover:text-slate-900 dark:hover:text-[#FAFAFA] border border-transparent font-medium';
  const activeClass = 'bg-rose-50/80 dark:bg-[#18181B] text-rose-600 dark:text-rose-400 font-semibold border border-rose-200/80 dark:border-rose-500/30 shadow-xs';

  const overviewActive = isOverview ? activeClass : inactiveClass;
  const creatorsActive = isCreators ? activeClass : inactiveClass;
  const keywordsActive = isKeywords ? activeClass : inactiveClass;
  const domainsActive = isDomains ? activeClass : inactiveClass;
  const relatedActive = isRelated ? activeClass : inactiveClass;
  const foldersActive = isFolders ? activeClass : inactiveClass;

  const iconActive = 'text-rose-600 dark:text-rose-400';
  const iconInactive = 'text-slate-400 dark:text-[#71717A]';

  const badgeActive = 'px-1.5 py-0.5 rounded-md text-[10px] font-mono tabular-nums font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20';
  const badgeInactive = 'px-1.5 py-0.5 rounded-md text-[10px] font-mono tabular-nums font-medium bg-slate-100 dark:bg-[#18181B] text-slate-500 dark:text-[#71717A] border border-slate-200/80 dark:border-[#27272A]';

  return `
  <!-- Mobile Top Header (Visible on screens < md) [INVARIANT: UNIFIED-SIDEBAR-LAYOUT] -->
  <header class="md:hidden border-b border-slate-200/90 dark:border-[#27272A] bg-white/95 dark:bg-[#121215]/95 backdrop-blur-xl sticky top-0 z-40 px-4 py-3 flex items-center justify-between shadow-xs">
    <div class="flex items-center space-x-2.5">
      <button @click="isMobileMenuOpen = !isMobileMenuOpen" class="p-2 rounded-xl border border-slate-200 dark:border-[#27272A] text-slate-600 dark:text-[#A1A1AA] hover:bg-slate-100 dark:hover:bg-[#18181B] transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500" title="Toggle Navigation Menu">
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
    <div class="flex items-center space-x-2">
      <button @click="toggleTheme()" class="p-2 rounded-xl border border-slate-200 dark:border-[#27272A] text-slate-600 dark:text-[#A1A1AA] hover:bg-slate-100 dark:hover:bg-[#18181B] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500" :title="(typeof isDark !== 'undefined' ? isDark : (typeof darkMode !== 'undefined' ? darkMode : false)) ? 'Light Mode' : 'Dark Mode'">
        <i :data-lucide="(typeof isDark !== 'undefined' ? isDark : (typeof darkMode !== 'undefined' ? darkMode : false)) ? 'sun' : 'moon'" class="w-4 h-4"></i>
      </button>
      <button @click="${refreshHandler}" class="p-2 rounded-xl border border-slate-200 dark:border-[#27272A] text-slate-600 dark:text-[#A1A1AA] hover:bg-slate-100 dark:hover:bg-[#18181B] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500" title="Refresh Data">
        <i data-lucide="rotate-cw" class="w-4 h-4"></i>
      </button>
    </div>
  </header>

  <!-- Mobile Drawer Backdrop & Drawer [INVARIANT: UNIFIED-SIDEBAR-LAYOUT] -->
  <div x-show="isMobileMenuOpen" x-cloak class="fixed inset-0 z-50 md:hidden bg-slate-950/80 backdrop-blur-sm transition-opacity" @click="isMobileMenuOpen = false" @keydown.escape.window="isMobileMenuOpen = false">
    <div class="w-72 bg-white dark:bg-[#121215] border-r border-slate-200 dark:border-[#27272A] h-full flex flex-col justify-between p-5 space-y-4 shadow-2xl overflow-y-auto" role="dialog" aria-modal="true" aria-label="Navigation Menu" @click.stop>
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
        <button @click="isMobileMenuOpen = false" class="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">
          <i data-lucide="x" class="w-5 h-5"></i>
        </button>
      </div>

      <!-- Mobile Quick Actions -->
      <div class="space-y-1.5">
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
        </div>
      </div>

      <!-- Mobile Navigation Links -->
      <nav class="space-y-1">
        <!-- Overview & Command Center (Home) -->
        <a href="/" class="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 ${overviewActive}">
          <div class="flex items-center space-x-2.5">
            <i data-lucide="layout-dashboard" class="w-4 h-4 shrink-0 ${isOverview ? iconActive : iconInactive}"></i>
            <span>Overview & Hub</span>
          </div>
          <span class="${isOverview ? badgeActive : badgeInactive}">Home</span>
        </a>

        <!-- Creator Hub -->
        <a href="/accounts" class="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 ${creatorsActive}">
          <div class="flex items-center space-x-2.5">
            <i data-lucide="users" class="w-4 h-4 shrink-0 ${isCreators ? iconActive : iconInactive}"></i>
            <span>Creator Hub</span>
          </div>
          <span class="${isCreators ? badgeActive : badgeInactive}">Ledger</span>
        </a>

        <!-- Keywords Fleet Dashboard -->
        <a href="/keywords" class="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 ${keywordsActive}">
          <div class="flex items-center space-x-2.5">
            <i data-lucide="search" class="w-4 h-4 shrink-0 ${isKeywords ? iconActive : iconInactive}"></i>
            <span>Keywords Fleet</span>
          </div>
          <span class="${isKeywords ? badgeActive : badgeInactive}">SERP</span>
        </a>

        <!-- Domain Radar -->
        <a href="/domains" class="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 ${domainsActive}">
          <div class="flex items-center space-x-2.5">
            <i data-lucide="globe" class="w-4 h-4 shrink-0 ${isDomains ? iconActive : iconInactive}"></i>
            <span>Domain Radar</span>
          </div>
          <span class="${isDomains ? badgeActive : badgeInactive}">WHOIS</span>
        </a>

        <!-- Related Pins Tab -->
        <a href="/related-pins" class="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 ${relatedActive}">
          <div class="flex items-center space-x-2.5">
            <i data-lucide="git-fork" class="w-4 h-4 shrink-0 ${isRelated ? iconActive : iconInactive}"></i>
            <span>Related Pins</span>
          </div>
          <span class="${isRelated ? badgeActive : badgeInactive}">Graph</span>
        </a>

        <!-- Campaign Folders Tab -->
        <a href="/folders" class="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 ${foldersActive}">
          <div class="flex items-center space-x-2.5">
            <i data-lucide="folder-kanban" class="w-4 h-4 shrink-0 ${isFolders ? iconActive : iconInactive}"></i>
            <span>Campaign Folders</span>
          </div>
          <span x-show="typeof folders !== 'undefined' && folders && folders.length > 0" class="${isFolders ? badgeActive : badgeInactive}" x-text="(typeof folders !== 'undefined' && folders) ? folders.length : ''"></span>
          <span x-show="typeof folders === 'undefined' || !folders || !folders.length" class="${isFolders ? badgeActive : badgeInactive}">Clusters</span>
        </a>
      </nav>

      <!-- Mobile Drawer Footer -->
      <div class="pt-3 border-t border-slate-200 dark:border-[#27272A] space-y-2">
        <div class="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold rounded-xl border bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-400 font-mono tabular-nums">
          <span class="flex items-center space-x-2 truncate">
            <span class="w-2 h-2 rounded-full shrink-0 bg-emerald-500 motion-safe:animate-pulse"></span>
            <span class="truncate">System: Operational</span>
          </span>
          <i data-lucide="shield-check" class="w-3.5 h-3.5"></i>
        </div>
      </div>
    </div>
  </div>

  <!-- Desktop Permanent Sidebar (<aside>) [INVARIANT: UNIFIED-SIDEBAR-LAYOUT] -->
  <aside 
    class="hidden md:flex fixed inset-y-0 left-0 z-40 bg-white/95 dark:bg-[#121215] border-r border-slate-200/90 dark:border-[#27272A] flex-col justify-between shadow-xs overflow-y-auto overflow-x-hidden transition-all duration-300 ease-in-out"
    :class="isSidebarCollapsed ? 'w-20' : 'w-64 lg:w-72'">
    <!-- Top section: Logo, DB Project Switcher, Quick Actions, Nav Links -->
    <div class="transition-all duration-300" :class="isSidebarCollapsed ? 'p-3 space-y-4' : 'p-4 lg:p-5 space-y-4'">
      <!-- App Brand & Title + Collapse Toggle -->
      <div class="flex items-center transition-all duration-300" :class="isSidebarCollapsed ? 'flex-col space-y-2.5 items-center' : 'justify-between'">
        <!-- Logo & Title -->
        <a href="/" class="flex items-center space-x-3 overflow-hidden group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 rounded-xl">
          <div class="h-10 w-10 rounded-xl bg-rose-600 flex items-center justify-center shadow-xs text-white shrink-0 group-hover:scale-102 transition">
            <i data-lucide="cpu" class="w-5 h-5"></i>
          </div>
          <div x-show="!isSidebarCollapsed" x-transition.opacity.duration.200ms class="overflow-hidden whitespace-nowrap">
            <div class="flex items-center space-x-1.5">
              <span class="font-bold text-sm lg:text-base tracking-tight text-slate-900 dark:text-[#FAFAFA] truncate">
                Pin Cluster Analyzer
              </span>
            </div>
            <div class="flex items-center space-x-1.5 mt-0.5">
              <span class="px-1.5 py-0.5 text-[9px] font-mono tabular-nums font-bold uppercase rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30">
                V3 Predictive
              </span>
            </div>
          </div>
        </a>

        <!-- Sideways Collapse / Expand Toggle Button -->
        <button 
          @click="toggleSidebar()" 
          class="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 dark:hover:text-[#FAFAFA] hover:bg-slate-100 dark:hover:bg-[#18181B] transition active:scale-95 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500" 
          :class="isSidebarCollapsed ? 'w-8 h-8 flex items-center justify-center' : ''"
          :title="isSidebarCollapsed ? 'Expand Sidebar (Ctrl+B)' : 'Collapse Sidebar (Ctrl+B)'"
          aria-label="Toggle Sidebar">
          <i x-show="!isSidebarCollapsed" data-lucide="chevrons-left" class="w-4 h-4"></i>
          <i x-show="isSidebarCollapsed" data-lucide="chevrons-right" class="w-4 h-4"></i>
        </button>
      </div>

      <!-- Quick Action Buttons -->
      <div class="pt-1 transition-all duration-300" :class="isSidebarCollapsed ? 'space-y-2 flex flex-col items-center' : 'space-y-1.5'">
        <!-- + Track Creator -->
        <a 
          href="/accounts?action=new" 
          class="flex items-center justify-center rounded-xl bg-rose-600 hover:bg-rose-500 text-white shadow-xs active:scale-95 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
          :class="isSidebarCollapsed ? 'w-10 h-10 p-0' : 'w-full px-3 py-2 space-x-2 text-xs font-semibold'"
          title="Track Creator">
          <i data-lucide="user-plus" class="w-3.5 h-3.5 shrink-0"></i>
          <span x-show="!isSidebarCollapsed" class="truncate">+ Track Creator</span>
        </a>

        <div :class="isSidebarCollapsed ? 'flex flex-col space-y-2 w-full items-center' : 'grid grid-cols-2 gap-1.5'">
          <!-- + Add Seeds -->
          <a 
            href="/related-pins" 
            class="flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-slate-700 dark:text-[#FAFAFA] border border-slate-200 dark:border-[#27272A] transition active:scale-95 shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
            :class="isSidebarCollapsed ? 'w-10 h-10 p-0' : 'px-2.5 py-1.5 space-x-1 text-xs font-medium'"
            title="Add Seeds">
            <i data-lucide="plus-circle" class="w-3 h-3 text-rose-500 shrink-0"></i>
            <span x-show="!isSidebarCollapsed" class="truncate">Add Seeds</span>
          </a>

          <!-- Crawl -->
          <a 
            href="/" 
            class="flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-amber-600 dark:text-amber-400 border border-slate-200 dark:border-[#27272A] transition shadow-xs active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500" 
            :class="isSidebarCollapsed ? 'w-10 h-10 p-0' : 'px-2.5 py-1.5 space-x-1 text-xs font-semibold'"
            title="Crawl">
            <i data-lucide="zap" class="w-3 h-3 shrink-0"></i>
            <span x-show="!isSidebarCollapsed" class="truncate">Crawl</span>
          </a>
        </div>
      </div>

      <!-- Navigation Links (Desktop) -->
      <nav class="space-y-1 pt-2" :class="isSidebarCollapsed ? 'flex flex-col items-center' : ''">
        <!-- Overview & Command Center (Home) -->
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
        </a>

        <!-- Creator Hub (/accounts) -->
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
        </a>

        <!-- Keywords Fleet Dashboard (/keywords) -->
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
          ${isKeywords ? '<span x-show="isSidebarCollapsed" class="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 shadow-xs"></span>' : ''}
        </a>

        <!-- Domain Radar (/domains) -->
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

        <!-- Related Pins Tab (/related-pins) -->
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
        </a>

        <!-- Campaign Folders Tab (/folders) -->
        <a 
          href="/folders" 
          class="relative flex items-center rounded-xl text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 ${foldersActive}" 
          :class="isSidebarCollapsed ? 'w-10 h-10 justify-center' : 'w-full justify-between px-3 py-2.5'"
          title="Campaign Folders">
          <div class="flex items-center" :class="isSidebarCollapsed ? 'justify-center' : 'space-x-2.5'">
            <i data-lucide="folder-kanban" class="w-4 h-4 shrink-0 ${isFolders ? iconActive : iconInactive}"></i>
            <span x-show="!isSidebarCollapsed" class="truncate">Campaign Folders</span>
          </div>
          <span x-show="!isSidebarCollapsed && (typeof folders !== 'undefined' && folders && folders.length > 0)" class="${isFolders ? badgeActive : badgeInactive}" x-text="(typeof folders !== 'undefined' && folders) ? folders.length : ''"></span>
          <span x-show="!isSidebarCollapsed && (typeof folders === 'undefined' || !folders || !folders.length)" class="${isFolders ? badgeActive : badgeInactive}">Clusters</span>
          ${isFolders ? '<span x-show="isSidebarCollapsed" class="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 shadow-xs"></span>' : ''}
        </a>
      </nav>
    </div>

    <!-- Bottom Footer section: Pinterest Auth Status, Theme toggle, Refresh -->
    <div class="border-t border-slate-200/80 dark:border-[#27272A] bg-slate-50/50 dark:bg-[#09090B]/60 transition-all duration-300" :class="isSidebarCollapsed ? 'p-3 space-y-2' : 'p-4 space-y-3'">
      <!-- Status Indicator -->
      <div 
        class="flex items-center rounded-xl border bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-400 font-mono tabular-nums" 
        :class="isSidebarCollapsed ? 'w-10 h-10 p-0 justify-center mx-auto' : 'w-full justify-between px-3 py-2 text-xs font-semibold'" 
        title="PAE Distributed System: Active">
        <span class="flex items-center truncate" :class="isSidebarCollapsed ? 'justify-center' : 'space-x-2'">
          <span class="w-2 h-2 rounded-full shrink-0 bg-emerald-500 motion-safe:animate-pulse"></span>
          <span x-show="!isSidebarCollapsed" class="truncate text-[11px]">System: Operational</span>
        </span>
        <i x-show="!isSidebarCollapsed" data-lucide="shield-check" class="w-3.5 h-3.5 shrink-0 opacity-70"></i>
      </div>

      <!-- Theme Toggle & Refresh -->
      <div :class="isSidebarCollapsed ? 'flex flex-col space-y-2 items-center' : 'flex items-center justify-between pt-1'">
        <!-- Theme Toggle -->
        <button 
          @click="toggleTheme()" 
          class="flex items-center justify-center rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] text-slate-700 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-[#FAFAFA] text-xs font-medium hover:bg-slate-100 dark:hover:bg-[#27272A] transition active:scale-95 shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500" 
          :class="isSidebarCollapsed ? 'w-10 h-10 p-0' : 'flex-1 mr-2 space-x-2 py-2 px-3'"
          title="Switch Theme"
          aria-label="Toggle theme">
          <i x-show="!(typeof isDark !== 'undefined' ? isDark : (typeof darkMode !== 'undefined' ? darkMode : false))" data-lucide="moon" class="w-3.5 h-3.5"></i>
          <i x-show="typeof isDark !== 'undefined' ? isDark : (typeof darkMode !== 'undefined' ? darkMode : false)" data-lucide="sun" class="w-3.5 h-3.5"></i>
          <span x-show="!isSidebarCollapsed" x-text="(typeof isDark !== 'undefined' ? isDark : (typeof darkMode !== 'undefined' ? darkMode : false)) ? 'Light' : 'Dark'"></span>
        </button>

        <!-- Refresh Data -->
        <button 
          @click="${refreshHandler}" 
          class="flex items-center justify-center rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] hover:bg-slate-100 dark:hover:bg-[#27272A] text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-[#FAFAFA] transition active:scale-95 shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500" 
          :class="isSidebarCollapsed ? 'w-10 h-10 p-0' : 'p-2'"
          title="Refresh Studio Data"
          aria-label="Refresh Data">
          <i data-lucide="rotate-cw" class="w-4 h-4"></i>
        </button>
      </div>
    </div>
  </aside>

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
        window.addEventListener('load', refreshAppSidebarIcons);
        document.addEventListener('alpine:initialized', refreshAppSidebarIcons);
        setTimeout(refreshAppSidebarIcons, 50);
        setTimeout(refreshAppSidebarIcons, 250);
        setTimeout(refreshAppSidebarIcons, 1000);
      }
    })();
  </script>
`;
}
