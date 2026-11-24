/**
 * Level 2: SERP Radar Studio View
 * (4-Card KPI Analytics Ribbon, SERP Matrix, Pinterest Trends, PinClicks Intelligence & Bulk Action Bar)
 */
import { renderSerpStudioHeader } from './serp-studio-header.mjs';
import { renderSerpStudioMatrixTab } from './serp-studio-matrix-tab.mjs';
import { renderSerpStudioTrendsTab } from './serp-studio-trends-tab.mjs';
import { renderSerpStudioIntelligenceTab } from './serp-studio-intelligence-tab.mjs';

export function getKeywordsSerpStudioViewHtml() {
  return `    <!-- ========================================================================= -->
    <!-- LEVEL 2: SERP RADAR STUDIO (viewModeLevel === 'serp_studio')             -->
    <!-- ========================================================================= -->
    <div x-show="viewModeLevel === 'serp_studio'" x-cloak class="space-y-6">

${renderSerpStudioHeader()}

    <!-- ZONE 3: FULL-WIDTH TABBED WORKSPACE -->
    <section class="rounded-3xl bg-white dark:bg-[#121215] border border-slate-200/80 dark:border-[#27272A] shadow-xs overflow-hidden">
      
${renderSerpStudioMatrixTab()}

${renderSerpStudioTrendsTab()}

${renderSerpStudioIntelligenceTab()}

    </section>

    </div>



  <!-- ELEVATED FLOATING BULK ACTION BAR (LEVEL 1A DASHBOARD) -->
  <div x-show="viewModeLevel === 'dashboard' && selectedKeywordIds.length > 0" x-cloak
       x-transition:enter="transition ease-out duration-300"
       x-transition:enter-start="opacity-0 translate-y-8"
       x-transition:enter-end="opacity-100 translate-y-0"
       x-transition:leave="transition ease-in duration-200"
       x-transition:leave-start="opacity-100 translate-y-0"
       x-transition:leave-end="opacity-0 translate-y-8"
       class="fixed bottom-6 inset-x-0 mx-auto w-fit z-50 bg-slate-900/95 dark:bg-[#121215]/95 border border-slate-700 shadow-2xl backdrop-blur-xl px-4 sm:px-6 py-3 rounded-2xl flex flex-wrap items-center gap-2 sm:gap-3 text-xs">
    <div class="flex items-center space-x-2">
      <span class="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
      <span class="px-2.5 py-1 rounded-xl bg-emerald-500/20 text-emerald-400 font-mono tabular-nums font-bold" x-text="selectedKeywordIds.length + ' Keywords Selected'"></span>
    </div>

    <div class="h-4 w-px bg-slate-700 hidden sm:block"></div>

    <button @click="bulkSyncKeywords()" :disabled="isBulkLoading"
            class="px-3.5 py-1.5 rounded-xl font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50">
      <i data-lucide="zap" class="w-3.5 h-3.5" :class="isBulkLoading ? 'animate-spin' : ''"></i>
      <span>Fast Refresh Now</span>
    </button>

    <button @click="openBulkFolderModal()" :disabled="isBulkLoading"
            class="px-3.5 py-1.5 rounded-xl font-bold bg-pink-500/20 hover:bg-pink-500/30 text-pink-400 border border-pink-500/40 transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50">
      <i data-lucide="folder-plus" class="w-3.5 h-3.5"></i>
      <span>Add to Campaign Folder</span>
    </button>

    <button @click="bulkToggleKeywordStatus(false)" :disabled="isBulkLoading"
            class="px-3.5 py-1.5 rounded-xl font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/40 transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50">
      <i data-lucide="pause-circle" class="w-3.5 h-3.5"></i>
      <span>Pause Tracking</span>
    </button>

    <button @click="bulkToggleKeywordStatus(true)" :disabled="isBulkLoading"
            class="px-3.5 py-1.5 rounded-xl font-bold bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border border-blue-500/40 transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50">
      <i data-lucide="play-circle" class="w-3.5 h-3.5"></i>
      <span>Resume Tracking</span>
    </button>

    <template x-if="activeFolderId">
      <div class="flex items-center gap-2">
        <button @click="bulkRemoveFromActiveFolder()" :disabled="isBulkLoading"
                class="px-3.5 py-1.5 rounded-xl font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                title="Remove selected keywords from this folder (keeps global SERP history)">
          <i data-lucide="folder-minus" class="w-3.5 h-3.5"></i>
          <span>Remove from Folder</span>
        </button>
        <button @click="bulkDeleteKeywords()" :disabled="isBulkLoading"
                class="px-3 py-1.5 rounded-xl font-bold bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30 transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                title="Permanently delete selected keywords globally across all folders">
          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          <span>Delete Globally</span>
        </button>
      </div>
    </template>
    <template x-if="!activeFolderId">
      <button @click="bulkDeleteKeywords()" :disabled="isBulkLoading"
              class="px-3.5 py-1.5 rounded-xl font-bold bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/40 transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50">
        <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
        <span>Delete Selected</span>
      </button>
    </template>

    <button @click="clearSelectedKeywords()" class="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer" title="Clear Selection">
      <i data-lucide="x" class="w-4 h-4"></i>
    </button>
  </div>
`;
}
