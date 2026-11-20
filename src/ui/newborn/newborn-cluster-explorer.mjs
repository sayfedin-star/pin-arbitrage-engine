/**
 * src/ui/newborn/newborn-cluster-explorer.mjs
 *
 * Wave 6E Newborn Keyword Cluster Explorer (`activeView === 'cluster'`):
 * Unifies 3 Pinterest discovery sources for any seed keyword (e.g. `soup`):
 *   1. Pinterest Trends (`growing`, `seasonal`, `monthly`, `yearly`) with `includeTerms` / `excludeTerms` + Predicted Peaks
 *   2. Pinterest Search Suggestions (Typeahead Expansion) with separated user accounts (`@username`)
 *   3. Official Idea Page Volume + Taxonomy + Related Interests
 *
 * Features Two-Phase Fast Build:
 *   - Phase 1: Instant build with bounded volume enrichment for top 20–25 keywords
 *   - Phase 2: On-demand "Enrich Remaining Volumes" button for remaining rows
 *   - Multi-select up to 25 keywords -> launches direct server-side All-Surface Newborn Hunt
 *     tracking `matched_queries` overlap (`Cluster Hit 2x/3x`).
 */

export function getNewbornClusterExplorerHtml() {
  return `
    <!-- ====================================================================== -->
    <!-- VIEW 2: KEYWORD CLUSTER EXPLORER (Trends + Typeahead + Idea Volume)    -->
    <!-- ====================================================================== -->
    <template x-if="activeView === 'cluster'">
      <section id="panel-newborn-cluster" role="tabpanel" aria-labelledby="tab-newborn-cluster" class="space-y-4">

        <!-- Cluster Builder Card -->
        <div class="bg-white dark:bg-[#18181B] rounded-2xl border border-slate-200 dark:border-[#27272A] p-4 sm:p-5 shadow-xs space-y-3.5">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <div class="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
                <i data-lucide="compass" class="w-4 h-4" aria-hidden="true"></i>
              </div>
              <div>
                <h2 class="text-sm font-bold text-slate-900 dark:text-[#FAFAFA]">Newborn Keyword Cluster Explorer</h2>
                <p class="text-[11px] text-slate-500 dark:text-[#A1A1AA]">
                  Combine 4 Trends tabs + Typeahead suggestions + Idea Page volumes, then hunt up to 25 keywords across all surfaces at once.
                </p>
              </div>
            </div>

            <template x-if="recentClusters.length > 0">
              <div class="flex items-center gap-1.5 flex-wrap">
                <span class="text-[11px] text-slate-400">Recent:</span>
                <template x-for="rc in recentClusters.slice(0, 5)" :key="rc.id">
                  <button type="button"
                          @click="openSavedCluster(rc.id)"
                          class="px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-colors cursor-pointer"
                          :class="activeCluster && Number(activeCluster.id) === Number(rc.id) ? 'border-rose-400 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 font-semibold' : 'border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#121215] text-slate-700 dark:text-[#E4E4E7] hover:border-rose-300'">
                    <span x-text="rc.seed_keyword"></span>
                    <span class="font-mono tabular-nums text-[10px] text-slate-400 ml-1" x-text="'(' + (rc.keyword_count || 0) + ')'"></span>
                  </button>
                </template>
              </div>
            </template>
          </div>

          <form @submit.prevent="buildClusterNow()" class="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-end">
            <div class="md:col-span-4 space-y-1">
              <label for="cluster-seed-input" class="block text-[11px] font-semibold text-slate-600 dark:text-[#A1A1AA]">Seed Keyword</label>
              <div class="relative">
                <i data-lucide="search" class="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true"></i>
                <input id="cluster-seed-input"
                       type="text"
                       required
                       x-model="clusterForm.seed_keyword"
                       placeholder="e.g. soup, meal prep, nail designs..."
                       class="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50/80 dark:bg-[#121215] text-xs font-medium text-slate-900 dark:text-[#FAFAFA] focus:outline-none focus:ring-2 focus:ring-rose-500" />
              </div>
            </div>

            <div class="md:col-span-2 space-y-1">
              <label for="cluster-l1-select" class="block text-[11px] font-semibold text-slate-600 dark:text-[#A1A1AA]">Interest (Trends)</label>
              <select id="cluster-l1-select"
                      x-model="clusterForm.l1_interest"
                      class="w-full px-2.5 py-2 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50/80 dark:bg-[#121215] text-xs font-medium text-slate-800 dark:text-[#FAFAFA]">
                <option value="all">All Categories</option>
                <template x-for="cat in l1InterestsCatalog" :key="cat.slug">
                  <option :value="cat.slug" x-text="cat.label"></option>
                </template>
              </select>
            </div>

            <div class="md:col-span-2 space-y-1">
              <label for="cluster-country-select" class="block text-[11px] font-semibold text-slate-600 dark:text-[#A1A1AA]">Country</label>
              <select id="cluster-country-select"
                      x-model="clusterForm.country"
                      class="w-full px-2.5 py-2 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50/80 dark:bg-[#121215] text-xs font-medium text-slate-800 dark:text-[#FAFAFA]">
                <template x-for="c in supportedCountries" :key="c.code">
                  <option :value="c.code" x-text="c.label"></option>
                </template>
              </select>
            </div>

            <div class="md:col-span-2 space-y-1">
              <label for="cluster-exclude-input" class="block text-[11px] font-semibold text-slate-600 dark:text-[#A1A1AA]">Exclude Terms (opt)</label>
              <input id="cluster-exclude-input"
                     type="text"
                     x-model="clusterForm.exclude_terms"
                     placeholder="e.g. vegan, keto"
                     class="w-full px-2.5 py-2 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50/80 dark:bg-[#121215] text-xs text-slate-800 dark:text-[#FAFAFA] focus:outline-none focus:ring-2 focus:ring-rose-500" />
            </div>

            <div class="md:col-span-2">
              <button type="submit"
                      :disabled="isBuildingCluster || !clusterForm.seed_keyword.trim()"
                      class="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">
                <i data-lucide="sparkles" class="w-3.5 h-3.5" :class="isBuildingCluster ? 'animate-spin' : ''" aria-hidden="true"></i>
                <span x-text="isBuildingCluster ? 'Building...' : 'Build Cluster'"></span>
              </button>
            </div>
          </form>
        </div>

        <!-- Empty State (Before Building a Cluster) -->
        <template x-if="!isBuildingCluster && !activeCluster">
          <div class="bg-white dark:bg-[#18181B] rounded-2xl border border-dashed border-slate-300 dark:border-[#27272A] p-10 text-center space-y-3">
            <div class="w-11 h-11 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto">
              <i data-lucide="compass" class="w-5 h-5" aria-hidden="true"></i>
            </div>
            <h3 class="text-base font-bold text-slate-900 dark:text-[#FAFAFA]">Build a Keyword Cluster to hunt Newborn Pins at scale</h3>
            <p class="text-xs sm:text-sm text-slate-500 dark:text-[#A1A1AA] max-w-lg mx-auto">
              Enter a seed keyword like <strong>soup</strong> to merge all 4 Pinterest Trends tabs, Typeahead long-tail expansions, Idea Page search volumes, and 90-day predicted peaks — then select up to <strong>25 keywords</strong> for a unified multi-surface hunt.
            </p>
          </div>
        </template>

        <!-- Loading Skeleton While Building Cluster -->
        <template x-if="isBuildingCluster">
          <div class="bg-white dark:bg-[#18181B] rounded-2xl border border-slate-200 dark:border-[#27272A] p-6 space-y-3 animate-pulse">
            <div class="flex items-center gap-2 text-xs font-semibold text-rose-600 dark:text-rose-400">
              <i data-lucide="loader-2" class="w-4 h-4 animate-spin" aria-hidden="true"></i>
              <span>Querying 4 Pinterest Trends tabs, Typeahead expansions, Idea Page volumes &amp; 90-day predicted peaks...</span>
            </div>
            <div class="h-10 w-full rounded-xl bg-slate-100 dark:bg-[#27272A]"></div>
            <div class="h-10 w-full rounded-xl bg-slate-100 dark:bg-[#27272A]"></div>
            <div class="h-10 w-full rounded-xl bg-slate-100 dark:bg-[#27272A]"></div>
          </div>
        </template>

        <!-- Active Cluster Results Workspace -->
        <template x-if="!isBuildingCluster && activeCluster">
          <div class="space-y-4">

            <!-- Cluster Summary + Phase 2 Volume Enrichment + Hunt Selected CTA -->
            <div class="bg-white dark:bg-[#18181B] rounded-2xl border border-slate-200 dark:border-[#27272A] p-4 shadow-xs space-y-3">
              <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div class="space-y-1">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="px-2 py-0.5 rounded-md bg-indigo-600 text-white text-[10px] font-bold uppercase tracking-wider">Cluster</span>
                    <h3 class="text-sm font-bold text-slate-900 dark:text-[#FAFAFA]" x-text="activeCluster.seed_keyword"></h3>
                    <span class="text-xs font-mono tabular-nums text-slate-500"
                          x-text="(activeCluster.keyword_count || (activeCluster.keywords || []).length) + ' keywords · ' + (activeCluster.country || 'US')"></span>
                    <template x-if="activeCluster.metadata?.latest_trends_date">
                      <span class="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-[#27272A] text-[10px] font-mono tabular-nums text-slate-600 dark:text-[#A1A1AA]"
                            x-text="'Trends date: ' + activeCluster.metadata.latest_trends_date"></span>
                    </template>
                  </div>
                  <div class="flex items-center gap-3 flex-wrap text-[11px] font-mono tabular-nums text-slate-500 dark:text-[#A1A1AA]">
                    <span>Trends: <strong class="text-slate-800 dark:text-[#FAFAFA]" x-text="countClusterBySource('trends')"></strong></span>
                    <span>Typeahead: <strong class="text-slate-800 dark:text-[#FAFAFA]" x-text="countClusterBySource('typeahead')"></strong></span>
                    <span>Idea / Related: <strong class="text-slate-800 dark:text-[#FAFAFA]" x-text="countClusterBySource('idea_page')"></strong></span>
                    <span>Volumes Enriched: <strong class="text-indigo-600 dark:text-indigo-400" x-text="(activeCluster.enriched_count || 0) + ' / ' + (activeCluster.keyword_count || (activeCluster.keywords || []).length)"></strong></span>
                  </div>
                </div>

                <div class="flex flex-wrap items-center gap-2">
                  <template x-if="Number(activeCluster.remaining_unenriched_count || 0) > 0">
                    <button type="button"
                            @click="enrichClusterVolumesNow()"
                            :disabled="isEnrichingCluster"
                            class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/70 dark:bg-indigo-950/30 hover:bg-indigo-100/70 disabled:opacity-60 text-xs font-semibold text-indigo-700 dark:text-indigo-300 cursor-pointer">
                      <i data-lucide="bar-chart-2" class="w-3.5 h-3.5" :class="isEnrichingCluster ? 'animate-pulse' : ''" aria-hidden="true"></i>
                      <span x-text="isEnrichingCluster ? 'Enriching Volumes...' : ('Enrich Remaining Volumes (' + activeCluster.remaining_unenriched_count + ')')"></span>
                    </button>
                  </template>

                  <button type="button"
                          @click="launchClusterHunt()"
                          :disabled="isLaunchingClusterHunt || selectedClusterKeywords.length === 0"
                          class="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">
                    <i data-lucide="radar" class="w-3.5 h-3.5" :class="isLaunchingClusterHunt ? 'animate-spin' : ''" aria-hidden="true"></i>
                    <span x-text="isLaunchingClusterHunt ? 'Launching Hunt...' : ('Hunt Selected (' + selectedClusterKeywords.length + '/25)')"></span>
                  </button>
                </div>
              </div>

              <!-- Separated Typeahead Accounts Radar Strip -->
              <template x-if="Array.isArray(activeCluster.discovered_accounts) && activeCluster.discovered_accounts.length > 0">
                <div class="pt-2.5 border-t border-slate-100 dark:border-[#27272A] flex items-center gap-2 flex-wrap">
                  <span class="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 dark:text-[#A1A1AA]">
                    <i data-lucide="users" class="w-3.5 h-3.5 text-indigo-500" aria-hidden="true"></i>
                    <span>Accounts Spotted in Typeahead:</span>
                  </span>
                  <template x-for="acc in activeCluster.discovered_accounts.slice(0, 10)" :key="acc.username">
                    <a :href="acc.profile_url || ('https://www.pinterest.com/' + encodeURIComponent(acc.username) + '/')"
                       target="_blank"
                       rel="noopener noreferrer"
                       class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-indigo-200/80 dark:border-indigo-900/50 bg-indigo-50/50 dark:bg-indigo-950/20 hover:border-indigo-400 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 transition-colors">
                      <span x-text="'@' + acc.username"></span>
                      <template x-if="acc.full_name && acc.full_name !== acc.username">
                        <span class="text-slate-500 dark:text-[#A1A1AA] font-normal truncate max-w-[160px]" x-text="acc.full_name"></span>
                      </template>
                      <i data-lucide="external-link" class="w-3 h-3 opacity-70" aria-hidden="true"></i>
                    </a>
                  </template>
                </div>
              </template>

              <!-- Quick Filters & Batch Selection Controls -->
              <div class="pt-2.5 border-t border-slate-100 dark:border-[#27272A] flex flex-col xl:flex-row xl:items-center justify-between gap-2.5">
                <div class="flex flex-wrap items-center gap-2">
                  <input type="search"
                         x-model="clusterFilters.q"
                         aria-label="Filter cluster keywords"
                         placeholder="Filter keywords..."
                         class="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#121215] text-xs text-slate-800 dark:text-[#FAFAFA] w-40 focus:outline-none focus:ring-2 focus:ring-rose-500" />

                  <select x-model="clusterFilters.source"
                          aria-label="Filter by source"
                          class="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#121215] text-xs font-medium text-slate-700 dark:text-[#FAFAFA]">
                    <option value="all">All Sources</option>
                    <option value="trends">Trends Only</option>
                    <option value="typeahead">Typeahead Only</option>
                    <option value="idea_page">Idea Page / Related</option>
                  </select>

                  <button type="button"
                          @click="clusterFilters.taxonomyOnly = !clusterFilters.taxonomyOnly"
                          class="px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer"
                          :class="clusterFilters.taxonomyOnly ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-700 text-rose-700 dark:text-rose-300 font-semibold' : 'bg-slate-50 dark:bg-[#121215] border-slate-200 dark:border-[#27272A] text-slate-600 dark:text-[#A1A1AA]'">
                    Taxonomy Only
                  </button>

                  <label class="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-[#A1A1AA]">
                    <span>Min Vol</span>
                    <input type="number"
                           min="0"
                           step="1000"
                           x-model.number="clusterFilters.minVolume"
                           placeholder="0"
                           class="w-20 px-2 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#121215] text-xs font-mono tabular-nums text-slate-800 dark:text-[#FAFAFA]" />
                  </label>

                  <select x-model="clusterFilters.sort"
                          aria-label="Sort cluster keywords"
                          class="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#121215] text-xs font-medium text-slate-700 dark:text-[#FAFAFA]">
                    <option value="score">Sort: Cluster Rank</option>
                    <option value="volume">Sort: Search Volume</option>
                    <option value="monthly">Sort: 30d Growth</option>
                    <option value="weekly">Sort: 7d Growth</option>
                  </select>
                </div>

                <div class="flex items-center gap-1.5 flex-wrap text-xs">
                  <span class="text-[11px] text-slate-500 font-mono tabular-nums mr-1"
                        x-text="getFilteredClusterKeywords().length + ' shown'"></span>
                  <button type="button" @click="selectTopClusterKeywords(10)" class="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#121215] hover:border-rose-300 text-[11px] font-semibold text-slate-700 dark:text-[#E4E4E7] cursor-pointer">Top 10</button>
                  <button type="button" @click="selectTopClusterKeywords(20)" class="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#121215] hover:border-rose-300 text-[11px] font-semibold text-slate-700 dark:text-[#E4E4E7] cursor-pointer">Top 20</button>
                  <button type="button" @click="selectTopClusterKeywords(25)" class="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#121215] hover:border-rose-300 text-[11px] font-semibold text-slate-700 dark:text-[#E4E4E7] cursor-pointer">Top 25</button>
                  <template x-if="selectedClusterKeywords.length > 0">
                    <button type="button" @click="clearClusterSelection()" class="px-2 py-1 text-[11px] text-slate-500 hover:text-rose-600 cursor-pointer">Clear</button>
                  </template>
                </div>
              </div>
            </div>

            <!-- Cluster Keywords Table -->
            <div class="bg-white dark:bg-[#18181B] rounded-2xl border border-slate-200 dark:border-[#27272A] shadow-xs overflow-x-auto">
              <table class="w-full text-left border-collapse">
                <thead>
                  <tr class="border-b border-slate-200 dark:border-[#27272A] bg-slate-50/70 dark:bg-[#121215] text-[11px] uppercase tracking-wider text-slate-500 dark:text-[#A1A1AA]">
                    <th class="py-3 pl-4 pr-2 w-9">
                      <span class="sr-only">Select</span>
                    </th>
                    <th class="py-3 px-3 font-semibold min-w-[220px]">Keyword</th>
                    <th class="py-3 px-3 font-semibold whitespace-nowrap text-right">Volume</th>
                    <th class="py-3 px-3 font-semibold whitespace-nowrap text-center">Taxonomy</th>
                    <th class="py-3 px-3 font-semibold whitespace-nowrap text-center">Related</th>
                    <th class="py-3 px-3 font-semibold whitespace-nowrap">7d / 30d / 1y</th>
                    <th class="py-3 px-3 font-semibold whitespace-nowrap">Predicted Peak</th>
                    <th class="py-3 px-3 font-semibold whitespace-nowrap">Sources</th>
                    <th class="py-3 pl-3 pr-4 font-semibold text-right whitespace-nowrap">Action</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 dark:divide-[#27272A] text-xs">
                  <template x-for="kw in getFilteredClusterKeywords()" :key="kw.keyword">
                    <tr class="hover:bg-slate-50/80 dark:hover:bg-[#27272A]/30 transition-colors"
                        :class="selectedClusterKeywords.includes(kw.keyword) ? 'bg-rose-50/30 dark:bg-rose-950/15' : ''">
                      <td class="py-2.5 pl-4 pr-2">
                        <input type="checkbox"
                               :checked="selectedClusterKeywords.includes(kw.keyword)"
                               :disabled="!selectedClusterKeywords.includes(kw.keyword) && selectedClusterKeywords.length >= 25"
                               @change="toggleClusterKeyword(kw.keyword)"
                               :aria-label="'Select keyword ' + kw.keyword"
                               class="rounded text-rose-600 focus:ring-rose-500 cursor-pointer disabled:opacity-40" />
                      </td>

                      <td class="py-2.5 px-3">
                        <div class="flex items-center gap-2 min-w-0">
                          <a :href="kw.idea_url || ('https://www.pinterest.com/search/pins/?q=' + encodeURIComponent(kw.keyword))"
                             target="_blank"
                             rel="noopener noreferrer"
                             class="font-semibold text-slate-900 dark:text-[#FAFAFA] hover:text-rose-600 dark:hover:text-rose-400 hover:underline truncate max-w-[260px]"
                             x-text="kw.keyword"></a>
                          <a :href="'https://www.pinterest.com/search/pins/?q=' + encodeURIComponent(kw.keyword)"
                             target="_blank"
                             rel="noopener noreferrer"
                             title="Open Pinterest Search"
                             class="text-slate-400 hover:text-rose-600 shrink-0">
                            <i data-lucide="external-link" class="w-3 h-3" aria-hidden="true"></i>
                          </a>
                        </div>
                      </td>

                      <td class="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                        <template x-if="kw.volume != null && Number(kw.volume) > 0">
                          <span class="font-bold text-slate-900 dark:text-[#FAFAFA]" x-text="formatNullableCount(kw.volume)"></span>
                        </template>
                        <template x-if="kw.volume == null || Number(kw.volume) <= 0">
                          <span class="text-[11px] text-slate-400" x-text="kw.volume_enriched ? '—' : 'Pending'"></span>
                        </template>
                      </td>

                      <td class="py-2.5 px-3 text-center">
                        <template x-if="kw.has_taxonomy">
                          <span class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 font-bold" title="Official Pinterest Idea Page / Taxonomy">&#10003;</span>
                        </template>
                        <template x-if="!kw.has_taxonomy">
                          <span class="text-slate-300 dark:text-slate-600">—</span>
                        </template>
                      </td>

                      <td class="py-2.5 px-3 text-center">
                        <template x-if="kw.is_related_interest">
                          <span class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-bold" title="Related Interest from Idea Page">&#10003;</span>
                        </template>
                        <template x-if="!kw.is_related_interest">
                          <span class="text-slate-300 dark:text-slate-600">—</span>
                        </template>
                      </td>

                      <td class="py-2.5 px-3 whitespace-nowrap font-mono tabular-nums text-[11px]">
                        <div class="inline-flex items-center gap-1">
                          <template x-if="kw.weekly_change != null">
                            <span class="px-1.5 py-0.5 rounded font-semibold"
                                  :class="Number(kw.weekly_change) >= 0 ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300' : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'"
                                  x-text="'7d ' + (Number(kw.weekly_change) >= 0 ? '+' : '') + Math.round(kw.weekly_change) + '%'"></span>
                          </template>
                          <template x-if="kw.monthly_change != null">
                            <span class="px-1.5 py-0.5 rounded font-semibold"
                                  :class="Number(kw.monthly_change) >= 0 ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300' : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'"
                                  x-text="'30d ' + (Number(kw.monthly_change) >= 0 ? '+' : '') + Math.round(kw.monthly_change) + '%'"></span>
                          </template>
                          <template x-if="kw.yearly_change != null">
                            <span class="px-1.5 py-0.5 rounded font-semibold"
                                  :class="Number(kw.yearly_change) >= 0 ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300' : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'"
                                  x-text="'1y ' + (Number(kw.yearly_change) >= 0 ? '+' : '') + Math.round(kw.yearly_change) + '%'"></span>
                          </template>
                          <template x-if="kw.weekly_change == null && kw.monthly_change == null && kw.yearly_change == null">
                            <span class="text-slate-400">—</span>
                          </template>
                        </div>
                      </td>

                      <td class="py-2.5 px-3 whitespace-nowrap font-mono tabular-nums text-[11px]">
                        <template x-if="kw.predicted_peak_date">
                          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 font-semibold"
                                :title="kw.predicted_90d_growth != null ? ('90d forecast: ' + kw.predicted_90d_growth + '%') : 'Predicted peak date'">
                            <i data-lucide="sparkles" class="w-3 h-3" aria-hidden="true"></i>
                            <span x-text="kw.predicted_peak_date"></span>
                          </span>
                        </template>
                        <template x-if="!kw.predicted_peak_date && kw.has_prediction">
                          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-[#27272A] text-slate-600 dark:text-[#A1A1AA]">Forecast</span>
                        </template>
                        <template x-if="!kw.predicted_peak_date && !kw.has_prediction">
                          <span class="text-slate-300 dark:text-slate-600">—</span>
                        </template>
                      </td>

                      <td class="py-2.5 px-3 whitespace-nowrap">
                        <div class="flex items-center gap-1 flex-wrap max-w-[180px]">
                          <template x-for="src in getClusterRowSourceBadges(kw).slice(0, 4)" :key="src">
                            <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-[#27272A] text-slate-600 dark:text-[#A1A1AA]"
                                  x-text="src"></span>
                          </template>
                        </div>
                      </td>

                      <td class="py-2.5 pl-3 pr-4 text-right whitespace-nowrap">
                        <button type="button"
                                @click="huntSingleClusterKeyword(kw.keyword)"
                                class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] hover:border-rose-400 hover:text-rose-600 text-[11px] font-semibold text-slate-700 dark:text-[#FAFAFA] cursor-pointer">
                          <i data-lucide="radar" class="w-3 h-3 text-rose-500" aria-hidden="true"></i>
                          <span>Hunt</span>
                        </button>
                      </td>
                    </tr>
                  </template>
                </tbody>
              </table>
            </div>

          </div>
        </template>

      </section>
    </template>
  `;
}
