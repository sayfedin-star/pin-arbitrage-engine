/**
 * Creator Hub — View B Sub-View 3: Top Destination URLs Intelligence
 */
export function renderCreatorsProfileUrls() {
  return `          <!-- ======================================================== -->
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
          </div>`;
}
