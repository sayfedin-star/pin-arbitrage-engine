/**
 * Dedicated Full-Page Domain Intelligence Studio View (SERP & Content Hub Redesign)
 */
import { renderPinRowTemplate } from '../pin-row.mjs';

export function getDomainsStudioViewHtml({ hasInitialDomain = false } = {}) {
  const rawHtml = `    <!-- DEDICATED FULL-PAGE DOMAIN INTELLIGENCE STUDIO VIEW -->
    <div x-show="isDossierOpen" x-cloak class="flex flex-col gap-5 w-full" ${hasInitialDomain ? 'style="display:flex;"' : ''}>

      <!-- Compact Studio Breadcrumb & Escape Bar -->
      <div class="flex items-center justify-between flex-wrap gap-3 pb-2 border-b border-slate-200 dark:border-[#27272A]">
        <div class="flex items-center gap-2.5 text-xs font-mono tabular-nums">
          <button type="button" @click="closeDossier()"
                  class="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-slate-700 dark:text-slate-300 font-bold flex items-center gap-1.5 transition shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                  title="Return to Domain Radar Leaderboard (Esc)">
            <span>← Back to Leaderboard</span>
          </button>
          <span class="text-slate-300 dark:text-slate-700">|</span>
          <nav aria-label="Domain studio breadcrumb" class="flex items-center gap-1.5 text-slate-500">
            <a :href="getBaseStudioPath()" href="/domains" @click.prevent="closeDossier()" class="hover:text-sky-600 dark:hover:text-sky-400 flex items-center gap-1 transition">
              <i data-lucide="globe" class="w-3.5 h-3.5 shrink-0"></i><span>Domain Radar</span>
            </a>
            <template x-if="scopedFolderId && activeFolder?.name">
              <span class="inline-flex items-center gap-1.5">
                <span class="text-slate-300 dark:text-slate-700">/</span>
                <span class="text-slate-600 dark:text-slate-300 font-semibold" x-text="activeFolder.name"></span>
              </span>
            </template>
          </nav>
        </div>

        <button type="button"
                @click="closeDossier()"
                class="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-slate-600 dark:text-slate-300 text-xs font-bold transition flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                title="Close Studio (Esc)"
                aria-label="Close Studio">
          <span>Esc</span>
          <span aria-hidden="true">✕</span>
        </button>
      </div>

      <!-- Domain Identity & Single Action Strip -->
      <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col gap-3.5">
        <div class="flex items-center justify-between flex-wrap gap-4">
          <div class="flex items-center gap-3.5 min-w-0">
            <template x-if="dossierDomain && dossierDomain.toLowerCase() === 'uploaded by user'">
              <span class="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center shadow-sm shrink-0"><i data-lucide="sparkles" class="w-4 h-4"></i></span>
            </template>
            <template x-if="!dossierDomain || dossierDomain.toLowerCase() !== 'uploaded by user'">
              <img :src="'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(dossierDomain) + '&sz=32'"
                   alt=""
                   class="w-9 h-9 rounded-xl shadow-sm bg-slate-200 dark:bg-[#18181B] shrink-0"
                   loading="lazy"
                   onerror="this.onerror=null; this.style.display='none'">
            </template>
            <div class="flex items-center gap-3 flex-wrap min-w-0">
              <h2 class="text-xl font-bold text-slate-900 dark:text-white font-mono tabular-nums tracking-tight truncate" x-text="dossierDomain"></h2>
              <template x-if="dossierDomain && dossierDomain.toLowerCase() === 'uploaded by user'">
                <span class="inline-flex items-center gap-1 text-xs font-mono tabular-nums text-amber-600 dark:text-amber-400 font-bold"><i data-lucide="target" class="w-3.5 h-3.5 shrink-0"></i><span>100% Organic Direct Uploads • Unlinked Pinterest Traffic • Vacuum Opportunity</span></span>
              </template>
              <template x-if="!dossierDomain || dossierDomain.toLowerCase() !== 'uploaded by user'">
                <div class="flex items-center gap-2 text-xs font-mono tabular-nums text-slate-400 flex-wrap">
                  <a :href="safeUrl('https://' + dossierDomain)" target="_blank" rel="noopener noreferrer" class="text-sky-600 dark:text-sky-400 hover:underline font-medium">Visit ↗</a>
                  <span aria-hidden="true">•</span>
                  <a :href="safeUrl('https://www.similarweb.com/website/' + dossierDomain)" target="_blank" rel="noopener noreferrer" class="hover:text-slate-600 dark:hover:text-slate-200 hover:underline">Similarweb ↗</a>
                  <span aria-hidden="true">•</span>
                  <a :href="safeUrl('https://web.archive.org/web/*/' + dossierDomain)" target="_blank" rel="noopener noreferrer" class="hover:text-slate-600 dark:hover:text-slate-200 hover:underline">Wayback ↗</a>
                  <span aria-hidden="true">•</span>
                  <a :href="safeUrl('https://www.google.com/search?q=site%3A' + encodeURIComponent(dossierDomain))" target="_blank" rel="noopener noreferrer" class="hover:text-slate-600 dark:hover:text-slate-200 hover:underline">Google Site ↗</a>
                </div>
              </template>
            </div>
          </div>

          <!-- Single Action Buttons Group -->
          <div class="flex items-center gap-2 flex-wrap">
            <button type="button" @click="openBlueprintModal(dossierDomain)"
                    class="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white text-white dark:text-slate-900 text-xs font-bold transition flex items-center gap-1.5 shadow-sm active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                    title="Generate instant 6-pillar Arbitrage Attack Blueprint">
              <i data-lucide="zap" class="w-3.5 h-3.5 shrink-0"></i><span>Attack Plan</span>
            </button>
            <template x-if="!dossierDomain || dossierDomain.toLowerCase() !== 'uploaded by user'">
              <div class="flex items-center gap-2">
                <button type="button" @click="recheckAgeForDossier()"
                        :disabled="enrichingDomains[dossierDomain]"
                        class="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#18181B]/80 hover:bg-slate-100 dark:hover:bg-[#27272A] text-xs font-semibold text-slate-700 dark:text-slate-300 transition flex items-center gap-1 shadow-sm disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">
                  <i data-lucide="refresh-cw" class="w-3.5 h-3.5 shrink-0" :class="{ 'animate-spin': enrichingDomains[dossierDomain] }"></i>
                  <span x-text="enrichingDomains[dossierDomain] ? 'Checking...' : 'Re-check Age'">Re-check Age</span>
                </button>
                <button type="button" @click="recheckAdsForDossier()"
                        :disabled="enrichingAds[dossierDomain]"
                        class="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#18181B]/80 hover:bg-slate-100 dark:hover:bg-[#27272A] text-xs font-semibold text-slate-700 dark:text-slate-300 transition flex items-center gap-1 shadow-sm disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">
                  <i data-lucide="refresh-cw" class="w-3.5 h-3.5 shrink-0" :class="{ 'animate-spin': enrichingAds[dossierDomain] }"></i>
                  <span x-text="enrichingAds[dossierDomain] ? 'Scanning...' : 'Re-scan ads.txt'">Re-scan ads.txt</span>
                </button>
              </div>
            </template>
          </div>
        </div>

        <!-- Metadata Chips Row (Unified Non-Duplicated Monetization Badge) -->
        <template x-if="dossierData?.summary?.is_organic_vault">
          <div class="flex items-center gap-2 flex-wrap font-mono tabular-nums text-xs pt-3 border-t border-slate-100 dark:border-[#27272A]/80">
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 font-bold shadow-sm">
              <i data-lucide="target" class="w-3.5 h-3.5 shrink-0"></i>
              <span>100% Unmonetized Arbitrage Vacuum</span>
            </span>
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 font-bold shadow-sm">
              <i data-lucide="zap" class="w-3.5 h-3.5 shrink-0"></i>
              <span>0 Outbound Links • Top SERP Search Rankings</span>
            </span>
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-500/20 font-bold shadow-sm">
              <i data-lucide="user" class="w-3.5 h-3.5 shrink-0"></i>
              <span x-text="(dossierData?.summary?.accounts_count || 0) + ' Organic Creator Accounts'"></span>
            </span>
          </div>
        </template>
        <template x-if="!dossierData?.summary?.is_organic_vault">
          <div class="flex items-center gap-2 flex-wrap font-mono tabular-nums text-xs pt-3 border-t border-slate-100 dark:border-[#27272A]/80">
            <!-- Domain Age Badge -->
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold shadow-sm"
                  :class="dossierData?.age_info?.age_years != null ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20' : (dossierData?.age_info?.lookup_status === 'failed' ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20' : 'bg-slate-100 dark:bg-[#18181B] text-slate-500 border-slate-200 dark:border-[#27272A]')"
                  :title="dossierData?.age_info?.registered_at ? 'Registered: ' + dossierData.age_info.registered_at.slice(0, 10) : 'Domain Age'">
              <i data-lucide="sprout" class="w-3.5 h-3.5 shrink-0"></i>
              <span x-text="dossierData?.age_info?.age_days != null ? formatDomainAge(dossierData.age_info.age_days) : (dossierData?.age_info?.lookup_status === 'failed' ? 'Registry Withheld / Privacy Shielded' : 'Unverified Age')"></span>
            </span>

            <template x-if="dossierData?.age_info?.registered_at">
              <span class="px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-[#18181B]/60 border border-slate-200 dark:border-[#27272A]/80 text-slate-600 dark:text-slate-300">
                <span class="text-slate-400">Reg: </span>
                <span class="font-bold text-slate-800 dark:text-slate-200" x-text="dossierData.age_info.registered_at.slice(0, 10)"></span>
              </span>
            </template>

            <template x-if="dossierData?.age_info?.expires_at">
              <span class="px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-[#18181B]/60 border border-slate-200 dark:border-[#27272A]/80 text-slate-600 dark:text-slate-300">
                <span class="text-slate-400">Expires: </span>
                <span class="font-bold text-slate-800 dark:text-slate-200" x-text="dossierData.age_info.expires_at.slice(0, 10)"></span>
              </span>
            </template>

            <!-- Unified Ad Network + ads.txt Status Chip -->
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold shadow-sm"
                  :title="getUnifiedMonetizationChip(dossierData?.ad_info).title"
                  :class="['resolved', 'valid'].includes(dossierData?.ad_info?.ads_txt_status) ? getAdNetworkBadgeClasses(dossierData?.ad_info?.current_ad_network) : getUnifiedMonetizationChip(dossierData?.ad_info).class">
              <span :class="['resolved', 'valid'].includes(dossierData?.ad_info?.ads_txt_status) ? 'text-emerald-500' : getUnifiedMonetizationChip(dossierData?.ad_info).dotClass" aria-hidden="true">●</span>
              <span x-text="getUnifiedMonetizationChip(dossierData?.ad_info).label"></span>
            </span>

            <template x-if="dossierData?.ad_info?.ad_manager_domain">
              <span class="px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-[#18181B]/60 border border-slate-200 dark:border-[#27272A]/80 text-slate-600 dark:text-slate-300">
                <span class="text-slate-400">Manager: </span>
                <span class="font-bold text-sky-600 dark:text-sky-400" x-text="dossierData.ad_info.ad_manager_domain"></span>
              </span>
            </template>

            <template x-if="dossierData?.ad_info?.primary_pub_id">
              <span class="px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-[#18181B]/60 border border-slate-200 dark:border-[#27272A]/80 text-slate-600 dark:text-slate-300">
                <span class="text-slate-400">Pub ID: </span>
                <span class="font-bold text-slate-800 dark:text-slate-200" x-text="dossierData.ad_info.primary_pub_id"></span>
              </span>
            </template>

            <template x-if="dossierData?.ad_info?.previous_ad_network">
              <span class="px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 font-bold flex items-center gap-1 shadow-sm"
                    :title="'Historical Switch Tracking: Migrated from ' + dossierData.ad_info.previous_ad_network + ' to ' + (dossierData.ad_info.current_ad_network || '')">
                <span aria-hidden="true">↗</span>
                <span x-text="'Ex-' + capitalize(dossierData.ad_info.previous_ad_network)"></span>
                <span class="text-[10px] text-slate-400" x-text="dossierData?.ad_info?.switched_at ? '(' + dossierData.ad_info.switched_at.slice(0, 10) + ')' : ''"></span>
              </span>
            </template>
          </div>
        </template>
      </div>

      <!-- 6 Smart Interactive KPI Navigation Cards (Fixed True Totals) -->
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 font-mono tabular-nums">
        <!-- 1. Daily Velocity -->
        <button type="button"
                @click="navigateDossierView('hub', 'pins', 'velocity')"
                :aria-pressed="dossierTab === 'hub' && dossierSort === 'velocity'"
                class="text-center bg-white dark:bg-[#121215] border p-3.5 rounded-2xl shadow-sm flex flex-col items-center gap-1 transition hover:border-rose-500/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 cursor-pointer"
                :class="(dossierTab === 'hub' && dossierSort === 'velocity') ? 'border-rose-500 ring-1 ring-rose-500/30' : 'border-slate-200 dark:border-[#27272A]'"
                title="Jump to Pins sorted by highest Daily Save Velocity">
          <div class="text-[10px] text-slate-400 uppercase tracking-wider flex items-center gap-1">
            <i data-lucide="trending-up" class="w-3 h-3 text-rose-500 shrink-0"></i><span>Daily Velocity</span>
          </div>
          <div class="text-2xl font-bold text-rose-600 dark:text-rose-400"
               x-text="formatVelocity(dossierData?.summary?.total_daily_velocity ?? dossierData?.summary?.avg_velocity ?? 0)"></div>
          <div class="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-full"
               x-text="formatSignedDelta(dossierData?.summary?.total_gains_7d || 0) + ' (7d) • ' + formatSignedDelta(dossierData?.summary?.total_delta_saves_24h || 0) + ' (24h)'"></div>
        </button>

        <!-- 2. Total Saves & Engagement -->
        <button type="button"
                @click="navigateDossierView('hub', 'articles', 'saves')"
                :aria-pressed="dossierTab === 'hub' && dossierSort === 'saves'"
                class="text-center bg-white dark:bg-[#121215] border p-3.5 rounded-2xl shadow-sm flex flex-col items-center gap-1 transition hover:border-emerald-500/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 cursor-pointer"
                :class="(dossierTab === 'hub' && dossierSort === 'saves') ? 'border-emerald-500 ring-1 ring-emerald-500/30' : 'border-slate-200 dark:border-[#27272A]'"
                title="Jump to Articles sorted by Total Saves">
          <div class="text-[10px] text-slate-400 uppercase tracking-wider">Total Saves</div>
          <div class="text-2xl font-bold text-emerald-600 dark:text-emerald-400"
               x-text="formatNumber(dossierData?.summary?.total_saves || 0)"></div>
          <div class="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-full"
               x-text="formatNumber(dossierData?.summary?.total_repins || 0) + ' Repins • ' + formatNumber(dossierData?.summary?.total_shares || 0) + ' Shares'"></div>
        </button>

        <!-- 3. Money Articles -->
        <button type="button"
                @click="navigateDossierView('hub', 'articles')"
                :aria-pressed="dossierTab === 'hub' && dossierHubMode === 'articles'"
                class="text-center bg-white dark:bg-[#121215] border p-3.5 rounded-2xl shadow-sm flex flex-col items-center gap-1 transition hover:border-sky-500/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 cursor-pointer"
                :class="(dossierTab === 'hub' && dossierHubMode === 'articles') ? 'border-sky-500 ring-1 ring-sky-500/30' : 'border-slate-200 dark:border-[#27272A]'"
                title="View SERP & Content Hub grouped By Article">
          <div class="text-[10px] text-slate-400 uppercase tracking-wider" x-text="dossierData?.summary?.is_organic_vault ? 'Upload Boards' : 'Money Articles'"></div>
          <div class="text-2xl font-bold text-slate-900 dark:text-white"
               x-text="dossierData?.summary?.is_organic_vault ? formatNumber(dossierData?.money_urls?.length || 0) : formatNumber(dossierData?.summary?.unique_urls ?? dossierData?.money_urls?.length ?? 0)"></div>
          <div class="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-full"
               x-text="dossierData?.summary?.is_organic_vault ? 'Niche board groups' : ((dossierData?.summary?.active_unique_urls_count || 0) + ' Active • ' + (dossierData?.summary?.vault_unique_urls_count || 0) + ' Vault • ' + (dossierData?.summary?.pins_per_url || 0) + 'x')"></div>
        </button>

        <!-- 4. Ranked Pins -->
        <button type="button"
                @click="navigateDossierView('hub', 'pins')"
                :aria-pressed="dossierTab === 'hub' && dossierHubMode === 'pins'"
                class="text-center bg-white dark:bg-[#121215] border p-3.5 rounded-2xl shadow-sm flex flex-col items-center gap-1 transition hover:border-sky-500/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 cursor-pointer"
                :class="(dossierTab === 'hub' && dossierHubMode === 'pins') ? 'border-sky-500 ring-1 ring-sky-500/30' : 'border-slate-200 dark:border-[#27272A]'"
                title="View SERP & Content Hub grouped By Pin">
          <div class="text-[10px] text-slate-400 uppercase tracking-wider">Ranked Pins</div>
          <div class="text-2xl font-bold text-slate-900 dark:text-white"
               x-text="formatNumber(dossierData?.summary?.total_pins || 0)"></div>
          <div class="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-full"
               x-text="formatNumber(dossierData?.summary?.active_pins_count || 0) + ' Active • ' + formatNumber(dossierData?.summary?.displaced_total_count || 0) + ' Vault • ' + formatAgeRange(dossierData?.summary?.min_pin_age_days, dossierData?.summary?.max_pin_age_days)"></div>
        </button>

        <!-- 5. Keywords -->
        <button type="button"
                @click="navigateDossierView('hub', 'keywords')"
                :aria-pressed="dossierTab === 'hub' && dossierHubMode === 'keywords'"
                class="text-center bg-white dark:bg-[#121215] border p-3.5 rounded-2xl shadow-sm flex flex-col items-center gap-1 transition hover:border-sky-500/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 cursor-pointer"
                :class="(dossierTab === 'hub' && dossierHubMode === 'keywords') ? 'border-sky-500 ring-1 ring-sky-500/30' : 'border-slate-200 dark:border-[#27272A]'"
                title="View SERP & Content Hub grouped By Keyword">
          <div class="text-[10px] text-slate-400 uppercase tracking-wider">Keywords</div>
          <div class="text-2xl font-bold text-sky-600 dark:text-sky-400"
               x-text="formatNumber(dossierData?.summary?.ranked_keywords_count || 0)"></div>
          <div class="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-full"
               x-text="formatNumber(dossierData?.summary?.active_slots_count || 0) + ' Active • ' + formatNumber(dossierData?.summary?.displaced_slots_count || 0) + ' Vault slots'"></div>
        </button>

        <!-- 6. Creators -->
        <button type="button"
                @click="navigateDossierView('accounts')"
                :aria-pressed="dossierTab === 'accounts'"
                class="text-center bg-white dark:bg-[#121215] border p-3.5 rounded-2xl shadow-sm flex flex-col items-center gap-1 transition hover:border-purple-500/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 cursor-pointer"
                :class="dossierTab === 'accounts' ? 'border-purple-500 ring-1 ring-purple-500/30' : 'border-slate-200 dark:border-[#27272A]'"
                title="Inspect Associated Creators & P2P Sybil Network">
          <div class="text-[10px] text-slate-400 uppercase tracking-wider">Creators</div>
          <div class="text-2xl font-bold text-purple-600 dark:text-purple-400"
               x-text="formatNumber(dossierData?.summary?.accounts_count || 0)"></div>
          <div class="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-full"
               x-text="Math.max(0, (dossierData?.summary?.accounts_count || 0) - (dossierData?.summary?.sybil_accounts_count || 0)) + ' Brand • ' + (dossierData?.summary?.sybil_accounts_count || 0) + ' Satellite'"></div>
        </button>
      </div>

      <!-- 3-Tab Studio Navigation & Global Search/Copy Bar -->
      <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl p-3.5 shadow-sm flex items-center justify-between flex-wrap gap-3">
        <!-- 3 Main Tabs ONLY -->
        <div role="tablist" aria-label="Domain studio sections" class="flex items-center gap-1.5 flex-wrap">
          <button type="button" role="tab" :aria-selected="dossierTab === 'hub'"
                  @click="navigateDossierView('hub')"
                  class="px-3.5 py-1.5 rounded-xl text-xs font-semibold font-mono tabular-nums transition flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                  :class="dossierTab === 'hub' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#27272A]'">
            <i data-lucide="layers" class="w-3.5 h-3.5 shrink-0"></i>
            <span>SERP &amp; Content Hub</span>
          </button>

          <button type="button" role="tab" :aria-selected="dossierTab === 'accounts'"
                  @click="navigateDossierView('accounts')"
                  class="px-3.5 py-1.5 rounded-xl text-xs font-semibold font-mono tabular-nums transition flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
                  :class="dossierTab === 'accounts' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#27272A]'">
            <i data-lucide="user" class="w-3.5 h-3.5 shrink-0"></i>
            <span>Creators</span>
            <span class="px-1.5 py-0.2 rounded-full text-[10px] font-bold"
                  :class="dossierTab === 'accounts' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'"
                  x-text="dossierData?.accounts?.length || 0"></span>
          </button>

          <button type="button" role="tab" :aria-selected="dossierTab === 'visual_dna'"
                  @click="navigateDossierView('visual_dna')"
                  class="px-3.5 py-1.5 rounded-xl text-xs font-semibold font-mono tabular-nums transition flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                  :class="dossierTab === 'visual_dna' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#27272A]'">
            <i data-lucide="dna" class="w-3.5 h-3.5 shrink-0"></i>
            <span>Visual DNA</span>
          </button>
        </div>

        <!-- Contextual Search & 1-Click Copy Actions -->
        <div class="flex items-center gap-2 flex-wrap min-w-0">
          <div x-show="dossierTab !== 'visual_dna'" class="relative min-w-[200px] max-w-xs">
            <input type="text"
                   x-model="dossierSearch"
                   placeholder="Search articles, pins, keywords, creators..."
                   aria-label="Search in domain studio"
                   class="w-full text-xs font-mono tabular-nums rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#18181B] px-3 py-1.5 pr-7 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500">
            <template x-if="dossierSearch">
              <button type="button" @click="dossierSearch = ''" aria-label="Clear studio search" class="absolute right-2 top-1.5 text-slate-400 hover:text-slate-600 text-xs">✕</button>
            </template>
          </div>

          <button type="button" @click="copyAllArticleUrls()"
                  class="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#18181B] hover:bg-slate-100 dark:hover:bg-[#27272A] text-xs font-mono tabular-nums font-semibold text-slate-700 dark:text-slate-300 transition flex items-center gap-1 shadow-sm"
                  title="Copy all discovered article URLs to clipboard">
            <i data-lucide="clipboard-list" class="w-3.5 h-3.5 shrink-0"></i>
            <span>Copy URLs</span>
          </button>
          <button type="button" @click="copyAllKeywords()"
                  class="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#18181B] hover:bg-slate-100 dark:hover:bg-[#27272A] text-xs font-mono tabular-nums font-semibold text-slate-700 dark:text-slate-300 transition flex items-center gap-1 shadow-sm"
                  title="Copy all monopolized keywords to clipboard">
            <i data-lucide="clipboard-list" class="w-3.5 h-3.5 shrink-0"></i>
            <span>Copy Keywords</span>
          </button>
        </div>
      </div>

      <!-- Studio Content Body -->
      <div class="flex flex-col gap-4">
        <!-- Loading State -->
        <template x-if="dossierLoading">
          <div class="py-24 text-center text-slate-400 font-mono tabular-nums flex flex-col items-center justify-center gap-3">
            <i data-lucide="loader-2" class="w-7 h-7 animate-spin text-sky-500"></i>
            <span class="text-sm">De-obfuscating domain intelligence &amp; 4-pillar data...</span>
          </div>
        </template>

        <!-- Error & Cold Start State -->
        <template x-if="!dossierLoading && !dossierData">
          <div class="py-20 text-center flex flex-col items-center justify-center gap-4 bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl p-8 shadow-sm">
            <div class="w-12 h-12 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center"><i data-lucide="alert-triangle" class="w-6 h-6"></i></div>
            <div class="flex flex-col gap-1 max-w-md">
              <span class="text-base font-bold text-slate-900 dark:text-white">Dossier Cold-Start or Timed Out</span>
              <span class="text-xs text-slate-500 dark:text-slate-400">The serverless database or background compute may have experienced a cold start while compiling 4-pillar data for <span class="font-mono tabular-nums font-bold text-slate-700 dark:text-slate-300" x-text="dossierDomain"></span>.</span>
            </div>
            <button type="button" @click="openDossier(dossierDomain, false, true)"
                    class="px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-mono tabular-nums font-semibold shadow-sm transition flex items-center gap-2">
              <i data-lucide="refresh-cw" class="w-3.5 h-3.5 shrink-0"></i>
              <span>Retry Loading Dossier</span>
            </button>
          </div>
        </template>

        <!-- Main Studio Tab Views -->
        <template x-if="!dossierLoading && dossierData">
          <div class="flex flex-col gap-4">

            <!-- TAB 1: SERP & CONTENT HUB (Merged By Article / By Pin / By Keyword) -->
            <div x-show="dossierTab === 'hub'" class="space-y-3.5">

              <!-- Top Keywords Strip (Clickable Instant Filter + Show All N) -->
              <template x-if="(dossierData?.keyword_monopoly || []).length > 0">
                <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl p-3.5 shadow-sm flex flex-col gap-2.5">
                  <div class="flex items-center justify-between flex-wrap gap-2">
                    <div class="flex items-center gap-2">
                      <span class="inline-flex items-center gap-1.5 text-[11px] font-mono tabular-nums font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                        <i data-lucide="git-fork" class="w-3.5 h-3.5 text-sky-500 shrink-0"></i>
                        <span>Top Keywords Strip</span>
                      </span>
                      <span class="text-[11px] font-mono tabular-nums text-slate-400" x-text="'(' + (dossierData?.keyword_monopoly?.length || 0) + ' total)'"></span>
                    </div>
                    <div class="flex items-center gap-2">
                      <template x-if="dossierSelectedKeyword">
                        <button type="button" @click="dossierSelectedKeyword = ''"
                                class="px-2 py-0.5 rounded-md text-[11px] font-mono tabular-nums font-bold bg-sky-600 text-white hover:bg-sky-500 transition flex items-center gap-1">
                          <span x-text="'Filtered: ' + dossierSelectedKeyword"></span>
                          <span aria-hidden="true">✕</span>
                        </button>
                      </template>
                      <template x-if="(dossierData?.keyword_monopoly?.length || 0) > 12">
                        <button type="button" @click="dossierShowAllKeywordsStrip = !dossierShowAllKeywordsStrip"
                                class="px-2.5 py-0.5 rounded-md text-[11px] font-mono tabular-nums font-semibold border border-slate-200 dark:border-[#27272A] bg-slate-50 hover:bg-slate-100 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-sky-600 dark:text-sky-400 transition">
                          <span x-text="dossierShowAllKeywordsStrip ? 'Show top 12' : 'Show all (' + (dossierData?.keyword_monopoly?.length || 0) + ')'"></span>
                        </button>
                      </template>
                    </div>
                  </div>
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <template x-for="kw in topKeywordsStripList()" :key="kw.keyword_id">
                      <button type="button"
                              @click="toggleKeywordFilter(kw.keyword_name)"
                              :aria-pressed="dossierSelectedKeyword && dossierSelectedKeyword.toLowerCase() === kw.keyword_name.toLowerCase()"
                              class="px-2 py-1 rounded-lg text-[11px] font-mono tabular-nums border transition inline-flex items-center gap-1.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                              :class="(dossierSelectedKeyword && dossierSelectedKeyword.toLowerCase() === kw.keyword_name.toLowerCase()) ? 'bg-sky-600 text-white border-sky-600 shadow-sm font-bold' : 'bg-slate-50 hover:bg-sky-500/10 dark:bg-[#18181B] dark:hover:bg-sky-500/15 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-[#27272A] hover:border-sky-500/40'"
                              :title="'Filter Hub to keyword: ' + kw.keyword_name + ' (' + formatNumber(kw.total_saves) + ' saves, ' + formatVelocity(kw.daily_velocity) + ')'">
                        <span class="font-bold"
                              :class="(dossierSelectedKeyword && dossierSelectedKeyword.toLowerCase() === kw.keyword_name.toLowerCase()) ? 'text-white' : (kw.best_rank ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400')"
                              x-text="kw.best_rank ? '#' + kw.best_rank : (kw.best_vault_rank ? 'V#' + kw.best_vault_rank : 'Vault')"></span>
                        <span class="truncate max-w-[190px]" x-text="kw.keyword_name"></span>
                        <span class="text-[10px] opacity-75" x-text="'(' + (kw.active_slots + kw.displaced_slots) + ')'"></span>
                      </button>
                    </template>
                  </div>
                </div>
              </template>

              <!-- Hub Group-By Switcher, Status Filter, Sort & Expand All -->
              <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl p-3 shadow-sm flex items-center justify-between flex-wrap gap-2.5">
                <!-- Group by Switcher -->
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold px-1">Group by:</span>
                  <div class="inline-flex rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#18181B] p-0.5 text-xs font-mono tabular-nums">
                    <button type="button" @click="dossierHubMode = 'articles'; dossierArticlesPage = 1; if (dossierStatusFilter === 'catalog') dossierStatusFilter = 'all'"
                            class="px-3 py-1.5 rounded-lg transition font-semibold inline-flex items-center gap-1.5"
                            :class="dossierHubMode === 'articles' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'">
                      <i data-lucide="link" class="w-3.5 h-3.5 shrink-0"></i>
                      <span x-text="(dossierData?.summary?.is_organic_vault ? 'By Board' : 'By Article') + ' (' + filteredDossierArticles().length + ')'"></span>
                    </button>
                    <button type="button" @click="dossierHubMode = 'pins'; dossierPinsPage = 1"
                            class="px-3 py-1.5 rounded-lg transition font-semibold inline-flex items-center gap-1.5"
                            :class="dossierHubMode === 'pins' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'">
                      <i data-lucide="target" class="w-3.5 h-3.5 shrink-0"></i>
                      <span x-text="'By Pin (' + filteredDossierPins().length + ')'"></span>
                    </button>
                    <button type="button" @click="dossierHubMode = 'keywords'; if (dossierStatusFilter === 'catalog') dossierStatusFilter = 'all'"
                            class="px-3 py-1.5 rounded-lg transition font-semibold inline-flex items-center gap-1.5"
                            :class="dossierHubMode === 'keywords' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'">
                      <i data-lucide="git-fork" class="w-3.5 h-3.5 shrink-0"></i>
                      <span x-text="'By Keyword (' + filteredDossierKeywords().length + ')'"></span>
                    </button>
                  </div>
                </div>

                <!-- Status Filter, Sort & Expand All -->
                <div class="flex items-center gap-2 flex-wrap">
                  <div class="inline-flex rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#18181B] p-0.5 text-xs font-mono tabular-nums">
                    <button type="button" @click="dossierStatusFilter = 'all'; dossierPinsPage = 1; dossierArticlesPage = 1"
                            class="px-2.5 py-1 rounded-md transition font-medium"
                            :class="dossierStatusFilter === 'all' ? 'bg-white dark:bg-slate-700 text-sky-600 dark:text-sky-400 shadow-sm font-bold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'">
                      All
                    </button>
                    <button type="button" @click="dossierStatusFilter = 'active'; dossierPinsPage = 1; dossierArticlesPage = 1"
                            class="px-2.5 py-1 rounded-md transition font-medium"
                            :class="dossierStatusFilter === 'active' ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm font-bold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'">
                      Active SERP
                    </button>
                    <button type="button" @click="dossierStatusFilter = 'displaced'; dossierPinsPage = 1; dossierArticlesPage = 1"
                            class="px-2.5 py-1 rounded-md transition font-medium"
                            :class="dossierStatusFilter === 'displaced' ? 'bg-white dark:bg-slate-700 text-amber-600 dark:text-amber-400 shadow-sm font-bold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'">
                      Displaced
                    </button>
                    <template x-if="(dossierData?.summary?.catalog_only_pins_count || 0) > 0">
                      <button type="button" @click="dossierHubMode = 'pins'; dossierStatusFilter = 'catalog'; dossierPinsPage = 1"
                              class="px-2.5 py-1 rounded-md transition font-medium"
                              :class="dossierStatusFilter === 'catalog' ? 'bg-white dark:bg-slate-700 text-purple-600 dark:text-purple-400 shadow-sm font-bold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'"
                              title="Unranked profile catalog pins that have not yet entered SERP or Displaced Vault">
                        <span x-text="'Catalog Only (' + formatNumber(dossierData?.summary?.catalog_only_pins_count || 0) + ')'"></span>
                      </button>
                    </template>
                  </div>

                  <select x-model="dossierSort"
                          aria-label="Sort dossier items by"
                          class="text-xs font-mono tabular-nums rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#18181B] px-2.5 py-1.5 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-sky-500">
                    <option value="saves">Sort: Highest Saves</option>
                    <option value="velocity">Sort: Highest Daily Velocity</option>
                    <option value="gains_7d">Sort: Highest 7d Gains</option>
                    <option value="age_asc">Sort: Newest Pin (Fresh)</option>
                    <option value="age_desc">Sort: Oldest Pin (Evergreen)</option>
                    <option value="multiplier">Sort: Highest Multiplier</option>
                    <option value="rank">Sort: Best SERP Rank</option>
                  </select>

                  <template x-if="dossierHubMode === 'articles' && paginatedDossierArticles().length > 0">
                    <button type="button" @click="toggleAllArticlesExpand()"
                            class="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 hover:bg-slate-100 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-xs font-mono tabular-nums font-semibold text-slate-700 dark:text-slate-200 transition flex items-center gap-1 shadow-sm">
                      <i data-lucide="chevrons-up-down" class="w-3.5 h-3.5 shrink-0"></i>
                      <span x-text="areAllArticlesExpanded() ? 'Collapse All' : 'Expand All'"></span>
                    </button>
                  </template>
                  <template x-if="dossierHubMode === 'keywords' && filteredDossierKeywords().length > 0">
                    <button type="button" @click="toggleAllKeywordsExpand()"
                            class="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 hover:bg-slate-100 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-xs font-mono tabular-nums font-semibold text-slate-700 dark:text-slate-200 transition flex items-center gap-1 shadow-sm">
                      <i data-lucide="chevrons-up-down" class="w-3.5 h-3.5 shrink-0"></i>
                      <span x-text="areAllKeywordsExpanded() ? 'Collapse All' : 'Expand All'"></span>
                    </button>
                  </template>
                </div>
              </div>

              <!-- MODE 1: BY ARTICLE (Dense Expandable Horizontal Table — 0% Wasted Whitespace) -->
              <div x-show="dossierHubMode === 'articles'" class="space-y-3">
                <div class="overflow-x-auto bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl shadow-sm">
                  <div class="min-w-[980px] text-left text-xs">
                    <div class="grid grid-cols-[40px_minmax(280px,1fr)_78px_124px_165px_94px_92px_106px] items-center bg-slate-50/80 dark:bg-slate-900/60 border-b border-slate-200 dark:border-[#27272A] text-slate-500 dark:text-slate-400 font-mono tabular-nums text-[10.5px] font-bold uppercase tracking-wider">
                      <div class="py-3 px-2.5 text-center" aria-label="Expand article pins"></div>
                      <div class="py-3 px-3">Article Slug, Intents &amp; Keywords</div>
                      <div class="py-3 px-3 text-right">Pins</div>
                      <div class="py-3 px-3 text-right">Daily Velocity</div>
                      <div class="py-3 px-3 text-right">Saves &amp; Engagement</div>
                      <div class="py-3 px-3 text-right">Best Rank</div>
                      <div class="py-3 px-3 text-right">Pin Age</div>
                      <div class="py-3 px-3 text-right">Action</div>
                    </div>
                    <div class="divide-y divide-slate-100 dark:divide-slate-800/60">
                      <template x-for="art in paginatedDossierArticles()" :key="art.clean_slug">
                        <div class="group">
                          <div>
                            <!-- Main Dense Article Row -->
                            <div class="grid grid-cols-[40px_minmax(280px,1fr)_78px_124px_165px_94px_92px_106px] items-center hover:bg-slate-50/80 dark:hover:bg-[#18181B]/60 transition">
                              <!-- Expand Toggle -->
                              <div class="py-3 px-2 text-center">
                                <button type="button"
                                        @click="toggleArticleExpand(art.clean_slug)"
                                        :aria-expanded="Boolean(dossierExpandedArticles[art.clean_slug])"
                                        :aria-label="'Toggle pins for ' + art.clean_slug"
                                        class="w-7 h-7 rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#18181B] hover:bg-sky-500/10 text-slate-600 dark:text-slate-300 inline-flex items-center justify-center transition">
                                  <i data-lucide="chevron-down" class="w-3.5 h-3.5 transition-transform" :class="{ 'rotate-180 text-sky-500': dossierExpandedArticles[art.clean_slug] }"></i>
                                </button>
                              </div>

                              <!-- Article Slug, Intents & ALL Keywords (+N more expandable) -->
                              <div class="py-3 px-3 min-w-0">
                                <div class="flex items-center gap-2 flex-wrap">
                                  <button type="button" @click="toggleArticleExpand(art.clean_slug)"
                                          class="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-white hover:text-sky-600 dark:hover:text-sky-400 truncate max-w-md text-left"
                                          x-text="art.clean_slug === '/' ? 'Root Domain (/)' : art.clean_slug"></button>
                                  <template x-if="art.is_vulnerable">
                                    <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold font-mono tabular-nums bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30">
                                      <i data-lucide="zap" class="w-2.5 h-2.5 shrink-0"></i><span>Vulnerable</span>
                                    </span>
                                  </template>
                                </div>
                                <!-- Search Intents + Keywords Chips -->
                                <div class="flex items-center gap-1.5 flex-wrap mt-1.5">
                                  <template x-for="ang in (art.angles_targeted || [])" :key="ang">
                                    <span class="inline-flex items-center gap-1 text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#18181B] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-[#27272A]">
                                      <i data-lucide="target" class="w-2.5 h-2.5 shrink-0"></i><span x-text="ang"></span>
                                    </span>
                                  </template>
                                  <template x-for="kw in (dossierExpandedArtKws[art.clean_slug] ? (art.keywords || art.target_keywords || []) : (art.keywords || art.target_keywords || []).slice(0, 5))" :key="kw">
                                    <button type="button" @click="toggleKeywordFilter(kw)"
                                            class="text-[10px] font-mono tabular-nums px-2 py-0.5 rounded-md border transition inline-flex items-center gap-1 cursor-pointer"
                                            :class="(dossierSelectedKeyword && dossierSelectedKeyword.toLowerCase() === kw.toLowerCase()) ? 'bg-sky-600 text-white border-sky-600 font-bold' : 'bg-sky-500/10 hover:bg-sky-500/20 text-sky-700 dark:text-sky-300 border-sky-500/20'"
                                            :title="'Filter Hub by keyword: ' + kw">
                                      <span x-text="kw"></span>
                                    </button>
                                  </template>
                                  <template x-if="(art.keywords || art.target_keywords || []).length > 5">
                                    <button type="button" @click="toggleArticleKeywordsExpand(art.clean_slug)"
                                            class="text-[10px] font-mono tabular-nums font-bold px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-slate-600 dark:text-slate-300 transition"
                                            x-text="dossierExpandedArtKws[art.clean_slug] ? 'Show less' : '+' + ((art.keywords || art.target_keywords || []).length - 5) + ' more'"></button>
                                  </template>
                                </div>
                              </div>

                              <!-- Pins Count -->
                              <div class="py-3 px-3 text-right font-mono tabular-nums">
                                <div class="text-sm font-bold text-amber-600 dark:text-amber-400" x-text="art.pins_count"></div>
                                <div class="text-[10px] text-slate-400" x-text="(art.active_pins_count || 0) + 'A / ' + (art.vault_pins_count || 0) + 'V'"></div>
                              </div>

                              <!-- Daily Velocity & 7d Gains -->
                              <div class="py-3 px-3 text-right font-mono tabular-nums"
                                   :title="'24h: ' + formatSignedDelta(art.delta_saves_24h) + ' | 5d: ' + formatSignedDelta(art.gains_5d) + ' | 7d: ' + formatSignedDelta(art.gains_7d) + ' | 10d: ' + formatSignedDelta(art.gains_10d) + ' | 15d: ' + formatSignedDelta(art.gains_15d)">
                                <div class="inline-flex items-center justify-end px-2 py-0.5 rounded-md text-xs font-bold"
                                     :class="(Number(art.daily_velocity || 0) > 0) ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30' : 'text-slate-400'"
                                     x-text="formatVelocity(art.daily_velocity)"></div>
                                <div class="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5"
                                     x-text="'7d: ' + formatSignedDelta(art.gains_7d || 0)"></div>
                              </div>

                              <!-- Saves + Engagement + Global Article Saves -->
                              <div class="py-3 px-3 text-right font-mono tabular-nums">
                                <div class="text-xs font-bold text-emerald-600 dark:text-emerald-400" x-text="formatNumber(art.total_saves) + ' saves'"></div>
                                <div class="text-[10px] text-slate-400" x-text="formatNumber(art.total_repins || 0) + ' repins • ' + formatNumber(art.total_shares || 0) + ' sh'"></div>
                                <template x-if="art.url_global_saves != null && Number(art.url_global_saves) > 0">
                                  <div class="text-[10px] text-sky-600 dark:text-sky-400 font-bold mt-0.5"
                                       x-text="formatNumber(art.url_global_saves) + ' global' + ((Number(art.url_global_saves) / Math.max(1, Number(art.total_saves || 1))) >= 5.0 ? ' [' + (Number(art.url_global_saves) / Math.max(1, Number(art.total_saves || 1))).toFixed(1) + 'x]' : '')"></div>
                                </template>
                              </div>

                              <!-- Best Rank (Active or Vault) -->
                              <div class="py-3 px-3 text-right font-mono tabular-nums">
                                <template x-if="art.best_rank">
                                  <span class="px-2 py-0.5 rounded-md text-xs font-bold bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30" x-text="'#' + art.best_rank"></span>
                                </template>
                                <template x-if="!art.best_rank && art.best_vault_rank">
                                  <span class="px-2 py-0.5 rounded-md text-xs font-bold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20" x-text="'Vault #' + art.best_vault_rank"></span>
                                </template>
                                <template x-if="!art.best_rank && !art.best_vault_rank">
                                  <span class="text-slate-400">—</span>
                                </template>
                              </div>

                              <!-- Pin Age Range (min-max) -->
                              <div class="py-3 px-3 text-right font-mono tabular-nums"
                                   :title="'Newest: ' + (art.newest_pin_date ? art.newest_pin_date.slice(0, 10) : '—') + ' | Oldest: ' + (art.oldest_pin_date ? art.oldest_pin_date.slice(0, 10) : '—')">
                                <span class="px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 dark:bg-[#18181B] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-[#27272A]"
                                      x-text="formatAgeRange(art.min_pin_age_days, art.max_pin_age_days, art.newest_pin_date || art.created_at_pinterest, art.oldest_pin_date)"></span>
                              </div>

                              <!-- Actions -->
                              <div class="py-3 px-3 text-right flex items-center justify-end gap-1.5">
                                <button type="button" @click="copyToClipboard(art.sample_url || art.clean_slug, 'Copied article URL!')"
                                        class="p-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#27272A] transition"
                                        title="Copy URL"
                                        aria-label="Copy article URL">
                                  <i data-lucide="clipboard-list" class="w-3.5 h-3.5"></i>
                                </button>
                                <a :href="safeUrl(art.sample_url)"
                                   target="_blank"
                                   rel="noopener noreferrer"
                                   class="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-sky-600 dark:text-sky-400 text-[11px] font-semibold font-mono transition"
                                   title="Open article URL">
                                  Open ↗
                                </a>
                              </div>
                            </div>

                            <!-- Expanded Article Sub-Table: ALL Pins & Full Metrics -->
                            <template x-if="dossierExpandedArticles[art.clean_slug]">
                              <div class="bg-slate-50/70 dark:bg-[#09090B]/60 border-t border-slate-200 dark:border-[#27272A] px-4 py-3">
                              <div class="overflow-x-auto rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215]">
                                <table class="w-full text-left text-xs border-collapse">
                                  <thead class="bg-slate-100/70 dark:bg-slate-900/70 text-[10px] font-mono tabular-nums uppercase text-slate-500 border-b border-slate-200 dark:border-[#27272A]">
                                    <tr>
                                      <th class="py-2 px-3 w-14">Pin</th>
                                      <th class="py-2 px-3 min-w-[230px]">Title, Intent &amp; Keywords</th>
                                      <th class="py-2 px-3">Creator</th>
                                      <th class="py-2 px-3 text-right">Daily Velocity &amp; Gains</th>
                                      <th class="py-2 px-3 text-right">Saves &amp; Engagement</th>
                                      <th class="py-2 px-3 text-right">Rank</th>
                                      <th class="py-2 px-3 text-right">Pin Age</th>
                                      <th class="py-2 px-3 text-right">Action</th>
                                    </tr>
                                  </thead>
                                  <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60">
                                    <template x-for="p in (art.pins || [])" :key="p.pin_id">
                                      <tr class="hover:bg-slate-50/80 dark:hover:bg-[#18181B]/60 transition">
                                        <td class="py-2.5 px-3">
                                          <img :src="p.image_url"
                                               alt="Pin preview"
                                               referrerpolicy="no-referrer"
                                               class="w-10 h-14 rounded-lg object-cover bg-slate-200 dark:bg-slate-700 shrink-0 shadow-sm"
                                               loading="lazy"
                                               onerror="if(window.handlePinImgError){window.handlePinImgError(this)}else{this.onerror=null}">
                                        </td>
                                        <td class="py-2.5 px-3 min-w-[230px]">
                                          <div class="flex items-center gap-1.5 flex-wrap">
                                            <span class="font-bold text-slate-900 dark:text-white truncate max-w-[260px]" x-text="p.title"></span>
                                            <template x-if="p.intent_tag">
                                              <span class="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30" x-text="p.intent_tag"></span>
                                            </template>
                                            <template x-if="p.is_vulnerable">
                                              <span class="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30">Vulnerable</span>
                                            </template>
                                          </div>
                                          <div class="flex items-center gap-2 text-[10px] font-mono tabular-nums text-slate-400 mt-0.5 flex-wrap">
                                            <span x-text="'#' + p.pin_id"></span>
                                            <template x-if="p.dominant_color && p.dominant_color.toLowerCase() !== '#888888'">
                                              <span class="inline-flex items-center gap-1">
                                                <span class="w-2 h-2 rounded-full border border-slate-400/40" :style="'background-color: ' + safeColor(p.dominant_color, '#888888')"></span>
                                                <span x-text="p.dominant_color"></span>
                                              </span>
                                            </template>
                                            <template x-if="p.creation_method">
                                              <span x-text="'• ' + p.creation_method"></span>
                                            </template>
                                            <template x-if="p.first_seen_at">
                                              <span x-text="'• Seen ' + String(p.first_seen_at).slice(0, 10)"></span>
                                            </template>
                                          </div>
                                          <!-- All SERP Appearances on this Pin (+N more expandable) -->
                                          <div class="flex items-center gap-1 flex-wrap mt-1.5">
                                            <template x-for="sa in (dossierExpandedPinKws[art.clean_slug + ':' + p.pin_id] ? (p.serp_appearances || []) : (p.serp_appearances || []).slice(0, 4))" :key="sa.keyword_id">
                                              <button type="button" @click="toggleKeywordFilter(sa.keyword_name)"
                                                      class="text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded bg-sky-500/10 hover:bg-sky-500/20 text-sky-700 dark:text-sky-300 border border-sky-500/20 inline-flex items-center gap-1 cursor-pointer">
                                                <span class="font-bold" x-text="sa.rank_position ? '#' + sa.rank_position : (sa.last_known_rank ? 'V#' + sa.last_known_rank : 'Vault')"></span>
                                                <span class="truncate max-w-[140px]" x-text="sa.keyword_name"></span>
                                              </button>
                                            </template>
                                            <template x-if="(p.serp_appearances || []).length > 4">
                                              <button type="button" @click="togglePinKeywordsExpand(art.clean_slug + ':' + p.pin_id)"
                                                      class="text-[10px] font-mono tabular-nums font-bold px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-slate-600 dark:text-slate-300 transition"
                                                      x-text="dossierExpandedPinKws[art.clean_slug + ':' + p.pin_id] ? 'Show less' : '+' + ((p.serp_appearances || []).length - 4) + ' more'"></button>
                                            </template>
                                          </div>
                                        </td>
                                        <td class="py-2.5 px-3 font-mono tabular-nums text-[11px]">
                                          <template x-if="p.creator_username">
                                            <a :href="safeUrl('/accounts?creator=' + encodeURIComponent(p.creator_username.replace(/^@+/, '')))"
                                               target="_blank" rel="noopener noreferrer"
                                               class="text-purple-600 dark:text-purple-400 hover:underline truncate max-w-[120px] block"
                                               x-text="'@' + p.creator_username"></a>
                                          </template>
                                          <template x-if="!p.creator_username"><span class="text-slate-400">—</span></template>
                                        </td>
                                        <td class="py-2.5 px-3 text-right font-mono tabular-nums">
                                          <div class="font-bold text-xs"
                                               :class="Number(p.velocity || 0) > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400'"
                                               x-text="formatVelocity(p.velocity)"></div>
                                          <div class="text-[10px] text-slate-400"
                                               x-text="'24h:' + formatSignedDelta(p.delta_saves_24h) + ' • 7d:' + formatSignedDelta(p.gains_7d)"></div>
                                          <div class="text-[9.5px] text-slate-400"
                                               x-text="'5d:' + formatSignedDelta(p.gains_5d) + ' • 15d:' + formatSignedDelta(p.gains_15d)"></div>
                                        </td>
                                        <td class="py-2.5 px-3 text-right font-mono tabular-nums">
                                          <div class="font-bold text-emerald-600 dark:text-emerald-400" x-text="formatNumber(p.saves) + ' saves'"></div>
                                          <div class="text-[10px] text-slate-400"
                                               x-text="formatNumber(p.repins || 0) + ' rep' + (Number(p.delta_repins_24h || 0) !== 0 ? ' (' + formatSignedDelta(p.delta_repins_24h) + ')' : '')"></div>
                                          <div class="text-[9.5px] text-slate-400"
                                               x-text="formatNumber(p.shares || 0) + ' sh • ' + formatNumber(p.comments || 0) + ' cm • ' + formatNumber(p.reactions || 0) + ' rx'"></div>
                                        </td>
                                        <td class="py-2.5 px-3 text-right font-mono tabular-nums">
                                          <span class="font-bold"
                                                :class="p.best_rank ? 'text-sky-600 dark:text-sky-400' : 'text-amber-600 dark:text-amber-400'"
                                                x-text="p.best_rank ? '#' + p.best_rank : (p.best_vault_rank ? 'V#' + p.best_vault_rank : (p.last_known_rank ? 'V#' + p.last_known_rank : 'Vault'))"></span>
                                        </td>
                                        <td class="py-2.5 px-3 text-right font-mono tabular-nums">
                                          <template x-if="getPinAgeBadgeFromDays(p.pin_age_days, p.created_at_pinterest)">
                                            <span class="px-1.5 py-0.5 rounded text-[10px] font-bold inline-block"
                                                  :class="getPinAgeBadgeFromDays(p.pin_age_days, p.created_at_pinterest).class"
                                                  :title="getPinAgeBadgeFromDays(p.pin_age_days, p.created_at_pinterest).title"
                                                  x-text="getPinAgeBadgeFromDays(p.pin_age_days, p.created_at_pinterest).label"></span>
                                          </template>
                                          <template x-if="!getPinAgeBadgeFromDays(p.pin_age_days, p.created_at_pinterest)"><span class="text-slate-400">—</span></template>
                                        </td>
                                        <td class="py-2.5 px-3 text-right">
                                          <a :href="getPinInspectUrl(p.pin_id)"
                                             target="_blank" rel="noopener noreferrer"
                                             class="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-slate-700 dark:text-slate-200 text-[11px] font-semibold font-mono inline-block">
                                            Inspect ↗
                                          </a>
                                        </td>
                                      </tr>
                                    </template>
                                  </tbody>
                                </table>
                              </div>
                            </div>
                            </template>
                          </div>
                        </div>
                      </template>
                    </div>
                  </div>
                </div>

                <template x-if="filteredDossierArticles().length === 0">
                  <div class="py-12 text-center text-slate-400 font-mono tabular-nums text-xs bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl">
                    <span>No articles matched your search or filters.</span>
                    <button type="button" @click="clearDossierFilters()" class="ml-2 text-sky-600 dark:text-sky-400 hover:underline font-bold">Reset filters</button>
                  </div>
                </template>

                <!-- Articles Pagination Controls -->
                <template x-if="totalDossierArticlesPages() > 1">
                  <div class="flex items-center justify-between border-t border-slate-200 dark:border-[#27272A] pt-3 px-1 text-xs font-mono tabular-nums">
                    <span class="text-slate-500 dark:text-slate-400">
                      Showing <span class="font-bold text-slate-800 dark:text-slate-200" x-text="((dossierArticlesPage - 1) * dossierArticlesPerPage) + 1"></span> - <span class="font-bold text-slate-800 dark:text-slate-200" x-text="Math.min(dossierArticlesPage * dossierArticlesPerPage, filteredDossierArticles().length)"></span> of <span class="font-bold text-slate-800 dark:text-slate-200" x-text="filteredDossierArticles().length"></span> articles
                    </span>
                    <div class="flex items-center gap-1.5">
                      <button type="button" @click="prevDossierArticlesPage()"
                              :disabled="dossierArticlesPage <= 1"
                              class="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-[#27272A] transition">
                        ← Prev
                      </button>
                      <span class="px-2 py-1 text-slate-600 dark:text-slate-400">
                        Page <span class="font-bold text-slate-900 dark:text-white" x-text="dossierArticlesPage"></span> / <span x-text="totalDossierArticlesPages()"></span>
                      </span>
                      <button type="button" @click="nextDossierArticlesPage()"
                              :disabled="dossierArticlesPage >= totalDossierArticlesPages()"
                              class="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-[#27272A] transition">
                        Next →
                      </button>
                    </div>
                  </div>
                </template>
              </div>

              <!-- MODE 2: BY PIN (Dense Table with Pin Age, Daily Velocity, Full Keywords +N more, Engagement) -->
              <div x-show="dossierHubMode === 'pins'" class="space-y-3">
                <div class="overflow-x-auto bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl shadow-sm">
                  <table class="w-full text-left text-xs border-collapse">
                    <thead class="bg-slate-50/80 dark:bg-slate-900/60 border-b border-slate-200 dark:border-[#27272A] text-slate-500 dark:text-slate-400 font-mono tabular-nums text-[10.5px] uppercase tracking-wider">
                      <tr>
                        <th class="py-3 px-3 w-10 text-center">#</th>
                        <th class="py-3 px-3 w-16">Preview</th>
                        <th class="py-3 px-3 min-w-[270px]">Pin, Article &amp; All SERP Appearances</th>
                        <th class="py-3 px-3 min-w-[120px]">Creator</th>
                        <th class="py-3 px-3 text-right">Daily Velocity</th>
                        <th class="py-3 px-3 text-right">Saves &amp; Engagement</th>
                        <th class="py-3 px-3 text-right">Pin Age</th>
                        <th class="py-3 px-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60">
                      <template x-for="(p, idx) in paginatedDossierPins()" :key="p.pin_id">
                        ${renderPinRowTemplate({
                          pinVar: 'p',
                          indexVar: 'idx',
                          showCheckbox: false,
                          showRank: true,
                          rankPosition: 'beforeThumb',
                          showThumb: true,
                          showTitle: true,
                          showDomain: true,
                          showVelocity: true,
                          velocityPosition: 'beforeSaves',
                          showSaves: true,
                          showRepins: false,
                          showAge: true,
                          agePosition: 'beforeActions',
                          showActions: true,
                          rowClass: 'hover:bg-slate-50/80 dark:hover:bg-[#18181B]/60 transition',
                          rankHtml: `
                          <td class="py-3 px-3 text-center font-mono tabular-nums text-slate-400 text-xs" x-text="((dossierPinsPage - 1) * dossierPinsPerPage) + idx + 1"></td>`,
                          thumbHtml: `
                          <td class="py-3 px-3">
                            <img :src="p.image_url"
                                 alt="Pin preview"
                                 referrerpolicy="no-referrer"
                                 class="w-12 h-16 rounded-xl object-cover bg-slate-200 dark:bg-slate-700 shrink-0 shadow-sm"
                                 loading="lazy"
                                 onerror="if(window.handlePinImgError){window.handlePinImgError(this)}else{this.onerror=null}">
                          </td>`,
                          titleHtml: `
                          <td class="py-3 px-3 min-w-[270px]">
                            <div class="flex flex-col min-w-0">
                              <div class="flex items-center gap-2 flex-wrap">
                                <span class="text-sm font-bold text-slate-900 dark:text-white truncate max-w-md" x-text="p.title"></span>
                                <template x-if="p.is_vulnerable">
                                  <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold font-mono tabular-nums bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30 shrink-0"
                                        title="Decaying Monopoly: High Saves + Stale Velocity. Vulnerable to Fresh Pin Overhaul!">
                                    <i data-lucide="zap" class="w-2.5 h-2.5 shrink-0"></i><span>Decaying Monopoly</span>
                                  </span>
                                </template>
                                <template x-if="p.is_video">
                                  <span class="px-1.5 py-0.5 rounded text-[9px] font-bold font-mono bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30">Video</span>
                                </template>
                              </div>
                              <div class="flex items-center gap-2 text-xs text-slate-400 font-mono tabular-nums mt-1 flex-wrap">
                                <span x-text="'Pin #' + p.pin_id"></span>
                                <template x-if="p.clean_slug && p.clean_slug !== '/'">
                                  <button type="button" @click="filterToArticle(p.clean_slug)"
                                          class="text-sky-600 dark:text-sky-400 hover:underline truncate max-w-[180px]"
                                          :title="'Open article ' + p.clean_slug"
                                          x-text="p.clean_slug"></button>
                                </template>
                                <template x-if="p.dominant_color && p.dominant_color.toLowerCase() !== '#888888' && p.dominant_color.toLowerCase() !== '#1e1e24'">
                                  <span class="inline-flex items-center gap-1 text-[10px]">
                                    <span aria-hidden="true">•</span>
                                    <span class="w-2.5 h-2.5 rounded-full border border-slate-400/40 inline-block shadow-sm" :style="'background-color: ' + safeColor(p.dominant_color, '#888888')"></span>
                                    <span x-text="p.dominant_color"></span>
                                  </span>
                                </template>
                                <template x-if="Array.isArray(p.visual_annotations) && p.visual_annotations.length > 0">
                                  <span class="inline-flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400 max-w-[200px]"
                                        :title="(p.visual_annotations || []).map(a => typeof a === 'object' && a !== null ? (a.name || a.tag || a.label || a.term || '') : String(a || '')).filter(Boolean).join(', ')">
                                    <span aria-hidden="true">•</span><i data-lucide="tag" class="w-2.5 h-2.5 shrink-0"></i><span class="truncate" x-text="(p.visual_annotations || []).map(a => typeof a === 'object' && a !== null ? (a.name || a.tag || a.label || a.term || '') : String(a || '')).filter(Boolean).slice(0, 3).join(', ')"></span>
                                  </span>
                                </template>
                                <template x-if="p.first_seen_at">
                                  <span class="text-[10px]" x-text="'• Seen ' + String(p.first_seen_at).slice(0, 10)"></span>
                                </template>
                              </div>
                              <!-- All SERP Appearances Badges (+N more expandable — ZERO clipped keywords!) -->
                              <div class="flex items-center gap-1.5 flex-wrap mt-2">
                                <template x-for="app in (dossierExpandedPinKws[p.pin_id] ? (p.serp_appearances || []) : (p.serp_appearances || []).slice(0, 5))" :key="app.keyword_id">
                                  <button type="button" @click="toggleKeywordFilter(app.keyword_name)"
                                          class="text-[10px] font-mono tabular-nums px-2 py-0.5 rounded-md border transition-colors inline-flex items-center gap-1 cursor-pointer"
                                          :class="(dossierSelectedKeyword && dossierSelectedKeyword.toLowerCase() === app.keyword_name.toLowerCase()) ? 'bg-sky-600 text-white border-sky-600 font-bold' : 'bg-sky-500/10 hover:bg-sky-500/20 text-sky-700 dark:text-sky-300 border-sky-500/20'"
                                          :title="'Filter Hub by keyword: ' + app.keyword_name">
                                    <span x-text="app.rank_position ? '#' + app.rank_position : (app.last_known_rank ? 'Vault #' + app.last_known_rank : 'Displaced')" class="font-bold"></span>
                                    <template x-if="app.rank_delta != null && app.rank_delta !== 0">
                                      <span class="text-[9px]" :class="app.rank_delta > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'" x-text="(app.rank_delta > 0 ? '▲' : '▼') + Math.abs(app.rank_delta)"></span>
                                    </template>
                                    <span class="truncate max-w-[150px]" x-text="app.keyword_name"></span>
                                  </button>
                                </template>
                                <template x-if="(p.serp_appearances || []).length > 5">
                                  <button type="button" @click="togglePinKeywordsExpand(p.pin_id)"
                                          class="text-[10px] font-mono tabular-nums font-bold px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-[#27272A] transition"
                                          x-text="dossierExpandedPinKws[p.pin_id] ? 'Show less' : '+' + ((p.serp_appearances || []).length - 5) + ' more'"></button>
                                </template>
                              </div>
                            </div>
                          </td>`,
                          domainHtml: `
                          <td class="py-3 px-3 font-mono tabular-nums text-xs">
                            <template x-if="p.creator_username">
                              <a :href="safeUrl('/accounts?creator=' + encodeURIComponent(p.creator_username.replace(/^@+/, '')))"
                                 target="_blank"
                                 rel="noopener noreferrer"
                                 class="text-purple-600 dark:text-purple-400 hover:underline truncate max-w-[140px] block"
                                 :title="'Inspect creator @' + p.creator_username"
                                 x-text="'@' + p.creator_username"></a>
                            </template>
                            <template x-if="!p.creator_username">
                              <span class="text-slate-400">Unknown</span>
                            </template>
                          </td>`,
                          velocityHtml: `
                          <td class="py-3 px-3 text-right font-mono tabular-nums"
                              :title="'24h: ' + formatSignedDelta(p.delta_saves_24h) + ' | 5d: ' + formatSignedDelta(p.gains_5d) + ' | 7d: ' + formatSignedDelta(p.gains_7d) + ' | 10d: ' + formatSignedDelta(p.gains_10d) + ' | 15d: ' + formatSignedDelta(p.gains_15d)">
                            <div class="inline-flex items-center justify-end px-2 py-0.5 rounded-md text-xs font-bold"
                                 :class="Number(p.velocity || 0) > 0 ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30' : 'text-slate-400'"
                                 x-text="formatVelocity(p.velocity)"></div>
                            <div class="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5"
                                 x-text="'7d: ' + formatSignedDelta(p.gains_7d || 0) + ' • 15d: ' + formatSignedDelta(p.gains_15d || 0)"></div>
                          </td>`,
                          savesHtml: `
                          <td class="py-3 px-3 text-right font-mono tabular-nums text-xs">
                            <div class="font-bold text-emerald-600 dark:text-emerald-400" x-text="formatNumber(p.saves) + ' saves'"></div>
                            <div class="text-[10px] text-slate-400"
                                 x-text="formatNumber(p.repins || 0) + ' rep' + (Number(p.delta_repins_24h || 0) !== 0 ? ' (' + formatSignedDelta(p.delta_repins_24h) + ')' : '') + ' • ' + formatNumber(p.shares || 0) + ' sh'"></div>
                            <template x-if="(p.comments || 0) > 0 || (p.reactions || 0) > 0">
                              <div class="text-[9.5px] text-slate-400"
                                   x-text="formatNumber(p.comments || 0) + ' cm • ' + formatNumber(p.reactions || 0) + ' rx'"></div>
                            </template>
                            <template x-if="p.url_global_saves != null && Number(p.url_global_saves) > 0">
                              <div class="text-[9.5px] text-sky-600 dark:text-sky-400 font-bold"
                                   x-text="formatNumber(p.url_global_saves) + ' URL global'"></div>
                            </template>
                          </td>`,
                          ageHtml: `
                          <td class="py-3 px-3 text-right font-mono tabular-nums text-xs">
                            <template x-if="getPinAgeBadgeFromDays(p.pin_age_days, p.created_at_pinterest)">
                              <div class="flex flex-col items-end gap-0.5">
                                <span class="px-1.5 py-0.5 rounded text-[10px] font-bold font-mono tabular-nums inline-block"
                                      :class="getPinAgeBadgeFromDays(p.pin_age_days, p.created_at_pinterest).class"
                                      :title="getPinAgeBadgeFromDays(p.pin_age_days, p.created_at_pinterest).title"
                                      x-text="getPinAgeBadgeFromDays(p.pin_age_days, p.created_at_pinterest).label"></span>
                                <template x-if="p.created_at_pinterest">
                                  <span class="text-[9.5px] text-slate-400" x-text="String(p.created_at_pinterest).slice(0, 10)"></span>
                                </template>
                              </div>
                            </template>
                            <template x-if="!getPinAgeBadgeFromDays(p.pin_age_days, p.created_at_pinterest)">
                              <span class="text-slate-400">—</span>
                            </template>
                          </td>`,
                          actionsHtml: `
                          <td class="py-3 px-3 text-right">
                            <a :href="getPinInspectUrl(p.pin_id)"
                               target="_blank"
                               rel="noopener noreferrer"
                               class="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-slate-700 dark:text-slate-200 text-xs font-semibold transition font-mono tabular-nums inline-block">
                              Inspect ↗
                            </a>
                          </td>`
                        })}
                      </template>
                    </tbody>
                  </table>
                </div>

                <template x-if="filteredDossierPins().length === 0">
                  <div class="py-12 text-center text-slate-400 font-mono tabular-nums text-xs bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl">
                    <span>No ranked pins matched your search or filters.</span>
                    <button type="button" @click="clearDossierFilters()" class="ml-2 text-sky-600 dark:text-sky-400 hover:underline font-bold">Reset filters</button>
                  </div>
                </template>

                <!-- Pins Pagination Controls -->
                <template x-if="totalDossierPinsPages() > 1">
                  <div class="flex items-center justify-between border-t border-slate-200 dark:border-[#27272A] pt-3 px-1 text-xs font-mono tabular-nums">
                    <span class="text-slate-500 dark:text-slate-400">
                      Showing <span class="font-bold text-slate-800 dark:text-slate-200" x-text="((dossierPinsPage - 1) * dossierPinsPerPage) + 1"></span> - <span class="font-bold text-slate-800 dark:text-slate-200" x-text="Math.min(dossierPinsPage * dossierPinsPerPage, filteredDossierPins().length)"></span> of <span class="font-bold text-slate-800 dark:text-slate-200" x-text="filteredDossierPins().length"></span> pins
                    </span>
                    <div class="flex items-center gap-1.5">
                      <button type="button" @click="prevDossierPinsPage()"
                              :disabled="dossierPinsPage <= 1"
                              class="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-[#27272A] transition">
                        ← Prev
                      </button>
                      <span class="px-2 py-1 text-slate-600 dark:text-slate-400">
                        Page <span class="font-bold text-slate-900 dark:text-white" x-text="dossierPinsPage"></span> / <span x-text="totalDossierPinsPages()"></span>
                      </span>
                      <button type="button" @click="nextDossierPinsPage()"
                              :disabled="dossierPinsPage >= totalDossierPinsPages()"
                              class="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-[#27272A] transition">
                        Next →
                      </button>
                    </div>
                  </div>
                </template>

                <!-- On-Demand Displaced Pins Loader -->
                <template x-if="dossierData?.summary?.displaced_remaining_count > 0">
                  <div class="mt-4 p-4 rounded-2xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 flex items-center justify-between flex-wrap gap-3 font-mono tabular-nums text-xs">
                    <div class="flex items-center gap-2">
                      <span class="inline-flex items-center gap-1.5 text-sky-600 dark:text-sky-400 font-bold"><i data-lucide="package" class="w-3.5 h-3.5 shrink-0"></i><span>Historical Displaced Vault:</span></span>
                      <span class="text-slate-600 dark:text-slate-300" x-text="formatNumber(dossierData.summary.displaced_remaining_count) + ' additional historical displaced pins are stored in Unified PostgreSQL.'"></span>
                    </div>
                    <template x-if="currentDisplacedLimit < 500">
                      <button type="button" @click="loadMoreDisplaced()"
                              :disabled="dossierLoadingMore"
                              class="px-3.5 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold transition flex items-center gap-1.5 shadow-sm disabled:opacity-50">
                        <i data-lucide="refresh-cw" class="w-3.5 h-3.5 shrink-0" :class="{ 'animate-spin': dossierLoadingMore }"></i>
                        <span x-text="dossierLoadingMore ? 'Hydrating Vault...' : 'Load +50 Displaced Vault Pins'">Load +50 Displaced Vault Pins</span>
                      </button>
                    </template>
                    <template x-if="currentDisplacedLimit >= 500">
                      <span class="text-slate-500 dark:text-slate-400 font-semibold">Max 500 displaced pins loaded</span>
                    </template>
                  </div>
                </template>
              </div>

              <!-- MODE 3: BY KEYWORD (Dense 1-Row-Per-Keyword Expandable Table — Active + Vault Positions) -->
              <div x-show="dossierHubMode === 'keywords'" class="space-y-3">
                <div class="overflow-x-auto bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl shadow-sm">
                  <div class="min-w-[1066px] text-left text-xs">
                    <div class="grid grid-cols-[40px_minmax(230px,1.2fr)_minmax(170px,1fr)_96px_118px_112px_90px_minmax(210px,1.1fr)] items-center bg-slate-50/80 dark:bg-slate-900/60 border-b border-slate-200 dark:border-[#27272A] text-slate-500 dark:text-slate-400 font-mono tabular-nums text-[10.5px] font-bold uppercase tracking-wider">
                      <div class="py-3 px-2.5 text-center" aria-label="Expand keyword slots"></div>
                      <div class="py-3 px-3">Keyword &amp; Strategy</div>
                      <div class="py-3 px-3">Positions (Active &amp; Vault)</div>
                      <div class="py-3 px-3 text-right">Slots</div>
                      <div class="py-3 px-3 text-right">Daily Velocity</div>
                      <div class="py-3 px-3 text-right">Saves</div>
                      <div class="py-3 px-3 text-right">Pin Age</div>
                      <div class="py-3 px-3">Top Driver</div>
                    </div>
                    <div class="divide-y divide-slate-100 dark:divide-slate-800/60">
                      <template x-for="kw in filteredDossierKeywords()" :key="kw.keyword_id">
                        <div>
                          <div>
                            <div class="grid grid-cols-[40px_minmax(230px,1.2fr)_minmax(170px,1fr)_96px_118px_112px_90px_minmax(210px,1.1fr)] items-center hover:bg-slate-50/80 dark:hover:bg-[#18181B]/60 transition">
                              <!-- Expand Toggle -->
                              <div class="py-2.5 px-2 text-center">
                                <button type="button"
                                        @click="toggleKeywordExpand(kw.keyword_id)"
                                        :aria-expanded="Boolean(dossierExpandedKeywords[kw.keyword_id])"
                                        :aria-label="'Toggle slots for ' + kw.keyword_name"
                                        class="w-7 h-7 rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#18181B] hover:bg-sky-500/10 text-slate-600 dark:text-slate-300 inline-flex items-center justify-center transition">
                                  <i data-lucide="chevron-down" class="w-3.5 h-3.5 transition-transform" :class="{ 'rotate-180 text-sky-500': dossierExpandedKeywords[kw.keyword_id] }"></i>
                                </button>
                              </div>

                              <!-- Keyword & Strategy -->
                              <div class="py-2.5 px-3 min-w-0">
                                <div class="flex items-center gap-2 flex-wrap">
                                  <button type="button" @click="toggleKeywordExpand(kw.keyword_id)"
                                          class="text-sm font-bold text-slate-900 dark:text-white hover:text-sky-600 dark:hover:text-sky-400 text-left"
                                          x-text="kw.keyword_name"></button>
                                  <a :href="safeUrl('/keywords/' + encodeURIComponent(kw.keyword_name))"
                                     target="_blank" rel="noopener noreferrer"
                                     class="text-[10.5px] text-sky-600 hover:underline font-mono tabular-nums">SERP ↗</a>
                                </div>
                                <div class="flex items-center gap-1.5 flex-wrap mt-1">
                                  <template x-if="kw.strategy === 'URL_FLOODING'">
                                    <span class="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                                      <i data-lucide="flame" class="w-2.5 h-2.5 shrink-0"></i><span>URL Flooding</span>
                                    </span>
                                  </template>
                                  <template x-if="kw.strategy === 'TOPIC_CLUSTER'">
                                    <span class="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full font-bold bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30">
                                      <i data-lucide="git-branch" class="w-2.5 h-2.5 shrink-0"></i><span x-text="'Cluster (' + kw.unique_urls_count + ' Art)'"></span>
                                    </span>
                                  </template>
                                  <template x-if="kw.strategy === 'HYBRID_FLOODING'">
                                    <span class="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full font-bold bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30">
                                      <i data-lucide="zap" class="w-2.5 h-2.5 shrink-0"></i><span>Hybrid</span>
                                    </span>
                                  </template>
                                  <template x-if="kw.strategy === 'SINGLE_SLOT'">
                                    <span class="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full font-semibold bg-slate-100 dark:bg-[#18181B] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-[#27272A]">Single Slot</span>
                                  </template>
                                  <template x-if="kw.is_decaying_monopoly">
                                    <span class="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded font-bold bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30">Vulnerable</span>
                                  </template>
                                </div>
                              </div>

                              <!-- Positions (Active & Vault — NEVER blank!) -->
                              <div class="py-2.5 px-3 flex items-center gap-1 flex-wrap font-mono tabular-nums">
                                <template x-for="(r, rIdx) in (kw.ranks || [])" :key="'act-' + rIdx">
                                  <span class="text-[10px] font-bold px-1.5 py-0.5 rounded"
                                        :class="r <= 3 ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30' : (r <= 10 ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30' : 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30')"
                                        x-text="'#' + r"></span>
                                </template>
                                <template x-for="(vr, vIdx) in ((kw.vault_ranks || []).slice(0, 4))" :key="'v-' + vIdx">
                                  <span class="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#18181B] text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-[#27272A]"
                                        x-text="'V#' + vr"></span>
                                </template>
                                <template x-if="(kw.vault_ranks || []).length > 4">
                                  <button type="button" @click="toggleKeywordExpand(kw.keyword_id)"
                                          class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-slate-500 dark:text-slate-300"
                                          x-text="'+' + ((kw.vault_ranks || []).length - 4)"></button>
                                </template>
                                <template x-if="!(kw.ranks || []).length && !(kw.vault_ranks || []).length">
                                  <span class="text-[10px] text-slate-400">Displaced</span>
                                </template>
                              </div>

                              <!-- Slots -->
                              <div class="py-2.5 px-3 text-right font-mono tabular-nums">
                                <div class="font-bold text-sky-600 dark:text-sky-400" x-text="kw.active_slots + 'A (' + kw.serp_share_pct + '%)'"></div>
                                <div class="text-[10px] text-slate-400" x-text="(kw.displaced_slots || 0) + ' Vault'"></div>
                              </div>

                              <!-- Daily Velocity -->
                              <div class="py-2.5 px-3 text-right font-mono tabular-nums">
                                <div class="inline-flex items-center justify-end px-2 py-0.5 rounded-md text-xs font-bold"
                                     :class="Number(kw.daily_velocity || 0) > 0 ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30' : 'text-slate-400'"
                                     x-text="formatVelocity(kw.daily_velocity)"></div>
                                <div class="text-[10px] text-slate-400 mt-0.5" x-text="'7d: ' + formatSignedDelta(kw.gains_7d || 0)"></div>
                              </div>

                              <!-- Saves -->
                              <div class="py-2.5 px-3 text-right font-mono tabular-nums">
                                <div class="font-bold text-emerald-600 dark:text-emerald-400" x-text="formatNumber(kw.total_saves)"></div>
                                <template x-if="(kw.active_total_saves || 0) > 0 && kw.active_total_saves !== kw.total_saves">
                                  <div class="text-[10px] text-slate-400" x-text="formatNumber(kw.active_total_saves) + ' active'"></div>
                                </template>
                              </div>

                              <!-- Pin Age Range -->
                              <div class="py-2.5 px-3 text-right font-mono tabular-nums"
                                   :title="'Newest: ' + (kw.newest_pin_date ? kw.newest_pin_date.slice(0, 10) : '—') + ' | Oldest: ' + (kw.oldest_pin_date ? kw.oldest_pin_date.slice(0, 10) : '—')">
                                <span class="px-2 py-0.5 rounded-md text-[10.5px] font-bold bg-slate-100 dark:bg-[#18181B] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-[#27272A]"
                                      x-text="formatAgeRange(kw.min_pin_age_days, kw.max_pin_age_days, kw.newest_pin_date, kw.oldest_pin_date)"></span>
                              </div>

                              <!-- Top Driver -->
                              <div class="py-2.5 px-3 min-w-0 font-mono tabular-nums text-[11px]">
                                <template x-if="kw.top_slot_attribution">
                                  <div class="flex flex-col min-w-0">
                                    <div class="flex items-center gap-1 min-w-0">
                                      <span class="font-bold shrink-0"
                                            :class="kw.top_slot_attribution.rank_position != null ? 'text-sky-600 dark:text-sky-400' : 'text-amber-600 dark:text-amber-400'"
                                            x-text="kw.top_slot_attribution.rank_position != null ? ('#' + kw.top_slot_attribution.rank_position) : (kw.top_slot_attribution.last_known_rank != null ? ('V#' + kw.top_slot_attribution.last_known_rank) : 'Vault')"></span>
                                      <button type="button" @click="filterToArticle((kw.top_slot_attribution.clean_slug && kw.top_slot_attribution.clean_slug !== '/') ? kw.top_slot_attribution.clean_slug : kw.top_slot_attribution.title)"
                                              class="text-slate-700 dark:text-slate-200 hover:text-sky-600 dark:hover:text-sky-400 hover:underline truncate text-left"
                                              :title="'Jump to Article: ' + kw.top_slot_attribution.title"
                                              x-text="kw.top_slot_attribution.title"></button>
                                    </div>
                                    <div class="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold"
                                         x-text="formatNumber(kw.top_slot_attribution.saves) + ' saves (' + (kw.top_slot_share_pct ?? Math.round((kw.top_slot_attribution.saves / Math.max(1, kw.total_saves)) * 100)) + '%)'"></div>
                                  </div>
                                </template>
                              </div>
                            </div>

                            <!-- Expanded Keyword Slots Sub-Table -->
                            <template x-if="dossierExpandedKeywords[kw.keyword_id]">
                            <div class="bg-slate-50/70 dark:bg-[#09090B]/60 border-t border-slate-200 dark:border-[#27272A] px-4 py-3">
                              <div class="overflow-x-auto rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215]">
                                <table class="w-full text-left text-xs border-collapse font-mono tabular-nums">
                                  <thead class="bg-slate-100/70 dark:bg-slate-900/70 text-[10px] uppercase text-slate-500 border-b border-slate-200 dark:border-[#27272A]">
                                    <tr>
                                      <th class="py-2 px-3">Slot</th>
                                      <th class="py-2 px-3">Pin &amp; Article</th>
                                      <th class="py-2 px-3">Creator</th>
                                      <th class="py-2 px-3 text-right">Daily Velocity</th>
                                      <th class="py-2 px-3 text-right">Saves &amp; Repins</th>
                                      <th class="py-2 px-3 text-right">Pin Age</th>
                                      <th class="py-2 px-3 text-right">Inspect</th>
                                    </tr>
                                  </thead>
                                  <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60">
                                    <template x-for="slot in (kw.slots || [])" :key="kw.keyword_id + ':' + slot.pin_id">
                                      <tr class="hover:bg-slate-50/80 dark:hover:bg-[#18181B]/60 transition">
                                        <td class="py-2 px-3 font-bold">
                                          <span :class="slot.rank_position != null ? 'text-sky-600 dark:text-sky-400' : 'text-amber-600 dark:text-amber-400'"
                                                x-text="slot.rank_position != null ? ('#' + slot.rank_position) : (slot.last_known_rank != null ? ('V#' + slot.last_known_rank) : 'Vault')"></span>
                                        </td>
                                        <td class="py-2 px-3 min-w-[220px]">
                                          <div class="font-sans font-semibold text-slate-900 dark:text-white truncate max-w-sm" x-text="slot.title"></div>
                                          <template x-if="slot.clean_slug && slot.clean_slug !== '/'">
                                            <button type="button" @click="filterToArticle(slot.clean_slug)"
                                                    class="text-[10px] text-sky-600 dark:text-sky-400 hover:underline truncate max-w-xs block"
                                                    x-text="slot.clean_slug"></button>
                                          </template>
                                          <template x-if="!slot.clean_slug || slot.clean_slug === '/'">
                                            <span class="text-[10px] text-slate-400 block">Root (/)</span>
                                          </template>
                                        </td>
                                        <td class="py-2 px-3 text-[11px] text-purple-600 dark:text-purple-400" x-text="slot.creator_username ? '@' + slot.creator_username : '—'"></td>
                                        <td class="py-2 px-3 text-right">
                                          <span class="font-bold" :class="Number(slot.velocity || 0) > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400'" x-text="formatVelocity(slot.velocity)"></span>
                                          <span class="text-[10px] text-slate-400 ml-1" x-text="'(7d ' + formatSignedDelta(slot.gains_7d || 0) + ')'"></span>
                                        </td>
                                        <td class="py-2 px-3 text-right">
                                          <span class="font-bold text-emerald-600 dark:text-emerald-400" x-text="formatNumber(slot.saves)"></span>
                                          <span class="text-[10px] text-slate-400 ml-1" x-text="'/ ' + formatNumber(slot.repins || 0) + 'r'"></span>
                                        </td>
                                        <td class="py-2 px-3 text-right">
                                          <template x-if="getPinAgeBadgeFromDays(slot.pin_age_days, slot.created_at_pinterest)">
                                            <span class="px-1.5 py-0.5 rounded text-[10px] font-bold inline-block"
                                                  :class="getPinAgeBadgeFromDays(slot.pin_age_days, slot.created_at_pinterest).class"
                                                  :title="getPinAgeBadgeFromDays(slot.pin_age_days, slot.created_at_pinterest).title"
                                                  x-text="getPinAgeBadgeFromDays(slot.pin_age_days, slot.created_at_pinterest).label"></span>
                                          </template>
                                          <template x-if="!getPinAgeBadgeFromDays(slot.pin_age_days, slot.created_at_pinterest)"><span class="text-slate-400">—</span></template>
                                        </td>
                                        <td class="py-2 px-3 text-right">
                                          <a :href="getPinInspectUrl(slot.pin_id)"
                                             target="_blank" rel="noopener noreferrer"
                                             class="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-slate-700 dark:text-slate-200 text-[10.5px] font-semibold">
                                            Inspect ↗
                                          </a>
                                        </td>
                                      </tr>
                                    </template>
                                  </tbody>
                                </table>
                              </div>
                            </div>
                            </template>
                          </div>
                        </div>
                      </template>
                    </div>
                  </div>
                </div>

                <template x-if="filteredDossierKeywords().length === 0">
                  <div class="py-12 text-center text-slate-400 font-mono tabular-nums text-xs bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl">
                    <span>No keywords matched your search or filters.</span>
                    <button type="button" @click="clearDossierFilters()" class="ml-2 text-sky-600 dark:text-sky-400 hover:underline font-bold">Reset filters</button>
                  </div>
                </template>
              </div>
            </div>

            <!-- TAB 2: CREATORS & SYBIL PBN INTELLIGENCE -->
            <div x-show="dossierTab === 'accounts'" class="space-y-3">
              <!-- Sybil / PBN Network Summary Strip -->
              <template x-if="dossierData?.sybil_pbn_metrics">
                <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl p-3.5 shadow-sm grid grid-cols-2 sm:grid-cols-5 gap-3 font-mono tabular-nums text-center">
                  <div class="p-2 rounded-xl bg-slate-50 dark:bg-[#18181B]">
                    <div class="text-[10px] text-slate-400 uppercase">Sybil Tier</div>
                    <div class="text-xs font-bold mt-0.5"
                         :class="dossierData.sybil_pbn_metrics.sybil_tier === 'COORDINATED_SYBIL_RING' ? 'text-rose-600 dark:text-rose-400' : (dossierData.sybil_pbn_metrics.sybil_tier === 'AMPLIFIED_CURATION' ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400')"
                         x-text="dossierData.sybil_pbn_metrics.sybil_tier"></div>
                  </div>
                  <div class="p-2 rounded-xl bg-slate-50 dark:bg-[#18181B]">
                    <div class="text-[10px] text-slate-400 uppercase">Sybil Risk Score</div>
                    <div class="text-sm font-bold text-slate-900 dark:text-white mt-0.5" x-text="(dossierData.sybil_pbn_metrics.sybil_risk_score ?? 0) + ' / 100'"></div>
                  </div>
                  <div class="p-2 rounded-xl bg-slate-50 dark:bg-[#18181B]">
                    <div class="text-[10px] text-slate-400 uppercase">Effective Creators</div>
                    <div class="text-sm font-bold text-purple-600 dark:text-purple-400 mt-0.5" x-text="dossierData.sybil_pbn_metrics.effective_creator_count ?? 1"></div>
                  </div>
                  <div class="p-2 rounded-xl bg-slate-50 dark:bg-[#18181B]">
                    <div class="text-[10px] text-slate-400 uppercase">Creator HHI</div>
                    <div class="text-sm font-bold text-slate-800 dark:text-slate-200 mt-0.5" x-text="dossierData.sybil_pbn_metrics.hhi_creator_concentration ?? '—'"></div>
                  </div>
                  <div class="p-2 rounded-xl bg-slate-50 dark:bg-[#18181B]">
                    <div class="text-[10px] text-slate-400 uppercase">Multi-Creator Overlap</div>
                    <div class="text-sm font-bold text-sky-600 dark:text-sky-400 mt-0.5" x-text="Math.round((dossierData.sybil_pbn_metrics.bipartite_slug_overlap ?? 0) * 100) + '%'"></div>
                  </div>
                </div>
              </template>

              <template x-for="acc in filteredDossierAccounts()" :key="acc.username">
                <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl p-4 flex flex-col gap-3 shadow-sm">
                  <div class="flex items-center justify-between gap-3 flex-wrap">
                    <div class="flex items-center gap-3.5 min-w-0">
                      <div class="w-10 h-10 rounded-2xl flex items-center justify-center font-bold font-mono tabular-nums text-sm shrink-0"
                           :class="acc.role === 'PRIMARY_BRAND' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30' : 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30'">
                        <span x-show="acc.role === 'PRIMARY_BRAND'" class="inline-flex"><i data-lucide="crown" class="w-4 h-4"></i></span><span x-show="acc.role !== 'PRIMARY_BRAND'">@</span>
                      </div>
                      <div class="flex flex-col min-w-0">
                        <div class="flex items-center gap-2 flex-wrap">
                          <a :href="safeUrl('https://pinterest.com/' + acc.username)"
                             target="_blank"
                             rel="noopener noreferrer"
                             class="text-sm font-bold text-slate-900 dark:text-white hover:text-sky-600 transition truncate"
                             x-text="'@' + acc.username"></a>
                          <span class="inline-flex items-center gap-1 text-[10px] font-mono tabular-nums px-2 py-0.5 rounded-full font-bold"
                                :class="acc.role === 'PRIMARY_BRAND' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30' : 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30'">
                            <span x-show="acc.role === 'PRIMARY_BRAND'" class="inline-flex"><i data-lucide="crown" class="w-3 h-3"></i></span>
                            <span x-show="acc.role !== 'PRIMARY_BRAND'" class="inline-flex"><i data-lucide="radar" class="w-3 h-3"></i></span>
                            <span x-text="acc.role === 'PRIMARY_BRAND' ? 'Primary Brand Account' : 'Satellite / Ghost Creator'"></span>
                          </span>
                        </div>
                        <div class="flex items-center gap-2 text-xs text-slate-400 font-mono tabular-nums mt-1 flex-wrap">
                          <span x-text="acc.pins_count + ' pins linked'"></span>
                          <span aria-hidden="true">•</span>
                          <span class="text-sky-600 dark:text-sky-400 font-bold" x-text="acc.top10_count + ' top-10 slots'"></span>
                          <span aria-hidden="true">•</span>
                          <span class="font-bold" :class="Number(acc.daily_velocity || 0) > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400'" x-text="formatVelocity(acc.daily_velocity)"></span>
                          <span aria-hidden="true">•</span>
                          <span x-text="'7d: ' + formatSignedDelta(acc.gains_7d || 0)"></span>
                        </div>
                      </div>
                    </div>

                    <div class="flex items-center gap-3 shrink-0">
                      <div class="text-right font-mono tabular-nums text-xs">
                        <div class="font-bold text-emerald-600 dark:text-emerald-400 text-sm" x-text="formatNumber(acc.total_saves)"></div>
                        <div class="text-[10px] text-slate-400">total saves</div>
                      </div>
                      <a :href="safeUrl('/accounts?action=track&creator=' + encodeURIComponent(acc.username))"
                         target="_blank"
                         rel="noopener noreferrer"
                         class="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-sm transition font-mono tabular-nums">
                        + Track
                      </a>
                    </div>
                  </div>

                  <template x-if="Array.isArray(acc.sister_domains) && acc.sister_domains.length > 0">
                    <div class="pt-2 border-t border-slate-100 dark:border-[#27272A] flex items-center gap-1.5 flex-wrap text-xs font-mono tabular-nums">
                      <span class="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-bold"><i data-lucide="alert-triangle" class="w-3.5 h-3.5 shrink-0"></i><span>Sybil Sister Domains Fingerprint:</span></span>
                      <template x-for="sd in acc.sister_domains" :key="sd.domain">
                        <span class="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/20"
                              x-text="sd.domain + ' (' + sd.pins_count + ' pins)'"></span>
                      </template>
                    </div>
                  </template>
                </div>
              </template>
              <template x-if="filteredDossierAccounts().length === 0">
                <div class="py-12 text-center text-slate-400 font-mono tabular-nums text-xs">No associated creators matched your search or filters.</div>
              </template>
            </div>

            <!-- TAB 3: VISUAL DNA & COMPUTER VISION REVERSE-ENGINEERING -->
            <div x-show="dossierTab === 'visual_dna'" class="space-y-4 font-sans">
              <div class="bg-white dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A]/80 rounded-2xl p-4 shadow-sm flex flex-col gap-3">
                <div class="flex items-center gap-2">
                  <i data-lucide="dna" class="w-5 h-5 text-sky-500 shrink-0"></i>
                  <div>
                    <h3 class="text-sm font-bold text-slate-900 dark:text-white">Reverse-Engineered Visual DNA</h3>
                    <p class="text-[11px] text-slate-400">Pinterest Computer Vision annotations cloud, dominant color palette, aspect ratios &amp; winning design signals</p>
                  </div>
                </div>

                <!-- Visual Tags Cloud -->
                <div class="pt-2 border-t border-slate-100 dark:border-[#27272A]/60">
                  <div class="flex items-center justify-between mb-2">
                    <span class="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      <i data-lucide="tag" class="w-3.5 h-3.5 shrink-0"></i><span>Top Computer Vision Object Annotations (AI Eye)</span>
                    </span>
                    <span class="text-[10px] text-slate-400 font-mono tabular-nums">Elements Pinterest AI identifies in images</span>
                  </div>
                  <div class="flex items-center gap-2 flex-wrap">
                    <template x-for="t in (dossierData?.visual_dna?.visual_tags_cloud || [])" :key="typeof t.tag === 'object' && t.tag !== null ? (t.tag.name || t.tag.tag || '') : t.tag">
                      <span class="px-2.5 py-1 rounded-lg text-xs font-mono tabular-nums font-medium bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/20 flex items-center gap-1.5 shadow-sm">
                        <span x-text="typeof t.tag === 'object' && t.tag !== null ? (t.tag.name || t.tag.tag || '') : t.tag"></span>
                        <span class="px-1.5 py-0.2 rounded-full bg-sky-500/20 text-[9px] font-bold" x-text="t.count + 'x'"></span>
                      </span>
                    </template>
                    <template x-if="!dossierData?.visual_dna?.visual_tags_cloud?.length">
                      <span class="text-xs text-slate-400 italic">No visual annotations indexed yet for this domain.</span>
                    </template>
                  </div>
                </div>

                <!-- Dominant Color Palette -->
                <div class="pt-3 border-t border-slate-100 dark:border-[#27272A]/60">
                  <div class="flex items-center justify-between mb-2">
                    <span class="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      <i data-lucide="palette" class="w-3.5 h-3.5 shrink-0"></i><span>Dominant Color Palette Distribution</span>
                    </span>
                    <span class="text-[10px] text-slate-400 font-mono tabular-nums">HEX color breakdown across creative pins</span>
                  </div>
                  <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono tabular-nums text-xs">
                    <template x-for="col in (dossierData?.visual_dna?.dominant_colors_palette || [])" :key="col.color">
                      <div class="p-2.5 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#121215]/60 flex items-center gap-3">
                        <span class="w-7 h-7 rounded-lg border border-slate-300 dark:border-slate-600 shrink-0 shadow-sm" :style="'background-color: ' + safeColor(col.color, '#888888')"></span>
                        <div class="flex flex-col min-w-0">
                          <span class="font-bold text-slate-800 dark:text-slate-200 uppercase truncate" x-text="col.color"></span>
                          <span class="text-[10px] text-slate-400" x-text="col.count + ' pins (' + col.percentage + '%)'"></span>
                        </div>
                      </div>
                    </template>
                  </div>
                </div>

                <!-- Aspect Ratios Distribution -->
                <template x-if="dossierData?.visual_dna?.aspect_ratios && Object.keys(dossierData.visual_dna.aspect_ratios).length > 0">
                  <div class="pt-3 border-t border-slate-100 dark:border-[#27272A]/60">
                    <div class="flex items-center justify-between mb-2">
                      <span class="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider font-mono tabular-nums text-slate-700 dark:text-slate-300">
                        <i data-lucide="ratio" class="w-3.5 h-3.5 shrink-0"></i><span>Creative Aspect Ratios</span>
                      </span>
                      <span class="text-[10px] text-slate-400 font-mono tabular-nums">Canvas proportions used across ranked pins</span>
                    </div>
                    <div class="flex items-center gap-2 flex-wrap font-mono tabular-nums text-xs">
                      <template x-for="[ar, cnt] in Object.entries(dossierData.visual_dna.aspect_ratios)" :key="ar">
                        <span class="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#121215]/60 text-slate-700 dark:text-slate-200 font-semibold">
                          <span x-text="ar"></span>
                          <span class="text-slate-400 ml-1" x-text="'(' + cnt + ' pins)'"></span>
                        </span>
                      </template>
                    </div>
                  </div>
                </template>

                <!-- High-Converting Title Keywords -->
                <div class="pt-3 border-t border-slate-100 dark:border-[#27272A]/60">
                  <div class="flex items-center justify-between mb-2">
                    <span class="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      <i data-lucide="pen-line" class="w-3.5 h-3.5 shrink-0"></i><span>Winning SEO Title Semantic Keywords</span>
                    </span>
                    <span class="text-[10px] text-slate-400 font-mono tabular-nums">Most frequent high-CTR title tokens</span>
                  </div>
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <template x-for="w in (dossierData?.visual_dna?.top_title_keywords || [])" :key="w.word">
                      <span class="px-2 py-0.5 rounded-md text-[11px] font-mono tabular-nums font-bold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
                        <span x-text="w.word"></span>
                        <span class="text-[9px] text-amber-500 font-normal" x-text="'(' + w.count + ')'"></span>
                      </span>
                    </template>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </template>
      </div>

    </div>
    <!-- END DEDICATED FULL-PAGE DOMAIN INTELLIGENCE STUDIO VIEW -->
`;
  return rawHtml
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^[ \t]+/gm, '')
    .replace(/\n{2,}/g, '\n');
}
