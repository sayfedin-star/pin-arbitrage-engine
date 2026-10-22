/**
 * Dedicated Pin Intelligence Page UI (Level 3)
 * Pure ES Module generating the full HTML application for /pins/:pin_id and /pin/:pin_id.
 * Clean, modern Light Mode SaaS interface (100% Native English Typography).
 * Features:
 * - High-signal Executive Layout (Two-column desktop architecture)
 * - Micro-Status Chips (Original/Repin, Direct Link/Linkless, Google Indexed/Noindex)
 * - Interactive Emerald Canonical Root Pill with 1-click inspection
 * - Unified Outbound Destination & SEO Alt-Text Copier
 * - 5 Core KPI Metric Cards
 * - Tabbed Progressive Disclosure (Rankings, Historical Snapshots, Deep Forensics)
 * - Dynamic time-series audit log with atomic snapshot deletion
 */

import { getEdgeShieldClientScript } from './edge-shield-client.mjs';

export function getPinDetailPageHtml(pinId = '') {
  const safePinId = String(pinId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
  const escapedPinId = safePinId.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="referrer" content="same-origin">
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📌</text></svg>">
  <title>Pin Dossier #${escapedPinId} | Pinterest Arbitrage Intelligence</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: {
            sans: ['Inter', 'sans-serif'],
            mono: ['JetBrains Mono', 'monospace']
          },
          colors: {
            brand: {
              50: '#f0fdf4',
              100: '#dcfce7',
              500: '#22c55e',
              600: '#16a34a',
              700: '#15803d'
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
    ::-webkit-scrollbar-thumb { background: rgba(148, 163, 184, 0.4); border-radius: 9999px; }
    ::-webkit-scrollbar-thumb:hover { background: rgba(100, 116, 139, 0.6); }
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
        res = await origFetch(input, init);
      }
    }
    return res;
  };
})();
  </script>
