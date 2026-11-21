/**
 * Related Pins Hub — Sub-Tab 2: Global Intersections (Standalone 24 Hubs)
 */
import { renderPinRowTemplate } from '../pin-row.mjs';

export function renderRelatedIntersectionsTab() {
  return `    <!-- ======================================================== -->
    <!-- SUB-TAB 2: ⚡ GLOBAL INTERSECTIONS (STANDALONE 24 HUBS)   -->
    <!-- ======================================================== -->
    <div x-show="relatedSubTab === 'intersections'" class="space-y-5">
      
      <!-- 1. Executive Summary Ribbon (KPI Cards) -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <!-- Card 1: Total Hubs -->
        <div class="p-3.5 rounded-2xl bg-white dark:bg-[#18181B] border border-slate-200/90 dark:border-[#27272A] shadow-sm flex items-center space-x-3">
          <div class="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400 flex-shrink-0">
            <i data-lucide="flame" class="w-5 h-5"></i>
          </div>
          <div class="min-w-0">
            <div class="text-[10px] font-mono tabular-nums uppercase text-slate-500 dark:text-slate-400 font-bold truncate">Total Intersections</div>
            <div class="text-lg font-mono tabular-nums font-extrabold text-slate-900 dark:text-white" x-text="intersectionStats.totalHubs"></div>
            <div class="text-[10px] text-slate-400 font-medium truncate">Discovered across ≥ 2 seeds</div>
          </div>
        </div>

        <!-- Card 2: Golden Core (>= 5 Seeds) -->
        <div class="p-3.5 rounded-2xl bg-white dark:bg-[#18181B] border border-slate-200/90 dark:border-[#27272A] shadow-sm flex items-center space-x-3">
          <div class="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-600 dark:text-rose-400 flex-shrink-0">
            <i data-lucide="crown" class="w-5 h-5"></i>
          </div>
          <div class="min-w-0">
            <div class="text-[10px] font-mono tabular-nums uppercase text-slate-500 dark:text-slate-400 font-bold truncate">Golden Core (≥ 5 Seeds)</div>
            <div class="text-lg font-mono tabular-nums font-extrabold text-rose-600 dark:text-rose-400" x-text="intersectionStats.goldenCore"></div>
            <div class="text-[10px] text-slate-400 font-medium truncate">Ultra-high cross-cluster pull</div>
          </div>
        </div>

        <!-- Card 3: Vacuum Opportunities -->
        <div class="p-3.5 rounded-2xl bg-white dark:bg-[#18181B] border border-slate-200/90 dark:border-[#27272A] shadow-sm flex items-center space-x-3">
          <div class="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 flex-shrink-0">
            <i data-lucide="target" class="w-5 h-5"></i>
          </div>
          <div class="min-w-0">
            <div class="text-[10px] font-mono tabular-nums uppercase text-slate-500 dark:text-slate-400 font-bold truncate">Vacuum Targets</div>
            <div class="text-lg font-mono tabular-nums font-extrabold text-emerald-600 dark:text-emerald-400" x-text="intersectionStats.vacuumTargets"></div>
            <div class="text-[10px] text-slate-400 font-medium truncate">Organic pins with ≥ 5K saves</div>
          </div>
        </div>

        <!-- Card 4: Top Pixie Hit Mass -->
        <div class="p-3.5 rounded-2xl bg-white dark:bg-[#18181B] border border-slate-200/90 dark:border-[#27272A] shadow-sm flex items-center space-x-3">
          <div class="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-600 dark:text-purple-400 flex-shrink-0">
            <i data-lucide="activity" class="w-5 h-5"></i>
          </div>
          <div class="min-w-0">
            <div class="text-[10px] font-mono tabular-nums uppercase text-slate-500 dark:text-slate-400 font-bold truncate">Max Pixie Hit Mass</div>
            <div class="text-lg font-mono tabular-nums font-extrabold text-purple-600 dark:text-purple-400" x-text="intersectionStats.maxPixie"></div>
            <div class="text-[10px] text-slate-400 font-medium truncate">Peak random-walk centroid</div>
          </div>
        </div>
      </div>

      <!-- Main Intersections Card -->
      <div class="bg-white dark:bg-[#18181B] border border-slate-200/90 dark:border-[#27272A] rounded-2xl p-5 shadow-sm dark:shadow-xl space-y-4">
        
        <!-- Header Bar with Title and Actions -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-[#27272A] pb-3">
          <div>
            <h2 class="text-base font-bold text-slate-900 dark:text-white flex items-center space-x-2">
              <i data-lucide="flame" class="w-5 h-5 text-amber-500"></i>
              <span>Global Multi-Seed Intersections Radar (رادار التقاطعات الشاملة)</span>
            </h2>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Cross-cluster gravitational centroids discovered across ≥ 2 distinct seeds. Ranked by Pixie Bipartite Multi-Hit score.</p>
          </div>

          <div class="flex items-center space-x-2 flex-wrap gap-y-1">
            <!-- View Mode Switcher: Grid Cards ⊞ vs Data Table ☰ -->
            <div class="flex items-center bg-slate-100 dark:bg-slate-800/80 p-0.5 rounded-xl border border-slate-200 dark:border-[#27272A]/80 shadow-inner">
              <button @click="setIntersectionViewMode('grid')" 
                      class="flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-semibold font-mono tabular-nums transition active:scale-95"
                      :class="intersectionViewMode === 'grid' ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-sm' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'">
                <i data-lucide="layout-grid" class="w-3.5 h-3.5"></i>
                <span>Cards Grid</span>
              </button>
              <button @click="setIntersectionViewMode('table')" 
                      class="flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-semibold font-mono tabular-nums transition active:scale-95"
                      :class="intersectionViewMode === 'table' ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-sm' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'">
                <i data-lucide="table" class="w-3.5 h-3.5"></i>
                <span>Data Table</span>
              </button>
            </div>

            <button @click="exportCsv(filteredIntersections, 'global-intersections-filtered.csv')" class="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-semibold shadow-sm transition active:scale-95">
              <i data-lucide="download" class="w-3.5 h-3.5 text-amber-500"></i>
              <span>Export CSV</span>
            </button>
            <span class="px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs font-mono tabular-nums font-bold text-amber-600 dark:text-amber-400" x-text="intersections.length + ' Total Hubs'"></span>
          </div>
        </div>

        <!-- 2. Advanced Multi-Filter & Search Toolbar -->
        <div class="p-3.5 rounded-2xl bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200/80 dark:border-[#27272A]/80 space-y-3">
          <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            
            <!-- Left: Search & Sorting -->
            <div class="flex items-center space-x-2 flex-wrap gap-y-2">
              <!-- Live Text Search -->
              <div class="relative min-w-[220px]">
                <i data-lucide="search" class="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400"></i>
                <input type="text" x-model="intersectionFilters.search" @input="intersectionPage = 1" placeholder="Search title, ID, OCR, or seeds..." class="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] font-mono tabular-nums text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-amber-500">
              </div>

              <!-- Sort Dropdown -->
              <div class="flex items-center space-x-1 bg-white dark:bg-slate-900 rounded-xl px-2 py-1 border border-slate-200 dark:border-[#27272A] shadow-sm">
                <span class="text-[10px] font-mono tabular-nums text-slate-400 uppercase font-semibold">Sort:</span>
                <select x-model="intersectionSort" @change="intersectionPage = 1" class="text-xs bg-transparent text-slate-900 dark:text-slate-100 font-mono tabular-nums focus:outline-none cursor-pointer">
                  <option value="pixie">Pixie Multi-Hit Score</option>
                  <option value="overlap">Overlap Depth (Max Seeds)</option>
                  <option value="saves">Total Saves (High to Low)</option>
                  <option value="rate">Repin Rate % (High to Low)</option>
                  <option value="velocity">Daily Velocity (Fastest)</option>
                </select>
              </div>
            </div>

            <!-- Right: 4 Filter Selectors -->
            <div class="flex items-center space-x-2 flex-wrap gap-y-2">
              
              <!-- Overlap Depth Filter -->
              <div class="flex items-center space-x-1 bg-white dark:bg-slate-900 rounded-xl px-2 py-1 border border-slate-200 dark:border-[#27272A] shadow-sm">
                <span class="text-[10px] font-mono tabular-nums text-slate-400 uppercase font-semibold">Overlap:</span>
                <select x-model="intersectionFilters.minOverlap" @change="intersectionPage = 1" class="text-xs bg-transparent text-slate-900 dark:text-slate-100 font-mono tabular-nums focus:outline-none cursor-pointer">
                  <option value="all">All Hubs (≥ 2 Seeds)</option>
                  <option value="3">≥ 3 Seeds (Hubs)</option>
                  <option value="5">≥ 5 Seeds (Golden Core)</option>
                  <option value="7">≥ 7 Seeds (Mega-Hubs)</option>
                </select>
              </div>

              <!-- Originating Seed Filter -->
              <div class="flex items-center space-x-1 bg-white dark:bg-slate-900 rounded-xl px-2 py-1 border border-slate-200 dark:border-[#27272A] shadow-sm max-w-[190px]">
                <span class="text-[10px] font-mono tabular-nums text-slate-400 uppercase font-semibold">Seed:</span>
                <select x-model="intersectionFilters.seedId" @change="intersectionPage = 1" class="text-xs bg-transparent text-slate-900 dark:text-slate-100 font-mono tabular-nums focus:outline-none cursor-pointer truncate">
                  <option value="all">All Seeds</option>
                  <template x-for="s in seeds" :key="s.pin_id">
                    <option :value="s.pin_id" x-text="s.label"></option>
                  </template>
                </select>
              </div>

              <!-- Format Filter -->
              <div class="flex items-center space-x-1 bg-white dark:bg-slate-900 rounded-xl px-2 py-1 border border-slate-200 dark:border-[#27272A] shadow-sm">
                <span class="text-[10px] font-mono tabular-nums text-slate-400 uppercase font-semibold">Format:</span>
                <select x-model="intersectionFilters.format" @change="intersectionPage = 1" class="text-xs bg-transparent text-slate-900 dark:text-slate-100 font-mono tabular-nums focus:outline-none cursor-pointer">
                  <option value="all">All Formats</option>
                  <option value="ORGANIC PIN">Organic Pin</option>
                  <option value="VIDEO PIN">Video Pin</option>
                  <option value="IDEA PIN">Idea Pin</option>
                  <option value="PRODUCT CARD">Product Card</option>
                </select>
              </div>

              <!-- Market / Strategy Status -->
              <div class="flex items-center space-x-1 bg-white dark:bg-slate-900 rounded-xl px-2 py-1 border border-slate-200 dark:border-[#27272A] shadow-sm">
                <span class="text-[10px] font-mono tabular-nums text-slate-400 uppercase font-semibold">Market:</span>
                <select x-model="intersectionFilters.market" @change="intersectionPage = 1" class="text-xs bg-transparent text-slate-900 dark:text-slate-100 font-mono tabular-nums focus:outline-none cursor-pointer">
                  <option value="all">All Opportunities</option>
                  <option value="vacuum">Vacuum Targets Only (≥ 5K)</option>
                  <option value="product">Competitor Products</option>
                  <option value="high_rate">High Repin Rate (≥ 50%)</option>
                  <option value="explosive">Explosive Velocity (≥ 50/d)</option>
                </select>
              </div>

            </div>
          </div>

          <!-- Dynamic Counter & Reset Bar -->
          <div class="flex items-center justify-between pt-1 text-xs border-t border-slate-200/60 dark:border-[#27272A]/60 font-mono tabular-nums">
            <div class="flex items-center space-x-2 text-slate-600 dark:text-slate-300">
              <span class="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                Showing <span class="mx-1 text-amber-600 dark:text-amber-400" x-text="filteredIntersections.length"></span> of <span class="mx-1" x-text="intersections.length"></span> overlapping hubs
              </span>
            </div>

            <button 
              x-show="intersectionFilters.search || intersectionFilters.minOverlap !== 'all' || intersectionFilters.seedId !== 'all' || intersectionFilters.format !== 'all' || intersectionFilters.market !== 'all' || intersectionFilters.engine !== 'all'"
              @click="resetIntersectionFilters()"
              class="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-[11px] font-bold transition active:scale-95"
            >
              <i data-lucide="rotate-ccw" class="w-3 h-3"></i>
              <span>Reset All Filters</span>
            </button>
          </div>
        </div>

        <!-- 3A. Visual Arbitrage Card Grid (Pinterest-Native 2:3 Cards) -->
        <div x-show="intersectionViewMode === 'grid'" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <template x-for="item in paginatedIntersections" :key="item.candidate_pin_id">
            <div class="group relative rounded-2xl bg-white dark:bg-[#121215] border border-slate-200/90 dark:border-[#27272A]/90 hover:border-amber-500/50 dark:hover:border-amber-500/50 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col overflow-hidden">
              
              <!-- 1. Media Image Container (2:3 Aspect Ratio) -->
              <div class="relative w-full aspect-[2/3] bg-slate-100 dark:bg-slate-900 overflow-hidden cursor-pointer" @click="openHubDrawer(item)">
                <template x-if="item.image_url">
                  <img :src="item.image_url" alt="Pin preview" loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" onerror="if(window.handlePinImgError){window.handlePinImgError(this)}else{this.onerror=null}">
                </template>
                <template x-if="!item.image_url">
                  <div class="w-full h-full flex flex-col items-center justify-center text-slate-400 p-4 text-center">
                    <i data-lucide="image" class="w-8 h-8 mb-2 opacity-50"></i>
                    <span class="text-xs font-mono tabular-nums">No Image</span>
                  </div>
                </template>

                <!-- Top Floating Glassmorphism Badges -->
                <div class="absolute top-2.5 inset-x-2.5 flex items-center justify-between pointer-events-none">
                  <!-- Multi-Hit Overlap Badge -->
                  <span class="px-2 py-0.5 rounded-lg text-[10px] font-mono tabular-nums font-bold uppercase backdrop-blur-md shadow-md border"
                        :class="{
                          'bg-purple-950/85 text-purple-200 border-purple-500/40': item.seed_overlap_count >= 7,
                          'bg-rose-950/85 text-rose-200 border-rose-500/40': item.seed_overlap_count >= 5 && item.seed_overlap_count < 7,
                          'bg-amber-950/85 text-amber-200 border-amber-500/40': item.seed_overlap_count >= 3 && item.seed_overlap_count < 5,
                          'bg-slate-900/85 text-slate-200 border-slate-700/60': item.seed_overlap_count < 3
                        }">
                    <span class="inline-flex items-center gap-1"><i data-lucide="flame" class="w-3 h-3 shrink-0"></i><span x-text="item.seed_overlap_count + ' Seeds'"></span></span>
                    <span class="text-[9px] opacity-80" x-text="'(' + Math.pow(item.seed_overlap_count, 2) + 'x)'"></span>
                  </span>

                  <!-- Vacuum / Format Badge -->
                  <div class="flex items-center space-x-1">
                    <template x-if="item.is_vacuum_target">
                      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-extrabold uppercase bg-emerald-950/85 text-emerald-300 border border-emerald-500/40 backdrop-blur-md shadow-md">
                        <i data-lucide="target" class="w-3 h-3 shrink-0"></i><span>VACUUM</span>
                      </span>
                    </template>
                    <span class="px-1.5 py-0.5 rounded-lg text-[9px] font-mono tabular-nums font-bold uppercase backdrop-blur-md shadow-md bg-slate-950/70 text-white border border-white/20" x-text="item.format_type === 'PRODUCT CARD' ? 'PRODUCT' : (item.format_type === 'VIDEO PIN' ? 'VIDEO' : 'PIN')"></span>
                  </div>
                </div>

                <!-- Hover Overlay Trigger -->
                <div class="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3 pointer-events-none">
                  <span class="text-xs font-semibold text-white flex items-center space-x-1 font-mono tabular-nums">
                    <i data-lucide="eye" class="w-3.5 h-3.5 text-amber-400"></i>
                    <span>Click for Deep Dossier</span>
                  </span>
                </div>
              </div>

              <!-- 2. Card Content & Metrics Body -->
              <div class="p-3.5 flex-1 flex flex-col justify-between space-y-3">
                
                <!-- Title & Domain -->
                <div>
                  <div class="flex items-start justify-between gap-1.5">
                    <button @click="openHubDrawer(item)" 
                            class="font-bold text-xs text-left text-slate-900 dark:text-slate-100 hover:text-amber-500 transition line-clamp-2"
                            :title="item.title"
                            x-text="item.title || ('Pin ' + item.candidate_pin_id)"></button>
                    <a :href="'https://www.pinterest.com/pin/' + item.candidate_pin_id + '/'" target="_blank" rel="noopener noreferrer" class="text-slate-400 hover:text-amber-500 flex-shrink-0 mt-0.5" title="Open on Pinterest">
                      <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                    </a>
                  </div>
                  <div class="flex items-center space-x-2 text-[10px] font-mono tabular-nums text-slate-400 mt-1 truncate">
                    <span x-text="item.domain"></span>
                    <span>•</span>
                    <button @click="copyToClipboard(item.candidate_pin_id, 'pin-' + item.candidate_pin_id)" class="hover:text-amber-500 cursor-pointer flex items-center space-x-0.5">
                      <span x-text="'ID: ' + item.candidate_pin_id"></span>
                      <i data-lucide="copy" class="w-2.5 h-2.5"></i>
                    </button>
                  </div>
                </div>

                <!-- Pixie Resonance Tier & Energy Micro-Bar (WWW 2018 Formula) -->
                <div class="p-2 rounded-xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200/70 dark:border-[#27272A]/70 space-y-1.5">
                  <div class="flex items-center justify-between text-[11px] font-mono tabular-nums">
                    <span class="px-1.5 py-0.5 rounded font-bold uppercase tracking-wider text-[9px]" :class="getPixieResonance(item).badgeClass" x-text="getPixieResonance(item).label"></span>
                    <span class="font-extrabold text-slate-900 dark:text-white" x-text="Number(item.pixie_multihit_score || 0).toLocaleString()"></span>
                  </div>
                  <!-- Energy Progress Bar -->
                  <div class="w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                    <div class="h-full rounded-full transition-all duration-500" :class="getPixieResonance(item).barGradient" :style="'width: ' + getPixieResonance(item).barPercent + '%'"></div>
                  </div>
                  <div class="flex items-center justify-between text-[9px] font-mono tabular-nums text-slate-400">
                    <span>Random Walk Mass</span>
                    <span x-text="getPixieResonance(item).barPercent + '% Peak Pull'"></span>
                  </div>
                </div>

                <!-- Engagement Stats Grid -->
                <div class="grid grid-cols-2 gap-2 text-xs font-mono tabular-nums pt-1 border-t border-slate-100 dark:border-[#27272A]/60">
                  <div>
                    <div class="text-[9px] uppercase text-slate-400">Saves / Repins</div>
                    <div class="font-bold text-slate-900 dark:text-slate-100" x-text="Number(item.total_saves != null ? item.total_saves : (item.saves || 0)).toLocaleString()"></div>
                    <div class="text-[10px] text-slate-500" x-text="(item.avg_save_rate || item.save_rate || 0) + '% rate'"></div>
                  </div>
                  <div>
                    <div class="text-[9px] uppercase text-slate-400">Daily Velocity</div>
                    <template x-if="Number(item.daily_velocity || 0) > 0">
                      <div class="font-bold text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1"><i data-lucide="flame" class="w-3 h-3 shrink-0"></i><span x-text="item.daily_velocity + '/d'"></span></div>
                    </template>
                    <template x-if="!Number(item.daily_velocity || 0)">
                      <div class="text-slate-400 text-[10px]">Stagnant</div>
                    </template>
                    <div class="flex items-center space-x-1 mt-0.5">
                      <span class="w-2.5 h-2.5 rounded-full border border-black/20" :style="'background-color: ' + safeColor(item.winning_color, '#888')"></span>
                      <span class="text-[9px] text-slate-400 truncate max-w-[70px]" x-text="item.culinary_color_name || item.winning_color"></span>
                    </div>
                  </div>
                </div>

                <!-- Action Bar -->
                <div class="flex items-center space-x-1.5 pt-2 border-t border-slate-100 dark:border-[#27272A]">
                  <button @click="openHubDrawer(item)" class="flex-1 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 text-[11px] font-bold font-mono tabular-nums transition active:scale-95 flex items-center justify-center space-x-1">
                    <i data-lucide="eye" class="w-3 h-3"></i>
                    <span>Inspect Dossier</span>
                  </button>
                  <button @click="copyHubReSpinAngle(item)" class="p-1.5 rounded-xl border border-slate-200 dark:border-[#27272A] hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition active:scale-95" title="Copy Viral Angle Hook">
                    <i data-lucide="copy" class="w-3.5 h-3.5"></i>
                  </button>
                </div>

              </div>
            </div>
          </template>

          <!-- Empty Grid Placeholder -->
          <template x-if="paginatedIntersections.length === 0">
            <div class="col-span-full py-16 text-center text-slate-500 dark:text-slate-400 font-mono tabular-nums text-xs">
              <div class="flex flex-col items-center justify-center space-y-2">
                <i data-lucide="search-x" class="w-10 h-10 text-slate-400"></i>
                <div class="font-bold text-slate-700 dark:text-slate-300">No intersecting hubs matching your filters</div>
                <button @click="resetIntersectionFilters()" class="text-amber-600 dark:text-amber-400 underline font-semibold cursor-pointer">Reset all filters</button>
              </div>
            </div>
          </template>
        </div>

        <!-- 3B. Polished Precision Data Table -->
        <div x-show="intersectionViewMode === 'table'" class="overflow-x-auto">
          <table class="w-full text-left text-xs border-collapse">
            <thead>
              <tr class="border-b border-slate-200 dark:border-[#27272A]/80 bg-slate-50/80 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 font-mono tabular-nums text-[11px] uppercase tracking-wider">
                <th class="py-3 px-3">Preview & Format</th>
                <th class="py-3 px-3 min-w-[260px]">Intersecting Candidate Title</th>
                <th class="py-3 px-3 min-w-[220px] max-w-[280px]">Originating Seeds Convergence</th>
                <th class="py-3 px-3 min-w-[170px]">Pixie Multi-Hit Mass</th>
                <th class="py-3 px-3 min-w-[150px]">Engagement Metrics</th>
                <th class="py-3 px-3 min-w-[120px]">Color DNA</th>
                <th class="py-3 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60 font-sans">
              <template x-for="item in paginatedIntersections" :key="item.candidate_pin_id">
                ${renderPinRowTemplate({
                  pinVar: 'item',
                  pinIdExpr: 'item.candidate_pin_id',
                  showCheckbox: false,
                  showRank: false,
                  showThumb: true,
                  showTitle: true,
                  showDomain: false,
                  showVelocity: true,
                  velocityPosition: 'beforeSaves',
                  showSaves: true,
                  showRepins: false,
                  showAge: false,
                  showActions: true,
                  rowClass: 'hover:bg-slate-50/80 dark:hover:bg-slate-900/40 transition',
                  thumbHtml: `
                  <!-- 1. Preview & Format -->
                  <td class="py-3 px-3 whitespace-nowrap">
                    <div class="flex items-center space-x-2.5">
                      <div @click="openHubDrawer(item)" class="group/thumb block relative flex-shrink-0 cursor-pointer">
                        <template x-if="item.image_url">
                          <img :src="item.image_url" alt="pin preview" loading="lazy" class="w-10 h-14 rounded-xl object-cover border-2 shadow-sm group-hover/thumb:scale-110 transition-transform duration-200" :style="'border-color: ' + safeColor(item.winning_color, '#cbd5e1')" onerror="if(window.handlePinImgError){window.handlePinImgError(this)}else{this.onerror=null}">
                        </template>
                        <template x-if="!item.image_url">
                          <div class="w-10 h-14 rounded-xl flex-shrink-0 flex items-center justify-center border-2 shadow-sm" :style="'border-color: ' + safeColor(item.winning_color, '#cbd5e1') + '; background-color: ' + safeColor(item.winning_color, '#cbd5e1') + '15;'">
                            <i data-lucide="image" class="w-4 h-4 text-slate-400"></i>
                          </div>
                        </template>
                      </div>
                      <div class="space-y-1">
                        <div class="flex flex-col space-y-1">
                          <span class="inline-block px-1.5 py-0.5 rounded text-[9px] font-mono tabular-nums font-bold tracking-wider uppercase" :class="{
                            'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20': item.format_type === 'PRODUCT CARD',
                            'bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20': item.format_type === 'ORGANIC PIN',
                            'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20': item.format_type === 'VIDEO PIN',
                            'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20': item.format_type === 'IDEA PIN'
                          }" x-text="item.format_type"></span>

                          <template x-if="item.is_vacuum_target">
                            <span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40">
                              <i data-lucide="target" class="w-2.5 h-2.5 shrink-0"></i><span>VACUUM</span>
                            </span>
                          </template>
                        </div>

                        <!-- Ingestion Method Badge -->
                        <template x-if="item.ingestion_method && item.ingestion_method !== 'uploaded'">
                          <div class="text-[8px] font-mono tabular-nums font-bold uppercase tracking-wider text-slate-400">
                            <span class="px-1 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-500" x-text="item.ingestion_method === 'csv_importer' ? 'CSV Farm' : (item.ingestion_method === 'pin_scheduling' ? 'Scheduled' : item.ingestion_method)"></span>
                          </div>
                        </template>
                      </div>
                    </div>
                  </td>`,
                  titleHtml: `
                  <!-- 2. Title & OCR -->
                  <td class="py-3 px-3 min-w-[260px]">
                    <div class="space-y-1">
                      <div class="flex items-center space-x-1.5">
                        <button @click="openHubDrawer(item)" 
                                class="font-bold text-left text-slate-900 dark:text-slate-100 hover:text-amber-500 line-clamp-1 hover:underline text-xs" 
                                x-text="item.title || ('Pin ' + item.candidate_pin_id)"></button>
                        <a :href="'https://www.pinterest.com/pin/' + item.candidate_pin_id + '/'" 
                           target="_blank" 
                           rel="noopener noreferrer"
                           class="text-slate-400 hover:text-amber-500 transition flex-shrink-0" title="Open on Pinterest">
                          <i data-lucide="external-link" class="w-3 h-3"></i>
                        </a>
                      </div>

                      <div class="flex items-center space-x-2 text-[10px] text-slate-500 font-mono tabular-nums flex-wrap gap-y-0.5">
                        <span class="px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 truncate max-w-[130px]" x-text="item.domain"></span>
                        <span>•</span>
                        <button @click="copyToClipboard(item.candidate_pin_id, 'pin-' + item.candidate_pin_id)" 
                                class="hover:text-amber-500 flex items-center space-x-0.5 cursor-pointer text-slate-500" title="Copy Pin ID">
                          <span x-text="'ID: ' + item.candidate_pin_id"></span>
                          <i data-lucide="copy" class="w-2.5 h-2.5"></i>
                        </button>
                      </div>

                      <template x-if="item.ocr_text">
                        <div class="p-1 px-1.5 rounded bg-slate-100 dark:bg-slate-900/90 text-[10px] text-slate-600 dark:text-slate-400 font-mono tabular-nums truncate max-w-sm" :title="item.ocr_text">
                          <span class="text-rose-500 font-bold">OCR:</span> <span x-text="item.ocr_text"></span>
                        </div>
                      </template>
                    </div>
                  </td>`,
                  extraCellsAfterTitle: `
                  <!-- 3. Overlapping Originating Seeds (Compact with Expand/Collapse) -->
                  <td class="py-3 px-3 min-w-[220px] max-w-[280px]">
                    <div class="space-y-1">
                      <div class="flex items-center justify-between">
                        <div class="flex items-center space-x-1 font-mono tabular-nums text-[11px] font-bold" :class="{
                          'text-purple-600 dark:text-purple-400': item.seed_overlap_count >= 7,
                          'text-rose-600 dark:text-rose-400': item.seed_overlap_count >= 5 && item.seed_overlap_count < 7,
                          'text-amber-600 dark:text-amber-400': item.seed_overlap_count >= 3 && item.seed_overlap_count < 5,
                          'text-slate-600 dark:text-slate-400': item.seed_overlap_count < 3
                        }">
                          <i data-lucide="git-merge" class="w-3.5 h-3.5"></i>
                          <span x-text="'Found in ' + item.seed_overlap_count + ' Seeds'"></span>
                          <span class="text-[9px] font-normal opacity-80" x-text="'(' + Math.pow(item.seed_overlap_count, 2) + 'x)'"></span>
                        </div>

                        <template x-if="(item.originating_seed_details || []).length > 2">
                          <button @click="toggleExpandSeeds(item.candidate_pin_id)" 
                                  class="px-1.5 py-0.5 rounded text-[10px] font-mono tabular-nums font-semibold transition flex items-center space-x-0.5"
                                  :class="isSeedsExpanded(item.candidate_pin_id) ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300' : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'">
                            <span x-text="isSeedsExpanded(item.candidate_pin_id) ? '▲ Collapse' : '+' + ((item.originating_seed_details || []).length - 2) + ' more'"></span>
                          </button>
                        </template>
                      </div>

                      <!-- Collapsed View: First 2 Seeds -->
                      <div x-show="!isSeedsExpanded(item.candidate_pin_id)" class="flex flex-wrap gap-1">
                        <template x-for="s in (item.originating_seed_details || []).slice(0, 2)" :key="s.pin_id">
                          <span class="inline-block max-w-[130px] truncate px-1.5 py-0.5 rounded text-[10px] font-mono tabular-nums border"
                                :class="s.is_competitor ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20'"
                                :title="s.label + ' (Pin ID: ' + s.pin_id + ')'"
                                x-text="s.label"></span>
                        </template>
                      </div>

                      <!-- Expanded View: All Seeds Grid -->
                      <div x-show="isSeedsExpanded(item.candidate_pin_id)" class="flex flex-wrap gap-1 pt-1 max-h-48 overflow-y-auto pr-1">
                        <template x-for="s in (item.originating_seed_details || [])" :key="s.pin_id">
                          <span class="inline-block max-w-[200px] truncate px-1.5 py-0.5 rounded text-[10px] font-mono tabular-nums border"
                                :class="s.is_competitor ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20'"
                                :title="s.label + ' (Pin ID: ' + s.pin_id + ')'"
                                x-text="s.label"></span>
                        </template>
                      </div>
                    </div>
                  </td>`,
                  velocityHtml: `
                  <!-- 4. Pixie Multi-Hit Score & Energy Bar -->
                  <td class="py-3 px-3 whitespace-nowrap font-mono tabular-nums min-w-[170px]">
                    <div class="space-y-1">
                      <div class="flex items-center space-x-1.5">
                        <span class="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider" :class="getPixieResonance(item).badgeClass" x-text="getPixieResonance(item).label"></span>
                      </div>
                      <div class="text-sm font-extrabold text-slate-900 dark:text-white" x-text="Number(item.pixie_multihit_score || 0).toLocaleString()"></div>
                      <!-- Micro Energy Bar -->
                      <div class="w-28 bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                        <div class="h-full rounded-full transition-all duration-500" :class="getPixieResonance(item).barGradient" :style="'width: ' + getPixieResonance(item).barPercent + '%'"></div>
                      </div>
                      <div class="text-[9px] text-slate-400">Random Walk Mass</div>
                    </div>
                  </td>`,
                  savesHtml: `
                  <!-- 5. Metrics -->
                  <td class="py-3 px-3 whitespace-nowrap font-mono tabular-nums min-w-[150px]">
                    <div class="font-bold text-slate-900 dark:text-white" x-text="Number(item.total_saves != null ? item.total_saves : (item.saves || 0)).toLocaleString() + ' saves'"></div>
                    <div class="text-[10px] text-slate-500" x-text="Number(item.total_repins != null ? item.total_repins : (item.repins || 0)).toLocaleString() + ' repins • ' + (item.avg_save_rate != null ? item.avg_save_rate : (item.save_rate != null ? item.save_rate : 0)) + '% rate'"></div>
                    <template x-if="Number(item.daily_velocity || 0) > 0">
                      <div class="text-[9px] font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5 inline-flex items-center gap-0.5"><i data-lucide="flame" class="w-2.5 h-2.5 shrink-0"></i><span x-text="item.daily_velocity + '/day'"></span></div>
                    </template>
                  </td>`,
                  extraCellsBeforeActions: `
                  <!-- 6. Color DNA -->
                  <td class="py-3 px-3 whitespace-nowrap min-w-[120px]">
                    <div class="flex items-center space-x-2">
                      <span class="w-4 h-4 rounded border flex-shrink-0 shadow-sm" :style="'background-color: ' + (item.winning_color || item.dominant_color || '#888888')"></span>
                      <div class="space-y-0.5 min-w-0">
                        <div class="font-mono tabular-nums text-[10px] font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide" x-text="item.winning_color || item.dominant_color || '#888888'"></div>
                        <div class="text-[9px] text-slate-500 dark:text-slate-400 font-medium truncate max-w-[110px]" x-text="item.culinary_color_name || 'Culinary Accent'" :title="item.culinary_color_name"></div>
                      </div>
                    </div>
                  </td>`,
                  actionsHtml: `
                  <!-- 7. Action -->
                  <td class="py-3 px-3 text-right whitespace-nowrap">
                    <div class="flex items-center justify-end space-x-1">
                      <button @click="openHubDrawer(item)" class="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 text-xs font-semibold shadow-sm active:scale-95 transition">
                        <i data-lucide="eye" class="w-3.5 h-3.5"></i>
                        <span>Inspect</span>
                      </button>
                      <button @click="copyHubReSpinAngle(item)" class="p-1.5 rounded-xl border border-slate-200 dark:border-[#27272A] hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition active:scale-95" title="Copy Viral Angle">
                        <i data-lucide="copy" class="w-3.5 h-3.5"></i>
                      </button>
                    </div>
                  </td>`
                })}
              </template>

              <!-- Empty Table Placeholder -->
              <template x-if="paginatedIntersections.length === 0">
                <tr>
                  <td colspan="7" class="py-12 text-center text-slate-500 dark:text-slate-400 font-mono tabular-nums text-xs">
                    <div class="flex flex-col items-center justify-center space-y-2">
                      <i data-lucide="search-x" class="w-8 h-8 text-slate-400"></i>
                      <div class="font-bold text-slate-700 dark:text-slate-300">No intersecting hubs matching your filters</div>
                      <button @click="resetIntersectionFilters()" class="text-amber-600 dark:text-amber-400 underline font-semibold cursor-pointer">Reset all filters</button>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>

        <!-- 4. Dynamic Pagination Bar -->
        <div class="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-[#27272A] text-xs font-mono tabular-nums">
          <!-- Left: Page Info & Page Size Selector -->
          <div class="flex items-center space-x-3 text-slate-600 dark:text-slate-400">
            <div>
              Showing <span class="font-bold text-slate-900 dark:text-white" x-text="filteredIntersections.length ? ((intersectionPage - 1) * intersectionPageSize + 1) : 0"></span>
              to <span class="font-bold text-slate-900 dark:text-white" x-text="Math.min(intersectionPage * intersectionPageSize, filteredIntersections.length)"></span>
              of <span class="font-bold text-slate-900 dark:text-white" x-text="filteredIntersections.length"></span> hubs
            </div>

            <div class="flex items-center space-x-1 pl-2 border-l border-slate-200 dark:border-[#27272A]">
              <span class="text-[10px] uppercase text-slate-400">Per page:</span>
              <select x-model.number="intersectionPageSize" @change="intersectionPage = 1" class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] rounded-lg px-2 py-0.5 text-xs text-slate-800 dark:text-slate-200 font-mono tabular-nums focus:outline-none cursor-pointer">
                <option :value="12">12</option>
                <option :value="24">24 (Golden Core)</option>
                <option :value="48">48</option>
                <option :value="96">96</option>
              </select>
            </div>
          </div>

          <!-- Right: Page Navigation Controls -->
          <div class="flex items-center space-x-1">
            <!-- First Page -->
            <button @click="setIntersectionPage(1)" :disabled="intersectionPage === 1" 
                    class="px-2 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-800 transition">
              <i data-lucide="chevrons-left" class="w-3.5 h-3.5"></i>
            </button>
            <!-- Previous Page -->
            <button @click="setIntersectionPage(intersectionPage - 1)" :disabled="intersectionPage === 1" 
                    class="px-2 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-800 transition">
              <i data-lucide="chevron-left" class="w-3.5 h-3.5"></i>
            </button>

            <!-- Page Number Pills -->
            <template x-for="p in intersectionVisiblePages" :key="p">
              <div>
                <template x-if="p === '...'">
                  <span class="px-2 py-1 text-slate-400 font-mono tabular-nums">...</span>
                </template>
                <template x-if="p !== '...'">
                  <button @click="setIntersectionPage(p)" 
                          class="px-2.5 py-1 rounded-lg border text-xs font-mono tabular-nums font-bold transition"
                          :class="intersectionPage === p ? 'bg-amber-500 border-amber-600 text-white shadow-sm' : 'border-slate-200 dark:border-[#27272A] bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'"
                          x-text="p"></button>
                </template>
              </div>
            </template>

            <!-- Next Page -->
            <button @click="setIntersectionPage(intersectionPage + 1)" :disabled="intersectionPage === intersectionTotalPages" 
                    class="px-2 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-800 transition">
              <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>
            </button>
            <!-- Last Page -->
            <button @click="setIntersectionPage(intersectionTotalPages)" :disabled="intersectionPage === intersectionTotalPages" 
                    class="px-2 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-800 transition">
              <i data-lucide="chevrons-right" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </div>

      </div>
    </div>`;
}
