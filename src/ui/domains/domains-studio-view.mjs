/**
 * Dedicated Full-Page Domain Intelligence Studio View
 */
export function getDomainsStudioViewHtml({ hasInitialDomain = false } = {}) {
  return `    <!-- DEDICATED FULL-PAGE DOMAIN INTELLIGENCE STUDIO VIEW -->
    <div x-show="isDossierOpen" x-cloak class="flex flex-col gap-6 w-full" ${hasInitialDomain ? 'style="display:flex;"' : ''}>

      <!-- Breadcrumbs & Studio Action Bar -->
      <div class="flex items-center justify-between flex-wrap gap-4 pb-2 border-b border-slate-200 dark:border-[#27272A]">
        <div class="flex items-center gap-3 text-xs font-mono tabular-nums">
          <button @click="closeDossier()"
                  class="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-slate-700 dark:text-slate-300 font-bold flex items-center gap-1.5 transition shadow-sm"
                  title="Return to Domain Radar Leaderboard (Esc)">
            <span>← Back to Leaderboard</span>
          </button>
          <span class="text-slate-300 dark:text-slate-700">|</span>
          <nav class="flex items-center gap-1.5 text-slate-500">
            <a :href="getBaseStudioPath()" href="/domains" @click.prevent="closeDossier()" class="hover:text-sky-600 dark:hover:text-sky-400 flex items-center gap-1 transition">
              <span>🌐 Domain Radar</span>
            </a>
            <span class="text-slate-300 dark:text-slate-700">/</span>
            <span class="font-bold text-slate-900 dark:text-white" x-text="dossierDomain"></span>
          </nav>
        </div>

        <div class="flex items-center gap-2">
          <button @click="openBlueprintModal(dossierDomain)"
                  class="px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-600 hover:to-rose-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-rose-500/20 active:scale-95"
                  title="Generate instant 6-pillar Arbitrage Attack Blueprint">
            <span>⚡</span>
            <span>Attack Plan</span>
          </button>
          <button @click="recheckAgeForDossier()"
                  :disabled="enrichingDomains[dossierDomain]"
                  class="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] hover:bg-slate-50 dark:hover:bg-[#27272A] text-xs font-semibold text-slate-700 dark:text-slate-300 transition flex items-center gap-1 shadow-sm disabled:opacity-60">
            <span :class="{ 'animate-spin': enrichingDomains[dossierDomain] }">🔄</span>
            <span x-text="enrichingDomains[dossierDomain] ? 'Checking...' : 'Re-check Age'">Re-check Age</span>
          </button>
          <button @click="recheckAdsForDossier()"
                  :disabled="enrichingAds[dossierDomain]"
                  class="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] hover:bg-slate-50 dark:hover:bg-[#27272A] text-xs font-semibold text-slate-700 dark:text-slate-300 transition flex items-center gap-1 shadow-sm disabled:opacity-60">
            <span :class="{ 'animate-spin': enrichingAds[dossierDomain] }">🔄</span>
            <span x-text="enrichingAds[dossierDomain] ? 'Scanning...' : 'Re-scan ads.txt'">Re-scan ads.txt</span>
          </button>
          <button @click="closeDossier()"
                  class="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-slate-600 dark:text-slate-300 text-xs font-bold transition flex items-center gap-1"
                  title="Close Studio (Esc)">
            <span>Esc</span>
            <span>✕</span>
          </button>
        </div>
      </div>

      <!-- Stitch Minimalist Domain Header Strip -->
      <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl p-5 shadow-sm flex flex-col gap-4">
        <!-- Top Row: Identity & External Shortcuts -->
        <div class="flex items-center justify-between flex-wrap gap-4">
          <div class="flex items-center gap-3.5">
            <template x-if="dossierDomain && dossierDomain.toLowerCase() === 'uploaded by user'">
              <span class="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center text-lg shadow-sm font-bold">✨</span>
            </template>
            <template x-if="!dossierDomain || dossierDomain.toLowerCase() !== 'uploaded by user'">
              <img :src="'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(dossierDomain) + '&sz=32'"
                   class="w-8 h-8 rounded-xl shadow-sm bg-slate-200 dark:bg-[#18181B] shrink-0"
                   loading="lazy"
                   onerror="this.onerror=null; this.style.display='none'">
            </template>
            <div class="flex items-center gap-3 flex-wrap">
              <h2 class="text-xl font-bold text-slate-900 dark:text-white font-mono tabular-nums tracking-tight" x-text="dossierDomain"></h2>
              <template x-if="dossierDomain && dossierDomain.toLowerCase() === 'uploaded by user'">
                <span class="text-xs font-mono tabular-nums text-amber-600 dark:text-amber-400 font-bold">🎯 100% Organic Direct Uploads • Unlinked Pinterest Traffic • Vacuum Opportunity</span>
              </template>
              <template x-if="!dossierDomain || dossierDomain.toLowerCase() !== 'uploaded by user'">
                <div class="flex items-center gap-2 text-xs font-mono tabular-nums text-slate-400">
                  <a :href="safeUrl('https://' + dossierDomain)" target="_blank" rel="noopener noreferrer" class="text-sky-600 dark:text-sky-400 hover:underline font-medium">Visit ↗</a>
                  <span>•</span>
                  <a :href="safeUrl('https://www.similarweb.com/website/' + dossierDomain)" target="_blank" rel="noopener noreferrer" class="hover:text-slate-600 dark:hover:text-slate-200 hover:underline">Similarweb ↗</a>
                  <span>•</span>
                  <a :href="safeUrl('https://web.archive.org/web/*/' + dossierDomain)" target="_blank" rel="noopener noreferrer" class="hover:text-slate-600 dark:hover:text-slate-200 hover:underline">Wayback ↗</a>
                  <span>•</span>
                  <a :href="safeUrl('https://www.google.com/search?q=site%3A' + encodeURIComponent(dossierDomain))" target="_blank" rel="noopener noreferrer" class="hover:text-slate-600 dark:hover:text-slate-200 hover:underline">Google Site ↗</a>
                </div>
              </template>
            </div>
          </div>

          <!-- Quick Action Buttons -->
          <div class="flex items-center gap-2">
            <button @click="openBlueprintModal(dossierDomain)"
                    class="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white text-white dark:text-slate-900 text-xs font-bold transition flex items-center gap-1.5 shadow-sm active:scale-95"
                    title="Generate instant 6-pillar Arbitrage Attack Blueprint">
              <span>⚡ Attack Plan</span>
            </button>
            <template x-if="!dossierDomain || dossierDomain.toLowerCase() !== 'uploaded by user'">
              <div class="flex items-center gap-2">
                <button @click="recheckAgeForDossier()"
                        :disabled="enrichingDomains[dossierDomain]"
                        class="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#18181B]/80 hover:bg-slate-100 dark:hover:bg-[#27272A] text-xs font-semibold text-slate-700 dark:text-slate-300 transition flex items-center gap-1 shadow-sm disabled:opacity-60">
                  <span :class="{ 'animate-spin': enrichingDomains[dossierDomain] }">🔄</span>
                  <span x-text="enrichingDomains[dossierDomain] ? 'Checking...' : 'Re-check Age'">Re-check Age</span>
                </button>
                <button @click="recheckAdsForDossier()"
                        :disabled="enrichingAds[dossierDomain]"
                        class="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#18181B]/80 hover:bg-slate-100 dark:hover:bg-[#27272A] text-xs font-semibold text-slate-700 dark:text-slate-300 transition flex items-center gap-1 shadow-sm disabled:opacity-60">
                  <span :class="{ 'animate-spin': enrichingAds[dossierDomain] }">🔄</span>
                  <span x-text="enrichingAds[dossierDomain] ? 'Scanning...' : 'Re-scan ads.txt'">Re-scan ads.txt</span>
                </button>
              </div>
            </template>
          </div>
        </div>

        <!-- Sleek Horizontal Bento Metadata Chips -->
        <template x-if="dossierData?.summary?.is_organic_vault">
          <div class="flex items-center gap-2 flex-wrap font-mono tabular-nums text-xs pt-3 border-t border-slate-100 dark:border-[#27272A]/80">
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 font-bold shadow-sm">
              <span>🎯</span>
              <span>100% Unmonetized Arbitrage Vacuum</span>
            </span>
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 font-bold shadow-sm">
              <span>⚡</span>
              <span>0 Outbound Links • Top SERP Search Rankings</span>
            </span>
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-500/20 font-bold shadow-sm">
              <span>👤</span>
              <span x-text="(dossierData?.summary?.accounts_count || 0) + ' Organic Creator Accounts'"></span>
            </span>
          </div>
        </template>
        <template x-if="!dossierData?.summary?.is_organic_vault">
        <div class="flex items-center gap-2 flex-wrap font-mono tabular-nums text-xs pt-3 border-t border-slate-100 dark:border-[#27272A]/80">
          <!-- Age Badge -->
          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold shadow-sm"
                :class="dossierData?.age_info?.age_years != null ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20' : (dossierData?.age_info?.lookup_status === 'failed' ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20' : 'bg-slate-100 dark:bg-[#18181B] text-slate-500 border-slate-200 dark:border-[#27272A]')"
                :title="dossierData?.age_info?.registered_at ? 'Registered: ' + dossierData.age_info.registered_at.slice(0, 10) : 'Age'">
            <span>🌱</span>
            <span x-text="dossierData?.age_info?.age_days != null ? formatDomainAge(dossierData.age_info.age_days) : (dossierData?.age_info?.lookup_status === 'failed' ? 'Registry Withheld / Privacy Shielded' : 'Unverified Age')"></span>
          </span>

          <!-- Registration Date -->
          <template x-if="dossierData?.age_info?.registered_at">
            <span class="px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-[#18181B]/60 border border-slate-200 dark:border-[#27272A]/80 text-slate-600 dark:text-slate-300">
              <span class="text-slate-400">Reg: </span>
              <span class="font-bold text-slate-800 dark:text-slate-200" x-text="dossierData.age_info.registered_at.slice(0, 10)"></span>
            </span>
          </template>

          <!-- Expiry Date -->
          <template x-if="dossierData?.age_info?.expires_at">
            <span class="px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-[#18181B]/60 border border-slate-200 dark:border-[#27272A]/80 text-slate-600 dark:text-slate-300">
              <span class="text-slate-400">Expires: </span>
              <span class="font-bold text-slate-800 dark:text-slate-200" x-text="dossierData.age_info.expires_at.slice(0, 10)"></span>
            </span>
          </template>

          <!-- Active Ad Network Badge -->
          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold shadow-sm"
                title="Ad Network & Monetization Profile"
                :class="getAdNetworkBadgeClasses(dossierData?.ad_info?.current_ad_network)">
            <span x-text="getAdNetworkBadgeText(dossierData?.ad_info?.current_ad_network)"></span>
          </span>

          <!-- Ad Manager Domain -->
          <template x-if="dossierData?.ad_info?.ad_manager_domain">
            <span class="px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-[#18181B]/60 border border-slate-200 dark:border-[#27272A]/80 text-slate-600 dark:text-slate-300">
              <span class="text-slate-400">Manager: </span>
              <span class="font-bold text-sky-600 dark:text-sky-400" x-text="dossierData.ad_info.ad_manager_domain"></span>
            </span>
          </template>

          <!-- Publisher ID -->
          <template x-if="dossierData?.ad_info?.primary_pub_id">
            <span class="px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-[#18181B]/60 border border-slate-200 dark:border-[#27272A]/80 text-slate-600 dark:text-slate-300">
              <span class="text-slate-400">Pub ID: </span>
              <span class="font-bold text-slate-800 dark:text-slate-200" x-text="dossierData.ad_info.primary_pub_id"></span>
            </span>
          </template>

          <!-- ads.txt Status -->
          <span class="px-2.5 py-1 rounded-lg border text-xs font-semibold flex items-center gap-1"
                :class="dossierData?.ad_info?.ads_txt_status === 'valid' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20' : 'bg-slate-50 dark:bg-[#18181B]/60 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-[#27272A]'">
            <span :class="dossierData?.ad_info?.ads_txt_status === 'valid' ? 'text-emerald-500' : 'text-slate-400'">●</span>
            <span x-text="'ads.txt: ' + (dossierData?.ad_info?.ads_txt_status || 'Pending')"></span>
          </span>

          <!-- Migration Pill -->
          <template x-if="dossierData?.ad_info?.previous_ad_network">
            <span class="px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 font-bold flex items-center gap-1 shadow-sm"
                  :title="'Historical Switch Tracking: Migrated from ' + dossierData.ad_info.previous_ad_network + ' to ' + (dossierData.ad_info.current_ad_network || '')">
              <span>↗️</span>
              <span x-text="'Ex-' + capitalize(dossierData.ad_info.previous_ad_network)"></span>
              <span class="text-[10px] text-slate-400" x-text="dossierData?.ad_info?.switched_at ? '(' + dossierData.ad_info.switched_at.slice(0, 10) + ')' : ''"></span>
            </span>
          </template>
        </div>
        </template>
      </div>

      <!-- Dossier High-Level 6 KPI Summary Cards -->
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5 font-mono tabular-nums text-center">
        <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] p-4 rounded-2xl shadow-sm flex flex-col gap-1">
          <div class="text-[10px] text-slate-400 uppercase tracking-wider">Ranked Pins</div>
          <div class="text-2xl font-bold text-slate-900 dark:text-white" x-text="formatNumber(filteredDossierPins().length || dossierData?.summary?.total_pins || 0)"></div>
          <div class="text-[11px] text-slate-400" x-text="(dossierData?.summary?.displaced_total_count > 0) ? (formatNumber(dossierData?.summary?.active_pins_count || dossierData?.summary?.total_pins || 0) + ' Active • ' + formatNumber(dossierData.summary.displaced_total_count) + ' Vault') : ((dossierData?.summary?.visual_pins_count != null && dossierData?.summary?.visual_pins_count < dossierData?.summary?.total_pins) ? (formatNumber(dossierData.summary.visual_pins_count) + ' visual cards loaded') : 'Total SERP pins')"></div>
        </div>
        <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] p-4 rounded-2xl shadow-sm flex flex-col gap-1">
          <div class="text-[10px] text-slate-400 uppercase tracking-wider" x-text="dossierData?.summary?.is_organic_vault ? 'Upload Boards' : 'Money Articles'"></div>
          <div class="text-2xl font-bold text-slate-900 dark:text-white" x-text="dossierData?.summary?.is_organic_vault ? filteredDossierArticles().length : formatNumber(filteredDossierArticles().length || dossierData?.summary?.unique_urls || 0)"></div>
          <div class="text-[11px] text-slate-400" x-text="dossierData?.summary?.is_organic_vault ? 'Niche board groups' : ((dossierData?.summary?.vault_unique_urls_count > 0) ? (formatNumber(dossierData?.summary?.active_unique_urls_count || dossierData?.summary?.unique_urls || 0) + ' Active • ' + formatNumber(dossierData.summary.vault_unique_urls_count) + ' Vault') : 'Unique URLs')"></div>
        </div>
        <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] p-4 rounded-2xl shadow-sm flex flex-col gap-1">
          <div class="text-[10px] text-slate-400 uppercase tracking-wider">Multiplier</div>
          <div class="text-2xl font-bold text-amber-600 dark:text-amber-400" x-text="(dossierData?.summary?.pins_per_url || 1) + 'x'"></div>
          <div class="text-[11px] text-slate-400">Pins per article</div>
        </div>
        <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] p-4 rounded-2xl shadow-sm flex flex-col gap-1">
          <div class="text-[10px] text-slate-400 uppercase tracking-wider">Keywords</div>
          <div class="text-2xl font-bold text-sky-600 dark:text-sky-400" x-text="dossierData?.summary?.ranked_keywords_count || 0"></div>
          <div class="text-[11px] text-slate-400">Targeted keywords</div>
        </div>
        <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] p-4 rounded-2xl shadow-sm flex flex-col gap-1">
          <div class="text-[10px] text-slate-400 uppercase tracking-wider">Total Saves</div>
          <div class="text-2xl font-bold text-emerald-600 dark:text-emerald-400" x-text="formatNumber(dossierData?.summary?.total_saves || 0)"></div>
          <div class="text-[11px] text-slate-400">Aggregate saves</div>
        </div>
        <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] p-4 rounded-2xl shadow-sm flex flex-col gap-1">
          <div class="text-[10px] text-slate-400 uppercase tracking-wider">Creators</div>
          <div class="text-2xl font-bold text-purple-600 dark:text-purple-400" x-text="dossierData?.summary?.accounts_count || 0"></div>
          <div class="text-[11px] text-slate-400">Associated accounts</div>
        </div>
      </div>

      <!-- Unified Studio Smart View Switcher & Action Toolbar -->
      <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl p-3.5 shadow-sm flex items-center justify-between flex-wrap gap-3">
        <!-- 3-Way Main Toggle + 2 Secondary Tabs -->
        <div class="flex items-center gap-1.5 flex-wrap">
          <!-- Button 1: Articles / URLs -->
          <button @click="dossierTab = 'urls'"
                  class="px-3 py-1.5 rounded-xl text-xs font-semibold font-mono tabular-nums transition flex items-center gap-1.5"
                  :class="dossierTab === 'urls' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#27272A]'">
            <span x-text="dossierData?.summary?.is_organic_vault ? '📁 Direct Upload Boards' : '🔗 Money Articles'"></span>
            <span class="px-1.5 py-0.2 rounded-full text-[10px] font-bold"
                  :class="dossierTab === 'urls' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'"
                  x-text="filteredDossierArticles().length"></span>
          </button>

          <!-- Button 2: Ranked Pins -->
          <button @click="dossierTab = 'pins'"
                  class="px-3 py-1.5 rounded-xl text-xs font-semibold font-mono tabular-nums transition flex items-center gap-1.5"
                  :class="dossierTab === 'pins' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#27272A]'">
            <span>🎯 Ranked Pins</span>
            <span class="px-1.5 py-0.2 rounded-full text-[10px] font-bold"
                  :class="dossierTab === 'pins' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'"
                  x-text="filteredDossierPins().length || dossierData?.summary?.total_pins || 0"></span>
          </button>

          <!-- Button 3: Keyword Monopoly -->
          <button @click="dossierTab = 'keywords'"
                  class="px-3 py-1.5 rounded-xl text-xs font-semibold font-mono tabular-nums transition flex items-center gap-1.5"
                  :class="dossierTab === 'keywords' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#27272A]'">
            <span>🕸️ Keyword Monopoly</span>
            <span class="px-1.5 py-0.2 rounded-full text-[10px] font-bold"
                  :class="dossierTab === 'keywords' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'"
                  x-text="filteredDossierKeywords().length"></span>
          </button>

          <span class="text-slate-300 dark:text-slate-700 hidden sm:inline">|</span>

          <!-- Button 4: Associated Accounts -->
          <button @click="dossierTab = 'accounts'"
                  class="px-3 py-1.5 rounded-xl text-xs font-semibold font-mono tabular-nums transition flex items-center gap-1.5"
                  :class="dossierTab === 'accounts' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#27272A]'">
            <span>👤 Creators</span>
            <span class="px-1.5 py-0.2 rounded-full text-[10px] font-bold"
                  :class="dossierTab === 'accounts' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'"
                  x-text="dossierData?.accounts?.length || 0"></span>
          </button>

          <!-- Button 5: Visual DNA -->
          <button @click="dossierTab = 'visual_dna'"
                  class="px-3 py-1.5 rounded-xl text-xs font-semibold font-mono tabular-nums transition flex items-center gap-1.5"
                  :class="dossierTab === 'visual_dna' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#27272A]'">
            <span>🧬 Visual DNA</span>
          </button>
        </div>

        <!-- Filter, Sort & 1-Click Copy Actions -->
        <div class="flex items-center gap-2 flex-wrap min-w-0">
          <!-- Instant Search -->
          <div class="relative min-w-[180px] max-w-xs">
            <input type="text"
                   x-model="dossierSearch"
                   placeholder="Search in studio..."
                   class="w-full text-xs font-mono tabular-nums rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#18181B] px-3 py-1.5 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500">
            <template x-if="dossierSearch">
              <button @click="dossierSearch = ''" class="absolute right-2 top-1.5 text-slate-400 hover:text-slate-600 text-xs">✕</button>
            </template>
          </div>

          <!-- Status Filter: All / Active SERP / Displaced / Catalog Only -->
          <div class="inline-flex rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#18181B] p-0.5 text-xs font-mono tabular-nums">
            <button @click="dossierStatusFilter = 'all'; dossierPinsPage = 1; dossierArticlesPage = 1"
                    class="px-2.5 py-1 rounded-md transition font-medium"
                    :class="dossierStatusFilter === 'all' ? 'bg-white dark:bg-slate-700 text-sky-600 dark:text-sky-400 shadow-sm font-bold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'">
              All
            </button>
            <button @click="dossierStatusFilter = 'active'; dossierPinsPage = 1; dossierArticlesPage = 1"
                    class="px-2.5 py-1 rounded-md transition font-medium"
                    :class="dossierStatusFilter === 'active' ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm font-bold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'">
              Active SERP
            </button>
            <button @click="dossierStatusFilter = 'displaced'; dossierPinsPage = 1; dossierArticlesPage = 1"
                    class="px-2.5 py-1 rounded-md transition font-medium"
                    :class="dossierStatusFilter === 'displaced' ? 'bg-white dark:bg-slate-700 text-amber-600 dark:text-amber-400 shadow-sm font-bold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'">
              Displaced
            </button>
            <template x-if="(dossierData?.summary?.catalog_only_pins_count || 0) > 0">
              <button @click="dossierTab = 'pins'; dossierStatusFilter = 'catalog'; dossierPinsPage = 1"
                      class="px-2.5 py-1 rounded-md transition font-medium"
                      :class="dossierStatusFilter === 'catalog' ? 'bg-white dark:bg-slate-700 text-purple-600 dark:text-purple-400 shadow-sm font-bold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'"
                      title="Unranked profile catalog pins that have not yet entered SERP or Displaced Vault">
                <span x-text="'Catalog Only (' + formatNumber(dossierData?.summary?.catalog_only_pins_count || 0) + ')'"></span>
              </button>
            </template>
          </div>

          <!-- Contextual Sort Dropdown -->
          <select x-model="dossierSort"
                  class="text-xs font-mono tabular-nums rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#18181B] px-2.5 py-1.5 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-sky-500">
            <option value="saves">Sort: Highest Saves</option>
            <option value="age_asc">Sort: Newest Pin (Fresh)</option>
            <option value="age_desc">Sort: Oldest Pin (Evergreen)</option>
            <option value="multiplier">Sort: Highest Multiplier</option>
            <option value="rank">Sort: Best SERP Rank</option>
          </select>

          <!-- 1-Click Copy Buttons -->
          <button @click="copyAllArticleUrls()"
                  class="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#18181B] hover:bg-slate-100 dark:hover:bg-[#27272A] text-xs font-mono tabular-nums font-semibold text-slate-700 dark:text-slate-300 transition flex items-center gap-1 shadow-sm"
                  title="Copy all discovered article URLs to clipboard">
            <span>📋</span>
            <span>Copy URLs</span>
          </button>
          <button @click="copyAllKeywords()"
                  class="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#18181B] hover:bg-slate-100 dark:hover:bg-[#27272A] text-xs font-mono tabular-nums font-semibold text-slate-700 dark:text-slate-300 transition flex items-center gap-1 shadow-sm"
                  title="Copy all monopolized keywords to clipboard">
            <span>📋</span>
            <span>Copy Keywords</span>
          </button>
        </div>
      </div>

      <!-- Studio Content Body -->
      <div class="flex flex-col gap-4">
        <!-- Loading State -->
        <template x-if="dossierLoading">
          <div class="py-24 text-center text-slate-400 font-mono tabular-nums flex flex-col items-center justify-center gap-3">
            <span class="animate-spin text-3xl">🔄</span>
            <span class="text-sm">De-obfuscating domain intelligence & 4-pillar data...</span>
          </div>
        </template>

        <!-- Error & Cold Start State -->
        <template x-if="!dossierLoading && !dossierData">
          <div class="py-20 text-center flex flex-col items-center justify-center gap-4 bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl p-8 shadow-sm">
            <div class="w-12 h-12 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center text-2xl font-bold">⚠️</div>
            <div class="flex flex-col gap-1 max-w-md">
              <span class="text-base font-bold text-slate-900 dark:text-white">Dossier Cold-Start or Timed Out</span>
              <span class="text-xs text-slate-500 dark:text-slate-400">The serverless database or background compute may have experienced a cold start while compiling 4-pillar data for <span class="font-mono tabular-nums font-bold text-slate-700 dark:text-slate-300" x-text="dossierDomain"></span>.</span>
            </div>
            <button @click="openDossier(dossierDomain, false, true)"
                    class="px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-mono tabular-nums font-semibold shadow-sm transition flex items-center gap-2">
              <span>🔄</span>
              <span>Retry Loading Dossier</span>
            </button>
          </div>
        </template>

        <!-- Main Studio Tab Views -->
        <template x-if="!dossierLoading && dossierData">
          <div class="flex flex-col gap-4">
              <!-- TAB 1: Ranked Pins -->
              <div x-show="dossierTab === 'pins'" class="space-y-3">
                <template x-for="p in paginatedDossierPins()" :key="p.pin_id">
                  <div :data-pin-id="p.pin_id" class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl p-4 flex items-center justify-between gap-4 shadow-sm hover:border-sky-500/50 transition">
                    <div class="flex items-center gap-3.5 min-w-0">
                      <img :src="p.image_url"
                           referrerpolicy="no-referrer"
                           class="w-14 h-20 rounded-xl object-cover bg-slate-200 dark:bg-slate-700 shrink-0 shadow-sm"
                           loading="lazy"
                           onerror="window.handlePinImgError(this)">
                      <div class="flex flex-col min-w-0">
                        <div class="flex items-center gap-2 flex-wrap">
                          <span class="text-sm font-bold text-slate-900 dark:text-white truncate" x-text="p.title"></span>
                          <template x-if="p.is_vulnerable">
                            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold font-mono tabular-nums bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30 shrink-0"
                                  title="Decaying Monopoly: High Saves + Stale Velocity. Vulnerable to Fresh Pin Overhaul!">
                              ⚡ Decaying Monopoly
                            </span>
                          </template>
                          <!-- Pin Age Badge -->
                          <template x-if="getPinAgeBadge(p.created_at_pinterest)">
                            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold font-mono tabular-nums shrink-0"
                                  :class="getPinAgeBadge(p.created_at_pinterest).class"
                                  :title="getPinAgeBadge(p.created_at_pinterest).title"
                                  x-text="getPinAgeBadge(p.created_at_pinterest).label"></span>
                          </template>
                        </div>
                        <div class="flex items-center gap-2 text-xs text-slate-400 font-mono tabular-nums mt-1 flex-wrap">
                          <span x-text="'Pin #' + p.pin_id"></span>
                          <span class="text-slate-300 dark:text-slate-600">•</span>
                          <template x-if="p.creator_username">
                            <a :href="safeUrl('/accounts?creator=' + encodeURIComponent(p.creator_username.replace(/^@+/, '')))"
                               target="_blank"
                               class="text-purple-600 dark:text-purple-400 hover:underline"
                               :title="'Inspect creator @' + p.creator_username"
                               x-text="'@' + p.creator_username"></a>
                          </template>
                          <template x-if="!p.creator_username">
                            <span class="text-slate-400">Unknown</span>
                          </template>
                          <span class="text-slate-300 dark:text-slate-600">•</span>
                          <span class="text-emerald-600 dark:text-emerald-400 font-bold" x-text="formatNumber(p.saves) + ' saves'"></span>
                          <template x-if="p.dominant_color && p.dominant_color.toLowerCase() !== '#888888' && p.dominant_color.toLowerCase() !== '#1e1e24'">
                            <span class="inline-flex items-center gap-1 text-[10px]">
                              <span>•</span>
                              <span class="w-2.5 h-2.5 rounded-full border border-slate-400/40 inline-block shadow-sm" :style="'background-color: ' + p.dominant_color"></span>
                              <span x-text="p.dominant_color"></span>
                            </span>
                          </template>
                          <template x-if="Array.isArray(p.visual_annotations) && p.visual_annotations.length > 0">
                            <span class="text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[200px]"
                                  :title="(p.visual_annotations || []).map(a => typeof a === 'object' && a !== null ? (a.name || a.tag || a.label || a.term || '') : String(a || '')).filter(Boolean).join(', ')"
                                  x-text="'• 🏷️ ' + (p.visual_annotations || []).map(a => typeof a === 'object' && a !== null ? (a.name || a.tag || a.label || a.term || '') : String(a || '')).filter(Boolean).slice(0, 3).join(', ')"></span>
                          </template>
                        </div>
                        <!-- SERP Appearances Badges (Clickable with drilldown) -->
                        <div class="flex items-center gap-1.5 flex-wrap mt-2">
                          <template x-for="app in (p.serp_appearances || []).slice(0, 6)" :key="app.keyword_id">
                            <button @click="filterToKeyword(app.keyword_name)"
                                    class="text-[10px] font-mono tabular-nums px-2 py-0.5 rounded-md bg-sky-500/10 hover:bg-sky-500/20 text-sky-700 dark:text-sky-300 border border-sky-500/20 transition-colors inline-flex items-center gap-1"
                                    :title="'Drilldown to keyword monopoly for ' + app.keyword_name">
                              <span x-text="app.rank_position ? '#' + app.rank_position : (app.last_known_rank ? 'Vault #' + app.last_known_rank : 'Displaced')" class="font-bold"></span>
                              <span class="text-slate-500 dark:text-slate-400 truncate max-w-[150px]" x-text="app.keyword_name"></span>
                              <span class="text-[9px]">→</span>
                            </button>
                          </template>
                        </div>
                      </div>
                    </div>

                    <div class="flex items-center gap-2 shrink-0">
                      <a :href="safeUrl('/pin/' + p.pin_id + '?domain=' + encodeURIComponent(dossierDomain) + (activeFolderId ? '&folder_id=' + encodeURIComponent(activeFolderId) : '') + '&return_url=' + encodeURIComponent(activeFolderId ? ('/folders/' + activeFolderId + '/domains') : ('/domains/' + dossierDomain)))"
                         target="_blank"
                         class="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-slate-700 dark:text-slate-200 text-xs font-semibold transition font-mono tabular-nums">
                        Inspect ↗
                      </a>
                    </div>
                  </div>
                </template>
                <template x-if="filteredDossierPins().length === 0">
                  <div class="py-12 text-center text-slate-400 font-mono tabular-nums text-xs">No ranked pins matched your search or filters.</div>
                </template>

                <!-- Pins Pagination Controls -->
                <template x-if="totalDossierPinsPages() > 1">
                  <div class="flex items-center justify-between border-t border-slate-200 dark:border-[#27272A] pt-3 px-1 text-xs font-mono tabular-nums">
                    <span class="text-slate-500 dark:text-slate-400">
                      Showing <span class="font-bold text-slate-800 dark:text-slate-200" x-text="((dossierPinsPage - 1) * dossierPinsPerPage) + 1"></span> - <span class="font-bold text-slate-800 dark:text-slate-200" x-text="Math.min(dossierPinsPage * dossierPinsPerPage, filteredDossierPins().length)"></span> of <span class="font-bold text-slate-800 dark:text-slate-200" x-text="filteredDossierPins().length"></span> pins
                    </span>
                    <div class="flex items-center gap-1.5">
                      <button @click="prevDossierPinsPage()"
                              :disabled="dossierPinsPage <= 1"
                              class="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-[#27272A] transition">
                        ← Prev
                      </button>
                      <span class="px-2 py-1 text-slate-600 dark:text-slate-400">
                        Page <span class="font-bold text-slate-900 dark:text-white" x-text="dossierPinsPage"></span> / <span x-text="totalDossierPinsPages()"></span>
                      </span>
                      <button @click="nextDossierPinsPage()"
                              :disabled="dossierPinsPage >= totalDossierPinsPages()"
                              class="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-[#27272A] transition">
                        Next →
                      </button>
                    </div>
                  </div>
                </template>

                <!-- On-Demand Shard Displaced Pins Loader -->
                <template x-if="dossierData?.summary?.displaced_remaining_count > 0">
                  <div class="mt-4 p-4 rounded-2xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 flex items-center justify-between flex-wrap gap-3 font-mono tabular-nums text-xs">
                    <div class="flex items-center gap-2">
                      <span class="text-sky-600 dark:text-sky-400 font-bold">📦 Historical Displaced Vault:</span>
                      <span class="text-slate-600 dark:text-slate-300" x-text="formatNumber(dossierData.summary.displaced_remaining_count) + ' additional historical displaced pins are stored in Unified PostgreSQL.'"></span>
                    </div>
                    <button @click="loadMoreDisplaced()"
                            :disabled="dossierLoadingMore"
                            class="px-3.5 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold transition flex items-center gap-1.5 shadow-sm disabled:opacity-50">
                      <span :class="{ 'animate-spin': dossierLoadingMore }">🔄</span>
                      <span x-text="dossierLoadingMore ? 'Hydrating Vault...' : 'Load +50 Displaced Vault Pins'">Load +50 Displaced Vault Pins</span>
                    </button>
                  </div>
                </template>
              </div>

              <!-- TAB 2: Money Articles & Multipliers -->
              <div x-show="dossierTab === 'urls'" class="space-y-4">
                <template x-for="art in paginatedDossierArticles()" :key="art.clean_slug">
                  <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl p-4 sm:p-5 flex flex-col gap-3 shadow-sm hover:border-sky-500/40 transition">
                    <div class="flex items-start justify-between gap-3">
                      <div class="flex flex-col min-w-0">
                        <div class="flex items-center gap-2 flex-wrap">
                          <span class="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-white truncate" x-text="art.clean_slug === '/' ? 'Root Domain (/)' : art.clean_slug"></span>
                          <button @click="copyToClipboard(art.sample_url || art.clean_slug, 'Copied article URL!')"
                                  class="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-xs px-1.5 py-0.5 rounded hover:bg-slate-100 dark:hover:bg-[#27272A]"
                                  title="Copy URL">
                            📋
                          </button>
                          <a :href="safeUrl(art.sample_url)"
                             target="_blank"
                             rel="noopener noreferrer"
                             class="text-xs text-sky-600 hover:underline shrink-0 font-medium">
                            Open Article ↗
                          </a>
                        </div>
                        <div class="flex items-center gap-2 text-xs font-mono tabular-nums text-slate-400 mt-1 flex-wrap">
                          <!-- Article Pin Age Badge -->
                          <template x-if="getPinAgeBadge(art.created_at_pinterest || art.newest_pin_date)">
                            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold font-mono tabular-nums shrink-0"
                                  :class="getPinAgeBadge(art.created_at_pinterest || art.newest_pin_date).class"
                                  :title="getPinAgeBadge(art.created_at_pinterest || art.newest_pin_date).title"
                                  x-text="getPinAgeBadge(art.created_at_pinterest || art.newest_pin_date).label"></span>
                          </template>
                          <span class="font-bold text-amber-600 dark:text-amber-400" x-text="art.pins_count + ' creative pins'"></span>
                          <span>•</span>
                          <span class="text-emerald-600 dark:text-emerald-400 font-bold" x-text="formatNumber(art.total_saves) + ' saves'"></span>
                          <template x-if="art.url_global_saves != null">
                            <span class="inline-flex items-center gap-1 font-mono">
                              <span>•</span>
                              <span class="text-sky-600 dark:text-sky-400 font-bold" x-text="'🌐 ' + formatNumber(art.url_global_saves) + ' Article Saves'"></span>
                            </span>
                          </template>
                          <template x-if="art.url_global_saves != null && (Number(art.url_global_saves) / Math.max(1, Number(art.total_saves || 1))) >= 5.0">
                            <span class="inline-flex items-center gap-1">
                              <span>•</span>
                              <span class="px-2 py-0.5 rounded text-[10px] font-mono tabular-nums font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                                    x-text="'[' + (Number(art.url_global_saves) / Math.max(1, Number(art.total_saves || 1))).toFixed(1) + 'x Alpha Breakout]'"></span>
                            </span>
                          </template>
                          <template x-if="art.best_rank">
                            <span>•</span>
                            <span class="text-sky-600 dark:text-sky-400 font-bold" x-text="'Best Rank #' + art.best_rank"></span>
                          </template>
                          <template x-if="art.is_vulnerable">
                            <span>•</span>
                            <span class="text-rose-600 dark:text-rose-400 font-bold">⚡ Vulnerable</span>
                          </template>
                          <!-- Clickable Keyword Count Drilldown -->
                          <template x-if="(art.keywords || art.target_keywords || []).length > 0">
                            <span class="inline-flex items-center gap-1">
                              <span>•</span>
                              <button @click="filterToArticleKeywords(art)"
                                      class="text-sky-600 dark:text-sky-400 hover:underline font-bold"
                                      :title="'Filter keywords view to this article’s ' + (art.keywords || art.target_keywords).length + ' keywords'"
                                      x-text="(art.keywords || art.target_keywords).length + ' keywords →'"></button>
                            </span>
                          </template>
                        </div>

                        <!-- Targeted Marketing Angles -->
                        <template x-if="Array.isArray(art.angles_targeted) && art.angles_targeted.length > 0">
                          <div class="flex items-center gap-1.5 flex-wrap mt-2">
                            <span class="text-[10px] font-mono tabular-nums text-slate-400 uppercase font-bold">Search Intents:</span>
                            <template x-for="ang in art.angles_targeted" :key="ang">
                              <span class="text-[10px] font-mono tabular-nums px-2 py-0.5 rounded-full bg-slate-100 dark:bg-[#18181B] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#27272A]"
                                    x-text="'🎯 ' + ang"></span>
                            </template>
                          </div>
                        </template>

                        <!-- Cross-View Drilldown Keywords -->
                        <template x-if="Array.isArray(art.target_keywords || art.keywords) && (art.target_keywords || art.keywords).length > 0">
                          <div class="flex items-center gap-1.5 flex-wrap mt-1.5">
                            <span class="text-[10px] font-mono tabular-nums text-slate-400 uppercase font-bold">Keywords:</span>
                            <template x-for="kw in (art.expandedKeywords ? (art.target_keywords || art.keywords) : (art.target_keywords || art.keywords).slice(0, 5))" :key="kw">
                              <button @click="filterToKeyword(kw)"
                                      class="text-[10px] font-mono tabular-nums px-2 py-0.5 rounded-md bg-sky-500/10 hover:bg-sky-500/20 text-sky-700 dark:text-sky-300 border border-sky-500/20 transition flex items-center gap-1"
                                      :title="'Jump to Keyword Monopoly view for ' + kw">
                                <span x-text="kw"></span>
                                <span class="text-[9px]">→</span>
                              </button>
                            </template>
                            <template x-if="(art.target_keywords || art.keywords).length > 5">
                              <button @click="art.expandedKeywords = !art.expandedKeywords"
                                      class="text-[10px] font-mono tabular-nums font-bold px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-slate-600 dark:text-slate-300 transition"
                                      x-text="art.expandedKeywords ? 'Show less' : '+' + ((art.target_keywords || art.keywords).length - 5) + ' more'"></button>
                            </template>
                          </div>
                        </template>
                      </div>
                    </div>

                    <!-- Creative Pin Variations Thumbnails Gallery (Pillar 2) -->
                    <div class="flex flex-col gap-2 pt-2.5 border-t border-slate-100 dark:border-[#27272A]">
                      <div class="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-8 gap-2.5">
                        <template x-for="p in (art.expandedPins ? art.pins : (art.pins || []).slice(0, 6))" :key="p.pin_id">
                          <div class="group relative rounded-xl overflow-hidden border border-slate-200 dark:border-[#27272A] bg-slate-100 dark:bg-[#121215] aspect-[2/3] flex flex-col justify-between">
                            <img :src="p.image_url"
                                 referrerpolicy="no-referrer"
                                 class="w-full h-full object-cover group-hover:scale-105 transition-transform absolute inset-0"
                                 loading="lazy"
                                 onerror="window.handlePinImgError(this)">
                            
                            <!-- Top Badges Overlay (Age & Intent) -->
                            <div class="relative z-10 p-1 flex items-start justify-between gap-1 w-full flex-wrap">
                              <template x-if="getPinAgeBadge(p.created_at_pinterest)">
                                <span class="px-1 py-0.2 rounded text-[8px] font-bold font-mono tabular-nums shadow-sm"
                                      :class="getPinAgeBadge(p.created_at_pinterest).class"
                                      :title="getPinAgeBadge(p.created_at_pinterest).title"
                                      x-text="getPinAgeBadge(p.created_at_pinterest).label"></span>
                              </template>
                              <template x-if="p.intent_tag">
                                <div class="px-1 py-0.2 rounded text-[8px] font-bold font-mono tabular-nums bg-black/75 text-amber-300 truncate max-w-[80%] shadow-sm"
                                     x-text="p.intent_tag"></div>
                              </template>
                            </div>

                            <!-- Bottom Rank & Saves Overlay -->
                            <div class="relative z-10 bg-slate-950/90 p-1 text-[9px] font-mono tabular-nums text-white flex flex-col gap-0.5"
                                 :title="(p.primary_keyword ? 'Keyword: ' + p.primary_keyword + ' • ' : '') + 'Pin #' + p.pin_id">
                              <template x-if="p.primary_keyword">
                                <div class="text-[8px] text-slate-300 truncate leading-tight" x-text="p.primary_keyword"></div>
                              </template>
                              <div class="flex items-center justify-between">
                                <a :href="safeUrl('/pin/' + p.pin_id + '?domain=' + encodeURIComponent(dossierDomain) + (scopedFolderId ? '&folder_id=' + encodeURIComponent(scopedFolderId) : '') + '&return_url=' + encodeURIComponent(scopedFolderId ? ('/folders/' + scopedFolderId + '/domains/' + dossierDomain) : ('/domains/' + dossierDomain)))" target="_blank" class="hover:underline flex items-center gap-0.5">
                                  <span x-text="p.best_rank ? '#' + p.best_rank : (p.is_displaced ? ('Vault' + (p.last_known_rank ? ' #' + p.last_known_rank : '')) : 'Pin')"></span>
                                  <span class="text-[8px]">↗</span>
                                </a>
                                <span class="text-emerald-400 font-bold" x-text="p.saves + 's'"></span>
                              </div>
                            </div>
                          </div>
                        </template>
                      </div>

                      <!-- Expander Button if > 6 pins -->
                      <template x-if="(art.pins || []).length > 6">
                        <div class="flex justify-end">
                          <button @click="art.expandedPins = !art.expandedPins"
                                  class="text-[11px] font-mono tabular-nums font-semibold px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 hover:bg-slate-100 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-sky-600 dark:text-sky-400 transition flex items-center gap-1">
                            <span x-text="art.expandedPins ? 'Collapse to top 6 pins ↑' : 'View all ' + art.pins.length + ' creative variations (' + (art.pins.length - 6) + ' more) ↓'"></span>
                          </button>
                        </div>
                      </template>
                    </div>
                  </div>
                </template>
                <template x-if="filteredDossierArticles().length === 0">
                  <div class="py-12 text-center text-slate-400 font-mono tabular-nums text-xs">No articles matched your search or filters.</div>
                </template>

                <!-- Articles Pagination Controls -->
                <template x-if="totalDossierArticlesPages() > 1">
                  <div class="flex items-center justify-between border-t border-slate-200 dark:border-[#27272A] pt-3 px-1 text-xs font-mono tabular-nums">
                    <span class="text-slate-500 dark:text-slate-400">
                      Showing <span class="font-bold text-slate-800 dark:text-slate-200" x-text="((dossierArticlesPage - 1) * dossierArticlesPerPage) + 1"></span> - <span class="font-bold text-slate-800 dark:text-slate-200" x-text="Math.min(dossierArticlesPage * dossierArticlesPerPage, filteredDossierArticles().length)"></span> of <span class="font-bold text-slate-800 dark:text-slate-200" x-text="filteredDossierArticles().length"></span> articles
                    </span>
                    <div class="flex items-center gap-1.5">
                      <button @click="prevDossierArticlesPage()"
                              :disabled="dossierArticlesPage <= 1"
                              class="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-[#27272A] transition">
                        ← Prev
                      </button>
                      <span class="px-2 py-1 text-slate-600 dark:text-slate-400">
                        Page <span class="font-bold text-slate-900 dark:text-white" x-text="dossierArticlesPage"></span> / <span x-text="totalDossierArticlesPages()"></span>
                      </span>
                      <button @click="nextDossierArticlesPage()"
                              :disabled="dossierArticlesPage >= totalDossierArticlesPages()"
                              class="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-[#27272A] transition">
                        Next →
                      </button>
                    </div>
                  </div>
                </template>
              </div>

              <!-- TAB 3: Keyword Monopoly Matrix -->
              <div x-show="dossierTab === 'keywords' || dossierTab === 'monopoly'" class="space-y-3">
                <template x-for="kw in filteredDossierKeywords()" :key="kw.keyword_id">
                  <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl p-4 flex flex-col gap-2.5 shadow-sm hover:border-sky-500/40 transition">
                    <div class="flex items-start justify-between gap-3">
                      <div class="flex flex-col min-w-0">
                        <div class="flex items-center gap-2 flex-wrap">
                          <span class="text-sm font-bold text-slate-900 dark:text-white" x-text="kw.keyword_name"></span>
                          <a :href="safeUrl('/keywords/' + encodeURIComponent(kw.keyword_name))"
                             target="_blank"
                             class="text-[11px] text-sky-600 hover:underline font-mono tabular-nums">
                            SERP Radar ↗
                          </a>
                          <!-- Strategy Badge (Pillar 1) -->
                          <template x-if="kw.strategy === 'URL_FLOODING'">
                            <span class="text-[10px] font-mono tabular-nums px-2 py-0.5 rounded-full font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30"
                                  title="URL Creative Flooding: The competitor launched multiple creative pins pointing to the exact same article!">
                              💣 URL Flooding (1 Article, Multi-Pin)
                            </span>
                          </template>
                          <template x-if="kw.strategy === 'TOPIC_CLUSTER'">
                            <span class="text-[10px] font-mono tabular-nums px-2 py-0.5 rounded-full font-bold bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30"
                                  title="Topic Cluster: The competitor dominates this keyword through distinct specialized articles!">
                              🌳 Topic Cluster (<span x-text="kw.unique_urls_count"></span> Articles)
                            </span>
                          </template>
                          <template x-if="kw.strategy === 'HYBRID_FLOODING'">
                            <span class="text-[10px] font-mono tabular-nums px-2 py-0.5 rounded-full font-bold bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30">
                              ⚡ Hybrid Domination
                            </span>
                          </template>
                          <!-- Decaying Monopoly Warning (Pillar 5) -->
                          <template x-if="kw.is_decaying_monopoly">
                            <span class="text-[10px] font-mono tabular-nums px-2 py-0.5 rounded font-bold bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30"
                                  title="Decaying Monopoly: Competitor holds top slots with stagnant velocity. High vulnerability to fresh pin takeover!">
                              ⚡ Decaying Monopoly (Vulnerable)
                            </span>
                          </template>
                        </div>

                        <!-- Slot Positions -->
                        <div class="flex items-center gap-1.5 mt-2 flex-wrap">
                          <span class="text-[10px] font-mono tabular-nums font-bold text-slate-500 uppercase">Positions:</span>
                          <template x-for="r in kw.ranks" :key="r">
                            <span class="text-[10px] font-mono tabular-nums font-bold px-2 py-0.5 rounded"
                                  :class="r <= 3 ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30' : (r <= 10 ? 'bg-sky-500/15 text-sky-700 dark:text-sky-400 border border-sky-500/30' : 'bg-slate-100 dark:bg-[#18181B] text-slate-700 dark:text-slate-300')"
                                  x-text="'#' + r"></span>
                          </template>
                        </div>
                      </div>

                      <div class="flex flex-col items-end shrink-0 font-mono tabular-nums text-xs">
                        <span class="font-bold text-sky-600 dark:text-sky-400" x-text="kw.active_slots + ' slots (' + kw.serp_share_pct + '% SERP)'"></span>
                        <span class="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold" x-text="formatNumber(kw.total_saves) + ' saves'"></span>
                      </div>
                    </div>

                    <!-- Top Slot Traffic Attribution with Cross-View Drilldown -->
                    <template x-if="kw.top_slot_attribution">
                      <div class="pt-2 border-t border-slate-100 dark:border-[#27272A] text-[11px] font-mono tabular-nums text-slate-500 flex items-center justify-between flex-wrap gap-2">
                        <div class="flex items-center gap-1.5 min-w-0">
                          <span class="font-bold text-amber-600 dark:text-amber-400">🏆 Top Slot Driver:</span>
                          <span class="font-bold text-slate-800 dark:text-slate-200" x-text="kw.top_slot_attribution.rank_position != null ? ('Rank #' + kw.top_slot_attribution.rank_position) : (kw.top_slot_attribution.last_known_rank != null ? ('Vault #' + kw.top_slot_attribution.last_known_rank) : 'Vault Pin')"></span>
                          <button @click="filterToArticle(kw.top_slot_attribution.clean_slug || kw.top_slot_attribution.title)"
                                  class="text-sky-600 dark:text-sky-400 hover:underline truncate max-w-[280px] flex items-center gap-1"
                                  :title="'Jump to Article: ' + kw.top_slot_attribution.title">
                            <span x-text="'(' + kw.top_slot_attribution.title + ')'"></span>
                            <span>→</span>
                          </button>
                        </div>
                        <span class="font-bold text-emerald-600 dark:text-emerald-400" x-text="formatNumber(kw.top_slot_attribution.saves) + ' saves (' + Math.round((kw.top_slot_attribution.saves / Math.max(1, kw.total_saves)) * 100) + '%)'"></span>
                      </div>
                    </template>
                  </div>
                </template>
                <template x-if="filteredDossierKeywords().length === 0">
                  <div class="py-12 text-center text-slate-400 font-mono tabular-nums text-xs">No keywords matched your search or filters.</div>
                </template>
              </div>

              <!-- TAB 4: Associated Pinterest Accounts -->
              <div x-show="dossierTab === 'accounts'" class="space-y-3">
                <template x-for="acc in (dossierData.accounts || [])" :key="acc.username">
                  <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl p-4 flex flex-col gap-3 shadow-sm">
                    <div class="flex items-center justify-between gap-3">
                      <div class="flex items-center gap-3.5 min-w-0">
                        <div class="w-10 h-10 rounded-2xl flex items-center justify-center font-bold font-mono tabular-nums text-sm shrink-0"
                             :class="acc.role === 'PRIMARY_BRAND' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30' : 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30'">
                          <span x-text="acc.role === 'PRIMARY_BRAND' ? '👑' : '@'"></span>
                        </div>
                        <div class="flex flex-col min-w-0">
                          <div class="flex items-center gap-2 flex-wrap">
                            <a :href="safeUrl('https://pinterest.com/' + acc.username)"
                               target="_blank"
                               rel="noopener noreferrer"
                               class="text-sm font-bold text-slate-900 dark:text-white hover:text-sky-600 transition truncate"
                               x-text="'@' + acc.username"></a>
                            <span class="text-[10px] font-mono tabular-nums px-2 py-0.5 rounded-full font-bold"
                                  :class="acc.role === 'PRIMARY_BRAND' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30' : 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30'"
                                  x-text="acc.role === 'PRIMARY_BRAND' ? '👑 Primary Brand Account' : '🛰️ Satellite / Ghost Creator'"></span>
                          </div>
                          <div class="flex items-center gap-2 text-xs text-slate-400 font-mono tabular-nums mt-1">
                            <span x-text="acc.pins_count + ' pins linked'"></span>
                            <span>•</span>
                            <span class="text-sky-600 dark:text-sky-400 font-bold" x-text="acc.top10_count + ' top-10 slots'"></span>
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
                           class="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-sm transition font-mono tabular-nums">
                          + Track
                        </a>
                      </div>
                    </div>

                    <!-- Cross-Domain Sybil Footprint (Pillar 4) -->
                    <template x-if="Array.isArray(acc.sister_domains) && acc.sister_domains.length > 0">
                      <div class="pt-2 border-t border-slate-100 dark:border-[#27272A] flex items-center gap-1.5 flex-wrap text-xs font-mono tabular-nums">
                        <span class="text-amber-600 dark:text-amber-400 font-bold">⚠️ Sybil Sister Domains Fingerprint:</span>
                        <template x-for="sd in acc.sister_domains" :key="sd.domain">
                          <span class="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/20"
                                x-text="sd.domain + ' (' + sd.pins_count + ' pins)'"></span>
                        </template>
                      </div>
                    </template>
                  </div>
                </template>
              </div>


              <!-- TAB 6: Visual DNA & Computer Vision Reverse-Engineering -->
              <div x-show="dossierTab === 'visual_dna'" class="space-y-4 font-sans">
                <!-- Top Overview Card -->
                <div class="bg-white dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A]/80 rounded-2xl p-4 shadow-sm flex flex-col gap-3">
                  <div class="flex items-center gap-2">
                    <span class="text-xl">🧬</span>
                    <div>
                      <h3 class="text-sm font-bold text-slate-900 dark:text-white">Reverse-Engineered Visual DNA</h3>
                      <p class="text-[11px] text-slate-400">Pinterest Computer Vision annotations cloud, dominant color palette & winning design signals</p>
                    </div>
                  </div>

                  <!-- Visual Tags Cloud -->
                  <div class="pt-2 border-t border-slate-100 dark:border-[#27272A]/60">
                    <div class="flex items-center justify-between mb-2">
                      <span class="text-[11px] font-bold uppercase tracking-wider font-mono tabular-nums text-slate-700 dark:text-slate-300">
                        🏷️ Top Computer Vision Object Annotations (AI Eye)
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
                      <span class="text-[11px] font-bold uppercase tracking-wider font-mono tabular-nums text-slate-700 dark:text-slate-300">
                        🎨 Dominant Color Palette Distribution
                      </span>
                      <span class="text-[10px] text-slate-400 font-mono tabular-nums">HEX color breakdown across creative pins</span>
                    </div>
                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono tabular-nums text-xs">
                      <template x-for="col in (dossierData?.visual_dna?.dominant_colors_palette || [])" :key="col.color">
                        <div class="p-2.5 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#121215]/60 flex items-center gap-3">
                          <span class="w-7 h-7 rounded-lg border border-slate-300 dark:border-slate-600 shrink-0 shadow-sm" :style="'background-color: ' + col.color"></span>
                          <div class="flex flex-col min-w-0">
                            <span class="font-bold text-slate-800 dark:text-slate-200 uppercase truncate" x-text="col.color"></span>
                            <span class="text-[10px] text-slate-400" x-text="col.count + ' pins (' + col.percentage + '%)'"></span>
                          </div>
                        </div>
                      </template>
                    </div>
                  </div>

                  <!-- High-Converting Title Keywords -->
                  <div class="pt-3 border-t border-slate-100 dark:border-[#27272A]/60">
                    <div class="flex items-center justify-between mb-2">
                      <span class="text-[11px] font-bold uppercase tracking-wider font-mono tabular-nums text-slate-700 dark:text-slate-300">
                        ✍️ Winning SEO Title Semantic Keywords
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
}
