/**
 * Creator Hub — View A: All Creators Overview & Global PinArchive Ledger
 * Preserves [INVARIANT: FOLDER-COMPETITOR-TOTALS], [INVARIANT: PINNING-CADENCE],
 * and [INVARIANT: TOGGLE-CREATOR-TRACKING].
 */
import { renderCampaignWorkspaceHeader } from '../campaign-workspace-header.mjs';

export function renderCreatorsLedgerView({ safeFolderId = '' } = {}) {
  return `      <!-- ======================================================== -->
      <!-- VIEW A: ALL CREATORS OVERVIEW & GLOBAL PINARCHIVE        -->
      <!-- ======================================================== -->
      <template x-if="!activeCreator">
        <div class="space-y-6">
          ${safeFolderId ? renderCampaignWorkspaceHeader({ activeRoom: 'creators', folderId: safeFolderId }) : ''}
          
          <!-- Unified Header Section (Global Scope) -->
          <template x-if="!scopedFolderId">
            <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div class="flex items-center space-x-3">
                <div class="h-11 w-11 rounded-2xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-rose-600 text-white flex items-center justify-center shadow-md shadow-indigo-950/20">
                  <i data-lucide="users" class="w-6 h-6"></i>
                </div>
                <div>
                  <div class="flex items-center space-x-2">
                    <h2 class="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">Creator Hub</h2>
                    <span class="px-2 py-0.5 text-[10px] font-bold uppercase rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30">Unified Engine</span>
                  </div>
                  <p class="text-xs text-slate-500 dark:text-slate-400">Track creator impressions, total audience, boards, and winning pins.</p>
                </div>
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <a href="/watchlist" class="px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-100 hover:bg-slate-200 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-slate-800 dark:text-slate-200 transition flex items-center space-x-1.5 shadow-xs">
                  <i data-lucide="bookmark" class="w-3.5 h-3.5 text-rose-500"></i>
                  <span>Watchlist Modes</span>
                </a>
                <button @click="exportCompetitorsCsv()" class="px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition flex items-center space-x-1.5 shadow-sm">
                  <i data-lucide="download" class="w-3.5 h-3.5"></i>
                  <span>Export CSV</span>
                </button>
                <button @click="syncAllCompetitors()" :disabled="isLoading" class="px-3.5 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition flex items-center space-x-1.5 shadow-sm shadow-emerald-950/20 active:scale-95">
                  <i data-lucide="refresh-cw" :class="{'animate-spin': isLoading}" class="w-3.5 h-3.5"></i>
                  <span>Run Full Update</span>
                </button>
                <button @click="openAddCompetitorModal()" class="px-3.5 py-2 text-xs font-bold rounded-xl bg-gradient-to-r bg-rose-600 hover:bg-rose-500 text-white transition flex items-center space-x-1.5 shadow-md shadow-indigo-950/20 active:scale-95">
                  <i data-lucide="user-plus" class="w-3.5 h-3.5"></i>
                  <span>+ Track Creator</span>
                </button>
              </div>
            </div>
          </template>

          <!-- Campaign Folder Scoped Control Bar -->
          <template x-if="scopedFolderId">
            <div class="flex flex-col gap-3 p-3.5 rounded-2xl bg-white dark:bg-[#121215] border border-slate-200/80 dark:border-[#27272A] shadow-sm">
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div class="flex items-center gap-2.5">
                  <div class="h-9 w-9 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold">
                    <i data-lucide="users" class="w-5 h-5"></i>
                  </div>
                  <div>
                    <div class="flex items-center gap-2">
                      <span class="text-xs font-bold text-slate-800 dark:text-slate-200 font-mono tabular-nums">Campaign Creators</span>
                      <span class="px-2 py-0.5 rounded-full text-[10px] font-mono tabular-nums font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20" x-text="(filteredCompetitors ? filteredCompetitors.length : 0) + ' Total'"></span>
                    </div>
                    <p class="text-[11px] text-slate-500 dark:text-slate-400">Creators tracked and monitored specifically for this campaign folder.</p>
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <button @click="openAssignExistingCreatorModal()" class="px-3 py-1.5 text-xs font-bold rounded-xl border border-purple-200 dark:border-purple-800/80 bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/40 transition flex items-center space-x-1.5 shadow-sm cursor-pointer">
                    <i data-lucide="user-check" class="w-3.5 h-3.5"></i>
                    <span>+ Assign Existing Creators</span>
                  </button>
                  <button @click="openAddCompetitorModal()" class="px-3 py-1.5 text-xs font-bold rounded-xl bg-gradient-to-r bg-rose-600 hover:bg-rose-500 text-white transition flex items-center space-x-1.5 shadow-sm cursor-pointer active:scale-95">
                    <i data-lucide="user-plus" class="w-3.5 h-3.5"></i>
                    <span>+ Track New Creator</span>
                  </button>
                </div>
              </div>
              <!-- Bulk Pulse Track SERP Creators Bar -->
              <div class="flex flex-col sm:flex-row items-center justify-between gap-2.5 pt-2.5 border-t border-slate-100 dark:border-[#27272A]/60">
                <div class="flex items-center gap-2 w-full sm:w-auto flex-1">
                  <span class="text-[11px] font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">Custom Label:</span>
                  <input type="text" x-model="bulkPulseCustomLabel" :placeholder="'SERP Auto • ' + (activeFolder?.name || 'Folder')" class="px-3 py-1 text-xs rounded-xl bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A] text-slate-800 dark:text-slate-200 w-full sm:max-w-xs focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono">
                </div>
                <div class="flex items-center gap-2 w-full sm:w-auto">
                  <button @click="bulkPulseTrackSerpCreators()" :disabled="isBulkPulseTracking" class="w-full sm:w-auto px-3.5 py-1.5 text-xs font-bold rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 transition flex items-center justify-center space-x-1.5 shadow-xs cursor-pointer disabled:opacity-50 active:scale-95 whitespace-nowrap">
                    <i data-lucide="zap" class="w-3.5 h-3.5 text-amber-500" :class="isBulkPulseTracking ? 'animate-spin' : ''"></i>
                    <span x-text="isBulkPulseTracking ? 'Auto-Tracking...' : 'Auto-Track All SERP Creators (Lightweight 24h Pulse)'"></span>
                  </button>
                </div>
              </div>
            </div>
          </template>

          <!-- Folder-Wide Competitor Summary Totals Bar [INVARIANT: FOLDER-COMPETITOR-TOTALS] -->
          <template x-if="scopedFolderId">
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-2xl bg-white dark:bg-[#121215] border border-slate-200/80 dark:border-[#27272A] shadow-xs font-mono tabular-nums folderCompetitorTotals">
              <div class="flex flex-col gap-0.5">
                <span class="text-[10px] uppercase text-slate-500 dark:text-[#71717A] font-bold">Combined Audience</span>
                <span class="text-base font-bold text-slate-900 dark:text-white" x-text="formatNumber(folderCompetitorTotals?.combined_audience || totalAudienceSum || 0)">0</span>
                <span class="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold" x-text="(folderCompetitorTotals?.delta_24h ? ('+' + formatNumber(folderCompetitorTotals.delta_24h) + ' 24h') : '+0 24h')">+0 24h</span>
              </div>
              <div class="flex flex-col gap-0.5">
                <span class="text-[10px] uppercase text-slate-500 dark:text-[#71717A] font-bold">Combined Impressions</span>
                <span class="text-base font-bold text-slate-900 dark:text-white" x-text="formatNumber(folderCompetitorTotals?.combined_impressions || 0)">0</span>
                <span class="text-[10px] text-slate-400">Impressions</span>
              </div>
              <div class="flex flex-col gap-0.5">
                <span class="text-[10px] uppercase text-slate-500 dark:text-[#71717A] font-bold">Combined Catalog Pins</span>
                <span class="text-base font-bold text-slate-900 dark:text-white" x-text="formatNumber(folderCompetitorTotals?.combined_pins || 0)">0</span>
                <span class="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold" x-text="(folderCompetitorTotals?.total_creators || (filteredCompetitors ? filteredCompetitors.length : 0)) + ' Creators'"></span>
              </div>
              <div class="flex flex-col gap-0.5">
                <span class="text-[10px] uppercase text-slate-500 dark:text-[#71717A] font-bold">Avg Pinning Cadence</span>
                <span class="text-base font-bold text-slate-900 dark:text-white" x-text="(folderCompetitorTotals?.avg_pinning_cadence || 0) + ' Pins / Day'">0 Pins / Day</span>
                <span class="text-[10px] text-slate-400">Velocity</span>
              </div>
            </div>
          </template>

      <!-- ======================================================== -->
      <!-- CREATOR HUB: 👥 TRACKED CREATORS TABLE                   -->
      <!-- ======================================================== -->
      <div class="space-y-4">
        <div class="p-4 rounded-2xl bg-white dark:bg-[#121215] border border-slate-200/80 dark:border-[#27272A] space-y-4 shadow-sm">
          <div class="flex flex-col sm:flex-row items-center justify-between gap-3 border-b border-slate-200 dark:border-[#27272A]/80 pb-3">
            <!-- Filter Tabs & Auto-Discovery Toggle -->
            <div class="flex items-center space-x-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl text-xs font-semibold flex-wrap">
              <button @click="competitorFilter = 'all'" class="px-3 py-1.5 rounded-lg transition" :class="competitorFilter === 'all' ? 'bg-white dark:bg-[#121215] text-slate-900 dark:text-white shadow-sm font-bold' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'">All Profiles</button>
              <button @click="competitorFilter = 'own'" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition" :class="competitorFilter === 'own' ? 'bg-white dark:bg-[#121215] text-slate-900 dark:text-white shadow-sm font-bold' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'"><i data-lucide="user" class="w-3.5 h-3.5 shrink-0"></i><span>My Accounts</span></button>
              <button @click="competitorFilter = 'competitor'" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition" :class="competitorFilter === 'competitor' ? 'bg-white dark:bg-[#121215] text-slate-900 dark:text-white shadow-sm font-bold' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'"><i data-lucide="target" class="w-3.5 h-3.5 shrink-0"></i><span>Competitors</span></button>
              <button @click="competitorFilter = 'paused'" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition" :class="competitorFilter === 'paused' ? 'bg-white dark:bg-[#121215] text-amber-600 dark:text-amber-400 shadow-sm font-bold' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'"><i data-lucide="pause" class="w-3.5 h-3.5 shrink-0"></i><span>Paused</span></button>
              <template x-if="scopedFolderId || folderFilter">
                <div class="flex items-center space-x-1 pl-1 border-l border-slate-200 dark:border-[#27272A]">
                  <button @click="creatorDiscoveryFilter = 'all'" :class="creatorDiscoveryFilter === 'all' ? 'bg-white dark:bg-[#121215] text-slate-900 dark:text-white shadow-xs font-bold' : 'text-slate-400 hover:text-slate-600'" class="px-2 py-1 rounded-md transition text-[11px]">All</button>
                  <button @click="creatorDiscoveryFilter = 'tracked'" :class="creatorDiscoveryFilter === 'tracked' ? 'bg-white dark:bg-[#121215] text-purple-600 dark:text-purple-400 shadow-xs font-bold' : 'text-slate-400 hover:text-slate-600'" class="px-2 py-1 rounded-md transition text-[11px]">Tracked</button>
                  <button @click="creatorDiscoveryFilter = 'auto_discovered'" :class="creatorDiscoveryFilter === 'auto_discovered' ? 'bg-white dark:bg-[#121215] text-indigo-600 dark:text-indigo-400 shadow-xs font-bold' : 'text-slate-400 hover:text-slate-600'" class="px-2 py-1 rounded-md transition text-[11px]">Auto-Discovered</button>
                </div>
              </template>
              <template x-if="scopedFolderId || folderFilter">
                <div class="flex items-center space-x-1 pl-1 border-l border-slate-200 dark:border-[#27272A]">
                  <button @click="setVaultScope('high_signal')" :class="vaultScope === 'high_signal' ? 'bg-white dark:bg-[#121215] text-rose-600 dark:text-rose-400 shadow-xs font-bold' : 'text-slate-400 hover:text-slate-600'" class="inline-flex items-center gap-1 px-2 py-1 rounded-md transition text-[11px]" title="High-Signal Vault: Pins with &gt;=5 saves, rank &lt;=50, or creators with &gt;=2 pins"><i data-lucide="target" class="w-3 h-3 shrink-0"></i><span>High-Signal</span></button>
                  <button @click="setVaultScope('all')" :class="vaultScope === 'all' ? 'bg-white dark:bg-[#121215] text-purple-600 dark:text-purple-400 shadow-xs font-bold' : 'text-slate-400 hover:text-slate-600'" class="inline-flex items-center gap-1 px-2 py-1 rounded-md transition text-[11px]" title="All Vault Pins: 100% of discovered creators including long-tail vault"><i data-lucide="globe" class="w-3 h-3 shrink-0"></i><span>All Vault</span></button>
                </div>
              </template>
            </div>

            <!-- Campaign Folder Filter Dropdown (hidden when already scoped to a Campaign Workspace) -->
            <template x-if="!scopedFolderId">
              <div class="flex items-center gap-1.5 text-xs">
                <span class="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400 font-mono tabular-nums"><i data-lucide="folder" class="w-3.5 h-3.5 shrink-0"></i><span>Folder:</span></span>
                <select x-model="folderFilter" @change="onFolderFilterChange()" class="py-1 px-2.5 text-xs rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-purple-500 font-mono tabular-nums cursor-pointer">
                  <option value="">All Folders</option>
                  <template x-for="f in foldersList" :key="f.id">
                    <option :value="String(f.id)" :selected="String(f.id) === String(folderFilter || scopedFolderId)" x-text="f.name + ' (' + (f.discovered_creator_count || f.creator_count || 0) + ')'"></option>
                  </template>
                </select>
              </div>
            </template>

            <!-- Sort Selector -->
            <div class="flex items-center gap-1.5 text-xs">
              <span class="text-slate-500 dark:text-slate-400 font-mono tabular-nums">⬍ Sort:</span>
              <select x-model="competitorSort" class="py-1 px-2.5 text-xs rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-purple-500 font-mono tabular-nums cursor-pointer">
                <option value="audience_desc">Total Audience (High → Low)</option>
                <option value="gain_24h_desc">Top Audience Gain (24h)</option>
                <option value="gain_7d_desc">Top Audience Gain (7d)</option>
                <option value="impressions_desc">Impressions (High → Low)</option>
                <option value="impressions_24h_desc">Top Impressions Gain (24h)</option>
                <option value="impressions_7d_desc">Top Impressions Gain (7d)</option>
                <option value="pins_desc">Total Pins (High → Low)</option>
              </select>
            </div>

            <!-- Search Bar -->
            <div class="flex items-center space-x-2 w-full sm:w-auto">
              <div class="relative w-full sm:w-64">
                <i data-lucide="search" class="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"></i>
                <input type="text" x-model.debounce.150ms="competitorSearch" placeholder="Search handle, name, tag..." class="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500/50">
              </div>
              <span class="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 whitespace-nowrap" x-text="filteredCompetitors.length + ' Profiles'"></span>
            </div>
          </div>

          <!-- Bulk Action Toolbar -->
          <div x-show="selectedCompetitorIds.length > 0" x-transition class="mb-3 p-3 rounded-2xl bg-gradient-to-r from-purple-50 via-indigo-50 to-slate-50 dark:from-purple-900/30 dark:via-indigo-900/30 dark:to-slate-900/50 border border-purple-200 dark:border-purple-500/30 backdrop-blur-md flex flex-wrap items-center justify-between gap-3 shadow-lg">
            <div class="flex items-center gap-2 pl-1">
              <span class="flex h-6 w-6 items-center justify-center rounded-lg bg-purple-500/20 text-purple-600 dark:text-purple-400 font-bold text-xs">✓</span>
              <span class="text-xs font-bold text-slate-900 dark:text-white font-mono tabular-nums" x-text="selectedCompetitorIds.length + ' Profile(s) Selected'"></span>
              <button @click="clearSelectedCompetitors()" class="text-[11px] text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white underline ml-2 cursor-pointer">Deselect All</button>
            </div>
            <div class="flex items-center gap-2 flex-wrap">
              <!-- ⚡ Pulse Selected -->
              <button @click="bulkPulseSelected()" class="px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:bg-amber-500/20 dark:hover:bg-amber-500/30 dark:text-amber-300 border border-amber-500/30 dark:border-amber-500/40 transition flex items-center gap-1.5 cursor-pointer shadow-sm" title="Instant Edge Pulse for selected creators (syncs Impressions & Total Audience)">
                <i data-lucide="zap" class="w-3.5 h-3.5 text-amber-600 dark:text-amber-400"></i>
                <span>Pulse Selected</span>
              </button>
              <!-- 🏆 Refresh Winners Selected -->
              <button @click="bulkRefreshWinnersSelected()" class="px-3 py-1.5 rounded-xl text-xs font-bold bg-purple-500/15 hover:bg-purple-500/25 text-purple-700 dark:bg-purple-500/20 dark:hover:bg-purple-500/30 dark:text-purple-300 border border-purple-500/30 dark:border-purple-500/40 transition flex items-center gap-1.5 cursor-pointer shadow-sm" title="Dispatch winning pins refresh for selected creators on GitHub Actions">
                <i data-lucide="award" class="w-3.5 h-3.5 text-purple-600 dark:text-purple-400"></i>
                <span>Refresh Winners Selected</span>
              </button>
              <!-- 🚀 Fleet Crawl Selected -->
              <button @click="bulkOpenFleetCrawlModal()" class="px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-700 dark:bg-indigo-500/20 dark:hover:bg-indigo-500/30 dark:text-indigo-300 border border-indigo-500/30 dark:border-indigo-500/40 transition flex items-center gap-1.5 cursor-pointer shadow-sm" title="Launch distributed fleet crawl for selected creators on GitHub Actions">
                <i data-lucide="rocket" class="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400"></i>
                <span>Fleet Crawl Selected</span>
              </button>
              <!-- Pause -->
              <button @click="bulkToggleSelectedStatus(false)" class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800/80 dark:hover:bg-slate-700 dark:text-slate-300 dark:border-slate-700 transition cursor-pointer" title="Pause ingestion for selected creators">
                <i data-lucide="pause" class="w-3 h-3 shrink-0"></i>
                <span>Pause</span>
              </button>
              <!-- Resume -->
              <button @click="bulkToggleSelectedStatus(true)" class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800/80 dark:hover:bg-slate-700 dark:text-slate-300 dark:border-slate-700 transition cursor-pointer" title="Resume ingestion for selected creators">
                <i data-lucide="play" class="w-3 h-3 shrink-0"></i>
                <span>Resume</span>
              </button>
              <!-- Delete -->
              <button @click="bulkDeleteSelectedCompetitors()" class="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-rose-500/15 hover:bg-rose-500/25 text-rose-700 border border-rose-500/30 dark:bg-rose-500/20 dark:hover:bg-rose-500/30 dark:text-rose-300 transition cursor-pointer" title="Delete selected competitors">
                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
              </button>
            </div>
          </div>

          <!-- Competitor Table -->
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead>
                <tr class="border-b border-slate-200 dark:border-[#27272A]/80 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <th class="py-3 px-3 w-8"><input type="checkbox" :checked="isAllCompetitorsSelected" @change="toggleSelectAllCompetitors()" class="rounded border-slate-300 dark:border-[#27272A] text-purple-600 cursor-pointer"></th>
                  <th class="py-3 px-3">Profile</th>
                  <th class="py-3 px-3 text-right">Total audience</th>
                  <th class="py-3 px-3 text-right">Impressions</th>
                  <th class="py-3 px-3 text-right">Total Pins</th>
                  <th class="py-3 px-3 text-center">Boards</th>
                  <th class="py-3 px-3 text-center">Activity</th>
                  <th class="py-3 px-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono tabular-nums">
                <template x-for="c in paginatedCompetitors" :key="c.id || ('serp_' + (c.username || 'unknown'))">
                  <tr class="hover:bg-slate-50/80 dark:hover:bg-slate-900/40 transition" :class="c.is_active === false ? 'opacity-75 bg-amber-500/[0.03] dark:bg-amber-500/[0.05]' : ''">
                    <td class="py-3 px-3"><input type="checkbox" :checked="selectedCompetitorIds.includes(Number(c.id))" @change="toggleSelectCompetitor(c.id)" class="rounded border-slate-300 dark:border-[#27272A] text-purple-600 cursor-pointer"></td>
                    <td class="py-3 px-3 font-sans">
                      <div class="flex items-center space-x-2.5 cursor-pointer" @click="openCreatorDossier(c)">
                        <img :src="c.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=64&h=64&fit=crop&crop=face'" class="w-8 h-8 rounded-full object-cover border border-slate-200 dark:border-[#27272A] hover:scale-105 transition">
                        <div>
                          <div class="font-bold text-slate-900 dark:text-white hover:text-purple-600 dark:hover:text-purple-400 flex items-center space-x-1 flex-wrap">
                            <span x-text="'@' + c.username"></span>
                            <i data-lucide="external-link" class="w-3 h-3 text-slate-400"></i>
                            <template x-if="c.is_active === false">
                              <span class="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 whitespace-nowrap"><i data-lucide="pause" class="w-2.5 h-2.5 shrink-0"></i><span>Paused</span></span>
                            </template>
                            <template x-if="c.tracking_mode === 'pulse_only'">
                              <span class="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 whitespace-nowrap"><i data-lucide="zap" class="w-2.5 h-2.5 shrink-0"></i><span>Pulse Only</span></span>
                            </template>
                            <template x-if="c.custom_label">
                              <span class="text-[9px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 whitespace-nowrap" x-text="c.custom_label"></span>
                            </template>
                            <template x-if="c.has_active_pins && c.has_vault_pins">
                              <span class="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 whitespace-nowrap" :title="'Active SERP (' + (c.active_pin_count || 0) + ') + Vault (' + (c.vault_pin_count || 0) + ')'"><span class="w-2 h-2 rounded-full bg-sky-500 inline-block shrink-0" aria-hidden="true"></span><span>Dual</span></span>
                            </template>
                            <template x-if="c.has_active_pins && !c.has_vault_pins">
                              <span class="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 whitespace-nowrap" :title="'Active SERP (' + (c.active_pin_count || 0) + ' pins)'"><span class="w-2 h-2 rounded-full bg-emerald-500 inline-block shrink-0" aria-hidden="true"></span><span>Active</span></span>
                            </template>
                            <template x-if="!c.has_active_pins && c.has_vault_pins">
                              <span class="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 whitespace-nowrap" :title="'Displaced Vault (' + (c.vault_pin_count || 0) + ' pins)'"><span class="w-2 h-2 rounded-full bg-purple-500 inline-block shrink-0" aria-hidden="true"></span><span>Vault</span></span>
                            </template>
                          </div>
                          <div class="text-[10px] text-slate-500 truncate max-w-[200px]" x-text="(c.pin_count > 0 && (scopedFolderId || folderFilter)) ? ((c.display_name || c.username) + ' • ' + c.pin_count + ' folder pins') : (c.display_name || c.username)"></div>
                        </div>
                      </div>
                    </td>
                    <td class="py-3 px-3 text-right">
                      <div class="inline-flex items-center justify-end gap-1">
                        <span class="font-bold text-slate-900 dark:text-white" x-text="formatNumber(c.monthly_reach)"></span>
                        <template x-if="Number(c.monthly_reach) === 10000001">
                          <span class="text-[9px] font-bold px-1 py-0.2 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30" title="Pinterest 10M+ public API ceiling">10M+</span>
                        </template>
                      </div>
                      <!-- 24h & 7d Deltas -->
                      <div class="flex items-center justify-end gap-1 text-[10px] font-mono tabular-nums">
                        <template x-if="(c.delta_reach_24h != null && c.delta_reach_24h !== 0) || (c.delta_24h != null && c.delta_24h !== 0)">
                          <span :class="(c.delta_reach_24h || c.delta_24h) > 0 ? 'text-emerald-500 font-semibold' : 'text-rose-500 font-semibold'" x-text="((c.delta_reach_24h || c.delta_24h) > 0 ? '+' : '') + formatNumber(c.delta_reach_24h || c.delta_24h) + ' 24h'"></span>
                        </template>
                        <template x-if="c.reach_delta_7d != null && c.reach_delta_7d !== 0">
                          <span :class="c.reach_delta_7d > 0 ? 'text-sky-500' : 'text-rose-400'" x-text="(c.reach_delta_7d > 0 ? '(+' : '(') + formatNumber(c.reach_delta_7d) + ' 7d)'"></span>
                        </template>
                      </div>
                    </td>
                    <td class="py-3 px-3 text-right">
                      <div class="inline-flex items-center justify-end gap-1">
                        <span class="text-slate-700 dark:text-slate-300 font-bold" x-text="formatNumber(c.profile_views)"></span>
                        <template x-if="Number(c.profile_views) === 10000001">
                          <span class="text-[9px] font-bold px-1 py-0.2 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30" title="Pinterest 10M+ public API ceiling">10M+</span>
                        </template>
                      </div>
                      <div class="flex items-center justify-end gap-1 text-[10px] font-mono tabular-nums">
                        <template x-if="c.delta_views_24h != null && c.delta_views_24h !== 0">
                          <span :class="c.delta_views_24h > 0 ? 'text-emerald-500 font-semibold' : 'text-rose-500 font-semibold'" x-text="(c.delta_views_24h > 0 ? '+' : '') + formatNumber(c.delta_views_24h) + ' 24h'"></span>
                        </template>
                        <template x-if="c.views_delta_7d != null && c.views_delta_7d !== 0">
                          <span :class="c.views_delta_7d > 0 ? 'text-sky-500' : 'text-rose-400'" x-text="(c.views_delta_7d > 0 ? '(+' : '(') + formatNumber(c.views_delta_7d) + ' 7d)'"></span>
                        </template>
                      </div>
                    </td>
                    <td class="py-3 px-3 text-right font-bold text-slate-800 dark:text-slate-200">
                      <span x-text="formatNumber(c.total_pins)"></span>
                      <div class="flex items-center justify-end gap-1 text-[10px] font-mono tabular-nums font-normal">
                        <template x-if="c.delta_pins_24h != null && c.delta_pins_24h !== 0">
                          <span :class="c.delta_pins_24h > 0 ? 'text-emerald-500 font-semibold' : 'text-rose-500 font-semibold'" x-text="(c.delta_pins_24h > 0 ? '+' : '') + formatNumber(c.delta_pins_24h) + ' 24h'"></span>
                        </template>
                        <template x-if="c.pins_delta_7d != null && c.pins_delta_7d !== 0">
                          <span :class="c.pins_delta_7d > 0 ? 'text-sky-500' : 'text-rose-400'" x-text="(c.pins_delta_7d > 0 ? '(+' : '(') + formatNumber(c.pins_delta_7d) + ' 7d)'"></span>
                        </template>
                      </div>
                      <!-- Pinning Cadence (Pins / Day) [INVARIANT: PINNING-CADENCE] -->
                      <div class="text-[10px] text-slate-400 font-mono tabular-nums font-normal" x-text="(c.pins_per_day || (c.total_pins ? (c.total_pins / 365).toFixed(1) : 0)) + ' Pins / Day'">0 Pins / Day</div>
                    </td>
                    <td class="py-3 px-3 text-center">
                      <button @click="openBoardsModal(c)" class="px-2.5 py-1 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-700 dark:text-purple-300 font-bold text-[11px] transition flex items-center justify-center space-x-1.5 mx-auto border border-purple-500/30 active:scale-95" title="Click to view boards breakdown & activity">
                        <span x-text="formatNumber(c.total_boards)"></span>
                        <i data-lucide="layout-grid" class="w-3 h-3 text-purple-500"></i>
                      </button>
                      <div class="flex items-center justify-center gap-1 text-[9px] font-mono tabular-nums mt-0.5">
                        <template x-if="c.delta_boards_24h != null && c.delta_boards_24h !== 0">
                          <span :class="c.delta_boards_24h > 0 ? 'text-emerald-500' : 'text-rose-500'" x-text="(c.delta_boards_24h > 0 ? '+' : '') + formatNumber(c.delta_boards_24h) + ' 24h'"></span>
                        </template>
                        <template x-if="c.boards_delta_7d != null && c.boards_delta_7d !== 0">
                          <span :class="c.boards_delta_7d > 0 ? 'text-sky-500' : 'text-rose-400'" x-text="(c.boards_delta_7d > 0 ? '(+' : '(') + formatNumber(c.boards_delta_7d) + ' 7d)'"></span>
                        </template>
                      </div>
                    </td>
                    <td class="py-3 px-3 text-center">
                      <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 whitespace-nowrap" x-text="'• ' + (c.activity_status || '1d ago')"></span>
                    </td>
                    <td class="py-3 px-3 text-center">
                      <div class="flex items-center justify-center space-x-1">
                        <!-- 1-Click Track / Auto-Discovered Toggle [INVARIANT: TOGGLE-CREATOR-TRACKING] -->
                        <button @click.stop="toggleCreatorTracking(c)"
                                class="p-1.5 rounded-lg border transition cursor-pointer"
                                :class="c.is_tracked !== false ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30' : 'bg-slate-100 dark:bg-[#18181B] text-slate-400 border-slate-200 dark:border-[#27272A]'"
                                :title="c.is_tracked !== false ? 'Actively tracked in folder. Click to untrack' : 'Auto-discovered in SERP. Click to track'">
                          <span x-show="c.is_tracked !== false" class="inline-flex items-center justify-center"><i data-lucide="user-check" class="w-3.5 h-3.5"></i></span>
                          <span x-show="c.is_tracked === false" class="inline-flex items-center justify-center"><i data-lucide="user-plus" class="w-3.5 h-3.5"></i></span>
                        </button>
                        <!-- Inspect Dossier -->
                        <button @click.stop="openCreatorDossier(c)" class="p-1.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 transition cursor-pointer" title="Inspect Creator Dossier (Analytics, Pins & URLs)">
                          <i data-lucide="eye" class="w-3.5 h-3.5"></i>
                        </button>
                        <!-- ⚡ Instant 50-Pin Visual Feed (<350ms) -->
                        <button @click.stop="openCreatorVisualFeed(c.username)" class="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 transition cursor-pointer" title="Instant 50-Pin Visual Feed (&lt;350ms): Direct HD Visual Feed">
                          <i data-lucide="layout-grid" class="w-3.5 h-3.5 text-emerald-500"></i>
                        </button>
                        <!-- ⚡ Quick Pulse (~2s Edge) -->
                        <button @click.stop="quickPulseCreatorAction(c)" :disabled="pulsingCreatorId === c.id" class="px-2 py-1 text-[11px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 rounded-lg border border-amber-500/30 transition flex items-center space-x-1 cursor-pointer disabled:opacity-50" title="Pulse Profile (~2s): Instant Edge sync of Impressions, Total Audience & Boards">
                          <i data-lucide="zap" class="w-3 h-3 text-amber-500" :class="pulsingCreatorId === c.id ? 'animate-spin' : ''"></i>
                          <span x-text="pulsingCreatorId === c.id ? 'Pulsing...' : 'Pulse'"></span>
                        </button>
                        <!-- 🏆 Refresh Winners (GitHub Actions) -->
                        <button @click.stop="dispatchRefreshWinnersAction(c)" class="p-1.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 border border-purple-500/30 transition cursor-pointer" title="Refresh Winners: Dispatch background refresh of winning pin stats on GitHub Actions">
                          <i data-lucide="award" class="w-3.5 h-3.5 text-purple-500"></i>
                        </button>
                        <!-- 🚀 Fleet Crawl (GitHub Actions with Modal) -->
                        <button @click.stop="openGhaCrawlerModal(c)" class="p-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30 transition cursor-pointer" title="Fleet Crawl: Launch distributed crawler on GitHub Actions (Recent Pins vs Full Catalog)">
                          <i data-lucide="rocket" class="w-3.5 h-3.5 text-indigo-500"></i>
                        </button>
                        <!-- Send to Workspace Watchlist -->
                        <button type="button" @click.stop="addCreatorToWatchlist(c)" class="p-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30 transition cursor-pointer" title="Send Creator to Workspace Watchlist">
                          <i data-lucide="bookmark-plus" class="w-3.5 h-3.5"></i>
                        </button>
                        <!-- Folder Assignment Menu -->
                        <div class="relative inline-block text-left" x-data="{ openFolderMenu: false }">
                          <button @click.stop="openFolderMenu = !openFolderMenu" class="p-1.5 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-950/40 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition cursor-pointer" title="Assign to Campaign Folder">
                            <i data-lucide="folder-plus" class="w-3.5 h-3.5"></i>
                          </button>
                          <template x-if="openFolderMenu">
                            <div @click.away="openFolderMenu = false" class="absolute right-0 z-50 mt-1 w-48 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] shadow-xl py-1 text-xs text-left">
                              <div class="px-3 py-1.5 text-[10px] font-mono tabular-nums uppercase text-slate-400 border-b border-slate-100 dark:border-[#27272A]">
                                Assign to Folder
                              </div>
                              <template x-for="f in foldersList" :key="f.id">
                                <button @click.stop="assignCreatorToFolder(c.id, f.id); openFolderMenu = false" class="w-full text-left px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-300 flex items-center justify-between transition-colors cursor-pointer">
                                  <span class="truncate" x-text="f.name"></span>
                                  <span class="text-[10px] text-indigo-500 font-mono tabular-nums" x-show="isCreatorInFolder(c.id, f.id)">✓</span>
                                </button>
                              </template>
                              <div x-show="!foldersList.length" class="px-3 py-2 text-slate-400 text-[11px]">
                                No folders available
                              </div>
                            </div>
                          </template>
                        </div>
                        <!-- Delete Competitor -->
                        <button @click.stop="deleteCompetitor(c.id)" class="p-1.5 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-950/40 text-slate-400 hover:text-rose-500 transition cursor-pointer" title="Delete competitor">
                          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                </template>
              </tbody>
              <tfoot class="border-t-2 border-slate-200 dark:border-[#27272A] font-bold text-slate-900 dark:text-white font-mono tabular-nums">
                <tr>
                  <td></td>
                  <td class="py-3 px-3 font-sans" x-text="'Totals (' + filteredCompetitors.length + ')'"></td>
                  <td class="py-3 px-3 text-right text-emerald-600 dark:text-emerald-400" x-text="formatNumber(filteredCompetitorsReach)"></td>
                  <td class="py-3 px-3 text-right text-sky-600 dark:text-sky-400" x-text="formatNumber(filteredCompetitorsAudience)"></td>
                  <td class="py-3 px-3 text-right text-amber-600 dark:text-amber-400" x-text="formatNumber(filteredCompetitorsPins)"></td>
                  <td colspan="3"></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <!-- Windowed Pagination Controls (LND-806) -->
          <div class="px-4 py-3 border-t border-slate-200 dark:border-[#27272A] bg-slate-50/50 dark:bg-[#18181B]/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div class="flex items-center gap-3">
              <span class="text-slate-500 font-mono tabular-nums text-[11px]"
                    x-text="'Showing ' + (filteredCompetitors.length === 0 ? 0 : ((competitorPage - 1) * competitorPageSize + 1)) + '-' + Math.min(competitorPage * competitorPageSize, filteredCompetitors.length) + ' of ' + filteredCompetitors.length + ' Creators'"></span>
              <div class="flex items-center gap-1.5 text-slate-500 text-[11px]">
                <span>Show:</span>
                <select x-model.number="competitorPageSize" @change="competitorPage = 1" class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-lg px-2 py-0.5 text-xs text-slate-700 dark:text-slate-300 font-mono cursor-pointer">
                  <option :value="25">25</option>
                  <option :value="50">50</option>
                  <option :value="100">100</option>
                </select>
              </div>
            </div>
            <div class="flex items-center gap-1.5" x-show="totalCompetitorPages > 1">
              <button @click="competitorPage = Math.max(1, competitorPage - 1)"
                      :disabled="competitorPage <= 1"
                      class="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] text-slate-700 dark:text-slate-300 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-[#18181B] font-mono tabular-nums text-xs font-semibold transition cursor-pointer">
                Prev
              </button>
              <span class="px-2 py-1 text-slate-500 font-mono tabular-nums text-xs"
                    x-text="'Page ' + competitorPage + ' of ' + totalCompetitorPages"></span>
              <button @click="competitorPage = Math.min(totalCompetitorPages, competitorPage + 1)"
                      :disabled="competitorPage >= totalCompetitorPages"
                      class="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] text-slate-700 dark:text-slate-300 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-[#18181B] font-mono tabular-nums text-xs font-semibold transition cursor-pointer">
                Next
              </button>
            </div>
          </div>
        </div>
      </div>

    </div>
  </template>`;
}
