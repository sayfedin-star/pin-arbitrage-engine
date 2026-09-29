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
          <!-- Dark Mode Toggle Button -->
          <button @click="toggleTheme()" class="p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition active:scale-95" :title="isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'">
            <i :data-lucide="isDark ? 'sun' : 'moon'" class="w-4 h-4"></i>
          </button>

          <!-- Refresh Data -->
          <button @click="refreshAll()" :disabled="isLoading" class="p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition active:scale-95" title="Refresh Data">
            <i data-lucide="rotate-cw" :class="{'animate-spin': isLoading}" class="w-4 h-4"></i>
          </button>

          <!-- Live Crawl Button -->
          <button @click="triggerCrawl()" :disabled="crawlStatus.is_crawling" class="flex items-center space-x-2 px-3.5 py-2 text-xs font-bold rounded-xl transition shadow-sm active:scale-95 disabled:opacity-50" :class="crawlStatus.is_crawling ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 cursor-not-allowed' : 'bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white shadow-rose-950/20'">
            <i data-lucide="zap" :class="{'animate-spin': crawlStatus.is_crawling}" class="w-3.5 h-3.5"></i>
            <span class="hidden sm:inline" x-text="crawlStatus.is_crawling ? 'Crawling...' : '⚡ Crawl Queued Seeds'"></span>
            <span class="sm:hidden">Crawl</span>
          </button>

          <!-- Pinterest Session Cookie Status Button -->
          <button @click="isCookieModalOpen = true" class="flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold rounded-xl border transition active:scale-95" :class="cookieStatus.has_cookie ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20' : 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20'" title="Pinterest Session Authentication Status">
            <span class="w-2 h-2 rounded-full" :class="cookieStatus.has_cookie ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'"></span>
            <span class="hidden sm:inline" x-text="cookieStatus.has_cookie ? 'Session: Authenticated' : 'Guest Mode (No Cookie)'"></span>
            <span class="sm:hidden" x-text="cookieStatus.has_cookie ? 'Auth' : 'Guest'"></span>
          </button>

          <!-- Add Competitor Button -->
          <button @click="isAddSeedOpen = true" class="flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/90 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition active:scale-95">
            <i data-lucide="plus-circle" class="w-3.5 h-3.5 text-rose-500"></i>
            <span class="hidden sm:inline">Add Seed</span>
          </button>
        </div>
      </div>

      <!-- 3 Primary Top-Level Navigation Tabs -->
      <div class="flex items-center space-x-2 sm:space-x-4 border-t border-slate-200 dark:border-slate-800/80 pt-1 -mb-px">
        <!-- Tab 1: Tracked Seeds -->
        <button @click="switchTab('seeds')" class="flex items-center space-x-2 px-4 py-3 text-xs sm:text-sm font-semibold border-b-2 transition whitespace-nowrap" :class="currentTab === 'seeds' ? 'border-rose-500 text-rose-600 dark:text-rose-400 font-bold' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'">
          <i data-lucide="folder-git-2" class="w-4 h-4"></i>
          <span>📁 Tracked Seeds (صفحة لكل بذرة)</span>
          <span class="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300" x-text="seeds.length"></span>
        </button>

        <!-- Tab 2: Global Intersections -->
        <button @click="switchTab('intersections')" class="flex items-center space-x-2 px-4 py-3 text-xs sm:text-sm font-semibold border-b-2 transition whitespace-nowrap" :class="currentTab === 'intersections' ? 'border-rose-500 text-rose-600 dark:text-rose-400 font-bold' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'">
          <i data-lucide="flame" class="w-4 h-4 text-amber-500"></i>
          <span>⚡ Global Intersections (صفحة التقاطعات الشاملة)</span>
          <span class="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-amber-500/20 text-amber-700 dark:text-amber-400" x-text="intersections.length"></span>
        </button>

        <!-- Tab 3: Master Database Explorer -->
        <button @click="switchTab('explorer')" class="flex items-center space-x-2 px-4 py-3 text-xs sm:text-sm font-semibold border-b-2 transition whitespace-nowrap" :class="currentTab === 'explorer' ? 'border-rose-500 text-rose-600 dark:text-rose-400 font-bold' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'">
          <i data-lucide="database" class="w-4 h-4 text-sky-500"></i>
          <span>📊 Master Database Explorer (المستكشف العام)</span>
          <span class="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-sky-500/10 text-sky-700 dark:text-sky-400" x-text="overview.total_candidates || '...'"></span>
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

      <!-- View A: Grid of All Tracked Seeds -->
      <template x-if="!activeDossierSeed">
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <div>
              <h2 class="text-base font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                <i data-lucide="layers" class="w-4 h-4 text-rose-500"></i>
                <span>Tracked Seeds in Neon Postgres Database</span>
              </h2>
              <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Click "Inspect Seed Cluster" to view isolated telemetry quotas, Color DNA, and its full harvested candidate list.</p>
            </div>
            <span class="text-xs font-mono text-slate-500" x-text="seeds.length + ' Tracked Cluster Seeds'"></span>
          </div>

          <!-- Responsive Grid of Seed Cards -->
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            <template x-for="seed in seeds" :key="seed.pin_id">
              <div class="bg-white dark:bg-[#0d1526] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 shadow-sm dark:shadow-xl hover:border-slate-400 dark:hover:border-slate-700 transition space-y-4 flex flex-col justify-between">
                
                <div class="space-y-3">
                  <!-- Seed Card Top Row -->
                  <div class="flex items-start justify-between gap-2">
                    <div class="flex items-center space-x-1.5 flex-wrap gap-y-1">
                      <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider" :class="seed.is_competitor ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20'" x-text="seed.is_competitor ? 'Competitor Cluster' : 'Internal Seed'"></span>
                      <span x-show="Number(seed.total_capsules || 0) > 0" class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-500/20" x-text="seed.total_capsules + ' Guided Capsules'"></span>
                    </div>
                    <span class="text-[10px] font-mono text-slate-400 truncate" x-text="seed.last_crawled_at ? 'Crawled ' + new Date(seed.last_crawled_at).toLocaleDateString() : 'Pending Crawl'"></span>
                  </div>

                  <!-- Label & Pin ID -->
                  <div>
                    <h3 class="font-bold text-sm text-slate-900 dark:text-white line-clamp-2" x-text="seed.label || 'Tracked Cluster Seed'"></h3>
                    <div class="flex items-center space-x-1 text-xs font-mono text-slate-500 dark:text-slate-400 mt-1">
                      <span>Pin ID:</span>
                      <strong class="text-slate-800 dark:text-slate-200" x-text="seed.pin_id"></strong>
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

                <!-- Primary Action Button: Inspect Seed Cluster & Delete -->
                <div class="flex items-center space-x-2">
                  <button @click="openSeedDossier(seed)" class="flex-1 flex items-center justify-center space-x-2 py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-bold text-xs shadow-sm active:scale-95 transition">
                    <i data-lucide="eye" class="w-3.5 h-3.5"></i>
                    <span>Inspect Seed Cluster</span>
                  </button>
                  <button @click.stop="deleteSeed(seed.pin_id, seed.label)" class="p-2.5 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 transition active:scale-95" title="Delete this seed">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                  </button>
                </div>
              </div>
            </template>
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

        <!-- 3. Intersections Table (Paginated & Compact) -->
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs border-collapse">
            <thead>
              <tr class="border-b border-slate-200 dark:border-slate-800/80 bg-slate-50/80 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 font-mono text-[11px] uppercase tracking-wider">
                <th class="py-3 px-3">Preview & Format</th>
                <th class="py-3 px-3 min-w-[260px]">Intersecting Candidate Title</th>
                <th class="py-3 px-3 min-w-[240px] max-w-[320px]">Originating Seeds Convergence</th>
                <th class="py-3 px-3">Pixie Multi-Hit Mass</th>
                <th class="py-3 px-3">Engagement Metrics</th>
                <th class="py-3 px-3">Color DNA</th>
                <th class="py-3 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60 font-sans">
              <template x-for="item in paginatedIntersections" :key="item.candidate_pin_id">
                <tr class="hover:bg-slate-50/80 dark:hover:bg-slate-900/40 transition">
                  
                  <!-- 1. Preview & Format -->
                  <td class="py-3 px-3 whitespace-nowrap">
                    <div class="flex items-center space-x-2">
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
                            <span class="px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/40">
                              VACUUM
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
                        <a :href="'https://www.pinterest.com/pin/' + item.candidate_pin_id + '/'" 
                           target="_blank" 
                           class="font-bold text-slate-900 dark:text-slate-100 hover:text-rose-600 dark:hover:text-rose-400 line-clamp-1 hover:underline text-xs" 
                           x-text="item.title || ('Pin ' + item.candidate_pin_id)"></a>
                        <a :href="'https://www.pinterest.com/pin/' + item.candidate_pin_id + '/'" 
                           target="_blank" 
                           class="text-slate-400 hover:text-rose-500 transition flex-shrink-0" title="Open on Pinterest">
                          <i data-lucide="external-link" class="w-3 h-3"></i>
                        </a>
                      </div>

                      <div class="flex items-center space-x-2 text-[10px] text-slate-500 font-mono flex-wrap gap-y-0.5">
                        <span class="px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 truncate max-w-[130px]" x-text="item.domain"></span>
                        <span>•</span>
                        <button @click="copyToClipboard(item.candidate_pin_id, 'pin-' + item.candidate_pin_id)" 
                                class="hover:text-rose-500 flex items-center space-x-0.5 cursor-pointer text-slate-500" title="Copy Pin ID">
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
                  <td class="py-3 px-3 min-w-[240px] max-w-[320px]">
                    <div class="space-y-1">
                      <div class="flex items-center justify-between">
                        <div class="flex items-center space-x-1 font-mono text-[11px] font-bold" :class="{
                          'text-rose-600 dark:text-rose-400': item.seed_overlap_count >= 7,
                          'text-amber-600 dark:text-amber-400': item.seed_overlap_count >= 5 && item.seed_overlap_count < 7,
                          'text-sky-600 dark:text-sky-400': item.seed_overlap_count >= 3 && item.seed_overlap_count < 5,
                          'text-slate-600 dark:text-slate-400': item.seed_overlap_count < 3
                        }">
                          <i data-lucide="git-merge" class="w-3.5 h-3.5"></i>
                          <span x-text="'Found in ' + item.seed_overlap_count + ' Seeds'"></span>
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

                  <!-- 4. Pixie Multi-Hit Score -->
                  <td class="py-3 px-3 whitespace-nowrap font-mono">
                    <div class="text-sm font-extrabold text-amber-600 dark:text-amber-400" x-text="Number(item.pixie_multihit_score || 0).toLocaleString()"></div>
                    <div class="text-[10px] text-slate-400 flex items-center space-x-1">
                      <span>Random Walk Mass</span>
                    </div>
                  </td>

                  <!-- 5. Metrics -->
                  <td class="py-3 px-3 whitespace-nowrap font-mono">
                    <div class="font-bold text-slate-900 dark:text-white" x-text="Number(item.total_saves != null ? item.total_saves : (item.saves || 0)).toLocaleString() + ' saves'"></div>
                    <div class="text-[10px] text-slate-500" x-text="Number(item.total_repins != null ? item.total_repins : (item.repins || 0)).toLocaleString() + ' repins • ' + (item.avg_save_rate != null ? item.avg_save_rate : (item.save_rate != null ? item.save_rate : 0)) + '% rate'"></div>
                    <template x-if="Number(item.daily_velocity || 0) > 0">
                      <div class="text-[9px] font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5" x-text="'🔥 ' + item.daily_velocity + '/day'"></div>
                    </template>
                  </td>

                  <!-- 6. Color DNA -->
                  <td class="py-3 px-3 whitespace-nowrap">
                    <div class="flex items-center space-x-2">
                      <span class="w-4 h-4 rounded border flex-shrink-0 shadow-sm" :style="'background-color: ' + (item.winning_color || item.dominant_color || '#888888')"></span>
                      <div class="space-y-0.5 min-w-0">
                        <div class="font-mono text-[10px] font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide" x-text="item.winning_color || item.dominant_color || '#888888'"></div>
                        <div class="text-[9px] text-slate-500 dark:text-slate-400 font-medium truncate max-w-[130px]" x-text="item.culinary_color_name || 'Culinary Accent'" :title="item.culinary_color_name"></div>
                      </div>
                    </div>
                  </td>

                  <!-- 7. Action -->
                  <td class="py-3 px-3 text-right whitespace-nowrap">
                    <button @click="inspectCandidate(item)" class="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white text-xs font-semibold shadow-sm active:scale-95 transition">
                      <i data-lucide="zap" class="w-3.5 h-3.5"></i>
                      <span>⚡ Blueprint</span>
                    </button>
                  </td>
                </tr>
              </template>

              <!-- Empty Results Placeholder -->
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
                <option :value="15">15</option>
                <option :value="25">25</option>
                <option :value="50">50</option>
                <option :value="100">100</option>
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

  <!-- Add New Seed Modal -->
  <div x-show="isAddSeedOpen" x-cloak class="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4">
    <div class="bg-white dark:bg-[#0d1526] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4" @click.away="isAddSeedOpen = false">
      <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
        <h3 class="font-bold text-slate-900 dark:text-white text-sm flex items-center space-x-2">
          <i data-lucide="plus-circle" class="w-4 h-4 text-rose-500"></i>
          <span>Track New Competitor Seed Pin</span>
        </h3>
        <button @click="isAddSeedOpen = false" class="text-slate-400 hover:text-slate-700 dark:hover:text-white">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>

      <div class="space-y-3 text-xs">
        <div>
          <label class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Pinterest Pin ID</label>
          <input type="text" x-model="newSeed.pin_id" placeholder="e.g. 346495765100199292" class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-rose-500 font-mono">
        </div>
        <div>
          <label class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Label / Recipe Name</label>
          <input type="text" x-model="newSeed.label" placeholder="e.g. Garlic Butter Chicken Competitor" class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-rose-500">
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
      </div>

      <div class="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end space-x-2">
        <button @click="isAddSeedOpen = false" class="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-700">Cancel</button>
        <button @click="addSeed()" class="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition active:scale-95">Save Seed</button>
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

        // Tab 2: Global Intersections State
        intersectionPage: 1,
        intersectionPageSize: 25,
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

        toggleTheme() {
          this.isDark = !this.isDark;
          localStorage.setItem('pin_theme', this.isDark ? 'dark' : 'light');
          this.$nextTick(() => {
            if (window.lucide) window.lucide.createIcons();
          });
        },

        switchTab(tab) {
          this.currentTab = tab;
          if (tab === 'intersections' && this.intersections.length === 0) {
            this.fetchIntersections();
          } else if (tab === 'explorer' && this.explorerCandidates.length === 0) {
            this.loadExplorerData();
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
            maxPixie: maxPixie.toLocaleString()
          };
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
          const savedTheme = localStorage.getItem('pin_theme');
          if (savedTheme) {
            this.isDark = savedTheme === 'dark';
          }
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
              this.fetchCookieStatus()
            ]);
            if (this.currentTab === 'explorer') {
              await this.loadExplorerData();
            }
          } finally {
            this.isLoading = false;
            this.$nextTick(() => {
              if (window.lucide) window.lucide.createIcons();
            });
          }
        },

        async fetchOverview() {
          try {
            const res = await fetch('/api/overview');
            if (res.ok) this.overview = await res.json();
          } catch (e) {}
        },

        async fetchSeeds() {
          try {
            const res = await fetch('/api/seeds');
            if (res.ok) this.seeds = await res.json();
          } catch (e) {}
        },

        async fetchIntersections() {
          try {
            const res = await fetch('/api/intersections?min_overlap=2&limit=1000');
            if (res.ok) this.intersections = await res.json();
          } catch (e) {}
        },

        async loadExplorerData() {
          let url = '/api/candidates?limit=1000&sort=' + this.explorerSort;
          if (this.explorerSeedId && this.explorerSeedId !== 'all') {
            url += '&seed_pin_id=' + this.explorerSeedId;
          }
          try {
            const res = await fetch(url);
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
                await this.triggerCrawl(newPinId);
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
          const name = label || pinId;
          if (!confirm('Are you sure you want to delete seed "' + name + '" (' + pinId + ') and all associated candidates and metrics? This action cannot be undone.')) {
            return;
          }
          try {
            const res = await fetch('/api/seeds?pin_id=' + encodeURIComponent(pinId), {
              method: 'DELETE'
            });
            if (res.ok) {
              this.showToast('Seed ' + pinId + ' deleted successfully');
              if (this.activeDossierSeed && this.activeDossierSeed.pin_id === pinId) {
                this.closeSeedDossier();
              }
              await this.refreshAll();
            } else {
              const err = await res.json();
              alert('Error deleting seed: ' + (err.error || 'Unknown error'));
            }
          } catch (e) {
            alert('Failed to delete seed: ' + e.message);
          }
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
