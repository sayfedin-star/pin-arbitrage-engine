/**
 * Keyword Intelligence & Velocity Dedicated Standalone Studio UI
 * Pure ES Module generating the full HTML application.
 * Compatible with both Cloudflare Workers (V8 isolate) and Node.js.
 *
 * Hardened for Production:
 * - Direct Slug & Deep-Link Routing (/keywords/:slug and /keywords/:keyword)
 * - PinClicks Parity: Right Slide-Over Pin Inspector Drawer with 6 performance cards
 * - Pinterest Trends Parity: 52-Week Interactive Seasonality Curve, Demographics & Related Sparklines
 * - Metric Accuracy: Clear distinction between All-Time Saves vs Direct Reactions (Likes)
 * - Estimated Monthly Volume (~362k/mo) & Seasonal Peak Indicator
 * - Zero-cramping architecture: Full-width table, instant omnibar switcher, slide-over fleet drawer
 * - Request-ID versioning & AbortController (Zero client-side race conditions)
 * - Force-bypass self-healing locks (Zero crawl_lock lockout)
 */

export function getKeywordsPageHtml(initialSlug = '') {
  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="referrer" content="no-referrer">
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

        <span class="text-slate-300 dark:text-slate-700 hidden md:inline">/</span>

        <!-- Active Keyword Breadcrumb & Navigation -->
        <div class="hidden md:flex items-center space-x-2 text-xs">
          <a href="/keywords" @click.prevent="switchToDashboard()" class="text-slate-400 hover:text-emerald-500 transition font-medium cursor-pointer">Keywords</a>
          <template x-if="viewModeLevel === 'serp_studio'">
            <div class="flex items-center space-x-2">
              <span class="text-slate-300 dark:text-slate-700">/</span>
              <span class="font-bold text-emerald-600 dark:text-emerald-400 font-mono capitalize" x-text="selectedKeyword?.keyword || activeKeywordQuery || 'Overview'"></span>
            </div>
          </template>
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
        <!-- Keyword Discovery Hub Link (Level 1B) -->
        <a href="/keywords/discovery"
           class="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-500/10 hover:bg-emerald-500/20 dark:bg-emerald-950/30 dark:hover:bg-emerald-900/40 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 transition flex items-center space-x-1.5 cursor-pointer">
          <i data-lucide="compass" class="w-3.5 h-3.5 text-emerald-500"></i>
          <span class="hidden sm:inline">Keyword Discovery</span>
          <span class="sm:hidden">Discovery</span>
        </a>

        <!-- Campaign Folders Fleet Link (Level 4) -->
        <a href="/folders"
           class="px-3 py-1.5 rounded-xl text-xs font-bold bg-pink-500/10 hover:bg-pink-500/20 dark:bg-pink-950/30 dark:hover:bg-pink-900/40 border border-pink-500/30 text-pink-600 dark:text-pink-400 transition flex items-center space-x-1.5 cursor-pointer">
          <i data-lucide="folder-kanban" class="w-3.5 h-3.5 text-pink-500"></i>
          <span class="hidden sm:inline">Campaign Folders</span>
          <span class="sm:hidden">Folders</span>
          <span class="px-1.5 py-0.2 rounded-full text-[10px] bg-pink-500/20 text-pink-600 dark:text-pink-300 font-mono" x-text="folders.length"></span>
        </a>

        <!-- Button to open All Keywords Slide-Over Drawer -->
        <button @click="isDrawerOpen = true"
                class="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 transition flex items-center space-x-1.5 cursor-pointer">
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

    <!-- ========================================================================= -->
    <!-- LEVEL 1A: EXECUTIVE KEYWORDS DASHBOARD (viewModeLevel === 'dashboard')   -->
    <!-- ========================================================================= -->
    <div x-show="viewModeLevel === 'dashboard'" x-cloak class="space-y-6">
      
      <!-- HERO & STRATEGIC ACTIONS HEADER -->
      <section class="p-6 rounded-3xl bg-white dark:bg-[#0b1120] border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div class="flex items-center space-x-3.5">
          <div class="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shadow-lg shadow-emerald-600/20 shrink-0">
            <i data-lucide="layers" class="w-6 h-6"></i>
          </div>
          <div>
            <div class="flex items-center space-x-2">
              <h2 class="text-xl font-black text-slate-900 dark:text-white">Keywords Fleet Dashboard</h2>
              <span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">Level 1A</span>
            </div>
            <p class="text-xs text-slate-400 mt-0.5">Multi-Cluster Organic SERP Monitoring • Velocity Tracking & Fleet Telemetry</p>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <button @click="openQuickTrackModal()"
                  class="px-4 py-2 rounded-2xl text-xs font-black uppercase tracking-wider bg-emerald-600 hover:bg-emerald-500 text-white transition flex items-center space-x-1.5 shadow-md shadow-emerald-950/20 active:scale-95 cursor-pointer">
            <i data-lucide="plus-circle" class="w-3.5 h-3.5"></i>
            <span>+ Track Keyword</span>
          </button>
          <a href="/keywords/discovery"
             class="px-4 py-2 rounded-2xl text-xs font-black uppercase tracking-wider bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 transition flex items-center space-x-1.5 shadow-xs cursor-pointer">
            <i data-lucide="compass" class="w-3.5 h-3.5"></i>
            <span>+ Discover Keywords</span>
          </a>
          <a href="/folders"
             class="px-4 py-2 rounded-2xl text-xs font-black uppercase tracking-wider bg-pink-500/15 hover:bg-pink-500/25 text-pink-600 dark:text-pink-400 border border-pink-500/30 transition flex items-center space-x-1.5 shadow-xs cursor-pointer">
            <i data-lucide="folder-kanban" class="w-3.5 h-3.5"></i>
            <span>Campaign Folders</span>
          </a>
          <button @click="triggerWorkflow()" :disabled="isWorkflowDispatching"
                  class="px-4 py-2 rounded-2xl text-xs font-black uppercase tracking-wider bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white transition flex items-center space-x-1.5 shadow-xs disabled:opacity-50 cursor-pointer">
            <i data-lucide="play" class="w-3.5 h-3.5 text-emerald-400" :class="isWorkflowDispatching ? 'animate-spin' : ''"></i>
            <span>Trigger Fleet Crawl</span>
          </button>
        </div>
      </section>

      <!-- 4 TOP KPI CARDS: FLEET TELEMETRY RIBBON -->
      <section class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <!-- KPI 1: Tracked Queries Fleet -->
        <div class="p-5 rounded-3xl bg-white dark:bg-[#0b1120] border border-slate-200/80 dark:border-slate-800 space-y-3 shadow-xs">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-slate-500 dark:text-slate-400">Tracked Queries Fleet</span>
            <span class="p-1.5 rounded-xl bg-emerald-500/10 text-emerald-500">
              <i data-lucide="tags" class="w-4 h-4"></i>
            </span>
          </div>
          <div class="flex items-baseline space-x-2">
            <span class="text-2xl font-black text-slate-900 dark:text-white font-mono" x-text="keywords.length"></span>
            <span class="text-xs text-slate-400 font-mono">Monitored</span>
          </div>
          <div class="flex items-center justify-between text-[11px] pt-1 border-t border-slate-100 dark:border-slate-800/80 font-mono">
            <span class="text-emerald-500 font-bold" x-text="activeKeywordsCount + ' Active'"></span>
            <span class="text-amber-500 font-bold" x-text="pausedKeywordsCount + ' Paused'"></span>
          </div>
        </div>

        <!-- KPI 2: Total Monitored Organic Pins -->
        <div class="p-5 rounded-3xl bg-white dark:bg-[#0b1120] border border-slate-200/80 dark:border-slate-800 space-y-3 shadow-xs">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-slate-500 dark:text-slate-400">Monitored Organic Pins</span>
            <span class="p-1.5 rounded-xl bg-blue-500/10 text-blue-500">
              <i data-lucide="database" class="w-4 h-4"></i>
            </span>
          </div>
          <div class="flex items-baseline space-x-2">
            <span class="text-2xl font-black text-slate-900 dark:text-white font-mono" x-text="formatNumber(totalMonitoredPins)"></span>
            <span class="text-xs text-slate-400 font-mono">Pins</span>
          </div>
          <div class="flex items-center justify-between text-[11px] pt-1 border-t border-slate-100 dark:border-slate-800/80 text-slate-400 font-mono">
            <span>Quota Depth:</span>
            <span class="font-bold text-blue-500">~100 Pins / Query</span>
          </div>
        </div>

        <!-- KPI 3: Fleet Save Velocity Pulse -->
        <div class="p-5 rounded-3xl bg-white dark:bg-[#0b1120] border border-slate-200/80 dark:border-slate-800 space-y-3 shadow-xs">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-slate-500 dark:text-slate-400">Fleet Velocity Pulse</span>
            <span class="p-1.5 rounded-xl bg-cyan-500/10 text-cyan-500">
              <i data-lucide="zap" class="w-4 h-4"></i>
            </span>
          </div>
          <div class="flex items-baseline space-x-2">
            <span class="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono" x-text="'+' + averageFleetVelocity + ' v/d'"></span>
            <span class="text-xs text-slate-400 font-mono">Average</span>
          </div>
          <div class="flex items-center justify-between text-[11px] pt-1 border-t border-slate-100 dark:border-slate-800/80 text-slate-400 font-mono">
            <span>Fleet Momentum:</span>
            <span class="font-bold text-emerald-500">Kinetic Growth</span>
          </div>
        </div>

        <!-- KPI 4: Nightly Crawler Fleet Status -->
        <div class="p-5 rounded-3xl bg-white dark:bg-[#0b1120] border border-slate-200/80 dark:border-slate-800 space-y-3 shadow-xs">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-slate-500 dark:text-slate-400">Nightly Crawler Fleet</span>
            <span class="p-1.5 rounded-xl bg-purple-500/10 text-purple-500">
              <i data-lucide="clock" class="w-4 h-4"></i>
            </span>
          </div>
          <div class="flex items-center space-x-2">
            <span class="px-2.5 py-1 rounded-xl text-xs font-black font-mono bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
              ● OPERATIONAL
            </span>
          </div>
          <div class="flex items-center justify-between text-[11px] pt-1 border-t border-slate-100 dark:border-slate-800/80 text-slate-400 font-mono truncate">
            <span class="truncate" x-text="nightlySyncCountdown"></span>
          </div>
        </div>
      </section>

      <!-- FILTER & SORT CONTROLS STRIP -->
      <section class="p-4 rounded-3xl bg-white dark:bg-[#0b1120] border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-2 flex-1">
          <!-- Search input -->
          <div class="relative flex-1 min-w-[200px] max-w-md">
            <i data-lucide="search" class="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"></i>
            <input type="text" x-model="dashboardSearch" placeholder="Search keywords or categories..."
                   class="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/40">
          </div>

          <!-- Category filter -->
          <select x-model="dashboardCategoryFilter" class="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer">
            <option value="ALL">All Categories</option>
            <template x-for="cat in uniqueCategories" :key="cat">
              <option :value="cat" x-text="cat"></option>
            </template>
          </select>

          <!-- Status filter -->
          <select x-model="dashboardStatusFilter" class="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer">
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active Tracking Only</option>
            <option value="PAUSED">Paused Only</option>
          </select>

          <!-- Sort filter -->
          <select x-model="dashboardSort" class="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer">
            <option value="velocity">Sort: Daily Velocity (Highest)</option>
            <option value="saves_delta">Sort: 24h Saves Δ (Highest)</option>
            <option value="repins_delta">Sort: 24h Repins Δ (Highest)</option>
            <option value="name">Sort: Alphabetical (A-Z)</option>
            <option value="crawled">Sort: Recently Crawled</option>
          </select>
        </div>

        <div class="flex items-center space-x-2 text-xs font-mono text-slate-400 shrink-0">
          <span x-text="filteredDashboardKeywords.length + ' of ' + keywords.length + ' Queries Shown'"></span>
        </div>
      </section>

      <!-- HIGH-DENSITY TRACKED KEYWORDS TABLE -->
      <section class="rounded-3xl bg-white dark:bg-[#0b1120] border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="table-sticky-header bg-slate-100/90 dark:bg-[#080d19]/90 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 font-mono">
                <th class="py-3.5 px-4 w-12 text-center">
                  <input type="checkbox" @click="toggleSelectAllDashboardKeywords()"
                         :checked="selectedKeywordIds.length === filteredDashboardKeywords.length && filteredDashboardKeywords.length > 0"
                         class="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 dark:border-slate-700">
                </th>
                <th class="py-3.5 px-3 w-14">Preview</th>
                <th class="py-3.5 px-4 min-w-[220px]">Keyword & Category</th>
                <th class="py-3.5 px-3 w-28">24h Saves Δ</th>
                <th class="py-3.5 px-3 w-28">24h Repins Δ</th>
                <th class="py-3.5 px-3 w-32">Daily Velocity</th>
                <th class="py-3.5 px-3 w-24">Pins Quota</th>
                <th class="py-3.5 px-3 w-28 text-center">Status</th>
                <th class="py-3.5 px-3 w-36">Last Crawled</th>
                <th class="py-3.5 px-4 w-36 text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
              <template x-for="kw in filteredDashboardKeywords" :key="kw.id">
                <tr class="hover:bg-slate-50/80 dark:hover:bg-slate-900/40 transition group cursor-pointer"
                    @click="switchToSerpStudio(kw)">
                  
                  <!-- Checkbox -->
                  <td class="py-3.5 px-4 text-center" @click.stop>
                    <input type="checkbox" :checked="isDashboardKeywordSelected(kw.id)" @click="toggleDashboardKeywordSelection(kw.id)"
                           class="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 dark:border-slate-700">
                  </td>

                  <!-- Thumbnail -->
                  <td class="py-3.5 px-3">
                    <template x-if="kw.top_pin_image">
                      <img :src="kw.top_pin_image" class="w-10 h-13 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shadow-xs">
                    </template>
                    <template x-if="!kw.top_pin_image">
                      <div class="w-10 h-13 rounded-lg bg-slate-200 dark:bg-slate-800 flex items-center justify-center">
                        <i data-lucide="image" class="w-3.5 h-3.5 text-slate-400"></i>
                      </div>
                    </template>
                  </td>

                  <!-- Keyword & Category -->
                  <td class="py-3.5 px-4 min-w-[220px]">
                    <div class="space-y-1">
                      <span class="font-bold text-slate-900 dark:text-white group-hover:text-emerald-500 text-sm capitalize block transition"
                            x-text="kw.keyword"></span>
                      <div class="flex items-center space-x-2">
                        <span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                              x-text="kw.category || 'General'"></span>
                        <template x-if="kw.annotation_id">
                          <span class="text-[10px] font-mono text-slate-400" x-text="'ID: ' + kw.annotation_id"></span>
                        </template>
                      </div>
                    </div>
                  </td>

                  <!-- 24h Saves Delta Pill Badge -->
                  <td class="py-3.5 px-3 font-mono">
                    <span class="px-2.5 py-1 rounded-full text-xs font-bold inline-block"
                          :class="getKeywordSaveDelta(kw) > 0 ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30' : (getKeywordSaveDelta(kw) < 0 ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30' : 'bg-slate-100 dark:bg-slate-800 text-slate-500')"
                          x-text="(getKeywordSaveDelta(kw) > 0 ? '+' : '') + formatNumber(getKeywordSaveDelta(kw))"></span>
                  </td>

                  <!-- 24h Repins Delta Pill Badge -->
                  <td class="py-3.5 px-3 font-mono">
                    <span class="px-2.5 py-1 rounded-full text-xs font-bold inline-block"
                          :class="getKeywordRepinDelta(kw) > 0 ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30' : (getKeywordRepinDelta(kw) < 0 ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30' : 'bg-slate-100 dark:bg-slate-800 text-slate-500')"
                          x-text="(getKeywordRepinDelta(kw) > 0 ? '+' : '') + formatNumber(getKeywordRepinDelta(kw))"></span>
                  </td>

                  <!-- Daily Velocity -->
                  <td class="py-3.5 px-3 font-mono">
                    <span class="px-2.5 py-1 rounded-lg text-xs font-black inline-block"
                          :class="Number(kw.avg_daily_velocity || 0) > 0 ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'"
                          x-text="(Number(kw.avg_daily_velocity || 0) > 0 ? '+' : '') + Number(kw.avg_daily_velocity || 0) + ' v/d'"></span>
                  </td>

                  <!-- Pins Quota -->
                  <td class="py-3.5 px-3 font-mono text-slate-500 dark:text-slate-400">
                    <span x-text="(kw.snapshots_count || 100) + ' / 100'"></span>
                  </td>

                  <!-- Active / Paused Status Toggle -->
                  <td class="py-3.5 px-3 text-center" @click.stop>
                    <button @click="toggleKeywordStatus(kw)"
                            class="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold transition inline-flex items-center space-x-1 cursor-pointer"
                            :class="kw.is_active !== false ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25' : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 hover:bg-amber-500/25'"
                            :title="kw.is_active !== false ? 'Click to Pause Tracking' : 'Click to Resume Tracking'">
                      <span class="w-1.5 h-1.5 rounded-full" :class="kw.is_active !== false ? 'bg-emerald-500' : 'bg-amber-500'"></span>
                      <span x-text="kw.is_active !== false ? 'Active' : 'Paused'"></span>
                    </button>
                  </td>

                  <!-- Last Crawled -->
                  <td class="py-3.5 px-3 font-mono text-slate-500 dark:text-slate-400 text-[11px] truncate"
                      x-text="formatDate(kw.last_crawled_at)"></td>

                  <!-- Actions -->
                  <td class="py-3.5 px-4 text-right" @click.stop>
                    <div class="flex items-center justify-end space-x-1.5">
                      <button @click="switchToSerpStudio(kw)"
                              class="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center space-x-1 cursor-pointer"
                              title="Open Level 2 SERP Studio">
                        <span>Studio</span>
                        <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i>
                      </button>
                      <button @click="rescanKeyword(kw.id, true)" :disabled="syncingKeywordId === kw.id"
                              class="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 hover:text-emerald-500 transition cursor-pointer"
                              title="Re-Crawl 100 pins">
                        <i data-lucide="refresh-cw" class="w-3.5 h-3.5" :class="syncingKeywordId === kw.id ? 'animate-spin text-emerald-500' : ''"></i>
                      </button>
                      <button @click="deleteKeyword(kw.id)"
                              class="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 hover:text-rose-500 transition cursor-pointer"
                              title="Delete Keyword">
                        <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                      </button>
                    </div>
                  </td>

                </tr>
              </template>

              <!-- Empty State Row -->
              <template x-if="!isKeywordsLoading && (!filteredDashboardKeywords || filteredDashboardKeywords.length === 0)">
                <tr>
                  <td colspan="8" class="py-16 text-center">
                    <div class="max-w-md mx-auto space-y-4 p-4">
                      <div class="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-500 mx-auto flex items-center justify-center">
                        <i data-lucide="search" class="w-6 h-6"></i>
                      </div>
                      <h3 class="text-base font-bold text-slate-900 dark:text-white">No Tracked Keywords Found</h3>
                      <p class="text-xs text-slate-500 dark:text-slate-400">
                        Monitor 100-pin SERP rankings, save velocity, and visual co-occurrence in real time. Track an evergreen query like <strong class="text-emerald-500 cursor-pointer hover:underline" @click="quickTrackKeyword('breakfast ideas')">"breakfast ideas"</strong> now.
                      </p>
                      <div class="flex items-center gap-2 max-w-sm mx-auto">
                        <input type="text" x-model="quickKeywordInput" @keydown.enter="submitQuickKeyword()"
                               placeholder="e.g. breakfast ideas, high protein meals..."
                               class="flex-1 px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40">
                        <button @click="submitQuickKeyword()"
                                class="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center space-x-1.5 shrink-0 cursor-pointer">
                          <i data-lucide="plus" class="w-3.5 h-3.5"></i>
                          <span>Track & Crawl</span>
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Quick Track Keyword Modal -->
      <div x-show="isQuickTrackModalOpen" x-cloak class="relative z-50">
        <div class="fixed inset-0 bg-slate-950/70 backdrop-blur-xs" @click="isQuickTrackModalOpen = false"></div>
        <div class="fixed inset-0 flex items-center justify-center p-4">
          <div class="w-full max-w-md bg-white dark:bg-[#0c1322] border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4">
            <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div class="flex items-center space-x-2.5">
                <div class="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                  <i data-lucide="plus-circle" class="w-4 h-4"></i>
                </div>
                <h3 class="text-sm font-black text-slate-900 dark:text-white">Track New Keyword</h3>
              </div>
              <button @click="isQuickTrackModalOpen = false" class="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400">
                <i data-lucide="x" class="w-4 h-4"></i>
              </button>
            </div>
            <div class="space-y-3">
              <div>
                <label class="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase font-mono block mb-1">Search Query / Keyword</label>
                <input type="text" x-model="quickKeywordInput" @keydown.enter="submitQuickKeyword()"
                       placeholder="e.g. breakfast ideas, avocado toast..."
                       class="w-full px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40">
              </div>
              <div>
                <label class="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase font-mono block mb-1">Category (Optional)</label>
                <input type="text" x-model="quickKeywordCategory"
                       placeholder="e.g. Food & Recipes, General..."
                       class="w-full px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40">
              </div>
            </div>
            <div class="flex items-center justify-end space-x-2 pt-2">
              <button @click="isQuickTrackModalOpen = false" class="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                Cancel
              </button>
              <button @click="submitQuickKeyword()" class="px-5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center space-x-1.5 shadow-md shadow-emerald-950/20">
                <i data-lucide="sparkles" class="w-3.5 h-3.5"></i>
                <span>Track & Index 100 Pins</span>
              </button>
            </div>
          </div>
        </div>
      </div>

    </div>

    <!-- ========================================================================= -->
    <!-- LEVEL 2: SERP RADAR STUDIO (viewModeLevel === 'serp_studio')             -->
    <!-- ========================================================================= -->
    <div x-show="viewModeLevel === 'serp_studio'" x-cloak class="space-y-6">

      <!-- Studio Return Button -->
      <div class="flex items-center justify-between">
        <button @click="switchToDashboard()"
                class="px-4 py-2 rounded-2xl text-xs font-bold bg-white dark:bg-[#0b1120] hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-800 text-slate-700 dark:text-slate-300 transition flex items-center space-x-2 shadow-xs cursor-pointer">
          <i data-lucide="arrow-left" class="w-4 h-4 text-emerald-500"></i>
          <span>← Back to Keywords Dashboard</span>
        </button>
        <span class="text-xs font-mono text-slate-400">Level 2: SERP Radar Studio</span>
      </div>

    <!-- EXECUTIVE CONTROL BAR: KEYWORD OMNIBAR & DIRECT ACTIONS -->
    <section class="p-4 sm:p-6 rounded-3xl bg-white dark:bg-[#0b1120] border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
      <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        
        <!-- Left: Active Keyword Title, Volume & Deep Metadata -->
        <div class="flex items-start sm:items-center space-x-3.5 min-w-0">
          <div class="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shadow-lg shadow-emerald-600/20 shrink-0">
            <i data-lucide="search" class="w-6 h-6"></i>
          </div>
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="text-xl sm:text-2xl font-black text-slate-900 dark:text-white capitalize truncate"
                  x-text="selectedKeyword?.keyword || activeKeywordQuery || 'Enter Keyword'"></h2>
              
              <!-- Official Pinterest Monthly Search Volume Badge (PinClicks & Pinterest Parity) -->
              <div class="flex items-center space-x-1.5 px-3 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30 text-xs font-mono font-black"
                   :title="trendsData?.exact_volume ? 'Official Pinterest Annotation Search Count (Live)' : 'Estimated Pinterest Monthly Search Volume'">
                <i data-lucide="bar-chart-2" class="w-3.5 h-3.5"></i>
                <span>Volume:</span>
                <span x-text="formatNumber(trendsData?.exact_volume || trendsData?.estimated_volume || 380878)"></span>
              </div>

              <!-- Official Pinterest Category Tree Tag -->
              <template x-if="trendsData?.category_tree && trendsData.category_tree.length > 0">
                <span class="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 truncate max-w-[240px]"
                      :title="'Taxonomy: ' + trendsData.category_tree.join(' > ')"
                      x-text="trendsData.category_tree.join(' > ')"></span>
              </template>
              <template x-if="!trendsData?.category_tree || trendsData.category_tree.length === 0">
                <span class="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                      x-text="selectedKeyword?.category || 'Organic Search'"></span>
              </template>

              <!-- Annotation ID Badge -->
              <template x-if="trendsData?.annotation_id">
                <span class="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-slate-100 dark:bg-slate-800/80 text-slate-500"
                      :title="'Official Pinterest Annotation ID: ' + trendsData.annotation_id"
                      x-text="'ID: ' + trendsData.annotation_id"></span>
              </template>

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
          <button @click="rescanActiveKeyword(true)"
                  :disabled="isDetailsLoading || syncingKeywordId === selectedKeyword?.id"
                  class="px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white transition flex items-center space-x-2 shadow-md shadow-emerald-950/20 active:scale-95 disabled:opacity-50 cursor-pointer">
            <i data-lucide="refresh-cw" class="w-3.5 h-3.5" :class="(isDetailsLoading || syncingKeywordId === selectedKeyword?.id) ? 'animate-spin' : ''"></i>
            <span>Re-Crawl 100 Pins</span>
          </button>

          <!-- Add to Folder Dropdown Button -->
          <div class="relative" x-data="{ folderDropdownOpen: false }" @click.outside="folderDropdownOpen = false">
            <button @click="folderDropdownOpen = !folderDropdownOpen; if(folderDropdownOpen && selectedKeyword) fetchCurrentKeywordFolders()"
                    class="px-3.5 py-2.5 rounded-2xl text-xs font-bold bg-pink-500/10 hover:bg-pink-500/20 dark:bg-pink-950/30 dark:hover:bg-pink-900/40 border border-pink-500/30 text-pink-600 dark:text-pink-400 transition flex items-center space-x-1.5 cursor-pointer">
              <i data-lucide="folder-plus" class="w-3.5 h-3.5 text-pink-500"></i>
              <span class="hidden sm:inline">Folder</span>
              <span class="px-1.5 py-0.2 rounded-full text-[10px] bg-pink-500/20 text-pink-500 dark:text-pink-300 font-mono" x-text="currentKeywordFolders.length"></span>
            </button>
            <div x-show="folderDropdownOpen" x-cloak
                 class="absolute right-0 mt-2 w-64 bg-white dark:bg-[#0c1322] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl z-50 p-2 space-y-1">
              <div class="p-2 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
                <span class="text-[11px] font-bold text-slate-700 dark:text-slate-300">Campaign Folders</span>
                <button @click="folderDropdownOpen = false; openCreateFolderModal()" class="text-[10px] text-pink-500 font-bold hover:underline">+ New Folder</button>
              </div>
              <div class="max-h-52 overflow-y-auto space-y-1">
                <template x-for="f in folders" :key="f.id">
                  <div @click="toggleCurrentKeywordFolder(f.id)"
                       class="px-2.5 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/80 transition flex items-center justify-between cursor-pointer text-xs">
                    <div class="flex items-center space-x-2 min-w-0">
                      <span class="w-2.5 h-2.5 rounded-full shrink-0" :style="'background-color: ' + (f.color || '#ec4899')"></span>
                      <span class="truncate font-semibold text-slate-800 dark:text-slate-200" x-text="f.name"></span>
                    </div>
                    <i :data-lucide="isKeywordInFolder(f.id) ? 'check-circle-2' : 'plus-circle'"
                       class="w-3.5 h-3.5" :class="isKeywordInFolder(f.id) ? 'text-pink-500' : 'text-slate-400'"></i>
                  </div>
                </template>
                <template x-if="folders.length === 0">
                  <div class="p-3 text-center text-xs text-slate-400">No folders yet. Click + New Folder to create one!</div>
                </template>
              </div>
            </div>
          </div>

          <button @click="triggerWorkflow()" :disabled="isWorkflowDispatching"
                  class="px-3.5 py-2.5 rounded-2xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 transition flex items-center space-x-1.5 disabled:opacity-50"
                  title="Run Autonomous 24h Crawler via GitHub Actions">
            <i data-lucide="play" class="w-3.5 h-3.5 text-emerald-500" :class="isWorkflowDispatching ? 'animate-spin' : ''"></i>
            <span class="hidden sm:inline">GitHub Actions</span>
          </button>

          <button @click="copySEOFormula()"
                  class="p-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 transition"
                  title="Copy SEO Title Formula">
            <i data-lucide="copy" class="w-4 h-4"></i>
          </button>

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

          <button @click="submitOmnibarKeyword()" :disabled="!omnibarQuery.trim()"
                  class="px-5 py-3 rounded-2xl text-xs font-bold uppercase tracking-wider bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white transition flex items-center justify-center space-x-2 shrink-0 disabled:opacity-50">
            <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i>
            <span>Load / Track</span>
          </button>
        </div>

        <!-- Dropdown Menu -->
        <div x-show="isOmnibarDropdownOpen && (omnibarTrackedMatches.length > 0 || typeaheadSuggestions.length > 0)" x-cloak
             @click.away="isOmnibarDropdownOpen = false"
             class="absolute left-0 right-0 top-full mt-2 z-50 bg-white dark:bg-[#0d1526] border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden p-3 space-y-2 max-h-96 overflow-y-auto">
          
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

      <!-- GUIDED CAPSULES RIBBON (Zone 1 - Official Pinterest Semantic Intent) -->
      <template x-if="selectedKeywordDetails?.guides && selectedKeywordDetails.guides.length > 0">
        <div class="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div class="flex items-center space-x-2 text-xs font-bold text-slate-500 dark:text-slate-400 shrink-0">
            <i data-lucide="compass" class="w-4 h-4 text-cyan-500"></i>
            <span>Guided Keywords:</span>
          </div>
          <div class="flex-1 flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
            <template x-for="(g, i) in selectedKeywordDetails.guides" :key="g.id || g.term">
              <button @click="researchKeywordTag(selectedKeyword.keyword + ' ' + (g.display_label || g.term))"
                      class="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-cyan-500/10 hover:text-cyan-500 dark:hover:text-cyan-400 border border-slate-200 dark:border-slate-700/80 transition flex items-center space-x-1.5 shrink-0 cursor-pointer group"
                      :title="'Score: ' + Number(g.score || 0).toFixed(1)">
                <span class="w-2 h-2 rounded-full shrink-0" :style="'background-color: ' + (g.dominant_color || '#06b6d4')"></span>
                <span class="capitalize" x-text="g.display_label || g.term"></span>
              </button>
            </template>
          </div>
          <button @click="copySEOFormula()"
                  class="px-3 py-1 rounded-xl text-xs font-bold bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30 transition flex items-center space-x-1.5 shrink-0 cursor-pointer">
            <i data-lucide="copy" class="w-3.5 h-3.5"></i>
            <span>Copy Complete SEO Formula</span>
          </button>
        </div>
      </template>
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
        
        <!-- Tab Buttons (5 Consolidated Workspaces) -->
        <div class="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <button @click="activeTab = 'serp'"
                  class="px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 cursor-pointer"
                  :class="activeTab === 'serp' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30' : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'">
            <i data-lucide="list-ordered" class="w-4 h-4"></i>
            <span>SERP Rankings Matrix</span>
            <span class="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                  x-text="'#' + (filteredPins.length || 0)"></span>
          </button>

          <!-- Pinterest Trends 52-Week & Popular Pins Tab -->
          <button @click="activeTab = 'trends'"
                  class="px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 cursor-pointer"
                  :class="activeTab === 'trends' ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30' : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'">
            <i data-lucide="trending-up" class="w-4 h-4 text-blue-500"></i>
            <span>Pinterest Trends (52w & Popular)</span>
            <span class="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-blue-500/20 text-blue-600"
                  x-text="trendsData?.current_index ? trendsData.current_index + '/100' : '52w'"></span>
          </button>

          <button @click="activeTab = 'intelligence'"
                  class="px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 cursor-pointer"
                  :class="activeTab === 'intelligence' ? 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30' : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'">
            <i data-lucide="sparkles" class="w-4 h-4 text-purple-500"></i>
            <span>PinClicks Intelligence</span>
          </button>

          <!-- Direct Link to Campaign Folders & Crossover Studio -->
          <a :href="currentKeywordFolders.length > 0 ? ('/folders/' + currentKeywordFolders[0].id) : '/folders'"
             class="px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 cursor-pointer text-pink-600 dark:text-pink-400 hover:bg-pink-500/10 border border-pink-500/30 shrink-0"
             title="Open Dedicated Campaign Folders & Crossover Studio (/folders/:id)">
            <i data-lucide="folder-git-2" class="w-4 h-4 text-pink-500"></i>
            <span>📁 Campaign Folder (Crossover Studio)</span>
            <template x-if="currentKeywordFolders.length > 0">
              <span class="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-pink-500/20 text-pink-500"
                    x-text="currentKeywordFolders[0].name"></span>
            </template>
          </a>
        </div>

        <!-- Filter & Sorting Controls with GROWTH PACE Ribbon and Cards vs Table Toggle (Image 1 Parity) -->
        <template x-if="activeTab === 'serp'">
          <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-3 w-full">
            
            <!-- Growth Pace Selector -->
            <div class="flex items-center space-x-2">
              <span class="text-[11px] font-bold text-slate-400 font-mono uppercase tracking-wider shrink-0">Growth Pace:</span>
              <div class="flex items-center p-1 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 gap-1">
                <button @click="growthPaceFilter = '24h'"
                        class="px-2.5 py-1 rounded-xl text-xs font-bold transition cursor-pointer"
                        :class="growthPaceFilter === '24h' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40 shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'">
                  🔥 Last 24 Hours
                </button>
                <button @click="growthPaceFilter = '3d'"
                        class="px-2.5 py-1 rounded-xl text-xs font-bold transition cursor-pointer"
                        :class="growthPaceFilter === '3d' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40 shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'">
                  ⏱ Last 3 Days
                </button>
                <button @click="growthPaceFilter = '7d'"
                        class="px-2.5 py-1 rounded-xl text-xs font-bold transition cursor-pointer"
                        :class="growthPaceFilter === '7d' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40 shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'">
                  📅 Last 7 Days
                </button>
                <button @click="growthPaceFilter = 'all'"
                        class="px-2.5 py-1 rounded-xl text-xs font-bold transition cursor-pointer"
                        :class="growthPaceFilter === 'all' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40 shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'">
                  ⭐ All-Time Total
                </button>
              </div>
            </div>

            <!-- Scope Segment Filter: All Pins vs Active SERP vs Displaced Vault vs High Velocity -->
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-[11px] font-bold text-slate-400 font-mono uppercase tracking-wider shrink-0">Filter:</span>
              <div class="flex flex-wrap items-center p-1 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 gap-1">
                <button @click="serpScope = 'all'"
                        class="px-2.5 py-1 rounded-xl text-xs font-bold transition cursor-pointer flex items-center space-x-1"
                        :class="serpScope === 'all' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40 shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'">
                  <span>🔘 All Pins</span>
                  <span class="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                        x-text="allCombinedPins.length"></span>
                </button>
                <button @click="serpScope = 'active'"
                        class="px-2.5 py-1 rounded-xl text-xs font-bold transition cursor-pointer flex items-center space-x-1"
                        :class="serpScope === 'active' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40 shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'">
                  <span>🟢 Active SERP</span>
                  <span class="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-500"
                        x-text="(selectedKeywordDetails?.current_pins || []).length"></span>
                </button>
                <button @click="serpScope = 'vault'; if(selectedKeyword) fetchDisplacedPins()"
                        class="px-2.5 py-1 rounded-xl text-xs font-bold transition cursor-pointer flex items-center space-x-1"
                        :class="serpScope === 'vault' ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/40 shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'">
                  <span>🔴 Displaced Vault</span>
                  <span class="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-rose-500/15 text-rose-500"
                        x-text="displacedVaultPins.length"></span>
                </button>
                <button @click="serpScope = 'velocity'"
                        class="px-2.5 py-1 rounded-xl text-xs font-bold transition cursor-pointer flex items-center space-x-1"
                        :class="serpScope === 'velocity' ? 'bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border border-cyan-500/40 shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'">
                  <span>⚡ High Velocity</span>
                </button>
              </div>

              <!-- Active Visual Tag Filter Badge -->
              <template x-if="activeVisualTagFilter">
                <div class="flex items-center space-x-1.5 px-3 py-1 rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30 text-xs">
                  <i data-lucide="tag" class="w-3.5 h-3.5"></i>
                  <span class="font-bold" x-text="'Tag: #' + activeVisualTagFilter"></span>
                  <button @click="activeVisualTagFilter = ''" class="hover:text-purple-800 dark:hover:text-white transition ml-1" title="Clear visual tag filter">
                    <i data-lucide="x" class="w-3 h-3"></i>
                  </button>
                </div>
              </template>
            </div>

            <!-- View Mode (Cards vs Table) & Filters -->
            <div class="flex flex-wrap items-center gap-2">
              
              <!-- Cards vs Table Toggle Button -->
              <div class="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <button @click="viewMode = 'table'"
                        class="px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center space-x-1 cursor-pointer"
                        :class="viewMode === 'table' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'">
                  <i data-lucide="table" class="w-3.5 h-3.5"></i>
                  <span>Table</span>
                </button>
                <button @click="viewMode = 'cards'"
                        class="px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center space-x-1 cursor-pointer"
                        :class="viewMode === 'cards' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'">
                  <i data-lucide="layout-grid" class="w-3.5 h-3.5"></i>
                  <span>Cards</span>
                </button>
              </div>

              <div class="relative">
                <i data-lucide="search" class="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"></i>
                <input type="text" x-model="pinSearch" placeholder="Filter title, author, domain..."
                       class="w-40 sm:w-48 pl-8 pr-3 py-1.5 text-xs rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/40">
              </div>

              <select x-model="formatFilter" class="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none">
                <option value="ALL">All Formats</option>
                <option value="ORGANIC PIN">Organic Pin</option>
                <option value="VIDEO PIN">Video Pin</option>
                <option value="IDEA PIN">Idea Pin</option>
                <option value="PRODUCT CARD">Product Card</option>
              </select>

              <select x-model="pinSort" class="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none">
                <option value="rank">Sort: SERP Rank #1-100</option>
                <option value="velocity">Sort: 24h Velocity (Highest)</option>
                <option value="saves">Sort: Saves / Likes (Highest)</option>
                <option value="age">Sort: Newest First</option>
              </select>
            </div>

          </div>
        </template>

      </div>

      <!-- TAB 1: EXECUTIVE FULL-WIDTH SERP MATRIX -->
      <div x-show="activeTab === 'serp'" class="space-y-0">
        
        <!-- VISUAL INTELLIGENCE SUB-PANEL: CO-OCCURRING POWER PAIRS -->
        <template x-if="!isDetailsLoading && filteredPins && filteredPins.length > 0">
          <div class="p-4 sm:p-5 m-4 sm:m-6 rounded-3xl bg-slate-50/70 dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800 space-y-3.5">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div class="flex items-center space-x-2.5">
                <div class="w-7 h-7 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center">
                  <i data-lucide="sparkles" class="w-3.5 h-3.5"></i>
                </div>
                <div>
                  <h4 class="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">Visual Intelligence: Co-Occurring Power Pairs</h4>
                  <p class="text-[10px] text-slate-400 font-mono">Algorithmic Lift & High-Impact Combinations (k ≤ 15 tags/pin guardrail)</p>
                </div>
              </div>
              <span class="text-[10px] font-mono text-purple-400 bg-purple-500/10 px-2.5 py-0.5 rounded-full border border-purple-500/20"
                    x-text="computeSerpPowerPairs().length + ' Power Pairs Computed'"></span>
            </div>

            <template x-if="computeSerpPowerPairs().length > 0">
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                <template x-for="(pair, idx) in computeSerpPowerPairs()" :key="idx">
                  <div class="p-3 rounded-2xl bg-white dark:bg-[#0c1322] border border-slate-200 dark:border-slate-800 flex flex-col justify-between space-y-2 hover:border-purple-500/40 transition group">
                    <div class="space-y-1.5">
                      <div class="flex items-center justify-between">
                        <span class="px-2 py-0.5 rounded-md text-[9px] font-mono font-bold bg-purple-500/15 text-purple-400 border border-purple-500/30"
                              x-text="pair.lift + 'x Lift'"></span>
                        <span class="text-[9px] font-mono text-slate-400" x-text="pair.count + ' Pins (' + pair.supportPct + '%)'"></span>
                      </div>
                      <div class="flex items-center space-x-1.5 text-xs font-bold text-slate-900 dark:text-white truncate">
                        <span class="capitalize text-emerald-500 truncate" x-text="pair.tagA"></span>
                        <span class="text-slate-400">+</span>
                        <span class="capitalize text-purple-400 truncate" x-text="pair.tagB"></span>
                      </div>
                    </div>
                    <button @click="copySerpVisualBlueprint(pair)"
                            class="w-full py-1.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 text-[10px] font-bold font-mono transition flex items-center justify-center space-x-1 cursor-pointer">
                      <i data-lucide="copy" class="w-3 h-3"></i>
                      <span>📋 Copy Visual Blueprint</span>
                    </button>
                  </div>
                </template>
              </div>
            </template>

            <template x-if="computeSerpPowerPairs().length === 0">
              <div class="py-4 text-center text-xs text-slate-400 font-mono">
                Indexing visual tags... Co-occurring power pairs require at least 2 pins with shared visual annotations.
              </div>
            </template>
          </div>
        </template>
        
        <template x-if="isDetailsLoading">
          <div class="py-20 text-center space-y-3">
            <div class="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-500 mx-auto flex items-center justify-center">
              <i data-lucide="loader-2" class="w-6 h-6 animate-spin"></i>
            </div>
            <p class="text-sm font-bold text-slate-700 dark:text-slate-300">Loading Full 100-Pin SERP Report...</p>
            <p class="text-xs text-slate-400 font-mono">Comparing rank positions & calculating 24h save velocity baselines</p>
          </div>
        </template>

        <template x-if="!isDetailsLoading && (!filteredPins || filteredPins.length === 0)">
          <div class="py-20 text-center space-y-4 max-w-md mx-auto p-4">
            <div class="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 mx-auto flex items-center justify-center">
              <i data-lucide="sparkles" class="w-6 h-6"></i>
            </div>
            <h3 class="text-base font-bold text-slate-900 dark:text-white capitalize" x-text="'No Snapshots for &quot;' + (selectedKeyword?.keyword || activeKeywordQuery) + '&quot;'"></h3>
            <p class="text-xs text-slate-500">This keyword has not been crawled yet. Trigger an on-demand crawl to index all 100 organic SERP pins directly from Pinterest.</p>
            <button @click="rescanActiveKeyword(true)"
                    class="px-5 py-2.5 rounded-2xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition shadow-md shadow-emerald-950/20 active:scale-95 flex items-center justify-center space-x-2 mx-auto cursor-pointer">
              <i data-lucide="refresh-cw" class="w-4 h-4"></i>
              <span>Crawl 100 Pins Now</span>
            </button>
          </div>
        </template>

        <!-- VIEW MODE 1: TABLE VIEW (Matching Image 1 Exact Layout) -->
        <template x-if="!isDetailsLoading && filteredPins && filteredPins.length > 0 && viewMode === 'table'">
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="table-sticky-header bg-slate-100/90 dark:bg-[#080d19]/90 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 font-mono">
                  <th class="py-3.5 px-3 w-10 text-center">
                    <input type="checkbox" @click="toggleSelectAllPins()"
                           :checked="selectedPinIds.length === filteredPins.length && filteredPins.length > 0"
                           class="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 dark:border-slate-700">
                  </th>
                  <th class="py-3.5 px-3 w-14">Preview</th>
                  <th class="py-3.5 px-4 min-w-[260px]">Pin Title & ID</th>
                  <th class="py-3.5 px-3 w-28"># Rank & Delta</th>
                  <th class="py-3.5 px-3 w-36">Board</th>
                  <th class="py-3.5 px-3 w-32">Saves & Δ</th>
                  <th class="py-3.5 px-3 w-28">Repins & Δ</th>
                  <th class="py-3.5 px-2 w-20">Comments</th>
                  <th class="py-3.5 px-2 w-20">Shares</th>
                  <th class="py-3.5 px-3 w-28">Velocity</th>
                  <th class="py-3.5 px-3 w-36">Domain Authority</th>
                  <th class="py-3.5 px-3 w-28 text-right">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
                <template x-for="(pin, idx) in filteredPins" :key="pin.pin_id">
                  <tr class="hover:bg-slate-50/80 dark:hover:bg-slate-900/40 transition group cursor-pointer"
                      @click="openPinInspector(pin)">
                    
                    <!-- Checkbox -->
                    <td class="py-3.5 px-3 text-center" @click.stop>
                      <input type="checkbox" :checked="isPinSelected(pin.pin_id)" @click="togglePinSelection(pin.pin_id)"
                             class="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 dark:border-slate-700">
                    </td>

                    <!-- Preview Thumbnail -->
                    <td class="py-3.5 px-3">
                      <a :href="'/pins/' + pin.pin_id" @click.stop class="relative group/img shrink-0 block" title="Open Dedicated Pin Intelligence (/pins/:pin_id)">
                        <template x-if="pin.image_url">
                          <img :src="pin.image_url" class="w-10 h-14 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shadow-xs group-hover/img:scale-105 transition">
                        </template>
                        <template x-if="!pin.image_url">
                          <div class="w-10 h-14 rounded-lg bg-slate-200 dark:bg-slate-800 flex items-center justify-center">
                            <i data-lucide="image" class="w-3.5 h-3.5 text-slate-400"></i>
                          </div>
                        </template>
                      </a>
                    </td>

                    <!-- Pin Title, ID & Creator -->
                    <td class="py-3.5 px-4 min-w-[260px]">
                      <div class="space-y-1">
                        <a :href="'/pins/' + pin.pin_id" @click.stop
                           class="font-bold text-slate-900 dark:text-white hover:text-emerald-500 line-clamp-2 block transition"
                           title="Open Dedicated Pin Intelligence (/pins/:pin_id)"
                           x-text="pin.title || 'Untitled Pin'"></a>
                        <div class="flex items-center space-x-2 text-[10px] text-slate-400 font-mono">
                          <a :href="'/pins/' + pin.pin_id" @click.stop
                             class="text-slate-500 dark:text-slate-400 hover:text-emerald-500 truncate font-mono"
                             title="Open Dedicated Pin Intelligence"
                             x-text="'ID: ' + pin.pin_id"></a>
                          <template x-if="pin.metadata?.pinner">
                            <span class="flex items-center space-x-1 truncate max-w-[130px]">
                              <template x-if="pin.metadata.pinner.image_small_url">
                                <img :src="pin.metadata.pinner.image_small_url" class="w-3 h-3 rounded-full object-cover shrink-0">
                              </template>
                              <span class="truncate" x-text="pin.metadata.pinner.full_name || ('@' + pin.metadata.pinner.username)"></span>
                            </span>
                          </template>
                        </div>
                        <!-- Visual Annotations Tag Pills -->
                        <template x-if="getPinVisualTags(pin).length > 0">
                          <div class="flex flex-wrap items-center gap-1 mt-1">
                            <template x-for="vtag in getPinVisualTags(pin).slice(0, 4)" :key="vtag">
                              <button @click.stop="filterByVisualTag(vtag)"
                                      class="px-1.5 py-0.2 rounded-md text-[9px] font-mono transition cursor-pointer"
                                      :class="activeVisualTagFilter === vtag.toLowerCase() ? 'bg-purple-600 text-white font-bold' : 'bg-purple-500/10 text-purple-600 dark:text-purple-400 hover:bg-purple-500/20 border border-purple-500/20'"
                                      :title="'Filter by visual tag: #' + vtag">
                                <span x-text="'#' + vtag"></span>
                              </button>
                            </template>
                            <template x-if="getPinVisualTags(pin).length > 4">
                              <span class="text-[9px] text-slate-400 font-mono" x-text="'+' + (getPinVisualTags(pin).length - 4) + ' tags'"></span>
                            </template>
                          </div>
                        </template>
                      </div>
                    </td>

                    <!-- # Rank & Delta Movement -->
                    <td class="py-3.5 px-3 font-mono font-bold">
                      <template x-if="!pin.is_displaced">
                        <div class="flex items-center space-x-1.5">
                          <span class="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                                :class="Number(pin.rank_position) <= 10 ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30' : ''"
                                x-text="'#' + pin.rank_position"></span>
                          
                          <template x-if="pin.metadata?.is_new">
                            <span class="px-1.5 py-0.2 rounded text-[9px] bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">★ NEW</span>
                          </template>
                          <template x-if="!pin.metadata?.is_new && Number(pin.metadata?.rank_delta || 0) > 0">
                            <span class="text-[10px] text-emerald-500 font-bold" x-text="'▲ +' + pin.metadata.rank_delta"></span>
                          </template>
                          <template x-if="!pin.metadata?.is_new && Number(pin.metadata?.rank_delta || 0) < 0">
                            <span class="text-[10px] text-rose-500 font-bold" x-text="'▼ ' + pin.metadata.rank_delta"></span>
                          </template>
                        </div>
                      </template>
                      <template x-if="pin.is_displaced">
                        <div class="flex flex-col space-y-0.5">
                          <span class="px-2 py-0.5 rounded-lg bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 text-[10px] font-black uppercase tracking-wider w-fit">
                            Was #<span x-text="pin.last_known_rank || pin.rank_position || '?'"></span> | Displaced
                          </span>
                          <span class="text-[9px] text-slate-400 font-mono" x-text="'Vault • ' + (pin.status || 'Dropped')"></span>
                        </div>
                      </template>
                    </td>

                    <!-- Board Name -->
                    <td class="py-3.5 px-3">
                      <span class="text-xs text-slate-600 dark:text-slate-300 font-medium truncate max-w-[130px] block"
                            :title="pin.metadata?.board_name || 'General Board'"
                            x-text="pin.metadata?.board_name || 'General Board'"></span>
                    </td>

                    <!-- Saves & Growth Pace Delta (Image 1 Parity) -->
                    <td class="py-3.5 px-3 space-y-0.5 font-mono">
                      <div class="font-bold text-slate-900 dark:text-white"
                           x-text="formatNumber(pin.save_count || pin.metadata?.raw_saves || 0)"></div>
                      <template x-if="getPaceDelta(pin, 'saves') && getPaceDelta(pin, 'saves') !== '0'">
                        <span class="text-[10px] font-bold text-emerald-500 block"
                              x-text="getPaceDelta(pin, 'saves')"></span>
                      </template>
                    </td>

                    <!-- Repins & Growth Pace Delta -->
                    <td class="py-3.5 px-3 space-y-0.5 font-mono">
                      <div class="font-bold text-slate-700 dark:text-slate-300"
                           x-text="formatNumber(pin.repin_count || pin.metadata?.repin_count || 0)"></div>
                      <template x-if="getPaceDelta(pin, 'repins') && getPaceDelta(pin, 'repins') !== '0'">
                        <span class="text-[10px] font-bold text-emerald-500 block"
                              x-text="getPaceDelta(pin, 'repins')"></span>
                      </template>
                    </td>

                    <!-- Comments -->
                    <td class="py-3.5 px-2 font-mono text-slate-600 dark:text-slate-400"
                        x-text="pin.comment_count || 0"></td>

                    <!-- Shares -->
                    <td class="py-3.5 px-2 font-mono text-slate-600 dark:text-slate-400"
                        x-text="pin.share_count || 0"></td>

                    <!-- 24h Velocity -->
                    <td class="py-3.5 px-3 font-mono">
                      <span class="px-2 py-0.5 rounded-lg text-xs font-black block w-fit"
                            :class="Number(pin.daily_save_velocity || 0) >= 10 ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : (Number(pin.daily_save_velocity || 0) > 0 ? 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500')"
                            x-text="(Number(pin.daily_save_velocity || 0) > 0 ? '+' : '') + Number(pin.daily_save_velocity || 0) + ' /d'"></span>
                    </td>

                    <!-- Domain Authority -->
                    <td class="py-3.5 px-3">
                      <span class="text-xs font-mono text-slate-600 dark:text-slate-400 truncate max-w-[130px] block"
                            x-text="pin.domain || 'Pinterest Direct'"></span>
                    </td>

                    <!-- Actions -->
                    <td class="py-3.5 px-3 text-right">
                      <div class="flex items-center justify-end space-x-1" @click.stop>
                        <a :href="'/pins/' + pin.pin_id"
                           class="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 transition cursor-pointer"
                           title="Open Dedicated Pin Intelligence (/pins/:pin_id)">
                          <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                        </a>
                        <button @click="openPinInspector(pin)"
                                class="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition cursor-pointer"
                                title="Open Pin Deep Dossier">
                          <i data-lucide="eye" class="w-3.5 h-3.5"></i>
                        </button>
                        <button @click="openVisualLens(pin)"
                                class="p-1.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 transition cursor-pointer"
                                title="Visual Lens Similarity Search">
                          <i data-lucide="camera" class="w-3.5 h-3.5"></i>
                        </button>
                        <a :href="'https://www.pinterest.com/pin/' + pin.pin_id + '/'" target="_blank"
                           class="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-white transition"
                           title="Open Pin on Pinterest">
                          <i data-lucide="arrow-up-right" class="w-3.5 h-3.5"></i>
                        </a>
                      </div>
                    </td>

                  </tr>
                </template>
              </tbody>
            </table>
          </div>
        </template>

        <!-- VIEW MODE 2: CARDS VIEW (Matching Image 1 Grid Cards) -->
        <template x-if="!isDetailsLoading && filteredPins && filteredPins.length > 0 && viewMode === 'cards'">
          <div class="p-5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            <template x-for="pin in filteredPins" :key="pin.pin_id">
              <div @click="openPinInspector(pin)"
                   class="p-4 rounded-3xl bg-slate-50/70 dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800 hover:border-emerald-500/40 transition group cursor-pointer flex flex-col justify-between space-y-3.5">
                
                <div class="space-y-3">
                  <!-- Thumbnail with Rank & Format overlays -->
                  <a :href="'/pins/' + pin.pin_id" @click.stop class="block relative rounded-2xl overflow-hidden aspect-[2/3] max-h-56 bg-slate-200 dark:bg-slate-800" title="Open Dedicated Pin Intelligence (/pins/:pin_id)">
                    <template x-if="pin.image_url">
                      <img :src="pin.image_url" class="w-full h-full object-cover group-hover:scale-105 transition duration-300">
                    </template>
                    <template x-if="!pin.is_displaced">
                      <div class="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-lg bg-slate-950/80 text-white font-mono font-black text-xs backdrop-blur-xs"
                           x-text="'#' + pin.rank_position"></div>
                    </template>
                    <template x-if="pin.is_displaced">
                      <div class="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-lg bg-rose-950/90 text-rose-300 font-mono font-black text-[10px] backdrop-blur-xs border border-rose-500/40"
                           x-text="'Was #' + (pin.last_known_rank || pin.rank_position || '?') + ' Displaced'"></div>
                    </template>
                    <div class="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md bg-slate-950/70 text-[10px] font-mono text-slate-200 backdrop-blur-xs uppercase"
                         x-text="pin.metadata?.format || pin.format || 'ORGANIC'"></div>
                  </a>

                  <!-- Title & ID -->
                  <div class="space-y-1">
                    <a :href="'/pins/' + pin.pin_id" @click.stop
                       class="text-xs font-bold text-slate-900 dark:text-white hover:text-emerald-500 line-clamp-2 leading-snug transition block"
                       title="Open Dedicated Pin Intelligence (/pins/:pin_id)"
                       x-text="pin.title || 'Untitled Pin'"></a>
                    <a :href="'/pins/' + pin.pin_id" @click.stop
                       class="text-[10px] font-mono text-slate-400 hover:text-emerald-500 truncate block"
                       x-text="pin.metadata?.board_name || ('ID: ' + pin.pin_id)"></a>
                    <!-- Visual Annotations Tag Pills -->
                    <template x-if="getPinVisualTags(pin).length > 0">
                      <div class="flex flex-wrap items-center gap-1 mt-1">
                        <template x-for="vtag in getPinVisualTags(pin).slice(0, 3)" :key="vtag">
                          <button @click.stop="filterByVisualTag(vtag)"
                                  class="px-1.5 py-0.2 rounded-md text-[9px] font-mono transition cursor-pointer"
                                  :class="activeVisualTagFilter === vtag.toLowerCase() ? 'bg-purple-600 text-white font-bold' : 'bg-purple-500/10 text-purple-600 dark:text-purple-400 hover:bg-purple-500/20 border border-purple-500/20'"
                                  :title="'Filter by visual tag: #' + vtag">
                            <span x-text="'#' + vtag"></span>
                          </button>
                        </template>
                      </div>
                    </template>
                  </div>
                </div>

                <!-- Engagement Bar & Actions -->
                <div class="pt-2.5 border-t border-slate-200/60 dark:border-slate-800/60 space-y-2">
                  <div class="flex items-center justify-between text-xs font-mono">
                    <div>
                      <span class="text-slate-400 text-[10px]">Saves:</span>
                      <strong class="text-slate-900 dark:text-white" x-text="formatNumber(pin.save_count || pin.metadata?.raw_saves || 0)"></strong>
                      <template x-if="getPaceDelta(pin, 'saves') && getPaceDelta(pin, 'saves') !== '0'">
                        <span class="text-emerald-500 text-[10px] font-bold" x-text="getPaceDelta(pin, 'saves')"></span>
                      </template>
                    </div>
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold font-mono"
                          :class="Number(pin.daily_save_velocity || 0) > 0 ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'"
                          x-text="(Number(pin.daily_save_velocity || 0) > 0 ? '+' : '') + (pin.daily_save_velocity || 0) + ' v/d'"></span>
                  </div>

                  <div class="flex items-center justify-between text-[11px] text-slate-400 pt-1" @click.stop>
                    <span class="truncate max-w-[120px] font-mono text-[10px]" x-text="pin.domain || 'Pinterest'"></span>
                    <div class="flex items-center space-x-1">
                      <a :href="'/pins/' + pin.pin_id" class="p-1 rounded bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20" title="Open Dossier (/pins/:pin_id)">
                        <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                      </a>
                      <button @click="openPinInspector(pin)" class="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-200" title="Dossier">
                        <i data-lucide="eye" class="w-3.5 h-3.5"></i>
                      </button>
                      <button @click="openVisualLens(pin)" class="p-1 rounded hover:bg-purple-500/20 text-slate-400 hover:text-purple-400" title="Visual Lens">
                        <i data-lucide="camera" class="w-3.5 h-3.5"></i>
                      </button>
                      <a :href="'https://www.pinterest.com/pin/' + pin.pin_id + '/'" target="_blank" class="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-white" title="Pinterest">
                        <i data-lucide="arrow-up-right" class="w-3.5 h-3.5"></i>
                      </a>
                    </div>
                  </div>
                </div>

              </div>
            </template>
          </div>
        </template>

      </div>

      <!-- TAB 2: PINTEREST TRENDS (52-WEEK SEASONALITY & DEMOGRAPHICS) -->
      <div x-show="activeTab === 'trends'" class="p-6 space-y-6">
        
        <div class="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800/80 gap-3">
          <div>
            <div class="flex items-center space-x-2">
              <h3 class="text-base font-black text-slate-900 dark:text-white">Interest Over Time (52-Week Official Curve)</h3>
              <span class="px-2 py-0.5 text-[10px] font-bold uppercase rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30 font-mono">trends.pinterest.com</span>
            </div>
            <p class="text-xs text-slate-500">Weekly relative search popularity indexed from 0 to 100 over the past 12 months</p>
          </div>

          <div class="flex items-center space-x-3 text-xs font-mono">
            <div class="px-3 py-1 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
              Peak: <strong x-text="trendsData?.peak_value || 100"></strong>/100
            </div>
            <div class="px-3 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
              Latest: <strong x-text="trendsData?.current_index || 56"></strong>/100
            </div>
          </div>
        </div>

        <!-- 52-Week Interactive SVG Chart (Exact Pinterest Trends Parity) -->
        <div class="p-6 rounded-3xl bg-slate-900/80 border border-slate-800 space-y-3 relative overflow-hidden">
          <div class="flex items-center justify-between text-xs text-slate-400 font-mono px-2">
            <span>52 Weeks Ago</span>
            <span>26 Weeks Ago (Mid-Year)</span>
            <span class="text-blue-400 font-bold">Current Week</span>
          </div>

          <svg class="w-full h-48 overflow-visible" viewBox="0 0 800 180" preserveAspectRatio="none">
            <defs>
              <linearGradient id="trendsBlueGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.45"/>
                <stop offset="100%" stop-color="#3b82f6" stop-opacity="0.0"/>
              </linearGradient>
            </defs>
            <!-- Horizontal Gridlines (20, 40, 60, 80, 100) -->
            <line x1="0" y1="36" x2="800" y2="36" stroke="#334155" stroke-dasharray="4" stroke-width="1"/>
            <line x1="0" y1="72" x2="800" y2="72" stroke="#334155" stroke-dasharray="4" stroke-width="1"/>
            <line x1="0" y1="108" x2="800" y2="108" stroke="#334155" stroke-dasharray="4" stroke-width="1"/>
            <line x1="0" y1="144" x2="800" y2="144" stroke="#334155" stroke-dasharray="4" stroke-width="1"/>

            <!-- Area & Line -->
            <path :d="getTrendsAreaPath(trendsData?.counts_52_weeks || []).area" fill="url(#trendsBlueGrad)"/>
            <path :d="getTrendsAreaPath(trendsData?.counts_52_weeks || []).line" fill="none" stroke="#3b82f6" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>

        <!-- Related Trends Chips with Sparklines (Image 2 Parity) -->
        <div class="space-y-3">
          <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">Related Trends & Comparison</h4>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <template x-for="r in (trendsData?.related_trends || [])" :key="r.term">
              <div @click="loadKeywordBySlugOrText(r.term, true)"
                   class="p-3.5 rounded-2xl bg-slate-50/80 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 hover:border-blue-500/50 transition cursor-pointer flex items-center justify-between">
                <div class="min-w-0 pr-2">
                  <p class="text-xs font-bold text-slate-900 dark:text-white capitalize truncate" x-text="r.term"></p>
                  <span class="text-[10px] text-blue-500 font-mono">+ Track Query</span>
                </div>
                <svg class="w-20 h-5 overflow-visible shrink-0" viewBox="0 0 80 20">
                  <path :d="generateSparklinePath(r.counts, 80, 20)" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round"/>
                </svg>
              </div>
            </template>
          </div>
        </div>

        <!-- Demographics: Age & Gender Distribution (Image 2 Parity) -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
          <!-- Age Distribution -->
          <div class="p-5 rounded-3xl bg-slate-50/70 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800 space-y-3">
            <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">Audience Age Distribution</h4>
            <div class="space-y-2">
              <template x-for="a in (trendsData?.demographics?.age || [])" :key="a.group">
                <div class="space-y-1">
                  <div class="flex items-center justify-between text-xs font-mono">
                    <span class="text-slate-500" x-text="a.group"></span>
                    <span class="font-bold text-slate-900 dark:text-white" x-text="a.display_pct || (a.pct + '%')"></span>
                  </div>
                  <div class="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <div class="h-full bg-blue-500 rounded-full" :style="'width: ' + (a.pct > 0 ? Math.max(a.pct, 3) : 0) + '%'"></div>
                  </div>
                </div>
              </template>
            </div>
          </div>

          <!-- Gender Distribution -->
          <div class="p-5 rounded-3xl bg-slate-50/70 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800 space-y-3">
            <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">Audience Gender Distribution</h4>
            <div class="space-y-4 pt-2">
              <div class="space-y-1">
                <div class="flex items-center justify-between text-xs font-mono">
                  <span class="text-slate-500">Female</span>
                  <span class="font-bold text-rose-500" x-text="trendsData?.demographics?.gender?.female_display || ((trendsData?.demographics?.gender?.female_pct || 86) + '%')"></span>
                </div>
                <div class="w-full h-3 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                  <div class="h-full bg-rose-500 rounded-full" :style="'width: ' + (trendsData?.demographics?.gender?.female_pct || 86) + '%'"></div>
                </div>
              </div>

              <div class="space-y-1">
                <div class="flex items-center justify-between text-xs font-mono">
                  <span class="text-slate-500">Male</span>
                  <span class="font-bold text-cyan-500" x-text="trendsData?.demographics?.gender?.male_display || ((trendsData?.demographics?.gender?.male_pct || 4) + '%')"></span>
                </div>
                <div class="w-full h-3 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                  <div class="h-full bg-cyan-500 rounded-full" :style="'width: ' + Math.max(trendsData?.demographics?.gender?.male_pct || 4, 3) + '%'"></div>
                </div>
              </div>

              <div class="space-y-1">
                <div class="flex items-center justify-between text-xs font-mono">
                  <span class="text-slate-500">Unspecified / Custom</span>
                  <span class="font-bold text-slate-400" x-text="trendsData?.demographics?.gender?.unspecified_display || ((trendsData?.demographics?.gender?.unspecified_pct || 10) + '%')"></span>
                </div>
                <div class="w-full h-3 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                  <div class="h-full bg-slate-500 rounded-full" :style="'width: ' + (trendsData?.demographics?.gender?.unspecified_pct || 10) + '%'"></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Pinterest Official Guided Search Pivots (Image 2 Parity) -->
        <template x-if="trendsData?.ideas_pivots && trendsData.ideas_pivots.length > 0">
          <div class="space-y-3 pt-2">
            <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">Pinterest Guided Search Capsules (Pivots)</h4>
            <div class="flex flex-wrap gap-2">
              <template x-for="p in trendsData.ideas_pivots" :key="p.label">
                <button @click="loadKeywordBySlugOrText(p.full_name, true)"
                        class="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:text-emerald-500 dark:hover:text-emerald-400 transition cursor-pointer flex items-center space-x-1">
                  <span>+</span>
                  <span x-text="p.label"></span>
                </button>
              </template>
            </div>
          </div>
        </template>

        <!-- Pinterest Official Related Interests Taxonomy (Image 3 Parity) -->
        <template x-if="trendsData?.related_interests && trendsData.related_interests.length > 0">
          <div class="space-y-3 pt-2">
            <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">Pinterest Taxonomy Related Interests</h4>
            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
              <template x-for="ri in trendsData.related_interests" :key="ri">
                <div @click="loadKeywordBySlugOrText(ri, true)"
                     class="p-3 rounded-2xl bg-slate-50/70 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800 hover:border-emerald-500/40 transition cursor-pointer group">
                  <p class="text-xs font-bold text-slate-900 dark:text-white capitalize group-hover:text-emerald-500 transition line-clamp-1" x-text="ri"></p>
                  <span class="text-[10px] text-emerald-500 font-mono mt-1 block">+ Track Interest</span>
                </div>
              </template>
            </div>
          </div>
        </template>

        <!-- Pinterest Official Popular Pins (Image 2 Parity) -->
        <div class="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800/80">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div class="space-y-0.5">
              <div class="flex items-center space-x-2">
                <h4 class="text-sm font-bold text-slate-900 dark:text-white font-sans tracking-tight">Popular Pins</h4>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30">736x HD</span>
              </div>
              <p class="text-xs text-slate-500">Browse official popular Pins based on your keywords in high definition</p>
            </div>
            
            <div class="flex items-center space-x-2">
              <!-- View Switcher: Full Pins (736x) vs Official Collage vs Interactive Cards -->
              <div class="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800/90 p-1 border border-slate-200/80 dark:border-slate-700/60 text-xs">
                <button @click="popularPinsView = 'full'; $nextTick(() => lucide.createIcons())"
                        :class="popularPinsView === 'full' ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm font-bold' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-medium'"
                        class="px-2.5 py-1 rounded-lg transition flex items-center space-x-1 cursor-pointer"
                        title="عرض كافة الدبابيس كاملة بدقة 736x">
                  <i data-lucide="layout-grid" class="w-3.5 h-3.5"></i>
                  <span>Full Pins (الصور كاملة)</span>
                </button>
                <button @click="popularPinsView = 'collage'; $nextTick(() => lucide.createIcons())"
                        :class="popularPinsView === 'collage' ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm font-bold' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-medium'"
                        class="px-2.5 py-1 rounded-lg transition flex items-center space-x-1 cursor-pointer"
                        title="بانر الكولاج الرسمي">
                  <i data-lucide="columns-3" class="w-3.5 h-3.5"></i>
                  <span>Official Collage</span>
                </button>
                <button @click="popularPinsView = 'grid'; $nextTick(() => lucide.createIcons())"
                        :class="popularPinsView === 'grid' ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm font-bold' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-medium'"
                        class="px-2.5 py-1 rounded-lg transition flex items-center space-x-1 cursor-pointer"
                        title="بطاقات التحليل والتتبع">
                  <i data-lucide="bar-chart-2" class="w-3.5 h-3.5"></i>
                  <span>Interactive Cards</span>
                </button>
              </div>

              <button @click="fetchTrends(selectedKeyword?.keyword || activeKeywordQuery, true)"
                      class="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition flex items-center space-x-1.5 cursor-pointer">
                <i data-lucide="refresh-cw" class="w-3 h-3" :class="isTrendsLoading ? 'animate-spin' : ''"></i>
                <span>Refresh Trends</span>
              </button>
            </div>
          </div>

          <!-- VIEW 1: FULL 9 PINS GALLERY (COMPLETE UNROPPED IMAGES AT 736x RESOLUTION) -->
          <div x-show="popularPinsView === 'full'" class="space-y-4">
            <template x-if="trendsData?.collage_images && trendsData.collage_images.length > 0">
              <div class="space-y-3">
                <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-3 gap-4">
                  <template x-for="(imgUrl, idx) in (trendsData?.collage_images || []).filter(Boolean)" :key="idx">
                    <div class="group relative rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 hover:border-blue-500/50 shadow-xs hover:shadow-md transition duration-300 overflow-hidden flex flex-col justify-between cursor-pointer"
                         @click="window.open((imgUrl || '').replace('/236x/', '/736x/').replace('/474x/', '/736x/'), '_blank')">
                      
                      <!-- Full Pin Image Container with fixed 2:3 aspect ratio -->
                      <div class="relative w-full aspect-[2/3] bg-slate-100 dark:bg-slate-950/80 flex items-center justify-center overflow-hidden p-2">
                        <img :src="(imgUrl || '').replace('/236x/', '/736x/').replace('/474x/', '/736x/')"
                             :alt="'Pin #' + (idx + 1)"
                             class="w-full h-full object-contain rounded-xl group-hover:scale-[1.02] transition duration-300"
                             loading="lazy"
                             referrerpolicy="no-referrer"
                             @error="if ($el.src.includes('/736x/')) { $el.src = $el.src.replace('/736x/', '/474x/'); } else if ($el.src.includes('/474x/')) { $el.src = $el.src.replace('/474x/', '/236x/'); }">
                        
                        <!-- Rank Badge -->
                        <div class="absolute top-4 left-4 px-2.5 py-1 rounded-lg bg-slate-950/80 text-white font-mono font-black text-xs backdrop-blur-xs shadow-md">
                          <span x-text="'#' + (idx + 1)"></span>
                        </div>

                        <!-- 736x HD Badge -->
                        <div class="absolute top-4 right-4 px-2 py-0.5 rounded-md bg-blue-600 text-white font-mono font-bold text-[10px] backdrop-blur-xs shadow-md uppercase tracking-wider">
                          736x HD
                        </div>

                        <!-- Hover Overlay -->
                        <div class="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition duration-200 flex items-center justify-center gap-2 backdrop-blur-[2px]">
                          <span class="px-3.5 py-2 rounded-xl bg-white text-slate-900 text-xs font-bold hover:bg-slate-100 shadow-md flex items-center space-x-1.5 transition">
                            <i data-lucide="maximize-2" class="w-3.5 h-3.5 text-blue-600"></i>
                            <span>Open 736x Full Image</span>
                          </span>
                        </div>
                      </div>

                      <!-- Card Details Bottom Strip -->
                      <div class="p-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs" @click.stop>
                        <div class="flex items-center space-x-2 min-w-0 pr-2">
                          <span class="w-2 h-2 rounded-full bg-blue-500 shrink-0"></span>
                          <span class="font-bold text-slate-800 dark:text-slate-200 truncate capitalize"
                                x-text="(trendsData?.term || selectedKeyword?.keyword || activeKeywordQuery || 'Popular') + ' Pin ' + (idx + 1)"></span>
                        </div>
                        <a :href="'https://www.pinterest.com/search/pins/?q=' + encodeURIComponent(trendsData?.term || selectedKeyword?.keyword || activeKeywordQuery || '')" target="_blank"
                           class="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-medium text-[11px] transition flex items-center space-x-1 shrink-0">
                          <i data-lucide="external-link" class="w-3 h-3 text-red-500"></i>
                          <span>Pinterest</span>
                        </a>
                      </div>

                    </div>
                  </template>
                </div>

                <!-- Footer Pill -->
                <div class="flex items-center space-x-2 pt-2 px-1">
                  <span class="w-2.5 h-2.5 rounded-full bg-blue-600 dark:bg-blue-500 inline-block"></span>
                  <span class="text-xs font-bold text-slate-900 dark:text-slate-100 font-sans"
                        x-text="(trendsData?.term || selectedKeyword?.keyword || activeKeywordQuery || 'Popular') + ' — All 9 Official Viral Pins in Full HD (736x)'"></span>
                </div>
              </div>
            </template>

            <!-- Loading or Empty state -->
            <template x-if="!trendsData?.collage_images || trendsData.collage_images.length === 0">
              <div class="py-12 text-center text-xs text-slate-400 italic rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30">
                <i data-lucide="image" class="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2"></i>
                <p>Loading full 736x popular pins...</p>
              </div>
            </template>
          </div>

          <!-- VIEW 2: OFFICIAL PINTEREST TRENDS COLLAGE BANNER (736x RESOLUTION) -->
          <div x-show="popularPinsView === 'collage'" class="space-y-3">
            <template x-if="trendsData?.collage_images && trendsData.collage_images.length >= 5">
              <div class="space-y-2">
                <!-- The 5-Column Collage Card -->
                <div @click="window.open('https://www.pinterest.com/search/pins/?q=' + encodeURIComponent(trendsData?.term || selectedKeyword?.keyword || activeKeywordQuery || ''), '_blank')"
                     class="group relative h-[440px] sm:h-[480px] md:h-[520px] w-full rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/60 cursor-pointer shadow-sm hover:shadow-md transition">
                  
                  <div class="grid grid-cols-5 h-full w-full gap-[3px] bg-slate-200 dark:bg-slate-800">
                    <!-- Column 1: Full Height Image A[0] -->
                    <div class="relative h-full w-full overflow-hidden bg-slate-300 dark:bg-slate-700">
                      <img :src="(trendsData.collage_images[0] || '').replace('/236x/', '/736x/').replace('/474x/', '/736x/')"
                           class="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.02] transition duration-300"
                           loading="lazy"
                           referrerpolicy="no-referrer"
                           @error="if ($el.src.includes('/736x/')) { $el.src = $el.src.replace('/736x/', '/474x/'); } else if ($el.src.includes('/474x/')) { $el.src = $el.src.replace('/474x/', '/236x/'); }">
                    </div>

                    <!-- Column 2: Stacked A[7] (Top 40%) & A[8] (Bottom 60%) -->
                    <div class="h-full w-full flex flex-col gap-[3px]">
                      <div class="relative min-h-0 w-full overflow-hidden bg-slate-300 dark:bg-slate-700" style="flex: 4 1 0%;">
                        <img :src="(trendsData.collage_images[7] || trendsData.collage_images[1] || '').replace('/236x/', '/736x/').replace('/474x/', '/736x/')"
                             class="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.02] transition duration-300"
                             loading="lazy"
                             referrerpolicy="no-referrer"
                             @error="if ($el.src.includes('/736x/')) { $el.src = $el.src.replace('/736x/', '/474x/'); } else if ($el.src.includes('/474x/')) { $el.src = $el.src.replace('/474x/', '/236x/'); }">
                      </div>
                      <div class="relative min-h-0 w-full overflow-hidden bg-slate-300 dark:bg-slate-700" style="flex: 6 1 0%;">
                        <img :src="(trendsData.collage_images[8] || trendsData.collage_images[2] || '').replace('/236x/', '/736x/').replace('/474x/', '/736x/')"
                             class="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.02] transition duration-300"
                             loading="lazy"
                             referrerpolicy="no-referrer"
                             @error="if ($el.src.includes('/736x/')) { $el.src = $el.src.replace('/736x/', '/474x/'); } else if ($el.src.includes('/474x/')) { $el.src = $el.src.replace('/474x/', '/236x/'); }">
                      </div>
                    </div>

                    <!-- Column 3: Stacked A[5] (Top 40%) & A[6] (Bottom 60%) -->
                    <div class="h-full w-full flex flex-col gap-[3px]">
                      <div class="relative min-h-0 w-full overflow-hidden bg-slate-300 dark:bg-slate-700" style="flex: 4 1 0%;">
                        <img :src="(trendsData.collage_images[5] || trendsData.collage_images[3] || '').replace('/236x/', '/736x/').replace('/474x/', '/736x/')"
                             class="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.02] transition duration-300"
                             loading="lazy"
                             referrerpolicy="no-referrer"
                             @error="if ($el.src.includes('/736x/')) { $el.src = $el.src.replace('/736x/', '/474x/'); } else if ($el.src.includes('/474x/')) { $el.src = $el.src.replace('/474x/', '/236x/'); }">
                      </div>
                      <div class="relative min-h-0 w-full overflow-hidden bg-slate-300 dark:bg-slate-700" style="flex: 6 1 0%;">
                        <img :src="(trendsData.collage_images[6] || trendsData.collage_images[4] || '').replace('/236x/', '/736x/').replace('/474x/', '/736x/')"
                             class="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.02] transition duration-300"
                             loading="lazy"
                             referrerpolicy="no-referrer"
                             @error="if ($el.src.includes('/736x/')) { $el.src = $el.src.replace('/736x/', '/474x/'); } else if ($el.src.includes('/474x/')) { $el.src = $el.src.replace('/474x/', '/236x/'); }">
                      </div>
                    </div>

                    <!-- Column 4: Stacked A[3] (Top 60%) & A[4] (Bottom 40%) -->
                    <div class="h-full w-full flex flex-col gap-[3px]">
                      <div class="relative min-h-0 w-full overflow-hidden bg-slate-300 dark:bg-slate-700" style="flex: 6 1 0%;">
                        <img :src="(trendsData.collage_images[3] || trendsData.collage_images[1] || '').replace('/236x/', '/736x/').replace('/474x/', '/736x/')"
                             class="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.02] transition duration-300"
                             loading="lazy"
                             referrerpolicy="no-referrer"
                             @error="if ($el.src.includes('/736x/')) { $el.src = $el.src.replace('/736x/', '/474x/'); } else if ($el.src.includes('/474x/')) { $el.src = $el.src.replace('/474x/', '/236x/'); }">
                      </div>
                      <div class="relative min-h-0 w-full overflow-hidden bg-slate-300 dark:bg-slate-700" style="flex: 4 1 0%;">
                        <img :src="(trendsData.collage_images[4] || trendsData.collage_images[2] || '').replace('/236x/', '/736x/').replace('/474x/', '/736x/')"
                             class="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.02] transition duration-300"
                             loading="lazy"
                             referrerpolicy="no-referrer"
                             @error="if ($el.src.includes('/736x/')) { $el.src = $el.src.replace('/736x/', '/474x/'); } else if ($el.src.includes('/474x/')) { $el.src = $el.src.replace('/474x/', '/236x/'); }">
                      </div>
                    </div>

                    <!-- Column 5: Stacked A[1] (Top 40%) & A[2] (Bottom 60%) -->
                    <div class="h-full w-full flex flex-col gap-[3px]">
                      <div class="relative min-h-0 w-full overflow-hidden bg-slate-300 dark:bg-slate-700" style="flex: 4 1 0%;">
                        <img :src="(trendsData.collage_images[1] || trendsData.collage_images[0] || '').replace('/236x/', '/736x/').replace('/474x/', '/736x/')"
                             class="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.02] transition duration-300"
                             loading="lazy"
                             referrerpolicy="no-referrer"
                             @error="if ($el.src.includes('/736x/')) { $el.src = $el.src.replace('/736x/', '/474x/'); } else if ($el.src.includes('/474x/')) { $el.src = $el.src.replace('/474x/', '/236x/'); }">
                      </div>
                      <div class="relative min-h-0 w-full overflow-hidden bg-slate-300 dark:bg-slate-700" style="flex: 6 1 0%;">
                        <img :src="(trendsData.collage_images[2] || trendsData.collage_images[0] || '').replace('/236x/', '/736x/').replace('/474x/', '/736x/')"
                             class="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.02] transition duration-300"
                             loading="lazy"
                             referrerpolicy="no-referrer"
                             @error="if ($el.src.includes('/736x/')) { $el.src = $el.src.replace('/736x/', '/474x/'); } else if ($el.src.includes('/474x/')) { $el.src = $el.src.replace('/474x/', '/236x/'); }">
                      </div>
                    </div>
                  </div>

                  <!-- Hover Overlay -->
                  <div class="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition flex items-center justify-center pointer-events-none">
                    <span class="px-4 py-2 rounded-full bg-white/90 dark:bg-slate-900/90 text-xs font-bold text-slate-900 dark:text-white shadow-lg flex items-center space-x-1.5 backdrop-blur-sm">
                      <i data-lucide="external-link" class="w-3.5 h-3.5 text-blue-500"></i>
                      <span>Browse Related Pins on Pinterest</span>
                    </span>
                  </div>
                </div>

                <!-- Bottom Indicator Dot Pill -->
                <div class="flex items-center space-x-2 pt-1 px-1">
                  <span class="w-2.5 h-2.5 rounded-full bg-blue-600 dark:bg-blue-500 inline-block"></span>
                  <span class="text-xs font-bold text-slate-900 dark:text-slate-100 font-sans"
                        x-text="trendsData?.term || selectedKeyword?.keyword || activeKeywordQuery"></span>
                </div>
              </div>
            </template>

            <!-- Loading or Empty state for collage -->
            <template x-if="!trendsData?.collage_images || trendsData.collage_images.length < 5">
              <div class="py-12 text-center text-xs text-slate-400 italic rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30">
                <i data-lucide="image" class="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2"></i>
                <p>Loading official Pinterest Trends collage...</p>
              </div>
            </template>
          </div>

          <!-- VIEW 2: INTERACTIVE PIN CARDS (DOSSIER & VELOCITY) -->
          <div x-show="popularPinsView === 'grid'" class="space-y-4">
            <template x-if="!trendsData?.popular_pins || trendsData.popular_pins.length === 0">
              <div class="py-12 text-center text-xs text-slate-400 italic">
                No popular pins extracted yet for this trend. Crawl keyword or click refresh.
              </div>
            </template>

            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3.5">
              <template x-for="p in (trendsData?.popular_pins || [])" :key="p.pin_id || p.id">
                <div @click="openPinInspector({ pin_id: p.pin_id || p.id, title: p.title, image_url: p.image_url, domain: p.domain, save_count: p.save_count, repin_count: p.repin_count })"
                     class="group rounded-2xl bg-slate-50/80 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800 hover:border-blue-500/50 overflow-hidden transition cursor-pointer flex flex-col justify-between">
                  
                  <div class="relative aspect-[2/3] bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <template x-if="p.image_url">
                      <img :src="p.image_url" class="w-full h-full object-cover group-hover:scale-105 transition duration-300" loading="lazy" referrerpolicy="no-referrer">
                    </template>
                    <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition flex items-end p-2.5">
                      <span class="text-[10px] font-bold text-white flex items-center space-x-1">
                        <i data-lucide="eye" class="w-3 h-3"></i>
                        <span>Inspect Dossier</span>
                      </span>
                    </div>
                  </div>

                  <div class="p-2.5 space-y-1">
                    <h5 class="text-xs font-bold text-slate-900 dark:text-white line-clamp-2 leading-tight group-hover:text-blue-500 transition"
                        x-text="p.title || 'Popular Pin'"></h5>
                    <div class="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                      <span class="truncate max-w-[80px]" x-text="p.pinner?.full_name || p.domain || 'Pinterest'"></span>
                      <a :href="'https://www.pinterest.com/pin/' + (p.pin_id || p.id) + '/'" target="_blank" @click.stop class="text-blue-500 hover:underline">
                        <i data-lucide="external-link" class="w-3 h-3"></i>
                      </a>
                    </div>
                  </div>

                </div>
              </template>
            </div>
          </div>
        </div>

      </div>

      <!-- TAB 4: PINCLICKS INTELLIGENCE & ARBITRAGE BREAKDOWN -->
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

      <!-- DEPRECATED DISPLACED TAB - INTEGRATED INTO SERP MATRIX -->
      <div x-show="activeTab === 'dropped'" class="hidden">
        
        <!-- Vault Header & Growth Pace Ribbon (Image 1 Parity) -->
        <div class="p-4 sm:p-5 border-b border-slate-200/80 dark:border-slate-800/80 flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-900/30">
          
          <div class="space-y-1">
            <div class="flex items-center space-x-2">
              <i data-lucide="archive" class="w-4 h-4 text-rose-500"></i>
              <h3 class="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">Displaced Pins Vault</h3>
              <span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-500/15 text-rose-600 dark:text-rose-400"
                    x-text="filteredDisplacedPins.length + ' Tracked in Vault'"></span>
            </div>
            <p class="text-xs text-slate-500">Pins that dropped out of the Top 100 SERP — monitored daily for engagement growth and vacuum ranking opportunities</p>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            
            <!-- Growth Pace Selector -->
            <div class="flex items-center p-1 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 gap-1">
              <button @click="growthPaceFilter = '24h'"
                      class="px-2.5 py-1 rounded-xl text-xs font-bold transition cursor-pointer"
                      :class="growthPaceFilter === '24h' ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/40 shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'">
                🔥 Last 24 Hours
              </button>
              <button @click="growthPaceFilter = '3d'"
                      class="px-2.5 py-1 rounded-xl text-xs font-bold transition cursor-pointer"
                      :class="growthPaceFilter === '3d' ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/40 shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'">
                ⏱ Last 3 Days
              </button>
              <button @click="growthPaceFilter = '7d'"
                      class="px-2.5 py-1 rounded-xl text-xs font-bold transition cursor-pointer"
                      :class="growthPaceFilter === '7d' ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/40 shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'">
                📅 Last 7 Days
              </button>
              <button @click="growthPaceFilter = 'all'"
                      class="px-2.5 py-1 rounded-xl text-xs font-bold transition cursor-pointer"
                      :class="growthPaceFilter === 'all' ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/40 shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'">
                ⭐ All-Time Total
              </button>
            </div>

            <!-- Cards vs Table Toggle -->
            <div class="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <button @click="viewMode = 'table'"
                      class="px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center space-x-1 cursor-pointer"
                      :class="viewMode === 'table' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'">
                <i data-lucide="table" class="w-3.5 h-3.5"></i>
                <span>Table</span>
              </button>
              <button @click="viewMode = 'cards'"
                      class="px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center space-x-1 cursor-pointer"
                      :class="viewMode === 'cards' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'">
                <i data-lucide="layout-grid" class="w-3.5 h-3.5"></i>
                <span>Cards</span>
              </button>
            </div>

            <!-- Status Dropdown -->
            <select x-model="displacedStatusFilter" @change="fetchDisplacedPins()"
                    class="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none">
              <option value="ALL">All Vault Pins</option>
              <option value="displaced_active">Displaced Active</option>
              <option value="re_entered_serp">Resurged to SERP</option>
            </select>

            <button @click="fetchDisplacedPins()"
                    class="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition cursor-pointer"
                    title="Refresh Vault">
              <i data-lucide="refresh-cw" class="w-3.5 h-3.5" :class="isDisplacedLoading ? 'animate-spin' : ''"></i>
            </button>
          </div>

        </div>

        <template x-if="isDisplacedLoading">
          <div class="py-16 text-center space-y-3">
            <div class="w-10 h-10 rounded-2xl bg-rose-500/10 text-rose-500 mx-auto flex items-center justify-center">
              <i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i>
            </div>
            <p class="text-xs font-bold text-slate-700 dark:text-slate-300">Auditing Displaced Pins Vault & Vacuum Scores...</p>
          </div>
        </template>

        <template x-if="!isDisplacedLoading && (!filteredDisplacedPins || filteredDisplacedPins.length === 0)">
          <div class="py-16 text-center space-y-3 max-w-md mx-auto p-4">
            <div class="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-500 mx-auto flex items-center justify-center">
              <i data-lucide="shield-check" class="w-6 h-6"></i>
            </div>
            <h4 class="text-sm font-bold text-slate-900 dark:text-white">Zero Pins Displaced</h4>
            <p class="text-xs text-slate-500">All crawled pins currently maintain active positions inside the organic Top 100 SERP.</p>
          </div>
        </template>

        <!-- VAULT TABLE VIEW -->
        <template x-if="!isDisplacedLoading && filteredDisplacedPins && filteredDisplacedPins.length > 0 && viewMode === 'table'">
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="table-sticky-header bg-slate-100/90 dark:bg-[#080d19]/90 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 font-mono">
                  <th class="py-3.5 px-3 w-10 text-center">
                    <input type="checkbox" @click="toggleSelectAllPins()"
                           :checked="selectedPinIds.length === filteredDisplacedPins.length && filteredDisplacedPins.length > 0"
                           class="w-3.5 h-3.5 rounded text-rose-600 focus:ring-rose-500 border-slate-300 dark:border-slate-700">
                  </th>
                  <th class="py-3.5 px-3 w-14">Preview</th>
                  <th class="py-3.5 px-4 min-w-[260px]">Pin Title & ID</th>
                  <th class="py-3.5 px-3 w-32">Status & Rank</th>
                  <th class="py-3.5 px-3 w-32">Vacuum Score</th>
                  <th class="py-3.5 px-3 w-32">Saves & Δ</th>
                  <th class="py-3.5 px-3 w-28">Repins & Δ</th>
                  <th class="py-3.5 px-2 w-20">Comments</th>
                  <th class="py-3.5 px-2 w-20">Shares</th>
                  <th class="py-3.5 px-3 w-28">Velocity</th>
                  <th class="py-3.5 px-3 w-36">Domain Authority</th>
                  <th class="py-3.5 px-3 w-28 text-right">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
                <template x-for="(pin, idx) in filteredDisplacedPins" :key="pin.pin_id">
                  <tr class="hover:bg-slate-50/80 dark:hover:bg-slate-900/40 transition group cursor-pointer"
                      @click="openPinInspector(pin)">
                    
                    <td class="py-3.5 px-3 text-center" @click.stop>
                      <input type="checkbox" :checked="isPinSelected(pin.pin_id)" @click="togglePinSelection(pin.pin_id)"
                             class="w-3.5 h-3.5 rounded text-rose-600 focus:ring-rose-500 border-slate-300 dark:border-slate-700">
                    </td>

                    <td class="py-3.5 px-3">
                      <div class="relative group/img shrink-0">
                        <template x-if="pin.image_url">
                          <img :src="pin.image_url" class="w-10 h-14 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shadow-xs group-hover/img:scale-105 transition">
                        </template>
                        <template x-if="!pin.image_url">
                          <div class="w-10 h-14 rounded-lg bg-slate-200 dark:bg-slate-800 flex items-center justify-center">
                            <i data-lucide="image" class="w-3.5 h-3.5 text-slate-400"></i>
                          </div>
                        </template>
                      </div>
                    </td>

                    <td class="py-3.5 px-4 min-w-[260px]">
                      <div class="space-y-1">
                        <span class="font-bold text-slate-900 dark:text-white group-hover:text-rose-500 line-clamp-2 block transition"
                              x-text="pin.title || 'Untitled Pin'"></span>
                        <div class="flex items-center space-x-2 text-[10px] text-slate-400 font-mono">
                          <span class="text-slate-500 dark:text-slate-400 truncate font-mono" x-text="'ID: ' + pin.pin_id"></span>
                          <span class="text-slate-400" x-text="'Displaced: ' + formatDate(pin.displaced_date)"></span>
                        </div>
                      </div>
                    </td>

                    <!-- Status & Last Known Rank -->
                    <td class="py-3.5 px-3 font-mono space-y-1">
                      <template x-if="pin.status === 're_entered_serp'">
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 block w-fit">
                          🟢 Resurged
                        </span>
                      </template>
                      <template x-if="pin.status !== 're_entered_serp'">
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 block w-fit">
                          Dropped Out
                        </span>
                      </template>
                      <span class="text-[10px] text-slate-400 block" x-text="'Was Rank #' + (pin.last_known_rank || '?')"></span>
                    </td>

                    <!-- Vacuum Opportunity Score -->
                    <td class="py-3.5 px-3 font-mono">
                      <span class="px-2.5 py-1 rounded-xl text-xs font-black block w-fit"
                            :class="Number(pin.vacuum_opportunity_score || 0) >= 70 ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40' : (Number(pin.vacuum_opportunity_score || 0) >= 40 ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/40' : 'bg-slate-100 dark:bg-slate-800 text-slate-500')"
                            x-text="(pin.vacuum_opportunity_score || 50) + '/100'"></span>
                    </td>

                    <!-- Saves & Growth Pace Delta -->
                    <td class="py-3.5 px-3 space-y-0.5 font-mono">
                      <div class="font-bold text-slate-900 dark:text-white"
                           x-text="formatNumber(pin.save_count ?? pin.current_saves ?? 0)"></div>
                      <template x-if="getPaceDelta(pin, 'saves') && getPaceDelta(pin, 'saves') !== '0'">
                        <span class="text-[10px] font-bold text-emerald-500 block"
                              x-text="getPaceDelta(pin, 'saves')"></span>
                      </template>
                    </td>

                    <!-- Repins & Growth Pace Delta -->
                    <td class="py-3.5 px-3 space-y-0.5 font-mono">
                      <div class="font-bold text-slate-700 dark:text-slate-300"
                           x-text="formatNumber(pin.repin_count ?? pin.current_repins ?? 0)"></div>
                      <template x-if="getPaceDelta(pin, 'repins') && getPaceDelta(pin, 'repins') !== '0'">
                        <span class="text-[10px] font-bold text-emerald-500 block"
                              x-text="getPaceDelta(pin, 'repins')"></span>
                      </template>
                    </td>

                    <!-- Comments -->
                    <td class="py-3.5 px-2 font-mono text-slate-600 dark:text-slate-400"
                        x-text="pin.comment_count ?? pin.current_comments ?? 0"></td>

                    <!-- Shares -->
                    <td class="py-3.5 px-2 font-mono text-slate-600 dark:text-slate-400"
                        x-text="pin.share_count ?? pin.current_shares ?? 0"></td>

                    <!-- Velocity -->
                    <td class="py-3.5 px-3 font-mono">
                      <span class="px-2 py-0.5 rounded-lg text-xs font-black block w-fit"
                            :class="Number(pin.daily_save_velocity || pin.calculated_velocity || 0) > 0 ? 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'"
                            x-text="(Number(pin.daily_save_velocity || pin.calculated_velocity || 0) > 0 ? '+' : '') + Number(pin.daily_save_velocity || pin.calculated_velocity || 0) + ' /d'"></span>
                    </td>

                    <!-- Domain -->
                    <td class="py-3.5 px-3">
                      <span class="text-xs font-mono text-slate-600 dark:text-slate-400 truncate max-w-[130px] block"
                            x-text="pin.domain || 'Pinterest Direct'"></span>
                    </td>

                    <!-- Actions -->
                    <td class="py-3.5 px-3 text-right">
                      <div class="flex items-center justify-end space-x-1" @click.stop>
                        <button @click="openPinInspector(pin)"
                                class="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition cursor-pointer"
                                title="Open Pin Deep Dossier">
                          <i data-lucide="eye" class="w-3.5 h-3.5"></i>
                        </button>
                        <button @click="openVisualLens(pin)"
                                class="p-1.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 transition cursor-pointer"
                                title="Visual Lens Similarity Search">
                          <i data-lucide="camera" class="w-3.5 h-3.5"></i>
                        </button>
                        <a :href="'https://www.pinterest.com/pin/' + pin.pin_id + '/'" target="_blank"
                           class="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-white transition"
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

        <!-- VAULT CARDS VIEW -->
        <template x-if="!isDisplacedLoading && filteredDisplacedPins && filteredDisplacedPins.length > 0 && viewMode === 'cards'">
          <div class="p-5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            <template x-for="pin in filteredDisplacedPins" :key="pin.pin_id">
              <div @click="openPinInspector(pin)"
                   class="p-4 rounded-3xl bg-slate-50/70 dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800 hover:border-rose-500/40 transition group cursor-pointer flex flex-col justify-between space-y-3.5">
                
                <div class="space-y-3">
                  <div class="relative rounded-2xl overflow-hidden aspect-[2/3] max-h-56 bg-slate-200 dark:bg-slate-800">
                    <template x-if="pin.image_url">
                      <img :src="pin.image_url" class="w-full h-full object-cover group-hover:scale-105 transition duration-300">
                    </template>
                    <div class="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-lg bg-slate-950/80 text-white font-mono font-black text-xs backdrop-blur-xs"
                         x-text="'Was #' + (pin.last_known_rank || '?')"></div>
                    <div class="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md text-[10px] font-mono backdrop-blur-xs uppercase font-bold"
                         :class="pin.status === 're_entered_serp' ? 'bg-emerald-950/80 text-emerald-400' : 'bg-rose-950/80 text-rose-300'"
                         x-text="pin.status === 're_entered_serp' ? 'Resurged' : 'Displaced'"></div>
                  </div>

                  <div class="space-y-1">
                    <h4 class="text-xs font-bold text-slate-900 dark:text-white group-hover:text-rose-500 line-clamp-2 leading-snug transition"
                        x-text="pin.title || 'Untitled Pin'"></h4>
                    <div class="flex items-center justify-between text-[10px] font-mono text-slate-400">
                      <span x-text="'ID: ' + pin.pin_id"></span>
                      <span class="text-emerald-500 font-bold" x-text="'Vacuum: ' + (pin.vacuum_opportunity_score || 50) + '/100'"></span>
                    </div>
                  </div>
                </div>

                <div class="pt-2.5 border-t border-slate-200/60 dark:border-slate-800/60 space-y-2">
                  <div class="flex items-center justify-between text-xs font-mono">
                    <div>
                      <span class="text-slate-400 text-[10px]">Saves:</span>
                      <strong class="text-slate-900 dark:text-white" x-text="formatNumber(pin.save_count ?? pin.current_saves ?? 0)"></strong>
                      <template x-if="getPaceDelta(pin, 'saves') && getPaceDelta(pin, 'saves') !== '0'">
                        <span class="text-emerald-500 text-[10px] font-bold" x-text="getPaceDelta(pin, 'saves')"></span>
                      </template>
                    </div>
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold font-mono"
                          :class="Number(pin.daily_save_velocity || pin.calculated_velocity || 0) > 0 ? 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'"
                          x-text="(Number(pin.daily_save_velocity || pin.calculated_velocity || 0) > 0 ? '+' : '') + (pin.daily_save_velocity || pin.calculated_velocity || 0) + ' v/d'"></span>
                  </div>

                  <div class="flex items-center justify-between text-[11px] text-slate-400 pt-1" @click.stop>
                    <span class="truncate max-w-[120px] font-mono text-[10px]" x-text="pin.domain || 'Pinterest'"></span>
                    <div class="flex items-center space-x-1">
                      <button @click="openPinInspector(pin)" class="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-200" title="Dossier">
                        <i data-lucide="eye" class="w-3.5 h-3.5"></i>
                      </button>
                      <button @click="openVisualLens(pin)" class="p-1 rounded hover:bg-purple-500/20 text-slate-400 hover:text-purple-400" title="Visual Lens">
                        <i data-lucide="camera" class="w-3.5 h-3.5"></i>
                      </button>
                      <a :href="'https://www.pinterest.com/pin/' + pin.pin_id + '/'" target="_blank" class="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-white" title="Pinterest">
                        <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                      </a>
                    </div>
                  </div>
                </div>

              </div>
            </template>
          </div>
        </template>

      </div>

      <!-- DEPRECATED CROSSOVER TAB - MIGRATED TO /folders/:id -->
      <div x-show="activeTab === 'crossover'" class="hidden">
        
        <!-- Folder Switcher & Management Strip -->
        <div class="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-slate-100/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-xs font-bold text-slate-400 font-mono uppercase tracking-wider mr-1">Folders:</span>
            <template x-for="f in folders" :key="f.id">
              <button @click="selectFolder(f)"
                      class="px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-2 cursor-pointer border"
                      :class="activeFolder?.id === f.id ? 'bg-pink-500/20 text-pink-600 dark:text-pink-300 border-pink-500/50 shadow-xs' : 'bg-white dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400'">
                <span class="w-2.5 h-2.5 rounded-full shrink-0" :style="'background-color: ' + (f.color || '#ec4899')"></span>
                <span x-text="f.name"></span>
                <span class="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-slate-200 dark:bg-slate-700/60" x-text="f.keyword_count || 0"></span>
              </button>
            </template>
            <button @click="openCreateFolderModal()"
                    class="px-3 py-1.5 rounded-xl text-xs font-bold bg-pink-500/10 hover:bg-pink-500/20 text-pink-600 dark:text-pink-400 border border-pink-500/30 transition flex items-center space-x-1.5 cursor-pointer">
              <i data-lucide="plus" class="w-3.5 h-3.5"></i>
              <span>New Folder</span>
            </button>
          </div>

          <div class="flex items-center space-x-2">
            <button @click="isFolderManagerOpen = true"
                    class="px-3 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition flex items-center space-x-1.5">
              <i data-lucide="settings" class="w-3.5 h-3.5"></i>
              <span>Manage All Folders</span>
            </button>
          </div>
        </div>

        <!-- Empty State: No Folders Yet -->
        <template x-if="folders.length === 0">
          <div class="py-16 text-center space-y-4 max-w-lg mx-auto p-6 rounded-3xl border border-dashed border-slate-300 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/20">
            <div class="w-16 h-16 rounded-3xl bg-pink-500/10 text-pink-500 mx-auto flex items-center justify-center shadow-lg shadow-pink-500/10">
              <i data-lucide="folder-kanban" class="w-8 h-8"></i>
            </div>
            <div class="space-y-1">
              <h3 class="text-base font-black text-slate-900 dark:text-white">Create Your First Campaign Folder</h3>
              <p class="text-xs text-slate-500 max-w-md mx-auto">
                Group related search keywords into topic clusters (e.g. <em>"Comfort Casseroles"</em>, <em>"Quick Dinner Ideas"</em>) to unlock automatic multi-ranking super-pins, universal tag bridges, creator monopoly analysis, and 1-click CSV blueprints.
              </p>
            </div>
            <button @click="openCreateFolderModal()"
                    class="px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white transition shadow-lg shadow-pink-950/20 active:scale-95 flex items-center space-x-2 mx-auto cursor-pointer">
              <i data-lucide="plus-circle" class="w-4 h-4"></i>
              <span>Create Campaign Folder</span>
            </button>
          </div>
        </template>

        <!-- Active Folder Executive Workspace -->
        <template x-if="activeFolder">
          <div class="space-y-6">

            <!-- FOLDER HERO HEADER & METRIC CARDS -->
            <div class="p-6 rounded-3xl bg-gradient-to-br from-white via-pink-50/30 to-purple-50/20 dark:from-[#0c1322] dark:via-slate-900 dark:to-[#111827] border border-pink-500/20 dark:border-pink-500/10 shadow-sm space-y-5">
              
              <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div class="flex items-start sm:items-center space-x-4 min-w-0">
                  <div class="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-black shadow-lg shadow-pink-500/20 shrink-0"
                       :style="'background: linear-gradient(135deg, ' + (activeFolder.color || '#ec4899') + ', #8b5cf6)'">
                    <i data-lucide="folder" class="w-7 h-7"></i>
                  </div>
                  <div class="min-w-0">
                    <div class="flex flex-wrap items-center gap-2.5">
                      <h2 class="text-xl sm:text-2xl font-black text-slate-900 dark:text-white capitalize truncate" x-text="activeFolder.name"></h2>
                      <span class="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-pink-500/10 text-pink-600 dark:text-pink-400 border border-pink-500/30">
                        Topic Cluster
                      </span>
                    </div>
                    <p class="text-xs text-slate-500 dark:text-slate-400 mt-1" x-text="activeFolder.description || 'Algorithmic Topic Cluster & Multi-Dimensional Crossover Engine'"></p>
                  </div>
                </div>

                <!-- Action Toolbar -->
                <div class="flex flex-wrap items-center gap-2">
                  <button @click="exportClusterBlueprintCsv()"
                          :disabled="!crossoverData?.topic_cluster_blueprint?.csv_rows"
                          class="px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white transition flex items-center space-x-2 shadow-md shadow-pink-950/20 active:scale-95 disabled:opacity-50 cursor-pointer">
                    <i data-lucide="download" class="w-3.5 h-3.5"></i>
                    <span>1-Click CSV Blueprint</span>
                  </button>

                  <button @click="openAddKeywordsModal()"
                          class="px-3.5 py-2.5 rounded-2xl text-xs font-bold bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 transition flex items-center space-x-1.5 cursor-pointer">
                    <i data-lucide="plus" class="w-3.5 h-3.5 text-pink-500"></i>
                    <span>Add Keywords</span>
                  </button>

                  <button @click="fetchFolderCrossover(activeFolder.id)"
                          :disabled="isCrossoverLoading"
                          class="p-2.5 rounded-2xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 transition cursor-pointer"
                          title="Recalculate Crossover Matrix">
                    <i data-lucide="refresh-cw" class="w-4 h-4" :class="isCrossoverLoading ? 'animate-spin text-pink-500' : ''"></i>
                  </button>

                  <button @click="deleteCampaignFolder(activeFolder.id)"
                          class="p-2.5 rounded-2xl bg-white dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-slate-200 dark:border-slate-700 text-rose-500 hover:text-rose-600 transition cursor-pointer"
                          title="Delete Folder">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                  </button>
                </div>
              </div>

              <!-- 6 Executive Folder KPI Cards -->
              <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-3 border-t border-slate-200/60 dark:border-slate-800/60">
                <div class="p-3.5 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 space-y-1">
                  <span class="text-[10px] font-mono font-bold uppercase text-slate-400">Keywords</span>
                  <p class="text-xl font-black text-slate-900 dark:text-white font-mono" x-text="crossoverData?.summary?.total_keywords || 0"></p>
                </div>

                <div class="p-3.5 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 space-y-1">
                  <span class="text-[10px] font-mono font-bold uppercase text-slate-400">Unique Pins</span>
                  <p class="text-xl font-black text-cyan-600 dark:text-cyan-400 font-mono" x-text="formatNumber(crossoverData?.summary?.total_unique_pins || 0)"></p>
                </div>

                <div class="p-3.5 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 space-y-1">
                  <span class="text-[10px] font-mono font-bold uppercase text-slate-400">Super-Pins</span>
                  <p class="text-xl font-black text-amber-500 font-mono" x-text="crossoverData?.summary?.super_pins_count || 0"></p>
                </div>

                <div class="p-3.5 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 space-y-1">
                  <span class="text-[10px] font-mono font-bold uppercase text-slate-400">Universal Tags</span>
                  <p class="text-xl font-black text-emerald-500 font-mono" x-text="crossoverData?.summary?.universal_tags_count || 0"></p>
                </div>

                <div class="p-3.5 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 space-y-1">
                  <span class="text-[10px] font-mono font-bold uppercase text-slate-400">Shared Pivots</span>
                  <p class="text-xl font-black text-blue-500 font-mono" x-text="crossoverData?.summary?.shared_pivots_count || 0"></p>
                </div>

                <div class="p-3.5 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 space-y-1">
                  <span class="text-[10px] font-mono font-bold uppercase text-slate-400">Whale Domains</span>
                  <p class="text-xl font-black text-purple-500 font-mono" x-text="crossoverData?.summary?.monopoly_domain_count || 0"></p>
                </div>
              </div>

            </div>

            <!-- Loading State -->
            <template x-if="isCrossoverLoading">
              <div class="py-20 text-center space-y-3 bg-white dark:bg-[#0c1322] rounded-3xl border border-slate-200 dark:border-slate-800">
                <div class="w-12 h-12 rounded-2xl bg-pink-500/10 text-pink-500 mx-auto flex items-center justify-center">
                  <i data-lucide="loader-2" class="w-6 h-6 animate-spin"></i>
                </div>
                <p class="text-sm font-bold text-slate-700 dark:text-slate-300">Computing Multi-Dimensional Crossover Matrix...</p>
                <p class="text-xs text-slate-400 font-mono">Analyzing super-pins overlap, universal tag bridges, domain monopoly & seasonality wave</p>
              </div>
            </template>

            <!-- Fallback Empty State if not loading and no data -->
            <template x-if="!isCrossoverLoading && !crossoverData">
              <div class="py-16 text-center space-y-4 bg-white dark:bg-[#0c1322] rounded-3xl border border-slate-200 dark:border-slate-800">
                <div class="w-12 h-12 rounded-2xl bg-pink-500/10 text-pink-500 mx-auto flex items-center justify-center">
                  <i data-lucide="network" class="w-6 h-6"></i>
                </div>
                <div>
                  <h3 class="text-sm font-bold text-slate-900 dark:text-white" x-text="'No Crossover Data Loaded for ' + activeFolder.name"></h3>
                  <p class="text-xs text-slate-500 mt-1">Click below to compute the multi-dimensional crossover matrix.</p>
                </div>
                <button @click="fetchFolderCrossover(activeFolder.id)" class="px-5 py-2.5 rounded-xl text-xs font-bold bg-pink-600 text-white hover:bg-pink-500 transition cursor-pointer">
                  Compute Crossover Matrix
                </button>
              </div>
            </template>

            <!-- Crossover Content Panels -->
            <template x-if="!isCrossoverLoading && crossoverData">
              <div class="space-y-6">

                <!-- DIMENSION 1: 🌟 MULTI-RANKING SUPER-PINS OVERLAP -->
                <div class="p-6 rounded-3xl bg-white dark:bg-[#0c1322] border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
                  <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800/80">
                    <div class="space-y-0.5">
                      <div class="flex items-center space-x-2">
                        <i data-lucide="sparkles" class="w-4 h-4 text-amber-500"></i>
                        <h3 class="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">Multi-Ranking Super-Pins</h3>
                        <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400"
                              x-text="crossoverData.super_pins?.length + ' Pins'"></span>
                      </div>
                      <p class="text-xs text-slate-500">Pins ranking across multiple search queries simultaneously in this cluster. Analyze their visual layouts for winning templates.</p>
                    </div>
                  </div>

                  <template x-if="crossoverData.super_pins?.length === 0">
                    <div class="py-10 text-center text-xs text-slate-400 italic">
                      No overlapping super-pins discovered yet. Crawl more keyword SERPs to populate multi-ranking pins.
                    </div>
                  </template>

                  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    <template x-for="pin in crossoverData.super_pins?.slice(0, 16)" :key="pin.pin_id">
                      <div class="p-3.5 rounded-2xl bg-slate-50/70 dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800 hover:border-pink-500/40 transition group cursor-pointer flex flex-col justify-between space-y-3"
                           @click="openPinInspector(pin)">
                        
                        <div class="flex items-start space-x-3 min-w-0">
                          <template x-if="pin.image_url">
                            <img :src="pin.image_url" class="w-14 h-20 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0 group-hover:scale-105 transition shadow-xs">
                          </template>
                          <template x-if="!pin.image_url">
                            <div class="w-14 h-20 rounded-xl bg-slate-200 dark:bg-slate-800 flex items-center justify-center shrink-0">
                              <i data-lucide="image" class="w-4 h-4 text-slate-400"></i>
                            </div>
                          </template>
                          
                          <div class="min-w-0 flex-1 space-y-1">
                            <div class="flex items-center justify-between gap-1">
                              <span class="px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase"
                                    :class="pin.overlap_count >= 2 ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'"
                                    x-text="pin.overlap_count >= 2 ? (pin.overlap_count + 'x Overlap') : 'Top Rank'"></span>
                              <span class="text-[10px] font-mono font-bold text-slate-700 dark:text-slate-300" x-text="formatNumber(pin.save_count) + ' saves'"></span>
                            </div>
                            <h4 class="text-xs font-bold text-slate-900 dark:text-white line-clamp-2 leading-tight" x-text="pin.title"></h4>
                            <div class="text-[10px] text-slate-400 font-mono truncate" x-text="pin.domain || 'Pinterest Direct'"></div>
                          </div>
                        </div>

                        <!-- Ranked Keywords List -->
                        <div class="pt-2 border-t border-slate-200/60 dark:border-slate-800/60 space-y-1">
                          <span class="text-[9px] font-mono font-bold text-slate-400 uppercase">Ranked Queries:</span>
                          <div class="flex flex-wrap gap-1">
                            <template x-for="r in pin.rankings" :key="r.keyword">
                              <template x-if="r.rank_position != null && r.rank_position >= 1">
                                <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-pink-500/10 text-pink-600 dark:text-pink-400 border border-pink-500/20 truncate max-w-full"
                                      x-text="r.keyword + ' (#' + r.rank_position + ')'"></span>
                              </template>
                            </template>
                          </div>
                        </div>

                      </div>
                    </template>
                  </div>
                </div>

                <!-- DIMENSION 2: 🌉 UNIVERSAL TAG BRIDGES (CV & Semantic Annotations Overlap) -->
                <div class="p-6 rounded-3xl bg-white dark:bg-[#0c1322] border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
                  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800/80">
                    <div class="space-y-0.5">
                      <div class="flex items-center space-x-2">
                        <i data-lucide="network" class="w-4 h-4 text-emerald-500"></i>
                        <h3 class="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">Universal Visual Tag Bridges</h3>
                        <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                              x-text="crossoverData.tag_bridges?.length + ' Tags'"></span>
                      </div>
                      <p class="text-xs text-slate-500">Tags and visual entities shared across multiple search terms in this folder. Include these in your Pin descriptions to rank for the entire topic cluster.</p>
                    </div>

                    <button @click="copyAllUniversalTags()"
                            class="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 transition flex items-center space-x-1.5 cursor-pointer shrink-0">
                      <i data-lucide="copy" class="w-3.5 h-3.5"></i>
                      <span>Copy Top Tags Blueprint</span>
                    </button>
                  </div>

                  <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    <template x-for="tag in crossoverData.tag_bridges?.slice(0, 16)" :key="tag.tag">
                      <div class="p-3 rounded-2xl bg-slate-50/70 dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800 space-y-2">
                        <div class="flex items-center justify-between gap-1">
                          <span class="text-xs font-bold text-slate-900 dark:text-white capitalize" x-text="tag.tag"></span>
                          <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold"
                                :class="tag.overlap_percentage >= 80 ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30' : (tag.overlap_percentage >= 50 ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400' : 'bg-slate-200 dark:bg-slate-800 text-slate-500')"
                                x-text="tag.overlap_percentage + '% (' + tag.keyword_overlap_count + '/' + crossoverData.summary?.total_keywords + ')'"></span>
                        </div>
                        <div class="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                          <span x-text="tag.pin_count + ' pins tagged'"></span>
                          <span x-text="formatNumber(tag.total_saves) + ' saves'"></span>
                        </div>
                      </div>
                    </template>
                  </div>
                </div>

                <!-- TWO COLUMNS: SHARED GUIDED PIVOTS & DOMAIN AUTHORITY -->
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">

                  <!-- DIMENSION 3: 🧭 SHARED GUIDED SEARCH PIVOTS -->
                  <div class="p-6 rounded-3xl bg-white dark:bg-[#0c1322] border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
                    <div class="pb-3 border-b border-slate-100 dark:border-slate-800/80">
                      <div class="flex items-center space-x-2">
                        <i data-lucide="compass" class="w-4 h-4 text-cyan-500"></i>
                        <h3 class="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">Shared Guided Pivots</h3>
                      </div>
                      <p class="text-xs text-slate-500 mt-0.5">Semantic search capsules connecting multiple keywords in this cluster.</p>
                    </div>

                    <div class="flex flex-wrap gap-2 max-h-72 overflow-y-auto">
                      <template x-for="pivot in crossoverData.guided_pivots" :key="pivot.term">
                        <div class="px-3 py-1.5 rounded-xl border flex items-center space-x-2 text-xs transition hover:scale-105 cursor-pointer"
                             :title="'Shared by ' + pivot.shared_count + ' keywords: ' + (pivot.shared_keywords?.map(k => k.keyword || k)?.join(', ') || '')"
                             :class="pivot.shared_count >= 2 ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-600 dark:text-cyan-400 font-bold' : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'">
                          <span class="font-bold" x-text="pivot.display_label"></span>
                          <span class="px-1.5 py-0.2 rounded-full text-[10px] font-mono"
                                :class="pivot.shared_count >= 2 ? 'bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 font-bold' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'"
                                x-text="pivot.shared_count + ' kw'"></span>
                        </div>
                      </template>
                    </div>
                  </div>

                  <!-- DIMENSION 4: 👑 DOMAIN & CREATOR MONOPOLY INDEX -->
                  <div class="p-6 rounded-3xl bg-white dark:bg-[#0c1322] border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
                    <div class="pb-3 border-b border-slate-100 dark:border-slate-800/80">
                      <div class="flex items-center space-x-2">
                        <i data-lucide="crown" class="w-4 h-4 text-purple-500"></i>
                        <h3 class="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">Authority Domain Monopoly</h3>
                      </div>
                      <p class="text-xs text-slate-500 mt-0.5">Top websites dominating the search rankings across your entire cluster.</p>
                    </div>

                    <div class="space-y-2 max-h-72 overflow-y-auto">
                      <template x-for="d in crossoverData.domain_monopoly?.slice(0, 8)" :key="d.domain">
                        <div class="p-2.5 rounded-xl bg-slate-50/70 dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between text-xs">
                          <div class="min-w-0">
                            <p class="font-bold text-slate-900 dark:text-white truncate" x-text="d.domain"></p>
                            <span class="text-[10px] text-slate-400 font-mono" x-text="d.keywords_count + ' keywords covered (' + d.overlap_percentage + '%)'"></span>
                          </div>
                          <div class="text-right shrink-0">
                            <span class="font-mono font-bold text-purple-600 dark:text-purple-400" x-text="formatNumber(d.total_saves) + ' saves'"></span>
                            <p class="text-[10px] text-slate-400 font-mono" x-text="d.pin_count + ' pins'"></p>
                          </div>
                        </div>
                      </template>
                    </div>
                  </div>

                </div>

                <!-- DIMENSION 5: 📈 COMPOSITE 52-WEEK SEASONALITY WAVE -->
                <div class="p-6 rounded-3xl bg-white dark:bg-[#0c1322] border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
                  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800/80">
                    <div class="space-y-0.5">
                      <div class="flex items-center space-x-2">
                        <i data-lucide="trending-up" class="w-4 h-4 text-blue-500"></i>
                        <h3 class="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">Composite 52-Week Seasonality Wave</h3>
                      </div>
                      <p class="text-xs text-slate-500">Joint demand curve aggregated across all keywords in this cluster.</p>
                    </div>

                    <div class="flex items-center space-x-3">
                      <div class="px-3 py-1.5 rounded-xl bg-blue-500/10 border border-blue-500/30 text-xs">
                        <span class="text-slate-400">Peak Months:</span>
                        <span class="font-bold text-blue-600 dark:text-blue-400 font-mono ml-1"
                              x-text="crossoverData.seasonality?.peak_months?.join(', ') || 'Evergreen'"></span>
                      </div>
                      <div class="px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs">
                        <span class="text-slate-400">Launch Window:</span>
                        <span class="font-bold text-emerald-600 dark:text-emerald-400 font-mono ml-1"
                              x-text="crossoverData.seasonality?.recommended_launch_window"></span>
                      </div>
                    </div>
                  </div>

                  <!-- Wave Chart -->
                  <div class="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
                    <svg class="w-full h-36 overflow-visible" viewBox="0 0 800 180" preserveAspectRatio="none">
                      <defs>
                        <linearGradient id="crossoverGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.4"/>
                          <stop offset="100%" stop-color="#3b82f6" stop-opacity="0"/>
                        </linearGradient>
                      </defs>
                      <path :d="getTrendsAreaPath(crossoverData.seasonality?.composite_wave?.map(w => w.score) || []).area" fill="url(#crossoverGrad)" />
                      <path :d="getTrendsAreaPath(crossoverData.seasonality?.composite_wave?.map(w => w.score) || []).line" fill="none" stroke="#3b82f6" stroke-width="2.5" stroke-linecap="round"/>
                    </svg>

                    <!-- 12-Month Timeline Axis with Dynamic Peak Highlights (Rolling Chronological) -->
                    <div class="grid grid-cols-12 text-center text-[10px] font-mono pt-2 border-t border-slate-800/80">
                      <template x-for="m in (crossoverData.seasonality?.rolling_months || ['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'])" :key="m">
                        <span :class="crossoverData.seasonality?.peak_months?.includes(m) ? 'text-blue-400 font-bold bg-blue-500/15 rounded py-0.5 border border-blue-500/30' : 'text-slate-500'" x-text="m"></span>
                      </template>
                    </div>
                  </div>
                </div>

                <!-- DIMENSION 6: 🎯 1-CLICK TOPIC CLUSTER BLUEPRINT & CSV CONTENT GENERATOR -->
                <template x-if="crossoverData.topic_cluster_blueprint">
                  <div class="p-6 rounded-3xl bg-gradient-to-br from-white via-purple-50/20 to-pink-50/20 dark:from-[#0c1322] dark:via-slate-900 dark:to-[#111827] border border-purple-500/30 dark:border-purple-500/20 shadow-lg shadow-purple-950/10 space-y-5">
                    
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/80 dark:border-slate-800/80">
                      <div>
                        <div class="flex items-center space-x-2">
                          <i data-lucide="target" class="w-4 h-4 text-purple-500"></i>
                          <h3 class="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">Algorithmic Topic Cluster Blueprint</h3>
                          <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-500/20 text-purple-600 dark:text-purple-400">Ready to Deploy</span>
                        </div>
                        <p class="text-xs text-slate-500 mt-0.5">Automated Pillar + Spoke content architecture targeting maximum cluster authority on Pinterest.</p>
                      </div>

                      <button @click="exportClusterBlueprintCsv()"
                              class="px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white transition flex items-center space-x-2 shadow-md shadow-purple-950/20 active:scale-95 cursor-pointer">
                        <i data-lucide="file-spreadsheet" class="w-4 h-4"></i>
                        <span>Export CSV Blueprint</span>
                      </button>
                    </div>

                    <!-- Pillar Concept -->
                    <div class="p-4 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-purple-500/20 space-y-2">
                      <div class="flex items-center justify-between">
                        <span class="text-[10px] font-mono font-bold uppercase text-purple-600 dark:text-purple-400">Pillar Content Angle</span>
                        <span class="text-[10px] font-mono text-slate-400" x-text="'Anchor: ' + crossoverData.topic_cluster_blueprint.folder_name"></span>
                      </div>
                      <h4 class="text-base font-black text-slate-900 dark:text-white" x-text="crossoverData.topic_cluster_blueprint.pillar_concept"></h4>
                      <p class="text-xs text-slate-400 font-mono">
                        <strong class="text-slate-300">Universal Tags:</strong> 
                        <span x-text="crossoverData.topic_cluster_blueprint.universal_tag_blueprint"></span>
                      </p>
                    </div>

                    <!-- 5 Spoke Pin Angles -->
                    <div class="space-y-3">
                      <span class="text-xs font-bold text-slate-400 font-mono uppercase tracking-wider">5 High-Impact Spoke Pin Angles:</span>
                      
                      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        <template x-for="spoke in crossoverData.topic_cluster_blueprint.spoke_angles" :key="spoke.angle_number">
                          <div class="p-4 rounded-2xl bg-white/80 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 space-y-2.5">
                            <div class="flex items-center justify-between">
                              <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20"
                                    x-text="'Spoke #' + spoke.angle_number"></span>
                              <span class="text-[10px] font-mono text-slate-400" x-text="spoke.recommended_aspect_ratio"></span>
                            </div>

                            <h5 class="text-xs font-bold text-slate-900 dark:text-white" x-text="spoke.angle_title"></h5>

                            <div class="space-y-1 text-[11px] text-slate-500">
                              <div class="flex items-center justify-between">
                                <span>Target:</span>
                                <strong class="font-mono text-pink-500 capitalize" x-text="spoke.target_keyword"></strong>
                              </div>
                              <div class="flex items-center justify-between">
                                <span>Format:</span>
                                <strong class="font-mono text-slate-700 dark:text-slate-300" x-text="spoke.recommended_format"></strong>
                              </div>
                            </div>

                            <div class="pt-2 border-t border-slate-100 dark:border-slate-800/80 text-[10px] text-slate-400 font-mono line-clamp-1"
                                 x-text="'Tags: ' + spoke.target_tags"></div>
                          </div>
                        </template>
                      </div>
                    </div>

                  </div>
                </template>

              </div>
            </template>

          </div>
        </template>

      </div>

    </section>

    </div>

  </main>

  <!-- ELEVATED FLOATING BULK ACTION BAR (LEVEL 1A DASHBOARD) -->
  <div x-show="viewModeLevel === 'dashboard' && selectedKeywordIds.length > 0" x-cloak
       x-transition:enter="transition ease-out duration-300"
       x-transition:enter-start="opacity-0 translate-y-8"
       x-transition:enter-end="opacity-100 translate-y-0"
       x-transition:leave="transition ease-in duration-200"
       x-transition:leave-start="opacity-100 translate-y-0"
       x-transition:leave-end="opacity-0 translate-y-8"
       class="fixed bottom-6 inset-x-0 mx-auto w-fit z-50 bg-slate-900/95 dark:bg-[#0c1322]/95 border border-slate-700 shadow-2xl backdrop-blur-xl px-4 sm:px-6 py-3 rounded-2xl flex flex-wrap items-center gap-2 sm:gap-3 text-xs">
    <div class="flex items-center space-x-2">
      <span class="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
      <span class="px-2.5 py-1 rounded-xl bg-emerald-500/20 text-emerald-400 font-mono font-bold" x-text="selectedKeywordIds.length + ' Keywords Selected'"></span>
    </div>

    <div class="h-4 w-px bg-slate-700 hidden sm:block"></div>

    <button @click="bulkSyncKeywords()" :disabled="isBulkLoading"
            class="px-3.5 py-1.5 rounded-xl font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50">
      <i data-lucide="zap" class="w-3.5 h-3.5" :class="isBulkLoading ? 'animate-spin' : ''"></i>
      <span>⚡ Fast Refresh Now</span>
    </button>

    <button @click="openBulkFolderModal()" :disabled="isBulkLoading"
            class="px-3.5 py-1.5 rounded-xl font-bold bg-pink-500/20 hover:bg-pink-500/30 text-pink-400 border border-pink-500/40 transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50">
      <i data-lucide="folder-plus" class="w-3.5 h-3.5"></i>
      <span>📁 Add to Campaign Folder</span>
    </button>

    <button @click="bulkToggleKeywordStatus(false)" :disabled="isBulkLoading"
            class="px-3.5 py-1.5 rounded-xl font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/40 transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50">
      <i data-lucide="pause-circle" class="w-3.5 h-3.5"></i>
      <span>⏸ Pause Tracking</span>
    </button>

    <button @click="bulkToggleKeywordStatus(true)" :disabled="isBulkLoading"
            class="px-3.5 py-1.5 rounded-xl font-bold bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border border-blue-500/40 transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50">
      <i data-lucide="play-circle" class="w-3.5 h-3.5"></i>
      <span>▶ Resume Tracking</span>
    </button>

    <button @click="bulkDeleteKeywords()" :disabled="isBulkLoading"
            class="px-3.5 py-1.5 rounded-xl font-bold bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/40 transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50">
      <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
      <span>🗑 Delete Selected</span>
    </button>

    <button @click="clearSelectedKeywords()" class="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer" title="Clear Selection">
      <i data-lucide="x" class="w-4 h-4"></i>
    </button>
  </div>

  <!-- MODAL: BULK ADD KEYWORDS TO CAMPAIGN FOLDER -->
  <div x-show="isBulkFolderModalOpen" x-cloak class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div x-show="isBulkFolderModalOpen"
         x-transition:enter="transition-opacity ease-linear duration-300"
         x-transition:enter-start="opacity-0"
         x-transition:enter-end="opacity-100"
         x-transition:leave="transition-opacity ease-linear duration-300"
         x-transition:leave-start="opacity-100"
         x-transition:leave-end="opacity-0"
         @click="isBulkFolderModalOpen = false"
         class="fixed inset-0 bg-slate-950/70 backdrop-blur-xs"></div>

    <div x-show="isBulkFolderModalOpen"
         x-transition:enter="transform transition ease-out duration-300"
         x-transition:enter-start="opacity-0 scale-95"
         x-transition:enter-end="opacity-100 scale-100"
         x-transition:leave="transform transition ease-in duration-200"
         x-transition:leave-start="opacity-100 scale-100"
         x-transition:leave-end="opacity-0 scale-95"
         class="relative w-full max-w-md bg-white dark:bg-[#0c1322] border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl p-6 space-y-4 z-10">
      
      <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
        <div class="flex items-center space-x-2.5">
          <div class="w-8 h-8 rounded-xl bg-pink-500/10 text-pink-500 flex items-center justify-center">
            <i data-lucide="folder-plus" class="w-4 h-4"></i>
          </div>
          <div>
            <h3 class="text-sm font-black text-slate-900 dark:text-white">Add to Campaign Folder</h3>
            <p class="text-[11px] text-slate-400 font-mono" x-text="selectedKeywordIds.length + ' Keywords will be added'"></p>
          </div>
        </div>
        <button @click="isBulkFolderModalOpen = false" class="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>

      <div class="space-y-3">
        <label class="block text-xs font-bold text-slate-700 dark:text-slate-300">Select Target Campaign Folder</label>
        <select x-model="bulkTargetFolderId" class="w-full px-3 py-2 rounded-xl text-xs bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-pink-500/40">
          <template x-for="f in folders" :key="f.id">
            <option :value="f.id" x-text="f.name + ' (' + (f.keyword_count || 0) + ' keywords)'"></option>
          </template>
        </select>
        <template x-if="folders.length === 0">
          <p class="text-xs text-rose-500">No folders available. Please create a campaign folder first.</p>
        </template>
      </div>

      <div class="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100 dark:border-slate-800">
        <button @click="isBulkFolderModalOpen = false" class="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
          Cancel
        </button>
        <button @click="commitBulkFolder()" :disabled="!bulkTargetFolderId || folders.length === 0 || isBulkLoading"
                class="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-pink-600 hover:bg-pink-500 text-white transition disabled:opacity-50 cursor-pointer shadow-sm">
          Add Keywords
        </button>
      </div>
    </div>
  </div>

  <!-- PIN DETAIL SLIDE-OVER INSPECTOR DRAWER (PinClicks Parity - Image 5) -->
  <!-- PIN DEEP DOSSIER SLIDE-OVER INSPECTOR (Image 2 Parity) -->
  <div x-show="isPinDrawerOpen" x-cloak class="relative z-50">
    <div x-show="isPinDrawerOpen"
         x-transition:enter="transition-opacity ease-linear duration-300"
         x-transition:enter-start="opacity-0"
         x-transition:enter-end="opacity-100"
         x-transition:leave="transition-opacity ease-linear duration-300"
         x-transition:leave-start="opacity-100"
         x-transition:leave-end="opacity-0"
         @click="closePinInspector()"
         class="fixed inset-0 bg-slate-950/70 backdrop-blur-xs"></div>

    <div class="fixed inset-y-0 right-0 max-w-full flex pl-8 sm:pl-16">
      <div x-show="isPinDrawerOpen"
           x-transition:enter="transform transition ease-in-out duration-300"
           x-transition:enter-start="translate-x-full"
           x-transition:enter-end="translate-x-0"
           x-transition:leave="transform transition ease-in-out duration-300"
           x-transition:leave-start="translate-x-0"
           x-transition:leave-end="translate-x-full"
           class="w-screen max-w-xl md:max-w-2xl bg-white dark:bg-[#0c1322] border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col h-full overflow-hidden">
        
        <!-- Drawer Header with Quick-Copy Toolbar (Image 2 Parity) -->
        <div class="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-900/40 shrink-0">
          
          <div class="flex items-center space-x-2">
            <template x-if="activeInspectorPin?.rank_position">
              <span class="px-2.5 py-1 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-mono font-black text-xs border border-emerald-500/30"
                    x-text="'#' + activeInspectorPin.rank_position"></span>
            </template>
            <template x-if="!activeInspectorPin?.rank_position && activeInspectorPin?.last_known_rank">
              <span class="px-2.5 py-1 rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-400 font-mono font-black text-xs border border-rose-500/30"
                    x-text="'Was #' + activeInspectorPin.last_known_rank"></span>
            </template>
            <h3 class="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">Pin Deep Dossier</h3>
          </div>

          <!-- Quick-Copy Buttons Bar (Image 2 Parity) -->
          <div class="flex flex-wrap items-center gap-1.5">
            <!-- Open Full Dossier Page (Level 3) -->
            <a :href="'/pins/' + activeInspectorPin?.pin_id"
               class="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 transition flex items-center space-x-1"
               title="Open Dedicated Full Dossier Page (/pins/:pin_id)">
              <i data-lucide="external-link" class="w-3 h-3 text-emerald-500"></i>
              <span>Full Dossier</span>
            </a>

            <button @click="copyToClipboard(activeInspectorPin?.pin_id, 'Copied Pin ID: ' + activeInspectorPin?.pin_id)"
                    class="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition flex items-center space-x-1 cursor-pointer"
                    title="Copy Pin ID">
              <i data-lucide="hash" class="w-3 h-3 text-emerald-500"></i>
              <span>Pin ID</span>
            </button>

            <button @click="copyToClipboard('https://www.pinterest.com/pin/' + activeInspectorPin?.pin_id + '/', 'Copied Pinterest URL!')"
                    class="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition flex items-center space-x-1 cursor-pointer"
                    title="Copy URL">
              <i data-lucide="link" class="w-3 h-3 text-blue-500"></i>
              <span>URL</span>
            </button>

            <button @click="copyToClipboard(activeInspectorPin?.title || '', 'Copied Title!')"
                    class="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition flex items-center space-x-1 cursor-pointer"
                    title="Copy Title">
              <i data-lucide="type" class="w-3 h-3 text-purple-500"></i>
              <span>Title</span>
            </button>

            <button @click="copyToClipboard(dossierData?.seo_alt_text || activeInspectorPin?.seo_alt_text || '', 'Copied SEO Alt Text!')"
                    class="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition flex items-center space-x-1 cursor-pointer"
                    title="Copy Alt Text">
              <i data-lucide="file-text" class="w-3 h-3 text-amber-500"></i>
              <span>Alt Text</span>
            </button>

            <a :href="'/pins/' + activeInspectorPin?.pin_id" target="_blank"
               class="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 border border-purple-500/20 transition flex items-center space-x-1 cursor-pointer"
               title="Open Universal Pin Dossier (Level 3)">
              <i data-lucide="sparkles" class="w-3 h-3"></i>
              <span>Full Dossier</span>
            </a>

            <div class="flex items-center space-x-1 border-l border-slate-200 dark:border-slate-800 pl-1.5 ml-1">
              <button @click="prevInspectorPin()" :disabled="activeInspectorPinIndex <= 0"
                      class="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-40 transition cursor-pointer"
                      title="Previous Pin">
                <i data-lucide="chevron-left" class="w-3.5 h-3.5"></i>
              </button>
              <button @click="nextInspectorPin()"
                      class="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition cursor-pointer"
                      title="Next Pin">
                <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>
              </button>
              <a :href="'https://www.pinterest.com/pin/' + activeInspectorPin?.pin_id + '/'" target="_blank"
                 class="p-1.5 rounded-lg bg-rose-500 hover:bg-rose-600 text-white transition flex items-center"
                 title="Open Pin on Pinterest">
                <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
              </a>
              <button @click="closePinInspector()" class="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-white transition cursor-pointer">
                <i data-lucide="x" class="w-4 h-4"></i>
              </button>
            </div>
          </div>

        </div>

        <!-- Drawer Scrollable Body -->
        <div class="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          
          <!-- Large Pin Creative, Dominant Color Accent & Meta -->
          <div class="space-y-3">
            <template x-if="dossierData?.image_url || activeInspectorPin?.image_url">
              <div class="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 max-h-96 flex items-center justify-center bg-slate-100 dark:bg-slate-900 shadow-sm relative">
                <img :src="dossierData?.image_url || activeInspectorPin?.image_url" class="w-full max-h-96 object-contain">
                <template x-if="dossierData?.dominant_color">
                  <div class="absolute bottom-3 right-3 px-2 py-1 rounded-lg bg-black/70 backdrop-blur-xs text-[10px] font-mono text-white flex items-center space-x-1.5">
                    <span class="w-2.5 h-2.5 rounded-full" :style="'background-color: ' + dossierData.dominant_color"></span>
                    <span x-text="dossierData.dominant_color"></span>
                  </div>
                </template>
              </div>
            </template>

            <h3 class="text-base sm:text-lg font-black text-slate-900 dark:text-white leading-snug"
                x-text="dossierData?.title || activeInspectorPin?.title || 'Untitled Pin'"></h3>

            <!-- Creator & Board Attribution Strip -->
            <div class="flex flex-wrap items-center justify-between text-xs text-slate-500 dark:text-slate-400 gap-2 pt-1 font-mono">
              <div class="flex items-center space-x-2">
                <template x-if="activeInspectorPin?.metadata?.pinner?.image_small_url">
                  <img :src="activeInspectorPin.metadata.pinner.image_small_url" class="w-5 h-5 rounded-full object-cover">
                </template>
                <span class="font-bold text-slate-700 dark:text-slate-300"
                      x-text="activeInspectorPin?.metadata?.pinner?.full_name || ('@' + (activeInspectorPin?.metadata?.pinner?.username || 'creator'))"></span>
                <template x-if="activeInspectorPin?.metadata?.board_name">
                  <span class="text-slate-400" x-text="'in ' + activeInspectorPin.metadata.board_name"></span>
                </template>
              </div>

              <template x-if="activeInspectorPin?.domain">
                <a :href="activeInspectorPin.destination_url || '#'" target="_blank"
                   class="text-emerald-600 dark:text-emerald-400 hover:underline flex items-center space-x-1">
                  <i data-lucide="globe" class="w-3 h-3"></i>
                  <span x-text="activeInspectorPin.domain"></span>
                </a>
              </template>
            </div>
          </div>

          <!-- PINTEREST SEO ALT TEXT CONTAINER (Image 2 Exact Parity) -->
          <div class="p-4 rounded-2xl bg-slate-100/90 dark:bg-[#070d18] border border-slate-200 dark:border-slate-800 space-y-2">
            <div class="flex items-center justify-between">
              <div class="flex items-center space-x-1.5">
                <i data-lucide="file-text" class="w-4 h-4 text-amber-500"></i>
                <h4 class="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 font-mono">Pinterest SEO Alt Text</h4>
                <span class="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400">Official Context</span>
              </div>
              <button @click="copyToClipboard(dossierData?.seo_alt_text || activeInspectorPin?.seo_alt_text || '', 'Copied SEO Alt Text!')"
                      class="px-2 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 text-[10px] font-bold transition flex items-center space-x-1 cursor-pointer">
                <i data-lucide="copy" class="w-3 h-3"></i>
                <span>Copy Alt Text</span>
              </button>
            </div>

            <p class="text-xs text-slate-800 dark:text-slate-200 leading-relaxed font-sans bg-white dark:bg-slate-900/60 p-3 rounded-xl border border-slate-200/80 dark:border-slate-800/80"
               x-text="dossierData?.seo_alt_text || activeInspectorPin?.seo_alt_text || (isDossierLoading ? 'Extracting official Pinterest SEO Alt text...' : 'No SEO Alt Text detected for this creative.')"></p>
          </div>

          <!-- ANNOTATIONS & SEO KEYWORDS (Linked Ideas - Image 2 Exact Parity) -->
          <div class="space-y-2.5">
            <div class="flex items-center justify-between">
              <div class="flex items-center space-x-1.5">
                <i data-lucide="tag" class="w-4 h-4 text-purple-500"></i>
                <h4 class="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 font-mono">Annotations & SEO Keywords</h4>
                <span class="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-purple-500/15 text-purple-600 dark:text-purple-400">CV Taxonomy</span>
              </div>
              <button @click="copyAllInspectorTags()"
                      class="px-2.5 py-1 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 text-[11px] font-bold transition flex items-center space-x-1 cursor-pointer">
                <i data-lucide="copy" class="w-3 h-3"></i>
                <span>Copy All</span>
              </button>
            </div>

            <div class="flex flex-wrap gap-1.5">
              <template x-for="tag in getInspectorAnnotations()" :key="tag">
                <button @click="copyToClipboard(tag, 'Copied keyword: ' + tag)"
                        class="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:text-purple-500 transition cursor-pointer flex items-center space-x-1"
                        :title="'Click to copy keyword: ' + tag">
                  <span x-text="tag"></span>
                  <i data-lucide="copy" class="w-2.5 h-2.5 opacity-40"></i>
                </button>
              </template>
            </div>
          </div>

          <!-- 6 KPI CARDS (Image 2 Exact Parity) -->
          <div class="space-y-2">
            <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">Creative Performance KPIs</h4>
            <div class="grid grid-cols-3 sm:grid-cols-6 gap-2">
              
              <!-- Total Saves -->
              <div class="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-center space-y-0.5">
                <span class="text-[10px] font-bold text-slate-400 block">Total Saves</span>
                <span class="text-sm sm:text-base font-black text-rose-600 dark:text-rose-400 font-mono block"
                      x-text="formatNumber(dossierData?.kpis?.total_saves ?? activeInspectorPin?.save_count ?? activeInspectorPin?.metadata?.raw_saves ?? 0)"></span>
                <template x-if="dossierData?.deltas?.saves_24h">
                  <span class="text-[9px] font-bold text-emerald-500 font-mono block" x-text="'+' + dossierData.deltas.saves_24h + ' 24h'"></span>
                </template>
              </div>

              <!-- Repins -->
              <div class="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-center space-y-0.5">
                <span class="text-[10px] font-bold text-slate-400 block">Repins</span>
                <span class="text-sm sm:text-base font-black text-blue-600 dark:text-blue-400 font-mono block"
                      x-text="formatNumber(dossierData?.kpis?.repins ?? activeInspectorPin?.repin_count ?? 0)"></span>
                <template x-if="dossierData?.deltas?.repins_24h">
                  <span class="text-[9px] font-bold text-emerald-500 font-mono block" x-text="'+' + dossierData.deltas.repins_24h + ' 24h'"></span>
                </template>
              </div>

              <!-- Comments -->
              <div class="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-center space-y-0.5">
                <span class="text-[10px] font-bold text-slate-400 block">Comments</span>
                <span class="text-sm sm:text-base font-black text-slate-900 dark:text-white font-mono block"
                      x-text="dossierData?.kpis?.comments ?? activeInspectorPin?.comment_count ?? 0"></span>
              </div>

              <!-- Shares -->
              <div class="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-center space-y-0.5">
                <span class="text-[10px] font-bold text-slate-400 block">Shares</span>
                <span class="text-sm sm:text-base font-black text-slate-900 dark:text-white font-mono block"
                      x-text="formatNumber(dossierData?.kpis?.shares ?? activeInspectorPin?.share_count ?? 0)"></span>
                <template x-if="dossierData?.deltas?.shares_24h">
                  <span class="text-[9px] font-bold text-emerald-500 font-mono block" x-text="'+' + dossierData.deltas.shares_24h + ' 24h'"></span>
                </template>
              </div>

              <!-- Velocity -->
              <div class="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-center space-y-0.5">
                <span class="text-[10px] font-bold text-slate-400 block">Velocity</span>
                <span class="text-sm sm:text-base font-black text-emerald-600 dark:text-emerald-400 font-mono block"
                      x-text="(Number(dossierData?.kpis?.velocity ?? activeInspectorPin?.daily_save_velocity ?? 0) > 0 ? '+' : '') + (dossierData?.kpis?.velocity ?? activeInspectorPin?.daily_save_velocity ?? 0) + ' /d'"></span>
              </div>

              <!-- Reactions -->
              <div class="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-center space-y-0.5">
                <span class="text-[10px] font-bold text-slate-400 block">Reactions</span>
                <span class="text-sm sm:text-base font-black text-rose-500 font-mono block"
                      x-text="formatNumber(dossierData?.kpis?.reactions ?? activeInspectorPin?.reaction_count ?? activeInspectorPin?.metadata?.reactions ?? 0)"></span>
                <template x-if="dossierData?.deltas?.reactions_24h">
                  <span class="text-[9px] font-bold text-emerald-500 font-mono block" x-text="'+' + dossierData.deltas.reactions_24h + ' 24h'"></span>
                </template>
              </div>

            </div>
          </div>

          <!-- PERFORMANCE TRAJECTORY DUAL-LINE SVG (Image 2 Exact Parity) -->
          <div class="p-5 rounded-2xl bg-slate-100/80 dark:bg-[#070d18] border border-slate-200 dark:border-slate-800 space-y-4">
            
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
              <div>
                <div class="flex items-center space-x-2">
                  <i data-lucide="trending-up" class="w-4 h-4 text-emerald-500"></i>
                  <h4 class="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white font-mono">Performance Trajectory</h4>
                </div>
                <p class="text-[11px] text-slate-400">Dual-axis momentum tracking (Saves & Repins over time)</p>
              </div>

              <!-- Range Switcher (7d | 14d | 30d | All) -->
              <div class="flex items-center p-1 rounded-xl bg-slate-200 dark:bg-slate-900 gap-1 self-start sm:self-auto">
                <button @click="changeTrajectoryRange('7d')"
                        class="px-2 py-0.5 rounded-lg text-[10px] font-bold font-mono transition cursor-pointer"
                        :class="trajectoryRange === '7d' ? 'bg-white dark:bg-slate-800 text-emerald-500 shadow-xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'">
                  7d
                </button>
                <button @click="changeTrajectoryRange('14d')"
                        class="px-2 py-0.5 rounded-lg text-[10px] font-bold font-mono transition cursor-pointer"
                        :class="trajectoryRange === '14d' ? 'bg-white dark:bg-slate-800 text-emerald-500 shadow-xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'">
                  14d
                </button>
                <button @click="changeTrajectoryRange('30d')"
                        class="px-2 py-0.5 rounded-lg text-[10px] font-bold font-mono transition cursor-pointer"
                        :class="trajectoryRange === '30d' ? 'bg-white dark:bg-slate-800 text-emerald-500 shadow-xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'">
                  30d
                </button>
                <button @click="changeTrajectoryRange('all')"
                        class="px-2 py-0.5 rounded-lg text-[10px] font-bold font-mono transition cursor-pointer"
                        :class="trajectoryRange === 'all' ? 'bg-white dark:bg-slate-800 text-emerald-500 shadow-xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'">
                  All
                </button>
              </div>
            </div>

            <!-- Trajectory Chart SVG Area -->
            <div class="relative bg-white dark:bg-slate-900/60 p-4 rounded-xl border border-slate-200/80 dark:border-slate-800/80 min-h-[220px] flex items-center justify-center">
              
              <template x-if="isTrajectoryLoading">
                <div class="py-10 text-center space-y-2">
                  <i data-lucide="loader-2" class="w-6 h-6 animate-spin text-emerald-500 mx-auto"></i>
                  <span class="text-xs text-slate-400 font-mono">Calculating trajectory deltas...</span>
                </div>
              </template>

              <template x-if="!isTrajectoryLoading && (!trajectoryData?.snapshots || trajectoryData.snapshots.length === 0)">
                <div class="py-10 text-center text-xs text-slate-400 font-mono">
                  No snapshot history recorded yet for this pin.
                </div>
              </template>

              <!-- N=1 Single Baseline Dot -->
              <template x-if="!isTrajectoryLoading && trajectoryData?.snapshots && trajectoryData.snapshots.length === 1">
                <div class="text-center py-6 space-y-2">
                  <div class="w-4 h-4 rounded-full bg-emerald-500 mx-auto shadow-md shadow-emerald-500/30"></div>
                  <p class="text-xs font-bold text-slate-700 dark:text-slate-300 font-mono">Baseline Recorded</p>
                  <p class="text-[11px] text-slate-400 font-mono">Growth plots will render on the next scheduled crawl cycle.</p>
                </div>
              </template>

              <!-- N >= 2 Dual-Axis Normalized SVG Chart -->
              <template x-if="!isTrajectoryLoading && trajectoryData?.snapshots && trajectoryData.snapshots.length >= 2">
                <div class="w-full space-y-2">
                  <div class="flex items-center justify-between text-[10px] font-mono px-1">
                    <span class="text-rose-500 font-bold">● Saves (Red Scale: 0 to <span x-text="formatNumber(getTrajectoryDualSvg(trajectoryData.snapshots, 600, 200).savesMax)"></span>)</span>
                    <span class="text-blue-500 font-bold">● Repins (Blue Scale: 0 to <span x-text="formatNumber(getTrajectoryDualSvg(trajectoryData.snapshots, 600, 200).repinsMax)"></span>)</span>
                  </div>

                  <svg class="w-full h-48 overflow-visible" viewBox="0 0 600 200" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="savesTrajectoryGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="#f43f5e" stop-opacity="0.35"/>
                        <stop offset="100%" stop-color="#f43f5e" stop-opacity="0.0"/>
                      </linearGradient>
                    </defs>

                    <!-- Gridlines -->
                    <line x1="0" y1="40" x2="600" y2="40" stroke="#334155" stroke-dasharray="3" stroke-width="0.8" opacity="0.3"/>
                    <line x1="0" y1="100" x2="600" y2="100" stroke="#334155" stroke-dasharray="3" stroke-width="0.8" opacity="0.3"/>
                    <line x1="0" y1="160" x2="600" y2="160" stroke="#334155" stroke-dasharray="3" stroke-width="0.8" opacity="0.3"/>

                    <!-- Saves Area & Line (Red) -->
                    <path :d="getTrajectoryDualSvg(trajectoryData.snapshots, 600, 200).savesArea" fill="url(#savesTrajectoryGrad)"/>
                    <path :d="getTrajectoryDualSvg(trajectoryData.snapshots, 600, 200).savesLine" fill="none" stroke="#f43f5e" stroke-width="2.5" stroke-linecap="round"/>

                    <!-- Repins Line (Blue) -->
                    <path :d="getTrajectoryDualSvg(trajectoryData.snapshots, 600, 200).repinsLine" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round"/>
                  </svg>
                </div>
              </template>

            </div>

            <!-- Historical Net Growth Summary Table (Image 2 Parity) -->
            <template x-if="trajectoryData?.net_growth">
              <div class="p-3 rounded-xl bg-white dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800/80">
                <div class="flex items-center justify-between text-xs font-mono">
                  <span class="font-bold text-slate-700 dark:text-slate-300">Σ Total Net Growth:</span>
                  <div class="flex items-center space-x-3 text-[11px]">
                    <span :class="trajectoryData.net_growth.saves >= 0 ? 'text-rose-500 font-bold' : 'text-rose-400/80 font-bold'"
                          x-text="(trajectoryData.net_growth.saves >= 0 ? '+' : '-') + formatNumber(Math.abs(trajectoryData.net_growth.saves)) + ' Saves'"></span>
                    <span :class="trajectoryData.net_growth.repins >= 0 ? 'text-blue-500 font-bold' : 'text-blue-400/80 font-bold'"
                          x-text="(trajectoryData.net_growth.repins >= 0 ? '+' : '-') + formatNumber(Math.abs(trajectoryData.net_growth.repins)) + ' Repins'"></span>
                    <span class="text-slate-400" x-text="(trajectoryData.net_growth.comments >= 0 ? '+' : '-') + Math.abs(trajectoryData.net_growth.comments) + ' Comments'"></span>
                    <span class="text-slate-400" x-text="(trajectoryData.net_growth.shares >= 0 ? '+' : '-') + Math.abs(trajectoryData.net_growth.shares) + ' Shares'"></span>
                  </div>
                </div>
              </div>
            </template>

          </div>

          <!-- Bottom Visual Lens Launch -->
          <div class="pt-2">
            <button @click="openVisualLens(activeInspectorPin)"
                    class="w-full py-3 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-black uppercase tracking-wider transition flex items-center justify-center space-x-2 shadow-md shadow-purple-950/20 cursor-pointer">
              <i data-lucide="camera" class="w-4 h-4"></i>
              <span>Launch Visual Similarity Lens (Scan Clones)</span>
            </button>
          </div>

        </div>

      </div>
    </div>
  </div>

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

  <!-- SLIDE-OVER DRAWER: CAMPAIGN FOLDERS MANAGER -->
  <div x-show="isFolderManagerOpen" x-cloak class="relative z-50">
    <div x-show="isFolderManagerOpen"
         x-transition:enter="transition-opacity ease-linear duration-300"
         x-transition:enter-start="opacity-0"
         x-transition:enter-end="opacity-100"
         x-transition:leave="transition-opacity ease-linear duration-300"
         x-transition:leave-start="opacity-100"
         x-transition:leave-end="opacity-0"
         @click="isFolderManagerOpen = false"
         class="fixed inset-0 bg-slate-950/70 backdrop-blur-xs"></div>

    <div class="fixed inset-y-0 right-0 max-w-full flex pl-10">
      <div x-show="isFolderManagerOpen"
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
            <div class="w-8 h-8 rounded-xl bg-pink-500/10 text-pink-500 flex items-center justify-center">
              <i data-lucide="folder-kanban" class="w-4 h-4"></i>
            </div>
            <div>
              <h3 class="text-sm font-black text-slate-900 dark:text-white">Campaign Folders</h3>
              <p class="text-[11px] text-slate-400 font-mono" x-text="folders.length + ' Topic Clusters'"></p>
            </div>
          </div>
          <button @click="isFolderManagerOpen = false" class="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-white transition cursor-pointer">
            <i data-lucide="x" class="w-4 h-4"></i>
          </button>
        </div>

        <!-- Create Button -->
        <div class="p-4 border-b border-slate-100 dark:border-slate-800/80">
          <button @click="openCreateFolderModal()"
                  class="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-pink-600 hover:bg-pink-500 text-white transition flex items-center justify-center space-x-2 shadow-sm cursor-pointer">
            <i data-lucide="plus" class="w-4 h-4"></i>
            <span>Create New Campaign Folder</span>
          </button>
        </div>

        <!-- Folders List -->
        <div class="p-4 flex-1 overflow-y-auto space-y-2.5">
          <template x-for="f in folders" :key="f.id">
            <div class="p-4 rounded-2xl border transition group"
                 :class="activeFolder?.id === f.id ? 'bg-pink-500/10 border-pink-500/40 shadow-xs' : 'bg-slate-50/70 dark:bg-slate-900/40 border-slate-200/80 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700'">
              
              <div class="flex items-start justify-between gap-2">
                <div class="flex items-center space-x-2.5 min-w-0">
                  <span class="w-3.5 h-3.5 rounded-full shrink-0" :style="'background-color: ' + (f.color || '#ec4899')"></span>
                  <div class="min-w-0">
                    <h4 class="text-xs font-bold text-slate-900 dark:text-white truncate" x-text="f.name"></h4>
                    <p class="text-[10px] text-slate-400 font-mono" x-text="(f.keyword_count || 0) + ' Keywords in Cluster'"></p>
                  </div>
                </div>

                <div class="flex items-center space-x-1 shrink-0">
                  <button @click="selectFolder(f); isFolderManagerOpen = false; activeTab = 'crossover'"
                          class="px-2.5 py-1 rounded-lg bg-pink-500/10 hover:bg-pink-500/20 text-pink-600 dark:text-pink-400 text-[10px] font-bold font-mono transition cursor-pointer">
                    View Matrix
                  </button>
                  <button @click="deleteCampaignFolder(f.id)"
                          class="p-1 rounded-lg hover:bg-rose-500/10 text-slate-400 hover:text-rose-500 transition cursor-pointer">
                    <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                  </button>
                </div>
              </div>

              <template x-if="f.description">
                <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-2 line-clamp-2" x-text="f.description"></p>
              </template>

              <!-- Keywords Preview Chips -->
              <template x-if="f.keywords_preview && f.keywords_preview.length > 0">
                <div class="mt-2.5 pt-2 border-t border-slate-200/60 dark:border-slate-800/60 flex flex-wrap gap-1">
                  <template x-for="kw in f.keywords_preview.slice(0, 4)" :key="kw.id">
                    <span class="px-2 py-0.5 rounded text-[9px] font-mono font-semibold bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                          x-text="kw.keyword"></span>
                  </template>
                  <template x-if="f.keywords_preview.length > 4">
                    <span class="text-[9px] font-mono text-slate-400 self-center" x-text="'+' + (f.keywords_preview.length - 4) + ' more'"></span>
                  </template>
                </div>
              </template>

            </div>
          </template>

          <template x-if="folders.length === 0">
            <div class="py-12 text-center text-xs text-slate-400 italic">
              No campaign folders created yet. Click "+ Create New Campaign Folder" above to start!
            </div>
          </template>
        </div>

      </div>
    </div>
  </div>

  <!-- MODAL: CREATE / EDIT CAMPAIGN FOLDER -->
  <div x-show="isCreateFolderModalOpen" x-cloak class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div x-show="isCreateFolderModalOpen"
         x-transition:enter="transition-opacity ease-linear duration-200"
         x-transition:enter-start="opacity-0"
         x-transition:enter-end="opacity-100"
         x-transition:leave="transition-opacity ease-linear duration-200"
         x-transition:leave-start="opacity-100"
         x-transition:leave-end="opacity-0"
         @click="isCreateFolderModalOpen = false"
         class="fixed inset-0 bg-slate-950/70 backdrop-blur-xs"></div>

    <div x-show="isCreateFolderModalOpen"
         x-transition:enter="transition ease-out duration-200"
         x-transition:enter-start="opacity-0 scale-95"
         x-transition:enter-end="opacity-100 scale-100"
         x-transition:leave="transition ease-in duration-150"
         x-transition:leave-start="opacity-100 scale-100"
         x-transition:leave-end="opacity-0 scale-95"
         class="relative w-full max-w-md bg-white dark:bg-[#0c1322] border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl p-6 space-y-4 z-10">
      
      <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
        <div class="flex items-center space-x-2">
          <i data-lucide="folder-plus" class="w-4 h-4 text-pink-500"></i>
          <h3 class="text-sm font-black text-slate-900 dark:text-white">Create Campaign Folder</h3>
        </div>
        <button @click="isCreateFolderModalOpen = false" class="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>

      <div class="space-y-3 text-xs">
        <div>
          <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Folder Name *</label>
          <input type="text" x-model="newFolder.name" placeholder="e.g. Autumn Casseroles & Dinners"
                 class="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-pink-500/40">
        </div>

        <div>
          <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Description (Optional)</label>
          <textarea x-model="newFolder.description" rows="2" placeholder="Campaign niche focus, monetization angle or content objective..."
                    class="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-pink-500/40"></textarea>
        </div>

        <div>
          <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">Color Tag</label>
          <div class="flex items-center space-x-2">
            <template x-for="c in ['#ec4899', '#8b5cf6', '#3b82f6', '#06b6d4', '#10b981', '#f59e0b', '#f43f5e']" :key="c">
              <button type="button" @click="newFolder.color = c"
                      class="w-6 h-6 rounded-full transition transform hover:scale-110 flex items-center justify-center cursor-pointer border"
                      :class="newFolder.color === c ? 'ring-2 ring-offset-2 ring-pink-500 dark:ring-offset-[#0c1322] border-white' : 'border-transparent'"
                      :style="'background-color: ' + c">
                <i x-show="newFolder.color === c" data-lucide="check" class="w-3 h-3 text-white"></i>
              </button>
            </template>
          </div>
        </div>
      </div>

      <div class="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100 dark:border-slate-800">
        <button @click="isCreateFolderModalOpen = false"
                class="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
          Cancel
        </button>
        <button @click="saveNewCampaignFolder()"
                :disabled="!newFolder.name?.trim()"
                class="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-pink-600 hover:bg-pink-500 text-white transition shadow-sm disabled:opacity-50 cursor-pointer">
          Create Folder
        </button>
      </div>

    </div>
  </div>

  <!-- MODAL: ADD / SELECT KEYWORDS IN ACTIVE FOLDER -->
  <div x-show="isAddKeywordsModalOpen" x-cloak class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div x-show="isAddKeywordsModalOpen"
         x-transition:enter="transition-opacity ease-linear duration-200"
         x-transition:enter-start="opacity-0"
         x-transition:enter-end="opacity-100"
         x-transition:leave="transition-opacity ease-linear duration-200"
         x-transition:leave-start="opacity-100"
         x-transition:leave-end="opacity-0"
         @click="isAddKeywordsModalOpen = false"
         class="fixed inset-0 bg-slate-950/70 backdrop-blur-xs"></div>

    <div x-show="isAddKeywordsModalOpen"
         x-transition:enter="transition ease-out duration-200"
         x-transition:enter-start="opacity-0 scale-95"
         x-transition:enter-end="opacity-100 scale-100"
         x-transition:leave="transition ease-in duration-150"
         x-transition:leave-start="opacity-100 scale-100"
         x-transition:leave-end="opacity-0 scale-95"
         class="relative w-full max-w-lg bg-white dark:bg-[#0c1322] border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl p-6 space-y-4 z-10 max-h-[85vh] flex flex-col">
      
      <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
        <div class="flex items-center space-x-2">
          <i data-lucide="plus-circle" class="w-4 h-4 text-pink-500"></i>
          <div>
            <h3 class="text-sm font-black text-slate-900 dark:text-white" x-text="'Add Keywords to ' + (activeFolder?.name || 'Folder')"></h3>
            <p class="text-[10px] text-slate-400 font-mono">Select search queries to include in this crossover cluster</p>
          </div>
        </div>
        <button @click="isAddKeywordsModalOpen = false" class="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>

      <!-- Filter Input -->
      <div class="shrink-0">
        <input type="text" x-model="folderKeywordSearch" placeholder="Filter tracked keywords..."
               class="w-full px-3 py-2 rounded-xl text-xs bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-pink-500/40">
      </div>

      <!-- Keywords Checkbox List -->
      <div class="flex-1 overflow-y-auto space-y-1.5 p-1">
        <template x-for="kw in selectableKeywordsForFolder" :key="kw.id">
          <div @click="toggleKeywordSelection(kw.id)"
               class="p-2.5 rounded-xl border transition flex items-center justify-between cursor-pointer text-xs"
               :class="isKeywordSelected(kw.id) ? 'bg-pink-500/10 border-pink-500/40' : 'bg-slate-50/70 dark:bg-slate-900/40 border-slate-200/80 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700'">
            <div class="flex items-center space-x-2.5 min-w-0">
              <input type="checkbox" :checked="isKeywordSelected(kw.id)" @click.stop="toggleKeywordSelection(kw.id)"
                     class="w-4 h-4 rounded text-pink-600 focus:ring-pink-500 border-slate-300 dark:border-slate-700">
              <div class="min-w-0">
                <span class="font-bold text-slate-900 dark:text-white capitalize truncate block" x-text="kw.keyword"></span>
                <span class="text-[10px] text-slate-400 font-mono" x-text="kw.category || 'General'"></span>
              </div>
            </div>
            <span class="text-[10px] font-mono font-bold text-slate-500" x-text="Number(kw.avg_daily_velocity || 0) + ' v/d'"></span>
          </div>
        </template>
      </div>

      <!-- Modal Footer -->
      <div class="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 shrink-0">
        <span class="text-xs font-mono text-slate-400" x-text="selectedFolderKeywordIds.length + ' Keywords Selected'"></span>
        <div class="flex items-center space-x-2">
          <button @click="isAddKeywordsModalOpen = false" class="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
            Cancel
          </button>
          <button @click="commitFolderKeywords()" class="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-pink-600 hover:bg-pink-500 text-white transition shadow-sm cursor-pointer">
            Save Cluster
          </button>
        </div>
      </div>

    </div>
  </div>

  <script>
    function keywordStudio() {
      return {
        viewModeLevel: (window.__INITIAL_KEYWORD_SLUG__ && window.__INITIAL_KEYWORD_SLUG__.trim()) ? 'serp_studio' : 'dashboard',
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

        // Level 1A Dashboard State & Bulk Selection
        selectedKeywordIds: [],
        dashboardSearch: '',
        dashboardCategoryFilter: 'ALL',
        dashboardStatusFilter: 'ALL',
        dashboardSort: 'velocity',
        isBulkFolderModalOpen: false,
        bulkTargetFolderId: '',
        isBulkLoading: false,
        isKeywordsLoading: false,
        isQuickTrackModalOpen: false,
        quickKeywordInput: '',
        quickKeywordCategory: 'General',

        // Dual-Scope Switcher State (Active SERP Top 100 vs All Vault Pins)
        serpScope: 'active', // 'active' | 'vault'

        // Pin Detail Slide-Over Inspector State (PinClicks Parity)
        isPinDrawerOpen: false,
        activeInspectorPin: null,
        activeInspectorPinIndex: 0,

        // Growth Pace & View Mode Toggle (Image 1 Parity)
        growthPaceFilter: '24h', // '24h' | '3d' | '7d' | 'all'
        viewMode: 'table', // 'table' | 'cards'
        selectedPinIds: [],

        // Displaced Pins Vault State (Phase 3 & 4)
        displacedPins: [],
        displacedPinsTotal: 0,
        displacedStatusFilter: 'ALL',
        isDisplacedLoading: false,

        // Pin Deep Dossier & Performance Trajectory State (Image 2 Parity)
        dossierData: null,
        isDossierLoading: false,
        trajectoryRange: '30d', // '7d' | '14d' | '30d' | 'all'
        trajectoryData: null,
        isTrajectoryLoading: false,

        // Pinterest Trends 52-Week Parity State
        trendsData: null,
        isTrendsLoading: false,

        // Concurrency & Race-Condition Hardening (Inspector & Details)
        detailRequestId: 0,
        detailAbortController: null,
        activePinRequestId: 0,
        pinInspectorAbortController: null,

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

        // UI Tabs & State
        activeTab: 'serp',
        popularPinsView: 'full',
        selectedProjectId: '',
        fleetProjects: [],
        darkMode: true,
        toast: { show: false, message: '', type: 'info' },

        // Campaign Folders & Crossover Engine State
        folders: [],
        activeFolder: null,
        crossoverData: null,
        isCrossoverLoading: false,
        currentKeywordFolders: [],
        isFolderManagerOpen: false,
        isCreateFolderModalOpen: false,
        isAddKeywordsModalOpen: false,
        newFolder: { name: '', description: '', color: '#ec4899' },
        folderKeywordSearch: '',
        selectedFolderKeywordIds: [],

        // Pin Table Filter & Sort Controls
        serpScope: 'all',
        activeVisualTagFilter: '',
        pinSearch: '',
        formatFilter: 'ALL',
        pinSort: 'rank',
        expandedPinTags: {},

        togglePinTags(pinId) {
          this.expandedPinTags = {
            ...this.expandedPinTags,
            [pinId]: !this.expandedPinTags[pinId]
          };
          this.$nextTick(() => { lucide.createIcons(); });
        },

        isPinTagsExpanded(pinId) {
          return Boolean(this.expandedPinTags[pinId]);
        },

        openQuickTrackModal() {
          this.quickKeywordInput = '';
          this.quickKeywordCategory = 'General';
          this.isQuickTrackModalOpen = true;
          this.$nextTick(() => { lucide.createIcons(); });
        },

        async quickTrackKeyword(term) {
          this.quickKeywordInput = term;
          await this.submitQuickKeyword();
        },

        async submitQuickKeyword() {
          const term = (this.quickKeywordInput || '').trim();
          if (!term) return;
          this.isQuickTrackModalOpen = false;
          this.showToast('Loading "' + term + '" into SERP Studio...', 'info');
          await this.loadKeywordBySlugOrText(term, true);
        },

        get activeSlug() {
          const raw = this.selectedKeyword?.keyword || this.activeKeywordQuery || '';
          return raw.trim().toLowerCase().replace(/\\s+/g, '-');
        },

        get omnibarTrackedMatches() {
          if (!this.omnibarQuery.trim()) return [];
          const q = this.omnibarQuery.toLowerCase().trim();
          return this.keywords.filter(k => k.keyword.toLowerCase().includes(q)).slice(0, 5);
        },

        get selectableKeywordsForFolder() {
          if (!this.folderKeywordSearch || !this.folderKeywordSearch.trim()) return this.keywords;
          const q = this.folderKeywordSearch.toLowerCase().trim();
          return this.keywords.filter(k => (k.keyword || '').toLowerCase().includes(q) || (k.category || '').toLowerCase().includes(q));
        },

        get filteredDashboardKeywords() {
          let list = this.keywords || [];
          if (this.dashboardStatusFilter === 'ACTIVE') {
            list = list.filter(k => k.is_active !== false);
          } else if (this.dashboardStatusFilter === 'PAUSED') {
            list = list.filter(k => k.is_active === false);
          }
          if (this.dashboardCategoryFilter && this.dashboardCategoryFilter !== 'ALL') {
            list = list.filter(k => (k.category || 'General').toLowerCase() === this.dashboardCategoryFilter.toLowerCase());
          }
          if (this.dashboardSearch && this.dashboardSearch.trim()) {
            const q = this.dashboardSearch.toLowerCase().trim();
            list = list.filter(k => 
              (k.keyword || '').toLowerCase().includes(q) ||
              (k.category || '').toLowerCase().includes(q)
            );
          }
          if (this.dashboardSort === 'velocity') {
            return [...list].sort((a, b) => Number(b.avg_daily_velocity || 0) - Number(a.avg_daily_velocity || 0));
          } else if (this.dashboardSort === 'saves_delta') {
            return [...list].sort((a, b) => this.getKeywordSaveDelta(b) - this.getKeywordSaveDelta(a));
          } else if (this.dashboardSort === 'repins_delta') {
            return [...list].sort((a, b) => this.getKeywordRepinDelta(b) - this.getKeywordRepinDelta(a));
          } else if (this.dashboardSort === 'name') {
            return [...list].sort((a, b) => (a.keyword || '').localeCompare(b.keyword || ''));
          } else if (this.dashboardSort === 'crawled') {
            return [...list].sort((a, b) => new Date(b.last_crawled_at || 0) - new Date(a.last_crawled_at || 0));
          }
          return list;
        },

        get activeKeywordsCount() {
          return (this.keywords || []).filter(k => k.is_active !== false).length;
        },

        get pausedKeywordsCount() {
          return (this.keywords || []).filter(k => k.is_active === false).length;
        },

        get totalMonitoredPins() {
          return (this.keywords || []).reduce((acc, k) => acc + (Number(k.snapshots_count) || 100), 0);
        },

        get averageFleetVelocity() {
          const active = (this.keywords || []).filter(k => k.is_active !== false);
          if (active.length === 0) return 0;
          const total = active.reduce((acc, k) => acc + Number(k.avg_daily_velocity || 0), 0);
          return Number((total / active.length).toFixed(1));
        },

        get uniqueCategories() {
          const cats = new Set((this.keywords || []).map(k => k.category || 'General').filter(Boolean));
          return Array.from(cats).sort();
        },

        get nightlySyncCountdown() {
          const now = new Date();
          const next = new Date(now);
          next.setUTCHours(2, 0, 0, 0);
          if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
          const diffMs = next.getTime() - now.getTime();
          const hours = Math.floor(diffMs / 3600000);
          const mins = Math.floor((diffMs % 3600000) / 60000);
          return 'Next Batch at 02:00 UTC (~' + hours + 'h ' + mins + 'm)';
        },

        getKeywordSaveDelta(kw) {
          if (!kw) return 0;
          let val = 0;
          if (kw.saves_delta_24h !== undefined && kw.saves_delta_24h !== null) val = Number(kw.saves_delta_24h);
          else if (kw.metadata?.deltas?.saves_24h !== undefined) val = Number(kw.metadata.deltas.saves_24h);
          else val = Number(kw.avg_daily_velocity || 0);
          return Number.isFinite(val) ? val : 0;
        },

        getKeywordRepinDelta(kw) {
          if (!kw) return 0;
          let val = 0;
          if (kw.repins_delta_24h !== undefined && kw.repins_delta_24h !== null) val = Number(kw.repins_delta_24h);
          else if (kw.metadata?.deltas?.repins_24h !== undefined) val = Number(kw.metadata.deltas.repins_24h);
          else val = Math.round(Number(kw.avg_daily_velocity || 0) * 0.15);
          return Number.isFinite(val) ? val : 0;
        },

        get filteredDisplacedPins() {
          let list = this.displacedPins || [];
          if (this.displacedStatusFilter && this.displacedStatusFilter !== 'ALL') {
            list = list.filter(p => p.status === this.displacedStatusFilter);
          }
          if (this.pinSearch && this.pinSearch.trim()) {
            const q = this.pinSearch.toLowerCase().trim();
            list = list.filter(p => 
              (p.title || '').toLowerCase().includes(q) ||
              (p.domain || '').toLowerCase().includes(q)
            );
          }
          if (this.pinSort === 'velocity') {
            return [...list].sort((a, b) => Number(b.daily_save_velocity || 0) - Number(a.daily_save_velocity || 0));
          } else if (this.pinSort === 'saves') {
            return [...list].sort((a, b) => Number(b.save_count || 0) - Number(a.save_count || 0));
          } else if (this.pinSort === 'age') {
            return [...list].sort((a, b) => new Date(b.displaced_date || 0) - new Date(a.displaced_date || 0));
          }
          return [...list].sort((a, b) => Number(b.vacuum_opportunity_score || 0) - Number(a.vacuum_opportunity_score || 0));
        },

        get allCombinedPins() {
          const currentPins = (this.selectedKeywordDetails?.current_pins || []).map(p => ({
            ...p,
            is_displaced: false
          }));
          const currentPinIds = new Set(currentPins.map(p => p.pin_id));
          const vaultPins = (this.displacedVaultPins || []).filter(p => !currentPinIds.has(p.pin_id));
          return [...currentPins, ...vaultPins];
        },

        get displacedVaultPins() {
          const droppedFromDetails = (this.selectedKeywordDetails?.dropped_out_pins || []).map(p => ({
            ...p,
            is_displaced: true,
            rank_position: p.last_known_rank || p.rank_position || 101,
            save_count: p.current_saves ?? p.save_count ?? 0,
            repin_count: p.current_repins ?? p.repin_count ?? 0,
            comment_count: p.current_comments ?? p.comment_count ?? 0
          }));
          const fetchedDisplaced = (this.displacedPins || []).map(p => ({
            ...p,
            is_displaced: true,
            rank_position: p.last_known_rank || p.rank_position || 101,
            save_count: p.current_saves ?? p.save_count ?? 0,
            repin_count: p.current_repins ?? p.repin_count ?? 0,
            comment_count: p.current_comments ?? p.comment_count ?? 0
          }));
          const map = new Map();
          for (const p of [...droppedFromDetails, ...fetchedDisplaced]) {
            if (p && p.pin_id && !map.has(p.pin_id)) {
              map.set(p.pin_id, p);
            }
          }
          return Array.from(map.values());
        },

        getPinVisualTags(pin) {
          if (!pin) return [];
          const raw = pin.metadata?.visual_annotations || pin.annotations || pin.visual_annotations || [];
          return (raw || []).map(t => {
            if (typeof t === 'string') return t.trim();
            if (t && typeof t === 'object') return (t.name || t.label || t.term || t.title || '').trim();
            return String(t || '').trim();
          }).filter(s => s && s.length >= 2);
        },

        filterByVisualTag(tag) {
          if (!tag) return;
          const clean = (typeof tag === 'string' ? tag : (tag.name || tag.label || tag.term || '')).trim().toLowerCase();
          if (this.activeVisualTagFilter === clean) {
            this.activeVisualTagFilter = '';
          } else {
            this.activeVisualTagFilter = clean;
            this.serpScope = 'all';
          }
          this.$nextTick(() => { lucide.createIcons(); });
        },

        get filteredPins() {
          let list = [];
          if (this.serpScope === 'active') {
            list = (this.selectedKeywordDetails?.current_pins || []).map(p => ({ ...p, is_displaced: false }));
          } else if (this.serpScope === 'vault') {
            list = this.displacedVaultPins;
          } else if (this.serpScope === 'velocity') {
            list = this.allCombinedPins.filter(p => Number(p.daily_save_velocity || 0) > 0);
          } else {
            list = this.allCombinedPins;
          }

          if (this.activeVisualTagFilter) {
            const vtag = this.activeVisualTagFilter.toLowerCase().trim();
            list = list.filter(p => {
              const tags = this.getPinVisualTags(p).map(t => t.toLowerCase());
              return tags.includes(vtag);
            });
          }

          if (this.formatFilter && this.formatFilter !== 'ALL') {
            list = list.filter(p => (p.metadata?.format || p.format || 'ORGANIC PIN') === this.formatFilter);
          }

          if (this.pinSearch && this.pinSearch.trim()) {
            const q = this.pinSearch.toLowerCase().trim();
            list = list.filter(p => 
              (p.title || '').toLowerCase().includes(q) ||
              (p.domain || '').toLowerCase().includes(q) ||
              (p.metadata?.pinner?.username || '').toLowerCase().includes(q) ||
              (p.metadata?.pinner?.full_name || '').toLowerCase().includes(q) ||
              this.getPinVisualTags(p).some(t => t.toLowerCase().includes(q))
            );
          }

          if (this.pinSort === 'velocity') {
            return [...list].sort((a, b) => Number(b.daily_save_velocity || 0) - Number(a.daily_save_velocity || 0));
          } else if (this.pinSort === 'saves') {
            return [...list].sort((a, b) => {
              const aEngage = Number(a.metadata?.raw_saves || a.save_count || a.current_saves || 0);
              const bEngage = Number(b.metadata?.raw_saves || b.save_count || b.current_saves || 0);
              return bEngage - aEngage;
            });
          } else if (this.pinSort === 'age') {
            return [...list].sort((a, b) => Number(a.metadata?.pin_age_days || 9999) - Number(b.metadata?.pin_age_days || 9999));
          }

          return [...list].sort((a, b) => {
            if (a.is_displaced && !b.is_displaced) return 1;
            if (!a.is_displaced && b.is_displaced) return -1;
            return Number(a.rank_position || a.last_known_rank || 999) - Number(b.rank_position || b.last_known_rank || 999);
          });
        },

        init() {
          this.selectedProjectId = ''; // Keywords & SERP studio strictly bind to Central Metadata Hub
          this.darkMode = localStorage.getItem('pa_theme') !== 'light';
          this.applyTheme();
          this.fetchFleetProjects();

          window.addEventListener('popstate', (e) => {
            const path = window.location.pathname || '';
            if (path === '/keywords' || path === '/keywords/') {
              this.viewModeLevel = 'dashboard';
              this.$nextTick(() => { lucide.createIcons(); });
            } else {
              const pathSlug = this.extractSlugFromUrl();
              if (pathSlug) {
                this.viewModeLevel = 'serp_studio';
                this.loadKeywordBySlugOrText(pathSlug, false);
              }
            }
          });

          const urlSlug = this.extractSlugFromUrl() || window.__INITIAL_KEYWORD_SLUG__ || '';
          
          if (urlSlug) {
            this.viewModeLevel = 'serp_studio';
            this.loadKeywordBySlugOrText(urlSlug, false);
          } else {
            this.viewModeLevel = 'dashboard';
          }

          this.fetchKeywords();
          this.fetchFolders();

          this.$watch('keywordSearch', () => this.filterKeywords());
          this.$nextTick(() => { lucide.createIcons(); });
        },

        switchToDashboard() {
          this.viewModeLevel = 'dashboard';
          window.history.pushState(null, '', '/keywords');
          this.$nextTick(() => { lucide.createIcons(); });
        },

        switchToSerpStudio(kw) {
          this.viewModeLevel = 'serp_studio';
          if (kw) {
            this.selectKeyword(kw, true);
          }
          this.$nextTick(() => { lucide.createIcons(); });
        },

        toggleDashboardKeywordSelection(kwId) {
          if (this.selectedKeywordIds.includes(kwId)) {
            this.selectedKeywordIds = this.selectedKeywordIds.filter(id => id !== kwId);
          } else {
            this.selectedKeywordIds.push(kwId);
          }
        },

        toggleSelectAllDashboardKeywords() {
          const list = this.filteredDashboardKeywords;
          if (this.selectedKeywordIds.length === list.length && list.length > 0) {
            this.selectedKeywordIds = [];
          } else {
            this.selectedKeywordIds = list.map(k => k.id);
          }
        },

        isDashboardKeywordSelected(kwId) {
          return this.selectedKeywordIds.includes(kwId);
        },

        clearSelectedKeywords() {
          this.selectedKeywordIds = [];
        },

        async bulkSyncKeywords() {
          if (this.selectedKeywordIds.length === 0) return;
          this.isBulkLoading = true;
          this.showToast('Initiating refresh for ' + this.selectedKeywordIds.length + ' keywords...', 'info');
          try {
            await Promise.allSettled(this.selectedKeywordIds.map(id => 
              fetch(this.getApiUrl('/api/keywords/sync'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ keyword_id: id, force: true })
              })
            ));
            this.showToast('Refreshed ' + this.selectedKeywordIds.length + ' keywords!', 'success');
            await this.fetchKeywords();
          } catch (err) {
            this.showToast('Bulk refresh error: ' + err.message, 'error');
          } finally {
            this.isBulkLoading = false;
            this.selectedKeywordIds = [];
          }
        },

        async bulkToggleKeywordStatus(targetStatus) {
          if (this.selectedKeywordIds.length === 0) return;
          this.isBulkLoading = true;
          try {
            const res = await fetch(this.getApiUrl('/api/keywords/status'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ids: this.selectedKeywordIds, is_active: targetStatus })
            });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            this.showToast('Updated status for ' + this.selectedKeywordIds.length + ' keywords.', 'success');
            await this.fetchKeywords();
          } catch (err) {
            this.showToast('Bulk status update error: ' + err.message, 'error');
          } finally {
            this.isBulkLoading = false;
            this.selectedKeywordIds = [];
          }
        },

        async bulkDeleteKeywords() {
          if (this.selectedKeywordIds.length === 0) return;
          if (!confirm('Are you sure you want to delete ' + this.selectedKeywordIds.length + ' tracked keywords?')) return;
          this.isBulkLoading = true;
          try {
            const res = await fetch(this.getApiUrl('/api/keywords'), {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ids: this.selectedKeywordIds })
            });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            this.showToast('Deleted ' + this.selectedKeywordIds.length + ' keywords.', 'info');
            await this.fetchKeywords();
          } catch (err) {
            this.showToast('Bulk delete error: ' + err.message, 'error');
          } finally {
            this.isBulkLoading = false;
            this.selectedKeywordIds = [];
          }
        },

        openBulkFolderModal() {
          if (this.selectedKeywordIds.length === 0) return;
          this.bulkTargetFolderId = this.folders[0]?.id || '';
          this.isBulkFolderModalOpen = true;
        },

        async commitBulkFolder() {
          if (!this.bulkTargetFolderId || this.selectedKeywordIds.length === 0) return;
          this.isBulkLoading = true;
          try {
            const res = await fetch(this.getApiUrl('/api/keywords/folders/items'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                folder_id: this.bulkTargetFolderId,
                keyword_ids: this.selectedKeywordIds
              })
            });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            this.showToast('Added ' + this.selectedKeywordIds.length + ' keywords to campaign folder!', 'success');
            this.isBulkFolderModalOpen = false;
            await this.fetchFolders();
          } catch (err) {
            this.showToast('Bulk folder error: ' + err.message, 'error');
          } finally {
            this.isBulkLoading = false;
            this.selectedKeywordIds = [];
          }
        },

        async toggleKeywordStatus(kw) {
          if (!kw?.id) return;
          const newStatus = !(kw.is_active !== false);
          try {
            const res = await fetch(this.getApiUrl('/api/keywords/status'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: kw.id, is_active: newStatus })
            });
            if (res.ok) {
              kw.is_active = newStatus;
              this.showToast('Keyword "' + kw.keyword + '" is now ' + (newStatus ? 'Active' : 'Paused') + '.', 'info');
            }
          } catch (err) {
            this.showToast('Failed to update status: ' + err.message, 'error');
          }
        },

        computeSerpPowerPairs() {
          const pins = this.filteredPins || [];
          if (pins.length === 0) return [];
          
          const tagCounts = new Map();
          const pairCounts = new Map();
          let validPinCount = 0;

          for (const pin of pins) {
            const rawTags = this.getPinVisualTags(pin).map(s => s.toLowerCase());

            const uniqueTags = Array.from(new Set(rawTags));
            // Combinatorial guardrail: strictly cap at k <= 15 tags per pin
            const boundedTags = uniqueTags.slice(0, 15);
            if (boundedTags.length < 2) continue;
            validPinCount++;

            for (const tag of boundedTags) {
              tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
            }

            for (let i = 0; i < boundedTags.length; i++) {
              for (let j = i + 1; j < boundedTags.length; j++) {
                const t1 = boundedTags[i] < boundedTags[j] ? boundedTags[i] : boundedTags[j];
                const t2 = boundedTags[i] < boundedTags[j] ? boundedTags[j] : boundedTags[i];
                const key = t1 + '|||' + t2;
                pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
              }
            }
          }

          if (validPinCount === 0 || pairCounts.size === 0) return [];

          const results = [];
          const N = validPinCount;

          for (const [key, count] of pairCounts.entries()) {
            if (count < 2) continue;
            const [tagA, tagB] = key.split('|||');
            const countA = tagCounts.get(tagA) || 1;
            const countB = tagCounts.get(tagB) || 1;
            const lift = Number(((count * N) / (countA * countB)).toFixed(2));
            results.push({
              tagA,
              tagB,
              count,
              lift,
              supportPct: Number(((count / N) * 100).toFixed(1))
            });
          }

          return results.sort((a, b) => b.lift - a.lift).slice(0, 8);
        },

        copySerpVisualBlueprint(pair) {
          if (!pair) return;
          const kw = this.selectedKeyword?.keyword || this.activeKeywordQuery || '';
          const prompt = 'Hyper-detailed Pinterest viral pin aesthetic, combining "' + pair.tagA + '" with "' + pair.tagB + '" for organic search query "' + kw + '". Ultra-high CTR commercial composition, vibrant focal lighting, clean negative space for typography overlay, editorial photography --ar 2:3 --stylize 250';
          this.copyToClipboard(prompt, 'Copied Visual Blueprint Prompt for ' + pair.tagA + ' + ' + pair.tagB + '!');
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
          this.isKeywordsLoading = true;
          try {
            const res = await fetch(this.getApiUrl('/api/keywords'));
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            this.keywords = data.keywords || [];
            this.filterKeywords();
          } catch (err) {
            this.showToast('Failed to load keywords: ' + err.message, 'error');
          } finally {
            this.isKeywordsLoading = false;
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

          // Fetch official 52-week trends asynchronously
          this.fetchTrends(cleanText);

          const match = this.keywords.find(k => 
            k.keyword.toLowerCase() === cleanText ||
            k.keyword.toLowerCase().replace(/\\s+/g, '-') === cleanSlug
          );

          if (match) {
            await this.selectKeyword(match, updateHistory);
          } else {
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

          // Fetch 52-week trends
          this.fetchTrends(kw.keyword);
          this.fetchCurrentKeywordFolders();
          this.fetchDisplacedPins(kw.id);

          const cleanSlug = kw.keyword.trim().toLowerCase().replace(/\\s+/g, '-');
          if (updateHistory) {
            window.history.pushState(null, '', '/keywords/' + encodeURIComponent(cleanSlug));
          }

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

            if (currentReqId !== this.detailRequestId) return;

            this.selectedKeywordDetails = data;

            if (data.status === 'never_crawled') {
              this.rescanKeyword(kw.id, true);
            }
          } catch (err) {
            if (err.name === 'AbortError') return;
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

        async fetchTrends(term, force = false) {
          if (!term) return;
          this.isTrendsLoading = true;
          try {
            const forceParam = force ? '&force=true' : '';
            const [trendsRes, popularRes] = await Promise.allSettled([
              fetch(this.getApiUrl('/api/keywords/trends?term=' + encodeURIComponent(term) + forceParam)),
              fetch(this.getApiUrl('/api/keywords/trends/popular-pins?term=' + encodeURIComponent(term) + forceParam))
            ]);

            let merged = {};
            if (trendsRes.status === 'fulfilled' && trendsRes.value.ok) {
              const tData = await trendsRes.value.json();
              if (tData.success) merged = { ...tData };
            }
            if (popularRes.status === 'fulfilled' && popularRes.value.ok) {
              const pData = await popularRes.value.json();
              if (pData.success && Array.isArray(pData.popular_pins) && pData.popular_pins.length > 0) {
                merged.popular_pins = pData.popular_pins;
              }
              if (pData.success && Array.isArray(pData.collage_images) && pData.collage_images.length > 0 && (!merged.collage_images || merged.collage_images.length === 0)) {
                merged.collage_images = pData.collage_images;
              }
            }

            if (Object.keys(merged).length > 0) {
              this.trendsData = { ...(this.trendsData || {}), ...merged };
            }
          } catch (_) {} finally {
            this.isTrendsLoading = false;
            this.$nextTick(() => { lucide.createIcons(); });
          }
        },

        // Pin Deep Dossier & Trajectory Controls (Image 2 Parity)
        async openPinInspector(pin) {
          if (!pin) return;
          this.activeInspectorPin = { ...pin };
          const list = this.filteredPins;
          this.activeInspectorPinIndex = list.findIndex(p => p.pin_id === pin.pin_id);
          this.dossierData = null;
          this.trajectoryData = null;
          this.isPinDrawerOpen = true;
          this.$nextTick(() => { lucide.createIcons(); });

          if (this.pinInspectorAbortController) {
            this.pinInspectorAbortController.abort();
          }
          this.pinInspectorAbortController = new AbortController();
          const currentReqId = ++this.activePinRequestId;

          await Promise.allSettled([
            this.fetchPinDossier(pin.pin_id, this.selectedKeyword?.id, currentReqId, this.pinInspectorAbortController.signal),
            this.fetchPinTrajectory(pin.pin_id, this.selectedKeyword?.id, this.trajectoryRange, currentReqId, this.pinInspectorAbortController.signal)
          ]);
        },

        closePinInspector() {
          if (this.pinInspectorAbortController) {
            this.pinInspectorAbortController.abort();
            this.pinInspectorAbortController = null;
          }
          this.activePinRequestId++;
          this.isPinDrawerOpen = false;
          this.activeInspectorPin = null;
          this.dossierData = null;
          this.trajectoryData = null;
        },

        async fetchPinDossier(pinId, keywordId, reqId, signal) {
          const cleanPin = String(pinId || '').trim();
          if (!cleanPin) return;
          const currentReqId = reqId || this.activePinRequestId;
          const abortSignal = signal || this.pinInspectorAbortController?.signal;
          if (currentReqId !== this.activePinRequestId) return;
          this.isDossierLoading = true;
          try {
            const kid = keywordId || this.selectedKeyword?.id || '';
            const res = await fetch(this.getApiUrl('/api/keywords/pins/dossier?pin_id=' + encodeURIComponent(cleanPin) + (kid ? '&keyword_id=' + kid : '')), {
              signal: abortSignal
            });
            if (currentReqId !== this.activePinRequestId) return;
            if (res.ok) {
              const data = await res.json();
              if (currentReqId !== this.activePinRequestId) return;
              if (data.success) {
                this.dossierData = data.dossier || data;
              }
            }
          } catch (err) {
            if (err.name === 'AbortError') return;
          } finally {
            if (currentReqId === this.activePinRequestId) {
              this.isDossierLoading = false;
              this.$nextTick(() => { lucide.createIcons(); });
            }
          }
        },

        async fetchPinTrajectory(pinId, keywordId, range, reqId, signal) {
          const cleanPin = String(pinId || '').trim();
          if (!cleanPin) return;
          const currentReqId = reqId || this.activePinRequestId;
          const abortSignal = signal || this.pinInspectorAbortController?.signal;
          if (currentReqId !== this.activePinRequestId) return;
          this.isTrajectoryLoading = true;
          const r = range || this.trajectoryRange || '30d';
          try {
            const kid = keywordId || this.selectedKeyword?.id || '';
            const res = await fetch(this.getApiUrl('/api/keywords/pins/trajectory?pin_id=' + encodeURIComponent(cleanPin) + '&range=' + r + (kid ? '&keyword_id=' + kid : '')), {
              signal: abortSignal
            });
            if (currentReqId !== this.activePinRequestId) return;
            if (res.ok) {
              const data = await res.json();
              if (currentReqId !== this.activePinRequestId) return;
              if (data.success) {
                this.trajectoryData = data;
              }
            }
          } catch (err) {
            if (err.name === 'AbortError') return;
          } finally {
            if (currentReqId === this.activePinRequestId) {
              this.isTrajectoryLoading = false;
              this.$nextTick(() => { lucide.createIcons(); });
            }
          }
        },

        changeTrajectoryRange(range) {
          this.trajectoryRange = range;
          if (this.activeInspectorPin?.pin_id) {
            this.fetchPinTrajectory(this.activeInspectorPin.pin_id, this.selectedKeyword?.id, range, this.activePinRequestId, this.pinInspectorAbortController?.signal);
          }
        },

        async fetchDisplacedPins(keywordId) {
          const kid = keywordId || this.selectedKeyword?.id;
          if (!kid) return;
          this.isDisplacedLoading = true;
          try {
            const statusParam = this.displacedStatusFilter !== 'ALL' ? '&status=' + encodeURIComponent(this.displacedStatusFilter) : '';
            const res = await fetch(this.getApiUrl('/api/keywords/displaced?keyword_id=' + kid + statusParam));
            if (res.ok) {
              const data = await res.json();
              this.displacedPins = data.displaced_pins || data.pins || [];
              this.displacedPinsTotal = data.total || this.displacedPins.length;
            }
          } catch (_) {} finally {
            this.isDisplacedLoading = false;
            this.$nextTick(() => { lucide.createIcons(); });
          }
        },

        getPaceDelta(pin, metric = 'saves') {
          if (!pin) return '';
          const filter = this.growthPaceFilter || '24h';
          if (filter === 'all') return '';

          let val = 0;
          const deltas = pin.metadata?.deltas || pin.deltas || {};
          if (filter === '24h') {
            val = Number(deltas[metric + '_24h'] ?? (metric === 'saves' ? (pin.daily_save_velocity ?? 0) : 0));
          } else if (filter === '3d') {
            val = Number(deltas[metric + '_3d'] ?? (metric === 'saves' ? ((pin.daily_save_velocity || 0) * 3) : 0));
          } else if (filter === '7d') {
            val = Number(deltas[metric + '_7d'] ?? (metric === 'saves' ? ((pin.daily_save_velocity || 0) * 7) : 0));
          }
          if (val > 0) return '+' + this.formatNumber(val);
          if (val < 0) return '-' + this.formatNumber(Math.abs(val));
          return '0';
        },

        getTrajectoryDualSvg(snapshots, width = 640, height = 220) {
          if (!snapshots || snapshots.length === 0) {
            return { isEmpty: true, isSingle: false, savesLine: '', savesArea: '', repinsLine: '', savesMax: 0, repinsMax: 0, points: [] };
          }
          if (snapshots.length === 1) {
            const rawS0 = Number(snapshots[0].save_count);
            const rawR0 = Number(snapshots[0].repin_count);
            const s0Save = Number.isFinite(rawS0) ? rawS0 : 0;
            const s0Repin = Number.isFinite(rawR0) ? rawR0 : 0;
            return {
              isEmpty: false,
              isSingle: true,
              singlePoint: { 
                x: (width / 2).toFixed(1), 
                y: (height / 2).toFixed(1), 
                date: snapshots[0].snapshot_date, 
                saves: s0Save, 
                repins: s0Repin 
              },
              savesLine: '',
              savesArea: '',
              repinsLine: '',
              savesMax: s0Save,
              repinsMax: s0Repin,
              points: []
            };
          }

          const savesVals = snapshots.map(s => {
            const v = Number(s.save_count);
            return Number.isFinite(v) ? v : 0;
          });
          const repinsVals = snapshots.map(s => {
            const v = Number(s.repin_count);
            return Number.isFinite(v) ? v : 0;
          });
          const savesMin = Math.min(...savesVals);
          const savesMax = Math.max(...savesVals, savesMin + 1);
          const savesRange = (savesMax - savesMin) || 1;

          const repinsMin = Math.min(...repinsVals);
          const repinsMax = Math.max(...repinsVals, repinsMin + 1);
          const repinsRange = (repinsMax - repinsMin) || 1;

          const step = width / (snapshots.length - 1);
          const points = snapshots.map((s, i) => {
            const x = (i * step).toFixed(1);
            const sVal = Number.isFinite(Number(s.save_count)) ? Number(s.save_count) : 0;
            const rVal = Number.isFinite(Number(s.repin_count)) ? Number(s.repin_count) : 0;
            const saveY = (height - 30 - ((sVal - savesMin) / savesRange) * (height - 60)).toFixed(1);
            const repinY = (height - 30 - ((rVal - repinsMin) / repinsRange) * (height - 60)).toFixed(1);
            return { x, saveY, repinY, date: s.snapshot_date, saves: sVal, repins: rVal };
          });

          const savesLine = points.map((p, i) => (i === 0 ? 'M' : 'L') + ' ' + p.x + ' ' + p.saveY).join(' ');
          const savesArea = savesLine + ' L ' + width + ' ' + (height - 15) + ' L 0 ' + (height - 15) + ' Z';
          const repinsLine = points.map((p, i) => (i === 0 ? 'M' : 'L') + ' ' + p.x + ' ' + p.repinY).join(' ');

          return { isEmpty: false, isSingle: false, savesLine, savesArea, repinsLine, savesMax, repinsMax, points };
        },

        togglePinSelection(pinId) {
          if (this.selectedPinIds.includes(pinId)) {
            this.selectedPinIds = this.selectedPinIds.filter(id => id !== pinId);
          } else {
            this.selectedPinIds.push(pinId);
          }
        },

        toggleSelectAllPins() {
          const list = this.filteredPins;
          if (this.selectedPinIds.length === list.length) {
            this.selectedPinIds = [];
          } else {
            this.selectedPinIds = list.map(p => p.pin_id);
          }
        },

        isPinSelected(pinId) {
          return this.selectedPinIds.includes(pinId);
        },

        nextInspectorPin() {
          const list = this.filteredPins;
          if (this.activeInspectorPinIndex < list.length - 1) {
            this.activeInspectorPinIndex++;
            this.openPinInspector(list[this.activeInspectorPinIndex]);
          }
        },

        prevInspectorPin() {
          const list = this.filteredPins;
          if (this.activeInspectorPinIndex > 0) {
            this.activeInspectorPinIndex--;
            this.openPinInspector(list[this.activeInspectorPinIndex]);
          }
        },

        getInspectorAnnotations() {
          const raw = (this.dossierData?.annotations && this.dossierData.annotations.length > 0)
            ? this.dossierData.annotations
            : (this.activeInspectorPin?.metadata?.visual_annotations || []);
          return (raw || []).map(t => {
            if (typeof t === 'string') return t;
            if (t && typeof t === 'object') {
              return t.name || t.label || t.display_label || t.term || t.title || '';
            }
            return String(t || '');
          }).filter(Boolean);
        },

        copyAllInspectorTags() {
          const tags = this.getInspectorAnnotations();
          if (tags.length === 0) return;
          this.copyToClipboard(tags.join(', '), 'Copied ' + tags.length + ' Annotated Interests!');
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
          const cleanText = String(text || '').trim();
          if (!cleanText) return;
          if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            navigator.clipboard.writeText(cleanText).then(() => {
              this.showToast(msg, 'success');
            }).catch(() => {
              this.fallbackCopyText(cleanText, msg);
            });
          } else {
            this.fallbackCopyText(cleanText, msg);
          }
        },

        fallbackCopyText(text, msg) {
          try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            const successful = document.execCommand('copy');
            document.body.removeChild(ta);
            if (successful) {
              this.showToast(msg, 'success');
            } else {
              this.showToast('Please copy manually', 'warning');
            }
          } catch (_) {
            this.showToast('Copy not supported on this device', 'error');
          }
        },

        cleanControlChars(str) {
          if (!str) return '';
          return Array.from(String(str))
            .filter(ch => {
              const code = ch.charCodeAt(0);
              if (code < 32 || (code >= 127 && code <= 159)) return false;
              if (code >= 0x200B && code <= 0x200F) return false;
              if (code >= 0x202A && code <= 0x202E) return false;
              return true;
            })
            .join('')
            .replace(/\\s+/g, ' ')
            .trim();
        },

        copySEOFormula() {
          const kw = this.cleanControlChars(this.selectedKeyword?.keyword || this.activeKeywordQuery || '');
          if (!kw) return;
          const guides = this.selectedKeywordDetails?.guides || [];
          const topModifiers = guides
            .slice(0, 3)
            .map(g => this.cleanControlChars(g.display_label || g.term))
            .filter(Boolean)
            .join(' ');
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

        researchKeywordTag(tag) {
          this.closePinInspector();
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

        getTrendsAreaPath(points, width = 800, height = 180) {
          if (!points || points.length < 2) return { line: '', area: '' };
          const min = 0;
          const max = 100;
          const range = 100;
          const step = width / (points.length - 1);

          const coords = points.map((p, i) => {
            const x = (i * step).toFixed(1);
            const y = (height - (Math.min(100, Math.max(0, Number(p || 0))) / range) * (height - 20) - 10).toFixed(1);
            return { x, y };
          });

          const line = coords.map((c, i) => (i === 0 ? 'M' : 'L') + ' ' + c.x + ' ' + c.y).join(' ');
          const area = line + ' L ' + width + ' ' + height + ' L 0 ' + height + ' Z';
          return { line, area };
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
        },

        // =========================================================================
        // CAMPAIGN FOLDERS & CROSSOVER MATRIX ENGINE METHODS
        // =========================================================================

        async fetchFolders() {
          try {
            const res = await fetch(this.getApiUrl('/api/keywords/folders'));
            if (res.ok) {
              const data = await res.json();
              this.folders = data.folders || [];
              if (this.folders.length > 0 && !this.activeFolder) {
                this.activeFolder = this.folders[0];
                if (this.activeTab === 'crossover') {
                  this.fetchFolderCrossover(this.activeFolder.id);
                }
              }
            }
          } catch (_) {}
        },

        async selectFolder(folder) {
          if (!folder) return;
          this.activeFolder = folder;
          this.activeTab = 'crossover';
          await this.fetchFolderCrossover(folder.id);
        },

        openCrossoverTab() {
          this.activeTab = 'crossover';
          if (this.activeFolder) {
            if (!this.crossoverData || this.crossoverData.folder?.id !== this.activeFolder.id) {
              this.fetchFolderCrossover(this.activeFolder.id);
            }
          } else if (this.folders.length > 0) {
            this.selectFolder(this.folders[0]);
          }
        },

        async fetchFolderCrossover(folderId) {
          if (!folderId) return;
          this.isCrossoverLoading = true;
          try {
            const res = await fetch(this.getApiUrl('/api/keywords/folders/crossover?folder_id=' + folderId));
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            this.crossoverData = data.crossover || null;
          } catch (err) {
            this.showToast('Error loading crossover matrix: ' + err.message, 'error');
          } finally {
            this.isCrossoverLoading = false;
            this.$nextTick(() => { lucide.createIcons(); });
          }
        },

        openCreateFolderModal() {
          this.newFolder = { name: '', description: '', color: '#ec4899' };
          this.isCreateFolderModalOpen = true;
        },

        async saveNewCampaignFolder() {
          if (!this.newFolder.name?.trim()) return;
          try {
            const res = await fetch(this.getApiUrl('/api/keywords/folders'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(this.newFolder)
            });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            this.showToast('Campaign folder created!', 'success');
            this.isCreateFolderModalOpen = false;
            await this.fetchFolders();
            if (data.folder) {
              this.selectFolder(data.folder);
              this.activeTab = 'crossover';
            }
          } catch (err) {
            this.showToast('Error creating folder: ' + err.message, 'error');
          }
        },

        async deleteCampaignFolder(folderId) {
          if (!confirm('Are you sure you want to delete this campaign folder? Keywords will remain tracked.')) return;
          try {
            const res = await fetch(this.getApiUrl('/api/keywords/folders?id=' + folderId), { method: 'DELETE' });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            this.showToast('Folder deleted.', 'info');
            if (this.activeFolder?.id === folderId) {
              this.activeFolder = null;
              this.crossoverData = null;
            }
            await this.fetchFolders();
          } catch (err) {
            this.showToast('Delete error: ' + err.message, 'error');
          }
        },

        async fetchCurrentKeywordFolders() {
          if (!this.selectedKeyword?.id) {
            this.currentKeywordFolders = [];
            return;
          }
          try {
            const res = await fetch(this.getApiUrl('/api/keywords/folders/by-keyword?keyword_id=' + this.selectedKeyword.id));
            if (res.ok) {
              const data = await res.json();
              this.currentKeywordFolders = data.folders || [];
            }
          } catch (_) {}
        },

        isKeywordInFolder(folderId) {
          return this.currentKeywordFolders.some(f => f.id === folderId);
        },

        async toggleCurrentKeywordFolder(folderId) {
          if (!this.selectedKeyword?.id) return;
          const inFolder = this.isKeywordInFolder(folderId);
          try {
            if (inFolder) {
              await fetch(this.getApiUrl('/api/keywords/folders/items'), {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folder_id: folderId, keyword_id: this.selectedKeyword.id })
              });
              this.showToast('Removed from folder', 'info');
            } else {
              await fetch(this.getApiUrl('/api/keywords/folders/items'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folder_id: folderId, keyword_id: this.selectedKeyword.id })
              });
              this.showToast('Added to folder!', 'success');
            }
            await this.fetchCurrentKeywordFolders();
            await this.fetchFolders();
            if (this.activeFolder?.id === folderId) {
              await this.fetchFolderCrossover(folderId);
            }
          } catch (err) {
            this.showToast('Folder update error: ' + err.message, 'error');
          }
        },

        async openAddKeywordsModal() {
          if (!this.activeFolder) return;
          this.folderKeywordSearch = '';
          try {
            const res = await fetch(this.getApiUrl('/api/keywords/folders?id=' + this.activeFolder.id));
            if (res.ok) {
              const data = await res.json();
              this.selectedFolderKeywordIds = (data.folder?.items || []).map(i => i.keyword_id);
            } else {
              this.selectedFolderKeywordIds = [];
            }
          } catch (_) {
            this.selectedFolderKeywordIds = [];
          }
          this.isAddKeywordsModalOpen = true;
        },

        isKeywordSelected(kid) {
          return this.selectedFolderKeywordIds.includes(kid);
        },

        toggleKeywordSelection(kid) {
          if (this.selectedFolderKeywordIds.includes(kid)) {
            this.selectedFolderKeywordIds = this.selectedFolderKeywordIds.filter(id => id !== kid);
          } else {
            this.selectedFolderKeywordIds.push(kid);
          }
        },

        async commitFolderKeywords() {
          if (!this.activeFolder) return;
          try {
            const res = await fetch(this.getApiUrl('/api/keywords/folders/items'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                folder_id: this.activeFolder.id,
                keyword_ids: this.selectedFolderKeywordIds
              })
            });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            this.showToast('Folder keywords updated!', 'success');
            this.isAddKeywordsModalOpen = false;
            await this.fetchFolders();
            await this.fetchFolderCrossover(this.activeFolder.id);
          } catch (err) {
            this.showToast('Error saving keywords: ' + err.message, 'error');
          }
        },

        copyAllUniversalTags() {
          const tags = this.crossoverData?.topic_cluster_blueprint?.universal_tag_blueprint || 
                       (this.crossoverData?.tag_bridges || []).slice(0, 15).map(t => t.tag).join(', ');
          if (!tags) return;
          this.copyToClipboard(tags, 'Copied Universal Tag Blueprint to clipboard!');
        },

        exportClusterBlueprintCsv() {
          const blueprint = this.crossoverData?.topic_cluster_blueprint;
          if (!blueprint || !Array.isArray(blueprint.csv_rows) || blueprint.csv_rows.length === 0) {
            this.showToast('No blueprint rows available for export', 'error');
            return;
          }
          const rows = blueprint.csv_rows;
          const headers = Object.keys(rows[0]);
          const csvContent = [
            headers.map(h => '"' + h + '"').join(','),
            ...rows.map(r => headers.map(h => '"' + String(r[h] || '').replace(/"/g, '""') + '"').join(','))
          ].join('\\r\\n');

          const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          const safeName = (this.activeFolder?.name || 'cluster_blueprint').toLowerCase().replace(/[^a-z0-9]+/g, '_');
          a.download = 'pinterest_cluster_' + safeName + '.csv';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          this.showToast('1-Click CSV Blueprint downloaded successfully!', 'success');
        }
      };
    }
  </script>
</body>
</html>`;
}
