/**
 * Level 2: SERP Radar Studio View
 * (4-Card KPI Analytics Ribbon, SERP Matrix, Domain Intel, PinClicks, Displaced Vault)
 */
import { renderCampaignWorkspaceHeader } from '../campaign-workspace-header.mjs';

export function getKeywordsSerpStudioViewHtml({ safeFolderId = '' } = {}) {
  return `    <!-- ========================================================================= -->
    <!-- LEVEL 2: SERP RADAR STUDIO (viewModeLevel === 'serp_studio')             -->
    <!-- ========================================================================= -->
    <div x-show="viewModeLevel === 'serp_studio'" x-cloak class="space-y-6">

      ${safeFolderId ? renderCampaignWorkspaceHeader({ activeRoom: 'keywords', folderId: safeFolderId }) : ''}

      <!-- Studio Return Button -->
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
                    x-text="(selectedKeyword?.target_pin_count || 50) + ' Pins Target (' + (selectedKeyword?.crawl_pages_limit || 2) + ' Pages)'">
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
            <span x-text="'Re-Crawl ' + (selectedKeyword?.target_pin_count || 50) + ' Pins'"></span>
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

          <a :href="'https://www.pinterest.com/search/pins/?q=' + encodeURIComponent(selectedKeyword?.keyword || activeKeywordQuery || '')" target="_blank"
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

    </section>

    <!-- ZONE 3: FULL-WIDTH TABBED WORKSPACE -->
    <section class="rounded-3xl bg-white dark:bg-[#121215] border border-slate-200/80 dark:border-[#27272A] shadow-xs overflow-hidden">
      
      <!-- TOP NAVIGATION BAR: Tabs (Left) + View Mode & Growth Pace (Right) -->
      <div class="px-4 sm:px-6 py-3.5 border-b border-slate-200/80 dark:border-[#27272A]/80 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white dark:bg-[#121215]">
        
        <!-- Workspace Tabs -->
        <div class="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <button @click="activeTab = 'serp'"
                  class="px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 cursor-pointer"
                  :class="activeTab === 'serp' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'">
            <i data-lucide="list-ordered" class="w-4 h-4"></i>
            <span>SERP Rankings Matrix</span>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-mono tabular-nums font-bold bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                  x-text="'#' + (filteredPins.length || 0)"></span>
          </button>

          <!-- Pinterest Trends 52-Week & Popular Pins Tab -->
          <button @click="activeTab = 'trends'"
                  class="px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 cursor-pointer"
                  :class="activeTab === 'trends' ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30 shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'">
            <i data-lucide="trending-up" class="w-4 h-4 text-blue-500"></i>
            <span>Pinterest Trends (52w & Popular)</span>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-mono tabular-nums font-bold bg-blue-500/20 text-blue-600"
                  x-text="trendsData?.current_index ? trendsData.current_index + '/100' : '52w'"></span>
          </button>

          <!-- PinClicks Intelligence Tab -->
          <button @click="activeTab = 'intelligence'"
                  class="px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 cursor-pointer"
                  :class="activeTab === 'intelligence' ? 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30 shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'">
            <i data-lucide="sparkles" class="w-4 h-4 text-purple-500"></i>
            <span>PinClicks Intelligence</span>
          </button>
        </div>

        <!-- Right Side: Growth Pace (Compact Pills) + Table/Cards Switcher -->
        <div class="flex items-center gap-2 self-start md:self-auto shrink-0" x-show="activeTab === 'serp'">
          
          <!-- Compact Growth Pace Selector -->
          <div class="flex items-center p-1 rounded-xl bg-slate-100/90 dark:bg-slate-900/90 border border-slate-200 dark:border-[#27272A] gap-0.5">
            <span class="text-[10px] font-mono tabular-nums font-bold text-slate-400 uppercase px-1.5 hidden sm:inline">Pace:</span>
            <button @click="growthPaceFilter = '24h'"
                    class="px-2 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center space-x-1"
                    :class="growthPaceFilter === '24h' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40 shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'"
                    title="Velocity over Last 24 Hours">
              <span>🔥</span>
              <span class="font-mono tabular-nums">24h</span>
            </button>
            <button @click="growthPaceFilter = '3d'"
                    class="px-2 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center space-x-1"
                    :class="growthPaceFilter === '3d' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40 shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'"
                    title="Velocity over Last 3 Days">
              <span>⏱</span>
              <span class="font-mono tabular-nums">3d</span>
            </button>
            <button @click="growthPaceFilter = '7d'"
                    class="px-2 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center space-x-1"
                    :class="growthPaceFilter === '7d' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40 shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'"
                    title="Velocity over Last 7 Days">
              <span>📅</span>
              <span class="font-mono tabular-nums">7d</span>
            </button>
            <button @click="growthPaceFilter = 'all'"
                    class="px-2 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center space-x-1"
                    :class="growthPaceFilter === 'all' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40 shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'"
                    title="All-Time Total Engagement">
              <span>⭐</span>
              <span class="font-mono tabular-nums">All</span>
            </button>
          </div>

          <!-- Cards vs Table Toggle Button -->
          <div class="flex items-center p-1 rounded-xl bg-slate-100/90 dark:bg-slate-900/90 border border-slate-200 dark:border-[#27272A]">
            <button @click="viewMode = 'table'"
                    class="px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center space-x-1 cursor-pointer"
                    :class="viewMode === 'table' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'"
                    title="Table View">
              <i data-lucide="table" class="w-3.5 h-3.5"></i>
              <span class="hidden sm:inline">Table</span>
            </button>
            <button @click="viewMode = 'cards'"
                    class="px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center space-x-1 cursor-pointer"
                    :class="viewMode === 'cards' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'"
                    title="Cards Grid View">
              <i data-lucide="layout-grid" class="w-3.5 h-3.5"></i>
              <span class="hidden sm:inline">Cards</span>
            </button>
          </div>

        </div>
      </div>

      <!-- SECONDARY CONTROL BAR: SERP Filter & Search Controls (Exclusively for SERP Tab) -->
      <div x-show="activeTab === 'serp'" class="px-4 sm:px-6 py-3 border-b border-slate-200/80 dark:border-[#27272A]/80 bg-slate-50/70 dark:bg-slate-900/40 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        
        <!-- Left: Scope Segment Filter: All Pins vs Active SERP vs Displaced Vault vs Breakouts vs High Velocity -->
        <div class="flex flex-wrap items-center gap-1.5">
          <span class="text-[10px] font-bold text-slate-400 font-mono tabular-nums uppercase tracking-wider shrink-0 mr-1 hidden sm:inline">Filter:</span>
          
          <button @click="serpScope = 'all'"
                  class="px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center space-x-1.5 border"
                  :class="serpScope === 'all' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/40 shadow-xs' : 'bg-white dark:bg-slate-900/80 border-slate-200 dark:border-[#27272A] text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700'"
                  :title="'Showing ' + allCombinedPins.length + ' of ' + totalCatalogCount + ' total catalog pins'">
            <span>🔘 All Pins</span>
            <span class="px-1.5 py-0.2 rounded-full text-[10px] font-mono tabular-nums font-bold"
                  :class="serpScope === 'all' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'"
                  x-text="totalCatalogCount > allCombinedPins.length ? (allCombinedPins.length + ' / ' + totalCatalogCount) : totalCatalogCount"></span>
          </button>
          
          <button @click="serpScope = 'active'"
                  class="px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center space-x-1.5 border"
                  :class="serpScope === 'active' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/40 shadow-xs' : 'bg-white dark:bg-slate-900/80 border-slate-200 dark:border-[#27272A] text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700'">
            <span>🟢 Active SERP</span>
            <span class="px-1.5 py-0.2 rounded-full text-[10px] font-mono tabular-nums font-bold"
                  :class="serpScope === 'active' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'"
                  x-text="(selectedKeywordDetails?.current_pins || []).length"></span>
          </button>

          <button @click="serpScope = 'displaced'; if(selectedKeyword && displacedVaultPins.length === 0) fetchDisplacedPins()"
                  class="px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center space-x-1.5 border"
                  :class="serpScope === 'displaced' ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/40 shadow-xs' : 'bg-white dark:bg-slate-900/80 border-slate-200 dark:border-[#27272A] text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700'"
                  :title="'Showing ' + displacedVaultPins.length + ' of ' + totalDisplacedCount + ' displaced vault pins'">
            <span>🔴 Displaced Vault</span>
            <span class="px-1.5 py-0.2 rounded-full text-[10px] font-mono tabular-nums font-bold"
                  :class="serpScope === 'displaced' ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'"
                  x-text="totalDisplacedCount > displacedVaultPins.length ? (displacedVaultPins.length + ' / ' + totalDisplacedCount) : totalDisplacedCount"></span>
          </button>

          <button @click="serpScope = 'breakout'"
                  class="px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center space-x-1.5 border"
                  :class="serpScope === 'breakout' ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/40 shadow-xs' : 'bg-white dark:bg-slate-900/80 border-slate-200 dark:border-[#27272A] text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700'">
            <span>🚀 Breakouts</span>
            <span class="px-1.5 py-0.2 rounded-full text-[10px] font-mono tabular-nums font-bold"
                  :class="serpScope === 'breakout' ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'"
                  x-text="breakoutPins.length"></span>
          </button>

          <button @click="serpScope = 'velocity'"
                  class="px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center space-x-1.5 border"
                  :class="serpScope === 'velocity' ? 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border-cyan-500/40 shadow-xs' : 'bg-white dark:bg-slate-900/80 border-slate-200 dark:border-[#27272A] text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700'">
            <span>⚡ High Velocity</span>
          </button>

          <!-- Active Visual Tag Filter Badge -->
          <template x-if="activeVisualTagFilter">
            <div class="flex items-center space-x-1.5 px-3 py-1 rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30 text-xs">
              <i data-lucide="tag" class="w-3.5 h-3.5"></i>
              <span class="font-bold font-mono tabular-nums" x-text="'Tag: #' + activeVisualTagFilter"></span>
              <button @click="activeVisualTagFilter = ''" class="hover:text-purple-800 dark:hover:text-white transition ml-1 cursor-pointer" title="Clear visual tag filter">
                <i data-lucide="x" class="w-3 h-3"></i>
              </button>
            </div>
          </template>

          <!-- Active Domain Filter Badge -->
          <template x-if="activeDomainFilter">
            <div class="flex items-center space-x-1.5 px-3 py-1 rounded-xl bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30 text-xs">
              <i data-lucide="globe" class="w-3.5 h-3.5"></i>
              <span class="font-bold font-mono tabular-nums" x-text="'Domain: ' + activeDomainFilter"></span>
              <button @click="activeDomainFilter = ''" class="hover:text-cyan-800 dark:hover:text-white transition ml-1 cursor-pointer" title="Clear domain filter">
                <i data-lucide="x" class="w-3 h-3"></i>
              </button>
            </div>
          </template>
        </div>

        <!-- Right: Search, Formats, Sorting, Page Size -->
        <div class="flex flex-wrap items-center gap-2">
          
          <!-- Search in Pins -->
          <div class="relative">
            <i data-lucide="search" class="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"></i>
            <input type="text" x-model="pinSearch" placeholder="Filter title, author, domain..."
                   class="w-44 sm:w-52 pl-8 pr-7 py-1.5 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/40">
            <button x-show="pinSearch" @click="pinSearch = ''" class="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 cursor-pointer">
              <i data-lucide="x" class="w-3 h-3"></i>
            </button>
          </div>

          <!-- Format Filter -->
          <select x-model="formatFilter" class="px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer">
            <option value="ALL">All Formats</option>
            <option value="ORGANIC PIN">Organic Pin</option>
            <option value="VIDEO PIN">Video Pin</option>
            <option value="IDEA PIN">Idea Pin</option>
            <option value="PRODUCT CARD">Product Card</option>
          </select>

          <!-- Pin Sort -->
          <select x-model="pinSort" class="px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer">
            <option value="rank" x-text="'Sort: SERP Rank #1-' + (selectedKeyword?.target_pin_count || 250)">Sort: SERP Rank (Ascending)</option>
            <option value="velocity">Sort: 24h Velocity (Highest)</option>
            <option value="saves">Sort: Saves / Likes (Highest)</option>
            <option value="age">Sort: Newest First</option>
          </select>

          <!-- Per Page Select -->
          <select x-model="pinPageSize" class="px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-xs font-mono tabular-nums font-bold text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer">
            <option :value="25">25 / page</option>
            <option :value="50">50 / page</option>
            <option :value="100">100 / page</option>
            <option value="all">All Pins</option>
          </select>

        </div>

      </div>

      <!-- TAB 1: EXECUTIVE FULL-WIDTH SERP MATRIX -->
      <div x-show="activeTab === 'serp'" class="space-y-0">
        
        <template x-if="isDetailsLoading">
          <div class="py-20 text-center space-y-3">
            <div class="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-500 mx-auto flex items-center justify-center">
              <i data-lucide="loader-2" class="w-6 h-6 animate-spin"></i>
            </div>
            <p class="text-sm font-bold text-slate-700 dark:text-slate-300">Loading Full SERP Report...</p>
            <p class="text-xs text-slate-400 font-mono tabular-nums">Comparing rank positions & calculating 24h save velocity baselines</p>
          </div>
        </template>

        <template x-if="!isDetailsLoading && (!filteredPins || filteredPins.length === 0)">
          <div class="py-20 text-center space-y-4 max-w-md mx-auto p-4">
            <div class="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 mx-auto flex items-center justify-center">
              <i data-lucide="sparkles" class="w-6 h-6"></i>
            </div>
            <h3 class="text-base font-bold text-slate-900 dark:text-white capitalize" x-text="'No Snapshots for &quot;' + (selectedKeyword?.keyword || activeKeywordQuery) + '&quot;'"></h3>
            <p class="text-xs text-slate-500">This keyword has not been crawled yet. Trigger an on-demand crawl to index organic SERP pins directly from Pinterest.</p>
            <button @click="rescanActiveKeyword(true)"
                    class="px-5 py-2.5 rounded-2xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition shadow-md shadow-emerald-950/20 active:scale-95 flex items-center justify-center space-x-2 mx-auto cursor-pointer">
              <i data-lucide="refresh-cw" class="w-4 h-4"></i>
              <span x-text="'Crawl ' + (selectedKeyword?.target_pin_count || 250) + ' Pins Now'">Crawl Pins Now</span>
            </button>
          </div>
        </template>

        <!-- VIEW MODE 1: TABLE VIEW (Matching Image 1 Exact Layout) -->
        <template x-if="!isDetailsLoading && filteredPins && filteredPins.length > 0 && viewMode === 'table'">
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="table-sticky-header bg-slate-100/90 dark:bg-[#121215]/90 border-b border-slate-200 dark:border-[#27272A] text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  <th class="py-3.5 px-3 w-10 text-center">
                    <input type="checkbox" @click="toggleSelectAllPins()"
                           :checked="paginatedPins.length > 0 && paginatedPins.every(p => isPinSelected(p.pin_id))"
                           class="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 dark:border-[#27272A]">
                  </th>
                  <th class="py-3.5 px-3 w-14">Preview</th>
                  <th class="py-3.5 px-4 min-w-[260px]">Pin Title & ID</th>
                  <th class="py-3.5 px-3 w-28"># Rank & Delta</th>
                  <th class="py-3.5 px-3 w-36">Board</th>
                  <th class="py-3.5 px-3 w-32">Saves & Δ</th>
                  <th class="py-3.5 px-3 w-28">Repins & Δ</th>
                  <th class="py-3.5 px-2 w-20">Comments</th>
                  <th class="py-3.5 px-2 w-20">Shares</th>
                  <th class="py-3.5 px-3 w-28">Velocity</th>
                  <th class="py-3.5 px-3 w-36">Domain Authority</th>
                  <th class="py-3.5 px-3 w-28 text-right">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
                <template x-for="(pin, idx) in paginatedPins" :key="pin.pin_id">
                  <tr :data-pin-id="pin.pin_id"
                      class="hover:bg-slate-50/80 dark:hover:bg-slate-900/40 transition group cursor-pointer"
                      @click="openPinInspector(pin)">
                    
                    <!-- Checkbox -->
                    <td class="py-3.5 px-3 text-center" @click.stop>
                      <input type="checkbox" :checked="isPinSelected(pin.pin_id)" @click="togglePinSelection(pin.pin_id)"
                             class="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 dark:border-[#27272A]">
                    </td>

                    <!-- Preview Thumbnail -->
                    <td class="py-3.5 px-3">
                      <a :href="getPinDossierUrl(pin)" @click.stop class="relative group/img shrink-0 block" title="Open Dedicated Pin Intelligence (/pins/:pin_id)">
                        <template x-if="pin.image_url">
                          <img :src="pin.image_url" class="w-10 h-14 rounded-lg object-cover border border-slate-200 dark:border-[#27272A] shadow-xs group-hover/img:scale-105 transition" onerror="window.handlePinImgError(this)">
                        </template>
                        <template x-if="!pin.image_url">
                          <div class="w-10 h-14 rounded-lg bg-slate-200 dark:bg-slate-800 flex items-center justify-center">
                            <i data-lucide="image" class="w-3.5 h-3.5 text-slate-400"></i>
                          </div>
                        </template>
                      </a>
                    </td>

                    <!-- Pin Title, ID & Creator -->
                    <td class="py-3.5 px-4 min-w-[260px]">
                      <div class="space-y-1">
                        <a :href="getPinDossierUrl(pin)" @click.stop
                           class="font-bold text-slate-900 dark:text-white hover:text-emerald-500 line-clamp-2 block transition"
                           title="Open Dedicated Pin Intelligence (/pins/:pin_id)"
                           x-text="pin.title || 'Untitled Pin'"></a>
                        <div class="flex items-center flex-wrap gap-1.5 text-[10px] text-slate-400 font-mono tabular-nums">
                          <a :href="getPinDossierUrl(pin)" @click.stop
                             class="text-slate-500 dark:text-slate-400 hover:text-emerald-500 truncate font-mono tabular-nums"
                             title="Open Dedicated Pin Intelligence"
                             x-text="'ID: ' + pin.pin_id"></a>
                          <template x-if="pin.metadata?.pinner || pin.creator_username">
                            <span class="flex items-center space-x-1 truncate max-w-[130px]">
                              <template x-if="pin.metadata?.pinner?.image_small_url">
                                <img :src="pin.metadata.pinner.image_small_url" class="w-3 h-3 rounded-full object-cover shrink-0">
                              </template>
                              <span class="truncate" x-text="pin.metadata?.pinner?.full_name || ('@' + (pin.metadata?.pinner?.username || pin.creator_username))"></span>
                            </span>
                          </template>
                          <!-- Method Badge -->
                          <span class="px-1.5 py-0.2 rounded text-[9px] font-mono tabular-nums font-bold border shrink-0"
                                :class="getPinMethodBadgeClass(pin)"
                                :title="'Method: ' + formatPinMethodLabel(pin)"
                                x-text="getPinMethod(pin)"></span>
                          <!-- Created Timestamp / Age Badge -->
                          <template x-if="getPinCreatedDate(pin)">
                            <span class="text-slate-500 dark:text-slate-400 font-mono tabular-nums text-[9px] truncate shrink-0"
                                  :title="'Created: ' + formatPinCreated(pin)"
                                  x-text="'📅 ' + (formatPinAge(pin) || formatPinCreated(pin))"></span>
                          </template>
                        </div>
                        <!-- Visual Annotations Tag Pills (Intra-SERP Crossover Engine) -->
                        <template x-if="pin._hasVisualTags || getPinVisualTags(pin).length > 0">
                          <div class="flex flex-wrap items-center gap-1 mt-1">
                            <template x-for="vtag in (pin._cachedVisualTagsSlice || getPinVisualTags(pin).slice(0, 4))" :key="vtag">
                              <button @click.stop="filterByVisualTag(vtag)"
                                      class="px-1.5 py-0.5 rounded-md text-[9px] font-mono tabular-nums transition cursor-pointer flex items-center gap-1"
                                      :class="activeVisualTagFilter === vtag.toLowerCase() 
                                        ? 'bg-purple-600 text-white font-bold shadow-sm' 
                                        : (isCoreAnchorTag(vtag) 
                                          ? 'bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 border border-purple-500/40 font-semibold' 
                                          : 'bg-purple-500/10 text-purple-600 dark:text-purple-400 hover:bg-purple-500/20 border border-purple-500/20')"
                                      :title="isCoreAnchorTag(vtag) 
                                        ? 'Core Visual Anchor: #' + vtag + ' is shared across ' + getTagFrequency(vtag) + ' pins in this keyword. Click to filter crossover.' 
                                        : 'Filter by visual tag: #' + vtag">
                                <template x-if="isCoreAnchorTag(vtag)">
                                  <span class="text-[8px] text-purple-400">🔗</span>
                                </template>
                                <span x-text="'#' + vtag"></span>
                                <template x-if="getTagFrequency(vtag) > 1">
                                  <span class="text-[8px] px-1 py-0.2 rounded font-bold"
                                        :class="isCoreAnchorTag(vtag) ? 'bg-purple-500/30 text-purple-200' : 'bg-slate-700/60 text-slate-300'"
                                        x-text="getTagFrequency(vtag) + 'x'"></span>
                                </template>
                              </button>
                            </template>
                            <template x-if="(pin._extraTagsCount !== undefined ? pin._extraTagsCount : Math.max(0, getPinVisualTags(pin).length - 4)) > 0">
                              <span class="text-[9px] text-slate-400 font-mono tabular-nums" x-text="'+' + (pin._extraTagsCount !== undefined ? pin._extraTagsCount : (getPinVisualTags(pin).length - 4)) + ' tags'"></span>
                            </template>
                          </div>
                        </template>
                      </div>
                    </td>

                    <!-- # Rank & Delta Movement -->
                    <td class="py-3.5 px-3 font-mono tabular-nums font-bold">
                      <template x-if="!pin.is_displaced">
                        <div class="flex items-center space-x-1.5">
                          <span class="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                                :class="Number(pin.rank_position) <= 10 ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30' : ''"
                                x-text="'#' + pin.rank_position"></span>
                          
                          <template x-if="pin.metadata?.is_new">
                            <span class="px-1.5 py-0.2 rounded text-[9px] bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 cursor-help"
                                  title="Newly discovered in this crawl">★ NEW</span>
                          </template>
                          <template x-if="!pin.metadata?.is_new && Number(pin.metadata?.rank_delta || 0) > 0">
                            <span class="text-[10px] text-emerald-500 font-bold cursor-help"
                                  :title="'Climbed from #' + (pin.metadata?.prev_rank ?? '?') + ' (' + (pin.metadata?.baseline_date ? 'vs crawl on ' + pin.metadata.baseline_date : 'vs prior crawl') + ')'"
                                  x-text="'▲ +' + pin.metadata.rank_delta"></span>
                          </template>
                          <template x-if="!pin.metadata?.is_new && Number(pin.metadata?.rank_delta || 0) < 0">
                            <span class="text-[10px] text-rose-500 font-bold cursor-help"
                                  :title="'Dropped from #' + (pin.metadata?.prev_rank ?? '?') + ' (' + (pin.metadata?.baseline_date ? 'vs crawl on ' + pin.metadata.baseline_date : 'vs prior crawl') + ')'"
                                  x-text="'▼ ' + pin.metadata.rank_delta"></span>
                          </template>
                          <template x-if="!pin.metadata?.is_new && Number(pin.metadata?.rank_delta || 0) === 0">
                            <span class="text-[10px] text-slate-400 font-bold cursor-help"
                                  :title="'Maintained rank (' + (pin.metadata?.baseline_date ? 'vs crawl on ' + pin.metadata.baseline_date : 'vs prior crawl') + ')'">=</span>
                          </template>
                        </div>
                      </template>
                      <template x-if="pin.is_displaced">
                        <div class="flex flex-col space-y-1">
                          <div class="flex items-center space-x-1.5 flex-wrap gap-y-0.5">
                            <span class="px-2 py-0.5 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-xs font-mono tabular-nums font-bold"
                                  :title="'Catalog Rank #' + (pin.catalog_rank || ((selectedKeyword?.target_pin_count || 250) + (getPinGlobalIndex(idx) + 1)))"
                                  x-text="'#' + (pin.catalog_rank || ((selectedKeyword?.target_pin_count || 250) + (getPinGlobalIndex(idx) + 1)))"></span>
                            <span class="px-1.5 py-0.5 rounded-md bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 text-[10px] font-black uppercase tracking-wider shrink-0"
                                  x-text="'Was #' + (pin.last_known_rank || pin.rank_position || '?')"></span>
                          </div>
                          <template x-if="pin.is_deleted || pin.metadata?.is_deleted || pin.metadata?.status === 'archived_404'">
                            <span class="text-[9px] text-rose-400 font-mono tabular-nums font-bold flex items-center gap-1">
                              <span>🗑️ Removed (404)</span>
                            </span>
                          </template>
                          <template x-if="!(pin.is_deleted || pin.metadata?.is_deleted || pin.metadata?.status === 'archived_404')">
                            <span class="text-[9px] text-slate-400 font-mono tabular-nums" x-text="'Vault • ' + (pin.status || 'displaced_active')"></span>
                          </template>
                        </div>
                      </template>
                    </td>

                    <!-- Board Name -->
                    <td class="py-3.5 px-3">
                      <span class="text-xs text-slate-600 dark:text-slate-300 font-medium truncate max-w-[130px] block"
                            :title="pin.board_name || pin.metadata?.board_name || 'General Board'"
                            x-text="pin.board_name || pin.metadata?.board_name || 'General Board'"></span>
                    </td>

                    <!-- Saves & Growth Pace Delta (Image 1 Parity) -->
                    <td class="py-3.5 px-3 space-y-0.5 font-mono tabular-nums">
                      <div class="font-bold text-slate-900 dark:text-white"
                           x-text="formatNumber(pin.save_count || pin.metadata?.raw_saves || 0)"></div>
                      <template x-if="getPaceDelta(pin, 'saves') && getPaceDelta(pin, 'saves') !== '0'">
                        <span class="text-[10px] font-bold text-emerald-500 block"
                              x-text="getPaceDelta(pin, 'saves')"></span>
                      </template>
                    </td>

                    <!-- Repins & Growth Pace Delta -->
                    <td class="py-3.5 px-3 space-y-0.5 font-mono tabular-nums">
                      <div class="font-bold text-slate-700 dark:text-slate-300"
                           x-text="formatNumber(pin.repin_count || pin.metadata?.repin_count || 0)"></div>
                      <template x-if="getPaceDelta(pin, 'repins') && getPaceDelta(pin, 'repins') !== '0'">
                        <span class="text-[10px] font-bold text-emerald-500 block"
                              x-text="getPaceDelta(pin, 'repins')"></span>
                      </template>
                    </td>

                    <!-- Comments -->
                    <td class="py-3.5 px-2 font-mono tabular-nums text-slate-600 dark:text-slate-400"
                        x-text="pin.comment_count || 0"></td>

                    <!-- Shares -->
                    <td class="py-3.5 px-2 font-mono tabular-nums text-slate-600 dark:text-slate-400"
                        x-text="pin.share_count || 0"></td>

                    <!-- 24h Velocity -->
                    <td class="py-3.5 px-3 font-mono tabular-nums">
                      <span class="px-2 py-0.5 rounded-lg text-xs font-black block w-fit"
                            :class="Number(pin.daily_save_velocity || 0) >= 10 ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : (Number(pin.daily_save_velocity || 0) > 0 ? 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500')"
                            x-text="(Number(pin.daily_save_velocity || 0) > 0 ? '+' : '') + Number(pin.daily_save_velocity || 0) + ' /d'"></span>
                    </td>

                    <!-- Domain Authority -->
                    <td class="py-3.5 px-3">
                      <span class="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400 truncate max-w-[130px] block"
                            x-text="pin.domain || 'Pinterest Direct'"></span>
                    </td>

                    <!-- Actions -->
                    <td class="py-3.5 px-3 text-right">
                      <div class="flex items-center justify-end space-x-1" @click.stop>
                        <a :href="getPinDossierUrl(pin)"
                           class="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 transition cursor-pointer"
                           title="Open Dedicated Pin Intelligence (/pins/:pin_id)">
                          <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                        </a>
                        <button @click="openPinInspector(pin)"
                                class="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition cursor-pointer"
                                title="Open Pin Deep Dossier">
                          <i data-lucide="eye" class="w-3.5 h-3.5"></i>
                        </button>
                        <button @click="openVisualLens(pin)"
                                class="p-1.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 transition cursor-pointer"
                                title="Visual Lens Similarity Search">
                          <i data-lucide="camera" class="w-3.5 h-3.5"></i>
                        </button>
                        <a :href="'https://www.pinterest.com/pin/' + pin.pin_id + '/'" target="_blank"
                           class="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-white transition"
                           title="Open Pin on Pinterest">
                          <i data-lucide="arrow-up-right" class="w-3.5 h-3.5"></i>
                        </a>
                      </div>
                    </td>

                  </tr>
                </template>
              </tbody>
            </table>
          </div>
        </template>

        <!-- VIEW MODE 2: CARDS VIEW (Matching Image 1 Grid Cards) -->
        <template x-if="!isDetailsLoading && filteredPins && filteredPins.length > 0 && viewMode === 'cards'">
          <div class="p-5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            <template x-for="pin in paginatedPins" :key="pin.pin_id">
              <div :data-pin-id="pin.pin_id"
                   @click="openPinInspector(pin)"
                   class="p-4 rounded-3xl bg-slate-50/70 dark:bg-slate-900/40 border border-slate-200/80 dark:border-[#27272A] hover:border-emerald-500/40 transition group cursor-pointer flex flex-col justify-between space-y-3.5">
                
                <div class="space-y-3">
                  <!-- Thumbnail with Rank & Format overlays -->
                  <a :href="getPinDossierUrl(pin)" @click.stop class="block relative rounded-2xl overflow-hidden aspect-[2/3] max-h-56 bg-slate-200 dark:bg-slate-800" title="Open Dedicated Pin Intelligence (/pins/:pin_id)">
                    <template x-if="pin.image_url">
                      <img :src="pin.image_url" class="w-full h-full object-cover group-hover:scale-105 transition duration-300" onerror="window.handlePinImgError(this)">
                    </template>
                    <template x-if="!pin.is_displaced">
                      <div class="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-lg bg-slate-950/80 text-white font-mono tabular-nums font-black text-xs backdrop-blur-xs"
                           x-text="'#' + pin.rank_position"></div>
                    </template>
                    <template x-if="pin.is_displaced">
                      <div class="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-lg bg-amber-950/90 text-amber-300 font-mono tabular-nums font-black text-[10px] backdrop-blur-xs border border-amber-500/40 flex items-center gap-1 shadow-sm">
                        <span x-text="'#' + (pin.catalog_rank || 101)"></span>
                        <span class="text-rose-400 text-[9px] font-semibold" x-text="'(Was #' + (pin.last_known_rank || '?') + ')'"></span>
                      </div>
                    </template>
                    <div class="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md bg-slate-950/70 text-[10px] font-mono tabular-nums text-slate-200 backdrop-blur-xs uppercase"
                         x-text="pin.metadata?.format || pin.format || 'ORGANIC'"></div>
                  </a>

                  <!-- Title & ID -->
                  <div class="space-y-1">
                    <a :href="getPinDossierUrl(pin)" @click.stop
                       class="text-xs font-bold text-slate-900 dark:text-white hover:text-emerald-500 line-clamp-2 leading-snug transition block"
                       title="Open Dedicated Pin Intelligence (/pins/:pin_id)"
                       x-text="pin.title || 'Untitled Pin'"></a>
                    <div class="flex items-center space-x-1.5 text-[10px] font-mono tabular-nums">
                      <a :href="getPinDossierUrl(pin)" @click.stop
                         class="text-slate-400 hover:text-emerald-500 truncate"
                         x-text="pin.board_name || pin.metadata?.board_name || ('ID: ' + pin.pin_id)"></a>
                      <span class="px-1.5 py-0.2 rounded text-[8px] font-mono tabular-nums font-bold border shrink-0"
                            :class="getPinMethodBadgeClass(pin)"
                            :title="'Method: ' + formatPinMethodLabel(pin)"
                            x-text="getPinMethod(pin)"></span>
                      <template x-if="formatPinAge(pin)">
                        <span class="text-slate-400 text-[9px] shrink-0" :title="'Created: ' + formatPinCreated(pin)" x-text="'📅 ' + formatPinAge(pin)"></span>
                      </template>
                    </div>
                    <!-- Visual Annotations Tag Pills -->
                    <template x-if="pin._hasVisualTags || getPinVisualTags(pin).length > 0">
                      <div class="flex flex-wrap items-center gap-1 mt-1">
                        <template x-for="vtag in (pin._cachedVisualTagsSlice || getPinVisualTags(pin).slice(0, 3))" :key="vtag">
                          <button @click.stop="filterByVisualTag(vtag)"
                                  class="px-1.5 py-0.2 rounded-md text-[9px] font-mono tabular-nums transition cursor-pointer"
                                  :class="activeVisualTagFilter === vtag.toLowerCase() ? 'bg-purple-600 text-white font-bold' : 'bg-purple-500/10 text-purple-600 dark:text-purple-400 hover:bg-purple-500/20 border border-purple-500/20'"
                                  :title="'Filter by visual tag: #' + vtag">
                            <span x-text="'#' + vtag"></span>
                          </button>
                        </template>
                      </div>
                    </template>
                  </div>
                </div>

                <!-- Engagement Bar & Actions -->
                <div class="pt-2.5 border-t border-slate-200/60 dark:border-[#27272A]/60 space-y-2">
                  <div class="flex items-center justify-between text-xs font-mono tabular-nums">
                    <div>
                      <span class="text-slate-400 text-[10px]">Saves:</span>
                      <strong class="text-slate-900 dark:text-white" x-text="formatNumber(pin.save_count || pin.metadata?.raw_saves || 0)"></strong>
                      <template x-if="getPaceDelta(pin, 'saves') && getPaceDelta(pin, 'saves') !== '0'">
                        <span class="text-emerald-500 text-[10px] font-bold" x-text="getPaceDelta(pin, 'saves')"></span>
                      </template>
                    </div>
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold font-mono tabular-nums"
                          :class="Number(pin.daily_save_velocity || 0) > 0 ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'"
                          x-text="(Number(pin.daily_save_velocity || 0) > 0 ? '+' : '') + (pin.daily_save_velocity || 0) + ' v/d'"></span>
                  </div>

                  <div class="flex items-center justify-between text-[11px] text-slate-400 pt-1" @click.stop>
                    <span class="truncate max-w-[120px] font-mono tabular-nums text-[10px]" x-text="pin.domain || 'Pinterest'"></span>
                    <div class="flex items-center space-x-1">
                      <a :href="getPinDossierUrl(pin)" class="p-1 rounded bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20" title="Open Dossier (/pins/:pin_id)">
                        <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                      </a>
                      <button @click="openPinInspector(pin)" class="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-200" title="Dossier">
                        <i data-lucide="eye" class="w-3.5 h-3.5"></i>
                      </button>
                      <button @click="openVisualLens(pin)" class="p-1 rounded hover:bg-purple-500/20 text-slate-400 hover:text-purple-400" title="Visual Lens">
                        <i data-lucide="camera" class="w-3.5 h-3.5"></i>
                      </button>
                      <a :href="'https://www.pinterest.com/pin/' + pin.pin_id + '/'" target="_blank" class="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-white" title="Pinterest">
                        <i data-lucide="arrow-up-right" class="w-3.5 h-3.5"></i>
                      </a>
                    </div>
                  </div>
                </div>

              </div>
            </template>
          </div>
        </template>

        <!-- TAB 1 PAGINATION & STATUS FOOTER -->
        <template x-if="!isDetailsLoading && filteredPins && filteredPins.length > 0">
          <div class="px-5 py-3.5 border-t border-slate-200/80 dark:border-[#27272A]/80 bg-slate-50/50 dark:bg-slate-900/30 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            
            <!-- Left: Items range & Selection -->
            <div class="flex items-center space-x-3 text-slate-500 font-mono tabular-nums text-[11px] flex-wrap gap-y-1">
              <div>
                <span>Showing </span>
                <span class="font-bold text-slate-900 dark:text-white"
                      x-text="filteredPins.length > 0 ? (((pinPage - 1) * (pinPageSize === 'all' ? 0 : Number(pinPageSize))) + 1) : 0"></span>
                <span> - </span>
                <span class="font-bold text-slate-900 dark:text-white"
                      x-text="pinPageSize === 'all' ? filteredPins.length : Math.min(pinPage * Number(pinPageSize), filteredPins.length)"></span>
                <span> of </span>
                <span class="font-bold text-slate-900 dark:text-white" x-text="filteredPins.length"></span>
                <template x-if="serpScope === 'displaced' && totalDisplacedCount > displacedVaultPins.length">
                  <span class="text-rose-500 font-bold ml-1" x-text="'(' + totalDisplacedCount + ' total in Vault)'"></span>
                </template>
                <template x-if="serpScope === 'all' && totalCatalogCount > allCombinedPins.length">
                  <span class="text-emerald-500 font-bold ml-1" x-text="'(' + totalCatalogCount + ' total in Catalog)'"></span>
                </template>
                <span> pins</span>
              </div>

              <template x-if="selectedPinIds.length > 0">
                <span class="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold border border-emerald-500/30 font-sans"
                      x-text="selectedPinIds.length + ' selected'"></span>
              </template>

              <!-- Load More Displaced Pins Action -->
              <template x-if="(serpScope === 'displaced' || serpScope === 'all') && totalDisplacedCount > displacedVaultPins.length">
                <button type="button" @click="loadMoreDisplacedPins()" :disabled="isLoadingMoreDisplaced"
                        class="px-2.5 py-1 rounded-lg font-mono tabular-nums font-bold text-[11px] bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50 ml-2"
                        title="Load next 24 displaced pins from Vault">
                  <i data-lucide="download" class="w-3 h-3" :class="isLoadingMoreDisplaced ? 'animate-bounce' : ''"></i>
                  <span x-text="isLoadingMoreDisplaced ? 'Loading Vault...' : ('Load More Displaced (' + Math.min(24, totalDisplacedCount - displacedVaultPins.length) + ' more)')"></span>
                </button>
              </template>
            </div>

            <!-- Right: Pagination Buttons -->
            <template x-if="pinPageSize !== 'all' && pinTotalPages > 1">
              <div class="flex items-center space-x-1">
                <!-- First Page -->
                <button type="button" @click="setPinPage(1)" :disabled="pinPage <= 1"
                        class="p-1.5 rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer text-slate-600 dark:text-slate-400"
                        title="First Page">
                  <i data-lucide="chevrons-left" class="w-4 h-4"></i>
                </button>

                <!-- Previous Page -->
                <button type="button" @click="setPinPage(pinPage - 1)" :disabled="pinPage <= 1"
                        class="p-1.5 rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer text-slate-600 dark:text-slate-400"
                        title="Previous Page">
                  <i data-lucide="chevron-left" class="w-4 h-4"></i>
                </button>

                <!-- Numbered Page Pills -->
                <div class="flex items-center space-x-1 px-1">
                  <template x-for="p in pinPageNumbers" :key="p">
                    <div>
                      <template x-if="p === '...'">
                        <span class="px-2 py-1 text-slate-400 font-mono tabular-nums text-xs">...</span>
                      </template>
                      <template x-if="p !== '...'">
                        <button type="button" @click="setPinPage(p)"
                                class="min-w-8 h-8 px-2 rounded-xl text-xs font-mono tabular-nums font-bold transition cursor-pointer"
                                :class="pinPage === p ? 'bg-emerald-600 text-white shadow-xs' : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'"
                                x-text="p"></button>
                      </template>
                    </div>
                  </template>
                </div>

                <!-- Next Page -->
                <button type="button" @click="setPinPage(pinPage + 1)" :disabled="pinPage >= pinTotalPages"
                        class="p-1.5 rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer text-slate-600 dark:text-slate-400"
                        title="Next Page">
                  <i data-lucide="chevron-right" class="w-4 h-4"></i>
                </button>

                <!-- Last Page -->
                <button type="button" @click="setPinPage(pinTotalPages)" :disabled="pinPage >= pinTotalPages"
                        class="p-1.5 rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer text-slate-600 dark:text-slate-400"
                        title="Last Page">
                  <i data-lucide="chevrons-right" class="w-4 h-4"></i>
                </button>
              </div>
            </template>

          </div>
        </template>

      </div>

      <!-- TAB 2: PINTEREST TRENDS (52-WEEK SEASONALITY & DEMOGRAPHICS) -->
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
              Peak: <strong x-text="trendsData?.peak_value || 100"></strong>/100
            </div>
            <div class="px-3 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
              Latest: <strong x-text="trendsData?.current_index || 56"></strong>/100
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
            <div class="space-y-4 pt-2">
              <div class="space-y-1">
                <div class="flex items-center justify-between text-xs font-mono tabular-nums">
                  <span class="text-slate-500">Female</span>
                  <span class="font-bold text-rose-500" x-text="trendsData?.demographics?.gender?.female_display || ((trendsData?.demographics?.gender?.female_pct || 86) + '%')"></span>
                </div>
                <div class="w-full h-3 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                  <div class="h-full bg-rose-500 rounded-full" :style="'width: ' + (trendsData?.demographics?.gender?.female_pct || 86) + '%'"></div>
                </div>
              </div>

              <div class="space-y-1">
                <div class="flex items-center justify-between text-xs font-mono tabular-nums">
                  <span class="text-slate-500">Male</span>
                  <span class="font-bold text-cyan-500" x-text="trendsData?.demographics?.gender?.male_display || ((trendsData?.demographics?.gender?.male_pct || 4) + '%')"></span>
                </div>
                <div class="w-full h-3 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                  <div class="h-full bg-cyan-500 rounded-full" :style="'width: ' + Math.max(trendsData?.demographics?.gender?.male_pct || 4, 3) + '%'"></div>
                </div>
              </div>

              <div class="space-y-1">
                <div class="flex items-center justify-between text-xs font-mono tabular-nums">
                  <span class="text-slate-500">Unspecified / Custom</span>
                  <span class="font-bold text-slate-400" x-text="trendsData?.demographics?.gender?.unspecified_display || ((trendsData?.demographics?.gender?.unspecified_pct || 10) + '%')"></span>
                </div>
                <div class="w-full h-3 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                  <div class="h-full bg-slate-500 rounded-full" :style="'width: ' + (trendsData?.demographics?.gender?.unspecified_pct || 10) + '%'"></div>
                </div>
              </div>
            </div>
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
                        title="عرض كافة الدبابيس كاملة بدقة 736x">
                  <i data-lucide="layout-grid" class="w-3.5 h-3.5"></i>
                  <span>Full Pins (الصور كاملة)</span>
                </button>
                <button @click="popularPinsView = 'collage'; $nextTick(() => { if (window.lucide) window.lucide.createIcons(); })"
                        :class="popularPinsView === 'collage' ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm font-bold' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-medium'"
                        class="px-2.5 py-1 rounded-lg transition flex items-center space-x-1 cursor-pointer"
                        title="بانر الكولاج الرسمي">
                  <i data-lucide="columns-3" class="w-3.5 h-3.5"></i>
                  <span>Official Collage</span>
                </button>
                <button @click="popularPinsView = 'grid'; $nextTick(() => { if (window.lucide) window.lucide.createIcons(); })"
                        :class="popularPinsView === 'grid' ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm font-bold' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-medium'"
                        class="px-2.5 py-1 rounded-lg transition flex items-center space-x-1 cursor-pointer"
                        title="بطاقات التحليل والتتبع">
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
                    <div class="group relative rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-[#27272A] hover:border-blue-500/50 shadow-xs hover:shadow-md transition duration-300 overflow-hidden flex flex-col justify-between cursor-pointer"
                         @click="window.open((imgUrl || '').replace('/236x/', '/736x/').replace('/474x/', '/736x/'), '_blank')">
                      
                      <!-- Full Pin Image Container with fixed 2:3 aspect ratio -->
                      <div class="relative w-full aspect-[2/3] bg-slate-100 dark:bg-slate-950/80 flex items-center justify-center overflow-hidden p-2">
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
                      </div>

                      <!-- Card Details Bottom Strip -->
                      <div class="p-3 border-t border-slate-100 dark:border-[#27272A]/80 flex items-center justify-between text-xs" @click.stop>
                        <div class="flex items-center space-x-2 min-w-0 pr-2">
                          <span class="w-2 h-2 rounded-full bg-blue-500 shrink-0"></span>
                          <span class="font-bold text-slate-800 dark:text-slate-200 truncate capitalize"
                                x-text="(trendsData?.term || selectedKeyword?.keyword || activeKeywordQuery || 'Popular') + ' Pin ' + (idx + 1)"></span>
                        </div>
                        <a :href="'https://www.pinterest.com/search/pins/?q=' + encodeURIComponent(trendsData?.term || selectedKeyword?.keyword || activeKeywordQuery || '')" target="_blank"
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
                <div @click="window.open('https://www.pinterest.com/search/pins/?q=' + encodeURIComponent(trendsData?.term || selectedKeyword?.keyword || activeKeywordQuery || ''), '_blank')"
                     class="group relative h-[440px] sm:h-[480px] md:h-[520px] w-full rounded-2xl overflow-hidden border border-slate-200 dark:border-[#27272A] bg-slate-100 dark:bg-slate-900/60 cursor-pointer shadow-sm hover:shadow-md transition">
                  
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
                </div>

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
                      <img :src="p.image_url" class="w-full h-full object-cover group-hover:scale-105 transition duration-300" loading="lazy" referrerpolicy="no-referrer" onerror="window.handlePinImgError(this)">
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
                      <a :href="'https://www.pinterest.com/pin/' + (p.pin_id || p.id) + '/'" target="_blank" @click.stop class="text-blue-500 hover:underline">
                        <i data-lucide="external-link" class="w-3 h-3"></i>
                      </a>
                    </div>
                  </div>

                </div>
              </template>
            </div>
          </div>
        </div>

      </div>

      <!-- TAB 4: PINCLICKS INTELLIGENCE & ARBITRAGE BREAKDOWN -->
      <div x-show="activeTab === 'intelligence'" class="p-4 sm:p-6 space-y-6">

        <!-- Scope Segment Selector: Active SERP vs Full Catalog (All Pins) -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-slate-50/90 dark:bg-slate-900/80 border border-slate-200/80 dark:border-[#27272A]">
          <div class="flex items-center space-x-3">
            <div class="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center shrink-0">
              <i data-lucide="layers" class="w-4 h-4"></i>
            </div>
            <div>
              <div class="flex items-center space-x-2">
                <span class="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">Intelligence Scope</span>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-mono tabular-nums font-bold bg-purple-500/15 text-purple-500"
                      x-text="intelScope === 'all' ? ('Full Historical Catalog (#' + totalCatalogCount + ' Pins)') : ('Active Live SERP (#' + (selectedKeywordDetails?.current_pins?.length || 0) + ' Pins)')"></span>
              </div>
              <p class="text-[11px] text-slate-500">Toggle analysis between live ranking active SERP pins and the full collected catalog (including Displaced Vault pins).</p>
            </div>
          </div>

          <div class="flex items-center p-1 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-[#27272A] gap-1 self-start sm:self-auto shrink-0">
            <button @click="intelScope = 'all'"
                    class="px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center space-x-1.5"
                    :class="intelScope === 'all' ? 'bg-purple-500 text-white shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'">
              <span>🔘 Full Catalog</span>
              <span class="px-1.5 py-0.2 rounded-full text-[10px] font-mono tabular-nums font-bold"
                    :class="intelScope === 'all' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'"
                    x-text="totalCatalogCount > allCombinedPins.length ? ('#' + allCombinedPins.length + ' / ' + totalCatalogCount) : ('#' + totalCatalogCount)"></span>
            </button>
            <button @click="intelScope = 'active'"
                    class="px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center space-x-1.5"
                    :class="intelScope === 'active' ? 'bg-emerald-500 text-white shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'">
              <span>🟢 Active SERP</span>
              <span class="px-1.5 py-0.2 rounded-full text-[10px] font-mono tabular-nums font-bold"
                    :class="intelScope === 'active' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'"
                    x-text="'#' + (selectedKeywordDetails?.current_pins?.length || 0)"></span>
            </button>
          </div>
        </div>

        <!-- Top 4-Metric Grid -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <!-- 1: StaticRank & Saves Baseline -->
          <div class="p-5 rounded-3xl bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200/80 dark:border-[#27272A]/80 space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono tabular-nums">SERP Engagement</span>
              <div class="w-7 h-7 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                <i data-lucide="bookmark" class="w-3.5 h-3.5"></i>
              </div>
            </div>
            <div class="space-y-2">
              <div class="flex items-center justify-between text-xs">
                <span class="text-slate-500">Total Analyzed Pins</span>
                <span class="font-mono tabular-nums font-bold text-slate-900 dark:text-white" x-text="totalAnalyzedPinsCount"></span>
              </div>
              <div class="flex items-center justify-between text-xs">
                <span class="text-slate-500">Avg Saves / Pin</span>
                <span class="font-mono tabular-nums font-bold text-emerald-500" x-text="formatNumber(analyzedAvgSaves)"></span>
              </div>
              <div class="flex items-center justify-between text-xs">
                <span class="text-slate-500">Median Saves</span>
                <span class="font-mono tabular-nums font-bold text-slate-700 dark:text-slate-300" x-text="formatNumber(analyzedMedianSaves)"></span>
              </div>
            </div>
          </div>

          <!-- 2: Domain Concentration & Repeat Frequency -->
          <div class="p-5 rounded-3xl bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200/80 dark:border-[#27272A]/80 space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono tabular-nums">Domain Authority</span>
              <div class="w-7 h-7 rounded-xl bg-cyan-500/10 text-cyan-500 flex items-center justify-center">
                <i data-lucide="globe" class="w-3.5 h-3.5"></i>
              </div>
            </div>
            <div class="space-y-2">
              <div class="flex items-center justify-between text-xs">
                <span class="text-slate-500">Unique Domains</span>
                <span class="font-mono tabular-nums font-bold text-slate-900 dark:text-white" x-text="uniqueDomainsCount"></span>
              </div>
              <div class="flex items-center justify-between text-xs">
                <span class="text-slate-500">Repeated Domains (>1 Pin)</span>
                <span class="font-mono tabular-nums font-bold text-amber-500" x-text="repeatedDomainsCount"></span>
              </div>
              <div class="flex items-center justify-between text-xs">
                <span class="text-slate-500">Top Ranked Domain</span>
                <span class="font-mono tabular-nums font-bold text-purple-400 truncate max-w-[120px]" x-text="selectedKeywordDetails?.intelligence?.top_domain || domainBreakdownList[0]?.domain || 'N/A'"></span>
              </div>
            </div>
          </div>

          <!-- 3: Creative Formats & Canvas Aspect Ratios -->
          <div class="p-5 rounded-3xl bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200/80 dark:border-[#27272A]/80 space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono tabular-nums">Visual Formats</span>
              <div class="w-7 h-7 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center">
                <i data-lucide="image" class="w-3.5 h-3.5"></i>
              </div>
            </div>
            <div class="space-y-2">
              <div class="flex items-center justify-between text-xs">
                <span class="text-slate-500">Standard Static (2:3)</span>
                <span class="font-mono tabular-nums font-bold text-emerald-500" x-text="analyzedVisualFormats.standard_pct + '%'"></span>
              </div>
              <div class="flex items-center justify-between text-xs">
                <span class="text-slate-500">Extra Tall (1:2)</span>
                <span class="font-mono tabular-nums font-bold text-amber-400" x-text="analyzedVisualFormats.extra_tall_pct + '%'"></span>
              </div>
              <div class="flex items-center justify-between text-xs">
                <span class="text-slate-500">Video & Idea Pins</span>
                <span class="font-mono tabular-nums font-bold text-cyan-500" x-text="analyzedVisualFormats.video_idea_pct + '%'"></span>
              </div>
            </div>
          </div>

          <!-- 4: Opportunity Verdict -->
          <div class="p-5 rounded-3xl bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200/80 dark:border-[#27272A]/80 space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono tabular-nums">Opportunity Verdict</span>
              <div class="w-7 h-7 rounded-xl bg-pink-500/10 text-pink-500 flex items-center justify-center">
                <i data-lucide="trending-up" class="w-3.5 h-3.5"></i>
              </div>
            </div>
            <div class="space-y-1.5">
              <div class="text-xs font-black truncate" x-text="selectedKeywordDetails?.intelligence?.opportunity?.badge || '🟢 Wide Open'"></div>
              <p class="text-[11px] text-slate-500 leading-snug line-clamp-2" x-text="selectedKeywordDetails?.intelligence?.opportunity?.summary || 'Algorithmic Arbitrage target.'"></p>
            </div>
          </div>
        </div>

        <!-- SECTION 1: DOMAIN AUTHORITY & REPEAT FREQUENCY BREAKDOWN -->
        <div class="p-5 rounded-3xl bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200/80 dark:border-[#27272A]/80 space-y-4">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/80 dark:border-[#27272A]">
            <div class="flex items-center space-x-3">
              <div class="w-8 h-8 rounded-xl bg-cyan-500/10 text-cyan-500 flex items-center justify-center">
                <i data-lucide="globe" class="w-4 h-4"></i>
              </div>
              <div>
                <div class="flex items-center space-x-2">
                  <h3 class="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">Domain Authority & Repeat Frequency Breakdown</h3>
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-mono tabular-nums font-bold bg-amber-500/15 text-amber-500 border border-amber-500/30"
                        x-text="repeatedDomainsCount + ' Repeated Domains'"></span>
                </div>
                <p class="text-xs text-slate-500 mt-0.5">Footprint analysis of websites ranking in organic SERP. Multi-pin presence indicates authority concentration or programmatic scale.</p>
              </div>
            </div>

            <div class="flex items-center space-x-2 flex-wrap gap-2">
              <!-- Search Domain -->
              <div class="relative">
                <input type="text"
                       x-model="domainSearch"
                       @input="domainPage = 1"
                       placeholder="Filter domains..."
                       class="px-3 py-1.5 pl-8 rounded-xl text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 w-40 sm:w-48 font-sans">
                <span class="absolute left-2.5 top-2 text-xs text-slate-400">🔍</span>
                <button x-show="domainSearch" @click="domainSearch = ''; domainPage = 1" class="absolute right-2.5 top-1.5 text-xs text-slate-400 hover:text-slate-600 cursor-pointer">✕</button>
              </div>

              <span class="text-xs text-slate-500 font-mono tabular-nums" x-text="filteredDomainsList().length + ' Domains'"></span>

              <template x-if="activeDomainFilter">
                <button @click="activeDomainFilter = ''" class="px-2 py-1 rounded-xl text-[11px] font-bold bg-rose-500/15 text-rose-500 hover:bg-rose-500/25 transition flex items-center space-x-1 cursor-pointer">
                  <i data-lucide="x" class="w-3 h-3"></i>
                  <span>Clear Filter</span>
                </button>
              </template>
            </div>
          </div>

          <!-- Domain Table -->
          <div class="overflow-x-auto rounded-2xl border border-slate-200 dark:border-[#27272A]">
            <table class="w-full text-left text-xs">
              <thead class="bg-slate-100/70 dark:bg-slate-900/80 text-slate-500 uppercase font-mono tabular-nums text-[10px] tracking-wider border-b border-slate-200 dark:border-[#27272A]">
                <tr>
                  <th class="py-3 px-3 w-12 text-center">#</th>
                  <th class="py-3 px-4">Domain Name</th>
                  <th class="py-3 px-3 text-center">Ranking Pins</th>
                  <th class="py-3 px-4">SERP Share</th>
                  <th class="py-3 px-3 text-right">Total Saves</th>
                  <th class="py-3 px-3 text-center">Best Rank</th>
                  <th class="py-3 px-3 text-center w-28">Action</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-200/80 dark:divide-slate-800/80 bg-white dark:bg-[#121215]">
                <template x-for="(dom, idx) in paginatedDomainsList()" :key="dom.domain">
                  <tr class="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition">
                    <td class="py-3 px-3 text-center font-mono tabular-nums text-slate-400 font-bold" x-text="((domainPage - 1) * domainPageSize) + idx + 1"></td>
                    <td class="py-3 px-4">
                      <div class="flex items-center space-x-2">
                        <a :href="'https://' + dom.domain" target="_blank" rel="noopener noreferrer"
                           class="font-mono tabular-nums font-bold text-slate-900 dark:text-white hover:text-cyan-500 dark:hover:text-cyan-400 transition flex items-center space-x-1.5 group">
                          <span x-text="dom.domain"></span>
                          <i data-lucide="external-link" class="w-3 h-3 text-slate-400 group-hover:text-cyan-400 transition"></i>
                        </a>
                        <template x-if="dom.pin_count > 1">
                          <span class="px-2 py-0.5 rounded-full text-[9px] font-mono tabular-nums font-black bg-amber-500/15 text-amber-500 border border-amber-500/30"
                                x-text="'🔥 ' + dom.pin_count + ' Pins'"></span>
                        </template>
                      </div>
                    </td>
                    <td class="py-3 px-3 text-center">
                      <span class="px-2 py-0.5 rounded-lg text-xs font-mono tabular-nums font-bold"
                            :class="dom.pin_count > 1 ? 'bg-amber-500/15 text-amber-500 font-black' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'"
                            x-text="dom.pin_count"></span>
                    </td>
                    <td class="py-3 px-4">
                      <div class="space-y-1 max-w-[140px]">
                        <div class="flex items-center justify-between text-[11px] font-mono tabular-nums font-bold">
                          <span class="text-purple-400" x-text="dom.share_pct + '%'"></span>
                        </div>
                        <div class="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div class="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full transition-all duration-300"
                               :style="'width: ' + Math.min(100, dom.share_pct * 2.5) + '%'"></div>
                        </div>
                      </div>
                    </td>
                    <td class="py-3 px-3 text-right font-mono tabular-nums font-bold text-emerald-500" x-text="formatNumber(dom.total_saves)"></td>
                    <td class="py-3 px-3 text-center">
                      <span class="px-2 py-0.5 rounded-lg text-[11px] font-mono tabular-nums font-bold"
                            :class="dom.best_rank <= 5 ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30' : (dom.best_rank <= 20 ? 'bg-cyan-500/15 text-cyan-500' : 'bg-slate-100 dark:bg-slate-800 text-slate-400')"
                            x-text="'#' + dom.best_rank"></span>
                    </td>
                    <td class="py-3 px-3 text-center">
                      <button @click="filterByDomain(dom.domain)"
                              class="px-2.5 py-1 rounded-xl text-[11px] font-bold font-mono tabular-nums transition flex items-center justify-center space-x-1 w-full cursor-pointer"
                              :class="activeDomainFilter === dom.domain.toLowerCase() ? 'bg-cyan-600 text-white shadow-xs' : 'bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border border-cyan-500/25'">
                        <i data-lucide="filter" class="w-3 h-3"></i>
                        <span x-text="activeDomainFilter === dom.domain.toLowerCase() ? 'Filtered' : 'Filter Pins'"></span>
                      </button>
                    </td>
                  </tr>
                </template>

                <template x-if="filteredDomainsList().length === 0">
                  <tr>
                    <td colspan="7" class="py-8 text-center text-xs text-slate-400 font-mono tabular-nums">
                      No domain data matches current search filter.
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>

          <!-- Domain Pagination Footer -->
          <div x-show="filteredDomainsList().length > domainPageSize" class="flex items-center justify-between p-3 rounded-2xl bg-white/60 dark:bg-slate-950/40 border border-slate-200 dark:border-[#27272A] text-xs font-mono tabular-nums">
            <span class="text-slate-500 dark:text-slate-400"
                  x-text="'Showing ' + (((domainPage - 1) * domainPageSize) + 1) + '-' + Math.min(domainPage * domainPageSize, filteredDomainsList().length) + ' of ' + filteredDomainsList().length + ' domains'"></span>
            <div class="flex items-center gap-1.5">
              <button :disabled="domainPage <= 1" @click="domainPage--" class="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-slate-900 disabled:opacity-40 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition">← Prev</button>
              <span class="px-2 py-1 font-bold text-slate-700 dark:text-slate-300" x-text="domainPage + ' / ' + totalDomainsPages()"></span>
              <button :disabled="domainPage >= totalDomainsPages()" @click="domainPage++" class="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-slate-900 disabled:opacity-40 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition">Next →</button>
            </div>
          </div>
        </div>

        <!-- SECTION 2: VISUAL ANNOTATIONS CROSSOVER HUB & CO-OCCURRING POWER PAIRS -->
        <div class="p-5 rounded-3xl bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200/80 dark:border-[#27272A]/80 space-y-5">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/80 dark:border-[#27272A]">
            <div class="flex items-center space-x-3">
              <div class="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center">
                <i data-lucide="sparkles" class="w-4 h-4"></i>
              </div>
              <div>
                <div class="flex items-center space-x-2">
                  <h3 class="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">Visual Annotations Crossover Hub</h3>
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-mono tabular-nums font-bold bg-purple-500/15 text-purple-400 border border-purple-500/30"
                        x-text="computeSerpPowerPairs().length + ' Power Pairs Computed'"></span>
                </div>
                <p class="text-xs text-slate-500 mt-0.5">Computer-vision tag co-occurrences, intra-SERP algorithmic lift, and visual prompt blueprint combinations.</p>
              </div>
            </div>

            <template x-if="activeVisualTagFilter">
              <button @click="activeVisualTagFilter = ''" class="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-rose-500/15 text-rose-500 hover:bg-rose-500/25 transition flex items-center space-x-1 cursor-pointer">
                <i data-lucide="x" class="w-3 h-3"></i>
                <span x-text="'Clear Tag #' + activeVisualTagFilter"></span>
              </button>
            </template>
          </div>

          <!-- Subsection A: Co-Occurring Power Pairs Grid -->
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono tabular-nums">Co-Occurring Visual Power Pairs (Algorithmic Lift)</h4>
              <span class="text-[10px] text-slate-400 font-mono tabular-nums">Top combinations with high intra-SERP affinity</span>
            </div>

            <template x-if="computeSerpPowerPairs().length > 0">
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <template x-for="(pair, idx) in computeSerpPowerPairs()" :key="idx">
                  <div class="p-3.5 rounded-2xl bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] flex flex-col justify-between space-y-2.5 hover:border-purple-500/40 transition group">
                    <div class="space-y-2">
                      <div class="flex items-center justify-between">
                        <span class="px-2 py-0.5 rounded-md text-[9px] font-mono tabular-nums font-black bg-purple-500/15 text-purple-400 border border-purple-500/30"
                              x-text="pair.lift + 'x Lift'"></span>
                        <span class="text-[9px] font-mono tabular-nums text-slate-400" x-text="pair.count + ' Pins (' + pair.supportPct + '%)'"></span>
                      </div>
                      <div class="flex items-center space-x-1.5 text-xs font-bold text-slate-900 dark:text-white truncate">
                        <button @click="filterByVisualTag(pair.tagA)" class="capitalize text-emerald-500 hover:underline truncate cursor-pointer" :title="'Filter SERP: #' + pair.tagA" x-text="pair.tagA"></button>
                        <span class="text-slate-400">+</span>
                        <button @click="filterByVisualTag(pair.tagB)" class="capitalize text-purple-400 hover:underline truncate cursor-pointer" :title="'Filter SERP: #' + pair.tagB" x-text="pair.tagB"></button>
                      </div>
                    </div>
                    <button @click="copySerpVisualBlueprint(pair)"
                            class="w-full py-1.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 text-[10px] font-bold font-mono tabular-nums transition flex items-center justify-center space-x-1 cursor-pointer">
                      <i data-lucide="copy" class="w-3 h-3"></i>
                      <span>📋 Copy Visual Blueprint</span>
                    </button>
                  </div>
                </template>
              </div>
            </template>

            <template x-if="computeSerpPowerPairs().length === 0">
              <div class="py-6 text-center text-xs text-slate-400 font-mono tabular-nums rounded-2xl bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A]">
                Indexing visual tags... Co-occurring power pairs require at least 2 pins with shared visual annotations.
              </div>
            </template>
          </div>

          <!-- Unified Suite: Computer Vision Signals & Visual Anchors -->
          <div class="space-y-4 pt-3 border-t border-slate-200/80 dark:border-[#27272A]">
            <!-- Header with Title, Search, Tier Pills, and View Switcher -->
            <div class="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <div class="flex items-center space-x-2">
                  <h4 class="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white font-mono tabular-nums">Computer Vision Signals & Visual Anchors</h4>
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-mono tabular-nums font-bold bg-purple-500/15 text-purple-400 border border-purple-500/30"
                        x-text="filteredAnchorsList().length + ' Anchors'"></span>
                </div>
                <p class="text-xs text-slate-500 mt-0.5">Semantic AI entity tags detected by Pinterest Computer Vision across ranking pins. Click any anchor to isolate ranking SERP pins.</p>
              </div>

              <div class="flex items-center gap-2 flex-wrap">
                <!-- Search within Anchors -->
                <div class="relative">
                  <input type="text"
                         x-model="anchorsSearch"
                         @input="anchorsPage = 1"
                         placeholder="Filter anchors (e.g. food, dress)..."
                         class="px-3 py-1.5 pl-8 rounded-xl text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500/30 w-44 sm:w-52 font-sans">
                  <span class="absolute left-2.5 top-2 text-xs text-slate-400">🔍</span>
                  <button x-show="anchorsSearch" @click="anchorsSearch = ''; anchorsPage = 1" class="absolute right-2.5 top-1.5 text-xs text-slate-400 hover:text-slate-600 cursor-pointer">✕</button>
                </div>

                <!-- Tier Filter Pills -->
                <div class="flex items-center p-0.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-xs font-mono tabular-nums">
                  <button @click="anchorsTier = 'all'; anchorsPage = 1"
                          :class="anchorsTier === 'all' ? 'bg-purple-600 text-white font-bold shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'"
                          class="px-2 py-1 rounded-lg transition cursor-pointer">
                    All
                  </button>
                  <button @click="anchorsTier = 'high'; anchorsPage = 1"
                          :class="anchorsTier === 'high' ? 'bg-purple-600 text-white font-bold shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'"
                          class="px-2 py-1 rounded-lg transition cursor-pointer" title="Anchors present on >= 10 pins">
                    High (≥10)
                  </button>
                  <button @click="anchorsTier = 'core'; anchorsPage = 1"
                          :class="anchorsTier === 'core' ? 'bg-purple-600 text-white font-bold shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'"
                          class="px-2 py-1 rounded-lg transition cursor-pointer" title="Anchors present on >= 5 pins">
                    Core (≥5)
                  </button>
                </div>

                <!-- View Switcher (Cloud / Cards / Table) -->
                <div class="flex items-center p-0.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-xs font-mono tabular-nums">
                  <button @click="anchorsView = 'cloud'"
                          :class="anchorsView === 'cloud' ? 'bg-purple-600 text-white font-bold shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'"
                          class="px-2.5 py-1 rounded-lg transition flex items-center gap-1.5 cursor-pointer" title="Semantic Tag Cloud">
                    <span>☁️</span>
                    <span>Cloud</span>
                  </button>
                  <button @click="anchorsView = 'cards'"
                          :class="anchorsView === 'cards' ? 'bg-purple-600 text-white font-bold shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'"
                          class="px-2.5 py-1 rounded-lg transition flex items-center gap-1.5 cursor-pointer" title="Cards Grid">
                    <span>🎴</span>
                    <span>Cards</span>
                  </button>
                  <button @click="anchorsView = 'table'"
                          :class="anchorsView === 'table' ? 'bg-purple-600 text-white font-bold shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'"
                          class="px-2.5 py-1 rounded-lg transition flex items-center gap-1.5 cursor-pointer" title="Full Paginated Table">
                    <span>📊</span>
                    <span>Table</span>
                  </button>
                </div>
              </div>
            </div>

            <!-- VIEW 1: SEMANTIC CLOUD VIEW (DEFAULT) -->
            <div x-show="anchorsView === 'cloud' && filteredAnchorsList().length > 0"
                 class="p-5 rounded-2xl bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] space-y-3">
              <div class="flex items-center justify-between text-xs text-slate-400 font-mono tabular-nums pb-2 border-b border-slate-100 dark:border-[#27272A]/80">
                <span>Weighted Semantic Cloud (Visual weight scaled by pin occurrence frequency)</span>
                <span class="text-[11px] text-purple-400">Click any tag to filter SERP</span>
              </div>
              <div class="flex flex-wrap gap-2 items-center justify-center py-4">
                <template x-for="anchor in filteredAnchorsList().slice(0, 120)" :key="anchor.tag">
                  <button @click="filterByVisualTag(anchor.tag)"
                          class="rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5"
                          :class="[
                            activeVisualTagFilter === anchor.tag.toLowerCase() ? 'ring-2 ring-purple-500 bg-purple-600 text-white shadow-md' : '',
                            anchor.count >= 20
                              ? 'px-3.5 py-1.5 text-sm bg-purple-500/20 text-purple-600 dark:text-purple-300 border border-purple-500/40 hover:bg-purple-500/30 shadow-xs'
                              : (anchor.count >= 8
                                ? 'px-3 py-1 text-xs bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/25'
                                : 'px-2.5 py-0.5 text-[11px] bg-slate-100/80 dark:bg-slate-900/80 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#27272A] hover:border-purple-400')
                          ]">
                    <span x-text="'#' + anchor.tag"></span>
                    <span class="text-[9px] font-mono tabular-nums opacity-75 px-1 py-0.2 rounded bg-black/10 dark:bg-white/10" x-text="anchor.count"></span>
                  </button>
                </template>
              </div>
            </div>

            <!-- VIEW 2: CARDS GRID VIEW -->
            <div x-show="anchorsView === 'cards' && filteredAnchorsList().length > 0" class="space-y-4">
              <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                <template x-for="(anchor, idx) in filteredAnchorsList().slice(0, anchorsLimit)" :key="anchor.tag">
                  <button @click="filterByVisualTag(anchor.tag)"
                          class="p-2.5 rounded-2xl bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] text-left hover:border-purple-500/40 transition cursor-pointer flex flex-col justify-between group shadow-xs"
                          :class="activeVisualTagFilter === anchor.tag.toLowerCase() ? 'border-purple-500 ring-2 ring-purple-500/20 bg-purple-500/5' : ''">
                    <div class="flex items-center justify-between text-[10px] font-mono tabular-nums text-slate-400 mb-1">
                      <span x-text="'#' + (idx + 1)"></span>
                      <span class="font-bold text-purple-600 dark:text-purple-400" x-text="anchor.count + ' Pins'"></span>
                    </div>
                    <div class="text-xs font-bold text-slate-900 dark:text-white capitalize truncate group-hover:text-purple-500 transition" x-text="anchor.tag"></div>
                  </button>
                </template>
              </div>

              <!-- Cards Expansion Controls -->
              <div class="flex items-center justify-between p-3 rounded-2xl bg-white/60 dark:bg-[#121215]/60 border border-slate-200 dark:border-[#27272A] text-xs">
                <span class="font-mono tabular-nums text-slate-500 dark:text-slate-400"
                      x-text="'Showing ' + Math.min(anchorsLimit, filteredAnchorsList().length) + ' of ' + filteredAnchorsList().length + ' Visual Anchors'"></span>
                <div class="flex items-center gap-2 font-mono tabular-nums">
                  <button x-show="anchorsLimit < filteredAnchorsList().length"
                          @click="anchorsLimit += 36"
                          class="px-3 py-1.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 font-bold transition cursor-pointer">
                    <span>↓ Show More (+36)</span>
                  </button>
                  <button x-show="anchorsLimit < filteredAnchorsList().length"
                          @click="anchorsLimit = filteredAnchorsList().length"
                          class="px-3 py-1.5 rounded-xl bg-slate-200/80 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold transition cursor-pointer">
                    <span>Show All (<span x-text="filteredAnchorsList().length"></span>)</span>
                  </button>
                  <button x-show="anchorsLimit > 24"
                          @click="anchorsLimit = 24"
                          class="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 font-bold transition cursor-pointer">
                    <span>↑ Collapse to 24</span>
                  </button>
                </div>
              </div>
            </div>

            <!-- VIEW 3: TABLE VIEW -->
            <div x-show="anchorsView === 'table' && filteredAnchorsList().length > 0" class="space-y-3">
              <div class="overflow-x-auto rounded-2xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215]">
                <table class="w-full text-left text-xs font-mono tabular-nums">
                  <thead class="bg-slate-100/70 dark:bg-slate-900/80 border-b border-slate-200 dark:border-[#27272A] text-slate-500 dark:text-slate-400 uppercase text-[10px]">
                    <tr>
                      <th class="p-3 w-16 text-center">Rank #</th>
                      <th class="p-3">Visual Anchor Tag</th>
                      <th class="p-3">Pins Frequency</th>
                      <th class="p-3">Intra-SERP Share</th>
                      <th class="p-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-200/80 dark:divide-slate-800/80 text-slate-700 dark:text-slate-300">
                    <template x-for="(anchor, idx) in paginatedAnchorsTable()" :key="anchor.tag">
                      <tr class="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                        <td class="p-3 text-center text-slate-400 font-mono tabular-nums" x-text="'#' + (((anchorsPage - 1) * anchorsPageSize) + idx + 1)"></td>
                        <td class="p-3">
                          <button @click="filterByVisualTag(anchor.tag)"
                                  class="font-bold text-slate-900 dark:text-white hover:text-purple-600 dark:hover:text-purple-400 hover:underline cursor-pointer flex items-center gap-1.5 text-left capitalize">
                            <span>🏷️</span>
                            <span x-text="anchor.tag"></span>
                          </button>
                        </td>
                        <td class="p-3">
                          <div class="flex items-center gap-2">
                            <div class="w-24 bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                              <div class="h-full rounded-full bg-gradient-to-r from-purple-500 to-indigo-500"
                                   :style="'width: ' + Math.min(100, Math.round((anchor.count / (coreAnchorsList[0]?.count || 1)) * 100)) + '%'"></div>
                            </div>
                            <span class="font-bold text-purple-600 dark:text-purple-400 font-mono tabular-nums" x-text="anchor.count + ' pins'"></span>
                          </div>
                        </td>
                        <td class="p-3 text-slate-500 dark:text-slate-400 font-mono tabular-nums"
                            x-text="((anchor.count / (totalAnalyzedPinsCount || 1)) * 100).toFixed(1) + '%'"></td>
                        <td class="p-3 text-right">
                          <button @click="filterByVisualTag(anchor.tag)"
                                  class="px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors shadow-2xs cursor-pointer"
                                  :class="activeVisualTagFilter === anchor.tag.toLowerCase() ? 'bg-purple-600 text-white font-bold' : 'bg-purple-500/10 hover:bg-purple-600 hover:text-white text-purple-600 dark:text-purple-400 border border-purple-500/20'">
                            <span x-text="activeVisualTagFilter === anchor.tag.toLowerCase() ? 'Filtered ✓' : 'Filter Pins →'"></span>
                          </button>
                        </td>
                      </tr>
                    </template>
                  </tbody>
                </table>
              </div>

              <!-- Anchors Table Pagination Footer -->
              <div class="flex items-center justify-between p-3 rounded-2xl bg-white/60 dark:bg-[#121215]/60 border border-slate-200 dark:border-[#27272A] text-xs font-mono tabular-nums">
                <span class="text-slate-500 dark:text-slate-400"
                      x-text="'Page ' + anchorsPage + ' of ' + totalAnchorsPages() + ' (' + filteredAnchorsList().length + ' anchors)'"></span>
                <div class="flex items-center gap-1.5">
                  <button :disabled="anchorsPage <= 1" @click="anchorsPage--" class="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-slate-900 disabled:opacity-40 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition">← Prev</button>
                  <span class="px-2 py-1 font-bold text-slate-700 dark:text-slate-300" x-text="anchorsPage + ' / ' + totalAnchorsPages()"></span>
                  <button :disabled="anchorsPage >= totalAnchorsPages()" @click="anchorsPage++" class="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-slate-900 disabled:opacity-40 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition">Next →</button>
                </div>
              </div>
            </div>

            <!-- Empty State for Visual Anchors -->
            <div x-show="filteredAnchorsList().length === 0" class="py-8 text-center text-xs text-slate-400 font-mono tabular-nums rounded-2xl bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A]">
              No visual anchors match current search or tier filter.
            </div>
          </div>

        </div>

      </div>

      <!-- DEPRECATED DISPLACED TAB - INTEGRATED INTO SERP MATRIX -->
      <div x-show="activeTab === 'dropped'" class="hidden">
        
        <!-- Vault Header & Growth Pace Ribbon (Image 1 Parity) -->
        <div class="p-4 sm:p-5 border-b border-slate-200/80 dark:border-[#27272A]/80 flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-900/30">
          
          <div class="space-y-1">
            <div class="flex items-center space-x-2">
              <i data-lucide="archive" class="w-4 h-4 text-rose-500"></i>
              <h3 class="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">Displaced Pins Vault</h3>
              <span class="px-2 py-0.5 rounded-full text-[10px] font-mono tabular-nums font-bold bg-rose-500/15 text-rose-600 dark:text-rose-400"
                    x-text="filteredDisplacedPins.length + ' Tracked in Vault'"></span>
            </div>
            <p class="text-xs text-slate-500">Pins that dropped out of the active SERP reach — monitored daily for engagement growth and vacuum ranking opportunities</p>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            
            <!-- Growth Pace Selector -->
            <div class="flex items-center p-1 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] gap-1">
              <button @click="growthPaceFilter = '24h'"
                      class="px-2.5 py-1 rounded-xl text-xs font-bold transition cursor-pointer"
                      :class="growthPaceFilter === '24h' ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/40 shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'">
                🔥 Last 24 Hours
              </button>
              <button @click="growthPaceFilter = '3d'"
                      class="px-2.5 py-1 rounded-xl text-xs font-bold transition cursor-pointer"
                      :class="growthPaceFilter === '3d' ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/40 shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'">
                ⏱ Last 3 Days
              </button>
              <button @click="growthPaceFilter = '7d'"
                      class="px-2.5 py-1 rounded-xl text-xs font-bold transition cursor-pointer"
                      :class="growthPaceFilter === '7d' ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/40 shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'">
                📅 Last 7 Days
              </button>
              <button @click="growthPaceFilter = 'all'"
                      class="px-2.5 py-1 rounded-xl text-xs font-bold transition cursor-pointer"
                      :class="growthPaceFilter === 'all' ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/40 shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'">
                ⭐ All-Time Total
              </button>
            </div>

            <!-- Cards vs Table Toggle -->
            <div class="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-[#27272A]">
              <button @click="viewMode = 'table'"
                      class="px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center space-x-1 cursor-pointer"
                      :class="viewMode === 'table' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'">
                <i data-lucide="table" class="w-3.5 h-3.5"></i>
                <span>Table</span>
              </button>
              <button @click="viewMode = 'cards'"
                      class="px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center space-x-1 cursor-pointer"
                      :class="viewMode === 'cards' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'">
                <i data-lucide="layout-grid" class="w-3.5 h-3.5"></i>
                <span>Cards</span>
              </button>
            </div>

            <!-- Status Dropdown -->
            <select x-model="displacedStatusFilter" @change="fetchDisplacedPins()"
                    class="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none">
              <option value="ALL">All Vault Pins</option>
              <option value="displaced_active">Displaced Active</option>
              <option value="re_entered_serp">Resurged to SERP</option>
            </select>

            <button @click="fetchDisplacedPins()"
                    class="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition cursor-pointer"
                    title="Refresh Vault">
              <i data-lucide="refresh-cw" class="w-3.5 h-3.5" :class="isDisplacedLoading ? 'animate-spin' : ''"></i>
            </button>
          </div>

        </div>

        <template x-if="isDisplacedLoading">
          <div class="py-16 text-center space-y-3">
            <div class="w-10 h-10 rounded-2xl bg-rose-500/10 text-rose-500 mx-auto flex items-center justify-center">
              <i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i>
            </div>
            <p class="text-xs font-bold text-slate-700 dark:text-slate-300">Auditing Displaced Pins Vault & Vacuum Scores...</p>
          </div>
        </template>

        <template x-if="!isDisplacedLoading && (!filteredDisplacedPins || filteredDisplacedPins.length === 0)">
          <div class="py-16 text-center space-y-3 max-w-md mx-auto p-4">
            <div class="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-500 mx-auto flex items-center justify-center">
              <i data-lucide="shield-check" class="w-6 h-6"></i>
            </div>
            <h4 class="text-sm font-bold text-slate-900 dark:text-white">Zero Pins Displaced</h4>
            <p class="text-xs text-slate-500">All crawled pins currently maintain active positions inside the organic SERP reach.</p>
          </div>
        </template>

        <!-- VAULT TABLE VIEW -->
        <template x-if="!isDisplacedLoading && filteredDisplacedPins && filteredDisplacedPins.length > 0 && viewMode === 'table'">
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="table-sticky-header bg-slate-100/90 dark:bg-[#121215]/90 border-b border-slate-200 dark:border-[#27272A] text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  <th class="py-3.5 px-3 w-10 text-center">
                    <input type="checkbox" @click="toggleSelectAllPins()"
                           :checked="selectedPinIds.length === filteredDisplacedPins.length && filteredDisplacedPins.length > 0"
                           class="w-3.5 h-3.5 rounded text-rose-600 focus:ring-rose-500 border-slate-300 dark:border-[#27272A]">
                  </th>
                  <th class="py-3.5 px-3 w-14">Preview</th>
                  <th class="py-3.5 px-4 min-w-[260px]">Pin Title & ID</th>
                  <th class="py-3.5 px-3 w-32">Status & Rank</th>
                  <th class="py-3.5 px-3 w-32">Vacuum Score</th>
                  <th class="py-3.5 px-3 w-32">Saves & Δ</th>
                  <th class="py-3.5 px-3 w-28">Repins & Δ</th>
                  <th class="py-3.5 px-2 w-20">Comments</th>
                  <th class="py-3.5 px-2 w-20">Shares</th>
                  <th class="py-3.5 px-3 w-28">Velocity</th>
                  <th class="py-3.5 px-3 w-36">Domain Authority</th>
                  <th class="py-3.5 px-3 w-28 text-right">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
                <template x-for="(pin, idx) in paginatedDisplacedPins" :key="pin.pin_id">
                  <tr :data-pin-id="pin.pin_id"
                      class="hover:bg-slate-50/80 dark:hover:bg-slate-900/40 transition group cursor-pointer"
                      @click="openPinInspector(pin)">
                    
                    <td class="py-3.5 px-3 text-center" @click.stop>
                      <input type="checkbox" :checked="isPinSelected(pin.pin_id)" @click="togglePinSelection(pin.pin_id)"
                             class="w-3.5 h-3.5 rounded text-rose-600 focus:ring-rose-500 border-slate-300 dark:border-[#27272A]">
                    </td>

                    <td class="py-3.5 px-3">
                      <div class="relative group/img shrink-0">
                        <template x-if="pin.image_url">
                          <img :src="pin.image_url" class="w-10 h-14 rounded-lg object-cover border border-slate-200 dark:border-[#27272A] shadow-xs group-hover/img:scale-105 transition" onerror="window.handlePinImgError(this)">
                        </template>
                        <template x-if="!pin.image_url">
                          <div class="w-10 h-14 rounded-lg bg-slate-200 dark:bg-slate-800 flex items-center justify-center">
                            <i data-lucide="image" class="w-3.5 h-3.5 text-slate-400"></i>
                          </div>
                        </template>
                      </div>
                    </td>

                    <td class="py-3.5 px-4 min-w-[260px]">
                      <div class="space-y-1">
                        <span class="font-bold text-slate-900 dark:text-white group-hover:text-rose-500 line-clamp-2 block transition"
                              x-text="pin.title || 'Untitled Pin'"></span>
                        <div class="flex items-center flex-wrap gap-1.5 text-[10px] text-slate-400 font-mono tabular-nums">
                          <span class="text-slate-500 dark:text-slate-400 truncate font-mono tabular-nums" x-text="'ID: ' + pin.pin_id"></span>
                          <span class="text-slate-400" x-text="'Displaced: ' + formatDate(pin.displaced_date)"></span>
                          <!-- Method Badge -->
                          <span class="px-1.5 py-0.2 rounded text-[9px] font-mono tabular-nums font-bold border shrink-0"
                                :class="getPinMethodBadgeClass(pin)"
                                :title="'Method: ' + formatPinMethodLabel(pin)"
                                x-text="getPinMethod(pin)"></span>
                          <!-- Created Timestamp / Age Badge -->
                          <template x-if="getPinCreatedDate(pin)">
                            <span class="text-slate-500 dark:text-slate-400 font-mono tabular-nums text-[9px] truncate shrink-0"
                                  :title="'Created: ' + formatPinCreated(pin)"
                                  x-text="'📅 ' + (formatPinAge(pin) || formatPinCreated(pin))"></span>
                          </template>
                        </div>
                      </div>
                    </td>

                    <!-- Status & Last Known Rank -->
                    <td class="py-3.5 px-3 font-mono tabular-nums space-y-1">
                      <template x-if="pin.status === 're_entered_serp'">
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 block w-fit">
                          🟢 Resurged
                        </span>
                      </template>
                      <template x-if="pin.status !== 're_entered_serp'">
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 block w-fit">
                          Dropped Out
                        </span>
                      </template>
                      <span class="text-[10px] text-slate-400 block" x-text="'Was Rank #' + (pin.last_known_rank || '?')"></span>
                    </td>

                    <!-- Vacuum Opportunity Score -->
                    <td class="py-3.5 px-3 font-mono tabular-nums">
                      <span class="px-2.5 py-1 rounded-xl text-xs font-black block w-fit"
                            :class="Number(pin.vacuum_opportunity_score || 0) >= 70 ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40' : (Number(pin.vacuum_opportunity_score || 0) >= 40 ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/40' : 'bg-slate-100 dark:bg-slate-800 text-slate-500')"
                            x-text="(pin.vacuum_opportunity_score || 50) + '/100'"></span>
                    </td>

                    <!-- Saves & Growth Pace Delta -->
                    <td class="py-3.5 px-3 space-y-0.5 font-mono tabular-nums">
                      <div class="font-bold text-slate-900 dark:text-white"
                           x-text="formatNumber(pin.save_count ?? pin.current_saves ?? 0)"></div>
                      <template x-if="getPaceDelta(pin, 'saves') && getPaceDelta(pin, 'saves') !== '0'">
                        <span class="text-[10px] font-bold text-emerald-500 block"
                              x-text="getPaceDelta(pin, 'saves')"></span>
                      </template>
                    </td>

                    <!-- Repins & Growth Pace Delta -->
                    <td class="py-3.5 px-3 space-y-0.5 font-mono tabular-nums">
                      <div class="font-bold text-slate-700 dark:text-slate-300"
                           x-text="formatNumber(pin.repin_count ?? pin.current_repins ?? 0)"></div>
                      <template x-if="getPaceDelta(pin, 'repins') && getPaceDelta(pin, 'repins') !== '0'">
                        <span class="text-[10px] font-bold text-emerald-500 block"
                              x-text="getPaceDelta(pin, 'repins')"></span>
                      </template>
                    </td>

                    <!-- Comments -->
                    <td class="py-3.5 px-2 font-mono tabular-nums text-slate-600 dark:text-slate-400"
                        x-text="pin.comment_count ?? pin.current_comments ?? 0"></td>

                    <!-- Shares -->
                    <td class="py-3.5 px-2 font-mono tabular-nums text-slate-600 dark:text-slate-400"
                        x-text="pin.share_count ?? pin.current_shares ?? 0"></td>

                    <!-- Velocity -->
                    <td class="py-3.5 px-3 font-mono tabular-nums">
                      <span class="px-2 py-0.5 rounded-lg text-xs font-black block w-fit"
                            :class="Number(pin.daily_save_velocity || pin.calculated_velocity || 0) > 0 ? 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'"
                            x-text="(Number(pin.daily_save_velocity || pin.calculated_velocity || 0) > 0 ? '+' : '') + Number(pin.daily_save_velocity || pin.calculated_velocity || 0) + ' /d'"></span>
                    </td>

                    <!-- Domain -->
                    <td class="py-3.5 px-3">
                      <span class="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400 truncate max-w-[130px] block"
                            x-text="pin.domain || 'Pinterest Direct'"></span>
                    </td>

                    <!-- Actions -->
                    <td class="py-3.5 px-3 text-right">
                      <div class="flex items-center justify-end space-x-1" @click.stop>
                        <button @click="openPinInspector(pin)"
                                class="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition cursor-pointer"
                                title="Open Pin Deep Dossier">
                          <i data-lucide="eye" class="w-3.5 h-3.5"></i>
                        </button>
                        <button @click="openVisualLens(pin)"
                                class="p-1.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 transition cursor-pointer"
                                title="Visual Lens Similarity Search">
                          <i data-lucide="camera" class="w-3.5 h-3.5"></i>
                        </button>
                        <a :href="'https://www.pinterest.com/pin/' + pin.pin_id + '/'" target="_blank"
                           class="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-white transition"
                           title="Open Pin on Pinterest">
                          <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                        </a>
                      </div>
                    </td>

                  </tr>
                </template>
              </tbody>
            </table>
          </div>
        </template>

        <!-- VAULT CARDS VIEW -->
        <template x-if="!isDisplacedLoading && filteredDisplacedPins && filteredDisplacedPins.length > 0 && viewMode === 'cards'">
          <div class="p-5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            <template x-for="pin in paginatedDisplacedPins" :key="pin.pin_id">
              <div :data-pin-id="pin.pin_id"
                   @click="openPinInspector(pin)"
                   class="p-4 rounded-3xl bg-slate-50/70 dark:bg-slate-900/40 border border-slate-200/80 dark:border-[#27272A] hover:border-rose-500/40 transition group cursor-pointer flex flex-col justify-between space-y-3.5">
                
                <div class="space-y-3">
                  <div class="relative rounded-2xl overflow-hidden aspect-[2/3] max-h-56 bg-slate-200 dark:bg-slate-800">
                    <template x-if="pin.image_url">
                      <img :src="pin.image_url" class="w-full h-full object-cover group-hover:scale-105 transition duration-300" onerror="window.handlePinImgError(this)">
                    </template>
                    <div class="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-lg bg-slate-950/80 text-white font-mono tabular-nums font-black text-xs backdrop-blur-xs"
                         x-text="'Was #' + (pin.last_known_rank || '?')"></div>
                    <div class="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md text-[10px] font-mono tabular-nums backdrop-blur-xs uppercase font-bold"
                         :class="pin.status === 're_entered_serp' ? 'bg-emerald-950/80 text-emerald-400' : 'bg-rose-950/80 text-rose-300'"
                         x-text="pin.status === 're_entered_serp' ? 'Resurged' : 'Displaced'"></div>
                  </div>

                  <div class="space-y-1">
                    <h4 class="text-xs font-bold text-slate-900 dark:text-white group-hover:text-rose-500 line-clamp-2 leading-snug transition"
                        x-text="pin.title || 'Untitled Pin'"></h4>
                    <div class="flex items-center justify-between text-[10px] font-mono tabular-nums text-slate-400">
                      <div class="flex items-center space-x-1.5 truncate">
                        <span x-text="'ID: ' + pin.pin_id"></span>
                        <span class="px-1.5 py-0.2 rounded text-[8px] font-mono tabular-nums font-bold border shrink-0"
                              :class="getPinMethodBadgeClass(pin)"
                              :title="'Method: ' + formatPinMethodLabel(pin)"
                              x-text="getPinMethod(pin)"></span>
                        <template x-if="formatPinAge(pin)">
                          <span class="text-slate-400 text-[9px] shrink-0" :title="'Created: ' + formatPinCreated(pin)" x-text="'📅 ' + formatPinAge(pin)"></span>
                        </template>
                      </div>
                      <span class="text-emerald-500 font-bold shrink-0" x-text="'Vacuum: ' + (pin.vacuum_opportunity_score || 50) + '/100'"></span>
                    </div>
                  </div>
                </div>

                <div class="pt-2.5 border-t border-slate-200/60 dark:border-[#27272A]/60 space-y-2">
                  <div class="flex items-center justify-between text-xs font-mono tabular-nums">
                    <div>
                      <span class="text-slate-400 text-[10px]">Saves:</span>
                      <strong class="text-slate-900 dark:text-white" x-text="formatNumber(pin.save_count ?? pin.current_saves ?? 0)"></strong>
                      <template x-if="getPaceDelta(pin, 'saves') && getPaceDelta(pin, 'saves') !== '0'">
                        <span class="text-emerald-500 text-[10px] font-bold" x-text="getPaceDelta(pin, 'saves')"></span>
                      </template>
                    </div>
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold font-mono tabular-nums"
                          :class="Number(pin.daily_save_velocity || pin.calculated_velocity || 0) > 0 ? 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'"
                          x-text="(Number(pin.daily_save_velocity || pin.calculated_velocity || 0) > 0 ? '+' : '') + (pin.daily_save_velocity || pin.calculated_velocity || 0) + ' v/d'"></span>
                  </div>

                  <div class="flex items-center justify-between text-[11px] text-slate-400 pt-1" @click.stop>
                    <span class="truncate max-w-[120px] font-mono tabular-nums text-[10px]" x-text="pin.domain || 'Pinterest'"></span>
                    <div class="flex items-center space-x-1">
                      <button @click="openPinInspector(pin)" class="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-200" title="Dossier">
                        <i data-lucide="eye" class="w-3.5 h-3.5"></i>
                      </button>
                      <button @click="openVisualLens(pin)" class="p-1 rounded hover:bg-purple-500/20 text-slate-400 hover:text-purple-400" title="Visual Lens">
                        <i data-lucide="camera" class="w-3.5 h-3.5"></i>
                      </button>
                      <a :href="'https://www.pinterest.com/pin/' + pin.pin_id + '/'" target="_blank" class="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-white" title="Pinterest">
                        <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                      </a>
                    </div>
                  </div>
                </div>

              </div>
            </template>
          </div>
        </template>

        <!-- Windowed Pagination Controls (LND-806) -->
        <template x-if="!isDisplacedLoading && filteredDisplacedPins && filteredDisplacedPins.length > displacedPageSize">
          <div class="px-5 py-3 border-t border-slate-200/80 dark:border-[#27272A] flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50/70 dark:bg-slate-900/40 text-xs font-mono tabular-nums">
            <div class="flex items-center space-x-2">
              <span class="text-slate-500">Page Size:</span>
              <select x-model="displacedPageSize" @change="displacedPage = 1" class="px-2 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] text-slate-800 dark:text-slate-200 text-xs">
                <option value="25">25 per page</option>
                <option value="50">50 per page</option>
              </select>
              <span class="text-slate-400" x-text="'Showing ' + (((displacedPage - 1) * displacedPageSize) + 1) + '–' + Math.min(displacedPage * displacedPageSize, filteredDisplacedPins.length) + ' of ' + filteredDisplacedPins.length"></span>
            </div>
            <div class="flex items-center space-x-1.5">
              <button type="button" @click="displacedPage = Math.max(1, displacedPage - 1)" :disabled="displacedPage <= 1" class="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] text-slate-700 dark:text-slate-300 disabled:opacity-40 transition">Prev</button>
              <span class="px-2 text-slate-500" x-text="displacedPage + ' / ' + totalDisplacedPages"></span>
              <button type="button" @click="displacedPage = Math.min(totalDisplacedPages, displacedPage + 1)" :disabled="displacedPage >= totalDisplacedPages" class="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] text-slate-700 dark:text-slate-300 disabled:opacity-40 transition">Next</button>
            </div>
          </div>
        </template>

        <!-- Displaced Vault Pagination / Load More Footer -->
        <template x-if="!isDisplacedLoading && displacedVaultPins.length > 0">
          <div class="p-4 border-t border-slate-200/80 dark:border-[#27272A] flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50/50 dark:bg-slate-900/30 rounded-b-3xl">
            <div class="text-xs text-slate-500 font-mono tabular-nums">
              <span>Showing </span>
              <span class="font-bold text-slate-900 dark:text-white" x-text="displacedVaultPins.length"></span>
              <span> of </span>
              <span class="font-bold text-rose-500" x-text="totalDisplacedCount"></span>
              <span> displaced vault pins</span>
            </div>
            <template x-if="displacedVaultPins.length < totalDisplacedCount">
              <button type="button" @click="loadMoreDisplacedPins()"
                      :disabled="isLoadingMoreDisplaced"
                      class="px-4 py-2 rounded-xl text-xs font-bold font-mono tabular-nums bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 transition flex items-center space-x-2 cursor-pointer disabled:opacity-50">
                <template x-if="isLoadingMoreDisplaced">
                  <i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i>
                </template>
                <template x-if="!isLoadingMoreDisplaced">
                  <i data-lucide="arrow-down" class="w-3.5 h-3.5"></i>
                </template>
                <span x-text="isLoadingMoreDisplaced ? 'Loading Displaced Pins...' : ('Load More Displaced Pins (+' + Math.min(24, totalDisplacedCount - displacedVaultPins.length) + ')')"></span>
              </button>
            </template>
            <template x-if="displacedVaultPins.length >= totalDisplacedCount">
              <div class="text-xs font-mono tabular-nums text-emerald-500 font-bold flex items-center space-x-1">
                <i data-lucide="check" class="w-3.5 h-3.5"></i>
                <span>All Displaced Pins Loaded</span>
              </div>
            </template>
          </div>
        </template>

      </div>

      <!-- DEPRECATED CROSSOVER TAB - MIGRATED TO /folders/:id -->
      <div x-show="activeTab === 'crossover'" class="hidden">
        
        <!-- Folder Switcher & Management Strip -->
        <div class="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-slate-100/80 dark:bg-slate-900/60 border border-slate-200 dark:border-[#27272A]">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-xs font-bold text-slate-400 font-mono tabular-nums uppercase tracking-wider mr-1">Folders:</span>
            <template x-for="f in folders" :key="f.id">
              <button @click="selectFolder(f)"
                      class="px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-2 cursor-pointer border"
                      :class="activeFolder?.id === f.id ? 'bg-pink-500/20 text-pink-600 dark:text-pink-300 border-pink-500/50 shadow-xs' : 'bg-white dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-[#27272A] hover:border-slate-400'">
                <span class="w-2.5 h-2.5 rounded-full shrink-0" :style="'background-color: ' + (f.color || '#ec4899')"></span>
                <span x-text="f.name"></span>
                <span class="px-1.5 py-0.2 rounded-full text-[10px] font-mono tabular-nums bg-slate-200 dark:bg-slate-700/60" x-text="f.keyword_count || 0"></span>
              </button>
            </template>
            <button @click="openCreateFolderModal()"
                    class="px-3 py-1.5 rounded-xl text-xs font-bold bg-pink-500/10 hover:bg-pink-500/20 text-pink-600 dark:text-pink-400 border border-pink-500/30 transition flex items-center space-x-1.5 cursor-pointer">
              <i data-lucide="plus" class="w-3.5 h-3.5"></i>
              <span>New Folder</span>
            </button>
          </div>

          <div class="flex items-center space-x-2">
            <button @click="isFolderManagerOpen = true"
                    class="px-3 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-[#27272A] hover:bg-slate-50 dark:hover:bg-slate-700 transition flex items-center space-x-1.5">
              <i data-lucide="settings" class="w-3.5 h-3.5"></i>
              <span>Manage All Folders</span>
            </button>
          </div>
        </div>

        <!-- Empty State: No Folders Yet -->
        <template x-if="folders.length === 0">
          <div class="py-16 text-center space-y-4 max-w-lg mx-auto p-6 rounded-3xl border border-dashed border-slate-300 dark:border-[#27272A] bg-slate-50/50 dark:bg-slate-900/20">
            <div class="w-16 h-16 rounded-3xl bg-pink-500/10 text-pink-500 mx-auto flex items-center justify-center shadow-lg shadow-pink-500/10">
              <i data-lucide="folder-kanban" class="w-8 h-8"></i>
            </div>
            <div class="space-y-1">
              <h3 class="text-base font-black text-slate-900 dark:text-white">Create Your First Campaign Folder</h3>
              <p class="text-xs text-slate-500 max-w-md mx-auto">
                Group related search keywords into topic clusters (e.g. <em>"Comfort Casseroles"</em>, <em>"Quick Dinner Ideas"</em>) to unlock automatic multi-ranking super-pins, universal tag bridges, creator monopoly analysis, and 1-click CSV blueprints.
              </p>
            </div>
            <button @click="openCreateFolderModal()"
                    class="px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white transition shadow-lg shadow-pink-950/20 active:scale-95 flex items-center space-x-2 mx-auto cursor-pointer">
              <i data-lucide="plus-circle" class="w-4 h-4"></i>
              <span>Create Campaign Folder</span>
            </button>
          </div>
        </template>

        <!-- Active Folder Executive Workspace -->
        <template x-if="activeFolder">
          <div class="space-y-6">

            <!-- FOLDER HERO HEADER & METRIC CARDS -->
            <div class="p-6 rounded-3xl bg-gradient-to-br from-white via-pink-50/30 to-purple-50/20 dark:from-[#0c1322] dark:via-slate-900 dark:to-[#111827] border border-pink-500/20 dark:border-pink-500/10 shadow-sm space-y-5">
              
              <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div class="flex items-start sm:items-center space-x-4 min-w-0">
                  <div class="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-black shadow-lg shadow-pink-500/20 shrink-0"
                       :style="'background: linear-gradient(135deg, ' + (activeFolder.color || '#ec4899') + ', #8b5cf6)'">
                    <i data-lucide="folder" class="w-7 h-7"></i>
                  </div>
                  <div class="min-w-0">
                    <div class="flex flex-wrap items-center gap-2.5">
                      <h2 class="text-xl sm:text-2xl font-black text-slate-900 dark:text-white capitalize truncate" x-text="activeFolder.name"></h2>
                      <span class="px-2.5 py-0.5 rounded-full text-[10px] font-mono tabular-nums font-bold bg-pink-500/10 text-pink-600 dark:text-pink-400 border border-pink-500/30">
                        Topic Cluster
                      </span>
                    </div>
                    <p class="text-xs text-slate-500 dark:text-slate-400 mt-1" x-text="activeFolder.description || 'Algorithmic Topic Cluster & Multi-Dimensional Crossover Engine'"></p>
                  </div>
                </div>

                <!-- Action Toolbar -->
                <div class="flex flex-wrap items-center gap-2">
                  <button @click="openAddKeywordsModal()"
                          class="px-3.5 py-2.5 rounded-2xl text-xs font-bold bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-[#27272A] text-slate-700 dark:text-slate-200 transition flex items-center space-x-1.5 cursor-pointer">
                    <i data-lucide="plus" class="w-3.5 h-3.5 text-pink-500"></i>
                    <span>Add Keywords</span>
                  </button>

                  <button @click="fetchFolderCrossover(activeFolder.id)"
                          :disabled="isCrossoverLoading"
                          class="p-2.5 rounded-2xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-[#27272A] text-slate-600 dark:text-slate-300 transition cursor-pointer"
                          title="Recalculate Crossover Matrix">
                    <i data-lucide="refresh-cw" class="w-4 h-4" :class="isCrossoverLoading ? 'animate-spin text-pink-500' : ''"></i>
                  </button>

                  <button @click="deleteCampaignFolder(activeFolder.id)"
                          class="p-2.5 rounded-2xl bg-white dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-slate-200 dark:border-[#27272A] text-rose-500 hover:text-rose-600 transition cursor-pointer"
                          title="Delete Folder">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                  </button>
                </div>
              </div>

              <!-- 6 Executive Folder KPI Cards -->
              <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-3 border-t border-slate-200/60 dark:border-[#27272A]/60">
                <div class="p-3.5 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-[#27272A] space-y-1">
                  <span class="text-[10px] font-mono tabular-nums font-bold uppercase text-slate-400">Keywords</span>
                  <p class="text-xl font-black text-slate-900 dark:text-white font-mono tabular-nums" x-text="crossoverData?.summary?.total_keywords || 0"></p>
                </div>

                <div class="p-3.5 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-[#27272A] space-y-1">
                  <span class="text-[10px] font-mono tabular-nums font-bold uppercase text-slate-400">Unique Pins</span>
                  <p class="text-xl font-black text-cyan-600 dark:text-cyan-400 font-mono tabular-nums" x-text="formatNumber(crossoverData?.summary?.total_unique_pins || 0)"></p>
                </div>

                <div class="p-3.5 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-[#27272A] space-y-1">
                  <span class="text-[10px] font-mono tabular-nums font-bold uppercase text-slate-400">Super-Pins</span>
                  <p class="text-xl font-black text-amber-500 font-mono tabular-nums" x-text="crossoverData?.summary?.super_pins_count || 0"></p>
                </div>

                <div class="p-3.5 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-[#27272A] space-y-1">
                  <span class="text-[10px] font-mono tabular-nums font-bold uppercase text-slate-400">Universal Tags</span>
                  <p class="text-xl font-black text-emerald-500 font-mono tabular-nums" x-text="crossoverData?.summary?.universal_tags_count || 0"></p>
                </div>

                <div class="p-3.5 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-[#27272A] space-y-1">
                  <span class="text-[10px] font-mono tabular-nums font-bold uppercase text-slate-400">Shared Pivots</span>
                  <p class="text-xl font-black text-blue-500 font-mono tabular-nums" x-text="crossoverData?.summary?.shared_pivots_count || 0"></p>
                </div>

                <div class="p-3.5 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-[#27272A] space-y-1">
                  <span class="text-[10px] font-mono tabular-nums font-bold uppercase text-slate-400">Whale Domains</span>
                  <p class="text-xl font-black text-purple-500 font-mono tabular-nums" x-text="crossoverData?.summary?.monopoly_domain_count || 0"></p>
                </div>
              </div>

            </div>

            <!-- Loading State -->
            <template x-if="isCrossoverLoading">
              <div class="py-20 text-center space-y-3 bg-white dark:bg-[#121215] rounded-3xl border border-slate-200 dark:border-[#27272A]">
                <div class="w-12 h-12 rounded-2xl bg-pink-500/10 text-pink-500 mx-auto flex items-center justify-center">
                  <i data-lucide="loader-2" class="w-6 h-6 animate-spin"></i>
                </div>
                <p class="text-sm font-bold text-slate-700 dark:text-slate-300">Computing Multi-Dimensional Crossover Matrix...</p>
                <p class="text-xs text-slate-400 font-mono tabular-nums">Analyzing super-pins overlap, universal tag bridges, domain monopoly & seasonality wave</p>
              </div>
            </template>

            <!-- Fallback Empty State if not loading and no data -->
            <template x-if="!isCrossoverLoading && !crossoverData">
              <div class="py-16 text-center space-y-4 bg-white dark:bg-[#121215] rounded-3xl border border-slate-200 dark:border-[#27272A]">
                <div class="w-12 h-12 rounded-2xl bg-pink-500/10 text-pink-500 mx-auto flex items-center justify-center">
                  <i data-lucide="network" class="w-6 h-6"></i>
                </div>
                <div>
                  <h3 class="text-sm font-bold text-slate-900 dark:text-white" x-text="'No Crossover Data Loaded for ' + activeFolder.name"></h3>
                  <p class="text-xs text-slate-500 mt-1">Click below to compute the multi-dimensional crossover matrix.</p>
                </div>
                <button @click="fetchFolderCrossover(activeFolder.id)" class="px-5 py-2.5 rounded-xl text-xs font-bold bg-pink-600 text-white hover:bg-pink-500 transition cursor-pointer">
                  Compute Crossover Matrix
                </button>
              </div>
            </template>

            <!-- Crossover Content Panels -->
            <template x-if="!isCrossoverLoading && crossoverData">
              <div class="space-y-6">

                <!-- DIMENSION 1: 🌟 MULTI-RANKING SUPER-PINS OVERLAP -->
                <div class="p-6 rounded-3xl bg-white dark:bg-[#121215] border border-slate-200/80 dark:border-[#27272A] shadow-xs space-y-4">
                  <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-[#27272A]/80">
                    <div class="space-y-0.5">
                      <div class="flex items-center space-x-2">
                        <i data-lucide="sparkles" class="w-4 h-4 text-amber-500"></i>
                        <h3 class="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">Multi-Ranking Super-Pins</h3>
                        <span class="px-2 py-0.5 rounded text-[10px] font-mono tabular-nums font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400"
                              x-text="(crossoverData?.summary?.super_pins_count ?? crossoverData.super_pins?.length ?? 0) + ' Pins'"></span>
                      </div>
                      <p class="text-xs text-slate-500">Pins ranking across multiple search queries simultaneously in this cluster. Analyze their visual layouts for winning templates.</p>
                    </div>
                  </div>

                  <template x-if="crossoverData.super_pins?.length === 0">
                    <div class="py-10 text-center text-xs text-slate-400 italic">
                      No overlapping super-pins discovered yet. Crawl more keyword SERPs to populate multi-ranking pins.
                    </div>
                  </template>

                  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    <template x-for="pin in crossoverData.super_pins?.slice(0, 16)" :key="pin.pin_id">
                      <div class="p-3.5 rounded-2xl bg-slate-50/70 dark:bg-slate-900/40 border border-slate-200/80 dark:border-[#27272A] hover:border-pink-500/40 transition group cursor-pointer flex flex-col justify-between space-y-3"
                           @click="openPinInspector(pin)">
                        
                        <div class="flex items-start space-x-3 min-w-0">
                          <template x-if="pin.image_url">
                            <img :src="pin.image_url" class="w-14 h-20 rounded-xl object-cover border border-slate-200 dark:border-[#27272A] shrink-0 group-hover:scale-105 transition shadow-xs" onerror="window.handlePinImgError(this)">
                          </template>
                          <template x-if="!pin.image_url">
                            <div class="w-14 h-20 rounded-xl bg-slate-200 dark:bg-slate-800 flex items-center justify-center shrink-0">
                              <i data-lucide="image" class="w-4 h-4 text-slate-400"></i>
                            </div>
                          </template>
                          
                          <div class="min-w-0 flex-1 space-y-1">
                            <div class="flex items-center justify-between gap-1">
                              <span class="px-2 py-0.5 rounded text-[9px] font-mono tabular-nums font-bold uppercase"
                                    :class="pin.overlap_count >= 2 ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'"
                                    x-text="pin.overlap_count >= 2 ? (pin.overlap_count + 'x Overlap') : 'Top Rank'"></span>
                              <span class="text-[10px] font-mono tabular-nums font-bold text-slate-700 dark:text-slate-300" x-text="formatNumber(pin.save_count) + ' saves'"></span>
                            </div>
                            <h4 class="text-xs font-bold text-slate-900 dark:text-white line-clamp-2 leading-tight" x-text="pin.title"></h4>
                            <div class="text-[10px] text-slate-400 font-mono tabular-nums truncate" x-text="pin.domain || 'Pinterest Direct'"></div>
                          </div>
                        </div>

                        <!-- Ranked Keywords List -->
                        <div class="pt-2 border-t border-slate-200/60 dark:border-[#27272A]/60 space-y-1">
                          <span class="text-[9px] font-mono tabular-nums font-bold text-slate-400 uppercase">Ranked Queries:</span>
                          <div class="flex flex-wrap gap-1">
                            <template x-for="r in pin.rankings" :key="r.keyword">
                              <template x-if="r.rank_position != null && r.rank_position >= 1">
                                <span class="px-2 py-0.5 rounded text-[10px] font-mono tabular-nums font-bold bg-pink-500/10 text-pink-600 dark:text-pink-400 border border-pink-500/20 truncate max-w-full"
                                      x-text="r.keyword + ' (#' + r.rank_position + ')'"></span>
                              </template>
                            </template>
                          </div>
                        </div>

                      </div>
                    </template>
                  </div>
                </div>

                <!-- DIMENSION 2: 🌉 UNIVERSAL TAG BRIDGES (CV & Semantic Annotations Overlap) -->
                <div class="p-6 rounded-3xl bg-white dark:bg-[#121215] border border-slate-200/80 dark:border-[#27272A] shadow-xs space-y-4">
                  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-[#27272A]/80">
                    <div class="space-y-0.5">
                      <div class="flex items-center space-x-2">
                        <i data-lucide="network" class="w-4 h-4 text-emerald-500"></i>
                        <h3 class="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">Universal Visual Tag Bridges</h3>
                        <span class="px-2 py-0.5 rounded text-[10px] font-mono tabular-nums font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                              x-text="crossoverData.tag_bridges?.length + ' Tags'"></span>
                      </div>
                      <p class="text-xs text-slate-500">Tags and visual entities shared across multiple search terms in this folder. Include these in your Pin descriptions to rank for the entire topic cluster.</p>
                    </div>

                    <button @click="copyAllUniversalTags()"
                            class="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 transition flex items-center space-x-1.5 cursor-pointer shrink-0">
                      <i data-lucide="copy" class="w-3.5 h-3.5"></i>
                      <span>Copy Top Tags Blueprint</span>
                    </button>
                  </div>

                  <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    <template x-for="tag in crossoverData.tag_bridges?.slice(0, 16)" :key="tag.tag">
                      <div class="p-3 rounded-2xl bg-slate-50/70 dark:bg-slate-900/40 border border-slate-200/80 dark:border-[#27272A] space-y-2">
                        <div class="flex items-center justify-between gap-1">
                          <span class="text-xs font-bold text-slate-900 dark:text-white capitalize" x-text="tag.tag"></span>
                          <span class="px-2 py-0.5 rounded text-[10px] font-mono tabular-nums font-bold"
                                :class="tag.overlap_percentage >= 80 ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30' : (tag.overlap_percentage >= 50 ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400' : 'bg-slate-200 dark:bg-slate-800 text-slate-500')"
                                x-text="tag.overlap_percentage + '% (' + tag.keyword_overlap_count + '/' + crossoverData.summary?.total_keywords + ')'"></span>
                        </div>
                        <div class="flex items-center justify-between text-[11px] text-slate-400 font-mono tabular-nums">
                          <span x-text="tag.pin_count + ' pins tagged'"></span>
                          <span x-text="formatNumber(tag.total_saves) + ' saves'"></span>
                        </div>
                      </div>
                    </template>
                  </div>
                </div>

                <!-- TWO COLUMNS: SHARED GUIDED PIVOTS & DOMAIN AUTHORITY -->
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">

                  <!-- DIMENSION 3: 🧭 SHARED GUIDED SEARCH PIVOTS -->
                  <div class="p-6 rounded-3xl bg-white dark:bg-[#121215] border border-slate-200/80 dark:border-[#27272A] shadow-xs space-y-4">
                    <div class="pb-3 border-b border-slate-100 dark:border-[#27272A]/80">
                      <div class="flex items-center space-x-2">
                        <i data-lucide="compass" class="w-4 h-4 text-cyan-500"></i>
                        <h3 class="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">Shared Guided Pivots</h3>
                      </div>
                      <p class="text-xs text-slate-500 mt-0.5">Semantic search capsules connecting multiple keywords in this cluster.</p>
                    </div>

                    <div class="flex flex-wrap gap-2 max-h-72 overflow-y-auto">
                      <template x-for="pivot in crossoverData.guided_pivots" :key="pivot.term">
                        <div class="px-3 py-1.5 rounded-xl border flex items-center space-x-2 text-xs transition hover:scale-105 cursor-pointer"
                             :title="'Shared by ' + pivot.shared_count + ' keywords: ' + (pivot.shared_keywords?.map(k => k.keyword || k)?.join(', ') || '')"
                             :class="pivot.shared_count >= 2 ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-600 dark:text-cyan-400 font-bold' : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-[#27272A] text-slate-700 dark:text-slate-300'">
                          <span class="font-bold" x-text="pivot.display_label"></span>
                          <span class="px-1.5 py-0.2 rounded-full text-[10px] font-mono tabular-nums"
                                :class="pivot.shared_count >= 2 ? 'bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 font-bold' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'"
                                x-text="pivot.shared_count + ' kw'"></span>
                        </div>
                      </template>
                    </div>
                  </div>

                  <!-- DIMENSION 4: 👑 DOMAIN & CREATOR MONOPOLY INDEX -->
                  <div class="p-6 rounded-3xl bg-white dark:bg-[#121215] border border-slate-200/80 dark:border-[#27272A] shadow-xs space-y-4">
                    <div class="pb-3 border-b border-slate-100 dark:border-[#27272A]/80">
                      <div class="flex items-center space-x-2">
                        <i data-lucide="crown" class="w-4 h-4 text-purple-500"></i>
                        <h3 class="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">Authority Domain Monopoly</h3>
                      </div>
                      <p class="text-xs text-slate-500 mt-0.5">Top websites dominating the search rankings across your entire cluster.</p>
                    </div>

                    <div class="space-y-2 max-h-72 overflow-y-auto">
                      <template x-for="d in crossoverData.domain_monopoly?.slice(0, 8)" :key="d.domain">
                        <div class="p-2.5 rounded-xl bg-slate-50/70 dark:bg-slate-900/40 border border-slate-200/80 dark:border-[#27272A] flex items-center justify-between text-xs">
                          <div class="min-w-0">
                            <p class="font-bold text-slate-900 dark:text-white truncate" x-text="d.domain"></p>
                            <span class="text-[10px] text-slate-400 font-mono tabular-nums" x-text="d.keywords_count + ' keywords covered (' + d.overlap_percentage + '%)'"></span>
                          </div>
                          <div class="text-right shrink-0">
                            <span class="font-mono tabular-nums font-bold text-purple-600 dark:text-purple-400" x-text="formatNumber(d.total_saves) + ' saves'"></span>
                            <p class="text-[10px] text-slate-400 font-mono tabular-nums" x-text="d.pin_count + ' pins'"></p>
                          </div>
                        </div>
                      </template>
                    </div>
                  </div>

                </div>

                <!-- DIMENSION 5: 📈 COMPOSITE 52-WEEK SEASONALITY WAVE -->
                <div class="p-6 rounded-3xl bg-white dark:bg-[#121215] border border-slate-200/80 dark:border-[#27272A] shadow-xs space-y-4">
                  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-[#27272A]/80">
                    <div class="space-y-0.5">
                      <div class="flex items-center space-x-2">
                        <i data-lucide="trending-up" class="w-4 h-4 text-blue-500"></i>
                        <h3 class="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">Composite 52-Week Seasonality Wave</h3>
                      </div>
                      <p class="text-xs text-slate-500">Joint demand curve aggregated across all keywords in this cluster.</p>
                    </div>

                    <div class="flex items-center space-x-3">
                      <div class="px-3 py-1.5 rounded-xl bg-blue-500/10 border border-blue-500/30 text-xs">
                        <span class="text-slate-400">Peak Months:</span>
                        <span class="font-bold text-blue-600 dark:text-blue-400 font-mono tabular-nums ml-1"
                              x-text="crossoverData.seasonality?.peak_months?.join(', ') || 'Evergreen'"></span>
                      </div>
                      <div class="px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs">
                        <span class="text-slate-400">Launch Window:</span>
                        <span class="font-bold text-emerald-600 dark:text-emerald-400 font-mono tabular-nums ml-1"
                              x-text="crossoverData.seasonality?.recommended_launch_window"></span>
                      </div>
                    </div>
                  </div>

                  <!-- Wave Chart -->
                  <div class="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
                    <svg class="w-full h-36 overflow-visible" viewBox="0 0 800 180" preserveAspectRatio="none">
                      <defs>
                        <linearGradient id="crossoverGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.4"/>
                          <stop offset="100%" stop-color="#3b82f6" stop-opacity="0"/>
                        </linearGradient>
                      </defs>
                      <path :d="getTrendsAreaPath(crossoverData.seasonality?.composite_wave?.map(w => w.score) || []).area" fill="url(#crossoverGrad)" />
                      <path :d="getTrendsAreaPath(crossoverData.seasonality?.composite_wave?.map(w => w.score) || []).line" fill="none" stroke="#3b82f6" stroke-width="2.5" stroke-linecap="round"/>
                    </svg>

                    <!-- 12-Month Timeline Axis with Dynamic Peak Highlights (Rolling Chronological) -->
                    <div class="grid grid-cols-12 text-center text-[10px] font-mono tabular-nums pt-2 border-t border-slate-800/80">
                      <template x-for="m in (crossoverData.seasonality?.rolling_months || ['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'])" :key="m">
                        <span :class="crossoverData.seasonality?.peak_months?.includes(m) ? 'text-blue-400 font-bold bg-blue-500/15 rounded py-0.5 border border-blue-500/30' : 'text-slate-500'" x-text="m"></span>
                      </template>
                    </div>
                  </div>
                </div>


              </div>
            </template>

          </div>
        </template>

      </div>

    </section>

    </div>

  </main>

  <!-- ELEVATED FLOATING BULK ACTION BAR (LEVEL 1A DASHBOARD) -->
  <div x-show="viewModeLevel === 'dashboard' && selectedKeywordIds.length > 0" x-cloak
       x-transition:enter="transition ease-out duration-300"
       x-transition:enter-start="opacity-0 translate-y-8"
       x-transition:enter-end="opacity-100 translate-y-0"
       x-transition:leave="transition ease-in duration-200"
       x-transition:leave-start="opacity-100 translate-y-0"
       x-transition:leave-end="opacity-0 translate-y-8"
       class="fixed bottom-6 inset-x-0 mx-auto w-fit z-50 bg-slate-900/95 dark:bg-[#121215]/95 border border-slate-700 shadow-2xl backdrop-blur-xl px-4 sm:px-6 py-3 rounded-2xl flex flex-wrap items-center gap-2 sm:gap-3 text-xs">
    <div class="flex items-center space-x-2">
      <span class="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
      <span class="px-2.5 py-1 rounded-xl bg-emerald-500/20 text-emerald-400 font-mono tabular-nums font-bold" x-text="selectedKeywordIds.length + ' Keywords Selected'"></span>
    </div>

    <div class="h-4 w-px bg-slate-700 hidden sm:block"></div>

    <button @click="bulkSyncKeywords()" :disabled="isBulkLoading"
            class="px-3.5 py-1.5 rounded-xl font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50">
      <i data-lucide="zap" class="w-3.5 h-3.5" :class="isBulkLoading ? 'animate-spin' : ''"></i>
      <span>⚡ Fast Refresh Now</span>
    </button>

    <button @click="openBulkFolderModal()" :disabled="isBulkLoading"
            class="px-3.5 py-1.5 rounded-xl font-bold bg-pink-500/20 hover:bg-pink-500/30 text-pink-400 border border-pink-500/40 transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50">
      <i data-lucide="folder-plus" class="w-3.5 h-3.5"></i>
      <span>📁 Add to Campaign Folder</span>
    </button>

    <button @click="bulkToggleKeywordStatus(false)" :disabled="isBulkLoading"
            class="px-3.5 py-1.5 rounded-xl font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/40 transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50">
      <i data-lucide="pause-circle" class="w-3.5 h-3.5"></i>
      <span>⏸ Pause Tracking</span>
    </button>

    <button @click="bulkToggleKeywordStatus(true)" :disabled="isBulkLoading"
            class="px-3.5 py-1.5 rounded-xl font-bold bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border border-blue-500/40 transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50">
      <i data-lucide="play-circle" class="w-3.5 h-3.5"></i>
      <span>▶ Resume Tracking</span>
    </button>

    <button @click="bulkDeleteKeywords()" :disabled="isBulkLoading"
            class="px-3.5 py-1.5 rounded-xl font-bold bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/40 transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50">
      <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
      <span>🗑 Delete Selected</span>
    </button>

    <button @click="clearSelectedKeywords()" class="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer" title="Clear Selection">
      <i data-lucide="x" class="w-4 h-4"></i>
    </button>
  </div>
`;
}
