/**
 * Dedicated Board Detail View & Pin Inventory Table/Grid
 * Route: /:username/:board
 */
export function getDashboardBoardViewHtml() {
  return `    <!-- ======================================================== -->
    <!-- DEDICATED BOARD DETAIL PAGE & COMPLETE PIN INVENTORY     -->
    <!-- Route: /:username/:board                                 -->
    <!-- ======================================================== -->
    <div x-show="activeBoardName" x-cloak class="space-y-6 max-w-7xl mx-auto">
      
      <!-- Top Breadcrumbs & Back Bar -->
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-slate-200 dark:border-[#27272A]">
        <div class="flex items-center gap-2 flex-wrap text-xs text-slate-500 dark:text-slate-400">
          <button type="button" @click="closeBoardPage()" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 transition shadow-2xs cursor-pointer">
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
      <div class="rounded-3xl border border-slate-200/90 dark:border-[#27272A] bg-white dark:bg-[#18181B] p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div class="flex items-start sm:items-center gap-4">
          <!-- Board Cover / Icon -->
          <div class="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-[#27272A] shrink-0 shadow-md">
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
              <span class="px-2.5 py-0.5 rounded-full text-[10.5px] font-mono tabular-nums font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">Pinterest Board</span>
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
        <div class="p-4 rounded-2xl border border-slate-200/90 dark:border-[#27272A] bg-white dark:bg-[#18181B] shadow-2xs space-y-2.5">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
              <i data-lucide="sparkles" class="w-3.5 h-3.5 text-purple-500"></i>
              <span>Discovered Algorithmic Related Topics (board_vase)</span>
              <span class="px-2 py-0.5 rounded-full text-[10px] font-mono tabular-nums bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 font-bold" x-text="activeBoard.board_vase.length + ' topics'"></span>
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
        <div class="p-4 rounded-2xl border border-slate-200/90 dark:border-[#27272A] bg-white dark:bg-[#18181B] shadow-xs space-y-1">
          <div class="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">Total Pins In Board</div>
          <div class="text-2xl font-black text-slate-900 dark:text-white font-mono tabular-nums" x-text="formatNumber((activeBoard && activeBoard.pin_count ? activeBoard.pin_count : 0) || boardPinsTotal || boardPins.length || 0)"></div>
          <div class="text-[10.5px] text-slate-400" x-text="boardPins.length + ' indexed in Neon'"></div>
        </div>

        <!-- KPI 2: Total Board Saves -->
        <div class="p-4 rounded-2xl border border-slate-200/90 dark:border-[#27272A] bg-white dark:bg-[#18181B] shadow-xs space-y-1">
          <div class="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">Total Cumulative Saves</div>
          <div class="text-2xl font-black text-rose-600 dark:text-rose-400 font-mono tabular-nums" x-text="formatNumber(boardTotalSaves)"></div>
          <div class="text-[10.5px] text-slate-400">Aggregated audience engagement</div>
        </div>

        <!-- KPI 3: Qualified Winning Pins -->
        <div class="p-4 rounded-2xl border border-slate-200/90 dark:border-[#27272A] bg-white dark:bg-[#18181B] shadow-xs space-y-1">
          <div class="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">🏆 Qualified Winning Pins</div>
          <div class="text-2xl font-black text-amber-500 font-mono tabular-nums" x-text="formatNumber(boardWinningPinsCount)"></div>
          <div class="text-[10.5px] text-slate-400">Meets 3-tier breakout rules</div>
        </div>

        <!-- KPI 4: Commercial / Product Pins -->
        <div class="p-4 rounded-2xl border border-slate-200/90 dark:border-[#27272A] bg-white dark:bg-[#18181B] shadow-xs space-y-1">
          <div class="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">🛒 Commercial Product Pins</div>
          <div class="flex items-baseline gap-1.5">
            <span class="text-2xl font-black text-emerald-500 font-mono tabular-nums" x-text="formatNumber(boardProductPinsCount)"></span>
            <span class="text-xs font-bold text-slate-400" x-show="boardPins.length > 0" x-text="'(' + Math.round((boardProductPinsCount / Math.max(1, boardPins.length)) * 100) + '%)'"></span>
          </div>
          <div class="text-[10.5px] text-slate-400">Identified shopping &amp; affiliate pins</div>
        </div>
      </div>

      <!-- Search, Filters, Sorters & View Switcher Bar -->
      <div class="p-4 rounded-2xl border border-slate-200/90 dark:border-[#27272A] bg-white dark:bg-[#18181B] shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        
        <!-- Filter Tabs (All / Winning / Product) -->
        <div class="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-[#27272A] overflow-x-auto text-xs">
          <button type="button" @click="boardPinsFilter = 'all'; boardPinsPage = 1" class="px-3 py-1.5 rounded-lg font-bold transition cursor-pointer shrink-0" :class="boardPinsFilter === 'all' ? 'bg-white dark:bg-[#121215] text-slate-900 dark:text-white shadow-2xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'">
            <span>All Pins</span>
            <span class="ml-1 px-1.5 py-0.2 rounded-md font-mono tabular-nums text-[10px]" :class="boardPinsFilter === 'all' ? 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200' : 'bg-slate-200/60 dark:bg-slate-800 text-slate-500'" x-text="boardPins.length"></span>
          </button>
          
          <button type="button" @click="boardPinsFilter = 'qualified'; boardPinsPage = 1" class="px-3 py-1.5 rounded-lg font-bold transition cursor-pointer shrink-0" :class="boardPinsFilter === 'qualified' ? 'bg-white dark:bg-[#121215] text-amber-600 dark:text-amber-400 shadow-2xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'">
            <span>🏆 Winning Pins</span>
            <span class="ml-1 px-1.5 py-0.2 rounded-md font-mono tabular-nums text-[10px]" :class="boardPinsFilter === 'qualified' ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400' : 'bg-slate-200/60 dark:bg-slate-800 text-slate-500'" x-text="boardWinningPinsCount"></span>
          </button>

          <button type="button" @click="boardPinsFilter = 'product'; boardPinsPage = 1" class="px-3 py-1.5 rounded-lg font-bold transition cursor-pointer shrink-0" :class="boardPinsFilter === 'product' ? 'bg-white dark:bg-[#121215] text-emerald-600 dark:text-emerald-400 shadow-2xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'">
            <span>🛒 Product Pins</span>
            <span class="ml-1 px-1.5 py-0.2 rounded-md font-mono tabular-nums text-[10px]" :class="boardPinsFilter === 'product' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-slate-200/60 dark:bg-slate-800 text-slate-500'" x-text="boardProductPinsCount"></span>
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
              class="h-9 w-48 sm:w-60 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-slate-900 pl-8 pr-3 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none shadow-2xs"
            />
            <i data-lucide="search" class="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-3"></i>
          </div>

          <!-- Sort dropdown -->
          <select x-model="boardPinsSort" class="h-9 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-slate-900 px-3 text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none shadow-2xs cursor-pointer">
            <option value="saves_desc">Sort: Most Saves</option>
            <option value="repins_desc">Sort: Most Repins</option>
            <option value="velocity">Sort: Highest Velocity</option>
            <option value="newest">Sort: Newest Pinned</option>
          </select>

          <!-- View toggle buttons -->
          <div class="flex items-center rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-slate-900 p-0.5">
            <button
              type="button"
              @click="boardPinsViewMode = 'grid'"
              class="px-2.5 py-1 text-xs font-bold rounded-lg transition flex items-center gap-1 cursor-pointer"
              :class="boardPinsViewMode === 'grid' ? 'bg-white dark:bg-[#121215] text-rose-500 shadow-2xs' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'"
              title="Grid Cards View"
            >
              <i data-lucide="layout-grid" class="w-3.5 h-3.5"></i>
              <span class="hidden sm:inline">Grid</span>
            </button>
            <button
              type="button"
              @click="boardPinsViewMode = 'table'"
              class="px-2.5 py-1 text-xs font-bold rounded-lg transition flex items-center gap-1 cursor-pointer"
              :class="boardPinsViewMode === 'table' ? 'bg-white dark:bg-[#121215] text-rose-500 shadow-2xs' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'"
              title="Data Table View"
            >
              <i data-lucide="table" class="w-3.5 h-3.5"></i>
              <span class="hidden sm:inline">Table</span>
            </button>
          </div>

          <span class="inline-flex items-center rounded-xl bg-slate-100 dark:bg-slate-900 px-3 py-1.5 text-xs font-mono tabular-nums font-bold text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#27272A]" x-text="filteredBoardPins.length + ' pins'"></span>
        </div>
      </div>

      <!-- Loading State -->
      <div x-show="isLoadingBoardPins" class="py-16 flex flex-col items-center justify-center space-y-3">
        <i data-lucide="loader" class="w-8 h-8 text-rose-500 animate-spin"></i>
        <span class="text-xs font-semibold text-slate-400">Loading board pins inventory from Neon database...</span>
      </div>

      <!-- Empty State -->
      <div x-show="!isLoadingBoardPins && filteredBoardPins.length === 0" class="rounded-3xl border border-slate-200/90 dark:border-[#27272A] bg-white dark:bg-[#18181B] p-12 text-center shadow-xs space-y-4">
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
          <div :data-pin-id="p.pin_id || p.id" class="group relative flex flex-col rounded-2xl border border-slate-200/90 dark:border-[#27272A] bg-white dark:bg-[#18181B] overflow-hidden shadow-xs hover:shadow-md hover:border-rose-500/40 dark:hover:border-rose-500/40 transition-all duration-200">
            
            <!-- Pin Image Container -->
            <div class="relative h-64 w-full overflow-hidden bg-slate-100 dark:bg-slate-900 cursor-pointer" @click="openPinPage(p)">
              <img :src="p.image_url" :alt="p.title" loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" onerror="window.handlePinImgError(this)" />
              
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
              <div class="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between text-white text-[11px] font-mono tabular-nums font-bold">
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

              <div class="space-y-2 pt-2 border-t border-slate-100 dark:border-[#27272A]">
                <!-- Destination URL / Domain -->
                <div class="flex items-center justify-between text-[11px]">
                  <template x-if="p.destination_url">
                    <a :href="safeUrl(p.destination_url)" target="_blank" rel="noopener noreferrer" class="text-sky-500 hover:underline flex items-center gap-1 truncate max-w-[180px]" :title="p.destination_url">
                      <i data-lucide="link" class="w-3 h-3 shrink-0"></i>
                      <span class="truncate" x-text="p.link_domain || p.domain || 'Destination'"></span>
                    </a>
                  </template>
                  <template x-if="!p.destination_url">
                    <span class="text-slate-400 italic">No outbound link</span>
                  </template>

                  <span class="text-[10px] text-slate-400 font-mono tabular-nums" x-text="p.created_at_pinterest ? new Date(p.created_at_pinterest).toLocaleDateString() : 'Active'"></span>
                </div>

                <!-- Footer Action Buttons -->
                <div class="flex items-center gap-2 pt-1">
                  <button type="button" @click="openPinPage(p)" class="flex-1 py-1.5 px-2.5 rounded-xl text-xs font-bold bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 transition active:scale-95 flex items-center justify-center gap-1 cursor-pointer">
                    <i data-lucide="eye" class="w-3.5 h-3.5"></i>
                    <span>Inspect Pin</span>
                  </button>
                  <a :href="'https://www.pinterest.com/pin/' + (p.pin_id || p.id) + '/'" target="_blank" rel="noopener noreferrer" class="p-1.5 rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] text-slate-500 hover:text-rose-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition" title="Open on Pinterest">
                    <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                  </a>
                </div>

              </div>
            </div>

          </div>
        </template>
      </div>

      <!-- VIEW 2: HIGH-DENSITY DATA TABLE -->
      <div x-show="!isLoadingBoardPins && boardPinsViewMode === 'table' && paginatedBoardPins.length > 0" class="border border-slate-200/90 dark:border-[#27272A] rounded-2xl overflow-hidden bg-white dark:bg-[#18181B] shadow-xs">
        <div class="overflow-x-auto min-w-full">
          <table class="w-full text-left text-xs border-collapse">
            <thead class="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-[#27272A] text-[11px] font-bold uppercase tracking-wider text-slate-500">
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
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono tabular-nums">
              <template x-for="p in paginatedBoardPins" :key="p.pin_id || p.id">
                <tr :data-pin-id="p.pin_id || p.id" class="hover:bg-slate-50/80 dark:hover:bg-slate-900/40 transition">
                  
                  <!-- Thumbnail -->
                  <td class="py-2.5 px-4 w-14">
                    <div class="w-11 h-14 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-[#27272A] cursor-pointer" @click="openPinPage(p)">
                      <img :src="p.image_url" loading="lazy" class="w-full h-full object-cover" onerror="window.handlePinImgError(this)" />
                    </div>
                  </td>

                  <!-- Title & Domain -->
                  <td class="py-2.5 px-4 font-sans font-bold text-slate-900 dark:text-white max-w-sm">
                    <div class="line-clamp-2 hover:text-rose-500 transition cursor-pointer" :title="p.title" x-text="p.title || 'Untitled Pin'" @click="openPinPage(p)"></div>
                    <div class="flex items-center gap-2 mt-1 text-[10.5px] font-normal font-mono tabular-nums">
                      <span class="text-slate-400" x-text="'ID: ' + (p.pin_id || p.id)"></span>
                      <template x-if="p.destination_url">
                        <a :href="safeUrl(p.destination_url)" target="_blank" rel="noopener noreferrer" class="text-sky-500 hover:underline flex items-center gap-0.5 truncate max-w-[180px]">
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
                      <span class="text-[10px] text-slate-400 font-mono tabular-nums">—</span>
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
                      <span class="text-[10px] text-slate-400 font-mono tabular-nums">Regular</span>
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
      <div x-show="!isLoadingBoardPins && filteredBoardPins.length > 0" class="flex items-center justify-between border-t border-slate-200 dark:border-[#27272A] px-5 py-3 bg-white dark:bg-[#18181B] rounded-2xl shadow-xs text-xs text-slate-500">
        <span x-text="'Showing ' + (((boardPinsPage - 1) * boardPinsPageSize) + 1) + '-' + Math.min(boardPinsPage * boardPinsPageSize, filteredBoardPins.length) + ' of ' + filteredBoardPins.length + ' pins'"></span>
        <div class="flex items-center gap-2">
          <button @click="boardPinsPage = Math.max(1, boardPinsPage - 1)" :disabled="boardPinsPage <= 1" class="rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] px-3 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 disabled:opacity-40 transition shadow-2xs cursor-pointer">Previous</button>
          <span class="font-bold text-slate-900 dark:text-white" x-text="'Page ' + boardPinsPage + ' of ' + boardPinsTotalPages"></span>
          <button @click="boardPinsPage = boardPinsPage + 1" :disabled="boardPinsPage >= boardPinsTotalPages" class="rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] px-3 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 disabled:opacity-40 transition shadow-2xs cursor-pointer">Next</button>
        </div>
      </div>

    </div>
`;
}
