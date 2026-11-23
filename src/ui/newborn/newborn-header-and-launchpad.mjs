/**
 * src/ui/newborn/newborn-header-and-launchpad.mjs
 *
 * Wave 6D Pure Deep-Scroll Golden Pin Hunter Header & Hunt Card:
 * - Clean Studio Header + One-Click Session Cookie Setup Banner (Zone-A vs 100% Zero-Cookie clarity)
 * - Hero Hunt Card with Automatic Official Idea Page Intelligence (URL + Search Volume + Growth %)
 * - Pure 3-Filter Qualification Bar: Max Pin Age (Days) + Min Re-pins + Min Saves (Optional, 0 = ignored)
 * - Per-Path Deep-Scroll Extraction Selector: Search (up to 5,000), Boards (up to 50 + Find More Ideas),
 *   Idea Page (up to 2,000), Home Feed (up to 2,000), and Related Pins scroll depth (up to 1,000)
 * - Collapsible Rising Trends Picker (lag-fixed latest_available_date)
 * - Live HTTP 202 Funnel Progress Strip (Scrolled Pins -> Matched Re-pins -> Verified Root Age Winners)
 */

export function getNewbornHeaderAndLaunchpadHtml({ folderId = '' } = {}) {
  const safeFolderId = String(folderId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  const isCampaignScoped = Boolean(safeFolderId);
  return `
    <!-- Clean Discover / Campaign Newborn Header -->
    <header class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div class="min-w-0">
        <div class="flex items-center gap-2.5 flex-wrap">
          <div class="w-9 h-9 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0">
            <i data-lucide="${isCampaignScoped ? 'flame' : 'sparkles'}" class="w-4 h-4" aria-hidden="true"></i>
          </div>
          <h1 class="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-[#FAFAFA]">${isCampaignScoped ? 'Campaign Newborn Hunter' : 'Discover'}</h1>
        </div>
        <p class="text-xs sm:text-sm text-slate-500 dark:text-[#A1A1AA] mt-1">
          ${isCampaignScoped
            ? 'Run deep-scroll Newborn Hunts strictly scoped to this campaign folder. Review folder-isolated Golden Pins, Annotations Crossover, and past hunts.'
            : 'Explore 50–100 Pinterest Trends, select Related Interests &amp; Keyword Clusters into your Cluster Basket, or launch deep-scroll Newborn Hunts.'}
        </p>
      </div>

      <div class="flex items-center gap-2 shrink-0">
        ${isCampaignScoped
          ? `<a href="/discover?folder_id=${safeFolderId}"
               class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/70 dark:bg-indigo-950/30 hover:bg-indigo-100/80 dark:hover:bg-indigo-950/50 text-xs font-semibold text-indigo-700 dark:text-indigo-300 shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
              <i data-lucide="sparkles" class="w-3.5 h-3.5" aria-hidden="true"></i>
              <span>Open in Discover</span>
              <i data-lucide="arrow-up-right" class="w-3.5 h-3.5" aria-hidden="true"></i>
            </a>`
          : ''}
        <a href="/settings"
           class="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] hover:bg-slate-50 dark:hover:bg-[#27272A] text-xs font-semibold text-slate-700 dark:text-[#FAFAFA] shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">
          <i data-lucide="sliders-horizontal" class="w-4 h-4 text-slate-500 dark:text-[#A1A1AA]" aria-hidden="true"></i>
          <span>Workspace Settings</span>
        </a>
      </div>
    </header>

    <!-- Centralized Settings Link Banner when Zone-A Cookie is missing -->
    <template x-if="!cookieStatus?.has_cookie">
      <div class="rounded-2xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/20 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div class="flex items-start gap-2.5 min-w-0">
          <i data-lucide="key-round" class="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden="true"></i>
          <div class="text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
            <strong class="font-semibold">Zone-A Session Cookie not configured.</strong>
            Deep scrolling (<span class="font-mono tabular-nums">1,000–5,000</span> pins in Search, Home Feed, Idea Page &amp; Related) requires an authenticated <code class="px-1 py-0.5 rounded bg-amber-100/80 dark:bg-amber-900/40 font-mono text-[11px]">_auth=1</code> cookie. Manage it centrally in Settings.
          </div>
        </div>
        <a href="/settings#cookie"
           class="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500">
          <i data-lucide="settings" class="w-3.5 h-3.5" aria-hidden="true"></i>
          <span>Configure in Settings</span>
        </a>
      </div>
    </template>

    <!-- Hero Deep-Scroll Hunt Card -->
    <section aria-label="Golden pin hunt controls" class="bg-white dark:bg-[#18181B] rounded-2xl border border-slate-200 dark:border-[#27272A] p-4 sm:p-5 shadow-xs space-y-4">
      <!-- Row 1: Seed Keyword Input + Hunt CTA -->
      <form @submit.prevent="runFocusedHunt()" class="flex flex-col lg:flex-row items-stretch lg:items-center gap-2.5">
        <div class="relative flex-1 min-w-0">
          <i data-lucide="search" class="w-4 h-4 text-slate-400 dark:text-[#71717A] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true"></i>
          <input type="text"
                 x-model="huntInput"
                 @input.debounce.450ms="lookupIdeaPage(huntInput)"
                 aria-label="Enter a keyword, board URL, or pin ID"
                 placeholder="Enter a keyword (e.g. Meal prep for the week), board URL, or pin ID..."
                 class="w-full pl-10 pr-9 py-2.5 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50/70 dark:bg-[#121215] text-sm text-slate-900 dark:text-[#FAFAFA] placeholder:text-slate-400 dark:placeholder:text-[#71717A] focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-rose-500 transition-colors" />
          <template x-if="huntInput && huntInput.trim().length > 0">
            <button type="button"
                    @click="huntInput = ''; ideaPageInfo = null"
                    aria-label="Clear search input"
                    class="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">
              <i data-lucide="x" class="w-3.5 h-3.5" aria-hidden="true"></i>
            </button>
          </template>
        </div>

        <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
          ${isCampaignScoped ? '' : `<button type="button"
                  @click="openClusterExplorerFromHero()"
                  class="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/70 dark:bg-indigo-950/30 hover:bg-indigo-100/80 dark:hover:bg-indigo-950/50 text-xs font-semibold text-indigo-700 dark:text-indigo-300 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
            <i data-lucide="compass" class="w-3.5 h-3.5" aria-hidden="true"></i>
            <span>Cluster Explorer</span>
          </button>

          <button type="button"
                  @click="toggleTrendsDrawer()"
                  :aria-expanded="showTrendsDrawer ? 'true' : 'false'"
                  aria-controls="newborn-rising-trends-panel"
                  class="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#121215] hover:bg-slate-100 dark:hover:bg-[#27272A] text-xs font-semibold text-slate-700 dark:text-[#FAFAFA] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">
            <i data-lucide="trending-up" class="w-3.5 h-3.5 text-rose-500" aria-hidden="true"></i>
            <span>Rising Trends</span>
            <i data-lucide="chevron-down" class="w-3.5 h-3.5 text-slate-400 transition-transform duration-150" :class="showTrendsDrawer ? 'rotate-180' : ''" aria-hidden="true"></i>
          </button>`}

          <button type="submit"
                  :disabled="isSubmittingHunt"
                  class="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white text-sm font-semibold shadow-xs transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#18181B]">
            <i data-lucide="radar" class="w-4 h-4" :class="isSubmittingHunt ? 'animate-spin' : ''" aria-hidden="true"></i>
            <span x-text="isSubmittingHunt ? 'Launching...' : 'Hunt Golden Pins'"></span>
          </button>
        </div>
      </form>

      <!-- Official Pinterest Idea Page Intelligence Strip (Right Under Search Bar) -->
      <template x-if="isLookingUpIdeaPage">
        <div class="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#121215] border border-slate-200/80 dark:border-[#27272A] text-xs text-slate-500 dark:text-[#A1A1AA]">
          <i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin text-rose-500" aria-hidden="true"></i>
          <span>Resolving official Pinterest Idea Page &amp; search volume...</span>
        </div>
      </template>

      <template x-if="!isLookingUpIdeaPage && activeIdeaPage && activeIdeaPage.found">
        <div class="rounded-xl border border-indigo-200/80 dark:border-indigo-900/60 bg-indigo-50/50 dark:bg-indigo-950/20 p-3 space-y-2">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div class="flex items-center gap-2 flex-wrap min-w-0">
              <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-600 text-white text-[10px] font-bold uppercase tracking-wider shrink-0">
                Idea Page
              </span>
              <a :href="activeIdeaPage.idea_url"
                 target="_blank"
                 rel="noopener noreferrer"
                 class="inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 dark:text-indigo-300 hover:underline truncate max-w-md">
                <span x-text="activeIdeaPage.idea_url"></span>
                <i data-lucide="external-link" class="w-3 h-3 shrink-0" aria-hidden="true"></i>
              </a>
            </div>

            <div class="flex items-center gap-2 flex-wrap font-mono tabular-nums text-xs shrink-0">
              <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-[#18181B] border border-indigo-200/80 dark:border-indigo-900/50 text-slate-900 dark:text-[#FAFAFA]">
                <span class="text-[10px] font-sans uppercase tracking-wider text-slate-500">Volume</span>
                <strong x-text="formatNullableCount(activeIdeaPage.internal_search_count)"></strong>
              </span>
              <template x-if="activeIdeaPage.weekly_change != null">
                <span class="px-2 py-1 rounded-lg text-[11px] font-semibold"
                      :class="Number(activeIdeaPage.weekly_change) >= 0 ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300' : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'"
                      x-text="'7d ' + (Number(activeIdeaPage.weekly_change) >= 0 ? '+' : '') + activeIdeaPage.weekly_change + '%'"></span>
              </template>
              <template x-if="activeIdeaPage.monthly_change != null">
                <span class="px-2 py-1 rounded-lg text-[11px] font-semibold"
                      :class="Number(activeIdeaPage.monthly_change) >= 0 ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300' : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'"
                      x-text="'30d ' + (Number(activeIdeaPage.monthly_change) >= 0 ? '+' : '') + activeIdeaPage.monthly_change + '%'"></span>
              </template>
              <template x-if="activeIdeaPage.yearly_change != null">
                <span class="px-2 py-1 rounded-lg text-[11px] font-semibold"
                      :class="Number(activeIdeaPage.yearly_change) >= 0 ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300' : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'"
                      x-text="'1y ' + (Number(activeIdeaPage.yearly_change) >= 0 ? '+' : '') + activeIdeaPage.yearly_change + '%'"></span>
              </template>
            </div>
          </div>

          <template x-if="Array.isArray(activeIdeaPage.related_interests) && activeIdeaPage.related_interests.length > 0">
            <div class="space-y-2 pt-2 border-t border-indigo-200/50 dark:border-indigo-900/40">
              <div class="flex items-center justify-between gap-2">
                <span class="text-[11px] font-semibold text-slate-600 dark:text-[#A1A1AA]">Related Interests (Check to add to Cluster Basket):</span>
                <button type="button"
                        @click="addKeywordsToBasket((activeIdeaPage.related_interests || []).map((r) => r.name))"
                        class="text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 hover:underline cursor-pointer">
                  + Add All to Basket
                </button>
              </div>
              <div class="flex items-center gap-2 flex-wrap">
                <template x-for="rel in activeIdeaPage.related_interests.slice(0, 16)" :key="rel.name">
                  <label class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] transition-colors cursor-pointer select-none"
                         :class="isInBasket(rel.name) ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-700 text-rose-700 dark:text-rose-200 font-semibold' : 'bg-white dark:bg-[#18181B] border-indigo-200/70 dark:border-[#27272A] hover:border-rose-400 text-slate-700 dark:text-[#E4E4E7]'">
                    <input type="checkbox"
                           :checked="isInBasket(rel.name)"
                           @change="toggleBasketKeyword(rel.name)"
                           :aria-label="'Select related interest ' + rel.name"
                           class="rounded border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer" />
                    <span x-text="rel.name"></span>
                    <button type="button"
                            @click.stop="huntInput = rel.name; lookupIdeaPage(rel.name)"
                            title="Inspect Idea Page"
                            aria-label="Inspect Idea Page"
                            class="ml-0.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-300 cursor-pointer">
                      <i data-lucide="arrow-up-right" class="w-3 h-3" aria-hidden="true"></i>
                    </button>
                  </label>
                </template>
              </div>
            </div>
          </template>
        </div>
      </template>

      <!-- Compact One-Line Active Hunt Settings Summary Bar (Collapsed by Default) -->
      <div id="discover-hunt-settings-bar" class="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl border border-slate-200/80 dark:border-[#27272A] bg-slate-50/70 dark:bg-[#121215] text-xs">
        <div class="flex items-center gap-2 flex-wrap min-w-0">
          <span class="px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold shrink-0"
                :class="hasHuntOverrides() ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300' : 'bg-slate-200/80 dark:bg-[#27272A] text-slate-600 dark:text-slate-300'"
                x-text="hasHuntOverrides() ? 'Custom Override' : 'Workspace Defaults'">Workspace Defaults</span>
          <span class="text-[11px] font-mono tabular-nums text-slate-600 dark:text-[#A1A1AA] truncate" x-text="activeHuntSummaryText()"></span>
          <button type="button"
                  x-show="hasHuntOverrides()"
                  @click="resetHuntOverrides()"
                  class="text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer">
            Reset
          </button>
        </div>
        <div class="flex items-center gap-3 shrink-0">
          <button type="button"
                  @click="huntOptionsExpanded = !huntOptionsExpanded"
                  :aria-expanded="huntOptionsExpanded ? 'true' : 'false'"
                  aria-controls="discover-hunt-override-panel"
                  class="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 dark:text-[#FAFAFA] hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer">
            <span>Customize Hunt</span>
            <i data-lucide="chevron-down" class="w-3.5 h-3.5 text-slate-400 transition-transform duration-150" :class="huntOptionsExpanded ? 'rotate-180' : ''" aria-hidden="true"></i>
          </button>
          <a href="/settings" class="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">
            <span>Edit Defaults</span>
            <i data-lucide="arrow-up-right" class="w-3 h-3" aria-hidden="true"></i>
          </a>
        </div>
      </div>

      <!-- Collapsible Per-Hunt Override Panel (Row 2 + Row 3) -->
      <div id="discover-hunt-override-panel" x-show="huntOptionsExpanded" x-cloak class="space-y-4 pt-1">
      <!-- Row 2: Pure 3-Filter Qualification Bar (No Clutter) -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
        <!-- Filter 1: Max Pin Age (Days) -->
        <div class="p-3 rounded-xl border border-slate-200/90 dark:border-[#27272A] bg-slate-50/70 dark:bg-[#121215] space-y-2">
          <div class="flex items-center justify-between gap-2">
            <label for="hunt-filter-max-age" class="text-xs font-semibold text-slate-800 dark:text-[#FAFAFA]">Max Pin Age (Days)</label>
            <span class="text-[10px] font-semibold uppercase tracking-wider text-rose-600 dark:text-rose-400">Required</span>
          </div>
          <div class="flex items-center gap-1.5 flex-wrap">
            <template x-for="d in [7, 14, 30, 60, 90]" :key="d">
              <button type="button"
                      @click="huntFilters.maxAgeDays = d"
                      class="px-2 py-1 rounded-lg text-[11px] font-mono tabular-nums font-semibold border transition-colors cursor-pointer"
                      :class="Number(huntFilters.maxAgeDays) === d ? 'bg-rose-600 border-rose-600 text-white' : 'bg-white dark:bg-[#18181B] border-slate-200 dark:border-[#27272A] text-slate-700 dark:text-[#E4E4E7] hover:border-rose-300'"
                      x-text="d + 'd'"></button>
            </template>
            <input id="hunt-filter-max-age"
                   type="number"
                   min="1"
                   max="365"
                   x-model.number="huntFilters.maxAgeDays"
                   aria-label="Custom Max Pin Age in days"
                   class="w-16 px-2 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] text-xs font-mono tabular-nums text-slate-900 dark:text-[#FAFAFA] focus:outline-none focus:ring-2 focus:ring-rose-500" />
          </div>
        </div>

        <!-- Filter 2: Min Re-pins (Required Primary Gate) -->
        <div class="p-3 rounded-xl border border-slate-200/90 dark:border-[#27272A] bg-slate-50/70 dark:bg-[#121215] space-y-2">
          <div class="flex items-center justify-between gap-2">
            <label for="hunt-filter-min-repins" class="text-xs font-semibold text-slate-800 dark:text-[#FAFAFA]">Min Re-pins</label>
            <span class="text-[10px] font-semibold uppercase tracking-wider text-rose-600 dark:text-rose-400">Primary Filter</span>
          </div>
          <div class="flex items-center gap-1.5 flex-wrap">
            <template x-for="rp in [20, 50, 100, 500, 1000]" :key="rp">
              <button type="button"
                      @click="huntFilters.minRepins = rp"
                      class="px-2 py-1 rounded-lg text-[11px] font-mono tabular-nums font-semibold border transition-colors cursor-pointer"
                      :class="Number(huntFilters.minRepins) === rp ? 'bg-rose-600 border-rose-600 text-white' : 'bg-white dark:bg-[#18181B] border-slate-200 dark:border-[#27272A] text-slate-700 dark:text-[#E4E4E7] hover:border-rose-300'"
                      x-text="rp >= 1000 ? '1k' : rp"></button>
            </template>
            <input id="hunt-filter-min-repins"
                   type="number"
                   min="0"
                   max="100000"
                   x-model.number="huntFilters.minRepins"
                   aria-label="Custom Min Re-pins"
                   class="w-16 px-2 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] text-xs font-mono tabular-nums text-slate-900 dark:text-[#FAFAFA] focus:outline-none focus:ring-2 focus:ring-rose-500" />
          </div>
        </div>

        <!-- Filter 3: Min Saves (Optional Conditional — 0 = ignored) -->
        <div class="p-3 rounded-xl border border-slate-200/90 dark:border-[#27272A] bg-slate-50/70 dark:bg-[#121215] space-y-2">
          <div class="flex items-center justify-between gap-2">
            <label for="hunt-filter-min-saves" class="text-xs font-semibold text-slate-800 dark:text-[#FAFAFA]">Min Saves (Optional)</label>
            <span class="text-[10px] font-medium text-slate-500 dark:text-[#A1A1AA]"
                  x-text="Number(huntFilters.minSaves || 0) === 0 ? 'Ignored (0)' : ('Enforced >= ' + huntFilters.minSaves)"></span>
          </div>
          <div class="flex items-center gap-2">
            <input id="hunt-filter-min-saves"
                   type="number"
                   min="0"
                   max="100000"
                   x-model.number="huntFilters.minSaves"
                   aria-label="Optional Min Saves (0 ignores Saves)"
                   class="w-24 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] text-xs font-mono tabular-nums text-slate-900 dark:text-[#FAFAFA] focus:outline-none focus:ring-2 focus:ring-rose-500" />
            <span class="text-[11px] text-slate-500 dark:text-[#A1A1AA]">Default 0 = completely ignore Saves</span>
          </div>
        </div>
      </div>

      <!-- Row 3: User-Controlled Extraction Paths & Flexible Numeric Deep-Scroll Targets -->
      <div class="pt-2 border-t border-slate-100 dark:border-[#27272A]/80 space-y-2.5">
        <div class="flex items-center justify-between gap-3 flex-wrap">
          <span class="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-[#A1A1AA]">Extraction Paths &amp; Deep-Scroll Targets</span>
          <div class="flex items-center gap-3 flex-wrap text-[11px] font-mono tabular-nums">
            <div class="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#121215] p-0.5 font-sans" role="group" aria-label="Execution mode">
              <button type="button"
                      @click="setExecutionMode('auto')"
                      class="px-2 py-0.5 rounded-md text-[11px] font-semibold transition-colors cursor-pointer"
                      :class="executionMode === 'auto' ? 'bg-slate-900 dark:bg-[#FAFAFA] text-white dark:text-[#09090B]' : 'text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white'">
                Auto
              </button>
              <button type="button"
                      @click="setExecutionMode('direct')"
                      class="px-2 py-0.5 rounded-md text-[11px] font-semibold transition-colors cursor-pointer"
                      :class="executionMode === 'direct' ? 'bg-slate-900 dark:bg-[#FAFAFA] text-white dark:text-[#09090B]' : 'text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white'">
                Direct
              </button>
              <button type="button"
                      @click="setExecutionMode('fleet')"
                      class="px-2 py-0.5 rounded-md text-[11px] font-semibold transition-colors cursor-pointer"
                      :class="executionMode === 'fleet' ? 'bg-indigo-600 text-white' : 'text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white'">
                Fleet (20 Runners)
              </button>
            </div>
            <template x-if="executionMode === 'fleet'">
              <label class="inline-flex items-center gap-1 text-slate-500 dark:text-[#A1A1AA]" title="Parallel GitHub Actions Fleet shards (1 to 20)">
                <span class="font-sans text-[11px]">Shards:</span>
                <input type="number"
                       min="1"
                       max="20"
                       step="1"
                       x-model.number="fleetShards"
                       aria-label="Fleet shard count"
                       class="w-12 px-1.5 py-0.5 rounded-md border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#121215] text-[11px] font-mono tabular-nums text-slate-800 dark:text-[#FAFAFA] focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </label>
            </template>
            <span :class="estimateScrollBudget() > 3000 ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-slate-500 dark:text-[#A1A1AA]'"
                  x-text="'Est. scroll budget: ' + formatNullableCount(estimateScrollBudget()) + ' pins' + (executionMode === 'auto' && estimateScrollBudget() > 3000 ? ' (Auto -> Fleet)' : '')"></span>
            <label class="inline-flex items-center gap-1.5 text-slate-500 dark:text-[#A1A1AA]" title="Max PinResource/get hydrations per hunt (5 to 5,000)">
              <span class="font-sans text-[11px]">Hydration cap:</span>
              <input type="number"
                     min="5"
                     max="5000"
                     step="50"
                     x-model.number="huntFilters.maxPinHydrations"
                     aria-label="Max Pin Hydrations per hunt"
                     class="w-16 px-1.5 py-0.5 rounded-md border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#121215] text-[11px] font-mono tabular-nums text-slate-800 dark:text-[#FAFAFA] focus:outline-none focus:ring-2 focus:ring-rose-500" />
            </label>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-2.5">
          <!-- Path 1: Search -->
          <div class="p-2.5 rounded-xl border transition-colors space-y-2"
               :class="huntPaths.search.enabled ? 'border-rose-200 dark:border-rose-900/60 bg-rose-50/30 dark:bg-rose-950/15' : 'border-slate-200 dark:border-[#27272A] bg-slate-50/50 dark:bg-[#121215] opacity-75'">
            <label class="flex items-center justify-between gap-2 cursor-pointer">
              <span class="text-xs font-semibold text-slate-900 dark:text-[#FAFAFA]">Search</span>
              <input type="checkbox" x-model="huntPaths.search.enabled" class="rounded text-rose-600 focus:ring-rose-500 cursor-pointer" />
            </label>
            <div class="flex items-center gap-1.5">
              <input type="number"
                     min="25"
                     max="10000"
                     step="25"
                     x-model.number="huntPaths.search.target_pins"
                     :disabled="!huntPaths.search.enabled"
                     aria-label="Search scroll pins target"
                     class="w-full px-2 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] text-[11px] font-mono tabular-nums text-slate-800 dark:text-[#FAFAFA] focus:outline-none focus:ring-2 focus:ring-rose-500" />
              <span class="text-[10px] text-slate-400 shrink-0">pins</span>
            </div>
            <div class="text-[10px] text-slate-400">Range: 25–10,000</div>
          </div>

          <!-- Path 2: Boards Fan-out (Find more ideas ONLY) -->
          <div class="p-2.5 rounded-xl border transition-colors space-y-2"
               :class="huntPaths.boards.enabled ? 'border-rose-200 dark:border-rose-900/60 bg-rose-50/30 dark:bg-rose-950/15' : 'border-slate-200 dark:border-[#27272A] bg-slate-50/50 dark:bg-[#121215] opacity-75'">
            <label class="flex items-center justify-between gap-2 cursor-pointer">
              <span class="text-xs font-semibold text-slate-900 dark:text-[#FAFAFA]">Boards</span>
              <input type="checkbox" x-model="huntPaths.boards.enabled" class="rounded text-rose-600 focus:ring-rose-500 cursor-pointer" />
            </label>
            <div class="grid grid-cols-2 gap-1.5">
              <label class="space-y-0.5">
                <span class="block text-[9px] uppercase tracking-wider text-slate-400">Boards (1-50)</span>
                <input type="number"
                       min="1"
                       max="50"
                       step="1"
                       x-model.number="huntPaths.boards.max_boards"
                       :disabled="!huntPaths.boards.enabled"
                       aria-label="Matching boards to scan"
                       class="w-full px-1.5 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] text-[11px] font-mono tabular-nums text-slate-800 dark:text-[#FAFAFA] focus:outline-none focus:ring-2 focus:ring-rose-500" />
              </label>
              <label class="space-y-0.5">
                <span class="block text-[9px] uppercase tracking-wider text-slate-400">Pins/bd</span>
                <input type="number"
                       min="25"
                       max="1000"
                       step="25"
                       x-model.number="huntPaths.boards.target_pins_per_board"
                       :disabled="!huntPaths.boards.enabled"
                       aria-label="Pins per board via Find more ideas"
                       class="w-full px-1.5 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] text-[11px] font-mono tabular-nums text-slate-800 dark:text-[#FAFAFA] focus:outline-none focus:ring-2 focus:ring-rose-500" />
              </label>
            </div>
            <div class="text-[10px] text-rose-600 dark:text-rose-400 font-medium"
                 x-text="'Find more ideas only · ' + Math.max(1, Math.ceil((Number(huntPaths.boards.target_pins_per_board) || 100) / 25)) + ' pg/bd'"></div>
          </div>

          <!-- Path 3: Idea Page -->
          <div class="p-2.5 rounded-xl border transition-colors space-y-2"
               :class="huntPaths.idea_page.enabled ? 'border-rose-200 dark:border-rose-900/60 bg-rose-50/30 dark:bg-rose-950/15' : 'border-slate-200 dark:border-[#27272A] bg-slate-50/50 dark:bg-[#121215] opacity-75'">
            <label class="flex items-center justify-between gap-2 cursor-pointer">
              <span class="text-xs font-semibold text-slate-900 dark:text-[#FAFAFA]">Idea Page</span>
              <input type="checkbox" x-model="huntPaths.idea_page.enabled" class="rounded text-rose-600 focus:ring-rose-500 cursor-pointer" />
            </label>
            <div class="flex items-center gap-1.5">
              <input type="number"
                     min="25"
                     max="5000"
                     step="25"
                     x-model.number="huntPaths.idea_page.target_pins"
                     :disabled="!huntPaths.idea_page.enabled"
                     aria-label="Idea Page scroll pins target"
                     class="w-full px-2 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] text-[11px] font-mono tabular-nums text-slate-800 dark:text-[#FAFAFA] focus:outline-none focus:ring-2 focus:ring-rose-500" />
              <span class="text-[10px] text-slate-400 shrink-0">pins</span>
            </div>
            <div class="text-[10px] text-slate-400">Range: 25–5,000</div>
          </div>

          <!-- Path 4: Home Feed -->
          <div class="p-2.5 rounded-xl border transition-colors space-y-2"
               :class="huntPaths.home_feed.enabled ? 'border-rose-200 dark:border-rose-900/60 bg-rose-50/30 dark:bg-rose-950/15' : 'border-slate-200 dark:border-[#27272A] bg-slate-50/50 dark:bg-[#121215] opacity-75'">
            <label class="flex items-center justify-between gap-2 cursor-pointer">
              <span class="text-xs font-semibold text-slate-900 dark:text-[#FAFAFA]">Home Feed</span>
              <input type="checkbox" x-model="huntPaths.home_feed.enabled" class="rounded text-rose-600 focus:ring-rose-500 cursor-pointer" />
            </label>
            <div class="flex items-center gap-1.5">
              <input type="number"
                     min="25"
                     max="5000"
                     step="25"
                     x-model.number="huntPaths.home_feed.target_pins"
                     :disabled="!huntPaths.home_feed.enabled"
                     aria-label="Home Feed scroll pins target"
                     class="w-full px-2 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] text-[11px] font-mono tabular-nums text-slate-800 dark:text-[#FAFAFA] focus:outline-none focus:ring-2 focus:ring-rose-500" />
              <span class="text-[10px] text-slate-400 shrink-0">pins</span>
            </div>
            <div class="text-[10px] text-slate-400">Range: 25–5,000</div>
          </div>

          <!-- Path 5: Related Pins Depth (for 1-click / bulk Scroll Related) -->
          <div class="p-2.5 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50/70 dark:bg-[#121215] space-y-2">
            <div class="flex items-center justify-between gap-2">
              <span class="text-xs font-semibold text-slate-900 dark:text-[#FAFAFA]">Related Pins</span>
              <span class="text-[10px] text-slate-400">On-click</span>
            </div>
            <div class="flex items-center gap-1.5">
              <input type="number"
                     min="25"
                     max="2000"
                     step="25"
                     x-model.number="huntPaths.related.target_pins"
                     aria-label="Related Pins scroll depth"
                     class="w-full px-2 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] text-[11px] font-mono tabular-nums text-slate-800 dark:text-[#FAFAFA] focus:outline-none focus:ring-2 focus:ring-rose-500" />
              <span class="text-[10px] text-slate-400 shrink-0">pins</span>
            </div>
            <div class="text-[10px] text-slate-400">Range: 25–2,000</div>
          </div>
        </div>
      </div>
      </div>

      ${isCampaignScoped ? '' : `<!-- Full Pinterest Trends Explorer (50–100 Trends + All 8 Filters + Cluster Basket Checkboxes) -->
      <template x-if="showTrendsDrawer">
        <div id="newborn-rising-trends-panel" class="pt-4 border-t border-slate-200 dark:border-[#27272A] space-y-4">
          <div class="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2">
            <select x-model="launchpadTrendType"
                    @change="loadLaunchpadFeed()"
                    aria-label="Trend type filter"
                    class="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#121215] text-xs font-medium text-slate-700 dark:text-[#FAFAFA]">
              <option value="growing">Growing</option>
              <option value="seasonal">Seasonal</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>

            <select x-model="launchpadInterest"
                    @change="loadLaunchpadFeed()"
                    aria-label="Interest category filter"
                    class="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#121215] text-xs font-medium text-slate-700 dark:text-[#FAFAFA]">
              <option value="all">All 22 Interests</option>
              <template x-for="cat in l1InterestsCatalog" :key="cat.slug">
                <option :value="cat.slug" x-text="cat.label"></option>
              </template>
            </select>

            <select x-model="launchpadMoments"
                    @change="loadLaunchpadFeed()"
                    aria-label="Moments filter"
                    class="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#121215] text-xs font-medium text-slate-700 dark:text-[#FAFAFA]">
              <option value="">All Moments</option>
              <option value="christmas">Christmas</option>
              <option value="halloween">Halloween</option>
              <option value="thanksgiving">Thanksgiving</option>
              <option value="valentines_day">Valentine's Day</option>
              <option value="easter">Easter</option>
              <option value="mothers_day">Mother's Day</option>
              <option value="back_to_school">Back to School</option>
              <option value="summer">Summer</option>
              <option value="fall">Fall</option>
              <option value="spring">Spring</option>
              <option value="winter">Winter</option>
              <option value="wedding">Wedding</option>
            </select>

            <select x-model="launchpadAge"
                    @change="loadLaunchpadFeed()"
                    aria-label="Age group filter"
                    class="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#121215] text-xs font-medium text-slate-700 dark:text-[#FAFAFA]">
              <option value="">All Ages</option>
              <option value="18-24">18–24</option>
              <option value="25-34">25–34</option>
              <option value="35-44">35–44</option>
              <option value="45-54">45–54</option>
              <option value="55+">55+</option>
            </select>

            <select x-model="launchpadGender"
                    @change="loadLaunchpadFeed()"
                    aria-label="Gender filter"
                    class="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#121215] text-xs font-medium text-slate-700 dark:text-[#FAFAFA]">
              <option value="">All Genders</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="unspecified">Unspecified</option>
            </select>

            <select x-model="launchpadCountry"
                    @change="loadLaunchpadFeed()"
                    aria-label="Country filter"
                    class="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#121215] text-xs font-medium text-slate-700 dark:text-[#FAFAFA]">
              <template x-for="c in supportedCountries" :key="c.code">
                <option :value="c.code" x-text="c.label"></option>
              </template>
            </select>

            <select x-model.number="launchpadLimit"
                    @change="loadLaunchpadFeed()"
                    aria-label="Trends count limit"
                    class="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#121215] text-xs font-mono font-medium text-slate-700 dark:text-[#FAFAFA]">
              <option value="50">50 Trends</option>
              <option value="75">75 Trends</option>
              <option value="100">100 Trends</option>
            </select>

            <button type="button"
                    @click="refreshLaunchpadLive()"
                    :disabled="isRefreshingLaunchpad"
                    class="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-[#FAFAFA] text-white dark:text-[#09090B] hover:opacity-90 disabled:opacity-60 text-xs font-semibold transition-opacity cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">
              <i data-lucide="refresh-cw" class="w-3.5 h-3.5" :class="isRefreshingLaunchpad ? 'animate-spin' : ''" aria-hidden="true"></i>
              <span x-text="isRefreshingLaunchpad ? 'Loading...' : 'Fetch Trends'"></span>
            </button>
          </div>

          <!-- Include / Exclude Keyword Filters -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input type="text"
                   x-model="launchpadIncludeTerms"
                   @keydown.enter.prevent="refreshLaunchpadLive()"
                   aria-label="Include keyword filter"
                   placeholder="Include keyword (e.g. recipe, pasta, easy)..."
                   class="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#121215] text-xs text-slate-800 dark:text-[#FAFAFA] focus:outline-none focus:ring-2 focus:ring-rose-500" />
            <input type="text"
                   x-model="launchpadExcludeTerms"
                   @keydown.enter.prevent="refreshLaunchpadLive()"
                   aria-label="Exclude keyword filter"
                   placeholder="Exclude keyword (e.g. vegan, tattoo, anime)..."
                   class="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#121215] text-xs text-slate-800 dark:text-[#FAFAFA] focus:outline-none focus:ring-2 focus:ring-rose-500" />
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div class="lg:col-span-2 space-y-2">
              <div class="flex items-center justify-between gap-2 flex-wrap">
                <h2 class="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-[#A1A1AA]">
                  Pinterest Trends <span class="font-mono tabular-nums" x-text="'(' + launchpadTrends.length + ')'"></span>
                </h2>
                <div class="flex items-center gap-3 text-[11px]">
                  <button type="button"
                          x-show="launchpadTrends.length > 0"
                          @click="addKeywordsToBasket(launchpadTrends.slice(0, 100).map((t) => t.term))"
                          class="font-semibold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer">
                    + Select All Visible
                  </button>
                  <span class="text-slate-400">Check terms to add to Cluster Basket</span>
                </div>
              </div>
              <template x-if="launchpadTrends.length === 0">
                <div class="p-4 rounded-xl border border-dashed border-slate-200 dark:border-[#27272A] text-xs text-slate-500 dark:text-[#A1A1AA] text-center">
                  No cached trends for this filter yet. Click <strong>Fetch Trends</strong> to pull 50–100 live Pinterest Trends.
                </div>
              </template>
              <template x-if="launchpadTrends.length > 0">
                <div class="flex flex-wrap gap-2 max-h-72 overflow-y-auto pr-1">
                  <template x-for="tr in launchpadTrends.slice(0, 100)" :key="tr.term">
                    <label class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-medium transition-colors cursor-pointer select-none"
                           :class="isInBasket(tr.term) ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-700 text-rose-700 dark:text-rose-200 font-semibold' : 'border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#121215] hover:border-rose-300 dark:hover:border-rose-700 text-slate-800 dark:text-[#FAFAFA]'">
                      <input type="checkbox"
                             :checked="isInBasket(tr.term)"
                             @change="toggleBasketKeyword(tr.term)"
                             :aria-label="'Add trend ' + tr.term + ' to Cluster Basket'"
                             class="rounded border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer" />
                      <span x-text="tr.term"></span>
                      <template x-if="tr.weekly_growth_pct != null">
                        <span class="text-[10px] font-mono tabular-nums font-semibold text-emerald-600 dark:text-emerald-400" x-text="'+' + Math.round(tr.weekly_growth_pct) + '%'"></span>
                      </template>
                      <button type="button"
                              @click.stop="huntInput = tr.term; lookupIdeaPage(tr.term)"
                              title="Inspect Idea Page"
                              aria-label="Inspect Idea Page"
                              class="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-300 cursor-pointer">
                        <i data-lucide="arrow-up-right" class="w-3 h-3" aria-hidden="true"></i>
                      </button>
                    </label>
                  </template>
                </div>
              </template>
            </div>

            <div class="space-y-2 border-t lg:border-t-0 lg:border-l border-slate-100 dark:border-[#27272A] pt-3 lg:pt-0 lg:pl-4">
              <h2 class="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-[#A1A1AA]">
                Popular &amp; Ideas for You
              </h2>
              <template x-if="launchpadPopularTerms.length === 0 && launchpadIdeasForYou.length === 0">
                <p class="text-xs text-slate-400">Fetch trends to load Popular &amp; Ideas for you terms.</p>
              </template>
              <template x-if="launchpadPopularTerms.length > 0 || launchpadIdeasForYou.length > 0">
                <div class="flex flex-wrap gap-1.5">
                  <template x-for="term in [...launchpadPopularTerms, ...launchpadIdeasForYou].slice(0, 24)" :key="term">
                    <label class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs transition-colors cursor-pointer select-none"
                           :class="isInBasket(term) ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-700 text-rose-700 dark:text-rose-200 font-semibold' : 'border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] hover:border-rose-300 text-slate-700 dark:text-[#E4E4E7]'">
                      <input type="checkbox"
                             :checked="isInBasket(term)"
                             @change="toggleBasketKeyword(term)"
                             class="rounded border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer" />
                      <span x-text="term"></span>
                    </label>
                  </template>
                </div>
              </template>
            </div>
          </div>
        </div>
      </template>`}
    </section>

    <!-- Instant HTTP 202 Live Funnel Progress Strip -->
    <template x-if="activeRun && (isRunActiveStatus(activeRun.status) || activeRun.status === 'failed' || activeRun.status === 'partial_rate_limited' || activeRun.status === 'partial' || activeRun.status === 'cancelled' || showRunCompleteBanner)">
      <section role="status"
               aria-live="polite"
               class="rounded-2xl border p-4 shadow-xs transition-colors"
               :class="activeRun.status === 'failed' ? 'bg-rose-50/80 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/60' : ((activeRun.status === 'partial_rate_limited' || activeRun.status === 'partial') ? 'bg-amber-50/80 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/60' : (activeRun.status === 'cancelled' ? 'bg-slate-50 dark:bg-[#18181B] border-slate-200 dark:border-[#27272A]' : (isRunActiveStatus(activeRun.status) ? 'bg-white dark:bg-[#18181B] border-rose-200 dark:border-rose-900/50' : 'bg-emerald-50/70 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/50')))">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div class="flex items-start gap-3 min-w-0">
            <div class="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                 :class="activeRun.status === 'failed' ? 'bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400' : ((activeRun.status === 'partial_rate_limited' || activeRun.status === 'partial') ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' : (activeRun.status === 'cancelled' ? 'bg-slate-200/80 dark:bg-[#27272A] text-slate-600 dark:text-[#A1A1AA]' : (isRunActiveStatus(activeRun.status) ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400' : 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400')))">
              <span x-show="activeRun.status === 'failed' || activeRun.status === 'partial_rate_limited' || activeRun.status === 'partial'" class="inline-flex items-center justify-center"><i data-lucide="alert-triangle" class="w-4 h-4" aria-hidden="true"></i></span>
              <span x-show="activeRun.status === 'cancelled'" class="inline-flex items-center justify-center"><i data-lucide="slash" class="w-4 h-4" aria-hidden="true"></i></span>
              <span x-show="isRunActiveStatus(activeRun.status)" class="inline-flex items-center justify-center"><i data-lucide="loader-2" class="w-4 h-4 animate-spin" aria-hidden="true"></i></span>
              <span x-show="!isRunActiveStatus(activeRun.status) && activeRun.status !== 'failed' && activeRun.status !== 'partial_rate_limited' && activeRun.status !== 'partial' && activeRun.status !== 'cancelled'" class="inline-flex items-center justify-center"><i data-lucide="check-circle-2" class="w-4 h-4" aria-hidden="true"></i></span>
            </div>
            <div class="min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-xs font-bold uppercase tracking-wider"
                      :class="activeRun.status === 'failed' ? 'text-rose-700 dark:text-rose-300' : ((activeRun.status === 'partial_rate_limited' || activeRun.status === 'partial') ? 'text-amber-700 dark:text-amber-300' : (activeRun.status === 'cancelled' ? 'text-slate-600 dark:text-[#A1A1AA]' : (isRunActiveStatus(activeRun.status) ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-300')))"
                      x-text="activeRun.status === 'queued' ? ('Queued Hunt #' + activeRun.id) : (activeRun.status === 'running' ? ('Live Hunt #' + activeRun.id) : (activeRun.status === 'failed' ? ('Hunt #' + activeRun.id + ' Failed') : (activeRun.status === 'partial_rate_limited' ? ('Hunt #' + activeRun.id + ' Salvaged (Rate Limit)') : (activeRun.status === 'partial' ? ('Hunt #' + activeRun.id + ' Partial') : (activeRun.status === 'cancelled' ? ('Hunt #' + activeRun.id + ' Cancelled') : ('Hunt #' + activeRun.id + ' Complete'))))))"></span>
                <template x-if="activeRun.execution_mode === 'fleet'">
                  <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-900/50 text-[10px] font-mono font-semibold text-indigo-700 dark:text-indigo-300"
                        x-text="'Fleet Shards: ' + Number(activeRun.shards_completed || 0) + '/' + Number(activeRun.shards_total || 1)"></span>
                </template>
                <template x-if="activeRun.execution_mode === 'fleet' && activeRun.github_run_url">
                  <a :href="activeRun.github_run_url"
                     target="_blank"
                     rel="noopener noreferrer"
                     class="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">
                    <span>GitHub Actions</span>
                    <i data-lucide="external-link" class="w-3 h-3" aria-hidden="true"></i>
                  </a>
                </template>
                <template x-if="formatRunSeedLabel(activeRun)">
                  <span class="text-xs font-semibold text-slate-800 dark:text-[#FAFAFA] truncate max-w-md" x-text="formatRunSeedLabel(activeRun)"></span>
                </template>
              </div>
              <p class="text-xs text-slate-600 dark:text-[#A1A1AA] mt-0.5"
                 x-text="activeRun.status === 'failed' ? (activeRun.error_message || activeRun.progress_detail || 'Hunt failed.') : (activeRun.progress_detail || getHumanProgressStep(activeRun.progress_stage || activeRun.status))"></p>
              <template x-if="pollReconnectingNotice">
                <p class="text-[11px] font-medium text-amber-600 dark:text-amber-400 mt-0.5" x-text="pollReconnectingNotice"></p>
              </template>
            </div>
          </div>

          <!-- Real-Time Funnel Counters & Controls -->
          <div class="flex items-center gap-2.5 shrink-0 flex-wrap">
            <div class="flex items-center gap-2 text-xs font-mono tabular-nums text-slate-600 dark:text-[#A1A1AA]">
              <span>Scrolled: <strong class="text-slate-900 dark:text-[#FAFAFA]" x-text="formatNullableCount(getRunFunnel(activeRun).scrolled)"></strong></span>
              <span class="text-slate-300 dark:text-slate-600">-&gt;</span>
              <span>Matched Re-pins: <strong class="text-indigo-600 dark:text-indigo-400" x-text="formatNullableCount(getRunFunnel(activeRun).matchedRepins)"></strong></span>
              <span class="text-slate-300 dark:text-slate-600">-&gt;</span>
              <span>Verified Winners: <strong class="text-emerald-600 dark:text-emerald-400" x-text="formatNullableCount(getRunFunnel(activeRun).verifiedWinners)"></strong></span>
            </div>
            <template x-if="isRunActiveStatus(activeRun.status)">
              <button type="button"
                      @click="cancelActiveRun()"
                      :disabled="cancellingRun"
                      class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-950/50 disabled:opacity-50 text-[11px] font-semibold text-rose-700 dark:text-rose-300 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">
                <i data-lucide="square" class="w-3 h-3" aria-hidden="true"></i>
                <span x-text="cancellingRun ? 'Cancelling...' : 'Cancel Hunt'"></span>
              </button>
            </template>
            <template x-if="!isRunActiveStatus(activeRun.status)">
              <button type="button"
                      @click="showRunCompleteBanner = false; if (activeRun.status === 'failed' || activeRun.status === 'partial_rate_limited' || activeRun.status === 'partial' || activeRun.status === 'cancelled') { activeRun = null; }"
                      aria-label="Dismiss hunt status banner"
                      class="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">
                <i data-lucide="x" class="w-4 h-4" aria-hidden="true"></i>
              </button>
            </template>
          </div>
        </div>

        <template x-if="isRunActiveStatus(activeRun.status)">
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
                <span>1. Deep-scrolling selected paths</span>
              </div>
              <div class="flex items-center gap-1.5"
                   :class="getProgressStepIndex(activeRun.progress_stage) >= 2 ? 'text-slate-900 dark:text-[#FAFAFA]' : 'text-slate-400'">
                <span class="w-1.5 h-1.5 rounded-full" :class="getProgressStepIndex(activeRun.progress_stage) >= 2 ? 'bg-rose-500' : 'bg-slate-300 dark:bg-slate-700'"></span>
                <span>2. 50x Pidgets Re-pin filter</span>
              </div>
              <div class="flex items-center gap-1.5"
                   :class="getProgressStepIndex(activeRun.progress_stage) >= 3 ? 'text-slate-900 dark:text-[#FAFAFA]' : 'text-slate-400'">
                <span class="w-1.5 h-1.5 rounded-full" :class="getProgressStepIndex(activeRun.progress_stage) >= 3 ? 'bg-rose-500' : 'bg-slate-300 dark:bg-slate-700'"></span>
                <span x-text="settingsDraft?.qualification?.resolve_root_pin ? '3. Verifying Root Age & Annotations' : '3. Verifying Pin Age & Annotations'"></span>
              </div>
            </div>
          </div>
        </template>
      </section>
    </template>
  `;
}
