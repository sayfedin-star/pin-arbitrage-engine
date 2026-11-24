/**
 * Creator Hub — Assign Existing Creators to Campaign Folder Modal
 */
export function renderCreatorsAssignModal() {
  return `  <!-- Modal: Assign Existing Creators to Campaign Folder -->
  <div x-show="isAssignExistingCreatorModalOpen" x-cloak
       class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs"
       @keydown.escape.window="closeAssignExistingCreatorModal()">
    <div class="relative w-full max-w-xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] shadow-2xl p-5 space-y-4 max-h-[85vh] flex flex-col"
         @click.outside="closeAssignExistingCreatorModal()">
      <div class="flex items-center justify-between border-b border-slate-100 dark:border-[#27272A] pb-3 shrink-0">
        <div class="flex items-center gap-2.5">
          <div class="h-9 w-9 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold">
            <i data-lucide="user-check" class="w-5 h-5"></i>
          </div>
          <div>
            <h3 class="text-sm font-bold text-slate-900 dark:text-white">Assign Creators to Campaign Folder</h3>
            <p class="text-xs text-slate-500 dark:text-slate-400">Select creators from your catalog to monitor in this folder.</p>
          </div>
        </div>
        <button @click="closeAssignExistingCreatorModal()" class="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>

      <!-- Search Filter -->
      <div class="relative shrink-0">
        <i data-lucide="search" class="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"></i>
        <input type="text" x-model="assignCreatorSearch" @input.debounce.250ms="fetchAssignCatalogCreators(assignCreatorSearch)" placeholder="Search global creators by username or display name..."
               class="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-[#27272A] text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500/40">
      </div>

      <!-- Creators List -->
      <div class="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[220px]">
        <template x-if="isAssignExistingCreatorModalOpen && isLoadingAssignCatalog">
          <div class="py-8 text-center text-xs text-slate-400 font-mono">Loading creator catalog...</div>
        </template>
        <template x-if="isAssignExistingCreatorModalOpen && !isLoadingAssignCatalog">
          <div class="space-y-2">
            <template x-for="c in (assignCatalogCreators || []).filter(comp => !assignCreatorSearch.trim() || (comp.username && comp.username.toLowerCase().includes(assignCreatorSearch.toLowerCase().replace('@', ''))) || (comp.display_name && comp.display_name.toLowerCase().includes(assignCreatorSearch.toLowerCase()))).slice(0, 100)" :key="c.id || c.username">
              <div class="p-2.5 rounded-xl border border-slate-200/80 dark:border-[#27272A] flex items-center justify-between gap-3 hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition">
                <div class="flex items-center gap-2.5 min-w-0">
                  <template x-if="c.avatar_url">
                    <img :src="c.avatar_url" class="w-8 h-8 rounded-full object-cover shrink-0 border border-slate-200 dark:border-[#27272A]">
                  </template>
                  <template x-if="!c.avatar_url">
                    <div class="w-8 h-8 rounded-full bg-purple-500/10 text-purple-600 flex items-center justify-center font-bold text-xs shrink-0">
                      <span x-text="(c.username || '?')[0].toUpperCase()"></span>
                    </div>
                  </template>
                  <div class="min-w-0">
                    <div class="flex items-center gap-1.5 truncate">
                      <span class="text-xs font-bold text-slate-900 dark:text-white truncate" x-text="c.display_name || c.username"></span>
                      <span class="text-[11px] font-mono tabular-nums text-slate-400 truncate" x-text="'@' + (c.username || '')"></span>
                    </div>
                    <div class="text-[10px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      <span x-text="(c.monthly_reach || 0).toLocaleString() + ' audience'"></span> • 
                      <span x-text="(c.total_pins || 0).toLocaleString() + ' pins'"></span>
                    </div>
                  </div>
                </div>

                <button type="button"
                        @click="assignCreatorToFolder(c.competitor_id || c.id || c.username, scopedFolderId)"
                        class="px-2.5 py-1 rounded-lg text-xs font-semibold transition shrink-0 cursor-pointer flex items-center gap-1"
                        :class="isCreatorInFolder(c.competitor_id || c.id || c.username, scopedFolderId)
                          ? 'bg-purple-600 text-white shadow-xs'
                          : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#27272A]'">
                  <span x-text="isCreatorInFolder(c.competitor_id || c.id || c.username, scopedFolderId) ? '✓ Linked' : '+ Link'"></span>
                </button>
              </div>
            </template>
            <div x-show="!assignCatalogCreators || assignCatalogCreators.length === 0" class="py-8 text-center text-xs text-slate-400">
              No matching creators found in catalog.
            </div>
          </div>
        </template>
      </div>

      <div class="flex items-center justify-between border-t border-slate-100 dark:border-[#27272A] pt-3 shrink-0">
        <span class="text-xs text-slate-400 font-mono tabular-nums" x-text="((folderCreatorMap[scopedFolderId] ? folderCreatorMap[scopedFolderId].size : (scopedFolderCreatorIds ? scopedFolderCreatorIds.size : 0)) || 0) + ' creators linked to this folder'"></span>
        <button @click="closeAssignExistingCreatorModal()" class="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition cursor-pointer">
          Done
        </button>
      </div>
    </div>
  </div>`;
}
