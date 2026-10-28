/**
 * Dedicated Pin Intelligence Page UI (Level 3) - V5 Cockpit Architecture
 * Pure ES Module generating the full HTML application for /pins/:pin_id and /pin/:pin_id.
 * Clean, modern Cockpit Dense (Level 8) SaaS interface adhering to DESIGN.md and ui-ux-pro-max.
 * Features:
 * - High-signal Executive Layout (Two-column desktop architecture)
 * - Single Unified 56px Sticky Command Bar with Context Breadcrumbs & Deterministic Shard Badge
 * - Clean Image Canvas with dynamic natural aspect ratio measurement (Anti-Distortion)
 * - Media Strip: Creation Method, Media Format, Exact Resolution & Perceptual Image Signature
 * - Structured Attribution & Provenance Ledger with Invariant 31 Time Formatting
 * - 5-Cell Telemetry Ribbon with Dual-Track Velocity Engine (24h Live Delta vs Lifetime Amortized)
 * - Interactive Dual-Axis SVG Performance Trajectory Chart with Tooltips & Timeframe Filtering
 * - 3-Tab Analytical Cockpit: Daily Ledger (Accordion + Sparkbars), Keyword Portfolio, Algorithmic DNA
 * - Non-Disruptive Cold-Shard Background Warming with Silent Retry
 * - Unified Delete Modal supporting SERP Positions, Daily Metrics, Snapshots, and Full Pin Purge
 */

import { getEdgeShieldClientScript } from './edge-shield-client.mjs';

export function getPinDetailPageHtml(pinId = '') {
  const safePinId = String(pinId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
  const escapedPinId = safePinId.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="referrer" content="same-origin">
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📌</text></svg>">
  <title>Universal Pin Dossier #${escapedPinId} | Pinterest Arbitrage Intelligence</title>
  <!-- Universal Pin Dossier ${escapedPinId} -->
  <!-- Universal Pin Dossier ${safePinId} -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          fontFamily: {
            sans: ['Geist', 'system-ui', '-apple-system', 'sans-serif'],
            mono: ['JetBrains Mono', 'monospace']
          },
          colors: {
            brand: {
              50: '#fff1f2',
              100: '#ffe4e6',
              500: '#f43f5e',
              600: '#e11d48',
              700: '#be123c',
              800: '#9f1239',
              900: '#881337'
            }
          }
        }
      }
    };
  </script>
  <script defer src="https://unpkg.com/alpinejs@3.14.8/dist/cdn.min.js"></script>
  <style>
    [x-cloak] { display: none !important; }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: rgba(148, 163, 184, 0.2); border-radius: 9999px; }
    ::-webkit-scrollbar-thumb:hover { background: rgba(148, 163, 184, 0.4); }
  </style>
  <script>
(function() {
  if (typeof window === 'undefined' || window.__paeAuthInterceptorInstalled) return;
  window.__paeAuthInterceptorInstalled = true;
  const origFetch = window.fetch.bind(window);
  window.fetch = async function(input, init) {
    const urlStr = typeof input === 'string' ? input : (input && input.url ? input.url : '');
    const isApiCall = urlStr.startsWith('/api/') || urlStr.includes('/api/');
    let savedKey = '';
    try { savedKey = localStorage.getItem('pae_admin_api_key') || ''; } catch (_) {}
    if (isApiCall && savedKey) {
      init = Object.assign({}, init);
      const headers = new Headers(init.headers || (typeof input === 'object' && input.headers ? input.headers : undefined));
      if (!headers.has('x-api-key') && !headers.has('Authorization')) {
        headers.set('x-api-key', savedKey);
      }
      init.headers = headers;
    }
    let res = await origFetch(input, init);
    if (isApiCall && res.status === 401 && typeof window.prompt === 'function') {
      const entered = window.prompt('🔐 Authentication required. Enter API_SECRET_KEY:');
      if (entered && entered.trim()) {
        try { localStorage.setItem('pae_admin_api_key', entered.trim()); } catch (_) {}
        init = Object.assign({}, init);
        const retryHeaders = new Headers(init.headers || {});
        retryHeaders.set('x-api-key', entered.trim());
        init.headers = retryHeaders;
        if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
          init.signal = AbortSignal.timeout(15000);
        }
        res = await origFetch(input, init);
      }
    }
    return res;
  };
})();
  </script>
