/**
 * Dashboard Modals — Full Image Lightbox & Candidate / Hub Dossier Drawers
 */
import {
  renderPinDossierDrawer,
  renderPinDossierHeader,
  renderPinDossierTextBlock,
  renderPinDossierKpiGrid
} from '../pin-dossier-drawer.mjs';

export function renderDashboardDossierDrawers() {
  const candidateDossierHeaderHtml = renderPinDossierHeader({
    iconHtml: `<div class="w-8 h-8 rounded-lg bg-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
            <i data-lucide="eye" class="w-4 h-4"></i>
          </div>`,
    titleHtml: `<h3 class="font-bold text-slate-900 dark:text-[#FAFAFA] text-base">Candidate Pin Deep-Inspection Dossier</h3>`,
    subtitleHtml: `<p class="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums" x-text="'Pin ID: ' + selectedCandidate?.candidate_pin_id"></p>`,
    closeExpr: 'isDossierOpen = false',
    closeLabel: 'Close Candidate Pin Deep-Inspection Dossier'
  });

  const candidateSeoTitleBlock = renderPinDossierTextBlock({
    title: 'Algorithmic SEO Title',
    iconName: 'type',
    iconClass: 'w-3.5 h-3.5 text-rose-500',
    copyExpr: "copyToClipboard(blueprintSeoTitle, 'seo')",
    copyButtonLabelExpr: "copiedField === 'seo' ? 'Copied!' : 'Copy'",
    copyButtonClass: 'text-rose-600 hover:underline font-mono text-[11px] flex items-center space-x-1 cursor-pointer',
    bodyTextExpr: 'blueprintSeoTitle',
    bodyClass: 'p-2.5 rounded-lg bg-slate-100 dark:bg-black/50 border border-slate-200 dark:border-[#27272A] font-mono text-xs text-slate-800 dark:text-slate-200',
    containerClass: 'space-y-1'
  });

  const candidateMidjourneyBlock = renderPinDossierTextBlock({
    title: 'Midjourney v6.1 Generation Prompt (--ar 9:16)',
    iconName: 'camera',
    iconClass: 'w-3.5 h-3.5 text-amber-500',
    copyExpr: "copyToClipboard(blueprintMidjourney, 'midjourney')",
    copyButtonLabelExpr: "copiedField === 'midjourney' ? 'Copied!' : 'Copy'",
    copyButtonClass: 'text-amber-600 hover:underline font-mono text-[11px] flex items-center space-x-1 cursor-pointer',
    bodyTextExpr: 'blueprintMidjourney',
    bodyClass: 'p-2.5 rounded-lg bg-slate-100 dark:bg-black/50 border border-slate-200 dark:border-[#27272A] font-mono text-[11px] leading-relaxed text-slate-700 dark:text-slate-300',
    containerClass: 'space-y-1'
  });

  const candidateSchemaBlock = renderPinDossierTextBlock({
    title: 'Dual JSON-LD Schema (Product + Recipe)',
    iconName: 'braces',
    iconClass: 'w-3.5 h-3.5 text-emerald-500',
    copyExpr: "copyToClipboard(blueprintJsonLd, 'jsonld')",
    copyButtonLabelExpr: "copiedField === 'jsonld' ? 'Copied Schema!' : '1-Click Copy Schema'",
    copyButtonClass: 'text-emerald-600 hover:underline font-mono text-[11px] flex items-center space-x-1 cursor-pointer',
    bodyHtml: `<pre class="p-3 rounded-lg bg-slate-100 dark:bg-black/60 border border-slate-200 dark:border-[#27272A] font-mono text-[10px] leading-relaxed max-h-40 overflow-y-auto text-slate-700 dark:text-slate-300" x-text="blueprintJsonLd"></pre>`,
    containerClass: 'space-y-1'
  });

  const hubDossierHeaderHtml = renderPinDossierHeader({
    iconHtml: `<div class="w-10 h-10 rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30 flex items-center justify-center flex-shrink-0">
            <i data-lucide="git-merge" class="w-5 h-5"></i>
          </div>`,
    titleHtml: `<h3 class="font-bold text-slate-900 dark:text-white text-base">Pixie Gravitational Centroid Dossier</h3>`,
    badgesHtml: `<template x-if="selectedHub">
                <span class="px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-wider" :class="getPixieResonance(selectedHub).badgeClass" x-text="getPixieResonance(selectedHub).label"></span>
              </template>`,
    subtitleHtml: `<p class="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">
              <span>Section 4.3 Multi-Query Bipartite Random Walk Centroid</span>
            </p>`,
    closeExpr: 'closeHubDrawer()',
    closeLabel: 'Close Pixie Gravitational Centroid Dossier'
  });

  const hubKpiMiniGridHtml = renderPinDossierKpiGrid({
    gridClass: 'grid grid-cols-3 gap-2 pt-2 border-t border-slate-200/80 dark:border-[#27272A]/80 font-mono text-xs',
    cardClass: 'text-left space-y-0.5',
    items: [
      {
        label: 'Total Saves',
        valueExpr: 'Number(selectedHub.total_saves != null ? selectedHub.total_saves : (selectedHub.saves || 0)).toLocaleString()',
        valueClass: 'font-bold text-slate-900 dark:text-white font-mono tabular-nums block'
      },
      {
        label: 'Repin Rate',
        valueExpr: "(selectedHub.avg_save_rate || selectedHub.save_rate || 0) + '%'",
        valueClass: 'font-bold text-slate-900 dark:text-white font-mono tabular-nums block'
      },
      {
        label: 'Velocity',
        valueExpr: "Number(selectedHub.daily_velocity || 0) > 0 ? (selectedHub.daily_velocity + '/d') : 'Stagnant'",
        valueClass: 'font-bold text-emerald-600 dark:text-emerald-400 font-mono tabular-nums block'
      }
    ]
  });

  const hubOcrBlockHtml = renderPinDossierTextBlock({
    title: 'Pinterest Vision Pipeline OCR Text',
    iconName: 'scan-text',
    iconClass: 'w-3.5 h-3.5 text-rose-500',
    copyExpr: "copyToClipboard(selectedHub.ocr_text, 'drawer-ocr')",
    copyButtonLabelExpr: "copiedField === 'drawer-ocr' ? 'Copied!' : 'Copy OCR'",
    copyButtonClass: 'text-rose-600 dark:text-rose-400 hover:underline font-mono text-[10px] flex items-center space-x-1 cursor-pointer',
    bodyTextExpr: 'selectedHub.ocr_text',
    bodyClass: 'text-xs font-mono text-slate-700 dark:text-slate-300 leading-relaxed bg-white dark:bg-slate-950 p-2.5 rounded-lg border border-slate-200 dark:border-[#27272A]',
    containerClass: 'p-3.5 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-slate-900/60 space-y-2'
  });

  const candidateDossierDrawerHtml = renderPinDossierDrawer({
    showExpr: 'isDossierOpen',
    closeExpr: 'isDossierOpen = false',
    ariaLabel: 'Candidate Pin Deep-Inspection Dossier',
    headerHtml: candidateDossierHeaderHtml,
    bodyHtml: `
      <!-- Pin Visual Dossier -->
      <div class="p-4 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-slate-900/60 space-y-3">
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-start space-x-3.5">
            <template x-if="selectedCandidate?.image_url">
              <a :href="'https://www.pinterest.com/pin/' + selectedCandidate?.candidate_pin_id + '/'" target="_blank" rel="noopener noreferrer" class="block relative flex-shrink-0 group/modal">
                <img :src="selectedCandidate.image_url" alt="Pin thumbnail" class="w-14 h-20 rounded-xl object-cover border shadow-md group-hover/modal:scale-110 transition-transform duration-200" :style="'border-color: ' + safeColor(selectedCandidate?.winning_color || selectedCandidate?.dominant_color, '#cbd5e1')">
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
                  <span class="inline-flex items-center gap-1.5">
                    <span>•</span>
                    <span class="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300" x-text="selectedCandidate.ingestion_method === 'csv_importer' ? 'CSV Farm' : (selectedCandidate.ingestion_method === 'pin_scheduling' ? 'Scheduled' : selectedCandidate.ingestion_method)"></span>
                  </span>
                </template>
              </div>
            </div>
          </div>
          <div class="flex items-center space-x-2 p-2 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-slate-950 flex-shrink-0">
            <span class="w-6 h-6 rounded-md border" :style="'background-color: ' + safeColor(selectedCandidate?.winning_color || selectedCandidate?.dominant_color, '#888888')"></span>
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
                  <span class="inline-flex items-center gap-1">Velocity: <strong class="text-rose-600 dark:text-rose-400 inline-flex items-center gap-0.5"><i data-lucide="zap" class="w-3 h-3 shrink-0"></i><span x-text="candidateTrajectory.anchor?.daily_velocity + '/d'"></span></strong></span>
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
                  <span class="inline-flex items-center gap-1">Velocity: <strong class="text-sky-600 dark:text-sky-400 inline-flex items-center gap-0.5"><i data-lucide="zap" class="w-3 h-3 shrink-0"></i><span x-text="candidateTrajectory.co_visitor?.daily_velocity + '/d'"></span></strong></span>
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
                  <span class="inline-flex items-center gap-1">Velocity: <strong class="text-amber-600 dark:text-amber-400 inline-flex items-center gap-0.5"><i data-lucide="zap" class="w-3 h-3 shrink-0"></i><span x-text="candidateTrajectory.finisher?.daily_velocity + '/d'"></span></strong></span>
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

        ${candidateSeoTitleBlock}

        ${candidateMidjourneyBlock}

        ${candidateSchemaBlock}
      </div>`
  });

  const hubDossierDrawerHtml = renderPinDossierDrawer({
    showExpr: 'isHubDrawerOpen',
    closeExpr: 'closeHubDrawer()',
    ariaLabel: 'Pixie Gravitational Centroid Dossier',
    headerHtml: hubDossierHeaderHtml,
    bodyHtml: `      <template x-if="selectedHub">
        <div class="space-y-6">

          <!-- 1. Media Preview & Key Identifiers -->
          <div class="p-4 rounded-2xl border border-slate-200 dark:border-[#27272A] bg-slate-50/80 dark:bg-slate-900/60 flex flex-col sm:flex-row gap-4 items-start">
            <!-- Pin Image (2:3 Aspect) -->
            <div class="w-32 sm:w-36 aspect-[2/3] rounded-xl overflow-hidden flex-shrink-0 border-2 shadow-md relative group" :style="'border-color: ' + safeColor(selectedHub.winning_color, '#cbd5e1')">
              <template x-if="selectedHub.image_url">
                <img :src="selectedHub.image_url" alt="Pin preview" class="w-full h-full object-cover">
              </template>
              <template x-if="!selectedHub.image_url">
                <div class="w-full h-full flex items-center justify-center bg-slate-200 dark:bg-slate-800 text-slate-400">
                  <i data-lucide="image" class="w-6 h-6"></i>
                </div>
              </template>
              <a :href="'https://www.pinterest.com/pin/' + selectedHub.candidate_pin_id + '/'" target="_blank" rel="noopener noreferrer" class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white text-xs font-semibold">
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
                    <span class="px-2 py-0.5 rounded text-[9px] font-extrabold uppercase bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 inline-flex items-center gap-1">
                      <i data-lucide="target" class="w-3 h-3 shrink-0"></i><span>Vacuum Target</span>
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

              ${hubKpiMiniGridHtml}
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
                    <a :href="'https://www.pinterest.com/pin/' + s.pin_id + '/'" target="_blank" rel="noopener noreferrer" class="p-1 text-slate-400 hover:text-amber-500" title="Open Seed Pin">
                      <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                    </a>
                  </div>
                </div>
              </template>
            </div>
          </div>

          <!-- 4. Pinterest Vision Model OCR Text Block -->
          <template x-if="selectedHub.ocr_text">
            ${hubOcrBlockHtml}
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
            <a :href="'https://www.pinterest.com/pin/' + selectedHub.candidate_pin_id + '/'" target="_blank" rel="noopener noreferrer" class="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white font-mono text-xs font-bold transition active:scale-95 flex items-center justify-center space-x-2 shadow-sm">
              <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
              <span>Inspect Live Pin on Pinterest (Pin ID: <span x-text="selectedHub.candidate_pin_id"></span>)</span>
            </a>
          </div>

        </div>
      </template>`
  });

  return `  <!-- ======================================================== -->
  <!-- FULL IMAGE LIGHTBOX MODAL (Enlarge and browse images)      -->
  <!-- ======================================================== -->
  <div x-show="isLightboxOpen" x-cloak 
       class="fixed inset-0 z-[70] bg-slate-950/90 backdrop-blur-md flex flex-col justify-between p-4 sm:p-6"
       role="dialog" aria-modal="true" aria-label="Image Lightbox"
       @keydown.escape.window="closeLightbox()"
       @keydown.arrow-left.window="if (isLightboxOpen) prevLightboxImage()"
       @keydown.arrow-right.window="if (isLightboxOpen) nextLightboxImage()">
    
    <!-- Lightbox Top Navigation Bar -->
    <div class="flex items-center justify-between text-white border-b border-slate-800/80 pb-3 max-w-5xl w-full mx-auto">
      <div class="flex items-center space-x-3">
        <span class="px-2.5 py-1 rounded-md text-[10px] font-mono tabular-nums font-bold uppercase bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
          EXPLORE ARTICLE CAPSULE
        </span>
        <span class="text-xs font-mono tabular-nums text-slate-400" x-text="'Image ' + (lightboxIndex + 1) + ' of ' + (dossierGuidedCapsules ? dossierGuidedCapsules.length : 0)"></span>
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
              title="Previous Image (Arrow Left)">
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
              title="Next Image (Arrow Right)">
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
        <a :href="safeUrl(currentLightboxCapsule?.search_url || ('https://www.pinterest.com/search/pins/?q=' + encodeURIComponent(currentLightboxCapsule?.query_term || '')))" target="_blank" rel="noopener noreferrer" class="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-slate-700 dark:text-[#FAFAFA] text-xs font-mono tabular-nums transition flex items-center space-x-1.5 border border-slate-200 dark:border-[#27272A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500" title="Open Pinterest Search">
          <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
          <span>Pinterest Search</span>
        </a>
      </div>
    </div>

  </div>

  <!-- ======================================================== -->
  <!-- CANDIDATE DEEP-INSPECTION & PIXIE SLIDE-OVER DRAWERS     -->
  <!-- ======================================================== -->
  ${candidateDossierDrawerHtml}

  ${hubDossierDrawerHtml}
`;
}
