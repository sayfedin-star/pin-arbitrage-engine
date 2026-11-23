/**
 * Campaign Folders Slide-Over & Modals
 * (New Folder, Delete Folder, Visual Feed Modal — Folder Settings consolidated into Room 5)
 */
import { renderCreatorVisualFeedModal } from '../shared/creator-visual-feed-modal.mjs';

export function getFoldersModalsHtml() {
  return `
  <!-- New Folder Modal -->
  <div x-show="openNewFolderModal" @keydown.escape.window="openNewFolderModal = false" class="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4" x-cloak>
    <div @click.away="openNewFolderModal = false" class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl max-w-md w-full p-6 shadow-2xl flex flex-col gap-4" role="dialog" aria-modal="true" aria-label="Create New Campaign Folder">
      <div class="flex items-center justify-between border-b border-slate-200 dark:border-[#27272A] pb-3">
        <h3 class="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <i data-lucide="folder" class="w-4 h-4 text-indigo-500 shrink-0"></i><span>Create New Campaign Folder</span>
        </h3>
        <button @click="openNewFolderModal = false" class="text-slate-400 hover:text-slate-600 dark:hover:text-white">✕</button>
      </div>

      <div class="flex flex-col gap-3">
        <div>
          <label class="text-xs text-slate-500 dark:text-slate-400 block mb-1">Folder Name *</label>
          <input type="text" x-model="newFolderName" placeholder="e.g. High-Velocity Dinners 2026" class="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-[#27272A] rounded-xl text-slate-900 dark:text-white text-xs font-mono tabular-nums focus:outline-none focus:border-indigo-500">
        </div>
        <div>
          <label class="text-xs text-slate-500 dark:text-slate-400 block mb-1">Description (Optional)</label>
          <textarea x-model="newFolderDesc" rows="3" placeholder="Target niche, seasonal strategy, and monetized destination links..." class="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-[#27272A] rounded-xl text-slate-900 dark:text-white text-xs font-sans focus:outline-none focus:border-indigo-500"></textarea>
        </div>
        <div>
          <label class="text-xs text-slate-500 dark:text-slate-400 block mb-1">Color Theme</label>
          <div class="flex items-center gap-2">
            <template x-for="c in colorOptions" :key="c">
              <button @click="newFolderColor = c"
                      class="w-7 h-7 rounded-lg border-2 transition-transform"
                      :class="newFolderColor === c ? 'scale-110 border-indigo-600 dark:border-white shadow' : 'border-transparent'"
                      :style="'background-color: ' + c"></button>
            </template>
          </div>
        </div>
      </div>

      <div class="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-[#27272A]">
        <button @click="openNewFolderModal = false" class="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-slate-700 dark:text-slate-300 text-xs">Cancel</button>
        <button @click="createFolder()" :disabled="!newFolderName.trim()" class="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold">Create Folder</button>
      </div>
    </div>
  </div>

  <!-- Delete Confirmation Modal -->
  <div x-show="deleteModalFolderId" @keydown.escape.window="deleteModalFolderId = null" class="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4" x-cloak>
    <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl max-w-sm w-full p-6 shadow-2xl flex flex-col gap-4 text-center" role="dialog" aria-modal="true" aria-label="Delete Campaign Folder">
      <div class="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center text-xl mx-auto">
        <i data-lucide="trash-2" class="w-5 h-5"></i>
      </div>
      <div>
        <h3 class="text-sm font-bold text-slate-900 dark:text-white">Delete Campaign Folder?</h3>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">This will remove the folder grouping. The underlying tracked keywords and pin snapshots will remain preserved.</p>
      </div>
      <div class="flex items-center justify-center gap-3 pt-2">
        <button @click="deleteModalFolderId = null" class="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-slate-700 dark:text-slate-300 text-xs font-medium">Cancel</button>
        <button @click="executeDeleteFolder()" class="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold">Delete Folder</button>
      </div>
    </div>
  </div>

${renderCreatorVisualFeedModal({ variant: 'folders' })}
`;
}
