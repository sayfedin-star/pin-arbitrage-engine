/**
 * Campaign Folders Studio View (VIEW A) - /folders/:id
 * Enforces Sibling DOM hierarchy for Room 1 & Room 5.
 */
import { renderCampaignWorkspaceHeader } from '../campaign-workspace-header.mjs';
import { renderPinRowTemplate } from '../pin-row.mjs';

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
            <i data-lucide="sparkles" class="w-3.5 h-3.5 shrink-0"></i>
            <span>Visual &amp; Intent Matrix</span>
            <span class="px-1.5 py-0.2 rounded-full bg-purple-200/70 dark:bg-purple-800/70 text-[10px] font-mono tabular-nums" x-text="formatNumber(crossoverData?.summary?.universal_tags_count || 0) + ' Bridges · ' + formatNumber(crossoverData?.summary?.shared_pivots_count || 0) + ' Pivots'"></span>
          </button>
          <button @click="dispatchFolderDeepAudit()" :disabled="auditDispatching" class="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer" title="Partition all cluster pins across 20 parallel GitHub runners to deep inspect authentic saves, repins & CV annotations">
            <span x-show="!auditDispatching" class="inline-flex"><i data-lucide="rocket" class="w-3.5 h-3.5"></i></span>
            <span x-show="auditDispatching" class="inline-flex"><i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i></span>
            <span x-text="auditDispatching ? 'Launching 20 Runners...' : 'Deep Cluster Audit (20 Runners)'"></span>
          </button>
        </div>
      </div>

      <!-- Active Drill-Down Filter Banner -->
      <div x-show="entityFilter.type" class="bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-500/30 rounded-xl p-3 flex items-center justify-between shadow-sm" x-cloak>
        <div class="flex items-center gap-2 text-xs text-indigo-900 dark:text-indigo-200">
          <i data-lucide="target" class="w-3.5 h-3.5 text-indigo-500 shrink-0"></i><span class="font-bold">Active Drill-Down Filter:</span>
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
              <i data-lucide="zap" class="w-4 h-4"></i>
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

        <!-- Rollup Cards: Saves Gains, Repins Gains, Avg Daily Velocity, Competitor Gains -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
          <div class="p-3 rounded-xl bg-slate-50 dark:bg-[#18181B]/60 border border-slate-200/80 dark:border-[#27272A] flex flex-col gap-1">
            <span class="text-[10px] uppercase font-mono tabular-nums text-slate-500 dark:text-slate-400" x-text="selectedTimeWindow === 'all' ? 'Total Saves (All-Time)' : ('Saves Gains (' + selectedTimeWindow + ')')">Saves Gains</span>
            <span class="text-base font-bold font-mono tabular-nums" :class="clusterWindowSavesGains === null ? 'text-slate-400 dark:text-slate-500' : 'text-emerald-600 dark:text-emerald-400'" x-text="clusterWindowSavesGains === null ? '—' : ((selectedTimeWindow === 'all' ? '' : '+') + formatNumber(clusterWindowSavesGains))">+0</span>
            <span class="text-[10px] text-slate-400" x-text="clusterWindowSavesGains === null ? ('No ' + selectedTimeWindow + ' history yet') : (selectedTimeWindow === 'all' ? 'Cumulative cluster saves' : 'Cluster gross saves gain')">Cluster gross saves gain</span>
          </div>
          <div class="p-3 rounded-xl bg-slate-50 dark:bg-[#18181B]/60 border border-slate-200/80 dark:border-[#27272A] flex flex-col gap-1">
            <span class="text-[10px] uppercase font-mono tabular-nums text-slate-500 dark:text-slate-400" x-text="selectedTimeWindow === 'all' ? 'Total Repins (All-Time)' : ('Repins Gains (' + selectedTimeWindow + ')')">Repins Gains</span>
            <span class="text-base font-bold font-mono tabular-nums" :class="clusterWindowRepinsGains === null ? 'text-slate-400 dark:text-slate-500' : 'text-sky-600 dark:text-sky-400'" x-text="clusterWindowRepinsGains === null ? '—' : ((selectedTimeWindow === 'all' ? '' : '+') + formatNumber(clusterWindowRepinsGains))">+0</span>
            <span class="text-[10px] text-slate-400" x-text="clusterWindowRepinsGains === null ? ('No ' + selectedTimeWindow + ' history yet') : (selectedTimeWindow === 'all' ? 'Cumulative cluster repins' : 'Cluster gross repins')">Cluster gross repins</span>
          </div>
          <div class="p-3 rounded-xl bg-slate-50 dark:bg-[#18181B]/60 border border-slate-200/80 dark:border-[#27272A] flex flex-col gap-1">
            <span class="text-[10px] uppercase font-mono tabular-nums text-slate-500 dark:text-slate-400">Avg Daily Velocity</span>
            <span class="text-base font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400" x-text="'+' + clusterAvgVelocity + '/d'">+0/d</span>
            <span class="text-[10px] text-slate-400">Per-pin daily momentum</span>
          </div>
          <div class="p-3 rounded-xl bg-slate-50 dark:bg-[#18181B]/60 border border-slate-200/80 dark:border-[#27272A] flex flex-col gap-1">
            <span class="text-[10px] uppercase font-mono tabular-nums text-slate-500 dark:text-slate-400" x-text="selectedTimeWindow === 'all' ? 'Combined Reach (All-Time)' : ('Competitor Gains (' + selectedTimeWindow + ')')">Competitor Gains</span>
            <span class="text-base font-bold font-mono tabular-nums" :class="clusterCompetitorAudienceGains === null ? 'text-slate-400 dark:text-slate-500' : 'text-indigo-600 dark:text-indigo-400'" x-text="clusterCompetitorAudienceGains === null ? '—' : ((selectedTimeWindow === 'all' ? '' : '+') + formatNumber(clusterCompetitorAudienceGains))">+0</span>
            <span class="text-[10px] text-slate-400" x-text="clusterCompetitorAudienceGains === null ? 'Tracked on 24h & 7d windows' : ((selectedTimeWindow === 'all' ? 'Total cluster reach (' : 'Cluster reach gain (') + formatNumber(crossoverData?.summary?.competitor_audience_gains?.matched_creators_count || (crossoverData?.top_creators?.length || 0)) + ' creators)')">Audience &amp; reach expansion</span>
          </div>
        </div>
      </div>

      <!-- SECTION 0B: Unified 4-Source Daily Tracked Pins & Pin Graph Queue -->
      <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl p-4 shadow-sm space-y-3">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <div class="flex items-center gap-2">
            <i data-lucide="radar" class="w-4 h-4 text-indigo-500"></i>
            <h3 class="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100">Daily Tracked Pins (4 Sources)</h3>
          </div>
          <div class="flex items-center gap-2 flex-wrap">
            <button type="button" @click="syncTopNSerpPins()" :disabled="syncingTopN" class="px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"><i data-lucide="refresh-cw" class="w-3 h-3" :class="syncingTopN ? 'animate-spin' : ''"></i><span x-text="syncingTopN ? 'Syncing...' : ('Sync Top ' + (trackedPinsSummary.serp_top_n || folderSettings.serp_top_n || 20))"></span></button>
            <button type="button" @click="pinGraphExpanded = !pinGraphExpanded; if (pinGraphExpanded) loadPinGraphSeeds()" class="px-2.5 py-1 rounded-lg text-xs font-semibold border transition cursor-pointer inline-flex items-center gap-1" :class="pinGraphExpanded ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-slate-100 dark:bg-[#18181B] text-slate-700 dark:text-slate-200 border-slate-200 dark:border-[#27272A]'"><i data-lucide="git-branch" class="w-3 h-3"></i><span x-text="'Pin Graph Seeds (' + formatNumber(pinGraphSeeds.length) + ')'"></span></button>
            <button type="button" @click="trackedPinsExpanded = !trackedPinsExpanded" class="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-[#18181B] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-[#27272A] cursor-pointer" x-text="trackedPinsExpanded ? 'Hide List' : ('Tracked (' + formatNumber(trackedPinsSummary.source_counts?.all || 0) + ')')"></button>
          </div>
        </div>
        <div class="flex items-center gap-1.5 flex-wrap">
          <template x-for="src in [{k:'all',l:'All'},{k:'search',l:'Search Top-N'},{k:'newborn',l:'Newborn'},{k:'creator',l:'Creators'},{k:'related',l:'Related'}]" :key="src.k">
            <button type="button" @click="loadTrackedPinsSummary(src.k); trackedPinsExpanded = true" class="px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition cursor-pointer" :class="trackedPinsSourceFilter === src.k ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-50 dark:bg-[#18181B] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-[#27272A]'"><span x-text="src.l + ' (' + formatNumber(trackedPinsSummary.source_counts?.[src.k] || 0) + ')'"></span></button>
          </template>
        </div>
        <template x-if="pinGraphExpanded">
          <div class="border-t border-slate-200 dark:border-[#27272A] pt-3 space-y-2.5">
            <div class="flex flex-col sm:flex-row sm:items-center gap-2">
              <input type="text" x-model="manualPinGraphSeedInput" @keydown.enter.prevent="queueManualPinGraphSeeds()" placeholder="Paste Seed Pin ID(s) or URLs (comma-separated)..." class="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#18181B] text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500">
              <button type="button" @click="queueManualPinGraphSeeds()" :disabled="queueingPinGraphSeeds" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"><i data-lucide="plus" class="w-3.5 h-3.5"></i><span x-text="queueingPinGraphSeeds ? 'Queueing...' : 'Queue Seed(s)'"></span></button>
            </div>
            <div x-show="!(pinGraphSeeds || []).length" class="text-xs text-slate-500">No Related Pins seeds queued yet for this campaign.</div>
            <div x-show="(pinGraphSeeds || []).length > 0" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 max-h-52 overflow-y-auto">
              <template x-for="seed in (pinGraphSeeds || [])" :key="seed.seed_pin_id">
                <div class="p-2 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50/70 dark:bg-[#18181B]/70 flex items-center justify-between gap-2">
                  <div class="min-w-0">
                    <a :href="'/pin/' + seed.seed_pin_id + '?folder_id=' + encodeURIComponent(activeFolder?.id || activeFolderId || '')" class="text-xs font-semibold text-slate-900 dark:text-white hover:text-emerald-500 truncate block" x-text="seed.title || ('Seed #' + seed.seed_pin_id)"></a>
                    <div class="flex items-center gap-1.5 mt-0.5 text-[10px] font-mono tabular-nums">
                      <span class="uppercase px-1.5 py-0.25 rounded border" :class="seed.status === 'crawled' ? 'text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/10' : (seed.status === 'failed' ? 'text-rose-500 border-rose-500/30 bg-rose-500/10' : 'text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/10')" x-text="seed.status || 'queued'"></span>
                      <span class="text-slate-500" x-text="seed.source_type || 'manual'"></span>
                    </div>
                  </div>
                  <button type="button" @click="removePinGraphSeed(seed.seed_pin_id)" class="p-1 rounded text-slate-400 hover:text-rose-500 cursor-pointer shrink-0" title="Remove Seed"><i data-lucide="x" class="w-3.5 h-3.5"></i></button>
                </div>
              </template>
            </div>
          </div>
        </template>
        <template x-if="trackedPinsExpanded">
          <div class="border-t border-slate-200 dark:border-[#27272A] pt-3">
            <div x-show="trackedPinsLoading" class="text-xs text-slate-500">Loading tracked pins...</div>
            <div x-show="!trackedPinsLoading && !(trackedPinsSummary.items || []).length" class="text-xs text-slate-500">No tracked pins in this source yet.</div>
            <div x-show="!trackedPinsLoading && (trackedPinsSummary.items || []).length > 30" class="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mb-2" x-text="'Showing top 30 of ' + formatNumber(trackedPinsSummary.total || (trackedPinsSummary.items || []).length) + ' tracked pins'"></div>
            <div x-show="!trackedPinsLoading && (trackedPinsSummary.items || []).length > 0" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 max-h-60 overflow-y-auto">
              <template x-for="tp in (trackedPinsSummary.items || []).slice(0, 30)" :key="tp.pin_id + ':' + tp.source_type">
                <div class="p-2 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50/70 dark:bg-[#18181B]/70 flex items-center justify-between gap-2">
                  <div class="min-w-0">
                    <a :href="'/pin/' + tp.pin_id + '?folder_id=' + encodeURIComponent(activeFolder?.id || activeFolderId || '')" class="text-xs font-semibold text-slate-900 dark:text-white hover:text-indigo-500 truncate block" x-text="tp.title || ('Pin #' + tp.pin_id)"></a>
                    <div class="flex items-center gap-1.5 mt-0.5 text-[10px] font-mono tabular-nums">
                      <span class="uppercase text-slate-500" x-text="tp.source_type"></span>
                      <span class="text-emerald-600 dark:text-emerald-400" x-text="formatNumber(tp.save_count || 0) + ' saves'"></span>
                      <span class="text-amber-600 dark:text-amber-400" x-text="formatPinWindowPrimary(tp)"></span>
                    </div>
                  </div>
                  <div class="flex items-center gap-1 shrink-0">
                    <button type="button" @click="queueSelectedForRelatedPins([tp.pin_id])" class="p-1 rounded text-slate-400 hover:text-emerald-500 cursor-pointer" title="Queue Related Pins Seed"><i data-lucide="git-branch" class="w-3.5 h-3.5"></i></button>
                    <button type="button" @click="removeTrackedPin(tp.pin_id, tp.source_type)" class="p-1 rounded text-slate-400 hover:text-rose-500 cursor-pointer" title="Untrack"><i data-lucide="x" class="w-3.5 h-3.5"></i></button>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </template>
      </div>

      <!-- SECTION 1: Full Pins Table (Paginated 1,788 Unique Pins / Super-Pins) -->
      <div id="pins-table-section" class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl overflow-hidden shadow-sm dark:shadow-xl flex flex-col transition-colors">
        
        <!-- Table Title & Meta Bar -->
        <div class="p-4 border-b border-slate-200 dark:border-[#27272A] flex items-center justify-between flex-wrap gap-3">
          <div class="flex items-center gap-2">
            <span x-show="scopeFilter === 'super_only'" class="inline-flex text-pink-500"><i data-lucide="star" class="w-4 h-4"></i></span><span x-show="scopeFilter === 'active_only'" class="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block shrink-0" aria-hidden="true"></span><span x-show="scopeFilter === 'vault_only'" class="w-2.5 h-2.5 rounded-full bg-purple-500 inline-block shrink-0" aria-hidden="true"></span><span x-show="scopeFilter !== 'super_only' && scopeFilter !== 'active_only' && scopeFilter !== 'vault_only'" class="inline-flex text-indigo-500"><i data-lucide="pin" class="w-4 h-4"></i></span>
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

        <!-- Integrated Toolbar: Exclusive Scope Row + Stackable Signals, Sort & Search Row -->
        <div class="p-3.5 bg-slate-50/80 dark:bg-slate-950/60 border-b border-slate-200 dark:border-[#27272A] flex flex-col gap-2.5">
          <!-- Row 1: Exclusive Scope + Keyword Selector -->
          <div class="flex items-center justify-between flex-wrap gap-2">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-xs font-medium text-slate-500 dark:text-slate-400 mr-1">Scope:</span>
              <button @click="scopeFilter = 'all'; currentPage = 1" 
                      class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                      :class="scopeFilter === 'all' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white dark:bg-[#18181B] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#27272A] border border-slate-200 dark:border-[#27272A]'">
                All Cluster Pins (<span x-text="formatNumber(crossoverData?.summary?.total_unique_pins ?? (crossoverData?.all_pins?.length || 0))"></span>)
              </button>
              <button @click="scopeFilter = 'active_only'; currentPage = 1" 
                      class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
                      :title="crossoverData?.summary?.active_serp_slots_count ? ('Unique active SERP pins (' + formatNumber(crossoverData.summary.active_serp_slots_count) + ' ranked slots)') : 'Unique active SERP pins'"
                      :class="scopeFilter === 'active_only' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-white dark:bg-[#18181B] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#27272A] border border-slate-200 dark:border-[#27272A]'">
                <span class="w-2 h-2 rounded-full bg-emerald-500 inline-block shrink-0" aria-hidden="true"></span> Active SERP (<span x-text="formatNumber(crossoverData?.summary?.active_pins_count ?? (crossoverData?.all_pins?.filter(p => p.has_active_rank)?.length || 0))"></span>)
              </button>
              <button @click="scopeFilter = 'vault_only'; currentPage = 1" 
                      class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
                      :class="scopeFilter === 'vault_only' ? 'bg-purple-600 text-white shadow-sm' : 'bg-white dark:bg-[#18181B] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#27272A] border border-slate-200 dark:border-[#27272A]'">
                <span class="w-2 h-2 rounded-full bg-purple-500 inline-block shrink-0" aria-hidden="true"></span> Vault Movers (<span x-text="formatNumber(crossoverData?.summary?.vault_pins_count ?? (crossoverData?.all_pins?.filter(p => !p.has_active_rank && p.has_vault_rank)?.length || 0))"></span>)
              </button>
              <button @click="scopeFilter = 'super_only'; currentPage = 1" 
                      class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
                      title="All pins appearing in >= 2 keywords across Active SERP and Vault"
                      :class="scopeFilter === 'super_only' ? 'bg-pink-600 text-white shadow-sm' : 'bg-white dark:bg-[#18181B] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#27272A] border border-slate-200 dark:border-[#27272A]'">
                <i data-lucide="star" class="w-3.5 h-3.5 shrink-0"></i> Super-Pins Only (<span x-text="formatNumber(crossoverData?.summary?.super_pins_count ?? (crossoverData?.all_pins?.filter(p => p.is_super_pin || (p.overlap_count || 0) >= 2)?.length || 0))"></span>)
              </button>
              <template x-if="activeFolder?.items?.length">
                <select x-model="scopeFilter" @change="currentPage = 1" class="bg-white dark:bg-[#18181B] text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-[#27272A] rounded-lg text-xs py-1.5 px-2.5 font-mono tabular-nums shadow-sm cursor-pointer">
                  <option value="all">Filter by Keyword (All)</option>
                  <template x-for="item in activeFolder.items" :key="item.keyword">
                    <option :value="item.keyword" x-text="item.keyword"></option>
                  </template>
                </select>
              </template>
            </div>
          </div>

          <!-- Row 2: Stackable Signal Toggles + Sort + Search -->
          <div class="flex items-center justify-between flex-wrap gap-2.5 pt-2 border-t border-slate-200/70 dark:border-[#27272A]/70">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-xs font-medium text-slate-500 dark:text-slate-400 mr-1">Signals:</span>
              <button type="button" @click="onlySurging24h = !onlySurging24h; currentPage = 1" :class="onlySurging24h ? 'bg-rose-600 text-white border-rose-500 shadow-xs' : 'bg-white dark:bg-[#18181B] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-[#27272A] hover:bg-slate-100 dark:hover:bg-[#27272A]'" class="px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-all flex items-center gap-1.5 cursor-pointer"><i data-lucide="zap" class="w-3.5 h-3.5 shrink-0"></i><span>24h Surges</span><span class="px-1.5 py-0.2 text-[10px] font-mono tabular-nums rounded-full" :class="onlySurging24h ? 'bg-white/20 text-white' : 'bg-rose-500/20 text-rose-600 dark:text-rose-300'" x-text="formatNumber(crossoverData?.summary?.surging_24h_count || 0)"></span></button>
              <button type="button" @click="onlyFreshRockets = !onlyFreshRockets; currentPage = 1" :class="onlyFreshRockets ? 'bg-amber-600 text-white border-amber-500 shadow-xs' : 'bg-white dark:bg-[#18181B] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-[#27272A] hover:bg-slate-100 dark:hover:bg-[#27272A]'" class="px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-all flex items-center gap-1.5 cursor-pointer"><i data-lucide="rocket" class="w-3.5 h-3.5 shrink-0"></i><span>Rockets (≤14d)</span><span class="px-1.5 py-0.2 text-[10px] font-mono tabular-nums rounded-full" :class="onlyFreshRockets ? 'bg-white/20 text-white' : 'bg-amber-500/20 text-amber-600 dark:text-amber-300'" x-text="formatNumber(crossoverData?.summary?.rockets_count || 0)"></span></button>
              <button type="button" @click="onlyBreakoutBabyDomains = !onlyBreakoutBabyDomains; currentPage = 1" :class="onlyBreakoutBabyDomains ? 'bg-amber-600 text-white border-amber-500 shadow-xs' : 'bg-white dark:bg-[#18181B] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-[#27272A] hover:bg-slate-100 dark:hover:bg-[#27272A]'" class="px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-all flex items-center gap-1.5 cursor-pointer"><i data-lucide="sparkles" class="w-3.5 h-3.5 shrink-0"></i><span>Breakout Baby Domains (&lt;2y + 7d Gains)</span><span class="px-1.5 py-0.2 text-[10px] font-mono tabular-nums rounded-full" :class="onlyBreakoutBabyDomains ? 'bg-white/20 text-white' : 'bg-amber-500/20 text-amber-600 dark:text-amber-300'" x-text="formatNumber(crossoverData?.summary?.breakout_baby_domains_count || 0)"></span></button>
              <button type="button" @click="onlyVacuumPins = !onlyVacuumPins; currentPage = 1" :class="onlyVacuumPins ? 'bg-rose-600 text-white border-rose-500 shadow-xs' : 'bg-white dark:bg-[#18181B] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-[#27272A] hover:bg-slate-100 dark:hover:bg-[#27272A]'" class="px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-all flex items-center gap-1.5 cursor-pointer"><i data-lucide="target" class="w-3.5 h-3.5 shrink-0"></i><span>Linkless Vacuums</span><span class="px-1.5 py-0.2 text-[10px] font-mono tabular-nums rounded-full" :class="onlyVacuumPins ? 'bg-white/20 text-white' : 'bg-rose-500/20 text-rose-600 dark:text-rose-300'" x-text="formatNumber(crossoverData?.summary?.vacuum_pins_count || 0)"></span></button>
            </div>

            <div class="flex items-center gap-3 flex-wrap">
              <!-- Sort Dropdown -->
              <div class="flex items-center gap-1.5 text-xs">
                <span class="text-slate-500 dark:text-slate-400">Sort:</span>
                <select x-model="sortBy" @change="currentPage = 1" class="bg-white dark:bg-[#18181B] text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-[#27272A] rounded-lg text-xs py-1.5 px-2.5 font-mono tabular-nums shadow-sm cursor-pointer">
                  <option value="velocity_desc">Daily Velocity (Fastest)</option>
                  <option value="repins_24h_desc">24h Repins Surge (Highest)</option>
                  <option value="saves_desc">Total Saves (High → Low)</option>
                  <option value="saves_asc">Total Saves (Low → High)</option>
                  <option value="pin_age_asc">Pin Age (Youngest First)</option>
                  <option value="pin_age_desc">Pin Age (Oldest First)</option>
                  <option value="folder_age_desc">Days Tracked (Longest)</option>
                  <option value="folder_age_asc">Days Tracked (Recent)</option>
                  <option value="rank_asc">Best Rank (#1 First)</option>
                  <option value="overlap_desc">Cross-SERP Overlap (Most)</option>
                  <option value="title_asc">Title (A → Z)</option>
                </select>
              </div>

              <!-- Search Filter -->
              <div class="relative">
                <input type="text" x-model.debounce.150ms="searchQuery" @input="currentPage = 1" placeholder="Filter pins by title, domain, or tag..."
                       class="w-64 pl-8 pr-3 py-1.5 bg-white dark:bg-slate-950 border border-slate-300 dark:border-[#27272A] rounded-lg text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 font-sans focus:outline-none focus:border-indigo-500 shadow-sm">
                <i data-lucide="search" class="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2 pointer-events-none"></i>
              </div>
            </div>
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

          <!-- Selection Action Bar for Related Pins Extraction -->
          <div x-show="selectedStudioPinIds.length > 0" x-cloak class="px-4 py-2.5 bg-emerald-500/10 dark:bg-emerald-950/30 border-b border-emerald-500/20 flex items-center justify-between flex-wrap gap-2 text-xs">
            <div class="flex items-center gap-2 font-semibold text-emerald-800 dark:text-emerald-200">
              <i data-lucide="check-square" class="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400"></i>
              <span x-text="selectedStudioPinIds.length + ' pin(s) selected'"></span>
            </div>
            <div class="flex items-center gap-2">
              <button type="button" @click="queueSelectedForRelatedPins()" :disabled="queueingPinGraphSeeds"
                      class="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold inline-flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50">
                <i data-lucide="git-branch" class="w-3.5 h-3.5"></i>
                <span x-text="queueingPinGraphSeeds ? 'Queuing...' : 'Extract Related Pins'"></span>
              </button>
              <button type="button" @click="clearStudioPinSelection()"
                      class="px-2.5 py-1 rounded-lg bg-slate-200 dark:bg-[#27272A] text-slate-700 dark:text-slate-200 font-semibold transition cursor-pointer">
                Clear
              </button>
            </div>
          </div>

          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs font-mono tabular-nums">
              <thead class="bg-slate-50 dark:bg-slate-950/80 border-b border-slate-200 dark:border-[#27272A] text-slate-500 dark:text-slate-400 uppercase text-[10px]">
                <tr>
                  <th class="p-3.5 w-16 text-center">#</th>
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
                    <span x-text="getSelectedWindowLabel()">Daily Velocity</span> <span x-text="sortBy === 'velocity_desc' ? '↓' : '↕'"></span>
                  </th>
                  <th class="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
             <tbody class="divide-y divide-slate-200 dark:divide-slate-800/60 text-slate-700 dark:text-slate-300">
               <template x-for="(sp, idx) in paginatedPins()" :key="sp.pin_id">
                 ${renderPinRowTemplate({
                   pinVar: 'sp',
                   indexVar: 'idx',
                   showCheckbox: false,
                   showRank: true,
                   rankPosition: 'beforeThumb',
                   showThumb: false,
                   showTitle: true,
                   showDomain: true,
                   agePosition: 'afterDomain',
                   showSaves: true,
                   showRepins: false,
                   showVelocity: true,
                   velocityPosition: 'afterRepins',
                   showAge: true,
                   showActions: true,
                   rowClass: 'hover:bg-slate-50 dark:hover:bg-[#27272A]/40 transition-colors',
                   rankHtml: `
                   <td class="p-3.5 text-center font-mono tabular-nums text-slate-400 dark:text-slate-500 text-[11px]">
                     <div class="inline-flex items-center justify-center gap-1.5">
                       <input type="checkbox"
                              :checked="selectedStudioPinIds.includes(String(sp.pin_id))"
                              @change="toggleSelectStudioPin(sp.pin_id)"
                              :aria-label="'Select pin ' + sp.pin_id"
                              class="rounded border-slate-300 dark:border-[#3F3F46] text-indigo-600 focus:ring-indigo-500 cursor-pointer" />
                       <span x-text="(currentPage - 1) * pageSize + idx + 1"></span>
                     </div>
                   </td>`,
                   titleHtml: `
                   <td class="p-3.5">
                     <div class="flex items-center gap-3">
                       <a :href="'/pin/' + sp.pin_id + '?folder_id=' + encodeURIComponent(activeFolder?.id || activeFolderId || '') + '&folder=' + encodeURIComponent(activeFolder?.name || '') + '&return_url=' + encodeURIComponent('/folders/' + (activeFolder?.id || activeFolderId || ''))" class="w-10 h-14 rounded bg-slate-100 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A] overflow-hidden flex-shrink-0 block hover:ring-2 hover:ring-indigo-500 transition">
                         <img :src="sp.image_url || 'data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2260%22 height=%2290%22 viewBox=%220 0 60 90%22><rect width=%2260%22 height=%2290%22 rx=%224%22 fill=%22%2318181b%22/><text x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%2352525b%22 font-family=%22monospace%22 font-size=%2210%22>PIN</text></svg>'" 
                              class="w-full h-full object-cover"
                              loading="lazy"
                              onerror="if(window.handlePinImgError){window.handlePinImgError(this)}else{this.onerror=null}">
                       </a>
                       <div class="flex flex-col gap-1 max-w-xs">
                         <!-- // [INVARIANT-LOCK: DO NOT REMOVE - ENFORCED BY verify_regression_locks.mjs] Lock 5: Context-Preserving Pin Navigation -->
                         <a :href="'/pin/' + sp.pin_id + '?folder_id=' + encodeURIComponent(activeFolder?.id || activeFolderId || '') + '&folder=' + encodeURIComponent(activeFolder?.name || '') + '&return_url=' + encodeURIComponent('/folders/' + (activeFolder?.id || activeFolderId || ''))" 
                            class="font-semibold text-slate-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors truncate block" 
                            x-text="sp.title || ('Pin #' + sp.pin_id)"></a>
                         <div class="flex items-center gap-1.5 flex-wrap">
                           <span class="text-[9px] font-mono tabular-nums px-1 py-0.2 rounded bg-slate-100 dark:bg-[#18181B] text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-[#27272A]" 
                                 x-text="sp.format || 'ORGANIC PIN'"></span>
                           <span class="text-[9px] font-mono tabular-nums text-slate-500" x-text="sp.aspect_ratio || '2:3'"></span>
                           <!-- Breakout Baby Domain Badge -->
                           <template x-if="typeof sp.is_breakout_baby_domain === 'boolean' ? sp.is_breakout_baby_domain : ((Number(sp.domain_age_days != null ? sp.domain_age_days : (sp.domain_age_years != null ? sp.domain_age_years * 365 : 0)) > 0) && (Number(sp.domain_age_days != null ? sp.domain_age_days : (sp.domain_age_years != null ? sp.domain_age_years * 365 : 0)) <= 730) && sp.gains_7d != null && Number(sp.gains_7d) >= 15)">
                             <span class="inline-flex items-center gap-1 text-[9px] font-mono tabular-nums px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 font-semibold" title="Breakout Baby Domain (<2y + Authentic 7d Gains >= 15)"><i data-lucide="sparkles" class="w-2.5 h-2.5 shrink-0"></i><span>Baby Breakout</span></span>
                           </template>
                           <!-- Linkless Vacuum Pin Badge -->
                           <template x-if="typeof sp.is_vacuum_pin === 'boolean' ? sp.is_vacuum_pin : Boolean(sp.image_url && isLinklessVacuumDomain(sp.domain) && Number(sp.save_count || 0) >= 100)">
                             <span class="inline-flex items-center gap-1 text-[9px] font-mono tabular-nums px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 font-semibold" title="Linkless SERP Vacuum (High Saves, No Outbound Domain)"><i data-lucide="target" class="w-2.5 h-2.5 shrink-0"></i><span>Vacuum</span></span>
                           </template>
                         </div>

                         <!-- Pinterest Computer Vision Visual Annotations -->
                         <div class="flex items-center gap-1 flex-wrap pt-1" x-show="sp.visual_annotations?.length">
                           <template x-for="va in (sp.visual_annotations || []).slice(0, 3)" :key="typeof va === 'object' && va !== null ? (va.name || va.tag || va.label || va.term || '') : va">
                             <button @click="applyMatrixFilter({ tag: (typeof va === 'object' && va !== null ? (va.name || va.tag || va.label || va.term || '') : va), raw_tag: (typeof va === 'object' && va !== null ? (va.name || va.tag || va.label || va.term || '') : va) }, 'anchors')" 
                                     class="inline-flex items-center gap-1 text-[9px] font-mono tabular-nums px-1.5 py-0.5 rounded bg-indigo-50/80 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/60 transition-colors max-w-[130px] text-left cursor-pointer" 
                                     :title="'Filter cluster pins by visual tag: ' + (typeof va === 'object' && va !== null ? (va.name || va.tag || va.label || va.term || '') : va)"><i data-lucide="eye" class="w-2.5 h-2.5 shrink-0"></i><span class="truncate" x-text="(typeof va === 'object' && va !== null ? (va.name || va.tag || va.label || va.term || '') : va)"></span></button>
                           </template>
                           <span x-show="sp.visual_annotations?.length > 3" 
                                 class="text-[9px] font-mono tabular-nums text-slate-400 dark:text-slate-500 cursor-help"
                                 :title="(sp.visual_annotations || []).slice(3).map(tag => typeof tag === 'object' && tag !== null ? (tag.name || tag.tag || tag.label || tag.term || '') : tag).join(', ')"
                                 x-text="'+' + (sp.visual_annotations.length - 3) + ' more'"></span>
                         </div>
                       </div>
                     </div>
                   </td>`,
                   extraCellsAfterTitle: `
                   <td class="p-3.5">
                     <div class="flex flex-col gap-1.5">
                       <div class="flex items-center gap-1.5 flex-wrap">
                         <template x-for="rk in (expandedPinRanks[sp.pin_id] ? getSortedPinRankings(sp) : getSortedPinRankings(sp).slice(0, 4))" :key="rk.keyword_id || rk.keyword">
                           <span class="px-2 py-0.5 rounded text-[10px] font-mono tabular-nums border flex items-center gap-1"
                                 :class="rk.is_displaced
                                   ? 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30'
                                   : (rk.rank_position != null && rk.rank_position <= 3) 
                                   ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30' 
                                   : (rk.rank_position != null && rk.rank_position <= 10) 
                                   ? 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/30' 
                                   : 'bg-slate-100 dark:bg-[#18181B] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-[#27272A]'">
                             <span x-show="rk.is_displaced" class="w-1.5 h-1.5 rounded-full bg-purple-500 inline-block shrink-0" aria-hidden="true"></span>
                             <span x-text="rk.keyword"></span>
                             <span x-show="rk.rank_position != null" class="font-bold" x-text="'#' + rk.rank_position"></span>
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
                           <span class="inline-flex items-center gap-1 text-[9px] font-mono tabular-nums px-1.5 py-0.2 rounded bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 font-semibold" :title="'Universal Bridge Tags: ' + sp.bridge_tags.join(', ')"><i data-lucide="git-merge" class="w-2.5 h-2.5 shrink-0"></i><span x-text="sp.bridge_tags.length + ' Bridges'"></span></span>
                         </template>
                       </div>
                     </div>
                   </td>`,
                   domainHtml: `
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
                           <div class="inline-flex items-center gap-0.5">
                             <button @click.stop="openCreatorVisualFeed(sp.creator_username)"
                                     class="p-0.5 rounded text-slate-400 hover:text-emerald-500 hover:bg-emerald-500/10 transition cursor-pointer"
                                     title="Instant 50-Pin Visual Feed (<350ms)">
                               <i data-lucide="layout-grid" class="w-3 h-3 text-emerald-500"></i>
                             </button>
                             <button type="button"
                                     @click.stop="sendCreatorToWatchlist(sp.creator_username, sp.creator_name || sp.creator_username)"
                                     class="p-0.5 rounded text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-500/10 transition cursor-pointer"
                                     title="Send Creator to Workspace Watchlist">
                               <i data-lucide="bookmark-plus" class="w-3 h-3"></i>
                             </button>
                           </div>
                         </template>
                       </div>
                     </div>
                   </td>`,
                   ageHtml: `
                   <td class="p-3.5 font-mono tabular-nums">
                     <div class="flex flex-col gap-1">
                       <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-[#18181B] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#27272A] inline-flex items-center gap-1 w-fit"
                             :title="'Created on Pinterest: ' + (sp.created_at_pinterest || 'N/A') + ' (' + (sp.pin_age_days != null ? sp.pin_age_days + ' days' : 'unknown') + ')'">
                         <i data-lucide="hourglass" class="w-3 h-3 shrink-0"></i>
                         <span x-text="formatUniversalAge(sp.pin_age_days)"></span>
                       </span>
                       <template x-if="sp.folder_age_days != null && (sp.pin_age_days == null || sp.folder_age_days <= sp.pin_age_days)">
                         <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 inline-flex items-center gap-1 w-fit"
                               :title="sp.tenure_source === 'first_seen' ? ('First seen in cluster SERPs: ' + sp.folder_age_days + ' days ago') : ('Keyword added to folder: ' + sp.folder_age_days + ' days ago')">
                           <i data-lucide="folder" class="w-3 h-3 shrink-0"></i>
                           <span x-text="sp.tenure_source === 'first_seen' ? (sp.folder_age_days + 'd tracked') : (sp.folder_age_days + 'd in folder')"></span>
                         </span>
                       </template>
                     </div>
                   </td>`,
                   savesHtml: `
                   <td class="p-3.5 font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400" x-text="formatNumber(sp.save_count)"></td>`,
                   velocityHtml: `
                   <td class="p-3.5 font-mono tabular-nums text-amber-600 dark:text-amber-400">
                     <div class="flex flex-col gap-0.5">
                       <span class="font-bold" :class="getPinWindowGain(sp) === null ? 'text-slate-400 dark:text-slate-500' : ''" x-text="formatPinWindowPrimary(sp)"></span>
                       <template x-if="(getPinWindowRepins(sp) || 0) > 0">
                         <span class="text-[10px] text-sky-500 dark:text-sky-400 font-semibold" x-text="(selectedTimeWindow === 'all' ? '' : '+') + formatNumber(getPinWindowRepins(sp)) + ' repins (' + (selectedTimeWindow === 'all' ? 'total' : selectedTimeWindow) + ')'"></span>
                       </template>
                       <template x-if="selectedTimeWindow === '24h' && sp.gains_7d != null">
                         <span class="text-[9px] text-slate-400" x-text="'+' + formatNumber(sp.gains_7d) + ' (7d)'"></span>
                       </template>
                       <template x-if="selectedTimeWindow !== '24h'">
                         <span class="text-[9px] text-slate-400" x-text="'+' + formatNumber(sp.effective_velocity ?? sp.daily_save_velocity ?? 0) + '/d avg'"></span>
                       </template>
                     </div>
                   </td>`,
                   actionsHtml: `
                   <td class="p-3.5 text-right font-sans">
                     <div class="flex items-center justify-end gap-1.5">
                       <button type="button" @click="queueSelectedForRelatedPins([sp.pin_id])" class="p-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-600 hover:text-white dark:bg-indigo-950/40 dark:hover:bg-indigo-600 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/80 transition-colors inline-flex items-center cursor-pointer shadow-2xs" title="Extract Related Pins (Queue as Campaign Pin Graph Seed)">
                         <i data-lucide="git-branch" class="w-3 h-3 shrink-0"></i>
                       </button>
                       <button type="button" @click="copyPinBlueprint(sp)" class="px-2 py-1 rounded-lg bg-rose-50 hover:bg-rose-600 hover:text-white dark:bg-rose-950/40 dark:hover:bg-rose-600 text-rose-700 dark:text-rose-300 text-xs font-semibold border border-rose-200 dark:border-rose-800/80 transition-colors inline-flex items-center gap-1 cursor-pointer shadow-2xs" title="Copy Scientific Pin Blueprint">
                         <i data-lucide="zap" class="w-3 h-3 shrink-0"></i>
                         <span>Blueprint</span>
                       </button>
                       <a :href="'/pin/' + sp.pin_id + '?folder_id=' + encodeURIComponent(activeFolder?.id || activeFolderId || '') + '&folder=' + encodeURIComponent(activeFolder?.name || '') + '&return_url=' + encodeURIComponent('/folders/' + (activeFolder?.id || activeFolderId || ''))" class="px-2 py-1 rounded-lg bg-slate-100 dark:bg-[#18181B] hover:bg-indigo-600 hover:text-white dark:hover:bg-indigo-600 text-slate-700 dark:text-slate-300 text-xs font-semibold border border-slate-200 dark:border-[#27272A] transition-colors inline-flex items-center gap-1 shadow-2xs" title="Open Full Pin Dossier">
                         <span>↗</span>
                       </a>
                     </div>
                   </td>`
                 })}
               </template>

              <tr x-show="crossoverLoading">
                <td colspan="8" class="p-10 text-center text-slate-500 font-sans">
                  <div class="flex items-center justify-center gap-2.5">
                    <i data-lucide="loader-2" class="w-4 h-4 animate-spin text-indigo-500 shrink-0"></i>
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
              <i data-lucide="sparkles" class="w-5 h-5"></i>
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
              <i data-lucide="clipboard-list" class="w-3.5 h-3.5 shrink-0"></i>
              <span>Copy All Annotations</span>
            </button>
          </div>
        </div>

        <!-- Unified 5-Tab Matrix Navigation Bar -->
        <div class="flex items-center justify-between gap-3 flex-wrap p-2 rounded-2xl bg-slate-50 dark:bg-[#18181B]/70 border border-slate-200 dark:border-[#27272A] text-xs font-mono tabular-nums">
          <div class="flex items-center gap-2 flex-wrap">
            <button type="button" @click="switchMatrixTab('pairs')" :class="(visualHubTab === 'pairs' || visualHubTab === 'all') ? 'bg-purple-600 text-white font-bold shadow-xs' : 'bg-white dark:bg-[#121215] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-[#27272A] hover:border-purple-500/40'" class="px-3 py-1.5 rounded-xl transition cursor-pointer inline-flex items-center gap-1.5">
              <i data-lucide="zap" class="w-3.5 h-3.5 shrink-0"></i><span>2-Tag Power Pairs (<span x-text="powerPairs.length"></span>)</span>
            </button>
            <button type="button" @click="switchMatrixTab('triplets')" :class="visualHubTab === 'triplets' ? 'bg-rose-600 text-white font-bold shadow-xs' : 'bg-white dark:bg-[#121215] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-[#27272A] hover:border-rose-500/40'" class="px-3 py-1.5 rounded-xl transition cursor-pointer inline-flex items-center gap-1.5">
              <i data-lucide="triangle" class="w-3.5 h-3.5 shrink-0"></i><span>3-Tag Triplets (<span x-text="powerTriplets.length"></span>)</span>
            </button>
            <button type="button" @click="switchMatrixTab('anchors')" :class="visualHubTab === 'anchors' ? 'bg-sky-600 text-white font-bold shadow-xs' : 'bg-white dark:bg-[#121215] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-[#27272A] hover:border-sky-500/40'" class="px-3 py-1.5 rounded-xl transition cursor-pointer inline-flex items-center gap-1.5">
              <i data-lucide="tag" class="w-3.5 h-3.5 shrink-0"></i><span>1-Tag Power Leaders &amp; Bridges (<span x-text="coreAnchorsList.length"></span>)</span>
            </button>
            <button type="button" @click="switchMatrixTab('guided')" :class="visualHubTab === 'guided' ? 'bg-amber-600 text-white font-bold shadow-xs' : 'bg-white dark:bg-[#121215] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-[#27272A] hover:border-amber-500/40'" class="px-3 py-1.5 rounded-xl transition cursor-pointer inline-flex items-center gap-1.5">
              <i data-lucide="target" class="w-3.5 h-3.5 shrink-0"></i><span>Guided Search Capsules (<span x-text="(crossoverData?.guided_pivots || []).length"></span>)</span>
            </button>
            <button type="button" @click="switchMatrixTab('colors')" :class="visualHubTab === 'colors' ? 'bg-emerald-600 text-white font-bold shadow-xs' : 'bg-white dark:bg-[#121215] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-[#27272A] hover:border-emerald-500/40'" class="px-3 py-1.5 rounded-xl transition cursor-pointer inline-flex items-center gap-1.5">
              <i data-lucide="palette" class="w-3.5 h-3.5 shrink-0"></i><span>Dominant Color Swatches (<span x-text="(crossoverData?.dominant_colors || []).length"></span>)</span>
            </button>
          </div>

          <!-- Search & Sort Controls for Active Matrix Tab -->
          <div class="flex items-center gap-2 flex-wrap">
            <template x-if="visualHubTab === 'anchors'">
              <div class="flex items-center gap-1 text-[11px]">
                <button type="button" @click="anchorsTier = 'all'; selectedMatrixIndex = 0" :class="anchorsTier === 'all' ? 'bg-sky-600 text-white font-bold' : 'bg-white dark:bg-[#121215] text-slate-500 border border-slate-200 dark:border-[#27272A]'" class="px-2 py-1 rounded-lg cursor-pointer">All</button>
                <button type="button" @click="anchorsTier = 'universal'; selectedMatrixIndex = 0" :class="anchorsTier === 'universal' ? 'bg-sky-600 text-white font-bold' : 'bg-white dark:bg-[#121215] text-slate-500 border border-slate-200 dark:border-[#27272A]'" class="px-2 py-1 rounded-lg cursor-pointer inline-flex items-center gap-1" title="Tags bridging >= 50% of cluster keywords"><i data-lucide="git-merge" class="w-3 h-3 shrink-0"></i><span>Bridges (≥50%)</span></button>
                <button type="button" @click="anchorsTier = 'whales'; selectedMatrixIndex = 0" :class="anchorsTier === 'whales' ? 'bg-sky-600 text-white font-bold' : 'bg-white dark:bg-[#121215] text-slate-500 border border-slate-200 dark:border-[#27272A]'" class="px-2 py-1 rounded-lg cursor-pointer inline-flex items-center gap-1" title="Tags appearing on >= 25 pins"><i data-lucide="gem" class="w-3 h-3 shrink-0"></i><span>Whales (≥25)</span></button>
              </div>
            </template>

            <div class="relative">
              <input type="text"
                     x-model="matrixSearch"
                     @input="selectedMatrixIndex = 0"
                     placeholder="Filter patterns or keywords..."
                     class="px-3 py-1.5 pl-8 rounded-xl text-xs bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500/30 w-44 sm:w-52 font-sans">
              <i data-lucide="search" class="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2 pointer-events-none"></i>
              <button x-show="matrixSearch" @click="matrixSearch = ''; selectedMatrixIndex = 0" class="absolute right-2.5 top-1.5 text-xs text-slate-400 hover:text-slate-600 cursor-pointer">✕</button>
            </div>

            <select x-model="matrixSort" @change="selectedMatrixIndex = 0" class="px-2.5 py-1.5 rounded-xl bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] text-slate-800 dark:text-slate-200 text-xs font-sans focus:outline-none cursor-pointer">
              <option value="velocity_desc">Sort: 24h Velocity (Fastest)</option>
              <option value="freq_desc">Sort: Pin Count (Most Pins)</option>
              <option value="keywords_desc">Sort: Keyword Coverage (Most KWs)</option>
              <option value="lift_desc">Sort: Synergy Lift / Score</option>
              <option value="saves_desc">Sort: Combined Saves</option>
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
                          <span x-show="item.is_universal" class="inline-flex text-indigo-500 shrink-0"><i data-lucide="git-merge" class="w-3 h-3"></i></span><span x-show="!item.is_universal" class="inline-flex text-slate-400 shrink-0"><i data-lucide="tag" class="w-3 h-3"></i></span>
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
                      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"><i data-lucide="zap" class="w-2.5 h-2.5 shrink-0"></i><span x-text="'+' + formatNumber(item.total_velocity ?? item.velocity_gain ?? 0) + '/d'"></span></span>
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
                        <i data-lucide="target" class="w-3.5 h-3.5 shrink-0"></i>
                        <span>Filter Cluster Table (<span x-text="getMatchingPinsForMatrixItem(getSelectedMatrixItem(), visualHubTab).length"></span> pins) ↑</span>
                      </button>
                      <button type="button"
                              @click="copyMatrixItemBlueprint(getSelectedMatrixItem(), visualHubTab)"
                              class="px-2.5 py-1.5 rounded-xl bg-white dark:bg-[#121215] hover:bg-slate-100 dark:hover:bg-[#27272A] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-[#27272A] text-xs font-bold font-mono tabular-nums transition flex items-center gap-1 cursor-pointer">
                        <i data-lucide="clipboard-list" class="w-3.5 h-3.5 shrink-0"></i>
                        <span>Blueprint</span>
                      </button>
                    </div>
                  </div>

                  <!-- Pattern Summary KPIs & Connected Keywords Strip -->
                  <div class="flex items-center gap-2 flex-wrap text-[11px] font-mono tabular-nums">
                    <span class="px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 font-bold"
                          x-text="(getSelectedMatrixItem().keywords_count || getSelectedMatrixItem().keyword_count || getSelectedMatrixItem().shared_count || 1) + ' Cluster Keywords'"></span>
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-bold"><i data-lucide="zap" class="w-3 h-3 shrink-0"></i><span x-text="'+' + formatNumber(getSelectedMatrixItem().total_velocity ?? getSelectedMatrixItem().velocity_gain ?? 0) + '/d save velocity'"></span></span>
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
                        <a :href="'/pin/' + mp.pin_id + '?folder_id=' + encodeURIComponent(activeFolder?.id || activeFolderId || '') + '&folder=' + encodeURIComponent(activeFolder?.name || '') + '&return_url=' + encodeURIComponent('/folders/' + (activeFolder?.id || activeFolderId || ''))" class="w-16 h-24 rounded-xl overflow-hidden border border-slate-200 dark:border-[#27272A] bg-slate-100 dark:bg-[#18181B] shrink-0 block hover:ring-2 hover:ring-purple-500 transition">
                          <img :src="mp.image_url || 'data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2260%22 height=%2290%22 viewBox=%220 0 60 90%22><rect width=%2260%22 height=%2290%22 rx=%224%22 fill=%22%2318181b%22/><text x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%2352525b%22 font-family=%22monospace%22 font-size=%2210%22>PIN</text></svg>'"
                               class="w-full h-full object-cover"
                               loading="lazy"
                               onerror="if(window.handlePinImgError){window.handlePinImgError(this)}else{this.onerror=null}">
                        </a>
                        <div class="flex flex-col gap-1 min-w-0 flex-1">
                          <a :href="'/pin/' + mp.pin_id + '?folder_id=' + encodeURIComponent(activeFolder?.id || activeFolderId || '') + '&folder=' + encodeURIComponent(activeFolder?.name || '') + '&return_url=' + encodeURIComponent('/folders/' + (activeFolder?.id || activeFolderId || ''))"
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
                            <span class="inline-flex items-center gap-0.5 text-slate-400"><i data-lucide="hourglass" class="w-2.5 h-2.5 shrink-0"></i><span x-text="formatUniversalAge(mp.pin_age_days)"></span></span>
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
                        <button type="button" @click="copyPinBlueprint(mp)" class="px-2 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-600 hover:text-white text-rose-600 dark:text-rose-400 font-bold border border-rose-500/20 transition cursor-pointer inline-flex items-center gap-1">
                          <i data-lucide="zap" class="w-3 h-3 shrink-0"></i><span>Blueprint</span>
                        </button>
                        <a :href="'/pin/' + mp.pin_id + '?folder_id=' + encodeURIComponent(activeFolder?.id || activeFolderId || '') + '&folder=' + encodeURIComponent(activeFolder?.name || '') + '&return_url=' + encodeURIComponent('/folders/' + (activeFolder?.id || activeFolderId || ''))" class="text-indigo-600 dark:text-indigo-400 hover:underline font-bold">
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
              <div class="flex items-center gap-2 flex-wrap">
                <h3 class="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <i data-lucide="settings" class="w-4 h-4 text-slate-500 shrink-0"></i>
                  <span>Campaign Settings &amp; Smart Bulk Pin Pruning</span>
                </h3>
                <span x-show="isCampaignPausedOrBlocked()" x-cloak class="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300/60 dark:border-amber-700/60" x-text="getCampaignPausedBadgeLabel()"></span>
              </div>
              <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">Configure automated fleet crawling controls, harvest quotas, and clean out low-performing pins.</p>
            </div>
            <div class="flex items-center gap-2.5">
              <span x-show="hasUnsavedSettingsChanges()" x-cloak class="px-2 py-1 rounded-lg text-[11px] font-mono font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60">Unsaved changes</span>
              <button type="button" @click="saveFolderSettings(false)" :disabled="settingsLoading || !activeFolder" class="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 disabled:opacity-50 disabled:cursor-not-allowed text-white transition flex items-center gap-1.5 shadow-sm cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">
                <span x-text="settingsLoading ? 'Saving Settings...' : 'Save Settings'"></span>
              </button>
            </div>
          </div>

          <!-- Compact Folder Identity Bar -->
          <div class="pt-5 pb-2 border-b border-slate-100 dark:border-[#27272A] grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label for="room5-folder-name" class="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">Campaign Name</label>
              <input id="room5-folder-name" type="text" maxlength="255" x-model="folderSettings.name" placeholder="e.g. High Protein Meals" class="w-full mt-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50/70 dark:bg-[#18181B] text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500">
            </div>
            <div>
              <label for="room5-folder-desc" class="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">Description</label>
              <input id="room5-folder-desc" type="text" x-model="folderSettings.description" placeholder="Campaign Topic Cluster &amp; Cross-SERP Intelligence" class="w-full mt-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50/70 dark:bg-[#18181B] text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500">
            </div>
            <div>
              <span class="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 block">Theme Color</span>
              <div class="flex items-center gap-2 mt-2">
                <template x-for="c in colorOptions" :key="c">
                  <button type="button" @click="folderSettings.color = c" :aria-label="'Select folder color ' + c" :aria-pressed="folderSettings.color === c ? 'true' : 'false'" class="w-6 h-6 rounded-lg border-2 transition-transform cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-1" :class="folderSettings.color === c ? 'scale-110 border-slate-900 dark:border-white shadow' : 'border-transparent'" :style="'background-color: ' + c"></button>
                </template>
              </div>
            </div>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-6">
            <!-- Left: Fleet Execution & Crawler Controls -->
            <div class="space-y-4">
              <h4 class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 font-mono">Crawler &amp; Fleet Execution Controls</h4>
              
              <!-- Pause Competitor Crawlers Toggle -->
              <div class="p-4 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50/60 dark:bg-[#18181B]/60 flex items-center justify-between gap-3">
                <div>
                  <label for="room5-toggle-pause-competitors" class="text-xs font-semibold text-slate-900 dark:text-white cursor-pointer">Pause Competitor Crawlers</label>
                  <div class="text-[11px] text-slate-500 dark:text-slate-400">Temporarily prevent competitor profile and board scraping for this folder.</div>
                </div>
                <label class="relative inline-flex items-center cursor-pointer shrink-0">
                  <input id="room5-toggle-pause-competitors" type="checkbox" aria-label="Pause Competitor Crawlers" x-model="folderSettings.pause_competitors" class="sr-only peer">
                  <div class="w-9 h-5 bg-slate-300 peer-focus-visible:ring-2 peer-focus-visible:ring-rose-500 peer-focus-visible:ring-offset-1 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rose-600"></div>
                </label>
              </div>

              <!-- Pause SERP Crawlers Toggle -->
              <div class="p-4 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50/60 dark:bg-[#18181B]/60 flex items-center justify-between gap-3">
                <div>
                  <label for="room5-toggle-pause-crawlers" class="text-xs font-semibold text-slate-900 dark:text-white cursor-pointer">Pause SERP Crawlers</label>
                  <div class="text-[11px] text-slate-500 dark:text-slate-400">Suspend automated daily SERP ranking snapshots for folder keywords.</div>
                </div>
                <label class="relative inline-flex items-center cursor-pointer shrink-0">
                  <input id="room5-toggle-pause-crawlers" type="checkbox" aria-label="Pause SERP Crawlers" x-model="folderSettings.pause_crawlers" class="sr-only peer">
                  <div class="w-9 h-5 bg-slate-300 peer-focus-visible:ring-2 peer-focus-visible:ring-rose-500 peer-focus-visible:ring-offset-1 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rose-600"></div>
                </label>
              </div>

              <!-- Emergency Block Fleet Toggle -->
              <div class="p-4 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50/60 dark:bg-[#18181B]/60 flex items-center justify-between gap-3">
                <div>
                  <label for="room5-toggle-block-fleet" class="text-xs font-semibold text-slate-900 dark:text-white cursor-pointer">Block Fleet Ingestion</label>
                  <div class="text-[11px] text-slate-500 dark:text-slate-400">Hard stop: refuse all incoming GitHub Actions fleet crawler batches.</div>
                </div>
                <label class="relative inline-flex items-center cursor-pointer shrink-0">
                  <input id="room5-toggle-block-fleet" type="checkbox" aria-label="Block Fleet Ingestion" x-model="folderSettings.block_fleet" class="sr-only peer">
                  <div class="w-9 h-5 bg-slate-300 peer-focus-visible:ring-2 peer-focus-visible:ring-rose-500 peer-focus-visible:ring-offset-1 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rose-600"></div>
                </label>
              </div>

              <!-- Auto-Discover Creators Toggle -->
              <div class="p-4 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50/60 dark:bg-[#18181B]/60 flex items-center justify-between gap-3">
                <div>
                  <label for="room5-toggle-auto-discover" class="text-xs font-semibold text-slate-900 dark:text-white cursor-pointer">Auto-Discover Creators</label>
                  <div class="text-[11px] text-slate-500 dark:text-slate-400">Automatically register active ranking creators from SERP crawls into Creator Hub.</div>
                </div>
                <label class="relative inline-flex items-center cursor-pointer shrink-0">
                  <input id="room5-toggle-auto-discover" type="checkbox" aria-label="Auto-Discover Creators" x-model="folderSettings.auto_discover_creators" class="sr-only peer">
                  <div class="w-9 h-5 bg-slate-300 peer-focus-visible:ring-2 peer-focus-visible:ring-rose-500 peer-focus-visible:ring-offset-1 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rose-600"></div>
                </label>
              </div>

              <!-- V4 Wave 4: Campaign Pin Graph Rules Override -->
              <div class="p-4 rounded-xl border border-emerald-500/25 bg-emerald-500/5 space-y-3">
                <div class="flex items-center justify-between flex-wrap gap-2">
                  <div class="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <i data-lucide="git-branch" class="w-3.5 h-3.5 text-emerald-500 shrink-0"></i><span>Pin Graph Rules (Related Pins)</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold"
                          :class="isPinGraphInherited() ? 'bg-slate-200/80 dark:bg-[#27272A] text-slate-600 dark:text-slate-300' : 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'"
                          x-text="isPinGraphInherited() ? 'Inherited from Workspace' : 'Custom Override'"></span>
                    <button type="button" x-show="!isPinGraphInherited()" @click="resetPinGraphToWorkspace()" class="text-[10px] font-semibold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 rounded">Reset</button>
                    <a href="/settings" class="text-[10px] font-mono text-indigo-500 hover:underline">Defaults</a>
                  </div>
                </div>
                <label class="flex items-center justify-between text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <span>Auto-track qualifying Related Pins</span>
                  <input type="checkbox" x-model="folderSettings.pin_graph_rules.auto_trigger_enabled" @change="pinGraphInherited = false" class="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500">
                </label>
                <label class="flex items-center justify-between text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <span>Linkless pins only (Arbitrage Vacuum)</span>
                  <input type="checkbox" x-model="folderSettings.pin_graph_rules.linkless_only" @change="pinGraphInherited = false" class="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500">
                </label>
                <div class="grid grid-cols-2 gap-2">
                  <div>
                    <label for="room5-pgr-min-repins" class="text-[10px] uppercase font-mono text-slate-500">Min Re-pins</label>
                    <input id="room5-pgr-min-repins" type="number" min="0" x-model.number="folderSettings.pin_graph_rules.min_repins" @input="pinGraphInherited = false" class="w-full mt-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] text-slate-900 dark:text-white font-mono tabular-nums text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500">
                  </div>
                  <div>
                    <label for="room5-pgr-max-pages" class="text-[10px] uppercase font-mono text-slate-500">Max Pages / Seed</label>
                    <input id="room5-pgr-max-pages" type="number" min="1" max="200" x-model.number="folderSettings.pin_graph_rules.max_pages" @input="pinGraphInherited = false" class="w-full mt-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] text-slate-900 dark:text-white font-mono tabular-nums text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500">
                  </div>
                </div>
              </div>
            </div>

            <!-- Right: Quotas & Smart Bulk Pin Pruning -->
            <div class="space-y-4">
              <h4 class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 font-mono">Harvest Quotas &amp; Pruning Engine</h4>

              <div class="p-4 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50/60 dark:bg-[#18181B]/60 space-y-3">
                <div class="flex items-center justify-between">
                  <label for="room5-max-serp-pins" class="text-xs font-semibold text-slate-900 dark:text-white">Max SERP Pins Harvest Quota</label>
                  <span class="text-xs font-mono tabular-nums font-bold text-rose-600 dark:text-rose-400" x-text="folderSettings.max_serp_pins + ' pins'"></span>
                </div>
                <input id="room5-max-serp-pins" type="range" min="10" max="500" step="5" x-model.number="folderSettings.max_serp_pins" @input="folderSettings.max_pins = folderSettings.max_serp_pins" class="w-full accent-rose-600">
                <div class="flex justify-between text-[10px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  <span>10 (Min)</span>
                  <span>100 (Standard)</span>
                  <span>500 (Deep)</span>
                </div>
              </div>

              <div class="p-4 rounded-xl border border-indigo-500/20 bg-indigo-50/30 dark:bg-indigo-950/10 space-y-3">
                <div class="flex items-center justify-between flex-wrap gap-2">
                  <div class="flex items-center gap-2">
                    <label for="room5-serp-top-n" class="text-xs font-semibold text-slate-900 dark:text-white">Daily Tracked SERP Top-N</label>
                    <span class="px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold"
                          :class="isSerpTopNInherited() ? 'bg-slate-200/80 dark:bg-[#27272A] text-slate-600 dark:text-slate-300' : 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'"
                          x-text="isSerpTopNInherited() ? 'Inherited from Workspace' : 'Custom Override'"></span>
                    <button type="button" x-show="!isSerpTopNInherited()" @click="resetSerpTopNToWorkspace()" class="text-[10px] font-semibold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 rounded">Reset</button>
                  </div>
                  <span class="text-xs font-mono tabular-nums font-bold text-indigo-600 dark:text-indigo-400" x-text="'Top ' + (folderSettings.serp_top_n || workspaceSettingsDefaults.default_serp_top_n || 20) + ' pins / keyword'"></span>
                </div>
                <input id="room5-serp-top-n" type="range" min="5" max="100" step="5" x-model.number="folderSettings.serp_top_n" @input="serpTopNInherited = false" class="w-full accent-indigo-600">
                <div class="flex justify-between text-[10px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  <span>Top 5</span>
                  <span x-text="'Top ' + (workspaceSettingsDefaults.default_serp_top_n || 20) + ' (Workspace Default)'">Top 20 (Workspace Default)</span>
                  <span>Top 100</span>
                </div>
              </div>

              <!-- Smart Bulk Pin Pruning Box -->
              <div class="p-4 rounded-xl border border-rose-500/20 bg-rose-50/30 dark:bg-rose-950/10 space-y-3">
                <div class="flex items-center justify-between gap-2">
                  <div class="flex items-center gap-2">
                    <i data-lucide="scissors" class="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0"></i>
                    <div class="text-xs font-bold text-slate-900 dark:text-white">Smart Bulk Pin Pruning</div>
                  </div>
                  <span class="text-[10px] font-mono text-slate-500 dark:text-slate-400">Skips unhydrated pins</span>
                </div>
                <p class="text-[11px] text-slate-500 dark:text-slate-400">Preview and remove low-traction pins across campaign keywords while preserving unhydrated and rising pins.</p>

                <div>
                  <label for="room5-prune-scope" class="text-[10px] uppercase font-mono text-slate-500">Target Scope</label>
                  <select id="room5-prune-scope" x-model="pruneForm.scope" @change="invalidatePrunePreview()" class="w-full mt-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] text-slate-900 dark:text-white font-mono text-xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-rose-500">
                    <option value="displaced">Displaced Vault Pins</option>
                    <option value="all">All Cluster Pins (Active + Vault)</option>
                    <option value="active">Active SERP Only</option>
                  </select>
                </div>

                <div class="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <label for="room5-prune-min-age" class="text-[10px] uppercase font-mono text-slate-500">Min Pin Age (Days)</label>
                    <input id="room5-prune-min-age" type="number" x-model="pruneForm.min_pin_age_days" @input="invalidatePrunePreview()" min="0" placeholder="30" class="w-full mt-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] text-slate-900 dark:text-white font-mono tabular-nums text-xs focus:outline-none focus:ring-2 focus:ring-rose-500">
                  </div>
                  <div>
                    <label for="room5-prune-max-saves" class="text-[10px] uppercase font-mono text-slate-500">Max Saves</label>
                    <input id="room5-prune-max-saves" type="number" x-model="pruneForm.max_saves" @input="invalidatePrunePreview()" min="0" placeholder="5" class="w-full mt-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] text-slate-900 dark:text-white font-mono tabular-nums text-xs focus:outline-none focus:ring-2 focus:ring-rose-500">
                  </div>
                  <div>
                    <label for="room5-prune-min-folder-age" class="text-[10px] uppercase font-mono text-slate-500">Min Days in Folder</label>
                    <input id="room5-prune-min-folder-age" type="number" x-model="pruneForm.min_folder_age_days" @input="invalidatePrunePreview()" min="0" placeholder="Any" class="w-full mt-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] text-slate-900 dark:text-white font-mono tabular-nums text-xs focus:outline-none focus:ring-2 focus:ring-rose-500">
                  </div>
                  <div>
                    <label for="room5-prune-max-repins" class="text-[10px] uppercase font-mono text-slate-500">Max Repins</label>
                    <input id="room5-prune-max-repins" type="number" x-model="pruneForm.max_repins" @input="invalidatePrunePreview()" min="0" placeholder="Any" class="w-full mt-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] text-slate-900 dark:text-white font-mono tabular-nums text-xs focus:outline-none focus:ring-2 focus:ring-rose-500">
                  </div>
                </div>

                <label for="room5-prune-skip-rising" class="flex items-center justify-between text-xs text-slate-700 dark:text-slate-300 cursor-pointer pt-0.5">
                  <span>Skip pins with 24h velocity &gt; 0</span>
                  <input id="room5-prune-skip-rising" type="checkbox" x-model="pruneForm.skip_rising_velocity" @change="invalidatePrunePreview()" class="rounded border-slate-300 text-rose-600 focus:ring-rose-500">
                </label>

                <template x-if="(activeFolder?.items || []).length > 0">
                  <div class="space-y-1.5 pt-1">
                    <div class="flex items-center justify-between text-[10px] font-mono uppercase text-slate-500">
                      <span x-text="pruneForm.keyword_ids.length ? ('Keywords (' + pruneForm.keyword_ids.length + ' selected)') : ('Keywords (All ' + activeFolder.items.length + ')')"></span>
                      <button type="button" x-show="pruneForm.keyword_ids.length > 0" @click="pruneForm.keyword_ids = []; invalidatePrunePreview()" class="text-rose-600 dark:text-rose-400 hover:underline cursor-pointer">All</button>
                    </div>
                    <div class="flex flex-wrap gap-1 max-h-20 overflow-y-auto p-1.5 rounded-lg bg-white/80 dark:bg-[#121215]/80 border border-slate-200 dark:border-[#27272A]">
                      <template x-for="kw in activeFolder.items" :key="kw.keyword_id || kw.id">
                        <button type="button" @click="togglePruneKeywordId(kw.keyword_id || kw.id)" :aria-pressed="pruneForm.keyword_ids.includes(Number(kw.keyword_id || kw.id)) ? 'true' : 'false'" class="px-2 py-0.5 rounded text-[10px] font-mono transition cursor-pointer border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500" :class="pruneForm.keyword_ids.includes(Number(kw.keyword_id || kw.id)) ? 'bg-rose-600 text-white border-rose-600 font-semibold' : 'bg-slate-50 dark:bg-[#18181B] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-[#27272A]'" x-text="kw.keyword"></button>
                      </template>
                    </div>
                  </div>
                </template>

                <!-- Preview Candidate Feedback -->
                <div x-show="prunePreviewResult" x-cloak class="p-2.5 rounded-lg bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] text-xs font-mono space-y-2">
                  <div class="flex items-center justify-between text-slate-700 dark:text-slate-300">
                    <span>Candidates found:</span>
                    <span class="font-bold tabular-nums text-amber-700 dark:text-amber-400" x-text="prunePreviewResult?.candidates_count ?? prunePreviewResult?.matched_count ?? 0"></span>
                  </div>
                  <template x-if="(prunePreviewResult?.sample_pins || []).length > 0">
                    <div class="border-t border-slate-100 dark:border-[#27272A] pt-2 max-h-36 overflow-y-auto space-y-1 text-[11px]">
                      <template x-for="sp in (prunePreviewResult?.sample_pins || []).slice(0, 15)" :key="sp.keyword_id + ':' + sp.pin_id">
                        <div class="flex items-center justify-between gap-2 py-0.5">
                          <a :href="'/pin/' + sp.pin_id + '?folder_id=' + encodeURIComponent(activeFolder?.id || activeFolderId || '')" class="truncate text-indigo-600 dark:text-indigo-400 hover:underline font-sans" x-text="sp.title || ('Pin #' + sp.pin_id)"></a>
                          <span class="shrink-0 tabular-nums text-[10px] text-slate-500" x-text="(sp.save_count ?? '—') + 's · ' + (sp.repin_count ?? '—') + 'r'"></span>
                        </div>
                      </template>
                    </div>
                  </template>
                </div>

                <div class="flex items-center gap-2 pt-1">
                  <button type="button" @click="runPrunePreview()" :disabled="pruningLoading" class="flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold bg-slate-200 hover:bg-slate-300 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-slate-800 dark:text-slate-200 transition cursor-pointer disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">
                    <span x-text="pruningLoading ? 'Inspecting...' : 'Preview Candidates (Dry-Run)'"></span>
                  </button>
                  <button type="button" @click="executePrune()" :disabled="pruningLoading || !(prunePreviewResult?.candidates_count || prunePreviewResult?.matched_count)" class="flex-1 py-1.5 px-3 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500" x-text="pruningLoading ? 'Pruning...' : ('Prune ' + (prunePreviewResult?.candidates_count ?? prunePreviewResult?.matched_count ?? 0) + ' Pins')"></button>
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
