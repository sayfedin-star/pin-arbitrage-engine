/**
 * Campaign Folders Slide-Over & Modals
 * (New Folder, Edit Folder, Delete Folder, Settings, Visual Feed Modal)
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

  <!-- Folder Settings & Fleet Dispatch Modal -->
  <div x-show="isSettingsModalOpen" @keydown.escape.window="isSettingsModalOpen = false" class="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4" x-cloak>
    <div class="bg-white dark:bg-[#0c1322] border border-slate-200 dark:border-[#27272A] rounded-3xl max-w-xl w-full p-6 shadow-2xl flex flex-col gap-5 max-h-[90vh] overflow-y-auto" role="dialog" aria-modal="true" aria-label="Folder Settings and 20-Runner Fleet Config" @click.away="isSettingsModalOpen = false">
      
      <!-- Modal Header -->
      <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-[#27272A]">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-lg font-bold">
            <i data-lucide="settings" class="w-5 h-5"></i>
          </div>
          <div>
            <h3 class="text-sm font-bold text-slate-900 dark:text-white">Folder Settings & 20-Runner Fleet Config</h3>
            <p class="text-xs text-slate-500 dark:text-slate-400">Configure cluster harvest depth, live SERP ingestion and metadata</p>
          </div>
        </div>
        <button @click="isSettingsModalOpen = false" class="p-1 rounded-xl hover:bg-slate-100 dark:hover:bg-[#27272A] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition">✕</button>
      </div>

      <!-- Section 1: 20-Runner Cluster Fleet Engine -->
      <div class="p-4 rounded-2xl bg-gradient-to-br from-indigo-500/5 via-purple-500/5 to-transparent border border-indigo-500/20 flex flex-col gap-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <i data-lucide="rocket" class="w-4 h-4 text-indigo-500 shrink-0"></i>
            <span class="text-xs font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">Cluster Fleet Engine (20 Parallel Runners)</span>
          </div>
          <span class="text-[10px] font-mono tabular-nums px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold border border-indigo-500/20">Stage 0 + Stage 1 Matrix</span>
        </div>

        <!-- Live SERP Ingestion Toggle -->
        <div class="flex items-start justify-between gap-4 p-3 rounded-xl bg-white/70 dark:bg-[#121215]/60 border border-slate-200/80 dark:border-[#27272A]">
          <div class="flex flex-col gap-0.5">
            <div class="flex items-center gap-2">
              <span class="text-xs font-bold text-slate-900 dark:text-white">Live Search Discovery & SERP Ingestion</span>
              <span class="text-[10px] font-mono tabular-nums px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">Essential</span>
            </div>
            <p class="text-[11px] text-slate-500 dark:text-slate-400">Harvest fresh Pinterest search SERPs across cluster keywords before partitioning pins. Prevents newly added keywords from remaining at 0 pins.</p>
          </div>
          <label class="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
            <input type="checkbox" x-model="folderSettings.enable_serp_harvest" class="sr-only peer">
            <div class="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
          </label>
        </div>

        <!-- Target Pin Quota per Keyword -->
        <div class="flex flex-col gap-2">
          <label class="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between">
            <span>Pin Quota per Keyword (Harvest Depth)</span>
            <span class="text-xs font-mono tabular-nums text-indigo-600 dark:text-indigo-400 font-bold" x-text="(folderSettings.max_pins || 50) + ' pins/KW (~' + Math.ceil((parseInt(folderSettings.max_pins, 10) || 50) / 25) + ' pages)'"></span>
          </label>
          <div class="grid grid-cols-5 gap-2">
            <template x-for="q in ['20', '50', '100', '250', '500']" :key="q">
              <button type="button" @click="folderSettings.max_pins = q; folderSettings.max_serp_pins = q"
                      class="px-2 py-1.5 rounded-xl text-xs font-mono tabular-nums font-medium border text-center transition cursor-pointer"
                      :class="String(folderSettings.max_pins) === q 
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' 
                        : 'bg-white dark:bg-[#121215] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-[#27272A] hover:border-slate-300'">
                <span x-text="q + ' pins'"></span>
              </button>
            </template>
          </div>
          <!-- Custom Slider & Number Input -->
          <div class="flex items-center gap-3 pt-1">
            <input type="range" min="10" max="2000" step="5" x-model="folderSettings.max_pins" @input="folderSettings.max_serp_pins = folderSettings.max_pins"
                   class="flex-1 accent-indigo-600 dark:accent-indigo-500 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg cursor-pointer">
            <div class="flex items-center gap-1 shrink-0">
              <input type="number" min="10" max="2000" step="5" x-model="folderSettings.max_pins" @input="folderSettings.max_serp_pins = folderSettings.max_pins"
                     class="w-20 px-2 py-1 text-xs font-mono tabular-nums font-bold text-center rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121215] text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500">
              <span class="text-[10px] text-slate-400 font-mono tabular-nums">pins</span>
            </div>
          </div>
        </div>

        <!-- Crawl Scope & Inspection Cap -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div class="flex flex-col gap-1.5">
            <label class="text-xs font-semibold text-slate-700 dark:text-slate-300">Crawl Scope</label>
            <select x-model="folderSettings.crawl_scope" class="w-full text-xs rounded-xl bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] px-3 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500">
              <option value="all_pins">all_pins (Active + Vault Archive)</option>
              <option value="active_serp">active_serp (Top 100 Organic Only)</option>
            </select>
          </div>
          <div class="flex flex-col gap-1.5">
            <label class="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between">
              <span>Inspection Cap</span>
              <span class="text-[10px] text-slate-400 font-mono tabular-nums" x-text="folderSettings.max_catalog_inspect === '0' ? 'Unlimited' : folderSettings.max_catalog_inspect + ' pins'"></span>
            </label>
            <input type="number" x-model="folderSettings.max_catalog_inspect" min="0" step="50" placeholder="0 = Unlimited"
                   class="w-full text-xs rounded-xl bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] px-3 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500">
          </div>
        </div>
      </div>

      <!-- Section 2: Folder Metadata (Identity) -->
      <div class="flex flex-col gap-3">
        <span class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Folder Identity</span>
        
        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-semibold text-slate-700 dark:text-slate-300">Folder Name</label>
          <input type="text" x-model="folderSettings.name" placeholder="e.g. Crockpot Meals Cluster"
                 class="w-full text-xs rounded-xl bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] px-3 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500">
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-semibold text-slate-700 dark:text-slate-300">Campaign Description</label>
          <textarea x-model="folderSettings.description" rows="2" placeholder="Campaign Topic Cluster & Cross-SERP Intelligence"
                    class="w-full text-xs rounded-xl bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] px-3 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"></textarea>
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-semibold text-slate-700 dark:text-slate-300">Theme Color</label>
          <div class="flex items-center gap-2">
            <template x-for="c in colorOptions" :key="c">
              <button type="button" @click="folderSettings.color = c" 
                      class="w-7 h-7 rounded-lg border-2 transition-transform cursor-pointer"
                      :class="folderSettings.color === c ? 'scale-110 border-indigo-600 dark:border-white shadow' : 'border-transparent'"
                      :style="'background-color: ' + c"></button>
            </template>
          </div>
        </div>
      </div>

      <!-- Section 3: Cluster Keywords Summary -->
      <div class="p-3 rounded-2xl bg-slate-50 dark:bg-[#121215]/60 border border-slate-200 dark:border-[#27272A] flex items-center justify-between text-xs">
        <div class="flex items-center gap-2">
          <span class="font-bold text-slate-700 dark:text-slate-300">Cluster Status:</span>
          <span class="font-mono tabular-nums text-emerald-600 dark:text-emerald-400 font-semibold" x-text="crawledKeywordsCount + ' Crawled'"></span>
          <span class="text-slate-400">•</span>
          <span class="font-mono tabular-nums text-amber-600 dark:text-amber-400 font-semibold" x-text="pendingKeywordsCount + ' Pending Harvest'"></span>
        </div>
        <span class="text-[11px] font-mono tabular-nums text-slate-500" x-text="totalKeywordsCount + ' Total Keywords'"></span>
      </div>

      <!-- Modal Footer -->
      <div class="flex items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-[#27272A]">
        <button type="button" @click="isSettingsModalOpen = false" class="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-slate-600 dark:text-slate-300 transition">
          Cancel
        </button>
        <div class="flex items-center gap-2">
          <button type="button" @click="saveFolderSettings(false)" :disabled="settingsLoading"
                  class="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-200 hover:bg-slate-300 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-slate-800 dark:text-slate-200 transition">
            <span x-text="settingsLoading ? 'Saving...' : 'Save Settings'"></span>
          </button>
          <button type="button" @click="saveFolderSettings(true)" :disabled="settingsLoading || auditDispatching"
                  class="px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-md transition flex items-center gap-1.5">
            <i data-lucide="rocket" class="w-3.5 h-3.5 shrink-0"></i>
            <span x-text="auditDispatching ? 'Launching...' : 'Save & Launch 20 Runners'"></span>
          </button>
        </div>
      </div>

    </div>
  </div>

${renderCreatorVisualFeedModal({ variant: 'folders' })}
`;
}
