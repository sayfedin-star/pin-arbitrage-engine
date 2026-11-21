/**
 * Creator Hub & PinArchive
 * View A: Tracked Creators Ledger & KPI ribbons
 * View B: Dedicated Creator Profile Page (Overview, All Pins, Top URLs, Related Pins, Boards Strategy)
 */
import { renderCreatorsLedgerView } from './creators-ledger-view.mjs';
import { renderCreatorsProfileOverview } from './creators-profile-overview.mjs';
import { renderCreatorsProfilePins } from './creators-profile-pins.mjs';
import { renderCreatorsProfileUrls } from './creators-profile-urls.mjs';
import { renderCreatorsProfileRelated } from './creators-profile-related.mjs';
import { renderCreatorsProfileBoards } from './creators-profile-boards.mjs';
import { renderCreatorsAssignModal } from './creators-assign-modal.mjs';

export function getDashboardCreatorsHtml({ safeFolderId = '' } = {}) {
  return `    <!-- ======================================================== -->
    <!-- TAB 4: 👥 CREATOR HUB & PINARCHIVE (UNIFIED PAGE)          -->
    <!-- Unified Creator Tracking, Boards, and Winning Pin Archive -->
    <!-- ======================================================== -->
    <div x-show="currentTab === 'creators_archive' || currentTab === 'competitors' || currentTab === 'pinarchive'" x-cloak class="space-y-6">
      
${renderCreatorsLedgerView({ safeFolderId })}

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
              <button @click="quickPulseCreatorAction(activeCreator)" :disabled="pulsingCreatorId === activeCreator.id" class="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 text-xs font-bold text-amber-700 dark:text-amber-400 hover:bg-amber-500/20 transition shadow-2xs cursor-pointer disabled:opacity-50" title="Pulse Profile (~2s): Instant Edge sync of Impressions, Total Audience & Boards">
                <i data-lucide="zap" class="w-3.5 h-3.5 text-amber-500" :class="pulsingCreatorId === activeCreator.id ? 'animate-spin' : ''"></i>
                <span x-text="pulsingCreatorId === activeCreator.id ? 'Pulsing...' : 'Pulse Profile'"></span>
              </button>

              <!-- 🏆 Refresh Winners (GitHub Actions) -->
              <button @click="dispatchRefreshWinnersAction(activeCreator)" class="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-purple-500/30 bg-purple-500/10 px-3 text-xs font-bold text-purple-700 dark:text-purple-300 hover:bg-purple-500/20 transition shadow-2xs cursor-pointer" title="Refresh Winners: Dispatch background refresh of winning pin stats on GitHub Actions">
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
                    <span class="inline-flex items-center gap-1 rounded-full bg-purple-500/10 px-2.5 py-0.5 text-[11px] font-bold text-purple-600 dark:text-purple-400 border border-purple-500/20"><i data-lucide="target" class="w-3 h-3 shrink-0"></i><span x-text="activeCreator.account_type === 'own' ? 'Own Account' : 'Competitor'"></span></span>
                    <span class="rounded-full bg-rose-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-rose-600 dark:text-rose-400 border border-rose-500/20">General</span>
                    <span x-show="activeCreator.is_active === false" class="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-bold text-amber-600 dark:text-amber-400 border border-amber-500/30"><i data-lucide="pause" class="w-3 h-3 shrink-0"></i><span>Ingest Paused</span></span>
                    <span x-show="activeCreator.is_active !== false" class="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"><span class="w-2 h-2 rounded-full bg-emerald-500 inline-block shrink-0" aria-hidden="true"></span><span>Active Ingest</span></span>
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
                    <span class="inline-flex items-center gap-1.5"><i data-lucide="target" class="w-3.5 h-3.5 text-indigo-500 shrink-0"></i><span>Articles Only (Exclude E-commerce Products: <code class="text-[10px] font-mono tabular-nums bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">!is_product</code>)</span></span>
                  </label>
                </div>

                <div class="flex items-center gap-2.5">
                  <button @click="saveCreatorRulesAction()" :disabled="isSavingCreatorRules" class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 text-xs font-bold transition shadow-xs cursor-pointer disabled:opacity-50">
                    <i data-lucide="save" class="w-3.5 h-3.5"></i>
                    <span x-text="isSavingCreatorRules ? 'Saving...' : 'Save Rules for this Account'"></span>
                  </button>
                  <button @click="reEvaluateCreatorPinsAction()" :disabled="isReEvaluatingCreatorPins" class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition shadow-xs cursor-pointer disabled:opacity-50">
                    <i data-lucide="refresh-cw" class="w-3.5 h-3.5" :class="isReEvaluatingCreatorPins ? 'animate-spin' : ''"></i>
                    <span x-text="isReEvaluatingCreatorPins ? 'Evaluating...' : 'Re-evaluate Pins'"></span>
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


${renderCreatorsProfileOverview()}

${renderCreatorsProfilePins()}

${renderCreatorsProfileUrls()}

${renderCreatorsProfileRelated()}

${renderCreatorsProfileBoards()}

        </div>
      </template>
    </div>

${renderCreatorsAssignModal()}
`;
}