</head>
<body class="bg-[#f8fafc] text-slate-800 min-h-screen antialiased flex flex-col font-sans" x-data="pinDetailApp('${safePinId}')">

  <!-- Toast Notification Container -->
  <div 
    x-show="toast.show" 
    x-transition:enter="transition ease-out duration-200"
    x-transition:enter-start="opacity-0 translate-y-2 scale-95"
    x-transition:enter-end="opacity-100 translate-y-0 scale-100"
    x-transition:leave="transition ease-in duration-150"
    x-transition:leave-start="opacity-100 translate-y-0 scale-100"
    x-transition:leave-end="opacity-0 translate-y-2 scale-95"
    class="fixed top-5 right-5 z-50 max-w-sm px-4 py-3 rounded-xl shadow-lg border flex items-center gap-3 text-xs font-medium"
    :class="toast.type === 'error' ? 'bg-red-50 text-red-800 border-red-200' : 'bg-emerald-50 text-emerald-800 border-emerald-200'"
    x-cloak
  >
    <span x-text="toast.type === 'error' ? '⚠️' : '✅'" class="text-base"></span>
    <span x-text="toast.message" class="flex-1 font-sans"></span>
    <button @click="toast.show = false" class="text-slate-400 hover:text-slate-700 ml-2">✕</button>
  </div>

  <!-- Top Navigation Header (Light SaaS Theme) -->
  <header class="border-b border-slate-200 bg-white/95 backdrop-blur sticky top-0 z-40 px-6 py-3 flex items-center justify-between shadow-xs">
    <div class="flex items-center gap-6">
      <div class="flex items-center gap-3">
        <a href="/keywords" class="flex items-center gap-2 group">
          <div class="w-8 h-8 rounded-lg bg-pink-50 border border-pink-200 flex items-center justify-center text-pink-600 font-bold group-hover:scale-105 transition-transform">
            📌
          </div>
          <div>
            <div class="text-sm font-bold tracking-tight text-slate-900 flex items-center gap-2">
              Pin Dossier
              <span class="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-pink-50 text-pink-700 border border-pink-200 font-semibold" x-text="isNaN(Number(pinId)) ? pinId : '#' + pinId"></span>
            </div>
            <div class="text-[11px] text-slate-500 font-mono">Universal Shard Fleet Inspection</div>
          </div>
        </a>
      </div>

      <nav class="hidden md:flex items-center gap-1 text-xs font-medium">
        <a href="/keywords" class="px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors">Keywords Radar</a>
        <a href="/keywords/discovery" class="px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors">Discovery & Autocomplete</a>
        <a href="/folders" class="px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors">Campaign Folders</a>
        <a href="/domains" class="px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors">Domain Radar</a>
        <a href="/" class="px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors">Creator Archive</a>
      </nav>
    </div>

    <div class="flex items-center gap-2.5 flex-shrink-0">
      <!-- Direct Return to Origin Keyword / Radar -->
      <a 
        :href="getBackToKeywordUrl()" 
        class="px-3.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 text-xs font-bold transition-all flex items-center gap-1.5 border border-slate-300 shadow-2xs"
        :title="originKeyword ? ('Back to ' + originKeyword) : 'Back to Keywords Radar'"
      >
        <span class="text-sm">←</span>
        <span x-text="originKeyword ? ('Back to ' + originKeyword) : 'Back to Radar'"></span>
      </a>

      <button 
        @click="triggerLiveDeepSync()" 
        :disabled="isSyncing"
        class="px-3.5 py-1.5 rounded-lg bg-pink-600 hover:bg-pink-700 text-white text-xs font-bold shadow-xs transition-all flex items-center gap-1.5 border border-pink-700 disabled:opacity-50"
      >
        <span :class="isSyncing ? 'animate-spin' : ''">⚡</span>
        <span x-text="isSyncing ? 'Syncing...' : 'Live Deep Sync'"></span>
      </button>
      <a :href="'https://www.pinterest.com/pin/' + pinId + '/'" target="_blank" rel="noopener noreferrer" class="px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold border border-red-200 transition-colors flex items-center gap-1.5">
        <span>↗</span> Pinterest
      </a>
      <button @click="loadDossier(true)" class="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 text-xs font-medium border border-slate-300 transition-colors flex items-center gap-1.5 shadow-2xs">
        <span :class="loading ? 'animate-spin' : ''">🔄</span> Refresh
      </button>
    </div>
  </header>

  <!-- Responsive Breadcrumb Navigation Bar -->
  <nav aria-label="Breadcrumb" class="border-b border-slate-200/80 bg-white/90 px-6 py-2.5 text-xs font-medium text-slate-500 flex items-center gap-2 overflow-x-auto shadow-2xs backdrop-blur-xs">
    <a href="/keywords" class="hover:text-pink-600 flex items-center gap-1.5 transition-colors text-slate-600 font-semibold">
      <span>📡</span>
      <span>Keywords Radar</span>
    </a>
    
    <template x-if="originFolderId || originFolderName">
      <div class="flex items-center gap-2">
        <span class="text-slate-300 select-none">/</span>
        <a :href="'/folders?id=' + encodeURIComponent(originFolderId || '')" class="hover:text-pink-600 flex items-center gap-1 transition-colors text-slate-600">
          <span>📁</span>
          <span x-text="originFolderName || ('Folder #' + originFolderId)"></span>
        </a>
      </div>
    </template>

    <template x-if="originKeyword">
      <div class="flex items-center gap-2">
        <span class="text-slate-300 select-none">/</span>
        <a :href="getBackToKeywordUrl()" class="hover:text-pink-600 font-semibold text-slate-700 transition-colors flex items-center gap-1">
          <span>🔑</span>
          <span x-text="originKeyword"></span>
        </a>
      </div>
    </template>

    <span class="text-slate-300 select-none">/</span>
    <span class="text-slate-900 font-mono font-bold flex items-center gap-1">
      <span class="text-pink-600">📌</span>
      <span x-text="'Pin #' + pinId"></span>
    </span>
  </nav>

  <!-- Loading State -->
  <div x-show="loading" class="flex-1 flex items-center justify-center p-12" x-cloak>
    <div class="flex flex-col items-center gap-3 max-w-sm text-center">
      <div class="w-10 h-10 border-2 border-pink-600 border-t-transparent rounded-full animate-spin"></div>
      <div class="text-sm font-semibold text-slate-900">Resolving Universal Pin Dossier...</div>
      <div class="text-xs text-slate-500 font-mono">Routing deterministic CRC32 hash to Shard Fleet.</div>
    </div>
  </div>

  <!-- Error / Not Found / Cold Shard Fallback -->
  <div x-show="!loading && (!dossier || !dossier.success)" class="flex-1 flex items-center justify-center p-12" x-cloak>
    <div class="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-8 text-center flex flex-col items-center gap-4 shadow-sm">
      <div 
        class="w-14 h-14 rounded-full flex items-center justify-center text-2xl"
        :class="isShardWarming ? 'bg-amber-50 border border-amber-200 text-amber-600' : 'bg-red-50 border border-red-200 text-red-600'"
      >
        <span x-text="isShardWarming ? '⏳' : '⚠️'"></span>
      </div>
      <div>
        <h2 class="text-base font-bold text-slate-900" x-text="isShardWarming ? 'Storage Shard Warming Up' : 'Pin Telemetry Not Found'"></h2>
        <p class="text-xs text-slate-600 mt-1" x-text="isShardWarming ? 'The Neon Serverless Shard containing this pin is waking up from scale-to-zero cold sleep. Please retry in a few seconds.' : 'Pin ' + (isNaN(Number(pinId)) ? pinId : '#' + pinId) + ' is either offline, not yet crawled, or does not exist.'"></p>
      </div>
      <div class="flex items-center gap-3 pt-2">
        <button @click="loadDossier(true)" class="px-4 py-2 rounded-lg bg-pink-600 hover:bg-pink-700 text-white text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-2xs">
          <span>🔄</span>
          <span x-text="isShardWarming ? 'Retry Shard Fetch' : 'Try Force Refresh'"></span>
        </button>
        <a href="/keywords" class="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition-colors">
          Return to Radar
        </a>
      </div>
    </div>
  </div>

  <!-- Main Content Dossier: Executive Two-Column Architecture -->
  <main x-show="!loading && dossier && dossier.success" class="flex-1 max-w-7xl w-full mx-auto p-6 flex flex-col lg:flex-row gap-6 items-start" x-cloak>

    <!-- LEFT COLUMN: Pin Creative & Asset Identity Card (~320px fixed) -->
    <div class="w-full lg:w-80 flex-shrink-0 flex flex-col gap-4">
      
      <!-- Pinterest Standard 2:3 Ratio Preview Container -->
      <div class="bg-white border border-slate-200 rounded-2xl p-3 shadow-xs flex flex-col gap-3">
        <div class="aspect-[2/3] w-full rounded-xl overflow-hidden bg-slate-100 border border-slate-200 relative shadow-sm group flex items-center justify-center">
          <img 
            :src="dossier?.creative?.image_url || 'https://via.placeholder.com/600x900?text=Pin+Image'" 
            :alt="dossier?.creative?.title || 'Pin Creative'" 
            class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            referrerpolicy="no-referrer"
            loading="lazy"
          >
          <!-- Floating Shard & Aspect Ratio Badges -->
          <div class="absolute top-2.5 left-2.5 flex items-center gap-1.5">
            <span class="px-2 py-0.5 rounded-md bg-white/95 backdrop-blur text-[10px] font-mono font-bold text-slate-800 border border-slate-200 shadow-2xs">
              2:3 Aspect
            </span>
            <span class="px-2 py-0.5 rounded-md bg-emerald-50 text-[10px] font-mono font-bold text-emerald-700 border border-emerald-200 shadow-2xs" x-text="'Shard #' + dossier?.shard_id"></span>
          </div>

          <!-- Floating Dominant Color Indicator -->
          <div class="absolute bottom-2.5 left-2.5 right-2.5 p-2 rounded-lg bg-white/95 backdrop-blur-md border border-slate-200 flex items-center justify-between shadow-xs">
            <div class="flex items-center gap-2">
              <span class="w-3.5 h-3.5 rounded-full border border-slate-300 shadow-2xs" :style="'background-color: ' + safeColor(dossier?.creative?.dominant_color)"></span>
              <span class="text-[11px] font-mono text-slate-700 font-semibold" x-text="safeColor(dossier?.creative?.dominant_color)"></span>
            </div>
            <span class="text-[10px] font-mono uppercase text-slate-500 font-medium">Dominant Color</span>
          </div>
        </div>

        <!-- Creator & Board Details (Clean & Compact) -->
        <div class="flex flex-col gap-2.5 pt-1">
          <!-- Creator Profile Row -->
          <div class="flex items-center justify-between gap-2 text-xs">
            <span class="text-slate-500 font-medium">Creator</span>
            <template x-if="dossier?.pillar_1_creator_context?.creator_username">
              <a 
                :href="dossier.pillar_1_creator_context.creator_url || ('https://www.pinterest.com/' + dossier.pillar_1_creator_context.creator_username + '/')" 
                target="_blank" 
                rel="noopener noreferrer" 
                class="font-mono font-semibold text-slate-800 hover:text-pink-600 transition-colors truncate max-w-[170px]"
                x-text="'@' + dossier.pillar_1_creator_context.creator_username"
              ></a>
            </template>
            <template x-if="!dossier?.pillar_1_creator_context?.creator_username">
              <span class="text-slate-400 font-mono italic">Anonymous</span>
            </template>
          </div>

          <!-- Board Container Row -->
          <div class="flex items-center justify-between gap-2 text-xs">
            <span class="text-slate-500 font-medium">Board</span>
            <template x-if="dossier?.pillar_1_creator_context?.board_name">
              <a 
                :href="dossier.pillar_1_creator_context.board_url || '#'" 
                target="_blank" 
                rel="noopener noreferrer" 
                class="font-mono text-slate-700 hover:text-blue-600 transition-colors truncate max-w-[170px]"
                x-text="dossier.pillar_1_creator_context.board_name"
              ></a>
            </template>
            <template x-if="!dossier?.pillar_1_creator_context?.board_name">
              <span class="text-slate-400 font-mono italic">Default</span>
            </template>
          </div>

          <!-- Publication Date Row -->
          <div class="flex items-center justify-between gap-2 text-xs">
            <span class="text-slate-500 font-medium">Published</span>
            <div class="font-mono text-slate-800 text-[11px] text-right">
              <span x-text="formatDate(dossier?.creative?.created_at_pinterest) || 'Recently crawled'"></span>
              <span class="text-slate-400 ml-0.5" x-text="formatAge(dossier?.creative?.created_at_pinterest)"></span>
            </div>
          </div>

          <!-- Creation Method Row -->
          <div class="flex items-center justify-between gap-2 text-xs">
            <span class="text-slate-500 font-medium">Method</span>
            <span class="font-mono text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200" x-text="dossier?.algorithmic_intelligence?.creation_method || 'pinterest_platform'"></span>
          </div>

          <!-- Perceptual Image Signature -->
          <div class="flex items-center justify-between gap-2 text-xs pt-2 border-t border-slate-100">
            <span class="text-slate-500 font-medium">Image Hash</span>
            <div class="flex items-center gap-1.5">
              <span class="font-mono text-[10px] text-slate-600 truncate max-w-[110px]" x-text="dossier?.algorithmic_intelligence?.image_signature || dossier?.creative?.image_signature || 'N/A'"></span>
              <button 
                @click="copyImageSignature()" 
                class="text-slate-400 hover:text-slate-700 text-xs px-1.5 py-0.5 rounded bg-slate-50 border border-slate-200"
                title="Copy Image Signature"
              >📋</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Shard Placement Box -->
      <div class="p-3 rounded-xl bg-slate-100/70 border border-slate-200 flex items-center justify-between text-xs font-mono text-slate-600">
        <span>CRC32 Routing:</span>
        <span class="text-pink-600 font-semibold" x-text="'Shard ' + dossier?.shard_id + ' / 99'"></span>
      </div>

    </div>

    <!-- RIGHT COLUMN: Intelligence, Telemetry & Arbitrage Workspace -->
    <div class="flex-1 w-full flex flex-col gap-5 min-w-0">

      <!-- 1. Executive Title & Concise Status Badges Card -->
      <div class="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col gap-3.5">
        
        <!-- Header Status Row (Micro-Status Chips & Sleek Green Canonical Pill) -->
        <div class="flex items-center gap-2 flex-wrap text-xs">
          
          <!-- Deleted Alert if Applicable -->
          <template x-if="dossier?.creative?.is_deleted">
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
              <span>🗑️</span> Removed (404)
            </span>
          </template>

          <!-- Current SERP Rank Badge -->
          <span 
            class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border"
            :class="dossier?.pillar_2_keywords_context?.highest_rank <= 10 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-pink-50 text-pink-700 border-pink-200'"
            x-text="'Rank #' + (dossier?.pillar_2_keywords_context?.highest_rank !== 999 ? dossier?.pillar_2_keywords_context?.highest_rank : 'Listed')"
          ></span>

          <!-- Concise Status 1: Original vs Repin -->
          <template x-if="!dossier?.algorithmic_intelligence?.is_repin">
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/80">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              Original
            </span>
          </template>
          <template x-if="dossier?.algorithmic_intelligence?.is_repin">
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200/80">
              <span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
              Repin
            </span>
          </template>

          <!-- Concise Status 2: Direct Link vs Linkless -->
          <template x-if="dossier?.algorithmic_intelligence?.is_arbitrage_active">
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200/80">
              <span class="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
              Direct Link
            </span>
          </template>
          <template x-if="!dossier?.algorithmic_intelligence?.is_arbitrage_active">
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
              <span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
              Linkless
            </span>
          </template>

          <!-- Concise Status 3: Google Indexed vs Noindex -->
          <template x-if="dossier?.algorithmic_intelligence?.is_indexed_google">
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/80">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              Google Indexed
            </span>
          </template>
          <template x-if="!dossier?.algorithmic_intelligence?.is_indexed_google">
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-rose-50 text-rose-700 border border-rose-200/80">
              <span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
              Noindex
            </span>
          </template>

          <!-- Sleek Interactive Green Canonical Root Pill -->
          <template x-if="dossier?.algorithmic_intelligence?.canonical_pin_id">
            <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-semibold bg-emerald-100/70 text-emerald-900 border border-emerald-300 shadow-2xs">
              <span class="text-emerald-700">👑 Canonical:</span>
              <a 
                :href="'/pins/' + dossier?.algorithmic_intelligence?.canonical_pin_id" 
                class="hover:underline text-emerald-950 font-bold flex items-center gap-1"
                title="Open Canonical Root Pin Dossier"
              >
                <span x-text="'#' + dossier?.algorithmic_intelligence?.canonical_pin_id"></span>
                <span class="text-emerald-600 text-[10px]">↗</span>
              </a>
              <button 
                @click="copyUrl('https://www.pinterest.com/pin/' + dossier?.algorithmic_intelligence?.canonical_pin_id + '/')" 
                class="text-emerald-700 hover:text-emerald-950 ml-0.5 text-xs" 
                title="Copy Canonical URL"
              >📋</button>
            </div>
          </template>
        </div>

        <!-- Main Title & Description -->
        <div class="flex flex-col gap-1.5">
          <h1 class="text-xl md:text-2xl font-bold text-slate-900 tracking-tight leading-snug" x-text="dossier?.creative?.title || 'Pin #' + pinId"></h1>
          <p class="text-xs text-slate-600 leading-relaxed max-w-4xl" x-text="dossier?.creative?.description || 'No descriptive body captured for this pin.'"></p>
        </div>

        <!-- Outbound Destination URL (Clean Single-Line Bar) -->
        <div class="p-3 rounded-xl bg-blue-50/60 border border-blue-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div class="flex items-center gap-2 overflow-hidden max-w-full">
            <span class="text-blue-600 font-bold text-sm shrink-0">🔗</span>
            <span class="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-100 text-blue-800 font-semibold shrink-0" x-text="dossier?.creative?.domain || 'Domain'"></span>
            <div class="text-xs font-mono text-blue-900 truncate font-medium" :title="dossier?.creative?.destination_url || dossier?.algorithmic_intelligence?.utm_link">
              <span x-text="dossier?.creative?.destination_url || dossier?.algorithmic_intelligence?.utm_link || 'No outbound URL captured.'"></span>
            </div>
          </div>
          <div class="flex items-center gap-2 flex-shrink-0">
            <button 
              @click="copyUrl(dossier?.creative?.destination_url || dossier?.algorithmic_intelligence?.utm_link)" 
              class="px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 text-xs font-mono border border-slate-300 shadow-2xs transition-colors flex items-center gap-1"
              title="Copy Destination URL"
            >
              <span>📋 Copy</span>
            </button>
            <a 
              :href="safeUrl(dossier?.creative?.destination_url || dossier?.algorithmic_intelligence?.utm_link)" 
              target="_blank" 
              rel="noopener noreferrer" 
              class="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-2xs transition-colors flex items-center gap-1"
            >
              <span>Open ↗</span>
            </a>
          </div>
        </div>

        <!-- SEO Alt-Text Row (Clean Single Bar) -->
        <div class="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-4">
          <div class="flex items-center gap-2.5 overflow-hidden flex-1">
            <span class="text-[10px] font-mono uppercase tracking-wider text-pink-700 font-bold shrink-0">SEO Alt Text:</span>
            <p class="text-xs text-slate-700 font-mono truncate" :title="dossier?.creative?.alt_text" x-text="dossier?.creative?.alt_text || 'No SEO alt-text metadata captured.'"></p>
          </div>
          <button 
            @click="copyAltText()" 
            class="px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 text-xs font-mono border border-slate-300 whitespace-nowrap transition-colors flex items-center gap-1 shadow-2xs shrink-0"
            title="Copy Alt Text"
          >
            <span>📋 Copy Alt Text</span>
          </button>
        </div>

        <!-- Live Pinterest Vision Tags (Clean Pill Cloud) -->
        <div class="flex flex-col gap-2 pt-1 border-t border-slate-100">
          <div class="flex items-center justify-between text-xs">
            <span class="font-bold text-slate-700 flex items-center gap-1.5">
              <span>🏷️</span> Computer Vision Annotations
            </span>
            <span class="text-[11px] font-mono text-slate-500" x-text="'Total ' + (dossier?.creative?.visual_annotations?.length || 0) + ' tags'"></span>
          </div>
          <div class="flex items-center gap-1.5 flex-wrap">
            <template x-for="item in activeLiveTags()" :key="item.name">
              <span class="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 font-mono flex items-center gap-1 shadow-2xs">
                <span class="text-emerald-600 font-bold">#</span>
                <span x-text="item.name"></span>
              </span>
            </template>
            <template x-for="item in historicalTags()" :key="item.name">
              <span class="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-xs text-slate-700 font-mono flex items-center gap-1">
                <span class="text-slate-400 font-bold">#</span>
                <span x-text="item.name"></span>
              </span>
            </template>
            <span x-show="!dossier?.creative?.visual_annotations?.length" class="text-xs text-slate-400 italic font-mono">No annotations recorded.</span>
          </div>
        </div>

      </div>

      <!-- 2. Key Telemetry Metrics Grid (5 KPI Cards) -->
      <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <div class="bg-white border border-slate-200 rounded-xl p-3.5 flex flex-col justify-between shadow-2xs">
          <div class="text-[11px] font-mono text-slate-500 flex items-center justify-between">
            <span>Total Saves</span>
            <span class="text-emerald-700 text-[10px] font-semibold" x-text="computeDeltaUnified(0, 'save_count') > 0 ? '+' + formatNumber(computeDeltaUnified(0, 'save_count')) + ' 24h' : ''"></span>
          </div>
          <div class="text-xl font-bold font-mono text-emerald-700 mt-1.5" x-text="formatNumber(peakSaves())"></div>
          <div class="text-[10px] text-slate-400 font-mono mt-0.5">Authentic Saves</div>
        </div>

        <div class="bg-white border border-slate-200 rounded-xl p-3.5 flex flex-col justify-between shadow-2xs">
          <div class="text-[11px] font-mono text-slate-500 flex items-center justify-between">
            <span>Total Repins</span>
            <span class="text-pink-700 text-[10px] font-semibold" x-text="computeDeltaUnified(0, 'repin_count') > 0 ? '+' + formatNumber(computeDeltaUnified(0, 'repin_count')) + ' 24h' : ''"></span>
          </div>
          <div class="text-xl font-bold font-mono text-pink-700 mt-1.5" x-text="formatNumber(peakRepins())"></div>
          <div class="text-[10px] text-slate-400 font-mono mt-0.5">Viral Shares</div>
        </div>

        <div class="bg-white border border-slate-200 rounded-xl p-3.5 flex flex-col justify-between shadow-2xs">
          <div class="text-[11px] font-mono text-slate-500">Daily Velocity</div>
          <div class="text-xl font-bold font-mono text-amber-700 mt-1.5" x-text="'+' + peakVelocity() + '/d'"></div>
          <div class="text-[10px] text-slate-400 font-mono mt-0.5">Saves Acceleration</div>
        </div>

        <div class="bg-white border border-slate-200 rounded-xl p-3.5 flex flex-col justify-between shadow-2xs">
          <div class="text-[11px] font-mono text-slate-500">Best SERP Rank</div>
          <div class="text-xl font-bold font-mono text-blue-700 mt-1.5" x-text="peakRank()"></div>
          <div class="text-[10px] text-slate-400 font-mono mt-0.5">Peak Position</div>
        </div>

        <div class="bg-white border border-slate-200 rounded-xl p-3.5 flex flex-col justify-between shadow-2xs">
          <div class="text-[11px] font-mono text-slate-500">Total Engagement</div>
          <div class="text-xl font-bold font-mono text-purple-700 mt-1.5" x-text="formatNumber(totalEngagementScore())"></div>
          <div class="text-[10px] text-slate-400 font-mono mt-0.5">Comments + Shares</div>
        </div>
      </div>

      <!-- 3. Tabbed Intelligence Workspace (Rankings | Historical Log | Deep Forensics) -->
      <div class="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden flex flex-col">
        
        <!-- Tab Navigation Bar -->
        <div class="border-b border-slate-200 bg-slate-50/70 px-4 pt-3 flex items-center justify-between gap-4">
          <div class="flex items-center gap-2">
            <button 
              @click="activeTab = 'rankings'" 
              :class="activeTab === 'rankings' ? 'border-pink-600 text-pink-600 font-bold bg-white' : 'border-transparent text-slate-600 hover:text-slate-900'"
              class="px-3.5 py-2 rounded-t-lg border-b-2 text-xs font-mono transition-colors flex items-center gap-1.5"
            >
              <span>🎯</span>
              <span>SERP Rankings</span>
              <span class="px-1.5 py-0.2 rounded text-[10px] bg-slate-100 text-slate-600" x-text="dossier?.pillar_2_keywords_context?.ranking_keywords?.length || 0"></span>
            </button>
            <button 
              @click="activeTab = 'history'" 
              :class="activeTab === 'history' ? 'border-pink-600 text-pink-600 font-bold bg-white' : 'border-transparent text-slate-600 hover:text-slate-900'"
              class="px-3.5 py-2 rounded-t-lg border-b-2 text-xs font-mono transition-colors flex items-center gap-1.5"
            >
              <span>⏱️</span>
              <span>Historical Snapshot Log</span>
              <span class="px-1.5 py-0.2 rounded text-[10px] bg-slate-100 text-slate-600" x-text="filteredDays().length"></span>
            </button>
            <button 
              @click="activeTab = 'forensics'" 
              :class="activeTab === 'forensics' ? 'border-pink-600 text-pink-600 font-bold bg-white' : 'border-transparent text-slate-600 hover:text-slate-900'"
              class="px-3.5 py-2 rounded-t-lg border-b-2 text-xs font-mono transition-colors flex items-center gap-1.5"
            >
              <span>🧬</span>
              <span>Algorithmic Forensics</span>
            </button>
          </div>

          <!-- Quick Related Pins Radar Action -->
          <a 
            :href="dossier?.pillar_3_related_pins_context?.radar_url || '/api/keywords/visual-search?pin_id=' + pinId" 
            target="_blank" 
            class="text-[11px] font-mono text-pink-600 hover:underline flex items-center gap-1 pb-1 hidden sm:flex"
          >
            <span>Related Radar ↗</span>
          </a>
        </div>

        <!-- TAB 1: KEYWORD SERP RANKINGS -->
        <div x-show="activeTab === 'rankings'" class="p-5 flex flex-col gap-4">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-slate-900 font-mono">Monitored Keywords for this Pin</span>
            <a href="/keywords" class="text-xs text-emerald-700 hover:underline font-mono">Open Keywords Radar →</a>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <template x-for="kw in (dossier?.pillar_2_keywords_context?.ranking_keywords || [])" :key="kw.keyword_id || kw.keyword">
              <a 
                :href="'/keywords/' + encodeURIComponent(kw.keyword)" 
                target="_blank" 
                class="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200 hover:border-pink-300 transition-colors shadow-2xs group"
              >
                <div class="flex flex-col gap-0.5 overflow-hidden">
                  <span class="text-xs font-bold text-slate-900 group-hover:text-pink-600 transition-colors truncate" x-text="kw.keyword"></span>
                  <span class="text-[10px] font-mono text-slate-500" x-text="'Velocity: +' + (kw.velocity || 0) + '/d'"></span>
                </div>
                <div>
                  <template x-if="!kw.is_displaced && kw.rank">
                    <span class="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono font-bold text-xs" x-text="'#' + kw.rank"></span>
                  </template>
                  <template x-if="kw.is_displaced">
                    <span class="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 font-mono font-semibold text-xs" x-text="'[Vault #' + (kw.catalog_rank || 101) + ']'"></span>
                  </template>
                </div>
              </a>
            </template>
          </div>

          <div x-show="!dossier?.pillar_2_keywords_context?.ranking_keywords?.length" class="p-8 text-center text-slate-400 font-mono text-xs">
            No active keyword SERP rankings recorded for this pin.
          </div>
        </div>

        <!-- TAB 2: HISTORICAL SNAPSHOT LOG (STITCH HIGH-DENSITY MASTER-DETAIL & TRAJECTORY MATRIX) -->
        <div x-show="activeTab === 'history'" class="p-5 flex flex-col gap-4">
          <!-- Control Ribbon -->
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
            <!-- Left: Snapshot Count & Controls -->
            <div class="flex flex-wrap items-center gap-2">
              <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-100 text-slate-800 text-xs font-semibold">
                <span>📅</span>
                <template x-if="selectedKeywordFilter === 'ALL'">
                  <span x-text="(dossier?.daily_trajectory?.length || 0) + ' Daily Snapshots'"></span>
                </template>
                <template x-if="selectedKeywordFilter !== 'ALL'">
                  <span x-text="'Showing ' + filteredDays().length + ' of ' + (dossier?.daily_trajectory?.length || 0) + ' Days'"></span>
                </template>
              </div>

              <!-- Keyword Filter Indicator Pill (if filtered) -->
              <template x-if="selectedKeywordFilter !== 'ALL'">
                <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-pink-50 text-pink-700 border border-pink-200 text-xs font-medium">
                  <span class="text-pink-400 font-normal">Keyword:</span>
                  <span class="font-semibold" x-text="selectedKeywordFilter"></span>
                  <button @click="selectedKeywordFilter = 'ALL'" class="hover:text-pink-900 font-bold ml-1 text-slate-400 hover:text-slate-700" title="Clear filter">✕</button>
                </span>
              </template>

              <!-- Expand / Collapse All Icon Buttons -->
              <div class="inline-flex items-center rounded-lg border border-slate-200 bg-white p-0.5 shadow-2xs">
                <button 
                  @click="expandAllDays()" 
                  class="px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-50 rounded-md transition-colors flex items-center gap-1.5"
                  title="Expand all daily accordions"
                >
                  <span class="text-xs">⊞</span>
                  <span>Expand All</span>
                </button>
                <div class="w-px h-3.5 bg-slate-200"></div>
                <button 
                  @click="collapseAllDays()" 
                  class="px-2.5 py-1 text-[11px] font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-50 rounded-md transition-colors flex items-center gap-1.5"
                  title="Collapse all daily accordions"
                >
                  <span class="text-xs">⊟</span>
                  <span>Collapse All</span>
                </button>
              </div>

              <!-- Shard Cold-Start Warning / Refresh Pill -->
              <template x-if="dossier?.is_degraded || (dossier?.daily_trajectory?.length <= 2 && (dossier?.pillar_2_keywords_context?.ranking_keywords?.length || 0) > 1 && !dossier?.from_shard_snapshots)">
                <button 
                  @click="loadDossier(true)" 
                  class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-[11px] font-medium transition-colors"
                  :class="loading ? 'cursor-wait opacity-90' : 'animate-pulse'"
                  title="Click to fetch complete history from warmed storage shard"
                >
                  <span class="w-1.5 h-1.5 rounded-full bg-amber-500" :class="loading ? 'animate-ping' : ''"></span>
                  <span x-show="!loading">Syncing from Shard (Click to load full history)</span>
                  <span x-show="loading" class="flex items-center gap-1">
                    <span class="animate-spin text-xs">⏳</span>
                    <span>Waking Shard &amp; Syncing History...</span>
                  </span>
                </button>
              </template>
            </div>

            <!-- Right: View Switcher & Keyword Filter Ribbon -->
            <div class="flex items-center gap-3">
              <!-- Segmented View Mode -->
              <div class="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs font-medium">
                <button 
                  @click="historyViewMode = 'ledger'" 
                  :class="historyViewMode === 'ledger' ? 'bg-white text-slate-900 font-bold shadow-2xs' : 'text-slate-600 hover:text-slate-900'" 
                  class="px-3 py-1 rounded-md transition-all flex items-center gap-1.5"
                >
                  <span>📑</span>
                  <span>Daily Ledger</span>
                </button>
                <button 
                  @click="historyViewMode = 'matrix'" 
                  :class="historyViewMode === 'matrix' ? 'bg-white text-slate-900 font-bold shadow-2xs' : 'text-slate-600 hover:text-slate-900'" 
                  class="px-3 py-1 rounded-md transition-all flex items-center gap-1.5"
                >
                  <span>📊</span>
                  <span>SERP Matrix</span>
                </button>
              </div>

              <!-- Filter Dropdown -->
              <div class="flex items-center gap-1.5">
                <div class="relative">
                  <select 
                    x-model="selectedKeywordFilter" 
                    class="appearance-none pl-3 pr-8 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-800 text-xs font-medium shadow-2xs focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500"
                  >
                    <option value="ALL">All Keywords &amp; Days (<span x-text="dossier?.daily_trajectory?.length || 0"></span>)</option>
                    <template x-for="kw in uniqueKeywords()" :key="kw.name">
                      <option :value="kw.name" x-text="kw.name + ' (' + kw.count + 'd)'"></option>
                    </template>
                  </select>
                  <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
                  </div>
                </div>
                <button 
                  x-show="selectedKeywordFilter !== 'ALL'" 
                  @click="selectedKeywordFilter = 'ALL'" 
                  class="p-1 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 text-xs" 
                  title="Clear Keyword Filter"
                >✕</button>
              </div>
            </div>
          </div>

          <!-- Banner when keyword filter hides other days -->
          <div 
            x-show="selectedKeywordFilter !== 'ALL' && filteredDays().length < (dossier?.daily_trajectory?.length || 0)" 
            class="flex items-center justify-between px-3.5 py-2 bg-sky-50 border border-sky-200/80 rounded-lg text-xs text-sky-800"
          >
            <div class="flex items-center gap-2">
              <span>🔍</span>
              <span>
                Filtered by <strong class="text-sky-950 font-bold">"<span x-text="selectedKeywordFilter"></span>"</strong>. 
                <span x-text="((dossier?.daily_trajectory?.length || 0) - filteredDays().length) + ' other historical day(s) exist for this pin.'"></span>
              </span>
            </div>
            <button 
              @click="selectedKeywordFilter = 'ALL'" 
              class="px-2.5 py-1 bg-white hover:bg-sky-100 text-sky-700 border border-sky-300 rounded-md font-semibold transition-colors text-[11px]"
            >
              Show All Days (Full History) →
            </button>
          </div>

          <!-- VIEW 1: CHRONOLOGICAL DAILY LEDGER (MASTER-DETAIL ACCORDION) -->
          <div x-show="historyViewMode === 'ledger'" class="overflow-x-auto rounded-xl border border-slate-200 shadow-2xs bg-white">
            <table class="w-full text-left text-xs border-collapse table-fixed">
              <colgroup>
                <col class="w-10">
                <col class="w-44">
                <col class="w-32">
                <col class="w-24">
                <col class="w-28">
                <col class="w-24">
                <col class="w-auto">
                <col class="w-32">
              </colgroup>
              <thead>
                <tr class="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px] font-semibold border-b border-slate-200 h-9">
                  <th class="px-2 text-center"></th>
                  <th class="py-2 px-3 font-semibold text-slate-600">Date</th>
                  <th class="py-2 px-3 font-semibold text-right text-slate-600">Total Saves</th>
                  <th class="py-2 px-3 font-semibold text-right text-slate-600">Repins</th>
                  <th class="py-2 px-3 font-semibold text-right text-slate-600">Velocity</th>
                  <th class="py-2 px-3 font-semibold text-center text-slate-600">Peak Rank</th>
                  <th class="py-2 px-3 font-semibold text-slate-600">SERP Coverage</th>
                  <th class="py-2 px-3 font-semibold text-right pr-4 text-slate-600">Actions</th>
                </tr>
              </thead>
              <template x-for="(day, idx) in filteredDays()" :key="day.snapshot_date">
                <!-- Each Day gets its own semantic tbody to allow multi-tr rendering in Alpine -->
                <tbody class="border-b border-slate-200 bg-white divide-y divide-slate-100">
                  <!-- Master Day Row -->
                  <tr class="hover:bg-slate-50/80 transition-colors group cursor-pointer" @click="toggleDayExpanded(day.snapshot_date)">
                    <!-- Expand chevron -->
                    <td class="px-2 text-center text-slate-400 group-hover:text-pink-600 transition-colors">
                      <span class="inline-block transition-transform duration-200 text-[10px]" :class="isDayExpanded(day.snapshot_date) ? 'rotate-90 text-pink-600 font-bold' : ''">▶</span>
                    </td>
                    <!-- Date & time stacked -->
                    <td class="py-2 px-3">
                      <div class="flex flex-col">
                        <span class="font-bold text-slate-900 text-xs" x-text="day.snapshot_date"></span>
                        <span class="text-[10px] text-slate-400 font-mono mt-0.5" :title="formatLocalTime(day.crawled_at || day.updated_at)" x-text="formatDateTime(day.crawled_at || day.updated_at)"></span>
                      </div>
                    </td>
                    <!-- Saves + 24h delta stacked -->
                    <td class="py-2 px-3 text-right">
                      <div class="flex flex-col items-end">
                        <span class="font-bold text-slate-900 text-xs font-mono" x-text="formatNumber(day.save_count)"></span>
                        <template x-if="computeDeltaByDate(day.snapshot_date, 'save_count') > 0">
                          <span 
                            class="inline-flex items-center text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200/60 mt-0.5" 
                            x-text="'+' + formatNumber(computeDeltaByDate(day.snapshot_date, 'save_count')) + ' (24h)'"
                          ></span>
                        </template>
                        <template x-if="computeDeltaByDate(day.snapshot_date, 'save_count') < 0">
                          <span 
                            class="inline-flex items-center text-[10px] font-semibold text-rose-700 bg-rose-50 px-1.5 py-0.2 rounded border border-rose-200/60 mt-0.5" 
                            x-text="formatNumber(computeDeltaByDate(day.snapshot_date, 'save_count')) + ' (24h)'"
                          ></span>
                        </template>
                        <template x-if="computeDeltaByDate(day.snapshot_date, 'save_count') === 0">
                          <span class="text-[10px] text-slate-400 font-mono mt-0.5">+0 (24h)</span>
                        </template>
                      </div>
                    </td>
                    <!-- Repins + delta stacked -->
                    <td class="py-2 px-3 text-right">
                      <div class="flex flex-col items-end">
                        <span class="font-semibold text-slate-800 text-xs font-mono" x-text="formatNumber(day.repin_count)"></span>
                        <template x-if="computeDeltaByDate(day.snapshot_date, 'repin_count') > 0">
                          <span 
                            class="inline-flex items-center text-[10px] font-semibold text-pink-700 bg-pink-50 px-1.5 py-0.2 rounded border border-pink-200/60 mt-0.5" 
                            x-text="'+' + formatNumber(computeDeltaByDate(day.snapshot_date, 'repin_count'))"
                          ></span>
                        </template>
                      </div>
                    </td>
                    <!-- Velocity -->
                    <td class="py-2 px-3 text-right">
                      <span class="inline-flex items-center px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-bold font-mono" x-text="'+' + (day.daily_save_velocity || 0) + '/d'"></span>
                    </td>
                    <!-- Peak Rank -->
                    <td class="py-2 px-3 text-center">
                      <template x-if="day.best_rank && day.best_rank !== 999">
                        <span class="inline-flex items-center justify-center min-w-[32px] px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold font-mono" x-text="'#' + day.best_rank"></span>
                      </template>
                      <template x-if="!day.best_rank || day.best_rank === 999">
                        <span class="text-slate-400 text-xs font-mono">--</span>
                      </template>
                    </td>
                    <!-- Keyword Health / Targeted Keyword -->
                    <td class="py-2 px-3">
                      <!-- Default Mode: Summary Health Badges -->
                      <template x-if="selectedKeywordFilter === 'ALL'">
                        <div class="flex items-center gap-1.5 flex-wrap">
                          <template x-if="dayKeywordSummary(day).top3 > 0">
                            <span class="inline-flex items-center px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200/80 text-[10px] font-semibold" x-text="dayKeywordSummary(day).top3 + ' Top 3'"></span>
                          </template>
                          <template x-if="dayKeywordSummary(day).top10 > 0">
                            <span class="inline-flex items-center px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 border border-sky-200/80 text-[10px] font-medium" x-text="dayKeywordSummary(day).top10 + ' Top 10'"></span>
                          </template>
                          <template x-if="dayKeywordSummary(day).vault > 0">
                            <span class="inline-flex items-center px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200/80 text-[10px]" x-text="dayKeywordSummary(day).vault + ' Vault'"></span>
                          </template>
                          <span class="text-[11px] text-slate-500 font-medium ml-0.5" x-text="'(' + dayKeywordSummary(day).total + ' kws)'"></span>
                        </div>
                      </template>
                      <!-- Filtered Mode: Show targeted keyword badge directly -->
                      <template x-if="selectedKeywordFilter !== 'ALL'">
                        <div class="flex items-center gap-1.5">
                          <template x-for="kw in getSpecificKeywordForDay(day, selectedKeywordFilter)" :key="kw.keyword">
                            <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-medium border" :class="kw.is_displaced ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'">
                              <span class="font-bold font-mono" x-text="kw.rank ? ('#' + kw.rank) : 'Unranked'"></span>
                              <span x-text="kw.keyword"></span>
                            </span>
                          </template>
                        </div>
                      </template>
                    </td>
                    <!-- Action Buttons -->
                    <td class="py-2 px-3 text-right pr-4" @click.stop>
                      <div class="flex items-center justify-end gap-1.5">
                        <button 
                          @click="toggleDayExpanded(day.snapshot_date)" 
                          class="px-2.5 py-1 rounded-lg font-medium text-[11px] transition-all flex items-center gap-1.5 border"
                          :class="isDayExpanded(day.snapshot_date) ? 'bg-pink-50 text-pink-700 font-semibold border-pink-200 shadow-2xs' : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'"
                        >
                          <span x-text="isDayExpanded(day.snapshot_date) ? 'Close' : 'View ' + (day.ranking_keywords?.length || 0)"></span>
                          <span class="text-[9px]" x-text="isDayExpanded(day.snapshot_date) ? '▲' : '▼'"></span>
                        </button>
                        <button 
                          @click="requestDeleteDay(day.snapshot_date)" 
                          class="p-1.5 rounded-lg border border-transparent hover:border-red-200 hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"
                          title="Delete telemetry for this day"
                        >
                          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>

                  <!-- ACCORDION SUB-DRAWER: EXPANDED KEYWORDS TABLE -->
                  <tr x-show="isDayExpanded(day.snapshot_date)" class="bg-slate-50/70 border-t border-slate-200">
                    <td colspan="8" class="p-3 sm:p-4">
                      <div class="flex flex-col gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                        <!-- Drawer Controls Ribbon -->
                        <div class="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                          <!-- Category Filter Pills -->
                          <div class="flex flex-wrap items-center gap-1.5 text-xs">
                            <span class="text-slate-400 text-[11px] font-medium mr-1">Ranks:</span>
                            <button 
                              @click="drawerCategoryFilter = 'ALL'" 
                              :class="drawerCategoryFilter === 'ALL' ? 'bg-slate-900 text-white font-semibold shadow-2xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'" 
                              class="px-2.5 py-1 rounded-lg text-[11px] transition-colors"
                            >
                              All (<span x-text="day.ranking_keywords?.length || 0"></span>)
                            </button>
                            <button 
                              @click="drawerCategoryFilter = 'TOP3'" 
                              :class="drawerCategoryFilter === 'TOP3' ? 'bg-emerald-600 text-white font-semibold shadow-2xs' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200/60'" 
                              class="px-2.5 py-1 rounded-lg text-[11px] transition-colors"
                            >
                              Top 3 (<span x-text="dayKeywordSummary(day).top3"></span>)
                            </button>
                            <button 
                              @click="drawerCategoryFilter = 'TOP10'" 
                              :class="drawerCategoryFilter === 'TOP10' ? 'bg-sky-600 text-white font-semibold shadow-2xs' : 'bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200/60'" 
                              class="px-2.5 py-1 rounded-lg text-[11px] transition-colors"
                            >
                              Ranks 4-10 (<span x-text="dayKeywordSummary(day).top10"></span>)
                            </button>
                            <button 
                              @click="drawerCategoryFilter = 'VAULT'" 
                              :class="drawerCategoryFilter === 'VAULT' ? 'bg-amber-600 text-white font-semibold shadow-2xs' : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200/60'" 
                              class="px-2.5 py-1 rounded-lg text-[11px] transition-colors"
                            >
                              Displaced / Vault (<span x-text="dayKeywordSummary(day).vault"></span>)
                            </button>
                          </div>

                          <!-- Search Input & Direct Links -->
                          <div class="flex items-center gap-2.5">
                            <div class="relative">
                              <input 
                                type="text" 
                                x-model="searchKeywordInput" 
                                placeholder="Filter keyword..." 
                                class="pl-7 pr-3 py-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-pink-500 w-40 sm:w-52"
                              />
                              <span class="absolute inset-y-0 left-0 flex items-center pl-2 text-slate-400 text-xs pointer-events-none">🔍</span>
                            </div>
                            <a :href="'/keywords'" class="text-xs text-pink-600 hover:text-pink-700 font-medium hover:underline flex items-center gap-1 hidden sm:inline-flex">
                              <span>Keywords Fleet</span>
                              <span>→</span>
                            </a>
                          </div>
                        </div>

                        <!-- High-Density Sub-Table -->
                        <div class="overflow-x-auto rounded-lg border border-slate-200/80">
                          <table class="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr class="bg-slate-50 text-slate-500 text-[10px] uppercase font-semibold tracking-wider border-b border-slate-200/80 h-8">
                                <th class="py-2 px-3 font-semibold">Target Keyword</th>
                                <th class="py-2 px-3 font-semibold text-center w-36">SERP Position</th>
                                <th class="py-2 px-3 font-semibold text-right w-36">Attributed Saves</th>
                                <th class="py-2 px-3 font-semibold text-right w-32">Daily Velocity</th>
                                <th class="py-2 px-3 font-semibold text-right pr-4 w-24">Action</th>
                              </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100 bg-white">
                              <template x-for="kw in filteredKeywordsForDay(day)" :key="kw.keyword_id || kw.keyword">
                                <tr class="hover:bg-slate-50/70 transition-colors h-8">
                                  <!-- Keyword link -->
                                  <td class="py-2 px-3 font-medium">
                                    <a :href="'/keywords/' + encodeURIComponent(kw.keyword)" target="_blank" class="text-slate-900 hover:text-pink-600 transition-colors inline-flex items-center gap-2">
                                      <span class="w-1.5 h-1.5 rounded-full" :class="kw.is_displaced ? 'bg-amber-500' : 'bg-emerald-500'"></span>
                                      <span class="font-medium" x-text="kw.keyword"></span>
                                      <span class="text-[10px] text-slate-400 font-mono">↗</span>
                                    </a>
                                  </td>
                                  <!-- Rank + Movement -->
                                  <td class="py-2 px-3 text-center whitespace-nowrap">
                                    <template x-if="kw.rank && !kw.is_displaced">
                                      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-[11px] font-mono">
                                        <span x-text="'#' + kw.rank"></span>
                                        <template x-if="keywordRankMovement(day.snapshot_date, kw).status === 'up'">
                                          <span class="text-[9px] text-emerald-800 font-bold" x-text="'▲ ' + keywordRankMovement(day.snapshot_date, kw).delta"></span>
                                        </template>
                                        <template x-if="keywordRankMovement(day.snapshot_date, kw).status === 'down'">
                                          <span class="text-[9px] text-rose-700 font-bold" x-text="'▼ ' + keywordRankMovement(day.snapshot_date, kw).delta"></span>
                                        </template>
                                        <template x-if="keywordRankMovement(day.snapshot_date, kw).status === 'new'">
                                          <span class="text-[9px] text-sky-700 font-medium">NEW</span>
                                        </template>
                                      </span>
                                    </template>
                                    <template x-if="kw.is_displaced">
                                      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 font-semibold text-[11px] font-mono" x-text="'[Vault #' + (kw.rank || 101) + ']'"></span>
                                    </template>
                                  </td>
                                  <!-- Attributed saves -->
                                  <td class="py-2 px-3 text-right text-emerald-700 font-bold font-mono whitespace-nowrap" x-text="formatNumber(kw.saves || day.save_count)"></td>
                                  <!-- Velocity -->
                                  <td class="py-2 px-3 text-right text-amber-800 font-semibold font-mono whitespace-nowrap" x-text="'+' + (kw.velocity || day.daily_save_velocity || 0) + '/d'"></td>
                                  <!-- Remove rank badge button -->
                                  <td class="py-2 px-3 text-right pr-4 whitespace-nowrap">
                                    <button 
                                      @click.stop="requestDeleteSerpBadge(kw, day.snapshot_date)" 
                                      class="p-1 rounded-md hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors inline-flex items-center" 
                                      title="Remove rank for this keyword on this date"
                                    >
                                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                      </svg>
                                    </button>
                                  </td>
                                </tr>
                              </template>
                              <tr x-show="!filteredKeywordsForDay(day).length">
                                <td colspan="5" class="py-6 px-4 text-center text-slate-400 text-xs">
                                  No keywords match the selected rank filter or search query.
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </template>
              <tbody x-show="!filteredDays().length" class="bg-white">
                <tr>
                  <td colspan="8" class="p-8 text-center text-slate-400 font-mono text-xs">
                    No telemetry records match the selected SERP filter.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- VIEW 2: SERP TRAJECTORY MATRIX (HEATMAP VIEW) -->
          <div x-show="historyViewMode === 'matrix'" class="overflow-x-auto rounded-xl border border-slate-200 shadow-2xs bg-white">
            <table class="w-full text-left text-xs font-mono border-collapse">
              <thead>
                <tr class="bg-slate-50 text-slate-700 border-b border-slate-200 h-9">
                  <th class="p-2.5 font-semibold sticky left-0 bg-slate-50 border-r border-slate-200 z-10 min-w-[240px]">
                    Monitored Keyword (<span x-text="getAllMatrixKeywords().length"></span>)
                  </th>
                  <template x-for="day in filteredDays()" :key="day.snapshot_date">
                    <th class="p-2.5 font-semibold text-center whitespace-nowrap min-w-[100px]" x-text="day.snapshot_date"></th>
                  </template>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                <template x-for="kwItem in getAllMatrixKeywords()" :key="kwItem.keyword">
                  <tr class="hover:bg-slate-50/80 transition-colors h-8">
                    <!-- Sticky keyword column (full text without truncation) -->
                    <td class="p-2.5 font-semibold sticky left-0 bg-white group-hover:bg-slate-50 border-r border-slate-100 z-10 whitespace-nowrap">
                      <a :href="'/keywords/' + encodeURIComponent(kwItem.keyword)" target="_blank" class="text-slate-900 hover:text-pink-600 transition-colors flex items-center gap-1.5">
                        <span class="w-1.5 h-1.5 rounded-full" :class="kwItem.is_displaced ? 'bg-amber-500' : 'bg-emerald-500'"></span>
                        <span class="font-medium text-slate-800" x-text="kwItem.keyword"></span>
                      </a>
                    </td>
                    <!-- Date cells -->
                    <template x-for="day in filteredDays()" :key="day.snapshot_date">
                      <td class="p-2 text-center whitespace-nowrap">
                        <template x-if="getMatrixCell(day, kwItem.keyword)">
                          <div>
                            <template x-if="getMatrixCell(day, kwItem.keyword).rank && !getMatrixCell(day, kwItem.keyword).is_displaced">
                              <span 
                                class="inline-block px-2 py-0.5 rounded text-[11px] font-bold border"
                                :class="getMatrixCell(day, kwItem.keyword).rank <= 3 ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : (getMatrixCell(day, kwItem.keyword).rank <= 10 ? 'bg-sky-100 text-sky-800 border-sky-300' : 'bg-slate-100 text-slate-700 border-slate-200')"
                                x-text="'#' + getMatrixCell(day, kwItem.keyword).rank"
                              ></span>
                            </template>
                            <template x-if="getMatrixCell(day, kwItem.keyword).is_displaced">
                              <span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800 border border-amber-300" x-text="'V #' + (getMatrixCell(day, kwItem.keyword).rank || 101)"></span>
                            </template>
                          </div>
                        </template>
                        <template x-if="!getMatrixCell(day, kwItem.keyword)">
                          <span class="text-slate-300 text-xs">—</span>
                        </template>
                      </td>
                    </template>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
        </div>

        <!-- TAB 3: ALGORITHMIC FORENSICS (Progressive Disclosure) -->
        <div x-show="activeTab === 'forensics'" class="p-5 flex flex-col gap-5">
          
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            <!-- Origin Pinner Card -->
            <div class="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-between gap-3">
              <div class="flex flex-col gap-1.5">
                <span class="text-[10px] font-mono uppercase text-pink-700 font-bold">Origin Pinner</span>
                <div class="flex items-center gap-2.5 mt-1">
                  <img 
                    :src="dossier?.algorithmic_intelligence?.origin_pinner?.image_url || 'https://s.pinimg.com/images/user/default_75.png'" 
                    class="w-9 h-9 rounded-full object-cover border border-slate-300 bg-white"
                    alt="Origin Pinner"
                    referrerpolicy="no-referrer"
                  >
                  <div class="flex flex-col overflow-hidden">
                    <div class="text-xs font-bold text-slate-900 truncate" x-text="dossier?.algorithmic_intelligence?.origin_pinner?.full_name || dossier?.algorithmic_intelligence?.origin_pinner?.username || 'First Uploader'"></div>
                    <div class="text-[11px] text-slate-500 font-mono truncate" x-text="dossier?.algorithmic_intelligence?.origin_pinner?.username ? '@' + dossier?.algorithmic_intelligence?.origin_pinner?.username : 'Original Creator'"></div>
                  </div>
                </div>
              </div>
              <div class="flex items-center justify-between pt-2 border-t border-slate-200 text-[11px] font-mono">
                <span class="text-slate-500">Followers:</span>
                <span class="text-slate-900 font-bold" x-text="formatNumber(dossier?.algorithmic_intelligence?.origin_pinner?.follower_count || 0)"></span>
              </div>
            </div>

            <!-- Publisher & Domain Host -->
            <div class="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-between gap-3">
              <div class="flex flex-col gap-1.5">
                <span class="text-[10px] font-mono uppercase text-blue-700 font-bold">Verified Host Entity</span>
                <div class="text-xs font-bold text-slate-900 truncate mt-1" x-text="dossier?.algorithmic_intelligence?.domain_official_user?.full_name || dossier?.creative?.domain"></div>
                <div class="text-[11px] text-blue-700 font-mono truncate" x-text="dossier?.algorithmic_intelligence?.domain_official_user?.username ? '@' + dossier.algorithmic_intelligence.domain_official_user.username : dossier?.creative?.domain"></div>
              </div>
              <div class="flex items-center justify-between pt-2 border-t border-slate-200 text-[11px] font-mono">
                <span class="text-slate-500">Status:</span>
                <span class="text-blue-700 font-bold" x-text="dossier?.algorithmic_intelligence?.domain_official_user?.is_verified_merchant ? 'Verified Merchant' : 'Verified Web Entity'"></span>
              </div>
            </div>

            <!-- Geometry & Dimensions -->
            <div class="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-between gap-3">
              <div class="flex flex-col gap-1.5">
                <span class="text-[10px] font-mono uppercase text-amber-700 font-bold">Image Geometry</span>
                <div class="text-xs font-mono text-slate-800 mt-1" x-text="dossier?.algorithmic_intelligence?.image_dimensions ? (dossier.algorithmic_intelligence.image_dimensions.width + ' × ' + dossier.algorithmic_intelligence.image_dimensions.height + ' (' + dossier.algorithmic_intelligence.image_dimensions.aspect_ratio + ')') : 'Standard 2:3 Pinterest Ratio'"></div>
                <div class="text-[11px] font-mono text-slate-500">Aspect Precision: 2:3 Standard</div>
              </div>
              <div class="flex items-center justify-between pt-2 border-t border-slate-200 text-[11px] font-mono">
                <span class="text-slate-500">Resolution:</span>
                <span class="text-emerald-700 font-bold">High-Res</span>
              </div>
            </div>

          </div>

          <!-- Algorithmic Semantic Interests -->
          <div class="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col gap-3">
            <div class="flex items-center justify-between border-b border-slate-200 pb-2">
              <span class="text-xs font-mono font-bold text-purple-950 uppercase">Algorithmic Semantic Interests</span>
              <span class="text-xs font-mono text-purple-800 font-semibold px-2 py-0.5 rounded bg-purple-100" x-text="(dossier?.algorithmic_intelligence?.seo_related_interests?.length || 0) + ' Topics'"></span>
            </div>
            <div class="flex items-center gap-2 flex-wrap">
              <template x-for="item in (dossier?.algorithmic_intelligence?.seo_related_interests || [])" :key="item.name">
                <a 
                  :href="item.url ? (item.url.startsWith('http') ? item.url : 'https://www.pinterest.com' + item.url) : '#'" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  class="px-2.5 py-1 rounded-lg bg-white hover:bg-purple-50 text-purple-900 border border-purple-200 text-xs font-mono transition-colors flex items-center gap-1 shadow-2xs"
                >
                  <span>📌</span>
                  <span x-text="item.name"></span>
                </a>
              </template>
              <div x-show="!dossier?.algorithmic_intelligence?.seo_related_interests?.length" class="text-xs font-mono text-slate-400 italic">
                No semantic topic clusters recorded for this pin.
              </div>
            </div>
          </div>

          <!-- Rich Web Entity & Google SEO Snippet -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col gap-2">
              <span class="text-[10px] font-mono uppercase text-emerald-800 font-bold">Rich Web Entity</span>
              <div class="text-xs font-bold text-slate-900" x-text="dossier?.algorithmic_intelligence?.rich_metadata?.title || dossier?.creative?.title"></div>
              <p class="text-[11px] text-slate-600 leading-relaxed" x-text="dossier?.algorithmic_intelligence?.rich_metadata?.description || dossier?.creative?.description"></p>
            </div>

            <div class="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col gap-2">
              <span class="text-[10px] font-mono uppercase text-pink-800 font-bold">Injected Google SEO Snippet</span>
              <div class="text-xs font-mono text-pink-900 font-medium" x-text="dossier?.algorithmic_intelligence?.seo_title || dossier?.creative?.title"></div>
              <p class="text-[11px] font-mono text-slate-600 leading-relaxed" x-text="dossier?.algorithmic_intelligence?.seo_description || 'Standard Snippet'"></p>
            </div>
          </div>

        </div>

      </div>

    </div>

  </main>

  <!-- Delete Confirmation Modal -->
  <div x-show="deleteModalOpen" class="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4" x-cloak>
    <div @click.away="deleteModalOpen = false" class="bg-white border border-slate-200 rounded-2xl max-w-sm w-full p-6 shadow-xl flex flex-col gap-4">
      <div class="flex items-center gap-3 text-red-600">
        <span class="text-xl">🗑️</span>
        <h3 class="text-sm font-bold text-slate-900">
          <span x-show="deleteType === 'DAY'">Confirm Delete Day</span>
          <span x-show="deleteType === 'SERP_BADGE'">Remove Keyword Rank</span>
          <span x-show="deleteType === 'SNAPSHOT'">Confirm Snapshot Deletion</span>
        </h3>
      </div>
      <p class="text-xs text-slate-600">
        <template x-if="deleteType === 'DAY'">
          <span>Are you sure you want to permanently delete all metrics and SERP rankings for <strong class="text-slate-900" x-text="itemToDelete?.date"></strong>? This will remove the record from Shard <span class="font-mono text-emerald-600 font-semibold" x-text="'#' + dossier?.shard_id"></span>.</span>
        </template>
        <template x-if="deleteType === 'SERP_BADGE'">
          <span>Remove keyword ranking for <strong class="text-slate-900" x-text="itemToDelete?.keywordName"></strong> on <strong class="text-slate-900" x-text="itemToDelete?.date"></strong>? Daily metrics will be preserved.</span>
        </template>
        <template x-if="deleteType === 'SNAPSHOT'">
          <span>Delete snapshot <strong class="text-pink-600" x-text="'#' + itemToDelete?.snapshotId"></strong> from Shard <span class="font-mono text-emerald-600 font-semibold" x-text="'#' + dossier?.shard_id"></span>?</span>
        </template>
      </p>
      <div class="flex items-center justify-end gap-3 pt-2">
        <button @click="deleteModalOpen = false" class="px-3.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs">
          Cancel
        </button>
        <button @click="confirmDelete()" :disabled="isDeleting" class="px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-colors">
          <span x-show="!isDeleting">Delete Permanently</span>
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
        _autoRefreshTriggered: false,
        dossier: null,
        activeTab: 'rankings',
        _cachedDateMap: null,
        deleteModalOpen: false,
        deleteType: 'DAY',
        itemToDelete: null,
        snapshotToDelete: null,
        isDeleting: false,
        isSyncing: false,
        selectedKeywordFilter: 'ALL',
        historyViewMode: 'ledger',
        expandedDays: {},
        drawerCategoryFilter: 'ALL',
        searchKeywordInput: '',
        toast: {
          show: false,
          message: '',
          type: 'success'
        },
        toastTimeout: null,
        originKeywordId: null,
        originKeyword: '',
        originFolderId: null,
        originFolderName: '',

        getBackToKeywordUrl() {
          if (!this.originKeyword && !this.originKeywordId) {
            return '/keywords';
          }
          let url = '/keywords?';
          const parts = [];
          if (this.originKeyword) {
            parts.push('q=' + encodeURIComponent(this.originKeyword));
          }
          if (this.originKeywordId) {
            parts.push('keyword_id=' + encodeURIComponent(this.originKeywordId));
          }
          if (this.originFolderId) {
            parts.push('folder_id=' + encodeURIComponent(this.originFolderId));
          }
          return url + parts.join('&');
        },

        async init() {
          if (typeof window !== 'undefined' && window.location && window.location.search) {
            const params = new URLSearchParams(window.location.search);
            this.originKeywordId = params.get('keyword_id');
            this.originKeyword = params.get('keyword') || '';
            this.originFolderId = params.get('folder_id');
            this.originFolderName = params.get('folder') || params.get('folder_name') || '';
            if (this.originFolderId && !this.originFolderName) {
              const fetcher = window.safeApiFetch || fetch;
              fetcher('/api/folders/' + encodeURIComponent(this.originFolderId))
                .then(r => (r && r.ok ? r.json() : null))
                .then(data => {
                  if (data?.folder?.name) this.originFolderName = data.folder.name;
                })
                .catch(() => {});
            }
          }

          if (!this.pinId) {
            this.error = 'No Pin ID provided in URL.';
            this.loading = false;
            return;
          }
          await this.loadDossier();

          if (!this.originKeyword) {
            const rankingKws = this.dossier?.pillar_2_keywords_context?.ranking_keywords;
            if (Array.isArray(rankingKws) && rankingKws.length > 0) {
              const firstKw = rankingKws[0];
              this.originKeyword = firstKw.keyword || firstKw.keyword_name || '';
              this.originKeywordId = firstKw.keyword_id || firstKw.id || this.originKeywordId;
            }
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

        async loadDossier(forceRefresh = false) {
          this.loading = true;
          try {
            const qs = forceRefresh ? ('?refresh=true&_ts=' + Date.now()) : ('?_ts=' + Date.now());
            const res = await fetch('/api/pins/' + encodeURIComponent(this.pinId) + qs, {
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
              // Auto-heal cold start: If dossier returned degraded or with incomplete fallback (<= 2 days while having rankings), trigger background refresh with progressive retry
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
                    this.loadDossier(true);
                  }, delayMs);
                }
              } else {
                this._autoRefreshAttempts = 0;
              }
            } else {
              this.dossier = null;
              this._cachedDateMap = null;
              this.isShardWarming = (res.status === 503);
              this.showToast(res.status === 503 ? 'Pin storage shard is warming up from sleep. Please retry in a few seconds.' : 'Pin not found or shard offline.', 'error');
            }
          } catch (e) {
            console.error('Error fetching pin dossier:', e);
            this.dossier = null;
            this._cachedDateMap = null;
            this.isShardWarming = false;
            this.showToast(e?.name === 'TimeoutError' ? 'Request timed out — storage shard may be warming up' : 'Network error loading pin dossier', 'error');
          } finally {
            this.loading = false;
          }
        },

        safeColor(c) {
          if (!c) return '#888888';
          const s = String(c).trim();
          if (/^#([0-9a-fA-F]{3,8})$/.test(s) || /^[a-zA-Z]{3,20}$/.test(s)) {
            return s;
          }
          return '#888888';
        },

        safeUrl(url) {
          if (!url) return '#';
          const s = String(url).trim();
          if (/^https?:\\/\\//i.test(s) || s.startsWith('/')) return s;
          return '#';
        },

        formatDate(isoStr) {
          if (!isoStr) return null;
          try {
            const d = new Date(isoStr);
            if (isNaN(d.getTime())) return String(isoStr).slice(0, 10);
            return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
          } catch (_) { return String(isoStr).slice(0, 10); }
        },

        formatDateTime(isoStr) {
          if (!isoStr) return '';
          try {
            const d = new Date(isoStr);
            if (isNaN(d.getTime())) return '';
            const hours = d.getUTCHours();
            const minutes = String(d.getUTCMinutes()).padStart(2, '0');
            const ampm = hours >= 12 ? 'PM' : 'AM';
            const h12 = hours % 12 || 12;
            const timeStr = String(h12).padStart(2, '0') + ':' + minutes + ' ' + ampm + ' UTC';

            const diffMs = Date.now() - d.getTime();
            const diffHours = Math.round(diffMs / (1000 * 60 * 60));
            if (diffHours >= 0 && diffHours < 48) {
              const relStr = diffHours === 0 ? 'just now' : (diffHours + 'h ago');
              return timeStr + ' (' + relStr + ')';
            }
            return timeStr;
          } catch (_) { return ''; }
        },

        formatLocalTime(isoStr) {
          if (!isoStr) return '';
          try {
            const d = new Date(isoStr);
            if (isNaN(d.getTime())) return '';
            return 'Local Time: ' + d.toLocaleString();
          } catch (_) { return ''; }
        },

        formatAge(isoStr) {
          if (!isoStr) return '';
          try {
            const d = new Date(isoStr);
            const diffDays = Math.round((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays > 0) return '(' + diffDays + 'd ago)';
            return '(today)';
          } catch (_) { return ''; }
        },

        copyUrl(url) {
          if (!url) {
            this.showToast('No URL available to copy', 'error');
            return;
          }
          if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            navigator.clipboard.writeText(url)
              .then(() => this.showToast('Destination URL copied to clipboard!'))
              .catch(() => this.showToast('Failed to copy URL', 'error'));
          } else {
            this.showToast('Clipboard API not available in this environment', 'error');
          }
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

        historicalTags() {
          const list = this.dossier?.creative?.visual_annotations_detailed;
          if (Array.isArray(list) && list.length > 0) {
            return list.filter(t => !t.is_live);
          }
          return [];
        },

        latestSnapshot() {
          return this.dossier?.snapshots?.[0] || null;
        },

        peakSaves() {
          const dtSaves = this.dossier?.daily_trajectory?.[0]?.save_count;
          const snapSaves = this.latestSnapshot()?.save_count;
          const crSaves = this.dossier?.creative?.save_count;
          return Math.max(Number(dtSaves || 0), Number(snapSaves || 0), Number(crSaves || 0));
        },

        peakRepins() {
          const dtRepins = this.dossier?.daily_trajectory?.[0]?.repin_count;
          const snapRepins = this.latestSnapshot()?.repin_count;
          const crRepins = this.dossier?.creative?.repin_count;
          return Math.max(Number(dtRepins || 0), Number(snapRepins || 0), Number(crRepins || 0));
        },

        peakVelocity() {
          const dtVel = this.dossier?.daily_trajectory?.[0]?.daily_save_velocity;
          const snapVel = this.latestSnapshot()?.daily_save_velocity;
          const crVel = this.dossier?.creative?.daily_save_velocity;
          return Math.max(Number(dtVel || 0), Number(snapVel || 0), Number(crVel || 0));
        },

        peakRank() {
          const trRank = this.dossier?.daily_trajectory?.[0]?.best_rank;
          if (trRank && trRank !== 999) return '#' + trRank;
          const kwRank = this.dossier?.pillar_2_keywords_context?.highest_rank;
          if (kwRank && kwRank !== 999) return '#' + kwRank;
          return 'Top 50';
        },

        rebuildDateMapCache() {
          const map = new Map();
          const traj = (this.dossier?.daily_trajectory && this.dossier.daily_trajectory.length > 0)
            ? this.dossier.daily_trajectory
            : this.synthesizeDailyTrajectoryFromSnapshots();

          for (let i = 0; i < traj.length; i++) {
            const curr = traj[i];
            const prev = traj[i + 1] || null;
            const dateKey = curr.snapshot_date;
            if (!dateKey) continue;
            // If prior day exists, calculate delta. If single crawl baseline, use daily_save_velocity
            const deltaSaves = prev ? (Number(curr.save_count || 0) - Number(prev.save_count || 0)) : Number(curr.daily_save_velocity || 0);
            const deltaRepins = prev ? (Number(curr.repin_count || 0) - Number(prev.repin_count || 0)) : 0;
            map.set(dateKey, {
              current: curr,
              previous: prev,
              deltaSaves,
              deltaRepins
            });
          }
          this._cachedDateMap = map;
        },

        computeDeltaByDate(snapshotDate, field = 'save_count') {
          if (!this._cachedDateMap) {
            this.rebuildDateMapCache();
          }
          const entry = this._cachedDateMap?.get(snapshotDate);
          if (!entry) return 0;
          if (field === 'save_count') return entry.deltaSaves;
          if (field === 'repin_count') return entry.deltaRepins;
          if (!entry.previous) return 0;
          return (Number(entry.current?.[field] || 0) - Number(entry.previous?.[field] || 0));
        },

        filteredDays() {
          const list = (this.dossier?.daily_trajectory && this.dossier.daily_trajectory.length > 0)
            ? this.dossier.daily_trajectory
            : this.synthesizeDailyTrajectoryFromSnapshots();
          if (this.selectedKeywordFilter === 'ALL') return list;
          return list.filter(d => 
            Array.isArray(d.ranking_keywords) && 
            d.ranking_keywords.some(k => k.keyword === this.selectedKeywordFilter)
          );
        },

        synthesizeDailyTrajectoryFromSnapshots() {
          const snaps = this.dossier?.snapshots || [];
          const map = new Map();
          for (const s of snaps) {
            const date = s.snapshot_date;
            if (!date) continue;
            const crawlTs = s.crawled_at || s.updated_at || s.created_at || (date + 'T00:00:00Z');
            if (!map.has(date)) {
              map.set(date, {
                snapshot_date: date,
                save_count: Number(s.save_count || 0),
                repin_count: Number(s.repin_count || 0),
                comment_count: Number(s.comment_count || 0),
                share_count: Number(s.share_count || 0),
                reaction_count: Number(s.reaction_count || 0),
                daily_save_velocity: Number(s.daily_save_velocity || 0),
                best_rank: (s.rank_position && s.rank_position > 0) ? s.rank_position : 999,
                ranking_keywords: [],
                crawled_at: crawlTs,
                updated_at: s.updated_at || crawlTs
              });
            }
            const d = map.get(date);
            if (crawlTs && (!d.crawled_at || new Date(crawlTs).getTime() > new Date(d.crawled_at).getTime())) {
              d.crawled_at = crawlTs;
              d.updated_at = s.updated_at || crawlTs;
            }
            d.save_count = Math.max(d.save_count, Number(s.save_count || 0));
            d.repin_count = Math.max(d.repin_count, Number(s.repin_count || 0));
            d.comment_count = Math.max(d.comment_count, Number(s.comment_count || 0));
            d.daily_save_velocity = Math.max(d.daily_save_velocity, Number(s.daily_save_velocity) || 0);
            const effRank = s.rank_position || s.last_known_rank || null;
            if (effRank && effRank > 0) {
              d.best_rank = Math.min(d.best_rank, effRank);
            }
            if (s.keyword_name) {
              d.ranking_keywords.push({
                keyword_id: s.keyword_id,
                keyword: s.keyword_name,
                rank: effRank,
                rank_position: s.rank_position || null,
                last_known_rank: s.last_known_rank || null,
                is_displaced: Boolean(s.is_displaced),
                saves: Number(s.save_count || 0)
              });
            }
          }
          return Array.from(map.values()).sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date));
        },

        uniqueKeywords() {
          const traj = this.dossier?.daily_trajectory || [];
          const counts = new Map();
          for (const d of traj) {
            for (const k of (d.ranking_keywords || [])) {
              if (k.keyword) {
                counts.set(k.keyword, (counts.get(k.keyword) || 0) + 1);
              }
            }
          }
          if (counts.size === 0) {
            const pillarKws = this.dossier?.pillar_2_keywords_context?.ranking_keywords || [];
            for (const k of pillarKws) {
              if (k.keyword) {
                counts.set(k.keyword, (counts.get(k.keyword) || 0) + 1);
              }
            }
          }
          if (counts.size === 0) {
            for (const s of (this.dossier?.snapshots || [])) {
              if (s.keyword_name) {
                counts.set(s.keyword_name, (counts.get(s.keyword_name) || 0) + 1);
              }
            }
          }
          return Array.from(counts.entries()).map(([name, count]) => ({ name, count }));
        },

        computeDeltaUnified(currentIdx, field = 'save_count') {
          const traj = (this.dossier?.daily_trajectory && this.dossier.daily_trajectory.length > 0)
            ? this.dossier.daily_trajectory
            : this.synthesizeDailyTrajectoryFromSnapshots();
          if (!traj[currentIdx]) return 0;
          return this.computeDeltaByDate(traj[currentIdx].snapshot_date, field);
        },

        toggleDayExpanded(date) {
          if (!date) return;
          this.expandedDays = Object.assign({}, this.expandedDays, {
            [date]: !this.expandedDays[date]
          });
        },

        isDayExpanded(date) {
          return Boolean(this.expandedDays[date]);
        },

        expandAllDays() {
          const days = this.filteredDays();
          const next = {};
          for (const d of days) {
            if (d.snapshot_date) next[d.snapshot_date] = true;
          }
          this.expandedDays = next;
        },

        collapseAllDays() {
          this.expandedDays = {};
        },

        dayKeywordSummary(day) {
          const kws = Array.isArray(day?.ranking_keywords) ? day.ranking_keywords : [];
          const total = kws.length;
          const top3 = kws.filter(k => !k.is_displaced && k.rank && Number(k.rank) <= 3).length;
          const top10 = kws.filter(k => !k.is_displaced && k.rank && Number(k.rank) > 3 && Number(k.rank) <= 10).length;
          const vault = kws.filter(k => k.is_displaced || (k.rank && Number(k.rank) > 100)).length;
          return { total, top3, top10, vault };
        },

        filteredKeywordsForDay(day) {
          let list = Array.isArray(day?.ranking_keywords) ? day.ranking_keywords : [];
          if (this.selectedKeywordFilter && this.selectedKeywordFilter !== 'ALL') {
            list = list.filter(k => k.keyword === this.selectedKeywordFilter);
          }
          if (this.searchKeywordInput && this.searchKeywordInput.trim()) {
            const q = this.searchKeywordInput.trim().toLowerCase();
            list = list.filter(k => (k.keyword || '').toLowerCase().includes(q));
          }
          if (this.drawerCategoryFilter === 'TOP3') {
            list = list.filter(k => !k.is_displaced && k.rank && Number(k.rank) <= 3);
          } else if (this.drawerCategoryFilter === 'TOP10') {
            list = list.filter(k => !k.is_displaced && k.rank && Number(k.rank) > 3 && Number(k.rank) <= 10);
          } else if (this.drawerCategoryFilter === 'VAULT') {
            list = list.filter(k => k.is_displaced || (k.rank && Number(k.rank) > 100));
          }
          return list;
        },

        keywordRankMovement(dayDate, kw) {
          if (!this._cachedDateMap) this.rebuildDateMapCache();
          const entry = this._cachedDateMap?.get(dayDate);
          if (!entry || !entry.previous) return { delta: 0, status: 'steady' };
          const prevKws = entry.previous.ranking_keywords || [];
          const prev = prevKws.find(p => p.keyword === kw.keyword || (kw.keyword_id && p.keyword_id === kw.keyword_id));
          if (!prev || !prev.rank || prev.is_displaced) {
            return { delta: 0, status: 'new' };
          }
          const currRank = Number(kw.rank || 999);
          const prevRank = Number(prev.rank || 999);
          const diff = prevRank - currRank;
          if (diff > 0) return { delta: diff, status: 'up' };
          if (diff < 0) return { delta: Math.abs(diff), status: 'down' };
          return { delta: 0, status: 'steady' };
        },

        getSpecificKeywordForDay(day, kwName) {
          const list = Array.isArray(day?.ranking_keywords) ? day.ranking_keywords : [];
          return list.filter(k => k.keyword === kwName);
        },

        getAllMatrixKeywords() {
          const days = this.filteredDays();
          const map = new Map();
          for (const day of days) {
            for (const kw of (day.ranking_keywords || [])) {
              if (kw.keyword && !map.has(kw.keyword)) {
                map.set(kw.keyword, {
                  keyword: kw.keyword,
                  keyword_id: kw.keyword_id,
                  bestRank: Number(kw.rank || 999),
                  is_displaced: Boolean(kw.is_displaced)
                });
              }
            }
          }
          return Array.from(map.values()).sort((a, b) => (a.bestRank || 999) - (b.bestRank || 999));
        },

        getMatrixCell(day, keywordName) {
          const kw = (day.ranking_keywords || []).find(k => k.keyword === keywordName);
          return kw || null;
        },

        totalEngagementScore() {
          const s = this.latestSnapshot();
          const snapC = Number(s?.comment_count || 0);
          const snapR = Number(s?.reaction_count || 0);
          const snapSh = Number(s?.share_count || 0);
          const aiSh = Number(this.dossier?.algorithmic_intelligence?.share_count || 0);
          const aiR = Object.values(this.dossier?.algorithmic_intelligence?.reactions || {}).reduce((a, b) => a + Number(b || 0), 0);
          const c = snapC || 0;
          const r = Math.max(snapR, aiR);
          const sh = Math.max(snapSh, aiSh);
          return c + r + sh;
        },

        copyAltText() {
          const text = this.dossier?.creative?.alt_text;
          if (!text) {
            this.showToast('No SEO Alt-Text available to copy', 'error');
            return;
          }
          if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            navigator.clipboard.writeText(text)
              .then(() => this.showToast('Alt-Text copied to clipboard!'))
              .catch((err) => this.showToast('Clipboard error: ' + (err?.message || 'Access denied'), 'error'));
          } else {
            this.showToast('Clipboard API not available in this environment', 'error');
          }
        },

        copyImageSignature() {
          const sig = this.dossier?.algorithmic_intelligence?.image_signature || this.dossier?.creative?.image_signature;
          if (!sig) {
            this.showToast('No perceptual image signature available', 'error');
            return;
          }
          if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            navigator.clipboard.writeText(sig)
              .then(() => this.showToast('Image signature copied to clipboard!'))
              .catch((err) => this.showToast('Clipboard error: ' + (err?.message || 'Access denied'), 'error'));
          } else {
            this.showToast('Clipboard API not available in this environment', 'error');
          }
        },

        async triggerLiveDeepSync() {
          if (this.isSyncing) return;
          this.isSyncing = true;
          this.showToast('Triggering Live Pinterest Deep Sync (48 fields)...');
          try {
            const res = await (window.safeApiFetch || fetch)('/api/pins/' + encodeURIComponent(this.pinId) + '/sync', {
              method: 'POST',
              signal: (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') ? AbortSignal.timeout(15000) : undefined
            });
            let data = null;
            const contentType = (res.headers && res.headers.get('content-type')) || '';
            if (contentType.includes('application/json')) {
              data = await res.json().catch(() => null);
            } else {
              data = await res.json().catch(() => null);
            }
            if (res.ok && data?.success) {
              if (data.dossier) {
                this.dossier = data.dossier;
                this.rebuildDateMapCache();
              }
              this.showToast('Live Deep Sync completed! All 48 parameters updated.');
            } else {
              const errMsg = data?.message || data?.error || (res.status === 504 ? 'Pinterest timeout (504 Gateway Timeout)' : ('Deep Sync error (' + res.status + ')'));
              this.showToast(errMsg, 'error');
            }
          } catch (e) {
            console.error('Error during deep sync:', e);
            const isTimeout = e.name === 'TimeoutError' || e.message?.includes('timeout') || e.message?.includes('aborted');
            this.showToast(isTimeout ? 'Deep Sync timed out after 15s. Pinterest may be throttling requests.' : ('Network error during deep sync: ' + e.message), 'error');
          } finally {
            this.isSyncing = false;
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
                this.showToast(data?.message || data?.error || 'Error removing keyword rank', 'error');
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
            }
          } catch (err) {
            this.showToast('Deletion error: ' + err.message, 'error');
          } finally {
            this.isDeleting = false;
          }
        },

        formatNumber(n) {
          return Number(n || 0).toLocaleString();
        }
      };
    }
  </script>
  ${getEdgeShieldClientScript()}
</body>
</html>`;
}