</head>
<body class="bg-[#09090B] text-[#FAFAFA] min-h-screen antialiased flex flex-col font-sans" x-data="pinDetailApp('${safePinId}')">

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

  <!-- Unified Top Sticky Command Bar (56px) -->
  <header class="border-b border-[#27272A] bg-[#121215]/95 backdrop-blur-md sticky top-0 z-40 px-4 sm:px-6 py-2.5 flex items-center justify-between shadow-xs">
    <!-- Left: Navigation & Context Breadcrumb -->
    <div class="flex items-center gap-3 min-w-0">
      <a 
        :href="getBackUrl()" 
        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#27272A] bg-[#18181B] hover:bg-[#27272A] text-xs font-semibold text-slate-300 hover:text-white transition shadow-2xs shrink-0"
        :title="isCreatorContext() ? ('Back to @' + originCreator) : (originKeyword ? ('Back to ' + originKeyword) : 'Back to Radar')"
      >
        <span class="text-slate-400">←</span>
        <span class="truncate max-w-[120px] sm:max-w-[160px]" x-text="isCreatorContext() ? ('@' + originCreator) : (originKeyword ? originKeyword : 'Radar')"></span>
      </a>

      <!-- Breadcrumbs Trail -->
      <nav aria-label="Breadcrumb" class="hidden md:flex items-center gap-1.5 text-xs text-slate-400 min-w-0">
        <template x-if="isCreatorContext()">
          <div class="flex items-center gap-1.5 truncate">
            <span class="text-slate-600">/</span>
            <a href="/accounts" class="text-slate-400 hover:text-white">Creator Archive</a>
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
        <template x-if="!isCreatorContext()">
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

    <!-- Center: Shard Badge & Status Dot -->
    <div class="hidden lg:flex items-center gap-2">
      <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-[#27272A] bg-[#18181B] text-[11px] font-mono tabular-nums text-slate-300">
        <span class="w-2 h-2 rounded-full" :class="isShardWarming ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'"></span>
        <span>Storage Shard</span>
        <span class="text-emerald-400 font-bold" x-text="dossier?.shard_id ? ('#' + dossier.shard_id) : 'resolving...'"></span>
        <span class="text-slate-600">/ 99</span>
      </div>
      <template x-if="dossier?.from_shard_snapshots">
        <span class="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800/80">Shard Snapshot SSOT</span>
      </template>
    </div>

    <!-- Right: Command Actions -->
    <div class="flex items-center gap-2 shrink-0">
      <!-- Silent Background Warming Indicator -->
      <template x-if="isSilentRefreshing">
        <div class="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] text-amber-300 bg-amber-950/50 border border-amber-800">
          <span class="animate-spin text-xs">⏳</span>
          <span class="hidden sm:inline">Warming shard...</span>
        </div>
      </template>

      <!-- Live Deep Sync CTA -->
      <button 
        type="button"
        @click="triggerLiveDeepSync()" 
        :disabled="isSyncing"
        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition shadow-xs disabled:opacity-50 cursor-pointer"
        title="Live deep scrape on Pinterest (strictly unauthenticated guest session) and sync across all 4 pillars"
      >
        <span :class="isSyncing ? 'animate-spin' : ''">⚡</span>
        <span x-text="isSyncing ? 'Syncing...' : 'Live Deep Sync'"></span>
      </button>

      <!-- Purge Pin Action -->
      <button 
        type="button"
        @click="requestPurgePin()"
        class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-red-900/60 bg-red-950/30 hover:bg-red-900/50 text-red-400 text-xs font-semibold transition cursor-pointer"
        title="Permanently delete this pin from target Shard, Central Hub, and Edge Caches"
      >
        <span>🗑️</span>
        <span class="hidden sm:inline">Purge Pin</span>
      </button>

      <!-- Open External Pinterest -->
      <a 
        :href="'https://www.pinterest.com/pin/' + pinId + '/'" 
        target="_blank" 
        rel="noopener noreferrer" 
        class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#27272A] bg-[#18181B] hover:bg-[#27272A] text-slate-300 text-xs font-medium transition"
        title="Open pin page on Pinterest in new tab"
      >
        <span>Open on Pinterest</span>
        <span class="text-slate-500">↗</span>
      </a>

      <!-- Theme Switcher (Dark/Light Mode) -->
      <button 
        type="button" 
        @click="toggleTheme()" 
        class="p-1.5 rounded-lg border border-[#27272A] bg-[#18181B] hover:bg-[#27272A] text-slate-300 hover:text-white transition cursor-pointer"
        :title="isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme'"
      >
        <span x-text="isDark ? '🌙' : '☀️'"></span>
      </button>

      <!-- Refresh Button -->
      <button 
        type="button"
        @click="loadDossier(true)" 
        :disabled="loading"
        class="p-1.5 rounded-lg border border-[#27272A] bg-[#18181B] hover:bg-[#27272A] text-slate-300 hover:text-white transition cursor-pointer"
        title="Reload dossier from Edge & Shard"
      >
        <span class="inline-block" :class="loading ? 'animate-spin' : ''">🔄</span>
      </button>
    </div>
  </header>

  <!-- Full-Page Loading Spinner (Initial load only) -->
  <div x-show="loading && !dossier" class="flex-1 flex items-center justify-center p-12" x-cloak>
    <div class="flex flex-col items-center gap-3 max-w-sm text-center">
      <div class="w-10 h-10 border-2 border-rose-600 border-t-transparent rounded-full animate-spin"></div>
      <div class="text-sm font-semibold text-white">Resolving Universal Pin Dossier...</div>
      <div class="text-xs text-slate-400 font-mono tabular-nums">Routing deterministic CRC32 hash to Shard Fleet.</div>
    </div>
  </div>

  <!-- Error / Cold Shard State -->
  <div x-show="!loading && (!dossier || !dossier.success)" class="flex-1 flex items-center justify-center p-8" x-cloak>
    <div class="bg-[#121215] border border-[#27272A] rounded-2xl max-w-md w-full p-8 text-center flex flex-col items-center gap-4 shadow-xl">
      <div 
        class="w-14 h-14 rounded-full flex items-center justify-center text-2xl border"
        :class="isShardWarming ? 'bg-amber-950/40 border-amber-800 text-amber-400' : 'bg-red-950/40 border-red-800 text-red-400'"
      >
        <span x-text="isShardWarming ? '⏳' : '⚠️'"></span>
      </div>
      <div>
        <h2 class="text-base font-bold text-white" x-text="isShardWarming ? 'Storage Shard Warming Up' : 'Pin Telemetry Not Found'"></h2>
        <p class="text-xs text-slate-400 mt-1 leading-relaxed" x-text="isShardWarming ? 'The Neon Serverless Shard containing this pin is waking up from scale-to-zero cold sleep. Please retry in a few seconds.' : 'Pin #' + pinId + ' is either offline, not yet crawled, or does not exist.'"></p>
      </div>
      <div class="flex items-center gap-3 pt-2">
        <button @click="loadDossier(true)" class="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition flex items-center gap-1.5 shadow-xs cursor-pointer">
          <span>🔄</span>
          <span x-text="isShardWarming ? 'Retry Shard Fetch' : 'Try Force Refresh'"></span>
        </button>
        <a href="/keywords" class="px-4 py-2 rounded-lg border border-[#27272A] bg-[#18181B] hover:bg-[#27272A] text-slate-300 text-xs font-medium transition">
          Return to Radar
        </a>
      </div>
    </div>
  </div>

  <!-- MAIN DOSSIER: Two-Column Forensic Workspace -->
  <main x-show="dossier && dossier.success" class="flex-1 max-w-[1720px] w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col lg:flex-row gap-6" x-cloak>
    
    <!-- ======================================================== -->
    <!-- LEFT RAIL: Visual Asset Preview & Provenance Ledger (~340px) -->
    <!-- ======================================================== -->
    <div class="w-full lg:w-[340px] shrink-0 space-y-4">
      
      <!-- Creative Image Canvas with Natural Aspect Ratio Shield -->
      <div class="rounded-xl border border-[#27272A] bg-[#121215] overflow-hidden shadow-sm flex flex-col">
        <div class="relative w-full aspect-[2/3] overflow-hidden flex items-center justify-center" :style="'background-color: ' + safeColor(dossier?.creative?.dominant_color)">
          <img 
            :src="dossier?.creative?.image_url" 
            :alt="dossier?.creative?.alt_text || dossier?.creative?.title"
            @load="onImageLoad($event)"
            loading="lazy" 
            class="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
          />
        </div>

        <!-- Clean Media Strip directly beneath the image -->
        <div class="p-3 border-t border-[#27272A] bg-[#18181B] space-y-2">
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
                <span class="text-[10px]">📋</span>
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
            <template x-if="dossier?.pillar_1_creator_context?.creator_username">
              <a :href="'/' + encodeURIComponent(dossier.pillar_1_creator_context.creator_username)" class="font-bold text-rose-400 hover:underline flex items-center justify-end gap-1">
                <span>@</span><span x-text="dossier.pillar_1_creator_context.creator_username"></span>
                <template x-if="dossier?.algorithmic_intelligence?.creator_is_verified_merchant">
                  <span class="text-sky-400 text-[10px]" title="Verified Merchant">✓</span>
                </template>
              </a>
            </template>
            <template x-if="!dossier?.pillar_1_creator_context?.creator_username">
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
                <span class="text-[9px]">📋</span>
              </button>
            </template>
          </div>
        </div>

        <!-- Published Age (Strict Invariant 31 Formatting) -->
        <div class="flex items-center justify-between gap-2 border-t border-[#1E1E22] pt-2">
          <span class="text-slate-400 shrink-0">Published Age</span>
          <span class="font-mono tabular-nums font-bold text-slate-200" x-text="formatStrictUniversalAge()"></span>
        </div>

        <!-- Shard Allocation -->
        <div class="flex items-center justify-between gap-2 border-t border-[#1E1E22] pt-2">
          <span class="text-slate-400 shrink-0">CRC32 Routing</span>
          <span class="font-mono tabular-nums text-emerald-400 font-semibold" x-text="'Shard #' + dossier?.shard_id"></span>
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
          <!-- Status 1: Original Creator Upload vs Repin -->
          <template x-if="!dossier?.algorithmic_intelligence?.is_repin">
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-950/60 text-emerald-300 border border-emerald-800/80 font-semibold">
              <span>🛡️</span>
              <span>100% Original Creator Upload</span>
            </span>
          </template>
          <template x-if="dossier?.algorithmic_intelligence?.is_repin">
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800 text-slate-300 border border-[#27272A] font-medium">
              <span>🔄</span>
              <span>Curated Repin</span>
            </span>
          </template>

          <!-- Status 2: Direct Destination Link vs Linkless -->
          <template x-if="dossier?.creative?.destination_url && !dossier?.algorithmic_intelligence?.is_go_linkless">
            <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-sky-950/60 text-sky-300 border border-sky-800/80 font-medium">
              <span>🔗</span>
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
              <span>🌐</span>
              <span>Indexed in Google</span>
            </span>
          </template>
          <template x-if="dossier?.algorithmic_intelligence?.seo_noindex_reason">
            <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-red-950/60 text-red-300 border border-red-800/80 font-medium">
              <span>🚫</span>
              <span x-text="'Noindex: ' + dossier.algorithmic_intelligence.seo_noindex_reason"></span>
            </span>
          </template>

          <!-- Status 4: Canonical Root Source -->
          <template x-if="dossier?.algorithmic_intelligence?.canonical_pin_id">
            <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-purple-950/60 text-purple-300 border border-purple-800/80 font-mono tabular-nums">
              <span>👑</span>
              <span x-text="'Canonical #' + dossier.algorithmic_intelligence.canonical_pin_id"></span>
            </span>
          </template>
        </div>

        <!-- Creative Title & Description -->
        <div class="space-y-2">
          <h1 class="text-xl sm:text-2xl font-black text-[#FAFAFA] leading-tight" x-text="dossier?.creative?.title || ('Pin #' + pinId)"></h1>
          <template x-if="dossier?.creative?.description">
            <p class="text-xs sm:text-sm text-slate-300 leading-relaxed font-sans" x-text="dossier.creative.description"></p>
          </template>
        </div>

        <!-- SEO Alt-Text Row -->
        <template x-if="dossier?.creative?.alt_text">
          <div class="p-3 rounded-lg border border-[#27272A] bg-[#18181B] flex items-start justify-between gap-3 text-xs">
            <div class="space-y-0.5 min-w-0">
              <span class="text-[10px] font-bold uppercase tracking-wider text-slate-500">Image Alt-Text (Accessibility & Image SEO)</span>
              <p class="text-slate-300 italic font-serif leading-relaxed" x-text="'“' + dossier.creative.alt_text + '”'"></p>
            </div>
            <button 
              type="button" 
              @click="copyAltText()" 
              class="px-2 py-1 rounded border border-[#27272A] hover:bg-[#27272A] text-slate-300 text-[11px] font-medium shrink-0 cursor-pointer"
            >
              Copy
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
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <!-- Cell 1: Total Saves -->
        <div class="p-4 rounded-xl border border-[#27272A] bg-[#121215] flex flex-col justify-between shadow-xs">
          <div class="flex items-center justify-between text-slate-400">
            <span class="text-[10.5px] font-bold uppercase tracking-wider">Total Saves</span>
            <span class="text-rose-500">📌</span>
          </div>
          <div class="mt-2">
            <div class="text-2xl font-black font-mono tabular-nums text-white" x-text="formatNumber(dossier?.creative?.save_count || 0)"></div>
            <div class="text-[11px] text-emerald-400 font-mono tabular-nums font-semibold mt-0.5">
              <span x-text="format24hSaveDelta()"></span>
            </div>
          </div>
        </div>

        <!-- Cell 2: Save Velocity Engine (24h Live Delta vs Lifetime Amortized) [L-02 Resolved] -->
        <div class="p-4 rounded-xl border border-[#27272A] bg-[#121215] flex flex-col justify-between shadow-xs">
          <div class="flex items-center justify-between text-slate-400">
            <span class="text-[10.5px] font-bold uppercase tracking-wider">Daily Velocity</span>
            <span class="text-emerald-400">⚡</span>
          </div>
          <div class="mt-2">
            <div class="flex items-baseline gap-1">
              <span class="text-2xl font-black font-mono tabular-nums text-emerald-400" x-text="formatLive24hVelocity()"></span>
              <span class="text-[10px] text-slate-400 uppercase">live 24h</span>
            </div>
            <div class="text-[10.5px] text-slate-400 font-mono tabular-nums mt-0.5 truncate" x-text="formatLifetimeVelocityCaption()"></div>
          </div>
        </div>

        <!-- Cell 3: Total Repins & Engagement -->
        <div class="p-4 rounded-xl border border-[#27272A] bg-[#121215] flex flex-col justify-between shadow-xs">
          <div class="flex items-center justify-between text-slate-400">
            <span class="text-[10.5px] font-bold uppercase tracking-wider">Total Repins</span>
            <span class="text-indigo-400">🔁</span>
          </div>
          <div class="mt-2">
            <div class="text-2xl font-black font-mono tabular-nums text-white" x-text="formatNumber(dossier?.creative?.repin_count || 0)"></div>
            <div class="text-[10.5px] text-slate-400 font-mono tabular-nums mt-0.5" x-text="formatViralityRatio()"></div>
          </div>
        </div>

        <!-- Cell 4: SERP Footprint & Best Rank -->
        <div class="p-4 rounded-xl border border-[#27272A] bg-[#121215] flex flex-col justify-between shadow-xs">
          <div class="flex items-center justify-between text-slate-400">
            <span class="text-[10.5px] font-bold uppercase tracking-wider">Best SERP Rank</span>
            <span class="text-amber-400">🏆</span>
          </div>
          <div class="mt-2">
            <div class="text-2xl font-black font-mono tabular-nums text-white" x-text="getBestRankDisplay()"></div>
            <div class="text-[10.5px] text-slate-400 font-mono tabular-nums mt-0.5 truncate" x-text="getSerpFootprintSummary()"></div>
          </div>
        </div>

        <!-- Cell 5: Total Engagement Score -->
        <div class="col-span-2 sm:col-span-1 p-4 rounded-xl border border-[#27272A] bg-[#121215] flex flex-col justify-between shadow-xs">
          <div class="flex items-center justify-between text-slate-400">
            <span class="text-[10.5px] font-bold uppercase tracking-wider">Total Engagement</span>
            <span class="text-sky-400">💬</span>
          </div>
          <div class="mt-2">
            <div class="text-2xl font-black font-mono tabular-nums text-white" x-text="formatNumber(totalEngagementScore())"></div>
            <div class="text-[10.5px] text-slate-400 font-mono tabular-nums mt-0.5">
              <span x-text="dossier?.creative?.comment_count || 0"></span> comments, 
              <span x-text="totalShares()"></span> shares
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
            <div class="text-[11px] text-slate-500 font-mono tabular-nums">Multi-day historical telemetry plotted from Shard database</div>
          </div>

          <!-- Timeframe & Metric Selector [NL-03 Resolved] -->
          <div class="flex items-center gap-2 flex-wrap">
            <div class="flex items-center p-0.5 rounded-lg border border-[#27272A] bg-[#18181B] text-[11px] font-mono">
              <button type="button" @click="chartMetric = 'saves'" class="px-2.5 py-1 rounded transition cursor-pointer" :class="chartMetric === 'saves' ? 'bg-[#27272A] text-white font-bold' : 'text-slate-400 hover:text-white'">Saves</button>
              <button type="button" @click="chartMetric = 'velocity'" class="px-2.5 py-1 rounded transition cursor-pointer" :class="chartMetric === 'velocity' ? 'bg-[#27272A] text-white font-bold' : 'text-slate-400 hover:text-white'">Velocity</button>
            </div>
            <div class="flex items-center p-0.5 rounded-lg border border-[#27272A] bg-[#18181B] text-[11px] font-mono">
              <button type="button" @click="chartTimeframe = '7d'" class="px-2.5 py-1 rounded transition cursor-pointer" :class="chartTimeframe === '7d' ? 'bg-[#27272A] text-white font-bold' : 'text-slate-400 hover:text-white'">7D</button>
              <button type="button" @click="chartTimeframe = '14d'" class="px-2.5 py-1 rounded transition cursor-pointer" :class="chartTimeframe === '14d' ? 'bg-[#27272A] text-white font-bold' : 'text-slate-400 hover:text-white'">14D</button>
              <button type="button" @click="chartTimeframe = '30d'" class="px-2.5 py-1 rounded transition cursor-pointer" :class="chartTimeframe === '30d' ? 'bg-[#27272A] text-white font-bold' : 'text-slate-400 hover:text-white'">30D</button>
              <button type="button" @click="chartTimeframe = 'all'" class="px-2.5 py-1 rounded transition cursor-pointer" :class="chartTimeframe === 'all' ? 'bg-[#27272A] text-white font-bold' : 'text-slate-400 hover:text-white'">ALL</button>
            </div>
          </div>
        </div>

        <!-- Rendered Interactive SVG Canvas -->
        <div class="relative w-full h-44 bg-[#18181B]/60 rounded-lg border border-[#27272A] p-2 flex items-center justify-center overflow-hidden">
          <template x-if="computeChartPoints().length >= 2">
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

              <!-- Interactive Points -->
              <template x-for="(pt, idx) in computeChartPoints()" :key="idx">
                <g class="cursor-pointer" @mouseenter="hoveredChartPoint = pt" @mouseleave="hoveredChartPoint = null">
                  <circle :cx="pt.x" :cy="pt.y" r="4" :fill="chartMetric === 'velocity' ? '#10B981' : '#E11D48'" stroke="#FFFFFF" stroke-width="1.5" class="transition-transform hover:scale-150" />
                </g>
              </template>
            </svg>
          </template>

          <template x-if="computeChartPoints().length < 2">
            <div class="text-xs text-slate-500 font-mono text-center space-y-1">
              <div>📊 Single Snapshot Registered</div>
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
              <span>📅</span>
              <span>Historical Snapshot Audit Log</span>
              <span class="px-1.5 py-0.2 rounded font-mono tabular-nums text-[10px]" :class="activeTab === 'ledger' ? 'bg-rose-500/20 text-rose-300' : 'bg-[#18181B] text-slate-400'" x-text="filteredDays().length"></span>
            </button>

            <!-- Tab 2: Keyword SERP Rankings -->
            <button 
              type="button" 
              @click="activeTab = 'rankings'" 
              class="px-4 py-2.5 text-xs font-bold border-b-2 transition flex items-center gap-2 cursor-pointer shrink-0"
              :class="activeTab === 'rankings' ? 'border-rose-500 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'"
            >
              <span>🔑</span>
              <span>Keyword SERP Rankings</span>
              <span class="px-1.5 py-0.2 rounded font-mono tabular-nums text-[10px]" :class="activeTab === 'rankings' ? 'bg-rose-500/20 text-rose-300' : 'bg-[#18181B] text-slate-400'" x-text="dossier?.pillar_2_keywords_context?.ranking_keywords?.length || 0"></span>
            </button>

            <!-- Tab 3: Algorithmic DNA & Cross-Pillar Suite -->
            <button 
              type="button" 
              @click="activeTab = 'forensics'" 
              class="px-4 py-2.5 text-xs font-bold border-b-2 transition flex items-center gap-2 cursor-pointer shrink-0"
              :class="activeTab === 'forensics' ? 'border-rose-500 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'"
            >
              <span>🧬</span>
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
            <div class="flex items-center gap-2">
              <span class="text-slate-400 font-medium">Daily Snapshots:</span>
              <span class="font-mono tabular-nums font-bold text-white" x-text="filteredDays().length"></span>
              <button type="button" @click="expandAllDays()" class="text-slate-400 hover:text-white underline text-[11px] ml-2 cursor-pointer">Expand All</button>
              <span class="text-slate-600">|</span>
              <button type="button" @click="collapseAllDays()" class="text-slate-400 hover:text-white underline text-[11px] cursor-pointer">Collapse All</button>
            </div>

            <!-- Keyword Filter Dropdown -->
            <div class="flex items-center gap-2">
              <span class="text-slate-400 text-[11px]">Filter Keyword:</span>
              <select x-model="selectedKeywordFilter" class="px-2.5 py-1 rounded-lg border border-[#27272A] bg-[#18181B] text-xs font-medium text-slate-200 focus:outline-none cursor-pointer">
                <option value="ALL">All Keywords</option>
                <template x-for="kw in (dossier?.pillar_2_keywords_context?.ranking_keywords || [])" :key="kw.keyword">
                  <option :value="kw.keyword" x-text="kw.keyword + ' (#' + (kw.live_serp_rank || kw.rank || 'Vault') + ')'"></option>
                </template>
              </select>
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
              <template x-for="(day, dIdx) in filteredDays()" :key="day.snapshot_date">
                <tbody class="divide-y divide-[#27272A] border-b border-[#27272A]">
                  <tr class="hover:bg-[#18181B]/80 transition group">
                    <!-- Expand chevron -->
                    <td class="py-3 px-4 text-center cursor-pointer" @click="toggleDayExpanded(day.snapshot_date)">
                      <span class="text-slate-500 group-hover:text-white transition-transform inline-block" :class="isDayExpanded(day.snapshot_date) ? 'rotate-90' : ''">▶</span>
                    </td>

                    <!-- Date -->
                    <td class="py-3 px-4 font-mono tabular-nums whitespace-nowrap cursor-pointer" @click="toggleDayExpanded(day.snapshot_date)">
                      <div class="font-bold text-white" x-text="day.snapshot_date"></div>
                      <template x-if="dIdx === 0">
                        <span class="text-[10px] text-emerald-400 font-sans">Latest crawl</span>
                      </template>
                    </td>

                    <!-- Total Saves & Sparkbar -->
                    <td class="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                      <div class="font-bold text-white" x-text="formatNumber(day.save_count || 0)"></div>
                      <div class="text-[10.5px] text-emerald-400 font-semibold" x-text="formatDayDelta(day, dIdx)"></div>
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
                            :class="kw.is_displaced ? 'bg-amber-950/50 text-amber-300 border-amber-800' : 'bg-emerald-950/50 text-emerald-300 border-emerald-800'"
                          >
                            <span x-text="kw.keyword"></span>
                            <span class="font-bold" x-text="kw.is_displaced ? ('[Vault #' + (kw.vault_rank || kw.rank || '?') + ']') : ('[SERP #' + (kw.live_serp_rank || kw.rank) + ']')"></span>
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
                        @click="requestDeleteDay(day.snapshot_date)" 
                        class="p-1.5 rounded hover:bg-red-950/50 text-slate-500 hover:text-red-400 transition cursor-pointer"
                        title="Delete telemetry for this date"
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>

                  <!-- Accordion Sub-Drawer: Keywords for this Day -->
                  <tr x-show="isDayExpanded(day.snapshot_date)" class="bg-[#18181B]/40">
                    <td colspan="7" class="p-4 border-t border-[#27272A]">
                      <div class="space-y-3">
                        <div class="flex items-center justify-between text-xs">
                          <span class="font-bold text-slate-300">Detailed SERP Keywords for <span class="font-mono text-white" x-text="day.snapshot_date"></span></span>
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
                                    <span class="font-bold" :class="kw.is_displaced ? 'text-amber-400' : 'text-emerald-400'" x-text="kw.is_displaced ? ('[Vault #' + (kw.vault_rank || kw.rank || '?') + ']') : ('#' + (kw.live_serp_rank || kw.rank))"></span>
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
                                          🗑️
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
                        :class="kw.is_displaced ? 'bg-amber-950/50 text-amber-300 border-amber-800' : 'bg-emerald-950/50 text-emerald-300 border-emerald-800'"
                        x-text="kw.is_displaced ? 'Displaced Vault' : 'Live Active SERP'"
                      ></span>
                    </td>
                    <td class="py-3 px-4 font-mono tabular-nums">
                      <span class="font-bold" :class="kw.is_displaced ? 'text-amber-400' : 'text-emerald-400'" x-text="kw.is_displaced ? ('[Vault #' + (kw.vault_rank || kw.rank || '?') + ']') : ('#' + (kw.live_serp_rank || kw.rank))"></span>
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
                  <span class="font-bold" :class="!dossier?.algorithmic_intelligence?.is_repin ? 'text-emerald-400' : 'text-slate-400'" x-text="!dossier?.algorithmic_intelligence?.is_repin ? 'Yes (Original Creator)' : 'No (Curated Repin)'"></span>
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
                <template x-if="dossier?.algorithmic_intelligence?.canonical_pin_id">
                  <div class="flex items-center justify-between">
                    <span class="text-slate-400">Canonical Pin ID</span>
                    <span class="font-mono tabular-nums text-purple-400 font-bold" x-text="'#' + dossier.algorithmic_intelligence.canonical_pin_id"></span>
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
                      <button type="button" @click="copyText(dossier.algorithmic_intelligence.image_signature, 'Image Signature')" class="text-slate-400 hover:text-white text-[10px] cursor-pointer">📋</button>
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
                      <button type="button" @click="copyUrl(dossier.creative.destination_url)" class="text-slate-400 hover:text-white text-[10px] cursor-pointer">📋</button>
                    </div>
                  </div>
                </template>
                <template x-if="dossier?.algorithmic_intelligence?.tracked_link || dossier?.creative?.tracked_link">
                  <div class="flex items-center justify-between gap-2 pt-1 border-t border-[#1E1E22]">
                    <span class="text-slate-400 shrink-0">Affiliate Tracking URL</span>
                    <div class="flex items-center gap-1 truncate">
                      <span class="font-mono text-[11px] text-amber-300 truncate max-w-[180px]" x-text="dossier.algorithmic_intelligence.tracked_link || dossier.creative.tracked_link"></span>
                      <button type="button" @click="copyText(dossier.algorithmic_intelligence.tracked_link || dossier.creative.tracked_link, 'Tracked Link')" class="text-slate-400 hover:text-white text-[10px] cursor-pointer">📋</button>
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
            <summary class="font-bold text-slate-400 hover:text-white cursor-pointer select-none">
              🔬 Deep Forensic JSON Dossier (Raw Telemetry Blob)
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

  <!-- ======================================================== -->
  <!-- UNIFIED DELETE CONFIRMATION MODAL [L-06 Resolved]        -->
  <!-- ======================================================== -->
  <div x-show="deleteModalOpen" class="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4" x-cloak>
    <div @click.away="deleteModalOpen = false" class="bg-[#121215] border border-[#27272A] rounded-2xl max-w-sm w-full p-6 shadow-2xl flex flex-col gap-4">
      <div class="flex items-center gap-3 text-red-500">
        <span class="text-xl">🗑️</span>
        <h3 class="text-sm font-bold text-white">
          <span x-show="deleteType === 'DAY'">Confirm Delete Day</span>
          <span x-show="deleteType === 'SERP_BADGE'">Remove Keyword Rank</span>
          <span x-show="deleteType === 'SNAPSHOT'">Confirm Snapshot Deletion</span>
          <span x-show="deleteType === 'PIN'">Confirm Permanent Pin Purge</span>
        </h3>
      </div>
      <p class="text-xs text-slate-300 leading-relaxed">
        <template x-if="deleteType === 'DAY'">
          <span>Are you sure you want to permanently delete all metrics and SERP rankings for <strong class="text-white" x-text="itemToDelete?.date"></strong>? This will remove the record from Shard <span class="font-mono tabular-nums text-emerald-400 font-semibold" x-text="'#' + dossier?.shard_id"></span>.</span>
        </template>
        <template x-if="deleteType === 'SERP_BADGE'">
          <span>Remove keyword ranking for <strong class="text-white" x-text="itemToDelete?.keywordName"></strong> on <strong class="text-white" x-text="itemToDelete?.date"></strong>? Daily metrics will be preserved.</span>
        </template>
        <template x-if="deleteType === 'SNAPSHOT'">
          <span>Delete snapshot <strong class="text-rose-400" x-text="'#' + (itemToDelete?.snapshotId || snapshotToDelete)"></strong> from Shard <span class="font-mono tabular-nums text-emerald-400 font-semibold" x-text="'#' + dossier?.shard_id"></span>?</span>
        </template>
        <template x-if="deleteType === 'PIN'">
          <span>Permanently purge Pin <strong class="text-rose-400" x-text="'#' + pinId"></strong> from all Shard tables, Central Hub rankings, and Edge Caches? This action cannot be undone.</span>
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

  <script>
    function pinDetailApp(pinId) {
      return {
        pinId,
        loading: true,
        isShardWarming: false,
        isSilentRefreshing: false,
        dossier: null,
        activeTab: 'ledger',
        chartTimeframe: 'all',
        chartMetric: 'saves',
        isDark: true,
        hoveredChartPoint: null,
        realWidth: 0,
        realHeight: 0,
        deleteModalOpen: false,
        deleteType: 'DAY',
        itemToDelete: null,
        snapshotToDelete: null,
        isDeleting: false,
        isSyncing: false,
        selectedKeywordFilter: 'ALL',
        expandedDays: {},
        searchKeywordInput: '',
        _cachedDateMap: null,
        toast: {
          show: false,
          message: '',
          type: 'success'
        },
        toastTimeout: null,
        originSource: '',
        originCreator: '',
        originBoard: '',
        originKeywordId: null,
        originKeyword: '',
        originFolderId: null,
        originFolderName: '',
        originReturnUrl: '',

        onImageLoad(event) {
          if (event && event.target) {
            this.realWidth = event.target.naturalWidth || 0;
            this.realHeight = event.target.naturalHeight || 0;
          }
        },

        getResolutionRatioText() {
          if (this.realWidth && this.realHeight) {
            const ratio = (this.realWidth / this.realHeight).toFixed(2);
            const ratioLabel = (ratio > 0.64 && ratio < 0.69) ? '2:3' : ((ratio > 0.95 && ratio < 1.05) ? '1:1' : (ratio + ':1'));
            return this.realWidth + ' × ' + this.realHeight + ' (' + ratioLabel + ')';
          }
          return '2:3 (Standard)';
        },

        getMediaFormatLabel() {
          if (this.dossier?.algorithmic_intelligence?.is_video) return 'Video Pin 🎥';
          if (this.dossier?.algorithmic_intelligence?.is_product) return 'Product Pin 🛒';
          const m = String(this.dossier?.algorithmic_intelligence?.creation_method || '').toLowerCase();
          if (m.includes('carousel')) return 'Carousel 🎠';
          return 'Standard Image 🖼️';
        },

        getCreationMethodBadgeClass() {
          const m = String(this.dossier?.algorithmic_intelligence?.creation_method || '').toLowerCase();
          if (m.includes('carousel')) return 'bg-purple-950/60 text-purple-300 border-purple-800';
          if (m.includes('browser') || m.includes('extension')) return 'bg-amber-950/60 text-amber-300 border-amber-800';
          if (m.includes('api')) return 'bg-sky-950/60 text-sky-300 border-sky-800';
          return 'bg-[#18181B] text-slate-300 border-[#27272A]';
        },

        formatCreationMethodLabel() {
          const m = String(this.dossier?.algorithmic_intelligence?.creation_method || 'pinterest_platform');
          return m.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        },

        formatStrictUniversalAge() {
          const raw = this.dossier?.creative?.created_at_pinterest || this.dossier?.creative?.created_at;
          if (!raw) return 'Unknown';
          const t = new Date(raw).getTime();
          if (isNaN(t)) return 'Unknown';
          const diffDays = Math.max(0, Math.floor((Date.now() - t) / 86400000));
          if (diffDays >= 365) {
            return (diffDays / 365).toFixed(1) + 'y';
          }
          return diffDays + 'd';
        },

        formatLive24hVelocity() {
          const liveDelta = this.computeDeltaUnified(0, 'save_count');
          if (liveDelta !== undefined && liveDelta !== null) {
            return (liveDelta >= 0 ? '+' : '') + liveDelta + '/d';
          }
          const trajVel = Number(this.dossier?.daily_trajectory?.[0]?.daily_save_velocity);
          if (Number.isFinite(trajVel)) {
            return (trajVel >= 0 ? '+' : '') + trajVel.toFixed(1) + '/d';
          }
          return '+0/d';
        },

        formatLifetimeVelocityCaption() {
          const rawVel = Number(this.dossier?.creative?.daily_save_velocity || this.dossier?.daily_trajectory?.[0]?.daily_save_velocity || 0);
          const saves = Number(this.dossier?.creative?.save_count || 0);
          const rawDate = this.dossier?.creative?.created_at_pinterest || this.dossier?.creative?.created_at;
          if (rawDate) {
            const t = new Date(rawDate).getTime();
            if (!isNaN(t)) {
              const diffDays = Math.max(1, Math.floor((Date.now() - t) / 86400000));
              const amortized = (saves / diffDays).toFixed(2);
              return 'Lifetime: ' + amortized + '/d (' + diffDays + 'd)';
            }
          }
          return 'Lifetime: ' + rawVel.toFixed(1) + '/d';
        },

        format24hSaveDelta() {
          const delta = this.computeDeltaUnified(0, 'save_count');
          if (delta > 0) return '+' + this.formatNumber(delta) + ' today';
          if (delta < 0) return this.formatNumber(delta) + ' today';
          return '0 today (Steady)';
        },

        formatViralityRatio() {
          const saves = Number(this.dossier?.creative?.save_count || 0);
          const repins = Number(this.dossier?.creative?.repin_count || 0);
          if (saves > 0) {
            const pct = ((repins / saves) * 100).toFixed(1);
            return pct + '% virality ratio';
          }
          return '0% virality ratio';
        },

        getBestRankDisplay() {
          const highest = this.dossier?.pillar_2_keywords_context?.highest_rank;
          if (highest && highest < 999) return '#' + highest;
          return '--';
        },

        getSerpFootprintSummary() {
          const kws = this.dossier?.pillar_2_keywords_context?.ranking_keywords || [];
          const active = kws.filter(k => !k.is_displaced).length;
          const displaced = kws.filter(k => k.is_displaced).length;
          return 'Active: ' + active + ' | Displaced: ' + displaced;
        },

        getFilteredKeywordsPortfolio() {
          let list = this.dossier?.pillar_2_keywords_context?.ranking_keywords || [];
          if (this.searchKeywordInput && this.searchKeywordInput.trim()) {
            const q = this.searchKeywordInput.trim().toLowerCase();
            list = list.filter(k => (k.keyword || '').toLowerCase().includes(q));
          }
          return list;
        },

        isCreatorContext() {
          return this.originSource === 'creator' || (Boolean(this.originCreator) && !this.originKeyword);
        },

        getBoardSlug(name) {
          if (!name) return '';
          return String(name).toLowerCase().replace(/[^\\p{L}\\p{N}]+/gu, '-').replace(/^-|-$/g, '');
        },

        getBackUrl() {
          if (this.originReturnUrl) return this.originReturnUrl;
          if (this.originSource === 'creator' && this.originCreator) {
            const cleanUser = String(this.originCreator).replace(/^@+/, '').trim();
            const bSlug = this.getBoardSlug(this.originBoard);
            return '/' + encodeURIComponent(cleanUser) + (bSlug ? '/' + encodeURIComponent(bSlug) : '');
          }
          if (this.originKeyword) {
            return '/keywords?q=' + encodeURIComponent(this.originKeyword);
          }
          return '/keywords';
        },

        async init() {
          this.initTheme();
          let hasUrlContext = false;
          // Tier 1: URL Query Parameters
          if (typeof window !== 'undefined' && window.location && window.location.search) {
            const params = new URLSearchParams(window.location.search);
            const creatorParam = params.get('creator') || params.get('account') || '';
            const boardParam = params.get('board') || '';
            const kwParam = params.get('keyword') || params.get('q') || '';
            const kidParam = params.get('keyword_id') || '';
            const fidParam = params.get('folder_id') || '';
            const fNameParam = params.get('folder') || '';
            const returnUrlParam = params.get('return_url') || '';

            if (creatorParam) {
              this.originCreator = creatorParam.replace(/^@+/, '').trim();
              this.originBoard = boardParam.trim();
              this.originSource = 'creator';
              hasUrlContext = true;
            }
            if (kwParam) {
              this.originKeyword = kwParam.trim();
              this.originKeywordId = kidParam.trim() || null;
              if (!this.originSource) this.originSource = 'keyword';
              hasUrlContext = true;
            }
            if (fidParam) {
              this.originFolderId = fidParam.trim();
              this.originFolderName = fNameParam.trim();
              if (!this.originSource) this.originSource = 'keyword';
              hasUrlContext = true;
            }
            if (returnUrlParam) {
              this.originReturnUrl = returnUrlParam.trim();
              hasUrlContext = true;
            }

            if (hasUrlContext && typeof window !== 'undefined' && window.sessionStorage) {
              try {
                sessionStorage.setItem('pae_pin_breadcrumb_ctx', JSON.stringify({
                  source: this.originSource,
                  pinId: this.pinId,
                  creator: this.originCreator,
                  board: this.originBoard,
                  keyword: this.originKeyword,
                  keywordId: this.originKeywordId,
                  folderId: this.originFolderId,
                  folderName: this.originFolderName,
                  returnUrl: this.originReturnUrl,
                  ts: Date.now()
                }));
              } catch (_) {}
            }

            if (hasUrlContext && typeof window !== 'undefined' && window.history && typeof window.history.replaceState === 'function') {
              try {
                window.history.replaceState(null, '', '/pin/' + encodeURIComponent(this.pinId));
              } catch (_) {}
            }
          }

          // Tier 2: sessionStorage ('pae_pin_breadcrumb_ctx')
          if (!this.originCreator && !this.originKeyword && typeof window !== 'undefined' && window.sessionStorage) {
            try {
              const rawCtx = sessionStorage.getItem('pae_pin_breadcrumb_ctx');
              if (rawCtx) {
                const saved = JSON.parse(rawCtx);
                const isFresh = saved?.ts && (Date.now() - saved.ts < 3600000);
                const matchesPin = !saved.pinId || saved.pinId === this.pinId;
                if (isFresh && matchesPin) {
                  if (saved.source === 'creator' || saved.creator) {
                    this.originSource = 'creator';
                    this.originCreator = (saved.creator || '').replace(/^@+/, '').trim();
                    this.originBoard = saved.board || '';
                    this.originReturnUrl = this.originReturnUrl || saved.returnUrl || '';
                  } else if (saved.source === 'keyword' || saved.keyword) {
                    this.originSource = 'keyword';
                    this.originKeyword = saved.keyword || '';
                    this.originKeywordId = saved.keywordId || null;
                    this.originFolderId = saved.folderId || null;
                    this.originFolderName = saved.folderName || '';
                    this.originReturnUrl = this.originReturnUrl || saved.returnUrl || '';
                  }
                }
              }
            } catch (_) {}
          }

          // Tier 3: Same-Origin document.referrer Inspection
          if (!this.originCreator && !this.originKeyword && typeof document !== 'undefined' && document.referrer) {
            try {
              const refUrl = new URL(document.referrer);
              if (typeof window !== 'undefined' && refUrl.origin === window.location.origin) {
                if (refUrl.pathname.startsWith('/keywords')) {
                  this.originSource = 'keyword';
                  this.originReturnUrl = this.originReturnUrl || (refUrl.pathname + refUrl.search);
                  const refKw = refUrl.searchParams.get('q') || refUrl.searchParams.get('keyword');
                  if (refKw) this.originKeyword = refKw.trim();
                  const refKid = refUrl.searchParams.get('keyword_id');
                  if (refKid) this.originKeywordId = refKid.trim();
                } else if (refUrl.pathname !== '/' && !refUrl.pathname.startsWith('/api') && !refUrl.pathname.startsWith('/pin')) {
                  const pathParts = refUrl.pathname.split('/').filter(Boolean);
                  const RESERVED_ROOT_SLUGS = new Set(['keywords', 'discovery', 'folders', 'domains', 'api', 'pin']);
                  const RESERVED_CREATOR_TABS = new Set(['all-pins', 'winning-pins', 'links', 'boards', 'topics', 'related-pins', 'pin']);

                  if (pathParts.length === 1 && !RESERVED_ROOT_SLUGS.has(pathParts[0].toLowerCase())) {
                    this.originSource = 'creator';
                    this.originCreator = pathParts[0].replace(/^@+/, '').trim();
                    this.originReturnUrl = this.originReturnUrl || (refUrl.pathname + refUrl.search);
                  } else if (pathParts.length === 2 && !RESERVED_ROOT_SLUGS.has(pathParts[0].toLowerCase())) {
                    const secondSlug = pathParts[1].toLowerCase();
                    if (secondSlug !== 'pin') {
                      this.originSource = 'creator';
                      this.originCreator = pathParts[0].replace(/^@+/, '').trim();
                      this.originReturnUrl = this.originReturnUrl || (refUrl.pathname + refUrl.search);
                      if (!RESERVED_CREATOR_TABS.has(secondSlug)) {
                        this.originBoard = decodeURIComponent(pathParts[1]).replace(/-/g, ' ');
                      }
                    }
                  }
                }
              }
            } catch (_) {}
          }

          if (!this.pinId) {
            this.loading = false;
            return;
          }
          await this.loadDossier();

          // Tier 4: Fallback from Pin Dossier Metadata
          if (!this.originCreator && !this.originKeyword) {
            const creatorCtx = this.dossier?.pillar_1_creator_context;
            const creatorUser = creatorCtx?.creator_username || this.dossier?.creative?.creator_username;
            if (creatorUser) {
              this.originCreator = String(creatorUser).replace(/^@+/, '').trim();
              this.originBoard = this.originBoard || creatorCtx?.board_name || '';
              this.originSource = 'creator';
            }
          }
          if (this.dossier?.pillar_1_creator_context?.board_name) {
            this.originBoard = this.originBoard || this.dossier.pillar_1_creator_context.board_name;
          }

          // Persist hydrated breadcrumb context to sessionStorage so F5 refreshes retain Tier 3 / Tier 4 context
          if (typeof window !== 'undefined' && window.sessionStorage && (this.originCreator || this.originKeyword)) {
            try {
              sessionStorage.setItem('pae_pin_breadcrumb_ctx', JSON.stringify({
                source: this.originSource,
                pinId: this.pinId,
                creator: this.originCreator,
                board: this.originBoard,
                keyword: this.originKeyword,
                keywordId: this.originKeywordId,
                folderId: this.originFolderId,
                folderName: this.originFolderName,
                returnUrl: this.originReturnUrl,
                ts: Date.now()
              }));
            } catch (_) {}
          }
        },

        showToast(message, type = 'success') {
          this.toast.message = message;
          this.toast.type = type;
          this.toast.show = true;
          if (this.toastTimeout) clearTimeout(this.toastTimeout);
          this.toastTimeout = setTimeout(() => {
            this.toast.show = false;
          }, 3500);
        },

        async loadDossier(forceRefresh = false, silent = false) {
          if (!silent) this.loading = true;
          if (silent) this.isSilentRefreshing = true;
          try {
            const fetcher = typeof window !== 'undefined' ? (window.safeApiFetch || fetch) : fetch;
            if (!fetcher) return;
            const qs = forceRefresh ? ('?refresh=true&_ts=' + Date.now()) : ('?_ts=' + Date.now());
            const res = await fetcher('/api/pins/' + encodeURIComponent(this.pinId) + qs, {
              cache: 'no-store',
              headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
              signal: (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') ? AbortSignal.timeout(12000) : undefined
            });
            if (res.ok) {
              const data = await res.json();
              this.dossier = data;
              this.isShardWarming = Boolean(data?.is_degraded || data?.shard_cold);
              this.rebuildDateMapCache();
              const days = this.filteredDays();
              if (days.length > 0 && Object.keys(this.expandedDays).length === 0) {
                this.expandedDays = { [days[0].snapshot_date]: true };
              }

              // Non-Disruptive Background Healing (L-09)
              const isIncompleteFallback = Boolean(
                data?.is_degraded ||
                data?.shard_cold ||
                (days.length <= 2 && (data?.pillar_2_keywords_context?.ranking_keywords?.length || 0) > 1 && !data?.from_shard_snapshots)
              );
              if (isIncompleteFallback) {
                this._autoRefreshAttempts = (this._autoRefreshAttempts || 0) + 1;
                if (this._autoRefreshAttempts <= 3) {
                  const delayMs = this._autoRefreshAttempts === 1 ? 1200 : (this._autoRefreshAttempts === 2 ? 3000 : 5000);
                  setTimeout(() => {
                    this.loadDossier(true, true);
                  }, delayMs);
                }
              } else {
                this._autoRefreshAttempts = 0;
              }
            } else {
              this.isShardWarming = (res.status === 503);
              if (!silent) {
                this.dossier = null;
                this.showToast(res.status === 503 ? 'Pin storage shard is warming up from sleep.' : 'Pin not found.', 'error');
              }
            }
          } catch (e) {
            console.error('Error fetching pin dossier:', e);
            if (!silent) {
              this.dossier = null;
              this.isShardWarming = false;
              this.showToast('Network error loading pin dossier', 'error');
            }
          } finally {
            if (!silent) this.loading = false;
            this.isSilentRefreshing = false;
          }
        },

        initTheme() {
          if (typeof localStorage !== 'undefined') {
            const saved = localStorage.getItem('pa_theme');
            if (saved === 'light') {
              this.isDark = false;
              if (typeof document !== 'undefined') {
                document.documentElement.classList.remove('dark');
                document.documentElement.classList.add('light');
              }
            } else {
              this.isDark = true;
              if (typeof document !== 'undefined') {
                document.documentElement.classList.add('dark');
                document.documentElement.classList.remove('light');
              }
            }
          }
        },

        toggleTheme() {
          this.isDark = !this.isDark;
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('pa_theme', this.isDark ? 'dark' : 'light');
          }
          if (typeof document !== 'undefined') {
            if (this.isDark) {
              document.documentElement.classList.add('dark');
              document.documentElement.classList.remove('light');
            } else {
              document.documentElement.classList.remove('dark');
              document.documentElement.classList.add('light');
            }
          }
        },

        formatOriginPinner() {
          const op = this.dossier?.algorithmic_intelligence?.origin_pinner;
          if (!op) return '100% Original Creator';
          if (typeof op === 'string') return op;
          const username = op.username || op.user_name || op.full_name || '';
          const followers = op.follower_count || op.followers;
          if (username && followers) {
            return '@' + username + ' (' + this.formatNumber(followers) + ' followers)';
          }
          if (username) return '@' + username;
          return op.name || op.title || 'Original Creator';
        },

        formatInterestName(interest) {
          if (!interest) return '';
          if (typeof interest === 'string') return interest;
          if (typeof interest === 'object') {
            return interest.name || interest.title || interest.term || interest.label || '';
          }
          return String(interest);
        },

        formatCategoryCrumb(crumb) {
          if (!crumb) return '';
          if (typeof crumb === 'string') return crumb;
          if (typeof crumb === 'object') {
            return crumb.name || crumb.title || crumb.label || '';
          }
          return String(crumb);
        },

        formatVisualObject(obj) {
          if (!obj) return '';
          if (typeof obj === 'string') return obj;
          if (typeof obj === 'object') {
            return obj.label || obj.name || obj.title || obj.tag || JSON.stringify(obj);
          }
          return String(obj);
        },

        getReactionCount(type) {
          const rx = this.dossier?.algorithmic_intelligence?.reactions;
          if (rx && typeof rx === 'object') {
            if (type === 'love') return this.formatNumber(rx['1'] || rx.love || 0);
            if (type === 'idea') return this.formatNumber(rx['12'] || rx.idea || 0);
            if (type === 'haha') return this.formatNumber(rx['2'] || rx.haha || 0);
            if (type === 'wow') return this.formatNumber(rx['3'] || rx.wow || 0);
            if (type === 'good_try') return this.formatNumber(rx['7'] || rx.good_try || 0);
          }
          return '0';
        },

        safeColor(c) {
          if (!c) return '#888888';
          const s = String(c).trim();
          if (/^#([0-9a-fA-F]{3,8})$/.test(s) || /^[a-zA-Z]{3,20}$/.test(s)) return s;
          return '#888888';
        },

        safeUrl(url) {
          if (!url) return '';
          const s = String(url).trim();
          const lower = s.toLowerCase();
          if (lower.startsWith('javascript:') || lower.startsWith('data:text/html') || lower.startsWith('vbscript:')) {
            return '#';
          }
          return s;
        },

        copyAltText() {
          const text = this.dossier?.creative?.alt_text || '';
          if (typeof navigator === 'undefined' || !navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
            this.showToast('Clipboard not available in this environment', 'error');
            return;
          }
          navigator.clipboard.writeText(text)
            .then(() => this.showToast('Alt-Text copied to clipboard!'))
            .catch((err) => {
              this.showToast('Clipboard error: ' + (err?.message || 'Access denied'), 'error');
            });
        },

        copyText(text, label = 'Text') {
          if (!text) return;
          if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            navigator.clipboard.writeText(text)
              .then(() => this.showToast(label + ' copied to clipboard!'))
              .catch(() => this.showToast('Failed to copy ' + label, 'error'));
          } else {
            this.showToast('Clipboard not available in this environment', 'error');
          }
        },

        copyUrl(url) {
          this.copyText(url, 'Destination URL');
        },

        formatNumber(n) {
          const num = Number(n);
          if (!Number.isFinite(num)) return '0';
          return num.toLocaleString('en-US');
        },

        activeLiveTags() {
          const list = this.dossier?.creative?.visual_annotations_detailed;
          if (Array.isArray(list) && list.length > 0) {
            return list.filter(t => t.is_live);
          }
          return (this.dossier?.creative?.visual_annotations || []).map(t => ({
            name: typeof t === 'object' && t !== null ? (t.name || t.tag || '') : t,
            is_live: true
          }));
        },

        latestSnapshot() {
          return this.dossier?.snapshots?.[0] || null;
        },

        chronologicalSnapshots() {
          const rawDays = (this.dossier?.daily_trajectory && this.dossier.daily_trajectory.length > 0)
            ? this.dossier.daily_trajectory
            : (this.dossier?.snapshots || []);
          const dayMap = new Map();
          for (const s of rawDays) {
            const d = s.snapshot_date ? String(s.snapshot_date).slice(0, 10) : '';
            if (d && !dayMap.has(d)) dayMap.set(d, s);
          }
          let days = Array.from(dayMap.values()).sort((a, b) => String(a.snapshot_date).localeCompare(String(b.snapshot_date)));
          if (this.chartTimeframe === '7d') days = days.slice(-7);
          else if (this.chartTimeframe === '14d') days = days.slice(-14);
          else if (this.chartTimeframe === '30d') days = days.slice(-30);
          return days;
        },

        computeChartPoints() {
          const snaps = this.chronologicalSnapshots();
          if (snaps.length < 2) return [];

          const isVel = this.chartMetric === 'velocity';
          const values = snaps.map(s => {
            if (isVel) {
              const v = Number(s?.daily_save_velocity);
              return Number.isFinite(v) ? v : 0;
            }
            const rawVal = Number(s?.save_count);
            return Number.isFinite(rawVal) ? Math.max(0, rawVal) : 0;
          });
          const minY = Math.min(...values);
          const maxY = Math.max(...values);
          const rangeY = (maxY - minY) || 1;

          const width = 800;
          const height = 180;
          const padX = 40;
          const padY = 30;

          return snaps.map((s, i) => {
            const x = padX + (i / (snaps.length - 1)) * (width - 2 * padX);
            const rawVal = isVel ? Number(s?.daily_save_velocity) : Number(s?.save_count);
            const val = Number.isFinite(rawVal) ? (isVel ? rawVal : Math.max(0, rawVal)) : 0;
            const y = (maxY === minY)
              ? (height / 2)
              : ((height - padY) - ((val - minY) / rangeY) * (height - 2 * padY));
            return {
              x: Number.isFinite(x) ? Number(x.toFixed(2)) : padX,
              y: Number.isFinite(y) ? Number(y.toFixed(2)) : 90,
              snapshot: s,
              value: val
            };
          });
        },

        buildSvgLinePath() {
          const points = this.computeChartPoints();
          if (!points.length) return '';
          return points.reduce((acc, p, i) => {
            const xStr = Number.isFinite(p.x) ? p.x.toFixed(1) : '0.0';
            const yStr = Number.isFinite(p.y) ? p.y.toFixed(1) : '90.0';
            return i === 0 ? ('M ' + xStr + ' ' + yStr) : (acc + ' L ' + xStr + ' ' + yStr);
          }, '');
        },

        buildSvgAreaPath() {
          const points = this.computeChartPoints();
          if (!points.length) return '';
          const lineD = this.buildSvgLinePath();
          const lastPoint = points[points.length - 1];
          const firstPoint = points[0];
          const bottomY = 150;
          const lastX = Number.isFinite(lastPoint.x) ? lastPoint.x.toFixed(1) : '0.0';
          const firstX = Number.isFinite(firstPoint.x) ? firstPoint.x.toFixed(1) : '0.0';
          return lineD + ' L ' + lastX + ' ' + bottomY.toFixed(1) + ' L ' + firstX + ' ' + bottomY.toFixed(1) + ' Z';
        },

        computeDelta(currentIdx, field = 'save_count') {
          if (Array.isArray(this.dossier?.snapshots) && this.dossier.snapshots.length > 0) {
            const snaps = this.dossier.snapshots;
            if (currentIdx >= snaps.length - 1 || currentIdx < 0) return 0;
            const current = Number.isFinite(Number(snaps[currentIdx]?.[field])) ? Number(snaps[currentIdx][field]) : 0;
            const previous = Number.isFinite(Number(snaps[currentIdx + 1]?.[field])) ? Number(snaps[currentIdx + 1][field]) : 0;
            return current - previous;
          }
          return this.computeDeltaUnified(currentIdx, field);
        },

        computeDeltaUnified(currentIdxOrCurr, fieldOrPrev = 'save_count') {
          if (typeof currentIdxOrCurr === 'object' && currentIdxOrCurr !== null) {
            const currVal = Number(currentIdxOrCurr.save_count ?? currentIdxOrCurr) || 0;
            const prevVal = Number(fieldOrPrev?.save_count ?? fieldOrPrev) || 0;
            return currVal - prevVal;
          }
          const currentIdx = typeof currentIdxOrCurr === 'number' ? currentIdxOrCurr : 0;
          const field = typeof fieldOrPrev === 'string' ? fieldOrPrev : 'save_count';
          const snaps = this.dossier?.snapshots || [];
          if (snaps.length > 0) {
            if (currentIdx >= snaps.length - 1 || currentIdx < 0) return 0;
            const current = Number(snaps[currentIdx]?.[field] || 0);
            const previous = Number(snaps[currentIdx + 1]?.[field] || 0);
            return current - previous;
          }
          const traj = this.dossier?.daily_trajectory || [];
          if (traj[currentIdx] && traj[currentIdx + 1]) {
            return Number(traj[currentIdx]?.[field] || 0) - Number(traj[currentIdx + 1]?.[field] || 0);
          }
          return 0;
        },

        rebuildDateMapCache() {
          const map = new Map();
          const days = (this.dossier?.daily_trajectory && this.dossier.daily_trajectory.length > 0)
            ? this.dossier.daily_trajectory
            : (this.dossier?.snapshots || []);
          for (let i = 0; i < days.length; i++) {
            map.set(days[i].snapshot_date, {
              current: days[i],
              previous: days[i + 1] || null
            });
          }
          this._cachedDateMap = map;
        },

        filteredDays() {
          const days = (this.dossier?.daily_trajectory && this.dossier.daily_trajectory.length > 0)
            ? this.dossier.daily_trajectory
            : (this.dossier?.snapshots || []);
          if (!this.selectedKeywordFilter || this.selectedKeywordFilter === 'ALL') {
            return days;
          }
          return days.filter(d => (d.ranking_keywords || []).some(k => k.keyword === this.selectedKeywordFilter));
        },

        formatDayDelta(day, idx) {
          const days = this.filteredDays();
          if (idx >= days.length - 1) return '+0 (Baseline)';
          const prev = days[idx + 1];
          const delta = (Number(day.save_count) || 0) - (Number(prev.save_count) || 0);
          if (delta > 0) return '+' + this.formatNumber(delta) + ' 24h';
          if (delta < 0) return this.formatNumber(delta) + ' 24h';
          return '0 24h';
        },

        toggleDayExpanded(date) {
          if (!date) return;
          this.expandedDays[date] = !this.expandedDays[date];
        },

        isDayExpanded(date) {
          return Boolean(this.expandedDays[date]);
        },

        expandAllDays() {
          const next = {};
          for (const d of this.filteredDays()) {
            if (d.snapshot_date) next[d.snapshot_date] = true;
          }
          this.expandedDays = next;
        },

        collapseAllDays() {
          this.expandedDays = {};
        },

        filteredKeywordsForDay(day) {
          let list = Array.isArray(day?.ranking_keywords) ? day.ranking_keywords : [];
          if (this.selectedKeywordFilter && this.selectedKeywordFilter !== 'ALL') {
            list = list.filter(k => k.keyword === this.selectedKeywordFilter);
          }
          return list;
        },

        keywordRankMovement(dayDate, kw) {
          if (!this._cachedDateMap) this.rebuildDateMapCache();
          const entry = this._cachedDateMap?.get(dayDate);
          if (!entry || !entry.previous) return { delta: 0, status: 'steady' };
          const prev = (entry.previous.ranking_keywords || []).find(p => p.keyword === kw.keyword || (kw.keyword_id && p.keyword_id === kw.keyword_id));
          if (!prev) return { delta: 0, status: 'new' };
          if (kw.is_displaced && prev.is_displaced) return { delta: 0, status: 'steady' };
          if (kw.is_displaced && !prev.is_displaced) return { delta: 0, status: 'down' };
          if (!kw.is_displaced && prev.is_displaced) return { delta: 0, status: 'up' };
          const currRank = Number(kw.live_serp_rank || kw.rank || 999);
          const prevRank = Number(prev.live_serp_rank || prev.rank || 999);
          const diff = prevRank - currRank;
          if (diff > 0) return { delta: diff, status: 'up' };
          if (diff < 0) return { delta: Math.abs(diff), status: 'down' };
          return { delta: 0, status: 'steady' };
        },

        getKeywordTierLabel(kw) {
          if (kw.is_displaced) return 'Displaced Vault';
          const r = Number(kw.live_serp_rank || kw.rank || 999);
          if (r <= 3) return 'Top 3 (Prime)';
          if (r <= 10) return 'Top 10 (Page 1)';
          if (r <= 50) return 'Ranks 11-50';
          if (r <= 100) return 'Ranks 51-100';
          return 'Vault';
        },

        getKeywordTierClass(kw) {
          if (kw.is_displaced) return 'bg-amber-950/50 text-amber-300 border border-amber-800';
          const r = Number(kw.live_serp_rank || kw.rank || 999);
          if (r <= 3) return 'bg-emerald-950/50 text-emerald-300 border border-emerald-800';
          if (r <= 10) return 'bg-sky-950/50 text-sky-300 border border-sky-800';
          if (r <= 50) return 'bg-indigo-950/50 text-indigo-300 border border-indigo-800';
          return 'bg-[#18181B] text-slate-400 border border-[#27272A]';
        },

        totalShares() {
          const s = this.latestSnapshot();
          return Number(s?.share_count || this.dossier?.creative?.share_count || 0);
        },

        totalEngagementScore() {
          const s = this.latestSnapshot();
          const snapC = Number(s?.comment_count || this.dossier?.creative?.comment_count || 0);
          const snapR = Number(s?.reaction_count || 0);
          const snapSh = Number(s?.share_count || this.dossier?.creative?.share_count || 0);
          return snapC + snapR + snapSh;
        },

        async triggerLiveDeepSync() {
          if (this.isSyncing) return;
          this.isSyncing = true;
          this.showToast('Triggering live Pinterest deep scrape (no cookies)...');
          try {
            const res = await (window.safeApiFetch || fetch)('/api/pins/' + encodeURIComponent(this.pinId) + '/sync', {
              method: 'POST'
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data?.success) {
              this.showToast('Pin synchronized across all 4 pillars successfully!');
              await this.loadDossier(true);
            } else {
              this.showToast(data?.message || data?.error || 'Deep sync failed', 'error');
            }
          } catch (err) {
            this.showToast('Deep sync error: ' + err.message, 'error');
          } finally {
            this.isSyncing = false;
          }
        },

        requestDeleteSnapshot(id) {
          this.deleteType = 'SNAPSHOT';
          this.itemToDelete = { snapshotId: id };
          this.snapshotToDelete = id;
          this.deleteModalOpen = true;
        },

        async executeDeleteSnapshot() {
          if (!this.snapshotToDelete || this.isDeleting) return;
          this.isDeleting = true;
          try {
            const fetcher = typeof window !== 'undefined' ? (window.safeApiFetch || fetch) : fetch;
            if (!fetcher) return;
            const res = await fetcher('/api/pins/' + encodeURIComponent(this.pinId) + '/snapshots/' + encodeURIComponent(this.snapshotToDelete), {
              method: 'DELETE'
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data?.success) {
              if (Array.isArray(this.dossier?.snapshots)) {
                this.dossier.snapshots = this.dossier.snapshots.filter(s => s.id !== this.snapshotToDelete);
              }
              this.showToast('Snapshot #' + this.snapshotToDelete + ' deleted successfully');
              this.deleteModalOpen = false;
              this.snapshotToDelete = null;
            } else {
              this.showToast(data?.message || data?.error || 'Error deleting snapshot', 'error');
            }
          } catch (err) {
            this.showToast('Error: ' + err.message, 'error');
          } finally {
            this.isDeleting = false;
          }
        },

        requestDeleteSerpBadge(kw, date) {
          this.deleteType = 'SERP_BADGE';
          this.itemToDelete = { keywordId: kw.keyword_id, keywordName: kw.keyword, date };
          this.deleteModalOpen = true;
        },

        requestDeleteDay(date) {
          this.deleteType = 'DAY';
          this.itemToDelete = { date };
          this.deleteModalOpen = true;
        },

        requestPurgePin() {
          this.deleteType = 'PIN';
          this.itemToDelete = { pinId: this.pinId };
          this.deleteModalOpen = true;
        },

        async confirmDelete() {
          if (this.isDeleting || !this.itemToDelete) return;
          this.isDeleting = true;
          try {
            if (this.deleteType === 'SERP_BADGE') {
              const { keywordId, keywordName, date } = this.itemToDelete;
              const res = await (window.safeApiFetch || fetch)('/api/pins/' + encodeURIComponent(this.pinId) + '/serp-positions', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ keyword_id: keywordId, snapshot_date: date })
              });
              const data = await res.json().catch(() => ({}));
              if (res.ok && data?.success) {
                this.showToast('Keyword rank "' + keywordName + '" removed for ' + date);
                this.deleteModalOpen = false;
                await this.loadDossier(true);
              } else {
                this.showToast(data?.message || data?.error || 'Error removing rank', 'error');
              }
            } else if (this.deleteType === 'DAY') {
              const { date } = this.itemToDelete;
              const res = await (window.safeApiFetch || fetch)('/api/pins/' + encodeURIComponent(this.pinId) + '/daily-metrics/' + encodeURIComponent(date), {
                method: 'DELETE'
              });
              const data = await res.json().catch(() => ({}));
              if (res.ok && data?.success) {
                this.showToast('All data for ' + date + ' deleted successfully');
                this.deleteModalOpen = false;
                await this.loadDossier(true);
              } else {
                this.showToast(data?.message || data?.error || 'Error deleting day', 'error');
              }
            } else if (this.deleteType === 'SNAPSHOT') {
              await this.executeDeleteSnapshot();
            } else if (this.deleteType === 'PIN') {
              const res = await (window.safeApiFetch || fetch)('/api/pins/' + encodeURIComponent(this.pinId), {
                method: 'DELETE'
              });
              const data = await res.json().catch(() => ({}));
              if (res.ok && data?.success) {
                this.showToast('Pin #' + this.pinId + ' permanently purged from Shards and Hub');
                this.deleteModalOpen = false;
                if (typeof window !== 'undefined') {
                  setTimeout(() => {
                    window.location.href = this.getBackUrl();
                  }, 1000);
                }
              } else {
                this.showToast(data?.message || data?.error || 'Error purging pin', 'error');
              }
            }
          } catch (err) {
            this.showToast('Deletion error: ' + err.message, 'error');
          } finally {
            this.isDeleting = false;
          }
        }
      };
    }
  </script>
</body>
</html>`;
}
