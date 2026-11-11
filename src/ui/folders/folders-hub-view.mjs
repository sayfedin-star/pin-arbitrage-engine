/**
 * Campaign Folders Hub View (VIEW B) - /folders
 * Renders all campaign folder directory cards & summary.
 */
export function getFoldersHubViewHtml() {
  return `    <!-- ========================================================================= -->
    <!-- VIEW B: HUB VIEW (/folders)                                               -->
    <!-- ========================================================================= -->
    <div x-show="!activeFolderId" class="flex flex-col gap-6" x-cloak>

      <!-- Hub Header & Summary -->
      <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl p-6 shadow-sm dark:shadow-xl flex items-center justify-between flex-wrap gap-4 transition-colors">
        <div>
          <div class="flex items-center gap-3">
            <h1 class="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Campaign Folders Hub</h1>
            <span class="text-xs font-mono tabular-nums px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30 font-semibold" x-text="foldersList.length + ' clusters'"></span>
          </div>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">Organize tracked keywords into niche topic clusters and analyze cross-SERP super-pin crossover.</p>
        </div>

        <button @click="openNewFolderModal = true" class="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md transition-colors flex items-center gap-2">
          <span>+</span> Create New Campaign Folder
        </button>
      </div>

      <!-- Quick KPI Stats for All Folders -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-xl p-4 flex flex-col gap-1 shadow-sm">
          <span class="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">Total Campaign Folders</span>
          <span class="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white" x-text="foldersList.length">0</span>
        </div>
        <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-xl p-4 flex flex-col gap-1 shadow-sm">
          <span class="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">Tracked Keywords Across Folders</span>
          <span class="text-2xl font-bold font-mono tabular-nums text-indigo-600 dark:text-indigo-400" x-text="totalKeywordsCount">0</span>
        </div>
        <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-xl p-4 flex flex-col gap-1 shadow-sm">
          <span class="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">Crossover Engine Readiness</span>
          <span class="text-2xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">100% Operational</span>
        </div>
      </div>

      <!-- Folders Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <template x-for="f in foldersList" :key="f.id">
          <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl p-5 shadow-sm dark:shadow-xl hover:border-indigo-400 dark:hover:border-slate-700 transition-all flex flex-col justify-between gap-4 group">
            <!-- Card Header -->
            <div class="flex items-center justify-between">
              <div class="w-10 h-10 rounded-xl flex items-center justify-center text-xl shadow-inner border border-slate-200 dark:border-white/10"
                   :style="'background-color: ' + (f.color ? f.color + '20' : '#6366f120')">
                <span x-text="f.icon || '📁'">📁</span>
              </div>
              <span class="text-[10px] font-mono tabular-nums px-2 py-0.5 rounded bg-slate-100 dark:bg-[#18181B] text-indigo-600 dark:text-indigo-400 border border-slate-200 dark:border-[#27272A] font-semibold" 
                    x-text="'Folder #' + f.id"></span>
            </div>

            <!-- Card Titles -->
            <div>
              <h3 class="text-base font-bold text-slate-900 dark:text-white tracking-tight group-hover:text-indigo-600 dark:group-hover:text-indigo-300 transition-colors" x-text="f.name"></h3>
              <p class="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2" x-text="f.description || 'Campaign cluster for Pinterest arbitrage'"></p>
            </div>

            <!-- Keyword Preview Chips -->
            <div class="flex items-center gap-1.5 flex-wrap pt-0.5">
              <template x-for="kw in (f.keywords_preview || []).slice(0, 3)" :key="kw.id || kw.keyword">
                <span class="text-[10px] font-mono tabular-nums px-2 py-0.5 rounded bg-slate-100 dark:bg-[#18181B]/80 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#27272A]/60 truncate max-w-[120px]" x-text="kw.keyword"></span>
              </template>
              <template x-if="(f.keywords_preview || []).length > 3">
                <span class="text-[10px] font-mono tabular-nums text-slate-400 dark:text-slate-500" x-text="'+' + ((f.keywords_preview || []).length - 3) + ' more'"></span>
              </template>
            </div>

            <!-- 3 Live Telemetry Counters Grid -->
            <div class="grid grid-cols-3 gap-2 py-2 px-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-[#27272A]/80 font-mono tabular-nums text-center">
              <div class="flex flex-col">
                <span class="text-[9px] uppercase tracking-wider text-slate-400">Keywords</span>
                <span class="text-sm font-bold text-emerald-600 dark:text-emerald-400" x-text="f.keyword_count || 0">0</span>
              </div>
              <div class="flex flex-col border-x border-slate-200 dark:border-[#27272A]">
                <span class="text-[9px] uppercase tracking-wider text-slate-400">Creators</span>
                <span class="text-sm font-bold text-purple-600 dark:text-purple-400" x-text="f.creator_count || 0">0</span>
              </div>
              <div class="flex flex-col">
                <span class="text-[9px] uppercase tracking-wider text-slate-400">Domains</span>
                <span class="text-sm font-bold text-sky-600 dark:text-sky-400" 
                      x-text="(f.domain_count || 0) + (f.pinned_domain_count ? ' (' + f.pinned_domain_count + '📌)' : '')">0</span>
              </div>
            </div>

            <!-- Action Footer with Room Shortcuts -->
            <div class="pt-3 border-t border-slate-100 dark:border-[#27272A]/80 flex items-center justify-between">
              <a :href="'/folders/' + f.id" class="px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-600/10 dark:hover:bg-indigo-600/20 text-indigo-600 dark:text-indigo-400 text-xs font-semibold border border-indigo-200 dark:border-indigo-500/20 transition-colors flex items-center gap-1">
                <span>Open Workspace →</span>
              </a>
              <div class="flex items-center gap-1">
                <a :href="'/folders/' + f.id + '/keywords'" class="p-1.5 rounded text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition" title="Keywords Fleet Room">
                  <i data-lucide="search" class="w-3.5 h-3.5"></i>
                </a>
                <a :href="'/folders/' + f.id + '/creators'" class="p-1.5 rounded text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 transition" title="Creator Hub Room">
                  <i data-lucide="users" class="w-3.5 h-3.5"></i>
                </a>
                <a :href="'/folders/' + f.id + '/domains'" class="p-1.5 rounded text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 transition" title="Domain Studio Room">
                  <i data-lucide="globe" class="w-3.5 h-3.5"></i>
                </a>
                <button @click="confirmDeleteFolder(f.id)" class="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 text-xs transition-colors p-1.5 cursor-pointer" title="Delete Folder">
                  <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                </button>
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- Empty State -->
      <div x-show="!foldersList.length && !foldersLoading" class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl p-12 text-center flex flex-col items-center justify-center gap-4 shadow-sm" x-cloak>
        <div class="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-3xl">
          📁
        </div>
        <div class="max-w-md">
          <h3 class="text-base font-bold text-slate-900 dark:text-white tracking-tight">No Campaign Folders Yet</h3>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Group your tracked keywords into campaign topic clusters to discover super-pins, shared visual tags, and generate comprehensive content blueprints.
          </p>
        </div>
        <button @click="openNewFolderModal = true" class="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md transition-colors">
          + Create First Campaign Folder
        </button>
      </div>

    </div>`;
}
