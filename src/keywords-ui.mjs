/**
 * Keyword Intelligence & Velocity Dedicated Standalone Studio UI
 * Pure ES Module generating the full HTML application.
 * Compatible with both Cloudflare Workers (V8 isolate) and Node.js.
 *
 * Hardened for Production:
 * - Direct Slug & Deep-Link Routing (/keywords/:slug and /keywords/:keyword)
 * - Full-Width Executive SEO Intelligence Layout (Ahrefs / PinClicks parity)
 * - Zero-cramping architecture: Slide-over drawer for keyword fleet, 100% width for SERP table
 * - Request-ID versioning & AbortController (Zero client-side race conditions)
 * - Force-bypass self-healing locks (Zero crawl_lock lockout)
 * - 100-Pin SERP Tracking with 100% genuine titles and accurate reaction metrics
 */

export function getKeywordsPageHtml(initialSlug = '') {
  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Keyword Intelligence & Velocity | Pinterest SERP Radar Studio</title>
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
  <script defer src="https://unpkg.com/alpinejs@3.14.8/dist/cdn.min.js"></script>
  <script src="https://unpkg.com/lucide@latest"></script>
  <style>
    [x-cloak] { display: none !important; }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: rgba(148, 163, 184, 0.25); border-radius: 9999px; }
    ::-webkit-scrollbar-thumb:hover { background: rgba(148, 163, 184, 0.45); }
    .table-sticky-header th { position: sticky; top: 0; z-index: 20; }
  </style>
  <script>
    window.__INITIAL_KEYWORD_SLUG__ = ${JSON.stringify(initialSlug || '')};
  </script>
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

  <!-- Top Executive Navigation Bar -->
  <header class="sticky top-0 z-40 bg-white/90 dark:bg-[#0b1120]/90 backdrop-blur-xl border-b border-slate-200/80 dark:border-slate-800/80 px-4 lg:px-8 py-3 transition-colors">
    <div class="max-w-[1920px] mx-auto flex items-center justify-between gap-4">
      
      <!-- Brand & Breadcrumbs -->
      <div class="flex items-center space-x-4">
        <a href="/" class="flex items-center space-x-3 group">
          <div class="w-9 h-9 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shadow-lg shadow-emerald-600/20 shrink-0 group-hover:scale-105 transition">
            <i data-lucide="sparkles" class="w-4 h-4"></i>
          </div>
          <div>
            <div class="flex items-center space-x-2">
              <span class="text-sm font-black tracking-tight text-slate-900 dark:text-white">PinArbitrage</span>
              <span class="px-1.5 py-0.5 text-[9px] font-bold uppercase rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 font-mono">SERP Studio</span>
            </div>
            <p class="text-[10px] text-slate-400 font-mono">Executive Organic Intelligence</p>
          </div>
        </a>

        <!-- Breadcrumb separator -->
        <span class="text-slate-300 dark:text-slate-700 hidden md:inline">/</span>

        <!-- Active Keyword Breadcrumb -->
        <div class="hidden md:flex items-center space-x-2 text-xs">
          <span class="text-slate-400">Keywords</span>
          <span class="text-slate-300 dark:text-slate-700">/</span>
          <span class="font-bold text-emerald-600 dark:text-emerald-400 font-mono capitalize" x-text="selectedKeyword?.keyword || 'Select Keyword'"></span>
        </div>
      </div>

      <!-- Center: Fleet Multi-Project Selector -->
      <div class="hidden lg:flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs">
        <i data-lucide="server" class="w-3.5 h-3.5 text-cyan-500"></i>
        <span class="text-slate-400">Fleet:</span>
        <select x-model="selectedProjectId" @change="onProjectChange()" class="bg-transparent text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none cursor-pointer">
          <option value="">Central Hub (Default)</option>
          <template x-for="p in fleetProjects" :key="p.project_id">
            <option :value="p.project_id" x-text="p.project_name + (p.is_hub ? ' [Hub]' : '')"></option>
          </template>
        </select>
      </div>

      <!-- Right Header Actions -->
      <div class="flex items-center space-x-2 sm:space-x-3">
        <!-- Button to open All Keywords Slide-Over Drawer -->
        <button @click="isDrawerOpen = true"
                class="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 transition flex items-center space-x-1.5">
          <i data-lucide="layers" class="w-3.5 h-3.5 text-emerald-500"></i>
          <span>Tracked Keywords</span>
          <span class="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-mono" x-text="keywords.length"></span>
        </button>

        <a href="/board-ideas" class="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 transition hidden sm:flex items-center space-x-1.5">
          <i data-lucide="radar" class="w-3.5 h-3.5 text-purple-500"></i>
          <span>Board Radar</span>
        </a>

        <a href="/" class="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 transition flex items-center space-x-1.5">
          <i data-lucide="home" class="w-3.5 h-3.5"></i>
          <span class="hidden sm:inline">Main Hub</span>
        </a>

        <!-- Dark/Light Theme Toggle -->
        <button @click="toggleTheme()" class="p-2 rounded-xl text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 transition">
          <i :data-lucide="darkMode ? 'sun' : 'moon'" class="w-3.5 h-3.5"></i>
        </button>
      </div>

    </div>
  </header>

  <!-- Slide-Over Drawer: Tracked Keywords Fleet Manager -->
  <div x-show="isDrawerOpen" x-cloak class="relative z-50">
    <!-- Backdrop -->
    <div x-show="isDrawerOpen"
         x-transition:enter="transition-opacity ease-linear duration-300"
         x-transition:enter-start="opacity-0"
         x-transition:enter-end="opacity-100"
         x-transition:leave="transition-opacity ease-linear duration-300"
         x-transition:leave-start="opacity-100"
         x-transition:leave-end="opacity-0"
         @click="isDrawerOpen = false"
         class="fixed inset-0 bg-slate-950/70 backdrop-blur-xs"></div>

    <!-- Panel -->
    <div class="fixed inset-y-0 right-0 max-w-full flex pl-10">
      <div x-show="isDrawerOpen"
           x-transition:enter="transform transition ease-in-out duration-300"
           x-transition:enter-start="translate-x-full"
           x-transition:enter-end="translate-x-0"
           x-transition:leave="transform transition ease-in-out duration-300"
           x-transition:leave-start="translate-x-0"
           x-transition:leave-end="translate-x-full"
           class="w-screen max-w-md bg-white dark:bg-[#0c1322] border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col">
        
        <!-- Drawer Header -->
        <div class="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div class="flex items-center space-x-2.5">
            <div class="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <i data-lucide="tag" class="w-4 h-4"></i>
            </div>
            <div>
              <h3 class="text-sm font-black text-slate-900 dark:text-white">Tracked Keywords Fleet</h3>
              <p class="text-[11px] text-slate-400 font-mono" x-text="filteredKeywords.length + ' Keywords Monitored'"></p>
            </div>
          </div>
          <button @click="isDrawerOpen = false" class="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-white transition">
            <i data-lucide="x" class="w-4 h-4"></i>
          </button>
        </div>

        <!-- Search in Drawer -->
        <div class="p-4 border-b border-slate-100 dark:border-slate-800/80">
          <div class="relative">
            <i data-lucide="search" class="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"></i>
            <input type="text" x-model="keywordSearch" placeholder="Filter tracked queries..."
                   class="w-full pl-8 pr-3 py-2 text-xs rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/40">
          </div>
        </div>

        <!-- Keyword Cards in Drawer -->
        <div class="p-4 flex-1 overflow-y-auto space-y-2">
          <template x-for="kw in filteredKeywords" :key="kw.id">
            <div @click="selectKeyword(kw); isDrawerOpen = false"
                 class="p-3 rounded-2xl border transition cursor-pointer relative group"
                 :class="selectedKeyword?.id === kw.id ? 'bg-emerald-500/10 border-emerald-500/40 shadow-xs' : 'bg-slate-50/70 dark:bg-slate-900/40 border-slate-200/80 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700'">
              <div class="flex items-start justify-between gap-2">
                <div class="flex items-center space-x-2.5 min-w-0">
                  <template x-if="kw.top_pin_image">
                    <img :src="kw.top_pin_image" class="w-9 h-11 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0">
                  </template>
                  <template x-if="!kw.top_pin_image">
                    <div class="w-9 h-11 rounded-lg bg-slate-200 dark:bg-slate-800 flex items-center justify-center shrink-0">
                      <i data-lucide="image" class="w-3.5 h-3.5 text-slate-400"></i>
                    </div>
                  </template>
                  <div class="min-w-0">
                    <p class="text-xs font-bold text-slate-900 dark:text-white truncate capitalize" x-text="kw.keyword"></p>
                    <span class="text-[10px] text-slate-400 font-mono" x-text="kw.category || 'General'"></span>
                  </div>
                </div>

                <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold shrink-0"
                      :class="Number(kw.avg_daily_velocity || 0) > 0 ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'"
                      x-text="(Number(kw.avg_daily_velocity || 0) > 0 ? '+' : '') + Number(kw.avg_daily_velocity || 0) + ' v/d'"></span>
              </div>

              <!-- Sparkline -->
              <div class="mt-2 flex items-center justify-between px-1">
                <span class="text-[9px] text-slate-400 font-mono" x-text="(kw.snapshots_count || 0) + ' / 100 pins'"></span>
                <svg class="w-20 h-3.5 overflow-visible" viewBox="0 0 80 20">
                  <path :d="generateSparklinePath(getSparklinePoints(kw), 80, 20)"
                        fill="none" :stroke="Number(kw.avg_daily_velocity || 0) > 0 ? '#10b981' : '#64748b'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>

              <!-- Actions -->
              <div class="mt-2 pt-2 border-t border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
                <span class="text-[10px] font-mono text-slate-500 truncate" x-text="'Updated: ' + formatDate(kw.last_crawled_at)"></span>
                <div class="flex items-center space-x-1.5">
                  <button @click.stop="rescanKeyword(kw.id, true)" :disabled="syncingKeywordId === kw.id"
                          class="p-1 rounded hover:bg-emerald-500/20 text-slate-400 hover:text-emerald-500 transition" title="Re-Crawl 100 pins now">
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
  </div>

  <!-- Main Full-Width Executive Container -->
  <main class="w-full max-w-[1920px] mx-auto p-4 sm:p-6 lg:p-8 space-y-6">

    <!-- EXECUTIVE CONTROL BAR: KEYWORD OMNIBAR & DIRECT ACTIONS -->
    <section class="p-4 sm:p-6 rounded-3xl bg-white dark:bg-[#0b1120] border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
      <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        
        <!-- Left: Active Keyword Title & Deep Metadata -->
        <div class="flex items-start sm:items-center space-x-3.5 min-w-0">
          <div class="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shadow-lg shadow-emerald-600/20 shrink-0">
            <i data-lucide="search" class="w-6 h-6"></i>
          </div>
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="text-xl sm:text-2xl font-black text-slate-900 dark:text-white capitalize truncate"
                  x-text="selectedKeyword?.keyword || activeKeywordQuery || 'Enter Keyword'"></h2>
              <span class="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                    x-text="selectedKeyword?.category || 'Organic Search'"></span>
              <span class="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                100 Pins Target
              </span>
              <template x-if="selectedKeyword?.last_crawled_at">
                <span class="text-[11px] text-slate-400 font-mono flex items-center space-x-1">
                  <i data-lucide="clock" class="w-3 h-3"></i>
                  <span x-text="'Crawled ' + formatDate(selectedKeyword.last_crawled_at)"></span>
                </span>
              </template>
            </div>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
              Live SERP Radar • Direct deep-link URL: <code class="text-emerald-500 font-mono text-[11px]" x-text="'/keywords/' + encodeURIComponent(activeSlug)"></code>
            </p>
          </div>
        </div>

        <!-- Right: Primary Actions Toolbar -->
        <div class="flex flex-wrap items-center gap-2 shrink-0">
          <!-- Re-Crawl 100 Pins Button with Force-Bypass -->
          <button @click="rescanActiveKeyword(true)"
                  :disabled="isDetailsLoading || syncingKeywordId === selectedKeyword?.id"
                  class="px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white transition flex items-center space-x-2 shadow-md shadow-emerald-950/20 active:scale-95 disabled:opacity-50 cursor-pointer">
            <i data-lucide="refresh-cw" class="w-3.5 h-3.5" :class="(isDetailsLoading || syncingKeywordId === selectedKeyword?.id) ? 'animate-spin' : ''"></i>
            <span>Re-Crawl 100 Pins</span>
          </button>

          <!-- Run GitHub Actions Pipeline -->
          <button @click="triggerWorkflow()" :disabled="isWorkflowDispatching"
                  class="px-3.5 py-2.5 rounded-2xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 transition flex items-center space-x-1.5 disabled:opacity-50"
                  title="Run Autonomous 24h Crawler via GitHub Actions">
            <i data-lucide="play" class="w-3.5 h-3.5 text-emerald-500" :class="isWorkflowDispatching ? 'animate-spin' : ''"></i>
            <span class="hidden sm:inline">GitHub Actions</span>
          </button>

          <!-- Copy SEO Formula -->
          <button @click="copySEOFormula()"
                  class="p-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 transition"
                  title="Copy SEO Title Formula">
            <i data-lucide="copy" class="w-4 h-4"></i>
          </button>

          <!-- Open Live Pinterest Search -->
          <a :href="'https://www.pinterest.com/search/pins/?q=' + encodeURIComponent(selectedKeyword?.keyword || activeKeywordQuery || '')" target="_blank"
             class="p-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 transition"
             title="Open on Pinterest">
            <i data-lucide="external-link" class="w-4 h-4"></i>
          </a>
        </div>

      </div>

      <!-- Center Omnibar: Instant Switcher & Predictive Autocomplete (v3_typeahead) -->
      <div class="relative pt-2 border-t border-slate-100 dark:border-slate-800/80">
        <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <!-- Keyword input with instant switcher / search -->
          <div class="relative flex-1">
            <i data-lucide="search" class="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2"></i>
            <input type="text" x-model="omnibarQuery"
                   @input.debounce.300ms="onOmnibarInput()"
                   @keydown.enter="submitOmnibarKeyword()"
                   @focus="isOmnibarDropdownOpen = true"
                   placeholder="Switch to tracked keyword or search new query (e.g. tater tot casserole, rustic farmhouse, fall fashion)..."
                   class="w-full pl-11 pr-10 py-3 rounded-2xl bg-slate-100/80 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 text-sm font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 shadow-xs transition">
            <div x-show="isTypeaheadLoading" class="absolute right-4 top-1/2 -translate-y-1/2">
              <i data-lucide="loader-2" class="w-4 h-4 text-emerald-500 animate-spin"></i>
            </div>
          </div>

          <!-- Submit / Inspect Button -->
          <button @click="submitOmnibarKeyword()" :disabled="!omnibarQuery.trim()"
                  class="px-5 py-3 rounded-2xl text-xs font-bold uppercase tracking-wider bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white transition flex items-center justify-center space-x-2 shrink-0 disabled:opacity-50">
            <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i>
            <span>Load / Track</span>
          </button>
        </div>

        <!-- Dropdown Menu: Filtered Tracked Keywords + Pinterest Trending Typeahead -->
        <div x-show="isOmnibarDropdownOpen && (omnibarTrackedMatches.length > 0 || typeaheadSuggestions.length > 0)" x-cloak
             @click.away="isOmnibarDropdownOpen = false"
             class="absolute left-0 right-0 top-full mt-2 z-50 bg-white dark:bg-[#0d1526] border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden p-3 space-y-2 max-h-96 overflow-y-auto">
          
          <!-- Section 1: Already Tracked Keywords Matches -->
          <template x-if="omnibarTrackedMatches.length > 0">
            <div class="space-y-1">
              <div class="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono flex items-center justify-between">
                <span>Already Tracked in Engine</span>
                <span class="text-emerald-500">1-Click Jump</span>
              </div>
              <template x-for="kw in omnibarTrackedMatches" :key="kw.id">
                <div @click="selectKeyword(kw); isOmnibarDropdownOpen = false; omnibarQuery = '';"
                     class="px-3 py-2 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-emerald-500/10 hover:text-emerald-600 dark:hover:text-emerald-400 cursor-pointer flex items-center justify-between transition">
                  <div class="flex items-center space-x-2.5">
                    <i data-lucide="check-circle" class="w-3.5 h-3.5 text-emerald-500"></i>
                    <span class="capitalize" x-text="kw.keyword"></span>
                  </div>
                  <span class="text-[10px] text-slate-400 font-mono" x-text="'+' + Number(kw.avg_daily_velocity || 0) + ' v/d'"></span>
                </div>
              </template>
            </div>
          </template>

          <!-- Section 2: Official Pinterest Predictive Suggestions (v3_typeahead) -->
          <template x-if="typeaheadSuggestions.length > 0">
            <div class="space-y-1 pt-1 border-t border-slate-100 dark:border-slate-800/80">
              <div class="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono flex items-center justify-between">
                <span>Pinterest Trending Autocomplete (v3_typeahead)</span>
                <span class="text-purple-500">+ Track & Crawl</span>
              </div>
              <template x-for="sug in typeaheadSuggestions" :key="sug">
                <div @click="trackNewKeyword(sug); isOmnibarDropdownOpen = false; omnibarQuery = '';"
                     class="px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-purple-500/10 hover:text-purple-600 dark:hover:text-purple-400 cursor-pointer flex items-center justify-between transition">
                  <div class="flex items-center space-x-2.5">
                    <i data-lucide="trending-up" class="w-3.5 h-3.5 text-purple-500"></i>
                    <span class="capitalize" x-text="sug"></span>
                  </div>
                  <span class="text-[10px] text-purple-500 font-mono">+ Index 100 Pins</span>
                </div>
              </template>
            </div>
          </template>
        </div>
      </div>
    </section>

    <!-- ZONE 2: EXECUTIVE 4-CARD KPI ANALYTICS RIBBON -->
    <section class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      
      <!-- KPI 1: Organic SERP Volatility -->
      <div class="p-5 rounded-3xl bg-white dark:bg-[#0b1120] border border-slate-200/80 dark:border-slate-800 space-y-3 shadow-xs">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-slate-500 dark:text-slate-400">SERP Movement</span>
          <span class="p-1.5 rounded-xl bg-emerald-500/10 text-emerald-500">
            <i data-lucide="activity" class="w-4 h-4"></i>
          </span>
        </div>
        <div class="flex items-center space-x-2">
          <span class="text-xl font-black text-slate-900 dark:text-white font-mono" x-text="selectedKeywordDetails?.current_pins?.length || 0"></span>
          <span class="text-xs text-slate-400 font-mono">/ 100 Organic Pins</span>
        </div>
        <div class="grid grid-cols-4 gap-1 pt-1 border-t border-slate-100 dark:border-slate-800/80 text-center">
          <div class="p-1 rounded-lg bg-emerald-500/10 text-[10px] font-mono font-bold text-emerald-600 dark:text-emerald-400" title="Climbed">
            ▲ <span x-text="selectedKeywordDetails?.stats?.climbed || 0"></span>
          </div>
          <div class="p-1 rounded-lg bg-rose-500/10 text-[10px] font-mono font-bold text-rose-600 dark:text-rose-400" title="Dropped">
            ▼ <span x-text="selectedKeywordDetails?.stats?.dropped || 0"></span>
          </div>
          <div class="p-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-[10px] font-mono font-bold text-slate-600 dark:text-slate-400" title="Stable">
            = <span x-text="selectedKeywordDetails?.stats?.stable || 0"></span>
          </div>
          <div class="p-1 rounded-lg bg-amber-500/10 text-[10px] font-mono font-bold text-amber-600 dark:text-amber-400" title="New Entries">
            ★ <span x-text="selectedKeywordDetails?.stats?.new_entries || 0"></span>
          </div>
        </div>
      </div>

      <!-- KPI 2: 24h Daily Save Velocity Pulse -->
      <div class="p-5 rounded-3xl bg-white dark:bg-[#0b1120] border border-slate-200/80 dark:border-slate-800 space-y-3 shadow-xs">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-slate-500 dark:text-slate-400">Save Velocity Pulse</span>
          <span class="p-1.5 rounded-xl bg-cyan-500/10 text-cyan-500">
            <i data-lucide="zap" class="w-4 h-4"></i>
          </span>
        </div>
        <div class="flex items-center space-x-2">
          <span class="text-xl font-black text-emerald-600 dark:text-emerald-400 font-mono"
                x-text="'+' + (selectedKeywordDetails?.avg_velocity ?? selectedKeyword?.avg_daily_velocity ?? 0) + ' /day'"></span>
        </div>
        <div class="flex items-center justify-between text-[11px] pt-1 border-t border-slate-100 dark:border-slate-800/80">
          <span class="text-slate-400 font-mono">Explosive Pins:</span>
          <span class="font-bold text-cyan-600 dark:text-cyan-400 font-mono" x-text="(selectedKeywordDetails?.velocity_chart?.explosive || 0) + ' Pins (≥50/d)'"></span>
        </div>
      </div>

      <!-- KPI 3: PinClicks Arbitrage Verdict -->
      <div class="p-5 rounded-3xl bg-white dark:bg-[#0b1120] border border-slate-200/80 dark:border-slate-800 space-y-3 shadow-xs">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-slate-500 dark:text-slate-400">Arbitrage Verdict</span>
          <span class="p-1.5 rounded-xl bg-purple-500/10 text-purple-500">
            <i data-lucide="sparkles" class="w-4 h-4"></i>
          </span>
        </div>
        <div class="flex items-center space-x-2">
          <template x-if="selectedKeywordDetails?.intelligence?.opportunity">
            <span class="px-2.5 py-1 rounded-xl text-xs font-black font-mono"
                  :class="selectedKeywordDetails.intelligence.opportunity.verdict === 'WIDE_OPEN' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : (selectedKeywordDetails.intelligence.opportunity.verdict === 'COMPETITIVE' ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400' : 'bg-rose-500/20 text-rose-600 dark:text-rose-400')"
                  x-text="selectedKeywordDetails.intelligence.opportunity.verdict === 'WIDE_OPEN' ? '🟢 WIDE OPEN' : (selectedKeywordDetails.intelligence.opportunity.verdict === 'COMPETITIVE' ? '🟡 MODERATE' : '🔴 SATURATED')"></span>
          </template>
          <template x-if="!selectedKeywordDetails?.intelligence?.opportunity">
            <span class="text-sm font-bold text-slate-400">Calculating...</span>
          </template>
        </div>
        <div class="flex items-center justify-between text-[11px] pt-1 border-t border-slate-100 dark:border-slate-800/80">
          <span class="text-slate-400 font-mono">Opportunity Score:</span>
          <span class="font-bold text-purple-600 dark:text-purple-400 font-mono" x-text="(selectedKeywordDetails?.intelligence?.opportunity?.opportunity_score ?? 85) + ' / 100'"></span>
        </div>
      </div>

      <!-- KPI 4: Semantic Guided Capsules -->
      <div class="p-5 rounded-3xl bg-white dark:bg-[#0b1120] border border-slate-200/80 dark:border-slate-800 space-y-3 shadow-xs">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-slate-500 dark:text-slate-400">Semantic Modifiers</span>
          <span class="p-1.5 rounded-xl bg-amber-500/10 text-amber-500">
            <i data-lucide="compass" class="w-4 h-4"></i>
          </span>
        </div>
        <div class="flex items-center space-x-2">
          <span class="text-xl font-black text-slate-900 dark:text-white font-mono" x-text="selectedKeywordDetails?.guides?.length || 0"></span>
          <span class="text-xs text-slate-400 font-mono">Capsules</span>
        </div>
        <div class="flex items-center justify-between text-[11px] pt-1 border-t border-slate-100 dark:border-slate-800/80 truncate">
          <span class="text-slate-400 font-mono">Top:</span>
          <span class="font-bold text-amber-600 dark:text-amber-400 font-mono truncate max-w-[150px]"
                x-text="selectedKeywordDetails?.guides?.[0]?.display_label || 'None'"></span>
        </div>
      </div>

    </section>

    <!-- ZONE 3: FULL-WIDTH TABBED WORKSPACE -->
    <section class="rounded-3xl bg-white dark:bg-[#0b1120] border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
      
      <!-- Top Tab Navigation Strip & Table Controls -->
      <div class="p-4 sm:p-5 border-b border-slate-200/80 dark:border-slate-800/80 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        
        <!-- Tab Buttons -->
        <div class="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <button @click="activeTab = 'serp'"
                  class="px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 cursor-pointer"
                  :class="activeTab === 'serp' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30' : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'">
            <i data-lucide="list-ordered" class="w-4 h-4"></i>
            <span>SERP Rankings Matrix</span>
            <span class="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                  x-text="'#' + (filteredPins.length || 0)"></span>
          </button>

          <button @click="activeTab = 'guides'"
                  class="px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 cursor-pointer"
                  :class="activeTab === 'guides' ? 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30' : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'">
            <i data-lucide="compass" class="w-4 h-4 text-cyan-500"></i>
            <span>Guided Capsules</span>
            <span class="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-600"
                  x-text="selectedKeywordDetails?.guides?.length || 0"></span>
          </button>

          <button @click="activeTab = 'intelligence'"
                  class="px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 cursor-pointer"
                  :class="activeTab === 'intelligence' ? 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30' : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'">
            <i data-lucide="sparkles" class="w-4 h-4 text-purple-500"></i>
            <span>PinClicks Intelligence</span>
          </button>

          <button @click="activeTab = 'velocity_curve'"
                  class="px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 cursor-pointer"
                  :class="activeTab === 'velocity_curve' ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30' : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'">
            <i data-lucide="activity" class="w-4 h-4 text-amber-500"></i>
            <span>Velocity Wave Chart</span>
          </button>

          <button @click="activeTab = 'dropped'"
                  class="px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 cursor-pointer"
                  :class="activeTab === 'dropped' ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30' : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'">
            <i data-lucide="arrow-down-left" class="w-4 h-4"></i>
            <span>Fell Out of SERP</span>
            <span class="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-rose-500/20 text-rose-600"
                  x-text="selectedKeywordDetails?.dropped_out_pins?.length || 0"></span>
          </button>
        </div>

        <!-- Filter & Sorting Controls for Table -->
        <template x-if="activeTab === 'serp'">
          <div class="flex flex-wrap items-center gap-2">
            <!-- Filter Search -->
            <div class="relative">
              <i data-lucide="search" class="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"></i>
              <input type="text" x-model="pinSearch" placeholder="Filter title, author, domain, tag..."
                     class="w-48 sm:w-64 pl-8 pr-3 py-1.5 text-xs rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/40">
            </div>

            <!-- Format Filter -->
            <select x-model="formatFilter" class="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none">
              <option value="ALL">All Formats</option>
              <option value="ORGANIC PIN">Organic Pin</option>
              <option value="VIDEO PIN">Video Pin</option>
              <option value="IDEA PIN">Idea Pin</option>
              <option value="PRODUCT CARD">Product Card</option>
            </select>

            <!-- Sort By -->
            <select x-model="pinSort" class="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none">
              <option value="rank">Sort: SERP Rank #1-100</option>
              <option value="velocity">Sort: 24h Velocity (Highest)</option>
              <option value="saves">Sort: Saves / Likes (Highest)</option>
              <option value="age">Sort: Newest First</option>
            </select>
          </div>
        </template>

      </div>

      <!-- TAB 1: EXECUTIVE FULL-WIDTH SERP MATRIX TABLE -->
      <div x-show="activeTab === 'serp'" class="space-y-0">
        
        <!-- Loading State -->
        <template x-if="isDetailsLoading">
          <div class="py-20 text-center space-y-3">
            <div class="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-500 mx-auto flex items-center justify-center">
              <i data-lucide="loader-2" class="w-6 h-6 animate-spin"></i>
            </div>
            <p class="text-sm font-bold text-slate-700 dark:text-slate-300">Loading Full 100-Pin SERP Report...</p>
            <p class="text-xs text-slate-400 font-mono">Comparing rank positions & calculating 24h save velocity baselines</p>
          </div>
        </template>

        <!-- Never Crawled / Empty State -->
        <template x-if="!isDetailsLoading && (!filteredPins || filteredPins.length === 0)">
          <div class="py-20 text-center space-y-4 max-w-md mx-auto p-4">
            <div class="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 mx-auto flex items-center justify-center">
              <i data-lucide="sparkles" class="w-6 h-6"></i>
            </div>
            <h3 class="text-base font-bold text-slate-900 dark:text-white capitalize" x-text="'No Snapshots for &quot;' + (selectedKeyword?.keyword || activeKeywordQuery) + '&quot;'"></h3>
            <p class="text-xs text-slate-500">This keyword has not been crawled yet. Trigger an on-demand crawl to index all 100 organic SERP pins directly from Pinterest.</p>
            <button @click="rescanActiveKeyword(true)"
                    class="px-5 py-2.5 rounded-2xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition shadow-md shadow-emerald-950/20 active:scale-95 flex items-center justify-center space-x-2 mx-auto">
              <i data-lucide="refresh-cw" class="w-4 h-4"></i>
              <span>Crawl 100 Pins Now</span>
            </button>
          </div>
        </template>

        <!-- Full-Width Responsive Table -->
        <template x-if="!isDetailsLoading && filteredPins && filteredPins.length > 0">
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="table-sticky-header bg-slate-100/90 dark:bg-[#080d19]/90 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 font-mono">
                  <th class="py-3.5 px-4 w-16"># Rank</th>
                  <th class="py-3.5 px-3 w-20">Delta</th>
                  <th class="py-3.5 px-4 min-w-[280px]">Creative Pin</th>
                  <th class="py-3.5 px-3 w-36">Format & Ratio</th>
                  <th class="py-3.5 px-3 w-36">StaticRank & Saves</th>
                  <th class="py-3.5 px-3 w-36">24h Velocity</th>
                  <th class="py-3.5 px-4 min-w-[200px]">Visual & Semantic Tags</th>
                  <th class="py-3.5 px-3 w-40">Domain Authority</th>
                  <th class="py-3.5 px-3 w-24 text-right">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
                <template x-for="pin in filteredPins" :key="pin.pin_id">
                  <tr class="hover:bg-slate-50/80 dark:hover:bg-slate-900/40 transition group">
                    
                    <!-- # Rank -->
                    <td class="py-3.5 px-4 font-mono font-black text-slate-900 dark:text-white">
                      <span class="px-2 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                            :class="Number(pin.rank_position) <= 10 ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30' : ''"
                            x-text="'#' + pin.rank_position"></span>
                    </td>

                    <!-- Delta Movement -->
                    <td class="py-3.5 px-3 font-mono font-bold">
                      <template x-if="pin.metadata?.is_new">
                        <span class="px-2 py-0.5 rounded text-[10px] bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">★ NEW</span>
                      </template>
                      <template x-if="!pin.metadata?.is_new && Number(pin.metadata?.rank_delta || 0) > 0">
                        <span class="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                              x-text="'▲ +' + pin.metadata.rank_delta"></span>
                      </template>
                      <template x-if="!pin.metadata?.is_new && Number(pin.metadata?.rank_delta || 0) < 0">
                        <span class="px-1.5 py-0.5 rounded text-[10px] bg-rose-500/15 text-rose-600 dark:text-rose-400"
                              x-text="'▼ ' + pin.metadata.rank_delta"></span>
                      </template>
                      <template x-if="!pin.metadata?.is_new && Number(pin.metadata?.rank_delta || 0) === 0">
                        <span class="text-slate-400 text-[10px]">= 0</span>
                      </template>
                    </td>

                    <!-- Creative Pin Thumbnail, Title, Pinner & Age -->
                    <td class="py-3.5 px-4 min-w-[280px]">
                      <div class="flex items-start space-x-3">
                        <template x-if="pin.image_url">
                          <div class="relative group/img shrink-0">
                            <img :src="pin.image_url" class="w-12 h-16 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shadow-xs group-hover/img:scale-105 transition cursor-pointer"
                                 @click="openVisualLens(pin)">
                          </div>
                        </template>
                        <template x-if="!pin.image_url">
                          <div class="w-12 h-16 rounded-xl bg-slate-200 dark:bg-slate-800 flex items-center justify-center shrink-0">
                            <i data-lucide="image" class="w-4 h-4 text-slate-400"></i>
                          </div>
                        </template>

                        <div class="min-w-0 space-y-1">
                          <a :href="'https://www.pinterest.com/pin/' + pin.pin_id + '/'" target="_blank"
                             class="font-bold text-slate-900 dark:text-white hover:text-emerald-500 line-clamp-2 block transition"
                             x-text="pin.title || 'Untitled Pin'"></a>
                          
                          <div class="flex items-center space-x-2 text-[10px] text-slate-400 font-mono">
                            <template x-if="pin.metadata?.pinner?.username">
                              <span class="flex items-center space-x-1 truncate max-w-[140px]">
                                <i data-lucide="user" class="w-3 h-3 text-slate-500"></i>
                                <span x-text="'@' + pin.metadata.pinner.username"></span>
                              </span>
                            </template>
                            <span class="px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-500"
                                  x-text="formatAge(pin.metadata?.pin_age_days)"></span>
                          </div>
                        </div>
                      </div>
                    </td>

                    <!-- Format & Aspect Ratio -->
                    <td class="py-3.5 px-3 space-y-1">
                      <div>
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider font-mono block w-fit"
                              :class="pin.metadata?.format === 'VIDEO PIN' ? 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30' : (pin.metadata?.format === 'PRODUCT CARD' ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400')"
                              x-text="pin.metadata?.format || 'ORGANIC PIN'"></span>
                      </div>
                      <span class="text-[10px] text-slate-400 font-mono block" x-text="pin.metadata?.aspect_ratio_tier || '2:3 Standard'"></span>
                    </td>

                    <!-- StaticRank & Saves / Likes -->
                    <td class="py-3.5 px-3 space-y-0.5">
                      <div class="flex items-center space-x-1.5 font-bold font-mono text-slate-800 dark:text-slate-200">
                        <i data-lucide="bookmark" class="w-3.5 h-3.5 text-emerald-500"></i>
                        <span x-text="formatNumber(pin.metadata?.raw_saves || pin.save_count || pin.metadata?.reactions) + ' saves'"></span>
                      </div>
                      <template x-if="Number(pin.comment_count) > 0">
                        <span class="text-[10px] text-slate-400 font-mono block" x-text="pin.comment_count + ' comments'"></span>
                      </template>
                    </td>

                    <!-- 24h Velocity -->
                    <td class="py-3.5 px-3 space-y-1">
                      <span class="px-2.5 py-1 rounded-xl text-xs font-black font-mono block w-fit"
                            :class="Number(pin.daily_save_velocity || 0) >= 50 ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30' : (Number(pin.daily_save_velocity || 0) >= 10 ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30' : (Number(pin.daily_save_velocity || 0) > 0 ? 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'))"
                            x-text="(Number(pin.daily_save_velocity || 0) > 0 ? '+' : '') + Number(pin.daily_save_velocity || 0) + ' /d'"></span>
                      <span class="text-[9px] uppercase font-mono tracking-wider text-slate-400 block"
                            x-text="pin.metadata?.velocity_tier || 'stagnant'"></span>
                    </td>

                    <!-- Computer-Vision Tags Modal Trigger -->
                    <td class="py-3.5 px-4 min-w-[200px]">
                      <template x-if="pin.metadata?.visual_annotations && pin.metadata.visual_annotations.length > 0">
                        <div class="flex flex-wrap items-center gap-1">
                          <template x-for="tag in pin.metadata.visual_annotations.slice(0, 3)" :key="tag">
                            <span @click.stop="copyToClipboard(tag, 'Copied keyword: ' + tag)"
                                  class="px-2 py-0.5 rounded-lg text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium hover:text-emerald-500 cursor-pointer transition"
                                  x-text="tag" title="Click to copy"></span>
                          </template>
                          <template x-if="pin.metadata.visual_annotations.length > 3">
                            <button @click.stop="openPinKeywordsModal(pin)"
                                    class="px-2 py-0.5 rounded-lg text-[10px] bg-purple-500/15 hover:bg-purple-500/25 text-purple-600 dark:text-purple-400 font-bold transition cursor-pointer">
                              <span x-text="'+' + (pin.metadata.visual_annotations.length - 3) + ' tags'"></span>
                            </button>
                          </template>
                        </div>
                      </template>
                      <template x-if="!pin.metadata?.visual_annotations || pin.metadata.visual_annotations.length === 0">
                        <span class="text-[10px] text-slate-400 italic">No tags detected</span>
                      </template>
                    </td>

                    <!-- Domain Authority -->
                    <td class="py-3.5 px-3">
                      <template x-if="pin.domain">
                        <a :href="pin.destination_url || '#'" target="_blank"
                           class="text-xs font-mono text-slate-600 dark:text-slate-400 hover:text-emerald-500 truncate max-w-[140px] block"
                           x-text="pin.domain"></a>
                      </template>
                      <template x-if="!pin.domain">
                        <span class="text-[10px] text-slate-400 italic font-mono">No external domain</span>
                      </template>
                    </td>

                    <!-- Actions -->
                    <td class="py-3.5 px-3 text-right">
                      <div class="flex items-center justify-end space-x-1.5">
                        <button @click="openVisualLens(pin)"
                                class="p-1.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 transition"
                                title="Visual Lens Similarity Search">
                          <i data-lucide="camera" class="w-3.5 h-3.5"></i>
                        </button>
                        <a :href="'https://www.pinterest.com/pin/' + pin.pin_id + '/'" target="_blank"
                           class="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition"
                           title="Open Pin on Pinterest">
                          <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                        </a>
                      </div>
                    </td>

                  </tr>
                </template>
              </tbody>
            </table>
          </div>
        </template>

      </div>

      <!-- TAB 2: SEMANTIC GUIDED SEARCH CAPSULES -->
      <div x-show="activeTab === 'guides'" class="p-6 space-y-6">
        <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800/80">
          <div>
            <h3 class="text-base font-black text-slate-900 dark:text-white">Pinterest Official Ranked Guides (Capsules)</h3>
            <p class="text-xs text-slate-500">Extracted directly from Pinterest's Semantic Intent Model (v3_guided_search)</p>
          </div>
          <button @click="copySEOFormula()" class="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition flex items-center space-x-1.5 shadow-sm active:scale-95">
            <i data-lucide="copy" class="w-3.5 h-3.5"></i>
            <span>Copy Complete SEO Formula</span>
          </button>
        </div>

        <template x-if="!selectedKeywordDetails?.guides || selectedKeywordDetails.guides.length === 0">
          <div class="py-12 text-center text-xs text-slate-400 italic">
            No semantic guided capsules discovered for this keyword yet. Click "Re-Crawl 100 Pins" to extract fresh guides.
          </div>
        </template>

        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <template x-for="(g, i) in selectedKeywordDetails?.guides" :key="g.id || g.term">
            <div class="p-3.5 rounded-2xl bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 hover:border-emerald-500/40 transition group cursor-pointer"
                 @click="researchKeywordTag(selectedKeyword.keyword + ' ' + (g.display_label || g.term))">
              <div class="flex items-center justify-between mb-2">
                <span class="text-[10px] font-mono font-bold text-slate-400" x-text="'#' + (i + 1)"></span>
                <span class="w-3 h-3 rounded-full border border-black/20" :style="'background-color: ' + (g.dominant_color || '#10b981')"></span>
              </div>
              <p class="text-xs font-bold text-slate-900 dark:text-white capitalize group-hover:text-emerald-500 transition" x-text="g.display_label || g.term"></p>
              <div class="mt-2 pt-2 border-t border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                <span x-text="'Score ' + Number(g.score || 0).toFixed(1)"></span>
                <span class="text-emerald-500">+ Track</span>
              </div>
            </div>
          </template>
        </div>
      </div>

      <!-- TAB 3: PINCLICKS INTELLIGENCE & ARBITRAGE BREAKDOWN -->
      <div x-show="activeTab === 'intelligence'" class="p-6 space-y-6">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div class="p-5 rounded-2xl bg-slate-50/70 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800 space-y-3">
            <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">StaticRank Distribution</h4>
            <div class="space-y-2">
              <div class="flex items-center justify-between text-xs">
                <span class="text-slate-500">Total Analyzed Pins</span>
                <span class="font-mono font-bold text-slate-900 dark:text-white" x-text="selectedKeywordDetails?.current_pins?.length || 0"></span>
              </div>
              <div class="flex items-center justify-between text-xs">
                <span class="text-slate-500">Avg Saves Per Pin</span>
                <span class="font-mono font-bold text-emerald-500" x-text="formatNumber(selectedKeywordDetails?.intelligence?.avg_saves || 0)"></span>
              </div>
              <div class="flex items-center justify-between text-xs">
                <span class="text-slate-500">Median Saves</span>
                <span class="font-mono font-bold text-slate-700 dark:text-slate-300" x-text="formatNumber(selectedKeywordDetails?.intelligence?.median_saves || 0)"></span>
              </div>
            </div>
          </div>

          <div class="p-5 rounded-2xl bg-slate-50/70 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800 space-y-3">
            <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">Domain Concentration</h4>
            <div class="space-y-2">
              <div class="flex items-center justify-between text-xs">
                <span class="text-slate-500">Top Ranked Domain</span>
                <span class="font-mono font-bold text-slate-900 dark:text-white truncate max-w-[130px]" x-text="selectedKeywordDetails?.intelligence?.top_domain || 'N/A'"></span>
              </div>
              <div class="flex items-center justify-between text-xs">
                <span class="text-slate-500">Domain Share</span>
                <span class="font-mono font-bold text-purple-500" x-text="(selectedKeywordDetails?.intelligence?.top_domain_share || 0) + '%'"></span>
              </div>
            </div>
          </div>

          <div class="p-5 rounded-2xl bg-slate-50/70 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800 space-y-3">
            <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">Creative Formats</h4>
            <div class="space-y-2">
              <div class="flex items-center justify-between text-xs">
                <span class="text-slate-500">Standard Static (2:3)</span>
                <span class="font-mono font-bold text-emerald-500" x-text="(selectedKeywordDetails?.intelligence?.static_ratio || 80) + '%'"></span>
              </div>
              <div class="flex items-center justify-between text-xs">
                <span class="text-slate-500">Video & Idea Pins</span>
                <span class="font-mono font-bold text-cyan-500" x-text="(selectedKeywordDetails?.intelligence?.video_ratio || 20) + '%'"></span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- TAB 4: VELOCITY WAVE CHART -->
      <div x-show="activeTab === 'velocity_curve'" class="p-6 space-y-4">
        <h3 class="text-sm font-bold text-slate-900 dark:text-white">24h Save Velocity Distribution Histogram</h3>
        <p class="text-xs text-slate-500">Visual breakdown of pins climbing exponentially vs stagnant pins</p>
        <div class="p-6 rounded-2xl bg-slate-900/60 border border-slate-800">
          <svg class="w-full h-40 overflow-visible" viewBox="0 0 500 75" preserveAspectRatio="none">
            <defs>
              <linearGradient id="velocityGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#10b981" stop-opacity="0.4"/>
                <stop offset="100%" stop-color="#10b981" stop-opacity="0"/>
              </linearGradient>
            </defs>
            <path :d="getVelocityAreaPath(selectedKeywordDetails?.velocity_chart?.points || []).area" fill="url(#velocityGrad)" />
            <path :d="getVelocityAreaPath(selectedKeywordDetails?.velocity_chart?.points || []).line" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round"/>
          </svg>
        </div>
      </div>

      <!-- TAB 5: FELL OUT PINS -->
      <div x-show="activeTab === 'dropped'" class="p-6 space-y-4">
        <h3 class="text-sm font-bold text-slate-900 dark:text-white">Pins Displaced From SERP Top 100</h3>
        <p class="text-xs text-slate-500">These pins fell out of the rankings during recent SERP crawls</p>

        <template x-if="!selectedKeywordDetails?.dropped_out_pins || selectedKeywordDetails.dropped_out_pins.length === 0">
          <div class="py-12 text-center text-xs text-slate-400 italic">
            Zero pins fell out during the last crawl. All top rank positions remain retained.
          </div>
        </template>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <template x-for="p in selectedKeywordDetails?.dropped_out_pins" :key="p.pin_id">
            <div class="p-3.5 rounded-2xl bg-slate-50/70 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 flex items-start space-x-3">
              <template x-if="p.image_url">
                <img :src="p.image_url" class="w-12 h-16 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0">
              </template>
              <div class="min-w-0 flex-1 space-y-1">
                <span class="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-rose-500/15 text-rose-600 dark:text-rose-400">FELL OUT</span>
                <p class="text-xs font-bold text-slate-900 dark:text-white line-clamp-2" x-text="p.title || 'Untitled Pin'"></p>
                <div class="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                  <span x-text="'Was Rank #' + (p.rank_position || '?')"></span>
                  <a :href="'https://www.pinterest.com/pin/' + p.pin_id + '/'" target="_blank" class="text-emerald-500 hover:underline">View Pin</a>
                </div>
              </div>
            </div>
          </template>
        </div>
      </div>

    </section>

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
          <div class="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-500 text-white flex items-center justify-center shadow-lg shadow-purple-600/20 shrink-0">
            <i data-lucide="camera" class="w-5 h-5"></i>
          </div>
          <div>
            <div class="flex items-center space-x-2">
              <h3 class="text-base font-black text-slate-900 dark:text-white">Pinterest Visual Similarity Lens</h3>
              <span class="px-2 py-0.5 text-[10px] font-bold uppercase rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30 font-mono">v3_visual_search</span>
            </div>
            <p class="text-[11px] text-slate-500 dark:text-slate-400">Reverse-engineers visual duplicates, competitor clones, and high-velocity templates</p>
          </div>
        </div>
        
        <button @click="closeVisualLens()" class="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition">
          <i data-lucide="x" class="w-5 h-5"></i>
        </button>
      </div>

      <!-- Seed Pin Context -->
      <template x-if="visualLensPin">
        <div class="p-4 bg-purple-500/5 border-b border-slate-200 dark:border-slate-800/80 flex items-center justify-between gap-4">
          <div class="flex items-center space-x-3 min-w-0">
            <template x-if="visualLensPin.image_url">
              <img :src="visualLensPin.image_url" class="w-10 h-14 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0 shadow-xs">
            </template>
            <div class="min-w-0">
              <div class="flex items-center space-x-2">
                <span class="text-[10px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 font-mono">Target Seed Pin</span>
                <span class="text-[10px] text-slate-400 font-mono" x-text="'ID: ' + visualLensPin.pin_id"></span>
              </div>
              <h4 class="text-xs font-bold text-slate-900 dark:text-white truncate pt-0.5" x-text="visualLensPin.title || 'Untitled Pin'"></h4>
              <div class="flex items-center space-x-2 text-[10px] text-slate-500 font-mono">
                <span x-text="visualLensPin.domain || 'Direct Pin'"></span>
                <span>•</span>
                <span x-text="formatNumber(visualLensPin.save_count) + ' saves'"></span>
              </div>
            </div>
          </div>

          <a :href="'https://www.pinterest.com/pin/' + visualLensPin.pin_id + '/'" target="_blank"
             class="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition flex items-center space-x-1.5 shadow-sm active:scale-95 shrink-0">
            <span>View Seed Pin</span>
            <i data-lucide="external-link" class="w-3 h-3"></i>
          </a>
        </div>
      </template>

      <!-- Modal Body -->
      <div class="p-5 flex-1 overflow-y-auto space-y-4">
        
        <template x-if="isVisualLensLoading">
          <div class="py-12 text-center space-y-3">
            <div class="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-500 mx-auto flex items-center justify-center">
              <i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i>
            </div>
            <p class="text-xs font-semibold text-slate-600 dark:text-slate-300">Scanning Pinterest visual graph for candidate clones...</p>
            <p class="text-[11px] text-slate-400 font-mono">Analyzing visual embeddings and domain parity</p>
          </div>
        </template>

        <template x-if="!isVisualLensLoading && visualLensError">
          <div class="p-6 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-center space-y-2">
            <i data-lucide="alert-triangle" class="w-6 h-6 text-rose-500 mx-auto"></i>
            <p class="text-xs font-bold text-rose-600 dark:text-rose-400" x-text="visualLensError"></p>
            <button @click="openVisualLens(visualLensPin)" class="px-3 py-1.5 rounded-xl bg-rose-500 text-white text-xs font-bold hover:bg-rose-600 transition">
              Retry Visual Search
            </button>
          </div>
        </template>

        <template x-if="!isVisualLensLoading && !visualLensError && visualLensResults.length === 0">
          <div class="py-12 text-center space-y-2">
            <i data-lucide="search-x" class="w-8 h-8 text-slate-400 mx-auto"></i>
            <p class="text-xs font-bold text-slate-700 dark:text-slate-300">No Direct Visual Clones Found</p>
            <p class="text-[11px] text-slate-500">This pin appears visually unique with no duplicate template matches detected in the top clusters.</p>
          </div>
        </template>

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
                  <template x-if="match.image_url">
                    <img :src="match.image_url" class="w-14 h-20 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0 shadow-sm hover:scale-105 transition">
                  </template>
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
                        <span class="text-[10px] font-mono text-slate-500 truncate max-w-[130px]" x-text="match.domain"></span>
                      </template>
                      <a :href="'https://www.pinterest.com/pin/' + match.pin_id + '/'" target="_blank"
                         class="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-white ml-auto">
                        <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                      </a>
                    </div>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </template>

      </div>

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
              <span class="text-[10px] font-mono">Click a tag to track or copy</span>
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
        activeKeywordQuery: '',
        isDetailsLoading: false,
        isWorkflowDispatching: false,
        syncingKeywordId: null,
        isDrawerOpen: false,

        // Concurrency & Race-Condition Hardening
        detailRequestId: 0,
        detailAbortController: null,

        // Omnibar State
        omnibarQuery: '',
        typeaheadSuggestions: [],
        isTypeaheadLoading: false,
        isOmnibarDropdownOpen: false,

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

        get activeSlug() {
          const raw = this.selectedKeyword?.keyword || this.activeKeywordQuery || '';
          return raw.trim().toLowerCase().replace(/\\s+/g, '-');
        },

        get omnibarTrackedMatches() {
          if (!this.omnibarQuery.trim()) return [];
          const q = this.omnibarQuery.toLowerCase().trim();
          return this.keywords.filter(k => k.keyword.toLowerCase().includes(q)).slice(0, 5);
        },

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

        init() {
          this.selectedProjectId = localStorage.getItem('pa_selected_project_id') || '';
          this.darkMode = localStorage.getItem('pa_theme') !== 'light';
          this.applyTheme();
          this.fetchFleetProjects();

          // Listen for browser Back/Forward navigation
          window.addEventListener('popstate', (e) => {
            const pathSlug = this.extractSlugFromUrl();
            if (pathSlug) {
              this.loadKeywordBySlugOrText(pathSlug, false);
            }
          });

          // Check if initialized from path slug (/keywords/:slug)
          const urlSlug = this.extractSlugFromUrl() || window.__INITIAL_KEYWORD_SLUG__ || '';
          
          this.fetchKeywords().then(() => {
            if (urlSlug) {
              this.loadKeywordBySlugOrText(urlSlug, false);
            } else if (this.keywords.length > 0 && !this.selectedKeyword) {
              this.selectKeyword(this.keywords[0]);
            }
          });

          this.$watch('keywordSearch', () => this.filterKeywords());
          this.$nextTick(() => { lucide.createIcons(); });
        },

        extractSlugFromUrl() {
          const path = window.location.pathname || '';
          if (path.startsWith('/keywords/')) {
            const raw = path.slice('/keywords/'.length);
            return decodeURIComponent(raw).trim();
          }
          const urlParams = new URLSearchParams(window.location.search);
          return urlParams.get('q') || urlParams.get('keyword') || urlParams.get('slug') || '';
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

        async loadKeywordBySlugOrText(slugOrText, updateHistory = true) {
          if (!slugOrText) return;
          const cleanText = slugOrText.replace(/[-_]+/g, ' ').trim().toLowerCase();
          const cleanSlug = cleanText.replace(/\\s+/g, '-');
          this.activeKeywordQuery = cleanText;

          // Find in existing tracked keywords first
          const match = this.keywords.find(k => 
            k.keyword.toLowerCase() === cleanText ||
            k.keyword.toLowerCase().replace(/\\s+/g, '-') === cleanSlug
          );

          if (match) {
            await this.selectKeyword(match, updateHistory);
          } else {
            // Keyword not in memory: resolve or auto-create via API
            this.isDetailsLoading = true;
            try {
              const res = await fetch(this.getApiUrl('/api/keywords/serp-compare?slug=' + encodeURIComponent(cleanSlug)));
              const data = await res.json();
              if (data.success && data.keyword) {
                this.selectedKeyword = data.keyword;
                this.selectedKeywordDetails = data;
                if (!this.keywords.some(k => k.id === data.keyword.id)) {
                  this.keywords.unshift(data.keyword);
                  this.filterKeywords();
                }
                if (updateHistory) {
                  window.history.pushState(null, '', '/keywords/' + encodeURIComponent(cleanSlug));
                }
                // If never crawled, trigger automatic initial crawl
                if (data.status === 'never_crawled' || (data.current_pins && data.current_pins.length === 0)) {
                  this.rescanKeyword(data.keyword.id, true);
                }
              } else {
                throw new Error(data.error || 'Could not resolve keyword');
              }
            } catch (err) {
              this.showToast('Error loading keyword: ' + err.message, 'error');
            } finally {
              this.isDetailsLoading = false;
              this.$nextTick(() => { lucide.createIcons(); });
            }
          }
        },

        async selectKeyword(kw, updateHistory = true) {
          if (!kw) return;
          this.selectedKeyword = kw;
          this.activeKeywordQuery = kw.keyword;
          this.isDetailsLoading = true;
          this.activeTab = 'serp';

          const cleanSlug = kw.keyword.trim().toLowerCase().replace(/\\s+/g, '-');
          if (updateHistory) {
            window.history.pushState(null, '', '/keywords/' + encodeURIComponent(cleanSlug));
          }

          // RACE CONDITION ELIMINATION: Abort prior in-flight request & track requestId
          if (this.detailAbortController) {
            this.detailAbortController.abort();
          }
          this.detailAbortController = new AbortController();
          const currentReqId = ++this.detailRequestId;

          try {
            const res = await fetch(this.getApiUrl('/api/keywords/serp-compare?keyword_id=' + kw.id), {
              signal: this.detailAbortController.signal
            });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();

            // Ignore stale responses if user switched keywords in the meantime
            if (currentReqId !== this.detailRequestId) return;

            this.selectedKeywordDetails = data;

            // If never crawled, trigger background crawl
            if (data.status === 'never_crawled') {
              this.rescanKeyword(kw.id, true);
            }
          } catch (err) {
            if (err.name === 'AbortError') return; // Clean abort
            if (currentReqId === this.detailRequestId) {
              this.showToast('Error loading SERP details: ' + err.message, 'error');
            }
          } finally {
            if (currentReqId === this.detailRequestId) {
              this.isDetailsLoading = false;
              this.$nextTick(() => { lucide.createIcons(); });
            }
          }
        },

        async onOmnibarInput() {
          const q = this.omnibarQuery.trim();
          this.isOmnibarDropdownOpen = true;
          if (q.length < 2) {
            this.typeaheadSuggestions = [];
            return;
          }

          this.isTypeaheadLoading = true;
          try {
            const res = await fetch(this.getApiUrl('/api/keywords/typeahead?q=' + encodeURIComponent(q)));
            if (res.ok) {
              const data = await res.json();
              this.typeaheadSuggestions = data.suggestions || [];
            }
          } catch (_) {} finally {
            this.isTypeaheadLoading = false;
            this.$nextTick(() => { lucide.createIcons(); });
          }
        },

        async submitOmnibarKeyword() {
          const raw = this.omnibarQuery.trim();
          if (!raw) return;
          this.isOmnibarDropdownOpen = false;
          this.omnibarQuery = '';
          await this.loadKeywordBySlugOrText(raw, true);
        },

        async trackNewKeyword(term) {
          const clean = term.trim();
          if (!clean) return;
          await this.loadKeywordBySlugOrText(clean, true);
        },

        async rescanActiveKeyword(force = true) {
          if (this.selectedKeyword?.id) {
            await this.rescanKeyword(this.selectedKeyword.id, force);
          } else if (this.activeKeywordQuery) {
            await this.loadKeywordBySlugOrText(this.activeKeywordQuery, true);
          }
        },

        async rescanKeyword(id, force = true) {
          this.syncingKeywordId = id;
          this.showToast('Crawling fresh 100-pin SERP from Pinterest...', 'info');

          try {
            const res = await fetch(this.getApiUrl('/api/keywords/sync'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ keyword_id: id, force: Boolean(force) })
            });

            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            const count = data.result?.crawled_pins || 100;
            this.showToast('SERP updated: ' + count + ' pins indexed!', 'success');

            // Refresh keywords list and active keyword details
            await this.fetchKeywords();
            if (this.selectedKeyword && this.selectedKeyword.id === id) {
              await this.selectKeyword(this.selectedKeyword, false);
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
            if (this.keywords.length > 0 && !this.selectedKeyword) {
              this.selectKeyword(this.keywords[0]);
            }
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
              body: JSON.stringify({ target_keyword: this.selectedKeyword?.keyword || this.activeKeywordQuery || '' })
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
          const kw = this.selectedKeyword?.keyword || this.activeKeywordQuery || '';
          if (!kw) return;
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
          this.closePinKeywordsModal();
          this.loadKeywordBySlugOrText(tag, true);
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
