/**
 * Level 2 SERP Radar Studio — Tab 2: Pinterest Trends (52-Week Seasonality, Demographics & Popular Pins)
 */
export function renderSerpStudioTrendsTab() {
  return `      <!-- TAB 2: PINTEREST TRENDS (52-WEEK SEASONALITY & DEMOGRAPHICS) -->
      <div x-show="activeTab === 'trends'" class="p-6 space-y-6">
        
        <div class="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 dark:border-[#27272A]/80 gap-3">
          <div>
            <div class="flex items-center space-x-2">
              <h3 class="text-base font-black text-slate-900 dark:text-white">Interest Over Time (52-Week Official Curve)</h3>
              <span class="px-2 py-0.5 text-[10px] font-bold uppercase rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30 font-mono tabular-nums">trends.pinterest.com</span>
            </div>
            <p class="text-xs text-slate-500">Weekly relative search popularity indexed from 0 to 100 over the past 12 months</p>
          </div>

          <div class="flex items-center space-x-3 text-xs font-mono tabular-nums">
            <div class="px-3 py-1 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
              Peak: <strong x-text="trendsData?.peak_value ?? '—'"></strong>/100
            </div>
            <div class="px-3 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
              Latest: <strong x-text="trendsData?.current_index ?? '—'"></strong>/100
            </div>
          </div>
        </div>

        <!-- 52-Week Interactive SVG Chart (Exact Pinterest Trends Parity) -->
        <div class="p-6 rounded-3xl bg-slate-900/80 border border-slate-800 space-y-3 relative overflow-hidden">
          <div class="flex items-center justify-between text-xs text-slate-400 font-mono tabular-nums px-2">
            <span>52 Weeks Ago</span>
            <span>26 Weeks Ago (Mid-Year)</span>
            <span class="text-blue-400 font-bold">Current Week</span>
          </div>

          <svg class="w-full h-48 overflow-visible" viewBox="0 0 800 180" preserveAspectRatio="none">
            <defs>
              <linearGradient id="trendsBlueGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.45"/>
                <stop offset="100%" stop-color="#3b82f6" stop-opacity="0.0"/>
              </linearGradient>
            </defs>
            <!-- Horizontal Gridlines (20, 40, 60, 80, 100) -->
            <line x1="0" y1="36" x2="800" y2="36" stroke="#334155" stroke-dasharray="4" stroke-width="1"/>
            <line x1="0" y1="72" x2="800" y2="72" stroke="#334155" stroke-dasharray="4" stroke-width="1"/>
            <line x1="0" y1="108" x2="800" y2="108" stroke="#334155" stroke-dasharray="4" stroke-width="1"/>
            <line x1="0" y1="144" x2="800" y2="144" stroke="#334155" stroke-dasharray="4" stroke-width="1"/>

            <!-- Area & Line -->
            <path :d="getTrendsAreaPath(trendsData?.counts_52_weeks || []).area" fill="url(#trendsBlueGrad)"/>
            <path :d="getTrendsAreaPath(trendsData?.counts_52_weeks || []).line" fill="none" stroke="#3b82f6" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>

        <!-- Related Trends Chips with Sparklines (Image 2 Parity) -->
        <div class="space-y-3">
          <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono tabular-nums">Related Trends & Comparison</h4>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <template x-for="r in (trendsData?.related_trends || [])" :key="r.term">
              <div @click="loadKeywordBySlugOrText(r.term, true, true)"
                   class="p-3.5 rounded-2xl bg-slate-50/80 dark:bg-slate-900/50 border border-slate-200 dark:border-[#27272A] hover:border-blue-500/50 transition cursor-pointer flex items-center justify-between">
                <div class="min-w-0 pr-2">
                  <p class="text-xs font-bold text-slate-900 dark:text-white capitalize truncate" x-text="r.term"></p>
                  <span class="text-[10px] text-blue-500 font-mono tabular-nums">+ Track Query</span>
                </div>
                <svg class="w-20 h-5 overflow-visible shrink-0" viewBox="0 0 80 20">
                  <path :d="generateSparklinePath(r.counts, 80, 20)" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round"/>
                </svg>
              </div>
            </template>
          </div>
        </div>

        <!-- Demographics: Age & Gender Distribution (Image 2 Parity) -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
          <!-- Age Distribution -->
          <div class="p-5 rounded-3xl bg-slate-50/70 dark:bg-slate-900/50 border border-slate-200/80 dark:border-[#27272A] space-y-3">
            <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono tabular-nums">Audience Age Distribution</h4>
            <div class="space-y-2">
              <template x-for="a in (trendsData?.demographics?.age || [])" :key="a.group">
                <div class="space-y-1">
                  <div class="flex items-center justify-between text-xs font-mono tabular-nums">
                    <span class="text-slate-500" x-text="a.group"></span>
                    <span class="font-bold text-slate-900 dark:text-white" x-text="a.display_pct || (a.pct + '%')"></span>
                  </div>
                  <div class="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <div class="h-full bg-blue-500 rounded-full" :style="'width: ' + (a.pct > 0 ? Math.max(a.pct, 3) : 0) + '%'"></div>
                  </div>
                </div>
              </template>
            </div>
          </div>

          <!-- Gender Distribution -->
          <div class="p-5 rounded-3xl bg-slate-50/70 dark:bg-slate-900/50 border border-slate-200/80 dark:border-[#27272A] space-y-3">
            <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono tabular-nums">Audience Gender Distribution</h4>
            <template x-if="trendsData?.demographics?.gender">
              <div class="space-y-4 pt-2">
                <div class="space-y-1">
                  <div class="flex items-center justify-between text-xs font-mono tabular-nums">
                    <span class="text-slate-500">Female</span>
                    <span class="font-bold text-rose-500" x-text="trendsData?.demographics?.gender?.female_display || ((trendsData?.demographics?.gender?.female_pct ?? 0) + '%')"></span>
                  </div>
                  <div class="w-full h-3 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <div class="h-full bg-rose-500 rounded-full" :style="'width: ' + (trendsData?.demographics?.gender?.female_pct ?? 0) + '%'"></div>
                  </div>
                </div>

                <div class="space-y-1">
                  <div class="flex items-center justify-between text-xs font-mono tabular-nums">
                    <span class="text-slate-500">Male</span>
                    <span class="font-bold text-cyan-500" x-text="trendsData?.demographics?.gender?.male_display || ((trendsData?.demographics?.gender?.male_pct ?? 0) + '%')"></span>
                  </div>
                  <div class="w-full h-3 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <div class="h-full bg-cyan-500 rounded-full" :style="'width: ' + ((trendsData?.demographics?.gender?.male_pct ?? 0) > 0 ? Math.max(trendsData.demographics.gender.male_pct, 3) : 0) + '%'"></div>
                  </div>
                </div>

                <div class="space-y-1">
                  <div class="flex items-center justify-between text-xs font-mono tabular-nums">
                    <span class="text-slate-500">Unspecified / Custom</span>
                    <span class="font-bold text-slate-400" x-text="trendsData?.demographics?.gender?.unspecified_display || ((trendsData?.demographics?.gender?.unspecified_pct ?? 0) + '%')"></span>
                  </div>
                  <div class="w-full h-3 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <div class="h-full bg-slate-500 rounded-full" :style="'width: ' + (trendsData?.demographics?.gender?.unspecified_pct ?? 0) + '%'"></div>
                  </div>
                </div>
              </div>
            </template>
            <template x-if="!trendsData?.demographics?.gender">
              <p class="text-xs text-slate-400 italic py-4">No demographic breakdown available for this query yet.</p>
            </template>
          </div>
        </div>

        <!-- Pinterest Official Guided Search Pivots (Image 2 Parity) -->
        <template x-if="trendsData?.ideas_pivots && trendsData.ideas_pivots.length > 0">
          <div class="space-y-3 pt-2">
            <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono tabular-nums">Pinterest Guided Search Capsules (Pivots)</h4>
            <div class="flex flex-wrap gap-2">
              <template x-for="p in trendsData.ideas_pivots" :key="p.label">
                <button @click="loadKeywordBySlugOrText(p.full_name, true, true)"
                        class="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-[#27272A] text-slate-700 dark:text-slate-300 hover:text-emerald-500 dark:hover:text-emerald-400 transition cursor-pointer flex items-center space-x-1">
                  <span>+</span>
                  <span x-text="p.label"></span>
                </button>
              </template>
            </div>
          </div>
        </template>

        <!-- Pinterest Official Related Interests Taxonomy (Image 3 Parity) -->
        <template x-if="trendsData?.related_interests && trendsData.related_interests.length > 0">
          <div class="space-y-3 pt-2">
            <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono tabular-nums">Pinterest Taxonomy Related Interests</h4>
            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
              <template x-for="ri in trendsData.related_interests" :key="ri">
                <div @click="loadKeywordBySlugOrText(ri, true, true)"
                     class="p-3 rounded-2xl bg-slate-50/70 dark:bg-slate-900/50 border border-slate-200/80 dark:border-[#27272A] hover:border-emerald-500/40 transition cursor-pointer group">
                  <p class="text-xs font-bold text-slate-900 dark:text-white capitalize group-hover:text-emerald-500 transition line-clamp-1" x-text="ri"></p>
                  <span class="text-[10px] text-emerald-500 font-mono tabular-nums mt-1 block">+ Track Interest</span>
                </div>
              </template>
            </div>
          </div>
        </template>

        <!-- Pinterest Official Popular Pins (Image 2 Parity) -->
        <div class="space-y-4 pt-4 border-t border-slate-100 dark:border-[#27272A]/80">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div class="space-y-0.5">
              <div class="flex items-center space-x-2">
                <h4 class="text-sm font-bold text-slate-900 dark:text-white font-sans tracking-tight">Popular Pins</h4>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-mono tabular-nums font-bold bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30">736x HD</span>
              </div>
              <p class="text-xs text-slate-500">Browse official popular Pins based on your keywords in high definition</p>
            </div>
            
            <div class="flex items-center space-x-2">
              <!-- View Switcher: Full Pins (736x) vs Official Collage vs Interactive Cards -->
              <div class="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800/90 p-1 border border-slate-200/80 dark:border-[#27272A]/60 text-xs">
                <button @click="popularPinsView = 'full'; $nextTick(() => { if (window.lucide) window.lucide.createIcons(); })"
                        :class="popularPinsView === 'full' ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm font-bold' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-medium'"
                        class="px-2.5 py-1 rounded-lg transition flex items-center space-x-1 cursor-pointer"
                        title="View all popular pins at 736x HD">
                  <i data-lucide="layout-grid" class="w-3.5 h-3.5"></i>
                  <span>Full Pins (736x)</span>
                </button>
                <button @click="popularPinsView = 'collage'; $nextTick(() => { if (window.lucide) window.lucide.createIcons(); })"
                        :class="popularPinsView === 'collage' ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm font-bold' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-medium'"
                        class="px-2.5 py-1 rounded-lg transition flex items-center space-x-1 cursor-pointer"
                        title="Official Pinterest Trends collage">
                  <i data-lucide="columns-3" class="w-3.5 h-3.5"></i>
                  <span>Official Collage</span>
                </button>
                <button @click="popularPinsView = 'grid'; $nextTick(() => { if (window.lucide) window.lucide.createIcons(); })"
                        :class="popularPinsView === 'grid' ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm font-bold' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-medium'"
                        class="px-2.5 py-1 rounded-lg transition flex items-center space-x-1 cursor-pointer"
                        title="Interactive analysis cards">
                  <i data-lucide="bar-chart-2" class="w-3.5 h-3.5"></i>
                  <span>Interactive Cards</span>
                </button>
              </div>

              <button @click="fetchTrends(selectedKeyword?.keyword || activeKeywordQuery, true)"
                      class="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition flex items-center space-x-1.5 cursor-pointer">
                <i data-lucide="refresh-cw" class="w-3 h-3" :class="isTrendsLoading ? 'animate-spin' : ''"></i>
                <span>Refresh Trends</span>
              </button>
            </div>
          </div>

          <!-- VIEW 1: FULL 9 PINS GALLERY (COMPLETE UNROPPED IMAGES AT 736x RESOLUTION) -->
          <div x-show="popularPinsView === 'full'" class="space-y-4">
            <template x-if="trendsData?.collage_images && trendsData.collage_images.length > 0">
              <div class="space-y-3">
                <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-3 gap-4">
                  <template x-for="(imgUrl, idx) in (trendsData?.collage_images || []).filter(Boolean)" :key="idx">
                    <div class="group relative rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-[#27272A] hover:border-blue-500/50 shadow-xs hover:shadow-md transition duration-300 overflow-hidden flex flex-col justify-between">
                      
                      <!-- Full Pin Image Container with fixed 2:3 aspect ratio -->
                      <a :href="safeUrl((imgUrl || '').replace('/236x/', '/736x/').replace('/474x/', '/736x/'))" target="_blank" rel="noopener noreferrer"
                         class="relative block w-full aspect-[2/3] bg-slate-100 dark:bg-slate-950/80 flex items-center justify-center overflow-hidden p-2 cursor-pointer">
                        <img :src="(imgUrl || '').replace('/236x/', '/736x/').replace('/474x/', '/736x/')"
                             :alt="'Pin #' + (idx + 1)"
                             class="w-full h-full object-contain rounded-xl group-hover:scale-[1.02] transition duration-300"
                             loading="lazy"
                             referrerpolicy="no-referrer"
                             @error="if ($el.src.includes('/736x/')) { $el.src = $el.src.replace('/736x/', '/474x/'); } else if ($el.src.includes('/474x/')) { $el.src = $el.src.replace('/474x/', '/236x/'); }">
                        
                        <!-- Rank Badge -->
                        <div class="absolute top-4 left-4 px-2.5 py-1 rounded-lg bg-slate-950/80 text-white font-mono tabular-nums font-black text-xs backdrop-blur-xs shadow-md">
                          <span x-text="'#' + (idx + 1)"></span>
                        </div>

                        <!-- 736x HD Badge -->
                        <div class="absolute top-4 right-4 px-2 py-0.5 rounded-md bg-blue-600 text-white font-mono tabular-nums font-bold text-[10px] backdrop-blur-xs shadow-md uppercase tracking-wider">
                          736x HD
                        </div>

                        <!-- Hover Overlay -->
                        <div class="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition duration-200 flex items-center justify-center gap-2 backdrop-blur-[2px]">
                          <span class="px-3.5 py-2 rounded-xl bg-white text-slate-900 text-xs font-bold hover:bg-slate-100 shadow-md flex items-center space-x-1.5 transition">
                            <i data-lucide="maximize-2" class="w-3.5 h-3.5 text-blue-600"></i>
                            <span>Open 736x Full Image</span>
                          </span>
                        </div>
                      </a>

                      <!-- Card Details Bottom Strip -->
                      <div class="p-3 border-t border-slate-100 dark:border-[#27272A]/80 flex items-center justify-between text-xs">
                        <div class="flex items-center space-x-2 min-w-0 pr-2">
                          <span class="w-2 h-2 rounded-full bg-blue-500 shrink-0"></span>
                          <span class="font-bold text-slate-800 dark:text-slate-200 truncate capitalize"
                                x-text="(trendsData?.term || selectedKeyword?.keyword || activeKeywordQuery || 'Popular') + ' Pin ' + (idx + 1)"></span>
                        </div>
                        <a :href="'https://www.pinterest.com/search/pins/?q=' + encodeURIComponent(trendsData?.term || selectedKeyword?.keyword || activeKeywordQuery || '')" target="_blank" rel="noopener noreferrer"
                           class="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-medium text-[11px] transition flex items-center space-x-1 shrink-0">
                          <i data-lucide="external-link" class="w-3 h-3 text-red-500"></i>
                          <span>Pinterest</span>
                        </a>
                      </div>

                    </div>
                  </template>
                </div>

                <!-- Footer Pill -->
                <div class="flex items-center space-x-2 pt-2 px-1">
                  <span class="w-2.5 h-2.5 rounded-full bg-blue-600 dark:bg-blue-500 inline-block"></span>
                  <span class="text-xs font-bold text-slate-900 dark:text-slate-100 font-sans"
                        x-text="(trendsData?.term || selectedKeyword?.keyword || activeKeywordQuery || 'Popular') + ' — All 9 Official Viral Pins in Full HD (736x)'"></span>
                </div>
              </div>
            </template>

            <!-- Loading or Empty state -->
            <template x-if="!trendsData?.collage_images || trendsData.collage_images.length === 0">
              <div class="py-12 text-center text-xs text-slate-400 italic rounded-2xl border border-slate-200 dark:border-[#27272A] bg-slate-50/50 dark:bg-slate-900/30">
                <i data-lucide="image" class="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2"></i>
                <p>Loading full 736x popular pins...</p>
              </div>
            </template>
          </div>

          <!-- VIEW 2: OFFICIAL PINTEREST TRENDS COLLAGE BANNER (736x RESOLUTION) -->
          <div x-show="popularPinsView === 'collage'" class="space-y-3">
            <template x-if="trendsData?.collage_images && trendsData.collage_images.length >= 5">
              <div class="space-y-2">
                <!-- The 5-Column Collage Card -->
                <a :href="safeUrl('https://www.pinterest.com/search/pins/?q=' + encodeURIComponent(trendsData?.term || selectedKeyword?.keyword || activeKeywordQuery || ''))" target="_blank" rel="noopener noreferrer"
                   class="group relative block h-[440px] sm:h-[480px] md:h-[520px] w-full rounded-2xl overflow-hidden border border-slate-200 dark:border-[#27272A] bg-slate-100 dark:bg-slate-900/60 cursor-pointer shadow-sm hover:shadow-md transition">
                  
                  <div class="grid grid-cols-5 h-full w-full gap-[3px] bg-slate-200 dark:bg-slate-800">
                    <!-- Column 1: Full Height Image A[0] -->
                    <div class="relative h-full w-full overflow-hidden bg-slate-300 dark:bg-slate-700">
                      <img :src="(trendsData.collage_images[0] || '').replace('/236x/', '/736x/').replace('/474x/', '/736x/')"
                           class="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.02] transition duration-300"
                           loading="lazy"
                           referrerpolicy="no-referrer"
                           @error="if ($el.src.includes('/736x/')) { $el.src = $el.src.replace('/736x/', '/474x/'); } else if ($el.src.includes('/474x/')) { $el.src = $el.src.replace('/474x/', '/236x/'); }">
                    </div>

                    <!-- Column 2: Stacked A[7] (Top 40%) & A[8] (Bottom 60%) -->
                    <div class="h-full w-full flex flex-col gap-[3px]">
                      <div class="relative min-h-0 w-full overflow-hidden bg-slate-300 dark:bg-slate-700" style="flex: 4 1 0%;">
                        <img :src="(trendsData.collage_images[7] || trendsData.collage_images[1] || '').replace('/236x/', '/736x/').replace('/474x/', '/736x/')"
                             class="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.02] transition duration-300"
                             loading="lazy"
                             referrerpolicy="no-referrer"
                             @error="if ($el.src.includes('/736x/')) { $el.src = $el.src.replace('/736x/', '/474x/'); } else if ($el.src.includes('/474x/')) { $el.src = $el.src.replace('/474x/', '/236x/'); }">
                      </div>
                      <div class="relative min-h-0 w-full overflow-hidden bg-slate-300 dark:bg-slate-700" style="flex: 6 1 0%;">
                        <img :src="(trendsData.collage_images[8] || trendsData.collage_images[2] || '').replace('/236x/', '/736x/').replace('/474x/', '/736x/')"
                             class="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.02] transition duration-300"
                             loading="lazy"
                             referrerpolicy="no-referrer"
                             @error="if ($el.src.includes('/736x/')) { $el.src = $el.src.replace('/736x/', '/474x/'); } else if ($el.src.includes('/474x/')) { $el.src = $el.src.replace('/474x/', '/236x/'); }">
                      </div>
                    </div>

                    <!-- Column 3: Stacked A[5] (Top 40%) & A[6] (Bottom 60%) -->
                    <div class="h-full w-full flex flex-col gap-[3px]">
                      <div class="relative min-h-0 w-full overflow-hidden bg-slate-300 dark:bg-slate-700" style="flex: 4 1 0%;">
                        <img :src="(trendsData.collage_images[5] || trendsData.collage_images[3] || '').replace('/236x/', '/736x/').replace('/474x/', '/736x/')"
                             class="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.02] transition duration-300"
                             loading="lazy"
                             referrerpolicy="no-referrer"
                             @error="if ($el.src.includes('/736x/')) { $el.src = $el.src.replace('/736x/', '/474x/'); } else if ($el.src.includes('/474x/')) { $el.src = $el.src.replace('/474x/', '/236x/'); }">
                      </div>
                      <div class="relative min-h-0 w-full overflow-hidden bg-slate-300 dark:bg-slate-700" style="flex: 6 1 0%;">
                        <img :src="(trendsData.collage_images[6] || trendsData.collage_images[4] || '').replace('/236x/', '/736x/').replace('/474x/', '/736x/')"
                             class="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.02] transition duration-300"
                             loading="lazy"
                             referrerpolicy="no-referrer"
                             @error="if ($el.src.includes('/736x/')) { $el.src = $el.src.replace('/736x/', '/474x/'); } else if ($el.src.includes('/474x/')) { $el.src = $el.src.replace('/474x/', '/236x/'); }">
                      </div>
                    </div>

                    <!-- Column 4: Stacked A[3] (Top 60%) & A[4] (Bottom 40%) -->
                    <div class="h-full w-full flex flex-col gap-[3px]">
                      <div class="relative min-h-0 w-full overflow-hidden bg-slate-300 dark:bg-slate-700" style="flex: 6 1 0%;">
                        <img :src="(trendsData.collage_images[3] || trendsData.collage_images[1] || '').replace('/236x/', '/736x/').replace('/474x/', '/736x/')"
                             class="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.02] transition duration-300"
                             loading="lazy"
                             referrerpolicy="no-referrer"
                             @error="if ($el.src.includes('/736x/')) { $el.src = $el.src.replace('/736x/', '/474x/'); } else if ($el.src.includes('/474x/')) { $el.src = $el.src.replace('/474x/', '/236x/'); }">
                      </div>
                      <div class="relative min-h-0 w-full overflow-hidden bg-slate-300 dark:bg-slate-700" style="flex: 4 1 0%;">
                        <img :src="(trendsData.collage_images[4] || trendsData.collage_images[2] || '').replace('/236x/', '/736x/').replace('/474x/', '/736x/')"
                             class="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.02] transition duration-300"
                             loading="lazy"
                             referrerpolicy="no-referrer"
                             @error="if ($el.src.includes('/736x/')) { $el.src = $el.src.replace('/736x/', '/474x/'); } else if ($el.src.includes('/474x/')) { $el.src = $el.src.replace('/474x/', '/236x/'); }">
                      </div>
                    </div>

                    <!-- Column 5: Stacked A[1] (Top 40%) & A[2] (Bottom 60%) -->
                    <div class="h-full w-full flex flex-col gap-[3px]">
                      <div class="relative min-h-0 w-full overflow-hidden bg-slate-300 dark:bg-slate-700" style="flex: 4 1 0%;">
                        <img :src="(trendsData.collage_images[1] || trendsData.collage_images[0] || '').replace('/236x/', '/736x/').replace('/474x/', '/736x/')"
                             class="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.02] transition duration-300"
                             loading="lazy"
                             referrerpolicy="no-referrer"
                             @error="if ($el.src.includes('/736x/')) { $el.src = $el.src.replace('/736x/', '/474x/'); } else if ($el.src.includes('/474x/')) { $el.src = $el.src.replace('/474x/', '/236x/'); }">
                      </div>
                      <div class="relative min-h-0 w-full overflow-hidden bg-slate-300 dark:bg-slate-700" style="flex: 6 1 0%;">
                        <img :src="(trendsData.collage_images[2] || trendsData.collage_images[0] || '').replace('/236x/', '/736x/').replace('/474x/', '/736x/')"
                             class="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.02] transition duration-300"
                             loading="lazy"
                             referrerpolicy="no-referrer"
                             @error="if ($el.src.includes('/736x/')) { $el.src = $el.src.replace('/736x/', '/474x/'); } else if ($el.src.includes('/474x/')) { $el.src = $el.src.replace('/474x/', '/236x/'); }">
                      </div>
                    </div>
                  </div>

                  <!-- Hover Overlay -->
                  <div class="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition flex items-center justify-center pointer-events-none">
                    <span class="px-4 py-2 rounded-full bg-white/90 dark:bg-slate-900/90 text-xs font-bold text-slate-900 dark:text-white shadow-lg flex items-center space-x-1.5 backdrop-blur-sm">
                      <i data-lucide="external-link" class="w-3.5 h-3.5 text-blue-500"></i>
                      <span>Browse Related Pins on Pinterest</span>
                    </span>
                  </div>
                </a>

                <!-- Bottom Indicator Dot Pill -->
                <div class="flex items-center space-x-2 pt-1 px-1">
                  <span class="w-2.5 h-2.5 rounded-full bg-blue-600 dark:bg-blue-500 inline-block"></span>
                  <span class="text-xs font-bold text-slate-900 dark:text-slate-100 font-sans"
                        x-text="trendsData?.term || selectedKeyword?.keyword || activeKeywordQuery"></span>
                </div>
              </div>
            </template>

            <!-- Loading or Empty state for collage -->
            <template x-if="!trendsData?.collage_images || trendsData.collage_images.length < 5">
              <div class="py-12 text-center text-xs text-slate-400 italic rounded-2xl border border-slate-200 dark:border-[#27272A] bg-slate-50/50 dark:bg-slate-900/30">
                <i data-lucide="image" class="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2"></i>
                <p>Loading official Pinterest Trends collage...</p>
              </div>
            </template>
          </div>

          <!-- VIEW 2: INTERACTIVE PIN CARDS (DOSSIER & VELOCITY) -->
          <div x-show="popularPinsView === 'grid'" class="space-y-4">
            <template x-if="!trendsData?.popular_pins || trendsData.popular_pins.length === 0">
              <div class="py-12 text-center text-xs text-slate-400 italic">
                No popular pins extracted yet for this trend. Crawl keyword or click refresh.
              </div>
            </template>

            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3.5">
              <template x-for="p in (trendsData?.popular_pins || [])" :key="p.pin_id || p.id">
                <div :data-pin-id="p.pin_id || p.id"
                     @click="openPinInspector({ pin_id: p.pin_id || p.id, title: p.title, image_url: p.image_url, domain: p.domain, save_count: p.save_count, repin_count: p.repin_count })"
                     class="group rounded-2xl bg-slate-50/80 dark:bg-slate-900/50 border border-slate-200/80 dark:border-[#27272A] hover:border-blue-500/50 overflow-hidden transition cursor-pointer flex flex-col justify-between">
                  
                  <div class="relative aspect-[2/3] bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <template x-if="p.image_url">
                      <img :src="p.image_url" class="w-full h-full object-cover group-hover:scale-105 transition duration-300" loading="lazy" referrerpolicy="no-referrer" onerror="if(window.handlePinImgError){window.handlePinImgError(this)}else{this.onerror=null}">
                    </template>
                    <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition flex items-end p-2.5">
                      <span class="text-[10px] font-bold text-white flex items-center space-x-1">
                        <i data-lucide="eye" class="w-3 h-3"></i>
                        <span>Inspect Dossier</span>
                      </span>
                    </div>
                  </div>

                  <div class="p-2.5 space-y-1">
                    <h5 class="text-xs font-bold text-slate-900 dark:text-white line-clamp-2 leading-tight group-hover:text-blue-500 transition"
                        x-text="p.title || 'Popular Pin'"></h5>
                    <div class="flex items-center justify-between text-[10px] text-slate-400 font-mono tabular-nums">
                      <span class="truncate max-w-[80px]" x-text="p.pinner?.full_name || p.domain || 'Pinterest'"></span>
                      <a :href="'https://www.pinterest.com/pin/' + (p.pin_id || p.id) + '/'" target="_blank" rel="noopener noreferrer" @click.stop class="text-blue-500 hover:underline">
                        <i data-lucide="external-link" class="w-3 h-3"></i>
                      </a>
                    </div>
                  </div>

                </div>
              </template>
            </div>
          </div>
        </div>

      </div>`;
}
