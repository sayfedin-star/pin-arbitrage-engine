/**
 * src/ui/newborn/newborn-header-and-launchpad.mjs
 *
 * Clean Header + Focused Hero Hunt Bar + Collapsible Rising Trends Picker +
 * Instant HTTP 202 Live Progress Strip (`GET /api/newborn/runs/:id` every 1.5s).
 */

export function getNewbornHeaderAndLaunchpadHtml() {
  return `
    <!-- Clean Studio Header -->
    <header class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div class="min-w-0">
        <div class="flex items-center gap-2.5 flex-wrap">
          <div class="w-9 h-9 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0">
            <i data-lucide="sparkles" class="w-4 h-4" aria-hidden="true"></i>
          </div>
          <h1 class="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-[#FAFAFA]">Newborn Pin Hunter</h1>
          <button type="button"
                  @click="openSettingsDrawer('cookie')"
                  class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                  :class="cookieStatus?.has_cookie ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/50 text-emerald-700 dark:text-emerald-300' : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/50 text-amber-700 dark:text-amber-300'"
                  title="Manage Pinterest session cookie mode">
            <span class="w-1.5 h-1.5 rounded-full" :class="cookieStatus?.has_cookie ? 'bg-emerald-500' : 'bg-amber-500'"></span>
            <span x-text="cookieStatus?.has_cookie ? 'Full Auth Mode' : 'Guest Mode'"></span>
          </button>
        </div>
        <p class="text-xs sm:text-sm text-slate-500 dark:text-[#A1A1AA] mt-1">
          Discover verified brand-new viral pins with real root creation dates and daily save velocity.
        </p>
      </div>

      <div class="flex items-center gap-2 shrink-0">
        <button type="button"
                @click="openSettingsDrawer('filters')"
                class="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] hover:bg-slate-50 dark:hover:bg-[#27272A] text-xs font-semibold text-slate-700 dark:text-[#FAFAFA] shadow-xs transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">
          <i data-lucide="sliders-horizontal" class="w-4 h-4 text-slate-500 dark:text-[#A1A1AA]" aria-hidden="true"></i>
          <span>Settings &amp; Automation</span>
          <template x-if="settingsDraft?.automation?.auto_track_enabled">
            <span class="px-1.5 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">Auto</span>
          </template>
        </button>
      </div>
    </header>

    <!-- Focused Hero Hunt Bar -->
    <section aria-label="Newborn hunt search" class="bg-white dark:bg-[#18181B] rounded-2xl border border-slate-200 dark:border-[#27272A] p-4 sm:p-5 shadow-xs space-y-3.5">
      <form @submit.prevent="runFocusedHunt()" class="flex flex-col lg:flex-row items-stretch lg:items-center gap-2.5">
        <div class="relative flex-1 min-w-0">
          <i data-lucide="search" class="w-4 h-4 text-slate-400 dark:text-[#71717A] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true"></i>
          <input type="text"
                 x-model="huntInput"
                 aria-label="Enter a keyword, board URL, or pin ID"
                 placeholder="Enter a keyword, board URL, or pin ID..."
                 class="w-full pl-10 pr-9 py-2.5 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50/70 dark:bg-[#121215] text-sm text-slate-900 dark:text-[#FAFAFA] placeholder:text-slate-400 dark:placeholder:text-[#71717A] focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-rose-500 transition-colors" />
          <template x-if="huntInput && huntInput.trim().length > 0">
            <button type="button"
                    @click="huntInput = ''"
                    aria-label="Clear search input"
                    class="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">
              <i data-lucide="x" class="w-3.5 h-3.5" aria-hidden="true"></i>
            </button>
          </template>
        </div>

        <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
          <select x-model="selectedProfileId"
                  aria-label="Active rule profile"
                  class="px-3 py-2.5 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50/70 dark:bg-[#121215] text-xs font-medium text-slate-700 dark:text-[#FAFAFA] focus:outline-none focus:ring-2 focus:ring-rose-500 cursor-pointer min-w-[185px]">
            <option value="">Global Defaults (<span x-text="settingsDraft?.qualification?.age_window_preset || '30d'"></span>)</option>
            <template x-for="prof in profiles" :key="prof.id">
              <option :value="String(prof.id)" x-text="prof.name + (prof.is_default ? ' (Default)' : '')"></option>
            </template>
          </select>

          <button type="submit"
                  :disabled="isSubmittingHunt"
                  class="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white text-sm font-semibold shadow-xs transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#18181B]">
            <i data-lucide="radar" class="w-4 h-4" :class="isSubmittingHunt ? 'animate-spin' : ''" aria-hidden="true"></i>
            <span x-text="isSubmittingHunt ? 'Starting...' : 'Hunt Newborns'"></span>
          </button>
        </div>
      </form>

      <!-- Secondary Row: Active Filter Summary + Collapsible Rising Trends Trigger -->
      <div class="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100 dark:border-[#27272A]/80">
        <div class="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-[#A1A1AA]">
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-[#27272A] text-slate-700 dark:text-[#E4E4E7] font-mono tabular-nums text-[11px]">
            Max age: <strong x-text="(settingsDraft?.qualification?.max_age_days || 30) + 'd'"></strong>
          </span>
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-[#27272A] text-slate-700 dark:text-[#E4E4E7] font-mono tabular-nums text-[11px]">
            Min velocity: <strong x-text="'+' + (settingsDraft?.qualification?.min_save_per_day ?? 2) + '/day'"></strong>
          </span>
          <button type="button"
                  @click="openSettingsDrawer('filters')"
                  class="text-xs font-medium text-rose-600 dark:text-rose-400 hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 rounded">
            Tune rules
          </button>
        </div>

        <button type="button"
                @click="toggleTrendsDrawer()"
                :aria-expanded="showTrendsDrawer ? 'true' : 'false'"
                aria-controls="newborn-rising-trends-panel"
                class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#121215] hover:bg-slate-100 dark:hover:bg-[#27272A] text-xs font-semibold text-slate-700 dark:text-[#FAFAFA] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">
          <i data-lucide="trending-up" class="w-3.5 h-3.5 text-rose-500" aria-hidden="true"></i>
          <span>Browse Rising Trends</span>
          <i data-lucide="chevron-down" class="w-3.5 h-3.5 text-slate-400 transition-transform duration-150" :class="showTrendsDrawer ? 'rotate-180' : ''" aria-hidden="true"></i>
        </button>
      </div>

      <!-- Collapsible Rising Trends Picker (Growing Trends across 22 L1 categories + Popular / Ideas for You) -->
      <template x-if="showTrendsDrawer">
        <div id="newborn-rising-trends-panel" class="pt-3.5 border-t border-slate-200 dark:border-[#27272A] space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex flex-wrap items-center gap-2">
              <select x-model="launchpadCountry"
                      @change="loadLaunchpadFeed()"
                      aria-label="Trend country"
                      class="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#121215] text-xs font-medium text-slate-700 dark:text-[#FAFAFA]">
                <template x-for="c in supportedCountries" :key="c.code">
                  <option :value="c.code" x-text="c.label"></option>
                </template>
              </select>

              <select x-model="launchpadTrendType"
                      @change="loadLaunchpadFeed()"
                      aria-label="Trend window"
                      class="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#121215] text-xs font-medium text-slate-700 dark:text-[#FAFAFA]">
                <option value="growing">Growing Trends</option>
                <option value="seasonal">Seasonal</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>

              <select x-model="launchpadInterest"
                      @change="loadLaunchpadFeed()"
                      aria-label="Category filter"
                      class="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#121215] text-xs font-medium text-slate-700 dark:text-[#FAFAFA]">
                <option value="all">All 22 Categories</option>
                <template x-for="cat in l1InterestsCatalog" :key="cat.slug">
                  <option :value="cat.slug" x-text="cat.label"></option>
                </template>
              </select>
            </div>

            <button type="button"
                    @click="refreshLaunchpadLive()"
                    :disabled="isRefreshingLaunchpad"
                    class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-[#FAFAFA] text-white dark:text-[#09090B] hover:opacity-90 disabled:opacity-60 text-xs font-semibold transition-opacity cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">
              <i data-lucide="refresh-cw" class="w-3.5 h-3.5" :class="isRefreshingLaunchpad ? 'animate-spin' : ''" aria-hidden="true"></i>
              <span x-text="isRefreshingLaunchpad ? 'Fetching Trends...' : 'Refresh Live Trends'"></span>
            </button>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <!-- Rising Trends List -->
            <div class="lg:col-span-2 space-y-2">
              <div class="flex items-center justify-between">
                <h2 class="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-[#A1A1AA]">
                  Rising Pinterest Trends <span class="font-mono tabular-nums" x-text="'(' + launchpadTrends.length + ')'"></span>
                </h2>
                <span class="text-[11px] text-slate-400">Click any trend to launch an isolated hunt</span>
              </div>
              <template x-if="launchpadTrends.length === 0">
                <div class="p-4 rounded-xl border border-dashed border-slate-200 dark:border-[#27272A] text-xs text-slate-500 dark:text-[#A1A1AA] text-center">
                  No cached trends for this filter yet. Click <strong>Refresh Live Trends</strong> to pull fresh rising topics.
                </div>
              </template>
              <template x-if="launchpadTrends.length > 0">
                <div class="flex flex-wrap gap-2">
                  <template x-for="tr in launchpadTrends.slice(0, 24)" :key="tr.term">
                    <button type="button"
                            @click="selectTrendAndHunt(tr.term)"
                            class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#121215] hover:border-rose-300 dark:hover:border-rose-700 hover:bg-rose-50/60 dark:hover:bg-rose-950/30 text-xs font-medium text-slate-800 dark:text-[#FAFAFA] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">
                      <span x-text="tr.term"></span>
                      <template x-if="tr.weekly_growth_pct != null">
                        <span class="text-[10px] font-mono tabular-nums font-semibold text-emerald-600 dark:text-emerald-400" x-text="'+' + Math.round(tr.weekly_growth_pct) + '%'"></span>
                      </template>
                    </button>
                  </template>
                </div>
              </template>
            </div>

            <!-- Popular & Ideas For You -->
            <div class="space-y-2 border-t lg:border-t-0 lg:border-l border-slate-100 dark:border-[#27272A] pt-3 lg:pt-0 lg:pl-4">
              <h2 class="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-[#A1A1AA]">
                Popular &amp; Ideas for You
              </h2>
              <template x-if="launchpadPopularTerms.length === 0 && launchpadIdeasForYou.length === 0">
                <p class="text-xs text-slate-400">Refresh trends to load Popular &amp; Ideas for you terms.</p>
              </template>
              <template x-if="launchpadPopularTerms.length > 0 || launchpadIdeasForYou.length > 0">
                <div class="flex flex-wrap gap-1.5">
                  <template x-for="term in [...launchpadPopularTerms, ...launchpadIdeasForYou].slice(0, 16)" :key="term">
                    <button type="button"
                            @click="selectTrendAndHunt(term)"
                            class="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] hover:border-rose-300 dark:hover:border-rose-700 text-xs text-slate-700 dark:text-[#E4E4E7] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                            x-text="term"></button>
                  </template>
                </div>
              </template>
            </div>
          </div>
        </div>
      </template>
    </section>

    <!-- Instant HTTP 202 Live Progress Strip -->
    <template x-if="activeRun && (activeRun.status === 'running' || activeRun.status === 'failed' || showRunCompleteBanner)">
      <section role="status"
               aria-live="polite"
               class="rounded-2xl border p-4 shadow-xs transition-colors"
               :class="activeRun.status === 'failed' ? 'bg-rose-50/80 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/60' : (activeRun.status === 'running' ? 'bg-white dark:bg-[#18181B] border-rose-200 dark:border-rose-900/50' : 'bg-emerald-50/70 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/50')">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div class="flex items-start gap-3 min-w-0">
            <div class="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                 :class="activeRun.status === 'failed' ? 'bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400' : (activeRun.status === 'running' ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400' : 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400')">
              <i :data-lucide="activeRun.status === 'failed' ? 'alert-triangle' : (activeRun.status === 'running' ? 'loader-2' : 'check-circle-2')"
                 class="w-4 h-4"
                 :class="activeRun.status === 'running' ? 'animate-spin' : ''"
                 aria-hidden="true"></i>
            </div>
            <div class="min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-xs font-bold uppercase tracking-wider"
                      :class="activeRun.status === 'failed' ? 'text-rose-700 dark:text-rose-300' : (activeRun.status === 'running' ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-300')"
                      x-text="activeRun.status === 'running' ? ('Live Hunt #' + activeRun.id) : (activeRun.status === 'failed' ? ('Hunt #' + activeRun.id + ' Failed') : ('Hunt #' + activeRun.id + ' Complete'))"></span>
                <template x-if="formatRunSeedLabel(activeRun)">
                  <span class="text-xs font-semibold text-slate-800 dark:text-[#FAFAFA] truncate max-w-md" x-text="formatRunSeedLabel(activeRun)"></span>
                </template>
              </div>
              <p class="text-xs text-slate-600 dark:text-[#A1A1AA] mt-0.5"
                 x-text="activeRun.status === 'failed' ? (activeRun.error_message || activeRun.progress_detail || 'Hunt failed.') : (activeRun.progress_detail || getHumanProgressStep(activeRun.progress_stage))"></p>
            </div>
          </div>

          <div class="flex items-center gap-3 shrink-0">
            <div class="flex items-center gap-3 text-xs font-mono tabular-nums text-slate-600 dark:text-[#A1A1AA]">
              <span>Scanned: <strong class="text-slate-900 dark:text-[#FAFAFA]" x-text="activeRun.candidates_discovered || 0"></strong></span>
              <span>Verified: <strong class="text-emerald-600 dark:text-emerald-400" x-text="activeRun.candidates_qualified || 0"></strong></span>
              <span>Golden: <strong class="text-rose-600 dark:text-rose-400" x-text="activeRun.golden_pins_count || 0"></strong></span>
            </div>
            <template x-if="activeRun.status !== 'running'">
              <button type="button"
                      @click="showRunCompleteBanner = false"
                      aria-label="Dismiss hunt status banner"
                      class="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">
                <i data-lucide="x" class="w-4 h-4" aria-hidden="true"></i>
              </button>
            </template>
          </div>
        </div>

        <template x-if="activeRun.status === 'running'">
          <div class="mt-3 space-y-2">
            <div role="progressbar"
                 aria-label="Hunt progress"
                 aria-valuemin="0"
                 aria-valuemax="100"
                 :aria-valuenow="activeRun.progress_pct || 0"
                 class="w-full h-2 rounded-full bg-slate-100 dark:bg-[#27272A] overflow-hidden">
              <div class="h-full bg-rose-600 rounded-full transition-all duration-300 motion-reduce:transition-none"
                   :style="'width: ' + Math.max(8, Math.min(100, Number(activeRun.progress_pct || 0))) + '%'"></div>
            </div>
            <div class="grid grid-cols-3 gap-2 text-[11px] font-medium">
              <div class="flex items-center gap-1.5"
                   :class="getProgressStepIndex(activeRun.progress_stage) >= 1 ? 'text-slate-900 dark:text-[#FAFAFA]' : 'text-slate-400'">
                <span class="w-1.5 h-1.5 rounded-full" :class="getProgressStepIndex(activeRun.progress_stage) >= 1 ? 'bg-rose-500' : 'bg-slate-300 dark:bg-slate-700'"></span>
                <span>1. Harvesting search &amp; fresh boards</span>
              </div>
              <div class="flex items-center gap-1.5"
                   :class="getProgressStepIndex(activeRun.progress_stage) >= 2 ? 'text-slate-900 dark:text-[#FAFAFA]' : 'text-slate-400'">
                <span class="w-1.5 h-1.5 rounded-full" :class="getProgressStepIndex(activeRun.progress_stage) >= 2 ? 'bg-rose-500' : 'bg-slate-300 dark:bg-slate-700'"></span>
                <span>2. Verifying root creation dates</span>
              </div>
              <div class="flex items-center gap-1.5"
                   :class="getProgressStepIndex(activeRun.progress_stage) >= 3 ? 'text-slate-900 dark:text-[#FAFAFA]' : 'text-slate-400'">
                <span class="w-1.5 h-1.5 rounded-full" :class="getProgressStepIndex(activeRun.progress_stage) >= 3 ? 'bg-rose-500' : 'bg-slate-300 dark:bg-slate-700'"></span>
                <span>3. Ranking verified winners</span>
              </div>
            </div>
          </div>
        </template>
      </section>
    </template>
  `;
}
