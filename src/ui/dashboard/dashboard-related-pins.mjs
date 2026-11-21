/**
 * Unified Related Pins Hub (Seeds view, candidates table, 24 hubs intersections, master explorer)
 */
import { renderRelatedSeedsTab } from './related-seeds-tab.mjs';
import { renderRelatedIntersectionsTab } from './related-intersections-tab.mjs';
import { renderRelatedExplorerTab } from './related-explorer-tab.mjs';

export function getDashboardRelatedPinsHtml() {
  return `    <!-- ======================================================== -->
    <!-- UNIFIED TAB: 🌿 RELATED PINS HUB (SEEDS, INTERSECTIONS, EXPLORER) -->
    <!-- Combines Tracked Seeds, Global Intersections & Master Explorer -->
    <!-- ======================================================== -->
    <div x-show="currentTab === 'related_pins' || currentTab === 'seeds' || currentTab === 'intersections' || currentTab === 'explorer'" x-cloak class="space-y-6">
      
      <!-- Unified Related Pins Header -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div class="flex items-center space-x-3">
          <div class="h-11 w-11 rounded-2xl bg-gradient-to-tr from-rose-600 via-amber-500 to-sky-600 text-white flex items-center justify-center shadow-md shadow-rose-950/20">
            <i data-lucide="git-fork" class="w-6 h-6"></i>
          </div>
          <div>
            <div class="flex items-center space-x-2">
              <h1 class="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">Related Pins Intelligence</h1>
              <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">HUB</span>
            </div>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Unified discovery: Tracked seed nodes, multi-pin global intersections, and candidate graph explorer in one single place.</p>
          </div>
        </div>

        <div class="flex items-center space-x-2 flex-wrap gap-y-2">
          <button @click="openAddSeedModal()" class="px-3.5 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-sm transition active:scale-95 flex items-center space-x-1.5">
            <i data-lucide="plus-circle" class="w-4 h-4"></i>
            <span>Add Seeds</span>
          </button>
          <button @click="openCrawlModal()" class="px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-sm transition active:scale-95 flex items-center space-x-1.5">
            <i data-lucide="zap" class="w-4 h-4"></i>
            <span>Crawl</span>
          </button>
          <button @click="exportCandidatesCSV()" class="px-3 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-[#27272A] bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition flex items-center space-x-1.5 shadow-sm">
            <i data-lucide="download" class="w-3.5 h-3.5"></i>
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      <!-- 5-KPI Ribbon -->
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <!-- KPI 1: Tracked Seeds -->
        <div @click="relatedSubTab = 'seeds'" class="p-3.5 rounded-2xl bg-white dark:bg-[#18181B] border cursor-pointer transition hover:border-rose-500/50 shadow-sm" :class="relatedSubTab === 'seeds' ? 'border-rose-500/80 ring-2 ring-rose-500/20' : 'border-slate-200/90 dark:border-[#27272A]'">
          <div class="flex items-center justify-between">
            <span class="text-[10px] font-mono tabular-nums uppercase text-slate-500 dark:text-slate-400 font-bold">Tracked Seeds</span>
            <i data-lucide="folder-git-2" class="w-4 h-4 text-rose-500"></i>
          </div>
          <div class="mt-1 text-xl font-mono tabular-nums font-extrabold text-slate-900 dark:text-white" x-text="seeds.length"></div>
          <div class="text-[10px] text-slate-400 font-medium mt-0.5 truncate" x-text="seeds.filter(s => s.last_crawled_at).length + ' crawled'"></div>
        </div>

        <!-- KPI 2: Global Intersections -->
        <div @click="relatedSubTab = 'intersections'" class="p-3.5 rounded-2xl bg-white dark:bg-[#18181B] border cursor-pointer transition hover:border-amber-500/50 shadow-sm" :class="relatedSubTab === 'intersections' ? 'border-amber-500/80 ring-2 ring-amber-500/20' : 'border-slate-200/90 dark:border-[#27272A]'">
          <div class="flex items-center justify-between">
            <span class="text-[10px] font-mono tabular-nums uppercase text-slate-500 dark:text-slate-400 font-bold">Intersections</span>
            <i data-lucide="flame" class="w-4 h-4 text-amber-500"></i>
          </div>
          <div class="mt-1 text-xl font-mono tabular-nums font-extrabold text-amber-600 dark:text-amber-400" x-text="intersections.length"></div>
          <div class="text-[10px] text-slate-400 font-medium mt-0.5 truncate">≥ 2 seeds overlap</div>
        </div>

        <!-- KPI 3: Graph Candidates -->
        <div @click="relatedSubTab = 'explorer'" class="p-3.5 rounded-2xl bg-white dark:bg-[#18181B] border cursor-pointer transition hover:border-sky-500/50 shadow-sm" :class="relatedSubTab === 'explorer' ? 'border-sky-500/80 ring-2 ring-sky-500/20' : 'border-slate-200/90 dark:border-[#27272A]'">
          <div class="flex items-center justify-between">
            <span class="text-[10px] font-mono tabular-nums uppercase text-slate-500 dark:text-slate-400 font-bold">Candidates</span>
            <i data-lucide="database" class="w-4 h-4 text-sky-500"></i>
          </div>
          <div class="mt-1 text-xl font-mono tabular-nums font-extrabold text-sky-600 dark:text-sky-400" x-text="formatNumber(overview.total_candidates)"></div>
          <div class="text-[10px] text-slate-400 font-medium mt-0.5 truncate">Discovered graph</div>
        </div>

        <!-- KPI 4: High Velocity -->
        <div class="p-3.5 rounded-2xl bg-white dark:bg-[#18181B] border border-slate-200/90 dark:border-[#27272A] shadow-sm">
          <div class="flex items-center justify-between">
            <span class="text-[10px] font-mono tabular-nums uppercase text-slate-500 dark:text-slate-400 font-bold">High Velocity</span>
            <i data-lucide="zap" class="w-4 h-4 text-emerald-500"></i>
          </div>
          <div class="mt-1 text-xl font-mono tabular-nums font-extrabold text-emerald-600 dark:text-emerald-400" x-text="formatNumber(overview.high_velocity_candidates)"></div>
          <div class="text-[10px] text-slate-400 font-medium mt-0.5 truncate">Surging growth</div>
        </div>

        <!-- KPI 5: Commercial Gap -->
        <div class="p-3.5 rounded-2xl bg-white dark:bg-[#18181B] border border-slate-200/90 dark:border-[#27272A] shadow-sm col-span-2 sm:col-span-1">
          <div class="flex items-center justify-between">
            <span class="text-[10px] font-mono tabular-nums uppercase text-slate-500 dark:text-slate-400 font-bold">Commercial Gap</span>
            <i data-lucide="trending-up" class="w-4 h-4 text-purple-500"></i>
          </div>
          <div class="mt-1 text-xl font-mono tabular-nums font-extrabold text-purple-600 dark:text-purple-400" x-text="(overview.avg_commercial_gap || 0) + '%'"></div>
          <div class="text-[10px] text-slate-400 font-medium mt-0.5 truncate">Arbitrage spread</div>
        </div>
      </div>

      <!-- Unified Sub-Tabs Navigation Bar -->
      <div class="flex items-center space-x-2 border-b border-slate-200 dark:border-[#27272A] pb-2">
        <button @click="relatedSubTab = 'seeds'" class="flex items-center space-x-2 px-3.5 py-2 text-xs font-bold rounded-xl transition" :class="relatedSubTab === 'seeds' ? 'bg-rose-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900'">
          <i data-lucide="folder-git-2" class="w-3.5 h-3.5"></i>
          <span>Tracked Seeds</span>
          <span class="px-1.5 py-0.5 rounded text-[10px] font-mono tabular-nums" :class="relatedSubTab === 'seeds' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-800'" x-text="seeds.length"></span>
        </button>

        <button @click="relatedSubTab = 'intersections'" class="flex items-center space-x-2 px-3.5 py-2 text-xs font-bold rounded-xl transition" :class="relatedSubTab === 'intersections' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900'">
          <i data-lucide="flame" class="w-3.5 h-3.5"></i>
          <span>Global Intersections</span>
          <span class="px-1.5 py-0.5 rounded text-[10px] font-mono tabular-nums" :class="relatedSubTab === 'intersections' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-800'" x-text="intersections.length"></span>
        </button>

        <button @click="relatedSubTab = 'explorer'" class="flex items-center space-x-2 px-3.5 py-2 text-xs font-bold rounded-xl transition" :class="relatedSubTab === 'explorer' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900'">
          <i data-lucide="database" class="w-3.5 h-3.5"></i>
          <span>Master Explorer</span>
          <span class="px-1.5 py-0.5 rounded text-[10px] font-mono tabular-nums" :class="relatedSubTab === 'explorer' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-800'" x-text="formatNumber(overview.total_candidates)"></span>
        </button>
      </div>

${renderRelatedSeedsTab()}

${renderRelatedIntersectionsTab()}

${renderRelatedExplorerTab()}
    </div>
`;
}
