/**
 * src/ui/discovery/discovery-studio-view.mjs
 *
 * Keyword Discovery & Autocomplete Hub Main Exploration View, Floating Bar, and Modals
 * Extracted from src/discovery-ui.mjs
 */

export function getDiscoveryStudioViewHtml() {
  return `  <!-- Main Exploration Hub (Offset for Unified Desktop Sidebar) [INVARIANT: UNIFIED-SIDEBAR-LAYOUT] -->
  <main class="flex-1 min-h-screen p-4 sm:p-6 lg:p-8 space-y-6 max-w-full overflow-x-hidden transition-all duration-300 ease-in-out" :class="isSidebarCollapsed ? 'md:!ml-20' : 'md:ml-64 lg:ml-72'">

    <!-- [INVARIANT: UNIFIED-SIDEBAR-LAYOUT] Studio Header Card -->
    <section class="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#121215] border border-slate-200/80 dark:border-[#27272A]/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div class="flex items-center space-x-3.5">
        <div class="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center justify-center shadow-xs shrink-0">
          <i data-lucide="compass" class="w-5 h-5"></i>
        </div>
        <div>
          <div class="flex items-center space-x-2">
            <h2 class="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white">Keyword Discovery &amp; Autocomplete Hub</h2>
            <span class="px-2 py-0.5 rounded-md text-[10px] font-mono tabular-nums font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">Pinterest Typeahead</span>
          </div>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-normal">Real-time Pinterest v3_typeahead radar &amp; search exploration</p>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <a href="/keywords" class="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-[#27272A] transition inline-flex items-center space-x-1.5 shadow-2xs">
          <i data-lucide="arrow-left" class="w-3.5 h-3.5 text-slate-400"></i>
          <span>Keywords Fleet</span>
        </a>
        <a href="/pulse" class="px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-500/10 hover:bg-rose-500/20 dark:bg-rose-950/30 dark:hover:bg-rose-900/40 text-rose-600 dark:text-rose-400 border border-rose-500/20 transition inline-flex items-center space-x-1.5 shadow-2xs" title="24h Algorithmic Pulse & Crossover Radar">
          <i data-lucide="activity" class="w-3.5 h-3.5 text-rose-500"></i>
          <span>24h Pulse Radar</span>
        </a>
        <a href="/folders" class="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-[#27272A] transition inline-flex items-center space-x-1.5 shadow-2xs">
          <i data-lucide="folder-kanban" class="w-3.5 h-3.5 text-pink-500"></i>
          <span>Campaign Folders</span>
        </a>
        <button @click="openBulkModal = true" class="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition inline-flex items-center space-x-1.5 shadow-xs active:scale-95 cursor-pointer">
          <i data-lucide="upload" class="w-3.5 h-3.5"></i>
          <span>Bulk Import</span>
        </button>
      </div>
    </section>

    <!-- Search Omnibar & Typeahead Controls -->
    <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl p-6 shadow-xs relative overflow-hidden">
      <div class="max-w-3xl mx-auto flex flex-col gap-4">
        <div class="text-center">
          <h1 class="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">Explore High-Converting Pinterest Autocomplete Terms</h1>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">Live direct connection to Pinterest v3_typeahead search engine. Discover real-time search volume &amp; trends.</p>
        </div>

        <div class="relative flex items-center">
          <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
          </div>
          <input 
            type="text" 
            x-model="searchQuery" 
            @keydown.enter="searchImmediately()"
            placeholder="Type seed keyword (e.g. healthy dinner, air fryer salmon, living room decor)..."
            class="w-full pl-12 pr-44 py-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-sm placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-mono tabular-nums shadow-inner"
            autofocus
          >
          <div class="absolute inset-y-0 right-2 flex items-center gap-1.5">
            <!-- Clear Button -->
            <button 
              @click="clearSearch()" 
              x-show="searchQuery" 
              class="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" 
              title="Clear query (Esc)" 
              x-cloak
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>

            <!-- Prominent Search Button -->
            <button 
              @click="searchImmediately()" 
              :disabled="loading || !searchQuery.trim()" 
              class="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-mono tabular-nums font-medium rounded-lg shadow-sm transition-all flex items-center gap-1.5 flex-shrink-0 cursor-pointer"
              title="Search or press Enter"
            >
              <template x-if="!loading">
                <span class="flex items-center gap-1.5">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                  <span>Search</span>
                </span>
              </template>
              <template x-if="loading">
                <span class="flex items-center gap-1.5">
                  <svg class="animate-spin h-3.5 w-3.5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                  </svg>
                  <span>Searching...</span>
                </span>
              </template>
            </button>
          </div>
        </div>

        <!-- Categorized Popular Seed Pills -->
        <div class="flex flex-col gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
          <div class="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 flex items-center justify-between">
            <span class="font-bold">POPULAR SEED EXPLORERS:</span>
            <span class="text-[10px] text-slate-400">Click any seed for instant autocomplete</span>
          </div>
          <div class="flex items-center gap-2 flex-wrap text-xs">
            <span class="text-[10px] font-mono tabular-nums text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-wider">Food:</span>
            <button @click="applySeed('dinner ideas')" class="px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors border border-slate-200/60 dark:border-transparent">dinner ideas</button>
            <button @click="applySeed('healthy chicken recipes')" class="px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors border border-slate-200/60 dark:border-transparent">healthy chicken recipes</button>
            <button @click="applySeed('air fryer salmon')" class="px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors border border-slate-200/60 dark:border-transparent">air fryer salmon</button>

            <span class="text-[10px] font-mono tabular-nums text-sky-600 dark:text-blue-400 font-bold uppercase tracking-wider ml-1">Home:</span>
            <button @click="applySeed('small living room decor')" class="px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors border border-slate-200/60 dark:border-transparent">small living room decor</button>
            <button @click="applySeed('kitchen organization')" class="px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors border border-slate-200/60 dark:border-transparent">kitchen organization</button>

            <span class="text-[10px] font-mono tabular-nums text-purple-600 dark:text-purple-400 font-bold uppercase tracking-wider ml-1">Style:</span>
            <button @click="applySeed('casual summer outfits')" class="px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors border border-slate-200/60 dark:border-transparent">casual summer outfits</button>
            <button @click="applySeed('nail art designs')" class="px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors border border-slate-200/60 dark:border-transparent">nail art designs</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Exploration Table & Selection Bar -->
    <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl overflow-hidden shadow-xs flex flex-col">
      <div class="p-4 border-b border-slate-200 dark:border-[#27272A] flex items-center justify-between flex-wrap gap-4 bg-slate-50/50 dark:bg-[#18181B]/50">
        <div class="flex items-center gap-3">
          <h2 class="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            Suggested Search Terms
            <span 
              class="text-xs font-mono tabular-nums font-normal"
              :class="loading ? 'text-emerald-500 animate-pulse font-medium' : 'text-slate-500 dark:text-slate-400'"
              x-text="loading ? '(Searching...)' : (results.length > 0 ? '(' + results.length + ' found)' : (searchQuery.trim() ? '(0 found)' : ''))"
            ></span>
          </h2>
          <!-- Telemetry Cache Indicator -->
          <template x-if="results.length > 0">
            <span
              class="inline-flex items-center gap-1 text-[10px] font-mono tabular-nums px-2 py-0.5 rounded border"
              :class="isCacheHit ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'"
            ><span x-show="isCacheHit" class="inline-flex items-center"><i data-lucide="zap" class="w-3 h-3 shrink-0"></i></span><span x-show="!isCacheHit" class="inline-flex items-center"><i data-lucide="globe" class="w-3 h-3 shrink-0"></i></span><span x-text="isCacheHit ? '0ms Client Cache' : 'Live Pinterest v3_typeahead'"></span></span>
          </template>
          <button x-show="results.length > 0" @click="selectAllToggle()" class="text-xs text-emerald-600 dark:text-emerald-400 hover:underline font-mono tabular-nums" x-cloak>
            <span x-text="selectedKeywords.length === results.length ? 'Deselect all' : 'Select all (' + results.length + ')'"></span>
          </button>
        </div>

        <!-- Quick Summary Actions -->
        <div class="flex items-center gap-2" x-show="results.length > 0" x-cloak>
          <button 
            @click="openRelatedExplorer(searchQuery)" 
            class="px-2.5 py-1 rounded bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 hover:text-rose-900 dark:hover:text-white text-xs font-mono tabular-nums border border-rose-200 dark:border-rose-700/40 flex items-center gap-1.5 transition-colors"
            title="Explore Pinterest Related Interests for current search"
          >
            <i data-lucide="link" class="w-3 h-3 shrink-0"></i><span>Get Related</span>
          </button>
          <button @click="selectAllToggle()" class="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-mono tabular-nums border border-slate-200 dark:border-slate-700">
            <span x-text="selectedKeywords.length === results.length ? 'Clear Selection' : 'Select All'"></span>
          </button>
        </div>
      </div>

      <!-- Table Content -->
      <div class="overflow-x-auto min-h-[320px]">
        <table class="w-full text-left text-xs">
          <thead class="bg-slate-50/75 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-mono tabular-nums uppercase text-[10px]">
            <tr>
              <th class="p-3.5 w-10 text-center">
                <input 
                  type="checkbox" 
                  :checked="results.length > 0 && selectedKeywords.length === results.length" 
                  @change="selectAllToggle()" 
                  class="rounded bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-emerald-600 focus:ring-0 cursor-pointer"
                  :disabled="results.length === 0"
                >
              </th>
              <th class="p-3.5">Keywords</th>
              <th class="p-3.5">Search Volume</th>
              <th class="p-3.5 text-right">Weekly change</th>
              <th class="p-3.5 text-right">Monthly change</th>
              <th class="p-3.5 text-right">Yearly change</th>
              <th class="p-3.5">Taxonomy</th>
              <th class="p-3.5 text-right">Actions</th>
            </tr>
          </thead>

          <!-- Skeleton Loading State (CLS = 0) -->
          <tbody x-show="loading && results.length === 0" class="divide-y divide-slate-200 dark:divide-slate-800/60" x-cloak>
            <template x-for="i in [1, 2, 3, 4, 5, 6]" :key="i">
              <tr class="animate-pulse">
                <td class="p-3.5 text-center"><div class="w-4 h-4 bg-slate-200 dark:bg-slate-800 rounded mx-auto"></div></td>
                <td class="p-3.5"><div class="h-4 bg-slate-200 dark:bg-slate-800 rounded w-48"></div></td>
                <td class="p-3.5"><div class="h-4 bg-slate-200 dark:bg-slate-800 rounded w-24"></div></td>
                <td class="p-3.5 text-right"><div class="h-4 bg-slate-200 dark:bg-slate-800 rounded w-14 ml-auto"></div></td>
                <td class="p-3.5 text-right"><div class="h-4 bg-slate-200 dark:bg-slate-800 rounded w-14 ml-auto"></div></td>
                <td class="p-3.5 text-right"><div class="h-4 bg-slate-200 dark:bg-slate-800 rounded w-14 ml-auto"></div></td>
                <td class="p-3.5"><div class="h-4 bg-slate-200 dark:bg-slate-800 rounded w-48"></div></td>
                <td class="p-3.5 text-right"><div class="h-6 bg-slate-200 dark:bg-slate-800 rounded w-36 ml-auto"></div></td>
              </tr>
            </template>
          </tbody>

          <!-- Results Body -->
          <tbody x-show="!loading || results.length > 0" class="divide-y divide-slate-200 dark:divide-slate-800/60 text-slate-700 dark:text-slate-300 font-sans">
            <template x-for="(item, idx) in results" :key="item.term">
              <tr :class="item.isSeed ? 'bg-cyan-50/70 dark:bg-cyan-950/20 border-l-2 border-l-cyan-500 hover:bg-cyan-100/60 dark:hover:bg-cyan-950/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'" class="transition-colors group">
                <td class="p-3.5 text-center">
                  <input 
                    type="checkbox" 
                    :value="item.term" 
                    x-model="selectedKeywords" 
                    class="rounded bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-emerald-500 focus:ring-0 cursor-pointer"
                  >
                </td>
                <!-- Keywords + Authentic 52-Week Sparkline -->
                <td class="p-3.5 font-medium text-slate-900 dark:text-white">
                  <div class="flex items-center gap-3">
                    <div class="flex flex-col">
                      <div class="flex items-center gap-2">
                        <span class="font-semibold text-slate-900 dark:text-slate-100 font-mono tabular-nums" x-html="highlightTerm(item.term)"></span>
                        <span x-show="item.isSeed" class="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 font-mono tabular-nums border border-cyan-500/30 flex items-center gap-1 font-semibold" title="Primary Seed Keyword">
                          <i data-lucide="sprout" class="w-3 h-3 shrink-0"></i>
                          <span>Seed</span>
                        </span>
                        <span x-show="item.isTop" class="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-mono tabular-nums border border-emerald-500/20">Top Hit</span>
                        <span x-show="item.hasPrediction" class="inline-flex items-center text-purple-500" title="Official Pinterest Trends Prediction Active"><i data-lucide="sparkles" class="w-3.5 h-3.5 shrink-0"></i></span>
                      </div>
                    </div>
                    <!-- 52-Week Official Sparkline Curve -->
                    <div x-show="item.counts && item.counts.length >= 5" class="ml-auto pr-2 flex items-center" title="52-Week Pinterest Trends momentum curve">
                      <svg class="w-12 h-5 text-emerald-600 dark:text-emerald-400 overflow-visible" viewBox="0 0 48 18">
                        <polyline
                          fill="none"
                          stroke="currentColor"
                          stroke-width="1.75"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          :points="sparklinePoints(item.counts)"
                        />
                      </svg>
                    </div>
                  </div>
                </td>

                <!-- Search Volume & Relative Bar (Clean Volume without arbitrary badges) -->
                <td class="p-3.5 font-mono tabular-nums">
                  <div class="flex flex-col gap-1 min-w-[110px]">
                    <div class="flex items-center gap-1.5">
                      <span 
                        x-show="item.searchVolume" 
                        class="font-bold text-slate-900 dark:text-slate-100 text-xs" 
                        x-text="item.searchVolume ? item.searchVolume.toLocaleString() : ''"
                      ></span>
                      <span 
                        x-show="!item.searchVolume" 
                        class="text-slate-500 font-mono tabular-nums text-xs"
                      >—</span>
                    </div>
                    <!-- Official Trends Relative Volume Bar -->
                    <div x-show="item.searchVolume" class="w-20 h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div class="h-full bg-slate-700 dark:bg-slate-300 rounded-full transition-all duration-300" :style="'width: ' + (item.volumeBarPct || 10) + '%'"></div>
                    </div>
                    <span x-show="item.annotationId" class="text-[9px] text-slate-500 font-mono tabular-nums" x-text="'ID: ' + item.annotationId"></span>
                  </div>
                </td>

                <!-- Weekly Change -->
                <td class="p-3.5 font-mono tabular-nums text-[11px] text-right">
                  <span 
                    x-show="item.weeklyChange !== null && item.weeklyChange > 0" 
                    class="text-emerald-600 dark:text-emerald-400 font-semibold"
                    x-text="'+' + item.weeklyChange + '%'"
                  ></span>
                  <span 
                    x-show="item.weeklyChange !== null && item.weeklyChange < 0" 
                    class="text-rose-600 dark:text-rose-400 font-semibold"
                    x-text="item.weeklyChange + '%'"
                  ></span>
                  <span 
                    x-show="item.weeklyChange !== null && item.weeklyChange === 0" 
                    class="text-slate-600 dark:text-slate-300"
                  >0%</span>
                  <span 
                    x-show="item.weeklyChange === null" 
                    class="text-slate-500 text-[10px]"
                  >—</span>
                </td>

                <!-- Monthly Change -->
                <td class="p-3.5 font-mono tabular-nums text-[11px] text-right">
                  <span 
                    x-show="item.monthlyChange !== null && item.monthlyChange > 0" 
                    class="text-emerald-600 dark:text-emerald-400 font-semibold"
                    x-text="'+' + item.monthlyChange + '%'"
                  ></span>
                  <span 
                    x-show="item.monthlyChange !== null && item.monthlyChange < 0" 
                    class="text-rose-600 dark:text-rose-400 font-semibold"
                    x-text="item.monthlyChange + '%'"
                  ></span>
                  <span 
                    x-show="item.monthlyChange !== null && item.monthlyChange === 0" 
                    class="text-slate-600 dark:text-slate-300"
                  >0%</span>
                  <span 
                    x-show="item.monthlyChange === null" 
                    class="text-slate-500 text-[10px]"
                  >—</span>
                </td>

                <!-- Yearly Change -->
                <td class="p-3.5 font-mono tabular-nums text-[11px] text-right">
                  <span 
                    x-show="item.yearlyChange !== null && item.yearlyChange > 0" 
                    class="text-emerald-600 dark:text-emerald-400 font-semibold"
                    x-text="'+' + item.yearlyChange + '%'"
                  ></span>
                  <span 
                    x-show="item.yearlyChange !== null && item.yearlyChange < 0" 
                    class="text-rose-600 dark:text-rose-400 font-semibold"
                    x-text="item.yearlyChange + '%'"
                  ></span>
                  <span 
                    x-show="item.yearlyChange !== null && item.yearlyChange === 0" 
                    class="text-slate-600 dark:text-slate-300"
                  >0%</span>
                  <span 
                    x-show="item.yearlyChange === null" 
                    class="text-slate-500 text-[10px]"
                  >—</span>
                </td>

                <!-- Pinterest Taxonomy (Complete & Beautifully Formatted without Truncation or Intent) -->
                <td class="p-3.5">
                  <div class="flex flex-col gap-1 items-start min-w-[200px] max-w-md">
                    <!-- Formatted Breadcrumbs with Individual Segments -->
                    <div x-show="item.categoryTree && item.categoryTree.length > 0" class="flex items-center gap-1 flex-wrap text-[11px] font-sans leading-normal">
                      <i data-lucide="leaf" class="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0 mr-0.5"></i>
                      <template x-for="(crumb, cIdx) in item.categoryTree" :key="cIdx">
                        <span class="inline-flex items-center gap-1">
                          <span 
                            :class="cIdx === item.categoryTree.length - 1 ? 'text-emerald-700 dark:text-emerald-300 font-medium bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800/40' : 'text-slate-600 dark:text-slate-300'"
                            x-text="crumb"
                          ></span>
                          <span x-show="cIdx < item.categoryTree.length - 1" class="text-slate-400 dark:text-slate-600 text-[10px] select-none">›</span>
                        </span>
                      </template>
                    </div>

                    <!-- Direct Category Path Fallback -->
                    <div x-show="(!item.categoryTree || item.categoryTree.length === 0) && item.categoryPath" class="flex items-center gap-1.5 text-slate-800 dark:text-slate-200 font-medium text-[11px]">
                      <i data-lucide="leaf" class="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0"></i>
                      <span class="font-sans break-words" x-text="item.categoryPath"></span>
                    </div>

                    <!-- Unindexed Category State -->
                    <div x-show="!item.categoryPath && (!item.categoryTree || item.categoryTree.length === 0)" class="flex items-center gap-1 text-slate-500 italic text-[11px] font-sans">
                      <span>—</span>
                      <span>Unindexed Category</span>
                    </div>
                  </div>
                </td>

                <!-- Actions -->
                <td class="p-3.5 text-right">
                  <div class="flex items-center justify-end gap-1.5 flex-wrap">
                    <button 
                      @click="openRelatedExplorer(item.term)" 
                      class="px-2 py-1 rounded bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 hover:text-rose-900 dark:hover:text-white font-mono tabular-nums text-[11px] border border-rose-200 dark:border-rose-700/40 transition-colors flex items-center gap-1"
                      title="Explore official Pinterest related interests & additions"
                    >
                      <i data-lucide="link" class="w-3 h-3 shrink-0"></i><span>Related</span>
                    </button>
                    <button 
                      @click="trackSingleKeyword(item.term)" 
                      class="px-2 py-1 rounded bg-emerald-50 hover:bg-emerald-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-emerald-700 dark:text-emerald-400 hover:text-emerald-900 dark:hover:text-emerald-300 font-mono tabular-nums text-[11px] border border-emerald-200 dark:border-slate-700 transition-colors inline-flex items-center gap-1"
                      title="Track directly in Radar"
                    >
                      <i data-lucide="zap" class="w-3 h-3 shrink-0"></i><span>Track</span>
                    </button>
                    <button
                      @click="openAddToFolderModalForSingle(item.term)"
                      class="px-2 py-1 rounded bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 hover:text-indigo-900 dark:hover:text-white font-mono tabular-nums text-[11px] border border-indigo-200 dark:border-indigo-700/40 transition-colors inline-flex items-center gap-1"
                      title="Add to Campaign Folder"
                    >
                      <i data-lucide="folder" class="w-3 h-3 shrink-0"></i><span>Folder</span>
                    </button>
                    <a 
                      :href="safeUrl('/keywords/' + encodeURIComponent(item.term))" 
                      target="_blank"
                      rel="noopener noreferrer"
                      class="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white font-mono tabular-nums text-[11px] border border-slate-200 dark:border-slate-700 transition-colors flex items-center gap-1"
                    >
                      <span>Pins</span>
                      <span>→</span>
                    </a>
                  </div>
                </td>
              </tr>
            </template>

            <!-- Zero Results State -->
            <tr x-show="!loading && searchQuery.trim().length >= 2 && results.length === 0" x-cloak>
              <td colspan="8" class="p-12 text-center">
                <div class="max-w-md mx-auto flex flex-col items-center gap-3">
                  <div class="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-400"><i data-lucide="search" class="w-5 h-5"></i></div>
                  <div class="text-sm font-semibold text-slate-900 dark:text-white">No autocomplete matches found for "<span x-text="searchQuery" class="text-emerald-600 dark:text-emerald-400 font-mono tabular-nums"></span>"</div>
                  <p class="text-xs text-slate-500 dark:text-slate-400">Pinterest v3_typeahead did not return suggestions for this exact term. You can still track this keyword directly in your SERP Radar.</p>
                  <button @click="trackSingleKeyword(searchQuery)" class="mt-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md transition-all flex items-center gap-2 cursor-pointer active:scale-95">
                    <i data-lucide="zap" class="w-3.5 h-3.5 shrink-0"></i><span>Track "<span x-text="searchQuery"></span>" Directly in Radar</span>
                  </button>
                </div>
              </td>
            </tr>

            <!-- Idle / Empty State Prompt -->
            <tr x-show="!loading && searchQuery.trim().length < 2 && results.length === 0">
              <td colspan="8" class="p-12 text-center text-slate-400 font-sans">
                <div class="max-w-md mx-auto flex flex-col items-center gap-2">
                  <div class="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60 flex items-center justify-center"><i data-lucide="lightbulb" class="w-5 h-5"></i></div>
                  <div class="text-sm font-medium text-slate-800 dark:text-slate-200">Start Typing to Discover Pinterest Autocomplete Terms</div>
                  <div class="text-xs text-slate-500 dark:text-slate-400">Enter a seed topic above or pick one of the popular categories to inspect live Pinterest search queries.</div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </main>

  <!-- Floating Bulk Actions Bar (Slides up when items selected) -->
  <div 
    x-show="selectedKeywords.length > 0" 
    x-transition:enter="transition ease-out duration-200"
    x-transition:enter-start="opacity-0 translate-y-8"
    x-transition:enter-end="opacity-100 translate-y-0"
    x-transition:leave="transition ease-in duration-150"
    x-transition:leave-start="opacity-100 translate-y-0"
    x-transition:leave-end="opacity-0 translate-y-8"
    class="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900/95 backdrop-blur-md border border-slate-700/80 shadow-2xl rounded-2xl px-5 py-3 flex items-center gap-3 text-xs"
    x-cloak
  >
    <div class="flex items-center gap-2 pr-3 border-r border-slate-700">
      <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
      <span class="font-mono tabular-nums font-bold text-white" x-text="selectedKeywords.length"></span>
      <span class="text-slate-300">selected</span>
    </div>
    <button @click="openAddToFolderModal = true" class="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center gap-1.5 shadow-sm transition-colors">
      <i data-lucide="folder" class="w-3.5 h-3.5 shrink-0"></i><span>+ Add to Campaign Folder</span>
    </button>
    <button @click="trackSelectedDirectly()" :disabled="submittingBulk" class="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold flex items-center gap-1.5 shadow-sm transition-colors">
      <span x-show="!submittingBulk" class="inline-flex items-center gap-1.5"><i data-lucide="zap" class="w-3.5 h-3.5 shrink-0"></i><span>Track in Radar</span></span>
      <span x-show="submittingBulk">Scheduling...</span>
    </button>
    <button @click="selectedKeywords = []" class="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition-colors">
      Deselect All
    </button>
  </div>

  <!-- Bulk Importer Modal -->
  <div x-show="openBulkModal" @keydown.escape.window="openBulkModal = false" class="fixed inset-0 z-50 bg-slate-900/40 dark:bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4" x-cloak>
    <div @click.away="openBulkModal = false" class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl max-w-lg w-full p-6 shadow-2xl flex flex-col gap-4 text-slate-900 dark:text-white" role="dialog" aria-modal="true" aria-label="Import Keywords in Bulk">
      <div class="flex items-center justify-between border-b border-slate-100 dark:border-[#27272A] pb-3">
        <h3 class="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <i data-lucide="download" class="w-4 h-4 text-emerald-500 shrink-0"></i><span>Import Keywords in Bulk</span>
        </h3>
        <button @click="openBulkModal = false" class="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 rounded-lg">✕</button>
      </div>

      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between">
          <label class="text-xs text-slate-500 dark:text-slate-400">Paste keywords (one keyword per line):</label>
          <span 
            class="text-[10px] font-mono tabular-nums"
            :class="cleanBulkKeywordsCount > 1000 ? 'text-rose-600 dark:text-red-400 font-bold' : 'text-slate-400'"
            x-text="cleanBulkKeywordsCount + ' / 1,000 unique keywords'"
          ></span>
        </div>
        <textarea 
          x-model="bulkKeywordsText" 
          rows="7" 
          placeholder="crispy chicken cutlets&#10;quick dinner recipes&#10;air fryer salmon&#10;easy pasta salad" 
          class="w-full p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono tabular-nums text-xs focus:outline-none focus:border-emerald-500"
        ></textarea>
        <p class="text-[10px] text-slate-400">Leading/trailing spaces, empty lines, and duplicates are automatically cleaned on client.</p>
      </div>

      <div class="flex flex-col gap-2">
        <label class="text-xs text-slate-500 dark:text-slate-400">Assign to Campaign Folder (Optional):</label>
        <select x-model="bulkTargetFolderId" class="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-sans text-xs focus:outline-none focus:border-emerald-500">
          <option value="">Do not assign to folder (Track Globally)</option>
          <template x-for="f in availableFolders" :key="f.id">
            <option :value="f.id" x-text="f.name + ' (' + (f.keyword_count || 0) + ' keywords)'"></option>
          </template>
        </select>
      </div>

      <div class="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-[#27272A]">
        <button @click="openBulkModal = false" class="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium cursor-pointer">Cancel</button>
        <button 
          @click="submitBulkImport()" 
          :disabled="cleanBulkKeywordsCount === 0 || cleanBulkKeywordsCount > 1000 || submittingBulk" 
          class="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold transition-colors cursor-pointer active:scale-95 shadow-sm"
        >
          <span x-show="!submittingBulk">Import & Schedule</span>
          <span x-show="submittingBulk">Importing...</span>
        </button>
      </div>
    </div>
  </div>

  <!-- Add Selected to Folder Modal -->
  <div x-show="openAddToFolderModal" @keydown.escape.window="openAddToFolderModal = false; keywordsToAddToFolder = []" class="fixed inset-0 z-[60] bg-slate-900/40 dark:bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4" x-cloak>
    <div @click.away="openAddToFolderModal = false; keywordsToAddToFolder = []" class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl max-w-md w-full p-6 shadow-2xl flex flex-col gap-4 text-slate-900 dark:text-white" role="dialog" aria-modal="true" aria-label="Add Keywords to Folder">
      <div class="flex items-center justify-between border-b border-slate-100 dark:border-[#27272A] pb-3">
        <h3 class="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <i data-lucide="folder" class="w-4 h-4 text-emerald-500 shrink-0"></i><span>Add <span x-text="keywordsToAddToFolder.length || selectedKeywords.length"></span> Keywords to Folder</span>
        </h3>
        <button @click="openAddToFolderModal = false; keywordsToAddToFolder = []" class="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 rounded-lg">✕</button>
      </div>

      <div class="flex flex-col gap-3">
        <div>
          <label class="text-xs text-slate-500 dark:text-slate-400 block mb-1">Select existing folder:</label>
          <select x-model="selectedFolderId" class="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-xs">
            <option value="">-- Choose Existing Folder --</option>
            <template x-for="f in availableFolders" :key="f.id">
              <option :value="f.id" x-text="f.name + ' (' + (f.keyword_count || 0) + ' keywords)'"></option>
            </template>
          </select>
        </div>

        <div class="text-center text-[10px] text-slate-400 font-mono tabular-nums">― OR CREATE NEW FOLDER ―</div>

        <div>
          <label class="text-xs text-slate-500 dark:text-slate-400 block mb-1">New folder name:</label>
          <input type="text" x-model="newFolderName" placeholder="e.g. Summer Dinner Campaign 2026" class="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-xs font-mono tabular-nums">
        </div>
      </div>

      <div class="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-[#27272A]">
        <button @click="openAddToFolderModal = false; keywordsToAddToFolder = []" class="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs cursor-pointer">Cancel</button>
        <button 
          @click="submitAddToFolder()" 
          :disabled="(!selectedFolderId && !newFolderName.trim()) || submittingBulk"
          class="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold transition-colors cursor-pointer active:scale-95 shadow-sm"
        >
          <span x-show="!submittingBulk">Confirm & Add</span>
          <span x-show="submittingBulk">Saving...</span>
        </button>
      </div>
    </div>
  </div>

  <!-- Pinterest Related Interests & Additions Modal (Exact Parity with Target Tool) -->
  <div x-show="openRelatedModal" @keydown.escape.window="openRelatedModal = false" class="fixed inset-0 z-50 bg-slate-900/50 dark:bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6" x-cloak>
    <div @click.away="openRelatedModal = false" class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl max-w-5xl w-full max-h-[92vh] shadow-2xl flex flex-col overflow-hidden text-slate-900 dark:text-white" role="dialog" aria-modal="true" aria-label="Pinterest Interest Graph Explorer">
      <!-- Modal Header -->
      <div class="p-4 sm:p-5 border-b border-slate-200 dark:border-[#27272A] flex items-center justify-between flex-wrap gap-3 bg-slate-50/70 dark:bg-slate-950/60">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-600 dark:text-rose-400">
            <i data-lucide="pin" class="w-4 h-4"></i>
          </div>
          <div>
            <h3 class="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span>Pinterest Interest Graph Explorer</span>
              <span class="text-xs px-2 py-0.5 rounded font-mono tabular-nums bg-rose-500/10 text-rose-600 dark:text-rose-300 border border-rose-500/20" x-text="activeRelatedTerm"></span>
            </h3>
            <p class="text-[11px] text-slate-500 dark:text-slate-400">Official Pinterest Annotations, Exact Monthly Search Volume, Taxonomy Breadcrumbs &amp; Sub-Niches</p>
          </div>
        </div>

        <!-- Filter Action Tabs (Exact Parity with Buttons in Screenshot) -->
        <div class="flex items-center gap-2">
          <div class="inline-flex rounded-xl bg-slate-100 dark:bg-slate-950 p-1 border border-slate-200 dark:border-[#27272A] text-xs font-mono tabular-nums">
            <button 
              @click="relatedTab = 'all'" 
              :class="relatedTab === 'all' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-semibold shadow-2xs' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'"
              class="px-2.5 py-1 rounded transition-colors"
            >
              All (<span x-text="relatedData?.all?.length || 0"></span>)
            </button>
            <button 
              @click="relatedTab = 'related'" 
              :class="relatedTab === 'related' ? 'bg-rose-600 text-white dark:bg-rose-900/60 dark:text-rose-200 font-semibold shadow-2xs' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'"
              class="px-2.5 py-1 rounded transition-colors flex items-center gap-1"
            >
              <span>Get Related</span>
              <span>(<span x-text="relatedData?.related_interests?.length || 0"></span>)</span>
            </button>
            <button 
              @click="relatedTab = 'additions'" 
              :class="relatedTab === 'additions' ? 'bg-indigo-600 text-white dark:bg-indigo-900/60 dark:text-indigo-200 font-semibold shadow-2xs' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'"
              class="px-2.5 py-1 rounded transition-colors flex items-center gap-1"
            >
              <span>Get Additions</span>
              <span>(<span x-text="relatedData?.additions?.length || 0"></span>)</span>
            </button>
          </div>
          <button @click="openRelatedModal = false" class="p-1.5 text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" title="Close Modal">
            ✕
          </button>
        </div>
      </div>

      <!-- Main Seed Annotation Hero Banner -->
      <template x-if="relatedData && relatedData.main">
        <div class="p-4 bg-slate-50 dark:bg-slate-950/40 border-b border-slate-200 dark:border-slate-800/80 flex items-center justify-between flex-wrap gap-3">
          <div class="flex items-center gap-4 flex-wrap">
            <div>
              <span class="text-[10px] text-slate-500 font-mono tabular-nums uppercase block">Target Annotation</span>
              <span class="font-bold text-slate-900 dark:text-white text-sm font-mono tabular-nums" x-text="relatedData.main.annotation"></span>
            </div>
            <div>
              <span class="text-[10px] text-slate-500 font-mono tabular-nums uppercase block">Official Search Volume</span>
              <span class="font-bold text-emerald-600 dark:text-emerald-400 text-sm font-mono tabular-nums" x-text="relatedData.main.formatted_volume"></span>
            </div>
            <div>
              <span class="text-[10px] text-slate-500 font-mono tabular-nums uppercase block">Annotation ID</span>
              <span 
                @click="copyAnnotationId(relatedData.main.annotation_id)" 
                class="font-mono tabular-nums text-slate-700 dark:text-slate-300 text-xs cursor-pointer hover:text-slate-900 dark:hover:text-white hover:underline flex items-center gap-1"
                title="Click to copy ID"
              >
                <span x-text="relatedData.main.annotation_id"></span>
                <i data-lucide="clipboard-list" class="w-3 h-3 text-slate-500 shrink-0"></i>
              </span>
            </div>
            <div>
              <span class="text-[10px] text-slate-500 font-mono tabular-nums uppercase block">Category Tree</span>
              <span class="text-xs text-slate-700 dark:text-slate-300 font-sans" x-text="relatedData.main.category_tree"></span>
            </div>
          </div>
          <div>
            <a 
              :href="safeUrl(relatedData.main.link)" 
              target="_blank" 
              rel="noopener noreferrer"
              class="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white text-xs font-mono tabular-nums border border-slate-200 dark:border-slate-700 transition-colors flex items-center gap-1.5"
            >
              <span>View On Pinterest</span>
              <span>↗</span>
            </a>
          </div>
        </div>
      </template>

      <!-- Modal Body (Table or Loading) -->
      <div class="flex-1 overflow-y-auto p-4 min-h-[300px]">
        <!-- Loading State -->
        <div x-show="relatedLoading" class="py-16 flex flex-col items-center justify-center gap-3 text-center" x-cloak>
          <div class="w-10 h-10 border-2 border-rose-500 border-t-transparent rounded-full animate-spin"></div>
          <p class="text-sm font-semibold text-slate-900 dark:text-white">Traversing Pinterest Interest Graph...</p>
          <p class="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">Resolving official internal_search_count, taxonomy breadcrumbs & pivots</p>
        </div>

        <!-- Error State -->
        <div x-show="!relatedLoading && (!relatedData || !relatedData.success)" class="py-16 text-center" x-cloak>
          <div class="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 mx-auto mb-3"><i data-lucide="search" class="w-5 h-5"></i></div>
          <h4 class="text-sm font-bold text-slate-900 dark:text-white mb-1">No Pinterest Annotation Graph Found</h4>
          <p class="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto" x-text="relatedData?.error || 'This keyword does not map to an indexed Pinterest Interest node yet.'"></p>
        </div>

        <!-- Table View (Exact Columns Parity with Screenshot) -->
        <div x-show="!relatedLoading && relatedData && relatedData.success" class="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl" x-cloak>
          <table class="w-full text-left text-xs font-sans">
            <thead class="bg-slate-50 dark:bg-slate-950/80 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-mono tabular-nums uppercase text-[10px]">
              <tr>
                <th class="p-3 w-10 text-center">
                  <input 
                    type="checkbox" 
                    :checked="filteredRelatedList.length > 0 && selectedRelatedAnnotations.length === filteredRelatedList.length" 
                    @change="toggleSelectAllRelated()" 
                    class="rounded bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-emerald-500 focus:ring-0 cursor-pointer"
                  >
                </th>
                <th class="p-3 font-semibold">Annotation</th>
                <th class="p-3 font-semibold">Search Volume</th>
                <th class="p-3 font-semibold">Last Updated</th>
                <th class="p-3 font-semibold">Annotation Id</th>
                <th class="p-3 font-semibold">Category Tree</th>
                <th class="p-3 font-semibold">Link</th>
                <th class="p-3 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-200 dark:divide-slate-800/60 text-slate-700 dark:text-slate-300">
              <template x-for="item in filteredRelatedList" :key="item.annotation + '_' + (item.annotation_id || '')">
                <tr 
                  class="transition-colors group hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  :class="selectedRelatedAnnotations.includes(item.annotation) ? 'bg-rose-50 dark:bg-rose-950/20' : ''"
                >
                  <td class="p-3 text-center">
                    <input 
                      type="checkbox" 
                      :value="item.annotation" 
                      x-model="selectedRelatedAnnotations" 
                      class="rounded bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-emerald-500 focus:ring-0 cursor-pointer"
                    >
                  </td>
                  <td class="p-3">
                    <div class="flex items-center gap-2">
                      <span class="font-semibold text-slate-900 dark:text-white font-mono tabular-nums" x-text="item.annotation"></span>
                      <span 
                        class="text-[9px] px-1.5 py-0.5 rounded font-mono tabular-nums border"
                        :class="item.type === 'main' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30' : (item.type === 'related' ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30' : 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/30')"
                        x-text="item.type === 'main' ? 'Seed' : (item.type === 'related' ? 'Related' : 'Addition')"
                      ></span>
                    </div>
                  </td>
                  <td class="p-3 font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100">
                    <span 
                      :class="(item.search_volume || 0) >= 500000 ? 'text-purple-600 dark:text-purple-400' : ((item.search_volume || 0) >= 50000 ? 'text-emerald-600 dark:text-emerald-400' : ((item.search_volume || 0) >= 10000 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'))"
                      x-text="item.formatted_volume || '0'"
                    ></span>
                  </td>
                  <td class="p-3 font-mono tabular-nums text-[11px] text-slate-500 dark:text-slate-400" x-text="item.last_updated || 'Recent'"></td>
                  <td class="p-3 font-mono tabular-nums text-[11px]">
                    <span 
                      @click="copyAnnotationId(item.annotation_id)" 
                      class="cursor-pointer text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:underline flex items-center gap-1"
                      title="Click to copy ID"
                    >
                      <span x-text="item.annotation_id || '—'"></span>
                    </span>
                  </td>
                  <td class="p-3 text-[11px] text-slate-700 dark:text-slate-300 max-w-xs truncate" :title="item.category_tree" x-text="item.category_tree || '—'"></td>
                  <td class="p-3 font-mono tabular-nums text-[11px]">
                    <a 
                      :href="safeUrl(item.link)" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      class="text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 underline flex items-center gap-1"
                    >
                      <span>pinterest</span>
                      <span>↗</span>
                    </a>
                  </td>
                  <td class="p-3 text-right">
                    <button 
                      @click="trackRelatedSingle(item.annotation)" 
                      class="px-2 py-1 rounded bg-emerald-50 hover:bg-emerald-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-emerald-700 dark:text-emerald-400 hover:text-emerald-900 dark:hover:text-emerald-300 font-mono tabular-nums text-[11px] border border-emerald-200 dark:border-slate-700 transition-colors inline-flex items-center gap-1"
                      title="Track directly in Radar"
                    >
                      <i data-lucide="zap" class="w-3 h-3 shrink-0"></i><span>Track</span>
                    </button>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Modal Footer (Bulk Actions) -->
      <div class="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between flex-wrap gap-3 bg-slate-50 dark:bg-slate-950/70">
        <div class="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
          <span x-text="selectedRelatedAnnotations.length"></span>
          <span>of</span>
          <span x-text="filteredRelatedList.length"></span>
          <span>annotations selected</span>
        </div>

        <div class="flex items-center gap-2">
          <button 
            @click="openFolderModalForRelated()" 
            :disabled="selectedRelatedAnnotations.length === 0" 
            class="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-mono tabular-nums text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <i data-lucide="folder" class="w-3.5 h-3.5 shrink-0"></i>
            <span>+ Add to Campaign Folder</span>
            <span x-show="selectedRelatedAnnotations.length > 0" x-text="'(' + selectedRelatedAnnotations.length + ')'"></span>
          </button>
          <button 
            @click="trackSelectedRelated()" 
            :disabled="selectedRelatedAnnotations.length === 0" 
            class="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-mono tabular-nums text-xs font-bold transition-colors flex items-center gap-1.5"
          >
            <i data-lucide="zap" class="w-3.5 h-3.5 shrink-0"></i><span>Track Selected in Radar</span>
            <span x-show="selectedRelatedAnnotations.length > 0" x-text="'(' + selectedRelatedAnnotations.length + ')'"></span>
          </button>
          <button @click="openRelatedModal = false" class="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium border border-slate-200 dark:border-transparent">
            Close
          </button>
        </div>
      </div>
    </div>
  </div>`;
}
