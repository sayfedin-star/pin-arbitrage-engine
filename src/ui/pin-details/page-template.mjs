/**
 * Pin Details UI Body Template
 * Extracted from src/pin-details-ui.mjs
 */

import { renderAppSidebar } from '../app-sidebar.mjs';

export function getPinDetailsBodyHtml(safePinId) {
  return `
<body class="bg-slate-50 text-slate-900 dark:bg-[#09090B] dark:text-[#FAFAFA] min-h-screen antialiased flex flex-col font-sans transition-colors duration-200" x-data="pinDetailApp('${safePinId}')">

  <!-- Toast Notification Container -->
  <div 
    x-show="toast.show" 
    x-transition:enter="transition ease-out duration-200"
    x-transition:enter-start="opacity-0 translate-y-2 scale-95"
    x-transition:enter-end="opacity-100 translate-y-0 scale-100"
    x-transition:leave="transition ease-in duration-150"
    x-transition:leave-start="opacity-100 translate-y-0 scale-100"
    x-transition:leave-end="opacity-0 translate-y-2 scale-95"
    class="fixed top-5 right-5 z-50 max-w-sm px-4 py-3 rounded-xl shadow-xl border flex items-center gap-3 text-xs font-medium backdrop-blur-md"
    :class="toast.type === 'error' ? 'bg-red-950/90 text-red-200 border-red-800' : 'bg-emerald-950/90 text-emerald-200 border-emerald-800'"
    x-cloak
  >
    <span x-text="toast.type === 'error' ? '⚠️' : '✅'" class="text-base"></span>
    <span x-text="toast.message" class="flex-1 font-sans"></span>
    <button @click="toast.show = false" class="text-slate-400 hover:text-white ml-2">✕</button>
  </div>

  ${renderAppSidebar({ activeNav: 'keywords', refreshHandler: 'loadDossier(true)' })}

  <!-- Main Shell Wrapper (Offset for Unified Desktop Sidebar) [INVARIANT: UNIFIED-SIDEBAR-LAYOUT] -->
  <div class="flex-1 min-h-screen flex flex-col transition-all duration-300 ease-in-out" :class="isSidebarCollapsed ? 'md:ml-20' : 'md:ml-64 lg:ml-72'">

  <!-- Unified Top Sticky Command Bar (56px) -->
  <header class="border-b border-[#27272A] bg-[#121215]/95 backdrop-blur-md sticky top-0 z-40 px-4 sm:px-6 py-2.5 flex items-center justify-between shadow-xs">
    <!-- Left: Navigation & Context Breadcrumb -->
    <div class="flex items-center gap-3 min-w-0">
      <a 
        :href="getBackUrl()" 
        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#27272A] bg-[#18181B] hover:bg-[#27272A] text-xs font-semibold text-slate-300 hover:text-white transition shadow-2xs shrink-0"
        :title="getBackButtonTitle()"
      >
        <span class="text-slate-400">←</span>
        <span class="truncate max-w-[120px] sm:max-w-[160px]" x-text="getBackButtonLabel()"></span>
      </a>

      <!-- Breadcrumbs Trail -->
      <nav aria-label="Breadcrumb" class="hidden md:flex items-center gap-1.5 text-xs text-slate-400 min-w-0">
        <template x-if="isCreatorContext()">
          <div class="flex items-center gap-1.5 truncate">
            <span class="text-slate-600">/</span>
            <a href="/accounts" class="text-slate-400 hover:text-white" title="Creator Archive">Creator Hub</a>
            <span class="text-slate-600">/</span>
            <a :href="'/' + encodeURIComponent(originCreator)" class="text-rose-400 hover:underline font-medium truncate" x-text="'@' + originCreator"></a>
            <template x-if="originBoard">
              <span class="flex items-center gap-1.5 truncate">
                <span class="text-slate-600">/</span>
                <a :href="'/' + encodeURIComponent(originCreator) + '/' + encodeURIComponent(getBoardSlug(originBoard))" class="text-slate-300 hover:underline truncate" x-text="originBoard"></a>
              </span>
            </template>
          </div>
        </template>
        <template x-if="!isCreatorContext() && originSource === 'folder'">
          <div class="flex items-center gap-1.5 truncate">
            <span class="text-slate-600">/</span>
            <a href="/folders" class="text-slate-400 hover:text-white">Campaign Folders</a>
            <template x-if="originFolderId">
              <span class="flex items-center gap-1.5 truncate">
                <span class="text-slate-600">/</span>
                <a :href="'/folders/' + encodeURIComponent(originFolderId)" class="text-indigo-400 hover:underline truncate" x-text="originFolderName || ('Folder #' + originFolderId)"></a>
              </span>
            </template>
          </div>
        </template>
        <template x-if="!isCreatorContext() && originSource === 'domain'">
          <div class="flex items-center gap-1.5 truncate">
            <span class="text-slate-600">/</span>
            <a href="/domains" class="text-slate-400 hover:text-white">Domain Studio</a>
            <template x-if="originDomain">
              <span class="flex items-center gap-1.5 truncate">
                <span class="text-slate-600">/</span>
                <a :href="'/domains/' + encodeURIComponent(originDomain)" class="text-sky-400 hover:underline truncate" x-text="originDomain"></a>
              </span>
            </template>
          </div>
        </template>
        <template x-if="!isCreatorContext() && originSource === 'pulse'">
          <div class="flex items-center gap-1.5 truncate">
            <span class="text-slate-600">/</span>
            <a :href="originReturnUrl || '/pulse'" class="text-rose-400 hover:underline font-medium truncate">24h Pulse Studio</a>
            <template x-if="originFolderId">
              <span class="flex items-center gap-1.5 truncate">
                <span class="text-slate-600">/</span>
                <a :href="'/folders/' + encodeURIComponent(originFolderId) + '/pulse'" class="text-indigo-400 hover:underline truncate" x-text="originFolderName || ('Folder #' + originFolderId)"></a>
              </span>
            </template>
          </div>
        </template>
        <template x-if="!isCreatorContext() && originSource !== 'folder' && originSource !== 'domain' && originSource !== 'pulse'">
          <div class="flex items-center gap-1.5 truncate">
            <span class="text-slate-600">/</span>
            <a href="/keywords" class="text-slate-400 hover:text-white">Keywords Radar</a>
            <template x-if="originFolderId || originFolderName">
              <span class="flex items-center gap-1.5 truncate">
                <span class="text-slate-600">/</span>
                <a :href="'/folders?id=' + encodeURIComponent(originFolderId || '')" class="text-indigo-400 hover:underline truncate" x-text="originFolderName || ('Folder #' + originFolderId)"></a>
              </span>
            </template>
            <template x-if="originKeyword">
              <span class="flex items-center gap-1.5 truncate">
                <span class="text-slate-600">/</span>
                <span class="text-rose-400 font-medium truncate" x-text="originKeyword"></span>
              </span>
            </template>
          </div>
        </template>
        <span class="text-slate-600">/</span>
        <span class="font-mono tabular-nums text-slate-300 font-bold">#<span x-text="pinId"></span></span>
      </nav>
    </div>

    <!-- Center: Storage Topology Badge & Status Dot -->
    <div class="hidden lg:flex items-center gap-2">
      <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-[#27272A] bg-[#18181B] text-[11px] font-mono tabular-nums text-slate-300">
        <span class="w-2 h-2 rounded-full" :class="isDbBusy ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'"></span>
        <span>Native VPS PostgreSQL</span>
      </div>
    </div>

    <!-- Right: Command Actions -->
    <div class="flex items-center gap-2 shrink-0">
      <!-- Silent Background Refresh Indicator -->
      <template x-if="isSilentRefreshing">
        <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] text-amber-300 bg-amber-950/50 border border-amber-800 shadow-xs">
          <svg class="w-3.5 h-3.5 animate-spin text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
          <span class="hidden sm:inline">Refreshing...</span>
        </div>
      </template>

      <!-- Live Deep Sync CTA -->
      <button 
        type="button"
        @click="triggerLiveDeepSync()" 
        :disabled="isSyncing"
        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-all shadow-xs active:scale-95 disabled:opacity-50 cursor-pointer"
        title="Live deep scrape on Pinterest (strictly unauthenticated guest session) and sync across all 4 pillars"
      >
        <svg :class="isSyncing ? 'animate-spin' : ''" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
        <span x-text="isSyncing ? 'Syncing...' : 'Live Deep Sync'"></span>
      </button>

      <!-- Purge Pin Action -->
      <button 
        type="button"
        @click="requestPurgePin()"
        class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-red-900/60 bg-red-950/30 hover:bg-red-900/50 text-red-400 text-xs font-semibold transition-all active:scale-95 cursor-pointer"
        title="Permanently delete this pin from PostgreSQL and Edge Caches"
      >
        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
        <span class="hidden sm:inline">Purge Pin</span>
      </button>

      <!-- 24h Pulse Radar Quick Link -->
      <a 
        :href="originFolderId ? ('/folders/' + encodeURIComponent(originFolderId) + '/pulse') : '/pulse'" 
        class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-semibold transition"
        :title="originFolderId ? ('Open Folder #' + originFolderId + ' 24h Algorithmic Pulse Radar') : 'Open 24h Algorithmic Pulse & Crossover Radar'"
      >
        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
        <span class="hidden sm:inline">24h Pulse Radar</span>
      </a>

      <!-- Open External Pinterest -->
      <a 
        :href="'https://www.pinterest.com/pin/' + pinId + '/'" 
        target="_blank" 
        rel="noopener noreferrer" 
        class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#27272A] bg-[#18181B] hover:bg-[#27272A] text-slate-300 hover:text-white text-xs font-medium transition"
        title="Open pin page on Pinterest in new tab"
      >
        <span>Open on Pinterest</span>
        <svg class="w-3.5 h-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7"/><path d="M7 7h10v10"/></svg>
      </a>

      <!-- Theme Switcher (Dark/Light Mode) -->
      <button 
        type="button" 
        @click="toggleTheme()" 
        class="p-2 rounded-lg border border-[#27272A] bg-[#18181B] hover:bg-[#27272A] text-slate-300 hover:text-white transition cursor-pointer flex items-center justify-center min-w-[34px] min-h-[34px]"
        :title="isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme'"
      >
        <svg x-show="isDark" class="w-4 h-4 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
        <svg x-show="!isDark" class="w-4 h-4 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
      </button>

      <!-- Refresh Button -->
      <button 
        type="button"
        @click="loadDossier(true)" 
        :disabled="loading"
        class="p-2 rounded-lg border border-[#27272A] bg-[#18181B] hover:bg-[#27272A] text-slate-300 hover:text-white transition cursor-pointer flex items-center justify-center min-w-[34px] min-h-[34px]"
        :title="'Reload dossier from Native VPS PostgreSQL'"
      >
        <svg :class="loading ? 'animate-spin' : ''" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
      </button>
    </div>
  </header>

  <!-- Full-Page Loading Spinner (Initial load only) -->
  <div x-show="loading && !dossier" class="flex-1 flex items-center justify-center p-12" x-cloak>
    <div class="flex flex-col items-center gap-3 max-w-sm text-center">
      <div class="w-10 h-10 border-2 border-rose-600 border-t-transparent rounded-full animate-spin"></div>
      <div class="text-sm font-semibold text-white">Resolving Universal Pin Dossier...</div>
      <div class="text-xs text-slate-400 font-mono tabular-nums">Querying Native VPS PostgreSQL SSOT...</div>
    </div>
  </div>

  <!-- Error State -->
  <div x-show="!loading && (!dossier || !dossier.success)" class="flex-1 flex items-center justify-center p-8" x-cloak>
    <div class="bg-[#121215] border border-[#27272A] rounded-2xl max-w-md w-full p-8 text-center flex flex-col items-center gap-4 shadow-xl">
      <div 
        class="w-14 h-14 rounded-full flex items-center justify-center text-2xl border"
        :class="isDbBusy ? 'bg-amber-950/40 border-amber-800 text-amber-400' : 'bg-red-950/40 border-red-800 text-red-400'"
      >
        <span x-text="isDbBusy ? '⏳' : '⚠️'"></span>
      </div>
      <div>
        <h2 class="text-base font-bold text-white" x-text="isDbBusy ? 'Database Busy' : 'Pin Telemetry Not Found'"></h2>
        <p class="text-xs text-slate-400 mt-1 leading-relaxed" x-text="isDbBusy ? 'The database is temporarily busy processing a heavy query. Please retry in a few seconds.' : 'Pin #' + pinId + ' is either offline, not yet crawled, or does not exist.'"></p>
      </div>
      <div class="flex items-center gap-3 pt-2">
        <button @click="loadDossier(true)" class="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition flex items-center gap-1.5 shadow-xs cursor-pointer">
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>
          <span x-text="isDbBusy ? 'Retry Fetch' : 'Try Force Refresh'"></span>
        </button>
        <a href="/keywords" class="px-4 py-2 rounded-lg border border-[#27272A] bg-[#18181B] hover:bg-[#27272A] text-slate-300 text-xs font-medium transition">
          Return to Radar
        </a>
      </div>
    </div>
  </div>

  <!-- MAIN DOSSIER: Two-Column Forensic Workspace -->
  <main x-show="dossier && dossier.success" class="flex-1 max-w-[1720px] w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col md:flex-row gap-6" x-cloak>
    
    <!-- ======================================================== -->
    <!-- LEFT RAIL: Visual Asset Preview & Provenance Ledger (~340px) -->
    <!-- ======================================================== -->
    <div class="w-full md:w-[300px] lg:w-[340px] max-w-sm mx-auto md:mx-0 shrink-0 space-y-4 md:sticky md:top-20 self-start">
      
      <!-- Creative Image Canvas with Natural Aspect Ratio Shield -->
      <div class="rounded-xl border border-[#27272A] bg-[#121215] overflow-hidden shadow-sm flex flex-col">
        <div class="relative w-full aspect-[2/3] max-h-[500px] overflow-hidden flex items-center justify-center" :style="'background-color: ' + safeColor(dossier?.creative?.dominant_color)">
          <img 
            :src="resolveHdImageUrl(dossier?.creative?.image_hd_url || dossier?.creative?.image_url)" 
            :alt="dossier?.creative?.alt_text || dossier?.creative?.title"
            @load="onImageLoad($event)"
            @error="if (window.handlePinImgError) { window.handlePinImgError($el); } else if ($el.src !== (dossier?.creative?.image_url || '')) { $el.src = (dossier?.creative?.image_url || ''); }"
            loading="lazy" 
            class="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
          />
        </div>

        <!-- Clean Media Strip directly beneath the image -->
        <div class="p-3 border-t border-[#27272A] bg-[#18181B] space-y-2">
          <!-- 3-Tier HD Asset Download Action -->
          <div class="pb-1.5 border-b border-[#27272A]">
            <button
              type="button"
              @click="downloadHdAsset(dossier?.creative?.image_url, pinId)"
              class="w-full py-2 px-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-semibold transition flex items-center justify-center gap-2 shadow-xs active:scale-95 cursor-pointer"
              title="Download lossless original asset (with 1200x fallback)"
            >
              <i data-lucide="download" class="w-3.5 h-3.5"></i>
              <span>Download HD Asset</span>
            </button>
          </div>

          <div class="flex items-center justify-between text-[11px]">
            <span class="text-slate-400 font-medium">Creation Method</span>
            <span class="px-2 py-0.5 rounded text-[10px] font-semibold border" :class="getCreationMethodBadgeClass()" x-text="formatCreationMethodLabel()"></span>
          </div>

          <div class="flex items-center justify-between text-[11px]">
            <span class="text-slate-400 font-medium">Media Format</span>
            <span class="font-mono tabular-nums text-slate-200" x-text="getMediaFormatLabel()"></span>
          </div>

          <div class="flex items-center justify-between text-[11px]">
            <span class="text-slate-400 font-medium">Resolution & Aspect</span>
            <span class="font-mono tabular-nums text-slate-300" x-text="getResolutionRatioText()"></span>
          </div>

          <template x-if="dossier?.creative?.image_signature || dossier?.algorithmic_intelligence?.image_signature">
            <div class="flex items-center justify-between text-[11px] pt-1 border-t border-[#27272A]">
              <span class="text-slate-400 font-medium">Perceptual Hash</span>
              <button 
                type="button" 
                @click="copyText(dossier?.creative?.image_signature || dossier?.algorithmic_intelligence?.image_signature, 'Perceptual Image Hash')"
                class="font-mono tabular-nums text-rose-400 hover:text-rose-300 flex items-center gap-1 cursor-pointer"
                title="Click to copy 64-bit perceptual hash"
              >
                <span x-text="(dossier?.creative?.image_signature || dossier?.algorithmic_intelligence?.image_signature || '').slice(0, 12) + '...'"></span>
                <svg class="w-3 h-3 text-slate-400 hover:text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
              </button>
            </div>
          </template>
        </div>
      </div>

      <!-- Structured Attribution & Provenance Ledger -->
      <div class="p-4 rounded-xl border border-[#27272A] bg-[#121215] space-y-3 shadow-xs text-xs">
        <div class="text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-[#27272A] pb-2 flex items-center justify-between">
          <span>Provenance Ledger</span>
          <span class="text-slate-500">#<span x-text="pinId"></span></span>
        </div>

        <!-- Creator Profile -->
        <div class="flex items-start justify-between gap-2">
          <span class="text-slate-400 shrink-0">Creator</span>
          <div class="text-right truncate">
            <template x-if="dossier?.pillar_1_creator_context?.creator_username || dossier?.creator_username">
              <div class="flex flex-col items-end gap-1">
                <template x-if="dossier?.pillar_1_creator_context?.is_tracked_competitor">
                  <a :href="'/' + encodeURIComponent(dossier?.pillar_1_creator_context?.creator_username || dossier?.creator_username)" class="font-bold text-rose-400 hover:underline flex items-center justify-end gap-1">
                    <span>@</span><span x-text="dossier?.pillar_1_creator_context?.creator_username || dossier?.creator_username"></span>
                    <template x-if="dossier?.algorithmic_intelligence?.creator_is_verified_merchant">
                      <span class="inline-flex items-center text-sky-400 ml-0.5" title="Verified Merchant"><svg class="w-3 h-3 text-sky-400 inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg></span>
                    </template>
                  </a>
                </template>
                <template x-if="!dossier?.pillar_1_creator_context?.is_tracked_competitor">
                  <div class="flex items-center justify-end gap-1.5 flex-wrap">
                    <span class="font-medium text-slate-300 flex items-center gap-1" :title="'Untracked creator @' + (dossier?.pillar_1_creator_context?.creator_username || dossier?.creator_username)">
                      <span>@</span><span x-text="dossier?.pillar_1_creator_context?.creator_username || dossier?.creator_username"></span>
                    </span>
                    <button 
                      type="button"
                      @click="trackCreatorPulse(dossier?.pillar_1_creator_context?.creator_username || dossier?.creator_username)"
                      :disabled="isTrackingCreator"
                      class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30 transition flex items-center gap-1 active:scale-95 disabled:opacity-50 cursor-pointer"
                      title="Track creator with 24h lightweight pulse sync"
                    >
                      <i data-lucide="zap" class="w-2.5 h-2.5 text-rose-400" :class="isTrackingCreator ? 'animate-spin' : ''"></i>
                      <span x-text="isTrackingCreator ? 'Tracking...' : '+ Track Creator (Pulse)'"></span>
                    </button>
                    <template x-if="dossier?.algorithmic_intelligence?.creator_is_verified_merchant">
                      <span class="inline-flex items-center text-sky-400 ml-0.5" title="Verified Merchant"><svg class="w-3 h-3 text-sky-400 inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg></span>
                    </template>
                  </div>
                </template>
              </div>
            </template>
            <template x-if="!(dossier?.pillar_1_creator_context?.creator_username || dossier?.creator_username)">
              <span class="text-slate-500">Unattributed</span>
            </template>
            <template x-if="dossier?.algorithmic_intelligence?.origin_pinner_followers || dossier?.pillar_1_creator_context?.competitor_profile?.followers">
              <div class="text-[10px] text-slate-500 font-mono tabular-nums" x-text="formatNumber(dossier?.algorithmic_intelligence?.origin_pinner_followers || dossier?.pillar_1_creator_context?.competitor_profile?.followers) + ' followers'"></div>
            </template>
          </div>
        </div>

        <!-- Board Name -->
        <div class="flex items-start justify-between gap-2 border-t border-[#1E1E22] pt-2">
          <span class="text-slate-400 shrink-0">Board</span>
          <div class="text-right truncate">
            <template x-if="dossier?.pillar_1_creator_context?.board_name">
              <span class="font-semibold text-slate-200" x-text="dossier.pillar_1_creator_context.board_name"></span>
            </template>
            <template x-if="!dossier?.pillar_1_creator_context?.board_name">
              <span class="text-slate-500 font-mono">--</span>
            </template>
            <template x-if="dossier?.algorithmic_intelligence?.board_metrics?.pin_count">
              <div class="text-[10px] text-slate-500 font-mono tabular-nums" x-text="dossier.algorithmic_intelligence.board_metrics.pin_count + ' pins in board'"></div>
            </template>
          </div>
        </div>

        <!-- Outbound Domain & Destination Link -->
        <div class="flex items-start justify-between gap-2 border-t border-[#1E1E22] pt-2">
          <span class="text-slate-400 shrink-0">Destination</span>
          <div class="text-right truncate max-w-[200px]">
            <template x-if="dossier?.creative?.domain">
              <a :href="'/domains?q=' + encodeURIComponent(dossier.creative.domain)" class="font-bold text-sky-400 hover:underline truncate block" x-text="dossier.creative.domain"></a>
            </template>
            <template x-if="!dossier?.creative?.domain">
              <span class="text-slate-500">No outbound domain</span>
            </template>
            <template x-if="dossier?.creative?.destination_url">
              <button 
                type="button" 
                @click="copyUrl(dossier.creative.destination_url)" 
                class="text-[10px] text-slate-400 hover:text-white flex items-center justify-end gap-1 mt-0.5 cursor-pointer ml-auto"
                title="Copy Destination URL"
              >
                <span>Copy link</span>
                <svg class="w-2.5 h-2.5 text-slate-400 hover:text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
              </button>
            </template>
            <template x-if="dossier?.creative?.url_global_saves != null || dossier?.url_global_saves != null">
              <div class="text-[10px] text-emerald-400 font-mono tabular-nums font-bold mt-1 flex items-center justify-end gap-1">
                <span class="inline-flex items-center gap-1"><svg class="w-3 h-3 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg><span>Article Saves:</span></span>
                <span x-text="formatNumber(dossier?.creative?.url_global_saves ?? dossier?.url_global_saves ?? 0)"></span>
              </div>
            </template>
            <template x-if="computeViralityRatio() >= 5.0">
              <div class="mt-1">
                <span class="px-1.5 py-0.5 rounded text-[9px] font-mono tabular-nums font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 inline-flex items-center gap-1"
                      x-text="'[' + computeViralityRatio() + 'x Alpha Breakout]'"></span>
              </div>
            </template>
          </div>
        </div>

        <!-- Published Age (Strict Invariant 31 Formatting) -->
        <div class="flex items-center justify-between gap-2 border-t border-[#1E1E22] pt-2">
          <span class="text-slate-400 shrink-0">Published Age</span>
          <span class="font-mono tabular-nums font-bold text-slate-200" x-text="formatStrictUniversalAge()"></span>
        </div>

        <!-- Storage Topology -->
        <div class="flex items-center justify-between gap-2 border-t border-[#1E1E22] pt-2">
          <span class="text-slate-400 shrink-0">Storage Architecture</span>
          <span class="font-mono tabular-nums text-emerald-400 font-semibold">Native VPS PostgreSQL</span>
        </div>

        <!-- Cross-Pillar Radar Action -->
        <div class="pt-2 space-y-1">
          <div class="text-[10px] font-bold uppercase tracking-wider text-slate-500">Related Pins Semantic Radar</div>
          <a 
            :href="'/api/keywords/visual-search?pin_id=' + encodeURIComponent(pinId)" 
            target="_blank" 
            class="w-full py-2 px-3 rounded-lg border border-[#27272A] bg-[#18181B] hover:bg-[#27272A] text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
          >
            <span>Launch Related Radar</span>
            <span class="text-slate-500">↗</span>
          </a>
        </div>
      </div>

    </div>

    <!-- ======================================================== -->
    <!-- RIGHT RAIL: Intelligence, Telemetry & Analytical Cockpit -->
    <!-- ======================================================== -->
    <div class="flex-1 min-w-0 space-y-6">

      <!-- Executive Status & Creative Title Card -->
      <div class="p-5 rounded-xl border border-[#27272A] bg-[#121215] space-y-4 shadow-xs">
        
        <!-- Status Chips Header Ribbon -->
        <div class="flex items-center gap-2 flex-wrap text-xs">
          <!-- Status 1: Original Creator Upload vs Canonical Variant vs Repin -->
          <template x-if="!dossier?.algorithmic_intelligence?.is_repin && dossier?.algorithmic_intelligence?.is_canonical_root !== false">
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-950/60 text-emerald-300 border border-emerald-800/80 font-semibold">
              <svg class="w-3 h-3 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              <span>100% Original Creator Upload</span>
            </span>
          </template>
          <template x-if="!dossier?.algorithmic_intelligence?.is_repin && dossier?.algorithmic_intelligence?.is_canonical_root === false">
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-indigo-950/60 text-indigo-300 border border-indigo-800/80 font-medium">
              <svg class="w-3 h-3 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>
              <span>Canonical Variant</span>
            </span>
          </template>
          <template x-if="dossier?.algorithmic_intelligence?.is_repin">
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800 text-slate-300 border border-[#27272A] font-medium">
              <svg class="w-3 h-3 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>
              <span>Curated Repin</span>
            </span>
          </template>

          <!-- Status 2: Direct Destination Link vs Linkless -->
          <template x-if="dossier?.creative?.destination_url && !dossier?.algorithmic_intelligence?.is_go_linkless">
            <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-sky-950/60 text-sky-300 border border-sky-800/80 font-medium">
              <svg class="w-3 h-3 text-sky-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
              <span>Direct Destination Link</span>
            </span>
          </template>
          <template x-if="!dossier?.creative?.destination_url || dossier?.algorithmic_intelligence?.is_go_linkless">
            <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-950/60 text-amber-300 border border-amber-800/80 font-medium">
              <span>⚠️</span>
              <span>Linkless Pin</span>
            </span>
          </template>

          <!-- Status 3: Google Indexed vs Noindex -->
          <template x-if="!dossier?.algorithmic_intelligence?.seo_noindex_reason">
            <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-950/60 text-emerald-300 border border-emerald-800/80 font-medium">
              <svg class="w-3 h-3 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>
              <span>Indexed in Google</span>
            </span>
          </template>
          <template x-if="dossier?.algorithmic_intelligence?.seo_noindex_reason">
            <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-red-950/60 text-red-300 border border-red-800/80 font-medium">
              <svg class="w-3 h-3 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/></svg>
              <span x-text="'Noindex: ' + dossier.algorithmic_intelligence.seo_noindex_reason"></span>
            </span>
          </template>

          <!-- Status 4: Canonical Root Source -->
          <template x-if="isCanonicalRoot()">
            <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-purple-950/60 text-purple-300 border border-purple-800/80 font-mono text-[11px] tabular-nums">
              <svg class="w-3 h-3 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"/></svg>
              <span>Canonical Root</span>
            </span>
          </template>
          <template x-if="!isCanonicalRoot() && canonicalPinId()">
            <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-indigo-950/60 text-indigo-300 border border-indigo-800/80 font-mono text-[11px] tabular-nums">
              <svg class="w-3 h-3 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
              <span x-text="'Repin of #' + canonicalPinId()"></span>
            </span>
          </template>
        </div>

        <!-- Creative Title & Description -->
        <div class="space-y-2">
          <h1 class="text-xl sm:text-2xl font-black text-[#FAFAFA] leading-tight" x-text="dossier?.creative?.title || ('Pin #' + pinId)"></h1>
          <template x-if="dossier?.creative?.description">
            <p class="text-sm text-slate-700 dark:text-zinc-200 leading-relaxed font-sans font-normal" x-text="dossier.creative.description"></p>
          </template>
        </div>

        <!-- SEO Alt-Text Row -->
        <template x-if="dossier?.creative?.alt_text">
          <div class="p-3.5 rounded-xl border border-[#27272A] bg-[#18181B]/80 flex items-start justify-between gap-3 text-xs">
            <div class="space-y-1 min-w-0">
              <div class="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <i data-lucide="sparkles" class="w-3 h-3 text-rose-400"></i>
                <span>Image Alt-Text (Accessibility & Image SEO)</span>
              </div>
              <p class="text-slate-200 font-sans leading-relaxed text-xs select-all" x-text="dossier.creative.alt_text"></p>
            </div>
            <button 
              type="button" 
              @click="copyAltText()" 
              class="px-2.5 py-1 rounded-md border border-[#27272A] bg-[#121215] hover:bg-[#27272A] text-slate-200 hover:text-white text-[11px] font-medium shrink-0 flex items-center gap-1 cursor-pointer transition-colors"
            >
              <i data-lucide="copy" class="w-3 h-3"></i>
              <span>Copy</span>
            </button>
          </div>
        </template>

        <!-- Live Pinterest Vision Tags Cloud -->
        <template x-if="activeLiveTags().length > 0">
          <div class="space-y-1.5 pt-1">
            <span class="text-[10px] font-bold uppercase tracking-wider text-slate-500">Live Active Vision Tags</span>
            <div class="flex items-center gap-1.5 flex-wrap">
              <template x-for="tag in activeLiveTags()" :key="tag.name">
                <span class="px-2 py-0.5 rounded-md text-[11px] font-medium bg-[#18181B] border border-[#27272A] text-slate-300" x-text="tag.name"></span>
              </template>
            </div>
          </div>
        </template>
      </div>

      <!-- ======================================================== -->
      <!-- 5-CELL TELEMETRY RIBBON (Dual-Track Velocity Engine)     -->
      <!-- ======================================================== -->
      <div class="grid grid-cols-2 sm:grid-cols-6 xl:grid-cols-5 gap-3">
        <!-- Cell 1: Total Saves -->
        <div class="col-span-1 sm:col-span-2 xl:col-span-1 p-4 rounded-xl border border-[#27272A] bg-[#121215] hover:border-zinc-700/80 transition-all flex flex-col justify-between shadow-xs group">
          <div class="flex items-center justify-between text-slate-400">
            <span class="text-[10.5px] font-bold uppercase tracking-wider">Total Saves</span>
            <div class="p-1.5 rounded-md bg-rose-500/10 text-rose-400 border border-rose-500/20">
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>
            </div>
          </div>
          <div class="mt-2">
            <div class="text-2xl font-black font-mono tabular-nums text-white group-hover:text-rose-100 transition-colors" x-text="formatNumber(dossier?.creative?.save_count || 0)"></div>
            <div class="text-[11px] text-emerald-400 font-mono tabular-nums font-semibold mt-0.5">
              <span x-text="format24hSaveDelta()"></span>
            </div>
          </div>
        </div>

        <!-- Cell 2: Save Velocity Engine (24h Live Delta vs Lifetime Amortized) [L-02 Resolved] -->
        <div class="col-span-1 sm:col-span-2 xl:col-span-1 p-4 rounded-xl border border-[#27272A] bg-[#121215] hover:border-zinc-700/80 transition-all flex flex-col justify-between shadow-xs group">
          <div class="flex items-center justify-between text-slate-400">
            <span class="text-[10.5px] font-bold uppercase tracking-wider">Daily Velocity</span>
            <div class="p-1.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            </div>
          </div>
          <div class="mt-2">
            <div class="flex items-baseline gap-1">
              <span class="text-2xl font-black font-mono tabular-nums text-emerald-400" x-text="formatLive24hVelocity()"></span>
              <span class="text-[10px] text-slate-400 uppercase font-mono">live 24h</span>
            </div>
            <div class="text-[10.5px] text-slate-400 font-mono tabular-nums mt-0.5 truncate" x-text="formatLifetimeVelocityCaption()"></div>
          </div>
        </div>

        <!-- Cell 3: Total Repins & Engagement -->
        <div class="col-span-1 sm:col-span-2 xl:col-span-1 p-4 rounded-xl border border-[#27272A] bg-[#121215] hover:border-zinc-700/80 transition-all flex flex-col justify-between shadow-xs group">
          <div class="flex items-center justify-between text-slate-400">
            <span class="text-[10.5px] font-bold uppercase tracking-wider">Total Repins</span>
            <div class="p-1.5 rounded-md bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>
            </div>
          </div>
          <div class="mt-2">
            <div class="text-2xl font-black font-mono tabular-nums text-white group-hover:text-indigo-100 transition-colors" x-text="formatNumber(dossier?.creative?.repin_count || 0)"></div>
            <div class="text-[10.5px] text-slate-400 font-mono tabular-nums mt-0.5" x-text="formatViralityRatio()"></div>
          </div>
        </div>

        <!-- Cell 4: SERP Footprint & Best Rank -->
        <div class="col-span-1 sm:col-span-3 xl:col-span-1 p-4 rounded-xl border border-[#27272A] bg-[#121215] hover:border-zinc-700/80 transition-all flex flex-col justify-between shadow-xs group">
          <div class="flex items-center justify-between text-slate-400">
            <span class="text-[10.5px] font-bold uppercase tracking-wider">Best SERP Rank</span>
            <div class="p-1.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>
            </div>
          </div>
          <div class="mt-2">
            <div class="text-2xl font-black font-mono tabular-nums text-white group-hover:text-amber-100 transition-colors" x-text="getBestRankDisplay()"></div>
            <div class="text-[10.5px] text-slate-400 font-mono tabular-nums mt-0.5 truncate" x-text="getSerpFootprintSummary()"></div>
          </div>
        </div>

        <!-- Cell 5: Total Engagement Score -->
        <div class="col-span-2 sm:col-span-3 xl:col-span-1 p-4 rounded-xl border border-[#27272A] bg-[#121215] hover:border-zinc-700/80 transition-all flex flex-col justify-between shadow-xs group">
          <div class="flex items-center justify-between text-slate-400">
            <span class="text-[10.5px] font-bold uppercase tracking-wider">Total Engagement</span>
            <div class="p-1.5 rounded-md bg-sky-500/10 text-sky-400 border border-sky-500/20">
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </div>
          </div>
          <div class="mt-2">
            <div class="text-2xl font-black font-mono tabular-nums text-white group-hover:text-sky-100 transition-colors" x-text="formatNumber(totalEngagementScore())"></div>
            <div class="text-[10.5px] text-slate-400 font-mono tabular-nums mt-0.5 truncate">
              <span x-text="formatNumber(totalReactions())"></span> reactions, 
              <span x-text="dossier?.creative?.comment_count || 0"></span> comments, 
              <span x-text="totalShares()"></span> shares<template x-if="totalReactions() > 0"><span>, <span x-text="totalReactions()"></span> reactions</span></template>
            </div>
          </div>
        </div>
      </div>

      <!-- ======================================================== -->
      <!-- DUAL-AXIS SVG PERFORMANCE TRAJECTORY CHART [L-10 Fixed]  -->
      <!-- ======================================================== -->
      <div class="p-5 rounded-xl border border-[#27272A] bg-[#121215] space-y-4 shadow-xs">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div class="text-xs font-bold uppercase tracking-wider text-slate-400">Performance Trajectory</div>
            <div class="text-[11px] text-slate-500 font-mono tabular-nums">Multi-day historical telemetry plotted from Native VPS PostgreSQL SSOT</div>
          </div>

          <!-- Timeframe & Metric Selector [NL-03 Resolved] -->
          <div class="flex items-center gap-2 flex-wrap">
            <div class="flex items-center p-0.5 rounded-lg border border-[#27272A] bg-[#18181B] text-[11px] font-mono">
              <button type="button" @click="chartMetric = 'saves'" class="px-2.5 py-1 rounded transition cursor-pointer" :class="chartMetric === 'saves' ? 'bg-[#27272A] text-white font-bold' : 'text-slate-400 hover:text-white'">Saves</button>
              <button type="button" @click="chartMetric = 'velocity'" class="px-2.5 py-1 rounded transition cursor-pointer" :class="chartMetric === 'velocity' ? 'bg-[#27272A] text-white font-bold' : 'text-slate-400 hover:text-white'">Velocity</button>
            </div>
            <div class="flex items-center p-0.5 rounded-lg border border-[#27272A] bg-[#18181B] text-[11px] font-mono">
              <button type="button" @click="chartTimeframe = '7d'" class="px-2.5 py-1 rounded transition cursor-pointer" :class="chartTimeframe === '7d' ? 'bg-[#27272A] text-white font-bold' : 'text-slate-400 hover:text-white'">7D</button>
              <button type="button" @click="chartTimeframe = '15d'" class="px-2.5 py-1 rounded transition cursor-pointer" :class="chartTimeframe === '15d' ? 'bg-[#27272A] text-white font-bold' : 'text-slate-400 hover:text-white'">15D</button>
              <button type="button" @click="chartTimeframe = '30d'" class="px-2.5 py-1 rounded transition cursor-pointer" :class="chartTimeframe === '30d' ? 'bg-[#27272A] text-white font-bold' : 'text-slate-400 hover:text-white'">30D</button>
              <button type="button" @click="chartTimeframe = 'all'" class="px-2.5 py-1 rounded transition cursor-pointer" :class="chartTimeframe === 'all' ? 'bg-[#27272A] text-white font-bold' : 'text-slate-400 hover:text-white'">ALL</button>
            </div>
          </div>
        </div>

        <!-- Rendered Interactive SVG Canvas -->
        <div class="relative w-full h-44 bg-[#18181B]/60 rounded-lg border border-[#27272A] p-2 flex items-center justify-center overflow-hidden">
          <template x-if="computeChartPoints().length >= 2">
            <div class="relative w-full h-full">
              <svg class="w-full h-full" viewBox="0 0 800 180" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="chart-area-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" :stop-color="chartMetric === 'velocity' ? '#10B981' : '#E11D48'" stop-opacity="0.35" />
                    <stop offset="100%" :stop-color="chartMetric === 'velocity' ? '#10B981' : '#E11D48'" stop-opacity="0.0" />
                  </linearGradient>
                </defs>
                <!-- Horizontal Grid Lines -->
                <line x1="40" y1="30" x2="760" y2="30" stroke="#27272A" stroke-dasharray="4 4" stroke-width="1" />
                <line x1="40" y1="90" x2="760" y2="90" stroke="#27272A" stroke-dasharray="4 4" stroke-width="1" />
                <line x1="40" y1="150" x2="760" y2="150" stroke="#27272A" stroke-dasharray="4 4" stroke-width="1" />

                <!-- Area Path -->
                <path :d="buildSvgAreaPath()" fill="url(#chart-area-grad)" />

                <!-- Line Path -->
                <path :d="buildSvgLinePath()" fill="none" :stroke="chartMetric === 'velocity' ? '#10B981' : '#E11D48'" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
              </svg>

              <!-- Interactive Points HTML Overlay [INVARIANT: SVG-SAFE-TEMPLATE-OVERLAY] -->
              <div class="absolute inset-0 pointer-events-none">
                <template x-for="(pt, idx) in computeChartPoints()" :key="idx">
                  <div
                    class="absolute pointer-events-auto cursor-pointer rounded-full transition-transform hover:scale-150 -translate-x-1/2 -translate-y-1/2"
                    :style="'left: ' + ((pt.x / 800) * 100) + '%; top: ' + ((pt.y / 180) * 100) + '%; width: 8px; height: 8px; background-color: ' + (chartMetric === 'velocity' ? '#10B981' : '#E11D48') + '; border: 1.5px solid #FFFFFF;'"
                    @mouseenter="hoveredChartPoint = pt"
                    @mouseleave="hoveredChartPoint = null"
                  ></div>
                </template>
              </div>
            </div>
          </template>

          <template x-if="computeChartPoints().length < 2">
            <div class="text-xs text-slate-500 font-mono text-center space-y-1.5 py-6">
              <div class="flex items-center justify-center gap-1.5 font-bold text-slate-400">
                <svg class="w-4 h-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
                <span>Single Snapshot Registered</span>
              </div>
              <div class="text-[11px] text-slate-600">Trajectory curve activates as subsequent daily crawls record progression.</div>
            </div>
          </template>

          <!-- Hover Tooltip -->
          <template x-if="hoveredChartPoint">
            <div 
              class="absolute z-20 pointer-events-none px-2.5 py-1.5 rounded-lg border border-[#27272A] bg-[#121215]/95 backdrop-blur-md shadow-xl text-xs font-mono space-y-0.5"
              :style="'left: ' + Math.min(650, Math.max(10, (hoveredChartPoint.x / 800) * 100)) + '%; top: 12px;'"
            >
              <div class="text-slate-400 font-bold" x-text="hoveredChartPoint.snapshot?.snapshot_date"></div>
              <div class="text-rose-400 font-bold" x-text="formatNumber(hoveredChartPoint.snapshot?.save_count) + ' saves'"></div>
              <div class="text-emerald-400 text-[10px]" x-text="'Velocity: ' + (hoveredChartPoint.snapshot?.daily_save_velocity || 0) + '/d'"></div>
            </div>
          </template>
        </div>
      </div>

      <!-- ======================================================== -->
      <!-- 3-TAB ANALYTICAL COCKPIT                                  -->
      <!-- ======================================================== -->
      <div class="space-y-4">
        
        <!-- Tab Navigation Bar -->
        <div class="border-b border-[#27272A] flex items-center justify-between gap-2 overflow-x-auto">
          <div class="flex items-center gap-1">
            <!-- Tab 1: Chronological Daily Ledger -->
            <button 
              type="button" 
              @click="activeTab = 'ledger'" 
              class="px-4 py-2.5 text-xs font-bold border-b-2 transition flex items-center gap-2 cursor-pointer shrink-0"
              :class="activeTab === 'ledger' ? 'border-rose-500 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'"
            >
              <svg class="w-3.5 h-3.5" :class="activeTab === 'ledger' ? 'text-rose-400' : 'text-slate-500'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg>
              <span>Historical Snapshot Audit Log</span>
              <span class="px-2 py-0.5 rounded font-mono tabular-nums text-[10px]" :class="activeTab === 'ledger' ? 'bg-rose-500/20 text-rose-300' : 'bg-[#18181B] text-slate-400'" x-text="filteredDays().length"></span>
            </button>

            <!-- Tab 2: Keyword SERP Rankings -->
            <button 
              type="button" 
              @click="activeTab = 'rankings'" 
              class="px-4 py-2.5 text-xs font-bold border-b-2 transition flex items-center gap-2 cursor-pointer shrink-0"
              :class="activeTab === 'rankings' ? 'border-rose-500 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'"
            >
              <svg class="w-3.5 h-3.5" :class="activeTab === 'rankings' ? 'text-rose-400' : 'text-slate-500'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 18v3c0 .6.4 1 1 1h4v-3h3v-3h2l1.4-1.4a6.5 6.5 0 1 0-4-4Z"/><circle cx="16.5" cy="7.5" r=".5" fill="currentColor"/></svg>
              <span>Keyword SERP Rankings</span>
              <span class="px-2 py-0.5 rounded font-mono tabular-nums text-[10px]" :class="activeTab === 'rankings' ? 'bg-rose-500/20 text-rose-300' : 'bg-[#18181B] text-slate-400'" x-text="dossier?.pillar_2_keywords_context?.ranking_keywords?.length || 0"></span>
            </button>

            <!-- Tab 3: Algorithmic DNA & Cross-Pillar Suite -->
            <button 
              type="button" 
              @click="activeTab = 'forensics'" 
              class="px-4 py-2.5 text-xs font-bold border-b-2 transition flex items-center gap-2 cursor-pointer shrink-0"
              :class="activeTab === 'forensics' ? 'border-rose-500 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'"
            >
              <svg class="w-3.5 h-3.5" :class="activeTab === 'forensics' ? 'text-rose-400' : 'text-slate-500'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 15c6.667-6 13.333 0 20-6"/><path d="M9 22c1.798-1.998 2.518-3.995 2.807-5.993"/><path d="M15 2c-1.798 1.998-2.518 3.995-2.807 5.993"/><path d="m17 6-2.5-2.5"/><path d="m14 8-1-1"/><path d="m7 18 2.5 2.5"/><path d="m3.5 14.5.5.5"/><path d="m20 9.5-.5-.5"/><path d="m6.5 12.5 1 1"/><path d="m16.5 10.5 1 1"/><path d="m10 16 1 1"/></svg>
              <span>Cross-Pillar Intelligence Suite</span>
            </button>
          </div>
        </div>

        <!-- ======================================================== -->
        <!-- TAB 1: CHRONOLOGICAL DAILY LEDGER (ACCORDION MATRIX)     -->
        <!-- ======================================================== -->
        <div x-show="activeTab === 'ledger'" class="space-y-4">
          
          <!-- Ledger Controls Ribbon -->
          <div class="p-3 rounded-xl border border-[#27272A] bg-[#121215] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-slate-400 font-medium">Daily Snapshots:</span>
              <span class="font-mono tabular-nums font-bold text-white">
                <template x-if="totalUnfilteredDaysCount() > filteredDays().length">
                  <span>Showing <span x-text="filteredDays().length"></span> of <span x-text="totalUnfilteredDaysCount()"></span> entries</span>
                </template>
                <template x-if="totalUnfilteredDaysCount() <= filteredDays().length">
                  <span x-text="formatAuditLogSummaryCount()"></span>
                </template>
              </span>
              <button type="button" @click="expandAllDays()" class="text-slate-400 hover:text-white underline text-[11px] ml-2 cursor-pointer">Expand All</button>
              <span class="text-slate-600">|</span>
              <button type="button" @click="collapseAllDays()" class="text-slate-400 hover:text-white underline text-[11px] cursor-pointer">Collapse All</button>
            </div>

            <!-- Timeframe Selector Pill Bar & Keyword Filter -->
            <div class="flex items-center gap-3 flex-wrap">
              <div class="flex items-center p-0.5 rounded-lg border border-[#27272A] bg-[#18181B] text-[11px] font-mono">
                <button type="button" @click="chartTimeframe = '7d'" class="px-2 py-0.5 rounded transition cursor-pointer" :class="chartTimeframe === '7d' ? 'bg-[#27272A] text-white font-bold' : 'text-slate-400 hover:text-white'">7D</button>
                <button type="button" @click="chartTimeframe = '15d'" class="px-2 py-0.5 rounded transition cursor-pointer" :class="chartTimeframe === '15d' ? 'bg-[#27272A] text-white font-bold' : 'text-slate-400 hover:text-white'">15D</button>
                <button type="button" @click="chartTimeframe = '30d'" class="px-2 py-0.5 rounded transition cursor-pointer" :class="chartTimeframe === '30d' ? 'bg-[#27272A] text-white font-bold' : 'text-slate-400 hover:text-white'">30D</button>
                <button type="button" @click="chartTimeframe = 'all'" class="px-2 py-0.5 rounded transition cursor-pointer" :class="chartTimeframe === 'all' ? 'bg-[#27272A] text-white font-bold' : 'text-slate-400 hover:text-white'">ALL</button>
              </div>

              <div class="flex items-center gap-2">
                <span class="text-slate-400 text-[11px]">Filter Keyword:</span>
                <select x-model="selectedKeywordFilter" class="px-2.5 py-1 rounded-lg border border-[#27272A] bg-[#18181B] text-xs font-medium text-slate-200 focus:outline-none cursor-pointer">
                  <option value="ALL">All Keywords</option>
                  <template x-for="kw in (dossier?.pillar_2_keywords_context?.ranking_keywords || [])" :key="kw.keyword">
                    <option :value="kw.keyword" x-text="kw.keyword + ' (' + (isKeywordDisplacedOrUnranked(kw) ? 'Vault' : '#' + (kw.live_serp_rank || kw.rank)) + ')'"></option>
                  </template>
                </select>
              </div>
            </div>
          </div>

          <!-- Chronological Daily Table -->
          <div class="rounded-xl border border-[#27272A] bg-[#121215] overflow-hidden shadow-xs">
            <table class="w-full text-left text-xs border-collapse">
              <thead>
                <tr class="border-b border-[#27272A] bg-[#18181B] text-slate-400 font-mono text-[10.5px] uppercase tracking-wider">
                  <th class="py-3 px-4 w-10"></th>
                  <th class="py-3 px-4">Snapshot Date</th>
                  <th class="py-3 px-4 text-right">Total Saves</th>
                  <th class="py-3 px-4 text-right">Save Velocity</th>
                  <th class="py-3 px-4 text-right">Repins</th>
                  <th class="py-3 px-4">SERP Footprint & Rankings</th>
                  <th class="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <template x-for="(day, dIdx) in filteredDays()" :key="getDayRowKey(day)">
                <tbody class="divide-y divide-[#27272A] border-b border-[#27272A]">
                  <tr class="hover:bg-[#18181B]/80 transition group">
                    <!-- Expand chevron -->
                    <td class="py-3 px-4 text-center cursor-pointer" @click="toggleDayExpanded(getDayRowKey(day))">
                      <svg class="w-4 h-4 text-slate-500 group-hover:text-slate-200 transition-transform duration-200 inline-block" :class="isDayExpanded(getDayRowKey(day)) ? 'rotate-90 text-rose-400' : ''" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                    </td>

                    <!-- Date & Crawl Time (YYYY-MM-DD HH:MM) -->
                    <td class="py-3 px-4 font-mono tabular-nums whitespace-nowrap cursor-pointer" @click="toggleDayExpanded(getDayRowKey(day))">
                      <div class="flex items-center gap-1.5">
                        <span class="font-bold text-white" x-text="day.snapshot_date"></span>
                        <template x-if="formatSnapshotTime(day)">
                          <span class="text-[10.5px] px-1.5 py-0.5 rounded bg-[#18181B] border border-[#27272A] text-sky-400 font-mono" x-text="formatSnapshotTime(day)"></span>
                        </template>
                      </div>
                      <template x-if="dIdx === 0">
                        <span class="text-[10px] text-emerald-400 font-sans">Latest crawl</span>
                      </template>
                      <template x-if="dIdx > 0 && day.is_intraday_checkpoint">
                        <span class="text-[10px] text-sky-400/80 font-sans">Intraday checkpoint</span>
                      </template>
                    </td>

                    <!-- Total Saves & Sparkbar -->
                    <td class="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                      <div class="font-bold text-white" x-text="formatNumber(day.save_count || 0)"></div>
                      <div class="text-[10.5px] font-semibold"
                           :class="formatDayDelta(day, dIdx) === 'Hydrated Baseline' ? 'text-amber-400 font-mono text-[10px]' : (formatDayDelta(day, dIdx).startsWith('-') ? 'text-rose-400' : 'text-emerald-400')"
                           x-text="formatDayDelta(day, dIdx)"></div>
                    </td>

                    <!-- Velocity -->
                    <td class="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                      <span class="font-bold text-emerald-400" x-text="(day.daily_save_velocity ? ('+' + day.daily_save_velocity) : '+0') + '/d'"></span>
                    </td>

                    <!-- Repins -->
                    <td class="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap text-slate-300">
                      <span x-text="formatNumber(day.repin_count || 0)"></span>
                    </td>

                    <!-- Keyword Badges [L-01 Resolved] -->
                    <td class="py-3 px-4">
                      <div class="flex items-center gap-1.5 flex-wrap">
                        <template x-for="kw in (day.ranking_keywords || []).slice(0, 4)" :key="kw.keyword">
                          <span 
                            class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10.5px] font-mono tabular-nums border"
                            :class="isKeywordDisplacedOrUnranked(kw) ? 'bg-amber-950/50 text-amber-300 border-amber-800' : 'bg-emerald-950/50 text-emerald-300 border-emerald-800'"
                          >
                            <span x-text="kw.keyword"></span>
                            <span class="font-bold" x-text="formatKeywordRankBadge(kw)"></span>
                          </span>
                        </template>
                        <template x-if="(day.ranking_keywords || []).length > 4">
                          <span class="text-[10.5px] text-slate-400 font-mono" x-text="'+' + ((day.ranking_keywords || []).length - 4) + ' more'"></span>
                        </template>
                      </div>
                    </td>

                    <!-- Delete Day Action -->
                    <td class="py-3 px-4 text-right whitespace-nowrap">
                      <button 
                        type="button" 
                        @click="requestDeleteDay(day.is_intraday_checkpoint ? (day.snapshot_id || day.row_key) : day.snapshot_date)" 
                        class="p-1.5 rounded-md hover:bg-red-950/50 text-slate-500 hover:text-red-400 transition cursor-pointer"
                        title="Delete this snapshot row and bridge delta"
                      >
                        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                      </button>
                    </td>
                  </tr>

                  <!-- Accordion Sub-Drawer: Keywords for this Day -->
                  <tr x-show="isDayExpanded(getDayRowKey(day))" class="bg-[#18181B]/40">
                    <td colspan="7" class="p-4 border-t border-[#27272A]">
                      <div class="space-y-3">
                        <div class="flex items-center justify-between text-xs">
                          <span class="font-bold text-slate-300">Detailed SERP Keywords for <span class="font-mono text-white" x-text="day.snapshot_date + (formatSnapshotTime(day) ? (' ' + formatSnapshotTime(day)) : '')"></span></span>
                          <span class="text-slate-400 font-mono text-[11px]" x-text="(day.ranking_keywords || []).length + ' keywords indexed'"></span>
                        </div>

                        <div class="rounded-lg border border-[#27272A] bg-[#121215] overflow-hidden">
                          <table class="w-full text-left text-xs">
                            <thead>
                              <tr class="border-b border-[#27272A] bg-[#18181B] text-slate-400 font-mono text-[10px] uppercase">
                                <th class="py-2 px-3">Keyword</th>
                                <th class="py-2 px-3">Rank Position</th>
                                <th class="py-2 px-3">SERP Tier</th>
                                <th class="py-2 px-3 text-center">24h Movement</th>
                                <th class="py-2 px-3 text-right">Remove</th>
                              </tr>
                            </thead>
                            <tbody class="divide-y divide-[#1E1E22]">
                              <template x-for="kw in filteredKeywordsForDay(day)" :key="kw.keyword">
                                <tr class="hover:bg-[#18181B]/60">
                                  <td class="py-2 px-3 font-medium text-white">
                                    <a :href="'/keywords?q=' + encodeURIComponent(kw.keyword)" class="hover:text-rose-400 transition" x-text="kw.keyword"></a>
                                  </td>
                                  <td class="py-2 px-3 font-mono tabular-nums">
                                    <span class="font-bold" :class="isKeywordDisplacedOrUnranked(kw) ? 'text-amber-400' : 'text-emerald-400'" x-text="formatKeywordRankBadge(kw, true)"></span>
                                  </td>
                                  <td class="py-2 px-3">
                                    <span class="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider" :class="getKeywordTierClass(kw)" x-text="getKeywordTierLabel(kw)"></span>
                                  </td>
                                  <td class="py-2 px-3 text-center font-mono tabular-nums text-[11px]">
                                    <!-- [L-03 Resolved: Clean Movement Display] -->
                                    <template x-if="keywordRankMovement(day.snapshot_date, kw).status === 'up'">
                                      <span class="inline-flex items-center gap-1 text-emerald-400 font-bold">
                                        <span>▲</span>
                                        <span x-text="'+' + keywordRankMovement(day.snapshot_date, kw).delta + ' spots'"></span>
                                      </span>
                                    </template>
                                    <template x-if="keywordRankMovement(day.snapshot_date, kw).status === 'down'">
                                      <span class="inline-flex items-center gap-1 text-rose-400 font-bold">
                                        <span>▼</span>
                                        <span x-text="'-' + keywordRankMovement(day.snapshot_date, kw).delta + ' spots'"></span>
                                      </span>
                                    </template>
                                    <template x-if="keywordRankMovement(day.snapshot_date, kw).status === 'steady'">
                                      <span class="inline-flex items-center gap-1 text-slate-400 font-mono">
                                        <span>—</span>
                                        <span>0 (Stable)</span>
                                      </span>
                                    </template>
                                    <template x-if="keywordRankMovement(day.snapshot_date, kw).status === 'new'">
                                      <span class="px-1.5 py-0.5 rounded bg-sky-950/60 text-sky-400 border border-sky-800 text-[10px] font-semibold">★ NEW</span>
                                    </template>
                                  </td>
                                  <td class="py-2 px-3 text-right">
                                    <div class="flex items-center justify-end gap-1">
                                      <template x-if="kw.snapshot_id">
                                        <button 
                                          type="button" 
                                          @click="requestDeleteSnapshot(kw.snapshot_id)" 
                                          class="text-slate-500 hover:text-red-400 transition cursor-pointer text-[10px] font-mono px-1 py-0.5 rounded border border-transparent hover:border-red-900/50"
                                          title="Delete single snapshot record"
                                        >
                                          <svg class="w-3 h-3 text-slate-500 hover:text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                                        </button>
                                      </template>
                                      <button 
                                        type="button" 
                                        @click="requestDeleteSerpBadge(kw, day.snapshot_date)" 
                                        class="text-slate-500 hover:text-red-400 transition cursor-pointer text-xs p-1"
                                        title="Remove this keyword rank for this date"
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              </template>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </template>
            </table>
          </div>
        </div>

        <!-- ======================================================== -->
        <!-- TAB 2: KEYWORD SERP RANKINGS PORTFOLIO                   -->
        <!-- ======================================================== -->
        <div x-show="activeTab === 'rankings'" class="space-y-4">
          
          <!-- Filter & Search Controls -->
          <div class="p-4 rounded-xl border border-[#27272A] bg-[#121215] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div class="flex items-center gap-2">
              <span class="text-slate-400 font-medium">Keywords Portfolio:</span>
              <span class="font-mono tabular-nums font-bold text-white" x-text="dossier?.pillar_2_keywords_context?.ranking_keywords?.length || 0"></span>
            </div>

            <div class="flex items-center gap-2">
              <input 
                type="text" 
                x-model="searchKeywordInput" 
                placeholder="Search keywords..." 
                class="px-3 py-1.5 rounded-lg border border-[#27272A] bg-[#18181B] text-xs text-white placeholder-slate-500 focus:outline-none w-48 sm:w-64"
              />
            </div>
          </div>

          <!-- Keywords Table -->
          <div class="rounded-xl border border-[#27272A] bg-[#121215] overflow-hidden shadow-xs">
            <table class="w-full text-left text-xs">
              <thead>
                <tr class="border-b border-[#27272A] bg-[#18181B] text-slate-400 font-mono text-[10.5px] uppercase tracking-wider">
                  <th class="py-3 px-4">Keyword</th>
                  <th class="py-3 px-4">Active Status</th>
                  <th class="py-3 px-4">Live / Displaced Rank</th>
                  <th class="py-3 px-4">SERP Tier</th>
                  <th class="py-3 px-4 text-right">Radar Direct</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-[#27272A]">
                <template x-for="kw in getFilteredKeywordsPortfolio()" :key="kw.keyword">
                  <tr class="hover:bg-[#18181B]/80 transition">
                    <td class="py-3 px-4 font-semibold text-white">
                      <a :href="'/keywords?q=' + encodeURIComponent(kw.keyword)" class="hover:text-rose-400 transition" x-text="kw.keyword"></a>
                    </td>
                    <td class="py-3 px-4">
                      <span 
                        class="px-2 py-0.5 rounded text-[10.5px] font-mono uppercase tracking-wider border"
                        :class="isKeywordDisplacedOrUnranked(kw) ? 'bg-amber-950/50 text-amber-300 border-amber-800' : 'bg-emerald-950/50 text-emerald-300 border-emerald-800'"
                        x-text="isKeywordDisplacedOrUnranked(kw) ? 'Displaced Vault' : 'Live Active SERP'"
                      ></span>
                    </td>
                    <td class="py-3 px-4 font-mono tabular-nums">
                      <span class="font-bold" :class="isKeywordDisplacedOrUnranked(kw) ? 'text-amber-400' : 'text-emerald-400'" x-text="formatKeywordRankBadge(kw, true)"></span>
                    </td>
                    <td class="py-3 px-4">
                      <span class="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider" :class="getKeywordTierClass(kw)" x-text="getKeywordTierLabel(kw)"></span>
                    </td>
                    <td class="py-3 px-4 text-right">
                      <a :href="'/keywords?q=' + encodeURIComponent(kw.keyword)" class="px-2.5 py-1 rounded border border-[#27272A] bg-[#18181B] hover:bg-[#27272A] text-slate-300 hover:text-white transition text-xs">
                        Open in Radar →
                      </a>
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
        </div>

        <!-- ======================================================== -->
        <!-- TAB 3: ALGORITHMIC & FORENSIC DNA SUITE [NL-05 Restored] -->
        <!-- ======================================================== -->
        <div x-show="activeTab === 'forensics'" class="space-y-4">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            <!-- Card 1: Creator & Origin Provenance -->
            <div class="p-4 rounded-xl border border-[#27272A] bg-[#121215] space-y-3">
              <div class="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-[#27272A] pb-2 flex items-center justify-between">
                <span>Creator & Origin Provenance</span>
                <span class="text-emerald-400 text-[11px]">Pillar 1</span>
              </div>
              <div class="space-y-2 text-xs">
                <div class="flex items-center justify-between">
                  <span class="text-slate-400">Authentic Original</span>
                  <span class="font-bold" :class="(!dossier?.algorithmic_intelligence?.is_repin && dossier?.algorithmic_intelligence?.is_canonical_root !== false) ? 'text-emerald-400' : 'text-slate-400'" x-text="(!dossier?.algorithmic_intelligence?.is_repin && dossier?.algorithmic_intelligence?.is_canonical_root !== false) ? 'Yes (Original Creator)' : (!dossier?.algorithmic_intelligence?.is_repin ? 'Canonical Variant' : 'No (Curated Repin)')"></span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-slate-400">Origin Pinner</span>
                  <span class="font-mono text-white font-medium" x-text="formatOriginPinner()"></span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-slate-400">Verified Merchant</span>
                  <span class="font-bold" :class="dossier?.algorithmic_intelligence?.creator_is_verified_merchant ? 'text-sky-400' : 'text-slate-500'" x-text="dossier?.algorithmic_intelligence?.creator_is_verified_merchant ? 'Verified Merchant ✓' : 'Standard Pinner'"></span>
                </div>
                <template x-if="dossier?.algorithmic_intelligence?.origin_pinner_followers || dossier?.pillar_1_creator_context?.competitor_profile?.followers">
                  <div class="flex items-center justify-between">
                    <span class="text-slate-400">Pinner Followers</span>
                    <span class="font-mono tabular-nums text-slate-200" x-text="formatNumber(dossier?.algorithmic_intelligence?.origin_pinner_followers || dossier?.pillar_1_creator_context?.competitor_profile?.followers)"></span>
                  </div>
                </template>
                <div class="flex items-center justify-between">
                  <span class="text-slate-400">Creation Method</span>
                  <span class="font-mono text-slate-300" x-text="formatCreationMethodLabel()"></span>
                </div>
              </div>
            </div>

            <!-- Card 2: Google & Search Indexing -->
            <div class="p-4 rounded-xl border border-[#27272A] bg-[#121215] space-y-3">
              <div class="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-[#27272A] pb-2 flex items-center justify-between">
                <span>Google & Search Indexing</span>
                <span class="text-sky-400 text-[11px]">SEO Health</span>
              </div>
              <div class="space-y-2 text-xs">
                <div class="flex items-center justify-between">
                  <span class="text-slate-400">Google Web Indexing</span>
                  <span class="font-bold" :class="!dossier?.algorithmic_intelligence?.seo_noindex_reason ? 'text-emerald-400' : 'text-rose-400'" x-text="!dossier?.algorithmic_intelligence?.seo_noindex_reason ? 'Fully Indexed' : ('Excluded: ' + dossier.algorithmic_intelligence.seo_noindex_reason)"></span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-slate-400">Canonical Status</span>
                  <span class="font-mono tabular-nums font-bold" :class="isCanonicalRoot() ? 'text-purple-400' : 'text-indigo-400'" x-text="isCanonicalRoot() ? 'Canonical Root' : ('Repin (#' + canonicalPinId() + ')')"></span>
                </div>
                <template x-if="!isCanonicalRoot() && canonicalPinId()">
                  <div class="flex items-center justify-between">
                    <span class="text-slate-400">Canonical Pin ID</span>
                    <span class="font-mono tabular-nums text-purple-400 font-bold" x-text="'#' + canonicalPinId()"></span>
                  </div>
                </template>
                <template x-if="dossier?.algorithmic_intelligence?.seo_canonical_url">
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-slate-400 shrink-0">Canonical URL</span>
                    <a :href="safeUrl(dossier.algorithmic_intelligence.seo_canonical_url)" target="_blank" rel="noopener noreferrer" class="font-mono text-sky-400 hover:underline truncate max-w-[200px]" x-text="dossier.algorithmic_intelligence.seo_canonical_url"></a>
                  </div>
                </template>
                <template x-if="dossier?.algorithmic_intelligence?.seo_title">
                  <div class="space-y-0.5 pt-1 border-t border-[#1E1E22]">
                    <span class="text-slate-400 text-[10px] uppercase font-mono">SEO Title</span>
                    <p class="text-slate-300 font-medium leading-relaxed truncate" x-text="dossier.algorithmic_intelligence.seo_title"></p>
                  </div>
                </template>
                <template x-if="dossier?.algorithmic_intelligence?.seo_description">
                  <div class="space-y-0.5 pt-1">
                    <span class="text-slate-400 text-[10px] uppercase font-mono">SEO Description</span>
                    <p class="text-slate-300 line-clamp-2 text-[11px] leading-relaxed" x-text="dossier.algorithmic_intelligence.seo_description"></p>
                  </div>
                </template>
              </div>
            </div>

            <!-- Card 3: SEO & Related Interests Taxonomy -->
            <div class="p-4 rounded-xl border border-[#27272A] bg-[#121215] space-y-3">
              <div class="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-[#27272A] pb-2 flex items-center justify-between">
                <span>SEO & Related Interests Taxonomy</span>
                <span class="text-indigo-400 text-[11px]">Category Graph</span>
              </div>
              <div class="space-y-2 text-xs">
                <!-- Category Breadcrumbs -->
                <div class="space-y-1">
                  <span class="text-slate-400">Category Breadcrumbs:</span>
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <template x-if="dossier?.algorithmic_intelligence?.category_breadcrumbs?.length">
                      <template x-for="(crumb, cIdx) in dossier.algorithmic_intelligence.category_breadcrumbs" :key="cIdx">
                        <span class="inline-flex items-center gap-1">
                          <span class="px-2 py-0.5 rounded bg-[#18181B] border border-[#27272A] text-slate-300 text-[11px]" x-text="crumb"></span>
                          <span x-show="cIdx < dossier.algorithmic_intelligence.category_breadcrumbs.length - 1" class="text-slate-600 text-[10px]">›</span>
                        </span>
                      </template>
                    </template>
                    <template x-if="!dossier?.algorithmic_intelligence?.category_breadcrumbs?.length">
                      <span class="text-slate-500 font-mono">--</span>
                    </template>
                  </div>
                </div>

                <!-- Related Interests Tags [NL-05 Resolved] -->
                <div class="space-y-1 pt-1 border-t border-[#1E1E22]">
                  <span class="text-slate-400">Related Search Interests:</span>
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <template x-if="dossier?.algorithmic_intelligence?.seo_related_interests?.length">
                      <template x-for="(interest, iIdx) in dossier.algorithmic_intelligence.seo_related_interests" :key="iIdx">
                        <a 
                          :href="'/keywords?q=' + encodeURIComponent(formatInterestName(interest))" 
                          class="px-2 py-0.5 rounded bg-rose-950/40 text-rose-300 border border-rose-800/60 hover:bg-rose-900/50 text-[11px] transition font-medium" 
                          x-text="formatInterestName(interest)"
                        ></a>
                      </template>
                    </template>
                    <template x-if="!dossier?.algorithmic_intelligence?.seo_related_interests?.length">
                      <span class="text-slate-500 font-mono">--</span>
                    </template>
                  </div>
                </div>

                <!-- Board Pin Count -->
                <div class="flex items-center justify-between pt-1 border-t border-[#1E1E22]">
                  <span class="text-slate-400">Board Total Pins</span>
                  <span class="font-mono tabular-nums text-slate-200" x-text="dossier?.algorithmic_intelligence?.board_pin_count || dossier?.algorithmic_intelligence?.board_metrics?.pin_count || '--'"></span>
                </div>
              </div>
            </div>

            <!-- Card 4: Visual AI Taxonomy & Entities -->
            <div class="p-4 rounded-xl border border-[#27272A] bg-[#121215] space-y-3">
              <div class="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-[#27272A] pb-2 flex items-center justify-between">
                <span>Visual AI Taxonomy & Entities</span>
                <span class="text-amber-400 text-[11px]">Computer Vision</span>
              </div>
              <div class="space-y-2 text-xs">
                <div class="flex items-center justify-between">
                  <span class="text-slate-400">Dominant Swatch</span>
                  <div class="flex items-center gap-1.5">
                    <span class="w-3.5 h-3.5 rounded-full border border-white/20 inline-block" :style="'background-color: ' + safeColor(dossier?.creative?.dominant_color)"></span>
                    <span class="font-mono text-white" x-text="safeColor(dossier?.creative?.dominant_color)"></span>
                  </div>
                </div>
                <template x-if="dossier?.algorithmic_intelligence?.image_signature">
                  <div class="flex items-center justify-between">
                    <span class="text-slate-400">Image Hash Signature</span>
                    <div class="flex items-center gap-1">
                      <span class="font-mono text-[10px] text-slate-300 max-w-[140px] truncate" x-text="dossier.algorithmic_intelligence.image_signature"></span>
                      <button type="button" @click="copyText(dossier.algorithmic_intelligence.image_signature, 'Image Signature')" class="p-1 rounded hover:bg-[#27272A] text-slate-400 hover:text-white cursor-pointer transition" title="Copy Image Signature"><svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg></button>
                    </div>
                  </div>
                </template>
                <div class="space-y-1 pt-1 border-t border-[#1E1E22]">
                  <span class="text-slate-400">Identified Objects:</span>
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <template x-if="dossier?.algorithmic_intelligence?.visual_objects?.length">
                      <template x-for="obj in dossier.algorithmic_intelligence.visual_objects" :key="typeof obj === 'string' ? obj : (obj.label || JSON.stringify(obj))">
                        <span class="px-2 py-0.5 rounded bg-[#18181B] border border-[#27272A] text-slate-300 text-[11px]" x-text="formatVisualObject(obj)"></span>
                      </template>
                    </template>
                    <template x-if="!dossier?.algorithmic_intelligence?.visual_objects?.length">
                      <span class="text-slate-500 font-mono">--</span>
                    </template>
                  </div>
                </div>
              </div>
            </div>

            <!-- Card 5: Commercial Monetization, Affiliate & Outbound Link -->
            <div class="p-4 rounded-xl border border-[#27272A] bg-[#121215] space-y-3">
              <div class="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-[#27272A] pb-2 flex items-center justify-between">
                <span>Commercial Monetization & Arbitrage Link</span>
                <span class="text-rose-400 text-[11px]">Revenue Engine</span>
              </div>
              <div class="space-y-2 text-xs">
                <div class="flex items-center justify-between">
                  <span class="text-slate-400">Linkless Pin</span>
                  <span class="font-bold" :class="dossier?.algorithmic_intelligence?.is_go_linkless ? 'text-amber-400' : 'text-emerald-400'" x-text="dossier?.algorithmic_intelligence?.is_go_linkless ? 'Yes (Organic Linkless)' : 'No (Commercial Outlink)'"></span>
                </div>
                <template x-if="dossier?.creative?.domain">
                  <div class="flex items-center justify-between">
                    <span class="text-slate-400">Target Domain</span>
                    <a :href="'/domains?q=' + encodeURIComponent(dossier.creative.domain)" class="font-mono text-sky-400 font-bold hover:underline" x-text="dossier.creative.domain"></a>
                  </div>
                </template>
                <template x-if="dossier?.creative?.destination_url">
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-slate-400 shrink-0">Destination URL</span>
                    <div class="flex items-center gap-1 truncate">
                      <a :href="safeUrl(dossier.creative.destination_url)" target="_blank" rel="noopener noreferrer" class="font-mono text-sky-400 hover:underline truncate max-w-[180px]" x-text="dossier.creative.destination_url"></a>
                      <button type="button" @click="copyUrl(dossier.creative.destination_url)" class="p-1 rounded hover:bg-[#27272A] text-slate-400 hover:text-white cursor-pointer transition" title="Copy Destination URL"><svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg></button>
                    </div>
                  </div>
                </template>
                <template x-if="dossier?.algorithmic_intelligence?.tracked_link || dossier?.creative?.tracked_link">
                  <div class="flex items-center justify-between gap-2 pt-1 border-t border-[#1E1E22]">
                    <span class="text-slate-400 shrink-0">Affiliate Tracking URL</span>
                    <div class="flex items-center gap-1 truncate">
                      <span class="font-mono text-[11px] text-amber-300 truncate max-w-[180px]" x-text="dossier.algorithmic_intelligence.tracked_link || dossier.creative.tracked_link"></span>
                      <button type="button" @click="copyText(dossier.algorithmic_intelligence.tracked_link || dossier.creative.tracked_link, 'Tracked Link')" class="p-1 rounded hover:bg-[#27272A] text-slate-400 hover:text-white cursor-pointer transition" title="Copy Tracked Link"><svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg></button>
                    </div>
                  </div>
                </template>
                <template x-if="dossier?.algorithmic_intelligence?.affiliate_networks?.length">
                  <div class="space-y-1 pt-1 border-t border-[#1E1E22]">
                    <span class="text-slate-400">Affiliate Networks:</span>
                    <div class="flex items-center gap-1.5 flex-wrap">
                      <template x-for="net in dossier.algorithmic_intelligence.affiliate_networks" :key="net">
                        <span class="px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800 text-[11px] font-semibold" x-text="net"></span>
                      </template>
                    </div>
                  </div>
                </template>
              </div>
            </div>

            <!-- Card 6: Audience Reactions & Engagement Breakdown -->
            <div class="p-4 rounded-xl border border-[#27272A] bg-[#121215] space-y-3">
              <div class="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-[#27272A] pb-2 flex items-center justify-between">
                <span>Audience Reactions & Engagement</span>
                <span class="text-pink-400 text-[11px]">Reactions Breakdown</span>
              </div>
              <div class="space-y-2 text-xs">
                <div class="flex items-center justify-between">
                  <span class="text-slate-400">Total Reactions</span>
                  <span class="font-mono tabular-nums font-bold text-white" x-text="formatNumber(dossier?.creative?.reaction_count || latestSnapshot()?.reaction_count || 0)"></span>
                </div>
                <!-- Reaction Types Breakdown Chips -->
                <div class="grid grid-cols-5 gap-1 pt-1 border-t border-[#1E1E22] text-center">
                  <div class="p-1.5 rounded bg-[#18181B] border border-[#27272A]">
                    <div class="text-sm">❤️</div>
                    <div class="text-[10px] font-mono tabular-nums text-slate-300 mt-0.5 font-bold" x-text="getReactionCount('love')"></div>
                    <div class="text-[8px] text-slate-500 uppercase">Love</div>
                  </div>
                  <div class="p-1.5 rounded bg-[#18181B] border border-[#27272A]">
                    <div class="text-sm">💡</div>
                    <div class="text-[10px] font-mono tabular-nums text-slate-300 mt-0.5 font-bold" x-text="getReactionCount('idea')"></div>
                    <div class="text-[8px] text-slate-500 uppercase">Idea</div>
                  </div>
                  <div class="p-1.5 rounded bg-[#18181B] border border-[#27272A]">
                    <div class="text-sm">😂</div>
                    <div class="text-[10px] font-mono tabular-nums text-slate-300 mt-0.5 font-bold" x-text="getReactionCount('haha')"></div>
                    <div class="text-[8px] text-slate-500 uppercase">Haha</div>
                  </div>
                  <div class="p-1.5 rounded bg-[#18181B] border border-[#27272A]">
                    <div class="text-sm">😮</div>
                    <div class="text-[10px] font-mono tabular-nums text-slate-300 mt-0.5 font-bold" x-text="getReactionCount('wow')"></div>
                    <div class="text-[8px] text-slate-500 uppercase">Wow</div>
                  </div>
                  <div class="p-1.5 rounded bg-[#18181B] border border-[#27272A]">
                    <div class="text-sm">👍</div>
                    <div class="text-[10px] font-mono tabular-nums text-slate-300 mt-0.5 font-bold" x-text="getReactionCount('good_try')"></div>
                    <div class="text-[8px] text-slate-500 uppercase">Tried</div>
                  </div>
                </div>
                <div class="flex items-center justify-between pt-1 border-t border-[#1E1E22]">
                  <span class="text-slate-400">Virality / Repin Ratio</span>
                  <span class="font-mono tabular-nums text-indigo-400 font-semibold" x-text="formatViralityRatio()"></span>
                </div>
              </div>
            </div>

          </div>

          <!-- Card 7: Collapsible Raw JSON Forensic Inspector -->
          <details class="p-4 rounded-xl border border-[#27272A] bg-[#121215] text-xs">
            <summary class="font-bold text-slate-400 hover:text-white cursor-pointer select-none flex items-center gap-2">
              <svg class="w-4 h-4 text-rose-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m10 2 4 4-4 4"/><circle cx="6" cy="18" r="4"/><circle cx="18" cy="18" r="4"/><path d="m14 14-8-8"/></svg>
              <span>Deep Forensic JSON Dossier (Raw Telemetry Blob)</span>
            </summary>
            <div class="mt-3 pt-3 border-t border-[#27272A] space-y-2">
              <div class="flex items-center justify-end">
                <button type="button" @click="copyText(JSON.stringify(dossier, null, 2), 'Raw JSON Dossier')" class="px-2.5 py-1 rounded border border-[#27272A] bg-[#18181B] hover:bg-[#27272A] text-slate-300 text-xs font-mono cursor-pointer">
                  Copy Raw JSON
                </button>
              </div>
              <pre class="p-4 rounded-lg bg-[#09090B] border border-[#27272A] text-slate-300 font-mono text-[11px] overflow-x-auto max-h-96" x-text="JSON.stringify(dossier, null, 2)"></pre>
            </div>
          </details>
        </div>
      </div>

    </div>

  </main>

  </div><!-- Close Main Shell Wrapper -->

  <!-- ======================================================== -->
  <!-- UNIFIED DELETE CONFIRMATION MODAL [L-06 Resolved]        -->
  <!-- ======================================================== -->
  <div x-show="deleteModalOpen" class="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4" x-cloak>
    <div @click.away="deleteModalOpen = false" class="bg-[#121215] border border-[#27272A] rounded-2xl max-w-sm w-full p-6 shadow-2xl flex flex-col gap-4">
      <div class="flex items-center gap-3 text-red-500">
        <div class="w-9 h-9 rounded-xl bg-red-950/60 border border-red-800/80 flex items-center justify-center shrink-0">
          <svg class="w-4 h-4 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
        </div>
        <h3 class="text-sm font-bold text-white">
          <span x-show="deleteType === 'DAY'">Confirm Delete Day</span>
          <span x-show="deleteType === 'SERP_BADGE'">Remove Keyword Rank</span>
          <span x-show="deleteType === 'SNAPSHOT'">Confirm Snapshot Deletion</span>
          <span x-show="deleteType === 'PIN'">Confirm Permanent Pin Purge</span>
        </h3>
      </div>
      <p class="text-xs text-slate-300 leading-relaxed">
        <template x-if="deleteType === 'DAY'">
          <span>Are you sure you want to permanently delete this snapshot for <strong class="text-white" x-text="itemToDelete?.date"></strong>? Subsequent snapshot deltas will be automatically recalculated.</span>
        </template>
        <template x-if="deleteType === 'SERP_BADGE'">
          <span>Remove keyword ranking for <strong class="text-white" x-text="itemToDelete?.keywordName"></strong> on <strong class="text-white" x-text="itemToDelete?.date"></strong>? Daily metrics will be preserved.</span>
        </template>
        <template x-if="deleteType === 'SNAPSHOT'">
          <span>Delete snapshot <strong class="text-rose-400" x-text="'#' + (itemToDelete?.snapshotId || snapshotToDelete)"></strong> from Native VPS PostgreSQL?</span>
        </template>
        <template x-if="deleteType === 'PIN'">
          <span>Permanently purge Pin <strong class="text-rose-400" x-text="'#' + pinId"></strong> from all Native VPS PostgreSQL tables? This action cannot be undone.</span>
        </template>
      </p>
      <div class="flex items-center justify-end gap-3 pt-2">
        <button @click="deleteModalOpen = false" class="px-3.5 py-1.5 rounded-lg border border-[#27272A] bg-[#18181B] hover:bg-[#27272A] text-slate-300 text-xs cursor-pointer">
          Cancel
        </button>
        <button @click="confirmDelete()" :disabled="isDeleting" class="px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition shadow-xs cursor-pointer">
          <span x-show="!isDeleting">Confirm Deletion</span>
          <span x-show="isDeleting">Deleting...</span>
        </button>
      </div>
    </div>
  </div>
  `;
}
