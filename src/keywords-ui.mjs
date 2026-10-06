/**
 * Keyword Intelligence & Velocity Dedicated Standalone Studio UI
 * Pure ES Module generating the full HTML application.
 * Compatible with both Cloudflare Workers (V8 isolate) and Node.js.
 */

export function getKeywordsPageHtml() {
  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Keyword Intelligence & Velocity | Pinterest SERP Radar Studio</title>
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
  <script defer src="https://unpkg.com/alpinejs@3.14.8/dist/cdn.min.js"></script>
  <script src="https://unpkg.com/lucide@latest"></script>
  <style>
    [x-cloak] { display: none !important; }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: rgba(148, 163, 184, 0.25); border-radius: 9999px; }
    ::-webkit-scrollbar-thumb:hover { background: rgba(148, 163, 184, 0.45); }
  </style>
</head>
<body class="bg-slate-50 dark:bg-[#070b14] text-slate-900 dark:text-slate-100 min-h-screen font-sans antialiased selection:bg-emerald-500 selection:text-white"
      x-data="keywordStudio()" x-init="init()">

  <!-- Toast Notification -->
  <div x-show="toast.show" x-cloak
       x-transition:enter="transition ease-out duration-300"
       x-transition:enter-start="opacity-0 translate-y-2"
       x-transition:enter-end="opacity-100 translate-y-0"
       x-transition:leave="transition ease-in duration-200"
       x-transition:leave-start="opacity-100 translate-y-0"
       x-transition:leave-end="opacity-0 translate-y-2"
       class="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-2xl shadow-2xl flex items-center space-x-3 text-xs font-semibold border backdrop-blur-md"
       :class="toast.type === 'success' ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-300' : (toast.type === 'error' ? 'bg-rose-950/90 border-rose-500/40 text-rose-300' : 'bg-slate-900/90 border-slate-700 text-slate-200')">
    <i :data-lucide="toast.type === 'success' ? 'check-circle-2' : (toast.type === 'error' ? 'alert-triangle' : 'info')" class="w-4 h-4 shrink-0"></i>
    <span x-text="toast.message"></span>
  </div>

  <!-- Top Navigation Bar -->
  <header class="sticky top-0 z-40 bg-white/80 dark:bg-[#0b1120]/80 backdrop-blur-xl border-b border-slate-200/80 dark:border-slate-800/80 px-4 lg:px-8 py-3.5 transition-colors">
    <div class="max-w-[1720px] mx-auto flex items-center justify-between gap-4">
      
      <!-- Brand & Title -->
      <div class="flex items-center space-x-3.5">
        <div class="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shadow-lg shadow-emerald-600/20 shrink-0">
          <i data-lucide="sparkles" class="w-5 h-5"></i>
        </div>
        <div>
          <div class="flex items-center space-x-2">
            <h1 class="text-base sm:text-lg font-black tracking-tight text-slate-900 dark:text-white">Keyword Intelligence & Velocity</h1>
            <span class="px-2 py-0.5 text-[10px] font-bold uppercase rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 font-mono">SERP Studio</span>
          </div>
          <p class="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block">Pinterest Organic SERP Rank Fluctuation, Velocity Tracking & Semantic Modifiers</p>
        </div>
      </div>

      <!-- Center: Multi-Fleet Project Indicator -->
      <div class="hidden xl:flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs">
        <i data-lucide="server" class="w-3.5 h-3.5 text-cyan-500"></i>
        <span class="text-slate-500">Fleet Project:</span>
        <select x-model="selectedProjectId" @change="onProjectChange()" class="bg-transparent text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none cursor-pointer">
          <option value="">Central Hub (Default)</option>
          <template x-for="p in fleetProjects" :key="p.project_id">
            <option :value="p.project_id" x-text="p.project_name + (p.is_hub ? ' [Hub]' : '')"></option>
          </template>
        </select>
      </div>

      <!-- Right Actions: Back to Main Hub, Trigger GHA, Theme Toggle -->
      <div class="flex items-center space-x-2 sm:space-x-3">
        <button @click="triggerWorkflow()" :disabled="isWorkflowDispatching"
                class="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 transition flex items-center space-x-1.5 disabled:opacity-50"
                title="Dispatch Autonomous SERP Sweep via GitHub Actions">
          <i data-lucide="play" class="w-3.5 h-3.5 text-emerald-500" :class="isWorkflowDispatching ? 'animate-spin' : ''"></i>
          <span class="hidden sm:inline">Run GitHub Crawler</span>
        </button>

        <a href="/board-ideas" class="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 transition flex items-center space-x-1.5 shadow-sm">
          <i data-lucide="radar" class="w-3.5 h-3.5 text-purple-500"></i>
          <span class="hidden sm:inline">Board Ideas</span>
        </a>

        <a href="/" class="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition flex items-center space-x-1.5 shadow-sm shadow-emerald-950/20 active:scale-95">
          <i data-lucide="arrow-left" class="w-3.5 h-3.5"></i>
          <span>Main Dashboard</span>
        </a>

        <!-- Dark/Light Theme Toggle -->
        <button @click="toggleTheme()" class="p-2 rounded-xl text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 transition">
          <i :data-lucide="darkMode ? 'sun' : 'moon'" class="w-4 h-4"></i>
        </button>
      </div>

    </div>
  </header>

  <!-- Main Container -->
  <main class="max-w-[1720px] mx-auto p-4 lg:p-8 space-y-6">

    <!-- ZONE 1: PREDICTIVE TYPEAHEAD OMNIBAR -->
    <section class="p-5 sm:p-6 rounded-3xl bg-gradient-to-br from-white via-slate-50 to-emerald-50/20 dark:from-[#0b1120] dark:via-[#090d18] dark:to-emerald-950/10 border border-slate-200/90 dark:border-slate-800 shadow-sm relative overflow-visible">
      <div class="max-w-4xl mx-auto space-y-3">
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-2">
            <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span class="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-mono">Predictive Autocomplete Omnibar (v3_typeahead)</span>
          </div>
          <span class="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:inline">Type 2+ letters for live Pinterest suggestions</span>
        </div>

        <!-- Input Bar with Category & Add Button -->
        <div class="relative flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <!-- Keyword input with icon -->
          <div class="relative flex-1">
            <i data-lucide="search" class="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2"></i>
            <input type="text" x-model="typeaheadQuery"
                   @input.debounce.350ms="onTypeaheadInput()"
                   @keydown.enter="submitAddKeyword()"
                   @focus="if(typeaheadSuggestions.length > 0) isTypeaheadOpen = true"
                   placeholder="Search or enter target query (e.g. baked potato, rustic decor, chicken dinner)..."
                   class="w-full pl-11 pr-10 py-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 shadow-xs transition">
            <div x-show="isTypeaheadLoading" class="absolute right-4 top-1/2 -translate-y-1/2">
              <i data-lucide="loader-2" class="w-4 h-4 text-emerald-500 animate-spin"></i>
            </div>
          </div>

          <!-- Category Selector -->
          <input type="text" x-model="newKeywordCategory" placeholder="Category (e.g. Recipes)"
                 class="sm:w-44 px-4 py-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 shadow-xs">

          <!-- Submit Button -->
          <button @click="submitAddKeyword()" :disabled="!typeaheadQuery.trim() || isSubmittingKeyword"
                  class="px-6 py-3 rounded-2xl text-xs font-extrabold uppercase tracking-wider bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white transition flex items-center justify-center space-x-2 shadow-md shadow-emerald-950/20 active:scale-95 disabled:opacity-50">
            <i data-lucide="plus" class="w-4 h-4"></i>
            <span>Track Keyword</span>
          </button>
        </div>

        <!-- Predictive Autocomplete Dropdown Menu -->
        <div x-show="isTypeaheadOpen && typeaheadSuggestions.length > 0" x-cloak
             @click.away="isTypeaheadOpen = false"
             class="absolute left-0 right-0 max-w-4xl mx-auto top-full mt-2 z-50 bg-white dark:bg-[#0d1526] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden p-2 space-y-1">
          <div class="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
            <span>Pinterest Trending Suggestions</span>
            <span class="text-emerald-500 font-mono">1-Click Track</span>
          </div>
          <div class="max-h-60 overflow-y-auto space-y-0.5">
            <template x-for="item in typeaheadSuggestions" :key="item">
              <div @click="selectSuggestion(item)"
                   class="px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-emerald-500/10 hover:text-emerald-600 dark:hover:text-emerald-400 cursor-pointer flex items-center justify-between transition">
                <div class="flex items-center space-x-2">
                  <i data-lucide="trending-up" class="w-3.5 h-3.5 text-emerald-500"></i>
                  <span x-text="item"></span>
                </div>
                <span class="text-[10px] text-slate-400 font-mono">+ Select</span>
              </div>
            </template>
          </div>
        </div>
      </div>
    </section>

    <!-- ZONE 2: KPI ANALYTICS RIBBON -->
    <section class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div class="p-4 rounded-2xl bg-white dark:bg-[#0b1120] border border-slate-200/80 dark:border-slate-800 flex items-center space-x-3.5 shadow-xs">
        <div class="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
          <i data-lucide="tag" class="w-5 h-5"></i>
        </div>
        <div>
          <p class="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Tracked Keywords</p>
          <p class="text-lg font-black text-slate-900 dark:text-white font-mono" x-text="keywords.length"></p>
        </div>
      </div>

      <div class="p-4 rounded-2xl bg-white dark:bg-[#0b1120] border border-slate-200/80 dark:border-slate-800 flex items-center space-x-3.5 shadow-xs">
        <div class="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 flex items-center justify-center shrink-0">
          <i data-lucide="layers" class="w-5 h-5"></i>
        </div>
        <div>
          <p class="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Total SERP Pins</p>
          <p class="text-lg font-black text-slate-900 dark:text-white font-mono" x-text="formatNumber(totalPinsCount)"></p>
        </div>
      </div>

      <div class="p-4 rounded-2xl bg-white dark:bg-[#0b1120] border border-slate-200/80 dark:border-slate-800 flex items-center space-x-3.5 shadow-xs">
        <div class="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
          <i data-lucide="activity" class="w-5 h-5"></i>
        </div>
        <div>
          <p class="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Save Velocity</p>
          <p class="text-lg font-black text-emerald-600 dark:text-emerald-400 font-mono" x-text="'+' + formatNumber(totalAvgVelocity) + '/day'"></p>
        </div>
      </div>

      <div class="p-4 rounded-2xl bg-white dark:bg-[#0b1120] border border-slate-200/80 dark:border-slate-800 flex items-center space-x-3.5 shadow-xs">
        <div class="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
          <i data-lucide="compass" class="w-5 h-5"></i>
        </div>
        <div>
          <p class="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Active Keyword</p>
          <p class="text-sm font-bold text-slate-900 dark:text-white truncate max-w-[140px]" x-text="selectedKeyword?.keyword || 'None'"></p>
        </div>
      </div>
    </section>

    <!-- ZONE 3: SPLIT STUDIO WORKSPACE (Keywords Navigator & Deep SERP Inspector) -->
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">

      <!-- LEFT PANE: KEYWORDS LIST NAVIGATOR (5 Columns) -->
      <div class="lg:col-span-4 xl:col-span-3 space-y-3">
        <div class="p-4 rounded-2xl bg-white dark:bg-[#0b1120] border border-slate-200/80 dark:border-slate-800 space-y-3 shadow-xs">
          <div class="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800/80">
            <span class="text-xs font-bold text-slate-900 dark:text-white">Keywords Index</span>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400" x-text="filteredKeywords.length + ' Total'"></span>
          </div>

          <!-- Search Filter -->
          <div class="relative">
            <i data-lucide="search" class="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"></i>
            <input type="text" x-model="keywordSearch" placeholder="Filter tracked queries..."
                   class="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/40">
          </div>

          <!-- Scrollable Keywords Cards List -->
          <div class="space-y-2 max-h-[720px] overflow-y-auto pr-1">
            <template x-for="kw in filteredKeywords" :key="kw.id">
              <div @click="selectKeyword(kw)"
                   class="p-3 rounded-xl border transition cursor-pointer relative group"
                   :class="selectedKeyword?.id === kw.id ? 'bg-emerald-500/10 border-emerald-500/40 shadow-xs' : 'bg-slate-50/70 dark:bg-slate-900/40 border-slate-200/80 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700'">
                <div class="flex items-start justify-between gap-2">
                  <div class="flex items-center space-x-2.5 min-w-0">
                    <template x-if="kw.top_pin_image">
                      <img :src="kw.top_pin_image" class="w-8 h-10 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0">
                    </template>
                    <template x-if="!kw.top_pin_image">
                      <div class="w-8 h-10 rounded-lg bg-slate-200 dark:bg-slate-800 flex items-center justify-center shrink-0">
                        <i data-lucide="image" class="w-3.5 h-3.5 text-slate-400"></i>
                      </div>
                    </template>
                    <div class="min-w-0">
                      <p class="text-xs font-bold text-slate-900 dark:text-white truncate" x-text="kw.keyword"></p>
                      <span class="text-[10px] text-slate-500 font-mono" x-text="kw.category || 'General'"></span>
                    </div>
                  </div>

                  <!-- Velocity Badge -->
                  <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold shrink-0"
                        :class="Number(kw.avg_daily_velocity || 0) > 0 ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'"
                        x-text="(Number(kw.avg_daily_velocity || 0) > 0 ? '+' : '') + Number(kw.avg_daily_velocity || 0) + ' v/d'"></span>
                </div>

                <!-- Mini Velocity Trend Sparkline -->
                <div class="mt-2 flex items-center justify-between px-1">
                  <span class="text-[9px] text-slate-400 font-mono">Velocity Sparkline:</span>
                  <svg class="w-16 h-3.5 overflow-visible" viewBox="0 0 80 20">
                    <path :d="generateSparklinePath(getSparklinePoints(kw), 80, 20)"
                          fill="none" :stroke="Number(kw.avg_daily_velocity || 0) > 0 ? '#10b981' : '#64748b'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </div>

                <!-- Hover actions footer -->
                <div class="mt-2 pt-2 border-t border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
                  <span class="font-mono text-[10px]" x-text="(kw.snapshots_count || 0) + ' / 50 pins'"></span>
                  <div class="flex items-center space-x-1.5">
                    <button @click.stop="rescanKeyword(kw.id)" :disabled="syncingKeywordId === kw.id"
                            class="p-1 rounded hover:bg-emerald-500/20 text-slate-400 hover:text-emerald-500 transition" title="Sync SERP now">
                      <i data-lucide="refresh-cw" class="w-3 h-3" :class="syncingKeywordId === kw.id ? 'animate-spin text-emerald-500' : ''"></i>
                    </button>
                    <button @click.stop="deleteKeyword(kw.id)"
                            class="p-1 rounded hover:bg-rose-500/20 text-slate-400 hover:text-rose-500 transition" title="Delete keyword">
                      <i data-lucide="trash-2" class="w-3 h-3"></i>
                    </button>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>

      <!-- RIGHT PANE: DEEP SERP & RANK FLUCTUATION INSPECTOR (7-9 Columns) -->
      <div class="lg:col-span-8 xl:col-span-9 space-y-4">
        
        <!-- Empty Selection State -->
        <template x-if="!selectedKeyword">
          <div class="p-12 rounded-3xl bg-white dark:bg-[#0b1120] border border-slate-200/80 dark:border-slate-800 text-center space-y-3">
            <div class="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-500 mx-auto flex items-center justify-center">
              <i data-lucide="mouse-pointer-click" class="w-6 h-6"></i>
            </div>
            <h3 class="text-base font-bold text-slate-900 dark:text-white">Select a Tracked Keyword</h3>
            <p class="text-xs text-slate-500 max-w-sm mx-auto">Click any keyword from the list on the left to inspect its live #1-#100 organic SERP rankings, save velocities, and movement deltas.</p>
          </div>
        </template>

        <!-- Selected Keyword Studio Container -->
        <template x-if="selectedKeyword">
          <div class="space-y-4">

            <!-- STREAMLINED STUDIO TOOLBAR -->
            <div class="p-4 rounded-3xl bg-white dark:bg-[#0b1120] border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3">
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div class="flex items-center space-x-3 min-w-0">
                  <div class="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
                    <i data-lucide="search" class="w-5 h-5"></i>
                  </div>
                  <div class="min-w-0">
                    <div class="flex items-center space-x-2">
                      <h2 class="text-base sm:text-lg font-black text-slate-900 dark:text-white truncate" x-text="selectedKeyword.keyword"></h2>
                      <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 shrink-0" x-text="selectedKeyword.category || 'General'"></span>
                      <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">100 Pins Target</span>
                    </div>
                    <p class="text-[11px] text-slate-500 font-mono truncate">
                      Last Crawled: <span x-text="formatDate(selectedKeyword.last_crawled_at)"></span>
                    </p>
                  </div>
                </div>

                <!-- Action Controls -->
                <div class="flex items-center space-x-2 shrink-0">
                  <button @click="rescanKeyword(selectedKeyword.id)" :disabled="isDetailsLoading || syncingKeywordId === selectedKeyword.id"
                          class="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition flex items-center space-x-1.5 shadow-sm active:scale-95 disabled:opacity-50 cursor-pointer">
                    <i data-lucide="refresh-cw" class="w-3.5 h-3.5" :class="(isDetailsLoading || syncingKeywordId === selectedKeyword.id) ? 'animate-spin' : ''"></i>
                    <span>Re-Crawl 100 Pins Now</span>
                  </button>
                  <button @click="copySEOFormula()" class="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition cursor-pointer" title="Copy SEO Formula">
                    <i data-lucide="copy" class="w-4 h-4"></i>
                  </button>
                  <a :href="'https://www.pinterest.com/search/pins/?q=' + encodeURIComponent(selectedKeyword.keyword)" target="_blank"
                     class="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition" title="Open on Pinterest">
                    <i data-lucide="external-link" class="w-4 h-4"></i>
                  </a>
                </div>
              </div>

              <!-- Compact 1-Row Volatility & Velocity Stats Strip -->
              <div class="grid grid-cols-2 sm:grid-cols-6 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
                <div class="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center">
                  <span class="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 block">▲ Climbed</span>
                  <span class="text-sm font-black text-emerald-700 dark:text-emerald-300 font-mono" x-text="selectedKeywordDetails?.stats?.climbed || 0"></span>
                </div>
                <div class="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-center">
                  <span class="text-[10px] font-bold text-rose-600 dark:text-rose-400 block">▼ Dropped</span>
                  <span class="text-sm font-black text-rose-700 dark:text-rose-300 font-mono" x-text="selectedKeywordDetails?.stats?.dropped || 0"></span>
                </div>
                <div class="p-2 rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-center">
                  <span class="text-[10px] font-bold text-slate-600 dark:text-slate-400 block">= Stable</span>
                  <span class="text-sm font-black text-slate-700 dark:text-slate-300 font-mono" x-text="selectedKeywordDetails?.stats?.stable || 0"></span>
                </div>
                <div class="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center">
                  <span class="text-[10px] font-bold text-amber-600 dark:text-amber-400 block">★ New</span>
                  <span class="text-sm font-black text-amber-700 dark:text-amber-300 font-mono" x-text="selectedKeywordDetails?.stats?.new_entries || 0"></span>
                </div>
                <div class="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-center">
                  <span class="text-[10px] font-bold text-purple-600 dark:text-purple-400 block">❌ Fell Out</span>
                  <span class="text-sm font-black text-purple-700 dark:text-purple-300 font-mono" x-text="selectedKeywordDetails?.stats?.dropped_out || 0"></span>
                </div>
                <div class="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-center">
                  <span class="text-[10px] font-bold text-cyan-600 dark:text-cyan-400 block">⚡ Velocity</span>
                  <span class="text-sm font-black text-cyan-700 dark:text-cyan-300 font-mono" x-text="'+' + (selectedKeywordDetails?.avg_velocity ?? selectedKeyword?.avg_daily_velocity ?? 0) + '/d'"></span>
                </div>
              </div>
            </div>

            <!-- TABBED WORKSPACE CONTAINER -->
            <div class="p-4 sm:p-5 rounded-3xl bg-white dark:bg-[#0b1120] border border-slate-200/80 dark:border-slate-800 space-y-4 shadow-xs">
              
              <!-- Tab Navigation Bar -->
              <div class="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 dark:border-slate-800/80 pb-3 gap-3">
                <div class="flex flex-wrap items-center gap-1.5 sm:gap-2">
                  <!-- Tab 1: SERP Rankings -->
                  <button @click="activeTab = 'serp'"
                          class="px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer"
                          :class="activeTab === 'serp' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30' : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'">
                    <i data-lucide="list-ordered" class="w-3.5 h-3.5"></i>
                    <span x-text="'SERP Rankings (#' + (filteredPins.length || 0) + ')'"></span>
                  </button>

                  <!-- Tab 2: Pin Intelligence -->
                  <button @click="activeTab = 'intelligence'"
                          class="px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer"
                          :class="activeTab === 'intelligence' ? 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30' : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'">
                    <i data-lucide="sparkles" class="w-3.5 h-3.5 text-purple-500"></i>
                    <span>Pin Intelligence</span>
                    <template x-if="selectedKeywordDetails?.intelligence?.opportunity">
                      <span class="px-1.5 py-0.2 rounded-full text-[9px] font-mono font-bold"
                            :class="selectedKeywordDetails.intelligence.opportunity.verdict === 'WIDE_OPEN' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : (selectedKeywordDetails.intelligence.opportunity.verdict === 'COMPETITIVE' ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400' : 'bg-rose-500/20 text-rose-600 dark:text-rose-400')"
                            x-text="selectedKeywordDetails.intelligence.opportunity.verdict === 'WIDE_OPEN' ? '🟢 Wide Open' : (selectedKeywordDetails.intelligence.opportunity.verdict === 'COMPETITIVE' ? '🟡 Moderate' : '🔴 Locked')"></span>
                    </template>
                  </button>

                  <!-- Tab 3: Semantic Guided Capsules -->
                  <button @click="activeTab = 'guides'"
                          class="px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer"
                          :class="activeTab === 'guides' ? 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30' : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'">
                    <i data-lucide="compass" class="w-3.5 h-3.5 text-cyan-500"></i>
                    <span>Guided Capsules</span>
                    <span class="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-cyan-500/20 text-cyan-600 font-bold" x-text="selectedKeywordDetails?.guides?.length || 0"></span>
                  </button>

                  <!-- Tab 4: Velocity Wave Chart -->
                  <button @click="activeTab = 'velocity_curve'"
                          class="px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer"
                          :class="activeTab === 'velocity_curve' ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30' : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'">
                    <i data-lucide="activity" class="w-3.5 h-3.5 text-amber-500"></i>
                    <span>Velocity Wave</span>
                  </button>

                  <!-- Tab 5: Fell Out Pins -->
                  <button @click="activeTab = 'dropped'"
                          class="px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer"
                          :class="activeTab === 'dropped' ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30' : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'">
                    <i data-lucide="arrow-down-left" class="w-3.5 h-3.5"></i>
                    <span>Fell Out</span>
                    <span class="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-rose-500/20 text-rose-600" x-text="selectedKeywordDetails?.dropped_out_pins?.length || 0"></span>
                  </button>
                </div>

                <span class="text-[11px] text-slate-400 font-mono" x-text="(selectedKeywordDetails?.current_pins?.length || 0) + ' Organic Pins Indexed (Target: 100)'"></span>
              </div>

              <!-- TAB 1: CURRENT SERP MATRIX TABLE -->
              <div x-show="activeTab === 'serp'" class="space-y-3">

                <!-- Table Controls Toolbar: Search within pins, format filter, sort by -->
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-1">
                  <!-- Search within 100 pins -->
                  <div class="relative flex-1 max-w-sm">
                    <i data-lucide="search" class="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"></i>
                    <input type="text" x-model="pinSearch" placeholder="Filter pins by title, creator, domain, tag..."
                           class="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/40">
                  </div>

                  <!-- Format & Sort Controls -->
                  <div class="flex items-center space-x-2">
                    <select x-model="formatFilter" class="px-2.5 py-1.5 text-xs rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-semibold focus:outline-none cursor-pointer">
                      <option value="ALL">All Formats</option>
                      <option value="ORGANIC PIN">Organic Pins</option>
                      <option value="VIDEO PIN">Video Pins</option>
                      <option value="PRODUCT CARD">Product Cards</option>
                      <option value="IDEA PIN">Idea Pins</option>
                    </select>

                    <select x-model="pinSort" class="px-2.5 py-1.5 text-xs rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-semibold focus:outline-none cursor-pointer">
                      <option value="rank">Sort: Rank (#1-#100)</option>
                      <option value="velocity">Sort: Highest Velocity</option>
                      <option value="saves">Sort: Most Saves & Likes</option>
                      <option value="age">Sort: Newest Pin</option>
                    </select>

                    <template x-if="pinSearch || formatFilter !== 'ALL' || pinSort !== 'rank'">
                      <button @click="pinSearch = ''; formatFilter = 'ALL'; pinSort = 'rank';"
                              class="px-2 py-1.5 text-xs text-rose-500 hover:text-rose-600 font-semibold transition cursor-pointer" title="Reset Filters">
                        Reset
                      </button>
                    </template>
                  </div>
                </div>

                <!-- Table Content -->
                <div class="overflow-x-auto">
                  <table class="w-full text-left text-xs">
                    <thead>
                      <tr class="border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        <th class="py-2.5 px-3 w-14 text-center">Rank</th>
                        <th class="py-2.5 px-3 w-14 text-center">Shift</th>
                        <th class="py-2.5 px-3">Pin Details & Computer-Vision Tags</th>
                        <th class="py-2.5 px-3">Pinner</th>
                        <th class="py-2.5 px-3 text-center">Saves & Velocity</th>
                        <th class="py-2.5 px-3 text-center">Age</th>
                        <th class="py-2.5 px-3">Domain</th>
                        <th class="py-2.5 px-3 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60 font-sans">
                      <template x-for="pin in filteredPins" :key="pin.id">
                        <tr class="hover:bg-slate-50/80 dark:hover:bg-slate-900/40 transition">
                          
                          <!-- Rank Position -->
                          <td class="py-3 px-3 text-center">
                            <span class="w-7 h-7 rounded-xl flex items-center justify-center mx-auto text-xs font-black font-mono"
                                  :class="pin.rank_position <= 3 ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/40' : (pin.rank_position <= 10 ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400')"
                                  x-text="'#' + pin.rank_position"></span>
                          </td>

                          <!-- Rank Shift Delta Badge -->
                          <td class="py-3 px-3 text-center font-mono">
                            <template x-if="pin.metadata?.is_new">
                              <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">★ NEW</span>
                            </template>
                            <template x-if="!pin.metadata?.is_new && Number(pin.metadata?.rank_delta || 0) > 0">
                              <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                                    x-text="'▲ +' + pin.metadata.rank_delta"></span>
                            </template>
                            <template x-if="!pin.metadata?.is_new && Number(pin.metadata?.rank_delta || 0) < 0">
                              <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30"
                                    x-text="'▼ ' + pin.metadata.rank_delta"></span>
                            </template>
                            <template x-if="!pin.metadata?.is_new && Number(pin.metadata?.rank_delta || 0) === 0">
                              <span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-400">= 0</span>
                            </template>
                          </td>

                          <!-- Pin Details (Image, Badges, Title, Visual Keywords Chips) -->
                          <td class="py-3 px-3">
                            <div class="flex items-start space-x-3">
                              <template x-if="pin.image_url">
                                <img :src="pin.image_url" class="w-10 h-14 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0 shadow-xs hover:scale-105 transition cursor-pointer" @click.stop="openVisualLens(pin)" title="Click to open Visual Lens">
                              </template>
                              <div class="min-w-0 space-y-1">
                                <!-- Badges Strip: Format & Aspect Ratio Tier -->
                                <div class="flex items-center space-x-1.5 flex-wrap">
                                  <span class="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider"
                                        :class="pin.metadata?.format === 'VIDEO PIN' ? 'bg-purple-500/20 text-purple-600 dark:text-purple-400 border border-purple-500/30' : (pin.metadata?.format === 'PRODUCT CARD' ? 'bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30' : (pin.metadata?.format === 'IDEA PIN' ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30' : 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'))"
                                        x-text="pin.metadata?.format || 'ORGANIC PIN'"></span>
                                  <span class="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700"
                                        x-text="pin.metadata?.aspect_ratio_tier || pin.metadata?.aspect_ratio || '2:3'"></span>
                                </div>
                                <a :href="'https://www.pinterest.com/pin/' + pin.pin_id + '/'" target="_blank"
                                   class="text-xs font-semibold text-slate-900 dark:text-white hover:text-emerald-500 line-clamp-2 block"
                                   x-text="pin.title || ('Pin #' + pin.pin_id)"></a>
                                
                                <!-- Visual Annotations (Pinterest Computer-Vision Tags) Chips -->
                                <template x-if="pin.metadata?.visual_annotations && pin.metadata.visual_annotations.length > 0">
                                  <div class="flex items-center space-x-1 flex-wrap pt-0.5">
                                    <template x-for="tag in pin.metadata.visual_annotations.slice(0, 2)" :key="tag">
                                      <span class="px-1.5 py-0.5 rounded text-[9px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                                            x-text="tag"></span>
                                    </template>
                                    <button @click.stop="openPinKeywordsModal(pin)"
                                            class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30 hover:bg-purple-500/25 transition cursor-pointer"
                                            x-text="'+' + (pin.metadata.visual_annotations.length - 2) + ' tags'"></button>
                                  </div>
                                </template>
                              </div>
                            </div>
                          </td>

                          <!-- Pinner / Creator -->
                          <td class="py-3 px-3">
                            <template x-if="pin.metadata?.pinner">
                              <div class="flex items-center space-x-2">
                                <template x-if="pin.metadata.pinner.image_small_url">
                                  <img :src="pin.metadata.pinner.image_small_url" class="w-6 h-6 rounded-full border border-slate-200 dark:border-slate-700 shrink-0">
                                </template>
                                <template x-if="!pin.metadata.pinner.image_small_url">
                                  <div class="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-600 dark:text-slate-300 shrink-0">
                                    <span x-text="(pin.metadata.pinner.username || 'P').charAt(0).toUpperCase()"></span>
                                  </div>
                                </template>
                                <div class="min-w-0">
                                  <a :href="'https://www.pinterest.com/' + pin.metadata.pinner.username + '/'" target="_blank"
                                     class="text-xs font-semibold text-slate-800 dark:text-slate-200 hover:text-emerald-500 block truncate max-w-[120px]"
                                     x-text="pin.metadata.pinner.full_name || pin.metadata.pinner.username || 'Creator'"></a>
                                  <span class="text-[10px] text-slate-400 font-mono block" x-text="formatNumber(pin.metadata.pinner.follower_count) + ' flwrs'"></span>
                                </div>
                              </div>
                            </template>
                            <template x-if="!pin.metadata?.pinner">
                              <span class="text-xs text-slate-400 italic">Unknown</span>
                            </template>
                          </td>

                          <!-- Saves & Engagement -->
                          <td class="py-3 px-3 text-center font-mono">
                            <div class="space-y-1">
                              <div class="flex items-center justify-center space-x-1.5 flex-wrap">
                                <template x-if="Number(pin.metadata?.raw_saves || pin.save_count || 0) > 0">
                                  <span class="text-xs font-bold text-slate-900 dark:text-white" x-text="formatNumber(pin.metadata?.raw_saves || pin.save_count) + ' saves'"></span>
                                </template>
                                <template x-if="Number(pin.metadata?.reactions || 0) > 0">
                                  <span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 flex items-center space-x-0.5" title="Reactions / Likes">
                                    <span>❤️</span>
                                    <span x-text="formatNumber(pin.metadata.reactions)"></span>
                                  </span>
                                </template>
                                <template x-if="Number(pin.metadata?.raw_saves || pin.save_count || 0) === 0 && Number(pin.metadata?.reactions || 0) === 0">
                                  <span class="text-xs text-slate-400 font-medium">0 saves</span>
                                </template>
                              </div>
                              <div class="flex items-center justify-center space-x-1">
                                <span class="px-1.5 py-0.5 rounded text-[10px] font-bold inline-block"
                                      :class="Number(pin.daily_save_velocity || 0) >= 10 ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40' : (Number(pin.daily_save_velocity || 0) > 0 ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-400')"
                                      x-text="(Number(pin.daily_save_velocity || 0) > 0 ? '+' : '') + Number(pin.daily_save_velocity || 0) + '/day'"></span>
                                <span class="px-1 py-0.5 rounded text-[9px] font-extrabold uppercase"
                                      :class="pin.metadata?.velocity_tier === 'explosive' ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400' : (pin.metadata?.velocity_tier === 'trending' ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400' : (pin.metadata?.velocity_tier === 'steady' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'))"
                                      x-text="pin.metadata?.velocity_tier === 'explosive' ? '🔥 EXPLOSIVE' : (pin.metadata?.velocity_tier === 'trending' ? '⚡ TRENDING' : (pin.metadata?.velocity_tier === 'steady' ? '📈 STEADY' : '⏸️ STAGNANT'))"></span>
                              </div>
                            </div>
                          </td>

                          <!-- Age -->
                          <td class="py-3 px-3 text-center font-mono text-xs text-slate-500 dark:text-slate-400">
                            <span x-text="formatAge(pin.metadata?.pin_age_days)"></span>
                          </td>

                          <!-- Destination Domain -->
                          <td class="py-3 px-3">
                            <template x-if="pin.domain">
                              <a :href="pin.destination_url || '#'" target="_blank"
                                 class="text-xs font-mono font-medium text-slate-600 dark:text-slate-300 hover:text-emerald-500 flex items-center space-x-1 truncate max-w-[130px]">
                                <i data-lucide="globe" class="w-3 h-3 shrink-0 text-slate-400"></i>
                                <span x-text="pin.domain"></span>
                              </a>
                            </template>
                            <template x-if="!pin.domain">
                              <span class="text-xs text-slate-400 italic">No link</span>
                            </template>
                          </td>

                          <!-- Actions -->
                          <td class="py-3 px-3 text-center">
                            <div class="flex items-center justify-center space-x-1">
                              <button @click.stop="openVisualLens(pin)"
                                      class="p-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 transition shadow-xs active:scale-95 cursor-pointer"
                                      title="Open Visual Similarity Lens">
                                <i data-lucide="scan" class="w-3.5 h-3.5"></i>
                              </button>
                              <button @click.stop="openPinKeywordsModal(pin)"
                                      class="p-1.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 border border-purple-500/30 transition shadow-xs active:scale-95 cursor-pointer"
                                      title="Inspect Pinterest Computer-Vision Keywords">
                                <i data-lucide="tag" class="w-3.5 h-3.5"></i>
                              </button>
                              <a :href="'https://www.pinterest.com/pin/' + pin.pin_id + '/'" target="_blank"
                                 class="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition" title="Open on Pinterest">
                                <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                              </a>
                              <button @click="copyToClipboard(pin.pin_id, 'Copied Pin ID')"
                                      class="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition cursor-pointer" title="Copy Pin ID">
                                <i data-lucide="copy" class="w-3.5 h-3.5"></i>
                              </button>
                            </div>
                          </td>

                        </tr>
                      </template>
                    </tbody>
                  </table>
                </div>
              </div>

              <!-- TAB 2: PIN INTELLIGENCE & SERP OPPORTUNITY (STATICRANK & SEMANTIC VACUUM) -->
              <div x-show="activeTab === 'intelligence'" class="space-y-6">
                
                <template x-if="!selectedKeywordDetails?.intelligence?.opportunity">
                  <div class="p-8 text-center text-xs text-slate-400">
                    No intelligence summary calculated yet. Re-crawl this keyword to compute algorithmic benchmarks.
                  </div>
                </template>

                <template x-if="selectedKeywordDetails?.intelligence?.opportunity">
                  <div class="space-y-6">

                    <!-- HERO: "Can a New Pin Rank Here?" -->
                    <div class="p-6 rounded-3xl border shadow-sm space-y-4"
                         :class="selectedKeywordDetails.intelligence.opportunity.verdict === 'WIDE_OPEN' ? 'bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent border-emerald-500/30' : (selectedKeywordDetails.intelligence.opportunity.verdict === 'COMPETITIVE' ? 'bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent border-amber-500/30' : 'bg-gradient-to-br from-rose-500/10 via-rose-500/5 to-transparent border-rose-500/30')">
                      
                      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div class="flex items-center space-x-3">
                          <div class="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-lg"
                                :class="selectedKeywordDetails.intelligence.opportunity.verdict === 'WIDE_OPEN' ? 'bg-emerald-600 text-white shadow-emerald-600/20' : (selectedKeywordDetails.intelligence.opportunity.verdict === 'COMPETITIVE' ? 'bg-amber-600 text-white shadow-amber-600/20' : 'bg-rose-600 text-white shadow-rose-600/20')">
                            <i data-lucide="target" class="w-6 h-6"></i>
                          </div>
                          <div>
                            <div class="flex items-center space-x-2">
                              <h3 class="text-base font-black text-slate-900 dark:text-white">Can a New Pin Rank Here?</h3>
                              <span class="px-2.5 py-0.5 rounded-full text-xs font-black uppercase font-mono"
                                    :class="selectedKeywordDetails.intelligence.opportunity.verdict === 'WIDE_OPEN' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40' : (selectedKeywordDetails.intelligence.opportunity.verdict === 'COMPETITIVE' ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/40' : 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/40')"
                                    x-text="selectedKeywordDetails.intelligence.opportunity.badge"></span>
                            </div>
                            <p class="text-xs font-medium text-slate-600 dark:text-slate-300 pt-0.5" x-text="selectedKeywordDetails.intelligence.opportunity.summary"></p>
                          </div>
                        </div>

                        <!-- Score Pill -->
                        <div class="text-right sm:text-right shrink-0">
                          <span class="text-2xl font-black font-mono"
                                :class="selectedKeywordDetails.intelligence.opportunity.verdict === 'WIDE_OPEN' ? 'text-emerald-600 dark:text-emerald-400' : (selectedKeywordDetails.intelligence.opportunity.verdict === 'COMPETITIVE' ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400')"
                                x-text="selectedKeywordDetails.intelligence.opportunity.score + '/3'"></span>
                          <span class="text-[10px] text-slate-400 block font-mono uppercase">Criteria Passed</span>
                        </div>
                      </div>

                      <!-- 3 Criteria Cards Grid -->
                      <div class="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                        <template x-for="crit in selectedKeywordDetails.intelligence.opportunity.criteria" :key="crit.id">
                          <div class="p-3.5 rounded-2xl bg-white/70 dark:bg-slate-900/70 border backdrop-blur-xs space-y-1.5"
                               :class="crit.pass ? 'border-emerald-500/30' : 'border-rose-500/30'">
                            <div class="flex items-center justify-between">
                              <span class="text-xs font-bold text-slate-900 dark:text-white" x-text="crit.name"></span>
                              <span class="px-2 py-0.5 rounded text-[10px] font-black uppercase font-mono"
                                    :class="crit.pass ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/20 text-rose-600 dark:text-rose-400'"
                                    x-text="crit.pass ? '✅ PASS' : '❌ FAIL'"></span>
                            </div>
                            <p class="text-xs font-black font-mono"
                               :class="crit.pass ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'"
                               x-text="crit.metric"></p>
                            <p class="text-[10px] text-slate-500 dark:text-slate-400 leading-snug" x-text="crit.description"></p>
                          </div>
                        </template>
                      </div>

                    </div>

                    <!-- SERP BENCHMARKS MATRIX (MEDIANS) -->
                    <div class="space-y-3">
                      <div class="flex items-center space-x-2">
                        <i data-lucide="bar-chart-2" class="w-4 h-4 text-emerald-500"></i>
                        <h4 class="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white">SERP Baseline Benchmarks (Medians Across Top Pins)</h4>
                      </div>

                      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 space-y-1">
                          <span class="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Median Saves</span>
                          <p class="text-lg font-black text-slate-900 dark:text-white font-mono" x-text="formatNumber(selectedKeywordDetails.intelligence.benchmarks?.median_saves)"></p>
                          <span class="text-[10px] text-slate-400 font-mono">Saves needed to compete</span>
                        </div>

                        <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 space-y-1">
                          <span class="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Median Pin Age</span>
                          <p class="text-lg font-black text-slate-900 dark:text-white font-mono" x-text="selectedKeywordDetails.intelligence.benchmarks?.median_age_days + ' days'"></p>
                          <span class="text-[10px] text-slate-400 font-mono">Time to mature & rank</span>
                        </div>

                        <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 space-y-1">
                          <span class="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Median Followers</span>
                          <p class="text-lg font-black text-slate-900 dark:text-white font-mono" x-text="formatNumber(selectedKeywordDetails.intelligence.benchmarks?.median_followers)"></p>
                          <span class="text-[10px] text-slate-400 font-mono">Authority threshold</span>
                        </div>

                        <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 space-y-1">
                          <span class="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Median Velocity</span>
                          <p class="text-lg font-black text-emerald-600 dark:text-emerald-400 font-mono" x-text="'+' + selectedKeywordDetails.intelligence.benchmarks?.median_velocity + '/day'"></p>
                          <span class="text-[10px] text-slate-400 font-mono">Daily momentum floor</span>
                        </div>
                      </div>
                    </div>

                    <!-- WINNING CONTENT FORMATS & DIMENSIONS & COPYWRITING -->
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                      
                      <!-- Card 1: Content Formats -->
                      <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 space-y-3">
                        <div class="flex items-center space-x-2">
                          <i data-lucide="layout-grid" class="w-4 h-4 text-purple-500"></i>
                          <h5 class="text-xs font-bold text-slate-900 dark:text-white">Winning Content Formats</h5>
                        </div>
                        <div class="space-y-2 text-xs">
                          <div>
                            <div class="flex justify-between text-[11px] font-medium pb-1">
                              <span class="text-slate-600 dark:text-slate-300">Organic Static Pins</span>
                              <span class="font-bold font-mono" x-text="selectedKeywordDetails.intelligence.formats?.organic_pct + '%'"></span>
                            </div>
                            <div class="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                              <div class="h-full bg-emerald-500 rounded-full" :style="'width: ' + selectedKeywordDetails.intelligence.formats?.organic_pct + '%'"></div>
                            </div>
                          </div>

                          <div>
                            <div class="flex justify-between text-[11px] font-medium pb-1">
                              <span class="text-slate-600 dark:text-slate-300">Video Pins</span>
                              <span class="font-bold font-mono" x-text="selectedKeywordDetails.intelligence.formats?.video_pct + '%'"></span>
                            </div>
                            <div class="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                              <div class="h-full bg-purple-500 rounded-full" :style="'width: ' + selectedKeywordDetails.intelligence.formats?.video_pct + '%'"></div>
                            </div>
                          </div>

                          <div>
                            <div class="flex justify-between text-[11px] font-medium pb-1">
                              <span class="text-slate-600 dark:text-slate-300">Idea / Carousel Pins</span>
                              <span class="font-bold font-mono" x-text="selectedKeywordDetails.intelligence.formats?.idea_pct + '%'"></span>
                            </div>
                            <div class="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                              <div class="h-full bg-amber-500 rounded-full" :style="'width: ' + selectedKeywordDetails.intelligence.formats?.idea_pct + '%'"></div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <!-- Card 2: Aspect Ratios & Dimensions -->
                      <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 space-y-3">
                        <div class="flex items-center space-x-2">
                          <i data-lucide="smartphone" class="w-4 h-4 text-cyan-500"></i>
                          <h5 class="text-xs font-bold text-slate-900 dark:text-white">Aspect Ratio Distribution</h5>
                        </div>
                        <div class="space-y-2 text-xs">
                          <div>
                            <div class="flex justify-between text-[11px] font-medium pb-1">
                              <span class="text-slate-600 dark:text-slate-300">2:3 Standard (1000x1500)</span>
                              <span class="font-bold font-mono" x-text="selectedKeywordDetails.intelligence.aspect_ratios?.standard_pct + '%'"></span>
                            </div>
                            <div class="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                              <div class="h-full bg-cyan-500 rounded-full" :style="'width: ' + selectedKeywordDetails.intelligence.aspect_ratios?.standard_pct + '%'"></div>
                            </div>
                          </div>

                          <div>
                            <div class="flex justify-between text-[11px] font-medium pb-1">
                              <span class="text-slate-600 dark:text-slate-300">1:2 Extra Tall / Long Pin</span>
                              <span class="font-bold font-mono" x-text="selectedKeywordDetails.intelligence.aspect_ratios?.extra_tall_pct + '%'"></span>
                            </div>
                            <div class="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                              <div class="h-full bg-indigo-500 rounded-full" :style="'width: ' + selectedKeywordDetails.intelligence.aspect_ratios?.extra_tall_pct + '%'"></div>
                            </div>
                          </div>

                          <div>
                            <div class="flex justify-between text-[11px] font-medium pb-1">
                              <span class="text-slate-600 dark:text-slate-300">Square / Story / Wide</span>
                              <span class="font-bold font-mono" x-text="selectedKeywordDetails.intelligence.aspect_ratios?.square_wide_pct + '%'"></span>
                            </div>
                            <div class="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                              <div class="h-full bg-slate-400 rounded-full" :style="'width: ' + selectedKeywordDetails.intelligence.aspect_ratios?.square_wide_pct + '%'"></div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <!-- Card 3: Copywriting & Title Formulas -->
                      <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 space-y-3">
                        <div class="flex items-center space-x-2">
                          <i data-lucide="file-text" class="w-4 h-4 text-emerald-500"></i>
                          <h5 class="text-xs font-bold text-slate-900 dark:text-white">Copywriting & Title DNA</h5>
                        </div>
                        <div class="space-y-2 text-xs">
                          <div class="flex items-center justify-between p-2 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-100 dark:border-slate-800">
                            <span class="text-[11px] text-slate-500 dark:text-slate-400">Avg Title Words:</span>
                            <span class="font-bold font-mono text-slate-900 dark:text-white" x-text="selectedKeywordDetails.intelligence.copywriting?.avg_title_words + ' words'"></span>
                          </div>
                          <div class="flex items-center justify-between p-2 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-100 dark:border-slate-800">
                            <span class="text-[11px] text-slate-500 dark:text-slate-400">Numbers in Title (%):</span>
                            <span class="font-bold font-mono text-emerald-600 dark:text-emerald-400" x-text="selectedKeywordDetails.intelligence.copywriting?.numbers_in_title_pct + '%'"></span>
                          </div>
                          <div class="flex items-center justify-between p-2 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-100 dark:border-slate-800">
                            <span class="text-[11px] text-slate-500 dark:text-slate-400">With Outbound Link:</span>
                            <span class="font-bold font-mono text-cyan-600 dark:text-cyan-400" x-text="selectedKeywordDetails.intelligence.copywriting?.has_destination_pct + '%'"></span>
                          </div>
                        </div>
                      </div>

                    </div>

                    <!-- COMPUTER VISION SEMANTIC ANNOTATION CLOUD -->
                    <div x-show="selectedKeywordDetails.intelligence.visual_annotations && selectedKeywordDetails.intelligence.visual_annotations.length > 0"
                         class="p-5 rounded-3xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 space-y-3">
                      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div class="flex items-center space-x-2">
                          <i data-lucide="tag" class="w-4 h-4 text-purple-500"></i>
                          <h4 class="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white">Pinterest Computer-Vision Semantic Vocabulary Cloud</h4>
                        </div>
                        <span class="text-[11px] text-slate-500 font-mono">Official AI tags extracted from pin_join.visual_annotation</span>
                      </div>

                      <div class="flex flex-wrap gap-2 pt-1">
                        <template x-for="item in selectedKeywordDetails.intelligence.visual_annotations" :key="item.tag">
                          <button @click="copyToClipboard(item.tag, 'Copied keyword: ' + item.tag)"
                                  class="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-purple-500/50 hover:bg-purple-500/10 text-slate-700 dark:text-slate-200 transition flex items-center space-x-1.5 shadow-2xs group cursor-pointer"
                                  :title="'Frequency: ' + item.count + ' pins (' + item.pct + '%) - Click to Copy'">
                            <span x-text="item.tag"></span>
                            <span class="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-purple-500/15 text-purple-600 dark:text-purple-400 font-bold"
                                  x-text="item.count + 'x • ' + item.pct + '%'"></span>
                          </button>
                        </template>
                      </div>
                    </div>

                  </div>
                </template>

              </div>

              <!-- TAB 3: SEMANTIC GUIDED SEARCH CAPSULES (rankedGuides) -->
              <div x-show="activeTab === 'guides'" class="space-y-4">
                <div class="p-4 rounded-2xl bg-white dark:bg-[#0b1120] border border-slate-200/80 dark:border-slate-800 space-y-3 shadow-xs">
                  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div class="flex items-center space-x-2">
                      <i data-lucide="compass" class="w-4 h-4 text-cyan-500"></i>
                      <h4 class="text-xs font-bold text-slate-900 dark:text-white">Pinterest Official Semantic Guided Modifiers (rankedGuides)</h4>
                    </div>
                    <button @click="copySEOFormula()" class="px-3 py-1 rounded-xl text-xs font-bold bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30 transition flex items-center space-x-1 cursor-pointer">
                      <i data-lucide="copy" class="w-3.5 h-3.5"></i>
                      <span>Copy 1-Click SEO Title Formula</span>
                    </button>
                  </div>
                  <p class="text-[11px] text-slate-500">Official ranking modifiers extracted directly from Pinterest's search engine capsule pills. Click any modifier to copy it.</p>
                  
                  <template x-if="!selectedKeywordDetails?.guides || selectedKeywordDetails.guides.length === 0">
                    <div class="py-8 text-center text-xs text-slate-400 font-mono italic">
                      No semantic modifiers discovered for this keyword. Run a re-crawl to populate.
                    </div>
                  </template>

                  <div class="flex flex-wrap gap-2 pt-1" x-show="selectedKeywordDetails?.guides?.length > 0">
                    <template x-for="g in selectedKeywordDetails?.guides || []" :key="g.id">
                      <span class="px-3 py-1.5 rounded-full text-xs font-semibold border flex items-center space-x-1.5 transition hover:scale-105 cursor-pointer shadow-2xs"
                            :style="'background-color: ' + (g.dominant_color ? g.dominant_color + '15' : '#10b98115') + '; border-color: ' + (g.dominant_color ? g.dominant_color + '40' : '#10b98140') + '; color: ' + (g.dominant_color || '#10b981')"
                            @click="copyToClipboard(g.term, 'Copied modifier: ' + g.term)">
                        <span x-text="g.display_label || g.term"></span>
                        <span class="text-[10px] opacity-75 font-mono" x-text="'(' + Number(g.score || 0).toFixed(1) + ')'"></span>
                      </span>
                    </template>
                  </div>
                </div>
              </div>

              <!-- TAB 4: VELOCITY WAVE CHART & DISTRIBUTION -->
              <div x-show="activeTab === 'velocity_curve'" class="space-y-4">
                <div class="p-5 rounded-2xl bg-white dark:bg-[#0b1120] border border-slate-200/80 dark:border-slate-800 space-y-4 shadow-xs">
                  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div class="flex items-center space-x-2">
                      <i data-lucide="activity" class="w-4 h-4 text-amber-500"></i>
                      <h4 class="text-xs font-bold text-slate-900 dark:text-white">SERP Save Velocity Distribution & Progression (100 Pins)</h4>
                    </div>
                    <!-- 4-Tier Interactive Breakdown -->
                    <div class="flex flex-wrap items-center gap-1.5 text-[10px] font-mono font-bold">
                      <span class="px-2 py-0.5 rounded bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30">🔥 Explosive: <strong x-text="selectedKeywordDetails?.velocity_chart?.explosive || 0"></strong></span>
                      <span class="px-2 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">⚡ Trending: <strong x-text="selectedKeywordDetails?.velocity_chart?.trending || 0"></strong></span>
                      <span class="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">📈 Steady: <strong x-text="selectedKeywordDetails?.velocity_chart?.steady || 0"></strong></span>
                      <span class="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700">⏸️ Stagnant: <strong x-text="selectedKeywordDetails?.velocity_chart?.stagnant || 0"></strong></span>
                    </div>
                  </div>

                  <!-- SVG Velocity Wave Chart -->
                  <div class="h-44 w-full relative pt-2">
                    <template x-if="selectedKeywordDetails?.velocity_chart?.points?.length > 1">
                      <svg class="w-full h-full" preserveAspectRatio="none" viewBox="0 0 500 75">
                        <defs>
                          <linearGradient id="velocityChartGradTab" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stop-color="#10b981" stop-opacity="0.35"/>
                            <stop offset="100%" stop-color="#10b981" stop-opacity="0.0"/>
                          </linearGradient>
                        </defs>
                        <path :d="getVelocityAreaPath(selectedKeywordDetails.velocity_chart.points, 500, 75).area" fill="url(#velocityChartGradTab)" />
                        <path :d="getVelocityAreaPath(selectedKeywordDetails.velocity_chart.points, 500, 75).line" fill="none" stroke="#10b981" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
                      </svg>
                    </template>
                    <template x-if="!selectedKeywordDetails?.velocity_chart?.points || selectedKeywordDetails.velocity_chart.points.length <= 1">
                      <div class="h-full flex items-center justify-center text-xs text-slate-400 font-mono">
                        Crawl pins to visualize the 100-pin velocity progression curve
                      </div>
                    </template>
                  </div>
                </div>
              </div>

              <!-- TAB 5: FELL OUT OF TOP 100 MATRIX TABLE -->
              <div x-show="activeTab === 'dropped'" class="overflow-x-auto">
                <template x-if="!selectedKeywordDetails?.dropped_out_pins || selectedKeywordDetails.dropped_out_pins.length === 0">
                  <div class="p-8 text-center text-xs text-slate-400 italic">
                    No pins dropped out of the top 100 in the recent crawls. Rankings are solid.
                  </div>
                </template>
                <template x-if="selectedKeywordDetails?.dropped_out_pins?.length > 0">
                  <table class="w-full text-left text-xs">
                    <thead>
                      <tr class="border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-rose-500">
                        <th class="py-2.5 px-3">Status</th>
                        <th class="py-2.5 px-3">Pin Details</th>
                        <th class="py-2.5 px-3">Former Rank</th>
                        <th class="py-2.5 px-3 text-center">Saves</th>
                        <th class="py-2.5 px-3 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60 font-sans">
                      <template x-for="pin in selectedKeywordDetails?.dropped_out_pins || []" :key="pin.id">
                        <tr class="hover:bg-rose-50/20 dark:hover:bg-rose-950/10 transition">
                          <td class="py-3 px-3">
                            <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30">❌ DROPPED OUT</span>
                          </td>
                          <td class="py-3 px-3">
                            <div class="flex items-center space-x-3">
                              <template x-if="pin.image_url">
                                <img :src="pin.image_url" class="w-9 h-12 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0 opacity-75">
                              </template>
                              <div>
                                <p class="text-xs font-semibold text-slate-800 dark:text-slate-200 line-clamp-1" x-text="pin.title || 'Untitled Pin'"></p>
                                <span class="text-[10px] text-slate-400 font-mono" x-text="'Pin ID: ' + pin.pin_id"></span>
                              </div>
                            </div>
                          </td>
                          <td class="py-3 px-3 font-mono font-bold text-slate-600 dark:text-slate-400" x-text="'Was #' + pin.rank_position"></td>
                          <td class="py-3 px-3 text-center font-mono" x-text="formatNumber(pin.save_count)"></td>
                          <td class="py-3 px-3 text-center">
                            <div class="flex items-center justify-center space-x-1">
                              <button @click="openVisualLens(pin)"
                                      class="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30" title="Visual Lens">
                                <i data-lucide="scan" class="w-3.5 h-3.5"></i>
                              </button>
                              <a :href="'https://www.pinterest.com/pin/' + pin.pin_id + '/'" target="_blank"
                                 class="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 inline-block">
                                <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                              </a>
                            </div>
                          </td>
                        </tr>
                      </template>
                    </tbody>
                  </table>
                </template>
              </div>

            </div>

          </div>
        </template>

      </div>

    </div>

  </main>

  <!-- VISUAL SIMILARITY LENS MODAL (v3_visual_search) -->
  <div x-show="isVisualLensModalOpen" x-cloak
       x-transition:enter="transition ease-out duration-300"
       x-transition:enter-start="opacity-0"
       x-transition:enter-end="opacity-100"
       x-transition:leave="transition ease-in duration-200"
       x-transition:leave-start="opacity-100"
       x-transition:leave-end="opacity-0"
       @keydown.escape.window="closeVisualLens()"
       class="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
    
    <div @click.away="closeVisualLens()"
         class="bg-white dark:bg-[#0c1322] border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden transition-all">
      
      <!-- Modal Header -->
      <div class="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/40">
        <div class="flex items-center space-x-3">
          <div class="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shadow-lg shadow-emerald-600/20 shrink-0">
            <i data-lucide="scan" class="w-5 h-5"></i>
          </div>
          <div>
            <div class="flex items-center space-x-2">
              <h3 class="text-base font-black text-slate-900 dark:text-white">Visual Similarity Lens</h3>
              <span class="px-2 py-0.5 text-[10px] font-bold uppercase rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 font-mono">v3_visual_search</span>
            </div>
            <p class="text-[11px] text-slate-500 dark:text-slate-400">Discover competitor duplicate clones, template matches & visual variants</p>
          </div>
        </div>
        
        <button @click="closeVisualLens()" class="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition">
          <i data-lucide="x" class="w-5 h-5"></i>
        </button>
      </div>

      <!-- Seed Pin Card -->
      <template x-if="visualLensPin">
        <div class="p-4 bg-emerald-500/5 border-b border-slate-200 dark:border-slate-800/80 flex items-center justify-between gap-4">
          <div class="flex items-center space-x-3 min-w-0">
            <template x-if="visualLensPin.image_url">
              <img :src="visualLensPin.image_url" class="w-12 h-16 rounded-xl object-cover border border-emerald-500/30 shrink-0 shadow-sm">
            </template>
            <template x-if="!visualLensPin.image_url">
              <div class="w-12 h-16 rounded-xl bg-slate-200 dark:bg-slate-800 flex items-center justify-center border border-emerald-500/30 shrink-0">
                <i data-lucide="scan" class="w-5 h-5 text-emerald-500"></i>
              </div>
            </template>
            <div class="min-w-0">
              <div class="flex items-center space-x-2">
                <span class="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-mono">Seed Pin</span>
                <span class="text-[10px] text-slate-400 font-mono" x-text="'ID: ' + visualLensPin.pin_id"></span>
              </div>
              <h4 class="text-xs font-bold text-slate-900 dark:text-white truncate" x-text="visualLensPin.title || ('Pin #' + visualLensPin.pin_id)"></h4>
              <p class="text-[11px] text-slate-500 font-mono" x-text="(visualLensPin.domain ? 'Domain: ' + visualLensPin.domain + ' • ' : '') + formatNumber(visualLensPin.save_count) + ' saves'"></p>
            </div>
          </div>
          <a :href="'https://www.pinterest.com/pin/' + visualLensPin.pin_id + '/'" target="_blank"
             class="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 hover:text-emerald-500 transition shrink-0 flex items-center space-x-1">
            <span>View Seed Pin</span>
            <i data-lucide="external-link" class="w-3 h-3"></i>
          </a>
        </div>
      </template>

      <!-- Modal Body (Results / Loading / Error) -->
      <div class="p-5 flex-1 overflow-y-auto space-y-4">
        
        <!-- Loading State -->
        <template x-if="isVisualLensLoading">
          <div class="py-12 text-center space-y-3">
            <div class="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-500 mx-auto flex items-center justify-center">
              <i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i>
            </div>
            <p class="text-xs font-semibold text-slate-600 dark:text-slate-300">Scanning Pinterest visual graph for candidate clones...</p>
            <p class="text-[11px] text-slate-400 font-mono">Analyzing visual embeddings and domain parity</p>
          </div>
        </template>

        <!-- Error State -->
        <template x-if="!isVisualLensLoading && visualLensError">
          <div class="p-6 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-center space-y-2">
            <i data-lucide="alert-triangle" class="w-6 h-6 text-rose-500 mx-auto"></i>
            <p class="text-xs font-bold text-rose-600 dark:text-rose-400" x-text="visualLensError"></p>
            <button @click="openVisualLens(visualLensPin)" class="px-3 py-1.5 rounded-xl bg-rose-500 text-white text-xs font-bold hover:bg-rose-600 transition">
              Retry Visual Search
            </button>
          </div>
        </template>

        <!-- Empty Results -->
        <template x-if="!isVisualLensLoading && !visualLensError && visualLensResults.length === 0">
          <div class="py-12 text-center space-y-2">
            <i data-lucide="search-x" class="w-8 h-8 text-slate-400 mx-auto"></i>
            <p class="text-xs font-bold text-slate-700 dark:text-slate-300">No Direct Visual Clones Found</p>
            <p class="text-[11px] text-slate-500">This pin appears visually unique with no duplicate template matches detected in the top clusters.</p>
          </div>
        </template>

        <!-- Results Grid -->
        <template x-if="!isVisualLensLoading && !visualLensError && visualLensResults.length > 0">
          <div class="space-y-3">
            <div class="flex items-center justify-between text-xs text-slate-500 pb-2 border-b border-slate-100 dark:border-slate-800">
              <span class="font-bold text-slate-700 dark:text-slate-300" x-text="visualLensResults.length + ' Visual Matches Discovered'"></span>
              <span class="text-[11px] font-mono">Ranked by Visual Proximity</span>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <template x-for="match in visualLensResults" :key="match.pin_id">
                <div class="p-3.5 rounded-2xl border transition flex items-start space-x-3.5"
                     :class="match.similarity_type === 'DOMAIN_CLONE' ? 'bg-rose-500/5 border-rose-500/30 dark:bg-rose-950/15' : 'bg-slate-50/80 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800'">
                  
                  <!-- Match Image Thumbnail -->
                  <template x-if="match.image_url">
                    <img :src="match.image_url" class="w-14 h-20 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0 shadow-sm hover:scale-105 transition">
                  </template>
                  <template x-if="!match.image_url">
                    <div class="w-14 h-20 rounded-xl bg-slate-200 dark:bg-slate-800 flex items-center justify-center shrink-0">
                      <i data-lucide="image" class="w-4 h-4 text-slate-400"></i>
                    </div>
                  </template>

                  <!-- Match Info -->
                  <div class="min-w-0 flex-1 space-y-1.5">
                    <div class="flex items-center justify-between gap-1">
                      <span class="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider"
                            :class="match.similarity_type === 'DOMAIN_CLONE' ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/40' : (match.similarity_type === 'TEMPLATE_CLONE' ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/40' : 'bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border border-cyan-500/40')"
                            x-text="match.similarity_badge || match.similarity_type"></span>
                      <span class="text-[10px] font-mono font-bold text-slate-700 dark:text-slate-300" x-text="formatNumber(match.save_count) + ' saves'"></span>
                    </div>

                    <a :href="'https://www.pinterest.com/pin/' + match.pin_id + '/'" target="_blank"
                       class="text-xs font-bold text-slate-900 dark:text-white hover:text-emerald-500 line-clamp-2 block"
                       x-text="match.title || 'Untitled Pin'"></a>

                    <div class="flex items-center justify-between text-[11px] pt-1">
                      <template x-if="match.domain">
                        <a :href="match.destination_url || '#'" target="_blank"
                           class="text-[10px] font-mono text-slate-500 hover:text-emerald-500 truncate max-w-[130px] flex items-center space-x-1">
                          <i data-lucide="globe" class="w-3 h-3 shrink-0"></i>
                          <span x-text="match.domain"></span>
                        </a>
                      </template>
                      <div class="flex items-center space-x-1 ml-auto">
                        <button @click="copyToClipboard(match.pin_id, 'Copied Pin ID')"
                                class="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" title="Copy Pin ID">
                          <i data-lucide="copy" class="w-3 h-3"></i>
                        </button>
                        <a :href="'https://www.pinterest.com/pin/' + match.pin_id + '/'" target="_blank"
                           class="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" title="Open on Pinterest">
                          <i data-lucide="external-link" class="w-3 h-3"></i>
                        </a>
                      </div>
                    </div>
                  </div>

                </div>
              </template>
            </div>
          </div>
        </template>

      </div>

      <!-- Modal Footer -->
      <div class="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 flex items-center justify-between">
        <span class="text-[11px] text-slate-500 font-mono">Pinterest Reverse Visual Lens Discovery</span>
        <button @click="closeVisualLens()" class="px-4 py-2 rounded-xl text-xs font-bold bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition">
          Close Lens
        </button>
      </div>

    </div>
  </div>

  <!-- VISUAL KEYWORDS & COMPUTER-VISION TAGS MODAL -->
  <div x-show="isKeywordsModalOpen" x-cloak
       x-transition:enter="transition ease-out duration-300"
       x-transition:enter-start="opacity-0"
       x-transition:enter-end="opacity-100"
       x-transition:leave="transition ease-in duration-200"
       x-transition:leave-start="opacity-100"
       x-transition:leave-end="opacity-0"
       @keydown.escape.window="closePinKeywordsModal()"
       class="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
    
    <div @click.away="closePinKeywordsModal()"
         class="bg-white dark:bg-[#0c1322] border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden transition-all">
      
      <!-- Modal Header -->
      <div class="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/40">
        <div class="flex items-center space-x-3">
          <div class="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-500 text-white flex items-center justify-center shadow-lg shadow-purple-600/20 shrink-0">
            <i data-lucide="tag" class="w-5 h-5"></i>
          </div>
          <div>
            <div class="flex items-center space-x-2">
              <h3 class="text-base font-black text-slate-900 dark:text-white">Pinterest Computer-Vision Tags</h3>
              <span class="px-2 py-0.5 text-[10px] font-bold uppercase rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30 font-mono">pin_join.visual_annotation</span>
            </div>
            <p class="text-[11px] text-slate-500 dark:text-slate-400">Official visual keywords indexed by Pinterest's visual ranking model for this pin</p>
          </div>
        </div>
        
        <button @click="closePinKeywordsModal()" class="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition">
          <i data-lucide="x" class="w-5 h-5"></i>
        </button>
      </div>

      <!-- Pin Context Header -->
      <div class="p-4 bg-purple-500/5 border-b border-slate-200 dark:border-slate-800/80 flex items-center justify-between gap-4">
        <div class="min-w-0">
          <div class="flex items-center space-x-2">
            <span class="text-[10px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 font-mono">Target Pin</span>
            <span class="text-[10px] text-slate-400 font-mono" x-text="'ID: ' + activePinId"></span>
          </div>
          <h4 class="text-xs font-bold text-slate-900 dark:text-white truncate pt-0.5" x-text="activePinTitle"></h4>
        </div>
        <div class="flex items-center space-x-2 shrink-0">
          <button @click="copyAllPinKeywords()"
                  class="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition flex items-center space-x-1.5 shadow-sm active:scale-95">
            <i data-lucide="copy" class="w-3.5 h-3.5"></i>
            <span>Copy All Keywords</span>
          </button>
        </div>
      </div>

      <!-- Modal Body (Tags List) -->
      <div class="p-6 overflow-y-auto max-h-[60vh] space-y-4">
        <template x-if="!activePinKeywords || activePinKeywords.length === 0">
          <div class="p-8 text-center text-xs text-slate-400 italic">
            No visual annotations returned by Pinterest for this pin.
          </div>
        </template>

        <template x-if="activePinKeywords && activePinKeywords.length > 0">
          <div class="space-y-3">
            <div class="flex items-center justify-between text-xs text-slate-500">
              <span x-text="activePinKeywords.length + ' computer-vision tags detected'"></span>
              <span class="text-[10px] font-mono">Click a tag to track in Omnibar</span>
            </div>

            <div class="flex flex-wrap gap-2">
              <template x-for="tag in activePinKeywords" :key="tag">
                <div class="group flex items-center bg-slate-100 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700/80 rounded-2xl overflow-hidden hover:border-purple-500/50 transition shadow-2xs">
                  <span class="px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer hover:text-purple-500"
                        @click="copyToClipboard(tag, 'Copied keyword: ' + tag)"
                        x-text="tag" title="Click to copy"></span>
                  <button @click="researchKeywordTag(tag)"
                          class="px-2 py-1.5 border-l border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-purple-500 hover:bg-purple-500/10 transition"
                          title="Search & track this keyword">
                    <i data-lucide="search" class="w-3 h-3"></i>
                  </button>
                </div>
              </template>
            </div>
          </div>
        </template>
      </div>

      <!-- Modal Footer -->
      <div class="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 flex items-center justify-between">
        <span class="text-[11px] text-slate-500 font-mono">Official Pinterest Computer-Vision Taxonomy</span>
        <button @click="closePinKeywordsModal()" class="px-4 py-2 rounded-xl text-xs font-bold bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition">
          Close
        </button>
      </div>

    </div>
  </div>

  <script>
    function keywordStudio() {
      return {
        keywords: [],
        filteredKeywords: [],
        keywordSearch: '',
        selectedKeyword: null,
        selectedKeywordDetails: null,
        isDetailsLoading: false,
        isSubmittingKeyword: false,
        isWorkflowDispatching: false,
        syncingKeywordId: null,

        // Typeahead Omnibar State
        typeaheadQuery: '',
        newKeywordCategory: 'General',
        typeaheadSuggestions: [],
        isTypeaheadLoading: false,
        isTypeaheadOpen: false,

        // Visual Similarity Lens State (v3_visual_search)
        isVisualLensModalOpen: false,
        isVisualLensLoading: false,
        visualLensPin: null,
        visualLensResults: [],
        visualLensError: null,

        // Visual Keywords Modal State (pin_join.visual_annotation)
        isKeywordsModalOpen: false,
        activePinKeywords: [],
        activePinId: null,
        activePinTitle: '',

        // UI Tabs & State
        activeTab: 'serp',
        selectedProjectId: '',
        fleetProjects: [],
        darkMode: true,
        toast: { show: false, message: '', type: 'info' },

        // Pin Table Filter & Sort Controls
        pinSearch: '',
        formatFilter: 'ALL',
        pinSort: 'rank',

        get filteredPins() {
          let list = this.selectedKeywordDetails?.current_pins || [];
          if (this.formatFilter && this.formatFilter !== 'ALL') {
            list = list.filter(p => (p.metadata?.format || 'ORGANIC PIN') === this.formatFilter);
          }
          if (this.pinSearch && this.pinSearch.trim()) {
            const q = this.pinSearch.toLowerCase().trim();
            list = list.filter(p => 
              (p.title || '').toLowerCase().includes(q) ||
              (p.domain || '').toLowerCase().includes(q) ||
              (p.metadata?.pinner?.username || '').toLowerCase().includes(q) ||
              (p.metadata?.pinner?.full_name || '').toLowerCase().includes(q) ||
              (p.metadata?.visual_annotations || []).some(t => t.toLowerCase().includes(q))
            );
          }
          if (this.pinSort === 'velocity') {
            return [...list].sort((a, b) => Number(b.daily_save_velocity || 0) - Number(a.daily_save_velocity || 0));
          } else if (this.pinSort === 'saves') {
            return [...list].sort((a, b) => {
              const aEngage = Number(a.metadata?.raw_saves || a.save_count || a.metadata?.reactions || 0);
              const bEngage = Number(b.metadata?.raw_saves || b.save_count || b.metadata?.reactions || 0);
              return bEngage - aEngage;
            });
          } else if (this.pinSort === 'age') {
            return [...list].sort((a, b) => Number(a.metadata?.pin_age_days || 9999) - Number(b.metadata?.pin_age_days || 9999));
          }
          return [...list].sort((a, b) => Number(a.rank_position || 0) - Number(b.rank_position || 0));
        },

        get totalPinsCount() {
          return this.keywords.reduce((acc, k) => acc + Number(k.snapshots_count || 0), 0);
        },

        get totalAvgVelocity() {
          return this.keywords.reduce((acc, k) => acc + Number(k.avg_daily_velocity || 0), 0);
        },

        init() {
          this.selectedProjectId = localStorage.getItem('pa_selected_project_id') || '';
          this.darkMode = localStorage.getItem('pa_theme') !== 'light';
          this.applyTheme();
          this.fetchFleetProjects();
          this.fetchKeywords();

          // Read URL query parameters for direct deep-linking (?q= or ?pin_id=)
          try {
            const urlParams = new URLSearchParams(window.location.search);
            const qParam = urlParams.get('q') || urlParams.get('pin_id');
            if (qParam) {
              const cleanQ = qParam.trim();
              if (/^[0-9]+$/.test(cleanQ)) {
                // Direct numeric Pin ID: open Visual Similarity Lens directly
                this.openVisualLens({ pin_id: cleanQ, title: 'Pin #' + cleanQ });
              } else {
                // Search query text
                this.keywordSearch = cleanQ;
              }
            }
          } catch (_) {}

          this.$watch('keywordSearch', () => this.filterKeywords());
          this.$nextTick(() => { lucide.createIcons(); });
        },

        applyTheme() {
          if (this.darkMode) {
            document.documentElement.classList.add('dark');
            localStorage.setItem('pa_theme', 'dark');
          } else {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('pa_theme', 'light');
          }
        },

        toggleTheme() {
          this.darkMode = !this.darkMode;
          this.applyTheme();
        },

        showToast(message, type = 'info') {
          this.toast = { show: true, message, type };
          this.$nextTick(() => { lucide.createIcons(); });
          setTimeout(() => { this.toast.show = false; }, 3500);
        },

        getApiUrl(path) {
          if (this.selectedProjectId) {
            return path + (path.includes('?') ? '&' : '?') + 'project_id=' + encodeURIComponent(this.selectedProjectId);
          }
          return path;
        },

        onProjectChange() {
          localStorage.setItem('pa_selected_project_id', this.selectedProjectId);
          this.selectedKeyword = null;
          this.selectedKeywordDetails = null;
          this.fetchKeywords();
        },

        async fetchFleetProjects() {
          try {
            const res = await fetch('/api/fleet/projects');
            if (res.ok) {
              const data = await res.json();
              this.fleetProjects = data.projects || [];
            }
          } catch (_) {}
        },

        async fetchKeywords() {
          try {
            const res = await fetch(this.getApiUrl('/api/keywords'));
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            this.keywords = data.keywords || [];
            this.filterKeywords();

            // Auto-select first keyword if none selected
            if (this.keywords.length > 0 && !this.selectedKeyword) {
              this.selectKeyword(this.keywords[0]);
            }
          } catch (err) {
            this.showToast('Failed to load keywords: ' + err.message, 'error');
          } finally {
            this.$nextTick(() => { lucide.createIcons(); });
          }
        },

        filterKeywords() {
          if (!this.keywordSearch.trim()) {
            this.filteredKeywords = this.keywords;
          } else {
            const q = this.keywordSearch.toLowerCase().trim();
            this.filteredKeywords = this.keywords.filter(k => 
              k.keyword.toLowerCase().includes(q) || (k.category || '').toLowerCase().includes(q)
            );
          }
        },

        async onTypeaheadInput() {
          const q = this.typeaheadQuery.trim();
          if (q.length < 2) {
            this.typeaheadSuggestions = [];
            this.isTypeaheadOpen = false;
            return;
          }

          this.isTypeaheadLoading = true;
          try {
            const res = await fetch(this.getApiUrl('/api/keywords/typeahead?q=' + encodeURIComponent(q)));
            if (res.ok) {
              const data = await res.json();
              this.typeaheadSuggestions = data.suggestions || [];
              this.isTypeaheadOpen = this.typeaheadSuggestions.length > 0;
            }
          } catch (_) {} finally {
            this.isTypeaheadLoading = false;
            this.$nextTick(() => { lucide.createIcons(); });
          }
        },

        selectSuggestion(item) {
          this.typeaheadQuery = item;
          this.isTypeaheadOpen = false;
        },

        async submitAddKeyword() {
          const clean = this.typeaheadQuery.trim();
          if (!clean) return;

          this.isSubmittingKeyword = true;
          try {
            const res = await fetch(this.getApiUrl('/api/keywords'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                keyword: clean,
                category: this.newKeywordCategory || 'General',
                target_pin_count: 100
              })
            });

            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            this.showToast('Keyword "' + clean + '" added to tracking!', 'success');
            this.typeaheadQuery = '';
            this.isTypeaheadOpen = false;

            await this.fetchKeywords();
            if (data.keyword) {
              this.selectKeyword(data.keyword);
              // Trigger initial crawl in background
              this.rescanKeyword(data.keyword.id);
            }
          } catch (err) {
            this.showToast('Error adding keyword: ' + err.message, 'error');
          } finally {
            this.isSubmittingKeyword = false;
          }
        },

        async selectKeyword(kw) {
          this.selectedKeyword = kw;
          this.isDetailsLoading = true;
          this.activeTab = 'serp';

          try {
            const res = await fetch(this.getApiUrl('/api/keywords/serp-compare?keyword_id=' + kw.id));
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            this.selectedKeywordDetails = data;
          } catch (err) {
            this.showToast('Error loading SERP details: ' + err.message, 'error');
          } finally {
            this.isDetailsLoading = false;
            this.$nextTick(() => { lucide.createIcons(); });
          }
        },

        async rescanKeyword(id) {
          this.syncingKeywordId = id;
          this.showToast('Crawling fresh SERP & ranked guides...', 'info');

          try {
            const res = await fetch(this.getApiUrl('/api/keywords/sync'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ keyword_id: id })
            });

            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            this.showToast('SERP updated: ' + (data.result?.crawled_pins || 100) + ' pins indexed!', 'success');

            // Refresh keywords summaries and current details
            await this.fetchKeywords();
            if (this.selectedKeyword && this.selectedKeyword.id === id) {
              await this.selectKeyword(this.selectedKeyword);
            }
          } catch (err) {
            this.showToast('Crawl error: ' + err.message, 'error');
          } finally {
            this.syncingKeywordId = null;
          }
        },

        async deleteKeyword(id) {
          if (!confirm('Are you sure you want to delete this tracked keyword and its snapshots?')) return;
          try {
            const res = await fetch(this.getApiUrl('/api/keywords?id=' + id), { method: 'DELETE' });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            this.showToast('Keyword deleted.', 'info');
            if (this.selectedKeyword?.id === id) {
              this.selectedKeyword = null;
              this.selectedKeywordDetails = null;
            }
            await this.fetchKeywords();
          } catch (err) {
            this.showToast('Delete error: ' + err.message, 'error');
          }
        },

        async triggerWorkflow() {
          this.isWorkflowDispatching = true;
          this.showToast('Dispatching GitHub Actions autonomous crawler...', 'info');
          try {
            const res = await fetch(this.getApiUrl('/api/keywords/dispatch-workflow'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ target_keyword: this.selectedKeyword?.keyword || '' })
            });
            const data = await res.json();
            if (data.success) {
              this.showToast('GitHub Actions workflow triggered successfully!', 'success');
            } else {
              this.showToast('Dispatch failed: ' + (data.error || 'Check GitHub token'), 'error');
            }
          } catch (err) {
            this.showToast('Error triggering workflow: ' + err.message, 'error');
          } finally {
            this.isWorkflowDispatching = false;
          }
        },

        copyToClipboard(text, msg = 'Copied to clipboard!') {
          navigator.clipboard.writeText(text).then(() => {
            this.showToast(msg, 'success');
          }).catch(() => {
            this.showToast('Failed to copy', 'error');
          });
        },

        copySEOFormula() {
          if (!this.selectedKeyword) return;
          const kw = this.selectedKeyword.keyword;
          const guides = this.selectedKeywordDetails?.guides || [];
          const topModifiers = guides.slice(0, 3).map(g => g.display_label || g.term).join(' ');
          const formula = kw.charAt(0).toUpperCase() + kw.slice(1) + (topModifiers ? ' - ' + topModifiers : '');
          this.copyToClipboard(formula, 'Copied SEO Title Formula: "' + formula + '"');
        },

        formatNumber(num) {
          const n = Number(num || 0);
          if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
          if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
          return n.toLocaleString();
        },

        formatDate(d) {
          if (!d) return 'Never';
          try {
            return new Date(d).toLocaleDateString() + ' ' + new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          } catch (_) {
            return String(d);
          }
        },

        async openVisualLens(pin) {
          this.visualLensPin = { ...pin };
          this.isVisualLensModalOpen = true;
          this.isVisualLensLoading = true;
          this.visualLensResults = [];
          this.visualLensError = null;

          try {
            const res = await fetch(this.getApiUrl('/api/keywords/visual-search?pin_id=' + encodeURIComponent(pin.pin_id)));
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to fetch visual search matches');
            this.visualLensResults = data.matches || [];
            const seedData = data.seed_pin || data.seed;
            if (seedData) {
              this.visualLensPin = {
                ...this.visualLensPin,
                title: (this.visualLensPin.title && !this.visualLensPin.title.startsWith('Pin #')) ? this.visualLensPin.title : (seedData.title || this.visualLensPin.title),
                image_url: this.visualLensPin.image_url || seedData.image_url,
                domain: this.visualLensPin.domain || seedData.domain,
                save_count: this.visualLensPin.save_count || seedData.save_count
              };
            }
          } catch (err) {
            this.visualLensError = err.message;
          } finally {
            this.isVisualLensLoading = false;
            this.$nextTick(() => { lucide.createIcons(); });
          }
        },

        closeVisualLens() {
          this.isVisualLensModalOpen = false;
          this.visualLensPin = null;
          this.visualLensResults = [];
          this.visualLensError = null;
        },

        openPinKeywordsModal(pin) {
          this.activePinId = pin.pin_id;
          this.activePinTitle = pin.title || 'Untitled Pin';
          this.activePinKeywords = pin.metadata?.visual_annotations || [];
          this.isKeywordsModalOpen = true;
          this.$nextTick(() => { lucide.createIcons(); });
        },

        closePinKeywordsModal() {
          this.isKeywordsModalOpen = false;
          this.activePinKeywords = [];
          this.activePinId = null;
          this.activePinTitle = '';
        },

        copyAllPinKeywords() {
          if (!this.activePinKeywords || this.activePinKeywords.length === 0) return;
          const text = this.activePinKeywords.join(', ');
          this.copyToClipboard(text, 'Copied ' + this.activePinKeywords.length + ' keywords!');
        },

        researchKeywordTag(tag) {
          this.typeaheadQuery = tag;
          this.closePinKeywordsModal();
          this.onTypeaheadInput();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        },

        formatAge(days) {
          if (days === null || days === undefined || isNaN(Number(days))) return '-';
          const d = Number(days);
          if (d === 0) return 'Today';
          if (d === 1) return '1d ago';
          if (d < 30) return d + 'd ago';
          if (d < 365) return Math.floor(d / 30) + 'mo ago';
          return Math.floor(d / 365) + 'y ago';
        },

        getSparklinePoints(kw) {
          const history = kw.metadata?.velocity_history;
          if (Array.isArray(history) && history.length > 1) {
            return history.map(h => Number(h.velocity || 0));
          }
          const cur = Number(kw.avg_daily_velocity || 0);
          return [Math.max(0, cur * 0.6), Math.max(0, cur * 0.85), cur];
        },

        generateSparklinePath(points, width = 80, height = 20) {
          if (!points || points.length < 2) return '';
          const min = Math.min(...points);
          const max = Math.max(...points);
          const range = (max - min) === 0 ? 1 : (max - min);
          const step = width / (points.length - 1);
          return points.map((p, i) => {
            const x = (i * step).toFixed(1);
            const y = (height - ((p - min) / range) * (height - 4) - 2).toFixed(1);
            return (i === 0 ? 'M' : 'L') + ' ' + x + ' ' + y;
          }).join(' ');
        },

        getVelocityAreaPath(points, width = 500, height = 75) {
          if (!points || points.length < 2) return { line: '', area: '' };
          const min = 0;
          const max = Math.max(...points, 1);
          const range = max - min;
          const step = width / (points.length - 1);

          const coords = points.map((p, i) => {
            const x = (i * step).toFixed(1);
            const y = (height - ((p - min) / range) * (height - 12) - 4).toFixed(1);
            return { x, y };
          });

          const line = coords.map((c, i) => (i === 0 ? 'M' : 'L') + ' ' + c.x + ' ' + c.y).join(' ');
          const area = line + ' L ' + width + ' ' + height + ' L 0 ' + height + ' Z';
          return { line, area };
        }
      };
    }
  </script>
</body>
</html>`;
}
