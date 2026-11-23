/**
 * Dashboard Modals — Cluster Operations (Add Seed, Crawl Dispatcher, Delete/Purge, Cookie, Raw JSON)
 */
export function renderDashboardClusterModals() {
  return `  <!-- Add Seed Modal (Single Pin & Bulk Pins Mode) -->
  <div x-show="isAddSeedOpen" x-cloak class="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4" @keydown.escape.window="isAddSeedOpen = false">
    <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl w-full max-w-xl shadow-2xl p-6 space-y-4" role="dialog" aria-modal="true" aria-label="Add Tracked Seeds to PostgreSQL" @click.away="isAddSeedOpen = false">
      
      <!-- Modal Header -->
      <div class="flex items-center justify-between border-b border-slate-200 dark:border-[#27272A] pb-3">
        <div class="flex items-center space-x-2">
          <div class="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center">
            <i data-lucide="plus-circle" class="w-4 h-4"></i>
          </div>
          <div>
            <h3 class="font-bold text-slate-900 dark:text-white text-sm">Add Tracked Seeds to PostgreSQL</h3>
            <p class="text-[11px] text-slate-500">Insert single seed or bulk-import dozens of Pinterest pins</p>
          </div>
        </div>
        <button @click="isAddSeedOpen = false" class="text-slate-400 hover:text-slate-700 dark:hover:text-white">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>

      <!-- Mode Tabs (Single Pin vs Bulk Pins) -->
      <div class="flex border-b border-slate-200 dark:border-[#27272A] text-xs font-semibold">
        <button @click="addSeedTab = 'bulk'" class="pb-2.5 px-4 border-b-2 flex items-center space-x-2 transition"
                :class="addSeedTab === 'bulk' ? 'border-rose-500 text-rose-600 dark:text-rose-400 font-bold' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'">
          <i data-lucide="layers" class="w-3.5 h-3.5"></i>
          <span>Bulk Pins Ingestion</span>
          <span class="px-1.5 py-0.2 rounded-full bg-rose-500/10 text-rose-600 text-[10px] font-bold">Fast</span>
        </button>
        <button @click="addSeedTab = 'single'" class="pb-2.5 px-4 border-b-2 flex items-center space-x-2 transition"
                :class="addSeedTab === 'single' ? 'border-rose-500 text-rose-600 dark:text-rose-400 font-bold' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'">
          <i data-lucide="hash" class="w-3.5 h-3.5"></i>
          <span>Single Pin</span>
        </button>
      </div>

      <!-- Tab A: Bulk Pins Ingestion -->
      <div x-show="addSeedTab === 'bulk'" class="space-y-3.5 text-xs">
        <div>
          <div class="flex items-center justify-between mb-1">
            <label class="font-semibold text-slate-700 dark:text-slate-300">
              Paste Pinterest Pin IDs or URLs
            </label>
            <span class="font-mono text-[11px]" :class="bulkParsedPinIds.length > 0 ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-slate-400'"
                  x-text="bulkParsedPinIds.length + ' Valid Pins Detected'"></span>
          </div>
          <textarea x-model="bulkPinsInput" rows="6" placeholder="Paste pin IDs or URLs (one per line, comma or space-separated):&#10;1125829606880675896&#10;https://www.pinterest.com/pin/951737333775793129/&#10;146437425381037749"
                    class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-white focus:outline-none focus:border-rose-500 font-mono text-[11px]"></textarea>
          <p class="text-[10px] text-slate-400 mt-1">Smart parser extracts raw 18-20 digit Pin IDs automatically and strips duplicates in real time.</p>
        </div>

        <!-- Detected Pins Preview Chips -->
        <template x-if="bulkParsedPinIds.length > 0">
          <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-[#27272A] space-y-1.5">
            <div class="text-[10px] font-mono text-slate-500 flex items-center justify-between">
              <span>Preview Extracted IDs:</span>
              <span class="font-bold text-slate-700 dark:text-slate-300" x-text="bulkParsedPinIds.length + ' items'"></span>
            </div>
            <div class="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
              <template x-for="pid in bulkParsedPinIds.slice(0, 20)" :key="pid">
                <span class="px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px] font-mono text-slate-700 dark:text-slate-300" x-text="pid"></span>
              </template>
              <template x-if="bulkParsedPinIds.length > 20">
                <span class="px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-700 text-[10px] font-mono text-slate-500" x-text="'+' + (bulkParsedPinIds.length - 20) + ' more'"></span>
              </template>
            </div>
          </div>
        </template>

        <!-- Options: Label Prefix & Classification -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Label Prefix / Campaign Name</label>
            <input type="text" x-model="bulkLabelPrefix" placeholder="e.g. Recipe Cluster" class="w-full px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-white focus:outline-none focus:border-rose-500 text-xs">
          </div>
          <div>
            <label class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Classification Type</label>
            <select x-model="bulkIsCompetitor" class="w-full px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-white focus:outline-none focus:border-rose-500 text-xs">
              <option :value="true">Competitor Cluster</option>
              <option :value="false">Internal / Our Seed</option>
            </select>
          </div>
        </div>

        <!-- Crawl Execution Settings -->
        <div class="p-3 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 flex items-center justify-between">
          <label class="flex items-center space-x-2 cursor-pointer">
            <input type="checkbox" x-model="bulkAutoCrawl" class="w-4 h-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500">
            <div>
              <span class="font-bold text-slate-900 dark:text-slate-100">Auto-Crawl Pins Immediately</span>
              <p class="text-[10px] text-slate-500">Trigger crawl pipeline right after inserting seeds into PostgreSQL</p>
            </div>
          </label>
          <div x-show="bulkAutoCrawl" class="flex items-center space-x-1.5 text-[11px] font-mono">
            <label class="flex items-center space-x-1 cursor-pointer">
              <input type="radio" value="workflow" x-model="bulkCrawlEngine" class="text-rose-600">
              <span class="inline-flex items-center gap-1"><i data-lucide="rocket" class="w-3 h-3 shrink-0"></i><span>GitHub Actions</span></span>
            </label>
            <label class="flex items-center space-x-1 cursor-pointer">
              <input type="radio" value="local" x-model="bulkCrawlEngine" class="text-rose-600">
              <span class="inline-flex items-center gap-1"><i data-lucide="laptop" class="w-3 h-3 shrink-0"></i><span>Local</span></span>
            </label>
          </div>
        </div>

        <div class="pt-3 border-t border-slate-200 dark:border-[#27272A] flex justify-end space-x-2">
          <button @click="isAddSeedOpen = false" class="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-700">Cancel</button>
          <button @click="submitBulkSeeds()" :disabled="bulkParsedPinIds.length === 0 || isSubmittingBulk" class="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition active:scale-95 disabled:opacity-50 flex items-center space-x-1.5 shadow-sm">
            <i data-lucide="check" class="w-3.5 h-3.5"></i>
            <span x-text="isSubmittingBulk ? 'Importing Seeds...' : 'Import ' + bulkParsedPinIds.length + ' Seeds to PostgreSQL'"></span>
          </button>
        </div>
      </div>

      <!-- Tab B: Single Pin Mode -->
      <div x-show="addSeedTab === 'single'" class="space-y-3 text-xs">
        <div>
          <label class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Pinterest Pin ID</label>
          <input type="text" x-model="newSeed.pin_id" placeholder="e.g. 1125829606880675896" class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-white focus:outline-none focus:border-rose-500 font-mono">
        </div>
        <div>
          <label class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Label / Recipe Name</label>
          <input type="text" x-model="newSeed.label" placeholder="e.g. Slow Cooker Honey Garlic Competitor" class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-white focus:outline-none focus:border-rose-500">
        </div>
        <div class="flex items-center justify-between pt-1">
          <label class="flex items-center space-x-2 cursor-pointer">
            <input type="checkbox" x-model="newSeed.is_competitor" class="rounded border-slate-300 text-rose-600 focus:ring-rose-500">
            <span class="text-slate-600 dark:text-slate-300 font-medium">Competitor Seed Pin</span>
          </label>
          <label class="flex items-center space-x-2 cursor-pointer">
            <input type="checkbox" x-model="newSeed.auto_crawl" class="rounded border-slate-300 text-rose-600 focus:ring-rose-500">
            <span class="text-rose-600 dark:text-rose-400 font-medium font-mono">Auto-Crawl Now</span>
          </label>
        </div>

        <div class="pt-3 border-t border-slate-200 dark:border-[#27272A] flex justify-end space-x-2">
          <button @click="isAddSeedOpen = false" class="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-700">Cancel</button>
          <button @click="addSeed()" class="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition active:scale-95">Save Seed</button>
        </div>
      </div>

    </div>
  </div>

  <!-- Crawl Controller & Workflow Dispatcher Modal -->
  <div x-show="isCrawlModalOpen" x-cloak class="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4" @keydown.escape.window="isCrawlModalOpen = false">
    <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl w-full max-w-2xl shadow-2xl p-6 space-y-4" role="dialog" aria-modal="true" aria-label="Related Pins Crawler Dispatcher" @click.away="isCrawlModalOpen = false">
      
      <!-- Modal Header -->
      <div class="flex items-center justify-between border-b border-slate-200 dark:border-[#27272A] pb-3">
        <div class="flex items-center space-x-2.5">
          <div class="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <i data-lucide="zap" class="w-4 h-4"></i>
          </div>
          <div>
            <h3 class="font-bold text-slate-900 dark:text-white text-sm">Related Pins Crawler Dispatcher</h3>
            <p class="text-[11px] text-slate-500">Execute targeted crawls locally or at scale via GitHub Actions Workflow</p>
          </div>
        </div>
        <button @click="isCrawlModalOpen = false" class="text-slate-400 hover:text-slate-700 dark:hover:text-white">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>

      <!-- Navigation Tabs: Launch Crawl vs Workflow Runs History -->
      <div class="flex border-b border-slate-200 dark:border-[#27272A] text-xs font-semibold">
        <button @click="crawlModalTab = 'launch'" class="pb-2.5 px-4 border-b-2 flex items-center space-x-2 transition"
                :class="crawlModalTab === 'launch' ? 'border-amber-500 text-amber-600 dark:text-amber-400 font-bold' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'">
          <i data-lucide="play" class="w-3.5 h-3.5"></i>
          <span>Launch Crawl</span>
        </button>
        <button @click="crawlModalTab = 'history'; fetchWorkflowRuns();" class="pb-2.5 px-4 border-b-2 flex items-center space-x-2 transition"
                :class="crawlModalTab === 'history' ? 'border-amber-500 text-amber-600 dark:text-amber-400 font-bold' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'">
          <i data-lucide="git-pull-request" class="w-3.5 h-3.5"></i>
          <span>GitHub Actions Workflow Runs (Live Log)</span>
          <span class="px-1.5 py-0.2 rounded-full bg-slate-200 dark:bg-slate-800 text-[10px]" x-text="workflowRuns.length"></span>
        </button>
      </div>

      <!-- Tab 1: Launch Crawl Config -->
      <div x-show="crawlModalTab === 'launch'" class="space-y-4 text-xs">
        
        <!-- Step 1: Target Scope Selection -->
        <div class="space-y-2">
          <label class="font-bold text-slate-900 dark:text-white block">1. Select Target Pin(s) Scope</label>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            
            <!-- Selected Pins Option -->
            <label class="p-3 rounded-xl border flex items-start space-x-3 cursor-pointer transition"
                   :class="[crawlTargetScope === 'selected' ? 'border-amber-500 bg-amber-50/20 dark:bg-amber-950/20' : 'border-slate-200 dark:border-[#27272A] hover:bg-slate-50 dark:hover:bg-slate-900/50', selectedSeedIds.length === 0 ? 'opacity-50 cursor-not-allowed' : '']">
              <input type="radio" value="selected" x-model="crawlTargetScope" :disabled="selectedSeedIds.length === 0" class="mt-0.5 text-amber-600 focus:ring-amber-500">
              <div>
                <span class="font-bold text-slate-800 dark:text-slate-200">Selected Pins</span>
                <span class="text-[10px] font-mono block text-slate-500" x-text="selectedSeedIds.length > 0 ? selectedSeedIds.length + ' seeds selected from list' : 'No seeds selected (Check seeds first)'"></span>
              </div>
            </label>

            <!-- Specific Pin ID Option -->
            <label class="p-3 rounded-xl border flex items-start space-x-3 cursor-pointer transition"
                   :class="crawlTargetScope === 'single' ? 'border-amber-500 bg-amber-50/20 dark:bg-amber-950/20' : 'border-slate-200 dark:border-[#27272A] hover:bg-slate-50 dark:hover:bg-slate-900/50'">
              <input type="radio" value="single" x-model="crawlTargetScope" class="mt-0.5 text-amber-600 focus:ring-amber-500">
              <div class="flex-1">
                <span class="font-bold text-slate-800 dark:text-slate-200">Specific Pin ID</span>
                <span class="text-[10px] text-slate-500 block">Single Pin ID to target</span>
              </div>
            </label>

            <!-- All Queued Seeds Option -->
            <label class="p-3 rounded-xl border flex items-start space-x-3 cursor-pointer transition"
                   :class="crawlTargetScope === 'queued' ? 'border-amber-500 bg-amber-50/20 dark:bg-amber-950/20' : 'border-slate-200 dark:border-[#27272A] hover:bg-slate-50 dark:hover:bg-slate-900/50'">
              <input type="radio" value="queued" x-model="crawlTargetScope" class="mt-0.5 text-amber-600 focus:ring-amber-500">
              <div>
                <span class="font-bold text-slate-800 dark:text-slate-200">All Queued Seeds</span>
                <span class="text-[10px] text-slate-500 block" x-text="seeds.filter(s => !s.last_crawled_at).length + ' pending seeds needing crawl'"></span>
              </div>
            </label>

            <!-- All Tracked Seeds Option -->
            <label class="p-3 rounded-xl border flex items-start space-x-3 cursor-pointer transition"
                   :class="crawlTargetScope === 'all' ? 'border-amber-500 bg-amber-50/20 dark:bg-amber-950/20' : 'border-slate-200 dark:border-[#27272A] hover:bg-slate-50 dark:hover:bg-slate-900/50'">
              <input type="radio" value="all" x-model="crawlTargetScope" class="mt-0.5 text-amber-600 focus:ring-amber-500">
              <div>
                <span class="font-bold text-slate-800 dark:text-slate-200">All Tracked Seeds (Sweep)</span>
                <span class="text-[10px] text-slate-500 block" x-text="'Force sweep all ' + seeds.length + ' tracked seeds'"></span>
              </div>
            </label>

          </div>

          <!-- Specific Pin ID input if 'single' chosen -->
          <div x-show="crawlTargetScope === 'single'" class="pt-1">
            <input type="text" x-model="crawlCustomPinId" placeholder="Enter target Pin ID (e.g. 1125829606880675896)" class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-white font-mono text-xs focus:outline-none focus:border-amber-500">
          </div>
        </div>

        <!-- Step 2: Execution Engine Selection -->
        <div class="space-y-2 pt-2 border-t border-slate-200 dark:border-[#27272A]">
          <label class="font-bold text-slate-900 dark:text-white block">2. Execution Engine & Runner</label>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            
            <!-- GitHub Actions Workflow Engine -->
            <label class="p-3 rounded-xl border flex items-start space-x-3 cursor-pointer transition"
                   :class="crawlEngine === 'workflow' ? 'border-purple-500 bg-purple-50/20 dark:bg-purple-950/20' : 'border-slate-200 dark:border-[#27272A] hover:bg-slate-50 dark:hover:bg-slate-900/50'">
              <input type="radio" value="workflow" x-model="crawlEngine" class="mt-0.5 text-purple-600 focus:ring-purple-500">
              <div>
                <div class="flex items-center space-x-1.5">
                  <span class="font-bold text-slate-800 dark:text-slate-200 inline-flex items-center gap-1"><i data-lucide="rocket" class="w-3.5 h-3.5 text-purple-500 shrink-0"></i><span>GitHub Actions Workflow</span></span>
                  <span class="px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-700 dark:text-purple-300 text-[9px] font-bold">20 Parallel Runners</span>
                </div>
                <p class="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                  Dispatches <code class="text-purple-600">related-pins-crawler.yml</code> (<code class="text-purple-600">mode: seed_deep</code>) via <strong>Parallel Matrix Partitioning (20 Concurrent Runners)</strong>. 60 pages deep per seed (~900 candidates) with isolated egress IPs.
                </p>
              </div>
            </label>

            <!-- Local Background Crawler Engine -->
            <label class="p-3 rounded-xl border flex items-start space-x-3 cursor-pointer transition"
                   :class="crawlEngine === 'local' ? 'border-amber-500 bg-amber-50/20 dark:bg-amber-950/20' : 'border-slate-200 dark:border-[#27272A] hover:bg-slate-50 dark:hover:bg-slate-900/50'">
              <input type="radio" value="local" x-model="crawlEngine" class="mt-0.5 text-amber-600 focus:ring-amber-500">
              <div>
                <span class="font-bold text-slate-800 dark:text-slate-200 inline-flex items-center gap-1"><i data-lucide="laptop" class="w-3.5 h-3.5 text-amber-500 shrink-0"></i><span>Local Background Process</span></span>
                <p class="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                  Spawns crawler asynchronously on this server via <code class="text-amber-600">node scripts/cluster-intelligence.mjs</code>. Instant feedback in top banner.
                </p>
              </div>
            </label>
          </div>
        </div>

        <!-- Pagination Depth -->
        <div class="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-[#27272A]">
          <div>
            <span class="font-semibold text-slate-800 dark:text-slate-200">Max Pagination Depth Per Seed</span>
            <span class="text-[10px] text-slate-500 block">Default 60 pages (~900 candidates per seed)</span>
          </div>
          <input type="number" x-model="crawlMaxPages" min="5" max="100" class="w-20 px-2 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-right font-mono font-bold text-xs">
        </div>

        <div class="pt-3 border-t border-slate-200 dark:border-[#27272A] flex justify-end space-x-2">
          <button @click="isCrawlModalOpen = false" class="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-700">Cancel</button>
          <button @click="executeCrawl()" :disabled="isTriggeringWorkflow || (crawlTargetScope === 'selected' && selectedSeedIds.length === 0)"
                  class="px-5 py-2 rounded-xl text-xs font-bold text-white transition active:scale-95 disabled:opacity-50 flex items-center space-x-2 shadow-sm"
                  :class="crawlEngine === 'workflow' ? 'bg-gradient-to-r from-purple-600 to-rose-600 hover:from-purple-500 hover:to-rose-500' : 'bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500'">
            <i data-lucide="zap" :class="{'animate-spin': isTriggeringWorkflow}" class="w-3.5 h-3.5"></i>
            <span x-text="isTriggeringWorkflow ? 'Triggering Workflow...' : 'Execute Crawl Pipeline'"></span>
          </button>
        </div>

      </div>

      <!-- Tab 2: GitHub Actions Workflow Runs History -->
      <div x-show="crawlModalTab === 'history'" class="space-y-3 text-xs">
        <div class="flex items-center justify-between">
          <span class="font-semibold text-slate-700 dark:text-slate-300">Recent Workflow Runs in GitHub Repository</span>
          <button @click="fetchWorkflowRuns()" :disabled="isLoadingWorkflowRuns" class="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 text-[11px] font-mono flex items-center space-x-1">
            <i data-lucide="refresh-cw" :class="{'animate-spin': isLoadingWorkflowRuns}" class="w-3 h-3"></i>
            <span>Refresh</span>
          </button>
        </div>

        <div class="border border-slate-200 dark:border-[#27272A] rounded-xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800/80 max-h-80 overflow-y-auto">
          <template x-for="run in workflowRuns" :key="run.databaseId">
            <div class="p-3 bg-white dark:bg-slate-900/50 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
              <div class="flex items-center space-x-3">
                <span class="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      :class="{
                        'bg-emerald-500': run.conclusion === 'success',
                        'bg-rose-500': run.conclusion === 'failure',
                        'bg-amber-500 motion-safe:animate-ping': run.status === 'in_progress' || run.status === 'queued',
                        'bg-slate-400': run.conclusion === 'cancelled'
                      }"></span>
                <div>
                  <div class="font-bold text-slate-900 dark:text-slate-100 flex items-center space-x-2">
                    <span x-text="run.displayTitle || 'Related Pins Crawler'"></span>
                    <span class="px-1.5 py-0.2 rounded text-[9px] font-mono uppercase"
                          :class="run.event === 'workflow_dispatch' ? 'bg-purple-500/10 text-purple-600' : 'bg-slate-500/10 text-slate-600'"
                          x-text="run.event"></span>
                  </div>
                  <div class="text-[10px] font-mono text-slate-400 flex items-center space-x-2 mt-0.5">
                    <span x-text="'Run #' + run.databaseId"></span>
                    <span>•</span>
                    <span x-text="new Date(run.createdAt).toLocaleString()"></span>
                  </div>
                </div>
              </div>

              <div class="flex items-center space-x-2">
                <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase"
                      :class="{
                        'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20': run.conclusion === 'success',
                        'bg-rose-500/10 text-rose-600 border border-rose-500/20': run.conclusion === 'failure',
                        'bg-amber-500/10 text-amber-600 border border-amber-500/20 motion-safe:animate-pulse': run.status === 'in_progress',
                        'bg-slate-500/10 text-slate-500 border border-slate-500/20': run.conclusion === 'cancelled'
                      }"
                      x-text="run.conclusion || run.status"></span>
                <a :href="safeUrl(run.url)" target="_blank" rel="noopener noreferrer" class="p-1 text-slate-400 hover:text-purple-500" title="View run log on GitHub Actions">
                  <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                </a>
              </div>
            </div>
          </template>

          <div x-show="workflowRuns.length === 0" class="p-6 text-center text-slate-400">
            <span>No workflow runs retrieved yet. Click Refresh to query GitHub.</span>
          </div>
        </div>

        <div class="pt-2 text-right">
          <button @click="isCrawlModalOpen = false" class="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-700">Close</button>
        </div>
      </div>

    </div>
  </div>

  <!-- Delete Confirmation & Database Purge Modal -->
  <div x-show="isDeleteModalOpen" x-cloak class="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4" @keydown.escape.window="isDeleteModalOpen = false">
    <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4" role="dialog" aria-modal="true" aria-label="Confirm Deletion" @click.away="isDeleteModalOpen = false">
      <div class="flex items-center space-x-3 text-rose-600 dark:text-rose-400 border-b border-slate-200 dark:border-[#27272A] pb-3">
        <div class="w-9 h-9 rounded-xl bg-rose-500/10 flex items-center justify-center">
          <i data-lucide="alert-triangle" class="w-5 h-5"></i>
        </div>
        <div>
          <h3 class="font-bold text-slate-900 dark:text-white text-sm">Confirm Deletion</h3>
          <p class="text-[11px] text-slate-500">Database cleanup & record removal</p>
        </div>
      </div>

      <div class="space-y-3 text-xs">
        <p class="text-slate-700 dark:text-slate-300 leading-relaxed">
          Are you sure you want to delete <strong class="text-rose-600 dark:text-rose-400" x-text="deleteTargetSummary"></strong>?
        </p>

        <!-- Prominent Purge Option Checkbox -->
        <div class="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 space-y-2">
          <label class="flex items-start space-x-2.5 cursor-pointer">
            <input type="checkbox" x-model="deletePurgeDatabase" class="mt-0.5 w-4 h-4 rounded border-rose-300 text-rose-600 focus:ring-rose-500">
            <div>
              <span class="font-bold text-rose-900 dark:text-rose-300">Comprehensive Purge from PostgreSQL Database</span>
              <p class="text-[11px] text-rose-800/80 dark:text-rose-400/80 mt-0.5 leading-relaxed">
                Permanently purges discovery capsules (<code class="text-[10px]">seed_guided_search_capsules</code>), analytical metrics (<code class="text-[10px]">cluster_arbitrage_metrics</code>), and orphaned graph candidates (<code class="text-[10px]">candidate_graph_nodes</code> — preserved automatically if still tracked in competitor seeds).
              </p>
            </div>
          </label>
        </div>
      </div>

      <div class="pt-3 border-t border-slate-200 dark:border-[#27272A] flex justify-end space-x-2">
        <button @click="isDeleteModalOpen = false" class="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-700">Cancel</button>
        <button @click="confirmDelete()" :disabled="isDeleting" class="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition active:scale-95 disabled:opacity-50 flex items-center space-x-1.5 shadow-sm">
          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          <span x-text="isDeleting ? 'Deleting...' : 'Confirm Delete'"></span>
        </button>
      </div>
    </div>
  </div>

  <!-- Cookie configuration centralized in /settings#cookie (V4 Wave 3) -->

  <!-- Direct Raw JSON Ingestion Modal -->
  <div x-show="isRawJsonModalOpen" x-cloak class="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4" @keydown.escape.window="isRawJsonModalOpen = false">
    <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl w-full max-w-2xl shadow-2xl p-6 space-y-4 text-slate-900 dark:text-[#FAFAFA]" role="dialog" aria-modal="true" aria-label="Direct Raw JSON Ingestion" @click.away="isRawJsonModalOpen = false">
      <div class="flex items-center justify-between border-b border-slate-200 dark:border-[#27272A] pb-3">
        <div class="flex items-center space-x-2">
          <i data-lucide="file-input" class="w-5 h-5 text-purple-500"></i>
          <h3 class="font-bold text-sm">Direct Raw JSON Ingestion</h3>
        </div>
        <button @click="isRawJsonModalOpen = false" class="text-slate-400 hover:text-slate-700 dark:hover:text-white">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>

      <div class="space-y-3 text-xs">
        <p class="text-slate-500 dark:text-slate-400">
          Paste the full raw response copied from the Network tab for (RelatedModulesResource). The engine will immediately extract BUBBLE_ONE_COL capsules, genuine RecGPT and NavBoost quotas, and persist all pins to PostgreSQL.
        </p>

        <div>
          <label class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Target Seed Pin ID</label>
          <input type="text" x-model="rawJsonTargetPin" class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-white font-mono" placeholder="e.g. 1127448087977177124">
        </div>

        <div>
          <label class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Raw Pinterest JSON Payload</label>
          <textarea x-model="rawJsonInput" rows="8" placeholder='{"resource_response": {"status": "success", "data": [...]}}' class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-white focus:outline-none focus:border-purple-500 font-mono text-[11px]"></textarea>
        </div>

        <div x-show="rawJsonStatusMsg" class="p-3 rounded-xl text-xs font-mono" :class="rawJsonIsError ? 'bg-rose-500/10 text-rose-600 border border-rose-500/20' : 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'" x-text="rawJsonStatusMsg"></div>
      </div>

      <div class="pt-3 border-t border-slate-200 dark:border-[#27272A] flex justify-end space-x-2">
        <button @click="isRawJsonModalOpen = false" class="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-700">Cancel</button>
        <button @click="submitRawJson()" :disabled="isSubmittingRawJson || !rawJsonInput.trim()" class="px-4 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white transition active:scale-95 disabled:opacity-50 flex items-center space-x-1.5">
          <i data-lucide="sparkles" class="w-3.5 h-3.5"></i>
          <span x-text="isSubmittingRawJson ? 'Ingesting...' : 'Ingest & Store in PostgreSQL'"></span>
        </button>
      </div>
    </div>
  </div>`;
}
