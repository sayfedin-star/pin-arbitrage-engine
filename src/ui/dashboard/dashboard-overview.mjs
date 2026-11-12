/**
 * Tab 0: Executive Command Center & Quick Access Hub
 * Route: / (Default landing page with fast access)
 */
export function getDashboardOverviewHtml() {
  return `    <!-- ======================================================== -->
    <!-- TAB 0: 🏠 EXECUTIVE COMMAND CENTER & QUICK ACCESS HUB       -->
    <!-- Route: / (Default landing page with fast access)         -->
    <!-- ======================================================== -->
    <div x-show="currentTab === 'overview'" x-cloak class="space-y-6">
      
      <!-- Mission Control Executive Hero Header -->
      <div class="p-5 sm:p-6 rounded-3xl bg-gradient-to-br from-white via-slate-50 to-indigo-50/30 dark:from-[#0b1120] dark:via-[#090d18] dark:to-indigo-950/20 border border-slate-200/90 dark:border-[#27272A] shadow-sm flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div class="flex items-start sm:items-center space-x-3.5">
          <div class="h-12 w-12 rounded-2xl bg-rose-600 text-white flex items-center justify-center shadow-md shadow-indigo-500/20 shrink-0">
            <i data-lucide="layout-dashboard" class="w-6 h-6"></i>
          </div>
          <div class="space-y-1">
            <div class="flex flex-wrap items-center gap-2">
              <h1 class="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white">Executive Command Center</h1>
              <span class="px-2.5 py-0.5 text-[10px] font-bold uppercase rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30">V3 Predictive Hub</span>
            </div>
            <p class="text-xs text-slate-500 dark:text-slate-400">
              Fast-access command hub across Creators & PinArchive, Keywords Fleet SERP, Board Ideas Radar, and Cluster Graph Telemetry.
            </p>
          </div>
        </div>

        <!-- Quick Actions Header Bar -->
        <div class="flex flex-wrap items-center gap-2">
          <button @click="openAddCompetitorModal()" class="px-3.5 py-2 text-xs font-bold rounded-xl bg-gradient-to-r bg-rose-600 hover:bg-rose-500 text-white transition flex items-center space-x-1.5 shadow-sm shadow-indigo-950/20 active:scale-95 cursor-pointer">
            <i data-lucide="user-plus" class="w-3.5 h-3.5"></i>
            <span>+ Track Creator</span>
          </button>
          <button @click="openAddSeedModal()" class="px-3.5 py-2 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-[#27272A] transition flex items-center space-x-1.5 shadow-2xs active:scale-95 cursor-pointer">
            <i data-lucide="plus-circle" class="w-3.5 h-3.5 text-rose-500"></i>
            <span>+ Add Seeds</span>
          </button>
          <button @click="openCrawlModal()" class="px-3.5 py-2 text-xs font-bold rounded-xl transition flex items-center space-x-1.5 shadow-2xs active:scale-95 cursor-pointer" :class="crawlStatus.is_crawling ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30' : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-amber-600 dark:text-amber-400 border border-slate-200 dark:border-[#27272A]'">
            <i data-lucide="zap" :class="{'animate-spin': crawlStatus.is_crawling}" class="w-3.5 h-3.5"></i>
            <span>Crawl</span>
          </button>
          <button @click="refreshAll()" :disabled="isLoading" class="p-2 rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition active:scale-95 shadow-2xs cursor-pointer" title="Refresh All Data">
            <i data-lucide="rotate-cw" :class="{'animate-spin': isLoading}" class="w-4 h-4"></i>
          </button>
        </div>
      </div>

      <!-- Global 24-Hour Algorithmic Pulse & Crossover Command Banner [INVARIANT: 24H-PULSE-COMMAND-BANNER] -->
      <div class="p-4 sm:p-5 rounded-3xl bg-gradient-to-r from-rose-950/20 via-purple-950/20 to-slate-900/40 border border-rose-500/30 dark:border-rose-500/20 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div class="flex items-start sm:items-center space-x-3.5">
          <div class="h-11 w-11 rounded-2xl bg-gradient-to-br from-rose-500 to-rose-700 text-white flex items-center justify-center shadow-md shadow-rose-900/30 shrink-0">
            <i data-lucide="activity" class="w-6 h-6"></i>
          </div>
          <div class="space-y-0.5">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-sm sm:text-base font-bold text-slate-900 dark:text-white tracking-tight">Global 24-Hour Algorithmic Pulse &amp; Crossover Studio</span>
              <span class="px-2 py-0.5 text-[10px] font-mono tabular-nums font-bold uppercase rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30">Live Telemetry</span>
            </div>
            <p class="text-xs text-slate-500 dark:text-[#A1A1AA]">
              Real-time multi-keyword SERP breakout momentum, 1/2/3-gram annotation matrix, guided search capsules &amp; scientific pin blueprints.
            </p>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2.5 shrink-0">
          <a href="/pulse" class="px-4 py-2 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-500 text-white transition flex items-center space-x-2 shadow-sm shadow-rose-950/20 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">
            <i data-lucide="zap" class="w-4 h-4"></i>
            <span>Launch 24h Pulse Studio →</span>
          </a>
        </div>
      </div>

      <!-- Real-Time Top KPI Ribbon (5 Core Pillars) -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        <!-- 1. Creator Reach -->
        <div @click="switchTab('creators_archive')" class="p-4 rounded-2xl bg-white dark:bg-[#121215] border border-slate-200/80 dark:border-[#27272A] shadow-sm hover:border-purple-500/40 hover:shadow-md transition cursor-pointer group">
          <div class="flex items-center justify-between text-slate-500 dark:text-slate-400 text-[11px] font-bold uppercase tracking-wider">
            <span>COMBINED REACH</span>
            <div class="p-1.5 rounded-lg bg-purple-500/10 text-purple-500 group-hover:scale-110 transition">
              <i data-lucide="trending-up" class="w-3.5 h-3.5"></i>
            </div>
          </div>
          <div class="mt-2.5 flex items-baseline space-x-1.5">
            <template x-if="!isOverviewLoaded">
              <span class="inline-block h-7 w-24 rounded-lg bg-slate-200 dark:bg-[#27272A] animate-pulse" aria-label="Loading combined reach"></span>
            </template>
            <template x-if="isOverviewLoaded">
              <span class="text-2xl font-black text-slate-900 dark:text-white font-mono tabular-nums" x-text="formatNumber(competitorsOverview.combined_reach || 0)"></span>
            </template>
          </div>
          <div class="mt-2 flex items-center justify-between text-[10.5px]">
            <template x-if="!isOverviewLoaded">
              <span class="inline-block h-3.5 w-20 rounded bg-slate-200 dark:bg-[#27272A] animate-pulse"></span>
            </template>
            <template x-if="isOverviewLoaded">
              <span class="text-slate-500" x-text="(competitorsOverview.tracked_profiles || competitors.length || 0) + ' Creators'"></span>
            </template>
            <span class="font-mono tabular-nums text-emerald-600 dark:text-emerald-400 font-bold" x-text="!isOverviewLoaded ? '...' : (competitors[0] ? '@' + competitors[0].username : 'Active')"></span>
          </div>
        </div>

        <!-- 2. Archived Winning Pins -->
        <div @click="switchTab('creators_archive')" class="p-4 rounded-2xl bg-white dark:bg-[#121215] border border-slate-200/80 dark:border-[#27272A] shadow-sm hover:border-indigo-500/40 hover:shadow-md transition cursor-pointer group">
          <div class="flex items-center justify-between text-slate-500 dark:text-slate-400 text-[11px] font-bold uppercase tracking-wider">
            <span>ARCHIVED PINS</span>
            <div class="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-500 group-hover:scale-110 transition">
              <i data-lucide="archive" class="w-3.5 h-3.5"></i>
            </div>
          </div>
          <div class="mt-2.5 flex items-baseline space-x-1.5">
            <template x-if="!isOverviewLoaded">
              <span class="inline-block h-7 w-20 rounded-lg bg-slate-200 dark:bg-[#27272A] animate-pulse" aria-label="Loading archived pins"></span>
            </template>
            <template x-if="isOverviewLoaded">
              <span class="text-2xl font-black text-indigo-600 dark:text-indigo-400 font-mono tabular-nums" x-text="formatNumber(pinarchiveOverview.total_pins || 0)"></span>
            </template>
          </div>
          <div class="mt-2 flex items-center justify-between text-[10.5px]">
            <template x-if="!isOverviewLoaded">
              <span class="inline-block h-3.5 w-20 rounded bg-slate-200 dark:bg-[#27272A] animate-pulse"></span>
            </template>
            <template x-if="isOverviewLoaded">
              <span class="text-slate-500" x-text="formatNumber(pinarchiveOverview.total_saves || 0) + ' Saves'"></span>
            </template>
            <span class="font-mono tabular-nums text-indigo-600 dark:text-indigo-400 font-bold">3-Tier Rules</span>
          </div>
        </div>

        <!-- 3. Keywords Fleet -->
        <a href="/keywords" class="p-4 rounded-2xl bg-white dark:bg-[#121215] border border-slate-200/80 dark:border-[#27272A] shadow-sm hover:border-emerald-500/40 hover:shadow-md transition cursor-pointer group block">
          <div class="flex items-center justify-between text-slate-500 dark:text-slate-400 text-[11px] font-bold uppercase tracking-wider">
            <span>KEYWORDS FLEET</span>
            <div class="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 group-hover:scale-110 transition">
              <i data-lucide="search" class="w-3.5 h-3.5"></i>
            </div>
          </div>
          <div class="mt-2.5 flex items-baseline space-x-1.5">
            <template x-if="!isOverviewLoaded">
              <span class="inline-block h-7 w-24 rounded-lg bg-slate-200 dark:bg-[#27272A] animate-pulse" aria-label="Loading keywords fleet"></span>
            </template>
            <template x-if="isOverviewLoaded">
              <span class="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono tabular-nums" x-text="(keywords.length || 0) + ' Queries'"></span>
            </template>
          </div>
          <div class="mt-2 flex items-center justify-between text-[10.5px]">
            <template x-if="!isOverviewLoaded">
              <span class="inline-block h-3.5 w-24 rounded bg-slate-200 dark:bg-[#27272A] animate-pulse"></span>
            </template>
            <template x-if="isOverviewLoaded">
              <span class="text-slate-500" x-text="formatNumber(overview.total_candidates || keywords.reduce((sum, k) => sum + Number(k.total_pins_tracked || k.pins_count || 0), 0) || 0) + ' Pins Monitored'"></span>
            </template>
            <span class="font-mono tabular-nums text-emerald-600 dark:text-emerald-400 font-bold">Studio ↗</span>
          </div>
        </a>

        <!-- 5. Related Pins Hub -->
        <div @click="switchTab('related_pins')" class="p-4 rounded-2xl bg-white dark:bg-[#121215] border border-slate-200/80 dark:border-[#27272A] shadow-sm hover:border-rose-500/40 hover:shadow-md transition cursor-pointer group">
          <div class="flex items-center justify-between text-slate-500 dark:text-slate-400 text-[11px] font-bold uppercase tracking-wider">
            <span>RELATED CLUSTERS</span>
            <div class="p-1.5 rounded-lg bg-rose-500/10 text-rose-500 group-hover:scale-110 transition">
              <i data-lucide="git-fork" class="w-3.5 h-3.5"></i>
            </div>
          </div>
          <div class="mt-2.5 flex items-baseline space-x-1.5">
            <template x-if="!isOverviewLoaded">
              <span class="inline-block h-7 w-20 rounded-lg bg-slate-200 dark:bg-[#27272A] animate-pulse" aria-label="Loading related clusters"></span>
            </template>
            <template x-if="isOverviewLoaded">
              <span class="text-2xl font-black text-rose-600 dark:text-rose-400 font-mono tabular-nums" x-text="(seeds.length || 0) + ' Seeds'"></span>
            </template>
          </div>
          <div class="mt-2 flex items-center justify-between text-[10.5px]">
            <template x-if="!isOverviewLoaded">
              <span class="inline-block h-3.5 w-24 rounded bg-slate-200 dark:bg-[#27272A] animate-pulse"></span>
            </template>
            <template x-if="isOverviewLoaded">
              <span class="text-slate-500" x-text="(intersections.length || 0) + ' Intersecting Hubs'"></span>
            </template>
            <span class="font-mono tabular-nums text-amber-600 dark:text-amber-400 font-bold" x-text="!isOverviewLoaded ? '...' : ('Gap: ' + (overview.avg_commercial_gap ?? 0))"></span>
          </div>
        </div>
      </div>

      <!-- 4 Core Dedicated Pillars Launchpad (Interactive Rich Cards) -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
        
        <!-- Pillar 1: Creator Intelligence & PinArchive -->
        <div class="p-5 rounded-3xl bg-white dark:bg-[#121215] border border-slate-200/90 dark:border-[#27272A] shadow-sm flex flex-col justify-between space-y-4">
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <div class="flex items-center space-x-3">
                <div class="h-10 w-10 rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center border border-purple-500/20">
                  <i data-lucide="users" class="w-5 h-5"></i>
                </div>
                <div>
                  <h3 class="font-extrabold text-base text-slate-900 dark:text-white">Creator Hub</h3>
                  <p class="text-xs text-slate-500">Track creator impressions, total audience, boards, and winning pins.</p>
                </div>
              </div>
              <span class="px-2 py-0.5 text-[10px] font-mono tabular-nums font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 rounded-full border border-purple-500/20">/accounts</span>
            </div>

            <!-- Live Creator List Preview -->
            <div class="space-y-2 pt-1">
              <div class="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>Top Tracked Creators</span>
                <span>Reach</span>
              </div>
              <div class="space-y-1.5 divide-y divide-slate-100 dark:divide-slate-800/60">
                <template x-for="c in (competitors || []).slice(0, 3)" :key="c.id || c.username">
                  <div class="flex items-center justify-between pt-1.5 text-xs">
                    <div class="flex items-center space-x-2">
                      <span class="font-bold text-slate-800 dark:text-slate-200" x-text="'@' + (c.username || '').replace(/^@+/, '')"></span>
                      <span class="text-[10px] text-slate-400 font-mono tabular-nums" x-text="(c.pin_count || 0) + ' pins'"></span>
                    </div>
                    <span class="font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400" x-text="formatNumber(c.monthly_reach || 0)"></span>
                  </div>
                </template>
              </div>
            </div>
          </div>

          <!-- Bottom Actions -->
          <div class="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-[#27272A]/80">
            <button @click="openAddCompetitorModal()" class="text-xs font-bold text-purple-600 dark:text-purple-400 hover:underline flex items-center space-x-1 cursor-pointer">
              <i data-lucide="plus" class="w-3.5 h-3.5"></i>
              <span>+ Track Creator</span>
            </button>
            <button @click="switchTab('creators_archive')" class="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-purple-600 hover:bg-purple-500 text-white shadow-2xs transition flex items-center space-x-1 cursor-pointer">
              <span>Open Creator Studio →</span>
            </button>
          </div>
        </div>

        <!-- Pillar 2: Keywords Fleet Dashboard -->
        <div class="p-5 rounded-3xl bg-white dark:bg-[#121215] border border-slate-200/90 dark:border-[#27272A] shadow-sm flex flex-col justify-between space-y-4">
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <div class="flex items-center space-x-3">
                <div class="h-10 w-10 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-500/20">
                  <i data-lucide="search" class="w-5 h-5"></i>
                </div>
                <div>
                  <h3 class="font-extrabold text-base text-slate-900 dark:text-white">Keywords Fleet Dashboard</h3>
                  <p class="text-xs text-slate-500">Multi-cluster SERP ranking radar, 52-week trends, and velocity curves.</p>
                </div>
              </div>
              <span class="px-2 py-0.5 text-[10px] font-mono tabular-nums font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-full border border-emerald-500/20">/keywords</span>
            </div>

            <!-- Live Keyword List Preview -->
            <div class="space-y-2 pt-1">
              <div class="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>Active Queries Sample</span>
                <span>Tracked Pins</span>
              </div>
              <div class="space-y-1.5 divide-y divide-slate-100 dark:divide-slate-800/60">
                <template x-for="kw in (keywords || []).slice(0, 3)" :key="kw.id || kw.keyword">
                  <div class="flex items-center justify-between pt-1.5 text-xs">
                    <div class="flex items-center space-x-2 truncate max-w-[240px]">
                      <span class="font-bold text-slate-800 dark:text-slate-200 truncate" x-text="kw.keyword"></span>
                      <span class="text-[10px] text-slate-400 font-mono tabular-nums shrink-0" x-text="kw.category || 'General'"></span>
                    </div>
                    <span class="font-mono tabular-nums font-bold text-slate-700 dark:text-slate-300" x-text="(kw.snapshots_count || 0) + ' / ' + (kw.target_pin_count || 250)"></span>
                  </div>
                </template>
              </div>
            </div>
          </div>

          <!-- Bottom Actions -->
          <div class="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-[#27272A]/80">
            <a href="/keywords/discovery" class="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center space-x-1 cursor-pointer">
              <i data-lucide="compass" class="w-3.5 h-3.5"></i>
              <span>Keyword Discovery</span>
            </a>
            <a href="/keywords" class="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-2xs transition flex items-center space-x-1 cursor-pointer">
              <span>Open Keywords Studio ↗</span>
            </a>
          </div>
        </div>

        <!-- Pillar 4: Related Pins Intelligence Hub -->
        <div class="p-5 rounded-3xl bg-white dark:bg-[#121215] border border-slate-200/90 dark:border-[#27272A] shadow-sm flex flex-col justify-between space-y-4">
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <div class="flex items-center space-x-3">
                <div class="h-10 w-10 rounded-2xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center border border-rose-500/20">
                  <i data-lucide="git-fork" class="w-5 h-5"></i>
                </div>
                <div>
                  <h3 class="font-extrabold text-base text-slate-900 dark:text-white">Related Pins Intelligence</h3>
                  <p class="text-xs text-slate-500">Seed pin graph crawling, intersecting nodes, and commercial gap ratio.</p>
                </div>
              </div>
              <span class="px-2 py-0.5 text-[10px] font-mono tabular-nums font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 rounded-full border border-rose-500/20">/related-pins</span>
            </div>

            <!-- Live Seeds List Preview -->
            <div class="space-y-2 pt-1">
              <div class="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>Active Seed Pins</span>
                <span>Candidates</span>
              </div>
              <div class="space-y-1.5 divide-y divide-slate-100 dark:divide-slate-800/60">
                <template x-for="s in (seeds || []).slice(0, 3)" :key="s.id || s.seed_pin_id">
                  <div class="flex items-center justify-between pt-1.5 text-xs">
                    <div class="flex items-center space-x-2">
                      <span class="font-mono tabular-nums font-bold text-slate-800 dark:text-slate-200" x-text="s.seed_pin_id"></span>
                      <span class="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono tabular-nums" x-text="s.last_crawled_at ? 'Indexed' : 'Queued'"></span>
                    </div>
                    <span class="font-mono tabular-nums font-bold text-rose-600 dark:text-rose-400" x-text="(s.candidate_count || s.candidates_count || 0) + ' nodes'"></span>
                  </div>
                </template>
              </div>
            </div>
          </div>

          <!-- Bottom Actions -->
          <div class="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-[#27272A]/80">
            <button @click="openAddSeedModal()" class="text-xs font-bold text-rose-600 dark:text-rose-400 hover:underline flex items-center space-x-1 cursor-pointer">
              <i data-lucide="plus" class="w-3.5 h-3.5"></i>
              <span>+ Add Seed Pin</span>
            </button>
            <button @click="switchTab('related_pins')" class="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-500 text-white shadow-2xs transition flex items-center space-x-1 cursor-pointer">
              <span>Open Related Hub →</span>
            </button>
          </div>
        </div>

      </div>



    </div>
`;
}
