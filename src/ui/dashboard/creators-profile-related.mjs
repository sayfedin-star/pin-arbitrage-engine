/**
 * Creator Hub — View B Sub-View 4: Account Related Pins & Intersections Radar
 */
export function renderCreatorsProfileRelated() {
  return `          <!-- ======================================================== -->
          <!-- SUB-VIEW: ACCOUNT RELATED PINS & INTERSECTIONS RADAR     -->
          <!-- ======================================================== -->
          <div x-show="activeCreatorTab === 'related_pins'" class="space-y-5">
            <!-- Header & Action Bar -->
            <div class="rounded-2xl border border-slate-200/90 dark:border-[#27272A] bg-white dark:bg-[#18181B] p-5 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <div class="flex items-center gap-2">
                  <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500 font-bold text-sm">🕸️</span>
                  <h3 class="text-base font-extrabold text-slate-900 dark:text-white">Related Pins Radar (Account Intersections)</h3>
                  <span class="px-2 py-0.5 rounded text-[10px] font-mono tabular-nums bg-amber-500/10 border border-amber-500/20 text-amber-600 font-bold">Zone-A + Guest Fallback</span>
                </div>
                <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Pixie Graph Co-Occurrence Radar for @<span x-text="(activeCreator.username || '').replace(/^@+/, '')"></span>. Identifies overlapping related pins across multiple seeds, traffic retention, and competitor leakage.
                </p>
              </div>

              <!-- Top Action Buttons -->
              <div class="flex items-center gap-2 flex-wrap">
                <button @click="autoAddTop10WinningSeedsAction()" :disabled="isAddingSeeds" class="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 transition cursor-pointer">
                  <i data-lucide="zap" class="w-3.5 h-3.5"></i>
                  <span>⚡ Auto-Add Top 10</span>
                </button>

                <button @click="isBulkAddSeedsModalOpen = true" class="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-100 dark:bg-slate-900 px-3 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition cursor-pointer">
                  <i data-lucide="plus-circle" class="w-3.5 h-3.5"></i>
                  <span>+ Bulk Add Pin IDs</span>
                </button>

                <button @click="dispatchRelatedWorkflowAction()" :disabled="isHarvestingRelated" class="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white px-3.5 text-xs font-bold transition shadow-sm cursor-pointer disabled:opacity-50">
                  <i data-lucide="play" class="w-3.5 h-3.5" :class="isHarvestingRelated ? 'animate-spin' : ''"></i>
                  <span>🚀 Harvest Related (GHA)</span>
                </button>

                <button @click="fetchCreatorRelatedGraph()" class="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] px-3 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer">
                  <i data-lucide="refresh-cw" class="w-3.5 h-3.5" :class="isLoadingRelatedGraph ? 'animate-spin' : ''"></i>
                </button>
              </div>
            </div>

            <!-- KPI Summary Cards -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
              <!-- KPI 1: Active Seeds -->
              <div class="p-4 rounded-2xl bg-white dark:bg-[#18181B] border border-slate-200/90 dark:border-[#27272A] shadow-2xs">
                <span class="text-[10px] font-mono tabular-nums uppercase text-slate-500 dark:text-slate-400 font-bold">Active Analyzed Seeds</span>
                <div class="mt-1 text-2xl font-mono tabular-nums font-black text-slate-900 dark:text-white" x-text="creatorRelatedStats.total_seeds || creatorRelatedSeeds.length || 0"></div>
                <div class="text-[10px] text-slate-400 mt-0.5">Seed pins registered for account</div>
              </div>

              <!-- KPI 2: Total Discovered Related Nodes -->
              <div class="p-4 rounded-2xl bg-white dark:bg-[#18181B] border border-slate-200/90 dark:border-[#27272A] shadow-2xs">
                <span class="text-[10px] font-mono tabular-nums uppercase text-slate-500 dark:text-slate-400 font-bold">Total Related Nodes</span>
                <div class="mt-1 text-2xl font-mono tabular-nums font-black text-indigo-600 dark:text-indigo-400" x-text="formatNumber(creatorRelatedStats.total_nodes || 0)"></div>
                <div class="text-[10px] text-slate-400 mt-0.5" x-text="(creatorRelatedStats.unique_candidates || 0) + ' unique pins'"></div>
              </div>

              <!-- KPI 3: Account Retention vs Traffic Leakage -->
              <div class="p-4 rounded-2xl bg-white dark:bg-[#18181B] border border-slate-200/90 dark:border-[#27272A] shadow-2xs">
                <div class="flex items-center justify-between">
                  <span class="text-[10px] font-mono tabular-nums uppercase text-slate-500 dark:text-slate-400 font-bold">Account Retention</span>
                  <span class="text-[10px] font-mono tabular-nums font-bold text-rose-500" x-text="(creatorRelatedStats.leakage_rate_pct || 0) + '% Leakage'"></span>
                </div>
                <div class="mt-1 text-2xl font-mono tabular-nums font-black text-emerald-600 dark:text-emerald-400" x-text="(creatorRelatedStats.retention_rate_pct || 0) + '%'"></div>
                <div class="text-[10px] text-slate-400 mt-0.5" x-text="(creatorRelatedStats.self_retention_nodes || 0) + ' own / ' + (creatorRelatedStats.rival_leakage_nodes || 0) + ' rivals'"></div>
              </div>

              <!-- KPI 4: Multi-Seed Intersections (2+ Seeds) -->
              <div class="p-4 rounded-2xl bg-white dark:bg-[#18181B] border border-slate-200/90 dark:border-[#27272A] shadow-2xs">
                <span class="text-[10px] font-mono tabular-nums uppercase text-slate-500 dark:text-slate-400 font-bold">Multi-Seed Intersections</span>
                <div class="mt-1 text-2xl font-mono tabular-nums font-black text-amber-600 dark:text-amber-400" x-text="creatorRelatedStats.total_intersections || creatorRelatedIntersections.length || 0"></div>
                <div class="text-[10px] text-slate-400 mt-0.5">Shared across 2+ seeds</div>
              </div>
            </div>

            <!-- Registered Seeds Shelf -->
            <div x-show="creatorRelatedSeeds.length > 0" class="rounded-2xl border border-slate-200/90 dark:border-[#27272A] bg-white dark:bg-[#18181B] p-4 shadow-xs">
              <div class="flex items-center justify-between mb-3">
                <span class="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <i data-lucide="layers" class="w-3.5 h-3.5 text-amber-500"></i>
                  <span>Registered Seeds Shelf (<span x-text="creatorRelatedSeeds.length"></span>)</span>
                </span>
                <span class="text-[11px] text-slate-400 font-mono tabular-nums">Click Live Harvest to refresh a single seed in 2s</span>
              </div>

              <div class="flex items-center gap-2.5 overflow-x-auto pb-2">
                <template x-for="s in creatorRelatedSeeds" :key="s.pin_id">
                  <div class="shrink-0 flex items-center gap-2 p-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-xs">
                    <img x-show="s.image_url" :src="s.image_url" class="w-8 h-8 rounded-lg object-cover bg-slate-200 dark:bg-slate-800" onerror="window.handlePinImgError(this)" />
                    <div class="max-w-[130px]">
                      <div class="font-bold text-slate-900 dark:text-white truncate" x-text="s.title || ('Pin #' + s.pin_id)"></div>
                      <div class="text-[10px] text-slate-400 font-mono tabular-nums" x-text="(s.related_count || 0) + ' related'"></div>
                    </div>
                    <button @click="harvestLiveSingleSeedAction(s.pin_id)" title="Live Single-Seed Harvest" class="p-1 rounded-lg text-emerald-600 hover:bg-emerald-500/10 transition cursor-pointer">
                      <i data-lucide="play-circle" class="w-3.5 h-3.5"></i>
                    </button>
                    <button @click="deleteSeedAction(s.pin_id)" title="Delete Seed" class="p-1 rounded-lg text-rose-500 hover:bg-rose-500/10 transition cursor-pointer">
                      <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                    </button>
                  </div>
                </template>
              </div>
            </div>

            <!-- Intersections Radar Filter & Search Controls -->
            <div class="rounded-2xl border border-slate-200/90 dark:border-[#27272A] bg-white dark:bg-[#18181B] p-4 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div class="flex items-center gap-2 flex-wrap">
                <!-- Overlap Threshold Selector -->
                <div class="flex items-center bg-slate-100 dark:bg-slate-900 p-0.5 rounded-xl border border-slate-200 dark:border-[#27272A]">
                  <button @click="creatorRelatedMinOverlap = 2; creatorRelatedPage = 1; fetchCreatorRelatedGraph()" class="rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer" :class="creatorRelatedMinOverlap === 2 ? 'bg-white dark:bg-[#121215] text-amber-600 dark:text-amber-400 shadow-2xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'">2+ Seeds Overlap</button>
                  <button @click="creatorRelatedMinOverlap = 3; creatorRelatedPage = 1; fetchCreatorRelatedGraph()" class="rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer" :class="creatorRelatedMinOverlap === 3 ? 'bg-white dark:bg-[#121215] text-amber-600 dark:text-amber-400 shadow-2xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'">3+ Seeds</button>
                  <button @click="creatorRelatedMinOverlap = 5; creatorRelatedPage = 1; fetchCreatorRelatedGraph()" class="rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer" :class="creatorRelatedMinOverlap === 5 ? 'bg-white dark:bg-[#121215] text-amber-600 dark:text-amber-400 shadow-2xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'">5+ Seeds</button>
                </div>

                <!-- Retention vs Rival Filter -->
                <div class="flex items-center bg-slate-100 dark:bg-slate-900 p-0.5 rounded-xl border border-slate-200 dark:border-[#27272A]">
                  <button @click="creatorRelatedFilter = 'all'; creatorRelatedPage = 1; fetchCreatorRelatedGraph()" class="rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer" :class="creatorRelatedFilter === 'all' ? 'bg-white dark:bg-[#121215] text-slate-900 dark:text-white shadow-2xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'">All Candidates</button>
                  <button @click="creatorRelatedFilter = 'self_only'; creatorRelatedPage = 1; fetchCreatorRelatedGraph()" class="rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer" :class="creatorRelatedFilter === 'self_only' ? 'bg-white dark:bg-[#121215] text-emerald-600 dark:text-emerald-400 shadow-2xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'">Own Retention Only</button>
                  <button @click="creatorRelatedFilter = 'rivals_only'; creatorRelatedPage = 1; fetchCreatorRelatedGraph()" class="rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer" :class="creatorRelatedFilter === 'rivals_only' ? 'bg-white dark:bg-[#121215] text-rose-600 dark:text-rose-400 shadow-2xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'">Rival Leakage Only</button>
                </div>
              </div>

              <!-- Search & Export -->
              <div class="flex items-center gap-2">
                <div class="relative">
                  <input type="text" x-model="creatorRelatedSearch" @keyup.enter="creatorRelatedPage = 1; fetchCreatorRelatedGraph()" placeholder="Search title or creator..." class="h-9 w-44 sm:w-56 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#121215] px-3 pl-8 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500" />
                  <i data-lucide="search" class="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5"></i>
                </div>

                <button @click="exportCsv(creatorRelatedIntersections, (activeCreator.username || 'account') + '-related-intersections.csv')" class="h-9 px-3 rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer flex items-center gap-1.5">
                  <i data-lucide="download" class="w-3.5 h-3.5"></i>
                  <span>CSV</span>
                </button>
              </div>
            </div>

            <!-- Intersections Radar Table -->
            <div class="rounded-2xl border border-slate-200/90 dark:border-[#27272A] bg-white dark:bg-[#18181B] shadow-xs overflow-hidden">
              <div class="overflow-x-auto">
                <table class="w-full text-left text-xs text-slate-600 dark:text-slate-400">
                  <thead class="bg-slate-50/80 dark:bg-slate-900/50 border-b border-slate-200 dark:border-[#27272A] font-mono tabular-nums text-[11px] uppercase tracking-wider text-slate-500">
                    <tr>
                      <th class="p-3.5 pl-5">Candidate Pin</th>
                      <th class="p-3.5 text-center">Multi-Seed Overlap</th>
                      <th class="p-3.5 text-center">Ownership</th>
                      <th class="p-3.5 text-right">Saves</th>
                      <th class="p-3.5 text-right">Repins</th>
                      <th class="p-3.5">Monetization Domain</th>
                      <th class="p-3.5 pr-5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60 font-sans">
                    <template x-for="item in creatorRelatedIntersections" :key="item.candidate_pin_id">
                      <tr class="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition">
                        <!-- Pin Preview & Title -->
                        <td class="p-3.5 pl-5">
                          <div class="flex items-center gap-3">
                            <img x-show="item.image_url" :src="item.image_url" class="w-10 h-10 rounded-xl object-cover bg-slate-200 dark:bg-slate-800 shrink-0 cursor-pointer" @click="openPinPage(item.candidate_pin_id)" onerror="window.handlePinImgError(this)" />
                            <div class="max-w-xs sm:max-w-sm">
                              <span @click="openPinPage(item.candidate_pin_id)" class="font-bold text-slate-900 dark:text-white hover:text-amber-500 transition cursor-pointer line-clamp-1" x-text="item.title || ('Pin #' + item.candidate_pin_id)"></span>
                              <div class="text-[11px] text-slate-400 font-mono tabular-nums flex items-center gap-1 mt-0.5">
                                <span>@<span x-text="item.creator_username || 'unknown'"></span></span>
                                <span x-show="item.creator_name" class="text-slate-500">· <span x-text="item.creator_name"></span></span>
                              </div>
                            </div>
                          </div>
                        </td>

                        <!-- Multi-Seed Overlap Count & Originating Seeds -->
                        <td class="p-3.5 text-center">
                          <div class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-mono tabular-nums font-extrabold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                            <i data-lucide="layers" class="w-3 h-3"></i>
                            <span x-text="(item.seed_overlap_count || 1) + ' Seeds'"></span>
                          </div>
                        </td>

                        <!-- Ownership Badge -->
                        <td class="p-3.5 text-center">
                          <template x-if="item.is_same_account">
                            <span class="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                              🛡️ Own Retention
                            </span>
                          </template>
                          <template x-if="!item.is_same_account">
                            <span class="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                              ⚡ Rival Leakage
                            </span>
                          </template>
                        </td>

                        <!-- Saves -->
                        <td class="p-3.5 text-right font-mono tabular-nums font-bold text-slate-900 dark:text-white" x-text="formatNumber(item.saves || 0)"></td>

                        <!-- Repins -->
                        <td class="p-3.5 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400" x-text="formatNumber(item.repins || 0)"></td>

                        <!-- Domain -->
                        <td class="p-3.5">
                          <div class="flex items-center gap-1.5">
                            <template x-if="item.domain">
                              <span class="font-mono tabular-nums text-xs text-slate-700 dark:text-slate-300 truncate max-w-[140px]" x-text="item.domain"></span>
                            </template>
                            <template x-if="!item.domain">
                              <span class="text-slate-400 text-xs">Direct Image</span>
                            </template>
                          </div>
                        </td>

                        <!-- Actions -->
                        <td class="p-3.5 pr-5 text-right">
                          <div class="flex items-center justify-end gap-1.5">
                            <button @click="openPinPage(item.candidate_pin_id)" class="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-amber-500 hover:text-white transition cursor-pointer">
                              Inspect
                            </button>
                            <a :href="'https://www.pinterest.com/pin/' + item.candidate_pin_id + '/'" target="_blank" rel="noopener noreferrer" class="p-1 rounded-lg text-slate-400 hover:text-rose-500 transition cursor-pointer" title="Open on Pinterest">
                              <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                            </a>
                          </div>
                        </td>
                      </tr>
                    </template>
                  </tbody>
                </table>
              </div>

              <!-- Empty State -->
              <template x-if="!isLoadingRelatedGraph && creatorRelatedIntersections.length === 0">
                <div class="py-14 text-center text-slate-400">
                  <i data-lucide="network" class="w-10 h-10 mx-auto mb-2 opacity-40 text-amber-500"></i>
                  <p class="text-xs font-semibold">No multi-seed intersections found matching your criteria.</p>
                  <p class="text-[11px] text-slate-400 mt-1">Add more seed pins or click "Harvest Related" to crawl Pinterest's graph for @<span x-text="(activeCreator.username || '').replace(/^@+/, '')"></span>.</p>
                </div>
              </template>

              <!-- Pagination Bar -->
              <div class="flex items-center justify-between p-4 border-t border-slate-200 dark:border-[#27272A] text-xs text-slate-500 dark:text-slate-400">
                <span x-text="'Showing ' + creatorRelatedIntersections.length + ' of ' + formatNumber(creatorRelatedStats.total_intersections || creatorRelatedIntersections.length) + ' intersecting hubs'"></span>
                <div class="flex items-center gap-1.5">
                  <button @click="if (creatorRelatedPage > 1) { creatorRelatedPage--; fetchCreatorRelatedGraph(); }" :disabled="creatorRelatedPage <= 1" class="h-8 px-3 rounded-lg border border-slate-200 dark:border-[#27272A] disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 font-semibold cursor-pointer">Previous</button>
                  <span class="px-2 font-mono tabular-nums" x-text="creatorRelatedPage + ' / ' + creatorRelatedTotalPages"></span>
                  <button @click="if (creatorRelatedPage < creatorRelatedTotalPages) { creatorRelatedPage++; fetchCreatorRelatedGraph(); }" :disabled="creatorRelatedPage >= creatorRelatedTotalPages" class="h-8 px-3 rounded-lg border border-slate-200 dark:border-[#27272A] disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 font-semibold cursor-pointer">Next</button>
                </div>
              </div>
            </div>
          </div>`;
}
