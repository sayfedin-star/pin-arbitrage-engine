/**
 * Campaign Folders Studio View (VIEW A) - /folders/:id
 * Enforces Sibling DOM hierarchy for Room 1 & Room 5.
 */
import { renderCampaignWorkspaceHeader } from '../campaign-workspace-header.mjs';

export function getFoldersStudioViewHtml({ activeRoom = 'crossover', safeFolderId = '' } = {}) {
  return `    <!-- ========================================================================= -->
    <!-- VIEW A: STUDIO VIEW (/folders/:id)                                       -->
    <!-- ========================================================================= -->
    <div x-show="activeFolderId" class="flex flex-col gap-6" x-cloak>

      <!-- Shared Campaign Workspace Header -->
      ${renderCampaignWorkspaceHeader({ activeRoom, folderId: safeFolderId })}

      <!-- Room 1 Content (Crossover & Super-Pins) -->
      <div x-show="currentRoom !== 'settings'" class="flex flex-col gap-6">

      <!-- Studio Action Shortcuts -->
      <div class="flex items-center justify-between flex-wrap gap-3 -mt-2 mb-1">
        <div class="flex items-center gap-2">
          <span class="text-xs font-semibold text-slate-700 dark:text-slate-300">Room 1: Crossover &amp; 24h Pulse Studio</span>
          <span class="text-xs text-slate-400 font-mono tabular-nums" x-text="'(' + (activeFolder?.items?.length || crossoverData?.summary?.total_keywords || 0) + ' keywords in cluster)'"></span>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          <button @click="scrollToSection('visual-crossover-hub')" class="px-3.5 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/40 dark:hover:bg-purple-900/50 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/80 text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer" title="Jump to Visual Annotations, 3-Tag Triplets, Guided Capsules &amp; Color Swatches">
            <span>✨</span>
            <span>Visual &amp; Intent Matrix</span>
          </button>
          <button @click="runCrossoverAnalysis(true)" :disabled="crossoverLoading" class="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer">
            <span x-show="!crossoverLoading">⚡</span>
            <span x-show="crossoverLoading" class="animate-spin inline-block">⏳</span>
            <span x-text="crossoverLoading ? 'Recalculating Matrix...' : 'Re-Run Crossover Analysis'"></span>
          </button>
          <button @click="dispatchFolderDeepAudit()" :disabled="auditDispatching" class="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer" title="Partition all cluster pins across 20 parallel GitHub runners to deep inspect authentic saves, repins & CV annotations">
            <span x-show="!auditDispatching">🚀</span>
            <span x-show="auditDispatching" class="animate-spin inline-block">⏳</span>
            <span x-text="auditDispatching ? 'Launching 20 Runners...' : 'Deep Cluster Audit (20 Runners)'"></span>
          </button>
        </div>
      </div>

      <!-- Telemetry KPIs Bar -->
      <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div class="bg-white/90 dark:bg-[#121215]/90 border border-slate-200 dark:border-[#27272A] rounded-xl p-3.5 flex flex-col gap-1 shadow-sm">
          <span class="text-[10px] font-mono tabular-nums uppercase tracking-wider text-slate-500 dark:text-slate-400">Cluster Keywords</span>
          <span class="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white" x-text="crossoverData?.summary?.total_keywords || 0">0</span>
          <span class="text-[10px] text-slate-400 dark:text-slate-500">Tracked search SERPs</span>
        </div>
        <div class="bg-white/90 dark:bg-[#121215]/90 border border-slate-200 dark:border-[#27272A] rounded-xl p-3.5 flex flex-col gap-1 shadow-sm">
          <span class="text-[10px] font-mono tabular-nums uppercase tracking-wider text-slate-500 dark:text-slate-400">Total Unique Pins</span>
          <span class="text-xl font-bold font-mono tabular-nums text-sky-600 dark:text-sky-400" x-text="formatNumber(crossoverData?.summary?.total_unique_pins || (crossoverData?.all_pins?.length || 0))">0</span>
          <span class="text-[10px] text-slate-400 dark:text-slate-500">In folder snapshots</span>
        </div>
        <div class="bg-white/90 dark:bg-[#121215]/90 border border-slate-200 dark:border-[#27272A] rounded-xl p-3.5 flex flex-col gap-1 shadow-sm">
          <span class="text-[10px] font-mono tabular-nums uppercase tracking-wider text-slate-500 dark:text-slate-400">Super-Pins (>=2 Kw)</span>
          <span class="text-xl font-bold font-mono tabular-nums text-pink-600 dark:text-pink-400" x-text="formatNumber(crossoverData?.summary?.super_pins_count || (crossoverData?.super_pins?.length || 0))">0</span>
          <span class="text-[10px] text-slate-400 dark:text-slate-500">Cross-SERP dominators</span>
        </div>
        <div class="bg-white/90 dark:bg-[#121215]/90 border border-slate-200 dark:border-[#27272A] rounded-xl p-3.5 flex flex-col gap-1 shadow-sm">
          <span class="text-[10px] font-mono tabular-nums uppercase tracking-wider text-slate-500 dark:text-slate-400">Universal Bridges</span>
          <span class="text-xl font-bold font-mono tabular-nums text-indigo-600 dark:text-indigo-400" x-text="formatNumber(crossoverData?.summary?.universal_tags_count || 0)">0</span>
          <span class="text-[10px] text-slate-400 dark:text-slate-500">Visual tags (>=50% SERPs)</span>
        </div>
        <div class="bg-white/90 dark:bg-[#121215]/90 border border-slate-200 dark:border-[#27272A] rounded-xl p-3.5 flex flex-col gap-1 shadow-sm">
          <span class="text-[10px] font-mono tabular-nums uppercase tracking-wider text-slate-500 dark:text-slate-400">Shared Pivots</span>
          <span class="text-xl font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400" x-text="formatNumber(crossoverData?.summary?.shared_pivots_count || 0)">0</span>
          <span class="text-[10px] text-slate-400 dark:text-slate-500">Guided search connectors</span>
        </div>
        <div class="bg-white/90 dark:bg-[#121215]/90 border border-slate-200 dark:border-[#27272A] rounded-xl p-3.5 flex flex-col gap-1 shadow-sm">
          <span class="text-[10px] font-mono tabular-nums uppercase tracking-wider text-slate-500 dark:text-slate-400">Monopoly Entities</span>
          <span class="text-xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400" x-text="(crossoverData?.domain_monopoly?.length || 0) + ' domains'">0</span>
          <span class="text-[10px] text-slate-400 dark:text-slate-500">Top commercial players</span>
        </div>
      </div>

      <!-- Active Drill-Down Filter Banner -->
      <div x-show="entityFilter.type" class="bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-500/30 rounded-xl p-3 flex items-center justify-between shadow-sm" x-cloak>
        <div class="flex items-center gap-2 text-xs text-indigo-900 dark:text-indigo-200">
          <span class="font-bold">🎯 Active Drill-Down Filter:</span>
          <span class="font-mono tabular-nums uppercase text-[10px] px-1.5 py-0.5 rounded bg-indigo-200/60 dark:bg-indigo-500/20 text-indigo-800 dark:text-indigo-300" x-text="entityFilter.type"></span>
          <span class="font-mono tabular-nums font-semibold text-indigo-950 dark:text-white" x-text="entityFilter.value"></span>
        </div>
        <button @click="clearEntityFilter()" class="text-xs px-2.5 py-1 rounded-lg bg-indigo-100 hover:bg-indigo-200 dark:bg-indigo-500/20 dark:hover:bg-indigo-500/30 text-indigo-700 dark:text-indigo-300 transition-colors">
          ✕ Clear Drill-Down Filter
        </button>
      </div>

      <!-- Cluster Performance & Velocity Rollup Bar Across 6 Windows [INVARIANT: CLUSTER-ROLLUP-TELEMETRY] -->
      <div class="cluster-performance-rollup bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl p-4 shadow-sm flex flex-col gap-3">
        <div class="flex items-center justify-between flex-wrap gap-3">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 flex items-center justify-center font-bold text-xs">
              ⚡
            </div>
            <div>
              <h3 class="text-xs font-bold text-slate-900 dark:text-white tracking-tight uppercase font-mono">Cluster Performance &amp; Velocity Rollup Bar</h3>
              <p class="text-[11px] text-slate-500 dark:text-slate-400">Multi-window trajectory gains and audience acceleration across cluster search terms</p>
            </div>
          </div>

          <!-- Multi-Window Selector Buttons: 24h, 5d, 7d, 10d, 15d, All -->
          <div class="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A]">
            <template x-for="win in ['24h', '5d', '7d', '10d', '15d', 'all']" :key="win">
              <button @click="selectedTimeWindow = win" 
                      class="px-2.5 py-1 rounded-lg text-xs font-mono tabular-nums font-semibold transition-colors cursor-pointer"
                      :class="selectedTimeWindow === win ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'"
                      x-text="win === 'all' ? 'All' : win">
              </button>
            </template>
          </div>
        </div>

        <!-- Rollup Cards: Winning Pins, Saves Gains, Repins Gains, Avg Daily Velocity, Competitor Gains -->
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 pt-1">
          <div class="p-3 rounded-xl bg-slate-50 dark:bg-[#18181B]/60 border border-slate-200/80 dark:border-[#27272A] flex flex-col gap-1">
            <span class="text-[10px] uppercase font-mono tabular-nums text-slate-500 dark:text-slate-400">Winning Cluster Pins</span>
            <span class="text-base font-bold font-mono tabular-nums text-rose-600 dark:text-rose-400" x-text="formatNumber(crossoverData?.summary?.super_pins_count || crossoverData?.super_pins?.length || 0)">0</span>
            <span class="text-[10px] text-slate-400">Multi-ranking dominators</span>
          </div>
          <div class="p-3 rounded-xl bg-slate-50 dark:bg-[#18181B]/60 border border-slate-200/80 dark:border-[#27272A] flex flex-col gap-1">
            <span class="text-[10px] uppercase font-mono tabular-nums text-slate-500 dark:text-slate-400" x-text="'Saves Gains (' + selectedTimeWindow + ')'">Saves Gains</span>
            <span class="text-base font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400" x-text="'+' + formatNumber(clusterWindowSavesGains)">+0</span>
            <span class="text-[10px] text-slate-400">Cluster net saves gain</span>
          </div>
          <div class="p-3 rounded-xl bg-slate-50 dark:bg-[#18181B]/60 border border-slate-200/80 dark:border-[#27272A] flex flex-col gap-1">
            <span class="text-[10px] uppercase font-mono tabular-nums text-slate-500 dark:text-slate-400" x-text="'Repins Gains (' + selectedTimeWindow + ')'">Repins Gains</span>
            <span class="text-base font-bold font-mono tabular-nums text-sky-600 dark:text-sky-400" x-text="'+' + formatNumber(clusterWindowRepinsGains)">+0</span>
            <span class="text-[10px] text-slate-400">Cluster shared repins</span>
          </div>
          <div class="p-3 rounded-xl bg-slate-50 dark:bg-[#18181B]/60 border border-slate-200/80 dark:border-[#27272A] flex flex-col gap-1">
            <span class="text-[10px] uppercase font-mono tabular-nums text-slate-500 dark:text-slate-400">Avg Daily Velocity</span>
            <span class="text-base font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400" x-text="'+' + clusterAvgVelocity + '/d'">+0/d</span>
            <span class="text-[10px] text-slate-400">Per-pin daily momentum</span>
          </div>
          <div class="p-3 rounded-xl bg-slate-50 dark:bg-[#18181B]/60 border border-slate-200/80 dark:border-[#27272A] flex flex-col gap-1 col-span-2 sm:col-span-1">
            <span class="text-[10px] uppercase font-mono tabular-nums text-slate-500 dark:text-slate-400" x-text="'Competitor Gains (' + selectedTimeWindow + ')'">Competitor Gains</span>
            <span class="text-base font-bold font-mono tabular-nums text-indigo-600 dark:text-indigo-400" x-text="'+' + formatNumber(clusterCompetitorAudienceGains)">+0</span>
            <span class="text-[10px] text-slate-400">Audience &amp; reach expansion</span>
          </div>
        </div>
      </div>

      <!-- SECTION 1: Full Pins Table (Paginated 1,788 Unique Pins / Super-Pins) -->
      <div id="pins-table-section" class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl overflow-hidden shadow-sm dark:shadow-xl flex flex-col transition-colors">
        
        <!-- Table Title & Meta Bar -->
        <div class="p-4 border-b border-slate-200 dark:border-[#27272A] flex items-center justify-between flex-wrap gap-3">
          <div class="flex items-center gap-2">
            <span class="text-base" x-text="scopeFilter === 'super_only' ? '⭐' : (scopeFilter === 'active_only' ? '🟢' : (scopeFilter === 'vault_only' ? '🟣' : '📌'))">📌</span>
            <h3 class="text-sm font-semibold text-slate-900 dark:text-white tracking-tight" 
                x-text="scopeFilter === 'super_only' ? 'Multi-Ranking Super-Pins (Cross-SERP Dominators)' : (scopeFilter === 'active_only' ? 'Active SERP Dominators (Live Ranking Pins)' : (scopeFilter === 'vault_only' ? 'Displaced Vault Movers (Organic Cluster Pins)' : (scopeFilter === 'all' ? 'All Cluster Pins (Full Snapshot Dataset)' : 'Pins ranking for: ' + scopeFilter)))"></h3>
            <span class="text-xs text-slate-500 dark:text-slate-400" 
                  x-text="scopeFilter === 'super_only' ? '(Pins ranking across >= 2 cluster search terms)' : (scopeFilter === 'active_only' ? '(Pins actively ranking in live SERPs)' : (scopeFilter === 'vault_only' ? '(High-signal displaced organic pins in vault)' : '(Every verified pin across cluster search snapshots)'))"></span>
          </div>
          <div class="flex items-center gap-3">
            <span class="text-xs font-mono tabular-nums text-indigo-600 dark:text-indigo-400 font-bold" x-text="formatNumber(filteredPinsList().length) + ' pins matching'"></span>
            <span class="text-xs text-slate-300 dark:text-slate-600">|</span>
            <span class="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums" x-text="'Page ' + currentPage + ' of ' + totalPages()"></span>
          </div>
        </div>

        <!-- Integrated Toolbar: Scope Switcher, Sorter & Search Filter Bar -->
        <div class="p-3.5 bg-slate-50/80 dark:bg-slate-950/60 border-b border-slate-200 dark:border-[#27272A] flex items-center justify-between flex-wrap gap-3">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-xs font-medium text-slate-500 dark:text-slate-400 mr-1">Scope:</span>
            <button @click="scopeFilter = 'all'; currentPage = 1" 
                    class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                    :class="scopeFilter === 'all' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white dark:bg-[#18181B] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#27272A] border border-slate-200 dark:border-[#27272A]'">
              All Cluster Pins (<span x-text="formatNumber(crossoverData?.summary?.total_unique_pins || (crossoverData?.all_pins?.length || 0))"></span>)
            </button>
            <button @click="scopeFilter = 'active_only'; currentPage = 1" 
                    class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
                    :title="crossoverData?.summary?.active_serp_slots_count ? ('Unique active SERP pins (' + formatNumber(crossoverData.summary.active_serp_slots_count) + ' ranked slots)') : 'Unique active SERP pins'"
                    :class="scopeFilter === 'active_only' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-white dark:bg-[#18181B] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#27272A] border border-slate-200 dark:border-[#27272A]'">
              <span>🟢</span> Active SERP (<span x-text="formatNumber(crossoverData?.summary?.active_pins_count || (crossoverData?.all_pins?.filter(p => p.has_active_rank)?.length || 0))"></span>)
            </button>
            <button @click="scopeFilter = 'vault_only'; currentPage = 1" 
                    class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
                    :class="scopeFilter === 'vault_only' ? 'bg-purple-600 text-white shadow-sm' : 'bg-white dark:bg-[#18181B] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#27272A] border border-slate-200 dark:border-[#27272A]'">
              <span>🟣</span> Vault Movers (<span x-text="formatNumber(crossoverData?.summary?.vault_pins_count || (crossoverData?.all_pins?.filter(p => !p.has_active_rank && p.has_vault_rank)?.length || 0))"></span>)
            </button>
            <button @click="scopeFilter = 'super_only'; currentPage = 1" 
                    class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
                    :class="scopeFilter === 'super_only' ? 'bg-pink-600 text-white shadow-sm' : 'bg-white dark:bg-[#18181B] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#27272A] border border-slate-200 dark:border-[#27272A]'">
              <span>⭐</span> Super-Pins Only (<span x-text="formatNumber(crossoverData?.summary?.super_pins_count || (crossoverData?.super_pins?.length || 0))"></span>)
            </button>
            <button type="button" @click="onlySurging24h = !onlySurging24h; currentPage = 1" :class="onlySurging24h ? 'bg-rose-600 text-white border-rose-500 shadow-xs' : 'bg-white dark:bg-[#18181B] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-[#27272A] hover:bg-slate-100 dark:hover:bg-[#27272A]'" class="px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-all flex items-center gap-1.5 cursor-pointer"><span>⚡</span><span>24h Surges</span><span class="px-1.5 py-0.2 text-[10px] font-mono tabular-nums rounded-full bg-rose-500/20 text-rose-600 dark:text-rose-300" x-text="formatNumber(crossoverData?.summary?.surging_24h_count || 0)"></span></button>
            <button type="button" @click="onlyFreshRockets = !onlyFreshRockets; currentPage = 1" :class="onlyFreshRockets ? 'bg-amber-600 text-white border-amber-500 shadow-xs' : 'bg-white dark:bg-[#18181B] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-[#27272A] hover:bg-slate-100 dark:hover:bg-[#27272A]'" class="px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-all flex items-center gap-1.5 cursor-pointer"><span>🚀</span><span>Rockets (≤14d)</span><span class="px-1.5 py-0.2 text-[10px] font-mono tabular-nums rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-300" x-text="formatNumber(crossoverData?.summary?.rockets_count || 0)"></span></button>
            <button type="button" @click="onlyBreakoutBabyDomains = !onlyBreakoutBabyDomains; currentPage = 1" :class="onlyBreakoutBabyDomains ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-zinc-800/60 text-zinc-400 border-zinc-700/50 hover:bg-zinc-800'" class="px-2.5 py-1 text-xs font-medium rounded-lg border transition-all flex items-center gap-1.5 cursor-pointer"><span>🐣</span><span>Breakout Baby Domains (<2y + 7d Gains)</span></button>
            <button type="button" @click="onlyVacuumPins = !onlyVacuumPins; currentPage = 1" :class="onlyVacuumPins ? 'bg-rose-500/20 text-rose-300 border-rose-500/40' : 'bg-zinc-800/60 text-zinc-400 border-zinc-700/50 hover:bg-zinc-800'" class="px-2.5 py-1 text-xs font-medium rounded-lg border transition-all flex items-center gap-1.5 cursor-pointer"><span>🎯</span><span>Linkless Vacuums</span><span x-show="crossoverData?.summary?.vacuum_pins_count" class="px-1.5 py-0.2 text-[10px] rounded-full bg-rose-500/30 text-rose-200" x-text="crossoverData?.summary?.vacuum_pins_count"></span></button>
            <template x-if="activeFolder?.items?.length">
              <select x-model="scopeFilter" @change="currentPage = 1" class="bg-white dark:bg-[#18181B] text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-[#27272A] rounded-lg text-xs py-1.5 px-2.5 font-mono tabular-nums shadow-sm">
                <option value="all">Filter by Keyword (All)</option>
                <template x-for="item in activeFolder.items" :key="item.keyword">
                  <option :value="item.keyword" x-text="item.keyword"></option>
                </template>
              </select>
            </template>
          </div>

          <div class="flex items-center gap-3 flex-wrap">
            <!-- Sort Dropdown -->
            <div class="flex items-center gap-1.5 text-xs">
              <span class="text-slate-500 dark:text-slate-400">Sort:</span>
              <select x-model="sortBy" @change="currentPage = 1" class="bg-white dark:bg-[#18181B] text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-[#27272A] rounded-lg text-xs py-1.5 px-2.5 font-mono tabular-nums shadow-sm">
                <option value="velocity_desc">Daily Velocity (Fastest)</option>
                <option value="repins_24h_desc">24h Repins Surge (Highest)</option>
                <option value="saves_desc">Total Saves (High → Low)</option>
                <option value="saves_asc">Total Saves (Low → High)</option>
                <option value="pin_age_asc">Pin Age (Youngest First)</option>
                <option value="pin_age_desc">Pin Age (Oldest First)</option>
                <option value="folder_age_desc">Days in Folder (Longest)</option>
                <option value="folder_age_asc">Days in Folder (Recent)</option>
                <option value="rank_asc">Best Rank (#1 First)</option>
                <option value="overlap_desc">Cross-SERP Overlap (Most)</option>
                <option value="title_asc">Title (A → Z)</option>
              </select>
            </div>

            <!-- Search Filter -->
            <div class="relative">
              <input type="text" x-model.debounce.150ms="searchQuery" @input="currentPage = 1" placeholder="Filter pins by title, domain, or tag..."
                     class="w-64 pl-8 pr-3 py-1.5 bg-white dark:bg-slate-950 border border-slate-300 dark:border-[#27272A] rounded-lg text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 font-sans focus:outline-none focus:border-indigo-500 shadow-sm">
              <span class="absolute left-2.5 top-1.5 text-slate-400 text-xs">🔍</span>
            </div>
            
             <a href="#visual-crossover-hub" @click.prevent="scrollToSection('visual-crossover-hub')" class="text-xs font-semibold text-purple-600 dark:text-purple-400 hover:text-purple-500 transition-colors flex items-center gap-1 ml-1" title="Jump to Visual Annotations & Power Pairs">
               <span>✨ Visual Hub ↓</span>
             </a>
           </div>
         </div>

         <!-- Active Structural Pattern / Entity Filter Bar -->
         <div x-show="activeMatrixFilter || entityFilter.type" x-cloak class="px-4 py-2.5 bg-purple-500/10 dark:bg-purple-950/40 border-b border-purple-500/20 flex items-center justify-between flex-wrap gap-2 text-xs font-mono tabular-nums">
           <div class="flex items-center gap-2 flex-wrap">
             <template x-if="activeMatrixFilter">
               <div class="flex items-center gap-2">
                 <span class="px-2 py-0.5 rounded bg-purple-600 text-white text-[10px] font-bold uppercase" x-text="activeMatrixFilter.badge || 'Matrix Pattern'"></span>
                 <span class="font-bold text-purple-900 dark:text-purple-200" x-text="activeMatrixFilter.label"></span>
                 <span class="text-purple-600 dark:text-purple-400 text-[11px]" x-text="'(' + formatNumber(filteredPinsList().length) + ' matching pins)'"></span>
               </div>
             </template>
             <template x-if="entityFilter.type">
               <div class="flex items-center gap-2">
                 <span class="px-2 py-0.5 rounded bg-indigo-600 text-white text-[10px] font-bold uppercase" x-text="entityFilter.type"></span>
                 <span class="font-bold text-indigo-900 dark:text-indigo-200" x-text="entityFilter.value"></span>
               </div>
             </template>
           </div>
           <div class="flex items-center gap-2">
             <template x-if="activeMatrixFilter">
               <button type="button" @click="clearMatrixFilter()" class="px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-600 dark:text-rose-300 font-bold transition cursor-pointer flex items-center gap-1">
                 <span>✕</span>
                 <span>Clear Pattern Filter</span>
               </button>
             </template>
             <template x-if="entityFilter.type">
               <button type="button" @click="clearEntityFilter()" class="px-2.5 py-1 rounded-lg bg-slate-200 hover:bg-slate-300 dark:bg-[#27272A] text-slate-700 dark:text-slate-200 font-bold transition cursor-pointer flex items-center gap-1">
                 <span>✕</span>
                 <span>Clear Entity</span>
               </button>
             </template>
           </div>
         </div>

         <div class="overflow-x-auto">
           <table class="w-full text-left text-xs font-mono tabular-nums">
             <thead class="bg-slate-50 dark:bg-slate-950/80 border-b border-slate-200 dark:border-[#27272A] text-slate-500 dark:text-slate-400 uppercase text-[10px]">
               <tr>
                 <th class="p-3.5 w-12 text-center">#</th>
                 <th class="p-3.5">Pin Image & Dossier</th>
                 <th class="p-3.5">Cross-SERP Overlap & Ranks</th>
                 <th class="p-3.5">Domain & Creator</th>
                 <th class="p-3.5 cursor-pointer hover:text-indigo-600 dark:hover:text-white transition-colors" @click="toggleSort('pin_age')">
                   Pin Age &amp; Tenure <span x-text="sortBy === 'pin_age_asc' ? '↑' : (sortBy === 'pin_age_desc' ? '↓' : '↕')"></span>
                 </th>
                 <th class="p-3.5 cursor-pointer hover:text-indigo-600 dark:hover:text-white transition-colors" @click="toggleSort('saves')">
                   Total Saves <span x-text="sortBy === 'saves_desc' ? '↓' : (sortBy === 'saves_asc' ? '↑' : '↕')"></span>
                 </th>
                 <th class="p-3.5 cursor-pointer hover:text-indigo-600 dark:hover:text-white transition-colors" @click="toggleSort('velocity')">
                   Daily Velocity <span x-text="sortBy === 'velocity_desc' ? '↓' : '↕'"></span>
                 </th>
                 <th class="p-3.5 text-right">Actions</th>
               </tr>
             </thead>
             <tbody class="divide-y divide-slate-200 dark:divide-slate-800/60 text-slate-700 dark:text-slate-300">
               <template x-for="(sp, idx) in paginatedPins()" :key="sp.pin_id">
                 <tr :data-pin-id="sp.pin_id" class="hover:bg-slate-50 dark:hover:bg-[#27272A]/40 transition-colors">
                   <td class="p-3.5 text-center font-mono tabular-nums text-slate-400 dark:text-slate-500 text-[11px]" x-text="(currentPage - 1) * pageSize + idx + 1"></td>
                   <td class="p-3.5">
                     <div class="flex items-center gap-3">
                       <a :href="'/pins/' + sp.pin_id + '?folder_id=' + encodeURIComponent(activeFolder?.id || activeFolderId || '') + '&folder=' + encodeURIComponent(activeFolder?.name || '') + '&return_url=' + encodeURIComponent('/folders/' + (activeFolder?.id || activeFolderId || ''))" class="w-10 h-14 rounded bg-slate-100 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A] overflow-hidden flex-shrink-0 block hover:ring-2 hover:ring-indigo-500 transition">
                         <img :src="sp.image_url || 'data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2260%22 height=%2290%22 viewBox=%220 0 60 90%22><rect width=%2260%22 height=%2290%22 rx=%224%22 fill=%22%2318181b%22/><text x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%2352525b%22 font-family=%22monospace%22 font-size=%2210%22>PIN</text></svg>'" 
                              class="w-full h-full object-cover"
                              loading="lazy"
                              onerror="window.handlePinImgError(this)">
                       </a>
                       <div class="flex flex-col gap-1 max-w-xs">
                         <!-- // [INVARIANT-LOCK: DO NOT REMOVE - ENFORCED BY verify_regression_locks.mjs] Lock 5: Context-Preserving Pin Navigation -->
                         <a :href="'/pins/' + sp.pin_id + '?folder_id=' + encodeURIComponent(activeFolder?.id || activeFolderId || '') + '&folder=' + encodeURIComponent(activeFolder?.name || '') + '&return_url=' + encodeURIComponent('/folders/' + (activeFolder?.id || activeFolderId || ''))" 
                            class="font-semibold text-slate-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors truncate block" 
                            x-text="sp.title || ('Pin #' + sp.pin_id)"></a>
                         <div class="flex items-center gap-1.5 flex-wrap">
                           <span class="text-[9px] font-mono tabular-nums px-1 py-0.2 rounded bg-slate-100 dark:bg-[#18181B] text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-[#27272A]" 
                                 x-text="sp.format || 'ORGANIC PIN'"></span>
                           <span class="text-[9px] font-mono tabular-nums text-slate-500" x-text="sp.aspect_ratio || '2:3'"></span>
                           <!-- Breakout Baby Domain Badge -->
                           <template x-if="(Number(sp.domain_age_days || (sp.domain_age_years ? sp.domain_age_years * 365 : 0)) > 0) && (Number(sp.domain_age_days || (sp.domain_age_years ? sp.domain_age_years * 365 : 0)) <= 730) && (Number(sp.gains_7d || (sp.daily_save_velocity ? sp.daily_save_velocity * 7 : 0)) >= 15)">
                             <span class="text-[9px] font-mono tabular-nums px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 font-semibold"
                                   title="Breakout Baby Domain (<2y + 7d Gains >= 15)">
                               🐣 Baby Breakout
                             </span>
                           </template>
                           <!-- Linkless Vacuum Pin Badge -->
                           <template x-if="sp.is_vacuum_pin || ((!sp.domain || sp.domain === 'Uploaded by user') && Number(sp.save_count || 0) >= 100)">
                             <span class="text-[9px] font-mono tabular-nums px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 font-semibold"
                                   title="Linkless SERP Vacuum (High Saves, No Outbound Domain)">
                               🎯 Vacuum
                             </span>
                           </template>
                         </div>

                         <!-- Pinterest Computer Vision Visual Annotations -->
                         <div class="flex items-center gap-1 flex-wrap pt-1" x-show="sp.visual_annotations?.length">
                           <template x-for="va in (sp.visual_annotations || []).slice(0, 3)" :key="typeof va === 'object' && va !== null ? (va.name || va.tag || va.label || va.term || '') : va">
                             <button @click="applyMatrixFilter({ tag: (typeof va === 'object' && va !== null ? (va.name || va.tag || va.label || va.term || '') : va), raw_tag: (typeof va === 'object' && va !== null ? (va.name || va.tag || va.label || va.term || '') : va) }, 'anchors')" 
                                     class="text-[9px] font-mono tabular-nums px-1.5 py-0.5 rounded bg-indigo-50/80 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/60 transition-colors truncate max-w-[130px] text-left cursor-pointer" 
                                     :title="'Filter cluster pins by visual tag: ' + (typeof va === 'object' && va !== null ? (va.name || va.tag || va.label || va.term || '') : va)"
                                     x-text="'👁️ ' + (typeof va === 'object' && va !== null ? (va.name || va.tag || va.label || va.term || '') : va)"></button>
                           </template>
                           <span x-show="sp.visual_annotations?.length > 3" 
                                 class="text-[9px] font-mono tabular-nums text-slate-400 dark:text-slate-500 cursor-help"
                                 :title="(sp.visual_annotations || []).slice(3).map(tag => typeof tag === 'object' && tag !== null ? (tag.name || tag.tag || tag.label || tag.term || '') : tag).join(', ')"
                                 x-text="'+' + (sp.visual_annotations.length - 3) + ' more'"></span>
                         </div>
                       </div>
                     </div>
                   </td>

                   <td class="p-3.5">
                     <div class="flex flex-col gap-1.5">
                       <div class="flex items-center gap-1.5 flex-wrap">
                         <template x-for="rk in (expandedPinRanks[sp.pin_id] ? getSortedPinRankings(sp) : getSortedPinRankings(sp).slice(0, 4))" :key="rk.keyword_id || rk.keyword">
                           <span class="px-2 py-0.5 rounded text-[10px] font-mono tabular-nums border flex items-center gap-1"
                                 :class="rk.is_displaced
                                   ? 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30'
                                   : rk.rank_position <= 3 
                                   ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30' 
                                   : rk.rank_position <= 10 
                                   ? 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/30' 
                                   : 'bg-slate-100 dark:bg-[#18181B] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-[#27272A]'">
                             <span x-show="rk.is_displaced" class="text-[9px]">🟣</span>
                             <span x-text="rk.keyword"></span>
                             <span class="font-bold" x-text="'#' + rk.rank_position"></span>
                             <span x-show="rk.is_displaced" class="text-[9px] font-normal opacity-80">(Vault)</span>
                           </span>
                         </template>
                         <template x-if="(sp.rankings || []).length > 4">
                           <button type="button"
                                   @click="expandedPinRanks[sp.pin_id] = !expandedPinRanks[sp.pin_id]"
                                   class="px-2 py-0.5 rounded text-[10px] font-mono tabular-nums font-bold bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30 transition cursor-pointer"
                                   x-text="expandedPinRanks[sp.pin_id] ? 'Show less ↑' : ('+' + ((sp.rankings || []).length - 4) + ' more keywords')"></button>
                         </template>
                       </div>
                       <div class="flex items-center gap-2 flex-wrap">
                         <span class="text-[10px] text-slate-500 dark:text-slate-400" x-text="'Ranks in ' + sp.overlap_count + ' keyword' + (sp.overlap_count > 1 ? 's' : '') + ' (' + sp.overlap_percentage + '% coverage)'"></span>
                         <template x-if="sp.bridge_tags && sp.bridge_tags.length">
                           <span class="text-[9px] font-mono tabular-nums px-1.5 py-0.2 rounded bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 font-semibold"
                                 :title="'Universal Bridge Tags: ' + sp.bridge_tags.join(', ')"
                                 x-text="'🌉 ' + sp.bridge_tags.length + ' Bridges'"></span>
                         </template>
                       </div>
                     </div>
                   </td>

                   <td class="p-3.5 font-sans">
                     <div class="flex flex-col gap-0.5">
                       <button @click="setEntityFilter('domain', sp.domain)" 
                               class="text-xs font-semibold text-slate-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 text-left transition-colors truncate max-w-[140px]" 
                               x-text="sp.domain || 'direct'"></button>
                       <div class="flex items-center gap-1.5">
                         <button @click="setEntityFilter('creator', sp.creator_username)" 
                                 class="text-[11px] text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 text-left transition-colors truncate max-w-[120px]" 
                                 x-text="'@' + (sp.creator_username || 'anonymous')"></button>
                         <template x-if="sp.creator_username">
                           <button @click.stop="openCreatorVisualFeed(sp.creator_username)"
                                   class="p-0.5 rounded text-slate-400 hover:text-emerald-500 hover:bg-emerald-500/10 transition"
                                   title="⚡ Instant 50-Pin Visual Feed (<350ms)">
                             <i data-lucide="layout-grid" class="w-3 h-3 text-emerald-500"></i>
                           </button>
                         </template>
                       </div>
                     </div>
                   </td>

                   <td class="p-3.5 font-mono tabular-nums">
                     <div class="flex flex-col gap-1">
                       <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-[#18181B] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#27272A] inline-flex items-center gap-1 w-fit"
                             :title="'Created on Pinterest: ' + (sp.created_at_pinterest || 'N/A') + ' (' + (sp.pin_age_days != null ? sp.pin_age_days + ' days' : 'unknown') + ')'">
                         <span>⏳</span>
                         <span x-text="formatUniversalAge(sp.pin_age_days)"></span>
                       </span>
                       <template x-if="sp.folder_age_days != null">
                         <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 inline-flex items-center gap-1 w-fit"
                               :title="'Added to folder: ' + sp.folder_age_days + ' days ago'">
                           <span>📁</span>
                           <span x-text="sp.folder_age_days + 'd in folder'"></span>
                         </span>
                       </template>
                     </div>
                   </td>

                   <td class="p-3.5 font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400" x-text="formatNumber(sp.save_count)"></td>
                   <td class="p-3.5 font-mono tabular-nums text-amber-600 dark:text-amber-400">
                     <div class="flex flex-col gap-0.5">
                       <span class="font-bold" x-text="'+' + formatNumber(sp.effective_velocity ?? sp.daily_save_velocity ?? 0) + '/d'"></span>
                       <template x-if="(sp.delta_repins_24h || 0) > 0">
                         <span class="text-[10px] text-sky-500 dark:text-sky-400 font-semibold" x-text="'+' + formatNumber(sp.delta_repins_24h) + ' repins (24h)'"></span>
                       </template>
                       <template x-if="sp.gains_7d != null">
                         <span class="text-[9px] text-slate-400" x-text="'+' + formatNumber(sp.gains_7d) + ' (7d)'"></span>
                       </template>
                     </div>
                   </td>

                   <td class="p-3.5 text-right font-sans">
                     <div class="flex items-center justify-end gap-1.5">
                       <button type="button" @click="copyPinBlueprint(sp)" class="px-2 py-1 rounded-lg bg-rose-50 hover:bg-rose-600 hover:text-white dark:bg-rose-950/40 dark:hover:bg-rose-600 text-rose-700 dark:text-rose-300 text-xs font-semibold border border-rose-200 dark:border-rose-800/80 transition-colors inline-flex items-center gap-1 cursor-pointer shadow-2xs" title="Copy Scientific Pin Blueprint">
                         <span>⚡</span>
                         <span>Blueprint</span>
                       </button>
                       <a :href="'/pins/' + sp.pin_id + '?folder_id=' + encodeURIComponent(activeFolder?.id || activeFolderId || '') + '&folder=' + encodeURIComponent(activeFolder?.name || '') + '&return_url=' + encodeURIComponent('/folders/' + (activeFolder?.id || activeFolderId || ''))" class="px-2 py-1 rounded-lg bg-slate-100 dark:bg-[#18181B] hover:bg-indigo-600 hover:text-white dark:hover:bg-indigo-600 text-slate-700 dark:text-slate-300 text-xs font-semibold border border-slate-200 dark:border-[#27272A] transition-colors inline-flex items-center gap-1 shadow-2xs" title="Open Full Pin Dossier">
                         <span>↗</span>
                       </a>
                     </div>
                   </td>
                 </tr>
               </template>

              <tr x-show="crossoverLoading">
                <td colspan="8" class="p-10 text-center text-slate-500 font-sans">
                  <div class="flex items-center justify-center gap-2.5">
                    <span class="animate-spin inline-block text-indigo-500 text-lg">⏳</span>
                    <span class="font-medium text-slate-600 dark:text-slate-300">Loading cluster snapshots and computing crossover matrix...</span>
                  </div>
                </td>
              </tr>

              <tr x-show="!crossoverLoading && !filteredPinsList().length">
                <td colspan="8" class="p-8 text-center text-slate-500 font-sans">
                  No pins found matching your current filter settings.
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Table Pagination Footer -->
        <div class="flex items-center justify-between p-3 border-t border-slate-200 dark:border-[#27272A] bg-slate-50/60 dark:bg-slate-950/40 text-xs font-mono tabular-nums" x-show="filteredPinsList().length > 0">
          <div class="flex items-center gap-2.5">
            <span class="text-slate-500 dark:text-slate-400 hidden sm:inline" 
                  x-text="'Showing ' + (filteredPinsList().length ? ((currentPage - 1) * pageSize + 1) : 0) + '–' + Math.min(currentPage * pageSize, filteredPinsList().length) + ' of ' + formatNumber(filteredPinsList().length) + ' pins'"></span>
            <div class="flex items-center gap-1 text-[11px] text-slate-400">
              <span>Density:</span>
              <select 
                x-model.number="pageSize" 
                @change="currentPage = 1"
                class="py-0.5 px-1.5 rounded border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] font-mono tabular-nums text-[11px] focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-900 dark:text-white cursor-pointer"
              >
                <option :value="10">10 / page</option>
                <option :value="25">25 / page</option>
                <option :value="50">50 / page</option>
                <option :value="100">100 / page</option>
              </select>
            </div>
          </div>
          <div class="flex items-center gap-1.5 ml-auto sm:ml-0">
            <button 
              :disabled="currentPage <= 1" 
              @click="currentPage = Math.max(1, (parseInt(currentPage, 10) || 1) - 1); scrollToSection('pins-table-section')" 
              class="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] disabled:opacity-40 cursor-pointer hover:bg-slate-50 dark:hover:bg-[#27272A] transition-colors shadow-2xs">
              ← Prev
            </button>
            <div class="flex items-center gap-1 text-slate-500 dark:text-slate-400">
              <span>Page</span>
              <input 
                type="number" 
                min="1" 
                :max="totalPages()" 
                x-model.number="currentPage" 
                @change="currentPage = Math.max(1, Math.min(totalPages(), parseInt(currentPage, 10) || 1)); scrollToSection('pins-table-section')"
                class="w-12 text-center py-0.5 px-1 rounded border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] font-mono tabular-nums text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-900 dark:text-white" 
              />
              <span x-text="'/ ' + totalPages()"></span>
            </div>
            <button 
              :disabled="currentPage >= totalPages()" 
              @click="currentPage = Math.min(totalPages(), (parseInt(currentPage, 10) || 1) + 1); scrollToSection('pins-table-section')" 
              class="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] disabled:opacity-40 cursor-pointer hover:bg-slate-50 dark:hover:bg-[#27272A] transition-colors shadow-2xs">
              Next →
            </button>
          </div>
        </div>
      </div>

      <!-- SECTION 2: VISUAL ANNOTATIONS, INTENT MATRIX & COLOR STUDIO (Cluster-Scoped Mirror of /pulse Master-Detail Split View) -->
      <div id="visual-crossover-hub" class="p-6 rounded-3xl bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] space-y-5 shadow-sm dark:shadow-xl transition-colors shared-annotations-hub">
        <!-- Hub Header -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-[#27272A]">
          <div class="flex items-center space-x-3">
            <div class="w-10 h-10 rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center text-lg font-bold">
              ✨
            </div>
            <div>
              <div class="flex items-center space-x-2 flex-wrap gap-y-1">
                <h3 class="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">Visual Annotations, Intent Matrix &amp; Color Studio</h3>
                <span class="px-2.5 py-0.5 rounded-full text-[10px] font-mono tabular-nums font-bold bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30"
                      x-text="powerPairs.length + ' Pairs • ' + powerTriplets.length + ' Triplets • ' + coreAnchorsList.length + ' Bridges'"></span>
              </div>
              <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Click any N-gram pair, triplet, visual bridge, guided search capsule, or color swatch on the left to inspect its surging cluster pins on the right.</p>
            </div>
          </div>

          <div class="flex items-center gap-2 flex-wrap">
            <template x-if="activeMatrixFilter">
              <button type="button" @click="clearMatrixFilter()" class="px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-500/15 text-rose-600 dark:text-rose-400 hover:bg-rose-500/25 transition flex items-center space-x-1.5 cursor-pointer">
                <span>✕</span>
                <span x-text="'Clear Table Filter: ' + activeMatrixFilter.label"></span>
              </button>
            </template>
            <button type="button" @click="copyAnnotations()" class="px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 transition flex items-center gap-1.5 cursor-pointer">
              <span>📋</span>
              <span>Copy All Annotations</span>
            </button>
          </div>
        </div>

        <!-- Unified 5-Tab Matrix Navigation Bar -->
        <div class="flex items-center justify-between gap-3 flex-wrap p-2 rounded-2xl bg-slate-50 dark:bg-[#18181B]/70 border border-slate-200 dark:border-[#27272A] text-xs font-mono tabular-nums">
          <div class="flex items-center gap-2 flex-wrap">
            <button type="button" @click="switchMatrixTab('pairs')" :class="(visualHubTab === 'pairs' || visualHubTab === 'all') ? 'bg-purple-600 text-white font-bold shadow-xs' : 'bg-white dark:bg-[#121215] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-[#27272A] hover:border-purple-500/40'" class="px-3 py-1.5 rounded-xl transition cursor-pointer">
              ⚡ 2-Tag Power Pairs (<span x-text="powerPairs.length"></span>)
            </button>
            <button type="button" @click="switchMatrixTab('triplets')" :class="visualHubTab === 'triplets' ? 'bg-rose-600 text-white font-bold shadow-xs' : 'bg-white dark:bg-[#121215] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-[#27272A] hover:border-rose-500/40'" class="px-3 py-1.5 rounded-xl transition cursor-pointer">
              🔺 3-Tag Triplets (<span x-text="powerTriplets.length"></span>)
            </button>
            <button type="button" @click="switchMatrixTab('anchors')" :class="visualHubTab === 'anchors' ? 'bg-sky-600 text-white font-bold shadow-xs' : 'bg-white dark:bg-[#121215] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-[#27272A] hover:border-sky-500/40'" class="px-3 py-1.5 rounded-xl transition cursor-pointer">
              🏷️ 1-Tag Power Leaders &amp; Bridges (<span x-text="coreAnchorsList.length"></span>)
            </button>
            <button type="button" @click="switchMatrixTab('guided')" :class="visualHubTab === 'guided' ? 'bg-amber-600 text-white font-bold shadow-xs' : 'bg-white dark:bg-[#121215] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-[#27272A] hover:border-amber-500/40'" class="px-3 py-1.5 rounded-xl transition cursor-pointer">
              🎯 Guided Search Capsules (<span x-text="(crossoverData?.guided_pivots || []).length"></span>)
            </button>
            <button type="button" @click="switchMatrixTab('colors')" :class="visualHubTab === 'colors' ? 'bg-emerald-600 text-white font-bold shadow-xs' : 'bg-white dark:bg-[#121215] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-[#27272A] hover:border-emerald-500/40'" class="px-3 py-1.5 rounded-xl transition cursor-pointer">
              🎨 Dominant Color Swatches (<span x-text="(crossoverData?.dominant_colors || []).length"></span>)
            </button>
          </div>

          <!-- Search & Sort Controls for Active Matrix Tab -->
          <div class="flex items-center gap-2 flex-wrap">
            <template x-if="visualHubTab === 'anchors'">
              <div class="flex items-center gap-1 text-[11px]">
                <button type="button" @click="anchorsTier = 'all'; selectedMatrixIndex = 0" :class="anchorsTier === 'all' ? 'bg-sky-600 text-white font-bold' : 'bg-white dark:bg-[#121215] text-slate-500 border border-slate-200 dark:border-[#27272A]'" class="px-2 py-1 rounded-lg cursor-pointer">All</button>
                <button type="button" @click="anchorsTier = 'universal'; selectedMatrixIndex = 0" :class="anchorsTier === 'universal' ? 'bg-sky-600 text-white font-bold' : 'bg-white dark:bg-[#121215] text-slate-500 border border-slate-200 dark:border-[#27272A]'" class="px-2 py-1 rounded-lg cursor-pointer" title="Tags bridging >= 50% of cluster keywords">🌉 Bridges (≥50%)</button>
                <button type="button" @click="anchorsTier = 'whales'; selectedMatrixIndex = 0" :class="anchorsTier === 'whales' ? 'bg-sky-600 text-white font-bold' : 'bg-white dark:bg-[#121215] text-slate-500 border border-slate-200 dark:border-[#27272A]'" class="px-2 py-1 rounded-lg cursor-pointer" title="Tags appearing on >= 25 pins">💎 Whales (≥25)</button>
              </div>
            </template>

            <div class="relative">
              <input type="text"
                     x-model="matrixSearch"
                     @input="selectedMatrixIndex = 0"
                     placeholder="Filter patterns or keywords..."
                     class="px-3 py-1.5 pl-8 rounded-xl text-xs bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500/30 w-44 sm:w-52 font-sans">
              <span class="absolute left-2.5 top-1.5 text-xs text-slate-400">🔍</span>
              <button x-show="matrixSearch" @click="matrixSearch = ''; selectedMatrixIndex = 0" class="absolute right-2.5 top-1.5 text-xs text-slate-400 hover:text-slate-600 cursor-pointer">✕</button>
            </div>

            <select x-model="matrixSort" @change="selectedMatrixIndex = 0" class="px-2.5 py-1.5 rounded-xl bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] text-slate-800 dark:text-slate-200 text-xs font-sans focus:outline-none cursor-pointer">
              <option value="velocity_desc">⚡ Sort: 24h Velocity (Fastest)</option>
              <option value="freq_desc">🔥 Sort: Pin Count (Most Pins)</option>
              <option value="keywords_desc">🌉 Sort: Keyword Coverage (Most KWs)</option>
              <option value="lift_desc">🚀 Sort: Synergy Lift / Score</option>
              <option value="saves_desc">💎 Sort: Combined Saves</option>
            </select>
          </div>
        </div>

        <!-- MASTER-DETAIL SPLIT VIEW (12 Columns: 5 Cols Left Master List + 7 Cols Right Matching Surging Pins) -->
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <!-- LEFT PANEL (5 Cols): Master Pattern List -->
          <div class="lg:col-span-5 rounded-2xl border border-slate-200 dark:border-[#27272A] bg-slate-50/50 dark:bg-slate-950/60 overflow-hidden flex flex-col">
            <div class="px-4 py-3 border-b border-slate-200 dark:border-[#27272A] bg-slate-100/70 dark:bg-[#18181B]/80 flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold">
              <span x-text="getActiveMatrixTitle()"></span>
              <span x-text="getActiveMatrixItems().length + ' items'"></span>
            </div>

            <div class="divide-y divide-slate-200/80 dark:divide-[#27272A]/70 max-h-[680px] overflow-y-auto">
              <template x-for="(item, mIdx) in getActiveMatrixItems().slice(0, matrixListLimit)" :key="item._key || mIdx">
                <div @click="selectMatrixItem(item, mIdx)"
                     :class="isMatrixItemSelected(item, mIdx)
                       ? 'bg-purple-500/10 dark:bg-purple-500/15 border-l-4 border-l-purple-500'
                       : 'hover:bg-white dark:hover:bg-[#18181B]/70 border-l-4 border-l-transparent'"
                     class="p-3.5 transition-all cursor-pointer flex flex-col gap-2">
                  <div class="flex items-start justify-between gap-2">
                    <div class="flex items-center gap-2 min-w-0 flex-wrap">
                      <span class="text-[10px] font-mono tabular-nums text-slate-400 font-bold" x-text="'#' + (mIdx + 1)"></span>

                      <!-- 2-Tag Power Pair Label -->
                      <template x-if="visualHubTab === 'pairs' || visualHubTab === 'all'">
                        <div class="flex items-center gap-1.5 flex-wrap">
                          <span class="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25 text-xs font-bold" x-text="item.tag_a"></span>
                          <span class="text-purple-500 font-bold text-xs">+</span>
                          <span class="px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/25 text-xs font-bold" x-text="item.tag_b"></span>
                        </div>
                      </template>

                      <!-- 3-Tag Triplet Label -->
                      <template x-if="visualHubTab === 'triplets'">
                        <div class="flex items-center gap-1 flex-wrap">
                          <template x-for="(tg, tIdx) in (item.tags || [])" :key="tg">
                            <div class="flex items-center gap-1">
                              <span x-show="tIdx > 0" class="text-rose-500 font-bold text-[10px]">+</span>
                              <span class="px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/25 text-[11px] font-bold" x-text="tg"></span>
                            </div>
                          </template>
                        </div>
                      </template>

                      <!-- 1-Tag Power Leader / Bridge Label -->
                      <template x-if="visualHubTab === 'anchors'">
                        <div class="flex items-center gap-1.5 min-w-0">
                          <span x-text="item.is_universal ? '🌉' : '🏷️'" class="text-xs"></span>
                          <span class="text-xs font-bold text-slate-900 dark:text-white truncate" x-text="item.tag"></span>
                          <template x-if="item.overlap_percentage >= 50">
                            <span class="px-1.5 py-0.2 rounded text-[9px] font-mono tabular-nums font-bold bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30" x-text="item.overlap_percentage + '% SERPs'"></span>
                          </template>
                        </div>
                      </template>

                      <!-- Guided Search Capsule Label -->
                      <template x-if="visualHubTab === 'guided'">
                        <div class="flex items-center gap-2 min-w-0">
                          <span class="w-3 h-3 rounded-full shrink-0 border border-black/10 dark:border-white/20" :style="'background-color: ' + (item.dominant_color || '#f59e0b')"></span>
                          <span class="text-xs font-bold text-slate-900 dark:text-white truncate" x-text="item.display_label || item.term"></span>
                          <span class="px-1.5 py-0.2 rounded text-[9px] font-mono tabular-nums bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 font-bold" x-text="'Score ' + (item.composite_score || 0)"></span>
                        </div>
                      </template>

                      <!-- Dominant Color Swatch Label -->
                      <template x-if="visualHubTab === 'colors'">
                        <div class="flex items-center gap-2.5 min-w-0">
                          <span class="w-6 h-6 rounded-lg shrink-0 border border-black/15 dark:border-white/20 shadow-inner" :style="'background-color: ' + item.hex"></span>
                          <span class="text-xs font-bold font-mono tabular-nums text-slate-900 dark:text-white" x-text="item.hex"></span>
                        </div>
                      </template>
                    </div>

                    <!-- Right-side Velocity Badge -->
                    <div class="flex items-center gap-1.5 shrink-0 font-mono tabular-nums">
                      <span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                            x-text="'⚡ +' + formatNumber(item.total_velocity ?? item.velocity_gain ?? 0) + '/d'"></span>
                    </div>
                  </div>

                  <!-- Bottom Metrics Sub-bar -->
                  <div class="flex items-center justify-between gap-2 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    <div class="flex items-center gap-2 flex-wrap">
                      <span class="font-semibold text-indigo-600 dark:text-indigo-400"
                            x-text="(item.keywords_count || item.keyword_count || item.shared_count || item.keyword_overlap_count || 1) + ' keywords'"></span>
                      <span>•</span>
                      <span class="font-bold text-slate-700 dark:text-slate-200"
                            x-text="(item.joint_count || item.pin_count || item.count || 0) + ' pins'"></span>
                      <template x-if="item.lift">
                        <span class="px-1.5 py-0.2 rounded text-[9px] bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 font-bold"
                              x-text="item.lift + 'x Lift'"></span>
                      </template>
                      <template x-if="(item.total_repins_delta || 0) > 0">
                        <span class="text-sky-600 dark:text-sky-400 text-[10px]" x-text="'+' + formatNumber(item.total_repins_delta) + ' repins'"></span>
                      </template>
                    </div>
                    <template x-if="(item.total_saves || 0) > 0">
                      <span class="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold" x-text="formatNumber(item.total_saves) + ' saves'"></span>
                    </template>
                  </div>
                </div>
              </template>

              <div x-show="getActiveMatrixItems().length === 0" class="p-8 text-center text-xs text-slate-400 font-mono tabular-nums">
                No visual patterns match your current search filter.
              </div>
            </div>

            <!-- Show More / Collapse Footer in Left Master Panel -->
            <div x-show="getActiveMatrixItems().length > 25" class="p-2.5 border-t border-slate-200 dark:border-[#27272A] bg-slate-100/60 dark:bg-[#18181B]/60 flex items-center justify-between text-[11px] font-mono tabular-nums">
              <span class="text-slate-500" x-text="'Showing ' + Math.min(matrixListLimit, getActiveMatrixItems().length) + ' of ' + getActiveMatrixItems().length"></span>
              <div class="flex items-center gap-1.5">
                <button type="button" x-show="matrixListLimit < getActiveMatrixItems().length" @click="matrixListLimit += 30" class="px-2.5 py-1 rounded-lg bg-purple-500/15 text-purple-600 dark:text-purple-400 font-bold hover:bg-purple-500/25 transition cursor-pointer">+30 More</button>
                <button type="button" x-show="matrixListLimit > 30" @click="matrixListLimit = 30" class="px-2 py-1 rounded-lg bg-slate-200 dark:bg-[#27272A] text-slate-600 dark:text-slate-300 font-bold cursor-pointer">Collapse</button>
              </div>
            </div>
          </div>

          <!-- RIGHT PANEL (7 Cols): MATCHING SURGING PINS INSPECTOR -->
          <div class="lg:col-span-7 rounded-2xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-slate-950/80 overflow-hidden flex flex-col">
            <template x-if="getSelectedMatrixItem()">
              <div class="flex flex-col">
                <!-- Selected Pattern Inspector Header -->
                <div class="p-4 border-b border-slate-200 dark:border-[#27272A] bg-slate-50/80 dark:bg-[#18181B]/70 space-y-3">
                  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div class="flex items-center gap-2.5 flex-wrap">
                      <span class="px-2 py-0.5 rounded bg-purple-600 text-white text-[10px] font-mono tabular-nums font-bold uppercase">Matching Cluster Pins</span>
                      <h4 class="text-sm font-black text-slate-900 dark:text-white font-mono tabular-nums" x-text="getMatrixItemLabel(getSelectedMatrixItem())"></h4>
                    </div>
                    <div class="flex items-center gap-2 flex-wrap">
                      <button type="button"
                              @click="applyMatrixFilter(getSelectedMatrixItem(), visualHubTab)"
                              class="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold font-mono tabular-nums transition flex items-center gap-1.5 cursor-pointer shadow-xs">
                        <span>🎯</span>
                        <span>Filter Cluster Table (<span x-text="getMatchingPinsForMatrixItem(getSelectedMatrixItem(), visualHubTab).length"></span> pins) ↑</span>
                      </button>
                      <button type="button"
                              @click="copyMatrixItemBlueprint(getSelectedMatrixItem(), visualHubTab)"
                              class="px-2.5 py-1.5 rounded-xl bg-white dark:bg-[#121215] hover:bg-slate-100 dark:hover:bg-[#27272A] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-[#27272A] text-xs font-bold font-mono tabular-nums transition flex items-center gap-1 cursor-pointer">
                        <span>📋</span>
                        <span>Blueprint</span>
                      </button>
                    </div>
                  </div>

                  <!-- Pattern Summary KPIs & Connected Keywords Strip -->
                  <div class="flex items-center gap-2 flex-wrap text-[11px] font-mono tabular-nums">
                    <span class="px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 font-bold"
                          x-text="(getSelectedMatrixItem().keywords_count || getSelectedMatrixItem().keyword_count || getSelectedMatrixItem().shared_count || 1) + ' Cluster Keywords'"></span>
                    <span class="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-bold"
                          x-text="'⚡ +' + formatNumber(getSelectedMatrixItem().total_velocity ?? getSelectedMatrixItem().velocity_gain ?? 0) + '/d save velocity'"></span>
                    <template x-if="(getSelectedMatrixItem().total_saves || 0) > 0">
                      <span class="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-[#121215] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#27272A] font-semibold"
                            x-text="formatNumber(getSelectedMatrixItem().total_saves) + ' combined saves'"></span>
                    </template>
                    <template x-if="getSelectedMatrixItem().lift">
                      <span class="px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 font-bold"
                            x-text="getSelectedMatrixItem().lift + 'x Synergy Lift'"></span>
                    </template>
                  </div>

                  <template x-if="(getSelectedMatrixItem().keywords || []).length > 0">
                    <div class="flex items-center gap-1.5 flex-wrap pt-0.5">
                      <span class="text-[10px] font-mono tabular-nums uppercase text-slate-400">SERPs:</span>
                      <template x-for="kw in (getSelectedMatrixItem().keywords || []).slice(0, 8)" :key="kw">
                        <button type="button" @click="scopeFilter = kw; currentPage = 1; scrollToSection('pins-table-section')" class="px-2 py-0.5 rounded bg-white dark:bg-[#121215] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#27272A] hover:border-indigo-500 text-[10px] font-mono tabular-nums transition cursor-pointer" x-text="kw"></button>
                      </template>
                      <span x-show="(getSelectedMatrixItem().keywords || []).length > 8" class="text-[10px] font-mono tabular-nums text-slate-400" x-text="'+' + ((getSelectedMatrixItem().keywords || []).length - 8) + ' more'"></span>
                    </div>
                  </template>
                </div>

                <!-- 2-Column Grid of Matching Surging Cluster Pins -->
                <div class="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3.5 max-h-[600px] overflow-y-auto">
                  <template x-for="mp in getMatchingPinsForMatrixItem(getSelectedMatrixItem(), visualHubTab).slice(0, 24)" :key="mp.pin_id">
                    <div class="p-3 rounded-2xl bg-slate-50/70 dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] hover:border-purple-500/50 transition flex flex-col justify-between gap-2.5 shadow-2xs">
                      <div class="flex items-start gap-3">
                        <a :href="'/pins/' + mp.pin_id + '?folder_id=' + encodeURIComponent(activeFolder?.id || activeFolderId || '') + '&folder=' + encodeURIComponent(activeFolder?.name || '') + '&return_url=' + encodeURIComponent('/folders/' + (activeFolder?.id || activeFolderId || ''))" class="w-16 h-24 rounded-xl overflow-hidden border border-slate-200 dark:border-[#27272A] bg-slate-100 dark:bg-[#18181B] shrink-0 block hover:ring-2 hover:ring-purple-500 transition">
                          <img :src="mp.image_url || 'data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2260%22 height=%2290%22 viewBox=%220 0 60 90%22><rect width=%2260%22 height=%2290%22 rx=%224%22 fill=%22%2318181b%22/><text x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%2352525b%22 font-family=%22monospace%22 font-size=%2210%22>PIN</text></svg>'"
                               class="w-full h-full object-cover"
                               loading="lazy"
                               onerror="window.handlePinImgError(this)">
                        </a>
                        <div class="flex flex-col gap-1 min-w-0 flex-1">
                          <a :href="'/pins/' + mp.pin_id + '?folder_id=' + encodeURIComponent(activeFolder?.id || activeFolderId || '') + '&folder=' + encodeURIComponent(activeFolder?.name || '') + '&return_url=' + encodeURIComponent('/folders/' + (activeFolder?.id || activeFolderId || ''))"
                             class="text-xs font-bold text-slate-900 dark:text-white hover:text-purple-600 dark:hover:text-purple-400 transition line-clamp-2 leading-snug"
                             x-text="mp.title || ('Pin #' + mp.pin_id)"></a>

                          <div class="flex items-center gap-1.5 flex-wrap font-mono tabular-nums text-[10px]">
                            <span class="px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold border border-emerald-500/25"
                                  x-text="'+' + formatNumber(mp.effective_velocity ?? mp.daily_save_velocity ?? 0) + '/d'"></span>
                            <template x-if="(mp.delta_repins_24h || 0) > 0">
                              <span class="px-1.5 py-0.2 rounded bg-sky-500/15 text-sky-600 dark:text-sky-400 font-bold"
                                    x-text="'+' + formatNumber(mp.delta_repins_24h) + ' repins'"></span>
                            </template>
                            <template x-if="(mp.repin_clones_count || 0) > 0">
                              <span class="px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 font-bold"
                                    x-text="'+' + mp.repin_clones_count + ' repin clone' + (mp.repin_clones_count > 1 ? 's' : '')"></span>
                            </template>
                            <span class="text-slate-500 dark:text-slate-400 font-semibold" x-text="formatNumber(mp.save_count || 0) + ' saves'"></span>
                            <span class="text-slate-400" x-text="'⏳ ' + formatUniversalAge(mp.pin_age_days)"></span>
                          </div>

                          <div class="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400 truncate">
                            <span class="font-semibold text-slate-700 dark:text-slate-300 truncate" x-text="mp.domain || 'Uploaded by user'"></span>
                            <template x-if="mp.creator_username">
                              <span class="truncate" x-text="'• @' + mp.creator_username"></span>
                            </template>
                          </div>

                          <!-- Visual Annotations on Matching Pin -->
                          <div class="flex items-center gap-1 flex-wrap pt-0.5" x-show="mp.visual_annotations && mp.visual_annotations.length">
                            <template x-for="va in (mp.visual_annotations || []).slice(0, 4)" :key="typeof va === 'object' && va !== null ? (va.name || va.tag || va.label || va.term || '') : va">
                              <span class="px-1.5 py-0.2 rounded text-[9px] font-mono tabular-nums border truncate max-w-[125px]"
                                    :class="isTagHighlightedInSelectedPattern(typeof va === 'object' && va !== null ? (va.name || va.tag || va.label || va.term || '') : va)
                                      ? 'bg-purple-500/20 text-purple-700 dark:text-purple-200 border-purple-500/40 font-bold'
                                      : 'bg-white dark:bg-[#18181B] text-slate-500 dark:text-slate-400 border-slate-200 dark:border-[#27272A]'"
                                    x-text="'#' + (typeof va === 'object' && va !== null ? (va.name || va.tag || va.label || va.term || '') : va)"></span>
                            </template>
                          </div>
                        </div>
                      </div>

                      <div class="pt-2 border-t border-slate-200/70 dark:border-[#27272A]/80 flex items-center justify-between gap-2 font-mono tabular-nums text-[10px]">
                        <button type="button" @click="copyPinBlueprint(mp)" class="px-2 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-600 hover:text-white text-rose-600 dark:text-rose-400 font-bold border border-rose-500/20 transition cursor-pointer">
                          ⚡ Blueprint
                        </button>
                        <a :href="'/pins/' + mp.pin_id + '?folder_id=' + encodeURIComponent(activeFolder?.id || activeFolderId || '') + '&folder=' + encodeURIComponent(activeFolder?.name || '') + '&return_url=' + encodeURIComponent('/folders/' + (activeFolder?.id || activeFolderId || ''))" class="text-indigo-600 dark:text-indigo-400 hover:underline font-bold">
                          Full Dossier ↗
                        </a>
                      </div>
                    </div>
                  </template>
                </div>
              </div>
            </template>

            <div x-show="!getSelectedMatrixItem()" class="p-12 text-center text-xs text-slate-400 font-mono tabular-nums">
              Select any visual pattern on the left to inspect its matching cluster pins.
            </div>
          </div>
        </div>
      </div>
    </div>
    <!-- End of Room 1 Content -->

      <!-- ROOM 5 VIEW: Dedicated Folder Settings & Smart Bulk Pin Pruning Studio -->
      <!-- // [INVARIANT-LOCK: DO NOT REMOVE - ENFORCED BY verify_regression_locks.mjs] Lock 1: Room 1 & Room 5 Sibling DOM Hierarchy -->
      <div x-show="currentRoom === 'settings'" class="space-y-6" x-cloak>
        <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl p-6 shadow-sm">
          <div class="flex items-center justify-between flex-wrap gap-4 pb-6 border-b border-slate-100 dark:border-[#27272A]">
            <div>
              <h3 class="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>⚙️</span>
                <span>Room 5: Campaign Folder Settings &amp; Smart Bulk Pin Pruning</span>
              </h3>
              <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">Configure automated fleet crawling controls, harvest quotas, and clean out low-performing pins.</p>
            </div>
            <div class="flex items-center gap-2">
              <button type="button" @click="saveFolderSettings(false)" :disabled="settingsLoading" class="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition flex items-center gap-1.5 shadow-sm cursor-pointer">
                <span x-text="settingsLoading ? 'Saving Settings...' : 'Save Settings'"></span>
              </button>
            </div>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-6">
            <!-- Left: Fleet Execution & Crawler Controls -->
            <div class="space-y-4">
              <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">Crawler &amp; Fleet Execution Controls</h4>
              
              <!-- Pause Competitor Crawlers Toggle -->
              <div class="p-4 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50/60 dark:bg-[#18181B]/60 flex items-center justify-between">
                <div>
                  <div class="text-xs font-semibold text-slate-900 dark:text-white">Pause Competitor Crawlers</div>
                  <div class="text-[11px] text-slate-500 dark:text-slate-400">Temporarily prevent competitor profile and board scraping for this folder.</div>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" x-model="folderSettings.pause_competitors" class="sr-only peer">
                  <div class="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rose-600"></div>
                </label>
              </div>

              <!-- Pause SERP Crawlers Toggle -->
              <div class="p-4 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50/60 dark:bg-[#18181B]/60 flex items-center justify-between">
                <div>
                  <div class="text-xs font-semibold text-slate-900 dark:text-white">Pause SERP Crawlers</div>
                  <div class="text-[11px] text-slate-500 dark:text-slate-400">Suspend automated daily SERP ranking snapshots for folder keywords.</div>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" x-model="folderSettings.pause_crawlers" class="sr-only peer">
                  <div class="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rose-600"></div>
                </label>
              </div>

              <!-- Emergency Block Fleet Toggle -->
              <div class="p-4 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50/60 dark:bg-[#18181B]/60 flex items-center justify-between">
                <div>
                  <div class="text-xs font-semibold text-slate-900 dark:text-white">Block Fleet Ingestion</div>
                  <div class="text-[11px] text-slate-500 dark:text-slate-400">Hard stop: refuse all incoming GitHub Actions fleet crawler batches.</div>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" x-model="folderSettings.block_fleet" class="sr-only peer">
                  <div class="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rose-600"></div>
                </label>
              </div>

              <!-- Auto-Discover Creators Toggle -->
              <div class="p-4 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50/60 dark:bg-[#18181B]/60 flex items-center justify-between">
                <div>
                  <div class="text-xs font-semibold text-slate-900 dark:text-white">Auto-Discover Creators</div>
                  <div class="text-[11px] text-slate-500 dark:text-slate-400">Automatically register active ranking creators from SERP crawls into Creator Hub.</div>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" x-model="folderSettings.auto_discover_creators" class="sr-only peer">
                  <div class="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rose-600"></div>
                </label>
              </div>

              <!-- Global Pinterest Session Cookie (PINTEREST_COOKIE) -->
              <div class="p-4 rounded-xl border border-amber-500/25 bg-amber-500/5 space-y-2.5">
                <div class="flex items-center justify-between">
                  <div class="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <span>🔑 Pinterest Session Cookie (PINTEREST_COOKIE)</span>
                  </div>
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border"
                        :class="pinterestCookieStatus?.has_cookie ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30'"
                        x-text="pinterestCookieStatus?.has_cookie ? 'Authenticated' : 'Guest Mode'"></span>
                </div>
                <p class="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Paste your raw <code class="font-mono text-amber-600 dark:text-amber-400">_pinterest_sess</code> value or full cookie string to authenticate SERP search crawls and eliminate <code class="font-mono text-rose-500">e1_</code> encrypted pin IDs.
                </p>
                <textarea x-model="pinterestCookieInput" rows="3"
                          placeholder="Paste raw _pinterest_sess token (TWc9PS...) or _auth=0; _pinterest_sess=&quot;...&quot;"
                          class="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] text-slate-900 dark:text-white font-mono text-[11px] focus:outline-none focus:ring-1 focus:ring-amber-500"></textarea>
                <div class="flex items-center justify-between pt-1">
                  <span class="text-[10px] font-mono text-slate-400" x-text="pinterestCookieStatus?.preview ? ('Active: ' + pinterestCookieStatus.preview) : 'Ready'"></span>
                  <button type="button" @click="savePinterestCookie()" :disabled="isSavingCookie"
                          class="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white transition cursor-pointer disabled:opacity-50">
                    <span x-text="isSavingCookie ? 'Saving...' : 'Save & Activate Cookie'"></span>
                  </button>
                </div>
              </div>
            </div>

            <!-- Right: Quotas & Smart Bulk Pin Pruning -->
            <div class="space-y-4">
              <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">Harvest Quotas &amp; Pruning Engine</h4>

              <div class="p-4 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50/60 dark:bg-[#18181B]/60 space-y-3">
                <div class="flex items-center justify-between">
                  <label class="text-xs font-semibold text-slate-900 dark:text-white">Max SERP Pins Harvest Quota</label>
                  <span class="text-xs font-mono font-bold text-rose-600 dark:text-rose-400" x-text="folderSettings.max_serp_pins + ' pins'"></span>
                </div>
                <input type="range" min="20" max="250" step="10" x-model="folderSettings.max_serp_pins" @input="folderSettings.max_pins = folderSettings.max_serp_pins" class="w-full accent-rose-600">
                <div class="flex justify-between text-[10px] text-slate-400 font-mono">
                  <span>20 (Fast)</span>
                  <span>100 (Standard)</span>
                  <span>250 (Deep)</span>
                </div>
              </div>

              <!-- Smart Bulk Pin Pruning Box -->
              <div class="p-4 rounded-xl border border-rose-500/20 bg-rose-50/30 dark:bg-rose-950/10 space-y-3">
                <div class="flex items-center gap-2">
                  <span class="text-rose-600 dark:text-rose-400 font-bold">✂️</span>
                  <div class="text-xs font-bold text-slate-900 dark:text-white">Smart Bulk Pin Pruning</div>
                </div>
                <p class="text-[11px] text-slate-500 dark:text-slate-400">Prune dead or low-traction pins across selected cluster keywords into the tombstone archive.</p>

                <div>
                  <label class="text-[10px] uppercase font-mono text-slate-500">Target Scope</label>
                  <select x-model="pruneForm.scope" class="w-full mt-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] text-slate-900 dark:text-white font-mono text-xs cursor-pointer">
                    <option value="displaced">Displaced Vault Pins</option>
                    <option value="all">All Cluster Pins (Active + Vault)</option>
                    <option value="active">Active SERP Only</option>
                  </select>
                </div>

                <div class="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <label class="text-[10px] uppercase font-mono text-slate-500">Min Age (Days)</label>
                    <input type="number" x-model.number="pruneForm.min_pin_age_days" min="0" placeholder="30" class="w-full mt-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] text-slate-900 dark:text-white font-mono text-xs">
                  </div>
                  <div>
                    <label class="text-[10px] uppercase font-mono text-slate-500">Max Saves Threshold</label>
                    <input type="number" x-model.number="pruneForm.max_saves" min="0" placeholder="5" class="w-full mt-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] text-slate-900 dark:text-white font-mono text-xs">
                  </div>
                </div>

                <!-- Preview Candidate Feedback -->
                <div x-show="prunePreviewResult" class="p-2.5 rounded-lg bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] text-xs font-mono">
                  <div class="flex items-center justify-between text-slate-700 dark:text-slate-300">
                    <span>Candidates found:</span>
                    <span class="font-bold text-amber-500" x-text="prunePreviewResult?.candidates_count ?? prunePreviewResult?.matched_count ?? 0"></span>
                  </div>
                </div>

                <div class="flex items-center gap-2 pt-1">
                  <button type="button" @click="runPrunePreview()" :disabled="pruningLoading" class="flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold bg-slate-200 hover:bg-slate-300 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-slate-800 dark:text-slate-200 transition cursor-pointer">
                    <span x-text="pruningLoading ? 'Inspecting...' : 'Preview Candidates (Dry-Run)'"></span>
                  </button>
                  <button type="button" @click="executePrune()" :disabled="pruningLoading || !(prunePreviewResult?.candidates_count || prunePreviewResult?.matched_count)" class="flex-1 py-1.5 px-3 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white transition cursor-pointer">
                    Execute Atomic Prune
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <!-- Legacy Section 5 monopoly tables purged in favor of dedicated /folders/:id/domains and /folders/:id/creators rooms -->

    </div> <!-- [INVARIANT: SIBLING-VIEW-ISOLATION] Closes VIEW A (activeFolderId) before VIEW B -->
`;
}
