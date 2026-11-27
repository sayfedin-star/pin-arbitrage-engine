/**
 * src/ui/watchlist/index.mjs
 *
 * Dedicated V4 Workspace Watchlist Page (/watchlist).
 * 3 workspace-isolated tabs: Creators (with Metrics Only <-> Metrics + Full Catalog toggle + instant pin filters),
 * Domains, and Saved Pins, plus manual + Add Creator and + Add Domain modals.
 * Strictly zero Auto-Promote and zero fake checkboxes.
 */

import { renderAppSidebar } from '../app-sidebar.mjs';
import { renderSharedDocumentHead } from '../shared-head.mjs';
import { renderPageBootstrapScript, renderClientJsScriptTag } from '../client-assets.mjs';

const TAB_ALIAS_MAP = {
  creator: 'creator',
  creators: 'creator',
  domain: 'domain',
  domains: 'domain',
  pin: 'pin',
  pins: 'pin'
};

export function getWatchlistPageHtml(initialTab = 'creator') {
  const normalized = String(initialTab || '').trim().toLowerCase();
  const safeTab = TAB_ALIAS_MAP[normalized] || 'creator';

  return `<!DOCTYPE html>
<html lang="en">
<head>
${renderSharedDocumentHead({
  title: 'Watchlist — Pin Arbitrage V4',
  referrerPolicy: 'no-referrer',
  tailwindScriptHtml: `  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          fontFamily: {
            sans: ['Geist', 'Inter', 'system-ui', 'sans-serif'],
            mono: ['JetBrains Mono', 'monospace']
          }
        }
      }
    };
  </script>`
})}
</head>
<body
  class="bg-[#F8FAFC] dark:bg-[#09090B] text-[#0F172A] dark:text-[#FAFAFA] font-sans antialiased min-h-screen transition-colors duration-200"
  x-data="watchlistApp()"
  x-init="init()"
  x-cloak>

${renderAppSidebar({
  activeNav: 'watchlist',
  refreshHandler: 'loadWatchlist()',
  refreshLoadingExpr: 'isLoading'
})}

  <main
    class="transition-all duration-300 ease-in-out md:ml-64 lg:ml-72 min-h-[calc(100vh-56px)]"
    :class="isSidebarCollapsed ? 'md:!ml-20' : 'md:ml-64 lg:ml-72'">

    <div class="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

      <!-- Header & Primary Manual Actions -->
      <div class="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 class="text-2xl font-bold tracking-tight text-slate-900 dark:text-[#FAFAFA]">Workspace Watchlist</h1>
          <p class="text-sm text-slate-500 dark:text-[#A1A1AA] mt-1">
            Workspace-isolated Creators, Domains, and Saved Pins. Toggle creator tracking directly between Metrics Only and Full Catalog (BoardFeedResource).
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            @click="showAddCreatorModal = true"
            class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold transition shadow-xs cursor-pointer">
            <i data-lucide="user-plus" class="w-3.5 h-3.5"></i>
            <span>+ Add Creator</span>
          </button>
          <button
            type="button"
            @click="showAddDomainModal = true"
            class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] hover:border-rose-400 text-slate-800 dark:text-[#FAFAFA] text-xs font-semibold transition shadow-2xs cursor-pointer">
            <i data-lucide="globe" class="w-3.5 h-3.5"></i>
            <span>+ Add Domain</span>
          </button>
        </div>
      </div>

      <!-- Tab Selector + Search Bar -->
      <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div class="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A]" role="tablist" aria-label="Watchlist Categories">
          <button
            type="button"
            role="tab"
            :aria-selected="activeTab === 'creator' ? 'true' : 'false'"
            @click="activeTab = 'creator'"
            class="px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5"
            :class="activeTab === 'creator' ? 'bg-white dark:bg-[#27272A] text-rose-600 dark:text-rose-400 shadow-2xs' : 'text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white'">
            <i data-lucide="users" class="w-3.5 h-3.5"></i>
            <span>Creators</span>
            <span class="font-mono tabular-nums text-[11px] opacity-80" x-text="'(' + (counts.creator || 0) + ')'">(0)</span>
          </button>
          <button
            type="button"
            role="tab"
            :aria-selected="activeTab === 'domain' ? 'true' : 'false'"
            @click="activeTab = 'domain'"
            class="px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5"
            :class="activeTab === 'domain' ? 'bg-white dark:bg-[#27272A] text-rose-600 dark:text-rose-400 shadow-2xs' : 'text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white'">
            <i data-lucide="globe" class="w-3.5 h-3.5"></i>
            <span>Domains</span>
            <span class="font-mono tabular-nums text-[11px] opacity-80" x-text="'(' + (counts.domain || 0) + ')'">(0)</span>
          </button>
          <button
            type="button"
            role="tab"
            :aria-selected="activeTab === 'pin' ? 'true' : 'false'"
            @click="activeTab = 'pin'"
            class="px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5"
            :class="activeTab === 'pin' ? 'bg-white dark:bg-[#27272A] text-rose-600 dark:text-rose-400 shadow-2xs' : 'text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white'">
            <i data-lucide="bookmark" class="w-3.5 h-3.5"></i>
            <span>Saved Pins</span>
            <span class="font-mono tabular-nums text-[11px] opacity-80" x-text="'(' + (counts.pin || 0) + ')'">(0)</span>
          </button>
        </div>

        <div class="relative flex-1 max-w-md">
          <i data-lucide="search" class="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"></i>
          <input
            type="text"
            x-model="searchQuery"
            placeholder="Filter watched @creators, domains, or pins..."
            aria-label="Filter Watchlist"
            class="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-[#FAFAFA] focus:outline-none focus:ring-2 focus:ring-rose-500" />
        </div>
      </div>

      <!-- Error Banner -->
      <template x-if="errorMessage">
        <div class="px-4 py-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-500/30 text-xs text-rose-700 dark:text-rose-300" x-text="errorMessage"></div>
      </template>

      <!-- TAB 1: CREATORS -->
      <template x-if="activeTab === 'creator'">
        <div class="space-y-5">
          <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl overflow-hidden shadow-2xs">
            <div class="overflow-x-auto">
              <table class="w-full text-left border-collapse">
                <thead>
                  <tr class="border-b border-slate-200 dark:border-[#27272A] bg-slate-50/70 dark:bg-[#18181B]/60 text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-[#71717A]">
                    <th class="px-4 py-3">Creator</th>
                    <th class="px-4 py-3 text-right">Monthly Reach</th>
                    <th class="px-4 py-3 text-right">Catalog Pins</th>
                    <th class="px-4 py-3">Tracking Mode</th>
                    <th class="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 dark:divide-[#27272A] text-xs">
                  <template x-for="item in filteredCreators" :key="item.id">
                    <tr class="hover:bg-slate-50/80 dark:hover:bg-[#18181B]/60 transition">
                      <td class="px-4 py-3">
                        <div class="flex items-center gap-3">
                          <template x-if="safeImg(item.creator_avatar_url)">
                            <img :src="safeImg(item.creator_avatar_url)" alt="" loading="lazy" referrerpolicy="no-referrer" class="w-9 h-9 rounded-full object-cover border border-slate-200 dark:border-[#27272A] shrink-0" />
                          </template>
                          <div class="min-w-0">
                            <a :href="'/' + encodeURIComponent(item.entity_key)" class="font-semibold text-slate-900 dark:text-[#FAFAFA] hover:text-rose-600 dark:hover:text-rose-400" x-text="'@' + item.entity_key"></a>
                            <div class="text-[11px] text-slate-400 dark:text-[#71717A] truncate" x-text="item.creator_display_name || item.notes || ''"></div>
                          </div>
                        </div>
                      </td>
                      <td class="px-4 py-3 text-right font-mono tabular-nums font-semibold" x-text="fmtNum(item.creator_monthly_reach ?? 0)"></td>
                      <td class="px-4 py-3 text-right font-mono tabular-nums" x-text="fmtNum(item.creator_total_pins ?? 0)"></td>
                      <td class="px-4 py-3">
                        <button
                          type="button"
                          @click="toggleCreatorMode(item)"
                          :disabled="Boolean(togglingModeIds[item.id])"
                          class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition cursor-pointer disabled:opacity-50"
                          :class="item.creator_tracking_mode === 'metrics_full_catalog'
                            ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-700/50 text-emerald-700 dark:text-emerald-300'
                            : 'bg-slate-50 dark:bg-[#18181B] border-slate-200 dark:border-[#27272A] text-slate-600 dark:text-[#A1A1AA] hover:border-rose-400'">
                          <span x-text="item.creator_tracking_mode === 'metrics_full_catalog' ? 'Metrics + Full Catalog' : 'Metrics Only'"></span>
                        </button>
                      </td>
                      <td class="px-4 py-3 text-right whitespace-nowrap">
                        <div class="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            @click="openCreatorCatalog(item)"
                            class="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:border-rose-400 hover:text-rose-600 transition cursor-pointer">
                            Inspect Catalog
                          </button>
                          <button
                            type="button"
                            @click="syncCreatorFullCatalog(item)"
                            :disabled="Boolean(syncingCreatorKeys[item.entity_key])"
                            class="px-2.5 py-1 rounded-lg bg-slate-900 dark:bg-[#FAFAFA] text-white dark:text-slate-900 text-[11px] font-semibold hover:opacity-90 transition cursor-pointer disabled:opacity-50"
                            x-text="syncingCreatorKeys[item.entity_key] ? 'Syncing...' : 'Sync Full Catalog'"></button>
                          <button
                            type="button"
                            @click="removeWatchlistItem(item)"
                            :disabled="Boolean(removingIds[item.id])"
                            class="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition cursor-pointer"
                            title="Remove from Watchlist"
                            aria-label="Remove creator from Watchlist">
                            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  </template>
                </tbody>
              </table>
            </div>
            <template x-if="!isLoading && filteredCreators.length === 0 && (counts.creator || 0) > 0 && searchQuery.trim()">
              <div class="p-10 text-center space-y-2">
                <div class="text-sm font-semibold text-slate-800 dark:text-[#FAFAFA]">No watched creators match your filter</div>
                <button type="button" @click="searchQuery = ''" class="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] text-xs font-semibold text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white cursor-pointer">Clear Search</button>
              </div>
            </template>
            <template x-if="!isLoading && filteredCreators.length === 0 && (counts.creator || 0) === 0">
              <div class="p-10 text-center space-y-3">
                <div class="text-sm font-semibold text-slate-800 dark:text-[#FAFAFA]">No watched creators in this workspace yet</div>
                <p class="text-xs text-slate-500 dark:text-[#A1A1AA] max-w-md mx-auto">
                  Workspace Watchlist holds creators you explicitly pin for daily monitoring, separate from Campaign-discovered profiles shown in <a href="/radar" class="text-rose-600 dark:text-rose-400 font-semibold hover:underline">Radar</a>.
                </p>
                <div class="flex flex-wrap items-center justify-center gap-2 pt-1">
                  <button type="button" @click="showAddCreatorModal = true" class="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer">+ Add Creator</button>
                  <button type="button" @click="importTopFromRadar('creator')" :disabled="isImportingFromRadar" class="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] hover:border-rose-400 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer disabled:opacity-50" x-text="isImportingFromRadar ? 'Importing...' : 'Import Top 10 Creators from Radar'"></button>
                </div>
              </div>
            </template>
          </div>

          <!-- Inline Creator Catalog Pin Explorer with Instant Client-Side Filters -->
          <template x-if="selectedCreatorKey">
            <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl p-5 space-y-4 shadow-2xs">
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-[#27272A] pb-3.5">
                <div>
                  <h2 class="text-base font-bold text-slate-900 dark:text-[#FAFAFA]" x-text="'Catalog Explorer: @' + selectedCreatorKey"></h2>
                  <p class="text-xs text-slate-500 dark:text-[#A1A1AA] font-mono tabular-nums mt-0.5" x-text="'Showing ' + filteredCatalogPins.length + ' of ' + catalogPins.length + ' loaded pins (Total indexed: ' + catalogTotal + ')'"></p>
                </div>
                <button
                  type="button"
                  @click="closeCreatorCatalog()"
                  class="self-start sm:self-auto px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] text-xs font-semibold text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white cursor-pointer">
                  Close Explorer
                </button>
              </div>

              <!-- Instant Client-Side Filter Controls (Saves >= 300, Re-pins, Max Age) -->
              <div class="flex flex-wrap items-end gap-3">
                <div>
                  <label class="block text-[11px] font-mono uppercase text-slate-500 dark:text-[#71717A] mb-1">Quick Preset</label>
                  <button
                    type="button"
                    @click="applySaves300Preset()"
                    class="px-3 py-1.5 rounded-xl border text-xs font-semibold transition cursor-pointer"
                    :class="Number(pinFilterMinSaves) === 300 ? 'bg-rose-600 border-rose-600 text-white' : 'bg-slate-50 dark:bg-[#18181B] border-slate-200 dark:border-[#27272A] text-slate-700 dark:text-slate-200 hover:border-rose-400'">
                    Saves &gt;= 300
                  </button>
                </div>
                <div>
                  <label for="wl-min-saves" class="block text-[11px] font-mono uppercase text-slate-500 dark:text-[#71717A] mb-1">Min Saves</label>
                  <input id="wl-min-saves" type="number" min="0" x-model.number="pinFilterMinSaves" class="w-28 px-2.5 py-1.5 text-xs font-mono tabular-nums rounded-xl bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A]" />
                </div>
                <div>
                  <label for="wl-min-repins" class="block text-[11px] font-mono uppercase text-slate-500 dark:text-[#71717A] mb-1">Min Re-pins</label>
                  <input id="wl-min-repins" type="number" min="0" x-model.number="pinFilterMinRepins" class="w-28 px-2.5 py-1.5 text-xs font-mono tabular-nums rounded-xl bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A]" />
                </div>
                <div>
                  <label for="wl-max-age" class="block text-[11px] font-mono uppercase text-slate-500 dark:text-[#71717A] mb-1">Max Age (days, 0=any)</label>
                  <input id="wl-max-age" type="number" min="0" x-model.number="pinFilterMaxAgeDays" class="w-32 px-2.5 py-1.5 text-xs font-mono tabular-nums rounded-xl bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A]" />
                </div>
                <div class="flex-1 min-w-[180px]">
                  <label for="wl-pin-search" class="block text-[11px] font-mono uppercase text-slate-500 dark:text-[#71717A] mb-1">Search Pin / Board / Domain</label>
                  <input id="wl-pin-search" type="text" x-model="pinFilterSearch" placeholder="Filter pins instantly..." class="w-full px-3 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A]" />
                </div>
                <div>
                  <label for="wl-pin-sort" class="block text-[11px] font-mono uppercase text-slate-500 dark:text-[#71717A] mb-1">Sort</label>
                  <select id="wl-pin-sort" x-model="pinSortBy" class="px-2.5 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A]">
                    <option value="saves_desc">Saves (High to Low)</option>
                    <option value="repins_desc">Re-pins (High to Low)</option>
                    <option value="velocity_desc">Velocity (24h)</option>
                    <option value="newest">Newest First</option>
                  </select>
                </div>
                <button type="button" @click="resetCatalogFilters()" class="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-[#27272A] text-xs font-semibold text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white cursor-pointer">
                  Reset
                </button>
              </div>

              <template x-if="catalogError">
                <div class="px-3.5 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-500/30 text-xs text-rose-700 dark:text-rose-300" x-text="catalogError"></div>
              </template>

              <template x-if="catalogLoading">
                <div class="py-8 text-center text-xs text-slate-500 dark:text-[#A1A1AA]">Loading full creator catalog...</div>
              </template>

              <template x-if="!catalogLoading">
                <div class="overflow-x-auto border border-slate-200 dark:border-[#27272A] rounded-xl">
                  <table class="w-full text-left border-collapse">
                    <thead>
                      <tr class="border-b border-slate-200 dark:border-[#27272A] bg-slate-50/70 dark:bg-[#18181B]/60 text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-[#71717A]">
                        <th class="px-3 py-2.5">Pin</th>
                        <th class="px-3 py-2.5">Board</th>
                        <th class="px-3 py-2.5">Domain</th>
                        <th class="px-3 py-2.5 text-right">Saves</th>
                        <th class="px-3 py-2.5 text-right">Re-pins</th>
                        <th class="px-3 py-2.5 text-right">Age</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 dark:divide-[#27272A] text-xs">
                      <template x-for="pin in filteredCatalogPins.slice(0, 100)" :key="pin.pin_id">
                        <tr class="hover:bg-slate-50/80 dark:hover:bg-[#18181B]/60">
                          <td class="px-3 py-2.5 max-w-xs">
                            <a :href="'/pin/' + encodeURIComponent(pin.pin_id)" class="font-semibold text-slate-900 dark:text-[#FAFAFA] hover:text-rose-600 line-clamp-1" x-text="decodeTitle(pin.title) || ('Pin #' + pin.pin_id)"></a>
                          </td>
                          <td class="px-3 py-2.5 text-slate-600 dark:text-[#A1A1AA] truncate max-w-[160px]" x-text="pin.board_name || '—'"></td>
                          <td class="px-3 py-2.5 font-mono text-slate-600 dark:text-[#A1A1AA] truncate max-w-[160px]" x-text="pin.link_domain || 'Uploaded by user'"></td>
                          <td class="px-3 py-2.5 text-right font-mono tabular-nums font-semibold" x-text="fmtNum(pin.saves ?? pin.save_count ?? 0)"></td>
                          <td class="px-3 py-2.5 text-right font-mono tabular-nums" x-text="fmtNum(pin.repins ?? pin.repin_count ?? 0)"></td>
                          <td class="px-3 py-2.5 text-right font-mono tabular-nums text-slate-500 dark:text-[#A1A1AA]" x-text="(pin.age_days ?? 0) + 'd'"></td>
                        </tr>
                      </template>
                    </tbody>
                  </table>
                </div>
              </template>
            </div>
          </template>
        </div>
      </template>

      <!-- TAB 2: DOMAINS -->
      <template x-if="activeTab === 'domain'">
        <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl overflow-hidden shadow-2xs">
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="border-b border-slate-200 dark:border-[#27272A] bg-slate-50/70 dark:bg-[#18181B]/60 text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-[#71717A]">
                  <th class="px-4 py-3">Domain</th>
                  <th class="px-4 py-3">Notes</th>
                  <th class="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-[#27272A] text-xs">
                <template x-for="item in filteredDomains" :key="item.id">
                  <tr class="hover:bg-slate-50/80 dark:hover:bg-[#18181B]/60 transition">
                    <td class="px-4 py-3">
                      <a :href="'/domains/' + encodeURIComponent(item.entity_key)" class="font-mono font-semibold text-slate-900 dark:text-[#FAFAFA] hover:text-rose-600 dark:hover:text-rose-400" x-text="item.entity_key"></a>
                    </td>
                    <td class="px-4 py-3 text-slate-500 dark:text-[#A1A1AA]" x-text="item.notes || '—'"></td>
                    <td class="px-4 py-3 text-right whitespace-nowrap">
                      <div class="inline-flex items-center gap-1.5">
                        <a
                          :href="'/domains/' + encodeURIComponent(item.entity_key)"
                          class="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:border-rose-400 hover:text-rose-600 transition">
                          Inspect
                        </a>
                        <button
                          type="button"
                          @click="removeWatchlistItem(item)"
                          :disabled="Boolean(removingIds[item.id])"
                          class="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition cursor-pointer"
                          title="Remove domain from Watchlist"
                          aria-label="Remove domain from Watchlist">
                          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
          <template x-if="!isLoading && filteredDomains.length === 0 && (counts.domain || 0) > 0 && searchQuery.trim()">
            <div class="p-10 text-center space-y-2">
              <div class="text-sm font-semibold text-slate-800 dark:text-[#FAFAFA]">No watched domains match your filter</div>
              <button type="button" @click="searchQuery = ''" class="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] text-xs font-semibold text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white cursor-pointer">Clear Search</button>
            </div>
          </template>
          <template x-if="!isLoading && filteredDomains.length === 0 && (counts.domain || 0) === 0">
            <div class="p-10 text-center space-y-3">
              <div class="text-sm font-semibold text-slate-800 dark:text-[#FAFAFA]">No watched domains in this workspace yet</div>
              <p class="text-xs text-slate-500 dark:text-[#A1A1AA] max-w-md mx-auto">
                Watchlist tracks domains you intentionally monitor, separate from all active domains discovered across campaigns in <a href="/radar" class="text-rose-600 dark:text-rose-400 font-semibold hover:underline">Radar</a>.
              </p>
              <div class="flex flex-wrap items-center justify-center gap-2 pt-1">
                <button type="button" @click="showAddDomainModal = true" class="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer">+ Add Domain</button>
                <button type="button" @click="importTopFromRadar('domain')" :disabled="isImportingFromRadar" class="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] hover:border-rose-400 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer disabled:opacity-50" x-text="isImportingFromRadar ? 'Importing...' : 'Import Top 10 Domains from Radar'"></button>
              </div>
            </div>
          </template>
        </div>
      </template>

      <!-- TAB 3: SAVED PINS -->
      <template x-if="activeTab === 'pin'">
        <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl overflow-hidden shadow-2xs">
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="border-b border-slate-200 dark:border-[#27272A] bg-slate-50/70 dark:bg-[#18181B]/60 text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-[#71717A]">
                  <th class="px-4 py-3">Saved Pin</th>
                  <th class="px-4 py-3">Domain</th>
                  <th class="px-4 py-3 text-right">Saves</th>
                  <th class="px-4 py-3 text-right">Re-pins</th>
                  <th class="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-[#27272A] text-xs">
                <template x-for="item in filteredPins" :key="item.id">
                  <tr class="hover:bg-slate-50/80 dark:hover:bg-[#18181B]/60 transition">
                    <td class="px-4 py-3 max-w-md">
                      <div class="flex items-center gap-3">
                        <template x-if="safeImg(item.pin_image_url)">
                          <img :src="safeImg(item.pin_image_url)" alt="" loading="lazy" referrerpolicy="no-referrer" class="w-10 h-12 rounded-lg object-cover border border-slate-200 dark:border-[#27272A] shrink-0" />
                        </template>
                        <div class="min-w-0">
                          <a :href="'/pin/' + encodeURIComponent(item.entity_key)" class="font-semibold text-slate-900 dark:text-[#FAFAFA] hover:text-rose-600 dark:hover:text-rose-400 line-clamp-2" x-text="decodeTitle(item.pin_title) || ('Pin #' + item.entity_key)"></a>
                          <div class="text-[11px] font-mono text-slate-400 dark:text-[#71717A]" x-text="item.entity_key"></div>
                        </div>
                      </div>
                    </td>
                    <td class="px-4 py-3 font-mono text-slate-600 dark:text-[#A1A1AA]" x-text="item.pin_domain || 'Uploaded by user'"></td>
                    <td class="px-4 py-3 text-right font-mono tabular-nums font-semibold" x-text="fmtNum(item.pin_save_count ?? 0)"></td>
                    <td class="px-4 py-3 text-right font-mono tabular-nums" x-text="fmtNum(item.pin_repin_count ?? 0)"></td>
                    <td class="px-4 py-3 text-right whitespace-nowrap">
                      <div class="inline-flex items-center gap-1.5">
                        <a
                          :href="'/pin/' + encodeURIComponent(item.entity_key)"
                          class="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:border-rose-400 hover:text-rose-600 transition">
                          Open Pin
                        </a>
                        <button
                          type="button"
                          @click="removeWatchlistItem(item)"
                          :disabled="Boolean(removingIds[item.id])"
                          class="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition cursor-pointer"
                          title="Remove pin from Watchlist"
                          aria-label="Remove pin from Watchlist">
                          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
          <template x-if="!isLoading && filteredPins.length === 0">
            <div class="p-10 text-center text-sm text-slate-500 dark:text-[#A1A1AA]">
              No saved pins yet in this workspace. Save breakout pins from <a href="/radar" class="text-rose-600 dark:text-rose-400 font-semibold hover:underline">Radar</a> or <a href="/discover" class="text-rose-600 dark:text-rose-400 font-semibold hover:underline">Discover</a>.
            </div>
          </template>
        </div>
      </template>

    </div>

    <!-- Modal: + Add Creator -->
    <template x-if="showAddCreatorModal">
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs" @click.self="showAddCreatorModal = false">
        <div class="w-full max-w-md bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl p-5 shadow-2xl space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="text-base font-bold text-slate-900 dark:text-[#FAFAFA]">Add Creator to Watchlist</h3>
            <button type="button" @click="showAddCreatorModal = false" class="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer" aria-label="Close modal">
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>
          <form @submit.prevent="submitAddCreator()" class="space-y-3.5">
            <div>
              <label for="wl-creator-input" class="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">Pinterest Handle or Profile URL</label>
              <input id="wl-creator-input" type="text" required x-model="newCreatorInput" placeholder="@makeourrecipe or https://pinterest.com/makeourrecipe/" class="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A] focus:outline-none focus:ring-2 focus:ring-rose-500" />
            </div>
            <div>
              <label for="wl-creator-mode" class="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">Tracking Mode</label>
              <select id="wl-creator-mode" x-model="newCreatorMode" class="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A]">
                <option value="metrics_only">Metrics Only (Daily Reach &amp; Views Pulse)</option>
                <option value="metrics_full_catalog">Metrics + Full Catalog (BoardFeedResource + /_created/)</option>
              </select>
            </div>
            <div>
              <label for="wl-creator-notes" class="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">Notes (Optional)</label>
              <input id="wl-creator-notes" type="text" x-model="newCreatorNotes" placeholder="Competitor niche notes..." class="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A]" />
            </div>
            <div class="flex justify-end gap-2 pt-2">
              <button type="button" @click="showAddCreatorModal = false" class="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#27272A] text-xs font-semibold text-slate-600 dark:text-[#A1A1AA] cursor-pointer">Cancel</button>
              <button type="submit" :disabled="isSubmittingCreator" class="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50" x-text="isSubmittingCreator ? 'Adding...' : 'Add Creator'"></button>
            </div>
          </form>
        </div>
      </div>
    </template>

    <!-- Modal: + Add Domain -->
    <template x-if="showAddDomainModal">
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs" @click.self="showAddDomainModal = false">
        <div class="w-full max-w-md bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl p-5 shadow-2xl space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="text-base font-bold text-slate-900 dark:text-[#FAFAFA]">Add Domain to Watchlist</h3>
            <button type="button" @click="showAddDomainModal = false" class="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer" aria-label="Close modal">
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>
          <form @submit.prevent="submitAddDomain()" class="space-y-3.5">
            <div>
              <label for="wl-domain-input" class="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">Domain Name or URL</label>
              <input id="wl-domain-input" type="text" required x-model="newDomainInput" placeholder="example.com" class="w-full px-3 py-2 text-xs font-mono rounded-xl bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A] focus:outline-none focus:ring-2 focus:ring-rose-500" />
            </div>
            <div>
              <label for="wl-domain-notes" class="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">Notes (Optional)</label>
              <input id="wl-domain-notes" type="text" x-model="newDomainNotes" placeholder="Competitor blog or store..." class="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A]" />
            </div>
            <div class="flex justify-end gap-2 pt-2">
              <button type="button" @click="showAddDomainModal = false" class="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#27272A] text-xs font-semibold text-slate-600 dark:text-[#A1A1AA] cursor-pointer">Cancel</button>
              <button type="submit" :disabled="isSubmittingDomain" class="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50" x-text="isSubmittingDomain ? 'Adding...' : 'Add Domain'"></button>
            </div>
          </form>
        </div>
      </div>
    </template>

    <!-- Toast Notification -->
    <template x-if="toastMsg">
      <div class="fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-[#FAFAFA] text-white dark:text-slate-900 text-xs font-semibold shadow-xl" x-text="toastMsg"></div>
    </template>
  </main>

${renderPageBootstrapScript({ initialTab: safeTab })}
${renderClientJsScriptTag('watchlist')}
</body>
</html>`;
}
