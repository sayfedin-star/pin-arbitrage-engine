/**
 * Domain Radar Leaderboard View (Top 5 KPI Cards & Leaderboard Table)
 */
export function getDomainsLeaderboardViewHtml({ hasInitialDomain = false } = {}) {
  return `    <!-- DOMAIN RADAR LEADERBOARD VIEW -->
    <div x-show="!isDossierOpen" class="flex flex-col gap-6" ${hasInitialDomain ? 'style="display:none;"' : ''}>

    <!-- TOP 5 EXECUTIVE KPI CARDS -->
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
      <!-- 1. Total Ranked Domains -->
      <div @click="setPreset('all')"
           class="bg-white dark:bg-[#121215] border rounded-2xl p-4 flex flex-col gap-1 shadow-sm cursor-pointer transition-all hover:border-sky-500/50"
           :class="activePreset === 'all' ? 'border-sky-500 ring-2 ring-sky-500/20' : 'border-slate-200 dark:border-[#27272A]'"
           title="Click to reset filters and view all domains">
        <div class="flex items-center justify-between text-slate-500 dark:text-slate-400">
          <span class="text-[10px] font-mono tabular-nums uppercase tracking-wider">Ranked Domains</span>
          <span class="text-xs">🌐</span>
        </div>
        <span class="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white" x-text="formatNumber(overview.total_domains)">0</span>
        <span class="text-[11px] text-slate-400 dark:text-slate-500">Indexed sites (Click to reset)</span>
      </div>

      <!-- 2. Top-10 SERP Monopoly -->
      <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl p-4 flex flex-col gap-1 shadow-sm">
        <div class="flex items-center justify-between text-slate-500 dark:text-slate-400">
          <span class="text-[10px] font-mono tabular-nums uppercase tracking-wider">Top-5 Monopoly</span>
          <span class="text-xs">🏆</span>
        </div>
        <span class="text-2xl font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400" x-text="(overview.top5_monopoly_pct || 0) + '%'">0%</span>
        <div class="w-full bg-slate-100 dark:bg-[#18181B] rounded-full h-1.5 mt-1 overflow-hidden">
          <div class="bg-amber-500 h-1.5 rounded-full transition-all duration-500" :style="'width: ' + Math.min(100, overview.top5_monopoly_pct || 0) + '%'"></div>
        </div>
      </div>

      <!-- 3. Baby Giants (< 2 Years) -->
      <div @click="setPreset(activePreset === 'baby_giants' ? 'all' : 'baby_giants')"
           class="bg-white dark:bg-[#121215] border rounded-2xl p-4 flex flex-col gap-1 shadow-sm cursor-pointer transition-all hover:border-emerald-500/50"
           :class="activePreset === 'baby_giants' ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-slate-200 dark:border-[#27272A]'">
        <div class="flex items-center justify-between text-slate-500 dark:text-slate-400">
          <span class="text-[10px] font-mono tabular-nums uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Baby Giants (&lt; 2y)</span>
          <span class="text-xs">🌱</span>
        </div>
        <span class="text-2xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400" x-text="formatNumber(overview.baby_giants_count)">0</span>
        <span class="text-[11px] text-slate-400 dark:text-slate-500">&lt; 2y with Top 10 or 1k+ saves</span>
      </div>

      <!-- 4. Multi-Account Networks -->
      <div @click="setPreset(activePreset === 'multi_account' ? 'all' : 'multi_account')"
           class="bg-white dark:bg-[#121215] border rounded-2xl p-4 flex flex-col gap-1 shadow-sm cursor-pointer transition-all hover:border-purple-500/50"
           :class="activePreset === 'multi_account' ? 'border-purple-500 ring-2 ring-purple-500/20' : 'border-slate-200 dark:border-[#27272A]'">
        <div class="flex items-center justify-between text-slate-500 dark:text-slate-400">
          <span class="text-[10px] font-mono tabular-nums uppercase tracking-wider text-purple-600 dark:text-purple-400">PBN / Multi-Acct</span>
          <span class="text-xs">🕸️</span>
        </div>
        <span class="text-2xl font-bold font-mono tabular-nums text-purple-600 dark:text-purple-400" x-text="formatNumber(overview.multi_account_count)">0</span>
        <span class="text-[11px] text-slate-400 dark:text-slate-500">&gt;= 2 accounts pushing traffic</span>
      </div>

      <!-- 5. Avg Pin-to-URL Multiplier -->
      <div @click="setPreset(activePreset === 'high_multipliers' ? 'all' : 'high_multipliers')"
           class="bg-white dark:bg-[#121215] border rounded-2xl p-4 flex flex-col gap-1 shadow-sm cursor-pointer transition-all hover:border-amber-500/50"
           :class="activePreset === 'high_multipliers' ? 'border-amber-500 ring-2 ring-amber-500/20' : 'border-slate-200 dark:border-[#27272A]'"
           title="Click to filter by High Multipliers (>= 3.0x pins/URL)">
        <div class="flex items-center justify-between text-slate-500 dark:text-slate-400">
          <span class="text-[10px] font-mono tabular-nums uppercase tracking-wider text-amber-600 dark:text-amber-400">Avg Pin / URL</span>
          <span class="text-xs">🔁</span>
        </div>
        <span class="text-2xl font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400" x-text="(overview.avg_pins_per_url || 1.0) + 'x'">1.0x</span>
        <span class="text-[11px] text-slate-400 dark:text-slate-500">Click for High Multipliers (&gt;= 3x)</span>
      </div>
    </div>

    <!-- [INVARIANT: CONSOLIDATED-NEUTRAL-CONTROL-BAR] 2-Tier Control Bar (78px height) -->
    <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl p-2.5 sm:p-3 flex flex-col gap-2.5 shadow-sm">
      <!-- Tier 1: Search, Presets & Batch Actions (~38px) -->
      <div class="flex items-center justify-between flex-wrap gap-2">
        <!-- Search Input (Left) -->
        <div class="relative w-48 sm:w-60">
          <input type="text"
                 x-model="searchQuery"
                 @input.debounce.400ms="applySearch()"
                 placeholder="Search domain (e.g. tasty)..."
                 class="w-full bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A]/80 rounded-xl pl-8 pr-7 py-1.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40">
          <span class="absolute left-2.5 top-2 text-xs text-slate-400">🔍</span>
          <button x-show="searchQuery"
                  @click="searchQuery = ''; applySearch()"
                  class="absolute right-2 top-2 text-slate-400 hover:text-slate-600 text-xs font-bold">✕</button>
        </div>

        <!-- Presets & Target Domains (Center) -->
        <div class="flex items-center gap-1.5 flex-wrap">
          <button @click="setPreset('all')"
                  class="px-2.5 py-1 rounded-xl text-xs font-medium transition-all cursor-pointer"
                  :class="activePreset === 'all' && !pinnedOnly ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-semibold shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#27272A] border border-slate-200/60 dark:border-[#27272A]'">
            All
          </button>
          <button @click="setPreset(activePreset === 'baby_giants' ? 'all' : 'baby_giants')"
                  class="px-2.5 py-1 rounded-xl text-xs font-medium transition-all cursor-pointer"
                  :class="activePreset === 'baby_giants' ? 'bg-emerald-600 text-white font-semibold shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#27272A] border border-slate-200/60 dark:border-[#27272A]'">
            <span>Baby Giants</span>
          </button>
          <button @click="setPreset(activePreset === 'easy_arbitrage' ? 'all' : 'easy_arbitrage')"
                  class="px-2.5 py-1 rounded-xl text-xs font-medium transition-all cursor-pointer"
                  :class="activePreset === 'easy_arbitrage' ? 'bg-indigo-600 text-white font-semibold shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#27272A] border border-slate-200/60 dark:border-[#27272A]'">
            <span>Easy Arb</span>
          </button>
          <button @click="setPreset(activePreset === 'bleeding_giants' ? 'all' : 'bleeding_giants')"
                  class="px-2.5 py-1 rounded-xl text-xs font-medium transition-all cursor-pointer"
                  :class="activePreset === 'bleeding_giants' ? 'bg-rose-600 text-white font-semibold shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#27272A] border border-slate-200/60 dark:border-[#27272A]'">
            <span>Bleeding</span>
          </button>
          <button @click="setPreset(activePreset === 'high_multipliers' ? 'all' : 'high_multipliers')"
                  class="px-2.5 py-1 rounded-xl text-xs font-medium transition-all cursor-pointer"
                  :class="activePreset === 'high_multipliers' ? 'bg-amber-600 text-white font-semibold shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#27272A] border border-slate-200/60 dark:border-[#27272A]'">
            <span>High Mult</span>
          </button>
          <button @click="setPreset(activePreset === 'multi_account' ? 'all' : 'multi_account')"
                  class="px-2.5 py-1 rounded-xl text-xs font-medium transition-all cursor-pointer"
                  :class="activePreset === 'multi_account' ? 'bg-purple-600 text-white font-semibold shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#27272A] border border-slate-200/60 dark:border-[#27272A]'">
            <span>Multi-Acct</span>
          </button>
          <!-- Cluster Push Signal Filter Pill -->
          <button @click="setPreset(activePreset === 'cluster_push_signal' ? 'all' : 'cluster_push_signal')"
                  class="px-2.5 py-1 rounded-xl text-xs font-medium transition-all cursor-pointer flex items-center gap-1"
                  :class="activePreset === 'cluster_push_signal' ? 'bg-amber-500 text-white font-semibold shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#27272A] border border-slate-200/60 dark:border-[#27272A]'"
                  title="Filter young domains (age <= 2y) backed by high-audience creator accounts">
            <span>⚡ Cluster Push Signal</span>
          </button>
          <!-- Target Domains Toggle -->
          <button @click="pinnedOnly = !pinnedOnly; loadDomains(true)"
                  class="px-2.5 py-1 rounded-xl text-xs font-semibold transition-all flex items-center gap-1 shadow-2xs cursor-pointer"
                  :class="pinnedOnly ? 'bg-indigo-600 text-white ring-2 ring-indigo-500/20' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#27272A] border border-slate-200/80 dark:border-[#27272A]'"
                  title="Toggle view between all ranked domains and pinned campaign targets">
            <span>Target Domains</span>
            <template x-if="pinnedDomains.size > 0">
              <span class="px-1.5 py-0.2 rounded-full text-[10px] font-mono tabular-nums bg-indigo-500/20 text-indigo-700 dark:text-indigo-300" x-text="pinnedDomains.size"></span>
            </template>
          </button>
        </div>

        <!-- Consolidated Action Group (Right) -->
        <div class="flex items-center gap-2" x-data="{ actionsOpen: false }" @click.away="actionsOpen = false">
          <!-- Actions ▾ Dropdown -->
          <div class="relative">
            <button @click="actionsOpen = !actionsOpen"
                    class="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] hover:bg-slate-50 dark:hover:bg-[#27272A]/60 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer">
              <span>Actions</span>
              <span :class="actionsOpen ? 'rotate-180' : ''" class="transition-transform duration-150 text-[10px]">▾</span>
              <template x-if="globalEnriching || globalAdsEnriching || batchEnriching || batchAdsEnriching">
                <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              </template>
            </button>

            <div x-show="actionsOpen" x-cloak
                 x-transition:enter="transition ease-out duration-100"
                 x-transition:enter-start="transform opacity-0 scale-95"
                 x-transition:enter-end="transform opacity-100 scale-100"
                 x-transition:leave="transition ease-in duration-75"
                 x-transition:leave-start="transform opacity-100 scale-100"
                 x-transition:leave-end="transform opacity-0 scale-95"
                 class="absolute right-0 mt-1.5 w-56 rounded-2xl bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] shadow-xl py-1.5 z-40 text-xs flex flex-col font-medium">
              
              <button @click="batchEnrichVisible(); actionsOpen = false"
                      :disabled="batchEnriching || globalEnriching"
                      class="px-3.5 py-2 text-left hover:bg-slate-50 dark:hover:bg-[#27272A] text-slate-700 dark:text-slate-300 disabled:opacity-40 transition-colors flex items-center justify-between cursor-pointer">
                <span>Verify Page WHOIS</span>
                <span x-show="batchEnriching" class="animate-spin text-[10px]">⏳</span>
              </button>

              <button @click="batchEnrichAdsVisible(); actionsOpen = false"
                      :disabled="batchAdsEnriching || globalAdsEnriching"
                      title="Batch Check Ads"
                      class="px-3.5 py-2 text-left hover:bg-slate-50 dark:hover:bg-[#27272A] text-slate-700 dark:text-slate-300 disabled:opacity-40 transition-colors flex items-center justify-between cursor-pointer">
                <span>Scan Page Ads.txt</span>
                <span class="sr-only">Batch Check Ads</span>
                <span x-show="batchAdsEnriching" class="animate-spin text-[10px]">⏳</span>
              </button>

              <div class="h-px bg-slate-100 dark:bg-[#18181B] my-1"></div>

              <button @click="toggleGlobalEnrichment(); actionsOpen = false"
                      title="Verify Entire Database"
                      class="px-3.5 py-2 text-left hover:bg-slate-50 dark:hover:bg-[#27272A] text-slate-700 dark:text-slate-300 transition-colors flex items-center justify-between cursor-pointer">
                <span x-text="globalEnriching ? 'Pause Auto-Age' : 'Auto-Verify Database Age'">Verify Entire Database</span>
                <span x-show="globalEnriching" class="text-[10px] text-amber-500 font-mono tabular-nums font-bold" x-text="(globalStats.percent_complete || 0) + '%'"></span>
              </button>

              <button @click="toggleGlobalAdsEnrichment(); actionsOpen = false"
                      title="Auto-Verify All Ads"
                      class="px-3.5 py-2 text-left hover:bg-slate-50 dark:hover:bg-[#27272A] text-slate-700 dark:text-slate-300 transition-colors flex items-center justify-between cursor-pointer">
                <span x-text="globalAdsEnriching ? 'Pause Auto-Ads' : 'Auto-Verify All Ads'">Auto-Verify All Ads</span>
                <span x-show="globalAdsEnriching" class="text-[10px] text-emerald-500 font-mono tabular-nums font-bold" x-text="(globalAdsStats.percent_complete || 0) + '%'"></span>
              </button>

              <div class="h-px bg-slate-100 dark:bg-[#18181B] my-1"></div>

              <button @click="downloadDomainsCsv(); actionsOpen = false"
                      class="px-3.5 py-2 text-left hover:bg-slate-50 dark:hover:bg-[#27272A] text-slate-700 dark:text-slate-300 transition-colors flex items-center justify-between cursor-pointer">
                <span>Export CSV</span>
                <span class="text-[10px] text-slate-400 font-mono tabular-nums">.csv</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Tier 2: Refined Attribute Selects & Quick Toggles (~36px) -->
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-8 gap-2 pt-2 border-t border-slate-100 dark:border-[#27272A]/80 items-center">
        <!-- 1. Ad Network -->
        <div>
          <select x-model="selectedAdNetwork"
                  @change="loadDomains(true)"
                  class="w-full bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A] rounded-lg px-2 py-1 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-sky-500 font-medium cursor-pointer">
            <option value="all">All Ads</option>
            <option value="raptive">Raptive</option>
            <option value="mediavine">Mediavine</option>
            <option value="journey">Journey</option>
            <option value="ezoic">Ezoic</option>
            <option value="hbagency">HBAgency</option>
            <option value="adsense">AdSense</option>
            <option value="affiliate_only">Affiliate Only</option>
            <option value="switched">Switched</option>
            <option value="unchecked">Unchecked</option>
          </select>
        </div>

        <!-- 2. Campaign Folder -->
        <div>
          <select x-model="selectedFolderId"
                  @change="loadDomains(true)"
                  class="w-full bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A] rounded-lg px-2 py-1 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-sky-500 font-medium cursor-pointer">
            <option value="">All Folders</option>
            <template x-for="f in folders" :key="f.id">
              <option :value="String(f.id)" :selected="String(f.id) === String(selectedFolderId)" x-text="f.name + ' (' + (f.item_count || f.keyword_count || 0) + ')'"></option>
            </template>
          </select>
        </div>

        <!-- 3. Domain Age -->
        <div>
          <select x-model="ageFilter"
                  @change="applyModularFilter()"
                  class="w-full bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A] rounded-lg px-2 py-1 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 font-medium cursor-pointer"
                  :class="ageFilter !== 'all' ? 'border-emerald-500 bg-emerald-500/5' : ''">
            <option value="all">Any Age</option>
            <option value="le_0_5">&lt;= 6m</option>
            <option value="le_1">&lt;= 1y</option>
            <option value="le_2">&lt;= 2y (Baby Giant)</option>
            <option value="le_3">&lt;= 3y</option>
            <option value="le_5">&lt;= 5y</option>
            <option value="gt_5">&gt; 5y</option>
            <option value="verified">Verified Only</option>
            <option value="unchecked">Unchecked</option>
          </select>
        </div>

        <!-- 4. SERP Rank -->
        <div>
          <select x-model="rankFilter"
                  @change="applyModularFilter()"
                  class="w-full bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A] rounded-lg px-2 py-1 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-sky-500 font-medium cursor-pointer"
                  :class="rankFilter !== 'all' ? 'border-sky-500 bg-sky-500/5' : ''">
            <option value="all">Any Rank</option>
            <option value="top3">Top 3</option>
            <option value="top5">Top 5</option>
            <option value="top10">Top 10</option>
            <option value="top20">Top 20</option>
            <option value="displaced">Displaced</option>
            <option value="bleeding">Bleeding (&gt;= 30%)</option>
          </select>
        </div>

        <!-- 5. Saves & Velocity -->
        <div>
          <select x-model="savesFilter"
                  @change="applyModularFilter()"
                  class="w-full bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A] rounded-lg px-2 py-1 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-500 font-medium cursor-pointer"
                  :class="savesFilter !== 'all' ? 'border-amber-500 bg-amber-500/5' : ''">
            <option value="all">Any Saves</option>
            <option value="ge_500">&gt;= 500</option>
            <option value="ge_1k">&gt;= 1k</option>
            <option value="ge_5k">&gt;= 5k</option>
            <option value="ge_10k">&gt;= 10k</option>
            <option value="ge_50k">&gt;= 50k</option>
            <option value="vel_5">Vel &gt;= +5/d</option>
            <option value="vel_20">Vel &gt;= +20/d</option>
          </select>
        </div>

        <!-- 6. Sort By -->
        <div>
          <select x-model="sortBy"
                  @change="loadDomains(true)"
                  class="w-full bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A] rounded-lg px-2 py-1 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-sky-500 font-mono tabular-nums cursor-pointer">
            <option value="visibility">Sort: Visibility</option>
            <option value="arbitrage_score">Sort: Arb Score</option>
            <option value="age_asc">Sort: Youngest</option>
            <option value="pins_count">Sort: Pins</option>
            <option value="saves">Sort: Saves</option>
            <option value="velocity">Sort: Velocity</option>
            <option value="avg_rank">Sort: Best Rank</option>
            <option value="multiplier">Sort: Multiplier</option>
          </select>
        </div>

        <!-- 7. Blogs Only Checkbox -->
        <div class="flex items-center justify-between px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#18181B]">
          <label for="marketplaces-toggle" class="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1 cursor-pointer">
            <span>Blogs Only</span>
          </label>
          <input id="marketplaces-toggle"
                 type="checkbox"
                 x-model="excludeMarketplaces"
                 @change="loadDomains(true)"
                 class="rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer">
        </div>

        <!-- 8. Logic Toggle & Reset -->
        <div class="flex items-center justify-between gap-1">
          <button @click="setLogicMode(logicMode === 'and' ? 'or' : 'and')"
                  type="button"
                  class="px-2 py-1 rounded-lg text-[10px] font-mono tabular-nums font-bold transition-all border"
                  :class="logicMode === 'and' ? 'bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border-sky-300 dark:border-sky-700' : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700'"
                  :title="'Logic mode: ' + logicMode.toUpperCase() + '. Click to switch.'">
            <span x-text="logicMode.toUpperCase()">AND</span>
          </button>
          <template x-if="hasActiveFilters()">
            <button @click="resetFilters()"
                    class="text-xs font-semibold text-rose-600 dark:text-rose-400 hover:underline font-mono tabular-nums">
              ✕ Reset
            </button>
          </template>
        </div>
      </div>
    </div>

    <!-- DOMAINS LEADERBOARD TABLE -->
    <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl overflow-hidden shadow-sm flex flex-col">
      <!-- Table Header Bar -->
      <div class="px-5 py-4 border-b border-slate-200 dark:border-[#27272A] flex items-center justify-between flex-wrap gap-2">
        <div class="flex items-center gap-2">
          <span class="text-base">🏆</span>
          <h2 class="text-sm font-bold text-slate-900 dark:text-white tracking-tight">Domain Authority & Monopoly Leaderboard</h2>
          <span class="text-xs text-slate-400 font-mono tabular-nums" x-text="'(' + formatNumber(totalDomains) + ' domains matching)'"></span>
        </div>
        <div class="text-xs text-slate-400 font-mono tabular-nums" x-text="'Page ' + currentPage + ' of ' + totalPages"></div>
      </div>

      <!-- Global Verification Active Banner -->
      <template x-if="globalEnriching">
        <div class="px-5 py-3 bg-gradient-to-r from-sky-500/10 via-indigo-500/10 to-emerald-500/10 border-b border-sky-500/20 flex flex-col gap-2">
          <div class="flex items-center justify-between text-xs font-mono tabular-nums flex-wrap gap-2">
            <div class="flex items-center gap-2">
              <span class="animate-spin text-sm">🚀</span>
              <span class="font-bold text-sky-800 dark:text-sky-300">Global Verification In Progress:</span>
              <span class="text-slate-600 dark:text-slate-300" x-text="formatNumber(globalStats.checked_domains) + ' / ' + formatNumber(globalStats.total_domains) + ' domains (' + (globalStats.percent_complete || 0) + '%)'"></span>
            </div>
            <div class="flex items-center gap-3">
              <span class="text-emerald-700 dark:text-emerald-400 font-bold" x-text="'🌱 ' + formatNumber(globalStats.resolved_domains) + ' resolved'"></span>
              <span class="text-amber-700 dark:text-amber-400 font-bold" x-text="'🔒 ' + formatNumber(globalStats.failed_domains) + ' shielded'"></span>
              <span class="text-slate-500 font-mono tabular-nums" x-text="'⏳ ' + formatNumber(globalStats.unchecked_domains) + ' remaining'"></span>
              <button @click="stopGlobalEnrichment()"
                      class="px-2.5 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/30 text-[11px] font-semibold transition flex items-center gap-1 shadow-sm">
                <span>⏸️</span>
                <span>Pause</span>
              </button>
            </div>
          </div>
          <!-- Animated Progress Bar -->
          <div class="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
            <div class="bg-gradient-to-r from-sky-500 via-indigo-500 to-emerald-500 h-full transition-all duration-500"
                 :style="'width: ' + (globalStats.percent_complete || 0) + '%'"></div>
          </div>
        </div>
      </template>

      <!-- Global Ads Verification Active Banner -->
      <template x-if="globalAdsEnriching">
        <div class="px-5 py-3 bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-sky-500/10 border-b border-emerald-500/20 flex flex-col gap-2">
          <div class="flex items-center justify-between text-xs font-mono tabular-nums flex-wrap gap-2">
            <div class="flex items-center gap-2">
              <span class="animate-spin text-sm">💰</span>
              <span class="font-bold text-emerald-800 dark:text-emerald-300">Automated Ads.txt Verification In Progress:</span>
              <span class="text-slate-600 dark:text-slate-300" x-text="formatNumber(globalAdsStats.checked_domains) + ' / ' + formatNumber(globalAdsStats.total_domains) + ' domains (' + (globalAdsStats.percent_complete || 0) + '%)'"></span>
            </div>
            <div class="flex items-center gap-2.5 flex-wrap">
              <span class="text-purple-600 dark:text-purple-400 font-bold" x-text="'💎 ' + formatNumber(globalAdsStats.raptive_count) + ' Raptive'"></span>
              <span class="text-rose-600 dark:text-rose-400 font-bold" x-text="'🍇 ' + formatNumber(globalAdsStats.mediavine_count) + ' Mediavine'"></span>
              <span class="text-sky-600 dark:text-sky-400 font-bold" x-text="'🚀 ' + formatNumber(globalAdsStats.journey_count) + ' Journey'"></span>
              <span class="text-emerald-600 dark:text-emerald-400 font-bold" x-text="'⚡ ' + formatNumber(globalAdsStats.hbagency_count) + ' HBAgency'"></span>
              <span class="text-amber-600 dark:text-amber-400 font-bold" x-text="'🟡 ' + formatNumber(globalAdsStats.adsense_count) + ' AdSense'"></span>
              <span class="text-slate-500 font-mono tabular-nums" x-text="'⏳ ' + formatNumber(globalAdsStats.unchecked_domains) + ' remaining'"></span>
              <button @click="stopGlobalAdsEnrichment()"
                      class="px-2.5 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/30 text-[11px] font-semibold transition flex items-center gap-1 shadow-sm">
                <span>⏸️</span>
                <span>Pause</span>
              </button>
            </div>
          </div>
          <!-- Animated Progress Bar -->
          <div class="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
            <div class="bg-gradient-to-r from-emerald-500 via-teal-500 to-sky-500 h-full transition-all duration-500"
                 :style="'width: ' + (globalAdsStats.percent_complete || 0) + '%'"></div>
          </div>
        </div>
      </template>

      <!-- Table Element -->
      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs border-collapse min-w-[1020px]">
          <thead>
            <tr class="bg-slate-50/80 dark:bg-[#09090B]/60 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-[#27272A] font-mono tabular-nums text-[11px] uppercase select-none">
              <th @click="toggleSortColumn('domain')" class="py-3 px-4 font-semibold cursor-pointer hover:text-sky-600 dark:hover:text-sky-400 transition-colors">
                # & Domain <span x-show="sortBy === 'domain_asc' || sortBy === 'domain_desc'" x-text="sortBy === 'domain_asc' ? '↑' : '↓'"></span>
              </th>
              <th class="py-3 px-4 font-semibold">Ad Network</th>
              <th @click="toggleSortColumn('pins_count')" class="py-3 px-4 font-semibold cursor-pointer hover:text-sky-600 dark:hover:text-sky-400 transition-colors">
                Pins & Multiplier <span x-show="sortBy === 'pins_count' || sortBy === 'multiplier'" x-text="'↓'"></span>
              </th>
              <th @click="toggleSortColumn('visibility')" class="py-3 px-4 font-semibold cursor-pointer hover:text-sky-600 dark:hover:text-sky-400 transition-colors">
                SERP Distribution <span x-show="sortBy === 'visibility' || sortBy === 'avg_rank'" x-text="'↓'"></span>
              </th>
              <th @click="toggleSortColumn('saves')" class="py-3 px-4 font-semibold cursor-pointer hover:text-sky-600 dark:hover:text-sky-400 transition-colors">
                Saves & Velocity <span x-show="sortBy === 'saves' || sortBy === 'velocity'" x-text="'↓'"></span>
              </th>
              <th @click="toggleSortColumn('arbitrage_score')" class="py-3 px-4 font-semibold cursor-pointer hover:text-sky-600 dark:hover:text-sky-400 transition-colors">
                Arbitrage & Accounts <span x-show="sortBy === 'arbitrage_score'" x-text="'↓'"></span>
              </th>
              <th class="py-3 px-4 text-right font-semibold sticky right-0 bg-slate-50/95 dark:bg-[#09090B]/95 backdrop-blur-xs shadow-[-6px_0_8px_-2px_rgba(0,0,0,0.06)] z-10 select-none">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800/80 text-slate-700 dark:text-slate-200">
            <!-- Loading Row -->
            <template x-if="loading">
              <tr>
                <td colspan="7" class="py-12 text-center text-slate-400 font-mono tabular-nums">
                  <div class="inline-flex items-center gap-2">
                    <span class="animate-spin text-base">⏳</span>
                    <span>Querying cross-pillar domain authority...</span>
                  </div>
                </td>
              </tr>
            </template>

            <!-- Error / Timeout Row -->
            <template x-if="!loading && loadError">
              <tr>
                <td colspan="7" class="py-12 text-center text-rose-500 font-mono tabular-nums">
                  <div class="flex flex-col items-center gap-2">
                    <span class="text-2xl">⚠️</span>
                    <span class="font-semibold text-slate-700 dark:text-slate-300" x-text="loadError"></span>
                    <button @click="loadDomains(false)" class="px-3.5 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold font-sans transition shadow-sm mt-1 flex items-center gap-1.5">
                      <span>🔄</span>
                      <span>Retry Loading</span>
                    </button>
                  </div>
                </td>
              </tr>
            </template>

            <!-- Empty Row -->
            <template x-if="!loading && !loadError && domains.length === 0">
              <tr>
                <td colspan="7" class="py-12 text-center text-slate-400">
                  <div class="flex flex-col items-center gap-2">
                    <span class="text-2xl">🔍</span>
                    <span class="font-semibold text-slate-700 dark:text-slate-300">No domains match the selected filters</span>
                    <button @click="resetFilters()" class="text-xs text-sky-600 hover:underline">Reset all filters</button>
                  </div>
                </td>
              </tr>
            </template>

            <!-- Data Rows -->
            <template x-for="(d, idx) in domains" :key="d.domain">
              <tr @click="openDossier(d.domain)"
                  class="hover:bg-slate-50 dark:hover:bg-[#27272A]/50 cursor-pointer transition-colors group">
                <!-- 1. Rank & Domain (with Age relocated to sub-line, 5 redundant badges purged) -->
                <td class="py-3 px-4">
                  <div class="flex items-center gap-2.5">
                    <span class="text-slate-400 font-mono tabular-nums text-[11px] w-6 shrink-0" x-text="((currentPage - 1) * limit) + idx + 1"></span>
                    <template x-if="d.domain && d.domain.toLowerCase() === 'uploaded by user'">
                      <span class="w-4 h-4 rounded shrink-0 bg-amber-500/10 text-amber-500 flex items-center justify-center text-[10px]" title="Direct Organic Uploads (Unlinked Pins)">✨</span>
                    </template>
                    <template x-if="!d.domain || d.domain.toLowerCase() !== 'uploaded by user'">
                      <img :src="'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(d.domain) + '&sz=32'"
                           class="w-4 h-4 rounded shrink-0 bg-slate-200 dark:bg-slate-700"
                           loading="lazy"
                           onerror="this.onerror=null; this.style.display='none'">
                    </template>
                    <div class="flex flex-col min-w-0">
                      <!-- Line 1: Domain Name + External Link -->
                      <div class="flex items-center gap-1.5 flex-wrap">
                        <span class="font-bold text-slate-900 dark:text-white truncate group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors" x-text="d.domain"></span>
                        <template x-if="!d.domain || d.domain.toLowerCase() !== 'uploaded by user'">
                          <a :href="safeUrl('https://' + d.domain)"
                             target="_blank"
                             rel="noopener noreferrer"
                             @click.stop
                             class="text-slate-400 hover:text-slate-700 dark:hover:text-white text-xs shrink-0"
                             title="Visit website in new tab">
                            ↗
                          </a>
                        </template>
                      </div>

                      <!-- Line 2: Domain Age & URL Count Sub-Line (Clean Universal Time Format) -->
                      <div class="flex items-center gap-1.5 flex-wrap text-[10px] text-slate-400 font-mono tabular-nums mt-0.5">
                        <template x-if="d.domain && d.domain.toLowerCase() === 'uploaded by user'">
                          <span class="text-amber-600 dark:text-amber-400 font-semibold">Direct Uploads • Organic Vacuum</span>
                        </template>
                        <template x-if="!d.domain || d.domain.toLowerCase() !== 'uploaded by user'">
                          <div class="flex items-center gap-1.5 flex-wrap">
                            <!-- Resolved Age with Universal Strict Formatting (>=365d: years only, <365d: days only) -->
                            <template x-if="d.age_years !== null && d.age_years !== undefined">
                              <span class="inline-flex items-center font-bold px-1.5 py-0.2 rounded"
                                    :class="{
                                      'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20': d.age_years <= 2.0,
                                      'bg-sky-500/10 text-sky-700 dark:text-sky-400 border border-sky-500/20': d.age_years > 2.0 && d.age_years <= 5.0,
                                      'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20': d.age_years > 5.0
                                    }"
                                    :title="d.domain_created_at ? 'Registered: ' + d.domain_created_at.slice(0, 10) : 'Age'">
                                <span x-text="formatDomainAge(d.age_days)"></span>
                              </span>
                            </template>

                            <!-- Privacy Shielded / Redacted -->
                            <template x-if="(d.age_years === null || d.age_years === undefined) && d.age_status === 'failed'">
                              <span class="inline-flex items-center gap-0.5 text-slate-500 dark:text-slate-400 font-medium"
                                    title="Registry Withheld / Privacy Shielded">
                                <span>Redacted / Shielded</span>
                                <button @click.stop="enrichAge(d.domain, true)"
                                        :disabled="enrichingDomains[d.domain]"
                                        class="hover:text-slate-600 dark:hover:text-slate-200 transition text-[9px] ml-0.5"
                                        title="Re-check WHOIS">
                                  <span :class="{ 'animate-spin': enrichingDomains[d.domain] }">↻</span>
                                </button>
                              </span>
                            </template>

                            <!-- Unchecked -->
                            <template x-if="(d.age_years === null || d.age_years === undefined) && d.age_status !== 'failed'">
                              <button @click.stop="enrichAge(d.domain)"
                                      :disabled="enrichingDomains[d.domain]"
                                      class="hover:text-sky-600 dark:hover:text-sky-400 underline font-medium transition"
                                      title="Check WHOIS age">
                                <span x-text="enrichingDomains[d.domain] ? 'Checking...' : 'Check WHOIS'"></span>
                              </button>
                            </template>

                            <span class="text-slate-300 dark:text-slate-600">•</span>
                            <span x-text="(d.unique_urls || 0) + ' URLs'"></span>
                          </div>
                        </template>
                      </div>
                    </div>
                  </div>
                </td>

                <!-- 3. Ad Network & Monetization -->
                <td class="py-3 px-4">
                  <template x-if="d.domain && d.domain.toLowerCase() === 'uploaded by user'">
                    <span class="inline-flex items-center gap-1 font-mono tabular-nums text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shadow-sm">
                      <span>✨</span>
                      <span>100% Organic (Unmonetized)</span>
                    </span>
                  </template>
                  <template x-if="!d.domain || d.domain.toLowerCase() !== 'uploaded by user'">
                  <div class="flex flex-col gap-1">
                    <!-- State 1: Recognized Ad Network -->
                    <template x-if="d.ad_network && d.ad_network !== 'unchecked'">
                      <div class="flex items-center gap-1.5 flex-wrap">
                        <span class="inline-flex items-center gap-1 font-mono tabular-nums text-[11px] font-bold px-2 py-0.5 rounded-md shadow-sm w-fit"
                              :class="getAdNetworkBadgeClasses(d.ad_network)"
                              :title="d.ad_manager_domain ? 'Managed by: ' + d.ad_manager_domain : 'Ad Network'">
                          <span x-text="getAdNetworkBadgeText(d.ad_network)"></span>
                        </span>

                        <!-- Switch Detection Pill -->
                        <template x-if="d.previous_ad_network">
                          <span class="px-1.5 py-0.5 rounded text-[9px] font-mono tabular-nums font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 shrink-0"
                                :title="'Migrated from ' + d.previous_ad_network + (d.ad_switched_at ? ' on ' + d.ad_switched_at.slice(0, 10) : '')"
                                x-text="'↗️ Ex-' + capitalize(d.previous_ad_network)"></span>
                        </template>

                        <!-- Force Re-check Button on hover -->
                        <button @click.stop="enrichAd(d.domain, true)"
                                :disabled="enrichingAds[d.domain]"
                                class="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-slate-200 dark:hover:bg-[#27272A] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-[10px] transition"
                                title="Re-scan ads.txt">
                          <span :class="{ 'animate-spin': enrichingAds[d.domain] }">🔄</span>
                        </button>
                      </div>
                    </template>

                    <!-- State 2: Unchecked Ad Network -->
                    <template x-if="!d.ad_network || d.ad_network === 'unchecked'">
                      <button @click.stop="enrichAd(d.domain)"
                              :disabled="enrichingAds[d.domain]"
                              class="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-slate-600 dark:text-slate-300 text-[10px] font-mono tabular-nums border border-slate-200 dark:border-[#27272A] transition flex items-center gap-1 disabled:opacity-60 shadow-sm w-fit">
                        <span :class="{ 'animate-spin': enrichingAds[d.domain] }" x-text="enrichingAds[d.domain] ? '⏳' : '💰'">💰</span>
                        <span x-text="enrichingAds[d.domain] ? 'Checking...' : 'Check Ads'">Check Ads</span>
                      </button>
                    </template>
                  </div>
                  </template>
                </td>

                <!-- 3. Pins & Multiplier -->
                <td class="py-3 px-4 font-mono tabular-nums">
                  <div class="flex flex-col gap-0.5">
                    <div class="flex items-center gap-1.5">
                      <span class="font-bold text-slate-900 dark:text-white" x-text="formatNumber(d.total_pins)"></span>
                      <span class="text-slate-400 text-[10px]">pins</span>
                    </div>
                    <span class="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.2 rounded w-fit"
                          :class="d.pins_per_url >= 3.0 ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30' : 'bg-slate-100 dark:bg-[#18181B] text-slate-600 dark:text-slate-400'">
                      <span>🔁</span>
                      <span x-text="d.pins_per_url + 'x Pins/URL'"></span>
                    </span>
                  </div>
                </td>

                <!-- 4. SERP Distribution -->
                <td class="py-3 px-4">
                  <template x-if="d.active_serp_pins > 0 || d.displaced_pins > 0">
                    <div class="flex flex-col gap-1">
                      <div class="flex items-center gap-2 text-[11px] font-mono tabular-nums">
                        <span class="text-emerald-600 dark:text-emerald-400 font-bold" title="Top 3 Pins" x-text="'🥇 ' + d.top3_pins"></span>
                        <span class="text-sky-600 dark:text-sky-400 font-bold" title="Top 10 Pins" x-text="'🎯 ' + d.top10_pins"></span>
                        <template x-if="d.displaced_pins > 0">
                          <span class="text-rose-600 dark:text-rose-400 font-bold" :title="'Displaced: ' + d.decay_rate_pct + '%'" x-text="'📉 ' + d.displaced_pins"></span>
                        </template>
                      </div>
                      <div class="text-[10px] text-slate-400 font-mono tabular-nums flex items-center gap-2">
                        <span x-text="'Avg #' + (d.avg_rank || '—')"></span>
                        <span class="text-slate-300 dark:text-slate-700">|</span>
                        <span class="text-sky-600 dark:text-sky-400 font-semibold" x-text="'Vis: ' + d.visibility_score"></span>
                      </div>
                    </div>
                  </template>
                  <template x-if="!d.active_serp_pins && !d.displaced_pins">
                    <div class="flex flex-col gap-0.5 font-mono tabular-nums">
                      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-[#18181B] text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-[#27272A] w-fit"
                            title="This domain was discovered via Competitor Profiles (P1) or PinArchive (P4) and has no tracked SERP keywords yet">
                        <span>📦</span>
                        <span>Catalog / Archive Only</span>
                      </span>
                      <span class="text-[9px] text-slate-400">No SERP keyword tracked yet</span>
                    </div>
                  </template>
                </td>

                <!-- 5. Saves & Velocity -->
                <td class="py-3 px-4 font-mono tabular-nums">
                  <div class="flex flex-col gap-0.5">
                    <div class="flex items-center gap-1">
                      <span class="font-bold text-slate-900 dark:text-white" x-text="formatNumber(d.total_saves)"></span>
                      <span class="text-slate-400 text-[10px]">saves</span>
                    </div>
                    <span class="text-[10px] text-emerald-600 dark:text-emerald-400" x-text="'+' + d.avg_velocity + '/d'"></span>
                  </div>
                </td>

                <!-- 6. Arbitrage & Accounts -->
                <td class="py-3 px-4">
                  <div class="flex flex-col gap-1">
                    <div class="flex items-center gap-1.5">
                      <span class="inline-flex items-center gap-1 text-[11px] font-mono tabular-nums font-bold px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-500/20"
                            :title="'Arbitrage Velocity / Age Score: ' + d.arbitrage_score">
                        <span>⚡</span>
                        <span x-text="d.arbitrage_score"></span>
                      </span>
                    </div>
                    <div class="flex items-center gap-1 flex-wrap">
                      <template x-for="acc in (d.sample_accounts || []).slice(0, 2)" :key="acc">
                        <span class="text-[10px] font-mono tabular-nums text-purple-600 dark:text-purple-400 bg-purple-500/10 px-1 py-0.2 rounded" x-text="'@' + acc"></span>
                      </template>
                      <template x-if="d.accounts_count > 2">
                        <span class="text-[10px] text-slate-400 font-mono tabular-nums" x-text="'+' + (d.accounts_count - 2)"></span>
                      </template>
                    </div>
                    <!-- Associated Creator Account Total Audience & Impressions Bridge [INVARIANT: CREATOR-AUDIENCE-BRIDGE] -->
                    <template x-if="d.monthly_reach || d.profile_views || d.creator_audience">
                      <div class="flex items-center gap-1.5 text-[10px] font-mono tabular-nums text-slate-500 dark:text-[#A1A1AA] pt-0.5"
                           :title="'Associated creator account Total Audience: ' + formatNumber(d.monthly_reach || d.creator_audience || 0) + ' | Impressions: ' + formatNumber(d.profile_views || d.creator_impressions || 0)">
                        <span>Aud: <span class="font-semibold text-slate-700 dark:text-slate-200" x-text="formatNumber(d.monthly_reach || d.creator_audience || 0)"></span></span>
                        <span>•</span>
                        <span>Imp: <span class="font-semibold text-slate-700 dark:text-slate-200" x-text="formatNumber(d.profile_views || d.creator_impressions || 0)"></span></span>
                      </div>
                    </template>
                  </div>
                </td>

                <!-- 7. Actions -->
                <td class="py-3 px-4 text-right sticky right-0 bg-white/95 dark:bg-[#121215]/95 backdrop-blur-xs group-hover:bg-slate-50/95 dark:group-hover:bg-slate-800/95 shadow-[-6px_0_8px_-2px_rgba(0,0,0,0.06)] z-10">
                  <div class="flex items-center justify-end gap-1.5 whitespace-nowrap">
                    <button @click.stop="togglePinDomain(d.domain)"
                            class="px-2 py-1 rounded-lg text-xs font-semibold transition flex items-center gap-1 shadow-2xs"
                            :class="pinnedDomains.has(d.domain.toLowerCase()) ? 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30' : 'bg-slate-100 hover:bg-slate-200 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-[#27272A]'"
                            :title="pinnedDomains.has(d.domain.toLowerCase()) ? 'Unpin domain from folder' : 'Pin domain to campaign folder'">
                      <span>📌</span>
                      <span x-text="pinnedDomains.has(d.domain.toLowerCase()) ? 'Pinned' : 'Pin'"></span>
                    </button>
                    <button @click.stop="openDossier(d.domain)"
                            class="px-2.5 py-1.5 rounded-lg bg-sky-50 dark:bg-sky-950/60 hover:bg-sky-100 dark:hover:bg-sky-900/60 text-sky-600 dark:text-sky-400 text-xs font-semibold transition border border-sky-200 dark:border-sky-800">
                      Dossier →
                    </button>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>

      <!-- Pagination Footer -->
      <div class="px-5 py-3.5 border-t border-slate-200 dark:border-[#27272A] flex items-center justify-between flex-wrap gap-2 text-xs text-slate-500">
        <div class="flex items-center gap-2 font-mono tabular-nums">
          <span>Showing</span>
          <span class="font-bold text-slate-900 dark:text-white" x-text="Math.min(totalDomains, ((currentPage - 1) * limit) + 1) + ' - ' + Math.min(totalDomains, currentPage * limit)"></span>
          <span>of</span>
          <span class="font-bold text-slate-900 dark:text-white" x-text="formatNumber(totalDomains)"></span>
        </div>

        <div class="flex items-center gap-2">
          <button @click="changePage(currentPage - 1)"
                  :disabled="currentPage <= 1 || loading"
                  class="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] hover:bg-slate-50 dark:hover:bg-[#27272A] text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition">
            ← Previous
          </button>
          <span class="font-mono tabular-nums text-xs text-slate-700 dark:text-slate-300 font-bold px-2" x-text="currentPage + ' / ' + totalPages"></span>
          <button @click="changePage(currentPage + 1)"
                  :disabled="currentPage >= totalPages || loading"
                  class="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] hover:bg-slate-50 dark:hover:bg-[#27272A] text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition">
            Next →
          </button>
        </div>
      </div>
    </div>
    </div>
    <!-- END DOMAIN RADAR LEADERBOARD VIEW -->
`;
}
