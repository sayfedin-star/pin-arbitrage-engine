/**
 * src/ui/keywords-drawers.mjs
 *
 * Deconstructed Modular UI Subsystem: Keyword Slide-Over Inspector & Modals
 * Extracted from monolithic src/keywords-ui.mjs for Package P3 structural re-organization.
 */

export function getKeywordDrawersAndModalsHtml() {
  return `  <!-- PIN DETAIL SLIDE-OVER INSPECTOR DRAWER (PinClicks Parity - Image 5) -->
  <!-- PIN DEEP DOSSIER SLIDE-OVER INSPECTOR (Image 2 Parity) -->
  <div x-show="isPinDrawerOpen" x-cloak class="relative z-50">
    <div x-show="isPinDrawerOpen"
         x-transition:enter="transition-opacity ease-linear duration-300"
         x-transition:enter-start="opacity-0"
         x-transition:enter-end="opacity-100"
         x-transition:leave="transition-opacity ease-linear duration-300"
         x-transition:leave-start="opacity-100"
         x-transition:leave-end="opacity-0"
         @click="closePinInspector()"
         class="fixed inset-0 bg-slate-950/70 backdrop-blur-xs"></div>

    <div class="fixed inset-y-0 right-0 max-w-full flex pl-8 sm:pl-16">
      <div x-show="isPinDrawerOpen"
           x-transition:enter="transform transition ease-in-out duration-300"
           x-transition:enter-start="translate-x-full"
           x-transition:enter-end="translate-x-0"
           x-transition:leave="transform transition ease-in-out duration-300"
           x-transition:leave-start="translate-x-0"
           x-transition:leave-end="translate-x-full"
           class="w-screen max-w-xl md:max-w-2xl bg-white dark:bg-[#0c1322] border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col h-full overflow-hidden">
        
        <!-- Drawer Header with Quick-Copy Toolbar (Image 2 Parity) -->
        <div class="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-900/40 shrink-0">
          
          <div class="flex items-center space-x-2">
            <template x-if="activeInspectorPin?.is_displaced || (!activeInspectorPin?.rank_position && activeInspectorPin?.last_known_rank)">
              <div class="flex items-center space-x-1.5">
                <span class="px-2.5 py-1 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 font-mono font-black text-xs border border-amber-500/30"
                      x-text="'#' + (activeInspectorPin?.catalog_rank || 101) + ' [Vault]'"></span>
                <span class="px-2 py-0.5 rounded-lg bg-rose-500/15 text-rose-600 dark:text-rose-400 font-mono font-bold text-xs border border-rose-500/30"
                      x-text="'Was #' + (activeInspectorPin?.last_known_rank || '?')"></span>
              </div>
            </template>
            <template x-if="!activeInspectorPin?.is_displaced && activeInspectorPin?.rank_position">
              <span class="px-2.5 py-1 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-mono font-black text-xs border border-emerald-500/30"
                    x-text="'#' + activeInspectorPin.rank_position"></span>
            </template>
            <h3 class="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">Pin Deep Dossier</h3>
            <span class="px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold border"
                  :class="getPinMethodBadgeClass(activeInspectorPin)"
                  :title="'Method: ' + formatPinMethodLabel(activeInspectorPin)"
                  x-text="getPinMethod(activeInspectorPin)"></span>
          </div>

          <!-- Quick-Copy Buttons Bar (Image 2 Parity) -->
          <div class="flex flex-wrap items-center gap-1.5">
            <!-- Open Full Dossier Page (Level 3) -->
            <a :href="'/pins/' + activeInspectorPin?.pin_id + (selectedKeyword?.id ? ('?keyword_id=' + selectedKeyword.id + '&keyword=' + encodeURIComponent(selectedKeyword.keyword) + (activeFolderId ? ('&folder_id=' + activeFolderId) : '')) : '')"
               class="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 transition flex items-center space-x-1"
               title="Open Dedicated Full Dossier Page (/pins/:pin_id)">
              <i data-lucide="external-link" class="w-3 h-3 text-emerald-500"></i>
              <span>Full Dossier</span>
            </a>

            <button @click="copyToClipboard(activeInspectorPin?.pin_id, 'Copied Pin ID: ' + activeInspectorPin?.pin_id)"
                    class="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition flex items-center space-x-1 cursor-pointer"
                    title="Copy Pin ID">
              <i data-lucide="hash" class="w-3 h-3 text-emerald-500"></i>
              <span>Pin ID</span>
            </button>

            <button @click="copyToClipboard('https://www.pinterest.com/pin/' + activeInspectorPin?.pin_id + '/', 'Copied Pinterest URL!')"
                    class="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition flex items-center space-x-1 cursor-pointer"
                    title="Copy URL">
              <i data-lucide="link" class="w-3 h-3 text-blue-500"></i>
              <span>URL</span>
            </button>

            <button @click="copyToClipboard(activeInspectorPin?.title || '', 'Copied Title!')"
                    class="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition flex items-center space-x-1 cursor-pointer"
                    title="Copy Title">
              <i data-lucide="type" class="w-3 h-3 text-purple-500"></i>
              <span>Title</span>
            </button>

            <button @click="copyToClipboard(dossierData?.seo_alt_text || activeInspectorPin?.seo_alt_text || '', 'Copied SEO Alt Text!')"
                    class="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition flex items-center space-x-1 cursor-pointer"
                    title="Copy Alt Text">
              <i data-lucide="file-text" class="w-3 h-3 text-amber-500"></i>
              <span>Alt Text</span>
            </button>

            <button @click="copyToClipboard(dossierData?.description || activeInspectorPin?.metadata?.description || '', 'Copied Pin Description!')"
                    class="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition flex items-center space-x-1 cursor-pointer"
                    title="Copy Description">
              <i data-lucide="align-left" class="w-3 h-3 text-emerald-500"></i>
              <span>Desc</span>
            </button>

            <a :href="'/pins/' + activeInspectorPin?.pin_id + (selectedKeyword?.id ? ('?keyword_id=' + selectedKeyword.id + '&keyword=' + encodeURIComponent(selectedKeyword.keyword) + (activeFolderId ? ('&folder_id=' + activeFolderId) : '')) : '')" target="_blank"
               class="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 border border-purple-500/20 transition flex items-center space-x-1 cursor-pointer"
               title="Open Universal Pin Dossier (Level 3)">
              <i data-lucide="sparkles" class="w-3 h-3"></i>
              <span>Full Dossier</span>
            </a>

            <div class="flex items-center space-x-1 border-l border-slate-200 dark:border-slate-800 pl-1.5 ml-1">
              <button @click="prevInspectorPin()" :disabled="activeInspectorPinIndex <= 0"
                      class="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-40 transition cursor-pointer"
                      title="Previous Pin">
                <i data-lucide="chevron-left" class="w-3.5 h-3.5"></i>
              </button>
              <button @click="nextInspectorPin()"
                      class="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition cursor-pointer"
                      title="Next Pin">
                <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>
              </button>
              <a :href="'https://www.pinterest.com/pin/' + activeInspectorPin?.pin_id + '/'" target="_blank"
                 class="p-1.5 rounded-lg bg-rose-500 hover:bg-rose-600 text-white transition flex items-center"
                 title="Open Pin on Pinterest">
                <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
              </a>
              <button @click="closePinInspector()" class="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-white transition cursor-pointer">
                <i data-lucide="x" class="w-4 h-4"></i>
              </button>
            </div>
          </div>

        </div>

        <!-- Drawer Scrollable Body -->
        <div class="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          
          <!-- Large Pin Creative, Dominant Color Accent & Meta -->
          <div class="space-y-3">
            <template x-if="dossierData?.image_url || activeInspectorPin?.image_url">
              <div class="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 max-h-96 flex items-center justify-center bg-slate-100 dark:bg-slate-900 shadow-sm relative">
                <img :src="dossierData?.image_url || activeInspectorPin?.image_url" class="w-full max-h-96 object-contain">
                <template x-if="dossierData?.dominant_color">
                  <div class="absolute bottom-3 right-3 px-2 py-1 rounded-lg bg-black/70 backdrop-blur-xs text-[10px] font-mono text-white flex items-center space-x-1.5">
                    <span class="w-2.5 h-2.5 rounded-full" :style="'background-color: ' + dossierData.dominant_color"></span>
                    <span x-text="dossierData.dominant_color"></span>
                  </div>
                </template>
              </div>
            </template>

            <h3 class="text-base sm:text-lg font-black text-slate-900 dark:text-white leading-snug"
                x-text="dossierData?.title || activeInspectorPin?.title || 'Untitled Pin'"></h3>

            <!-- Creator & Board Attribution Strip -->
            <div class="flex flex-wrap items-center justify-between text-xs text-slate-500 dark:text-slate-400 gap-2 pt-1 font-mono">
              <div class="flex flex-wrap items-center gap-2">
                <template x-if="dossierData?.creator_avatar_url || activeInspectorPin?.metadata?.pinner?.image_small_url">
                  <img :src="dossierData?.creator_avatar_url || activeInspectorPin.metadata.pinner.image_small_url" class="w-5 h-5 rounded-full object-cover">
                </template>
                <span class="font-bold text-slate-700 dark:text-slate-300"
                      x-text="dossierData?.creator_name || activeInspectorPin?.metadata?.pinner?.full_name || ('@' + (dossierData?.creator_username || activeInspectorPin?.creator_username || 'creator'))"></span>
                <template x-if="dossierData?.creator_is_verified_merchant || activeInspectorPin?.metadata?.pinner?.is_verified_merchant">
                  <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-500/15 text-blue-500 border border-blue-500/30" title="Verified Merchant">✓ Merchant</span>
                </template>
                <template x-if="dossierData?.creator_followers || activeInspectorPin?.metadata?.pinner?.follower_count">
                  <span class="px-1.5 py-0.5 rounded text-[9px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold border border-slate-200 dark:border-slate-700"
                        x-text="formatNumber(dossierData?.creator_followers || activeInspectorPin?.metadata?.pinner?.follower_count) + ' followers'"></span>
                </template>
                <template x-if="dossierData?.board_name || activeInspectorPin?.metadata?.board_name || activeInspectorPin?.board_name">
                  <span class="text-slate-400 flex items-center gap-1">
                    <span>in</span>
                    <span class="font-bold text-slate-600 dark:text-slate-300" x-text="dossierData?.board_name || activeInspectorPin?.metadata?.board_name || activeInspectorPin?.board_name"></span>
                    <template x-if="dossierData?.board_pin_count">
                      <span class="text-[10px] text-slate-500 font-normal" x-text="'(' + formatNumber(dossierData.board_pin_count) + ' pins)'"></span>
                    </template>
                  </span>
                </template>
              </div>

              <template x-if="activeInspectorPin?.domain || dossierData?.domain">
                <a :href="safeUrl(dossierData?.destination_url || activeInspectorPin.destination_url)" target="_blank" rel="noopener noreferrer"
                   class="text-emerald-600 dark:text-emerald-400 hover:underline flex items-center space-x-1">
                  <i data-lucide="globe" class="w-3 h-3"></i>
                  <span x-text="dossierData?.domain || activeInspectorPin.domain"></span>
                </a>
              </template>
            </div>

            <!-- Publishing Method, Creation Date & Algorithmic Signals Strip -->
            <div class="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200/60 dark:border-slate-800/60 font-mono text-xs">
              <!-- Method Badge -->
              <div class="flex items-center space-x-1.5 px-2.5 py-1 rounded-xl border text-[11px] font-bold"
                   :class="getPinMethodBadgeClass(activeInspectorPin)">
                <i data-lucide="zap" class="w-3 h-3 shrink-0"></i>
                <span class="text-slate-400 font-medium">Method:</span>
                <span class="font-bold" x-text="getPinMethod(activeInspectorPin)"></span>
                <span class="text-[10px] opacity-75 font-normal" x-text="'(' + formatPinMethodLabel(activeInspectorPin) + ')'"></span>
              </div>

              <!-- Created Date Badge -->
              <div class="flex items-center space-x-1.5 px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 text-slate-700 dark:text-slate-300 text-[11px]">
                <i data-lucide="calendar" class="w-3 h-3 text-purple-500 shrink-0"></i>
                <span class="text-slate-400 font-medium">Created:</span>
                <span class="font-bold font-mono text-slate-900 dark:text-white" x-text="formatPinCreated(activeInspectorPin)"></span>
                <template x-if="formatPinAge(activeInspectorPin)">
                  <span class="px-1.5 py-0.2 rounded text-[10px] bg-purple-500/15 text-purple-600 dark:text-purple-400 font-bold"
                        x-text="formatPinAge(activeInspectorPin)"></span>
                </template>
              </div>

              <!-- Google Indexing Status Badge -->
              <template x-if="dossierData?.is_indexed_google !== undefined">
                <div class="flex items-center space-x-1 px-2.5 py-1 rounded-xl text-[11px] font-bold border"
                     :class="dossierData.is_indexed_google ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30'">
                  <span x-text="dossierData.is_indexed_google ? '✓ Google Indexed' : '⚠️ Google Noindex'"></span>
                </div>
              </template>

              <!-- Repin Lineage Badge -->
              <template x-if="dossierData?.is_repin">
                <div class="flex items-center space-x-1 px-2.5 py-1 rounded-xl text-[11px] font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30">
                  <span x-text="'Repin' + (dossierData?.origin_pinner?.username ? ' (@' + dossierData.origin_pinner.username + ')' : '')"></span>
                </div>
              </template>
            </div>
          </div>

          <!-- PINTEREST SEO ALT TEXT CONTAINER (Image 2 Exact Parity) -->
          <div class="p-4 rounded-2xl bg-slate-100/90 dark:bg-[#070d18] border border-slate-200 dark:border-slate-800 space-y-2">
            <div class="flex items-center justify-between">
              <div class="flex items-center space-x-1.5">
                <i data-lucide="file-text" class="w-4 h-4 text-amber-500"></i>
                <h4 class="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 font-mono">Pinterest SEO Alt Text</h4>
                <span class="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400">Official Context</span>
              </div>
              <button @click="copyToClipboard(dossierData?.seo_alt_text || activeInspectorPin?.seo_alt_text || '', 'Copied SEO Alt Text!')"
                      class="px-2 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 text-[10px] font-bold transition flex items-center space-x-1 cursor-pointer">
                <i data-lucide="copy" class="w-3 h-3"></i>
                <span>Copy Alt Text</span>
              </button>
            </div>

            <p class="text-xs text-slate-800 dark:text-slate-200 leading-relaxed font-sans bg-white dark:bg-slate-900/60 p-3 rounded-xl border border-slate-200/80 dark:border-slate-800/80"
               x-text="dossierData?.seo_alt_text || activeInspectorPin?.seo_alt_text || (isDossierLoading ? 'Extracting official Pinterest SEO Alt text...' : 'No SEO Alt Text detected for this creative.')"></p>
          </div>

          <!-- PIN CLOSEUP BODY DESCRIPTION CONTAINER -->
          <div class="p-4 rounded-2xl bg-slate-100/90 dark:bg-[#070d18] border border-slate-200 dark:border-slate-800 space-y-2">
            <div class="flex items-center justify-between">
              <div class="flex items-center space-x-1.5">
                <i data-lucide="align-left" class="w-4 h-4 text-emerald-500"></i>
                <h4 class="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 font-mono">Pin Closeup Description</h4>
                <span class="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">Full Body</span>
              </div>
              <button @click="copyToClipboard(dossierData?.description || activeInspectorPin?.metadata?.description || '', 'Copied Pin Description!')"
                      class="px-2 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold transition flex items-center space-x-1 cursor-pointer">
                <i data-lucide="copy" class="w-3 h-3"></i>
                <span>Copy Description</span>
              </button>
            </div>

            <p class="text-xs text-slate-800 dark:text-slate-200 leading-relaxed font-sans bg-white dark:bg-slate-900/60 p-3 rounded-xl border border-slate-200/80 dark:border-slate-800/80"
               x-text="dossierData?.description || activeInspectorPin?.metadata?.description || (isDossierLoading ? 'Extracting pin closeup body...' : 'No description captured for this creative.')"></p>
          </div>

          <!-- ANNOTATIONS & SEO KEYWORDS (Linked Ideas - Image 2 Exact Parity) -->
          <div class="space-y-2.5">
            <div class="flex items-center justify-between">
              <div class="flex items-center space-x-1.5">
                <i data-lucide="tag" class="w-4 h-4 text-purple-500"></i>
                <h4 class="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 font-mono">Annotations & SEO Keywords</h4>
                <span class="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-purple-500/15 text-purple-600 dark:text-purple-400">CV Taxonomy</span>
              </div>
              <button @click="copyAllInspectorTags()"
                      class="px-2.5 py-1 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 text-[11px] font-bold transition flex items-center space-x-1 cursor-pointer">
                <i data-lucide="copy" class="w-3 h-3"></i>
                <span>Copy All</span>
              </button>
            </div>

            <div class="flex flex-wrap gap-1.5">
              <template x-for="tag in getInspectorAnnotations()" :key="tag">
                <button @click="copyToClipboard(tag, 'Copied keyword: ' + tag)"
                        class="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:text-purple-500 transition cursor-pointer flex items-center space-x-1"
                        :title="'Click to copy keyword: ' + tag">
                  <span x-text="tag"></span>
                  <i data-lucide="copy" class="w-2.5 h-2.5 opacity-40"></i>
                </button>
              </template>
            </div>
          </div>

          <!-- 6 KPI CARDS (Image 2 Exact Parity) -->
          <div class="space-y-2">
            <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">Creative Performance KPIs</h4>
            <div class="grid grid-cols-3 sm:grid-cols-6 gap-2">
              
              <!-- Total Saves -->
              <div class="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-center space-y-0.5">
                <span class="text-[10px] font-bold text-slate-400 block">Total Saves</span>
                <span class="text-sm sm:text-base font-black text-rose-600 dark:text-rose-400 font-mono block"
                      x-text="formatNumber(dossierData?.kpis?.total_saves ?? activeInspectorPin?.save_count ?? activeInspectorPin?.metadata?.raw_saves ?? 0)"></span>
                <template x-if="dossierData?.deltas?.saves_24h">
                  <span class="text-[9px] font-bold text-emerald-500 font-mono block" x-text="'+' + dossierData.deltas.saves_24h + ' 24h'"></span>
                </template>
              </div>

              <!-- Repins -->
              <div class="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-center space-y-0.5">
                <span class="text-[10px] font-bold text-slate-400 block">Repins</span>
                <span class="text-sm sm:text-base font-black text-blue-600 dark:text-blue-400 font-mono block"
                      x-text="formatNumber(dossierData?.kpis?.repins ?? activeInspectorPin?.repin_count ?? 0)"></span>
                <template x-if="dossierData?.deltas?.repins_24h">
                  <span class="text-[9px] font-bold text-emerald-500 font-mono block" x-text="'+' + dossierData.deltas.repins_24h + ' 24h'"></span>
                </template>
              </div>

              <!-- Comments -->
              <div class="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-center space-y-0.5">
                <span class="text-[10px] font-bold text-slate-400 block">Comments</span>
                <span class="text-sm sm:text-base font-black text-slate-900 dark:text-white font-mono block"
                      x-text="dossierData?.kpis?.comments ?? activeInspectorPin?.comment_count ?? 0"></span>
              </div>

              <!-- Shares -->
              <div class="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-center space-y-0.5">
                <span class="text-[10px] font-bold text-slate-400 block">Shares</span>
                <span class="text-sm sm:text-base font-black text-slate-900 dark:text-white font-mono block"
                      x-text="formatNumber(dossierData?.kpis?.shares ?? activeInspectorPin?.share_count ?? 0)"></span>
                <template x-if="dossierData?.deltas?.shares_24h">
                  <span class="text-[9px] font-bold text-emerald-500 font-mono block" x-text="'+' + dossierData.deltas.shares_24h + ' 24h'"></span>
                </template>
              </div>

              <!-- Velocity -->
              <div class="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-center space-y-0.5">
                <span class="text-[10px] font-bold text-slate-400 block">Velocity</span>
                <span class="text-sm sm:text-base font-black text-emerald-600 dark:text-emerald-400 font-mono block"
                      x-text="(Number(dossierData?.kpis?.velocity ?? activeInspectorPin?.daily_save_velocity ?? 0) > 0 ? '+' : '') + (dossierData?.kpis?.velocity ?? activeInspectorPin?.daily_save_velocity ?? 0) + ' /d'"></span>
              </div>

              <!-- Reactions -->
              <div class="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-center space-y-0.5">
                <span class="text-[10px] font-bold text-slate-400 block">Reactions</span>
                <span class="text-sm sm:text-base font-black text-rose-500 font-mono block"
                      x-text="formatNumber(dossierData?.kpis?.reactions ?? activeInspectorPin?.reaction_count ?? activeInspectorPin?.metadata?.reactions ?? 0)"></span>
                <template x-if="dossierData?.deltas?.reactions_24h">
                  <span class="text-[9px] font-bold text-emerald-500 font-mono block" x-text="'+' + dossierData.deltas.reactions_24h + ' 24h'"></span>
                </template>
              </div>

            </div>
          </div>

          <!-- PERFORMANCE TRAJECTORY DUAL-LINE SVG (Image 2 Exact Parity) -->
          <div class="p-5 rounded-2xl bg-slate-100/80 dark:bg-[#070d18] border border-slate-200 dark:border-slate-800 space-y-4">
            
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
              <div>
                <div class="flex items-center space-x-2">
                  <i data-lucide="trending-up" class="w-4 h-4 text-emerald-500"></i>
                  <h4 class="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white font-mono">Performance Trajectory</h4>
                </div>
                <p class="text-[11px] text-slate-400">Dual-axis momentum tracking (Saves & Repins over time)</p>
              </div>

              <!-- Range Switcher (7d | 14d | 30d | All) -->
              <div class="flex items-center p-1 rounded-xl bg-slate-200 dark:bg-slate-900 gap-1 self-start sm:self-auto">
                <button @click="changeTrajectoryRange('7d')"
                        class="px-2 py-0.5 rounded-lg text-[10px] font-bold font-mono transition cursor-pointer"
                        :class="trajectoryRange === '7d' ? 'bg-white dark:bg-slate-800 text-emerald-500 shadow-xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'">
                  7d
                </button>
                <button @click="changeTrajectoryRange('14d')"
                        class="px-2 py-0.5 rounded-lg text-[10px] font-bold font-mono transition cursor-pointer"
                        :class="trajectoryRange === '14d' ? 'bg-white dark:bg-slate-800 text-emerald-500 shadow-xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'">
                  14d
                </button>
                <button @click="changeTrajectoryRange('30d')"
                        class="px-2 py-0.5 rounded-lg text-[10px] font-bold font-mono transition cursor-pointer"
                        :class="trajectoryRange === '30d' ? 'bg-white dark:bg-slate-800 text-emerald-500 shadow-xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'">
                  30d
                </button>
                <button @click="changeTrajectoryRange('all')"
                        class="px-2 py-0.5 rounded-lg text-[10px] font-bold font-mono transition cursor-pointer"
                        :class="trajectoryRange === 'all' ? 'bg-white dark:bg-slate-800 text-emerald-500 shadow-xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'">
                  All
                </button>
              </div>
            </div>

            <!-- Trajectory Chart SVG Area -->
            <div class="relative bg-white dark:bg-slate-900/60 p-4 rounded-xl border border-slate-200/80 dark:border-slate-800/80 min-h-[220px] flex items-center justify-center">
              
              <template x-if="isTrajectoryLoading">
                <div class="py-10 text-center space-y-2">
                  <i data-lucide="loader-2" class="w-6 h-6 animate-spin text-emerald-500 mx-auto"></i>
                  <span class="text-xs text-slate-400 font-mono">Calculating trajectory deltas...</span>
                </div>
              </template>

              <template x-if="!isTrajectoryLoading && (!trajectoryData?.snapshots || trajectoryData.snapshots.length === 0)">
                <div class="py-10 text-center text-xs text-slate-400 font-mono">
                  No snapshot history recorded yet for this pin.
                </div>
              </template>

              <!-- N=1 Single Baseline Dot -->
              <template x-if="!isTrajectoryLoading && trajectoryData?.snapshots && trajectoryData.snapshots.length === 1">
                <div class="text-center py-6 space-y-2">
                  <div class="w-4 h-4 rounded-full bg-emerald-500 mx-auto shadow-md shadow-emerald-500/30"></div>
                  <p class="text-xs font-bold text-slate-700 dark:text-slate-300 font-mono">Baseline Recorded</p>
                  <p class="text-[11px] text-slate-400 font-mono">Growth plots will render on the next scheduled crawl cycle.</p>
                </div>
              </template>

              <!-- N >= 2 Dual-Axis Normalized SVG Chart -->
              <template x-if="!isTrajectoryLoading && trajectoryData?.snapshots && trajectoryData.snapshots.length >= 2">
                <div class="w-full space-y-2">
                  <div class="flex items-center justify-between text-[10px] font-mono px-1">
                    <span class="text-rose-500 font-bold">● Saves (Red Scale: 0 to <span x-text="formatNumber(getTrajectoryDualSvg(trajectoryData.snapshots, 600, 200).savesMax)"></span>)</span>
                    <span class="text-blue-500 font-bold">● Repins (Blue Scale: 0 to <span x-text="formatNumber(getTrajectoryDualSvg(trajectoryData.snapshots, 600, 200).repinsMax)"></span>)</span>
                  </div>

                  <svg class="w-full h-48 overflow-visible" viewBox="0 0 600 200" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="savesTrajectoryGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="#f43f5e" stop-opacity="0.35"/>
                        <stop offset="100%" stop-color="#f43f5e" stop-opacity="0.0"/>
                      </linearGradient>
                    </defs>

                    <!-- Gridlines -->
                    <line x1="0" y1="40" x2="600" y2="40" stroke="#334155" stroke-dasharray="3" stroke-width="0.8" opacity="0.3"/>
                    <line x1="0" y1="100" x2="600" y2="100" stroke="#334155" stroke-dasharray="3" stroke-width="0.8" opacity="0.3"/>
                    <line x1="0" y1="160" x2="600" y2="160" stroke="#334155" stroke-dasharray="3" stroke-width="0.8" opacity="0.3"/>

                    <!-- Saves Area & Line (Red) -->
                    <path :d="getTrajectoryDualSvg(trajectoryData.snapshots, 600, 200).savesArea" fill="url(#savesTrajectoryGrad)"/>
                    <path :d="getTrajectoryDualSvg(trajectoryData.snapshots, 600, 200).savesLine" fill="none" stroke="#f43f5e" stroke-width="2.5" stroke-linecap="round"/>

                    <!-- Repins Line (Blue) -->
                    <path :d="getTrajectoryDualSvg(trajectoryData.snapshots, 600, 200).repinsLine" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round"/>
                  </svg>
                </div>
              </template>

            </div>

            <!-- Historical Net Growth Summary Table (Image 2 Parity) -->
            <template x-if="trajectoryData?.net_growth">
              <div class="p-3 rounded-xl bg-white dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800/80">
                <div class="flex items-center justify-between text-xs font-mono">
                  <span class="font-bold text-slate-700 dark:text-slate-300">Σ Total Net Growth:</span>
                  <div class="flex items-center space-x-3 text-[11px]">
                    <span :class="trajectoryData.net_growth.saves >= 0 ? 'text-rose-500 font-bold' : 'text-rose-400/80 font-bold'"
                          x-text="(trajectoryData.net_growth.saves >= 0 ? '+' : '-') + formatNumber(Math.abs(trajectoryData.net_growth.saves)) + ' Saves'"></span>
                    <span :class="trajectoryData.net_growth.repins >= 0 ? 'text-blue-500 font-bold' : 'text-blue-400/80 font-bold'"
                          x-text="(trajectoryData.net_growth.repins >= 0 ? '+' : '-') + formatNumber(Math.abs(trajectoryData.net_growth.repins)) + ' Repins'"></span>
                    <span class="text-slate-400" x-text="(trajectoryData.net_growth.comments >= 0 ? '+' : '-') + Math.abs(trajectoryData.net_growth.comments) + ' Comments'"></span>
                    <span class="text-slate-400" x-text="(trajectoryData.net_growth.shares >= 0 ? '+' : '-') + Math.abs(trajectoryData.net_growth.shares) + ' Shares'"></span>
                  </div>
                </div>
              </div>
            </template>

          </div>

          <!-- Bottom Visual Lens Launch -->
          <div class="pt-2">
            <button @click="openVisualLens(activeInspectorPin)"
                    class="w-full py-3 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-black uppercase tracking-wider transition flex items-center justify-center space-x-2 shadow-md shadow-purple-950/20 cursor-pointer">
              <i data-lucide="camera" class="w-4 h-4"></i>
              <span>Launch Visual Similarity Lens (Scan Clones)</span>
            </button>
          </div>

        </div>

      </div>
    </div>
  </div>

  <!-- Engine & Crawl Depth Settings Modal (Global Scope) -->
  <div x-show="isSettingsModalOpen" x-cloak class="relative z-50">
    <div class="fixed inset-0 bg-slate-950/75 backdrop-blur-xs" @click="isSettingsModalOpen = false"></div>
    <div class="fixed inset-0 flex items-center justify-center p-4">
      <div class="w-full max-w-xl bg-white dark:bg-[#0c1322] border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
        
        <!-- Header -->
        <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div class="flex items-center space-x-3">
            <div class="w-9 h-9 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-violet-600/20">
              <i data-lucide="sliders" class="w-4 h-4"></i>
            </div>
            <div>
              <h3 class="text-sm font-black text-slate-900 dark:text-white flex items-center space-x-2">
                <span>Crawl Intelligence & Depth Settings</span>
                <template x-if="settingsTargetKeyword">
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-mono bg-violet-500/10 text-violet-500 border border-violet-500/30" x-text="settingsTargetKeyword.keyword"></span>
                </template>
              </h3>
              <p class="text-[11px] text-slate-400 mt-0.5">Configure SERP Harvest Horizon, Telemetry Mode, and Emerging Breakout Criteria</p>
            </div>
          </div>
          <button @click="isSettingsModalOpen = false" class="p-1 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition cursor-pointer">
            <i data-lucide="x" class="w-4 h-4"></i>
          </button>
        </div>

        <!-- Section 1: Live SERP Search Discovery (Stage 0/1 Ingestion Toggle) -->
        <div class="space-y-3 p-3.5 rounded-2xl border"
             :class="settingsEnableSerpHarvest ? 'bg-indigo-500/5 border-indigo-500/20' : 'bg-amber-500/5 border-amber-500/20'">
          <div class="flex items-center justify-between gap-2">
            <div>
              <div class="flex items-center space-x-2">
                <i data-lucide="search" class="w-4 h-4 text-indigo-500"></i>
                <label class="text-xs font-black text-slate-900 dark:text-white uppercase font-mono">
                  1. Live SERP Search Discovery (Stage 0/1 Ingestion)
                </label>
              </div>
              <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Harvests new live Pinterest search rankings. Toggle OFF to run in fast <b>Audit-Only Mode</b> (bypasses Pinterest search and directly deep-inspects existing catalog & vault pins).
              </p>
            </div>
            <label class="relative inline-flex items-center cursor-pointer shrink-0">
              <input type="checkbox" x-model="settingsEnableSerpHarvest" class="sr-only peer">
              <div class="w-11 h-6 bg-slate-300 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
            </label>
          </div>

          <!-- Active SERP Harvest Controls (Visible when Harvest is ON) -->
          <div x-show="settingsEnableSerpHarvest" class="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div class="flex items-center justify-between">
              <span class="text-[11px] font-bold text-slate-700 dark:text-slate-300">Live Search Harvest Quota (MAX_SERP_PINS)</span>
              <span class="text-xs font-mono font-bold text-indigo-500" x-text="'~' + (settingsCrawlPages * 25) + ' Pins (' + settingsCrawlPages + ' Pages)'"></span>
            </div>

            <!-- Depth Presets Grid -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button type="button" @click="settingsCrawlPages = 2; settingsMaxPins = 50; settingsMaxSerpPins = 50"
                      class="p-2.5 rounded-xl border text-left transition cursor-pointer"
                      :class="settingsCrawlPages === 2 ? 'bg-indigo-500/10 border-indigo-500 text-indigo-600 dark:text-indigo-400 font-bold' : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'">
                <div class="text-xs font-black flex items-center justify-between">
                  <span>2 Pages</span>
                  <span class="text-[9px] px-1 rounded bg-emerald-500/20 text-emerald-500">Rec</span>
                </div>
                <div class="text-[10px] opacity-75">~50 Pins (Elite 50)</div>
              </button>
              <button type="button" @click="settingsCrawlPages = 4; settingsMaxPins = 100; settingsMaxSerpPins = 100"
                      class="p-2.5 rounded-xl border text-left transition cursor-pointer"
                      :class="settingsCrawlPages === 4 ? 'bg-indigo-500/10 border-indigo-500 text-indigo-600 dark:text-indigo-400 font-bold' : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'">
                <div class="text-xs font-black">4 Pages</div>
                <div class="text-[10px] opacity-75">~100 Pins (Fast)</div>
              </button>
              <button type="button" @click="settingsCrawlPages = 10; settingsMaxPins = 250; settingsMaxSerpPins = 250"
                      class="p-2.5 rounded-xl border text-left transition cursor-pointer"
                      :class="settingsCrawlPages === 10 ? 'bg-indigo-500/10 border-indigo-500 text-indigo-600 dark:text-indigo-400 font-bold' : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'">
                <div class="text-xs font-black">10 Pages</div>
                <div class="text-[10px] opacity-75">~250 Pins (Deep)</div>
              </button>
              <button type="button" @click="settingsCrawlPages = 20; settingsMaxPins = 500; settingsMaxSerpPins = 500"
                      class="p-2.5 rounded-xl border text-left transition cursor-pointer"
                      :class="settingsCrawlPages === 20 ? 'bg-indigo-500/10 border-indigo-500 text-indigo-600 dark:text-indigo-400 font-bold' : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'">
                <div class="text-xs font-black">20 Pages</div>
                <div class="text-[10px] opacity-75">~500 Pins (Wide)</div>
              </button>
            </div>

            <!-- Custom Pages Slider / Input -->
            <div class="flex items-center space-x-3 pt-1">
              <input type="range" min="2" max="35" step="1" x-model.number="settingsCrawlPages"
                     @input="settingsMaxPins = settingsCrawlPages * 25; settingsMaxSerpPins = settingsCrawlPages * 25"
                     class="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-600">
              <span class="text-xs font-mono font-bold text-slate-700 dark:text-slate-300 w-16 text-right" x-text="settingsCrawlPages + ' pages'"></span>
            </div>
          </div>

          <!-- Audit-Only Mode Notice (Visible when Harvest is OFF) -->
          <div x-show="!settingsEnableSerpHarvest" class="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-300 flex items-start space-x-2">
            <i data-lucide="zap" class="w-4 h-4 shrink-0 mt-0.5 text-amber-500"></i>
            <div>
              <span class="font-bold">⚡ Audit-Only Mode Active:</span> Live Pinterest search will be bypassed entirely. Crawlers will skip Stage 0/1 SERP scraping to conserve rate limits and immediately proceed to deep closeup telemetry and velocity measurement on stored catalog & vault pins.
            </div>
          </div>
        </div>

        <!-- Section 2: Catalog & Vault Deep Inspection Cap (Stage 2 Deep Telemetry) -->
        <div class="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          <div class="flex items-center justify-between">
            <label class="text-xs font-black text-slate-900 dark:text-white flex items-center space-x-1.5 uppercase font-mono">
              <span>2. Catalog & Vault Deep Inspection Cap (MAX_CATALOG_INSPECT)</span>
            </label>
            <span class="text-xs font-mono font-bold text-violet-500"
                  x-text="settingsMaxCatalogInspect === 0 ? 'Unlimited (100% Full Catalog)' : (settingsMaxCatalogInspect + ' Pins Cap')"></span>
          </div>
          <p class="text-[11px] text-slate-500 dark:text-slate-400">
            Controls how many total pins from your historical catalog and Displaced Vault receive deep closeup inspection and 24h save velocity measurement. Set to <b>0 for Unlimited</b> (audits 100% of all discovered pins across parallel runners).
          </p>

          <!-- Inspection Cap Presets Grid -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <button type="button" @click="settingsMaxCatalogInspect = 0"
                    class="p-2.5 rounded-xl border text-left transition cursor-pointer"
                    :class="settingsMaxCatalogInspect === 0 ? 'bg-violet-500/10 border-violet-500 text-violet-600 dark:text-violet-400 font-bold' : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'">
              <div class="text-xs font-black flex items-center justify-between">
                <span>0 (All Pins)</span>
                <span class="text-[9px] px-1 rounded bg-emerald-500/20 text-emerald-500">Rec</span>
              </div>
              <div class="text-[10px] opacity-75">100% Full Catalog</div>
            </button>
            <button type="button" @click="settingsMaxCatalogInspect = 250"
                    class="p-2.5 rounded-xl border text-left transition cursor-pointer"
                    :class="settingsMaxCatalogInspect === 250 ? 'bg-violet-500/10 border-violet-500 text-violet-600 dark:text-violet-400 font-bold' : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'">
              <div class="text-xs font-black">250 Pins</div>
              <div class="text-[10px] opacity-75">Top SERP Cap</div>
            </button>
            <button type="button" @click="settingsMaxCatalogInspect = 500"
                    class="p-2.5 rounded-xl border text-left transition cursor-pointer"
                    :class="settingsMaxCatalogInspect === 500 ? 'bg-violet-500/10 border-violet-500 text-violet-600 dark:text-violet-400 font-bold' : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'">
              <div class="text-xs font-black">500 Pins</div>
              <div class="text-[10px] opacity-75">Extended Depth</div>
            </button>
            <button type="button" @click="settingsMaxCatalogInspect = 1000"
                    class="p-2.5 rounded-xl border text-left transition cursor-pointer"
                    :class="settingsMaxCatalogInspect === 1000 ? 'bg-violet-500/10 border-violet-500 text-violet-600 dark:text-violet-400 font-bold' : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'">
              <div class="text-xs font-black">1000 Pins</div>
              <div class="text-[10px] opacity-75">High Quota Fleet</div>
            </button>
          </div>

          <!-- Custom Number Input -->
          <div class="flex items-center space-x-3 pt-1">
            <label class="text-[11px] font-bold text-slate-600 dark:text-slate-400 whitespace-nowrap">Custom Inspection Cap:</label>
            <input type="number" min="0" max="10000" step="50" x-model.number="settingsMaxCatalogInspect"
                   class="w-32 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-900 dark:text-white font-mono">
            <span class="text-[11px] text-slate-400">(0 = Unlimited, inspects entire keyword catalog)</span>
          </div>
        </div>

        <!-- Section 3: Crawl Scope & Target Population -->
        <div class="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          <label class="text-xs font-black text-slate-900 dark:text-white uppercase font-mono block">
            3. Target Crawl Scope
          </label>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label class="flex items-start space-x-3 p-3 rounded-2xl border cursor-pointer transition"
                   :class="settingsCrawlScope === 'all_pins' ? 'bg-violet-500/10 border-violet-500/40' : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800'">
              <input type="radio" value="all_pins" x-model="settingsCrawlScope" class="mt-0.5 text-violet-600">
              <div class="text-xs">
                <div class="font-bold text-slate-900 dark:text-white flex items-center space-x-1">
                  <span>🏛️ Unified Full Catalog</span>
                  <span class="text-[9px] px-1 rounded bg-emerald-500/20 text-emerald-500 font-bold">Recommended</span>
                </div>
                <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Audits active ranking pins plus all displaced historical pins in the vault (guarantees zero missing pins).</p>
              </div>
            </label>
            <label class="flex items-start space-x-3 p-3 rounded-2xl border cursor-pointer transition"
                   :class="settingsCrawlScope === 'active_serp' ? 'bg-indigo-500/10 border-indigo-500/40' : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800'">
              <input type="radio" value="active_serp" x-model="settingsCrawlScope" class="mt-0.5 text-indigo-600">
              <div class="text-xs">
                <div class="font-bold text-slate-900 dark:text-white">🎯 Active SERP Only</div>
                <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Restricts inspection strictly to organic pins currently ranking within the active SERP reach.</p>
              </div>
            </label>
          </div>
        </div>

        <!-- Section 4: Inspection & Telemetry Mode -->
        <div class="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          <label class="text-xs font-black text-slate-900 dark:text-white uppercase font-mono block">
            4. Inspection & Telemetry Mode
          </label>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label class="flex items-start space-x-3 p-3 rounded-2xl border cursor-pointer transition"
                   :class="settingsInspectionMode === 'full_catalog' ? 'bg-violet-500/10 border-violet-500/40' : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800'">
              <input type="radio" value="full_catalog" x-model="settingsInspectionMode" class="mt-0.5 text-violet-600">
              <div class="text-xs">
                <div class="font-bold text-slate-900 dark:text-white flex items-center space-x-1">
                  <span>💯 Full Catalog Deep Scan</span>
                  <span class="text-[9px] px-1 rounded bg-violet-500/20 text-violet-500 font-bold">Default</span>
                </div>
                <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">100% closeup telemetry across all discovered pins distributed over 20 parallel runner VMs.</p>
              </div>
            </label>
            <label class="flex items-start space-x-3 p-3 rounded-2xl border cursor-pointer transition"
                   :class="settingsInspectionMode === 'smart_breakout' ? 'bg-emerald-500/10 border-emerald-500/40' : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800'">
              <input type="radio" value="smart_breakout" x-model="settingsInspectionMode" class="mt-0.5 text-emerald-600">
              <div class="text-xs">
                <div class="font-bold text-slate-900 dark:text-white">🚀 Smart Breakout Filter</div>
                <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Top 50 + auto-detect & closeup inspect all emerging breakout pins in deep pages.</p>
              </div>
            </label>
          </div>
        </div>

        <!-- Section 5: Breakout Hunter Criteria -->
        <div class="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          <label class="text-xs font-black text-slate-900 dark:text-white uppercase font-mono block">
            5. Breakout Opportunity Predictor
          </label>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-[10px] font-bold text-slate-500 uppercase font-mono block mb-1">Max Pin Age (Days)</label>
              <input type="number" min="3" max="60" x-model.number="settingsMaxPinAgeDays"
                     class="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-900 dark:text-white">
            </div>
            <div>
              <label class="text-[10px] font-bold text-slate-500 uppercase font-mono block mb-1">Min Daily Velocity (Saves/Day)</label>
              <input type="number" min="0.5" max="50" step="0.5" x-model.number="settingsMinVelocity"
                     class="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-900 dark:text-white">
            </div>
          </div>
        </div>

        <!-- Section 6: Filtration & Quality Exclusions -->
        <div class="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          <div class="flex items-center justify-between">
            <label class="text-xs font-black text-slate-900 dark:text-white uppercase font-mono block">
              6. Data Quality & Filtration Exclusions
            </label>
            <span class="text-[10px] text-slate-500 font-mono">Organic Telemetry Rules</span>
          </div>
          <div class="space-y-2">
            <label class="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 cursor-pointer">
              <div class="text-xs pr-2">
                <div class="font-bold text-slate-900 dark:text-white flex items-center gap-1.5 flex-wrap">
                  <span>🚫 Exclude Promoted & Sponsored Ads</span>
                  <span class="text-[9px] px-1 rounded bg-amber-500/20 text-amber-500 font-mono font-bold">is_promoted</span>
                </div>
                <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Filters out paid advertisements to track 100% authentic organic rankings.</p>
              </div>
              <input type="checkbox" x-model="settingsExcludePromoted" class="w-4 h-4 text-violet-600 rounded cursor-pointer accent-violet-600">
            </label>

            <label class="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 cursor-pointer">
              <div class="text-xs pr-2">
                <div class="font-bold text-slate-900 dark:text-white flex items-center gap-1.5 flex-wrap">
                  <span>📋 Exclude Boards & Suggestion Cards</span>
                  <span class="text-[9px] px-1 rounded bg-slate-500/20 text-slate-400 font-mono font-bold">board / Related Interests</span>
                </div>
                <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Filters carousel containers and search suggestions to focus on pure pins.</p>
              </div>
              <input type="checkbox" x-model="settingsExcludeBoardsAndSuggestions" class="w-4 h-4 text-violet-600 rounded cursor-pointer accent-violet-600">
            </label>

            <label class="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 cursor-pointer">
              <div class="text-xs pr-2">
                <div class="font-bold text-slate-900 dark:text-white flex items-center gap-1.5 flex-wrap">
                  <span>🪦 Exclude Ignored / Tombstoned Pins</span>
                  <span class="text-[9px] px-1 rounded bg-rose-500/20 text-rose-400 font-mono font-bold">keyword_ignored_pins</span>
                </div>
                <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Honors the custom tombstone registry so ignored pins never re-surface.</p>
              </div>
              <input type="checkbox" x-model="settingsExcludeIgnoredPins" class="w-4 h-4 text-violet-600 rounded cursor-pointer accent-violet-600">
            </label>
          </div>
        </div>

        <!-- Scope Target Selection -->
        <div class="p-3 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
          <span class="text-slate-600 dark:text-slate-400 font-medium">Apply as global default to all keywords</span>
          <label class="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" x-model="settingsApplyGlobal" class="sr-only peer">
            <div class="w-9 h-5 bg-slate-300 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
          </label>
        </div>

        <!-- Footer Actions -->
        <div class="flex items-center justify-end space-x-2 pt-2">
          <button type="button" @click="isSettingsModalOpen = false" class="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer">
            Cancel
          </button>
          <button type="button" @click="saveSettings()" :disabled="settingsLoading"
                  class="px-5 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white flex items-center space-x-1.5 shadow-md shadow-indigo-950/20 active:scale-95 disabled:opacity-50 cursor-pointer">
            <i data-lucide="check" class="w-3.5 h-3.5" :class="settingsLoading ? 'animate-spin' : ''"></i>
            <span x-text="settingsLoading ? 'Saving...' : '💾 Save & Apply Settings'"></span>
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- VISUAL SIMILARITY LENS MODAL (v3_visual_search) -->
  <div x-show="isVisualLensModalOpen" x-cloak
       x-transition:enter="transition ease-out duration-300"
       x-transition:enter-start="opacity-0"
       x-transition:enter-end="opacity-100"
       x-transition:leave="transition ease-in duration-200"
       x-transition:leave-start="opacity-100"
       x-transition:leave-end="opacity-0"
       @keydown.escape.window="closeVisualLens()"
       class="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
    
    <div @click.away="closeVisualLens()"
         class="bg-white dark:bg-[#0c1322] border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden transition-all">
      
        <!-- Modal Header -->
        <div class="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/40">
        <div class="flex items-center space-x-3">
          <div class="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-500 text-white flex items-center justify-center shadow-lg shadow-purple-600/20 shrink-0">
            <i data-lucide="camera" class="w-5 h-5"></i>
          </div>
          <div>
            <div class="flex items-center space-x-2">
              <h3 class="text-base font-black text-slate-900 dark:text-white">Pinterest Visual Similarity Lens</h3>
              <span class="px-2 py-0.5 text-[10px] font-bold uppercase rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30 font-mono">v3_visual_search</span>
            </div>
            <p class="text-[11px] text-slate-500 dark:text-slate-400">Reverse-engineers visual duplicates, competitor clones, and high-velocity templates</p>
          </div>
        </div>
        
        <button @click="closeVisualLens()" class="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition">
          <i data-lucide="x" class="w-5 h-5"></i>
        </button>
      </div>

      <!-- Seed Pin Context -->
      <template x-if="visualLensPin">
        <div class="p-4 bg-purple-500/5 border-b border-slate-200 dark:border-slate-800/80 flex items-center justify-between gap-4">
          <div class="flex items-center space-x-3 min-w-0">
            <template x-if="visualLensPin.image_url">
              <img :src="visualLensPin.image_url" class="w-10 h-14 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0 shadow-xs">
            </template>
            <div class="min-w-0">
              <div class="flex items-center space-x-2">
                <span class="text-[10px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 font-mono">Target Seed Pin</span>
                <span class="text-[10px] text-slate-400 font-mono" x-text="'ID: ' + visualLensPin.pin_id"></span>
              </div>
              <h4 class="text-xs font-bold text-slate-900 dark:text-white truncate pt-0.5" x-text="visualLensPin.title || 'Untitled Pin'"></h4>
              <div class="flex items-center space-x-2 text-[10px] text-slate-500 font-mono">
                <span x-text="visualLensPin.domain || 'Direct Pin'"></span>
                <span>•</span>
                <span x-text="formatNumber(visualLensPin.save_count) + ' saves'"></span>
              </div>
            </div>
          </div>

          <a :href="'https://www.pinterest.com/pin/' + visualLensPin.pin_id + '/'" target="_blank"
             class="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition flex items-center space-x-1.5 shadow-sm active:scale-95 shrink-0">
            <span>View Seed Pin</span>
            <i data-lucide="external-link" class="w-3 h-3"></i>
          </a>
        </div>
      </template>

      <!-- Modal Body -->
      <div class="p-5 flex-1 overflow-y-auto space-y-4">
        
        <template x-if="isVisualLensLoading">
          <div class="py-12 text-center space-y-3">
            <div class="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-500 mx-auto flex items-center justify-center">
              <i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i>
            </div>
            <p class="text-xs font-semibold text-slate-600 dark:text-slate-300">Scanning Pinterest visual graph for candidate clones...</p>
            <p class="text-[11px] text-slate-400 font-mono">Analyzing visual embeddings and domain parity</p>
          </div>
        </template>

        <template x-if="!isVisualLensLoading && visualLensError">
          <div class="p-6 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-center space-y-2">
            <i data-lucide="alert-triangle" class="w-6 h-6 text-rose-500 mx-auto"></i>
            <p class="text-xs font-bold text-rose-600 dark:text-rose-400" x-text="visualLensError"></p>
            <button @click="openVisualLens(visualLensPin)" class="px-3 py-1.5 rounded-xl bg-rose-500 text-white text-xs font-bold hover:bg-rose-600 transition">
              Retry Visual Search
            </button>
          </div>
        </template>

        <template x-if="!isVisualLensLoading && !visualLensError && visualLensResults.length === 0">
          <div class="py-12 text-center space-y-2">
            <i data-lucide="search-x" class="w-8 h-8 text-slate-400 mx-auto"></i>
            <p class="text-xs font-bold text-slate-700 dark:text-slate-300">No Direct Visual Clones Found</p>
            <p class="text-[11px] text-slate-500">This pin appears visually unique with no duplicate template matches detected in the top clusters.</p>
          </div>
        </template>

        <template x-if="!isVisualLensLoading && !visualLensError && visualLensResults.length > 0">
          <div class="space-y-3">
            <div class="flex items-center justify-between text-xs text-slate-500 pb-2 border-b border-slate-100 dark:border-slate-800">
              <span class="font-bold text-slate-700 dark:text-slate-300" x-text="visualLensResults.length + ' Visual Matches Discovered'"></span>
              <span class="text-[11px] font-mono">Ranked by Visual Proximity</span>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <template x-for="match in visualLensResults" :key="match.pin_id">
                <div class="p-3.5 rounded-2xl border transition flex items-start space-x-3.5"
                     :class="match.similarity_type === 'DOMAIN_CLONE' ? 'bg-rose-500/5 border-rose-500/30 dark:bg-rose-950/15' : 'bg-slate-50/80 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800'">
                  <template x-if="match.image_url">
                    <img :src="match.image_url" class="w-14 h-20 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0 shadow-sm hover:scale-105 transition">
                  </template>
                  <div class="min-w-0 flex-1 space-y-1.5">
                    <div class="flex items-center justify-between gap-1">
                      <span class="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider"
                            :class="match.similarity_type === 'DOMAIN_CLONE' ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/40' : (match.similarity_type === 'TEMPLATE_CLONE' ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/40' : 'bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border border-cyan-500/40')"
                            x-text="match.similarity_badge || match.similarity_type"></span>
                      <span class="text-[10px] font-mono font-bold text-slate-700 dark:text-slate-300" x-text="formatNumber(match.save_count) + ' saves'"></span>
                    </div>

                    <a :href="'https://www.pinterest.com/pin/' + match.pin_id + '/'" target="_blank"
                       class="text-xs font-bold text-slate-900 dark:text-white hover:text-emerald-500 line-clamp-2 block"
                       x-text="match.title || 'Untitled Pin'"></a>

                    <div class="flex items-center justify-between text-[11px] pt-1">
                      <template x-if="match.domain">
                        <span class="text-[10px] font-mono text-slate-500 truncate max-w-[130px]" x-text="match.domain"></span>
                      </template>
                      <a :href="'https://www.pinterest.com/pin/' + match.pin_id + '/'" target="_blank"
                         class="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-white ml-auto">
                        <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                      </a>
                    </div>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </template>

      </div>

      <div class="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 flex items-center justify-between">
        <span class="text-[11px] text-slate-500 font-mono">Pinterest Reverse Visual Lens Discovery</span>
        <button @click="closeVisualLens()" class="px-4 py-2 rounded-xl text-xs font-bold bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition">
          Close Lens
        </button>
      </div>

    </div>
  </div>

  <!-- SLIDE-OVER DRAWER: CAMPAIGN FOLDERS MANAGER -->
  <div x-show="isFolderManagerOpen" x-cloak class="relative z-50">
    <div x-show="isFolderManagerOpen"
         x-transition:enter="transition-opacity ease-linear duration-300"
         x-transition:enter-start="opacity-0"
         x-transition:enter-end="opacity-100"
         x-transition:leave="transition-opacity ease-linear duration-300"
         x-transition:leave-start="opacity-100"
         x-transition:leave-end="opacity-0"
         @click="isFolderManagerOpen = false"
         class="fixed inset-0 bg-slate-950/70 backdrop-blur-xs"></div>

    <div class="fixed inset-y-0 right-0 max-w-full flex pl-10">
      <div x-show="isFolderManagerOpen"
           x-transition:enter="transform transition ease-in-out duration-300"
           x-transition:enter-start="translate-x-full"
           x-transition:enter-end="translate-x-0"
           x-transition:leave="transform transition ease-in-out duration-300"
           x-transition:leave-start="translate-x-0"
           x-transition:leave-end="translate-x-full"
           class="w-screen max-w-md bg-white dark:bg-[#0c1322] border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col">
        
        <!-- Drawer Header -->
        <div class="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div class="flex items-center space-x-2.5">
            <div class="w-8 h-8 rounded-xl bg-pink-500/10 text-pink-500 flex items-center justify-center">
              <i data-lucide="folder-kanban" class="w-4 h-4"></i>
            </div>
            <div>
              <h3 class="text-sm font-black text-slate-900 dark:text-white">Campaign Folders</h3>
              <p class="text-[11px] text-slate-400 font-mono" x-text="folders.length + ' Topic Clusters'"></p>
            </div>
          </div>
          <button @click="isFolderManagerOpen = false" class="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-white transition cursor-pointer">
            <i data-lucide="x" class="w-4 h-4"></i>
          </button>
        </div>

        <!-- Create Button -->
        <div class="p-4 border-b border-slate-100 dark:border-slate-800/80">
          <button @click="openCreateFolderModal()"
                  class="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-pink-600 hover:bg-pink-500 text-white transition flex items-center justify-center space-x-2 shadow-sm cursor-pointer">
            <i data-lucide="plus" class="w-4 h-4"></i>
            <span>Create New Campaign Folder</span>
          </button>
        </div>

        <!-- Folders List -->
        <div class="p-4 flex-1 overflow-y-auto space-y-2.5">
          <template x-for="f in folders" :key="f.id">
            <div class="p-4 rounded-2xl border transition group"
                 :class="activeFolder?.id === f.id ? 'bg-pink-500/10 border-pink-500/40 shadow-xs' : 'bg-slate-50/70 dark:bg-slate-900/40 border-slate-200/80 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700'">
              
              <div class="flex items-start justify-between gap-2">
                <div class="flex items-center space-x-2.5 min-w-0">
                  <span class="w-3.5 h-3.5 rounded-full shrink-0" :style="'background-color: ' + (f.color || '#ec4899')"></span>
                  <div class="min-w-0">
                    <h4 class="text-xs font-bold text-slate-900 dark:text-white truncate" x-text="f.name"></h4>
                    <p class="text-[10px] text-slate-400 font-mono" x-text="(f.keyword_count || 0) + ' Keywords in Cluster'"></p>
                  </div>
                </div>

                <div class="flex items-center space-x-1 shrink-0">
                  <button @click="selectFolder(f); isFolderManagerOpen = false; activeTab = 'crossover'"
                          class="px-2.5 py-1 rounded-lg bg-pink-500/10 hover:bg-pink-500/20 text-pink-600 dark:text-pink-400 text-[10px] font-bold font-mono transition cursor-pointer">
                    View Matrix
                  </button>
                  <button @click="deleteCampaignFolder(f.id)"
                          class="p-1 rounded-lg hover:bg-rose-500/10 text-slate-400 hover:text-rose-500 transition cursor-pointer">
                    <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                  </button>
                </div>
              </div>

              <template x-if="f.description">
                <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-2 line-clamp-2" x-text="f.description"></p>
              </template>

              <!-- Keywords Preview Chips -->
              <template x-if="f.keywords_preview && f.keywords_preview.length > 0">
                <div class="mt-2.5 pt-2 border-t border-slate-200/60 dark:border-slate-800/60 flex flex-wrap gap-1">
                  <template x-for="kw in f.keywords_preview.slice(0, 4)" :key="kw.id">
                    <span class="px-2 py-0.5 rounded text-[9px] font-mono font-semibold bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                          x-text="kw.keyword"></span>
                  </template>
                  <template x-if="f.keywords_preview.length > 4">
                    <span class="text-[9px] font-mono text-slate-400 self-center" x-text="'+' + (f.keywords_preview.length - 4) + ' more'"></span>
                  </template>
                </div>
              </template>

            </div>
          </template>

          <template x-if="folders.length === 0">
            <div class="py-12 text-center text-xs text-slate-400 italic">
              No campaign folders created yet. Click "+ Create New Campaign Folder" above to start!
            </div>
          </template>
        </div>

      </div>
    </div>
  </div>

  <!-- MODAL: CREATE / EDIT CAMPAIGN FOLDER -->
  <div x-show="isCreateFolderModalOpen" x-cloak class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div x-show="isCreateFolderModalOpen"
         x-transition:enter="transition-opacity ease-linear duration-200"
         x-transition:enter-start="opacity-0"
         x-transition:enter-end="opacity-100"
         x-transition:leave="transition-opacity ease-linear duration-200"
         x-transition:leave-start="opacity-100"
         x-transition:leave-end="opacity-0"
         @click="isCreateFolderModalOpen = false"
         class="fixed inset-0 bg-slate-950/70 backdrop-blur-xs"></div>

    <div x-show="isCreateFolderModalOpen"
         x-transition:enter="transition ease-out duration-200"
         x-transition:enter-start="opacity-0 scale-95"
         x-transition:enter-end="opacity-100 scale-100"
         x-transition:leave="transition ease-in duration-150"
         x-transition:leave-start="opacity-100 scale-100"
         x-transition:leave-end="opacity-0 scale-95"
         class="relative w-full max-w-md bg-white dark:bg-[#0c1322] border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl p-6 space-y-4 z-10">
      
      <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
        <div class="flex items-center space-x-2">
          <i data-lucide="folder-plus" class="w-4 h-4 text-pink-500"></i>
          <h3 class="text-sm font-black text-slate-900 dark:text-white">Create Campaign Folder</h3>
        </div>
        <button @click="isCreateFolderModalOpen = false" class="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>

      <div class="space-y-3 text-xs">
        <div>
          <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Folder Name *</label>
          <input type="text" x-model="newFolder.name" placeholder="e.g. Autumn Casseroles & Dinners"
                 class="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-pink-500/40">
        </div>

        <div>
          <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Description (Optional)</label>
          <textarea x-model="newFolder.description" rows="2" placeholder="Campaign niche focus, monetization angle or content objective..."
                    class="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-pink-500/40"></textarea>
        </div>

        <div>
          <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">Color Tag</label>
          <div class="flex items-center space-x-2">
            <template x-for="c in ['#ec4899', '#8b5cf6', '#3b82f6', '#06b6d4', '#10b981', '#f59e0b', '#f43f5e']" :key="c">
              <button type="button" @click="newFolder.color = c"
                      class="w-6 h-6 rounded-full transition transform hover:scale-110 flex items-center justify-center cursor-pointer border"
                      :class="newFolder.color === c ? 'ring-2 ring-offset-2 ring-pink-500 dark:ring-offset-[#0c1322] border-white' : 'border-transparent'"
                      :style="'background-color: ' + c">
                <i x-show="newFolder.color === c" data-lucide="check" class="w-3 h-3 text-white"></i>
              </button>
            </template>
          </div>
        </div>
      </div>

      <div class="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100 dark:border-slate-800">
        <button @click="isCreateFolderModalOpen = false"
                class="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
          Cancel
        </button>
        <button @click="saveNewCampaignFolder()"
                :disabled="!newFolder.name?.trim()"
                class="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-pink-600 hover:bg-pink-500 text-white transition shadow-sm disabled:opacity-50 cursor-pointer">
          Create Folder
        </button>
      </div>

    </div>
  </div>

  <!-- MODAL: ADD / SELECT KEYWORDS IN ACTIVE FOLDER -->
  <div x-show="isAddKeywordsModalOpen" x-cloak class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div x-show="isAddKeywordsModalOpen"
         x-transition:enter="transition-opacity ease-linear duration-200"
         x-transition:enter-start="opacity-0"
         x-transition:enter-end="opacity-100"
         x-transition:leave="transition-opacity ease-linear duration-200"
         x-transition:leave-start="opacity-100"
         x-transition:leave-end="opacity-0"
         @click="isAddKeywordsModalOpen = false"
         class="fixed inset-0 bg-slate-950/70 backdrop-blur-xs"></div>

    <div x-show="isAddKeywordsModalOpen"
         x-transition:enter="transition ease-out duration-200"
         x-transition:enter-start="opacity-0 scale-95"
         x-transition:enter-end="opacity-100 scale-100"
         x-transition:leave="transition ease-in duration-150"
         x-transition:leave-start="opacity-100 scale-100"
         x-transition:leave-end="opacity-0 scale-95"
         class="relative w-full max-w-lg bg-white dark:bg-[#0c1322] border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl p-6 space-y-4 z-10 max-h-[85vh] flex flex-col">
      
      <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
        <div class="flex items-center space-x-2">
          <i data-lucide="plus-circle" class="w-4 h-4 text-pink-500"></i>
          <div>
            <h3 class="text-sm font-black text-slate-900 dark:text-white" x-text="'Add Keywords to ' + (activeFolder?.name || 'Folder')"></h3>
            <p class="text-[10px] text-slate-400 font-mono">Select search queries to include in this crossover cluster</p>
          </div>
        </div>
        <button @click="isAddKeywordsModalOpen = false" class="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>

      <!-- Filter Input -->
      <div class="shrink-0">
        <input type="text" x-model="folderKeywordSearch" placeholder="Filter tracked keywords..."
               class="w-full px-3 py-2 rounded-xl text-xs bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-pink-500/40">
      </div>

      <!-- Keywords Checkbox List -->
      <div class="flex-1 overflow-y-auto space-y-1.5 p-1">
        <template x-for="kw in selectableKeywordsForFolder" :key="kw.id">
          <div @click="toggleKeywordSelection(kw.id)"
               class="p-2.5 rounded-xl border transition flex items-center justify-between cursor-pointer text-xs"
               :class="isKeywordSelected(kw.id) ? 'bg-pink-500/10 border-pink-500/40' : 'bg-slate-50/70 dark:bg-slate-900/40 border-slate-200/80 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700'">
            <div class="flex items-center space-x-2.5 min-w-0">
              <input type="checkbox" :checked="isKeywordSelected(kw.id)" @click.stop="toggleKeywordSelection(kw.id)"
                     class="w-4 h-4 rounded text-pink-600 focus:ring-pink-500 border-slate-300 dark:border-slate-700">
              <div class="min-w-0">
                <span class="font-bold text-slate-900 dark:text-white capitalize truncate block" x-text="kw.keyword"></span>
                <span class="text-[10px] text-slate-400 font-mono" x-text="kw.category || 'General'"></span>
              </div>
            </div>
            <span class="text-[10px] font-mono font-bold text-slate-500" x-text="getKeywordTotalPins(kw) + ' Pins'"></span>
          </div>
        </template>
      </div>

      <!-- Modal Footer -->
      <div class="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 shrink-0">
        <span class="text-xs font-mono text-slate-400" x-text="selectedFolderKeywordIds.length + ' Keywords Selected'"></span>
        <div class="flex items-center space-x-2">
          <button @click="isAddKeywordsModalOpen = false" class="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
            Cancel
          </button>
          <button @click="commitFolderKeywords()" class="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-pink-600 hover:bg-pink-500 text-white transition shadow-sm cursor-pointer">
            Save Cluster
          </button>
        </div>
      </div>

    </div>
  </div>
`;
}
