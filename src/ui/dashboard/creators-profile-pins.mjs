/**
 * Creator Hub — View B Sub-View 2: All Account Pins (Master Pin Ledger)
 */
import { renderPinRowTemplate } from '../pin-row.mjs';

export function renderCreatorsProfilePins() {
  return `          <!-- ======================================================== -->
          <!-- SUB-VIEW: ALL ACCOUNT PINS (FULL DISCOVERED INVENTORY)    -->
          <!-- ======================================================== -->
          <div x-show="activeCreatorTab === 'all_pins'" class="space-y-5">
            <!-- Unified Ledger Command Header -->
            <div class="rounded-2xl border border-slate-200/90 dark:border-[#27272A] bg-white dark:bg-[#18181B] p-4 sm:p-5 shadow-xs space-y-4">
              <!-- Top Row: Title, Totals & Refresh -->
              <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div class="flex items-center gap-2.5">
                  <span class="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-500 font-bold text-base shadow-2xs"><i data-lucide="pin" class="w-4 h-4"></i></span>
                  <div>
                    <div class="flex items-center gap-2">
                      <h3 class="text-base font-bold text-slate-900 dark:text-white">Master Pin Ledger</h3>
                      <span class="text-xs font-mono tabular-nums font-bold px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20" x-text="formatNumber(activeCreatorCatalogTotal || activeCreatorAllPinsTotal || 0) + ' pins'"></span>
                    </div>
                    <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Discovered pins catalog for @<span x-text="(activeCreator?.username || '').replace(/^@+/, '')"></span>. Synchronized in Unified PostgreSQL.</p>
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
                  @click="creatorAllPinQualifiedOnly = false; creatorAllPinRankedOnly = false; creatorAllPinStage = ''; activeCreatorAllPinsPage = 1; fetchCreatorAllPins()"
                  class="px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border shadow-2xs whitespace-nowrap shrink-0"
                  :class="(!creatorAllPinQualifiedOnly && !creatorAllPinRankedOnly && !creatorAllPinStage) ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs' : 'bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-[#27272A] hover:text-slate-900 dark:hover:text-white'"
                >
                  <span class="inline-flex items-center gap-1"><i data-lucide="clipboard-list" class="w-3.5 h-3.5 shrink-0"></i><span>All Catalog</span></span>
                  <span class="px-1.5 py-0.2 rounded text-[10.5px] font-mono tabular-nums" :class="(!creatorAllPinQualifiedOnly && !creatorAllPinRankedOnly && !creatorAllPinStage) ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'" x-text="formatNumber(activeCreatorCatalogTotal || activeCreatorAllPinsTotal || 0)"></span>
                </button>

                <!-- Qualified Winners -->
                <button 
                  type="button" 
                  @click="creatorAllPinQualifiedOnly = true; creatorAllPinRankedOnly = false; activeCreatorAllPinsPage = 1; fetchCreatorAllPins()"
                  class="px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border shadow-2xs whitespace-nowrap shrink-0"
                  :class="(creatorAllPinQualifiedOnly && !creatorAllPinRankedOnly) ? 'bg-amber-500 text-white border-amber-600 shadow-xs' : 'bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-[#27272A] hover:text-slate-900 dark:hover:text-white'"
                >
                  <span class="inline-flex items-center gap-1"><i data-lucide="trophy" class="w-3.5 h-3.5 shrink-0"></i><span>Qualified Winners</span></span>
                  <span class="px-1.5 py-0.2 rounded text-[10.5px] font-mono tabular-nums" :class="(creatorAllPinQualifiedOnly && !creatorAllPinRankedOnly) ? 'bg-white/20 text-white' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'" x-text="formatNumber(activeCreatorWinningPinsTotal || 0)"></span>
                </button>

                <!-- SERP Ranked -->
                <button 
                  type="button" 
                  @click="creatorAllPinRankedOnly = true; creatorAllPinQualifiedOnly = false; activeCreatorAllPinsPage = 1; fetchCreatorAllPins()"
                  class="px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border shadow-2xs whitespace-nowrap shrink-0"
                  :class="(creatorAllPinRankedOnly) ? 'bg-sky-600 text-white border-sky-700 shadow-xs' : 'bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-[#27272A] hover:text-slate-900 dark:hover:text-white'"
                >
                  <span class="inline-flex items-center gap-1"><i data-lucide="target" class="w-3.5 h-3.5 shrink-0"></i><span>SERP Ranked</span></span>
                  <span class="px-1.5 py-0.2 rounded text-[10.5px] font-mono tabular-nums" :class="(creatorAllPinRankedOnly) ? 'bg-white/20 text-white' : 'bg-sky-500/10 text-sky-600 dark:text-sky-400'" x-text="formatNumber(activeCreatorRankedTotal || 0)"></span>
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
                      <span class="inline-flex items-center gap-1"><i data-lucide="user" class="w-3.5 h-3.5 shrink-0"></i><span>Official Account</span></span>
                      <span class="px-1.5 py-0.2 rounded text-[10px] font-mono tabular-nums bg-black/10 dark:bg-white/15" x-text="formatNumber(activeCreatorCatalogTotal || 0)"></span>
                    </button>
                    <button
                      type="button"
                      @click="creatorAllPinScope = 'ecosystem'; activeCreatorAllPinsPage = 1; fetchCreatorAllPins()"
                      class="px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border whitespace-nowrap shrink-0"
                      :class="creatorAllPinScope === 'ecosystem' ? 'bg-violet-600 text-white border-violet-700 shadow-xs' : 'bg-violet-50/70 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800/60'"
                      title="Includes all SERP & Vault pins linking to this creator's primary website domain across all Pinterest users"
                    >
                      <span class="inline-flex items-center gap-1"><i data-lucide="globe" class="w-3.5 h-3.5 shrink-0"></i><span>Full Domain Ecosystem</span></span>
                      <span class="px-1.5 py-0.2 rounded text-[10px] font-mono tabular-nums" :class="creatorAllPinScope === 'ecosystem' ? 'bg-white/20 text-white' : 'bg-violet-500/15 text-violet-700 dark:text-violet-300'" x-text="formatNumber(activeCreatorEcosystemTotal || (activeCreatorCatalogTotal + activeCreatorCuratorPinsTotal) || 0)"></span>
                    </button>
                    <button
                      type="button"
                      @click="creatorAllPinScope = 'curators'; activeCreatorAllPinsPage = 1; fetchCreatorAllPins()"
                      class="px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border whitespace-nowrap shrink-0"
                      :class="creatorAllPinScope === 'curators' ? 'bg-fuchsia-600 text-white border-fuchsia-700 shadow-xs' : 'bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-[#27272A]'"
                      title="Third-party community curator pins linking to this creator's website domain"
                    >
                      <span class="inline-flex items-center gap-1"><i data-lucide="handshake" class="w-3.5 h-3.5 shrink-0"></i><span>Community Curators</span></span>
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
                        <span class="inline-flex items-center gap-1"><i data-lucide="pin" class="w-3.5 h-3.5 shrink-0"></i><span>External Repins</span></span>
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
                      <option value="GROWING">GROWING</option>
                      <option value="NEW">NEW (≤14d)</option>
                      <option value="MATURE">MATURE</option>
                      <option value="COOLING">COOLING</option>
                      <option value="DORMANT">DORMANT</option>
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
                    x-show="creatorAllPinSearch || creatorAllPinBoard || creatorAllPinMinSaves > 0 || creatorAllPinQualifiedOnly || creatorAllPinRankedOnly || creatorAllPinStage"
                    @click="creatorAllPinSearch = ''; creatorAllPinBoard = ''; creatorAllPinMinSaves = 0; creatorAllPinQualifiedOnly = false; creatorAllPinRankedOnly = false; creatorAllPinStage = ''; activeCreatorAllPinsPage = 1; fetchCreatorAllPins()"
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

            <!-- Creator -> Campaign 4-Source Daily Tracking Bar -->
            <div x-show="activeCreatorAllPins.length > 0" class="rounded-2xl border border-indigo-200/80 dark:border-indigo-900/50 bg-indigo-50/50 dark:bg-indigo-950/20 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2.5 text-xs">
              <div class="flex items-center gap-2">
                <i data-lucide="send" class="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0"></i>
                <span class="font-semibold text-slate-800 dark:text-slate-200" x-text="selectedCreatorPinIds.length > 0 ? (selectedCreatorPinIds.length + ' selected pin(s) ready for Campaign Tracking') : ('Send filtered pins (' + activeCreatorAllPins.length + ' on page) to a Campaign')"></span>
                <template x-if="selectedCreatorPinIds.length > 0">
                  <button type="button" @click="clearSelectedCreatorPins()" class="text-[11px] text-slate-500 hover:text-slate-800 dark:hover:text-white underline cursor-pointer">Clear</button>
                </template>
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <select x-model="creatorPinsTargetFolderId" aria-label="Target campaign folder" class="py-1.5 px-2.5 text-xs rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer max-w-[200px]">
                  <option value="">Select Campaign...</option>
                  <template x-for="f in foldersList" :key="f.id">
                    <option :value="String(f.id)" x-text="f.name"></option>
                  </template>
                </select>
                <button type="button"
                        @click="sendCreatorPinsToCampaign()"
                        :disabled="sendingPinsToCampaign || !creatorPinsTargetFolderId"
                        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold transition shadow-xs cursor-pointer">
                  <i data-lucide="folder-plus" class="w-3.5 h-3.5" :class="sendingPinsToCampaign ? 'animate-pulse' : ''"></i>
                  <span x-text="sendingPinsToCampaign ? 'Sending...' : (selectedCreatorPinIds.length > 0 ? ('Send ' + selectedCreatorPinIds.length + ' to Campaign') : 'Send Filtered to Campaign')"></span>
                </button>
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
                <span>Launch 20-Runner GitHub Actions Harvest</span>
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
                    ${renderPinRowTemplate({
                      pinVar: 'p',
                      showCheckbox: true,
                      showRank: false,
                      showThumb: true,
                      showTitle: true,
                      showBoard: true,
                      boardPosition: 'afterTitle',
                      showDomain: false,
                      showVelocity: false,
                      showSaves: true,
                      showRepins: true,
                      showAge: true,
                      agePosition: 'beforeActions',
                      showActions: true,
                      rowClass: 'hover:bg-slate-50/80 dark:hover:bg-slate-900/40 transition',
                      rowDynamicClass: "isPinSelected(p.pin_id) ? 'bg-amber-500/5 dark:bg-amber-500/10' : ''",
                      checkboxHtml: `
                      <!-- Selection Checkbox -->
                      <td class="py-2.5 px-3 text-center">
                        <input type="checkbox" :checked="isPinSelected(p.pin_id)" @change="togglePinSelection(p.pin_id)" class="rounded border-slate-300 text-amber-500 cursor-pointer" />
                      </td>`,
                      thumbHtml: `
                      <!-- Thumbnail with hover preview -->
                      <td x-show="visibleMasterColumns.media" class="py-2.5 px-3 w-14">
                        <div class="relative group cursor-pointer" @click="openPinDossier(p)">
                          <img :src="p.image_url" loading="lazy" class="w-11 h-14 rounded-lg object-cover border border-slate-200 dark:border-[#27272A] bg-slate-100 dark:bg-slate-800 hover:opacity-80 transition" onerror="if(window.handlePinImgError){window.handlePinImgError(this)}else{this.onerror=null}" />
                          <div class="hidden group-hover:block absolute left-14 top-0 z-40 w-44 rounded-xl overflow-hidden shadow-2xl border border-slate-200 dark:border-[#27272A] pointer-events-none bg-white dark:bg-slate-900">
                            <img :src="p.image_url" class="w-full h-auto object-cover" onerror="if(window.handlePinImgError){window.handlePinImgError(this)}else{this.onerror=null}" />
                          </div>
                        </div>
                      </td>`,
                      titleHtml: `
                      <!-- Title & Destination -->
                      <td x-show="visibleMasterColumns.title" class="py-2.5 px-4 font-sans font-bold text-slate-900 dark:text-white max-w-md">
                        <div class="line-clamp-2 cursor-pointer hover:text-rose-500 transition" :title="p.title" x-text="p.title || 'Untitled Pin'" @click="openPinDossier(p)"></div>
                        <div class="flex items-center gap-2 mt-1 font-mono tabular-nums text-[10.5px] font-normal flex-wrap">
                          <span class="text-slate-400" x-text="'ID: ' + p.pin_id"></span>
                          <template x-if="p.attribution_source === 'curator' && p.curator_username">
                            <span class="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20 font-semibold" :title="'Saved onto board by third-party curator @' + p.curator_username">
                              <span class="inline-flex items-center gap-1"><i data-lucide="handshake" class="w-3 h-3 shrink-0"></i><span>@<span x-text="String(p.curator_username).replace(/^@/, '')"></span></span></span>
                            </span>
                          </template>
                          <template x-if="p.destination_url">
                            <a :href="safeUrl(p.destination_url)" target="_blank" rel="noopener noreferrer" class="text-sky-500 hover:underline flex items-center gap-1 truncate max-w-[200px]" :title="p.destination_url">
                              <i data-lucide="link" class="w-3 h-3 shrink-0"></i>
                              <span x-text="p.link_domain || 'Destination'"></span>
                            </a>
                          </template>
                        </div>
                      </td>`,
                      boardHtml: `
                      <!-- Board Name -->
                      <td x-show="visibleMasterColumns.board" class="py-2.5 px-3 font-sans text-slate-600 dark:text-slate-300 truncate max-w-[130px]">
                        <button type="button" @click="openBoardPage(p.board_name, activeCreator)" class="inline-block px-2 py-0.5 rounded-lg text-[10.5px] font-semibold bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 hover:bg-purple-100 dark:hover:bg-purple-950/40 hover:text-purple-600 dark:hover:text-purple-400 border border-slate-200 dark:border-[#27272A]/60 transition cursor-pointer" x-text="p.board_name || 'General'"></button>
                      </td>`,
                      savesHtml: `
                      <!-- Saves + 24h delta -->
                      <td x-show="visibleMasterColumns.saves" class="py-2.5 px-3 text-right">
                        <div class="flex flex-col items-end">
                          <span class="font-extrabold" :class="Number(p.save_count || p.saves || 0) >= 100 ? 'text-rose-600 dark:text-rose-400 font-black' : 'text-slate-700 dark:text-slate-300'" x-text="formatNumber(p.save_count || p.saves || 0)"></span>
                          <template x-if="Number(p.delta_saves_24h || p.velocity || 0) > 0">
                            <span class="inline-flex items-center text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.2 rounded border border-emerald-200/60 dark:border-emerald-800/60 mt-0.5" x-text="'+' + (Number(p.delta_saves_24h || p.velocity || 0) >= 1 ? formatNumber(Math.round(p.delta_saves_24h || p.velocity || 0)) : Number(p.delta_saves_24h || p.velocity || 0).toFixed(1)) + ' 24h'"></span>
                          </template>
                        </div>
                      </td>`,
                      repinsHtml: `
                      <!-- Repins + 24h delta -->
                      <td x-show="visibleMasterColumns.repins" class="py-2.5 px-3 text-right">
                        <div class="flex flex-col items-end">
                          <span class="font-bold text-slate-700 dark:text-slate-300" x-text="formatNumber(p.repin_count || p.repins || 0)"></span>
                          <template x-if="Number(p.delta_repins_24h || 0) > 0">
                            <span class="inline-flex items-center text-[10px] font-semibold text-pink-700 dark:text-pink-400 bg-pink-50 dark:bg-pink-950/40 px-1.5 py-0.2 rounded border border-pink-200/60 dark:border-pink-800/60 mt-0.5" x-text="'+' + formatNumber(Math.round(p.delta_repins_24h)) + ' 24h'"></span>
                          </template>
                        </div>
                      </td>`,
                      extraCellsBeforeAge: `
                      <!-- Status Badge (Clean: 🏆, 🎯, Product) -->
                      <td x-show="visibleMasterColumns.status" class="py-2.5 px-3 text-center">
                        <div class="inline-flex items-center justify-center gap-1.5 flex-wrap">
                          <template x-if="p.is_ranked">
                            <span class="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30 shadow-2xs" :title="'Ranked in SERP position #' + (p.rank_position || '—')">
                              <i data-lucide="target" class="w-3 h-3 shrink-0"></i>
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
                              <i data-lucide="trophy" class="w-3.5 h-3.5 text-amber-500"></i>
                            </button>
                          </template>
                          <template x-if="!p.is_qualified && !p.is_product && !p.is_ranked">
                            <span class="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-[#27272A]">
                              Standard
                            </span>
                          </template>
                        </div>
                      </td>`,
                      ageHtml: `
                      <!-- Created / Discovered -->
                      <td x-show="visibleMasterColumns.created_at" class="py-2.5 px-3 font-sans text-slate-500 text-[11px]">
                        <span x-text="p.created_at_pinterest ? new Date(p.created_at_pinterest).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : (p.first_seen_at ? new Date(p.first_seen_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—')"></span>
                      </td>`,
                      actionsHtml: `
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
                      </td>`
                    })}
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
          </div>`;
}
