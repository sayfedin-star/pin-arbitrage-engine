/**
 * Related Pins Hub — Sub-Tab 3: Master Database Explorer (Search & Filter)
 * Uses shared related-candidates-table.mjs in 'explorer' mode.
 */
import {
  renderRelatedCandidatesToolbar,
  renderRelatedCandidatesTable
} from './related-candidates-table.mjs';

export function renderRelatedExplorerTab() {
  const explorerLeftControlsHtml = `<!-- Left: Seed Selection & Sorting & Search -->
            <div class="flex items-center space-x-2 flex-wrap gap-y-2">
              <div class="flex items-center space-x-1 bg-white dark:bg-slate-900 rounded-xl px-2 py-1 border border-slate-200 dark:border-[#27272A] shadow-sm">
                <span class="text-[10px] font-mono tabular-nums text-slate-400 uppercase font-semibold">Seed:</span>
                <select x-model="explorerSeedId" @change="loadExplorerData()" class="text-xs bg-transparent text-slate-900 dark:text-slate-100 font-mono tabular-nums focus:outline-none cursor-pointer">
                  <option value="all">All Tracked Seeds</option>
                  <template x-for="s in seeds" :key="s.pin_id">
                    <option :value="s.pin_id" x-text="s.label + ' (' + (s.total_candidates || 0) + ' nodes)'"></option>
                  </template>
                </select>
              </div>

              <div class="flex items-center space-x-1 bg-white dark:bg-slate-900 rounded-xl px-2 py-1 border border-slate-200 dark:border-[#27272A] shadow-sm">
                <span class="text-[10px] font-mono tabular-nums text-slate-400 uppercase font-semibold">Sort:</span>
                <select x-model="explorerSort" @change="loadExplorerData()" class="text-xs bg-transparent text-slate-900 dark:text-slate-100 font-mono tabular-nums focus:outline-none cursor-pointer">
                  <option value="saves">Sort by Total Saves</option>
                  <option value="velocity">Sort by Velocity (Fastest Growing)</option>
                </select>
              </div>

              <!-- Search Input -->
              <div class="relative min-w-[200px]">
                <i data-lucide="search" class="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400"></i>
                <input type="text" x-model="explorerFilters.search" placeholder="Search title, domain, OCR text..." class="w-full pl-8 pr-3 py-1 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] font-mono tabular-nums text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-rose-500">
              </div>

              <!-- Export CSV Button -->
              <button @click="exportCsv(filteredExplorerCandidates, 'master-explorer-candidates.csv')" class="flex items-center space-x-1.5 px-3 py-1 rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold shadow-sm transition active:scale-95">
                <i data-lucide="download" class="w-3.5 h-3.5 text-sky-500"></i>
                <span>Export CSV</span>
              </button>
            </div>`;

  return `    <!-- ======================================================== -->
    <!-- SUB-TAB 3: 📊 MASTER DATABASE EXPLORER (SEARCH & FILTER) -->
    <!-- ======================================================== -->
    <div x-show="relatedSubTab === 'explorer'" class="space-y-4">
      <div class="bg-white dark:bg-[#18181B] border border-slate-200/90 dark:border-[#27272A] rounded-2xl p-5 shadow-sm dark:shadow-xl space-y-4">
        
        <!-- Master Explorer Filter & Segment Toolbar -->
        ${renderRelatedCandidatesToolbar({
          filterObj: 'explorerFilters',
          filteredListExpr: 'filteredExplorerCandidates',
          totalListExpr: 'explorerCandidates',
          resetExpr: 'resetExplorerFilters()',
          showSearchInput: false,
          leftControlsHtml: explorerLeftControlsHtml
        })}

        <!-- Master Candidates Table -->
        ${renderRelatedCandidatesTable({
          mode: 'explorer',
          listExpr: 'filteredExplorerCandidates',
          keyExpr: "item.candidate_pin_id + '-' + item.seed_pin_id",
          showOriginSeedColumn: true,
          cellPaddingClass: 'py-3.5 px-4',
          titleMinWidthClass: 'min-w-[240px]',
          ocrTextClass: 'text-[10px]'
        })}

      </div>
    </div>`;
}
