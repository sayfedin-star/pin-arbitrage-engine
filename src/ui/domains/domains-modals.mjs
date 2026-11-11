/**
 * Domains Modals (Tactical Arbitrage Attack Blueprint & Pin Inspector)
 */
export function getDomainsModalsHtml() {
  return `  <!-- TACTICAL ARBITRAGE ATTACK BLUEPRINT MODAL (PILLAR 6) -->
  <div x-show="isBlueprintModalOpen"
       x-cloak
       class="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 sm:p-6"
       @keydown.escape.window="closeBlueprintModal()">
    <!-- Backdrop -->
    <div x-show="isBlueprintModalOpen"
         x-transition:enter="ease-out duration-200"
         x-transition:enter-start="opacity-0"
         x-transition:enter-end="opacity-100"
         x-transition:leave="ease-in duration-150"
         x-transition:leave-start="opacity-100"
         x-transition:leave-end="opacity-0"
         class="fixed inset-0 bg-slate-950/80 backdrop-blur-sm"
         @click="closeBlueprintModal()"></div>

    <!-- Modal Panel -->
    <div x-show="isBlueprintModalOpen"
         x-transition:enter="ease-out duration-300"
         x-transition:enter-start="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
         x-transition:enter-end="opacity-100 translate-y-0 sm:scale-100"
         x-transition:leave="ease-in duration-200"
         x-transition:leave-start="opacity-100 translate-y-0 sm:scale-100"
         x-transition:leave-end="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
         class="relative bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-3xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden z-10">

      <!-- Modal Header -->
      <div class="px-6 py-4 border-b border-slate-200 dark:border-[#27272A] bg-slate-50/80 dark:bg-[#09090B]/50 flex items-center justify-between gap-4">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500 to-rose-600 flex items-center justify-center text-white text-lg font-bold shadow-md shadow-rose-500/20">
            ⚡
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h2 class="text-base font-bold text-slate-900 dark:text-white font-mono tabular-nums" x-text="blueprintData?.domain || 'Generating Blueprint...'"></h2>
              <span class="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono tabular-nums bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30">
                Arbitrage Attack Plan
              </span>
            </div>
            <p class="text-xs text-slate-500 dark:text-slate-400">Algorithmic competitive blueprint: clone & outrank top money articles</p>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <button @click="copyBlueprintMarkdown()"
                  :disabled="!blueprintData"
                  class="px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold font-mono tabular-nums transition flex items-center gap-1.5 shadow-sm disabled:opacity-50">
            <span>📋</span>
            <span>Copy Markdown</span>
          </button>
          <button @click="exportBlueprintJson()"
                  :disabled="!blueprintData"
                  class="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-slate-700 dark:text-slate-200 text-xs font-semibold font-mono tabular-nums transition flex items-center gap-1.5 border border-slate-200 dark:border-[#27272A] disabled:opacity-50">
            <span>📥</span>
            <span>JSON</span>
          </button>
          <button @click="closeBlueprintModal()"
                  class="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center justify-center text-sm font-bold transition">
            ✕
          </button>
        </div>
      </div>

      <!-- Modal Body -->
      <div class="p-6 overflow-y-auto space-y-5">
        <!-- Loading -->
        <template x-if="blueprintLoading">
          <div class="py-20 text-center text-slate-400 font-mono tabular-nums flex flex-col items-center justify-center gap-2">
            <span class="animate-spin text-2xl">⚡</span>
            <span>Computing 6-Pillar Arbitrage Attack Blueprint...</span>
          </div>
        </template>

        <template x-if="!blueprintLoading && blueprintData">
          <div class="space-y-5 font-sans">
            <!-- 1. Top Target Articles (Pillar 6 & Pillar 2) -->
            <div class="bg-slate-50 dark:bg-[#09090B]/60 border border-slate-200 dark:border-[#27272A] rounded-2xl p-4 space-y-3">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="text-base">🎯</span>
                  <h3 class="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white font-mono tabular-nums">1. Top Target Articles to Clone & Outrank</h3>
                </div>
                <span class="text-[11px] text-slate-400 font-mono tabular-nums">Ranked by traffic velocity and monopoly slots</span>
              </div>

              <div class="space-y-2.5">
                <template x-for="art in blueprintData.top_articles" :key="art.slug">
                  <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-xl p-3 flex flex-col gap-2 shadow-sm">
                    <div class="flex items-start justify-between gap-3">
                      <div class="flex items-center gap-2 flex-wrap min-w-0">
                        <span class="w-5 h-5 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 font-mono tabular-nums text-[11px] font-bold flex items-center justify-center" x-text="art.priority"></span>
                        <span class="font-mono tabular-nums text-xs font-bold text-slate-900 dark:text-white truncate" x-text="art.slug"></span>
                        <template x-if="art.is_vulnerable">
                          <span class="px-1.5 py-0.2 rounded text-[9px] font-bold font-mono tabular-nums bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30">
                            ⚡ CRITICAL VULNERABLE
                          </span>
                        </template>
                      </div>
                      <div class="flex items-center gap-3 shrink-0 font-mono tabular-nums text-xs">
                        <span class="text-emerald-600 dark:text-emerald-400 font-bold" x-text="formatNumber(art.total_saves) + ' saves'"></span>
                        <span class="text-sky-600 dark:text-sky-400 font-bold" x-text="'#' + art.best_rank"></span>
                      </div>
                    </div>

                    <div class="flex items-center justify-between gap-2 flex-wrap text-[11px] pt-1 border-t border-slate-100 dark:border-[#27272A]">
                      <div class="flex items-center gap-1.5 flex-wrap">
                        <span class="text-slate-400 font-mono tabular-nums">Keywords:</span>
                        <template x-for="kw in art.target_keywords" :key="kw">
                          <span class="px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-700 dark:text-sky-300 font-mono tabular-nums text-[10px]" x-text="kw"></span>
                        </template>
                      </div>
                      <div class="flex items-center gap-1.5 flex-wrap">
                        <span class="text-slate-400 font-mono tabular-nums">Angle Used:</span>
                        <template x-for="ang in art.angles_used_by_competitor" :key="ang">
                          <span class="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#18181B] text-slate-700 dark:text-slate-300 font-mono tabular-nums text-[10px]" x-text="ang"></span>
                        </template>
                      </div>
                    </div>
                  </div>
                </template>
              </div>
            </div>

            <!-- 2. Winning Title Formulas & Visual Tags (Pillars 3 & 6) -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <!-- Title Blueprints -->
              <div class="bg-slate-50 dark:bg-[#09090B]/60 border border-slate-200 dark:border-[#27272A] rounded-2xl p-4 space-y-2.5">
                <div class="flex items-center gap-2">
                  <span class="text-base">✍️</span>
                  <h3 class="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white font-mono tabular-nums">2. Winning Title Blueprint Formulas</h3>
                </div>
                <div class="space-y-2">
                  <template x-for="(t, idx) in blueprintData.title_blueprints" :key="idx">
                    <div class="p-2.5 rounded-xl bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] font-mono tabular-nums text-xs flex items-center justify-between gap-2 shadow-sm">
                      <span class="text-slate-800 dark:text-slate-200" x-text="t"></span>
                      <button @click="copyToClipboard(t, 'Copied title formula!')" class="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-xs">📋</button>
                    </div>
                  </template>
                </div>
              </div>

              <!-- Computer Vision Tags -->
              <div class="bg-slate-50 dark:bg-[#09090B]/60 border border-slate-200 dark:border-[#27272A] rounded-2xl p-4 space-y-2.5">
                <div class="flex items-center gap-2">
                  <span class="text-base">🧬</span>
                  <h3 class="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white font-mono tabular-nums">3. Pinterest Computer Vision Targets</h3>
                </div>
                <div class="flex items-center gap-1.5 flex-wrap">
                  <template x-for="tag in blueprintData.visual_tags_checklist" :key="tag.tag">
                    <span class="px-2 py-1 rounded-lg bg-sky-500/10 text-sky-700 dark:text-sky-300 font-mono tabular-nums text-xs border border-sky-500/20 flex items-center gap-1 shadow-sm">
                      <span x-text="tag.tag"></span>
                      <span class="text-[9px] text-sky-500" x-text="'(' + tag.count + 'x)'"></span>
                    </span>
                  </template>
                </div>
              </div>
            </div>

            <!-- 3. Deployment Multiplier Strategy (Pillar 2 & 5) -->
            <div class="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 font-mono tabular-nums text-xs text-amber-900 dark:text-amber-300 space-y-2">
              <div class="font-bold flex items-center gap-2">
                <span>🚀</span>
                <span>Recommended 3-Pin Multiplier Strategy:</span>
              </div>
              <ul class="space-y-1 text-[11px] list-disc list-inside">
                <li><strong>Pin 1 (Speed & Convenience):</strong> 15-Minute Easy Prep angle targeting time-constrained searchers.</li>
                <li><strong>Pin 2 (Dietary Modification):</strong> Healthy/Keto/Low-Carb angle capturing specialized dietary intent.</li>
                <li><strong>Pin 3 (Family & Budget):</strong> Family-friendly crowd-pleaser / bulk meal-prep angle.</li>
              </ul>
            </div>
          </div>
        </template>
      </div>

    </div>
  </div>
`;
}
