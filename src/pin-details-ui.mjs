/**
 * Dedicated Pin Intelligence Page UI (Level 3)
 * Pure ES Module generating the full HTML application for /pins/:pin_id and /pin/:pin_id.
 * Displays universal 4-pillar dossier, 6 KPIs, interactive SVG trajectory chart,
 * raw visual CV tags, and dynamic time-series audit log with atomic snapshot deletion.
 */

export function getPinDetailPageHtml(pinId = '') {
  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="referrer" content="no-referrer">
  <title>Universal Pin Dossier ${pinId} | Pinterest Arbitrage Intelligence</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          fontFamily: {
            sans: ['Inter', 'sans-serif'],
            mono: ['JetBrains Mono', 'monospace']
          },
          colors: {
            brand: {
              50: '#ecfdf5',
              100: '#d1fae5',
              500: '#10b981',
              600: '#059669',
              700: '#047857',
              900: '#064e3b'
            }
          }
        }
      }
    };
  </script>
  <script defer src="https://unpkg.com/alpinejs@3.13.3/dist/cdn.min.js"></script>
  <style>
    [x-cloak] { display: none !important; }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: rgba(148, 163, 184, 0.2); border-radius: 9999px; }
    ::-webkit-scrollbar-thumb:hover { background: rgba(148, 163, 184, 0.4); }
  </style>
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen antialiased flex flex-col font-sans" x-data="pinDetailApp('${pinId}')" x-init="init()">

  <!-- Toast Notification Container -->
  <div 
    x-show="toast.show" 
    x-transition:enter="transition ease-out duration-200"
    x-transition:enter-start="opacity-0 translate-y-2 scale-95"
    x-transition:enter-end="opacity-100 translate-y-0 scale-100"
    x-transition:leave="transition ease-in duration-150"
    x-transition:leave-start="opacity-100 translate-y-0 scale-100"
    x-transition:leave-end="opacity-0 translate-y-2 scale-95"
    class="fixed top-5 right-5 z-50 max-w-sm px-4 py-3 rounded-xl shadow-2xl border flex items-center gap-3 text-xs font-medium"
    :class="toast.type === 'error' ? 'bg-red-950/90 text-red-200 border-red-800/80' : 'bg-emerald-950/90 text-emerald-200 border-emerald-800/80'"
    x-cloak
  >
    <span x-text="toast.type === 'error' ? '⚠️' : '✅'" class="text-base"></span>
    <span x-text="toast.message" class="flex-1 font-sans"></span>
    <button @click="toast.show = false" class="text-slate-400 hover:text-white ml-2">✕</button>
  </div>

  <!-- Top Navigation Header -->
  <header class="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-40 px-6 py-3.5 flex items-center justify-between">
    <div class="flex items-center gap-6">
      <div class="flex items-center gap-3">
        <a href="/keywords" class="flex items-center gap-2 group">
          <div class="w-8 h-8 rounded-lg bg-pink-500/10 border border-pink-500/30 flex items-center justify-center text-pink-400 font-bold group-hover:scale-105 transition-transform">
            📌
          </div>
          <div>
            <div class="text-sm font-bold tracking-tight text-white flex items-center gap-2">
              Universal Pin Dossier
              <span class="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-pink-500/10 text-pink-400 border border-pink-500/30 font-normal" x-text="'#' + pinId"></span>
            </div>
            <div class="text-[11px] text-slate-400">Deterministic $O(1)$ Fleet Storage Shard Inspection</div>
          </div>
        </a>
      </div>

      <nav class="hidden md:flex items-center gap-1 text-xs">
        <a href="/keywords" class="px-3 py-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors">Keywords Radar</a>
        <a href="/keywords/discovery" class="px-3 py-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors">Discovery & Autocomplete</a>
        <a href="/folders" class="px-3 py-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors">Campaign Folders</a>
        <a href="/board-ideas" class="px-3 py-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors">Board Ideas</a>
        <a href="/" class="px-3 py-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors">Creator Archive</a>
      </nav>
    </div>

    <div class="flex items-center gap-3">
      <a :href="'https://www.pinterest.com/pin/' + pinId + '/'" target="_blank" rel="noopener noreferrer" class="px-3 py-1.5 rounded-lg bg-red-600/10 hover:bg-red-600/20 text-red-400 text-xs font-semibold border border-red-500/30 transition-colors flex items-center gap-1.5">
        <span>↗</span> Open on Pinterest
      </a>
      <button @click="loadDossier()" class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors flex items-center gap-1.5">
        <span :class="loading ? 'animate-spin' : ''">🔄</span> Refresh Telemetry
      </button>
    </div>
  </header>

  <!-- Loading State (Skeleton Shield) -->
  <div x-show="loading" class="flex-1 flex items-center justify-center p-12" x-cloak>
    <div class="flex flex-col items-center gap-3 max-w-sm text-center">
      <div class="w-10 h-10 border-2 border-pink-500 border-t-transparent rounded-full animate-spin"></div>
      <div class="text-sm font-semibold text-white">Resolving 4-Pillar Snowflake Dossier...</div>
      <div class="text-xs text-slate-400 font-mono">Routing deterministic CRC32 hash to Shard Fleet and fetching telemetry.</div>
    </div>
  </div>

  <!-- Error / Not Found Fallback Banner -->
  <div x-show="!loading && (!dossier || !dossier.success)" class="flex-1 flex items-center justify-center p-12" x-cloak>
    <div class="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-8 text-center flex flex-col items-center gap-4 shadow-2xl">
      <div class="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-2xl text-red-400">
        ⚠️
      </div>
      <div>
        <h2 class="text-base font-bold text-white">Pin Telemetry Not Found</h2>
        <p class="text-xs text-slate-400 mt-1">
          Pin <span class="font-mono text-pink-400 font-semibold" x-text="'#' + pinId"></span> is either offline, not yet crawled, or its target storage shard is cold.
        </p>
      </div>
      <div class="flex items-center gap-3 pt-2">
        <button @click="loadDossier()" class="px-4 py-2 rounded-lg bg-pink-600 hover:bg-pink-500 text-white text-xs font-semibold transition-colors">
          Retry Shard Fetch
        </button>
        <a href="/keywords" class="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors">
          Return to Radar
        </a>
      </div>
    </div>
  </div>

  <!-- Main Content Dossier -->
  <main x-show="!loading && dossier && dossier.success" class="flex-1 max-w-7xl w-full mx-auto p-6 flex flex-col gap-6" x-cloak>

    <!-- 1. Hero Card & Creative Identity Canvas -->
    <div class="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col lg:flex-row gap-6 relative overflow-hidden">
      
      <!-- Pinterest Standard 2:3 Ratio Preview Container -->
      <div class="w-full lg:w-80 flex-shrink-0 flex flex-col gap-3">
        <div 
          class="aspect-[2/3] w-full rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 relative shadow-2xl group flex items-center justify-center"
          :style="'background: radial-gradient(circle at center, ' + safeColor(dossier?.creative?.dominant_color) + '22 0%, #020617 100%)'"
        >
          <img 
            :src="dossier?.creative?.image_url || 'https://via.placeholder.com/600x900?text=Pin+Image'" 
            :alt="dossier?.creative?.title || 'Pin Creative'" 
            class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            loading="lazy"
          >
          <!-- Floating Shard & Aspect Ratio Badges -->
          <div class="absolute top-3 left-3 flex items-center gap-1.5">
            <span class="px-2 py-0.5 rounded-md bg-slate-950/90 backdrop-blur text-[10px] font-mono font-bold text-white border border-slate-700 shadow-sm">
              2:3 Aspect
            </span>
            <span class="px-2 py-0.5 rounded-md bg-emerald-500/20 backdrop-blur text-[10px] font-mono font-bold text-emerald-400 border border-emerald-500/30 shadow-sm" x-text="'Shard #' + dossier?.shard_id"></span>
          </div>

          <!-- Floating Dominant Color Indicator -->
          <div class="absolute bottom-3 left-3 right-3 p-2 rounded-xl bg-slate-950/80 backdrop-blur-md border border-slate-800 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="w-4 h-4 rounded-full border border-white/40 shadow-sm" :style="'background-color: ' + safeColor(dossier?.creative?.dominant_color)"></span>
              <span class="text-[11px] font-mono text-slate-300 font-semibold" x-text="safeColor(dossier?.creative?.dominant_color)"></span>
            </div>
            <span class="text-[10px] font-mono uppercase text-slate-400">Dominant Color</span>
          </div>
        </div>

        <!-- Telemetry Shard Footprint Summary -->
        <div class="p-3 rounded-xl bg-slate-950 border border-slate-800/80 flex items-center justify-between text-xs font-mono text-slate-400">
          <span>Target Fleet Affinity:</span>
          <span class="text-pink-400 font-semibold" x-text="'CRC32 Shard ' + dossier?.shard_id + ' / 99'"></span>
        </div>
      </div>

      <!-- Dossier Metadata Canvas & Cross-Pillar Breadcrumbs -->
      <div class="flex-1 flex flex-col justify-between gap-6">
        <div class="flex flex-col gap-4">
          
          <!-- Hierarchy Badges -->
          <div class="flex items-center gap-2 flex-wrap">
            <template x-if="dossier?.creative?.is_deleted">
              <span class="px-2.5 py-1 rounded-md text-xs font-bold border bg-rose-500/15 text-rose-400 border-rose-500/30 flex items-center gap-1.5 shadow-sm">
                <span>🗑️</span>
                <span>Pin Removed from Pinterest (404 / Suspended)</span>
              </span>
            </template>
            <span 
              class="px-2.5 py-1 rounded-md text-xs font-bold border"
              :class="dossier?.pillar_2_keywords_context?.highest_rank <= 10 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-pink-500/10 text-pink-400 border-pink-500/20'"
              x-text="'Rank #' + (dossier?.pillar_2_keywords_context?.highest_rank !== 999 ? dossier?.pillar_2_keywords_context?.highest_rank : 'SERP Listed')"
            ></span>
            <a 
              :href="safeUrl('https://' + (dossier?.creative?.domain || 'pinterest.com'))" 
              target="_blank" 
              rel="noopener noreferrer" 
              class="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-mono border border-slate-700 transition-colors flex items-center gap-1"
            >
              <span>🌐</span>
              <span x-text="dossier?.creative?.domain || 'pinterest.com'"></span>
              <span>↗</span>
            </a>
            <template x-if="dossier?.pillar_1_creator_context?.creator_username">
              <a 
                :href="safeUrl(dossier?.pillar_1_creator_context?.creator_url)" 
                target="_blank" 
                rel="noopener noreferrer" 
                class="px-2.5 py-1 rounded-md bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-xs font-semibold border border-blue-500/20 transition-colors flex items-center gap-1"
              >
                <span>👤</span>
                <span x-text="'@' + dossier?.pillar_1_creator_context?.creator_username"></span>
              </a>
            </template>
            <template x-if="dossier?.pillar_1_creator_context?.board_name">
              <span class="px-2.5 py-1 rounded-md bg-amber-500/10 text-amber-400 text-xs font-mono border border-amber-500/20 flex items-center gap-1">
                <span>📁</span>
                <span x-text="dossier?.pillar_1_creator_context?.board_name"></span>
              </span>
            </template>
          </div>

          <!-- Main Pin Title & Description -->
          <div class="flex flex-col gap-2">
            <h1 class="text-2xl font-bold text-white tracking-tight leading-snug" x-text="dossier?.creative?.title || 'Pin #' + pinId"></h1>
            <p class="text-xs text-slate-300 leading-relaxed max-w-3xl" x-text="dossier?.creative?.description || 'No descriptive body captured for this pin.'"></p>
          </div>

          <!-- SEO Alt-Text Container & 1-Click Clipboard Copy -->
          <div class="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-start justify-between gap-4">
            <div class="flex flex-col gap-1 flex-1">
              <div class="flex items-center gap-2">
                <span class="text-[10px] font-mono uppercase tracking-wider text-pink-400 font-bold">Pinterest SEO Alt-Text</span>
                <span class="text-[10px] text-slate-500 font-mono">Organic Keyword Extraction Target</span>
              </div>
              <p class="text-xs text-slate-300 font-mono leading-relaxed" x-text="dossier?.creative?.alt_text || 'No SEO alt-text metadata captured on asset.'"></p>
            </div>
            <button 
              @click="copyAltText()" 
              class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-mono border border-slate-700 whitespace-nowrap transition-colors flex items-center gap-1.5 shadow-sm"
              title="Copy alt text to clipboard"
            >
              <span>📋</span>
              <span>Copy Alt Text</span>
            </button>
          </div>
        </div>

        <!-- Raw Visual Computer Vision Annotations -->
        <div class="flex flex-col gap-2 pt-4 border-t border-slate-800/80">
          <div class="flex items-center justify-between">
            <span class="text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
              <span>🏷️</span> Raw Visual Annotations (Computer Vision Entities):
            </span>
            <span class="text-[10px] font-mono text-slate-500" x-text="(dossier?.creative?.visual_annotations?.length || 0) + ' visual tags detected'"></span>
          </div>
          <div class="flex items-center gap-1.5 flex-wrap">
            <template x-for="tag in dossier?.creative?.visual_annotations || []" :key="tag">
              <span class="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 font-mono flex items-center gap-1 hover:border-pink-500/50 hover:text-pink-300 transition-colors">
                <span class="text-pink-400 font-bold">#</span>
                <span x-text="tag"></span>
              </span>
            </template>
            <span x-show="!dossier?.creative?.visual_annotations?.length" class="text-xs text-slate-500 italic font-mono">No raw visual tags recorded on this creative.</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 2. The 6 KPI Telemetry Cards Grid -->
    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      <div class="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between shadow-lg">
        <div class="text-[11px] font-mono text-slate-400 flex items-center justify-between">
          <span>Total Saves</span>
          <span class="text-emerald-400 text-[10px]" x-text="computeDeltaUnified(0, 'save_count') > 0 ? '+' + computeDeltaUnified(0, 'save_count') + ' 24h' : ''"></span>
        </div>
        <div class="text-2xl font-bold font-mono text-emerald-400 mt-2" x-text="formatNumber(peakSaves())"></div>
        <div class="text-[10px] text-slate-500 font-mono mt-1">Peak Authentic Saves</div>
      </div>

      <div class="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between shadow-lg">
        <div class="text-[11px] font-mono text-slate-400 flex items-center justify-between">
          <span>Total Repins</span>
          <span class="text-pink-400 text-[10px]" x-text="computeDeltaUnified(0, 'repin_count') > 0 ? '+' + computeDeltaUnified(0, 'repin_count') + ' 24h' : ''"></span>
        </div>
        <div class="text-2xl font-bold font-mono text-pink-400 mt-2" x-text="formatNumber(peakRepins())"></div>
        <div class="text-[10px] text-slate-500 font-mono mt-1">Direct Viral Shares</div>
      </div>

      <div class="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between shadow-lg">
        <div class="text-[11px] font-mono text-slate-400">Daily Velocity</div>
        <div class="text-2xl font-bold font-mono text-amber-400 mt-2" x-text="'+' + peakVelocity() + '/d'"></div>
        <div class="text-[10px] text-slate-500 font-mono mt-1">Net Saves Acceleration</div>
      </div>

      <div class="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between shadow-lg">
        <div class="text-[11px] font-mono text-slate-400">Best Rank</div>
        <div class="text-2xl font-bold font-mono text-cyan-400 mt-2" x-text="peakRank()"></div>
        <div class="text-[10px] text-slate-500 font-mono mt-1">Peak SERP Position</div>
      </div>

      <div class="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between shadow-lg">
        <div class="text-[11px] font-mono text-slate-400">Total Engagement</div>
        <div class="text-2xl font-bold font-mono text-purple-400 mt-2" x-text="formatNumber(totalEngagementScore())"></div>
        <div class="text-[10px] text-slate-500 font-mono mt-1">Comments + Reactions</div>
      </div>

      <div class="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between shadow-lg">
        <div class="text-[11px] font-mono text-slate-400">SERP Footprint</div>
        <div class="text-2xl font-bold font-mono text-blue-400 mt-2" x-text="(dossier?.pillar_2_keywords_context?.serp_impressions || 0) + ' KWs'"></div>
        <div class="text-[10px] text-slate-500 font-mono mt-1">Ranking Keywords Count</div>
      </div>
    </div>

    <!-- 3. The 4-Pillar Cross-Context Matrix -->
    <div class="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col gap-4">
      <div class="flex items-center justify-between border-b border-slate-800 pb-3">
        <div class="flex items-center gap-2">
          <span class="text-base">🧬</span>
          <h2 class="text-sm font-bold text-white uppercase tracking-wider font-mono">The 4-Pillar Cross-Context Matrix</h2>
        </div>
        <span class="text-xs font-mono text-slate-400">Cross-Module Value Flywheel</span>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        
        <!-- Pillar 1: Creator & Board Studio -->
        <div class="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col justify-between gap-3">
          <div class="flex flex-col gap-2">
            <span class="text-[10px] font-mono uppercase text-blue-400 font-bold flex items-center gap-1">
              <span>👤</span> Pillar 1: Creator & Board
            </span>
            <div class="text-xs text-white font-medium" x-text="dossier?.pillar_1_creator_context?.creator_username ? '@' + dossier?.pillar_1_creator_context?.creator_username : 'Unclaimed / Unknown'"></div>
            <div class="text-[11px] text-slate-400 font-mono" x-text="dossier?.pillar_1_creator_context?.board_name || 'No board association'"></div>
          </div>
          <div class="flex items-center justify-between pt-2 border-t border-slate-850">
            <span 
              class="text-[10px] font-mono px-2 py-0.5 rounded"
              :class="dossier?.pillar_1_creator_context?.competitor_tracked ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-800 text-slate-400'"
              x-text="dossier?.pillar_1_creator_context?.competitor_tracked ? 'Tracked Competitor' : 'Untracked Creator'"
            ></span>
            <a 
              x-show="dossier?.pillar_1_creator_context?.creator_url" 
              :href="dossier?.pillar_1_creator_context?.creator_url" 
              target="_blank" 
              rel="noopener noreferrer" 
              class="text-xs text-blue-400 hover:underline font-mono"
            >Profile ↗</a>
          </div>
        </div>

        <!-- Pillar 2: Keywords SERP Velocity -->
        <div class="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col justify-between gap-3">
          <div class="flex flex-col gap-2">
            <div class="flex items-center justify-between">
              <span class="text-[10px] font-mono uppercase text-emerald-400 font-bold flex items-center gap-1">
                <span>🎯</span> Pillar 2: Keywords SERP
              </span>
              <span class="text-[10px] font-mono text-slate-400" x-text="(dossier?.pillar_2_keywords_context?.ranking_keywords?.length || 0) + ' SERPs'"></span>
            </div>
            
            <div class="flex flex-col gap-1 max-h-24 overflow-y-auto pr-1">
              <template x-for="kw in (dossier?.pillar_2_keywords_context?.ranking_keywords || []).slice(0, 3)" :key="kw.keyword">
                <a 
                  :href="'/keywords/' + encodeURIComponent(kw.keyword)" 
                  target="_blank" 
                  class="flex items-center justify-between text-[11px] text-slate-300 hover:text-emerald-400 p-1 rounded bg-slate-900 border border-slate-800/80 transition-colors"
                >
                  <span class="truncate max-w-[120px]" x-text="kw.keyword"></span>
                  <span class="font-mono text-emerald-400 font-bold" x-text="'#' + kw.rank"></span>
                </a>
              </template>
              <div x-show="!dossier?.pillar_2_keywords_context?.ranking_keywords?.length" class="text-[11px] text-slate-500 italic">
                No active SERP rankings recorded.
              </div>
            </div>
          </div>
          <a href="/keywords" class="text-[10px] text-emerald-400 hover:underline font-mono text-right">View All Tracked Keywords →</a>
        </div>

        <!-- Pillar 3: Related Pins Semantic Radar -->
        <div class="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col justify-between gap-3">
          <div class="flex flex-col gap-2">
            <span class="text-[10px] font-mono uppercase text-pink-400 font-bold flex items-center gap-1">
              <span>🔮</span> Pillar 3: Related Pins
            </span>
            <div class="text-xs text-white">Semantic Similarity & Graph Edges</div>
            <p class="text-[11px] text-slate-400">Discover pins visually and algorithmically adjacent to this creative.</p>
          </div>
          <a 
            :href="dossier?.pillar_3_related_pins_context?.radar_url || '/api/keywords/visual-search?pin_id=' + pinId" 
            target="_blank" 
            class="px-2.5 py-1.5 rounded-lg bg-pink-600/10 hover:bg-pink-600/20 text-pink-400 text-xs font-semibold border border-pink-500/30 text-center transition-colors flex items-center justify-center gap-1"
          >
            <span>🔍 Launch Related Radar</span>
          </a>
        </div>

        <!-- Pillar 4: Board Ideas Studio Match -->
        <div class="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col justify-between gap-3">
          <div class="flex flex-col gap-2">
            <span class="text-[10px] font-mono uppercase text-purple-400 font-bold flex items-center gap-1">
              <span>💡</span> Pillar 4: Board Ideas Studio
            </span>
            <div class="text-xs text-white">Inferred Strategic Board:</div>
            <div class="text-[11px] text-purple-300 font-mono truncate" x-text="dossier?.pillar_4_board_ideas_context?.inferred_board_slug || 'General Board'"></div>
          </div>
          <a 
            :href="dossier?.pillar_4_board_ideas_context?.board_radar_url || '/board-ideas'" 
            class="px-2.5 py-1.5 rounded-lg bg-purple-600/10 hover:bg-purple-600/20 text-purple-400 text-xs font-semibold border border-purple-500/30 text-center transition-colors flex items-center justify-center gap-1"
          >
            <span>Studio Recommendations →</span>
          </a>
        </div>

      </div>
    </div>

    <!-- 4. Interactive SVG Trajectory Chart (Smooth Monotonic Daily Growth) -->
    <div class="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col gap-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="text-base">📈</span>
          <div>
            <h3 class="text-sm font-semibold text-white">Interactive Save Velocity Trajectory Chart</h3>
            <p class="text-[11px] text-slate-400 font-mono">Unified daily trajectory with non-decreasing monotonic baseline</p>
          </div>
        </div>
        <div class="flex items-center gap-4 text-xs font-mono text-slate-400">
          <span class="flex items-center gap-1.5">
            <span class="w-2.5 h-2.5 rounded-full bg-emerald-400"></span> Total Saves
          </span>
          <span class="flex items-center gap-1.5">
            <span class="w-2.5 h-2.5 rounded-full bg-amber-400"></span> Daily Velocity
          </span>
          <span class="text-slate-500" x-text="trajectoryData().length + ' daily points'"></span>
        </div>
      </div>

      <!-- Chart Canvas Container -->
      <div class="relative w-full h-56 bg-slate-950 rounded-xl p-4 border border-slate-800/80 overflow-hidden">
        <template x-if="trajectoryData().length >= 2">
          <svg class="w-full h-full overflow-visible" viewBox="0 0 800 180" preserveAspectRatio="none">
            <defs>
              <linearGradient id="emeraldGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stop-color="#10b981" stop-opacity="0.35"/>
                <stop offset="100%" stop-color="#10b981" stop-opacity="0.0"/>
              </linearGradient>
            </defs>
            <!-- Background Grid Lines -->
            <line x1="40" y1="30" x2="760" y2="30" stroke="#1e293b" stroke-width="1" stroke-dasharray="4"/>
            <line x1="40" y1="85" x2="760" y2="85" stroke="#1e293b" stroke-width="1" stroke-dasharray="4"/>
            <line x1="40" y1="140" x2="760" y2="140" stroke="#1e293b" stroke-width="1"/>

            <!-- Area Fill -->
            <path :d="buildSvgAreaPath()" fill="url(#emeraldGradient)" />

            <!-- Saves Trajectory Line -->
            <path :d="buildSvgLinePath()" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>

            <!-- Interactive Coordinate Points -->
            <template x-for="(pt, idx) in computeChartPoints()" :key="idx">
              <g class="cursor-pointer" @mouseenter="hoveredPoint = pt" @mouseleave="hoveredPoint = null">
                <circle :cx="pt.x" :cy="pt.y" r="4.5" fill="#020617" stroke="#10b981" stroke-width="2" class="hover:r-6 transition-all"/>
              </g>
            </template>
          </svg>
        </template>

        <!-- Tooltip Card when hovering -->
        <div 
          x-show="hoveredPoint" 
          class="absolute z-20 pointer-events-none p-2.5 rounded-lg bg-slate-900/95 backdrop-blur-md border border-slate-700 shadow-xl text-xs font-mono"
          :style="'left: ' + (hoveredPoint ? (hoveredPoint.x * 0.95) : 0) + 'px; top: 20px;'"
          x-cloak
        >
          <div class="text-[10px] text-slate-400 font-bold" x-text="hoveredPoint?.point?.snapshot_date"></div>
          <div class="text-emerald-400 font-bold" x-text="'Saves: ' + formatNumber(hoveredPoint?.point?.save_count)"></div>
          <div class="text-amber-400 text-[11px]" x-text="'Velocity: +' + (hoveredPoint?.point?.daily_save_velocity || 0) + '/d'"></div>
          <div class="text-cyan-400 text-[10px]" x-text="'Peak Rank: #' + (hoveredPoint?.point?.best_rank !== 999 ? (hoveredPoint?.point?.best_rank || hoveredPoint?.point?.rank_position || 'N/A') : (hoveredPoint?.point?.rank_position || 'N/A'))"></div>
        </div>

        <!-- Single or Zero Data Point State -->
        <div x-show="trajectoryData().length < 2" class="w-full h-full flex items-center justify-center text-center p-6 text-slate-500 font-mono text-xs">
          <div>
            <div class="text-xl mb-1">📊</div>
            <div>Insufficient time-series data points for dynamic trajectory curve.</div>
            <div class="text-[10px] text-slate-600 mt-1">Growth curves automatically render when 2 or more daily snapshots are recorded.</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 5. Time-Series Audit Log & Multi-SERP Trajectory -->
    <div class="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl flex flex-col">
      <div class="p-4 border-b border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-900/50">
        <div class="flex items-center gap-2">
          <span class="text-base">📅</span>
          <div>
            <h3 class="text-sm font-semibold text-white">Daily Snapshots & SERP Trajectory Audit</h3>
            <p class="text-[11px] text-slate-400 font-mono">Deterministic multi-keyword rank history with zero cross-keyword collision</p>
          </div>
        </div>

        <!-- View Mode Switcher -->
        <div class="flex items-center gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-mono">
          <button 
            @click="viewMode = 'unified'" 
            :class="viewMode === 'unified' ? 'bg-pink-600 text-white font-semibold' : 'text-slate-400 hover:text-white'"
            class="px-3 py-1 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <span>📅</span> Daily Unified (<span x-text="dossier?.daily_trajectory?.length || 0"></span>d)
          </button>
          <button 
            @click="viewMode = 'per_serp'" 
            :class="viewMode === 'per_serp' ? 'bg-pink-600 text-white font-semibold' : 'text-slate-400 hover:text-white'"
            class="px-3 py-1 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <span>🔍</span> Per-Keyword SERPs (<span x-text="dossier?.snapshots?.length || 0"></span>)
          </button>
        </div>
      </div>

      <!-- Keyword Filter Pills (Visible when in per_serp view mode) -->
      <div x-show="viewMode === 'per_serp' && uniqueKeywords().length > 1" class="px-4 py-2.5 bg-slate-950/80 border-b border-slate-800 flex items-center gap-2 overflow-x-auto text-xs font-mono">
        <span class="text-slate-500 text-[11px] whitespace-nowrap">Filter SERP:</span>
        <button 
          @click="selectedKeywordFilter = 'ALL'" 
          :class="selectedKeywordFilter === 'ALL' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'"
          class="px-2.5 py-1 rounded-lg border transition-colors whitespace-nowrap text-[11px]"
        >
          All SERPs (<span x-text="dossier?.snapshots?.length || 0"></span>)
        </button>
        <template x-for="kw in uniqueKeywords()" :key="kw.name">
          <button 
            @click="selectedKeywordFilter = kw.name" 
            :class="selectedKeywordFilter === kw.name ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'"
            class="px-2.5 py-1 rounded-lg border transition-colors whitespace-nowrap text-[11px] flex items-center gap-1"
          >
            <span class="text-emerald-400 font-bold">🎯</span>
            <span x-text="kw.name"></span>
            <span class="text-[10px] text-slate-500" x-text="'(' + kw.count + ')'"></span>
          </button>
        </template>
      </div>

      <!-- 5A. Unified Daily View Table (1 row per calendar day) -->
      <div x-show="viewMode === 'unified'" class="overflow-x-auto">
        <table class="w-full text-left text-xs font-mono">
          <thead class="bg-slate-950/60 border-b border-slate-800 text-slate-400 uppercase text-[10px]">
            <tr>
              <th class="p-3.5">Calendar Day</th>
              <th class="p-3.5">Peak Cumulative Saves</th>
              <th class="p-3.5">24h Net Δ</th>
              <th class="p-3.5">Daily Velocity</th>
              <th class="p-3.5">Peak SERP Rank</th>
              <th class="p-3.5">Active Ranking SERPs</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-800/60 text-slate-300">
            <template x-for="(d, idx) in dossier?.daily_trajectory || []" :key="d.snapshot_date">
              <tr class="hover:bg-slate-800/40 transition-colors">
                <td class="p-3.5 font-semibold text-white flex items-center gap-1.5">
                  <span>📅</span>
                  <span x-text="d.snapshot_date"></span>
                </td>
                <td class="p-3.5 text-emerald-400 font-bold" x-text="formatNumber(d.save_count)"></td>
                <td class="p-3.5">
                  <span 
                    :class="computeDeltaUnified(idx, 'save_count') > 0 ? 'text-emerald-400 font-semibold' : (computeDeltaUnified(idx, 'save_count') < 0 ? 'text-red-400' : 'text-slate-500')" 
                    x-text="computeDeltaUnified(idx, 'save_count') > 0 ? '+' + computeDeltaUnified(idx, 'save_count') : (computeDeltaUnified(idx, 'save_count') < 0 ? computeDeltaUnified(idx, 'save_count') : '0')"
                  ></span>
                </td>
                <td class="p-3.5 text-amber-400" x-text="'+' + (d.daily_save_velocity || 0) + '/d'"></td>
                <td class="p-3.5">
                  <span class="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-bold" x-text="d.best_rank !== 999 ? '#' + d.best_rank : 'SERP Listed'"></span>
                </td>
                <td class="p-3.5">
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <template x-for="kw in d.ranking_keywords || []" :key="kw.keyword">
                      <a 
                        :href="'/keywords/' + encodeURIComponent(kw.keyword)" 
                        target="_blank" 
                        class="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-[11px] text-slate-300 hover:text-emerald-400 hover:border-emerald-500/40 transition-colors flex items-center gap-1"
                      >
                        <span x-text="kw.keyword"></span>
                        <span class="text-emerald-400 font-bold" x-text="'#' + kw.rank"></span>
                      </a>
                    </template>
                    <span x-show="!d.ranking_keywords?.length" class="text-slate-500 text-[11px] italic">Universal metrics recorded</span>
                  </div>
                </td>
              </tr>
            </template>
            <tr x-show="!dossier?.daily_trajectory?.length">
              <td colspan="6" class="p-8 text-center text-slate-500 font-mono text-xs">
                No daily trajectory snapshots recorded yet.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 5B. Per-Keyword SERP Audit Table -->
      <div x-show="viewMode === 'per_serp'" class="overflow-x-auto">
        <table class="w-full text-left text-xs font-mono">
          <thead class="bg-slate-950/60 border-b border-slate-800 text-slate-400 uppercase text-[10px]">
            <tr>
              <th class="p-3.5">Snapshot Date</th>
              <th class="p-3.5">Keyword SERP</th>
              <th class="p-3.5">Rank Position</th>
              <th class="p-3.5">Total Saves</th>
              <th class="p-3.5">24h Saves Δ</th>
              <th class="p-3.5">Total Repins</th>
              <th class="p-3.5">Daily Velocity</th>
              <th class="p-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-800/60 text-slate-300">
            <template x-for="(s, idx) in filteredSnapshots()" :key="s.id">
              <tr class="hover:bg-slate-800/40 transition-colors">
                <td class="p-3.5 font-semibold text-white" x-text="s.snapshot_date"></td>
                <td class="p-3.5">
                  <template x-if="s.keyword_name">
                    <a 
                      :href="'/keywords/' + encodeURIComponent(s.keyword_name)" 
                      target="_blank" 
                      class="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:border-emerald-500/40 text-[11px] transition-colors inline-flex items-center gap-1"
                    >
                      <span>🎯</span>
                      <span x-text="s.keyword_name"></span>
                    </a>
                  </template>
                  <template x-if="!s.keyword_name">
                    <span class="text-slate-500 italic text-[11px]">Universal Shard</span>
                  </template>
                </td>
                <td class="p-3.5">
                  <span class="px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700" x-text="'#' + (s.rank_position || 'N/A')"></span>
                </td>
                <td class="p-3.5 text-emerald-400 font-bold" x-text="formatNumber(s.save_count)"></td>
                <td class="p-3.5">
                  <span 
                    :class="computeDeltaPerSerp(idx, 'save_count') > 0 ? 'text-emerald-400 font-semibold' : (computeDeltaPerSerp(idx, 'save_count') < 0 ? 'text-red-400' : 'text-slate-500')" 
                    x-text="computeDeltaPerSerp(idx, 'save_count') > 0 ? '+' + computeDeltaPerSerp(idx, 'save_count') : (computeDeltaPerSerp(idx, 'save_count') < 0 ? computeDeltaPerSerp(idx, 'save_count') : '0')"
                  ></span>
                </td>
                <td class="p-3.5 text-pink-400 font-bold" x-text="formatNumber(s.repin_count)"></td>
                <td class="p-3.5 text-amber-400" x-text="'+' + (s.daily_save_velocity || 0) + '/d'"></td>
                <td class="p-3.5 text-right">
                  <button 
                    @click="requestDeleteSnapshot(s.id)" 
                    class="px-2 py-1 rounded bg-red-950/40 hover:bg-red-900/60 text-red-400 hover:text-red-200 border border-red-800/40 text-[11px] transition-colors"
                    title="Delete snapshot from Shard"
                  >
                    Delete ✕
                  </button>
                </td>
              </tr>
            </template>
            <tr x-show="!filteredSnapshots().length">
              <td colspan="8" class="p-8 text-center text-slate-500 font-mono text-xs">
                No snapshots match the selected SERP filter.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

  </main>

  <!-- Delete Snapshot Confirmation Modal -->
  <div x-show="deleteModalOpen" class="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4" x-cloak>
    <div @click.away="deleteModalOpen = false" class="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl flex flex-col gap-4">
      <div class="flex items-center gap-3 text-red-400">
        <span class="text-xl">🗑️</span>
        <h3 class="text-sm font-bold text-white">Confirm Snapshot Deletion</h3>
      </div>
      <p class="text-xs text-slate-300">
        Are you sure you want to delete snapshot <span class="font-mono text-pink-400" x-text="'#' + snapshotToDelete"></span>? This will permanently remove the record from Shard <span class="font-mono text-emerald-400" x-text="'#' + dossier?.shard_id"></span>.
      </p>
      <div class="flex items-center justify-end gap-3 pt-2">
        <button @click="deleteModalOpen = false" class="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs">
          Cancel
        </button>
        <button @click="executeDeleteSnapshot()" :disabled="isDeleting" class="px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-colors">
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
        dossier: null,
        hoveredPoint: null,
        deleteModalOpen: false,
        snapshotToDelete: null,
        isDeleting: false,
        viewMode: 'unified', // 'unified' | 'per_serp'
        selectedKeywordFilter: 'ALL',
        toast: {
          show: false,
          message: '',
          type: 'success'
        },
        toastTimeout: null,

        async init() {
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

        async loadDossier() {
          this.loading = true;
          try {
            const res = await fetch('/api/pins/' + encodeURIComponent(this.pinId));
            if (res.ok) {
              const data = await res.json();
              this.dossier = data;
            } else {
              this.dossier = null;
              this.showToast('Pin not found or shard offline.', 'error');
            }
          } catch (e) {
            console.error('Error fetching pin dossier:', e);
            this.dossier = null;
            this.showToast('Network error loading pin dossier', 'error');
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

        latestSnapshot() {
          return this.dossier?.snapshots?.[0] || null;
        },

        peakSaves() {
          if (this.dossier?.daily_trajectory?.[0]?.save_count != null) {
            return this.dossier.daily_trajectory[0].save_count;
          }
          return this.latestSnapshot()?.save_count || this.dossier?.creative?.save_count || 0;
        },

        peakRepins() {
          if (this.dossier?.daily_trajectory?.[0]?.repin_count != null) {
            return this.dossier.daily_trajectory[0].repin_count;
          }
          return this.latestSnapshot()?.repin_count || 0;
        },

        peakVelocity() {
          if (this.dossier?.daily_trajectory?.[0]?.daily_save_velocity != null) {
            return this.dossier.daily_trajectory[0].daily_save_velocity;
          }
          return this.latestSnapshot()?.daily_save_velocity || 0;
        },

        peakRank() {
          const trRank = this.dossier?.daily_trajectory?.[0]?.best_rank;
          if (trRank && trRank !== 999) return '#' + trRank;
          const kwRank = this.dossier?.pillar_2_keywords_context?.highest_rank;
          if (kwRank && kwRank !== 999) return '#' + kwRank;
          return 'Top 50';
        },

        trajectoryData() {
          if (this.dossier?.daily_trajectory && this.dossier.daily_trajectory.length >= 2) {
            return [...this.dossier.daily_trajectory].reverse();
          }
          const seenDates = new Set();
          const deduped = [];
          const rev = [...(this.dossier?.snapshots || [])].reverse();
          for (const s of rev) {
            if (!seenDates.has(s.snapshot_date)) {
              seenDates.add(s.snapshot_date);
              deduped.push(s);
            }
          }
          return deduped;
        },

        uniqueKeywords() {
          const snaps = this.dossier?.snapshots || [];
          const counts = new Map();
          for (const s of snaps) {
            if (s.keyword_name) {
              counts.set(s.keyword_name, (counts.get(s.keyword_name) || 0) + 1);
            }
          }
          return Array.from(counts.entries()).map(([name, count]) => ({ name, count }));
        },

        filteredSnapshots() {
          const snaps = this.dossier?.snapshots || [];
          if (this.selectedKeywordFilter === 'ALL') return snaps;
          return snaps.filter(s => s.keyword_name === this.selectedKeywordFilter);
        },

        computeDeltaUnified(currentIdx, field) {
          const traj = this.dossier?.daily_trajectory || [];
          if (currentIdx >= traj.length - 1) return 0;
          const current = Number(traj[currentIdx]?.[field]) || 0;
          const previous = Number(traj[currentIdx + 1]?.[field]) || 0;
          return current - previous;
        },

        computeDeltaPerSerp(currentIdx, field) {
          const list = this.filteredSnapshots();
          if (currentIdx >= list.length - 1) return 0;
          const current = list[currentIdx];
          for (let i = currentIdx + 1; i < list.length; i++) {
            if (list[i].keyword_id === current.keyword_id || this.selectedKeywordFilter !== 'ALL') {
              const prevVal = Number(list[i]?.[field]) || 0;
              const currVal = Number(current?.[field]) || 0;
              return currVal - prevVal;
            }
          }
          return 0;
        },

        totalEngagementScore() {
          const s = this.latestSnapshot();
          if (!s) return 0;
          const c = isFinite(Number(s.comment_count)) ? Number(s.comment_count) : 0;
          const r = isFinite(Number(s.reaction_count)) ? Number(s.reaction_count) : 0;
          const sh = isFinite(Number(s.share_count)) ? Number(s.share_count) : 0;
          return c + r + sh;
        },

        computeChartPoints() {
          const points = this.trajectoryData();
          if (points.length < 2) return [];

          const values = points.map(s => (isFinite(Number(s.save_count)) ? Math.max(0, Number(s.save_count)) : 0));
          const minY = Math.min(...values);
          const maxY = Math.max(...values);
          const rangeY = (maxY - minY) || 1;

          const width = 800;
          const height = 180;
          const padX = 40;
          const padY = 30;

          return points.map((s, i) => {
            const x = padX + (i / (points.length - 1)) * (width - 2 * padX);
            const val = isFinite(Number(s.save_count)) ? Math.max(0, Number(s.save_count)) : 0;
            const y = (maxY === minY)
              ? (height / 2)
              : ((height - padY) - ((val - minY) / rangeY) * (height - 2 * padY));
            return { x, y, point: s };
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

        requestDeleteSnapshot(id) {
          this.snapshotToDelete = id;
          this.deleteModalOpen = true;
        },

        async executeDeleteSnapshot() {
          if (!this.snapshotToDelete || this.isDeleting) return;
          this.isDeleting = true;
          try {
            const res = await fetch('/api/pins/' + encodeURIComponent(this.pinId) + '/snapshots/' + this.snapshotToDelete, {
              method: 'DELETE'
            });
            const data = await res.json();
            if (res.ok && data.success) {
              this.dossier.snapshots = this.dossier.snapshots.filter(s => s.id !== this.snapshotToDelete);
              this.showToast('Snapshot #' + this.snapshotToDelete + ' deleted successfully');
              this.deleteModalOpen = false;
              this.snapshotToDelete = null;
            } else {
              this.showToast(data.message || 'Error deleting snapshot', 'error');
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
</body>
</html>`;
}
