/**
 * Creator Hub — View B Sub-View 5: Pinterest Boards Strategy & Semantics
 */
export function renderCreatorsProfileBoards() {
  return `          <!-- ======================================================== -->
          <!-- SUB-VIEW 4: PINTEREST BOARDS STRATEGY & SEMANTICS         -->
          <!-- Full-Featured, Modern Visual Intelligence & Harvest Suite -->
          <!-- ======================================================== -->
          <div x-show="activeCreatorTab === 'boards'" class="space-y-6">

            <!-- 1. Master Strategy Header & Actions Bar -->
            <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-[#18181B] p-5 rounded-2xl border border-slate-200/90 dark:border-[#27272A] shadow-xs">
              <div>
                <div class="flex items-center gap-2">
                  <span class="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 font-bold text-base">📌</span>
                  <h3 class="text-base font-bold text-slate-900 dark:text-white">Curated Boards &amp; Topic Strategy</h3>
                  <span class="text-xs font-mono tabular-nums font-bold px-2.5 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20" x-text="(activeCreatorBoards.length || activeCreator.total_boards || 0) + ' boards'"></span>
                </div>
                <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">Deep inspection of public Pinterest boards, cover visuals, follower reach, and algorithmic Related Interests (board_vase).</p>
              </div>
              <div class="flex items-center flex-wrap gap-2">
                <button type="button" @click="syncCompetitorBoardsAction(activeCreator)" :disabled="isSyncingBoards" class="px-4 py-2 rounded-xl text-xs font-bold bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition active:scale-95 disabled:opacity-50 flex items-center space-x-1.5 shadow-2xs cursor-pointer">
                  <i data-lucide="refresh-cw" :class="{'animate-spin text-purple-500': isSyncingBoards}" class="w-3.5 h-3.5"></i>
                  <span x-text="isSyncingBoards ? 'Syncing...' : 'Sync Boards (Pinterest)'"></span>
                </button>
                <button type="button" @click="openGhaCrawlerModal(activeCreator)" :disabled="isDispatchingGitHubCrawl" class="px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white transition active:scale-95 disabled:opacity-50 flex items-center space-x-1.5 shadow-sm cursor-pointer" title="Crawl all creator boards using 20-Runner GitHub Actions Crawler">
                  <i data-lucide="zap" :class="{'animate-spin': isDispatchingGitHubCrawl}" class="w-3.5 h-3.5"></i>
                  <span>⚡ Harvest All Boards (20 Runners)</span>
                </button>
              </div>
            </div>

            <!-- 2. Board Strategy KPI Summary Cards -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
              <div class="bg-white dark:bg-[#18181B] rounded-2xl border border-slate-200/90 dark:border-[#27272A] p-4 shadow-2xs">
                <div class="flex items-center justify-between text-slate-400 mb-1">
                  <span class="text-[10.5px] font-bold uppercase tracking-wider">Curated Boards</span>
                  <i data-lucide="layout-grid" class="w-4 h-4 text-purple-500"></i>
                </div>
                <span class="text-2xl font-black text-slate-900 dark:text-white font-mono tabular-nums block" x-text="activeCreatorBoards.length || activeCreator.total_boards || 0"></span>
                <span class="text-[11px] text-slate-500 mt-1 block">Public thematic boards</span>
              </div>

              <div class="bg-white dark:bg-[#18181B] rounded-2xl border border-slate-200/90 dark:border-[#27272A] p-4 shadow-2xs">
                <div class="flex items-center justify-between text-slate-400 mb-1">
                  <span class="text-[10.5px] font-bold uppercase tracking-wider">Board Pins</span>
                  <i data-lucide="layers" class="w-4 h-4 text-indigo-500"></i>
                </div>
                <span class="text-2xl font-black text-slate-900 dark:text-white font-mono tabular-nums block" x-text="formatNumber(creatorBoardsTotalPins)"></span>
                <span class="text-[11px] text-slate-500 mt-1 block">Curated across all boards</span>
              </div>

              <div class="bg-white dark:bg-[#18181B] rounded-2xl border border-slate-200/90 dark:border-[#27272A] p-4 shadow-2xs">
                <div class="flex items-center justify-between text-slate-400 mb-1">
                  <span class="text-[10.5px] font-bold uppercase tracking-wider">Board Audience</span>
                  <i data-lucide="users" class="w-4 h-4 text-emerald-500"></i>
                </div>
                <span class="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono tabular-nums block" x-text="formatNumber(creatorBoardsTotalFollowers)"></span>
                <span class="text-[11px] text-slate-500 mt-1 block">Verified profile reach</span>
              </div>

              <div class="bg-white dark:bg-[#18181B] rounded-2xl border border-slate-200/90 dark:border-[#27272A] p-4 shadow-2xs">
                <div class="flex items-center justify-between text-slate-400 mb-1">
                  <span class="text-[10.5px] font-bold uppercase tracking-wider">Top Board</span>
                  <i data-lucide="trophy" class="w-4 h-4 text-amber-500"></i>
                </div>
                <span class="text-sm font-bold text-slate-900 dark:text-white truncate block" :title="activeCreatorBoards[0]?.name || 'None'" x-text="activeCreatorBoards[0]?.name || 'N/A'"></span>
                <span class="text-[11px] text-amber-600 dark:text-amber-400 font-mono tabular-nums font-bold mt-1 block" x-text="formatNumber(activeCreatorBoards[0]?.pin_count || 0) + ' pins'"></span>
              </div>
            </div>

            <!-- 3. Discovered Algorithmic Related Interests (board_vase) -->
            <div x-show="creatorBoardsTopicsList.length > 0" class="rounded-2xl border border-purple-500/20 bg-gradient-to-r from-purple-500/5 via-sky-500/5 to-indigo-500/5 dark:from-purple-950/20 dark:via-sky-950/20 dark:to-indigo-950/20 p-4 space-y-3">
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div class="flex items-center gap-2">
                  <span class="flex h-5 w-5 items-center justify-center rounded-lg bg-purple-500/20 text-purple-600 dark:text-purple-400 text-xs">✨</span>
                  <span class="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">Pinterest Algorithmic Topics (<code class="text-purple-600 dark:text-purple-400 font-mono tabular-nums">board_vase</code> Semantic Interests)</span>
                  <span class="text-[10px] font-mono tabular-nums font-bold px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400" x-text="creatorBoardsTopicsList.length + ' topics'"></span>
                </div>
                <button type="button" x-show="creatorBoardSelectedTopic" @click="creatorBoardSelectedTopic = ''; creatorBoardPage = 1" class="text-[11px] font-bold text-rose-500 hover:underline flex items-center gap-1 cursor-pointer">
                  <i data-lucide="x" class="w-3 h-3"></i>
                  <span>Clear Topic Filter</span>
                </button>
              </div>

              <!-- Topic Chips Flow -->
              <div class="flex flex-wrap gap-1.5 items-center max-h-32 overflow-y-auto pr-1">
                <button type="button" @click="creatorBoardSelectedTopic = ''; creatorBoardPage = 1" class="px-2.5 py-1 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1" :class="!creatorBoardSelectedTopic ? 'bg-purple-600 text-white shadow-2xs' : 'bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-[#27272A] text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'">
                  <span>All Topics</span>
                </button>
                <template x-for="item in creatorBoardsTopicsList" :key="item.text">
                  <button type="button" @click="creatorBoardSelectedTopic = (creatorBoardSelectedTopic === item.text ? '' : item.text); creatorBoardPage = 1" class="px-2.5 py-1 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 shadow-2xs" :class="creatorBoardSelectedTopic === item.text ? 'bg-purple-600 text-white font-bold' : 'bg-white dark:bg-[#18181B] border border-slate-200/90 dark:border-[#27272A] text-slate-700 dark:text-slate-300 hover:border-purple-400/50 hover:bg-purple-50/50 dark:hover:bg-purple-950/20'">
                    <span class="text-purple-500 font-bold">#</span>
                    <span x-text="item.text"></span>
                    <span class="text-[10px] font-mono tabular-nums px-1.5 py-0.2 rounded-full" :class="creatorBoardSelectedTopic === item.text ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'" x-text="item.count"></span>
                  </button>
                </template>
              </div>
            </div>

            <!-- 4. Interactive Toolbar: Search, Sort & View Mode Switcher -->
            <div class="rounded-2xl border border-slate-200/90 dark:border-[#27272A] bg-white dark:bg-[#18181B] p-4 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <!-- Search bar -->
              <div class="relative flex-1 min-w-[240px]">
                <i data-lucide="search" class="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"></i>
                <input
                  type="text"
                  x-model="creatorBoardSearch"
                  @input="creatorBoardPage = 1"
                  placeholder="Filter boards by title, topic, or keyword..."
                  class="w-full pl-9 pr-9 py-2 text-xs rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50/50 dark:bg-slate-900/50 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:border-purple-500 transition"
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
                    class="rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50/50 dark:bg-slate-900/50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-hidden focus:border-purple-500 transition cursor-pointer"
                  >
                    <option value="most_pins">🔥 Most Pins</option>
                    <option value="most_followers">👥 Most Followers</option>
                    <option value="recent_activity">🕒 Recent Activity</option>
                    <option value="name_asc">🔤 Name (A-Z)</option>
                    <option value="creation_date">📅 Creation Date</option>
                  </select>
                </div>

                <!-- View Toggle Buttons -->
                <div class="flex items-center rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50/50 dark:bg-slate-900/50 p-0.5">
                  <button
                    type="button"
                    @click="creatorBoardsViewMode = 'grid'"
                    class="px-2.5 py-1 text-xs font-bold rounded-lg transition flex items-center gap-1 cursor-pointer"
                    :class="creatorBoardsViewMode === 'grid' ? 'bg-white dark:bg-[#121215] text-purple-600 dark:text-purple-400 shadow-2xs' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'"
                    title="Grid Cards View"
                  >
                    <i data-lucide="layout-grid" class="w-3.5 h-3.5"></i>
                    <span class="hidden sm:inline">Grid</span>
                  </button>
                  <button
                    type="button"
                    @click="creatorBoardsViewMode = 'table'"
                    class="px-2.5 py-1 text-xs font-bold rounded-lg transition flex items-center gap-1 cursor-pointer"
                    :class="creatorBoardsViewMode === 'table' ? 'bg-white dark:bg-[#121215] text-purple-600 dark:text-purple-400 shadow-2xs' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'"
                    title="Data Table View"
                  >
                    <i data-lucide="table" class="w-3.5 h-3.5"></i>
                    <span class="hidden sm:inline">Table</span>
                  </button>
                </div>

                <!-- Total Count Pill -->
                <span class="inline-flex items-center rounded-xl bg-purple-500/10 px-3 py-1.5 text-xs font-mono tabular-nums font-bold text-purple-600 dark:text-purple-400 border border-purple-500/20" x-text="filteredCreatorBoards.length + ' / ' + activeCreatorBoards.length"></span>
              </div>
            </div>

            <!-- Loading Skeleton -->
            <div x-show="isLoadingBoards" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-pulse">
              <template x-for="i in 8" :key="i">
                <div class="rounded-2xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] overflow-hidden p-4 space-y-3">
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
                <div class="group relative flex flex-col rounded-2xl border border-slate-200/90 dark:border-[#27272A] bg-white dark:bg-[#18181B] overflow-hidden shadow-xs hover:shadow-md hover:border-purple-500/40 dark:hover:border-purple-500/40 transition-all duration-200">
                  
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
                      <a :href="safeUrl(b.url || ('https://www.pinterest.com/' + (activeCreator.username || '').replace(/^@+/, '') + '/' + encodeURIComponent((b.name || '').toLowerCase().replace(/\s+/g, '-'))))" target="_blank" rel="noopener noreferrer" class="p-1.5 rounded-full bg-slate-900/70 backdrop-blur-md text-white/80 hover:text-white hover:bg-slate-900 transition border border-white/10 shadow-xs" title="Open on Pinterest">
                        <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                      </a>
                    </div>

                    <!-- Bottom Floating Stats Pills -->
                    <div class="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between">
                      <div class="flex items-center gap-1.5">
                        <span class="px-2 py-0.5 rounded-lg text-[10.5px] font-mono tabular-nums font-bold bg-purple-500/90 backdrop-blur-md text-white shadow-xs flex items-center gap-1">
                          <i data-lucide="pin" class="w-3 h-3"></i>
                          <span x-text="formatNumber(b.pin_count) + ' pins'"></span>
                        </span>
                        <span class="px-2 py-0.5 rounded-lg text-[10.5px] font-mono tabular-nums font-semibold bg-slate-900/80 backdrop-blur-md text-slate-200 border border-white/10 flex items-center gap-1">
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
                      <div class="mt-2.5 pt-2 border-t border-slate-100 dark:border-[#27272A]/80">
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
                            <span x-show="b.board_vase.length > 3" class="px-1.5 py-0.5 rounded-md text-[10px] font-mono tabular-nums text-slate-400 bg-slate-100 dark:bg-slate-800" x-text="'+' + (b.board_vase.length - 3)"></span>
                          </div>
                        </template>
                        <template x-if="!b.board_vase || b.board_vase.length === 0">
                          <span class="text-[10px] text-slate-400 italic">No semantic tags discovered yet</span>
                        </template>
                      </div>
                    </div>

                    <!-- Action Buttons Footer -->
                    <div class="pt-2 border-t border-slate-100 dark:border-[#27272A] flex items-center gap-1.5">
                      <button
                        type="button"
                        @click="openBoardPage(b, activeCreator)"
                        class="flex-1 py-1.5 px-2 rounded-xl text-xs font-bold bg-purple-500/10 hover:bg-purple-500/20 text-purple-700 dark:text-purple-300 border border-purple-500/30 transition active:scale-95 flex items-center justify-center gap-1 cursor-pointer"
                        title="Open Dedicated Board Intelligence Page"
                      >
                        <i data-lucide="layout-grid" class="w-3.5 h-3.5"></i>
                        <span>Inspect</span>
                      </button>

                      <button
                        type="button"
                        @click="openBoardSectionsModal(b.id || b.board_id, b.name)"
                        class="py-1.5 px-2 rounded-xl text-xs font-bold bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 transition active:scale-95 flex items-center justify-center gap-1 cursor-pointer"
                        title="Inspect Board Subsections & Internal Taxonomies"
                      >
                        <i data-lucide="folder" class="w-3.5 h-3.5 text-amber-500"></i>
                        <span>Sections</span>
                      </button>

                      <button
                        type="button"
                        @click="crawlSingleBoardGha(b.name)"
                        class="py-1.5 px-2 rounded-xl text-xs font-bold bg-sky-500/10 hover:bg-sky-500/20 text-sky-700 dark:text-sky-300 border border-sky-500/30 transition active:scale-95 flex items-center justify-center gap-1 cursor-pointer"
                        title="Harvest this specific board via GitHub Actions 20-Runner Crawler"
                      >
                        <i data-lucide="zap" class="w-3.5 h-3.5 text-sky-500"></i>
                        <span>Crawl</span>
                      </button>
                    </div>

                  </div>
                </div>
              </template>
            </div>

            <!-- VIEW 2: HIGH-DENSITY DATA TABLE -->
            <div x-show="!isLoadingBoards && creatorBoardsViewMode === 'table'" class="border border-slate-200/90 dark:border-[#27272A] rounded-2xl overflow-hidden bg-white dark:bg-[#18181B] shadow-xs">
              <div class="overflow-x-auto min-w-full">
                <table class="w-full text-left text-xs border-collapse">
                  <thead class="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-[#27272A] text-[11px] font-bold uppercase tracking-wider text-slate-500">
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
                  <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono tabular-nums">
                    <template x-for="b in paginatedCreatorBoards" :key="b.id || b.board_id">
                      <tr class="hover:bg-slate-50/80 dark:hover:bg-slate-900/40 transition">
                        
                        <!-- Thumbnail Column -->
                        <td class="py-3 px-4">
                          <div class="w-11 h-11 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-[#27272A] shrink-0">
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
                          <div class="flex items-center justify-between text-xs font-bold text-slate-900 dark:text-white font-mono tabular-nums mb-1">
                            <span x-text="formatNumber(b.pin_count)"></span>
                            <span class="text-[10px] text-slate-400 font-normal" x-text="Math.round(((b.pin_count || 0) / creatorBoardsMaxPins) * 100) + '% of top'"></span>
                          </div>
                          <div class="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                            <div class="h-full rounded-full bg-gradient-to-r from-purple-500 to-indigo-500" :style="'width: ' + Math.min(100, Math.max(4, Math.round(((b.pin_count || 0) / creatorBoardsMaxPins) * 100))) + '%'"></div>
                          </div>
                        </td>

                        <!-- Followers Column -->
                        <td class="py-3 px-4 text-right font-bold text-slate-700 dark:text-slate-300 font-mono tabular-nums" x-text="formatNumber(b.follower_count || 0)"></td>

                        <!-- Topics Column -->
                        <td class="py-3 px-4 font-sans">
                          <template x-if="b.board_vase && b.board_vase.length > 0">
                            <div class="flex flex-wrap gap-1 max-w-xs">
                              <template x-for="v in b.board_vase.slice(0, 2)" :key="v.text || v">
                                <span class="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20" x-text="'#' + (v.text || v)"></span>
                              </template>
                              <span x-show="b.board_vase.length > 2" class="px-1.5 py-0.5 rounded-md text-[10px] font-mono tabular-nums text-slate-400 bg-slate-100 dark:bg-slate-800" x-text="'+' + (b.board_vase.length - 2)"></span>
                            </div>
                          </template>
                          <template x-if="!b.board_vase || b.board_vase.length === 0">
                            <span class="text-[10px] text-slate-400 italic">—</span>
                          </template>
                        </td>

                        <!-- Last Activity Column -->
                        <td class="py-3 px-4 text-center font-sans">
                          <span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-[#27272A]" x-text="b.last_pinned_at ? new Date(b.last_pinned_at).toLocaleDateString() : 'Active'"></span>
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
                              @click="openBoardSectionsModal(b.id || b.board_id, b.name)"
                              class="px-2.5 py-1 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[11px] font-bold hover:bg-amber-500/20 transition cursor-pointer"
                              title="Inspect Board Subsections"
                            >
                              <i data-lucide="folder" class="w-3 h-3 inline text-amber-500"></i>
                              <span>Sections</span>
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
            <div x-show="!isLoadingBoards && filteredCreatorBoards.length === 0" class="p-12 text-center rounded-2xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B]">
              <i data-lucide="folder-search" class="w-12 h-12 mx-auto mb-3 opacity-40 text-purple-500"></i>
              <h4 class="font-bold text-sm text-slate-900 dark:text-white">No boards match your filter</h4>
              <p class="text-xs text-slate-500 mt-1 max-w-sm mx-auto">Try clearing your search keyword, resetting topic filters, or sync public boards from Pinterest.</p>
              <div class="mt-4 flex items-center justify-center gap-2">
                <button type="button" @click="creatorBoardSearch = ''; creatorBoardSelectedTopic = ''; creatorBoardPage = 1" class="px-3 py-1.5 rounded-xl text-xs font-bold border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 transition cursor-pointer">
                  <span>Clear Filters</span>
                </button>
                <button type="button" @click="syncCompetitorBoardsAction(activeCreator)" class="px-3 py-1.5 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white transition cursor-pointer shadow-sm">
                  <span>Sync Boards Now</span>
                </button>
              </div>
            </div>

            <!-- Pagination Bar -->
            <div x-show="!isLoadingBoards && filteredCreatorBoards.length > 0" class="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-200 dark:border-[#27272A] pt-4 text-xs text-slate-500">
              <span x-text="'Showing ' + (filteredCreatorBoards.length > 0 ? ((creatorBoardPage - 1) * (creatorBoardPageSize || 12) + 1) : 0) + '-' + Math.min(creatorBoardPage * (creatorBoardPageSize || 12), filteredCreatorBoards.length) + ' of ' + filteredCreatorBoards.length + ' boards'"></span>
              <div class="flex items-center gap-2">
                <button @click="creatorBoardPage = Math.max(1, creatorBoardPage - 1)" :disabled="creatorBoardPage <= 1" class="rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 disabled:opacity-40 transition shadow-2xs cursor-pointer">Previous</button>
                <span class="font-bold text-slate-900 dark:text-white font-mono tabular-nums px-1" x-text="'Page ' + creatorBoardPage + ' of ' + Math.max(1, Math.ceil(filteredCreatorBoards.length / (creatorBoardPageSize || 12)))"></span>
                <button @click="creatorBoardPage = creatorBoardPage + 1" :disabled="creatorBoardPage >= Math.ceil(filteredCreatorBoards.length / (creatorBoardPageSize || 12))" class="rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 disabled:opacity-40 transition shadow-2xs cursor-pointer">Next</button>
              </div>
            </div>

          </div>`;
}
