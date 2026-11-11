/**
 * Keywords Modals (Bulk Add to Folder, Interactive 20-Runner Fleet Dispatch Swarm)
 */
export function getKeywordsModalsHtml() {
  return `  <!-- MODAL: BULK ADD KEYWORDS TO CAMPAIGN FOLDER -->
  <div x-show="isBulkFolderModalOpen" x-cloak class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div x-show="isBulkFolderModalOpen"
         x-transition:enter="transition-opacity ease-linear duration-300"
         x-transition:enter-start="opacity-0"
         x-transition:enter-end="opacity-100"
         x-transition:leave="transition-opacity ease-linear duration-300"
         x-transition:leave-start="opacity-100"
         x-transition:leave-end="opacity-0"
         @click="isBulkFolderModalOpen = false"
         class="fixed inset-0 bg-slate-950/70 backdrop-blur-xs"></div>

    <div x-show="isBulkFolderModalOpen"
         x-transition:enter="transform transition ease-out duration-300"
         x-transition:enter-start="opacity-0 scale-95"
         x-transition:enter-end="opacity-100 scale-100"
         x-transition:leave="transform transition ease-in duration-200"
         x-transition:leave-start="opacity-100 scale-100"
         x-transition:leave-end="opacity-0 scale-95"
         class="relative w-full max-w-md bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-3xl shadow-2xl p-6 space-y-4 z-10">
      
      <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-[#27272A]">
        <div class="flex items-center space-x-2.5">
          <div class="w-8 h-8 rounded-xl bg-pink-500/10 text-pink-500 flex items-center justify-center">
            <i data-lucide="folder-plus" class="w-4 h-4"></i>
          </div>
          <div>
            <h3 class="text-sm font-black text-slate-900 dark:text-white">Add to Campaign Folder</h3>
            <p class="text-[11px] text-slate-400 font-mono tabular-nums" x-text="selectedKeywordIds.length + ' Keywords will be added'"></p>
          </div>
        </div>
        <button @click="isBulkFolderModalOpen = false" class="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>

      <div class="space-y-3">
        <label class="block text-xs font-bold text-slate-700 dark:text-slate-300">Select Target Campaign Folder</label>
        <select x-model="bulkTargetFolderId" class="w-full px-3 py-2 rounded-xl text-xs bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-pink-500/40">
          <template x-for="f in folders" :key="f.id">
            <option :value="f.id" x-text="f.name + ' (' + (f.keyword_count || 0) + ' keywords)'"></option>
          </template>
        </select>
        <template x-if="folders.length === 0">
          <p class="text-xs text-rose-500">No folders available. Please create a campaign folder first.</p>
        </template>
      </div>

      <div class="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100 dark:border-[#27272A]">
        <button @click="isBulkFolderModalOpen = false" class="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
          Cancel
        </button>
        <button @click="commitBulkFolder()" :disabled="!bulkTargetFolderId || folders.length === 0 || isBulkLoading"
                class="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-pink-600 hover:bg-pink-500 text-white transition disabled:opacity-50 cursor-pointer shadow-sm">
          Add Keywords
        </button>
      </div>
    </div>
  </div>

  <!-- MODAL: INTERACTIVE 20-RUNNER FLEET DISPATCH SWARM -->
  <div x-show="isFleetDispatchModalOpen" x-cloak class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div x-show="isFleetDispatchModalOpen"
         x-transition:enter="transition-opacity ease-linear duration-300"
         x-transition:enter-start="opacity-0"
         x-transition:enter-end="opacity-100"
         x-transition:leave="transition-opacity ease-linear duration-300"
         x-transition:leave-start="opacity-100"
         x-transition:leave-end="opacity-0"
         @click="isFleetDispatchModalOpen = false"
         class="fixed inset-0 bg-slate-950/70 backdrop-blur-xs"></div>

    <div x-show="isFleetDispatchModalOpen"
         x-transition:enter="transform transition ease-out duration-300"
         x-transition:enter-start="opacity-0 scale-95"
         x-transition:enter-end="opacity-100 scale-100"
         x-transition:leave="transform transition ease-in duration-200"
         x-transition:leave-start="opacity-100 scale-100"
         x-transition:leave-end="opacity-0 scale-95"
         class="relative w-full max-w-lg bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-3xl shadow-2xl p-6 space-y-5 z-10">
      
      <!-- Modal Header -->
      <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-[#27272A]">
        <div class="flex items-center space-x-3">
          <div class="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
            <i data-lucide="play" class="w-4 h-4"></i>
          </div>
          <div>
            <h3 class="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">Trigger 20-Runner Swarm</h3>
            <p class="text-[11px] text-slate-400 font-mono tabular-nums">Autonomous deep crawler fleet via GitHub Actions</p>
          </div>
        </div>
        <button @click="isFleetDispatchModalOpen = false" class="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>

      <!-- Controls Form -->
      <div class="space-y-4">
        <!-- 1. Target Keyword -->
        <div>
          <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Target Keyword</label>
          <select x-model="fleetDispatchTargetKeyword" @change="onFleetTargetKeywordChange()" class="w-full px-3 py-2.5 rounded-xl text-xs bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40 font-medium">
            <option value="">All Tracked Keywords (Global Sweep)</option>
            <template x-for="kw in keywords" :key="kw.id">
              <option :value="kw.keyword" x-text="kw.keyword + ' (' + (getKeywordTotalPins(kw) || kw.total_pins || 0) + ' pins)'"></option>
            </template>
          </select>
          <p class="mt-1 text-[10px] text-slate-400">Select an individual keyword to partition its pins across 20 runners, or audit all keywords globally.</p>
        </div>

        <!-- 2. Fresh Live SERP First (Toggle / Checkbox) -->
        <div class="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-[#27272A] flex items-start justify-between space-x-3">
          <div class="space-y-0.5">
            <label class="text-xs font-bold text-slate-800 dark:text-slate-200 cursor-pointer" @click="fleetDispatchHarvestSerp = !fleetDispatchHarvestSerp">
              Fetch Fresh Live SERP First
            </label>
            <p class="text-[11px] text-slate-400 leading-relaxed">
              Harvests real-time Pinterest search rankings before extracting 48-field telemetry
            </p>
          </div>
          <label class="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5">
            <input type="checkbox" x-model="fleetDispatchHarvestSerp" class="sr-only peer">
            <div class="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-slate-600 peer-checked:bg-emerald-500"></div>
          </label>
        </div>

        <!-- 3. Crawl Scope -->
        <div>
          <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Crawl Scope</label>
          <div class="grid grid-cols-2 gap-2">
            <button type="button" @click="fleetDispatchScope = 'all_pins'"
                    class="p-3 rounded-2xl border text-left transition cursor-pointer"
                    :class="fleetDispatchScope === 'all_pins' ? 'bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-400' : 'bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-[#27272A] text-slate-600 dark:text-slate-400 hover:border-slate-300'">
              <div class="text-xs font-bold">All Pins</div>
              <div class="text-[10px] text-slate-400 mt-0.5">Active SERP + Displaced Vault</div>
            </button>
            <button type="button" @click="fleetDispatchScope = 'active_serp'"
                    class="p-3 rounded-2xl border text-left transition cursor-pointer"
                    :class="fleetDispatchScope === 'active_serp' ? 'bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-400' : 'bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-[#27272A] text-slate-600 dark:text-slate-400 hover:border-slate-300'">
              <div class="text-xs font-bold">Active SERP Only</div>
              <div class="text-[10px] text-slate-400 mt-0.5">Top 50-100 ranked pins</div>
            </button>
          </div>
        </div>

        <!-- 4. Max Pins Quota -->
        <div>
          <div class="flex items-center justify-between mb-1">
            <label class="text-xs font-bold text-slate-700 dark:text-slate-300">Max Pins Quota</label>
            <span class="text-[11px] font-mono tabular-nums text-emerald-500 font-bold" x-text="fleetDispatchMaxPins + ' pins'"></span>
          </div>
          <select x-model.number="fleetDispatchMaxPins" class="w-full px-3 py-2 rounded-xl text-xs bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40">
            <option :value="fleetDispatchMaxPins" x-show="![50, 100, 250, 500, 1000].includes(fleetDispatchMaxPins)" x-text="fleetDispatchMaxPins + ' Pins (Target Quota)'"></option>
            <option :value="50">50 Pins (Fast Discovery)</option>
            <option :value="100">100 Pins (Standard SERP)</option>
            <option :value="250">250 Pins (Deep Audit)</option>
            <option :value="500">500 Pins (Extensive Sweep)</option>
            <option :value="1000">1000 Pins (Maximum Cluster)</option>
          </select>
        </div>
      </div>

      <!-- Modal Footer -->
      <div class="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-[#27272A]">
        <span class="text-[11px] text-slate-400 font-mono tabular-nums">20 Azure VMs &middot; Zero Hub writes</span>
        <div class="flex items-center space-x-2">
          <button @click="isFleetDispatchModalOpen = false" class="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer">
            Cancel
          </button>
          <button @click="executeFleetDispatch()" :disabled="isWorkflowDispatching"
                  class="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-emerald-600 hover:bg-emerald-500 text-white transition disabled:opacity-50 cursor-pointer shadow-sm flex items-center space-x-1.5">
            <i data-lucide="play" class="w-3.5 h-3.5 text-white" :class="isWorkflowDispatching ? 'animate-spin' : ''"></i>
            <span>Launch 20-Runner Swarm</span>
          </button>
        </div>
      </div>

    </div>
  </div>
`;
}
