/**
 * src/ui/newborn/newborn-candidates-and-rookies.mjs
 *
 * V4 Discover Results Workspace (`This Hunt` | `Cluster Explorer` | `Past Hunts`):
 * - `This Hunt`:
 *   1. Annotations Crossover Panel right above Golden Pins (frequency/overlap, avg Re-pins,
 *      optional Search Volume lookup, click-to-filter, Copy Tags).
 *   2. Toolbar: All Winners / No Link / Linkless filter, search, sort (`Re-pins DESC` default,
 *      `Age ASC`, `Re-pins/day DESC`, `Saves DESC`), safe CSV export, and bulk actions.
 *   3. Clean Golden Pins Table: Pin Image + Title + Domain/`No Link / Linkless`, True Root `Age`,
 *      `Re-pins` + `Re-pins/day` (with `Saves` quietly alongside), Pin `Annotations`,
 *      Discovery Source, opt-in Account (`Total audience` & `Impressions` when pulled),
 *      and 3 clean manual actions (`Scroll Related` | `Track Daily` | `Pull Account`).
 * - `Cluster Explorer`: Keyword cluster builder & volume explorer (rendered in sibling partial).
 * - `Past Hunts`: Run history with Scrolled -> Matched Re-pins -> Verified Winners funnel.
 */

