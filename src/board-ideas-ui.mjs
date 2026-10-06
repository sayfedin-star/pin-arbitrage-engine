/**
 * src/board-ideas-ui.mjs
 *
 * Board Ideas Radar Dedicated Algorithmic Intelligence Studio UI
 * Pure ES Module generating the complete standalone HTML application.
 * Compatible with both Cloudflare Workers (V8 isolate) and Node.js.
 */

export function getBoardIdeasPageHtml(initialData = {}) {
  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Board Ideas Radar | Pinterest Algorithmic Recommendations Studio</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;600;700&display=swap" rel="stylesheet">
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
              50: '#f5f3ff',
              100: '#ede9fe',
              500: '#8b5cf6',
              600: '#7c3aed',
              700: '#6d28d9',
              900: '#4c1d95'
            }
          }
        }
      }
    };
  </script>
  <script defer src="https://unpkg.com/alpinejs@3.14.8/dist/cdn.min.js"></script>
  <script src="https://unpkg.com/lucide@latest"></script>
  <style>
    [x-cloak] { display: none !important; }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: rgba(148, 163, 184, 0.25); border-radius: 9999px; }
    ::-webkit-scrollbar-thumb:hover { background: rgba(148, 163, 184, 0.45); }
    .radar-grid {
      background-size: 24px 24px;
      background-image: radial-gradient(circle, rgba(139, 92, 246, 0.12) 1px, transparent 1px);
    }
  </style>
