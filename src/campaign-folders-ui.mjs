/**
 * Dedicated Campaign Folders & Crossover Studio UI (Level 4)
 * Pure ES Module generating the full HTML application for /folders and /folders/:id.
 * Multi-keyword cluster hub: Super-pins overlap, raw visual tags bridge matrix,
 * co-occurring power pairs with mathematical lift, monopoly SOV breakdown, and topic blueprint.
 */

export function getCampaignFoldersPageHtml(folderId = '') {
  // Sanitize folderId against script/attribute injection
  const rawId = String(folderId || '').trim();
  const safeFolderId = rawId.replace(/[^a-zA-Z0-9_-]/g, '');

  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="referrer" content="no-referrer">
  <title>Campaign Folders & Crossover Studio | Pinterest Arbitrage</title>
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
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen antialiased flex flex-col font-sans" x-data="foldersApp('${safeFolderId}')" x-init="init()">

  <!-- Toast Notification Container -->
  <div class="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
    <template x-for="toast in toasts" :key="toast.id">
      <div class="pointer-events-auto px-4 py-3 rounded-xl border text-xs shadow-2xl flex items-center justify-between gap-3 transition-all transform duration-300"
           :class="{
             'bg-emerald-950/90 border-emerald-500/40 text-emerald-200': toast.type === 'success',
             'bg-rose-950/90 border-rose-500/40 text-rose-200': toast.type === 'error',
             'bg-indigo-950/90 border-indigo-500/40 text-indigo-200': toast.type === 'info',
             'bg-amber-950/90 border-amber-500/40 text-amber-200': toast.type === 'warning'
           }">
        <span x-text="toast.message" class="font-medium"></span>
        <button @click="removeToast(toast.id)" class="text-slate-400 hover:text-white text-xs">✕</button>
      </div>
    </template>
  </div>

  <!-- Top Navigation Header -->
  <header class="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-40 px-6 py-3.5 flex items-center justify-between">
    <div class="flex items-center gap-6">
      <div class="flex items-center gap-3">
        <a href="/folders" class="flex items-center gap-2 group">
          <div class="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold group-hover:scale-105 transition-transform">
            📁
          </div>
          <div>
            <div class="text-sm font-bold tracking-tight text-white flex items-center gap-2">
              Campaign Folders Studio
              <span class="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 font-normal">Level 4</span>
            </div>
            <div class="text-[11px] text-slate-400">Multi-Keyword Clustering & Crossover Matrix</div>
          </div>
        </a>
      </div>

      <nav class="hidden md:flex items-center gap-1 text-xs">
        <a href="/keywords" class="px-3 py-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors">Keywords Radar</a>
        <a href="/keywords/discovery" class="px-3 py-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors">Discovery & Autocomplete</a>
        <a href="/folders" class="px-3 py-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 font-semibold border border-indigo-500/20">Campaign Folders</a>
        <a href="/board-ideas" class="px-3 py-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors">Board Ideas</a>
      </nav>
    </div>

    <div class="flex items-center gap-3">
      <template x-if="activeFolderId">
        <a href="/folders" class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition-colors flex items-center gap-1.5">
          <span>←</span> Back to Hub
        </a>
      </template>
      <button @click="openNewFolderModal = true" class="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm transition-colors flex items-center gap-1.5">
        <span>+</span> New Campaign Folder
      </button>
    </div>
  </header>

  <!-- Main View -->
  <main class="flex-1 max-w-7xl w-full mx-auto p-6 flex flex-col gap-6">

    <!-- ========================================================================= -->
    <!-- VIEW A: STUDIO VIEW (/folders/:id)                                       -->
    <!-- ========================================================================= -->
    <div x-show="activeFolderId" class="flex flex-col gap-6" x-cloak>

      <!-- Active Folder Studio Header -->
      <div class="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex items-center justify-between flex-wrap gap-4">
        <div class="flex items-center gap-4">
          <div class="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shadow-inner border border-white/10"
               :style="'background-color: ' + (activeFolder?.color ? activeFolder.color + '20' : '#6366f120')">
            <span x-text="activeFolder?.icon || '📁'">📁</span>
          </div>
          <div>
            <div class="flex items-center gap-3 flex-wrap">
              <h1 class="text-xl font-bold text-white tracking-tight" x-text="activeFolder?.name || 'Loading Folder...'"></h1>
              <span class="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-indigo-400 border border-slate-700" 
                    x-text="(activeFolder?.items?.length || crossoverData?.summary?.total_keywords || 0) + ' keywords in cluster'"></span>
            </div>
            <p class="text-xs text-slate-400 mt-1 max-w-2xl" x-text="activeFolder?.description || 'Campaign Topic Cluster & Cross-SERP Intelligence'"></p>
          </div>
        </div>

        <div class="flex items-center gap-3">
          <button @click="runCrossoverAnalysis(true)" :disabled="crossoverLoading" class="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold shadow-md transition-colors flex items-center gap-2">
            <span x-show="!crossoverLoading">⚡</span>
            <span x-show="crossoverLoading" class="animate-spin inline-block">⏳</span>
            <span x-text="crossoverLoading ? 'Recalculating Matrix...' : 'Re-Run Crossover Analysis'"></span>
          </button>
        </div>
      </div>

      <!-- Telemetry KPIs Bar -->
      <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div class="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex flex-col gap-1">
          <span class="text-[10px] font-mono uppercase tracking-wider text-slate-400">Cluster Keywords</span>
          <span class="text-xl font-bold font-mono text-white" x-text="crossoverData?.summary?.total_keywords || 0">0</span>
          <span class="text-[10px] text-slate-500">Tracked search SERPs</span>
        </div>
        <div class="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex flex-col gap-1">
          <span class="text-[10px] font-mono uppercase tracking-wider text-slate-400">Total Unique Pins</span>
          <span class="text-xl font-bold font-mono text-sky-400" x-text="formatNumber(crossoverData?.summary?.total_unique_pins || 0)">0</span>
          <span class="text-[10px] text-slate-500">In folder snapshots</span>
        </div>
        <div class="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex flex-col gap-1">
          <span class="text-[10px] font-mono uppercase tracking-wider text-slate-400">Super-Pins (>=2 Kw)</span>
          <span class="text-xl font-bold font-mono text-pink-400" x-text="formatNumber(crossoverData?.summary?.super_pins_count || 0)">0</span>
          <span class="text-[10px] text-slate-500">Cross-SERP dominators</span>
        </div>
        <div class="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex flex-col gap-1">
          <span class="text-[10px] font-mono uppercase tracking-wider text-slate-400">Universal Bridges</span>
          <span class="text-xl font-bold font-mono text-indigo-400" x-text="formatNumber(crossoverData?.summary?.universal_tags_count || 0)">0</span>
          <span class="text-[10px] text-slate-500">Visual tags (>=50% SERPs)</span>
        </div>
        <div class="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex flex-col gap-1">
          <span class="text-[10px] font-mono uppercase tracking-wider text-slate-400">Shared Pivots</span>
          <span class="text-xl font-bold font-mono text-amber-400" x-text="formatNumber(crossoverData?.summary?.shared_pivots_count || 0)">0</span>
          <span class="text-[10px] text-slate-500">Guided search connectors</span>
        </div>
        <div class="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex flex-col gap-1">
          <span class="text-[10px] font-mono uppercase tracking-wider text-slate-400">Monopoly Entities</span>
          <span class="text-xl font-bold font-mono text-emerald-400" x-text="(crossoverData?.domain_monopoly?.length || 0) + ' domains'">0</span>
          <span class="text-[10px] text-slate-500">Top commercial players</span>
        </div>
      </div>

      <!-- Active Drill-Down Filter Banner -->
      <div x-show="entityFilter.type" class="bg-indigo-950/40 border border-indigo-500/30 rounded-xl p-3 flex items-center justify-between" x-cloak>
        <div class="flex items-center gap-2 text-xs text-indigo-200">
          <span class="font-bold">🎯 Active Drill-Down Filter:</span>
          <span class="font-mono uppercase text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300" x-text="entityFilter.type"></span>
          <span class="font-mono font-semibold text-white" x-text="entityFilter.value"></span>
        </div>
        <button @click="clearEntityFilter()" class="text-xs px-2.5 py-1 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 transition-colors">
          ✕ Clear Drill-Down Filter
        </button>
      </div>

      <!-- Scope Switcher & Filter Bar -->
      <div class="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between flex-wrap gap-4">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-xs font-medium text-slate-400 mr-1">Scope:</span>
          <button @click="scopeFilter = 'all'" 
                  class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                  :class="scopeFilter === 'all' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'">
            All Cluster Pins
          </button>
          <button @click="scopeFilter = 'super_only'" 
                  class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
                  :class="scopeFilter === 'super_only' ? 'bg-pink-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'">
            <span>⭐</span> Super-Pins Only (>=2 SERPs)
          </button>
          <template x-if="activeFolder?.items?.length">
            <select x-model="scopeFilter" class="bg-slate-800 text-slate-200 border border-slate-700 rounded-lg text-xs py-1.5 px-2.5 font-mono">
              <option value="all">Filter by Keyword (All)</option>
              <template x-for="item in activeFolder.items" :key="item.keyword">
                <option :value="item.keyword" x-text="item.keyword"></option>
              </template>
            </select>
          </template>
        </div>

        <div class="flex items-center gap-3">
          <div class="relative">
            <input type="text" x-model="searchQuery" placeholder="Filter pins by title, domain, or tag..."
                   class="w-64 pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 font-sans focus:outline-none focus:border-indigo-500">
            <span class="absolute left-2.5 top-1.5 text-slate-500 text-xs">🔍</span>
          </div>
          <span class="text-xs font-mono text-slate-400" x-text="filteredSuperPins().length + ' pins shown'"></span>
        </div>
      </div>

      <!-- 1-Click Topic Cluster Blueprint & Content Generator Section -->
      <div x-show="crossoverData?.topic_cluster_blueprint" class="bg-gradient-to-br from-slate-900 to-indigo-950/40 border border-indigo-500/20 rounded-2xl p-6 shadow-xl flex flex-col gap-5" x-cloak>
        <div class="flex items-center justify-between flex-wrap gap-4 pb-4 border-b border-slate-800/80">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold text-lg">
              🎯
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h3 class="text-base font-bold text-white tracking-tight">Algorithmic Topic Cluster Blueprint</h3>
                <span class="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-medium">Auto-Synthesized</span>
              </div>
              <p class="text-xs text-slate-400 mt-0.5">High-converting pillar concept and 5 spoke pins generated from verified SERP intersections.</p>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <button @click="copyClusterSummary()" class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors flex items-center gap-1.5">
              <span>📋</span> Copy Master Blueprint
            </button>
            <button @click="downloadClusterCsv()" class="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-sm">
              <span>📥</span> Export CSV Content Plan
            </button>
          </div>
        </div>

        <!-- Pillar Concept & Seasonality Launch Window -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="md:col-span-2 bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col gap-2">
            <span class="text-[10px] font-mono uppercase text-indigo-400 tracking-wider font-semibold">Pillar Pin Concept</span>
            <div class="text-sm font-bold text-white tracking-tight" x-text="crossoverData?.topic_cluster_blueprint?.pillar_concept"></div>
            <div class="flex items-center gap-2 flex-wrap pt-1">
              <span class="text-[11px] text-slate-400">Target Keywords:</span>
              <template x-for="kw in (crossoverData?.topic_cluster_blueprint?.target_keywords || []).slice(0, 5)" :key="kw">
                <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700" x-text="kw"></span>
              </template>
            </div>
          </div>

          <div class="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col gap-2">
            <span class="text-[10px] font-mono uppercase text-amber-400 tracking-wider font-semibold">Seasonality & Launch Window</span>
            <div class="text-xs font-bold text-white" x-text="crossoverData?.seasonality?.recommended_launch_window || 'Year-round Evergreen'"></div>
            <div class="flex items-center gap-1 flex-wrap pt-1">
              <span class="text-[10px] text-slate-400">Peak Months:</span>
              <template x-for="pm in (crossoverData?.seasonality?.peak_months || [])" :key="pm">
                <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20" x-text="pm"></span>
              </template>
            </div>
          </div>
        </div>

        <!-- Spoke Pins Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <template x-for="spoke in (crossoverData?.topic_cluster_blueprint?.spoke_angles || [])" :key="spoke.angle_number">
            <div class="bg-slate-900/60 border border-slate-800/80 hover:border-slate-700 rounded-xl p-3.5 flex flex-col justify-between gap-3 transition-colors">
              <div class="flex flex-col gap-1.5">
                <div class="flex items-center justify-between">
                  <span class="text-[10px] font-mono font-bold text-indigo-400" x-text="'Spoke #' + spoke.angle_number"></span>
                  <span class="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700" x-text="spoke.recommended_format"></span>
                </div>
                <h4 class="text-xs font-semibold text-white tracking-tight line-clamp-2" x-text="spoke.angle_title"></h4>
                <p class="text-[11px] text-slate-400 line-clamp-2" x-text="spoke.hook_concept"></p>
              </div>

              <div class="pt-2 border-t border-slate-800/60 flex items-center justify-between text-[10px]">
                <span class="text-slate-400 font-mono truncate" x-text="'Kw: ' + spoke.target_keyword"></span>
                <span class="text-indigo-400 font-mono" x-text="spoke.recommended_aspect_ratio"></span>
              </div>
            </div>
          </template>
        </div>
      </div>

      <!-- SECTION 1: Multi-Ranking Super-Pins Table -->
      <div class="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl flex flex-col">
        <div class="p-4 border-b border-slate-800 flex items-center justify-between flex-wrap gap-3">
          <div class="flex items-center gap-2">
            <span class="text-base">⭐</span>
            <h3 class="text-sm font-semibold text-white tracking-tight">Multi-Ranking Super-Pins</h3>
            <span class="text-xs text-slate-400">(Pins ranking across 2 or more cluster search terms)</span>
          </div>
          <span class="text-xs font-mono text-slate-400" x-text="filteredSuperPins().length + ' matching pins'"></span>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs font-mono">
            <thead class="bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase text-[10px]">
              <tr>
                <th class="p-3.5">Pin Image & Dossier</th>
                <th class="p-3.5">Cross-SERP Overlap & Ranks</th>
                <th class="p-3.5">Domain & Creator</th>
                <th class="p-3.5">Total Saves</th>
                <th class="p-3.5">Daily Velocity</th>
                <th class="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-800/60 text-slate-300">
              <template x-for="sp in filteredSuperPins()" :key="sp.pin_id">
                <tr class="hover:bg-slate-800/40 transition-colors">
                  <td class="p-3.5">
                    <div class="flex items-center gap-3">
                      <div class="w-10 h-14 rounded bg-slate-800 border border-slate-700 overflow-hidden flex-shrink-0">
                        <img :src="sp.image_url || 'https://via.placeholder.com/60x90'" 
                             class="w-full h-full object-cover"
                             onerror="this.src='https://via.placeholder.com/60x90?text=Pin'">
                      </div>
                      <div class="flex flex-col gap-1 max-w-xs">
                        <a :href="'/pins/' + sp.pin_id" 
                           class="font-semibold text-white hover:text-indigo-400 transition-colors truncate block" 
                           x-text="sp.title || ('Pin #' + sp.pin_id)"></a>
                        <div class="flex items-center gap-1.5 flex-wrap">
                          <span class="text-[9px] font-mono px-1 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700" 
                                x-text="sp.format || 'ORGANIC PIN'"></span>
                          <span class="text-[9px] font-mono text-slate-500" x-text="sp.aspect_ratio || '2:3'"></span>
                        </div>
                      </div>
                    </div>
                  </td>

                  <td class="p-3.5">
                    <div class="flex flex-col gap-1.5">
                      <div class="flex items-center gap-1.5 flex-wrap">
                        <template x-for="rk in (sp.rankings || [])" :key="rk.keyword_id || rk.keyword">
                          <span class="px-2 py-0.5 rounded text-[10px] font-mono border flex items-center gap-1"
                                :class="rk.rank_position <= 3 
                                  ? 'bg-amber-500/10 text-amber-300 border-amber-500/30' 
                                  : rk.rank_position <= 10 
                                  ? 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30' 
                                  : 'bg-slate-800 text-slate-300 border-slate-700'">
                            <span x-text="rk.keyword"></span>
                            <span class="font-bold" x-text="'#' + rk.rank_position"></span>
                          </span>
                        </template>
                      </div>
                      <span class="text-[10px] text-slate-500" x-text="'Ranks in ' + sp.overlap_count + ' keywords (' + sp.overlap_percentage + '% coverage)'"></span>
                    </div>
                  </td>

                  <td class="p-3.5 font-sans">
                    <div class="flex flex-col gap-0.5">
                      <button @click="setEntityFilter('domain', sp.domain)" 
                              class="text-xs font-semibold text-white hover:text-indigo-400 text-left transition-colors truncate max-w-[140px]" 
                              x-text="sp.domain || 'direct'"></button>
                      <button @click="setEntityFilter('creator', sp.creator_username)" 
                              class="text-[11px] text-slate-400 hover:text-indigo-400 text-left transition-colors truncate max-w-[140px]" 
                              x-text="'@' + (sp.creator_username || 'anonymous')"></button>
                    </div>
                  </td>

                  <td class="p-3.5 font-bold font-mono text-emerald-400" x-text="formatNumber(sp.save_count)"></td>
                  <td class="p-3.5 font-mono text-amber-400" x-text="'+' + formatNumber(sp.daily_save_velocity) + '/d'"></td>

                  <td class="p-3.5 text-right font-sans">
                    <a :href="'/pins/' + sp.pin_id" class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors inline-block">
                      View Dossier →
                    </a>
                  </td>
                </tr>
              </template>

              <tr x-show="!filteredSuperPins().length">
                <td colspan="6" class="p-8 text-center text-slate-500 font-sans">
                  No super-pins found matching your current filter settings.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- SECTION 2: Universal Visual Annotations Overlap Matrix (Bridge Tags Heatmap) -->
      <div class="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl flex flex-col">
        <div class="p-4 border-b border-slate-800 flex items-center justify-between flex-wrap gap-3">
          <div class="flex items-center gap-2">
            <span class="text-base">🌉</span>
            <h3 class="text-sm font-semibold text-white tracking-tight">Raw Visual Tag Bridges Heatmap</h3>
            <span class="text-xs text-slate-400">(Computer Vision labels shared across multiple cluster search terms)</span>
          </div>
          <span class="text-xs font-mono text-slate-400" x-text="filteredTagBridges().length + ' bridge tags'"></span>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs font-mono">
            <thead class="bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase text-[10px]">
              <tr>
                <th class="p-3.5">Visual Tag Entity</th>
                <th class="p-3.5">Tier & Overlap %</th>
                <th class="p-3.5">Shared Keywords</th>
                <th class="p-3.5">Pin Occurrences</th>
                <th class="p-3.5">Combined Saves</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-800/60 text-slate-300">
              <template x-for="tb in filteredTagBridges().slice(0, 30)" :key="tb.raw_tag || tb.tag">
                <tr class="hover:bg-slate-800/40 transition-colors">
                  <td class="p-3.5">
                    <span class="font-bold text-white text-xs" x-text="tb.tag"></span>
                  </td>

                  <td class="p-3.5">
                    <div class="flex items-center gap-2">
                      <div class="w-20 bg-slate-800 rounded-full h-2 overflow-hidden">
                        <div class="h-full rounded-full transition-all"
                             :class="tb.overlap_percentage >= 80 ? 'bg-emerald-400' : tb.overlap_percentage >= 50 ? 'bg-indigo-400' : 'bg-slate-500'"
                             :style="'width: ' + tb.overlap_percentage + '%'"></div>
                      </div>
                      <span class="font-bold text-xs" 
                            :class="tb.overlap_percentage >= 80 ? 'text-emerald-400' : tb.overlap_percentage >= 50 ? 'text-indigo-400' : 'text-slate-400'"
                            x-text="tb.overlap_percentage + '%'"></span>
                      <span class="text-[9px] px-1.5 py-0.5 rounded font-sans uppercase font-semibold"
                            :class="tb.overlap_percentage >= 80 ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20' : tb.overlap_percentage >= 50 ? 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/20' : 'bg-slate-800 text-slate-400'"
                            x-text="tb.overlap_percentage >= 80 ? 'Master' : tb.overlap_percentage >= 50 ? 'Strong' : 'Secondary'"></span>
                    </div>
                  </td>

                  <td class="p-3.5">
                    <div class="flex items-center gap-1 flex-wrap">
                      <template x-for="kw in (tb.keywords || [])" :key="kw">
                        <span class="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 text-[10px]" x-text="kw"></span>
                      </template>
                    </div>
                  </td>

                  <td class="p-3.5 font-bold font-mono text-sky-400" x-text="formatNumber(tb.pin_count)"></td>
                  <td class="p-3.5 font-bold font-mono text-emerald-400" x-text="formatNumber(tb.total_saves)"></td>
                </tr>
              </template>

              <tr x-show="!filteredTagBridges().length">
                <td colspan="5" class="p-8 text-center text-slate-500 font-sans">
                  No visual tag bridges found across this cluster.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- SECTION 3: Co-Occurring Power Pairs Table (Lift >= 1.0) -->
      <div class="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl flex flex-col">
        <div class="p-4 border-b border-slate-800 flex items-center justify-between flex-wrap gap-3">
          <div class="flex items-center gap-2">
            <span class="text-base">⚡</span>
            <div>
              <h3 class="text-sm font-semibold text-white tracking-tight">Co-Occurring Visual Power Pairs</h3>
              <p class="text-[11px] text-slate-400 font-sans">
                Algorithmic association rules: Pairs with Lift(A,B) &gt; 1.0 co-occur significantly more than random chance.
              </p>
            </div>
          </div>
          <span class="text-xs font-mono text-slate-400" x-text="powerPairs.length + ' power pairs calculated'"></span>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs font-mono">
            <thead class="bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase text-[10px]">
              <tr>
                <th class="p-3.5">Synergy Pair (Tag A + Tag B)</th>
                <th class="p-3.5">Joint Occurrences N(A∩B)</th>
                <th class="p-3.5">Mathematical Lift</th>
                <th class="p-3.5">Confidence A→B</th>
                <th class="p-3.5 text-right">Creative Action</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-800/60 text-slate-300">
              <template x-for="pair in powerPairs.slice(0, 15)" :key="pair.tag_a + '_' + pair.tag_b">
                <tr class="hover:bg-slate-800/40 transition-colors">
                  <td class="p-3.5">
                    <div class="flex items-center gap-2">
                      <span class="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-bold" x-text="pair.tag_a"></span>
                      <span class="text-slate-500 font-bold">+</span>
                      <span class="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-bold" x-text="pair.tag_b"></span>
                    </div>
                  </td>

                  <td class="p-3.5 font-bold text-sky-400" x-text="pair.joint_count + ' pins'"></td>

                  <td class="p-3.5">
                    <span class="font-bold text-xs px-2 py-0.5 rounded"
                          :class="pair.lift >= 2.0 ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-300 border border-amber-500/20'"
                          x-text="pair.lift + 'x Lift'"></span>
                  </td>

                  <td class="p-3.5 text-slate-400" x-text="(pair.confidence * 100).toFixed(1) + '%'"></td>

                  <td class="p-3.5 text-right font-sans">
                    <button @click="copyVisualBlueprint(pair)" class="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm transition-colors flex items-center gap-1.5 ml-auto">
                      <span>📋</span> Copy Visual Blueprint
                    </button>
                  </td>
                </tr>
              </template>

              <tr x-show="!powerPairs.length">
                <td colspan="5" class="p-8 text-center text-slate-500 font-sans">
                  Computing co-occurring power pairs across this folder...
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- SECTION 4: Creator & Domain Monopoly Breakdown -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">

        <!-- Domain Monopoly Breakdown -->
        <div class="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl flex flex-col">
          <div class="p-4 border-b border-slate-800 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="text-base">🌐</span>
              <h3 class="text-sm font-semibold text-white tracking-tight">Domain Monopoly (Share of Voice)</h3>
            </div>
            <span class="text-xs font-mono text-slate-400" x-text="(crossoverData?.domain_monopoly?.length || 0) + ' domains'"></span>
          </div>

          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs font-mono">
              <thead class="bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                <tr>
                  <th class="p-3.5">Domain</th>
                  <th class="p-3.5">Keywords Covered</th>
                  <th class="p-3.5">Pins & SOV %</th>
                  <th class="p-3.5 text-right">Drill-Down</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-800/60 text-slate-300">
                <template x-for="dm in (crossoverData?.domain_monopoly || []).slice(0, 10)" :key="dm.domain">
                  <tr class="hover:bg-slate-800/40 transition-colors">
                    <td class="p-3.5 font-bold text-white max-w-[140px] truncate" x-text="dm.domain"></td>
                    <td class="p-3.5 font-mono text-indigo-400" x-text="dm.keywords_count + ' / ' + (crossoverData?.summary?.total_keywords || 1) + ' (' + dm.overlap_percentage + '%)'"></td>
                    <td class="p-3.5">
                      <div class="flex items-center gap-2">
                        <span class="font-bold text-emerald-400" x-text="dm.pin_count + ' pins'"></span>
                        <span class="text-[10px] text-slate-400" x-text="'(' + calcSov(dm.pin_count) + '% SOV)'"></span>
                      </div>
                    </td>
                    <td class="p-3.5 text-right font-sans">
                      <button @click="setEntityFilter('domain', dm.domain)" class="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs border border-slate-700 transition-colors">
                        Filter →
                      </button>
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Creator Monopoly Breakdown -->
        <div class="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl flex flex-col">
          <div class="p-4 border-b border-slate-800 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="text-base">👤</span>
              <h3 class="text-sm font-semibold text-white tracking-tight">Creator Monopoly (Whale Accounts)</h3>
            </div>
            <span class="text-xs font-mono text-slate-400" x-text="(crossoverData?.creator_monopoly?.length || 0) + ' creators'"></span>
          </div>

          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs font-mono">
              <thead class="bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                <tr>
                  <th class="p-3.5">Creator Handle</th>
                  <th class="p-3.5">Keywords Covered</th>
                  <th class="p-3.5">Pins & SOV %</th>
                  <th class="p-3.5 text-right">Drill-Down</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-800/60 text-slate-300">
                <template x-for="cm in (crossoverData?.creator_monopoly || []).slice(0, 10)" :key="cm.username">
                  <tr class="hover:bg-slate-800/40 transition-colors">
                    <td class="p-3.5 max-w-[140px] truncate">
                      <span class="font-bold text-white block truncate" x-text="cm.display_name || cm.username"></span>
                      <span class="text-[10px] text-slate-400 block truncate" x-text="'@' + cm.username"></span>
                    </td>
                    <td class="p-3.5 font-mono text-indigo-400" x-text="cm.keywords_count + ' / ' + (crossoverData?.summary?.total_keywords || 1) + ' (' + cm.overlap_percentage + '%)'"></td>
                    <td class="p-3.5">
                      <div class="flex items-center gap-2">
                        <span class="font-bold text-emerald-400" x-text="cm.pin_count + ' pins'"></span>
                        <span class="text-[10px] text-slate-400" x-text="'(' + calcSov(cm.pin_count) + '% SOV)'"></span>
                      </div>
                    </td>
                    <td class="p-3.5 text-right font-sans">
                      <button @click="setEntityFilter('creator', cm.username)" class="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs border border-slate-700 transition-colors">
                        Filter →
                      </button>
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
        </div>

      </div>

    </div>

    <!-- ========================================================================= -->
    <!-- VIEW B: HUB VIEW (/folders)                                               -->
    <!-- ========================================================================= -->
    <div x-show="!activeFolderId" class="flex flex-col gap-6" x-cloak>

      <!-- Hub Header & Summary -->
      <div class="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex items-center justify-between flex-wrap gap-4">
        <div>
          <div class="flex items-center gap-3">
            <h1 class="text-xl font-bold text-white tracking-tight">Campaign Folders Hub</h1>
            <span class="text-xs font-mono px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/30" x-text="foldersList.length + ' clusters'"></span>
          </div>
          <p class="text-xs text-slate-400 mt-1">Organize tracked keywords into niche topic clusters and analyze cross-SERP super-pin crossover.</p>
        </div>

        <button @click="openNewFolderModal = true" class="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md transition-colors flex items-center gap-2">
          <span>+</span> Create New Campaign Folder
        </button>
      </div>

      <!-- Quick KPI Stats for All Folders -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col gap-1">
          <span class="text-[11px] font-mono text-slate-400">Total Campaign Folders</span>
          <span class="text-2xl font-bold font-mono text-white" x-text="foldersList.length">0</span>
        </div>
        <div class="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col gap-1">
          <span class="text-[11px] font-mono text-slate-400">Tracked Keywords Across Folders</span>
          <span class="text-2xl font-bold font-mono text-indigo-400" x-text="totalKeywordsCount()">0</span>
        </div>
        <div class="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col gap-1">
          <span class="text-[11px] font-mono text-slate-400">Crossover Engine Readiness</span>
          <span class="text-2xl font-bold font-mono text-emerald-400">100% Operational</span>
        </div>
      </div>

      <!-- Folders Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <template x-for="f in foldersList" :key="f.id">
          <div class="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col justify-between gap-5 hover:border-slate-700 transition-all group">
            <div class="flex flex-col gap-3">
              <div class="flex items-center justify-between">
                <div class="w-10 h-10 rounded-xl flex items-center justify-center text-xl shadow-inner border border-white/10"
                     :style="'background-color: ' + (f.color ? f.color + '20' : '#6366f120')">
                  <span x-text="f.icon || '📁'">📁</span>
                </div>
                <span class="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-indigo-400 border border-slate-700 font-semibold" 
                      x-text="(f.keyword_count || 0) + ' keywords'"></span>
              </div>

              <div>
                <h3 class="text-base font-bold text-white tracking-tight group-hover:text-indigo-300 transition-colors" x-text="f.name"></h3>
                <p class="text-xs text-slate-400 mt-1 line-clamp-2" x-text="f.description || 'Campaign cluster for Pinterest arbitrage'"></p>
              </div>

              <!-- Keyword Preview Chips -->
              <div class="flex items-center gap-1.5 flex-wrap pt-1">
                <template x-for="kw in (f.keywords_preview || []).slice(0, 3)" :key="kw.id || kw.keyword">
                  <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800/80 text-slate-300 border border-slate-700/60 truncate max-w-[120px]" x-text="kw.keyword"></span>
                </template>
                <template x-if="(f.keywords_preview || []).length > 3">
                  <span class="text-[10px] font-mono text-slate-500" x-text="'+' + ((f.keywords_preview || []).length - 3) + ' more'"></span>
                </template>
              </div>
            </div>

            <div class="pt-4 border-t border-slate-800/80 flex items-center justify-between">
              <a :href="'/folders/' + f.id" class="px-3 py-1.5 rounded-lg bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 hover:text-indigo-300 text-xs font-semibold border border-indigo-500/20 transition-colors flex items-center gap-1.5">
                Open Studio →
              </a>
              <button @click="confirmDeleteFolder(f.id)" class="text-slate-500 hover:text-rose-400 text-xs transition-colors p-1">
                Delete
              </button>
            </div>
          </div>
        </template>
      </div>

      <!-- Empty State -->
      <div x-show="!foldersList.length && !foldersLoading" class="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center flex flex-col items-center justify-center gap-4">
        <div class="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-3xl">
          📁
        </div>
        <div class="max-w-md">
          <h3 class="text-base font-bold text-white tracking-tight">No Campaign Folders Yet</h3>
          <p class="text-xs text-slate-400 mt-1">
            Group your tracked keywords into campaign topic clusters to discover super-pins, shared visual tags, and generate comprehensive content blueprints.
          </p>
        </div>
        <button @click="openNewFolderModal = true" class="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md transition-colors">
          + Create First Campaign Folder
        </button>
      </div>

    </div>

  </main>

  <!-- New Folder Modal -->
  <div x-show="openNewFolderModal" class="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4" x-cloak>
    <div @click.away="openNewFolderModal = false" class="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl flex flex-col gap-4">
      <div class="flex items-center justify-between border-b border-slate-800 pb-3">
        <h3 class="text-sm font-bold text-white flex items-center gap-2">
          <span>📁</span> Create New Campaign Folder
        </h3>
        <button @click="openNewFolderModal = false" class="text-slate-400 hover:text-white">✕</button>
      </div>

      <div class="flex flex-col gap-3">
        <div>
          <label class="text-xs text-slate-400 block mb-1">Folder Name *</label>
          <input type="text" x-model="newFolderName" placeholder="e.g. High-Velocity Dinners 2026" class="w-full p-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs font-mono focus:outline-none focus:border-indigo-500">
        </div>
        <div>
          <label class="text-xs text-slate-400 block mb-1">Description (Optional)</label>
          <textarea x-model="newFolderDesc" rows="3" placeholder="Target niche, seasonal strategy, and monetized destination links..." class="w-full p-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs font-sans focus:outline-none focus:border-indigo-500"></textarea>
        </div>
        <div>
          <label class="text-xs text-slate-400 block mb-1">Color Theme</label>
          <div class="flex items-center gap-2">
            <template x-for="c in colorOptions" :key="c">
              <button @click="newFolderColor = c" 
                      class="w-7 h-7 rounded-lg border-2 transition-transform"
                      :class="newFolderColor === c ? 'scale-110 border-white' : 'border-transparent'"
                      :style="'background-color: ' + c"></button>
            </template>
          </div>
        </div>
      </div>

      <div class="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
        <button @click="openNewFolderModal = false" class="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs">Cancel</button>
        <button @click="createFolder()" :disabled="!newFolderName.trim()" class="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold">Create Folder</button>
      </div>
    </div>
  </div>

  <!-- Delete Confirmation Modal -->
  <div x-show="deleteModalFolderId" class="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4" x-cloak>
    <div class="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl flex flex-col gap-4 text-center">
      <div class="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center text-xl mx-auto">
        🗑️
      </div>
      <div>
        <h3 class="text-sm font-bold text-white">Delete Campaign Folder?</h3>
        <p class="text-xs text-slate-400 mt-1">This will remove the folder grouping. The underlying tracked keywords and pin snapshots will remain preserved.</p>
      </div>
      <div class="flex items-center justify-center gap-3 pt-2">
        <button @click="deleteModalFolderId = null" class="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium">Cancel</button>
        <button @click="executeDeleteFolder()" class="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold">Delete Folder</button>
      </div>
    </div>
  </div>

  <script>
    function foldersApp(activeFolderId) {
      return {
        activeFolderId,
        foldersList: [],
        foldersLoading: false,
        activeFolder: null,
        crossoverData: null,
        crossoverLoading: false,
        openNewFolderModal: false,
        newFolderName: '',
        newFolderDesc: '',
        newFolderColor: '#6366f1',
        deleteModalFolderId: null,
        scopeFilter: 'all',
        searchQuery: '',
        entityFilter: { type: null, value: null },
        powerPairs: [],
        toasts: [],
        colorOptions: ['#6366f1', '#ec4899', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4'],

        async init() {
          if (this.activeFolderId) {
            await this.loadActiveFolder();
          } else {
            await this.loadFolders();
          }
        },

        showToast(message, type = 'info') {
          const id = Date.now() + Math.random();
          this.toasts.push({ id, message, type });
          setTimeout(() => this.removeToast(id), 4000);
        },

        removeToast(id) {
          this.toasts = this.toasts.filter(t => t.id !== id);
        },

        async loadFolders() {
          this.foldersLoading = true;
          try {
            const res = await fetch('/api/folders');
            if (res.ok) {
              const data = await res.json();
              this.foldersList = data.folders || [];
            } else {
              this.showToast('Failed to load campaign folders', 'error');
            }
          } catch (e) {
            console.error('Error loading folders:', e);
            this.showToast('Network error loading folders', 'error');
          } finally {
            this.foldersLoading = false;
          }
        },

        async loadActiveFolder() {
          try {
            const res = await fetch('/api/folders/' + this.activeFolderId);
            if (res.ok) {
              const data = await res.json();
              this.activeFolder = data.folder || null;
              if (this.activeFolder) {
                await this.runCrossoverAnalysis(false);
              }
            } else {
              this.showToast('Campaign folder not found', 'error');
            }
          } catch (e) {
            console.error('Error loading active folder:', e);
            this.showToast('Network error loading active folder', 'error');
          }
        },

        async runCrossoverAnalysis(isRefresh = false) {
          if (!this.activeFolderId) return;
          this.crossoverLoading = true;
          try {
            const res = await fetch('/api/folders/' + this.activeFolderId + '/raw-visual-crossover');
            if (res.ok) {
              const data = await res.json();
              this.crossoverData = data.crossover || data;
              this.computePowerPairs();
              if (isRefresh) {
                this.showToast('Crossover analysis recalculated successfully', 'success');
              }
            } else {
              this.showToast('Failed to compute crossover matrix', 'error');
            }
          } catch (e) {
            console.error('Error running crossover analysis:', e);
            this.showToast('Network error analyzing crossover', 'error');
          } finally {
            this.crossoverLoading = false;
          }
        },

        computePowerPairs() {
          const pins = this.crossoverData?.super_pins || [];
          if (!pins || pins.length < 2) {
            this.powerPairs = [];
            return;
          }

          const N_total = pins.length;
          const tagFreq = new Map();
          const pairFreq = new Map();

          // Stopwords filter for pairs
          const skipWords = new Set([
            'pin', 'pins', 'recipe', 'recipes', 'idea', 'ideas', 'food', 'dinner', 
            'meal', 'easy', 'quick', 'best', 'delicious', 'simple', 'diy', 'guide'
          ]);

          for (const pin of pins) {
            // Extract raw tags: visual annotations + title keywords
            const rawSet = new Set();
            for (const va of (pin.visual_annotations || [])) {
              if (typeof va === 'string' && va.trim().length >= 3) {
                const clean = va.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
                if (clean.length >= 3 && !skipWords.has(clean)) rawSet.add(clean);
              }
            }

            // Guardrail: Cap tags per pin at k <= 15 to avoid combinatorial explosion
            const pinTags = Array.from(rawSet).slice(0, 15);

            for (let i = 0; i < pinTags.length; i++) {
              const t1 = pinTags[i];
              tagFreq.set(t1, (tagFreq.get(t1) || 0) + 1);

              for (let j = i + 1; j < pinTags.length; j++) {
                const t2 = pinTags[j];
                const key = JSON.stringify(t1 < t2 ? [t1, t2] : [t2, t1]);
                pairFreq.set(key, (pairFreq.get(key) || 0) + 1);
              }
            }
          }

          const pairs = [];
          for (const [key, jointCount] of pairFreq.entries()) {
            if (jointCount >= 2) {
              const [t1, t2] = JSON.parse(key);
              const n1 = tagFreq.get(t1) || 1;
              const n2 = tagFreq.get(t2) || 1;
              // Phase 5: Standardized Laplace-smoothed Lift & Confidence:
              // Lift_smoothed = ((C_AB + 1) * (N + 4)) / ((C_A + 2) * (C_B + 2))
              const liftRaw = ((jointCount + 1) * (N_total + 4)) / ((n1 + 2) * (n2 + 2));
              const confRaw = (jointCount + 1) / (n1 + 2);

              const liftVal = Number.isFinite(liftRaw) ? Number(liftRaw.toFixed(2)) : 1.0;
              const confidence = Number.isFinite(confRaw) ? Number(confRaw.toFixed(2)) : 0.0;

              pairs.push({
                tag_a: t1.charAt(0).toUpperCase() + t1.slice(1),
                tag_b: t2.charAt(0).toUpperCase() + t2.slice(1),
                joint_count: jointCount,
                lift: liftVal,
                confidence: confidence
              });
            }
          }

          pairs.sort((a, b) => b.lift - a.lift || b.joint_count - a.joint_count);
          this.powerPairs = pairs;
        },

        copyVisualBlueprint(pair) {
          const folderName = String(this.activeFolder?.name || 'Topic Cluster').replace(/<[^>]*>/g, '').trim();
          const pillar = String(this.crossoverData?.topic_cluster_blueprint?.pillar_concept || folderName).replace(/<[^>]*>/g, '').trim();
          const launch = String(this.crossoverData?.seasonality?.recommended_launch_window || 'Evergreen').replace(/<[^>]*>/g, '').trim();
          const tagA = String(pair.tag_a || '').replace(/<[^>]*>/g, '').trim();
          const tagB = String(pair.tag_b || '').replace(/<[^>]*>/g, '').trim();

          const blueprint = [
            '📌 PINTEREST HIGH-CONVERTING VISUAL BLUEPRINT',
            '============================================',
            'Cluster: ' + folderName,
            'Power Synergy Pair: ' + tagA + ' + ' + tagB,
            'Mathematical Lift: ' + pair.lift + 'x (Joint Pins: ' + pair.joint_count + ')',
            'Pillar Concept: ' + pillar,
            'Recommended Launch: ' + launch,
            'Aspect Ratio: 2:3 Standard Vertical Canvas (1000x1500)',
            '',
            'CREATIVE COMPOSITION DIRECTION:',
            '• Focal Anchor: High-contrast close-up combining ' + tagA + ' and ' + tagB + '.',
            '• Overlay Headline: "The Ultimate ' + tagA + ' & ' + tagB + ' Guide"',
            '• Hook Subtitle: "Quick & Easy Step-by-Step Inspiration"',
            '• Color Palette: Warm, appetizing natural contrast with clean negative space.'
          ].join('\\n');

          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(blueprint).then(() => {
              this.showToast('Copied Visual Blueprint to clipboard!', 'success');
            }).catch(() => {
              this.showToast('Clipboard write failed', 'error');
            });
          }
        },

        copyClusterSummary() {
          const bp = this.crossoverData?.topic_cluster_blueprint;
          if (!bp) return;

          const folderName = String(bp.folder_name || 'Campaign').replace(/<[^>]*>/g, '').trim();
          const pillar = String(bp.pillar_concept || '').replace(/<[^>]*>/g, '').trim();
          const text = [
            '🎯 TOPIC CLUSTER MASTER BLUEPRINT: ' + folderName,
            'Pillar Concept: ' + pillar,
            'Universal Tags: ' + String(bp.universal_tag_blueprint || 'N/A').replace(/<[^>]*>/g, ''),
            'Top Connectors: ' + (bp.top_connectors || []).map(c => String(c).replace(/<[^>]*>/g, '')).join(', '),
            'Spoke Pins:',
            ...(bp.spoke_angles || []).map(s => '  • Spoke #' + s.angle_number + ': ' + String(s.angle_title || '').replace(/<[^>]*>/g, '') + ' (' + s.target_keyword + ' | ' + s.recommended_format + ')')
          ].join('\\n');

          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => {
              this.showToast('Copied Master Blueprint to clipboard!', 'success');
            }).catch(() => {
              this.showToast('Clipboard write failed', 'error');
            });
          }
        },

        sanitizeCsvCell(val) {
          let str = String(val == null ? '' : val);
          // CSV Formula Injection (DDE) Defense: Neutralize =, +, -, @, tab, newline prefixes
          const code = str.charCodeAt(0);
          if (code === 61 || code === 43 || code === 45 || code === 64 || code === 9 || code === 10 || code === 13) {
            str = "'" + str;
          }
          return '"' + str.replace(/"/g, '""') + '"';
        },

        downloadClusterCsv() {
          const rows = this.crossoverData?.topic_cluster_blueprint?.csv_rows;
          if (!rows || !rows.length) {
            this.showToast('No CSV content plan rows available', 'warning');
            return;
          }

          const headers = Object.keys(rows[0]);
          const csvLines = [
            headers.map(h => this.sanitizeCsvCell(h)).join(','),
            ...rows.map(r => headers.map(h => this.sanitizeCsvCell(r[h])).join(','))
          ];
          const csvString = csvLines.join('\\r\\n');

          const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = (this.activeFolder?.name || 'campaign').toLowerCase().replace(/[^a-z0-9]/g, '_') + '_content_plan.csv';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          this.showToast('Downloaded CSV Content Plan!', 'success');
        },

        setEntityFilter(type, value) {
          if (!value) return;
          this.entityFilter = { type, value };
          this.showToast('Filtered pins by ' + type + ': ' + value, 'info');
        },

        clearEntityFilter() {
          this.entityFilter = { type: null, value: null };
          this.showToast('Cleared drill-down filter', 'info');
        },

        filteredSuperPins() {
          let list = this.crossoverData?.super_pins || [];

          // 1. Scope filter
          if (this.scopeFilter === 'super_only') {
            list = list.filter(p => p.overlap_count >= 2);
          } else if (this.scopeFilter !== 'all') {
            const kw = this.scopeFilter.toLowerCase().trim();
            list = list.filter(p => (p.rankings || []).some(r => (r.keyword || '').toLowerCase().trim() === kw));
          }

          // 2. Entity filter (drill-down)
          if (this.entityFilter.type === 'domain') {
            const d = (this.entityFilter.value || '').toLowerCase().trim();
            list = list.filter(p => (p.domain || '').toLowerCase().includes(d));
          } else if (this.entityFilter.type === 'creator') {
            const c = (this.entityFilter.value || '').toLowerCase().trim();
            list = list.filter(p => (p.creator_username || 'anonymous').toLowerCase() === c);
          }

          // 3. Search query
          if (this.searchQuery.trim()) {
            const q = this.searchQuery.toLowerCase().trim();
            list = list.filter(p => 
              (p.title || '').toLowerCase().includes(q) ||
              (p.domain || '').toLowerCase().includes(q) ||
              (p.creator_username || '').toLowerCase().includes(q) ||
              (p.visual_annotations || []).some(va => String(va).toLowerCase().includes(q))
            );
          }

          return list;
        },

        filteredTagBridges() {
          let list = this.crossoverData?.tag_bridges || [];

          if (this.searchQuery.trim()) {
            const q = this.searchQuery.toLowerCase().trim();
            list = list.filter(tb => 
              (tb.tag || '').toLowerCase().includes(q) ||
              (tb.keywords || []).some(k => k.toLowerCase().includes(q))
            );
          }

          return list;
        },

        calcSov(pinCount) {
          const total = this.crossoverData?.summary?.total_unique_pins || 0;
          if (!total || total <= 0) return 0;
          const count = Number(pinCount) || 0;
          if (count <= 0) return 0;
          const pct = Math.round((count / total) * 100);
          return Math.min(100, Math.max(0, pct));
        },

        totalKeywordsCount() {
          return this.foldersList.reduce((acc, f) => acc + (f.keyword_count || 0), 0);
        },

        async createFolder() {
          if (!this.newFolderName.trim()) return;
          try {
            const res = await fetch('/api/folders', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: this.newFolderName.trim(),
                description: this.newFolderDesc.trim(),
                color: this.newFolderColor,
                icon: '📁'
              })
            });
            if (res.ok) {
              const data = await res.json();
              this.openNewFolderModal = false;
              this.newFolderName = '';
              this.newFolderDesc = '';
              this.showToast('Campaign folder created!', 'success');
              if (data.folder?.id) {
                window.location.href = '/folders/' + data.folder.id;
              } else {
                await this.loadFolders();
              }
            } else {
              this.showToast('Failed to create folder', 'error');
            }
          } catch (e) {
            this.showToast('Network error creating folder', 'error');
          }
        },

        confirmDeleteFolder(id) {
          this.deleteModalFolderId = id;
        },

        async executeDeleteFolder() {
          const id = this.deleteModalFolderId;
          if (!id) return;
          try {
            const res = await fetch('/api/folders/' + id, { method: 'DELETE' });
            if (res.ok) {
              this.foldersList = this.foldersList.filter(f => f.id !== id);
              this.deleteModalFolderId = null;
              this.showToast('Campaign folder deleted', 'success');
            } else {
              this.showToast('Failed to delete folder', 'error');
            }
          } catch (e) {
            this.showToast('Network error deleting folder', 'error');
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
