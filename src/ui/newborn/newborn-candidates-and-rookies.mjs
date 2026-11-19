/**
 * src/ui/newborn/newborn-candidates-and-rookies.mjs
 *
 * Clean 3-View Results Workspace (`This Hunt` | `Watchlist` | `Past Hunts`):
 * - `This Hunt` (Default): Strictly scoped to `activeRunId` (`newborn_run_candidates`) with
 *   verified root ages, real Saves & +Saves/day, Linkless Goldmine badge, human-readable upload
 *   source, Origin Creator (`Total audience` / `Rookie`), external Pinterest board link, two crisp
 *   primary actions (`Find Related Newborns` & `Track / Promote`), bulk action bar, and a compact
 *   collapsible "Winning Keywords, Board Names & Rising Creators from This Hunt" bar.
 * - `Watchlist`: Staged watchlist pins + `01:00 UTC` Daily Anchors + async `Poll Watchlist Now`.
 * - `Past Hunts`: Run history table where clicking any hunt loads its isolated results into `This Hunt`.
 */

export function getNewbornCandidatesAndRookiesHtml() {
  return `
    <!-- Clean 3-View Navigation Strip -->
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

        <button type="button"
                role="tab"
                id="tab-newborn-watchlist"
                :aria-selected="activeView === 'watchlist' ? 'true' : 'false'"
                aria-controls="panel-newborn-watchlist"
                @click="switchView('watchlist')"
                class="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                :class="activeView === 'watchlist' ? 'bg-white dark:bg-[#27272A] text-slate-900 dark:text-[#FAFAFA] shadow-xs' : 'text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-[#FAFAFA]'">
          <i data-lucide="bookmark-check" class="w-3.5 h-3.5 text-indigo-500" aria-hidden="true"></i>
          <span>Watchlist</span>
          <span class="px-1.5 py-0.5 rounded-md text-[10px] font-mono tabular-nums bg-slate-100 dark:bg-[#18181B] text-slate-700 dark:text-[#E4E4E7]" x-text="(overview?.counts?.watchlist_count || 0) + (overview?.counts?.active_daily_anchors_count || 0)"></span>
        </button>

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

      <!-- Compact Live Summary KPIs -->
      <div class="flex items-center gap-3 flex-wrap text-xs text-slate-500 dark:text-[#A1A1AA] font-mono tabular-nums">
        <span>Golden: <strong class="text-slate-900 dark:text-[#FAFAFA]" x-text="overview?.counts?.golden_pins_count || 0"></strong></span>
        <span>Linkless: <strong class="text-amber-600 dark:text-amber-400" x-text="overview?.counts?.linkless_vacuum_count || 0"></strong></span>
        <span>Daily Anchors: <strong class="text-emerald-600 dark:text-emerald-400" x-text="overview?.counts?.active_daily_anchors_count || 0"></strong></span>
      </div>
    </div>

    <!-- ====================================================================== -->
    <!-- VIEW 1: THIS HUNT (Strictly Scoped to activeRunId)                     -->
    <!-- ====================================================================== -->
    <template x-if="activeView === 'hunt'">
      <section id="panel-newborn-hunt" role="tabpanel" aria-labelledby="tab-newborn-hunt" class="space-y-5">

        <!-- Active Hunt Context + Filter & Sort Bar -->
        <div class="bg-white dark:bg-[#18181B] rounded-2xl border border-slate-200 dark:border-[#27272A] p-3.5 shadow-xs space-y-3">
          <div class="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
            <div class="flex items-center gap-2 flex-wrap">
              <template x-if="activeRunId">
                <div class="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200/80 dark:border-rose-900/50 text-xs">
                  <span class="font-bold text-rose-700 dark:text-rose-300 font-mono tabular-nums" x-text="'Hunt #' + activeRunId"></span>
                  <template x-if="activeRun && formatRunSeedLabel(activeRun)">
                    <span class="text-slate-700 dark:text-[#E4E4E7] font-medium" x-text="formatRunSeedLabel(activeRun)"></span>
                  </template>
                  <button type="button"
                          @click="clearRunScope()"
                          class="text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:underline ml-1 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 rounded">
                    Show all verified
                  </button>
                </div>
              </template>
              <template x-if="!activeRunId">
                <div class="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-[#E4E4E7]">
                  <i data-lucide="layers" class="w-3.5 h-3.5 text-slate-400" aria-hidden="true"></i>
                  <span>All Verified Newborn Pins</span>
                </div>
              </template>
            </div>

            <!-- Quick Filter Chips & Sort -->
            <div class="flex flex-wrap items-center gap-2">
              <button type="button"
                      @click="toggleFilterFlag('goldenOnly')"
                      class="px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                      :class="filters.goldenOnly ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300' : 'bg-slate-50 dark:bg-[#121215] border-slate-200 dark:border-[#27272A] text-slate-600 dark:text-[#A1A1AA]'">
                Golden Winners
              </button>
              <button type="button"
                      @click="toggleFilterFlag('linklessOnly')"
                      class="px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                      :class="filters.linklessOnly ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300' : 'bg-slate-50 dark:bg-[#121215] border-slate-200 dark:border-[#27272A] text-slate-600 dark:text-[#A1A1AA]'">
                Linkless Goldmine
              </button>
              <button type="button"
                      @click="toggleFilterFlag('rookieOnly')"
                      class="px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                      :class="filters.rookieOnly ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300' : 'bg-slate-50 dark:bg-[#121215] border-slate-200 dark:border-[#27272A] text-slate-600 dark:text-[#A1A1AA]'">
                Rookie Creators
              </button>

              <input type="search"
                     x-model="filters.search"
                     @input.debounce.300ms="loadCandidates()"
                     aria-label="Filter results by title, board, or creator"
                     placeholder="Filter results..."
                     class="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#121215] text-xs text-slate-800 dark:text-[#FAFAFA] w-36 sm:w-44 focus:outline-none focus:ring-2 focus:ring-rose-500" />

              <select x-model="filters.sort"
                      @change="loadCandidates()"
                      aria-label="Sort results"
                      class="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#121215] text-xs font-medium text-slate-700 dark:text-[#FAFAFA] cursor-pointer">
                <option value="golden_score">Sort: Golden Score</option>
                <option value="save_per_day">Sort: +Saves / day</option>
                <option value="saves">Sort: Total Saves</option>
                <option value="fresh">Sort: Newest Age</option>
              </select>
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
                        @click="snowballPins(selectedPinIds)"
                        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] hover:bg-slate-50 dark:hover:bg-[#27272A] text-xs font-semibold text-slate-700 dark:text-[#FAFAFA] cursor-pointer">
                  <i data-lucide="git-branch" class="w-3.5 h-3.5 text-rose-500" aria-hidden="true"></i>
                  <span>Find Related Newborns</span>
                </button>
                <button type="button"
                        @click="stagePins(selectedPinIds, 'watchlist')"
                        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50 dark:bg-indigo-950/30 text-xs font-semibold text-indigo-700 dark:text-indigo-300 cursor-pointer">
                  <i data-lucide="bookmark-plus" class="w-3.5 h-3.5" aria-hidden="true"></i>
                  <span>Add to Watchlist</span>
                </button>
                <button type="button"
                        @click="openPromoteModal(selectedPinIds)"
                        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-xs font-semibold text-white cursor-pointer">
                  <i data-lucide="arrow-up-right" class="w-3.5 h-3.5" aria-hidden="true"></i>
                  <span>Track / Promote</span>
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

        <!-- Collapsible "Winning Keywords, Board Names & Rising Creators from This Hunt" Bar -->
        <div class="bg-white dark:bg-[#18181B] rounded-2xl border border-slate-200 dark:border-[#27272A] shadow-xs overflow-hidden">
          <button type="button"
                  @click="toggleHuntInsights()"
                  :aria-expanded="showHuntInsights ? 'true' : 'false'"
                  aria-controls="newborn-hunt-insights-body"
                  class="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50/70 dark:hover:bg-[#27272A]/40 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rose-500">
            <div class="flex items-center gap-2.5 min-w-0">
              <i data-lucide="sparkles" class="w-4 h-4 text-rose-500 shrink-0" aria-hidden="true"></i>
              <span class="text-xs sm:text-sm font-semibold text-slate-900 dark:text-[#FAFAFA] truncate">
                Winning Keywords, Board Names &amp; Rising Creators from This Hunt
              </span>
              <span class="px-2 py-0.5 rounded-full text-[11px] font-mono tabular-nums bg-slate-100 dark:bg-[#27272A] text-slate-600 dark:text-[#A1A1AA] shrink-0"
                    x-text="crossoverClusters.length + ' keywords · ' + rookies.length + ' creators'"></span>
            </div>
            <i data-lucide="chevron-down" class="w-4 h-4 text-slate-400 shrink-0 transition-transform duration-150" :class="showHuntInsights ? 'rotate-180' : ''" aria-hidden="true"></i>
          </button>

          <template x-if="showHuntInsights">
            <div id="newborn-hunt-insights-body" class="p-4 pt-2 border-t border-slate-100 dark:border-[#27272A] grid grid-cols-1 lg:grid-cols-2 gap-4">
              <!-- Winning Keywords & Board Names -->
              <div class="space-y-2.5">
                <h3 class="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-[#A1A1AA]">
                  Winning Keywords &amp; Board Templates
                </h3>
                <template x-if="crossoverClusters.length === 0">
                  <p class="text-xs text-slate-400 py-3">Run a hunt to synthesize winning annotations and board title blueprints.</p>
                </template>
                <template x-if="crossoverClusters.length > 0">
                  <div class="space-y-2">
                    <template x-for="cl in crossoverClusters.slice(0, 6)" :key="cl.annotation">
                      <div class="p-2.5 rounded-xl border border-slate-100 dark:border-[#27272A] bg-slate-50/70 dark:bg-[#121215] flex items-center justify-between gap-2">
                        <div class="min-w-0">
                          <div class="flex items-center gap-2">
                            <span class="text-xs font-semibold text-slate-900 dark:text-[#FAFAFA] truncate" x-text="cl.annotation"></span>
                            <span class="text-[10px] font-mono tabular-nums text-emerald-600 dark:text-emerald-400 font-semibold" x-text="cl.pin_count + ' pins'"></span>
                          </div>
                          <template x-if="cl.top_board_names && cl.top_board_names.length > 0">
                            <p class="text-[11px] text-slate-500 dark:text-[#A1A1AA] truncate mt-0.5"
                               x-text="'Board: ' + cl.top_board_names.slice(0, 2).map(b => b.name || b).join(' · ')"></p>
                          </template>
                        </div>
                        <button type="button"
                                @click="selectTrendAndHunt(cl.annotation)"
                                class="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] hover:border-rose-300 text-[11px] font-semibold text-slate-700 dark:text-[#FAFAFA] shrink-0 cursor-pointer">
                          Hunt
                        </button>
                      </div>
                    </template>
                  </div>
                </template>
              </div>

              <!-- Rising Creators -->
              <div class="space-y-2.5">
                <h3 class="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-[#A1A1AA]">
                  Rising Creators (Low Followers, High Audience)
                </h3>
                <template x-if="rookies.length === 0">
                  <p class="text-xs text-slate-400 py-3">No rising rookie creators detected in this hunt yet.</p>
                </template>
                <template x-if="rookies.length > 0">
                  <div class="space-y-2">
                    <template x-for="rk in rookies.slice(0, 6)" :key="rk.username">
                      <div class="p-2.5 rounded-xl border border-slate-100 dark:border-[#27272A] bg-slate-50/70 dark:bg-[#121215] flex items-center justify-between gap-2">
                        <div class="min-w-0">
                          <div class="flex items-center gap-2">
                            <a :href="'https://www.pinterest.com/' + encodeURIComponent(rk.username) + '/'"
                               target="_blank"
                               rel="noopener noreferrer"
                               class="text-xs font-semibold text-slate-900 dark:text-[#FAFAFA] hover:text-rose-600 truncate"
                               x-text="'@' + rk.username"></a>
                            <span class="px-1.5 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 text-[10px] font-mono tabular-nums font-semibold"
                                  x-text="'Score ' + Math.round(rk.rookie_score || 0)"></span>
                          </div>
                          <p class="text-[11px] text-slate-500 dark:text-[#A1A1AA] font-mono tabular-nums mt-0.5"
                             x-text="'Followers: ' + formatCompact(rk.follower_count) + ' · Total audience: ' + formatReach(rk.monthly_reach) + (rk.profile_views ? (' · Impressions: ' + formatReach(rk.profile_views)) : '')"></p>
                        </div>
                        <button type="button"
                                @click="promoteRookieCreator(rk.username)"
                                :disabled="rk.stage === 'promoted'"
                                class="px-2.5 py-1 rounded-lg bg-slate-900 dark:bg-[#FAFAFA] text-white dark:text-[#09090B] disabled:opacity-50 text-[11px] font-semibold shrink-0 cursor-pointer"
                                x-text="rk.stage === 'promoted' ? 'Tracked' : 'Track Creator'"></button>
                      </div>
                    </template>
                  </div>
                </template>
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
            <h2 class="text-base font-bold text-slate-900 dark:text-[#FAFAFA]">No verified newborn pins in this view yet</h2>
            <p class="text-xs sm:text-sm text-slate-500 dark:text-[#A1A1AA] max-w-md mx-auto">
              Enter a keyword, board URL, or pin ID above and click <strong>Hunt Newborns</strong> — or open <strong>Browse Rising Trends</strong> to pick a fast-growing Pinterest topic.
            </p>
          </div>
        </template>

        <!-- Loading Skeleton -->
        <template x-if="isLoading && candidates.length === 0">
          <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <template x-for="n in [1,2,3]" :key="n">
              <div class="bg-white dark:bg-[#18181B] rounded-2xl border border-slate-200 dark:border-[#27272A] p-4 space-y-3 animate-pulse">
                <div class="h-44 rounded-xl bg-slate-100 dark:bg-[#27272A]"></div>
                <div class="h-4 w-3/4 rounded bg-slate-100 dark:bg-[#27272A]"></div>
                <div class="h-3 w-1/2 rounded bg-slate-100 dark:bg-[#27272A]"></div>
              </div>
            </template>
          </div>
        </template>

        <!-- Verified Newborn Pins Bento Grid -->
        <template x-if="candidates.length > 0">
          <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <template x-for="pin in candidates" :key="pin.pin_id">
              <article class="bg-white dark:bg-[#18181B] rounded-2xl border border-slate-200 dark:border-[#27272A] hover:border-slate-300 dark:hover:border-[#3F3F46] shadow-xs overflow-hidden flex flex-col transition-colors">
                <!-- Visual Header -->
                <div class="relative h-52 bg-slate-100 dark:bg-[#121215] overflow-hidden">
                  <template x-if="pin.image_url">
                    <img :src="pin.image_url"
                         :alt="pin.title || 'Newborn Pinterest pin'"
                         loading="lazy"
                         class="w-full h-full object-cover cursor-pointer"
                         @click="openDossier(pin.pin_id)" />
                  </template>
                  <template x-if="!pin.image_url">
                    <div class="w-full h-full flex items-center justify-center text-slate-400 text-xs">No image</div>
                  </template>

                  <!-- Top-left: Checkbox & Root Age Pill -->
                  <div class="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                    <label class="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-white/95 dark:bg-[#18181B]/95 border border-slate-200 dark:border-[#27272A] shadow-xs cursor-pointer">
                      <input type="checkbox"
                             :value="pin.pin_id"
                             :checked="selectedPinIds.includes(pin.pin_id)"
                             @change="togglePinSelection(pin.pin_id)"
                             aria-label="Select pin"
                             class="rounded text-rose-600 focus:ring-rose-500 cursor-pointer" />
                    </label>
                    <span class="px-2 py-0.5 rounded-lg bg-slate-900/85 text-white text-[11px] font-mono tabular-nums font-semibold shadow-xs"
                          :title="pin.created_at_pinterest ? ('Root created: ' + pin.created_at_pinterest) : 'Verified root age'"
                          x-text="formatRootAge(pin.age_days)"></span>
                  </div>

                  <!-- Top-right: Linkless Goldmine & Golden Score -->
                  <div class="absolute top-2.5 right-2.5 flex items-center gap-1.5">
                    <template x-if="pin.is_linkless">
                      <span class="px-2 py-0.5 rounded-lg bg-amber-500 text-white text-[10px] font-bold tracking-tight shadow-xs">
                        Linkless Goldmine
                      </span>
                    </template>
                    <span class="px-2 py-0.5 rounded-lg text-[11px] font-mono tabular-nums font-bold shadow-xs"
                          :class="pin.is_golden_pin ? 'bg-emerald-600 text-white' : 'bg-white/95 dark:bg-[#18181B]/95 text-slate-800 dark:text-[#FAFAFA]'"
                          x-text="Math.round(pin.golden_score || 0) + ' pts'"></span>
                  </div>
                </div>

                <!-- Card Body -->
                <div class="p-4 flex-1 flex flex-col justify-between space-y-3">
                  <div class="space-y-2.5">
                    <!-- Title + Link to /pin/:id -->
                    <div class="flex items-start justify-between gap-2">
                      <button type="button"
                              @click="openDossier(pin.pin_id)"
                              class="text-left text-sm font-semibold text-slate-900 dark:text-[#FAFAFA] hover:text-rose-600 dark:hover:text-rose-400 line-clamp-2 leading-snug cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 rounded"
                              x-text="pin.title || ('Pin #' + pin.pin_id)"></button>
                      <a :href="buildPinDetailsHref(pin.pin_id)"
                         title="Open full Pin Intelligence Dossier"
                         class="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">
                        <i data-lucide="external-link" class="w-3.5 h-3.5" aria-hidden="true"></i>
                      </a>
                    </div>

                    <!-- Real Engagement Metrics Row -->
                    <div class="grid grid-cols-2 gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-[#121215] border border-slate-100 dark:border-[#27272A]">
                      <div>
                        <div class="text-[10px] uppercase tracking-wider text-slate-500 dark:text-[#A1A1AA] font-medium">Saves</div>
                        <div class="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-[#FAFAFA]"
                             x-text="formatNullableCount(pin.save_count ?? pin.repin_count)"></div>
                      </div>
                      <div>
                        <div class="text-[10px] uppercase tracking-wider text-slate-500 dark:text-[#A1A1AA] font-medium">+Saves / day</div>
                        <div class="text-sm font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400"
                             x-text="formatVelocity(pin.save_per_day ?? pin.repin_per_day)"></div>
                      </div>
                    </div>

                    <!-- Origin Creator + Upload Source + External Board Link -->
                    <div class="space-y-1.5 text-xs text-slate-600 dark:text-[#A1A1AA]">
                      <div class="flex items-center justify-between gap-2">
                        <div class="flex items-center gap-1.5 min-w-0">
                          <i data-lucide="user" class="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true"></i>
                          <span class="font-medium text-slate-800 dark:text-[#E4E4E7] truncate"
                                x-text="pin.effective_creator_username ? ('@' + pin.effective_creator_username) : 'Unknown creator'"></span>
                          <template x-if="pin.is_rookie_outlier">
                            <span class="px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-[10px] font-semibold shrink-0">Rookie</span>
                          </template>
                        </div>
                        <span class="text-[11px] font-mono tabular-nums text-slate-500 shrink-0"
                              x-text="pin.creator_monthly_reach ? ('Total audience ' + formatReach(pin.creator_monthly_reach)) : (pin.effective_creator_followers != null ? (formatCompact(pin.effective_creator_followers) + ' followers') : '')"></span>
                      </div>

                      <div class="flex items-center justify-between gap-2">
                        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-[#27272A] text-slate-700 dark:text-[#E4E4E7] text-[11px] font-medium"
                              x-text="formatProvenanceLabel(pin.upload_provenance)"></span>

                        <template x-if="pin.board_name && formatBoardUrl(pin.board_url)">
                          <a :href="formatBoardUrl(pin.board_url)"
                             target="_blank"
                             rel="noopener noreferrer"
                             class="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 truncate max-w-[175px]"
                             :title="'Open board on Pinterest: ' + pin.board_name">
                            <i data-lucide="folder" class="w-3 h-3 shrink-0" aria-hidden="true"></i>
                            <span class="truncate" x-text="pin.board_name"></span>
                          </a>
                        </template>
                      </div>
                    </div>
                  </div>

                  <!-- Two Crisp Primary Actions -->
                  <div class="pt-2.5 border-t border-slate-100 dark:border-[#27272A] flex items-center gap-2">
                    <button type="button"
                            @click="snowballPins([pin.pin_id])"
                            class="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#121215] hover:bg-slate-100 dark:hover:bg-[#27272A] text-xs font-semibold text-slate-700 dark:text-[#FAFAFA] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">
                      <i data-lucide="git-branch" class="w-3.5 h-3.5 text-rose-500 shrink-0" aria-hidden="true"></i>
                      <span class="truncate">Find Related Newborns</span>
                    </button>

                    <button type="button"
                            @click="openPromoteModal([pin.pin_id])"
                            class="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-xs font-semibold text-white transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 shrink-0">
                      <i data-lucide="bookmark-plus" class="w-3.5 h-3.5 shrink-0" aria-hidden="true"></i>
                      <span x-text="pin.stage === 'promoted' ? 'Tracked' : 'Track / Promote'"></span>
                    </button>
                  </div>
                </div>
              </article>
            </template>
          </div>
        </template>
      </section>
    </template>

    <!-- ====================================================================== -->
    <!-- VIEW 2: WATCHLIST & 01:00 UTC DAILY ANCHORS                            -->
    <!-- ====================================================================== -->
    <template x-if="activeView === 'watchlist'">
      <section id="panel-newborn-watchlist" role="tabpanel" aria-labelledby="tab-newborn-watchlist" class="space-y-4">
        <div class="bg-white dark:bg-[#18181B] rounded-2xl border border-slate-200 dark:border-[#27272A] p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <button type="button"
                    @click="watchlistSubView = 'staged'"
                    class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                    :class="watchlistSubView === 'staged' ? 'bg-slate-900 dark:bg-[#FAFAFA] text-white dark:text-[#09090B]' : 'bg-slate-100 dark:bg-[#27272A] text-slate-600 dark:text-[#A1A1AA]'">
              Staged Watchlist (<span class="font-mono tabular-nums" x-text="watchlistCandidates.length"></span>)
            </button>
            <button type="button"
                    @click="watchlistSubView = 'anchors'"
                    class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                    :class="watchlistSubView === 'anchors' ? 'bg-slate-900 dark:bg-[#FAFAFA] text-white dark:text-[#09090B]' : 'bg-slate-100 dark:bg-[#27272A] text-slate-600 dark:text-[#A1A1AA]'">
              01:00 UTC Daily Anchors (<span class="font-mono tabular-nums" x-text="dailyAnchors.length"></span>)
            </button>
          </div>

          <button type="button"
                  @click="pollWatchlistNow()"
                  :disabled="isSubmittingWatchlistPoll"
                  class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white text-xs font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">
            <i data-lucide="refresh-cw" class="w-3.5 h-3.5" :class="isSubmittingWatchlistPoll ? 'animate-spin' : ''" aria-hidden="true"></i>
            <span x-text="isSubmittingWatchlistPoll ? 'Queueing Poll...' : 'Poll Watchlist Now'"></span>
          </button>
        </div>

        <!-- Staged Watchlist Pins -->
        <template x-if="watchlistSubView === 'staged'">
          <div class="bg-white dark:bg-[#18181B] rounded-2xl border border-slate-200 dark:border-[#27272A] shadow-xs overflow-x-auto">
            <template x-if="watchlistCandidates.length === 0">
              <div class="p-8 text-center text-xs text-slate-500 dark:text-[#A1A1AA]">
                No pins on your Watchlist yet. Click <strong>Track / Promote</strong> on any pin in <strong>This Hunt</strong> to monitor its multi-day breakout streak.
              </div>
            </template>
            <template x-if="watchlistCandidates.length > 0">
              <table class="w-full text-left border-collapse">
                <thead>
                  <tr class="border-b border-slate-200 dark:border-[#27272A] text-[11px] uppercase tracking-wider text-slate-500 dark:text-[#A1A1AA]">
                    <th class="py-3 px-4 font-semibold">Pin</th>
                    <th class="py-3 px-4 font-semibold">Age</th>
                    <th class="py-3 px-4 font-semibold">Saves / +Day</th>
                    <th class="py-3 px-4 font-semibold">Streak</th>
                    <th class="py-3 px-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 dark:divide-[#27272A] text-xs">
                  <template x-for="wp in watchlistCandidates" :key="wp.pin_id">
                    <tr class="hover:bg-slate-50/70 dark:hover:bg-[#27272A]/30">
                      <td class="py-3 px-4">
                        <div class="flex items-center gap-3 min-w-0">
                          <template x-if="wp.image_url">
                            <img :src="wp.image_url" :alt="wp.title || 'Watchlist pin'" class="w-10 h-12 rounded-lg object-cover shrink-0 bg-slate-100" />
                          </template>
                          <div class="min-w-0">
                            <button type="button" @click="openDossier(wp.pin_id)" class="font-semibold text-slate-900 dark:text-[#FAFAFA] hover:text-rose-600 truncate block max-w-xs text-left cursor-pointer" x-text="wp.title || ('Pin #' + wp.pin_id)"></button>
                            <span class="text-[11px] text-slate-500" x-text="wp.effective_creator_username ? ('@' + wp.effective_creator_username) : formatProvenanceLabel(wp.upload_provenance)"></span>
                          </div>
                        </div>
                      </td>
                      <td class="py-3 px-4 font-mono tabular-nums text-slate-700 dark:text-[#E4E4E7]" x-text="formatRootAge(wp.age_days)"></td>
                      <td class="py-3 px-4 font-mono tabular-nums">
                        <span class="font-semibold text-slate-900 dark:text-[#FAFAFA]" x-text="formatNullableCount(wp.save_count ?? wp.repin_count)"></span>
                        <span class="text-emerald-600 dark:text-emerald-400 ml-1" x-text="formatVelocity(wp.save_per_day ?? wp.repin_per_day)"></span>
                      </td>
                      <td class="py-3 px-4 font-mono tabular-nums">
                        <span class="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-semibold" x-text="(wp.consecutive_qualifying_days || 0) + 'd'"></span>
                      </td>
                      <td class="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                        <button type="button" @click="openPromoteModal([wp.pin_id])" class="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold cursor-pointer">Promote</button>
                        <button type="button" @click="stagePins([wp.pin_id], 'discarded')" class="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] text-slate-500 hover:text-rose-600 cursor-pointer">Remove</button>
                      </td>
                    </tr>
                  </template>
                </tbody>
              </table>
            </template>
          </div>
        </template>

        <!-- 01:00 UTC Daily Anchors -->
        <template x-if="watchlistSubView === 'anchors'">
          <div class="bg-white dark:bg-[#18181B] rounded-2xl border border-slate-200 dark:border-[#27272A] shadow-xs overflow-x-auto">
            <template x-if="dailyAnchors.length === 0">
              <div class="p-8 text-center text-xs text-slate-500 dark:text-[#A1A1AA]">
                No promoted 01:00 UTC Daily Anchors yet. Promote any winning pin to enroll it in daily velocity tracking.
              </div>
            </template>
            <template x-if="dailyAnchors.length > 0">
              <table class="w-full text-left border-collapse">
                <thead>
                  <tr class="border-b border-slate-200 dark:border-[#27272A] text-[11px] uppercase tracking-wider text-slate-500 dark:text-[#A1A1AA]">
                    <th class="py-3 px-4 font-semibold">Promoted Pin</th>
                    <th class="py-3 px-4 font-semibold">Saves</th>
                    <th class="py-3 px-4 font-semibold">24h Velocity</th>
                    <th class="py-3 px-4 font-semibold">Source</th>
                    <th class="py-3 px-4 font-semibold text-right">Dossier</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 dark:divide-[#27272A] text-xs">
                  <template x-for="an in dailyAnchors" :key="an.pin_id">
                    <tr class="hover:bg-slate-50/70 dark:hover:bg-[#27272A]/30">
                      <td class="py-3 px-4">
                        <div class="font-semibold text-slate-900 dark:text-[#FAFAFA] truncate max-w-xs" x-text="an.title || ('Pin #' + an.pin_id)"></div>
                        <div class="text-[11px] text-slate-500" x-text="an.seed_query || an.clean_domain || 'Direct promote'"></div>
                      </td>
                      <td class="py-3 px-4 font-mono tabular-nums font-semibold text-slate-900 dark:text-[#FAFAFA]" x-text="formatNullableCount(an.save_count)"></td>
                      <td class="py-3 px-4 font-mono tabular-nums text-emerald-600 dark:text-emerald-400 font-semibold" x-text="formatVelocity(an.daily_save_velocity)"></td>
                      <td class="py-3 px-4 text-slate-500" x-text="an.source || 'manual'"></td>
                      <td class="py-3 px-4 text-right">
                        <a :href="buildPinDetailsHref(an.pin_id)" class="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 font-semibold hover:underline">
                          <span>Open Pin</span>
                          <i data-lucide="arrow-up-right" class="w-3.5 h-3.5" aria-hidden="true"></i>
                        </a>
                      </td>
                    </tr>
                  </template>
                </tbody>
              </table>
            </template>
          </div>
        </template>
      </section>
    </template>

    <!-- ====================================================================== -->
    <!-- VIEW 3: PAST HUNTS (Click any run to load isolated results)            -->
    <!-- ====================================================================== -->
    <template x-if="activeView === 'history'">
      <section id="panel-newborn-history" role="tabpanel" aria-labelledby="tab-newborn-history" class="bg-white dark:bg-[#18181B] rounded-2xl border border-slate-200 dark:border-[#27272A] shadow-xs overflow-x-auto">
        <template x-if="runs.length === 0">
          <div class="p-8 text-center text-xs text-slate-500 dark:text-[#A1A1AA]">
            No past hunts recorded yet. Launch your first hunt above!
          </div>
        </template>
        <template x-if="runs.length > 0">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="border-b border-slate-200 dark:border-[#27272A] text-[11px] uppercase tracking-wider text-slate-500 dark:text-[#A1A1AA]">
                <th class="py-3 px-4 font-semibold">Hunt</th>
                <th class="py-3 px-4 font-semibold">Status</th>
                <th class="py-3 px-4 font-semibold">Scanned -> Verified</th>
                <th class="py-3 px-4 font-semibold">Golden</th>
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
                    <span class="px-2 py-0.5 rounded-full text-[11px] font-semibold"
                          :class="r.status === 'completed' ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300' : (r.status === 'running' ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300' : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300')"
                          x-text="r.status"></span>
                  </td>
                  <td class="py-3 px-4 font-mono tabular-nums text-slate-700 dark:text-[#E4E4E7]"
                      x-text="(r.candidates_discovered || 0) + ' -> ' + (r.candidates_qualified || 0)"></td>
                  <td class="py-3 px-4 font-mono tabular-nums font-semibold text-rose-600 dark:text-rose-400" x-text="r.golden_pins_count || 0"></td>
                  <td class="py-3 px-4 font-mono tabular-nums text-slate-500" x-text="formatShortTimestamp(r.started_at)"></td>
                  <td class="py-3 px-4 text-right">
                    <button type="button"
                            @click.stop="selectPastRun(r)"
                            class="px-3 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] hover:border-rose-300 text-xs font-semibold text-slate-700 dark:text-[#FAFAFA] cursor-pointer">
                      View Results
                    </button>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </template>
      </section>
    </template>
  `;
}
