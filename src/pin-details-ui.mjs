/**
 * Dedicated Pin Intelligence Page UI (Level 3)
 * Pure ES Module generating the full HTML application for /pins/:pin_id and /pin/:pin_id.
 * Clean, modern Light Mode SaaS interface (no dark mode).
 * Features:
 * - Direct Outbound Destination URL inspection & copy
 * - Pin creation date & age display
 * - Clear distinction between Live Active vs Historical Visual CV tags
 * - Zero redundancy (no duplicate creator/board badges)
 * - 48-Parameter Algorithmic Intelligence Matrix (Origin Pinner, Rich Metadata, SEO Injections, Semantic Interests)
 * - Trajectory chart removed per directive
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
  <title>Universal Pin Dossier ${escapedPinId} | Pinterest Arbitrage Intelligence</title>
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
              Universal Pin Dossier
              <span class="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-pink-50 text-pink-700 border border-pink-200 font-semibold" x-text="isNaN(Number(pinId)) ? pinId : '#' + pinId"></span>
            </div>
            <div class="text-[11px] text-slate-500 font-mono">Deterministic Fleet Shard Inspection</div>
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
      <button 
        @click="triggerLiveDeepSync()" 
        :disabled="isSyncing"
        class="px-3.5 py-1.5 rounded-lg bg-pink-600 hover:bg-pink-700 text-white text-xs font-bold shadow-xs transition-all flex items-center gap-1.5 border border-pink-700 disabled:opacity-50"
      >
        <span :class="isSyncing ? 'animate-spin' : ''">⚡</span>
        <span x-text="isSyncing ? 'Syncing Pinterest...' : 'Live Deep Sync'"></span>
      </button>
      <a :href="'https://www.pinterest.com/pin/' + pinId + '/'" target="_blank" rel="noopener noreferrer" class="px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold border border-red-200 transition-colors flex items-center gap-1.5">
        <span>↗</span> Open on Pinterest
      </a>
      <button @click="loadDossier(true)" class="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 text-xs font-medium border border-slate-300 transition-colors flex items-center gap-1.5 shadow-2xs">
        <span :class="loading ? 'animate-spin' : ''">🔄</span> Refresh
      </button>
    </div>
  </header>

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

  <!-- Main Content Dossier -->
  <main x-show="!loading && dossier && dossier.success" class="flex-1 max-w-7xl w-full mx-auto p-6 flex flex-col gap-6" x-cloak>

    <!-- 1. Hero Card & Creative Identity Canvas -->
    <div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col lg:flex-row gap-6 relative">
      
      <!-- Pinterest Standard 2:3 Ratio Preview Container -->
      <div class="w-full lg:w-80 flex-shrink-0 flex flex-col gap-3">
        <div 
          class="aspect-[2/3] w-full rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 relative shadow-sm group flex items-center justify-center"
        >
          <img 
            :src="dossier?.creative?.image_url || 'https://via.placeholder.com/600x900?text=Pin+Image'" 
            :alt="dossier?.creative?.title || 'Pin Creative'" 
            class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            referrerpolicy="no-referrer"
            loading="lazy"
          >
          <!-- Floating Shard & Aspect Ratio Badges -->
          <div class="absolute top-3 left-3 flex items-center gap-1.5">
            <span class="px-2 py-0.5 rounded-md bg-white/90 backdrop-blur text-[10px] font-mono font-bold text-slate-800 border border-slate-200 shadow-2xs">
              2:3 Aspect
            </span>
            <span class="px-2 py-0.5 rounded-md bg-emerald-50 text-[10px] font-mono font-bold text-emerald-700 border border-emerald-200 shadow-2xs" x-text="'Shard #' + dossier?.shard_id"></span>
          </div>

          <!-- Floating Dominant Color Indicator -->
          <div class="absolute bottom-3 left-3 right-3 p-2 rounded-xl bg-white/90 backdrop-blur-md border border-slate-200 flex items-center justify-between shadow-xs">
            <div class="flex items-center gap-2">
              <span class="w-4 h-4 rounded-full border border-slate-300 shadow-2xs" :style="'background-color: ' + safeColor(dossier?.creative?.dominant_color)"></span>
              <span class="text-[11px] font-mono text-slate-700 font-semibold" x-text="safeColor(dossier?.creative?.dominant_color)"></span>
            </div>
            <span class="text-[10px] font-mono uppercase text-slate-500 font-medium">Dominant Color</span>
          </div>
        </div>

        <!-- Telemetry Shard Footprint Summary -->
        <div class="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs font-mono text-slate-600">
          <span>Target Fleet Affinity:</span>
          <span class="text-pink-600 font-semibold" x-text="'CRC32 Shard ' + dossier?.shard_id + ' / 99'"></span>
        </div>
      </div>

      <!-- Dossier Metadata Canvas & Direct Actions -->
      <div class="flex-1 flex flex-col justify-between gap-5">
        <div class="flex flex-col gap-4">
          
          <!-- Hierarchy & Status Badges -->
          <div class="flex items-center gap-2 flex-wrap">
            <template x-if="dossier?.creative?.is_deleted">
              <span class="px-2.5 py-1 rounded-md text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1.5">
                <span>🗑️</span>
                <span>Pin Removed from Pinterest (404 / Suspended)</span>
              </span>
            </template>
            <span 
              class="px-2.5 py-1 rounded-md text-xs font-bold border"
              :class="dossier?.pillar_2_keywords_context?.highest_rank <= 10 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-pink-50 text-pink-700 border-pink-200'"
              x-text="'Rank #' + (dossier?.pillar_2_keywords_context?.highest_rank !== 999 ? dossier?.pillar_2_keywords_context?.highest_rank : 'SERP Listed')"
            ></span>
            
            <!-- Pin Creation Date Badge -->
            <div class="px-2.5 py-1 rounded-md bg-slate-100 border border-slate-200 text-xs font-mono text-slate-700 flex items-center gap-1.5">
              <span>📅</span>
              <span>Published:</span>
              <span class="font-bold text-slate-900" x-text="formatDate(dossier?.creative?.created_at_pinterest) || 'Recently crawled'"></span>
              <span class="text-slate-500 text-[11px]" x-text="formatAge(dossier?.creative?.created_at_pinterest)"></span>
            </div>

            <!-- Publishing Method Badge -->
            <span class="px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200 text-[11px] font-mono" x-text="'Method: ' + (dossier?.algorithmic_intelligence?.creation_method || 'pinterest_platform')"></span>
          </div>

          <!-- Main Pin Title & Description -->
          <div class="flex flex-col gap-1.5">
            <h1 class="text-2xl font-bold text-slate-900 tracking-tight leading-snug" x-text="dossier?.creative?.title || 'Pin #' + pinId"></h1>
            <p class="text-xs text-slate-600 leading-relaxed max-w-3xl" x-text="dossier?.creative?.description || 'No descriptive body captured for this pin.'"></p>
          </div>

          <!-- DIRECT OUTBOUND DESTINATION URL ROW (الرابط الخارجي للدبوس) -->
          <div class="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div class="flex flex-col gap-1 overflow-hidden max-w-full">
              <div class="flex items-center gap-2">
                <span class="text-[10px] font-mono uppercase tracking-wider text-blue-800 font-bold flex items-center gap-1">
                  <span>🔗</span> Outbound Destination URL (الرابط الخارجي للدبوس):
                </span>
                <span class="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-100 text-blue-800 font-semibold" x-text="dossier?.creative?.domain || 'Destination Domain'"></span>
              </div>
              <div class="text-xs font-mono text-blue-900 truncate max-w-2xl font-medium" :title="dossier?.creative?.destination_url || dossier?.algorithmic_intelligence?.utm_link">
                <span x-text="dossier?.creative?.destination_url || dossier?.algorithmic_intelligence?.utm_link || 'No direct destination URL captured.'"></span>
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
                <span>Open URL ↗</span>
              </a>
            </div>
          </div>

          <!-- SEO Alt-Text Container & 1-Click Clipboard Copy -->
          <div class="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-start justify-between gap-4">
            <div class="flex flex-col gap-1 flex-1">
              <div class="flex items-center gap-2">
                <span class="text-[10px] font-mono uppercase tracking-wider text-pink-700 font-bold">Pinterest SEO Alt-Text</span>
                <span class="text-[10px] text-slate-500 font-mono">Organic Keyword Extraction Target</span>
              </div>
              <p class="text-xs text-slate-700 font-mono leading-relaxed" x-text="dossier?.creative?.alt_text || 'No SEO alt-text metadata captured on asset.'"></p>
            </div>
            <button 
              @click="copyAltText()" 
              class="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 text-xs font-mono border border-slate-300 whitespace-nowrap transition-colors flex items-center gap-1.5 shadow-2xs"
              title="Copy alt text to clipboard"
            >
              <span>📋</span>
              <span>Copy Alt Text</span>
            </button>
          </div>
        </div>

        <!-- Raw Visual Computer Vision Annotations (Categorized: Live vs Historical) -->
        <div class="flex flex-col gap-3 pt-3 border-t border-slate-200">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <span>🏷️</span> Computer Vision Annotations (الوسوم البصرية):
              </span>
              <span class="text-[11px] font-mono text-slate-500" x-text="'Total ' + (dossier?.creative?.visual_annotations?.length || 0) + ' tags'"></span>
            </div>
            <div class="flex items-center gap-3 text-[11px] font-mono">
              <span class="flex items-center gap-1 text-emerald-700 font-semibold">
                <span class="w-2 h-2 rounded-full bg-emerald-500"></span> Live Active (<span x-text="activeLiveTags().length"></span>)
              </span>
              <span class="flex items-center gap-1 text-amber-700 font-semibold" x-show="historicalTags().length > 0">
                <span class="w-2 h-2 rounded-full bg-amber-500"></span> Historical Discovered (<span x-text="historicalTags().length"></span>)
              </span>
            </div>
          </div>

          <!-- 1. Live Active Tags (الوسوم النشطة حالياً على صفحة بينترست) -->
          <div class="flex flex-col gap-1.5">
            <div class="text-[10px] font-mono uppercase text-emerald-800 font-bold flex items-center gap-1">
              <span>🟢</span> Live Active Tags on Pinterest (الوسوم النشطة الحالية):
            </div>
            <div class="flex items-center gap-1.5 flex-wrap">
              <template x-for="item in activeLiveTags()" :key="item.name">
                <span class="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 font-mono flex items-center gap-1 shadow-2xs">
                  <span class="text-emerald-600 font-bold">#</span>
                  <span x-text="item.name"></span>
                </span>
              </template>
              <span x-show="!activeLiveTags().length" class="text-xs text-slate-400 italic font-mono">No active visual tags recorded.</span>
            </div>
          </div>

          <!-- 2. Historical Tags (وسوم مسجلة في عمليات زحف سابقة) -->
          <div x-show="historicalTags().length > 0" class="flex flex-col gap-1.5 pt-1">
            <div class="text-[10px] font-mono uppercase text-amber-800 font-bold flex items-center gap-1">
              <span>🕒</span> Historical Discovered Tags (وسوم تراكمية سابقة من الأرشيف):
            </div>
            <div class="flex items-center gap-1.5 flex-wrap">
              <template x-for="item in historicalTags()" :key="item.name">
                <span class="px-2.5 py-1 rounded-lg bg-amber-50/80 border border-amber-200 text-xs text-amber-900 font-mono flex items-center gap-1">
                  <span class="text-amber-600 font-bold">#</span>
                  <span x-text="item.name"></span>
                </span>
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 2. Algorithmic Intelligence Matrix & Lineage (مصفوفة الاستخبارات الخوارزمية) -->
    <div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col gap-6">

      <!-- Section Title & Badges Bar -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-lg bg-pink-50 border border-pink-200 flex items-center justify-center text-pink-600 font-bold">
            🧬
          </div>
          <div>
            <h2 class="text-sm font-bold text-slate-900 tracking-wide flex items-center gap-2">
              Algorithmic Intelligence Matrix & Lineage
              <span class="text-[11px] text-slate-500 font-normal hidden sm:inline">(مصفوفة الاستخبارات الخوارزمية وشجرة النسب)</span>
            </h2>
            <div class="text-[11px] text-slate-500 font-mono">48-Parameter Deep Forensics & Graph Provenance</div>
          </div>
        </div>

        <!-- High-Signal Status Badges -->
        <div class="flex items-center gap-2 flex-wrap">
          <!-- Pin Type Badge (Repin vs Original) -->
          <template x-if="dossier?.algorithmic_intelligence?.is_repin">
            <span class="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1.5">
              <span>🔁</span>
              <span>Viral Repin</span>
            </span>
          </template>
          <template x-if="!dossier?.algorithmic_intelligence?.is_repin">
            <span class="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1.5">
              <span>✨</span>
              <span>Fresh Original Pin</span>
            </span>
          </template>

          <!-- Arbitrage Traffic Outbound Badge -->
          <template x-if="dossier?.algorithmic_intelligence?.is_arbitrage_active">
            <span class="px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-50 text-blue-800 border border-blue-200 flex items-center gap-1.5">
              <span>🔗</span>
              <span>Direct Outbound Destination Active</span>
            </span>
          </template>
          <template x-if="!dossier?.algorithmic_intelligence?.is_arbitrage_active">
            <span class="px-2.5 py-1 rounded-lg text-xs font-bold bg-purple-50 text-purple-800 border border-purple-200 flex items-center gap-1.5">
              <span>🚫</span>
              <span>Linkless Story Pin</span>
            </span>
          </template>

          <!-- Google SERP Indexing Badge -->
          <template x-if="dossier?.algorithmic_intelligence?.is_indexed_google">
            <span class="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1.5">
              <span>🔎</span>
              <span>Google SERP Indexed</span>
            </span>
          </template>
          <template x-if="!dossier?.algorithmic_intelligence?.is_indexed_google">
            <span class="px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-50 text-rose-800 border border-rose-200 flex items-center gap-1.5">
              <span>⛔</span>
              <span x-text="'Noindex: ' + (dossier?.algorithmic_intelligence?.seo_noindex_reason || 'Suppressed')"></span>
            </span>
          </template>
        </div>
      </div>

      <!-- Provenance Lineage Cards (شجرة النسب بدون تكرار) -->
      <div class="flex flex-col gap-3">
        <div class="text-[11px] font-mono uppercase tracking-wider text-slate-600 font-bold flex items-center gap-1.5">
          <span>🌳</span> Viral Provenance Lineage (سلسلة نسب النشر والملكية):
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <!-- Card 1: Origin Pinner (First Uploader) -->
          <div class="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-between gap-3">
            <div class="flex flex-col gap-2">
              <div class="flex items-center justify-between">
                <span class="text-[10px] font-mono uppercase text-pink-700 font-bold flex items-center gap-1">
                  <span>🚀</span> Stage 1: Origin Pinner
                </span>
                <span class="text-[10px] text-slate-500 font-mono">First Uploader</span>
              </div>
              <div class="flex items-center gap-2.5 mt-1">
                <img 
                  :src="dossier?.algorithmic_intelligence?.origin_pinner?.image_url || 'https://s.pinimg.com/images/user/default_75.png'" 
                  class="w-10 h-10 rounded-full object-cover border border-slate-300 bg-white"
                  alt="Origin Pinner"
                  referrerpolicy="no-referrer"
                >
                <div class="flex flex-col overflow-hidden">
                  <div class="text-xs font-bold text-slate-900 truncate" x-text="dossier?.algorithmic_intelligence?.origin_pinner?.full_name || dossier?.algorithmic_intelligence?.origin_pinner?.username || 'Direct / First Uploader'"></div>
                  <div class="text-[11px] text-slate-600 font-mono truncate" x-text="dossier?.algorithmic_intelligence?.origin_pinner?.username ? '@' + dossier?.algorithmic_intelligence?.origin_pinner?.username : 'Original Content Uploader'"></div>
                </div>
              </div>
            </div>
            <div class="flex items-center justify-between pt-2 border-t border-slate-200 text-[11px] font-mono">
              <span class="text-slate-500">Followers:</span>
              <span class="text-slate-900 font-bold" x-text="formatNumber(dossier?.algorithmic_intelligence?.origin_pinner?.follower_count || 0)"></span>
            </div>
          </div>

          <!-- Card 2: Domain Entity & Authority -->
          <div class="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-between gap-3">
            <div class="flex flex-col gap-2">
              <div class="flex items-center justify-between">
                <span class="text-[10px] font-mono uppercase text-blue-700 font-bold flex items-center gap-1">
                  <span>🌐</span> Stage 2: Publisher & Domain
                </span>
                <span class="text-[10px] text-slate-500 font-mono">Verified Host</span>
              </div>
              <div class="flex items-center gap-2.5 mt-1">
                <div class="w-10 h-10 rounded-full bg-blue-100 border border-blue-200 flex items-center justify-center text-base text-blue-700 font-bold overflow-hidden shrink-0">
                  <template x-if="dossier?.algorithmic_intelligence?.domain_official_user?.image_url">
                    <img :src="dossier.algorithmic_intelligence.domain_official_user.image_url" class="w-full h-full object-cover" referrerpolicy="no-referrer">
                  </template>
                  <template x-if="!dossier?.algorithmic_intelligence?.domain_official_user?.image_url">
                    <span>🏷️</span>
                  </template>
                </div>
                <div class="flex flex-col overflow-hidden">
                  <div class="text-xs font-bold text-slate-900 truncate" x-text="dossier?.algorithmic_intelligence?.domain_official_user?.full_name || dossier?.algorithmic_intelligence?.rich_metadata?.site_name || dossier?.creative?.domain || 'Domain Host'"></div>
                  <div class="text-[11px] text-blue-700 font-mono truncate" x-text="dossier?.algorithmic_intelligence?.domain_official_user?.username ? '@' + dossier.algorithmic_intelligence.domain_official_user.username : dossier?.creative?.domain"></div>
                </div>
              </div>
            </div>
            <div class="flex items-center justify-between pt-2 border-t border-slate-200 text-[11px] font-mono">
              <span class="text-slate-500">Domain Authority:</span>
              <span class="text-blue-700 font-bold" x-text="dossier?.algorithmic_intelligence?.domain_official_user?.follower_count ? formatNumber(dossier?.algorithmic_intelligence?.domain_official_user?.follower_count) + ' followers' : 'Verified Web Entity'"></span>
            </div>
          </div>

          <!-- Card 3: Current Curator & Board Container -->
          <div class="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-between gap-3">
            <div class="flex flex-col gap-2">
              <div class="flex items-center justify-between">
                <span class="text-[10px] font-mono uppercase text-emerald-700 font-bold flex items-center gap-1">
                  <span>📁</span> Stage 3: Current Board & Curator
                </span>
                <span class="text-[10px] text-slate-500 font-mono">Board Container</span>
              </div>
              <div class="flex flex-col gap-1 mt-1">
                <div class="text-xs font-bold text-slate-900 truncate" x-text="dossier?.pillar_1_creator_context?.board_name || 'Independent Board'"></div>
                <div class="text-[11px] text-emerald-700 font-mono truncate" x-text="'@' + (dossier?.pillar_1_creator_context?.creator_username || 'anonymous')"></div>
              </div>
            </div>
            <div class="flex items-center justify-between pt-2 border-t border-slate-200 text-[11px] font-mono">
              <span class="text-slate-500">Board Pin Count:</span>
              <span class="text-emerald-700 font-bold" x-text="(dossier?.algorithmic_intelligence?.board_metrics?.pin_count || 'N/A') + ' pins'"></span>
            </div>
          </div>
        </div>
      </div>

      <!-- Perceptual Hash, Dimensions & Category Breadcrumbs -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
        <!-- 1. Perceptual Image Signature Hash -->
        <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3">
          <div class="flex flex-col gap-0.5 overflow-hidden">
            <div class="text-[10px] font-mono uppercase text-pink-700 font-bold flex items-center gap-1">
              <span>🖼️</span> Perceptual Image Hash (بصمة الصورة)
            </div>
            <div class="text-xs font-mono text-slate-800 truncate" x-text="dossier?.algorithmic_intelligence?.image_signature || dossier?.creative?.image_signature || 'Not Captured'"></div>
          </div>
          <button 
            @click="copyImageSignature()" 
            class="px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 text-[11px] font-mono border border-slate-300 shadow-2xs transition-colors whitespace-nowrap flex items-center gap-1"
            title="Copy perceptual image signature"
          >
            <span>📋 Copy</span>
          </button>
        </div>

        <!-- 2. Dimensions & Aspect Ratio -->
        <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3">
          <div class="flex flex-col gap-0.5">
            <div class="text-[10px] font-mono uppercase text-blue-700 font-bold flex items-center gap-1">
              <span>📐</span> Image Geometry & Dimensions
            </div>
            <div class="text-xs font-mono text-slate-800" x-text="dossier?.algorithmic_intelligence?.image_dimensions ? (dossier.algorithmic_intelligence.image_dimensions.width + ' × ' + dossier.algorithmic_intelligence.image_dimensions.height + ' (' + dossier.algorithmic_intelligence.image_dimensions.aspect_ratio + ' aspect)') : 'Standard 2:3 Pinterest Ratio'"></div>
          </div>
          <span class="px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px] font-mono font-semibold">High-Res</span>
        </div>

        <!-- 3. Category Breadcrumbs -->
        <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3">
          <div class="flex flex-col gap-0.5 overflow-hidden">
            <div class="text-[10px] font-mono uppercase text-amber-700 font-bold flex items-center gap-1">
              <span>🏷️</span> Category Breadcrumbs
            </div>
            <div class="flex items-center gap-1.5 flex-wrap">
              <template x-for="cat in dossier?.algorithmic_intelligence?.category_breadcrumbs || []" :key="cat">
                <span class="px-2 py-0.5 rounded bg-white border border-slate-300 text-[10px] font-mono text-amber-800 font-semibold" x-text="cat"></span>
              </template>
              <span x-show="!dossier?.algorithmic_intelligence?.category_breadcrumbs?.length" class="text-xs font-mono text-slate-500 italic">General Category</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 1. CANONICAL CLUSTER & ROOT PIN HIERARCHY (canonicalPin & Canonical Cluster URL) -->
      <div class="p-4 rounded-xl bg-indigo-50/70 border border-indigo-200 flex flex-col gap-3">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-indigo-200/60 pb-2.5">
          <div class="flex items-center gap-2">
            <span class="text-base">👑</span>
            <span class="text-xs font-mono uppercase tracking-wider text-indigo-950 font-bold">
              Canonical Cluster Root Pin (canonicalPin) & Hierarchy
            </span>
            <span class="text-[11px] text-indigo-700 font-normal hidden sm:inline">(رابط التكتل الجذري للدبوس في خوارزمية بينترست)</span>
          </div>

          <!-- Cluster Status Badge -->
          <div class="flex items-center gap-2">
            <template x-if="dossier?.algorithmic_intelligence?.is_canonical_root">
              <span class="px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1 font-mono shadow-2xs">
                <span>🌟</span> Root Authority Node (دبوس جذري أصلي)
              </span>
            </template>
            <template x-if="!dossier?.algorithmic_intelligence?.is_canonical_root && dossier?.algorithmic_intelligence?.canonical_pin_id">
              <span class="px-2.5 py-1 rounded-md text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1 font-mono shadow-2xs">
                <span>🔗</span> Syndicated Cluster Node (متفرع من جذر خوارزمي)
              </span>
            </template>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <!-- Root Snowflake & Identification -->
          <div class="p-3 rounded-lg bg-white border border-indigo-200 flex items-center justify-between gap-3 shadow-2xs">
            <div class="flex flex-col gap-0.5 overflow-hidden">
              <span class="text-[10px] font-mono uppercase text-indigo-700 font-bold">Root Canonical Pin Snowflake ID</span>
              <div class="text-xs font-mono font-bold text-slate-900 truncate flex items-center gap-1.5">
                <span class="text-indigo-600">#</span>
                <span x-text="dossier?.algorithmic_intelligence?.canonical_pin_id || pinId"></span>
                <span x-show="dossier?.algorithmic_intelligence?.canonical_pin_id === pinId" class="text-[10px] font-normal text-slate-500">(Self Root)</span>
              </div>
            </div>
            <template x-if="dossier?.algorithmic_intelligence?.canonical_pin_id && dossier?.algorithmic_intelligence?.canonical_pin_id !== pinId">
              <a 
                :href="'/pins/' + dossier?.algorithmic_intelligence?.canonical_pin_id"
                class="px-2.5 py-1 rounded-md bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-mono font-semibold border border-indigo-200 whitespace-nowrap transition-colors flex items-center gap-1"
                title="Inspect Canonical Root Dossier"
              >
                <span>Dossier ↗</span>
              </a>
            </template>
          </div>

          <!-- Full Canonical Cluster URL & Actions -->
          <div class="p-3 rounded-lg bg-white border border-indigo-200 flex items-center justify-between gap-3 shadow-2xs">
            <div class="flex flex-col gap-0.5 overflow-hidden">
              <span class="text-[10px] font-mono uppercase text-indigo-700 font-bold">Canonical Cluster URL (رابط التكتل الجذري)</span>
              <div class="text-xs font-mono text-indigo-900 truncate font-medium" :title="dossier?.algorithmic_intelligence?.canonical_pin_url || ('https://www.pinterest.com' + (dossier?.algorithmic_intelligence?.seo_canonical_url || '/pin/' + pinId + '/'))">
                <span x-text="dossier?.algorithmic_intelligence?.canonical_pin_url || ('https://www.pinterest.com' + (dossier?.algorithmic_intelligence?.seo_canonical_url || '/pin/' + pinId + '/'))"></span>
              </div>
            </div>
            <div class="flex items-center gap-1.5 flex-shrink-0">
              <button 
                @click="copyUrl(dossier?.algorithmic_intelligence?.canonical_pin_url || ('https://www.pinterest.com' + (dossier?.algorithmic_intelligence?.seo_canonical_url || '/pin/' + pinId + '/')))"
                class="px-2 py-1 rounded-md bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-mono border border-slate-200 transition-colors shadow-2xs"
                title="Copy Canonical URL"
              >
                📋
              </button>
              <a 
                :href="dossier?.algorithmic_intelligence?.canonical_pin_url || ('https://www.pinterest.com' + (dossier?.algorithmic_intelligence?.seo_canonical_url || '/pin/' + pinId + '/'))"
                target="_blank"
                rel="noopener noreferrer"
                class="px-2.5 py-1 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-mono font-semibold transition-colors flex items-center gap-1 shadow-2xs"
                title="Open Canonical Root on Pinterest"
              >
                <span>Pinterest ↗</span>
              </a>
            </div>
          </div>
        </div>
      </div>

      <!-- 2. SEO RELATED SEMANTIC INTERESTS (المحاور والاهتمامات الدلالية المرتبطة بخوارزمية بينترست) -->
      <div class="p-4 rounded-xl bg-purple-50/70 border border-purple-200 flex flex-col gap-3">
        <div class="flex items-center justify-between border-b border-purple-200/60 pb-2">
          <div class="flex items-center gap-2">
            <span class="text-base">🌐</span>
            <span class="text-xs font-mono uppercase tracking-wider text-purple-950 font-bold">
              Algorithmic Semantic Interests (المحاور والاهتمامات الدلالية المرتبطة بالدبوس في خوارزمية بينترست):
            </span>
          </div>
          <span class="text-xs font-mono text-purple-800 font-bold px-2 py-0.5 rounded-full bg-purple-100 border border-purple-200" x-text="(dossier?.algorithmic_intelligence?.seo_related_interests?.length || 0) + ' Semantic Clusters'"></span>
        </div>

        <!-- Render All Semantic Topic Clusters -->
        <template x-if="dossier?.algorithmic_intelligence?.seo_related_interests?.length">
          <div class="flex items-center gap-2 flex-wrap">
            <template x-for="item in dossier?.algorithmic_intelligence?.seo_related_interests" :key="item.name">
              <a 
                :href="item.url ? (item.url.startsWith('http') ? item.url : 'https://www.pinterest.com' + item.url) : '#'" 
                target="_blank" 
                rel="noopener noreferrer"
                class="px-3 py-1.5 rounded-lg bg-white hover:bg-purple-100 text-purple-900 border border-purple-300 text-xs font-mono transition-colors flex items-center gap-1.5 shadow-2xs group"
                :title="'Explore Semantic Topic on Pinterest: ' + item.name"
              >
                <span class="text-purple-600 group-hover:scale-110 transition-transform">📌</span>
                <span class="font-semibold" x-text="item.name"></span>
                <span class="text-purple-400 text-[10px]">↗</span>
              </a>
            </template>
          </div>
        </template>

        <!-- Fallback if not yet synced -->
        <template x-if="!dossier?.algorithmic_intelligence?.seo_related_interests?.length">
          <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 rounded-lg bg-white border border-dashed border-purple-300 gap-3">
            <div class="flex items-center gap-2 text-xs text-purple-900 font-mono">
              <span>⏳</span>
              <span>10 Algorithmic Semantic Interests await deep telemetry sync from Pinterest.</span>
            </div>
            <button 
              @click="triggerLiveDeepSync()" 
              :disabled="isSyncing"
              class="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-mono font-semibold shadow-2xs transition-colors flex items-center gap-1 whitespace-nowrap"
            >
              <span x-show="!isSyncing">⚡ Live Deep Sync Now</span>
              <span x-show="isSyncing">Syncing Telemetry...</span>
            </button>
          </div>
        </template>
      </div>

      <!-- Rich Web Entity & Injected Google SEO Target -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <!-- Card A: Rich Web Entity -->
        <div class="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-between gap-3">
          <div class="flex flex-col gap-2">
            <div class="flex items-center justify-between">
              <span class="text-[10px] font-mono uppercase text-emerald-700 font-bold flex items-center gap-1">
                <span>📰</span> Rich Web Entity (بيانات الناشر المعتمد)
              </span>
              <span class="text-[10px] text-slate-500 font-mono" x-text="dossier?.algorithmic_intelligence?.rich_metadata?.site_name || 'Web Verified'"></span>
            </div>
            <div class="text-xs font-bold text-slate-900 leading-snug" x-text="dossier?.algorithmic_intelligence?.rich_metadata?.title || dossier?.creative?.title"></div>
            <p class="text-[11px] text-slate-600 leading-relaxed" x-text="dossier?.algorithmic_intelligence?.rich_metadata?.description || dossier?.creative?.description"></p>
          </div>
          <template x-if="dossier?.algorithmic_intelligence?.rich_metadata?.article?.published_time || dossier?.algorithmic_intelligence?.article_published_at">
            <div class="pt-1.5 border-t border-slate-200 flex items-center justify-between text-[11px] font-mono">
              <span class="text-slate-500">Published Date:</span>
              <span class="text-emerald-700 font-semibold" x-text="formatDate(dossier?.algorithmic_intelligence?.rich_metadata?.article?.published_time || dossier?.algorithmic_intelligence?.article_published_at)"></span>
            </div>
          </template>
          <div class="pt-2 border-t border-slate-200 flex items-center justify-between text-[11px] font-mono">
            <span class="text-slate-500">Canonical Cluster:</span>
            <a 
              :href="dossier?.algorithmic_intelligence?.canonical_pin_url || ('https://www.pinterest.com' + (dossier?.algorithmic_intelligence?.seo_canonical_url || '/pin/' + pinId + '/'))"
              target="_blank"
              rel="noopener noreferrer"
              class="text-indigo-700 hover:underline font-bold truncate max-w-[200px]" 
              x-text="dossier?.algorithmic_intelligence?.seo_canonical_url || (dossier?.algorithmic_intelligence?.canonical_pin_id ? '/pin/' + dossier?.algorithmic_intelligence?.canonical_pin_id + '/' : 'Cluster Root')"
            ></a>
          </div>
        </div>

        <!-- Card B: Injected Long-Tail Google SEO Title -->
        <div class="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-between gap-3">
          <div class="flex flex-col gap-2">
            <div class="flex items-center justify-between">
              <span class="text-[10px] font-mono uppercase text-pink-700 font-bold flex items-center gap-1">
                <span>🎯</span> Injected Long-Tail Google SEO Target
              </span>
              <span class="text-[10px] text-slate-500 font-mono">Crawler Snippet</span>
            </div>
            <div class="text-xs font-mono text-pink-900 leading-snug font-medium" x-text="dossier?.algorithmic_intelligence?.seo_title || 'Identical to Title'"></div>
            <p class="text-[11px] font-mono text-slate-600 leading-relaxed" x-text="dossier?.algorithmic_intelligence?.seo_description || 'Standard Snippet'"></p>
          </div>
          <div class="pt-2 border-t border-slate-200 flex items-center justify-between text-[11px] font-mono">
            <span class="text-slate-500">Target Tracking:</span>
            <span class="text-blue-700 font-semibold truncate max-w-[240px]" :title="dossier?.algorithmic_intelligence?.utm_link || dossier?.creative?.destination_url" x-text="dossier?.algorithmic_intelligence?.utm_link ? 'UTM Tracked Organic' : 'Direct Link'"></span>
          </div>
        </div>
      </div>
    </div>

    <!-- 3. Key Telemetry Metrics Grid (5 KPI Cards) -->
    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      <div class="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between shadow-2xs">
        <div class="text-[11px] font-mono text-slate-500 flex items-center justify-between">
          <span>Total Saves</span>
          <span class="text-emerald-700 text-[10px] font-semibold" x-text="computeDeltaUnified(0, 'save_count') > 0 ? '+' + formatNumber(computeDeltaUnified(0, 'save_count')) + ' 24h' : ''"></span>
        </div>
        <div class="text-2xl font-bold font-mono text-emerald-700 mt-2" x-text="formatNumber(peakSaves())"></div>
        <div class="text-[10px] text-slate-500 font-mono mt-1">Authentic Saves</div>
      </div>

      <div class="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between shadow-2xs">
        <div class="text-[11px] font-mono text-slate-500 flex items-center justify-between">
          <span>Total Repins</span>
          <span class="text-pink-700 text-[10px] font-semibold" x-text="computeDeltaUnified(0, 'repin_count') > 0 ? '+' + formatNumber(computeDeltaUnified(0, 'repin_count')) + ' 24h' : ''"></span>
        </div>
        <div class="text-2xl font-bold font-mono text-pink-700 mt-2" x-text="formatNumber(peakRepins())"></div>
        <div class="text-[10px] text-slate-500 font-mono mt-1">Viral Shares</div>
      </div>

      <div class="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between shadow-2xs">
        <div class="text-[11px] font-mono text-slate-500">Daily Velocity</div>
        <div class="text-2xl font-bold font-mono text-amber-700 mt-2" x-text="'+' + peakVelocity() + '/d'"></div>
        <div class="text-[10px] text-slate-500 font-mono mt-1">Saves Acceleration</div>
      </div>

      <div class="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between shadow-2xs">
        <div class="text-[11px] font-mono text-slate-500">Best SERP Rank</div>
        <div class="text-2xl font-bold font-mono text-blue-700 mt-2" x-text="peakRank()"></div>
        <div class="text-[10px] text-slate-500 font-mono mt-1">Peak Position</div>
      </div>

      <div class="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between shadow-2xs">
        <div class="text-[11px] font-mono text-slate-500">Total Engagement</div>
        <div class="text-2xl font-bold font-mono text-purple-700 mt-2" x-text="formatNumber(totalEngagementScore())"></div>
        <div class="text-[10px] text-slate-500 font-mono mt-1">Comments + Reactions + Shares</div>
      </div>
    </div>

    <!-- 4. Cross-Pillar Context Suite (Without duplicates) -->
    <div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col gap-4">
      <div class="flex items-center justify-between border-b border-slate-200 pb-3">
        <div class="flex items-center gap-2">
          <span class="text-base">🧬</span>
          <h2 class="text-sm font-bold text-slate-900 uppercase tracking-wider font-mono">Cross-Pillar Intelligence Suite</h2>
        </div>
        <span class="text-xs font-mono text-slate-500">Multi-Module Ecosystem Connection</span>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        <!-- Keyword Rankings Context -->
        <div class="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-between gap-3">
          <div class="flex flex-col gap-2">
            <div class="flex items-center justify-between">
              <span class="text-[10px] font-mono uppercase text-emerald-800 font-bold flex items-center gap-1">
                <span>🎯</span> Keyword SERP Rankings
              </span>
              <span class="text-[10px] font-mono text-slate-500" x-text="(dossier?.pillar_2_keywords_context?.ranking_keywords?.length || 0) + ' SERPs'"></span>
            </div>
            
            <div class="flex flex-col gap-1 max-h-28 overflow-y-auto pr-1">
              <template x-for="kw in (dossier?.pillar_2_keywords_context?.ranking_keywords || []).slice(0, 4)" :key="kw.keyword">
                <a 
                  :href="'/keywords/' + encodeURIComponent(kw.keyword)" 
                  target="_blank" 
                  class="flex items-center justify-between text-[11px] text-slate-700 hover:text-emerald-700 p-1.5 rounded bg-white border border-slate-200 transition-colors shadow-2xs"
                >
                  <span class="truncate max-w-[140px] font-medium" x-text="kw.keyword"></span>
                  <template x-if="!kw.is_displaced && kw.rank">
                    <span class="font-mono text-emerald-700 font-bold" x-text="'#' + kw.rank"></span>
                  </template>
                  <template x-if="kw.is_displaced">
                    <div class="flex items-center gap-1 font-mono font-bold">
                      <span class="text-amber-700" x-text="'#' + (kw.catalog_rank || 101) + ' [Vault]'"></span>
                      <span class="text-rose-600 text-[10px]" x-text="'(Was #' + (kw.last_known_rank || kw.rank || '?') + ')'"></span>
                    </div>
                  </template>
                </a>
              </template>
              <div x-show="!dossier?.pillar_2_keywords_context?.ranking_keywords?.length" class="text-[11px] text-slate-400 italic">
                No active SERP rankings recorded.
              </div>
            </div>
          </div>
          <a href="/keywords" class="text-[11px] text-emerald-700 hover:underline font-mono text-right font-medium">Explore All Keywords →</a>
        </div>

        <!-- Related Pins Semantic Radar -->
        <div class="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-between gap-3">
          <div class="flex flex-col gap-1.5">
            <span class="text-[10px] font-mono uppercase text-pink-700 font-bold flex items-center gap-1">
              <span>🔮</span> Related Pins Semantic Radar
            </span>
            <div class="text-xs font-semibold text-slate-900">Visual Similarity & Graph Neighbors</div>
            <p class="text-[11px] text-slate-600">Discover pins visually and algorithmically adjacent to this creative.</p>
          </div>
          <a 
            :href="dossier?.pillar_3_related_pins_context?.radar_url || '/api/keywords/visual-search?pin_id=' + pinId" 
            target="_blank" 
            class="px-3 py-2 rounded-lg bg-pink-50 hover:bg-pink-100 text-pink-700 text-xs font-semibold border border-pink-200 text-center transition-colors flex items-center justify-center gap-1"
          >
            <span>🔍 Launch Related Radar</span>
          </a>
        </div>

      </div>
    </div>

    <!-- 5. Time-Series Audit Log & Snapshots Table -->
    <div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col gap-4">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h3 class="text-sm font-bold text-slate-900 flex items-center gap-2">
            <span>⏱️</span>
            Historical Snapshot Audit Log
          </h3>
          <p class="text-[11px] text-slate-500 font-mono mt-0.5">Chronological record of crawled telemetry points</p>
        </div>

        <div class="flex items-center gap-3">
          <!-- Keyword Filter Dropdown -->
          <div class="flex items-center gap-2 text-xs font-mono">
            <span class="text-slate-500">Filter:</span>
            <select 
              x-model="selectedKeywordFilter" 
              class="px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-300 text-slate-800 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-pink-500"
            >
              <option value="ALL">All SERP Snapshots</option>
              <template x-for="kw in uniqueKeywords()" :key="kw.name">
                <option :value="kw.name" x-text="kw.name + ' (' + kw.count + ')'"></option>
              </template>
            </select>
          </div>
        </div>
      </div>

      <!-- Snapshots Table (Clean Light SaaS Table with Unified Single Row Per Date) -->
      <div class="overflow-x-auto rounded-xl border border-slate-200">
        <table class="w-full text-left text-xs font-mono border-collapse">
          <thead>
            <tr class="bg-slate-50 text-slate-700 border-b border-slate-200">
              <th class="p-3 font-semibold">Date</th>
              <th class="p-3 font-semibold">SERP Rankings & Keywords</th>
              <th class="p-3 font-semibold">Best Rank</th>
              <th class="p-3 font-semibold">Saves</th>
              <th class="p-3 font-semibold">Delta 24h</th>
              <th class="p-3 font-semibold">Repins</th>
              <th class="p-3 font-semibold">Daily Velocity</th>
              <th class="p-3 font-semibold text-right">Action</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 bg-white">
            <template x-for="(day, idx) in filteredDays()" :key="day.snapshot_date">
              <tr class="hover:bg-slate-50/80 transition-colors">
                <td class="p-3 font-bold text-slate-900" x-text="day.snapshot_date"></td>
                <td class="p-3">
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <template x-for="kw in (day.ranking_keywords || [])" :key="kw.keyword_id || kw.keyword">
                      <span 
                        class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border transition-colors"
                        :class="kw.is_displaced ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-slate-100 text-slate-800 border-slate-200'"
                      >
                        <template x-if="kw.rank && !kw.is_displaced">
                          <span class="font-bold text-emerald-700" x-text="'#' + kw.rank"></span>
                        </template>
                        <template x-if="kw.is_displaced">
                          <span class="font-bold text-amber-700" x-text="'[Vault #' + (kw.rank || 101) + ']'"></span>
                        </template>
                        <span x-text="kw.keyword"></span>
                        <button 
                          @click.stop="requestDeleteSerpBadge(kw, day.snapshot_date)" 
                          class="text-slate-400 hover:text-red-600 transition-colors ml-0.5" 
                          title="Remove rank for this keyword on this date"
                        >✕</button>
                      </span>
                    </template>
                    <template x-if="!day.ranking_keywords || day.ranking_keywords.length === 0">
                      <span class="px-2 py-0.5 rounded bg-slate-50 text-slate-400 border border-slate-200 text-[11px]">Direct / Pillar</span>
                    </template>
                  </div>
                </td>
                <td class="p-3">
                  <template x-if="day.best_rank && day.best_rank !== 999">
                    <span class="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold" x-text="'#' + day.best_rank"></span>
                  </template>
                  <template x-if="!day.best_rank || day.best_rank === 999">
                    <span class="px-2 py-0.5 rounded bg-slate-100 text-slate-400 border border-slate-200">N/A</span>
                  </template>
                </td>
                <td class="p-3 text-emerald-700 font-bold" x-text="formatNumber(day.save_count)"></td>
                <td class="p-3">
                  <span 
                    :class="computeDeltaByDate(day.snapshot_date, 'save_count') > 0 ? 'text-emerald-700 font-semibold' : (computeDeltaByDate(day.snapshot_date, 'save_count') < 0 ? 'text-red-700 font-semibold' : 'text-slate-400')" 
                    x-text="computeDeltaByDate(day.snapshot_date, 'save_count') > 0 ? '+' + formatNumber(computeDeltaByDate(day.snapshot_date, 'save_count')) : (computeDeltaByDate(day.snapshot_date, 'save_count') < 0 ? formatNumber(computeDeltaByDate(day.snapshot_date, 'save_count')) : '0')"
                  ></span>
                </td>
                <td class="p-3 text-pink-700 font-bold" x-text="formatNumber(day.repin_count)"></td>
                <td class="p-3 text-amber-700 font-medium" x-text="'+' + (day.daily_save_velocity || 0) + '/d'"></td>
                <td class="p-3 text-right">
                  <button 
                    @click="requestDeleteDay(day.snapshot_date)" 
                    class="px-2.5 py-1 rounded bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-[11px] transition-colors"
                    title="Delete all data for this day from Shard"
                  >
                    Delete Day ✕
                  </button>
                </td>
              </tr>
            </template>
            <tr x-show="!filteredDays().length">
              <td colspan="8" class="p-8 text-center text-slate-400 font-mono text-xs">
                No telemetry records match the selected SERP filter.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

  </main>

  <!-- Delete Confirmation Modal (Supporting Granular Day, SERP Badge, or Legacy Snapshot) -->
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
        dossier: null,
        _cachedDateMap: null,
        deleteModalOpen: false,
        deleteType: 'DAY',
        itemToDelete: null,
        snapshotToDelete: null,
        isDeleting: false,
        isSyncing: false,
        selectedKeywordFilter: 'ALL',
        toast: {
          show: false,
          message: '',
          type: 'success'
        },
        toastTimeout: null,

        async init() {
          if (!this.pinId) {
            this.error = 'No Pin ID provided in URL.';
            this.loading = false;
            return;
          }
          await this.loadDossier();
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
              this.isShardWarming = false;
              this.rebuildDateMapCache();
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
          return (this.dossier?.creative?.visual_annotations || []).map(t => ({ name: t, is_live: true }));
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

        chronologicalSnapshots() {
          return [...(this.dossier?.snapshots || [])].reverse();
        },

        computeChartPoints() {
          const snaps = this.chronologicalSnapshots();
          if (snaps.length < 2) return [];

          const values = snaps.map(s => (isFinite(Number(s.save_count)) ? Math.max(0, Number(s.save_count)) : 0));
          const minY = Math.min(...values);
          const maxY = Math.max(...values);
          const rangeY = (maxY - minY) || 1;

          const width = 800;
          const height = 180;
          const padX = 40;
          const padY = 30;

          return snaps.map((s, i) => {
            const x = padX + (i / (snaps.length - 1)) * (width - 2 * padX);
            const val = isFinite(Number(s.save_count)) ? Math.max(0, Number(s.save_count)) : 0;
            const y = (maxY === minY)
              ? (height / 2)
              : ((height - padY) - ((val - minY) / rangeY) * (height - 2 * padY));
            return { x, y, snapshot: s };
          });
        },

        buildSvgLinePath() {
          const points = this.computeChartPoints();
          if (!points.length) return '';
          return points.reduce((acc, p, i) => {
            return i === 0 ? 'M ' + p.x.toFixed(1) + ' ' + p.y.toFixed(1) : acc + ' L ' + p.x.toFixed(1) + ' ' + p.y.toFixed(1);
          }, '');
        },

        buildSvgAreaPath() {
          const points = this.computeChartPoints();
          if (!points.length) return '';
          const lineD = this.buildSvgLinePath();
          const lastPoint = points[points.length - 1];
          const firstPoint = points[0];
          const bottomY = 150;
          return lineD + ' L ' + lastPoint.x.toFixed(1) + ' ' + bottomY + ' L ' + firstPoint.x.toFixed(1) + ' ' + bottomY + ' Z';
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
            const deltaSaves = prev ? (Number(curr.save_count || 0) - Number(prev.save_count || 0)) : 0;
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
                ranking_keywords: []
              });
            }
            const d = map.get(date);
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

        filteredSnapshots() {
          const snaps = this.dossier?.snapshots || [];
          if (this.selectedKeywordFilter === 'ALL') return snaps;
          return snaps.filter(s => s.keyword_name === this.selectedKeywordFilter);
        },

        computeDeltaUnified(currentIdx, field = 'save_count') {
          const traj = (this.dossier?.daily_trajectory && this.dossier.daily_trajectory.length > 0)
            ? this.dossier.daily_trajectory
            : this.synthesizeDailyTrajectoryFromSnapshots();
          if (!traj[currentIdx]) return 0;
          return this.computeDeltaByDate(traj[currentIdx].snapshot_date, field);
        },

        computeDeltaPerSerp(currentIdx, field = 'save_count') {
          const list = this.filteredDays();
          if (!list[currentIdx]) return 0;
          return this.computeDeltaByDate(list[currentIdx].snapshot_date, field);
        },

        computeDelta(currentIdx, field = 'save_count') {
          if (Array.isArray(this.dossier?.snapshots) && this.dossier.snapshots.length > 0 && !this.dossier?.daily_trajectory) {
            const snaps = this.dossier.snapshots;
            if (currentIdx >= snaps.length - 1) return 0;
            const current = isFinite(Number(snaps[currentIdx]?.[field])) ? Number(snaps[currentIdx][field]) : 0;
            const previous = isFinite(Number(snaps[currentIdx + 1]?.[field])) ? Number(snaps[currentIdx + 1][field]) : 0;
            return current - previous;
          }
          return this.computeDeltaUnified(currentIdx, field);
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

        requestDeleteSnapshot(id) {
          this.deleteType = 'SNAPSHOT';
          this.itemToDelete = { snapshotId: id };
          this.snapshotToDelete = id;
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
            } else if (this.deleteType === 'SNAPSHOT') {
              const snapshotId = this.itemToDelete.snapshotId;
              const res = await (window.safeApiFetch || fetch)('/api/pins/' + encodeURIComponent(this.pinId) + '/snapshots/' + snapshotId, {
                method: 'DELETE'
              });
              const data = await res.json().catch(() => ({}));
              if (res.ok && data?.success) {
                this.showToast('Snapshot #' + snapshotId + ' deleted successfully');
                this.deleteModalOpen = false;
                await this.loadDossier(true);
              } else {
                this.showToast(data?.message || data?.error || 'Error deleting snapshot', 'error');
              }
            }
          } catch (err) {
            this.showToast('Deletion error: ' + err.message, 'error');
          } finally {
            this.isDeleting = false;
          }
        },

        async executeDeleteSnapshot() {
          if (!this.snapshotToDelete || this.isDeleting) return;
          this.isDeleting = true;
          try {
            const res = await (window.safeApiFetch || fetch)('/api/pins/' + encodeURIComponent(this.pinId) + '/snapshots/' + this.snapshotToDelete, {
              method: 'DELETE'
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data?.success) {
              if (this.dossier?.snapshots) {
                this.dossier.snapshots = this.dossier.snapshots.filter(s => s.id !== this.snapshotToDelete);
              }
              this.showToast('Snapshot #' + this.snapshotToDelete + ' deleted successfully');
              this.deleteModalOpen = false;
              this.snapshotToDelete = null;
            } else {
              this.showToast(data?.message || data?.error || 'Error deleting snapshot', 'error');
            }
          } catch (e) {
            this.showToast('Error deleting snapshot: ' + e.message, 'error');
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
