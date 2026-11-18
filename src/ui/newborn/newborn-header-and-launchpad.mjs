/**
 * src/ui/newborn/newborn-header-and-launchpad.mjs
 *
 * Renders:
 * 1. Studio Executive Header & 5-Cell Integrated Telemetry Ribbon
 * 2. Multi-Surface Hunt Bar (Smart Trend/Keyword/Board/Pin/Idea Input + Active Rule Profile + Live Run Strip)
 * 3. Segmented 6-Room Navigation Track (Candidates, Launchpad, Rookies, Crossover, Watchlist & Anchors, Control Center)
 * 4. Room: Trends & Zero-Query Launchpad (`Growing` / `Seasonal` / `Monthly` / `Yearly` + `22` L1 Interests + `Predicted Peaks` + `Zero-Query`)
 */

export function getNewbornHeaderAndLaunchpadHtml() {
  return `
    <!-- Studio Executive Identity Banner (Global Mode) -->
    <template x-if="!scopedFolderId">
      <section class="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#121215] border border-[#E2E8F0] dark:border-[#27272A] shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div class="flex items-center gap-3.5">
          <div class="w-10 h-10 rounded-xl bg-rose-500/10 text-[#E11D48] dark:text-rose-400 border border-rose-500/20 flex items-center justify-center shrink-0">
            <i data-lucide="flame" class="w-5 h-5"></i>
          </div>
          <div>
            <div class="flex items-center gap-2 flex-wrap">
              <h1 class="text-lg sm:text-xl font-extrabold tracking-tight text-[#0F172A] dark:text-[#FAFAFA]">Newborn Breakout Hunter</h1>
              <span class="px-2 py-0.5 rounded-md text-[10px] font-mono tabular-nums font-semibold bg-rose-500/10 text-[#E11D48] dark:text-rose-400 border border-rose-500/20">8-Surface Engine</span>
              <span class="px-2 py-0.5 rounded-md text-[10px] font-mono tabular-nums font-semibold border"
                    :class="cookieStatus.has_cookie ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30' : 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30'"
                    x-text="cookieStatus.has_cookie ? 'Zone-A Auth + Zero-Cookie' : 'Guest Zero-Cookie Mode'"></span>
            </div>
            <p class="text-xs text-[#64748B] dark:text-[#A1A1AA] mt-0.5">Isolated staging radar for sub-30d breakout pins, linkless arbitrage vacuums, and high-leverage rookie creators.</p>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <button type="button"
                  @click="runAutoCycleNow()"
                  :disabled="isAutoRunning"
                  class="px-3 py-1.5 rounded-xl text-xs font-semibold border border-[#E2E8F0] dark:border-[#27272A] bg-[#F1F5F9] hover:bg-[#E2E8F0] dark:bg-[#18181B] dark:hover:bg-[#27272A] text-[#0F172A] dark:text-[#FAFAFA] transition inline-flex items-center gap-1.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:opacity-50">
            <i data-lucide="play" class="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" :class="isAutoRunning ? 'motion-safe:animate-pulse' : ''"></i>
            <span x-text="isAutoRunning ? 'Running Cycle...' : 'Run Auto-Cycle Now'">Run Auto-Cycle Now</span>
          </button>
          <button type="button"
                  @click="setRoom('settings')"
                  class="px-3 py-1.5 rounded-xl text-xs font-semibold border transition inline-flex items-center gap-1.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                  :class="currentRoom === 'settings' ? 'bg-[#E11D48] text-white border-[#E11D48]' : 'bg-white dark:bg-[#18181B] border-[#E2E8F0] dark:border-[#27272A] text-[#0F172A] dark:text-[#FAFAFA] hover:bg-[#F1F5F9] dark:hover:bg-[#27272A]'">
            <i data-lucide="sliders" class="w-3.5 h-3.5"></i>
            <span>Settings &amp; Profiles</span>
          </button>
        </div>
      </section>
    </template>

    <!-- 5-Cell Integrated Telemetry Ribbon (DESIGN.md Section 4B) -->
    <section aria-label="Newborn Studio Key Metrics" class="bg-white dark:bg-[#121215] border border-[#E2E8F0] dark:border-[#27272A] rounded-2xl shadow-xs grid grid-cols-2 lg:grid-cols-5 divide-y lg:divide-y-0 lg:divide-x divide-[#F1F5F9] dark:divide-[#27272A]">
      <!-- Cell 1: Golden Newborn Pins -->
      <div class="p-4 flex flex-col justify-between gap-1.5">
        <div class="flex items-center justify-between">
          <span class="text-[11px] font-bold uppercase tracking-wider text-[#64748B] dark:text-[#A1A1AA]">Golden Breakouts</span>
          <span class="px-1.5 py-0.5 rounded text-[10px] font-mono tabular-nums font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30"
                x-text="'Avg ' + formatDecimal(overviewCounts.avg_golden_score, 1)">Avg 0.0</span>
        </div>
        <div class="flex items-baseline justify-between gap-2">
          <span class="text-2xl font-bold font-mono tabular-nums text-[#0F172A] dark:text-[#FAFAFA]" x-text="formatNum(overviewCounts.golden_pins_count)">0</span>
          <span class="text-[11px] font-mono tabular-nums text-[#64748B] dark:text-[#A1A1AA]" x-text="formatNum(overviewCounts.total_candidates) + ' staged'">0 staged</span>
        </div>
      </div>

      <!-- Cell 2: Linkless Arbitrage Vacuums -->
      <div class="p-4 flex flex-col justify-between gap-1.5">
        <div class="flex items-center justify-between">
          <span class="text-[11px] font-bold uppercase tracking-wider text-[#64748B] dark:text-[#A1A1AA]">Linkless Goldmines</span>
          <span class="px-1.5 py-0.5 rounded text-[10px] font-mono tabular-nums font-semibold bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30"
                x-text="settingsDraft.qualification.linkless_vacuum.mode.toUpperCase()">BOOST</span>
        </div>
        <div class="flex items-baseline justify-between gap-2">
          <span class="text-2xl font-bold font-mono tabular-nums text-[#0F172A] dark:text-[#FAFAFA]" x-text="formatNum(overviewCounts.linkless_vacuum_count)">0</span>
          <span class="text-[11px] font-mono tabular-nums text-[#64748B] dark:text-[#A1A1AA]">Zero domain rival</span>
        </div>
      </div>

      <!-- Cell 3: Rookie Accounts & Outliers -->
      <div class="p-4 flex flex-col justify-between gap-1.5">
        <div class="flex items-center justify-between">
          <span class="text-[11px] font-bold uppercase tracking-wider text-[#64748B] dark:text-[#A1A1AA]">Rookie Outliers</span>
          <span class="px-1.5 py-0.5 rounded text-[10px] font-mono tabular-nums font-semibold bg-sky-50 text-sky-800 border border-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30"
                x-text="formatNum(overviewCounts.rookie_outliers_count) + ' pins'">0 pins</span>
        </div>
        <div class="flex items-baseline justify-between gap-2">
          <span class="text-2xl font-bold font-mono tabular-nums text-[#0F172A] dark:text-[#FAFAFA]" x-text="formatNum(overviewCounts.rookie_accounts_count)">0</span>
          <span class="text-[11px] font-mono tabular-nums text-[#64748B] dark:text-[#A1A1AA]" x-text="formatNum(overviewCounts.rookie_promoted_count) + ' tracked'">0 tracked</span>
        </div>
      </div>

      <!-- Cell 4: Watchlist & 01:00 UTC Daily Anchors -->
      <div class="p-4 flex flex-col justify-between gap-1.5">
        <div class="flex items-center justify-between">
          <span class="text-[11px] font-bold uppercase tracking-wider text-[#64748B] dark:text-[#A1A1AA]">Watchlist &amp; Anchors</span>
          <span class="px-1.5 py-0.5 rounded text-[10px] font-mono tabular-nums font-semibold bg-[#F1F5F9] dark:bg-[#18181B] text-[#0F172A] dark:text-[#FAFAFA] border border-[#E2E8F0] dark:border-[#27272A]"
                x-text="formatNum(overviewCounts.promoted_count) + ' SSOT'">0 SSOT</span>
        </div>
        <div class="flex items-baseline justify-between gap-2">
          <span class="text-2xl font-bold font-mono tabular-nums text-[#0F172A] dark:text-[#FAFAFA]" x-text="formatNum(overviewCounts.watchlist_count)">0</span>
          <span class="text-[11px] font-mono tabular-nums text-emerald-700 dark:text-emerald-400" x-text="formatNum(overviewCounts.active_daily_anchors_count) + ' 01:00 UTC anchors'">0 01:00 UTC anchors</span>
        </div>
      </div>

      <!-- Cell 5: Autonomous Schedule & Rule Profiles -->
      <div class="p-4 flex flex-col justify-between gap-1.5 col-span-2 lg:col-span-1">
        <div class="flex items-center justify-between">
          <span class="text-[11px] font-bold uppercase tracking-wider text-[#64748B] dark:text-[#A1A1AA]">Auto-Hunter</span>
          <span class="px-1.5 py-0.5 rounded text-[10px] font-mono tabular-nums font-semibold border"
                :class="automationSchedule.auto_track_enabled ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30' : 'bg-[#F1F5F9] text-[#64748B] border-[#E2E8F0] dark:bg-[#18181B] dark:text-[#A1A1AA] dark:border-[#27272A]'"
                x-text="automationSchedule.auto_track_enabled ? 'ACTIVE' : 'MANUAL'">MANUAL</span>
        </div>
        <div class="flex items-baseline justify-between gap-2">
          <span class="text-sm font-bold font-mono tabular-nums text-[#0F172A] dark:text-[#FAFAFA] truncate" x-text="automationSchedule.cadence || 'every_6h'">every_6h</span>
          <span class="text-[11px] font-mono tabular-nums text-[#64748B] dark:text-[#A1A1AA]" x-text="profiles.length + ' profiles'">3 profiles</span>
        </div>
      </div>
    </section>

    <!-- Multi-Surface Hunt Bar + Live Run Telemetry -->
    <section aria-label="Multi-Surface Hunt Bar" class="p-4 rounded-2xl bg-white dark:bg-[#121215] border border-[#E2E8F0] dark:border-[#27272A] shadow-xs space-y-3">
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
        <!-- Smart Seed Input (5 cols) -->
        <div class="lg:col-span-5">
          <label for="nb-smart-hunt-input" class="block text-[11px] font-bold uppercase tracking-wider text-[#64748B] dark:text-[#A1A1AA] mb-1">
            Multi-Surface Seed Input (Trend, Keyword, Board URL, Pin ID, or /ideas/ Slug)
          </label>
          <div class="relative flex items-center">
            <i data-lucide="compass" class="w-4 h-4 text-[#94A3B8] absolute left-3 pointer-events-none"></i>
            <input id="nb-smart-hunt-input"
                   type="text"
                   x-model="huntQueryInput"
                   @keydown.enter.prevent="launchDiscoveryHunt()"
                   placeholder="e.g. cottagecore patio, user/board-slug, 1098245059167667976, or leave blank for Zero-Query"
                   class="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-[#F1F5F9] dark:bg-[#18181B] border border-[#E2E8F0] dark:border-[#27272A] text-[#0F172A] dark:text-[#FAFAFA] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-rose-500" />
          </div>
        </div>

        <!-- Active Rule Profile Selector (3 cols) -->
        <div class="lg:col-span-3">
          <label for="nb-active-profile-select" class="block text-[11px] font-bold uppercase tracking-wider text-[#64748B] dark:text-[#A1A1AA] mb-1">
            Active Rule Profile
          </label>
          <select id="nb-active-profile-select"
                  x-model="selectedProfileSlug"
                  @change="onSelectActiveProfile()"
                  class="w-full px-3 py-2 text-xs font-medium rounded-xl bg-[#F1F5F9] dark:bg-[#18181B] border border-[#E2E8F0] dark:border-[#27272A] text-[#0F172A] dark:text-[#FAFAFA] focus:outline-none focus:ring-2 focus:ring-rose-500 cursor-pointer">
            <option value="">Global Settings Baseline</option>
            <template x-for="prof in profiles" :key="prof.id">
              <option :value="prof.slug" x-text="prof.name + (prof.is_default ? ' (Default)' : '')"></option>
            </template>
          </select>
        </div>

        <!-- Action Triggers (4 cols) -->
        <div class="lg:col-span-4 flex flex-wrap items-center gap-2 lg:justify-end">
          <button type="button"
                  @click="launchDiscoveryHunt()"
                  :disabled="isHunting"
                  class="flex-1 lg:flex-initial px-4 py-2 rounded-xl text-xs font-semibold bg-[#E11D48] hover:bg-rose-500 text-white transition inline-flex items-center justify-center gap-1.5 shadow-xs cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:opacity-50">
            <i data-lucide="radar" class="w-4 h-4" :class="isHunting ? 'motion-safe:animate-spin' : ''"></i>
            <span x-text="isHunting ? 'Hunting 8 Surfaces...' : 'Hunt 8 Surfaces'">Hunt 8 Surfaces</span>
          </button>

          <button type="button"
                  @click="triggerSnowballOnSelectedOrTop()"
                  :disabled="isSnowballing"
                  class="px-3.5 py-2 rounded-xl text-xs font-semibold border border-[#E2E8F0] dark:border-[#27272A] bg-[#F1F5F9] hover:bg-[#E2E8F0] dark:bg-[#18181B] dark:hover:bg-[#27272A] text-[#0F172A] dark:text-[#FAFAFA] transition inline-flex items-center gap-1.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:opacity-50"
                  title="Expand RelatedModulesResource Snowball hops from selected or top Golden Pins">
            <i data-lucide="git-branch" class="w-4 h-4 text-[#E11D48] dark:text-rose-400" :class="isSnowballing ? 'motion-safe:animate-spin' : ''"></i>
            <span x-text="selectedPinIds.length > 0 ? ('Snowball (' + selectedPinIds.length + ')') : 'Snowball Golden'">Snowball Golden</span>
          </button>
        </div>
      </div>

      <!-- Live Run Telemetry Strip -->
      <template x-if="latestRunSummary">
        <div class="pt-2.5 border-t border-[#F1F5F9] dark:border-[#27272A] flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono tabular-nums text-[#64748B] dark:text-[#A1A1AA]">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="w-2 h-2 rounded-full"
                  :class="latestRunSummary.status === 'running' ? 'bg-amber-500 motion-safe:animate-pulse' : (latestRunSummary.status === 'failed' ? 'bg-rose-500' : 'bg-emerald-500')"></span>
            <span class="font-semibold text-[#0F172A] dark:text-[#FAFAFA]" x-text="'Last Run #' + (latestRunSummary.id || 'Live') + ' (' + (latestRunSummary.run_type || 'discovery') + ')'"></span>
            <span>•</span>
            <span x-text="'Mode: ' + (latestRunSummary.cookie_mode || 'guest_only')"></span>
            <span>•</span>
            <span x-text="formatNum(latestRunSummary.candidates_discovered) + ' discovered / ' + formatNum(latestRunSummary.golden_pins_count) + ' golden / ' + formatNum(latestRunSummary.rookie_creators_count) + ' rookies'"></span>
            <template x-if="latestRunSummary.snowball_hops_executed > 0">
              <span class="px-1.5 py-0.5 rounded bg-rose-500/10 text-[#E11D48] dark:text-rose-400 font-semibold" x-text="latestRunSummary.snowball_hops_executed + ' snowball hop(s)'"></span>
            </template>
          </div>
          <button type="button"
                  @click="setRoom('watchlist'); watchlistSubTab = 'runs'"
                  class="text-[#E11D48] dark:text-rose-400 hover:underline font-sans font-semibold cursor-pointer">
            Inspect Run Telemetry
          </button>
        </div>
      </template>
    </section>

    <!-- Segmented 6-Room Navigation Bar (DESIGN.md Section 4C — Zero Rainbow Tabs, Zero Emojis) -->
    <nav aria-label="Newborn Studio Workspaces" class="bg-[#F1F5F9] dark:bg-[#18181B] p-1 rounded-xl border border-[#E2E8F0] dark:border-[#27272A] flex items-center gap-1 overflow-x-auto">
      <button type="button"
              @click="setRoom('candidates')"
              class="px-3.5 py-2 rounded-lg text-xs font-semibold transition inline-flex items-center gap-2 shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
              :class="currentRoom === 'candidates' ? 'bg-white dark:bg-[#27272A] text-[#0F172A] dark:text-[#FAFAFA] shadow-xs' : 'text-[#64748B] dark:text-[#A1A1AA] hover:text-[#0F172A] dark:hover:text-[#FAFAFA]'">
        <i data-lucide="sparkles" class="w-3.5 h-3.5"></i>
        <span>Golden Candidates</span>
        <span class="px-1.5 py-0.5 rounded text-[10px] font-mono tabular-nums bg-[#F1F5F9] dark:bg-[#121215] text-[#64748B] dark:text-[#A1A1AA]" x-text="formatNum(candidatesTotal)">0</span>
      </button>

      <button type="button"
              @click="setRoom('launchpad')"
              class="px-3.5 py-2 rounded-lg text-xs font-semibold transition inline-flex items-center gap-2 shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
              :class="currentRoom === 'launchpad' ? 'bg-white dark:bg-[#27272A] text-[#0F172A] dark:text-[#FAFAFA] shadow-xs' : 'text-[#64748B] dark:text-[#A1A1AA] hover:text-[#0F172A] dark:hover:text-[#FAFAFA]'">
        <i data-lucide="trending-up" class="w-3.5 h-3.5"></i>
        <span>Trends &amp; Zero-Query Launchpad</span>
        <span class="px-1.5 py-0.5 rounded text-[10px] font-mono tabular-nums bg-[#F1F5F9] dark:bg-[#121215] text-[#64748B] dark:text-[#A1A1AA]">22 L1</span>
      </button>

      <button type="button"
              @click="setRoom('rookies')"
              class="px-3.5 py-2 rounded-lg text-xs font-semibold transition inline-flex items-center gap-2 shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
              :class="currentRoom === 'rookies' ? 'bg-white dark:bg-[#27272A] text-[#0F172A] dark:text-[#FAFAFA] shadow-xs' : 'text-[#64748B] dark:text-[#A1A1AA] hover:text-[#0F172A] dark:hover:text-[#FAFAFA]'">
        <i data-lucide="user-check" class="w-3.5 h-3.5"></i>
        <span>Rookie Accounts Radar</span>
        <span class="px-1.5 py-0.5 rounded text-[10px] font-mono tabular-nums bg-[#F1F5F9] dark:bg-[#121215] text-[#64748B] dark:text-[#A1A1AA]" x-text="formatNum(rookiesTotal)">0</span>
      </button>

      <button type="button"
              @click="setRoom('crossover')"
              class="px-3.5 py-2 rounded-lg text-xs font-semibold transition inline-flex items-center gap-2 shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
              :class="currentRoom === 'crossover' ? 'bg-white dark:bg-[#27272A] text-[#0F172A] dark:text-[#FAFAFA] shadow-xs' : 'text-[#64748B] dark:text-[#A1A1AA] hover:text-[#0F172A] dark:hover:text-[#FAFAFA]'">
        <i data-lucide="layers" class="w-3.5 h-3.5"></i>
        <span>Crossover &amp; Board Blueprints</span>
        <span class="px-1.5 py-0.5 rounded text-[10px] font-mono tabular-nums bg-[#F1F5F9] dark:bg-[#121215] text-[#64748B] dark:text-[#A1A1AA]" x-text="formatNum(crossoverClusters.length)">0</span>
      </button>

      <button type="button"
              @click="setRoom('watchlist')"
              class="px-3.5 py-2 rounded-lg text-xs font-semibold transition inline-flex items-center gap-2 shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
              :class="currentRoom === 'watchlist' ? 'bg-white dark:bg-[#27272A] text-[#0F172A] dark:text-[#FAFAFA] shadow-xs' : 'text-[#64748B] dark:text-[#A1A1AA] hover:text-[#0F172A] dark:hover:text-[#FAFAFA]'">
        <i data-lucide="clock" class="w-3.5 h-3.5"></i>
        <span>Watchlist, Anchors &amp; Runs</span>
        <span class="px-1.5 py-0.5 rounded text-[10px] font-mono tabular-nums bg-[#F1F5F9] dark:bg-[#121215] text-[#64748B] dark:text-[#A1A1AA]" x-text="formatNum(overviewCounts.watchlist_count)">0</span>
      </button>

      <button type="button"
              @click="setRoom('settings')"
              class="px-3.5 py-2 rounded-lg text-xs font-semibold transition inline-flex items-center gap-2 shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
              :class="currentRoom === 'settings' ? 'bg-white dark:bg-[#27272A] text-[#0F172A] dark:text-[#FAFAFA] shadow-xs' : 'text-[#64748B] dark:text-[#A1A1AA] hover:text-[#0F172A] dark:hover:text-[#FAFAFA]'">
        <i data-lucide="sliders" class="w-3.5 h-3.5"></i>
        <span>Settings, Profiles &amp; Cookie</span>
      </button>
    </nav>

    <!-- ====================================================================== -->
    <!-- ROOM: TRENDS & ZERO-QUERY LAUNCHPAD (Asymmetric 8/4 Bento Architecture) -->
    <!-- ====================================================================== -->
    <div x-show="currentRoom === 'launchpad'" class="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <!-- Left Studio (8 cols): Live Pinterest Trends + 22 L1 Interests + Predicted Peaks -->
      <div class="lg:col-span-8 bg-white dark:bg-[#121215] border border-[#E2E8F0] dark:border-[#27272A] rounded-2xl shadow-xs flex flex-col">
        <div class="p-4 border-b border-[#E2E8F0] dark:border-[#27272A] flex flex-wrap items-center justify-between gap-3">
          <div>
            <span class="text-[11px] font-bold uppercase tracking-wider text-[#64748B] dark:text-[#A1A1AA]">Surface 1 — Zero-Cookie Trends Explorer</span>
            <h2 class="text-sm font-bold text-[#0F172A] dark:text-[#FAFAFA]">Growing, Seasonal, Monthly &amp; Yearly Forecasts (90d Predicted Peaks)</h2>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <!-- Segmented Trend Horizon -->
            <div class="bg-[#F1F5F9] dark:bg-[#18181B] p-0.5 rounded-lg border border-[#E2E8F0] dark:border-[#27272A] flex items-center">
              <template x-for="tType in ['growing', 'seasonal', 'monthly', 'yearly']" :key="tType">
                <button type="button"
                        @click="launchpadFilter.trendType = tType; loadLaunchpad(false)"
                        class="px-2.5 py-1 rounded-md text-[11px] font-semibold capitalize transition cursor-pointer"
                        :class="launchpadFilter.trendType === tType ? 'bg-white dark:bg-[#27272A] text-[#0F172A] dark:text-[#FAFAFA] shadow-2xs' : 'text-[#64748B] dark:text-[#A1A1AA]'"
                        x-text="tType"></button>
              </template>
            </div>

            <button type="button"
                    @click="refreshLaunchpadLive()"
                    :disabled="isRefreshingLaunchpad"
                    class="px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#E11D48] hover:bg-rose-500 text-white transition inline-flex items-center gap-1.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:opacity-50">
              <i data-lucide="refresh-cw" class="w-3.5 h-3.5" :class="isRefreshingLaunchpad ? 'motion-safe:animate-spin' : ''"></i>
              <span x-text="isRefreshingLaunchpad ? 'Fetching Live...' : 'Fetch Live Trends'">Fetch Live Trends</span>
            </button>
          </div>
        </div>

        <!-- Country & 22 Official L1 Interests Filter Bar -->
        <div class="p-3.5 bg-[#F8FAFC] dark:bg-[#18181B]/60 border-b border-[#E2E8F0] dark:border-[#27272A] grid grid-cols-1 sm:grid-cols-12 gap-3">
          <div class="sm:col-span-4">
            <label for="nb-launchpad-country" class="block text-[10px] font-bold uppercase tracking-wider text-[#64748B] dark:text-[#A1A1AA] mb-1">Market Country</label>
            <select id="nb-launchpad-country"
                    x-model="launchpadFilter.country"
                    @change="loadLaunchpad(false)"
                    class="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg bg-white dark:bg-[#121215] border border-[#E2E8F0] dark:border-[#27272A] text-[#0F172A] dark:text-[#FAFAFA] cursor-pointer">
              <template x-for="c in supportedCountries" :key="c.code">
                <option :value="c.code" x-text="c.label"></option>
              </template>
            </select>
          </div>

          <div class="sm:col-span-8">
            <label for="nb-launchpad-interest" class="block text-[10px] font-bold uppercase tracking-wider text-[#64748B] dark:text-[#A1A1AA] mb-1">Official Pinterest L1 Interest (22 Sections)</label>
            <select id="nb-launchpad-interest"
                    x-model="launchpadFilter.l1Interest"
                    @change="loadLaunchpad(false)"
                    class="w-full px-2.5 py-1.5 text-xs rounded-lg bg-white dark:bg-[#121215] border border-[#E2E8F0] dark:border-[#27272A] text-[#0F172A] dark:text-[#FAFAFA] cursor-pointer">
              <option value="all">All 22 Official L1 Interest Categories</option>
              <template x-for="cat in l1InterestsCatalog" :key="cat.slug">
                <option :value="cat.slug" x-text="cat.label + ' (/ideas/' + cat.slug + '/)'"></option>
              </template>
            </select>
          </div>
        </div>

        <!-- Trends Tabular Feed -->
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead class="bg-[#F1F5F9] dark:bg-[#18181B] border-b border-[#E2E8F0] dark:border-[#27272A]">
              <tr>
                <th class="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#71717A]">Trend Term</th>
                <th class="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#71717A] text-right">Weekly</th>
                <th class="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#71717A] text-right">Monthly</th>
                <th class="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#71717A] text-right">Yearly</th>
                <th class="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#71717A]">Predicted Peak (90d)</th>
                <th class="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#71717A] text-right">Action</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-[#F1F5F9] dark:divide-[#1E1E22] text-xs">
              <template x-if="launchpadData.trends.length === 0">
                <tr>
                  <td colspan="6" class="px-4 py-8 text-center text-[#64748B] dark:text-[#A1A1AA]">
                    No cached trends for this filter slice yet. Click <strong>Fetch Live Trends</strong> to pull live forecasts from Pinterest Trends, or click any L1 Interest chip below to launch a direct taxonomy hunt.
                  </td>
                </tr>
              </template>
              <template x-for="tr in launchpadData.trends" :key="tr.term">
                <tr class="hover:bg-[#F8FAFC] dark:hover:bg-[#18181B] transition-colors">
                  <td class="px-4 py-2.5 font-semibold text-[#0F172A] dark:text-[#FAFAFA]" x-text="tr.term"></td>
                  <td class="px-3 py-2.5 font-mono tabular-nums text-right"
                      :class="tr.weekly_change > 0 ? 'text-emerald-700 dark:text-emerald-400 font-semibold' : 'text-[#64748B]'"
                      x-text="formatSignedPct(tr.weekly_change)"></td>
                  <td class="px-3 py-2.5 font-mono tabular-nums text-right"
                      :class="tr.monthly_change > 0 ? 'text-emerald-700 dark:text-emerald-400 font-semibold' : 'text-[#64748B]'"
                      x-text="formatSignedPct(tr.monthly_change)"></td>
                  <td class="px-3 py-2.5 font-mono tabular-nums text-right"
                      :class="tr.yearly_change > 0 ? 'text-emerald-700 dark:text-emerald-400 font-semibold' : 'text-[#64748B]'"
                      x-text="formatSignedPct(tr.yearly_change)"></td>
                  <td class="px-3 py-2.5">
                    <template x-if="tr.predicted_90d_growth !== null && tr.predicted_90d_growth !== undefined">
                      <span class="px-2 py-0.5 rounded text-[11px] font-mono tabular-nums font-semibold border"
                            :class="tr.predicted_90d_growth >= 0 ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30' : 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30'"
                            x-text="formatSignedPct(tr.predicted_90d_growth) + (tr.predicted_peak_date ? (' • ' + tr.predicted_peak_date) : ' 90d')"></span>
                    </template>
                    <template x-if="tr.predicted_90d_growth === null || tr.predicted_90d_growth === undefined">
                      <span class="text-[11px] font-mono text-[#94A3B8]">—</span>
                    </template>
                  </td>
                  <td class="px-4 py-2.5 text-right">
                    <button type="button"
                            @click="huntSingleSeed(tr.term)"
                            :disabled="isHunting"
                            class="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-[#E11D48] dark:text-rose-400 border border-rose-500/20 transition cursor-pointer">
                      Hunt Surface
                    </button>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>

        <!-- 22 Official L1 Taxonomy Quick-Launch Pills -->
        <div class="p-4 border-t border-[#E2E8F0] dark:border-[#27272A] space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-[11px] font-bold uppercase tracking-wider text-[#64748B] dark:text-[#A1A1AA]">1-Click L1 Interest Taxonomy Hunts (/ideas/ Surface 7)</span>
            <span class="text-[10px] font-mono tabular-nums text-[#94A3B8]">22 Official Sections</span>
          </div>
          <div class="flex flex-wrap gap-1.5">
            <template x-for="cat in l1InterestsCatalog" :key="'pill-' + cat.slug">
              <button type="button"
                      @click="huntSingleSeed('/ideas/' + cat.slug + '/')"
                      :disabled="isHunting"
                      class="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-[#F1F5F9] hover:bg-[#E2E8F0] dark:bg-[#18181B] dark:hover:bg-[#27272A] text-[#0F172A] dark:text-[#FAFAFA] border border-[#E2E8F0] dark:border-[#27272A] transition cursor-pointer"
                      x-text="cat.label"></button>
            </template>
          </div>
        </div>
      </div>

      <!-- Right Studio (4 cols): Zero-Query Radar (Popular on Pinterest + Ideas for You) & Recent High-Scoring Seeds -->
      <div class="lg:col-span-4 space-y-6">
        <div class="bg-white dark:bg-[#121215] border border-[#E2E8F0] dark:border-[#27272A] rounded-2xl shadow-xs p-4 space-y-4">
          <div class="flex items-center justify-between">
            <div>
              <span class="text-[11px] font-bold uppercase tracking-wider text-[#64748B] dark:text-[#A1A1AA]">Surface 2 — SearchTabResource</span>
              <h3 class="text-sm font-bold text-[#0F172A] dark:text-[#FAFAFA]">Zero-Query Radar</h3>
            </div>
            <span class="px-2 py-0.5 rounded text-[10px] font-mono tabular-nums border"
                  :class="launchpadData.zero_query_used_guest_fallback ? 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30' : 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30'"
                  x-text="launchpadData.zero_query_used_guest_fallback ? 'Guest Fallback' : 'Zone-A Ready'"></span>
          </div>

          <!-- Popular on Pinterest -->
          <div class="space-y-2">
            <div class="text-[11px] font-semibold text-[#64748B] dark:text-[#A1A1AA]">Popular on Pinterest</div>
            <template x-if="launchpadData.popular_terms.length === 0">
              <p class="text-xs text-[#94A3B8]">Click Fetch Live Trends to populate Zero-Query popular searches.</p>
            </template>
            <div class="flex flex-wrap gap-1.5">
              <template x-for="term in launchpadData.popular_terms" :key="'pop-' + term">
                <button type="button"
                        @click="huntSingleSeed(term)"
                        class="px-2.5 py-1 rounded-lg text-xs font-medium bg-[#F1F5F9] hover:bg-rose-500/10 hover:text-[#E11D48] dark:bg-[#18181B] dark:hover:bg-rose-500/15 text-[#0F172A] dark:text-[#FAFAFA] border border-[#E2E8F0] dark:border-[#27272A] transition inline-flex items-center gap-1.5 cursor-pointer">
                  <span x-text="term"></span>
                  <i data-lucide="arrow-up-right" class="w-3 h-3 opacity-60"></i>
                </button>
              </template>
            </div>
          </div>

          <!-- Ideas for You -->
          <div class="space-y-2 pt-3 border-t border-[#F1F5F9] dark:border-[#27272A]">
            <div class="text-[11px] font-semibold text-[#64748B] dark:text-[#A1A1AA]">Ideas for You (Authenticated Feed)</div>
            <template x-if="launchpadData.ideas_for_you_terms.length === 0">
              <p class="text-xs text-[#94A3B8]">Configure a Zone-A session cookie in Settings to unlock personalized Ideas for You capsules.</p>
            </template>
            <div class="flex flex-wrap gap-1.5">
              <template x-for="idea in launchpadData.ideas_for_you_terms" :key="'idea-' + idea">
                <button type="button"
                        @click="huntSingleSeed(idea)"
                        class="px-2.5 py-1 rounded-lg text-xs font-medium bg-sky-50 hover:bg-sky-100 text-sky-900 dark:bg-sky-500/15 dark:text-sky-300 border border-sky-200 dark:border-sky-500/30 transition inline-flex items-center gap-1.5 cursor-pointer">
                  <span x-text="idea"></span>
                  <i data-lucide="arrow-up-right" class="w-3 h-3 opacity-70"></i>
                </button>
              </template>
            </div>
          </div>
        </div>

        <!-- Proven Seed Queries in Staging -->
        <div class="bg-white dark:bg-[#121215] border border-[#E2E8F0] dark:border-[#27272A] rounded-2xl shadow-xs p-4 space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="text-xs font-bold uppercase tracking-wider text-[#64748B] dark:text-[#A1A1AA]">High-Yield Staged Seeds</h3>
            <span class="text-[11px] font-mono tabular-nums text-[#94A3B8]" x-text="launchpadData.recent_seeds.length + ' seeds'"></span>
          </div>
          <template x-if="launchpadData.recent_seeds.length === 0">
            <p class="text-xs text-[#94A3B8]">Seeds from completed discovery hunts will rank here by peak Golden Score.</p>
          </template>
          <div class="space-y-1.5">
            <template x-for="sd in launchpadData.recent_seeds" :key="'seed-' + sd.term">
              <div class="px-3 py-2 rounded-xl bg-[#F8FAFC] dark:bg-[#18181B] border border-[#E2E8F0] dark:border-[#27272A] flex items-center justify-between gap-2 text-xs">
                <button type="button"
                        @click="candidateFilters.search = sd.term; setRoom('candidates'); loadCandidates(true)"
                        class="font-medium text-[#0F172A] dark:text-[#FAFAFA] hover:text-[#E11D48] truncate text-left cursor-pointer"
                        x-text="sd.term"></button>
                <div class="flex items-center gap-2 shrink-0 font-mono tabular-nums text-[11px]">
                  <span class="text-[#64748B] dark:text-[#A1A1AA]" x-text="sd.pin_count + 'p'"></span>
                  <span class="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300 font-semibold" x-text="formatDecimal(sd.max_golden_score, 1)"></span>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>
    </div>
`;
}