</head>
<body class="bg-slate-50 dark:bg-[#070913] text-slate-900 dark:text-slate-100 min-h-screen font-sans antialiased selection:bg-purple-500 selection:text-white"
      x-data="boardIdeasStudio()" x-init="init()">

  <!-- Toast Notification -->
  <div x-show="toast.show" x-cloak
       x-transition:enter="transition ease-out duration-300"
       x-transition:enter-start="opacity-0 translate-y-2"
       x-transition:enter-end="opacity-100 translate-y-0"
       x-transition:leave="transition ease-in duration-200"
       x-transition:leave-start="opacity-100 translate-y-0"
       x-transition:leave-end="opacity-0 translate-y-2"
       class="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-2xl shadow-2xl flex items-center space-x-3 text-xs font-semibold border backdrop-blur-md"
       :class="toast.type === 'success' ? 'bg-purple-950/90 border-purple-500/40 text-purple-300' : (toast.type === 'error' ? 'bg-rose-950/90 border-rose-500/40 text-rose-300' : 'bg-slate-900/90 border-slate-700 text-slate-200')">
    <i :data-lucide="toast.type === 'success' ? 'check-circle-2' : (toast.type === 'error' ? 'alert-triangle' : 'info')" class="w-4 h-4 shrink-0"></i>
    <span x-text="toast.message"></span>
  </div>

  <!-- Top Navigation Bar -->
  <header class="sticky top-0 z-40 bg-white/80 dark:bg-[#0c0e1a]/80 backdrop-blur-xl border-b border-slate-200/80 dark:border-slate-800/80 px-4 lg:px-8 py-3.5 transition-colors">
    <div class="max-w-[1720px] mx-auto flex items-center justify-between gap-4">
      
      <!-- Brand & Title -->
      <div class="flex items-center space-x-3.5">
        <div class="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-purple-600/25 shrink-0">
          <i data-lucide="radar" class="w-5 h-5"></i>
        </div>
        <div>
          <div class="flex items-center space-x-2">
            <h1 class="text-base sm:text-lg font-black tracking-tight text-slate-900 dark:text-white">Board Ideas Radar</h1>
            <span class="px-2 py-0.5 text-[10px] font-bold uppercase rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30 font-mono">Algorithmic Studio</span>
          </div>
          <p class="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block">Pinterest 'Find More Ideas' Algorithmic Recommendations & Save Velocity Arbitrage</p>
        </div>
      </div>

      <!-- Navigation & Actions -->
      <div class="flex items-center space-x-2 sm:space-x-3">
        <a href="/keywords" class="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 transition flex items-center space-x-1.5">
          <i data-lucide="sparkles" class="w-3.5 h-3.5 text-emerald-500"></i>
          <span class="hidden sm:inline">SERP Studio</span>
        </a>

        <a href="/" class="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white transition flex items-center space-x-1.5 shadow-sm shadow-purple-950/20 active:scale-95">
          <i data-lucide="layout-dashboard" class="w-3.5 h-3.5"></i>
          <span>Main Hub</span>
        </a>

        <!-- Dark/Light Theme Toggle -->
        <button @click="toggleTheme()" class="p-2 rounded-xl text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 transition">
          <i :data-lucide="darkMode ? 'sun' : 'moon'" class="w-4 h-4"></i>
        </button>
      </div>

    </div>
  </header>

  <!-- Main Container -->
  <main class="max-w-[1720px] mx-auto px-4 lg:px-8 py-6 space-y-6">

    <!-- ZONE 1: Dual-Source Board Omnibar -->
    <div class="p-4 sm:p-6 rounded-3xl bg-white dark:bg-[#0f1222] border border-slate-200 dark:border-slate-800/80 shadow-sm radar-grid">
      <div class="flex flex-col lg:flex-row items-stretch lg:items-center gap-4">
        
        <!-- Free Board URL Input -->
        <div class="flex-1 relative">
          <div class="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
            <i data-lucide="link" class="w-4 h-4"></i>
          </div>
          <input type="text" x-model="boardUrlInput" @keydown.enter="resolveAndInspectUrl()"
                 placeholder="Paste any Pinterest board URL (e.g. https://www.pinterest.com/makeourrecipe/dinner-recipes/)..."
                 class="w-full pl-10 pr-24 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500 transition placeholder:text-slate-400">
          <button @click="resolveAndInspectUrl()" :disabled="isLoading || !boardUrlInput.trim()"
                  class="absolute right-1.5 top-1.5 bottom-1.5 px-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition flex items-center space-x-1.5 disabled:opacity-40">
            <i data-lucide="search" class="w-3.5 h-3.5" :class="isLoading ? 'animate-spin' : ''"></i>
            <span>Inspect ⚡</span>
          </button>
        </div>

        <!-- Divider -->
        <div class="hidden lg:flex items-center text-xs font-bold text-slate-400 uppercase tracking-wider px-2">OR</div>

        <!-- Competitor Boards Picker Dropdown -->
        <div class="w-full lg:w-96 flex items-center gap-2">
          <div class="flex-1 relative">
            <div class="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-purple-400">
              <i data-lucide="folder-search" class="w-4 h-4"></i>
            </div>
            <select x-model="selectedBoardId" @change="onBoardSelectChange()"
                    class="w-full pl-10 pr-8 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500 transition cursor-pointer appearance-none">
              <option value="">Select pre-indexed board...</option>
              <optgroup label="⚡ Tracked Boards">
                <template x-for="b in trackedBoards" :key="b.board_id">
                  <option :value="b.board_id" x-text="b.name + ' (@' + b.username + ')'"></option>
                </template>
              </optgroup>
              <optgroup label="📁 Suggested Competitor Boards">
                <template x-for="b in suggestedBoards" :key="b.board_id">
                  <option :value="b.board_id" x-text="b.name + ' (@' + b.username + ' - ' + (b.pin_count || 0) + ' pins)'"></option>
                </template>
              </optgroup>
            </select>
            <div class="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400">
              <i data-lucide="chevron-down" class="w-4 h-4"></i>
            </div>
          </div>

          <!-- Sync Recommendations Button -->
          <button @click="syncActiveBoard()" :disabled="!activeBoardId || isSyncing"
                  class="px-3.5 py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold transition flex items-center space-x-1.5 shrink-0 disabled:opacity-40"
                  title="Harvest fresh Pinterest recommendations for this board">
            <i data-lucide="refresh-cw" class="w-3.5 h-3.5 text-purple-500" :class="isSyncing ? 'animate-spin' : ''"></i>
            <span class="hidden sm:inline">Sync 🔄</span>
          </button>
        </div>

      </div>
    </div>

    <!-- Empty State -->
    <template x-if="!activeBoard && !isLoading">
      <div class="py-16 text-center space-y-4 rounded-3xl bg-white dark:bg-[#0c0e1a] border border-slate-200 dark:border-slate-800/80">
        <div class="w-16 h-16 mx-auto rounded-3xl bg-purple-500/10 text-purple-500 flex items-center justify-center">
          <i data-lucide="compass" class="w-8 h-8"></i>
        </div>
        <div class="max-w-md mx-auto space-y-1">
          <h3 class="text-base font-bold text-slate-900 dark:text-white">No Board Selected</h3>
          <p class="text-xs text-slate-500 dark:text-slate-400">Enter any public Pinterest board link above or choose a competitor board from the dropdown to reveal Pinterest's secret algorithmic recommendation feed.</p>
        </div>
      </div>
    </template>

    <!-- Loading State -->
    <template x-if="isLoading">
      <div class="py-20 text-center space-y-3 rounded-3xl bg-white dark:bg-[#0c0e1a] border border-slate-200 dark:border-slate-800/80">
        <div class="w-10 h-10 mx-auto border-3 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
        <p class="text-xs font-semibold text-slate-500 dark:text-slate-400">Resolving authentic board state & fetching algorithmic recommendations...</p>
      </div>
    </template>

    <!-- Active Board Content -->
    <template x-if="activeBoard && !isLoading">
      <div class="space-y-6">

        <!-- ZONE 2: Board Overview & Volatility Ribbon -->
        <div class="p-6 rounded-3xl bg-white dark:bg-[#0c0e1a] border border-slate-200 dark:border-slate-800/80 space-y-6">
          
          <!-- Board Identity Header -->
          <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-100 dark:border-slate-800/80">
            <div class="flex items-center space-x-4">
              <div class="w-14 h-14 rounded-2xl bg-purple-900/30 border border-purple-500/30 overflow-hidden shrink-0 flex items-center justify-center text-purple-400">
                <template x-if="activeBoard.metadata?.image_cover_url || activeBoard.image_cover_url">
                  <img :src="activeBoard.metadata?.image_cover_url || activeBoard.image_cover_url" class="w-full h-full object-cover">
                </template>
                <template x-if="!activeBoard.metadata?.image_cover_url && !activeBoard.image_cover_url">
                  <i data-lucide="image" class="w-6 h-6"></i>
                </template>
              </div>
              <div>
                <div class="flex items-center space-x-2">
                  <h2 class="text-lg font-black text-slate-900 dark:text-white" x-text="activeBoard.name"></h2>
                  <a :href="activeBoard.url" target="_blank" rel="noopener" class="text-slate-400 hover:text-purple-400 transition">
                    <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                  </a>
                </div>
                <div class="flex items-center space-x-3 text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono">
                  <span>@<span x-text="activeBoard.username"></span></span>
                  <span>•</span>
                  <span>ID: <span x-text="activeBoard.board_id"></span></span>
                  <span>•</span>
                  <span>Shard #<span x-text="activeBoard.assigned_shard_id || 1"></span></span>
                  <template x-if="activeBoard.competitor_name">
                    <span class="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] font-sans font-bold text-purple-400" x-text="'Competitor: ' + activeBoard.competitor_name"></span>
                  </template>
                </div>
              </div>
            </div>

            <!-- Actions -->
            <div class="flex items-center space-x-2">
              <span class="text-xs text-slate-400 font-mono">
                Last Scanned: <span class="text-slate-200" x-text="activeBoard.last_scanned_at ? formatTimeAgo(activeBoard.last_scanned_at) : 'Never'"></span>
              </span>
              <button @click="untrackActiveBoard()" class="p-2 rounded-xl text-slate-400 hover:text-rose-400 bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 transition" title="Stop tracking board">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
              </button>
            </div>
          </div>

          <!-- Volatility KPIs Ribbon -->
          <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
            
            <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80">
              <div class="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>Recommendations</span>
                <i data-lucide="sparkles" class="w-3.5 h-3.5 text-purple-500"></i>
              </div>
              <div class="text-2xl font-black text-slate-900 dark:text-white mt-2" x-text="stats.total || 0"></div>
              <div class="text-[10px] text-slate-400 mt-1">Discovered Pins</div>
            </div>

            <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80">
              <div class="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>Viral Ideas (&ge;1k)</span>
                <i data-lucide="flame" class="w-3.5 h-3.5 text-rose-500"></i>
              </div>
              <div class="text-2xl font-black text-rose-500 mt-2" x-text="stats.high_volume || 0"></div>
              <div class="text-[10px] text-slate-400 mt-1">High Save Volume</div>
            </div>

            <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80">
              <div class="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>Avg Save Velocity</span>
                <i data-lucide="trending-up" class="w-3.5 h-3.5 text-amber-500"></i>
              </div>
              <div class="text-2xl font-black text-amber-400 mt-2 font-mono" x-text="'+' + (stats.avg_velocity || 0) + '/d'"></div>
              <div class="text-[10px] text-slate-400 mt-1">Saves Per Day</div>
            </div>

            <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80">
              <div class="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>New Entrants</span>
                <i data-lucide="star" class="w-3.5 h-3.5 text-emerald-400"></i>
              </div>
              <div class="text-2xl font-black text-emerald-400 mt-2" x-text="stats.new_count || 0"></div>
              <div class="text-[10px] text-slate-400 mt-1">Fresh Recommendations</div>
            </div>

            <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 col-span-2 sm:col-span-1">
              <div class="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>Fell Out</span>
                <i data-lucide="arrow-down-right" class="w-3.5 h-3.5 text-slate-400"></i>
              </div>
              <div class="text-2xl font-black text-slate-400 mt-2" x-text="droppedPins.length || 0"></div>
              <div class="text-[10px] text-slate-400 mt-1">Dropped Ideas</div>
            </div>

          </div>

          <!-- Movement Ribbon Counters -->
          <div class="flex flex-wrap items-center gap-2 pt-2 text-xs font-mono">
            <span class="px-2.5 py-1 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold" x-text="'★ ' + movementSummary.newCount + ' New Entrants'"></span>
            <span class="px-2.5 py-1 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20 font-bold" x-text="'▲ ' + movementSummary.climbedCount + ' Climbed'"></span>
            <span class="px-2.5 py-1 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20 font-bold" x-text="'▼ ' + movementSummary.droppedCount + ' Dropped Rank'"></span>
            <span class="px-2.5 py-1 rounded-xl bg-slate-500/10 text-slate-400 border border-slate-500/20 font-bold" x-text="'= ' + movementSummary.stableCount + ' Stable'"></span>
            <span class="px-2.5 py-1 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold" x-text="'❌ ' + droppedPins.length + ' Disappeared'"></span>
          </div>

        </div>

        <!-- ZONE 3: Ideas Matrix & Interactive Progression -->
        <div class="space-y-4">
          
          <!-- Tabs & View Controls -->
          <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
            <div class="flex items-center space-x-2">
              <button @click="activeTab = 'active'"
                      class="px-4 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2"
                      :class="activeTab === 'active' ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20' : 'text-slate-400 hover:text-white bg-slate-100 dark:bg-slate-900'">
                <i data-lucide="layout-grid" class="w-3.5 h-3.5"></i>
                <span>Active Recommendations (<span x-text="currentPins.length"></span>)</span>
              </button>
              <button @click="activeTab = 'dropped'"
                      class="px-4 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2"
                      :class="activeTab === 'dropped' ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20' : 'text-slate-400 hover:text-white bg-slate-100 dark:bg-slate-900'">
                <i data-lucide="archive-restore" class="w-3.5 h-3.5"></i>
                <span>Fell Out Ideas (<span x-text="droppedPins.length"></span>)</span>
              </button>
            </div>

            <!-- View Mode Switch (Grid vs Table) -->
            <div class="flex items-center space-x-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800">
              <button @click="viewMode = 'grid'" class="p-1.5 rounded-lg transition" :class="viewMode === 'grid' ? 'bg-white dark:bg-slate-800 text-purple-400 shadow-sm' : 'text-slate-400 hover:text-white'">
                <i data-lucide="grid" class="w-4 h-4"></i>
              </button>
              <button @click="viewMode = 'table'" class="p-1.5 rounded-lg transition" :class="viewMode === 'table' ? 'bg-white dark:bg-slate-800 text-purple-400 shadow-sm' : 'text-slate-400 hover:text-white'">
                <i data-lucide="list" class="w-4 h-4"></i>
              </button>
            </div>
          </div>

          <!-- TAB 1: Active Recommendations Grid View -->
          <div x-show="activeTab === 'active' && viewMode === 'grid'" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            <template x-for="pin in currentPins" :key="pin.pin_id">
              <div class="group rounded-2xl bg-white dark:bg-[#0f1222] border border-slate-200 dark:border-slate-800/80 hover:border-purple-500/50 transition-all overflow-hidden flex flex-col shadow-sm hover:shadow-xl hover:shadow-purple-900/10">
                
                <!-- Pin Image Container -->
                <div class="relative aspect-[2/3] bg-slate-100 dark:bg-slate-900 overflow-hidden cursor-pointer" @click="openLightbox(pin)">
                  <template x-if="pin.image_url">
                    <img :src="pin.image_url" loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300">
                  </template>
                  <template x-if="!pin.image_url">
                    <div class="w-full h-full flex items-center justify-center text-slate-500">
                      <i data-lucide="image-off" class="w-8 h-8"></i>
                    </div>
                  </template>

                  <!-- Top Badges -->
                  <div class="absolute top-2 left-2 flex flex-col gap-1">
                    <!-- Rank Badge -->
                    <span class="px-2 py-0.5 rounded-lg bg-black/75 backdrop-blur-md text-[10px] font-black text-white font-mono shadow-sm" x-text="'#' + pin.recommendation_rank"></span>
                    
                    <!-- Movement Badge -->
                    <template x-if="pin.metadata?.is_new">
                      <span class="px-1.5 py-0.5 rounded-lg bg-emerald-500/90 text-white text-[9px] font-black uppercase tracking-wider">NEW ★</span>
                    </template>
                    <template x-if="!pin.metadata?.is_new && pin.metadata?.rank_delta > 0">
                      <span class="px-1.5 py-0.5 rounded-lg bg-purple-500/90 text-white text-[9px] font-black font-mono" x-text="'▲ +' + pin.metadata.rank_delta"></span>
                    </template>
                    <template x-if="!pin.metadata?.is_new && pin.metadata?.rank_delta < 0">
                      <span class="px-1.5 py-0.5 rounded-lg bg-rose-500/90 text-white text-[9px] font-black font-mono" x-text="'▼ ' + pin.metadata.rank_delta"></span>
                    </template>
                  </div>

                  <!-- Quick Action: Visual Lens Hover Button -->
                  <div class="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button @click.stop="openVisualLens(pin)" class="p-2 rounded-xl bg-purple-600/90 hover:bg-purple-500 text-white shadow-lg backdrop-blur-md transition active:scale-95" title="Run Visual Lens on this Pin">
                      <i data-lucide="scan" class="w-3.5 h-3.5"></i>
                    </button>
                  </div>
                </div>

                <!-- Pin Info Body -->
                <div class="p-3 flex-1 flex flex-col justify-between space-y-2">
                  <h4 class="text-xs font-semibold text-slate-800 dark:text-slate-200 line-clamp-2 leading-tight" x-text="pin.title || 'Untitled Pin Idea'"></h4>
                  
                  <div class="pt-2 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between text-[11px] font-mono">
                    <div class="flex items-center space-x-1 text-slate-500 dark:text-slate-400">
                      <i data-lucide="bookmark" class="w-3 h-3 text-purple-400"></i>
                      <span class="font-bold text-slate-800 dark:text-slate-200" x-text="formatNumber(pin.save_count)"></span>
                    </div>

                    <div class="flex items-center space-x-0.5 font-bold" :class="getVelocityColorClass(pin.daily_save_velocity)">
                      <i data-lucide="zap" class="w-3 h-3"></i>
                      <span x-text="'+' + pin.daily_save_velocity + '/d'"></span>
                    </div>
                  </div>

                  <!-- Destination Link Pill -->
                  <template x-if="pin.domain">
                    <div class="text-[10px] text-slate-400 truncate flex items-center space-x-1">
                      <i data-lucide="globe" class="w-2.5 h-2.5 shrink-0"></i>
                      <span class="truncate" x-text="pin.domain"></span>
                    </div>
                  </template>
                </div>

              </div>
            </template>
          </div>

          <!-- TAB 1: Table View -->
          <div x-show="activeTab === 'active' && viewMode === 'table'" class="overflow-x-auto rounded-2xl bg-white dark:bg-[#0f1222] border border-slate-200 dark:border-slate-800/80">
            <table class="w-full text-left text-xs">
              <thead class="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                <tr>
                  <th class="py-3 px-4">Rank</th>
                  <th class="py-3 px-4">Pin Idea</th>
                  <th class="py-3 px-4 text-right">Saves</th>
                  <th class="py-3 px-4 text-right">Repins</th>
                  <th class="py-3 px-4 text-right">Daily Velocity</th>
                  <th class="py-3 px-4">Domain</th>
                  <th class="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60 font-sans">
                <template x-for="pin in currentPins" :key="pin.pin_id">
                  <tr class="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition">
                    <td class="py-3 px-4 font-mono font-bold">
                      <div class="flex items-center space-x-1.5">
                        <span class="text-slate-300 dark:text-slate-600">#</span>
                        <span x-text="pin.recommendation_rank"></span>
                        <template x-if="pin.metadata?.is_new">
                          <span class="px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[9px] font-mono">NEW</span>
                        </template>
                      </div>
                    </td>
                    <td class="py-3 px-4">
                      <div class="flex items-center space-x-3">
                        <img :src="pin.image_url" class="w-10 h-14 object-cover rounded-lg bg-slate-800 shrink-0 cursor-pointer" @click="openLightbox(pin)">
                        <div class="min-w-0">
                          <div class="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-md" x-text="pin.title || 'Untitled Pin Idea'"></div>
                          <div class="text-[10px] text-slate-400 font-mono mt-0.5">ID: <span x-text="pin.pin_id"></span></div>
                        </div>
                      </div>
                    </td>
                    <td class="py-3 px-4 text-right font-mono font-bold" x-text="formatNumber(pin.save_count)"></td>
                    <td class="py-3 px-4 text-right font-mono text-slate-400" x-text="formatNumber(pin.repin_count)"></td>
                    <td class="py-3 px-4 text-right font-mono font-bold" :class="getVelocityColorClass(pin.daily_save_velocity)" x-text="'+' + pin.daily_save_velocity + '/d'"></td>
                    <td class="py-3 px-4 text-slate-400 truncate max-w-[140px]" x-text="pin.domain || '-'"></td>
                    <td class="py-3 px-4 text-center">
                      <div class="flex items-center justify-center space-x-1.5">
                        <button @click="openVisualLens(pin)" class="p-1.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 transition" title="Visual Lens">
                          <i data-lucide="scan" class="w-3.5 h-3.5"></i>
                        </button>
                        <a :href="'https://www.pinterest.com/pin/' + pin.pin_id + '/'" target="_blank" rel="noopener" class="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:text-white text-slate-400 transition">
                          <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                        </a>
                      </div>
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>

          <!-- TAB 2: Dropped Pins View -->
          <div x-show="activeTab === 'dropped'" class="space-y-4">
            <template x-if="droppedPins.length === 0">
              <div class="py-12 text-center text-xs text-slate-400 bg-white dark:bg-[#0f1222] rounded-2xl border border-slate-200 dark:border-slate-800/80">
                No dropped ideas recorded yet. As daily snapshots accumulate, ideas removed by Pinterest will appear here.
              </div>
            </template>

            <div x-show="droppedPins.length > 0" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              <template x-for="pin in droppedPins" :key="pin.pin_id">
                <div class="rounded-2xl bg-white dark:bg-[#0f1222] border border-rose-500/20 p-3 space-y-2 opacity-80 hover:opacity-100 transition">
                  <div class="aspect-[2/3] rounded-xl overflow-hidden bg-slate-900">
                    <img :src="pin.image_url" class="w-full h-full object-cover">
                  </div>
                  <h4 class="text-xs font-semibold text-slate-300 truncate" x-text="pin.title || 'Untitled'"></h4>
                  <div class="flex items-center justify-between text-[10px] font-mono text-slate-400">
                    <span class="text-rose-400 font-bold">FELL OUT</span>
                    <span x-text="formatNumber(pin.save_count) + ' saves'"></span>
                  </div>
                </div>
              </template>
            </div>
          </div>

        </div>

      </div>
    </template>

  </main>

  <!-- Lightbox Modal -->
  <div x-show="lightboxPin" x-cloak
       class="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
       @click.self="lightboxPin = null">
    <div class="max-w-xl w-full bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden p-6 space-y-4">
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-bold text-white truncate" x-text="lightboxPin?.title || 'Pin Details'"></h3>
        <button @click="lightboxPin = null" class="text-slate-400 hover:text-white"><i data-lucide="x" class="w-5 h-5"></i></button>
      </div>
      <div class="aspect-[2/3] max-h-[60vh] mx-auto rounded-2xl overflow-hidden bg-black">
        <img :src="lightboxPin?.image_url" class="w-full h-full object-contain">
      </div>
      <div class="flex items-center justify-between text-xs font-mono text-slate-400">
        <span>Saves: <strong class="text-white" x-text="formatNumber(lightboxPin?.save_count)"></strong></span>
        <span>Velocity: <strong class="text-purple-400" x-text="'+' + lightboxPin?.daily_save_velocity + '/d'"></strong></span>
        <a :href="'https://www.pinterest.com/pin/' + lightboxPin?.pin_id + '/'" target="_blank" rel="noopener" class="text-purple-400 underline">View on Pinterest</a>
      </div>
    </div>
  </div>

  <!-- Studio Script -->
  <script>
    function boardIdeasStudio() {
      return {
        darkMode: true,
        isLoading: false,
        isSyncing: false,
        boardUrlInput: '',
        selectedBoardId: '',
        activeBoardId: '',
        activeBoard: null,
        trackedBoards: [],
        suggestedBoards: [],
        currentPins: [],
        droppedPins: [],
        stats: { total: 0, high_volume: 0, avg_velocity: 0, new_count: 0 },
        movementSummary: { newCount: 0, climbedCount: 0, droppedCount: 0, stableCount: 0 },
        activeTab: 'active',
        viewMode: 'grid',
        lightboxPin: null,
        toast: { show: false, message: '', type: 'info' },

        init() {
          this.loadAvailableBoards();
          lucide.createIcons();
        },

        async loadAvailableBoards() {
          try {
            const res = await fetch('/api/board-ideas/boards');
            if (res.ok) {
              const data = await res.json();
              this.trackedBoards = data.tracked_boards || [];
              this.suggestedBoards = data.suggested_boards || [];
              this.$nextTick(() => lucide.createIcons());
            }
          } catch (err) {
            console.warn('Failed to load boards:', err.message);
          }
        },

        async onBoardSelectChange() {
          if (!this.selectedBoardId) return;
          this.activeBoardId = this.selectedBoardId;
          await this.loadBoardDetails(this.activeBoardId);
        },

        async resolveAndInspectUrl() {
          const url = this.boardUrlInput.trim();
          if (!url) return;
          this.isLoading = true;

          try {
            const res = await fetch('/api/board-ideas/resolve', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url })
            });

            if (!res.ok) {
              const errData = await res.json().catch(() => ({}));
              throw new Error(errData.error || 'Failed to resolve board');
            }

            const data = await res.json();
            this.showToast('Board resolved successfully!', 'success');
            this.activeBoardId = data.board.board_id;
            this.selectedBoardId = data.board.board_id;
            await this.loadAvailableBoards();
            await this.loadBoardDetails(this.activeBoardId);
          } catch (err) {
            this.showToast(err.message, 'error');
          } finally {
            this.isLoading = false;
          }
        },

        async loadBoardDetails(boardId) {
          if (!boardId) return;
          this.isLoading = true;

          try {
            const res = await fetch('/api/board-ideas/details?board_id=' + encodeURIComponent(boardId));
            if (!res.ok) throw new Error('Failed to load board recommendations');
            const data = await res.json();
            
            this.activeBoard = data.board;
            this.currentPins = data.latest_snapshot?.pins || [];
            this.droppedPins = data.dropped_pins || [];
            this.stats = data.stats || { total: 0, high_volume: 0, avg_velocity: 0, new_count: 0 };

            // Compute movement indicators
            let n = 0, c = 0, d = 0, s = 0;
            for (const p of this.currentPins) {
              if (p.metadata?.is_new) n++;
              else if (p.metadata?.rank_delta > 0) c++;
              else if (p.metadata?.rank_delta < 0) d++;
              else s++;
            }
            this.movementSummary = { newCount: n, climbedCount: c, droppedCount: d, stableCount: s };

            this.$nextTick(() => lucide.createIcons());
          } catch (err) {
            this.showToast(err.message, 'error');
          } finally {
            this.isLoading = false;
          }
        },

        async syncActiveBoard() {
          if (!this.activeBoardId) return;
          this.isSyncing = true;

          try {
            const res = await fetch('/api/board-ideas/sync', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ board_id: this.activeBoardId, max_pages: 1 })
            });

            if (!res.ok) {
              const err = await res.json().catch(() => ({}));
              throw new Error(err.error || 'Sync failed');
            }

            const data = await res.json();
            this.showToast('Synced ' + data.total_synced + ' recommendations!', 'success');
            await this.loadBoardDetails(this.activeBoardId);
          } catch (err) {
            this.showToast(err.message, 'error');
          } finally {
            this.isSyncing = false;
          }
        },

        async untrackActiveBoard() {
          if (!this.activeBoardId || !confirm('Stop tracking this board? Historical snapshots will be cleared.')) return;
          try {
            await fetch('/api/board-ideas?board_id=' + encodeURIComponent(this.activeBoardId), { method: 'DELETE' });
            this.showToast('Board untracked', 'info');
            this.activeBoard = null;
            this.activeBoardId = '';
            this.selectedBoardId = '';
            await this.loadAvailableBoards();
          } catch (err) {
            this.showToast(err.message, 'error');
          }
        },

        openVisualLens(pin) {
          if (!pin) return;
          // Redirect or open visual lens search with query
          const targetUrl = '/keywords?q=' + encodeURIComponent(pin.title || pin.domain || pin.pin_id);
          window.open(targetUrl, '_blank');
        },

        openLightbox(pin) {
          this.lightboxPin = pin;
          this.$nextTick(() => lucide.createIcons());
        },

        formatNumber(num) {
          const n = Number(num || 0);
          if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
          if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
          return n.toString();
        },

        formatTimeAgo(dateStr) {
          if (!dateStr) return 'Never';
          const ms = Date.now() - new Date(dateStr).getTime();
          const mins = Math.floor(ms / 60000);
          if (mins < 60) return mins + 'm ago';
          const hrs = Math.floor(mins / 60);
          if (hrs < 24) return hrs + 'h ago';
          return Math.floor(hrs / 24) + 'd ago';
        },

        getVelocityColorClass(vel) {
          const v = Number(vel || 0);
          if (v >= 50) return 'text-purple-400';
          if (v >= 10) return 'text-emerald-400';
          if (v > 0) return 'text-amber-400';
          return 'text-slate-400';
        },

        toggleTheme() {
          this.darkMode = !this.darkMode;
          if (this.darkMode) document.documentElement.classList.add('dark');
          else document.documentElement.classList.remove('dark');
          this.$nextTick(() => lucide.createIcons());
        },

        showToast(message, type = 'info') {
          this.toast = { show: true, message, type };
          setTimeout(() => { this.toast.show = false; }, 4000);
        }
      };
    }
  </script>
</body>
</html>`;
}
