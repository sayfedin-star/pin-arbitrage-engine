/**
 * Unified Related Pins Hub (Seeds view, candidates table, 24 hubs intersections, master explorer)
 */
import { renderPinRowTemplate } from '../pin-row.mjs';

export function getDashboardRelatedPinsHtml() {
  return `    <!-- ======================================================== -->
    <!-- UNIFIED TAB: 🌿 RELATED PINS HUB (SEEDS, INTERSECTIONS, EXPLORER) -->
    <!-- Combines Tracked Seeds, Global Intersections & Master Explorer -->
    <!-- ======================================================== -->
    <div x-show="currentTab === 'related_pins' || currentTab === 'seeds' || currentTab === 'intersections' || currentTab === 'explorer'" x-cloak class="space-y-6">
      
      <!-- Unified Related Pins Header -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div class="flex items-center space-x-3">
          <div class="h-11 w-11 rounded-2xl bg-gradient-to-tr from-rose-600 via-amber-500 to-sky-600 text-white flex items-center justify-center shadow-md shadow-rose-950/20">
            <i data-lucide="git-fork" class="w-6 h-6"></i>
          </div>
          <div>
            <div class="flex items-center space-x-2">
              <h1 class="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">Related Pins Intelligence</h1>
              <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">HUB</span>
            </div>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Unified discovery: Tracked seed nodes, multi-pin global intersections, and candidate graph explorer in one single place.</p>
          </div>
        </div>

        <div class="flex items-center space-x-2 flex-wrap gap-y-2">
          <button @click="openAddSeedModal()" class="px-3.5 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-sm transition active:scale-95 flex items-center space-x-1.5">
            <i data-lucide="plus-circle" class="w-4 h-4"></i>
            <span>Add Seeds</span>
          </button>
          <button @click="openCrawlModal()" class="px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-sm transition active:scale-95 flex items-center space-x-1.5">
            <i data-lucide="zap" class="w-4 h-4"></i>
            <span>Crawl</span>
          </button>
          <button @click="exportCandidatesCSV()" class="px-3 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-[#27272A] bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition flex items-center space-x-1.5 shadow-sm">
            <i data-lucide="download" class="w-3.5 h-3.5"></i>
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      <!-- 5-KPI Ribbon -->
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <!-- KPI 1: Tracked Seeds -->
        <div @click="relatedSubTab = 'seeds'" class="p-3.5 rounded-2xl bg-white dark:bg-[#18181B] border cursor-pointer transition hover:border-rose-500/50 shadow-sm" :class="relatedSubTab === 'seeds' ? 'border-rose-500/80 ring-2 ring-rose-500/20' : 'border-slate-200/90 dark:border-[#27272A]'">
          <div class="flex items-center justify-between">
            <span class="text-[10px] font-mono tabular-nums uppercase text-slate-500 dark:text-slate-400 font-bold">Tracked Seeds</span>
            <i data-lucide="folder-git-2" class="w-4 h-4 text-rose-500"></i>
          </div>
          <div class="mt-1 text-xl font-mono tabular-nums font-extrabold text-slate-900 dark:text-white" x-text="seeds.length"></div>
          <div class="text-[10px] text-slate-400 font-medium mt-0.5 truncate" x-text="seeds.filter(s => s.last_crawled_at).length + ' crawled'"></div>
        </div>

        <!-- KPI 2: Global Intersections -->
        <div @click="relatedSubTab = 'intersections'" class="p-3.5 rounded-2xl bg-white dark:bg-[#18181B] border cursor-pointer transition hover:border-amber-500/50 shadow-sm" :class="relatedSubTab === 'intersections' ? 'border-amber-500/80 ring-2 ring-amber-500/20' : 'border-slate-200/90 dark:border-[#27272A]'">
          <div class="flex items-center justify-between">
            <span class="text-[10px] font-mono tabular-nums uppercase text-slate-500 dark:text-slate-400 font-bold">Intersections</span>
            <i data-lucide="flame" class="w-4 h-4 text-amber-500"></i>
          </div>
          <div class="mt-1 text-xl font-mono tabular-nums font-extrabold text-amber-600 dark:text-amber-400" x-text="intersections.length"></div>
          <div class="text-[10px] text-slate-400 font-medium mt-0.5 truncate">≥ 2 seeds overlap</div>
        </div>

        <!-- KPI 3: Graph Candidates -->
        <div @click="relatedSubTab = 'explorer'" class="p-3.5 rounded-2xl bg-white dark:bg-[#18181B] border cursor-pointer transition hover:border-sky-500/50 shadow-sm" :class="relatedSubTab === 'explorer' ? 'border-sky-500/80 ring-2 ring-sky-500/20' : 'border-slate-200/90 dark:border-[#27272A]'">
          <div class="flex items-center justify-between">
            <span class="text-[10px] font-mono tabular-nums uppercase text-slate-500 dark:text-slate-400 font-bold">Candidates</span>
            <i data-lucide="database" class="w-4 h-4 text-sky-500"></i>
          </div>
          <div class="mt-1 text-xl font-mono tabular-nums font-extrabold text-sky-600 dark:text-sky-400" x-text="formatNumber(overview.total_candidates)"></div>
          <div class="text-[10px] text-slate-400 font-medium mt-0.5 truncate">Discovered graph</div>
        </div>

        <!-- KPI 4: High Velocity -->
        <div class="p-3.5 rounded-2xl bg-white dark:bg-[#18181B] border border-slate-200/90 dark:border-[#27272A] shadow-sm">
          <div class="flex items-center justify-between">
            <span class="text-[10px] font-mono tabular-nums uppercase text-slate-500 dark:text-slate-400 font-bold">High Velocity</span>
            <i data-lucide="zap" class="w-4 h-4 text-emerald-500"></i>
          </div>
          <div class="mt-1 text-xl font-mono tabular-nums font-extrabold text-emerald-600 dark:text-emerald-400" x-text="formatNumber(overview.high_velocity_candidates)"></div>
          <div class="text-[10px] text-slate-400 font-medium mt-0.5 truncate">Surging growth</div>
        </div>

        <!-- KPI 5: Commercial Gap -->
        <div class="p-3.5 rounded-2xl bg-white dark:bg-[#18181B] border border-slate-200/90 dark:border-[#27272A] shadow-sm col-span-2 sm:col-span-1">
          <div class="flex items-center justify-between">
            <span class="text-[10px] font-mono tabular-nums uppercase text-slate-500 dark:text-slate-400 font-bold">Commercial Gap</span>
            <i data-lucide="trending-up" class="w-4 h-4 text-purple-500"></i>
          </div>
          <div class="mt-1 text-xl font-mono tabular-nums font-extrabold text-purple-600 dark:text-purple-400" x-text="(overview.avg_commercial_gap || 0) + '%'"></div>
          <div class="text-[10px] text-slate-400 font-medium mt-0.5 truncate">Arbitrage spread</div>
        </div>
      </div>

      <!-- Unified Sub-Tabs Navigation Bar -->
      <div class="flex items-center space-x-2 border-b border-slate-200 dark:border-[#27272A] pb-2">
        <button @click="relatedSubTab = 'seeds'" class="flex items-center space-x-2 px-3.5 py-2 text-xs font-bold rounded-xl transition" :class="relatedSubTab === 'seeds' ? 'bg-rose-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900'">
          <i data-lucide="folder-git-2" class="w-3.5 h-3.5"></i>
          <span>Tracked Seeds</span>
          <span class="px-1.5 py-0.5 rounded text-[10px] font-mono tabular-nums" :class="relatedSubTab === 'seeds' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-800'" x-text="seeds.length"></span>
        </button>

        <button @click="relatedSubTab = 'intersections'" class="flex items-center space-x-2 px-3.5 py-2 text-xs font-bold rounded-xl transition" :class="relatedSubTab === 'intersections' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900'">
          <i data-lucide="flame" class="w-3.5 h-3.5"></i>
          <span>Global Intersections</span>
          <span class="px-1.5 py-0.5 rounded text-[10px] font-mono tabular-nums" :class="relatedSubTab === 'intersections' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-800'" x-text="intersections.length"></span>
        </button>

        <button @click="relatedSubTab = 'explorer'" class="flex items-center space-x-2 px-3.5 py-2 text-xs font-bold rounded-xl transition" :class="relatedSubTab === 'explorer' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900'">
          <i data-lucide="database" class="w-3.5 h-3.5"></i>
          <span>Master Explorer</span>
          <span class="px-1.5 py-0.5 rounded text-[10px] font-mono tabular-nums" :class="relatedSubTab === 'explorer' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-800'" x-text="formatNumber(overview.total_candidates)"></span>
        </button>
      </div>

      <!-- Sub-Tab 1: 📁 TRACKED SEEDS (GRID & DEDICATED SEED DOSSIER) -->
      <div x-show="relatedSubTab === 'seeds'" class="space-y-6">

      <!-- View A: Modern Grid & Table of Tracked Seeds -->
      <template x-if="!activeDossierSeed">
        <div class="space-y-4">
          <!-- Top Overview & Stats Bar -->
          <div class="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white dark:bg-[#18181B] p-4 rounded-2xl border border-slate-200/90 dark:border-[#27272A] shadow-sm">
            <div>
              <h2 class="text-base font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                <i data-lucide="layers" class="w-4 h-4 text-rose-500"></i>
                <span>Tracked Seeds in Neon Postgres Database</span>
              </h2>
              <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Manage cluster seed nodes, execute multi-seed crawls via GitHub Actions, and inspect isolated telemetry quotas.</p>
            </div>
            <div class="flex items-center space-x-2 flex-wrap text-xs font-mono tabular-nums">
              <span class="px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-[#27272A] text-slate-700 dark:text-slate-300">
                Total Seeds: <strong class="text-rose-600 dark:text-rose-400" x-text="seeds.length">0</strong>
              </span>
              <span class="px-2.5 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400">
                Crawled: <strong x-text="seeds.filter(s => s.last_crawled_at).length">0</strong>
              </span>
              <span class="px-2.5 py-1 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400">
                Queued: <strong x-text="seeds.filter(s => !s.last_crawled_at).length">0</strong>
              </span>
            </div>
          </div>

          <!-- Seeds Control & Filter Toolbar -->
          <div class="bg-white dark:bg-[#18181B] p-3.5 rounded-2xl border border-slate-200/90 dark:border-[#27272A] shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            
            <!-- Left: Search & Filter Inputs -->
            <div class="flex items-center space-x-2 flex-1 flex-wrap gap-y-2">
              <!-- Search Input -->
              <div class="relative flex-1 min-w-[200px] max-w-md">
                <i data-lucide="search" class="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"></i>
                <input type="text" x-model="seedSearch" placeholder="Filter by Pin ID or Label..." class="w-full pl-9 pr-7 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-white focus:outline-none focus:border-rose-500 font-mono tabular-nums">
                <button x-show="seedSearch" @click="seedSearch = ''" class="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <i data-lucide="x" class="w-3 h-3"></i>
                </button>
              </div>

              <!-- Status Filter -->
              <select x-model="seedFilterStatus" class="px-2.5 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-slate-700 dark:text-slate-300 font-medium focus:outline-none focus:border-rose-500">
                <option value="all">Status: All</option>
                <option value="crawled">Crawled</option>
                <option value="pending">Pending Crawl</option>
              </select>

              <!-- Type Filter -->
              <select x-model="seedFilterType" class="px-2.5 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-slate-700 dark:text-slate-300 font-medium focus:outline-none focus:border-rose-500">
                <option value="all">Type: All</option>
                <option value="competitor">Competitor Clusters</option>
                <option value="internal">Internal Seeds</option>
              </select>

              <!-- Sort Dropdown -->
              <select x-model="seedSort" class="px-2.5 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-slate-700 dark:text-slate-300 font-medium focus:outline-none focus:border-rose-500 font-mono tabular-nums">
                <option value="crawled_desc">Sort: Newest Crawled</option>
                <option value="candidates_desc">Sort: Harvested Nodes (High-Low)</option>
                <option value="candidates_asc">Sort: Harvested Nodes (Low-High)</option>
                <option value="gap_desc">Sort: Commercial Gap</option>
                <option value="id_desc">Sort: Pin ID</option>
              </select>
            </div>

            <!-- Right: View Toggle, Select All & Quick Add -->
            <div class="flex items-center space-x-2 justify-end">
              <!-- Select All Toggle -->
              <button @click="toggleSelectAllSeeds()" class="px-3 py-1.5 text-xs font-semibold rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition active:scale-95 flex items-center space-x-1.5">
                <i :data-lucide="isAllSeedsSelected ? 'check-square' : 'square'" class="w-3.5 h-3.5" :class="isAllSeedsSelected ? 'text-rose-600' : 'text-slate-400'"></i>
                <span x-text="isAllSeedsSelected ? 'Deselect All' : 'Select All'"></span>
              </button>

              <!-- View Switcher (Grid vs Table) -->
              <div class="flex items-center bg-slate-100 dark:bg-slate-900 p-0.5 rounded-xl border border-slate-200 dark:border-[#27272A]">
                <button @click="seedViewMode = 'grid'" :class="seedViewMode === 'grid' ? 'bg-white dark:bg-slate-800 text-rose-600 dark:text-rose-400 shadow-sm font-bold' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'" class="p-1.5 px-2.5 rounded-lg text-xs flex items-center space-x-1 transition" title="Grid Cards View">
                  <i data-lucide="layout-grid" class="w-3.5 h-3.5"></i>
                  <span class="hidden sm:inline">Cards</span>
                </button>
                <button @click="seedViewMode = 'table'" :class="seedViewMode === 'table' ? 'bg-white dark:bg-slate-800 text-rose-600 dark:text-rose-400 shadow-sm font-bold' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'" class="p-1.5 px-2.5 rounded-lg text-xs flex items-center space-x-1 transition" title="Compact Table View">
                  <i data-lucide="table" class="w-3.5 h-3.5"></i>
                  <span class="hidden sm:inline">Table</span>
                </button>
              </div>

              <!-- Quick Bulk Add Button -->
              <button @click="openAddSeedModal('bulk')" class="px-3 py-1.5 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-500 text-white transition active:scale-95 flex items-center space-x-1.5 shadow-sm shadow-rose-900/20">
                <i data-lucide="file-plus-2" class="w-3.5 h-3.5"></i>
                <span class="hidden sm:inline">Bulk Pins</span>
                <span class="sm:hidden">Bulk</span>
              </button>
            </div>
          </div>

          <!-- Sticky Floating Bulk Actions Bar (Appears when >= 1 seed is selected) -->
          <div x-show="selectedSeedIds.length > 0" x-cloak class="sticky top-20 z-30 bg-slate-900 text-white dark:bg-[#18181B] dark:text-slate-100 p-3 px-4 rounded-2xl shadow-xl border border-rose-500/30 flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2">
            <div class="flex items-center space-x-3">
              <span class="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping"></span>
              <span class="text-xs font-mono tabular-nums font-bold">
                <span class="text-rose-400 text-sm font-extrabold" x-text="selectedSeedIds.length"></span> seeds selected
              </span>
            </div>

            <div class="flex items-center space-x-2">
              <!-- Crawl Selected -->
              <button @click="openCrawlModal('selected')" class="px-3 py-1.5 rounded-xl bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white text-xs font-bold transition flex items-center space-x-1.5 shadow-sm active:scale-95">
                <i data-lucide="zap" class="w-3.5 h-3.5"></i>
                <span>⚡ Crawl Selected (<span x-text="selectedSeedIds.length"></span>)</span>
              </button>

              <!-- Delete Selected from Database -->
              <button @click="openDeleteModal('selected')" class="px-3 py-1.5 rounded-xl bg-rose-700 hover:bg-rose-600 text-white text-xs font-bold transition flex items-center space-x-1.5 shadow-sm active:scale-95">
                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                <span>🗑️ Delete & Purge DB</span>
              </button>

              <!-- Export Selected -->
              <button @click="exportSelectedSeeds()" class="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition flex items-center space-x-1.5 active:scale-95">
                <i data-lucide="download" class="w-3.5 h-3.5"></i>
                <span class="hidden sm:inline">Export</span>
              </button>

              <!-- Clear Selection -->
              <button @click="selectedSeedIds = []" class="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition" title="Clear selection">
                <i data-lucide="x" class="w-4 h-4"></i>
              </button>
            </div>
          </div>

          <!-- 1. Grid of Seed Cards (When seedViewMode === 'grid') -->
          <div x-show="seedViewMode === 'grid'" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            <template x-for="seed in filteredSeeds" :key="seed.pin_id">
              <div class="bg-white dark:bg-[#18181B] border rounded-2xl p-5 shadow-sm dark:shadow-xl transition space-y-4 flex flex-col justify-between relative group"
                   :class="selectedSeedIds.includes(seed.pin_id) ? 'border-rose-500 ring-2 ring-rose-500/20 bg-rose-50/20 dark:bg-rose-950/20' : 'border-slate-200/90 dark:border-[#27272A] hover:border-slate-400 dark:hover:border-slate-700'">
                
                <div class="space-y-3">
                  <!-- Top Row: Checkbox, Badge & Crawl Timestamp -->
                  <div class="flex items-start justify-between gap-2">
                    <div class="flex items-center space-x-2">
                      <input type="checkbox"
                             :checked="selectedSeedIds.includes(seed.pin_id)"
                             @change="toggleSeedSelection(seed.pin_id)"
                             class="w-4 h-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer">
                      <span class="px-2 py-0.5 rounded text-[10px] font-mono tabular-nums font-bold uppercase tracking-wider"
                            :class="seed.is_competitor ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20'"
                            x-text="seed.is_competitor ? 'Competitor Cluster' : 'Internal Seed'"></span>
                    </div>

                    <div class="flex items-center space-x-1.5 text-[10px] font-mono tabular-nums text-slate-400">
                      <span x-show="(seed?.total_capsules || 0) > 0" class="px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-500/20" x-text="seed.total_capsules + ' Caps'"></span>
                      <span x-text="seed.last_crawled_at ? new Date(seed.last_crawled_at).toLocaleDateString() : 'Pending'"></span>
                    </div>
                  </div>

                  <!-- Label & Pin ID with Pinterest Link -->
                  <div>
                    <h3 class="font-bold text-sm text-slate-900 dark:text-white line-clamp-2" x-text="seed.label || 'Tracked Cluster Seed'"></h3>
                    <div class="flex items-center space-x-1.5 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-1">
                      <span>Pin ID:</span>
                      <a :href="'https://www.pinterest.com/pin/' + seed.pin_id + '/'" target="_blank" class="font-bold text-rose-600 dark:text-rose-400 hover:underline inline-flex items-center space-x-0.5">
                        <span x-text="seed.pin_id"></span>
                        <i data-lucide="external-link" class="w-3 h-3"></i>
                      </a>
                    </div>
                  </div>

                  <!-- Quick Stats Grid -->
                  <div class="grid grid-cols-2 gap-2 text-xs font-mono tabular-nums pt-1">
                    <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-[#27272A]">
                      <div class="text-[10px] text-slate-500">Harvested Nodes</div>
                      <div class="text-xl font-extrabold text-slate-900 dark:text-white mt-0.5" x-text="seed.total_candidates || 0">0</div>
                    </div>
                    <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-[#27272A]">
                      <div class="text-[10px] text-slate-500">Commercial Gap</div>
                      <div class="text-xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5" x-text="(seed.commercial_gap_ratio ? seed.commercial_gap_ratio + '%' : '100%')">100%</div>
                    </div>
                  </div>
                </div>

                <!-- Primary Action Buttons: Inspect, Quick Crawl & Delete -->
                <div class="flex items-center space-x-2 pt-2 border-t border-slate-100 dark:border-[#27272A]/80">
                  <button @click="openSeedDossier(seed)" class="flex-1 flex items-center justify-center space-x-1.5 py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-bold text-xs shadow-sm active:scale-95 transition">
                    <i data-lucide="eye" class="w-3.5 h-3.5"></i>
                    <span>Inspect</span>
                  </button>
                  <button @click.stop="openCrawlModal(seed.pin_id)" class="p-2 rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 transition active:scale-95" title="⚡ Crawl this seed">
                    <i data-lucide="zap" class="w-3.5 h-3.5"></i>
                  </button>
                  <button @click.stop="openDeleteModal(seed)" class="p-2 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 transition active:scale-95" title="Delete & purge seed from database">
                    <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                  </button>
                </div>
              </div>
            </template>
          </div>

          <!-- 2. Compact Table View (When seedViewMode === 'table') -->
          <div x-show="seedViewMode === 'table'" class="bg-white dark:bg-[#18181B] border border-slate-200/90 dark:border-[#27272A] rounded-2xl shadow-sm overflow-hidden">
            <div class="overflow-x-auto">
              <table class="w-full text-left text-xs font-sans">
                <thead class="bg-slate-50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-[#27272A] text-[11px] font-mono tabular-nums text-slate-500 uppercase">
                  <tr>
                    <th class="p-3 pl-4 w-10">
                      <input type="checkbox" :checked="isAllSeedsSelected" @change="toggleSelectAllSeeds()" class="w-4 h-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer">
                    </th>
                    <th class="p-3">Seed Pin ID & Label</th>
                    <th class="p-3">Type</th>
                    <th class="p-3 text-right">Harvested Nodes</th>
                    <th class="p-3 text-right">Guided Capsules</th>
                    <th class="p-3 text-right">Commercial Gap</th>
                    <th class="p-3">Last Crawled</th>
                    <th class="p-3 text-right pr-4">Actions</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono tabular-nums">
                  <template x-for="seed in filteredSeeds" :key="seed.pin_id">
                    <tr class="hover:bg-slate-50/70 dark:hover:bg-slate-900/40 transition"
                        :class="selectedSeedIds.includes(seed.pin_id) ? 'bg-rose-50/20 dark:bg-rose-950/15' : ''">
                      <td class="p-3 pl-4">
                        <input type="checkbox" :checked="selectedSeedIds.includes(seed.pin_id)" @change="toggleSeedSelection(seed.pin_id)" class="w-4 h-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer">
                      </td>
                      <td class="p-3 font-sans">
                        <div class="font-bold text-slate-900 dark:text-white text-xs line-clamp-1" x-text="seed.label || 'Tracked Cluster Seed'"></div>
                        <div class="text-[11px] font-mono tabular-nums text-slate-500 flex items-center space-x-1.5 mt-0.5">
                          <a :href="'https://www.pinterest.com/pin/' + seed.pin_id + '/'" target="_blank" class="text-rose-600 dark:text-rose-400 hover:underline flex items-center space-x-0.5">
                            <span x-text="seed.pin_id"></span>
                            <i data-lucide="external-link" class="w-2.5 h-2.5"></i>
                          </a>
                        </div>
                      </td>
                      <td class="p-3">
                        <span class="px-2 py-0.5 rounded text-[10px] font-mono tabular-nums font-bold uppercase tracking-wider whitespace-nowrap"
                              :class="seed.is_competitor ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20'"
                              x-text="seed.is_competitor ? 'Competitor' : 'Internal'"></span>
                      </td>
                      <td class="p-3 text-right">
                        <span class="font-bold text-slate-900 dark:text-white" x-text="seed.total_candidates || 0"></span>
                      </td>
                      <td class="p-3 text-right">
                        <span class="px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-500/20 text-[10px] font-bold" x-text="seed.total_capsules || 0"></span>
                      </td>
                      <td class="p-3 text-right">
                        <span class="font-bold text-emerald-600 dark:text-emerald-400" x-text="(seed.commercial_gap_ratio ? seed.commercial_gap_ratio + '%' : '100%')"></span>
                      </td>
                      <td class="p-3 text-[11px] text-slate-500">
                        <span x-text="seed.last_crawled_at ? new Date(seed.last_crawled_at).toLocaleDateString() : 'Pending Crawl'"></span>
                      </td>
                      <td class="p-3 text-right pr-4">
                        <div class="flex items-center justify-end space-x-1.5">
                          <button @click="openSeedDossier(seed)" class="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-bold text-[11px] transition shadow-sm" title="Inspect Seed Cluster">
                            Inspect
                          </button>
                          <button @click.stop="openCrawlModal(seed.pin_id)" class="p-1.5 rounded-lg border border-amber-200 dark:border-amber-900/40 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 transition" title="⚡ Crawl this seed">
                            <i data-lucide="zap" class="w-3.5 h-3.5"></i>
                          </button>
                          <button @click.stop="openDeleteModal(seed)" class="p-1.5 rounded-lg border border-rose-200 dark:border-rose-900/50 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 transition" title="Delete seed">
                            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  </template>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Empty Search/Filter State -->
          <div x-show="filteredSeeds.length === 0" class="bg-white dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A] rounded-2xl p-8 text-center space-y-3">
            <i data-lucide="inbox" class="w-10 h-10 text-slate-400 mx-auto"></i>
            <h3 class="font-bold text-sm text-slate-700 dark:text-slate-300">No Tracked Seeds Match Your Filter</h3>
            <p class="text-xs text-slate-500 max-w-sm mx-auto">Try clearing your search query or filters, or add new pins using the Bulk Ingestion feature.</p>
            <button @click="seedSearch = ''; seedFilterStatus = 'all'; seedFilterType = 'all';" class="px-3 py-1.5 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200">
              Clear All Filters
            </button>
          </div>
        </div>
      </template>

      <!-- View B: Dedicated Seed Dossier View (Single Seed Isolated Telemetry & All Candidates) -->
      <template x-if="activeDossierSeed">
        <div class="space-y-6">
          
          <!-- Back Navigation Bar -->
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-[#18181B] p-4 rounded-2xl border border-slate-200/90 dark:border-[#27272A] shadow-sm">
            <button @click="closeSeedDossier()" class="inline-flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition active:scale-95">
              <i data-lucide="arrow-left" class="w-3.5 h-3.5"></i>
              <span>← Back to All Tracked Seeds Grid</span>
            </button>

            <div class="flex items-center space-x-3">
              <span class="text-xs font-mono tabular-nums text-slate-500">Active Seed: <strong class="text-slate-900 dark:text-white" x-text="activeDossierSeed.pin_id"></strong></span>
              <button @click="openRawJsonModal(activeDossierSeed.pin_id)" class="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition active:scale-95 flex items-center space-x-1.5 shadow-sm" title="Import authentic raw Pinterest JSON response (RelatedModulesResource)">
                <i data-lucide="file-input" class="w-3.5 h-3.5"></i>
                <span>📥 Import Raw JSON</span>
              </button>
              <button @click="triggerCrawl(activeDossierSeed.pin_id)" :disabled="crawlStatus.is_crawling" class="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition active:scale-95 flex items-center space-x-1.5 disabled:opacity-50">
                <i data-lucide="refresh-cw" :class="{'animate-spin': crawlStatus.is_crawling}" class="w-3 h-3"></i>
                <span>Re-Crawl This Seed</span>
              </button>
            </div>
          </div>

          <!-- Seed Dossier Header Card -->
          <div class="bg-white dark:bg-[#18181B] border border-slate-200/90 dark:border-[#27272A] rounded-2xl p-6 shadow-sm dark:shadow-xl space-y-4">
            <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 dark:border-[#27272A] pb-4">
              <div>
                <div class="flex items-center space-x-2">
                  <h2 class="text-lg font-bold text-slate-900 dark:text-white" x-text="activeDossierSeed.label || 'Cluster Seed'"></h2>
                  <span class="px-2 py-0.5 rounded text-[10px] font-mono tabular-nums font-bold uppercase tracking-wider" :class="activeDossierSeed.is_competitor ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20'" x-text="activeDossierSeed.is_competitor ? 'Competitor Cluster' : 'Internal Seed'"></span>
                </div>
                <div class="text-xs text-slate-500 font-mono tabular-nums mt-1 flex items-center space-x-2">
                  <span>Pin ID: <a :href="'https://www.pinterest.com/pin/' + activeDossierSeed.pin_id + '/'" target="_blank" class="text-rose-600 dark:text-rose-400 hover:underline font-bold" x-text="activeDossierSeed.pin_id"></a></span>
                  <span>•</span>
                  <span>Harvested Candidates: <strong class="text-slate-900 dark:text-white" x-text="dossierCandidates.length">0</strong> nodes</span>
                  <span>•</span>
                  <span>Commercial Gap: <strong class="text-emerald-600" x-text="(activeDossierSeed.commercial_gap_ratio || 100) + '%'"></strong></span>
                </div>
              </div>

              <div class="px-3 py-1.5 rounded-xl bg-sky-500/10 border border-sky-500/20 text-xs font-mono tabular-nums text-sky-700 dark:text-sky-300">
                <span>Evaluation Pool: <strong class="text-slate-900 dark:text-white" x-text="dossierTelemetry.total_engine_quota || 0">0</strong> candidates evaluated &rarr; Top <strong class="text-emerald-600 dark:text-emerald-400" x-text="dossierCandidates.length">0</strong> stored in DB</span>
              </div>
            </div>

            <!-- Seed-Specific Retrieval Quota Stacked Bar -->
            <div class="space-y-2.5">
              <div class="flex items-center justify-between">
                <span class="text-xs font-bold uppercase font-mono tabular-nums tracking-wider text-slate-500">P2P Retrieval Quotas for This Seed</span>
                <span class="text-[11px] font-mono tabular-nums text-slate-400" x-text="'Total Quota: ' + (dossierTelemetry.total_engine_quota || 0) + ' items evaluated'"></span>
              </div>
              <div class="w-full bg-slate-100 dark:bg-slate-900 rounded-xl h-4 overflow-hidden flex border border-slate-200 dark:border-[#27272A] shadow-inner">
                <div class="bg-[#0ea5e9] transition-all duration-300" :style="'width: ' + (dossierTelemetry.navboost_pct || 0) + '%'" :title="'NavBoost: ' + (dossierTelemetry.navboost_count || 0) + ' (' + (dossierTelemetry.navboost_pct || 0) + '%)'"></div>
                <div class="bg-[#f43f5e] transition-all duration-300" :style="'width: ' + (dossierTelemetry.recgpt_pct || 0) + '%'" :title="'RecGPT: ' + (dossierTelemetry.recgpt_count || 0) + ' (' + (dossierTelemetry.recgpt_pct || 0) + '%)'"></div>
                <div class="bg-[#10b981] transition-all duration-300" :style="'width: ' + (dossierTelemetry.two_tower_pct || 0) + '%'" :title="'Two-Tower: ' + (dossierTelemetry.two_tower_count || 0) + ' (' + (dossierTelemetry.two_tower_pct || 0) + '%)'"></div>
                <div class="bg-[#f59e0b] transition-all duration-300" :style="'width: ' + (dossierTelemetry.randomwalk_pct || 0) + '%'" :title="'RandomWalk (Pixie): ' + (dossierTelemetry.randomwalk_count || 0) + ' (' + (dossierTelemetry.randomwalk_pct || 0) + '%)'"></div>
                <div class="bg-[#8b5cf6] transition-all duration-300" :style="'width: ' + (dossierTelemetry.fresh_pct || 0) + '%'" :title="'Fresh: ' + (dossierTelemetry.fresh_candidate_count || 0) + ' (' + (dossierTelemetry.fresh_pct || 0) + '%)'"></div>
              </div>
              <div class="flex items-center space-x-2 text-[11px] font-mono tabular-nums text-slate-500 flex-wrap gap-y-1.5">
                <span class="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-lg bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/20">
                  <span class="w-2 h-2 rounded-full bg-[#0ea5e9]"></span>
                  <span>NavBoost: <strong class="font-bold" x-text="dossierTelemetry.navboost_count || 0"></strong></span>
                </span>
                <span class="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-lg bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/20">
                  <span class="w-2 h-2 rounded-full bg-[#f43f5e]"></span>
                  <span>RecGPT: <strong class="font-bold" x-text="dossierTelemetry.recgpt_count || 0"></strong></span>
                </span>
                <span class="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                  <span class="w-2 h-2 rounded-full bg-[#10b981]"></span>
                  <span>Two-Tower: <strong class="font-bold" x-text="dossierTelemetry.two_tower_count || 0"></strong></span>
                </span>
                <span class="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
                  <span class="w-2 h-2 rounded-full bg-[#f59e0b]"></span>
                  <span>RandomWalk: <strong class="font-bold" x-text="dossierTelemetry.randomwalk_count || 0"></strong></span>
                </span>
                <span class="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-lg bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20">
                  <span class="w-2 h-2 rounded-full bg-[#8b5cf6]"></span>
                  <span>Fresh: <strong class="font-bold" x-text="dossierTelemetry.fresh_candidate_count || 0"></strong></span>
                </span>
              </div>
            </div>

            <!-- Seed Color DNA & Lexical Tokens -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-200 dark:border-[#27272A] text-xs font-mono tabular-nums">
              <div>
                <span class="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Cluster Color Centroids:</span>
                <div class="flex items-center space-x-2 mt-1.5 flex-wrap gap-y-1.5">
                  <template x-for="swatch in (dossierTelemetry.color_centroids || []).slice(0, 5)" :key="swatch.color">
                    <div class="flex items-center space-x-1.5 px-2 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-slate-900">
                      <span class="w-3 h-3 rounded-sm border" :style="'background-color: ' + swatch.color"></span>
                      <span class="text-[10px] text-slate-700 dark:text-slate-300" x-text="swatch.color"></span>
                      <span class="text-[9px] text-slate-400" x-text="swatch.percentage + '%'"></span>
                    </div>
                  </template>
                </div>
              </div>

              <div>
                <span class="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Top Lexical NLP Tokens:</span>
                <div class="flex items-center space-x-1.5 mt-1.5 flex-wrap gap-y-1.5">
                  <template x-for="token in (dossierTelemetry.high_save_tokens || []).slice(0, 5)" :key="token.token">
                    <span class="px-2 py-0.5 rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-slate-900 text-[10px] font-bold text-slate-800 dark:text-slate-200" x-text="token.token + ' (' + token.tf + ')'"></span>
                  </template>
                </div>
              </div>
            </div>
          </div>

          <!-- Dossier Sub-Navigation: Candidates Table vs Creator Playbook -->
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-[#27272A] pb-2">
            <div class="flex items-center space-x-2">
              <button @click="dossierTab = 'table'" class="px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5" :class="dossierTab === 'table' ? 'bg-rose-600 text-white shadow-sm' : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300'">
                <i data-lucide="list" class="w-3.5 h-3.5"></i>
                <span>Candidates Graph (<span x-text="dossierCandidates.length"></span>)</span>
              </button>
              <button @click="dossierTab = 'playbook'" class="px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5" :class="dossierTab === 'playbook' ? 'bg-rose-600 text-white shadow-sm' : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300'">
                <i data-lucide="sparkles" class="w-3.5 h-3.5 text-amber-400"></i>
                <span>Creator Playbook (RecGPT Matrix)</span>
                <span class="px-1.5 py-0.2 rounded text-[9px] font-mono tabular-nums font-bold uppercase bg-amber-500/20 text-amber-700 dark:text-amber-300">Live DB</span>
              </button>
              <button @click="dossierTab = 'guided_search'" class="px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5" :class="dossierTab === 'guided_search' ? 'bg-purple-600 text-white shadow-sm' : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300'">
                <i data-lucide="compass" class="w-3.5 h-3.5 text-purple-400"></i>
                <span>Guided Search Radar (كبسولات BUBBLE_ONE_COL)</span>
                <span class="px-1.5 py-0.2 rounded text-[9px] font-mono tabular-nums font-bold bg-purple-500/20 text-purple-700 dark:text-purple-300" x-text="dossierGuidedCapsules.length"></span>
              </button>
            </div>

            <!-- Sorting Selector (When Table is Active) -->
            <div x-show="dossierTab === 'table'" class="flex items-center space-x-2">
              <span class="text-xs font-semibold text-slate-500 font-mono tabular-nums hidden sm:inline">Sort:</span>
              <select x-model="dossierSort" @change="reloadDossierCandidates()" class="px-2.5 py-1 rounded-xl text-xs bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-slate-100 font-mono tabular-nums focus:outline-none focus:border-rose-500">
                <option value="saves">Sort by Total Saves</option>
                <option value="velocity">Sort by Velocity (Fastest Growing)</option>
              </select>
            </div>
          </div>

          <!-- SUB-VIEW 1: CREATOR PLAYBOOK (RecGPT Matrix from Live DB) -->
          <div x-show="dossierTab === 'playbook'" class="space-y-4">
            <div class="bg-white dark:bg-[#18181B] border border-slate-200/90 dark:border-[#27272A] rounded-2xl p-6 shadow-sm dark:shadow-xl space-y-4">
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-[#27272A] pb-3">
                <div>
                  <h3 class="font-bold text-sm text-slate-900 dark:text-white flex items-center space-x-2">
                    <i data-lucide="sparkles" class="w-4 h-4 text-amber-500"></i>
                    <span>Creator Playbook: RecGPT Sequential Trajectory Matrix</span>
                  </h3>
                  <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Pinterest's causal sequential transformer predicts user transition probabilities between meal courses. These 3 candidate nodes are dynamically extracted from Neon for active seed <span class="font-mono tabular-nums text-rose-500" x-text="activeDossierSeed.pin_id"></span>.
                  </p>
                </div>
                <div class="flex items-center space-x-2">
                  <span class="px-2.5 py-1 rounded-lg text-xs font-mono tabular-nums font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                    P2P_RECGPT Active
                  </span>
                </div>
              </div>

              <!-- 3 Dynamic Trajectory Cards Grid -->
              <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
                
                <!-- 1. Dinner Anchor -->
                <div class="p-4 rounded-2xl border border-rose-500/30 bg-rose-500/[0.03] dark:bg-rose-500/[0.05] space-y-3 flex flex-col justify-between">
                  <div class="space-y-2.5">
                    <div class="flex items-center justify-between">
                      <span class="px-2 py-0.5 rounded text-[10px] font-mono tabular-nums font-bold uppercase bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30">
                        1. Dinner Anchor (Primary Entree)
                      </span>
                      <span class="text-[11px] font-mono tabular-nums text-slate-400" x-text="'Prep: ' + (recgptPlaybook?.dinner_anchor?.prep_time || '15m')"></span>
                    </div>

                    <div class="flex items-start space-x-3">
                      <span class="w-8 h-8 rounded-lg border flex-shrink-0 mt-0.5" :style="'background-color: ' + (recgptPlaybook?.dinner_anchor?.winning_color || '#824d30')"></span>
                      <div class="space-y-1">
                        <div class="font-bold text-slate-900 dark:text-white text-xs line-clamp-2" x-text="recgptPlaybook?.dinner_anchor?.title || 'Dinner Anchor'"></div>
                        <div class="text-[10px] font-mono tabular-nums text-slate-400" x-text="recgptPlaybook?.dinner_anchor?.culinary_color_name"></div>
                      </div>
                    </div>

                    <div class="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-[11px] font-mono tabular-nums space-y-1">
                      <div class="flex justify-between">
                        <span class="text-slate-500">Saves:</span>
                        <strong class="text-slate-900 dark:text-white" x-text="Number(recgptPlaybook?.dinner_anchor?.saves || 0).toLocaleString()"></strong>
                      </div>
                      <div class="flex justify-between">
                        <span class="text-slate-500">Save Rate:</span>
                        <strong class="text-emerald-600" x-text="(recgptPlaybook?.dinner_anchor?.save_rate || 0) + '%'"></strong>
                      </div>
                      <div class="flex justify-between">
                        <span class="text-slate-500">Transition Affinity:</span>
                        <strong class="text-purple-600 dark:text-purple-400" x-text="(recgptPlaybook?.dinner_anchor?.recgpt_transition_score || 0) + ' / 100'"></strong>
                      </div>
                      <template x-if="recgptPlaybook?.dinner_anchor?.daily_velocity">
                        <div class="flex justify-between pt-0.5 border-t border-slate-100 dark:border-[#27272A]">
                          <span class="text-slate-500">Daily Velocity:</span>
                          <strong class="text-emerald-600" x-text="'⚡ ' + recgptPlaybook?.dinner_anchor?.daily_velocity + '/day'"></strong>
                        </div>
                      </template>
                    </div>
                  </div>

                  <button @click="inspectCandidate(recgptPlaybook?.dinner_anchor)" class="w-full py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition active:scale-95 flex items-center justify-center space-x-1.5 shadow-sm">
                    <i data-lucide="zap" class="w-3.5 h-3.5"></i>
                    <span>⚡ Generate Pin Asset</span>
                  </button>
                </div>

                <!-- 2. Navboost Co-visitor -->
                <div class="p-4 rounded-2xl border border-sky-500/30 bg-sky-500/[0.03] dark:bg-sky-500/[0.05] space-y-3 flex flex-col justify-between">
                  <div class="space-y-2.5">
                    <div class="flex items-center justify-between">
                      <span class="px-2 py-0.5 rounded text-[10px] font-mono tabular-nums font-bold uppercase bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30">
                        2. Navboost Co-visitor (Complementary Side)
                      </span>
                      <span class="text-[11px] font-mono tabular-nums text-slate-400" x-text="'Prep: ' + (recgptPlaybook?.navboost_co_visitor?.prep_time || '20m')"></span>
                    </div>

                    <div class="flex items-start space-x-3">
                      <span class="w-8 h-8 rounded-lg border flex-shrink-0 mt-0.5" :style="'background-color: ' + (recgptPlaybook?.navboost_co_visitor?.winning_color || '#d08c47')"></span>
                      <div class="space-y-1">
                        <div class="font-bold text-slate-900 dark:text-white text-xs line-clamp-2" x-text="recgptPlaybook?.navboost_co_visitor?.title || 'Navboost Side'"></div>
                        <div class="text-[10px] font-mono tabular-nums text-slate-400" x-text="recgptPlaybook?.navboost_co_visitor?.culinary_color_name"></div>
                      </div>
                    </div>

                    <div class="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-[11px] font-mono tabular-nums space-y-1">
                      <div class="flex justify-between">
                        <span class="text-slate-500">Saves:</span>
                        <strong class="text-slate-900 dark:text-white" x-text="Number(recgptPlaybook?.navboost_co_visitor?.saves || 0).toLocaleString()"></strong>
                      </div>
                      <div class="flex justify-between">
                        <span class="text-slate-500">Save Rate:</span>
                        <strong class="text-emerald-600" x-text="(recgptPlaybook?.navboost_co_visitor?.save_rate || 0) + '%'"></strong>
                      </div>
                      <div class="flex justify-between">
                        <span class="text-slate-500">Transition Affinity:</span>
                        <strong class="text-sky-600 dark:text-sky-400" x-text="(recgptPlaybook?.navboost_co_visitor?.recgpt_transition_score || 0) + ' / 100'"></strong>
                      </div>
                      <template x-if="recgptPlaybook?.navboost_co_visitor?.daily_velocity">
                        <div class="flex justify-between pt-0.5 border-t border-slate-100 dark:border-[#27272A]">
                          <span class="text-slate-500">Daily Velocity:</span>
                          <strong class="text-emerald-600" x-text="'⚡ ' + recgptPlaybook?.navboost_co_visitor?.daily_velocity + '/day'"></strong>
                        </div>
                      </template>
                    </div>
                  </div>

                  <button @click="inspectCandidate(recgptPlaybook?.navboost_co_visitor)" class="w-full py-2 px-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs transition active:scale-95 flex items-center justify-center space-x-1.5 shadow-sm">
                    <i data-lucide="zap" class="w-3.5 h-3.5"></i>
                    <span>⚡ Generate Pin Asset</span>
                  </button>
                </div>

                <!-- 3. Session Finisher -->
                <div class="p-4 rounded-2xl border border-amber-500/30 bg-amber-500/[0.03] dark:bg-amber-500/[0.05] space-y-3 flex flex-col justify-between">
                  <div class="space-y-2.5">
                    <div class="flex items-center justify-between">
                      <span class="px-2 py-0.5 rounded text-[10px] font-mono tabular-nums font-bold uppercase bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                        3. Session Finisher (Board Saver Dessert)
                      </span>
                      <span class="text-[11px] font-mono tabular-nums text-slate-400" x-text="'Prep: ' + (recgptPlaybook?.session_finisher?.prep_time || '10m')"></span>
                    </div>

                    <div class="flex items-start space-x-3">
                      <span class="w-8 h-8 rounded-lg border flex-shrink-0 mt-0.5" :style="'background-color: ' + (recgptPlaybook?.session_finisher?.winning_color || '#b9975f')"></span>
                      <div class="space-y-1">
                        <div class="font-bold text-slate-900 dark:text-white text-xs line-clamp-2" x-text="recgptPlaybook?.session_finisher?.title || 'Session Finisher'"></div>
                        <div class="text-[10px] font-mono tabular-nums text-slate-400" x-text="recgptPlaybook?.session_finisher?.culinary_color_name"></div>
                      </div>
                    </div>

                    <div class="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-[11px] font-mono tabular-nums space-y-1">
                      <div class="flex justify-between">
                        <span class="text-slate-500">Saves:</span>
                        <strong class="text-slate-900 dark:text-white" x-text="Number(recgptPlaybook?.session_finisher?.saves || 0).toLocaleString()"></strong>
                      </div>
                      <div class="flex justify-between">
                        <span class="text-slate-500">Save Rate:</span>
                        <strong class="text-emerald-600" x-text="(recgptPlaybook?.session_finisher?.save_rate || 0) + '%'"></strong>
                      </div>
                      <div class="flex justify-between">
                        <span class="text-slate-500">Transition Affinity:</span>
                        <strong class="text-amber-600 dark:text-amber-400" x-text="(recgptPlaybook?.session_finisher?.recgpt_transition_score || 0) + ' / 100'"></strong>
                      </div>
                      <template x-if="recgptPlaybook?.session_finisher?.daily_velocity">
                        <div class="flex justify-between pt-0.5 border-t border-slate-100 dark:border-[#27272A]">
                          <span class="text-slate-500">Daily Velocity:</span>
                          <strong class="text-emerald-600" x-text="'⚡ ' + recgptPlaybook?.session_finisher?.daily_velocity + '/day'"></strong>
                        </div>
                      </template>
                    </div>
                  </div>

                  <button @click="inspectCandidate(recgptPlaybook?.session_finisher)" class="w-full py-2 px-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs transition active:scale-95 flex items-center justify-center space-x-1.5 shadow-sm">
                    <i data-lucide="zap" class="w-3.5 h-3.5"></i>
                    <span>⚡ Generate Pin Asset</span>
                  </button>
                </div>

              </div>
            </div>
          </div>

          <!-- SUB-VIEW 2: FULL UNCAPPED CANDIDATES TABLE FOR ACTIVE SEED -->
          <div x-show="dossierTab === 'table'" class="bg-white dark:bg-[#18181B] border border-slate-200/90 dark:border-[#27272A] rounded-2xl overflow-hidden shadow-sm dark:shadow-xl space-y-3 p-5">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-[#27272A] pb-3">
              <div>
                <h3 class="font-bold text-sm text-slate-900 dark:text-white flex items-center space-x-2">
                  <i data-lucide="list" class="w-4 h-4 text-rose-500"></i>
                  <span>Candidates Harvested from Seed <span class="font-mono tabular-nums text-rose-600 dark:text-rose-400" x-text="activeDossierSeed.pin_id"></span></span>
                </h3>
                <p class="text-xs text-slate-500 font-mono tabular-nums" x-text="'Showing all ' + dossierCandidates.length + ' candidate nodes (100% Uncapped)'"></p>
              </div>

              <div class="flex items-center space-x-2">
                <button @click="exportCsv(filteredDossierCandidates, 'seed-' + activeDossierSeed.pin_id + '-candidates.csv')" class="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-semibold shadow-sm transition active:scale-95">
                  <i data-lucide="download" class="w-3.5 h-3.5 text-rose-500"></i>
                  <span>Export CSV</span>
                </button>
              </div>
            </div>

            <!-- Filter & Segment Toolbar for Seed Dossier Candidates -->
            <div class="p-3.5 rounded-2xl bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200/80 dark:border-[#27272A]/80 space-y-3">
              <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                
                <!-- 1. Text Search -->
                <div class="relative flex-1 min-w-[200px]">
                  <i data-lucide="search" class="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400"></i>
                  <input type="text" x-model="dossierFilters.search" placeholder="Search title, domain, OCR text, or pin ID..." class="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] font-mono tabular-nums text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-rose-500">
                </div>

                <!-- 2. The 4 Dropdown Filter Selectors -->
                <div class="flex items-center space-x-2 flex-wrap gap-y-2">
                  
                  <!-- Engine Provenance Filter -->
                  <div class="flex items-center space-x-1 bg-white dark:bg-slate-900 rounded-xl px-2 py-1 border border-slate-200 dark:border-[#27272A] shadow-sm">
                    <span class="text-[10px] font-mono tabular-nums text-slate-400 uppercase font-semibold">Engine:</span>
                    <select x-model="dossierFilters.engine" class="text-xs bg-transparent text-slate-900 dark:text-slate-100 font-mono tabular-nums focus:outline-none cursor-pointer">
                      <option value="all">All Engines</option>
                      <option value="P2P_NAVBOOST">P2P_NAVBOOST (Sky)</option>
                      <option value="P2P_RANDOMWALK">P2P_RANDOMWALK (Emerald)</option>
                      <option value="P2P_TWO_TOWER">P2P_TWO_TOWER (Violet)</option>
                      <option value="P2P_RECGPT">P2P_RECGPT (Rose)</option>
                      <option value="FRESH_COLD_START">FRESH_COLD_START (Cyan)</option>
                      <option value="P2P_SHOPPING_CORPUS">P2P_SHOPPING_CORPUS (Amber)</option>
                    </select>
                  </div>

                  <!-- Velocity Tier Filter -->
                  <div class="flex items-center space-x-1 bg-white dark:bg-slate-900 rounded-xl px-2 py-1 border border-slate-200 dark:border-[#27272A] shadow-sm">
                    <span class="text-[10px] font-mono tabular-nums text-slate-400 uppercase font-semibold">Speed:</span>
                    <select x-model="dossierFilters.velocity" class="text-xs bg-transparent text-slate-900 dark:text-slate-100 font-mono tabular-nums focus:outline-none cursor-pointer">
                      <option value="all">All Speeds</option>
                      <option value="explosive">🔥 Explosive (≥ 50/d)</option>
                      <option value="trending">⚡ Trending (10-49/d)</option>
                      <option value="stagnant">💤 Stagnant (&lt; 10/d)</option>
                    </select>
                  </div>

                  <!-- Market Arbitrage Status Filter -->
                  <div class="flex items-center space-x-1 bg-white dark:bg-slate-900 rounded-xl px-2 py-1 border border-slate-200 dark:border-[#27272A] shadow-sm">
                    <span class="text-[10px] font-mono tabular-nums text-slate-400 uppercase font-semibold">Market:</span>
                    <select x-model="dossierFilters.market" class="text-xs bg-transparent text-slate-900 dark:text-slate-100 font-mono tabular-nums focus:outline-none cursor-pointer">
                      <option value="all">All Statuses</option>
                      <option value="vacuum">🎯 Vacuum Targets Only (Organic ≥ 5K)</option>
                      <option value="product">🛒 Competitor Products (Etsy/Shopify)</option>
                    </select>
                  </div>

                  <!-- RecGPT Meal Sequence Filter -->
                  <div class="flex items-center space-x-1 bg-white dark:bg-slate-900 rounded-xl px-2 py-1 border border-slate-200 dark:border-[#27272A] shadow-sm">
                    <span class="text-[10px] font-mono tabular-nums text-slate-400 uppercase font-semibold">Sequence:</span>
                    <select x-model="dossierFilters.sequence" class="text-xs bg-transparent text-slate-900 dark:text-slate-100 font-mono tabular-nums focus:outline-none cursor-pointer">
                      <option value="all">All Sequence Roles</option>
                      <option value="DESSERT_HERO">🧁 Hero Dessert/Bake</option>
                      <option value="BEVERAGE_PAIRING">☕ Beverage/Pairing</option>
                      <option value="PASTRY_BITES">🥐 Pastry Bites</option>
                      <option value="DINNER_ANCHOR">🍽️ Dinner Anchor</option>
                      <option value="NAVBOOST_CO_VISITOR">🥖 Co-Visitor Side</option>
                      <option value="SESSION_FINISHER">🍪 Session Finisher</option>
                      <option value="PIXIE_DRIFT_OUTLIER">⚠️ Pixie Drift Outlier</option>
                    </select>
                  </div>

                </div>
              </div>

              <!-- Dynamic Result Count Badge & Reset Button -->
              <div class="flex items-center justify-between pt-1 text-xs border-t border-slate-200/60 dark:border-[#27272A]/60 font-mono tabular-nums">
                <div class="flex items-center space-x-2 text-slate-600 dark:text-slate-300">
                  <span class="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                    Showing <span class="mx-1 text-rose-600 dark:text-rose-400" x-text="filteredDossierCandidates.length"></span> of <span class="mx-1" x-text="dossierCandidates.length"></span> candidates matching filters
                  </span>
                </div>

                <button 
                  x-show="dossierFilters.search || dossierFilters.engine !== 'all' || dossierFilters.velocity !== 'all' || dossierFilters.market !== 'all' || dossierFilters.sequence !== 'all'"
                  @click="resetDossierFilters()"
                  class="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 text-[11px] font-bold transition active:scale-95"
                >
                  <i data-lucide="rotate-ccw" class="w-3 h-3"></i>
                  <span>Reset All Filters</span>
                </button>
              </div>
            </div>

            <div class="overflow-x-auto">
              <table class="w-full text-left text-xs border-collapse">
                <thead>
                  <tr class="border-b border-slate-200 dark:border-[#27272A]/80 bg-slate-50/80 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 font-mono tabular-nums text-[11px] uppercase tracking-wider">
                    <th class="py-3 px-3">Preview & Format</th>
                    <th class="py-3 px-3 min-w-[220px]">Title & Vision OCR</th>
                    <th class="py-3 px-3">Pin Age & Velocity</th>
                    <th class="py-3 px-3">Metrics</th>
                    <th class="py-3 px-3">Dominant Color</th>
                    <th class="py-3 px-3">Engine Provenance</th>
                    <th class="py-3 px-3">prod:v18 Spread</th>
                    <th class="py-3 px-3 text-right">Inspect</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60 font-sans">
                  <template x-for="item in filteredDossierCandidates" :key="item.candidate_pin_id">
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
                          <template x-if="item.image_url">
                            <a :href="'https://www.pinterest.com/pin/' + item.candidate_pin_id + '/'" target="_blank" class="group/thumb block relative flex-shrink-0">
                              <img :src="item.image_url" alt="pin preview" loading="lazy" class="w-8 h-12 rounded-lg object-cover border shadow-sm group-hover/thumb:scale-125 transition-transform duration-200" :style="'border-color: ' + (item.winning_color || '#cbd5e1')" onerror="window.handlePinImgError(this)">
                            </a>
                          </template>
                          <template x-if="!item.image_url">
                            <div class="w-8 h-12 rounded-lg flex-shrink-0 border shadow-sm flex items-center justify-center" :style="'border-color: ' + (item.winning_color || '#cbd5e1') + '; background-color: ' + (item.winning_color || '#cbd5e1') + '15;'">
                              <i data-lucide="image" class="w-4 h-4 text-slate-400"></i>
                            </div>
                          </template>
                          <div class="space-y-1">
                            <div class="flex items-center space-x-1">
                              <span class="inline-block px-1.5 py-0.5 rounded text-[9px] font-mono tabular-nums font-bold tracking-wider uppercase" :class="{
                                'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20': item.format_type === 'PRODUCT CARD',
                                'bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20': item.format_type === 'ORGANIC PIN',
                                'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20': item.format_type === 'VIDEO PIN',
                                'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20': item.format_type === 'IDEA PIN'
                              }" x-text="item.format_type"></span>

                              <template x-if="item.is_vacuum_target">
                                <span class="px-1 py-0.5 rounded text-[8px] font-extrabold uppercase bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/40">
                                  VACUUM
                                </span>
                              </template>
                            </div>

                            <!-- Ingestion Method Badge -->
                            <template x-if="item.ingestion_method && item.ingestion_method !== 'uploaded'">
                              <div class="text-[8px] font-mono tabular-nums font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-1">
                                <span class="px-1 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-500" x-text="item.ingestion_method === 'csv_importer' ? '⚙️ CSV Farm' : (item.ingestion_method === 'pin_scheduling' ? '⏱️ Scheduled' : item.ingestion_method)"></span>
                              </div>
                            </template>
                          </div>
                        </div>
                      </td>`,
                      titleHtml: `
                      <!-- 2. Title & Vision OCR -->
                      <td class="py-3 px-3">
                        <div class="space-y-1">
                          <a :href="'https://www.pinterest.com/pin/' + item.candidate_pin_id + '/'" target="_blank" class="font-bold text-slate-900 dark:text-slate-100 hover:text-rose-600 dark:hover:text-rose-400 line-clamp-1 hover:underline" x-text="item.title"></a>
                          <div class="flex items-center space-x-2 text-[10px] text-slate-500 font-mono tabular-nums flex-wrap gap-y-1">
                            <span class="px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300" x-text="item.domain"></span>
                            <span>•</span>
                            <span x-text="'ID: ' + item.candidate_pin_id"></span>
                            <template x-if="item.sequence_role && item.sequence_role !== 'DIRECT_MATCH'">
                              <span class="px-1.5 py-0.2 rounded text-[9px] font-bold" :class="{
                                'bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30': item.sequence_role === 'DESSERT_HERO',
                                'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30': item.sequence_role === 'BEVERAGE_PAIRING',
                                'bg-teal-500/15 text-teal-700 dark:text-teal-300 border border-teal-500/30': item.sequence_role === 'PASTRY_BITES',
                                'bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30': item.sequence_role === 'DINNER_ANCHOR',
                                'bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30': item.sequence_role === 'NAVBOOST_CO_VISITOR',
                                'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30': item.sequence_role === 'SESSION_FINISHER',
                                'bg-red-500/20 text-red-700 dark:text-red-300 border border-red-500/40 font-extrabold': item.sequence_role === 'PIXIE_DRIFT_OUTLIER'
                              }" x-text="{
                                'DESSERT_HERO': '🧁 Hero Bake',
                                'BEVERAGE_PAIRING': '☕ Pairing',
                                'PASTRY_BITES': '🥐 Bites',
                                'DINNER_ANCHOR': '🍽️ Anchor',
                                'NAVBOOST_CO_VISITOR': '🥖 Co-Visitor',
                                'SESSION_FINISHER': '🍪 Finisher',
                                'PIXIE_DRIFT_OUTLIER': '⚠️ Pixie Drift'
                              }[item.sequence_role] || item.sequence_role"></span>
                            </template>
                          </div>
                          <template x-if="item.ocr_text">
                            <div class="p-1 px-1.5 rounded bg-slate-100 dark:bg-slate-900/90 text-[9px] text-slate-600 dark:text-slate-400 font-mono tabular-nums truncate max-w-sm" :title="item.ocr_text">
                              <span class="text-rose-500 font-bold">OCR:</span> <span x-text="item.ocr_text"></span>
                            </div>
                          </template>
                        </div>
                      </td>`,
                      velocityHtml: `
                      <!-- 3. Pin Age & Velocity -->
                      <td class="py-3 px-3 whitespace-nowrap font-mono tabular-nums">
                        <div class="text-[11px] text-slate-500 dark:text-slate-400" x-text="item.age_display || (item.age_days ? (item.age_days < 30 ? item.age_days + 'd ago' : (item.age_days < 365 ? Math.floor(item.age_days / 30) + 'mo ago' : (item.age_days / 365).toFixed(1) + 'y ago')) : '1d ago')"></div>
                        <div class="mt-0.5">
                          <template x-if="Number(item.daily_velocity || 0) >= 50">
                            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40" x-text="'🔥 ' + item.daily_velocity + '/day (Explosive)'"></span>
                          </template>
                          <template x-if="Number(item.daily_velocity || 0) >= 10 && Number(item.daily_velocity || 0) < 50">
                            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30" x-text="'⚡ ' + item.daily_velocity + '/day (Trending)'"></span>
                          </template>
                          <template x-if="Number(item.daily_velocity || 0) < 10">
                            <span class="px-1.5 py-0.5 rounded text-[9px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-[#27272A]" x-text="item.daily_velocity + '/day (Stagnant)'"></span>
                          </template>
                        </div>
                      </td>`,
                      savesHtml: `
                      <!-- 4. Metrics -->
                      <td class="py-3 px-3 whitespace-nowrap font-mono tabular-nums">
                        <div class="text-slate-900 dark:text-slate-100 font-bold" x-text="Number(item.total_saves != null ? item.total_saves : (item.saves || 0)).toLocaleString() + ' saves'"></div>
                        <template x-if="Number(item.total_repins != null ? item.total_repins : (item.repins || 0)) > 0">
                          <div class="text-[10px] text-slate-500" x-text="Number(item.total_repins != null ? item.total_repins : (item.repins || 0)).toLocaleString() + ' repins • ' + (item.avg_save_rate != null ? item.avg_save_rate : (item.save_rate != null ? item.save_rate : 0)) + '% rate'"></div>
                        </template>
                        <template x-if="Number(item.total_repins != null ? item.total_repins : (item.repins || 0)) === 0">
                          <div class="text-[10px] text-slate-500" x-text="'⚡ ' + item.daily_velocity + '/day (Trending)'"></div>
                        </template>
                      </td>`,
                      extraCellsBeforeActions: `
                      <!-- 5. Dominant Color -->
                      <td class="py-3 px-3 whitespace-nowrap">
                        <div class="flex items-center space-x-2">
                          <span class="w-4 h-4 rounded border flex-shrink-0 shadow-sm" :style="'background-color: ' + (item.winning_color || item.dominant_color || '#888888')"></span>
                          <div class="space-y-0.5 min-w-0">
                            <div class="font-mono tabular-nums text-[10px] font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide" x-text="item.winning_color || item.dominant_color || '#888888'"></div>
                            <div class="text-[9px] text-slate-500 dark:text-slate-400 font-medium truncate max-w-[140px]" x-text="item.culinary_color_name || 'Culinary Accent'" :title="item.culinary_color_name"></div>
                          </div>
                        </div>
                      </td>

                      <!-- 6. Engine Provenance -->
                      <td class="py-3 px-3 whitespace-nowrap">
                        <span class="px-2 py-0.5 rounded text-[10px] font-mono tabular-nums font-bold uppercase" :class="{
                          'bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20': item.engine_source === 'P2P_NAVBOOST',
                          'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20': item.engine_source === 'P2P_RANDOMWALK',
                          'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20': item.engine_source === 'P2P_RECGPT',
                          'bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20': item.engine_source === 'P2P_TWO_TOWER',
                          'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20': item.engine_source === 'P2P_SHOPPING_CORPUS',
                          'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20': item.engine_source === 'FRESH_COLD_START'
                        }" x-text="item.engine_source"></span>
                      </td>

                      <!-- 7. prod:v18 Spread -->
                      <td class="py-3 px-3 whitespace-nowrap font-mono tabular-nums">
                        <template x-if="!item.is_product">
                          <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30" x-text="'+' + (item.prod_spread || 220.8) + ' Net Leverage'"></span>
                        </template>
                        <template x-if="item.is_product">
                          <span class="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-[#27272A]">0.0 Net</span>
                        </template>
                      </td>`,
                      actionsHtml: `
                      <!-- 8. Inspect Action -->
                      <td class="py-3 px-3 text-right whitespace-nowrap">
                        <button @click="inspectCandidate(item)" class="p-1.5 rounded-lg bg-slate-100 hover:bg-rose-50 dark:bg-slate-800 dark:hover:bg-rose-950/40 text-slate-700 dark:text-slate-300 hover:text-rose-600 transition">
                          <i data-lucide="eye" class="w-4 h-4"></i>
                        </button>
                      </td>`
                    })}
                  </template>
                </tbody>
              </table>
            </div>
          </div>

          <!-- SUB-VIEW 3: 🧭 GUIDED SEARCH RADAR (BUBBLE_ONE_COL CAPSULES) FOR ACTIVE SEED -->
          <div x-show="dossierTab === 'guided_search'" class="space-y-5">
            <div class="bg-white dark:bg-[#18181B] border border-slate-200/90 dark:border-[#27272A] rounded-2xl p-6 shadow-sm dark:shadow-xl space-y-5">
              
              <!-- Header & Explanation -->
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 dark:border-[#27272A]/80 pb-4">
                <div>
                  <h3 class="text-base font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                    <i data-lucide="compass" class="w-5 h-5 text-purple-500"></i>
                    <span>Pinterest Guided Search Radar (استعلامات البحث الموجهة للدبوس <span class="font-mono tabular-nums text-purple-600 dark:text-purple-400" x-text="activeDossierSeed.pin_id"></span>)</span>
                  </h3>
                  <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    كبسولات بحثية مُهندسة خوارزمياً (BUBBLE_ONE_COL / Explore Article) مستخرجة من الـ Raw JSON لهذا الدبوس تحديداً. انقر على أي صورة لتكبيرها والتنقل بين الصور.
                  </p>
                </div>
                <div class="flex items-center space-x-2">
                  <span class="px-3 py-1.5 rounded-xl text-xs font-mono tabular-nums font-bold bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-500/20" x-text="dossierGuidedCapsules.length + ' Capsules Harvested'"></span>
                </div>
              </div>

              <!-- Visual Grid of Guided Search Capsules for this Seed -->
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                <template x-for="(cap, capIdx) in dossierGuidedCapsules" :key="cap.id || cap.node_id || cap.query_term">
                  <div class="group bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200/80 dark:border-[#27272A]/80 hover:border-purple-500/50 rounded-2xl p-4 shadow-sm hover:shadow-lg transition space-y-3 flex flex-col justify-between">
                    <div class="space-y-3">
                      <!-- Cover Image Thumbnail with Click-to-Zoom Lightbox -->
                      <div @click="openLightbox(capIdx)" class="relative w-full h-48 rounded-xl overflow-hidden bg-slate-200 dark:bg-slate-800 border border-slate-200 dark:border-[#27272A] shadow-inner cursor-pointer group/img">
                        <template x-if="cap.image_url">
                          <img :src="cap.image_url" alt="Guided capsule cover" loading="lazy" class="w-full h-full object-cover group-hover/img:scale-105 transition-transform duration-300">
                        </template>
                        <template x-if="!cap.image_url">
                          <div class="w-full h-full flex items-center justify-center text-slate-400">
                            <i data-lucide="image" class="w-8 h-8"></i>
                          </div>
                        </template>
                        
                        <!-- Explore Article Badge -->
                        <div class="absolute top-2 left-2">
                          <span class="px-2 py-0.5 rounded-md text-[9px] font-mono tabular-nums font-bold uppercase bg-slate-950/80 text-purple-300 backdrop-blur-md border border-purple-500/30">
                            EXPLORE ARTICLE
                          </span>
                        </div>

                        <!-- Zoom Hint Overlay on Hover -->
                        <div class="absolute inset-0 bg-slate-950/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center space-x-1.5 text-white text-xs font-mono tabular-nums font-semibold backdrop-blur-[2px]">
                          <i data-lucide="maximize-2" class="w-4 h-4"></i>
                          <span>عرض كامل / تكبير</span>
                        </div>
                      </div>

                      <!-- Query Title -->
                      <div>
                        <h4 class="font-bold text-sm text-slate-900 dark:text-white line-clamp-2 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition" x-text="cap.query_term"></h4>
                        <div class="flex items-center space-x-1.5 text-[10px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-1">
                          <span>Origin:</span>
                          <span class="truncate font-semibold text-slate-700 dark:text-slate-300">BUBBLE_ONE_COL</span>
                        </div>
                      </div>
                    </div>

                    <!-- Action Links & Prompts -->
                    <div class="pt-2 border-t border-slate-200/60 dark:border-[#27272A]/60 space-y-2">
                      <div class="flex items-center space-x-2">
                        <button @click="copyGuidedPrompt(cap.query_term)" class="flex-1 px-2.5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-semibold text-[10px] font-mono tabular-nums transition active:scale-95 flex items-center justify-center space-x-1 shadow-sm">
                          <i data-lucide="copy" class="w-3 h-3"></i>
                          <span>Copy Prompt</span>
                        </button>
                        <a :href="cap.search_url || ('https://www.pinterest.com/search/pins/?q=' + encodeURIComponent(cap.query_term))" target="_blank" class="px-2.5 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[10px] font-mono tabular-nums transition flex items-center justify-center space-x-1" title="Open Pinterest Search">
                          <i data-lucide="external-link" class="w-3 h-3"></i>
                        </a>
                      </div>
                    </div>
                  </div>
                </template>
              </div>

              <!-- Empty State for this Seed -->
              <template x-if="dossierGuidedCapsules.length === 0">
                <div class="p-12 text-center space-y-3 font-mono tabular-nums border border-dashed border-slate-200 dark:border-[#27272A] rounded-2xl">
                  <i data-lucide="compass" class="w-12 h-12 mx-auto text-purple-400"></i>
                  <p class="text-sm font-bold text-slate-800 dark:text-slate-200">لم يتم استخراج كبسولات BUBBLE_ONE_COL لهذا الدبوس حتى الآن.</p>
                  <p class="text-xs text-slate-500 max-w-xl mx-auto">
                    تنبيه خوارزمي: منصة بينترست ترسل كبسولات الاستكشاف الموجه (BUBBLE_ONE_COL) فقط للجلسات الموثقة (Session Cookies)، أو يمكنك استيراد ملف JSON الأصلي مباشرة.
                  </p>
                  <div class="pt-3 flex flex-wrap items-center justify-center gap-3">
                    <button @click="openRawJsonModal(activeDossierSeed.pin_id)" class="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold font-mono tabular-nums transition active:scale-95 inline-flex items-center space-x-2 shadow-sm">
                      <i data-lucide="file-input" class="w-3.5 h-3.5"></i>
                      <span>📥 استيراد ملف JSON الخام (Import Raw JSON)</span>
                    </button>
                    <button @click="isCookieModalOpen = true" class="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-[#27272A] text-xs font-bold font-mono tabular-nums transition active:scale-95 inline-flex items-center space-x-2">
                      <i data-lucide="key" class="w-3.5 h-3.5 text-amber-500"></i>
                      <span>🔑 إعداد كوكيز بينترست (Set Session Cookie)</span>
                    </button>
                    <button @click="triggerCrawl(activeDossierSeed.pin_id)" :disabled="crawlStatus.is_crawling" class="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold font-mono tabular-nums transition active:scale-95 disabled:opacity-50 inline-flex items-center space-x-2">
                      <i data-lucide="refresh-cw" :class="{'animate-spin': crawlStatus.is_crawling}" class="w-3.5 h-3.5"></i>
                      <span>إعادة الزحف (Re-Crawl)</span>
                    </button>
                  </div>
                </div>
              </template>

            </div>
          </div>

        </div>
      </template>
    </div>

    <!-- ======================================================== -->
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
                  <option value="pixie">🏆 Pixie Multi-Hit Score</option>
                  <option value="overlap">🔗 Overlap Depth (Max Seeds)</option>
                  <option value="saves">💾 Total Saves (High to Low)</option>
                  <option value="rate">🔄 Repin Rate % (High to Low)</option>
                  <option value="velocity">⚡ Daily Velocity (Fastest)</option>
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
                  <option value="5">🔥 ≥ 5 Seeds (Golden Core)</option>
                  <option value="7">👑 ≥ 7 Seeds (Mega-Hubs)</option>
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
                  <option value="vacuum">🎯 Vacuum Targets Only (≥ 5K)</option>
                  <option value="product">🛒 Competitor Products</option>
                  <option value="high_rate">⚡ High Repin Rate (≥ 50%)</option>
                  <option value="explosive">🔥 Explosive Velocity (≥ 50/d)</option>
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
                  <img :src="item.image_url" alt="Pin preview" loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" onerror="window.handlePinImgError(this)">
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
                    <span x-text="'🔥 ' + item.seed_overlap_count + ' Seeds'"></span>
                    <span class="text-[9px] opacity-80" x-text="'(' + Math.pow(item.seed_overlap_count, 2) + 'x)'"></span>
                  </span>

                  <!-- Vacuum / Format Badge -->
                  <div class="flex items-center space-x-1">
                    <template x-if="item.is_vacuum_target">
                      <span class="px-2 py-0.5 rounded-lg text-[10px] font-extrabold uppercase bg-emerald-950/85 text-emerald-300 border border-emerald-500/40 backdrop-blur-md shadow-md">
                        🎯 VACUUM
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
                    <a :href="'https://www.pinterest.com/pin/' + item.candidate_pin_id + '/'" target="_blank" class="text-slate-400 hover:text-amber-500 flex-shrink-0 mt-0.5" title="Open on Pinterest">
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
                      <div class="font-bold text-emerald-600 dark:text-emerald-400" x-text="'🔥 ' + item.daily_velocity + '/d'"></div>
                    </template>
                    <template x-if="!Number(item.daily_velocity || 0)">
                      <div class="text-slate-400 text-[10px]">Stagnant</div>
                    </template>
                    <div class="flex items-center space-x-1 mt-0.5">
                      <span class="w-2.5 h-2.5 rounded-full border border-black/20" :style="'background-color: ' + (item.winning_color || '#888')"></span>
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
                          <img :src="item.image_url" alt="pin preview" loading="lazy" class="w-10 h-14 rounded-xl object-cover border-2 shadow-sm group-hover/thumb:scale-110 transition-transform duration-200" :style="'border-color: ' + (item.winning_color || '#cbd5e1')" onerror="window.handlePinImgError(this)">
                        </template>
                        <template x-if="!item.image_url">
                          <div class="w-10 h-14 rounded-xl flex-shrink-0 flex items-center justify-center border-2 shadow-sm" :style="'border-color: ' + (item.winning_color || '#cbd5e1') + '; background-color: ' + (item.winning_color || '#cbd5e1') + '15;'">
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
                            <span class="inline-block px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40">
                              🎯 VACUUM
                            </span>
                          </template>
                        </div>

                        <!-- Ingestion Method Badge -->
                        <template x-if="item.ingestion_method && item.ingestion_method !== 'uploaded'">
                          <div class="text-[8px] font-mono tabular-nums font-bold uppercase tracking-wider text-slate-400">
                            <span class="px-1 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-500" x-text="item.ingestion_method === 'csv_importer' ? '⚙️ CSV Farm' : (item.ingestion_method === 'pin_scheduling' ? '⏱️ Scheduled' : item.ingestion_method)"></span>
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
                      <div class="text-[9px] font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5" x-text="'🔥 ' + item.daily_velocity + '/day'"></div>
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
    </div>

    <!-- ======================================================== -->
    <!-- SUB-TAB 3: 📊 MASTER DATABASE EXPLORER (SEARCH & FILTER) -->
    <!-- ======================================================== -->
    <div x-show="relatedSubTab === 'explorer'" class="space-y-4">
      <div class="bg-white dark:bg-[#18181B] border border-slate-200/90 dark:border-[#27272A] rounded-2xl p-5 shadow-sm dark:shadow-xl space-y-4">
        
        <!-- Master Explorer Filter & Segment Toolbar -->
        <div class="p-3.5 rounded-2xl bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200/80 dark:border-[#27272A]/80 space-y-3">
          <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            
            <!-- Left: Seed Selection & Sorting & Search -->
            <div class="flex items-center space-x-2 flex-wrap gap-y-2">
              <div class="flex items-center space-x-1 bg-white dark:bg-slate-900 rounded-xl px-2 py-1 border border-slate-200 dark:border-[#27272A] shadow-sm">
                <span class="text-[10px] font-mono tabular-nums text-slate-400 uppercase font-semibold">Seed:</span>
                <select x-model="explorerSeedId" @change="loadExplorerData()" class="text-xs bg-transparent text-slate-900 dark:text-slate-100 font-mono tabular-nums focus:outline-none cursor-pointer">
                  <option value="all">All Tracked Seeds</option>
                  <template x-for="s in seeds" :key="s.pin_id">
                    <option :value="s.pin_id" x-text="s.label + ' (' + (s.total_candidates || 0) + ' nodes)'"></option>
                  </template>
                </select>
              </div>

              <div class="flex items-center space-x-1 bg-white dark:bg-slate-900 rounded-xl px-2 py-1 border border-slate-200 dark:border-[#27272A] shadow-sm">
                <span class="text-[10px] font-mono tabular-nums text-slate-400 uppercase font-semibold">Sort:</span>
                <select x-model="explorerSort" @change="loadExplorerData()" class="text-xs bg-transparent text-slate-900 dark:text-slate-100 font-mono tabular-nums focus:outline-none cursor-pointer">
                  <option value="saves">Sort by Total Saves</option>
                  <option value="velocity">Sort by Velocity (Fastest Growing)</option>
                </select>
              </div>

              <!-- Search Input -->
              <div class="relative min-w-[200px]">
                <i data-lucide="search" class="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400"></i>
                <input type="text" x-model="explorerFilters.search" placeholder="Search title, domain, OCR text..." class="w-full pl-8 pr-3 py-1 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] font-mono tabular-nums text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-rose-500">
              </div>

              <!-- Export CSV Button -->
              <button @click="exportCsv(filteredExplorerCandidates, 'master-explorer-candidates.csv')" class="flex items-center space-x-1.5 px-3 py-1 rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold shadow-sm transition active:scale-95">
                <i data-lucide="download" class="w-3.5 h-3.5 text-sky-500"></i>
                <span>Export CSV</span>
              </button>
            </div>

            <!-- Right: 4 Dropdown Filter Selectors -->
            <div class="flex items-center space-x-2 flex-wrap gap-y-2">
              
              <!-- Engine Provenance Filter -->
              <div class="flex items-center space-x-1 bg-white dark:bg-slate-900 rounded-xl px-2 py-1 border border-slate-200 dark:border-[#27272A] shadow-sm">
                <span class="text-[10px] font-mono tabular-nums text-slate-400 uppercase font-semibold">Engine:</span>
                <select x-model="explorerFilters.engine" class="text-xs bg-transparent text-slate-900 dark:text-slate-100 font-mono tabular-nums focus:outline-none cursor-pointer">
                  <option value="all">All Engines</option>
                  <option value="P2P_NAVBOOST">P2P_NAVBOOST (Sky)</option>
                  <option value="P2P_RANDOMWALK">P2P_RANDOMWALK (Emerald)</option>
                  <option value="P2P_TWO_TOWER">P2P_TWO_TOWER (Violet)</option>
                  <option value="P2P_RECGPT">P2P_RECGPT (Rose)</option>
                  <option value="FRESH_COLD_START">FRESH_COLD_START (Cyan)</option>
                  <option value="P2P_SHOPPING_CORPUS">P2P_SHOPPING_CORPUS (Amber)</option>
                </select>
              </div>

              <!-- Velocity Tier Filter -->
              <div class="flex items-center space-x-1 bg-white dark:bg-slate-900 rounded-xl px-2 py-1 border border-slate-200 dark:border-[#27272A] shadow-sm">
                <span class="text-[10px] font-mono tabular-nums text-slate-400 uppercase font-semibold">Speed:</span>
                <select x-model="explorerFilters.velocity" class="text-xs bg-transparent text-slate-900 dark:text-slate-100 font-mono tabular-nums focus:outline-none cursor-pointer">
                  <option value="all">All Speeds</option>
                  <option value="explosive">🔥 Explosive (≥ 50/d)</option>
                  <option value="trending">⚡ Trending (10-49/d)</option>
                  <option value="stagnant">💤 Stagnant (&lt; 10/d)</option>
                </select>
              </div>

              <!-- Market Arbitrage Status Filter -->
              <div class="flex items-center space-x-1 bg-white dark:bg-slate-900 rounded-xl px-2 py-1 border border-slate-200 dark:border-[#27272A] shadow-sm">
                <span class="text-[10px] font-mono tabular-nums text-slate-400 uppercase font-semibold">Market:</span>
                <select x-model="explorerFilters.market" class="text-xs bg-transparent text-slate-900 dark:text-slate-100 font-mono tabular-nums focus:outline-none cursor-pointer">
                  <option value="all">All Statuses</option>
                  <option value="vacuum">🎯 Vacuum Targets Only (Organic ≥ 5K)</option>
                  <option value="product">🛒 Competitor Products (Etsy/Shopify)</option>
                </select>
              </div>

              <!-- RecGPT Meal Sequence Filter -->
              <div class="flex items-center space-x-1 bg-white dark:bg-slate-900 rounded-xl px-2 py-1 border border-slate-200 dark:border-[#27272A] shadow-sm">
                <span class="text-[10px] font-mono tabular-nums text-slate-400 uppercase font-semibold">Sequence:</span>
                <select x-model="explorerFilters.sequence" class="text-xs bg-transparent text-slate-900 dark:text-slate-100 font-mono tabular-nums focus:outline-none cursor-pointer">
                  <option value="all">All Sequence Roles</option>
                  <option value="DESSERT_HERO">🧁 Hero Dessert/Bake</option>
                  <option value="BEVERAGE_PAIRING">☕ Beverage/Pairing</option>
                  <option value="PASTRY_BITES">🥐 Pastry Bites</option>
                  <option value="DINNER_ANCHOR">🍽️ Dinner Anchor</option>
                  <option value="NAVBOOST_CO_VISITOR">🥖 Co-Visitor Side</option>
                  <option value="SESSION_FINISHER">🍪 Session Finisher</option>
                  <option value="PIXIE_DRIFT_OUTLIER">⚠️ Pixie Drift Outlier</option>
                </select>
              </div>

            </div>
          </div>

          <!-- Dynamic Result Count Badge & Reset Button -->
          <div class="flex items-center justify-between pt-1 text-xs border-t border-slate-200/60 dark:border-[#27272A]/60 font-mono tabular-nums">
            <div class="flex items-center space-x-2 text-slate-600 dark:text-slate-300">
              <span class="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                Showing <span class="mx-1 text-rose-600 dark:text-rose-400" x-text="filteredExplorerCandidates.length"></span> of <span class="mx-1" x-text="explorerCandidates.length"></span> candidates matching filters
              </span>
            </div>

            <button 
              x-show="explorerFilters.search || explorerFilters.engine !== 'all' || explorerFilters.velocity !== 'all' || explorerFilters.market !== 'all' || explorerFilters.sequence !== 'all'"
              @click="resetExplorerFilters()"
              class="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 text-[11px] font-bold transition active:scale-95"
            >
              <i data-lucide="rotate-ccw" class="w-3 h-3"></i>
              <span>Reset All Filters</span>
            </button>
          </div>
        </div>

        <!-- Master Candidates Table -->
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs border-collapse">
            <thead>
              <tr class="border-b border-slate-200 dark:border-[#27272A]/80 bg-slate-50/80 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 font-mono tabular-nums text-[11px] uppercase tracking-wider">
                <th class="py-3.5 px-4">Preview & Format</th>
                <th class="py-3.5 px-4 min-w-[240px]">Title & Vision OCR</th>
                <th class="py-3.5 px-4">Origin Seed</th>
                <th class="py-3.5 px-4">Pin Age & Velocity</th>
                <th class="py-3.5 px-4">Metrics</th>
                <th class="py-3.5 px-4">Dominant Color</th>
                <th class="py-3.5 px-4">Engine Provenance</th>
                <th class="py-3.5 px-4">prod:v18 Spread</th>
                <th class="py-3.5 px-4 text-right">Inspect</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60 font-sans">
              <template x-for="item in filteredExplorerCandidates" :key="item.candidate_pin_id + '-' + item.seed_pin_id">
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
                  <td class="py-3.5 px-4 whitespace-nowrap">
                    <div class="flex items-center space-x-2.5">
                      <template x-if="item.image_url">
                        <a :href="'https://www.pinterest.com/pin/' + item.candidate_pin_id + '/'" target="_blank" class="group/thumb block relative flex-shrink-0">
                          <img :src="item.image_url" alt="pin preview" loading="lazy" class="w-8 h-12 rounded-lg object-cover border shadow-sm group-hover/thumb:scale-125 transition-transform duration-200" :style="'border-color: ' + (item.winning_color || '#cbd5e1')" onerror="window.handlePinImgError(this)">
                        </a>
                      </template>
                      <template x-if="!item.image_url">
                        <div class="w-8 h-12 rounded-lg flex-shrink-0 flex items-center justify-center border shadow-sm" :style="'border-color: ' + (item.winning_color || '#cbd5e1') + '; background-color: ' + (item.winning_color || '#cbd5e1') + '15;'">
                          <i data-lucide="image" class="w-4 h-4 text-slate-400"></i>
                        </div>
                      </template>
                      <div class="space-y-1">
                        <div class="flex items-center space-x-1">
                          <span class="inline-block px-1.5 py-0.5 rounded text-[9px] font-mono tabular-nums font-bold tracking-wider uppercase" :class="{
                            'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20': item.format_type === 'PRODUCT CARD',
                            'bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20': item.format_type === 'ORGANIC PIN',
                            'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20': item.format_type === 'VIDEO PIN',
                            'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20': item.format_type === 'IDEA PIN'
                          }" x-text="item.format_type"></span>

                          <template x-if="item.is_vacuum_target">
                            <span class="px-1 py-0.5 rounded text-[8px] font-extrabold uppercase bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/40">
                              VACUUM
                            </span>
                          </template>
                        </div>

                        <!-- Ingestion Method Badge -->
                        <template x-if="item.ingestion_method && item.ingestion_method !== 'uploaded'">
                          <div class="text-[8px] font-mono tabular-nums font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-1">
                            <span class="px-1 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-500" x-text="item.ingestion_method === 'csv_importer' ? '⚙️ CSV Farm' : (item.ingestion_method === 'pin_scheduling' ? '⏱️ Scheduled' : item.ingestion_method)"></span>
                          </div>
                        </template>
                      </div>
                    </div>
                  </td>`,
                  titleHtml: `
                  <!-- 2. Title & OCR -->
                  <td class="py-3.5 px-4">
                    <div class="space-y-1">
                      <a :href="'https://www.pinterest.com/pin/' + item.candidate_pin_id + '/'" target="_blank" class="font-bold text-slate-900 dark:text-slate-100 hover:text-rose-600 dark:hover:text-rose-400 line-clamp-1 hover:underline" x-text="item.title"></a>
                      <div class="flex items-center space-x-2 text-[10px] text-slate-500 font-mono tabular-nums flex-wrap gap-y-1">
                        <span class="px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300" x-text="item.domain"></span>
                        <span>•</span>
                        <span x-text="'ID: ' + item.candidate_pin_id"></span>
                        <template x-if="item.sequence_role && item.sequence_role !== 'DIRECT_MATCH'">
                          <span class="px-1.5 py-0.2 rounded text-[9px] font-bold" :class="{
                            'bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30': item.sequence_role === 'DESSERT_HERO',
                            'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30': item.sequence_role === 'BEVERAGE_PAIRING',
                            'bg-teal-500/15 text-teal-700 dark:text-teal-300 border border-teal-500/30': item.sequence_role === 'PASTRY_BITES',
                            'bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30': item.sequence_role === 'DINNER_ANCHOR',
                            'bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30': item.sequence_role === 'NAVBOOST_CO_VISITOR',
                            'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30': item.sequence_role === 'SESSION_FINISHER',
                            'bg-red-500/20 text-red-700 dark:text-red-300 border border-red-500/40 font-extrabold': item.sequence_role === 'PIXIE_DRIFT_OUTLIER'
                          }" x-text="{
                            'DESSERT_HERO': '🧁 Hero Bake',
                            'BEVERAGE_PAIRING': '☕ Pairing',
                            'PASTRY_BITES': '🥐 Bites',
                            'DINNER_ANCHOR': '🍽️ Anchor',
                            'NAVBOOST_CO_VISITOR': '🥖 Co-Visitor',
                            'SESSION_FINISHER': '🍪 Finisher',
                            'PIXIE_DRIFT_OUTLIER': '⚠️ Pixie Drift'
                          }[item.sequence_role] || item.sequence_role"></span>
                        </template>
                      </div>
                      <template x-if="item.ocr_text">
                        <div class="p-1 px-1.5 rounded bg-slate-100 dark:bg-slate-900/90 text-[10px] text-slate-600 dark:text-slate-400 font-mono tabular-nums truncate max-w-sm" :title="item.ocr_text">
                          <span class="text-rose-500 font-bold">OCR:</span> <span x-text="item.ocr_text"></span>
                        </div>
                      </template>
                    </div>
                  </td>`,
                  extraCellsAfterTitle: `
                  <!-- 3. Origin Seed -->
                  <td class="py-3.5 px-4 whitespace-nowrap font-mono tabular-nums text-xs">
                    <span class="text-slate-500" x-text="'Seed: '"></span>
                    <strong class="text-slate-800 dark:text-slate-200" x-text="item.seed_pin_id"></strong>
                  </td>`,
                  velocityHtml: `
                  <!-- 4. Pin Age & Velocity -->
                  <td class="py-3.5 px-4 whitespace-nowrap font-mono tabular-nums">
                    <div class="text-[11px] text-slate-500 dark:text-slate-400" x-text="item.age_display || (item.age_days ? (item.age_days < 30 ? item.age_days + 'd ago' : (item.age_days < 365 ? Math.floor(item.age_days / 30) + 'mo ago' : (item.age_days / 365).toFixed(1) + 'y ago')) : '1d ago')"></div>
                    <div class="mt-0.5">
                      <template x-if="Number(item.daily_velocity || 0) >= 50">
                        <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40" x-text="'🔥 ' + item.daily_velocity + '/day (Explosive)'"></span>
                      </template>
                      <template x-if="Number(item.daily_velocity || 0) >= 10 && Number(item.daily_velocity || 0) < 50">
                        <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30" x-text="'⚡ ' + item.daily_velocity + '/day (Trending)'"></span>
                      </template>
                      <template x-if="Number(item.daily_velocity || 0) < 10">
                        <span class="px-1.5 py-0.5 rounded text-[9px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-[#27272A]" x-text="item.daily_velocity + '/day (Stagnant)'"></span>
                      </template>
                    </div>
                  </td>`,
                  savesHtml: `
                  <!-- 5. Metrics -->
                  <td class="py-3.5 px-4 whitespace-nowrap font-mono tabular-nums">
                    <div class="font-bold text-slate-900 dark:text-white" x-text="Number(item.total_saves != null ? item.total_saves : (item.saves || 0)).toLocaleString() + ' saves'"></div>
                    <div class="text-[10px] text-slate-500" x-text="Number(item.total_repins != null ? item.total_repins : (item.repins || 0)).toLocaleString() + ' repins • ' + (item.avg_save_rate != null ? item.avg_save_rate : (item.save_rate != null ? item.save_rate : 0)) + '% rate'"></div>
                  </td>`,
                  extraCellsBeforeActions: `
                  <!-- 6. Dominant Color Swatch -->
                  <td class="py-3.5 px-4 whitespace-nowrap">
                    <div class="flex items-center space-x-2">
                      <span class="w-4 h-4 rounded border flex-shrink-0 shadow-sm" :style="'background-color: ' + (item.winning_color || item.dominant_color || '#888888')"></span>
                      <div class="space-y-0.5 min-w-0">
                        <div class="font-mono tabular-nums text-[10px] font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide" x-text="item.winning_color || item.dominant_color || '#888888'"></div>
                        <div class="text-[9px] text-slate-500 dark:text-slate-400 font-medium truncate max-w-[140px]" x-text="item.culinary_color_name || 'Culinary Accent'" :title="item.culinary_color_name"></div>
                      </div>
                    </div>
                  </td>

                  <!-- 7. Engine Provenance -->
                  <td class="py-3.5 px-4 whitespace-nowrap">
                    <span class="px-2 py-0.5 rounded text-[10px] font-mono tabular-nums font-bold uppercase" :class="{
                      'bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20': item.engine_source === 'P2P_NAVBOOST',
                      'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20': item.engine_source === 'P2P_RANDOMWALK',
                      'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20': item.engine_source === 'P2P_RECGPT',
                      'bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20': item.engine_source === 'P2P_TWO_TOWER',
                      'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20': item.engine_source === 'P2P_SHOPPING_CORPUS',
                      'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20': item.engine_source === 'FRESH_COLD_START'
                    }" x-text="item.engine_source"></span>
                  </td>

                  <!-- 8. prod:v18 Spread -->
                  <td class="py-3.5 px-4 whitespace-nowrap font-mono tabular-nums">
                    <template x-if="!item.is_product">
                      <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30" x-text="'+' + (item.prod_spread || 220.8) + ' Net Leverage'"></span>
                    </template>
                    <template x-if="item.is_product">
                      <span class="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-[#27272A]">0.0 Net</span>
                    </template>
                  </td>`,
                  actionsHtml: `
                  <!-- 9. Inspect Action -->
                  <td class="py-3.5 px-4 text-right whitespace-nowrap">
                    <button @click="inspectCandidate(item)" class="p-1.5 rounded-lg bg-slate-100 hover:bg-rose-50 dark:bg-slate-800 dark:hover:bg-rose-950/40 text-slate-700 dark:text-slate-300 hover:text-rose-600 transition">
                      <i data-lucide="eye" class="w-4 h-4"></i>
                    </button>
                  </td>`
                })}
              </template>
            </tbody>
          </table>
        </div>

      </div>
    </div>
    </div>
`;
}
