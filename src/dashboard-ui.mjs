export function getDashboardHtml() {
  return `<!DOCTYPE html>
<html lang="en" :class="isDark ? 'dark' : ''" x-data="dashboardApp()" x-init="initDashboard()">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pin Cluster Analyzer & Predictive Engine | V3</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          fontFamily: {
            sans: ['Inter', 'sans-serif'],
            mono: ['JetBrains Mono', 'monospace'],
          },
          colors: {
            brand: {
              50: '#fdf2f2',
              500: '#ef4444',
              600: '#dc2626',
              900: '#7f1d1d',
            }
          }
        }
      }
    }
  </script>
  <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
  <script src="https://unpkg.com/lucide@latest"></script>
  <style>
    [x-cloak] { display: none !important; }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
    .dark ::-webkit-scrollbar-thumb { background: #1e293b; }
    ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
    .dark ::-webkit-scrollbar-thumb:hover { background: #334155; }
  </style>
</head>
<body class="bg-slate-50 text-slate-900 dark:bg-[#080d1a] dark:text-slate-100 min-h-screen font-sans selection:bg-rose-500 selection:text-white antialiased transition-colors duration-200">

  <!-- Mobile Top Header (Visible on screens < md) -->
  <header class="md:hidden border-b border-slate-200/90 dark:border-slate-800/80 bg-white/95 dark:bg-[#0b1120]/90 backdrop-blur-xl sticky top-0 z-40 px-4 py-3 flex items-center justify-between shadow-sm">
    <div class="flex items-center space-x-2.5">
      <button @click="isMobileMenuOpen = !isMobileMenuOpen" class="p-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition active:scale-95" title="Toggle Navigation Menu">
        <i data-lucide="menu" class="w-5 h-5"></i>
      </button>
      <div class="h-8 w-8 rounded-lg bg-gradient-to-tr from-rose-600 via-rose-500 to-amber-500 flex items-center justify-center text-white shadow-sm">
        <i data-lucide="cpu" class="w-4 h-4"></i>
      </div>
      <div>
        <span class="font-bold text-sm tracking-tight text-slate-900 dark:text-white">Pin Arbitrage</span>
        <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-600 dark:text-rose-400 font-bold ml-1 border border-rose-500/20">V3</span>
      </div>
    </div>
    <div class="flex items-center space-x-2">
      <button @click="toggleTheme()" class="p-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition" :title="isDark ? 'Light Mode' : 'Dark Mode'">
        <i :data-lucide="isDark ? 'sun' : 'moon'" class="w-4 h-4"></i>
      </button>
      <button @click="refreshAll()" :disabled="isLoading" class="p-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition" title="Refresh Data">
        <i data-lucide="rotate-cw" :class="{'animate-spin': isLoading}" class="w-4 h-4"></i>
      </button>
    </div>
  </header>

  <!-- Mobile Drawer Backdrop & Drawer -->
  <div x-show="isMobileMenuOpen" x-cloak class="fixed inset-0 z-50 md:hidden bg-slate-950/70 backdrop-blur-sm transition-opacity" @click="isMobileMenuOpen = false">
    <div class="w-72 bg-white dark:bg-[#0b1120] border-r border-slate-200 dark:border-slate-800 h-full flex flex-col justify-between p-5 space-y-4 shadow-2xl overflow-y-auto" @click.stop>
      <!-- Mobile Drawer Header -->
      <div class="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
        <div class="flex items-center space-x-2.5">
          <div class="h-9 w-9 rounded-xl bg-gradient-to-tr from-rose-600 via-rose-500 to-amber-500 flex items-center justify-center text-white shadow-sm">
            <i data-lucide="cpu" class="w-5 h-5"></i>
          </div>
          <div>
            <div class="font-bold text-sm text-slate-900 dark:text-white">Pin Arbitrage</div>
            <div class="text-[10px] text-slate-500 font-mono">Predictive V3 Fleet</div>
          </div>
        </div>
        <button @click="isMobileMenuOpen = false" class="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-lg">
          <i data-lucide="x" class="w-5 h-5"></i>
        </button>
      </div>

      <!-- Mobile Unified Storage Engine Status & Collapsible DevOps Shard Inspector -->
      <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 text-xs space-y-1.5">
        <div class="flex items-center justify-between text-[11px] font-semibold text-slate-700 dark:text-slate-300">
          <span class="flex items-center space-x-1.5">
            <span class="relative flex h-2 w-2">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span class="font-bold">Unified Fleet Engine</span>
          </span>
          <span class="font-mono text-[10px] text-cyan-600 dark:text-cyan-400 font-bold px-1.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20" x-text="(fleetProjects.length || 100) + ' Nodes (100 GB)'"></span>
        </div>
        <div class="flex items-center justify-between text-[10.5px] text-slate-500 pt-0.5">
          <span class="truncate max-w-[170px]" x-text="selectedProject === 'all' ? '🌐 Mode: All Projects (Auto)' : '📦 Node: ' + selectedProject"></span>
          <button type="button" @click="showDevOpsFleetSelector = !showDevOpsFleetSelector; $nextTick(() => { if (window.lucide) window.lucide.createIcons(); })" class="text-cyan-600 dark:text-cyan-400 hover:underline cursor-pointer shrink-0 ml-1 font-semibold flex items-center gap-0.5">
            <span x-text="showDevOpsFleetSelector ? 'Close' : 'Inspect'"></span>
            <i data-lucide="sliders-horizontal" class="w-3 h-3"></i>
          </button>
        </div>
        <!-- Collapsible Shard Picker (DevOps Only) -->
        <div x-show="showDevOpsFleetSelector" x-transition class="pt-1.5 space-y-1 border-t border-slate-200 dark:border-slate-800">
          <div class="text-[10px] text-slate-400">Manual Node Override (DevOps):</div>
          <select x-model="selectedProject" @change="switchProject(selectedProject); isMobileMenuOpen = false" class="w-full bg-white dark:bg-[#070c18] border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-800 dark:text-slate-200 outline-none">
            <option value="all">🌐 All Projects (Fleet View - Recommended)</option>
            <option value="weathered-band-34334459">⚡ weathered-band-34334459 (Hub)</option>
            <template x-for="p in fleetProjects.filter(p => !p.is_hub)" :key="p.project_id">
              <option :value="p.project_id" x-text="'📦 ' + p.project_name"></option>
            </template>
          </select>
        </div>
      </div>

      <!-- Mobile Quick Actions -->
      <div class="space-y-1.5">
        <button @click="openAddCompetitorModal(); isMobileMenuOpen = false" class="w-full flex items-center justify-center space-x-2 px-3 py-2 text-xs font-bold rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-rose-600 hover:from-purple-500 hover:to-rose-500 text-white shadow-sm active:scale-95 transition">
          <i data-lucide="user-plus" class="w-3.5 h-3.5"></i>
          <span>+ Track Creator</span>
        </button>
        <div class="grid grid-cols-2 gap-1.5">
          <button @click="openAddSeedModal(); isMobileMenuOpen = false" class="flex items-center justify-center space-x-1 px-2.5 py-1.5 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-800">
            <i data-lucide="plus-circle" class="w-3 h-3 text-rose-500"></i>
            <span>Add Seeds</span>
          </button>
          <button @click="openCrawlModal(); isMobileMenuOpen = false" class="flex items-center justify-center space-x-1 px-2.5 py-1.5 text-xs font-bold rounded-xl bg-slate-100 dark:bg-slate-900 text-amber-600 dark:text-amber-400 border border-slate-200 dark:border-slate-800">
            <i data-lucide="zap" class="w-3 h-3"></i>
            <span>Crawl</span>
          </button>
        </div>
      </div>

      <!-- Mobile Navigation Links -->
      <nav class="space-y-1">
        <!-- Unified Related Pins Tab -->
        <button @click="switchTab('related_pins'); isMobileMenuOpen = false" class="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition" :class="(currentTab === 'related_pins' || currentTab === 'seeds' || currentTab === 'intersections' || currentTab === 'explorer') ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 font-bold border border-rose-500/20' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900/60'">
          <div class="flex items-center space-x-2.5">
            <i data-lucide="git-fork" class="w-4 h-4 text-rose-500"></i>
            <span>Related Pins</span>
          </div>
          <div class="flex items-center space-x-1 font-mono">
            <span class="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-rose-500/15 text-rose-700 dark:text-rose-300" x-text="seeds.length + 's'"></span>
            <span class="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300" x-text="intersections.length + 'i'"></span>
          </div>
        </button>

        <button @click="switchTab('creators_archive'); isMobileMenuOpen = false" class="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition" :class="(currentTab === 'creators_archive' || currentTab === 'competitors' || currentTab === 'pinarchive') ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 font-bold border border-purple-500/20' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900/60'">
          <div class="flex items-center space-x-2.5">
            <i data-lucide="users" class="w-4 h-4 text-purple-500"></i>
            <span>Creator & PinArchive</span>
          </div>
          <div class="flex items-center space-x-1">
            <span class="px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold bg-purple-500/15 text-purple-700 dark:text-purple-300" x-text="competitors.length + 'c'"></span>
            <span class="px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold bg-indigo-500/15 text-indigo-700 dark:text-indigo-300" x-text="formatNumber(pinarchiveOverview.total_pins) + 'p'"></span>
          </div>
        </button>

        <button @click="switchTab('keywords'); isMobileMenuOpen = false" class="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition" :class="currentTab === 'keywords' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold border border-emerald-500/20' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900/60'">
          <div class="flex items-center space-x-2.5">
            <i data-lucide="search" class="w-4 h-4 text-emerald-500"></i>
            <span>Keywords & Velocity</span>
          </div>
          <span class="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" x-text="keywords.length"></span>
        </button>

        <button @click="switchTab('fleet'); isMobileMenuOpen = false" class="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition" :class="currentTab === 'fleet' ? 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 font-bold border border-cyan-500/20' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900/60'">
          <div class="flex items-center space-x-2.5">
            <i data-lucide="server" class="w-4 h-4 text-cyan-500"></i>
            <span>Neon Fleet (100)</span>
          </div>
          <span class="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-cyan-500/10 text-cyan-700 dark:text-cyan-400" x-text="fleetProjects.length"></span>
        </button>
      </nav>

      <!-- Mobile Drawer Footer -->
      <div class="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
        <button @click="isCookieModalOpen = true; isMobileMenuOpen = false" class="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold rounded-xl border transition" :class="cookieStatus.has_cookie ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400' : 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400'">
          <span class="flex items-center space-x-2 truncate">
            <span class="w-2 h-2 rounded-full shrink-0" :class="cookieStatus.has_cookie ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'"></span>
            <span class="truncate" x-text="cookieStatus.has_cookie ? 'Session: Authenticated' : 'Guest Mode (No Cookie)'"></span>
          </span>
          <i data-lucide="key" class="w-3.5 h-3.5"></i>
        </button>
      </div>
    </div>
  </div>

  <!-- Desktop Permanent Sidebar (<aside>) -->
  <aside class="hidden md:flex w-64 lg:w-72 fixed inset-y-0 left-0 z-40 bg-white/95 dark:bg-[#0b1120] border-r border-slate-200/90 dark:border-slate-800/80 flex-col justify-between shadow-sm overflow-y-auto">
    <!-- Top section: Logo, DB Project Switcher, Quick Actions, Nav Links -->
    <div class="p-4 lg:p-5 space-y-4">
      <!-- App Brand & Title -->
      <div class="flex items-center space-x-3">
        <div class="h-10 w-10 rounded-xl bg-gradient-to-tr from-rose-600 via-rose-500 to-amber-500 flex items-center justify-center shadow-md shadow-rose-500/20 text-white shrink-0">
          <i data-lucide="cpu" class="w-5 h-5"></i>
        </div>
        <div class="overflow-hidden">
          <div class="flex items-center space-x-1.5">
            <span class="font-bold text-sm lg:text-base tracking-tight text-slate-900 dark:text-white truncate">
              Pin Cluster Analyzer
            </span>
          </div>
          <div class="flex items-center space-x-1.5 mt-0.5">
            <span class="px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30">
              V3 Predictive
            </span>
            <template x-if="crawlStatus.is_crawling">
              <span class="px-1.5 py-0.5 text-[9px] font-mono font-bold rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center space-x-1 animate-pulse">
                <span class="w-1 h-1 rounded-full bg-amber-400 animate-ping"></span>
                <span>Active</span>
              </span>
            </template>
          </div>
        </div>
      </div>

      <!-- Unified Storage Engine Status & Collapsible DevOps Shard Inspector -->
      <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 text-xs shadow-inner space-y-1.5">
        <div class="flex items-center justify-between text-[11px] font-semibold text-slate-700 dark:text-slate-300">
          <span class="flex items-center space-x-1.5">
            <span class="relative flex h-2 w-2">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span class="font-bold">Unified Fleet Engine</span>
          </span>
          <span class="font-mono text-[10px] text-cyan-600 dark:text-cyan-400 font-bold px-1.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20" x-text="(fleetProjects.length || 100) + ' Nodes (100 GB)'"></span>
        </div>
        <div class="flex items-center justify-between text-[10.5px] text-slate-500 pt-0.5">
          <span class="truncate max-w-[170px]" :title="selectedProject === 'all' ? 'Auto-routed across 100 shards' : selectedProject" x-text="selectedProject === 'all' ? '🌐 Mode: All Projects (Auto-Routed)' : '📦 Node: ' + selectedProject"></span>
          <button type="button" @click="showDevOpsFleetSelector = !showDevOpsFleetSelector; $nextTick(() => { if (window.lucide) window.lucide.createIcons(); })" class="text-cyan-600 dark:text-cyan-400 hover:underline cursor-pointer shrink-0 ml-1 font-semibold flex items-center gap-0.5">
            <span x-text="showDevOpsFleetSelector ? 'Close' : 'Inspect'"></span>
            <i data-lucide="sliders-horizontal" class="w-3 h-3"></i>
          </button>
        </div>
        <!-- Collapsible Shard Picker (DevOps Only) -->
        <div x-show="showDevOpsFleetSelector" x-transition class="pt-1.5 space-y-1 border-t border-slate-200 dark:border-slate-800">
          <div class="text-[10px] text-slate-400">Manual Node Override (DevOps):</div>
          <select x-model="selectedProject" @change="switchProject(selectedProject)" class="w-full bg-white dark:bg-[#070c18] border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-800 dark:text-slate-200 outline-none cursor-pointer">
            <option value="all">🌐 All Projects (Fleet View - Recommended)</option>
            <option value="weathered-band-34334459">⚡ weathered-band-34334459 (Hub)</option>
            <template x-for="p in fleetProjects.filter(p => !p.is_hub)" :key="p.project_id">
              <option :value="p.project_id" x-text="'📦 ' + p.project_name"></option>
            </template>
          </select>
        </div>
      </div>

      <!-- Quick Action Buttons -->
      <div class="space-y-1.5 pt-1">
        <!-- + Track Creator (Unified Modal) -->
        <button @click="openAddCompetitorModal()" class="w-full flex items-center justify-center space-x-2 px-3 py-2 text-xs font-bold rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-rose-600 hover:from-purple-500 hover:to-rose-500 text-white shadow-md shadow-indigo-950/20 active:scale-95 transition">
          <i data-lucide="user-plus" class="w-3.5 h-3.5"></i>
          <span>+ Track Creator</span>
        </button>

        <div class="grid grid-cols-2 gap-1.5">
          <!-- + Add Seeds -->
          <button @click="openAddSeedModal()" class="flex items-center justify-center space-x-1 px-2.5 py-1.5 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-900/90 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-800 transition active:scale-95 shadow-sm">
            <i data-lucide="plus-circle" class="w-3 h-3 text-rose-500"></i>
            <span>Add Seeds</span>
          </button>

          <!-- ⚡ Crawl -->
          <button @click="openCrawlModal()" class="flex items-center justify-center space-x-1 px-2.5 py-1.5 text-xs font-bold rounded-xl transition shadow-sm active:scale-95" :class="crawlStatus.is_crawling ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30' : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-900/90 dark:hover:bg-slate-800 text-amber-600 dark:text-amber-400 border border-slate-200 dark:border-slate-800'">
            <i data-lucide="zap" :class="{'animate-spin': crawlStatus.is_crawling}" class="w-3 h-3"></i>
            <span>Crawl</span>
          </button>
        </div>
      </div>

      <!-- Navigation Links (Desktop) -->
      <nav class="space-y-1 pt-2">
        <!-- Tab 1: Related Pins (UNIFIED SEEDS, INTERSECTIONS, EXPLORER) -->
        <button @click="switchTab('related_pins')" class="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition" :class="(currentTab === 'related_pins' || currentTab === 'seeds' || currentTab === 'intersections' || currentTab === 'explorer') ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 font-bold border border-rose-500/20 shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900/60 hover:text-slate-900 dark:hover:text-slate-200'">
          <div class="flex items-center space-x-2.5">
            <i data-lucide="git-fork" class="w-4 h-4 text-rose-500"></i>
            <span>Related Pins</span>
          </div>
          <div class="flex items-center space-x-1 font-mono">
            <span class="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-rose-500/15 text-rose-700 dark:text-rose-300" x-text="seeds.length + 's'"></span>
            <span class="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300" x-text="intersections.length + 'i'"></span>
          </div>
        </button>

        <!-- Tab 4: Creator Intelligence & PinArchive (UNIFIED!) -->
        <button @click="switchTab('creators_archive')" class="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition" :class="(currentTab === 'creators_archive' || currentTab === 'competitors' || currentTab === 'pinarchive') ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 font-bold border border-purple-500/20 shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900/60 hover:text-slate-900 dark:hover:text-slate-200'">
          <div class="flex items-center space-x-2.5">
            <i data-lucide="users" class="w-4 h-4 text-purple-500"></i>
            <span>Creator & PinArchive</span>
          </div>
          <div class="flex items-center space-x-1">
            <span class="px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold bg-purple-500/15 text-purple-700 dark:text-purple-300" x-text="competitors.length + 'c'"></span>
            <span class="px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold bg-indigo-500/15 text-indigo-700 dark:text-indigo-300" x-text="formatNumber(pinarchiveOverview.total_pins) + 'p'"></span>
          </div>
        </button>

        <!-- Tab 5: Keyword Velocity Tracker -->
        <button @click="switchTab('keywords')" class="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition" :class="currentTab === 'keywords' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold border border-emerald-500/20 shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900/60 hover:text-slate-900 dark:hover:text-slate-200'">
          <div class="flex items-center space-x-2.5">
            <i data-lucide="search" class="w-4 h-4 text-emerald-500"></i>
            <span>Keywords & Velocity</span>
          </div>
          <span class="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" x-text="keywords.length"></span>
        </button>

        <!-- Tab 6: Neon Projects Fleet -->
        <button @click="switchTab('fleet')" class="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition" :class="currentTab === 'fleet' ? 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 font-bold border border-cyan-500/20 shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900/60 hover:text-slate-900 dark:hover:text-slate-200'">
          <div class="flex items-center space-x-2.5">
            <i data-lucide="server" class="w-4 h-4 text-cyan-500"></i>
            <span>Neon Fleet (100)</span>
          </div>
          <span class="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-cyan-500/10 text-cyan-700 dark:text-cyan-400" x-text="fleetProjects.length"></span>
        </button>
      </nav>
    </div>

    <!-- Bottom Footer section: Pinterest Auth Status, Theme toggle, Refresh -->
    <div class="p-4 border-t border-slate-200/80 dark:border-slate-800/80 space-y-3 bg-slate-50/50 dark:bg-slate-950/20">
      <!-- Pinterest Session Status -->
      <button @click="isCookieModalOpen = true" class="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold rounded-xl border transition active:scale-95" :class="cookieStatus.has_cookie ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20' : 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20'" title="Pinterest Session Authentication Status">
        <span class="flex items-center space-x-2 truncate">
          <span class="w-2 h-2 rounded-full shrink-0" :class="cookieStatus.has_cookie ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'"></span>
          <span class="truncate text-[11px]" x-text="cookieStatus.has_cookie ? 'Pinterest: Authenticated' : 'Guest Mode (No Cookie)'"></span>
        </span>
        <i data-lucide="key" class="w-3.5 h-3.5 shrink-0 opacity-70"></i>
      </button>

      <div class="flex items-center justify-between pt-1">
        <!-- Theme Toggle -->
        <button @click="toggleTheme()" class="flex-1 mr-2 flex items-center justify-center space-x-2 py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition active:scale-95 shadow-sm">
          <i :data-lucide="isDark ? 'sun' : 'moon'" class="w-3.5 h-3.5"></i>
          <span x-text="isDark ? 'Light' : 'Dark'"></span>
        </button>

        <!-- Refresh Data -->
        <button @click="refreshAll()" :disabled="isLoading" class="p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition active:scale-95 shadow-sm" title="Refresh All Data">
          <i data-lucide="rotate-cw" :class="{'animate-spin': isLoading}" class="w-4 h-4"></i>
        </button>
      </div>
    </div>
  </aside>

  <!-- Main Content Area (Offset for Desktop Sidebar) -->
  <main class="md:ml-64 lg:ml-72 flex-1 min-h-screen p-4 sm:p-6 lg:p-8 space-y-6 max-w-full overflow-x-hidden">

    <!-- Active Crawl Notification Banner -->
    <div x-show="crawlStatus.is_crawling" x-cloak class="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3 px-4 flex items-center justify-between text-xs text-amber-700 dark:text-amber-300 backdrop-blur-sm animate-pulse">
      <div class="flex items-center space-x-2">
        <i data-lucide="loader-2" class="w-4 h-4 animate-spin text-amber-500"></i>
        <span class="font-semibold">Crawler in flight:</span>
        <span class="font-mono" x-text="'Target: ' + crawlStatus.seed_pin_id"></span>
        <span class="text-amber-500/60">•</span>
        <span class="text-slate-700 dark:text-amber-200" x-text="crawlStatus.last_log"></span>
      </div>
      <span class="font-mono text-[11px] text-amber-600 dark:text-amber-400" x-text="'Elapsed: ' + crawlElapsed + 's'"></span>
    </div>

    <!-- ======================================================== -->
    <!-- DEDICATED PIN DETAIL PAGE (Route: /pin/:id)               -->
    <!-- Full-screen Dossier & Performance Trajectory             -->
    <!-- ======================================================== -->
    <div x-show="activePinId" x-cloak class="space-y-6 max-w-7xl mx-auto">
      
      <!-- Top Sticky Navigation & Breadcrumbs Bar -->
      <div class="sticky top-0 z-30 -mx-4 -mt-4 sm:-mx-6 sm:-mt-6 lg:-mx-8 lg:-mt-8 px-4 sm:px-6 lg:px-8 py-3.5 bg-white/90 dark:bg-[#0b1120]/90 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
        <div class="flex items-center gap-3">
          <button type="button" @click="closePinPage()" class="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1526] hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 transition shadow-2xs cursor-pointer group">
            <i data-lucide="arrow-left" class="w-4 h-4 text-slate-400 group-hover:-translate-x-0.5 transition-transform"></i>
            <span x-text="activeCreator ? ('← Back to @' + (activeCreator.username || '').replace(/^@+/, '')) : (activePinDossier?.account_username ? ('← Back to @' + activePinDossier.account_username.replace(/^@+/, '')) : '← Back to Pins Archive')"></span>
          </button>
          
          <div class="hidden md:flex items-center gap-1.5 text-xs font-mono">
            <template x-if="activeCreator?.username || activePinDossier?.account_username">
              <span class="flex items-center gap-1">
                <span class="text-slate-400">/</span>
                <span class="text-indigo-500 dark:text-indigo-400 font-semibold" x-text="(activeCreator?.username || activePinDossier?.account_username || '').replace(/^@+/, '')"></span>
              </span>
            </template>
            <span class="text-slate-400">/</span>
            <span class="text-slate-500">pin</span>
            <span class="text-slate-400">/</span>
            <span class="font-bold text-rose-500" x-text="activePinId"></span>
          </div>
        </div>

        <div class="flex items-center gap-2 flex-wrap">
          <!-- Copy Page Link -->
          <button type="button" @click="copyPinField('Direct Pin Page URL', window.location.href)" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1526] text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition shadow-2xs cursor-pointer">
            <i data-lucide="link" class="w-3.5 h-3.5 text-slate-400"></i>
            <span>Copy Page Link</span>
          </button>

          <!-- Live Refresh from Pinterest (No Cookies) -->
          <button type="button" @click="openPinPage(activePinId, false, true)" :disabled="isLoadingPinDossier" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition shadow-2xs cursor-pointer disabled:opacity-50" title="Scrape live Pinterest page anonymously without cookies and refresh metrics">
            <i data-lucide="refresh-cw" class="w-3.5 h-3.5" :class="isLoadingPinDossier ? 'animate-spin' : ''"></i>
            <span>Live Refresh (No Cookies)</span>
          </button>

          <!-- External Pinterest Link -->
          <a :href="'https://www.pinterest.com/pin/' + activePinId + '/'" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition shadow-xs">
            <span>Open on Pinterest</span>
            <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
          </a>
        </div>
      </div>

      <!-- Loading State -->
      <template x-if="isLoadingPinDossier">
        <div class="py-24 flex flex-col items-center justify-center space-y-3">
          <div class="w-10 h-10 border-4 border-rose-500 border-t-transparent rounded-full animate-spin"></div>
          <p class="text-xs font-mono text-slate-400">Loading pin dossier telemetry &amp; snapshots...</p>
        </div>
      </template>

      <!-- Pin Dossier Loaded Content -->
      <template x-if="!isLoadingPinDossier &amp;&amp; activePinDossier">
        <div class="space-y-6">
          
          <!-- 1. Header Pills & Status Badges (Image 2) -->
          <div class="flex items-center gap-2 flex-wrap">
            <!-- Stage Badge -->
            <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border"
                  :class="{
                    'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30': Number(activePinDossier.velocity || 0) >= 10,
                    'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30': Number(activePinDossier.velocity || 0) < 10 &amp;&amp; Number(activePinDossier.velocity || 0) >= 1,
                    'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/30': Number(activePinDossier.velocity || 0) < 1
                  }">
              <span x-text="Number(activePinDossier.velocity || 0) >= 10 ? '🌱 GROWING (>10/d)' : (Number(activePinDossier.velocity || 0) >= 1 ? '🟣 MATURE' : '⚪ DORMANT (<1/d)')"></span>
            </span>

            <!-- Spike Badge -->
            <template x-if="Number(activePinDossier.velocity || 0) >= 50 || Number(activePinDossier.saves || 0) >= 5000">
              <span class="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30">
                <span>🔥 SPIKE</span>
              </span>
            </template>

            <!-- Board Badge -->
            <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30">
              <span>📁</span>
              <span class="font-bold" x-text="activePinDossier.board_name || 'General'"></span>
            </span>

            <!-- Dominant Color Badge -->
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <span class="h-2.5 w-2.5 rounded-full inline-block" :style="'background-color: ' + (activePinDossier.dominant_color || '#a88d56')"></span>
              <span x-text="activePinDossier.dominant_color || '#a88d56'"></span>
            </span>

            <!-- Canonical ID Badge -->
            <span class="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-mono font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30">
              <span>🔗 Canonical #<span x-text="activePinDossier.pin_id"></span></span>
            </span>

            <!-- Product Badge -->
            <template x-if="activePinDossier.is_product">
              <span class="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                <span>🛒 Product Pin</span>
              </span>
            </template>

            <!-- Creator Badge -->
            <span class="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30 cursor-pointer hover:opacity-80 transition"
                  @click="if (activePinDossier.account_username) { openCreatorByHandle(activePinDossier.account_username); }">
              <span x-text="'@' + (activePinDossier.account_username || activeCreator?.username || '').replace(/^@+/, '')"></span>
            </span>
          </div>

          <!-- 2. Two-Column Hero: Image + Details (Image 2) -->
          <div class="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
            
            <!-- Left: Image Preview (4 cols) -->
            <div class="md:col-span-4 relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 group shadow-md">
              <img :src="activePinDossier.image_url" loading="lazy" class="w-full h-auto object-cover max-h-[520px] mx-auto" />
              
              <!-- Category Pill Overlay on Image -->
              <div class="absolute top-3 left-3">
                <span class="px-2.5 py-1 rounded-lg text-[10.5px] font-bold bg-white/90 dark:bg-slate-950/90 text-slate-800 dark:text-white backdrop-blur-md shadow border border-white/20">
                  <span x-text="activePinDossier.board_name || 'Food And Drinks'"></span>
                </span>
              </div>
            </div>

            <!-- Right: Metadata & Content (8 cols) -->
            <div class="md:col-span-8 space-y-4">
              
              <!-- Title -->
              <h1 class="text-xl sm:text-2xl font-black text-slate-900 dark:text-white leading-tight" x-text="activePinDossier.title || 'Untitled Pin'"></h1>

              <!-- Description -->
              <p class="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed" x-text="activePinDossier.description || 'No description provided for this pin.'"></p>

              <!-- Pinterest SEO Alt Text Box (matches Image 2) -->
              <div class="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/50 p-4 space-y-1.5 shadow-2xs">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <i data-lucide="search" class="w-3.5 h-3.5 text-slate-400"></i>
                    <span>Pinterest SEO Alt Text</span>
                  </div>
                  <button type="button" x-show="activePinDossier.alt_text" @click="copyPinField('Alt Text', activePinDossier.alt_text)" class="text-[10px] font-semibold text-rose-500 hover:text-rose-600 flex items-center gap-1 cursor-pointer">
                    <i data-lucide="copy" class="w-3 h-3"></i>
                    <span>Copy</span>
                  </button>
                </div>
                <template x-if="activePinDossier.alt_text">
                  <p class="text-xs font-serif italic text-slate-700 dark:text-slate-300 leading-relaxed" x-text="'&ldquo;' + activePinDossier.alt_text + '&rdquo;'"></p>
                </template>
                <template x-if="!activePinDossier.alt_text">
                  <p class="text-xs italic text-slate-400 leading-relaxed">No Pinterest SEO Alt Text specified for this pin.</p>
                </template>
              </div>

              <!-- Copy Toolbar (Copy Pin ID, Copy Pinterest URL, Copy Title, Copy Alt Text) -->
              <div class="flex items-center gap-2 flex-wrap pt-1">
                <button type="button" @click="copyPinField('Pin ID', activePinDossier.pin_id)" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition shadow-2xs cursor-pointer">
                  <i data-lucide="copy" class="w-3.5 h-3.5 text-slate-400"></i>
                  <span>Copy Pin ID</span>
                </button>
                <button type="button" @click="copyPinField('Pinterest URL', 'https://www.pinterest.com/pin/' + activePinDossier.pin_id + '/')" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition shadow-2xs cursor-pointer">
                  <i data-lucide="link" class="w-3.5 h-3.5 text-slate-400"></i>
                  <span>Copy Pinterest URL</span>
                </button>
                <button type="button" @click="copyPinField('Title', activePinDossier.title)" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition shadow-2xs cursor-pointer">
                  <span class="font-bold font-serif">T</span>
                  <span>Copy Title</span>
                </button>
                <button type="button" x-show="activePinDossier.alt_text" @click="copyPinField('Alt Text', activePinDossier.alt_text)" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition shadow-2xs cursor-pointer">
                  <i data-lucide="file-text" class="w-3.5 h-3.5 text-slate-400"></i>
                  <span>Copy Alt Text</span>
                </button>
              </div>

              <!-- 6 Mini Metadata Cards Grid (Exact Image 2 match) -->
              <div class="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
                <div class="p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30">
                  <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Pin ID</div>
                  <div class="font-mono text-xs font-bold text-slate-900 dark:text-white truncate" x-text="activePinDossier.pin_id"></div>
                </div>
                <div class="p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30">
                  <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Created Date</div>
                  <div class="font-sans text-xs font-bold text-slate-900 dark:text-white truncate" x-text="(activePinDossier.created_at_pinterest &amp;&amp; !isNaN(new Date(activePinDossier.created_at_pinterest).getTime())) ? new Date(activePinDossier.created_at_pinterest).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : (activePinDossier.first_seen_at &amp;&amp; !isNaN(new Date(activePinDossier.first_seen_at).getTime()) ? new Date(activePinDossier.first_seen_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—')"></div>
                </div>
                <div class="p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30">
                  <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">First Tracked</div>
                  <div class="font-sans text-xs font-bold text-slate-900 dark:text-white truncate" x-text="(activePinDossier.first_seen_at &amp;&amp; !isNaN(new Date(activePinDossier.first_seen_at).getTime())) ? new Date(activePinDossier.first_seen_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'"></div>
                </div>
                <div class="p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30">
                  <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Last Archived</div>
                  <div class="font-sans text-xs font-bold text-slate-900 dark:text-white truncate" x-text="(activePinDossier.last_updated_at &amp;&amp; !isNaN(new Date(activePinDossier.last_updated_at).getTime())) ? new Date(activePinDossier.last_updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'"></div>
                </div>
                <div class="p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30">
                  <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Dominant Color</div>
                  <div class="font-mono text-xs font-bold flex items-center gap-1.5 text-slate-900 dark:text-white">
                    <span class="h-2.5 w-2.5 rounded-full inline-block" :style="'background-color: ' + (activePinDossier.dominant_color || '#a88d56')"></span>
                    <span x-text="activePinDossier.dominant_color || '#a88d56'"></span>
                  </div>
                </div>
                <div class="p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30">
                  <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Image Signature</div>
                  <div class="font-mono text-xs font-bold text-slate-900 dark:text-white truncate" x-text="(activePinDossier.image_url ? activePinDossier.image_url.split('/').pop().slice(0, 16) : '—') + '...'"></div>
                </div>
              </div>

              <!-- View on Pinterest Link -->
              <div>
                <a :href="'https://www.pinterest.com/pin/' + activePinDossier.pin_id + '/'" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-500 hover:text-rose-600 hover:underline">
                  <span>View on Pinterest</span>
                  <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                </a>
              </div>

              <!-- Annotations & SEO Keywords (Image 2 match) -->
              <div class="space-y-2 pt-2 border-t border-slate-200/70 dark:border-slate-800/80">
                <div class="flex items-center justify-between text-xs">
                  <div class="flex items-center gap-1.5 font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                    <span>🏷</span>
                    <span>Annotations &amp; SEO Keywords</span>
                  </div>
                  <span class="text-slate-400 text-[11px]" x-text="(activePinDossier.annotations ? activePinDossier.annotations.length : 0) + ' linked ideas'"></span>
                </div>
                
                <div class="flex items-center gap-2 flex-wrap">
                  <template x-for="(ann, aIdx) in (activePinDossier.annotations || [])" :key="aIdx">
                    <a :href="(ann.url && ann.url.startsWith('/')) ? ('https://www.pinterest.com' + ann.url) : (ann.url || ('https://www.pinterest.com/search/pins/?q=' + encodeURIComponent(ann.name || ann)))" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/30 dark:hover:bg-rose-950/50 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50 transition">
                      <span>💡</span>
                      <span x-text="ann.name || ann"></span>
                      <i data-lucide="external-link" class="w-2.5 h-2.5 opacity-60"></i>
                    </a>
                  </template>
                  <template x-if="!activePinDossier.annotations || activePinDossier.annotations.length === 0">
                    <span class="text-xs text-slate-400 italic">No semantic keywords discovered yet for this pin.</span>
                  </template>
                </div>
              </div>

            </div>
          </div>

          <!-- 3. Metrics Summary Row (6 Metric Cards - Exact Image 2 Match) -->
          <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <!-- Card 1: TOTAL SAVES -->
            <div class="p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#0d1526] shadow-xs space-y-1">
              <div class="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">Total Saves</div>
              <div class="flex items-baseline gap-1.5 flex-wrap">
                <span class="text-xl sm:text-2xl font-black text-rose-600 dark:text-rose-400" x-text="formatNumber(activePinDossier.saves)"></span>
                <span class="text-xs font-bold text-emerald-500 font-mono" x-show="Number(pinDossierTopDelta.saves || 0) > 0" x-text="'(+' + formatNumber(pinDossierTopDelta.saves) + ')'"></span>
              </div>
              <div class="text-[10px] text-slate-400">Cumulative saves</div>
            </div>

            <!-- Card 2: REPINS -->
            <div class="p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#0d1526] shadow-xs space-y-1">
              <div class="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">Repins</div>
              <div class="flex items-baseline gap-1.5 flex-wrap">
                <span class="text-xl sm:text-2xl font-black text-slate-900 dark:text-white" x-text="formatNumber(activePinDossier.repins)"></span>
                <span class="text-xs font-bold text-emerald-500 font-mono" x-show="Number(pinDossierTopDelta.repins || 0) > 0" x-text="'(+' + formatNumber(pinDossierTopDelta.repins) + ')'"></span>
              </div>
              <div class="text-[10px] text-slate-400">Re-pin shares</div>
            </div>

            <!-- Card 3: COMMENTS -->
            <div class="p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#0d1526] shadow-xs space-y-1">
              <div class="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">Comments</div>
              <div class="flex items-baseline gap-1.5 flex-wrap">
                <span class="text-xl sm:text-2xl font-black text-slate-900 dark:text-white" x-text="formatNumber(activePinDossier.comments)"></span>
                <span class="text-xs font-bold text-emerald-500 font-mono" x-show="Number(pinDossierTopDelta.comments || 0) > 0" x-text="'(+' + formatNumber(pinDossierTopDelta.comments) + ')'"></span>
              </div>
              <div class="text-[10px] text-slate-400">User comments</div>
            </div>

            <!-- Card 4: SHARES -->
            <div class="p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#0d1526] shadow-xs space-y-1">
              <div class="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">Shares</div>
              <div class="flex items-baseline gap-1.5 flex-wrap">
                <span class="text-xl sm:text-2xl font-black text-sky-500" x-text="formatNumber(activePinDossier.share_count || 0)"></span>
                <span class="text-xs font-bold text-emerald-500 font-mono" x-show="Number(pinDossierTopDelta.shares || 0) > 0" x-text="'(+' + formatNumber(pinDossierTopDelta.shares) + ')'"></span>
              </div>
              <div class="text-[10px] text-slate-400">Social shares</div>
            </div>

            <!-- Card 5: VELOCITY -->
            <div class="p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#0d1526] shadow-xs space-y-1">
              <div class="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">Velocity</div>
              <div class="flex items-baseline gap-1 flex-wrap">
                <span class="text-xl sm:text-2xl font-black text-emerald-500 font-mono" x-text="(activePinDossier.velocity || 0) + '/d'"></span>
              </div>
              <div class="text-[10px] text-slate-400">Saves / day</div>
            </div>

            <!-- Card 6: REACTIONS -->
            <div class="p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#0d1526] shadow-xs space-y-1">
              <div class="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">Reactions</div>
              <div class="flex items-baseline gap-1.5 flex-wrap">
                <span class="text-xl sm:text-2xl font-black text-purple-500" x-text="formatNumber(activePinDossier.reactions_count || 0)"></span>
                <span class="text-xs font-bold text-emerald-500 font-mono" x-show="Number(pinDossierTopDelta.reactions || 0) > 0" x-text="'(+' + formatNumber(pinDossierTopDelta.reactions) + ')'"></span>
              </div>
              <div class="text-[10px] text-slate-400">Total reactions</div>
            </div>
          </div>

          <!-- 4. Performance Trajectory SVG Chart (Exact Image 2 & 3 Match) -->
          <div class="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#0d1526] p-5 shadow-xs space-y-4">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800/80 pb-3">
              <div class="flex items-center gap-2.5 flex-wrap">
                <span class="text-base">📈</span>
                <h3 class="text-sm font-bold text-slate-900 dark:text-white">Performance Trajectory</h3>
                <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20" x-text="pinDossierChartData.activeCount + ' of ' + pinDossierChartData.totalCount + ' Snapshots (' + pinDossierTimeframe + ')'"></span>
              </div>

              <div class="flex items-center gap-3 flex-wrap">
                <!-- Timeframe selector -->
                <div class="flex items-center bg-slate-100 dark:bg-slate-900 p-0.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold">
                  <button type="button" @click="pinDossierTimeframe = '7d'" class="px-2.5 py-1 rounded-lg transition cursor-pointer" :class="pinDossierTimeframe === '7d' ? 'bg-rose-500 text-white shadow-xs font-bold' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'">7d</button>
                  <button type="button" @click="pinDossierTimeframe = '14d'" class="px-2.5 py-1 rounded-lg transition cursor-pointer" :class="pinDossierTimeframe === '14d' ? 'bg-rose-500 text-white shadow-xs font-bold' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'">14d</button>
                  <button type="button" @click="pinDossierTimeframe = '30d'" class="px-2.5 py-1 rounded-lg transition cursor-pointer" :class="pinDossierTimeframe === '30d' ? 'bg-rose-500 text-white shadow-xs font-bold' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'">30d</button>
                  <button type="button" @click="pinDossierTimeframe = 'all'" class="px-2.5 py-1 rounded-lg transition cursor-pointer" :class="pinDossierTimeframe === 'all' ? 'bg-rose-500 text-white shadow-xs font-bold' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'">All</button>
                </div>

                <!-- Legend -->
                <div class="flex items-center gap-3 text-xs font-semibold">
                  <span class="flex items-center gap-1.5 text-rose-500">
                    <span class="h-2 w-2 rounded-full bg-rose-500"></span>
                    <span>Saves</span>
                  </span>
                  <span class="flex items-center gap-1.5 text-sky-500">
                    <span class="h-2 w-2 rounded-full bg-sky-500"></span>
                    <span>Repins</span>
                  </span>
                </div>
              </div>
            </div>

            <!-- SVG Visual Chart -->
            <div class="relative w-full h-56 pt-2">
              <svg class="w-full h-full overflow-visible" viewBox="0 0 700 200" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="pinDossierGradSaves" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#f43f5e" stop-opacity="0.25" />
                    <stop offset="100%" stop-color="#f43f5e" stop-opacity="0.0" />
                  </linearGradient>
                  <linearGradient id="pinDossierGradRepins" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.2" />
                    <stop offset="100%" stop-color="#3b82f6" stop-opacity="0.0" />
                  </linearGradient>
                </defs>

                <!-- Horizontal grid lines -->
                <line x1="40" y1="20" x2="680" y2="20" stroke="currentColor" class="text-slate-200 dark:text-slate-800" stroke-dasharray="3 3" />
                <line x1="40" y1="95" x2="680" y2="95" stroke="currentColor" class="text-slate-200 dark:text-slate-800" stroke-dasharray="3 3" />
                <line x1="40" y1="170" x2="680" y2="170" stroke="currentColor" class="text-slate-200 dark:text-slate-800" />

                <!-- Area fills -->
                <path :d="pinDossierChartData.areaSaves" fill="url(#pinDossierGradSaves)" />
                <path :d="pinDossierChartData.areaRepins" fill="url(#pinDossierGradRepins)" />

                <!-- Spline lines -->
                <path :d="pinDossierChartData.strokeSaves" fill="none" stroke="#f43f5e" stroke-width="2.5" stroke-linecap="round" />
                <path :d="pinDossierChartData.strokeRepins" fill="none" stroke="#3b82f6" stroke-width="2.5" stroke-linecap="round" />

                <!-- Data point dots for Saves -->
                <template x-for="(pt, pIdx) in pinDossierChartData.pointsSaves" :key="'ps-' + pIdx">
                  <circle :cx="pt.x" :cy="pt.y" r="4" fill="#f43f5e" class="transition-all hover:r-6 cursor-pointer" />
                </template>

                <!-- Data point dots for Repins -->
                <template x-for="(pt, pIdx) in pinDossierChartData.pointsRepins" :key="'pr-' + pIdx">
                  <circle :cx="pt.x" :cy="pt.y" r="3.5" fill="#3b82f6" class="transition-all hover:r-5 cursor-pointer" />
                </template>
              </svg>

              <!-- Axis Labels -->
              <div class="flex items-center justify-between text-[11px] font-mono text-slate-400 mt-2 px-6">
                <span x-text="pinDossierChartData.firstDateLabel"></span>
                <span x-text="pinDossierChartData.lastDateLabel"></span>
              </div>
            </div>
          </div>

          <!-- 5. Historical Snapshots Table (Exact Image 2 & 3 Match) -->
          <div class="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#0d1526] shadow-xs overflow-hidden">
            <div class="overflow-x-auto">
              <table class="w-full text-left text-xs border-collapse">
                <thead>
                  <tr class="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 text-[11px] font-bold uppercase tracking-wider select-none">
                    <th class="py-3 px-5">Recorded Date &amp; Time</th>
                    <th class="py-3 px-4 text-right">Saves</th>
                    <th class="py-3 px-4 text-right">Repins</th>
                    <th class="py-3 px-4 text-right">Comments</th>
                    <th class="py-3 px-4 text-right">Shares</th>
                    <th class="py-3 px-4 text-right">Reactions</th>
                    <th class="py-3 px-5 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                  
                  <!-- Top Highlight Row: Total Net Growth (Image 2 & 3) -->
                  <tr class="bg-emerald-500/5 dark:bg-emerald-950/20 font-bold border-b border-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                    <td class="py-3 px-5 font-sans">
                      <span>Σ Total Net Growth</span>
                    </td>
                    <td class="py-3 px-4 text-right" x-text="pinDossierNetChange.saves"></td>
                    <td class="py-3 px-4 text-right" x-text="pinDossierNetChange.repins"></td>
                    <td class="py-3 px-4 text-right" x-text="pinDossierNetChange.comments"></td>
                    <td class="py-3 px-4 text-right" x-text="pinDossierNetChange.shares"></td>
                    <td class="py-3 px-4 text-right" x-text="pinDossierNetChange.reactions"></td>
                    <td class="py-3 px-5 text-center"></td>
                  </tr>

                  <!-- Individual Snapshot Rows -->
                  <template x-for="s in filteredPinSnapshots" :key="s.id">
                    <tr class="hover:bg-slate-50/80 dark:hover:bg-slate-900/40 transition">
                      <td class="py-3 px-5 font-sans text-slate-600 dark:text-slate-300" x-text="s.recorded_at ? new Date(s.recorded_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'"></td>
                      <td class="py-3 px-4 text-right font-bold text-slate-900 dark:text-white">
                        <span x-text="formatNumber(s.saves)"></span>
                        <span x-show="Number(s.delta_saves || 0) > 0" class="text-emerald-500 font-bold ml-1" x-text="'(+' + formatNumber(s.delta_saves) + ')'"></span>
                      </td>
                      <td class="py-3 px-4 text-right font-bold text-slate-900 dark:text-white">
                        <span x-text="formatNumber(s.repins)"></span>
                        <span x-show="Number(s.delta_repins || 0) > 0" class="text-emerald-500 font-bold ml-1" x-text="'(+' + formatNumber(s.delta_repins) + ')'"></span>
                      </td>
                      <td class="py-3 px-4 text-right font-medium text-slate-700 dark:text-slate-300">
                        <span x-text="formatNumber(s.comments)"></span>
                        <span x-show="Number(s.delta_comments || 0) > 0" class="text-emerald-500 font-bold ml-1" x-text="'(+' + formatNumber(s.delta_comments) + ')'"></span>
                      </td>
                      <td class="py-3 px-4 text-right font-medium text-slate-700 dark:text-slate-300">
                        <span x-text="formatNumber(s.shares || 0)"></span>
                        <span x-show="Number(s.delta_shares || 0) > 0" class="text-emerald-500 font-bold ml-1" x-text="'(+' + formatNumber(s.delta_shares) + ')'"></span>
                      </td>
                      <td class="py-3 px-4 text-right font-medium text-slate-700 dark:text-slate-300">
                        <span x-text="formatNumber(s.reactions || 0)"></span>
                        <span x-show="Number(s.delta_reactions || 0) > 0" class="text-emerald-500 font-bold ml-1" x-text="'(+' + formatNumber(s.delta_reactions) + ')'"></span>
                      </td>
                      <td class="py-3 px-5 text-center">
                        <button type="button" @click="deletePinSnapshot(s.id)" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 text-[11px] font-semibold transition cursor-pointer">
                          <i data-lucide="trash-2" class="w-3 h-3"></i>
                          <span>Delete</span>
                        </button>
                      </td>
                    </tr>
                  </template>
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </template>
    </div>

    <!-- ======================================================== -->
    <!-- DEDICATED BOARD DETAIL PAGE & COMPLETE PIN INVENTORY     -->
    <!-- Route: /:username/:board                                 -->
    <!-- ======================================================== -->
    <div x-show="activeBoardName && !activePinId" x-cloak class="space-y-6 max-w-7xl mx-auto">
      
      <!-- Top Breadcrumbs & Back Bar -->
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div class="flex items-center gap-2 flex-wrap text-xs text-slate-500 dark:text-slate-400">
          <button type="button" @click="closeBoardPage()" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1526] hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 transition shadow-2xs cursor-pointer">
            <i data-lucide="arrow-left" class="w-3.5 h-3.5 text-rose-500"></i>
            <span>Back to @<span x-text="(activeBoardCreator ? activeBoardCreator.username : (activeCreator ? activeCreator.username : '')).replace(/^@+/, '')"></span></span>
          </button>
          <span class="text-slate-300 dark:text-slate-700">/</span>
          <span class="font-medium text-slate-600 dark:text-slate-300">Board Dossier</span>
          <span class="text-slate-300 dark:text-slate-700">/</span>
          <span class="font-bold text-rose-500 flex items-center gap-1">
            <i data-lucide="bookmark" class="w-3.5 h-3.5"></i>
            <span x-text="activeBoardName"></span>
          </span>
        </div>

        <div class="flex items-center gap-2 self-start sm:self-auto">
          <a :href="activeBoard ? (activeBoard.url || ('https://www.pinterest.com/' + (activeBoardCreator ? activeBoardCreator.username : (activeCreator ? activeCreator.username : '')).replace(/^@+/, '') + '/' + encodeURIComponent((activeBoardName || '').toLowerCase().replace(/\s+/g, '-')))) : '#'" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-bold transition shadow-2xs">
            <span>View Board on Pinterest</span>
            <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
          </a>
        </div>
      </div>

      <!-- Board Hero Header Card -->
      <div class="rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#0d1526] p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div class="flex items-start sm:items-center gap-4">
          <!-- Board Cover / Icon -->
          <div class="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shrink-0 shadow-md">
            <template x-if="activeBoard && activeBoard.image_cover_url">
              <img :src="activeBoard.image_cover_url" :alt="activeBoardName" class="w-full h-full object-cover" />
            </template>
            <template x-if="!activeBoard || !activeBoard.image_cover_url">
              <div class="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-purple-600/20 via-pink-600/10 to-rose-600/20 text-purple-500">
                <i data-lucide="layout-grid" class="w-8 h-8 mb-0.5 opacity-80"></i>
                <span class="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Board</span>
              </div>
            </template>
          </div>

          <!-- Board Title & Context -->
          <div class="space-y-1.5">
            <div class="flex items-center gap-2 flex-wrap">
              <h1 class="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight" x-text="activeBoardName"></h1>
              <span class="px-2.5 py-0.5 rounded-full text-[10.5px] font-mono font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">Pinterest Board</span>
            </div>

            <div class="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
              <span class="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                <i data-lucide="user" class="w-3.5 h-3.5 text-rose-500"></i>
                <span>@<span x-text="(activeBoardCreator ? activeBoardCreator.username : (activeCreator ? activeCreator.username : '')).replace(/^@+/, '')"></span></span>
              </span>
              <span class="text-slate-300 dark:text-slate-700">•</span>
              <span x-text="(activeBoard && activeBoard.created_at) ? ('Created ' + new Date(activeBoard.created_at).toLocaleDateString()) : 'Curated Board'"></span>
              <template x-if="activeBoard && activeBoard.last_pinned_at">
                <span class="flex items-center gap-1">
                  <span class="text-slate-300 dark:text-slate-700">•</span>
                  <span x-text="'Last Pinned: ' + new Date(activeBoard.last_pinned_at).toLocaleDateString()"></span>
                </span>
              </template>
            </div>

            <p class="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 max-w-2xl pt-0.5" x-text="(activeBoard && activeBoard.description) ? activeBoard.description : 'High-density algorithmic pin inventory and commercial product classification for this curated board.'"></p>
          </div>
        </div>

        <!-- Quick Board Actions -->
        <div class="flex items-center gap-2 shrink-0 flex-wrap">
          <button type="button" @click="refreshBoardDetail()" class="px-3.5 py-2.5 rounded-xl text-xs font-bold border border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 transition active:scale-95 flex items-center space-x-1.5 shadow-2xs cursor-pointer" title="Scrape authentic board topics (board_vase) & follower stats from Pinterest">
            <i data-lucide="sparkles" class="w-4 h-4"></i>
            <span>Sync Topics (board_vase)</span>
          </button>
          <button type="button" @click="crawlSingleBoardGha(activeBoardName)" class="px-4 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white transition active:scale-95 flex items-center space-x-1.5 shadow-sm cursor-pointer" title="Crawl this specific board with 20 parallel GitHub Actions runners">
            <i data-lucide="zap" class="w-4 h-4"></i>
            <span>Harvest Board (GHA 20-Shards)</span>
          </button>
        </div>
      </div>

      <!-- Algorithmic Related Interests (board_vase) -->
      <template x-if="activeBoard && activeBoard.board_vase && activeBoard.board_vase.length > 0">
        <div class="p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#0d1526] shadow-2xs space-y-2.5">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
              <i data-lucide="sparkles" class="w-3.5 h-3.5 text-purple-500"></i>
              <span>Discovered Algorithmic Related Topics (board_vase)</span>
              <span class="px-2 py-0.5 rounded-full text-[10px] font-mono bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 font-bold" x-text="activeBoard.board_vase.length + ' topics'"></span>
            </div>
            <span class="text-[11px] text-slate-400">Click any topic to filter board pins</span>
          </div>
          <div class="flex flex-wrap gap-1.5">
            <template x-for="v in activeBoard.board_vase" :key="v.text || v">
              <div class="inline-flex items-center rounded-xl bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20 overflow-hidden hover:bg-purple-500/20 transition">
                <button type="button" @click="boardPinsSearch = (v.text || v)" class="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold cursor-pointer" :title="'Filter board pins for: ' + (v.text || v)">
                  <span>#</span>
                  <span x-text="v.text || v"></span>
                </button>
                <template x-if="v.link">
                  <a :href="v.link.startsWith('http') ? v.link : ('https://www.pinterest.com' + v.link)" target="_blank" rel="noopener noreferrer" class="px-1.5 py-1 text-purple-400 hover:text-purple-600 dark:hover:text-white transition" title="Open Topic on Pinterest">
                    <i data-lucide="external-link" class="w-2.5 h-2.5"></i>
                  </a>
                </template>
              </div>
            </template>
          </div>
        </div>
      </template>

      <!-- Empty board_vase prompt -->
      <template x-if="activeBoard && (!activeBoard.board_vase || activeBoard.board_vase.length === 0)">
        <div class="p-3.5 rounded-2xl border border-dashed border-purple-500/30 bg-purple-500/5 flex items-center justify-between gap-3 flex-wrap">
          <div class="flex items-center gap-2 text-xs text-purple-700 dark:text-purple-300">
            <i data-lucide="sparkles" class="w-4 h-4 text-purple-500 shrink-0"></i>
            <span>No algorithmic Related Interests discovered for this board yet.</span>
          </div>
          <button type="button" @click="refreshBoardDetail()" class="px-3 py-1.5 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white shadow-2xs transition active:scale-95 cursor-pointer flex items-center gap-1">
            <i data-lucide="sparkles" class="w-3.5 h-3.5"></i>
            <span>Fetch Related Interests Now</span>
          </button>
        </div>
      </template>

      <!-- 4 KPI Summary Cards -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <!-- KPI 1: Board Pins Total -->
        <div class="p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#0d1526] shadow-xs space-y-1">
          <div class="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">Total Pins In Board</div>
          <div class="text-2xl font-black text-slate-900 dark:text-white font-mono" x-text="formatNumber((activeBoard && activeBoard.pin_count ? activeBoard.pin_count : 0) || boardPinsTotal || boardPins.length || 0)"></div>
          <div class="text-[10.5px] text-slate-400" x-text="boardPins.length + ' indexed in Neon'"></div>
        </div>

        <!-- KPI 2: Total Board Saves -->
        <div class="p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#0d1526] shadow-xs space-y-1">
          <div class="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">Total Cumulative Saves</div>
          <div class="text-2xl font-black text-rose-600 dark:text-rose-400 font-mono" x-text="formatNumber(boardTotalSaves)"></div>
          <div class="text-[10.5px] text-slate-400">Aggregated audience engagement</div>
        </div>

        <!-- KPI 3: Qualified Winning Pins -->
        <div class="p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#0d1526] shadow-xs space-y-1">
          <div class="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">🏆 Qualified Winning Pins</div>
          <div class="text-2xl font-black text-amber-500 font-mono" x-text="formatNumber(boardWinningPinsCount)"></div>
          <div class="text-[10.5px] text-slate-400">Meets 3-tier breakout rules</div>
        </div>

        <!-- KPI 4: Commercial / Product Pins -->
        <div class="p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#0d1526] shadow-xs space-y-1">
          <div class="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">🛒 Commercial Product Pins</div>
          <div class="flex items-baseline gap-1.5">
            <span class="text-2xl font-black text-emerald-500 font-mono" x-text="formatNumber(boardProductPinsCount)"></span>
            <span class="text-xs font-bold text-slate-400" x-show="boardPins.length > 0" x-text="'(' + Math.round((boardProductPinsCount / Math.max(1, boardPins.length)) * 100) + '%)'"></span>
          </div>
          <div class="text-[10.5px] text-slate-400">Identified shopping &amp; affiliate pins</div>
        </div>
      </div>

      <!-- Search, Filters, Sorters & View Switcher Bar -->
      <div class="p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#0d1526] shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        
        <!-- Filter Tabs (All / Winning / Product) -->
        <div class="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto text-xs">
          <button type="button" @click="boardPinsFilter = 'all'; boardPinsPage = 1" class="px-3 py-1.5 rounded-lg font-bold transition cursor-pointer shrink-0" :class="boardPinsFilter === 'all' ? 'bg-white dark:bg-[#0b1120] text-slate-900 dark:text-white shadow-2xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'">
            <span>All Pins</span>
            <span class="ml-1 px-1.5 py-0.2 rounded-md font-mono text-[10px]" :class="boardPinsFilter === 'all' ? 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200' : 'bg-slate-200/60 dark:bg-slate-800 text-slate-500'" x-text="boardPins.length"></span>
          </button>
          
          <button type="button" @click="boardPinsFilter = 'qualified'; boardPinsPage = 1" class="px-3 py-1.5 rounded-lg font-bold transition cursor-pointer shrink-0" :class="boardPinsFilter === 'qualified' ? 'bg-white dark:bg-[#0b1120] text-amber-600 dark:text-amber-400 shadow-2xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'">
            <span>🏆 Winning Pins</span>
            <span class="ml-1 px-1.5 py-0.2 rounded-md font-mono text-[10px]" :class="boardPinsFilter === 'qualified' ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400' : 'bg-slate-200/60 dark:bg-slate-800 text-slate-500'" x-text="boardWinningPinsCount"></span>
          </button>

          <button type="button" @click="boardPinsFilter = 'product'; boardPinsPage = 1" class="px-3 py-1.5 rounded-lg font-bold transition cursor-pointer shrink-0" :class="boardPinsFilter === 'product' ? 'bg-white dark:bg-[#0b1120] text-emerald-600 dark:text-emerald-400 shadow-2xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'">
            <span>🛒 Product Pins</span>
            <span class="ml-1 px-1.5 py-0.2 rounded-md font-mono text-[10px]" :class="boardPinsFilter === 'product' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-slate-200/60 dark:bg-slate-800 text-slate-500'" x-text="boardProductPinsCount"></span>
          </button>
        </div>

        <!-- Search, Sort & View Mode Controls -->
        <div class="flex items-center gap-2.5 flex-wrap">
          <!-- Search input -->
          <div class="relative">
            <input
              type="text"
              x-model="boardPinsSearch"
              placeholder="Search title, desc, domain..."
              class="h-9 w-48 sm:w-60 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 pl-8 pr-3 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none shadow-2xs"
            />
            <i data-lucide="search" class="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-3"></i>
          </div>

          <!-- Sort dropdown -->
          <select x-model="boardPinsSort" class="h-9 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-3 text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none shadow-2xs cursor-pointer">
            <option value="saves_desc">Sort: Most Saves</option>
            <option value="repins_desc">Sort: Most Repins</option>
            <option value="velocity">Sort: Highest Velocity</option>
            <option value="newest">Sort: Newest Pinned</option>
          </select>

          <!-- View toggle buttons -->
          <div class="flex items-center rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-0.5">
            <button
              type="button"
              @click="boardPinsViewMode = 'grid'"
              class="px-2.5 py-1 text-xs font-bold rounded-lg transition flex items-center gap-1 cursor-pointer"
              :class="boardPinsViewMode === 'grid' ? 'bg-white dark:bg-[#0b1120] text-rose-500 shadow-2xs' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'"
              title="Grid Cards View"
            >
              <i data-lucide="layout-grid" class="w-3.5 h-3.5"></i>
              <span class="hidden sm:inline">Grid</span>
            </button>
            <button
              type="button"
              @click="boardPinsViewMode = 'table'"
              class="px-2.5 py-1 text-xs font-bold rounded-lg transition flex items-center gap-1 cursor-pointer"
              :class="boardPinsViewMode === 'table' ? 'bg-white dark:bg-[#0b1120] text-rose-500 shadow-2xs' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'"
              title="Data Table View"
            >
              <i data-lucide="table" class="w-3.5 h-3.5"></i>
              <span class="hidden sm:inline">Table</span>
            </button>
          </div>

          <span class="inline-flex items-center rounded-xl bg-slate-100 dark:bg-slate-900 px-3 py-1.5 text-xs font-mono font-bold text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800" x-text="filteredBoardPins.length + ' pins'"></span>
        </div>
      </div>

      <!-- Loading State -->
      <div x-show="isLoadingBoardPins" class="py-16 flex flex-col items-center justify-center space-y-3">
        <i data-lucide="loader" class="w-8 h-8 text-rose-500 animate-spin"></i>
        <span class="text-xs font-semibold text-slate-400">Loading board pins inventory from Neon database...</span>
      </div>

      <!-- Empty State -->
      <div x-show="!isLoadingBoardPins && filteredBoardPins.length === 0" class="rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#0d1526] p-12 text-center shadow-xs space-y-4">
        <div class="h-16 w-16 mx-auto rounded-2xl bg-purple-500/10 text-purple-500 flex items-center justify-center">
          <i data-lucide="layout-grid" class="w-8 h-8"></i>
        </div>
        <div>
          <h3 class="text-base font-bold text-slate-900 dark:text-white" x-text="boardPins.length === 0 ? 'No pins crawled for this board yet' : 'No pins match current filters'"></h3>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto" x-text="boardPins.length === 0 ? 'Click Harvest Board below to crawl all pins belonging to this board using the 20-shard GitHub Actions matrix.' : 'Try changing your search query or switching to All Pins.'"></p>
        </div>
        <div class="pt-2 flex items-center justify-center gap-3">
          <button x-show="boardPins.length === 0" type="button" @click="crawlSingleBoardGha(activeBoardName)" class="px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-sky-600 to-indigo-600 text-white shadow-sm hover:from-sky-500 hover:to-indigo-500 transition cursor-pointer flex items-center gap-1.5">
            <i data-lucide="zap" class="w-3.5 h-3.5"></i>
            <span>Harvest Board (GHA)</span>
          </button>
          <button x-show="boardPins.length > 0" type="button" @click="boardPinsFilter = 'all'; boardPinsSearch = ''" class="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 transition cursor-pointer">
            Reset Filters
          </button>
        </div>
      </div>

      <!-- VIEW 1: PIN CARDS GRID VIEW -->
      <div x-show="!isLoadingBoardPins && boardPinsViewMode === 'grid' && paginatedBoardPins.length > 0" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        <template x-for="p in paginatedBoardPins" :key="p.pin_id || p.id">
          <div class="group relative flex flex-col rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#0d1526] overflow-hidden shadow-xs hover:shadow-md hover:border-rose-500/40 dark:hover:border-rose-500/40 transition-all duration-200">
            
            <!-- Pin Image Container -->
            <div class="relative h-64 w-full overflow-hidden bg-slate-100 dark:bg-slate-900 cursor-pointer" @click="openPinPage(p)">
              <img :src="p.image_url" :alt="p.title" loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
              
              <!-- Gradient Overlay -->
              <div class="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent opacity-80 group-hover:opacity-90 transition-opacity"></div>

              <!-- Top Badges -->
              <div class="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between gap-1 flex-wrap pointer-events-none">
                <div class="flex items-center gap-1">
                  <!-- Product Pin Indicator -->
                  <template x-if="p.is_product">
                    <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-600 text-white shadow-md">
                      <i data-lucide="shopping-bag" class="w-3 h-3"></i>
                      <span>Product</span>
                    </span>
                  </template>

                  <!-- Winning Pin Indicator -->
                  <template x-if="p.is_qualified">
                    <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-500 text-slate-950 shadow-md">
                      <i data-lucide="trophy" class="w-3 h-3"></i>
                      <span>Winning</span>
                    </span>
                  </template>
                </div>

                <!-- Inspect Button -->
                <button type="button" @click.stop="openPinPage(p)" class="p-1.5 rounded-full bg-slate-900/80 backdrop-blur-md text-white/90 hover:text-white hover:bg-rose-600 transition pointer-events-auto shadow-xs" title="Open Full Pin Dossier">
                  <i data-lucide="maximize-2" class="w-3.5 h-3.5"></i>
                </button>
              </div>

              <!-- Bottom Metrics on Image -->
              <div class="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between text-white text-[11px] font-mono font-bold">
                <div class="flex items-center gap-2">
                  <span class="px-2 py-0.5 rounded-lg bg-rose-600/90 backdrop-blur-md shadow-xs flex items-center gap-1">
                    <i data-lucide="pin" class="w-3 h-3"></i>
                    <span x-text="formatNumber(p.saves ?? p.save_count ?? 0) + ' saves'"></span>
                  </span>
                  <template x-if="Number(p.repins ?? p.repin_count ?? 0) > 0">
                    <span class="px-2 py-0.5 rounded-lg bg-slate-900/80 backdrop-blur-md border border-white/10 flex items-center gap-1">
                      <i data-lucide="repeat" class="w-3 h-3 text-sky-400"></i>
                      <span x-text="formatNumber(p.repins ?? p.repin_count)"></span>
                    </span>
                  </template>
                </div>
              </div>

            </div>

            <!-- Pin Content Body -->
            <div class="p-4 flex-1 flex flex-col justify-between space-y-3">
              <div>
                <h4 class="font-bold text-xs sm:text-sm text-slate-900 dark:text-white line-clamp-2 hover:text-rose-500 transition cursor-pointer" :title="p.title" x-text="p.title || 'Untitled Pin'" @click="openPinPage(p)"></h4>
                <p class="text-[11px] text-slate-500 line-clamp-2 mt-1" x-text="p.description || 'No description available.'"></p>
              </div>

              <div class="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <!-- Destination URL / Domain -->
                <div class="flex items-center justify-between text-[11px]">
                  <template x-if="p.destination_url">
                    <a :href="p.destination_url" target="_blank" rel="noopener noreferrer" class="text-sky-500 hover:underline flex items-center gap-1 truncate max-w-[180px]" :title="p.destination_url">
                      <i data-lucide="link" class="w-3 h-3 shrink-0"></i>
                      <span class="truncate" x-text="p.link_domain || p.domain || 'Destination'"></span>
                    </a>
                  </template>
                  <template x-if="!p.destination_url">
                    <span class="text-slate-400 italic">No outbound link</span>
                  </template>

                  <span class="text-[10px] text-slate-400 font-mono" x-text="p.created_at_pinterest ? new Date(p.created_at_pinterest).toLocaleDateString() : 'Active'"></span>
                </div>

                <!-- Footer Action Buttons -->
                <div class="flex items-center gap-2 pt-1">
                  <button type="button" @click="openPinPage(p)" class="flex-1 py-1.5 px-2.5 rounded-xl text-xs font-bold bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 transition active:scale-95 flex items-center justify-center gap-1 cursor-pointer">
                    <i data-lucide="eye" class="w-3.5 h-3.5"></i>
                    <span>Inspect Pin</span>
                  </button>
                  <a :href="'https://www.pinterest.com/pin/' + (p.pin_id || p.id) + '/'" target="_blank" rel="noopener noreferrer" class="p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0b1120] text-slate-500 hover:text-rose-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition" title="Open on Pinterest">
                    <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                  </a>
                  <button type="button" @click="stagePinAction(p.pin_id || p.id)" class="p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0b1120] text-slate-500 hover:text-emerald-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer" title="Stage Pin for Repurpose">
                    <i data-lucide="play-circle" class="w-3.5 h-3.5"></i>
                  </button>
                </div>

              </div>
            </div>

          </div>
        </template>
      </div>

      <!-- VIEW 2: HIGH-DENSITY DATA TABLE -->
      <div x-show="!isLoadingBoardPins && boardPinsViewMode === 'table' && paginatedBoardPins.length > 0" class="border border-slate-200/90 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-[#0d1526] shadow-xs">
        <div class="overflow-x-auto min-w-full">
          <table class="w-full text-left text-xs border-collapse">
            <thead class="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th class="py-3 px-4 w-14">Pin</th>
                <th class="py-3 px-4">Title &amp; Destination</th>
                <th class="py-3 px-3 text-center">Product?</th>
                <th class="py-3 px-3 text-center">Status</th>
                <th class="py-3 px-4 text-right">Saves</th>
                <th class="py-3 px-4 text-right">Repins</th>
                <th class="py-3 px-4 text-right">Velocity</th>
                <th class="py-3 px-4 text-center">Date</th>
                <th class="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
              <template x-for="p in paginatedBoardPins" :key="p.pin_id || p.id">
                <tr class="hover:bg-slate-50/80 dark:hover:bg-slate-900/40 transition">
                  
                  <!-- Thumbnail -->
                  <td class="py-2.5 px-4 w-14">
                    <div class="w-11 h-14 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 cursor-pointer" @click="openPinPage(p)">
                      <img :src="p.image_url" loading="lazy" class="w-full h-full object-cover" />
                    </div>
                  </td>

                  <!-- Title & Domain -->
                  <td class="py-2.5 px-4 font-sans font-bold text-slate-900 dark:text-white max-w-sm">
                    <div class="line-clamp-2 hover:text-rose-500 transition cursor-pointer" :title="p.title" x-text="p.title || 'Untitled Pin'" @click="openPinPage(p)"></div>
                    <div class="flex items-center gap-2 mt-1 text-[10.5px] font-normal font-mono">
                      <span class="text-slate-400" x-text="'ID: ' + (p.pin_id || p.id)"></span>
                      <template x-if="p.destination_url">
                        <a :href="p.destination_url" target="_blank" rel="noopener noreferrer" class="text-sky-500 hover:underline flex items-center gap-0.5 truncate max-w-[180px]">
                          <i data-lucide="link" class="w-3 h-3"></i>
                          <span x-text="p.link_domain || p.domain || 'Link'"></span>
                        </a>
                      </template>
                    </div>
                  </td>

                  <!-- Product Pin Indicator -->
                  <td class="py-2.5 px-3 text-center font-sans">
                    <template x-if="p.is_product">
                      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                        <i data-lucide="shopping-bag" class="w-2.5 h-2.5"></i>
                        <span>Product</span>
                      </span>
                    </template>
                    <template x-if="!p.is_product">
                      <span class="text-[10px] text-slate-400 font-mono">—</span>
                    </template>
                  </td>

                  <!-- Status -->
                  <td class="py-2.5 px-3 text-center font-sans">
                    <template x-if="p.is_qualified">
                      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                        <span>🏆 Winning</span>
                      </span>
                    </template>
                    <template x-if="!p.is_qualified">
                      <span class="text-[10px] text-slate-400 font-mono">Regular</span>
                    </template>
                  </td>

                  <!-- Saves -->
                  <td class="py-2.5 px-4 text-right font-bold text-slate-900 dark:text-white" x-text="formatNumber(p.saves ?? p.save_count ?? 0)"></td>

                  <!-- Repins -->
                  <td class="py-2.5 px-4 text-right text-slate-700 dark:text-slate-300" x-text="formatNumber(p.repins ?? p.repin_count ?? 0)"></td>

                  <!-- Velocity -->
                  <td class="py-2.5 px-4 text-right text-slate-700 dark:text-slate-300" x-text="Number(p.velocity || 0).toFixed(1)"></td>

                  <!-- Date -->
                  <td class="py-2.5 px-4 text-center font-sans text-[11px] text-slate-500" x-text="p.created_at_pinterest ? new Date(p.created_at_pinterest).toLocaleDateString() : '—'"></td>

                  <!-- Actions -->
                  <td class="py-2.5 px-4 text-right font-sans">
                    <div class="inline-flex items-center gap-1.5 justify-end">
                      <button type="button" @click="openPinPage(p)" class="px-2.5 py-1 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400 text-[11px] font-bold hover:bg-rose-500/20 transition cursor-pointer" title="Inspect Pin">
                        <i data-lucide="eye" class="w-3 h-3 inline"></i>
                        <span>Inspect</span>
                      </button>
                      <a :href="'https://www.pinterest.com/pin/' + (p.pin_id || p.id) + '/'" target="_blank" rel="noopener noreferrer" class="p-1 rounded-lg text-slate-400 hover:text-rose-500 transition" title="Open on Pinterest">
                        <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                      </a>
                    </div>
                  </td>

                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Pagination Bar -->
      <div x-show="!isLoadingBoardPins && filteredBoardPins.length > 0" class="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 px-5 py-3 bg-white dark:bg-[#0d1526] rounded-2xl shadow-xs text-xs text-slate-500">
        <span x-text="'Showing ' + (((boardPinsPage - 1) * boardPinsPageSize) + 1) + '-' + Math.min(boardPinsPage * boardPinsPageSize, filteredBoardPins.length) + ' of ' + filteredBoardPins.length + ' pins'"></span>
        <div class="flex items-center gap-2">
          <button @click="boardPinsPage = Math.max(1, boardPinsPage - 1)" :disabled="boardPinsPage <= 1" class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0b1120] px-3 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 disabled:opacity-40 transition shadow-2xs cursor-pointer">Previous</button>
          <span class="font-bold text-slate-900 dark:text-white" x-text="'Page ' + boardPinsPage + ' of ' + boardPinsTotalPages"></span>
          <button @click="boardPinsPage = boardPinsPage + 1" :disabled="boardPinsPage >= boardPinsTotalPages" class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0b1120] px-3 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 disabled:opacity-40 transition shadow-2xs cursor-pointer">Next</button>
        </div>
      </div>

    </div>

    <!-- ======================================================== -->
    <!-- MAIN DASHBOARD TABS (Hidden when viewing dedicated Pin/Board) -->
    <!-- ======================================================== -->
    <div x-show="!activePinId && !activeBoardName" class="space-y-6">

    <!-- ======================================================== -->
    <!-- UNIFIED TAB: 🌿 RELATED PINS HUB (SEEDS, INTERSECTIONS, EXPLORER) -->
    <!-- Combines Tracked Seeds, Global Intersections & Master Explorer -->
    <!-- ======================================================== -->
    <div x-show="currentTab === 'related_pins' || currentTab === 'seeds' || currentTab === 'intersections' || currentTab === 'explorer'" class="space-y-6">
      
      <!-- Unified Related Pins Header -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div class="flex items-center space-x-3">
          <div class="h-11 w-11 rounded-2xl bg-gradient-to-tr from-rose-600 via-amber-500 to-sky-600 text-white flex items-center justify-center shadow-md shadow-rose-950/20">
            <i data-lucide="git-fork" class="w-6 h-6"></i>
          </div>
          <div>
            <div class="flex items-center space-x-2">
              <h1 class="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">Related Pins Intelligence</h1>
              <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">HUB</span>
            </div>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Unified discovery: Tracked seed nodes, multi-pin global intersections, and candidate graph explorer in one single place.</p>
          </div>
        </div>

        <div class="flex items-center space-x-2 flex-wrap gap-y-2">
          <button @click="openAddSeedModal()" class="px-3.5 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-sm transition active:scale-95 flex items-center space-x-1.5">
            <i data-lucide="plus-circle" class="w-4 h-4"></i>
            <span>Add Seeds</span>
          </button>
          <button @click="openCrawlModal()" class="px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-sm transition active:scale-95 flex items-center space-x-1.5">
            <i data-lucide="zap" class="w-4 h-4"></i>
            <span>Crawl</span>
          </button>
          <button @click="exportCandidatesCSV()" class="px-3 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition flex items-center space-x-1.5 shadow-sm">
            <i data-lucide="download" class="w-3.5 h-3.5"></i>
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      <!-- 5-KPI Ribbon -->
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <!-- KPI 1: Tracked Seeds -->
        <div @click="relatedSubTab = 'seeds'" class="p-3.5 rounded-2xl bg-white dark:bg-[#0d1526] border cursor-pointer transition hover:border-rose-500/50 shadow-sm" :class="relatedSubTab === 'seeds' ? 'border-rose-500/80 ring-2 ring-rose-500/20' : 'border-slate-200/90 dark:border-slate-800'">
          <div class="flex items-center justify-between">
            <span class="text-[10px] font-mono uppercase text-slate-500 dark:text-slate-400 font-bold">Tracked Seeds</span>
            <i data-lucide="folder-git-2" class="w-4 h-4 text-rose-500"></i>
          </div>
          <div class="mt-1 text-xl font-mono font-extrabold text-slate-900 dark:text-white" x-text="seeds.length"></div>
          <div class="text-[10px] text-slate-400 font-medium mt-0.5 truncate" x-text="seeds.filter(s => s.last_crawled_at).length + ' crawled'"></div>
        </div>

        <!-- KPI 2: Global Intersections -->
        <div @click="relatedSubTab = 'intersections'" class="p-3.5 rounded-2xl bg-white dark:bg-[#0d1526] border cursor-pointer transition hover:border-amber-500/50 shadow-sm" :class="relatedSubTab === 'intersections' ? 'border-amber-500/80 ring-2 ring-amber-500/20' : 'border-slate-200/90 dark:border-slate-800'">
          <div class="flex items-center justify-between">
            <span class="text-[10px] font-mono uppercase text-slate-500 dark:text-slate-400 font-bold">Intersections</span>
            <i data-lucide="flame" class="w-4 h-4 text-amber-500"></i>
          </div>
          <div class="mt-1 text-xl font-mono font-extrabold text-amber-600 dark:text-amber-400" x-text="intersections.length"></div>
          <div class="text-[10px] text-slate-400 font-medium mt-0.5 truncate">≥ 2 seeds overlap</div>
        </div>

        <!-- KPI 3: Graph Candidates -->
        <div @click="relatedSubTab = 'explorer'" class="p-3.5 rounded-2xl bg-white dark:bg-[#0d1526] border cursor-pointer transition hover:border-sky-500/50 shadow-sm" :class="relatedSubTab === 'explorer' ? 'border-sky-500/80 ring-2 ring-sky-500/20' : 'border-slate-200/90 dark:border-slate-800'">
          <div class="flex items-center justify-between">
            <span class="text-[10px] font-mono uppercase text-slate-500 dark:text-slate-400 font-bold">Candidates</span>
            <i data-lucide="database" class="w-4 h-4 text-sky-500"></i>
          </div>
          <div class="mt-1 text-xl font-mono font-extrabold text-sky-600 dark:text-sky-400" x-text="formatNumber(overview.total_candidates)"></div>
          <div class="text-[10px] text-slate-400 font-medium mt-0.5 truncate">Discovered graph</div>
        </div>

        <!-- KPI 4: High Velocity -->
        <div class="p-3.5 rounded-2xl bg-white dark:bg-[#0d1526] border border-slate-200/90 dark:border-slate-800 shadow-sm">
          <div class="flex items-center justify-between">
            <span class="text-[10px] font-mono uppercase text-slate-500 dark:text-slate-400 font-bold">High Velocity</span>
            <i data-lucide="zap" class="w-4 h-4 text-emerald-500"></i>
          </div>
          <div class="mt-1 text-xl font-mono font-extrabold text-emerald-600 dark:text-emerald-400" x-text="formatNumber(overview.high_velocity_candidates)"></div>
          <div class="text-[10px] text-slate-400 font-medium mt-0.5 truncate">Surging growth</div>
        </div>

        <!-- KPI 5: Commercial Gap -->
        <div class="p-3.5 rounded-2xl bg-white dark:bg-[#0d1526] border border-slate-200/90 dark:border-slate-800 shadow-sm col-span-2 sm:col-span-1">
          <div class="flex items-center justify-between">
            <span class="text-[10px] font-mono uppercase text-slate-500 dark:text-slate-400 font-bold">Commercial Gap</span>
            <i data-lucide="trending-up" class="w-4 h-4 text-purple-500"></i>
          </div>
          <div class="mt-1 text-xl font-mono font-extrabold text-purple-600 dark:text-purple-400" x-text="(overview.avg_commercial_gap || 0) + '%'"></div>
          <div class="text-[10px] text-slate-400 font-medium mt-0.5 truncate">Arbitrage spread</div>
        </div>
      </div>

      <!-- Unified Sub-Tabs Navigation Bar -->
      <div class="flex items-center space-x-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        <button @click="relatedSubTab = 'seeds'" class="flex items-center space-x-2 px-3.5 py-2 text-xs font-bold rounded-xl transition" :class="relatedSubTab === 'seeds' ? 'bg-rose-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900'">
          <i data-lucide="folder-git-2" class="w-3.5 h-3.5"></i>
          <span>Tracked Seeds</span>
          <span class="px-1.5 py-0.5 rounded text-[10px] font-mono" :class="relatedSubTab === 'seeds' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-800'" x-text="seeds.length"></span>
        </button>

        <button @click="relatedSubTab = 'intersections'" class="flex items-center space-x-2 px-3.5 py-2 text-xs font-bold rounded-xl transition" :class="relatedSubTab === 'intersections' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900'">
          <i data-lucide="flame" class="w-3.5 h-3.5"></i>
          <span>Global Intersections</span>
          <span class="px-1.5 py-0.5 rounded text-[10px] font-mono" :class="relatedSubTab === 'intersections' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-800'" x-text="intersections.length"></span>
        </button>

        <button @click="relatedSubTab = 'explorer'" class="flex items-center space-x-2 px-3.5 py-2 text-xs font-bold rounded-xl transition" :class="relatedSubTab === 'explorer' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900'">
          <i data-lucide="database" class="w-3.5 h-3.5"></i>
          <span>Master Explorer</span>
          <span class="px-1.5 py-0.5 rounded text-[10px] font-mono" :class="relatedSubTab === 'explorer' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-800'" x-text="formatNumber(overview.total_candidates)"></span>
        </button>
      </div>

      <!-- Sub-Tab 1: 📁 TRACKED SEEDS (GRID & DEDICATED SEED DOSSIER) -->
      <div x-show="relatedSubTab === 'seeds'" class="space-y-6">

      <!-- View A: Modern Grid & Table of Tracked Seeds -->
      <template x-if="!activeDossierSeed">
        <div class="space-y-4">
          <!-- Top Overview & Stats Bar -->
          <div class="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white dark:bg-[#0d1526] p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-sm">
            <div>
              <h2 class="text-base font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                <i data-lucide="layers" class="w-4 h-4 text-rose-500"></i>
                <span>Tracked Seeds in Neon Postgres Database</span>
              </h2>
              <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Manage cluster seed nodes, execute multi-seed crawls via GitHub Actions, and inspect isolated telemetry quotas.</p>
            </div>
            <div class="flex items-center space-x-2 flex-wrap text-xs font-mono">
              <span class="px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                Total Seeds: <strong class="text-rose-600 dark:text-rose-400" x-text="seeds.length">0</strong>
              </span>
              <span class="px-2.5 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400">
                Crawled: <strong x-text="seeds.filter(s => s.last_crawled_at).length">0</strong>
              </span>
              <span class="px-2.5 py-1 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400">
                Queued: <strong x-text="seeds.filter(s => !s.last_crawled_at).length">0</strong>
              </span>
            </div>
          </div>

          <!-- Seeds Control & Filter Toolbar -->
          <div class="bg-white dark:bg-[#0d1526] p-3.5 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            
            <!-- Left: Search & Filter Inputs -->
            <div class="flex items-center space-x-2 flex-1 flex-wrap gap-y-2">
              <!-- Search Input -->
              <div class="relative flex-1 min-w-[200px] max-w-md">
                <i data-lucide="search" class="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"></i>
                <input type="text" x-model="seedSearch" placeholder="Filter by Pin ID or Label..." class="w-full pl-9 pr-7 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-rose-500 font-mono">
                <button x-show="seedSearch" @click="seedSearch = ''" class="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <i data-lucide="x" class="w-3 h-3"></i>
                </button>
              </div>

              <!-- Status Filter -->
              <select x-model="seedFilterStatus" class="px-2.5 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-medium focus:outline-none focus:border-rose-500">
                <option value="all">Status: All</option>
                <option value="crawled">Crawled</option>
                <option value="pending">Pending Crawl</option>
              </select>

              <!-- Type Filter -->
              <select x-model="seedFilterType" class="px-2.5 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-medium focus:outline-none focus:border-rose-500">
                <option value="all">Type: All</option>
                <option value="competitor">Competitor Clusters</option>
                <option value="internal">Internal Seeds</option>
              </select>

              <!-- Sort Dropdown -->
              <select x-model="seedSort" class="px-2.5 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-medium focus:outline-none focus:border-rose-500 font-mono">
                <option value="crawled_desc">Sort: Newest Crawled</option>
                <option value="candidates_desc">Sort: Harvested Nodes (High-Low)</option>
                <option value="candidates_asc">Sort: Harvested Nodes (Low-High)</option>
                <option value="gap_desc">Sort: Commercial Gap</option>
                <option value="id_desc">Sort: Pin ID</option>
              </select>
            </div>

            <!-- Right: View Toggle, Select All & Quick Add -->
            <div class="flex items-center space-x-2 justify-end">
              <!-- Select All Toggle -->
              <button @click="toggleSelectAllSeeds()" class="px-3 py-1.5 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition active:scale-95 flex items-center space-x-1.5">
                <i :data-lucide="isAllSeedsSelected ? 'check-square' : 'square'" class="w-3.5 h-3.5" :class="isAllSeedsSelected ? 'text-rose-600' : 'text-slate-400'"></i>
                <span x-text="isAllSeedsSelected ? 'Deselect All' : 'Select All'"></span>
              </button>

              <!-- View Switcher (Grid vs Table) -->
              <div class="flex items-center bg-slate-100 dark:bg-slate-900 p-0.5 rounded-xl border border-slate-200 dark:border-slate-800">
                <button @click="seedViewMode = 'grid'" :class="seedViewMode === 'grid' ? 'bg-white dark:bg-slate-800 text-rose-600 dark:text-rose-400 shadow-sm font-bold' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'" class="p-1.5 px-2.5 rounded-lg text-xs flex items-center space-x-1 transition" title="Grid Cards View">
                  <i data-lucide="layout-grid" class="w-3.5 h-3.5"></i>
                  <span class="hidden sm:inline">Cards</span>
                </button>
                <button @click="seedViewMode = 'table'" :class="seedViewMode === 'table' ? 'bg-white dark:bg-slate-800 text-rose-600 dark:text-rose-400 shadow-sm font-bold' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'" class="p-1.5 px-2.5 rounded-lg text-xs flex items-center space-x-1 transition" title="Compact Table View">
                  <i data-lucide="table" class="w-3.5 h-3.5"></i>
                  <span class="hidden sm:inline">Table</span>
                </button>
              </div>

              <!-- Quick Bulk Add Button -->
              <button @click="openAddSeedModal('bulk')" class="px-3 py-1.5 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-500 text-white transition active:scale-95 flex items-center space-x-1.5 shadow-sm shadow-rose-900/20">
                <i data-lucide="file-plus-2" class="w-3.5 h-3.5"></i>
                <span class="hidden sm:inline">Bulk Pins</span>
                <span class="sm:hidden">Bulk</span>
              </button>
            </div>
          </div>

          <!-- Sticky Floating Bulk Actions Bar (Appears when >= 1 seed is selected) -->
          <div x-show="selectedSeedIds.length > 0" x-cloak class="sticky top-20 z-30 bg-slate-900 text-white dark:bg-[#111c35] dark:text-slate-100 p-3 px-4 rounded-2xl shadow-xl border border-rose-500/30 flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2">
            <div class="flex items-center space-x-3">
              <span class="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping"></span>
              <span class="text-xs font-mono font-bold">
                <span class="text-rose-400 text-sm font-extrabold" x-text="selectedSeedIds.length"></span> seeds selected
              </span>
            </div>

            <div class="flex items-center space-x-2">
              <!-- Crawl Selected -->
              <button @click="openCrawlModal('selected')" class="px-3 py-1.5 rounded-xl bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white text-xs font-bold transition flex items-center space-x-1.5 shadow-sm active:scale-95">
                <i data-lucide="zap" class="w-3.5 h-3.5"></i>
                <span>⚡ Crawl Selected (<span x-text="selectedSeedIds.length"></span>)</span>
              </button>

              <!-- Delete Selected from Database -->
              <button @click="openDeleteModal('selected')" class="px-3 py-1.5 rounded-xl bg-rose-700 hover:bg-rose-600 text-white text-xs font-bold transition flex items-center space-x-1.5 shadow-sm active:scale-95">
                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                <span>🗑️ Delete & Purge DB</span>
              </button>

              <!-- Export Selected -->
              <button @click="exportSelectedSeeds()" class="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition flex items-center space-x-1.5 active:scale-95">
                <i data-lucide="download" class="w-3.5 h-3.5"></i>
                <span class="hidden sm:inline">Export</span>
              </button>

              <!-- Clear Selection -->
              <button @click="selectedSeedIds = []" class="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition" title="Clear selection">
                <i data-lucide="x" class="w-4 h-4"></i>
              </button>
            </div>
          </div>

          <!-- 1. Grid of Seed Cards (When seedViewMode === 'grid') -->
          <div x-show="seedViewMode === 'grid'" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            <template x-for="seed in filteredSeeds" :key="seed.pin_id">
              <div class="bg-white dark:bg-[#0d1526] border rounded-2xl p-5 shadow-sm dark:shadow-xl transition space-y-4 flex flex-col justify-between relative group"
                   :class="selectedSeedIds.includes(seed.pin_id) ? 'border-rose-500 ring-2 ring-rose-500/20 bg-rose-50/20 dark:bg-rose-950/20' : 'border-slate-200/90 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-700'">
                
                <div class="space-y-3">
                  <!-- Top Row: Checkbox, Badge & Crawl Timestamp -->
                  <div class="flex items-start justify-between gap-2">
                    <div class="flex items-center space-x-2">
                      <input type="checkbox"
                             :checked="selectedSeedIds.includes(seed.pin_id)"
                             @change="toggleSeedSelection(seed.pin_id)"
                             class="w-4 h-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer">
                      <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider"
                            :class="seed.is_competitor ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20'"
                            x-text="seed.is_competitor ? 'Competitor Cluster' : 'Internal Seed'"></span>
                    </div>

                    <div class="flex items-center space-x-1.5 text-[10px] font-mono text-slate-400">
                      <span x-show="(seed?.total_capsules || 0) > 0" class="px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-500/20" x-text="seed.total_capsules + ' Caps'"></span>
                      <span x-text="seed.last_crawled_at ? new Date(seed.last_crawled_at).toLocaleDateString() : 'Pending'"></span>
                    </div>
                  </div>

                  <!-- Label & Pin ID with Pinterest Link -->
                  <div>
                    <h3 class="font-bold text-sm text-slate-900 dark:text-white line-clamp-2" x-text="seed.label || 'Tracked Cluster Seed'"></h3>
                    <div class="flex items-center space-x-1.5 text-xs font-mono text-slate-500 dark:text-slate-400 mt-1">
                      <span>Pin ID:</span>
                      <a :href="'https://www.pinterest.com/pin/' + seed.pin_id + '/'" target="_blank" class="font-bold text-rose-600 dark:text-rose-400 hover:underline inline-flex items-center space-x-0.5">
                        <span x-text="seed.pin_id"></span>
                        <i data-lucide="external-link" class="w-3 h-3"></i>
                      </a>
                    </div>
                  </div>

                  <!-- Quick Stats Grid -->
                  <div class="grid grid-cols-2 gap-2 text-xs font-mono pt-1">
                    <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                      <div class="text-[10px] text-slate-500">Harvested Nodes</div>
                      <div class="text-xl font-extrabold text-slate-900 dark:text-white mt-0.5" x-text="seed.total_candidates || 0">0</div>
                    </div>
                    <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                      <div class="text-[10px] text-slate-500">Commercial Gap</div>
                      <div class="text-xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5" x-text="(seed.commercial_gap_ratio ? seed.commercial_gap_ratio + '%' : '100%')">100%</div>
                    </div>
                  </div>
                </div>

                <!-- Primary Action Buttons: Inspect, Quick Crawl & Delete -->
                <div class="flex items-center space-x-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
                  <button @click="openSeedDossier(seed)" class="flex-1 flex items-center justify-center space-x-1.5 py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-bold text-xs shadow-sm active:scale-95 transition">
                    <i data-lucide="eye" class="w-3.5 h-3.5"></i>
                    <span>Inspect</span>
                  </button>
                  <button @click.stop="openCrawlModal(seed.pin_id)" class="p-2 rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 transition active:scale-95" title="⚡ Crawl this seed">
                    <i data-lucide="zap" class="w-3.5 h-3.5"></i>
                  </button>
                  <button @click.stop="openDeleteModal(seed)" class="p-2 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 transition active:scale-95" title="Delete & purge seed from database">
                    <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                  </button>
                </div>
              </div>
            </template>
          </div>

          <!-- 2. Compact Table View (When seedViewMode === 'table') -->
          <div x-show="seedViewMode === 'table'" class="bg-white dark:bg-[#0d1526] border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
            <div class="overflow-x-auto">
              <table class="w-full text-left text-xs font-sans">
                <thead class="bg-slate-50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 text-[11px] font-mono text-slate-500 uppercase">
                  <tr>
                    <th class="p-3 pl-4 w-10">
                      <input type="checkbox" :checked="isAllSeedsSelected" @change="toggleSelectAllSeeds()" class="w-4 h-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer">
                    </th>
                    <th class="p-3">Seed Pin ID & Label</th>
                    <th class="p-3">Type</th>
                    <th class="p-3 text-right">Harvested Nodes</th>
                    <th class="p-3 text-right">Guided Capsules</th>
                    <th class="p-3 text-right">Commercial Gap</th>
                    <th class="p-3">Last Crawled</th>
                    <th class="p-3 text-right pr-4">Actions</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                  <template x-for="seed in filteredSeeds" :key="seed.pin_id">
                    <tr class="hover:bg-slate-50/70 dark:hover:bg-slate-900/40 transition"
                        :class="selectedSeedIds.includes(seed.pin_id) ? 'bg-rose-50/20 dark:bg-rose-950/15' : ''">
                      <td class="p-3 pl-4">
                        <input type="checkbox" :checked="selectedSeedIds.includes(seed.pin_id)" @change="toggleSeedSelection(seed.pin_id)" class="w-4 h-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer">
                      </td>
                      <td class="p-3 font-sans">
                        <div class="font-bold text-slate-900 dark:text-white text-xs line-clamp-1" x-text="seed.label || 'Tracked Cluster Seed'"></div>
                        <div class="text-[11px] font-mono text-slate-500 flex items-center space-x-1.5 mt-0.5">
                          <a :href="'https://www.pinterest.com/pin/' + seed.pin_id + '/'" target="_blank" class="text-rose-600 dark:text-rose-400 hover:underline flex items-center space-x-0.5">
                            <span x-text="seed.pin_id"></span>
                            <i data-lucide="external-link" class="w-2.5 h-2.5"></i>
                          </a>
                        </div>
                      </td>
                      <td class="p-3">
                        <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider whitespace-nowrap"
                              :class="seed.is_competitor ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20'"
                              x-text="seed.is_competitor ? 'Competitor' : 'Internal'"></span>
                      </td>
                      <td class="p-3 text-right">
                        <span class="font-bold text-slate-900 dark:text-white" x-text="seed.total_candidates || 0"></span>
                      </td>
                      <td class="p-3 text-right">
                        <span class="px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-500/20 text-[10px] font-bold" x-text="seed.total_capsules || 0"></span>
                      </td>
                      <td class="p-3 text-right">
                        <span class="font-bold text-emerald-600 dark:text-emerald-400" x-text="(seed.commercial_gap_ratio ? seed.commercial_gap_ratio + '%' : '100%')"></span>
                      </td>
                      <td class="p-3 text-[11px] text-slate-500">
                        <span x-text="seed.last_crawled_at ? new Date(seed.last_crawled_at).toLocaleDateString() : 'Pending Crawl'"></span>
                      </td>
                      <td class="p-3 text-right pr-4">
                        <div class="flex items-center justify-end space-x-1.5">
                          <button @click="openSeedDossier(seed)" class="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-bold text-[11px] transition shadow-sm" title="Inspect Seed Cluster">
                            Inspect
                          </button>
                          <button @click.stop="openCrawlModal(seed.pin_id)" class="p-1.5 rounded-lg border border-amber-200 dark:border-amber-900/40 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 transition" title="⚡ Crawl this seed">
                            <i data-lucide="zap" class="w-3.5 h-3.5"></i>
                          </button>
                          <button @click.stop="openDeleteModal(seed)" class="p-1.5 rounded-lg border border-rose-200 dark:border-rose-900/50 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 transition" title="Delete seed">
                            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  </template>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Empty Search/Filter State -->
          <div x-show="filteredSeeds.length === 0" class="bg-white dark:bg-[#0d1526] border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center space-y-3">
            <i data-lucide="inbox" class="w-10 h-10 text-slate-400 mx-auto"></i>
            <h3 class="font-bold text-sm text-slate-700 dark:text-slate-300">No Tracked Seeds Match Your Filter</h3>
            <p class="text-xs text-slate-500 max-w-sm mx-auto">Try clearing your search query or filters, or add new pins using the Bulk Ingestion feature.</p>
            <button @click="seedSearch = ''; seedFilterStatus = 'all'; seedFilterType = 'all';" class="px-3 py-1.5 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200">
              Clear All Filters
            </button>
          </div>
        </div>
      </template>

      <!-- View B: Dedicated Seed Dossier View (Single Seed Isolated Telemetry & All Candidates) -->
      <template x-if="activeDossierSeed">
        <div class="space-y-6">
          
          <!-- Back Navigation Bar -->
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-[#0d1526] p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-sm">
            <button @click="closeSeedDossier()" class="inline-flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition active:scale-95">
              <i data-lucide="arrow-left" class="w-3.5 h-3.5"></i>
              <span>← Back to All Tracked Seeds Grid</span>
            </button>

            <div class="flex items-center space-x-3">
              <span class="text-xs font-mono text-slate-500">Active Seed: <strong class="text-slate-900 dark:text-white" x-text="activeDossierSeed.pin_id"></strong></span>
              <button @click="openRawJsonModal(activeDossierSeed.pin_id)" class="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition active:scale-95 flex items-center space-x-1.5 shadow-sm" title="Import authentic raw Pinterest JSON response (RelatedModulesResource)">
                <i data-lucide="file-input" class="w-3.5 h-3.5"></i>
                <span>📥 Import Raw JSON</span>
              </button>
              <button @click="triggerCrawl(activeDossierSeed.pin_id)" :disabled="crawlStatus.is_crawling" class="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition active:scale-95 flex items-center space-x-1.5 disabled:opacity-50">
                <i data-lucide="refresh-cw" :class="{'animate-spin': crawlStatus.is_crawling}" class="w-3 h-3"></i>
                <span>Re-Crawl This Seed</span>
              </button>
            </div>
          </div>

          <!-- Seed Dossier Header Card -->
          <div class="bg-white dark:bg-[#0d1526] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-6 shadow-sm dark:shadow-xl space-y-4">
            <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
              <div>
                <div class="flex items-center space-x-2">
                  <h2 class="text-lg font-bold text-slate-900 dark:text-white" x-text="activeDossierSeed.label || 'Cluster Seed'"></h2>
                  <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider" :class="activeDossierSeed.is_competitor ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20'" x-text="activeDossierSeed.is_competitor ? 'Competitor Cluster' : 'Internal Seed'"></span>
                </div>
                <div class="text-xs text-slate-500 font-mono mt-1 flex items-center space-x-2">
                  <span>Pin ID: <a :href="'https://www.pinterest.com/pin/' + activeDossierSeed.pin_id + '/'" target="_blank" class="text-rose-600 dark:text-rose-400 hover:underline font-bold" x-text="activeDossierSeed.pin_id"></a></span>
                  <span>•</span>
                  <span>Harvested Candidates: <strong class="text-slate-900 dark:text-white" x-text="dossierCandidates.length">0</strong> nodes</span>
                  <span>•</span>
                  <span>Commercial Gap: <strong class="text-emerald-600" x-text="(activeDossierSeed.commercial_gap_ratio || 100) + '%'"></strong></span>
                </div>
              </div>

              <div class="px-3 py-1.5 rounded-xl bg-sky-500/10 border border-sky-500/20 text-xs font-mono text-sky-700 dark:text-sky-300">
                <span>Evaluation Pool: <strong class="text-slate-900 dark:text-white" x-text="dossierTelemetry.total_engine_quota || 0">0</strong> candidates evaluated &rarr; Top <strong class="text-emerald-600 dark:text-emerald-400" x-text="dossierCandidates.length">0</strong> stored in DB</span>
              </div>
            </div>

            <!-- Seed-Specific Retrieval Quota Stacked Bar -->
            <div class="space-y-2.5">
              <div class="flex items-center justify-between">
                <span class="text-xs font-bold uppercase font-mono tracking-wider text-slate-500">P2P Retrieval Quotas for This Seed</span>
                <span class="text-[11px] font-mono text-slate-400" x-text="'Total Quota: ' + (dossierTelemetry.total_engine_quota || 0) + ' items evaluated'"></span>
              </div>
              <div class="w-full bg-slate-100 dark:bg-slate-900 rounded-xl h-4 overflow-hidden flex border border-slate-200 dark:border-slate-800 shadow-inner">
                <div class="bg-[#0ea5e9] transition-all duration-300" :style="'width: ' + (dossierTelemetry.navboost_pct || 0) + '%'" :title="'NavBoost: ' + (dossierTelemetry.navboost_count || 0) + ' (' + (dossierTelemetry.navboost_pct || 0) + '%)'"></div>
                <div class="bg-[#f43f5e] transition-all duration-300" :style="'width: ' + (dossierTelemetry.recgpt_pct || 0) + '%'" :title="'RecGPT: ' + (dossierTelemetry.recgpt_count || 0) + ' (' + (dossierTelemetry.recgpt_pct || 0) + '%)'"></div>
                <div class="bg-[#10b981] transition-all duration-300" :style="'width: ' + (dossierTelemetry.two_tower_pct || 0) + '%'" :title="'Two-Tower: ' + (dossierTelemetry.two_tower_count || 0) + ' (' + (dossierTelemetry.two_tower_pct || 0) + '%)'"></div>
                <div class="bg-[#f59e0b] transition-all duration-300" :style="'width: ' + (dossierTelemetry.randomwalk_pct || 0) + '%'" :title="'RandomWalk (Pixie): ' + (dossierTelemetry.randomwalk_count || 0) + ' (' + (dossierTelemetry.randomwalk_pct || 0) + '%)'"></div>
                <div class="bg-[#8b5cf6] transition-all duration-300" :style="'width: ' + (dossierTelemetry.fresh_pct || 0) + '%'" :title="'Fresh: ' + (dossierTelemetry.fresh_candidate_count || 0) + ' (' + (dossierTelemetry.fresh_pct || 0) + '%)'"></div>
              </div>
              <div class="flex items-center space-x-2 text-[11px] font-mono text-slate-500 flex-wrap gap-y-1.5">
                <span class="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-lg bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/20">
                  <span class="w-2 h-2 rounded-full bg-[#0ea5e9]"></span>
                  <span>NavBoost: <strong class="font-bold" x-text="dossierTelemetry.navboost_count || 0"></strong></span>
                </span>
                <span class="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-lg bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/20">
                  <span class="w-2 h-2 rounded-full bg-[#f43f5e]"></span>
                  <span>RecGPT: <strong class="font-bold" x-text="dossierTelemetry.recgpt_count || 0"></strong></span>
                </span>
                <span class="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                  <span class="w-2 h-2 rounded-full bg-[#10b981]"></span>
                  <span>Two-Tower: <strong class="font-bold" x-text="dossierTelemetry.two_tower_count || 0"></strong></span>
                </span>
                <span class="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
                  <span class="w-2 h-2 rounded-full bg-[#f59e0b]"></span>
                  <span>RandomWalk: <strong class="font-bold" x-text="dossierTelemetry.randomwalk_count || 0"></strong></span>
                </span>
                <span class="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-lg bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20">
                  <span class="w-2 h-2 rounded-full bg-[#8b5cf6]"></span>
                  <span>Fresh: <strong class="font-bold" x-text="dossierTelemetry.fresh_candidate_count || 0"></strong></span>
                </span>
              </div>
            </div>

            <!-- Seed Color DNA & Lexical Tokens -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs font-mono">
              <div>
                <span class="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Cluster Color Centroids:</span>
                <div class="flex items-center space-x-2 mt-1.5 flex-wrap gap-y-1.5">
                  <template x-for="swatch in (dossierTelemetry.color_centroids || []).slice(0, 5)" :key="swatch.color">
                    <div class="flex items-center space-x-1.5 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
                      <span class="w-3 h-3 rounded-sm border" :style="'background-color: ' + swatch.color"></span>
                      <span class="text-[10px] text-slate-700 dark:text-slate-300" x-text="swatch.color"></span>
                      <span class="text-[9px] text-slate-400" x-text="swatch.percentage + '%'"></span>
                    </div>
                  </template>
                </div>
              </div>

              <div>
                <span class="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Top Lexical NLP Tokens:</span>
                <div class="flex items-center space-x-1.5 mt-1.5 flex-wrap gap-y-1.5">
                  <template x-for="token in (dossierTelemetry.high_save_tokens || []).slice(0, 5)" :key="token.token">
                    <span class="px-2 py-0.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-[10px] font-bold text-slate-800 dark:text-slate-200" x-text="token.token + ' (' + token.tf + ')'"></span>
                  </template>
                </div>
              </div>
            </div>
          </div>

          <!-- Dossier Sub-Navigation: Candidates Table vs Creator Playbook -->
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-2">
            <div class="flex items-center space-x-2">
              <button @click="dossierTab = 'table'" class="px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5" :class="dossierTab === 'table' ? 'bg-rose-600 text-white shadow-sm' : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300'">
                <i data-lucide="list" class="w-3.5 h-3.5"></i>
                <span>Candidates Graph (<span x-text="dossierCandidates.length"></span>)</span>
              </button>
              <button @click="dossierTab = 'playbook'" class="px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5" :class="dossierTab === 'playbook' ? 'bg-rose-600 text-white shadow-sm' : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300'">
                <i data-lucide="sparkles" class="w-3.5 h-3.5 text-amber-400"></i>
                <span>Creator Playbook (RecGPT Matrix)</span>
                <span class="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold uppercase bg-amber-500/20 text-amber-700 dark:text-amber-300">Live DB</span>
              </button>
              <button @click="dossierTab = 'guided_search'" class="px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5" :class="dossierTab === 'guided_search' ? 'bg-purple-600 text-white shadow-sm' : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300'">
                <i data-lucide="compass" class="w-3.5 h-3.5 text-purple-400"></i>
                <span>Guided Search Radar (كبسولات BUBBLE_ONE_COL)</span>
                <span class="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-purple-500/20 text-purple-700 dark:text-purple-300" x-text="dossierGuidedCapsules.length"></span>
              </button>
            </div>

            <!-- Sorting Selector (When Table is Active) -->
            <div x-show="dossierTab === 'table'" class="flex items-center space-x-2">
              <span class="text-xs font-semibold text-slate-500 font-mono hidden sm:inline">Sort:</span>
              <select x-model="dossierSort" @change="reloadDossierCandidates()" class="px-2.5 py-1 rounded-xl text-xs bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 font-mono focus:outline-none focus:border-rose-500">
                <option value="saves">Sort by Total Saves</option>
                <option value="velocity">Sort by Velocity (Fastest Growing)</option>
              </select>
            </div>
          </div>

          <!-- SUB-VIEW 1: CREATOR PLAYBOOK (RecGPT Matrix from Live DB) -->
          <div x-show="dossierTab === 'playbook'" class="space-y-4">
            <div class="bg-white dark:bg-[#0d1526] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-6 shadow-sm dark:shadow-xl space-y-4">
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
                <div>
                  <h3 class="font-bold text-sm text-slate-900 dark:text-white flex items-center space-x-2">
                    <i data-lucide="sparkles" class="w-4 h-4 text-amber-500"></i>
                    <span>Creator Playbook: RecGPT Sequential Trajectory Matrix</span>
                  </h3>
                  <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Pinterest's causal sequential transformer predicts user transition probabilities between meal courses. These 3 candidate nodes are dynamically extracted from Neon for active seed <span class="font-mono text-rose-500" x-text="activeDossierSeed.pin_id"></span>.
                  </p>
                </div>
                <div class="flex items-center space-x-2">
                  <span class="px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                    P2P_RECGPT Active
                  </span>
                </div>
              </div>

              <!-- 3 Dynamic Trajectory Cards Grid -->
              <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
                
                <!-- 1. Dinner Anchor -->
                <div class="p-4 rounded-2xl border border-rose-500/30 bg-rose-500/[0.03] dark:bg-rose-500/[0.05] space-y-3 flex flex-col justify-between">
                  <div class="space-y-2.5">
                    <div class="flex items-center justify-between">
                      <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30">
                        1. Dinner Anchor (Primary Entree)
                      </span>
                      <span class="text-[11px] font-mono text-slate-400" x-text="'Prep: ' + (recgptPlaybook?.dinner_anchor?.prep_time || '15m')"></span>
                    </div>

                    <div class="flex items-start space-x-3">
                      <span class="w-8 h-8 rounded-lg border flex-shrink-0 mt-0.5" :style="'background-color: ' + (recgptPlaybook?.dinner_anchor?.winning_color || '#824d30')"></span>
                      <div class="space-y-1">
                        <div class="font-bold text-slate-900 dark:text-white text-xs line-clamp-2" x-text="recgptPlaybook?.dinner_anchor?.title || 'Dinner Anchor'"></div>
                        <div class="text-[10px] font-mono text-slate-400" x-text="recgptPlaybook?.dinner_anchor?.culinary_color_name"></div>
                      </div>
                    </div>

                    <div class="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] font-mono space-y-1">
                      <div class="flex justify-between">
                        <span class="text-slate-500">Saves:</span>
                        <strong class="text-slate-900 dark:text-white" x-text="Number(recgptPlaybook?.dinner_anchor?.saves || 0).toLocaleString()"></strong>
                      </div>
                      <div class="flex justify-between">
                        <span class="text-slate-500">Save Rate:</span>
                        <strong class="text-emerald-600" x-text="(recgptPlaybook?.dinner_anchor?.save_rate || 0) + '%'"></strong>
                      </div>
                      <div class="flex justify-between">
                        <span class="text-slate-500">Transition Affinity:</span>
                        <strong class="text-purple-600 dark:text-purple-400" x-text="(recgptPlaybook?.dinner_anchor?.recgpt_transition_score || 0) + ' / 100'"></strong>
                      </div>
                      <template x-if="recgptPlaybook?.dinner_anchor?.daily_velocity">
                        <div class="flex justify-between pt-0.5 border-t border-slate-100 dark:border-slate-800">
                          <span class="text-slate-500">Daily Velocity:</span>
                          <strong class="text-emerald-600" x-text="'⚡ ' + recgptPlaybook?.dinner_anchor?.daily_velocity + '/day'"></strong>
                        </div>
                      </template>
                    </div>
                  </div>

                  <button @click="inspectCandidate(recgptPlaybook?.dinner_anchor)" class="w-full py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition active:scale-95 flex items-center justify-center space-x-1.5 shadow-sm">
                    <i data-lucide="zap" class="w-3.5 h-3.5"></i>
                    <span>⚡ Generate Pin Asset</span>
                  </button>
                </div>

                <!-- 2. Navboost Co-visitor -->
                <div class="p-4 rounded-2xl border border-sky-500/30 bg-sky-500/[0.03] dark:bg-sky-500/[0.05] space-y-3 flex flex-col justify-between">
                  <div class="space-y-2.5">
                    <div class="flex items-center justify-between">
                      <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30">
                        2. Navboost Co-visitor (Complementary Side)
                      </span>
                      <span class="text-[11px] font-mono text-slate-400" x-text="'Prep: ' + (recgptPlaybook?.navboost_co_visitor?.prep_time || '20m')"></span>
                    </div>

                    <div class="flex items-start space-x-3">
                      <span class="w-8 h-8 rounded-lg border flex-shrink-0 mt-0.5" :style="'background-color: ' + (recgptPlaybook?.navboost_co_visitor?.winning_color || '#d08c47')"></span>
                      <div class="space-y-1">
                        <div class="font-bold text-slate-900 dark:text-white text-xs line-clamp-2" x-text="recgptPlaybook?.navboost_co_visitor?.title || 'Navboost Side'"></div>
                        <div class="text-[10px] font-mono text-slate-400" x-text="recgptPlaybook?.navboost_co_visitor?.culinary_color_name"></div>
                      </div>
                    </div>

                    <div class="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] font-mono space-y-1">
                      <div class="flex justify-between">
                        <span class="text-slate-500">Saves:</span>
                        <strong class="text-slate-900 dark:text-white" x-text="Number(recgptPlaybook?.navboost_co_visitor?.saves || 0).toLocaleString()"></strong>
                      </div>
                      <div class="flex justify-between">
                        <span class="text-slate-500">Save Rate:</span>
                        <strong class="text-emerald-600" x-text="(recgptPlaybook?.navboost_co_visitor?.save_rate || 0) + '%'"></strong>
                      </div>
                      <div class="flex justify-between">
                        <span class="text-slate-500">Transition Affinity:</span>
                        <strong class="text-sky-600 dark:text-sky-400" x-text="(recgptPlaybook?.navboost_co_visitor?.recgpt_transition_score || 0) + ' / 100'"></strong>
                      </div>
                      <template x-if="recgptPlaybook?.navboost_co_visitor?.daily_velocity">
                        <div class="flex justify-between pt-0.5 border-t border-slate-100 dark:border-slate-800">
                          <span class="text-slate-500">Daily Velocity:</span>
                          <strong class="text-emerald-600" x-text="'⚡ ' + recgptPlaybook?.navboost_co_visitor?.daily_velocity + '/day'"></strong>
                        </div>
                      </template>
                    </div>
                  </div>

                  <button @click="inspectCandidate(recgptPlaybook?.navboost_co_visitor)" class="w-full py-2 px-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs transition active:scale-95 flex items-center justify-center space-x-1.5 shadow-sm">
                    <i data-lucide="zap" class="w-3.5 h-3.5"></i>
                    <span>⚡ Generate Pin Asset</span>
                  </button>
                </div>

                <!-- 3. Session Finisher -->
                <div class="p-4 rounded-2xl border border-amber-500/30 bg-amber-500/[0.03] dark:bg-amber-500/[0.05] space-y-3 flex flex-col justify-between">
                  <div class="space-y-2.5">
                    <div class="flex items-center justify-between">
                      <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                        3. Session Finisher (Board Saver Dessert)
                      </span>
                      <span class="text-[11px] font-mono text-slate-400" x-text="'Prep: ' + (recgptPlaybook?.session_finisher?.prep_time || '10m')"></span>
                    </div>

                    <div class="flex items-start space-x-3">
                      <span class="w-8 h-8 rounded-lg border flex-shrink-0 mt-0.5" :style="'background-color: ' + (recgptPlaybook?.session_finisher?.winning_color || '#b9975f')"></span>
                      <div class="space-y-1">
                        <div class="font-bold text-slate-900 dark:text-white text-xs line-clamp-2" x-text="recgptPlaybook?.session_finisher?.title || 'Session Finisher'"></div>
                        <div class="text-[10px] font-mono text-slate-400" x-text="recgptPlaybook?.session_finisher?.culinary_color_name"></div>
                      </div>
                    </div>

                    <div class="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] font-mono space-y-1">
                      <div class="flex justify-between">
                        <span class="text-slate-500">Saves:</span>
                        <strong class="text-slate-900 dark:text-white" x-text="Number(recgptPlaybook?.session_finisher?.saves || 0).toLocaleString()"></strong>
                      </div>
                      <div class="flex justify-between">
                        <span class="text-slate-500">Save Rate:</span>
                        <strong class="text-emerald-600" x-text="(recgptPlaybook?.session_finisher?.save_rate || 0) + '%'"></strong>
                      </div>
                      <div class="flex justify-between">
                        <span class="text-slate-500">Transition Affinity:</span>
                        <strong class="text-amber-600 dark:text-amber-400" x-text="(recgptPlaybook?.session_finisher?.recgpt_transition_score || 0) + ' / 100'"></strong>
                      </div>
                      <template x-if="recgptPlaybook?.session_finisher?.daily_velocity">
                        <div class="flex justify-between pt-0.5 border-t border-slate-100 dark:border-slate-800">
                          <span class="text-slate-500">Daily Velocity:</span>
                          <strong class="text-emerald-600" x-text="'⚡ ' + recgptPlaybook?.session_finisher?.daily_velocity + '/day'"></strong>
                        </div>
                      </template>
                    </div>
                  </div>

                  <button @click="inspectCandidate(recgptPlaybook?.session_finisher)" class="w-full py-2 px-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs transition active:scale-95 flex items-center justify-center space-x-1.5 shadow-sm">
                    <i data-lucide="zap" class="w-3.5 h-3.5"></i>
                    <span>⚡ Generate Pin Asset</span>
                  </button>
                </div>

              </div>
            </div>
          </div>

          <!-- SUB-VIEW 2: FULL UNCAPPED CANDIDATES TABLE FOR ACTIVE SEED -->
          <div x-show="dossierTab === 'table'" class="bg-white dark:bg-[#0d1526] border border-slate-200/90 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm dark:shadow-xl space-y-3 p-5">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 class="font-bold text-sm text-slate-900 dark:text-white flex items-center space-x-2">
                  <i data-lucide="list" class="w-4 h-4 text-rose-500"></i>
                  <span>Candidates Harvested from Seed <span class="font-mono text-rose-600 dark:text-rose-400" x-text="activeDossierSeed.pin_id"></span></span>
                </h3>
                <p class="text-xs text-slate-500 font-mono" x-text="'Showing all ' + dossierCandidates.length + ' candidate nodes (100% Uncapped)'"></p>
              </div>

              <div class="flex items-center space-x-2">
                <button @click="exportCsv(filteredDossierCandidates, 'seed-' + activeDossierSeed.pin_id + '-candidates.csv')" class="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-semibold shadow-sm transition active:scale-95">
                  <i data-lucide="download" class="w-3.5 h-3.5 text-rose-500"></i>
                  <span>Export CSV</span>
                </button>
              </div>
            </div>

            <!-- Filter & Segment Toolbar for Seed Dossier Candidates -->
            <div class="p-3.5 rounded-2xl bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/80 space-y-3">
              <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                
                <!-- 1. Text Search -->
                <div class="relative flex-1 min-w-[200px]">
                  <i data-lucide="search" class="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400"></i>
                  <input type="text" x-model="dossierFilters.search" placeholder="Search title, domain, OCR text, or pin ID..." class="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-mono text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-rose-500">
                </div>

                <!-- 2. The 4 Dropdown Filter Selectors -->
                <div class="flex items-center space-x-2 flex-wrap gap-y-2">
                  
                  <!-- Engine Provenance Filter -->
                  <div class="flex items-center space-x-1 bg-white dark:bg-slate-900 rounded-xl px-2 py-1 border border-slate-200 dark:border-slate-800 shadow-sm">
                    <span class="text-[10px] font-mono text-slate-400 uppercase font-semibold">Engine:</span>
                    <select x-model="dossierFilters.engine" class="text-xs bg-transparent text-slate-900 dark:text-slate-100 font-mono focus:outline-none cursor-pointer">
                      <option value="all">All Engines</option>
                      <option value="P2P_NAVBOOST">P2P_NAVBOOST (Sky)</option>
                      <option value="P2P_RANDOMWALK">P2P_RANDOMWALK (Emerald)</option>
                      <option value="P2P_TWO_TOWER">P2P_TWO_TOWER (Violet)</option>
                      <option value="P2P_RECGPT">P2P_RECGPT (Rose)</option>
                      <option value="FRESH_COLD_START">FRESH_COLD_START (Cyan)</option>
                      <option value="P2P_SHOPPING_CORPUS">P2P_SHOPPING_CORPUS (Amber)</option>
                    </select>
                  </div>

                  <!-- Velocity Tier Filter -->
                  <div class="flex items-center space-x-1 bg-white dark:bg-slate-900 rounded-xl px-2 py-1 border border-slate-200 dark:border-slate-800 shadow-sm">
                    <span class="text-[10px] font-mono text-slate-400 uppercase font-semibold">Speed:</span>
                    <select x-model="dossierFilters.velocity" class="text-xs bg-transparent text-slate-900 dark:text-slate-100 font-mono focus:outline-none cursor-pointer">
                      <option value="all">All Speeds</option>
                      <option value="explosive">🔥 Explosive (≥ 50/d)</option>
                      <option value="trending">⚡ Trending (10-49/d)</option>
                      <option value="stagnant">💤 Stagnant (&lt; 10/d)</option>
                    </select>
                  </div>

                  <!-- Market Arbitrage Status Filter -->
                  <div class="flex items-center space-x-1 bg-white dark:bg-slate-900 rounded-xl px-2 py-1 border border-slate-200 dark:border-slate-800 shadow-sm">
                    <span class="text-[10px] font-mono text-slate-400 uppercase font-semibold">Market:</span>
                    <select x-model="dossierFilters.market" class="text-xs bg-transparent text-slate-900 dark:text-slate-100 font-mono focus:outline-none cursor-pointer">
                      <option value="all">All Statuses</option>
                      <option value="vacuum">🎯 Vacuum Targets Only (Organic ≥ 5K)</option>
                      <option value="product">🛒 Competitor Products (Etsy/Shopify)</option>
                    </select>
                  </div>

                  <!-- RecGPT Meal Sequence Filter -->
                  <div class="flex items-center space-x-1 bg-white dark:bg-slate-900 rounded-xl px-2 py-1 border border-slate-200 dark:border-slate-800 shadow-sm">
                    <span class="text-[10px] font-mono text-slate-400 uppercase font-semibold">Sequence:</span>
                    <select x-model="dossierFilters.sequence" class="text-xs bg-transparent text-slate-900 dark:text-slate-100 font-mono focus:outline-none cursor-pointer">
                      <option value="all">All Sequence Roles</option>
                      <option value="DESSERT_HERO">🧁 Hero Dessert/Bake</option>
                      <option value="BEVERAGE_PAIRING">☕ Beverage/Pairing</option>
                      <option value="PASTRY_BITES">🥐 Pastry Bites</option>
                      <option value="DINNER_ANCHOR">🍽️ Dinner Anchor</option>
                      <option value="NAVBOOST_CO_VISITOR">🥖 Co-Visitor Side</option>
                      <option value="SESSION_FINISHER">🍪 Session Finisher</option>
                      <option value="PIXIE_DRIFT_OUTLIER">⚠️ Pixie Drift Outlier</option>
                    </select>
                  </div>

                </div>
              </div>

              <!-- Dynamic Result Count Badge & Reset Button -->
              <div class="flex items-center justify-between pt-1 text-xs border-t border-slate-200/60 dark:border-slate-800/60 font-mono">
                <div class="flex items-center space-x-2 text-slate-600 dark:text-slate-300">
                  <span class="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                    Showing <span class="mx-1 text-rose-600 dark:text-rose-400" x-text="filteredDossierCandidates.length"></span> of <span class="mx-1" x-text="dossierCandidates.length"></span> candidates matching filters
                  </span>
                </div>

                <button 
                  x-show="dossierFilters.search || dossierFilters.engine !== 'all' || dossierFilters.velocity !== 'all' || dossierFilters.market !== 'all' || dossierFilters.sequence !== 'all'"
                  @click="resetDossierFilters()"
                  class="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 text-[11px] font-bold transition active:scale-95"
                >
                  <i data-lucide="rotate-ccw" class="w-3 h-3"></i>
                  <span>Reset All Filters</span>
                </button>
              </div>
            </div>

            <div class="overflow-x-auto">
              <table class="w-full text-left text-xs border-collapse">
                <thead>
                  <tr class="border-b border-slate-200 dark:border-slate-800/80 bg-slate-50/80 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 font-mono text-[11px] uppercase tracking-wider">
                    <th class="py-3 px-3">Preview & Format</th>
                    <th class="py-3 px-3 min-w-[220px]">Title & Vision OCR</th>
                    <th class="py-3 px-3">Pin Age & Velocity</th>
                    <th class="py-3 px-3">Metrics</th>
                    <th class="py-3 px-3">Dominant Color</th>
                    <th class="py-3 px-3">Engine Provenance</th>
                    <th class="py-3 px-3">prod:v18 Spread</th>
                    <th class="py-3 px-3 text-right">Inspect</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60 font-sans">
                  <template x-for="item in filteredDossierCandidates" :key="item.candidate_pin_id">
                    <tr class="hover:bg-slate-50/80 dark:hover:bg-slate-900/40 transition">
                      
                      <!-- 1. Preview & Format -->
                      <td class="py-3 px-3 whitespace-nowrap">
                        <div class="flex items-center space-x-2.5">
                          <template x-if="item.image_url">
                            <a :href="'https://www.pinterest.com/pin/' + item.candidate_pin_id + '/'" target="_blank" class="group/thumb block relative flex-shrink-0">
                              <img :src="item.image_url" alt="pin preview" loading="lazy" class="w-8 h-12 rounded-lg object-cover border shadow-sm group-hover/thumb:scale-125 transition-transform duration-200" :style="'border-color: ' + (item.winning_color || '#cbd5e1')">
                            </a>
                          </template>
                          <template x-if="!item.image_url">
                            <div class="w-8 h-12 rounded-lg flex-shrink-0 border shadow-sm flex items-center justify-center" :style="'border-color: ' + (item.winning_color || '#cbd5e1') + '; background-color: ' + (item.winning_color || '#cbd5e1') + '15;'">
                              <i data-lucide="image" class="w-4 h-4 text-slate-400"></i>
                            </div>
                          </template>
                          <div class="space-y-1">
                            <div class="flex items-center space-x-1">
                              <span class="inline-block px-1.5 py-0.5 rounded text-[9px] font-mono font-bold tracking-wider uppercase" :class="{
                                'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20': item.format_type === 'PRODUCT CARD',
                                'bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20': item.format_type === 'ORGANIC PIN',
                                'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20': item.format_type === 'VIDEO PIN',
                                'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20': item.format_type === 'IDEA PIN'
                              }" x-text="item.format_type"></span>

                              <template x-if="item.is_vacuum_target">
                                <span class="px-1 py-0.5 rounded text-[8px] font-extrabold uppercase bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/40">
                                  VACUUM
                                </span>
                              </template>
                            </div>

                            <!-- Ingestion Method Badge -->
                            <template x-if="item.ingestion_method && item.ingestion_method !== 'uploaded'">
                              <div class="text-[8px] font-mono font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-1">
                                <span class="px-1 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-500" x-text="item.ingestion_method === 'csv_importer' ? '⚙️ CSV Farm' : (item.ingestion_method === 'pin_scheduling' ? '⏱️ Scheduled' : item.ingestion_method)"></span>
                              </div>
                            </template>
                          </div>
                        </div>
                      </td>

                      <!-- 2. Title & Vision OCR -->
                      <td class="py-3 px-3">
                        <div class="space-y-1">
                          <a :href="'https://www.pinterest.com/pin/' + item.candidate_pin_id + '/'" target="_blank" class="font-bold text-slate-900 dark:text-slate-100 hover:text-rose-600 dark:hover:text-rose-400 line-clamp-1 hover:underline" x-text="item.title"></a>
                          <div class="flex items-center space-x-2 text-[10px] text-slate-500 font-mono flex-wrap gap-y-1">
                            <span class="px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300" x-text="item.domain"></span>
                            <span>•</span>
                            <span x-text="'ID: ' + item.candidate_pin_id"></span>
                            <template x-if="item.sequence_role && item.sequence_role !== 'DIRECT_MATCH'">
                              <span class="px-1.5 py-0.2 rounded text-[9px] font-bold" :class="{
                                'bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30': item.sequence_role === 'DESSERT_HERO',
                                'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30': item.sequence_role === 'BEVERAGE_PAIRING',
                                'bg-teal-500/15 text-teal-700 dark:text-teal-300 border border-teal-500/30': item.sequence_role === 'PASTRY_BITES',
                                'bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30': item.sequence_role === 'DINNER_ANCHOR',
                                'bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30': item.sequence_role === 'NAVBOOST_CO_VISITOR',
                                'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30': item.sequence_role === 'SESSION_FINISHER',
                                'bg-red-500/20 text-red-700 dark:text-red-300 border border-red-500/40 font-extrabold': item.sequence_role === 'PIXIE_DRIFT_OUTLIER'
                              }" x-text="{
                                'DESSERT_HERO': '🧁 Hero Bake',
                                'BEVERAGE_PAIRING': '☕ Pairing',
                                'PASTRY_BITES': '🥐 Bites',
                                'DINNER_ANCHOR': '🍽️ Anchor',
                                'NAVBOOST_CO_VISITOR': '🥖 Co-Visitor',
                                'SESSION_FINISHER': '🍪 Finisher',
                                'PIXIE_DRIFT_OUTLIER': '⚠️ Pixie Drift'
                              }[item.sequence_role] || item.sequence_role"></span>
                            </template>
                          </div>
                          <template x-if="item.ocr_text">
                            <div class="p-1 px-1.5 rounded bg-slate-100 dark:bg-slate-900/90 text-[9px] text-slate-600 dark:text-slate-400 font-mono truncate max-w-sm" :title="item.ocr_text">
                              <span class="text-rose-500 font-bold">OCR:</span> <span x-text="item.ocr_text"></span>
                            </div>
                          </template>
                        </div>
                      </td>

                      <!-- 3. Pin Age & Velocity -->
                      <td class="py-3 px-3 whitespace-nowrap font-mono">
                        <div class="text-[11px] text-slate-500 dark:text-slate-400" x-text="item.age_display || (item.age_days ? (item.age_days < 30 ? item.age_days + 'd ago' : (item.age_days < 365 ? Math.floor(item.age_days / 30) + 'mo ago' : (item.age_days / 365).toFixed(1) + 'y ago')) : '1d ago')"></div>
                        <div class="mt-0.5">
                          <template x-if="Number(item.daily_velocity || 0) >= 50">
                            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40" x-text="'🔥 ' + item.daily_velocity + '/day (Explosive)'"></span>
                          </template>
                          <template x-if="Number(item.daily_velocity || 0) >= 10 && Number(item.daily_velocity || 0) < 50">
                            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30" x-text="'⚡ ' + item.daily_velocity + '/day (Trending)'"></span>
                          </template>
                          <template x-if="Number(item.daily_velocity || 0) < 10">
                            <span class="px-1.5 py-0.5 rounded text-[9px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700" x-text="item.daily_velocity + '/day (Stagnant)'"></span>
                          </template>
                        </div>
                      </td>

                      <!-- 4. Metrics -->
                      <td class="py-3 px-3 whitespace-nowrap font-mono">
                        <div class="text-slate-900 dark:text-slate-100 font-bold" x-text="Number(item.total_saves != null ? item.total_saves : (item.saves || 0)).toLocaleString() + ' saves'"></div>
                        <template x-if="Number(item.total_repins != null ? item.total_repins : (item.repins || 0)) > 0">
                          <div class="text-[10px] text-slate-500" x-text="Number(item.total_repins != null ? item.total_repins : (item.repins || 0)).toLocaleString() + ' repins • ' + (item.avg_save_rate != null ? item.avg_save_rate : (item.save_rate != null ? item.save_rate : 0)) + '% rate'"></div>
                        </template>
                        <template x-if="Number(item.total_repins != null ? item.total_repins : (item.repins || 0)) === 0">
                          <div class="text-[10px] text-slate-500" x-text="'⚡ ' + item.daily_velocity + '/day (Trending)'"></div>
                        </template>
                      </td>

                      <!-- 5. Dominant Color -->
                      <td class="py-3 px-3 whitespace-nowrap">
                        <div class="flex items-center space-x-2">
                          <span class="w-4 h-4 rounded border flex-shrink-0 shadow-sm" :style="'background-color: ' + (item.winning_color || item.dominant_color || '#888888')"></span>
                          <div class="space-y-0.5 min-w-0">
                            <div class="font-mono text-[10px] font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide" x-text="item.winning_color || item.dominant_color || '#888888'"></div>
                            <div class="text-[9px] text-slate-500 dark:text-slate-400 font-medium truncate max-w-[140px]" x-text="item.culinary_color_name || 'Culinary Accent'" :title="item.culinary_color_name"></div>
                          </div>
                        </div>
                      </td>

                      <!-- 6. Engine Provenance -->
                      <td class="py-3 px-3 whitespace-nowrap">
                        <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase" :class="{
                          'bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20': item.engine_source === 'P2P_NAVBOOST',
                          'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20': item.engine_source === 'P2P_RANDOMWALK',
                          'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20': item.engine_source === 'P2P_RECGPT',
                          'bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20': item.engine_source === 'P2P_TWO_TOWER',
                          'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20': item.engine_source === 'P2P_SHOPPING_CORPUS',
                          'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20': item.engine_source === 'FRESH_COLD_START'
                        }" x-text="item.engine_source"></span>
                      </td>

                      <!-- 7. prod:v18 Spread -->
                      <td class="py-3 px-3 whitespace-nowrap font-mono">
                        <template x-if="!item.is_product">
                          <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30" x-text="'+' + (item.prod_spread || 220.8) + ' Net Leverage'"></span>
                        </template>
                        <template x-if="item.is_product">
                          <span class="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">0.0 Net</span>
                        </template>
                      </td>

                      <!-- 8. Inspect Action -->
                      <td class="py-3 px-3 text-right whitespace-nowrap">
                        <button @click="inspectCandidate(item)" class="p-1.5 rounded-lg bg-slate-100 hover:bg-rose-50 dark:bg-slate-800 dark:hover:bg-rose-950/40 text-slate-700 dark:text-slate-300 hover:text-rose-600 transition">
                          <i data-lucide="eye" class="w-4 h-4"></i>
                        </button>
                      </td>
                    </tr>
                  </template>
                </tbody>
              </table>
            </div>
          </div>

          <!-- SUB-VIEW 3: 🧭 GUIDED SEARCH RADAR (BUBBLE_ONE_COL CAPSULES) FOR ACTIVE SEED -->
          <div x-show="dossierTab === 'guided_search'" class="space-y-5">
            <div class="bg-white dark:bg-[#0d1526] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-6 shadow-sm dark:shadow-xl space-y-5">
              
              <!-- Header & Explanation -->
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 dark:border-slate-800/80 pb-4">
                <div>
                  <h3 class="text-base font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                    <i data-lucide="compass" class="w-5 h-5 text-purple-500"></i>
                    <span>Pinterest Guided Search Radar (استعلامات البحث الموجهة للدبوس <span class="font-mono text-purple-600 dark:text-purple-400" x-text="activeDossierSeed.pin_id"></span>)</span>
                  </h3>
                  <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    كبسولات بحثية مُهندسة خوارزمياً (BUBBLE_ONE_COL / Explore Article) مستخرجة من الـ Raw JSON لهذا الدبوس تحديداً. انقر على أي صورة لتكبيرها والتنقل بين الصور.
                  </p>
                </div>
                <div class="flex items-center space-x-2">
                  <span class="px-3 py-1.5 rounded-xl text-xs font-mono font-bold bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-500/20" x-text="dossierGuidedCapsules.length + ' Capsules Harvested'"></span>
                </div>
              </div>

              <!-- Visual Grid of Guided Search Capsules for this Seed -->
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                <template x-for="(cap, capIdx) in dossierGuidedCapsules" :key="cap.id || cap.node_id || cap.query_term">
                  <div class="group bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/80 hover:border-purple-500/50 rounded-2xl p-4 shadow-sm hover:shadow-lg transition space-y-3 flex flex-col justify-between">
                    <div class="space-y-3">
                      <!-- Cover Image Thumbnail with Click-to-Zoom Lightbox -->
                      <div @click="openLightbox(capIdx)" class="relative w-full h-48 rounded-xl overflow-hidden bg-slate-200 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-inner cursor-pointer group/img">
                        <template x-if="cap.image_url">
                          <img :src="cap.image_url" alt="Guided capsule cover" loading="lazy" class="w-full h-full object-cover group-hover/img:scale-105 transition-transform duration-300">
                        </template>
                        <template x-if="!cap.image_url">
                          <div class="w-full h-full flex items-center justify-center text-slate-400">
                            <i data-lucide="image" class="w-8 h-8"></i>
                          </div>
                        </template>
                        
                        <!-- Explore Article Badge -->
                        <div class="absolute top-2 left-2">
                          <span class="px-2 py-0.5 rounded-md text-[9px] font-mono font-bold uppercase bg-slate-950/80 text-purple-300 backdrop-blur-md border border-purple-500/30">
                            EXPLORE ARTICLE
                          </span>
                        </div>

                        <!-- Zoom Hint Overlay on Hover -->
                        <div class="absolute inset-0 bg-slate-950/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center space-x-1.5 text-white text-xs font-mono font-semibold backdrop-blur-[2px]">
                          <i data-lucide="maximize-2" class="w-4 h-4"></i>
                          <span>عرض كامل / تكبير</span>
                        </div>
                      </div>

                      <!-- Query Title -->
                      <div>
                        <h4 class="font-bold text-sm text-slate-900 dark:text-white line-clamp-2 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition" x-text="cap.query_term"></h4>
                        <div class="flex items-center space-x-1.5 text-[10px] font-mono text-slate-500 dark:text-slate-400 mt-1">
                          <span>Origin:</span>
                          <span class="truncate font-semibold text-slate-700 dark:text-slate-300">BUBBLE_ONE_COL</span>
                        </div>
                      </div>
                    </div>

                    <!-- Action Links & Prompts -->
                    <div class="pt-2 border-t border-slate-200/60 dark:border-slate-800/60 space-y-2">
                      <div class="flex items-center space-x-2">
                        <button @click="copyGuidedPrompt(cap.query_term)" class="flex-1 px-2.5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-semibold text-[10px] font-mono transition active:scale-95 flex items-center justify-center space-x-1 shadow-sm">
                          <i data-lucide="copy" class="w-3 h-3"></i>
                          <span>Copy Prompt</span>
                        </button>
                        <a :href="cap.search_url || ('https://www.pinterest.com/search/pins/?q=' + encodeURIComponent(cap.query_term))" target="_blank" class="px-2.5 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[10px] font-mono transition flex items-center justify-center space-x-1" title="Open Pinterest Search">
                          <i data-lucide="external-link" class="w-3 h-3"></i>
                        </a>
                      </div>
                    </div>
                  </div>
                </template>
              </div>

              <!-- Empty State for this Seed -->
              <template x-if="dossierGuidedCapsules.length === 0">
                <div class="p-12 text-center space-y-3 font-mono border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                  <i data-lucide="compass" class="w-12 h-12 mx-auto text-purple-400"></i>
                  <p class="text-sm font-bold text-slate-800 dark:text-slate-200">لم يتم استخراج كبسولات BUBBLE_ONE_COL لهذا الدبوس حتى الآن.</p>
                  <p class="text-xs text-slate-500 max-w-xl mx-auto">
                    تنبيه خوارزمي: منصة بينترست ترسل كبسولات الاستكشاف الموجه (BUBBLE_ONE_COL) فقط للجلسات الموثقة (Session Cookies)، أو يمكنك استيراد ملف JSON الأصلي مباشرة.
                  </p>
                  <div class="pt-3 flex flex-wrap items-center justify-center gap-3">
                    <button @click="openRawJsonModal(activeDossierSeed.pin_id)" class="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold font-mono transition active:scale-95 inline-flex items-center space-x-2 shadow-sm">
                      <i data-lucide="file-input" class="w-3.5 h-3.5"></i>
                      <span>📥 استيراد ملف JSON الخام (Import Raw JSON)</span>
                    </button>
                    <button @click="isCookieModalOpen = true" class="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-bold font-mono transition active:scale-95 inline-flex items-center space-x-2">
                      <i data-lucide="key" class="w-3.5 h-3.5 text-amber-500"></i>
                      <span>🔑 إعداد كوكيز بينترست (Set Session Cookie)</span>
                    </button>
                    <button @click="triggerCrawl(activeDossierSeed.pin_id)" :disabled="crawlStatus.is_crawling" class="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold font-mono transition active:scale-95 disabled:opacity-50 inline-flex items-center space-x-2">
                      <i data-lucide="refresh-cw" :class="{'animate-spin': crawlStatus.is_crawling}" class="w-3.5 h-3.5"></i>
                      <span>إعادة الزحف (Re-Crawl)</span>
                    </button>
                  </div>
                </div>
              </template>

            </div>
          </div>

        </div>
      </template>
    </div>

    <!-- ======================================================== -->
    <!-- SUB-TAB 2: ⚡ GLOBAL INTERSECTIONS (STANDALONE 24 HUBS)   -->
    <!-- ======================================================== -->
    <div x-show="relatedSubTab === 'intersections'" class="space-y-5">
      
      <!-- 1. Executive Summary Ribbon (KPI Cards) -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <!-- Card 1: Total Hubs -->
        <div class="p-3.5 rounded-2xl bg-white dark:bg-[#0d1526] border border-slate-200/90 dark:border-slate-800 shadow-sm flex items-center space-x-3">
          <div class="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400 flex-shrink-0">
            <i data-lucide="flame" class="w-5 h-5"></i>
          </div>
          <div class="min-w-0">
            <div class="text-[10px] font-mono uppercase text-slate-500 dark:text-slate-400 font-bold truncate">Total Intersections</div>
            <div class="text-lg font-mono font-extrabold text-slate-900 dark:text-white" x-text="intersectionStats.totalHubs"></div>
            <div class="text-[10px] text-slate-400 font-medium truncate">Discovered across ≥ 2 seeds</div>
          </div>
        </div>

        <!-- Card 2: Golden Core (>= 5 Seeds) -->
        <div class="p-3.5 rounded-2xl bg-white dark:bg-[#0d1526] border border-slate-200/90 dark:border-slate-800 shadow-sm flex items-center space-x-3">
          <div class="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-600 dark:text-rose-400 flex-shrink-0">
            <i data-lucide="crown" class="w-5 h-5"></i>
          </div>
          <div class="min-w-0">
            <div class="text-[10px] font-mono uppercase text-slate-500 dark:text-slate-400 font-bold truncate">Golden Core (≥ 5 Seeds)</div>
            <div class="text-lg font-mono font-extrabold text-rose-600 dark:text-rose-400" x-text="intersectionStats.goldenCore"></div>
            <div class="text-[10px] text-slate-400 font-medium truncate">Ultra-high cross-cluster pull</div>
          </div>
        </div>

        <!-- Card 3: Vacuum Opportunities -->
        <div class="p-3.5 rounded-2xl bg-white dark:bg-[#0d1526] border border-slate-200/90 dark:border-slate-800 shadow-sm flex items-center space-x-3">
          <div class="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 flex-shrink-0">
            <i data-lucide="target" class="w-5 h-5"></i>
          </div>
          <div class="min-w-0">
            <div class="text-[10px] font-mono uppercase text-slate-500 dark:text-slate-400 font-bold truncate">Vacuum Targets</div>
            <div class="text-lg font-mono font-extrabold text-emerald-600 dark:text-emerald-400" x-text="intersectionStats.vacuumTargets"></div>
            <div class="text-[10px] text-slate-400 font-medium truncate">Organic pins with ≥ 5K saves</div>
          </div>
        </div>

        <!-- Card 4: Top Pixie Hit Mass -->
        <div class="p-3.5 rounded-2xl bg-white dark:bg-[#0d1526] border border-slate-200/90 dark:border-slate-800 shadow-sm flex items-center space-x-3">
          <div class="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-600 dark:text-purple-400 flex-shrink-0">
            <i data-lucide="activity" class="w-5 h-5"></i>
          </div>
          <div class="min-w-0">
            <div class="text-[10px] font-mono uppercase text-slate-500 dark:text-slate-400 font-bold truncate">Max Pixie Hit Mass</div>
            <div class="text-lg font-mono font-extrabold text-purple-600 dark:text-purple-400" x-text="intersectionStats.maxPixie"></div>
            <div class="text-[10px] text-slate-400 font-medium truncate">Peak random-walk centroid</div>
          </div>
        </div>
      </div>

      <!-- Main Intersections Card -->
      <div class="bg-white dark:bg-[#0d1526] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 shadow-sm dark:shadow-xl space-y-4">
        
        <!-- Header Bar with Title and Actions -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
          <div>
            <h2 class="text-base font-bold text-slate-900 dark:text-white flex items-center space-x-2">
              <i data-lucide="flame" class="w-5 h-5 text-amber-500"></i>
              <span>Global Multi-Seed Intersections Radar (رادار التقاطعات الشاملة)</span>
            </h2>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Cross-cluster gravitational centroids discovered across ≥ 2 distinct seeds. Ranked by Pixie Bipartite Multi-Hit score.</p>
          </div>

          <div class="flex items-center space-x-2 flex-wrap gap-y-1">
            <!-- View Mode Switcher: Grid Cards ⊞ vs Data Table ☰ -->
            <div class="flex items-center bg-slate-100 dark:bg-slate-800/80 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700/80 shadow-inner">
              <button @click="setIntersectionViewMode('grid')" 
                      class="flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-semibold font-mono transition active:scale-95"
                      :class="intersectionViewMode === 'grid' ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-sm' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'">
                <i data-lucide="layout-grid" class="w-3.5 h-3.5"></i>
                <span>Cards Grid</span>
              </button>
              <button @click="setIntersectionViewMode('table')" 
                      class="flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-semibold font-mono transition active:scale-95"
                      :class="intersectionViewMode === 'table' ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-sm' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'">
                <i data-lucide="table" class="w-3.5 h-3.5"></i>
                <span>Data Table</span>
              </button>
            </div>

            <button @click="exportCsv(filteredIntersections, 'global-intersections-filtered.csv')" class="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-semibold shadow-sm transition active:scale-95">
              <i data-lucide="download" class="w-3.5 h-3.5 text-amber-500"></i>
              <span>Export CSV</span>
            </button>
            <span class="px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs font-mono font-bold text-amber-600 dark:text-amber-400" x-text="intersections.length + ' Total Hubs'"></span>
          </div>
        </div>

        <!-- 2. Advanced Multi-Filter & Search Toolbar -->
        <div class="p-3.5 rounded-2xl bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/80 space-y-3">
          <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            
            <!-- Left: Search & Sorting -->
            <div class="flex items-center space-x-2 flex-wrap gap-y-2">
              <!-- Live Text Search -->
              <div class="relative min-w-[220px]">
                <i data-lucide="search" class="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400"></i>
                <input type="text" x-model="intersectionFilters.search" @input="intersectionPage = 1" placeholder="Search title, ID, OCR, or seeds..." class="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-mono text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-amber-500">
              </div>

              <!-- Sort Dropdown -->
              <div class="flex items-center space-x-1 bg-white dark:bg-slate-900 rounded-xl px-2 py-1 border border-slate-200 dark:border-slate-800 shadow-sm">
                <span class="text-[10px] font-mono text-slate-400 uppercase font-semibold">Sort:</span>
                <select x-model="intersectionSort" @change="intersectionPage = 1" class="text-xs bg-transparent text-slate-900 dark:text-slate-100 font-mono focus:outline-none cursor-pointer">
                  <option value="pixie">🏆 Pixie Multi-Hit Score</option>
                  <option value="overlap">🔗 Overlap Depth (Max Seeds)</option>
                  <option value="saves">💾 Total Saves (High to Low)</option>
                  <option value="rate">🔄 Repin Rate % (High to Low)</option>
                  <option value="velocity">⚡ Daily Velocity (Fastest)</option>
                </select>
              </div>
            </div>

            <!-- Right: 4 Filter Selectors -->
            <div class="flex items-center space-x-2 flex-wrap gap-y-2">
              
              <!-- Overlap Depth Filter -->
              <div class="flex items-center space-x-1 bg-white dark:bg-slate-900 rounded-xl px-2 py-1 border border-slate-200 dark:border-slate-800 shadow-sm">
                <span class="text-[10px] font-mono text-slate-400 uppercase font-semibold">Overlap:</span>
                <select x-model="intersectionFilters.minOverlap" @change="intersectionPage = 1" class="text-xs bg-transparent text-slate-900 dark:text-slate-100 font-mono focus:outline-none cursor-pointer">
                  <option value="all">All Hubs (≥ 2 Seeds)</option>
                  <option value="3">≥ 3 Seeds (Hubs)</option>
                  <option value="5">🔥 ≥ 5 Seeds (Golden Core)</option>
                  <option value="7">👑 ≥ 7 Seeds (Mega-Hubs)</option>
                </select>
              </div>

              <!-- Originating Seed Filter -->
              <div class="flex items-center space-x-1 bg-white dark:bg-slate-900 rounded-xl px-2 py-1 border border-slate-200 dark:border-slate-800 shadow-sm max-w-[190px]">
                <span class="text-[10px] font-mono text-slate-400 uppercase font-semibold">Seed:</span>
                <select x-model="intersectionFilters.seedId" @change="intersectionPage = 1" class="text-xs bg-transparent text-slate-900 dark:text-slate-100 font-mono focus:outline-none cursor-pointer truncate">
                  <option value="all">All Seeds</option>
                  <template x-for="s in seeds" :key="s.pin_id">
                    <option :value="s.pin_id" x-text="s.label"></option>
                  </template>
                </select>
              </div>

              <!-- Format Filter -->
              <div class="flex items-center space-x-1 bg-white dark:bg-slate-900 rounded-xl px-2 py-1 border border-slate-200 dark:border-slate-800 shadow-sm">
                <span class="text-[10px] font-mono text-slate-400 uppercase font-semibold">Format:</span>
                <select x-model="intersectionFilters.format" @change="intersectionPage = 1" class="text-xs bg-transparent text-slate-900 dark:text-slate-100 font-mono focus:outline-none cursor-pointer">
                  <option value="all">All Formats</option>
                  <option value="ORGANIC PIN">Organic Pin</option>
                  <option value="VIDEO PIN">Video Pin</option>
                  <option value="IDEA PIN">Idea Pin</option>
                  <option value="PRODUCT CARD">Product Card</option>
                </select>
              </div>

              <!-- Market / Strategy Status -->
              <div class="flex items-center space-x-1 bg-white dark:bg-slate-900 rounded-xl px-2 py-1 border border-slate-200 dark:border-slate-800 shadow-sm">
                <span class="text-[10px] font-mono text-slate-400 uppercase font-semibold">Market:</span>
                <select x-model="intersectionFilters.market" @change="intersectionPage = 1" class="text-xs bg-transparent text-slate-900 dark:text-slate-100 font-mono focus:outline-none cursor-pointer">
                  <option value="all">All Opportunities</option>
                  <option value="vacuum">🎯 Vacuum Targets Only (≥ 5K)</option>
                  <option value="product">🛒 Competitor Products</option>
                  <option value="high_rate">⚡ High Repin Rate (≥ 50%)</option>
                  <option value="explosive">🔥 Explosive Velocity (≥ 50/d)</option>
                </select>
              </div>

            </div>
          </div>

          <!-- Dynamic Counter & Reset Bar -->
          <div class="flex items-center justify-between pt-1 text-xs border-t border-slate-200/60 dark:border-slate-800/60 font-mono">
            <div class="flex items-center space-x-2 text-slate-600 dark:text-slate-300">
              <span class="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                Showing <span class="mx-1 text-amber-600 dark:text-amber-400" x-text="filteredIntersections.length"></span> of <span class="mx-1" x-text="intersections.length"></span> overlapping hubs
              </span>
            </div>

            <button 
              x-show="intersectionFilters.search || intersectionFilters.minOverlap !== 'all' || intersectionFilters.seedId !== 'all' || intersectionFilters.format !== 'all' || intersectionFilters.market !== 'all' || intersectionFilters.engine !== 'all'"
              @click="resetIntersectionFilters()"
              class="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-[11px] font-bold transition active:scale-95"
            >
              <i data-lucide="rotate-ccw" class="w-3 h-3"></i>
              <span>Reset All Filters</span>
            </button>
          </div>
        </div>

        <!-- 3A. Visual Arbitrage Card Grid (Pinterest-Native 2:3 Cards) -->
        <div x-show="intersectionViewMode === 'grid'" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <template x-for="item in paginatedIntersections" :key="item.candidate_pin_id">
            <div class="group relative rounded-2xl bg-white dark:bg-[#0b1120] border border-slate-200/90 dark:border-slate-800/90 hover:border-amber-500/50 dark:hover:border-amber-500/50 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col overflow-hidden">
              
              <!-- 1. Media Image Container (2:3 Aspect Ratio) -->
              <div class="relative w-full aspect-[2/3] bg-slate-100 dark:bg-slate-900 overflow-hidden cursor-pointer" @click="openHubDrawer(item)">
                <template x-if="item.image_url">
                  <img :src="item.image_url" alt="Pin preview" loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
                </template>
                <template x-if="!item.image_url">
                  <div class="w-full h-full flex flex-col items-center justify-center text-slate-400 p-4 text-center">
                    <i data-lucide="image" class="w-8 h-8 mb-2 opacity-50"></i>
                    <span class="text-xs font-mono">No Image</span>
                  </div>
                </template>

                <!-- Top Floating Glassmorphism Badges -->
                <div class="absolute top-2.5 inset-x-2.5 flex items-center justify-between pointer-events-none">
                  <!-- Multi-Hit Overlap Badge -->
                  <span class="px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold uppercase backdrop-blur-md shadow-md border"
                        :class="{
                          'bg-purple-950/85 text-purple-200 border-purple-500/40': item.seed_overlap_count >= 7,
                          'bg-rose-950/85 text-rose-200 border-rose-500/40': item.seed_overlap_count >= 5 && item.seed_overlap_count < 7,
                          'bg-amber-950/85 text-amber-200 border-amber-500/40': item.seed_overlap_count >= 3 && item.seed_overlap_count < 5,
                          'bg-slate-900/85 text-slate-200 border-slate-700/60': item.seed_overlap_count < 3
                        }">
                    <span x-text="'🔥 ' + item.seed_overlap_count + ' Seeds'"></span>
                    <span class="text-[9px] opacity-80" x-text="'(' + Math.pow(item.seed_overlap_count, 2) + 'x)'"></span>
                  </span>

                  <!-- Vacuum / Format Badge -->
                  <div class="flex items-center space-x-1">
                    <template x-if="item.is_vacuum_target">
                      <span class="px-2 py-0.5 rounded-lg text-[10px] font-extrabold uppercase bg-emerald-950/85 text-emerald-300 border border-emerald-500/40 backdrop-blur-md shadow-md">
                        🎯 VACUUM
                      </span>
                    </template>
                    <span class="px-1.5 py-0.5 rounded-lg text-[9px] font-mono font-bold uppercase backdrop-blur-md shadow-md bg-slate-950/70 text-white border border-white/20" x-text="item.format_type === 'PRODUCT CARD' ? 'PRODUCT' : (item.format_type === 'VIDEO PIN' ? 'VIDEO' : 'PIN')"></span>
                  </div>
                </div>

                <!-- Hover Overlay Trigger -->
                <div class="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3 pointer-events-none">
                  <span class="text-xs font-semibold text-white flex items-center space-x-1 font-mono">
                    <i data-lucide="eye" class="w-3.5 h-3.5 text-amber-400"></i>
                    <span>Click for Deep Dossier</span>
                  </span>
                </div>
              </div>

              <!-- 2. Card Content & Metrics Body -->
              <div class="p-3.5 flex-1 flex flex-col justify-between space-y-3">
                
                <!-- Title & Domain -->
                <div>
                  <div class="flex items-start justify-between gap-1.5">
                    <button @click="openHubDrawer(item)" 
                            class="font-bold text-xs text-left text-slate-900 dark:text-slate-100 hover:text-amber-500 transition line-clamp-2"
                            :title="item.title"
                            x-text="item.title || ('Pin ' + item.candidate_pin_id)"></button>
                    <a :href="'https://www.pinterest.com/pin/' + item.candidate_pin_id + '/'" target="_blank" class="text-slate-400 hover:text-amber-500 flex-shrink-0 mt-0.5" title="Open on Pinterest">
                      <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                    </a>
                  </div>
                  <div class="flex items-center space-x-2 text-[10px] font-mono text-slate-400 mt-1 truncate">
                    <span x-text="item.domain"></span>
                    <span>•</span>
                    <button @click="copyToClipboard(item.candidate_pin_id, 'pin-' + item.candidate_pin_id)" class="hover:text-amber-500 cursor-pointer flex items-center space-x-0.5">
                      <span x-text="'ID: ' + item.candidate_pin_id"></span>
                      <i data-lucide="copy" class="w-2.5 h-2.5"></i>
                    </button>
                  </div>
                </div>

                <!-- Pixie Resonance Tier & Energy Micro-Bar (WWW 2018 Formula) -->
                <div class="p-2 rounded-xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200/70 dark:border-slate-800/70 space-y-1.5">
                  <div class="flex items-center justify-between text-[11px] font-mono">
                    <span class="px-1.5 py-0.5 rounded font-bold uppercase tracking-wider text-[9px]" :class="getPixieResonance(item).badgeClass" x-text="getPixieResonance(item).label"></span>
                    <span class="font-extrabold text-slate-900 dark:text-white" x-text="Number(item.pixie_multihit_score || 0).toLocaleString()"></span>
                  </div>
                  <!-- Energy Progress Bar -->
                  <div class="w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                    <div class="h-full rounded-full transition-all duration-500" :class="getPixieResonance(item).barGradient" :style="'width: ' + getPixieResonance(item).barPercent + '%'"></div>
                  </div>
                  <div class="flex items-center justify-between text-[9px] font-mono text-slate-400">
                    <span>Random Walk Mass</span>
                    <span x-text="getPixieResonance(item).barPercent + '% Peak Pull'"></span>
                  </div>
                </div>

                <!-- Engagement Stats Grid -->
                <div class="grid grid-cols-2 gap-2 text-xs font-mono pt-1 border-t border-slate-100 dark:border-slate-800/60">
                  <div>
                    <div class="text-[9px] uppercase text-slate-400">Saves / Repins</div>
                    <div class="font-bold text-slate-900 dark:text-slate-100" x-text="Number(item.total_saves != null ? item.total_saves : (item.saves || 0)).toLocaleString()"></div>
                    <div class="text-[10px] text-slate-500" x-text="(item.avg_save_rate || item.save_rate || 0) + '% rate'"></div>
                  </div>
                  <div>
                    <div class="text-[9px] uppercase text-slate-400">Daily Velocity</div>
                    <template x-if="Number(item.daily_velocity || 0) > 0">
                      <div class="font-bold text-emerald-600 dark:text-emerald-400" x-text="'🔥 ' + item.daily_velocity + '/d'"></div>
                    </template>
                    <template x-if="!Number(item.daily_velocity || 0)">
                      <div class="text-slate-400 text-[10px]">Stagnant</div>
                    </template>
                    <div class="flex items-center space-x-1 mt-0.5">
                      <span class="w-2.5 h-2.5 rounded-full border border-black/20" :style="'background-color: ' + (item.winning_color || '#888')"></span>
                      <span class="text-[9px] text-slate-400 truncate max-w-[70px]" x-text="item.culinary_color_name || item.winning_color"></span>
                    </div>
                  </div>
                </div>

                <!-- Action Bar -->
                <div class="flex items-center space-x-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <button @click="openHubDrawer(item)" class="flex-1 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 text-[11px] font-bold font-mono transition active:scale-95 flex items-center justify-center space-x-1">
                    <i data-lucide="eye" class="w-3 h-3"></i>
                    <span>Inspect Dossier</span>
                  </button>
                  <button @click="copyHubReSpinAngle(item)" class="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition active:scale-95" title="Copy Viral Angle Hook">
                    <i data-lucide="copy" class="w-3.5 h-3.5"></i>
                  </button>
                </div>

              </div>
            </div>
          </template>

          <!-- Empty Grid Placeholder -->
          <template x-if="paginatedIntersections.length === 0">
            <div class="col-span-full py-16 text-center text-slate-500 dark:text-slate-400 font-mono text-xs">
              <div class="flex flex-col items-center justify-center space-y-2">
                <i data-lucide="search-x" class="w-10 h-10 text-slate-400"></i>
                <div class="font-bold text-slate-700 dark:text-slate-300">No intersecting hubs matching your filters</div>
                <button @click="resetIntersectionFilters()" class="text-amber-600 dark:text-amber-400 underline font-semibold cursor-pointer">Reset all filters</button>
              </div>
            </div>
          </template>
        </div>

        <!-- 3B. Polished Precision Data Table -->
        <div x-show="intersectionViewMode === 'table'" class="overflow-x-auto">
          <table class="w-full text-left text-xs border-collapse">
            <thead>
              <tr class="border-b border-slate-200 dark:border-slate-800/80 bg-slate-50/80 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 font-mono text-[11px] uppercase tracking-wider">
                <th class="py-3 px-3">Preview & Format</th>
                <th class="py-3 px-3 min-w-[260px]">Intersecting Candidate Title</th>
                <th class="py-3 px-3 min-w-[220px] max-w-[280px]">Originating Seeds Convergence</th>
                <th class="py-3 px-3 min-w-[170px]">Pixie Multi-Hit Mass</th>
                <th class="py-3 px-3 min-w-[150px]">Engagement Metrics</th>
                <th class="py-3 px-3 min-w-[120px]">Color DNA</th>
                <th class="py-3 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60 font-sans">
              <template x-for="item in paginatedIntersections" :key="item.candidate_pin_id">
                <tr class="hover:bg-slate-50/80 dark:hover:bg-slate-900/40 transition">
                  
                  <!-- 1. Preview & Format -->
                  <td class="py-3 px-3 whitespace-nowrap">
                    <div class="flex items-center space-x-2.5">
                      <div @click="openHubDrawer(item)" class="group/thumb block relative flex-shrink-0 cursor-pointer">
                        <template x-if="item.image_url">
                          <img :src="item.image_url" alt="pin preview" loading="lazy" class="w-10 h-14 rounded-xl object-cover border-2 shadow-sm group-hover/thumb:scale-110 transition-transform duration-200" :style="'border-color: ' + (item.winning_color || '#cbd5e1')">
                        </template>
                        <template x-if="!item.image_url">
                          <div class="w-10 h-14 rounded-xl flex-shrink-0 flex items-center justify-center border-2 shadow-sm" :style="'border-color: ' + (item.winning_color || '#cbd5e1') + '; background-color: ' + (item.winning_color || '#cbd5e1') + '15;'">
                            <i data-lucide="image" class="w-4 h-4 text-slate-400"></i>
                          </div>
                        </template>
                      </div>
                      <div class="space-y-1">
                        <div class="flex flex-col space-y-1">
                          <span class="inline-block px-1.5 py-0.5 rounded text-[9px] font-mono font-bold tracking-wider uppercase" :class="{
                            'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20': item.format_type === 'PRODUCT CARD',
                            'bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20': item.format_type === 'ORGANIC PIN',
                            'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20': item.format_type === 'VIDEO PIN',
                            'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20': item.format_type === 'IDEA PIN'
                          }" x-text="item.format_type"></span>

                          <template x-if="item.is_vacuum_target">
                            <span class="inline-block px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40">
                              🎯 VACUUM
                            </span>
                          </template>
                        </div>

                        <!-- Ingestion Method Badge -->
                        <template x-if="item.ingestion_method && item.ingestion_method !== 'uploaded'">
                          <div class="text-[8px] font-mono font-bold uppercase tracking-wider text-slate-400">
                            <span class="px-1 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-500" x-text="item.ingestion_method === 'csv_importer' ? '⚙️ CSV Farm' : (item.ingestion_method === 'pin_scheduling' ? '⏱️ Scheduled' : item.ingestion_method)"></span>
                          </div>
                        </template>
                      </div>
                    </div>
                  </td>

                  <!-- 2. Title & OCR -->
                  <td class="py-3 px-3 min-w-[260px]">
                    <div class="space-y-1">
                      <div class="flex items-center space-x-1.5">
                        <button @click="openHubDrawer(item)" 
                                class="font-bold text-left text-slate-900 dark:text-slate-100 hover:text-amber-500 line-clamp-1 hover:underline text-xs" 
                                x-text="item.title || ('Pin ' + item.candidate_pin_id)"></button>
                        <a :href="'https://www.pinterest.com/pin/' + item.candidate_pin_id + '/'" 
                           target="_blank" 
                           class="text-slate-400 hover:text-amber-500 transition flex-shrink-0" title="Open on Pinterest">
                          <i data-lucide="external-link" class="w-3 h-3"></i>
                        </a>
                      </div>

                      <div class="flex items-center space-x-2 text-[10px] text-slate-500 font-mono flex-wrap gap-y-0.5">
                        <span class="px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 truncate max-w-[130px]" x-text="item.domain"></span>
                        <span>•</span>
                        <button @click="copyToClipboard(item.candidate_pin_id, 'pin-' + item.candidate_pin_id)" 
                                class="hover:text-amber-500 flex items-center space-x-0.5 cursor-pointer text-slate-500" title="Copy Pin ID">
                          <span x-text="'ID: ' + item.candidate_pin_id"></span>
                          <i data-lucide="copy" class="w-2.5 h-2.5"></i>
                        </button>
                      </div>

                      <template x-if="item.ocr_text">
                        <div class="p-1 px-1.5 rounded bg-slate-100 dark:bg-slate-900/90 text-[10px] text-slate-600 dark:text-slate-400 font-mono truncate max-w-sm" :title="item.ocr_text">
                          <span class="text-rose-500 font-bold">OCR:</span> <span x-text="item.ocr_text"></span>
                        </div>
                      </template>
                    </div>
                  </td>

                  <!-- 3. Overlapping Originating Seeds (Compact with Expand/Collapse) -->
                  <td class="py-3 px-3 min-w-[220px] max-w-[280px]">
                    <div class="space-y-1">
                      <div class="flex items-center justify-between">
                        <div class="flex items-center space-x-1 font-mono text-[11px] font-bold" :class="{
                          'text-purple-600 dark:text-purple-400': item.seed_overlap_count >= 7,
                          'text-rose-600 dark:text-rose-400': item.seed_overlap_count >= 5 && item.seed_overlap_count < 7,
                          'text-amber-600 dark:text-amber-400': item.seed_overlap_count >= 3 && item.seed_overlap_count < 5,
                          'text-slate-600 dark:text-slate-400': item.seed_overlap_count < 3
                        }">
                          <i data-lucide="git-merge" class="w-3.5 h-3.5"></i>
                          <span x-text="'Found in ' + item.seed_overlap_count + ' Seeds'"></span>
                          <span class="text-[9px] font-normal opacity-80" x-text="'(' + Math.pow(item.seed_overlap_count, 2) + 'x)'"></span>
                        </div>

                        <template x-if="(item.originating_seed_details || []).length > 2">
                          <button @click="toggleExpandSeeds(item.candidate_pin_id)" 
                                  class="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold transition flex items-center space-x-0.5"
                                  :class="isSeedsExpanded(item.candidate_pin_id) ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300' : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'">
                            <span x-text="isSeedsExpanded(item.candidate_pin_id) ? '▲ Collapse' : '+' + ((item.originating_seed_details || []).length - 2) + ' more'"></span>
                          </button>
                        </template>
                      </div>

                      <!-- Collapsed View: First 2 Seeds -->
                      <div x-show="!isSeedsExpanded(item.candidate_pin_id)" class="flex flex-wrap gap-1">
                        <template x-for="s in (item.originating_seed_details || []).slice(0, 2)" :key="s.pin_id">
                          <span class="inline-block max-w-[130px] truncate px-1.5 py-0.5 rounded text-[10px] font-mono border"
                                :class="s.is_competitor ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20'"
                                :title="s.label + ' (Pin ID: ' + s.pin_id + ')'"
                                x-text="s.label"></span>
                        </template>
                      </div>

                      <!-- Expanded View: All Seeds Grid -->
                      <div x-show="isSeedsExpanded(item.candidate_pin_id)" class="flex flex-wrap gap-1 pt-1 max-h-48 overflow-y-auto pr-1">
                        <template x-for="s in (item.originating_seed_details || [])" :key="s.pin_id">
                          <span class="inline-block max-w-[200px] truncate px-1.5 py-0.5 rounded text-[10px] font-mono border"
                                :class="s.is_competitor ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20'"
                                :title="s.label + ' (Pin ID: ' + s.pin_id + ')'"
                                x-text="s.label"></span>
                        </template>
                      </div>
                    </div>
                  </td>

                  <!-- 4. Pixie Multi-Hit Score & Energy Bar -->
                  <td class="py-3 px-3 whitespace-nowrap font-mono min-w-[170px]">
                    <div class="space-y-1">
                      <div class="flex items-center space-x-1.5">
                        <span class="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider" :class="getPixieResonance(item).badgeClass" x-text="getPixieResonance(item).label"></span>
                      </div>
                      <div class="text-sm font-extrabold text-slate-900 dark:text-white" x-text="Number(item.pixie_multihit_score || 0).toLocaleString()"></div>
                      <!-- Micro Energy Bar -->
                      <div class="w-28 bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                        <div class="h-full rounded-full transition-all duration-500" :class="getPixieResonance(item).barGradient" :style="'width: ' + getPixieResonance(item).barPercent + '%'"></div>
                      </div>
                      <div class="text-[9px] text-slate-400">Random Walk Mass</div>
                    </div>
                  </td>

                  <!-- 5. Metrics -->
                  <td class="py-3 px-3 whitespace-nowrap font-mono min-w-[150px]">
                    <div class="font-bold text-slate-900 dark:text-white" x-text="Number(item.total_saves != null ? item.total_saves : (item.saves || 0)).toLocaleString() + ' saves'"></div>
                    <div class="text-[10px] text-slate-500" x-text="Number(item.total_repins != null ? item.total_repins : (item.repins || 0)).toLocaleString() + ' repins • ' + (item.avg_save_rate != null ? item.avg_save_rate : (item.save_rate != null ? item.save_rate : 0)) + '% rate'"></div>
                    <template x-if="Number(item.daily_velocity || 0) > 0">
                      <div class="text-[9px] font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5" x-text="'🔥 ' + item.daily_velocity + '/day'"></div>
                    </template>
                  </td>

                  <!-- 6. Color DNA -->
                  <td class="py-3 px-3 whitespace-nowrap min-w-[120px]">
                    <div class="flex items-center space-x-2">
                      <span class="w-4 h-4 rounded border flex-shrink-0 shadow-sm" :style="'background-color: ' + (item.winning_color || item.dominant_color || '#888888')"></span>
                      <div class="space-y-0.5 min-w-0">
                        <div class="font-mono text-[10px] font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide" x-text="item.winning_color || item.dominant_color || '#888888'"></div>
                        <div class="text-[9px] text-slate-500 dark:text-slate-400 font-medium truncate max-w-[110px]" x-text="item.culinary_color_name || 'Culinary Accent'" :title="item.culinary_color_name"></div>
                      </div>
                    </div>
                  </td>

                  <!-- 7. Action -->
                  <td class="py-3 px-3 text-right whitespace-nowrap">
                    <div class="flex items-center justify-end space-x-1">
                      <button @click="openHubDrawer(item)" class="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 text-xs font-semibold shadow-sm active:scale-95 transition">
                        <i data-lucide="eye" class="w-3.5 h-3.5"></i>
                        <span>Inspect</span>
                      </button>
                      <button @click="copyHubReSpinAngle(item)" class="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition active:scale-95" title="Copy Viral Angle">
                        <i data-lucide="copy" class="w-3.5 h-3.5"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              </template>

              <!-- Empty Table Placeholder -->
              <template x-if="paginatedIntersections.length === 0">
                <tr>
                  <td colspan="7" class="py-12 text-center text-slate-500 dark:text-slate-400 font-mono text-xs">
                    <div class="flex flex-col items-center justify-center space-y-2">
                      <i data-lucide="search-x" class="w-8 h-8 text-slate-400"></i>
                      <div class="font-bold text-slate-700 dark:text-slate-300">No intersecting hubs matching your filters</div>
                      <button @click="resetIntersectionFilters()" class="text-amber-600 dark:text-amber-400 underline font-semibold cursor-pointer">Reset all filters</button>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>

        <!-- 4. Dynamic Pagination Bar -->
        <div class="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-slate-800 text-xs font-mono">
          <!-- Left: Page Info & Page Size Selector -->
          <div class="flex items-center space-x-3 text-slate-600 dark:text-slate-400">
            <div>
              Showing <span class="font-bold text-slate-900 dark:text-white" x-text="filteredIntersections.length ? ((intersectionPage - 1) * intersectionPageSize + 1) : 0"></span>
              to <span class="font-bold text-slate-900 dark:text-white" x-text="Math.min(intersectionPage * intersectionPageSize, filteredIntersections.length)"></span>
              of <span class="font-bold text-slate-900 dark:text-white" x-text="filteredIntersections.length"></span> hubs
            </div>

            <div class="flex items-center space-x-1 pl-2 border-l border-slate-200 dark:border-slate-800">
              <span class="text-[10px] uppercase text-slate-400">Per page:</span>
              <select x-model.number="intersectionPageSize" @change="intersectionPage = 1" class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-0.5 text-xs text-slate-800 dark:text-slate-200 font-mono focus:outline-none cursor-pointer">
                <option :value="12">12</option>
                <option :value="24">24 (Golden Core)</option>
                <option :value="48">48</option>
                <option :value="96">96</option>
              </select>
            </div>
          </div>

          <!-- Right: Page Navigation Controls -->
          <div class="flex items-center space-x-1">
            <!-- First Page -->
            <button @click="setIntersectionPage(1)" :disabled="intersectionPage === 1" 
                    class="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-800 transition">
              <i data-lucide="chevrons-left" class="w-3.5 h-3.5"></i>
            </button>
            <!-- Previous Page -->
            <button @click="setIntersectionPage(intersectionPage - 1)" :disabled="intersectionPage === 1" 
                    class="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-800 transition">
              <i data-lucide="chevron-left" class="w-3.5 h-3.5"></i>
            </button>

            <!-- Page Number Pills -->
            <template x-for="p in intersectionVisiblePages" :key="p">
              <div>
                <template x-if="p === '...'">
                  <span class="px-2 py-1 text-slate-400 font-mono">...</span>
                </template>
                <template x-if="p !== '...'">
                  <button @click="setIntersectionPage(p)" 
                          class="px-2.5 py-1 rounded-lg border text-xs font-mono font-bold transition"
                          :class="intersectionPage === p ? 'bg-amber-500 border-amber-600 text-white shadow-sm' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'"
                          x-text="p"></button>
                </template>
              </div>
            </template>

            <!-- Next Page -->
            <button @click="setIntersectionPage(intersectionPage + 1)" :disabled="intersectionPage === intersectionTotalPages" 
                    class="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-800 transition">
              <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>
            </button>
            <!-- Last Page -->
            <button @click="setIntersectionPage(intersectionTotalPages)" :disabled="intersectionPage === intersectionTotalPages" 
                    class="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-800 transition">
              <i data-lucide="chevrons-right" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </div>

      </div>
    </div>

    <!-- ======================================================== -->
    <!-- SUB-TAB 3: 📊 MASTER DATABASE EXPLORER (SEARCH & FILTER) -->
    <!-- ======================================================== -->
    <div x-show="relatedSubTab === 'explorer'" class="space-y-4">
      <div class="bg-white dark:bg-[#0d1526] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 shadow-sm dark:shadow-xl space-y-4">
        
        <!-- Master Explorer Filter & Segment Toolbar -->
        <div class="p-3.5 rounded-2xl bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/80 space-y-3">
          <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            
            <!-- Left: Seed Selection & Sorting & Search -->
            <div class="flex items-center space-x-2 flex-wrap gap-y-2">
              <div class="flex items-center space-x-1 bg-white dark:bg-slate-900 rounded-xl px-2 py-1 border border-slate-200 dark:border-slate-800 shadow-sm">
                <span class="text-[10px] font-mono text-slate-400 uppercase font-semibold">Seed:</span>
                <select x-model="explorerSeedId" @change="loadExplorerData()" class="text-xs bg-transparent text-slate-900 dark:text-slate-100 font-mono focus:outline-none cursor-pointer">
                  <option value="all">All Tracked Seeds</option>
                  <template x-for="s in seeds" :key="s.pin_id">
                    <option :value="s.pin_id" x-text="s.label + ' (' + (s.total_candidates || 0) + ' nodes)'"></option>
                  </template>
                </select>
              </div>

              <div class="flex items-center space-x-1 bg-white dark:bg-slate-900 rounded-xl px-2 py-1 border border-slate-200 dark:border-slate-800 shadow-sm">
                <span class="text-[10px] font-mono text-slate-400 uppercase font-semibold">Sort:</span>
                <select x-model="explorerSort" @change="loadExplorerData()" class="text-xs bg-transparent text-slate-900 dark:text-slate-100 font-mono focus:outline-none cursor-pointer">
                  <option value="saves">Sort by Total Saves</option>
                  <option value="velocity">Sort by Velocity (Fastest Growing)</option>
                </select>
              </div>

              <!-- Search Input -->
              <div class="relative min-w-[200px]">
                <i data-lucide="search" class="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400"></i>
                <input type="text" x-model="explorerFilters.search" placeholder="Search title, domain, OCR text..." class="w-full pl-8 pr-3 py-1 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-mono text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-rose-500">
              </div>

              <!-- Export CSV Button -->
              <button @click="exportCsv(filteredExplorerCandidates, 'master-explorer-candidates.csv')" class="flex items-center space-x-1.5 px-3 py-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold shadow-sm transition active:scale-95">
                <i data-lucide="download" class="w-3.5 h-3.5 text-sky-500"></i>
                <span>Export CSV</span>
              </button>
            </div>

            <!-- Right: 4 Dropdown Filter Selectors -->
            <div class="flex items-center space-x-2 flex-wrap gap-y-2">
              
              <!-- Engine Provenance Filter -->
              <div class="flex items-center space-x-1 bg-white dark:bg-slate-900 rounded-xl px-2 py-1 border border-slate-200 dark:border-slate-800 shadow-sm">
                <span class="text-[10px] font-mono text-slate-400 uppercase font-semibold">Engine:</span>
                <select x-model="explorerFilters.engine" class="text-xs bg-transparent text-slate-900 dark:text-slate-100 font-mono focus:outline-none cursor-pointer">
                  <option value="all">All Engines</option>
                  <option value="P2P_NAVBOOST">P2P_NAVBOOST (Sky)</option>
                  <option value="P2P_RANDOMWALK">P2P_RANDOMWALK (Emerald)</option>
                  <option value="P2P_TWO_TOWER">P2P_TWO_TOWER (Violet)</option>
                  <option value="P2P_RECGPT">P2P_RECGPT (Rose)</option>
                  <option value="FRESH_COLD_START">FRESH_COLD_START (Cyan)</option>
                  <option value="P2P_SHOPPING_CORPUS">P2P_SHOPPING_CORPUS (Amber)</option>
                </select>
              </div>

              <!-- Velocity Tier Filter -->
              <div class="flex items-center space-x-1 bg-white dark:bg-slate-900 rounded-xl px-2 py-1 border border-slate-200 dark:border-slate-800 shadow-sm">
                <span class="text-[10px] font-mono text-slate-400 uppercase font-semibold">Speed:</span>
                <select x-model="explorerFilters.velocity" class="text-xs bg-transparent text-slate-900 dark:text-slate-100 font-mono focus:outline-none cursor-pointer">
                  <option value="all">All Speeds</option>
                  <option value="explosive">🔥 Explosive (≥ 50/d)</option>
                  <option value="trending">⚡ Trending (10-49/d)</option>
                  <option value="stagnant">💤 Stagnant (&lt; 10/d)</option>
                </select>
              </div>

              <!-- Market Arbitrage Status Filter -->
              <div class="flex items-center space-x-1 bg-white dark:bg-slate-900 rounded-xl px-2 py-1 border border-slate-200 dark:border-slate-800 shadow-sm">
                <span class="text-[10px] font-mono text-slate-400 uppercase font-semibold">Market:</span>
                <select x-model="explorerFilters.market" class="text-xs bg-transparent text-slate-900 dark:text-slate-100 font-mono focus:outline-none cursor-pointer">
                  <option value="all">All Statuses</option>
                  <option value="vacuum">🎯 Vacuum Targets Only (Organic ≥ 5K)</option>
                  <option value="product">🛒 Competitor Products (Etsy/Shopify)</option>
                </select>
              </div>

              <!-- RecGPT Meal Sequence Filter -->
              <div class="flex items-center space-x-1 bg-white dark:bg-slate-900 rounded-xl px-2 py-1 border border-slate-200 dark:border-slate-800 shadow-sm">
                <span class="text-[10px] font-mono text-slate-400 uppercase font-semibold">Sequence:</span>
                <select x-model="explorerFilters.sequence" class="text-xs bg-transparent text-slate-900 dark:text-slate-100 font-mono focus:outline-none cursor-pointer">
                  <option value="all">All Sequence Roles</option>
                  <option value="DESSERT_HERO">🧁 Hero Dessert/Bake</option>
                  <option value="BEVERAGE_PAIRING">☕ Beverage/Pairing</option>
                  <option value="PASTRY_BITES">🥐 Pastry Bites</option>
                  <option value="DINNER_ANCHOR">🍽️ Dinner Anchor</option>
                  <option value="NAVBOOST_CO_VISITOR">🥖 Co-Visitor Side</option>
                  <option value="SESSION_FINISHER">🍪 Session Finisher</option>
                  <option value="PIXIE_DRIFT_OUTLIER">⚠️ Pixie Drift Outlier</option>
                </select>
              </div>

            </div>
          </div>

          <!-- Dynamic Result Count Badge & Reset Button -->
          <div class="flex items-center justify-between pt-1 text-xs border-t border-slate-200/60 dark:border-slate-800/60 font-mono">
            <div class="flex items-center space-x-2 text-slate-600 dark:text-slate-300">
              <span class="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                Showing <span class="mx-1 text-rose-600 dark:text-rose-400" x-text="filteredExplorerCandidates.length"></span> of <span class="mx-1" x-text="explorerCandidates.length"></span> candidates matching filters
              </span>
            </div>

            <button 
              x-show="explorerFilters.search || explorerFilters.engine !== 'all' || explorerFilters.velocity !== 'all' || explorerFilters.market !== 'all' || explorerFilters.sequence !== 'all'"
              @click="resetExplorerFilters()"
              class="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 text-[11px] font-bold transition active:scale-95"
            >
              <i data-lucide="rotate-ccw" class="w-3 h-3"></i>
              <span>Reset All Filters</span>
            </button>
          </div>
        </div>

        <!-- Master Candidates Table -->
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs border-collapse">
            <thead>
              <tr class="border-b border-slate-200 dark:border-slate-800/80 bg-slate-50/80 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 font-mono text-[11px] uppercase tracking-wider">
                <th class="py-3.5 px-4">Preview & Format</th>
                <th class="py-3.5 px-4 min-w-[240px]">Title & Vision OCR</th>
                <th class="py-3.5 px-4">Origin Seed</th>
                <th class="py-3.5 px-4">Pin Age & Velocity</th>
                <th class="py-3.5 px-4">Metrics</th>
                <th class="py-3.5 px-4">Dominant Color</th>
                <th class="py-3.5 px-4">Engine Provenance</th>
                <th class="py-3.5 px-4">prod:v18 Spread</th>
                <th class="py-3.5 px-4 text-right">Inspect</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60 font-sans">
              <template x-for="item in filteredExplorerCandidates" :key="item.candidate_pin_id + '-' + item.seed_pin_id">
                <tr class="hover:bg-slate-50/80 dark:hover:bg-slate-900/40 transition">
                  
                  <!-- 1. Preview & Format -->
                  <td class="py-3.5 px-4 whitespace-nowrap">
                    <div class="flex items-center space-x-2.5">
                      <template x-if="item.image_url">
                        <a :href="'https://www.pinterest.com/pin/' + item.candidate_pin_id + '/'" target="_blank" class="group/thumb block relative flex-shrink-0">
                          <img :src="item.image_url" alt="pin preview" loading="lazy" class="w-8 h-12 rounded-lg object-cover border shadow-sm group-hover/thumb:scale-125 transition-transform duration-200" :style="'border-color: ' + (item.winning_color || '#cbd5e1')">
                        </a>
                      </template>
                      <template x-if="!item.image_url">
                        <div class="w-8 h-12 rounded-lg flex-shrink-0 flex items-center justify-center border shadow-sm" :style="'border-color: ' + (item.winning_color || '#cbd5e1') + '; background-color: ' + (item.winning_color || '#cbd5e1') + '15;'">
                          <i data-lucide="image" class="w-4 h-4 text-slate-400"></i>
                        </div>
                      </template>
                      <div class="space-y-1">
                        <div class="flex items-center space-x-1">
                          <span class="inline-block px-1.5 py-0.5 rounded text-[9px] font-mono font-bold tracking-wider uppercase" :class="{
                            'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20': item.format_type === 'PRODUCT CARD',
                            'bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20': item.format_type === 'ORGANIC PIN',
                            'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20': item.format_type === 'VIDEO PIN',
                            'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20': item.format_type === 'IDEA PIN'
                          }" x-text="item.format_type"></span>

                          <template x-if="item.is_vacuum_target">
                            <span class="px-1 py-0.5 rounded text-[8px] font-extrabold uppercase bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/40">
                              VACUUM
                            </span>
                          </template>
                        </div>

                        <!-- Ingestion Method Badge -->
                        <template x-if="item.ingestion_method && item.ingestion_method !== 'uploaded'">
                          <div class="text-[8px] font-mono font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-1">
                            <span class="px-1 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-500" x-text="item.ingestion_method === 'csv_importer' ? '⚙️ CSV Farm' : (item.ingestion_method === 'pin_scheduling' ? '⏱️ Scheduled' : item.ingestion_method)"></span>
                          </div>
                        </template>
                      </div>
                    </div>
                  </td>

                  <!-- 2. Title & OCR -->
                  <td class="py-3.5 px-4">
                    <div class="space-y-1">
                      <a :href="'https://www.pinterest.com/pin/' + item.candidate_pin_id + '/'" target="_blank" class="font-bold text-slate-900 dark:text-slate-100 hover:text-rose-600 dark:hover:text-rose-400 line-clamp-1 hover:underline" x-text="item.title"></a>
                      <div class="flex items-center space-x-2 text-[10px] text-slate-500 font-mono flex-wrap gap-y-1">
                        <span class="px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300" x-text="item.domain"></span>
                        <span>•</span>
                        <span x-text="'ID: ' + item.candidate_pin_id"></span>
                        <template x-if="item.sequence_role && item.sequence_role !== 'DIRECT_MATCH'">
                          <span class="px-1.5 py-0.2 rounded text-[9px] font-bold" :class="{
                            'bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30': item.sequence_role === 'DESSERT_HERO',
                            'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30': item.sequence_role === 'BEVERAGE_PAIRING',
                            'bg-teal-500/15 text-teal-700 dark:text-teal-300 border border-teal-500/30': item.sequence_role === 'PASTRY_BITES',
                            'bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30': item.sequence_role === 'DINNER_ANCHOR',
                            'bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30': item.sequence_role === 'NAVBOOST_CO_VISITOR',
                            'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30': item.sequence_role === 'SESSION_FINISHER',
                            'bg-red-500/20 text-red-700 dark:text-red-300 border border-red-500/40 font-extrabold': item.sequence_role === 'PIXIE_DRIFT_OUTLIER'
                          }" x-text="{
                            'DESSERT_HERO': '🧁 Hero Bake',
                            'BEVERAGE_PAIRING': '☕ Pairing',
                            'PASTRY_BITES': '🥐 Bites',
                            'DINNER_ANCHOR': '🍽️ Anchor',
                            'NAVBOOST_CO_VISITOR': '🥖 Co-Visitor',
                            'SESSION_FINISHER': '🍪 Finisher',
                            'PIXIE_DRIFT_OUTLIER': '⚠️ Pixie Drift'
                          }[item.sequence_role] || item.sequence_role"></span>
                        </template>
                      </div>
                      <template x-if="item.ocr_text">
                        <div class="p-1 px-1.5 rounded bg-slate-100 dark:bg-slate-900/90 text-[10px] text-slate-600 dark:text-slate-400 font-mono truncate max-w-sm" :title="item.ocr_text">
                          <span class="text-rose-500 font-bold">OCR:</span> <span x-text="item.ocr_text"></span>
                        </div>
                      </template>
                    </div>
                  </td>

                  <!-- 3. Origin Seed -->
                  <td class="py-3.5 px-4 whitespace-nowrap font-mono text-xs">
                    <span class="text-slate-500" x-text="'Seed: '"></span>
                    <strong class="text-slate-800 dark:text-slate-200" x-text="item.seed_pin_id"></strong>
                  </td>

                  <!-- 4. Pin Age & Velocity -->
                  <td class="py-3.5 px-4 whitespace-nowrap font-mono">
                    <div class="text-[11px] text-slate-500 dark:text-slate-400" x-text="item.age_display || (item.age_days ? (item.age_days < 30 ? item.age_days + 'd ago' : (item.age_days < 365 ? Math.floor(item.age_days / 30) + 'mo ago' : (item.age_days / 365).toFixed(1) + 'y ago')) : '1d ago')"></div>
                    <div class="mt-0.5">
                      <template x-if="Number(item.daily_velocity || 0) >= 50">
                        <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40" x-text="'🔥 ' + item.daily_velocity + '/day (Explosive)'"></span>
                      </template>
                      <template x-if="Number(item.daily_velocity || 0) >= 10 && Number(item.daily_velocity || 0) < 50">
                        <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30" x-text="'⚡ ' + item.daily_velocity + '/day (Trending)'"></span>
                      </template>
                      <template x-if="Number(item.daily_velocity || 0) < 10">
                        <span class="px-1.5 py-0.5 rounded text-[9px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700" x-text="item.daily_velocity + '/day (Stagnant)'"></span>
                      </template>
                    </div>
                  </td>

                  <!-- 5. Metrics -->
                  <td class="py-3.5 px-4 whitespace-nowrap font-mono">
                    <div class="font-bold text-slate-900 dark:text-white" x-text="Number(item.total_saves != null ? item.total_saves : (item.saves || 0)).toLocaleString() + ' saves'"></div>
                    <div class="text-[10px] text-slate-500" x-text="Number(item.total_repins != null ? item.total_repins : (item.repins || 0)).toLocaleString() + ' repins • ' + (item.avg_save_rate != null ? item.avg_save_rate : (item.save_rate != null ? item.save_rate : 0)) + '% rate'"></div>
                  </td>

                  <!-- 6. Dominant Color Swatch -->
                  <td class="py-3.5 px-4 whitespace-nowrap">
                    <div class="flex items-center space-x-2">
                      <span class="w-4 h-4 rounded border flex-shrink-0 shadow-sm" :style="'background-color: ' + (item.winning_color || item.dominant_color || '#888888')"></span>
                      <div class="space-y-0.5 min-w-0">
                        <div class="font-mono text-[10px] font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide" x-text="item.winning_color || item.dominant_color || '#888888'"></div>
                        <div class="text-[9px] text-slate-500 dark:text-slate-400 font-medium truncate max-w-[140px]" x-text="item.culinary_color_name || 'Culinary Accent'" :title="item.culinary_color_name"></div>
                      </div>
                    </div>
                  </td>

                  <!-- 7. Engine Provenance -->
                  <td class="py-3.5 px-4 whitespace-nowrap">
                    <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase" :class="{
                      'bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20': item.engine_source === 'P2P_NAVBOOST',
                      'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20': item.engine_source === 'P2P_RANDOMWALK',
                      'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20': item.engine_source === 'P2P_RECGPT',
                      'bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20': item.engine_source === 'P2P_TWO_TOWER',
                      'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20': item.engine_source === 'P2P_SHOPPING_CORPUS',
                      'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20': item.engine_source === 'FRESH_COLD_START'
                    }" x-text="item.engine_source"></span>
                  </td>

                  <!-- 8. prod:v18 Spread -->
                  <td class="py-3.5 px-4 whitespace-nowrap font-mono">
                    <template x-if="!item.is_product">
                      <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30" x-text="'+' + (item.prod_spread || 220.8) + ' Net Leverage'"></span>
                    </template>
                    <template x-if="item.is_product">
                      <span class="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">0.0 Net</span>
                    </template>
                  </td>

                  <!-- 9. Inspect Action -->
                  <td class="py-3.5 px-4 text-right whitespace-nowrap">
                    <button @click="inspectCandidate(item)" class="p-1.5 rounded-lg bg-slate-100 hover:bg-rose-50 dark:bg-slate-800 dark:hover:bg-rose-950/40 text-slate-700 dark:text-slate-300 hover:text-rose-600 transition">
                      <i data-lucide="eye" class="w-4 h-4"></i>
                    </button>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>

      </div>
    </div>
    </div>

    <!-- ======================================================== -->
    <!-- TAB 4: 🕵️ COMPETITOR INTELLIGENCE (LIVE MONITOR)          -->
    <!-- Matches User Image 2 Reference UI                        -->
    <!-- ======================================================== -->
    <!-- ======================================================== -->
    <!-- TAB 4: 👥 CREATOR INTELLIGENCE & PINARCHIVE (UNIFIED PAGE)-->
    <!-- Unified Creator Tracking, Boards, and Winning Pin Archive -->
    <!-- ======================================================== -->
    <div x-show="currentTab === 'creators_archive' || currentTab === 'competitors' || currentTab === 'pinarchive'" class="space-y-6">
      
      <!-- ======================================================== -->
      <!-- VIEW A: ALL CREATORS OVERVIEW & GLOBAL PINARCHIVE        -->
      <!-- ======================================================== -->
      <template x-if="!activeCreator">
        <div class="space-y-6">
          
          <!-- Unified Header Section -->
          <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div class="flex items-center space-x-3">
          <div class="h-11 w-11 rounded-2xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-rose-600 text-white flex items-center justify-center shadow-md shadow-indigo-950/20">
            <i data-lucide="users" class="w-6 h-6"></i>
          </div>
          <div>
            <div class="flex items-center space-x-2">
              <h2 class="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">Creator Intelligence & PinArchive</h2>
              <span class="px-2 py-0.5 text-[10px] font-bold uppercase rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30">Unified Engine</span>
            </div>
            <p class="text-xs text-slate-500 dark:text-slate-400">Track creator reach & boards, harvest winning pins with 3-tier rules, and explore AI topic clusters.</p>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <button @click="exportCompetitorsCsv()" class="px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition flex items-center space-x-1.5 shadow-sm">
            <i data-lucide="download" class="w-3.5 h-3.5"></i>
            <span>Export CSV</span>
          </button>
          <button @click="syncAllCompetitors()" :disabled="isLoading" class="px-3.5 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition flex items-center space-x-1.5 shadow-sm shadow-emerald-950/20 active:scale-95">
            <i data-lucide="refresh-cw" :class="{'animate-spin': isLoading}" class="w-3.5 h-3.5"></i>
            <span>Run Full Update</span>
          </button>
          <button @click="openAddCompetitorModal()" class="px-3.5 py-2 text-xs font-bold rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-rose-600 hover:from-purple-500 hover:to-rose-500 text-white transition flex items-center space-x-1.5 shadow-md shadow-indigo-950/20 active:scale-95">
            <i data-lucide="user-plus" class="w-3.5 h-3.5"></i>
            <span>+ Track Creator</span>
          </button>
        </div>
      </div>

      <!-- Automated Pipeline Status Bar -->
      <div class="p-3 px-4 rounded-2xl bg-white dark:bg-[#0b1120] border border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs shadow-sm">
        <div class="flex items-center space-x-2">
          <span class="p-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <i data-lucide="clock" class="w-4 h-4"></i>
          </span>
          <span class="font-bold text-slate-900 dark:text-white">Automated Pipeline</span>
          <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">Active</span>
          <span class="text-slate-400 font-mono text-[11px]">Matrix Sharding Ingest</span>
        </div>
        <div class="flex items-center space-x-4 text-slate-500 dark:text-slate-400">
          <span class="flex items-center space-x-1.5">
            <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Provider: <strong>FastCron / GH Actions</strong></span>
          </span>
          <button @click="fetchCompetitors(); fetchPinArchiveOverview(); fetchPinArchivePins()" class="hover:text-slate-900 dark:hover:text-white flex items-center space-x-1 text-purple-600 dark:text-purple-400 font-semibold">
            <i data-lucide="rotate-cw" class="w-3.5 h-3.5"></i>
            <span>Refresh Vault</span>
          </button>
        </div>
      </div>

      <!-- Unified 5 KPI Cards -->
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <!-- Card 1: Tracked Creators -->
        <div class="p-4 rounded-2xl bg-white dark:bg-[#0b1120] border border-slate-200/80 dark:border-slate-800 shadow-sm cursor-pointer hover:border-purple-500/50 transition" @click="creatorSubTab = 'creators'">
          <div class="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider">
            <span>Tracked Creators</span>
            <i data-lucide="users" class="w-4 h-4 text-purple-500"></i>
          </div>
          <div class="mt-2.5 flex items-baseline space-x-2">
            <span class="text-2xl font-extrabold text-slate-900 dark:text-white font-mono" x-text="competitorsOverview.tracked_profiles || competitors.length"></span>
          </div>
          <div class="mt-1 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
            <span x-text="(competitorsOverview.own_count || 0) + ' own'"></span>
            <span x-text="(competitorsOverview.competitor_count || competitors.length) + ' competitors'"></span>
          </div>
        </div>

        <!-- Card 2: Combined Reach -->
        <div class="p-4 rounded-2xl bg-white dark:bg-[#0b1120] border border-slate-200/80 dark:border-slate-800 shadow-sm">
          <div class="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider">
            <span>Combined Reach</span>
            <i data-lucide="trending-up" class="w-4 h-4 text-emerald-500"></i>
          </div>
          <div class="mt-2.5 flex items-baseline space-x-2">
            <span class="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 font-mono" x-text="formatNumber(competitorsOverview.combined_reach, true)"></span>
          </div>
          <div class="mt-1 text-[11px] text-slate-500 dark:text-slate-400 truncate">
            top: <strong class="text-slate-800 dark:text-slate-200" x-text="competitorsOverview.top_competitor?.handle || '@creator'"></strong>
          </div>
        </div>

        <!-- Card 3: Archived Pins -->
        <div class="p-4 rounded-2xl bg-white dark:bg-[#0b1120] border border-slate-200/80 dark:border-slate-800 shadow-sm cursor-pointer hover:border-indigo-500/50 transition" @click="creatorSubTab = 'archive'">
          <div class="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider">
            <span>Archived Pins</span>
            <i data-lucide="archive" class="w-4 h-4 text-indigo-500"></i>
          </div>
          <div class="mt-2.5 flex items-baseline space-x-2">
            <span class="text-2xl font-extrabold text-indigo-600 dark:text-indigo-400 font-mono" x-text="formatNumber(pinarchiveOverview.total_pins)"></span>
          </div>
          <div class="mt-1 text-[11px] text-slate-500" x-text="formatNumber(pinarchiveOverview.tracked_accounts) + ' Accounts Tracked'"></div>
        </div>

        <!-- Card 4: Total Saves & Repins -->
        <div class="p-4 rounded-2xl bg-white dark:bg-[#0b1120] border border-slate-200/80 dark:border-slate-800 shadow-sm">
          <div class="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider">
            <span>Aggregated Saves</span>
            <i data-lucide="bookmark" class="w-4 h-4 text-purple-500"></i>
          </div>
          <div class="mt-2.5 flex items-baseline space-x-2">
            <span class="text-2xl font-extrabold text-purple-600 dark:text-purple-400 font-mono" x-text="formatNumber(pinarchiveOverview.total_saves)"></span>
          </div>
          <div class="mt-1 text-[11px] text-slate-500 font-mono" x-text="formatNumber(pinarchiveOverview.total_repins) + ' Repins'"></div>
        </div>

        <!-- Card 5: Avg Velocity & Staged -->
        <div class="p-4 rounded-2xl bg-white dark:bg-[#0b1120] border border-slate-200/80 dark:border-slate-800 shadow-sm cursor-pointer hover:border-rose-500/50 transition" @click="creatorSubTab = 'staged'">
          <div class="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider">
            <span>Velocity / Staged</span>
            <i data-lucide="zap" class="w-4 h-4 text-amber-500"></i>
          </div>
          <div class="mt-2.5 flex items-baseline space-x-2">
            <span class="text-2xl font-extrabold text-amber-600 dark:text-amber-400 font-mono" x-text="(pinarchiveOverview.avg_velocity || '0') + '/d'"></span>
            <span class="text-xs font-bold font-mono px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-600 dark:text-rose-400" x-text="formatNumber(pinarchiveOverview.staged_pins_count) + ' staged'"></span>
          </div>
          <div class="mt-1 text-[11px] text-rose-500 font-semibold flex items-center space-x-1">
            <span>View Staged Queue</span>
            <i data-lucide="arrow-right" class="w-3 h-3"></i>
          </div>
        </div>
      </div>

      <!-- Navigation Sub-Tabs Bar within Unified Page -->
      <div class="flex items-center space-x-2 border-b border-slate-200 dark:border-slate-800 overflow-x-auto pb-2">
        <button @click="creatorSubTab = 'creators'" class="flex items-center space-x-2 px-3.5 py-2 text-xs font-bold rounded-xl transition whitespace-nowrap active:scale-95" :class="creatorSubTab === 'creators' ? 'bg-purple-600 text-white shadow-sm' : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'">
          <i data-lucide="users" class="w-3.5 h-3.5"></i>
          <span>Tracked Creators</span>
          <span class="px-1.5 py-0.5 rounded text-[10px] font-mono" :class="creatorSubTab === 'creators' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'" x-text="competitors.length"></span>
        </button>

        <button @click="creatorSubTab = 'archive'" class="flex items-center space-x-2 px-3.5 py-2 text-xs font-bold rounded-xl transition whitespace-nowrap active:scale-95" :class="creatorSubTab === 'archive' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'">
          <i data-lucide="archive" class="w-3.5 h-3.5"></i>
          <span>Winning Pins Archive</span>
          <span class="px-1.5 py-0.5 rounded text-[10px] font-mono" :class="creatorSubTab === 'archive' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'" x-text="formatNumber(pinarchiveOverview.total_pins)"></span>
        </button>

        <button @click="creatorSubTab = 'topics'" class="flex items-center space-x-2 px-3.5 py-2 text-xs font-bold rounded-xl transition whitespace-nowrap active:scale-95" :class="creatorSubTab === 'topics' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'">
          <i data-lucide="layers" class="w-3.5 h-3.5"></i>
          <span>Smart Topic Clusters</span>
          <span class="px-1.5 py-0.5 rounded text-[10px] font-mono" :class="creatorSubTab === 'topics' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'" x-text="pinarchiveTopics.length"></span>
        </button>

        <button @click="creatorSubTab = 'staged'" class="flex items-center space-x-2 px-3.5 py-2 text-xs font-bold rounded-xl transition whitespace-nowrap active:scale-95" :class="creatorSubTab === 'staged' ? 'bg-rose-600 text-white shadow-sm' : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'">
          <i data-lucide="send" class="w-3.5 h-3.5"></i>
          <span>Staged Repurposing</span>
          <span class="px-1.5 py-0.5 rounded text-[10px] font-mono" :class="creatorSubTab === 'staged' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'" x-text="pinarchiveOverview.staged_pins_count"></span>
        </button>

        <button @click="creatorSubTab = 'rules'" class="flex items-center space-x-2 px-3.5 py-2 text-xs font-bold rounded-xl transition whitespace-nowrap active:scale-95" :class="creatorSubTab === 'rules' ? 'bg-amber-600 text-white shadow-sm' : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'">
          <i data-lucide="sliders" class="w-3.5 h-3.5"></i>
          <span>Qualification Rules</span>
        </button>
      </div>

      <!-- ======================================================== -->
      <!-- SUB-TAB 1: 👥 TRACKED CREATORS TABLE                     -->
      <!-- ======================================================== -->
      <div x-show="creatorSubTab === 'creators'" class="space-y-4">
        <div class="p-4 rounded-2xl bg-white dark:bg-[#0b1120] border border-slate-200/80 dark:border-slate-800 space-y-4 shadow-sm">
          <div class="flex flex-col sm:flex-row items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800/80 pb-3">
            <!-- Filter Tabs -->
            <div class="flex items-center space-x-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl text-xs font-semibold">
              <button @click="competitorFilter = 'all'" class="px-3 py-1.5 rounded-lg transition" :class="competitorFilter === 'all' ? 'bg-white dark:bg-[#0b1120] text-slate-900 dark:text-white shadow-sm font-bold' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'">All Profiles</button>
              <button @click="competitorFilter = 'own'" class="px-3 py-1.5 rounded-lg transition" :class="competitorFilter === 'own' ? 'bg-white dark:bg-[#0b1120] text-slate-900 dark:text-white shadow-sm font-bold' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'">👤 My Accounts</button>
              <button @click="competitorFilter = 'competitor'" class="px-3 py-1.5 rounded-lg transition" :class="competitorFilter === 'competitor' ? 'bg-white dark:bg-[#0b1120] text-slate-900 dark:text-white shadow-sm font-bold' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'">🎯 Competitors</button>
            </div>

            <!-- Search Bar -->
            <div class="flex items-center space-x-2 w-full sm:w-auto">
              <div class="relative w-full sm:w-64">
                <i data-lucide="search" class="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"></i>
                <input type="text" x-model="competitorSearch" placeholder="Search handle, name, tag..." class="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500/50">
              </div>
              <span class="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 whitespace-nowrap" x-text="filteredCompetitors.length + ' Profiles'"></span>
            </div>
          </div>

          <!-- Competitor Table -->
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead>
                <tr class="border-b border-slate-200 dark:border-slate-800/80 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <th class="py-3 px-3 w-8"><input type="checkbox" class="rounded border-slate-300 dark:border-slate-700 text-purple-600"></th>
                  <th class="py-3 px-3">Profile</th>
                  <th class="py-3 px-3 text-right">Monthly Reach</th>
                  <th class="py-3 px-3 text-right">Profile Views</th>
                  <th class="py-3 px-3 text-right">Total Pins</th>
                  <th class="py-3 px-3 text-center">Boards</th>
                  <th class="py-3 px-3 text-center">Activity</th>
                  <th class="py-3 px-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                <template x-for="c in filteredCompetitors" :key="c.id">
                  <tr class="hover:bg-slate-50/80 dark:hover:bg-slate-900/40 transition">
                    <td class="py-3 px-3"><input type="checkbox" class="rounded border-slate-300 dark:border-slate-700 text-purple-600"></td>
                    <td class="py-3 px-3 font-sans">
                      <div class="flex items-center space-x-2.5 cursor-pointer" @click="openCreatorDossier(c)">
                        <img :src="c.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=64&h=64&fit=crop&crop=face'" class="w-8 h-8 rounded-full object-cover border border-slate-200 dark:border-slate-700 hover:scale-105 transition">
                        <div>
                          <div class="font-bold text-slate-900 dark:text-white hover:text-purple-600 dark:hover:text-purple-400 flex items-center space-x-1">
                            <span x-text="'@' + c.username"></span>
                            <i data-lucide="external-link" class="w-3 h-3 text-slate-400"></i>
                            <template x-if="c._shard_name && selectedProject === 'all'">
                              <span class="text-[9px] font-mono px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20" x-text="c._shard_name.replace('pin-arbitrage-', '')"></span>
                            </template>
                          </div>
                          <div class="text-[10px] text-slate-500 truncate max-w-[140px]" x-text="c.display_name || c.username"></div>
                        </div>
                      </div>
                    </td>
                    <td class="py-3 px-3 text-right">
                      <span class="font-bold text-slate-900 dark:text-white" x-text="formatNumber(c.monthly_reach)"></span>
                      <template x-if="c.reach_delta_7d !== 0">
                        <span class="text-[10px] font-bold ml-1.5" :class="c.reach_delta_7d > 0 ? 'text-emerald-500' : 'text-rose-500'" x-text="(c.reach_delta_7d > 0 ? '(+' : '(') + formatNumber(c.reach_delta_7d) + ')'"></span>
                      </template>
                    </td>
                    <td class="py-3 px-3 text-right">
                      <span class="text-slate-700 dark:text-slate-300" x-text="formatNumber(c.profile_views)"></span>
                      <template x-if="c.views_delta_7d !== 0">
                        <span class="text-[10px] font-bold ml-1.5" :class="c.views_delta_7d > 0 ? 'text-emerald-500' : 'text-rose-500'" x-text="(c.views_delta_7d > 0 ? '(+' : '(') + formatNumber(c.views_delta_7d) + ')'"></span>
                      </template>
                    </td>
                    <td class="py-3 px-3 text-right font-bold text-slate-800 dark:text-slate-200" x-text="formatNumber(c.total_pins)"></td>
                    <td class="py-3 px-3 text-center">
                      <button @click="openBoardsModal(c)" class="px-2.5 py-1 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-700 dark:text-purple-300 font-bold text-[11px] transition flex items-center justify-center space-x-1.5 mx-auto border border-purple-500/30 active:scale-95" title="Click to view boards breakdown & activity">
                        <span x-text="formatNumber(c.total_boards)"></span>
                        <i data-lucide="layout-grid" class="w-3 h-3 text-purple-500"></i>
                      </button>
                    </td>
                    <td class="py-3 px-3 text-center">
                      <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30" x-text="'• ' + (c.activity_status || '1d ago')"></span>
                    </td>
                    <td class="py-3 px-3 text-center">
                      <div class="flex items-center justify-center space-x-1">
                        <button @click="openCreatorDossier(c)" class="p-1.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 transition" title="Inspect Creator Dossier (Analytics & Pins)">
                          <i data-lucide="eye" class="w-3.5 h-3.5"></i>
                        </button>
                        <button @click="harvestCompetitorPinsAction(c, 'daily')" :disabled="harvestingCompetitorId === c.id" class="p-1.5 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-950/40 text-slate-400 hover:text-indigo-500 transition" title="Harvest Pins (Early-Stop 3 Pages - ~150 latest pins)">
                          <i data-lucide="download" class="w-3.5 h-3.5" :class="harvestingCompetitorId === c.id ? 'animate-bounce text-indigo-500' : ''"></i>
                        </button>
                        <button @click="syncCompetitor(c.username)" class="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-emerald-500 transition" title="Sync live profile">
                          <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i>
                        </button>
                        <button @click="deleteCompetitor(c.id)" class="p-1.5 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-950/40 text-slate-400 hover:text-rose-500 transition" title="Delete competitor">
                          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                </template>
              </tbody>
              <tfoot class="border-t-2 border-slate-200 dark:border-slate-800 font-bold text-slate-900 dark:text-white font-mono">
                <tr>
                  <td></td>
                  <td class="py-3 px-3 font-sans" x-text="'Totals (' + filteredCompetitors.length + ')'"></td>
                  <td class="py-3 px-3 text-right text-emerald-600 dark:text-emerald-400" x-text="formatNumber(competitorsOverview.combined_reach)"></td>
                  <td class="py-3 px-3 text-right text-sky-600 dark:text-sky-400" x-text="formatNumber(competitorsOverview.total_audience)"></td>
                  <td class="py-3 px-3 text-right text-amber-600 dark:text-amber-400" x-text="formatNumber(competitorsOverview.pins_tracked)"></td>
                  <td colspan="3"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>

      <!-- ======================================================== -->
      <!-- SUB-TAB 2: 📦 WINNING PINS ARCHIVE CATALOG               -->
      <!-- ======================================================== -->
      <div x-show="creatorSubTab === 'archive'" class="space-y-4">
        <div class="p-4 rounded-2xl bg-white dark:bg-[#0b1120] border border-slate-200/80 dark:border-slate-800 space-y-4 shadow-sm">
          <!-- Filters & View Mode Header -->
          <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800/80 pb-3">
            <div class="flex flex-wrap items-center gap-2">
              <i data-lucide="trophy" class="w-4 h-4 text-amber-500"></i>
              <h3 class="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">Winning Pins Catalog</h3>
              <template x-if="pinarchiveSelectedTopic">
                <span class="px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center space-x-1">
                  <span x-text="'Topic: ' + pinarchiveSelectedTopic"></span>
                  <button @click="pinarchiveSelectedTopic = ''; fetchPinArchivePins()" class="hover:text-rose-500 ml-1">×</button>
                </span>
              </template>
              <template x-if="pinarchiveSelectedAccount">
                <span class="px-2 py-0.5 rounded-full text-xs font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center space-x-1">
                  <span x-text="'Creator: @' + pinarchiveSelectedAccount"></span>
                  <button @click="pinarchiveSelectedAccount = ''; fetchPinArchivePins()" class="hover:text-rose-500 ml-1">×</button>
                </span>
              </template>
            </div>

            <!-- Controls: Account Filter, Search, Min Saves, Sort, View Toggle -->
            <div class="flex flex-wrap items-center gap-2 w-full lg:w-auto">
              <!-- Account Filter -->
              <select x-model="pinarchiveSelectedAccount" @change="fetchPinArchivePins()" class="px-2.5 py-1.5 text-xs rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 font-mono outline-none">
                <option value="">All Creators</option>
                <template x-for="c in competitors" :key="c.id">
                  <option :value="c.username" x-text="'@' + c.username"></option>
                </template>
              </select>

              <!-- Text Search -->
              <div class="relative w-full sm:w-44">
                <i data-lucide="search" class="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"></i>
                <input type="text" x-model="pinarchiveSearch" @input.debounce.300ms="fetchPinArchivePins()" placeholder="Search pins..." class="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none">
              </div>

              <!-- Min Saves -->
              <select x-model="pinarchiveMinSaves" @change="fetchPinArchivePins()" class="px-2.5 py-1.5 text-xs rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 font-mono outline-none">
                <option value="0">All Saves</option>
                <option value="50">🔥 Min 50 Saves</option>
                <option value="200">🚀 Min 200 Saves</option>
                <option value="1000">💎 Min 1,000 Saves</option>
                <option value="5000">👑 Min 5,000 Saves</option>
              </select>

              <!-- Sort -->
              <select x-model="pinarchiveSort" @change="fetchPinArchivePins()" class="px-2.5 py-1.5 text-xs rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 font-mono outline-none">
                <option value="saves">Sort: Saves DESC</option>
                <option value="velocity">Sort: Daily Velocity</option>
                <option value="created_at">Sort: Newest Pin</option>
                <option value="repins">Sort: Repins DESC</option>
              </select>

              <!-- View Mode Toggle (Grid vs Table) -->
              <div class="flex items-center bg-slate-100 dark:bg-slate-900 p-0.5 rounded-xl border border-slate-200 dark:border-slate-800">
                <button @click="pinarchiveViewMode = 'grid'" class="p-1.5 rounded-lg transition" :class="pinarchiveViewMode === 'grid' ? 'bg-white dark:bg-[#0b1120] text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'" title="Cards Grid View">
                  <i data-lucide="layout-grid" class="w-3.5 h-3.5"></i>
                </button>
                <button @click="pinarchiveViewMode = 'table'" class="p-1.5 rounded-lg transition" :class="pinarchiveViewMode === 'table' ? 'bg-white dark:bg-[#0b1120] text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'" title="Table View">
                  <i data-lucide="list" class="w-3.5 h-3.5"></i>
                </button>
              </div>
            </div>
          </div>

          <!-- VIEW MODE 1: CARDS GRID VIEW -->
          <div x-show="pinarchiveViewMode === 'grid'" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            <template x-for="pin in pinarchivePins" :key="pin.pin_id">
              <div class="bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden shadow-sm hover:border-indigo-500/50 transition flex flex-col justify-between">
                <div>
                  <div class="relative aspect-[2/3] bg-slate-200 dark:bg-slate-800 overflow-hidden group">
                    <img :src="pin.image_url" loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition duration-300">
                    <div class="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition flex items-end p-3">
                      <span class="text-white text-xs font-bold truncate" x-text="pin.title || 'Untitled Pin'"></span>
                    </div>
                    <!-- Color Swatch -->
                    <template x-if="pin.dominant_color">
                      <span class="absolute top-2 left-2 w-3.5 h-3.5 rounded-full border border-white/50 shadow" :style="'background-color: ' + pin.dominant_color"></span>
                    </template>
                    <!-- Velocity Pill -->
                    <span class="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-950/70 text-amber-400 backdrop-blur-sm border border-amber-500/30 flex items-center space-x-1">
                      <i data-lucide="zap" class="w-2.5 h-2.5"></i>
                      <span x-text="(pin.velocity || '0') + '/day'"></span>
                    </span>
                  </div>

                  <!-- Details -->
                  <div class="p-3.5 space-y-2">
                    <h4 class="font-bold text-xs text-slate-900 dark:text-white line-clamp-2" x-text="pin.title || 'Untitled Pin'"></h4>
                    <div class="flex items-center justify-between text-[11px] font-mono text-slate-500">
                      <span class="truncate hover:text-purple-600 dark:hover:text-purple-400 hover:underline cursor-pointer" @click="openCreatorDossierByName(pin.account_username)" :title="'Inspect @' + pin.account_username + ' Dossier'" x-text="'@' + (pin.account_username || 'creator')"></span>
                      <span class="px-1.5 py-0.2 rounded bg-slate-200 dark:bg-slate-800 text-[10px]" x-text="pin.board_name || 'General'"></span>
                    </div>

                    <!-- Metrics Badges -->
                    <div class="flex items-center space-x-2 pt-1 font-mono text-xs">
                      <span class="flex items-center space-x-1 text-purple-600 dark:text-purple-400 font-bold">
                        <i data-lucide="bookmark" class="w-3 h-3"></i>
                        <span x-text="formatNumber(pin.saves)"></span>
                      </span>
                      <span class="flex items-center space-x-1 text-slate-500 text-[11px]">
                        <i data-lucide="repeat" class="w-3 h-3"></i>
                        <span x-text="formatNumber(pin.repins)"></span>
                      </span>
                    </div>
                  </div>
                </div>

                <!-- Action Bar -->
                <div class="p-3 pt-0 border-t border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between gap-2 mt-2">
                  <a :href="'https://www.pinterest.com/pin/' + pin.pin_id + '/'" target="_blank" class="p-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-indigo-500 transition" title="Open on Pinterest">
                    <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                  </a>
                  <button @click="stagePinAction(pin.pin_id)" class="flex-1 py-1.5 px-2.5 rounded-xl text-[11px] font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition active:scale-95 flex items-center justify-center space-x-1 shadow-sm">
                    <i data-lucide="plus" class="w-3 h-3"></i>
                    <span>Stage for Repurpose</span>
                  </button>
                </div>
              </div>
            </template>
          </div>

          <!-- VIEW MODE 2: TABLE VIEW (Matching User Mockup 4) -->
          <div x-show="pinarchiveViewMode === 'table'" class="overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead>
                <tr class="border-b border-slate-200 dark:border-slate-800/80 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <th class="py-3 px-3">Pin</th>
                  <th class="py-3 px-3">Title & Creator</th>
                  <th class="py-3 px-3">Board</th>
                  <th class="py-3 px-3 text-right">Saves</th>
                  <th class="py-3 px-3 text-right">Repins</th>
                  <th class="py-3 px-3 text-right">Velocity</th>
                  <th class="py-3 px-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                <template x-for="pin in pinarchivePins" :key="pin.pin_id">
                  <tr class="hover:bg-slate-50/80 dark:hover:bg-slate-900/40 transition">
                    <td class="py-2 px-3 w-14">
                      <img :src="pin.image_url" class="w-10 h-14 rounded-lg object-cover border border-slate-200 dark:border-slate-700">
                    </td>
                    <td class="py-2 px-3 font-sans">
                      <div class="font-bold text-slate-900 dark:text-white line-clamp-1" x-text="pin.title || 'Untitled Pin'"></div>
                      <div class="text-[11px] text-purple-600 dark:text-purple-400 font-mono mt-0.5 hover:underline cursor-pointer" @click="openCreatorDossierByName(pin.account_username)" :title="'Inspect @' + pin.account_username + ' Dossier'" x-text="'@' + (pin.account_username || 'creator')"></div>
                    </td>
                    <td class="py-2 px-3 font-sans text-slate-600 dark:text-slate-300" x-text="pin.board_name || 'General'"></td>
                    <td class="py-2 px-3 text-right font-bold text-purple-600 dark:text-purple-400" x-text="formatNumber(pin.saves)"></td>
                    <td class="py-2 px-3 text-right text-slate-500" x-text="formatNumber(pin.repins)"></td>
                    <td class="py-2 px-3 text-right font-bold text-amber-500" x-text="(pin.velocity || '0') + '/d'"></td>
                    <td class="py-2 px-3 text-center">
                      <div class="flex items-center justify-center space-x-1.5">
                        <button @click="stagePinAction(pin.pin_id)" class="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[11px] transition shadow-sm active:scale-95">
                          Stage
                        </button>
                        <a :href="'https://www.pinterest.com/pin/' + pin.pin_id + '/'" target="_blank" class="p-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-indigo-500 transition">
                          <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                        </a>
                      </div>
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>

          <!-- Empty State -->
          <div x-show="!isLoadingPinArchive && pinarchivePins.length === 0" class="text-center py-12 text-slate-500 font-mono text-xs">
            <i data-lucide="inbox" class="w-8 h-8 mx-auto mb-2 text-slate-400"></i>
            <span>No archived winning pins matching the current filters.</span>
          </div>
        </div>
      </div>

      <!-- ======================================================== -->
      <!-- SUB-TAB 3: 🧠 SMART TOPIC CLUSTERS                       -->
      <!-- ======================================================== -->
      <div x-show="creatorSubTab === 'topics'" class="space-y-4">
        <div class="p-4 rounded-2xl bg-white dark:bg-[#0b1120] border border-slate-200/80 dark:border-slate-800 space-y-4 shadow-sm">
          <div class="flex flex-col sm:flex-row items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800/80 pb-3">
            <div class="flex items-center space-x-2">
              <i data-lucide="layers" class="w-4 h-4 text-emerald-500"></i>
              <h3 class="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">Smart Topic Clusters (مستكشف العناقيد الذكية من وسوم بينتريست)</h3>
            </div>
            <div class="flex items-center space-x-2 w-full sm:w-auto">
              <div class="relative w-full sm:w-56">
                <i data-lucide="search" class="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"></i>
                <input type="text" x-model="pinarchiveTopicSearch" @input.debounce.300ms="fetchPinArchiveTopics()" placeholder="Filter topic clusters..." class="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50">
              </div>
              <span class="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 whitespace-nowrap" x-text="pinarchiveTopics.length + ' Clusters'"></span>
            </div>
          </div>

          <!-- Clusters Grid Chips -->
          <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 max-h-72 overflow-y-auto p-1">
            <template x-for="t in pinarchiveTopics" :key="t.name">
              <div @click="filterByTopic(t.name); creatorSubTab = 'archive'" class="p-3 rounded-xl border transition cursor-pointer active:scale-95" :class="pinarchiveSelectedTopic === t.name ? 'bg-emerald-500/15 border-emerald-500 text-emerald-700 dark:text-emerald-300 shadow-sm' : 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 hover:border-emerald-500/40 text-slate-800 dark:text-slate-200'">
                <div class="font-bold text-xs truncate flex items-center justify-between">
                  <span class="truncate" x-text="t.name"></span>
                  <span class="ml-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400" x-text="t.pins_count + ' pins'"></span>
                </div>
                <div class="mt-2 flex items-center justify-between text-[11px] font-mono text-slate-500 dark:text-slate-400">
                  <span>Avg: <strong class="text-purple-600 dark:text-purple-400" x-text="formatNumber(t.avg_saves)"></strong></span>
                  <span>Tot: <strong class="text-indigo-600 dark:text-indigo-400" x-text="formatNumber(t.total_saves)"></strong></span>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>

      <!-- ======================================================== -->
      <!-- SUB-TAB 4: 🚀 STAGED REPURPOSING QUEUE                   -->
      <!-- ======================================================== -->
      <div x-show="creatorSubTab === 'staged'" class="space-y-4">
        <div class="p-4 rounded-2xl bg-white dark:bg-[#0b1120] border border-slate-200/80 dark:border-slate-800 space-y-4 shadow-sm">
          <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-800/80 pb-3">
            <div class="flex items-center space-x-2">
              <i data-lucide="send" class="w-4 h-4 text-rose-500"></i>
              <div>
                <h3 class="font-bold text-xs uppercase tracking-wider text-slate-800 dark:text-slate-200">Staged Pins Queue (طابور النشر بالـ Compare-And-Swap)</h3>
                <p class="text-[11px] text-slate-500">Atomic CAS ensures zero double-posting across concurrent runners.</p>
              </div>
            </div>
            <button @click="fetchStagedPins()" class="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center space-x-1.5">
              <i data-lucide="rotate-cw" class="w-3.5 h-3.5"></i>
              <span>Refresh Queue</span>
            </button>
          </div>

          <div class="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden max-h-96 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            <template x-for="item in stagedPinsList" :key="item.id">
              <div class="p-3 bg-white dark:bg-slate-900/50 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                <div class="flex items-center space-x-3 min-w-0">
                  <template x-if="item.image_url">
                    <img :src="item.image_url" class="w-10 h-14 rounded-lg object-cover border border-slate-200 dark:border-slate-700 flex-shrink-0">
                  </template>
                  <div class="min-w-0 space-y-1">
                    <h5 class="font-bold text-xs text-slate-900 dark:text-white truncate" x-text="item.title || 'Archived Pin'"></h5>
                    <div class="flex items-center space-x-2 text-[11px] font-mono text-slate-500">
                      <span x-text="'Pin ID: ' + item.pin_id"></span>
                      <span>•</span>
                      <span x-text="formatNumber(item.saves) + ' saves'"></span>
                      <span>•</span>
                      <span class="text-amber-500" x-text="(item.velocity || '0') + '/day'"></span>
                    </div>
                  </div>
                </div>

                <div class="flex items-center space-x-2">
                  <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase" :class="item.status === 'staged' ? 'bg-amber-500/10 text-amber-600 border border-amber-500/30' : 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/30'" x-text="item.status"></span>
                  <template x-if="item.status === 'staged'">
                    <div class="flex items-center space-x-1.5">
                      <button @click="claimStagedPinAction(item.id)" class="px-3 py-1 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition active:scale-95 shadow-sm">
                        Mark Dispatched (CAS)
                      </button>
                      <button @click="cancelStagedPinAction(item.id)" class="p-1 rounded-xl hover:bg-rose-100 dark:hover:bg-rose-950/40 text-slate-400 hover:text-rose-500" title="Cancel Staged">
                        <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                      </button>
                    </div>
                  </template>
                </div>
              </div>
            </template>
            <div x-show="stagedPinsList.length === 0" class="p-8 text-center text-slate-400 text-xs font-mono">
              <span>No pins currently staged in queue.</span>
            </div>
          </div>
        </div>
      </div>

      <!-- ======================================================== -->
      <!-- SUB-TAB 5: ⚙️ QUALIFICATION & INGEST RULES                -->
      <!-- ======================================================== -->
      <div x-show="creatorSubTab === 'rules'" class="space-y-4">
        <div class="p-5 rounded-2xl bg-white dark:bg-[#0b1120] border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
          <div class="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800/80 pb-3.5">
            <div class="flex items-center space-x-3">
              <div class="p-2 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
                <i data-lucide="sliders" class="w-5 h-5"></i>
              </div>
              <div>
                <div class="flex items-center space-x-2">
                  <h3 class="text-sm font-bold text-slate-900 dark:text-white">Pin Qualification & Ingest Rules</h3>
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">Active Engine</span>
                </div>
                <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">فلاتر تصفية الدبابيس وشروط الاستبعاد لتجنب فحص 20,000 دبوس وسحب الفائزين فقط</p>
              </div>
            </div>

            <div class="flex items-center space-x-2 self-end md:self-auto">
              <button @click="reEvaluateCandidatesAction()" :disabled="isReEvaluating" class="px-3 py-1.5 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition active:scale-95 disabled:opacity-50 flex items-center space-x-1.5 shadow-sm" title="Re-evaluate already archived pins against current criteria">
                <i data-lucide="refresh-cw" :class="{'animate-spin': isReEvaluating}" class="w-3.5 h-3.5 text-purple-500"></i>
                <span x-text="isReEvaluating ? 'Evaluating...' : 'إعادة تقييم الدبابيس الحالية'"></span>
              </button>

              <button @click="saveQualificationRulesAction()" :disabled="isSavingRules" class="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition active:scale-95 disabled:opacity-50 flex items-center space-x-1.5 shadow-sm">
                <i data-lucide="save" :class="{'animate-spin': isSavingRules}" class="w-3.5 h-3.5"></i>
                <span x-text="isSavingRules ? 'Saving...' : 'حفظ القواعد'"></span>
              </button>
            </div>
          </div>

          <!-- 3 Qualification Tiers (Grid) -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            <!-- Tier 1 -->
            <div class="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800 space-y-2.5 relative">
              <div class="flex items-center justify-between">
                <span class="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center space-x-1.5">
                  <i data-lucide="bookmark" class="w-3.5 h-3.5 text-indigo-500"></i>
                  <span>الشرط الأول (Tier 1: High Saves)</span>
                </span>
                <span class="px-1.5 py-0.5 rounded text-[10px] font-bold font-mono bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">OR Rule</span>
              </div>
              <div>
                <label class="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block mb-1">الحد الأدنى للحفظ (Saves):</label>
                <div class="relative">
                  <input type="number" min="0" step="5" x-model.number="qualificationRules.tier1_min_saves" class="w-full px-3 py-1.5 text-xs font-mono font-bold rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50">
                  <span class="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-mono">saves</span>
                </div>
              </div>
              <p class="text-[11px] text-slate-500 dark:text-slate-400">تطبيق تلقائي عند اكتشاف دبابيس ذات حفظ عالي ومعدل تخزين استثنائي.</p>
            </div>

            <!-- Tier 2 -->
            <div class="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800 space-y-2.5 relative">
              <div class="flex items-center justify-between">
                <span class="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center space-x-1.5">
                  <i data-lucide="repeat" class="w-3.5 h-3.5 text-purple-500"></i>
                  <span>الشرط الثاني (Tier 2: High Repins)</span>
                </span>
                <span class="px-1.5 py-0.5 rounded text-[10px] font-bold font-mono bg-purple-500/10 text-purple-600 dark:text-purple-400">OR Rule</span>
              </div>
              <div>
                <label class="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block mb-1">الحد الأدنى لإعادة النشر (Repins):</label>
                <div class="relative">
                  <input type="number" min="0" step="5" x-model.number="qualificationRules.tier2_min_repins" class="w-full px-3 py-1.5 text-xs font-mono font-bold rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50">
                  <span class="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-mono">repins</span>
                </div>
              </div>
              <p class="text-[11px] text-slate-500 dark:text-slate-400">تطبيق على الدبابيس الفيروسية ذات الانتشار الواسع وإعادة النشر.</p>
            </div>

            <!-- Tier 3 -->
            <div class="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800 space-y-2.5 relative">
              <div class="flex items-center justify-between">
                <span class="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center space-x-1.5">
                  <i data-lucide="zap" class="w-3.5 h-3.5 text-amber-500"></i>
                  <span>الشرط الثالث (Tier 3: Fresh High-Velocity)</span>
                </span>
                <span class="px-1.5 py-0.5 rounded text-[10px] font-bold font-mono bg-amber-500/10 text-amber-600 dark:text-amber-400">OR Rule</span>
              </div>
              <div class="grid grid-cols-2 gap-2">
                <div>
                  <label class="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block mb-1">أقصى عمر (أيام):</label>
                  <input type="number" min="1" step="1" x-model.number="qualificationRules.tier3_max_age_days" class="w-full px-2.5 py-1.5 text-xs font-mono font-bold rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50">
                </div>
                <div>
                  <label class="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block mb-1">أدنى حفظ:</label>
                  <input type="number" min="1" step="5" x-model.number="qualificationRules.tier3_min_saves" class="w-full px-2.5 py-1.5 text-xs font-mono font-bold rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50">
                </div>
              </div>
              <p class="text-[11px] text-slate-500 dark:text-slate-400">اصطياد المحتوى الصاعد بسرعة (Fresh Breakouts) حتى لو لم يصل للحد العام بعد.</p>
            </div>
          </div>

          <!-- Formula Logic Card -->
          <div class="p-3.5 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/20 border border-indigo-200/80 dark:border-indigo-900/40 text-xs">
            <div class="flex items-center space-x-2 text-indigo-700 dark:text-indigo-300 font-bold mb-1">
              <i data-lucide="shield-check" class="w-4 h-4"></i>
              <span>منطق التصفية المعتمد (OR Logic Engine)</span>
            </div>
            <p class="text-slate-600 dark:text-slate-300 text-[11px] leading-relaxed">
              الدبوس يتأهل ويتم حفظه في الأرشيف إذا حقق:
              <span class="font-bold text-indigo-600 dark:text-indigo-400" x-text="'(الحفظ ≥ ' + qualificationRules.tier1_min_saves + ')'"></span>
              أو
              <span class="font-bold text-purple-600 dark:text-purple-400" x-text="'(الريبينز ≥ ' + qualificationRules.tier2_min_repins + ')'"></span>
              أو
              <span class="font-bold text-amber-600 dark:text-amber-400" x-text="'(العمر ≤ ' + qualificationRules.tier3_max_age_days + ' أيام والحفظ ≥ ' + qualificationRules.tier3_min_saves + ')'"></span>.
              <span class="text-slate-500 dark:text-slate-400 block mt-1">⚠️ يتم استبعاد باقي الدبابيس الضعيفة فوراً لحماية قاعدة بيانات Neon Postgres من التضخم وضمان جودة دبابيس الأربتراج.</span>
            </p>
          </div>

          <!-- Automation Routines & Ingest Scheduler -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3.5 pt-1">
            <div class="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
              <div>
                <span class="text-xs font-bold text-slate-800 dark:text-slate-200 block">التشغيل التلقائي اليومي</span>
                <span class="text-[10px] text-slate-500 dark:text-slate-400">Daily Ingest Cron Automation</span>
              </div>
              <label class="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" x-model="qualificationRules.cron_enabled" class="sr-only peer">
                <div class="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-800 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
              </label>
            </div>

            <div class="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800 space-y-1.5">
              <div class="flex items-center justify-between">
                <label class="text-xs font-bold text-slate-800 dark:text-slate-200">عمق الفحص اليومي (Early-Stop):</label>
                <span class="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 font-mono">Recommended: 3</span>
              </div>
              <div class="relative">
                <input type="number" min="1" max="10" x-model.number="qualificationRules.early_stop_pages" class="w-full px-3 py-1 text-xs font-mono font-bold rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50">
                <span class="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-mono">pages (~150 pins)</span>
              </div>
              <span class="text-[10px] text-slate-500 dark:text-slate-400 block">كافية لاكتشاف دبابيس المنافس الحديثة وتفادي حظر Pinterest.</span>
            </div>

            <div class="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800 space-y-1.5">
              <div class="flex items-center justify-between">
                <label class="text-xs font-bold text-slate-800 dark:text-slate-200">فحص شامل (Deep Audit Sweep):</label>
                <span class="text-[10px] font-bold text-purple-600 dark:text-purple-400 font-mono">Manual Only</span>
              </div>
              <div class="relative">
                <input type="number" min="10" max="1000" x-model.number="qualificationRules.discovery_max_pages" class="w-full px-3 py-1 text-xs font-mono font-bold rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50">
                <span class="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-mono">pages (max 500)</span>
              </div>
              <span class="text-[10px] text-slate-500 dark:text-slate-400 block">فحص حسابات المنافسين الجديدة عند إضافتها فقط.</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

            <!-- ======================================================== -->
      <!-- VIEW B: INDEPENDENT CREATOR PAGE (DEDICATED FULL VIEW)    -->
      <!-- Pixel-by-Pixel Parity with pinorbit-v2 & User Images 1-3  -->
      <!-- ======================================================== -->
      <template x-if="activeCreator">
        <div class="space-y-6 animate-in fade-in duration-200">
          
          <!-- ═══ Top Navigation & Primary Action Controls (Image 3) ═══ -->
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <button @click="closeCreatorProfile()" class="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition group cursor-pointer">
              <i data-lucide="arrow-left" class="w-4 h-4 transition-transform group-hover:-translate-x-0.5"></i>
              <span>← Back to All Creators & PinArchive</span>
            </button>

            <!-- Action Toolbar -->
            <div class="flex items-center gap-2 flex-wrap self-start sm:self-auto">
              <a :href="'https://www.pinterest.com/' + (activeCreator.username || '').replace(/^@+/, '') + '/'" target="_blank" rel="noopener noreferrer" class="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1526] px-3 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition shadow-2xs">
                <span>View on Pinterest</span>
                <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
              </a>

              <button @click="syncCompetitor(activeCreator.username)" class="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition shadow-2xs cursor-pointer" title="Sync profile reach, followers, and boards breakdown">
                <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i>
                <span>🔄 Sync Profile</span>
              </button>

              <button @click="openGhaCrawlerModal(activeCreator)" :disabled="isDispatchingGitHubCrawl" class="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white px-4 text-xs font-bold transition shadow-md cursor-pointer disabled:opacity-50" title="Launch 20-Shard Parallel Matrix Crawler on GitHub Actions (Distributed IP Egress & 100% Reliability)">
                <i data-lucide="zap" class="w-3.5 h-3.5" :class="isDispatchingGitHubCrawl ? 'animate-spin' : ''"></i>
                <span x-text="isDispatchingGitHubCrawl ? 'Dispatching...' : '⚡ Harvest Pins (GitHub Actions 20 Shards)'"></span>
              </button>

              <button @click="toggleCompetitorStatus(activeCreator)" class="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1526] px-3 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition shadow-2xs cursor-pointer">
                <span x-text="activeCreator.is_active === false ? '▶ Resume' : '⏸ Pause'"></span>
              </button>
            </div>
          </div>

          <!-- ═══ Profile Hero Card (Image 1 & 3) ═══ -->
          <div class="rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#0d1526] p-5 sm:p-6 shadow-xs relative overflow-hidden">
            <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
              
              <!-- Left: Avatar & Meta -->
              <div class="flex items-start gap-4">
                <div class="relative">
                  <img
                    :src="activeCreator.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&h=200&q=80'"
                    alt="Avatar"
                    class="h-16 w-16 rounded-2xl object-cover border border-slate-200 dark:border-slate-800 shadow-2xs flex-shrink-0 bg-slate-100 dark:bg-slate-800"
                  />
                </div>

                <div class="space-y-1.5 min-w-0">
                  <div class="flex flex-wrap items-center gap-2.5">
                    <h1 class="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white" x-text="(activeCreator.username || '').replace(/^@+/, '')"></h1>
                    <span class="rounded-full bg-purple-500/10 px-2.5 py-0.5 text-[11px] font-bold text-purple-600 dark:text-purple-400 border border-purple-500/20" x-text="activeCreator.account_type === 'own' ? '🎯 Own Account' : '🎯 Competitor'"></span>
                    <span class="rounded-full bg-rose-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-rose-600 dark:text-rose-400 border border-rose-500/20">General</span>
                  </div>

                  <div class="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span class="font-medium text-slate-900 dark:text-slate-100" x-text="'@' + (activeCreator.username || '').replace(/^@+/, '')"></span>
                    <span>•</span>
                    <a :href="'https://www.pinterest.com/' + (activeCreator.username || '').replace(/^@+/, '') + '/'" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 font-semibold text-rose-500 hover:underline">
                      <span>View on Pinterest</span>
                      <i data-lucide="external-link" class="w-3 h-3"></i>
                    </a>
                    <template x-if="activeCreatorDetail?.profile?.website_domain">
                      <span class="inline-flex items-center gap-1.5">
                        <span>•</span>
                        <i data-lucide="globe" class="w-3 h-3 text-slate-400"></i>
                        <span class="font-medium text-slate-900 dark:text-slate-100" x-text="activeCreatorDetail.profile.website_domain"></span>
                        <span x-show="activeCreatorDetail.profile.verified_domain" class="rounded-full bg-emerald-500/10 px-2 py-0.2 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">✓ Verified Domain</span>
                      </span>
                    </template>
                    <span>•</span>
                    <span class="text-[11px] text-slate-400" x-text="'Last Pin: ' + (activeCreatorDetail?.profile?.last_pin_date || '—')"></span>
                  </div>

                  <p class="text-xs text-slate-500 dark:text-slate-400 pt-0.5 max-w-2xl" x-text="activeCreatorDetail?.profile?.notes || 'No internal notes set for this competitor.'"></p>
                </div>
              </div>

              <!-- Right: Account Age & Strategy Age Metric Badges -->
              <div class="flex flex-wrap items-center gap-3 self-start lg:self-auto">
                <!-- Account Age Metric Badge -->
                <div class="flex items-center gap-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-2xl p-4 border border-slate-200/80 dark:border-slate-800 shadow-2xs">
                  <div class="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500 border border-blue-500/20">
                    <i data-lucide="user-check" class="w-5 h-5"></i>
                  </div>
                  <div>
                    <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Account Age</span>
                    <div class="text-lg font-extrabold text-slate-900 dark:text-white font-mono tabular-nums" x-text="(activeCreatorDetail?.account_age?.days || activeCreatorDetail?.strategy_age?.days || 0) + ' Days'"></div>
                    <span class="text-[10px] text-slate-400" x-text="'Created: ' + (activeCreatorDetail?.account_age?.created_at || activeCreatorDetail?.strategy_age?.oldest_board_date || '—')"></span>
                  </div>
                </div>

                <!-- Strategy Age Metric Badge (Oldest Board Created Date) -->
                <div class="flex items-center gap-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-2xl p-4 border border-slate-200/80 dark:border-slate-800 shadow-2xs">
                  <div class="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-500/10 text-rose-500 border border-rose-500/20">
                    <i data-lucide="calendar" class="w-5 h-5"></i>
                  </div>
                  <div>
                    <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Strategy Age (Oldest Board)</span>
                    <div class="text-lg font-extrabold text-slate-900 dark:text-white font-mono tabular-nums" x-text="(activeCreatorDetail?.strategy_age?.days || 0) + ' Days'"></div>
                    <span class="text-[10px] text-slate-400" x-text="'Oldest board: ' + (activeCreatorDetail?.strategy_age?.oldest_board_date || '—')"></span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- ═══ Per-Account 3-Tier Qualification Rules Card ═══ -->
          <div class="rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#0d1526] p-5 sm:p-6 shadow-xs relative overflow-hidden" x-data="{ isRulesOpen: false }">
            <div class="flex items-center justify-between cursor-pointer" @click="isRulesOpen = !isRulesOpen">
              <div class="flex items-center gap-3">
                <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
                  <i data-lucide="sliders" class="w-5 h-5"></i>
                </div>
                <div>
                  <div class="flex items-center gap-2">
                    <h3 class="text-sm font-extrabold text-slate-900 dark:text-white">Account Qualification Rules</h3>
                    <span class="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">Active Profile</span>
                  </div>
                  <p class="text-xs text-slate-500 dark:text-slate-400">Configure independent 3-tier winning pin thresholds and product filtering specifically for @<span x-text="(activeCreator.username || '').replace(/^@+/, '')"></span>.</p>
                </div>
              </div>
              <button class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-2 rounded-lg cursor-pointer">
                <i data-lucide="chevron-down" class="w-5 h-5 transition-transform" :class="isRulesOpen ? 'rotate-180' : ''"></i>
              </button>
            </div>

            <!-- Expandable Rules Form -->
            <div x-show="isRulesOpen" x-transition class="mt-5 pt-5 border-t border-slate-200/80 dark:border-slate-800/80 space-y-4">
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                
                <!-- Tier 1: Saves -->
                <div class="rounded-2xl bg-slate-50 dark:bg-slate-900/50 p-3.5 border border-slate-200/60 dark:border-slate-800/60">
                  <div class="flex items-center justify-between mb-1.5">
                    <span class="text-[11px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">Tier 1: Min Saves</span>
                    <i data-lucide="bookmark" class="w-3.5 h-3.5 text-amber-500"></i>
                  </div>
                  <input type="number" x-model.number="creatorRules.tier1_min_saves" class="w-full h-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0b1120] px-3 text-xs font-bold text-slate-900 dark:text-white" placeholder="5000" />
                  <span class="text-[10px] text-slate-400 mt-1 block">Evergreen high-volume target</span>
                </div>

                <!-- Tier 2: Repins -->
                <div class="rounded-2xl bg-slate-50 dark:bg-slate-900/50 p-3.5 border border-slate-200/60 dark:border-slate-800/60">
                  <div class="flex items-center justify-between mb-1.5">
                    <span class="text-[11px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">Tier 2: Min Repins</span>
                    <i data-lucide="repeat" class="w-3.5 h-3.5 text-blue-500"></i>
                  </div>
                  <input type="number" x-model.number="creatorRules.tier2_min_repins" class="w-full h-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0b1120] px-3 text-xs font-bold text-slate-900 dark:text-white" placeholder="2500" />
                  <span class="text-[10px] text-slate-400 mt-1 block">High distribution virality</span>
                </div>

                <!-- Tier 3: Fresh Age Days -->
                <div class="rounded-2xl bg-slate-50 dark:bg-slate-900/50 p-3.5 border border-slate-200/60 dark:border-slate-800/60">
                  <div class="flex items-center justify-between mb-1.5">
                    <span class="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Tier 3: Max Age (Days)</span>
                    <i data-lucide="sparkles" class="w-3.5 h-3.5 text-emerald-500"></i>
                  </div>
                  <input type="number" x-model.number="creatorRules.tier3_fresh_days" class="w-full h-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0b1120] px-3 text-xs font-bold text-slate-900 dark:text-white" placeholder="60" />
                  <span class="text-[10px] text-slate-400 mt-1 block">Fresh breakout window</span>
                </div>

                <!-- Tier 3: Fresh Min Saves -->
                <div class="rounded-2xl bg-slate-50 dark:bg-slate-900/50 p-3.5 border border-slate-200/60 dark:border-slate-800/60">
                  <div class="flex items-center justify-between mb-1.5">
                    <span class="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Tier 3: Fresh Min Saves</span>
                    <i data-lucide="zap" class="w-3.5 h-3.5 text-emerald-500"></i>
                  </div>
                  <input type="number" x-model.number="creatorRules.tier3_min_saves" class="w-full h-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0b1120] px-3 text-xs font-bold text-slate-900 dark:text-white" placeholder="500" />
                  <span class="text-[10px] text-slate-400 mt-1 block">Early breakout acceleration</span>
                </div>
              </div>

              <!-- Options & Buttons Bar -->
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                <div class="flex items-center gap-4">
                  <label class="inline-flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <input type="checkbox" x-model="creatorRules.articles_only" class="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4" />
                    <span>🎯 Articles Only (Exclude E-commerce Products: <code class="text-[10px] font-mono bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">!is_product</code>)</span>
                  </label>
                </div>

                <div class="flex items-center gap-2.5">
                  <button @click="saveCreatorRulesAction()" :disabled="isSavingCreatorRules" class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 text-xs font-bold transition shadow-xs cursor-pointer disabled:opacity-50">
                    <i data-lucide="save" class="w-3.5 h-3.5"></i>
                    <span x-text="isSavingCreatorRules ? 'Saving...' : 'Save Rules for this Account'"></span>
                  </button>
                  <button @click="reEvaluateCreatorPinsAction()" :disabled="isReEvaluatingCreatorPins" class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition shadow-xs cursor-pointer disabled:opacity-50">
                    <i data-lucide="refresh-cw" class="w-3.5 h-3.5" :class="isReEvaluatingCreatorPins ? 'animate-spin' : ''"></i>
                    <span x-text="isReEvaluatingCreatorPins ? 'Evaluating...' : '⚡ Re-evaluate Pins'"></span>
                  </button>
                </div>
              </div>

              <!-- Message feedback -->
              <template x-if="reEvaluateMessage">
                <div class="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-semibold flex items-center gap-2">
                  <i data-lucide="check-circle" class="w-4 h-4"></i>
                  <span x-text="reEvaluateMessage"></span>
                </div>
              </template>
            </div>
          </div>

          <!-- ═══ In-Page Sub-Navigation Tabs ═══ -->
          <div class="flex items-center space-x-2 border-b border-slate-200 dark:border-slate-800 pb-3 overflow-x-auto">
            <button @click="switchCreatorTab('overview')" class="flex items-center space-x-2 px-4 py-2 text-xs font-bold rounded-xl transition cursor-pointer" :class="activeCreatorTab === 'overview' ? 'bg-rose-500 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900'">
              <i data-lucide="line-chart" class="w-4 h-4"></i>
              <span>Overview &amp; Growth Trends</span>
            </button>
            <button @click="switchCreatorTab('all_pins')" class="flex items-center space-x-2 px-4 py-2 text-xs font-bold rounded-xl transition cursor-pointer" :class="activeCreatorTab === 'all_pins' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900'">
              <i data-lucide="list" class="w-4 h-4"></i>
              <span>📋 All Account Pins</span>
              <span class="px-2 py-0.5 rounded text-[10px] font-mono" :class="activeCreatorTab === 'all_pins' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-800'" x-text="activeCreatorAllPinsTotal || 0"></span>
            </button>
            <button @click="switchCreatorTab('pins')" class="flex items-center space-x-2 px-4 py-2 text-xs font-bold rounded-xl transition cursor-pointer" :class="activeCreatorTab === 'pins' ? 'bg-rose-500 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900'">
              <i data-lucide="archive" class="w-4 h-4"></i>
              <span>📌 Winning Pins Archive</span>
              <span class="px-2 py-0.5 rounded text-[10px] font-mono" :class="activeCreatorTab === 'pins' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-800'" x-text="formatNumber(activeCreatorWinningPinsTotal || activeCreatorPins.length || 0)"></span>
            </button>
            <button @click="switchCreatorTab('top_urls')" class="flex items-center space-x-2 px-4 py-2 text-xs font-bold rounded-xl transition cursor-pointer" :class="activeCreatorTab === 'top_urls' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900'">
              <i data-lucide="link" class="w-4 h-4"></i>
              <span>🔗 [Link Explorer]</span>
              <span class="px-2 py-0.5 rounded text-[10px] font-mono" :class="activeCreatorTab === 'top_urls' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-800'" x-text="creatorTopUrlsTotal || 0"></span>
            </button>
            <button @click="switchCreatorTab('related_pins')" class="flex items-center space-x-2 px-4 py-2 text-xs font-bold rounded-xl transition cursor-pointer" :class="activeCreatorTab === 'related_pins' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900'">
              <i data-lucide="network" class="w-4 h-4"></i>
              <span>🕸️ Related Pins Radar</span>
              <span class="px-2 py-0.5 rounded text-[10px] font-mono" :class="activeCreatorTab === 'related_pins' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-800'" x-text="(creatorRelatedStats.total_intersections || 0) + 'i'"></span>
            </button>
            <button @click="switchCreatorTab('topics')" class="flex items-center space-x-2 px-4 py-2 text-xs font-bold rounded-xl transition cursor-pointer" :class="activeCreatorTab === 'topics' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900'">
              <i data-lucide="sparkles" class="w-4 h-4"></i>
              <span>✨ Smart Topic Clusters</span>
              <span class="px-2 py-0.5 rounded text-[10px] font-mono" :class="activeCreatorTab === 'topics' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-800'" x-text="activeCreatorTopics.length"></span>
            </button>
            <button @click="switchCreatorTab('boards')" class="flex items-center space-x-2 px-4 py-2 text-xs font-bold rounded-xl transition cursor-pointer" :class="activeCreatorTab === 'boards' ? 'bg-slate-800 dark:bg-slate-700 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900'">
              <i data-lucide="layout-grid" class="w-4 h-4"></i>
              <span>Pinterest Board Strategy</span>
              <span class="px-2 py-0.5 rounded text-[10px] font-mono" :class="activeCreatorTab === 'boards' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-800'" x-text="activeCreatorBoards.length || activeCreator.total_boards || 0"></span>
            </button>
          </div>

          <!-- ======================================================== -->
          <!-- SUB-VIEW 1: OVERVIEW & PERFORMANCE TRENDS (Images 1 & 2)  -->
          <!-- ======================================================== -->
          <div x-show="activeCreatorTab === 'overview'" class="space-y-6">
            
            <!-- Analytics Engine Time Range Bar (Image 1) -->
            <div class="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#0d1526] p-3.5 sm:px-5 sm:py-3 shadow-xs flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              
              <!-- Quick Time Range Segmented Buttons (Default 7D) -->
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-xs font-bold text-slate-500 dark:text-slate-400 mr-1 flex items-center gap-1">
                  <i data-lucide="clock" class="w-3.5 h-3.5"></i>
                  <span>Time Range:</span>
                </span>
                <div class="flex items-center bg-slate-100 dark:bg-slate-900 p-0.5 rounded-xl border border-slate-200 dark:border-slate-800">
                  <button @click="creatorTimeRange = '7D'" class="rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer" :class="creatorTimeRange === '7D' ? 'bg-white dark:bg-[#0b1120] text-slate-900 dark:text-white shadow-2xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'">7D</button>
                  <button @click="creatorTimeRange = '30D'" class="rounded-lg px-2.5 py-1 text-xs font-semibold transition cursor-pointer" :class="creatorTimeRange === '30D' ? 'bg-white dark:bg-[#0b1120] text-slate-900 dark:text-white shadow-2xs font-bold' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'">30D</button>
                  <button @click="creatorTimeRange = '90D'" class="rounded-lg px-2.5 py-1 text-xs font-semibold transition cursor-pointer" :class="creatorTimeRange === '90D' ? 'bg-white dark:bg-[#0b1120] text-slate-900 dark:text-white shadow-2xs font-bold' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'">90D</button>
                  <button @click="creatorTimeRange = 'YTD'" class="rounded-lg px-2.5 py-1 text-xs font-semibold transition cursor-pointer" :class="creatorTimeRange === 'YTD' ? 'bg-white dark:bg-[#0b1120] text-slate-900 dark:text-white shadow-2xs font-bold' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'">YTD</button>
                  <button @click="creatorTimeRange = 'ALL'" class="rounded-lg px-2.5 py-1 text-xs font-semibold transition cursor-pointer" :class="creatorTimeRange === 'ALL' ? 'bg-white dark:bg-[#0b1120] text-slate-900 dark:text-white shadow-2xs font-bold' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'">ALL</button>
                </div>
              </div>

              <!-- Month Picker & MoM Comparison Toggle -->
              <div class="flex items-center gap-2.5 flex-wrap">
                <div class="flex items-center gap-1.5">
                  <label class="text-xs font-bold text-slate-500 dark:text-slate-400">Month:</label>
                  <select x-model="creatorSelectedMonth" class="h-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-3 text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer">
                    <option value="all">All Months</option>
                    <template x-for="m in availableCreatorMonths" :key="m">
                      <option :value="m" x-text="m"></option>
                    </template>
                  </select>
                </div>

                <button @click="creatorMoMMode = !creatorMoMMode" type="button" class="inline-flex h-8 items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 px-3 text-xs font-semibold text-slate-700 dark:text-slate-300 shadow-2xs transition cursor-pointer">
                  <i data-lucide="bar-chart-2" class="w-3.5 h-3.5 text-rose-500"></i>
                  <span>Compare Months</span>
                </button>
              </div>
            </div>

            <!-- Month-over-Month Comparison Engine Panel -->
            <div x-show="creatorMoMMode" class="rounded-2xl border border-rose-500/30 bg-rose-500/5 dark:bg-rose-500/10 p-5 shadow-xs space-y-4 animate-in fade-in duration-200">
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-rose-500/20 pb-3.5">
                <div class="flex items-center gap-2.5">
                  <div class="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-500/10 text-rose-500 border border-rose-500/20">
                    <i data-lucide="bar-chart-2" class="w-4 h-4"></i>
                  </div>
                  <div>
                    <h3 class="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">Month-over-Month Comparison Engine</h3>
                    <p class="text-[11px] text-slate-500">Select two distinct months to compute exact growth deltas and percentage shifts.</p>
                  </div>
                </div>

                <div class="flex items-center gap-2.5 flex-wrap">
                  <div class="flex items-center gap-1.5">
                    <label class="text-xs font-semibold text-slate-500">Base (A):</label>
                    <select x-model="creatorMoMBaseMonth" class="h-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1526] px-2.5 text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer">
                      <template x-for="m in availableCreatorMonths" :key="'base-' + m">
                        <option :value="m" x-text="m"></option>
                      </template>
                    </select>
                  </div>
                  <span class="text-xs font-bold text-slate-400">vs</span>
                  <div class="flex items-center gap-1.5">
                    <label class="text-xs font-semibold text-slate-500">Target (B):</label>
                    <select x-model="creatorMoMTargetMonth" class="h-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1526] px-2.5 text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer">
                      <template x-for="m in availableCreatorMonths" :key="'target-' + m">
                        <option :value="m" x-text="m"></option>
                      </template>
                    </select>
                  </div>
                </div>
              </div>
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div class="bg-white dark:bg-[#0d1526] p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                  <div class="text-[10px] text-slate-400 font-bold uppercase">Monthly Reach Shift</div>
                  <div class="text-sm font-extrabold mt-1 font-mono tabular-nums" :class="creatorMoMStats.reach.diff >= 0 ? 'text-emerald-500' : 'text-rose-500'" x-text="(creatorMoMStats.reach.diff >= 0 ? '+' : '') + formatNumber(creatorMoMStats.reach.diff) + ' (' + (creatorMoMStats.reach.pct >= 0 ? '+' : '') + creatorMoMStats.reach.pct + '%)'"></div>
                </div>
                <div class="bg-white dark:bg-[#0d1526] p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                  <div class="text-[10px] text-slate-400 font-bold uppercase">Profile Views Shift</div>
                  <div class="text-sm font-extrabold mt-1 font-mono tabular-nums" :class="creatorMoMStats.views.diff >= 0 ? 'text-sky-500' : 'text-rose-500'" x-text="(creatorMoMStats.views.diff >= 0 ? '+' : '') + formatNumber(creatorMoMStats.views.diff) + ' (' + (creatorMoMStats.views.pct >= 0 ? '+' : '') + creatorMoMStats.views.pct + '%)'"></div>
                </div>
                <div class="bg-white dark:bg-[#0d1526] p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                  <div class="text-[10px] text-slate-400 font-bold uppercase">Followers Shift</div>
                  <div class="text-sm font-extrabold mt-1 font-mono tabular-nums" :class="creatorMoMStats.followers.diff >= 0 ? 'text-purple-500' : 'text-rose-500'" x-text="(creatorMoMStats.followers.diff >= 0 ? '+' : '') + formatNumber(creatorMoMStats.followers.diff) + ' (' + (creatorMoMStats.followers.pct >= 0 ? '+' : '') + creatorMoMStats.followers.pct + '%)'"></div>
                </div>
                <div class="bg-white dark:bg-[#0d1526] p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                  <div class="text-[10px] text-slate-400 font-bold uppercase">Total Pins Shift</div>
                  <div class="text-sm font-extrabold mt-1 font-mono tabular-nums" :class="creatorMoMStats.pins.diff >= 0 ? 'text-emerald-500' : 'text-rose-500'" x-text="(creatorMoMStats.pins.diff >= 0 ? '+' : '') + formatNumber(creatorMoMStats.pins.diff) + ' (' + (creatorMoMStats.pins.pct >= 0 ? '+' : '') + creatorMoMStats.pins.pct + '%)'"></div>
                </div>
              </div>
            </div>

            <!-- Performance Trend & Pinning Velocity (2-Col Grid, Image 1) -->
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              <!-- Performance Trend SVG Spline Card (2 Cols) -->
              <div class="lg:col-span-2 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#0d1526] p-5 sm:p-6 shadow-xs flex flex-col justify-between space-y-4">
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div class="flex items-center gap-2">
                    <h3 class="text-xs sm:text-sm font-extrabold tracking-wider uppercase text-slate-900 dark:text-white">PERFORMANCE TREND</h3>
                  </div>

                  <!-- Dynamic Metric Switcher Pills -->
                  <div class="flex items-center gap-1 bg-slate-100 dark:bg-slate-900 p-0.5 rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto self-start sm:self-auto">
                    <button @click="creatorChartMode = 'reach'" class="px-3 py-1 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer" :class="creatorChartMode === 'reach' ? 'bg-rose-500 text-white shadow-2xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'">Monthly Reach</button>
                    <button @click="creatorChartMode = 'views'" class="px-3 py-1 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer" :class="creatorChartMode === 'views' ? 'bg-sky-500 text-white shadow-2xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'">Profile Views</button>
                    <button @click="creatorChartMode = 'followers'" class="px-3 py-1 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer" :class="creatorChartMode === 'followers' ? 'bg-purple-500 text-white shadow-2xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'">Followers</button>
                    <button @click="creatorChartMode = 'pins'" class="px-3 py-1 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer" :class="creatorChartMode === 'pins' ? 'bg-emerald-500 text-white shadow-2xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'">Total Pins</button>
                    <button @click="creatorChartMode = 'dual'" class="px-3 py-1 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer" :class="creatorChartMode === 'dual' ? 'bg-indigo-600 text-white shadow-2xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'">Dual View</button>
                  </div>
                </div>

                <!-- Sub-header Meta Bar: Min/Max & Latest -->
                <div class="flex items-center justify-between text-xs border-b border-slate-200 dark:border-slate-800 pb-2">
                  <div class="flex items-center gap-2 font-mono text-[11px] text-slate-500">
                    <span>Min: <strong class="text-slate-900 dark:text-white font-bold" x-text="formatNumber(creatorChartData.min)"></strong></span>
                    <span>•</span>
                    <span>Max: <strong class="text-slate-900 dark:text-white font-bold" x-text="formatNumber(creatorChartData.max)"></strong></span>
                  </div>
                  <div class="flex items-center gap-1.5">
                    <span class="inline-flex items-center gap-1 rounded-xl bg-slate-100 dark:bg-slate-900 px-2.5 py-1 text-xs font-mono font-bold text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800">
                      <span class="text-slate-400 font-sans text-[11px]">Latest:</span>
                      <span x-text="formatNumber(creatorChartData.latest)"></span>
                    </span>
                  </div>
                </div>

                <!-- Dynamic SVG Spline Chart Canvas -->
                <div class="relative w-full h-56 overflow-hidden">
                  <template x-if="!activeCreatorSnapshots || activeCreatorSnapshots.length === 0">
                    <div class="w-full h-full flex items-center justify-center text-xs text-slate-400 font-sans">
                      No historical snapshot data recorded yet.
                    </div>
                  </template>
                  <template x-if="activeCreatorSnapshots && activeCreatorSnapshots.length > 0">
                    <svg class="w-full h-full" viewBox="0 0 800 220" preserveAspectRatio="none">
                      <defs>
                        <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stop-color="#f43f5e" stop-opacity="0.2"/>
                          <stop offset="100%" stop-color="#f43f5e" stop-opacity="0.0"/>
                        </linearGradient>
                        <linearGradient id="chartGradientSky" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stop-color="#0ea5e9" stop-opacity="0.2"/>
                          <stop offset="100%" stop-color="#0ea5e9" stop-opacity="0.0"/>
                        </linearGradient>
                      </defs>

                      <template x-if="creatorChartData.dual">
                        <g>
                          <!-- Reach (Rose) Area & Stroke -->
                          <path :d="creatorChartData.areaPathA" fill="url(#chartGradient)" />
                          <path :d="creatorChartData.strokePathA" fill="none" stroke="#f43f5e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
                          <!-- Views (Sky) Stroke -->
                          <path :d="creatorChartData.strokePathB" fill="none" stroke="#0ea5e9" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
                          <template x-for="(pt, idx) in creatorChartData.pointsA" :key="'dual-a-' + idx">
                            <circle :cx="pt.x" :cy="pt.y" r="3.5" fill="white" stroke="#f43f5e" stroke-width="2" />
                          </template>
                          <template x-for="(pt, idx) in creatorChartData.pointsB" :key="'dual-b-' + idx">
                            <circle :cx="pt.x" :cy="pt.y" r="3.5" fill="white" stroke="#0ea5e9" stroke-width="2" />
                          </template>
                        </g>
                      </template>

                      <template x-if="!creatorChartData.dual">
                        <g>
                          <!-- Area Fill -->
                          <path :d="creatorChartData.areaPath" :fill="creatorChartMode === 'views' ? 'url(#chartGradientSky)' : 'url(#chartGradient)'" />
                          <!-- Stroke Path -->
                          <path :d="creatorChartData.strokePath" fill="none" :stroke="creatorChartMode === 'views' ? '#0ea5e9' : (creatorChartMode === 'followers' ? '#a855f7' : (creatorChartMode === 'pins' ? '#10b981' : '#f43f5e'))" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
                          <!-- Data Point Dots -->
                          <template x-for="(pt, idx) in creatorChartData.points" :key="idx">
                            <g>
                              <circle :cx="pt.x" :cy="pt.y" r="4" fill="white" :stroke="creatorChartMode === 'views' ? '#0ea5e9' : '#f43f5e'" stroke-width="2" class="cursor-pointer hover:r-6 transition-all" />
                              <text :x="pt.x" y="210" text-anchor="middle" class="text-[10px] fill-slate-400 font-mono" x-text="pt.label"></text>
                            </g>
                          </template>
                        </g>
                      </template>
                    </svg>
                  </template>
                </div>
              </div>

              <!-- Pinning Velocity Metric Card (1 Col) -->
              <div class="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#0d1526] p-5 sm:p-6 shadow-xs flex flex-col justify-between space-y-4">
                <div>
                  <div class="flex items-center justify-between mb-1.5">
                    <span class="text-[10.5px] font-semibold text-slate-500 uppercase tracking-wider">PINNING VELOCITY</span>
                    <span class="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400 border border-amber-500/20">⚡ Output Speed</span>
                  </div>
                  <div class="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight font-mono tabular-nums" x-text="(activeCreatorDetail?.pinning_velocity?.pins_per_day || '0.0') + ' Pins/Day'"></div>
                  <p class="text-xs text-slate-500 mt-1" x-text="'Rolling pacing evaluated over ' + (activeCreatorDetail?.pinning_velocity?.days_span || 1) + ' day(s).'"></p>
                </div>

                <div class="border-t border-slate-200 dark:border-slate-800 pt-4 space-y-2.5 text-xs">
                  <div class="flex items-center justify-between">
                    <span class="text-slate-500">Pins Added (Selected Range):</span>
                    <span class="font-bold text-slate-900 dark:text-white font-mono tabular-nums" x-text="'+' + (activeCreatorDetail?.pinning_velocity?.pins_added || 0)"></span>
                  </div>
                  <div class="flex items-center justify-between">
                    <span class="text-slate-500">Time Horizon Evaluated:</span>
                    <span class="font-bold text-slate-900 dark:text-white font-mono" x-text="(activeCreatorDetail?.pinning_velocity?.days_span || 1) + ' days'"></span>
                  </div>
                  <div class="flex items-center justify-between">
                    <span class="text-slate-500">Pacing Estimate:</span>
                    <span class="font-bold text-rose-500 font-mono tabular-nums" x-text="'~' + (activeCreatorDetail?.pinning_velocity?.pacing_estimate || 0) + ' pins/mo'"></span>
                  </div>
                </div>
              </div>
            </div>

            <!-- 4 Engagement & Virality Metric Stat Cards (Total Saves, Shares, 24h Deltas) -->
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <!-- Card 1: Total Saves -->
              <div class="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#0d1526] p-4 sm:p-5 shadow-xs hover:border-rose-500/30 transition-all flex flex-col justify-between group">
                <div class="flex items-center justify-between">
                  <span class="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">TOTAL SAVES</span>
                  <div class="w-8 h-8 rounded-full bg-rose-50 dark:bg-rose-950/40 text-rose-500 flex items-center justify-center border border-rose-100 dark:border-rose-900/40">
                    <i data-lucide="heart" class="w-4 h-4"></i>
                  </div>
                </div>
                <div>
                  <div class="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white mt-2 font-mono tabular-nums" x-text="formatNumber(activeCreatorDetail?.engagement?.total_saves || 0)"></div>
                  <div class="mt-2 text-[11px] text-slate-500 flex items-center gap-1.5 font-medium">
                    <span class="h-1.5 w-1.5 rounded-full bg-rose-500"></span>
                    <span>Cumulative saves</span>
                  </div>
                </div>
              </div>

              <!-- Card 2: Total Shares -->
              <div class="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#0d1526] p-4 sm:p-5 shadow-xs hover:border-blue-500/30 transition-all flex flex-col justify-between group">
                <div class="flex items-center justify-between">
                  <span class="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">TOTAL SHARES</span>
                  <div class="w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-500 flex items-center justify-center border border-blue-100 dark:border-blue-900/40">
                    <i data-lucide="share-2" class="w-4 h-4"></i>
                  </div>
                </div>
                <div>
                  <div class="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white mt-2 font-mono tabular-nums" x-text="formatNumber(activeCreatorDetail?.engagement?.total_shares || 0)"></div>
                  <div class="mt-2 text-[11px] text-slate-500 flex items-center gap-1.5 font-medium">
                    <span class="h-1.5 w-1.5 rounded-full bg-blue-500"></span>
                    <span>Engagement signals</span>
                  </div>
                </div>
              </div>

              <!-- Card 3: 24H Saves Δ -->
              <div class="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#0d1526] p-4 sm:p-5 shadow-xs hover:border-rose-500/30 transition-all flex flex-col justify-between group">
                <div class="flex items-center justify-between">
                  <span class="text-[10.5px] font-bold text-rose-500 dark:text-rose-400 uppercase tracking-wider">24H SAVES &Delta;</span>
                  <div class="w-8 h-8 rounded-full bg-rose-50 dark:bg-rose-950/40 text-rose-500 flex items-center justify-center border border-rose-100 dark:border-rose-900/40 font-bold text-xs">
                    <span>$</span>
                  </div>
                </div>
                <div>
                  <div class="text-2xl sm:text-3xl font-extrabold tracking-tight text-rose-600 dark:text-rose-400 mt-2 font-mono tabular-nums" x-text="activeCreatorDetail?.engagement?.delta_saves_24h != null ? ((activeCreatorDetail.engagement.delta_saves_24h >= 0 ? '+' : '') + formatNumber(activeCreatorDetail.engagement.delta_saves_24h)) : '—'"></div>
                  <div class="mt-2 text-[11px] text-slate-500 flex items-center gap-1.5 font-medium">
                    <span class="h-1.5 w-1.5 rounded-full" :class="activeCreatorDetail?.engagement?.delta_saves_24h != null ? 'bg-rose-500' : 'bg-slate-400'"></span>
                    <span x-text="activeCreatorDetail?.engagement?.delta_saves_24h != null ? 'Past 24h saves gained' : 'Requires 2+ snapshots (Baseline recorded)'"></span>
                  </div>
                </div>
              </div>

              <!-- Card 4: 24H Repins Δ -->
              <div class="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#0d1526] p-4 sm:p-5 shadow-xs hover:border-emerald-500/30 transition-all flex flex-col justify-between group">
                <div class="flex items-center justify-between">
                  <span class="text-[10.5px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">24H REPINS &Delta;</span>
                  <div class="w-8 h-8 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-500 flex items-center justify-center border border-emerald-100 dark:border-emerald-900/40">
                    <i data-lucide="repeat" class="w-4 h-4"></i>
                  </div>
                </div>
                <div>
                  <div class="text-2xl sm:text-3xl font-extrabold tracking-tight text-emerald-600 dark:text-emerald-400 mt-2 font-mono tabular-nums" x-text="activeCreatorDetail?.engagement?.delta_repins_24h != null ? ((activeCreatorDetail.engagement.delta_repins_24h >= 0 ? '+' : '') + formatNumber(activeCreatorDetail.engagement.delta_repins_24h)) : '—'"></div>
                  <div class="mt-2 text-[11px] text-slate-500 flex items-center gap-1.5 font-medium">
                    <span class="h-1.5 w-1.5 rounded-full" :class="activeCreatorDetail?.engagement?.delta_repins_24h != null ? 'bg-emerald-500' : 'bg-slate-400'"></span>
                    <span x-text="activeCreatorDetail?.engagement?.delta_repins_24h != null ? 'Past 24h viral repins' : 'Requires 2+ snapshots (Baseline recorded)'"></span>
                  </div>
                </div>
              </div>
            </div>

            <!-- 4 Primary Metric Stat Cards (Audience & Reach) -->
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <!-- Card 1: Monthly Reach -->
              <div class="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#0d1526] p-4 sm:p-5 shadow-xs hover:border-emerald-500/30 transition-all flex flex-col justify-between group">
                <div class="flex items-center justify-between">
                  <span class="text-[10.5px] font-semibold text-slate-500 uppercase tracking-wider">MONTHLY REACH</span>
                  <span class="rounded-full px-2 py-0.5 text-[10px] font-bold" :class="(activeCreatorDetail?.deltas?.reach?.change || 0) > 0 ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'" x-text="((activeCreatorDetail?.deltas?.reach?.change || 0) > 0 ? '+' : '') + (activeCreatorDetail?.deltas?.reach?.percent || 0) + '%'"></span>
                </div>
                <div>
                  <div class="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white mt-2 font-mono tabular-nums" x-text="formatNumber(activeCreator.monthly_reach || (activeCreatorSnapshots && activeCreatorSnapshots.length > 0 ? (activeCreatorSnapshots[activeCreatorSnapshots.length - 1].monthly_reach || activeCreatorSnapshots[0].monthly_reach) : 0) || 0)"></div>
                  <div class="mt-2 text-[11px] text-slate-500 flex items-center gap-1.5">
                    <span class="h-1.5 w-1.5 rounded-full" :class="(activeCreatorDetail?.deltas?.reach?.change || 0) > 0 ? 'bg-emerald-500' : 'bg-slate-400'"></span>
                    <span x-text="(activeCreatorDetail?.deltas?.reach?.change || 0) !== 0 ? ((activeCreatorDetail?.deltas?.reach?.change || 0) > 0 ? '+' : '') + formatNumber(activeCreatorDetail?.deltas?.reach?.change) + ' vs previous snapshot' : 'No change vs previous snapshot'"></span>
                  </div>
                </div>
              </div>

              <!-- Card 2: Profile Views -->
              <div class="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#0d1526] p-4 sm:p-5 shadow-xs hover:border-sky-500/30 transition-all flex flex-col justify-between group">
                <div class="flex items-center justify-between">
                  <span class="text-[10.5px] font-semibold text-slate-500 uppercase tracking-wider">PROFILE VIEWS</span>
                  <span class="rounded-full px-2 py-0.5 text-[10px] font-bold" :class="(activeCreatorDetail?.deltas?.views?.change || 0) > 0 ? 'bg-sky-500/10 text-sky-600 border border-sky-500/20' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'" x-text="((activeCreatorDetail?.deltas?.views?.change || 0) > 0 ? '+' : '') + (activeCreatorDetail?.deltas?.views?.percent || 0) + '%'"></span>
                </div>
                <div>
                  <div class="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white mt-2 font-mono tabular-nums" x-text="formatNumber(activeCreator.profile_views || (activeCreatorSnapshots && activeCreatorSnapshots.length > 0 ? (activeCreatorSnapshots[activeCreatorSnapshots.length - 1].profile_views || activeCreatorSnapshots[0].profile_views) : 0) || 0)"></div>
                  <div class="mt-2 text-[11px] text-slate-500 flex items-center gap-1.5">
                    <span class="h-1.5 w-1.5 rounded-full" :class="(activeCreatorDetail?.deltas?.views?.change || 0) > 0 ? 'bg-sky-500' : 'bg-slate-400'"></span>
                    <span x-text="(activeCreatorDetail?.deltas?.views?.change || 0) !== 0 ? ((activeCreatorDetail?.deltas?.views?.change || 0) > 0 ? '+' : '') + formatNumber(activeCreatorDetail?.deltas?.views?.change) + ' vs previous snapshot' : 'No change vs previous snapshot'"></span>
                  </div>
                </div>
              </div>

              <!-- Card 3: Followers -->
              <div class="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#0d1526] p-4 sm:p-5 shadow-xs hover:border-purple-500/30 transition-all flex flex-col justify-between group">
                <div class="flex items-center justify-between">
                  <span class="text-[10.5px] font-semibold text-slate-500 uppercase tracking-wider">FOLLOWERS</span>
                  <span class="rounded-full px-2 py-0.5 text-[10px] font-bold" :class="(activeCreatorDetail?.deltas?.followers?.change || 0) > 0 ? 'bg-purple-500/10 text-purple-600 border border-purple-500/20' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'" x-text="((activeCreatorDetail?.deltas?.followers?.change || 0) > 0 ? '+' : '') + (activeCreatorDetail?.deltas?.followers?.percent || 0) + '%'"></span>
                </div>
                <div>
                  <div class="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white mt-2 font-mono tabular-nums" x-text="formatNumber(activeCreator.follower_count || 0)"></div>
                  <div class="mt-2 text-[11px] text-slate-500 flex items-center gap-1.5">
                    <span class="h-1.5 w-1.5 rounded-full" :class="(activeCreatorDetail?.deltas?.followers?.change || 0) > 0 ? 'bg-purple-500' : 'bg-slate-400'"></span>
                    <span x-text="(activeCreatorDetail?.deltas?.followers?.change || 0) !== 0 ? ((activeCreatorDetail?.deltas?.followers?.change || 0) > 0 ? '+' : '') + formatNumber(activeCreatorDetail?.deltas?.followers?.change) + ' vs previous snapshot' : 'No change vs previous snapshot'"></span>
                  </div>
                </div>
              </div>

              <!-- Card 4: Total Pins -->
              <div class="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#0d1526] p-4 sm:p-5 shadow-xs hover:border-rose-500/30 transition-all flex flex-col justify-between group">
                <div class="flex items-center justify-between">
                  <span class="text-[10.5px] font-semibold text-slate-500 uppercase tracking-wider">TOTAL PINS</span>
                  <span class="rounded-full px-2 py-0.5 text-[10px] font-bold" :class="(activeCreatorDetail?.deltas?.pins?.change || 0) > 0 ? 'bg-rose-500/10 text-rose-600 border border-rose-500/20' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'" x-text="((activeCreatorDetail?.deltas?.pins?.change || 0) > 0 ? '+' : '') + (activeCreatorDetail?.deltas?.pins?.percent || 0) + '%'"></span>
                </div>
                <div>
                  <div class="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white mt-2 font-mono tabular-nums" x-text="formatNumber(activeCreator.total_pins || activeCreatorAllPinsTotal || activeCreatorPins.length || 0)"></div>
                  <div class="mt-2 text-[11px] text-slate-500 flex items-center gap-1.5">
                    <span class="h-1.5 w-1.5 rounded-full" :class="(activeCreatorDetail?.deltas?.pins?.change || 0) > 0 ? 'bg-rose-500' : 'bg-slate-400'"></span>
                    <span x-text="(activeCreatorDetail?.deltas?.pins?.change || 0) !== 0 ? ((activeCreatorDetail?.deltas?.pins?.change || 0) > 0 ? '+' : '') + formatNumber(activeCreatorDetail?.deltas?.pins?.change) + ' vs previous snapshot' : 'No change vs previous snapshot'"></span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Import History & Snapshot Log Table (Image 2) -->
            <div class="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#0d1526] shadow-xs overflow-hidden">
              <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200 dark:border-slate-800 px-5 py-3 bg-slate-50/50 dark:bg-slate-900/40">
                <div>
                  <h2 class="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">Import History &amp; Snapshot Log</h2>
                  <p class="text-[11px] text-slate-500">Historical snapshot log with customizable timeframe, comfortable density, and column toggles.</p>
                </div>

                <div class="flex items-center gap-2.5 flex-wrap self-start sm:self-auto">
                  <div class="flex items-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0b1120] p-0.5 shadow-2xs">
                    <!-- Format Toggle -->
                    <button @click="creatorSnapNumFmt = creatorSnapNumFmt === 'full' ? 'compact' : 'full'" class="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white transition cursor-pointer">
                      <span class="text-[10px] font-mono">#</span>
                      <span x-text="creatorSnapNumFmt === 'full' ? 'Full' : 'Compact'"></span>
                    </button>

                    <div class="h-3.5 w-px bg-slate-200 dark:border-slate-800 my-auto"></div>

                    <!-- Density Toggle -->
                    <button @click="creatorSnapDensity = creatorSnapDensity === 'compact' ? 'comfortable' : 'compact'" class="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white transition cursor-pointer">
                      <i data-lucide="menu" class="w-3.5 h-3.5"></i>
                      <span x-text="creatorSnapDensity === 'compact' ? 'Compact' : 'Full'"></span>
                    </button>

                    <div class="h-3.5 w-px bg-slate-200 dark:border-slate-800 my-auto"></div>

                    <!-- Page Size Dropdown -->
                    <div class="flex items-center px-1.5">
                      <select x-model="creatorSnapTimeframe" class="bg-transparent text-xs font-semibold text-slate-600 dark:text-slate-300 focus:outline-none cursor-pointer">
                        <option value="7">7 Snapshots (7 Days)</option>
                        <option value="14">14 Snapshots (14 Days)</option>
                        <option value="30">30 Snapshots (30 Days)</option>
                        <option value="all">All Snapshots</option>
                      </select>
                    </div>

                    <div class="h-3.5 w-px bg-slate-200 dark:border-slate-800 my-auto"></div>

                    <!-- Columns Dropdown -->
                    <div class="relative">
                      <button @click="isSnapColsOpen = !isSnapColsOpen" type="button" class="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white transition cursor-pointer">
                        <i data-lucide="eye" class="w-3.5 h-3.5 text-rose-500"></i>
                        <span>Columns</span>
                        <i data-lucide="chevron-down" class="w-3 h-3 text-slate-400"></i>
                      </button>
                      <div x-show="isSnapColsOpen" @click.outside="isSnapColsOpen = false" class="absolute right-0 top-full mt-1.5 z-30 w-48 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1526] shadow-xl p-2 space-y-1">
                        <label class="flex items-center gap-2 px-2 py-1 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                          <input type="checkbox" x-model="creatorSnapColVisible.reach" class="rounded border-slate-300 text-rose-500" />
                          <span>Monthly Reach</span>
                        </label>
                        <label class="flex items-center gap-2 px-2 py-1 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                          <input type="checkbox" x-model="creatorSnapColVisible.views" class="rounded border-slate-300 text-rose-500" />
                          <span>Profile Views</span>
                        </label>
                        <label class="flex items-center gap-2 px-2 py-1 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                          <input type="checkbox" x-model="creatorSnapColVisible.pins" class="rounded border-slate-300 text-rose-500" />
                          <span>Total Pins</span>
                        </label>
                      </div>
                    </div>
                  </div>

                  <span class="inline-flex items-center rounded-xl bg-rose-500/10 px-3 py-1 text-xs font-bold text-rose-600 dark:text-rose-400 border border-rose-500/20" x-text="activeCreatorSnapshots.length + ' Snapshots'"></span>
                </div>
              </div>

              <!-- Snapshots Table -->
              <div class="overflow-x-auto min-w-full">
                <table class="w-full text-left text-xs border-collapse">
                  <thead class="sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 font-semibold">
                    <tr>
                      <th class="py-3 px-5">Recorded Date &amp; Time</th>
                      <th x-show="creatorSnapColVisible.reach" class="py-3 px-4 text-right">Monthly Reach</th>
                      <th x-show="creatorSnapColVisible.views" class="py-3 px-4 text-right">Profile Views</th>
                      <th x-show="creatorSnapColVisible.pins" class="py-3 px-4 text-right">Total Pins</th>
                      <th class="py-3 px-5 text-right">Actions</th>
                    </tr>
                    <!-- Summary Row (Σ Net Change) -->
                    <tr class="bg-slate-100/60 dark:bg-slate-800/40 font-bold border-b border-slate-200 dark:border-slate-800">
                      <td class="py-2.5 px-5 text-slate-900 dark:text-white font-mono">Σ Net Change</td>
                      <td x-show="creatorSnapColVisible.reach" class="py-2.5 px-4 text-right text-slate-700 dark:text-slate-300 font-mono" x-text="creatorSnapshotsNetChange.reach"></td>
                      <td x-show="creatorSnapColVisible.views" class="py-2.5 px-4 text-right text-slate-700 dark:text-slate-300 font-mono" x-text="creatorSnapshotsNetChange.views"></td>
                      <td x-show="creatorSnapColVisible.pins" class="py-2.5 px-4 text-right font-mono tabular-nums" :class="creatorSnapshotsNetChange.pins.startsWith('(-') ? 'text-rose-500' : 'text-emerald-500'" x-text="creatorSnapshotsNetChange.pins"></td>
                      <td class="py-2.5 px-5 text-right text-slate-400 font-mono"></td>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                    <template x-for="(s, idx) in paginatedCreatorSnapshots" :key="s.id || idx">
                      <tr class="hover:bg-slate-50/80 dark:hover:bg-slate-900/40 transition" :class="creatorSnapDensity === 'comfortable' ? 'py-4' : 'py-2.5'">
                        <td class="px-5 font-sans text-slate-700 dark:text-slate-300 font-medium" :class="creatorSnapDensity === 'comfortable' ? 'py-4' : 'py-2.5'" x-text="formatSnapshotDate(s.recorded_date || s.created_at)"></td>
                        <td x-show="creatorSnapColVisible.reach" class="px-4 text-right font-extrabold text-slate-900 dark:text-white" :class="creatorSnapDensity === 'comfortable' ? 'py-4' : 'py-2.5'" x-text="formatNumber(s.monthly_reach)"></td>
                        <td x-show="creatorSnapColVisible.views" class="px-4 text-right font-extrabold text-slate-900 dark:text-white" :class="creatorSnapDensity === 'comfortable' ? 'py-4' : 'py-2.5'" x-text="formatNumber(s.profile_views)"></td>
                        <td x-show="creatorSnapColVisible.pins" class="px-4 text-right" :class="creatorSnapDensity === 'comfortable' ? 'py-4' : 'py-2.5'">
                          <div class="inline-flex items-center justify-end gap-1.5">
                            <span class="font-extrabold text-slate-900 dark:text-white" x-text="formatNumber(s.total_pins)"></span>
                            <span class="font-bold text-[10.5px]" :class="(s.delta_pins || 0) > 0 ? 'text-emerald-500' : 'text-slate-400'" x-text="(s.delta_pins || 0) > 0 ? '(+' + s.delta_pins + ')' : ((s.delta_pins || 0) < 0 ? '(' + s.delta_pins + ')' : '')"></span>
                          </div>
                        </td>
                        <td class="px-5 text-right" :class="creatorSnapDensity === 'comfortable' ? 'py-4' : 'py-2.5'">
                          <button @click="deleteSnapshotAction(s.id)" class="p-1 rounded text-slate-400 hover:text-rose-500 transition cursor-pointer" title="Delete snapshot">
                            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                          </button>
                        </td>
                      </tr>
                    </template>
                  </tbody>
                </table>
              </div>

              <!-- Snapshots Pagination Footer Bar -->
              <div class="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 px-5 py-3 bg-slate-50/50 dark:bg-slate-900/30 text-xs text-slate-500">
                <span x-text="'Showing 1-' + paginatedCreatorSnapshots.length + ' of ' + activeCreatorSnapshots.length + ' snapshots'"></span>
                <div class="flex items-center gap-2">
                  <button @click="creatorSnapPage = Math.max(1, creatorSnapPage - 1)" :disabled="creatorSnapPage <= 1" class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0b1120] px-3 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 disabled:opacity-40 transition shadow-2xs cursor-pointer">Previous</button>
                  <span class="font-bold text-slate-900 dark:text-white" x-text="'Page ' + creatorSnapPage + ' of ' + Math.max(1, Math.ceil(activeCreatorSnapshots.length / (creatorSnapTimeframe === 'all' ? 100 : Number(creatorSnapTimeframe))))"></span>
                  <button @click="creatorSnapPage = creatorSnapPage + 1" :disabled="creatorSnapPage >= Math.ceil(activeCreatorSnapshots.length / (creatorSnapTimeframe === 'all' ? 100 : Number(creatorSnapTimeframe)))" class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0b1120] px-3 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 disabled:opacity-40 transition shadow-2xs cursor-pointer">Next</button>
                </div>
              </div>
            </div>

            <!-- Pinterest Board Strategy & Timeline Table (Image 2) -->
            <div class="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#0d1526] shadow-xs overflow-hidden">
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 px-5 py-3.5 bg-slate-50/50 dark:bg-slate-900/40">
                <div>
                  <h2 class="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">Pinterest Board Strategy &amp; Timeline</h2>
                  <p class="text-[11px] text-slate-500">Search, filter, and sort competitor boards with pagination.</p>
                </div>

                <div class="flex items-center gap-2.5 flex-wrap self-start sm:self-auto">
                  <div class="relative">
                    <input
                      type="text"
                      x-model="creatorBoardSearch"
                      placeholder="Search boards..."
                      class="h-8.5 w-48 sm:w-56 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 pl-8 pr-3 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none shadow-2xs"
                    />
                    <i data-lucide="search" class="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5"></i>
                  </div>

                  <select x-model="creatorBoardSort" class="h-8.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-3 text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none shadow-2xs cursor-pointer">
                    <option value="most_pins">Sort by: Most Pins</option>
                    <option value="most_followers">Sort by: Most Followers</option>
                    <option value="recent_activity">Sort by: Recent Activity</option>
                    <option value="creation_date">Sort by: Creation Date</option>
                  </select>

                  <span class="inline-flex items-center rounded-xl bg-rose-500/10 px-3 py-1 text-xs font-bold text-rose-600 dark:text-rose-400 border border-rose-500/20" x-text="activeCreatorBoards.length + ' Boards'"></span>
                </div>
              </div>

              <!-- Boards Table Container -->
              <div class="overflow-x-auto min-w-full">
                <table class="w-full text-left text-xs border-collapse">
                  <thead class="sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 font-semibold">
                    <tr>
                      <th class="py-3 px-5">Board Name &amp; Description</th>
                      <th class="py-3 px-4">Created Date</th>
                      <th class="py-3 px-4">Last Activity</th>
                      <th class="py-3 px-4 text-right">Pin Count</th>
                      <th class="py-3 px-4 text-right">Followers</th>
                      <th class="py-3 px-5 text-right">Link</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                    <template x-for="b in paginatedCreatorBoards" :key="b.id || b.board_id">
                      <tr class="hover:bg-slate-50/80 dark:hover:bg-slate-900/40 transition">
                        <td class="py-3 px-5 font-sans font-bold text-slate-900 dark:text-white">
                          <button type="button" @click="openBoardPage(b, activeCreator)" class="text-left font-bold text-slate-900 dark:text-white hover:text-rose-500 dark:hover:text-rose-400 transition cursor-pointer flex items-center gap-1.5 group">
                            <span class="line-clamp-1" x-text="b.name"></span>
                            <i data-lucide="arrow-right" class="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-rose-500"></i>
                          </button>
                          <div class="text-[10px] text-slate-400 font-normal mt-0.5" x-text="b.description || 'Public Pinterest Board'"></div>
                        </td>
                        <td class="py-3 px-4 font-sans text-slate-500" x-text="b.created_at ? new Date(b.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'"></td>
                        <td class="py-3 px-4 font-sans text-slate-500" x-text="b.last_pinned_at ? new Date(b.last_pinned_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'"></td>
                        <td class="py-3 px-4 text-right font-bold text-slate-900 dark:text-white" x-text="formatNumber(b.pin_count)"></td>
                        <td class="py-3 px-4 text-right font-bold text-slate-700 dark:text-slate-300" x-text="formatNumber(b.follower_count || 0)"></td>
                        <td class="py-3 px-5 text-right font-sans">
                          <div class="inline-flex items-center gap-2 justify-end">
                            <button type="button" @click="openBoardPage(b, activeCreator)" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-purple-500/30 bg-purple-500/10 text-purple-600 dark:text-purple-400 text-[11px] font-bold hover:bg-purple-500/20 transition cursor-pointer" title="Open Dedicated Board Page">
                              <i data-lucide="layout-grid" class="w-3 h-3"></i>
                              <span>Inspect</span>
                            </button>
                            <button type="button" @click="crawlSingleBoardGha(b.name)" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400 text-[11px] font-bold hover:bg-sky-500/20 transition cursor-pointer" title="Crawl this board on GitHub Actions">
                              <i data-lucide="zap" class="w-3 h-3"></i>
                              <span>Crawl</span>
                            </button>
                            <a :href="b.url || ('https://www.pinterest.com/' + (activeCreator.username || '').replace(/^@+/, '') + '/' + encodeURIComponent(b.name.toLowerCase().replace(/\s+/g, '-')))" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 font-semibold text-rose-500 hover:underline">
                              <span>Board</span>
                              <i data-lucide="external-link" class="w-3 h-3"></i>
                            </a>
                          </div>
                        </td>
                      </tr>
                    </template>
                  </tbody>
                </table>
              </div>

              <!-- Boards Pagination Footer Bar -->
              <div class="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 px-5 py-3 bg-slate-50/50 dark:bg-slate-900/30 text-xs text-slate-500">
                <span x-text="'Showing 1-' + paginatedCreatorBoards.length + ' of ' + activeCreatorBoards.length + ' boards'"></span>
                <div class="flex items-center gap-2">
                  <button @click="creatorBoardPage = Math.max(1, creatorBoardPage - 1)" :disabled="creatorBoardPage <= 1" class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0b1120] px-3 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 disabled:opacity-40 transition shadow-2xs cursor-pointer">Previous</button>
                  <span class="font-bold text-slate-900 dark:text-white" x-text="'Page ' + creatorBoardPage + ' of ' + Math.max(1, Math.ceil(activeCreatorBoards.length / 10))"></span>
                  <button @click="creatorBoardPage = creatorBoardPage + 1" :disabled="creatorBoardPage >= Math.ceil(activeCreatorBoards.length / 10)" class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0b1120] px-3 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 disabled:opacity-40 transition shadow-2xs cursor-pointer">Next</button>
                </div>
              </div>
            </div>

          </div>

          <!-- ======================================================== -->
          <!-- SUB-VIEW: ALL ACCOUNT PINS (FULL DISCOVERED INVENTORY)    -->
          <!-- ======================================================== -->
          <div x-show="activeCreatorTab === 'all_pins'" class="space-y-5">
            <!-- Header Card -->
            <div class="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#0d1526] p-5 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <div class="flex items-center gap-2">
                  <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-500 font-bold text-sm">📋</span>
                  <h3 class="text-base font-bold text-slate-900 dark:text-white">All Account Pins (Raw Catalog)</h3>
                  <span class="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20" x-text="(activeCreatorAllPinsTotal || 0) + ' total pins'"></span>
                </div>
                <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">Complete discovered pin inventory for this account. Qualified winning pins meeting 3-tier rules are automatically isolated in the <button type="button" @click="activeCreatorTab = 'pins'" class="text-rose-500 font-bold hover:underline cursor-pointer inline-flex items-center gap-0.5">📌 All Pins Archive</button> tab.</p>
              </div>

              <!-- Action buttons -->
              <div class="flex items-center gap-2">
                <button type="button" @click="fetchCreatorAllPins()" class="px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1526] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition flex items-center gap-1.5 cursor-pointer shadow-2xs">
                  <i data-lucide="refresh-cw" class="w-3.5 h-3.5" :class="isLoadingAllPins ? 'animate-spin text-indigo-500' : ''"></i>
                  <span>Refresh</span>
                </button>
                <button type="button" @click="openGhaCrawlerModal(activeCreator)" :disabled="isDispatchingGitHubCrawl" class="px-4 py-2 text-xs font-bold rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white transition flex items-center gap-2 cursor-pointer shadow-sm active:scale-95 disabled:opacity-50" title="Harvest creator pins using 20 parallel GitHub Actions runner shards">
                  <i data-lucide="zap" class="w-4 h-4" :class="isDispatchingGitHubCrawl ? 'animate-spin' : ''"></i>
                  <span x-text="isDispatchingGitHubCrawl ? 'Dispatching...' : '⚡ Harvest via GitHub Actions (20 Shards)'"></span>
                </button>
              </div>
            </div>

            <!-- 4 Summary Stat Mini-Cards -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
              <div class="bg-white dark:bg-[#0d1526] rounded-2xl border border-slate-200/90 dark:border-slate-800 p-4 shadow-2xs">
                <span class="text-[10.5px] font-bold text-slate-400 uppercase tracking-wider block">Discovered Pins</span>
                <span class="text-xl font-black text-slate-900 dark:text-white mt-1 block font-mono" x-text="formatNumber(activeCreatorAllPinsTotal || 0)"></span>
              </div>
              <div class="bg-white dark:bg-[#0d1526] rounded-2xl border border-emerald-500/20 dark:border-emerald-500/30 p-4 shadow-2xs bg-emerald-50/20 dark:bg-emerald-950/10">
                <span class="text-[10.5px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">🏆 Qualified (In Archive)</span>
                <span class="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1 block font-mono" x-text="formatNumber(activeCreatorWinningPinsTotal || activeCreatorPins.length || 0)"></span>
              </div>
              <div class="bg-white dark:bg-[#0d1526] rounded-2xl border border-slate-200/90 dark:border-slate-800 p-4 shadow-2xs">
                <span class="text-[10.5px] font-bold text-slate-400 uppercase tracking-wider block">Discovered Boards</span>
                <span class="text-xl font-black text-slate-900 dark:text-white mt-1 block font-mono" x-text="activeCreatorAllPinsBoards.length"></span>
              </div>
              <div class="bg-white dark:bg-[#0d1526] rounded-2xl border border-slate-200/90 dark:border-slate-800 p-4 shadow-2xs">
                <span class="text-[10.5px] font-bold text-slate-400 uppercase tracking-wider block">Active Page</span>
                <span class="text-xl font-black text-indigo-600 dark:text-indigo-400 mt-1 block font-mono" x-text="(activeCreatorAllPinsPage || 1) + ' / ' + (activeCreatorAllPinsTotalPages || 1)"></span>
              </div>
            </div>

            <!-- Filters & Search Toolbar -->
            <div class="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#0d1526] p-4 shadow-xs flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              <!-- Search bar -->
              <div class="relative flex-1 max-w-sm">
                <input
                  type="text"
                  x-model="creatorAllPinSearch"
                  @input.debounce.400ms="activeCreatorAllPinsPage = 1; fetchCreatorAllPins()"
                  placeholder="Search pins by title or link..."
                  class="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none pl-9 focus:ring-1 focus:ring-indigo-500"
                />
                <i data-lucide="search" class="w-4 h-4 text-slate-400 absolute left-3 top-2.5"></i>
              </div>

              <!-- Filter Dropdowns -->
              <div class="flex flex-wrap items-center gap-2">
                <!-- Board Select -->
                <div class="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-2.5 py-1.5">
                  <label class="text-xs font-semibold text-slate-500 whitespace-nowrap">Board:</label>
                  <select x-model="creatorAllPinBoard" @change="activeCreatorAllPinsPage = 1; fetchCreatorAllPins()" class="bg-transparent text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer max-w-[140px] truncate">
                    <option value="">All Boards</option>
                    <template x-for="b in activeCreatorAllPinsBoards" :key="b">
                      <option :value="b" x-text="b"></option>
                    </template>
                  </select>
                </div>

                <!-- Min Saves Filter -->
                <div class="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-2.5 py-1.5">
                  <label class="text-xs font-semibold text-slate-500 whitespace-nowrap">Saves:</label>
                  <select x-model.number="creatorAllPinMinSaves" @change="activeCreatorAllPinsPage = 1; fetchCreatorAllPins()" class="bg-transparent text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer">
                    <option value="0">All Saves</option>
                    <option value="10">10+ saves</option>
                    <option value="50">50+ saves</option>
                    <option value="100">100+ (Tier 1)</option>
                    <option value="500">500+ saves</option>
                  </select>
                </div>

                <!-- Sort Order -->
                <div class="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-2.5 py-1.5">
                  <label class="text-xs font-semibold text-slate-500 whitespace-nowrap">Sort:</label>
                  <select x-model="creatorAllPinSort" @change="activeCreatorAllPinsPage = 1; fetchCreatorAllPins()" class="bg-transparent text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer">
                    <option value="saves_desc">Highest Saves</option>
                    <option value="repins_desc">Highest Repins</option>
                    <option value="created_desc">Newest Pin</option>
                    <option value="created_asc">Oldest Pin</option>
                  </select>
                </div>

                <!-- Qualified Only Toggle -->
                <label class="inline-flex items-center gap-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-2.5 py-1.5 cursor-pointer text-xs font-medium text-slate-800 dark:text-slate-200 select-none">
                  <input type="checkbox" x-model="creatorAllPinQualifiedOnly" @change="activeCreatorAllPinsPage = 1; fetchCreatorAllPins()" class="rounded border-slate-300 text-indigo-600 h-4 w-4" />
                  <span>🏆 Qualified Only</span>
                </label>

                <!-- Articles Only Toggle (!is_product) -->
                <label class="inline-flex items-center gap-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-2.5 py-1.5 cursor-pointer text-xs font-medium text-slate-800 dark:text-slate-200 select-none" title="Filter strictly for content/editorial articles and exclude shopping product pins">
                  <input type="checkbox" x-model="creatorAllPinArticlesOnly" @change="activeCreatorAllPinsPage = 1; fetchCreatorAllPins()" class="rounded border-slate-300 text-emerald-600 h-4 w-4" />
                  <span>📰 Articles Only</span>
                </label>

                <!-- Clear filters button -->
                <button
                  x-show="creatorAllPinSearch || creatorAllPinBoard || creatorAllPinMinSaves > 0 || creatorAllPinQualifiedOnly || creatorAllPinArticlesOnly"
                  @click="creatorAllPinSearch = ''; creatorAllPinBoard = ''; creatorAllPinMinSaves = 0; creatorAllPinQualifiedOnly = false; creatorAllPinArticlesOnly = false; activeCreatorAllPinsPage = 1; fetchCreatorAllPins()"
                  class="px-2.5 py-1.5 rounded-xl text-xs font-semibold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition cursor-pointer"
                >
                  Clear Filters
                </button>
              </div>
            </div>

            <!-- Loading Spinner -->
            <div x-show="isLoadingAllPins" class="py-12 flex flex-col items-center justify-center space-y-3">
              <i data-lucide="loader" class="w-8 h-8 text-indigo-500 animate-spin"></i>
              <span class="text-xs font-semibold text-slate-400">Loading pins inventory...</span>
            </div>

            <!-- Empty State -->
            <div x-show="!isLoadingAllPins && activeCreatorAllPins.length === 0" class="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#0d1526] p-12 text-center shadow-xs">
              <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-500 mx-auto mb-3">
                <i data-lucide="inbox" class="w-6 h-6"></i>
              </div>
              <h4 class="text-sm font-bold text-slate-900 dark:text-white">No pins found in inventory</h4>
              <p class="text-xs text-slate-500 max-w-sm mx-auto mt-1">No pins match the current filter or this account has not been harvested yet. Click "Harvest All Pins" to pull the full catalog from Pinterest.</p>
              <button type="button" @click="openGhaCrawlerModal(activeCreator)" class="mt-4 px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white shadow-sm inline-flex items-center gap-1.5 transition cursor-pointer">
                <i data-lucide="zap" class="w-4 h-4"></i>
                <span>⚡ Launch 20-Shard GitHub Actions Harvest</span>
              </button>
            </div>

            <!-- Table of All Account Pins -->
            <div x-show="!isLoadingAllPins && activeCreatorAllPins.length > 0" class="overflow-x-auto rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#0d1526] shadow-xs">
              <table class="w-full text-left text-xs">
                <thead class="bg-slate-50 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 text-[11px] uppercase border-b border-slate-200 dark:border-slate-800 font-semibold select-none">
                  <tr>
                    <th class="py-3 px-3 w-10 text-center">
                      <input type="checkbox" :checked="activeCreatorAllPins.length > 0 && activeCreatorAllPins.every(p => isPinSelected(p.pin_id))" @change="$event.target.checked ? selectAllCurrentPins(activeCreatorAllPins) : clearSelectedCreatorPins()" class="rounded border-slate-300 text-amber-500 cursor-pointer" />
                    </th>
                    <th class="py-3 px-3 w-14">Media</th>
                    <th class="py-3 px-4 font-semibold text-slate-900 dark:text-white">Pin Title &amp; Destination</th>
                    <th class="py-3 px-3 font-semibold">Board</th>
                    <th class="py-3 px-3 font-semibold text-right">Saves</th>
                    <th class="py-3 px-3 font-semibold text-right">Repins</th>
                    <th class="py-3 px-3 text-center font-semibold">Qualification</th>
                    <th class="py-3 px-3 font-semibold">Created / Discovered</th>
                    <th class="py-3 px-3 text-center font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                  <template x-for="p in activeCreatorAllPins" :key="p.pin_id">
                    <tr class="hover:bg-slate-50/80 dark:hover:bg-slate-900/40 transition" :class="isPinSelected(p.pin_id) ? 'bg-amber-500/5 dark:bg-amber-500/10' : ''">
                      <!-- Selection Checkbox -->
                      <td class="py-2.5 px-3 text-center">
                        <input type="checkbox" :checked="isPinSelected(p.pin_id)" @change="togglePinSelection(p.pin_id)" class="rounded border-slate-300 text-amber-500 cursor-pointer" />
                      </td>
                      <!-- Thumbnail with hover preview -->
                      <td class="py-2.5 px-3 w-14">
                        <div class="relative group cursor-pointer" @click="openPinDossier(p)">
                          <img :src="p.image_url" loading="lazy" class="w-11 h-14 rounded-lg object-cover border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 hover:opacity-80 transition" />
                          <div class="hidden group-hover:block absolute left-14 top-0 z-40 w-44 rounded-xl overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-700 pointer-events-none bg-white dark:bg-slate-900">
                            <img :src="p.image_url" class="w-full h-auto object-cover" />
                          </div>
                        </div>
                      </td>

                      <!-- Title & Destination -->
                      <td class="py-2.5 px-4 font-sans font-bold text-slate-900 dark:text-white max-w-md">
                        <div class="line-clamp-2 cursor-pointer hover:text-rose-500 transition" :title="p.title" x-text="p.title || 'Untitled Pin'" @click="openPinDossier(p)"></div>
                        <div class="flex items-center gap-2 mt-1 font-mono text-[10.5px] font-normal">
                          <span class="text-slate-400" x-text="'ID: ' + p.pin_id"></span>
                          <template x-if="p.destination_url">
                            <a :href="p.destination_url" target="_blank" class="text-sky-500 hover:underline flex items-center gap-1 truncate max-w-[200px]" :title="p.destination_url">
                              <i data-lucide="link" class="w-3 h-3 shrink-0"></i>
                              <span x-text="p.link_domain || 'Destination'"></span>
                            </a>
                          </template>
                        </div>
                      </td>

                      <!-- Board Name -->
                      <td class="py-2.5 px-3 font-sans text-slate-600 dark:text-slate-300 truncate max-w-[130px]">
                        <button type="button" @click="openBoardPage(p.board_name, activeCreator)" class="inline-block px-2 py-0.5 rounded-lg text-[10.5px] font-semibold bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 hover:bg-purple-100 dark:hover:bg-purple-950/40 hover:text-purple-600 dark:hover:text-purple-400 border border-slate-200 dark:border-slate-700/60 transition cursor-pointer" x-text="p.board_name || 'General'"></button>
                      </td>

                      <!-- Saves -->
                      <td class="py-2.5 px-3 text-right">
                        <span class="font-extrabold" :class="Number(p.save_count || 0) >= 100 ? 'text-rose-600 dark:text-rose-400 font-black' : 'text-slate-700 dark:text-slate-300'" x-text="formatNumber(p.save_count || 0)"></span>
                      </td>

                      <!-- Repins -->
                      <td class="py-2.5 px-3 text-right">
                        <span class="font-bold text-slate-700 dark:text-slate-300" x-text="formatNumber(p.repin_count || 0)"></span>
                      </td>

                      <!-- Status Badge -->
                      <td class="py-2.5 px-3 text-center">
                        <div class="flex items-center justify-center gap-1 flex-wrap">
                          <template x-if="p.is_product">
                            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 shadow-2xs" title="Identified Commercial / Affiliate Product">
                              <i data-lucide="shopping-bag" class="w-2.5 h-2.5"></i>
                              <span>Product</span>
                            </span>
                          </template>
                          <template x-if="p.is_qualified">
                            <button @click="activeCreatorTab = 'pins'" class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 cursor-pointer hover:bg-amber-500/25 transition" title="Click to view in Winning Archive">
                              <span>🏆 Qualified</span>
                              <i data-lucide="arrow-right" class="w-2.5 h-2.5"></i>
                            </button>
                          </template>
                          <template x-if="!p.is_qualified && !p.is_product">
                            <span class="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700">
                              Standard
                            </span>
                          </template>
                        </div>
                      </td>

                      <!-- Created / Discovered -->
                      <td class="py-2.5 px-3 font-sans text-slate-500 text-[11px]">
                        <span x-text="p.created_at_pinterest ? new Date(p.created_at_pinterest).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : (p.first_seen_at ? new Date(p.first_seen_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—')"></span>
                      </td>

                      <!-- Actions -->
                      <td class="py-2.5 px-3 text-center">
                        <div class="flex items-center justify-center gap-1">
                          <a :href="'https://www.pinterest.com/pin/' + p.pin_id + '/'" target="_blank" class="inline-flex items-center justify-center h-7 w-7 rounded-lg text-slate-500 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition" title="Open on Pinterest">
                            <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                          </a>
                          <button @click="stagePinAction(p.pin_id)" class="inline-flex items-center justify-center h-7 w-7 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer" title="Stage Pin for Repurpose">
                            <i data-lucide="play-circle" class="w-4 h-4"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  </template>
                </tbody>
              </table>

              <!-- Pagination Footer Bar -->
              <div class="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 px-5 py-3 bg-slate-50/50 dark:bg-slate-900/30 text-xs text-slate-500">
                <span x-text="'Showing ' + (((activeCreatorAllPinsPage - 1) * 25) + 1) + '-' + Math.min(activeCreatorAllPinsPage * 25, activeCreatorAllPinsTotal) + ' of ' + activeCreatorAllPinsTotal + ' pins'"></span>
                <div class="flex items-center gap-2">
                  <button @click="activeCreatorAllPinsPage = Math.max(1, activeCreatorAllPinsPage - 1); fetchCreatorAllPins()" :disabled="activeCreatorAllPinsPage <= 1" class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0b1120] px-3 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 disabled:opacity-40 transition shadow-2xs cursor-pointer">Previous</button>
                  <span class="font-bold text-slate-900 dark:text-white" x-text="'Page ' + activeCreatorAllPinsPage + ' of ' + Math.max(1, activeCreatorAllPinsTotalPages)"></span>
                  <button @click="activeCreatorAllPinsPage = activeCreatorAllPinsPage + 1; fetchCreatorAllPins()" :disabled="activeCreatorAllPinsPage >= activeCreatorAllPinsTotalPages" class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0b1120] px-3 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 disabled:opacity-40 transition shadow-2xs cursor-pointer">Next</button>
                </div>
              </div>
            </div>
          </div>

          <!-- ======================================================== -->
          <!-- SUB-VIEW 2: ALL PINS ARCHIVE & DELTAS (Image 3)           -->
          <!-- ======================================================== -->
          <div x-show="activeCreatorTab === 'pins'" class="space-y-5">
            
            <!-- Account Summary Card (Image 3) -->
            <div class="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#0d1526] p-6 shadow-sm space-y-6">
              <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
                <div class="flex items-center gap-3">
                  <span class="h-3 w-3 rounded-full bg-emerald-500 shrink-0"></span>
                  <div class="flex items-center gap-2">
                    <h2 class="text-xl font-bold text-slate-900 dark:text-white" x-text="'@' + (activeCreator.username || '').replace(/^@+/, '')"></h2>
                    <span class="text-xs font-semibold uppercase px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">ACTIVE</span>
                  </div>
                </div>

                <div class="flex items-center gap-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl px-3.5 py-2 border border-slate-200 dark:border-slate-800">
                  <span class="text-xs font-semibold text-slate-700 dark:text-slate-300">Accept GAS Data:</span>
                  <label class="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" x-model="isGasDataEnabled" class="sr-only peer" />
                    <div class="w-8 h-4.5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-emerald-500"></div>
                  </label>
                  <span class="text-xs font-bold" :class="isGasDataEnabled ? 'text-emerald-500' : 'text-rose-500'" x-text="isGasDataEnabled ? 'Enabled' : 'Disabled'"></span>
                </div>
              </div>

              <!-- 4 Summary Boxes -->
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div class="bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 p-3.5">
                  <span class="text-[11px] font-medium text-slate-400 uppercase block">Followers</span>
                  <span class="text-lg font-bold text-slate-900 dark:text-white mt-1 block font-mono" x-text="formatNumber(activeCreator.follower_count || 0)"></span>
                </div>
                <div class="bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 p-3.5">
                  <span class="text-[11px] font-medium text-slate-400 uppercase block">Pins Total</span>
                  <span class="text-lg font-bold text-slate-900 dark:text-white mt-1 block font-mono" x-text="formatNumber(activeCreator.total_pins || activeCreatorAllPinsTotal || activeCreatorWinningPinsTotal || 0)"></span>
                </div>
                <div class="bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 p-3.5">
                  <span class="text-[11px] font-medium text-slate-400 uppercase block">Last Run</span>
                  <span class="text-xs font-bold text-slate-900 dark:text-white mt-1.5 block" x-text="activeCreator.last_synced_at ? new Date(activeCreator.last_synced_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Never'"></span>
                </div>
                <div class="bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 p-3.5">
                  <span class="text-[11px] font-medium text-slate-400 uppercase block">Next Run</span>
                  <span class="text-xs font-bold text-slate-900 dark:text-white mt-1.5 block" x-text="activeCreator.next_run_at ? new Date(activeCreator.next_run_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Pending'"></span>
                </div>
              </div>
            </div>

            <!-- All Pins Header & View Toggle (Image 3) -->
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 class="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span>📌 All Pins</span>
                  <span class="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-500" x-text="formatNumber(activeCreatorWinningPinsTotal || activeCreatorPins.length || 0)"></span>
                </h3>
                <p class="text-xs text-slate-500 mt-0.5">All archived creator pins with snapshots, velocity, and metric growth deltas.</p>
              </div>

              <!-- View Switch Toggle (Cards | Table) -->
              <div class="flex items-center gap-1.5 self-start sm:self-auto bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-1 shadow-2xs">
                <button type="button" @click="creatorPinViewMode = 'cards'" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer" :class="creatorPinViewMode === 'cards' ? 'bg-rose-500 text-white shadow-2xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'">
                  <i data-lucide="layout-grid" class="w-3.5 h-3.5"></i>
                  <span>Cards</span>
                </button>
                <button type="button" @click="creatorPinViewMode = 'table'" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer" :class="creatorPinViewMode === 'table' ? 'bg-rose-500 text-white shadow-2xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'">
                  <i data-lucide="menu" class="w-3.5 h-3.5"></i>
                  <span>Table</span>
                </button>
              </div>
            </div>

            <!-- Growth Pace Slicer (Image 3) -->
            <div class="flex items-center justify-between flex-wrap gap-2">
              <div class="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                <span class="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider shrink-0 flex items-center gap-1">
                  <span>⚡ GROWTH PACE:</span>
                </span>
                <button type="button" @click="setCreatorPinPace('24h')" class="px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer shrink-0" :class="creatorPinPace === '24h' ? 'bg-rose-500 text-white shadow-2xs' : 'bg-white dark:bg-[#0d1526] border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'">
                  🔥 Last 24 Hours
                </button>
                <button type="button" @click="setCreatorPinPace('3d')" class="px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer shrink-0" :class="creatorPinPace === '3d' ? 'bg-rose-500 text-white shadow-2xs' : 'bg-white dark:bg-[#0d1526] border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'">
                  ⏱ Last 3 Days
                </button>
                <button type="button" @click="setCreatorPinPace('7d')" class="px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer shrink-0" :class="creatorPinPace === '7d' ? 'bg-rose-500 text-white shadow-2xs' : 'bg-white dark:bg-[#0d1526] border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'">
                  📅 Last 7 Days
                </button>
                <button type="button" @click="setCreatorPinPace('all')" class="px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer shrink-0" :class="creatorPinPace === 'all' ? 'bg-rose-500 text-white shadow-2xs' : 'bg-white dark:bg-[#0d1526] border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'">
                  ⭐ All-Time Total
                </button>
              </div>
            </div>

            <!-- Bulk Selection & Staging Action Ribbon -->
            <div x-show="selectedCreatorPinIds.length > 0" class="flex items-center justify-between bg-rose-500/10 border border-rose-500/30 rounded-2xl px-4 py-2.5 shadow-sm text-xs">
              <div class="flex items-center gap-2">
                <i data-lucide="check-square" class="w-4 h-4 text-rose-500"></i>
                <span class="font-bold text-rose-600 dark:text-rose-400 font-mono" x-text="selectedCreatorPinIds.length + ' pin(s) selected'"></span>
              </div>
              <div class="flex items-center gap-2">
                <button type="button" @click="clearSelectedCreatorPins()" class="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1526] text-slate-700 dark:text-slate-300 font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer">
                  Deselect All
                </button>
                <button type="button" @click="analyzeSelectedPinsAsRelated()" :disabled="isAddingSeeds" class="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold transition shadow-sm cursor-pointer flex items-center gap-1.5">
                  <i data-lucide="network" class="w-3.5 h-3.5" :class="isAddingSeeds ? 'animate-spin' : ''"></i>
                  <span>Analyze Related Pins</span>
                </button>
                <button type="button" @click="stageSelectedCreatorPins()" class="px-4 py-1.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold transition shadow-sm cursor-pointer flex items-center gap-1.5">
                  <i data-lucide="play-circle" class="w-3.5 h-3.5"></i>
                  <span>Stage Selected Pins</span>
                </button>
              </div>
            </div>

            <!-- Topic Filter Chips Ribbon -->
            <div x-show="activeCreatorTopics.length > 0" class="flex items-center space-x-1.5 overflow-x-auto pb-1 text-xs">
              <span class="text-[10px] uppercase font-bold text-slate-400 font-mono flex-shrink-0 mr-1 flex items-center space-x-1">
                <i data-lucide="tag" class="w-3 h-3 text-purple-500"></i>
                <span>Topic:</span>
              </span>
              <button @click="activeCreatorSelectedTopic = ''" class="px-2.5 py-1 rounded-xl text-xs font-bold transition flex-shrink-0 flex items-center space-x-1" :class="activeCreatorSelectedTopic === '' ? 'bg-rose-500 text-white shadow-sm' : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'">
                <span>All Pins</span>
                <span class="text-[10px] px-1 py-0.2 rounded-full" :class="activeCreatorSelectedTopic === '' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-800'" x-text="formatNumber(activeCreatorWinningPinsTotal || activeCreatorPins.length || 0)"></span>
              </button>
              <template x-for="top in activeCreatorTopics" :key="top.name">
                <button @click="activeCreatorSelectedTopic = (activeCreatorSelectedTopic === top.name ? '' : top.name)" class="px-2.5 py-1 rounded-xl text-xs transition flex-shrink-0 flex items-center space-x-1.5" :class="activeCreatorSelectedTopic === top.name ? 'bg-purple-600 text-white shadow-sm font-bold' : 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'">
                  <span x-text="top.name"></span>
                  <span class="text-[10px] px-1 py-0.2 rounded-full font-mono" :class="activeCreatorSelectedTopic === top.name ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'" x-text="top.pins_count"></span>
                </button>
              </template>
            </div>

            <!-- Filter Controls Bar (Image 3) -->
            <div class="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#0d1526] p-4 shadow-sm flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              <div class="relative flex-1 max-w-sm">
                <input
                  type="text"
                  x-model="creatorPinSearch"
                  placeholder="Search pin titles..."
                  class="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none pl-9"
                />
                <i data-lucide="search" class="w-4 h-4 text-slate-400 absolute left-3 top-2.5"></i>
              </div>

              <div class="flex flex-wrap items-center gap-2.5">
                <!-- Board Select -->
                <div class="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-2.5 py-1.5">
                  <label class="text-xs font-semibold text-slate-500 whitespace-nowrap">Board:</label>
                  <select x-model="creatorPinBoard" class="bg-transparent text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer max-w-[150px] truncate">
                    <option value="">All Boards</option>
                    <template x-for="b in activeCreatorBoards" :key="b.name">
                      <option :value="b.name" x-text="b.name"></option>
                    </template>
                  </select>
                </div>

                <!-- Stage Select -->
                <div class="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-2.5 py-1.5">
                  <label class="text-xs font-semibold text-slate-500 whitespace-nowrap">Stage:</label>
                  <select x-model="creatorPinStage" class="bg-transparent text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer">
                    <option value="">All Stages</option>
                    <option value="GROWING">📈 GROWING</option>
                    <option value="NEW">🟢 NEW (≤14d)</option>
                    <option value="MATURE">🟣 MATURE (&gt;14d)</option>
                    <option value="COOLING">❄️ COOLING</option>
                    <option value="DORMANT">⚪ DORMANT (&lt;0.5/d)</option>
                  </select>
                </div>

                <!-- Saves Select -->
                <div class="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-2.5 py-1.5">
                  <label class="text-xs font-semibold text-slate-500 whitespace-nowrap">Saves:</label>
                  <select x-model="creatorPinSavesFilter" class="bg-transparent text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer">
                    <option value="">All Saves</option>
                    <option value="gte_100">≥ 100 Saves</option>
                    <option value="gte_500">≥ 500 Saves</option>
                    <option value="lte_50">≤ 50 Saves</option>
                  </select>
                </div>

                <!-- Sort Select -->
                <div class="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-2.5 py-1.5">
                  <label class="text-xs font-semibold text-slate-500 whitespace-nowrap">Sort:</label>
                  <select x-model="creatorPinSort" class="bg-transparent text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer">
                    <option value="delta_saves">Δ 24h Growth</option>
                    <option value="delta_3d">Δ 3d Growth</option>
                    <option value="delta_7d">Δ 7d Growth</option>
                    <option value="saves">Total Saves</option>
                    <option value="repins">Total Repins</option>
                    <option value="velocity">Velocity (Saves/Day)</option>
                    <option value="shares">Total Shares</option>
                    <option value="newest">Newest on Pinterest</option>
                  </select>
                </div>

                <!-- Changed Only Toggle -->
                <label class="inline-flex items-center gap-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-2.5 py-1.5 cursor-pointer text-xs font-medium text-slate-800 dark:text-slate-200 select-none">
                  <input type="checkbox" x-model="creatorPinChangedOnly" class="rounded border-slate-300 text-rose-500 h-4 w-4" />
                  <span>Changed only</span>
                </label>

                <!-- Limit Select -->
                <div class="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-2.5 py-1.5">
                  <label class="text-xs font-semibold text-slate-500 whitespace-nowrap">Show:</label>
                  <select x-model="creatorPinLimit" class="bg-transparent text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer">
                    <option value="25">25</option>
                    <option value="50">50</option>
                    <option value="100">100</option>
                  </select>
                </div>

                <!-- Columns Toggle -->
                <div class="relative">
                  <button @click="isPinColsOpen = !isPinColsOpen" type="button" class="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                    <i data-lucide="columns" class="w-3.5 h-3.5 text-slate-400"></i>
                    <span>Columns</span>
                  </button>
                  <div x-show="isPinColsOpen" @click.outside="isPinColsOpen = false" class="absolute right-0 top-full mt-1.5 z-30 w-44 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1526] p-2 shadow-xl space-y-1">
                    <label class="flex items-center gap-2 px-2 py-1 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input type="checkbox" x-model="creatorPinColVisible.board" class="rounded border-slate-300 text-rose-500" />
                      <span>Board</span>
                    </label>
                    <label class="flex items-center gap-2 px-2 py-1 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input type="checkbox" x-model="creatorPinColVisible.saves" class="rounded border-slate-300 text-rose-500" />
                      <span>Saves &amp; Δ</span>
                    </label>
                    <label class="flex items-center gap-2 px-2 py-1 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input type="checkbox" x-model="creatorPinColVisible.repins" class="rounded border-slate-300 text-rose-500" />
                      <span>Repins &amp; Δ</span>
                    </label>
                    <label class="flex items-center gap-2 px-2 py-1 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input type="checkbox" x-model="creatorPinColVisible.velocity" class="rounded border-slate-300 text-rose-500" />
                      <span>Velocity</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <!-- 12-Column Pins Table View (Image 3) -->
            <div x-show="creatorPinViewMode === 'table'" class="overflow-x-auto rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#0d1526] shadow-xs">
              <table class="w-full text-left text-xs">
                <thead class="bg-slate-50 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 text-[11px] uppercase border-b border-slate-200 dark:border-slate-800 font-semibold select-none">
                  <tr>
                    <th class="py-3 px-3 w-10 text-center">
                      <input type="checkbox" :checked="isAllCreatorPinsSelected" @change="toggleSelectAllCreatorPins()" class="rounded border-slate-300 text-rose-500 cursor-pointer" />
                    </th>
                    <th class="py-3 px-3 w-16">Preview</th>
                    <th class="py-3 px-4 font-semibold text-slate-900 dark:text-white">Pin Title</th>
                    <th x-show="creatorPinColVisible.board" class="py-3 px-3 font-semibold">Board</th>
                    <th x-show="creatorPinColVisible.saves" class="py-3 px-3 font-semibold text-right">Saves &amp; Δ</th>
                    <th x-show="creatorPinColVisible.repins" class="py-3 px-3 font-semibold text-right">Repins &amp; Δ</th>
                    <th class="py-3 px-3 font-semibold text-right">Comments</th>
                    <th class="py-3 px-3 font-semibold text-right">Shares</th>
                    <th x-show="creatorPinColVisible.velocity" class="py-3 px-3 font-semibold text-right">Velocity</th>
                    <th class="py-3 px-3 font-semibold text-center">Stage</th>
                    <th class="py-3 px-3 font-semibold">First Pulled</th>
                    <th class="py-3 px-3 font-semibold">Created</th>
                    <th class="py-3 px-3 text-center font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                  <template x-for="p in paginatedCreatorPins" :key="p.pin_id">
                    <tr class="hover:bg-slate-50/80 dark:hover:bg-slate-900/40 transition">
                      <td class="py-2.5 px-3 text-center">
                        <input type="checkbox" :checked="selectedCreatorPinIds.includes(p.pin_id)" @change="toggleCreatorPinSelection(p.pin_id)" class="rounded border-slate-300 text-rose-500 cursor-pointer" />
                      </td>
                      <td class="py-2.5 px-3 w-16">
                        <div class="cursor-pointer" @click="openPinDossier(p)">
                          <img :src="p.image_url" loading="lazy" class="w-11 h-14 rounded-lg object-cover border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 hover:opacity-80 transition" />
                        </div>
                      </td>
                      <td class="py-2.5 px-4 font-sans font-bold text-slate-900 dark:text-white">
                        <div class="line-clamp-2 cursor-pointer hover:text-rose-500 transition" :title="p.title" x-text="p.title || 'Untitled Pin'" @click="openPinDossier(p)"></div>
                        <span class="text-[10.5px] font-mono text-slate-400 font-normal block mt-0.5" x-text="'ID: ' + p.pin_id"></span>
                      </td>
                      <td x-show="creatorPinColVisible.board" class="py-2.5 px-3 font-sans text-slate-600 dark:text-slate-300 truncate max-w-[130px]" x-text="p.board_name || 'General'"></td>
                      <td x-show="creatorPinColVisible.saves" class="py-2.5 px-3 text-right">
                        <span class="font-extrabold text-rose-600 dark:text-rose-400" x-text="formatNumber(p.saves)"></span>
                        <span x-show="(creatorPinPace === '3d' ? Number(p.delta_saves_3d || 0) : creatorPinPace === '7d' ? Number(p.delta_saves_7d || 0) : Number(p.delta_saves || 0)) > 0" class="inline-block px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 ml-1" x-text="'+' + (creatorPinPace === '3d' ? (p.delta_saves_3d || 0) : creatorPinPace === '7d' ? (p.delta_saves_7d || 0) : (p.delta_saves || 0))"></span>
                      </td>
                      <td x-show="creatorPinColVisible.repins" class="py-2.5 px-3 text-right">
                        <span class="font-bold text-slate-900 dark:text-white" x-text="formatNumber(p.repins)"></span>
                        <span x-show="(creatorPinPace === '3d' ? Number(p.delta_repins_3d || 0) : creatorPinPace === '7d' ? Number(p.delta_repins_7d || 0) : Number(p.delta_repins || 0)) > 0" class="inline-block px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 ml-1" x-text="'+' + (creatorPinPace === '3d' ? (p.delta_repins_3d || 0) : creatorPinPace === '7d' ? (p.delta_repins_7d || 0) : (p.delta_repins || 0))"></span>
                      </td>
                      <td class="py-2.5 px-3 text-right font-medium text-slate-600 dark:text-slate-400" x-text="p.comments || 0"></td>
                      <td class="py-2.5 px-3 text-right">
                        <a :href="'https://www.pinterest.com/pin/' + p.pin_id + '/'" target="_blank" class="font-bold text-sky-500 hover:underline" x-text="p.share_count ? formatNumber(p.share_count) : '—'"></a>
                      </td>
                      <td x-show="creatorPinColVisible.velocity" class="py-2.5 px-3 text-right font-bold text-emerald-500" x-text="(p.velocity || 0) + '/d'"></td>
                      <td class="py-2.5 px-3 text-center">
                        <span class="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20" x-text="'📈 ' + (p.stage || 'ACTIVE')"></span>
                      </td>
                      <td class="py-2.5 px-3 font-sans text-slate-500 text-[11px]" x-text="p.formatted_first_pulled || '—'"></td>
                      <td class="py-2.5 px-3 font-sans text-slate-500 text-[11px]" x-text="p.formatted_created || '—'"></td>
                      <td class="py-2.5 px-3 text-center">
                        <button @click="stagePinAction(p.pin_id)" class="inline-flex items-center justify-center h-7 w-7 rounded-full text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer" title="Stage Pin for Repurpose">
                          <i data-lucide="play-circle" class="w-4 h-4"></i>
                        </button>
                      </td>
                    </tr>
                  </template>
                </tbody>
              </table>
            </div>

            <!-- Alternative Cards View -->
            <div x-show="creatorPinViewMode === 'cards'" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              <template x-for="pin in paginatedCreatorPins" :key="pin.pin_id">
                <div class="bg-white dark:bg-[#0d1526] rounded-2xl border border-slate-200/90 dark:border-slate-800 overflow-hidden shadow-sm flex flex-col justify-between hover:shadow-md transition">
                  <div>
                    <div class="relative aspect-[2/3] bg-slate-100 dark:bg-slate-900 overflow-hidden cursor-pointer" @click="openPinDossier(pin)">
                      <img :src="pin.image_url" loading="lazy" class="w-full h-full object-cover hover:scale-105 transition-transform duration-300">
                      <span class="absolute top-2 right-2 px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-950/75 text-amber-400 backdrop-blur-sm border border-amber-500/30">
                        <span x-text="(pin.velocity || '0') + '/d'"></span>
                      </span>
                    </div>
                    <div class="p-3 space-y-1">
                      <h5 class="font-bold text-xs text-slate-900 dark:text-white line-clamp-2 cursor-pointer hover:text-rose-500 transition" :title="pin.title" x-text="pin.title || 'Untitled Pin'" @click="openPinDossier(pin)"></h5>
                      <div class="flex items-center justify-between text-[11px] font-mono text-rose-600 dark:text-rose-400 font-bold pt-1">
                        <span x-text="formatNumber(pin.saves) + ' saves'"></span>
                        <span class="text-slate-400 text-[10px] truncate max-w-[90px]" x-text="pin.board_name || 'General'"></span>
                      </div>
                    </div>
                  </div>
                  <div class="p-2.5 pt-0 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-1.5 mt-1">
                    <a :href="'https://www.pinterest.com/pin/' + pin.pin_id + '/'" target="_blank" class="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-rose-500">
                      <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                    </a>
                    <button @click="stagePinAction(pin.pin_id)" class="flex-1 py-1.5 px-2 rounded-xl text-[10px] font-bold bg-rose-500 hover:bg-rose-600 text-white transition active:scale-95 shadow-sm">
                      Stage Pin
                    </button>
                  </div>
                </div>
              </template>
            </div>

            <!-- Pins Pagination Bar -->
            <div class="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 px-5 py-3 text-xs text-slate-500">
              <span x-text="'Showing 1-' + paginatedCreatorPins.length + ' of ' + filteredCreatorPins.length + ' pins'"></span>
              <div class="flex items-center gap-2">
                <button @click="creatorPinPage = Math.max(1, creatorPinPage - 1)" :disabled="creatorPinPage <= 1" class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0b1120] px-3 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 disabled:opacity-40 transition shadow-2xs cursor-pointer">Previous</button>
                <span class="font-bold text-slate-900 dark:text-white" x-text="'Page ' + creatorPinPage + ' of ' + Math.max(1, Math.ceil(filteredCreatorPins.length / creatorPinLimit))"></span>
                <button @click="creatorPinPage = creatorPinPage + 1" :disabled="creatorPinPage >= Math.ceil(filteredCreatorPins.length / creatorPinLimit)" class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0b1120] px-3 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 disabled:opacity-40 transition shadow-2xs cursor-pointer">Next</button>
              </div>
            </div>

          </div>

          <!-- ======================================================== -->
          <!-- SUB-VIEW: TOP DESTINATION URLS STRATEGY                   -->
          <!-- ======================================================== -->
          <div x-show="activeCreatorTab === 'top_urls'" class="space-y-5">
            <!-- Header & Filter Bar -->
            <div class="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#0d1526] p-5 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <div class="flex items-center gap-2">
                  <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500 font-bold text-sm">🔗</span>
                  <h3 class="text-base font-extrabold text-slate-900 dark:text-white">Top Destination URLs Intelligence</h3>
                </div>
                <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Aggregated performance per normalized article slug. Discovers high-traffic articles and the volume of pins driving them.
                </p>
              </div>

              <!-- Search & Filter Controls -->
              <div class="flex items-center gap-3 flex-wrap">
                <!-- Filter Type Segmented Control -->
                <div class="flex items-center bg-slate-100 dark:bg-slate-900 p-0.5 rounded-xl border border-slate-200 dark:border-slate-800">
                  <button @click="creatorTopUrlFilterType = 'all'; creatorTopUrlsPage = 1; fetchCreatorTopUrls()" class="rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer" :class="creatorTopUrlFilterType === 'all' ? 'bg-white dark:bg-[#0b1120] text-slate-900 dark:text-white shadow-2xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'">All</button>
                  <button @click="creatorTopUrlFilterType = 'articles_only'; creatorTopUrlsPage = 1; fetchCreatorTopUrls()" class="rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer" :class="creatorTopUrlFilterType === 'articles_only' ? 'bg-white dark:bg-[#0b1120] text-emerald-600 dark:text-emerald-400 shadow-2xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'">Articles Only</button>
                  <button @click="creatorTopUrlFilterType = 'products_only'; creatorTopUrlsPage = 1; fetchCreatorTopUrls()" class="rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer" :class="creatorTopUrlFilterType === 'products_only' ? 'bg-white dark:bg-[#0b1120] text-purple-600 dark:text-purple-400 shadow-2xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'">Products Only</button>
                  <button @click="creatorTopUrlFilterType = 'affiliate_only'; creatorTopUrlsPage = 1; fetchCreatorTopUrls()" class="rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer" :class="creatorTopUrlFilterType === 'affiliate_only' ? 'bg-white dark:bg-[#0b1120] text-amber-600 dark:text-amber-400 shadow-2xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'">🛒 Affiliate &amp; Marketplaces</button>
                </div>

                <!-- Search Input -->
                <div class="relative">
                  <input type="text" x-model="creatorTopUrlSearch" @keyup.enter="creatorTopUrlsPage = 1; fetchCreatorTopUrls()" placeholder="Search article slug..." class="h-9 w-48 sm:w-60 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0b1120] px-3 pl-8 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                  <i data-lucide="search" class="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5"></i>
                </div>

                <!-- Sort Dropdown -->
                <select x-model="creatorTopUrlSort" @change="creatorTopUrlsPage = 1; fetchCreatorTopUrls()" class="h-9 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0b1120] px-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                  <option value="saves_desc">Highest Saves</option>
                  <option value="pins_desc">Most Pins</option>
                  <option value="avg_saves_desc">Highest Avg Saves/Pin</option>
                  <option value="repins_desc">Highest Repins</option>
                  <option value="newest">Most Recent Pin</option>
                </select>

                <button @click="fetchCreatorTopUrls()" class="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition cursor-pointer">
                  <i data-lucide="refresh-cw" class="w-3.5 h-3.5" :class="isLoadingTopUrls ? 'animate-spin' : ''"></i>
                  <span>Refresh</span>
                </button>
              </div>
            </div>

            <!-- Table Card -->
            <div class="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#0d1526] shadow-xs overflow-hidden">
              <div class="overflow-x-auto">
                <table class="w-full text-left text-xs text-slate-600 dark:text-slate-400">
                  <thead class="bg-slate-50 dark:bg-slate-900/60 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th class="py-3 px-4">Article / Destination Slug</th>
                      <th class="py-3 px-3">Type</th>
                      <th class="py-3 px-3 text-right">Pins Driving URL</th>
                      <th class="py-3 px-3 text-right">Total Saves</th>
                      <th class="py-3 px-3 text-right">Avg Saves / Pin</th>
                      <th class="py-3 px-3 text-right">Repins</th>
                      <th class="py-3 px-3">First Seen</th>
                      <th class="py-3 px-3">Last Pin</th>
                      <th class="py-3 px-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60 font-sans">
                    <template x-for="item in activeCreatorTopUrls" :key="item.clean_slug">
                      <tr class="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                        <!-- Slug -->
                        <td class="py-3 px-4">
                          <div class="flex items-center gap-2">
                            <span class="font-bold text-slate-900 dark:text-white text-xs truncate max-w-md" :title="item.clean_slug" x-text="item.clean_slug"></span>
                            <span class="text-[10px] text-slate-400 font-mono" x-text="'(' + item.domain + ')'"></span>
                          </div>
                        </td>
                        <!-- Type -->
                        <td class="py-3 px-3">
                          <template x-if="item.is_affiliate">
                            <span class="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400 border border-amber-500/20">🛒 Affiliate</span>
                          </template>
                          <template x-if="!item.is_affiliate && item.is_product">
                            <span class="rounded-full bg-purple-500/10 px-2 py-0.5 text-[10px] font-bold text-purple-600 dark:text-purple-400 border border-purple-500/20">🛍️ Product</span>
                          </template>
                          <template x-if="!item.is_affiliate && !item.is_product">
                            <span class="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">📰 Article</span>
                          </template>
                        </td>
                        <!-- Pins Count -->
                        <td class="py-3 px-3 text-right font-mono font-bold text-slate-900 dark:text-white" x-text="formatNumber(item.pin_count)"></td>
                        <!-- Total Saves -->
                        <td class="py-3 px-3 text-right font-mono font-extrabold text-amber-600 dark:text-amber-400" x-text="formatNumber(item.total_saves)"></td>
                        <!-- Avg Saves -->
                        <td class="py-3 px-3 text-right font-mono font-bold text-indigo-600 dark:text-indigo-400" x-text="formatNumber(item.avg_saves)"></td>
                        <!-- Repins -->
                        <td class="py-3 px-3 text-right font-mono text-slate-500 dark:text-slate-400" x-text="formatNumber(item.total_repins)"></td>
                        <!-- First Seen -->
                        <td class="py-3 px-3 text-[11px] text-slate-400" x-text="item.first_pin_date ? item.first_pin_date.slice(0, 10) : '—'"></td>
                        <!-- Last Pin -->
                        <td class="py-3 px-3 text-[11px] text-slate-400 font-medium" x-text="item.last_pin_date ? item.last_pin_date.slice(0, 10) : '—'"></td>
                        <!-- Open Link Button -->
                        <td class="py-3 px-3 text-center">
                          <a :href="item.sample_url" target="_blank" rel="noopener noreferrer" class="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-emerald-500 transition" title="Open Article in New Tab">
                            <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                          </a>
                        </td>
                      </tr>
                    </template>
                  </tbody>
                </table>
              </div>

              <!-- Empty State -->
              <template x-if="!isLoadingTopUrls && activeCreatorTopUrls.length === 0">
                <div class="py-12 text-center text-slate-400">
                  <i data-lucide="link" class="w-8 h-8 mx-auto mb-2 opacity-50"></i>
                  <p class="text-xs font-semibold">No destination URLs found matching your criteria.</p>
                </div>
              </template>

              <!-- Pagination Bar -->
              <div class="flex items-center justify-between p-4 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                <span x-text="'Showing ' + activeCreatorTopUrls.length + ' of ' + formatNumber(creatorTopUrlsTotal) + ' unique URLs'"></span>
                <div class="flex items-center gap-1.5">
                  <button @click="if (creatorTopUrlsPage > 1) { creatorTopUrlsPage--; fetchCreatorTopUrls(); }" :disabled="creatorTopUrlsPage <= 1" class="h-8 px-3 rounded-lg border border-slate-200 dark:border-slate-800 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 font-semibold cursor-pointer">Previous</button>
                  <span class="px-2 font-mono" x-text="creatorTopUrlsPage + ' / ' + creatorTopUrlsTotalPages"></span>
                  <button @click="if (creatorTopUrlsPage < creatorTopUrlsTotalPages) { creatorTopUrlsPage++; fetchCreatorTopUrls(); }" :disabled="creatorTopUrlsPage >= creatorTopUrlsTotalPages" class="h-8 px-3 rounded-lg border border-slate-200 dark:border-slate-800 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 font-semibold cursor-pointer">Next</button>
                </div>
              </div>
            </div>
          </div>

          <!-- ======================================================== -->
          <!-- SUB-VIEW: ACCOUNT RELATED PINS & INTERSECTIONS RADAR     -->
          <!-- ======================================================== -->
          <div x-show="activeCreatorTab === 'related_pins'" class="space-y-5">
            <!-- Header & Action Bar -->
            <div class="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#0d1526] p-5 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <div class="flex items-center gap-2">
                  <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500 font-bold text-sm">🕸️</span>
                  <h3 class="text-base font-extrabold text-slate-900 dark:text-white">Related Pins Radar (Account Intersections)</h3>
                  <span class="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/10 border border-amber-500/20 text-amber-600 font-bold">100% Zero-Cookie</span>
                </div>
                <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Pixie Graph Co-Occurrence Radar for @<span x-text="(activeCreator.username || '').replace(/^@+/, '')"></span>. Identifies overlapping related pins across multiple seeds, traffic retention, and competitor leakage.
                </p>
              </div>

              <!-- Top Action Buttons -->
              <div class="flex items-center gap-2 flex-wrap">
                <button @click="autoAddTop10WinningSeedsAction()" :disabled="isAddingSeeds" class="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 transition cursor-pointer">
                  <i data-lucide="zap" class="w-3.5 h-3.5"></i>
                  <span>⚡ Auto-Add Top 10</span>
                </button>

                <button @click="isBulkAddSeedsModalOpen = true" class="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 px-3 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition cursor-pointer">
                  <i data-lucide="plus-circle" class="w-3.5 h-3.5"></i>
                  <span>+ Bulk Add Pin IDs</span>
                </button>

                <button @click="dispatchRelatedWorkflowAction()" :disabled="isHarvestingRelated" class="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white px-3.5 text-xs font-bold transition shadow-sm cursor-pointer disabled:opacity-50">
                  <i data-lucide="play" class="w-3.5 h-3.5" :class="isHarvestingRelated ? 'animate-spin' : ''"></i>
                  <span>🚀 Harvest Related (GHA)</span>
                </button>

                <button @click="fetchCreatorRelatedGraph()" class="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0b1120] px-3 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer">
                  <i data-lucide="refresh-cw" class="w-3.5 h-3.5" :class="isLoadingRelatedGraph ? 'animate-spin' : ''"></i>
                </button>
              </div>
            </div>

            <!-- KPI Summary Cards -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
              <!-- KPI 1: Active Seeds -->
              <div class="p-4 rounded-2xl bg-white dark:bg-[#0d1526] border border-slate-200/90 dark:border-slate-800 shadow-2xs">
                <span class="text-[10px] font-mono uppercase text-slate-500 dark:text-slate-400 font-bold">Active Analyzed Seeds</span>
                <div class="mt-1 text-2xl font-mono font-black text-slate-900 dark:text-white" x-text="creatorRelatedStats.total_seeds || creatorRelatedSeeds.length || 0"></div>
                <div class="text-[10px] text-slate-400 mt-0.5">Seed pins registered for account</div>
              </div>

              <!-- KPI 2: Total Discovered Related Nodes -->
              <div class="p-4 rounded-2xl bg-white dark:bg-[#0d1526] border border-slate-200/90 dark:border-slate-800 shadow-2xs">
                <span class="text-[10px] font-mono uppercase text-slate-500 dark:text-slate-400 font-bold">Total Related Nodes</span>
                <div class="mt-1 text-2xl font-mono font-black text-indigo-600 dark:text-indigo-400" x-text="formatNumber(creatorRelatedStats.total_nodes || 0)"></div>
                <div class="text-[10px] text-slate-400 mt-0.5" x-text="(creatorRelatedStats.unique_candidates || 0) + ' unique pins'"></div>
              </div>

              <!-- KPI 3: Account Retention vs Traffic Leakage -->
              <div class="p-4 rounded-2xl bg-white dark:bg-[#0d1526] border border-slate-200/90 dark:border-slate-800 shadow-2xs">
                <div class="flex items-center justify-between">
                  <span class="text-[10px] font-mono uppercase text-slate-500 dark:text-slate-400 font-bold">Account Retention</span>
                  <span class="text-[10px] font-mono font-bold text-rose-500" x-text="(creatorRelatedStats.leakage_rate_pct || 0) + '% Leakage'"></span>
                </div>
                <div class="mt-1 text-2xl font-mono font-black text-emerald-600 dark:text-emerald-400" x-text="(creatorRelatedStats.retention_rate_pct || 0) + '%'"></div>
                <div class="text-[10px] text-slate-400 mt-0.5" x-text="(creatorRelatedStats.self_retention_nodes || 0) + ' own / ' + (creatorRelatedStats.rival_leakage_nodes || 0) + ' rivals'"></div>
              </div>

              <!-- KPI 4: Multi-Seed Intersections (2+ Seeds) -->
              <div class="p-4 rounded-2xl bg-white dark:bg-[#0d1526] border border-slate-200/90 dark:border-slate-800 shadow-2xs">
                <span class="text-[10px] font-mono uppercase text-slate-500 dark:text-slate-400 font-bold">Multi-Seed Intersections</span>
                <div class="mt-1 text-2xl font-mono font-black text-amber-600 dark:text-amber-400" x-text="creatorRelatedStats.total_intersections || creatorRelatedIntersections.length || 0"></div>
                <div class="text-[10px] text-slate-400 mt-0.5">Shared across 2+ seeds</div>
              </div>
            </div>

            <!-- Registered Seeds Shelf -->
            <div x-show="creatorRelatedSeeds.length > 0" class="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#0d1526] p-4 shadow-xs">
              <div class="flex items-center justify-between mb-3">
                <span class="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <i data-lucide="layers" class="w-3.5 h-3.5 text-amber-500"></i>
                  <span>Registered Seeds Shelf (<span x-text="creatorRelatedSeeds.length"></span>)</span>
                </span>
                <span class="text-[11px] text-slate-400 font-mono">Click Live Harvest to refresh a single seed in 2s</span>
              </div>

              <div class="flex items-center gap-2.5 overflow-x-auto pb-2">
                <template x-for="s in creatorRelatedSeeds" :key="s.pin_id">
                  <div class="shrink-0 flex items-center gap-2 p-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs">
                    <img x-show="s.image_url" :src="s.image_url" class="w-8 h-8 rounded-lg object-cover bg-slate-200 dark:bg-slate-800" />
                    <div class="max-w-[130px]">
                      <div class="font-bold text-slate-900 dark:text-white truncate" x-text="s.title || ('Pin #' + s.pin_id)"></div>
                      <div class="text-[10px] text-slate-400 font-mono" x-text="(s.related_count || 0) + ' related'"></div>
                    </div>
                    <button @click="harvestLiveSingleSeedAction(s.pin_id)" title="Live Single-Seed Harvest" class="p-1 rounded-lg text-emerald-600 hover:bg-emerald-500/10 transition cursor-pointer">
                      <i data-lucide="play-circle" class="w-3.5 h-3.5"></i>
                    </button>
                    <button @click="deleteSeedAction(s.pin_id)" title="Delete Seed" class="p-1 rounded-lg text-rose-500 hover:bg-rose-500/10 transition cursor-pointer">
                      <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                    </button>
                  </div>
                </template>
              </div>
            </div>

            <!-- Intersections Radar Filter & Search Controls -->
            <div class="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#0d1526] p-4 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div class="flex items-center gap-2 flex-wrap">
                <!-- Overlap Threshold Selector -->
                <div class="flex items-center bg-slate-100 dark:bg-slate-900 p-0.5 rounded-xl border border-slate-200 dark:border-slate-800">
                  <button @click="creatorRelatedMinOverlap = 2; creatorRelatedPage = 1; fetchCreatorRelatedGraph()" class="rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer" :class="creatorRelatedMinOverlap === 2 ? 'bg-white dark:bg-[#0b1120] text-amber-600 dark:text-amber-400 shadow-2xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'">2+ Seeds Overlap</button>
                  <button @click="creatorRelatedMinOverlap = 3; creatorRelatedPage = 1; fetchCreatorRelatedGraph()" class="rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer" :class="creatorRelatedMinOverlap === 3 ? 'bg-white dark:bg-[#0b1120] text-amber-600 dark:text-amber-400 shadow-2xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'">3+ Seeds</button>
                  <button @click="creatorRelatedMinOverlap = 5; creatorRelatedPage = 1; fetchCreatorRelatedGraph()" class="rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer" :class="creatorRelatedMinOverlap === 5 ? 'bg-white dark:bg-[#0b1120] text-amber-600 dark:text-amber-400 shadow-2xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'">5+ Seeds</button>
                </div>

                <!-- Retention vs Rival Filter -->
                <div class="flex items-center bg-slate-100 dark:bg-slate-900 p-0.5 rounded-xl border border-slate-200 dark:border-slate-800">
                  <button @click="creatorRelatedFilter = 'all'; creatorRelatedPage = 1; fetchCreatorRelatedGraph()" class="rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer" :class="creatorRelatedFilter === 'all' ? 'bg-white dark:bg-[#0b1120] text-slate-900 dark:text-white shadow-2xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'">All Candidates</button>
                  <button @click="creatorRelatedFilter = 'self_only'; creatorRelatedPage = 1; fetchCreatorRelatedGraph()" class="rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer" :class="creatorRelatedFilter === 'self_only' ? 'bg-white dark:bg-[#0b1120] text-emerald-600 dark:text-emerald-400 shadow-2xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'">Own Retention Only</button>
                  <button @click="creatorRelatedFilter = 'rivals_only'; creatorRelatedPage = 1; fetchCreatorRelatedGraph()" class="rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer" :class="creatorRelatedFilter === 'rivals_only' ? 'bg-white dark:bg-[#0b1120] text-rose-600 dark:text-rose-400 shadow-2xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'">Rival Leakage Only</button>
                </div>
              </div>

              <!-- Search & Export -->
              <div class="flex items-center gap-2">
                <div class="relative">
                  <input type="text" x-model="creatorRelatedSearch" @keyup.enter="creatorRelatedPage = 1; fetchCreatorRelatedGraph()" placeholder="Search title or creator..." class="h-9 w-44 sm:w-56 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0b1120] px-3 pl-8 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500" />
                  <i data-lucide="search" class="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5"></i>
                </div>

                <button @click="exportCsv(creatorRelatedIntersections, (activeCreator.username || 'account') + '-related-intersections.csv')" class="h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0b1120] text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer flex items-center gap-1.5">
                  <i data-lucide="download" class="w-3.5 h-3.5"></i>
                  <span>CSV</span>
                </button>
              </div>
            </div>

            <!-- Intersections Radar Table -->
            <div class="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#0d1526] shadow-xs overflow-hidden">
              <div class="overflow-x-auto">
                <table class="w-full text-left text-xs text-slate-600 dark:text-slate-400">
                  <thead class="bg-slate-50/80 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 font-mono text-[11px] uppercase tracking-wider text-slate-500">
                    <tr>
                      <th class="p-3.5 pl-5">Candidate Pin</th>
                      <th class="p-3.5 text-center">Multi-Seed Overlap</th>
                      <th class="p-3.5 text-center">Ownership</th>
                      <th class="p-3.5 text-right">Saves</th>
                      <th class="p-3.5 text-right">Repins</th>
                      <th class="p-3.5">Monetization Domain</th>
                      <th class="p-3.5 pr-5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60 font-sans">
                    <template x-for="item in creatorRelatedIntersections" :key="item.candidate_pin_id">
                      <tr class="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition">
                        <!-- Pin Preview & Title -->
                        <td class="p-3.5 pl-5">
                          <div class="flex items-center gap-3">
                            <img x-show="item.image_url" :src="item.image_url" class="w-10 h-10 rounded-xl object-cover bg-slate-200 dark:bg-slate-800 shrink-0 cursor-pointer" @click="openPinPage(item.candidate_pin_id)" />
                            <div class="max-w-xs sm:max-w-sm">
                              <span @click="openPinPage(item.candidate_pin_id)" class="font-bold text-slate-900 dark:text-white hover:text-amber-500 transition cursor-pointer line-clamp-1" x-text="item.title || ('Pin #' + item.candidate_pin_id)"></span>
                              <div class="text-[11px] text-slate-400 font-mono flex items-center gap-1 mt-0.5">
                                <span>@<span x-text="item.creator_username || 'unknown'"></span></span>
                                <span x-show="item.creator_name" class="text-slate-500">· <span x-text="item.creator_name"></span></span>
                              </div>
                            </div>
                          </div>
                        </td>

                        <!-- Multi-Seed Overlap Count & Originating Seeds -->
                        <td class="p-3.5 text-center">
                          <div class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-mono font-extrabold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                            <i data-lucide="layers" class="w-3 h-3"></i>
                            <span x-text="(item.seed_overlap_count || 1) + ' Seeds'"></span>
                          </div>
                        </td>

                        <!-- Ownership Badge -->
                        <td class="p-3.5 text-center">
                          <template x-if="item.is_same_account">
                            <span class="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                              🛡️ Own Retention
                            </span>
                          </template>
                          <template x-if="!item.is_same_account">
                            <span class="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                              ⚡ Rival Leakage
                            </span>
                          </template>
                        </td>

                        <!-- Saves -->
                        <td class="p-3.5 text-right font-mono font-bold text-slate-900 dark:text-white" x-text="formatNumber(item.saves || 0)"></td>

                        <!-- Repins -->
                        <td class="p-3.5 text-right font-mono text-slate-600 dark:text-slate-400" x-text="formatNumber(item.repins || 0)"></td>

                        <!-- Domain -->
                        <td class="p-3.5">
                          <div class="flex items-center gap-1.5">
                            <template x-if="item.domain">
                              <span class="font-mono text-xs text-slate-700 dark:text-slate-300 truncate max-w-[140px]" x-text="item.domain"></span>
                            </template>
                            <template x-if="!item.domain">
                              <span class="text-slate-400 text-xs">Direct Image</span>
                            </template>
                          </div>
                        </td>

                        <!-- Actions -->
                        <td class="p-3.5 pr-5 text-right">
                          <div class="flex items-center justify-end gap-1.5">
                            <button @click="openPinPage(item.candidate_pin_id)" class="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-amber-500 hover:text-white transition cursor-pointer">
                              Inspect
                            </button>
                            <a :href="'https://www.pinterest.com/pin/' + item.candidate_pin_id + '/'" target="_blank" rel="noopener noreferrer" class="p-1 rounded-lg text-slate-400 hover:text-rose-500 transition cursor-pointer" title="Open on Pinterest">
                              <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                            </a>
                          </div>
                        </td>
                      </tr>
                    </template>
                  </tbody>
                </table>
              </div>

              <!-- Empty State -->
              <template x-if="!isLoadingRelatedGraph && creatorRelatedIntersections.length === 0">
                <div class="py-14 text-center text-slate-400">
                  <i data-lucide="network" class="w-10 h-10 mx-auto mb-2 opacity-40 text-amber-500"></i>
                  <p class="text-xs font-semibold">No multi-seed intersections found matching your criteria.</p>
                  <p class="text-[11px] text-slate-400 mt-1">Add more seed pins or click "Harvest Related" to crawl Pinterest's graph for @<span x-text="(activeCreator.username || '').replace(/^@+/, '')"></span>.</p>
                </div>
              </template>

              <!-- Pagination Bar -->
              <div class="flex items-center justify-between p-4 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                <span x-text="'Showing ' + creatorRelatedIntersections.length + ' of ' + formatNumber(creatorRelatedStats.total_intersections || creatorRelatedIntersections.length) + ' intersecting hubs'"></span>
                <div class="flex items-center gap-1.5">
                  <button @click="if (creatorRelatedPage > 1) { creatorRelatedPage--; fetchCreatorRelatedGraph(); }" :disabled="creatorRelatedPage <= 1" class="h-8 px-3 rounded-lg border border-slate-200 dark:border-slate-800 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 font-semibold cursor-pointer">Previous</button>
                  <span class="px-2 font-mono" x-text="creatorRelatedPage + ' / ' + creatorRelatedTotalPages"></span>
                  <button @click="if (creatorRelatedPage < creatorRelatedTotalPages) { creatorRelatedPage++; fetchCreatorRelatedGraph(); }" :disabled="creatorRelatedPage >= creatorRelatedTotalPages" class="h-8 px-3 rounded-lg border border-slate-200 dark:border-slate-800 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 font-semibold cursor-pointer">Next</button>
                </div>
              </div>
            </div>
          </div>

          <!-- ======================================================== -->
          <!-- SUB-VIEW 3: SMART TOPIC CLUSTERS (Creator-Scoped)         -->
          <!-- ======================================================== -->
          <div x-show="activeCreatorTab === 'topics'" class="space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-[#0d1526] p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
              <div class="relative w-full sm:w-72">
                <i data-lucide="search" class="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"></i>
                <input type="text" x-model="creatorTopicSearch" placeholder="Filter this creator's topics..." class="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50">
              </div>
              <div class="text-xs text-slate-500 font-mono">
                Showing <strong class="text-purple-600 dark:text-purple-400" x-text="filteredCreatorTopics.length"></strong> topics for @<span x-text="(activeCreator.username || '').replace(/^@+/, '')"></span>
              </div>
            </div>

            <!-- Topic Clusters Table -->
            <div class="border border-slate-200/90 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-[#0d1526]">
              <table class="w-full text-left text-xs">
                <thead>
                  <tr class="bg-slate-50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <th class="py-3 px-4">Topic / Semantic Cluster</th>
                    <th class="py-3 px-4 text-right">Pins Count</th>
                    <th class="py-3 px-4 text-right">Total Saves</th>
                    <th class="py-3 px-4 text-right">Avg Saves</th>
                    <th class="py-3 px-4 text-right">Avg Velocity</th>
                    <th class="py-3 px-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                  <template x-for="t in filteredCreatorTopics" :key="t.name">
                    <tr class="hover:bg-slate-50/80 dark:hover:bg-slate-900/40 transition">
                      <td class="py-3 px-4 font-sans font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                        <span class="w-2.5 h-2.5 rounded-full bg-purple-500 flex-shrink-0"></span>
                        <span class="truncate" x-text="t.name"></span>
                      </td>
                      <td class="py-3 px-4 text-right font-bold text-slate-700 dark:text-slate-300" x-text="formatNumber(t.pins_count)"></td>
                      <td class="py-3 px-4 text-right font-bold text-purple-600 dark:text-purple-400" x-text="formatNumber(t.total_saves)"></td>
                      <td class="py-3 px-4 text-right text-slate-500" x-text="formatNumber(t.avg_saves)"></td>
                      <td class="py-3 px-4 text-right font-bold text-amber-500" x-text="(t.avg_velocity || '0') + '/d'"></td>
                      <td class="py-3 px-4 text-center">
                        <button @click="activeCreatorSelectedTopic = t.name; activeCreatorTab = 'pins'" class="px-3 py-1 rounded-xl bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/40 dark:hover:bg-purple-900/60 text-purple-600 dark:text-purple-400 font-bold text-[11px] transition flex items-center space-x-1 mx-auto shadow-sm cursor-pointer">
                          <span>View Pins</span>
                          <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i>
                        </button>
                      </td>
                    </tr>
                  </template>
                </tbody>
              </table>

              <div x-show="filteredCreatorTopics.length === 0" class="p-12 text-center text-slate-400 text-xs">
                <i data-lucide="sparkles" class="w-8 h-8 mx-auto mb-2 opacity-50 text-purple-500"></i>
                <p class="font-bold text-slate-700 dark:text-slate-300">No topic clusters found for this creator yet.</p>
                <p class="text-[11px] text-slate-500 mt-1">Run "Sync Pins" or "Deep Audit Sweep" to ingest pins with Pinterest visual annotations.</p>
              </div>
            </div>
          </div>

          <!-- ======================================================== -->
          <!-- SUB-VIEW 4: PINTEREST BOARDS STRATEGY & SEMANTICS         -->
          <!-- Full-Featured, Modern Visual Intelligence & Harvest Suite -->
          <!-- ======================================================== -->
          <div x-show="activeCreatorTab === 'boards'" class="space-y-6">

            <!-- 1. Master Strategy Header & Actions Bar -->
            <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-[#0d1526] p-5 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs">
              <div>
                <div class="flex items-center gap-2">
                  <span class="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 font-bold text-base">📌</span>
                  <h3 class="text-base font-bold text-slate-900 dark:text-white">Curated Boards &amp; Topic Strategy</h3>
                  <span class="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20" x-text="(activeCreatorBoards.length || activeCreator.total_boards || 0) + ' boards'"></span>
                </div>
                <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">Deep inspection of public Pinterest boards, cover visuals, follower reach, and algorithmic Related Interests (board_vase).</p>
              </div>
              <div class="flex items-center flex-wrap gap-2">
                <button type="button" @click="syncCompetitorBoardsAction(activeCreator)" :disabled="isSyncingBoards" class="px-4 py-2 rounded-xl text-xs font-bold bg-white dark:bg-[#0b1120] border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition active:scale-95 disabled:opacity-50 flex items-center space-x-1.5 shadow-2xs cursor-pointer">
                  <i data-lucide="refresh-cw" :class="{'animate-spin text-purple-500': isSyncingBoards}" class="w-3.5 h-3.5"></i>
                  <span x-text="isSyncingBoards ? 'Syncing...' : 'Sync Boards (Pinterest)'"></span>
                </button>
                <button type="button" @click="openGhaCrawlerModal(activeCreator)" :disabled="isDispatchingGitHubCrawl" class="px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white transition active:scale-95 disabled:opacity-50 flex items-center space-x-1.5 shadow-sm cursor-pointer" title="Crawl all creator boards using 20-Shard GitHub Actions Crawler">
                  <i data-lucide="zap" :class="{'animate-spin': isDispatchingGitHubCrawl}" class="w-3.5 h-3.5"></i>
                  <span>⚡ Harvest All Boards (20 Shards)</span>
                </button>
              </div>
            </div>

            <!-- 2. Board Strategy KPI Summary Cards -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
              <div class="bg-white dark:bg-[#0d1526] rounded-2xl border border-slate-200/90 dark:border-slate-800 p-4 shadow-2xs">
                <div class="flex items-center justify-between text-slate-400 mb-1">
                  <span class="text-[10.5px] font-bold uppercase tracking-wider">Curated Boards</span>
                  <i data-lucide="layout-grid" class="w-4 h-4 text-purple-500"></i>
                </div>
                <span class="text-2xl font-black text-slate-900 dark:text-white font-mono block" x-text="activeCreatorBoards.length || activeCreator.total_boards || 0"></span>
                <span class="text-[11px] text-slate-500 mt-1 block">Public thematic boards</span>
              </div>

              <div class="bg-white dark:bg-[#0d1526] rounded-2xl border border-slate-200/90 dark:border-slate-800 p-4 shadow-2xs">
                <div class="flex items-center justify-between text-slate-400 mb-1">
                  <span class="text-[10.5px] font-bold uppercase tracking-wider">Board Pins</span>
                  <i data-lucide="layers" class="w-4 h-4 text-indigo-500"></i>
                </div>
                <span class="text-2xl font-black text-slate-900 dark:text-white font-mono block" x-text="formatNumber(creatorBoardsTotalPins)"></span>
                <span class="text-[11px] text-slate-500 mt-1 block">Curated across all boards</span>
              </div>

              <div class="bg-white dark:bg-[#0d1526] rounded-2xl border border-slate-200/90 dark:border-slate-800 p-4 shadow-2xs">
                <div class="flex items-center justify-between text-slate-400 mb-1">
                  <span class="text-[10.5px] font-bold uppercase tracking-wider">Board Audience</span>
                  <i data-lucide="users" class="w-4 h-4 text-emerald-500"></i>
                </div>
                <span class="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono block" x-text="formatNumber(creatorBoardsTotalFollowers)"></span>
                <span class="text-[11px] text-slate-500 mt-1 block">Total board subscribers</span>
              </div>

              <div class="bg-white dark:bg-[#0d1526] rounded-2xl border border-slate-200/90 dark:border-slate-800 p-4 shadow-2xs">
                <div class="flex items-center justify-between text-slate-400 mb-1">
                  <span class="text-[10.5px] font-bold uppercase tracking-wider">Top Board</span>
                  <i data-lucide="trophy" class="w-4 h-4 text-amber-500"></i>
                </div>
                <span class="text-sm font-bold text-slate-900 dark:text-white truncate block" :title="activeCreatorBoards[0]?.name || 'None'" x-text="activeCreatorBoards[0]?.name || 'N/A'"></span>
                <span class="text-[11px] text-amber-600 dark:text-amber-400 font-mono font-bold mt-1 block" x-text="formatNumber(activeCreatorBoards[0]?.pin_count || 0) + ' pins'"></span>
              </div>
            </div>

            <!-- 3. Discovered Algorithmic Related Interests (board_vase) -->
            <div x-show="creatorBoardsTopicsList.length > 0" class="rounded-2xl border border-purple-500/20 bg-gradient-to-r from-purple-500/5 via-sky-500/5 to-indigo-500/5 dark:from-purple-950/20 dark:via-sky-950/20 dark:to-indigo-950/20 p-4 space-y-3">
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div class="flex items-center gap-2">
                  <span class="flex h-5 w-5 items-center justify-center rounded-lg bg-purple-500/20 text-purple-600 dark:text-purple-400 text-xs">✨</span>
                  <span class="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">Pinterest Algorithmic Topics (<code class="text-purple-600 dark:text-purple-400 font-mono">board_vase</code> Semantic Interests)</span>
                  <span class="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400" x-text="creatorBoardsTopicsList.length + ' topics'"></span>
                </div>
                <button type="button" x-show="creatorBoardSelectedTopic" @click="creatorBoardSelectedTopic = ''; creatorBoardPage = 1" class="text-[11px] font-bold text-rose-500 hover:underline flex items-center gap-1 cursor-pointer">
                  <i data-lucide="x" class="w-3 h-3"></i>
                  <span>Clear Topic Filter</span>
                </button>
              </div>

              <!-- Topic Chips Flow -->
              <div class="flex flex-wrap gap-1.5 items-center max-h-32 overflow-y-auto pr-1">
                <button type="button" @click="creatorBoardSelectedTopic = ''; creatorBoardPage = 1" class="px-2.5 py-1 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1" :class="!creatorBoardSelectedTopic ? 'bg-purple-600 text-white shadow-2xs' : 'bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'">
                  <span>All Topics</span>
                </button>
                <template x-for="item in creatorBoardsTopicsList" :key="item.text">
                  <button type="button" @click="creatorBoardSelectedTopic = (creatorBoardSelectedTopic === item.text ? '' : item.text); creatorBoardPage = 1" class="px-2.5 py-1 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 shadow-2xs" :class="creatorBoardSelectedTopic === item.text ? 'bg-purple-600 text-white font-bold' : 'bg-white dark:bg-[#0d1526] border border-slate-200/90 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-purple-400/50 hover:bg-purple-50/50 dark:hover:bg-purple-950/20'">
                    <span class="text-purple-500 font-bold">#</span>
                    <span x-text="item.text"></span>
                    <span class="text-[10px] font-mono px-1.5 py-0.2 rounded-full" :class="creatorBoardSelectedTopic === item.text ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'" x-text="item.count"></span>
                  </button>
                </template>
              </div>
            </div>

            <!-- 4. Interactive Toolbar: Search, Sort & View Mode Switcher -->
            <div class="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#0d1526] p-4 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <!-- Search bar -->
              <div class="relative flex-1 min-w-[240px]">
                <i data-lucide="search" class="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"></i>
                <input
                  type="text"
                  x-model="creatorBoardSearch"
                  @input="creatorBoardPage = 1"
                  placeholder="Filter boards by title, topic, or keyword..."
                  class="w-full pl-9 pr-9 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:border-purple-500 transition"
                >
                <button
                  type="button"
                  x-show="creatorBoardSearch"
                  @click="creatorBoardSearch = ''; creatorBoardPage = 1"
                  class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  <i data-lucide="x" class="w-3.5 h-3.5"></i>
                </button>
              </div>

              <!-- Sort, View Mode & Count -->
              <div class="flex items-center flex-wrap gap-2.5">
                <!-- Sort Select -->
                <div class="flex items-center gap-1.5 text-xs text-slate-500">
                  <i data-lucide="arrow-up-down" class="w-3.5 h-3.5 text-slate-400"></i>
                  <select
                    x-model="creatorBoardSort"
                    @change="creatorBoardPage = 1"
                    class="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-hidden focus:border-purple-500 transition cursor-pointer"
                  >
                    <option value="most_pins">🔥 Most Pins</option>
                    <option value="most_followers">👥 Most Followers</option>
                    <option value="recent_activity">🕒 Recent Activity</option>
                    <option value="name_asc">🔤 Name (A-Z)</option>
                    <option value="creation_date">📅 Creation Date</option>
                  </select>
                </div>

                <!-- View Toggle Buttons -->
                <div class="flex items-center rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 p-0.5">
                  <button
                    type="button"
                    @click="creatorBoardsViewMode = 'grid'"
                    class="px-2.5 py-1 text-xs font-bold rounded-lg transition flex items-center gap-1 cursor-pointer"
                    :class="creatorBoardsViewMode === 'grid' ? 'bg-white dark:bg-[#0b1120] text-purple-600 dark:text-purple-400 shadow-2xs' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'"
                    title="Grid Cards View"
                  >
                    <i data-lucide="layout-grid" class="w-3.5 h-3.5"></i>
                    <span class="hidden sm:inline">Grid</span>
                  </button>
                  <button
                    type="button"
                    @click="creatorBoardsViewMode = 'table'"
                    class="px-2.5 py-1 text-xs font-bold rounded-lg transition flex items-center gap-1 cursor-pointer"
                    :class="creatorBoardsViewMode === 'table' ? 'bg-white dark:bg-[#0b1120] text-purple-600 dark:text-purple-400 shadow-2xs' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'"
                    title="Data Table View"
                  >
                    <i data-lucide="table" class="w-3.5 h-3.5"></i>
                    <span class="hidden sm:inline">Table</span>
                  </button>
                </div>

                <!-- Total Count Pill -->
                <span class="inline-flex items-center rounded-xl bg-purple-500/10 px-3 py-1.5 text-xs font-mono font-bold text-purple-600 dark:text-purple-400 border border-purple-500/20" x-text="filteredCreatorBoards.length + ' / ' + activeCreatorBoards.length"></span>
              </div>
            </div>

            <!-- Loading Skeleton -->
            <div x-show="isLoadingBoards" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-pulse">
              <template x-for="i in 8" :key="i">
                <div class="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1526] overflow-hidden p-4 space-y-3">
                  <div class="h-36 bg-slate-200 dark:bg-slate-800 rounded-xl"></div>
                  <div class="h-4 bg-slate-200 dark:bg-slate-800 rounded-md w-3/4"></div>
                  <div class="h-3 bg-slate-200 dark:bg-slate-800 rounded-md w-1/2"></div>
                  <div class="flex gap-2 pt-2">
                    <div class="h-8 bg-slate-200 dark:bg-slate-800 rounded-lg flex-1"></div>
                    <div class="h-8 bg-slate-200 dark:bg-slate-800 rounded-lg flex-1"></div>
                  </div>
                </div>
              </template>
            </div>

            <!-- VIEW 1: PREMIUM GRID CARDS -->
            <div x-show="!isLoadingBoards && creatorBoardsViewMode === 'grid'" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              <template x-for="b in paginatedCreatorBoards" :key="b.id || b.board_id">
                <div class="group relative flex flex-col rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#0d1526] overflow-hidden shadow-xs hover:shadow-md hover:border-purple-500/40 dark:hover:border-purple-500/40 transition-all duration-200">
                  
                  <!-- Board Visual Header & Cover Image -->
                  <div class="relative h-44 w-full overflow-hidden bg-slate-100 dark:bg-slate-900">
                    <template x-if="b.image_cover_url">
                      <img :src="b.image_cover_url" :alt="b.name" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                    </template>
                    <template x-if="!b.image_cover_url">
                      <div class="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-purple-600/20 via-sky-600/10 to-indigo-600/20 p-4 text-center">
                        <i data-lucide="layout-grid" class="w-10 h-10 text-purple-400 opacity-60 mb-1"></i>
                        <span class="text-xs font-bold text-slate-600 dark:text-slate-300 line-clamp-1" x-text="b.name"></span>
                      </div>
                    </template>

                    <!-- Gradient Vignette Overlay -->
                    <div class="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/30 to-transparent"></div>

                    <!-- Top Floating Header Badges -->
                    <div class="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between">
                      <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-900/70 backdrop-blur-md text-white border border-white/10 shadow-xs">
                        <i data-lucide="bookmark" class="w-2.5 h-2.5 text-purple-400"></i>
                        <span>Board</span>
                      </span>
                      <a :href="b.url || ('https://www.pinterest.com/' + (activeCreator.username || '').replace(/^@+/, '') + '/' + encodeURIComponent(b.name.toLowerCase().replace(/\s+/g, '-')))" target="_blank" rel="noopener noreferrer" class="p-1.5 rounded-full bg-slate-900/70 backdrop-blur-md text-white/80 hover:text-white hover:bg-slate-900 transition border border-white/10 shadow-xs" title="Open on Pinterest">
                        <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                      </a>
                    </div>

                    <!-- Bottom Floating Stats Pills -->
                    <div class="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between">
                      <div class="flex items-center gap-1.5">
                        <span class="px-2 py-0.5 rounded-lg text-[10.5px] font-mono font-bold bg-purple-500/90 backdrop-blur-md text-white shadow-xs flex items-center gap-1">
                          <i data-lucide="pin" class="w-3 h-3"></i>
                          <span x-text="formatNumber(b.pin_count) + ' pins'"></span>
                        </span>
                        <span class="px-2 py-0.5 rounded-lg text-[10.5px] font-mono font-semibold bg-slate-900/80 backdrop-blur-md text-slate-200 border border-white/10 flex items-center gap-1">
                          <i data-lucide="users" class="w-3 h-3 text-emerald-400"></i>
                          <span x-text="formatNumber(b.follower_count || 0)"></span>
                        </span>
                      </div>
                    </div>
                  </div>

                  <!-- Board Details & Semantics Body -->
                  <div class="p-4 flex-1 flex flex-col justify-between space-y-3">
                    <div>
                      <h4 @click="openBoardPage(b, activeCreator)" class="font-bold text-sm text-slate-900 dark:text-white line-clamp-1 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition cursor-pointer" :title="b.name" x-text="b.name"></h4>
                      <p class="text-[11px] text-slate-500 line-clamp-1 mt-0.5" x-text="b.description || 'No description provided.'"></p>

                      <div class="flex items-center gap-2 mt-2 text-[10.5px] text-slate-400 font-sans">
                        <span class="flex items-center gap-1">
                          <i data-lucide="clock" class="w-3 h-3 text-slate-400"></i>
                          <span x-text="b.last_pinned_at ? ('Active ' + new Date(b.last_pinned_at).toLocaleDateString()) : (b.created_at ? ('Created ' + new Date(b.created_at).toLocaleDateString()) : 'Active')"></span>
                        </span>
                      </div>

                      <!-- Discovered Semantic Related Interests (board_vase) -->
                      <div class="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800/80">
                        <div class="flex items-center gap-1 mb-1.5">
                          <i data-lucide="sparkles" class="w-3 h-3 text-purple-400"></i>
                          <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Semantic Topics</span>
                        </div>
                        <template x-if="b.board_vase && b.board_vase.length > 0">
                          <div class="flex flex-wrap gap-1">
                            <template x-for="v in b.board_vase.slice(0, 3)" :key="v.text || v">
                              <span @click="creatorBoardSearch = (v.text || v); creatorBoardPage = 1" class="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 hover:bg-purple-500/20 cursor-pointer transition" :title="'Filter boards by: ' + (v.text || v)">
                                <span>#</span><span x-text="v.text || v"></span>
                              </span>
                            </template>
                            <span x-show="b.board_vase.length > 3" class="px-1.5 py-0.5 rounded-md text-[10px] font-mono text-slate-400 bg-slate-100 dark:bg-slate-800" x-text="'+' + (b.board_vase.length - 3)"></span>
                          </div>
                        </template>
                        <template x-if="!b.board_vase || b.board_vase.length === 0">
                          <span class="text-[10px] text-slate-400 italic">No semantic tags discovered yet</span>
                        </template>
                      </div>
                    </div>

                    <!-- Action Buttons Footer -->
                    <div class="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2">
                      <button
                        type="button"
                        @click="openBoardPage(b, activeCreator)"
                        class="flex-1 py-1.5 px-2.5 rounded-xl text-xs font-bold bg-purple-500/10 hover:bg-purple-500/20 text-purple-700 dark:text-purple-300 border border-purple-500/30 transition active:scale-95 flex items-center justify-center gap-1 cursor-pointer"
                        title="Open Dedicated Board Intelligence Page"
                      >
                        <i data-lucide="layout-grid" class="w-3.5 h-3.5"></i>
                        <span>Inspect Board</span>
                      </button>

                      <button
                        type="button"
                        @click="crawlSingleBoardGha(b.name)"
                        class="flex-1 py-1.5 px-2.5 rounded-xl text-xs font-bold bg-sky-500/10 hover:bg-sky-500/20 text-sky-700 dark:text-sky-300 border border-sky-500/30 transition active:scale-95 flex items-center justify-center gap-1 cursor-pointer"
                        title="Harvest this specific board via GitHub Actions 20-Shard Crawler"
                      >
                        <i data-lucide="zap" class="w-3.5 h-3.5 text-sky-500"></i>
                        <span>Crawl (GHA)</span>
                      </button>
                    </div>

                  </div>
                </div>
              </template>
            </div>

            <!-- VIEW 2: HIGH-DENSITY DATA TABLE -->
            <div x-show="!isLoadingBoards && creatorBoardsViewMode === 'table'" class="border border-slate-200/90 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-[#0d1526] shadow-xs">
              <div class="overflow-x-auto min-w-full">
                <table class="w-full text-left text-xs border-collapse">
                  <thead class="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th class="py-3 px-4 w-12">Cover</th>
                      <th class="py-3 px-4">Board Name &amp; Description</th>
                      <th class="py-3 px-4 w-48">Pin Inventory</th>
                      <th class="py-3 px-4 text-right">Followers</th>
                      <th class="py-3 px-4">Algorithmic Topics</th>
                      <th class="py-3 px-4 text-center">Last Activity</th>
                      <th class="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                    <template x-for="b in paginatedCreatorBoards" :key="b.id || b.board_id">
                      <tr class="hover:bg-slate-50/80 dark:hover:bg-slate-900/40 transition">
                        
                        <!-- Thumbnail Column -->
                        <td class="py-3 px-4">
                          <div class="w-11 h-11 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shrink-0">
                            <template x-if="b.image_cover_url">
                              <img :src="b.image_cover_url" :alt="b.name" class="w-full h-full object-cover" loading="lazy" />
                            </template>
                            <template x-if="!b.image_cover_url">
                              <div class="w-full h-full flex items-center justify-center bg-purple-500/10 text-purple-500">
                                <i data-lucide="layout-grid" class="w-4 h-4"></i>
                              </div>
                            </template>
                          </div>
                        </td>

                        <!-- Name & Desc Column -->
                        <td class="py-3 px-4 font-sans">
                          <button type="button" @click="openBoardPage(b, activeCreator)" class="font-bold text-slate-900 dark:text-white hover:text-purple-600 dark:hover:text-purple-400 line-clamp-1 inline-flex items-center gap-1.5 cursor-pointer text-left">
                            <span x-text="b.name"></span>
                            <i data-lucide="arrow-right" class="w-3 h-3 text-purple-400"></i>
                          </button>
                          <div class="text-[11px] text-slate-400 line-clamp-1 mt-0.5" x-text="b.description || 'Curated collection'"></div>
                        </td>

                        <!-- Pin Count & Relative Progress Column -->
                        <td class="py-3 px-4 font-sans">
                          <div class="flex items-center justify-between text-xs font-bold text-slate-900 dark:text-white font-mono mb-1">
                            <span x-text="formatNumber(b.pin_count)"></span>
                            <span class="text-[10px] text-slate-400 font-normal" x-text="Math.round(((b.pin_count || 0) / creatorBoardsMaxPins) * 100) + '% of top'"></span>
                          </div>
                          <div class="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                            <div class="h-full rounded-full bg-gradient-to-r from-purple-500 to-indigo-500" :style="'width: ' + Math.min(100, Math.max(4, Math.round(((b.pin_count || 0) / creatorBoardsMaxPins) * 100))) + '%'"></div>
                          </div>
                        </td>

                        <!-- Followers Column -->
                        <td class="py-3 px-4 text-right font-bold text-slate-700 dark:text-slate-300 font-mono" x-text="formatNumber(b.follower_count || 0)"></td>

                        <!-- Topics Column -->
                        <td class="py-3 px-4 font-sans">
                          <template x-if="b.board_vase && b.board_vase.length > 0">
                            <div class="flex flex-wrap gap-1 max-w-xs">
                              <template x-for="v in b.board_vase.slice(0, 2)" :key="v.text || v">
                                <span class="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20" x-text="'#' + (v.text || v)"></span>
                              </template>
                              <span x-show="b.board_vase.length > 2" class="px-1.5 py-0.5 rounded-md text-[10px] font-mono text-slate-400 bg-slate-100 dark:bg-slate-800" x-text="'+' + (b.board_vase.length - 2)"></span>
                            </div>
                          </template>
                          <template x-if="!b.board_vase || b.board_vase.length === 0">
                            <span class="text-[10px] text-slate-400 italic">—</span>
                          </template>
                        </td>

                        <!-- Last Activity Column -->
                        <td class="py-3 px-4 text-center font-sans">
                          <span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700" x-text="b.last_pinned_at ? new Date(b.last_pinned_at).toLocaleDateString() : 'Active'"></span>
                        </td>

                        <!-- Action Buttons Column -->
                        <td class="py-3 px-4 text-right font-sans">
                          <div class="inline-flex items-center gap-1.5 justify-end">
                            <button
                              type="button"
                              @click="openBoardPage(b, activeCreator)"
                              class="px-2.5 py-1 rounded-lg border border-purple-500/30 bg-purple-500/10 text-purple-600 dark:text-purple-400 text-[11px] font-bold hover:bg-purple-500/20 transition cursor-pointer"
                              title="Open Dedicated Board Intelligence Page"
                            >
                              <i data-lucide="layout-grid" class="w-3 h-3 inline"></i>
                              <span>Inspect</span>
                            </button>
                            <button
                              type="button"
                              @click="crawlSingleBoardGha(b.name)"
                              class="px-2.5 py-1 rounded-lg border border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400 text-[11px] font-bold hover:bg-sky-500/20 transition cursor-pointer"
                              title="Crawl on GitHub Actions"
                            >
                              <i data-lucide="zap" class="w-3 h-3 inline"></i>
                              <span>Crawl</span>
                            </button>
                          </div>
                        </td>

                      </tr>
                    </template>
                  </tbody>
                </table>
              </div>
            </div>

            <!-- Empty State -->
            <div x-show="!isLoadingBoards && filteredCreatorBoards.length === 0" class="p-12 text-center rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1526]">
              <i data-lucide="folder-search" class="w-12 h-12 mx-auto mb-3 opacity-40 text-purple-500"></i>
              <h4 class="font-bold text-sm text-slate-900 dark:text-white">No boards match your filter</h4>
              <p class="text-xs text-slate-500 mt-1 max-w-sm mx-auto">Try clearing your search keyword, resetting topic filters, or sync public boards from Pinterest.</p>
              <div class="mt-4 flex items-center justify-center gap-2">
                <button type="button" @click="creatorBoardSearch = ''; creatorBoardSelectedTopic = ''; creatorBoardPage = 1" class="px-3 py-1.5 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 transition cursor-pointer">
                  <span>Clear Filters</span>
                </button>
                <button type="button" @click="syncCompetitorBoardsAction(activeCreator)" class="px-3 py-1.5 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white transition cursor-pointer shadow-sm">
                  <span>Sync Boards Now</span>
                </button>
              </div>
            </div>

            <!-- Pagination Bar -->
            <div x-show="!isLoadingBoards && filteredCreatorBoards.length > 0" class="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-200 dark:border-slate-800 pt-4 text-xs text-slate-500">
              <span x-text="'Showing ' + (filteredCreatorBoards.length > 0 ? ((creatorBoardPage - 1) * (creatorBoardPageSize || 12) + 1) : 0) + '-' + Math.min(creatorBoardPage * (creatorBoardPageSize || 12), filteredCreatorBoards.length) + ' of ' + filteredCreatorBoards.length + ' boards'"></span>
              <div class="flex items-center gap-2">
                <button @click="creatorBoardPage = Math.max(1, creatorBoardPage - 1)" :disabled="creatorBoardPage <= 1" class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0b1120] px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 disabled:opacity-40 transition shadow-2xs cursor-pointer">Previous</button>
                <span class="font-bold text-slate-900 dark:text-white font-mono px-1" x-text="'Page ' + creatorBoardPage + ' of ' + Math.max(1, Math.ceil(filteredCreatorBoards.length / (creatorBoardPageSize || 12)))"></span>
                <button @click="creatorBoardPage = creatorBoardPage + 1" :disabled="creatorBoardPage >= Math.ceil(filteredCreatorBoards.length / (creatorBoardPageSize || 12))" class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0b1120] px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 disabled:opacity-40 transition shadow-2xs cursor-pointer">Next</button>
              </div>
            </div>

          </div>

        </div>
      </template>
    </div>

    <!-- ======================================================== -->
    <!-- TAB 5: 🔍 KEYWORD VELOCITY TRACKER                        -->
    <!-- Matches User Image 1 Reference UI                        -->
    <!-- ======================================================== -->
    <div x-show="currentTab === 'keywords'" class="space-y-6">
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div class="flex items-center space-x-3">
          <div class="h-11 w-11 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-500/20">
            <i data-lucide="search" class="w-6 h-6"></i>
          </div>
          <div>
            <div class="flex items-center space-x-2">
              <h2 class="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">Keyword Intelligence & Velocity</h2>
              <span class="px-2 py-0.5 text-[10px] font-bold uppercase rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">SERP Tracker</span>
            </div>
            <p class="text-xs text-slate-500 dark:text-slate-400">Track Pinterest search queries, organic rank positions, and daily save velocity.</p>
          </div>
        </div>
        <div class="flex items-center space-x-2">
          <button @click="isAddKeywordModalOpen = true" class="px-3.5 py-2 text-xs font-bold rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white transition flex items-center space-x-1.5 shadow-sm shadow-emerald-950/20 active:scale-95">
            <i data-lucide="plus" class="w-3.5 h-3.5"></i>
            <span>+ Add Keywords</span>
          </button>
        </div>
      </div>

      <!-- Keywords Table matching Image 1 -->
      <div class="p-4 rounded-2xl bg-white dark:bg-[#0b1120] border border-slate-200/80 dark:border-slate-800 space-y-4 shadow-sm">
        <div class="flex flex-col sm:flex-row items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800/80 pb-3">
          <div class="relative w-full sm:w-72">
            <i data-lucide="search" class="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"></i>
            <input type="text" x-model="keywordSearch" placeholder="Filter tracked keywords..." class="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50">
          </div>
          <span class="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-mono" x-text="filteredKeywords.length + ' Keywords'"></span>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead>
              <tr class="border-b border-slate-200 dark:border-slate-800/80 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <th class="py-3 px-3">Keyword</th>
                <th class="py-3 px-3">Category</th>
                <th class="py-3 px-3">Top Ranked Pin</th>
                <th class="py-3 px-3 text-center">Save Velocity</th>
                <th class="py-3 px-3 text-center">Tracked Pins</th>
                <th class="py-3 px-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60 font-sans">
              <template x-for="kw in filteredKeywords" :key="kw.id">
                <tr class="hover:bg-slate-50/80 dark:hover:bg-slate-900/40 transition">
                  <td class="py-3 px-3">
                    <a :href="'https://www.pinterest.com/search/pins/?q=' + encodeURIComponent(kw.keyword)" target="_blank" class="text-sm font-semibold text-slate-900 dark:text-white hover:text-emerald-600 dark:hover:text-emerald-400 underline decoration-slate-400 dark:decoration-slate-600 hover:decoration-emerald-500 inline-flex items-center space-x-1.5">
                      <span x-text="kw.keyword"></span>
                      <i data-lucide="external-link" class="w-3 h-3 text-slate-400"></i>
                    </a>
                  </td>
                  <td class="py-3 px-3">
                    <span class="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400" x-text="kw.category || 'General'"></span>
                  </td>
                  <td class="py-3 px-3">
                    <div class="flex items-center space-x-2">
                      <template x-if="kw.top_pin_image">
                        <img :src="kw.top_pin_image" class="w-7 h-9 rounded object-cover border border-slate-200 dark:border-slate-700 shadow-xs">
                      </template>
                      <span class="text-xs text-slate-700 dark:text-slate-300 truncate max-w-[180px]" x-text="kw.top_pin_title || 'Pending crawl'"></span>
                    </div>
                  </td>
                  <td class="py-3 px-3 text-center font-mono">
                    <span class="px-2 py-0.5 rounded-full text-[11px] font-bold" :class="Number(kw.avg_daily_velocity || 0) > 0 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'" x-text="(Number(kw.avg_daily_velocity || 0) > 0 ? '+' : '') + formatNumber(kw.avg_daily_velocity || 0) + ' saves/day'"></span>
                  </td>
                  <td class="py-3 px-3 text-center font-mono">
                    <span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300" x-text="(kw.snapshots_count || 0) + ' / ' + (kw.target_pin_count || 50)"></span>
                  </td>
                  <td class="py-3 px-3 text-center">
                    <div class="flex items-center justify-center space-x-1.5">
                      <button @click="openKeywordPins(kw)" class="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition flex items-center space-x-1" title="View tracked SERP pins">
                        <i data-lucide="eye" class="w-3 h-3"></i>
                        <span>Pins</span>
                      </button>
                      <button @click="syncKeyword(kw.id)" class="px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition flex items-center space-x-1" title="Sync SERP now">
                        <i data-lucide="refresh-cw" class="w-3 h-3"></i>
                        <span>Sync</span>
                      </button>
                      <button @click="deleteKeyword(kw.id)" class="p-1 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-950/40 text-slate-400 hover:text-rose-500 transition" title="Delete keyword">
                        <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ======================================================== -->
    <!-- TAB 6: ⚡ NEON MULTI-PROJECT FLEET MANAGER (ENTERPRISE UX) -->
    <!-- 100 Serverless Projects & 100 GB Pooled Storage           -->
    <!-- ======================================================== -->
    <div x-show="currentTab === 'fleet'" class="space-y-6">
      
      <!-- Top Fleet Header -->
      <div class="flex flex-col xl:flex-row xl:items-center justify-between gap-4 p-5 rounded-3xl bg-gradient-to-br from-white via-slate-50 to-cyan-50/20 dark:from-[#0b1120] dark:via-[#090d18] dark:to-cyan-950/10 border border-slate-200/90 dark:border-slate-800 shadow-sm">
        <div class="flex items-start sm:items-center space-x-3.5">
          <div class="h-12 w-12 rounded-2xl bg-gradient-to-tr from-cyan-600 to-blue-500 text-white flex items-center justify-center shadow-md shadow-cyan-500/20 shrink-0">
            <i data-lucide="server" class="w-6 h-6"></i>
          </div>
          <div class="space-y-1">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white">Neon Multi-Project Fleet Manager</h2>
              <span class="px-2.5 py-0.5 text-[10px] font-bold uppercase rounded-full bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30">100 Compute Nodes</span>
              <span class="px-2.5 py-0.5 text-[10px] font-bold rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">Free Plan ($0/mo)</span>
            </div>
            <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
              <span class="inline-flex items-center gap-1.5 font-mono">
                <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>Org: <strong class="text-slate-700 dark:text-slate-200">pin-arbitrage-engine</strong></span>
                <span class="text-slate-300 dark:text-slate-700">•</span>
                <span class="text-cyan-600 dark:text-cyan-400 font-bold hover:underline cursor-pointer" title="Click to copy Org ID" @click="navigator.clipboard.writeText('org-bold-king-11968123'); showToast('Copied Org ID: org-bold-king-11968123')">org-bold-king-11968123</span>
              </span>
              <span class="text-slate-300 dark:text-slate-700 hidden sm:inline">•</span>
              <span>100 GB NVMe Storage (1 GB/Node) • 10,000 CU-Hours • Scale-to-Zero</span>
            </div>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="flex flex-wrap items-center gap-2">
          <button @click="pingFleetBatchAction()" :disabled="isPingingAllFleet" class="px-3.5 py-2 text-xs font-bold rounded-xl border border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 transition flex items-center space-x-1.5 shadow-2xs active:scale-95 disabled:opacity-50 cursor-pointer" title="Test network response time across a sample of Neon projects">
            <i data-lucide="zap" class="w-3.5 h-3.5 text-purple-500" :class="isPingingAllFleet ? 'animate-bounce' : ''"></i>
            <span x-text="isPingingAllFleet ? 'Pinging Sample...' : (fleetPingSummary ? '⚡ Latency: ' + fleetPingSummary.avg_ms + 'ms' : '⚡ Health Check')"></span>
          </button>
          <button @click="syncAllFleetDatabasesAction()" :disabled="isSyncingFleet" class="px-3.5 py-2 text-xs font-bold rounded-xl border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 transition flex items-center space-x-1.5 shadow-2xs active:scale-95 disabled:opacity-50 cursor-pointer" title="Synchronize all competitor profiles & boards from Hub across all 99 Neon shard databases">
            <i data-lucide="refresh-cw" class="w-3.5 h-3.5 text-cyan-500" :class="isSyncingFleet ? 'animate-spin' : ''"></i>
            <span x-text="isSyncingFleet ? 'Syncing Fleet...' : '🔄 Sync Fleet (100 DBs)'"></span>
          </button>
          <button @click="isAddFleetModalOpen = true" class="px-3.5 py-2 text-xs font-bold rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white transition flex items-center space-x-1.5 shadow-sm shadow-cyan-950/20 active:scale-95 cursor-pointer">
            <i data-lucide="plus" class="w-3.5 h-3.5"></i>
            <span>+ Add Project</span>
          </button>
        </div>
      </div>

      <!-- Fleet KPI Cards -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <!-- Card 1: Registered Nodes -->
        <div class="p-5 rounded-2xl bg-white dark:bg-[#0b1120] border border-slate-200/80 dark:border-slate-800 shadow-sm relative overflow-hidden group hover:border-cyan-500/40 transition">
          <div class="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider">
            <span>REGISTERED NODES</span>
            <div class="p-2 rounded-xl bg-cyan-500/10 text-cyan-500">
              <i data-lucide="layers" class="w-4 h-4"></i>
            </div>
          </div>
          <div class="mt-3 flex items-baseline space-x-2">
            <span class="text-3xl font-extrabold text-cyan-600 dark:text-cyan-400 font-mono" x-text="fleetProjects.length"></span>
            <span class="text-xs text-slate-400 font-mono">/ 100 Capacity</span>
          </div>
          <div class="mt-2.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div class="bg-gradient-to-r from-cyan-500 to-blue-500 h-1.5 rounded-full" :style="'width: ' + Math.min(100, (fleetProjects.length || 100)) + '%'"></div>
          </div>
          <div class="mt-3 flex items-center justify-between text-[11px] text-slate-500">
            <span>1 Hub Master • 99 Shards</span>
            <span class="font-bold text-emerald-600 dark:text-emerald-400">100% Free Quota</span>
          </div>
        </div>

        <!-- Card 2: Pooled NVMe Storage -->
        <div class="p-5 rounded-2xl bg-white dark:bg-[#0b1120] border border-slate-200/80 dark:border-slate-800 shadow-sm relative overflow-hidden group hover:border-emerald-500/40 transition">
          <div class="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider">
            <span>TOTAL POOLED STORAGE</span>
            <div class="p-2 rounded-xl bg-emerald-500/10 text-emerald-500">
              <i data-lucide="hard-drive" class="w-4 h-4"></i>
            </div>
          </div>
          <div class="mt-3 flex items-baseline space-x-2">
            <span class="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 font-mono" x-text="(fleetProjects.length * 1.0) + ' GB'"></span>
            <span class="text-xs text-slate-400 font-mono">NVMe</span>
          </div>
          <div class="mt-2.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div class="bg-gradient-to-r from-emerald-500 to-teal-400 h-1.5 rounded-full" style="width: 100%"></div>
          </div>
          <div class="mt-3 flex items-center justify-between text-[11px] text-slate-500">
            <span>1 GB per isolated project</span>
            <span class="font-bold text-cyan-600 dark:text-cyan-400">0% Bloat</span>
          </div>
        </div>

        <!-- Card 3: Compute Budget -->
        <div class="p-5 rounded-2xl bg-white dark:bg-[#0b1120] border border-slate-200/80 dark:border-slate-800 shadow-sm relative overflow-hidden group hover:border-purple-500/40 transition">
          <div class="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider">
            <span>COMPUTE CAPACITY</span>
            <div class="p-2 rounded-xl bg-purple-500/10 text-purple-500">
              <i data-lucide="cpu" class="w-4 h-4"></i>
            </div>
          </div>
          <div class="mt-3 flex items-baseline space-x-2">
            <span class="text-3xl font-extrabold text-purple-600 dark:text-purple-400 font-mono" x-text="formatNumber(fleetProjects.length * 100) + ' hrs'"></span>
            <span class="text-xs text-slate-400 font-mono">/ mo</span>
          </div>
          <div class="mt-2.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div class="bg-gradient-to-r from-purple-500 to-indigo-500 h-1.5 rounded-full" style="width: 100%"></div>
          </div>
          <div class="mt-3 flex items-center justify-between text-[11px] text-slate-500">
            <span>Autoscales up to 2 CU</span>
            <span class="font-bold text-purple-600 dark:text-purple-400">Scale-to-Zero (0 CU)</span>
          </div>
        </div>

        <!-- Card 4: Architecture & Topology -->
        <div class="p-5 rounded-2xl bg-white dark:bg-[#0b1120] border border-slate-200/80 dark:border-slate-800 shadow-sm relative overflow-hidden group hover:border-rose-500/40 transition">
          <div class="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider">
            <span>TOPOLOGY & ISOLATION</span>
            <div class="p-2 rounded-xl bg-rose-500/10 text-rose-500">
              <i data-lucide="shield-check" class="w-4 h-4"></i>
            </div>
          </div>
          <div class="mt-3 flex items-baseline space-x-2">
            <span class="text-2xl font-extrabold text-rose-600 dark:text-rose-400 font-mono">Hub & Spoke</span>
          </div>
          <div class="mt-2.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div class="bg-gradient-to-r from-rose-500 to-amber-500 h-1.5 rounded-full" style="width: 100%"></div>
          </div>
          <div class="mt-3 flex items-center justify-between text-[11px] text-slate-500">
            <span>AWS us-east-2 (Ohio)</span>
            <span class="font-bold text-emerald-600 dark:text-emerald-400">Zero-Bleed Tenants</span>
          </div>
        </div>
      </div>

      <!-- Fleet Projects Table Container -->
      <div class="p-5 rounded-3xl bg-white dark:bg-[#0b1120] border border-slate-200/80 dark:border-slate-800 space-y-4 shadow-sm">
        
        <!-- Controls Toolbar: Search, Filter Tabs, and View Options -->
        <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800/80">
          
          <!-- Search & Filter Tabs -->
          <div class="flex flex-wrap items-center gap-2.5 flex-1">
            <!-- Search Input -->
            <div class="relative min-w-[240px] max-w-sm flex-1">
              <i data-lucide="search" class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
              <input type="text" x-model="fleetSearch" @input="fleetPage = 1" placeholder="Search project name, ID, region, or host..." class="w-full pl-9 pr-8 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 text-slate-900 dark:text-white">
              <button x-show="fleetSearch" @click="fleetSearch = ''; fleetPage = 1" class="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer">
                <i data-lucide="x" class="w-3.5 h-3.5"></i>
              </button>
            </div>

            <!-- Role Segmented Tabs -->
            <div class="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-xs">
              <button type="button" @click="fleetRoleFilter = 'all'; fleetPage = 1" class="px-2.5 py-1 rounded-lg font-bold transition cursor-pointer" :class="fleetRoleFilter === 'all' ? 'bg-white dark:bg-[#0f172a] text-cyan-600 dark:text-cyan-400 shadow-xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'">
                All (<span x-text="fleetProjects.length"></span>)
              </button>
              <button type="button" @click="fleetRoleFilter = 'hub'; fleetPage = 1" class="px-2.5 py-1 rounded-lg font-bold transition cursor-pointer" :class="fleetRoleFilter === 'hub' ? 'bg-white dark:bg-[#0f172a] text-amber-600 dark:text-amber-400 shadow-xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'">
                👑 Hub (1)
              </button>
              <button type="button" @click="fleetRoleFilter = 'shard'; fleetPage = 1" class="px-2.5 py-1 rounded-lg font-bold transition cursor-pointer" :class="fleetRoleFilter === 'shard' ? 'bg-white dark:bg-[#0f172a] text-cyan-600 dark:text-cyan-400 shadow-xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'">
                📦 Shards (<span x-text="Math.max(0, fleetProjects.length - 1)"></span>)
              </button>
            </div>
          </div>

          <!-- Pagination & Page Size -->
          <div class="flex items-center space-x-2 shrink-0 text-xs">
            <span class="text-slate-400 text-[11px] font-mono hidden sm:inline" x-text="'Showing ' + (filteredFleetProjects.length > 0 ? ((fleetPage - 1) * fleetPageSize + 1) : 0) + '-' + Math.min(fleetPage * fleetPageSize, filteredFleetProjects.length) + ' of ' + filteredFleetProjects.length"></span>
            
            <select x-model="fleetPageSize" @change="fleetPage = 1" class="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-300 font-mono outline-none cursor-pointer">
              <option :value="15">15 / page</option>
              <option :value="25">25 / page</option>
              <option :value="50">50 / page</option>
              <option :value="100">All 100</option>
            </select>

            <button type="button" @click="if (fleetPage > 1) fleetPage--" :disabled="fleetPage <= 1" class="p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 disabled:opacity-40 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer" title="Previous Page">
              <i data-lucide="chevron-left" class="w-4 h-4"></i>
            </button>
            <span class="font-mono text-xs font-bold text-slate-700 dark:text-slate-300 px-1" x-text="fleetPage + ' / ' + fleetTotalPages"></span>
            <button type="button" @click="if (fleetPage < fleetTotalPages) fleetPage++" :disabled="fleetPage >= fleetTotalPages" class="p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 disabled:opacity-40 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer" title="Next Page">
              <i data-lucide="chevron-right" class="w-4 h-4"></i>
            </button>
          </div>
        </div>

        <!-- The Fixed Table -->
        <div class="overflow-x-auto rounded-2xl border border-slate-200/80 dark:border-slate-800/80">
          <table class="w-full text-left text-xs border-collapse">
            <thead>
              <tr class="bg-slate-50/80 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <th class="py-3 px-3.5 whitespace-nowrap min-w-[110px]">Role</th>
                <th class="py-3 px-3.5 whitespace-nowrap min-w-[170px]">Project Name</th>
                <th class="py-3 px-3.5 whitespace-nowrap min-w-[170px]">Project ID</th>
                <th class="py-3 px-3.5 whitespace-nowrap min-w-[110px]">Region</th>
                <th class="py-3 px-3.5 whitespace-nowrap min-w-[95px]">Status</th>
                <th class="py-3 px-3.5 whitespace-nowrap min-w-[210px]">Synced Inventory</th>
                <th class="py-3 px-3.5 whitespace-nowrap min-w-[220px]">Connection Endpoint</th>
                <th class="py-3 px-3.5 whitespace-nowrap min-w-[140px] text-center">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60">
              <template x-for="p in paginatedFleetProjects" :key="p.id">
                <tr class="hover:bg-slate-50/80 dark:hover:bg-slate-900/40 transition">
                  <!-- Role -->
                  <td class="py-3 px-3.5 whitespace-nowrap">
                    <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase font-mono" :class="p.is_hub ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700'">
                      <span x-text="p.is_hub ? '👑 HUB MASTER' : '📦 SHARD'"></span>
                    </span>
                  </td>

                  <!-- Project Name -->
                  <td class="py-3 px-3.5 font-sans whitespace-nowrap">
                    <div class="font-bold text-slate-900 dark:text-white" x-text="p.project_name"></div>
                    <div class="text-[10px] text-slate-400 font-mono" x-text="p.is_hub ? 'Primary Ingestion Cluster' : 'Partition ' + (p.id ? '#' + p.id : '')"></div>
                  </td>

                  <!-- Project ID -->
                  <td class="py-3 px-3.5 whitespace-nowrap font-mono text-[11px] text-slate-600 dark:text-slate-400">
                    <button type="button" @click="navigator.clipboard.writeText(p.project_id); showToast('Copied project ID: ' + p.project_id)" class="inline-flex items-center gap-1.5 hover:text-cyan-500 transition cursor-pointer group" :title="'Click to copy project ID: ' + p.project_id">
                      <span class="font-mono" x-text="p.project_id"></span>
                      <i data-lucide="copy" class="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 transition"></i>
                    </button>
                  </td>

                  <!-- Region -->
                  <td class="py-3 px-3.5 whitespace-nowrap font-mono text-[11px] text-slate-600 dark:text-slate-400">
                    <span class="inline-flex items-center gap-1">
                      <i data-lucide="globe" class="w-3 h-3 text-cyan-500 shrink-0"></i>
                      <span x-text="p.region_id || 'aws-us-east-2'"></span>
                    </span>
                  </td>

                  <!-- Status (Fixed: No broken wrapping!) -->
                  <td class="py-3 px-3.5 whitespace-nowrap">
                    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                      <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                      <span class="capitalize" x-text="p.status || 'Active'"></span>
                    </span>
                  </td>

                  <!-- Synced Inventory -->
                  <td class="py-3 px-3.5 whitespace-nowrap">
                    <div class="flex items-center gap-1.5">
                      <span title="Tracked Creators" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-mono font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                        <i data-lucide="users" class="w-2.5 h-2.5"></i>
                        <span x-text="(p.stats?.competitors ?? 0) + 'c'"></span>
                      </span>
                      <span title="Thematic Boards" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-mono font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                        <i data-lucide="layout-grid" class="w-2.5 h-2.5"></i>
                        <span x-text="(p.stats?.boards ?? 0) + 'b'"></span>
                      </span>
                      <span title="Winning Pins" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-mono font-bold bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20">
                        <i data-lucide="pin" class="w-2.5 h-2.5"></i>
                        <span x-text="(p.stats?.pins ?? 0) + 'p'"></span>
                      </span>
                    </div>
                  </td>

                  <!-- Connection Endpoint (Fixed: Sleek pill, No 120-char stretch!) -->
                  <td class="py-3 px-3.5 whitespace-nowrap">
                    <div class="flex items-center space-x-1.5">
                      <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] font-mono text-slate-600 dark:text-slate-400 max-w-[210px]" :title="p.masked_url">
                        <i data-lucide="shield-check" class="w-3 h-3 text-emerald-500 shrink-0"></i>
                        <span class="truncate font-mono" x-text="formatFleetHost(p.masked_url)"></span>
                      </div>
                      <button type="button" @click="copyFleetUrl(p)" class="px-2 py-1 rounded-lg text-[10.5px] font-bold bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20 transition flex items-center gap-1 cursor-pointer shrink-0" title="Copy full connection string">
                        <i data-lucide="copy" class="w-3 h-3"></i>
                        <span x-text="copiedField === 'url-' + p.id ? 'Copied!' : 'Copy'"></span>
                      </button>
                    </div>
                  </td>

                  <!-- Actions -->
                  <td class="py-3 px-3.5 whitespace-nowrap text-center">
                    <div class="inline-flex items-center space-x-1.5">
                      <button @click="pingFleetShard(p)" :disabled="pingingProjectId === p.project_id" class="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-[10px] font-sans font-semibold transition flex items-center space-x-1 cursor-pointer border border-slate-200 dark:border-slate-700 active:scale-95" title="Test serverless roundtrip latency">
                        <template x-if="pingingProjectId === p.project_id">
                          <span class="text-purple-600 dark:text-purple-400 flex items-center gap-1 font-mono">
                            <span class="w-2 h-2 rounded-full bg-purple-500 animate-ping"></span> Ping...
                          </span>
                        </template>
                        <template x-if="pingingProjectId !== p.project_id">
                          <span>
                            <span x-show="!p.ping_latency">Test Ping</span>
                            <span x-show="p.ping_latency" class="font-mono text-emerald-600 dark:text-emerald-400 font-bold" x-text="'⚡ ' + p.ping_latency + 'ms'"></span>
                          </span>
                        </template>
                      </button>
                      <button type="button" @click="inspectFleetNode(p)" class="p-1 rounded-lg text-slate-400 hover:text-cyan-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer" title="Inspect Node Configuration">
                        <i data-lucide="info" class="w-3.5 h-3.5"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              </template>

              <!-- Empty State -->
              <tr x-show="filteredFleetProjects.length === 0">
                <td colspan="8" class="py-8 text-center text-slate-500 text-xs">
                  <div class="flex flex-col items-center justify-center space-y-2">
                    <i data-lucide="filter-x" class="w-8 h-8 text-slate-400"></i>
                    <p class="font-bold">No projects match your search filter</p>
                    <button type="button" @click="fleetSearch = ''; fleetRoleFilter = 'all'; fleetPage = 1" class="text-xs text-cyan-600 dark:text-cyan-400 underline font-semibold cursor-pointer">Reset all filters</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

      </div>

    </div>
    </div> <!-- Close !activePinId wrapper -->

  </main>

  <!-- ======================================================== -->
  <!-- FULL IMAGE LIGHTBOX MODAL (تكبير وتصفح الصور بالأسهم)    -->
  <!-- ======================================================== -->
  <div x-show="isLightboxOpen" x-cloak 
       class="fixed inset-0 z-[70] bg-slate-950/90 backdrop-blur-md flex flex-col justify-between p-4 sm:p-6"
       @keydown.escape.window="closeLightbox()"
       @keydown.arrow-left.window="if (isLightboxOpen) prevLightboxImage()"
       @keydown.arrow-right.window="if (isLightboxOpen) nextLightboxImage()">
    
    <!-- Lightbox Top Navigation Bar -->
    <div class="flex items-center justify-between text-white border-b border-slate-800/80 pb-3 max-w-5xl w-full mx-auto">
      <div class="flex items-center space-x-3">
        <span class="px-2.5 py-1 rounded-md text-[10px] font-mono font-bold uppercase bg-purple-600/30 text-purple-300 border border-purple-500/40">
          EXPLORE ARTICLE CAPSULE
        </span>
        <span class="text-xs font-mono text-slate-400" x-text="'صورة ' + (lightboxIndex + 1) + ' من ' + (dossierGuidedCapsules ? dossierGuidedCapsules.length : 0)"></span>
      </div>

      <button @click="closeLightbox()" class="text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-slate-800 transition flex items-center space-x-1.5 font-mono text-xs">
        <span class="hidden sm:inline text-slate-500 text-[11px]">(ESC)</span>
        <i data-lucide="x" class="w-5 h-5"></i>
      </button>
    </div>

    <!-- Lightbox Center: Image with Prev/Next Navigation Buttons -->
    <div class="relative flex items-center justify-center flex-1 my-4 max-w-5xl w-full mx-auto overflow-hidden">
      <!-- Previous Button -->
      <button @click="prevLightboxImage()" 
              x-show="dossierGuidedCapsules && dossierGuidedCapsules.length > 1"
              class="absolute left-2 sm:left-4 z-10 p-3 rounded-full bg-slate-900/80 hover:bg-slate-800 text-white border border-slate-700/60 shadow-2xl transition active:scale-95 group"
              title="الصورة السابقة (Arrow Left)">
        <i data-lucide="chevron-left" class="w-6 h-6 group-hover:-translate-x-0.5 transition-transform"></i>
      </button>

      <!-- The Active Full-Size Image -->
      <template x-if="currentLightboxCapsule && currentLightboxCapsule.image_url">
        <img :src="currentLightboxCapsule.image_url" 
             :alt="currentLightboxCapsule.query_term" 
             class="max-h-[70vh] sm:max-h-[75vh] max-w-full object-contain rounded-2xl shadow-2xl border border-slate-800 transition-all duration-300">
      </template>

      <!-- Next Button -->
      <button @click="nextLightboxImage()" 
              x-show="dossierGuidedCapsules && dossierGuidedCapsules.length > 1"
              class="absolute right-2 sm:right-4 z-10 p-3 rounded-full bg-slate-900/80 hover:bg-slate-800 text-white border border-slate-700/60 shadow-2xl transition active:scale-95 group"
              title="الصورة التالية (Arrow Right)">
        <i data-lucide="chevron-right" class="w-6 h-6 group-hover:translate-x-0.5 transition-transform"></i>
      </button>
    </div>

    <!-- Lightbox Footer Info & Actions -->
    <div class="max-w-5xl w-full mx-auto bg-slate-900/90 border border-slate-800 rounded-2xl p-4 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xl">
      <div class="space-y-1">
        <h4 class="text-base font-bold text-white tracking-wide flex items-center space-x-2">
          <i data-lucide="compass" class="w-4 h-4 text-purple-400"></i>
          <span x-text="currentLightboxCapsule?.query_term"></span>
        </h4>
        <p class="text-xs text-slate-400 font-mono">
          <span>Seed Pin ID:</span>
          <span class="text-purple-300 font-bold" x-text="activeDossierSeed?.pin_id"></span>
        </p>
      </div>

      <div class="flex items-center space-x-2">
        <button @click="copyGuidedPrompt(currentLightboxCapsule?.query_term)" class="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs font-mono transition active:scale-95 flex items-center space-x-1.5 shadow-md">
          <i data-lucide="copy" class="w-3.5 h-3.5"></i>
          <span>Copy Midjourney Prompt</span>
        </button>
        <a :href="currentLightboxCapsule?.search_url || ('https://www.pinterest.com/search/pins/?q=' + encodeURIComponent(currentLightboxCapsule?.query_term || ''))" target="_blank" class="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono transition flex items-center space-x-1.5 border border-slate-700" title="Open Pinterest Search">
          <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
          <span>Pinterest Search</span>
        </a>
      </div>
    </div>

  </div>

  <!-- ======================================================== -->
  <!-- CANDIDATE DEEP-INSPECTION SLIDE-OVER & MENU MATRIX       -->
  <!-- ======================================================== -->
  <div x-show="isDossierOpen" x-cloak class="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-md flex justify-end" @keydown.escape.window="isDossierOpen = false">
    <div class="bg-white dark:bg-[#0b1120] border-l border-slate-200 dark:border-slate-800 w-full max-w-2xl h-full min-h-screen shadow-2xl overflow-y-auto p-6 space-y-6 animate-in slide-in-from-right duration-200" @click.away="isDossierOpen = false">
      
      <!-- Slide-over Header -->
      <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
        <div class="flex items-center space-x-3">
          <div class="w-8 h-8 rounded-lg bg-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center">
            <i data-lucide="eye" class="w-4 h-4"></i>
          </div>
          <div>
            <h3 class="font-bold text-slate-900 dark:text-white text-base">Candidate Pin Deep-Inspection Dossier</h3>
            <p class="text-xs text-slate-500 dark:text-slate-400 font-mono" x-text="'Pin ID: ' + selectedCandidate?.candidate_pin_id"></p>
          </div>
        </div>
        <button @click="isDossierOpen = false" class="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition">
          <i data-lucide="x" class="w-5 h-5"></i>
        </button>
      </div>

      <!-- Pin Visual Dossier -->
      <div class="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 space-y-3">
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-start space-x-3.5">
            <template x-if="selectedCandidate?.image_url">
              <a :href="'https://www.pinterest.com/pin/' + selectedCandidate?.candidate_pin_id + '/'" target="_blank" class="block relative flex-shrink-0 group/modal">
                <img :src="selectedCandidate.image_url" alt="Pin thumbnail" class="w-14 h-20 rounded-xl object-cover border shadow-md group-hover/modal:scale-110 transition-transform duration-200" :style="'border-color: ' + (selectedCandidate?.winning_color || selectedCandidate?.dominant_color || '#cbd5e1')">
              </a>
            </template>
            <div class="space-y-1">
              <span class="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">Inspected Title</span>
              <div class="text-sm font-bold text-slate-900 dark:text-white" x-text="selectedCandidate?.title"></div>
              <div class="text-[11px] font-mono text-slate-500 flex items-center space-x-2 pt-0.5 flex-wrap gap-y-1">
                <span x-text="selectedCandidate?.domain"></span>
                <span>•</span>
                <span class="text-rose-500 font-bold" x-text="Number(selectedCandidate?.total_saves || selectedCandidate?.saves || 0).toLocaleString() + ' Saves'"></span>
                <template x-if="selectedCandidate?.ingestion_method && selectedCandidate?.ingestion_method !== 'uploaded'">
                  <span>•</span>
                  <span class="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300" x-text="selectedCandidate.ingestion_method === 'csv_importer' ? '⚙️ CSV Farm' : (selectedCandidate.ingestion_method === 'pin_scheduling' ? '⏱️ Scheduled' : selectedCandidate.ingestion_method)"></span>
                </template>
              </div>
            </div>
          </div>
          <div class="flex items-center space-x-2 p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex-shrink-0">
            <span class="w-6 h-6 rounded-md border" :style="'background-color: ' + (selectedCandidate?.winning_color || selectedCandidate?.dominant_color || '#888888')"></span>
            <div class="text-[10px] font-mono">
              <div class="font-bold" x-text="selectedCandidate?.winning_color || selectedCandidate?.dominant_color"></div>
              <div class="text-slate-400 text-[9px]" x-text="selectedCandidate?.culinary_color_name"></div>
            </div>
          </div>
        </div>

        <template x-if="selectedCandidate?.ocr_text">
          <div class="p-2.5 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono">
            <div class="text-[10px] text-rose-500 font-bold">Pinterest Vision Model OCR Text:</div>
            <div class="text-slate-700 dark:text-slate-300 text-[11px] mt-0.5" x-text="selectedCandidate?.ocr_text"></div>
          </div>
        </template>
      </div>

      <!-- MODULE 3: Audience Pairing & Menu Matrix -->
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold uppercase font-mono tracking-wider text-slate-900 dark:text-white flex items-center space-x-1.5">
            <i data-lucide="utensils" class="w-3.5 h-3.5 text-amber-500"></i>
            <span>Module 3: Audience Pairing & Menu Matrix</span>
          </span>
          <span class="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            RecGPT Trajectory
          </span>
        </div>
        <p class="text-[11px] text-slate-500 dark:text-slate-400">
          Pinterest's sequential transformer predicts transition probabilities. Expand audience retention across these 3 cluster-derived moments:
        </p>

        <!-- 3 Trajectory Dish Cards (Dynamic per Candidate X) -->
        <div class="space-y-2.5">
          <!-- 1. Dinner Anchor -->
          <div class="p-3.5 rounded-xl border space-y-2 transition" :class="candidateTrajectory.anchor?.is_active_candidate ? 'border-rose-500 bg-rose-500/[0.06] shadow-sm' : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60'">
            <div class="flex items-center justify-between">
              <div class="flex items-center space-x-2">
                <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30">
                  1. Dinner Anchor (Primary Entree)
                </span>
                <template x-if="candidateTrajectory.anchor?.is_active_candidate">
                  <span class="px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 flex items-center space-x-1">
                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                    <span>Active Inspected Pin</span>
                  </span>
                </template>
                <template x-if="!candidateTrajectory.anchor?.is_active_candidate">
                  <span class="px-1.5 py-0.2 rounded text-[9px] font-mono text-slate-400 border border-slate-200 dark:border-slate-800">Cluster Pair</span>
                </template>
              </div>
              <span class="text-[11px] font-mono text-slate-400" x-text="'Prep: ' + (candidateTrajectory.anchor?.prep_time || '15m')"></span>
            </div>
            <div class="font-bold text-slate-900 dark:text-white text-xs" x-text="candidateTrajectory.anchor?.title || 'Dinner Anchor'"></div>
            <div class="flex items-center justify-between pt-1">
              <div class="flex items-center space-x-3 text-[11px] font-mono text-slate-500">
                <span>Save Rate: <strong class="text-emerald-600" x-text="(candidateTrajectory.anchor?.save_rate || candidateTrajectory.anchor?.avg_save_rate || 94.2) + '%'"></strong></span>
                <span>Affinity: <strong class="text-slate-700 dark:text-slate-300" x-text="(candidateTrajectory.anchor?.recgpt_transition_score || 98.5)"></strong></span>
                <template x-if="candidateTrajectory.anchor?.daily_velocity">
                  <span>Velocity: <strong class="text-rose-600 dark:text-rose-400" x-text="'⚡ ' + candidateTrajectory.anchor?.daily_velocity + '/d'"></strong></span>
                </template>
              </div>
              <button @click="copyPromptForPairing(candidateTrajectory.anchor?.title || 'Dinner Anchor')" class="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-[10px] transition active:scale-95 flex items-center space-x-1">
                <i data-lucide="zap" class="w-3 h-3"></i>
                <span>Generate Pin Asset</span>
              </button>
            </div>
          </div>

          <!-- 2. Navboost Co-visitor -->
          <div class="p-3.5 rounded-xl border space-y-2 transition" :class="candidateTrajectory.co_visitor?.is_active_candidate ? 'border-sky-500 bg-sky-500/[0.06] shadow-sm' : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60'">
            <div class="flex items-center justify-between">
              <div class="flex items-center space-x-2">
                <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30">
                  2. Navboost Co-visitor (Complementary Side)
                </span>
                <template x-if="candidateTrajectory.co_visitor?.is_active_candidate">
                  <span class="px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 flex items-center space-x-1">
                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                    <span>Active Inspected Pin</span>
                  </span>
                </template>
                <template x-if="!candidateTrajectory.co_visitor?.is_active_candidate">
                  <span class="px-1.5 py-0.2 rounded text-[9px] font-mono text-slate-400 border border-slate-200 dark:border-slate-800">Cluster Pair</span>
                </template>
              </div>
              <span class="text-[11px] font-mono text-slate-400" x-text="'Prep: ' + (candidateTrajectory.co_visitor?.prep_time || '20m')"></span>
            </div>
            <div class="font-bold text-slate-900 dark:text-white text-xs" x-text="candidateTrajectory.co_visitor?.title || 'Navboost Side'"></div>
            <div class="flex items-center justify-between pt-1">
              <div class="flex items-center space-x-3 text-[11px] font-mono text-slate-500">
                <span>Save Rate: <strong class="text-emerald-600" x-text="(candidateTrajectory.co_visitor?.save_rate || candidateTrajectory.co_visitor?.avg_save_rate || 88.7) + '%'"></strong></span>
                <span>Affinity: <strong class="text-slate-700 dark:text-slate-300" x-text="(candidateTrajectory.co_visitor?.recgpt_transition_score || 92.1)"></strong></span>
                <template x-if="candidateTrajectory.co_visitor?.daily_velocity">
                  <span>Velocity: <strong class="text-sky-600 dark:text-sky-400" x-text="'⚡ ' + candidateTrajectory.co_visitor?.daily_velocity + '/d'"></strong></span>
                </template>
              </div>
              <button @click="copyPromptForPairing(candidateTrajectory.co_visitor?.title || 'Navboost Side')" class="px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-semibold text-[10px] transition active:scale-95 flex items-center space-x-1">
                <i data-lucide="zap" class="w-3 h-3"></i>
                <span>Generate Pin Asset</span>
              </button>
            </div>
          </div>

          <!-- 3. Session Finisher -->
          <div class="p-3.5 rounded-xl border space-y-2 transition" :class="candidateTrajectory.finisher?.is_active_candidate ? 'border-amber-500 bg-amber-500/[0.06] shadow-sm' : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60'">
            <div class="flex items-center justify-between">
              <div class="flex items-center space-x-2">
                <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                  3. Session Finisher (Board Saver Dessert)
                </span>
                <template x-if="candidateTrajectory.finisher?.is_active_candidate">
                  <span class="px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 flex items-center space-x-1">
                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                    <span>Active Inspected Pin</span>
                  </span>
                </template>
                <template x-if="!candidateTrajectory.finisher?.is_active_candidate">
                  <span class="px-1.5 py-0.2 rounded text-[9px] font-mono text-slate-400 border border-slate-200 dark:border-slate-800">Cluster Pair</span>
                </template>
              </div>
              <span class="text-[11px] font-mono text-slate-400" x-text="'Prep: ' + (candidateTrajectory.finisher?.prep_time || '10m')"></span>
            </div>
            <div class="font-bold text-slate-900 dark:text-white text-xs" x-text="candidateTrajectory.finisher?.title || 'Session Finisher'"></div>
            <div class="flex items-center justify-between pt-1">
              <div class="flex items-center space-x-3 text-[11px] font-mono text-slate-500">
                <span>Save Rate: <strong class="text-emerald-600" x-text="(candidateTrajectory.finisher?.save_rate || candidateTrajectory.finisher?.avg_save_rate || 96.8) + '%'"></strong></span>
                <span>Affinity: <strong class="text-slate-700 dark:text-slate-300" x-text="(candidateTrajectory.finisher?.recgpt_transition_score || 97.4)"></strong></span>
                <template x-if="candidateTrajectory.finisher?.daily_velocity">
                  <span>Velocity: <strong class="text-amber-600 dark:text-amber-400" x-text="'⚡ ' + candidateTrajectory.finisher?.daily_velocity + '/d'"></strong></span>
                </template>
              </div>
              <button @click="copyPromptForPairing(candidateTrajectory.finisher?.title || 'Session Finisher')" class="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold text-[10px] transition active:scale-95 flex items-center space-x-1">
                <i data-lucide="zap" class="w-3 h-3"></i>
                <span>Generate Pin Asset</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Actionable Production Blueprint Studio -->
      <div class="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold uppercase font-mono tracking-wider text-slate-900 dark:text-white flex items-center space-x-1.5">
            <i data-lucide="file-code" class="w-3.5 h-3.5 text-rose-500"></i>
            <span>Production Blueprint Studio ($1.99 Digital Asset)</span>
          </span>
          <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            99.4% dHash Unique
          </span>
        </div>

        <!-- 1. SEO Title -->
        <div class="space-y-1">
          <div class="flex items-center justify-between text-[11px]">
            <span class="font-semibold text-slate-600 dark:text-slate-400">Algorithmic SEO Title</span>
            <button @click="copyToClipboard(blueprintSeoTitle, 'seo')" class="text-rose-600 hover:underline font-mono">
              <span x-text="copiedField === 'seo' ? 'Copied!' : 'Copy'"></span>
            </button>
          </div>
          <div class="p-2.5 rounded-lg bg-slate-100 dark:bg-black/50 border border-slate-200 dark:border-slate-800 font-mono text-xs text-slate-800 dark:text-slate-200" x-text="blueprintSeoTitle"></div>
        </div>

        <!-- 2. Midjourney Prompt -->
        <div class="space-y-1">
          <div class="flex items-center justify-between text-[11px]">
            <span class="font-semibold text-slate-600 dark:text-slate-400">Midjourney v6.1 Generation Prompt (--ar 9:16)</span>
            <button @click="copyToClipboard(blueprintMidjourney, 'midjourney')" class="text-amber-600 hover:underline font-mono">
              <span x-text="copiedField === 'midjourney' ? 'Copied!' : 'Copy'"></span>
            </button>
          </div>
          <div class="p-2.5 rounded-lg bg-slate-100 dark:bg-black/50 border border-slate-200 dark:border-slate-800 font-mono text-[11px] leading-relaxed text-slate-700 dark:text-slate-300" x-text="blueprintMidjourney"></div>
        </div>

        <!-- 3. Dual JSON-LD Schema -->
        <div class="space-y-1">
          <div class="flex items-center justify-between text-[11px]">
            <span class="font-semibold text-slate-600 dark:text-slate-400">Dual JSON-LD Schema (Product + Recipe)</span>
            <button @click="copyToClipboard(blueprintJsonLd, 'jsonld')" class="text-emerald-600 hover:underline font-mono">
              <span x-text="copiedField === 'jsonld' ? 'Copied Schema!' : '1-Click Copy Schema'"></span>
            </button>
          </div>
          <pre class="p-3 rounded-lg bg-slate-100 dark:bg-black/60 border border-slate-200 dark:border-slate-800 font-mono text-[10px] leading-relaxed max-h-40 overflow-y-auto text-slate-700 dark:text-slate-300" x-text="blueprintJsonLd"></pre>
        </div>
      </div>

    </div>
  </div>

  <!-- ======================================================== -->
  <!-- PIXIE MULTI-HIT CENTROID DOSSIER (SLIDE-OVER DRAWER)     -->
  <!-- Grounded in Pinterest Pixie WWW 2018 Paper (Sec 4.3)     -->
  <!-- ======================================================== -->
  <div x-show="isHubDrawerOpen" x-cloak 
       class="fixed inset-0 z-50 overflow-hidden bg-slate-950/75 backdrop-blur-sm flex justify-end" 
       @keydown.escape.window="closeHubDrawer()">
    <div class="bg-white dark:bg-[#0b1120] border-l border-slate-200 dark:border-slate-800 w-full max-w-2xl h-full shadow-2xl overflow-y-auto p-6 space-y-6 animate-in slide-in-from-right duration-200" 
         @click.away="closeHubDrawer()">
      
      <!-- Drawer Header -->
      <div class="flex items-start justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
        <div class="flex items-center space-x-3">
          <div class="w-10 h-10 rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30 flex items-center justify-center flex-shrink-0">
            <i data-lucide="git-merge" class="w-5 h-5"></i>
          </div>
          <div>
            <div class="flex items-center space-x-2">
              <h3 class="font-bold text-slate-900 dark:text-white text-base">Pixie Gravitational Centroid Dossier</h3>
              <template x-if="selectedHub">
                <span class="px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-wider" :class="getPixieResonance(selectedHub).badgeClass" x-text="getPixieResonance(selectedHub).label"></span>
              </template>
            </div>
            <p class="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">
              <span>Section 4.3 Multi-Query Bipartite Random Walk Centroid</span>
            </p>
          </div>
        </div>
        <button @click="closeHubDrawer()" class="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition">
          <i data-lucide="x" class="w-5 h-5"></i>
        </button>
      </div>

      <template x-if="selectedHub">
        <div class="space-y-6">

          <!-- 1. Media Preview & Key Identifiers -->
          <div class="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/60 flex flex-col sm:flex-row gap-4 items-start">
            <!-- Pin Image (2:3 Aspect) -->
            <div class="w-32 sm:w-36 aspect-[2/3] rounded-xl overflow-hidden flex-shrink-0 border-2 shadow-md relative group" :style="'border-color: ' + (selectedHub.winning_color || '#cbd5e1')">
              <template x-if="selectedHub.image_url">
                <img :src="selectedHub.image_url" alt="Pin preview" class="w-full h-full object-cover">
              </template>
              <template x-if="!selectedHub.image_url">
                <div class="w-full h-full flex items-center justify-center bg-slate-200 dark:bg-slate-800 text-slate-400">
                  <i data-lucide="image" class="w-6 h-6"></i>
                </div>
              </template>
              <a :href="'https://www.pinterest.com/pin/' + selectedHub.candidate_pin_id + '/'" target="_blank" class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white text-xs font-semibold">
                <i data-lucide="external-link" class="w-4 h-4 mr-1"></i> View Live
              </a>
            </div>

            <!-- Details Stack -->
            <div class="flex-1 space-y-2.5 min-w-0">
              <div class="space-y-1">
                <div class="flex items-center space-x-2">
                  <span class="px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-wider" :class="{
                    'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20': selectedHub.format_type === 'PRODUCT CARD',
                    'bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20': selectedHub.format_type === 'ORGANIC PIN',
                    'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20': selectedHub.format_type === 'VIDEO PIN',
                    'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20': selectedHub.format_type === 'IDEA PIN'
                  }" x-text="selectedHub.format_type"></span>

                  <template x-if="selectedHub.is_vacuum_target">
                    <span class="px-2 py-0.5 rounded text-[9px] font-extrabold uppercase bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                      🎯 Vacuum Target
                    </span>
                  </template>
                </div>

                <h4 class="font-bold text-slate-900 dark:text-white text-sm leading-snug" x-text="selectedHub.title || ('Pin ' + selectedHub.candidate_pin_id)"></h4>
              </div>

              <!-- Metadata Pills -->
              <div class="flex items-center space-x-2 text-[11px] font-mono text-slate-500 flex-wrap gap-y-1">
                <span class="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300" x-text="selectedHub.domain"></span>
                <span>•</span>
                <button @click="copyToClipboard(selectedHub.candidate_pin_id, 'drawer-pin')" class="hover:text-amber-500 cursor-pointer flex items-center space-x-1">
                  <span x-text="'ID: ' + selectedHub.candidate_pin_id"></span>
                  <i data-lucide="copy" class="w-3 h-3"></i>
                </button>
              </div>

              <!-- Metrics Mini Bar -->
              <div class="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200/80 dark:border-slate-800/80 font-mono text-xs">
                <div>
                  <div class="text-[9px] uppercase text-slate-400">Total Saves</div>
                  <div class="font-bold text-slate-900 dark:text-white" x-text="Number(selectedHub.total_saves != null ? selectedHub.total_saves : (selectedHub.saves || 0)).toLocaleString()"></div>
                </div>
                <div>
                  <div class="text-[9px] uppercase text-slate-400">Repin Rate</div>
                  <div class="font-bold text-slate-900 dark:text-white" x-text="(selectedHub.avg_save_rate || selectedHub.save_rate || 0) + '%'"></div>
                </div>
                <div>
                  <div class="text-[9px] uppercase text-slate-400">Velocity</div>
                  <div class="font-bold text-emerald-600 dark:text-emerald-400" x-text="Number(selectedHub.daily_velocity || 0) > 0 ? ('🔥 ' + selectedHub.daily_velocity + '/d') : 'Stagnant'"></div>
                </div>
              </div>
            </div>
          </div>

          <!-- 2. Pixie Bipartite Multi-Query Formula Card (WWW 2018 Sec 4.3) -->
          <div class="p-4 rounded-2xl border border-purple-500/20 bg-purple-500/[0.04] space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold uppercase font-mono tracking-wider text-purple-700 dark:text-purple-300 flex items-center space-x-1.5">
                <i data-lucide="calculator" class="w-4 h-4"></i>
                <span>Pixie Multi-Hit Resonance Mathematics</span>
              </span>
              <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-500/20 text-purple-800 dark:text-purple-200 border border-purple-500/30" x-text="'Boost Factor: ' + getPixieResonance(selectedHub).boostFactor + 'x (k²)'"></span>
            </div>

            <p class="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed font-sans">
              Under Pinterest's Pixie formulation, visit counts across distinct query walks scale super-linearly: 
              <code class="px-1.5 py-0.5 rounded bg-purple-500/10 font-mono text-[10px] text-purple-600 dark:text-purple-300">S(p, Q) = (∑ √V)²</code>. 
              Because this pin was discovered across <strong class="text-purple-600 dark:text-purple-400" x-text="selectedHub.seed_overlap_count"></strong> distinct seed queries, its cross-cluster gravity is amplified <strong class="text-purple-600 dark:text-purple-400" x-text="getPixieResonance(selectedHub).boostFactor + 'x'"></strong>.
            </p>

            <!-- Visual Energy Bar in Drawer -->
            <div class="space-y-1 pt-1">
              <div class="flex items-center justify-between text-xs font-mono">
                <span class="text-slate-500">Aggregate Multi-Hit Mass</span>
                <span class="font-extrabold text-purple-600 dark:text-purple-400" x-text="Number(selectedHub.pixie_multihit_score || 0).toLocaleString()"></span>
              </div>
              <div class="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                <div class="h-full rounded-full transition-all duration-500" :class="getPixieResonance(selectedHub).barGradient" :style="'width: ' + getPixieResonance(selectedHub).barPercent + '%'"></div>
              </div>
            </div>
          </div>

          <!-- 3. Complete Originating Seeds Decomposition Matrix -->
          <div class="space-y-2.5">
            <div class="flex items-center justify-between">
              <h5 class="text-xs font-bold uppercase font-mono tracking-wider text-slate-800 dark:text-slate-200 flex items-center space-x-1.5">
                <i data-lucide="layers" class="w-3.5 h-3.5 text-amber-500"></i>
                <span>Originating Seeds Decomposition (<span x-text="(selectedHub.originating_seed_details || []).length"></span> Seeds)</span>
              </h5>
              <span class="text-[10px] font-mono text-slate-400">All Independent Walks</span>
            </div>

            <div class="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
              <template x-for="(s, idx) in (selectedHub.originating_seed_details || [])" :key="s.pin_id">
                <div class="p-3 bg-white dark:bg-slate-900/50 flex items-center justify-between text-xs hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                  <div class="flex items-center space-x-2.5 min-w-0">
                    <span class="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 font-mono text-[10px] font-bold text-slate-500 flex items-center justify-center flex-shrink-0" x-text="idx + 1"></span>
                    <div class="min-w-0">
                      <div class="font-bold text-slate-900 dark:text-slate-100 truncate" x-text="s.label"></div>
                      <div class="text-[10px] font-mono text-slate-400" x-text="'Seed Pin ID: ' + s.pin_id"></div>
                    </div>
                  </div>
                  <div class="flex items-center space-x-2 flex-shrink-0">
                    <span class="px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase" :class="s.is_competitor ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20' : 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'" x-text="s.is_competitor ? 'Competitor' : 'Target'"></span>
                    <a :href="'https://www.pinterest.com/pin/' + s.pin_id + '/'" target="_blank" class="p-1 text-slate-400 hover:text-amber-500" title="Open Seed Pin">
                      <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                    </a>
                  </div>
                </div>
              </template>
            </div>
          </div>

          <!-- 4. Pinterest Vision Model OCR Text Block -->
          <template x-if="selectedHub.ocr_text">
            <div class="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 space-y-2">
              <div class="flex items-center justify-between">
                <span class="text-[10px] font-mono font-bold uppercase tracking-wider text-rose-500 flex items-center space-x-1">
                  <i data-lucide="scan-text" class="w-3.5 h-3.5"></i>
                  <span>Pinterest Vision Pipeline OCR Text</span>
                </span>
                <button @click="copyToClipboard(selectedHub.ocr_text, 'drawer-ocr')" class="text-rose-600 dark:text-rose-400 hover:underline font-mono text-[10px] flex items-center space-x-1">
                  <i data-lucide="copy" class="w-2.5 h-2.5"></i>
                  <span x-text="copiedField === 'drawer-ocr' ? 'Copied!' : 'Copy OCR'"></span>
                </button>
              </div>
              <div class="text-xs font-mono text-slate-700 dark:text-slate-300 leading-relaxed bg-white dark:bg-slate-950 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800" x-text="selectedHub.ocr_text"></div>
            </div>
          </template>

          <!-- 5. Arbitrage Action Hub (One-Click Copy AI Prompts) -->
          <div class="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
            <h5 class="text-xs font-bold uppercase font-mono tracking-wider text-slate-800 dark:text-slate-200 flex items-center space-x-1.5">
              <i data-lucide="sparkles" class="w-3.5 h-3.5 text-amber-500"></i>
              <span>Arbitrage Execution Studio (One-Click AI Hooks)</span>
            </h5>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <!-- Action 1: Copy Re-spin Angle -->
              <button @click="copyHubReSpinAngle(selectedHub)" class="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-800 dark:text-amber-200 font-mono text-xs font-bold transition active:scale-95 flex items-center space-x-2 text-left">
                <i data-lucide="copy" class="w-4 h-4 text-amber-500 flex-shrink-0"></i>
                <div>
                  <div>Copy Viral Angle Prompt</div>
                  <div class="text-[10px] font-normal text-amber-700/80 dark:text-amber-300/70">Optimized for high-save copy</div>
                </div>
              </button>

              <!-- Action 2: Copy Midjourney/Imagen Image Prompt -->
              <button @click="copyHubImagePrompt(selectedHub)" class="p-3 rounded-xl border border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 text-purple-800 dark:text-purple-200 font-mono text-xs font-bold transition active:scale-95 flex items-center space-x-2 text-left">
                <i data-lucide="camera" class="w-4 h-4 text-purple-500 flex-shrink-0"></i>
                <div>
                  <div>Copy Midjourney Prompt</div>
                  <div class="text-[10px] font-normal text-purple-700/80 dark:text-purple-300/70">Replicates visual composition</div>
                </div>
              </button>
            </div>

            <!-- Action 3: Open in Pinterest Direct Link -->
            <a :href="'https://www.pinterest.com/pin/' + selectedHub.candidate_pin_id + '/'" target="_blank" class="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white font-mono text-xs font-bold transition active:scale-95 flex items-center justify-center space-x-2 shadow-sm">
              <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
              <span>Inspect Live Pin on Pinterest (Pin ID: <span x-text="selectedHub.candidate_pin_id"></span>)</span>
            </a>
          </div>

        </div>
      </template>

    </div>
  </div>

  <!-- Add Seed Modal (Single Pin & Bulk Pins Mode) -->
  <div x-show="isAddSeedOpen" x-cloak class="fixed inset-0 z-50 overflow-y-auto bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-4">
    <div class="bg-white dark:bg-[#0d1526] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl p-6 space-y-4" @click.away="isAddSeedOpen = false">
      
      <!-- Modal Header -->
      <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
        <div class="flex items-center space-x-2">
          <div class="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center">
            <i data-lucide="plus-circle" class="w-4 h-4"></i>
          </div>
          <div>
            <h3 class="font-bold text-slate-900 dark:text-white text-sm">Add Tracked Seeds to Neon</h3>
            <p class="text-[11px] text-slate-500">Insert single seed or bulk-import dozens of Pinterest pins</p>
          </div>
        </div>
        <button @click="isAddSeedOpen = false" class="text-slate-400 hover:text-slate-700 dark:hover:text-white">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>

      <!-- Mode Tabs (Single Pin vs Bulk Pins) -->
      <div class="flex border-b border-slate-200 dark:border-slate-800 text-xs font-semibold">
        <button @click="addSeedTab = 'bulk'" class="pb-2.5 px-4 border-b-2 flex items-center space-x-2 transition"
                :class="addSeedTab === 'bulk' ? 'border-rose-500 text-rose-600 dark:text-rose-400 font-bold' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'">
          <i data-lucide="layers" class="w-3.5 h-3.5"></i>
          <span>Bulk Pins Ingestion (استيراد بالجملة)</span>
          <span class="px-1.5 py-0.2 rounded-full bg-rose-500/10 text-rose-600 text-[10px] font-bold">Fast</span>
        </button>
        <button @click="addSeedTab = 'single'" class="pb-2.5 px-4 border-b-2 flex items-center space-x-2 transition"
                :class="addSeedTab === 'single' ? 'border-rose-500 text-rose-600 dark:text-rose-400 font-bold' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'">
          <i data-lucide="hash" class="w-3.5 h-3.5"></i>
          <span>Single Pin (بين فردي)</span>
        </button>
      </div>

      <!-- Tab A: Bulk Pins Ingestion -->
      <div x-show="addSeedTab === 'bulk'" class="space-y-3.5 text-xs">
        <div>
          <div class="flex items-center justify-between mb-1">
            <label class="font-semibold text-slate-700 dark:text-slate-300">
              Paste Pinterest Pin IDs or URLs (أرقام أو روابط البين)
            </label>
            <span class="font-mono text-[11px]" :class="bulkParsedPinIds.length > 0 ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-slate-400'"
                  x-text="bulkParsedPinIds.length + ' Valid Pins Detected'"></span>
          </div>
          <textarea x-model="bulkPinsInput" rows="6" placeholder="Paste pin IDs or URLs (one per line, comma or space-separated):&#10;1125829606880675896&#10;https://www.pinterest.com/pin/951737333775793129/&#10;146437425381037749"
                    class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-rose-500 font-mono text-[11px]"></textarea>
          <p class="text-[10px] text-slate-400 mt-1">Smart parser extracts raw 18-20 digit Pin IDs automatically and strips duplicates in real time.</p>
        </div>

        <!-- Detected Pins Preview Chips -->
        <template x-if="bulkParsedPinIds.length > 0">
          <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-1.5">
            <div class="text-[10px] font-mono text-slate-500 flex items-center justify-between">
              <span>Preview Extracted IDs:</span>
              <span class="font-bold text-slate-700 dark:text-slate-300" x-text="bulkParsedPinIds.length + ' items'"></span>
            </div>
            <div class="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
              <template x-for="pid in bulkParsedPinIds.slice(0, 20)" :key="pid">
                <span class="px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px] font-mono text-slate-700 dark:text-slate-300" x-text="pid"></span>
              </template>
              <template x-if="bulkParsedPinIds.length > 20">
                <span class="px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-700 text-[10px] font-mono text-slate-500" x-text="'+' + (bulkParsedPinIds.length - 20) + ' more'"></span>
              </template>
            </div>
          </div>
        </template>

        <!-- Options: Label Prefix & Classification -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Label Prefix / Campaign Name</label>
            <input type="text" x-model="bulkLabelPrefix" placeholder="e.g. Recipe Cluster" class="w-full px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-rose-500 text-xs">
          </div>
          <div>
            <label class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Classification Type</label>
            <select x-model="bulkIsCompetitor" class="w-full px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-rose-500 text-xs">
              <option :value="true">Competitor Cluster</option>
              <option :value="false">Internal / Our Seed</option>
            </select>
          </div>
        </div>

        <!-- Crawl Execution Settings -->
        <div class="p-3 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 flex items-center justify-between">
          <label class="flex items-center space-x-2 cursor-pointer">
            <input type="checkbox" x-model="bulkAutoCrawl" class="w-4 h-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500">
            <div>
              <span class="font-bold text-slate-900 dark:text-slate-100">Auto-Crawl Pins Immediately</span>
              <p class="text-[10px] text-slate-500">Trigger crawl pipeline right after inserting seeds into Neon</p>
            </div>
          </label>
          <div x-show="bulkAutoCrawl" class="flex items-center space-x-1.5 text-[11px] font-mono">
            <label class="flex items-center space-x-1 cursor-pointer">
              <input type="radio" value="workflow" x-model="bulkCrawlEngine" class="text-rose-600">
              <span>🚀 GitHub Actions</span>
            </label>
            <label class="flex items-center space-x-1 cursor-pointer">
              <input type="radio" value="local" x-model="bulkCrawlEngine" class="text-rose-600">
              <span>💻 Local</span>
            </label>
          </div>
        </div>

        <div class="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end space-x-2">
          <button @click="isAddSeedOpen = false" class="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-700">Cancel</button>
          <button @click="submitBulkSeeds()" :disabled="bulkParsedPinIds.length === 0 || isSubmittingBulk" class="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition active:scale-95 disabled:opacity-50 flex items-center space-x-1.5 shadow-sm">
            <i data-lucide="check" class="w-3.5 h-3.5"></i>
            <span x-text="isSubmittingBulk ? 'Importing Seeds...' : 'Import ' + bulkParsedPinIds.length + ' Seeds to Neon'"></span>
          </button>
        </div>
      </div>

      <!-- Tab B: Single Pin Mode -->
      <div x-show="addSeedTab === 'single'" class="space-y-3 text-xs">
        <div>
          <label class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Pinterest Pin ID</label>
          <input type="text" x-model="newSeed.pin_id" placeholder="e.g. 1125829606880675896" class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-rose-500 font-mono">
        </div>
        <div>
          <label class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Label / Recipe Name</label>
          <input type="text" x-model="newSeed.label" placeholder="e.g. Slow Cooker Honey Garlic Competitor" class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-rose-500">
        </div>
        <div class="flex items-center justify-between pt-1">
          <label class="flex items-center space-x-2 cursor-pointer">
            <input type="checkbox" x-model="newSeed.is_competitor" class="rounded border-slate-300 text-rose-600 focus:ring-rose-500">
            <span class="text-slate-600 dark:text-slate-300 font-medium">Competitor Seed Pin</span>
          </label>
          <label class="flex items-center space-x-2 cursor-pointer">
            <input type="checkbox" x-model="newSeed.auto_crawl" class="rounded border-slate-300 text-rose-600 focus:ring-rose-500">
            <span class="text-rose-600 dark:text-rose-400 font-medium font-mono">Auto-Crawl Now</span>
          </label>
        </div>

        <div class="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end space-x-2">
          <button @click="isAddSeedOpen = false" class="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-700">Cancel</button>
          <button @click="addSeed()" class="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition active:scale-95">Save Seed</button>
        </div>
      </div>

    </div>
  </div>

  <!-- Crawl Controller & Workflow Dispatcher Modal -->
  <div x-show="isCrawlModalOpen" x-cloak class="fixed inset-0 z-50 overflow-y-auto bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-4">
    <div class="bg-white dark:bg-[#0d1526] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl p-6 space-y-4" @click.away="isCrawlModalOpen = false">
      
      <!-- Modal Header -->
      <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
        <div class="flex items-center space-x-2.5">
          <div class="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <i data-lucide="zap" class="w-4 h-4"></i>
          </div>
          <div>
            <h3 class="font-bold text-slate-900 dark:text-white text-sm">Cluster Intelligence Crawler Dispatcher</h3>
            <p class="text-[11px] text-slate-500">Execute targeted crawls locally or at scale via GitHub Actions Workflow</p>
          </div>
        </div>
        <button @click="isCrawlModalOpen = false" class="text-slate-400 hover:text-slate-700 dark:hover:text-white">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>

      <!-- Navigation Tabs: Launch Crawl vs Workflow Runs History -->
      <div class="flex border-b border-slate-200 dark:border-slate-800 text-xs font-semibold">
        <button @click="crawlModalTab = 'launch'" class="pb-2.5 px-4 border-b-2 flex items-center space-x-2 transition"
                :class="crawlModalTab === 'launch' ? 'border-amber-500 text-amber-600 dark:text-amber-400 font-bold' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'">
          <i data-lucide="play" class="w-3.5 h-3.5"></i>
          <span>Launch Crawl (إطلاق عملية زحف)</span>
        </button>
        <button @click="crawlModalTab = 'history'; fetchWorkflowRuns();" class="pb-2.5 px-4 border-b-2 flex items-center space-x-2 transition"
                :class="crawlModalTab === 'history' ? 'border-amber-500 text-amber-600 dark:text-amber-400 font-bold' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'">
          <i data-lucide="git-pull-request" class="w-3.5 h-3.5"></i>
          <span>GitHub Actions Workflow Runs (سجل التشغيل الحي)</span>
          <span class="px-1.5 py-0.2 rounded-full bg-slate-200 dark:bg-slate-800 text-[10px]" x-text="workflowRuns.length"></span>
        </button>
      </div>

      <!-- Tab 1: Launch Crawl Config -->
      <div x-show="crawlModalTab === 'launch'" class="space-y-4 text-xs">
        
        <!-- Step 1: Target Scope Selection -->
        <div class="space-y-2">
          <label class="font-bold text-slate-900 dark:text-white block">1. Select Target Pin(s) Scope (تحديد الهدف)</label>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            
            <!-- Selected Pins Option -->
            <label class="p-3 rounded-xl border flex items-start space-x-3 cursor-pointer transition"
                   :class="crawlTargetScope === 'selected' ? 'border-amber-500 bg-amber-50/20 dark:bg-amber-950/20' : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900/50'"
                   :class="{'opacity-50 cursor-not-allowed': selectedSeedIds.length === 0}">
              <input type="radio" value="selected" x-model="crawlTargetScope" :disabled="selectedSeedIds.length === 0" class="mt-0.5 text-amber-600 focus:ring-amber-500">
              <div>
                <span class="font-bold text-slate-800 dark:text-slate-200">Selected Pins</span>
                <span class="text-[10px] font-mono block text-slate-500" x-text="selectedSeedIds.length > 0 ? selectedSeedIds.length + ' seeds selected from list' : 'No seeds selected (Check seeds first)'"></span>
              </div>
            </label>

            <!-- Specific Pin ID Option -->
            <label class="p-3 rounded-xl border flex items-start space-x-3 cursor-pointer transition"
                   :class="crawlTargetScope === 'single' ? 'border-amber-500 bg-amber-50/20 dark:bg-amber-950/20' : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900/50'">
              <input type="radio" value="single" x-model="crawlTargetScope" class="mt-0.5 text-amber-600 focus:ring-amber-500">
              <div class="flex-1">
                <span class="font-bold text-slate-800 dark:text-slate-200">Specific Pin ID</span>
                <span class="text-[10px] text-slate-500 block">Single Pin ID to target</span>
              </div>
            </label>

            <!-- All Queued Seeds Option -->
            <label class="p-3 rounded-xl border flex items-start space-x-3 cursor-pointer transition"
                   :class="crawlTargetScope === 'queued' ? 'border-amber-500 bg-amber-50/20 dark:bg-amber-950/20' : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900/50'">
              <input type="radio" value="queued" x-model="crawlTargetScope" class="mt-0.5 text-amber-600 focus:ring-amber-500">
              <div>
                <span class="font-bold text-slate-800 dark:text-slate-200">All Queued Seeds</span>
                <span class="text-[10px] text-slate-500 block" x-text="seeds.filter(s => !s.last_crawled_at).length + ' pending seeds needing crawl'"></span>
              </div>
            </label>

            <!-- All Tracked Seeds Option -->
            <label class="p-3 rounded-xl border flex items-start space-x-3 cursor-pointer transition"
                   :class="crawlTargetScope === 'all' ? 'border-amber-500 bg-amber-50/20 dark:bg-amber-950/20' : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900/50'">
              <input type="radio" value="all" x-model="crawlTargetScope" class="mt-0.5 text-amber-600 focus:ring-amber-500">
              <div>
                <span class="font-bold text-slate-800 dark:text-slate-200">All Tracked Seeds (Sweep)</span>
                <span class="text-[10px] text-slate-500 block" x-text="'Force sweep all ' + seeds.length + ' tracked seeds'"></span>
              </div>
            </label>

          </div>

          <!-- Specific Pin ID input if 'single' chosen -->
          <div x-show="crawlTargetScope === 'single'" class="pt-1">
            <input type="text" x-model="crawlCustomPinId" placeholder="Enter target Pin ID (e.g. 1125829606880675896)" class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white font-mono text-xs focus:outline-none focus:border-amber-500">
          </div>
        </div>

        <!-- Step 2: Execution Engine Selection -->
        <div class="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
          <label class="font-bold text-slate-900 dark:text-white block">2. Execution Engine & Runner (بيئة التشغيل)</label>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            
            <!-- GitHub Actions Workflow Engine -->
            <label class="p-3 rounded-xl border flex items-start space-x-3 cursor-pointer transition"
                   :class="crawlEngine === 'workflow' ? 'border-purple-500 bg-purple-50/20 dark:bg-purple-950/20' : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900/50'">
              <input type="radio" value="workflow" x-model="crawlEngine" class="mt-0.5 text-purple-600 focus:ring-purple-500">
              <div>
                <div class="flex items-center space-x-1.5">
                  <span class="font-bold text-slate-800 dark:text-slate-200">🚀 GitHub Actions Workflow</span>
                  <span class="px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-700 dark:text-purple-300 text-[9px] font-bold">Matrix 20-Shards</span>
                </div>
                <p class="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                  Dispatches <code class="text-purple-600">cluster-intelligence.yml</code> via <strong>Parallel Matrix Sharding (20 Concurrent Runners)</strong>. 60 pages deep per seed (~900 candidates) with isolated egress IPs.
                </p>
              </div>
            </label>

            <!-- Local Background Crawler Engine -->
            <label class="p-3 rounded-xl border flex items-start space-x-3 cursor-pointer transition"
                   :class="crawlEngine === 'local' ? 'border-amber-500 bg-amber-50/20 dark:bg-amber-950/20' : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900/50'">
              <input type="radio" value="local" x-model="crawlEngine" class="mt-0.5 text-amber-600 focus:ring-amber-500">
              <div>
                <span class="font-bold text-slate-800 dark:text-slate-200">💻 Local Background Process</span>
                <p class="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                  Spawns crawler asynchronously on this server via <code class="text-amber-600">node scripts/cluster-intelligence.mjs</code>. Instant feedback in top banner.
                </p>
              </div>
            </label>
          </div>
        </div>

        <!-- Pagination Depth -->
        <div class="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
          <div>
            <span class="font-semibold text-slate-800 dark:text-slate-200">Max Pagination Depth Per Seed</span>
            <span class="text-[10px] text-slate-500 block">Default 60 pages (~900 candidates per seed)</span>
          </div>
          <input type="number" x-model="crawlMaxPages" min="5" max="100" class="w-20 px-2 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-right font-mono font-bold text-xs">
        </div>

        <div class="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end space-x-2">
          <button @click="isCrawlModalOpen = false" class="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-700">Cancel</button>
          <button @click="executeCrawl()" :disabled="isTriggeringWorkflow || (crawlTargetScope === 'selected' && selectedSeedIds.length === 0)"
                  class="px-5 py-2 rounded-xl text-xs font-bold text-white transition active:scale-95 disabled:opacity-50 flex items-center space-x-2 shadow-sm"
                  :class="crawlEngine === 'workflow' ? 'bg-gradient-to-r from-purple-600 to-rose-600 hover:from-purple-500 hover:to-rose-500' : 'bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500'">
            <i data-lucide="zap" :class="{'animate-spin': isTriggeringWorkflow}" class="w-3.5 h-3.5"></i>
            <span x-text="isTriggeringWorkflow ? 'Triggering Workflow...' : 'Execute Crawl Pipeline'"></span>
          </button>
        </div>

      </div>

      <!-- Tab 2: GitHub Actions Workflow Runs History -->
      <div x-show="crawlModalTab === 'history'" class="space-y-3 text-xs">
        <div class="flex items-center justify-between">
          <span class="font-semibold text-slate-700 dark:text-slate-300">Recent Workflow Runs in GitHub Repository</span>
          <button @click="fetchWorkflowRuns()" :disabled="isLoadingWorkflowRuns" class="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 text-[11px] font-mono flex items-center space-x-1">
            <i data-lucide="refresh-cw" :class="{'animate-spin': isLoadingWorkflowRuns}" class="w-3 h-3"></i>
            <span>Refresh</span>
          </button>
        </div>

        <div class="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800/80 max-h-80 overflow-y-auto">
          <template x-for="run in workflowRuns" :key="run.databaseId">
            <div class="p-3 bg-white dark:bg-slate-900/50 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
              <div class="flex items-center space-x-3">
                <span class="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      :class="{
                        'bg-emerald-500': run.conclusion === 'success',
                        'bg-rose-500': run.conclusion === 'failure',
                        'bg-amber-500 animate-ping': run.status === 'in_progress' || run.status === 'queued',
                        'bg-slate-400': run.conclusion === 'cancelled'
                      }"></span>
                <div>
                  <div class="font-bold text-slate-900 dark:text-slate-100 flex items-center space-x-2">
                    <span x-text="run.displayTitle || 'Cluster Intelligence'"></span>
                    <span class="px-1.5 py-0.2 rounded text-[9px] font-mono uppercase"
                          :class="run.event === 'workflow_dispatch' ? 'bg-purple-500/10 text-purple-600' : 'bg-slate-500/10 text-slate-600'"
                          x-text="run.event"></span>
                  </div>
                  <div class="text-[10px] font-mono text-slate-400 flex items-center space-x-2 mt-0.5">
                    <span x-text="'Run #' + run.databaseId"></span>
                    <span>•</span>
                    <span x-text="new Date(run.createdAt).toLocaleString()"></span>
                  </div>
                </div>
              </div>

              <div class="flex items-center space-x-2">
                <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase"
                      :class="{
                        'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20': run.conclusion === 'success',
                        'bg-rose-500/10 text-rose-600 border border-rose-500/20': run.conclusion === 'failure',
                        'bg-amber-500/10 text-amber-600 border border-amber-500/20 animate-pulse': run.status === 'in_progress',
                        'bg-slate-500/10 text-slate-500 border border-slate-500/20': run.conclusion === 'cancelled'
                      }"
                      x-text="run.conclusion || run.status"></span>
                <a :href="run.url" target="_blank" class="p-1 text-slate-400 hover:text-purple-500" title="View run log on GitHub Actions">
                  <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                </a>
              </div>
            </div>
          </template>

          <div x-show="workflowRuns.length === 0" class="p-6 text-center text-slate-400">
            <span>No workflow runs retrieved yet. Click Refresh to query GitHub.</span>
          </div>
        </div>

        <div class="pt-2 text-right">
          <button @click="isCrawlModalOpen = false" class="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-700">Close</button>
        </div>
      </div>

    </div>
  </div>

  <!-- Delete Confirmation & Neon Purge Modal -->
  <div x-show="isDeleteModalOpen" x-cloak class="fixed inset-0 z-50 overflow-y-auto bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-4">
    <div class="bg-white dark:bg-[#0d1526] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4" @click.away="isDeleteModalOpen = false">
      <div class="flex items-center space-x-3 text-rose-600 dark:text-rose-400 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div class="w-9 h-9 rounded-xl bg-rose-500/10 flex items-center justify-center">
          <i data-lucide="alert-triangle" class="w-5 h-5"></i>
        </div>
        <div>
          <h3 class="font-bold text-slate-900 dark:text-white text-sm">Confirm Deletion</h3>
          <p class="text-[11px] text-slate-500">Database cleanup & record removal</p>
        </div>
      </div>

      <div class="space-y-3 text-xs">
        <p class="text-slate-700 dark:text-slate-300 leading-relaxed">
          Are you sure you want to delete <strong class="text-rose-600 dark:text-rose-400" x-text="deleteTargetSummary"></strong>?
        </p>

        <!-- Prominent Purge Option Checkbox -->
        <div class="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 space-y-2">
          <label class="flex items-start space-x-2.5 cursor-pointer">
            <input type="checkbox" x-model="deletePurgeNeon" class="mt-0.5 w-4 h-4 rounded border-rose-300 text-rose-600 focus:ring-rose-500">
            <div>
              <span class="font-bold text-rose-900 dark:text-rose-300">حذف وتطهير شامل من قاعدة بيانات Neon (Purge from DB)</span>
              <p class="text-[11px] text-rose-800/80 dark:text-rose-400/80 mt-0.5 leading-relaxed">
                يقوم بحذف جميع الكانديديت المحصودة (<code class="text-[10px]">candidate_graph_nodes</code>)، وكبسولات الاستكشاف (<code class="text-[10px]">seed_guided_search_capsules</code>)، والمقاييس التحليلية (<code class="text-[10px]">cluster_arbitrage_metrics</code>) المرتبطة بهذه البذور من Neon Serverless نهائياً.
              </p>
            </div>
          </label>
        </div>
      </div>

      <div class="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end space-x-2">
        <button @click="isDeleteModalOpen = false" class="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-700">Cancel</button>
        <button @click="confirmDelete()" :disabled="isDeleting" class="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition active:scale-95 disabled:opacity-50 flex items-center space-x-1.5 shadow-sm">
          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          <span x-text="isDeleting ? 'Deleting...' : 'Confirm Delete'"></span>
        </button>
      </div>
    </div>
  </div>

  <!-- Cookie Settings Modal -->
  <div x-show="isCookieModalOpen" x-cloak class="fixed inset-0 z-50 overflow-y-auto bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-4">
    <div class="bg-white dark:bg-[#0d1526] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-4 text-slate-900 dark:text-white" @click.away="isCookieModalOpen = false">
      <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
        <div class="flex items-center space-x-2">
          <i data-lucide="key" class="w-5 h-5 text-amber-500"></i>
          <h3 class="font-bold text-sm">إعداد كوكيز جلسة بينترست (Pinterest Session Cookie)</h3>
        </div>
        <button @click="isCookieModalOpen = false" class="text-slate-400 hover:text-slate-700 dark:hover:text-white">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>

      <div class="space-y-3 text-xs">
        <div class="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-1.5 text-amber-800 dark:text-amber-300 font-mono">
          <p class="font-bold">⚡ لماذا الكوكيز ضرورية لاستخراج BUBBLE_ONE_COL و RecGPT؟</p>
          <p class="text-[11px] leading-relaxed">
            منصة بنترست تعامل أي طلب بدون كوكيز كـ "زائر مجهول" فترسل 0 كبسولات بحثية و 0 كانديديت لـ RecGPT. عند إضافة الكوكيز، يتعرف بنترست على حسابك ويرسل كبسولات الاستكشاف الموجه (BUBBLE_ONE_COL) وكوتا RecGPT الكاملة (147 كانديديت).
          </p>
        </div>

        <div class="space-y-1 text-slate-600 dark:text-slate-400 text-[11px]">
          <p class="font-semibold text-slate-800 dark:text-slate-200">📌 طريقة النسخ في 3 خطوات بسيطة:</p>
          <ol class="list-decimal list-inside space-y-0.5">
            <li>افتح <code class="text-rose-500">pinterest.com</code> في متصفحك وسجل الدخول.</li>
            <li>اضغط <code class="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">F12</code> ثم اذهب لتبويب <strong>Network</strong>.</li>
            <li>اختر أي طلب، وانسخ قيمة سطر <strong>Cookie:</strong> من قسم <em>Request Headers</em> والصقها هنا:</li>
          </ol>
        </div>

        <div>
          <label class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">PINTEREST_COOKIE (قيمة الكوكيز الكاملة)</label>
          <textarea x-model="cookieInput" rows="4" placeholder="_auth=1; _pinterest_sess=TWc9PSZ..." class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-amber-500 font-mono text-[11px]"></textarea>
        </div>

        <div class="flex items-center space-x-2 text-[11px] font-mono text-slate-500">
          <span>الحالة الحالية:</span>
          <span class="font-bold" :class="cookieStatus.has_cookie ? 'text-emerald-500' : 'text-amber-500'" x-text="cookieStatus.has_cookie ? '✅ موثق (Active Cookie)' : '❌ غير متصل (Guest Mode)'"></span>
          <span x-show="cookieStatus.preview" class="text-[10px] text-slate-400" x-text="'(' + cookieStatus.preview + ')'"></span>
        </div>
      </div>

      <div class="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end space-x-2">
        <button @click="isCookieModalOpen = false" class="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-700">إلغاء</button>
        <button @click="saveCookie()" :disabled="isSavingCookie" class="px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white transition active:scale-95 disabled:opacity-50 flex items-center space-x-1.5">
          <i data-lucide="check" class="w-3.5 h-3.5"></i>
          <span x-text="isSavingCookie ? 'جاري الحفظ...' : 'حفظ وتفعيل الجلسة فوراً'"></span>
        </button>
      </div>
    </div>
  </div>

  <!-- Direct Raw JSON Ingestion Modal -->
  <div x-show="isRawJsonModalOpen" x-cloak class="fixed inset-0 z-50 overflow-y-auto bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-4">
    <div class="bg-white dark:bg-[#0d1526] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl p-6 space-y-4 text-slate-900 dark:text-white" @click.away="isRawJsonModalOpen = false">
      <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
        <div class="flex items-center space-x-2">
          <i data-lucide="file-input" class="w-5 h-5 text-purple-500"></i>
          <h3 class="font-bold text-sm">استيراد ملف JSON الأصلي مباشرة (Direct Raw JSON Ingestion)</h3>
        </div>
        <button @click="isRawJsonModalOpen = false" class="text-slate-400 hover:text-slate-700 dark:hover:text-white">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>

      <div class="space-y-3 text-xs">
        <p class="text-slate-500 dark:text-slate-400">
          الصق هنا الاستجابة الخام الكاملة المنسوخة من تبويب Network لـ (RelatedModulesResource). سيقوم المحرك فوراً باستخراج كبسولات BUBBLE_ONE_COL، وحصص RecGPT و NavBoost الحقيقية، وحفظ جميع الدبابيس في Neon DB.
        </p>

        <div>
          <label class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Target Seed Pin ID</label>
          <input type="text" x-model="rawJsonTargetPin" class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white font-mono" placeholder="e.g. 1127448087977177124">
        </div>

        <div>
          <label class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Raw Pinterest JSON Payload</label>
          <textarea x-model="rawJsonInput" rows="8" placeholder='{"resource_response": {"status": "success", "data": [...]}}' class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-purple-500 font-mono text-[11px]"></textarea>
        </div>

        <div x-show="rawJsonStatusMsg" class="p-3 rounded-xl text-xs font-mono" :class="rawJsonIsError ? 'bg-rose-500/10 text-rose-600 border border-rose-500/20' : 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'" x-text="rawJsonStatusMsg"></div>
      </div>

      <div class="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end space-x-2">
        <button @click="isRawJsonModalOpen = false" class="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-700">إلغاء</button>
        <button @click="submitRawJson()" :disabled="isSubmittingRawJson || !rawJsonInput.trim()" class="px-4 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white transition active:scale-95 disabled:opacity-50 flex items-center space-x-1.5">
          <i data-lucide="sparkles" class="w-3.5 h-3.5"></i>
          <span x-text="isSubmittingRawJson ? 'جاري الهضم والتخزين...' : 'هضم وتخزين في Neon'"></span>
        </button>
      </div>
    </div>
  </div>



  <!-- Modal: Track Pinterest Creator (Unified Modal matching User Mockup) -->
  <div x-show="isAddCompetitorModalOpen" x-cloak class="fixed inset-0 z-50 overflow-y-auto bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-4">
    <div class="bg-white dark:bg-[#0d1526] border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-lg shadow-2xl p-6 sm:p-7 space-y-5" @click.away="isAddCompetitorModalOpen = false">
      <!-- Modal Header -->
      <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-800/80 pb-4">
        <div class="flex items-center space-x-3">
          <div class="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-rose-600 text-white flex items-center justify-center shadow-md shadow-indigo-950/20">
            <i data-lucide="user-plus" class="w-5 h-5"></i>
          </div>
          <div>
            <h3 class="font-bold text-slate-900 dark:text-white text-base">Track Pinterest Creator</h3>
            <p class="text-xs text-slate-500 dark:text-slate-400">Add a creator account to monitor profile metrics, boards, or scrape winning pins into your archive.</p>
          </div>
        </div>
        <button @click="isAddCompetitorModalOpen = false" class="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>

      <!-- Form Inputs -->
      <div class="space-y-4 text-xs">
        <!-- Profile Handle / URL Input -->
        <div>
          <label class="block font-bold text-slate-800 dark:text-slate-200 mb-1.5">
            <span>Pinterest Profile URL or Username</span>
            <span class="text-rose-500">*</span>
          </label>
          <div class="relative">
            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-xs">@</span>
            <input type="text" x-model="newCompetitorHandle" placeholder="wifesrecipesbyme or https://pinterest.com/wifesrecipesbyme" class="w-full pl-8 pr-3 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono">
          </div>
          <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Accepts raw handle (e.g. <code>wifesrecipesbyme</code>) or full profile URL.</p>
        </div>

        <!-- Options Checkboxes -->
        <div class="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800 space-y-3">
          <!-- Checkbox 1: Also track & scrape in Competitor Intelligence -->
          <label class="flex items-start space-x-3 cursor-pointer">
            <input type="checkbox" x-model="newCompetitorAlsoTrack" class="mt-0.5 rounded border-slate-300 dark:border-slate-700 text-purple-600 focus:ring-purple-500">
            <div>
              <span class="font-bold text-slate-900 dark:text-white block">Also track & scrape in Competitor Intelligence</span>
              <span class="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">Saves account to database, monitors followers & monthly reach, and scrapes public boards.</span>
            </div>
          </label>

          <!-- Checkbox 2: Run Discover Pins immediately -->
          <label class="flex items-start space-x-3 cursor-pointer pt-2 border-t border-slate-200/60 dark:border-slate-800/60">
            <input type="checkbox" x-model="newCompetitorDiscoverPins" class="mt-0.5 rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500">
            <div>
              <span class="font-bold text-slate-900 dark:text-white block">Run Discover Pins immediately</span>
              <span class="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">Dispatches the pin ingestion pipeline right after adding to pull winning pins into your PinArchive.</span>
            </div>
          </label>
        </div>

        <!-- Conditional Discover Mode Selector (when Discover Pins is checked) -->
        <div x-show="newCompetitorDiscoverPins" class="p-3.5 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200/60 dark:border-indigo-900/40 space-y-2">
          <label class="block font-bold text-indigo-900 dark:text-indigo-200">Discovery Mode:</label>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label class="flex items-center space-x-2 p-2.5 rounded-xl border cursor-pointer transition" :class="newCompetitorDiscoverMode === 'daily' ? 'bg-white dark:bg-indigo-900/40 border-indigo-500 text-indigo-700 dark:text-indigo-300 font-bold shadow-sm' : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'">
              <input type="radio" value="daily" x-model="newCompetitorDiscoverMode" class="text-indigo-600">
              <div>
                <div class="text-xs">Early-Stop 3 Pages</div>
                <div class="text-[10px] text-slate-500 dark:text-slate-400">~150 pins (Fast & Safe)</div>
              </div>
            </label>
            <label class="flex items-center space-x-2 p-2.5 rounded-xl border cursor-pointer transition" :class="newCompetitorDiscoverMode === 'deep' ? 'bg-white dark:bg-indigo-900/40 border-indigo-500 text-indigo-700 dark:text-indigo-300 font-bold shadow-sm' : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'">
              <input type="radio" value="deep" x-model="newCompetitorDiscoverMode" class="text-indigo-600">
              <div>
                <div class="text-xs">Deep Audit Sweep</div>
                <div class="text-[10px] text-slate-500 dark:text-slate-400">Up to 500 pages (History)</div>
              </div>
            </label>
          </div>
        </div>

        <!-- Ingest Interval Selector -->
        <div>
          <label class="block font-bold text-slate-800 dark:text-slate-200 mb-1">Discovery / Ingest Interval:</label>
          <select x-model="newCompetitorInterval" class="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white font-semibold text-xs outline-none focus:ring-2 focus:ring-purple-500">
            <option value="daily">Daily (Automated Ingest via Cron)</option>
            <option value="weekly">Weekly Sweep</option>
            <option value="manual">Manual Only</option>
          </select>
        </div>
      </div>

      <!-- Modal Footer -->
      <div class="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end space-x-2.5">
        <button @click="isAddCompetitorModalOpen = false" class="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition">Cancel</button>
        <button @click="submitTrackCreatorUnified()" :disabled="!newCompetitorHandle.trim() || isSubmittingCreator" class="px-5 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-purple-600 via-indigo-600 to-rose-600 hover:from-purple-500 hover:to-rose-500 text-white transition active:scale-95 disabled:opacity-50 flex items-center space-x-2 shadow-md shadow-indigo-950/20">
          <i data-lucide="plus" class="w-3.5 h-3.5" :class="{'animate-spin': isSubmittingCreator}"></i>
          <span x-text="isSubmittingCreator ? 'Tracking Creator...' : 'Track Creator'"></span>
        </button>
      </div>
    </div>
  </div>

  <!-- Modal: GitHub Actions 20-Shard Crawler & Board Sharding Dispatch -->
  <div x-show="isGhaCrawlerModalOpen" x-cloak class="fixed inset-0 z-50 overflow-y-auto bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-4">
    <div class="bg-white dark:bg-[#0d1526] border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-xl shadow-2xl p-6 sm:p-7 space-y-5" @click.away="isGhaCrawlerModalOpen = false">
      <!-- Modal Header -->
      <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-800/80 pb-4">
        <div class="flex items-center space-x-3">
          <div class="w-10 h-10 rounded-2xl bg-gradient-to-tr from-sky-500 via-indigo-600 to-purple-600 text-white flex items-center justify-center shadow-md shadow-sky-950/20">
            <i data-lucide="git-branch" class="w-5 h-5"></i>
          </div>
          <div>
            <h3 class="font-bold text-slate-900 dark:text-white text-base">Launch 20-Shard Parallel Crawler</h3>
            <p class="text-xs text-slate-500 dark:text-slate-400">
              Target: <strong class="text-sky-500 font-mono" x-text="'@' + ghaTargetAccount"></strong> • Board-Level Modulo Sharding
            </p>
          </div>
        </div>
        <button @click="isGhaCrawlerModalOpen = false" class="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>

      <!-- Scope: All Boards vs Selected Boards -->
      <div class="space-y-4 text-xs">
        <div>
          <label class="block font-bold text-slate-800 dark:text-slate-200 mb-2">Board Sharding Scope:</label>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <label class="flex items-start gap-2.5 p-3 rounded-2xl border cursor-pointer transition" :class="ghaBoardScope === 'all' ? 'bg-sky-50/50 dark:bg-sky-950/30 border-sky-500 text-sky-700 dark:text-sky-300 shadow-2xs font-bold' : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'">
              <input type="radio" value="all" x-model="ghaBoardScope" class="mt-0.5 text-sky-600">
              <div>
                <div class="text-xs font-bold">All Creator Boards</div>
                <div class="text-[10.5px] font-normal text-slate-500 dark:text-slate-400 mt-0.5">Distribute all <span class="font-mono font-bold" x-text="activeCreatorBoards.length"></span> boards across 20 shards (idx % 20).</div>
              </div>
            </label>
            <label class="flex items-start gap-2.5 p-3 rounded-2xl border cursor-pointer transition" :class="ghaBoardScope === 'custom' ? 'bg-sky-50/50 dark:bg-sky-950/30 border-sky-500 text-sky-700 dark:text-sky-300 shadow-2xs font-bold' : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'">
              <input type="radio" value="custom" x-model="ghaBoardScope" class="mt-0.5 text-sky-600">
              <div>
                <div class="text-xs font-bold">Select Specific Boards</div>
                <div class="text-[10.5px] font-normal text-slate-500 dark:text-slate-400 mt-0.5">Pick target boards manually. Selected boards are split across shards.</div>
              </div>
            </label>
          </div>
        </div>

        <!-- Custom Board Selection Panel -->
        <div x-show="ghaBoardScope === 'custom'" class="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-2.5">
          <div class="flex items-center justify-between gap-2">
            <span class="text-xs font-bold text-slate-700 dark:text-slate-300">
              Selected: <strong class="font-mono text-sky-500" x-text="ghaTargetBoards.length"></strong> of <span class="font-mono" x-text="activeCreatorBoards.length"></span> boards
            </span>
            <div class="flex items-center gap-2">
              <button type="button" @click="selectAllGhaBoards()" class="text-[11px] font-bold text-sky-600 hover:underline cursor-pointer">Select All</button>
              <span>•</span>
              <button type="button" @click="deselectAllGhaBoards()" class="text-[11px] font-bold text-slate-400 hover:text-slate-600 cursor-pointer">Clear</button>
            </div>
          </div>

          <!-- Board Search Input -->
          <div class="relative">
            <input type="text" x-model="ghaBoardSearch" placeholder="Filter boards..." class="w-full pl-8 pr-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-xs outline-none focus:ring-1 focus:ring-sky-500">
            <i data-lucide="search" class="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5"></i>
          </div>

          <!-- Checkbox List -->
          <div class="max-h-48 overflow-y-auto space-y-1 pr-1">
            <template x-for="b in filteredGhaBoards" :key="b.board_id || b.name">
              <label class="flex items-center justify-between p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/60 cursor-pointer text-xs transition">
                <div class="flex items-center gap-2">
                  <input type="checkbox" :value="b.name" :checked="ghaTargetBoards.includes(b.name)" @change="toggleGhaBoardSelection(b.name)" class="rounded border-slate-300 dark:border-slate-700 text-sky-600 focus:ring-sky-500">
                  <span class="font-medium text-slate-800 dark:text-slate-200" x-text="b.name"></span>
                </div>
                <span class="font-mono text-[10.5px] px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400" x-text="(b.pin_count || 0) + ' pins'"></span>
              </label>
            </template>
          </div>
        </div>

        <!-- Crawl Depth Mode -->
        <div>
          <label class="block font-bold text-slate-800 dark:text-slate-200 mb-2">Crawl Architecture & Depth:</label>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <label class="flex items-center space-x-2 p-2.5 rounded-xl border cursor-pointer transition" :class="ghaCrawlMode === 'discovery' ? 'bg-sky-50/50 dark:bg-sky-950/30 border-sky-500 text-sky-700 dark:text-sky-300 font-bold shadow-2xs' : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'">
              <input type="radio" value="discovery" x-model="ghaCrawlMode" class="text-sky-600">
              <div>
                <div class="text-xs font-bold">Deep Feed Discovery</div>
                <div class="text-[10px] text-slate-500 dark:text-slate-400">Full Catalog Feed + 20-Shard 3x Enrichment</div>
              </div>
            </label>
            <label class="flex items-center space-x-2 p-2.5 rounded-xl border cursor-pointer transition" :class="ghaCrawlMode === 'sharded_boards' ? 'bg-emerald-50/50 dark:bg-emerald-950/30 border-emerald-500 text-emerald-700 dark:text-emerald-300 font-bold shadow-2xs' : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'">
              <input type="radio" value="sharded_boards" x-model="ghaCrawlMode" class="text-emerald-600">
              <div>
                <div class="text-xs font-bold">🚀 Sharded Board Matrix</div>
                <div class="text-[10px] text-slate-500 dark:text-slate-400">20 Nodes Crawl Boards in Parallel (Fastest)</div>
              </div>
            </label>
            <label class="flex items-center space-x-2 p-2.5 rounded-xl border cursor-pointer transition" :class="ghaCrawlMode === 'refresh' ? 'bg-sky-50/50 dark:bg-sky-950/30 border-sky-500 text-sky-700 dark:text-sky-300 font-bold shadow-2xs' : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'">
              <input type="radio" value="refresh" x-model="ghaCrawlMode" class="text-sky-600">
              <div>
                <div class="text-xs font-bold">Early-Stop 3 Pages</div>
                <div class="text-[10px] text-slate-500 dark:text-slate-400">~150 pins per board (Fast Refresh)</div>
              </div>
            </label>
          </div>
        </div>
      </div>

      <!-- Action Footer -->
      <div class="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <button @click="isGhaCrawlerModalOpen = false" class="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-700 cursor-pointer">Cancel</button>
        <button @click="submitGhaCrawlerDispatch()" :disabled="isDispatchingGitHubCrawl || (ghaBoardScope === 'custom' && ghaTargetBoards.length === 0)" class="px-5 py-2.5 rounded-xl text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white transition active:scale-95 disabled:opacity-50 flex items-center space-x-2 shadow-md shadow-sky-600/20 cursor-pointer">
          <i data-lucide="zap" class="w-4 h-4" :class="isDispatchingGitHubCrawl ? 'animate-spin' : ''"></i>
          <span x-text="isDispatchingGitHubCrawl ? 'Launching 20 Shards...' : '🚀 Launch 20-Shard Crawler'"></span>
        </button>
      </div>
    </div>
  </div>

  <!-- Modal: + Add Keywords (Keyword Velocity Tracker) -->
  <div x-show="isAddKeywordModalOpen" x-cloak class="fixed inset-0 z-50 overflow-y-auto bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-4">
    <div class="bg-white dark:bg-[#0d1526] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-4" @click.away="isAddKeywordModalOpen = false">
      <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
        <div class="flex items-center space-x-2">
          <div class="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
            <i data-lucide="search" class="w-4 h-4"></i>
          </div>
          <div>
            <h3 class="font-bold text-slate-900 dark:text-white text-sm">Add Pinterest Search Keyword</h3>
            <p class="text-[11px] text-slate-500">Track organic rank positions and daily save velocity.</p>
          </div>
        </div>
        <button @click="isAddKeywordModalOpen = false" class="text-slate-400 hover:text-slate-700 dark:hover:text-white">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>
      <div class="space-y-3 text-xs">
        <div>
          <label class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Target Keyword / Search Query</label>
          <input type="text" x-model="newKeywordText" placeholder="e.g. chicken recipes or rustic home decor" class="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50">
        </div>
        <div>
          <label class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Category</label>
          <input type="text" x-model="newKeywordCategory" placeholder="e.g. Recipes & Food or Home & Living" class="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50">
        </div>
      </div>
      <div class="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end space-x-2">
        <button @click="isAddKeywordModalOpen = false" class="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-700">Cancel</button>
        <button @click="submitAddKeyword()" :disabled="!newKeywordText.trim()" class="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition active:scale-95 disabled:opacity-50 flex items-center space-x-1.5">
          <i data-lucide="plus" class="w-3.5 h-3.5"></i>
          <span>Track Keyword</span>
        </button>
      </div>
    </div>
  </div>

  <!-- Slide-Over: View Tracked SERP Pins for a Keyword -->
  <div x-show="isKeywordPinsOpen" x-cloak class="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-md flex justify-end" @keydown.escape.window="isKeywordPinsOpen = false">
    <div class="bg-white dark:bg-[#0b1120] border-l border-slate-200 dark:border-slate-800 w-full max-w-2xl h-full min-h-screen shadow-2xl overflow-y-auto p-6 space-y-6 animate-in slide-in-from-right duration-200" @click.away="isKeywordPinsOpen = false">
      <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
        <div class="flex items-center space-x-3">
          <div class="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <i data-lucide="search" class="w-4 h-4"></i>
          </div>
          <div>
            <h3 class="font-bold text-slate-900 dark:text-white text-base flex items-center space-x-2">
              <span x-text="'Keyword: ' + (activeKeyword?.keyword || '')"></span>
              <span class="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20" x-text="activeKeyword?.category || 'General'"></span>
            </h3>
            <p class="text-xs text-slate-500 dark:text-slate-400 font-mono" x-text="activeKeywordPins.length + ' Tracked Organic SERP Pins'"></p>
          </div>
        </div>
        <button @click="isKeywordPinsOpen = false" class="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition">
          <i data-lucide="x" class="w-5 h-5"></i>
        </button>
      </div>

      <!-- Loading State -->
      <div x-show="isLoadingKeywordPins" class="text-center py-12 text-slate-500 font-mono text-xs">
        <i data-lucide="loader" class="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-500"></i>
        <span>Loading keyword SERP pins from Neon...</span>
      </div>

      <!-- Pins List -->
      <div x-show="!isLoadingKeywordPins && activeKeywordPins.length > 0" class="space-y-3 font-sans">
        <template x-for="pin in activeKeywordPins" :key="pin.id">
          <div class="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 flex items-center justify-between gap-3 hover:border-emerald-500/50 transition">
            <div class="flex items-center space-x-3 min-w-0">
              <span class="w-7 h-7 rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 font-mono text-xs font-bold flex items-center justify-center flex-shrink-0" x-text="'#' + pin.rank_position"></span>
              <template x-if="pin.image_url">
                <img :src="pin.image_url" class="w-10 h-14 rounded-lg object-cover border border-slate-200 dark:border-slate-700 flex-shrink-0">
              </template>
              <div class="min-w-0 space-y-0.5">
                <div class="text-xs font-bold text-slate-900 dark:text-white truncate" x-text="pin.title || 'Untitled Pin'"></div>
                <div class="text-[11px] font-mono text-slate-500 flex items-center space-x-2">
                  <span x-text="pin.domain || 'pinterest.com'"></span>
                  <span>•</span>
                  <span class="text-rose-500 font-bold" x-text="formatNumber(pin.save_count) + ' saves'"></span>
                  <template x-if="Number(pin.daily_save_velocity) > 0">
                    <span class="text-emerald-500 font-bold" x-text="'+' + formatNumber(pin.daily_save_velocity) + '/day'"></span>
                  </template>
                </div>
              </div>
            </div>
            <a :href="'https://www.pinterest.com/pin/' + pin.pin_id + '/'" target="_blank" class="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-emerald-500 transition flex items-center space-x-1 flex-shrink-0">
              <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
              <span>Pin</span>
            </a>
          </div>
        </template>
      </div>

      <!-- Empty State -->
      <div x-show="!isLoadingKeywordPins && activeKeywordPins.length === 0" class="text-center py-12 text-slate-500 font-mono text-xs">
        <p>No snapshots recorded yet for this keyword.</p>
        <p class="text-[11px] mt-1 text-slate-400">Click "Sync SERP" on the keyword table to fetch live search results.</p>
      </div>
    </div>
  </div>

  <!-- Modal: + Add Project to Fleet (Neon Fleet Manager) -->
  <div x-show="isAddFleetModalOpen" x-cloak class="fixed inset-0 z-50 overflow-y-auto bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-4">
    <div class="bg-white dark:bg-[#0d1526] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-4" @click.away="isAddFleetModalOpen = false">
      <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
        <div class="flex items-center space-x-2">
          <div class="w-8 h-8 rounded-xl bg-cyan-500/10 text-cyan-600 flex items-center justify-center">
            <i data-lucide="server" class="w-4 h-4"></i>
          </div>
          <div>
            <h3 class="font-bold text-slate-900 dark:text-white text-sm">Register Neon Project in Fleet</h3>
            <p class="text-[11px] text-slate-500">Add an isolated Neon Postgres project to the 100-project registry.</p>
          </div>
        </div>
        <button @click="isAddFleetModalOpen = false" class="text-slate-400 hover:text-slate-700 dark:hover:text-white">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>
      <div class="space-y-3 text-xs">
        <div>
          <label class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Project Name</label>
          <input type="text" x-model="newFleetProjectName" placeholder="e.g. pin-shard-02 or competitors-db" class="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50">
        </div>
        <div>
          <label class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Project ID</label>
          <input type="text" x-model="newFleetProjectId" placeholder="e.g. weathered-band-12345678" class="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50">
        </div>
        <div>
          <label class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Pooled DATABASE_URL</label>
          <input type="text" x-model="newFleetDatabaseUrl" placeholder="postgresql://user:pass@ep-*-pooler.neon.tech/neondb?sslmode=require" class="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white font-mono text-[11px] focus:outline-none focus:ring-2 focus:ring-cyan-500/50">
        </div>
      </div>
      <div class="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end space-x-2">
        <button @click="isAddFleetModalOpen = false" class="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-700">Cancel</button>
        <button @click="submitAddFleetProject()" :disabled="!newFleetProjectId.trim() || !newFleetDatabaseUrl.trim()" class="px-4 py-2 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white transition active:scale-95 disabled:opacity-50 flex items-center space-x-1.5">
          <i data-lucide="plus" class="w-3.5 h-3.5"></i>
          <span>Register Project</span>
        </button>
      </div>
    </div>
  </div>

  <!-- Modal: Inspect Neon Fleet Node -->
  <div x-show="isInspectingNodeModalOpen" x-cloak class="fixed inset-0 z-50 overflow-y-auto bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-4">
    <div class="bg-white dark:bg-[#0d1526] border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-lg shadow-2xl p-6 space-y-5" @click.away="isInspectingNodeModalOpen = false">
      <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
        <div class="flex items-center space-x-3">
          <div class="w-10 h-10 rounded-2xl bg-cyan-500/10 text-cyan-500 flex items-center justify-center">
            <i data-lucide="server" class="w-5 h-5"></i>
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h3 class="font-extrabold text-slate-900 dark:text-white text-base" x-text="inspectedNode?.project_name"></h3>
              <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase font-mono" :class="inspectedNode?.is_hub ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'" x-text="inspectedNode?.is_hub ? '👑 HUB MASTER' : '📦 SHARD'"></span>
            </div>
            <p class="text-xs text-slate-500 font-mono" x-text="'Project ID: ' + (inspectedNode?.project_id || '')"></p>
          </div>
        </div>
        <button @click="isInspectingNodeModalOpen = false" class="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>

      <!-- Node Specs Grid -->
      <div class="grid grid-cols-2 gap-3 text-xs font-mono">
        <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
          <span class="text-[10px] uppercase font-bold text-slate-400 block mb-1">Compute & Quota</span>
          <span class="font-bold text-slate-800 dark:text-slate-200 block">100 CU-Hours / mo</span>
          <span class="text-[10px] text-emerald-500 font-sans block mt-0.5">Autoscaling to 2 CU</span>
        </div>
        <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
          <span class="text-[10px] uppercase font-bold text-slate-400 block mb-1">NVMe Storage</span>
          <span class="font-bold text-slate-800 dark:text-slate-200 block">1.0 GB Allocated</span>
          <span class="text-[10px] text-cyan-500 font-sans block mt-0.5">Isolated Project Tenant</span>
        </div>
        <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
          <span class="text-[10px] uppercase font-bold text-slate-400 block mb-1">Cloud Region</span>
          <span class="font-bold text-slate-800 dark:text-slate-200 block" x-text="inspectedNode?.region_id || 'aws-us-east-2'"></span>
          <span class="text-[10px] text-slate-500 font-sans block mt-0.5">AWS Ohio (Scale-to-Zero)</span>
        </div>
        <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
          <span class="text-[10px] uppercase font-bold text-slate-400 block mb-1">Active Status</span>
          <span class="font-bold text-emerald-600 dark:text-emerald-400 block flex items-center gap-1">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> Active Online
          </span>
          <span class="text-[10px] text-slate-500 font-sans block mt-0.5" x-text="inspectedNode?.ping_latency ? '⚡ ' + inspectedNode.ping_latency + 'ms latency' : 'Ready for queries'"></span>
        </div>
      </div>

      <!-- Connection Details -->
      <div class="space-y-1.5 text-xs">
        <label class="block font-bold text-slate-700 dark:text-slate-300">Pooled Connection String</label>
        <div class="flex items-center space-x-2">
          <input type="text" readonly :value="inspectedNode?.masked_url || ''" class="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-mono text-[11px] outline-none">
          <button @click="copyFleetUrl(inspectedNode)" class="px-3 py-2 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white shrink-0 transition flex items-center gap-1 cursor-pointer">
            <i data-lucide="copy" class="w-3.5 h-3.5"></i>
            <span>Copy</span>
          </button>
        </div>
      </div>

      <!-- Modal Footer -->
      <div class="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <button @click="if (inspectedNode) pingFleetShard(inspectedNode)" :disabled="pingingProjectId === inspectedNode?.project_id" class="px-3.5 py-2 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition flex items-center space-x-1.5 cursor-pointer">
          <i data-lucide="zap" class="w-3.5 h-3.5 text-purple-500"></i>
          <span x-text="pingingProjectId === inspectedNode?.project_id ? 'Pinging...' : 'Test Shard Latency'"></span>
        </button>
        <button @click="isInspectingNodeModalOpen = false" class="px-4 py-2 rounded-xl text-xs font-bold bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 cursor-pointer">Close</button>
      </div>
    </div>
  </div>



  <!-- Modal: Staged Pins for Repurposing Queue -->
  <div x-show="isStagedModalOpen" x-cloak class="fixed inset-0 z-50 overflow-y-auto bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-4">
    <div class="bg-white dark:bg-[#0d1526] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-3xl shadow-2xl p-6 space-y-4 text-slate-900 dark:text-white" @click.away="isStagedModalOpen = false">
      <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
        <div class="flex items-center space-x-2">
          <i data-lucide="send" class="w-5 h-5 text-rose-500"></i>
          <div>
            <h3 class="font-bold text-sm">Staged Pins Queue (طابور النشر بالـ Compare-And-Swap)</h3>
            <p class="text-[11px] text-slate-500">Atomic CAS ensures zero double-posting across concurrent runners.</p>
          </div>
        </div>
        <button @click="isStagedModalOpen = false" class="text-slate-400 hover:text-slate-700 dark:hover:text-white">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>

      <!-- Staged List -->
      <div class="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden max-h-96 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
        <template x-for="item in stagedPinsList" :key="item.id">
          <div class="p-3 bg-white dark:bg-slate-900/50 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
            <div class="flex items-center space-x-3 min-w-0">
              <template x-if="item.image_url">
                <img :src="item.image_url" class="w-10 h-14 rounded-lg object-cover border border-slate-200 dark:border-slate-700 flex-shrink-0">
              </template>
              <div class="min-w-0 space-y-1">
                <h5 class="font-bold text-xs text-slate-900 dark:text-white truncate" x-text="item.title || 'Archived Pin'"></h5>
                <div class="flex items-center space-x-2 text-[11px] font-mono text-slate-500">
                  <span x-text="'Pin ID: ' + item.pin_id"></span>
                  <span>•</span>
                  <span x-text="formatNumber(item.saves) + ' saves'"></span>
                  <span>•</span>
                  <span class="text-amber-500" x-text="(item.velocity || '0') + '/day'"></span>
                </div>
              </div>
            </div>

            <div class="flex items-center space-x-2">
              <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase" :class="item.status === 'staged' ? 'bg-amber-500/10 text-amber-600 border border-amber-500/30' : 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/30'" x-text="item.status"></span>
              <template x-if="item.status === 'staged'">
                <button @click="claimStagedPinAction(item.id)" class="px-3 py-1 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition active:scale-95 shadow-sm">
                  Mark Dispatched (CAS)
                </button>
              </template>
            </div>
          </div>
        </template>
        <div x-show="stagedPinsList.length === 0" class="p-8 text-center text-slate-400 text-xs">
          <span>No pins currently staged. Stage pins from the PinArchive tab to populate this queue.</span>
        </div>
      </div>

      <div class="pt-2 text-right border-t border-slate-200 dark:border-slate-800">
        <button @click="isStagedModalOpen = false" class="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-700">Close</button>
      </div>
    </div>
  </div>

  <!-- Modal: Bulk Add Related Pin Seeds -->
  <div x-show="isBulkAddSeedsModalOpen" x-cloak class="fixed inset-0 z-50 overflow-y-auto bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-4">
    <div class="bg-white dark:bg-[#0d1526] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-4 text-slate-900 dark:text-white" @click.away="isBulkAddSeedsModalOpen = false">
      <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
        <div class="flex items-center space-x-2.5">
          <div class="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600 dark:text-amber-400">
            <i data-lucide="network" class="w-4 h-4"></i>
          </div>
          <div>
            <h3 class="font-bold text-sm">Bulk Add Related Pin Seeds</h3>
            <p class="text-[11px] text-slate-500">Track seed pins for @<span x-text="(activeCreator?.username || '').replace(/^@+/, '')"></span> to calculate multi-seed graph intersections.</p>
          </div>
        </div>
        <button @click="isBulkAddSeedsModalOpen = false" class="text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>

      <div class="space-y-3">
        <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300">
          Enter Pinterest Pin IDs or URLs (one per line, comma or space separated):
        </label>
        <textarea
          x-model="bulkAddSeedsInput"
          rows="6"
          placeholder="e.g.&#10;1688918607652644&#10;https://www.pinterest.com/pin/43699058883005370/&#10;43699058883005370"
          class="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0b1120] p-3 text-xs font-mono text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
        ></textarea>
        <div class="flex items-start gap-1.5 text-[11px] text-slate-400">
          <i data-lucide="info" class="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5"></i>
          <span>Any valid 15-20 digit pin ID will be automatically parsed, deduplicated, and registered to this account.</span>
        </div>
      </div>

      <div class="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <button
          type="button"
          @click="autoAddTop10WinningSeedsAction(); isBulkAddSeedsModalOpen = false"
          class="text-xs text-amber-600 dark:text-amber-400 font-bold hover:underline cursor-pointer flex items-center gap-1"
        >
          <i data-lucide="sparkles" class="w-3.5 h-3.5"></i>
          <span>Auto-add Top 10 Winning Pins</span>
        </button>
        <div class="flex items-center gap-2">
          <button
            type="button"
            @click="isBulkAddSeedsModalOpen = false"
            class="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            @click="addBulkSeedsAction()"
            :disabled="isAddingSeeds || !bulkAddSeedsInput.trim()"
            class="px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white disabled:opacity-40 transition shadow-sm cursor-pointer flex items-center gap-1.5"
          >
            <i data-lucide="plus-circle" class="w-3.5 h-3.5" :class="isAddingSeeds ? 'animate-spin' : ''"></i>
            <span x-text="isAddingSeeds ? 'Registering...' : 'Register Seeds'"></span>
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Floating Action Bar for Selected Account Pins (Fixed bottom toolbar) -->
  <div
    x-show="selectedCreatorPinIds.length > 0 && isDossierOpen"
    x-cloak
    class="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900/95 dark:bg-[#070c18]/95 text-white backdrop-blur-md border border-slate-700/80 dark:border-slate-700 rounded-2xl px-5 py-3 shadow-2xl flex items-center gap-4 animate-in fade-in slide-in-from-bottom-5"
  >
    <div class="flex items-center gap-2">
      <span class="flex h-2.5 w-2.5 rounded-full bg-amber-400 animate-pulse"></span>
      <span class="font-mono text-xs font-bold" x-text="selectedCreatorPinIds.length + ' Pin(s) Selected'"></span>
    </div>
    <div class="h-4 w-px bg-slate-700"></div>
    <div class="flex items-center gap-2">
      <button
        type="button"
        @click="analyzeSelectedPinsAsRelated()"
        :disabled="isAddingSeeds"
        class="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-white text-xs font-bold transition shadow-sm cursor-pointer flex items-center gap-1.5"
      >
        <i data-lucide="network" class="w-3.5 h-3.5" :class="isAddingSeeds ? 'animate-spin' : ''"></i>
        <span>🕸️ Analyze Related Pins Radar</span>
      </button>
      <button
        type="button"
        @click="stageSelectedCreatorPins()"
        class="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition shadow-sm cursor-pointer flex items-center gap-1.5"
      >
        <i data-lucide="play-circle" class="w-3.5 h-3.5"></i>
        <span>Stage for Repurpose</span>
      </button>
      <button
        type="button"
        @click="clearSelectedCreatorPins()"
        class="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
      >
        Clear
      </button>
    </div>
  </div>
  <!-- Toast Notification -->
  <div x-show="toastMessage" x-cloak class="fixed bottom-6 right-6 z-50 bg-slate-900 text-white dark:bg-white dark:text-slate-900 px-4 py-2.5 rounded-xl shadow-2xl font-mono text-xs flex items-center space-x-2 animate-in fade-in slide-in-from-bottom-5">
    <i data-lucide="check-circle" class="w-4 h-4 text-emerald-500"></i>
    <span x-text="toastMessage"></span>
  </div>

  <!-- Alpine Application Data Store -->
  <script>
    function dashboardApp() {
      return {
        isDark: false,
        currentTab: 'creators_archive',
        isMobileMenuOpen: false,
        isLoading: false,
        isAddSeedOpen: false,
        isDossierOpen: false,
        copiedField: null,
        toastMessage: null,

        // Related Pins Hub Sub-Tab State
        relatedSubTab: 'seeds',

        // Dedicated Pin Detail Page State (Route: /pin/:id)
        activePinId: null,
        activePinDossier: null,
        isLoadingPinDossier: false,
        pinDossierTimeframe: '7d',
        pinDossierSnapshots: [],
        previousPinPath: null,
        isPinDossierOpen: false,

        // Dedicated Board Detail Page State (Route: /:username/:board)
        activeBoardName: null,
        activeBoard: null,
        activeBoardCreator: null,
        boardPins: [],
        boardWinningPins: [],
        boardPinsTotal: 0,
        boardPinsSearch: '',
        boardPinsFilter: 'all',
        boardPinsSort: 'saves_desc',
        boardPinsViewMode: 'grid',
        boardPinsPage: 1,
        boardPinsPageSize: 24,
        isLoadingBoardPins: false,

        // Unified Creator Intelligence & PinArchive State
        creatorSubTab: 'creators',
        isCreatorDossierOpen: false,
        activeCreator: null,
        activeCreatorTab: 'overview',
        activeCreatorDetail: null,
        activeCreatorSnapshots: [],
        activeCreatorBoards: [],
        activeCreatorPins: [],
        activeCreatorTopics: [],
        activeCreatorSelectedTopic: '',
        creatorTopicSearch: '',
        isCreatorLoading: false,
        isLoadingBoards: false,

        // All Account Pins State (Raw Inventory)
        activeCreatorAllPins: [],
        activeCreatorAllPinsTotal: 0,
        activeCreatorAllPinsPage: 1,
        activeCreatorAllPinsTotalPages: 1,
        activeCreatorAllPinsBoards: [],
        creatorAllPinSearch: '',
        creatorAllPinBoard: '',
        creatorAllPinMinSaves: 0,
        creatorAllPinSort: 'saves_desc',
        creatorAllPinQualifiedOnly: false,
        creatorAllPinArticlesOnly: false,
        isLoadingAllPins: false,
        isHarvestingAllPins: false,
        isDispatchingGitHubCrawl: false,

        // Top Destination URLs State
        activeCreatorTopUrls: [],
        creatorTopUrlsTotal: 0,
        creatorTopUrlsPage: 1,
        creatorTopUrlsTotalPages: 1,
        creatorTopUrlSearch: '',
        creatorTopUrlSort: 'saves_desc',
        creatorTopUrlFilterType: 'all',
        isLoadingTopUrls: false,

        // Account-Scoped Related Pins & Intersections Radar State
        creatorRelatedSeeds: [],
        creatorRelatedIntersections: [],
        creatorRelatedStats: {
          total_seeds: 0,
          total_nodes: 0,
          unique_candidates: 0,
          self_retention_nodes: 0,
          rival_leakage_nodes: 0,
          retention_rate_pct: 0,
          leakage_rate_pct: 0,
          total_intersections: 0
        },
        isLoadingRelatedGraph: false,
        creatorRelatedMinOverlap: 2,
        creatorRelatedFilter: 'all',
        creatorRelatedPage: 1,
        creatorRelatedTotalPages: 1,
        creatorRelatedLimit: 25,
        creatorRelatedSearch: '',
        isBulkAddSeedsModalOpen: false,
        bulkAddSeedsInput: '',
        isAddingSeeds: false,
        isHarvestingRelated: false,

        // Per-Account Qualification Rules State
        creatorRules: {
          tier1_min_saves: 5000,
          tier2_min_repins: 2500,
          tier3_fresh_days: 60,
          tier3_min_saves: 500,
          articles_only: true,
          auto_pipeline: true
        },
        isSavingCreatorRules: false,
        isReEvaluatingCreatorPins: false,
        reEvaluateMessage: '',

        // Time Range & Performance Trend
        creatorTimeRange: '7D',
        creatorSelectedMonth: 'all',
        creatorMoMMode: false,
        creatorMoMBaseMonth: '',
        creatorMoMTargetMonth: '',
        creatorChartMode: 'reach',
        selectedCreatorPinIds: [],
        isPinSelected(pinId) {
          if (!pinId) return false;
          return this.selectedCreatorPinIds.includes(String(pinId));
        },
        togglePinSelection(pinId) {
          if (!pinId) return;
          const s = String(pinId);
          const idx = this.selectedCreatorPinIds.indexOf(s);
          if (idx >= 0) {
            this.selectedCreatorPinIds.splice(idx, 1);
          } else {
            this.selectedCreatorPinIds.push(s);
          }
        },
        selectAllCurrentPins(pinsList) {
          if (!Array.isArray(pinsList)) return;
          for (const p of pinsList) {
            const pid = String(p.pin_id || p.id || '');
            if (pid && !this.selectedCreatorPinIds.includes(pid)) {
              this.selectedCreatorPinIds.push(pid);
            }
          }
        },
        clearSelectedCreatorPins() {
          this.selectedCreatorPinIds = [];
        },

        // Snapshot Log Table State
        creatorSnapNumFmt: 'full',
        creatorSnapDensity: 'compact',
        creatorSnapTimeframe: '7',
        creatorSnapPage: 1,
        creatorSnapColVisible: { reach: true, views: true, pins: true },
        isSnapColsOpen: false,

        // Board Strategy Table & Grid State
        creatorBoardSearch: '',
        creatorBoardSort: 'most_pins',
        creatorBoardPage: 1,
        creatorBoardsViewMode: 'grid',
        creatorBoardSelectedTopic: '',
        creatorBoardPageSize: 12,

        // All Pins Archive Section State (Image 3)
        creatorPinViewMode: 'table',
        creatorPinPace: '24h',
        creatorPinSearch: '',
        creatorPinBoard: '',
        creatorPinStage: '',
        creatorPinSavesFilter: '',
        creatorPinSort: 'delta_saves',
        creatorPinChangedOnly: false,
        creatorPinLimit: 25,
        creatorPinPage: 1,
        creatorPinColVisible: { board: true, saves: true, repins: true, velocity: true },
        isPinColsOpen: false,
        isGasDataEnabled: true,

        // Cookie & Session State
        isCookieModalOpen: false,
        cookieInput: '',
        isSavingCookie: false,
        cookieStatus: { has_cookie: false, preview: null },

        // Raw JSON Ingestion Modal State
        isRawJsonModalOpen: false,
        rawJsonTargetPin: '',
        rawJsonInput: '',
        isSubmittingRawJson: false,
        rawJsonStatusMsg: '',
        rawJsonIsError: false,

        // Data Stores
        overview: {},
        seeds: [],
        intersections: [],

        // Tab 4: Competitor Intelligence State
        competitorsOverview: { tracked_profiles: 0, combined_reach: 0, total_audience: 0, pins_tracked: 0 },
        competitors: [],
        competitorFilter: 'all',
        competitorSearch: '',
        isAddCompetitorModalOpen: false,
        newCompetitorHandle: '',
        newCompetitorAlsoTrack: true,
        newCompetitorDiscoverPins: true,
        newCompetitorDiscoverMode: 'daily',
        newCompetitorInterval: 'daily',
        isSubmittingCreator: false,

        // Tab 5: Keyword Velocity State
        keywords: [],
        keywordSearch: '',
        isAddKeywordModalOpen: false,
        newKeywordText: '',
        newKeywordCategory: 'General',
        isKeywordPinsOpen: false,
        activeKeyword: null,
        activeKeywordPins: [],
        isLoadingKeywordPins: false,

        get filteredKeywords() {
          let list = this.keywords || [];
          if (this.keywordSearch) {
            const q = this.keywordSearch.toLowerCase().trim();
            list = list.filter(k => (k.keyword && k.keyword.toLowerCase().includes(q)) || (k.category && k.category.toLowerCase().includes(q)));
          }
          return list;
        },

        // Tab 6: Fleet State
        fleetProjects: [],
        fleetSearch: '',
        fleetRoleFilter: 'all',
        fleetRegionFilter: 'all',
        fleetPage: 1,
        fleetPageSize: 15,
        isAddFleetModalOpen: false,
        isInspectingNodeModalOpen: false,
        inspectedNode: null,
        isPingingAllFleet: false,
        fleetPingSummary: null,
        isSyncingFleet: false,
        newFleetProjectId: '',
        newFleetProjectName: '',
        newFleetDatabaseUrl: '',
        selectedProject: 'all',
        showDevOpsFleetSelector: false,

        get filteredFleetProjects() {
          let list = this.fleetProjects || [];
          if (this.fleetRoleFilter === 'hub') {
            list = list.filter(p => p.is_hub);
          } else if (this.fleetRoleFilter === 'shard') {
            list = list.filter(p => !p.is_hub);
          }
          if (this.fleetRegionFilter !== 'all') {
            list = list.filter(p => p.region_id === this.fleetRegionFilter);
          }
          if (this.fleetSearch && this.fleetSearch.trim()) {
            const q = this.fleetSearch.toLowerCase().trim();
            list = list.filter(p => 
              (p.project_name && p.project_name.toLowerCase().includes(q)) ||
              (p.project_id && p.project_id.toLowerCase().includes(q)) ||
              (p.region_id && p.region_id.toLowerCase().includes(q)) ||
              (p.masked_url && p.masked_url.toLowerCase().includes(q))
            );
          }
          return list;
        },

        get paginatedFleetProjects() {
          const list = this.filteredFleetProjects;
          const ps = Number(this.fleetPageSize) || 15;
          if (ps >= 100) return list;
          const start = (this.fleetPage - 1) * ps;
          return list.slice(start, start + ps);
        },

        get fleetTotalPages() {
          const count = this.filteredFleetProjects.length;
          const ps = Number(this.fleetPageSize) || 15;
          if (ps >= 100 || count === 0) return 1;
          return Math.max(1, Math.ceil(count / ps));
        },

        _clientCache: {
          creators: new Map(),
          boards: new Map(),
          pins: new Map()
        },

        // Tab 6: PinArchive & Topic Clusters State
        pinarchiveOverview: { total_pins: 0, total_saves: 0, total_repins: 0, avg_velocity: 0, tracked_accounts: 0, top_cluster: null, staged_pins_count: 0 },
        pinarchiveTopics: [],
        pinarchivePins: [],
        pinarchiveTopicSearch: '',
        pinarchiveSearch: '',
        pinarchiveMinSaves: 0,
        pinarchiveSort: 'saves',
        pinarchiveSelectedTopic: '',
        pinarchiveSelectedAccount: '',
        pinarchiveViewMode: 'grid',
        isLoadingPinArchive: false,

        // Pin Qualification & Ingest Rules State
        qualificationRules: {
          tier1_min_saves: 100,
          tier2_min_repins: 100,
          tier3_max_age_days: 14,
          tier3_min_saves: 25,
          cron_enabled: true,
          early_stop_pages: 3,
          discovery_max_pages: 500
        },
        isRulesCollapsed: false,
        isSavingRules: false,
        isReEvaluating: false,
        harvestingCompetitorId: null,

        // Competitor Boards Modal State
        isBoardsModalOpen: false,
        activeBoardsCompetitor: null,
        competitorBoardsList: [],
        isLoadingBoards: false,
        isSyncingBoards: false,

        // Staged Queue Modal State
        isStagedModalOpen: false,
        stagedPinsList: [],
        isLoadingStaged: false,

        // GitHub Actions 20-Shard Crawler & Board Sharding Modal State
        isGhaCrawlerModalOpen: false,
        ghaTargetAccount: '',
        ghaCrawlMode: 'discovery',
        ghaMaxPages: '500',
        ghaBoardScope: 'all',
        ghaTargetBoards: [],
        ghaBoardSearch: '',
        isDispatchingGitHubCrawl: false,

        get filteredGhaBoards() {
          const boards = this.activeCreatorBoards || [];
          if (!this.ghaBoardSearch.trim()) return boards;
          const q = this.ghaBoardSearch.toLowerCase().trim();
          return boards.filter(b => (b.name || '').toLowerCase().includes(q) || String(b.board_id || '').includes(q));
        },

        get filteredCompetitors() {
          let list = this.competitors || [];
          if (this.competitorFilter && this.competitorFilter !== 'all') {
            list = list.filter(c => c.account_type === this.competitorFilter);
          }
          if (this.competitorSearch) {
            const q = this.competitorSearch.toLowerCase().replace('@', '');
            list = list.filter(c => (c.username && c.username.toLowerCase().includes(q)) || (c.display_name && c.display_name.toLowerCase().includes(q)));
          }
          return list;
        },

        get availableCreatorMonths() {
          const set = new Set();
          for (const s of (this.activeCreatorSnapshots || [])) {
            const d = s.recorded_date || s.created_at;
            if (d) {
              const dt = new Date(d);
              if (!isNaN(dt.getTime())) {
                const key = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0');
                set.add(key);
              }
            }
          }
          return Array.from(set).sort().reverse();
        },

        get filteredCreatorSnapshots() {
          const snaps = this.activeCreatorSnapshots || [];
          if (!snaps.length) return [];
          const now = Date.now();
          let filtered = [...snaps].sort((a, b) => new Date(a.recorded_date || a.created_at) - new Date(b.recorded_date || b.created_at));
          
          if (this.creatorTimeRange === '7D') {
            filtered = filtered.filter(s => now - new Date(s.recorded_date || s.created_at).getTime() <= 7 * 86400000);
          } else if (this.creatorTimeRange === '30D') {
            filtered = filtered.filter(s => now - new Date(s.recorded_date || s.created_at).getTime() <= 30 * 86400000);
          } else if (this.creatorTimeRange === '90D') {
            filtered = filtered.filter(s => now - new Date(s.recorded_date || s.created_at).getTime() <= 90 * 86400000);
          } else if (this.creatorTimeRange === 'YTD') {
            const yr = new Date(new Date().getFullYear(), 0, 1).getTime();
            filtered = filtered.filter(s => new Date(s.recorded_date || s.created_at).getTime() >= yr);
          }

          if (this.creatorSelectedMonth !== 'all') {
            filtered = filtered.filter(s => {
              const d = new Date(s.recorded_date || s.created_at);
              const mKey = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
              return mKey === this.creatorSelectedMonth;
            });
          }

          return filtered.length > 0 ? filtered : snaps;
        },

        get availableCreatorMonths() {
          const snaps = this.activeCreatorSnapshots || [];
          const set = new Set();
          for (const s of snaps) {
            const d = new Date(s.recorded_date || s.created_at);
            if (!isNaN(d.getTime())) {
              const mKey = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
              set.add(mKey);
            }
          }
          return Array.from(set).sort();
        },

        get creatorMoMStats() {
          const snaps = this.activeCreatorSnapshots || [];
          const months = this.availableCreatorMonths;
          const baseMonth = this.creatorMoMBaseMonth || (months.length > 1 ? months[0] : (months[0] || ''));
          const targetMonth = this.creatorMoMTargetMonth || (months.length > 1 ? months[months.length - 1] : (months[0] || ''));

          const getMonthAgg = (m) => {
            if (!m) return null;
            const filtered = snaps.filter(s => {
              const d = new Date(s.recorded_date || s.created_at);
              const mKey = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
              return mKey === m;
            });
            if (!filtered.length) return null;
            const last = filtered[filtered.length - 1];
            return {
              reach: Number(last.monthly_reach || 0),
              views: Number(last.profile_views || 0),
              followers: Number(last.follower_count || 0),
              pins: Number(last.total_pins || 0)
            };
          };

          const aggA = getMonthAgg(baseMonth);
          const aggB = getMonthAgg(targetMonth);

          const calc = (key) => {
            if (!aggA || !aggB) return { diff: 0, pct: 0 };
            const vA = aggA[key] || 0;
            const vB = aggB[key] || 0;
            const diff = vB - vA;
            const pct = vA > 0 ? Number(((diff / vA) * 100).toFixed(1)) : 0;
            return { diff, pct };
          };

          return {
            reach: calc('reach'),
            views: calc('views'),
            followers: calc('followers'),
            pins: calc('pins')
          };
        },

        get creatorSnapshotsWithDeltas() {
          const list = [...(this.activeCreatorSnapshots || [])].sort((a, b) => new Date(a.recorded_date || a.created_at || 0) - new Date(b.recorded_date || b.created_at || 0));
          return list.map((s, idx) => {
            const prev = idx > 0 ? list[idx - 1] : null;
            const delta_pins = prev ? (Number(s.total_pins || 0) - Number(prev.total_pins || 0)) : 0;
            const delta_reach = prev ? (Number(s.monthly_reach || 0) - Number(prev.monthly_reach || 0)) : 0;
            const delta_views = prev ? (Number(s.profile_views || 0) - Number(prev.profile_views || 0)) : 0;
            return {
              ...s,
              delta_pins,
              delta_reach,
              delta_views
            };
          });
        },

        get paginatedCreatorSnapshots() {
          let list = [...this.creatorSnapshotsWithDeltas];
          if (this.creatorSelectedMonth !== 'all') {
            list = list.filter(s => {
              const d = new Date(s.recorded_date || s.created_at);
              const mKey = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
              return mKey === this.creatorSelectedMonth;
            });
          }
          list.reverse();
          if (this.creatorSnapTimeframe === 'all') return list;
          const sz = Number(this.creatorSnapTimeframe) || 7;
          const start = (this.creatorSnapPage - 1) * sz;
          return list.slice(start, start + sz);
        },

        get creatorSnapshotsNetChange() {
          const slice = this.paginatedCreatorSnapshots;
          if (!slice || slice.length < 2) {
            return { reach: '—', views: '—', pins: '(+0)' };
          }
          const latest = slice[0];
          const earliest = slice[slice.length - 1];
          const pinsDiff = (Number(latest.total_pins || 0) - Number(earliest.total_pins || 0));
          const reachDiff = (Number(latest.monthly_reach || 0) - Number(earliest.monthly_reach || 0));
          const viewsDiff = (Number(latest.profile_views || 0) - Number(earliest.profile_views || 0));
          return {
            reach: (reachDiff > 0 ? '+' : '') + this.formatNumber(reachDiff),
            views: (viewsDiff > 0 ? '+' : '') + this.formatNumber(viewsDiff),
            pins: (pinsDiff > 0 ? '(+' + pinsDiff + ')' : (pinsDiff < 0 ? '(' + pinsDiff + ')' : '(+0)'))
          };
        },

        get isAllCreatorPinsSelected() {
          const pins = this.paginatedCreatorPins;
          if (!pins || !pins.length) return false;
          return pins.every(p => this.isPinSelected(p.pin_id));
        },

        get creatorChartData() {
          const snaps = this.filteredCreatorSnapshots;
          if (!snaps || !snaps.length) {
            return { min: 0, max: 0, latest: 0, points: [], strokePath: '', areaPath: '', dual: false, pointsA: [], pointsB: [], strokePathA: '', strokePathB: '', areaPathA: '' };
          }
          const width = 800;
          const height = 220;
          const padL = 50, padR = 30, padT = 20, padB = 40;
          const cW = width - padL - padR;
          const cH = height - padT - padB;

          if (this.creatorChartMode === 'dual') {
            const valsReach = snaps.map(s => Number(s.monthly_reach || 0));
            const valsViews = snaps.map(s => Number(s.profile_views || 0));
            const allVals = [...valsReach, ...valsViews];
            const min = Math.min(...allVals);
            const max = Math.max(...allVals);
            const range = (max - min) || 1;

            const mapSeries = (vals) => snaps.map((s, idx) => {
              const x = padL + (snaps.length === 1 ? cW / 2 : (idx / Math.max(1, snaps.length - 1)) * cW);
              const y = padT + cH - ((vals[idx] - min) / range) * cH;
              const dt = new Date(s.recorded_date || s.created_at);
              const label = !isNaN(dt.getTime()) ? dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Day ' + (idx + 1);
              return { x, y, val: vals[idx], label };
            });

            const ptsReach = mapSeries(valsReach);
            const ptsViews = mapSeries(valsViews);

            const buildSpline = (pts) => {
              if (pts.length <= 1) return pts.length === 1 ? 'M ' + pts[0].x + ' ' + pts[0].y + ' L ' + (pts[0].x + 1) + ' ' + pts[0].y : '';
              let d = 'M ' + pts[0].x + ' ' + pts[0].y;
              for (let i = 0; i < pts.length - 1; i++) {
                const p0 = pts[i];
                const p1 = pts[i + 1];
                const mx = (p0.x + p1.x) / 2;
                d += ' C ' + mx + ' ' + p0.y + ', ' + mx + ' ' + p1.y + ', ' + p1.x + ' ' + p1.y;
              }
              return d;
            };

            const strokeReach = buildSpline(ptsReach);
            const strokeViews = buildSpline(ptsViews);
            const lastReach = ptsReach[ptsReach.length - 1] || { x: padL + cW, y: padT + cH };
            const firstReach = ptsReach[0] || { x: padL, y: padT + cH };
            const areaReach = strokeReach ? (strokeReach + ' L ' + lastReach.x + ' ' + (padT + cH) + ' L ' + firstReach.x + ' ' + (padT + cH) + ' Z') : '';

            return {
              dual: true,
              min,
              max,
              latest: valsReach[valsReach.length - 1] || 0,
              points: ptsReach,
              pointsA: ptsReach,
              pointsB: ptsViews,
              strokePath: strokeReach,
              strokePathA: strokeReach,
              strokePathB: strokeViews,
              areaPath: areaReach,
              areaPathA: areaReach
            };
          }

          let vals = [];
          if (this.creatorChartMode === 'views') {
            vals = snaps.map(s => Number(s.profile_views || 0));
          } else if (this.creatorChartMode === 'followers') {
            vals = snaps.map(s => Number(s.follower_count || 0));
          } else if (this.creatorChartMode === 'pins') {
            vals = snaps.map(s => Number(s.total_pins || 0));
          } else {
            vals = snaps.map(s => Number(s.monthly_reach || 0));
          }

          const min = Math.min(...vals);
          const max = Math.max(...vals);
          const latest = vals[vals.length - 1] || 0;
          const range = (max - min) || 1;

          const pts = snaps.map((s, idx) => {
            const x = padL + (snaps.length === 1 ? cW / 2 : (idx / Math.max(1, snaps.length - 1)) * cW);
            const y = padT + cH - ((vals[idx] - min) / range) * cH;
            const dt = new Date(s.recorded_date || s.created_at);
            const label = !isNaN(dt.getTime()) ? dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Day ' + (idx + 1);
            return { x, y, val: vals[idx], label };
          });

          let strokePath = '';
          if (pts.length === 1) {
            strokePath = 'M ' + pts[0].x + ' ' + pts[0].y + ' L ' + (pts[0].x + 1) + ' ' + pts[0].y;
          } else if (pts.length > 1) {
            strokePath = 'M ' + pts[0].x + ' ' + pts[0].y;
            for (let i = 0; i < pts.length - 1; i++) {
              const p0 = pts[i];
              const p1 = pts[i + 1];
              const mx = (p0.x + p1.x) / 2;
              strokePath += ' C ' + mx + ' ' + p0.y + ', ' + mx + ' ' + p1.y + ', ' + p1.x + ' ' + p1.y;
            }
          }

          const lastPt = pts[pts.length - 1] || { x: padL + cW, y: padT + cH };
          const firstPt = pts[0] || { x: padL, y: padT + cH };
          const areaPath = strokePath ? (strokePath + ' L ' + lastPt.x + ' ' + (padT + cH) + ' L ' + firstPt.x + ' ' + (padT + cH) + ' Z') : '';

          return { dual: false, min, max, latest, points: pts, strokePath, areaPath };
        },

        get filteredCreatorBoards() {
          let list = this.activeCreatorBoards || [];
          if (this.creatorBoardSelectedTopic) {
            const topic = this.creatorBoardSelectedTopic.toLowerCase().trim();
            list = list.filter(b => {
              const vase = Array.isArray(b.board_vase) ? b.board_vase : (b.metadata?.board_vase || []);
              return vase.some(v => (v?.text || v || '').toLowerCase().includes(topic));
            });
          }
          if (this.creatorBoardSearch) {
            const q = this.creatorBoardSearch.toLowerCase().trim();
            list = list.filter(b => {
              if (b.name && b.name.toLowerCase().includes(q)) return true;
              if (b.description && b.description.toLowerCase().includes(q)) return true;
              const vase = Array.isArray(b.board_vase) ? b.board_vase : (b.metadata?.board_vase || []);
              return vase.some(v => (v?.text || v || '').toLowerCase().includes(q));
            });
          }
          if (this.creatorBoardSort === 'most_pins') {
            list = [...list].sort((a, b) => (b.pin_count || 0) - (a.pin_count || 0));
          } else if (this.creatorBoardSort === 'most_followers') {
            list = [...list].sort((a, b) => (b.follower_count || 0) - (a.follower_count || 0));
          } else if (this.creatorBoardSort === 'recent_activity') {
            list = [...list].sort((a, b) => new Date(b.last_pinned_at || 0) - new Date(a.last_pinned_at || 0));
          } else if (this.creatorBoardSort === 'creation_date') {
            list = [...list].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
          } else if (this.creatorBoardSort === 'name_asc') {
            list = [...list].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
          }
          return list;
        },

        get paginatedCreatorBoards() {
          const list = this.filteredCreatorBoards;
          const sz = this.creatorBoardPageSize || 12;
          const start = (this.creatorBoardPage - 1) * sz;
          return list.slice(start, start + sz);
        },

        get creatorBoardsTotalPins() {
          return (this.activeCreatorBoards || []).reduce((acc, b) => acc + (Number(b.pin_count) || 0), 0);
        },

        get creatorBoardsTotalFollowers() {
          return (this.activeCreatorBoards || []).reduce((acc, b) => acc + (Number(b.follower_count) || 0), 0);
        },

        get creatorBoardsMaxPins() {
          const max = Math.max(1, ...(this.activeCreatorBoards || []).map(b => Number(b.pin_count) || 0));
          return max > 0 ? max : 1;
        },

        get creatorBoardsTopicsList() {
          const countMap = new Map();
          for (const b of (this.activeCreatorBoards || [])) {
            const vase = Array.isArray(b.board_vase) ? b.board_vase : (b.metadata?.board_vase || []);
            for (const v of vase) {
              const text = (typeof v === 'string' ? v : v?.text || '').trim();
              if (text) {
                countMap.set(text, (countMap.get(text) || 0) + 1);
              }
            }
          }
          return Array.from(countMap.entries())
            .map(([text, count]) => ({ text, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 30);
        },

        get filteredBoardPins() {
          let list = this.boardPins || [];
          if (this.boardPinsFilter === 'qualified') {
            list = list.filter(p => p.is_qualified);
          } else if (this.boardPinsFilter === 'product') {
            list = list.filter(p => p.is_product);
          }
          if (this.boardPinsSearch) {
            const q = this.boardPinsSearch.toLowerCase().trim();
            list = list.filter(p => 
              (p.title && p.title.toLowerCase().includes(q)) || 
              (p.description && p.description.toLowerCase().includes(q)) ||
              (p.domain && p.domain.toLowerCase().includes(q)) ||
              (p.link_domain && p.link_domain.toLowerCase().includes(q))
            );
          }
          if (this.boardPinsSort === 'saves_desc') {
            list = [...list].sort((a, b) => (Number(b.saves ?? b.save_count) || 0) - (Number(a.saves ?? a.save_count) || 0));
          } else if (this.boardPinsSort === 'repins_desc') {
            list = [...list].sort((a, b) => (Number(b.repins ?? b.repin_count) || 0) - (Number(a.repins ?? a.repin_count) || 0));
          } else if (this.boardPinsSort === 'velocity') {
            list = [...list].sort((a, b) => (Number(b.velocity) || 0) - (Number(a.velocity) || 0));
          } else if (this.boardPinsSort === 'newest') {
            list = [...list].sort((a, b) => new Date(b.created_at_pinterest || 0) - new Date(a.created_at_pinterest || 0));
          }
          return list;
        },

        get paginatedBoardPins() {
          const list = this.filteredBoardPins;
          const sz = this.boardPinsPageSize || 24;
          const start = (this.boardPinsPage - 1) * sz;
          return list.slice(start, start + sz);
        },

        get boardProductPinsCount() {
          return (this.boardPins || []).filter(p => p.is_product).length;
        },

        get boardWinningPinsCount() {
          return (this.boardPins || []).filter(p => p.is_qualified).length;
        },

        get boardPinsTotalPages() {
          return Math.max(1, Math.ceil((this.filteredBoardPins.length || 0) / (this.boardPinsPageSize || 24)));
        },

        get boardTotalSaves() {
          return (this.boardPins || []).reduce((acc, p) => acc + (Number(p.saves ?? p.save_count) || 0), 0);
        },

        get filteredCreatorPins() {
          let list = this.activeCreatorPins || [];
          if (this.creatorPinMinSaves > 0) {
            list = list.filter(p => Number(p.saves || 0) >= this.creatorPinMinSaves);
          }
          if (this.creatorPinSearch) {
            const q = this.creatorPinSearch.toLowerCase().trim();
            list = list.filter(p => 
              (p.title && p.title.toLowerCase().includes(q)) || 
              (p.board_name && p.board_name.toLowerCase().includes(q)) ||
              (p.description && p.description.toLowerCase().includes(q)) ||
              (p.pin_id && p.pin_id.includes(q))
            );
          }
          if (this.creatorPinBoard) {
            const b = this.creatorPinBoard.toLowerCase().trim();
            list = list.filter(p => p.board_name && p.board_name.toLowerCase() === b);
          }
          if (this.creatorPinStage) {
            list = list.filter(p => p.stage === this.creatorPinStage);
          }
          if (this.creatorPinSavesFilter === 'gte_100') {
            list = list.filter(p => (p.saves || 0) >= 100);
          } else if (this.creatorPinSavesFilter === 'gte_500') {
            list = list.filter(p => (p.saves || 0) >= 500);
          } else if (this.creatorPinSavesFilter === 'lte_50') {
            list = list.filter(p => (p.saves || 0) <= 50);
          }
          if (this.creatorPinChangedOnly) {
            list = list.filter(p => (p.delta_saves || 0) > 0 || (p.delta_repins || 0) > 0);
          }
          if (this.activeCreatorSelectedTopic) {
            const top = this.activeCreatorSelectedTopic.toLowerCase().trim();
            list = list.filter(p => {
              if (p.board_name && p.board_name.toLowerCase().includes(top)) return true;
              if (p.title && p.title.toLowerCase().includes(top)) return true;
              if (p.annotations) {
                const anns = Array.isArray(p.annotations) ? p.annotations : [];
                return anns.some(a => {
                  const name = (typeof a === 'string' ? a : (a && a.name)) || '';
                  return name.toLowerCase().includes(top);
                });
              }
              return false;
            });
          }

          // Sorting
          if (this.creatorPinSort === 'delta_saves') {
            list = [...list].sort((a, b) => (b.delta_saves || 0) - (a.delta_saves || 0));
          } else if (this.creatorPinSort === 'delta_3d') {
            list = [...list].sort((a, b) => (b.delta_saves_3d || 0) - (a.delta_saves_3d || 0));
          } else if (this.creatorPinSort === 'delta_7d') {
            list = [...list].sort((a, b) => (b.delta_saves_7d || 0) - (a.delta_saves_7d || 0));
          } else if (this.creatorPinSort === 'repins') {
            list = [...list].sort((a, b) => (b.repins || 0) - (a.repins || 0));
          } else if (this.creatorPinSort === 'velocity') {
            list = [...list].sort((a, b) => (b.velocity || 0) - (a.velocity || 0));
          } else if (this.creatorPinSort === 'shares') {
            list = [...list].sort((a, b) => (b.share_count || 0) - (a.share_count || 0));
          } else if (this.creatorPinSort === 'newest') {
            list = [...list].sort((a, b) => new Date(b.created_at_pinterest || 0) - new Date(a.created_at_pinterest || 0));
          } else {
            list = [...list].sort((a, b) => (b.saves || 0) - (a.saves || 0));
          }

          return list;
        },

        get paginatedCreatorPins() {
          const list = this.filteredCreatorPins;
          const sz = Number(this.creatorPinLimit) || 25;
          const start = (this.creatorPinPage - 1) * sz;
          return list.slice(start, start + sz);
        },

        get filteredCreatorTopics() {
          let list = this.activeCreatorTopics || [];
          if (this.creatorTopicSearch) {
            const q = this.creatorTopicSearch.toLowerCase().trim();
            list = list.filter(t => t.name && t.name.toLowerCase().includes(q));
          }
          return list;
        },

        // Pin Detail Dossier Computed Getters (Image 2 & 3)
        get filteredPinSnapshots() {
          const list = this.pinDossierSnapshots || [];
          if (!list.length) return [];
          const now = Date.now();
          if (this.pinDossierTimeframe === '7d') {
            return list.filter(s => (now - new Date(s.recorded_at).getTime()) <= 7 * 86400000);
          } else if (this.pinDossierTimeframe === '14d') {
            return list.filter(s => (now - new Date(s.recorded_at).getTime()) <= 14 * 86400000);
          } else if (this.pinDossierTimeframe === '30d') {
            return list.filter(s => (now - new Date(s.recorded_at).getTime()) <= 30 * 86400000);
          }
          return list;
        },

        get pinDossierTopDelta() {
          const snaps = this.pinDossierSnapshots || [];
          if (!snaps.length) return { saves: 0, repins: 0, comments: 0, shares: 0, reactions: 0 };
          return {
            saves: snaps[0].delta_saves || 0,
            repins: snaps[0].delta_repins || 0,
            comments: snaps[0].delta_comments || 0,
            shares: snaps[0].delta_shares || 0,
            reactions: snaps[0].delta_reactions || 0
          };
        },

        get pinDossierNetChange() {
          const list = this.filteredPinSnapshots;
          if (!list || list.length < 2) {
            return { saves: '—', repins: '—', comments: '—', shares: '—', reactions: '—' };
          }
          const sorted = [...list].sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at));
          const earliest = sorted[0];
          const latest = sorted[sorted.length - 1];
          const sDiff = Number(latest.saves || 0) - Number(earliest.saves || 0);
          const rDiff = Number(latest.repins || 0) - Number(earliest.repins || 0);
          const cDiff = Number(latest.comments || 0) - Number(earliest.comments || 0);
          const shDiff = Number(latest.shares || 0) - Number(earliest.shares || 0);
          const rxDiff = Number(latest.reactions || 0) - Number(earliest.reactions || 0);
          return {
            saves: (sDiff >= 0 ? '+' : '') + this.formatNumber(sDiff),
            repins: (rDiff >= 0 ? '+' : '') + this.formatNumber(rDiff),
            comments: (cDiff >= 0 ? '+' : '') + this.formatNumber(cDiff),
            shares: (shDiff >= 0 ? '+' : '') + this.formatNumber(shDiff),
            reactions: (rxDiff >= 0 ? '+' : '') + this.formatNumber(rxDiff)
          };
        },

        get pinDossierChartData() {
          const list = this.filteredPinSnapshots;
          const totalCount = (this.pinDossierSnapshots || []).length;
          const activeCount = list.length;
          if (!list.length) {
            return {
              activeCount: 0,
              totalCount,
              areaSaves: '',
              areaRepins: '',
              strokeSaves: '',
              strokeRepins: '',
              pointsSaves: [],
              pointsRepins: [],
              firstDateLabel: 'No data',
              lastDateLabel: ''
            };
          }

          const snaps = [...list].sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at));
          const valsSaves = snaps.map(s => Number(s.saves || 0));
          const valsRepins = snaps.map(s => Number(s.repins || 0));
          const allVals = [...valsSaves, ...valsRepins];
          const min = Math.min(...allVals);
          const max = Math.max(...allVals);
          const range = (max - min) || 1;

          const padL = 40;
          const cW = 640;
          const padT = 20;
          const cH = 150;

          const mapPts = (vals) => snaps.map((s, idx) => {
            const x = padL + (snaps.length === 1 ? cW / 2 : (idx / Math.max(1, snaps.length - 1)) * cW);
            const y = padT + cH - ((vals[idx] - min) / range) * cH;
            return { x, y, val: vals[idx] };
          });

          const ptsSaves = mapPts(valsSaves);
          const ptsRepins = mapPts(valsRepins);

          const buildSpline = (pts) => {
            if (pts.length <= 1) return pts.length === 1 ? 'M ' + pts[0].x + ' ' + pts[0].y + ' L ' + (pts[0].x + 1) + ' ' + pts[0].y : '';
            let d = 'M ' + pts[0].x + ' ' + pts[0].y;
            for (let i = 0; i < pts.length - 1; i++) {
              const p0 = pts[i];
              const p1 = pts[i + 1];
              const mx = (p0.x + p1.x) / 2;
              d += ' C ' + mx + ' ' + p0.y + ', ' + mx + ' ' + p1.y + ', ' + p1.x + ' ' + p1.y;
            }
            return d;
          };

          const strokeSaves = buildSpline(ptsSaves);
          const strokeRepins = buildSpline(ptsRepins);
          const lastPtS = ptsSaves[ptsSaves.length - 1] || { x: padL + cW, y: padT + cH };
          const firstPtS = ptsSaves[0] || { x: padL, y: padT + cH };
          const areaSaves = strokeSaves ? (strokeSaves + ' L ' + lastPtS.x + ' ' + (padT + cH) + ' L ' + firstPtS.x + ' ' + (padT + cH) + ' Z') : '';

          const lastPtR = ptsRepins[ptsRepins.length - 1] || { x: padL + cW, y: padT + cH };
          const firstPtR = ptsRepins[0] || { x: padL, y: padT + cH };
          const areaRepins = strokeRepins ? (strokeRepins + ' L ' + lastPtR.x + ' ' + (padT + cH) + ' L ' + firstPtR.x + ' ' + (padT + cH) + ' Z') : '';

          const dFirst = new Date(snaps[0].recorded_at);
          const dLast = new Date(snaps[snaps.length - 1].recorded_at);

          return {
            activeCount,
            totalCount,
            areaSaves,
            areaRepins,
            strokeSaves,
            strokeRepins,
            pointsSaves: ptsSaves,
            pointsRepins: ptsRepins,
            firstDateLabel: !isNaN(dFirst.getTime()) ? dFirst.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '',
            lastDateLabel: !isNaN(dLast.getTime()) ? dLast.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''
          };
        },

        // Tab 2: Global Intersections State
        intersectionViewMode: (typeof localStorage !== 'undefined' && localStorage.getItem('pin_hub_view_mode')) || 'grid',
        isHubDrawerOpen: false,
        selectedHub: null,
        intersectionPage: 1,
        intersectionPageSize: 24,
        intersectionSort: 'pixie',
        intersectionExpandedHubs: {},
        intersectionFilters: {
          search: '',
          minOverlap: 'all',
          seedId: 'all',
          format: 'all',
          market: 'all',
          engine: 'all'
        },

        // Lightbox Modal State
        isLightboxOpen: false,
        lightboxIndex: 0,

        // Tab 1: Seed Dossier State
        activeDossierSeed: null,
        dossierCandidates: [],
        dossierTelemetry: {},
        dossierGuidedCapsules: [],
        dossierSearchQuery: '',
        dossierTab: 'table',
        dossierSort: 'saves',
        recgptPlaybook: null,
        dossierFilters: {
          search: '',
          engine: 'all',
          velocity: 'all',
          market: 'all',
          sequence: 'all'
        },

        // Tab 3: Master Explorer State
        explorerSeedId: 'all',
        explorerCandidates: [],
        explorerSort: 'saves',
        explorerFilters: {
          search: '',
          engine: 'all',
          velocity: 'all',
          market: 'all',
          sequence: 'all'
        },

        selectedCandidate: null,

        crawlStatus: { is_crawling: false },
        crawlElapsed: 0,
        crawlTimer: null,

        newSeed: {
          pin_id: '',
          label: '',
          is_competitor: true,
          auto_crawl: true
        },

        // Seeds Selection & Controls State
        selectedSeedIds: [],
        seedViewMode: (typeof localStorage !== 'undefined' && localStorage.getItem('pin_seed_view_mode')) || 'grid',
        seedSearch: '',
        seedFilterStatus: 'all',
        seedFilterType: 'all',
        seedSort: 'crawled_desc',

        // Bulk / Add Seed Modal State
        addSeedTab: 'bulk',
        bulkPinsInput: '',
        bulkLabelPrefix: 'Tracked Seed',
        bulkIsCompetitor: true,
        bulkAutoCrawl: true,
        bulkCrawlEngine: 'workflow',
        isSubmittingBulk: false,

        // Crawl Controller Modal State
        isCrawlModalOpen: false,
        crawlModalTab: 'launch',
        crawlTargetScope: 'queued',
        crawlCustomPinId: '',
        crawlEngine: 'workflow',
        crawlMaxPages: '60',
        workflowRuns: [],
        isLoadingWorkflowRuns: false,
        isTriggeringWorkflow: false,

        // Delete Modal State
        isDeleteModalOpen: false,
        deleteTarget: null,
        deletePurgeNeon: true,
        isDeleting: false,

        toggleTheme() {
          this.isDark = !this.isDark;
          localStorage.setItem('pin_theme', this.isDark ? 'dark' : 'light');
          this.$nextTick(() => {
            if (window.lucide) window.lucide.createIcons();
          });
        },

        formatNumber(num, abbrev = false) {
          if (num === null || num === undefined) return '0';
          const val = Number(num);
          if (isNaN(val)) return '0';
          if (abbrev) {
            if (val >= 1000000) return (val / 1000000).toFixed(1) + 'M';
            if (val >= 1000) return (val / 1000).toFixed(1) + 'K';
            return String(val);
          }
          return val.toLocaleString();
        },

        switchTab(tab) {
          if (this.activePinId) {
            this.closePinPage(true);
          }
          if (tab === 'related_pins' || tab === 'seeds' || tab === 'intersections' || tab === 'explorer') {
            this.currentTab = 'related_pins';
            if (tab === 'seeds' || tab === 'intersections' || tab === 'explorer') {
              this.relatedSubTab = tab;
            }
            if (this.seeds.length === 0) this.fetchSeeds();
            if (this.intersections.length === 0) this.fetchIntersections();
            if (this.explorerCandidates.length === 0) this.loadExplorerData();
          } else if (tab === 'creators_archive' || tab === 'competitors' || tab === 'pinarchive' || tab === 'creators') {
            this.currentTab = 'creators_archive';
            if (this.competitors.length === 0) this.fetchCompetitors();
            if (this.pinarchivePins.length === 0) {
              this.fetchPinArchiveOverview();
              this.fetchPinArchiveTopics();
              this.fetchPinArchivePins();
              this.fetchQualificationRules();
            }
          } else {
            this.currentTab = tab;
            if (tab === 'keywords') {
              if (this.keywords.length === 0) this.fetchKeywords();
            } else if (tab === 'fleet') {
              if (this.fleetProjects.length === 0) this.fetchFleetProjects();
              if (typeof window !== 'undefined' && window.location.pathname !== '/fleet') {
                window.history.pushState(null, '', '/fleet');
              }
            }
          }
          this.$nextTick(() => {
            if (window.lucide) window.lucide.createIcons();
          });
        },

        applyCandidateFilters(list, filters) {
          if (!Array.isArray(list)) return [];
          let res = list;

          // 1. Text Search
          if (filters.search && filters.search.trim()) {
            const q = filters.search.toLowerCase().trim();
            res = res.filter(i => 
              (i.title && i.title.toLowerCase().includes(q)) ||
              (i.domain && i.domain.toLowerCase().includes(q)) ||
              (i.ocr_text && i.ocr_text.toLowerCase().includes(q)) ||
              (i.candidate_pin_id && String(i.candidate_pin_id).includes(q))
            );
          }

          // 2. Engine Provenance
          if (filters.engine && filters.engine !== 'all') {
            res = res.filter(i => (i.provenance_engine === filters.engine || i.engine_source === filters.engine));
          }

          // 3. Velocity Tier
          if (filters.velocity && filters.velocity !== 'all') {
            res = res.filter(i => {
              const v = Number(i.daily_velocity || 0);
              const tier = i.velocity_tier || (v >= 50 ? 'explosive' : (v >= 10 ? 'trending' : 'stagnant'));
              return tier === filters.velocity;
            });
          }

          // 4. Market Arbitrage Status
          if (filters.market && filters.market !== 'all') {
            if (filters.market === 'vacuum') {
              res = res.filter(i => i.is_vacuum_target || (!i.is_product && Number(i.saves || i.total_saves || 0) >= 5000));
            } else if (filters.market === 'product') {
              res = res.filter(i => i.is_product);
            }
          }

          // 5. RecGPT Meal Sequence
          if (filters.sequence && filters.sequence !== 'all') {
            res = res.filter(i => i.sequence_role === filters.sequence);
          }

          return res;
        },

        get filteredDossierCandidates() {
          return this.applyCandidateFilters(this.dossierCandidates, this.dossierFilters);
        },

        get filteredExplorerCandidates() {
          return this.applyCandidateFilters(this.explorerCandidates, this.explorerFilters);
        },

        get filteredIntersections() {
          if (!Array.isArray(this.intersections)) return [];
          let res = this.intersections;
          const f = this.intersectionFilters;

          // 1. Text Search across Title, Domain, OCR, Pin ID, or Seed Labels
          if (f.search && f.search.trim()) {
            const q = f.search.toLowerCase().trim();
            res = res.filter(i => {
              const matchTitle = i.title && i.title.toLowerCase().includes(q);
              const matchDomain = i.domain && i.domain.toLowerCase().includes(q);
              const matchOcr = i.ocr_text && i.ocr_text.toLowerCase().includes(q);
              const matchId = i.candidate_pin_id && String(i.candidate_pin_id).includes(q);
              const matchSeeds = Array.isArray(i.originating_seed_details) && i.originating_seed_details.some(s => s.label && s.label.toLowerCase().includes(q));
              return matchTitle || matchDomain || matchOcr || matchId || matchSeeds;
            });
          }

          // 2. Minimum Overlap Filter
          if (f.minOverlap && f.minOverlap !== 'all') {
            const minNum = Number(f.minOverlap);
            res = res.filter(i => Number(i.seed_overlap_count || 0) >= minNum);
          }

          // 3. Filter by Specific Originating Seed
          if (f.seedId && f.seedId !== 'all') {
            res = res.filter(i => Array.isArray(i.originating_seeds) && i.originating_seeds.includes(f.seedId));
          }

          // 4. Format Filter
          if (f.format && f.format !== 'all') {
            res = res.filter(i => i.format_type === f.format);
          }

          // 5. Market / Opportunity Filter
          if (f.market && f.market !== 'all') {
            if (f.market === 'vacuum') {
              res = res.filter(i => i.is_vacuum_target || (!i.is_product && Number(i.total_saves || i.saves || 0) >= 5000));
            } else if (f.market === 'product') {
              res = res.filter(i => i.is_product);
            } else if (f.market === 'high_rate') {
              res = res.filter(i => Number(i.avg_save_rate || i.save_rate || 0) >= 50);
            } else if (f.market === 'explosive') {
              res = res.filter(i => Number(i.daily_velocity || 0) >= 50);
            }
          }

          // 6. Engine Provenance Filter
          if (f.engine && f.engine !== 'all') {
            res = res.filter(i => (i.provenance_engine === f.engine || i.engine_source === f.engine));
          }

          // 7. Sort
          res = [...res].sort((a, b) => {
            if (this.intersectionSort === 'overlap') {
              const diff = Number(b.seed_overlap_count || 0) - Number(a.seed_overlap_count || 0);
              if (diff !== 0) return diff;
              return Number(b.pixie_multihit_score || 0) - Number(a.pixie_multihit_score || 0);
            }
            if (this.intersectionSort === 'saves') {
              return Number(b.total_saves || b.saves || 0) - Number(a.total_saves || a.saves || 0);
            }
            if (this.intersectionSort === 'rate') {
              return Number(b.avg_save_rate || b.save_rate || 0) - Number(a.avg_save_rate || a.save_rate || 0);
            }
            if (this.intersectionSort === 'velocity') {
              return Number(b.daily_velocity || 0) - Number(a.daily_velocity || 0);
            }
            // default: pixie multihit score
            return Number(b.pixie_multihit_score || 0) - Number(a.pixie_multihit_score || 0);
          });

          return res;
        },

        get bulkParsedPinIds() {
          if (!this.bulkPinsInput || typeof this.bulkPinsInput !== 'string') return [];
          const matches = this.bulkPinsInput.match(/\\d{10,25}/g) || [];
          const cleanIds = [];
          for (const m of matches) {
            const id = m.trim();
            if (id && !cleanIds.includes(id)) {
              cleanIds.push(id);
            }
          }
          return cleanIds;
        },

        get filteredSeeds() {
          let list = Array.isArray(this.seeds) ? [...this.seeds] : [];

          // 1. Text Search
          if (this.seedSearch && this.seedSearch.trim()) {
            const q = this.seedSearch.toLowerCase().trim();
            list = list.filter(s =>
              (s.pin_id && String(s.pin_id).includes(q)) ||
              (s.label && s.label.toLowerCase().includes(q))
            );
          }

          // 2. Status Filter
          if (this.seedFilterStatus === 'crawled') {
            list = list.filter(s => Boolean(s.last_crawled_at));
          } else if (this.seedFilterStatus === 'pending') {
            list = list.filter(s => !s.last_crawled_at);
          }

          // 3. Type Filter
          if (this.seedFilterType === 'competitor') {
            list = list.filter(s => Boolean(s.is_competitor));
          } else if (this.seedFilterType === 'internal') {
            list = list.filter(s => !s.is_competitor);
          }

          // 4. Sort
          if (this.seedSort === 'crawled_desc') {
            list.sort((a, b) => {
              if (!a.last_crawled_at && !b.last_crawled_at) return 0;
              if (!a.last_crawled_at) return 1;
              if (!b.last_crawled_at) return -1;
              return new Date(b.last_crawled_at) - new Date(a.last_crawled_at);
            });
          } else if (this.seedSort === 'candidates_desc') {
            list.sort((a, b) => Number(b.total_candidates || 0) - Number(a.total_candidates || 0));
          } else if (this.seedSort === 'candidates_asc') {
            list.sort((a, b) => Number(a.total_candidates || 0) - Number(b.total_candidates || 0));
          } else if (this.seedSort === 'gap_desc') {
            list.sort((a, b) => Number(b.commercial_gap_ratio || 100) - Number(a.commercial_gap_ratio || 100));
          } else if (this.seedSort === 'id_desc') {
            list.sort((a, b) => String(b.pin_id).localeCompare(String(a.pin_id)));
          }

          return list;
        },

        get isAllSeedsSelected() {
          const list = this.filteredSeeds;
          return list.length > 0 && list.every(s => this.selectedSeedIds.includes(s.pin_id));
        },

        get deleteTargetSummary() {
          if (!this.deleteTarget) return 'selected items';
          if (this.deleteTarget === 'selected') {
            return this.selectedSeedIds.length + ' selected seeds';
          }
          if (typeof this.deleteTarget === 'object') {
            return '"' + (this.deleteTarget.label || this.deleteTarget.pin_id) + '" (' + this.deleteTarget.pin_id + ')';
          }
          return 'seed ' + this.deleteTarget;
        },

        get paginatedIntersections() {
          const list = this.filteredIntersections;
          const start = (this.intersectionPage - 1) * this.intersectionPageSize;
          return list.slice(start, start + this.intersectionPageSize);
        },

        get intersectionTotalPages() {
          return Math.max(1, Math.ceil(this.filteredIntersections.length / this.intersectionPageSize));
        },

        get intersectionVisiblePages() {
          const total = this.intersectionTotalPages;
          const current = this.intersectionPage;
          const delta = 2;
          const range = [];
          for (let i = Math.max(2, current - delta); i <= Math.min(total - 1, current + delta); i++) {
            range.push(i);
          }
          if (current - delta > 2) range.unshift('...');
          if (current + delta < total - 1) range.push('...');
          range.unshift(1);
          if (total > 1) range.push(total);
          return range;
        },

        get intersectionStats() {
          const list = Array.isArray(this.intersections) ? this.intersections : [];
          const totalHubs = list.length;
          const goldenCore = list.filter(i => Number(i.seed_overlap_count || 0) >= 5).length;
          const superHubs = list.filter(i => Number(i.seed_overlap_count || 0) >= 3).length;
          const vacuumTargets = list.filter(i => i.is_vacuum_target || (!i.is_product && Number(i.total_saves || i.saves || 0) >= 5000)).length;
          let maxPixie = 0;
          for (const item of list) {
            const p = Number(item.pixie_multihit_score || 0);
            if (p > maxPixie) maxPixie = p;
          }
          return {
            totalHubs,
            goldenCore,
            superHubs,
            vacuumTargets,
            maxPixieRaw: maxPixie || 3878953.86,
            maxPixie: maxPixie.toLocaleString()
          };
        },

        getPixieResonance(item) {
          if (!item) {
            return {
              tier: 'B',
              label: '⭐ Tier B',
              badgeClass: 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border border-slate-500/30',
              barGradient: 'bg-gradient-to-r from-slate-400 to-slate-500',
              barPercent: 10,
              boostFactor: 1
            };
          }
          const score = Number(item.pixie_multihit_score || 0);
          const overlap = Number(item.seed_overlap_count || 1);
          const maxRaw = Number(this.intersectionStats?.maxPixieRaw || 3878953.86);
          const barPercent = Math.min(100, Math.max(10, Math.round((score / maxRaw) * 100)));
          const boostFactor = Math.pow(overlap, 2);

          if (score >= 3000000 || overlap >= 7) {
            return {
              tier: 'S+',
              label: '👑 Tier S+ (Top 0.1%)',
              badgeClass: 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30',
              barGradient: 'bg-gradient-to-r from-purple-500 via-rose-500 to-amber-500',
              barPercent,
              boostFactor
            };
          }
          if (score >= 1000000 || overlap >= 5) {
            return {
              tier: 'S',
              label: '🔥 Tier S (Golden Core)',
              badgeClass: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30',
              barGradient: 'bg-gradient-to-r from-rose-500 to-amber-500',
              barPercent,
              boostFactor
            };
          }
          if (score >= 500000 || overlap >= 3) {
            return {
              tier: 'A',
              label: '⚡ Tier A (Cluster Hub)',
              badgeClass: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30',
              barGradient: 'bg-gradient-to-r from-sky-500 to-emerald-500',
              barPercent,
              boostFactor
            };
          }
          return {
            tier: 'B',
            label: '⭐ Tier B (Pairwise)',
            badgeClass: 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border border-slate-500/30',
            barGradient: 'bg-gradient-to-r from-slate-400 to-slate-500',
            barPercent,
            boostFactor
          };
        },

        setIntersectionViewMode(mode) {
          this.intersectionViewMode = mode;
          try {
            if (typeof localStorage !== 'undefined') localStorage.setItem('pin_hub_view_mode', mode);
          } catch (e) {}
          this.$nextTick(() => {
            if (window.lucide) window.lucide.createIcons();
          });
        },

        openHubDrawer(item) {
          this.selectedHub = item;
          this.isHubDrawerOpen = true;
          this.$nextTick(() => {
            if (window.lucide) window.lucide.createIcons();
          });
        },

        closeHubDrawer() {
          this.isHubDrawerOpen = false;
          this.selectedHub = null;
        },

        copyHubReSpinAngle(item) {
          if (!item) return;
          const title = item.title || ('Pin ' + item.candidate_pin_id);
          const ocr = item.ocr_text ? (' Key detected image text: ' + item.ocr_text + '.') : '';
          const prompt = 'Act as an elite Pinterest viral growth strategist. Re-engineer this winning Pin concept into 5 high-converting headlines and 3 curiosity hooks.\\n\\nOriginal Winning Title: ' + title + '\\n' + ocr + '\\n\\nTarget: Maximize save rate, curiosity gap, and viral distribution across culinary/recipe clusters.';
          this.copyToClipboard(prompt, 'hub-angle-' + item.candidate_pin_id);
          this.showToast('Copied Viral Re-spin Prompt for "' + title.slice(0, 30) + '..."');
        },

        copyHubImagePrompt(item) {
          if (!item) return;
          const title = item.title || ('Pin ' + item.candidate_pin_id);
          const color = item.culinary_color_name ? (item.culinary_color_name + ' aesthetic') : (item.winning_color || 'warm appetizing tones');
          const prompt = 'High-end commercial cookbook photography of ' + title + ', styled for Pinterest viral engagement, ' + color + ', mouthwatering details, shallow depth of field, natural diffused kitchen lighting, shot on Hasselblad 50mm f/1.8 --ar 2:3 --v 6.1 --style raw';
          this.copyToClipboard(prompt, 'hub-image-' + item.candidate_pin_id);
          this.showToast('Copied Midjourney / Imagen Prompt!');
        },

        setIntersectionPage(p) {
          if (typeof p !== 'number') return;
          if (p >= 1 && p <= this.intersectionTotalPages) {
            this.intersectionPage = p;
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        resetIntersectionFilters() {
          this.intersectionFilters = {
            search: '',
            minOverlap: 'all',
            seedId: 'all',
            format: 'all',
            market: 'all',
            engine: 'all'
          };
          this.intersectionSort = 'pixie';
          this.intersectionPage = 1;
          this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
        },

        toggleExpandSeeds(pinId) {
          this.intersectionExpandedHubs = {
            ...this.intersectionExpandedHubs,
            [pinId]: !this.intersectionExpandedHubs[pinId]
          };
          this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
        },

        isSeedsExpanded(pinId) {
          return Boolean(this.intersectionExpandedHubs[pinId]);
        },

        openLightbox(index) {
          this.lightboxIndex = index;
          this.isLightboxOpen = true;
          this.$nextTick(() => {
            if (window.lucide) window.lucide.createIcons();
          });
        },

        closeLightbox() {
          this.isLightboxOpen = false;
        },

        prevLightboxImage() {
          if (!this.dossierGuidedCapsules || this.dossierGuidedCapsules.length <= 1) return;
          this.lightboxIndex = (this.lightboxIndex - 1 + this.dossierGuidedCapsules.length) % this.dossierGuidedCapsules.length;
        },

        nextLightboxImage() {
          if (!this.dossierGuidedCapsules || this.dossierGuidedCapsules.length <= 1) return;
          this.lightboxIndex = (this.lightboxIndex + 1) % this.dossierGuidedCapsules.length;
        },

        get currentLightboxCapsule() {
          if (!this.dossierGuidedCapsules || this.dossierGuidedCapsules.length === 0) return null;
          return this.dossierGuidedCapsules[this.lightboxIndex] || null;
        },

        resetDossierFilters() {
          this.dossierFilters = { search: '', engine: 'all', velocity: 'all', market: 'all', sequence: 'all' };
          this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
        },

        resetExplorerFilters() {
          this.explorerFilters = { search: '', engine: 'all', velocity: 'all', market: 'all', sequence: 'all' };
          this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
        },

        get cleanRecipeTitle() {
          if (!this.selectedCandidate) return 'Recipe';
          let title = this.selectedCandidate.title || '';
          if (!title || title.startsWith('[')) {
            title = 'Gourmet Culinary Dish';
          } else {
            title = title.replace(/\\s*\\|.*$/g, '');
            title = title.replace(/\\s*-\\s*.*recipe.*$/i, '');
            title = title.replace(/^Easy\\s+/i, '');
          }
          return title.trim();
        },

        get blueprintSeoTitle() {
          return 'Easy ' + this.cleanRecipeTitle + ' Recipe (Quick & Delicious) | Zizeeba';
        },

        get blueprintMidjourney() {
          const title = this.cleanRecipeTitle;
          const color = this.selectedCandidate?.winning_color || this.selectedCandidate?.dominant_color || '#824d30';
          return 'A high-end commercial food photography shot of ' + title + ', styled for a gourmet cookbook, vibrant textures, natural daylight, shallow depth of field, warm cozy aesthetic, color palette accented by ' + color + ', shot on Hasselblad 50mm f/1.8 --ar 9:16 --v 6.1 --style raw --q 2';
        },

        get blueprintJsonLd() {
          if (!this.selectedCandidate) return '{}';
          const title = this.cleanRecipeTitle;
          const pinId = this.selectedCandidate.candidate_pin_id;
          const schema = {
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "Product",
                "name": title + " - Printable Recipe Card PDF",
                "image": "https://zizeeba.com/images/recipes/" + pinId + ".jpg",
                "description": "Comprehensive printable digital recipe card for " + title + " featuring step-by-step instructions, ingredients breakdown, and chef tips.",
                "brand": { "@type": "Brand", "name": "Zizeeba" },
                "offers": {
                  "@type": "Offer",
                  "url": "https://zizeeba.com/recipe/" + pinId,
                  "priceCurrency": "USD",
                  "price": "1.99",
                  "availability": "https://schema.org/InStock",
                  "priceValidUntil": "2027-12-31"
                }
              },
              {
                "@type": "Recipe",
                "name": title,
                "image": ["https://zizeeba.com/images/recipes/" + pinId + ".jpg"],
                "author": { "@type": "Organization", "name": "Zizeeba Culinary Kitchen" },
                "description": "Delicious homemade " + title + " crafted with simple ingredients and optimal kitchen workflow.",
                "prepTime": "PT15M",
                "cookTime": "PT30M",
                "totalTime": "PT45M",
                "recipeYield": "4 servings",
                "recipeCategory": "Main Course"
              }
            ]
          };
          return JSON.stringify(schema, null, 2);
        },

        get candidateTrajectory() {
          const defaultAnchor = this.recgptPlaybook?.dinner_anchor || {
            title: 'Slow Cooker Garlic Herb Butter Chicken & Red Potatoes',
            save_rate: 94.2,
            recgpt_transition_score: 98.5,
            prep_time: '15m'
          };
          const defaultCoVisitor = this.recgptPlaybook?.navboost_co_visitor || {
            title: 'Cast Iron Skillet Garlic Cheddar Honey Biscuits',
            save_rate: 88.7,
            recgpt_transition_score: 92.1,
            prep_time: '20m'
          };
          const defaultFinisher = this.recgptPlaybook?.session_finisher || {
            title: 'Warm Skillet Salted Caramel Chocolate Chip Cookie with Vanilla Ice Cream',
            save_rate: 96.8,
            recgpt_transition_score: 97.4,
            prep_time: '10m'
          };

          if (!this.selectedCandidate) {
            return { anchor: defaultAnchor, co_visitor: defaultCoVisitor, finisher: defaultFinisher };
          }

          const x = this.selectedCandidate;
          const role = x.sequence_role || 'DINNER_ANCHOR';
          const pool = (this.dossierCandidates && this.dossierCandidates.length > 0)
            ? this.dossierCandidates
            : (this.explorerCandidates || []);

          const findBest = (targetRole, fallback) => {
            const match = pool
              .filter(c => c.candidate_pin_id !== x.candidate_pin_id && c.sequence_role === targetRole)
              .sort((a, b) => Number(b.saves || b.total_saves || 0) - Number(a.saves || a.total_saves || 0))[0];
            return match || fallback;
          };

          if (role === 'DINNER_ANCHOR') {
            return {
              anchor: { ...x, is_active_candidate: true },
              co_visitor: findBest('NAVBOOST_CO_VISITOR', defaultCoVisitor),
              finisher: findBest('SESSION_FINISHER', defaultFinisher)
            };
          } else if (role === 'NAVBOOST_CO_VISITOR') {
            return {
              anchor: findBest('DINNER_ANCHOR', defaultAnchor),
              co_visitor: { ...x, is_active_candidate: true },
              finisher: findBest('SESSION_FINISHER', defaultFinisher)
            };
          } else if (role === 'SESSION_FINISHER') {
            return {
              anchor: findBest('DINNER_ANCHOR', defaultAnchor),
              co_visitor: findBest('NAVBOOST_CO_VISITOR', defaultCoVisitor),
              finisher: { ...x, is_active_candidate: true }
            };
          } else {
            return {
              anchor: { ...x, is_active_candidate: true },
              co_visitor: findBest('NAVBOOST_CO_VISITOR', defaultCoVisitor),
              finisher: findBest('SESSION_FINISHER', defaultFinisher)
            };
          }
        },

        async openSeedDossier(seed) {
          this.activeDossierSeed = seed;
          this.dossierCandidates = [];
          this.dossierTelemetry = {};
          this.dossierGuidedCapsules = [];
          this.dossierSearchQuery = '';
          this.dossierTab = 'table';
          this.recgptPlaybook = null;
          this.isLightboxOpen = false;

          try {
            const [candRes, telRes, pbRes, capRes] = await Promise.all([
              fetch(this.getApiUrl('/api/candidates?seed_pin_id=' + seed.pin_id + '&sort=' + this.dossierSort + '&limit=1000')),
              fetch(this.getApiUrl('/api/cluster-telemetry?seed_pin_id=' + seed.pin_id)),
              fetch(this.getApiUrl('/api/recgpt-playbook?seed_pin_id=' + seed.pin_id)),
              fetch(this.getApiUrl('/api/guided-search?seed_pin_id=' + seed.pin_id))
            ]);
            if (candRes.ok) this.dossierCandidates = await candRes.json();
            if (telRes.ok) this.dossierTelemetry = await telRes.json();
            if (pbRes.ok) this.recgptPlaybook = await pbRes.json();
            if (capRes.ok) this.dossierGuidedCapsules = await capRes.json();
          } catch (e) {
            console.error(e);
          }

          this.$nextTick(() => {
            if (window.lucide) window.lucide.createIcons();
          });
        },

        async reloadDossierCandidates() {
          if (!this.activeDossierSeed) return;
          try {
            const [candRes, capRes] = await Promise.all([
              fetch(this.getApiUrl('/api/candidates?seed_pin_id=' + this.activeDossierSeed.pin_id + '&sort=' + this.dossierSort + '&limit=1000')),
              fetch(this.getApiUrl('/api/guided-search?seed_pin_id=' + this.activeDossierSeed.pin_id))
            ]);
            if (candRes.ok) this.dossierCandidates = await candRes.json();
            if (capRes.ok) this.dossierGuidedCapsules = await capRes.json();
          } catch (e) {}
          this.$nextTick(() => {
            if (window.lucide) window.lucide.createIcons();
          });
        },

        closeSeedDossier() {
          this.activeDossierSeed = null;
          this.dossierCandidates = [];
          this.dossierTelemetry = {};
          this.dossierGuidedCapsules = [];
          this.recgptPlaybook = null;
          this.isLightboxOpen = false;
          this.$nextTick(() => {
            if (window.lucide) window.lucide.createIcons();
          });
        },

        async inspectCandidate(item) {
          this.selectedCandidate = item;
          this.isDossierOpen = true;
          if (!this.recgptPlaybook || (item?.seed_pin_id && this.recgptPlaybook.seed_pin_id !== item.seed_pin_id)) {
            try {
              const res = await fetch(this.getApiUrl('/api/recgpt-playbook' + (item?.seed_pin_id ? '?seed_pin_id=' + item.seed_pin_id : '')));
              if (res.ok) this.recgptPlaybook = await res.json();
            } catch (e) {}
          }
          this.$nextTick(() => {
            if (window.lucide) window.lucide.createIcons();
          });
        },

        copyPromptForPairing(type) {
          const title = this.cleanRecipeTitle;
          const prompt = 'Gourmet commercial cookbook photography of ' + type + ' paired with ' + title + ', warm rustic kitchen lighting, shallow depth of field, fresh garnish, vibrant textures, shot on Hasselblad 50mm f/1.8 --ar 9:16 --v 6.1 --style raw';
          navigator.clipboard.writeText(prompt);
          this.showToast('Generated & Copied ' + type + ' Prompt!');
        },

        copyGuidedPrompt(query) {
          const prompt = 'Gourmet editorial food photography of ' + query + ', styled for a high-end culinary magazine, warm appetizing lighting, shallow depth of field, vibrant fresh textures, shot on Hasselblad 50mm f/1.8 --ar 9:16 --v 6.1 --style raw';
          navigator.clipboard.writeText(prompt);
          this.showToast('Copied Prompt for "' + query + '"!');
        },

        copyToClipboard(text, field) {
          navigator.clipboard.writeText(text);
          this.copiedField = field;
          this.showToast('Copied to Clipboard!');
          setTimeout(() => { this.copiedField = null; }, 2000);
        },

        showToast(msg) {
          this.toastMessage = msg;
          setTimeout(() => { this.toastMessage = null; }, 2500);
        },

        async initDashboard() {
          try {
            const savedTheme = typeof localStorage !== 'undefined' ? localStorage.getItem('pin_theme') : null;
            if (savedTheme) {
              this.isDark = savedTheme === 'dark';
            }
          } catch (_) {}
          this.$watch('creatorSubTab', (val) => {
            if (val === 'staged' && (!this.stagedPinsList || this.stagedPinsList.length === 0)) {
              this.fetchStagedPins();
            } else if (val === 'archive' && (!this.pinarchivePins || this.pinarchivePins.length === 0)) {
              this.fetchPinArchivePins();
            }
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          });
          // Immediate Deep Link URL Hydration (e.g. /freshmancook, /freshmancook/links, /freshmancook/related-pins, /freshmancook/pin/1688918607652644)
          if (typeof window !== 'undefined') {
            const RESERVED_SYSTEM_SLUGS = new Set([
              'api', 'fleet', 'settings', 'admin', 'health', 'favicon.ico', 
              'robots.txt', 'index.html', 'assets', 'static', 'pin', 'related_pins', 'intersections', 'archive', 'explorer'
            ]);
            const CREATOR_SUB_TABS = {
              'links': 'top_urls',
              'link': 'top_urls',
              'top-urls': 'top_urls',
              'related-pins': 'related_pins',
              'related': 'related_pins',
              'all-pins': 'all_pins',
              'winning-pins': 'pins',
              'pins': 'pins',
              'topics': 'topics',
              'boards': 'boards',
              'overview': 'overview'
            };

            const segments = (window.location.pathname || '').split('/').filter(Boolean);
            const first = segments[0] || '';
            const second = segments[1] || '';
            const third = segments[2] || '';

            if (first === 'pin' && second) {
              this.openPinPage(second, false);
            } else if (first === 'fleet') {
              this.currentTab = 'fleet';
              this.fetchFleetProjects();
            } else if (first && !RESERVED_SYSTEM_SLUGS.has(first.toLowerCase())) {
              this.currentTab = 'creators_archive';
              if (second === 'pin' && third) {
                this.openCreatorByHandle(first, 'overview').then(() => {
                  this.openPinPage(third, false);
                });
              } else if (second && CREATOR_SUB_TABS[second.toLowerCase()]) {
                const targetTab = CREATOR_SUB_TABS[second.toLowerCase()];
                this.openCreatorByHandle(first, targetTab);
              } else if (second) {
                this.openCreatorByHandle(first, 'overview').then(() => {
                  const rawBoard = decodeURIComponent(second).replace(/-/g, ' ');
                  const matchBoard = (this.activeCreatorBoards || []).find(b => 
                    (b.name || '').toLowerCase() === rawBoard.toLowerCase() ||
                    (b.name || '').toLowerCase().replace(/\s+/g, '-') === second.toLowerCase()
                  ) || { name: rawBoard };
                  this.openBoardPage(matchBoard, this.activeCreator, false);
                });
              } else {
                this.openCreatorByHandle(first, 'overview');
              }
            }

            window.addEventListener('popstate', async (e) => {
              const pSegments = (window.location.pathname || '').split('/').filter(Boolean);
              const pFirst = pSegments[0] || '';
              const pSecond = pSegments[1] || '';
              const pThird = pSegments[2] || '';

              if (pFirst === 'pin' && pSecond) {
                this.openPinPage(pSecond, false);
              } else if (pFirst === 'fleet') {
                this.currentTab = 'fleet';
                this.fetchFleetProjects();
              } else if (pFirst && !RESERVED_SYSTEM_SLUGS.has(pFirst.toLowerCase())) {
                if (pSecond === 'pin' && pThird) {
                  if (!this.activeCreator || (this.activeCreator.username || '').toLowerCase() !== pFirst.toLowerCase()) {
                    await this.openCreatorByHandle(pFirst, 'overview');
                  }
                  await this.openPinPage(pThird, false);
                } else if (pSecond && CREATOR_SUB_TABS[pSecond.toLowerCase()]) {
                  if (this.activePinId) this.closePinPage(false);
                  if (this.activeBoardName) this.closeBoardPage(false);
                  const targetTab = CREATOR_SUB_TABS[pSecond.toLowerCase()];
                  await this.openCreatorByHandle(pFirst, targetTab);
                } else if (pSecond) {
                  if (this.activePinId) this.closePinPage(false);
                  const rawBoard = decodeURIComponent(pSecond).replace(/-/g, ' ');
                  if (!this.activeCreator || (this.activeCreator.username || '').toLowerCase() !== pFirst.toLowerCase()) {
                    await this.openCreatorByHandle(pFirst, 'overview');
                  }
                  const matchBoard = (this.activeCreatorBoards || []).find(b => 
                    (b.name || '').toLowerCase() === rawBoard.toLowerCase() ||
                    (b.name || '').toLowerCase().replace(/\s+/g, '-') === pSecond.toLowerCase()
                  ) || { name: rawBoard };
                  await this.openBoardPage(matchBoard, this.activeCreator, false);
                } else {
                  if (this.activePinId) this.closePinPage(false);
                  if (this.activeBoardName) this.closeBoardPage(false);
                  await this.openCreatorByHandle(pFirst, 'overview');
                }
              } else {
                if (this.activePinId) this.closePinPage(false);
                if (this.activeBoardName) this.closeBoardPage(false);
                this.closeCreatorProfile(false);
              }
            });
          }

          // Background fleet & telemetry refresh (does not block instant SPA hydration)
          this.refreshAll().catch((err) => console.error('refreshAll background error:', err));
          this.pollCrawlStatus();
          if (this._crawlStatusInterval) clearInterval(this._crawlStatusInterval);
          this._crawlStatusInterval = setInterval(() => {
            if (typeof document === 'undefined' || !document.hidden) {
              this.pollCrawlStatus();
            }
          }, 3000);

          this.$nextTick(() => {
            if (window.lucide) window.lucide.createIcons();
          });
        },

        async refreshAll() {
          this.isLoading = true;
          try {
            await Promise.all([
              this.fetchOverview(),
              this.fetchSeeds(),
              this.fetchIntersections(),
              this.fetchCookieStatus(),
              this.fetchCompetitors(),
              this.fetchKeywords(),
              this.fetchFleetProjects(),
              this.fetchPinArchiveOverview(),
              this.fetchPinArchiveTopics(),
              this.fetchQualificationRules()
            ]);
            if (this.currentTab === 'explorer') {
              await this.loadExplorerData();
            } else if (this.currentTab === 'creators_archive' || this.currentTab === 'pinarchive' || this.currentTab === 'competitors') {
              await this.fetchPinArchivePins();
              if (this.creatorSubTab === 'staged') {
                await this.fetchStagedPins();
              }
            }
          } finally {
            this.isLoading = false;
            this.$nextTick(() => {
              if (window.lucide) window.lucide.createIcons();
            });
          }
        },

        getApiUrl(base) {
          if (this.selectedProject && this.selectedProject !== 'all') {
            const sep = base.includes('?') ? '&' : '?';
            return base + sep + 'project_id=' + encodeURIComponent(this.selectedProject);
          }
          return base;
        },

        async fetchCompetitors() {
          try {
            const res = await fetch(this.getApiUrl('/api/competitors'));
            if (res.ok) {
              const data = await res.json();
              this.competitorsOverview = data.overview || { tracked_profiles: 0, total_pins_stored: 0, high_velocity_pins: 0, top_competitors: [] };
              this.competitors = data.competitors || [];
              if (this.activeCreator) {
                const matched = this.competitors.find(c => (c.username || '').toLowerCase() === (this.activeCreator.username || '').toLowerCase());
                if (matched) {
                  this.activeCreator = { ...matched, ...this.activeCreator };
                }
              }
            } else {
              this.competitorsOverview = { tracked_profiles: 0, total_pins_stored: 0, high_velocity_pins: 0, top_competitors: [] };
              this.competitors = [];
            }
          } catch (e) {
            this.competitorsOverview = { tracked_profiles: 0, total_pins_stored: 0, high_velocity_pins: 0, top_competitors: [] };
            this.competitors = [];
          }
        },

        async syncCompetitor(username) {
          try {
            const cleanName = (username || '').replace(/^@+/, '');
            this.showToast('Syncing profile for @' + cleanName + '...');
            const res = await fetch(this.getApiUrl('/api/competitors/sync'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ username: cleanName })
            });
            if (res.ok) {
              await this.fetchCompetitors();
              if (this.activeCreator && (this.activeCreator.username || '').replace(/^@+/, '') === cleanName) {
                const updated = (this.competitors || []).find(c => (c.username || '').replace(/^@+/, '') === cleanName);
                if (updated) {
                  this.activeCreator = updated;
                }
                await this.fetchCreatorBoards(this.activeCreator);
              }
              this.showToast('Profile @' + cleanName + ' synced successfully!');
            }
          } catch (e) {
            this.showToast('Failed to sync: ' + e.message);
          }
        },

        async syncAllCompetitors() {
          if (!this.competitors || this.competitors.length === 0) return;
          this.isLoading = true;
          this.showToast('Starting full sync for ' + this.competitors.length + ' profiles...');
          try {
            for (let i = 0; i < this.competitors.length; i++) {
              const c = this.competitors[i];
              this.showToast('Syncing (' + (i + 1) + '/' + this.competitors.length + '): @' + c.username + '...');
              await fetch(this.getApiUrl('/api/competitors/sync'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: c.username })
              }).catch(() => {});
              if (i < this.competitors.length - 1) {
                await new Promise(r => setTimeout(r, 2000));
              }
            }
            await this.fetchCompetitors();
            this.showToast('All competitor profiles updated successfully!');
          } finally {
            this.isLoading = false;
          }
        },

        async deleteCompetitor(id) {
          if (!confirm('Are you sure you want to stop tracking this competitor?')) return;
          try {
            const res = await fetch(this.getApiUrl('/api/competitors?id=' + id), { method: 'DELETE' });
            if (res.ok) {
              await this.fetchCompetitors();
              if (this.activeCreator && this.activeCreator.id === id) {
                this.closeCreatorProfile();
              }
              this.showToast('Competitor removed.');
            }
          } catch (e) {}
        },

        exportCompetitorsCsv() {
          const rows = [
            ['Profile', 'Monthly Reach', 'Profile Views', 'Total Pins', 'Boards', 'Activity']
          ];
          for (const c of this.filteredCompetitors) {
            rows.push([
              '@' + c.username,
              c.monthly_reach,
              c.profile_views,
              c.total_pins,
              c.total_boards,
              c.activity_status || '1d ago'
            ]);
          }
          const blob = new Blob([rows.map(e => e.join(',')).join(String.fromCharCode(10))], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.setAttribute('href', url);
          link.setAttribute('download', 'pinterest_competitors_' + new Date().toISOString().slice(0, 10) + '.csv');
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        },

        openBoardsModal(competitor) {
          if (!competitor) return;
          this.openCreatorDossier(competitor, 'boards');
        },

        async syncCompetitorBoardsAction(competitor) {
          if (!competitor) return;
          this.isSyncingBoards = true;
          this.showToast('Syncing boards for @' + competitor.username + ' from Pinterest...');
          try {
            const res = await fetch(this.getApiUrl('/api/competitors/sync-boards'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ competitor_id: competitor.id, username: competitor.username })
            });
            if (res.ok) {
              const data = await res.json();
              this.showToast('✅ Synced ' + (data.synced_boards_count ?? data.synced ?? 0) + ' boards for @' + competitor.username);
              const bRes = await fetch(this.getApiUrl('/api/competitors/boards?competitor_id=' + encodeURIComponent(competitor.id) + (competitor.username ? '&username=' + encodeURIComponent(competitor.username) : '')));
              if (bRes.ok) {
                const bData = await bRes.json();
                this.competitorBoardsList = bData.boards || [];
                competitor.total_boards = this.competitorBoardsList.length;
                if (this.activeCreator && (this.activeCreator.id === competitor.id || this.activeCreator.username === competitor.username)) {
                  this.activeCreatorBoards = bData.boards || [];
                  this.activeCreator.total_boards = this.competitorBoardsList.length;
                }
              }
              await this.fetchCompetitors();
            } else {
              const err = await res.json();
              this.showToast('Failed to sync boards: ' + (err.error || 'Error'));
            }
          } catch (e) {
            this.showToast('Sync boards error: ' + e.message);
          } finally {
            this.isSyncingBoards = false;
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        async fetchKeywords() {
          try {
            const res = await fetch(this.getApiUrl('/api/keywords'));
            if (res.ok) {
              const data = await res.json();
              this.keywords = data.keywords || [];
            } else {
              this.keywords = [];
            }
          } catch (e) {
            this.keywords = [];
          }
        },

        async syncKeyword(keywordId) {
          try {
            this.showToast('Crawling Pinterest search SERP...');
            const res = await fetch(this.getApiUrl('/api/keywords/sync'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ keyword_id: keywordId })
            });
            if (res.ok) {
              await this.fetchKeywords();
              this.showToast('Keyword SERP updated with daily velocity!');
            }
          } catch (e) {
            this.showToast('Failed to crawl keyword: ' + e.message);
          }
        },

        async openKeywordPins(kw) {
          this.activeKeyword = kw;
          this.isKeywordPinsOpen = true;
          this.isLoadingKeywordPins = true;
          try {
            const res = await fetch(this.getApiUrl('/api/keywords/pins?keyword_id=' + kw.id));
            if (res.ok) {
              const data = await res.json();
              this.activeKeywordPins = data.pins || [];
            }
          } catch (e) {
            this.activeKeywordPins = [];
          } finally {
            this.isLoadingKeywordPins = false;
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        async deleteKeyword(id) {
          if (!confirm('Are you sure you want to stop tracking this keyword?')) return;
          try {
            const res = await fetch(this.getApiUrl('/api/keywords?id=' + id), { method: 'DELETE' });
            if (res.ok) {
              await this.fetchKeywords();
              this.showToast('Keyword removed.');
            }
          } catch (e) {}
        },

        async fetchFleetProjects() {
          try {
            const res = await fetch(this.getApiUrl('/api/fleet/projects'));
            if (res.ok) {
              const data = await res.json();
              if (data.projects) this.fleetProjects = data.projects;
            }
          } catch (e) {}
        },

        formatFleetHost(url) {
          if (!url) return 'ep-pooler.neon.tech';
          const match = url.match(/@([^/:]+)/);
          if (match && match[1]) {
            const host = match[1];
            if (host.length > 24) {
              return host.slice(0, 10) + '...' + host.slice(-10);
            }
            return host;
          }
          return 'ep-pooler.neon.tech';
        },

        inspectFleetNode(project) {
          this.inspectedNode = project;
          this.isInspectingNodeModalOpen = true;
          this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
        },

        async pingFleetBatchAction() {
          if (this.isPingingAllFleet) return;
          this.isPingingAllFleet = true;
          this.showToast('⚡ Running fast latency check across fleet sample...');
          try {
            const hub = this.fleetProjects.find(p => p.is_hub);
            const shards = this.fleetProjects.filter(p => !p.is_hub);
            const sample = [];
            if (hub) sample.push(hub);
            for (let i = 0; i < 4 && i < shards.length; i++) {
              const randIdx = Math.floor(Math.random() * shards.length);
              if (!sample.includes(shards[randIdx])) sample.push(shards[randIdx]);
            }
            let totalLatency = 0;
            let successCount = 0;
            for (const node of sample) {
              try {
                const res = await fetch(this.getApiUrl('/api/fleet/ping'), {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ project_id: node.project_id })
                });
                if (res.ok) {
                  const data = await res.json();
                  if (data.success && data.latency_ms) {
                    node.ping_latency = data.latency_ms;
                    totalLatency += data.latency_ms;
                    successCount++;
                  }
                }
              } catch (_) {}
            }
            const avg = successCount > 0 ? Math.round(totalLatency / successCount) : 0;
            this.fleetPingSummary = {
              avg_ms: avg,
              total_tested: sample.length,
              healthy_count: successCount
            };
            this.showToast('⚡ Fleet Health: ' + successCount + '/' + sample.length + ' nodes online (Avg: ' + avg + 'ms)');
          } catch (e) {
            this.showToast('Ping fleet error: ' + e.message, 'error');
          } finally {
            this.isPingingAllFleet = false;
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        pingingProjectId: null,

        async pingFleetShard(project) {
          if (!project || !project.project_id) return;
          this.pingingProjectId = project.project_id;
          try {
            const res = await fetch(this.getApiUrl('/api/fleet/ping'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ project_id: project.project_id })
            });
            const data = await res.json();
            if (res.ok && data.success) {
              project.ping_latency = data.latency_ms;
              this.showToast('⚡ ' + project.project_name + ' active: ' + data.latency_ms + 'ms latency');
            } else {
              this.showToast('Ping failed: ' + (data.error || 'Serverless unreachable'), 'error');
            }
          } catch (e) {
            this.showToast('Ping error: ' + e.message, 'error');
          } finally {
            this.pingingProjectId = null;
          }
        },

        async copyFleetUrl(project) {
          if (!project) return;
          try {
            const res = await fetch(this.getApiUrl('/api/fleet/url?project_id=' + encodeURIComponent(project.project_id)));
            if (res.ok) {
              const data = await res.json();
              if (data.database_url) {
                await navigator.clipboard.writeText(data.database_url);
                this.copiedField = 'url-' + project.id;
                this.showToast('Copied pooled connection URL for ' + project.project_name + '!');
                setTimeout(() => { if (this.copiedField === 'url-' + project.id) this.copiedField = null; }, 2000);
                return;
              }
            }
          } catch (_) {}
          if (project.masked_url) {
            await navigator.clipboard.writeText(project.masked_url);
            this.copiedField = 'url-' + project.id;
            this.showToast('Copied connection URL for ' + project.project_name + '!');
            setTimeout(() => { if (this.copiedField === 'url-' + project.id) this.copiedField = null; }, 2000);
          }
        },

        async syncAllFleetDatabasesAction() {
          this.isSyncingFleet = true;
          this.showToast('🔄 Synchronizing Hub profiles & boards across all 99 Neon database shards...');
          try {
            const res = await fetch(this.getApiUrl('/api/fleet/sync'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({})
            });
            const data = await res.json();
            if (res.ok && data.ok) {
              this.showToast('🎉 Fleet synchronized! Replicated across ' + data.successful_shards + ' shards (' + data.profiles_count + ' profiles, ' + data.boards_count + ' boards).');
              await this.fetchFleetProjects();
              await this.fetchCompetitors();
            } else {
              this.showToast('❌ Fleet sync note: ' + (data.error || 'Check server logs'));
            }
          } catch (e) {
            this.showToast('❌ Fleet sync network error: ' + e.message);
          } finally {
            this.isSyncingFleet = false;
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        async switchProject(projId) {
          this.selectedProject = projId;
          this.activeCreator = null;
          this.activeCreatorDetail = null;
          this.activeCreatorPins = [];
          this.activeCreatorAllPins = [];
          this.activeCreatorAllPinsTotal = 0;
          this.activeCreatorTopics = [];
          this.activeCreatorBoards = [];
          this.activeCreatorSnapshots = [];
          this.activeDossierSeed = null;
          this.dossierCandidates = [];
          this.competitors = [];
          this.competitorsOverview = { tracked_profiles: 0, total_pins_stored: 0, high_velocity_pins: 0, top_competitors: [] };
          this.seeds = [];
          this.overview = { total_seeds: 0, total_candidates: 0, commercial_gaps: 0, top_clusters: [] };
          this.intersections = [];
          this.pinarchivePins = [];
          this.pinarchiveOverview = { total_pins: 0, total_saves: 0, total_repins: 0, avg_velocity: 0, tracked_accounts: 0, top_cluster: null, staged_pins_count: 0 };
          this.pinarchiveTopics = [];
          this.showToast('Switched view to project: ' + projId);
          await this.refreshAll();
        },

        async fetchPinArchiveOverview() {
          try {
            const res = await fetch(this.getApiUrl('/api/pinarchive/overview'));
            if (res.ok) {
              const data = await res.json();
              this.pinarchiveOverview = data.overview || data;
            } else {
              this.pinarchiveOverview = { total_pins: 0, total_saves: 0, total_repins: 0, avg_velocity: 0, tracked_accounts: 0, top_cluster: null, staged_pins_count: 0 };
            }
          } catch (e) {
            console.error('fetchPinArchiveOverview error:', e);
            this.pinarchiveOverview = { total_pins: 0, total_saves: 0, total_repins: 0, avg_velocity: 0, tracked_accounts: 0, top_cluster: null, staged_pins_count: 0 };
          }
        },

        async fetchPinArchiveTopics() {
          try {
            const search = encodeURIComponent(this.pinarchiveTopicSearch || '');
            const res = await fetch(this.getApiUrl('/api/pinarchive/topics?search=' + search));
            if (res.ok) {
              const data = await res.json();
              this.pinarchiveTopics = data.topics || [];
            } else {
              this.pinarchiveTopics = [];
            }
          } catch (e) {
            console.error('fetchPinArchiveTopics error:', e);
            this.pinarchiveTopics = [];
          } finally {
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        async fetchPinArchivePins() {
          this.isLoadingPinArchive = true;
          try {
            const p = new URLSearchParams();
            if (this.pinarchiveSearch) p.set('search', this.pinarchiveSearch.trim());
            if (this.pinarchiveMinSaves) p.set('min_saves', this.pinarchiveMinSaves);
            if (this.pinarchiveSort) p.set('sort', this.pinarchiveSort);
            if (this.pinarchiveSelectedTopic) p.set('topic', this.pinarchiveSelectedTopic);
            if (this.pinarchiveSelectedAccount) p.set('account', this.pinarchiveSelectedAccount.trim());
            p.set('limit', '48');
            const res = await fetch(this.getApiUrl('/api/pinarchive/pins?' + p.toString()));
            if (res.ok) {
              const data = await res.json();
              this.pinarchivePins = data.pins || [];
            } else {
              this.pinarchivePins = [];
            }
          } catch (e) {
            console.error('fetchPinArchivePins error:', e);
            this.pinarchivePins = [];
          } finally {
            this.isLoadingPinArchive = false;
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        filterByTopic(topicName) {
          if (this.pinarchiveSelectedTopic === topicName) {
            this.pinarchiveSelectedTopic = '';
          } else {
            this.pinarchiveSelectedTopic = topicName;
          }
          this.fetchPinArchivePins();
        },

        async stagePinAction(pinId) {
          try {
            const res = await fetch(this.getApiUrl('/api/pinarchive/stage'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ pin_ids: [pinId], scheduled_slot: 'morning' })
            });
            if (res.ok) {
              const data = await res.json();
              const count = data.staged_count !== undefined ? data.staged_count : (data.stagedCount || 0);
              if (count > 0) {
                this.showToast('✅ Pin staged for repurposing queue! (' + count + ' added)');
                if (this.pinarchiveOverview) {
                  this.pinarchiveOverview.staged_pins_count = (this.pinarchiveOverview.staged_pins_count || 0) + count;
                }
              } else {
                this.showToast('ℹ️ Pin is already in the staged repurposing queue.');
              }
            } else {
              const err = await res.json();
              this.showToast('Failed to stage pin: ' + (err.error || 'Error'));
            }
          } catch (e) {
            this.showToast('Error staging pin: ' + e.message);
          }
        },

        async openStagedModal() {
          this.isStagedModalOpen = true;
          await this.fetchStagedPins();
          this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
        },

        async fetchStagedPins() {
          this.isLoadingStaged = true;
          try {
            const res = await fetch(this.getApiUrl('/api/pinarchive/staged?status=all&limit=50'));
            if (res.ok) {
              const data = await res.json();
              this.stagedPinsList = data.staged || data.items || [];
            }
          } catch (e) {
            console.error('fetchStagedPins error:', e);
          } finally {
            this.isLoadingStaged = false;
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        async claimStagedPinAction(stagedId) {
          try {
            const res = await fetch(this.getApiUrl('/api/pinarchive/claim-cas'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: stagedId, staged_id: stagedId, expected_version: 1 })
            });
            if (res.ok) {
              this.showToast('🚀 Pin marked dispatched via atomic CAS!');
              await this.fetchStagedPins();
              await this.fetchPinArchiveOverview();
            } else if (res.status === 409) {
              const err = await res.json();
              this.showToast('⚠️ CAS Conflict (409): ' + (err.error || 'Pin was already claimed by another worker.'));
              await this.fetchStagedPins();
            } else {
              const err = await res.json();
              this.showToast('CAS Claim conflict: ' + (err.error || 'Failed'));
            }
          } catch (e) {
            this.showToast('Claim error: ' + e.message);
          }
        },

        async fetchQualificationRules() {
          try {
            const res = await fetch(this.getApiUrl('/api/pinarchive/rules'));
            if (res.ok) {
              const data = await res.json();
              if (data.rules) {
                const r = data.rules;
                const enabled = r.master_ingest_enabled !== undefined ? Boolean(r.master_ingest_enabled) : (r.cron_enabled !== undefined ? Boolean(r.cron_enabled) : true);
                this.qualificationRules = {
                  ...this.qualificationRules,
                  ...r,
                  master_ingest_enabled: enabled,
                  cron_enabled: enabled
                };
              }
            }
          } catch (e) {
            console.error('fetchQualificationRules error:', e);
          }
        },

        async saveQualificationRulesAction() {
          this.isSavingRules = true;
          try {
            const payload = {
              ...this.qualificationRules,
              master_ingest_enabled: Boolean(this.qualificationRules.cron_enabled)
            };
            const res = await fetch(this.getApiUrl('/api/pinarchive/rules'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });
            if (res.ok) {
              const data = await res.json();
              if (data.rules) {
                const r = data.rules;
                const enabled = r.master_ingest_enabled !== undefined ? Boolean(r.master_ingest_enabled) : (r.cron_enabled !== undefined ? Boolean(r.cron_enabled) : true);
                this.qualificationRules = {
                  ...this.qualificationRules,
                  ...r,
                  master_ingest_enabled: enabled,
                  cron_enabled: enabled
                };
              }
              this.showToast('✅ Qualification rules updated successfully!');
            } else {
              const err = await res.json();
              this.showToast('Failed to save rules: ' + (err.error || 'Error'));
            }
          } catch (e) {
            this.showToast('Error saving rules: ' + e.message);
          } finally {
            this.isSavingRules = false;
          }
        },

        async reEvaluateCandidatesAction() {
          if (!confirm('Re-evaluate all archived pins against current qualification rules? Non-qualifying pins may be pruned or deactivated.')) return;
          this.isReEvaluating = true;
          try {
            const res = await fetch(this.getApiUrl('/api/pinarchive/re-evaluate'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(this.qualificationRules)
            });
            if (res.ok) {
              const data = await res.json();
              const evalTotal = data.total_evaluated ?? 0;
              const qualCount = data.qualified_count ?? 0;
              const disCount = data.disqualified_pruned ?? data.disqualified_count ?? 0;
              this.showToast('⚡ Evaluated ' + evalTotal + ' pins: ' + qualCount + ' qualified, ' + disCount + ' non-qualifying.');
              await this.fetchPinArchiveOverview();
              await this.fetchPinArchivePins();
            } else {
              const err = await res.json();
              this.showToast('Re-evaluation error: ' + (err.error || 'Failed'));
            }
          } catch (e) {
            this.showToast('Re-evaluation request failed: ' + e.message);
          } finally {
            this.isReEvaluating = false;
          }
        },

        async harvestCompetitorPinsAction(competitor, mode = 'daily') {
          if (!competitor) return;
          const handle = (competitor.username || '').replace(/^@+/, '').trim();
          const compId = competitor.id || handle;
          const crawlMode = mode === 'deep' ? 'discovery' : 'refresh';
          const maxPages = mode === 'deep' ? 500 : 3;

          this.harvestingCompetitorId = compId;
          this.showToast('⚡ Dispatching 20-shard GHA Crawler for @' + handle + ' (' + crawlMode + ' mode, max ' + maxPages + 'p)...');
          try {
            const res = await fetch(this.getApiUrl('/api/competitors/dispatch-crawl'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                username: handle,
                crawl_mode: crawlMode,
                max_pages: maxPages
              })
            });
            const data = await res.json();
            if (res.ok && data.success) {
              this.showToast('🚀 ' + (data.message || 'Crawler pipeline launched on GitHub Actions!'));
            } else {
              this.showToast('❌ Dispatch note: ' + (data.error || 'Check GitHub token configuration'));
            }
          } catch (e) {
            this.showToast('❌ Dispatch network error: ' + e.message);
          } finally {
            this.harvestingCompetitorId = null;
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        async fetchOverview() {
          try {
            const res = await fetch(this.getApiUrl('/api/overview'));
            if (res.ok) {
              this.overview = await res.json();
            } else {
              this.overview = { total_seeds: 0, total_candidates: 0, commercial_gaps: 0, top_clusters: [] };
            }
          } catch (e) {
            this.overview = { total_seeds: 0, total_candidates: 0, commercial_gaps: 0, top_clusters: [] };
          }
        },

        async fetchSeeds() {
          try {
            const res = await fetch(this.getApiUrl('/api/seeds'));
            if (res.ok) {
              this.seeds = await res.json();
            } else {
              this.seeds = [];
            }
          } catch (e) {
            this.seeds = [];
          }
        },

        async fetchIntersections() {
          try {
            const res = await fetch(this.getApiUrl('/api/intersections?min_overlap=2&limit=1000'));
            if (res.ok) {
              this.intersections = await res.json();
            } else {
              this.intersections = [];
            }
          } catch (e) {
            this.intersections = [];
          }
        },

        async loadExplorerData() {
          let url = '/api/candidates?limit=1000&sort=' + this.explorerSort;
          if (this.explorerSeedId && this.explorerSeedId !== 'all') {
            url += '&seed_pin_id=' + this.explorerSeedId;
          }
          try {
            const res = await fetch(this.getApiUrl(url));
            if (res.ok) this.explorerCandidates = await res.json();
          } catch (e) {}
          this.$nextTick(() => {
            if (window.lucide) window.lucide.createIcons();
          });
        },

        async triggerCrawl(seedPinId = null) {
          try {
            const res = await fetch(this.getApiUrl('/api/crawl'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ seed_pin_id: seedPinId })
            });
            if (res.ok) {
              this.crawlStatus.is_crawling = true;
              this.crawlElapsed = 0;
              this.startElapsedTimer();
              this.showToast('Background crawl started!');
            }
          } catch (e) {
            alert('Failed to trigger crawl: ' + e.message);
          }
        },

        startElapsedTimer() {
          if (this.crawlTimer) clearInterval(this.crawlTimer);
          this.crawlTimer = setInterval(() => {
            if (this.crawlStatus.is_crawling) {
              this.crawlElapsed++;
            } else {
              clearInterval(this.crawlTimer);
            }
          }, 1000);
        },

        async pollCrawlStatus() {
          if (this._isPollingCrawl) return;
          this._isPollingCrawl = true;
          try {
            const res = await fetch(this.getApiUrl('/api/crawl-status'));
            if (res.ok) {
              const prevCrawling = this.crawlStatus.is_crawling;
              this.crawlStatus = await res.json();
              if (prevCrawling && !this.crawlStatus.is_crawling) {
                await this.refreshAll();
                if (this.activeDossierSeed) {
                  await this.openSeedDossier(this.activeDossierSeed);
                }
                if (this.activeCreator) {
                  await this.openCreatorPage(this.activeCreator, this.activeCreatorTab);
                }
                this.showToast('Crawl completed! Data refreshed.');
              }
            }
          } catch (e) {
          } finally {
            this._isPollingCrawl = false;
          }
        },

        async fetchCookieStatus() {
          try {
            const res = await fetch(this.getApiUrl('/api/settings/cookie'));
            if (res.ok) {
              this.cookieStatus = await res.json();
            }
          } catch (e) {}
        },

        async saveCookie() {
          if (!this.cookieInput.trim()) {
            alert('يرجى لصق الكوكيز أولاً.');
            return;
          }
          this.isSavingCookie = true;
          try {
            const res = await fetch(this.getApiUrl('/api/settings/cookie'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ cookie: this.cookieInput.trim() })
            });
            if (res.ok) {
              const data = await res.json();
              this.cookieStatus = { has_cookie: data.has_cookie, preview: this.cookieInput.slice(0, 30) + '...' };
              this.isCookieModalOpen = false;
              this.showToast('✅ تم حفظ وتفعيل كوكيز بينترست بنجاح!');
            } else {
              alert('فشل حفظ الكوكيز');
            }
          } catch (err) {
            alert('حدث خطأ أثناء حفظ الكوكيز: ' + err.message);
          } finally {
            this.isSavingCookie = false;
          }
        },

        openRawJsonModal(pinId = null) {
          this.rawJsonTargetPin = pinId || (this.activeDossierSeed ? this.activeDossierSeed.pin_id : '');
          this.rawJsonInput = '';
          this.rawJsonStatusMsg = '';
          this.rawJsonIsError = false;
          this.isRawJsonModalOpen = true;
        },

        async submitRawJson() {
          if (!this.rawJsonTargetPin.trim()) {
            this.rawJsonStatusMsg = 'يرجى تحديد Target Seed Pin ID أولاً.';
            this.rawJsonIsError = true;
            return;
          }
          if (!this.rawJsonInput.trim()) {
            this.rawJsonStatusMsg = 'يرجى لصق الـ JSON الخام أولاً.';
            this.rawJsonIsError = true;
            return;
          }

          this.isSubmittingRawJson = true;
          this.rawJsonStatusMsg = 'جاري تحليل وهضم البيانات وتخزينها في قاعدة البيانات...';
          this.rawJsonIsError = false;

          try {
            const res = await fetch(this.getApiUrl('/api/seeds/import-raw-json'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                seed_pin_id: this.rawJsonTargetPin.trim(),
                raw_json: this.rawJsonInput.trim()
              })
            });

            const data = await res.json();
            if (res.ok) {
              this.rawJsonStatusMsg = '✅ تم بنجاح! تم استيراد ' + data.candidates_imported + ' كانديديت و ' + data.capsules_imported + ' كبسولة بحثية BUBBLE_ONE_COL وتثبيت كوتا الحصص في Neon.';
              this.rawJsonIsError = false;
              await this.refreshAll();
              if (this.activeDossierSeed && this.activeDossierSeed.pin_id === this.rawJsonTargetPin.trim()) {
                await this.openSeedDossier(this.activeDossierSeed);
              }
              setTimeout(() => {
                this.isRawJsonModalOpen = false;
              }, 2000);
            } else {
              this.rawJsonStatusMsg = '❌ خطأ: ' + (data.error || 'فشل استيراد البيانات');
              this.rawJsonIsError = true;
            }
          } catch (err) {
            this.rawJsonStatusMsg = '❌ خطأ في الاتصال: ' + err.message;
            this.rawJsonIsError = true;
          } finally {
            this.isSubmittingRawJson = false;
          }
        },

        openAddCompetitorModal() {
          this.newCompetitorHandle = '';
          this.newCompetitorAlsoTrack = true;
          this.newCompetitorDiscoverPins = true;
          this.newCompetitorDiscoverMode = 'daily';
          this.newCompetitorInterval = 'daily';
          this.isAddCompetitorModalOpen = true;
          this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
        },

        formatSnapshotDate(dateStr) {
          if (!dateStr) return '—';
          const d = new Date(dateStr);
          if (isNaN(d.getTime())) return '—';
          const datePart = d.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
          });
          const hours = String(d.getHours()).padStart(2, '0');
          const mins = String(d.getMinutes()).padStart(2, '0');
          return datePart + ', ' + hours + ':' + mins;
        },

        async deleteSnapshotAction(snapshotId) {
          if (!confirm('Are you sure you want to delete this snapshot?')) return;
          try {
            await fetch(this.getApiUrl('/api/competitors/snapshot?id=' + snapshotId), { method: 'DELETE' });
            this.activeCreatorSnapshots = this.activeCreatorSnapshots.filter(s => String(s.id) !== String(snapshotId));
            this.showToast('Snapshot deleted successfully.');
          } catch (e) {
            console.error('Delete snapshot error:', e);
          }
        },

        async openCreatorPage(creator, tab = 'overview') {
          if (!creator) return;
          this.activeCreator = creator;
          this.activeCreatorTab = tab || 'overview';
          this.currentTab = 'creators_archive';
          this.activePinId = null;
          this.activePinDossier = null;
          this.isCreatorDossierOpen = false;
          this.isBoardsModalOpen = false;
          this.creatorTimeRange = '7D';
          this.creatorSelectedMonth = 'all';
          this.creatorMoMMode = false;
          this.creatorChartMode = 'reach';
          this.creatorPinSearch = '';
          this.creatorPinBoard = '';
          this.creatorPinStage = '';
          this.creatorPinSavesFilter = '';
          this.creatorPinSort = 'delta_saves';
          this.creatorPinChangedOnly = false;
          this.creatorPinPage = 1;
          this.creatorSnapPage = 1;
          this.creatorBoardPage = 1;
          this.activeCreatorSelectedTopic = '';
          this.creatorTopicSearch = '';

          const handle = (creator.username || '').replace(/^@+/, '').trim().toLowerCase();
          const compId = creator.id || handle;

          // Check SWR In-Memory Cache for Instant Render (0ms)
          const cachedCreator = this._clientCache?.creators?.get(handle);
          if (cachedCreator) {
            this.activeCreator = { ...creator, ...(cachedCreator.detail?.profile || {}) };
            this.activeCreatorDetail = cachedCreator.detail;
            this.activeCreatorSnapshots = cachedCreator.detail?.snapshots || [];
            this.activeCreatorBoards = cachedCreator.detail?.boards || [];
            this.activeCreatorPins = cachedCreator.pins || [];
            this.activeCreatorWinningPinsTotal = cachedCreator.winningPinsTotal || (cachedCreator.pins ? cachedCreator.pins.length : 0);
            this.activeCreatorTopics = cachedCreator.topics || [];
            this.isCreatorLoading = false;
          } else {
            this.activeCreator = { ...creator };
            this.activeCreatorPins = [];
            this.activeCreatorWinningPinsTotal = 0;
            this.activeCreatorTopics = [];
            this.activeCreatorBoards = [];
            this.activeCreatorSnapshots = [];
            this.activeCreatorDetail = null;
            this.isCreatorLoading = true;
          }

          if (typeof window !== 'undefined') {
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
          this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });

          if (typeof window !== 'undefined' && handle) {
            let targetPath = '/' + handle;
            if (this.activeCreatorTab === 'top_urls' || this.activeCreatorTab === 'links') targetPath = '/' + handle + '/links';
            else if (this.activeCreatorTab === 'related_pins') targetPath = '/' + handle + '/related-pins';
            else if (this.activeCreatorTab === 'all_pins') targetPath = '/' + handle + '/all-pins';
            else if (this.activeCreatorTab === 'pins') targetPath = '/' + handle + '/winning-pins';
            else if (this.activeCreatorTab === 'topics') targetPath = '/' + handle + '/topics';
            else if (this.activeCreatorTab === 'boards') targetPath = '/' + handle + '/boards';
            if (window.location.pathname !== targetPath) {
              window.history.pushState({ creator: handle, tab: this.activeCreatorTab }, '', targetPath);
            }
          }

          try {
            const [detailRes, pinsRes, topicsRes] = await Promise.all([
              fetch(this.getApiUrl('/api/competitors/detail?username=' + encodeURIComponent(handle) + '&id=' + encodeURIComponent(compId))),
              fetch(this.getApiUrl('/api/pinarchive/pins?account=@' + encodeURIComponent(handle) + '&limit=500')),
              fetch(this.getApiUrl('/api/pinarchive/topics?account=@' + encodeURIComponent(handle) + '&limit=100'))
            ]);

            let freshDetail = null;
            let freshPins = null;
            let freshTopics = null;

            if (detailRes.ok) {
              freshDetail = await detailRes.json();
              this.activeCreatorDetail = freshDetail;
              this.activeCreatorSnapshots = freshDetail.snapshots || [];
              this.activeCreatorBoards = freshDetail.boards || [];
              if (freshDetail.profile) {
                this.activeCreator = { ...this.activeCreator, ...freshDetail.profile };
              }
            }

            if (pinsRes.ok) {
              const pinsData = await pinsRes.json();
              freshPins = pinsData.pins || [];
              this.activeCreatorPins = freshPins;
              this.activeCreatorWinningPinsTotal = pinsData.total ?? (freshPins.length);
            }

            if (topicsRes.ok) {
              const topicsData = await topicsRes.json();
              freshTopics = topicsData.topics || [];
              this.activeCreatorTopics = freshTopics;
            }

            // Save to SWR In-Memory Cache
            if (this._clientCache?.creators) {
              this._clientCache.creators.set(handle, {
                detail: freshDetail || cachedCreator?.detail,
                pins: freshPins || cachedCreator?.pins,
                winningPinsTotal: this.activeCreatorWinningPinsTotal,
                topics: freshTopics || cachedCreator?.topics,
                cachedAt: Date.now()
              });
            }

            const initialFetches = [
              this.fetchCreatorAllPins(),
              this.fetchCreatorRules(),
              this.fetchCreatorTopUrls()
            ];
            if (this.activeCreatorTab === 'related_pins') {
              initialFetches.push(this.fetchCreatorRelatedGraph());
            } else if (this.activeCreatorTab === 'boards') {
              initialFetches.push(this.fetchCreatorBoards());
            } else if (this.activeCreatorTab === 'topics') {
              initialFetches.push(this.fetchCreatorTopics());
            }
            await Promise.all(initialFetches);
          } catch (e) {
            console.error('openCreatorPage error:', e);
          } finally {
            this.isCreatorLoading = false;
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        switchCreatorTab(tab) {
          this.activeCreatorTab = tab;
          if (this.activeCreator) {
            const cleanU = (this.activeCreator.username || '').replace(/^@+/, '').trim().toLowerCase();
            let targetPath = '/' + cleanU;
            if (tab === 'top_urls' || tab === 'links') targetPath = '/' + cleanU + '/links';
            else if (tab === 'related_pins') targetPath = '/' + cleanU + '/related-pins';
            else if (tab === 'all_pins') targetPath = '/' + cleanU + '/all-pins';
            else if (tab === 'pins') targetPath = '/' + cleanU + '/winning-pins';
            else if (tab === 'topics') targetPath = '/' + cleanU + '/topics';
            else if (tab === 'boards') targetPath = '/' + cleanU + '/boards';

            if (typeof window !== 'undefined' && window.location.pathname !== targetPath) {
              window.history.pushState({ creator: cleanU, tab: tab }, '', targetPath);
            }

            if (tab === 'related_pins') this.fetchCreatorRelatedGraph();
            else if (tab === 'top_urls') this.fetchCreatorTopUrls();
            else if (tab === 'all_pins') this.fetchCreatorAllPins();
            else if (tab === 'boards') this.fetchCreatorBoards();
            else if (tab === 'topics') this.fetchCreatorTopics();
            else if (tab === 'pins') this.fetchCreatorWinningPins();
          }
          this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
        },

        async fetchCreatorRelatedGraph() {
          if (!this.activeCreator) return;
          this.isLoadingRelatedGraph = true;
          try {
            const handle = (this.activeCreator.username || '').replace(/^@+/, '').trim();
            const compId = this.activeCreator.id || handle;
            const p = new URLSearchParams();
            p.set('id', compId);
            p.set('min_overlap', this.creatorRelatedMinOverlap || 2);
            p.set('page', this.creatorRelatedPage || 1);
            p.set('limit', this.creatorRelatedLimit || 25);
            p.set('filter', this.creatorRelatedFilter || 'all');
            if (this.creatorRelatedSearch) p.set('search', this.creatorRelatedSearch.trim());

            const [interRes, seedsRes] = await Promise.all([
              fetch(this.getApiUrl('/api/competitors/related-pins/intersections?' + p.toString())),
              fetch(this.getApiUrl('/api/competitors/related-pins/seeds?id=' + encodeURIComponent(compId)))
            ]);

            if (interRes.ok) {
              const data = await interRes.json();
              this.creatorRelatedIntersections = data.intersections || [];
              this.creatorRelatedStats = data.stats || this.creatorRelatedStats;
              this.creatorRelatedPage = data.page || 1;
              this.creatorRelatedTotalPages = data.total_pages || 1;
            }

            if (seedsRes.ok) {
              const sData = await seedsRes.json();
              this.creatorRelatedSeeds = sData.seeds || [];
            }
          } catch (e) {
            console.error('fetchCreatorRelatedGraph error:', e);
            this.showToast('Error loading related pins graph');
          } finally {
            this.isLoadingRelatedGraph = false;
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        async addBulkSeedsAction() {
          if (!this.activeCreator || !this.bulkAddSeedsInput.trim()) return;
          this.isAddingSeeds = true;
          try {
            const compId = this.activeCreator.id || this.activeCreator.username;
            const matches = this.bulkAddSeedsInput.match(/\d{14,22}/g) || [];
            if (matches.length === 0) {
              this.showToast('No valid numeric Pin IDs found in input.');
              return;
            }
            const res = await fetch(this.getApiUrl('/api/competitors/related-pins/seeds'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ competitor_id: compId, pin_ids: matches })
            });
            const data = await res.json();
            if (data.ok) {
              this.showToast('✅ Registered ' + data.added_count + ' seeds for @' + (this.activeCreator.username || '').replace(/^@+/, '') + '!');
              this.bulkAddSeedsInput = '';
              this.isBulkAddSeedsModalOpen = false;
              await this.fetchCreatorRelatedGraph();
            } else {
              this.showToast('Failed to register seeds: ' + (data.error || 'Error'));
            }
          } catch (e) {
            console.error('addBulkSeedsAction error:', e);
            this.showToast('Error registering seeds');
          } finally {
            this.isAddingSeeds = false;
          }
        },

        async autoAddTop10WinningSeedsAction() {
          if (!this.activeCreator) return;
          this.isAddingSeeds = true;
          try {
            const compId = this.activeCreator.id || this.activeCreator.username;
            let pins = this.activeCreatorPins || [];
            if (pins.length === 0) {
              const handle = (this.activeCreator.username || '').replace(/^@+/, '').trim();
              const pinsRes = await fetch(this.getApiUrl('/api/pinarchive/pins?account=@' + encodeURIComponent(handle) + '&limit=10'));
              if (pinsRes.ok) {
                const pData = await pinsRes.json();
                pins = pData.pins || [];
              }
            }
            const top10Ids = pins.slice(0, 10).map(p => p.pin_id || p.id).filter(Boolean);
            if (top10Ids.length === 0) {
              this.showToast('No winning pins found for this account yet.');
              return;
            }
            const res = await fetch(this.getApiUrl('/api/competitors/related-pins/seeds'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ competitor_id: compId, pin_ids: top10Ids })
            });
            const data = await res.json();
            if (data.ok) {
              this.showToast('🎯 Auto-added ' + data.added_count + ' top winning seeds!');
              await this.fetchCreatorRelatedGraph();
            }
          } catch (e) {
            console.error('autoAddTop10WinningSeedsAction error:', e);
          } finally {
            this.isAddingSeeds = false;
          }
        },

        async analyzeSelectedPinsAsRelated() {
          if (!this.activeCreator || this.selectedCreatorPinIds.length === 0) return;
          const compId = this.activeCreator.id || this.activeCreator.username;
          this.isAddingSeeds = true;
          try {
            const res = await fetch(this.getApiUrl('/api/competitors/related-pins/seeds'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ competitor_id: compId, pin_ids: this.selectedCreatorPinIds })
            });
            const data = await res.json();
            if (data.ok) {
              this.showToast('🕸️ Queued ' + data.added_count + ' selected pins for Related Graph analysis!');
              this.selectedCreatorPinIds = [];
              await this.openCreatorPage(this.activeCreator, 'related_pins');
            }
          } catch (e) {
            console.error('analyzeSelectedPinsAsRelated error:', e);
          } finally {
            this.isAddingSeeds = false;
          }
        },

        async deleteSeedAction(pinId) {
          if (!confirm('Delete Seed #' + pinId + ' and its discovered related nodes?')) return;
          try {
            const compId = this.activeCreator.id || this.activeCreator.username;
            const res = await fetch(this.getApiUrl('/api/competitors/related-pins/seeds?id=' + encodeURIComponent(compId) + '&pin_id=' + encodeURIComponent(pinId)), {
              method: 'DELETE'
            });
            if (res.ok) {
              this.showToast('Seed #' + pinId + ' removed');
              await this.fetchCreatorRelatedGraph();
            }
          } catch (e) {
            console.error('deleteSeedAction error:', e);
          }
        },

        async harvestLiveSingleSeedAction(pinId) {
          if (!this.activeCreator) return;
          this.isHarvestingRelated = true;
          this.showToast('🔍 Scraping Pinterest Related Feed live for Seed #' + pinId + '...');
          try {
            const compId = this.activeCreator.id || this.activeCreator.username;
            const res = await fetch(this.getApiUrl('/api/competitors/related-pins/harvest-live'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ competitor_id: compId, pin_id: pinId })
            });
            const data = await res.json();
            if (data.ok) {
              this.showToast('✅ Discovered ' + data.discovered_count + ' related pins without cookies!');
              await this.fetchCreatorRelatedGraph();
            } else {
              this.showToast('Live scrape failed: ' + (data.error || 'Unknown error'));
            }
          } catch (e) {
            console.error('harvestLiveSingleSeedAction error:', e);
            this.showToast('Error during live harvest: ' + e.message);
          } finally {
            this.isHarvestingRelated = false;
          }
        },

        async dispatchRelatedWorkflowAction() {
          if (!this.activeCreator) return;
          const handle = (this.activeCreator.username || '').replace(/^@+/, '').trim();
          if (!confirm('Dispatch dedicated GitHub Actions Harvester for @' + handle + '? This will crawl all account seeds in parallel without cookies.')) return;
          this.isHarvestingRelated = true;
          try {
            const res = await fetch(this.getApiUrl('/api/competitors/related-pins/dispatch-workflow'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                username: handle,
                max_pages_per_seed: '2'
              })
            });
            const data = await res.json();
            if (data.success) {
              this.showToast('🚀 Dispatched GitHub Actions Harvester for @' + handle + '!');
            } else {
              this.showToast('Dispatch failed: ' + (data.error || 'Check GITHUB_TOKEN'));
            }
          } catch (e) {
            console.error('dispatchRelatedWorkflowAction error:', e);
            this.showToast('Error dispatching workflow: ' + e.message);
          } finally {
            this.isHarvestingRelated = false;
          }
        },

        async openCreatorDossier(creator, tab = 'overview') {
          return this.openCreatorPage(creator, tab);
        },

        async fetchCreatorAllPins() {
          if (!this.activeCreator) return;
          this.isLoadingAllPins = true;
          try {
            const handle = (this.activeCreator.username || '').replace(/^@+/, '').trim();
            const compId = this.activeCreator.id || handle;
            const p = new URLSearchParams();
            p.set('id', compId);
            p.set('username', handle);
            if (this.creatorAllPinSearch) p.set('search', this.creatorAllPinSearch.trim());
            if (this.creatorAllPinBoard) p.set('board', this.creatorAllPinBoard.trim());
            if (this.creatorAllPinMinSaves > 0) p.set('min_saves', this.creatorAllPinMinSaves);
            if (this.creatorAllPinSort) p.set('sort', this.creatorAllPinSort);
            if (this.creatorAllPinQualifiedOnly) p.set('qualified_only', 'true');
            if (this.creatorAllPinArticlesOnly) p.set('articles_only', 'true');
            p.set('page', this.activeCreatorAllPinsPage || 1);
            p.set('limit', 25);

            const res = await fetch(this.getApiUrl('/api/competitors/all-pins?' + p.toString()));
            if (res.ok) {
              const data = await res.json();
              this.activeCreatorAllPins = data.pins || [];
              this.activeCreatorAllPinsTotal = data.total || 0;
              this.activeCreatorAllPinsPage = data.page || 1;
              this.activeCreatorAllPinsTotalPages = data.total_pages || 1;
              if (data.boards) this.activeCreatorAllPinsBoards = data.boards;
            }
          } catch (e) {
            console.error('fetchCreatorAllPins error:', e);
          } finally {
            this.isLoadingAllPins = false;
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        async fetchCreatorRules() {
          if (!this.activeCreator?.id) return;
          try {
            const res = await fetch(this.getApiUrl('/api/competitors/rules?id=' + this.activeCreator.id));
            if (res.ok) {
              const data = await res.json();
              if (data.rules) {
                this.creatorRules = { ...this.creatorRules, ...data.rules };
              }
            }
          } catch (e) {
            console.error('fetchCreatorRules error:', e);
          }
        },

        async saveCreatorRulesAction() {
          if (!this.activeCreator?.id) return;
          this.isSavingCreatorRules = true;
          try {
            const res = await fetch(this.getApiUrl('/api/competitors/rules'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                competitor_id: this.activeCreator.id,
                rules: this.creatorRules
              })
            });
            if (res.ok) {
              this.showToast('✅ Qualification rules saved for @' + (this.activeCreator.username || '').replace(/^@+/, ''));
            } else {
              this.showToast('Failed to save rules');
            }
          } catch (e) {
            console.error('saveCreatorRules error:', e);
            this.showToast('Error saving rules');
          } finally {
            this.isSavingCreatorRules = false;
          }
        },

        async reEvaluateCreatorPinsAction() {
          if (!this.activeCreator?.id) return;
          this.isReEvaluatingCreatorPins = true;
          this.reEvaluateMessage = '';
          try {
            const res = await fetch(this.getApiUrl('/api/competitors/re-evaluate'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ competitor_id: this.activeCreator.id })
            });
            const data = await res.json();
            if (data.ok) {
              this.reEvaluateMessage = 'Qualified ' + data.qualified_count + ' pins into archive based on active rules!';
              this.showToast('🎯 Re-evaluation complete: ' + data.qualified_count + ' pins qualified');
              if (typeof this.fetchCreatorWinningPins === 'function') {
                this.fetchCreatorWinningPins(this.activeCreator);
              }
            } else {
              this.showToast('Re-evaluation error: ' + (data.error || 'Failed'));
            }
          } catch (e) {
            console.error('reEvaluate error:', e);
            this.showToast('Failed to re-evaluate');
          } finally {
            this.isReEvaluatingCreatorPins = false;
          }
        },

        async fetchCreatorTopUrls() {
          if (!this.activeCreator) return;
          this.isLoadingTopUrls = true;
          try {
            const handle = (this.activeCreator.username || '').replace(/^@+/, '').trim();
            const compId = this.activeCreator.id || handle;
            const p = new URLSearchParams();
            p.set('id', compId);
            if (this.creatorTopUrlSearch) p.set('search', this.creatorTopUrlSearch.trim());
            if (this.creatorTopUrlSort) p.set('sort', this.creatorTopUrlSort);
            if (this.creatorTopUrlFilterType) p.set('filter_type', this.creatorTopUrlFilterType);
            p.set('page', this.creatorTopUrlsPage || 1);
            p.set('limit', 50);

            const res = await fetch(this.getApiUrl('/api/competitors/top-urls?' + p.toString()));
            if (res.ok) {
              const data = await res.json();
              this.activeCreatorTopUrls = data.urls || [];
              this.creatorTopUrlsTotal = data.total || 0;
              this.creatorTopUrlsPage = data.page || 1;
              this.creatorTopUrlsTotalPages = data.total_pages || 1;
            }
          } catch (e) {
            console.error('fetchCreatorTopUrls error:', e);
          } finally {
            this.isLoadingTopUrls = false;
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        async harvestAllAccountPinsAction(creator) {
          return this.openGhaCrawlerModal(creator);
        },

        // Dedicated Pin Detail Page & Dossier Action Methods (Route: /pin/:id)
        async openPinPage(pinOrId, updateHistory = true, forceRefresh = false) {
          if (!pinOrId) return;
          const pinId = typeof pinOrId === 'object' ? String(pinOrId.pin_id || pinOrId.id || '') : String(pinOrId);
          if (!pinId) return;

          // Check SWR In-Memory Cache for Instant Render
          const cachedPin = (!forceRefresh && this._clientCache?.pins) ? this._clientCache.pins.get(pinId) : null;
          if (cachedPin) {
            this.activePinDossier = { ...cachedPin.pin };
            this.pinDossierSnapshots = cachedPin.snapshots || [];
            this.isLoadingPinDossier = false;
          } else if (typeof pinOrId === 'object') {
            this.activePinDossier = {
              ...pinOrId,
              pin_id: pinId,
              saves: Number(pinOrId.saves || pinOrId.save_count || 0),
              repins: Number(pinOrId.repins || pinOrId.repin_count || 0),
              comments: Number(pinOrId.comments || pinOrId.comment_count || 0),
              share_count: Number(pinOrId.share_count || 0),
              velocity: Number(pinOrId.velocity || 0),
              dominant_color: pinOrId.dominant_color || '#a88d56'
            };
            this.isLoadingPinDossier = true;
          } else {
            this.activePinDossier = {
              pin_id: pinId,
              saves: 0,
              repins: 0,
              comments: 0,
              share_count: 0,
              velocity: 0,
              dominant_color: '#a88d56'
            };
            this.isLoadingPinDossier = true;
          }

          if (typeof window !== 'undefined' && !this.previousPinPath && window.location.pathname !== ('/pin/' + pinId)) {
            this.previousPinPath = window.location.pathname;
          }

          this.activePinId = pinId;
          this.isPinDossierOpen = true;
          this.pinDossierTimeframe = '7d';
          if (!cachedPin) {
            this.pinDossierSnapshots = [];
          }

          if (typeof window !== 'undefined') {
            window.scrollTo({ top: 0, behavior: 'smooth' });
            if (updateHistory) {
              let targetPath = '/pin/' + pinId;
              if (this.activeCreator && this.activeCreator.username) {
                const cleanU = (this.activeCreator.username || '').replace(/^@+/, '').trim().toLowerCase();
                targetPath = '/' + cleanU + '/pin/' + pinId;
              }
              if (window.location.pathname !== targetPath) {
                window.history.pushState({ pinId: pinId }, '', targetPath);
              }
            }
            document.title = (this.activePinDossier.title ? this.activePinDossier.title + ' | ' : '') + 'Pin #' + pinId + ' | Pinterest Intelligence';
          }

          if (forceRefresh) {
            this.showToast('🔍 Scraping live Pinterest HTML for Pin #' + pinId + ' without cookies...');
          }

          try {
            const refreshParam = forceRefresh ? '&refresh=true' : '';
            const res = await fetch(this.getApiUrl('/api/pinarchive/pin-detail?pin_id=' + encodeURIComponent(pinId) + refreshParam));
            if (res.ok) {
              const data = await res.json();
              if (data.pin) {
                this.activePinDossier = { ...this.activePinDossier, ...data.pin };
                if (typeof window !== 'undefined' && data.pin.title) {
                  document.title = data.pin.title + ' | Pin #' + pinId + ' | Pinterest Intelligence';
                }
                if (typeof window !== 'undefined' && !this.activeCreator && data.pin.account_username) {
                  const cleanU = (data.pin.account_username || '').replace(/^@+/, '').trim().toLowerCase();
                  if (cleanU) {
                    window.history.replaceState({ pinId: pinId }, '', '/' + cleanU + '/pin/' + pinId);
                  }
                }
              }
              this.pinDossierSnapshots = data.snapshots || [];
              if (this._clientCache?.pins && data.pin) {
                this._clientCache.pins.set(pinId, {
                  pin: this.activePinDossier,
                  snapshots: this.pinDossierSnapshots,
                  cachedAt: Date.now()
                });
              }
              if (forceRefresh) {
                this.showToast('✅ Pin live metrics refreshed from Pinterest without cookies!');
              }
            } else {
              if (forceRefresh) {
                this.showToast('❌ Live refresh could not reach Pinterest page.');
              }
            }
          } catch (err) {
            console.error('Failed to load pin detail dossier:', err);
            if (forceRefresh) {
              this.showToast('❌ Error during live refresh: ' + err.message);
            }
          } finally {
            this.isLoadingPinDossier = false;
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        closePinPage(updateHistory = true) {
          this.activePinId = null;
          this.isPinDossierOpen = false;
          this.activePinDossier = null;
          const returnPath = this.previousPinPath;
          this.previousPinPath = null;

          if (updateHistory && typeof window !== 'undefined') {
            let targetPath = '/';
            if (this.activeBoardName && (this.activeBoardCreator || this.activeCreator)) {
              const creator = this.activeBoardCreator || this.activeCreator;
              const cleanUser = (creator.username || '').replace(/^@+/, '').trim();
              const boardSlug = encodeURIComponent(this.activeBoardName.toLowerCase().replace(/\s+/g, '-'));
              targetPath = '/' + cleanUser + '/' + boardSlug;
              document.title = this.activeBoardName + ' | @' + cleanUser + ' | Pinterest Intelligence';
            } else if (this.activeCreator) {
              const cleanUser = (this.activeCreator.username || '').replace(/^@+/, '').trim().toLowerCase();
              targetPath = '/' + cleanUser;
              if (this.activeCreatorTab === 'top_urls') targetPath = '/' + cleanUser + '/links';
              else if (this.activeCreatorTab === 'related_pins') targetPath = '/' + cleanUser + '/related-pins';
              else if (this.activeCreatorTab === 'all_pins') targetPath = '/' + cleanUser + '/all-pins';
              else if (this.activeCreatorTab === 'pins') targetPath = '/' + cleanUser + '/winning-pins';
              else if (this.activeCreatorTab === 'topics') targetPath = '/' + cleanUser + '/topics';
              else if (this.activeCreatorTab === 'boards') targetPath = '/' + cleanUser + '/boards';
              document.title = '@' + cleanUser + ' | Creator Intelligence | Pin Arbitrage Engine';
            } else if (returnPath && !returnPath.startsWith('/pin/')) {
              targetPath = returnPath;
              document.title = 'Pin Arbitrage Engine | Pinterest Intelligence Dashboard';
            }
            if (window.location.pathname !== targetPath) {
              window.history.pushState({}, '', targetPath);
            }
          }
          if (typeof window !== 'undefined') {
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
          this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
        },

        // Backwards compatibility wrappers
        async openPinDossier(pin) {
          return this.openPinPage(pin, true);
        },

        closePinDossier() {
          return this.closePinPage(true);
        },

        // Dedicated Board Detail Page Action Methods (Route: /:username/:board)
        async openBoardPage(boardOrName, creator = null, updateHistory = true) {
          if (!boardOrName) return;
          const boardName = typeof boardOrName === 'object' ? (boardOrName.name || '') : String(boardOrName);
          if (!boardName) return;

          const targetCreator = creator || this.activeCreator;
          const cleanUser = targetCreator ? (targetCreator.username || '').replace(/^@+/, '').trim().toLowerCase() : '';
          const cacheKey = cleanUser + ':' + boardName.toLowerCase();

          this.activeBoardName = boardName;
          this.activeBoardCreator = targetCreator;

          // Check SWR In-Memory Cache for Instant Render (0ms)
          const cachedBoard = this._clientCache?.boards?.get(cacheKey);
          if (cachedBoard) {
            this.activeBoard = cachedBoard.board;
            this.boardPins = cachedBoard.pins || [];
            this.boardPinsTotal = cachedBoard.pinsTotal || this.boardPins.length;
            this.isLoadingBoardPins = false;
          } else {
            // Find full board metadata from activeCreatorBoards if available
            let foundBoard = null;
            if (typeof boardOrName === 'object' && boardOrName.name && (boardOrName.pin_count || boardOrName.image_cover_url || boardOrName.url)) {
              foundBoard = boardOrName;
            } else if (this.activeCreatorBoards && this.activeCreatorBoards.length > 0) {
              foundBoard = this.activeCreatorBoards.find(b => (b.name || '').toLowerCase() === boardName.toLowerCase());
            }
            this.activeBoard = foundBoard || {
              name: boardName,
              url: targetCreator ? ('https://www.pinterest.com/' + cleanUser + '/' + encodeURIComponent(boardName.toLowerCase().replace(/\s+/g, '-'))) : null,
              pin_count: 0,
              follower_count: 0,
              image_cover_url: null,
              description: null,
              board_vase: []
            };
            this.boardPins = [];
            this.isLoadingBoardPins = true;
          }

          this.boardPinsSearch = '';
          this.boardPinsFilter = 'all';
          this.boardPinsSort = 'saves_desc';
          this.boardPinsPage = 1;
          this.boardPinsPageSize = 24;

          if (typeof window !== 'undefined') {
            window.scrollTo({ top: 0, behavior: 'smooth' });
            if (updateHistory && targetCreator) {
              const boardSlug = encodeURIComponent(boardName.toLowerCase().replace(/\s+/g, '-'));
              const targetPath = '/' + cleanUser + '/' + boardSlug;
              if (window.location.pathname !== targetPath) {
                window.history.pushState({ board: boardName, username: cleanUser }, '', targetPath);
              }
            }
            document.title = boardName + ' | ' + (targetCreator ? '@' + cleanUser + ' | ' : '') + 'Pinterest Intelligence';
          }

          try {
            const compId = targetCreator ? (targetCreator.id || cleanUser) : '';
            const p = new URLSearchParams();
            if (compId) p.set('id', compId);
            if (cleanUser) p.set('username', cleanUser);
            p.set('board', boardName);
            p.set('limit', 1000);

            const [pinsRes, detailRes] = await Promise.all([
              fetch(this.getApiUrl('/api/competitors/all-pins?' + p.toString())),
              cleanUser ? fetch(this.getApiUrl('/api/competitors/board-detail?username=' + encodeURIComponent(cleanUser) + '&board=' + encodeURIComponent(boardName))) : Promise.resolve(null)
            ]);

            let updatedBoard = { ...this.activeBoard };
            if (detailRes && detailRes.ok) {
              const dData = await detailRes.json();
              if (dData.board) {
                updatedBoard = {
                  ...updatedBoard,
                  ...dData.board,
                  board_vase: Array.isArray(dData.board.board_vase) ? dData.board.board_vase : (updatedBoard.board_vase || [])
                };
                this.activeBoard = updatedBoard;
              }
            }

            let freshPins = this.boardPins;
            if (pinsRes && pinsRes.ok) {
              const data = await pinsRes.json();
              freshPins = data.pins || [];
              this.boardPins = freshPins;
              this.boardPinsTotal = data.total || this.boardPins.length;
              if (this.boardPins.length > 0 && (!this.activeBoard.pin_count || this.activeBoard.pin_count === 0)) {
                this.activeBoard.pin_count = this.boardPinsTotal;
              }
            }

            // Save to SWR In-Memory Cache
            if (this._clientCache?.boards) {
              this._clientCache.boards.set(cacheKey, {
                board: this.activeBoard,
                pins: freshPins,
                pinsTotal: this.boardPinsTotal,
                cachedAt: Date.now()
              });
            }
          } catch (err) {
            console.error('Failed to load board pins:', err);
            this.showToast('Error loading pins for board: ' + boardName);
          } finally {
            this.isLoadingBoardPins = false;
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        async refreshBoardDetail() {
          if (!this.activeBoardName) return;
          const creator = this.activeBoardCreator || this.activeCreator;
          const handle = creator ? (creator.username || '').replace(/^@+/, '').trim() : '';
          if (!handle) return;
          this.showToast('🔍 Scraping authentic Related Interests (board_vase) from Pinterest...');
          try {
            const res = await fetch(this.getApiUrl('/api/competitors/board-detail?username=' + encodeURIComponent(handle) + '&board=' + encodeURIComponent(this.activeBoardName) + '&refresh=true'));
            if (res.ok) {
              const data = await res.json();
              if (data.board) {
                this.activeBoard = {
                  ...this.activeBoard,
                  ...data.board,
                  board_vase: Array.isArray(data.board.board_vase) ? data.board.board_vase : []
                };
                this.showToast('✅ Discovered ' + (this.activeBoard.board_vase?.length || 0) + ' algorithmic Related Topics (board_vase)!');
              }
            } else {
              this.showToast('❌ Could not refresh board topics from Pinterest.');
            }
          } catch (e) {
            this.showToast('❌ Error refreshing board: ' + e.message);
          } finally {
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        closeBoardPage(updateHistory = true) {
          this.activeBoardName = null;
          this.activeBoard = null;
          this.boardPins = [];
          this.boardPinsSearch = '';
          this.boardPinsPage = 1;

          if (updateHistory && typeof window !== 'undefined') {
            let targetPath = '/';
            if (this.activeCreator) {
              targetPath = '/' + (this.activeCreator.username || '').replace(/^@+/, '').trim();
            }
            if (window.location.pathname !== targetPath) {
              window.history.pushState({}, '', targetPath);
            }
            document.title = this.activeCreator ? ('@' + (this.activeCreator.username || '').replace(/^@+/, '') + ' | Creator Intelligence | Pin Arbitrage Engine') : 'Pin Arbitrage Engine | Pinterest Intelligence Dashboard';
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
          this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
        },

        copyPinField(type, text) {
          if (!text) return;
          navigator.clipboard.writeText(String(text));
          this.showToast('Copied ' + type + ' to clipboard!');
        },

        async deletePinSnapshot(snapshotId) {
          if (!confirm('Are you sure you want to delete this historical metric snapshot?')) return;
          try {
            const res = await fetch(this.getApiUrl('/api/pinarchive/pin-snapshot?id=' + encodeURIComponent(snapshotId) + '&pin_id=' + encodeURIComponent(this.activePinDossier.pin_id)), {
              method: 'DELETE'
            });
            if (res.ok) {
              this.showToast('Metric snapshot deleted');
              await this.openPinPage(this.activePinDossier, false);
            }
          } catch (err) {
            console.error('Failed to delete snapshot:', err);
          }
        },

        async fetchCreatorBoards(creator = this.activeCreator) {
          if (!creator) return;
          const targetId = creator.id || (creator.username || '').replace(/^@+/, '').trim();
          if (!targetId) return;
          const cleanUser = (creator.username || '').replace(/^@+/, '').trim();
          this.isLoadingBoards = true;
          try {
            const res = await fetch(this.getApiUrl('/api/competitors/boards?competitor_id=' + encodeURIComponent(targetId) + (cleanUser ? '&username=' + encodeURIComponent(cleanUser) : '')));
            if (res.ok) {
              const data = await res.json();
              this.activeCreatorBoards = data.boards || [];
              this.competitorBoardsList = data.boards || [];
              if (this.activeCreator && (this.activeCreator.id === creator.id || this.activeCreator.username === creator.username)) {
                this.activeCreator.total_boards = Math.max(Number(this.activeCreator.total_boards || 0), this.activeCreatorBoards.length);
              }
            }
          } catch (e) {
            console.error('fetchCreatorBoards error:', e);
          } finally {
            this.isLoadingBoards = false;
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        async fetchCreatorWinningPins(creator = this.activeCreator) {
          if (!creator) return;
          const handle = (creator.username || '').replace(/^@+/, '').trim();
          if (!handle) return;
          try {
            const res = await fetch(this.getApiUrl('/api/pinarchive/pins?account=@' + encodeURIComponent(handle) + '&limit=500'));
            if (res.ok) {
              const data = await res.json();
              this.activeCreatorPins = data.pins || [];
              this.activeCreatorWinningPinsTotal = data.total ?? (data.pins ? data.pins.length : 0);
            }
          } catch (e) {
            console.error('fetchCreatorWinningPins error:', e);
          } finally {
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        async fetchCreatorTopics(creator = this.activeCreator) {
          if (!creator) return;
          const handle = (creator.username || '').replace(/^@+/, '').trim();
          if (!handle) return;
          try {
            const res = await fetch(this.getApiUrl('/api/pinarchive/topics?account=@' + encodeURIComponent(handle) + '&limit=100'));
            if (res.ok) {
              const data = await res.json();
              this.activeCreatorTopics = data.topics || [];
            }
          } catch (e) {
            console.error('fetchCreatorTopics error:', e);
          } finally {
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        closeCreatorProfile(updateHistory = true) {
          this.activeCreator = null;
          this.activeCreatorDetail = null;
          this.isCreatorDossierOpen = false;
          this.isBoardsModalOpen = false;
          this.selectedCreatorPinIds = [];
          if (updateHistory && typeof window !== 'undefined' && window.location.pathname !== '/') {
            window.history.pushState({}, '', '/');
          }
          this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
        },

        async openCreatorByHandle(handle, tab = 'overview') {
          const clean = (handle || '').replace(/^@+/, '').trim();
          if (!clean) return;
          const existing = (this.competitors || []).find(c => (c.username || '').toLowerCase() === clean.toLowerCase());
          if (existing) {
            await this.openCreatorPage(existing, tab);
          } else {
            await this.openCreatorPage({ username: clean, display_name: clean }, tab);
          }
        },

        openGhaCrawlerModal(creator = null, options = {}) {
          const target = creator || this.activeCreator;
          if (!target) return;
          this.ghaTargetAccount = (target.username || '').replace(/^@+/, '').trim();
          this.ghaCrawlMode = options.mode || 'discovery';
          if (options.scope === 'custom') {
            this.ghaBoardScope = 'custom';
            this.ghaTargetBoards = Array.isArray(options.boards) ? [...options.boards] : [];
          } else if (this.ghaBoardScope === 'custom' && this.ghaTargetBoards.length > 0 && !options.scope) {
            // Keep existing custom selection if caller set it
          } else {
            this.ghaBoardScope = 'all';
            this.ghaTargetBoards = [];
          }
          this.ghaBoardSearch = '';
          this.isGhaCrawlerModalOpen = true;
          this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
        },

        crawlSingleBoardGha(boardName) {
          if (!boardName || !this.activeCreator) return;
          this.openGhaCrawlerModal(this.activeCreator, {
            scope: 'custom',
            boards: [boardName]
          });
        },

        filterPinsByBoard(boardName) {
          if (!boardName) return;
          this.activeCreatorTab = 'all_pins';
          this.creatorAllPinBoard = boardName;
          this.activeCreatorAllPinsPage = 1;
          this.fetchCreatorAllPins();
          this.showToast('📋 Filtered discovered pins for board: ' + boardName);
        },

        filterWinningPinsByBoard(boardName) {
          if (!boardName) return;
          this.activeCreatorTab = 'pins';
          this.creatorPinBoard = boardName;
          this.showToast('📌 Showing winning pins for board: ' + boardName);
        },

        toggleGhaBoardSelection(boardName) {
          if (!boardName) return;
          const idx = this.ghaTargetBoards.indexOf(boardName);
          if (idx >= 0) {
            this.ghaTargetBoards.splice(idx, 1);
          } else {
            this.ghaTargetBoards.push(boardName);
          }
        },

        selectAllGhaBoards() {
          this.ghaTargetBoards = (this.activeCreatorBoards || []).map(b => b.name).filter(Boolean);
        },

        deselectAllGhaBoards() {
          this.ghaTargetBoards = [];
        },

        async submitGhaCrawlerDispatch() {
          const handle = (this.ghaTargetAccount || '').replace(/^@+/, '').trim();
          if (!handle) return;
          this.isDispatchingGitHubCrawl = true;
          this.isGhaCrawlerModalOpen = false;

          const targetBoards = this.ghaBoardScope === 'custom' ? this.ghaTargetBoards.join(',') : '';
          const boardMsg = targetBoards ? (' (' + this.ghaTargetBoards.length + ' selected board(s))') : ' (Board-level sharded across 20 nodes)';
          this.showToast('⚡ Dispatching 20-shard GHA crawler for @' + handle + boardMsg + '...');

          try {
            const res = await fetch(this.getApiUrl('/api/competitors/dispatch-crawl'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                username: handle,
                crawl_mode: this.ghaCrawlMode,
                max_pages: this.ghaCrawlMode === 'refresh' ? 3 : 500,
                target_boards: targetBoards
              })
            });
            const data = await res.json();
            if (res.ok && data.success) {
              this.showToast('🚀 ' + (data.message || 'Crawler pipeline launched on GitHub Actions!'));
            } else {
              this.showToast('❌ Dispatch failed: ' + (data.error || 'Check GitHub token configuration'));
            }
          } catch (err) {
            this.showToast('❌ Network error: ' + err.message);
          } finally {
            this.isDispatchingGitHubCrawl = false;
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        async dispatchCreatorGitHubCrawlAction(creator, mode = 'discovery') {
          return this.openGhaCrawlerModal(creator);
        },

        async toggleCompetitorStatus(creator) {
          if (!creator) return;
          const newStatus = creator.is_active === false;
          const targetId = creator.id || creator.username;
          try {
            const res = await fetch(this.getApiUrl('/api/competitors/status'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: targetId, is_active: newStatus })
            });
            if (res.ok) {
              creator.is_active = newStatus;
              if (this.activeCreator && (this.activeCreator.id === creator.id || this.activeCreator.username === creator.username)) {
                this.activeCreator.is_active = newStatus;
              }
              const existing = (this.competitors || []).find(c => c.id === creator.id || c.username === creator.username);
              if (existing) existing.is_active = newStatus;
              this.showToast(newStatus ? '✅ Competitor resumed.' : '⏸ Competitor paused.');
            } else {
              this.showToast('Failed to update status', 'error');
            }
          } catch (e) {
            console.error('toggleCompetitorStatus error:', e);
            this.showToast('Error updating competitor status', 'error');
          }
        },

        exportCandidatesCSV(items, filename = 'related-pins-candidates.csv') {
          const data = items || this.filteredExplorerCandidates || this.candidates || [];
          if (!data || data.length === 0) {
            this.showToast('No candidate data to export.', 'info');
            return;
          }
          const headers = ['candidate_pin_id', 'domain', 'frequency', 'composite_score', 'shared_seed_count', 'board_diversity_count', 'created_at'];
          const rows = data.map(c => [
            c.candidate_pin_id || '',
            c.domain || '',
            c.frequency || 0,
            c.composite_score || 0,
            c.shared_seed_count || 0,
            c.board_diversity_count || 0,
            c.created_at || ''
          ]);
          const csvContent = [headers.join(','), ...rows.map(r => r.map(val => '"' + String(val).replace(/"/g, '""') + '"').join(','))].join(String.fromCharCode(10));
          const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.setAttribute('href', url);
          link.setAttribute('download', filename);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          this.showToast('✅ Exported ' + data.length + ' candidates to CSV.');
        },

        setCreatorPinPace(pace) {
          this.creatorPinPace = pace;
          if (pace === '24h') this.creatorPinSort = 'delta_saves';
          else if (pace === '3d') this.creatorPinSort = 'delta_3d';
          else if (pace === '7d') this.creatorPinSort = 'delta_7d';
          else if (pace === 'all') this.creatorPinSort = 'saves';
        },

        toggleCreatorPinSelection(pinId) {
          const s = String(pinId);
          const idx = this.selectedCreatorPinIds.findIndex(id => String(id) === s);
          if (idx > -1) {
            this.selectedCreatorPinIds.splice(idx, 1);
          } else {
            this.selectedCreatorPinIds.push(s);
          }
        },

        toggleSelectAllCreatorPins() {
          const currentPageIds = this.paginatedCreatorPins.map(p => String(p.pin_id));
          const allSelected = currentPageIds.length > 0 && currentPageIds.every(id => this.selectedCreatorPinIds.map(String).includes(id));
          if (allSelected) {
            this.selectedCreatorPinIds = this.selectedCreatorPinIds.filter(id => !currentPageIds.includes(String(id)));
          } else {
            for (const id of currentPageIds) {
              if (!this.selectedCreatorPinIds.map(String).includes(id)) {
                this.selectedCreatorPinIds.push(id);
              }
            }
          }
        },

        async stageSelectedCreatorPins() {
          if (!this.selectedCreatorPinIds.length) {
            this.showToast('No pins selected.', 'info');
            return;
          }
          const count = this.selectedCreatorPinIds.length;
          try {
            const res = await fetch(this.getApiUrl('/api/pinarchive/stage'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ pinIds: this.selectedCreatorPinIds })
            });
            if (res.ok) {
              this.showToast('✅ Successfully staged ' + count + ' pin(s)!');
              this.selectedCreatorPinIds = [];
            } else {
              this.showToast('Failed to stage pins.', 'error');
            }
          } catch (e) {
            console.error('stageSelectedCreatorPins error:', e);
            this.showToast('Error staging pins.', 'error');
          }
        },

        openCreatorDossierByName(username) {
          if (!username) return;
          const clean = username.replace(/^@+/, '').trim().toLowerCase();
          const existing = (this.competitors || []).find(c => (c.username || '').toLowerCase() === clean);
          if (existing) {
            this.openCreatorPage(existing, 'overview');
          } else {
            this.openCreatorPage({ username: clean, display_name: clean }, 'overview');
          }
        },

        async submitTrackCreatorUnified() {
          let raw = (this.newCompetitorHandle || '').trim();
          if (!raw) return;

          // Client-side Pinterest URL or handle parsing
          let handle = raw;
          if (handle.includes('pinterest.com/')) {
            try {
              const parsed = new URL(handle.startsWith('http') ? handle : 'https://' + handle);
              const parts = parsed.pathname.split('/').filter(Boolean);
              if (parts.length > 0) handle = parts[0];
            } catch (_) {
              handle = handle.split('pinterest.com/')[1].split('/')[0].split('?')[0];
            }
          }
          handle = handle.replace(/^@+/, '').trim();
          if (!handle) return;

          this.isSubmittingCreator = true;
          try {
            // 1. If also track in Competitors Intelligence
            if (this.newCompetitorAlsoTrack) {
              const res = await fetch(this.getApiUrl('/api/competitors'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: handle })
              });
              if (res.ok) {
                this.showToast('✅ Creator @' + handle + ' added to tracking!');
                // Kick off live profile sync
                this.syncCompetitor(handle);
              }
            }

            // 2. If discover pins immediately -> Dispatch to 20-Shard GitHub Actions Crawler
            if (this.newCompetitorDiscoverPins) {
              const crawlMode = this.newCompetitorDiscoverMode === 'deep' ? 'discovery' : 'refresh';
              const maxPages = this.newCompetitorDiscoverMode === 'deep' ? 500 : 3;
              this.showToast('⚡ Dispatching 20-shard GHA Crawler for @' + handle + ' (' + crawlMode + ' mode)...');
              
              const resPins = await fetch(this.getApiUrl('/api/competitors/dispatch-crawl'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  username: handle,
                  crawl_mode: crawlMode,
                  max_pages: maxPages
                })
              });
              if (resPins.ok) {
                const data = await resPins.json();
                this.showToast('🚀 ' + (data.message || '20-Shard Crawler dispatched on GitHub Actions!'));
              }
            }

            // Reset modal & refresh
            this.newCompetitorHandle = '';
            this.isAddCompetitorModalOpen = false;
            await this.fetchCompetitors();
            await this.fetchPinArchiveOverview();
            await this.fetchPinArchivePins();
          } catch (e) {
            this.showToast('Error tracking creator: ' + e.message);
          } finally {
            this.isSubmittingCreator = false;
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        async submitAddCompetitor() {
          return this.submitTrackCreatorUnified();
        },

        async cancelStagedPinAction(stagedId) {
          if (!confirm('Remove this pin from the staged queue?')) return;
          try {
            const res = await fetch(this.getApiUrl('/api/pinarchive/staged?id=' + encodeURIComponent(stagedId)), {
              method: 'DELETE'
            });
            if (res.ok) {
              this.showToast('Pin removed from staged queue.');
              await this.fetchStagedPins();
              await this.fetchPinArchiveOverview();
            } else {
              const err = await res.json();
              this.showToast('Failed to cancel staged pin: ' + (err.error || 'Error'));
            }
          } catch (e) {
            this.showToast('Cancel error: ' + e.message);
          }
        },

        async submitAddKeyword() {
          const kw = this.newKeywordText.trim();
          if (!kw) return;
          try {
            const res = await fetch(this.getApiUrl('/api/keywords'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ keyword: kw, category: this.newKeywordCategory })
            });
            if (res.ok) {
              const created = await res.json();
              this.newKeywordText = '';
              this.isAddKeywordModalOpen = false;
              await this.fetchKeywords();
              this.showToast('Keyword "' + kw + '" tracked successfully!');
              if (created?.keyword?.id) {
                this.syncKeyword(created.keyword.id);
              }
            }
          } catch (e) {
            this.showToast('Failed to track keyword: ' + e.message);
          }
        },

        async submitAddFleetProject() {
          if (!this.newFleetProjectId.trim() || !this.newFleetDatabaseUrl.trim()) return;
          try {
            const res = await fetch(this.getApiUrl('/api/fleet/projects'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                project_id: this.newFleetProjectId.trim(),
                project_name: this.newFleetProjectName.trim() || this.newFleetProjectId.trim(),
                database_url: this.newFleetDatabaseUrl.trim()
              })
            });
            if (res.ok) {
              this.newFleetProjectId = '';
              this.newFleetProjectName = '';
              this.newFleetDatabaseUrl = '';
              this.isAddFleetModalOpen = false;
              await this.fetchFleetProjects();
              this.showToast('Neon project registered in fleet!');
            }
          } catch (e) {
            this.showToast('Failed to register project: ' + e.message);
          }
        },

        toggleSeedSelection(pinId) {
          if (this.selectedSeedIds.includes(pinId)) {
            this.selectedSeedIds = this.selectedSeedIds.filter(id => id !== pinId);
          } else {
            this.selectedSeedIds.push(pinId);
          }
          this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
        },

        toggleSelectAllSeeds() {
          const currentFilteredIds = this.filteredSeeds.map(s => s.pin_id);
          if (this.isAllSeedsSelected) {
            this.selectedSeedIds = this.selectedSeedIds.filter(id => !currentFilteredIds.includes(id));
          } else {
            const set = new Set([...this.selectedSeedIds, ...currentFilteredIds]);
            this.selectedSeedIds = Array.from(set);
          }
          this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
        },

        openAddSeedModal(tab = 'bulk') {
          this.addSeedTab = tab;
          this.isAddSeedOpen = true;
          this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
        },

        async submitBulkSeeds() {
          const pinIds = this.bulkParsedPinIds;
          if (pinIds.length === 0) {
            alert('No valid Pin IDs detected');
            return;
          }
          this.isSubmittingBulk = true;
          try {
            const res = await fetch(this.getApiUrl('/api/seeds/bulk'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                pin_ids: pinIds,
                label_prefix: this.bulkLabelPrefix.trim() || 'Tracked Seed',
                is_competitor: Boolean(this.bulkIsCompetitor)
              })
            });

            if (res.ok) {
              const data = await res.json();
              this.showToast('✅ Successfully imported ' + data.count + ' seeds into Neon!');
              this.bulkPinsInput = '';
              this.isAddSeedOpen = false;
              await this.refreshAll();

              if (this.bulkAutoCrawl) {
                if (this.bulkCrawlEngine === 'workflow') {
                  await this.triggerWorkflowRun(pinIds.join(','));
                } else {
                  await this.triggerCrawl(pinIds);
                }
              }
            } else {
              const err = await res.json();
              alert('Error importing bulk seeds: ' + (err.error || 'Failed'));
            }
          } catch (e) {
            alert('Failed to import bulk seeds: ' + e.message);
          } finally {
            this.isSubmittingBulk = false;
          }
        },

        openCrawlModal(target = null) {
          if (target === 'selected') {
            this.crawlTargetScope = 'selected';
          } else if (typeof target === 'string') {
            this.crawlTargetScope = 'single';
            this.crawlCustomPinId = target;
          } else if (this.selectedSeedIds.length > 0) {
            this.crawlTargetScope = 'selected';
          } else {
            this.crawlTargetScope = 'queued';
          }
          this.crawlModalTab = 'launch';
          this.isCrawlModalOpen = true;
          this.fetchWorkflowRuns();
          this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
        },

        async fetchWorkflowRuns() {
          this.isLoadingWorkflowRuns = true;
          try {
            const res = await fetch(this.getApiUrl('/api/workflow/runs?limit=15'));
            if (res.ok) {
              this.workflowRuns = await res.json();
            }
          } catch (e) {
            console.warn('Failed to load workflow runs:', e);
          } finally {
            this.isLoadingWorkflowRuns = false;
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        async executeCrawl() {
          let targetIds = [];
          if (this.crawlTargetScope === 'selected') {
            targetIds = [...this.selectedSeedIds];
            if (targetIds.length === 0) {
              alert('Please select at least one seed to crawl.');
              return;
            }
          } else if (this.crawlTargetScope === 'single') {
            if (!this.crawlCustomPinId.trim()) {
              alert('Please enter a target Pin ID.');
              return;
            }
            targetIds = [this.crawlCustomPinId.trim()];
          } else if (this.crawlTargetScope === 'queued') {
            targetIds = []; // sweep queued
          } else if (this.crawlTargetScope === 'all') {
            targetIds = this.seeds.map(s => s.pin_id);
          }

          if (this.crawlEngine === 'workflow') {
            await this.triggerWorkflowRun(targetIds.join(','), this.crawlMaxPages);
          } else {
            await this.triggerCrawl(targetIds.length > 0 ? targetIds : null);
            this.isCrawlModalOpen = false;
          }
        },

        async triggerWorkflowRun(seedPinIdsStr = '', maxPages = '60') {
          this.isTriggeringWorkflow = true;
          try {
            const res = await fetch(this.getApiUrl('/api/workflow/trigger'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                seed_pin_id: seedPinIdsStr,
                max_pages: maxPages || '60'
              })
            });

            const data = await res.json();
            if (res.ok && data.success) {
              this.showToast('🚀 GitHub Actions Workflow Run triggered successfully!');
              this.crawlModalTab = 'history';
              setTimeout(() => this.fetchWorkflowRuns(), 2000);
            } else {
              alert('Failed to trigger workflow: ' + (data.error || 'Unknown error'));
            }
          } catch (e) {
            alert('Workflow dispatch network error: ' + e.message);
          } finally {
            this.isTriggeringWorkflow = false;
          }
        },

        openDeleteModal(target) {
          this.deleteTarget = target;
          this.deletePurgeNeon = true;
          this.isDeleteModalOpen = true;
          this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
        },

        async confirmDelete() {
          this.isDeleting = true;
          try {
            let pinIds = [];
            if (this.deleteTarget === 'selected') {
              pinIds = [...this.selectedSeedIds];
            } else if (typeof this.deleteTarget === 'object' && this.deleteTarget?.pin_id) {
              pinIds = [this.deleteTarget.pin_id];
            } else if (typeof this.deleteTarget === 'string') {
              pinIds = [this.deleteTarget];
            }

            if (pinIds.length === 0) {
              this.isDeleteModalOpen = false;
              return;
            }

            const res = await fetch(this.getApiUrl('/api/seeds/bulk-delete'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                pin_ids: pinIds,
                purge_database: Boolean(this.deletePurgeNeon)
              })
            });

            if (res.ok) {
              const data = await res.json();
              this.showToast('🗑️ Deleted ' + data.deleted_count + ' seeds ' + (data.purged_database ? '(Neon DB purged cleanly)' : ''));
              this.selectedSeedIds = this.selectedSeedIds.filter(id => !pinIds.includes(id));
              this.isDeleteModalOpen = false;
              if (this.activeDossierSeed && pinIds.includes(this.activeDossierSeed.pin_id)) {
                this.closeSeedDossier();
              }
              await this.refreshAll();
            } else {
              const err = await res.json();
              alert('Error deleting seeds: ' + (err.error || 'Failed'));
            }
          } catch (e) {
            alert('Failed to delete seeds: ' + e.message);
          } finally {
            this.isDeleting = false;
          }
        },

        exportSelectedSeeds() {
          const selected = this.seeds.filter(s => this.selectedSeedIds.includes(s.pin_id));
          if (selected.length === 0) return;
          const headers = ['pin_id', 'label', 'is_competitor', 'total_candidates', 'total_capsules', 'commercial_gap_ratio', 'last_crawled_at'];
          const rows = [headers.join(',')];
          for (const s of selected) {
            rows.push([
              s.pin_id,
              '"' + (s.label || '').replace(/"/g, '""') + '"',
              s.is_competitor,
              s.total_candidates || 0,
              s.total_capsules || 0,
              s.commercial_gap_ratio || 100,
              s.last_crawled_at || ''
            ].join(','));
          }
          const blob = new Blob([rows.join(String.fromCharCode(10))], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.setAttribute('href', url);
          link.setAttribute('download', 'selected-seeds-' + Date.now() + '.csv');
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          this.showToast('Exported ' + selected.length + ' seeds to CSV');
        },

        async addSeed() {
          if (!this.newSeed.pin_id.trim()) {
            alert('Please enter a valid Pinterest Pin ID');
            return;
          }
          try {
            const res = await fetch(this.getApiUrl('/api/seeds'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(this.newSeed)
            });
            if (res.ok) {
              const autoCrawl = this.newSeed.auto_crawl;
              const newPinId = this.newSeed.pin_id;
              this.newSeed = { pin_id: '', label: '', is_competitor: true, auto_crawl: true };
              this.isAddSeedOpen = false;
              await this.refreshAll();
              if (autoCrawl) {
                if (this.crawlEngine === 'workflow') {
                  await this.triggerWorkflowRun(newPinId);
                } else {
                  await this.triggerCrawl(newPinId);
                }
              }
            } else {
              const err = await res.json();
              alert('Error adding seed: ' + (err.error || 'Unknown error'));
            }
          } catch (e) {
            alert('Failed to add seed: ' + e.message);
          }
        },

        async deleteSeed(pinId, label) {
          this.openDeleteModal({ pin_id: pinId, label: label });
        },

        exportCsv(list, filename) {
          const fname = filename || 'arbitrage-candidates.csv';
          if (!list || list.length === 0) {
            alert('No data to export.');
            return;
          }
          const headers = [
            'candidate_pin_id',
            'title',
            'saves',
            'save_rate',
            'daily_velocity',
            'provenance_engine',
            'sequence_role',
            'dominant_color',
            'aspect_ratio',
            'domain',
            'is_product',
            'pin_created_at',
            'seed_overlap_count'
          ];
          const csvRows = [headers.join(',')];

          for (const row of list) {
            const values = headers.map(header => {
              let val = row[header];
              if (header === 'saves' && val === undefined) val = row.total_saves;
              if (header === 'save_rate' && val === undefined) val = row.avg_save_rate;
              if (header === 'dominant_color' && !val) val = row.winning_color;
              if (header === 'provenance_engine' && !val) val = row.engine_source;
              if (val === null || val === undefined) val = '';
              const escaped = ('' + val).replace(/"/g, '""');
              return '"' + escaped + '"';
            });
            csvRows.push(values.join(','));
          }

          const blob = new Blob([csvRows.join(String.fromCharCode(10))], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.setAttribute('href', url);
          link.setAttribute('download', fname.endsWith('.csv') ? fname : (fname + '.csv'));
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          this.showToast('Exported ' + list.length + ' rows to ' + fname);
        }
      };
    }
  </script>
</body>
</html>`;
}

// HTTP Server
