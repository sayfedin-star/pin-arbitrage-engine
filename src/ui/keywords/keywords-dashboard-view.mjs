/**
 * Level 1A: Executive Keywords Dashboard View
 * (Filters, Presets, Grid/Table, Pagination, Quick Track Modal)
 */
import { renderCampaignWorkspaceHeader } from '../campaign-workspace-header.mjs';

export function getKeywordsDashboardViewHtml({ safeFolderId = '' } = {}) {
  return `    <!-- LEVEL 1A: EXECUTIVE KEYWORDS DASHBOARD (viewModeLevel === 'dashboard')   -->
    <!-- ========================================================================= -->
    <div x-show="viewModeLevel === 'dashboard'" x-cloak class="space-y-6">
      
      ${safeFolderId ? renderCampaignWorkspaceHeader({ activeRoom: 'keywords', folderId: safeFolderId }) : ''}

      <!-- [INVARIANT: MODERN-MINIMALIST-HEADER] Linear / Vercel Executive Header -->
      <template x-if="!activeFolderId">
        <section class="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#121215] border border-slate-200/80 dark:border-[#27272A]/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div class="flex items-center space-x-3.5">
            <div class="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center justify-center shadow-xs shrink-0">
              <i data-lucide="layers" class="w-5 h-5"></i>
            </div>
            <div>
              <div class="flex items-center space-x-2">
                <h2 class="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white">Keywords Fleet Dashboard</h2>
                <span class="px-2 py-0.5 rounded-md text-[10px] font-mono tabular-nums font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">Level 1A</span>
              </div>
              <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-normal">Multi-Cluster Organic SERP Monitoring · Velocity Tracking & Fleet Telemetry</p>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <!-- Keyword Discovery Hub Link (Level 1B) -->
            <a href="/keywords/discovery"
               class="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/10 hover:bg-emerald-500/20 dark:bg-emerald-950/30 dark:hover:bg-emerald-900/40 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 transition inline-flex items-center space-x-1.5 shadow-2xs">
              <i data-lucide="compass" class="w-3.5 h-3.5 text-emerald-500"></i>
              <span class="hidden sm:inline">Discovery</span>
            </a>

            <!-- 24h Pulse Radar Quick Link -->
            <a href="/pulse"
               class="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-rose-500/10 hover:bg-rose-500/20 dark:bg-rose-950/30 dark:hover:bg-rose-900/40 border border-rose-500/20 text-rose-600 dark:text-rose-400 transition inline-flex items-center space-x-1.5 shadow-2xs"
               title="24h Algorithmic Pulse & Crossover Radar">
              <i data-lucide="activity" class="w-3.5 h-3.5 text-rose-500"></i>
              <span class="hidden sm:inline">⚡ 24h Pulse Radar</span>
            </a>

            <!-- Campaign Folders Fleet Link (Level 4) -->
            <a href="/folders"
               class="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-pink-500/10 hover:bg-pink-500/20 dark:bg-pink-950/30 dark:hover:bg-pink-900/40 border border-pink-500/20 text-pink-600 dark:text-pink-400 transition inline-flex items-center space-x-1.5 shadow-2xs">
              <i data-lucide="folder-kanban" class="w-3.5 h-3.5 text-pink-500"></i>
              <span class="hidden sm:inline">Folders</span>
              <span class="px-1.5 py-0.2 rounded-full text-[10px] bg-pink-500/20 text-pink-600 dark:text-pink-300 font-mono tabular-nums font-medium" x-text="folders.length"></span>
            </a>

            <!-- Refresh Hub Button -->
            <button @click="fetchKeywords(true)" :disabled="isKeywordsLoading"
                    class="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/80 dark:hover:bg-slate-700/80 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-[#27272A] transition inline-flex items-center space-x-1.5 shadow-2xs cursor-pointer active:scale-95"
                    title="Sync with PostgreSQL Hub">
              <i data-lucide="refresh-cw" class="w-3.5 h-3.5" :class="isKeywordsLoading ? 'animate-spin text-emerald-500' : 'text-slate-400'"></i>
              <span class="hidden sm:inline">Refresh</span>
            </button>

            <!-- Primary CTA: Track Keyword -->
            <button @click="openQuickTrackModal()"
                    class="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition inline-flex items-center space-x-1.5 shadow-xs active:scale-95 cursor-pointer">
              <i data-lucide="plus-circle" class="w-3.5 h-3.5"></i>
              <span>+ Track Keyword</span>
            </button>

            <!-- Settings -->
            <button @click="openSettingsModal()"
                    class="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/80 dark:hover:bg-slate-700/80 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-[#27272A] transition inline-flex items-center space-x-1.5 shadow-2xs cursor-pointer"
                    title="Configure Crawl Depth & Breakout Hunter">
              <i data-lucide="sliders" class="w-3.5 h-3.5 text-slate-500 dark:text-slate-400"></i>
              <span>Settings</span>
            </button>

            <!-- Trigger Fleet Crawl -->
            <button @click="openFleetDispatchModal()" :disabled="isWorkflowDispatching"
                    class="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white transition inline-flex items-center space-x-1.5 shadow-xs disabled:opacity-50 cursor-pointer">
              <i data-lucide="play" class="w-3.5 h-3.5 text-emerald-400" :class="isWorkflowDispatching ? 'animate-spin' : ''"></i>
              <span>Trigger Fleet</span>
            </button>
          </div>
        </section>
      </template>

      <!-- [INVARIANT: MODERN-MINIMALIST-TELEMETRY-PARITY] Consolidated high-density telemetry strip eliminating card bloat while preserving all 4-pillar fleet telemetry metrics -->
      <section class="rounded-2xl bg-white dark:bg-[#121215] border border-slate-200/80 dark:border-[#27272A]/80 shadow-xs divide-y sm:divide-y-0 sm:divide-x divide-slate-100 dark:divide-slate-800/80 grid grid-cols-2 lg:grid-cols-4 overflow-hidden">
        
        <!-- Metric 1: Tracked Queries Fleet -->
        <div class="p-4 sm:p-5 flex flex-col justify-between space-y-2">
          <div class="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span class="font-medium text-[11px] uppercase tracking-wider font-mono tabular-nums">Tracked Queries</span>
            <span class="p-1 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <i data-lucide="tags" class="w-3.5 h-3.5"></i>
            </span>
          </div>
          <template x-if="isKeywordsLoading">
            <div class="space-y-1 py-0.5">
              <div class="h-7 w-16 bg-slate-200 dark:bg-slate-800 rounded animate-pulse"></div>
              <div class="h-3 w-24 bg-slate-100 dark:bg-slate-800/60 rounded animate-pulse"></div>
            </div>
          </template>
          <template x-if="!isKeywordsLoading">
            <div>
              <div class="flex items-baseline gap-2">
                <span class="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white font-mono tabular-nums tracking-tight" x-text="activeFolderId ? filteredDashboardKeywords.length : keywords.length"></span>
                <span class="text-xs text-slate-400 font-mono tabular-nums">monitored</span>
              </div>
              <div class="flex items-center gap-2 mt-1.5 text-[11px] font-mono tabular-nums">
                <span class="text-emerald-600 dark:text-emerald-400 font-semibold" x-text="activeKeywordsCount + ' active'"></span>
                <span class="text-slate-300 dark:text-slate-700">·</span>
                <span class="text-amber-600 dark:text-amber-400 font-medium" x-text="pausedKeywordsCount + ' paused'"></span>
              </div>
            </div>
          </template>
        </div>

        <!-- Metric 2: Monitored Organic Pins -->
        <div class="p-4 sm:p-5 flex flex-col justify-between space-y-2">
          <div class="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span class="font-medium text-[11px] uppercase tracking-wider font-mono tabular-nums" x-text="activeFolderId ? 'Active Crawled Pins' : 'Monitored Organic Pins'" :data-count="activeFolderId ? totalActivePinsCount : totalMonitoredPins"></span>
            <span class="p-1 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <i data-lucide="database" class="w-3.5 h-3.5"></i>
            </span>
          </div>
          <template x-if="isKeywordsLoading">
            <div class="space-y-1 py-0.5">
              <div class="h-7 w-20 bg-slate-200 dark:bg-slate-800 rounded animate-pulse"></div>
              <div class="h-3 w-28 bg-slate-100 dark:bg-slate-800/60 rounded animate-pulse"></div>
            </div>
          </template>
          <template x-if="!isKeywordsLoading">
            <div>
              <div class="flex items-baseline gap-2">
                <span class="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white font-mono tabular-nums tracking-tight" x-text="formatNumber(activeFolderId ? totalActivePinsCount : totalMonitoredPins)"></span>
                <span class="text-xs text-slate-400 font-mono tabular-nums">pins</span>
              </div>
              <div class="mt-1.5 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                <span>Quota: </span>
                <span class="text-blue-600 dark:text-blue-400 font-medium" x-text="'~' + (appSettings.default_max_pins || 250) + ' pins / query'"></span>
              </div>
            </div>
          </template>
        </div>

        <!-- Metric 3: Campaign Folders (Global) / Displaced Pins (Folder Scoped) -->
        <div class="p-4 sm:p-5 flex flex-col justify-between space-y-2">
          <div class="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span class="font-medium text-[11px] uppercase tracking-wider font-mono tabular-nums" x-text="activeFolderId ? 'Displaced Pins' : 'Campaign Folders'"></span>
            <span class="p-1 rounded-md" :class="activeFolderId ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'">
              <i :data-lucide="activeFolderId ? 'archive' : 'folder'" class="w-3.5 h-3.5"></i>
            </span>
          </div>
          <template x-if="isKeywordsLoading">
            <div class="space-y-1 py-0.5">
              <div class="h-7 w-20 bg-slate-200 dark:bg-slate-800 rounded animate-pulse"></div>
              <div class="h-3 w-28 bg-slate-100 dark:bg-slate-800/60 rounded animate-pulse"></div>
            </div>
          </template>
          <template x-if="!isKeywordsLoading">
            <div>
              <div class="flex items-baseline gap-2">
                <span class="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white font-mono tabular-nums tracking-tight" x-text="formatNumber(activeFolderId ? totalDisplacedPinsCount : folders.length)"></span>
                <span class="text-xs text-slate-400 font-mono tabular-nums" x-text="activeFolderId ? 'in vault' : 'organized'"></span>
              </div>
              <div class="mt-1.5 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                <template x-if="!activeFolderId">
                  <a href="/folders" class="text-amber-600 dark:text-amber-400 hover:underline font-medium inline-flex items-center gap-1">
                    <span>Manage folders</span>
                    <i data-lucide="arrow-right" class="w-3 h-3"></i>
                  </a>
                </template>
                <template x-if="activeFolderId">
                  <span class="text-indigo-600 dark:text-indigo-400 font-medium">Displaced organic pins</span>
                </template>
              </div>
            </div>
          </template>
        </div>

        <!-- Metric 4: Nightly Crawler Fleet Status (Global) / Average Velocity (Folder Scoped) -->
        <div class="p-4 sm:p-5 flex flex-col justify-between space-y-2">
          <div class="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span class="font-medium text-[11px] uppercase tracking-wider font-mono tabular-nums" x-text="activeFolderId ? 'Average Velocity' : 'Nightly Crawler Fleet'"></span>
            <span class="p-1 rounded-md" :class="activeFolderId ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400' : 'bg-purple-500/10 text-purple-600 dark:text-purple-400'">
              <i :data-lucide="activeFolderId ? 'zap' : 'clock'" class="w-3.5 h-3.5"></i>
            </span>
          </div>
          <div>
            <template x-if="!activeFolderId">
              <div>
                <div class="flex items-center gap-2">
                  <span class="px-2 py-0.5 rounded-md text-[10px] font-mono tabular-nums font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 inline-flex items-center gap-1.5">
                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span>OPERATIONAL</span>
                  </span>
                </div>
                <div class="mt-2 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 truncate" :title="nightlySyncCountdown">
                  <span x-text="nightlySyncCountdown"></span>
                </div>
              </div>
            </template>
            <template x-if="activeFolderId">
              <div>
                <div class="flex items-baseline gap-2">
                  <span class="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white font-mono tabular-nums tracking-tight" x-text="averageFleetVelocity"></span>
                  <span class="text-xs text-slate-400 font-mono tabular-nums">saves / day</span>
                </div>
                <div class="mt-1.5 text-[11px] font-mono tabular-nums text-purple-600 dark:text-purple-400 font-medium">
                  <span>Cluster save velocity</span>
                </div>
              </div>
            </template>
          </div>
        </div>

      </section>

      <!-- FILTER & SORT CONTROLS STRIP (LINEAR STYLE) -->
      <section class="p-3.5 rounded-2xl bg-white dark:bg-[#121215] border border-slate-200/80 dark:border-[#27272A]/80 shadow-xs space-y-2.5">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
          <!-- Left: Search and Dropdowns -->
          <div class="flex flex-wrap items-center gap-2 flex-1">
            <!-- Search input with clear button -->
            <div class="relative flex-1 min-w-[220px] max-w-sm">
              <i data-lucide="search" class="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"></i>
              <input type="text" x-model="dashboardSearch" placeholder="Search keywords, categories, or folders..."
                     class="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-[#27272A]/90 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition">
              <button x-show="dashboardSearch" @click="dashboardSearch = ''"
                      class="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white p-0.5 cursor-pointer">
                <i data-lucide="x" class="w-3 h-3"></i>
              </button>
            </div>

            <!-- Campaign Folders filter dropdown -->
            <select x-model="dashboardFolderFilter" class="px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-[#27272A]/90 text-xs font-medium text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 cursor-pointer">
              <option value="ALL">📁 All Folders</option>
              <option value="UNASSIGNED">Unassigned (No Folder)</option>
              <template x-for="f in folders" :key="f.id">
                <option :value="f.id" x-text="'📁 ' + f.name + ' (' + getFolderKeywordCount(f) + ')'"></option>
              </template>
            </select>

            <!-- Category filter dropdown -->
            <select x-model="dashboardCategoryFilter" class="px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-[#27272A]/90 text-xs font-medium text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 cursor-pointer">
              <option value="ALL">All Categories</option>
              <template x-for="cat in uniqueCategories" :key="cat">
                <option :value="cat" x-text="cat"></option>
              </template>
            </select>

            <!-- Status filter dropdown -->
            <select x-model="dashboardStatusFilter" class="px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-[#27272A]/90 text-xs font-medium text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 cursor-pointer">
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active Only</option>
              <option value="PAUSED">Paused Only</option>
            </select>

            <!-- Sort filter dropdown -->
            <select x-model="dashboardSort" class="px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-[#27272A]/90 text-xs font-medium text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 cursor-pointer">
              <option value="total_pins">Sort: Total Pins</option>
              <option value="created_desc">Sort: Date Added (Newest)</option>
              <option value="created_asc">Sort: Date Added (Oldest)</option>
              <option value="crawled">Sort: Recently Crawled</option>
              <option value="name">Sort: Alphabetical (A-Z)</option>
            </select>
          </div>

          <!-- Right: Counter, Columns Visibility & Table/Grid View Switcher -->
          <div class="flex items-center space-x-2 shrink-0">
            <span class="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 font-medium hidden md:inline"
                  x-text="filteredDashboardKeywords.length + ' of ' + (activeFolderId ? filteredDashboardKeywords.length : keywords.length) + ' Queries'"></span>

            <!-- Column Visibility Dropdown -->
            <div x-show="dashboardViewMode === 'table'" class="relative" x-data="{ isColumnsOpen: false }" @click.outside="isColumnsOpen = false" @keydown.escape.window="isColumnsOpen = false">
              <button type="button" @click="isColumnsOpen = !isColumnsOpen"
                      class="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-[#27272A] text-slate-700 dark:text-slate-300 text-xs font-medium transition flex items-center space-x-1.5 cursor-pointer shadow-2xs">
                <i data-lucide="columns-3" class="w-3.5 h-3.5 text-slate-400"></i>
                <span>Columns</span>
                <i data-lucide="chevron-down" class="w-3 h-3 text-slate-400 transition-transform" :class="isColumnsOpen ? 'rotate-180' : ''"></i>
              </button>

              <!-- Dropdown menu -->
              <div x-show="isColumnsOpen" x-cloak
                   x-transition:enter="transition ease-out duration-150"
                   x-transition:enter-start="opacity-0 scale-95"
                   x-transition:enter-end="opacity-100 scale-100"
                   x-transition:leave="transition ease-in duration-100"
                   x-transition:leave-start="opacity-100 scale-100"
                   x-transition:leave-end="opacity-0 scale-95"
                   class="absolute right-0 mt-2 w-56 rounded-xl bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] shadow-xl p-2 space-y-0.5 z-40 text-xs font-sans">
                <div class="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono tabular-nums border-b border-slate-100 dark:border-[#27272A]/80 flex items-center justify-between">
                  <span>Display Columns</span>
                  <button type="button" @click="resetColumns()" class="text-emerald-500 hover:underline capitalize text-[10px]">Reset</button>
                </div>
                
                <template x-for="col in columnDefinitions" :key="col.key">
                  <label class="flex items-center space-x-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer select-none transition"
                         :class="col.required ? 'opacity-60 cursor-not-allowed' : ''">
                    <input type="checkbox"
                           :checked="visibleColumns[col.key]"
                           :disabled="col.required"
                           @change="toggleColumn(col.key)"
                           class="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 dark:border-[#27272A] cursor-pointer">
                    <span class="text-xs text-slate-700 dark:text-slate-300 font-medium" x-text="col.label"></span>
                    <template x-if="col.required">
                      <span class="text-[9px] text-slate-400 font-mono tabular-nums ml-auto">(Required)</span>
                    </template>
                  </label>
                </template>
              </div>
            </div>

            <!-- View Switcher (Table vs Grid) -->
            <div class="flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-[#27272A]">
              <button @click="dashboardViewMode = 'table'"
                      :class="dashboardViewMode === 'table' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs font-semibold' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'"
                      class="px-2 py-1 rounded-md text-xs transition flex items-center space-x-1 cursor-pointer"
                      title="Table View">
                <i data-lucide="list" class="w-3.5 h-3.5"></i>
                <span class="hidden sm:inline">Table</span>
              </button>
              <button @click="dashboardViewMode = 'grid'"
                      :class="dashboardViewMode === 'grid' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs font-semibold' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'"
                      class="px-2 py-1 rounded-md text-xs transition flex items-center space-x-1 cursor-pointer"
                      title="Visual Cards View">
                <i data-lucide="layout-grid" class="w-3.5 h-3.5"></i>
                <span class="hidden sm:inline">Grid</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Category Quick Pills & Active Folder Pill -->
        <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-[#27272A]/80 text-xs">
          <div class="flex flex-wrap items-center gap-1.5">
            <span class="text-[10px] font-semibold text-slate-400 uppercase tracking-wider font-mono tabular-nums mr-1">Categories:</span>
            <button @click="dashboardCategoryFilter = 'ALL'"
                    class="px-2 py-0.5 rounded-md text-xs font-medium transition cursor-pointer"
                    :class="dashboardCategoryFilter === 'ALL' ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-2xs' : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'">
              All
            </button>
            <template x-for="cat in uniqueCategories" :key="cat">
              <button @click="dashboardCategoryFilter = cat"
                      class="px-2 py-0.5 rounded-md text-xs font-medium transition cursor-pointer"
                      :class="dashboardCategoryFilter === cat ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-2xs' : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'"
                      x-text="cat"></button>
            </template>
          </div>

          <!-- Active Folder Filter Indicator -->
          <template x-if="dashboardFolderFilter !== 'ALL'">
            <div class="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-md bg-pink-500/10 text-pink-700 dark:text-pink-300 text-xs font-semibold border border-pink-500/20 font-mono tabular-nums">
              <i data-lucide="folder" class="w-3 h-3 text-pink-500"></i>
              <span>Folder: <span x-text="activeFolderName"></span></span>
              <button @click="clearFolderFilter()" class="hover:text-pink-900 dark:hover:text-white p-0.5 cursor-pointer ml-1" title="Clear Folder Filter">
                <i data-lucide="x" class="w-2.5 h-2.5"></i>
              </button>
            </div>
          </template>
        </div>
      </section>

      <!-- [INVARIANT: HIGH-DENSITY-SERP-TABLE] Modern Minimalist SaaS table with Linear-grade tabular figures, dot status indicators, and clean nested vault pins breakdown -->
      <section id="keywords-dashboard-table" x-show="dashboardViewMode === 'table'" class="rounded-2xl bg-white dark:bg-[#121215] border border-slate-200/80 dark:border-[#27272A]/80 shadow-xs overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="table-sticky-header bg-slate-50/90 dark:bg-[#121215]/90 border-b border-slate-200/80 dark:border-[#27272A]/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                <th class="py-3 px-3.5 w-10 text-center">
                  <input type="checkbox" @click="toggleSelectAllDashboardKeywords()"
                         :checked="paginatedDashboardKeywords.length > 0 && paginatedDashboardKeywords.every(k => isDashboardKeywordSelected(k.id))"
                         class="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 dark:border-[#27272A] bg-white dark:bg-slate-900 cursor-pointer">
                </th>
                <th x-show="visibleColumns.preview" class="py-3 px-3 w-14">Preview</th>
                <th x-show="visibleColumns.keyword" class="py-3 px-4 min-w-[240px]">Keyword & Folders</th>
                <th x-show="visibleColumns.total_pins" class="py-3 px-3 w-36">SERP Breakdown</th>
                <th x-show="visibleColumns.status" class="py-3 px-3 w-24 text-center">Status</th>
                <th x-show="visibleColumns.created_at" class="py-3 px-3 w-32">Date Added</th>
                <th x-show="visibleColumns.last_crawled" class="py-3 px-3 w-32">Last Crawled</th>
                <th x-show="visibleColumns.actions" class="py-3 px-4 w-32 text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
              <!-- Skeleton Loading Rows -->
              <template x-if="isKeywordsLoading">
                <template x-for="i in [1, 2, 3, 4, 5]" :key="i">
                  <tr class="animate-pulse">
                    <td class="py-3.5 px-3.5 text-center"><div class="w-3.5 h-3.5 bg-slate-200 dark:bg-slate-800 rounded mx-auto"></div></td>
                    <td x-show="visibleColumns.preview" class="py-3.5 px-3"><div class="w-10 h-14 bg-slate-200 dark:bg-slate-800 rounded-lg"></div></td>
                    <td x-show="visibleColumns.keyword" class="py-3.5 px-4">
                      <div class="space-y-1.5">
                        <div class="h-3.5 w-36 bg-slate-200 dark:bg-slate-800 rounded"></div>
                        <div class="h-2.5 w-20 bg-slate-100 dark:bg-slate-800/60 rounded"></div>
                      </div>
                    </td>
                    <td x-show="visibleColumns.total_pins" class="py-3.5 px-3"><div class="h-4 w-24 bg-slate-200 dark:bg-slate-800 rounded"></div></td>
                    <td x-show="visibleColumns.status" class="py-3.5 px-3 text-center"><div class="h-5 w-14 bg-slate-200 dark:bg-slate-800 rounded-full mx-auto"></div></td>
                    <td x-show="visibleColumns.created_at" class="py-3.5 px-3"><div class="h-3 w-16 bg-slate-200 dark:bg-slate-800 rounded"></div></td>
                    <td x-show="visibleColumns.last_crawled" class="py-3.5 px-3"><div class="h-3 w-16 bg-slate-200 dark:bg-slate-800 rounded"></div></td>
                    <td x-show="visibleColumns.actions" class="py-3.5 px-4 text-right"><div class="h-6 w-20 bg-slate-200 dark:bg-slate-800 rounded-lg ml-auto"></div></td>
                  </tr>
                </template>
              </template>

              <!-- Real Data Rows -->
              <template x-if="!isKeywordsLoading">
                <template x-for="kw in paginatedDashboardKeywords" :key="kw.id">
                  <tr class="hover:bg-slate-50/80 dark:hover:bg-slate-800/35 transition-colors duration-150 group cursor-pointer"
                      :class="isDashboardKeywordSelected(kw.id) ? 'bg-emerald-50/40 dark:bg-emerald-950/20' : ''"
                      @click="switchToSerpStudio(kw)">
                    
                    <!-- Checkbox -->
                    <td class="py-3 px-3.5 text-center" @click.stop>
                      <input type="checkbox" :checked="isDashboardKeywordSelected(kw.id)" @click="toggleDashboardKeywordSelection(kw.id)"
                             class="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 dark:border-[#27272A] bg-white dark:bg-slate-900 cursor-pointer">
                    </td>

                    <!-- Thumbnail with Zoom -->
                    <td x-show="visibleColumns.preview" class="py-3 px-3">
                      <div class="w-10 h-14 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-900 border border-slate-200/80 dark:border-[#27272A] shadow-2xs relative">
                        <template x-if="kw.top_pin_image">
                          <img :src="kw.top_pin_image" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" onerror="window.handlePinImgError(this)">
                        </template>
                        <template x-if="!kw.top_pin_image">
                          <div class="w-full h-full flex items-center justify-center">
                            <i data-lucide="image" class="w-3.5 h-3.5 text-slate-400"></i>
                          </div>
                        </template>
                      </div>
                    </td>

                    <!-- Keyword & Category & Folder Tags -->
                    <td x-show="visibleColumns.keyword" class="py-3 px-4 min-w-[240px]">
                      <div class="space-y-1">
                        <span class="font-semibold text-slate-900 dark:text-slate-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 text-sm capitalize block transition-colors leading-snug"
                              x-text="kw.keyword"></span>
                        <div class="flex flex-wrap items-center gap-1.5">
                          <span class="px-1.5 py-0.5 rounded text-[10px] font-mono tabular-nums font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/60 dark:border-[#27272A]/60"
                                x-text="kw.category || 'General'"></span>
                          
                          <!-- Campaign Folders Tags -->
                          <template x-for="f in getKeywordFolders(kw)" :key="f.id">
                            <button type="button" @click.stop="filterByFolder(f.id)"
                                    class="px-1.5 py-0.5 rounded text-[10px] font-medium font-mono tabular-nums transition inline-flex items-center gap-1 border cursor-pointer hover:opacity-85 shadow-2xs"
                                    :style="'background-color: ' + (f.color || '#ec4899') + '12; color: ' + (f.color || '#ec4899') + '; border-color: ' + (f.color || '#ec4899') + '30;'"
                                    :title="'Filter by folder: ' + f.name">
                              <i data-lucide="folder" class="w-2.5 h-2.5 shrink-0"></i>
                              <span class="max-w-[110px] truncate" x-text="f.name"></span>
                            </button>
                          </template>

                          <!-- If no folders, quick add button -->
                          <template x-if="getKeywordFolders(kw).length === 0">
                            <button type="button" @click.stop="openQuickFolderModal(kw)"
                                    class="px-1.5 py-0.5 rounded text-[10px] font-mono tabular-nums text-slate-400 hover:text-pink-500 hover:bg-pink-500/10 transition border border-dashed border-slate-200 dark:border-[#27272A] inline-flex items-center gap-1 cursor-pointer"
                                    title="Add to Campaign Folder">
                              <i data-lucide="folder-plus" class="w-2.5 h-2.5"></i>
                              <span>Folder</span>
                            </button>
                          </template>

                          <template x-if="kw.annotation_id">
                            <span class="text-[10px] font-mono tabular-nums text-slate-400" x-text="'ID: ' + kw.annotation_id"></span>
                          </template>
                        </div>
                      </div>
                    </td>

                    <!-- SERP Topology & Total Pins (Two-Tone Topology Bar) -->
                    <td x-show="visibleColumns.total_pins" class="py-3 px-3 font-mono tabular-nums">
                      <div class="space-y-1.5 min-w-[120px]" :title="(kw.active_pins_count ?? getKeywordTotalPins(kw)) + ' Active SERP + ' + (kw.displaced_pins_count || 0) + ' Displaced Vault'">
                        <div class="flex items-center justify-between text-xs">
                          <div class="flex items-center gap-1 text-[11px]">
                            <span class="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums" x-text="(kw.active_pins_count || getKeywordTotalPins(kw)) + ' Act'"></span>
                            <span class="text-slate-300 dark:text-slate-700">·</span>
                            <span class="font-medium text-indigo-600 dark:text-indigo-400 tabular-nums" x-text="(kw.displaced_pins_count || 0) + ' Vault'"></span>
                          </div>
                          <span class="text-[10px] text-slate-400 font-mono tabular-nums" x-text="formatNumber(getKeywordTotalPins(kw))"></span>
                        </div>
                        <!-- Two-Tone Topology Progress Bar -->
                        <div class="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
                          <div class="bg-emerald-500 h-full transition-all duration-300"
                                :style="'width: ' + getActiveSerpPercentage(kw) + '%'"
                                :title="'Active SERP: ' + getActiveSerpPercentage(kw) + '%'"></div>
                          <div class="bg-indigo-500 h-full transition-all duration-300"
                                :style="'width: ' + (100 - getActiveSerpPercentage(kw)) + '%'"
                                :title="'Displaced Vault: ' + (100 - getActiveSerpPercentage(kw)) + '%'"></div>
                        </div>
                      </div>
                    </td>

                    <!-- Status Indicator (Linear Dot Badge) -->
                    <td x-show="visibleColumns.status" class="py-3 px-3 text-center" @click.stop>
                      <button @click="toggleKeywordStatus(kw)"
                              class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-mono tabular-nums font-medium transition cursor-pointer border shadow-2xs"
                              :class="kw.is_active !== false ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 hover:bg-amber-500/20'"
                              :title="kw.is_active !== false ? 'Click to Pause Tracking' : 'Click to Resume Tracking'">
                        <span class="w-1.5 h-1.5 rounded-full" :class="kw.is_active !== false ? 'bg-emerald-500' : 'bg-amber-500'"></span>
                        <span x-text="kw.is_active !== false ? 'Active' : 'Paused'"></span>
                      </button>
                    </td>

                    <!-- Date Added -->
                    <td x-show="visibleColumns.created_at" class="py-3 px-3">
                      <div class="space-y-0.5 font-mono tabular-nums text-xs">
                        <span class="font-medium text-slate-700 dark:text-slate-300 block" x-text="kw._relativeCreatedAt || formatRelativeTime(kw.created_at)"></span>
                        <span class="text-[10px] text-slate-400 dark:text-slate-500 block truncate" x-text="kw._formattedCreatedAt || formatDate(kw.created_at)"></span>
                      </div>
                    </td>

                    <!-- Last Crawled -->
                    <td x-show="visibleColumns.last_crawled" class="py-3 px-3">
                      <div class="space-y-0.5 font-mono tabular-nums text-xs">
                        <span class="font-medium text-slate-700 dark:text-slate-300 block" x-text="kw._relativeCrawledAt || formatRelativeTime(kw.last_crawled_at)"></span>
                        <span class="text-[10px] text-slate-400 dark:text-slate-500 block truncate" x-text="kw._formattedCrawledAt || formatDate(kw.last_crawled_at)"></span>
                      </div>
                    </td>

                    <!-- Actions -->
                    <td x-show="visibleColumns.actions" class="py-3 px-4 text-right" @click.stop>
                      <div class="flex items-center justify-end gap-1.5">
                        <button @click="switchToSerpStudio(kw)"
                                class="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition inline-flex items-center gap-1 shadow-2xs cursor-pointer group-hover:scale-102"
                                title="Open SERP Studio">
                          <span>Studio</span>
                          <i data-lucide="arrow-right" class="w-3 h-3"></i>
                        </button>
                        <button @click="rescanKeyword(kw.id, true)" :disabled="syncingKeywordId === kw.id"
                                class="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                                :title="'Re-Crawl ' + (kw.target_pin_count || 50) + ' pins'">
                          <i data-lucide="refresh-cw" class="w-3.5 h-3.5" :class="syncingKeywordId === kw.id ? 'animate-spin text-emerald-500' : ''"></i>
                        </button>
                        <button @click="deleteKeyword(kw.id)"
                                class="p-1 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition cursor-pointer"
                                title="Delete Keyword">
                          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                        </button>
                      </div>
                    </td>

                  </tr>
                </template>
              </template>

              <!-- Empty State Row -->
              <template x-if="!isKeywordsLoading && (!filteredDashboardKeywords || filteredDashboardKeywords.length === 0)">
                <tr>
                  <td :colspan="activeVisibleColumnCount" class="py-16 text-center">
                    <div class="max-w-md mx-auto space-y-3.5 p-4">
                      <div class="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 mx-auto flex items-center justify-center">
                        <i data-lucide="search" class="w-5 h-5"></i>
                      </div>
                      <h3 class="text-sm font-semibold text-slate-900 dark:text-white">No Tracked Keywords Found</h3>
                      <p class="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                        Monitor comprehensive SERP rankings, save velocity, and visual co-occurrence in real time. Track an evergreen query like <strong class="text-emerald-500 cursor-pointer hover:underline" @click="quickTrackKeyword('breakfast ideas')">"breakfast ideas"</strong> now.
                      </p>
                      <div class="flex items-center gap-2 max-w-sm mx-auto pt-1">
                        <input type="text" x-model="quickKeywordInput" @keydown.enter="submitQuickKeyword()"
                               placeholder="e.g. breakfast ideas, high protein meals..."
                               class="flex-1 px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-[#27272A] text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500/50">
                        <button @click="submitQuickKeyword()"
                                class="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition inline-flex items-center gap-1 shrink-0 cursor-pointer">
                          <i data-lucide="plus" class="w-3.5 h-3.5"></i>
                          <span>Track & Crawl</span>
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>

        <!-- DASHBOARD TABLE PAGINATION FOOTER -->
        <template x-if="!isKeywordsLoading && filteredDashboardKeywords && filteredDashboardKeywords.length > 0">
          <div class="px-4 py-3 border-t border-slate-200/80 dark:border-[#27272A]/80 bg-slate-50/50 dark:bg-slate-900/30 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            
            <!-- Left: Items range & Page Size selector -->
            <div class="flex flex-wrap items-center gap-3 text-slate-500 font-mono tabular-nums text-[11px]">
              <div>
                <span>Showing </span>
                <span class="font-bold text-slate-900 dark:text-white" x-text="dashboardRangeStart"></span>
                <span> - </span>
                <span class="font-bold text-slate-900 dark:text-white" x-text="dashboardRangeEnd"></span>
                <span> of </span>
                <span class="font-bold text-slate-900 dark:text-white" x-text="filteredDashboardKeywords.length"></span>
                <span> Queries</span>
              </div>

              <!-- Per Page Selector -->
              <div class="flex items-center space-x-1.5">
                <span class="text-slate-400 font-sans">Rows:</span>
                <select x-model="dashboardPageSize" class="px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-[11px] font-mono tabular-nums font-medium text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer">
                  <option :value="10">10 / page</option>
                  <option :value="25">25 / page</option>
                  <option :value="50">50 / page</option>
                  <option value="all">All</option>
                </select>
              </div>

              <template x-if="selectedKeywordIds.length > 0">
                <span class="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium border border-emerald-500/20 font-sans"
                      x-text="selectedKeywordIds.length + ' selected'"></span>
              </template>
            </div>

            <!-- Right: Pagination Buttons -->
            <template x-if="dashboardPageSize !== 'all' && dashboardTotalPages > 1">
              <div class="flex items-center space-x-1">
                <!-- First Page -->
                <button type="button" @click="setDashboardPage(1)" :disabled="dashboardPage <= 1"
                        class="p-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer text-slate-600 dark:text-slate-400"
                        title="First Page">
                  <i data-lucide="chevrons-left" class="w-3.5 h-3.5"></i>
                </button>

                <!-- Previous Page -->
                <button type="button" @click="setDashboardPage(dashboardPage - 1)" :disabled="dashboardPage <= 1"
                        class="p-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer text-slate-600 dark:text-slate-400"
                        title="Previous Page">
                  <i data-lucide="chevron-left" class="w-3.5 h-3.5"></i>
                </button>

                <!-- Numbered Page Pills -->
                <div class="flex items-center space-x-1 px-1">
                  <template x-for="(p, pIdx) in dashboardPageNumbers" :key="'p-' + pIdx + '-' + p">
                    <div>
                      <span x-show="p === '...'" class="px-1.5 py-0.5 text-slate-400 font-mono tabular-nums text-xs">...</span>
                      <button x-show="p !== '...'" type="button" @click="setDashboardPage(p)"
                              class="min-w-7 h-7 px-1.5 rounded-md text-xs font-mono tabular-nums font-medium transition cursor-pointer"
                              :class="dashboardPage === p ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-2xs' : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'"
                              x-text="p"></button>
                    </div>
                  </template>
                </div>

                <!-- Next Page -->
                <button type="button" @click="setDashboardPage(dashboardPage + 1)" :disabled="dashboardPage >= dashboardTotalPages"
                        class="p-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer text-slate-600 dark:text-slate-400"
                        title="Next Page">
                  <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>
                </button>

                <!-- Last Page -->
                <button type="button" @click="setDashboardPage(dashboardTotalPages)" :disabled="dashboardPage >= dashboardTotalPages"
                        class="p-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer text-slate-600 dark:text-slate-400"
                        title="Last Page">
                  <i data-lucide="chevrons-right" class="w-3.5 h-3.5"></i>
                </button>
              </div>
            </template>
          </div>
        </template>
      </section>

      <!-- VIEW MODE 2: PINTEREST-STYLE VISUAL CARDS GRID (LINEAR / VERCEL STYLE) -->
      <section id="keywords-dashboard-grid" x-show="dashboardViewMode === 'grid'" class="space-y-4">
        <!-- Grid Skeleton Loader -->
        <template x-if="isKeywordsLoading">
          <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            <template x-for="i in [1, 2, 3, 4]" :key="i">
              <div class="rounded-2xl bg-white dark:bg-[#121215] border border-slate-200/80 dark:border-[#27272A]/80 p-3.5 space-y-3 animate-pulse">
                <div class="w-full h-44 bg-slate-200 dark:bg-slate-800 rounded-xl"></div>
                <div class="h-4 w-32 bg-slate-200 dark:bg-slate-800 rounded"></div>
                <div class="h-3 w-20 bg-slate-100 dark:bg-slate-800/60 rounded"></div>
              </div>
            </template>
          </div>
        </template>

        <!-- Grid Cards -->
        <template x-if="!isKeywordsLoading">
          <div class="space-y-4">
            <!-- Grid Empty State -->
            <template x-if="!filteredDashboardKeywords || filteredDashboardKeywords.length === 0">
              <div class="p-12 text-center rounded-2xl bg-white dark:bg-[#121215] border border-slate-200/80 dark:border-[#27272A]/80 shadow-xs">
                <div class="max-w-md mx-auto space-y-3">
                  <div class="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 mx-auto flex items-center justify-center">
                    <i data-lucide="search" class="w-5 h-5"></i>
                  </div>
                  <h3 class="text-sm font-semibold text-slate-900 dark:text-white">No Tracked Keywords Found</h3>
                  <p class="text-xs text-slate-500 dark:text-slate-400">Try adjusting your category, folder, or search filters.</p>
                </div>
              </div>
            </template>

            <div x-show="filteredDashboardKeywords && filteredDashboardKeywords.length > 0"
                 class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
              <template x-for="kw in paginatedDashboardKeywords" :key="kw.id">
                <div class="rounded-2xl bg-white dark:bg-[#121215] border border-slate-200/80 dark:border-[#27272A]/80 p-3.5 shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition duration-150 group flex flex-col justify-between cursor-pointer space-y-3"
                     @click="switchToSerpStudio(kw)">
                  
                  <!-- Card Header: Image Banner with Floating Badges -->
                  <div class="w-full h-44 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-900 border border-slate-200/70 dark:border-[#27272A] relative">
                    <template x-if="kw.top_pin_image">
                      <img :src="kw.top_pin_image" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" onerror="window.handlePinImgError(this)">
                    </template>
                    <template x-if="!kw.top_pin_image">
                      <div class="w-full h-full flex items-center justify-center">
                        <i data-lucide="image" class="w-6 h-6 text-slate-400"></i>
                      </div>
                    </template>

                    <!-- Top Badges Overlay -->
                    <div class="absolute top-2 left-2 right-2 flex items-center justify-between">
                      <span class="px-2 py-0.5 rounded-full text-[10px] font-mono tabular-nums font-medium backdrop-blur-md"
                            :class="kw.is_active !== false ? 'bg-slate-950/80 text-emerald-400 border border-emerald-500/30' : 'bg-slate-950/80 text-amber-400 border border-amber-500/30'"
                            x-text="kw.is_active !== false ? '● Active' : '● Paused'"></span>

                      <span class="px-2 py-0.5 rounded-full text-[10px] font-mono tabular-nums font-medium bg-slate-950/80 text-slate-200 backdrop-blur-md border border-slate-700/60 inline-flex items-center space-x-1"
                            :title="(kw.active_pins_count ?? getKeywordTotalPins(kw)) + ' Active + ' + (kw.displaced_pins_count || 0) + ' Vault'">
                        <i data-lucide="pin" class="w-3 h-3 text-emerald-400"></i>
                        <span x-text="getKeywordTotalPins(kw) + ' Pins'"></span>
                        <template x-if="Number(kw.displaced_pins_count || 0) > 0">
                          <span class="text-[9px] text-indigo-300 font-semibold ml-0.5" x-text="'(' + (kw.active_pins_count || 0) + ' Active + ' + kw.displaced_pins_count + ' Vault)'"></span>
                        </template>
                      </span>
                    </div>
                  </div>

                  <!-- Card Body -->
                  <div class="space-y-2 flex-1">
                    <div class="flex items-start justify-between gap-2">
                      <h3 class="font-semibold text-slate-900 dark:text-white text-sm capitalize group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition truncate"
                          x-text="kw.keyword"></h3>
                    </div>

                    <div class="flex flex-wrap items-center gap-1">
                      <span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono tabular-nums font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/60 dark:border-[#27272A]/60"
                            x-text="kw.category || 'General'"></span>
                      
                      <!-- Folder Tags -->
                      <template x-for="f in getKeywordFolders(kw)" :key="f.id">
                        <button type="button" @click.stop="filterByFolder(f.id)"
                                class="px-1.5 py-0.5 rounded text-[10px] font-medium font-mono tabular-nums transition inline-flex items-center space-x-1 border cursor-pointer hover:opacity-85 shadow-2xs"
                                :style="'background-color: ' + (f.color || '#ec4899') + '12; color: ' + (f.color || '#ec4899') + '; border-color: ' + (f.color || '#ec4899') + '30;'"
                                :title="'Click to filter keywords in: ' + f.name">
                          <i data-lucide="folder" class="w-2.5 h-2.5 shrink-0"></i>
                          <span class="max-w-[110px] truncate" x-text="f.name"></span>
                        </button>
                      </template>
                    </div>

                    <!-- Total Pins & Topology Progress Bar -->
                    <div class="space-y-1 pt-1.5 font-mono tabular-nums text-xs">
                      <div class="flex items-center justify-between text-[11px]">
                        <span class="text-slate-400 font-sans">SERP Topology:</span>
                        <div>
                          <span class="text-emerald-600 dark:text-emerald-400 font-bold" x-text="(kw.active_pins_count || getKeywordTotalPins(kw)) + ' Act'"></span>
                          <span class="text-slate-300 dark:text-slate-700">·</span>
                          <span class="text-indigo-600 dark:text-indigo-400 font-medium" x-text="(kw.displaced_pins_count || 0) + ' Vault'"></span>
                        </div>
                      </div>
                      <div class="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
                        <div class="bg-emerald-500 h-full transition-all duration-300"
                             :style="'width: ' + getActiveSerpPercentage(kw) + '%'"></div>
                        <div class="bg-indigo-500 h-full transition-all duration-300"
                             :style="'width: ' + (100 - getActiveSerpPercentage(kw)) + '%'"></div>
                      </div>
                    </div>
                  </div>

                  <!-- Card Footer Actions -->
                  <div class="pt-2 border-t border-slate-100 dark:border-[#27272A] flex items-center justify-between text-xs">
                    <div class="space-y-0.5 text-[10px] font-mono tabular-nums">
                      <span class="block text-slate-500 dark:text-slate-400 truncate" x-text="'Added: ' + (kw._formattedCreatedAt || formatDate(kw.created_at))"></span>
                      <span class="block text-slate-400 truncate" x-text="'Crawled: ' + (kw._relativeCrawledAt || formatRelativeTime(kw.last_crawled_at))"></span>
                    </div>
                    <div class="flex items-center space-x-1.5 shrink-0">
                      <button @click.stop="switchToSerpStudio(kw)"
                              class="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition flex items-center space-x-1 text-xs">
                        <span>Studio</span>
                        <i data-lucide="arrow-right" class="w-3 h-3"></i>
                      </button>
                      <button @click.stop="deleteKeyword(kw.id)"
                              class="p-1 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-slate-800 transition">
                        <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                      </button>
                    </div>
                  </div>

                </div>
              </template>
            </div>

            <!-- DASHBOARD GRID PAGINATION FOOTER -->
            <template x-if="filteredDashboardKeywords && filteredDashboardKeywords.length > 0">
              <div class="px-4 py-3 rounded-2xl border border-slate-200/80 dark:border-[#27272A]/80 bg-white dark:bg-[#121215] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs shadow-xs">
                
                <!-- Left: Items range & Page Size selector -->
                <div class="flex flex-wrap items-center gap-3 text-slate-500 font-mono tabular-nums text-[11px]">
                  <div>
                    <span>Showing </span>
                    <span class="font-bold text-slate-900 dark:text-white" x-text="dashboardRangeStart"></span>
                    <span> - </span>
                    <span class="font-bold text-slate-900 dark:text-white" x-text="dashboardRangeEnd"></span>
                    <span> of </span>
                    <span class="font-bold text-slate-900 dark:text-white" x-text="filteredDashboardKeywords.length"></span>
                    <span> Queries</span>
                  </div>

                  <!-- Per Page Selector -->
                  <div class="flex items-center space-x-1.5">
                    <span class="text-slate-400 font-sans">Rows:</span>
                    <select x-model="dashboardPageSize" class="px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-[11px] font-mono tabular-nums font-medium text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer">
                      <option :value="10">10 / page</option>
                      <option :value="25">25 / page</option>
                      <option :value="50">50 / page</option>
                      <option value="all">All</option>
                    </select>
                  </div>
                </div>

                <!-- Right: Pagination Buttons -->
                <template x-if="dashboardPageSize !== 'all' && dashboardTotalPages > 1">
                  <div class="flex items-center space-x-1">
                    <!-- First Page -->
                    <button type="button" @click="setDashboardPage(1)" :disabled="dashboardPage <= 1"
                            class="p-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer text-slate-600 dark:text-slate-400"
                            title="First Page">
                      <i data-lucide="chevrons-left" class="w-3.5 h-3.5"></i>
                    </button>

                    <!-- Previous Page -->
                    <button type="button" @click="setDashboardPage(dashboardPage - 1)" :disabled="dashboardPage <= 1"
                            class="p-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer text-slate-600 dark:text-slate-400"
                            title="Previous Page">
                      <i data-lucide="chevron-left" class="w-3.5 h-3.5"></i>
                    </button>

                    <!-- Numbered Page Pills -->
                    <div class="flex items-center space-x-1 px-1">
                      <template x-for="(p, pIdx) in dashboardPageNumbers" :key="'gp-' + pIdx + '-' + p">
                        <div>
                          <span x-show="p === '...'" class="px-1.5 py-0.5 text-slate-400 font-mono tabular-nums text-xs">...</span>
                          <button x-show="p !== '...'" type="button" @click="setDashboardPage(p)"
                                  class="min-w-7 h-7 px-1.5 rounded-md text-xs font-mono tabular-nums font-medium transition cursor-pointer"
                                  :class="dashboardPage === p ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-2xs' : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'"
                                  x-text="p"></button>
                        </div>
                      </template>
                    </div>

                    <!-- Next Page -->
                    <button type="button" @click="setDashboardPage(dashboardPage + 1)" :disabled="dashboardPage >= dashboardTotalPages"
                            class="p-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer text-slate-600 dark:text-slate-400"
                            title="Next Page">
                      <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>
                    </button>

                    <!-- Last Page -->
                    <button type="button" @click="setDashboardPage(dashboardTotalPages)" :disabled="dashboardPage >= dashboardTotalPages"
                            class="p-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer text-slate-600 dark:text-slate-400"
                            title="Last Page">
                      <i data-lucide="chevrons-right" class="w-3.5 h-3.5"></i>
                    </button>
                  </div>
                </template>
              </div>
            </template>
          </div>
        </template>
      </section>

      <!-- Quick Track Keyword Modal -->
      <div x-show="isQuickTrackModalOpen" x-cloak class="relative z-50">
        <div class="fixed inset-0 bg-slate-950/70 backdrop-blur-xs" @click="isQuickTrackModalOpen = false"></div>
        <div class="fixed inset-0 flex items-center justify-center p-4">
          <div class="w-full max-w-md bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-3xl p-6 shadow-2xl space-y-4">
            <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-[#27272A]">
              <div class="flex items-center space-x-2.5">
                <div class="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                  <i data-lucide="plus-circle" class="w-4 h-4"></i>
                </div>
                <h3 class="text-sm font-black text-slate-900 dark:text-white">Track New Keyword</h3>
              </div>
              <button @click="isQuickTrackModalOpen = false" class="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400">
                <i data-lucide="x" class="w-4 h-4"></i>
              </button>
            </div>
            <div class="space-y-3">
              <div>
                <label class="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase font-mono tabular-nums block mb-1">Search Query / Keyword</label>
                <input type="text" x-model="quickKeywordInput" @keydown.enter="submitQuickKeyword()"
                       placeholder="e.g. breakfast ideas, avocado toast..."
                       class="w-full px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40">
              </div>
              <div>
                <label class="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase font-mono tabular-nums block mb-1">Category (Optional)</label>
                <input type="text" x-model="quickKeywordCategory"
                       placeholder="e.g. Food & Recipes, General..."
                       class="w-full px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40">
              </div>
            </div>
            <div class="flex items-center justify-end space-x-2 pt-2">
              <button @click="isQuickTrackModalOpen = false" class="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                Cancel
              </button>
              <button @click="submitQuickKeyword()" class="px-5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center space-x-1.5 shadow-md shadow-emerald-950/20 cursor-pointer">
                <i data-lucide="sparkles" class="w-3.5 h-3.5"></i>
                <span x-text="'Track & Index ' + (appSettings.default_max_pins || 250) + ' Pins'">Track & Index 250 Pins</span>
              </button>
            </div>
          </div>
        </div>
      </div>

    </div>
`;
}
