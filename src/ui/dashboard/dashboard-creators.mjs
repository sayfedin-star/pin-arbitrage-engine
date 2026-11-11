/**
 * Creator Hub & PinArchive
 * View A: Tracked Creators Ledger & KPI ribbons
 * View B: Dedicated Creator Profile Page (Overview, All Pins, Top URLs, Boards Strategy)
 */
import { renderCampaignWorkspaceHeader } from '../campaign-workspace-header.mjs';

export function getDashboardCreatorsHtml({ safeFolderId = '' } = {}) {
  return `    <!-- ======================================================== -->
    <!-- TAB 4: 🕵️ COMPETITOR INTELLIGENCE (LIVE MONITOR)          -->
    <!-- Matches User Image 2 Reference UI                        -->
    <!-- ======================================================== -->
    <!-- ======================================================== -->
    <!-- TAB 4: 👥 CREATOR INTELLIGENCE & PINARCHIVE (UNIFIED PAGE)-->
    <!-- Unified Creator Tracking, Boards, and Winning Pin Archive -->
    <!-- ======================================================== -->
    <div x-show="currentTab === 'creators_archive' || currentTab === 'competitors' || currentTab === 'pinarchive'" x-cloak class="space-y-6">
      
      <!-- ======================================================== -->
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
                <button @click="openAutoPromoteSettingsModal()" class="px-3.5 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-100 hover:bg-slate-200 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-slate-800 dark:text-slate-200 transition flex items-center space-x-1.5 shadow-xs cursor-pointer active:scale-95" title="Configure Auto-Promote & Breakout Rules">
                  <i data-lucide="sliders" class="w-3.5 h-3.5 text-rose-500"></i>
                  <span>Auto-Promote Rules</span>
                </button>
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
                  <button @click="openAutoPromoteSettingsModal()" class="px-3 py-1.5 text-xs font-bold rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-100 hover:bg-slate-200 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-slate-800 dark:text-slate-200 transition flex items-center space-x-1.5 shadow-xs cursor-pointer active:scale-95 whitespace-nowrap" title="Configure Auto-Promote & Breakout Rules">
                    <i data-lucide="sliders" class="w-3.5 h-3.5 text-rose-500"></i>
                    <span>Rules</span>
                  </button>
                  <button @click="bulkPulseTrackSerpCreators()" :disabled="isBulkPulseTracking" class="w-full sm:w-auto px-3.5 py-1.5 text-xs font-bold rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 transition flex items-center justify-center space-x-1.5 shadow-xs cursor-pointer disabled:opacity-50 active:scale-95 whitespace-nowrap">
                    <i data-lucide="zap" class="w-3.5 h-3.5 text-amber-500" :class="isBulkPulseTracking ? 'animate-spin' : ''"></i>
                    <span x-text="isBulkPulseTracking ? '⚡ Auto-Tracking...' : '⚡ Auto-Track All SERP Creators (Lightweight 24h Pulse)'"></span>
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
                <span class="text-[10px] text-slate-400">Total Profile Views</span>
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
              <button @click="competitorFilter = 'own'" class="px-3 py-1.5 rounded-lg transition" :class="competitorFilter === 'own' ? 'bg-white dark:bg-[#121215] text-slate-900 dark:text-white shadow-sm font-bold' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'">👤 My Accounts</button>
              <button @click="competitorFilter = 'competitor'" class="px-3 py-1.5 rounded-lg transition" :class="competitorFilter === 'competitor' ? 'bg-white dark:bg-[#121215] text-slate-900 dark:text-white shadow-sm font-bold' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'">🎯 Competitors</button>
              <button @click="competitorFilter = 'paused'" class="px-3 py-1.5 rounded-lg transition" :class="competitorFilter === 'paused' ? 'bg-white dark:bg-[#121215] text-amber-600 dark:text-amber-400 shadow-sm font-bold' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'">⏸ Paused</button>
              <template x-if="scopedFolderId || folderFilter">
                <div class="flex items-center space-x-1 pl-1 border-l border-slate-200 dark:border-[#27272A]">
                  <button @click="creatorDiscoveryFilter = 'all'" :class="creatorDiscoveryFilter === 'all' ? 'bg-white dark:bg-[#121215] text-slate-900 dark:text-white shadow-xs font-bold' : 'text-slate-400 hover:text-slate-600'" class="px-2 py-1 rounded-md transition text-[11px]">All</button>
                  <button @click="creatorDiscoveryFilter = 'tracked'" :class="creatorDiscoveryFilter === 'tracked' ? 'bg-white dark:bg-[#121215] text-purple-600 dark:text-purple-400 shadow-xs font-bold' : 'text-slate-400 hover:text-slate-600'" class="px-2 py-1 rounded-md transition text-[11px]">Tracked</button>
                  <button @click="creatorDiscoveryFilter = 'auto_discovered'" :class="creatorDiscoveryFilter === 'auto_discovered' ? 'bg-white dark:bg-[#121215] text-indigo-600 dark:text-indigo-400 shadow-xs font-bold' : 'text-slate-400 hover:text-slate-600'" class="px-2 py-1 rounded-md transition text-[11px]">Auto-Discovered</button>
                </div>
              </template>
              <template x-if="scopedFolderId || folderFilter">
                <div class="flex items-center space-x-1 pl-1 border-l border-slate-200 dark:border-[#27272A]">
                  <button @click="setVaultScope('high_signal')" :class="vaultScope === 'high_signal' ? 'bg-white dark:bg-[#121215] text-rose-600 dark:text-rose-400 shadow-xs font-bold' : 'text-slate-400 hover:text-slate-600'" class="px-2 py-1 rounded-md transition text-[11px]" title="High-Signal Vault: Pins with &gt;=5 saves, rank &lt;=50, or creators with &gt;=2 pins">🎯 High-Signal</button>
                  <button @click="setVaultScope('all')" :class="vaultScope === 'all' ? 'bg-white dark:bg-[#121215] text-purple-600 dark:text-purple-400 shadow-xs font-bold' : 'text-slate-400 hover:text-slate-600'" class="px-2 py-1 rounded-md transition text-[11px]" title="All Vault Pins: 100% of discovered creators including long-tail vault">🌐 All Vault</button>
                </div>
              </template>
            </div>

            <!-- Campaign Folder Filter Dropdown -->
            <div class="flex items-center gap-1.5 text-xs">
              <span class="text-slate-500 dark:text-slate-400 font-mono tabular-nums">📁 Folder:</span>
              <select x-model="folderFilter" @change="onFolderFilterChange()" class="py-1 px-2.5 text-xs rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-purple-500 font-mono tabular-nums cursor-pointer">
                <option value="">All Folders</option>
                <template x-for="f in foldersList" :key="f.id">
                  <option :value="String(f.id)" :selected="String(f.id) === String(folderFilter || scopedFolderId)" x-text="f.name + ' (' + (f.discovered_creator_count || f.creator_count || 0) + ')'"></option>
                </template>
              </select>
            </div>

            <!-- Sort Selector -->
            <div class="flex items-center gap-1.5 text-xs">
              <span class="text-slate-500 dark:text-slate-400 font-mono tabular-nums">⬍ Sort:</span>
              <select x-model="competitorSort" class="py-1 px-2.5 text-xs rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-purple-500 font-mono tabular-nums cursor-pointer">
                <option value="audience_desc">Total Audience (High → Low)</option>
                <option value="gain_24h_desc">🔥 Top Audience Gain (24h)</option>
                <option value="gain_7d_desc">🚀 Top Audience Gain (7d)</option>
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
          <div x-show="selectedCompetitorIds.length > 0" x-transition class="mb-3 p-3 rounded-2xl bg-gradient-to-r from-purple-900/30 via-indigo-900/30 to-slate-900/50 border border-purple-500/30 backdrop-blur-md flex flex-wrap items-center justify-between gap-3 shadow-lg">
            <div class="flex items-center gap-2 pl-1">
              <span class="flex h-6 w-6 items-center justify-center rounded-lg bg-purple-500/20 text-purple-400 font-bold text-xs">✓</span>
              <span class="text-xs font-bold text-white font-mono tabular-nums" x-text="selectedCompetitorIds.length + ' Profile(s) Selected'"></span>
              <button @click="clearSelectedCompetitors()" class="text-[11px] text-slate-400 hover:text-white underline ml-2 cursor-pointer">Deselect All</button>
            </div>
            <div class="flex items-center gap-2 flex-wrap">
              <!-- ⚡ Pulse Selected -->
              <button @click="bulkPulseSelected()" class="px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 transition flex items-center gap-1.5 cursor-pointer shadow-sm" title="Instant Edge Pulse for selected creators (syncs Impressions & Total Audience)">
                <i data-lucide="zap" class="w-3.5 h-3.5 text-amber-400"></i>
                <span>⚡ Pulse Selected</span>
              </button>
              <!-- 🏆 Refresh Winners Selected -->
              <button @click="bulkRefreshWinnersSelected()" class="px-3 py-1.5 rounded-xl text-xs font-bold bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 transition flex items-center gap-1.5 cursor-pointer shadow-sm" title="Dispatch winning pins refresh for selected creators on GitHub Actions">
                <i data-lucide="award" class="w-3.5 h-3.5 text-purple-400"></i>
                <span>🏆 Refresh Winners Selected</span>
              </button>
              <!-- 🚀 Fleet Crawl Selected -->
              <button @click="bulkOpenFleetCrawlModal()" class="px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/40 transition flex items-center gap-1.5 cursor-pointer shadow-sm" title="Launch distributed fleet crawl for selected creators on GitHub Actions">
                <i data-lucide="rocket" class="w-3.5 h-3.5 text-indigo-400"></i>
                <span>🚀 Fleet Crawl Selected</span>
              </button>
              <!-- Pause -->
              <button @click="bulkToggleSelectedStatus(false)" class="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer" title="Pause ingestion for selected creators">
                <span>⏸ Pause</span>
              </button>
              <!-- Resume -->
              <button @click="bulkToggleSelectedStatus(true)" class="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer" title="Resume ingestion for selected creators">
                <span>▶ Resume</span>
              </button>
              <!-- Delete -->
              <button @click="bulkDeleteSelectedCompetitors()" class="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 transition cursor-pointer" title="Delete selected competitors">
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
                              <span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 whitespace-nowrap">⏸ Paused</span>
                            </template>
                            <template x-if="c.tracking_mode === 'pulse_only'">
                              <span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 whitespace-nowrap">⚡ Pulse Only</span>
                            </template>
                            <template x-if="c.custom_label">
                              <span class="text-[9px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 whitespace-nowrap" x-text="c.custom_label"></span>
                            </template>
                            <template x-if="c.has_active_pins && c.has_vault_pins">
                              <span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 whitespace-nowrap" :title="'Active SERP (' + (c.active_pin_count || 0) + ') + Vault (' + (c.vault_pin_count || 0) + ')'">🔵 Dual</span>
                            </template>
                            <template x-if="c.has_active_pins && !c.has_vault_pins">
                              <span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 whitespace-nowrap" :title="'Active SERP (' + (c.active_pin_count || 0) + ' pins)'">🟢 Active</span>
                            </template>
                            <template x-if="!c.has_active_pins && c.has_vault_pins">
                              <span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 whitespace-nowrap" :title="'Displaced Vault (' + (c.vault_pin_count || 0) + ' pins)'">🟣 Vault</span>
                            </template>
                            <template x-if="c._shard_name && selectedProject === 'all'">
                              <span class="text-[9px] font-mono tabular-nums px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20" x-text="c._shard_name.replace('pin-arbitrage-', '')"></span>
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
                          <i :data-lucide="c.is_tracked !== false ? 'user-check' : 'user-plus'" class="w-3.5 h-3.5"></i>
                        </button>
                        <!-- Inspect Dossier -->
                        <button @click.stop="openCreatorDossier(c)" class="p-1.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 transition cursor-pointer" title="Inspect Creator Dossier (Analytics, Pins & URLs)">
                          <i data-lucide="eye" class="w-3.5 h-3.5"></i>
                        </button>
                        <!-- ⚡ Instant 50-Pin Visual Feed (<350ms) -->
                        <button @click.stop="openCreatorVisualFeed(c.username)" class="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 transition cursor-pointer" title="⚡ Instant 50-Pin Visual Feed (&lt;350ms): Direct HD Visual Feed">
                          <i data-lucide="layout-grid" class="w-3.5 h-3.5 text-emerald-500"></i>
                        </button>
                        <!-- ⚡ Quick Pulse (~2s Edge) -->
                        <button @click.stop="quickPulseCreatorAction(c)" :disabled="pulsingCreatorId === c.id" class="px-2 py-1 text-[11px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 rounded-lg border border-amber-500/30 transition flex items-center space-x-1 cursor-pointer disabled:opacity-50" title="⚡ Pulse Profile (~2s): Instant Edge sync of Impressions, Total Audience & Boards">
                          <i data-lucide="zap" class="w-3 h-3 text-amber-500" :class="pulsingCreatorId === c.id ? 'animate-spin' : ''"></i>
                          <span x-text="pulsingCreatorId === c.id ? 'Pulsing...' : 'Pulse'"></span>
                        </button>
                        <!-- 🏆 Refresh Winners (GitHub Actions) -->
                        <button @click.stop="dispatchRefreshWinnersAction(c)" class="p-1.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 border border-purple-500/30 transition cursor-pointer" title="🏆 Refresh Winners: Dispatch background refresh of winning pin stats on GitHub Actions">
                          <i data-lucide="award" class="w-3.5 h-3.5 text-purple-500"></i>
                        </button>
                        <!-- 🚀 Fleet Crawl (GitHub Actions with Modal) -->
                        <button @click.stop="openGhaCrawlerModal(c)" class="p-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30 transition cursor-pointer" title="🚀 Fleet Crawl: Launch distributed crawler on GitHub Actions (Recent Pins vs Full Catalog)">
                          <i data-lucide="rocket" class="w-3.5 h-3.5 text-indigo-500"></i>
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
  </template>

            <!-- ======================================================== -->
      <!-- VIEW B: INDEPENDENT CREATOR PAGE (DEDICATED FULL VIEW)    -->
      <!-- Pixel-by-Pixel Parity with pinorbit-v2 & User Images 1-3  -->
      <!-- ======================================================== -->
      <template x-if="activeCreator">
        <div class="space-y-6 animate-in fade-in duration-200">
          
          <!-- ═══ Top Navigation & Primary Action Controls (Image 3) ═══ -->
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <button @click="closeCreatorProfile()" class="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition group cursor-pointer">
              <i data-lucide="arrow-left" class="w-4 h-4 transition-transform group-hover:-translate-x-0.5"></i>
              <span>← Back to Creator Hub</span>
            </button>

            <!-- Action Toolbar -->
            <div class="flex items-center gap-2 flex-wrap self-start sm:self-auto">
              <a :href="'https://www.pinterest.com/' + (activeCreator.username || '').replace(/^@+/, '') + '/'" target="_blank" rel="noopener noreferrer" class="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] px-3 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition shadow-2xs">
                <span>View on Pinterest</span>
                <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
              </a>

              <!-- ⚡ Quick Pulse (~2s Edge) -->
              <button @click="quickPulseCreatorAction(activeCreator)" :disabled="pulsingCreatorId === activeCreator.id" class="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 text-xs font-bold text-amber-700 dark:text-amber-400 hover:bg-amber-500/20 transition shadow-2xs cursor-pointer disabled:opacity-50" title="⚡ Pulse Profile (~2s): Instant Edge sync of Impressions, Total Audience & Boards">
                <i data-lucide="zap" class="w-3.5 h-3.5 text-amber-500" :class="pulsingCreatorId === activeCreator.id ? 'animate-spin' : ''"></i>
                <span x-text="pulsingCreatorId === activeCreator.id ? 'Pulsing...' : 'Pulse Profile'"></span>
              </button>

              <!-- 🏆 Refresh Winners (GitHub Actions) -->
              <button @click="dispatchRefreshWinnersAction(activeCreator)" class="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-purple-500/30 bg-purple-500/10 px-3 text-xs font-bold text-purple-700 dark:text-purple-300 hover:bg-purple-500/20 transition shadow-2xs cursor-pointer" title="🏆 Refresh Winners: Dispatch background refresh of winning pin stats on GitHub Actions">
                <i data-lucide="award" class="w-3.5 h-3.5 text-purple-500"></i>
                <span>Refresh Winners</span>
              </button>

              <!-- 🚀 Fleet Crawl (GitHub Actions) -->
              <button @click="openGhaCrawlerModal(activeCreator)" :disabled="isDispatchingGitHubCrawl" class="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white px-3.5 text-xs font-bold transition shadow-md cursor-pointer disabled:opacity-50" title="Launch Distributed Fleet Crawler on GitHub Actions (Recent Pins vs Full Catalog)">
                <i data-lucide="rocket" class="w-3.5 h-3.5" :class="isDispatchingGitHubCrawl ? 'animate-spin' : ''"></i>
                <span x-text="isDispatchingGitHubCrawl ? 'Dispatching...' : 'Fleet Crawl'"></span>
              </button>

              <!-- Pause / Resume -->
              <button @click="toggleCompetitorStatus(activeCreator)" class="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] px-3 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition shadow-2xs cursor-pointer" :title="activeCreator.is_active === false ? 'Resume Ingestion' : 'Pause Ingestion'">
                <template x-if="activeCreator.is_active === false">
                  <span class="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><polygon points="6 3 20 12 6 21 6 3"/></svg>
                    <span>Resume</span>
                  </span>
                </template>
                <template x-if="activeCreator.is_active !== false">
                  <span class="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/></svg>
                    <span>Pause</span>
                  </span>
                </template>
              </button>
            </div>
          </div>

          <!-- ═══ Profile Hero Card (Image 1 & 3) ═══ -->
          <div class="rounded-3xl border border-slate-200/90 dark:border-[#27272A] bg-white dark:bg-[#18181B] p-5 sm:p-6 shadow-xs relative overflow-hidden">
            <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
              
              <!-- Left: Avatar & Meta -->
              <div class="flex items-start gap-4">
                <div class="relative">
                  <img
                    :src="activeCreator.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&h=200&q=80'"
                    alt="Avatar"
                    class="h-16 w-16 rounded-2xl object-cover border border-slate-200 dark:border-[#27272A] shadow-2xs flex-shrink-0 bg-slate-100 dark:bg-slate-800"
                  />
                </div>

                <div class="space-y-1.5 min-w-0">
                  <div class="flex flex-wrap items-center gap-2.5">
                    <h1 class="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white" x-text="(activeCreator.username || '').replace(/^@+/, '')"></h1>
                    <span class="rounded-full bg-purple-500/10 px-2.5 py-0.5 text-[11px] font-bold text-purple-600 dark:text-purple-400 border border-purple-500/20" x-text="activeCreator.account_type === 'own' ? '🎯 Own Account' : '🎯 Competitor'"></span>
                    <span class="rounded-full bg-rose-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-rose-600 dark:text-rose-400 border border-rose-500/20">General</span>
                    <span x-show="activeCreator.is_active === false" class="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-bold text-amber-600 dark:text-amber-400 border border-amber-500/30">⏸ Ingest Paused</span>
                    <span x-show="activeCreator.is_active !== false" class="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">🟢 Active Ingest</span>
                  </div>

                  <div class="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span class="font-medium text-slate-900 dark:text-slate-100" x-text="'@' + (activeCreator.username || '').replace(/^@+/, '')"></span>
                    <span>•</span>
                    <a :href="'https://www.pinterest.com/' + (activeCreator.username || '').replace(/^@+/, '') + '/'" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 font-semibold text-rose-500 hover:underline">
                      <span>View on Pinterest</span>
                      <i data-lucide="external-link" class="w-3 h-3"></i>
                    </a>
                    <template x-if="activeCreatorDetail?.profile?.website_domain">
                      <span class="inline-flex items-center gap-1.5">
                        <span>•</span>
                        <i data-lucide="globe" class="w-3 h-3 text-slate-400"></i>
                        <span class="font-medium text-slate-900 dark:text-slate-100" x-text="activeCreatorDetail.profile.website_domain"></span>
                        <span x-show="activeCreatorDetail.profile.verified_domain" class="rounded-full bg-emerald-500/10 px-2 py-0.2 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">✓ Verified Domain</span>
                      </span>
                    </template>
                    <span>•</span>
                    <span class="text-[11px] text-slate-400" x-text="'Last Pin: ' + (activeCreatorDetail?.profile?.last_pin_date || '—')"></span>
                  </div>

                  <p class="text-xs text-slate-500 dark:text-slate-400 pt-0.5 max-w-2xl" x-text="activeCreatorDetail?.profile?.notes || 'No internal notes set for this competitor.'"></p>
                </div>
              </div>

              <!-- Right: High-Density Quick Stat Summary -->
              <div class="flex items-center gap-3 self-start lg:self-auto">
                <div class="flex items-center gap-3 bg-slate-50 dark:bg-slate-900/60 rounded-2xl px-4 py-2.5 border border-slate-200/80 dark:border-[#27272A] shadow-2xs">
                  <div class="text-right">
                    <span class="text-[10px] font-mono tabular-nums text-slate-400 uppercase tracking-wider block">Total Catalog</span>
                    <span class="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white font-mono tabular-nums" x-text="formatNumber(activeCreator.total_pins || activeCreatorCatalogTotal || 0)"></span>
                  </div>
                  <div class="h-6 w-px bg-slate-200 dark:bg-slate-800"></div>
                  <div class="text-left">
                    <span class="text-[10px] font-mono tabular-nums text-slate-400 uppercase tracking-wider block">Followers</span>
                    <span class="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white font-mono tabular-nums" x-text="formatNumber(activeCreator.follower_count || 0)"></span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- ═══ Per-Account 3-Tier Qualification Rules Card ═══ -->
          <div class="rounded-3xl border border-slate-200/90 dark:border-[#27272A] bg-white dark:bg-[#18181B] p-5 sm:p-6 shadow-xs relative overflow-hidden" x-data="{ isRulesOpen: false }">
            <div class="flex items-center justify-between cursor-pointer" @click="isRulesOpen = !isRulesOpen">
              <div class="flex items-center gap-3">
                <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
                  <i data-lucide="sliders" class="w-5 h-5"></i>
                </div>
                <div>
                  <div class="flex items-center gap-2">
                    <h3 class="text-sm font-extrabold text-slate-900 dark:text-white">Account Qualification Rules</h3>
                    <span class="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">Active Profile</span>
                  </div>
                  <p class="text-xs text-slate-500 dark:text-slate-400">Configure independent 3-tier winning pin thresholds and product filtering specifically for @<span x-text="(activeCreator.username || '').replace(/^@+/, '')"></span>.</p>
                </div>
              </div>
              <button class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-2 rounded-lg cursor-pointer">
                <i data-lucide="chevron-down" class="w-5 h-5 transition-transform" :class="isRulesOpen ? 'rotate-180' : ''"></i>
              </button>
            </div>

            <!-- Expandable Rules Form -->
            <div x-show="isRulesOpen" x-transition class="mt-5 pt-5 border-t border-slate-200/80 dark:border-[#27272A]/80 space-y-4">
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                
                <!-- Tier 1: Saves -->
                <div class="rounded-2xl bg-slate-50 dark:bg-slate-900/50 p-3.5 border border-slate-200/60 dark:border-[#27272A]/60">
                  <div class="flex items-center justify-between mb-1.5">
                    <span class="text-[11px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">Tier 1: Min Saves</span>
                    <i data-lucide="bookmark" class="w-3.5 h-3.5 text-amber-500"></i>
                  </div>
                  <input type="number" x-model.number="creatorRules.tier1_min_saves" class="w-full h-9 rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] px-3 text-xs font-bold text-slate-900 dark:text-white" placeholder="100" />
                  <span class="text-[10px] text-slate-400 mt-1 block">Evergreen high-volume target</span>
                </div>

                <!-- Tier 2: Repins -->
                <div class="rounded-2xl bg-slate-50 dark:bg-slate-900/50 p-3.5 border border-slate-200/60 dark:border-[#27272A]/60">
                  <div class="flex items-center justify-between mb-1.5">
                    <span class="text-[11px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">Tier 2: Min Repins</span>
                    <i data-lucide="repeat" class="w-3.5 h-3.5 text-blue-500"></i>
                  </div>
                  <input type="number" x-model.number="creatorRules.tier2_min_repins" class="w-full h-9 rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] px-3 text-xs font-bold text-slate-900 dark:text-white" placeholder="100" />
                  <span class="text-[10px] text-slate-400 mt-1 block">High distribution virality</span>
                </div>

                <!-- Tier 3: Fresh Age Days -->
                <div class="rounded-2xl bg-slate-50 dark:bg-slate-900/50 p-3.5 border border-slate-200/60 dark:border-[#27272A]/60">
                  <div class="flex items-center justify-between mb-1.5">
                    <span class="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Tier 3: Max Age (Days)</span>
                    <i data-lucide="sparkles" class="w-3.5 h-3.5 text-emerald-500"></i>
                  </div>
                  <input type="number" x-model.number="creatorRules.tier3_fresh_days" class="w-full h-9 rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] px-3 text-xs font-bold text-slate-900 dark:text-white" placeholder="14" />
                  <span class="text-[10px] text-slate-400 mt-1 block">Fresh breakout window</span>
                </div>

                <!-- Tier 3: Fresh Min Saves -->
                <div class="rounded-2xl bg-slate-50 dark:bg-slate-900/50 p-3.5 border border-slate-200/60 dark:border-[#27272A]/60">
                  <div class="flex items-center justify-between mb-1.5">
                    <span class="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Tier 3: Fresh Min Saves</span>
                    <i data-lucide="zap" class="w-3.5 h-3.5 text-emerald-500"></i>
                  </div>
                  <input type="number" x-model.number="creatorRules.tier3_min_saves" class="w-full h-9 rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] px-3 text-xs font-bold text-slate-900 dark:text-white" placeholder="25" />
                  <span class="text-[10px] text-slate-400 mt-1 block">Early breakout acceleration</span>
                </div>

                <!-- Crawler Max Pages -->
                <div class="rounded-2xl bg-slate-50 dark:bg-slate-900/50 p-3.5 border border-slate-200/60 dark:border-[#27272A]/60">
                  <div class="flex items-center justify-between mb-1.5">
                    <span class="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">Max Pages</span>
                    <i data-lucide="layers" class="w-3.5 h-3.5 text-indigo-500"></i>
                  </div>
                  <input type="number" x-model.number="creatorRules.max_pages" class="w-full h-9 rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] px-3 text-xs font-bold text-slate-900 dark:text-white" placeholder="500" />
                  <span class="text-[10px] text-slate-400 mt-1 block">Full sweep depth limit</span>
                </div>

                <!-- Crawler Early Stop Pages -->
                <div class="rounded-2xl bg-slate-50 dark:bg-slate-900/50 p-3.5 border border-slate-200/60 dark:border-[#27272A]/60">
                  <div class="flex items-center justify-between mb-1.5">
                    <span class="text-[11px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider">Early Stop Pages</span>
                    <i data-lucide="shield-alert" class="w-3.5 h-3.5 text-purple-500"></i>
                  </div>
                  <input type="number" x-model.number="creatorRules.early_stop_pages" class="w-full h-9 rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] px-3 text-xs font-bold text-slate-900 dark:text-white" placeholder="3" />
                  <span class="text-[10px] text-slate-400 mt-1 block">Daily pulse depth limit</span>
                </div>
              </div>

              <!-- Options & Buttons Bar -->
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                <div class="flex items-center gap-4">
                  <label class="inline-flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <input type="checkbox" x-model="creatorRules.articles_only" class="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4" />
                    <span>🎯 Articles Only (Exclude E-commerce Products: <code class="text-[10px] font-mono tabular-nums bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">!is_product</code>)</span>
                  </label>
                </div>

                <div class="flex items-center gap-2.5">
                  <button @click="saveCreatorRulesAction()" :disabled="isSavingCreatorRules" class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 text-xs font-bold transition shadow-xs cursor-pointer disabled:opacity-50">
                    <i data-lucide="save" class="w-3.5 h-3.5"></i>
                    <span x-text="isSavingCreatorRules ? 'Saving...' : 'Save Rules for this Account'"></span>
                  </button>
                  <button @click="reEvaluateCreatorPinsAction()" :disabled="isReEvaluatingCreatorPins" class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition shadow-xs cursor-pointer disabled:opacity-50">
                    <i data-lucide="refresh-cw" class="w-3.5 h-3.5" :class="isReEvaluatingCreatorPins ? 'animate-spin' : ''"></i>
                    <span x-text="isReEvaluatingCreatorPins ? 'Evaluating...' : '⚡ Re-evaluate Pins'"></span>
                  </button>
                </div>
              </div>

              <!-- Message feedback -->
              <template x-if="reEvaluateMessage">
                <div class="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-semibold flex items-center gap-2">
                  <i data-lucide="check-circle" class="w-4 h-4"></i>
                  <span x-text="reEvaluateMessage"></span>
                </div>
              </template>
            </div>
          </div>

          <!-- ═══ In-Page Sub-Navigation Tabs (Taste-Design Monochromatic Track) ═══ -->
          <div class="border-b border-slate-200 dark:border-[#27272A] pb-3">
            <div class="inline-flex items-center gap-1.5 p-1 rounded-2xl bg-slate-100 dark:bg-slate-900/80 border border-slate-200/80 dark:border-[#27272A] overflow-x-auto max-w-full">
              <button @click="switchCreatorTab('overview')" class="flex items-center gap-2 px-4 py-2 text-xs rounded-xl transition cursor-pointer whitespace-nowrap" :class="activeCreatorTab === 'overview' ? 'bg-rose-500 text-white font-bold shadow-2xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-semibold'">
                <i data-lucide="line-chart" class="w-4 h-4"></i>
                <span>Overview &amp; Growth Trends</span>
              </button>
              <button @click="switchCreatorTab('all_pins')" class="flex items-center gap-2 px-4 py-2 text-xs rounded-xl transition cursor-pointer whitespace-nowrap" :class="activeCreatorTab === 'all_pins' ? 'bg-rose-500 text-white font-bold shadow-2xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-semibold'">
                <i data-lucide="list" class="w-4 h-4"></i>
                <span>All Account Pins</span>
                <span class="px-2 py-0.5 rounded text-[10px] font-mono tabular-nums" :class="activeCreatorTab === 'all_pins' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'" x-text="formatNumber(activeCreatorCatalogTotal || activeCreatorAllPinsTotal || 0)"></span>
              </button>
              <button @click="switchCreatorTab('top_urls')" class="flex items-center gap-2 px-4 py-2 text-xs rounded-xl transition cursor-pointer whitespace-nowrap" :class="activeCreatorTab === 'top_urls' ? 'bg-rose-500 text-white font-bold shadow-2xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-semibold'">
                <i data-lucide="link" class="w-4 h-4"></i>
                <span>Link Explorer</span>
                <span class="px-2 py-0.5 rounded text-[10px] font-mono tabular-nums" :class="activeCreatorTab === 'top_urls' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'" x-text="creatorTopUrlsTotal || 0"></span>
              </button>
              <button @click="switchCreatorTab('related_pins')" class="flex items-center gap-2 px-4 py-2 text-xs rounded-xl transition cursor-pointer whitespace-nowrap" :class="activeCreatorTab === 'related_pins' ? 'bg-rose-500 text-white font-bold shadow-2xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-semibold'">
                <i data-lucide="network" class="w-4 h-4"></i>
                <span>Related Pins Radar</span>
                <span class="px-2 py-0.5 rounded text-[10px] font-mono tabular-nums" :class="activeCreatorTab === 'related_pins' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'" x-text="(creatorRelatedStats.total_intersections || 0) + 'i'"></span>
              </button>
              <button @click="switchCreatorTab('boards')" class="flex items-center gap-2 px-4 py-2 text-xs rounded-xl transition cursor-pointer whitespace-nowrap" :class="activeCreatorTab === 'boards' ? 'bg-rose-500 text-white font-bold shadow-2xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-semibold'">
                <i data-lucide="layout-grid" class="w-4 h-4"></i>
                <span>Pinterest Board Strategy</span>
                <span class="px-2 py-0.5 rounded text-[10px] font-mono tabular-nums" :class="activeCreatorTab === 'boards' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'" x-text="activeCreatorBoards.length || activeCreator.total_boards || 0"></span>
              </button>
            </div>
          </div>

          <!-- ======================================================== -->
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
                            <a :href="safeUrl(b.url || ('https://www.pinterest.com/' + (activeCreator.username || '').replace(/^@+/, '') + '/' + encodeURIComponent(b.name.toLowerCase().replace(/\s+/g, '-'))))" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 font-semibold text-rose-500 hover:underline">
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

          </div>

          <!-- ======================================================== -->
          <!-- SUB-VIEW: ALL ACCOUNT PINS (FULL DISCOVERED INVENTORY)    -->
          <!-- ======================================================== -->
          <div x-show="activeCreatorTab === 'all_pins'" class="space-y-5">
            <!-- Unified Ledger Command Header -->
            <div class="rounded-2xl border border-slate-200/90 dark:border-[#27272A] bg-white dark:bg-[#18181B] p-4 sm:p-5 shadow-xs space-y-4">
              <!-- Top Row: Title, Totals & Refresh -->
              <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div class="flex items-center gap-2.5">
                  <span class="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-500 font-bold text-base shadow-2xs">📌</span>
                  <div>
                    <div class="flex items-center gap-2">
                      <h3 class="text-base font-bold text-slate-900 dark:text-white">Master Pin Ledger</h3>
                      <span class="text-xs font-mono tabular-nums font-bold px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20" x-text="formatNumber(activeCreatorCatalogTotal || activeCreatorAllPinsTotal || 0) + ' pins'"></span>
                    </div>
                    <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Discovered pins catalog for @<span x-text="(activeCreator?.username || '').replace(/^@+/, '')"></span>. Deeply synchronized across Neon Shards.</p>
                  </div>
                </div>

                <!-- Right Side: Light Refresh & Quick Pagination Badge -->
                <div class="flex items-center gap-2 self-start sm:self-auto">
                  <button type="button" @click="fetchCreatorAllPins()" class="px-3 py-1.5 text-xs font-semibold rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-slate-900/80 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition flex items-center gap-1.5 cursor-pointer shadow-2xs" title="Refresh pins catalog">
                    <i data-lucide="refresh-cw" class="w-3.5 h-3.5" :class="isLoadingAllPins ? 'animate-spin text-indigo-500' : ''"></i>
                    <span>Refresh</span>
                  </button>
                  <span class="text-xs font-mono tabular-nums font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-900 px-2.5 py-1 rounded-xl border border-slate-200/60 dark:border-[#27272A]" x-text="'Page ' + (activeCreatorAllPinsPage || 1) + ' / ' + (activeCreatorAllPinsTotalPages || 1)"></span>
                </div>
              </div>

              <!-- Bottom Row: Smart Segmented Filter Pills with Live Backend Counts -->
              <div class="flex items-center gap-2 overflow-x-auto pb-1 pt-1 select-none border-t border-slate-100 dark:border-[#27272A]/80">
                <!-- All Catalog -->
                <button 
                  type="button" 
                  @click="creatorAllPinQualifiedOnly = false; creatorAllPinRankedOnly = false; creatorAllPinHighVelocity = false; creatorAllPinArticlesOnly = false; creatorAllPinStage = ''; activeCreatorAllPinsPage = 1; fetchCreatorAllPins()"
                  class="px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border shadow-2xs whitespace-nowrap shrink-0"
                  :class="(!creatorAllPinQualifiedOnly && !creatorAllPinRankedOnly && !creatorAllPinHighVelocity && !creatorAllPinArticlesOnly && !creatorAllPinStage) ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs' : 'bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-[#27272A] hover:text-slate-900 dark:hover:text-white'"
                >
                  <span>📋 All Catalog</span>
                  <span class="px-1.5 py-0.2 rounded text-[10.5px] font-mono tabular-nums" :class="(!creatorAllPinQualifiedOnly && !creatorAllPinRankedOnly && !creatorAllPinHighVelocity && !creatorAllPinArticlesOnly && !creatorAllPinStage) ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'" x-text="formatNumber(activeCreatorCatalogTotal || activeCreatorAllPinsTotal || 0)"></span>
                </button>

                <!-- Qualified Winners -->
                <button 
                  type="button" 
                  @click="creatorAllPinQualifiedOnly = true; creatorAllPinRankedOnly = false; creatorAllPinHighVelocity = false; creatorAllPinArticlesOnly = false; activeCreatorAllPinsPage = 1; fetchCreatorAllPins()"
                  class="px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border shadow-2xs whitespace-nowrap shrink-0"
                  :class="(creatorAllPinQualifiedOnly && !creatorAllPinRankedOnly && !creatorAllPinHighVelocity && !creatorAllPinArticlesOnly) ? 'bg-amber-500 text-white border-amber-600 shadow-xs' : 'bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-[#27272A] hover:text-slate-900 dark:hover:text-white'"
                >
                  <span>🏆 Qualified Winners</span>
                  <span class="px-1.5 py-0.2 rounded text-[10.5px] font-mono tabular-nums" :class="(creatorAllPinQualifiedOnly && !creatorAllPinRankedOnly && !creatorAllPinHighVelocity && !creatorAllPinArticlesOnly) ? 'bg-white/20 text-white' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'" x-text="formatNumber(activeCreatorWinningPinsTotal || 0)"></span>
                </button>

                <!-- SERP Ranked -->
                <button 
                  type="button" 
                  @click="creatorAllPinRankedOnly = true; creatorAllPinQualifiedOnly = false; creatorAllPinHighVelocity = false; creatorAllPinArticlesOnly = false; activeCreatorAllPinsPage = 1; fetchCreatorAllPins()"
                  class="px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border shadow-2xs whitespace-nowrap shrink-0"
                  :class="(creatorAllPinRankedOnly) ? 'bg-sky-600 text-white border-sky-700 shadow-xs' : 'bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-[#27272A] hover:text-slate-900 dark:hover:text-white'"
                >
                  <span>🎯 SERP Ranked</span>
                  <span class="px-1.5 py-0.2 rounded text-[10.5px] font-mono tabular-nums" :class="(creatorAllPinRankedOnly) ? 'bg-white/20 text-white' : 'bg-sky-500/10 text-sky-600 dark:text-sky-400'" x-text="formatNumber(activeCreatorRankedTotal || 0)"></span>
                </button>

                <!-- High Velocity (>=10/d) -->
                <button 
                  type="button" 
                  @click="creatorAllPinHighVelocity = true; creatorAllPinQualifiedOnly = false; creatorAllPinRankedOnly = false; creatorAllPinArticlesOnly = false; activeCreatorAllPinsPage = 1; fetchCreatorAllPins()"
                  class="px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border shadow-2xs whitespace-nowrap shrink-0"
                  :class="(creatorAllPinHighVelocity) ? 'bg-rose-600 text-white border-rose-700 shadow-xs' : 'bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-[#27272A] hover:text-slate-900 dark:hover:text-white'"
                >
                  <span>🔥 High Velocity (≥10/d)</span>
                  <span class="px-1.5 py-0.2 rounded text-[10.5px] font-mono tabular-nums" :class="(creatorAllPinHighVelocity) ? 'bg-white/20 text-white' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'" x-text="formatNumber(activeCreatorHighVelocityTotal || 0)"></span>
                </button>

                <!-- Articles Only -->
                <button 
                  type="button" 
                  @click="creatorAllPinArticlesOnly = !creatorAllPinArticlesOnly; activeCreatorAllPinsPage = 1; fetchCreatorAllPins()"
                  class="px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border shadow-2xs whitespace-nowrap shrink-0"
                  :class="(creatorAllPinArticlesOnly) ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs' : 'bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-[#27272A] hover:text-slate-900 dark:hover:text-white'"
                >
                  <span>📰 Articles Only</span>
                </button>

                <!-- Domain Ecosystem Attribution Scope Pills -->
                <template x-if="(activeCreatorCuratorPinsTotal || activeCreatorDetail?.domain_ecosystem?.curator_pins || 0) > 0 || (activeCreatorExternalPinsTotal || activeCreatorDetail?.domain_ecosystem?.external_pins || 0) > 0">
                  <div class="flex items-center gap-1.5 pl-2 ml-1 border-l border-slate-200 dark:border-[#27272A]">
                    <button
                      type="button"
                      @click="creatorAllPinScope = 'official'; activeCreatorAllPinsPage = 1; fetchCreatorAllPins()"
                      class="px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border whitespace-nowrap shrink-0"
                      :class="creatorAllPinScope === 'official' ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white' : 'bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-[#27272A]'"
                      title="Direct pins linking to this creator's own primary website domain"
                    >
                      <span>👤 Official Account</span>
                      <span class="px-1.5 py-0.2 rounded text-[10px] font-mono tabular-nums bg-black/10 dark:bg-white/15" x-text="formatNumber(activeCreatorCatalogTotal || 0)"></span>
                    </button>
                    <button
                      type="button"
                      @click="creatorAllPinScope = 'ecosystem'; activeCreatorAllPinsPage = 1; fetchCreatorAllPins()"
                      class="px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border whitespace-nowrap shrink-0"
                      :class="creatorAllPinScope === 'ecosystem' ? 'bg-violet-600 text-white border-violet-700 shadow-xs' : 'bg-violet-50/70 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800/60'"
                      title="Includes all SERP & Vault pins linking to this creator's primary website domain across all Pinterest users"
                    >
                      <span>🌐 Full Domain Ecosystem</span>
                      <span class="px-1.5 py-0.2 rounded text-[10px] font-mono tabular-nums" :class="creatorAllPinScope === 'ecosystem' ? 'bg-white/20 text-white' : 'bg-violet-500/15 text-violet-700 dark:text-violet-300'" x-text="formatNumber(activeCreatorEcosystemTotal || (activeCreatorCatalogTotal + activeCreatorCuratorPinsTotal) || 0)"></span>
                    </button>
                    <button
                      type="button"
                      @click="creatorAllPinScope = 'curators'; activeCreatorAllPinsPage = 1; fetchCreatorAllPins()"
                      class="px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border whitespace-nowrap shrink-0"
                      :class="creatorAllPinScope === 'curators' ? 'bg-fuchsia-600 text-white border-fuchsia-700 shadow-xs' : 'bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-[#27272A]'"
                      title="Third-party community curator pins linking to this creator's website domain"
                    >
                      <span>🤝 Community Curators</span>
                      <span class="px-1.5 py-0.2 rounded text-[10px] font-mono tabular-nums" :class="creatorAllPinScope === 'curators' ? 'bg-white/20 text-white' : 'bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400'" x-text="formatNumber(activeCreatorCuratorPinsTotal || activeCreatorDetail?.domain_ecosystem?.curator_pins || 0)"></span>
                    </button>
                    <template x-if="(activeCreatorExternalPinsTotal || activeCreatorDetail?.domain_ecosystem?.external_pins || 0) > 0">
                      <button
                        type="button"
                        @click="creatorAllPinScope = 'external'; activeCreatorAllPinsPage = 1; fetchCreatorAllPins()"
                        class="px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border whitespace-nowrap shrink-0"
                        :class="creatorAllPinScope === 'external' ? 'bg-amber-600 text-white border-amber-700 shadow-xs' : 'bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-[#27272A]'"
                        title="Third-party pins from external domains saved onto this account's boards (excluded from official creator stats)"
                      >
                        <span>📌 External Repins</span>
                        <span class="px-1.5 py-0.2 rounded text-[10px] font-mono tabular-nums" :class="creatorAllPinScope === 'external' ? 'bg-white/20 text-white' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'" x-text="formatNumber(activeCreatorExternalPinsTotal || activeCreatorDetail?.domain_ecosystem?.external_pins || 0)"></span>
                      </button>
                    </template>
                  </div>
                </template>
              </div>
            </div>

            <!-- Filters & Search Toolbar -->
            <div class="rounded-2xl border border-slate-200/90 dark:border-[#27272A] bg-white dark:bg-[#18181B] p-3.5 shadow-xs flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              <!-- Search bar: roomy and flexible -->
              <div class="relative w-full lg:w-80 min-w-[240px] flex-1">
                <input
                  type="text"
                  x-model="creatorAllPinSearch"
                  @input.debounce.400ms="activeCreatorAllPinsPage = 1; fetchCreatorAllPins()"
                  placeholder="Search pins by title or link..."
                  class="w-full rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none pl-9 focus:ring-1 focus:ring-indigo-500"
                />
                <i data-lucide="search" class="w-4 h-4 text-slate-400 absolute left-3 top-2.5"></i>
              </div>

              <!-- Filter Dropdowns & Showing Counter -->
              <div class="flex flex-wrap items-center gap-2 justify-between lg:justify-end flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <!-- Board Select -->
                  <div class="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] rounded-xl px-2.5 py-1.5">
                    <label class="text-xs font-semibold text-slate-500 whitespace-nowrap">Board:</label>
                    <select x-model="creatorAllPinBoard" @change="activeCreatorAllPinsPage = 1; fetchCreatorAllPins()" class="bg-transparent text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer max-w-[130px] truncate">
                      <option value="">All Boards</option>
                      <template x-for="b in activeCreatorAllPinsBoards" :key="typeof b === 'object' && b !== null ? b.board_name : b">
                        <option :value="typeof b === 'object' && b !== null ? b.board_name : b" x-text="typeof b === 'object' && b !== null ? (b.board_name + ' (' + (b.count || 0) + ')') : b"></option>
                      </template>
                    </select>
                  </div>

                  <!-- Stage Filter -->
                  <div class="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] rounded-xl px-2.5 py-1.5">
                    <label class="text-xs font-semibold text-slate-500 whitespace-nowrap">Stage:</label>
                    <select x-model="creatorAllPinStage" @change="activeCreatorAllPinsPage = 1; fetchCreatorAllPins()" class="bg-transparent text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer">
                      <option value="">All Stages</option>
                      <option value="GROWING">📈 GROWING</option>
                      <option value="NEW">🟢 NEW (≤14d)</option>
                      <option value="MATURE">🟣 MATURE</option>
                      <option value="COOLING">📉 COOLING</option>
                      <option value="DORMANT">⚪ DORMANT</option>
                    </select>
                  </div>

                  <!-- Min Saves Filter -->
                  <div class="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] rounded-xl px-2.5 py-1.5">
                    <label class="text-xs font-semibold text-slate-500 whitespace-nowrap">Saves:</label>
                    <select x-model.number="creatorAllPinMinSaves" @change="activeCreatorAllPinsPage = 1; fetchCreatorAllPins()" class="bg-transparent text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer">
                      <option value="0">All Saves</option>
                      <option value="10">10+ saves</option>
                      <option value="50">50+ saves</option>
                      <option value="100">100+ (Tier 1)</option>
                      <option value="500">500+ saves</option>
                    </select>
                  </div>

                  <!-- Sort Order -->
                  <div class="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] rounded-xl px-2.5 py-1.5">
                    <label class="text-xs font-semibold text-slate-500 whitespace-nowrap">Sort:</label>
                    <select x-model="creatorAllPinSort" @change="activeCreatorAllPinsPage = 1; fetchCreatorAllPins()" class="bg-transparent text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer">
                      <option value="saves_desc">Highest Saves</option>
                      <option value="velocity_desc">Highest Velocity (/d)</option>
                      <option value="repins_desc">Highest Repins</option>
                      <option value="created_desc">Newest Pin</option>
                      <option value="created_asc">Oldest Pin</option>
                    </select>
                  </div>

                  <!-- Clear / Reset filters button -->
                  <button
                    type="button"
                    x-show="creatorAllPinSearch || creatorAllPinBoard || creatorAllPinMinSaves > 0 || creatorAllPinQualifiedOnly || creatorAllPinArticlesOnly || creatorAllPinRankedOnly || creatorAllPinHighVelocity || creatorAllPinStage"
                    @click="creatorAllPinSearch = ''; creatorAllPinBoard = ''; creatorAllPinMinSaves = 0; creatorAllPinQualifiedOnly = false; creatorAllPinArticlesOnly = false; creatorAllPinRankedOnly = false; creatorAllPinHighVelocity = false; creatorAllPinStage = ''; activeCreatorAllPinsPage = 1; fetchCreatorAllPins()"
                    class="px-2.5 py-1.5 rounded-xl text-xs font-semibold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 border border-rose-200/60 dark:border-rose-900/40 transition cursor-pointer flex items-center gap-1"
                    title="Reset all active filters"
                  >
                    <i data-lucide="x" class="w-3 h-3"></i>
                    <span>Reset</span>
                  </button>

                  <!-- Columns Customization Dropdown -->
                  <div class="relative" x-data="{ isMasterColumnsOpen: false }" @click.outside="isMasterColumnsOpen = false" @keydown.escape.window="isMasterColumnsOpen = false">
                    <button type="button" @click="isMasterColumnsOpen = !isMasterColumnsOpen" class="px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-slate-700 dark:text-slate-300 text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer shadow-2xs hover:bg-slate-100 dark:hover:bg-slate-800" title="Customize visible table columns">
                      <i data-lucide="columns-3" class="w-3.5 h-3.5 text-slate-400"></i>
                      <span>Columns</span>
                      <i data-lucide="chevron-down" class="w-3 h-3 text-slate-400 transition-transform" :class="isMasterColumnsOpen ? 'rotate-180' : ''"></i>
                    </button>

                    <!-- Dropdown Menu -->
                    <div x-show="isMasterColumnsOpen" x-cloak
                         x-transition:enter="transition ease-out duration-150"
                         x-transition:enter-start="opacity-0 scale-95"
                         x-transition:enter-end="opacity-100 scale-100"
                         x-transition:leave="transition ease-in duration-100"
                         x-transition:leave-start="opacity-100 scale-100"
                         x-transition:leave-end="opacity-0 scale-95"
                         class="absolute right-0 mt-2 w-56 rounded-xl bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] shadow-xl p-2 space-y-0.5 z-40 text-xs font-sans">
                      <div class="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono tabular-nums border-b border-slate-100 dark:border-[#27272A]/80 flex items-center justify-between">
                        <span>Display Columns</span>
                        <button type="button" @click="resetMasterColumns()" class="text-indigo-500 hover:underline capitalize text-[10px] cursor-pointer">Reset</button>
                      </div>
                      
                      <template x-for="col in masterColumnDefinitions" :key="col.key">
                        <label class="flex items-center space-x-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer select-none transition"
                               :class="col.required ? 'opacity-60 cursor-not-allowed' : ''">
                          <input type="checkbox"
                                 :checked="visibleMasterColumns[col.key]"
                                 :disabled="col.required"
                                 @change="toggleMasterColumn(col.key)"
                                 class="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 dark:border-[#27272A] cursor-pointer">
                          <span class="text-xs text-slate-700 dark:text-slate-300 font-medium" x-text="col.label"></span>
                          <template x-if="col.required">
                            <span class="text-[9px] text-slate-400 font-mono tabular-nums ml-auto">(Required)</span>
                          </template>
                        </label>
                      </template>
                    </div>
                  </div>
                </div>

                <!-- Showing X-Y of Z results counter -->
                <div class="text-xs font-mono tabular-nums text-slate-400 select-none whitespace-nowrap pl-2">
                  <span x-show="activeCreatorAllPinsTotal > 0" x-text="'Showing ' + (((activeCreatorAllPinsPage - 1) * 25) + 1) + '–' + Math.min(activeCreatorAllPinsPage * 25, activeCreatorAllPinsTotal) + ' of ' + formatNumber(activeCreatorAllPinsTotal)"></span>
                </div>
              </div>
            </div>

            <!-- Loading Spinner -->
            <div x-show="isLoadingAllPins" class="py-12 flex flex-col items-center justify-center space-y-3">
              <i data-lucide="loader" class="w-8 h-8 text-indigo-500 animate-spin"></i>
              <span class="text-xs font-semibold text-slate-400">Loading pins inventory...</span>
            </div>

            <!-- Empty State -->
            <div x-show="!isLoadingAllPins && activeCreatorAllPins.length === 0" class="rounded-2xl border border-slate-200/90 dark:border-[#27272A] bg-white dark:bg-[#18181B] p-12 text-center shadow-xs">
              <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-500 mx-auto mb-3">
                <i data-lucide="inbox" class="w-6 h-6"></i>
              </div>
              <h4 class="text-sm font-bold text-slate-900 dark:text-white">No pins found in inventory</h4>
              <p class="text-xs text-slate-500 max-w-sm mx-auto mt-1">No pins match the current filter or this account has not been harvested yet. Click "Harvest All Pins" to pull the full catalog from Pinterest.</p>
              <button type="button" @click="openGhaCrawlerModal(activeCreator)" class="mt-4 px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white shadow-sm inline-flex items-center gap-1.5 transition cursor-pointer">
                <i data-lucide="zap" class="w-4 h-4"></i>
                <span>⚡ Launch 20-Shard GitHub Actions Harvest</span>
              </button>
            </div>

            <!-- Table of All Account Pins -->
            <div x-show="!isLoadingAllPins && activeCreatorAllPins.length > 0" class="overflow-x-auto rounded-2xl border border-slate-200/90 dark:border-[#27272A] bg-white dark:bg-[#18181B] shadow-xs">
              <table class="w-full text-left text-xs">
                <thead class="bg-slate-50 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 text-[11px] uppercase border-b border-slate-200 dark:border-[#27272A] font-semibold select-none">
                  <tr>
                    <th class="py-3 px-3 w-10 text-center">
                      <input type="checkbox" :checked="activeCreatorAllPins.length > 0 && activeCreatorAllPins.every(p => isPinSelected(p.pin_id))" @change="$event.target.checked ? selectAllCurrentPins(activeCreatorAllPins) : clearSelectedCreatorPins()" class="rounded border-slate-300 text-amber-500 cursor-pointer" />
                    </th>
                    <th x-show="visibleMasterColumns.media" class="py-3 px-3 w-14">Media</th>
                    <th x-show="visibleMasterColumns.title" class="py-3 px-4 font-semibold text-slate-900 dark:text-white">Pin Title &amp; Destination</th>
                    <th x-show="visibleMasterColumns.board" class="py-3 px-3 font-semibold">Board</th>
                    <th x-show="visibleMasterColumns.saves" class="py-3 px-3 font-semibold text-right">Saves</th>
                    <th x-show="visibleMasterColumns.repins" class="py-3 px-3 font-semibold text-right">Repins</th>
                    <th x-show="visibleMasterColumns.status" class="py-3 px-3 text-center font-semibold">Status</th>
                    <th x-show="visibleMasterColumns.created_at" class="py-3 px-3 font-semibold">Created / Discovered</th>
                    <th x-show="visibleMasterColumns.actions" class="py-3 px-3 text-center font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono tabular-nums">
                  <template x-for="p in activeCreatorAllPins.slice(0, creatorAllPinsLimit)" :key="p.pin_id">
                    <tr class="hover:bg-slate-50/80 dark:hover:bg-slate-900/40 transition" :class="isPinSelected(p.pin_id) ? 'bg-amber-500/5 dark:bg-amber-500/10' : ''">
                      <!-- Selection Checkbox -->
                      <td class="py-2.5 px-3 text-center">
                        <input type="checkbox" :checked="isPinSelected(p.pin_id)" @change="togglePinSelection(p.pin_id)" class="rounded border-slate-300 text-amber-500 cursor-pointer" />
                      </td>
                      <!-- Thumbnail with hover preview -->
                      <td x-show="visibleMasterColumns.media" class="py-2.5 px-3 w-14">
                        <div class="relative group cursor-pointer" @click="openPinDossier(p)">
                          <img :src="p.image_url" loading="lazy" class="w-11 h-14 rounded-lg object-cover border border-slate-200 dark:border-[#27272A] bg-slate-100 dark:bg-slate-800 hover:opacity-80 transition" onerror="window.handlePinImgError(this)" />
                          <div class="hidden group-hover:block absolute left-14 top-0 z-40 w-44 rounded-xl overflow-hidden shadow-2xl border border-slate-200 dark:border-[#27272A] pointer-events-none bg-white dark:bg-slate-900">
                            <img :src="p.image_url" class="w-full h-auto object-cover" onerror="window.handlePinImgError(this)" />
                          </div>
                        </div>
                      </td>

                      <!-- Title & Destination -->
                      <td x-show="visibleMasterColumns.title" class="py-2.5 px-4 font-sans font-bold text-slate-900 dark:text-white max-w-md">
                        <div class="line-clamp-2 cursor-pointer hover:text-rose-500 transition" :title="p.title" x-text="p.title || 'Untitled Pin'" @click="openPinDossier(p)"></div>
                        <div class="flex items-center gap-2 mt-1 font-mono tabular-nums text-[10.5px] font-normal flex-wrap">
                          <span class="text-slate-400" x-text="'ID: ' + p.pin_id"></span>
                          <template x-if="p.attribution_source === 'curator' && p.curator_username">
                            <span class="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20 font-semibold" :title="'Saved onto board by third-party curator @' + p.curator_username">
                              <span>🤝 @<span x-text="String(p.curator_username).replace(/^@/, '')"></span></span>
                            </span>
                          </template>
                          <template x-if="p.destination_url">
                            <a :href="safeUrl(p.destination_url)" target="_blank" rel="noopener noreferrer" class="text-sky-500 hover:underline flex items-center gap-1 truncate max-w-[200px]" :title="p.destination_url">
                              <i data-lucide="link" class="w-3 h-3 shrink-0"></i>
                              <span x-text="p.link_domain || 'Destination'"></span>
                            </a>
                          </template>
                        </div>
                      </td>

                      <!-- Board Name -->
                      <td x-show="visibleMasterColumns.board" class="py-2.5 px-3 font-sans text-slate-600 dark:text-slate-300 truncate max-w-[130px]">
                        <button type="button" @click="openBoardPage(p.board_name, activeCreator)" class="inline-block px-2 py-0.5 rounded-lg text-[10.5px] font-semibold bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 hover:bg-purple-100 dark:hover:bg-purple-950/40 hover:text-purple-600 dark:hover:text-purple-400 border border-slate-200 dark:border-[#27272A]/60 transition cursor-pointer" x-text="p.board_name || 'General'"></button>
                      </td>

                      <!-- Saves + 24h delta -->
                      <td x-show="visibleMasterColumns.saves" class="py-2.5 px-3 text-right">
                        <div class="flex flex-col items-end">
                          <span class="font-extrabold" :class="Number(p.save_count || p.saves || 0) >= 100 ? 'text-rose-600 dark:text-rose-400 font-black' : 'text-slate-700 dark:text-slate-300'" x-text="formatNumber(p.save_count || p.saves || 0)"></span>
                          <template x-if="Number(p.delta_saves_24h || p.velocity || 0) > 0">
                            <span class="inline-flex items-center text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.2 rounded border border-emerald-200/60 dark:border-emerald-800/60 mt-0.5" x-text="'+' + (Number(p.delta_saves_24h || p.velocity || 0) >= 1 ? formatNumber(Math.round(p.delta_saves_24h || p.velocity || 0)) : Number(p.delta_saves_24h || p.velocity || 0).toFixed(1)) + ' 24h'"></span>
                          </template>
                        </div>
                      </td>

                      <!-- Repins + 24h delta -->
                      <td x-show="visibleMasterColumns.repins" class="py-2.5 px-3 text-right">
                        <div class="flex flex-col items-end">
                          <span class="font-bold text-slate-700 dark:text-slate-300" x-text="formatNumber(p.repin_count || p.repins || 0)"></span>
                          <template x-if="Number(p.delta_repins_24h || 0) > 0">
                            <span class="inline-flex items-center text-[10px] font-semibold text-pink-700 dark:text-pink-400 bg-pink-50 dark:bg-pink-950/40 px-1.5 py-0.2 rounded border border-pink-200/60 dark:border-pink-800/60 mt-0.5" x-text="'+' + formatNumber(Math.round(p.delta_repins_24h)) + ' 24h'"></span>
                          </template>
                        </div>
                      </td>

                      <!-- Status Badge (Clean: 🏆, 🎯, Product) -->
                      <td x-show="visibleMasterColumns.status" class="py-2.5 px-3 text-center">
                        <div class="inline-flex items-center justify-center gap-1.5 flex-wrap">
                          <template x-if="p.is_ranked">
                            <span class="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30 shadow-2xs" :title="'Ranked in SERP position #' + (p.rank_position || '—')">
                              <span>🎯</span>
                              <span x-text="p.rank_position ? '#' + p.rank_position : ''"></span>
                            </span>
                          </template>
                          <template x-if="p.is_product">
                            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 shadow-2xs" title="Identified Commercial / Affiliate Product">
                              <i data-lucide="shopping-bag" class="w-2.5 h-2.5"></i>
                              <span>Product</span>
                            </span>
                          </template>
                          <template x-if="p.is_qualified">
                            <button @click="creatorAllPinQualifiedOnly = true; activeCreatorAllPinsPage = 1; fetchCreatorAllPins();" class="inline-flex items-center justify-center px-1.5 py-0.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-xs shadow-2xs cursor-pointer hover:bg-amber-500/25 transition" title="Qualified Winner">
                              <span>🏆</span>
                            </button>
                          </template>
                          <template x-if="!p.is_qualified && !p.is_product && !p.is_ranked">
                            <span class="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-[#27272A]">
                              Standard
                            </span>
                          </template>
                        </div>
                      </td>

                      <!-- Created / Discovered -->
                      <td x-show="visibleMasterColumns.created_at" class="py-2.5 px-3 font-sans text-slate-500 text-[11px]">
                        <span x-text="p.created_at_pinterest ? new Date(p.created_at_pinterest).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : (p.first_seen_at ? new Date(p.first_seen_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—')"></span>
                      </td>

                      <!-- Actions: Eye icon and External Link -->
                      <td x-show="visibleMasterColumns.actions" class="py-2.5 px-3 text-center">
                        <div class="inline-flex items-center gap-1.5 justify-center">
                          <a :href="'/pin/' + p.pin_id" @click.prevent="openPinDossier(p)" class="inline-flex items-center justify-center h-7 w-7 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 transition cursor-pointer" title="Inspect Pin Dossier">
                            <i data-lucide="eye" class="w-3.5 h-3.5"></i>
                          </a>
                          <a :href="'https://www.pinterest.com/pin/' + p.pin_id + '/'" target="_blank" rel="noopener noreferrer" class="inline-flex items-center justify-center h-7 w-7 rounded-lg text-slate-500 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition" title="Open on Pinterest">
                            <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                          </a>
                        </div>
                      </td>
                    </tr>
                  </template>
                </tbody>
              </table>

              <!-- Load More Windowing Button (LND-914) -->
              <template x-if="activeCreatorAllPins.length > creatorAllPinsLimit">
                <div class="flex items-center justify-center p-3 border-t border-slate-200 dark:border-[#27272A] bg-slate-50/50 dark:bg-slate-900/30">
                  <button type="button" @click="creatorAllPinsLimit += 100" class="inline-flex items-center gap-2 px-4 py-1.5 rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] hover:bg-slate-50 dark:hover:bg-[#27272A] text-xs font-semibold text-slate-700 dark:text-slate-300 transition shadow-2xs cursor-pointer">
                    <span>Load More Pins</span>
                    <span class="text-[10px] text-slate-400 font-mono tabular-nums" x-text="'(' + creatorAllPinsLimit + ' of ' + activeCreatorAllPins.length + ')'"></span>
                  </button>
                </div>
              </template>

              <!-- Pagination Footer Bar -->
              <div class="flex items-center justify-between border-t border-slate-200 dark:border-[#27272A] px-5 py-3 bg-slate-50/50 dark:bg-slate-900/30 text-xs text-slate-500">
                <span x-text="'Showing ' + (((activeCreatorAllPinsPage - 1) * 25) + 1) + '-' + Math.min(activeCreatorAllPinsPage * 25, activeCreatorAllPinsTotal) + ' of ' + activeCreatorAllPinsTotal + ' pins'"></span>
                <div class="flex items-center gap-2">
                  <button @click="activeCreatorAllPinsPage = Math.max(1, activeCreatorAllPinsPage - 1); fetchCreatorAllPins()" :disabled="activeCreatorAllPinsPage <= 1" class="rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] px-3 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 disabled:opacity-40 transition shadow-2xs cursor-pointer">Previous</button>
                  <span class="font-bold text-slate-900 dark:text-white" x-text="'Page ' + activeCreatorAllPinsPage + ' of ' + Math.max(1, activeCreatorAllPinsTotalPages)"></span>
                  <button @click="activeCreatorAllPinsPage = activeCreatorAllPinsPage + 1; fetchCreatorAllPins()" :disabled="activeCreatorAllPinsPage >= activeCreatorAllPinsTotalPages" class="rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] px-3 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 disabled:opacity-40 transition shadow-2xs cursor-pointer">Next</button>
                </div>
              </div>
            </div>
          </div>



          <!-- ======================================================== -->
          <!-- SUB-VIEW: TOP DESTINATION URLS STRATEGY                   -->
          <!-- ======================================================== -->
          <div x-show="activeCreatorTab === 'top_urls'" class="space-y-5">
            <!-- Header & Filter Bar -->
            <div class="rounded-2xl border border-slate-200/90 dark:border-[#27272A] bg-white dark:bg-[#18181B] p-5 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <div class="flex items-center gap-2">
                  <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500 font-bold text-sm">🔗</span>
                  <h3 class="text-base font-extrabold text-slate-900 dark:text-white">Top Destination URLs Intelligence</h3>
                </div>
                <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Aggregated performance per normalized article slug. Discovers high-traffic articles and the volume of pins driving them.
                </p>
              </div>

              <!-- Search & Filter Controls -->
              <div class="flex items-center gap-3 flex-wrap">
                <!-- Ecosystem vs Official Scope Toggle -->
                <div class="flex items-center bg-slate-100 dark:bg-slate-900 p-0.5 rounded-xl border border-slate-200 dark:border-[#27272A]">
                  <button @click="creatorTopUrlScope = 'ecosystem'; creatorTopUrlsPage = 1; fetchCreatorTopUrls()" class="rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer" :class="creatorTopUrlScope === 'ecosystem' ? 'bg-violet-600 text-white shadow-2xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'" title="All URLs discovered across official pins and third-party curator pins for this domain">🌐 Full Domain URLs</button>
                  <button @click="creatorTopUrlScope = 'official'; creatorTopUrlsPage = 1; fetchCreatorTopUrls()" class="rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer" :class="creatorTopUrlScope === 'official' ? 'bg-white dark:bg-[#121215] text-slate-900 dark:text-white shadow-2xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'" title="Only URLs from pins directly on this account's boards linking to primary domain">👤 Official Only</button>
                  <button @click="creatorTopUrlScope = 'curators'; creatorTopUrlsPage = 1; fetchCreatorTopUrls()" class="rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer" :class="creatorTopUrlScope === 'curators' ? 'bg-fuchsia-600 text-white shadow-2xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'" title="URLs amplified by community curators">🤝 Curators</button>
                  <button @click="creatorTopUrlScope = 'external'; creatorTopUrlsPage = 1; fetchCreatorTopUrls()" class="rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer" :class="creatorTopUrlScope === 'external' ? 'bg-amber-600 text-white shadow-2xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'" title="Third-party domain URLs repinned onto this account's boards">📌 External Repins</button>
                </div>

                <!-- Filter Type Segmented Control -->
                <div class="flex items-center bg-slate-100 dark:bg-slate-900 p-0.5 rounded-xl border border-slate-200 dark:border-[#27272A]">
                  <button @click="creatorTopUrlFilterType = 'all'; creatorTopUrlsPage = 1; fetchCreatorTopUrls()" class="rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer" :class="creatorTopUrlFilterType === 'all' ? 'bg-white dark:bg-[#121215] text-slate-900 dark:text-white shadow-2xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'">All</button>
                  <button @click="creatorTopUrlFilterType = 'articles_only'; creatorTopUrlsPage = 1; fetchCreatorTopUrls()" class="rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer" :class="creatorTopUrlFilterType === 'articles_only' ? 'bg-white dark:bg-[#121215] text-emerald-600 dark:text-emerald-400 shadow-2xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'">Articles Only</button>
                  <button @click="creatorTopUrlFilterType = 'products_only'; creatorTopUrlsPage = 1; fetchCreatorTopUrls()" class="rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer" :class="creatorTopUrlFilterType === 'products_only' ? 'bg-white dark:bg-[#121215] text-purple-600 dark:text-purple-400 shadow-2xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'">Products Only</button>
                  <button @click="creatorTopUrlFilterType = 'affiliate_only'; creatorTopUrlsPage = 1; fetchCreatorTopUrls()" class="rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer" :class="creatorTopUrlFilterType === 'affiliate_only' ? 'bg-white dark:bg-[#121215] text-amber-600 dark:text-amber-400 shadow-2xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'">🛒 Affiliate &amp; Marketplaces</button>
                </div>

                <!-- Search Input -->
                <div class="relative">
                  <input type="text" x-model="creatorTopUrlSearch" @keyup.enter="creatorTopUrlsPage = 1; fetchCreatorTopUrls()" placeholder="Search article slug..." class="h-9 w-48 sm:w-60 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#121215] px-3 pl-8 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                  <i data-lucide="search" class="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5"></i>
                </div>

                <!-- Sort Dropdown -->
                <select x-model="creatorTopUrlSort" @change="creatorTopUrlsPage = 1; fetchCreatorTopUrls()" class="h-9 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#121215] px-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                  <option value="saves_desc">Highest Saves</option>
                  <option value="pins_desc">Most Pins</option>
                  <option value="avg_saves_desc">Highest Avg Saves/Pin</option>
                  <option value="repins_desc">Highest Repins</option>
                  <option value="newest">Most Recent Pin</option>
                </select>

                <button @click="fetchCreatorTopUrls()" class="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition cursor-pointer">
                  <i data-lucide="refresh-cw" class="w-3.5 h-3.5" :class="isLoadingTopUrls ? 'animate-spin' : ''"></i>
                  <span>Refresh</span>
                </button>
              </div>
            </div>

            <!-- Table Card -->
            <div class="rounded-2xl border border-slate-200/90 dark:border-[#27272A] bg-white dark:bg-[#18181B] shadow-xs overflow-hidden">
              <div class="overflow-x-auto">
                <table class="w-full text-left text-xs text-slate-600 dark:text-slate-400">
                  <thead class="bg-slate-50 dark:bg-slate-900/60 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-[#27272A]">
                    <tr>
                      <th class="py-3 px-4">Article / Destination Slug</th>
                      <th class="py-3 px-3">Type</th>
                      <th class="py-3 px-3 text-right">Pins Driving URL</th>
                      <th class="py-3 px-3 text-right">Total Saves</th>
                      <th class="py-3 px-3 text-right">Avg Saves / Pin</th>
                      <th class="py-3 px-3 text-right">Repins</th>
                      <th class="py-3 px-3">First Seen</th>
                      <th class="py-3 px-3">Last Pin</th>
                      <th class="py-3 px-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60 font-sans">
                    <template x-for="item in activeCreatorTopUrls" :key="item.clean_slug">
                      <tr class="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                        <!-- Slug -->
                        <td class="py-3 px-4">
                          <div class="flex items-center gap-2">
                            <span class="font-bold text-slate-900 dark:text-white text-xs truncate max-w-md" :title="item.clean_slug" x-text="item.clean_slug"></span>
                            <span class="text-[10px] text-slate-400 font-mono tabular-nums" x-text="'(' + item.domain + ')'"></span>
                          </div>
                        </td>
                        <!-- Type -->
                        <td class="py-3 px-3">
                          <template x-if="item.is_affiliate">
                            <span class="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400 border border-amber-500/20">🛒 Affiliate</span>
                          </template>
                          <template x-if="!item.is_affiliate && item.is_product">
                            <span class="rounded-full bg-purple-500/10 px-2 py-0.5 text-[10px] font-bold text-purple-600 dark:text-purple-400 border border-purple-500/20">🛍️ Product</span>
                          </template>
                          <template x-if="!item.is_affiliate && !item.is_product">
                            <span class="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">📰 Article</span>
                          </template>
                        </td>
                        <!-- Pins Count -->
                        <td class="py-3 px-3 text-right font-mono tabular-nums font-bold text-slate-900 dark:text-white" x-text="formatNumber(item.pin_count)"></td>
                        <!-- Total Saves -->
                        <td class="py-3 px-3 text-right font-mono tabular-nums font-extrabold text-amber-600 dark:text-amber-400" x-text="formatNumber(item.total_saves)"></td>
                        <!-- Avg Saves -->
                        <td class="py-3 px-3 text-right font-mono tabular-nums font-bold text-indigo-600 dark:text-indigo-400" x-text="formatNumber(item.avg_saves)"></td>
                        <!-- Repins -->
                        <td class="py-3 px-3 text-right font-mono tabular-nums text-slate-500 dark:text-slate-400" x-text="formatNumber(item.total_repins)"></td>
                        <!-- First Seen -->
                        <td class="py-3 px-3 text-[11px] text-slate-400" x-text="item.first_pin_date ? item.first_pin_date.slice(0, 10) : '—'"></td>
                        <!-- Last Pin -->
                        <td class="py-3 px-3 text-[11px] text-slate-400 font-medium" x-text="item.last_pin_date ? item.last_pin_date.slice(0, 10) : '—'"></td>
                        <!-- Open Link Button -->
                        <td class="py-3 px-3 text-center">
                          <a :href="safeUrl(item.sample_url)" target="_blank" rel="noopener noreferrer" class="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-emerald-500 transition" title="Open Article in New Tab">
                            <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                          </a>
                        </td>
                      </tr>
                    </template>
                  </tbody>
                </table>
              </div>

              <!-- Empty State -->
              <template x-if="!isLoadingTopUrls && activeCreatorTopUrls.length === 0">
                <div class="py-12 text-center text-slate-400">
                  <i data-lucide="link" class="w-8 h-8 mx-auto mb-2 opacity-50"></i>
                  <p class="text-xs font-semibold">No destination URLs found matching your criteria.</p>
                </div>
              </template>

              <!-- Pagination Bar -->
              <div class="flex items-center justify-between p-4 border-t border-slate-200 dark:border-[#27272A] text-xs text-slate-500 dark:text-slate-400">
                <span x-text="'Showing ' + activeCreatorTopUrls.length + ' of ' + formatNumber(creatorTopUrlsTotal) + ' unique URLs'"></span>
                <div class="flex items-center gap-1.5">
                  <button @click="if (creatorTopUrlsPage > 1) { creatorTopUrlsPage--; fetchCreatorTopUrls(); }" :disabled="creatorTopUrlsPage <= 1" class="h-8 px-3 rounded-lg border border-slate-200 dark:border-[#27272A] disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 font-semibold cursor-pointer">Previous</button>
                  <span class="px-2 font-mono tabular-nums" x-text="creatorTopUrlsPage + ' / ' + creatorTopUrlsTotalPages"></span>
                  <button @click="if (creatorTopUrlsPage < creatorTopUrlsTotalPages) { creatorTopUrlsPage++; fetchCreatorTopUrls(); }" :disabled="creatorTopUrlsPage >= creatorTopUrlsTotalPages" class="h-8 px-3 rounded-lg border border-slate-200 dark:border-[#27272A] disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 font-semibold cursor-pointer">Next</button>
                </div>
              </div>
            </div>
          </div>

          <!-- ======================================================== -->
          <!-- SUB-VIEW: ACCOUNT RELATED PINS & INTERSECTIONS RADAR     -->
          <!-- ======================================================== -->
          <div x-show="activeCreatorTab === 'related_pins'" class="space-y-5">
            <!-- Header & Action Bar -->
            <div class="rounded-2xl border border-slate-200/90 dark:border-[#27272A] bg-white dark:bg-[#18181B] p-5 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <div class="flex items-center gap-2">
                  <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500 font-bold text-sm">🕸️</span>
                  <h3 class="text-base font-extrabold text-slate-900 dark:text-white">Related Pins Radar (Account Intersections)</h3>
                  <span class="px-2 py-0.5 rounded text-[10px] font-mono tabular-nums bg-amber-500/10 border border-amber-500/20 text-amber-600 font-bold">100% Zero-Cookie</span>
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
          </div>

          <!-- ======================================================== -->
          <!-- SUB-VIEW 4: PINTEREST BOARDS STRATEGY & SEMANTICS         -->
          <!-- Full-Featured, Modern Visual Intelligence & Harvest Suite -->
          <!-- ======================================================== -->
          <div x-show="activeCreatorTab === 'boards'" class="space-y-6">

            <!-- 1. Master Strategy Header & Actions Bar -->
            <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-[#18181B] p-5 rounded-2xl border border-slate-200/90 dark:border-[#27272A] shadow-xs">
              <div>
                <div class="flex items-center gap-2">
                  <span class="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 font-bold text-base">📌</span>
                  <h3 class="text-base font-bold text-slate-900 dark:text-white">Curated Boards &amp; Topic Strategy</h3>
                  <span class="text-xs font-mono tabular-nums font-bold px-2.5 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20" x-text="(activeCreatorBoards.length || activeCreator.total_boards || 0) + ' boards'"></span>
                </div>
                <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">Deep inspection of public Pinterest boards, cover visuals, follower reach, and algorithmic Related Interests (board_vase).</p>
              </div>
              <div class="flex items-center flex-wrap gap-2">
                <button type="button" @click="syncCompetitorBoardsAction(activeCreator)" :disabled="isSyncingBoards" class="px-4 py-2 rounded-xl text-xs font-bold bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition active:scale-95 disabled:opacity-50 flex items-center space-x-1.5 shadow-2xs cursor-pointer">
                  <i data-lucide="refresh-cw" :class="{'animate-spin text-purple-500': isSyncingBoards}" class="w-3.5 h-3.5"></i>
                  <span x-text="isSyncingBoards ? 'Syncing...' : 'Sync Boards (Pinterest)'"></span>
                </button>
                <button type="button" @click="openGhaCrawlerModal(activeCreator)" :disabled="isDispatchingGitHubCrawl" class="px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white transition active:scale-95 disabled:opacity-50 flex items-center space-x-1.5 shadow-sm cursor-pointer" title="Crawl all creator boards using 20-Shard GitHub Actions Crawler">
                  <i data-lucide="zap" :class="{'animate-spin': isDispatchingGitHubCrawl}" class="w-3.5 h-3.5"></i>
                  <span>⚡ Harvest All Boards (20 Shards)</span>
                </button>
              </div>
            </div>

            <!-- 2. Board Strategy KPI Summary Cards -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
              <div class="bg-white dark:bg-[#18181B] rounded-2xl border border-slate-200/90 dark:border-[#27272A] p-4 shadow-2xs">
                <div class="flex items-center justify-between text-slate-400 mb-1">
                  <span class="text-[10.5px] font-bold uppercase tracking-wider">Curated Boards</span>
                  <i data-lucide="layout-grid" class="w-4 h-4 text-purple-500"></i>
                </div>
                <span class="text-2xl font-black text-slate-900 dark:text-white font-mono tabular-nums block" x-text="activeCreatorBoards.length || activeCreator.total_boards || 0"></span>
                <span class="text-[11px] text-slate-500 mt-1 block">Public thematic boards</span>
              </div>

              <div class="bg-white dark:bg-[#18181B] rounded-2xl border border-slate-200/90 dark:border-[#27272A] p-4 shadow-2xs">
                <div class="flex items-center justify-between text-slate-400 mb-1">
                  <span class="text-[10.5px] font-bold uppercase tracking-wider">Board Pins</span>
                  <i data-lucide="layers" class="w-4 h-4 text-indigo-500"></i>
                </div>
                <span class="text-2xl font-black text-slate-900 dark:text-white font-mono tabular-nums block" x-text="formatNumber(creatorBoardsTotalPins)"></span>
                <span class="text-[11px] text-slate-500 mt-1 block">Curated across all boards</span>
              </div>

              <div class="bg-white dark:bg-[#18181B] rounded-2xl border border-slate-200/90 dark:border-[#27272A] p-4 shadow-2xs">
                <div class="flex items-center justify-between text-slate-400 mb-1">
                  <span class="text-[10.5px] font-bold uppercase tracking-wider">Board Audience</span>
                  <i data-lucide="users" class="w-4 h-4 text-emerald-500"></i>
                </div>
                <span class="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono tabular-nums block" x-text="formatNumber(creatorBoardsTotalFollowers)"></span>
                <span class="text-[11px] text-slate-500 mt-1 block">Verified profile reach</span>
              </div>

              <div class="bg-white dark:bg-[#18181B] rounded-2xl border border-slate-200/90 dark:border-[#27272A] p-4 shadow-2xs">
                <div class="flex items-center justify-between text-slate-400 mb-1">
                  <span class="text-[10.5px] font-bold uppercase tracking-wider">Top Board</span>
                  <i data-lucide="trophy" class="w-4 h-4 text-amber-500"></i>
                </div>
                <span class="text-sm font-bold text-slate-900 dark:text-white truncate block" :title="activeCreatorBoards[0]?.name || 'None'" x-text="activeCreatorBoards[0]?.name || 'N/A'"></span>
                <span class="text-[11px] text-amber-600 dark:text-amber-400 font-mono tabular-nums font-bold mt-1 block" x-text="formatNumber(activeCreatorBoards[0]?.pin_count || 0) + ' pins'"></span>
              </div>
            </div>

            <!-- 3. Discovered Algorithmic Related Interests (board_vase) -->
            <div x-show="creatorBoardsTopicsList.length > 0" class="rounded-2xl border border-purple-500/20 bg-gradient-to-r from-purple-500/5 via-sky-500/5 to-indigo-500/5 dark:from-purple-950/20 dark:via-sky-950/20 dark:to-indigo-950/20 p-4 space-y-3">
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div class="flex items-center gap-2">
                  <span class="flex h-5 w-5 items-center justify-center rounded-lg bg-purple-500/20 text-purple-600 dark:text-purple-400 text-xs">✨</span>
                  <span class="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">Pinterest Algorithmic Topics (<code class="text-purple-600 dark:text-purple-400 font-mono tabular-nums">board_vase</code> Semantic Interests)</span>
                  <span class="text-[10px] font-mono tabular-nums font-bold px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400" x-text="creatorBoardsTopicsList.length + ' topics'"></span>
                </div>
                <button type="button" x-show="creatorBoardSelectedTopic" @click="creatorBoardSelectedTopic = ''; creatorBoardPage = 1" class="text-[11px] font-bold text-rose-500 hover:underline flex items-center gap-1 cursor-pointer">
                  <i data-lucide="x" class="w-3 h-3"></i>
                  <span>Clear Topic Filter</span>
                </button>
              </div>

              <!-- Topic Chips Flow -->
              <div class="flex flex-wrap gap-1.5 items-center max-h-32 overflow-y-auto pr-1">
                <button type="button" @click="creatorBoardSelectedTopic = ''; creatorBoardPage = 1" class="px-2.5 py-1 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1" :class="!creatorBoardSelectedTopic ? 'bg-purple-600 text-white shadow-2xs' : 'bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-[#27272A] text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'">
                  <span>All Topics</span>
                </button>
                <template x-for="item in creatorBoardsTopicsList" :key="item.text">
                  <button type="button" @click="creatorBoardSelectedTopic = (creatorBoardSelectedTopic === item.text ? '' : item.text); creatorBoardPage = 1" class="px-2.5 py-1 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 shadow-2xs" :class="creatorBoardSelectedTopic === item.text ? 'bg-purple-600 text-white font-bold' : 'bg-white dark:bg-[#18181B] border border-slate-200/90 dark:border-[#27272A] text-slate-700 dark:text-slate-300 hover:border-purple-400/50 hover:bg-purple-50/50 dark:hover:bg-purple-950/20'">
                    <span class="text-purple-500 font-bold">#</span>
                    <span x-text="item.text"></span>
                    <span class="text-[10px] font-mono tabular-nums px-1.5 py-0.2 rounded-full" :class="creatorBoardSelectedTopic === item.text ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'" x-text="item.count"></span>
                  </button>
                </template>
              </div>
            </div>

            <!-- 4. Interactive Toolbar: Search, Sort & View Mode Switcher -->
            <div class="rounded-2xl border border-slate-200/90 dark:border-[#27272A] bg-white dark:bg-[#18181B] p-4 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <!-- Search bar -->
              <div class="relative flex-1 min-w-[240px]">
                <i data-lucide="search" class="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"></i>
                <input
                  type="text"
                  x-model="creatorBoardSearch"
                  @input="creatorBoardPage = 1"
                  placeholder="Filter boards by title, topic, or keyword..."
                  class="w-full pl-9 pr-9 py-2 text-xs rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50/50 dark:bg-slate-900/50 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:border-purple-500 transition"
                >
                <button
                  type="button"
                  x-show="creatorBoardSearch"
                  @click="creatorBoardSearch = ''; creatorBoardPage = 1"
                  class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  <i data-lucide="x" class="w-3.5 h-3.5"></i>
                </button>
              </div>

              <!-- Sort, View Mode & Count -->
              <div class="flex items-center flex-wrap gap-2.5">
                <!-- Sort Select -->
                <div class="flex items-center gap-1.5 text-xs text-slate-500">
                  <i data-lucide="arrow-up-down" class="w-3.5 h-3.5 text-slate-400"></i>
                  <select
                    x-model="creatorBoardSort"
                    @change="creatorBoardPage = 1"
                    class="rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50/50 dark:bg-slate-900/50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-hidden focus:border-purple-500 transition cursor-pointer"
                  >
                    <option value="most_pins">🔥 Most Pins</option>
                    <option value="most_followers">👥 Most Followers</option>
                    <option value="recent_activity">🕒 Recent Activity</option>
                    <option value="name_asc">🔤 Name (A-Z)</option>
                    <option value="creation_date">📅 Creation Date</option>
                  </select>
                </div>

                <!-- View Toggle Buttons -->
                <div class="flex items-center rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50/50 dark:bg-slate-900/50 p-0.5">
                  <button
                    type="button"
                    @click="creatorBoardsViewMode = 'grid'"
                    class="px-2.5 py-1 text-xs font-bold rounded-lg transition flex items-center gap-1 cursor-pointer"
                    :class="creatorBoardsViewMode === 'grid' ? 'bg-white dark:bg-[#121215] text-purple-600 dark:text-purple-400 shadow-2xs' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'"
                    title="Grid Cards View"
                  >
                    <i data-lucide="layout-grid" class="w-3.5 h-3.5"></i>
                    <span class="hidden sm:inline">Grid</span>
                  </button>
                  <button
                    type="button"
                    @click="creatorBoardsViewMode = 'table'"
                    class="px-2.5 py-1 text-xs font-bold rounded-lg transition flex items-center gap-1 cursor-pointer"
                    :class="creatorBoardsViewMode === 'table' ? 'bg-white dark:bg-[#121215] text-purple-600 dark:text-purple-400 shadow-2xs' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'"
                    title="Data Table View"
                  >
                    <i data-lucide="table" class="w-3.5 h-3.5"></i>
                    <span class="hidden sm:inline">Table</span>
                  </button>
                </div>

                <!-- Total Count Pill -->
                <span class="inline-flex items-center rounded-xl bg-purple-500/10 px-3 py-1.5 text-xs font-mono tabular-nums font-bold text-purple-600 dark:text-purple-400 border border-purple-500/20" x-text="filteredCreatorBoards.length + ' / ' + activeCreatorBoards.length"></span>
              </div>
            </div>

            <!-- Loading Skeleton -->
            <div x-show="isLoadingBoards" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-pulse">
              <template x-for="i in 8" :key="i">
                <div class="rounded-2xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] overflow-hidden p-4 space-y-3">
                  <div class="h-36 bg-slate-200 dark:bg-slate-800 rounded-xl"></div>
                  <div class="h-4 bg-slate-200 dark:bg-slate-800 rounded-md w-3/4"></div>
                  <div class="h-3 bg-slate-200 dark:bg-slate-800 rounded-md w-1/2"></div>
                  <div class="flex gap-2 pt-2">
                    <div class="h-8 bg-slate-200 dark:bg-slate-800 rounded-lg flex-1"></div>
                    <div class="h-8 bg-slate-200 dark:bg-slate-800 rounded-lg flex-1"></div>
                  </div>
                </div>
              </template>
            </div>

            <!-- VIEW 1: PREMIUM GRID CARDS -->
            <div x-show="!isLoadingBoards && creatorBoardsViewMode === 'grid'" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              <template x-for="b in paginatedCreatorBoards" :key="b.id || b.board_id">
                <div class="group relative flex flex-col rounded-2xl border border-slate-200/90 dark:border-[#27272A] bg-white dark:bg-[#18181B] overflow-hidden shadow-xs hover:shadow-md hover:border-purple-500/40 dark:hover:border-purple-500/40 transition-all duration-200">
                  
                  <!-- Board Visual Header & Cover Image -->
                  <div class="relative h-44 w-full overflow-hidden bg-slate-100 dark:bg-slate-900">
                    <template x-if="b.image_cover_url">
                      <img :src="b.image_cover_url" :alt="b.name" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                    </template>
                    <template x-if="!b.image_cover_url">
                      <div class="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-purple-600/20 via-sky-600/10 to-indigo-600/20 p-4 text-center">
                        <i data-lucide="layout-grid" class="w-10 h-10 text-purple-400 opacity-60 mb-1"></i>
                        <span class="text-xs font-bold text-slate-600 dark:text-slate-300 line-clamp-1" x-text="b.name"></span>
                      </div>
                    </template>

                    <!-- Gradient Vignette Overlay -->
                    <div class="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/30 to-transparent"></div>

                    <!-- Top Floating Header Badges -->
                    <div class="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between">
                      <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-900/70 backdrop-blur-md text-white border border-white/10 shadow-xs">
                        <i data-lucide="bookmark" class="w-2.5 h-2.5 text-purple-400"></i>
                        <span>Board</span>
                      </span>
                      <a :href="safeUrl(b.url || ('https://www.pinterest.com/' + (activeCreator.username || '').replace(/^@+/, '') + '/' + encodeURIComponent(b.name.toLowerCase().replace(/\s+/g, '-'))))" target="_blank" rel="noopener noreferrer" class="p-1.5 rounded-full bg-slate-900/70 backdrop-blur-md text-white/80 hover:text-white hover:bg-slate-900 transition border border-white/10 shadow-xs" title="Open on Pinterest">
                        <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                      </a>
                    </div>

                    <!-- Bottom Floating Stats Pills -->
                    <div class="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between">
                      <div class="flex items-center gap-1.5">
                        <span class="px-2 py-0.5 rounded-lg text-[10.5px] font-mono tabular-nums font-bold bg-purple-500/90 backdrop-blur-md text-white shadow-xs flex items-center gap-1">
                          <i data-lucide="pin" class="w-3 h-3"></i>
                          <span x-text="formatNumber(b.pin_count) + ' pins'"></span>
                        </span>
                        <span class="px-2 py-0.5 rounded-lg text-[10.5px] font-mono tabular-nums font-semibold bg-slate-900/80 backdrop-blur-md text-slate-200 border border-white/10 flex items-center gap-1">
                          <i data-lucide="users" class="w-3 h-3 text-emerald-400"></i>
                          <span x-text="formatNumber(b.follower_count || 0)"></span>
                        </span>
                      </div>
                    </div>
                  </div>

                  <!-- Board Details & Semantics Body -->
                  <div class="p-4 flex-1 flex flex-col justify-between space-y-3">
                    <div>
                      <h4 @click="openBoardPage(b, activeCreator)" class="font-bold text-sm text-slate-900 dark:text-white line-clamp-1 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition cursor-pointer" :title="b.name" x-text="b.name"></h4>
                      <p class="text-[11px] text-slate-500 line-clamp-1 mt-0.5" x-text="b.description || 'No description provided.'"></p>

                      <div class="flex items-center gap-2 mt-2 text-[10.5px] text-slate-400 font-sans">
                        <span class="flex items-center gap-1">
                          <i data-lucide="clock" class="w-3 h-3 text-slate-400"></i>
                          <span x-text="b.last_pinned_at ? ('Active ' + new Date(b.last_pinned_at).toLocaleDateString()) : (b.created_at ? ('Created ' + new Date(b.created_at).toLocaleDateString()) : 'Active')"></span>
                        </span>
                      </div>

                      <!-- Discovered Semantic Related Interests (board_vase) -->
                      <div class="mt-2.5 pt-2 border-t border-slate-100 dark:border-[#27272A]/80">
                        <div class="flex items-center gap-1 mb-1.5">
                          <i data-lucide="sparkles" class="w-3 h-3 text-purple-400"></i>
                          <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Semantic Topics</span>
                        </div>
                        <template x-if="b.board_vase && b.board_vase.length > 0">
                          <div class="flex flex-wrap gap-1">
                            <template x-for="v in b.board_vase.slice(0, 3)" :key="v.text || v">
                              <span @click="creatorBoardSearch = (v.text || v); creatorBoardPage = 1" class="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 hover:bg-purple-500/20 cursor-pointer transition" :title="'Filter boards by: ' + (v.text || v)">
                                <span>#</span><span x-text="v.text || v"></span>
                              </span>
                            </template>
                            <span x-show="b.board_vase.length > 3" class="px-1.5 py-0.5 rounded-md text-[10px] font-mono tabular-nums text-slate-400 bg-slate-100 dark:bg-slate-800" x-text="'+' + (b.board_vase.length - 3)"></span>
                          </div>
                        </template>
                        <template x-if="!b.board_vase || b.board_vase.length === 0">
                          <span class="text-[10px] text-slate-400 italic">No semantic tags discovered yet</span>
                        </template>
                      </div>
                    </div>

                    <!-- Action Buttons Footer -->
                    <div class="pt-2 border-t border-slate-100 dark:border-[#27272A] flex items-center gap-1.5">
                      <button
                        type="button"
                        @click="openBoardPage(b, activeCreator)"
                        class="flex-1 py-1.5 px-2 rounded-xl text-xs font-bold bg-purple-500/10 hover:bg-purple-500/20 text-purple-700 dark:text-purple-300 border border-purple-500/30 transition active:scale-95 flex items-center justify-center gap-1 cursor-pointer"
                        title="Open Dedicated Board Intelligence Page"
                      >
                        <i data-lucide="layout-grid" class="w-3.5 h-3.5"></i>
                        <span>Inspect</span>
                      </button>

                      <button
                        type="button"
                        @click="openBoardSectionsModal(b.id || b.board_id, b.name)"
                        class="py-1.5 px-2 rounded-xl text-xs font-bold bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 transition active:scale-95 flex items-center justify-center gap-1 cursor-pointer"
                        title="Inspect Board Subsections & Internal Taxonomies"
                      >
                        <i data-lucide="folder" class="w-3.5 h-3.5 text-amber-500"></i>
                        <span>Sections</span>
                      </button>

                      <button
                        type="button"
                        @click="crawlSingleBoardGha(b.name)"
                        class="py-1.5 px-2 rounded-xl text-xs font-bold bg-sky-500/10 hover:bg-sky-500/20 text-sky-700 dark:text-sky-300 border border-sky-500/30 transition active:scale-95 flex items-center justify-center gap-1 cursor-pointer"
                        title="Harvest this specific board via GitHub Actions 20-Shard Crawler"
                      >
                        <i data-lucide="zap" class="w-3.5 h-3.5 text-sky-500"></i>
                        <span>Crawl</span>
                      </button>
                    </div>

                  </div>
                </div>
              </template>
            </div>

            <!-- VIEW 2: HIGH-DENSITY DATA TABLE -->
            <div x-show="!isLoadingBoards && creatorBoardsViewMode === 'table'" class="border border-slate-200/90 dark:border-[#27272A] rounded-2xl overflow-hidden bg-white dark:bg-[#18181B] shadow-xs">
              <div class="overflow-x-auto min-w-full">
                <table class="w-full text-left text-xs border-collapse">
                  <thead class="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-[#27272A] text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th class="py-3 px-4 w-12">Cover</th>
                      <th class="py-3 px-4">Board Name &amp; Description</th>
                      <th class="py-3 px-4 w-48">Pin Inventory</th>
                      <th class="py-3 px-4 text-right">Followers</th>
                      <th class="py-3 px-4">Algorithmic Topics</th>
                      <th class="py-3 px-4 text-center">Last Activity</th>
                      <th class="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono tabular-nums">
                    <template x-for="b in paginatedCreatorBoards" :key="b.id || b.board_id">
                      <tr class="hover:bg-slate-50/80 dark:hover:bg-slate-900/40 transition">
                        
                        <!-- Thumbnail Column -->
                        <td class="py-3 px-4">
                          <div class="w-11 h-11 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-[#27272A] shrink-0">
                            <template x-if="b.image_cover_url">
                              <img :src="b.image_cover_url" :alt="b.name" class="w-full h-full object-cover" loading="lazy" />
                            </template>
                            <template x-if="!b.image_cover_url">
                              <div class="w-full h-full flex items-center justify-center bg-purple-500/10 text-purple-500">
                                <i data-lucide="layout-grid" class="w-4 h-4"></i>
                              </div>
                            </template>
                          </div>
                        </td>

                        <!-- Name & Desc Column -->
                        <td class="py-3 px-4 font-sans">
                          <button type="button" @click="openBoardPage(b, activeCreator)" class="font-bold text-slate-900 dark:text-white hover:text-purple-600 dark:hover:text-purple-400 line-clamp-1 inline-flex items-center gap-1.5 cursor-pointer text-left">
                            <span x-text="b.name"></span>
                            <i data-lucide="arrow-right" class="w-3 h-3 text-purple-400"></i>
                          </button>
                          <div class="text-[11px] text-slate-400 line-clamp-1 mt-0.5" x-text="b.description || 'Curated collection'"></div>
                        </td>

                        <!-- Pin Count & Relative Progress Column -->
                        <td class="py-3 px-4 font-sans">
                          <div class="flex items-center justify-between text-xs font-bold text-slate-900 dark:text-white font-mono tabular-nums mb-1">
                            <span x-text="formatNumber(b.pin_count)"></span>
                            <span class="text-[10px] text-slate-400 font-normal" x-text="Math.round(((b.pin_count || 0) / creatorBoardsMaxPins) * 100) + '% of top'"></span>
                          </div>
                          <div class="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                            <div class="h-full rounded-full bg-gradient-to-r from-purple-500 to-indigo-500" :style="'width: ' + Math.min(100, Math.max(4, Math.round(((b.pin_count || 0) / creatorBoardsMaxPins) * 100))) + '%'"></div>
                          </div>
                        </td>

                        <!-- Followers Column -->
                        <td class="py-3 px-4 text-right font-bold text-slate-700 dark:text-slate-300 font-mono tabular-nums" x-text="formatNumber(b.follower_count || 0)"></td>

                        <!-- Topics Column -->
                        <td class="py-3 px-4 font-sans">
                          <template x-if="b.board_vase && b.board_vase.length > 0">
                            <div class="flex flex-wrap gap-1 max-w-xs">
                              <template x-for="v in b.board_vase.slice(0, 2)" :key="v.text || v">
                                <span class="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20" x-text="'#' + (v.text || v)"></span>
                              </template>
                              <span x-show="b.board_vase.length > 2" class="px-1.5 py-0.5 rounded-md text-[10px] font-mono tabular-nums text-slate-400 bg-slate-100 dark:bg-slate-800" x-text="'+' + (b.board_vase.length - 2)"></span>
                            </div>
                          </template>
                          <template x-if="!b.board_vase || b.board_vase.length === 0">
                            <span class="text-[10px] text-slate-400 italic">—</span>
                          </template>
                        </td>

                        <!-- Last Activity Column -->
                        <td class="py-3 px-4 text-center font-sans">
                          <span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-[#27272A]" x-text="b.last_pinned_at ? new Date(b.last_pinned_at).toLocaleDateString() : 'Active'"></span>
                        </td>

                        <!-- Action Buttons Column -->
                        <td class="py-3 px-4 text-right font-sans">
                          <div class="inline-flex items-center gap-1.5 justify-end">
                            <button
                              type="button"
                              @click="openBoardPage(b, activeCreator)"
                              class="px-2.5 py-1 rounded-lg border border-purple-500/30 bg-purple-500/10 text-purple-600 dark:text-purple-400 text-[11px] font-bold hover:bg-purple-500/20 transition cursor-pointer"
                              title="Open Dedicated Board Intelligence Page"
                            >
                              <i data-lucide="layout-grid" class="w-3 h-3 inline"></i>
                              <span>Inspect</span>
                            </button>
                            <button
                              type="button"
                              @click="openBoardSectionsModal(b.id || b.board_id, b.name)"
                              class="px-2.5 py-1 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[11px] font-bold hover:bg-amber-500/20 transition cursor-pointer"
                              title="Inspect Board Subsections"
                            >
                              <i data-lucide="folder" class="w-3 h-3 inline text-amber-500"></i>
                              <span>Sections</span>
                            </button>
                            <button
                              type="button"
                              @click="crawlSingleBoardGha(b.name)"
                              class="px-2.5 py-1 rounded-lg border border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400 text-[11px] font-bold hover:bg-sky-500/20 transition cursor-pointer"
                              title="Crawl on GitHub Actions"
                            >
                              <i data-lucide="zap" class="w-3 h-3 inline"></i>
                              <span>Crawl</span>
                            </button>
                          </div>
                        </td>

                      </tr>
                    </template>
                  </tbody>
                </table>
              </div>
            </div>

            <!-- Empty State -->
            <div x-show="!isLoadingBoards && filteredCreatorBoards.length === 0" class="p-12 text-center rounded-2xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B]">
              <i data-lucide="folder-search" class="w-12 h-12 mx-auto mb-3 opacity-40 text-purple-500"></i>
              <h4 class="font-bold text-sm text-slate-900 dark:text-white">No boards match your filter</h4>
              <p class="text-xs text-slate-500 mt-1 max-w-sm mx-auto">Try clearing your search keyword, resetting topic filters, or sync public boards from Pinterest.</p>
              <div class="mt-4 flex items-center justify-center gap-2">
                <button type="button" @click="creatorBoardSearch = ''; creatorBoardSelectedTopic = ''; creatorBoardPage = 1" class="px-3 py-1.5 rounded-xl text-xs font-bold border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 transition cursor-pointer">
                  <span>Clear Filters</span>
                </button>
                <button type="button" @click="syncCompetitorBoardsAction(activeCreator)" class="px-3 py-1.5 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white transition cursor-pointer shadow-sm">
                  <span>Sync Boards Now</span>
                </button>
              </div>
            </div>

            <!-- Pagination Bar -->
            <div x-show="!isLoadingBoards && filteredCreatorBoards.length > 0" class="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-200 dark:border-[#27272A] pt-4 text-xs text-slate-500">
              <span x-text="'Showing ' + (filteredCreatorBoards.length > 0 ? ((creatorBoardPage - 1) * (creatorBoardPageSize || 12) + 1) : 0) + '-' + Math.min(creatorBoardPage * (creatorBoardPageSize || 12), filteredCreatorBoards.length) + ' of ' + filteredCreatorBoards.length + ' boards'"></span>
              <div class="flex items-center gap-2">
                <button @click="creatorBoardPage = Math.max(1, creatorBoardPage - 1)" :disabled="creatorBoardPage <= 1" class="rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 disabled:opacity-40 transition shadow-2xs cursor-pointer">Previous</button>
                <span class="font-bold text-slate-900 dark:text-white font-mono tabular-nums px-1" x-text="'Page ' + creatorBoardPage + ' of ' + Math.max(1, Math.ceil(filteredCreatorBoards.length / (creatorBoardPageSize || 12)))"></span>
                <button @click="creatorBoardPage = creatorBoardPage + 1" :disabled="creatorBoardPage >= Math.ceil(filteredCreatorBoards.length / (creatorBoardPageSize || 12))" class="rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 disabled:opacity-40 transition shadow-2xs cursor-pointer">Next</button>
              </div>
            </div>

          </div>

        </div>
      </template>
    </div>



    </div> <!-- Close !activePinId wrapper -->

  </main>

  <!-- Modal: Assign Existing Creators to Campaign Folder -->
  <div x-show="isAssignExistingCreatorModalOpen" x-cloak
       class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs"
       @keydown.escape.window="closeAssignExistingCreatorModal()">
    <div class="relative w-full max-w-xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] shadow-2xl p-5 space-y-4 max-h-[85vh] flex flex-col"
         @click.outside="closeAssignExistingCreatorModal()">
      <div class="flex items-center justify-between border-b border-slate-100 dark:border-[#27272A] pb-3 shrink-0">
        <div class="flex items-center gap-2.5">
          <div class="h-9 w-9 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold">
            <i data-lucide="user-check" class="w-5 h-5"></i>
          </div>
          <div>
            <h3 class="text-sm font-bold text-slate-900 dark:text-white">Assign Creators to Campaign Folder</h3>
            <p class="text-xs text-slate-500 dark:text-slate-400">Select creators from your catalog to monitor in this folder.</p>
          </div>
        </div>
        <button @click="closeAssignExistingCreatorModal()" class="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>

      <!-- Search Filter -->
      <div class="relative shrink-0">
        <i data-lucide="search" class="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"></i>
        <input type="text" x-model="assignCreatorSearch" placeholder="Search creators by username or display name..."
               class="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-[#27272A] text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500/40">
      </div>

      <!-- Creators List -->
      <div class="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[220px]">
        <template x-if="isAssignExistingCreatorModalOpen">
          <div class="space-y-2">
            <template x-for="c in (competitors || []).filter(comp => !assignCreatorSearch.trim() || (comp.username && comp.username.toLowerCase().includes(assignCreatorSearch.toLowerCase().replace('@', ''))) || (comp.display_name && comp.display_name.toLowerCase().includes(assignCreatorSearch.toLowerCase()))).slice(0, 100)" :key="c.id || c.username">
              <div class="p-2.5 rounded-xl border border-slate-200/80 dark:border-[#27272A] flex items-center justify-between gap-3 hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition">
                <div class="flex items-center gap-2.5 min-w-0">
                  <template x-if="c.image_url">
                    <img :src="c.image_url" class="w-8 h-8 rounded-full object-cover shrink-0 border border-slate-200 dark:border-[#27272A]">
                  </template>
                  <template x-if="!c.image_url">
                    <div class="w-8 h-8 rounded-full bg-purple-500/10 text-purple-600 flex items-center justify-center font-bold text-xs shrink-0">
                      <span x-text="(c.username || '?')[0].toUpperCase()"></span>
                    </div>
                  </template>
                  <div class="min-w-0">
                    <div class="flex items-center gap-1.5 truncate">
                      <span class="text-xs font-bold text-slate-900 dark:text-white truncate" x-text="c.display_name || c.username"></span>
                      <span class="text-[11px] font-mono tabular-nums text-slate-400 truncate" x-text="'@' + (c.username || '')"></span>
                    </div>
                    <div class="text-[10px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      <span x-text="(c.monthly_reach || 0).toLocaleString() + ' audience'"></span> • 
                      <span x-text="(c.total_pins || 0).toLocaleString() + ' pins'"></span>
                    </div>
                  </div>
                </div>

                <button type="button"
                        @click="assignCreatorToFolder(c.id, scopedFolderId)"
                        class="px-2.5 py-1 rounded-lg text-xs font-semibold transition shrink-0 cursor-pointer flex items-center gap-1"
                        :class="isCreatorInFolder(c.id, scopedFolderId)
                          ? 'bg-purple-600 text-white shadow-xs'
                          : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#27272A]'">
                  <span x-text="isCreatorInFolder(c.id, scopedFolderId) ? '✓ Linked' : '+ Link'"></span>
                </button>
              </div>
            </template>
          </div>
        </template>
      </div>

      <div class="flex items-center justify-between border-t border-slate-100 dark:border-[#27272A] pt-3 shrink-0">
        <span class="text-xs text-slate-400 font-mono tabular-nums" x-text="((folderCreatorMap[scopedFolderId] ? folderCreatorMap[scopedFolderId].size : (scopedFolderCreatorIds ? scopedFolderCreatorIds.size : 0)) || 0) + ' creators linked to this folder'"></span>
        <button @click="closeAssignExistingCreatorModal()" class="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition cursor-pointer">
          Done
        </button>
      </div>
    </div>
  </div>
`;
}
