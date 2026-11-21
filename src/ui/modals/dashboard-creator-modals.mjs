/**
 * Dashboard Modals — Creator Hub Operations
 * (Track Creator, GHA 20-Runner, Bulk Seeds, Selected Pins Floating Bar, Board Sections, Auto-Promote)
 */
export function renderDashboardCreatorModals() {
  return `  <!-- Modal: Track Pinterest Creator (Unified Modal matching User Mockup) -->
  <div x-show="isAddCompetitorModalOpen" x-cloak class="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4" @keydown.escape.window="isAddCompetitorModalOpen = false">
    <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-3xl w-full max-w-lg shadow-2xl p-6 sm:p-7 space-y-5" role="dialog" aria-modal="true" aria-label="Track Pinterest Creator" @click.away="isAddCompetitorModalOpen = false">
      <!-- Modal Header -->
      <div class="flex items-center justify-between border-b border-slate-200 dark:border-[#27272A]/80 pb-4">
        <div class="flex items-center space-x-3">
          <div class="w-10 h-10 rounded-2xl bg-rose-600 text-white flex items-center justify-center shadow-xs">
            <i data-lucide="user-plus" class="w-5 h-5"></i>
          </div>
          <div>
            <h3 class="font-bold text-slate-900 dark:text-white text-base">Track Pinterest Creator</h3>
            <p class="text-xs text-slate-500 dark:text-slate-400">Add a creator account to monitor profile metrics, boards, or scrape winning pins into your archive.</p>
          </div>
        </div>
        <button @click="isAddCompetitorModalOpen = false" class="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>

      <!-- Form Inputs -->
      <div class="space-y-4 text-xs">
        <!-- Profile Handle / URL Input -->
        <div>
          <label class="block font-bold text-slate-800 dark:text-slate-200 mb-1.5">
            <span>Pinterest Profile URL or Username</span>
            <span class="text-rose-500">*</span>
          </label>
          <div class="relative">
            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-xs">@</span>
            <input type="text" x-model="newCompetitorHandle" placeholder="wifesrecipesbyme or https://pinterest.com/wifesrecipesbyme" class="w-full pl-8 pr-3 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-900/90 border border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono">
          </div>
          <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Accepts raw handle (e.g. <code>wifesrecipesbyme</code>) or full profile URL.</p>
        </div>

        <!-- Options Checkboxes -->
        <div class="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/80 dark:border-[#27272A] space-y-3">
          <!-- Checkbox 1: Also track & scrape in Competitor Intelligence -->
          <label class="flex items-start space-x-3 cursor-pointer">
            <input type="checkbox" x-model="newCompetitorAlsoTrack" class="mt-0.5 rounded border-slate-300 dark:border-slate-700 text-purple-600 focus:ring-purple-500">
            <div>
              <span class="font-bold text-slate-900 dark:text-white block">Also track & scrape in Competitor Intelligence</span>
              <span class="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">Saves account to database, monitors followers & Total audience, and scrapes public boards.</span>
            </div>
          </label>

          <!-- Checkbox 2: Run Discover Pins immediately -->
          <label class="flex items-start space-x-3 cursor-pointer pt-2 border-t border-slate-200/60 dark:border-[#27272A]/60">
            <input type="checkbox" x-model="newCompetitorDiscoverPins" class="mt-0.5 rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500">
            <div>
              <span class="font-bold text-slate-900 dark:text-white block">Run Discover Pins immediately</span>
              <span class="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">Dispatches the pin ingestion pipeline right after adding to pull winning pins into your PinArchive.</span>
            </div>
          </label>
        </div>

        <!-- Conditional Discover Mode Selector (when Discover Pins is checked) -->
        <div x-show="newCompetitorDiscoverPins" class="p-3.5 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200/60 dark:border-indigo-900/40 space-y-3">
          <label class="block font-bold text-indigo-900 dark:text-indigo-200">Discovery Mode:</label>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label class="flex items-center space-x-2 p-2.5 rounded-xl border cursor-pointer transition" :class="newCompetitorDiscoverMode === 'daily' ? 'bg-white dark:bg-indigo-900/40 border-indigo-500 text-indigo-700 dark:text-indigo-300 font-bold shadow-sm' : 'border-slate-200 dark:border-[#27272A] text-slate-600 dark:text-slate-400'">
              <input type="radio" value="daily" x-model="newCompetitorDiscoverMode" class="text-indigo-600">
              <div>
                <div class="text-xs">Early-Stop 3 Pages</div>
                <div class="text-[10px] text-slate-500 dark:text-slate-400">~150 pins (Fast & Safe)</div>
              </div>
            </label>
            <label class="flex items-center space-x-2 p-2.5 rounded-xl border cursor-pointer transition" :class="newCompetitorDiscoverMode === 'deep' ? 'bg-white dark:bg-indigo-900/40 border-indigo-500 text-indigo-700 dark:text-indigo-300 font-bold shadow-sm' : 'border-slate-200 dark:border-[#27272A] text-slate-600 dark:text-slate-400'">
              <input type="radio" value="deep" x-model="newCompetitorDiscoverMode" class="text-indigo-600">
              <div>
                <div class="text-xs">Deep Audit Sweep</div>
                <div class="text-[10px] text-slate-500 dark:text-slate-400">Up to <span x-text="newCompetitorMaxPages || 500"></span> pages (History)</div>
              </div>
            </label>
          </div>

          <!-- Deep Audit Max Pages Customizer -->
          <div x-show="newCompetitorDiscoverMode === 'deep'" class="pt-2 border-t border-indigo-200/40 dark:border-indigo-900/40 flex items-center justify-between">
            <div>
              <span class="font-bold text-slate-900 dark:text-white block text-xs">Sweep Depth Limit</span>
              <span class="text-[10px] text-slate-500 dark:text-slate-400 block">Default: 500 pages. Increase for giant accounts.</span>
            </div>
            <div class="flex items-center space-x-1.5">
              <input type="number" min="1" max="10000" step="50" x-model.number="newCompetitorMaxPages" class="w-20 px-2.5 py-1 text-xs font-mono font-bold text-center rounded-lg bg-white dark:bg-slate-950 border border-indigo-300 dark:border-indigo-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="500">
              <span class="text-[11px] font-mono text-slate-400">pages</span>
            </div>
          </div>

          <!-- Ingest to Winning Pins Archive Checkbox -->
          <label class="flex items-start space-x-3 cursor-pointer pt-2 border-t border-indigo-200/40 dark:border-indigo-900/40">
            <input type="checkbox" x-model="newCompetitorAutoArchiveWinning" class="mt-0.5 rounded border-indigo-300 dark:border-indigo-700 text-rose-500 focus:ring-rose-500">
            <div>
              <span class="font-bold text-slate-900 dark:text-white block flex items-center gap-1.5">
                <span>📌 Ingest to Winning Pins Archive</span>
                <span class="text-[10px] font-mono px-1.5 py-0.2 rounded bg-rose-500/10 text-rose-500 border border-rose-500/20">Recommended</span>
              </span>
              <span class="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                Automatically filters pins during this sweep (&ge;100 saves/repins or fresh viral) and saves them directly into your Winning Pins Archive.
              </span>
            </div>
          </label>
        </div>

        <!-- Ingest Interval Selector -->
        <div>
          <label class="block font-bold text-slate-800 dark:text-slate-200 mb-1">Discovery / Ingest Interval:</label>
          <select x-model="newCompetitorInterval" class="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-900/90 border border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-white font-semibold text-xs outline-none focus:ring-2 focus:ring-purple-500">
            <option value="daily">Daily (Automated Ingest via Cron)</option>
            <option value="weekly">Weekly Sweep</option>
            <option value="manual">Manual Only</option>
          </select>
        </div>
      </div>

      <!-- Modal Footer -->
      <div class="pt-3 border-t border-slate-200 dark:border-[#27272A] flex justify-end space-x-2.5">
        <button @click="isAddCompetitorModalOpen = false" class="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition">Cancel</button>
        <button @click="submitTrackCreatorUnified()" :disabled="!newCompetitorHandle.trim() || isSubmittingCreator" class="px-5 py-2.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition active:scale-95 disabled:opacity-50 flex items-center space-x-2 shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 cursor-pointer">
          <i data-lucide="plus" class="w-3.5 h-3.5" :class="{'animate-spin': isSubmittingCreator}"></i>
          <span x-text="isSubmittingCreator ? 'Tracking Creator...' : 'Track Creator'"></span>
        </button>
      </div>
    </div>
  </div>

  <!-- Modal: GitHub Actions 20-Runner Crawler & Board Partitioning Dispatch -->
  <div x-show="isGhaCrawlerModalOpen" x-cloak class="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4" @keydown.escape.window="isGhaCrawlerModalOpen = false">
    <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-3xl w-full max-w-xl shadow-2xl p-6 sm:p-7 space-y-5" role="dialog" aria-modal="true" aria-label="Launch 20-Runner Parallel Crawler" @click.away="isGhaCrawlerModalOpen = false">
      <!-- Modal Header -->
      <div class="flex items-center justify-between border-b border-slate-200 dark:border-[#27272A]/80 pb-4">
        <div class="flex items-center space-x-3">
          <div class="w-10 h-10 rounded-2xl bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 flex items-center justify-center shadow-xs">
            <i data-lucide="git-branch" class="w-5 h-5"></i>
          </div>
          <div>
            <h3 class="font-bold text-slate-900 dark:text-white text-base">Launch 20-Runner Parallel Crawler</h3>
            <p class="text-xs text-slate-500 dark:text-slate-400">
              Target: <strong class="text-sky-500 font-mono" x-text="'@' + ghaTargetAccount"></strong> • Board-Level Parallel Partitioning
            </p>
          </div>
        </div>
        <button @click="isGhaCrawlerModalOpen = false" class="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>

      <!-- Scope: All Boards vs Selected Boards -->
      <div class="space-y-4 text-xs">
        <div>
          <label class="block font-bold text-slate-800 dark:text-slate-200 mb-2">Board Crawl Scope:</label>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <label class="flex items-start gap-2.5 p-3 rounded-2xl border cursor-pointer transition" :class="ghaBoardScope === 'all' ? 'bg-sky-50/50 dark:bg-sky-950/30 border-sky-500 text-sky-700 dark:text-sky-300 shadow-2xs font-bold' : 'border-slate-200 dark:border-[#27272A] text-slate-600 dark:text-slate-400'">
              <input type="radio" value="all" x-model="ghaBoardScope" class="mt-0.5 text-sky-600">
              <div>
                <div class="text-xs font-bold">All Creator Boards</div>
                <div class="text-[10.5px] font-normal text-slate-500 dark:text-slate-400 mt-0.5">Distribute all <span class="font-mono font-bold" x-text="activeCreatorBoards.length"></span> boards across 20 runners (idx % 20).</div>
              </div>
            </label>
            <label class="flex items-start gap-2.5 p-3 rounded-2xl border cursor-pointer transition" :class="ghaBoardScope === 'custom' ? 'bg-sky-50/50 dark:bg-sky-950/30 border-sky-500 text-sky-700 dark:text-sky-300 shadow-2xs font-bold' : 'border-slate-200 dark:border-[#27272A] text-slate-600 dark:text-slate-400'">
              <input type="radio" value="custom" x-model="ghaBoardScope" class="mt-0.5 text-sky-600">
              <div>
                <div class="text-xs font-bold">Select Specific Boards</div>
                <div class="text-[10.5px] font-normal text-slate-500 dark:text-slate-400 mt-0.5">Pick target boards manually. Selected boards are split across runners.</div>
              </div>
            </label>
          </div>
        </div>

        <!-- Custom Board Selection Panel -->
        <div x-show="ghaBoardScope === 'custom'" class="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-[#27272A] space-y-2.5">
          <div class="flex items-center justify-between gap-2">
            <span class="text-xs font-bold text-slate-700 dark:text-slate-300">
              Selected: <strong class="font-mono text-sky-500" x-text="ghaTargetBoards.length"></strong> of <span class="font-mono" x-text="activeCreatorBoards.length"></span> boards
            </span>
            <div class="flex items-center gap-2">
              <button type="button" @click="selectAllGhaBoards()" class="text-[11px] font-bold text-sky-600 hover:underline cursor-pointer">Select All</button>
              <span>•</span>
              <button type="button" @click="deselectAllGhaBoards()" class="text-[11px] font-bold text-slate-400 hover:text-slate-600 cursor-pointer">Clear</button>
            </div>
          </div>

          <!-- Board Search Input -->
          <div class="relative">
            <input type="text" x-model="ghaBoardSearch" placeholder="Filter boards..." class="w-full pl-8 pr-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-white text-xs outline-none focus:ring-1 focus:ring-sky-500">
            <i data-lucide="search" class="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5"></i>
          </div>

          <!-- Checkbox List -->
          <div class="max-h-48 overflow-y-auto space-y-1 pr-1">
            <template x-for="b in filteredGhaBoards" :key="b.board_id || b.name">
              <label class="flex items-center justify-between p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/60 cursor-pointer text-xs transition">
                <div class="flex items-center gap-2">
                  <input type="checkbox" :value="b.name" :checked="ghaTargetBoards.includes(b.name)" @change="toggleGhaBoardSelection(b.name)" class="rounded border-slate-300 dark:border-slate-700 text-sky-600 focus:ring-sky-500">
                  <span class="font-medium text-slate-800 dark:text-slate-200" x-text="b.name"></span>
                </div>
                <span class="font-mono text-[10.5px] px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400" x-text="(b.pin_count || 0) + ' pins'"></span>
              </label>
            </template>
          </div>
        </div>

        <!-- Crawl Depth Mode -->
        <div>
          <label class="block font-bold text-slate-800 dark:text-slate-200 mb-2">Crawl Architecture & Depth:</label>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <label class="flex items-start gap-2.5 p-3 rounded-2xl border cursor-pointer transition" :class="ghaCrawlMode === 'discovery' ? 'bg-amber-50/50 dark:bg-amber-950/30 border-amber-500 text-amber-700 dark:text-amber-300 font-bold shadow-2xs' : 'border-slate-200 dark:border-[#27272A] text-slate-600 dark:text-slate-400'">
              <input type="radio" value="discovery" x-model="ghaCrawlMode" class="mt-0.5 text-amber-600">
              <div>
                <div class="text-xs font-bold">⚡ Recent Pins Feed (Early-Stop: 3 pages)</div>
                <div class="text-[10.5px] font-normal text-slate-500 dark:text-slate-400 mt-0.5">Fetches newest ~75 pins. Fast check for daily additions and fresh breakouts.</div>
              </div>
            </label>
            <label class="flex items-start gap-2.5 p-3 rounded-2xl border cursor-pointer transition" :class="ghaCrawlMode === 'sharded_boards' ? 'bg-emerald-50/50 dark:bg-emerald-950/30 border-emerald-500 text-emerald-700 dark:text-emerald-300 font-bold shadow-2xs' : 'border-slate-200 dark:border-[#27272A] text-slate-600 dark:text-slate-400'">
              <input type="radio" value="sharded_boards" x-model="ghaCrawlMode" class="mt-0.5 text-emerald-600">
              <div>
                <div class="text-xs font-bold">🌊 Full Catalog & Boards (Deep: up to 500 pages)</div>
                <div class="text-[10.5px] font-normal text-slate-500 dark:text-slate-400 mt-0.5">20-node fleet sweeps all personal boards and up to 12,500 pins across fleet.</div>
              </div>
            </label>
          </div>
        </div>
      </div>

      <!-- Action Footer -->
      <div class="pt-4 border-t border-slate-200 dark:border-[#27272A] flex items-center justify-between">
        <button @click="isGhaCrawlerModalOpen = false" class="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-700 cursor-pointer">Cancel</button>
        <button @click="submitGhaCrawlerDispatch()" :disabled="isDispatchingGitHubCrawl || (ghaBoardScope === 'custom' && ghaTargetBoards.length === 0)" class="px-5 py-2.5 rounded-xl text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white transition active:scale-95 disabled:opacity-50 flex items-center space-x-2 shadow-md shadow-sky-600/20 cursor-pointer">
          <i data-lucide="zap" class="w-4 h-4" :class="isDispatchingGitHubCrawl ? 'animate-spin' : ''"></i>
          <span x-text="isDispatchingGitHubCrawl ? 'Launching 20 Runners...' : '🚀 Launch 20-Runner Crawler'"></span>
        </button>
      </div>
    </div>
  </div>

  <!-- Modal: Bulk Add Related Pin Seeds -->
  <div x-show="isBulkAddSeedsModalOpen" x-cloak class="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4" @keydown.escape.window="isBulkAddSeedsModalOpen = false">
    <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-4 text-slate-900 dark:text-[#FAFAFA]" role="dialog" aria-modal="true" aria-label="Bulk Add Related Pin Seeds" @click.away="isBulkAddSeedsModalOpen = false">
      <div class="flex items-center justify-between border-b border-slate-200 dark:border-[#27272A] pb-3">
        <div class="flex items-center space-x-2.5">
          <div class="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600 dark:text-amber-400">
            <i data-lucide="network" class="w-4 h-4"></i>
          </div>
          <div>
            <h3 class="font-bold text-sm">Bulk Add Related Pin Seeds</h3>
            <p class="text-[11px] text-slate-500">Track seed pins for @<span x-text="(activeCreator?.username || '').replace(/^@+/, '')"></span> to calculate multi-seed graph intersections.</p>
          </div>
        </div>
        <button @click="isBulkAddSeedsModalOpen = false" class="text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>

      <div class="space-y-3">
        <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300">
          Enter Pinterest Pin IDs or URLs (one per line, comma or space separated):
        </label>
        <textarea
          x-model="bulkAddSeedsInput"
          rows="6"
          placeholder="e.g.&#10;1688918607652644&#10;https://www.pinterest.com/pin/43699058883005370/&#10;43699058883005370"
          class="w-full rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#18181B] p-3 text-xs font-mono tabular-nums text-slate-900 dark:text-[#FAFAFA] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
        ></textarea>
        <div class="flex items-start gap-1.5 text-[11px] text-slate-400">
          <i data-lucide="info" class="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5"></i>
          <span>Any valid 15-20 digit pin ID will be automatically parsed, deduplicated, and registered to this account.</span>
        </div>
      </div>

      <div class="pt-3 border-t border-slate-200 dark:border-[#27272A] flex items-center justify-between">
        <button
          type="button"
          @click="autoAddTop10WinningSeedsAction(); isBulkAddSeedsModalOpen = false"
          class="text-xs text-amber-600 dark:text-amber-400 font-bold hover:underline cursor-pointer flex items-center gap-1"
        >
          <i data-lucide="sparkles" class="w-3.5 h-3.5"></i>
          <span>Auto-add Top 10 Winning Pins</span>
        </button>
        <div class="flex items-center gap-2">
          <button
            type="button"
            @click="isBulkAddSeedsModalOpen = false"
            class="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            @click="addBulkSeedsAction()"
            :disabled="isAddingSeeds || !bulkAddSeedsInput.trim()"
            class="px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white disabled:opacity-40 transition shadow-sm cursor-pointer flex items-center gap-1.5"
          >
            <i data-lucide="plus-circle" class="w-3.5 h-3.5" :class="isAddingSeeds ? 'animate-spin' : ''"></i>
            <span x-text="isAddingSeeds ? 'Registering...' : 'Register Seeds'"></span>
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Floating Action Bar for Selected Account Pins (Fixed bottom toolbar) -->
  <div
    x-show="selectedCreatorPinIds.length > 0 && isDossierOpen"
    x-cloak
    class="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900/95 dark:bg-[#121215]/95 text-white backdrop-blur-md border border-slate-700/80 dark:border-[#27272A] rounded-2xl px-5 py-3 shadow-2xl flex items-center gap-4 animate-in fade-in slide-in-from-bottom-5"
  >
    <div class="flex items-center gap-2">
      <span class="flex h-2.5 w-2.5 rounded-full bg-amber-400 motion-safe:animate-pulse"></span>
      <span class="font-mono text-xs font-bold" x-text="selectedCreatorPinIds.length + ' Pin(s) Selected'"></span>
    </div>
    <div class="h-4 w-px bg-slate-700"></div>
    <div class="flex items-center gap-2">
      <button
        type="button"
        @click="analyzeSelectedPinsAsRelated()"
        :disabled="isAddingSeeds"
        class="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-white text-xs font-bold transition shadow-sm cursor-pointer flex items-center gap-1.5"
      >
        <i data-lucide="network" class="w-3.5 h-3.5" :class="isAddingSeeds ? 'animate-spin' : ''"></i>
        <span>🕸️ Analyze Related Pins Radar</span>
      </button>
      <button
        type="button"
        @click="clearSelectedCreatorPins()"
        class="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
      >
        Clear
      </button>
    </div>
  </div>

  <!-- ======================================================== -->
  <!-- BOARD SECTIONS INSPECTOR MODAL                          -->
  <!-- ======================================================== -->
  <div x-show="isBoardSectionsModalOpen" x-cloak
       class="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4"
       @keydown.escape.window="isBoardSectionsModalOpen = false">
    <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl w-full max-w-xl shadow-2xl p-5 space-y-4 text-slate-900 dark:text-[#FAFAFA]"
         role="dialog" aria-modal="true" aria-label="Board Sections Inspector"
         @click.away="isBoardSectionsModalOpen = false">
      
      <!-- Header -->
      <div class="flex items-center justify-between border-b border-slate-200 dark:border-[#27272A] pb-3">
        <div class="flex items-center space-x-2">
          <i data-lucide="folder" class="w-5 h-5 text-amber-500"></i>
          <div>
            <h3 class="font-bold text-sm text-slate-900 dark:text-white flex items-center space-x-1.5">
              <span>Board Sections:</span>
              <span class="text-amber-600 dark:text-amber-400 font-mono" x-text="boardSectionsTitle"></span>
            </h3>
            <p class="text-[11px] text-slate-500 font-mono" x-text="'Board ID: ' + boardSectionsBoardId"></p>
          </div>
        </div>
        <button @click="isBoardSectionsModalOpen = false" class="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>

      <!-- Body -->
      <div class="space-y-3">
        <!-- Loading -->
        <div x-show="isLoadingBoardSections" class="py-8 text-center space-y-2">
          <i data-lucide="loader" class="w-6 h-6 animate-spin mx-auto text-amber-500"></i>
          <p class="text-xs text-slate-400 font-mono">Fetching board sections via Pinterest BoardSectionsResource...</p>
        </div>

        <!-- Empty -->
        <div x-show="!isLoadingBoardSections && boardSectionsList.length === 0" class="py-8 text-center text-slate-400 text-xs font-mono">
          No subsections found for this board (all pins reside in main board catalog).
        </div>

        <!-- Sections List -->
        <div x-show="!isLoadingBoardSections && boardSectionsList.length > 0" class="divide-y divide-slate-100 dark:divide-slate-800/80 max-h-96 overflow-y-auto">
          <template x-for="sec in boardSectionsList" :key="sec.id || sec.title">
            <div class="py-2.5 px-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-900/40 rounded-xl transition">
              <div class="flex items-center space-x-2.5">
                <span class="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold text-xs">📂</span>
                <div>
                  <div class="font-bold text-xs text-slate-900 dark:text-white" x-text="sec.title || sec.name"></div>
                  <div class="text-[10px] text-slate-400 font-mono" x-text="'Slug: ' + (sec.slug || 'default')"></div>
                </div>
              </div>
              <div class="flex items-center space-x-3 font-mono tabular-nums text-xs">
                <span class="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold" x-text="formatNumber(sec.pin_count || 0) + ' pins'"></span>
                <a :href="safeUrl(sec.url || ('https://www.pinterest.com' + (sec.slug ? '/' + sec.slug : '')))" target="_blank" rel="noopener noreferrer" class="text-slate-400 hover:text-slate-900 dark:hover:text-white">
                  <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                </a>
              </div>
            </div>
          </template>
        </div>
      </div>

      <!-- Footer -->
      <div class="pt-3 border-t border-slate-200 dark:border-[#27272A] flex justify-between items-center text-xs">
        <span class="text-slate-500 font-mono tabular-nums text-[11px]" x-text="boardSectionsList.length + ' Total Subsections'"></span>
        <button @click="isBoardSectionsModalOpen = false" class="px-4 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition">Close</button>
      </div>

    </div>
  </div>

  <!-- ======================================================== -->
  <!-- CREATOR HUB: AUTO-PROMOTE & BREAKOUT RULES MODAL         -->
  <!-- ======================================================== -->
  <div x-show="isAutoPromoteModalOpen" x-cloak
       class="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4"
       @keydown.escape.window="isAutoPromoteModalOpen = false">
    <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl w-full max-w-xl shadow-2xl p-6 space-y-5 text-slate-900 dark:text-[#FAFAFA]"
         role="dialog" aria-modal="true" aria-labelledby="auto-promote-modal-title"
         @click.away="isAutoPromoteModalOpen = false">

      <!-- Modal Header -->
      <div class="flex items-center justify-between border-b border-slate-200 dark:border-[#27272A] pb-3.5">
        <div class="flex items-center space-x-2.5">
          <div class="w-8 h-8 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 flex items-center justify-center font-bold">
            <i data-lucide="sliders" class="w-4 h-4"></i>
          </div>
          <div>
            <h3 id="auto-promote-modal-title" class="font-bold text-sm tracking-tight text-slate-900 dark:text-[#FAFAFA]">Auto-Promote & Breakout Rules</h3>
            <p class="text-[11px] text-slate-500 dark:text-[#71717A]">Configure viral thresholds to auto-graduate pulse_only creators into full catalog tracking.</p>
          </div>
        </div>
        <button @click="isAutoPromoteModalOpen = false" class="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#18181B] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>

      <!-- Section 1: Master Enable Toggle -->
      <div class="p-3.5 rounded-xl bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A] flex items-center justify-between">
        <div class="space-y-0.5 pr-4">
          <div class="text-xs font-bold text-slate-900 dark:text-[#FAFAFA]">Enable Automatic Breakout Promotion</div>
          <div class="text-[11px] text-slate-500 dark:text-[#71717A]">When active, daily crawlers graduate surging creators from pulse_only to full tracking.</div>
        </div>
        <label class="relative inline-flex items-center cursor-pointer shrink-0">
          <input type="checkbox" x-model="autoPromoteForm.auto_promote_enabled" class="sr-only peer">
          <div class="w-9 h-5 bg-slate-300 dark:bg-[#27272A] peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-rose-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rose-600"></div>
        </label>
      </div>

      <!-- Section 2: Surge Growth Thresholds -->
      <div class="space-y-3">
        <div class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-[#71717A] flex items-center space-x-1.5">
          <i data-lucide="trending-up" class="w-3.5 h-3.5 text-rose-500"></i>
          <span>Surge Growth Triggers (Total Audience)</span>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div class="p-3 rounded-xl bg-slate-50/50 dark:bg-[#18181B]/60 border border-slate-200 dark:border-[#27272A] space-y-1.5">
            <label class="block text-[11px] font-semibold text-slate-700 dark:text-[#A1A1AA]">24h Audience Gain Threshold</label>
            <div class="relative">
              <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-400">+</span>
              <input type="number" min="1000" step="1000" x-model.number="autoPromoteForm.auto_promote_delta_24h"
                     class="w-full pl-6 pr-3 py-1.5 text-xs font-mono tabular-nums rounded-lg bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-[#FAFAFA] focus:outline-none focus:ring-1 focus:ring-rose-500">
            </div>
            <p class="text-[10px] text-slate-400 font-mono">Default: 25,000 reach gain</p>
          </div>

          <div class="p-3 rounded-xl bg-slate-50/50 dark:bg-[#18181B]/60 border border-slate-200 dark:border-[#27272A] space-y-1.5">
            <label class="block text-[11px] font-semibold text-slate-700 dark:text-[#A1A1AA]">7d Audience Gain Threshold</label>
            <div class="relative">
              <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-400">+</span>
              <input type="number" min="5000" step="5000" x-model.number="autoPromoteForm.auto_promote_delta_7d"
                     class="w-full pl-6 pr-3 py-1.5 text-xs font-mono tabular-nums rounded-lg bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-[#FAFAFA] focus:outline-none focus:ring-1 focus:ring-rose-500">
            </div>
            <p class="text-[10px] text-slate-400 font-mono">Default: 100,000 reach gain</p>
          </div>
        </div>
      </div>

      <!-- Section 3: Deep Harvest Automation & Pin Limits -->
      <div class="space-y-3">
        <div class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-[#71717A] flex items-center space-x-1.5">
          <i data-lucide="layers" class="w-3.5 h-3.5 text-indigo-500"></i>
          <span>Post-Promotion Pin Harvesting</span>
        </div>
        <div class="p-3.5 rounded-xl bg-slate-50/50 dark:bg-[#18181B]/60 border border-slate-200 dark:border-[#27272A] space-y-3">
          <label class="flex items-center space-x-2.5 cursor-pointer">
            <input type="checkbox" x-model="autoPromoteForm.auto_harvest_pins" class="w-4 h-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500">
            <span class="text-xs font-semibold text-slate-900 dark:text-[#FAFAFA]">Immediately crawl top catalog pins upon promotion</span>
          </label>
          <div x-show="autoPromoteForm.auto_harvest_pins" class="flex items-center justify-between pt-2 border-t border-slate-200/60 dark:border-[#27272A]/60">
            <div class="text-[11px] text-slate-600 dark:text-[#A1A1AA]">Max Pins Harvest Limit:</div>
            <div class="flex items-center space-x-2">
              <input type="number" min="10" max="250" step="10" x-model.number="autoPromoteForm.max_pins_harvest"
                     class="w-20 px-2 py-1 text-xs font-mono tabular-nums text-right rounded-lg bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-[#FAFAFA] focus:outline-none focus:ring-1 focus:ring-rose-500">
              <span class="text-[11px] text-slate-400">pins</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Section 4: Winning Pin Qualification Criteria -->
      <div class="space-y-3">
        <div class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-[#71717A] flex items-center space-x-1.5">
          <i data-lucide="award" class="w-3.5 h-3.5 text-emerald-500"></i>
          <span>Inherited Qualification Rules</span>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div class="p-3 rounded-xl bg-slate-50/50 dark:bg-[#18181B]/60 border border-slate-200 dark:border-[#27272A] space-y-1.5">
            <label class="block text-[11px] font-semibold text-slate-700 dark:text-[#A1A1AA]">Min Saves to Qualify</label>
            <input type="number" min="0" step="50" x-model.number="autoPromoteForm.qualification_rules.min_saves"
                   class="w-full px-3 py-1.5 text-xs font-mono tabular-nums rounded-lg bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-[#FAFAFA] focus:outline-none focus:ring-1 focus:ring-rose-500">
            <p class="text-[10px] text-slate-400 font-mono">Default: 500 saves</p>
          </div>

          <div class="p-3 rounded-xl bg-slate-50/50 dark:bg-[#18181B]/60 border border-slate-200 dark:border-[#27272A] space-y-1.5">
            <label class="block text-[11px] font-semibold text-slate-700 dark:text-[#A1A1AA]">Min Daily Save Velocity</label>
            <input type="number" min="0" step="0.5" x-model.number="autoPromoteForm.qualification_rules.min_velocity"
                   class="w-full px-3 py-1.5 text-xs font-mono tabular-nums rounded-lg bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-[#FAFAFA] focus:outline-none focus:ring-1 focus:ring-rose-500">
            <p class="text-[10px] text-slate-400 font-mono">Default: 10.0 saves / day</p>
          </div>
        </div>
      </div>

      <!-- Modal Footer -->
      <div class="pt-4 border-t border-slate-200 dark:border-[#27272A] flex items-center justify-between">
        <button @click="resetAutoPromoteFormDefaults()" type="button" class="text-[11px] text-slate-500 hover:text-slate-800 dark:hover:text-[#FAFAFA] underline cursor-pointer">
          Restore Defaults
        </button>
        <div class="flex items-center space-x-2">
          <button @click="isAutoPromoteModalOpen = false" type="button" class="px-3 py-1.5 text-xs font-semibold rounded-xl border border-slate-200 dark:border-[#27272A] hover:bg-slate-100 dark:hover:bg-[#18181B] text-slate-700 dark:text-[#A1A1AA] transition">
            Cancel
          </button>
          <button @click="saveAutoPromoteSettings()" :disabled="isSavingAutoPromote" type="button"
                  class="px-4 py-1.5 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-500 text-white transition flex items-center space-x-1.5 shadow-sm active:scale-95 disabled:opacity-50 cursor-pointer">
            <i data-lucide="check" class="w-3.5 h-3.5" :class="{'animate-spin': isSavingAutoPromote}"></i>
            <span x-text="isSavingAutoPromote ? 'Saving...' : 'Save Rules'"></span>
          </button>
        </div>
      </div>

    </div>
  </div>`;
}
