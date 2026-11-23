/**
 * src/ui/radar/index.mjs
 *
 * SSR Workspace Radar Page (/radar, /, /pulse)
 * Unifies 24h Pulse + Creator Hub + Domain Radar strictly scoped to the active Workspace.
 */

import { renderAppSidebar } from '../app-sidebar.mjs';
import { renderSharedDocumentHead } from '../shared-head.mjs';
import { renderPageBootstrapScript, renderClientJsScriptTag } from '../client-assets.mjs';

export function getRadarPageHtml(initialTab = 'pulse') {
  const safeTab = ['pulse', 'creators', 'domains'].includes(String(initialTab || '').toLowerCase())
    ? String(initialTab).toLowerCase()
    : 'pulse';

  return `<!DOCTYPE html>
<html lang="en">
<head>
${renderSharedDocumentHead({
  title: 'Radar — Pin Arbitrage V4',
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
  x-data="radarApp()"
  x-init="init()"
  x-cloak>

${renderAppSidebar({
  activeNav: 'radar',
  refreshHandler: 'loadAll()',
  refreshLoadingExpr: 'isLoading'
})}

  <main
    class="transition-all duration-300 ease-in-out md:ml-64 lg:ml-72 min-h-[calc(100vh-56px)]"
    :class="isSidebarCollapsed ? 'md:!ml-20' : 'md:ml-64 lg:ml-72'">

    <div class="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

      <!-- Header & Segmented Radar Tabs -->
      <div class="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 class="text-2xl font-bold tracking-tight text-slate-900 dark:text-[#FAFAFA]">Workspace Radar</h1>
          <p class="text-sm text-slate-500 dark:text-[#A1A1AA] mt-1">
            Daily algorithmic pulse, tracked creators, and zero-exclusion domain velocity for the active workspace.
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <div class="inline-flex p-1 rounded-xl bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] shadow-2xs" role="tablist" aria-label="Radar Views">
            <button
              type="button"
              role="tab"
              :aria-selected="activeTab === 'pulse' ? 'true' : 'false'"
              @click="activeTab = 'pulse'"
              class="px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5"
              :class="activeTab === 'pulse' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white'">
              <i data-lucide="activity" class="w-3.5 h-3.5"></i>
              <span>24h Pulse</span>
            </button>
            <button
              type="button"
              role="tab"
              :aria-selected="activeTab === 'creators' ? 'true' : 'false'"
              @click="activeTab = 'creators'"
              class="px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5"
              :class="activeTab === 'creators' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white'">
              <i data-lucide="users" class="w-3.5 h-3.5"></i>
              <span>Creator Hub</span>
            </button>
            <button
              type="button"
              role="tab"
              :aria-selected="activeTab === 'domains' ? 'true' : 'false'"
              @click="activeTab = 'domains'"
              class="px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5"
              :class="activeTab === 'domains' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white'">
              <i data-lucide="globe" class="w-3.5 h-3.5"></i>
              <span>Domain Radar</span>
            </button>
          </div>

          <a href="/discover" class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold transition shadow-xs">
            <i data-lucide="sparkles" class="w-3.5 h-3.5"></i>
            <span>Discover Trends</span>
          </a>
        </div>
      </div>

      <!-- KPI Summary Strip -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl p-4 shadow-2xs">
          <div class="text-[11px] font-mono uppercase tracking-wider text-slate-400 dark:text-[#71717A]">Pulse Pins</div>
          <div class="mt-1.5 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-[#FAFAFA]" x-text="fmtNum(pulseSummary.total_pins)">0</div>
          <div class="mt-1 text-xs text-emerald-600 dark:text-emerald-400 font-mono tabular-nums" x-text="'+' + fmtNum(pulseSummary.total_gain) + ' (' + timeframe + ')'">+0</div>
        </div>
        <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl p-4 shadow-2xs">
          <div class="text-[11px] font-mono uppercase tracking-wider text-slate-400 dark:text-[#71717A]">Tracked Creators</div>
          <div class="mt-1.5 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-[#FAFAFA]" x-text="fmtNum(creatorsSummary.tracked_profiles)">0</div>
          <div class="mt-1 text-xs text-slate-500 dark:text-[#A1A1AA] font-mono tabular-nums" x-text="fmtNum(creatorsSummary.total_pins) + ' catalog pins'">0 catalog pins</div>
        </div>
        <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl p-4 shadow-2xs">
          <div class="text-[11px] font-mono uppercase tracking-wider text-slate-400 dark:text-[#71717A]">Active Domains</div>
          <div class="mt-1.5 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-[#FAFAFA]" x-text="fmtNum(domainsSummary.total_domains)">0</div>
          <div class="mt-1 text-xs text-slate-500 dark:text-[#A1A1AA] font-mono tabular-nums" x-text="fmtNum(domainsSummary.total_pins) + ' mapped pins'">0 mapped pins</div>
        </div>
        <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl p-4 shadow-2xs">
          <div class="text-[11px] font-mono uppercase tracking-wider text-slate-400 dark:text-[#71717A]">Total Creator Reach</div>
          <div class="mt-1.5 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-[#FAFAFA]" x-text="fmtNum(creatorsSummary.total_audience)">0</div>
          <div class="mt-1 text-xs text-slate-500 dark:text-[#A1A1AA] font-mono tabular-nums" x-text="'Avg ' + fmtNum(creatorsSummary.avg_monthly_views) + ' / mo'">Avg 0 / mo</div>
        </div>
      </div>

      <!-- Filter & Timeframe Toolbar -->
      <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div class="relative flex-1 max-w-md">
          <i data-lucide="search" class="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"></i>
          <input
            type="text"
            x-model="searchQuery"
            placeholder="Filter pins, @creators, or domains..."
            aria-label="Filter Radar Results"
            class="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-[#FAFAFA] focus:outline-none focus:ring-2 focus:ring-rose-500" />
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <template x-if="activeTab === 'pulse'">
            <div class="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A]">
              <template x-for="tf in ['24h', '5d', '7d', '10d', '15d']" :key="tf">
                <button
                  type="button"
                  @click="setTimeframe(tf)"
                  class="px-2.5 py-1 rounded-lg text-[11px] font-mono font-semibold transition cursor-pointer"
                  :class="timeframe === tf ? 'bg-white dark:bg-[#27272A] text-rose-600 dark:text-rose-400 shadow-2xs' : 'text-slate-500 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white'"
                  x-text="tf"></button>
              </template>
            </div>
          </template>

          <template x-if="activeTab === 'creators'">
            <a href="/accounts" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-[#27272A] text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#18181B] transition">
              <span>Full Creator Ledger</span>
              <i data-lucide="arrow-up-right" class="w-3.5 h-3.5"></i>
            </a>
          </template>

          <template x-if="activeTab === 'domains'">
            <a href="/domains" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-[#27272A] text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#18181B] transition">
              <span>Full Domain Studio</span>
              <i data-lucide="arrow-up-right" class="w-3.5 h-3.5"></i>
            </a>
          </template>
        </div>
      </div>

      <!-- Error Banner -->
      <template x-if="errorMessage">
        <div class="px-4 py-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-500/30 text-xs text-rose-700 dark:text-rose-300" x-text="errorMessage"></div>
      </template>

      <!-- PANEL 1: 24h Pulse -->
      <template x-if="activeTab === 'pulse'">
        <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl overflow-hidden shadow-2xs">
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="border-b border-slate-200 dark:border-[#27272A] bg-slate-50/70 dark:bg-[#18181B]/60 text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-[#71717A]">
                  <th class="px-4 py-3">Pin</th>
                  <th class="px-4 py-3">Domain / Source</th>
                  <th class="px-4 py-3 text-right">Saves</th>
                  <th class="px-4 py-3 text-right" x-text="'Gain (' + timeframe + ')'">Gain</th>
                  <th class="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-[#27272A] text-xs">
                <template x-for="pin in filteredPulse" :key="pin.pin_id">
                  <tr class="hover:bg-slate-50/80 dark:hover:bg-[#18181B]/60 transition">
                    <td class="px-4 py-3 max-w-md">
                      <div class="flex items-center gap-3">
                        <template x-if="safeImg(pin.image_url)">
                          <img :src="safeImg(pin.image_url)" alt="" loading="lazy" referrerpolicy="no-referrer" class="w-10 h-12 rounded-lg object-cover border border-slate-200 dark:border-[#27272A] shrink-0 bg-slate-100 dark:bg-[#18181B]" />
                        </template>
                        <div class="min-w-0">
                          <a :href="'/pin/' + encodeURIComponent(pin.pin_id)" class="font-semibold text-slate-900 dark:text-[#FAFAFA] hover:text-rose-600 dark:hover:text-rose-400 line-clamp-2" x-text="decodeTitle(pin.title) || ('Pin #' + pin.pin_id)"></a>
                          <div class="text-[11px] font-mono text-slate-400 dark:text-[#71717A] mt-0.5 truncate" x-text="pin.keyword || pin.pin_id"></div>
                        </div>
                      </div>
                    </td>
                    <td class="px-4 py-3 font-mono text-slate-600 dark:text-[#A1A1AA]" x-text="pin.domain || pin.clean_domain || 'Uploaded by user'"></td>
                    <td class="px-4 py-3 text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-[#FAFAFA]" x-text="fmtNum(pin.repin_count ?? pin.saves ?? 0)"></td>
                    <td class="px-4 py-3 text-right font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400" x-text="'+' + fmtNum(pinGain(pin))"></td>
                    <td class="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        @click="addToWatchlist('pin', pin.pin_id, decodeTitle(pin.title) || ('Pin #' + pin.pin_id))"
                        class="px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition cursor-pointer"
                        :class="isWatched('pin', pin.pin_id) ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-700/50 text-emerald-700 dark:text-emerald-300' : 'border-slate-200 dark:border-[#27272A] text-slate-600 dark:text-[#A1A1AA] hover:border-rose-400 hover:text-rose-600'"
                        x-text="isWatched('pin', pin.pin_id) ? 'Saved' : '+ Watchlist'"></button>
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
          <template x-if="!isLoading && filteredPulse.length === 0">
            <div class="p-10 text-center text-sm text-slate-500 dark:text-[#A1A1AA]">
              No pulse signals yet in this workspace. Add keywords to a Campaign or start a hunt in <a href="/discover" class="text-rose-600 dark:text-rose-400 font-semibold hover:underline">Discover</a>.
            </div>
          </template>
        </div>
      </template>

      <!-- PANEL 2: Creator Hub -->
      <template x-if="activeTab === 'creators'">
        <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl overflow-hidden shadow-2xs">
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="border-b border-slate-200 dark:border-[#27272A] bg-slate-50/70 dark:bg-[#18181B]/60 text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-[#71717A]">
                  <th class="px-4 py-3">Creator</th>
                  <th class="px-4 py-3 text-right">Audience</th>
                  <th class="px-4 py-3 text-right">Monthly Views</th>
                  <th class="px-4 py-3 text-right">Total Pins</th>
                  <th class="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-[#27272A] text-xs">
                <template x-for="creator in filteredCreators" :key="creator.id || creator.username">
                  <tr class="hover:bg-slate-50/80 dark:hover:bg-[#18181B]/60 transition">
                    <td class="px-4 py-3">
                      <div class="flex items-center gap-3">
                        <template x-if="safeImg(creator.avatar_url)">
                          <img :src="safeImg(creator.avatar_url)" alt="" loading="lazy" referrerpolicy="no-referrer" class="w-9 h-9 rounded-full object-cover border border-slate-200 dark:border-[#27272A] shrink-0" />
                        </template>
                        <div class="min-w-0">
                          <a :href="'/' + encodeURIComponent(creator.username)" class="font-semibold text-slate-900 dark:text-[#FAFAFA] hover:text-rose-600 dark:hover:text-rose-400" x-text="'@' + creator.username"></a>
                          <div class="text-[11px] text-slate-400 dark:text-[#71717A] truncate" x-text="creator.full_name || creator.domain || ''"></div>
                        </div>
                      </div>
                    </td>
                    <td class="px-4 py-3 text-right font-mono tabular-nums font-semibold" x-text="fmtNum(creator.total_audience ?? creator.followers ?? 0)"></td>
                    <td class="px-4 py-3 text-right font-mono tabular-nums text-slate-600 dark:text-[#A1A1AA]" x-text="fmtNum(creator.monthly_views ?? 0)"></td>
                    <td class="px-4 py-3 text-right font-mono tabular-nums" x-text="fmtNum(creator.total_pins ?? 0)"></td>
                    <td class="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        @click="addToWatchlist('creator', creator.username, creator.full_name || ('@' + creator.username), 'metrics_only')"
                        class="px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition cursor-pointer"
                        :class="isWatched('creator', creator.username) ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-700/50 text-emerald-700 dark:text-emerald-300' : 'border-slate-200 dark:border-[#27272A] text-slate-600 dark:text-[#A1A1AA] hover:border-rose-400 hover:text-rose-600'"
                        x-text="isWatched('creator', creator.username) ? 'Watched' : '+ Watchlist'"></button>
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
          <template x-if="!isLoading && filteredCreators.length === 0">
            <div class="p-10 text-center text-sm text-slate-500 dark:text-[#A1A1AA]">
              No tracked creators found. Add creators directly in <a href="/watchlist" class="text-rose-600 dark:text-rose-400 font-semibold hover:underline">Watchlist</a>.
            </div>
          </template>
        </div>
      </template>

      <!-- PANEL 3: Domain Radar -->
      <template x-if="activeTab === 'domains'">
        <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl overflow-hidden shadow-2xs">
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="border-b border-slate-200 dark:border-[#27272A] bg-slate-50/70 dark:bg-[#18181B]/60 text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-[#71717A]">
                  <th class="px-4 py-3">Domain</th>
                  <th class="px-4 py-3 text-right">Pins</th>
                  <th class="px-4 py-3 text-right">Total Saves</th>
                  <th class="px-4 py-3 text-right">24h Gain</th>
                  <th class="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-[#27272A] text-xs">
                <template x-for="dom in filteredDomains" :key="dom.domain || dom.clean_domain">
                  <tr class="hover:bg-slate-50/80 dark:hover:bg-[#18181B]/60 transition">
                    <td class="px-4 py-3">
                      <a :href="'/domains/' + encodeURIComponent(dom.domain || dom.clean_domain || '')" class="font-mono font-semibold text-slate-900 dark:text-[#FAFAFA] hover:text-rose-600 dark:hover:text-rose-400" x-text="dom.domain || dom.clean_domain"></a>
                    </td>
                    <td class="px-4 py-3 text-right font-mono tabular-nums" x-text="fmtNum(dom.pin_count ?? dom.total_pins ?? 0)"></td>
                    <td class="px-4 py-3 text-right font-mono tabular-nums font-semibold" x-text="fmtNum(dom.total_saves ?? dom.total_repins ?? 0)"></td>
                    <td class="px-4 py-3 text-right font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400" x-text="'+' + fmtNum(dom.gain_24h ?? dom.saves_gain_24h ?? 0)"></td>
                    <td class="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        @click="addToWatchlist('domain', dom.domain || dom.clean_domain, dom.domain || dom.clean_domain)"
                        class="px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition cursor-pointer"
                        :class="isWatched('domain', dom.domain || dom.clean_domain) ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-700/50 text-emerald-700 dark:text-emerald-300' : 'border-slate-200 dark:border-[#27272A] text-slate-600 dark:text-[#A1A1AA] hover:border-rose-400 hover:text-rose-600'"
                        x-text="isWatched('domain', dom.domain || dom.clean_domain) ? 'Watched' : '+ Watchlist'"></button>
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
          <template x-if="!isLoading && filteredDomains.length === 0">
            <div class="p-10 text-center text-sm text-slate-500 dark:text-[#A1A1AA]">
              No domains captured yet in this workspace.
            </div>
          </template>
        </div>
      </template>

    </div>

    <!-- Toast Notification -->
    <template x-if="toastMsg">
      <div class="fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-[#FAFAFA] text-white dark:text-slate-900 text-xs font-semibold shadow-xl" x-text="toastMsg"></div>
    </template>
  </main>

${renderPageBootstrapScript({ initialTab: safeTab })}
${renderClientJsScriptTag('radar')}
</body>
</html>`;
}
