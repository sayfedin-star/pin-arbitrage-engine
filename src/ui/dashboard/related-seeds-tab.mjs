/**
 * Related Pins Hub — Sub-Tab 1: Tracked Seeds & Dedicated Seed Dossier
 * Uses shared related-candidates-table.mjs in 'dossier' mode.
 */
import {
  renderRelatedCandidatesToolbar,
  renderRelatedCandidatesTable
} from './related-candidates-table.mjs';

export function renderRelatedSeedsTab() {
  return `      <!-- Sub-Tab 1: 📁 TRACKED SEEDS (GRID & DEDICATED SEED DOSSIER) -->
      <div x-show="relatedSubTab === 'seeds'" class="space-y-6">

      <!-- View A: Modern Grid & Table of Tracked Seeds -->
      <template x-if="!activeDossierSeed">
        <div class="space-y-4">
          <!-- Top Overview & Stats Bar -->
          <div class="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white dark:bg-[#18181B] p-4 rounded-2xl border border-slate-200/90 dark:border-[#27272A] shadow-sm">
            <div>
              <h2 class="text-base font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                <i data-lucide="layers" class="w-4 h-4 text-rose-500"></i>
                <span>Tracked Seeds in PostgreSQL Database</span>
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
                <span x-show="isAllSeedsSelected" class="inline-flex items-center justify-center"><i data-lucide="check-square" class="w-3.5 h-3.5 text-rose-600"></i></span>
                <span x-show="!isAllSeedsSelected" class="inline-flex items-center justify-center"><i data-lucide="square" class="w-3.5 h-3.5 text-slate-400"></i></span>
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
                <span>Crawl Selected (<span x-text="selectedSeedIds.length"></span>)</span>
              </button>

              <!-- Delete Selected from Database -->
              <button @click="openDeleteModal('selected')" class="px-3 py-1.5 rounded-xl bg-rose-700 hover:bg-rose-600 text-white text-xs font-bold transition flex items-center space-x-1.5 shadow-sm active:scale-95">
                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                <span>Delete & Purge DB</span>
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
                  <button @click.stop="openCrawlModal(seed.pin_id)" class="p-2 rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 transition active:scale-95" title="Crawl this seed">
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
                          <button @click.stop="openCrawlModal(seed.pin_id)" class="p-1.5 rounded-lg border border-amber-200 dark:border-amber-900/40 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 transition" title="Crawl this seed">
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
                <span>Import Raw JSON</span>
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
                    Pinterest's causal sequential transformer predicts user transition probabilities between meal courses. These 3 candidate nodes are dynamically extracted from PostgreSQL for active seed <span class="font-mono tabular-nums text-rose-500" x-text="activeDossierSeed.pin_id"></span>.
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
                          <strong class="text-emerald-600 inline-flex items-center gap-1"><i data-lucide="zap" class="w-3 h-3 shrink-0"></i><span x-text="recgptPlaybook?.dinner_anchor?.daily_velocity + '/day'"></span></strong>
                        </div>
                      </template>
                    </div>
                  </div>

                  <button @click="inspectCandidate(recgptPlaybook?.dinner_anchor)" class="w-full py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition active:scale-95 flex items-center justify-center space-x-1.5 shadow-sm">
                    <i data-lucide="zap" class="w-3.5 h-3.5"></i>
                    <span>Generate Pin Asset</span>
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
                          <strong class="text-emerald-600 inline-flex items-center gap-1"><i data-lucide="zap" class="w-3 h-3 shrink-0"></i><span x-text="recgptPlaybook?.navboost_co_visitor?.daily_velocity + '/day'"></span></strong>
                        </div>
                      </template>
                    </div>
                  </div>

                  <button @click="inspectCandidate(recgptPlaybook?.navboost_co_visitor)" class="w-full py-2 px-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs transition active:scale-95 flex items-center justify-center space-x-1.5 shadow-sm">
                    <i data-lucide="zap" class="w-3.5 h-3.5"></i>
                    <span>Generate Pin Asset</span>
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
                          <strong class="text-emerald-600 inline-flex items-center gap-1"><i data-lucide="zap" class="w-3 h-3 shrink-0"></i><span x-text="recgptPlaybook?.session_finisher?.daily_velocity + '/day'"></span></strong>
                        </div>
                      </template>
                    </div>
                  </div>

                  <button @click="inspectCandidate(recgptPlaybook?.session_finisher)" class="w-full py-2 px-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs transition active:scale-95 flex items-center justify-center space-x-1.5 shadow-sm">
                    <i data-lucide="zap" class="w-3.5 h-3.5"></i>
                    <span>Generate Pin Asset</span>
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
            ${renderRelatedCandidatesToolbar({
              filterObj: 'dossierFilters',
              filteredListExpr: 'filteredDossierCandidates',
              totalListExpr: 'dossierCandidates',
              resetExpr: 'resetDossierFilters()',
              showSearchInput: true,
              searchPlaceholder: 'Search title, domain, OCR text, or pin ID...'
            })}

            ${renderRelatedCandidatesTable({
              mode: 'dossier',
              listExpr: 'filteredDossierCandidates',
              keyExpr: 'item.candidate_pin_id',
              showOriginSeedColumn: false,
              cellPaddingClass: 'py-3 px-3',
              titleMinWidthClass: 'min-w-[220px]',
              ocrTextClass: 'text-[9px]'
            })}
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
                        <a :href="safeUrl(cap.search_url || ('https://www.pinterest.com/search/pins/?q=' + encodeURIComponent(cap.query_term)))" target="_blank" rel="noopener noreferrer" class="px-2.5 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[10px] font-mono tabular-nums transition flex items-center justify-center space-x-1" title="Open Pinterest Search">
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
                      <span>استيراد ملف JSON الخام (Import Raw JSON)</span>
                    </button>
                    <button @click="isCookieModalOpen = true" class="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-[#27272A] text-xs font-bold font-mono tabular-nums transition active:scale-95 inline-flex items-center space-x-2">
                      <i data-lucide="key" class="w-3.5 h-3.5 text-amber-500"></i>
                      <span>إعداد كوكيز بينترست (Set Session Cookie)</span>
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
    </div>`;
}
