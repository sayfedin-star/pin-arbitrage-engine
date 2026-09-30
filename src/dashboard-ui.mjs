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

  <!-- Top Navigation Bar -->
  <header class="border-b border-slate-200/90 dark:border-slate-800/80 bg-white/95 dark:bg-[#0b1120]/90 backdrop-blur-xl sticky top-0 z-40 shadow-sm">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="h-16 flex items-center justify-between">
        <div class="flex items-center space-x-3">
          <div class="h-10 w-10 rounded-xl bg-gradient-to-tr from-rose-600 via-rose-500 to-amber-500 flex items-center justify-center shadow-md shadow-rose-500/20 text-white">
            <i data-lucide="cpu" class="w-5 h-5"></i>
          </div>
          <div>
            <div class="flex items-center space-x-2">
              <span class="font-bold text-base sm:text-lg tracking-tight text-slate-900 dark:text-white">
                Pin Cluster Analyzer
              </span>
              <span class="px-2 py-0.5 text-[10px] font-mono font-bold uppercase rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30">
                Predictive Engine V3
              </span>
              <template x-if="crawlStatus.is_crawling">
                <span class="px-2 py-0.5 text-[10px] font-mono font-bold rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center space-x-1 animate-pulse">
                  <span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping"></span>
                  <span>Crawler Active</span>
                </span>
              </template>
            </div>
            <p class="text-[11px] text-slate-500 dark:text-slate-400">Reverse-Engineered P2P Multi-Engine Retrieval & prod:v18 Reranker</p>
          </div>
        </div>

        <!-- Action Controls & Dark Mode Toggle -->
        <div class="flex items-center space-x-2 sm:space-x-3">
          <!-- Project Switcher (Multi-Project Neon Fleet) -->
          <div class="hidden md:flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs shadow-sm">
            <i data-lucide="database" class="w-3.5 h-3.5 text-cyan-500"></i>
            <span class="text-[11px] font-semibold text-slate-500 dark:text-slate-400">DB:</span>
            <select x-model="selectedProject" @change="switchProject(selectedProject)" class="bg-transparent text-xs font-bold text-slate-800 dark:text-slate-200 outline-none cursor-pointer">
              <option value="all">🌐 All Projects (Fleet View)</option>
              <option value="weathered-band-34334459">⚡ weathered-band-34334459 (Hub)</option>
              <template x-for="p in fleetProjects.filter(p => !p.is_hub)" :key="p.project_id">
                <option :value="p.project_id" x-text="'📦 ' + p.project_name"></option>
              </template>
            </select>
          </div>

          <!-- Dark Mode Toggle Button -->
          <button @click="toggleTheme()" class="p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition active:scale-95" :title="isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'">
            <i :data-lucide="isDark ? 'sun' : 'moon'" class="w-4 h-4"></i>
          </button>

          <!-- Refresh Data -->
          <button @click="refreshAll()" :disabled="isLoading" class="p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition active:scale-95" title="Refresh Data">
            <i data-lucide="rotate-cw" :class="{'animate-spin': isLoading}" class="w-4 h-4"></i>
          </button>

          <!-- ⚡ Crawl Controller & Workflow Dispatcher Button -->
          <button @click="openCrawlModal()" class="flex items-center space-x-2 px-3.5 py-2 text-xs font-bold rounded-xl transition shadow-sm active:scale-95" :class="crawlStatus.is_crawling ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30' : 'bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white shadow-rose-950/20'">
            <i data-lucide="zap" :class="{'animate-spin': crawlStatus.is_crawling}" class="w-3.5 h-3.5"></i>
            <span class="hidden sm:inline" x-text="crawlStatus.is_crawling ? '⚡ Crawling In Progress...' : '⚡ Crawl & Workflows'"></span>
            <span class="sm:hidden">⚡ Crawl</span>
          </button>

          <!-- Pinterest Session Cookie Status Button -->
          <button @click="isCookieModalOpen = true" class="flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold rounded-xl border transition active:scale-95" :class="cookieStatus.has_cookie ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20' : 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20'" title="Pinterest Session Authentication Status">
            <span class="w-2 h-2 rounded-full" :class="cookieStatus.has_cookie ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'"></span>
            <span class="hidden sm:inline" x-text="cookieStatus.has_cookie ? 'Session: Authenticated' : 'Guest Mode (No Cookie)'"></span>
            <span class="sm:hidden" x-text="cookieStatus.has_cookie ? 'Auth' : 'Guest'"></span>
          </button>

          <!-- Add Seeds Button (Single & Bulk) -->
          <button @click="openAddSeedModal()" class="flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/90 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition active:scale-95 shadow-sm">
            <i data-lucide="plus-circle" class="w-3.5 h-3.5 text-rose-500"></i>
            <span class="hidden sm:inline">Add Seeds (Single / Bulk)</span>
            <span class="sm:hidden">Add Seeds</span>
          </button>
        </div>
      </div>

      <!-- 3 Primary Top-Level Navigation Tabs -->
      <div class="flex items-center space-x-2 sm:space-x-4 border-t border-slate-200 dark:border-slate-800/80 pt-1 -mb-px overflow-x-auto">
        <!-- Tab 1: Tracked Seeds -->
        <button @click="switchTab('seeds')" class="flex items-center space-x-2 px-3 py-3 text-xs sm:text-sm font-semibold border-b-2 transition whitespace-nowrap" :class="currentTab === 'seeds' ? 'border-rose-500 text-rose-600 dark:text-rose-400 font-bold' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'">
          <i data-lucide="folder-git-2" class="w-4 h-4"></i>
          <span>📁 Tracked Seeds</span>
          <span class="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300" x-text="seeds.length"></span>
        </button>

        <!-- Tab 2: Global Intersections -->
        <button @click="switchTab('intersections')" class="flex items-center space-x-2 px-3 py-3 text-xs sm:text-sm font-semibold border-b-2 transition whitespace-nowrap" :class="currentTab === 'intersections' ? 'border-rose-500 text-rose-600 dark:text-rose-400 font-bold' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'">
          <i data-lucide="flame" class="w-4 h-4 text-amber-500"></i>
          <span>⚡ Global Intersections</span>
          <span class="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-amber-500/20 text-amber-700 dark:text-amber-400" x-text="intersections.length"></span>
        </button>

        <!-- Tab 3: Master Database Explorer -->
        <button @click="switchTab('explorer')" class="flex items-center space-x-2 px-3 py-3 text-xs sm:text-sm font-semibold border-b-2 transition whitespace-nowrap" :class="currentTab === 'explorer' ? 'border-rose-500 text-rose-600 dark:text-rose-400 font-bold' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'">
          <i data-lucide="database" class="w-4 h-4 text-sky-500"></i>
          <span>📊 Master Explorer</span>
          <span class="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-sky-500/10 text-sky-700 dark:text-sky-400" x-text="overview.total_candidates || '...'"></span>
        </button>

        <!-- Tab 4: Competitor Intelligence -->
        <button @click="switchTab('competitors')" class="flex items-center space-x-2 px-3 py-3 text-xs sm:text-sm font-semibold border-b-2 transition whitespace-nowrap" :class="currentTab === 'competitors' ? 'border-purple-500 text-purple-600 dark:text-purple-400 font-bold' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'">
          <i data-lucide="users" class="w-4 h-4 text-purple-500"></i>
          <span>🕵️ Competitors</span>
          <span class="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-purple-500/10 text-purple-700 dark:text-purple-400" x-text="competitors.length"></span>
        </button>

        <!-- Tab 5: Keyword Velocity Tracker -->
        <button @click="switchTab('keywords')" class="flex items-center space-x-2 px-3 py-3 text-xs sm:text-sm font-semibold border-b-2 transition whitespace-nowrap" :class="currentTab === 'keywords' ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400 font-bold' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'">
          <i data-lucide="search" class="w-4 h-4 text-emerald-500"></i>
          <span>🔍 Keywords & Velocity</span>
          <span class="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" x-text="keywords.length"></span>
        </button>

        <!-- Tab 6: PinArchive & Topic Clusters -->
        <button @click="switchTab('pinarchive')" class="flex items-center space-x-2 px-3 py-3 text-xs sm:text-sm font-semibold border-b-2 transition whitespace-nowrap" :class="currentTab === 'pinarchive' ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400 font-bold' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'">
          <i data-lucide="archive" class="w-4 h-4 text-indigo-500"></i>
          <span>📦 PinArchive & Topics</span>
          <span class="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-indigo-500/10 text-indigo-700 dark:text-indigo-400" x-text="formatNumber(pinarchiveOverview.total_pins)"></span>
        </button>

        <!-- Tab 7: Neon Projects Fleet -->
        <button @click="switchTab('fleet')" class="flex items-center space-x-2 px-3 py-3 text-xs sm:text-sm font-semibold border-b-2 transition whitespace-nowrap" :class="currentTab === 'fleet' ? 'border-cyan-500 text-cyan-600 dark:text-cyan-400 font-bold' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'">
          <i data-lucide="server" class="w-4 h-4 text-cyan-500"></i>
          <span>⚡ Neon Fleet (100 Projects)</span>
          <span class="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-cyan-500/10 text-cyan-700 dark:text-cyan-400" x-text="fleetProjects.length"></span>
        </button>
      </div>
    </div>
  </header>

  <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

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
    <!-- TAB 1: 📁 TRACKED SEEDS (GRID & DEDICATED SEED DOSSIER)  -->
    <!-- ======================================================== -->
    <div x-show="currentTab === 'seeds'" class="space-y-6">

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
                      <span x-show="Number(seed.total_capsules || 0) > 0" class="px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-500/20" x-text="seed.total_capsules + ' Caps'"></span>
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
    <!-- TAB 2: ⚡ GLOBAL INTERSECTIONS (STANDALONE 24 HUBS PAGE)  -->
    <!-- ======================================================== -->
    <div x-show="currentTab === 'intersections'" class="space-y-5">
      
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
    <!-- TAB 3: 📊 MASTER DATABASE EXPLORER (SEARCH & SEED FILTER)-->
    <!-- ======================================================== -->
    <div x-show="currentTab === 'explorer'" class="space-y-4">
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

    <!-- ======================================================== -->
    <!-- TAB 4: 🕵️ COMPETITOR INTELLIGENCE (LIVE MONITOR)          -->
    <!-- Matches User Image 2 Reference UI                        -->
    <!-- ======================================================== -->
    <div x-show="currentTab === 'competitors'" class="space-y-6">
      <!-- Header Section matching Image 2 -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div class="flex items-center space-x-3">
          <div class="h-11 w-11 rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center border border-purple-500/20">
            <i data-lucide="users" class="w-6 h-6"></i>
          </div>
          <div>
            <div class="flex items-center space-x-2">
              <h2 class="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">Competitor Intelligence</h2>
              <span class="px-2 py-0.5 text-[10px] font-bold uppercase rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30">Live Monitor</span>
            </div>
            <p class="text-xs text-slate-500 dark:text-slate-400">Monitor profile reach, follower velocity, and board strategy timeline.</p>
          </div>
        </div>
        <div class="flex items-center space-x-2">
          <button @click="exportCompetitorsCsv()" class="px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition flex items-center space-x-1.5 shadow-sm">
            <i data-lucide="download" class="w-3.5 h-3.5"></i>
            <span>Export CSV</span>
          </button>
          <button @click="syncAllCompetitors()" :disabled="isLoading" class="px-3.5 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition flex items-center space-x-1.5 shadow-sm shadow-emerald-950/20 active:scale-95">
            <i data-lucide="refresh-cw" :class="{'animate-spin': isLoading}" class="w-3.5 h-3.5"></i>
            <span>Run Full Update</span>
          </button>
          <button @click="isAddCompetitorModalOpen = true" class="px-3.5 py-2 text-xs font-bold rounded-xl bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white transition flex items-center space-x-1.5 shadow-sm shadow-rose-950/20 active:scale-95">
            <i data-lucide="plus" class="w-3.5 h-3.5"></i>
            <span>+ Track Profiles</span>
          </button>
        </div>
      </div>

      <!-- Automated Pipeline Status Bar matching Image 2 -->
      <div class="p-3 px-4 rounded-2xl bg-white dark:bg-[#0b1120] border border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs shadow-sm">
        <div class="flex items-center space-x-2">
          <span class="p-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <i data-lucide="clock" class="w-4 h-4"></i>
          </span>
          <span class="font-bold text-slate-900 dark:text-white">Automated Pipeline</span>
          <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">Active</span>
          <span class="text-slate-400 font-mono text-[11px]">Matrix Sharding Runner</span>
        </div>
        <div class="flex items-center space-x-4 text-slate-500 dark:text-slate-400">
          <span class="flex items-center space-x-1.5">
            <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Provider: <strong>FastCron / GH Actions</strong></span>
          </span>
          <button @click="fetchCompetitors()" class="hover:text-slate-900 dark:hover:text-white flex items-center space-x-1">
            <i data-lucide="database" class="w-3.5 h-3.5 text-purple-500"></i>
            <span>Vault</span>
          </button>
        </div>
      </div>

      <!-- 4 KPI Cards matching Image 2 -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <!-- Card 1: Tracked Profiles -->
        <div class="p-5 rounded-2xl bg-white dark:bg-[#0b1120] border border-slate-200/80 dark:border-slate-800 shadow-sm relative overflow-hidden">
          <div class="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider">
            <span>TRACKED PROFILES</span>
            <i data-lucide="users" class="w-4 h-4 text-rose-500"></i>
          </div>
          <div class="mt-3 flex items-baseline space-x-2">
            <span class="text-3xl font-extrabold text-slate-900 dark:text-white font-mono" x-text="competitorsOverview.tracked_profiles || competitors.length"></span>
          </div>
          <div class="mt-3 w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div class="bg-purple-500 h-full rounded-full" style="width: 100%"></div>
          </div>
          <div class="mt-2 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
            <span x-text="(competitorsOverview.own_count || 0) + ' own'"></span>
            <span x-text="(competitorsOverview.competitor_count || competitors.length) + ' competitors'"></span>
          </div>
        </div>

        <!-- Card 2: Combined Reach -->
        <div class="p-5 rounded-2xl bg-white dark:bg-[#0b1120] border border-slate-200/80 dark:border-slate-800 shadow-sm">
          <div class="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider">
            <span>COMBINED REACH</span>
            <i data-lucide="trending-up" class="w-4 h-4 text-emerald-500"></i>
          </div>
          <div class="mt-3 flex items-baseline space-x-2">
            <span class="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 font-mono" x-text="formatNumber(competitorsOverview.combined_reach, true)"></span>
          </div>
          <div class="mt-4 text-[11px] text-slate-500 dark:text-slate-400 flex items-center space-x-1.5">
            <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>top: <strong class="text-slate-800 dark:text-slate-200" x-text="competitorsOverview.top_competitor?.handle || '@streetstylis'"></strong> (<span x-text="competitorsOverview.top_competitor?.reach || '10M'"></span>)</span>
          </div>
        </div>

        <!-- Card 3: Total Audience -->
        <div class="p-5 rounded-2xl bg-white dark:bg-[#0b1120] border border-slate-200/80 dark:border-slate-800 shadow-sm">
          <div class="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider">
            <span>TOTAL AUDIENCE</span>
            <i data-lucide="heart" class="w-4 h-4 text-sky-500"></i>
          </div>
          <div class="mt-3 flex items-baseline space-x-2">
            <span class="text-3xl font-extrabold text-sky-600 dark:text-sky-400 font-mono" x-text="formatNumber(competitorsOverview.total_audience, true)"></span>
          </div>
          <div class="mt-4 text-[11px] text-slate-500 dark:text-slate-400 flex items-center space-x-1.5">
            <span class="w-2 h-2 rounded-full bg-sky-500"></span>
            <span>avg: <strong class="text-slate-800 dark:text-slate-200" x-text="formatNumber(Math.round((competitorsOverview.total_audience || 60000000) / (competitors.length || 1)), true)"></strong> / profile</span>
          </div>
        </div>

        <!-- Card 4: Pins Tracked -->
        <div class="p-5 rounded-2xl bg-white dark:bg-[#0b1120] border border-slate-200/80 dark:border-slate-800 shadow-sm">
          <div class="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider">
            <span>PINS TRACKED</span>
            <i data-lucide="zap" class="w-4 h-4 text-amber-500"></i>
          </div>
          <div class="mt-3 flex items-baseline space-x-2">
            <span class="text-3xl font-extrabold text-amber-600 dark:text-amber-400 font-mono" x-text="formatNumber(competitorsOverview.pins_tracked, true)"></span>
          </div>
          <div class="mt-4 text-[11px] text-slate-500 dark:text-slate-400 flex items-center space-x-1.5">
            <span class="w-2 h-2 rounded-full bg-amber-500"></span>
            <span><strong class="text-slate-800 dark:text-slate-200" x-text="formatNumber(competitorsOverview.pins_tracked)"></strong> in Neon database</span>
          </div>
        </div>
      </div>

      <!-- Filter Tabs & Table Controls matching Image 2 -->
      <div class="p-4 rounded-2xl bg-white dark:bg-[#0b1120] border border-slate-200/80 dark:border-slate-800 space-y-4 shadow-sm">
        <div class="flex flex-col sm:flex-row items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800/80 pb-3">
          <!-- Sub Tabs -->
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

        <!-- Competitor Table matching Image 2 -->
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
                    <div class="flex items-center space-x-2.5">
                      <img :src="c.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=64&h=64&fit=crop&crop=face'" class="w-7 h-7 rounded-full object-cover border border-slate-200 dark:border-slate-700">
                      <a :href="'https://www.pinterest.com/' + c.username + '/'" target="_blank" class="font-bold text-slate-900 dark:text-white hover:text-purple-600 dark:hover:text-purple-400 flex items-center space-x-1">
                        <span x-text="'@' + c.username"></span>
                        <i data-lucide="external-link" class="w-3 h-3 text-slate-400"></i>
                      </a>
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
                    <div class="flex items-center justify-center space-x-1.5">
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
    <!-- TAB 6: ⚡ NEON MULTI-PROJECT FLEET MANAGER                -->
    <!-- Up to 100 Neon Serverless Projects & 50 GB Pooled Storage -->
    <!-- ======================================================== -->
    <div x-show="currentTab === 'fleet'" class="space-y-6">
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div class="flex items-center space-x-3">
          <div class="h-11 w-11 rounded-2xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 flex items-center justify-center border border-cyan-500/20">
            <i data-lucide="server" class="w-6 h-6"></i>
          </div>
          <div>
            <div class="flex items-center space-x-2">
              <h2 class="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">Neon Multi-Project Fleet Manager</h2>
              <span class="px-2 py-0.5 text-[10px] font-bold uppercase rounded-full bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30">Up to 100 Projects</span>
            </div>
            <p class="text-xs text-slate-500 dark:text-slate-400">100 CU-Hours per project | 0.5 GB Independent storage | Scale-to-Zero architecture.</p>
          </div>
        </div>
        <div class="flex items-center space-x-2">
          <button @click="isAddFleetModalOpen = true" class="px-3.5 py-2 text-xs font-bold rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white transition flex items-center space-x-1.5 shadow-sm shadow-cyan-950/20 active:scale-95">
            <i data-lucide="plus" class="w-3.5 h-3.5"></i>
            <span>+ Add Project to Fleet</span>
          </button>
        </div>
      </div>

      <!-- Fleet KPI Cards -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="p-5 rounded-2xl bg-white dark:bg-[#0b1120] border border-slate-200/80 dark:border-slate-800 shadow-sm">
          <div class="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider">
            <span>REGISTERED PROJECTS</span>
            <i data-lucide="layers" class="w-4 h-4 text-cyan-500"></i>
          </div>
          <div class="mt-3 flex items-baseline space-x-2">
            <span class="text-3xl font-extrabold text-cyan-600 dark:text-cyan-400 font-mono" x-text="fleetProjects.length"></span>
            <span class="text-xs text-slate-400 font-mono">/ 100 Available</span>
          </div>
          <div class="mt-3 text-[11px] text-slate-500">100% Free Plan Quota ($0/mo)</div>
        </div>

        <div class="p-5 rounded-2xl bg-white dark:bg-[#0b1120] border border-slate-200/80 dark:border-slate-800 shadow-sm">
          <div class="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider">
            <span>TOTAL POOLED STORAGE</span>
            <i data-lucide="hard-drive" class="w-4 h-4 text-emerald-500"></i>
          </div>
          <div class="mt-3 flex items-baseline space-x-2">
            <span class="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 font-mono" x-text="(fleetProjects.length * 0.5) + ' GB'"></span>
          </div>
          <div class="mt-3 text-[11px] text-slate-500">512 MB per isolated project</div>
        </div>

        <div class="p-5 rounded-2xl bg-white dark:bg-[#0b1120] border border-slate-200/80 dark:border-slate-800 shadow-sm">
          <div class="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider">
            <span>COMPUTE BUDGET</span>
            <i data-lucide="cpu" class="w-4 h-4 text-purple-500"></i>
          </div>
          <div class="mt-3 flex items-baseline space-x-2">
            <span class="text-3xl font-extrabold text-purple-600 dark:text-purple-400 font-mono" x-text="formatNumber(fleetProjects.length * 100) + ' hrs'"></span>
          </div>
          <div class="mt-3 text-[11px] text-slate-500">Scale-to-zero when idle (0 CU consumed)</div>
        </div>

        <div class="p-5 rounded-2xl bg-white dark:bg-[#0b1120] border border-slate-200/80 dark:border-slate-800 shadow-sm">
          <div class="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider">
            <span>ARCHITECTURE</span>
            <i data-lucide="shield-check" class="w-4 h-4 text-rose-500"></i>
          </div>
          <div class="mt-3 flex items-baseline space-x-2">
            <span class="text-2xl font-extrabold text-rose-600 dark:text-rose-400 font-mono">Hub & Spoke</span>
          </div>
          <div class="mt-3 text-[11px] text-slate-500">Non-destructive isolation</div>
        </div>
      </div>

      <!-- Fleet Projects Table -->
      <div class="p-4 rounded-2xl bg-white dark:bg-[#0b1120] border border-slate-200/80 dark:border-slate-800 space-y-4 shadow-sm">
        <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-800/80 pb-3">
          <span class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Neon Projects Directory</span>
          <span class="px-2.5 py-1 rounded-full text-xs font-bold bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20 font-mono" x-text="fleetProjects.length + ' Registered'"></span>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead>
              <tr class="border-b border-slate-200 dark:border-slate-800/80 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <th class="py-3 px-3">Role</th>
                <th class="py-3 px-3">Project Name</th>
                <th class="py-3 px-3">Project ID</th>
                <th class="py-3 px-3">Region</th>
                <th class="py-3 px-3">Status</th>
                <th class="py-3 px-3">DATABASE_URL (Pooled)</th>
                <th class="py-3 px-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
              <template x-for="p in fleetProjects" :key="p.id">
                <tr class="hover:bg-slate-50/80 dark:hover:bg-slate-900/40 transition">
                  <td class="py-3 px-3">
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase" :class="p.is_hub ? 'bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-500/30' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'" x-text="p.is_hub ? '👑 HUB' : '📦 SHARD'"></span>
                  </td>
                  <td class="py-3 px-3 font-sans font-bold text-slate-900 dark:text-white" x-text="p.project_name"></td>
                  <td class="py-3 px-3 text-slate-600 dark:text-slate-400" x-text="p.project_id"></td>
                  <td class="py-3 px-3 text-slate-600 dark:text-slate-400" x-text="p.region_id"></td>
                  <td class="py-3 px-3">
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30" x-text="'• ' + p.status"></span>
                  </td>
                  <td class="py-3 px-3">
                    <div class="flex items-center space-x-2">
                      <span class="text-slate-500 dark:text-slate-400 text-[11px]" x-text="p.masked_url || '••••••••••••••••••••••••••••••••'"></span>
                      <button @click="copyToClipboard(p.masked_url, 'url-' + p.id)" class="px-2 py-0.5 rounded text-[10px] bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-sans transition">
                        <span x-text="copiedField === 'url-' + p.id ? 'Copied!' : 'Copy'"></span>
                      </button>
                    </div>
                  </td>
                  <td class="py-3 px-3 text-center">
                    <button class="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-[10px] font-sans font-semibold transition">
                      Test Ping
                    </button>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Tab 6: PinArchive & Topic Clusters -->
    <div x-show="currentTab === 'pinarchive'" class="space-y-6">
      <!-- 5 Metric Cards matching Neon SaaS style -->
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <!-- Metric 1: Total Pins -->
        <div class="p-4 rounded-2xl bg-white dark:bg-[#0b1120] border border-slate-200/80 dark:border-slate-800 shadow-sm">
          <div class="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider">
            <span>Archived Pins</span>
            <i data-lucide="archive" class="w-4 h-4 text-indigo-500"></i>
          </div>
          <div class="mt-2.5 flex items-baseline space-x-2">
            <span class="text-2xl font-extrabold text-indigo-600 dark:text-indigo-400 font-mono" x-text="formatNumber(pinarchiveOverview.total_pins)"></span>
          </div>
          <div class="mt-1 text-[11px] text-slate-500" x-text="formatNumber(pinarchiveOverview.tracked_accounts) + ' Accounts Tracked'"></div>
        </div>

        <!-- Metric 2: Total Saves -->
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

        <!-- Metric 3: Avg Velocity -->
        <div class="p-4 rounded-2xl bg-white dark:bg-[#0b1120] border border-slate-200/80 dark:border-slate-800 shadow-sm">
          <div class="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider">
            <span>Avg Daily Velocity</span>
            <i data-lucide="zap" class="w-4 h-4 text-amber-500"></i>
          </div>
          <div class="mt-2.5 flex items-baseline space-x-2">
            <span class="text-2xl font-extrabold text-amber-600 dark:text-amber-400 font-mono" x-text="(pinarchiveOverview.avg_velocity || '0') + '/day'"></span>
          </div>
          <div class="mt-1 text-[11px] text-slate-500">Monotonic metrics pace</div>
        </div>

        <!-- Metric 4: Top Topic Cluster -->
        <div class="p-4 rounded-2xl bg-white dark:bg-[#0b1120] border border-slate-200/80 dark:border-slate-800 shadow-sm">
          <div class="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider">
            <span>Top Topic Cluster</span>
            <i data-lucide="sparkles" class="w-4 h-4 text-emerald-500"></i>
          </div>
          <div class="mt-2.5 flex items-baseline space-x-2 truncate">
            <span class="text-lg font-bold text-emerald-600 dark:text-emerald-400 truncate" x-text="pinarchiveOverview.top_cluster ? pinarchiveOverview.top_cluster.name : 'Analyzing...'"></span>
          </div>
          <div class="mt-1 text-[11px] text-slate-500" x-text="pinarchiveOverview.top_cluster ? (formatNumber(pinarchiveOverview.top_cluster.avg_saves) + ' avg saves') : 'No clusters yet'"></div>
        </div>

        <!-- Metric 5: Staged for Repurposing -->
        <div class="p-4 rounded-2xl bg-white dark:bg-[#0b1120] border border-slate-200/80 dark:border-slate-800 shadow-sm cursor-pointer hover:border-rose-500/50 transition" @click="openStagedModal()">
          <div class="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider">
            <span>Staged Queue</span>
            <i data-lucide="send" class="w-4 h-4 text-rose-500"></i>
          </div>
          <div class="mt-2.5 flex items-baseline space-x-2">
            <span class="text-2xl font-extrabold text-rose-600 dark:text-rose-400 font-mono" x-text="formatNumber(pinarchiveOverview.staged_pins_count)"></span>
          </div>
          <div class="mt-1 text-[11px] text-rose-500 font-semibold flex items-center space-x-1">
            <span>View Staged Pins</span>
            <i data-lucide="arrow-right" class="w-3 h-3"></i>
          </div>
        </div>
      </div>

      <!-- Section 0: Pin Qualification & Ingest Rules (Anti-Bloat & Early-Stop Engine) -->
      <div class="p-5 rounded-2xl bg-white dark:bg-[#0b1120] border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
        <!-- Header -->
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

            <button @click="isRulesCollapsed = !isRulesCollapsed; $nextTick(() => { if (window.lucide) window.lucide.createIcons(); });" class="p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition">
              <i :data-lucide="isRulesCollapsed ? 'chevron-down' : 'chevron-up'" class="w-4 h-4"></i>
            </button>
          </div>
        </div>

        <!-- Collapsible Content -->
        <div x-show="!isRulesCollapsed" class="space-y-4 pt-1">
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
            <!-- Daily Cron Switch -->
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

            <!-- Early-Stop Limit -->
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

            <!-- Deep Audit Limit -->
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

      <!-- Section 1: Topic Clusters (Extracted via AI Annotations) -->
      <div class="p-4 rounded-2xl bg-white dark:bg-[#0b1120] border border-slate-200/80 dark:border-slate-800 space-y-4 shadow-sm">
        <div class="flex flex-col sm:flex-row items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800/80 pb-3">
          <div class="flex items-center space-x-2">
            <i data-lucide="layers" class="w-4 h-4 text-indigo-500"></i>
            <h3 class="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">Smart Topic Clusters (مستكشف العناقيد الذكية من وسوم بينتريست)</h3>
          </div>
          <div class="flex items-center space-x-2 w-full sm:w-auto">
            <div class="relative w-full sm:w-56">
              <i data-lucide="search" class="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"></i>
              <input type="text" x-model="pinarchiveTopicSearch" @input.debounce.300ms="fetchPinArchiveTopics()" placeholder="Filter topic clusters..." class="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50">
            </div>
            <span class="px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 whitespace-nowrap" x-text="pinarchiveTopics.length + ' Clusters'"></span>
          </div>
        </div>

        <!-- Clusters Grid Chips -->
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 max-h-56 overflow-y-auto p-1">
          <template x-for="t in pinarchiveTopics" :key="t.name">
            <div @click="filterByTopic(t.name)" class="p-3 rounded-xl border transition cursor-pointer active:scale-95" :class="pinarchiveSelectedTopic === t.name ? 'bg-indigo-500/15 border-indigo-500 text-indigo-700 dark:text-indigo-300 shadow-sm' : 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 hover:border-indigo-500/40 text-slate-800 dark:text-slate-200'">
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

      <!-- Section 2: Winning Pins Archive Grid -->
      <div class="p-4 rounded-2xl bg-white dark:bg-[#0b1120] border border-slate-200/80 dark:border-slate-800 space-y-4 shadow-sm">
        <div class="flex flex-col sm:flex-row items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800/80 pb-3">
          <div class="flex items-center space-x-2">
            <i data-lucide="trophy" class="w-4 h-4 text-amber-500"></i>
            <h3 class="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">Archived Winning Pins (أرشيف الدبابيس الفائزة)</h3>
            <template x-if="pinarchiveSelectedTopic">
              <span class="flex items-center space-x-1 px-2 py-0.5 rounded-full text-xs bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30">
                <span x-text="'Topic: ' + pinarchiveSelectedTopic"></span>
                <button @click="pinarchiveSelectedTopic = ''; fetchPinArchivePins()" class="hover:text-rose-500 ml-1">×</button>
              </span>
            </template>
          </div>

          <!-- Controls: Search, Min Saves, Sort -->
          <div class="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <div class="relative w-full sm:w-48">
              <i data-lucide="search" class="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"></i>
              <input type="text" x-model="pinarchiveSearch" @input.debounce.300ms="fetchPinArchivePins()" placeholder="Search pins..." class="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none">
            </div>

            <select x-model="pinarchiveMinSaves" @change="fetchPinArchivePins()" class="px-2.5 py-1.5 text-xs rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 font-mono outline-none">
              <option value="0">All Saves</option>
              <option value="50">🔥 Min 50 Saves</option>
              <option value="200">⚡ Min 200 Saves</option>
              <option value="1000">👑 Min 1,000 Saves</option>
              <option value="5000">🏆 Min 5,000 Saves</option>
            </select>

            <select x-model="pinarchiveSort" @change="fetchPinArchivePins()" class="px-2.5 py-1.5 text-xs rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 font-mono outline-none">
              <option value="saves">Sort: Saves DESC</option>
              <option value="velocity">Sort: Daily Velocity</option>
              <option value="created_at">Sort: Newest Pin</option>
              <option value="repins">Sort: Repins DESC</option>
            </select>
          </div>
        </div>

        <!-- Pins Grid View -->
        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <template x-for="pin in pinarchivePins" :key="pin.pin_id">
            <div class="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 hover:border-indigo-500/40 transition flex flex-col justify-between space-y-3 group">
              <!-- Pin Image & Badges -->
              <div class="relative overflow-hidden rounded-xl aspect-[3/4] bg-slate-200 dark:bg-slate-800">
                <template x-if="pin.image_url">
                  <img :src="pin.image_url" class="w-full h-full object-cover group-hover:scale-105 transition duration-300">
                </template>
                <div class="absolute top-2 left-2 flex flex-col gap-1">
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-950/80 text-white backdrop-blur-sm flex items-center space-x-1">
                    <i data-lucide="zap" class="w-3 h-3 text-amber-400"></i>
                    <span x-text="(pin.velocity || '0') + '/day'"></span>
                  </span>
                </div>
                <div class="absolute top-2 right-2">
                  <span class="w-4 h-4 rounded-full border border-white/40 shadow-sm block" :style="'background-color: ' + (pin.dominant_color || '#888888')" :title="'Color: ' + pin.dominant_color"></span>
                </div>
                <div class="absolute bottom-2 left-2 right-2 flex justify-between items-center text-[10px] font-mono font-bold text-white bg-slate-950/70 backdrop-blur-sm px-2 py-1 rounded-lg">
                  <span x-text="formatNumber(pin.saves) + ' saves'"></span>
                  <span x-text="formatNumber(pin.repins) + ' repins'"></span>
                </div>
              </div>

              <!-- Pin Metadata -->
              <div class="space-y-1.5 flex-1 min-w-0">
                <h4 class="font-bold text-xs text-slate-900 dark:text-white line-clamp-2 leading-snug" x-text="pin.title || 'Untitled Pin'"></h4>
                <div class="flex items-center space-x-1.5 text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  <i data-lucide="folder" class="w-3 h-3 text-slate-400"></i>
                  <span class="truncate" x-text="pin.board_name || 'General Board'"></span>
                </div>
              </div>

              <!-- Action Bar -->
              <div class="pt-2 border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-between gap-2">
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

        <div x-show="!isLoadingPinArchive && pinarchivePins.length === 0" class="text-center py-12 text-slate-500 font-mono text-xs">
          <i data-lucide="inbox" class="w-8 h-8 mx-auto mb-2 text-slate-400"></i>
          <span>No archived pins matching the current filters.</span>
        </div>
      </div>
    </div>
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

  <!-- Modal: + Track Profiles (Competitor Intelligence) -->
  <div x-show="isAddCompetitorModalOpen" x-cloak class="fixed inset-0 z-50 overflow-y-auto bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-4">
    <div class="bg-white dark:bg-[#0d1526] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-4" @click.away="isAddCompetitorModalOpen = false">
      <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
        <div class="flex items-center space-x-2">
          <div class="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-600 flex items-center justify-center">
            <i data-lucide="user-plus" class="w-4 h-4"></i>
          </div>
          <div>
            <h3 class="font-bold text-slate-900 dark:text-white text-sm">Track New Competitor Profile</h3>
            <p class="text-[11px] text-slate-500">Monitor reach, profile views, boards, and pins.</p>
          </div>
        </div>
        <button @click="isAddCompetitorModalOpen = false" class="text-slate-400 hover:text-slate-700 dark:hover:text-white">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>
      <div class="space-y-3 text-xs">
        <div>
          <label class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Pinterest Username / Handle</label>
          <input type="text" x-model="newCompetitorHandle" placeholder="e.g. streetstylis or @daviereofficial" class="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50">
        </div>
      </div>
      <div class="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end space-x-2">
        <button @click="isAddCompetitorModalOpen = false" class="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-700">Cancel</button>
        <button @click="submitAddCompetitor()" :disabled="!newCompetitorHandle.trim()" class="px-4 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white transition active:scale-95 disabled:opacity-50 flex items-center space-x-1.5">
          <i data-lucide="plus" class="w-3.5 h-3.5"></i>
          <span>Add & Track Profile</span>
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

  <!-- Modal: Competitor Boards Breakdown -->
  <div x-show="isBoardsModalOpen" x-cloak class="fixed inset-0 z-50 overflow-y-auto bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-4">
    <div class="bg-white dark:bg-[#0d1526] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl p-6 space-y-4 text-slate-900 dark:text-white" @click.away="isBoardsModalOpen = false">
      <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
        <div class="flex items-center space-x-3">
          <img :src="activeBoardsCompetitor?.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=64&h=64&fit=crop&crop=face'" class="w-9 h-9 rounded-full object-cover border border-slate-200 dark:border-slate-700">
          <div>
            <h3 class="font-bold text-sm flex items-center space-x-2">
              <span x-text="'@' + (activeBoardsCompetitor?.username || '') + ' - Boards Breakdown'"></span>
            </h3>
            <p class="text-[11px] text-slate-500" x-text="competitorBoardsList.length + ' Tracked Boards with Activity History'"></p>
          </div>
        </div>
        <button @click="isBoardsModalOpen = false" class="text-slate-400 hover:text-slate-700 dark:hover:text-white">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>

      <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
        <span class="text-xs text-slate-500">Board strategy and pin harvest actions</span>
        <div class="flex items-center space-x-2">
          <button @click="harvestCompetitorPinsAction(activeBoardsCompetitor, 'daily')" :disabled="harvestingCompetitorId === activeBoardsCompetitor?.id" class="px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition active:scale-95 disabled:opacity-50 flex items-center space-x-1.5 shadow-sm" title="Harvest ~150 latest pins using 3-tier rules">
            <i data-lucide="download" :class="{'animate-bounce': harvestingCompetitorId === activeBoardsCompetitor?.id}" class="w-3.5 h-3.5"></i>
            <span>Harvest (3p)</span>
          </button>
          <button @click="harvestCompetitorPinsAction(activeBoardsCompetitor, 'deep')" :disabled="harvestingCompetitorId === activeBoardsCompetitor?.id" class="px-3 py-1.5 rounded-xl text-xs font-semibold border border-purple-500/40 bg-purple-500/10 hover:bg-purple-500/20 text-purple-700 dark:text-purple-300 transition active:scale-95 disabled:opacity-50 flex items-center space-x-1.5" title="Deep Audit Sweep (up to 500 pages)">
            <i data-lucide="zap" class="w-3.5 h-3.5 text-purple-500"></i>
            <span>Deep Audit</span>
          </button>
          <button @click="syncCompetitorBoardsAction(activeBoardsCompetitor)" :disabled="isSyncingBoards" class="px-3 py-1.5 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white transition active:scale-95 disabled:opacity-50 flex items-center space-x-1.5 shadow-sm">
            <i data-lucide="refresh-cw" :class="{'animate-spin': isSyncingBoards}" class="w-3.5 h-3.5"></i>
            <span x-text="isSyncingBoards ? 'Syncing...' : 'Sync Boards'"></span>
          </button>
        </div>
      </div>

      <!-- Boards Table -->
      <div class="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden max-h-80 overflow-y-auto">
        <table class="w-full text-left text-xs">
          <thead>
            <tr class="border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold uppercase text-slate-500 bg-slate-50 dark:bg-slate-900/50">
              <th class="py-2.5 px-3">Board Name</th>
              <th class="py-2.5 px-3 text-right">Pins</th>
              <th class="py-2.5 px-3 text-right">Followers</th>
              <th class="py-2.5 px-3 text-center">Last Activity</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
            <template x-for="b in competitorBoardsList" :key="b.board_id">
              <tr class="hover:bg-slate-50 dark:hover:bg-slate-900/40 transition">
                <td class="py-2.5 px-3 font-sans">
                  <a :href="b.url || 'https://www.pinterest.com/' + activeBoardsCompetitor?.username" target="_blank" class="font-bold text-slate-900 dark:text-white hover:text-purple-500 flex items-center space-x-1">
                    <span x-text="b.name"></span>
                    <i data-lucide="external-link" class="w-3 h-3 text-slate-400"></i>
                  </a>
                </td>
                <td class="py-2.5 px-3 text-right font-bold text-slate-800 dark:text-slate-200" x-text="formatNumber(b.pin_count)"></td>
                <td class="py-2.5 px-3 text-right text-slate-600 dark:text-slate-400" x-text="formatNumber(b.follower_count)"></td>
                <td class="py-2.5 px-3 text-center">
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30" x-text="b.last_pinned_at ? new Date(b.last_pinned_at).toLocaleDateString() : 'Unknown'"></span>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
        <div x-show="competitorBoardsList.length === 0 && !isLoadingBoards" class="p-6 text-center text-slate-400 text-xs">
          <span>No boards loaded yet. Click 'Sync Boards from Pinterest' to fetch board breakdowns.</span>
        </div>
      </div>

      <div class="pt-2 text-right border-t border-slate-200 dark:border-slate-800">
        <button @click="isBoardsModalOpen = false" class="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-700">Close</button>
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
        currentTab: 'seeds',
        isLoading: false,
        isAddSeedOpen: false,
        isDossierOpen: false,
        copiedField: null,
        toastMessage: null,

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
        isAddFleetModalOpen: false,
        newFleetProjectId: '',
        newFleetProjectName: '',
        selectedProject: 'all',

        // Tab 6: PinArchive & Topic Clusters State
        pinarchiveOverview: { total_pins: 0, total_saves: 0, total_repins: 0, avg_velocity: 0, tracked_accounts: 0, top_cluster: null, staged_pins_count: 0 },
        pinarchiveTopics: [],
        pinarchivePins: [],
        pinarchiveTopicSearch: '',
        pinarchiveSearch: '',
        pinarchiveMinSaves: 0,
        pinarchiveSort: 'saves',
        pinarchiveSelectedTopic: '',
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
          this.currentTab = tab;
          if (tab === 'intersections' && this.intersections.length === 0) {
            this.fetchIntersections();
          } else if (tab === 'explorer' && this.explorerCandidates.length === 0) {
            this.loadExplorerData();
          } else if (tab === 'competitors') {
            if (this.competitors.length === 0) this.fetchCompetitors();
          } else if (tab === 'keywords') {
            if (this.keywords.length === 0) this.fetchKeywords();
          } else if (tab === 'fleet') {
            if (this.fleetProjects.length === 0) this.fetchFleetProjects();
          } else if (tab === 'pinarchive') {
            if (this.pinarchivePins.length === 0) {
              this.fetchPinArchiveOverview();
              this.fetchPinArchiveTopics();
              this.fetchPinArchivePins();
              this.fetchQualificationRules();
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
              fetch('/api/candidates?seed_pin_id=' + seed.pin_id + '&sort=' + this.dossierSort + '&limit=1000'),
              fetch('/api/cluster-telemetry?seed_pin_id=' + seed.pin_id),
              fetch('/api/recgpt-playbook?seed_pin_id=' + seed.pin_id),
              fetch('/api/guided-search?seed_pin_id=' + seed.pin_id)
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
              fetch('/api/candidates?seed_pin_id=' + this.activeDossierSeed.pin_id + '&sort=' + this.dossierSort + '&limit=1000'),
              fetch('/api/guided-search?seed_pin_id=' + this.activeDossierSeed.pin_id)
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
              const res = await fetch('/api/recgpt-playbook' + (item?.seed_pin_id ? '?seed_pin_id=' + item.seed_pin_id : ''));
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
          await this.refreshAll();
          this.pollCrawlStatus();
          setInterval(() => this.pollCrawlStatus(), 3000);
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
            } else if (this.currentTab === 'pinarchive') {
              await this.fetchPinArchivePins();
            }
          } finally {
            this.isLoading = false;
            this.$nextTick(() => {
              if (window.lucide) window.lucide.createIcons();
            });
          }
        },

        getApiUrl(base) {
          if (this.selectedProject && this.selectedProject !== 'all' && this.selectedProject !== 'hub' && this.selectedProject !== 'weathered-band-34334459') {
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
              if (data.overview) this.competitorsOverview = data.overview;
              if (data.competitors) this.competitors = data.competitors;
            }
          } catch (e) {}
        },

        async syncCompetitor(username) {
          try {
            this.showToast('Syncing profile for @' + username + '...');
            const res = await fetch(this.getApiUrl('/api/competitors/sync'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ username })
            });
            if (res.ok) {
              await this.fetchCompetitors();
              this.showToast('Profile @' + username + ' synced successfully!');
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

        async openBoardsModal(competitor) {
          if (!competitor) return;
          this.activeBoardsCompetitor = competitor;
          this.competitorBoardsList = [];
          this.isBoardsModalOpen = true;
          this.isLoadingBoards = true;
          this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          try {
            const res = await fetch(this.getApiUrl('/api/competitors/boards?competitor_id=' + competitor.id));
            if (res.ok) {
              const data = await res.json();
              this.competitorBoardsList = data.boards || [];
            }
          } catch (e) {
            console.error('openBoardsModal error:', e);
          } finally {
            this.isLoadingBoards = false;
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
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
              const bRes = await fetch(this.getApiUrl('/api/competitors/boards?competitor_id=' + competitor.id));
              if (bRes.ok) {
                const bData = await bRes.json();
                this.competitorBoardsList = bData.boards || [];
                competitor.total_boards = this.competitorBoardsList.length;
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
              if (data.keywords) this.keywords = data.keywords;
            }
          } catch (e) {}
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
            const res = await fetch('/api/fleet/projects');
            if (res.ok) {
              const data = await res.json();
              if (data.projects) this.fleetProjects = data.projects;
            }
          } catch (e) {}
        },

        async switchProject(projId) {
          this.selectedProject = projId;
          this.showToast('Switched view to project: ' + projId);
          await this.refreshAll();
        },

        async fetchPinArchiveOverview() {
          try {
            const res = await fetch(this.getApiUrl('/api/pinarchive/overview'));
            if (res.ok) {
              const data = await res.json();
              this.pinarchiveOverview = data.overview || data;
            }
          } catch (e) {
            console.error('fetchPinArchiveOverview error:', e);
          }
        },

        async fetchPinArchiveTopics() {
          try {
            const search = encodeURIComponent(this.pinarchiveTopicSearch || '');
            const res = await fetch(this.getApiUrl('/api/pinarchive/topics?search=' + search));
            if (res.ok) {
              const data = await res.json();
              this.pinarchiveTopics = data.topics || [];
            }
          } catch (e) {
            console.error('fetchPinArchiveTopics error:', e);
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
            p.set('limit', '48');
            const res = await fetch(this.getApiUrl('/api/pinarchive/pins?' + p.toString()));
            if (res.ok) {
              const data = await res.json();
              this.pinarchivePins = data.pins || [];
            }
          } catch (e) {
            console.error('fetchPinArchivePins error:', e);
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
                this.qualificationRules = { ...this.qualificationRules, ...data.rules };
              }
            }
          } catch (e) {
            console.error('fetchQualificationRules error:', e);
          }
        },

        async saveQualificationRulesAction() {
          this.isSavingRules = true;
          try {
            const res = await fetch(this.getApiUrl('/api/pinarchive/rules'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(this.qualificationRules)
            });
            if (res.ok) {
              const data = await res.json();
              if (data.rules) {
                this.qualificationRules = { ...this.qualificationRules, ...data.rules };
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
              this.showToast('⚡ Evaluated ' + data.total_evaluated + ' pins: ' + data.qualified_count + ' qualified, ' + data.disqualified_pruned + ' pruned.');
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
          if (!competitor || !competitor.id) return;
          const maxPages = mode === 'deep' ? (this.qualificationRules?.discovery_max_pages || 500) : (this.qualificationRules?.early_stop_pages || 3);
          const confirmMsg = mode === 'deep' 
            ? 'Start Deep Audit Sweep for @' + competitor.username + ' (up to ' + maxPages + ' pages)? This may take a minute.'
            : 'Harvest latest pins for @' + competitor.username + ' (Early-Stop ' + maxPages + ' pages)?';
          
          if (mode === 'deep' && !confirm(confirmMsg)) return;

          this.harvestingCompetitorId = competitor.id;
          this.showToast('⏳ Crawling pins for @' + competitor.username + ' (' + mode + ' mode, max ' + maxPages + 'p)...');
          try {
            const res = await fetch(this.getApiUrl('/api/competitors/sync-pins'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                competitor_id: competitor.id,
                username: competitor.username,
                mode: mode,
                max_pages: maxPages
              })
            });
            if (res.ok) {
              const data = await res.json();
              this.showToast('🎉 Harvested ' + (data.crawled || 0) + ' pins for @' + competitor.username + ': ' + (data.qualified || 0) + ' qualified, ' + (data.inserted || 0) + ' archived!');
              await this.fetchCompetitors();
              await this.fetchPinArchiveOverview();
              if (this.currentTab === 'pinarchive') {
                await this.fetchPinArchivePins();
              }
            } else {
              const err = await res.json();
              this.showToast('Harvest failed: ' + (err.error || 'Error'));
            }
          } catch (e) {
            this.showToast('Harvest error: ' + e.message);
          } finally {
            this.harvestingCompetitorId = null;
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        async fetchOverview() {
          try {
            const res = await fetch(this.getApiUrl('/api/overview'));
            if (res.ok) this.overview = await res.json();
          } catch (e) {}
        },

        async fetchSeeds() {
          try {
            const res = await fetch(this.getApiUrl('/api/seeds'));
            if (res.ok) this.seeds = await res.json();
          } catch (e) {}
        },

        async fetchIntersections() {
          try {
            const res = await fetch(this.getApiUrl('/api/intersections?min_overlap=2&limit=1000'));
            if (res.ok) this.intersections = await res.json();
          } catch (e) {}
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
            const res = await fetch('/api/crawl', {
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
          try {
            const res = await fetch('/api/crawl-status');
            if (res.ok) {
              const prevCrawling = this.crawlStatus.is_crawling;
              this.crawlStatus = await res.json();
              if (prevCrawling && !this.crawlStatus.is_crawling) {
                await this.refreshAll();
                if (this.activeDossierSeed) {
                  await this.openSeedDossier(this.activeDossierSeed);
                }
                this.showToast('Crawl completed! Data refreshed.');
              }
            }
          } catch (e) {}
        },

        async fetchCookieStatus() {
          try {
            const res = await fetch('/api/settings/cookie');
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
            const res = await fetch('/api/settings/cookie', {
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
            const res = await fetch('/api/seeds/import-raw-json', {
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

        async submitAddCompetitor() {
          const handle = this.newCompetitorHandle.trim().replace('@', '');
          if (!handle) return;
          try {
            const res = await fetch(this.getApiUrl('/api/competitors'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ username: handle })
            });
            if (res.ok) {
              this.newCompetitorHandle = '';
              this.isAddCompetitorModalOpen = false;
              await this.fetchCompetitors();
              this.showToast('Competitor @' + handle + ' added! Syncing live profile...');
              this.syncCompetitor(handle);
            }
          } catch (e) {
            this.showToast('Failed to add competitor: ' + e.message);
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
            const res = await fetch('/api/fleet/projects', {
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
            const res = await fetch('/api/seeds/bulk', {
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
            const res = await fetch('/api/workflow/runs?limit=15');
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
            const res = await fetch('/api/workflow/trigger', {
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

            const res = await fetch('/api/seeds/bulk-delete', {
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
            const res = await fetch('/api/seeds', {
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
