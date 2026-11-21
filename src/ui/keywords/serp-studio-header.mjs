/**
 * Level 2 SERP Radar Studio — Header, Keyword Omnibar, Guided Capsules & 4-Card KPI Ribbon
 */
export function renderSerpStudioHeader() {
  return `      <!-- Studio Return Button -->
      <div class="flex items-center justify-between">
        <button @click="switchToDashboard()"
                class="px-4 py-2 rounded-2xl text-xs font-bold bg-white dark:bg-[#121215] hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-[#27272A] text-slate-700 dark:text-slate-300 transition flex items-center space-x-2 shadow-xs cursor-pointer">
          <i data-lucide="arrow-left" class="w-4 h-4 text-emerald-500"></i>
          <span>← Back to Keywords Dashboard</span>
        </button>
        <span class="text-xs font-mono tabular-nums text-slate-400">Level 2: SERP Radar Studio</span>
      </div>

    <!-- EXECUTIVE CONTROL BAR: KEYWORD OMNIBAR & DIRECT ACTIONS -->
    <section class="p-4 sm:p-6 rounded-3xl bg-white dark:bg-[#121215] border border-slate-200/80 dark:border-[#27272A] shadow-xs space-y-4">
      <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        
        <!-- Left: Active Keyword Title, Volume & Deep Metadata -->
        <div class="flex items-start sm:items-center space-x-3.5 min-w-0">
          <div class="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shadow-lg shadow-emerald-600/20 shrink-0">
            <i data-lucide="search" class="w-6 h-6"></i>
          </div>
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="text-xl sm:text-2xl font-black text-slate-900 dark:text-white capitalize truncate"
                  x-text="selectedKeyword?.keyword || activeKeywordQuery || 'Enter Keyword'"></h2>
              
              <!-- Official Pinterest Monthly Search Volume Badge (PinClicks & Pinterest Parity) -->
              <div class="flex items-center space-x-1.5 px-3 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30 text-xs font-mono tabular-nums font-black"
                   :title="trendsData?.exact_volume ? 'Official Pinterest Annotation Search Count (Live)' : 'Estimated Pinterest Monthly Search Volume'">
                <i data-lucide="bar-chart-2" class="w-3.5 h-3.5"></i>
                <span>Volume:</span>
                <span x-text="formatNumber(trendsData?.exact_volume || trendsData?.estimated_volume || 380878)"></span>
              </div>

              <!-- Official Pinterest Category Tree Tag -->
              <template x-if="trendsData?.category_tree && trendsData.category_tree.length > 0">
                <span class="px-2.5 py-0.5 rounded-full text-[10px] font-mono tabular-nums font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 truncate max-w-[240px]"
                      :title="'Taxonomy: ' + trendsData.category_tree.join(' > ')"
                      x-text="trendsData.category_tree.join(' > ')"></span>
              </template>
              <template x-if="!trendsData?.category_tree || trendsData.category_tree.length === 0">
                <span class="px-2.5 py-0.5 rounded-full text-[10px] font-mono tabular-nums font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                      x-text="selectedKeyword?.category || 'Organic Search'"></span>
              </template>

              <!-- Annotation ID Badge -->
              <template x-if="trendsData?.annotation_id">
                <span class="px-2.5 py-0.5 rounded-full text-[10px] font-mono tabular-nums font-semibold bg-slate-100 dark:bg-slate-800/80 text-slate-500"
                      :title="'Official Pinterest Annotation ID: ' + trendsData.annotation_id"
                      x-text="'ID: ' + trendsData.annotation_id"></span>
              </template>

              <span class="px-2.5 py-0.5 rounded-full text-[10px] font-mono tabular-nums font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                    x-text="(selectedKeyword?.target_pin_count || appSettings.max_serp_pins || appSettings.default_max_pins || 50) + ' Pins Target (' + (selectedKeyword?.crawl_pages_limit || Math.ceil((selectedKeyword?.target_pin_count || appSettings.max_serp_pins || appSettings.default_max_pins || 50) / 25)) + ' Pages)'">
                50 Pins Target (2 Pages)
              </span>
              <template x-if="selectedKeyword?.last_crawled_at">
                <span class="text-[11px] text-slate-400 font-mono tabular-nums flex items-center space-x-1">
                  <i data-lucide="clock" class="w-3 h-3"></i>
                  <span x-text="'Crawled ' + formatDate(selectedKeyword.last_crawled_at)"></span>
                </span>
              </template>
            </div>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
              Live SERP Radar • Direct deep-link URL: <code class="text-emerald-500 font-mono tabular-nums text-[11px]" x-text="'/keywords/' + encodeURIComponent(activeSlug)"></code>
            </p>
          </div>
        </div>

        <!-- Right: Primary Actions Toolbar -->
        <div class="flex flex-wrap items-center gap-2 shrink-0">
          <button @click="rescanActiveKeyword(true)"
                  :disabled="isDetailsLoading || syncingKeywordId === selectedKeyword?.id"
                  class="px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white transition flex items-center space-x-2 shadow-md shadow-emerald-950/20 active:scale-95 disabled:opacity-50 cursor-pointer">
            <i data-lucide="refresh-cw" class="w-3.5 h-3.5" :class="(isDetailsLoading || syncingKeywordId === selectedKeyword?.id) ? 'animate-spin' : ''"></i>
            <span x-text="'Re-Crawl ' + (selectedKeyword?.target_pin_count || appSettings.max_serp_pins || appSettings.default_max_pins || 50) + ' Pins'"></span>
          </button>

          <!-- Settings Button for this specific keyword -->
          <button @click="openSettingsModal(selectedKeyword)"
                  class="px-3.5 py-2.5 rounded-2xl text-xs font-bold bg-violet-500/10 hover:bg-violet-500/20 dark:bg-violet-950/30 dark:hover:bg-violet-900/40 border border-violet-500/30 text-violet-600 dark:text-violet-400 transition flex items-center space-x-1.5 cursor-pointer"
                  title="Configure Crawl Depth & Inspection Mode for this Keyword">
            <i data-lucide="sliders" class="w-3.5 h-3.5 text-violet-500"></i>
            <span class="hidden sm:inline">Settings</span>
          </button>

          <!-- Add to Folder Dropdown Button -->
          <div class="relative" x-data="{ folderDropdownOpen: false }" @click.outside="folderDropdownOpen = false">
            <button @click="folderDropdownOpen = !folderDropdownOpen; if(folderDropdownOpen && selectedKeyword) fetchCurrentKeywordFolders()"
                    class="px-3.5 py-2.5 rounded-2xl text-xs font-bold bg-pink-500/10 hover:bg-pink-500/20 dark:bg-pink-950/30 dark:hover:bg-pink-900/40 border border-pink-500/30 text-pink-600 dark:text-pink-400 transition flex items-center space-x-1.5 cursor-pointer">
              <i data-lucide="folder-plus" class="w-3.5 h-3.5 text-pink-500"></i>
              <span class="hidden sm:inline">Folder</span>
              <span class="px-1.5 py-0.2 rounded-full text-[10px] bg-pink-500/20 text-pink-500 dark:text-pink-300 font-mono tabular-nums" x-text="currentKeywordFolders.length"></span>
            </button>
            <div x-show="folderDropdownOpen" x-cloak
                 class="absolute right-0 mt-2 w-64 bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl shadow-2xl z-50 p-2 space-y-1">
              <div class="p-2 border-b border-slate-100 dark:border-[#27272A]/80 flex items-center justify-between">
                <span class="text-[11px] font-bold text-slate-700 dark:text-slate-300">Campaign Folders</span>
                <button @click="folderDropdownOpen = false; openCreateFolderModal()" class="text-[10px] text-pink-500 font-bold hover:underline">+ New Folder</button>
              </div>
              <div class="max-h-52 overflow-y-auto space-y-1">
                <template x-for="f in folders" :key="f.id">
                  <div @click="toggleCurrentKeywordFolder(f.id)"
                       class="px-2.5 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/80 transition flex items-center justify-between cursor-pointer text-xs">
                    <div class="flex items-center space-x-2 min-w-0">
                      <span class="w-2.5 h-2.5 rounded-full shrink-0" :style="'background-color: ' + (f.color || '#ec4899')"></span>
                      <span class="truncate font-semibold text-slate-800 dark:text-slate-200" x-text="f.name"></span>
                    </div>
                    <i :data-lucide="isKeywordInFolder(f.id) ? 'check-circle-2' : 'plus-circle'"
                       class="w-3.5 h-3.5" :class="isKeywordInFolder(f.id) ? 'text-pink-500' : 'text-slate-400'"></i>
                  </div>
                </template>
                <template x-if="folders.length === 0">
                  <div class="p-3 text-center text-xs text-slate-400">No folders yet. Click + New Folder to create one!</div>
                </template>
              </div>
            </div>
          </div>

          <button @click="openFleetDispatchModal()" :disabled="isWorkflowDispatching"
                  class="px-3.5 py-2.5 rounded-2xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-[#27272A] text-slate-700 dark:text-slate-300 transition flex items-center space-x-1.5 disabled:opacity-50 cursor-pointer"
                  title="Run Autonomous 24h Crawler Fleet via GitHub Actions">
            <i data-lucide="play" class="w-3.5 h-3.5 text-emerald-500" :class="isWorkflowDispatching ? 'animate-spin' : ''"></i>
            <span class="hidden sm:inline">Trigger Fleet</span>
          </button>

          <button @click="copySEOFormula()"
                  class="p-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-[#27272A] text-slate-600 dark:text-slate-300 transition"
                  title="Copy SEO Title Formula">
            <i data-lucide="copy" class="w-4 h-4"></i>
          </button>

          <a :href="'https://www.pinterest.com/search/pins/?q=' + encodeURIComponent(selectedKeyword?.keyword || activeKeywordQuery || '')" target="_blank" rel="noopener noreferrer"
             class="p-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-[#27272A] text-slate-600 dark:text-slate-300 transition"
             title="Open on Pinterest">
            <i data-lucide="external-link" class="w-4 h-4"></i>
          </a>
        </div>

      </div>

      <!-- Center Omnibar: Instant Switcher & Predictive Autocomplete (v3_typeahead) -->
      <div class="relative pt-2 border-t border-slate-100 dark:border-[#27272A]/80">
        <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div class="relative flex-1">
            <i data-lucide="search" class="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2"></i>
            <input type="text" x-model="omnibarQuery"
                   @input.debounce.300ms="onOmnibarInput()"
                   @keydown.enter="submitOmnibarKeyword()"
                   @focus="isOmnibarDropdownOpen = true"
                   placeholder="Switch to tracked keyword or search new query (e.g. tater tot casserole, rustic farmhouse, fall fashion)..."
                   class="w-full pl-11 pr-10 py-3 rounded-2xl bg-slate-100/80 dark:bg-slate-900/90 border border-slate-200 dark:border-[#27272A] text-sm font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 shadow-xs transition">
            <div x-show="isTypeaheadLoading" class="absolute right-4 top-1/2 -translate-y-1/2">
              <i data-lucide="loader-2" class="w-4 h-4 text-emerald-500 animate-spin"></i>
            </div>
          </div>

          <button @click="submitOmnibarKeyword()" :disabled="!omnibarQuery.trim()"
                  class="px-5 py-3 rounded-2xl text-xs font-bold uppercase tracking-wider bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white transition flex items-center justify-center space-x-2 shrink-0 disabled:opacity-50">
            <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i>
            <span>Load / Track</span>
          </button>
        </div>

        <!-- Dropdown Menu -->
        <div x-show="isOmnibarDropdownOpen && (omnibarTrackedMatches.length > 0 || typeaheadSuggestions.length > 0)" x-cloak
             @click.away="isOmnibarDropdownOpen = false"
             class="absolute left-0 right-0 top-full mt-2 z-50 bg-white dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A] rounded-3xl shadow-2xl overflow-hidden p-3 space-y-2 max-h-96 overflow-y-auto">
          
          <template x-if="omnibarTrackedMatches.length > 0">
            <div class="space-y-1">
              <div class="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono tabular-nums flex items-center justify-between">
                <span>Already Tracked in Engine</span>
                <span class="text-emerald-500">1-Click Jump</span>
              </div>
              <template x-for="kw in omnibarTrackedMatches" :key="kw.id">
                <div @click="selectKeyword(kw); isOmnibarDropdownOpen = false; omnibarQuery = '';"
                     class="px-3 py-2 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-emerald-500/10 hover:text-emerald-600 dark:hover:text-emerald-400 cursor-pointer flex items-center justify-between transition">
                  <div class="flex items-center space-x-2.5">
                    <i data-lucide="check-circle" class="w-3.5 h-3.5 text-emerald-500"></i>
                    <span class="capitalize" x-text="kw.keyword"></span>
                  </div>
                  <span class="text-[10px] text-slate-400 font-mono tabular-nums" x-text="getKeywordTotalPins(kw) + ' Pins'"></span>
                </div>
              </template>
            </div>
          </template>

          <template x-if="typeaheadSuggestions.length > 0">
            <div class="space-y-1 pt-1 border-t border-slate-100 dark:border-[#27272A]/80">
              <div class="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono tabular-nums flex items-center justify-between">
                <span>Pinterest Trending Autocomplete (v3_typeahead)</span>
                <span class="text-purple-500">+ Track & Crawl</span>
              </div>
              <template x-for="sug in typeaheadSuggestions" :key="sug">
                <div @click="trackNewKeyword(sug); isOmnibarDropdownOpen = false; omnibarQuery = '';"
                     class="px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-purple-500/10 hover:text-purple-600 dark:hover:text-purple-400 cursor-pointer flex items-center justify-between transition">
                  <div class="flex items-center space-x-2.5">
                    <i data-lucide="trending-up" class="w-3.5 h-3.5 text-purple-500"></i>
                    <span class="capitalize" x-text="sug"></span>
                  </div>
                  <span class="text-[10px] text-purple-500 font-mono tabular-nums" x-text="'+ Index ' + (appSettings.default_max_pins || 50) + ' Pins'"></span>
                </div>
              </template>
            </div>
          </template>
        </div>
      </div>

      <!-- GUIDED CAPSULES RIBBON (Zone 1 - Official Pinterest Semantic Intent) -->
      <template x-if="selectedKeywordDetails?.guides && selectedKeywordDetails.guides.length > 0">
        <div class="pt-3 border-t border-slate-100 dark:border-[#27272A]/80 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div class="flex items-center space-x-2 text-xs font-bold text-slate-500 dark:text-slate-400 shrink-0">
            <i data-lucide="compass" class="w-4 h-4 text-cyan-500"></i>
            <span>Guided Keywords:</span>
          </div>
          <div class="flex-1 flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
            <template x-for="(g, i) in selectedKeywordDetails.guides" :key="g.id || g.term">
              <button @click="researchKeywordTag(selectedKeyword.keyword + ' ' + (g.display_label || g.term))"
                      class="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-cyan-500/10 hover:text-cyan-500 dark:hover:text-cyan-400 border border-slate-200 dark:border-[#27272A]/80 transition flex items-center space-x-1.5 shrink-0 cursor-pointer group"
                      :title="'Score: ' + Number(g.score || 0).toFixed(1)">
                <span class="w-2 h-2 rounded-full shrink-0" :style="'background-color: ' + (g.dominant_color || '#06b6d4')"></span>
                <span class="capitalize" x-text="g.display_label || g.term"></span>
              </button>
            </template>
          </div>
          <button @click="copySEOFormula()"
                  class="px-3 py-1 rounded-xl text-xs font-bold bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30 transition flex items-center space-x-1.5 shrink-0 cursor-pointer">
            <i data-lucide="copy" class="w-3.5 h-3.5"></i>
            <span>Copy Complete SEO Formula</span>
          </button>
        </div>
      </template>
    </section>

    <!-- ZONE 2: EXECUTIVE 4-CARD KPI ANALYTICS RIBBON -->
    <section class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      
      <!-- KPI 1: Organic SERP Volatility -->
      <div class="p-5 rounded-3xl bg-white dark:bg-[#121215] border border-slate-200/80 dark:border-[#27272A] space-y-3 shadow-xs">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-slate-500 dark:text-slate-400">SERP Movement</span>
          <span class="p-1.5 rounded-xl bg-emerald-500/10 text-emerald-500">
            <i data-lucide="activity" class="w-4 h-4"></i>
          </span>
        </div>
        <div class="flex items-center space-x-2">
          <span class="text-xl font-black text-slate-900 dark:text-white font-mono tabular-nums" x-text="selectedKeywordDetails?.current_pins?.length || 0"></span>
          <span class="text-xs text-slate-400 font-mono tabular-nums" x-text="'/ ' + (selectedKeyword?.target_pin_count || 50) + ' Organic Pins'"></span>
        </div>
        <div class="grid grid-cols-4 gap-1 pt-1 border-t border-slate-100 dark:border-[#27272A]/80 text-center">
          <div class="p-1 rounded-lg bg-emerald-500/10 text-[10px] font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400" title="Climbed">
            ▲ <span x-text="selectedKeywordDetails?.stats?.climbed || 0"></span>
          </div>
          <div class="p-1 rounded-lg bg-rose-500/10 text-[10px] font-mono tabular-nums font-bold text-rose-600 dark:text-rose-400" title="Dropped">
            ▼ <span x-text="selectedKeywordDetails?.stats?.dropped || 0"></span>
          </div>
          <div class="p-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-[10px] font-mono tabular-nums font-bold text-slate-600 dark:text-slate-400" title="Stable">
            = <span x-text="selectedKeywordDetails?.stats?.stable || 0"></span>
          </div>
          <div class="p-1 rounded-lg bg-amber-500/10 text-[10px] font-mono tabular-nums font-bold text-amber-600 dark:text-amber-400" title="New Entries">
            ★ <span x-text="selectedKeywordDetails?.stats?.new_entries || 0"></span>
          </div>
        </div>
      </div>

      <!-- KPI 2: 24h Daily Save Velocity Pulse -->
      <div class="p-5 rounded-3xl bg-white dark:bg-[#121215] border border-slate-200/80 dark:border-[#27272A] space-y-3 shadow-xs">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-slate-500 dark:text-slate-400">Save Velocity Pulse</span>
          <span class="p-1.5 rounded-xl bg-cyan-500/10 text-cyan-500">
            <i data-lucide="zap" class="w-4 h-4"></i>
          </span>
        </div>
        <div class="flex items-center space-x-2">
          <span class="text-xl font-black text-emerald-600 dark:text-emerald-400 font-mono tabular-nums"
                x-text="'+' + (selectedKeywordDetails?.avg_velocity ?? selectedKeyword?.avg_daily_velocity ?? 0) + ' /day'"></span>
        </div>
        <div class="flex items-center justify-between text-[11px] pt-1 border-t border-slate-100 dark:border-[#27272A]/80">
          <span class="text-slate-400 font-mono tabular-nums">Explosive Pins:</span>
          <span class="font-bold text-cyan-600 dark:text-cyan-400 font-mono tabular-nums" x-text="(selectedKeywordDetails?.velocity_chart?.explosive || 0) + ' Pins (≥50/d)'"></span>
        </div>
      </div>

      <!-- KPI 3: PinClicks Arbitrage Verdict -->
      <div class="p-5 rounded-3xl bg-white dark:bg-[#121215] border border-slate-200/80 dark:border-[#27272A] space-y-3 shadow-xs">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-slate-500 dark:text-slate-400">Arbitrage Verdict</span>
          <span class="p-1.5 rounded-xl bg-purple-500/10 text-purple-500">
            <i data-lucide="sparkles" class="w-4 h-4"></i>
          </span>
        </div>
        <div class="flex items-center space-x-2">
          <template x-if="selectedKeywordDetails?.intelligence?.opportunity">
            <span class="px-2.5 py-1 rounded-xl text-xs font-black font-mono tabular-nums"
                  :class="selectedKeywordDetails.intelligence.opportunity.verdict === 'WIDE_OPEN' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : (selectedKeywordDetails.intelligence.opportunity.verdict === 'COMPETITIVE' ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400' : 'bg-rose-500/20 text-rose-600 dark:text-rose-400')"
                  x-text="selectedKeywordDetails.intelligence.opportunity.verdict === 'WIDE_OPEN' ? '🟢 WIDE OPEN' : (selectedKeywordDetails.intelligence.opportunity.verdict === 'COMPETITIVE' ? '🟡 MODERATE' : '🔴 SATURATED')"></span>
          </template>
          <template x-if="!selectedKeywordDetails?.intelligence?.opportunity">
            <span class="text-sm font-bold text-slate-400">Calculating...</span>
          </template>
        </div>
        <div class="flex items-center justify-between text-[11px] pt-1 border-t border-slate-100 dark:border-[#27272A]/80">
          <span class="text-slate-400 font-mono tabular-nums">Opportunity Score:</span>
          <span class="font-bold text-purple-600 dark:text-purple-400 font-mono tabular-nums" x-text="(selectedKeywordDetails?.intelligence?.opportunity?.opportunity_score ?? 85) + ' / 100'"></span>
        </div>
      </div>

      <!-- KPI 4: Semantic Guided Capsules -->
      <div class="p-5 rounded-3xl bg-white dark:bg-[#121215] border border-slate-200/80 dark:border-[#27272A] space-y-3 shadow-xs">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-slate-500 dark:text-slate-400">Semantic Modifiers</span>
          <span class="p-1.5 rounded-xl bg-amber-500/10 text-amber-500">
            <i data-lucide="compass" class="w-4 h-4"></i>
          </span>
        </div>
        <div class="flex items-center space-x-2">
          <span class="text-xl font-black text-slate-900 dark:text-white font-mono tabular-nums" x-text="selectedKeywordDetails?.guides?.length || 0"></span>
          <span class="text-xs text-slate-400 font-mono tabular-nums">Capsules</span>
        </div>
        <div class="flex items-center justify-between text-[11px] pt-1 border-t border-slate-100 dark:border-[#27272A]/80 truncate">
          <span class="text-slate-400 font-mono tabular-nums">Top:</span>
          <span class="font-bold text-amber-600 dark:text-amber-400 font-mono tabular-nums truncate max-w-[150px]"
                x-text="selectedKeywordDetails?.guides?.[0]?.display_label || 'None'"></span>
        </div>
      </div>

    </section>`;
}
