/**
 * Creator Hub — View B Sub-View 1: Overview & Performance Trends
 */
export function renderCreatorsProfileOverview() {
  return `          <!-- ======================================================== -->
          <!-- SUB-VIEW 1: OVERVIEW & PERFORMANCE TRENDS (Images 1 & 2)  -->
          <!-- ======================================================== -->
          <div x-show="activeCreatorTab === 'overview'" class="space-y-6">
            
            <!-- Analytics Engine Time Range Bar (Image 1) -->
            <div class="rounded-2xl border border-slate-200/90 dark:border-[#27272A] bg-white dark:bg-[#18181B] p-3.5 sm:px-5 sm:py-3 shadow-xs flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              
              <!-- Quick Time Range Segmented Buttons (Default 7D) -->
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-xs font-bold text-slate-500 dark:text-slate-400 mr-1 flex items-center gap-1">
                  <i data-lucide="clock" class="w-3.5 h-3.5"></i>
                  <span>Time Range:</span>
                </span>
                <div class="flex items-center bg-slate-100 dark:bg-slate-900 p-0.5 rounded-xl border border-slate-200 dark:border-[#27272A]">
                  <button @click="creatorTimeRange = '7D'" class="rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer" :class="creatorTimeRange === '7D' ? 'bg-white dark:bg-[#121215] text-slate-900 dark:text-white shadow-2xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'">7D</button>
                  <button @click="creatorTimeRange = '30D'" class="rounded-lg px-2.5 py-1 text-xs font-semibold transition cursor-pointer" :class="creatorTimeRange === '30D' ? 'bg-white dark:bg-[#121215] text-slate-900 dark:text-white shadow-2xs font-bold' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'">30D</button>
                  <button @click="creatorTimeRange = '90D'" class="rounded-lg px-2.5 py-1 text-xs font-semibold transition cursor-pointer" :class="creatorTimeRange === '90D' ? 'bg-white dark:bg-[#121215] text-slate-900 dark:text-white shadow-2xs font-bold' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'">90D</button>
                  <button @click="creatorTimeRange = 'YTD'" class="rounded-lg px-2.5 py-1 text-xs font-semibold transition cursor-pointer" :class="creatorTimeRange === 'YTD' ? 'bg-white dark:bg-[#121215] text-slate-900 dark:text-white shadow-2xs font-bold' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'">YTD</button>
                  <button @click="creatorTimeRange = 'ALL'" class="rounded-lg px-2.5 py-1 text-xs font-semibold transition cursor-pointer" :class="creatorTimeRange === 'ALL' ? 'bg-white dark:bg-[#121215] text-slate-900 dark:text-white shadow-2xs font-bold' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'">ALL</button>
                </div>
              </div>

              <!-- Month Picker & MoM Comparison Toggle -->
              <div class="flex items-center gap-2.5 flex-wrap">
                <div class="flex items-center gap-1.5">
                  <label class="text-xs font-bold text-slate-500 dark:text-slate-400">Month:</label>
                  <select x-model="creatorSelectedMonth" class="h-8 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-slate-900 px-3 text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer">
                    <option value="all">All Months</option>
                    <template x-for="m in availableCreatorMonths" :key="m">
                      <option :value="m" x-text="m"></option>
                    </template>
                  </select>
                </div>

                <button @click="creatorMoMMode = !creatorMoMMode" type="button" class="inline-flex h-8 items-center gap-1.5 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 px-3 text-xs font-semibold text-slate-700 dark:text-slate-300 shadow-2xs transition cursor-pointer">
                  <i data-lucide="bar-chart-2" class="w-3.5 h-3.5 text-rose-500"></i>
                  <span>Compare Months</span>
                </button>
              </div>
            </div>

            <!-- Month-over-Month Comparison Engine Panel -->
            <div x-show="creatorMoMMode" class="rounded-2xl border border-rose-500/30 bg-rose-500/5 dark:bg-rose-500/10 p-5 shadow-xs space-y-4 animate-in fade-in duration-200">
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-rose-500/20 pb-3.5">
                <div class="flex items-center gap-2.5">
                  <div class="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-500/10 text-rose-500 border border-rose-500/20">
                    <i data-lucide="bar-chart-2" class="w-4 h-4"></i>
                  </div>
                  <div>
                    <h3 class="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">Month-over-Month Comparison Engine</h3>
                    <p class="text-[11px] text-slate-500">Select two distinct months to compute exact growth deltas and percentage shifts.</p>
                  </div>
                </div>

                <div class="flex items-center gap-2.5 flex-wrap">
                  <div class="flex items-center gap-1.5">
                    <label class="text-xs font-semibold text-slate-500">Base (A):</label>
                    <select x-model="creatorMoMBaseMonth" class="h-8 rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] px-2.5 text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer">
                      <template x-for="m in availableCreatorMonths" :key="'base-' + m">
                        <option :value="m" x-text="m"></option>
                      </template>
                    </select>
                  </div>
                  <span class="text-xs font-bold text-slate-400">vs</span>
                  <div class="flex items-center gap-1.5">
                    <label class="text-xs font-semibold text-slate-500">Target (B):</label>
                    <select x-model="creatorMoMTargetMonth" class="h-8 rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] px-2.5 text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer">
                      <template x-for="m in availableCreatorMonths" :key="'target-' + m">
                        <option :value="m" x-text="m"></option>
                      </template>
                    </select>
                  </div>
                </div>
              </div>
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div class="bg-white dark:bg-[#18181B] p-3 rounded-xl border border-slate-200 dark:border-[#27272A]">
                  <div class="text-[10px] text-slate-400 font-bold uppercase">Total Audience Shift</div>
                  <div class="text-sm font-extrabold mt-1 font-mono tabular-nums" :class="creatorMoMStats.reach.diff >= 0 ? 'text-emerald-500' : 'text-rose-500'" x-text="(creatorMoMStats.reach.diff >= 0 ? '+' : '') + formatNumber(creatorMoMStats.reach.diff) + ' (' + (creatorMoMStats.reach.pct >= 0 ? '+' : '') + creatorMoMStats.reach.pct + '%)'"></div>
                </div>
                <div class="bg-white dark:bg-[#18181B] p-3 rounded-xl border border-slate-200 dark:border-[#27272A]">
                  <div class="text-[10px] text-slate-400 font-bold uppercase">Impressions Shift</div>
                  <div class="text-sm font-extrabold mt-1 font-mono tabular-nums" :class="creatorMoMStats.views.diff >= 0 ? 'text-sky-500' : 'text-rose-500'" x-text="(creatorMoMStats.views.diff >= 0 ? '+' : '') + formatNumber(creatorMoMStats.views.diff) + ' (' + (creatorMoMStats.views.pct >= 0 ? '+' : '') + creatorMoMStats.views.pct + '%)'"></div>
                </div>
                <div class="bg-white dark:bg-[#18181B] p-3 rounded-xl border border-slate-200 dark:border-[#27272A]">
                  <div class="text-[10px] text-slate-400 font-bold uppercase">Followers Shift</div>
                  <div class="text-sm font-extrabold mt-1 font-mono tabular-nums" :class="creatorMoMStats.followers.diff >= 0 ? 'text-purple-500' : 'text-rose-500'" x-text="(creatorMoMStats.followers.diff >= 0 ? '+' : '') + formatNumber(creatorMoMStats.followers.diff) + ' (' + (creatorMoMStats.followers.pct >= 0 ? '+' : '') + creatorMoMStats.followers.pct + '%)'"></div>
                </div>
                <div class="bg-white dark:bg-[#18181B] p-3 rounded-xl border border-slate-200 dark:border-[#27272A]">
                  <div class="text-[10px] text-slate-400 font-bold uppercase">Total Pins Shift</div>
                  <div class="text-sm font-extrabold mt-1 font-mono tabular-nums" :class="creatorMoMStats.pins.diff >= 0 ? 'text-emerald-500' : 'text-rose-500'" x-text="(creatorMoMStats.pins.diff >= 0 ? '+' : '') + formatNumber(creatorMoMStats.pins.diff) + ' (' + (creatorMoMStats.pins.pct >= 0 ? '+' : '') + creatorMoMStats.pins.pct + '%)'"></div>
                </div>
              </div>
            </div>

            <!-- Performance Trend & Pinning Velocity (2-Col Grid, Image 1) -->
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              <!-- Performance Trend SVG Spline Card (2 Cols) -->
              <div class="lg:col-span-2 rounded-2xl border border-slate-200/90 dark:border-[#27272A] bg-white dark:bg-[#18181B] p-5 sm:p-6 shadow-xs flex flex-col justify-between space-y-4">
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div class="flex items-center gap-2">
                    <h3 class="text-xs sm:text-sm font-extrabold tracking-wider uppercase text-slate-900 dark:text-white">PERFORMANCE TREND</h3>
                  </div>

                  <!-- Dynamic Metric Switcher Pills -->
                  <div class="flex items-center gap-1 bg-slate-100 dark:bg-slate-900 p-0.5 rounded-xl border border-slate-200 dark:border-[#27272A] overflow-x-auto self-start sm:self-auto">
                    <button @click="creatorChartMode = 'reach'" class="px-3 py-1 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer" :class="creatorChartMode === 'reach' ? 'bg-rose-500 text-white shadow-2xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'">Total audience</button>
                    <button @click="creatorChartMode = 'views'" class="px-3 py-1 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer" :class="creatorChartMode === 'views' ? 'bg-sky-500 text-white shadow-2xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'">Impressions</button>
                    <button @click="creatorChartMode = 'followers'" class="px-3 py-1 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer" :class="creatorChartMode === 'followers' ? 'bg-purple-500 text-white shadow-2xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'">Followers</button>
                    <button @click="creatorChartMode = 'pins'" class="px-3 py-1 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer" :class="creatorChartMode === 'pins' ? 'bg-emerald-500 text-white shadow-2xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'">Total Pins</button>
                    <button @click="creatorChartMode = 'dual'" class="px-3 py-1 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer" :class="creatorChartMode === 'dual' ? 'bg-indigo-600 text-white shadow-2xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'">Dual View</button>
                  </div>
                </div>

                <!-- Sub-header Meta Bar: Min/Max & Latest -->
                <div class="flex items-center justify-between text-xs border-b border-slate-200 dark:border-[#27272A] pb-2">
                  <div class="flex items-center gap-2 font-mono tabular-nums text-[11px] text-slate-500">
                    <span>Min: <strong class="text-slate-900 dark:text-white font-bold" x-text="formatNumber(creatorChartData.min)"></strong></span>
                    <span>•</span>
                    <span>Max: <strong class="text-slate-900 dark:text-white font-bold" x-text="formatNumber(creatorChartData.max)"></strong></span>
                  </div>
                  <div class="flex items-center gap-1.5">
                    <span class="inline-flex items-center gap-1 rounded-xl bg-slate-100 dark:bg-slate-900 px-2.5 py-1 text-xs font-mono tabular-nums font-bold text-slate-900 dark:text-white border border-slate-200 dark:border-[#27272A]">
                      <span class="text-slate-400 font-sans text-[11px]">Latest:</span>
                      <span x-text="formatNumber(creatorChartData.latest)"></span>
                    </span>
                  </div>
                </div>

                <!-- Dynamic SVG Spline Chart Canvas (Taste-Design Native SVG Namespace) -->
                <div class="relative w-full h-56 overflow-hidden">
                  <div x-show="!activeCreatorSnapshots || activeCreatorSnapshots.length === 0" class="w-full h-full flex items-center justify-center text-xs text-slate-400 font-sans">
                    No historical snapshot data recorded yet.
                  </div>
                  <div x-show="activeCreatorSnapshots && activeCreatorSnapshots.length > 0" class="w-full h-full">
                    <svg class="w-full h-full" viewBox="0 0 800 220" preserveAspectRatio="none">
                      <defs>
                        <linearGradient id="chartGradientRose" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stop-color="#f43f5e" stop-opacity="0.25"/>
                          <stop offset="100%" stop-color="#f43f5e" stop-opacity="0.0"/>
                        </linearGradient>
                        <linearGradient id="chartGradientSky" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stop-color="#0ea5e9" stop-opacity="0.25"/>
                          <stop offset="100%" stop-color="#0ea5e9" stop-opacity="0.0"/>
                        </linearGradient>
                      </defs>

                      <!-- Dual Series Mode -->
                      <g x-show="creatorChartData.dual">
                        <path :d="creatorChartData.areaPathA" fill="url(#chartGradientRose)" />
                        <path :d="creatorChartData.strokePathA" fill="none" stroke="#f43f5e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
                        <path :d="creatorChartData.strokePathB" fill="none" stroke="#0ea5e9" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
                        <g x-html="creatorChartData.svgPointsDualHtml"></g>
                      </g>

                      <!-- Single Series Mode -->
                      <g x-show="!creatorChartData.dual">
                        <path :d="creatorChartData.areaPath" :fill="creatorChartMode === 'views' ? 'url(#chartGradientSky)' : 'url(#chartGradientRose)'" />
                        <path :d="creatorChartData.strokePath" fill="none" :stroke="creatorChartMode === 'views' ? '#0ea5e9' : (creatorChartMode === 'followers' ? '#a855f7' : (creatorChartMode === 'pins' ? '#10b981' : '#f43f5e'))" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
                        <g x-html="creatorChartData.svgPointsHtml"></g>
                      </g>
                    </svg>
                  </div>
                </div>
              </div>

              <!-- Strategy Horizon Ledger Card (1 Col) -->
              <div class="rounded-2xl border border-slate-200/90 dark:border-[#27272A] bg-white dark:bg-[#18181B] p-5 sm:p-6 shadow-xs flex flex-col justify-between space-y-4">
                <div>
                  <div class="flex items-center justify-between mb-3">
                    <span class="text-[10.5px] font-mono tabular-nums uppercase tracking-wider text-slate-400 dark:text-slate-500 font-bold">Strategy Horizon</span>
                    <span class="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-mono tabular-nums font-bold text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-[#27272A]" x-text="(activeCreator.total_boards || activeCreatorBoards.length || 0) + ' Boards'"></span>
                  </div>
                  <div class="space-y-3">
                    <div class="flex items-center justify-between border-b border-slate-100 dark:border-[#27272A]/80 pb-2">
                      <span class="text-xs text-slate-500">Account Age:</span>
                      <span class="text-xs font-bold font-mono tabular-nums text-slate-900 dark:text-white tabular-nums" x-text="(activeCreatorDetail?.account_age?.days || activeCreatorDetail?.strategy_age?.days || 0) + ' Days'"></span>
                    </div>
                    <div class="flex items-center justify-between border-b border-slate-100 dark:border-[#27272A]/80 pb-2">
                      <span class="text-xs text-slate-500">Oldest Board Age:</span>
                      <span class="text-xs font-bold font-mono tabular-nums text-slate-900 dark:text-white tabular-nums" x-text="(activeCreatorDetail?.strategy_age?.days || 0) + ' Days'"></span>
                    </div>
                    <div class="flex items-center justify-between border-b border-slate-100 dark:border-[#27272A]/80 pb-2">
                      <span class="text-xs text-slate-500">Total Catalog Pins:</span>
                      <span class="text-xs font-bold font-mono tabular-nums text-slate-900 dark:text-white tabular-nums" x-text="formatNumber(activeCreator.total_pins || activeCreatorCatalogTotal || 0)"></span>
                    </div>
                    <div class="flex items-center justify-between">
                      <span class="text-xs text-slate-500">Pins Added (Horizon):</span>
                      <span class="text-xs font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400 tabular-nums" x-text="'+' + (activeCreatorDetail?.pinning_velocity?.pins_added || 0)"></span>
                    </div>
                  </div>
                </div>

                <div class="border-t border-slate-100 dark:border-[#27272A]/80 pt-3">
                  <div class="flex items-center justify-between text-[11px] text-slate-400 font-mono tabular-nums">
                    <span>Created:</span>
                    <span x-text="activeCreatorDetail?.account_age?.created_at || activeCreatorDetail?.strategy_age?.oldest_board_date || '—'"></span>
                  </div>
                </div>
              </div>
            </div>

            <!-- ═══ Unified 5-Cell Telemetry Ribbon (Taste-Design Standard) ═══ -->
            <div class="rounded-2xl border border-slate-200/90 dark:border-[#27272A] bg-white dark:bg-[#18181B] shadow-xs overflow-hidden">
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-slate-100 dark:divide-slate-800/80">
                
                <!-- Cell 1: Total Audience -->
                <div class="p-4 sm:p-5 flex flex-col justify-between space-y-2 hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition">
                  <div class="flex items-center justify-between">
                    <span class="text-[10px] font-mono tabular-nums uppercase tracking-wider text-slate-400 dark:text-slate-500 font-bold">Total audience</span>
                    <span class="rounded-full px-2 py-0.5 text-[10px] font-bold font-mono tabular-nums" :class="(activeCreatorDetail?.deltas?.reach?.change || 0) > 0 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'" x-text="((activeCreatorDetail?.deltas?.reach?.change || 0) > 0 ? '+' : '') + (activeCreatorDetail?.deltas?.reach?.percent || 0) + '%'"></span>
                  </div>
                  <div>
                    <div class="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white font-mono tabular-nums" x-text="formatNumber(activeCreator.monthly_reach || (activeCreatorSnapshots && activeCreatorSnapshots.length > 0 ? (activeCreatorSnapshots[activeCreatorSnapshots.length - 1].monthly_reach || activeCreatorSnapshots[0].monthly_reach) : 0) || 0)"></div>
                    <div class="mt-1 text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 font-medium">
                      <span class="h-1.5 w-1.5 rounded-full" :class="(activeCreatorDetail?.deltas?.reach?.change || 0) > 0 ? 'bg-emerald-500' : 'bg-slate-400'"></span>
                      <span x-text="(activeCreatorDetail?.deltas?.reach?.change || 0) !== 0 ? ((activeCreatorDetail?.deltas?.reach?.change || 0) > 0 ? '+' : '') + formatNumber(activeCreatorDetail?.deltas?.reach?.change) + ' vs prev' : 'Stable baseline'"></span>
                    </div>
                  </div>
                </div>

                <!-- Cell 2: Impressions -->
                <div class="p-4 sm:p-5 flex flex-col justify-between space-y-2 hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition">
                  <div class="flex items-center justify-between">
                    <span class="text-[10px] font-mono tabular-nums uppercase tracking-wider text-slate-400 dark:text-slate-500 font-bold">Impressions</span>
                    <span class="rounded-full px-2 py-0.5 text-[10px] font-bold font-mono tabular-nums" :class="(activeCreatorDetail?.deltas?.views?.change || 0) > 0 ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'" x-text="((activeCreatorDetail?.deltas?.views?.change || 0) > 0 ? '+' : '') + (activeCreatorDetail?.deltas?.views?.percent || 0) + '%'"></span>
                  </div>
                  <div>
                    <div class="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white font-mono tabular-nums" x-text="formatNumber(activeCreator.profile_views || (activeCreatorSnapshots && activeCreatorSnapshots.length > 0 ? (activeCreatorSnapshots[activeCreatorSnapshots.length - 1].profile_views || activeCreatorSnapshots[0].profile_views) : 0) || 0)"></div>
                    <div class="mt-1 text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 font-medium">
                      <span class="h-1.5 w-1.5 rounded-full" :class="(activeCreatorDetail?.deltas?.views?.change || 0) > 0 ? 'bg-sky-500' : 'bg-slate-400'"></span>
                      <span x-text="(activeCreatorDetail?.deltas?.views?.change || 0) !== 0 ? ((activeCreatorDetail?.deltas?.views?.change || 0) > 0 ? '+' : '') + formatNumber(activeCreatorDetail?.deltas?.views?.change) + ' vs prev' : 'Stable baseline'"></span>
                    </div>
                  </div>
                </div>

                <!-- Cell 3: Followers -->
                <div class="p-4 sm:p-5 flex flex-col justify-between space-y-2 hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition">
                  <div class="flex items-center justify-between">
                    <span class="text-[10px] font-mono tabular-nums uppercase tracking-wider text-slate-400 dark:text-slate-500 font-bold">Followers</span>
                    <span class="rounded-full px-2 py-0.5 text-[10px] font-bold font-mono tabular-nums" :class="(activeCreatorDetail?.deltas?.followers?.change || 0) > 0 ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'" x-text="((activeCreatorDetail?.deltas?.followers?.change || 0) > 0 ? '+' : '') + (activeCreatorDetail?.deltas?.followers?.percent || 0) + '%'"></span>
                  </div>
                  <div>
                    <div class="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white font-mono tabular-nums" x-text="formatNumber(activeCreator.follower_count || 0)"></div>
                    <div class="mt-1 text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 font-medium">
                      <span class="h-1.5 w-1.5 rounded-full" :class="(activeCreatorDetail?.deltas?.followers?.change || 0) > 0 ? 'bg-purple-500' : 'bg-slate-400'"></span>
                      <span x-text="(activeCreatorDetail?.deltas?.followers?.change || 0) !== 0 ? ((activeCreatorDetail?.deltas?.followers?.change || 0) > 0 ? '+' : '') + formatNumber(activeCreatorDetail?.deltas?.followers?.change) + ' vs prev' : 'Stable baseline'"></span>
                    </div>
                  </div>
                </div>

                <!-- Cell 4: Pinning Velocity -->
                <div class="p-4 sm:p-5 flex flex-col justify-between space-y-2 hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition">
                  <div class="flex items-center justify-between">
                    <span class="text-[10px] font-mono tabular-nums uppercase tracking-wider text-slate-400 dark:text-slate-500 font-bold">Output Velocity</span>
                    <span class="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400 border border-amber-500/20 font-mono tabular-nums" x-text="(activeCreatorDetail?.pinning_velocity?.days_span || 20) + 'd span'"></span>
                  </div>
                  <div>
                    <div class="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white font-mono tabular-nums" x-text="(activeCreatorDetail?.pinning_velocity?.pins_per_day || '0.0') + ' Pins/Day'"></div>
                    <div class="mt-1 text-[11px] text-rose-500 font-mono tabular-nums font-semibold" x-text="'~' + (activeCreatorDetail?.pinning_velocity?.pacing_estimate || 0) + ' pins/mo pacing'"></div>
                  </div>
                </div>

                <!-- Cell 5: 24H Saves Gain & Cumulative Virality -->
                <div class="p-4 sm:p-5 flex flex-col justify-between space-y-2 hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition">
                  <div class="flex items-center justify-between">
                    <span class="text-[10px] font-mono tabular-nums uppercase tracking-wider text-slate-400 dark:text-slate-500 font-bold">24H Saves Gain</span>
                    <span class="text-[10px] font-mono tabular-nums text-slate-400" x-text="formatNumber(activeCreatorDetail?.engagement?.total_saves || 0) + ' total'"></span>
                  </div>
                  <div>
                    <div class="text-xl sm:text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 font-mono tabular-nums" x-text="activeCreatorDetail?.engagement?.delta_saves_24h != null ? ((activeCreatorDetail.engagement.delta_saves_24h >= 0 ? '+' : '') + formatNumber(activeCreatorDetail.engagement.delta_saves_24h)) : '—'"></div>
                    <div class="mt-1 text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 font-medium">
                      <span class="h-1.5 w-1.5 rounded-full" :class="activeCreatorDetail?.engagement?.delta_saves_24h != null ? 'bg-emerald-500' : 'bg-slate-400'"></span>
                      <span x-text="activeCreatorDetail?.engagement?.delta_saves_24h != null ? 'Past 24h viral velocity' : 'Baseline recorded'"></span>
                    </div>
                  </div>
                </div>

              </div>
            </div>

            <!-- Import History & Snapshot Log Table (Image 2) -->
            <div class="rounded-2xl border border-slate-200/90 dark:border-[#27272A] bg-white dark:bg-[#18181B] shadow-xs overflow-hidden">
              <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200 dark:border-[#27272A] px-5 py-3 bg-slate-50/50 dark:bg-slate-900/40">
                <div>
                  <h2 class="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">Import History &amp; Snapshot Log</h2>
                  <p class="text-[11px] text-slate-500">Historical snapshot log with customizable timeframe, comfortable density, and column toggles.</p>
                </div>

                <div class="flex items-center gap-2.5 flex-wrap self-start sm:self-auto">
                  <div class="flex items-center rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] p-0.5 shadow-2xs">
                    <!-- Format Toggle -->
                    <button @click="creatorSnapNumFmt = creatorSnapNumFmt === 'full' ? 'compact' : 'full'" class="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white transition cursor-pointer">
                      <span class="text-[10px] font-mono tabular-nums">#</span>
                      <span x-text="creatorSnapNumFmt === 'full' ? 'Full' : 'Compact'"></span>
                    </button>

                    <div class="h-3.5 w-px bg-slate-200 dark:border-[#27272A] my-auto"></div>

                    <!-- Density Toggle -->
                    <button @click="creatorSnapDensity = creatorSnapDensity === 'compact' ? 'comfortable' : 'compact'" class="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white transition cursor-pointer">
                      <i data-lucide="menu" class="w-3.5 h-3.5"></i>
                      <span x-text="creatorSnapDensity === 'compact' ? 'Compact' : 'Full'"></span>
                    </button>

                    <div class="h-3.5 w-px bg-slate-200 dark:border-[#27272A] my-auto"></div>

                    <!-- Page Size Dropdown -->
                    <div class="flex items-center px-1.5">
                      <select x-model="creatorSnapTimeframe" class="bg-transparent text-xs font-semibold text-slate-600 dark:text-slate-300 focus:outline-none cursor-pointer">
                        <option value="7">7 Snapshots (7 Days)</option>
                        <option value="14">14 Snapshots (14 Days)</option>
                        <option value="30">30 Snapshots (30 Days)</option>
                        <option value="all">All Snapshots</option>
                      </select>
                    </div>

                    <div class="h-3.5 w-px bg-slate-200 dark:border-[#27272A] my-auto"></div>

                    <!-- Columns Dropdown -->
                    <div class="relative">
                      <button @click="isSnapColsOpen = !isSnapColsOpen" type="button" class="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white transition cursor-pointer">
                        <i data-lucide="eye" class="w-3.5 h-3.5 text-rose-500"></i>
                        <span>Columns</span>
                        <i data-lucide="chevron-down" class="w-3 h-3 text-slate-400"></i>
                      </button>
                      <div x-show="isSnapColsOpen" @click.outside="isSnapColsOpen = false" class="absolute right-0 top-full mt-1.5 z-30 w-48 rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] shadow-xl p-2 space-y-1">
                        <label class="flex items-center gap-2 px-2 py-1 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                          <input type="checkbox" x-model="creatorSnapColVisible.reach" class="rounded border-slate-300 text-rose-500" />
                          <span>Total audience</span>
                        </label>
                        <label class="flex items-center gap-2 px-2 py-1 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                          <input type="checkbox" x-model="creatorSnapColVisible.views" class="rounded border-slate-300 text-rose-500" />
                          <span>Impressions</span>
                        </label>
                        <label class="flex items-center gap-2 px-2 py-1 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                          <input type="checkbox" x-model="creatorSnapColVisible.pins" class="rounded border-slate-300 text-rose-500" />
                          <span>Total Pins</span>
                        </label>
                      </div>
                    </div>
                  </div>

                  <span class="inline-flex items-center rounded-xl bg-rose-500/10 px-3 py-1 text-xs font-bold text-rose-600 dark:text-rose-400 border border-rose-500/20" x-text="activeCreatorSnapshots.length + ' Snapshots'"></span>
                </div>
              </div>

              <!-- Snapshots Table -->
              <div class="overflow-x-auto min-w-full">
                <table class="w-full text-left text-xs border-collapse">
                  <thead class="sticky top-0 z-10 border-b border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 font-semibold">
                    <tr>
                      <th class="py-3 px-5">Recorded Date &amp; Time</th>
                      <th x-show="creatorSnapColVisible.reach" class="py-3 px-4 text-right">Total audience</th>
                      <th x-show="creatorSnapColVisible.views" class="py-3 px-4 text-right">Impressions</th>
                      <th x-show="creatorSnapColVisible.pins" class="py-3 px-4 text-right">Total Pins</th>
                      <th class="py-3 px-5 text-right">Actions</th>
                    </tr>
                    <!-- Summary Row (Σ Net Change) -->
                    <tr class="bg-slate-100/60 dark:bg-slate-800/40 font-bold border-b border-slate-200 dark:border-[#27272A]">
                      <td class="py-2.5 px-5 text-slate-900 dark:text-white font-mono tabular-nums">Σ Net Change</td>
                      <td x-show="creatorSnapColVisible.reach" class="py-2.5 px-4 text-right text-slate-700 dark:text-slate-300 font-mono tabular-nums" x-text="creatorSnapshotsNetChange.reach"></td>
                      <td x-show="creatorSnapColVisible.views" class="py-2.5 px-4 text-right text-slate-700 dark:text-slate-300 font-mono tabular-nums" x-text="creatorSnapshotsNetChange.views"></td>
                      <td x-show="creatorSnapColVisible.pins" class="py-2.5 px-4 text-right font-mono tabular-nums" :class="creatorSnapshotsNetChange.pins.startsWith('(-') ? 'text-rose-500' : 'text-emerald-500'" x-text="creatorSnapshotsNetChange.pins"></td>
                      <td class="py-2.5 px-5 text-right text-slate-400 font-mono tabular-nums"></td>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono tabular-nums">
                    <template x-for="(s, idx) in paginatedCreatorSnapshots" :key="s.id || idx">
                      <tr class="hover:bg-slate-50/80 dark:hover:bg-slate-900/40 transition group" :class="creatorSnapDensity === 'comfortable' ? 'py-4' : 'py-2.5'">
                        <td class="px-5 font-sans text-slate-700 dark:text-slate-300 font-medium" :class="creatorSnapDensity === 'comfortable' ? 'py-4' : 'py-2.5'" x-text="formatSnapshotDate(s.recorded_date || s.created_at)"></td>
                        <td x-show="creatorSnapColVisible.reach" class="px-4 text-right" :class="creatorSnapDensity === 'comfortable' ? 'py-4' : 'py-2.5'">
                          <div class="inline-flex items-center justify-end gap-1.5">
                            <span class="font-extrabold text-slate-900 dark:text-white" x-text="formatNumber(s.monthly_reach)"></span>
                            <template x-if="s.delta_reach !== undefined">
                              <span class="font-bold text-[10.5px]" :class="(s.delta_reach || 0) > 0 ? 'text-emerald-500' : ((s.delta_reach || 0) < 0 ? 'text-rose-500' : 'text-slate-400')" x-text="(s.delta_reach || 0) > 0 ? '(+' + formatNumber(s.delta_reach) + ')' : ((s.delta_reach || 0) < 0 ? '(' + formatNumber(s.delta_reach) + ')' : '(0)')"></span>
                            </template>
                          </div>
                        </td>
                        <td x-show="creatorSnapColVisible.views" class="px-4 text-right" :class="creatorSnapDensity === 'comfortable' ? 'py-4' : 'py-2.5'">
                          <div class="inline-flex items-center justify-end gap-1.5">
                            <span class="font-extrabold text-slate-900 dark:text-white" x-text="formatNumber(s.profile_views)"></span>
                            <template x-if="s.delta_views !== undefined">
                              <span class="font-bold text-[10.5px]" :class="(s.delta_views || 0) > 0 ? 'text-emerald-500' : ((s.delta_views || 0) < 0 ? 'text-rose-500' : 'text-slate-400')" x-text="(s.delta_views || 0) > 0 ? '(+' + formatNumber(s.delta_views) + ')' : ((s.delta_views || 0) < 0 ? '(' + formatNumber(s.delta_views) + ')' : '(0)')"></span>
                            </template>
                          </div>
                        </td>
                        <td x-show="creatorSnapColVisible.pins" class="px-4 text-right" :class="creatorSnapDensity === 'comfortable' ? 'py-4' : 'py-2.5'">
                          <div class="inline-flex items-center justify-end gap-1.5">
                            <span class="font-extrabold text-slate-900 dark:text-white" x-text="formatNumber(s.total_pins)"></span>
                            <template x-if="s.delta_pins !== undefined">
                              <span class="font-bold text-[10.5px]" :class="(s.delta_pins || 0) > 0 ? 'text-emerald-500' : ((s.delta_pins || 0) < 0 ? 'text-rose-500' : 'text-slate-400')" x-text="(s.delta_pins || 0) > 0 ? '(+' + formatNumber(s.delta_pins) + ')' : ((s.delta_pins || 0) < 0 ? '(' + formatNumber(s.delta_pins) + ')' : '(0)')"></span>
                            </template>
                          </div>
                        </td>
                        <td class="px-5 text-right" :class="creatorSnapDensity === 'comfortable' ? 'py-4' : 'py-2.5'">
                          <button @click="deleteSnapshotAction(s.id)" class="p-1 rounded text-slate-400 hover:text-rose-500 transition cursor-pointer opacity-20 group-hover:opacity-100" title="Delete snapshot">
                            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                          </button>
                        </td>
                      </tr>
                    </template>
                  </tbody>
                </table>
              </div>

              <!-- Snapshots Pagination Footer Bar -->
              <div class="flex items-center justify-between border-t border-slate-200 dark:border-[#27272A] px-5 py-3 bg-slate-50/50 dark:bg-slate-900/30 text-xs text-slate-500">
                <span x-text="'Showing 1-' + paginatedCreatorSnapshots.length + ' of ' + activeCreatorSnapshots.length + ' snapshots'"></span>
                <div class="flex items-center gap-2">
                  <button @click="creatorSnapPage = Math.max(1, creatorSnapPage - 1)" :disabled="creatorSnapPage <= 1" class="rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] px-3 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 disabled:opacity-40 transition shadow-2xs cursor-pointer">Previous</button>
                  <span class="font-bold text-slate-900 dark:text-white" x-text="'Page ' + creatorSnapPage + ' of ' + Math.max(1, Math.ceil(activeCreatorSnapshots.length / (creatorSnapTimeframe === 'all' ? 100 : Number(creatorSnapTimeframe))))"></span>
                  <button @click="creatorSnapPage = creatorSnapPage + 1" :disabled="creatorSnapPage >= Math.ceil(activeCreatorSnapshots.length / (creatorSnapTimeframe === 'all' ? 100 : Number(creatorSnapTimeframe)))" class="rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] px-3 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 disabled:opacity-40 transition shadow-2xs cursor-pointer">Next</button>
                </div>
              </div>
            </div>

            <!-- Pinterest Board Strategy & Timeline Table (Image 2) -->
            <div class="rounded-2xl border border-slate-200/90 dark:border-[#27272A] bg-white dark:bg-[#18181B] shadow-xs overflow-hidden">
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-[#27272A] px-5 py-3.5 bg-slate-50/50 dark:bg-slate-900/40">
                <div>
                  <h2 class="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">Pinterest Board Strategy &amp; Timeline</h2>
                  <p class="text-[11px] text-slate-500">Search, filter, and sort competitor boards with pagination.</p>
                </div>

                <div class="flex items-center gap-2.5 flex-wrap self-start sm:self-auto">
                  <div class="relative">
                    <input
                      type="text"
                      x-model="creatorBoardSearch"
                      placeholder="Search boards..."
                      class="h-8.5 w-48 sm:w-56 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-slate-900 pl-8 pr-3 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none shadow-2xs"
                    />
                    <i data-lucide="search" class="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5"></i>
                  </div>

                  <select x-model="creatorBoardSort" class="h-8.5 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-slate-900 px-3 text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none shadow-2xs cursor-pointer">
                    <option value="most_pins">Sort by: Most Pins</option>
                    <option value="most_followers">Sort by: Most Followers</option>
                    <option value="recent_activity">Sort by: Recent Activity</option>
                    <option value="creation_date">Sort by: Creation Date</option>
                  </select>

                  <span class="inline-flex items-center rounded-xl bg-rose-500/10 px-3 py-1 text-xs font-bold text-rose-600 dark:text-rose-400 border border-rose-500/20" x-text="activeCreatorBoards.length + ' Boards'"></span>
                </div>
              </div>

              <!-- Boards Table Container -->
              <div class="overflow-x-auto min-w-full">
                <table class="w-full text-left text-xs border-collapse">
                  <thead class="sticky top-0 z-10 border-b border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 font-semibold">
                    <tr>
                      <th class="py-3 px-5">Board Name &amp; Description</th>
                      <th class="py-3 px-4">Created Date</th>
                      <th class="py-3 px-4">Last Activity</th>
                      <th class="py-3 px-4 text-right">Pin Count</th>
                      <th class="py-3 px-4 text-right">Followers</th>
                      <th class="py-3 px-5 text-right">Link</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono tabular-nums">
                    <template x-for="b in paginatedCreatorBoards" :key="b.id || b.board_id">
                      <tr class="hover:bg-slate-50/80 dark:hover:bg-slate-900/40 transition">
                        <td class="py-3 px-5 font-sans font-bold text-slate-900 dark:text-white">
                          <button type="button" @click="openBoardPage(b, activeCreator)" class="text-left font-bold text-slate-900 dark:text-white hover:text-rose-500 dark:hover:text-rose-400 transition cursor-pointer flex items-center gap-1.5 group">
                            <span class="line-clamp-1" x-text="b.name"></span>
                            <i data-lucide="arrow-right" class="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-rose-500"></i>
                          </button>
                          <div class="text-[10px] text-slate-400 font-normal mt-0.5" x-text="b.description || 'Public Pinterest Board'"></div>
                        </td>
                        <td class="py-3 px-4 font-sans text-slate-500" x-text="b.created_at ? new Date(b.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'"></td>
                        <td class="py-3 px-4 font-sans text-slate-500" x-text="b.last_pinned_at ? new Date(b.last_pinned_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'"></td>
                        <td class="py-3 px-4 text-right font-bold text-slate-900 dark:text-white" x-text="formatNumber(b.pin_count)"></td>
                        <td class="py-3 px-4 text-right font-bold text-slate-700 dark:text-slate-300" x-text="formatNumber(b.follower_count || 0)"></td>
                        <td class="py-3 px-5 text-right font-sans">
                          <div class="inline-flex items-center gap-2 justify-end">
                            <button type="button" @click="openBoardPage(b, activeCreator)" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-purple-500/30 bg-purple-500/10 text-purple-600 dark:text-purple-400 text-[11px] font-bold hover:bg-purple-500/20 transition cursor-pointer" title="Open Dedicated Board Page">
                              <i data-lucide="layout-grid" class="w-3 h-3"></i>
                              <span>Inspect</span>
                            </button>
                            <button type="button" @click="crawlSingleBoardGha(b.name)" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400 text-[11px] font-bold hover:bg-sky-500/20 transition cursor-pointer" title="Crawl this board on GitHub Actions">
                              <i data-lucide="zap" class="w-3 h-3"></i>
                              <span>Crawl</span>
                            </button>
                            <a :href="safeUrl(b.url || ('https://www.pinterest.com/' + (activeCreator.username || '').replace(/^@+/, '') + '/' + encodeURIComponent((b.name || '').toLowerCase().replace(/\s+/g, '-'))))" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 font-semibold text-rose-500 hover:underline">
                              <span>Board</span>
                              <i data-lucide="external-link" class="w-3 h-3"></i>
                            </a>
                          </div>
                        </td>
                      </tr>
                    </template>
                  </tbody>
                </table>
              </div>

              <!-- Boards Pagination Footer Bar -->
              <div class="flex items-center justify-between border-t border-slate-200 dark:border-[#27272A] px-5 py-3 bg-slate-50/50 dark:bg-slate-900/30 text-xs text-slate-500">
                <span x-text="'Showing 1-' + paginatedCreatorBoards.length + ' of ' + activeCreatorBoards.length + ' boards'"></span>
                <div class="flex items-center gap-2">
                  <button @click="creatorBoardPage = Math.max(1, creatorBoardPage - 1)" :disabled="creatorBoardPage <= 1" class="rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] px-3 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 disabled:opacity-40 transition shadow-2xs cursor-pointer">Previous</button>
                  <span class="font-bold text-slate-900 dark:text-white" x-text="'Page ' + creatorBoardPage + ' of ' + Math.max(1, Math.ceil(activeCreatorBoards.length / 10))"></span>
                  <button @click="creatorBoardPage = creatorBoardPage + 1" :disabled="creatorBoardPage >= Math.ceil(activeCreatorBoards.length / 10)" class="rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] px-3 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 disabled:opacity-40 transition shadow-2xs cursor-pointer">Next</button>
                </div>
              </div>
            </div>

          </div>`;
}