export function getNewbornCandidatesAndRookiesHtml({ folderId = '' } = {}) {
  const isCampaignScoped = Boolean(String(folderId || '').trim());
  return `
    <!-- Clean Tab Navigation Strip -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-[#27272A] pb-3">
      <div role="tablist" aria-label="Newborn workspace views" class="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-100/90 dark:bg-[#18181B] border border-slate-200/80 dark:border-[#27272A] self-start">
        <button type="button"
                role="tab"
                id="tab-newborn-hunt"
                :aria-selected="activeView === 'hunt' ? 'true' : 'false'"
                aria-controls="panel-newborn-hunt"
                @click="switchView('hunt')"
                class="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                :class="activeView === 'hunt' ? 'bg-white dark:bg-[#27272A] text-slate-900 dark:text-[#FAFAFA] shadow-xs' : 'text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-[#FAFAFA]'">
          <i data-lucide="flame" class="w-3.5 h-3.5 text-rose-500" aria-hidden="true"></i>
          <span>This Hunt</span>
          <span class="px-1.5 py-0.5 rounded-md text-[10px] font-mono tabular-nums bg-slate-100 dark:bg-[#18181B] text-slate-700 dark:text-[#E4E4E7]" x-text="candidatesTotal"></span>
        </button>

        ${isCampaignScoped ? '' : `<button type="button"
                role="tab"
                id="tab-newborn-cluster"
                :aria-selected="activeView === 'cluster' ? 'true' : 'false'"
                aria-controls="panel-newborn-cluster"
                @click="switchView('cluster')"
                class="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                :class="activeView === 'cluster' ? 'bg-white dark:bg-[#27272A] text-slate-900 dark:text-[#FAFAFA] shadow-xs' : 'text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-[#FAFAFA]'">
          <i data-lucide="compass" class="w-3.5 h-3.5 text-indigo-500" aria-hidden="true"></i>
          <span>Cluster Explorer</span>
          <template x-if="activeCluster">
            <span class="px-1.5 py-0.5 rounded-md text-[10px] font-mono tabular-nums bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300"
                  x-text="activeCluster.keyword_count || (activeCluster.keywords || []).length"></span>
          </template>
        </button>`}

        <button type="button"
                role="tab"
                id="tab-newborn-history"
                :aria-selected="activeView === 'history' ? 'true' : 'false'"
                aria-controls="panel-newborn-history"
                @click="switchView('history')"
                class="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                :class="activeView === 'history' ? 'bg-white dark:bg-[#27272A] text-slate-900 dark:text-[#FAFAFA] shadow-xs' : 'text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-[#FAFAFA]'">
          <i data-lucide="history" class="w-3.5 h-3.5 text-slate-500" aria-hidden="true"></i>
          <span>Past Hunts</span>
          <span class="px-1.5 py-0.5 rounded-md text-[10px] font-mono tabular-nums bg-slate-100 dark:bg-[#18181B] text-slate-700 dark:text-[#E4E4E7]" x-text="runs.length"></span>
        </button>
      </div>

      <!-- Compact Summary KPIs -->
      <div class="flex items-center gap-3 flex-wrap text-xs text-slate-500 dark:text-[#A1A1AA] font-mono tabular-nums">
        <span>Golden Pins: <strong class="text-slate-900 dark:text-[#FAFAFA]" x-text="overview?.counts?.golden_pins_count || 0"></strong></span>
        <span>No Link: <strong class="text-amber-600 dark:text-amber-400" x-text="overview?.counts?.linkless_vacuum_count || 0"></strong></span>
      </div>
    </div>

    <!-- ====================================================================== -->
    <!-- VIEW 1: THIS HUNT (Annotations Crossover + Clean Golden Pins Table)    -->
    <!-- ====================================================================== -->
    <template x-if="activeView === 'hunt'">
      <section id="panel-newborn-hunt" role="tabpanel" aria-labelledby="tab-newborn-hunt" class="space-y-4">

        <!-- Annotations Crossover Panel (Directly Above Golden Pins) -->
        <template x-if="annotationsCrossoverList().length > 0">
          <div class="bg-white dark:bg-[#18181B] rounded-2xl border border-slate-200 dark:border-[#27272A] p-4 shadow-xs space-y-3">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div class="flex items-center gap-2 flex-wrap">
                <i data-lucide="tags" class="w-4 h-4 text-rose-500 shrink-0" aria-hidden="true"></i>
                <h2 class="text-xs sm:text-sm font-bold text-slate-900 dark:text-[#FAFAFA]">Annotations Crossover</h2>
                <span class="px-2 py-0.5 rounded-full text-[11px] font-mono tabular-nums bg-slate-100 dark:bg-[#27272A] text-slate-600 dark:text-[#A1A1AA]"
                      x-text="annotationsCrossoverList().length + ' winning tags'"></span>
                <template x-if="filters.annotation">
                  <button type="button"
                          @click="selectAnnotationFilter(filters.annotation)"
                          class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 text-[11px] font-semibold cursor-pointer">
                    <span x-text="'Filtered: ' + filters.annotation"></span>
                    <i data-lucide="x" class="w-3 h-3" aria-hidden="true"></i>
                  </button>
                </template>
              </div>

              <div class="flex items-center gap-2 shrink-0">
                <button type="button"
                        @click="checkAnnotationVolumes()"
                        :disabled="isCheckingAnnotationVolumes"
                        class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#121215] hover:bg-slate-100 dark:hover:bg-[#27272A] disabled:opacity-60 text-[11px] font-semibold text-slate-700 dark:text-[#FAFAFA] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">
                  <i data-lucide="bar-chart-2" class="w-3.5 h-3.5 text-indigo-500" :class="isCheckingAnnotationVolumes ? 'animate-pulse' : ''" aria-hidden="true"></i>
                  <span x-text="isCheckingAnnotationVolumes ? 'Checking...' : 'Check Volumes'"></span>
                </button>
                <button type="button"
                        @click="copyAnnotationTags()"
                        class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#121215] hover:bg-slate-100 dark:hover:bg-[#27272A] text-[11px] font-semibold text-slate-700 dark:text-[#FAFAFA] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">
                  <i data-lucide="copy" class="w-3.5 h-3.5 text-slate-500" aria-hidden="true"></i>
                  <span>Copy Tags</span>
                </button>
              </div>
            </div>

            <div class="flex flex-wrap gap-2">
              <template x-for="item in annotationsCrossoverList().slice(0, 24)" :key="item.annotation">
                <div class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs transition-colors"
                     :class="filters.annotation && filters.annotation.toLowerCase() === item.annotation.toLowerCase() ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200' : 'border-slate-200 dark:border-[#27272A] bg-slate-50/80 dark:bg-[#121215] text-slate-800 dark:text-[#FAFAFA] hover:border-rose-300'">
                  <button type="button"
                          @click="selectAnnotationFilter(item.annotation)"
                          class="font-semibold hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer focus-visible:outline-none">
                    <span x-text="item.annotation"></span>
                  </button>
                  <span class="px-1.5 py-0.5 rounded-md bg-white dark:bg-[#18181B] border border-slate-200/70 dark:border-[#27272A] text-[10px] font-mono tabular-nums font-semibold text-slate-700 dark:text-[#E4E4E7]"
                        :title="item.pin_count + ' Golden Pins (' + item.overlap_pct + '% overlap) · Avg ' + formatNullableCount(item.avg_repins) + ' Re-pins'"
                        x-text="item.pin_count + ' (' + item.overlap_pct + '%)'"></span>
                  <template x-if="item.avg_repins > 0">
                    <span class="text-[10px] font-mono tabular-nums text-emerald-600 dark:text-emerald-400 font-semibold"
                          x-text="formatCompact(item.avg_repins) + ' rp'"></span>
                  </template>
                  <template x-if="annotationVolumeMap[item.annotation.toLowerCase()] && annotationVolumeMap[item.annotation.toLowerCase()].found">
                    <a :href="annotationVolumeMap[item.annotation.toLowerCase()].idea_url"
                       target="_blank"
                       rel="noopener noreferrer"
                       class="px-1.5 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 text-[10px] font-mono tabular-nums font-semibold hover:underline"
                       :title="'Official Idea Page Search Volume for ' + item.annotation"
                       x-text="formatCompact(annotationVolumeMap[item.annotation.toLowerCase()].internal_search_count) + ' vol'"></a>
                  </template>
                </div>
              </template>
            </div>
          </div>
        </template>

        <!-- Results Toolbar + Bulk Actions -->
        <div class="bg-white dark:bg-[#18181B] rounded-2xl border border-slate-200 dark:border-[#27272A] p-3.5 shadow-xs space-y-3">
          <div class="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
            <div class="flex items-center gap-2 flex-wrap">
              <template x-if="activeRunId">
                <div class="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200/80 dark:border-rose-900/50 text-xs">
                  <span class="font-bold text-rose-700 dark:text-rose-300 font-mono tabular-nums" x-text="'Hunt #' + activeRunId"></span>
                  <template x-if="activeRun && formatRunSeedLabel(activeRun)">
                    <span class="text-slate-700 dark:text-[#E4E4E7] font-medium truncate max-w-[220px]" x-text="formatRunSeedLabel(activeRun)"></span>
                  </template>
                  <button type="button"
                          @click="clearRunScope()"
                          class="text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:underline ml-1 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 rounded">
                    Show all hunts
                  </button>
                </div>
              </template>
              <template x-if="!activeRunId">
                <div class="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-[#E4E4E7]">
                  <i data-lucide="layers" class="w-3.5 h-3.5 text-slate-400" aria-hidden="true"></i>
                  <span>${isCampaignScoped ? 'Campaign Golden Pins' : 'All Discovered Golden Pins'}</span>
                </div>
              </template>
            </div>

            <!-- Filter Chips, Search, Sort & Export CSV -->
            <div class="flex flex-wrap items-center gap-2">
              <div class="inline-flex items-center rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#121215] p-0.5 text-xs" role="group" aria-label="Filter by outbound link status">
                <button type="button"
                        @click="setLinkFilter('all')"
                        class="px-2 py-0.5 rounded-md font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                        :class="filters.linkFilter === 'all' ? 'bg-white dark:bg-[#27272A] text-slate-900 dark:text-[#FAFAFA] shadow-xs' : 'text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900'">
                  All Links
                </button>
                <button type="button"
                        @click="setLinkFilter('linkless')"
                        class="px-2 py-0.5 rounded-md font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                        :class="filters.linkFilter === 'linkless' ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 shadow-xs' : 'text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900'">
                  No Link
                </button>
                <button type="button"
                        @click="setLinkFilter('linked')"
                        class="px-2 py-0.5 rounded-md font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                        :class="filters.linkFilter === 'linked' ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 shadow-xs' : 'text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900'">
                  Has Link
                </button>
              </div>

              <select x-model="filters.surface" @change="onCandidateFilterChange()" aria-label="Filter by discovery source" class="px-2 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#121215] text-xs text-slate-700 dark:text-[#FAFAFA] cursor-pointer"><option value="">Source: All</option><option value="pin_serp_capsules">Search</option><option value="board_more_ideas">Find More Ideas</option><option value="ideas_feeds">Idea Page</option><option value="home_feed">Home Feed</option><option value="related_pin_snowball">Related Pins</option><option value="board_feed">Board</option></select>
              <select x-model="filters.creationMethod" @change="onCandidateFilterChange()" aria-label="Filter by creation method" class="px-2 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#121215] text-xs text-slate-700 dark:text-[#FAFAFA] cursor-pointer"><option value="">Method: All</option><option value="uploaded">Uploaded</option><option value="photos">Photos</option><option value="pin_scheduling">Scheduled</option><option value="pinterest_platform">Pinterest Platform</option><option value="organic_pin">Organic Pin</option><option value="in_app_browser">In-App Browser</option><option value="share_extension_ios">iOS Share</option><option value="share_extension_android">Android Share</option><option value="idea_pin">Idea Pin</option><option value="carousel">Carousel</option><option value="bookmarklet">Bookmarklet</option><option value="extension">Browser Extension</option><option value="instagram_api">Instagram</option><option value="shuffles_composer">Shuffles</option><option value="csv_importer">CSV Import</option></select>
              <select x-model="filters.repinFilter" @change="onCandidateFilterChange()" aria-label="Filter by pin type" class="px-2 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#121215] text-xs text-slate-700 dark:text-[#FAFAFA] cursor-pointer"><option value="">Type: All</option><option value="original">Original</option><option value="repin">Repin</option></select>

              <input type="search"
                     x-model="filters.search"
                     @input.debounce.300ms="onCandidateFilterChange()"
                     aria-label="Filter results by title, domain, or board"
                     placeholder="Filter title, domain..."
                     class="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#121215] text-xs text-slate-800 dark:text-[#FAFAFA] w-36 sm:w-44 focus:outline-none focus:ring-2 focus:ring-rose-500" />

              <select x-model="filters.sort"
                      @change="loadCandidates(true)"
                      aria-label="Sort Golden Pins"
                      class="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#121215] text-xs font-medium text-slate-700 dark:text-[#FAFAFA] cursor-pointer">
                <option value="repins">Sort: Re-pins (High -&gt; Low)</option>
                <option value="cluster_hits">Sort: Cluster Hits (2x+)</option>
                <option value="fresh">Sort: Age (Youngest)</option>
                <option value="repin_per_day">Sort: Re-pins / day</option>
                <option value="saves">Sort: Saves</option>
                <option value="shares">Sort: Pin Shares (High -&gt; Low)</option>
              </select>

              <button type="button"
                      @click="exportAllCsv()"
                      :disabled="candidates.length === 0 || isExportingCsv"
                      class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] hover:bg-slate-50 dark:hover:bg-[#27272A] disabled:opacity-50 text-xs font-semibold text-slate-700 dark:text-[#FAFAFA] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">
                <i data-lucide="download" class="w-3.5 h-3.5 text-slate-500" aria-hidden="true"></i>
                <span x-text="isExportingCsv ? 'Exporting...' : (candidatesTotal > candidates.length ? ('Export All (' + candidatesTotal + ')') : 'Export CSV')">Export CSV</span>
              </button>
            </div>
          </div>

          <!-- Bulk Selection Action Bar -->
          <template x-if="selectedPinIds.length > 0">
            <div class="flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-slate-100 dark:border-[#27272A]">
              <div class="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-[#FAFAFA]">
                <span class="px-2 py-0.5 rounded-md bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 font-mono tabular-nums" x-text="selectedPinIds.length + ' selected'"></span>
                <button type="button" @click="selectedPinIds = []" class="text-slate-500 hover:underline font-normal cursor-pointer">Clear</button>
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <button type="button"
                        @click="scrollRelatedPins(selectedPinIds)"
                        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] hover:bg-slate-50 dark:hover:bg-[#27272A] text-xs font-semibold text-slate-700 dark:text-[#FAFAFA] cursor-pointer">
                  <i data-lucide="git-branch" class="w-3.5 h-3.5 text-rose-500" aria-hidden="true"></i>
                  <span x-text="'Scroll Related (' + huntPaths.related.target_pins + ')'"></span>
                </button>
                <button type="button"
                        @click="pullAccountReach(selectedPinIds)"
                        :disabled="isPullingBulkAccounts"
                        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50 dark:bg-indigo-950/30 disabled:opacity-60 text-xs font-semibold text-indigo-700 dark:text-indigo-300 cursor-pointer">
                  <i data-lucide="user-check" class="w-3.5 h-3.5" aria-hidden="true"></i>
                  <span x-text="isPullingBulkAccounts ? 'Pulling...' : 'Pull Account Reach'"></span>
                </button>
                <div class="inline-flex items-center gap-1.5 pl-1 border-l border-slate-200 dark:border-[#27272A]">
                  <select x-model="targetCampaignFolderId"
                          @change="handleCampaignDropdownChange('target', $event.target.value)"
                          aria-label="Target campaign folder"
                          class="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#121215] text-xs text-slate-700 dark:text-[#FAFAFA] max-w-[175px] cursor-pointer">
                    <option value="">Campaign...</option>
                    <template x-for="f in foldersList" :key="f.id">
                      <option :value="String(f.id)" x-text="f.name"></option>
                    </template>
                    <option value="__create_new__">+ Create New Campaign...</option>
                  </select>
                  <button type="button"
                          @click="sendSelectedNewbornPinsToCampaign()"
                          :disabled="isSendingToCampaign || !targetCampaignFolderId || targetCampaignFolderId === '__create_new__'"
                          class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-xs font-semibold text-white cursor-pointer">
                    <i data-lucide="folder-plus" class="w-3.5 h-3.5" aria-hidden="true"></i>
                    <span x-text="isSendingToCampaign ? 'Sending...' : 'Send to Campaign'"></span>
                  </button>
                </div>
                <button type="button"
                        @click="openPromoteModal(selectedPinIds)"
                        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-xs font-semibold text-white cursor-pointer">
                  <i data-lucide="bookmark-plus" class="w-3.5 h-3.5" aria-hidden="true"></i>
                  <span>Track Daily</span>
                </button>
                <button type="button"
                        @click="stagePins(selectedPinIds, 'discarded')"
                        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] text-xs font-medium text-slate-500 hover:text-rose-600 cursor-pointer">
                  <span>Discard</span>
                </button>
              </div>
            </div>
          </template>
        </div>

        <!-- Empty State -->
        <template x-if="!isLoading && candidates.length === 0">
          <div class="bg-white dark:bg-[#18181B] rounded-2xl border border-dashed border-slate-300 dark:border-[#27272A] p-10 text-center space-y-3">
            <div class="w-11 h-11 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
              <i data-lucide="radar" class="w-5 h-5" aria-hidden="true"></i>
            </div>
            <h2 class="text-base font-bold text-slate-900 dark:text-[#FAFAFA]">No Golden Pins in this view yet</h2>
            <p class="text-xs sm:text-sm text-slate-500 dark:text-[#A1A1AA] max-w-md mx-auto">
              Enter a keyword above, set your <strong>Max Pin Age</strong> and <strong>Min Re-pins</strong>, choose your deep-scroll paths, and click <strong>Hunt Golden Pins</strong>.
            </p>
          </div>
        </template>

        <!-- Loading Skeleton -->
        <template x-if="isLoading && candidates.length === 0">
          <div class="bg-white dark:bg-[#18181B] rounded-2xl border border-slate-200 dark:border-[#27272A] p-6 space-y-3 animate-pulse">
            <div class="h-6 w-1/3 rounded bg-slate-100 dark:bg-[#27272A]"></div>
            <div class="h-14 w-full rounded bg-slate-100 dark:bg-[#27272A]"></div>
            <div class="h-14 w-full rounded bg-slate-100 dark:bg-[#27272A]"></div>
            <div class="h-14 w-full rounded bg-slate-100 dark:bg-[#27272A]"></div>
          </div>
        </template>

        <!-- Clean Golden Pins Table (High-Signal Core Metrics Only) -->
        <template x-if="candidates.length > 0">
          <div class="bg-white dark:bg-[#18181B] rounded-2xl border border-slate-200 dark:border-[#27272A] shadow-xs overflow-hidden">
            <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="border-b border-slate-200 dark:border-[#27272A] bg-slate-50/70 dark:bg-[#121215] text-[11px] uppercase tracking-wider text-slate-500 dark:text-[#A1A1AA]">
                  <th class="py-3 pl-4 pr-2 w-9">
                    <input type="checkbox"
                           :checked="candidates.length > 0 && selectedPinIds.length === candidates.length"
                           @change="toggleSelectAllPins($event.target.checked)"
                           aria-label="Select all Golden Pins"
                           class="rounded text-rose-600 focus:ring-rose-500 cursor-pointer" />
                  </th>
                  <th class="py-3 px-3 font-semibold min-w-[260px]">Pin &amp; Destination</th>
                  <th class="py-3 px-3 font-semibold whitespace-nowrap" x-text="settingsDraft?.qualification?.resolve_root_pin ? 'Root Age' : 'Pin Age'">Pin Age</th>
                  <th class="py-3 px-3 font-semibold whitespace-nowrap">Re-pins</th>
                  <th class="py-3 px-3 font-semibold min-w-[210px]">Pin Annotations</th>
                  <th class="py-3 px-3 font-semibold whitespace-nowrap">Discovery Source</th>
                  <th class="py-3 px-3 font-semibold whitespace-nowrap">Account (Opt-In)</th>
                  <th class="py-3 pl-3 pr-4 font-semibold text-right whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-[#27272A] text-xs">
                <template x-for="pin in candidates" :key="pin.pin_id">
                  <tr class="hover:bg-slate-50/80 dark:hover:bg-[#27272A]/30 align-top transition-colors">
                    <!-- Select Checkbox -->
                    <td class="py-3 pl-4 pr-2">
                      <input type="checkbox"
                             :value="pin.pin_id"
                             :checked="selectedPinIds.includes(pin.pin_id)"
                             @change="togglePinSelection(pin.pin_id)"
                             :aria-label="'Select pin ' + pin.pin_id"
                             class="mt-1 rounded text-rose-600 focus:ring-rose-500 cursor-pointer" />
                    </td>

                    <!-- Pin Image + Title + Destination Domain / No Link Badge -->
                    <td class="py-3 px-3">
                      <div class="flex items-start gap-3 min-w-0">
                        <button type="button"
                                @click="openDossier(pin.pin_id)"
                                class="w-12 h-16 rounded-lg overflow-hidden bg-slate-100 dark:bg-[#121215] border border-slate-200/80 dark:border-[#27272A] shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">
                          <template x-if="pin.image_url">
                            <img :src="pin.image_url"
                                 :alt="pin.title || 'Golden Pinterest pin'"
                                 width="48"
                                 height="64"
                                 loading="lazy"
                                 class="w-full h-full object-cover" />
                          </template>
                          <template x-if="!pin.image_url">
                            <span class="flex items-center justify-center w-full h-full text-[10px] text-slate-400">Pin</span>
                          </template>
                        </button>

                        <div class="min-w-0 space-y-1">
                          <button type="button"
                                  @click="openDossier(pin.pin_id)"
                                  class="text-left font-semibold text-slate-900 dark:text-[#FAFAFA] hover:text-rose-600 dark:hover:text-rose-400 line-clamp-2 leading-snug cursor-pointer"
                                  x-text="pin.title || ('Pin #' + pin.pin_id)"></button>

                          <div class="flex items-center gap-1.5 flex-wrap">
                            <template x-if="pin.is_linkless">
                              <span class="inline-flex items-center px-1.5 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-[10px] font-bold">
                                No Link / Linkless
                              </span>
                            </template>
                            <template x-if="!pin.is_linkless && pin.clean_domain">
                              <a :href="pin.destination_url || ('https://' + pin.clean_domain)"
                                 target="_blank"
                                 rel="noopener noreferrer"
                                 class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-[#27272A] text-slate-700 dark:text-[#E4E4E7] hover:text-rose-600 text-[11px] font-medium truncate max-w-[170px]"
                                 x-text="pin.clean_domain"></a>
                            </template>
                            <a :href="'https://www.pinterest.com/pin/' + encodeURIComponent(pin.pin_id) + '/'"
                               target="_blank"
                               rel="noopener noreferrer"
                               title="Open Pin on Pinterest"
                               class="inline-flex items-center gap-0.5 text-[11px] text-slate-400 hover:text-rose-600 font-mono">
                              <span>Pinterest</span>
                              <i data-lucide="external-link" class="w-3 h-3" aria-hidden="true"></i>
                            </a>
                            <template x-if="formatCreationMethodLabel(pin.raw_creation_method)">
                              <span class="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#27272A] text-slate-600 dark:text-[#A1A1AA] text-[10px] font-medium" x-text="formatCreationMethodLabel(pin.raw_creation_method)"></span>
                            </template>
                            <template x-if="pin.is_repin">
                              <span class="px-1.5 py-0.5 rounded bg-violet-50 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300 text-[10px] font-semibold">Repin</span>
                            </template>
                          </div>
                        </div>
                      </div>
                    </td>

                    <!-- Pin Age (Direct by default; Root Age if legacy unwrap enabled) -->
                    <td class="py-3 px-3 whitespace-nowrap">
                      <span class="inline-flex items-center px-2 py-0.5 rounded-lg bg-slate-900 dark:bg-[#27272A] text-white text-xs font-mono tabular-nums font-bold"
                            :title="pin.created_at_pinterest ? ((settingsDraft?.qualification?.resolve_root_pin ? 'Verified root created UTC: ' : 'Pin created UTC: ') + pin.created_at_pinterest) : 'Pin age'"
                            x-text="formatRootAge(pin.age_days)"></span>
                      <div class="text-[10px] font-mono tabular-nums text-slate-400 mt-1"
                           x-text="formatUtcDateOnly(pin.created_at_pinterest)"></div>
                    </td>

                    <!-- Re-pins (Prominent Primary Metric + Re-pins/day, Saves quietly alongside) -->
                    <td class="py-3 px-3 whitespace-nowrap font-mono tabular-nums">
                      <div class="text-sm font-bold text-slate-900 dark:text-[#FAFAFA]"
                           x-text="formatNullableCount(pin.repin_count)"></div>
                      <div class="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400"
                           x-text="formatVelocity(pin.repin_per_day)"></div>
                      <template x-if="pin.save_count != null">
                        <div class="text-[10px] text-slate-400 mt-0.5"
                             x-text="'Saves: ' + formatNullableCount(pin.save_count)"></div>
                      </template>
                      <template x-if="pin.share_count != null">
                        <div class="text-[10px] text-slate-400"
                             x-text="'Shares: ' + formatNullableCount(pin.share_count)"></div>
                      </template>
                    </td>

                    <!-- Pin Annotations (Extracted from pin_join) -->
                    <td class="py-3 px-3">
                      <div class="flex flex-wrap gap-1 max-w-[260px]">
                        <template x-for="tag in extractPinAnnotationNames(pin).slice(0, 6)" :key="tag">
                          <button type="button"
                                  @click="selectAnnotationFilter(tag)"
                                  class="px-2 py-0.5 rounded-md text-[11px] border transition-colors cursor-pointer"
                                  :class="filters.annotation && filters.annotation.toLowerCase() === tag.toLowerCase() ? 'bg-rose-600 border-rose-600 text-white font-semibold' : 'bg-slate-50 dark:bg-[#121215] border-slate-200 dark:border-[#27272A] text-slate-700 dark:text-[#E4E4E7] hover:border-rose-300'"
                                  x-text="tag"></button>
                        </template>
                        <template x-if="extractPinAnnotationNames(pin).length === 0">
                          <span class="text-[11px] text-slate-400">—</span>
                        </template>
                      </div>
                    </td>

                    <!-- Discovery Source (All Real Surfaces + True Discovery Context) -->
                    <td class="py-3 px-3">
                      <div class="flex items-center gap-1 flex-wrap max-w-[190px]">
                        <template x-for="surf in getPinDisplaySurfaces(pin)" :key="surf">
                          <span class="inline-flex items-center px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-[#27272A] text-slate-700 dark:text-[#E4E4E7] text-[10px] font-semibold"
                                x-text="formatSurfaceLabel(surf)"></span>
                        </template>
                        <template x-if="(pin.cluster_hit_count || (pin.matched_queries ? pin.matched_queries.length : 0)) >= 2">
                          <span class="inline-flex items-center px-1.5 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-[10px] font-mono font-bold"
                                :title="'Matched cluster keywords: ' + (pin.matched_queries || []).join(', ')"
                                x-text="'Cluster Hit ' + (pin.cluster_hit_count || pin.matched_queries.length) + 'x'"></span>
                        </template>
                      </div>
                      <template x-if="pin.discovery_board_name && formatBoardUrl(pin.discovery_board_url || pin.board_url)">
                        <a :href="formatBoardUrl(pin.discovery_board_url || pin.board_url)"
                           target="_blank"
                           rel="noopener noreferrer"
                           class="block text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline truncate max-w-[180px] mt-1"
                           :title="'Discovery Board: ' + pin.discovery_board_name"
                           x-text="'Board: ' + pin.discovery_board_name"></a>
                      </template>
                      <template x-if="pin.discovery_board_name && !formatBoardUrl(pin.discovery_board_url || pin.board_url)">
                        <div class="text-[11px] text-slate-500 dark:text-[#A1A1AA] truncate max-w-[180px] mt-1" :title="'Discovery Board: ' + pin.discovery_board_name" x-text="'Board: ' + pin.discovery_board_name"></div>
                      </template>
                      <template x-if="!pin.discovery_board_name && (pin.seed_query || (pin.matched_queries && pin.matched_queries.length > 0))">
                        <div class="text-[11px] text-slate-500 dark:text-[#A1A1AA] truncate max-w-[180px] mt-1"
                             :title="'Matched query: ' + (pin.seed_query || pin.matched_queries[0])"
                             x-text="'Query: ' + (pin.seed_query || pin.matched_queries[0])"></div>
                      </template>
                    </td>

                    <!-- Opt-In Account Column (Off by default until user clicks Pull Account) -->
                    <td class="py-3 px-3 whitespace-nowrap">
                      <template x-if="pin.creator_monthly_reach != null || pin.creator_profile_views != null">
                        <div class="space-y-0.5">
                          <div class="font-semibold text-slate-800 dark:text-[#FAFAFA] truncate max-w-[135px]"
                               x-text="pin.effective_creator_username ? ('@' + pin.effective_creator_username) : 'Creator'"></div>
                          <div class="text-[11px] font-mono tabular-nums text-emerald-700 dark:text-emerald-400"
                               x-text="'Total audience: ' + formatReach(pin.creator_monthly_reach)"></div>
                          <template x-if="pin.creator_profile_views != null">
                            <div class="text-[10px] font-mono tabular-nums text-slate-500 dark:text-[#A1A1AA]"
                                 x-text="'Impressions: ' + formatReach(pin.creator_profile_views)"></div>
                          </template>
                        </div>
                      </template>
                      <template x-if="pin.creator_monthly_reach == null && pin.creator_profile_views == null">
                        <div class="text-[11px] text-slate-400">
                          <div x-text="pin.effective_creator_username ? ('@' + pin.effective_creator_username) : 'Not pulled'"></div>
                          <div class="text-[10px] text-slate-400/80">On-demand</div>
                        </div>
                      </template>
                    </td>

                    <!-- 3 Clean Manual Actions -->
                    <td class="py-3 pl-3 pr-4 text-right whitespace-nowrap">
                      <div class="inline-flex items-center justify-end gap-1.5">
                        <button type="button"
                                @click="scrollRelatedPins([pin.pin_id])"
                                title="Deep-scroll Related Pins from this Golden Pin"
                                class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#121215] hover:bg-slate-100 dark:hover:bg-[#27272A] text-[11px] font-semibold text-slate-700 dark:text-[#FAFAFA] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">
                          <i data-lucide="git-branch" class="w-3 h-3 text-rose-500" aria-hidden="true"></i>
                          <span>Scroll Related</span>
                        </button>

                        <button type="button"
                                @click="openPromoteModal([pin.pin_id])"
                                class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                                :class="pin.stage === 'promoted' ? 'bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300' : 'bg-rose-600 hover:bg-rose-700 text-white'">
                          <i data-lucide="bookmark-plus" class="w-3 h-3" aria-hidden="true"></i>
                          <span x-text="pin.stage === 'promoted' ? 'Tracking' : 'Track Daily'"></span>
                        </button>

                        <button type="button"
                                @click="pullAccountReach([pin.pin_id])"
                                :disabled="Boolean(pullingAccountPins[pin.pin_id])"
                                title="Pull creator Total audience & Impressions via Zero-Cookie UserResource"
                                class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/70 dark:bg-indigo-950/30 hover:bg-indigo-100/70 disabled:opacity-50 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
                          <i data-lucide="user-check" class="w-3 h-3" :class="pullingAccountPins[pin.pin_id] ? 'animate-pulse' : ''" aria-hidden="true"></i>
                          <span x-text="pullingAccountPins[pin.pin_id] ? 'Pulling...' : 'Pull Account'"></span>
                        </button>
                      </div>
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
            </div>
            <div class="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-t border-slate-200 dark:border-[#27272A] bg-slate-50/70 dark:bg-[#121215] text-xs text-slate-600 dark:text-[#A1A1AA]">
              <span class="font-mono tabular-nums" x-text="'Showing ' + candidatesRangeStart() + '–' + candidatesRangeEnd() + ' of ' + candidatesTotal"></span>
              <div class="flex items-center gap-2">
                <select x-model.number="candidatesPageSize" @change="changeCandidatesPageSize()" aria-label="Rows per page" class="px-2 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] text-xs text-slate-700 dark:text-[#FAFAFA] cursor-pointer"><option value="50">50 / page</option><option value="100">100 / page</option><option value="200">200 / page</option><option value="500">500 / page</option></select>
                <button type="button" @click="prevCandidatesPage()" :disabled="!hasPrevCandidatesPage()" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] hover:bg-slate-100 dark:hover:bg-[#27272A] disabled:opacity-40 text-slate-700 dark:text-[#FAFAFA] cursor-pointer"><i data-lucide="chevron-left" class="w-3.5 h-3.5" aria-hidden="true"></i><span>Prev</span></button>
                <button type="button" @click="nextCandidatesPage()" :disabled="!hasNextCandidatesPage()" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] hover:bg-slate-100 dark:hover:bg-[#27272A] disabled:opacity-40 text-slate-700 dark:text-[#FAFAFA] cursor-pointer"><span>Next</span><i data-lucide="chevron-right" class="w-3.5 h-3.5" aria-hidden="true"></i></button>
              </div>
            </div>
          </div>
        </template>
      </section>
    </template>

    <!-- ====================================================================== -->
    <!-- VIEW 3: PAST HUNTS (Click any run to inspect its isolated results)     -->
    <!-- ====================================================================== -->
    <template x-if="activeView === 'history'">
      <section id="panel-newborn-history" role="tabpanel" aria-labelledby="tab-newborn-history" class="bg-white dark:bg-[#18181B] rounded-2xl border border-slate-200 dark:border-[#27272A] shadow-xs overflow-x-auto">
        <div class="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-slate-200 dark:border-[#27272A] bg-slate-50/70 dark:bg-[#121215]/70">
          <div class="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-[#E4E4E7]">
            <i data-lucide="history" class="w-4 h-4 text-slate-400" aria-hidden="true"></i>
            <span>Past Hunts</span>
            <span class="px-2 py-0.5 rounded-full bg-white dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A] text-[11px] font-mono tabular-nums text-slate-600 dark:text-[#A1A1AA]" x-text="runs.length"></span>
          </div>
          <template x-if="failedOrEmptyRunsCount() > 0">
            <button type="button"
                    @click="clearFailedAndEmptyRuns()"
                    :disabled="isClearingRuns"
                    class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-950/50 text-xs font-semibold text-rose-700 dark:text-rose-300 disabled:opacity-60 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">
              <i data-lucide="trash-2" class="w-3.5 h-3.5" aria-hidden="true"></i>
              <span x-text="isClearingRuns ? 'Clearing...' : ('Clear Failed & Empty (' + failedOrEmptyRunsCount() + ')')"></span>
            </button>
          </template>
        </div>
        <template x-if="runs.length === 0">
          <div class="p-8 text-center text-xs text-slate-500 dark:text-[#A1A1AA]">
            No past hunts recorded yet. Launch your first deep-scroll hunt above.
          </div>
        </template>
        <template x-if="runs.length > 0">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="border-b border-slate-200 dark:border-[#27272A] text-[11px] uppercase tracking-wider text-slate-500 dark:text-[#A1A1AA]">
                <th class="py-3 px-4 font-semibold">Hunt</th>
                <th class="py-3 px-4 font-semibold">Status</th>
                <th class="py-3 px-4 font-semibold">Scrolled -&gt; Matched -&gt; Winners</th>
                <th class="py-3 px-4 font-semibold">Started</th>
                <th class="py-3 px-4 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-[#27272A] text-xs">
              <template x-for="r in runs" :key="r.id">
                <tr class="hover:bg-slate-50/70 dark:hover:bg-[#27272A]/30 cursor-pointer" @click="selectPastRun(r)">
                  <td class="py-3 px-4">
                    <div class="font-semibold text-slate-900 dark:text-[#FAFAFA]" x-text="'#' + r.id + ' · ' + (formatRunSeedLabel(r) || r.run_type)"></div>
                    <div class="text-[11px] text-slate-500" x-text="r.progress_detail || r.cookie_mode || ''"></div>
                  </td>
                  <td class="py-3 px-4">
                    <div class="flex items-center gap-1.5 flex-wrap">
                      <span class="px-2 py-0.5 rounded-full text-[11px] font-semibold"
                            :class="getRunStatusBadgeClass(r.status)"
                            x-text="getRunStatusLabel(r.status)"></span>
                      <template x-if="r.execution_mode === 'fleet'">
                        <span class="px-1.5 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 text-[10px] font-mono font-semibold"
                              x-text="'Fleet ' + Number(r.shards_completed || 0) + '/' + Number(r.shards_total || 1)"></span>
                      </template>
                    </div>
                  </td>
                  <td class="py-3 px-4 font-mono tabular-nums text-slate-700 dark:text-[#E4E4E7]">
                    <span x-text="formatNullableCount(getRunFunnel(r).scrolled)"></span>
                    <span class="text-slate-400 mx-1">-&gt;</span>
                    <span class="text-indigo-600 dark:text-indigo-400" x-text="formatNullableCount(getRunFunnel(r).matchedRepins)"></span>
                    <span class="text-slate-400 mx-1">-&gt;</span>
                    <strong class="text-emerald-600 dark:text-emerald-400" x-text="formatNullableCount(getRunFunnel(r).verifiedWinners)"></strong>
                  </td>
                  <td class="py-3 px-4 font-mono tabular-nums text-slate-500" x-text="formatShortTimestamp(r.started_at)"></td>
                  <td class="py-3 px-4 text-right whitespace-nowrap">
                    <div class="inline-flex items-center gap-1.5">
                      <template x-if="isRunActiveStatus(r.status)">
                        <button type="button"
                                @click.stop="reconnectToRun(r)"
                                class="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer">
                          Reconnect
                        </button>
                      </template>
                      <button type="button"
                              @click.stop="selectPastRun(r)"
                              class="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] hover:border-rose-300 text-xs font-semibold text-slate-700 dark:text-[#FAFAFA] cursor-pointer">
                        View Results
                      </button>
                      <template x-if="!isRunActiveStatus(r.status)">
                        <button type="button"
                                @click.stop="deletePastRun(r)"
                                :disabled="deletingRunId === Number(r.id)"
                                :title="confirmDeleteRunId === Number(r.id) ? 'Click again to confirm deletion' : 'Delete hunt and unpromoted orphan pins'"
                                class="inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                                :class="confirmDeleteRunId === Number(r.id) ? 'border-rose-500 bg-rose-600 text-white hover:bg-rose-700' : 'border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] text-slate-500 hover:text-rose-600 hover:border-rose-300'">
                          <i data-lucide="trash-2" class="w-3.5 h-3.5" aria-hidden="true"></i>
                          <template x-if="confirmDeleteRunId === Number(r.id)">
                            <span>Confirm</span>
                          </template>
                        </button>
                      </template>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </template>
      </section>
    </template>
  `.replace(/\n[ \t]+/g, '\n');
}
