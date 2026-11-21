/**
 * Level 2 SERP Radar Studio — Workspace Nav/Filter Bars & Tab 1: SERP Matrix (Table, Cards & Pagination)
 */
import { renderPinRowTemplate } from '../pin-row.mjs';

export function renderSerpStudioMatrixTab() {
  return `      <!-- TOP NAVIGATION BAR: Tabs (Left) + View Mode & Growth Pace (Right) -->
      <div class="px-4 sm:px-6 py-3.5 border-b border-slate-200/80 dark:border-[#27272A]/80 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white dark:bg-[#121215]">
        
        <!-- Workspace Tabs -->
        <div class="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <button @click="activeTab = 'serp'"
                  class="px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 cursor-pointer"
                  :class="activeTab === 'serp' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'">
            <i data-lucide="list-ordered" class="w-4 h-4"></i>
            <span>SERP Rankings Matrix</span>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-mono tabular-nums font-bold bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                  x-text="'#' + (filteredPins.length || 0)"></span>
          </button>

          <!-- Pinterest Trends 52-Week & Popular Pins Tab -->
          <button @click="activeTab = 'trends'"
                  class="px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 cursor-pointer"
                  :class="activeTab === 'trends' ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30 shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'">
            <i data-lucide="trending-up" class="w-4 h-4 text-blue-500"></i>
            <span>Pinterest Trends (52w & Popular)</span>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-mono tabular-nums font-bold bg-blue-500/20 text-blue-600"
                  x-text="trendsData?.current_index ? trendsData.current_index + '/100' : '52w'"></span>
          </button>

          <!-- PinClicks Intelligence Tab -->
          <button @click="activeTab = 'intelligence'"
                  class="px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 cursor-pointer"
                  :class="activeTab === 'intelligence' ? 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30 shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'">
            <i data-lucide="sparkles" class="w-4 h-4 text-purple-500"></i>
            <span>PinClicks Intelligence</span>
          </button>
        </div>

        <!-- Right Side: Growth Pace (Compact Pills) + Table/Cards Switcher -->
        <div class="flex items-center gap-2 self-start md:self-auto shrink-0" x-show="activeTab === 'serp'">
          
          <!-- Compact Growth Pace Selector -->
          <div class="flex items-center p-1 rounded-xl bg-slate-100/90 dark:bg-slate-900/90 border border-slate-200 dark:border-[#27272A] gap-0.5">
            <span class="text-[10px] font-mono tabular-nums font-bold text-slate-400 uppercase px-1.5 hidden sm:inline">Pace:</span>
            <button @click="growthPaceFilter = '24h'"
                    class="px-2 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center space-x-1"
                    :class="growthPaceFilter === '24h' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40 shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'"
                    title="Velocity over Last 24 Hours">
              <span>🔥</span>
              <span class="font-mono tabular-nums">24h</span>
            </button>
            <button @click="growthPaceFilter = '3d'"
                    class="px-2 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center space-x-1"
                    :class="growthPaceFilter === '3d' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40 shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'"
                    title="Velocity over Last 3 Days">
              <span>⏱</span>
              <span class="font-mono tabular-nums">3d</span>
            </button>
            <button @click="growthPaceFilter = '7d'"
                    class="px-2 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center space-x-1"
                    :class="growthPaceFilter === '7d' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40 shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'"
                    title="Velocity over Last 7 Days">
              <span>📅</span>
              <span class="font-mono tabular-nums">7d</span>
            </button>
            <button @click="growthPaceFilter = 'all'"
                    class="px-2 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center space-x-1"
                    :class="growthPaceFilter === 'all' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40 shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'"
                    title="All-Time Total Engagement">
              <span>⭐</span>
              <span class="font-mono tabular-nums">All</span>
            </button>
          </div>

          <!-- Cards vs Table Toggle Button -->
          <div class="flex items-center p-1 rounded-xl bg-slate-100/90 dark:bg-slate-900/90 border border-slate-200 dark:border-[#27272A]">
            <button @click="viewMode = 'table'"
                    class="px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center space-x-1 cursor-pointer"
                    :class="viewMode === 'table' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'"
                    title="Table View">
              <i data-lucide="table" class="w-3.5 h-3.5"></i>
              <span class="hidden sm:inline">Table</span>
            </button>
            <button @click="viewMode = 'cards'"
                    class="px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center space-x-1 cursor-pointer"
                    :class="viewMode === 'cards' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'"
                    title="Cards Grid View">
              <i data-lucide="layout-grid" class="w-3.5 h-3.5"></i>
              <span class="hidden sm:inline">Cards</span>
            </button>
          </div>

        </div>
      </div>

      <!-- SECONDARY CONTROL BAR: SERP Filter & Search Controls (Exclusively for SERP Tab) -->
      <div x-show="activeTab === 'serp'" class="px-4 sm:px-6 py-3 border-b border-slate-200/80 dark:border-[#27272A]/80 bg-slate-50/70 dark:bg-slate-900/40 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        
        <!-- Left: Scope Segment Filter: All Pins vs Active SERP vs Displaced Vault vs Breakouts vs High Velocity -->
        <div class="flex flex-wrap items-center gap-1.5">
          <span class="text-[10px] font-bold text-slate-400 font-mono tabular-nums uppercase tracking-wider shrink-0 mr-1 hidden sm:inline">Filter:</span>
          
          <button @click="serpScope = 'all'"
                  class="px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center space-x-1.5 border"
                  :class="serpScope === 'all' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/40 shadow-xs' : 'bg-white dark:bg-slate-900/80 border-slate-200 dark:border-[#27272A] text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700'"
                  :title="'Showing ' + allCombinedPins.length + ' of ' + totalCatalogCount + ' total catalog pins'">
            <span>🔘 All Pins</span>
            <span class="px-1.5 py-0.2 rounded-full text-[10px] font-mono tabular-nums font-bold"
                  :class="serpScope === 'all' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'"
                  x-text="totalCatalogCount > allCombinedPins.length ? (allCombinedPins.length + ' / ' + totalCatalogCount) : totalCatalogCount"></span>
          </button>
          
          <button @click="serpScope = 'active'"
                  class="px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center space-x-1.5 border"
                  :class="serpScope === 'active' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/40 shadow-xs' : 'bg-white dark:bg-slate-900/80 border-slate-200 dark:border-[#27272A] text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700'">
            <span>🟢 Active SERP</span>
            <span class="px-1.5 py-0.2 rounded-full text-[10px] font-mono tabular-nums font-bold"
                  :class="serpScope === 'active' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'"
                  x-text="(selectedKeywordDetails?.current_pins || []).length"></span>
          </button>

          <button @click="serpScope = 'displaced'; if(selectedKeyword && displacedVaultPins.length === 0) fetchDisplacedPins()"
                  class="px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center space-x-1.5 border"
                  :class="serpScope === 'displaced' ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/40 shadow-xs' : 'bg-white dark:bg-slate-900/80 border-slate-200 dark:border-[#27272A] text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700'"
                  :title="'Showing ' + displacedVaultPins.length + ' of ' + totalDisplacedCount + ' displaced vault pins'">
            <span>🔴 Displaced Vault</span>
            <span class="px-1.5 py-0.2 rounded-full text-[10px] font-mono tabular-nums font-bold"
                  :class="serpScope === 'displaced' ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'"
                  x-text="totalDisplacedCount > displacedVaultPins.length ? (displacedVaultPins.length + ' / ' + totalDisplacedCount) : totalDisplacedCount"></span>
          </button>

          <button @click="serpScope = 'breakout'"
                  class="px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center space-x-1.5 border"
                  :class="serpScope === 'breakout' ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/40 shadow-xs' : 'bg-white dark:bg-slate-900/80 border-slate-200 dark:border-[#27272A] text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700'">
            <span>🚀 Breakouts</span>
            <span class="px-1.5 py-0.2 rounded-full text-[10px] font-mono tabular-nums font-bold"
                  :class="serpScope === 'breakout' ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'"
                  x-text="breakoutPins.length"></span>
          </button>

          <button @click="serpScope = 'velocity'"
                  class="px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center space-x-1.5 border"
                  :class="serpScope === 'velocity' ? 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border-cyan-500/40 shadow-xs' : 'bg-white dark:bg-slate-900/80 border-slate-200 dark:border-[#27272A] text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700'">
            <span>⚡ High Velocity</span>
          </button>

          <!-- Active Visual Tag Filter Badge -->
          <template x-if="activeVisualTagFilter">
            <div class="flex items-center space-x-1.5 px-3 py-1 rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30 text-xs">
              <i data-lucide="tag" class="w-3.5 h-3.5"></i>
              <span class="font-bold font-mono tabular-nums" x-text="'Tag: #' + activeVisualTagFilter"></span>
              <button @click="activeVisualTagFilter = ''" class="hover:text-purple-800 dark:hover:text-white transition ml-1 cursor-pointer" title="Clear visual tag filter">
                <i data-lucide="x" class="w-3 h-3"></i>
              </button>
            </div>
          </template>

          <!-- Active Domain Filter Badge -->
          <template x-if="activeDomainFilter">
            <div class="flex items-center space-x-1.5 px-3 py-1 rounded-xl bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30 text-xs">
              <i data-lucide="globe" class="w-3.5 h-3.5"></i>
              <span class="font-bold font-mono tabular-nums" x-text="'Domain: ' + activeDomainFilter"></span>
              <button @click="activeDomainFilter = ''" class="hover:text-cyan-800 dark:hover:text-white transition ml-1 cursor-pointer" title="Clear domain filter">
                <i data-lucide="x" class="w-3 h-3"></i>
              </button>
            </div>
          </template>
        </div>

        <!-- Right: Search, Formats, Sorting, Page Size -->
        <div class="flex flex-wrap items-center gap-2">
          
          <!-- Search in Pins -->
          <div class="relative">
            <i data-lucide="search" class="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"></i>
            <input type="text" x-model="pinSearch" placeholder="Filter title, author, domain..."
                   class="w-44 sm:w-52 pl-8 pr-7 py-1.5 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/40">
            <button x-show="pinSearch" @click="pinSearch = ''" class="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 cursor-pointer">
              <i data-lucide="x" class="w-3 h-3"></i>
            </button>
          </div>

          <!-- Format Filter -->
          <select x-model="formatFilter" class="px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer">
            <option value="ALL">All Formats</option>
            <option value="ORGANIC PIN">Organic Pin</option>
            <option value="VIDEO PIN">Video Pin</option>
            <option value="IDEA PIN">Idea Pin</option>
            <option value="PRODUCT CARD">Product Card</option>
          </select>

          <!-- Pin Sort -->
          <select x-model="pinSort" class="px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer">
            <option value="rank" x-text="'Sort: SERP Rank #1-' + (selectedKeyword?.target_pin_count || appSettings.max_serp_pins || appSettings.default_max_pins || 50)">Sort: SERP Rank (Ascending)</option>
            <option value="velocity">Sort: 24h Velocity (Highest)</option>
            <option value="saves">Sort: Saves / Likes (Highest)</option>
            <option value="age">Sort: Newest First</option>
          </select>

          <!-- Per Page Select -->
          <select x-model="pinPageSize" class="px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-xs font-mono tabular-nums font-bold text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer">
            <option :value="25">25 / page</option>
            <option :value="50">50 / page</option>
            <option :value="100">100 / page</option>
            <option value="all">All Pins</option>
          </select>

        </div>

      </div>

      <!-- TAB 1: EXECUTIVE FULL-WIDTH SERP MATRIX -->
      <div x-show="activeTab === 'serp'" class="space-y-0">
        
        <template x-if="isDetailsLoading">
          <div class="py-20 text-center space-y-3">
            <div class="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-500 mx-auto flex items-center justify-center">
              <i data-lucide="loader-2" class="w-6 h-6 animate-spin"></i>
            </div>
            <p class="text-sm font-bold text-slate-700 dark:text-slate-300">Loading Full SERP Report...</p>
            <p class="text-xs text-slate-400 font-mono tabular-nums">Comparing rank positions & calculating 24h save velocity baselines</p>
          </div>
        </template>

        <template x-if="!isDetailsLoading && (!filteredPins || filteredPins.length === 0)">
          <div class="py-20 text-center space-y-4 max-w-md mx-auto p-4">
            <div class="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 mx-auto flex items-center justify-center">
              <i data-lucide="sparkles" class="w-6 h-6"></i>
            </div>
            <h3 class="text-base font-bold text-slate-900 dark:text-white capitalize" x-text="'No Snapshots for &quot;' + (selectedKeyword?.keyword || activeKeywordQuery) + '&quot;'"></h3>
            <p class="text-xs text-slate-500">This keyword has not been crawled yet. Trigger an on-demand crawl to index organic SERP pins directly from Pinterest.</p>
            <button @click="rescanActiveKeyword(true)"
                    class="px-5 py-2.5 rounded-2xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition shadow-md shadow-emerald-950/20 active:scale-95 flex items-center justify-center space-x-2 mx-auto cursor-pointer">
              <i data-lucide="refresh-cw" class="w-4 h-4"></i>
              <span x-text="'Crawl ' + (selectedKeyword?.target_pin_count || appSettings.max_serp_pins || appSettings.default_max_pins || 50) + ' Pins Now'">Crawl Pins Now</span>
            </button>
          </div>
        </template>

        <!-- VIEW MODE 1: TABLE VIEW (Matching Image 1 Exact Layout) -->
        <template x-if="!isDetailsLoading && filteredPins && filteredPins.length > 0 && viewMode === 'table'">
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="table-sticky-header bg-slate-100/90 dark:bg-[#121215]/90 border-b border-slate-200 dark:border-[#27272A] text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  <th class="py-3.5 px-3 w-10 text-center">
                    <input type="checkbox" @click="toggleSelectAllPins()"
                           :checked="paginatedPins.length > 0 && paginatedPins.every(p => isPinSelected(p.pin_id))"
                           class="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 dark:border-[#27272A]">
                  </th>
                  <th class="py-3.5 px-3 w-14">Preview</th>
                  <th class="py-3.5 px-4 min-w-[260px]">Pin Title & ID</th>
                  <th class="py-3.5 px-3 w-28"># Rank & Delta</th>
                  <th class="py-3.5 px-3 w-36">Board</th>
                  <th class="py-3.5 px-3 w-32">Saves & Δ</th>
                  <th class="py-3.5 px-3 w-28">Repins & Δ</th>
                  <th class="py-3.5 px-2 w-20">Comments</th>
                  <th class="py-3.5 px-2 w-20">Shares</th>
                  <th class="py-3.5 px-3 w-28">Velocity</th>
                  <th class="py-3.5 px-3 w-36">Domain Authority</th>
                  <th class="py-3.5 px-3 w-28 text-right">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
                <template x-for="(pin, idx) in paginatedPins" :key="pin.pin_id">
                  ${renderPinRowTemplate({
                    pinVar: 'pin',
                    indexVar: 'idx',
                    showCheckbox: true,
                    showRank: true,
                    rankPosition: 'afterTitle',
                    showThumb: true,
                    showTitle: true,
                    showBoard: true,
                    boardPosition: 'afterTitle',
                    showDomain: false,
                    showVelocity: true,
                    velocityPosition: 'afterRepins',
                    showSaves: true,
                    showRepins: true,
                    showAge: false,
                    showActions: true,
                    onRowClick: 'openPinInspector(pin)',
                    rowClass: 'hover:bg-slate-50/80 dark:hover:bg-slate-900/40 transition group cursor-pointer',
                    checkboxHtml: `
                    <!-- Checkbox -->
                    <td class="py-3.5 px-3 text-center" @click.stop>
                      <input type="checkbox" :checked="isPinSelected(pin.pin_id)" @click="togglePinSelection(pin.pin_id)"
                             class="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 dark:border-[#27272A]">
                    </td>`,
                    thumbHtml: `
                    <!-- Preview Thumbnail -->
                    <td class="py-3.5 px-3">
                      <a :href="getPinDossierUrl(pin)" @click.stop class="relative group/img shrink-0 block" title="Open Dedicated Pin Intelligence (/pin/:pin_id)">
                        <template x-if="pin.image_url">
                          <img :src="pin.image_url" class="w-10 h-14 rounded-lg object-cover border border-slate-200 dark:border-[#27272A] shadow-xs group-hover/img:scale-105 transition" onerror="window.handlePinImgError(this)">
                        </template>
                        <template x-if="!pin.image_url">
                          <div class="w-10 h-14 rounded-lg bg-slate-200 dark:bg-slate-800 flex items-center justify-center">
                            <i data-lucide="image" class="w-3.5 h-3.5 text-slate-400"></i>
                          </div>
                        </template>
                      </a>
                    </td>`,
                    titleHtml: `
                    <!-- Pin Title, ID & Creator -->
                    <td class="py-3.5 px-4 min-w-[260px]">
                      <div class="space-y-1">
                        <a :href="getPinDossierUrl(pin)" @click.stop
                           class="font-bold text-slate-900 dark:text-white hover:text-emerald-500 line-clamp-2 block transition"
                           title="Open Dedicated Pin Intelligence (/pin/:pin_id)"
                           x-text="pin.title || 'Untitled Pin'"></a>
                        <div class="flex items-center flex-wrap gap-1.5 text-[10px] text-slate-400 font-mono tabular-nums">
                          <a :href="getPinDossierUrl(pin)" @click.stop
                             class="text-slate-500 dark:text-slate-400 hover:text-emerald-500 truncate font-mono tabular-nums"
                             title="Open Dedicated Pin Intelligence"
                             x-text="'ID: ' + pin.pin_id"></a>
                          <template x-if="pin.metadata?.pinner || pin.creator_username">
                            <span class="flex items-center space-x-1 truncate max-w-[130px]">
                              <template x-if="pin.metadata?.pinner?.image_small_url">
                                <img :src="pin.metadata.pinner.image_small_url" class="w-3 h-3 rounded-full object-cover shrink-0">
                              </template>
                              <span class="truncate" x-text="pin.metadata?.pinner?.full_name || ('@' + (pin.metadata?.pinner?.username || pin.creator_username))"></span>
                            </span>
                          </template>
                          <!-- Method Badge -->
                          <span class="px-1.5 py-0.2 rounded text-[9px] font-mono tabular-nums font-bold border shrink-0"
                                :class="getPinMethodBadgeClass(pin)"
                                :title="'Method: ' + formatPinMethodLabel(pin)"
                                x-text="getPinMethod(pin)"></span>
                          <!-- Created Timestamp / Age Badge -->
                          <template x-if="getPinCreatedDate(pin)">
                            <span class="text-slate-500 dark:text-slate-400 font-mono tabular-nums text-[9px] truncate shrink-0"
                                  :title="'Created: ' + formatPinCreated(pin)"
                                  x-text="'📅 ' + (formatPinAge(pin) || formatPinCreated(pin))"></span>
                          </template>
                        </div>
                        <!-- Visual Annotations Tag Pills (Intra-SERP Crossover Engine) -->
                        <template x-if="pin._hasVisualTags || getPinVisualTags(pin).length > 0">
                          <div class="flex flex-wrap items-center gap-1 mt-1">
                            <template x-for="vtag in (pin._cachedVisualTagsSlice || getPinVisualTags(pin).slice(0, 4))" :key="vtag">
                              <button @click.stop="filterByVisualTag(vtag)"
                                      class="px-1.5 py-0.5 rounded-md text-[9px] font-mono tabular-nums transition cursor-pointer flex items-center gap-1"
                                      :class="activeVisualTagFilter === vtag.toLowerCase() 
                                        ? 'bg-purple-600 text-white font-bold shadow-sm' 
                                        : (isCoreAnchorTag(vtag) 
                                          ? 'bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 border border-purple-500/40 font-semibold' 
                                          : 'bg-purple-500/10 text-purple-600 dark:text-purple-400 hover:bg-purple-500/20 border border-purple-500/20')"
                                      :title="isCoreAnchorTag(vtag) 
                                        ? 'Core Visual Anchor: #' + vtag + ' is shared across ' + getTagFrequency(vtag) + ' pins in this keyword. Click to filter crossover.' 
                                        : 'Filter by visual tag: #' + vtag">
                                <template x-if="isCoreAnchorTag(vtag)">
                                  <span class="text-[8px] text-purple-400">🔗</span>
                                </template>
                                <span x-text="'#' + vtag"></span>
                                <template x-if="getTagFrequency(vtag) > 1">
                                  <span class="text-[8px] px-1 py-0.2 rounded font-bold"
                                        :class="isCoreAnchorTag(vtag) ? 'bg-purple-500/30 text-purple-200' : 'bg-slate-700/60 text-slate-300'"
                                        x-text="getTagFrequency(vtag) + 'x'"></span>
                                </template>
                              </button>
                            </template>
                            <template x-if="(pin._extraTagsCount !== undefined ? pin._extraTagsCount : Math.max(0, getPinVisualTags(pin).length - 4)) > 0">
                              <span class="text-[9px] text-slate-400 font-mono tabular-nums" x-text="'+' + (pin._extraTagsCount !== undefined ? pin._extraTagsCount : (getPinVisualTags(pin).length - 4)) + ' tags'"></span>
                            </template>
                          </div>
                        </template>
                      </div>
                    </td>`,
                    rankHtml: `
                    <!-- # Rank & Delta Movement -->
                    <td class="py-3.5 px-3 font-mono tabular-nums font-bold">
                      <template x-if="!pin.is_displaced">
                        <div class="flex items-center space-x-1.5">
                          <span class="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                                :class="Number(pin.rank_position) <= 10 ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30' : ''"
                                x-text="'#' + pin.rank_position"></span>
                          
                          <template x-if="pin.metadata?.is_new">
                            <span class="px-1.5 py-0.2 rounded text-[9px] bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 cursor-help"
                                  title="Newly discovered in this crawl">★ NEW</span>
                          </template>
                          <template x-if="!pin.metadata?.is_new && Number(pin.metadata?.rank_delta || 0) > 0">
                            <span class="text-[10px] text-emerald-500 font-bold cursor-help"
                                  :title="'Climbed from #' + (pin.metadata?.prev_rank ?? '?') + ' (' + (pin.metadata?.baseline_date ? 'vs crawl on ' + pin.metadata.baseline_date : 'vs prior crawl') + ')'"
                                  x-text="'▲ +' + pin.metadata.rank_delta"></span>
                          </template>
                          <template x-if="!pin.metadata?.is_new && Number(pin.metadata?.rank_delta || 0) < 0">
                            <span class="text-[10px] text-rose-500 font-bold cursor-help"
                                  :title="'Dropped from #' + (pin.metadata?.prev_rank ?? '?') + ' (' + (pin.metadata?.baseline_date ? 'vs crawl on ' + pin.metadata.baseline_date : 'vs prior crawl') + ')'"
                                  x-text="'▼ ' + pin.metadata.rank_delta"></span>
                          </template>
                          <template x-if="!pin.metadata?.is_new && Number(pin.metadata?.rank_delta || 0) === 0">
                            <span class="text-[10px] text-slate-400 font-bold cursor-help"
                                  :title="'Maintained rank (' + (pin.metadata?.baseline_date ? 'vs crawl on ' + pin.metadata.baseline_date : 'vs prior crawl') + ')'">=</span>
                          </template>
                        </div>
                      </template>
                      <template x-if="pin.is_displaced">
                        <div class="flex flex-col space-y-1">
                          <div class="flex items-center space-x-1.5 flex-wrap gap-y-0.5">
                            <span class="px-2 py-0.5 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-xs font-mono tabular-nums font-bold"
                                  :title="'Catalog Rank #' + (pin.catalog_rank || ((selectedKeyword?.target_pin_count || appSettings.max_serp_pins || appSettings.default_max_pins || 50) + (getPinGlobalIndex(idx) + 1)))"
                                  x-text="'#' + (pin.catalog_rank || ((selectedKeyword?.target_pin_count || appSettings.max_serp_pins || appSettings.default_max_pins || 50) + (getPinGlobalIndex(idx) + 1)))"></span>
                            <span class="px-1.5 py-0.5 rounded-md bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 text-[10px] font-black uppercase tracking-wider shrink-0"
                                  x-text="'Was #' + (pin.last_known_rank || pin.rank_position || '?')"></span>
                          </div>
                          <template x-if="pin.is_deleted || pin.metadata?.is_deleted || pin.metadata?.status === 'archived_404'">
                            <span class="text-[9px] text-rose-400 font-mono tabular-nums font-bold flex items-center gap-1">
                              <span>🗑️ Removed (404)</span>
                            </span>
                          </template>
                          <template x-if="!(pin.is_deleted || pin.metadata?.is_deleted || pin.metadata?.status === 'archived_404')">
                            <span class="text-[9px] text-slate-400 font-mono tabular-nums" x-text="'Vault • ' + (pin.status || 'displaced_active')"></span>
                          </template>
                        </div>
                      </template>
                    </td>`,
                    boardHtml: `
                    <!-- Board Name -->
                    <td class="py-3.5 px-3">
                      <span class="text-xs text-slate-600 dark:text-slate-300 font-medium truncate max-w-[130px] block"
                            :title="pin.board_name || pin.metadata?.board_name || 'General Board'"
                            x-text="pin.board_name || pin.metadata?.board_name || 'General Board'"></span>
                    </td>`,
                    savesHtml: `
                    <!-- Saves & Growth Pace Delta (Image 1 Parity) -->
                    <td class="py-3.5 px-3 space-y-0.5 font-mono tabular-nums">
                      <div class="font-bold text-slate-900 dark:text-white"
                           x-text="formatNumber(pin.save_count || pin.metadata?.raw_saves || 0)"></div>
                      <template x-if="getPaceDelta(pin, 'saves') && getPaceDelta(pin, 'saves') !== '0'">
                        <span class="text-[10px] font-bold text-emerald-500 block"
                              x-text="getPaceDelta(pin, 'saves')"></span>
                      </template>
                    </td>`,
                    repinsHtml: `
                    <!-- Repins & Growth Pace Delta -->
                    <td class="py-3.5 px-3 space-y-0.5 font-mono tabular-nums">
                      <div class="font-bold text-slate-700 dark:text-slate-300"
                           x-text="formatNumber(pin.repin_count || pin.metadata?.repin_count || 0)"></div>
                      <template x-if="getPaceDelta(pin, 'repins') && getPaceDelta(pin, 'repins') !== '0'">
                        <span class="text-[10px] font-bold text-emerald-500 block"
                              x-text="getPaceDelta(pin, 'repins')"></span>
                      </template>
                    </td>`,
                    extraCellsAfterRepins: `
                    <!-- Comments -->
                    <td class="py-3.5 px-2 font-mono tabular-nums text-slate-600 dark:text-slate-400"
                        x-text="pin.comment_count || 0"></td>

                    <!-- Shares -->
                    <td class="py-3.5 px-2 font-mono tabular-nums text-slate-600 dark:text-slate-400"
                        x-text="pin.share_count || 0"></td>`,
                    velocityHtml: `
                    <!-- 24h Velocity -->
                    <td class="py-3.5 px-3 font-mono tabular-nums">
                      <span class="px-2 py-0.5 rounded-lg text-xs font-black block w-fit"
                            :class="Number(pin.daily_save_velocity || 0) >= 10 ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : (Number(pin.daily_save_velocity || 0) > 0 ? 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500')"
                            x-text="(Number(pin.daily_save_velocity || 0) > 0 ? '+' : '') + Number(pin.daily_save_velocity || 0) + ' /d'"></span>
                    </td>`,
                    extraCellsBeforeActions: `
                    <!-- Domain Authority -->
                    <td class="py-3.5 px-3">
                      <span class="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400 truncate max-w-[130px] block"
                            x-text="pin.domain || 'Pinterest Direct'"></span>
                    </td>`,
                    actionsHtml: `
                    <!-- Actions -->
                    <td class="py-3.5 px-3 text-right">
                      <div class="flex items-center justify-end space-x-1" @click.stop>
                        <a :href="getPinDossierUrl(pin)"
                           class="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 transition cursor-pointer"
                           title="Open Dedicated Pin Intelligence (/pin/:pin_id)">
                          <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                        </a>
                        <button @click="openPinInspector(pin)"
                                class="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition cursor-pointer"
                                title="Open Pin Deep Dossier">
                          <i data-lucide="eye" class="w-3.5 h-3.5"></i>
                        </button>
                        <button @click="openVisualLens(pin)"
                                class="p-1.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 transition cursor-pointer"
                                title="Visual Lens Similarity Search">
                          <i data-lucide="camera" class="w-3.5 h-3.5"></i>
                        </button>
                        <a :href="'https://www.pinterest.com/pin/' + pin.pin_id + '/'" target="_blank" rel="noopener noreferrer"
                           class="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white transition"
                           title="Open Pin on Pinterest">
                          <i data-lucide="arrow-up-right" class="w-3.5 h-3.5"></i>
                        </a>
                      </div>
                    </td>`
                  })}
                </template>
              </tbody>
            </table>
          </div>
        </template>

        <!-- VIEW MODE 2: CARDS VIEW (Matching Image 1 Grid Cards) -->
        <template x-if="!isDetailsLoading && filteredPins && filteredPins.length > 0 && viewMode === 'cards'">
          <div class="p-5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            <template x-for="pin in paginatedPins" :key="pin.pin_id">
              <div :data-pin-id="pin.pin_id"
                   @click="openPinInspector(pin)"
                   class="p-4 rounded-3xl bg-slate-50/70 dark:bg-slate-900/40 border border-slate-200/80 dark:border-[#27272A] hover:border-emerald-500/40 transition group cursor-pointer flex flex-col justify-between space-y-3.5">
                
                <div class="space-y-3">
                  <!-- Thumbnail with Rank & Format overlays -->
                  <a :href="getPinDossierUrl(pin)" @click.stop class="block relative rounded-2xl overflow-hidden aspect-[2/3] max-h-56 bg-slate-200 dark:bg-slate-800" title="Open Dedicated Pin Intelligence (/pin/:pin_id)">
                    <template x-if="pin.image_url">
                      <img :src="pin.image_url" class="w-full h-full object-cover group-hover:scale-105 transition duration-300" onerror="window.handlePinImgError(this)">
                    </template>
                    <template x-if="!pin.is_displaced">
                      <div class="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-lg bg-slate-950/80 text-white font-mono tabular-nums font-black text-xs backdrop-blur-xs"
                           x-text="'#' + pin.rank_position"></div>
                    </template>
                    <template x-if="pin.is_displaced">
                      <div class="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-lg bg-amber-950/90 text-amber-300 font-mono tabular-nums font-black text-[10px] backdrop-blur-xs border border-amber-500/40 flex items-center gap-1 shadow-sm">
                        <span x-text="'#' + (pin.catalog_rank || 101)"></span>
                        <span class="text-rose-400 text-[9px] font-semibold" x-text="'(Was #' + (pin.last_known_rank || '?') + ')'"></span>
                      </div>
                    </template>
                    <div class="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md bg-slate-950/70 text-[10px] font-mono tabular-nums text-slate-200 backdrop-blur-xs uppercase"
                         x-text="pin.metadata?.format || pin.format || 'ORGANIC'"></div>
                  </a>

                  <!-- Title & ID -->
                  <div class="space-y-1">
                    <a :href="getPinDossierUrl(pin)" @click.stop
                       class="text-xs font-bold text-slate-900 dark:text-white hover:text-emerald-500 line-clamp-2 leading-snug transition block"
                       title="Open Dedicated Pin Intelligence (/pin/:pin_id)"
                       x-text="pin.title || 'Untitled Pin'"></a>
                    <div class="flex items-center space-x-1.5 text-[10px] font-mono tabular-nums">
                      <a :href="getPinDossierUrl(pin)" @click.stop
                         class="text-slate-400 hover:text-emerald-500 truncate"
                         x-text="pin.board_name || pin.metadata?.board_name || ('ID: ' + pin.pin_id)"></a>
                      <span class="px-1.5 py-0.2 rounded text-[8px] font-mono tabular-nums font-bold border shrink-0"
                            :class="getPinMethodBadgeClass(pin)"
                            :title="'Method: ' + formatPinMethodLabel(pin)"
                            x-text="getPinMethod(pin)"></span>
                      <template x-if="formatPinAge(pin)">
                        <span class="text-slate-400 text-[9px] shrink-0" :title="'Created: ' + formatPinCreated(pin)" x-text="'📅 ' + formatPinAge(pin)"></span>
                      </template>
                    </div>
                    <!-- Visual Annotations Tag Pills -->
                    <template x-if="pin._hasVisualTags || getPinVisualTags(pin).length > 0">
                      <div class="flex flex-wrap items-center gap-1 mt-1">
                        <template x-for="vtag in (pin._cachedVisualTagsSlice || getPinVisualTags(pin).slice(0, 3))" :key="vtag">
                          <button @click.stop="filterByVisualTag(vtag)"
                                  class="px-1.5 py-0.2 rounded-md text-[9px] font-mono tabular-nums transition cursor-pointer"
                                  :class="activeVisualTagFilter === vtag.toLowerCase() ? 'bg-purple-600 text-white font-bold' : 'bg-purple-500/10 text-purple-600 dark:text-purple-400 hover:bg-purple-500/20 border border-purple-500/20'"
                                  :title="'Filter by visual tag: #' + vtag">
                            <span x-text="'#' + vtag"></span>
                          </button>
                        </template>
                      </div>
                    </template>
                  </div>
                </div>

                <!-- Engagement Bar & Actions -->
                <div class="pt-2.5 border-t border-slate-200/60 dark:border-[#27272A]/60 space-y-2">
                  <div class="flex items-center justify-between text-xs font-mono tabular-nums">
                    <div>
                      <span class="text-slate-400 text-[10px]">Saves:</span>
                      <strong class="text-slate-900 dark:text-white" x-text="formatNumber(pin.save_count || pin.metadata?.raw_saves || 0)"></strong>
                      <template x-if="getPaceDelta(pin, 'saves') && getPaceDelta(pin, 'saves') !== '0'">
                        <span class="text-emerald-500 text-[10px] font-bold" x-text="getPaceDelta(pin, 'saves')"></span>
                      </template>
                    </div>
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold font-mono tabular-nums"
                          :class="Number(pin.daily_save_velocity || 0) > 0 ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'"
                          x-text="(Number(pin.daily_save_velocity || 0) > 0 ? '+' : '') + (pin.daily_save_velocity || 0) + ' v/d'"></span>
                  </div>

                  <div class="flex items-center justify-between text-[11px] text-slate-400 pt-1" @click.stop>
                    <span class="truncate max-w-[120px] font-mono tabular-nums text-[10px]" x-text="pin.domain || 'Pinterest'"></span>
                    <div class="flex items-center space-x-1">
                      <a :href="getPinDossierUrl(pin)" class="p-1 rounded bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20" title="Open Dossier (/pin/:pin_id)">
                        <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                      </a>
                      <button @click="openPinInspector(pin)" class="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 cursor-pointer" title="Dossier">
                        <i data-lucide="eye" class="w-3.5 h-3.5"></i>
                      </button>
                      <button @click="openVisualLens(pin)" class="p-1 rounded hover:bg-purple-500/20 text-slate-500 hover:text-purple-600 dark:text-slate-400 dark:hover:text-purple-400 cursor-pointer" title="Visual Lens">
                        <i data-lucide="camera" class="w-3.5 h-3.5"></i>
                      </button>
                      <a :href="'https://www.pinterest.com/pin/' + pin.pin_id + '/'" target="_blank" rel="noopener noreferrer" class="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white" title="Pinterest">
                        <i data-lucide="arrow-up-right" class="w-3.5 h-3.5"></i>
                      </a>
                    </div>
                  </div>
                </div>

              </div>
            </template>
          </div>
        </template>

        <!-- TAB 1 PAGINATION & STATUS FOOTER -->
        <template x-if="!isDetailsLoading && filteredPins && filteredPins.length > 0">
          <div class="px-5 py-3.5 border-t border-slate-200/80 dark:border-[#27272A]/80 bg-slate-50/50 dark:bg-slate-900/30 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            
            <!-- Left: Items range & Selection -->
            <div class="flex items-center space-x-3 text-slate-500 font-mono tabular-nums text-[11px] flex-wrap gap-y-1">
              <div>
                <span>Showing </span>
                <span class="font-bold text-slate-900 dark:text-white"
                      x-text="filteredPins.length > 0 ? (((pinPage - 1) * (pinPageSize === 'all' ? 0 : Number(pinPageSize))) + 1) : 0"></span>
                <span> - </span>
                <span class="font-bold text-slate-900 dark:text-white"
                      x-text="pinPageSize === 'all' ? filteredPins.length : Math.min(pinPage * Number(pinPageSize), filteredPins.length)"></span>
                <span> of </span>
                <span class="font-bold text-slate-900 dark:text-white" x-text="filteredPins.length"></span>
                <template x-if="serpScope === 'displaced' && totalDisplacedCount > displacedVaultPins.length">
                  <span class="text-rose-500 font-bold ml-1" x-text="'(' + totalDisplacedCount + ' total in Vault)'"></span>
                </template>
                <template x-if="serpScope === 'all' && totalCatalogCount > allCombinedPins.length">
                  <span class="text-emerald-500 font-bold ml-1" x-text="'(' + totalCatalogCount + ' total in Catalog)'"></span>
                </template>
                <span> pins</span>
              </div>

              <template x-if="selectedPinIds.length > 0">
                <span class="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold border border-emerald-500/30 font-sans"
                      x-text="selectedPinIds.length + ' selected'"></span>
              </template>

              <!-- Load More Displaced Pins Action -->
              <template x-if="(serpScope === 'displaced' || serpScope === 'all') && totalDisplacedCount > displacedVaultPins.length">
                <button type="button" @click="loadMoreDisplacedPins()" :disabled="isLoadingMoreDisplaced"
                        class="px-2.5 py-1 rounded-lg font-mono tabular-nums font-bold text-[11px] bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50 ml-2"
                        title="Load next 24 displaced pins from Vault">
                  <i data-lucide="download" class="w-3 h-3" :class="isLoadingMoreDisplaced ? 'animate-bounce' : ''"></i>
                  <span x-text="isLoadingMoreDisplaced ? 'Loading Vault...' : ('Load More Displaced (' + Math.min(24, totalDisplacedCount - displacedVaultPins.length) + ' more)')"></span>
                </button>
              </template>
            </div>

            <!-- Right: Pagination Buttons -->
            <template x-if="pinPageSize !== 'all' && pinTotalPages > 1">
              <div class="flex items-center space-x-1">
                <!-- First Page -->
                <button type="button" @click="setPinPage(1)" :disabled="pinPage <= 1"
                        class="p-1.5 rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer text-slate-600 dark:text-slate-400"
                        title="First Page">
                  <i data-lucide="chevrons-left" class="w-4 h-4"></i>
                </button>

                <!-- Previous Page -->
                <button type="button" @click="setPinPage(pinPage - 1)" :disabled="pinPage <= 1"
                        class="p-1.5 rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer text-slate-600 dark:text-slate-400"
                        title="Previous Page">
                  <i data-lucide="chevron-left" class="w-4 h-4"></i>
                </button>

                <!-- Numbered Page Pills -->
                <div class="flex items-center space-x-1 px-1">
                  <template x-for="p in pinPageNumbers" :key="p">
                    <div>
                      <template x-if="p === '...'">
                        <span class="px-2 py-1 text-slate-400 font-mono tabular-nums text-xs">...</span>
                      </template>
                      <template x-if="p !== '...'">
                        <button type="button" @click="setPinPage(p)"
                                class="min-w-8 h-8 px-2 rounded-xl text-xs font-mono tabular-nums font-bold transition cursor-pointer"
                                :class="pinPage === p ? 'bg-emerald-600 text-white shadow-xs' : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'"
                                x-text="p"></button>
                      </template>
                    </div>
                  </template>
                </div>

                <!-- Next Page -->
                <button type="button" @click="setPinPage(pinPage + 1)" :disabled="pinPage >= pinTotalPages"
                        class="p-1.5 rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer text-slate-600 dark:text-slate-400"
                        title="Next Page">
                  <i data-lucide="chevron-right" class="w-4 h-4"></i>
                </button>

                <!-- Last Page -->
                <button type="button" @click="setPinPage(pinTotalPages)" :disabled="pinPage >= pinTotalPages"
                        class="p-1.5 rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer text-slate-600 dark:text-slate-400"
                        title="Last Page">
                  <i data-lucide="chevrons-right" class="w-4 h-4"></i>
                </button>
              </div>
            </template>

          </div>
        </template>

      </div>`;
}
