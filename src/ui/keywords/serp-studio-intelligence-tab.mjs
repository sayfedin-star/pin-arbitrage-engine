/**
 * Level 2 SERP Radar Studio — Tab 4: PinClicks Intelligence, Domain Authority & Visual Annotations
 */
export function renderSerpStudioIntelligenceTab() {
  return `      <!-- TAB 4: PINCLICKS INTELLIGENCE & ARBITRAGE BREAKDOWN -->
      <div x-show="activeTab === 'intelligence'" class="p-4 sm:p-6 space-y-6">

        <!-- Scope Segment Selector: Active SERP vs Full Catalog (All Pins) -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-slate-50/90 dark:bg-slate-900/80 border border-slate-200/80 dark:border-[#27272A]">
          <div class="flex items-center space-x-3">
            <div class="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center shrink-0">
              <i data-lucide="layers" class="w-4 h-4"></i>
            </div>
            <div>
              <div class="flex items-center space-x-2">
                <span class="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">Intelligence Scope</span>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-mono tabular-nums font-bold bg-purple-500/15 text-purple-500"
                      x-text="intelScope === 'all' ? ('Full Historical Catalog (#' + totalCatalogCount + ' Pins)') : ('Active Live SERP (#' + (selectedKeywordDetails?.current_pins?.length || 0) + ' Pins)')"></span>
              </div>
              <p class="text-[11px] text-slate-500">Toggle analysis between live ranking active SERP pins and the full collected catalog (including Displaced Vault pins).</p>
            </div>
          </div>

          <div class="flex items-center p-1 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-[#27272A] gap-1 self-start sm:self-auto shrink-0">
            <button @click="intelScope = 'all'"
                    class="px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center space-x-1.5"
                    :class="intelScope === 'all' ? 'bg-purple-500 text-white shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'">
              <i data-lucide="circle-dot" class="w-3.5 h-3.5 shrink-0"></i><span>Full Catalog</span>
              <span class="px-1.5 py-0.2 rounded-full text-[10px] font-mono tabular-nums font-bold"
                    :class="intelScope === 'all' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'"
                    x-text="totalCatalogCount > allCombinedPins.length ? ('#' + allCombinedPins.length + ' / ' + totalCatalogCount) : ('#' + totalCatalogCount)"></span>
            </button>
            <button @click="intelScope = 'active'"
                    class="px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center space-x-1.5"
                    :class="intelScope === 'active' ? 'bg-emerald-500 text-white shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'">
              <span class="w-2 h-2 rounded-full bg-emerald-500 inline-block shrink-0" aria-hidden="true"></span><span>Active SERP</span>
              <span class="px-1.5 py-0.2 rounded-full text-[10px] font-mono tabular-nums font-bold"
                    :class="intelScope === 'active' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'"
                    x-text="'#' + (selectedKeywordDetails?.current_pins?.length || 0)"></span>
            </button>
          </div>
        </div>

        <!-- Top 4-Metric Grid -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <!-- 1: StaticRank & Saves Baseline -->
          <div class="p-5 rounded-3xl bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200/80 dark:border-[#27272A]/80 space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono tabular-nums">SERP Engagement</span>
              <div class="w-7 h-7 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                <i data-lucide="bookmark" class="w-3.5 h-3.5"></i>
              </div>
            </div>
            <div class="space-y-2">
              <div class="flex items-center justify-between text-xs">
                <span class="text-slate-500">Total Analyzed Pins</span>
                <span class="font-mono tabular-nums font-bold text-slate-900 dark:text-white" x-text="totalAnalyzedPinsCount"></span>
              </div>
              <div class="flex items-center justify-between text-xs">
                <span class="text-slate-500">Avg Saves / Pin</span>
                <span class="font-mono tabular-nums font-bold text-emerald-500" x-text="formatNumber(analyzedAvgSaves)"></span>
              </div>
              <div class="flex items-center justify-between text-xs">
                <span class="text-slate-500">Median Saves</span>
                <span class="font-mono tabular-nums font-bold text-slate-700 dark:text-slate-300" x-text="formatNumber(analyzedMedianSaves)"></span>
              </div>
            </div>
          </div>

          <!-- 2: Domain Concentration & Repeat Frequency -->
          <div class="p-5 rounded-3xl bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200/80 dark:border-[#27272A]/80 space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono tabular-nums">Domain Authority</span>
              <div class="w-7 h-7 rounded-xl bg-cyan-500/10 text-cyan-500 flex items-center justify-center">
                <i data-lucide="globe" class="w-3.5 h-3.5"></i>
              </div>
            </div>
            <div class="space-y-2">
              <div class="flex items-center justify-between text-xs">
                <span class="text-slate-500">Unique Domains</span>
                <span class="font-mono tabular-nums font-bold text-slate-900 dark:text-white" x-text="uniqueDomainsCount"></span>
              </div>
              <div class="flex items-center justify-between text-xs">
                <span class="text-slate-500">Repeated Domains (>1 Pin)</span>
                <span class="font-mono tabular-nums font-bold text-amber-500" x-text="repeatedDomainsCount"></span>
              </div>
              <div class="flex items-center justify-between text-xs">
                <span class="text-slate-500">Top Ranked Domain</span>
                <span class="font-mono tabular-nums font-bold text-purple-400 truncate max-w-[120px]" x-text="selectedKeywordDetails?.intelligence?.top_domain || domainBreakdownList[0]?.domain || 'N/A'"></span>
              </div>
            </div>
          </div>

          <!-- 3: Creative Formats & Canvas Aspect Ratios -->
          <div class="p-5 rounded-3xl bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200/80 dark:border-[#27272A]/80 space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono tabular-nums">Visual Formats</span>
              <div class="w-7 h-7 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center">
                <i data-lucide="image" class="w-3.5 h-3.5"></i>
              </div>
            </div>
            <div class="space-y-2">
              <div class="flex items-center justify-between text-xs">
                <span class="text-slate-500">Standard Static (2:3)</span>
                <span class="font-mono tabular-nums font-bold text-emerald-500" x-text="analyzedVisualFormats.standard_pct + '%'"></span>
              </div>
              <div class="flex items-center justify-between text-xs">
                <span class="text-slate-500">Extra Tall (1:2)</span>
                <span class="font-mono tabular-nums font-bold text-amber-400" x-text="analyzedVisualFormats.extra_tall_pct + '%'"></span>
              </div>
              <div class="flex items-center justify-between text-xs">
                <span class="text-slate-500">Video & Idea Pins</span>
                <span class="font-mono tabular-nums font-bold text-cyan-500" x-text="analyzedVisualFormats.video_idea_pct + '%'"></span>
              </div>
            </div>
          </div>

          <!-- 4: Opportunity Verdict -->
          <div class="p-5 rounded-3xl bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200/80 dark:border-[#27272A]/80 space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono tabular-nums">Opportunity Verdict</span>
              <div class="w-7 h-7 rounded-xl bg-pink-500/10 text-pink-500 flex items-center justify-center">
                <i data-lucide="trending-up" class="w-3.5 h-3.5"></i>
              </div>
            </div>
            <div class="space-y-1.5">
              <div class="text-xs font-black truncate" x-text="selectedKeywordDetails?.intelligence?.opportunity?.badge || 'Calculating...'"></div>
              <p class="text-[11px] text-slate-500 leading-snug line-clamp-2" x-text="selectedKeywordDetails?.intelligence?.opportunity?.summary || 'Waiting for SERP intelligence telemetry.'"></p>
            </div>
          </div>
        </div>

        <!-- SECTION 1: DOMAIN AUTHORITY & REPEAT FREQUENCY BREAKDOWN -->
        <div class="p-5 rounded-3xl bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200/80 dark:border-[#27272A]/80 space-y-4">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/80 dark:border-[#27272A]">
            <div class="flex items-center space-x-3">
              <div class="w-8 h-8 rounded-xl bg-cyan-500/10 text-cyan-500 flex items-center justify-center">
                <i data-lucide="globe" class="w-4 h-4"></i>
              </div>
              <div>
                <div class="flex items-center space-x-2">
                  <h3 class="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">Domain Authority & Repeat Frequency Breakdown</h3>
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-mono tabular-nums font-bold bg-amber-500/15 text-amber-500 border border-amber-500/30"
                        x-text="repeatedDomainsCount + ' Repeated Domains'"></span>
                </div>
                <p class="text-xs text-slate-500 mt-0.5">Footprint analysis of websites ranking in organic SERP. Multi-pin presence indicates authority concentration or programmatic scale.</p>
              </div>
            </div>

            <div class="flex items-center space-x-2 flex-wrap gap-2">
              <!-- Search Domain -->
              <div class="relative">
                <input type="text"
                       x-model="domainSearch"
                       @input="domainPage = 1"
                       placeholder="Filter domains..."
                       class="px-3 py-1.5 pl-8 rounded-xl text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 w-40 sm:w-48 font-sans">
                <i data-lucide="search" class="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2 pointer-events-none"></i>
                <button x-show="domainSearch" @click="domainSearch = ''; domainPage = 1" class="absolute right-2.5 top-1.5 text-xs text-slate-400 hover:text-slate-600 cursor-pointer">✕</button>
              </div>

              <span class="text-xs text-slate-500 font-mono tabular-nums" x-text="filteredDomainsList().length + ' Domains'"></span>

              <template x-if="activeDomainFilter">
                <button @click="activeDomainFilter = ''" class="px-2 py-1 rounded-xl text-[11px] font-bold bg-rose-500/15 text-rose-500 hover:bg-rose-500/25 transition flex items-center space-x-1 cursor-pointer">
                  <i data-lucide="x" class="w-3 h-3"></i>
                  <span>Clear Filter</span>
                </button>
              </template>
            </div>
          </div>

          <!-- Domain Table -->
          <div class="overflow-x-auto rounded-2xl border border-slate-200 dark:border-[#27272A]">
            <table class="w-full text-left text-xs">
              <thead class="bg-slate-100/70 dark:bg-slate-900/80 text-slate-500 uppercase font-mono tabular-nums text-[10px] tracking-wider border-b border-slate-200 dark:border-[#27272A]">
                <tr>
                  <th class="py-3 px-3 w-12 text-center">#</th>
                  <th class="py-3 px-4">Domain Name</th>
                  <th class="py-3 px-3 text-center">Ranking Pins</th>
                  <th class="py-3 px-4">SERP Share</th>
                  <th class="py-3 px-3 text-right">Total Saves</th>
                  <th class="py-3 px-3 text-center">Best Rank</th>
                  <th class="py-3 px-3 text-center w-28">Action</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-200/80 dark:divide-slate-800/80 bg-white dark:bg-[#121215]">
                <template x-for="(dom, idx) in paginatedDomainsList()" :key="dom.domain">
                  <tr class="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition">
                    <td class="py-3 px-3 text-center font-mono tabular-nums text-slate-400 font-bold" x-text="((domainPage - 1) * domainPageSize) + idx + 1"></td>
                    <td class="py-3 px-4">
                      <div class="flex items-center space-x-2">
                        <a :href="'https://' + dom.domain" target="_blank" rel="noopener noreferrer"
                           class="font-mono tabular-nums font-bold text-slate-900 dark:text-white hover:text-cyan-500 dark:hover:text-cyan-400 transition flex items-center space-x-1.5 group">
                          <span x-text="dom.domain"></span>
                          <i data-lucide="external-link" class="w-3 h-3 text-slate-400 group-hover:text-cyan-400 transition"></i>
                        </a>
                        <template x-if="dom.pin_count > 1">
                          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-mono tabular-nums font-black bg-amber-500/15 text-amber-500 border border-amber-500/30"><i data-lucide="flame" class="w-2.5 h-2.5 shrink-0"></i><span x-text="dom.pin_count + ' Pins'"></span></span>
                        </template>
                      </div>
                    </td>
                    <td class="py-3 px-3 text-center">
                      <span class="px-2 py-0.5 rounded-lg text-xs font-mono tabular-nums font-bold"
                            :class="dom.pin_count > 1 ? 'bg-amber-500/15 text-amber-500 font-black' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'"
                            x-text="dom.pin_count"></span>
                    </td>
                    <td class="py-3 px-4">
                      <div class="space-y-1 max-w-[140px]">
                        <div class="flex items-center justify-between text-[11px] font-mono tabular-nums font-bold">
                          <span class="text-purple-400" x-text="dom.share_pct + '%'"></span>
                        </div>
                        <div class="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div class="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full transition-all duration-300"
                               :style="'width: ' + Math.min(100, dom.share_pct * 2.5) + '%'"></div>
                        </div>
                      </div>
                    </td>
                    <td class="py-3 px-3 text-right font-mono tabular-nums font-bold text-emerald-500" x-text="formatNumber(dom.total_saves)"></td>
                    <td class="py-3 px-3 text-center">
                      <span class="px-2 py-0.5 rounded-lg text-[11px] font-mono tabular-nums font-bold"
                            :class="dom.best_rank <= 5 ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30' : (dom.best_rank <= 20 ? 'bg-cyan-500/15 text-cyan-500' : 'bg-slate-100 dark:bg-slate-800 text-slate-400')"
                            x-text="'#' + dom.best_rank"></span>
                    </td>
                    <td class="py-3 px-3 text-center">
                      <button @click="filterByDomain(dom.domain)"
                              class="px-2.5 py-1 rounded-xl text-[11px] font-bold font-mono tabular-nums transition flex items-center justify-center space-x-1 w-full cursor-pointer"
                              :class="activeDomainFilter === dom.domain.toLowerCase() ? 'bg-cyan-600 text-white shadow-xs' : 'bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border border-cyan-500/25'">
                        <i data-lucide="filter" class="w-3 h-3"></i>
                        <span x-text="activeDomainFilter === dom.domain.toLowerCase() ? 'Filtered' : 'Filter Pins'"></span>
                      </button>
                    </td>
                  </tr>
                </template>

                <template x-if="filteredDomainsList().length === 0">
                  <tr>
                    <td colspan="7" class="py-8 text-center text-xs text-slate-400 font-mono tabular-nums">
                      No domain data matches current search filter.
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>

          <!-- Domain Pagination Footer -->
          <div x-show="filteredDomainsList().length > domainPageSize" class="flex items-center justify-between p-3 rounded-2xl bg-white/60 dark:bg-slate-950/40 border border-slate-200 dark:border-[#27272A] text-xs font-mono tabular-nums">
            <span class="text-slate-500 dark:text-slate-400"
                  x-text="'Showing ' + (((domainPage - 1) * domainPageSize) + 1) + '-' + Math.min(domainPage * domainPageSize, filteredDomainsList().length) + ' of ' + filteredDomainsList().length + ' domains'"></span>
            <div class="flex items-center gap-1.5">
              <button :disabled="domainPage <= 1" @click="domainPage--" class="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-slate-900 disabled:opacity-40 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition">← Prev</button>
              <span class="px-2 py-1 font-bold text-slate-700 dark:text-slate-300" x-text="domainPage + ' / ' + totalDomainsPages()"></span>
              <button :disabled="domainPage >= totalDomainsPages()" @click="domainPage++" class="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-slate-900 disabled:opacity-40 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition">Next →</button>
            </div>
          </div>
        </div>

        <!-- SECTION 2: VISUAL ANNOTATIONS CROSSOVER HUB & CO-OCCURRING POWER PAIRS -->
        <div class="p-5 rounded-3xl bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200/80 dark:border-[#27272A]/80 space-y-5">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/80 dark:border-[#27272A]">
            <div class="flex items-center space-x-3">
              <div class="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center">
                <i data-lucide="sparkles" class="w-4 h-4"></i>
              </div>
              <div>
                <div class="flex items-center space-x-2">
                  <h3 class="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">Visual Annotations Crossover Hub</h3>
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-mono tabular-nums font-bold bg-purple-500/15 text-purple-400 border border-purple-500/30"
                        x-text="computeSerpPowerPairs().length + ' Power Pairs Computed'"></span>
                </div>
                <p class="text-xs text-slate-500 mt-0.5">Computer-vision tag co-occurrences, intra-SERP algorithmic lift, and visual prompt blueprint combinations.</p>
              </div>
            </div>

            <template x-if="activeVisualTagFilter">
              <button @click="activeVisualTagFilter = ''" class="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-rose-500/15 text-rose-500 hover:bg-rose-500/25 transition flex items-center space-x-1 cursor-pointer">
                <i data-lucide="x" class="w-3 h-3"></i>
                <span x-text="'Clear Tag #' + activeVisualTagFilter"></span>
              </button>
            </template>
          </div>

          <!-- Subsection A: Co-Occurring Power Pairs Grid -->
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono tabular-nums">Co-Occurring Visual Power Pairs (Algorithmic Lift)</h4>
              <span class="text-[10px] text-slate-400 font-mono tabular-nums">Top combinations with high intra-SERP affinity</span>
            </div>

            <template x-if="computeSerpPowerPairs().length > 0">
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <template x-for="(pair, idx) in computeSerpPowerPairs()" :key="idx">
                  <div class="p-3.5 rounded-2xl bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] flex flex-col justify-between space-y-2.5 hover:border-purple-500/40 transition group">
                    <div class="space-y-2">
                      <div class="flex items-center justify-between">
                        <span class="px-2 py-0.5 rounded-md text-[9px] font-mono tabular-nums font-black bg-purple-500/15 text-purple-400 border border-purple-500/30"
                              x-text="pair.lift + 'x Lift'"></span>
                        <span class="text-[9px] font-mono tabular-nums text-slate-400" x-text="pair.count + ' Pins (' + pair.supportPct + '%)'"></span>
                      </div>
                      <div class="flex items-center space-x-1.5 text-xs font-bold text-slate-900 dark:text-white truncate">
                        <button @click="filterByVisualTag(pair.tagA)" class="capitalize text-emerald-500 hover:underline truncate cursor-pointer" :title="'Filter SERP: #' + pair.tagA" x-text="pair.tagA"></button>
                        <span class="text-slate-400">+</span>
                        <button @click="filterByVisualTag(pair.tagB)" class="capitalize text-purple-400 hover:underline truncate cursor-pointer" :title="'Filter SERP: #' + pair.tagB" x-text="pair.tagB"></button>
                      </div>
                    </div>
                    <button @click="copySerpVisualBlueprint(pair)"
                            class="w-full py-1.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 text-[10px] font-bold font-mono tabular-nums transition flex items-center justify-center space-x-1 cursor-pointer">
                      <i data-lucide="copy" class="w-3 h-3"></i>
                      <span>Copy Visual Blueprint</span>
                    </button>
                  </div>
                </template>
              </div>
            </template>

            <template x-if="computeSerpPowerPairs().length === 0">
              <div class="py-6 text-center text-xs text-slate-400 font-mono tabular-nums rounded-2xl bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A]">
                Indexing visual tags... Co-occurring power pairs require at least 2 pins with shared visual annotations.
              </div>
            </template>
          </div>

          <!-- Unified Suite: Computer Vision Signals & Visual Anchors -->
          <div class="space-y-4 pt-3 border-t border-slate-200/80 dark:border-[#27272A]">
            <!-- Header with Title, Search, Tier Pills, and View Switcher -->
            <div class="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <div class="flex items-center space-x-2">
                  <h4 class="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white font-mono tabular-nums">Computer Vision Signals & Visual Anchors</h4>
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-mono tabular-nums font-bold bg-purple-500/15 text-purple-400 border border-purple-500/30"
                        x-text="filteredAnchorsList().length + ' Anchors'"></span>
                </div>
                <p class="text-xs text-slate-500 mt-0.5">Semantic AI entity tags detected by Pinterest Computer Vision across ranking pins. Click any anchor to isolate ranking SERP pins.</p>
              </div>

              <div class="flex items-center gap-2 flex-wrap">
                <!-- Search within Anchors -->
                <div class="relative">
                  <input type="text"
                         x-model="anchorsSearch"
                         @input="anchorsPage = 1"
                         placeholder="Filter anchors (e.g. food, dress)..."
                         class="px-3 py-1.5 pl-8 rounded-xl text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500/30 w-44 sm:w-52 font-sans">
                  <i data-lucide="search" class="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2 pointer-events-none"></i>
                  <button x-show="anchorsSearch" @click="anchorsSearch = ''; anchorsPage = 1" class="absolute right-2.5 top-1.5 text-xs text-slate-400 hover:text-slate-600 cursor-pointer">✕</button>
                </div>

                <!-- Tier Filter Pills -->
                <div class="flex items-center p-0.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-xs font-mono tabular-nums">
                  <button @click="anchorsTier = 'all'; anchorsPage = 1"
                          :class="anchorsTier === 'all' ? 'bg-purple-600 text-white font-bold shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'"
                          class="px-2 py-1 rounded-lg transition cursor-pointer">
                    All
                  </button>
                  <button @click="anchorsTier = 'high'; anchorsPage = 1"
                          :class="anchorsTier === 'high' ? 'bg-purple-600 text-white font-bold shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'"
                          class="px-2 py-1 rounded-lg transition cursor-pointer" title="Anchors present on >= 10 pins">
                    High (≥10)
                  </button>
                  <button @click="anchorsTier = 'core'; anchorsPage = 1"
                          :class="anchorsTier === 'core' ? 'bg-purple-600 text-white font-bold shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'"
                          class="px-2 py-1 rounded-lg transition cursor-pointer" title="Anchors present on >= 5 pins">
                    Core (≥5)
                  </button>
                </div>

                <!-- View Switcher (Cloud / Cards / Table) -->
                <div class="flex items-center p-0.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-xs font-mono tabular-nums">
                  <button @click="anchorsView = 'cloud'"
                          :class="anchorsView === 'cloud' ? 'bg-purple-600 text-white font-bold shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'"
                          class="px-2.5 py-1 rounded-lg transition flex items-center gap-1.5 cursor-pointer" title="Semantic Tag Cloud">
                    <i data-lucide="cloud" class="w-3.5 h-3.5 shrink-0"></i>
                    <span>Cloud</span>
                  </button>
                  <button @click="anchorsView = 'cards'"
                          :class="anchorsView === 'cards' ? 'bg-purple-600 text-white font-bold shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'"
                          class="px-2.5 py-1 rounded-lg transition flex items-center gap-1.5 cursor-pointer" title="Cards Grid">
                    <i data-lucide="layers" class="w-3.5 h-3.5 shrink-0"></i>
                    <span>Cards</span>
                  </button>
                  <button @click="anchorsView = 'table'"
                          :class="anchorsView === 'table' ? 'bg-purple-600 text-white font-bold shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'"
                          class="px-2.5 py-1 rounded-lg transition flex items-center gap-1.5 cursor-pointer" title="Full Paginated Table">
                    <i data-lucide="bar-chart-3" class="w-3.5 h-3.5 shrink-0"></i>
                    <span>Table</span>
                  </button>
                </div>
              </div>
            </div>

            <!-- VIEW 1: SEMANTIC CLOUD VIEW (DEFAULT) -->
            <div x-show="anchorsView === 'cloud' && filteredAnchorsList().length > 0"
                 class="p-5 rounded-2xl bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] space-y-3">
              <div class="flex items-center justify-between text-xs text-slate-400 font-mono tabular-nums pb-2 border-b border-slate-100 dark:border-[#27272A]/80">
                <span>Weighted Semantic Cloud (Visual weight scaled by pin occurrence frequency)</span>
                <span class="text-[11px] text-purple-400">Click any tag to filter SERP</span>
              </div>
              <div class="flex flex-wrap gap-2 items-center justify-center py-4">
                <template x-for="anchor in filteredAnchorsList().slice(0, 120)" :key="anchor.tag">
                  <button @click="filterByVisualTag(anchor.tag)"
                          class="rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5"
                          :class="[
                            activeVisualTagFilter === anchor.tag.toLowerCase() ? 'ring-2 ring-purple-500 bg-purple-600 text-white shadow-md' : '',
                            anchor.count >= 20
                              ? 'px-3.5 py-1.5 text-sm bg-purple-500/20 text-purple-600 dark:text-purple-300 border border-purple-500/40 hover:bg-purple-500/30 shadow-xs'
                              : (anchor.count >= 8
                                ? 'px-3 py-1 text-xs bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/25'
                                : 'px-2.5 py-0.5 text-[11px] bg-slate-100/80 dark:bg-slate-900/80 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#27272A] hover:border-purple-400')
                          ]">
                    <span x-text="'#' + anchor.tag"></span>
                    <span class="text-[9px] font-mono tabular-nums opacity-75 px-1 py-0.2 rounded bg-black/10 dark:bg-white/10" x-text="anchor.count"></span>
                  </button>
                </template>
              </div>
            </div>

            <!-- VIEW 2: CARDS GRID VIEW -->
            <div x-show="anchorsView === 'cards' && filteredAnchorsList().length > 0" class="space-y-4">
              <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                <template x-for="(anchor, idx) in filteredAnchorsList().slice(0, anchorsLimit)" :key="anchor.tag">
                  <button @click="filterByVisualTag(anchor.tag)"
                          class="p-2.5 rounded-2xl bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] text-left hover:border-purple-500/40 transition cursor-pointer flex flex-col justify-between group shadow-xs"
                          :class="activeVisualTagFilter === anchor.tag.toLowerCase() ? 'border-purple-500 ring-2 ring-purple-500/20 bg-purple-500/5' : ''">
                    <div class="flex items-center justify-between text-[10px] font-mono tabular-nums text-slate-400 mb-1">
                      <span x-text="'#' + (idx + 1)"></span>
                      <span class="font-bold text-purple-600 dark:text-purple-400" x-text="anchor.count + ' Pins'"></span>
                    </div>
                    <div class="text-xs font-bold text-slate-900 dark:text-white capitalize truncate group-hover:text-purple-500 transition" x-text="anchor.tag"></div>
                  </button>
                </template>
              </div>

              <!-- Cards Expansion Controls -->
              <div class="flex items-center justify-between p-3 rounded-2xl bg-white/60 dark:bg-[#121215]/60 border border-slate-200 dark:border-[#27272A] text-xs">
                <span class="font-mono tabular-nums text-slate-500 dark:text-slate-400"
                      x-text="'Showing ' + Math.min(anchorsLimit, filteredAnchorsList().length) + ' of ' + filteredAnchorsList().length + ' Visual Anchors'"></span>
                <div class="flex items-center gap-2 font-mono tabular-nums">
                  <button x-show="anchorsLimit < filteredAnchorsList().length"
                          @click="anchorsLimit += 36"
                          class="px-3 py-1.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 font-bold transition cursor-pointer">
                    <span>↓ Show More (+36)</span>
                  </button>
                  <button x-show="anchorsLimit < filteredAnchorsList().length"
                          @click="anchorsLimit = filteredAnchorsList().length"
                          class="px-3 py-1.5 rounded-xl bg-slate-200/80 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold transition cursor-pointer">
                    <span>Show All (<span x-text="filteredAnchorsList().length"></span>)</span>
                  </button>
                  <button x-show="anchorsLimit > 24"
                          @click="anchorsLimit = 24"
                          class="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 font-bold transition cursor-pointer">
                    <span>↑ Collapse to 24</span>
                  </button>
                </div>
              </div>
            </div>

            <!-- VIEW 3: TABLE VIEW -->
            <div x-show="anchorsView === 'table' && filteredAnchorsList().length > 0" class="space-y-3">
              <div class="overflow-x-auto rounded-2xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215]">
                <table class="w-full text-left text-xs font-mono tabular-nums">
                  <thead class="bg-slate-100/70 dark:bg-slate-900/80 border-b border-slate-200 dark:border-[#27272A] text-slate-500 dark:text-slate-400 uppercase text-[10px]">
                    <tr>
                      <th class="p-3 w-16 text-center">Rank #</th>
                      <th class="p-3">Visual Anchor Tag</th>
                      <th class="p-3">Pins Frequency</th>
                      <th class="p-3">Intra-SERP Share</th>
                      <th class="p-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-200/80 dark:divide-slate-800/80 text-slate-700 dark:text-slate-300">
                    <template x-for="(anchor, idx) in paginatedAnchorsTable()" :key="anchor.tag">
                      <tr class="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                        <td class="p-3 text-center text-slate-400 font-mono tabular-nums" x-text="'#' + (((anchorsPage - 1) * anchorsPageSize) + idx + 1)"></td>
                        <td class="p-3">
                          <button @click="filterByVisualTag(anchor.tag)"
                                  class="font-bold text-slate-900 dark:text-white hover:text-purple-600 dark:hover:text-purple-400 hover:underline cursor-pointer flex items-center gap-1.5 text-left capitalize">
                            <i data-lucide="tag" class="w-3.5 h-3.5 text-purple-500 shrink-0"></i>
                            <span x-text="anchor.tag"></span>
                          </button>
                        </td>
                        <td class="p-3">
                          <div class="flex items-center gap-2">
                            <div class="w-24 bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                              <div class="h-full rounded-full bg-gradient-to-r from-purple-500 to-indigo-500"
                                   :style="'width: ' + Math.min(100, Math.round((anchor.count / (coreAnchorsList[0]?.count || 1)) * 100)) + '%'"></div>
                            </div>
                            <span class="font-bold text-purple-600 dark:text-purple-400 font-mono tabular-nums" x-text="anchor.count + ' pins'"></span>
                          </div>
                        </td>
                        <td class="p-3 text-slate-500 dark:text-slate-400 font-mono tabular-nums"
                            x-text="((anchor.count / (totalAnalyzedPinsCount || 1)) * 100).toFixed(1) + '%'"></td>
                        <td class="p-3 text-right">
                          <button @click="filterByVisualTag(anchor.tag)"
                                  class="px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors shadow-2xs cursor-pointer"
                                  :class="activeVisualTagFilter === anchor.tag.toLowerCase() ? 'bg-purple-600 text-white font-bold' : 'bg-purple-500/10 hover:bg-purple-600 hover:text-white text-purple-600 dark:text-purple-400 border border-purple-500/20'">
                            <span x-text="activeVisualTagFilter === anchor.tag.toLowerCase() ? 'Filtered ✓' : 'Filter Pins →'"></span>
                          </button>
                        </td>
                      </tr>
                    </template>
                  </tbody>
                </table>
              </div>

              <!-- Anchors Table Pagination Footer -->
              <div class="flex items-center justify-between p-3 rounded-2xl bg-white/60 dark:bg-[#121215]/60 border border-slate-200 dark:border-[#27272A] text-xs font-mono tabular-nums">
                <span class="text-slate-500 dark:text-slate-400"
                      x-text="'Page ' + anchorsPage + ' of ' + totalAnchorsPages() + ' (' + filteredAnchorsList().length + ' anchors)'"></span>
                <div class="flex items-center gap-1.5">
                  <button :disabled="anchorsPage <= 1" @click="anchorsPage--" class="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-slate-900 disabled:opacity-40 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition">← Prev</button>
                  <span class="px-2 py-1 font-bold text-slate-700 dark:text-slate-300" x-text="anchorsPage + ' / ' + totalAnchorsPages()"></span>
                  <button :disabled="anchorsPage >= totalAnchorsPages()" @click="anchorsPage++" class="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-slate-900 disabled:opacity-40 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition">Next →</button>
                </div>
              </div>
            </div>

            <!-- Empty State for Visual Anchors -->
            <div x-show="filteredAnchorsList().length === 0" class="py-8 text-center text-xs text-slate-400 font-mono tabular-nums rounded-2xl bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A]">
              No visual anchors match current search or tier filter.
            </div>
          </div>

        </div>

      </div>`;
}
