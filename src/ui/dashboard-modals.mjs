/**
 * src/ui/dashboard-modals.mjs
 *
 * Deconstructed Modular UI Subsystem: Dashboard Modals, Drawers & Lightbox
 * Extracted from monolithic src/dashboard-ui.mjs for Package P3 structural re-organization.
 */

export function getDashboardModalsHtml() {
  return `  <!-- ======================================================== -->
  <!-- FULL IMAGE LIGHTBOX MODAL (تكبير وتصفح الصور بالأسهم)    -->
  <!-- ======================================================== -->
  <div x-show="isLightboxOpen" x-cloak 
       class="fixed inset-0 z-[70] bg-slate-950/90 backdrop-blur-md flex flex-col justify-between p-4 sm:p-6"
       @keydown.escape.window="closeLightbox()"
       @keydown.arrow-left.window="if (isLightboxOpen) prevLightboxImage()"
       @keydown.arrow-right.window="if (isLightboxOpen) nextLightboxImage()">
    
    <!-- Lightbox Top Navigation Bar -->
    <div class="flex items-center justify-between text-white border-b border-slate-800/80 pb-3 max-w-5xl w-full mx-auto">
      <div class="flex items-center space-x-3">
        <span class="px-2.5 py-1 rounded-md text-[10px] font-mono tabular-nums font-bold uppercase bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
          EXPLORE ARTICLE CAPSULE
        </span>
        <span class="text-xs font-mono tabular-nums text-slate-400" x-text="'صورة ' + (lightboxIndex + 1) + ' من ' + (dossierGuidedCapsules ? dossierGuidedCapsules.length : 0)"></span>
      </div>

      <button @click="closeLightbox()" class="text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-slate-800 transition flex items-center space-x-1.5 font-mono text-xs">
        <span class="hidden sm:inline text-slate-500 text-[11px]">(ESC)</span>
        <i data-lucide="x" class="w-5 h-5"></i>
      </button>
    </div>

    <!-- Lightbox Center: Image with Prev/Next Navigation Buttons -->
    <div class="relative flex items-center justify-center flex-1 my-4 max-w-5xl w-full mx-auto overflow-hidden">
      <!-- Previous Button -->
      <button @click="prevLightboxImage()" 
              x-show="dossierGuidedCapsules && dossierGuidedCapsules.length > 1"
              class="absolute left-2 sm:left-4 z-10 p-3 rounded-full bg-slate-900/80 hover:bg-slate-800 text-white border border-slate-700/60 shadow-2xl transition active:scale-95 group"
              title="الصورة السابقة (Arrow Left)">
        <i data-lucide="chevron-left" class="w-6 h-6 group-hover:-translate-x-0.5 transition-transform"></i>
      </button>

      <!-- The Active Full-Size Image -->
      <template x-if="currentLightboxCapsule && currentLightboxCapsule.image_url">
        <img :src="currentLightboxCapsule.image_url" 
             :alt="currentLightboxCapsule.query_term" 
             class="max-h-[70vh] sm:max-h-[75vh] max-w-full object-contain rounded-2xl shadow-2xl border border-slate-800 transition-all duration-300">
      </template>

      <!-- Next Button -->
      <button @click="nextLightboxImage()" 
              x-show="dossierGuidedCapsules && dossierGuidedCapsules.length > 1"
              class="absolute right-2 sm:right-4 z-10 p-3 rounded-full bg-slate-900/80 hover:bg-slate-800 text-white border border-slate-700/60 shadow-2xl transition active:scale-95 group"
              title="الصورة التالية (Arrow Right)">
        <i data-lucide="chevron-right" class="w-6 h-6 group-hover:translate-x-0.5 transition-transform"></i>
      </button>
    </div>

    <!-- Lightbox Footer Info & Actions -->
    <div class="max-w-5xl w-full mx-auto bg-white/95 dark:bg-[#121215]/95 border border-slate-200 dark:border-[#27272A] rounded-2xl p-4 text-slate-900 dark:text-[#FAFAFA] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xl">
      <div class="space-y-1">
        <h4 class="text-base font-bold text-slate-900 dark:text-[#FAFAFA] tracking-wide flex items-center space-x-2">
          <i data-lucide="compass" class="w-4 h-4 text-rose-500"></i>
          <span x-text="currentLightboxCapsule?.query_term"></span>
        </h4>
        <p class="text-xs text-slate-500 dark:text-[#A1A1AA] font-mono tabular-nums">
          <span>Seed Pin ID:</span>
          <span class="text-rose-600 dark:text-rose-400 font-bold" x-text="activeDossierSeed?.pin_id"></span>
        </p>
      </div>

      <div class="flex items-center space-x-2">
        <button @click="copyGuidedPrompt(currentLightboxCapsule?.query_term)" class="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs font-mono tabular-nums transition active:scale-95 flex items-center space-x-1.5 shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">
          <i data-lucide="copy" class="w-3.5 h-3.5"></i>
          <span>Copy Midjourney Prompt</span>
        </button>
        <a :href="currentLightboxCapsule?.search_url || ('https://www.pinterest.com/search/pins/?q=' + encodeURIComponent(currentLightboxCapsule?.query_term || ''))" target="_blank" class="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-slate-700 dark:text-[#FAFAFA] text-xs font-mono tabular-nums transition flex items-center space-x-1.5 border border-slate-200 dark:border-[#27272A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500" title="Open Pinterest Search">
          <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
          <span>Pinterest Search</span>
        </a>
      </div>
    </div>

  </div>

  <!-- ======================================================== -->
  <!-- CANDIDATE DEEP-INSPECTION SLIDE-OVER & MENU MATRIX       -->
  <!-- ======================================================== -->
  <div x-show="isDossierOpen" x-cloak class="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-md flex justify-end" @keydown.escape.window="isDossierOpen = false">
    <div class="bg-white dark:bg-[#121215] border-l border-slate-200 dark:border-[#27272A] w-full max-w-2xl h-full min-h-screen shadow-2xl overflow-y-auto p-6 space-y-6 animate-in slide-in-from-right duration-200" role="dialog" aria-modal="true" aria-label="Candidate Pin Deep-Inspection Dossier" @click.away="isDossierOpen = false">
      
      <!-- Slide-over Header -->
      <div class="flex items-center justify-between border-b border-slate-200 dark:border-[#27272A] pb-4">
        <div class="flex items-center space-x-3">
          <div class="w-8 h-8 rounded-lg bg-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center">
            <i data-lucide="eye" class="w-4 h-4"></i>
          </div>
          <div>
            <h3 class="font-bold text-slate-900 dark:text-[#FAFAFA] text-base">Candidate Pin Deep-Inspection Dossier</h3>
            <p class="text-xs text-slate-500 dark:text-slate-400 font-mono" x-text="'Pin ID: ' + selectedCandidate?.candidate_pin_id"></p>
          </div>
        </div>
        <button @click="isDossierOpen = false" class="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition">
          <i data-lucide="x" class="w-5 h-5"></i>
        </button>
      </div>

      <!-- Pin Visual Dossier -->
      <div class="p-4 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-slate-900/60 space-y-3">
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-start space-x-3.5">
            <template x-if="selectedCandidate?.image_url">
              <a :href="'https://www.pinterest.com/pin/' + selectedCandidate?.candidate_pin_id + '/'" target="_blank" class="block relative flex-shrink-0 group/modal">
                <img :src="selectedCandidate.image_url" alt="Pin thumbnail" class="w-14 h-20 rounded-xl object-cover border shadow-md group-hover/modal:scale-110 transition-transform duration-200" :style="'border-color: ' + (selectedCandidate?.winning_color || selectedCandidate?.dominant_color || '#cbd5e1')">
              </a>
            </template>
            <div class="space-y-1">
              <span class="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">Inspected Title</span>
              <div class="text-sm font-bold text-slate-900 dark:text-white" x-text="selectedCandidate?.title"></div>
              <div class="text-[11px] font-mono text-slate-500 flex items-center space-x-2 pt-0.5 flex-wrap gap-y-1">
                <span x-text="selectedCandidate?.domain"></span>
                <span>•</span>
                <span class="text-rose-500 font-bold" x-text="Number(selectedCandidate?.total_saves || selectedCandidate?.saves || 0).toLocaleString() + ' Saves'"></span>
                <template x-if="selectedCandidate?.ingestion_method && selectedCandidate?.ingestion_method !== 'uploaded'">
                  <span>•</span>
                  <span class="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300" x-text="selectedCandidate.ingestion_method === 'csv_importer' ? '⚙️ CSV Farm' : (selectedCandidate.ingestion_method === 'pin_scheduling' ? '⏱️ Scheduled' : selectedCandidate.ingestion_method)"></span>
                </template>
              </div>
            </div>
          </div>
          <div class="flex items-center space-x-2 p-2 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-slate-950 flex-shrink-0">
            <span class="w-6 h-6 rounded-md border" :style="'background-color: ' + (selectedCandidate?.winning_color || selectedCandidate?.dominant_color || '#888888')"></span>
            <div class="text-[10px] font-mono">
              <div class="font-bold" x-text="selectedCandidate?.winning_color || selectedCandidate?.dominant_color"></div>
              <div class="text-slate-400 text-[9px]" x-text="selectedCandidate?.culinary_color_name"></div>
            </div>
          </div>
        </div>

        <template x-if="selectedCandidate?.ocr_text">
          <div class="p-2.5 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-[#27272A] text-xs font-mono">
            <div class="text-[10px] text-rose-500 font-bold">Pinterest Vision Model OCR Text:</div>
            <div class="text-slate-700 dark:text-slate-300 text-[11px] mt-0.5" x-text="selectedCandidate?.ocr_text"></div>
          </div>
        </template>
      </div>

      <!-- MODULE 3: Audience Pairing & Menu Matrix -->
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold uppercase font-mono tracking-wider text-slate-900 dark:text-white flex items-center space-x-1.5">
            <i data-lucide="utensils" class="w-3.5 h-3.5 text-amber-500"></i>
            <span>Module 3: Audience Pairing & Menu Matrix</span>
          </span>
          <span class="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            RecGPT Trajectory
          </span>
        </div>
        <p class="text-[11px] text-slate-500 dark:text-slate-400">
          Pinterest's sequential transformer predicts transition probabilities. Expand audience retention across these 3 cluster-derived moments:
        </p>

        <!-- 3 Trajectory Dish Cards (Dynamic per Candidate X) -->
        <div class="space-y-2.5">
          <!-- 1. Dinner Anchor -->
          <div class="p-3.5 rounded-xl border space-y-2 transition" :class="candidateTrajectory.anchor?.is_active_candidate ? 'border-rose-500 bg-rose-500/[0.06] shadow-sm' : 'border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-slate-900/60'">
            <div class="flex items-center justify-between">
              <div class="flex items-center space-x-2">
                <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30">
                  1. Dinner Anchor (Primary Entree)
                </span>
                <template x-if="candidateTrajectory.anchor?.is_active_candidate">
                  <span class="px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 flex items-center space-x-1">
                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 motion-safe:animate-ping"></span>
                    <span>Active Inspected Pin</span>
                  </span>
                </template>
                <template x-if="!candidateTrajectory.anchor?.is_active_candidate">
                  <span class="px-1.5 py-0.2 rounded text-[9px] font-mono text-slate-400 border border-slate-200 dark:border-[#27272A]">Cluster Pair</span>
                </template>
              </div>
              <span class="text-[11px] font-mono text-slate-400" x-text="'Prep: ' + (candidateTrajectory.anchor?.prep_time || '15m')"></span>
            </div>
            <div class="font-bold text-slate-900 dark:text-white text-xs" x-text="candidateTrajectory.anchor?.title || 'Dinner Anchor'"></div>
            <div class="flex items-center justify-between pt-1">
              <div class="flex items-center space-x-3 text-[11px] font-mono text-slate-500">
                <span>Save Rate: <strong class="text-emerald-600" x-text="(candidateTrajectory.anchor?.save_rate || candidateTrajectory.anchor?.avg_save_rate || 94.2) + '%'"></strong></span>
                <span>Affinity: <strong class="text-slate-700 dark:text-slate-300" x-text="(candidateTrajectory.anchor?.recgpt_transition_score || 98.5)"></strong></span>
                <template x-if="candidateTrajectory.anchor?.daily_velocity">
                  <span>Velocity: <strong class="text-rose-600 dark:text-rose-400" x-text="'⚡ ' + candidateTrajectory.anchor?.daily_velocity + '/d'"></strong></span>
                </template>
              </div>
              <button @click="copyPromptForPairing(candidateTrajectory.anchor?.title || 'Dinner Anchor')" class="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-[10px] transition active:scale-95 flex items-center space-x-1">
                <i data-lucide="zap" class="w-3 h-3"></i>
                <span>Generate Pin Asset</span>
              </button>
            </div>
          </div>

          <!-- 2. Navboost Co-visitor -->
          <div class="p-3.5 rounded-xl border space-y-2 transition" :class="candidateTrajectory.co_visitor?.is_active_candidate ? 'border-sky-500 bg-sky-500/[0.06] shadow-sm' : 'border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-slate-900/60'">
            <div class="flex items-center justify-between">
              <div class="flex items-center space-x-2">
                <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30">
                  2. Navboost Co-visitor (Complementary Side)
                </span>
                <template x-if="candidateTrajectory.co_visitor?.is_active_candidate">
                  <span class="px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 flex items-center space-x-1">
                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 motion-safe:animate-ping"></span>
                    <span>Active Inspected Pin</span>
                  </span>
                </template>
                <template x-if="!candidateTrajectory.co_visitor?.is_active_candidate">
                  <span class="px-1.5 py-0.2 rounded text-[9px] font-mono text-slate-400 border border-slate-200 dark:border-[#27272A]">Cluster Pair</span>
                </template>
              </div>
              <span class="text-[11px] font-mono text-slate-400" x-text="'Prep: ' + (candidateTrajectory.co_visitor?.prep_time || '20m')"></span>
            </div>
            <div class="font-bold text-slate-900 dark:text-white text-xs" x-text="candidateTrajectory.co_visitor?.title || 'Navboost Side'"></div>
            <div class="flex items-center justify-between pt-1">
              <div class="flex items-center space-x-3 text-[11px] font-mono text-slate-500">
                <span>Save Rate: <strong class="text-emerald-600" x-text="(candidateTrajectory.co_visitor?.save_rate || candidateTrajectory.co_visitor?.avg_save_rate || 88.7) + '%'"></strong></span>
                <span>Affinity: <strong class="text-slate-700 dark:text-slate-300" x-text="(candidateTrajectory.co_visitor?.recgpt_transition_score || 92.1)"></strong></span>
                <template x-if="candidateTrajectory.co_visitor?.daily_velocity">
                  <span>Velocity: <strong class="text-sky-600 dark:text-sky-400" x-text="'⚡ ' + candidateTrajectory.co_visitor?.daily_velocity + '/d'"></strong></span>
                </template>
              </div>
              <button @click="copyPromptForPairing(candidateTrajectory.co_visitor?.title || 'Navboost Side')" class="px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-semibold text-[10px] transition active:scale-95 flex items-center space-x-1">
                <i data-lucide="zap" class="w-3 h-3"></i>
                <span>Generate Pin Asset</span>
              </button>
            </div>
          </div>

          <!-- 3. Session Finisher -->
          <div class="p-3.5 rounded-xl border space-y-2 transition" :class="candidateTrajectory.finisher?.is_active_candidate ? 'border-amber-500 bg-amber-500/[0.06] shadow-sm' : 'border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-slate-900/60'">
            <div class="flex items-center justify-between">
              <div class="flex items-center space-x-2">
                <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                  3. Session Finisher (Board Saver Dessert)
                </span>
                <template x-if="candidateTrajectory.finisher?.is_active_candidate">
                  <span class="px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 flex items-center space-x-1">
                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 motion-safe:animate-ping"></span>
                    <span>Active Inspected Pin</span>
                  </span>
                </template>
                <template x-if="!candidateTrajectory.finisher?.is_active_candidate">
                  <span class="px-1.5 py-0.2 rounded text-[9px] font-mono text-slate-400 border border-slate-200 dark:border-[#27272A]">Cluster Pair</span>
                </template>
              </div>
              <span class="text-[11px] font-mono text-slate-400" x-text="'Prep: ' + (candidateTrajectory.finisher?.prep_time || '10m')"></span>
            </div>
            <div class="font-bold text-slate-900 dark:text-white text-xs" x-text="candidateTrajectory.finisher?.title || 'Session Finisher'"></div>
            <div class="flex items-center justify-between pt-1">
              <div class="flex items-center space-x-3 text-[11px] font-mono text-slate-500">
                <span>Save Rate: <strong class="text-emerald-600" x-text="(candidateTrajectory.finisher?.save_rate || candidateTrajectory.finisher?.avg_save_rate || 96.8) + '%'"></strong></span>
                <span>Affinity: <strong class="text-slate-700 dark:text-slate-300" x-text="(candidateTrajectory.finisher?.recgpt_transition_score || 97.4)"></strong></span>
                <template x-if="candidateTrajectory.finisher?.daily_velocity">
                  <span>Velocity: <strong class="text-amber-600 dark:text-amber-400" x-text="'⚡ ' + candidateTrajectory.finisher?.daily_velocity + '/d'"></strong></span>
                </template>
              </div>
              <button @click="copyPromptForPairing(candidateTrajectory.finisher?.title || 'Session Finisher')" class="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold text-[10px] transition active:scale-95 flex items-center space-x-1">
                <i data-lucide="zap" class="w-3 h-3"></i>
                <span>Generate Pin Asset</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Actionable Production Blueprint Studio -->
      <div class="space-y-3 pt-2 border-t border-slate-200 dark:border-[#27272A]">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold uppercase font-mono tracking-wider text-slate-900 dark:text-white flex items-center space-x-1.5">
            <i data-lucide="file-code" class="w-3.5 h-3.5 text-rose-500"></i>
            <span>Production Blueprint Studio ($1.99 Digital Asset)</span>
          </span>
          <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            99.4% dHash Unique
          </span>
        </div>

        <!-- 1. SEO Title -->
        <div class="space-y-1">
          <div class="flex items-center justify-between text-[11px]">
            <span class="font-semibold text-slate-600 dark:text-slate-400">Algorithmic SEO Title</span>
            <button @click="copyToClipboard(blueprintSeoTitle, 'seo')" class="text-rose-600 hover:underline font-mono">
              <span x-text="copiedField === 'seo' ? 'Copied!' : 'Copy'"></span>
            </button>
          </div>
          <div class="p-2.5 rounded-lg bg-slate-100 dark:bg-black/50 border border-slate-200 dark:border-[#27272A] font-mono text-xs text-slate-800 dark:text-slate-200" x-text="blueprintSeoTitle"></div>
        </div>

        <!-- 2. Midjourney Prompt -->
        <div class="space-y-1">
          <div class="flex items-center justify-between text-[11px]">
            <span class="font-semibold text-slate-600 dark:text-slate-400">Midjourney v6.1 Generation Prompt (--ar 9:16)</span>
            <button @click="copyToClipboard(blueprintMidjourney, 'midjourney')" class="text-amber-600 hover:underline font-mono">
              <span x-text="copiedField === 'midjourney' ? 'Copied!' : 'Copy'"></span>
            </button>
          </div>
          <div class="p-2.5 rounded-lg bg-slate-100 dark:bg-black/50 border border-slate-200 dark:border-[#27272A] font-mono text-[11px] leading-relaxed text-slate-700 dark:text-slate-300" x-text="blueprintMidjourney"></div>
        </div>

        <!-- 3. Dual JSON-LD Schema -->
        <div class="space-y-1">
          <div class="flex items-center justify-between text-[11px]">
            <span class="font-semibold text-slate-600 dark:text-slate-400">Dual JSON-LD Schema (Product + Recipe)</span>
            <button @click="copyToClipboard(blueprintJsonLd, 'jsonld')" class="text-emerald-600 hover:underline font-mono">
              <span x-text="copiedField === 'jsonld' ? 'Copied Schema!' : '1-Click Copy Schema'"></span>
            </button>
          </div>
          <pre class="p-3 rounded-lg bg-slate-100 dark:bg-black/60 border border-slate-200 dark:border-[#27272A] font-mono text-[10px] leading-relaxed max-h-40 overflow-y-auto text-slate-700 dark:text-slate-300" x-text="blueprintJsonLd"></pre>
        </div>
      </div>

    </div>
  </div>

  <!-- ======================================================== -->
  <!-- PIXIE MULTI-HIT CENTROID DOSSIER (SLIDE-OVER DRAWER)     -->
  <!-- Grounded in Pinterest Pixie WWW 2018 Paper (Sec 4.3)     -->
  <!-- ======================================================== -->
  <div x-show="isHubDrawerOpen" x-cloak 
       class="fixed inset-0 z-50 overflow-hidden bg-slate-950/75 backdrop-blur-sm flex justify-end" 
       @keydown.escape.window="closeHubDrawer()">
    <div class="bg-white dark:bg-[#121215] border-l border-slate-200 dark:border-[#27272A] w-full max-w-2xl h-full shadow-2xl overflow-y-auto p-6 space-y-6 animate-in slide-in-from-right duration-200" role="dialog" aria-modal="true" aria-label="Pixie Gravitational Centroid Dossier" 
         @click.away="closeHubDrawer()">
      
      <!-- Drawer Header -->
      <div class="flex items-start justify-between border-b border-slate-200 dark:border-[#27272A] pb-4">
        <div class="flex items-center space-x-3">
          <div class="w-10 h-10 rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30 flex items-center justify-center flex-shrink-0">
            <i data-lucide="git-merge" class="w-5 h-5"></i>
          </div>
          <div>
            <div class="flex items-center space-x-2">
              <h3 class="font-bold text-slate-900 dark:text-white text-base">Pixie Gravitational Centroid Dossier</h3>
              <template x-if="selectedHub">
                <span class="px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-wider" :class="getPixieResonance(selectedHub).badgeClass" x-text="getPixieResonance(selectedHub).label"></span>
              </template>
            </div>
            <p class="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">
              <span>Section 4.3 Multi-Query Bipartite Random Walk Centroid</span>
            </p>
          </div>
        </div>
        <button @click="closeHubDrawer()" class="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition">
          <i data-lucide="x" class="w-5 h-5"></i>
        </button>
      </div>

      <template x-if="selectedHub">
        <div class="space-y-6">

          <!-- 1. Media Preview & Key Identifiers -->
          <div class="p-4 rounded-2xl border border-slate-200 dark:border-[#27272A] bg-slate-50/80 dark:bg-slate-900/60 flex flex-col sm:flex-row gap-4 items-start">
            <!-- Pin Image (2:3 Aspect) -->
            <div class="w-32 sm:w-36 aspect-[2/3] rounded-xl overflow-hidden flex-shrink-0 border-2 shadow-md relative group" :style="'border-color: ' + (selectedHub.winning_color || '#cbd5e1')">
              <template x-if="selectedHub.image_url">
                <img :src="selectedHub.image_url" alt="Pin preview" class="w-full h-full object-cover">
              </template>
              <template x-if="!selectedHub.image_url">
                <div class="w-full h-full flex items-center justify-center bg-slate-200 dark:bg-slate-800 text-slate-400">
                  <i data-lucide="image" class="w-6 h-6"></i>
                </div>
              </template>
              <a :href="'https://www.pinterest.com/pin/' + selectedHub.candidate_pin_id + '/'" target="_blank" class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white text-xs font-semibold">
                <i data-lucide="external-link" class="w-4 h-4 mr-1"></i> View Live
              </a>
            </div>

            <!-- Details Stack -->
            <div class="flex-1 space-y-2.5 min-w-0">
              <div class="space-y-1">
                <div class="flex items-center space-x-2">
                  <span class="px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-wider" :class="{
                    'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20': selectedHub.format_type === 'PRODUCT CARD',
                    'bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20': selectedHub.format_type === 'ORGANIC PIN',
                    'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20': selectedHub.format_type === 'VIDEO PIN',
                    'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20': selectedHub.format_type === 'IDEA PIN'
                  }" x-text="selectedHub.format_type"></span>

                  <template x-if="selectedHub.is_vacuum_target">
                    <span class="px-2 py-0.5 rounded text-[9px] font-extrabold uppercase bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                      🎯 Vacuum Target
                    </span>
                  </template>
                </div>

                <h4 class="font-bold text-slate-900 dark:text-white text-sm leading-snug" x-text="selectedHub.title || ('Pin ' + selectedHub.candidate_pin_id)"></h4>
              </div>

              <!-- Metadata Pills -->
              <div class="flex items-center space-x-2 text-[11px] font-mono text-slate-500 flex-wrap gap-y-1">
                <span class="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300" x-text="selectedHub.domain"></span>
                <span>•</span>
                <button @click="copyToClipboard(selectedHub.candidate_pin_id, 'drawer-pin')" class="hover:text-amber-500 cursor-pointer flex items-center space-x-1">
                  <span x-text="'ID: ' + selectedHub.candidate_pin_id"></span>
                  <i data-lucide="copy" class="w-3 h-3"></i>
                </button>
              </div>

              <!-- Metrics Mini Bar -->
              <div class="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200/80 dark:border-[#27272A]/80 font-mono text-xs">
                <div>
                  <div class="text-[9px] uppercase text-slate-400">Total Saves</div>
                  <div class="font-bold text-slate-900 dark:text-white" x-text="Number(selectedHub.total_saves != null ? selectedHub.total_saves : (selectedHub.saves || 0)).toLocaleString()"></div>
                </div>
                <div>
                  <div class="text-[9px] uppercase text-slate-400">Repin Rate</div>
                  <div class="font-bold text-slate-900 dark:text-white" x-text="(selectedHub.avg_save_rate || selectedHub.save_rate || 0) + '%'"></div>
                </div>
                <div>
                  <div class="text-[9px] uppercase text-slate-400">Velocity</div>
                  <div class="font-bold text-emerald-600 dark:text-emerald-400" x-text="Number(selectedHub.daily_velocity || 0) > 0 ? ('🔥 ' + selectedHub.daily_velocity + '/d') : 'Stagnant'"></div>
                </div>
              </div>
            </div>
          </div>

          <!-- 2. Pixie Bipartite Multi-Query Formula Card (WWW 2018 Sec 4.3) -->
          <div class="p-4 rounded-2xl border border-purple-500/20 bg-purple-500/[0.04] space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold uppercase font-mono tracking-wider text-purple-700 dark:text-purple-300 flex items-center space-x-1.5">
                <i data-lucide="calculator" class="w-4 h-4"></i>
                <span>Pixie Multi-Hit Resonance Mathematics</span>
              </span>
              <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-500/20 text-purple-800 dark:text-purple-200 border border-purple-500/30" x-text="'Boost Factor: ' + getPixieResonance(selectedHub).boostFactor + 'x (k²)'"></span>
            </div>

            <p class="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed font-sans">
              Under Pinterest's Pixie formulation, visit counts across distinct query walks scale super-linearly: 
              <code class="px-1.5 py-0.5 rounded bg-purple-500/10 font-mono text-[10px] text-purple-600 dark:text-purple-300">S(p, Q) = (∑ √V)²</code>. 
              Because this pin was discovered across <strong class="text-purple-600 dark:text-purple-400" x-text="selectedHub.seed_overlap_count"></strong> distinct seed queries, its cross-cluster gravity is amplified <strong class="text-purple-600 dark:text-purple-400" x-text="getPixieResonance(selectedHub).boostFactor + 'x'"></strong>.
            </p>

            <!-- Visual Energy Bar in Drawer -->
            <div class="space-y-1 pt-1">
              <div class="flex items-center justify-between text-xs font-mono">
                <span class="text-slate-500">Aggregate Multi-Hit Mass</span>
                <span class="font-extrabold text-purple-600 dark:text-purple-400" x-text="Number(selectedHub.pixie_multihit_score || 0).toLocaleString()"></span>
              </div>
              <div class="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                <div class="h-full rounded-full transition-all duration-500" :class="getPixieResonance(selectedHub).barGradient" :style="'width: ' + getPixieResonance(selectedHub).barPercent + '%'"></div>
              </div>
            </div>
          </div>

          <!-- 3. Complete Originating Seeds Decomposition Matrix -->
          <div class="space-y-2.5">
            <div class="flex items-center justify-between">
              <h5 class="text-xs font-bold uppercase font-mono tracking-wider text-slate-800 dark:text-slate-200 flex items-center space-x-1.5">
                <i data-lucide="layers" class="w-3.5 h-3.5 text-amber-500"></i>
                <span>Originating Seeds Decomposition (<span x-text="(selectedHub.originating_seed_details || []).length"></span> Seeds)</span>
              </h5>
              <span class="text-[10px] font-mono text-slate-400">All Independent Walks</span>
            </div>

            <div class="border border-slate-200 dark:border-[#27272A] rounded-xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
              <template x-for="(s, idx) in (selectedHub.originating_seed_details || [])" :key="s.pin_id">
                <div class="p-3 bg-white dark:bg-slate-900/50 flex items-center justify-between text-xs hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                  <div class="flex items-center space-x-2.5 min-w-0">
                    <span class="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 font-mono text-[10px] font-bold text-slate-500 flex items-center justify-center flex-shrink-0" x-text="idx + 1"></span>
                    <div class="min-w-0">
                      <div class="font-bold text-slate-900 dark:text-slate-100 truncate" x-text="s.label"></div>
                      <div class="text-[10px] font-mono text-slate-400" x-text="'Seed Pin ID: ' + s.pin_id"></div>
                    </div>
                  </div>
                  <div class="flex items-center space-x-2 flex-shrink-0">
                    <span class="px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase" :class="s.is_competitor ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20' : 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'" x-text="s.is_competitor ? 'Competitor' : 'Target'"></span>
                    <a :href="'https://www.pinterest.com/pin/' + s.pin_id + '/'" target="_blank" class="p-1 text-slate-400 hover:text-amber-500" title="Open Seed Pin">
                      <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                    </a>
                  </div>
                </div>
              </template>
            </div>
          </div>

          <!-- 4. Pinterest Vision Model OCR Text Block -->
          <template x-if="selectedHub.ocr_text">
            <div class="p-3.5 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-slate-900/60 space-y-2">
              <div class="flex items-center justify-between">
                <span class="text-[10px] font-mono font-bold uppercase tracking-wider text-rose-500 flex items-center space-x-1">
                  <i data-lucide="scan-text" class="w-3.5 h-3.5"></i>
                  <span>Pinterest Vision Pipeline OCR Text</span>
                </span>
                <button @click="copyToClipboard(selectedHub.ocr_text, 'drawer-ocr')" class="text-rose-600 dark:text-rose-400 hover:underline font-mono text-[10px] flex items-center space-x-1">
                  <i data-lucide="copy" class="w-2.5 h-2.5"></i>
                  <span x-text="copiedField === 'drawer-ocr' ? 'Copied!' : 'Copy OCR'"></span>
                </button>
              </div>
              <div class="text-xs font-mono text-slate-700 dark:text-slate-300 leading-relaxed bg-white dark:bg-slate-950 p-2.5 rounded-lg border border-slate-200 dark:border-[#27272A]" x-text="selectedHub.ocr_text"></div>
            </div>
          </template>

          <!-- 5. Arbitrage Action Hub (One-Click Copy AI Prompts) -->
          <div class="space-y-3 pt-2 border-t border-slate-200 dark:border-[#27272A]">
            <h5 class="text-xs font-bold uppercase font-mono tracking-wider text-slate-800 dark:text-slate-200 flex items-center space-x-1.5">
              <i data-lucide="sparkles" class="w-3.5 h-3.5 text-amber-500"></i>
              <span>Arbitrage Execution Studio (One-Click AI Hooks)</span>
            </h5>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <!-- Action 1: Copy Re-spin Angle -->
              <button @click="copyHubReSpinAngle(selectedHub)" class="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-800 dark:text-amber-200 font-mono text-xs font-bold transition active:scale-95 flex items-center space-x-2 text-left">
                <i data-lucide="copy" class="w-4 h-4 text-amber-500 flex-shrink-0"></i>
                <div>
                  <div>Copy Viral Angle Prompt</div>
                  <div class="text-[10px] font-normal text-amber-700/80 dark:text-amber-300/70">Optimized for high-save copy</div>
                </div>
              </button>

              <!-- Action 2: Copy Midjourney/Imagen Image Prompt -->
              <button @click="copyHubImagePrompt(selectedHub)" class="p-3 rounded-xl border border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 text-purple-800 dark:text-purple-200 font-mono text-xs font-bold transition active:scale-95 flex items-center space-x-2 text-left">
                <i data-lucide="camera" class="w-4 h-4 text-purple-500 flex-shrink-0"></i>
                <div>
                  <div>Copy Midjourney Prompt</div>
                  <div class="text-[10px] font-normal text-purple-700/80 dark:text-purple-300/70">Replicates visual composition</div>
                </div>
              </button>
            </div>

            <!-- Action 3: Open in Pinterest Direct Link -->
            <a :href="'https://www.pinterest.com/pin/' + selectedHub.candidate_pin_id + '/'" target="_blank" class="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white font-mono text-xs font-bold transition active:scale-95 flex items-center justify-center space-x-2 shadow-sm">
              <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
              <span>Inspect Live Pin on Pinterest (Pin ID: <span x-text="selectedHub.candidate_pin_id"></span>)</span>
            </a>
          </div>

        </div>
      </template>

    </div>
  </div>

  <!-- Add Seed Modal (Single Pin & Bulk Pins Mode) -->
  <div x-show="isAddSeedOpen" x-cloak class="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4" @keydown.escape.window="isAddSeedOpen = false">
    <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl w-full max-w-xl shadow-2xl p-6 space-y-4" role="dialog" aria-modal="true" aria-label="Add Tracked Seeds to Neon" @click.away="isAddSeedOpen = false">
      
      <!-- Modal Header -->
      <div class="flex items-center justify-between border-b border-slate-200 dark:border-[#27272A] pb-3">
        <div class="flex items-center space-x-2">
          <div class="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center">
            <i data-lucide="plus-circle" class="w-4 h-4"></i>
          </div>
          <div>
            <h3 class="font-bold text-slate-900 dark:text-white text-sm">Add Tracked Seeds to Neon</h3>
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
          <span>Bulk Pins Ingestion (استيراد بالجملة)</span>
          <span class="px-1.5 py-0.2 rounded-full bg-rose-500/10 text-rose-600 text-[10px] font-bold">Fast</span>
        </button>
        <button @click="addSeedTab = 'single'" class="pb-2.5 px-4 border-b-2 flex items-center space-x-2 transition"
                :class="addSeedTab === 'single' ? 'border-rose-500 text-rose-600 dark:text-rose-400 font-bold' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'">
          <i data-lucide="hash" class="w-3.5 h-3.5"></i>
          <span>Single Pin (بين فردي)</span>
        </button>
      </div>

      <!-- Tab A: Bulk Pins Ingestion -->
      <div x-show="addSeedTab === 'bulk'" class="space-y-3.5 text-xs">
        <div>
          <div class="flex items-center justify-between mb-1">
            <label class="font-semibold text-slate-700 dark:text-slate-300">
              Paste Pinterest Pin IDs or URLs (أرقام أو روابط البين)
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
              <p class="text-[10px] text-slate-500">Trigger crawl pipeline right after inserting seeds into Neon</p>
            </div>
          </label>
          <div x-show="bulkAutoCrawl" class="flex items-center space-x-1.5 text-[11px] font-mono">
            <label class="flex items-center space-x-1 cursor-pointer">
              <input type="radio" value="workflow" x-model="bulkCrawlEngine" class="text-rose-600">
              <span>🚀 GitHub Actions</span>
            </label>
            <label class="flex items-center space-x-1 cursor-pointer">
              <input type="radio" value="local" x-model="bulkCrawlEngine" class="text-rose-600">
              <span>💻 Local</span>
            </label>
          </div>
        </div>

        <div class="pt-3 border-t border-slate-200 dark:border-[#27272A] flex justify-end space-x-2">
          <button @click="isAddSeedOpen = false" class="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-700">Cancel</button>
          <button @click="submitBulkSeeds()" :disabled="bulkParsedPinIds.length === 0 || isSubmittingBulk" class="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition active:scale-95 disabled:opacity-50 flex items-center space-x-1.5 shadow-sm">
            <i data-lucide="check" class="w-3.5 h-3.5"></i>
            <span x-text="isSubmittingBulk ? 'Importing Seeds...' : 'Import ' + bulkParsedPinIds.length + ' Seeds to Neon'"></span>
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
    <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl w-full max-w-2xl shadow-2xl p-6 space-y-4" role="dialog" aria-modal="true" aria-label="Cluster Intelligence Crawler Dispatcher" @click.away="isCrawlModalOpen = false">
      
      <!-- Modal Header -->
      <div class="flex items-center justify-between border-b border-slate-200 dark:border-[#27272A] pb-3">
        <div class="flex items-center space-x-2.5">
          <div class="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <i data-lucide="zap" class="w-4 h-4"></i>
          </div>
          <div>
            <h3 class="font-bold text-slate-900 dark:text-white text-sm">Cluster Intelligence Crawler Dispatcher</h3>
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
          <span>Launch Crawl (إطلاق عملية زحف)</span>
        </button>
        <button @click="crawlModalTab = 'history'; fetchWorkflowRuns();" class="pb-2.5 px-4 border-b-2 flex items-center space-x-2 transition"
                :class="crawlModalTab === 'history' ? 'border-amber-500 text-amber-600 dark:text-amber-400 font-bold' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'">
          <i data-lucide="git-pull-request" class="w-3.5 h-3.5"></i>
          <span>GitHub Actions Workflow Runs (سجل التشغيل الحي)</span>
          <span class="px-1.5 py-0.2 rounded-full bg-slate-200 dark:bg-slate-800 text-[10px]" x-text="workflowRuns.length"></span>
        </button>
      </div>

      <!-- Tab 1: Launch Crawl Config -->
      <div x-show="crawlModalTab === 'launch'" class="space-y-4 text-xs">
        
        <!-- Step 1: Target Scope Selection -->
        <div class="space-y-2">
          <label class="font-bold text-slate-900 dark:text-white block">1. Select Target Pin(s) Scope (تحديد الهدف)</label>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            
            <!-- Selected Pins Option -->
            <label class="p-3 rounded-xl border flex items-start space-x-3 cursor-pointer transition"
                   :class="crawlTargetScope === 'selected' ? 'border-amber-500 bg-amber-50/20 dark:bg-amber-950/20' : 'border-slate-200 dark:border-[#27272A] hover:bg-slate-50 dark:hover:bg-slate-900/50'"
                   :class="{'opacity-50 cursor-not-allowed': selectedSeedIds.length === 0}">
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
          <label class="font-bold text-slate-900 dark:text-white block">2. Execution Engine & Runner (بيئة التشغيل)</label>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            
            <!-- GitHub Actions Workflow Engine -->
            <label class="p-3 rounded-xl border flex items-start space-x-3 cursor-pointer transition"
                   :class="crawlEngine === 'workflow' ? 'border-purple-500 bg-purple-50/20 dark:bg-purple-950/20' : 'border-slate-200 dark:border-[#27272A] hover:bg-slate-50 dark:hover:bg-slate-900/50'">
              <input type="radio" value="workflow" x-model="crawlEngine" class="mt-0.5 text-purple-600 focus:ring-purple-500">
              <div>
                <div class="flex items-center space-x-1.5">
                  <span class="font-bold text-slate-800 dark:text-slate-200">🚀 GitHub Actions Workflow</span>
                  <span class="px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-700 dark:text-purple-300 text-[9px] font-bold">Matrix 20-Shards</span>
                </div>
                <p class="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                  Dispatches <code class="text-purple-600">cluster-intelligence.yml</code> via <strong>Parallel Matrix Sharding (20 Concurrent Runners)</strong>. 60 pages deep per seed (~900 candidates) with isolated egress IPs.
                </p>
              </div>
            </label>

            <!-- Local Background Crawler Engine -->
            <label class="p-3 rounded-xl border flex items-start space-x-3 cursor-pointer transition"
                   :class="crawlEngine === 'local' ? 'border-amber-500 bg-amber-50/20 dark:bg-amber-950/20' : 'border-slate-200 dark:border-[#27272A] hover:bg-slate-50 dark:hover:bg-slate-900/50'">
              <input type="radio" value="local" x-model="crawlEngine" class="mt-0.5 text-amber-600 focus:ring-amber-500">
              <div>
                <span class="font-bold text-slate-800 dark:text-slate-200">💻 Local Background Process</span>
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
                    <span x-text="run.displayTitle || 'Cluster Intelligence'"></span>
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

  <!-- Delete Confirmation & Neon Purge Modal -->
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
            <input type="checkbox" x-model="deletePurgeNeon" class="mt-0.5 w-4 h-4 rounded border-rose-300 text-rose-600 focus:ring-rose-500">
            <div>
              <span class="font-bold text-rose-900 dark:text-rose-300">حذف وتطهير شامل من قاعدة بيانات Neon (Purge from DB)</span>
              <p class="text-[11px] text-rose-800/80 dark:text-rose-400/80 mt-0.5 leading-relaxed">
                يقوم بحذف جميع الكانديديت المحصودة (<code class="text-[10px]">candidate_graph_nodes</code>)، وكبسولات الاستكشاف (<code class="text-[10px]">seed_guided_search_capsules</code>)، والمقاييس التحليلية (<code class="text-[10px]">cluster_arbitrage_metrics</code>) المرتبطة بهذه البذور من Neon Serverless نهائياً.
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

  <!-- Cookie Settings Modal -->
  <div x-show="isCookieModalOpen" x-cloak class="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4" @keydown.escape.window="isCookieModalOpen = false">
    <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-4 text-slate-900 dark:text-[#FAFAFA]" role="dialog" aria-modal="true" aria-label="Pinterest Session Cookie Settings" @click.away="isCookieModalOpen = false">
      <div class="flex items-center justify-between border-b border-slate-200 dark:border-[#27272A] pb-3">
        <div class="flex items-center space-x-2">
          <i data-lucide="key" class="w-5 h-5 text-amber-500"></i>
          <h3 class="font-bold text-sm">إعداد كوكيز جلسة بينترست (Pinterest Session Cookie)</h3>
        </div>
        <button @click="isCookieModalOpen = false" class="text-slate-400 hover:text-slate-700 dark:hover:text-white">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>

      <div class="space-y-3 text-xs">
        <div class="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-1.5 text-amber-800 dark:text-amber-300 font-mono">
          <p class="font-bold">⚡ لماذا الكوكيز ضرورية لاستخراج BUBBLE_ONE_COL و RecGPT؟</p>
          <p class="text-[11px] leading-relaxed">
            منصة بنترست تعامل أي طلب بدون كوكيز كـ "زائر مجهول" فترسل 0 كبسولات بحثية و 0 كانديديت لـ RecGPT. عند إضافة الكوكيز، يتعرف بنترست على حسابك ويرسل كبسولات الاستكشاف الموجه (BUBBLE_ONE_COL) وكوتا RecGPT الكاملة (147 كانديديت).
          </p>
        </div>

        <div class="space-y-1 text-slate-600 dark:text-slate-400 text-[11px]">
          <p class="font-semibold text-slate-800 dark:text-slate-200">📌 طريقة النسخ في 3 خطوات بسيطة:</p>
          <ol class="list-decimal list-inside space-y-0.5">
            <li>افتح <code class="text-rose-500">pinterest.com</code> في متصفحك وسجل الدخول.</li>
            <li>اضغط <code class="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">F12</code> ثم اذهب لتبويب <strong>Network</strong>.</li>
            <li>اختر أي طلب، وانسخ قيمة سطر <strong>Cookie:</strong> من قسم <em>Request Headers</em> والصقها هنا:</li>
          </ol>
        </div>

        <div>
          <label class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">PINTEREST_COOKIE (قيمة الكوكيز الكاملة)</label>
          <textarea x-model="cookieInput" rows="4" placeholder="_auth=1; _pinterest_sess=TWc9PSZ..." class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-white focus:outline-none focus:border-amber-500 font-mono text-[11px]"></textarea>
        </div>

        <div class="flex items-center space-x-2 text-[11px] font-mono text-slate-500">
          <span>الحالة الحالية:</span>
          <span class="font-bold" :class="cookieStatus.has_cookie ? 'text-emerald-500' : 'text-amber-500'" x-text="cookieStatus.has_cookie ? '✅ موثق (Active Cookie)' : '❌ غير متصل (Guest Mode)'"></span>
          <span x-show="cookieStatus.preview" class="text-[10px] text-slate-400" x-text="'(' + cookieStatus.preview + ')'"></span>
        </div>
      </div>

      <div class="pt-3 border-t border-slate-200 dark:border-[#27272A] flex justify-end space-x-2">
        <button @click="isCookieModalOpen = false" class="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-700">إلغاء</button>
        <button @click="saveCookie()" :disabled="isSavingCookie" class="px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white transition active:scale-95 disabled:opacity-50 flex items-center space-x-1.5">
          <i data-lucide="check" class="w-3.5 h-3.5"></i>
          <span x-text="isSavingCookie ? 'جاري الحفظ...' : 'حفظ وتفعيل الجلسة فوراً'"></span>
        </button>
      </div>
    </div>
  </div>

  <!-- Direct Raw JSON Ingestion Modal -->
  <div x-show="isRawJsonModalOpen" x-cloak class="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4" @keydown.escape.window="isRawJsonModalOpen = false">
    <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl w-full max-w-2xl shadow-2xl p-6 space-y-4 text-slate-900 dark:text-[#FAFAFA]" role="dialog" aria-modal="true" aria-label="Direct Raw JSON Ingestion" @click.away="isRawJsonModalOpen = false">
      <div class="flex items-center justify-between border-b border-slate-200 dark:border-[#27272A] pb-3">
        <div class="flex items-center space-x-2">
          <i data-lucide="file-input" class="w-5 h-5 text-purple-500"></i>
          <h3 class="font-bold text-sm">استيراد ملف JSON الأصلي مباشرة (Direct Raw JSON Ingestion)</h3>
        </div>
        <button @click="isRawJsonModalOpen = false" class="text-slate-400 hover:text-slate-700 dark:hover:text-white">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>

      <div class="space-y-3 text-xs">
        <p class="text-slate-500 dark:text-slate-400">
          الصق هنا الاستجابة الخام الكاملة المنسوخة من تبويب Network لـ (RelatedModulesResource). سيقوم المحرك فوراً باستخراج كبسولات BUBBLE_ONE_COL، وحصص RecGPT و NavBoost الحقيقية، وحفظ جميع الدبابيس في Neon DB.
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
        <button @click="isRawJsonModalOpen = false" class="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-700">إلغاء</button>
        <button @click="submitRawJson()" :disabled="isSubmittingRawJson || !rawJsonInput.trim()" class="px-4 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white transition active:scale-95 disabled:opacity-50 flex items-center space-x-1.5">
          <i data-lucide="sparkles" class="w-3.5 h-3.5"></i>
          <span x-text="isSubmittingRawJson ? 'جاري الهضم والتخزين...' : 'هضم وتخزين في Neon'"></span>
        </button>
      </div>
    </div>
  </div>



  <!-- Modal: Track Pinterest Creator (Unified Modal matching User Mockup) -->
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
              <span class="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">Saves account to database, monitors followers & monthly reach, and scrapes public boards.</span>
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

  <!-- Modal: GitHub Actions 20-Shard Crawler & Board Sharding Dispatch -->
  <div x-show="isGhaCrawlerModalOpen" x-cloak class="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4" @keydown.escape.window="isGhaCrawlerModalOpen = false">
    <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-3xl w-full max-w-xl shadow-2xl p-6 sm:p-7 space-y-5" role="dialog" aria-modal="true" aria-label="Launch 20-Shard Parallel Crawler" @click.away="isGhaCrawlerModalOpen = false">
      <!-- Modal Header -->
      <div class="flex items-center justify-between border-b border-slate-200 dark:border-[#27272A]/80 pb-4">
        <div class="flex items-center space-x-3">
          <div class="w-10 h-10 rounded-2xl bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 flex items-center justify-center shadow-xs">
            <i data-lucide="git-branch" class="w-5 h-5"></i>
          </div>
          <div>
            <h3 class="font-bold text-slate-900 dark:text-white text-base">Launch 20-Shard Parallel Crawler</h3>
            <p class="text-xs text-slate-500 dark:text-slate-400">
              Target: <strong class="text-sky-500 font-mono" x-text="'@' + ghaTargetAccount"></strong> • Board-Level Modulo Sharding
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
          <label class="block font-bold text-slate-800 dark:text-slate-200 mb-2">Board Sharding Scope:</label>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <label class="flex items-start gap-2.5 p-3 rounded-2xl border cursor-pointer transition" :class="ghaBoardScope === 'all' ? 'bg-sky-50/50 dark:bg-sky-950/30 border-sky-500 text-sky-700 dark:text-sky-300 shadow-2xs font-bold' : 'border-slate-200 dark:border-[#27272A] text-slate-600 dark:text-slate-400'">
              <input type="radio" value="all" x-model="ghaBoardScope" class="mt-0.5 text-sky-600">
              <div>
                <div class="text-xs font-bold">All Creator Boards</div>
                <div class="text-[10.5px] font-normal text-slate-500 dark:text-slate-400 mt-0.5">Distribute all <span class="font-mono font-bold" x-text="activeCreatorBoards.length"></span> boards across 20 shards (idx % 20).</div>
              </div>
            </label>
            <label class="flex items-start gap-2.5 p-3 rounded-2xl border cursor-pointer transition" :class="ghaBoardScope === 'custom' ? 'bg-sky-50/50 dark:bg-sky-950/30 border-sky-500 text-sky-700 dark:text-sky-300 shadow-2xs font-bold' : 'border-slate-200 dark:border-[#27272A] text-slate-600 dark:text-slate-400'">
              <input type="radio" value="custom" x-model="ghaBoardScope" class="mt-0.5 text-sky-600">
              <div>
                <div class="text-xs font-bold">Select Specific Boards</div>
                <div class="text-[10.5px] font-normal text-slate-500 dark:text-slate-400 mt-0.5">Pick target boards manually. Selected boards are split across shards.</div>
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
          <span x-text="isDispatchingGitHubCrawl ? 'Launching 20 Shards...' : '🚀 Launch 20-Shard Crawler'"></span>
        </button>
      </div>
    </div>
  </div>

  <!-- Modal: + Add Keywords (Keyword Velocity Tracker) -->
  <div x-show="isAddKeywordModalOpen" x-cloak class="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4" @keydown.escape.window="isAddKeywordModalOpen = false">
    <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-4" role="dialog" aria-modal="true" aria-label="Add Pinterest Search Keyword" @click.away="isAddKeywordModalOpen = false">
      <div class="flex items-center justify-between border-b border-slate-200 dark:border-[#27272A] pb-3">
        <div class="flex items-center space-x-2">
          <div class="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
            <i data-lucide="search" class="w-4 h-4"></i>
          </div>
          <div>
            <h3 class="font-bold text-slate-900 dark:text-white text-sm">Add Pinterest Search Keyword</h3>
            <p class="text-[11px] text-slate-500">Track organic rank positions and daily save velocity.</p>
          </div>
        </div>
        <button @click="isAddKeywordModalOpen = false" class="text-slate-400 hover:text-slate-700 dark:hover:text-white">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>
      <div class="space-y-3 text-xs">
        <div>
          <label class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Target Keyword / Search Query</label>
          <input type="text" x-model="newKeywordText" placeholder="e.g. chicken recipes or rustic home decor" class="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50">
        </div>
        <div>
          <label class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Category</label>
          <input type="text" x-model="newKeywordCategory" placeholder="e.g. Recipes & Food or Home & Living" class="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50">
        </div>
      </div>
      <div class="pt-3 border-t border-slate-200 dark:border-[#27272A] flex justify-end space-x-2">
        <button @click="isAddKeywordModalOpen = false" class="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-700">Cancel</button>
        <button @click="submitAddKeyword()" :disabled="!newKeywordText.trim()" class="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition active:scale-95 disabled:opacity-50 flex items-center space-x-1.5">
          <i data-lucide="plus" class="w-3.5 h-3.5"></i>
          <span>Track Keyword</span>
        </button>
      </div>
    </div>
  </div>

  <!-- Slide-Over: View Tracked SERP Pins for a Keyword -->
  <div x-show="isKeywordPinsOpen" x-cloak class="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-md flex justify-end" @keydown.escape.window="isKeywordPinsOpen = false">
    <div class="bg-white dark:bg-[#121215] border-l border-slate-200 dark:border-[#27272A] w-full max-w-2xl h-full min-h-screen shadow-2xl overflow-y-auto p-6 space-y-6 animate-in slide-in-from-right duration-200" role="dialog" aria-modal="true" aria-label="Keyword SERP Pins" @click.away="isKeywordPinsOpen = false">
      <div class="flex items-center justify-between border-b border-slate-200 dark:border-[#27272A] pb-4">
        <div class="flex items-center space-x-3">
          <div class="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <i data-lucide="search" class="w-4 h-4"></i>
          </div>
          <div>
            <h3 class="font-bold text-slate-900 dark:text-white text-base flex items-center space-x-2">
              <span x-text="'Keyword: ' + (activeKeyword?.keyword || '')"></span>
              <span class="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20" x-text="activeKeyword?.category || 'General'"></span>
            </h3>
            <p class="text-xs text-slate-500 dark:text-slate-400 font-mono" x-text="activeKeywordPins.length + ' Tracked Organic SERP Pins'"></p>
          </div>
        </div>
        <button @click="isKeywordPinsOpen = false" class="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition">
          <i data-lucide="x" class="w-5 h-5"></i>
        </button>
      </div>

      <!-- Loading State -->
      <div x-show="isLoadingKeywordPins" class="text-center py-12 text-slate-500 font-mono text-xs">
        <i data-lucide="loader" class="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-500"></i>
        <span>Loading keyword SERP pins from Neon...</span>
      </div>

      <!-- Pins List -->
      <div x-show="!isLoadingKeywordPins && activeKeywordPins.length > 0" class="space-y-3 font-sans">
        <template x-for="pin in activeKeywordPins" :key="pin.id">
          <div class="p-3 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-slate-900/40 flex items-center justify-between gap-3 hover:border-emerald-500/50 transition">
            <div class="flex items-center space-x-3 min-w-0">
              <span class="w-7 h-7 rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 font-mono text-xs font-bold flex items-center justify-center flex-shrink-0" x-text="'#' + pin.rank_position"></span>
              <template x-if="pin.image_url">
                <img :src="pin.image_url" class="w-10 h-14 rounded-lg object-cover border border-slate-200 dark:border-slate-700 flex-shrink-0">
              </template>
              <div class="min-w-0 space-y-0.5">
                <div class="text-xs font-bold text-slate-900 dark:text-white truncate" x-text="pin.title || 'Untitled Pin'"></div>
                <div class="text-[11px] font-mono text-slate-500 flex items-center space-x-2">
                  <span x-text="pin.domain || 'pinterest.com'"></span>
                  <span>•</span>
                  <span class="text-rose-500 font-bold" x-text="formatNumber(pin.save_count) + ' saves'"></span>
                  <template x-if="Number(pin.daily_save_velocity) > 0">
                    <span class="text-emerald-500 font-bold" x-text="'+' + formatNumber(pin.daily_save_velocity) + '/day'"></span>
                  </template>
                </div>
              </div>
            </div>
            <a :href="'https://www.pinterest.com/pin/' + pin.pin_id + '/'" target="_blank" class="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-emerald-500 transition flex items-center space-x-1 flex-shrink-0">
              <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
              <span>Pin</span>
            </a>
          </div>
        </template>
      </div>

      <!-- Empty State -->
      <div x-show="!isLoadingKeywordPins && activeKeywordPins.length === 0" class="text-center py-12 text-slate-500 font-mono text-xs">
        <p>No snapshots recorded yet for this keyword.</p>
        <p class="text-[11px] mt-1 text-slate-400">Click "Sync SERP" on the keyword table to fetch live search results.</p>
      </div>
    </div>
  </div>

  <!-- Modal: + Add Project to Fleet (Neon Fleet Manager) -->
  <div x-show="isAddFleetModalOpen" x-cloak class="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4" @keydown.escape.window="isAddFleetModalOpen = false">
    <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-4" role="dialog" aria-modal="true" aria-label="Register Neon Project in Fleet" @click.away="isAddFleetModalOpen = false">
      <div class="flex items-center justify-between border-b border-slate-200 dark:border-[#27272A] pb-3">
        <div class="flex items-center space-x-2">
          <div class="w-8 h-8 rounded-xl bg-cyan-500/10 text-cyan-600 flex items-center justify-center">
            <i data-lucide="server" class="w-4 h-4"></i>
          </div>
          <div>
            <h3 class="font-bold text-slate-900 dark:text-white text-sm">Register Neon Project in Fleet</h3>
            <p class="text-[11px] text-slate-500">Add an isolated Neon Postgres project to the 100-project registry.</p>
          </div>
        </div>
        <button @click="isAddFleetModalOpen = false" class="text-slate-400 hover:text-slate-700 dark:hover:text-white">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>
      <div class="space-y-3 text-xs">
        <div>
          <label class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Project Name</label>
          <input type="text" x-model="newFleetProjectName" placeholder="e.g. pin-shard-02 or competitors-db" class="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50">
        </div>
        <div>
          <label class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Project ID</label>
          <input type="text" x-model="newFleetProjectId" placeholder="e.g. weathered-band-12345678" class="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50">
        </div>
        <div>
          <label class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Pooled DATABASE_URL</label>
          <input type="text" x-model="newFleetDatabaseUrl" placeholder="postgresql://user:pass@ep-*-pooler.neon.tech/neondb?sslmode=require" class="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-white font-mono text-[11px] focus:outline-none focus:ring-2 focus:ring-cyan-500/50">
        </div>
      </div>
      <div class="pt-3 border-t border-slate-200 dark:border-[#27272A] flex justify-end space-x-2">
        <button @click="isAddFleetModalOpen = false" class="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-700">Cancel</button>
        <button @click="submitAddFleetProject()" :disabled="!newFleetProjectId.trim() || !newFleetDatabaseUrl.trim()" class="px-4 py-2 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white transition active:scale-95 disabled:opacity-50 flex items-center space-x-1.5">
          <i data-lucide="plus" class="w-3.5 h-3.5"></i>
          <span>Register Project</span>
        </button>
      </div>
    </div>
  </div>

  <!-- Modal: Inspect Neon Fleet Node -->
  <div x-show="isInspectingNodeModalOpen" x-cloak class="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4" @keydown.escape.window="isInspectingNodeModalOpen = false">
    <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-3xl w-full max-w-lg shadow-2xl p-6 space-y-5" role="dialog" aria-modal="true" aria-label="Inspect Neon Fleet Node" @click.away="isInspectingNodeModalOpen = false">
      <div class="flex items-center justify-between border-b border-slate-200 dark:border-[#27272A] pb-3">
        <div class="flex items-center space-x-3">
          <div class="w-10 h-10 rounded-2xl bg-cyan-500/10 text-cyan-500 flex items-center justify-center">
            <i data-lucide="server" class="w-5 h-5"></i>
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h3 class="font-extrabold text-slate-900 dark:text-white text-base" x-text="inspectedNode?.project_name"></h3>
              <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase font-mono" :class="inspectedNode?.is_hub ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'" x-text="inspectedNode?.is_hub ? '👑 HUB MASTER' : '📦 SHARD'"></span>
            </div>
            <p class="text-xs text-slate-500 font-mono" x-text="'Project ID: ' + (inspectedNode?.project_id || '')"></p>
          </div>
        </div>
        <button @click="isInspectingNodeModalOpen = false" class="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>

      <!-- Node Specs Grid -->
      <div class="grid grid-cols-2 gap-3 text-xs font-mono">
        <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-[#27272A]">
          <span class="text-[10px] uppercase font-bold text-slate-400 block mb-1">Compute & Quota</span>
          <span class="font-bold text-slate-800 dark:text-slate-200 block">100 CU-Hours / mo</span>
          <span class="text-[10px] text-emerald-500 font-sans block mt-0.5">Autoscaling to 2 CU</span>
        </div>
        <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-[#27272A]">
          <span class="text-[10px] uppercase font-bold text-slate-400 block mb-1">NVMe Storage</span>
          <span class="font-bold text-slate-800 dark:text-slate-200 block">1.0 GB Allocated</span>
          <span class="text-[10px] text-cyan-500 font-sans block mt-0.5">Isolated Project Tenant</span>
        </div>
        <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-[#27272A]">
          <span class="text-[10px] uppercase font-bold text-slate-400 block mb-1">Cloud Region</span>
          <span class="font-bold text-slate-800 dark:text-slate-200 block" x-text="inspectedNode?.region_id || 'aws-us-east-2'"></span>
          <span class="text-[10px] text-slate-500 font-sans block mt-0.5">AWS Ohio (Scale-to-Zero)</span>
        </div>
        <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-[#27272A]">
          <span class="text-[10px] uppercase font-bold text-slate-400 block mb-1">Active Status</span>
          <span class="font-bold text-emerald-600 dark:text-emerald-400 block flex items-center gap-1">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 motion-safe:animate-pulse"></span> Active Online
          </span>
          <span class="text-[10px] text-slate-500 font-sans block mt-0.5" x-text="inspectedNode?.ping_latency ? '⚡ ' + inspectedNode.ping_latency + 'ms latency' : 'Ready for queries'"></span>
        </div>
      </div>

      <!-- Connection Details -->
      <div class="space-y-1.5 text-xs">
        <label class="block font-bold text-slate-700 dark:text-slate-300">Pooled Connection String</label>
        <div class="flex items-center space-x-2">
          <input type="text" readonly :value="inspectedNode?.masked_url || ''" class="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] text-slate-700 dark:text-slate-300 font-mono text-[11px] outline-none">
          <button @click="copyFleetUrl(inspectedNode)" class="px-3 py-2 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white shrink-0 transition flex items-center gap-1 cursor-pointer">
            <i data-lucide="copy" class="w-3.5 h-3.5"></i>
            <span>Copy</span>
          </button>
        </div>
      </div>

      <!-- Modal Footer -->
      <div class="pt-3 border-t border-slate-200 dark:border-[#27272A] flex items-center justify-between">
        <button @click="if (inspectedNode) pingFleetShard(inspectedNode)" :disabled="pingingProjectId === inspectedNode?.project_id" class="px-3.5 py-2 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition flex items-center space-x-1.5 cursor-pointer">
          <i data-lucide="zap" class="w-3.5 h-3.5 text-purple-500"></i>
          <span x-text="pingingProjectId === inspectedNode?.project_id ? 'Pinging...' : 'Test Shard Latency'"></span>
        </button>
        <button @click="isInspectingNodeModalOpen = false" class="px-4 py-2 rounded-xl text-xs font-bold bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 cursor-pointer">Close</button>
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
  </div>`;
}
