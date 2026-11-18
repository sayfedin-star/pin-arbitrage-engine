/**
 * src/ui/newborn/newborn-candidates-and-rookies.mjs
 *
 * Renders:
 * 1. Room `candidates`: Golden Newborn Candidates High-Density Workspace
 * 2. Room `rookies`: Rookie / Rising Accounts Radar (`Total audience`, `Impressions`, `10M+` ceiling, Leverage Ratio)
 * 3. Room `crossover`: Semantic Crossover & Board Blueprints
 * 4. Room `watchlist`: Staged Watchlist Queue, `01:00 UTC` Daily Velocity Anchors & Execution Run Diagnostics
 */

export function getNewbornCandidatesAndRookiesHtml() {
  return `
    <!-- ====================================================================== -->
    <!-- ROOM: GOLDEN NEWBORN CANDIDATES GRID                                   -->
    <!-- ====================================================================== -->
    <div x-show="currentRoom === 'candidates'" class="space-y-4">
      <!-- Filter & Facet Control Card -->
      <div class="p-4 rounded-2xl bg-white dark:bg-[#121215] border border-[#E2E8F0] dark:border-[#27272A] shadow-xs space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <!-- Stage Segmented Track -->
          <div class="bg-[#F1F5F9] dark:bg-[#18181B] p-1 rounded-xl border border-[#E2E8F0] dark:border-[#27272A] flex items-center gap-1 flex-wrap">
            <template x-for="st in [{k: '', l: 'All Active'}, {k: 'discovered', l: 'Discovered'}, {k: 'watchlist', l: 'Watchlist'}, {k: 'promoted', l: 'Promoted'}, {k: 'discarded', l: 'Discarded'}]" :key="'st-' + st.k">
              <button type="button"
                      @click="candidateFilters.stage = st.k; candidateFilters.offset = 0; loadCandidates(true)"
                      class="px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer"
                      :class="candidateFilters.stage === st.k ? 'bg-white dark:bg-[#27272A] text-[#0F172A] dark:text-[#FAFAFA] shadow-2xs' : 'text-[#64748B] dark:text-[#A1A1AA] hover:text-[#0F172A] dark:hover:text-[#FAFAFA]'"
                      x-text="st.l"></button>
            </template>
          </div>

          <!-- Quick Signal Toggles + Export CSV -->
          <div class="flex flex-wrap items-center gap-2">
            <button type="button"
                    @click="candidateFilters.goldenOnly = !candidateFilters.goldenOnly; candidateFilters.offset = 0; loadCandidates(true)"
                    class="px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition inline-flex items-center gap-1.5 cursor-pointer"
                    :class="candidateFilters.goldenOnly ? 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/40' : 'bg-[#F1F5F9] dark:bg-[#18181B] text-[#64748B] dark:text-[#A1A1AA] border-[#E2E8F0] dark:border-[#27272A]'">
              <i data-lucide="award" class="w-3.5 h-3.5"></i>
              <span>Golden Only</span>
            </button>

            <button type="button"
                    @click="candidateFilters.rookieOnly = !candidateFilters.rookieOnly; candidateFilters.offset = 0; loadCandidates(true)"
                    class="px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition inline-flex items-center gap-1.5 cursor-pointer"
                    :class="candidateFilters.rookieOnly ? 'bg-sky-50 text-sky-800 border-sky-300 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/40' : 'bg-[#F1F5F9] dark:bg-[#18181B] text-[#64748B] dark:text-[#A1A1AA] border-[#E2E8F0] dark:border-[#27272A]'">
              <i data-lucide="user-plus" class="w-3.5 h-3.5"></i>
              <span>Rookie Outliers</span>
            </button>

            <button type="button"
                    @click="candidateFilters.linklessOnly = !candidateFilters.linklessOnly; candidateFilters.offset = 0; loadCandidates(true)"
                    class="px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition inline-flex items-center gap-1.5 cursor-pointer"
                    :class="candidateFilters.linklessOnly ? 'bg-amber-50 text-amber-900 border-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/40' : 'bg-[#F1F5F9] dark:bg-[#18181B] text-[#64748B] dark:text-[#A1A1AA] border-[#E2E8F0] dark:border-[#27272A]'">
              <i data-lucide="unlink" class="w-3.5 h-3.5"></i>
              <span>Linkless Goldmine</span>
            </button>

            <button type="button"
                    @click="exportCandidatesCsv()"
                    :disabled="candidates.length === 0"
                    class="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white dark:bg-[#18181B] hover:bg-[#F1F5F9] dark:hover:bg-[#27272A] text-[#0F172A] dark:text-[#FAFAFA] border border-[#E2E8F0] dark:border-[#27272A] transition inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50">
              <i data-lucide="download" class="w-3.5 h-3.5"></i>
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        <!-- Secondary Facets Row -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5 pt-2 border-t border-[#F1F5F9] dark:border-[#27272A]">
          <div class="lg:col-span-3">
            <label for="nb-cand-search" class="sr-only">Search candidates</label>
            <input id="nb-cand-search"
                   type="text"
                   x-model="candidateFilters.search"
                   @keydown.enter.prevent="candidateFilters.offset = 0; loadCandidates(true)"
                   placeholder="Filter title, @creator, board, domain, Pin ID..."
                   class="w-full px-3 py-1.5 text-xs rounded-xl bg-[#F1F5F9] dark:bg-[#18181B] border border-[#E2E8F0] dark:border-[#27272A] text-[#0F172A] dark:text-[#FAFAFA] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-rose-500" />
          </div>

          <div class="lg:col-span-2">
            <label for="nb-cand-surface" class="sr-only">Filter by discovery surface</label>
            <select id="nb-cand-surface"
                    x-model="candidateFilters.surface"
                    @change="candidateFilters.offset = 0; loadCandidates(true)"
                    class="w-full px-2.5 py-1.5 text-xs rounded-xl bg-[#F1F5F9] dark:bg-[#18181B] border border-[#E2E8F0] dark:border-[#27272A] text-[#0F172A] dark:text-[#FAFAFA] cursor-pointer">
              <option value="">All 8 Surfaces</option>
              <template x-for="sf in surfacesCatalog" :key="'flt-sf-' + sf.id">
                <option :value="sf.id" x-text="sf.label"></option>
              </template>
            </select>
          </div>

          <div class="lg:col-span-3">
            <label for="nb-cand-prov" class="sr-only">Filter by upload provenance</label>
            <select id="nb-cand-prov"
                    x-model="candidateFilters.provenance"
                    @change="candidateFilters.offset = 0; loadCandidates(true)"
                    class="w-full px-2.5 py-1.5 text-xs font-mono rounded-xl bg-[#F1F5F9] dark:bg-[#18181B] border border-[#E2E8F0] dark:border-[#27272A] text-[#0F172A] dark:text-[#FAFAFA] cursor-pointer">
              <option value="">All Provenance Sources</option>
              <template x-for="pv in validProvenances" :key="'flt-pv-' + pv">
                <option :value="pv" x-text="pv"></option>
              </template>
            </select>
          </div>

          <div class="lg:col-span-2">
            <label for="nb-cand-age" class="sr-only">Max pin age</label>
            <select id="nb-cand-age"
                    x-model="candidateFilters.maxAgeDays"
                    @change="candidateFilters.offset = 0; loadCandidates(true)"
                    class="w-full px-2.5 py-1.5 text-xs font-mono rounded-xl bg-[#F1F5F9] dark:bg-[#18181B] border border-[#E2E8F0] dark:border-[#27272A] text-[#0F172A] dark:text-[#FAFAFA] cursor-pointer">
              <option value="">Any Pin Age</option>
              <option value="7">Max Age: 7d</option>
              <option value="14">Max Age: 14d</option>
              <option value="30">Max Age: 30d</option>
              <option value="90">Max Age: 90d</option>
            </select>
          </div>

          <div class="lg:col-span-2">
            <label for="nb-cand-sort" class="sr-only">Sort candidates</label>
            <select id="nb-cand-sort"
                    x-model="candidateFilters.sort"
                    @change="candidateFilters.offset = 0; loadCandidates(true)"
                    class="w-full px-2.5 py-1.5 text-xs rounded-xl bg-[#F1F5F9] dark:bg-[#18181B] border border-[#E2E8F0] dark:border-[#27272A] text-[#0F172A] dark:text-[#FAFAFA] cursor-pointer">
              <option value="golden_score">Sort: Golden Score</option>
              <option value="repin_velocity">Sort: Repin/Day Velocity</option>
              <option value="save_velocity">Sort: Save/Day Velocity</option>
              <option value="repins">Sort: Repin Count</option>
              <option value="fresh">Sort: Freshest Age</option>
              <option value="recent">Sort: Recently Seen</option>
            </select>
          </div>
        </div>

        <!-- Bulk Action Selection Ribbon -->
        <template x-if="selectedPinIds.length > 0">
          <div class="p-2.5 px-3.5 rounded-xl bg-rose-50/90 dark:bg-rose-950/25 border border-rose-200 dark:border-rose-500/30 flex flex-wrap items-center justify-between gap-2">
            <div class="flex items-center gap-2 text-xs font-semibold text-[#9F1239] dark:text-rose-300">
              <span class="font-mono tabular-nums" x-text="selectedPinIds.length"></span>
              <span>candidate pin(s) selected</span>
              <button type="button" @click="selectedPinIds = []" class="underline text-[11px] ml-2 cursor-pointer">Clear</button>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <button type="button"
                      @click="snowballPinIds(selectedPinIds)"
                      :disabled="isSnowballing"
                      class="px-3 py-1 rounded-lg text-xs font-semibold bg-white dark:bg-[#18181B] text-[#0F172A] dark:text-[#FAFAFA] border border-[#E2E8F0] dark:border-[#27272A] hover:bg-[#F1F5F9] transition inline-flex items-center gap-1.5 cursor-pointer">
                <i data-lucide="git-branch" class="w-3.5 h-3.5 text-[#E11D48]"></i>
                <span>Bulk Snowball Related</span>
              </button>
              <button type="button"
                      @click="bulkSetCandidateStage(selectedPinIds, 'watchlist')"
                      class="px-3 py-1 rounded-lg text-xs font-semibold bg-white dark:bg-[#18181B] text-[#0F172A] dark:text-[#FAFAFA] border border-[#E2E8F0] dark:border-[#27272A] hover:bg-[#F1F5F9] transition inline-flex items-center gap-1.5 cursor-pointer">
                <i data-lucide="bookmark-plus" class="w-3.5 h-3.5 text-sky-600"></i>
                <span>Stage to Watchlist</span>
              </button>
              <button type="button"
                      @click="openPromoteModalForIds(selectedPinIds)"
                      class="px-3 py-1 rounded-lg text-xs font-semibold bg-[#E11D48] hover:bg-rose-500 text-white transition inline-flex items-center gap-1.5 cursor-pointer">
                <i data-lucide="rocket" class="w-3.5 h-3.5"></i>
                <span>Multi-Pillar Promote</span>
              </button>
              <button type="button"
                      @click="bulkSetCandidateStage(selectedPinIds, 'discarded')"
                      class="px-2.5 py-1 rounded-lg text-xs font-semibold text-[#64748B] hover:text-rose-600 transition cursor-pointer">
                Discard
              </button>
            </div>
          </div>
        </template>
      </div>

      <!-- High-Density Tabular Grid -->
      <div class="bg-white dark:bg-[#121215] border border-[#E2E8F0] dark:border-[#27272A] rounded-2xl shadow-xs overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead class="bg-[#F1F5F9] dark:bg-[#18181B] border-b border-[#E2E8F0] dark:border-[#27272A]">
              <tr>
                <th class="px-3 py-2.5 w-9">
                  <input type="checkbox"
                         aria-label="Select all visible candidates"
                         :checked="candidates.length > 0 && selectedPinIds.length === candidates.length"
                         @change="toggleSelectAllCandidates($event.target.checked)"
                         class="rounded border-slate-300 text-[#E11D48] focus:ring-rose-500 cursor-pointer" />
                </th>
                <th class="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#71717A]">Pin &amp; Linkless Status</th>
                <th class="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#71717A]">Origin Creator vs Pinner</th>
                <th class="px-2.5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#71717A] text-right">Golden</th>
                <th class="px-2.5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#71717A] text-right">Age</th>
                <th class="px-2.5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#71717A] text-right">Repin/d</th>
                <th class="px-2.5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#71717A] text-right">Saves / Repins</th>
                <th class="px-2.5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#71717A] text-right">Shr / Cmt / Rxn</th>
                <th class="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#71717A]">Board Context</th>
                <th class="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#71717A]">Provenance</th>
                <th class="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#71717A] text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-[#F1F5F9] dark:divide-[#1E1E22] text-xs">
              <template x-if="isLoadingCandidates">
                <tr>
                  <td colspan="11" class="px-4 py-10 text-center text-[#64748B] dark:text-[#A1A1AA] font-mono">
                    Loading staged Newborn candidates...
                  </td>
                </tr>
              </template>
              <template x-if="!isLoadingCandidates && candidates.length === 0">
                <tr>
                  <td colspan="11" class="px-4 py-10 text-center text-[#64748B] dark:text-[#A1A1AA]">
                    No staged candidates match current filters. Enter a seed above and click <strong>Hunt 8 Surfaces</strong> or browse the <strong>Trends &amp; Zero-Query Launchpad</strong>.
                  </td>
                </tr>
              </template>

              <template x-for="pin in candidates" :key="pin.pin_id">
                <tr class="hover:bg-[#F8FAFC] dark:hover:bg-[#18181B] transition-colors">
                  <!-- Select -->
                  <td class="px-3 py-2.5 align-middle">
                    <input type="checkbox"
                           :aria-label="'Select pin ' + pin.pin_id"
                           :checked="selectedPinIds.includes(pin.pin_id)"
                           @change="toggleSelectPin(pin.pin_id)"
                           class="rounded border-slate-300 text-[#E11D48] focus:ring-rose-500 cursor-pointer" />
                  </td>

                  <!-- Creative, Title, Domain / Linkless Goldmine & Surface Badges -->
                  <td class="px-3 py-2.5 max-w-[17rem]">
                    <div class="flex items-center gap-2.5">
                      <img :src="resolveThumb(pin.image_url)"
                           @error="onImgErr($event)"
                           alt=""
                           class="w-10 h-14 rounded-lg object-cover border border-[#E2E8F0] dark:border-[#27272A] shrink-0 bg-[#F1F5F9] dark:bg-[#18181B]" />
                      <div class="min-w-0 space-y-1">
                        <div class="flex items-center gap-1.5">
                          <button type="button"
                                  @click="openCandidateDossier(pin.pin_id)"
                                  class="font-semibold text-[#0F172A] dark:text-[#FAFAFA] hover:text-[#E11D48] truncate text-left cursor-pointer"
                                  x-text="pin.title || ('Pin #' + pin.pin_id)"></button>
                        </div>
                        <div class="flex flex-wrap items-center gap-1">
                          <template x-if="pin.is_linkless">
                            <span class="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30">
                              Linkless Goldmine
                            </span>
                          </template>
                          <template x-if="!pin.is_linkless && pin.clean_domain">
                            <a :href="safeHref(pin.destination_url || ('https://' + pin.clean_domain))"
                               target="_blank"
                               rel="noopener noreferrer"
                               class="px-1.5 py-0.5 rounded text-[10px] font-mono bg-sky-50 text-sky-800 border border-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30 truncate max-w-[9rem]"
                               x-text="pin.clean_domain"></a>
                          </template>
                          <span class="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[#F1F5F9] dark:bg-[#18181B] text-[#64748B] dark:text-[#A1A1AA]"
                                x-text="pin.stage"></span>
                          <template x-if="pin.snowball_hop > 0">
                            <span class="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-rose-50 text-[#9F1239] dark:bg-rose-500/15 dark:text-rose-300"
                                  x-text="'Hop ' + pin.snowball_hop"></span>
                          </template>
                        </div>
                      </div>
                    </div>
                  </td>

                  <!-- Dual Creator Attribution: Origin Creator vs Pinner (True Original vs Repin) -->
                  <td class="px-3 py-2.5 min-w-[11.5rem]">
                    <div class="space-y-1">
                      <div class="flex items-center gap-1.5 flex-wrap">
                        <span class="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold border"
                              :class="pin.is_repin ? 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30' : 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30'"
                              x-text="pin.is_repin ? 'Repin' : 'True Original'"></span>
                        <template x-if="pin.is_rookie_outlier">
                          <span class="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-sky-50 text-sky-800 border border-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30">
                            Rookie
                          </span>
                        </template>
                      </div>
                      <div class="text-[11px] font-mono tabular-nums text-[#0F172A] dark:text-[#FAFAFA] truncate">
                        <span class="text-[#64748B] dark:text-[#71717A]">Origin:</span>
                        <span class="font-semibold" x-text="'@' + (pin.origin_creator_username || pin.effective_creator_username || pin.pinner_username || 'unknown')"></span>
                        <span class="text-[#64748B]" x-text="pin.effective_creator_followers != null ? (' (' + formatCeilingMetric(pin.effective_creator_followers, true) + ')') : ''"></span>
                      </div>
                      <template x-if="pin.pinner_username && pin.origin_creator_username && pin.pinner_username !== pin.origin_creator_username">
                        <div class="text-[10px] font-mono tabular-nums text-[#64748B] dark:text-[#A1A1AA] truncate">
                          <span>Pinner:</span>
                          <span x-text="'@' + pin.pinner_username + (pin.pinner_followers != null ? (' (' + formatCeilingMetric(pin.pinner_followers, true) + ')') : '')"></span>
                        </div>
                      </template>
                    </div>
                  </td>

                  <!-- Golden Score & Consecutive Streak -->
                  <td class="px-2.5 py-2.5 text-right font-mono tabular-nums align-middle">
                    <div class="inline-flex flex-col items-end gap-0.5">
                      <span class="px-2 py-0.5 rounded-md text-xs font-bold border"
                            :class="pin.is_golden_pin ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30' : 'bg-[#F1F5F9] dark:bg-[#18181B] text-[#0F172A] dark:text-[#FAFAFA] border-[#E2E8F0] dark:border-[#27272A]'"
                            x-text="formatDecimal(pin.golden_score, 1)"></span>
                      <span class="text-[10px] text-[#94A3B8]" x-text="(pin.consecutive_qualifying_days || 0) + 'd qual'"></span>
                    </div>
                  </td>

                  <!-- Age (Rule 31 Universal Age) -->
                  <td class="px-2.5 py-2.5 text-right font-mono tabular-nums text-xs text-[#0F172A] dark:text-[#FAFAFA] align-middle"
                      x-text="formatAgeDisplay(pin.age_days ?? pin.created_at_pinterest)"></td>

                  <!-- Repin / Day Velocity -->
                  <td class="px-2.5 py-2.5 text-right font-mono tabular-nums align-middle">
                    <span class="font-semibold text-emerald-700 dark:text-emerald-400"
                          x-text="pin.repin_per_day != null ? ('+' + formatDecimal(pin.repin_per_day, 1) + '/d') : '—'"></span>
                  </td>

                  <!-- Saves / Repins (Preserves NULL unhydrated saves as —) -->
                  <td class="px-2.5 py-2.5 text-right font-mono tabular-nums align-middle">
                    <div class="text-[#0F172A] dark:text-[#FAFAFA] font-semibold"
                         x-text="pin.save_count !== null && pin.save_count !== undefined ? formatCeilingMetric(pin.save_count, true) : '—'"></div>
                    <div class="text-[10px] text-[#64748B] dark:text-[#A1A1AA]"
                         x-text="(pin.repin_count !== null && pin.repin_count !== undefined ? formatCeilingMetric(pin.repin_count, true) : '—') + ' repins'"></div>
                  </td>

                  <!-- Shares / Comments / Reactions -->
                  <td class="px-2.5 py-2.5 text-right font-mono tabular-nums text-[11px] text-[#64748B] dark:text-[#A1A1AA] align-middle"
                      x-text="formatNullableInt(pin.share_count) + ' / ' + formatNullableInt(pin.comment_count) + ' / ' + formatNullableInt(pin.reaction_count)"></td>

                  <!-- Board Context (board_name, board_pin_count, board_follower_count) -->
                  <td class="px-3 py-2.5 max-w-[11rem] align-middle">
                    <template x-if="pin.board_name">
                      <div class="space-y-0.5">
                        <a :href="safeHref(pin.board_url || '#')"
                           target="_blank"
                           rel="noopener noreferrer"
                           class="font-medium text-[#0F172A] dark:text-[#FAFAFA] hover:text-[#E11D48] block truncate"
                           x-text="pin.board_name"></a>
                        <div class="text-[10px] font-mono tabular-nums text-[#64748B] dark:text-[#A1A1AA]"
                             x-text="(pin.board_pin_count != null ? (formatCeilingMetric(pin.board_pin_count, true) + ' pins') : 'Board') + (pin.board_follower_count != null ? (' • ' + formatCeilingMetric(pin.board_follower_count, true) + ' flw') : '')"></div>
                      </div>
                    </template>
                    <template x-if="!pin.board_name">
                      <span class="text-[11px] font-mono text-[#94A3B8]">—</span>
                    </template>
                  </td>

                  <!-- Upload Provenance & AI Disclosure -->
                  <td class="px-3 py-2.5 align-middle">
                    <div class="flex flex-col items-start gap-1">
                      <span class="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold border"
                            :class="['SHARE_EXTENSION_IOS', 'SHARE_EXTENSION_ANDROID', 'UPLOADED'].includes(pin.upload_provenance) ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30' : 'bg-[#F1F5F9] dark:bg-[#18181B] text-[#64748B] dark:text-[#A1A1AA] border-[#E2E8F0] dark:border-[#27272A]'"
                            x-text="pin.upload_provenance || 'UNKNOWN'"></span>
                      <template x-if="pin.has_ai_disclosure">
                        <span class="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-500/15 dark:text-amber-300">
                          AI Disclosed
                        </span>
                      </template>
                    </div>
                  </td>

                  <!-- Row Actions -->
                  <td class="px-3 py-2.5 text-right align-middle">
                    <div class="inline-flex items-center justify-end gap-1">
                      <button type="button"
                              @click="snowballPinIds([pin.pin_id])"
                              :disabled="isSnowballing"
                              aria-label="Snowball related pins"
                              title="1-Click Snowball Related Pins"
                              class="p-1.5 rounded-lg border border-[#E2E8F0] dark:border-[#27272A] hover:bg-rose-50 dark:hover:bg-rose-950/30 text-[#64748B] hover:text-[#E11D48] transition cursor-pointer">
                        <i data-lucide="git-branch" class="w-3.5 h-3.5"></i>
                      </button>

                      <button type="button"
                              @click="bulkSetCandidateStage([pin.pin_id], pin.stage === 'watchlist' ? 'discovered' : 'watchlist')"
                              :aria-label="pin.stage === 'watchlist' ? 'Remove from Watchlist' : 'Stage to Watchlist'"
                              :title="pin.stage === 'watchlist' ? 'Move back to Discovered' : 'Stage to Watchlist'"
                              class="p-1.5 rounded-lg border border-[#E2E8F0] dark:border-[#27272A] transition cursor-pointer"
                              :class="pin.stage === 'watchlist' ? 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/15 dark:text-sky-300' : 'text-[#64748B] hover:text-sky-600 hover:bg-sky-50/50'">
                        <i data-lucide="bookmark" class="w-3.5 h-3.5"></i>
                      </button>

                      <button type="button"
                              @click="openPromoteModal([pin])"
                              aria-label="Promote candidate pin"
                              title="Multi-Pillar Promote"
                              class="px-2 py-1 rounded-lg text-[11px] font-semibold bg-[#E11D48] hover:bg-rose-500 text-white transition cursor-pointer">
                        Promote
                      </button>

                      <button type="button"
                              @click="openCandidateDossier(pin.pin_id)"
                              aria-label="Inspect candidate dossier"
                              title="Inspect Staging Dossier & Blueprint"
                              class="p-1.5 rounded-lg border border-[#E2E8F0] dark:border-[#27272A] text-[#64748B] hover:text-[#0F172A] dark:hover:text-[#FAFAFA] transition cursor-pointer">
                        <i data-lucide="panel-right-open" class="w-3.5 h-3.5"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>

        <!-- Pagination Footer -->
        <div class="px-4 py-3 border-t border-[#E2E8F0] dark:border-[#27272A] bg-[#F8FAFC] dark:bg-[#18181B]/50 flex items-center justify-between text-xs font-mono tabular-nums text-[#64748B] dark:text-[#A1A1AA]">
          <span x-text="'Showing ' + (candidates.length ? (candidateFilters.offset + 1) : 0) + '–' + (candidateFilters.offset + candidates.length) + ' of ' + formatNum(candidatesTotal)"></span>
          <div class="flex items-center gap-2">
            <button type="button"
                    @click="changeCandidatesPage(-1)"
                    :disabled="candidateFilters.offset <= 0"
                    class="px-2.5 py-1 rounded-lg border border-[#E2E8F0] dark:border-[#27272A] bg-white dark:bg-[#121215] disabled:opacity-40 cursor-pointer">
              Prev
            </button>
            <button type="button"
                    @click="changeCandidatesPage(1)"
                    :disabled="candidateFilters.offset + candidateFilters.limit >= candidatesTotal"
                    class="px-2.5 py-1 rounded-lg border border-[#E2E8F0] dark:border-[#27272A] bg-white dark:bg-[#121215] disabled:opacity-40 cursor-pointer">
              Next
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ====================================================================== -->
    <!-- ROOM: ROOKIE / RISING ACCOUNTS RADAR                                   -->
    <!-- ====================================================================== -->
    <div x-show="currentRoom === 'rookies'" class="space-y-4">
      <div class="p-4 rounded-2xl bg-white dark:bg-[#121215] border border-[#E2E8F0] dark:border-[#27272A] shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div>
          <span class="text-[11px] font-bold uppercase tracking-wider text-[#64748B] dark:text-[#A1A1AA]">Zero-Cookie UserResource Hydration</span>
          <h2 class="text-sm font-bold text-[#0F172A] dark:text-[#FAFAFA]">Rookie &amp; High-Leverage Rising Accounts Radar</h2>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <div class="bg-[#F1F5F9] dark:bg-[#18181B] p-1 rounded-xl border border-[#E2E8F0] dark:border-[#27272A] flex items-center gap-1">
            <template x-for="rst in [{k: '', l: 'All'}, {k: 'discovered', l: 'Discovered'}, {k: 'watchlist', l: 'Watchlist'}, {k: 'promoted', l: 'Tracked in Creator Hub'}]" :key="'rst-' + rst.k">
              <button type="button"
                      @click="rookieFilters.stage = rst.k; loadRookies()"
                      class="px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer"
                      :class="rookieFilters.stage === rst.k ? 'bg-white dark:bg-[#27272A] text-[#0F172A] dark:text-[#FAFAFA] shadow-2xs' : 'text-[#64748B] dark:text-[#A1A1AA]'"
                      x-text="rst.l"></button>
            </template>
          </div>

          <label for="nb-rookie-search" class="sr-only">Search rookie accounts</label>
          <input id="nb-rookie-search"
                 type="text"
                 x-model="rookieFilters.search"
                 @keydown.enter.prevent="loadRookies()"
                 placeholder="Search @handle or domain..."
                 class="px-3 py-1.5 text-xs rounded-xl bg-[#F1F5F9] dark:bg-[#18181B] border border-[#E2E8F0] dark:border-[#27272A] text-[#0F172A] dark:text-[#FAFAFA]" />
        </div>
      </div>

      <div class="bg-white dark:bg-[#121215] border border-[#E2E8F0] dark:border-[#27272A] rounded-2xl shadow-xs overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead class="bg-[#F1F5F9] dark:bg-[#18181B] border-b border-[#E2E8F0] dark:border-[#27272A]">
              <tr>
                <th class="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#71717A]">Rookie Creator</th>
                <th class="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#71717A] text-right">Rookie Score</th>
                <th class="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#71717A] text-right">Followers</th>
                <th class="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#71717A] text-right">Total audience</th>
                <th class="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#71717A] text-right">Impressions</th>
                <th class="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#71717A] text-right">Leverage Ratio</th>
                <th class="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#71717A] text-right">Viral Newborn Pins</th>
                <th class="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#71717A]">Top Annotations</th>
                <th class="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#71717A] text-right">Track in Creator Hub</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-[#F1F5F9] dark:divide-[#1E1E22] text-xs">
              <template x-if="rookies.length === 0">
                <tr>
                  <td colspan="9" class="px-4 py-10 text-center text-[#64748B] dark:text-[#A1A1AA]">
                    No staged rookie creators found yet. Run an 8-Surface Hunt to discover low-follower creators generating outsized Total audience and Golden Pins.
                  </td>
                </tr>
              </template>
              <template x-for="rk in rookies" :key="rk.username">
                <tr class="hover:bg-[#F8FAFC] dark:hover:bg-[#18181B] transition-colors">
                  <td class="px-4 py-2.5">
                    <div class="flex items-center gap-2.5">
                      <div class="w-8 h-8 rounded-full bg-[#F1F5F9] dark:bg-[#18181B] border border-[#E2E8F0] dark:border-[#27272A] flex items-center justify-center font-mono text-xs font-bold text-[#E11D48] shrink-0"
                           x-text="(rk.username || '?').slice(0, 2).toUpperCase()"></div>
                      <div class="min-w-0">
                        <div class="font-semibold text-[#0F172A] dark:text-[#FAFAFA] truncate" x-text="rk.display_name || ('@' + rk.username)"></div>
                        <div class="flex items-center gap-1.5 text-[11px] font-mono text-[#64748B] dark:text-[#A1A1AA]">
                          <a :href="safeHref('https://www.pinterest.com/' + rk.username + '/')" target="_blank" rel="noopener noreferrer" class="hover:text-[#E11D48]" x-text="'@' + rk.username"></a>
                          <template x-if="rk.clean_domain">
                            <span class="px-1.5 py-0.5 rounded bg-sky-50 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300 text-[10px]" x-text="rk.clean_domain"></span>
                          </template>
                        </div>
                      </div>
                    </div>
                  </td>

                  <td class="px-3 py-2.5 text-right font-mono tabular-nums">
                    <span class="px-2 py-0.5 rounded-md font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30"
                          x-text="formatDecimal(rk.rookie_score, 1)"></span>
                  </td>

                  <td class="px-3 py-2.5 text-right font-mono tabular-nums text-[#0F172A] dark:text-[#FAFAFA]"
                      x-text="formatCeilingMetric(rk.follower_count, false)"></td>

                  <!-- Official Pinterest Business Label: Total audience (with 10M+ ceiling support) -->
                  <td class="px-3 py-2.5 text-right font-mono tabular-nums font-semibold text-[#0F172A] dark:text-[#FAFAFA]"
                      x-text="formatCeilingMetric(rk.monthly_reach, true)"></td>

                  <!-- Official Pinterest Business Label: Impressions (with 10M+ ceiling support) -->
                  <td class="px-3 py-2.5 text-right font-mono tabular-nums text-[#0F172A] dark:text-[#FAFAFA]"
                      x-text="formatCeilingMetric(rk.profile_views, true)"></td>

                  <td class="px-3 py-2.5 text-right font-mono tabular-nums font-semibold text-emerald-700 dark:text-emerald-400"
                      x-text="(rk.outlier_multiplier != null ? (formatDecimal(rk.outlier_multiplier, 1) + 'x') : '—')"></td>

                  <td class="px-3 py-2.5 text-right font-mono tabular-nums">
                    <button type="button"
                            @click="candidateFilters.search = rk.username; setRoom('candidates'); loadCandidates(true)"
                            class="px-2 py-0.5 rounded bg-[#F1F5F9] hover:bg-rose-500/10 dark:bg-[#18181B] text-[#0F172A] dark:text-[#FAFAFA] font-semibold cursor-pointer"
                            x-text="formatNum(rk.golden_pins_count) + ' golden'"></button>
                  </td>

                  <td class="px-3 py-2.5 max-w-[14rem]">
                    <div class="flex flex-wrap gap-1">
                      <template x-for="ann in (rk.top_annotations || []).slice(0, 3)" :key="rk.username + '-' + (ann.name || ann)">
                        <span class="px-1.5 py-0.5 rounded text-[10px] bg-[#F1F5F9] dark:bg-[#18181B] text-[#64748B] dark:text-[#A1A1AA] truncate max-w-[7rem]"
                              x-text="ann.name || ann"></span>
                      </template>
                    </div>
                  </td>

                  <td class="px-4 py-2.5 text-right">
                    <template x-if="rk.stage === 'promoted'">
                      <a :href="'/' + encodeURIComponent(rk.username)"
                         class="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 inline-flex items-center gap-1">
                        <span>Open in Creator Hub</span>
                        <i data-lucide="arrow-up-right" class="w-3 h-3"></i>
                      </a>
                    </template>
                    <template x-if="rk.stage !== 'promoted'">
                      <div class="inline-flex items-center gap-1">
                        <button type="button"
                                @click="promoteRookieAccount(rk.username, 'pulse_only')"
                                class="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[#E11D48] hover:bg-rose-500 text-white transition cursor-pointer">
                          Track Pulse
                        </button>
                        <button type="button"
                                @click="promoteRookieAccount(rk.username, 'full')"
                                class="px-2 py-1 rounded-lg text-[11px] font-semibold border border-[#E2E8F0] dark:border-[#27272A] bg-[#F1F5F9] dark:bg-[#18181B] text-[#0F172A] dark:text-[#FAFAFA] hover:bg-[#E2E8F0] transition cursor-pointer">
                          Full Sync
                        </button>
                      </div>
                    </template>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ====================================================================== -->
    <!-- ROOM: SEMANTIC CROSSOVER & BOARD BLUEPRINTS                            -->
    <!-- ====================================================================== -->
    <div x-show="currentRoom === 'crossover'" class="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <!-- Left (7 cols): Multi-Channel Crossover Matrix -->
      <div class="lg:col-span-7 bg-white dark:bg-[#121215] border border-[#E2E8F0] dark:border-[#27272A] rounded-2xl shadow-xs overflow-hidden flex flex-col">
        <div class="p-4 border-b border-[#E2E8F0] dark:border-[#27272A] flex flex-wrap items-center justify-between gap-3">
          <div>
            <span class="text-[11px] font-bold uppercase tracking-wider text-[#64748B] dark:text-[#A1A1AA]">Zero-Cookie pin_join + Board Title Alignment</span>
            <h2 class="text-sm font-bold text-[#0F172A] dark:text-[#FAFAFA]">Multi-Channel Semantic Crossover Matrix</h2>
          </div>
          <div class="flex items-center gap-2">
            <button type="button"
                    @click="crossoverGoldenOnly = !crossoverGoldenOnly; loadCrossover()"
                    class="px-2.5 py-1 rounded-lg text-xs font-semibold border transition cursor-pointer"
                    :class="crossoverGoldenOnly ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-[#F1F5F9] dark:bg-[#18181B] text-[#64748B] border-[#E2E8F0] dark:border-[#27272A]'">
              Golden Cohort Only
            </button>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead class="bg-[#F1F5F9] dark:bg-[#18181B] border-b border-[#E2E8F0] dark:border-[#27272A]">
              <tr>
                <th class="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#71717A]">Annotation / Sub-Niche</th>
                <th class="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#71717A] text-right">Conviction</th>
                <th class="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#71717A] text-right">Pins / Golden</th>
                <th class="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#71717A] text-right">Board Match</th>
                <th class="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#71717A] text-right">Linkless %</th>
                <th class="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#71717A] text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-[#F1F5F9] dark:divide-[#1E1E22] text-xs">
              <template x-if="crossoverClusters.length === 0">
                <tr>
                  <td colspan="6" class="px-4 py-8 text-center text-[#64748B] dark:text-[#A1A1AA]">
                    No crossover clusters synthesized yet. Hydrated candidate visual annotations will automatically cluster here.
                  </td>
                </tr>
              </template>
              <template x-for="cl in crossoverClusters" :key="'cx-' + cl.term">
                <tr class="hover:bg-[#F8FAFC] dark:hover:bg-[#18181B] transition-colors">
                  <td class="px-4 py-2.5">
                    <div class="font-semibold text-[#0F172A] dark:text-[#FAFAFA]" x-text="cl.display || cl.term"></div>
                    <template x-if="cl.sample_boards && cl.sample_boards.length > 0">
                      <div class="text-[10px] text-[#64748B] dark:text-[#A1A1AA] truncate max-w-[14rem]"
                           x-text="'Boards: ' + cl.sample_boards.join(', ')"></div>
                    </template>
                  </td>
                  <td class="px-3 py-2.5 text-right font-mono tabular-nums">
                    <span class="px-2 py-0.5 rounded font-bold bg-rose-50 text-[#9F1239] dark:bg-rose-500/15 dark:text-rose-300"
                          x-text="formatDecimal(cl.conviction_score, 1)"></span>
                  </td>
                  <td class="px-3 py-2.5 text-right font-mono tabular-nums text-[#0F172A] dark:text-[#FAFAFA]"
                      x-text="cl.pin_count + ' / ' + cl.golden_pin_count"></td>
                  <td class="px-3 py-2.5 text-right font-mono tabular-nums text-[#0F172A] dark:text-[#FAFAFA]"
                      x-text="cl.board_title_matches"></td>
                  <td class="px-3 py-2.5 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-400"
                      x-text="formatDecimal(cl.linkless_share_pct, 0) + '%'"></td>
                  <td class="px-4 py-2.5 text-right">
                    <div class="inline-flex items-center gap-1.5">
                      <button type="button"
                              @click="huntSingleSeed(cl.term)"
                              class="px-2 py-1 rounded-lg text-[11px] font-semibold bg-[#F1F5F9] hover:bg-[#E2E8F0] dark:bg-[#18181B] text-[#0F172A] dark:text-[#FAFAFA] cursor-pointer">
                        Hunt
                      </button>
                      <button type="button"
                              @click="trackKeywordDirectly(cl.term)"
                              class="px-2 py-1 rounded-lg text-[11px] font-semibold bg-[#E11D48] hover:bg-rose-500 text-white cursor-pointer">
                        + Keyword
                      </button>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Right (5 cols): Board & Spoke Pin Blueprint Synthesizer -->
      <div class="lg:col-span-5 bg-white dark:bg-[#121215] border border-[#E2E8F0] dark:border-[#27272A] rounded-2xl shadow-xs p-4 space-y-4">
        <div>
          <span class="text-[11px] font-bold uppercase tracking-wider text-[#64748B] dark:text-[#A1A1AA]">Actionable Publishing Architecture</span>
          <h3 class="text-sm font-bold text-[#0F172A] dark:text-[#FAFAFA]">Recommended Board Names &amp; Spoke Pin Titles</h3>
        </div>

        <template x-if="blueprintShowcasePins.length === 0">
          <p class="text-xs text-[#64748B] dark:text-[#A1A1AA] py-4">
            Candidate crossover blueprints appear automatically as pins are hydrated across surfaces.
          </p>
        </template>

        <div class="space-y-3 max-h-[38rem] overflow-y-auto pr-1">
          <template x-for="bpPin in blueprintShowcasePins" :key="'bp-' + bpPin.pin_id">
            <div class="p-3.5 rounded-xl bg-[#F8FAFC] dark:bg-[#18181B] border border-[#E2E8F0] dark:border-[#27272A] space-y-2">
              <div class="flex items-center justify-between gap-2">
                <span class="text-[11px] font-mono tabular-nums font-semibold text-emerald-700 dark:text-emerald-400"
                      x-text="'Golden ' + formatDecimal(bpPin.golden_score, 1) + ' • #' + bpPin.pin_id"></span>
                <template x-if="bpPin.is_linkless">
                  <span class="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-500/15 dark:text-amber-300">
                    Linkless Vacuum
                  </span>
                </template>
              </div>
              <div class="text-xs">
                <span class="text-[#64748B] dark:text-[#A1A1AA] font-medium">Recommended Board:</span>
                <span class="font-bold text-[#0F172A] dark:text-[#FAFAFA] ml-1" x-text="bpPin.crossover_blueprint?.recommended_board_name || bpPin.board_name || 'Trending Ideas'"></span>
              </div>
              <div class="text-xs">
                <span class="text-[#64748B] dark:text-[#A1A1AA] font-medium">Spoke Pin Title:</span>
                <span class="font-semibold text-[#0F172A] dark:text-[#FAFAFA] ml-1" x-text="bpPin.crossover_blueprint?.recommended_pin_title || bpPin.title"></span>
              </div>
              <template x-if="bpPin.crossover_blueprint?.recommended_slug">
                <div class="text-[11px] font-mono text-[#64748B] dark:text-[#A1A1AA]"
                     x-text="'Slug: /' + bpPin.crossover_blueprint.recommended_slug + '/'"></div>
              </template>
              <div class="flex flex-wrap gap-1 pt-1">
                <template x-for="anc in (bpPin.crossover_blueprint?.crossover_anchors || []).slice(0, 4)" :key="bpPin.pin_id + '-' + anc.term">
                  <span class="px-1.5 py-0.5 rounded text-[10px] font-mono border"
                        :class="anc.is_exact_crossover ? 'bg-rose-50 text-[#9F1239] border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30 font-semibold' : 'bg-white dark:bg-[#121215] text-[#64748B] border-[#E2E8F0] dark:border-[#27272A]'"
                        x-text="anc.display || anc.term"></span>
                </template>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- ====================================================================== -->
    <!-- ROOM: WATCHLIST, 01:00 UTC DAILY ANCHORS & EXECUTION RUN HISTORY       -->
    <!-- ====================================================================== -->
    <div x-show="currentRoom === 'watchlist'" class="space-y-4">
      <div class="p-4 rounded-2xl bg-white dark:bg-[#121215] border border-[#E2E8F0] dark:border-[#27272A] shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div class="bg-[#F1F5F9] dark:bg-[#18181B] p-1 rounded-xl border border-[#E2E8F0] dark:border-[#27272A] flex items-center gap-1">
          <button type="button"
                  @click="watchlistSubTab = 'queue'; loadWatchlistRoom()"
                  class="px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer"
                  :class="watchlistSubTab === 'queue' ? 'bg-white dark:bg-[#27272A] text-[#0F172A] dark:text-[#FAFAFA] shadow-2xs' : 'text-[#64748B] dark:text-[#A1A1AA]'">
            Staged Watchlist Queue
          </button>
          <button type="button"
                  @click="watchlistSubTab = 'anchors'; loadWatchlistRoom()"
                  class="px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer"
                  :class="watchlistSubTab === 'anchors' ? 'bg-white dark:bg-[#27272A] text-[#0F172A] dark:text-[#FAFAFA] shadow-2xs' : 'text-[#64748B] dark:text-[#A1A1AA]'">
            01:00 UTC Daily Anchors
          </button>
          <button type="button"
                  @click="watchlistSubTab = 'runs'; loadWatchlistRoom()"
                  class="px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer"
                  :class="watchlistSubTab === 'runs' ? 'bg-white dark:bg-[#27272A] text-[#0F172A] dark:text-[#FAFAFA] shadow-2xs' : 'text-[#64748B] dark:text-[#A1A1AA]'">
            Run History &amp; Diagnostics
          </button>
        </div>

        <div class="flex items-center gap-2">
          <button type="button"
                  @click="pollWatchlistNow()"
                  :disabled="isPollingWatchlist"
                  class="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-[#E11D48] hover:bg-rose-500 text-white transition inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50">
            <i data-lucide="refresh-cw" class="w-3.5 h-3.5" :class="isPollingWatchlist ? 'motion-safe:animate-spin' : ''"></i>
            <span x-text="isPollingWatchlist ? 'Polling Watchlist...' : 'Poll Watchlist Now'">Poll Watchlist Now</span>
          </button>
        </div>
      </div>

      <!-- Sub-View 1: Staged Watchlist Queue -->
      <div x-show="watchlistSubTab === 'queue'" class="bg-white dark:bg-[#121215] border border-[#E2E8F0] dark:border-[#27272A] rounded-2xl shadow-xs overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead class="bg-[#F1F5F9] dark:bg-[#18181B] border-b border-[#E2E8F0] dark:border-[#27272A]">
              <tr>
                <th class="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#71717A]">Watchlist Pin</th>
                <th class="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#71717A] text-right">Golden Score</th>
                <th class="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#71717A] text-right">Consecutive Days</th>
                <th class="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#71717A] text-right">Saves / Repins</th>
                <th class="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#71717A] text-right">24h Delta</th>
                <th class="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#71717A]">Last Polled</th>
                <th class="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#71717A] text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-[#F1F5F9] dark:divide-[#1E1E22] text-xs">
              <template x-if="watchlistPins.length === 0">
                <tr>
                  <td colspan="7" class="px-4 py-8 text-center text-[#64748B] dark:text-[#A1A1AA]">
                    No pins are currently staged in the Watchlist. Stage promising candidates from the Golden Candidates grid or enable Auto-Track in Settings.
                  </td>
                </tr>
              </template>
              <template x-for="wp in watchlistPins" :key="'wl-' + wp.pin_id">
                <tr class="hover:bg-[#F8FAFC] dark:hover:bg-[#18181B]">
                  <td class="px-4 py-2.5">
                    <div class="font-semibold text-[#0F172A] dark:text-[#FAFAFA]" x-text="wp.title || ('Pin #' + wp.pin_id)"></div>
                    <div class="text-[11px] font-mono text-[#64748B]" x-text="'#' + wp.pin_id + (wp.effective_creator_username ? (' • @' + wp.effective_creator_username) : '')"></div>
                  </td>
                  <td class="px-3 py-2.5 text-right font-mono tabular-nums font-bold text-emerald-700 dark:text-emerald-400"
                      x-text="formatDecimal(wp.golden_score, 1)"></td>
                  <td class="px-3 py-2.5 text-right font-mono tabular-nums">
                    <span class="px-2 py-0.5 rounded bg-sky-50 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300 font-semibold"
                          x-text="(wp.consecutive_qualifying_days || 0) + ' / ' + settingsDraft.automation.pin_promotion_rules.promote_thresholds.min_consecutive_days + 'd'"></span>
                  </td>
                  <td class="px-3 py-2.5 text-right font-mono tabular-nums text-[#0F172A] dark:text-[#FAFAFA]"
                      x-text="(wp.save_count != null ? formatCeilingMetric(wp.save_count, true) : '—') + ' / ' + (wp.repin_count != null ? formatCeilingMetric(wp.repin_count, true) : '—')"></td>
                  <td class="px-3 py-2.5 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-400"
                      x-text="'+' + formatNullableInt(wp.daily_repin_delta) + ' repins'"></td>
                  <td class="px-3 py-2.5 font-mono tabular-nums text-[11px] text-[#64748B]"
                      x-text="formatIsoShort(wp.last_polled_at || wp.watchlist_added_at)"></td>
                  <td class="px-4 py-2.5 text-right">
                    <div class="inline-flex items-center gap-1.5">
                      <button type="button"
                              @click="openPromoteModal([wp])"
                              class="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[#E11D48] hover:bg-rose-500 text-white cursor-pointer">
                        Promote
                      </button>
                      <button type="button"
                              @click="bulkSetCandidateStage([wp.pin_id], 'discovered')"
                              class="px-2 py-1 rounded-lg text-[11px] text-[#64748B] hover:text-[#0F172A] dark:hover:text-[#FAFAFA] cursor-pointer">
                        Unstage
                      </button>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Sub-View 2: 01:00 UTC Standalone Daily Velocity Anchors -->
      <div x-show="watchlistSubTab === 'anchors'" class="bg-white dark:bg-[#121215] border border-[#E2E8F0] dark:border-[#27272A] rounded-2xl shadow-xs overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead class="bg-[#F1F5F9] dark:bg-[#18181B] border-b border-[#E2E8F0] dark:border-[#27272A]">
              <tr>
                <th class="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#71717A]">Anchored SSOT Pin</th>
                <th class="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#71717A]">Source / Seed</th>
                <th class="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#71717A] text-right">SSOT Saves</th>
                <th class="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#71717A] text-right">24h Save Velocity</th>
                <th class="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#71717A]">Promoted</th>
                <th class="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#71717A]">Last 01:00 UTC Crawl</th>
                <th class="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#71717A] text-right">Dossier</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-[#F1F5F9] dark:divide-[#1E1E22] text-xs">
              <template x-if="dailyAnchors.length === 0">
                <tr>
                  <td colspan="7" class="px-4 py-8 text-center text-[#64748B] dark:text-[#A1A1AA]">
                    No active 01:00 UTC Daily Anchors yet. Promoting any Newborn pin automatically anchors it into the daily velocity crawler even without a SERP keyword.
                  </td>
                </tr>
              </template>
              <template x-for="anc in dailyAnchors" :key="'anc-' + anc.pin_id">
                <tr class="hover:bg-[#F8FAFC] dark:hover:bg-[#18181B]">
                  <td class="px-4 py-2.5">
                    <div class="font-semibold text-[#0F172A] dark:text-[#FAFAFA]" x-text="anc.title || ('Pin #' + anc.pin_id)"></div>
                    <div class="text-[11px] font-mono text-[#64748B]" x-text="'#' + anc.pin_id + (anc.clean_domain ? (' • ' + anc.clean_domain) : ' • Linkless')"></div>
                  </td>
                  <td class="px-3 py-2.5 font-mono text-[11px] text-[#64748B] dark:text-[#A1A1AA]"
                      x-text="(anc.source || 'manual') + (anc.seed_query ? (' • ' + anc.seed_query) : '')"></td>
                  <td class="px-3 py-2.5 text-right font-mono tabular-nums font-semibold text-[#0F172A] dark:text-[#FAFAFA]"
                      x-text="anc.save_count != null ? formatCeilingMetric(anc.save_count, false) : '—'"></td>
                  <td class="px-3 py-2.5 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-400 font-semibold"
                      x-text="anc.daily_save_velocity != null ? ('+' + formatDecimal(anc.daily_save_velocity, 1) + '/d') : '0/d'"></td>
                  <td class="px-3 py-2.5 font-mono tabular-nums text-[11px] text-[#64748B]"
                      x-text="formatIsoShort(anc.promoted_at)"></td>
                  <td class="px-3 py-2.5 font-mono tabular-nums text-[11px] text-[#64748B]"
                      x-text="formatIsoShort(anc.last_crawled_at)"></td>
                  <td class="px-4 py-2.5 text-right">
                    <a :href="'/pin/' + encodeURIComponent(anc.pin_id)"
                       class="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[#F1F5F9] hover:bg-[#E2E8F0] dark:bg-[#18181B] text-[#0F172A] dark:text-[#FAFAFA]">
                      Open Pin
                    </a>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Sub-View 3: Execution Run History & Two-Zone Router Telemetry -->
      <div x-show="watchlistSubTab === 'runs'" class="bg-white dark:bg-[#121215] border border-[#E2E8F0] dark:border-[#27272A] rounded-2xl shadow-xs overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead class="bg-[#F1F5F9] dark:bg-[#18181B] border-b border-[#E2E8F0] dark:border-[#27272A]">
              <tr>
                <th class="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#71717A]">Run # &amp; Type</th>
                <th class="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#71717A]">Status</th>
                <th class="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#71717A]">Cookie Mode</th>
                <th class="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#71717A]">Surfaces Used</th>
                <th class="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#71717A] text-right">Discovered / Golden</th>
                <th class="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#71717A] text-right">Snowball Hops</th>
                <th class="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#71717A] text-right">Started At</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-[#F1F5F9] dark:divide-[#1E1E22] text-xs">
              <template x-if="runHistory.length === 0">
                <tr>
                  <td colspan="7" class="px-4 py-8 text-center text-[#64748B] dark:text-[#A1A1AA]">
                    No Newborn discovery or watchlist poll runs recorded yet.
                  </td>
                </tr>
              </template>
              <template x-for="rn in runHistory" :key="'run-' + rn.id">
                <tr class="hover:bg-[#F8FAFC] dark:hover:bg-[#18181B]">
                  <td class="px-4 py-2.5 font-mono tabular-nums font-semibold text-[#0F172A] dark:text-[#FAFAFA]"
                      x-text="'#' + rn.id + ' • ' + rn.run_type"></td>
                  <td class="px-3 py-2.5">
                    <span class="px-2 py-0.5 rounded text-[10px] font-mono font-semibold border"
                          :class="rn.status === 'completed' ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300' : (rn.status === 'failed' ? 'bg-rose-50 text-[#9F1239] border-rose-200 dark:bg-rose-500/15 dark:text-rose-300' : 'bg-amber-50 text-amber-800 border-amber-200')"
                          x-text="rn.status"></span>
                  </td>
                  <td class="px-3 py-2.5 font-mono text-[11px] text-[#64748B] dark:text-[#A1A1AA]"
                      x-text="rn.cookie_mode"></td>
                  <td class="px-3 py-2.5 max-w-[16rem]">
                    <div class="flex flex-wrap gap-1">
                      <template x-for="sfName in (rn.surfaces_used || [])" :key="rn.id + '-' + sfName">
                        <span class="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[#F1F5F9] dark:bg-[#18181B] text-[#64748B] dark:text-[#A1A1AA]"
                              x-text="sfName"></span>
                      </template>
                    </div>
                  </td>
                  <td class="px-3 py-2.5 text-right font-mono tabular-nums text-[#0F172A] dark:text-[#FAFAFA]"
                      x-text="formatNum(rn.candidates_discovered) + ' / ' + formatNum(rn.golden_pins_count)"></td>
                  <td class="px-3 py-2.5 text-right font-mono tabular-nums text-[#64748B]"
                      x-text="rn.snowball_hops_executed || 0"></td>
                  <td class="px-4 py-2.5 text-right font-mono tabular-nums text-[11px] text-[#64748B]"
                      x-text="formatIsoShort(rn.started_at)"></td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </div>
    </div>
`;
}
